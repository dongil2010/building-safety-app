'use strict';
// 2026-10-19 「손글씨 기능에서 기존에 작성한거 부터 보여줘야지 계속 새 손글씨 보이면 안됨 그리고 기존에 작성한거도 고를 수 잇게」
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sk = require(path.join(root, 'js', 'core', 'sketch-memo.js'));
const line = (i) => ({ c: '#000', w: 3, p: [1, 1, 50, 5, 5, 50], i });

const st = {};
assert.strictEqual(sk.pickInitialSheet(st, 'F', '김'), null, '메모가 없으면 새 종이');
const a1 = sk.saveSheet(st, 'F', { strokes: [line('a')], by: '김' }, 1000);
const b1 = sk.saveSheet(st, 'F', { strokes: [line('b')], by: '이' }, 2000);
const a2 = sk.saveSheet(st, 'F', { strokes: [line('c')], by: '김' }, 3000);
const b2 = sk.saveSheet(st, 'F', { strokes: [line('d')], by: '이' }, 4000);
assert.strictEqual(sk.pickInitialSheet(st, 'F', '김').id, a2.id, '내가 마지막으로 고친 메모부터');
// 예전 메모-1을 다시 고치면 그게 처음
sk.saveSheet(st, 'F', { id: a1.id, strokes: [line('a'), line('e')], by: '김' }, 5000);
assert.strictEqual(sk.pickInitialSheet(st, 'F', '김').id, a1.id);
assert.strictEqual(sk.pickInitialSheet(st, 'F', '박').id, a1.id, '내 메모가 없으면 이 층 최근 메모');
assert.strictEqual(sk.pickInitialSheet(st, 'F', '이').id, b2.id);
// 탭: 모든 작성자 메모, 만든 순서, 이름 붙임
const tabs = sk.sheetTabs(st, 'F', '김');
assert.deepStrictEqual(tabs.map((t) => t.id), [a1.id, b1.id, a2.id, b2.id]);
assert.deepStrictEqual(tabs.map((t) => t.label), ['메모-1', '이 메모-1', '메모-2', '이 메모-2']);
assert.deepStrictEqual(tabs.map((t) => t.mine), [true, false, true, false]);
// 획 합치기: 창을 연 뒤 다른 기기가 더한 획은 살리고, 이번에 그렸다 뺀 획만 안 살림
const stored = [line('a'), line('x-remote'), line('mine-undone')];
const editor = [line('a'), line('mine-new')];
const merged = sk.mergeEditorStrokes(editor, stored, new Set([sk.strokeKey(line('mine-new')), sk.strokeKey(line('mine-undone'))]));
assert.deepStrictEqual(merged.map((x) => x.i), ['a', 'mine-new', 'x-remote']);
// 같은 메모를 두 기기가 이어 써도 획 ID로 합쳐 둘 다 남음
const A = {}; const B = {};
const base = sk.saveSheet(A, 'F', { strokes: [line('s1')], by: '김' }, 100);
sk.mergePackIntoState(B, 'F', sk.packFor(A, 'F'), require(path.join(root, 'js', 'core', 'sync-merge.js')).mergeNdtDataMaps);
sk.saveSheet(A, 'F', { id: base.id, strokes: [line('s1'), line('fromA')], by: '김' }, 200);
sk.saveSheet(B, 'F', { id: base.id, strokes: [line('s1'), line('fromB')], by: '김' }, 300);
const mergeFn = require(path.join(root, 'js', 'core', 'sync-merge.js')).mergeNdtDataMaps;
sk.mergePackIntoState(A, 'F', sk.packFor(B, 'F'), mergeFn);
assert.deepStrictEqual(sk.listFor(A, 'F')[0].strokes.map((x) => x.i).sort(), ['fromA', 'fromB', 's1']);

// ---- app.js 연결 ----
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(/openSketchMemo\(\{ latest: true \}\)/.test(app) && !/openSketchMemo\(\{ fresh: true \}\)/.test(app), '메모 버튼은 새 종이가 아님');
assert.ok(/api\.pickInitialForBuilding\(window\.state, sketchUi\.bldgId, sketchMe\(\)\)/.test(app), '열 때 내 최근 메모(2026-10-20 건물 통합·계정별)');
assert.ok(/else if \(a === 'new'\) \{ sketchSave\(false\); sketchOpenSheet\(null\); \}/.test(app), '새 메모는 「＋ 새 메모」로만');
assert.ok(/data-sk-tabs role="tablist"/.test(app) && /api\.buildingTabs\(window\.state, sketchUi\.bldgId, me\)/.test(app), '메모 탭 목록');
assert.ok(/b\.dataset\.skTab !== undefined/.test(app), '탭 누르면 그 메모 열기');
assert.ok(!/data-sk-sheets/.test(app), '숨은 드롭다운 대신 보이는 탭');
assert.ok(/Object\.assign\(\{ c: s\.c, w: s\.w, e: s\.e, p: s\.p\.slice\(\) \}, s\.i \? \{ i: s\.i \} : \{\}\)/.test(app), '열 때 획 ID 지킴');
assert.ok(/sketchStrokesToSave\(\) : sketchUi\.strokes/.test(app), '저장 때 획 ID로 합침');
assert.ok(!/data-sk="del"/.test(app), '메모 지우기 버튼 없음(그대로)');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(/\.sketch-memo-overlay \.sk-tabs \{[\s\S]{0,200}overflow-x: auto/.test(css), '폰에서도 탭 가로 스크롤');

console.log('test-sketch-memo-open-latest: ok');
