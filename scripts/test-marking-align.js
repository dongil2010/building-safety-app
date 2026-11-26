#!/usr/bin/env node
'use strict';
/** 도면 교체 후 마킹 위치 맞추기 계산(js/core/marking-align.js) 시험 */
const assert = require('assert');
const M = require('../js/core/marking-align.js');

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok', name); }
const near = (a, b, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

t('이동+배율: 두 점이 정확히 맞는다', () => {
    const T = M.solveSimilarity([{ x: 100, y: 100 }, { x: 900, y: 500 }], [{ x: 300, y: 250 }, { x: 700, y: 450 }]);
    assert.ok(T && !T.rotated);
    near(T.scale, 0.5, 1e-9);
    const p1 = M.applyPoint(T, 100, 100), p2 = M.applyPoint(T, 900, 500);
    near(p1.x, 300); near(p1.y, 250); near(p2.x, 700); near(p2.y, 450);
});

t('작은 기울기(1°)는 회전 없이 — 두 점 오차를 반씩', () => {
    const r = 1 * Math.PI / 180;
    const q2 = { x: 1000 * Math.cos(r), y: 1000 * Math.sin(r) };
    const T = M.solveSimilarity([{ x: 0, y: 0 }, { x: 1000, y: 0 }], [{ x: 0, y: 0 }, q2]);
    assert.strictEqual(T.rotated, false);
    assert.strictEqual(T.b, 0);
    const c = M.applyPoint(T, 500, 0);
    near(c.x, q2.x / 2); near(c.y, q2.y / 2);
});

t('큰 회전(90°)은 그대로', () => {
    const T = M.solveSimilarity([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 50 }, { x: 50, y: 250 }]);
    assert.ok(T.rotated);
    near(T.angleDeg, 90, 1e-9);
    const p = M.applyPoint(T, 100, 0);
    near(p.x, 50); near(p.y, 250);
});

t('두 점이 같으면 null', () => {
    assert.strictEqual(M.solveSimilarity([{ x: 1, y: 1 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 5, y: 5 }]), null);
});

t('미세 조정: 중심 기준 배율 + 이동', () => {
    const T = { a: 1, b: 0, e: 0, f: 0, scale: 1, angleDeg: 0, rotated: false };
    const T2 = M.adjustTransform(T, { ds: 2, cx: 10, cy: 10, dx: 5, dy: -5 });
    const p = M.applyPoint(T2, 20, 10);
    near(p.x, 35); near(p.y, 5);
    const c = M.applyPoint(T2, 10, 10);
    near(c.x, 15); near(c.y, 5);
});

// ---- 3점(2026-11-16) ----
const OLD3 = [{ x: 100, y: 100 }, { x: 3000, y: 200 }, { x: 300, y: 2500 }];
function mapBy(fn) { return OLD3.map((p) => fn(p.x, p.y)); }

t('3점: 작은 회전(1°)도 버리지 않고 세 점을 정확히 지난다', () => {
    const r = 1 * Math.PI / 180, s = 1.25;
    const fn = (x, y) => ({ x: s * (Math.cos(r) * x - Math.sin(r) * y) + 40, y: s * (Math.sin(r) * x + Math.cos(r) * y) - 30 });
    const T3 = M.solveAffine3(OLD3, mapBy(fn));
    assert.ok(T3 && T3.rotated && T3.mode === 3 && !T3.mirrored);
    near(T3.angleDeg, 1, 1e-6); near(T3.scale, 1.25, 1e-6); near(T3.skewDeg, 0, 1e-6);
    const far = M.applyPoint(T3, 4000, 3000), exp = fn(4000, 3000);
    near(far.x, exp.x, 1e-6); near(far.y, exp.y, 1e-6);
    // 같은 경우 2점은 1° 를 버려 먼 곳이 어긋난다(3점을 고르는 이유)
    const T2 = M.solveSimilarity(OLD3.slice(0, 2), mapBy(fn).slice(0, 2));
    assert.strictEqual(T2.rotated, false);
    const far2 = M.applyPoint(T2, 4000, 3000);
    assert.ok(Math.hypot(far2.x - exp.x, far2.y - exp.y) > 20);
});

t('3점: 가로세로 배율 차이·뒤집힘', () => {
    const fn = (x, y) => ({ x: 1.2 * x + 5, y: -0.8 * y + 4000 });
    const T3 = M.solveAffine3(OLD3, mapBy(fn));
    assert.ok(T3.mirrored);
    near(T3.scaleX, 1.2, 1e-9); near(T3.scaleY, 0.8, 1e-9);
    const p = M.applyPoint(T3, 777, 555), e = fn(777, 555);
    near(p.x, e.x, 1e-6); near(p.y, e.y, 1e-6);
});

