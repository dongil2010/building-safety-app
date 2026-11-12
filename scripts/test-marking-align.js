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

console.log(`marking-align: ${n}개 통과`);
