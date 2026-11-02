/**
 * 행·열 번호 건너뛰기(그룹 skip) · 선 번호 직접 지정(line.num) — 2026-11-02
 * 둘 다 없으면 데이터 모양·지문이 예전과 같아야 한다.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const W = 4000; const H = 3000; const ctx = { rot: 0, w: W, h: H };
const vline = (x, extra) => Object.assign({ id: `v${x}`, pts: [{ x, y: 0 }, { x, y: H }] }, extra || {});
const names = (grid, i) => G.orderedLines(grid.groups[i || 0], ctx).items.map((it) => it.name);
const mk = (o, lines) => G.normalizeGrid({ groups: [G.createGroup('col', Object.assign({ band: 20, lines }, o))] });
const five = () => [1000, 1500, 2000, 2500, 3000].map((x) => vline(x));

// 파서
assert.deepStrictEqual(G.parseSkipText('3, 7 ,3;5', 'num'), [3, 5, 7]);
assert.deepStrictEqual(G.parseSkipText('c, G', 'upper'), [3, 7]);
assert.deepStrictEqual(G.parseSkipText('c, 4', 'num'), [4], '숫자 방식에서 글자는 버림');
assert.deepStrictEqual(G.parseSkipText('', 'num'), []);
assert.strictEqual(G.parseNumberToken('5', 'num'), 5);
assert.strictEqual(G.parseNumberToken('AA', 'upper'), 27);
assert.strictEqual(G.parseNumberToken('AA', 'num'), null);
assert.strictEqual(G.formatSkipText({ skip: [3, 7] }), '3, 7');
assert.strictEqual(G.formatSkipText({ skip: [3, 7], numbering: 'upper' }), 'C, G');

// 번호 건너뛰기: X3 비움 → X1,X2,X4,X5,X6
assert.deepStrictEqual(names(mk({ skip: [3] }, five())), ['X1', 'X2', 'X4', 'X5', 'X6']);
assert.strictEqual(G.groupNumberAt({ start: 1, skip: [1, 2] }, 0), 3, '시작 번호가 건너뛸 번호면 다음 번호부터');
assert.deepStrictEqual(names(mk({ start: 2, skip: [3, 4] }, five())), ['X2', 'X5', 'X6', 'X7', 'X8']);
// 내림차순에서도 건너뜀
assert.deepStrictEqual(names(mk({ skip: [3], reverse: true }, five())), ['X6', 'X5', 'X4', 'X2', 'X1']);
// 글자 번호
assert.deepStrictEqual(names(mk({ prefix: '', numbering: 'upper', skip: [2] }, five())), ['A', 'C', 'D', 'E', 'F']);

// 번호 직접 지정: 가운데 선만 X9
const lines = five(); lines[2].num = 9;
assert.deepStrictEqual(names(mk({}, lines)), ['X1', 'X2', 'X9', 'X4', 'X5'], '나머지 자동 번호는 그대로');
// 직접 지정 + 이름 글자는 이름이 우선
const l2 = five(); l2[2].num = 9; l2[2].label = 'K';
assert.strictEqual(names(mk({}, l2))[2], 'K');
// 위치 글자: 건너뛴 번호가 위치 글자에도 반영(X2~X4 사이)
const g = mk({ skip: [3] }, five());
assert.strictEqual(G.computeGridLocation(g, [{ x: 1750, y: 1000 }], ctx), 'X2~X4');
// 범위 방향은 번호 순서(그은 순서) 기준 — 직접 지정 번호가 커도 이웃 판단은 그대로
const l3 = five(); l3[1].num = 20;
assert.strictEqual(G.computeGridLocation(mk({}, l3), [{ x: 1250, y: 1000 }], ctx), 'X1~X20');

// 예전 데이터: 키 없음 · 지문 동일 · 저장 왕복
const oldRaw = { groups: [{ id: 'g1', axis: 'col', prefix: 'X', start: 1, angle: 0, band: 20, lines: five() }] };
const oldNorm = G.normalizeGrid(oldRaw);
assert.ok(!('skip' in oldNorm.groups[0]));
assert.ok(oldNorm.groups[0].lines.every((ln) => !('num' in ln)));
assert.strictEqual(G.gridSignature(oldRaw), G.gridSignature(JSON.parse(JSON.stringify(oldNorm))));
// 바꾸면 지문이 달라져 마킹 위치를 다시 계산
const sk = JSON.parse(JSON.stringify(oldRaw)); sk.groups[0].skip = [3];
assert.notStrictEqual(G.gridSignature(sk), G.gridSignature(oldRaw));
const nm = JSON.parse(JSON.stringify(oldRaw)); nm.groups[0].lines[0].num = 4;
assert.notStrictEqual(G.gridSignature(nm), G.gridSignature(oldRaw));
assert.deepStrictEqual(G.normalizeGrid(JSON.parse(JSON.stringify(G.normalizeGrid(sk)))).groups[0].skip, [3]);
// 잘못된 값은 버림
const bad = G.normalizeGrid({ groups: [{ axis: 'col', skip: ['x', 2.5, 3, 3, null, ''], lines: [Object.assign(vline(100), { num: 'abc' }), Object.assign(vline(200), { num: 2.5 })] }] });
assert.deepStrictEqual(bad.groups[0].skip, [3]);
assert.ok(bad.groups[0].lines.every((ln) => !('num' in ln)));

// 다른 층 복사
const cl = G.cloneGridForFloor(G.normalizeGrid({ groups: [G.createGroup('col', { skip: [3, 4], lines: (() => { const a = five(); a[0].num = 7; return a; })() })] }), {});
assert.deepStrictEqual(cl.groups[0].skip, [3, 4]);
assert.strictEqual(cl.groups[0].lines[0].num, 7);
const cl0 = G.cloneGridForFloor(oldRaw, {});
assert.ok(!('skip' in cl0.groups[0]));

// 패널 연결
assert.ok(/data-f="gskip"/.test(app) && /data-f="lnum"/.test(app));
assert.ok(/case 'gskip':/.test(app) && /case 'lnum':/.test(app));
console.log('test-grid-skip-number: ok');
