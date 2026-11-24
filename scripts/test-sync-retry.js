'use strict';
/** 2026-10-20 끝없는 올리기 재시도 방지 — js/core/sync-retry.js + app.js 연결 확인 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const R = require(path.join(root, 'js', 'core', 'sync-retry.js'));

function memStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// 분류
assert.strictEqual(R.classify({ code: 'permission-denied' }), 'permanent');
assert.strictEqual(R.classify({ message: 'Missing or insufficient permissions.' }), 'permanent');
assert.strictEqual(R.classify({ code: 'not-found' }), 'permanent');
assert.strictEqual(R.classify({ code: 'invalid-argument' }), 'permanent');
assert.strictEqual(R.classify({ code: 'storage/unauthorized' }), 'permanent');
assert.strictEqual(R.classify({ code: 'missing-local-blob' }), 'permanent');
assert.strictEqual(R.classify({ message: 'Document exceeds the maximum allowed size of 1,048,576 bytes' }), 'permanent');
assert.strictEqual(R.classify({ code: 'resource-exhausted' }), 'quota');
assert.strictEqual(R.classify({ code: 'storage/quota-exceeded' }), 'quota');
assert.strictEqual(R.classify({ code: 'unavailable' }), 'transient');
assert.strictEqual(R.classify(new Error('network error')), 'transient');

// 백오프: 지수·상한·지터(0.5~1.0배)
for (let n = 0; n < 12; n++) {
    const hi = R.backoffMs(n, { baseMs: 1000, capMs: 60000, random: () => 1 });
    const lo = R.backoffMs(n, { baseMs: 1000, capMs: 60000, random: () => 0 });
    const raw = Math.min(60000, 1000 * Math.pow(2, n));
    assert.strictEqual(hi, raw);
    assert.ok(lo >= 500 && lo <= raw, 'jitter low ' + lo);
}
assert.ok(R.backoffMs(3, { baseMs: 1000, capMs: 60000, random: () => 1 }) > R.backoffMs(1, { baseMs: 1000, capMs: 60000, random: () => 1 }));

// 동기화 루프 시뮬레이션: 가짜 시계 + 예전 앱처럼 온라인/포커스/틱 트리거가 쉴 새 없이 들어와도
function simulate(errFactory, hours, opts) {
    let now = 0;
    const storage = (opts && opts.storage) || memStorage();
    const mk = () => R.createGate({ storage, storageKey: 'g', maxAttempts: 6, baseMs: 3500, capMs: 600000, quotaMinMs: 120000, now: () => now, random: () => 0.5 });
    let gate = mk();
    let attempts = 0;
    let timerAt = null;
    const attempt = () => {
        attempts++;
        const e = errFactory(attempts);
        if (!e) { gate.ok(); return; }
        const r = gate.fail(e);
        if (!r.parked) timerAt = now + r.delayMs;
    };
    const end = hours * 3600e3;
    const delays = [];
    let lastAttemptAt = null;
    while (now < end) {
        now += 1000;   // 1초마다 온라인·포커스·틱 이벤트
        if (opts && opts.reloadEvery && now % opts.reloadEvery === 0) gate = mk();   // 새로고침
        if (timerAt != null && now >= timerAt) { timerAt = null; if (lastAttemptAt != null) delays.push(now - lastAttemptAt); lastAttemptAt = now; attempt(); continue; }
        if (timerAt == null && gate.autoAllowed() && attempts === 0) { lastAttemptAt = now; attempt(); }
        else if (gate.autoAllowed() && timerAt == null && !gate.isParked() && attempts > 0) { /* 성공 상태 — 할 일 없음 */ }
    }
    return { attempts, parked: gate.isParked(), delays, gate };
}

// 영구 오류: 1번 시도하고 멈춤(자동 재시도 없음)
let s = simulate(() => ({ code: 'permission-denied' }), 24);
assert.strictEqual(s.attempts, 1, 'permanent attempts ' + s.attempts);
assert.ok(s.parked);
s = simulate(() => ({ code: 'storage/object-not-found' }), 24);
assert.strictEqual(s.attempts, 1);