t('3점: 한 줄이거나 같은 점이면 null', () => {
    const line = [{ x: 0, y: 0 }, { x: 1000, y: 10 }, { x: 2000, y: 15 }];
    assert.strictEqual(M.solveAffine3(line, OLD3), null);
    assert.strictEqual(M.solveAffine3([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }], OLD3), null);
    assert.strictEqual(M.solveAffine3(OLD3.slice(0, 2), OLD3.slice(0, 2)), null);
});

t('solveTransform: 점 수로 2점·3점을 고른다', () => {
    assert.strictEqual(M.solveTransform(OLD3.slice(0, 2), OLD3.slice(0, 2)).mode, 2);
    assert.strictEqual(M.solveTransform(OLD3, OLD3).mode, 3);
});

t('미세 회전: 중심은 그대로, 90°면 축이 돈다', () => {
    const I = M.solveAffine3(OLD3, OLD3);
    const R = M.adjustTransform(I, { dr: 90, cx: 10, cy: 10 });
    const c = M.applyPoint(R, 10, 10); near(c.x, 10, 1e-9); near(c.y, 10, 1e-9);
    const p = M.applyPoint(R, 20, 10); near(p.x, 10, 1e-9); near(p.y, 20, 1e-9);
    near(R.angleDeg, 90, 1e-9);
});

t('3점 변환으로 사각 영역: 가로세로 배율이 따로 걸린다', () => {
    const T3 = M.solveAffine3(OLD3, mapBy((x, y) => ({ x: 2 * x, y: 0.5 * y })));
    const d = { areaX1: 0, areaY1: 0, areaX2: 10, areaY2: 20, areaShape: 'rect' };
    M.transformDefect(d, T3);
    near(d.areaX2 - d.areaX1, 20); near(d.areaY2 - d.areaY1, 10);
    near((d.areaX1 + d.areaX2) / 2, 10); near((d.areaY1 + d.areaY2) / 2, 5);
    assert.strictEqual(d.areaAngle, undefined);
});

const T = M.solveSimilarity([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 10, y: 20 }, { x: 210, y: 20 }]); // ×2, (10,20) 이동

t('결함 핀: 박스·지시 끝', () => {
    const d = { id: 'a', x: 10, y: 10, targetX: 20, targetY: 30, defectType: '균열' };
    M.transformDefect(d, T);
    assert.deepStrictEqual([d.x, d.y, d.targetX, d.targetY], [30, 40, 50, 80]);
    assert.strictEqual(d.defectType, '균열');
});

t('사각 영역: 가운데·크기, 손그림 점', () => {
    const d = { areaX1: 0, areaY1: 0, areaX2: 10, areaY2: 20, areaShape: 'rect', areaDrawings: [{ points: [{ x: 5, y: 5 }] }] };
    M.transformDefect(d, T);
    assert.deepStrictEqual([d.areaX1, d.areaY1, d.areaX2, d.areaY2], [10, 20, 30, 60]);
    assert.deepStrictEqual(d.areaDrawings[0].points[0], { x: 20, y: 30 });
    assert.strictEqual(d.areaAngle, undefined);
});

t('다각형 영역: 점과 둘레 상자', () => {
    const d = { areaShape: 'polygon', areaX1: 0, areaY1: 0, areaX2: 10, areaY2: 10, areaPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] };
    M.transformDefect(d, T);
    assert.deepStrictEqual(d.areaPoints, [{ x: 10, y: 20 }, { x: 30, y: 20 }, { x: 10, y: 40 }]);
    assert.deepStrictEqual([d.areaX1, d.areaY1, d.areaX2, d.areaY2], [10, 20, 30, 40]);
});

