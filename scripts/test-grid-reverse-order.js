#!/usr/bin/env node
'use strict';
/** 2026-10-21 행·열 번호 오름차순 ⇄ 내림차순 · 「순서 뒤집기」(위치 그대로) · 되돌리기 */
const assert = require('assert');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const ctx = { rot: 0, w: 4000, h: 3000 };
const vline = (x) => ({ pts: [{ x, y: 0 }, { x, y: 3000 }] });
const hline = (y) => ({ pts: [{ x: 0, y }, { x: 4000, y }] });
const names = (g) => G.orderedLines(g, ctx).items.map((it) => it.name);

let grid = G.normalizeGrid({ groups: [
    G.createGroup('col', { prefix: 'X', lines: [vline(500), vline(1500), vline(2500)] }),
    G.createGroup('row', { prefix: '', numbering: 'upper', lines: [hline(400), hline(1400), hline(2400)] })
] });
const [col, row] = grid.groups;
assert.deepStrictEqual(names(col), ['X1', 'X2', 'X3']);
assert.deepStrictEqual(names(row), ['A', 'B', 'C']);

// 내림차순 토글: 열만(행은 그대로 — 축마다 따로)
col.reverse = true;
assert.deepStrictEqual(names(col), ['X3', 'X2', 'X1']);
assert.deepStrictEqual(names(row), ['A', 'B', 'C']);
// 저장·불러오기·지문·다른 층 복사에 유지
const re = G.normalizeGrid(JSON.parse(JSON.stringify(grid)));
assert.strictEqual(re.groups[0].reverse, true);
assert.strictEqual(re.groups[1].reverse, undefined, '오름차순은 키 없음(예전 데이터 모양)');
assert.notStrictEqual(G.gridSignature(grid), G.gridSignature(Object.assign({}, grid, { groups: [Object.assign({}, col, { reverse: undefined }), row] })));
assert.strictEqual(G.cloneGridForFloor(grid, {}).groups[0].reverse, true);
// 내림차순에서 새 선을 그으면 1번이 됨
delete col.reverse;

// 순서 뒤집기: 위치 그대로, 이름만 C,B,A
const before = row.lines.map((l) => JSON.stringify(l.pts));
row.lines[1].label = '중앙';
const undo = G.reverseLineOrder(row);
assert.deepStrictEqual(names(row), ['C', '중앙', 'A'], '개별 이름은 그대로');
assert.deepStrictEqual(row.lines.map((l) => JSON.stringify(l.pts)), before, '선 위치 그대로');
// 되돌리기
G.restoreLineSeqs(row, undo);
assert.deepStrictEqual(names(row), ['A', '중앙', 'C']);
// 두 번 뒤집으면 원래대로
G.reverseLineOrder(col); G.reverseLineOrder(col);
assert.deepStrictEqual(names(col), ['X1', 'X2', 'X3']);
// 칸 이름(위치)도 뒤집힌 번호로
G.reverseLineOrder(col);
assert.deepStrictEqual(names(col), ['X3', 'X2', 'X1']);
console.log('test-grid-reverse-order: ok');
