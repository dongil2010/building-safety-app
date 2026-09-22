#!/usr/bin/env node
'use strict';

/**
 * 결함 수정 이력 — 균열 진전 추적용.
 *
 * 여기서 무서운 건 두 가지다.
 *   1) 기기 두 대가 오프라인에서 각자 고쳤을 때 한쪽 이력이 통째로 날아가는 것
 *      (Object.assign으로 덮으면 실제로 그렇게 된다)
 *   2) 이력이 무한정 쌓여 층 문서가 Firestore 1MB를 넘는 것
 * 둘 다 조용히 일어나므로 기계가 지킨다.
 */

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'edit-history.js'));

function entry(at, by, changes) {
    return { at: at, by: by, changes: changes };
}

// --- 바뀐 항목만 뽑는다 ---
(function diffOnlyChanged() {
    const before = { crackWidth: '0.2', crackLength: '100', size: '', defectType: '균열', isProgress: false };
    const after = { crackWidth: '0.3', crackLength: '100', size: '', defectType: '균열', isProgress: true };
    const changes = api.diffTracked(before, after);
    assert.deepStrictEqual(Object.keys(changes).sort(), ['crackWidth', 'isProgress']);
    assert.deepStrictEqual(changes.crackWidth, ['0.2', '0.3']);
    assert.deepStrictEqual(changes.isProgress, ['N', 'Y']);
})();

// --- 안 바뀌면 이력을 만들지 않는다 (저장만 눌러도 쌓이면 못 쓴다) ---
(function noChangeNoEntry() {
    const same = { crackWidth: '0.2', defectType: '균열' };
    assert.strictEqual(api.diffTracked(same, Object.assign({}, same)), null);
})();

// --- null / undefined / '' 는 같은 "빈 값"이다 ---
(function emptyValuesAreEqual() {
    assert.strictEqual(api.diffTracked({ crackWidth: null }, { crackWidth: '' }), null);
    assert.strictEqual(api.diffTracked({ crackWidth: undefined }, { crackWidth: '' }), null);
    assert.strictEqual(api.diffTracked({ crackWidth: ' 0.2 ' }, { crackWidth: '0.2' }), null);
})();

// --- 추적하지 않는 항목은 무시한다 (사진·좌표까지 남기면 문서가 커진다) ---
(function untrackedIgnored() {
    assert.strictEqual(api.diffTracked({ x: 1, location: '1층' }, { x: 999, location: '2층' }), null);
})();

// --- 같은 저장을 두 번 해도 한 건만 남는다 ---
(function appendIsIdempotent() {
    const e = entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] });
    let h = api.appendEntry([], e);
    h = api.appendEntry(h, entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] }));
    assert.strictEqual(h.length, 1);
})();

// --- 기기 두 대 이력이 둘 다 남는다 (핵심) ---
(function mergeKeepsBothDevices() {
    const tablet = [
        entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] }),
        entry(3000, '홍길동', { crackWidth: ['0.3', '0.4'] })
    ];
    const phone = [
        entry(2000, '김철수', { isProgress: ['N', 'Y'] })
    ];
    const merged = api.mergeHistories(tablet, phone);
    assert.strictEqual(merged.length, 3, '한쪽 기기 이력이 날아갔다');
    assert.deepStrictEqual(merged.map((e) => e.at), [1000, 2000, 3000], '시각순이어야 한다');
})();

// --- 같은 이력이 양쪽에 있으면 한 번만 (동기화를 여러 번 해도 안 불어난다) ---
(function mergeDedupes() {
    const same = entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] });
    const merged = api.mergeHistories([same], [Object.assign({}, same)]);
    assert.strictEqual(merged.length, 1);

    // 여러 번 합쳐도 그대로
    assert.strictEqual(api.mergeHistories(merged, merged).length, 1);
    assert.strictEqual(api.mergeHistories(api.mergeHistories(merged, merged), merged).length, 1);
})();

// --- 같은 시각이라도 내용이 다르면 둘 다 남는다 ---
(function sameTimeDifferentChange() {
    const a = entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] });
    const b = entry(1000, '김철수', { crackLength: ['10', '20'] });
    assert.strictEqual(api.mergeHistories([a], [b]).length, 2);
})();

// --- 한도를 넘으면 맨 처음 이력은 남기고 오래된 중간을 버린다 ---
(function capKeepsFirstAndNewest() {
    let h = [];
    for (let i = 1; i <= 40; i += 1) {
        h = api.appendEntry(h, entry(i * 1000, '홍길동', { crackWidth: [String(i), String(i + 1)] }));
    }
    assert.strictEqual(h.length, api.MAX_ENTRIES, '한도를 넘겼다 — 층 문서 1MB가 위험하다');
    assert.strictEqual(h[0].at, 1000, '맨 처음 값(진전 판단 기준점)이 사라졌다');
    assert.strictEqual(h[h.length - 1].at, 40000, '가장 최근 이력이 사라졌다');
})();

