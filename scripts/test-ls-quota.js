'use strict';
// 기기 저장 공간 가득 참 처리 회귀 테스트(2026-10-20)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const LQ = require('../js/core/ls-quota.js');

function mkStorage(limit) {
    const m = new Map();
    const size = () => { let n = 0; m.forEach((v, k) => { n += k.length + v.length; }); return n; };
    return {
        get length() { return m.size; },
        key(i) { return Array.from(m.keys())[i] ?? null; },
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) {
            v = String(v);
            const prev = m.has(k) ? k.length + m.get(k).length : 0;
            if (size() - prev + k.length + v.length > limit) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            m.set(k, v);
        },
        removeItem(k) { m.delete(k); },
        _m: m
    };
}
function mkIdb(opts) {
    const db = new Map();
    return {
        db,
        async put(k, v) { if (opts && opts.failPut) throw new Error('idb down'); db.set(k, opts && opts.corrupt ? 'x' : v); },
        async get(k) { return db.has(k) ? db.get(k) : null; }
    };
}
const cur = 'building_safety_app_state_v2_c_A';
const other = 'building_safety_app_state_v2_c_B';
const big = (n) => 'x'.repeat(n);

(async () => {
    assert(LQ.isQuotaError({ name: 'QuotaExceededError' }) && LQ.isQuotaError({ code: 22 }) && !LQ.isQuotaError(new Error('x')));

    // 진단: 큰 순
    let st = mkStorage(10000);
    st.setItem('a', big(100)); st.setItem('bsa.s357img.b1.1', big(3000)); st.setItem(cur, '{"__savedAt":1700000000000}');
    const rep = LQ.report(st);
    assert.strictEqual(rep.rows[0].key, 'bsa.s357img.b1.1');
    assert(/K자/.test(LQ.formatReport(rep)));

    // 가득 참 → SAFETY357 그림·다른 회사 저장본을 IndexedDB로 옮긴 뒤 다시 쓰기 성공
    st = mkStorage(10000);
    st.setItem('bsa.s357img.b1.1', big(4000));
    st.setItem(other, '{"__savedAt":1700000000001,"d":"' + big(3000) + '"}');
    st.setItem('bsa_sync_journal_v1', '{"entries":{"edit|d1":{}}}');   // 올릴 것 표시 — 지우면 안 됨
    st.setItem(cur, '{}');
    const io = mkIdb();
    const val = '{"__savedAt":1700000000009,"d":"' + big(5000) + '"}';
    const r = await LQ.setWithRetry(st, cur, val, io, {});
    assert(r.ok && r.retried, '공간 만든 뒤 다시 쓰기');
    assert.strictEqual(st.getItem(cur), val);
    assert.strictEqual(st.getItem('bsa.s357img.b1.1'), null);
    assert.strictEqual(io.db.get('s357img:b1.1'), big(4000), '그림은 IndexedDB에 그대로');
    assert.strictEqual(io.db.get('state:' + other).raw.length > 3000, true, '다른 회사 저장본은 IndexedDB 예비본으로');
    assert(st.getItem('bsa_sync_journal_v1'), '동기화 기록은 남는다');

    // IndexedDB 확인 실패면 원래 키를 지우지 않는다
    st = mkStorage(10000);
    st.setItem('bsa.s357img.b1.2', big(4000));
    const bad = mkIdb({ corrupt: true });
    const fr = await LQ.freeSpace(st, bad, { currentStateKey: cur });
    assert(fr.failed.includes('bsa.s357img.b1.2') && st.getItem('bsa.s357img.b1.2'), '확인 안 되면 지우지 않음');
    const down = mkIdb({ failPut: true });
    await LQ.freeSpace(st, down, { currentStateKey: cur });
    assert(st.getItem('bsa.s357img.b1.2'), 'IndexedDB가 안 되면 지우지 않음');

    // 지금 회사 저장본은 freeSpace가 옮기지 않는다
    assert(!LQ.movableKeys(st, cur).some((x) => x.key === cur));

    // IndexedDB의 더 새 예비 저장본을 옛 기기 저장본이 덮지 않는다
    st = mkStorage(100000);
    st.setItem(other, '{"__savedAt":1000000000000}');
    const io2 = mkIdb();
    io2.db.set('state:' + other, { raw: '{"__savedAt":2000000000000}', savedAt: 2000000000000 });
    await LQ.freeSpace(st, io2, { currentStateKey: cur });
    assert.strictEqual(io2.db.get('state:' + other).savedAt, 2000000000000);
    assert.strictEqual(st.getItem(other), null);

    // 저장 시각 읽기는 맨 앞 __savedAt만
    assert.strictEqual(LQ.savedAtOf('{"__savedAt":1700000000123,"x":{"savedAt":1}}'), 1700000000123);
    assert.strictEqual(LQ.savedAtOf('{"x":1}'), 0);

    // app.js: 가득 차면 바로 오류 대신 정리·재시도·IndexedDB 예비 저장, 열 때 더 새 예비본을 읽음
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(/__savedAt: Date\.now\(\),\n\s*defects: sanitizedDefects/.test(app), '저장 시각이 맨 앞');
    assert(/queueQuotaStateSave\(stateKeyForSave, stateJson\)/.test(app));
    assert(/await io\.put\('state:' \+ key, entry\);[\s\S]{0,200}back\.raw !== json\) return false/.test(app), '예비본은 다시 읽어 확인');
    assert(/readIdbStateFallbackIfNewer\(getLocalStorageStateKey/.test(app) && /options\.raw/.test(app));
    assert(!/localStorage\.setItem\('bsa\.s357img\./.test(app), 'SAFETY357 그림을 localStorage에 쓰지 않음');
    assert(/window\.bsaStorageReport = function/.test(app));
    const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert(/js\/core\/ls-quota\.js/.test(idx));

    // 동기화 실패 안내 기록은 50개로 자른다
    const SP = require('../js/core/sync-progress.js');
    const mem = mkStorage(1e7);
    const t = SP.createTracker({ storage: mem });
    for (let i = 0; i < 80; i++) t.noteFailure('f' + i, 'x');
    const saved = JSON.parse(mem.getItem('bsa_sync_journal_v1'));
    assert.strictEqual(Object.keys(saved.failures).length, 50);
    assert(saved.failures.f79 && !saved.failures.f0);
    console.log('test-ls-quota: ok');
})().catch((e) => { console.error(e); process.exit(1); });
