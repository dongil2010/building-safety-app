#!/usr/bin/env node
'use strict';
/**
 * 2026-10-27 터치·펜: 마킹 하나를 고른 뒤에도 가까운 다른 마킹을 누를 수 있다.
 * 마우스(PC)는 예전 그대로 — 고른 마킹이 먼저. 반경 순서: 마우스 < 펜 < 손가락.
 * 진짜 findHitPinPart / claimSelectedPinPart / getMapTipHitRadius 에 가짜 마킹을 넣어 확인(실데이터 없음).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i >= 0, name + ' missing');
    let j = src.indexOf(') {', i) + 2, d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
}
function constant(name) {
    const m = src.match(new RegExp('const ' + name + ' = [^;]+;'));
    assert.ok(m, name + ' missing');
    return m[0];
}
const SH = require('../js/core/selected-hit.js');

function make() {
    return new Function('SH', `
const window = { BSA: { selectedHit: SH } };
const state = { rotationAngle: 0, ctx: null, tipShape: 'circle' };
let activePointerIsTouch = false;
let mapLastPointerType = 'mouse';
let selectedDefectIds = new Set();
let list = [];
function getCurrentFloorMapPlacedDefects() { return list; }
function getStyleSize() { return { pin: 1, arrow: 1 }; }
function getDefectStyleKey() { return 'k'; }
function getMapCanvasViewScale() { return 1; }
function getArrowVisualTipRadius(s) { return 6 * s; }
function getArrowTouchCharacteristicSize(s) { return 12 * s; }
function getPinBoxDimensions() { return { w: 60, h: 30 }; }
function formatPinNumberLabel(v) { return v; }
function getMapArrowTipHitCenter(tx, ty) { return { x: tx, y: ty }; }
function isPointInsideMarkBox(px, py, bx, by, w, h) { return Math.abs(px - bx) <= w / 2 && Math.abs(py - by) <= h / 2; }
function ensureAreaPinPlacement() {}
function isPointInAreaMark() { return false; }
function getAreaAabb(d) { return { w: 1, h: 1 }; }
function areaShapeSupportsRotation() { return false; }
function getAreaShape() { return 'rect'; }
function isPolyPointAreaShape() { return false; }
function areaLocalToImg() { return { x: 0, y: 0 }; }
function areaImgToLocal() { return { x: 0, y: 0 }; }
${constant('MAP_TIP_MIN_TOUCH_DIAMETER_CSS')}
${constant('MAP_TIP_MIN_PEN_DIAMETER_CSS')}
${fn('getMapTipHitRadius')}
${fn('getMapPointerKind')}
${constant('SELECTED_CLAIM_PAD_CSS')}
${fn('claimSelectedPinPart')}
${fn('findHitPinPart')}
return {
    set: (l, sel) => { list = l; selectedDefectIds = new Set(sel || []); },
    as: (kind) => { mapLastPointerType = kind; activePointerIsTouch = kind === 'touch'; },
    hit: findHitPinPart,
    radius: (kind) => getMapTipHitRadius(1, kind === 'touch', kind)
};
`)(SH);
}
const H = make();
const id = (h) => (h ? h.defect.id + ':' + h.part : null);

// 반경 크기 순서: 마우스 < 펜 < 손가락
const rm = H.radius('mouse'), rp = H.radius('pen'), rf = H.radius('touch');
assert.ok(rm < rp && rp < rf, `mouse(${rm}) < pen(${rp}) < finger(${rf})`);
assert.deepStrictEqual([rm, rp, rf], [7, 20, 26]);
console.log('tip hit radius (css px @1x): mouse', rm, ' pen', rp, ' finger', rf);

// A(고른 것): 점(100,100), 박스(100,300). B(이웃): 점(125,100), 박스(400,400)
const A = { id: 'A', no: 'NO.01', x: 100, y: 300, targetX: 100, targetY: 100 };
const B = { id: 'B', no: 'NO.02', x: 400, y: 400, targetX: 125, targetY: 100 };

// 마우스: 고른 마킹이 먼저(예전 그대로) — B 쪽 18px 지점도 A
H.as('mouse'); H.set([A, B], ['A']);
assert.strictEqual(id(H.hit(118, 100)), 'A:TIP', '마우스: 고른 마킹 우선(변경 없음)');
assert.strictEqual(id(H.hit(125, 100)), 'B:TIP', '마우스: B 점 정확히 누르면 B');

// 손가락: 이웃 B가 더 가까우면 B (고른 A의 넓은 반경이 삼키지 않음)
H.as('touch'); H.set([A, B], ['A']);
assert.strictEqual(id(H.hit(118, 100)), 'B:TIP', '손가락: B가 더 가까움 → B');
assert.strictEqual(id(H.hit(103, 100)), 'A:TIP', '손가락: 고른 A의 점 바로 위면 A(드래그 대상)');
assert.strictEqual(id(H.hit(140, 100)), 'B:TIP');
assert.strictEqual(id(H.hit(100 - 20, 100)), 'A:TIP', 'A에서 20, B에서 45 → A(가장 가까움)');

// 펜: 손가락보다 좁고 마우스보다 넓다
H.as('pen'); H.set([A, B], ['A']);
assert.strictEqual(id(H.hit(118, 100)), 'B:TIP', '펜: B가 더 가까움 → B');
assert.strictEqual(id(H.hit(103, 100)), 'A:TIP');
assert.strictEqual(id(H.hit(125, 119)), 'B:TIP', '펜: 점에서 19px(반경 20 안) → B');
assert.strictEqual(id(H.hit(125, 123)), null, '펜: 점에서 23px(반경 20 밖) → 안 눌림');
H.as('touch');
assert.strictEqual(id(H.hit(125, 123)), 'B:TIP', '손가락: 같은 지점 23px(반경 26 안) → B');
H.as('mouse'); H.set([A, B], []);
assert.strictEqual(id(H.hit(125, 105)), 'B:TIP', '마우스 반경 7 안');
assert.strictEqual(id(H.hit(125, 112)), null, '마우스: 점에서 12px는 안 눌림(변경 없음)');

// 박스 우선(2026-10-21): 고른 A의 박스 위에 B 점이 겹쳐도 박스, 이웃 박스 위는 이웃 박스
const A2 = { id: 'A', no: 'NO.01', x: 100, y: 300, targetX: 100, targetY: 100 };
const B2 = { id: 'B', no: 'NO.02', x: 400, y: 400, targetX: 110, targetY: 300 };
['touch', 'pen'].forEach((k) => {
    H.as(k); H.set([A2, B2], ['A']);
    assert.strictEqual(id(H.hit(110, 300)), 'A:BOX', k + ': 박스 위는 박스 우선');
});
const A3 = { id: 'A', no: 'NO.01', x: 100, y: 300, targetX: 190, targetY: 100 };
const B3 = { id: 'B', no: 'NO.02', x: 205, y: 100, targetX: 600, targetY: 600 };
['touch', 'pen'].forEach((k) => {
    H.as(k); H.set([A3, B3], ['A']);
    assert.strictEqual(id(H.hit(205, 100)), 'B:BOX', k + ': 이웃 마킹 박스 위를 누르면 이웃 박스');
});

// 고른 마킹이 없으면 가장 가까운 점
['touch', 'pen'].forEach((k) => {
    H.as(k); H.set([A, B], []);
    assert.strictEqual(id(H.hit(112, 100)), 'A:TIP', k + ': 가까운 쪽(A 12 vs B 13)');
    assert.strictEqual(id(H.hit(114, 100)), 'B:TIP', k + ': 가까운 쪽(A 14 vs B 11)');
});

// 배선: 판정 종류는 pointerType으로, 끌기는 문턱값·꾹 누름 뒤에만(기존)
assert.ok(/mapLastPointerType === 'pen'\) return 'pen'/.test(src));
assert.ok(/const tipR = getMapTipHitRadius\(arrowScale, activePointerIsTouch, ptrKindHit\)/.test(src));
assert.ok(/if \(!pendingDragArmed\) \{\s*if \(dist <= threshold\) return;/.test(src), '꾹 누르기 전 이동은 도면 이동(마킹 안 끌림)');
console.log('test-touch-pen-nearest-hit: ok');
