'use strict';
// 2026-10-19 회귀 테스트 — 「네모 박스 먼저 끌기 · 접합부 적용하면 모드 끝 · 부재 고를 때 수정창 유지 · 도면 끌어도 선택 유지」
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'missing ' + name);
    let j = src.indexOf(') {', i) + 2, d = 0; // 기본값 {} 인자 건너뜀
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}

// ── 1) 박스 안이면 화살표 끝(TIP)보다 NO.박스 우선 ──
const H = new Function(`
const state = { rotationAngle: 0, ctx: null };
let activePointerIsTouch = false;
let list = [];
function getCurrentFloorMapPlacedDefects() { return list; }
function getStyleSize() { return { pin: 1, arrow: 1 }; }
function getDefectStyleKey() { return 'k'; }
function getMapTipHitRadius() { return 20; }
function getMapPointerKind() { return activePointerIsTouch ? 'touch' : 'mouse'; }
function getPinBoxDimensions() { return { w: 60, h: 30 }; }
function formatPinNumberLabel(v) { return v; }
function getMapArrowTipHitCenter(tx, ty) { return { x: tx, y: ty }; }
function isPointInsideMarkBox(px, py, bx, by, w, h) { return Math.abs(px - bx) <= w / 2 && Math.abs(py - by) <= h / 2; }
function claimSelectedPinPart() { return null; } // 고른 마킹 없음(선택 우선은 test-selected-hit)
${fn('findHitPinPart')}
return { set: (l) => { list = l; }, hit: findHitPinPart };
`)();
// 화살표 끝(110,100)이 박스(100,100, 60x30) 바로 안쪽·근처
H.set([{ id: 'A', no: 'NO.01', x: 100, y: 100, targetX: 125, targetY: 100 }]);
assert.deepStrictEqual(H.hit(110, 100) && [H.hit(110, 100).defect.id, H.hit(110, 100).part], ['A', 'BOX'], '박스 안: BOX 우선');
assert.strictEqual(H.hit(140, 100).part, 'TIP', '박스 밖으로 나온 화살표 끝 반경: TIP');
// 다른 마킹의 화살표 끝이 이 박스 위에 겹쳐도 박스가 먼저
H.set([
    { id: 'B', no: 'NO.02', x: 100, y: 100, targetX: 300, targetY: 300 },
    { id: 'C', no: 'NO.03', x: 400, y: 400, targetX: 105, targetY: 100 }
]);
const h2 = H.hit(104, 100);
assert.deepStrictEqual([h2.defect.id, h2.part], ['B', 'BOX']);
assert.strictEqual(H.hit(300, 300).part, 'TIP');
assert.strictEqual(H.hit(700, 700), null);

// ── 2) 접합부 적용하면 접합부 고르기 모드 끝(다시 고르려면 단추 다시) ──
const applyJoint = fn('applyJointComponentFromComposer');
assert.ok(/window\._defectComponentJointMode = false;/.test(applyJoint), '적용 단추 → 모드 끔');
const quick = fn('refreshDefectQuickPickBar');
assert.ok(quick.includes('if (jointMode && isJointComponentName(value)) window._defectComponentJointMode = false;'), '접합부 칩 → 모드 끔');
const bindJoint = fn('bindDefectJointComposer');
assert.ok(bindJoint.includes('window._defectComponentJointMode = !window._defectComponentJointMode;'), '단추로 다시 켬(토글) 유지');

// ── 3) 선택 목록 시트(#bsaSelectSheet)를 눌러도 결함 수정창 유지 ──
const K = new Function(`
function isMeasureKeypadTarget() { return false; }
${fn('shouldKeepDefectModalForTarget')}
return shouldKeepDefectModalForTarget;
`)();
const fakeTarget = (inside) => ({ closest: (sel) => (inside.some((x) => sel === x) ? {} : null) });
assert.strictEqual(K(fakeTarget(['#bsaSelectSheet'])), true, '선택 시트는 수정창 밖으로 안 봄');
assert.strictEqual(K(fakeTarget(['#defectModal .defect-drawer-card'])), true);
assert.strictEqual(K(fakeTarget(['#someHeader'])), false, '다른 곳은 그대로 닫힘');

// ── 4) 터치로 도면을 끌면 선택·수정창 그대로, 움직이지 않은 탭만 해제 ──
const start = fn('handleDragStart');
const emptyIdx = start.indexOf('// 도면 빈곳 터치/클릭');
assert.ok(emptyIdx > 0);
const emptyPart = start.slice(emptyIdx, start.indexOf("if (state.mode === 'MARK') {", emptyIdx));
assert.ok(emptyPart.includes('emptyTapPending = { closeModal: closeOnTap, clearSel: clearOnTap, moved: false }'), '터치는 뗄 때까지 미룸');
assert.ok(emptyPart.includes("if (isTouch && state.mode !== 'MARK' && state.mode !== 'AREA')"), '마킹·영역 그리기 모드는 예전대로');
assert.ok(emptyPart.includes("if (!isTouch && state.mode === 'PAN'"), '마우스 빈곳 클릭 해제는 예전대로');
const move = fn('handleDragMove');
assert.ok(move.includes('emptyTapPending.moved = true;'), '끌면 탭 아님');
const end = fn('handleDragEnd');
const endPart = end.slice(end.indexOf('if (emptyTapPending) {'), end.indexOf('if (isMarqueeSelecting) {'));
assert.ok(endPart.includes('if (!tap.moved && movedAtEnd <= TOUCH_DRAG_THRESHOLD)'), '움직이지 않은 탭만');
assert.ok(endPart.includes('closeDefectModal()') && endPart.includes('selectedDefectIds.clear()'));

// 동작 흉내: 미뤄 둔 해제 로직만 따로 돌려 본다
const sim = new Function(`
let emptyTapPending = null, startMouseX = 0, startMouseY = 0;
const TOUCH_DRAG_THRESHOLD = 10;
let selectedDefectIds = new Set(['A']); let modalOpen = true;
function isDefectModalOpen() { return modalOpen; }
function isDefectMarkingGroupPending() { return false; }
function closeDefectModal() { modalOpen = false; selectedDefectIds.clear(); }
function updateMapSelectionBar() {} function drawCanvas() {}
const elements = { planCanvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } };
function moveStep(clientX, clientY) {
    if (emptyTapPending && !emptyTapPending.moved
        && Math.hypot(clientX - startMouseX, clientY - startMouseY) > TOUCH_DRAG_THRESHOLD) {
        emptyTapPending.moved = true;
    }
}
${(() => { const p = endPart; return 'function endStep(clientX, clientY) {' + p + '}'; })()}
return {
    begin(x, y) { startMouseX = x; startMouseY = y; selectedDefectIds = new Set(['A']); modalOpen = false;
        emptyTapPending = { closeModal: false, clearSel: true, moved: false }; },
    moveStep, endStep, sel: () => selectedDefectIds.size
};
`)();
sim.begin(100, 100); sim.moveStep(160, 140); sim.moveStep(102, 100); sim.endStep(102, 100);
assert.strictEqual(sim.sel(), 1, '끌었다 돌아와도 선택 유지');
sim.begin(100, 100); sim.endStep(103, 101);
assert.strictEqual(sim.sel(), 0, '빈 곳 탭은 선택 해제');

console.log('test-map-box-priority-joint-pan-keep: ok');
