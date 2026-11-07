#!/usr/bin/env node
'use strict';
/**
 * 2026-11-07 업로드 속도:
 *  ① 밀린 사진이 마킹·건물 정보 올리기를 막지 않는다(시간 넘으면 뒤에서 계속, 끝나면 층을 다시 올림)
 *  ② 느린 사진 한 장이 다음 사진 시작을 막지 않는다
 *  ③ 전송이 멈춘 업로드·응답 없는 쓰기를 끊되, 그것 때문에 사진이 「멈춤」이 되지 않는다
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
const R = require('../js/core/sync-retry.js');
const SA = require('../js/core/firebase-storage-assets.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sandbox(extra, code) {
    const ctx = Object.assign({ Promise, setTimeout, clearTimeout, Date, Set, Array, Error, console: { info() {}, warn() {} } }, extra);
    vm.createContext(ctx);
    vm.runInContext(code, ctx);
    return ctx;
}

async function testPool() {
    const ctx = sandbox({ yieldToUiGesture: async () => {} },
        'const PHOTO_STORAGE_UPLOAD_MAX = 2;\n' + extractFunction(app, 'async function runPhotoJobsInBatches(') + '\nthis.run = runPhotoJobsInBatches;');
    const started = [];
    const release = {};
    const p = ctx.run(['slow', 'fast', 'next'], async (id) => {
        started.push(id);
        if (id === 'slow') await new Promise((r) => { release.slow = r; });
    });
    await sleep(20);
    assert.deepStrictEqual(started, ['slow', 'fast', 'next'], '느린 사진을 기다리지 않고 다음 사진을 시작');
    release.slow();
    await p;
    await ctx.run([], async () => assert.fail('빈 목록'));
}

function phaseCtx(state) {
    const code = 'const PHOTO_SYNC_WAIT_MS = 30;\nlet _photoDrain = null;\n'
        + extractFunction(app, 'async function runPhotoPhaseWithinBudget(') + '\n'
        + extractFunction(app, 'function finishDetachedPhotoDrain(') + '\n'
        + 'this.run = runPhotoPhaseWithinBudget; this.active = () => _photoDrain;\n'
        + 'this.setInFlight = (v) => { _syncInFlight = v; };\nvar _syncInFlight = false;';
    return sandbox({
        sleepMs: sleep,
        markFloorKeyDirty: (k) => { state.dirty.push(k); },
        syncProgressFail: () => {},
        isSyncParked: () => !!state.parked,
        scheduleSyncRetryAfterError: (e) => { state.retry.push(e); },
        scheduleSyncToFirebase: (o) => { state.sync.push(o); }
    }, code);
}
const newState = () => ({ dirty: [], retry: [], sync: [] });

async function testBudget() {
    // 시간 안에 끝나면 예전과 같다
    let st = newState();
    let ctx = phaseCtx(st);
    const quick = await ctx.run(['f1'], async () => new Set(['f1']));
    assert.deepStrictEqual(Array.from(quick), ['f1'], '실패한 층을 돌려줌');
    assert.deepStrictEqual(st.dirty, [], '동기화가 직접 처리');
    assert.strictEqual(ctx.active(), null);
    await assert.rejects(ctx.run(['f1'], async () => { throw new Error('boom'); }), /boom/, '시간 안의 오류는 동기화로 전달');

    // 시간을 넘기면 층 쓰기가 먼저 진행되고, 끝난 뒤 층을 다시 올린다
    st = newState();
    ctx = phaseCtx(st);
    let finish;
    let calls = 0;
    const slow = () => { calls += 1; return new Promise((r) => { finish = r; }); };
    const t0 = Date.now();
    const first = await ctx.run(['f1'], slow);
    assert.strictEqual(first.size, 0, '실패 없음으로 넘어가 층을 쓴다');
    assert.ok(Date.now() - t0 < 500, '사진을 기다리지 않음');
    assert.ok(ctx.active(), '사진은 뒤에서 계속');
    assert.deepStrictEqual(st.dirty, [], '끝나기 전에는 다시 올리지 않음');

    // 뒤에서 도는 중엔 사진을 겹쳐 시작하지 않고 층만 맡는다
    const second = await ctx.run(['f2'], slow);
    assert.strictEqual(second.size, 0);
    assert.strictEqual(calls, 1, '겹쳐 시작 안 함');

    finish(new Set());
    await sleep(5);
    assert.strictEqual(ctx.active(), null);
    assert.deepStrictEqual(st.dirty.slice().sort(), ['f1', 'f2'], '맡은 층을 다시 표시');
    assert.strictEqual(st.sync.length, 1, '한 번 더 동기화');
    assert.strictEqual(st.retry.length, 0);

    // 뒤에서 실패: 백오프 재시도(곧바로 다시 돌지 않음)
    st = newState();
    ctx = phaseCtx(st);
    await ctx.run(['f1'], slow);
    finish(new Set(['f1']));
    await sleep(5);
    assert.strictEqual(st.retry.length, 1, '백오프로 재시도');
    assert.strictEqual(st.retry[0].code, 'partial-failure');
    assert.strictEqual(st.sync.length, 0);

    // 동기화 중에 끝나면 표시가 층 쓰기에 지워지지 않게 끝난 뒤 표시
    st = newState();
    ctx = phaseCtx(st);
    await ctx.run(['f1'], slow);
    ctx.setInFlight(true);
    finish(new Set());
    await sleep(5);
    assert.deepStrictEqual(st.dirty, [], '동기화 중엔 표시 안 함');
    ctx.setInFlight(false);
    await sleep(1100);
    assert.deepStrictEqual(st.dirty, ['f1'], '동기화 뒤 표시');

    // 멈춘 동기화면 자동으로 다시 돌리지 않음(층 표시는 남김)
    st = newState();
    st.parked = true;
    ctx = phaseCtx(st);
    await ctx.run(['f1'], slow);
    finish(new Set());
    await sleep(5);
    assert.deepStrictEqual(st.dirty, ['f1']);
    assert.strictEqual(st.sync.length + st.retry.length, 0);
}

function fakeTask() {
    const t = {
        snapshot: { metadata: {} },
        canceled: 0,
        cancel() { t.canceled += 1; if (t.onErr) t.onErr({ code: 'storage/canceled' }); },
        on(_ev, next, err, done) { t.next = next; t.onErr = err; t.done = done; }
    };
    return t;
}

async function testStallGuard() {
    const fast = { stallMs: 40, checkMs: 5 };
    let t = fakeTask();
    await assert.rejects(SA.waitForUploadWithStallGuard(t, fast), (e) => e.code === 'upload-stalled');
    assert.strictEqual(t.canceled, 1, '멈추면 취소');

    t = fakeTask();
    let p = SA.waitForUploadWithStallGuard(t, fast);
    for (let i = 1; i <= 5; i++) {
        await sleep(15);
        t.next({ bytesTransferred: i * 100 });
    }
    t.done();
    assert.strictEqual(await p, t.snapshot, '느려도 진행되면 끊지 않음');
    assert.strictEqual(t.canceled, 0);

    t = fakeTask();
    p = SA.waitForUploadWithStallGuard(t, fast);
    t.onErr({ code: 'storage/unauthorized' });
    await assert.rejects(p, (e) => e.code === 'storage/unauthorized', '다른 오류는 그대로');

    // 화면이 꺼진 동안은 멈춤으로 세지 않는다
    global.document = { visibilityState: 'hidden' };
    try {
        t = fakeTask();
        p = SA.waitForUploadWithStallGuard(t, fast);
        await sleep(100);
        assert.strictEqual(t.canceled, 0, '화면 꺼짐');
        t.done();
        await p;
    } finally {
        delete global.document;
    }
    const plain = { snapshot: 1 };
    assert.strictEqual(await SA.waitForUploadWithStallGuard(plain), plain, '.on 없는 대역은 그대로');
}

async function testWriteTimeout() {
    const ctx = sandbox({},
        'const FS_WRITE_TIMEOUT_MS = 30;\nlet _fsWriteChain = Promise.resolve();\nlet _fsWritePausedUntil = 0;\n'
        + extractFunction(app, 'function withFirestoreWriteTimeout(') + '\n'
        + extractFunction(app, 'function enqueueFirestoreWrite(') + '\nthis.q = enqueueFirestoreWrite;');
    const order = [];
    const hung = ctx.q(() => new Promise(() => {}));
    const next = ctx.q(async () => { order.push('next'); return 'ok'; });
    await assert.rejects(hung, (e) => e.code === 'write-timeout', '응답 없는 쓰기는 시간 초과');
    assert.strictEqual(await next, 'ok', '뒤의 쓰기가 막히지 않음');
    assert.strictEqual(await ctx.q(async () => 7, 1000), 7, '정상 쓰기');
    await assert.rejects(ctx.q(async () => { throw new Error('x'); }), /x/, '오류는 그대로');

    const chunk = extractFunction(app, 'async function writeChunkedPdfToDocRef(');
    assert.ok(chunk.indexOf("e.code === 'write-timeout') throw e") < chunk.indexOf("chunkStatus: 'failed'"), '시간 초과는 failed로 적지 않음');
}

function testTrackerNotParkedByStall() {
    const store = {};
    const tracker = R.createItemTracker({ storage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } }, storageKey: () => 'k', maxAttempts: 5, baseMs: 0 });
    ['upload-stalled', 'write-timeout'].forEach((code) => {
        assert.strictEqual(R.classify({ code }), 'transient', code);
        for (let i = 0; i < 20; i++) {
            const r = tracker.fail('p', { code, message: 'x' });
            assert.strictEqual(r.parked, false, '신호 문제로는 멈추지 않음');
        }
    });
    assert.ok(tracker.shouldTry('p'));
    assert.strictEqual(tracker.parked().length, 0);
    let last;
    for (let i = 0; i < 5; i++) last = tracker.fail('p', { code: 'unknown', message: 'x' });
    assert.strictEqual(last.parked, true, '다른 실패는 예전처럼 5번에서 멈춤');
}

function testWiring() {
    const sync = extractFunction(app, 'async function syncStateToFirebase(');
    assert.ok(sync.indexOf('runPhotoPhaseWithinBudget(') > 0 && sync.indexOf('runPhotoPhaseWithinBudget(') < sync.indexOf('await writeFloorSyncBundle(floorBldg, code);'), '동기화 사진 단계에 제한');
    assert.ok(extractFunction(app, 'async function runOfflineReturnSync(').includes('runPhotoPhaseWithinBudget('), '오프라인 복귀도 층 올리기를 막지 않음');
}

(async () => {
    await testPool();
    await testBudget();
    await testStallGuard();
    await testWriteTimeout();
    testTrackerNotParkedByStall();
    testWiring();
    console.log('test-sync-photo-budget: ok');
})().catch((e) => { console.error(e); process.exit(1); });
