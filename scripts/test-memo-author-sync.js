'use strict';
// 2026-10-23 계정별 메모 저장(memo-author-sync) — 테스트 데이터만
const assert = require('assert');
const path = require('path');
const A = require(path.join(__dirname, '..', 'js', 'core', 'memo-author-sync.js'));
const me5 = { uid: 'U5', name: '동일5' };
const me6 = { uid: 'U6', name: '동일6' };
const B = 'bldg-T';
const st = {
    drawingMemos: {
        'bldg-T_1F': [
            { id: 'memo_1_a', x: 1, y: 2, text: '창 상부', by: '동일5', updatedAt: 10 },
            { id: 'memo_2_b', x: 3, y: 4, text: '남의 것', by: '동일6', byUid: 'U6', updatedAt: 11 }
        ],
        'bldg-T_2F': [{ id: 'memo_3_c', x: 0, y: 0, text: '2층', by: '', byUid: 'U5', updatedAt: 12 }],
        'bldg-X_1F': [{ id: 'memo_9_z', text: '다른 건물', byUid: 'U5', updatedAt: 1 }]
    },
    sketchMemos: { 'bldg-T_ROUND_SKETCH_MEMO': [{ id: 'sketch_1_s', strokes: [{ p: [1, 1, 50] }], by: '동일5', byUid: 'U5', updatedAt: 20 }] },
    deletedMemoIds: {}, deletedMemoAt: {}
};
const mine = A.collectMine(st, B, me5, 'ROUND_SKETCH_MEMO');
assert.deepStrictEqual(Object.keys(mine.memos).sort(), ['1F', '2F']);
assert.strictEqual(mine.memos['1F'].length, 1, '남의 메모는 내 문서에 안 들어감');
assert.strictEqual(mine.memos['1F'][0].byUid, 'U5', '옛 메모에 계정 표시');
assert.strictEqual(mine.sketches.length, 1);
assert.strictEqual(A.countItems(mine), 3);
// 서버 내 문서(다른 기기에서 쓴 것) + 이 기기 → 합집합
const server = { v: 1, memos: { '3F': [{ id: 'memo_5_d', text: '다른 기기', byUid: 'U5', updatedAt: 30 }] }, sketches: [], deleted: {} };
let merged = A.mergeDocs(server, mine, {});
assert.strictEqual(A.countItems(merged), 4, '다른 기기 내 메모를 잃지 않음');
// 지운 기록: 내 문서에 있던 id만, 메모보다 나중이면 뺌
merged = A.mergeDocs(merged, mine, { memo_1_a: 99, memo_2_b: 99 });
assert.ok(merged.deleted.memo_1_a && !merged.deleted.memo_2_b, '남의 메모 지운 기록은 내 문서에 안 실음');
assert.strictEqual(A.countItems(merged), 3);
// 지운 뒤 다시 고친(나중 시각) 메모는 살아남음
const m2 = A.mergeDocs(merged, { v: 1, memos: { '1F': [{ id: 'memo_1_a', text: '고침', byUid: 'U5', updatedAt: 100 }] }, sketches: [] }, {});
assert.ok(m2.memos['1F'].some((m) => m.id === 'memo_1_a'));
// 읽기 모양
const P = A.toPacks(merged, B, 'ROUND_SKETCH_MEMO', Object.keys(st.drawingMemos));
assert.ok(P.memoPacks['bldg-T_1F'].deletedIds.includes('memo_1_a'));
assert.strictEqual(P.sketchKey, 'bldg-T_ROUND_SKETCH_MEMO');
assert.strictEqual(P.sketchPack.items.length, 1);
// 계정 문서 id
assert.strictEqual(A.docIdFor('ab/c.d'), 'MEMOS_BY_ab_c_d');
// 다른 계정은 자기 것만
assert.strictEqual(A.countItems(A.collectMine(st, B, me6, 'ROUND_SKETCH_MEMO')), 1);
console.log('test-memo-author-sync: ok');
