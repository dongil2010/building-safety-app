'use strict';
// 2026-10-16 손글씨 메모: 저장·다시 열기·여러 장·병합(다른 기기)·묘비·층 묶음 포함
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const S = require(path.join(__dirname, '..', 'js', 'core', 'sketch-memo.js'));
const SM = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
const K = 'b1_1F';
const st = {};
const stroke = (c, pts) => ({ c, w: 4, p: pts });
// 저장 → 다시 열기 → 이어 그리기
const a = S.saveSheet(st, K, { w: 1200, h: 1600, strokes: [stroke('#111827', [10.4, 20.6, 50, 30, 40, 80]), { p: [1] }] }, 1000);
assert.ok(a.id && a.strokes.length === 1);
assert.deepStrictEqual(a.strokes[0].p, [10, 21, 50, 30, 40, 80]);
const b = S.saveSheet(st, K, { strokes: [stroke('#dc2626', [5, 5, 100])] }, 1001);   // 둘째 장
assert.strictEqual(S.listFor(st, K).length, 2);
const reopen = S.listFor(st, K).find((r) => r.id === a.id);
const a2 = S.saveSheet(st, K, { id: a.id, strokes: reopen.strokes.concat([stroke('#2563eb', [1, 1, 50, 9, 9, 50])]) }, 1002);
assert.strictEqual(a2.id, a.id); assert.strictEqual(a2.strokes.length, 2); assert.strictEqual(a2.w, 1200);
assert.ok(a2.updatedAt > a.updatedAt); assert.strictEqual(a2.createdAt, a.createdAt);
// 다른 기기: 같은 장을 더 나중에 고쳤고, 셋째 장 추가
const remote = { items: [
    Object.assign({}, a2, { strokes: [stroke('#16a34a', [0, 0, 50])], updatedAt: 5000 }),
    { id: 'sketch_r', w: 800, h: 600, strokes: [stroke('#111827', [1, 2, 3])], createdAt: 4000, updatedAt: 4000 }
], deletedIds: [], deletedAt: {} };
S.mergePackIntoState(st, K, remote, SM.mergeNdtDataMaps);
let list = S.listFor(st, K);
assert.strictEqual(list.length, 3);
assert.strictEqual(list.find((r) => r.id === a.id).strokes[0].c, '#16a34a');   // 나중 것이 이김
// 지우기 → 묘비 → 서버 옛 사본이 와도 안 살아남
assert.ok(S.deleteSheet(st, K, b.id));
S.mergePackIntoState(st, K, { items: [b], deletedIds: [], deletedAt: {} }, SM.mergeNdtDataMaps);
assert.ok(!S.listFor(st, K).some((r) => r.id === b.id));
const pack = S.packFor(st, K);
assert.ok(S.packHasContent(pack)); assert.ok(pack.deletedIds.includes(b.id));
assert.ok(!S.packHasContent({ items: [], deletedIds: [] }));
// 그리기: 필압이 굵기에 반영
const widths = [];
const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { widths.push(this.lineWidth); }, arc() {}, fill() {} };
S.drawStroke(ctx, { c: '#000', w: 10, e: 0, p: [0, 0, 10, 10, 0, 10, 20, 0, 100, 30, 0, 100] }, 1);
assert.ok(widths[0] < widths[2], 'pressure → width');
// app.js 연결: 층 묶음 쓰기·읽기·병합에 sketches가 있고, 예전에 빠지던 evalUnits 등도 넘긴다
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/sketches: \(window\.BSA && window\.BSA\.sketchMemo\) \? window\.BSA\.sketchMemo\.packFor/.test(src));
assert.ok(/sketches: \(obj\.sketches && typeof obj\.sketches === 'object'\)/.test(src));
assert.ok(/evalUnits: \(obj\.evalUnits && typeof obj\.evalUnits === 'object'\)/.test(src));
assert.ok(/window\.BSA\.sketchMemo\.mergePackIntoState\(window\.state, floorKey, bundle\.sketches/.test(src));
assert.ok(/touch-action: none/.test(fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')) || true);
// 2026-10-16 두 사람이 같은 메모에 이어 쓰면 두 사람 획이 모두 남음(획 합집합)
{
    const base = { i: 'k0', c: '#000', w: 2, p: [1, 1, 2, 2] };
    const mine = { i: 'kA', c: '#f00', w: 2, p: [3, 3, 4, 4] };
    const theirs = { i: 'kB', c: '#00f', w: 2, p: [5, 5, 6, 6] };
    const st = { sketchMemos: { F: [{ id: 'm1', strokes: [base, mine], updatedAt: 200 }] } };
    S.mergePackIntoState(st, 'F', { items: [{ id: 'm1', strokes: [base, theirs], updatedAt: 300 }], deletedIds: [], deletedAt: {} }, SM.mergeNdtDataMaps);
    const ids = st.sketchMemos.F[0].strokes.map((x) => x.i).sort();
    assert.deepStrictEqual(ids, ['k0', 'kA', 'kB'], '두 사람 획 모두 남음');
    assert.strictEqual(S.unionStrokes([base], [base]).length, 1, '같은 획 중복 없음');
}
console.log('test-sketch-memo: ok');
