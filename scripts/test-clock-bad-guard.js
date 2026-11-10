#!/usr/bin/env node
'use strict';
/**
 * 2026-11-10 날짜가 크게 틀린 기기 방어.
 * - 서버와 1일 넘게 다르면 「틀림」으로 판정해 동기화 쓰기를 멈춘다(예전엔 보정만 포기하고 그대로 동기화).
 * - 휴지통 30일 만료는 서버 시계 보정값 기준, 자동 영구 삭제 직전에 서버 시계를 다시 확인(틀림·확인 실패면 미룸).
 * - 휴지통에 넣은 날짜를 못 읽으면 만료로 보지 않는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn.js');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
// 기준값은 앱 코드에서 읽는다(숫자를 테스트에 따로 적어 두면 앱만 바뀌어도 통과해 버린다)
const MAX_OFFSET_MS = Function('return ' + app.match(/const BSA_CLOCK_MAX_OFFSET_MS = ([0-9 *]+);/)[1])();
assert.strictEqual(MAX_OFFSET_MS, DAY, '기준은 1일');
const fns = [
    'function bsaSyncNow(', 'function bsaClockStatus(', 'function classifyClockOffset(', 'function noteClockMeasureFailed(',
    'async function measureServerClockOffset(', 'async function isDeviceClockBadForSync(', 'async function checkClockBeforePurge(',
    'function getBuildingTrashRemainingMs(', 'window.purgeExpiredBuildingTrash = async function('
].map((h) => extractFunction(app, h)).join('\n');

/** 실행 환경 하나 — env.serverSkewMs: 서버 시각 − 기기 시각, env.fetchMode: 'ok' | 'throw' | 'nodate' */
function makeApp(env) {
    const window = { __bsaClockOffsetMs: 0, __bsaClockBadMs: 0, BSA: { errorLog: { record: (r) => env.logs.push(r) } },
        showToast: () => {}, permanentlyDeleteBuilding: async (b) => { env.purged.push(b.id); return true; } };
    const fetch = async () => {
        env.fetches++;
        if (env.fetchMode === 'throw') throw new Error('Failed to fetch');
        if (env.fetchMode === 'nodate') return { ok: true, headers: { get: () => null } };
        return { ok: true, headers: { get: (k) => (k === 'Date' ? new Date(Date.now() + env.serverSkewMs).toUTCString() : null) } };
    };
    const body = `
        let _bsaClockMeasuredAt = 0;
        const BSA_CLOCK_MAX_OFFSET_MS = ${MAX_OFFSET_MS};
        const BUILDING_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
        let _bsaClockStatus = 'unknown';
        let _bsaClockBadLogged = false;
        let _bsaClockRecheckAt = 0;
        function renderClockBadBanner(show) { env.banner = !!show; }
        function listTrashedBuildings() { return env.trash; }
        ${fns}
        return {
            window, classifyClockOffset, measureServerClockOffset, isDeviceClockBadForSync, checkClockBeforePurge,
            getBuildingTrashRemainingMs, status: bsaClockStatus, allowRecheck: () => { _bsaClockRecheckAt = 0; },
            purge: () => window.purgeExpiredBuildingTrash()
        };`;
    return new Function('env', 'window', 'fetch', 'navigator', 'location', 'localStorage', 'console', body)(
        env, window, fetch, { onLine: true }, { protocol: 'https:' }, { setItem: () => {}, getItem: () => null },
        { warn: () => {}, info: () => {}, error: () => {} });
}
function newEnv(extra) {
    return Object.assign({ serverSkewMs: 0, fetchMode: 'ok', fetches: 0, logs: [], purged: [], trash: [], banner: false }, extra || {});
}
const ago = (ms) => new Date(Date.now() - ms).toISOString();

