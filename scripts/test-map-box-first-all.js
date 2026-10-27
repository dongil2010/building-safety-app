#!/usr/bin/env node
'use strict';
/** 2026-10-21 결함위치도: PC·터치 모두 NO.박스 먼저 — 다른 마킹 화살표 끝·위에 그린 영역보다도. 박스 밖 점은 점, 고른 마킹 먼저 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    let j = src.indexOf(') {', i) + 2, d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
}
function make(touch, claimed) {
    return new Function('claimedArg', `
const state = { rotationAngle: 0, ctx: null };
let activePointerIsTouch = ${touch};
let list = [];
function getCurrentFloorMapPlacedDefects() { return list; }
function getStyleSize() { return { pin: 1, arrow: 1 }; }
function getDefectStyleKey() { return 'k'; }
function getMapTipHitRadius(a, t) { return t ? 30 : 20; }
function getMapPointerKind() { return activePointerIsTouch ? 'touch' : 'mouse'; }
function getPinBoxDimensions() { return { w: 60, h: 30 }; }
function formatPinNumberLabel(v) { return v; }
function getMapArrowTipHitCenter(tx, ty) { return { x: tx, y: ty }; }
function isPointInsideMarkBox(px, py, bx, by, w, h) { return Math.abs(px - bx) <= w / 2 && Math.abs(py - by) <= h / 2; }
function ensureAreaPinPlacement() {}
function getAreaAabb(d) { return { w: Math.abs(d.areaX2 - d.areaX1), h: Math.abs(d.areaY2 - d.areaY1) }; }
function areaShapeSupportsRotation() { return false; }
function getAreaShape() { return 'rect'; }
function isPolyPointAreaShape(v) { return v === 'polygon' || v === 'polyline'; }
function isPointInAreaMark(d, x, y, pad) { return x >= Math.min(d.areaX1, d.areaX2) - pad && x <= Math.max(d.areaX1, d.areaX2) + pad && y >= Math.min(d.areaY1, d.areaY2) - pad && y <= Math.max(d.areaY1, d.areaY2) + pad; }
function areaLocalToImg(d, lx, ly) { return { x: (d.areaX1 + d.areaX2) / 2 + lx, y: (d.areaY1 + d.areaY2) / 2 + ly }; }
function areaImgToLocal(d, x, y) { return { x: x - (d.areaX1 + d.areaX2) / 2, y: y - (d.areaY1 + d.areaY2) / 2 }; }
function claimSelectedPinPart() { return claimedArg; }
${fn('findHitPinPart')}
return { set: (l) => { list = l; }, hit: findHitPinPart };
`)(claimed || null);
}
[false, true].forEach((touch) => {
    const H = make(touch);
    // 다른 마킹 C의 화살표 끝이 B 박스 위 → B 박스
    H.set([
        { id: 'B', no: 'NO.02', x: 100, y: 100, targetX: 300, targetY: 300 },
        { id: 'C', no: 'NO.03', x: 400, y: 400, targetX: 105, targetY: 100 }
    ]);
    let h = H.hit(104, 100);
    assert.deepStrictEqual([h.defect.id, h.part], ['B', 'BOX'], 'touch=' + touch);
    // 박스 밖 점 → 점
    h = H.hit(300, 300);
    assert.deepStrictEqual([h.defect.id, h.part], ['B', 'TIP']);
    // 위에 그린 영역(A, 나중 = 위)이 B 박스를 덮어도 B 박스 먼저
    H.set([
        { id: 'B', no: 'NO.02', x: 100, y: 100, targetX: 300, targetY: 300 },
        { id: 'A', no: 'NO.09', shapeType: 'area', areaX1: 0, areaY1: 0, areaX2: 250, areaY2: 250, x: 600, y: 600 }
    ]);
    h = H.hit(100, 100);
    assert.deepStrictEqual([h.defect.id, h.part], ['B', 'BOX'], '영역보다 박스');
    h = H.hit(180, 180);
    assert.deepStrictEqual([h.defect.id, h.part], ['A', 'AREA_MOVE'], '영역 안쪽 이동은 그대로');
});
// 고른 마킹이 먼저(selected-hit) — 그대로 돌려줌
const S = make(false, { defect: { id: 'X' }, part: 'BOX' });
S.set([{ id: 'B', no: 'NO.02', x: 100, y: 100, targetX: 300, targetY: 300 }]);
assert.strictEqual(S.hit(100, 100).defect.id, 'X');
// 고른 마킹 안에서 박스 안이면 박스(selected-hit)
const SH = require('../js/core/selected-hit.js');
const r = SH.claimSelected(100, 100, [{ id: 'S', tip: { x: 102, y: 100 }, tipR: 20, box: { cx: 100, cy: 100, w: 60, h: 30, rot: 0 }, leader: null }], 14);
assert.deepStrictEqual([r.id, r.part], ['S', 'BOX']);
console.log('test-map-box-first-all: ok');