// 일시 오류가 계속: 최대 6번 → 멈춤. 간격은 점점 길어짐(백오프)
s = simulate(() => ({ code: 'unavailable' }), 24);
assert.strictEqual(s.attempts, 6, 'transient attempts ' + s.attempts);
assert.ok(s.parked);
for (let i = 1; i < s.delays.length; i++) assert.ok(s.delays[i] > s.delays[i - 1], 'backoff grows ' + s.delays);
// 새로고침해도 처음부터 다시 세지 않는다(기기 저장소)
s = simulate(() => ({ code: 'unavailable' }), 24, { reloadEvery: 60000 });
assert.ok(s.attempts <= 6, 'reload attempts ' + s.attempts);

// 일시 오류 2번 후 성공: 멈추지 않고 실패 수 초기화
s = simulate((n) => (n <= 2 ? { code: 'unavailable' } : null), 1);
assert.strictEqual(s.attempts, 3);
assert.ok(!s.parked);
assert.strictEqual(s.gate.state().fails, 0);

// 할당량: 최소 2분 쉼
{
    let now = 0;
    const g = R.createGate({ storage: memStorage(), storageKey: 'q', now: () => now, random: () => 0 });
    const r = g.fail({ code: 'resource-exhausted' });
    assert.ok(r.delayMs >= 120000);
    assert.ok(!g.autoAllowed());
    now += r.delayMs;
    assert.ok(g.autoAllowed());
}

// 멈춤 → 「다시 시도」(unpark)로만 풀림, 데이터는 건드리지 않음
{
    const g = R.createGate({ storage: memStorage(), storageKey: 'u' });
    g.fail({ code: 'permission-denied' });
    assert.ok(g.isParked() && !g.autoAllowed());
    g.unpark();
    assert.ok(!g.isParked() && g.autoAllowed());
}

// 사진 항목: 영구 오류는 바로 멈춤, 일시 오류는 5번까지, 성공하면 지움, 멈춘 항목은 남아 있음(복구 가능)
{
    const st = memStorage();
    const t = R.createItemTracker({ storage: st, storageKey: 'p', maxAttempts: 5, baseMs: 0 });
    assert.ok(t.fail('a', { code: 'storage/unauthorized' }).parked);
    assert.ok(!t.shouldTry('a'));
    let tries = 0;
    for (let i = 0; i < 50; i++) { if (t.shouldTry('b')) { tries++; t.fail('b', { code: 'unavailable' }); } }
    assert.strictEqual(tries, 5);
    t.fail('c', { code: 'unavailable' }); t.ok('c');
    assert.ok(t.shouldTry('c'));
    const t2 = R.createItemTracker({ storage: st, storageKey: 'p', maxAttempts: 5 });   // 새로고침
    assert.deepStrictEqual(t2.parked().map((x) => x.id).sort(), ['a', 'b']);
    t2.unparkAll();
    assert.ok(t2.shouldTry('a') && t2.shouldTry('b'));
}

