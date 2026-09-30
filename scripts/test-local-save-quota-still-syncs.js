'use strict';
/**
 * 2026-09-30 사고: 기기 저장 공간(localStorage)이 차서 setItem이 실패하면 서버 올리기 예약까지 건너뛰어,
 * CAD 핀·엑셀 가져오기가 기기에도 서버에도 안 남고 새로고침하면 사라졌다.
 * - 기기 저장이 실패해도 scheduleSyncToFirebase는 불려야 한다
 * - 실패 알림은 계속 실패하면 다시 뜬다(2분 간격)
 * - 엑셀 가져오기는 넣은 층을 모두 dirty로 표시한다(지금 보고 있지 않은 층 포함)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(name) {
    const start = src.indexOf('    function ' + name + '(');
    assert.ok(start >= 0, name + ' 없음');
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(start, i + 1);
}

const fnSrc = extractFunction('saveStateToLocalStorage');

function run({ quota, now }) {
    const calls = { sync: 0, toasts: [] };
    const store = {};
    const localStorage = {
        setItem(k, v) {
            if (quota && String(k).indexOf('state') >= 0) {
                const e = new Error('quota'); e.name = 'QuotaExceededError'; e.code = 22; throw e;
            }
            store[k] = v;
        },
        getItem(k) { return store[k] || null; }
    };
    const window = {
        state: { buildings: [], defects: { b_1F: [{ id: 'a1', no: '1' }] }, companyId: 'c1', currentTab: 'tab-survey' },
        showToast(msg, type) { calls.toasts.push([msg, type]); }
    };
    const factory = new Function('window', 'localStorage', 'navigator', 'Date', 'ctx', `
        let state = window.state;
        let db = {};
        let _suppressSyncOnSave = false;
        let _localStorageSaveFailedNotified = ctx.notified || false;
        let _localStorageSaveFailedAt = ctx.failedAt || 0;
        function persistLocalImagesToIndexedDb() {}
        function defectPhotoIdAt() { return ''; }
        function getLocalStorageStateKey(c) { return 'building_safety_app_state_v2_c_' + c; }
        function persistUserDefectPinPresetsLocal() {}
        function scheduleSyncUserDefectPinPresets() {}
        function scheduleSyncToFirebase() { ctx.calls.sync++; }
        function gaugeStripForLocal(r) { return r; }
        function scheduleGaugePhotoMigrate() {}
        ${fnSrc}
        saveStateToLocalStorage();
        return { notified: _localStorageSaveFailedNotified, failedAt: _localStorageSaveFailedAt };
    `);
    const ctx = { calls, notified: false, failedAt: 0 };
    const fakeDate = { now: () => now || 1000 };
    const out = factory(window, localStorage, { onLine: true }, fakeDate, ctx);
    return { calls, out, ctx };
}

// 1) 정상 저장 → 예약 1번, 알림 없음
let r = run({ quota: false });
assert.strictEqual(r.calls.sync, 1);
assert.strictEqual(r.calls.toasts.length, 0);

// 2) 저장 공간 가득 → 그래도 예약, 에러 알림(서버에 올리는 중)
r = run({ quota: true });
assert.strictEqual(r.calls.sync, 1, '기기 저장이 실패해도 서버 올리기 예약');
assert.strictEqual(r.calls.toasts.length, 1);
assert.ok(/가득/.test(r.calls.toasts[0][0]) && /서버에 올리는 중/.test(r.calls.toasts[0][0]), r.calls.toasts[0][0]);
assert.strictEqual(r.calls.toasts[0][1], 'error');

// 3) 재알림 간격: 이미 알렸고 2분 안이면 조용히, 지나면 다시
assert.ok(/nowMs - \(_localStorageSaveFailedAt \|\| 0\)\) > 120000/.test(fnSrc));

// 4) 엑셀 가져오기: 넣은 층 dirty
const excelStart = src.indexOf('window.confirmImportDefectExcel = async function');
const excelEnd = src.indexOf('guardConfirmImportDefectExcel', excelStart);
const excelSrc = src.slice(excelStart, excelEnd);
assert.ok(/if \(importedThisFloor > 0 \|\| matchedThisFloor > 0\) \{[\s\S]{0,200}markFloorKeyDirty\(key\)/.test(excelSrc),
    '엑셀 가져오기는 넣은 층마다 markFloorKeyDirty');

console.log('test-local-save-quota-still-syncs: ok');