t('회전이 있으면 사각 영역 기울기에 더한다', () => {
    const R = M.solveSimilarity([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    const d = { areaX1: 0, areaY1: 0, areaX2: 10, areaY2: 4, areaAngle: 10 };
    M.transformDefect(d, R);
    near(d.areaAngle, 100);
    near((d.areaX1 + d.areaX2) / 2, -2); near((d.areaY1 + d.areaY2) / 2, 5);
    near(d.areaX2 - d.areaX1, 10); near(d.areaY2 - d.areaY1, 4);
});

t('비파괴 핀·변위 구역', () => {
    const it = { x: 0, y: 0, boxX: 1, boxY: 1, targetX: 2, targetY: 2 };
    M.transformNdtItem(it, T);
    assert.deepStrictEqual([it.x, it.y, it.boxX, it.boxY, it.targetX, it.targetY], [10, 20, 12, 22, 14, 24]);
    const g = { boxX: 0, boxY: 0, points: [{ x: 1, y: 1, level: 3 }] };
    M.transformDispGroup(g, T);
    assert.deepStrictEqual(g.points[0], { x: 12, y: 22, level: 3 });
    assert.deepStrictEqual([g.boxX, g.boxY], [10, 20]);
});

t('위치 떠 두기·되돌리기: 없던 칸은 다시 없앤다', () => {
    const d = { x: 1, y: 2, areaPoints: [{ x: 3, y: 4 }], note: 'x' };
    const snap = M.snapshotPositions(d);
    M.transformDefect(d, T);
    d.targetX = 9;
    M.restorePositions(d, snap);
    assert.deepStrictEqual(d, { x: 1, y: 2, areaPoints: [{ x: 3, y: 4 }], note: 'x' });
});

t('좌표 없는 기록은 건드리지 않는다', () => {
    const d = { id: 'z', surveyExtra: true };
    M.transformDefect(d, T);
    assert.deepStrictEqual(d, { id: 'z', surveyExtra: true });
    assert.strictEqual(M.hasPosition(d), false);
    assert.strictEqual(M.hasPosition({ targetX: 0, targetY: 0 }), true);
});

t('옛 도면 색칠: 흰 바탕 투명, 검은 선 빨강', () => {
    const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    M.tintGhostPixels(px, [200, 0, 0]);
    assert.strictEqual(px[3], 0);
    assert.deepStrictEqual(Array.from(px.slice(4)), [200, 0, 0, 255]);
});

t('옛 도면 보관은 읽기만 — 기기에 저장하는 함수를 부르지 않는다(새 도면이 옛 도면으로 되돌아가던 문제)', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app', '11-cad-import.js'), 'utf8');
    const start = src.indexOf('async function captureFloorDrawingForAlign(');
    const end = src.indexOf('async function captureFloorDrawingForAlignSafe(');
    assert.ok(start > 0 && end > start, '함수 찾기');
    const body = src.slice(start, end).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    ['fetchAndCacheCloudFloorDrawingTier', 'resolveFloorPdfDataUrlAsync', 'resolveBuildingFloorPdf', 'applyResolvedPdfToBuilding',
        'idbGetFloorDrawingTier', 'cacheFloorDrawingTierToDevice', 'idbSet('].forEach((name) => {
        assert.ok(!body.includes(name), `${name} 를 부르면 안 됨`);
    });
});

t('바깥 테두리: 옛(여백 없음) → 새(여백 추가)로 모서리 두 쌍이 비율대로 맞는다', () => {
    const mk = (w, h, x0, y0, x1, y1) => {
        const a = new Uint8Array(w * h).fill(255);
        for (let x = x0; x <= x1; x++) { a[y0 * w + x] = 0; a[y1 * w + x] = 0; }
        for (let y = y0; y <= y1; y++) { a[y * w + x0] = 0; a[y * w + x1] = 0; }
        a[(y0 + 20) * w + (x0 + 20)] = 0; // 짧은 잡선은 무시
        return a;
    };
    const ob = M.findFrameBox(mk(400, 300, 10, 10, 389, 289), 400, 300);
    const nb = M.findFrameBox(mk(400, 300, 30, 25, 369, 274), 400, 300);
    assert.deepStrictEqual(ob, { x0: 10, y0: 10, x1: 389, y1: 289 });
    assert.deepStrictEqual(nb, { x0: 30, y0: 25, x1: 369, y1: 274 });
    const pr = M.frameCornerPairs(ob, nb);
    const T = M.solveSimilarity(pr.oldPts, pr.newPts, { allowRotation: false });
    assert.ok(T.scale < 1 && T.scale > 0.85);
    const p = M.applyPoint(T, 10, 10);
    assert.ok(Math.abs(p.x - 30) < 8 && Math.abs(p.y - 25) < 8);
    assert.strictEqual(M.findFrameBox(new Uint8Array(400 * 300).fill(255), 400, 300), null);
});

t('행·열 선도 마킹과 같은 변환으로 옮겨져 행·열 위치가 그대로다', () => {
    const G = require('../js/shared/grid-lines.js');
    const grid = G.normalizeGrid({
        zones: [{ id: 'z1', name: 'A', rect: { x1: 100, y1: 100, x2: 900, y2: 700 } }],
        groups: [
            { axis: 'col', lines: [{ pts: [{ x: 200, y: 0 }, { x: 200, y: 800 }] }, { pts: [{ x: 600, y: 0 }, { x: 600, y: 800 }] }] },
            { axis: 'row', lines: [{ pts: [{ x: 0, y: 300 }, { x: 1000, y: 300 }] }, { pts: [{ x: 0, y: 500 }, { x: 1000, y: 500 }] }] }
        ]
    });
    const ctx = { rot: 0, w: 1000, h: 800 };
    const pt = { x: 400, y: 400 };
    const before = G.computeGridLocation(grid, [pt], ctx);
    const T = M.solveSimilarity([{ x: 0, y: 0 }, { x: 1000, y: 800 }], [{ x: 50, y: 40 }, { x: 950, y: 760 }], { allowRotation: false });
    assert.strictEqual(G.transformGridInPlace(grid, T), true);
    assert.deepStrictEqual(grid.groups[0].lines[0].pts[0], { x: 230, y: 40 });
    assert.deepStrictEqual(grid.zones[0].rect, { x1: 140, y1: 130, x2: 860, y2: 670 });
    const after = G.computeGridLocation(grid, [M.applyPoint(T, pt.x, pt.y)], ctx);
    assert.deepStrictEqual(JSON.stringify(after && (after.text || after.label || after)), JSON.stringify(before && (before.text || before.label || before)));
});

t('3점 변환(가로세로 배율 다름)도 행·열 선·구역에 마킹과 똑같이 걸린다', () => {
    const G = require('../js/shared/grid-lines.js');
    const grid = G.normalizeGrid({
        zones: [{ id: 'z1', name: 'A', rect: { x1: 100, y1: 100, x2: 900, y2: 700 } }],
        groups: [{ axis: 'col', lines: [{ pts: [{ x: 200, y: 0 }, { x: 200, y: 800 }] }] }]
    });
    const old = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 800 }];
    const T3 = M.solveAffine3(old, old.map((p) => ({ x: 2 * p.x + 10, y: 0.5 * p.y + 20 })));
    assert.strictEqual(G.transformGridInPlace(grid, T3), true);
    assert.deepStrictEqual(grid.groups[0].lines[0].pts[1], { x: 410, y: 420 });
    assert.deepStrictEqual(grid.zones[0].rect, { x1: 210, y1: 70, x2: 1810, y2: 370 });
});