// --- 합칠 때도 한도가 지켜진다 ---
(function mergeRespectsCap() {
    const a = [];
    const b = [];
    for (let i = 1; i <= 30; i += 1) a.push(entry(i * 10, 'A', { size: [String(i), String(i + 1)] }));
    for (let i = 1; i <= 30; i += 1) b.push(entry(i * 10 + 5, 'B', { size: [String(i), String(i + 1)] }));
    const merged = api.mergeHistories(a, b);
    assert.strictEqual(merged.length, api.MAX_ENTRIES);
    assert.strictEqual(merged[0].at, 10);
})();

// --- 망가진 이력은 걸러낸다 (옛 데이터·손상 데이터) ---
(function garbageFiltered() {
    const good = entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] });
    const merged = api.mergeHistories(
        [good, null, {}, { at: 0, changes: {} }, { at: 500, changes: {} }, 'x'],
        undefined
    );
    assert.strictEqual(merged.length, 1);
    assert.deepStrictEqual(api.readHistory({ editHistory: 'not-an-array' }), []);
    assert.deepStrictEqual(api.readHistory(null), []);
    assert.deepStrictEqual(api.readHistory({}), []);
})();

// --- 화면 문구 ---
(function describeReadable() {
    const text = api.describeChanges({ crackWidth: ['0.2', '0.3'], isProgress: ['N', 'Y'] });
    assert.ok(text.indexOf('균열폭 0.2 → 0.3') >= 0, text);
    assert.ok(text.indexOf('진행성 N → Y') >= 0, text);
    assert.ok(api.describeChanges({ size: ['', '10x20'] }).indexOf('(없음) → 10x20') >= 0);
})();

// --- 한 건의 크기가 작아야 한다 (결함 수백 개 × 20건이 층 문서에 들어간다) ---
(function entryStaysSmall() {
    const e = entry(1758600000000, '홍길동', { crackWidth: ['0.2', '0.3'] });
    assert.ok(JSON.stringify(e).length < 120, '이력 한 건이 너무 크다: ' + JSON.stringify(e).length);
})();

// --- index.html에서 sync-merge.js보다 먼저 실려야 한다 ---
(function loadedBeforeSyncMerge() {
    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const mine = html.indexOf('js/core/edit-history.js');
    const sync = html.indexOf('js/core/sync-merge.js');
    assert.ok(mine > 0, 'index.html에 edit-history.js가 없다');
    assert.ok(sync > 0, 'index.html에 sync-merge.js가 없다');
    assert.ok(mine < sync, 'sync-merge.js가 먼저 실리면 이력 병합이 조용히 건너뛰어진다');
})();

// --- 동기화 병합이 실제로 합집합을 만든다 (조용히 건너뛰면 이력이 날아간다) ---
(function syncMergeUnionsHistory() {
    const merge = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
    const server = {
        id: 'd1', updatedAt: 2000, contentUpdatedAt: 2000,
        crackWidth: '0.4',
        editHistory: [entry(2000, '김철수', { crackWidth: ['0.3', '0.4'] })]
    };
    const local = {
        id: 'd1', updatedAt: 1000, contentUpdatedAt: 1000,
        crackWidth: '0.3',
        editHistory: [entry(1000, '홍길동', { crackWidth: ['0.2', '0.3'] })]
    };
    const merged = merge.mergeDefectRecord(server, local, null);
    assert.strictEqual(merged.editHistory.length, 2, '한쪽 기기 이력이 병합에서 날아갔다');
    assert.deepStrictEqual(merged.editHistory.map((e) => e.at), [1000, 2000]);

    // 이력이 없으면 빈 배열을 달고 다니지 않는다 (결함 수백 개면 낭비다)
    const plain = merge.mergeDefectRecord({ id: 'd2', updatedAt: 1 }, { id: 'd2', updatedAt: 2 }, null);
    assert.strictEqual('editHistory' in plain, false);
})();

// --- 저장 경로가 app.js에 연결돼 있다 ---
(function wiredIntoSavePath() {
    const fs = require('fs');
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.match(app, /const historyBefore = \(editHistoryApi && storedForGuard\)/);
    assert.match(app, /editHistoryApi\.diffTracked\(historyBefore, state\.defects\[key\]\[idx\]\)/);
})();

console.log('test-edit-history: ok');