// 2026-11-24 인터넷 복귀: 통신 실패로 멈춘 사진·대기는 풀고, 진짜 오류(권한·원본 없음·한도)는 그대로
{
    assert.notStrictEqual(R.classify({ code: 'storage/retry-limit-exceeded' }), 'quota', '약한 신호는 한도가 아님');
    assert.ok(R.isNetworkError({ code: 'storage/retry-limit-exceeded' }));
    assert.ok(R.isNetworkError(new TypeError('Failed to fetch')));
    assert.ok(!R.isNetworkError({ code: 'permission-denied' }));
    const st = memStorage();
    const t = R.createItemTracker({ storage: st, storageKey: 'p', maxAttempts: 5, baseMs: 0 });
    for (let i = 0; i < 20; i++) assert.ok(!t.fail('weak', { code: 'storage/retry-limit-exceeded' }).parked, '약한 신호로는 사진이 멈추지 않음');
    for (let i = 0; i < 5; i++) t.fail('net', { code: 'unavailable' });
    t.fail('perm', { code: 'storage/unauthorized' });
    t.fail('miss', { code: 'missing-local-blob' });
    t.fail('q', { code: 'storage/quota-exceeded' });
    assert.ok(!t.shouldTry('net'));
    assert.strictEqual(t.clearNetworkBackoff(), 1);
    assert.ok(t.shouldTry('net'), '인터넷 복귀 → 다시 올림');
    assert.ok(!t.shouldTry('perm') && !t.shouldTry('miss'), '영구 오류는 그대로 멈춤');
    let now = 0;
    const g = R.createGate({ storage: st, storageKey: 'g2', maxAttempts: 6, baseMs: 3500, capMs: 600000, now: () => now, random: () => 1 });
    g.fail({ code: 'unavailable' }); g.fail({ code: 'unavailable' });
    assert.ok(!g.autoAllowed(), '백오프 중');
    assert.ok(g.clearNetworkBackoff());
    assert.ok(g.autoAllowed(), '인터넷 복귀 → 바로 다시');
    for (let i = 0; i < 6; i++) g.fail({ code: 'unavailable' });
    assert.ok(g.isParked());
    assert.ok(g.clearNetworkBackoff() && !g.isParked(), '통신 실패로 멈춘 것도 풀림');
    g.fail({ code: 'permission-denied' });
    assert.ok(!g.clearNetworkBackoff() && g.isParked(), '권한 오류는 그대로');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const on = app.slice(app.indexOf("window.addEventListener('online', () => {\n        updateOfflineBadge();"));
    assert.ok(on.indexOf('bsaClearNetworkBackoff') > 0 && on.indexOf('bsaClearNetworkBackoff') < on.indexOf("runOfflineReturnSync('online')"), '온라인 복귀 때 대기 먼저 풂');
    assert.ok(/bsaKickPendingUploads\('visible'\)/.test(app) && /bsaKickPendingUploads\('timer'\)/.test(app), '앱 복귀·주기적으로 남은 사진 올림');
    // 2026-11-24 받는 쪽: 「서버에 없음」 표시는 잠깐만 — 늦게 올라온 사진도 다시 받는다
    const ex = app.slice(app.indexOf('function createExpiringIdSet('));
    const src = ex.slice(0, ex.indexOf('\n    }\n') + 6);
    const realNow = Date.now;
    let fake = 1000;
    Date.now = () => fake;
    try {
        const mk = new Function(src + '\nreturn createExpiringIdSet;')();
        const s = mk(60000);
        s.add('p');
        assert.ok(s.has('p'));
        fake += 61000;
        assert.ok(!s.has('p'), '1분 지나면 다시 받음');
    } finally { Date.now = realNow; }
    const load = app.slice(app.indexOf('async function loadPhotoByIdWithCloudFallback('), app.indexOf('async function ensureDefectPhotosLoaded('));
    assert.ok(load.indexOf('window._photoCache[pid]') < load.indexOf('_nonExistentPhotoIds.has(pid)'), '캐시에 주소가 있으면 「없음」 표시보다 먼저');
    const seed = app.slice(app.indexOf('function seedPhotoCacheFromUrlMap('), app.indexOf('function mergeFloorBundleIntoState('));
    assert.ok(seed.includes('_nonExistentPhotoIds.delete(pid)'), '서버 층 묶음에 주소가 오면 「없음」 해제');
    // 2026-11-24 충전 중 백그라운드 올리기: 네이티브 연결
    const man = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    assert.ok(/\.UploadKeepAliveService"[\s\S]{0,80}foregroundServiceType="dataSync"/.test(man), '전경 서비스(dataSync) 등록');
    assert.ok(man.includes('android.permission.WAKE_LOCK'), 'WAKE_LOCK 권한');
    const main = fs.readFileSync(path.join(root, 'android', 'app', 'src', 'main', 'java', 'kr', 'buildingsafety', 'inspection', 'MainActivity.java'), 'utf8');
    assert.ok(main.includes('registerPlugin(BackgroundUploadPlugin.class)'), '플러그인 등록');
    const bg = app.slice(app.indexOf('window.bsaReportBackgroundUpload = function'));
    assert.ok(bg.indexOf("isPluginAvailable('BsaBackgroundUpload')") > 0 && bg.indexOf("isPluginAvailable('BsaBackgroundUpload')") < bg.indexOf('setPending('), '옛 APK에서는 부르지 않음');
}

// 탭 사이 잠금: 하나만 잡힘
(async () => {
    const held = new Set();
    const nav = { locks: { request: (name, opt, cb) => {
        if (held.has(name)) return Promise.resolve(cb(null));
        held.add(name);
        return Promise.resolve(cb({ name })).then(() => held.delete(name));
    } } };
    const a = await R.tryCrossTabLock('x', nav);
    const b = await R.tryCrossTabLock('x', nav);
    assert.ok(typeof a === 'function');
    assert.strictEqual(b, null);
    a();
    await new Promise((r) => setTimeout(r, 0));
    const c = await R.tryCrossTabLock('x', nav);
    assert.ok(typeof c === 'function');
    assert.ok(typeof (await R.tryCrossTabLock('y', {})) === 'function');   // locks 없는 브라우저

    // app.js 연결
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const syncFn = app.slice(app.indexOf('async function syncStateToFirebase()'), app.indexOf('let currentUnsubscribe = null;'));
    assert.ok(/if \(isSyncParked\(\)\) \{[\s\S]{0,200}return;/.test(syncFn), '멈춤이면 동기화 안 함');
    assert.ok(syncFn.includes('tryCrossTabLock'), '탭 사이 잠금');
    assert.ok(/if \(!cycleFailReason\) \{\s*_syncRetryFailCount = 0;/.test(syncFn), '일부 실패면 실패 수를 초기화하지 않음');
    assert.ok(syncFn.includes("scheduleSyncRetryAfterError({ code: 'partial-failure'"), '일부 실패는 백오프');
    assert.ok(syncFn.includes('_tabLockRelease()'), '잠금 해제');
    const ret = app.slice(app.indexOf('async function runOfflineReturnSync('), app.indexOf('let _offlineRefreshState = null;'));
    assert.ok(ret.includes('g.autoAllowed()') && ret.includes('vg.autoAllowed()'), '자동 복귀 동기화는 백오프·멈춤을 따름');
    assert.ok(/_syncRetryTimer \|\| isSyncParked\(\) \|\| _dirtyFloorKeys\.size >= before\) break/.test(ret), '15회 몰아 돌리기 금지');
    const up = app.slice(app.indexOf('async function uploadInlineDefectPhotosForSync('), app.indexOf('async function deletePhotosForDefect('));
    assert.ok(up.includes('tracker.shouldTry(job.photoId)'), '멈춘 사진 건너뜀');
    assert.ok(!/idbDelete/.test(up), '올리기 실패로 기기 사진을 지우지 않음');
    const wf = app.slice(app.indexOf('async function writeFloorSyncBundle('), app.indexOf('function seedPhotoCacheFromUrlMap('));
    assert.ok(/if \(n <= 2\) markFloorKeyDirty\(floorKey\)/.test(wf), '일지 때문에 다시 올리기는 1분에 2번까지');
    assert.ok(!/if \(res && res\.remaining\) markFloorKeyDirty\(floorKey\);/.test(wf), '예전 무제한 다시 표시 제거');
    // 진행률 일지: 남은 항목 이름을 돌려준다(원인 기록용)
    const SP = require(path.join(root, 'js', 'core', 'sync-progress.js'));
    const tr = SP.createTracker({ storage: memStorage(), storageKey: () => 'j' });
    tr.record('edit', 'd1', 'B_1F');
    const seq = tr.mark();
    tr.record('edit', 'd2', 'B_1F');
    const res = tr.confirmFloor('B_1F', seq, ['d1', 'd2']);
    assert.strictEqual(res.remaining, 1);
    assert.ok(res.remainingKeys[0].indexOf('d2') >= 0);
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/core/sync-retry.js') > 0 && html.indexOf('js/core/sync-retry.js') < html.indexOf('src="app.js'), 'index.html 로드 순서');
    console.log('test-sync-retry: ok');
})().catch((e) => { console.error(e); process.exit(1); });