t('구조 부재도 같은 변환으로 — 가운데·크기, 90° 돌면 가로세로 바뀜, 비스듬한 보는 각도', () => {
    const T = { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 };
    assert.deepStrictEqual(M.transformStructMember({ x: 100, y: 50, w: 40, h: 8 }, T), { x: 210, y: 120, w: 80, h: 16, ang: 0 });
    const R = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };   // 90° 회전
    assert.deepStrictEqual(M.transformStructMember({ x: 10, y: 0, w: 40, h: 8 }, R), { x: 0, y: 10, w: 8, h: 40, ang: 0 });
    const m = M.transformStructMember({ x: 0, y: 0, w: 10, h: 2, ang: 30 }, M.solveSimilarity([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 100 * Math.cos(Math.PI / 18), y: 100 * Math.sin(Math.PI / 18) }]));
    assert.ok(Math.abs(m.ang - 40) < 0.02 && Math.abs(m.w - 10) < 0.02 && Math.abs(m.h - 2) < 0.02);
    // 가로·세로 배율이 다르면 막대 방향 따라 길이·두께
    const A = { a: 2, b: 0, c: 0, d: 0.5, e: 0, f: 0 };
    assert.deepStrictEqual(M.transformStructMember({ x: 4, y: 4, w: 10, h: 10 }, A), { x: 8, y: 2, w: 20, h: 5, ang: 0 });
});

t('구조도 그림 맞춤(fit)에 변환을 이어 붙이면 그림 위 점이 마킹과 같이 간다', () => {
    const fit = { a: 0.8, b: 0.1, tx: 30, ty: -5 };
    const F = (p) => ({ x: fit.a * p.x - fit.b * p.y + fit.tx, y: fit.b * p.x + fit.a * p.y + fit.ty });
    const T = M.solveSimilarity([{ x: 0, y: 0 }, { x: 500, y: 300 }], [{ x: 20, y: 40 }, { x: 1020, y: 640 }], { allowRotation: false });
    const nf = M.composeOverlayFit(fit, T);
    [{ x: 0, y: 0 }, { x: 123, y: 456 }, { x: -50, y: 900 }].forEach((p) => {
        const want = M.applyPoint(T, F(p).x, F(p).y);
        const got = { x: nf.a * p.x - nf.b * p.y + nf.tx, y: nf.b * p.x + nf.a * p.y + nf.ty };
        assert.ok(Math.abs(want.x - got.x) < 1e-6 && Math.abs(want.y - got.y) < 1e-6);
    });
    assert.strictEqual(M.composeOverlayFit(null, T), null);
});

console.log(`marking-align: ${n}개 통과`);
