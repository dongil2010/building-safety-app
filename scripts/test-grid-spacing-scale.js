/* 행·열 간격 전체 비율 조절 (2026-11-04) — 순수 계산 + 패널 연결 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require('../js/shared/grid-lines.js');

const ctx = { rot: 0, w: 1600, h: 1000 };
const mkCol = () => {
    const g = G.createGroup('col', {});
    g.lines = [100, 200, 400].map((x, i) => ({ id: 'c' + i, pts: [{ x, y: 100 }, { x, y: 900 }] }));
    return g;
};
const xs = (g) => g.lines.map((l) => l.pts[0].x);

// 첫 선 기준 ×1.5: 첫 선 그대로, 간격이 1.5배
let g = mkCol();
let prev = G.scaleSpacing(g, 1.5, ctx, 'first');
assert.deepStrictEqual(xs(g), [100, 250, 550]);
assert.strictEqual(prev.length, 2, '기준 선은 안 움직임 → 되돌리기 자료도 움직인 2개만');
G.restoreLinePts(g, prev);
assert.deepStrictEqual(xs(g), [100, 200, 400], '되돌리기');

// 끝 선 / 가운데 / 고른 선 기준
g = mkCol(); G.scaleSpacing(g, 0.5, ctx, 'last'); assert.deepStrictEqual(xs(g), [250, 300, 400]);
g = mkCol(); G.scaleSpacing(g, 2, ctx, 'center'); assert.deepStrictEqual(xs(g), [-50, 150, 550]);
g = mkCol(); G.scaleSpacing(g, 0.5, ctx, { lineId: 'c1' }); assert.deepStrictEqual(xs(g), [150, 200, 300]);
g = mkCol(); G.scaleSpacing(g, 2, ctx, { lineId: 'nope' }); assert.deepStrictEqual(xs(g), [100, 300, 700], '없는 선이면 첫 선 기준');

// 100%·선 하나·빈 그룹은 아무것도 안 함, 비율은 0.1~5로 제한
g = mkCol();
assert.strictEqual(G.scaleSpacing(g, 1, ctx, 'first').length, 0);
assert.strictEqual(G.scaleSpacing(G.createGroup('col', {}), 2, ctx, 'first').length, 0);
G.scaleSpacing(g, 100, ctx, 'first'); assert.deepStrictEqual(xs(g), [100, 600, 1600], '최대 5배');
g = mkCol(); G.scaleSpacing(g, 0, ctx, 'first'); assert.deepStrictEqual(xs(g), [100, 110, 130], '최소 0.1배');

// 도면이 90° 돌아 있어도 화면 기준 간격으로 (행: 화면에서 위→아래 = 이미지 좌표 x 방향)
const r = G.createGroup('row', {});
r.lines = [{ id: 'r1', pts: [{ x: 100, y: 100 }, { x: 900, y: 100 }] }, { id: 'r2', pts: [{ x: 100, y: 300 }, { x: 900, y: 300 }] }];
const before = r.lines.map((l) => JSON.stringify(l.pts));
G.scaleSpacing(r, 2, { rot: 90, w: 1600, h: 1000 }, 'first');
assert.strictEqual(JSON.stringify(r.lines[0].pts), before[0], '기준(첫 선) 그대로');
assert.notStrictEqual(JSON.stringify(r.lines[1].pts), before[1], '둘째 선은 옮겨짐');
// 선 사이 거리가 두 배: 원래 200 → 400
assert.strictEqual(Math.round(Math.abs(r.lines[1].pts[0].y - r.lines[0].pts[0].y)), 400);

// 평행 이동이라 각도(방향)·길이는 그대로
const t = G.createGroup('col', {});
t.lines = [{ id: 't1', pts: [{ x: 100, y: 100 }, { x: 130, y: 900 }] }, { id: 't2', pts: [{ x: 300, y: 100 }, { x: 330, y: 900 }] }];
const dir = (l) => ({ dx: l.pts[1].x - l.pts[0].x, dy: l.pts[1].y - l.pts[0].y });
G.scaleSpacing(t, 2, ctx, 'first');
assert.deepStrictEqual(dir(t.lines[1]), { dx: 30, dy: 800 }, '기울어진 선의 방향·길이 그대로');

// 패널 연결
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
['data-f="spacePct"', 'data-act="spaceApply"', 'data-act="spaceQuick"', 'data-act="undoSpace"', 'data-f="spaceAnchor"', 'data-f="spaceScope"', "sec('space'"].forEach((k) => assert.ok(app.includes(k), k));
assert.ok(app.includes('function applyGridSpacingPercent(') && app.includes('function undoGridSpacingChange('), '실행·되돌리기');
assert.ok(/ge\.orderUndo \|\| ge\.spacingUndo/.test(app), 'Ctrl+Z로 되돌리기');
console.log('test-grid-spacing-scale OK');