(async () => {
    // 1) 분류
    {
        const A = makeApp(newEnv());
        assert.deepStrictEqual(A.classifyClockOffset(500), { status: 'ok', offset: 0, badMs: 0 }, '2초 안쪽은 보정 안 함');
        assert.strictEqual(A.classifyClockOffset(-3 * HOUR).offset, -3 * HOUR, '1일 안쪽은 보정');
        assert.strictEqual(A.classifyClockOffset(23 * HOUR).status, 'ok', '23시간은 보정 범위');
        assert.strictEqual(A.classifyClockOffset(-25 * HOUR).status, 'bad', '1일 넘으면 틀림');
        assert.strictEqual(A.classifyClockOffset(40 * DAY, true).status, 'bad', '느린 응답이어도 7일 넘는 차이는 판정');
        assert.strictEqual(A.classifyClockOffset(5000, true).status, 'fail', '느린 응답은 정밀 보정에 안 씀');
        assert.strictEqual(A.classifyClockOffset(NaN).status, 'fail');
    }
    // 2) 날짜가 40일 앞선 기기: 동기화 멈춤 + 안내 띠 + 오류 기록 1번, 날짜를 맞추면 풀림
    {
        const env = newEnv({ serverSkewMs: -40 * DAY });
        const A = makeApp(env);
        assert.strictEqual(await A.isDeviceClockBadForSync(), true, '틀린 기기는 쓰지 않음');
        assert.ok(env.banner, '안내 띠');
        assert.ok(A.window.__bsaClockBadMs < -39 * DAY);
        assert.strictEqual(A.window.__bsaClockOffsetMs, 0, '틀린 값으로 보정하지 않음');
        assert.strictEqual(env.logs.length, 1);
        assert.strictEqual(env.logs[0].kind, 'clock-bad');
        // 30초 안에는 다시 재지 않고 계속 막는다
        const n = env.fetches;
        assert.strictEqual(await A.isDeviceClockBadForSync(), true);
        assert.strictEqual(env.fetches, n, '30초에 한 번만 다시 잼');
        // 다시 쟀는데 인터넷이 안 되면 — 틀림 그대로(풀지 않음)
        env.fetchMode = 'throw'; A.allowRecheck();
        assert.strictEqual(await A.isDeviceClockBadForSync(), true, '못 재면 틀림 그대로');
        // 날짜를 맞춤
        env.fetchMode = 'ok'; env.serverSkewMs = 0; A.allowRecheck();
        assert.strictEqual(await A.isDeviceClockBadForSync(), false, '맞추면 저절로 풀림');
        assert.strictEqual(env.banner, false, '안내 띠 사라짐');
        assert.strictEqual(A.window.__bsaClockBadMs, 0);
        assert.strictEqual(env.logs.length, 1, '오류 기록은 한 번만');
    }
    // 3) 처음에 못 재면(오프라인·느림) 막지 않는다 — 예전과 같음, 그리고 동기화마다 기다리지 않는다
    {
        const env = newEnv({ fetchMode: 'throw' });
        const A = makeApp(env);
        assert.strictEqual(await A.isDeviceClockBadForSync(), false);
        assert.strictEqual(A.status(), 'fail');
        const n = env.fetches;
        assert.strictEqual(await A.isDeviceClockBadForSync(), false);
        assert.strictEqual(env.fetches, n, '못 잰 뒤에는 동기화마다 다시 기다리지 않음(10분 주기 측정이 이어받음)');
    }
    // 4) 휴지통: 정상 시계 + 31일 지난 건물 → 자동 영구 삭제
    {
        const env = newEnv({ trash: [{ id: 'old', trashedAt: ago(31 * DAY) }, { id: 'new', trashedAt: ago(5 * DAY) }] });
        const A = makeApp(env);
        assert.strictEqual(await A.purge(), 1);
        assert.deepStrictEqual(env.purged, ['old']);
    }
    // 5) 휴지통: 날짜가 40일 앞선 기기 → 5일 전에 버린 건물이 「만료」로 보여도 지우지 않는다
    {
        const env = newEnv({ serverSkewMs: -40 * DAY, trash: [{ id: 'recent', trashedAt: ago(45 * DAY) }] });   // 기기 기준 45일 전 = 실제 5일 전
        const A = makeApp(env);
        assert.strictEqual(await A.purge(), 0, '틀린 기기는 자동 영구 삭제 안 함');
        assert.deepStrictEqual(env.purged, []);
    }
    // 6) 휴지통: 서버 시계를 확인하지 못하면 이번에는 미룬다
    {
        const env = newEnv({ fetchMode: 'throw', trash: [{ id: 'old', trashedAt: ago(31 * DAY) }] });
        const A = makeApp(env);
        assert.strictEqual(await A.purge(), 0, '확인 실패 → 미룸');
        env.fetchMode = 'ok';
        assert.strictEqual(await A.purge(), 1, '다음에 확인되면 지움');
    }
    // 7) 휴지통: 기기가 12시간 앞섬(보정 범위) → 실제로는 30일이 안 된 건물은 아직 지우지 않는다
    {
        const env = newEnv({ serverSkewMs: -12 * HOUR, trash: [{ id: 'd29', trashedAt: ago(30 * DAY + 6 * HOUR) }] });
        const A = makeApp(env);
        assert.strictEqual(await A.purge(), 0, '보정값 기준으로는 아직 30일 전');
        assert.ok(A.getBuildingTrashRemainingMs(env.trash[0]) > 0);
    }
    // 8) 휴지통에 넣은 날짜를 못 읽으면 만료가 아니다
    {
        const A = makeApp(newEnv());
        assert.ok(A.getBuildingTrashRemainingMs({ trashedAt: '날짜아님' }) > 0);
        assert.ok(A.getBuildingTrashRemainingMs({ trashedAt: ago(31 * DAY) }) <= 0);
    }
    // 9) 잴 수 없는 환경(Date 머리말 없는 호스트): 막지 않고, 휴지통도 예전처럼 동작
    {
        const env = newEnv({ fetchMode: 'nodate', trash: [{ id: 'old', trashedAt: ago(31 * DAY) }] });
        const A = makeApp(env);
        assert.strictEqual(await A.isDeviceClockBadForSync(), false);
        assert.strictEqual(A.status(), 'na');
        assert.strictEqual(await A.purge(), 1);
    }
    // 10) 앱 연결: 동기화는 옛 버전 확인 뒤·올리기 표시 전에 날짜를 본다
    {
        const sync = extractFunction(app, 'async function syncStateToFirebase(');
        const iGate = sync.indexOf('await refreshAppVersionGate(false)');
        const iClock = sync.indexOf('await isDeviceClockBadForSync()');
        const iFlight = sync.indexOf('_syncInFlight = true');
        assert.ok(iGate >= 0 && iClock > iGate && iFlight > iClock, '동기화 시작 순서');
    }
    console.log('test-clock-bad-guard: ok');
})().catch((e) => { console.error(e); process.exit(1); });
