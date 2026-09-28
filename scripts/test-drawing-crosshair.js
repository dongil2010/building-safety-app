#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 도면 CAD 커서식 십자선 회귀 테스트 (가짜 DOM — 실제 브라우저 렌더링은 확인 못 함)
 *  1) PC 마우스가 도면 캔버스 위에 있을 때만 커서를 지나는 십자선, 툴바·팝업 위·범례 위·도면 밖은 숨김
 *  2) 터치·펜 포인터는 호버 십자선 없음, 팬·핀치 중에도 없음
 *  3) 마킹을 끌 때는 손가락/커서가 아니라 마킹의 실제 위치(화살표 끝·번호칸 중심)를 지나는 십자선
 *  4) 켜기/끄기는 localStorage 에 저장, 끄면 숨김
 *  5) 비파괴 도면 회전 역변환이 viewToNdtImgCoords 와 맞음
 *  6) 캔버스에 그리지 않음(출력물에 섞이지 않음) · 버튼·CSS 존재
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function blockFrom(s, startIdx, bodyIdx) {
    let depth = 0;
    for (let i = bodyIdx; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return s.slice(startIdx, i + 1);
        }
    }
    throw new Error('unterminated block');
}
function extractFunction(name) {
    const m = new RegExp('\\n\\s*function ' + name + '\\s*\\(').exec(src);
    assert.ok(m, 'missing function ' + name);
    return blockFrom(src, m.index + 1, src.indexOf(') {', m.index) + 2);
}

const a = src.indexOf('// @@DRAWING_CROSSHAIR_START');
const b = src.indexOf('// @@DRAWING_CROSSHAIR_END');
assert.ok(a > 0 && b > a, 'crosshair markers');
const region = src.slice(a, b);

// ---------- 가짜 DOM ----------
function makeEl(id, rect) {
    const el = {
        id, children: [], parentElement: null, hidden: false, className: '', attrs: {},
        style: {}, clientLeft: 0, clientTop: 0, _rect: rect || { left: 0, top: 0, width: 0, height: 0 },
        _classes: new Set(),
        getBoundingClientRect() { return { ...this._rect, right: this._rect.left + this._rect.width, bottom: this._rect.top + this._rect.height }; },
        appendChild(c) { c.parentElement = this; this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentElement = null; },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        addEventListener(type, fn) { (this._ls = this._ls || {})[type] = fn; }
    };
    el.classList = {
        toggle: (c, on) => { if (on === undefined ? !el._classes.has(c) : on) el._classes.add(c); else el._classes.delete(c); },
        contains: (c) => el._classes.has(c)
    };
    return el;
}

const listeners = {};
const store = {};
const ids = {};
let rafQueue = [];
const env = {
    window: {
        state: { currentTab: 'tab-map' },
        addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
        showToast() {}
    },
    document: {
        getElementById: (id) => ids[id] || null,
        createElement: () => makeEl(''),
        addEventListener() {},
        documentElement: { addEventListener() {} }
    },
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; }
};
function flush() {
    const q = rafQueue;
    rafQueue = [];
    q.forEach((fn) => fn());
}
function fire(type, e) { (listeners[type] || []).forEach((fn) => fn(e)); }

// 컨테이너(0,0 800x600) 안 캔버스(10,50 부터 780x540)
ids.canvasContainer = makeEl('canvasContainer', { left: 100, top: 100, width: 800, height: 600 });
ids.planCanvas = makeEl('planCanvas', { left: 110, top: 150, width: 780, height: 540 });
ids.ndtCanvasContainer = makeEl('ndtCanvasContainer', { left: 0, top: 0, width: 500, height: 400 });
ids.ndtCanvas = makeEl('ndtCanvas', { left: 0, top: 0, width: 500, height: 400 });
const toolbar = makeEl('toolbar');
['btnToggleCrosshair', 'mobileBtnCrosshair', 'btnToggleCrosshairNdt', 'mobileNdtBtnCrosshair'].forEach((id) => { ids[id] = makeEl(id); });

const STATE_VARS = {
    isPinching: false, isDragging: false, isDraggingLegend: false, isResizingLegend: false, isDraggingPinGroup: false,
    groupDragLastImgX: 0, groupDragLastImgY: 0, isDraggingPin: false, activeDragPin: null, activeDragPart: 'BOX',
    isMarkingDrag: false, markPreviewTargetX: 0, markPreviewTargetY: 0, isAreaDrag: false, areaCurImgX: 0, areaCurImgY: 0,
    pendingDragHit: null, pendingDragArmed: false, pendingDragIsTouch: false,
    isNdtPinching: false, isNdtDragging: false, isDraggingNdtDisplacement: false, activeDragNdtDisplacementGroup: null,
    activeDragNdtDisplacementPoint: null, isDraggingNdtPinGroup: false, ndtGroupDragLastX: 0, ndtGroupDragLastY: 0,
    isDraggingNdtPin: false, activeDragNdtPin: null, dragNdtPart: 'box', isNdtMarkingDrag: false,
    pendingNdtPinHit: null, pendingNdtPinArmed: false, pendingNdtPinIsTouch: false,
    ndtRotationAngle: 0, ndtBgImage: null, legendHit: false
};
let code = 'const window = env.window, document = env.document, localStorage = env.localStorage, requestAnimationFrame = env.requestAnimationFrame;\n';
code += 'const state = { view: { offsetX: 20, offsetY: 30, scale: 2 }, rotationAngle: 0 };\n';
code += 'let ndtView = { offsetX: 5, offsetY: 7, scale: 0.5 };\n';
code += Object.keys(STATE_VARS).map((k) => 'let ' + k + ' = ' + JSON.stringify(STATE_VARS[k]) + ';').join('\n') + '\n';
code += 'function getFloorPlanDisplayDims() { return { w: 1000, h: 800 }; }\n';
code += extractFunction('imgToViewCoords') + '\n' + extractFunction('viewToImgCoords') + '\n';
code += extractFunction('getDefectMarkingImgCenter') + '\n' + extractFunction('viewToNdtImgCoords') + '\n';
code += 'function clientToImgCoords(cx, cy) { const r = document.getElementById("planCanvas").getBoundingClientRect(); return viewToImgCoords((cx - r.left - state.view.offsetX) / state.view.scale, (cy - r.top - state.view.offsetY) / state.view.scale); }\n';
code += 'function hitTestLegendBox() { return legendHit ? { part: "body" } : null; }\n';
code += region + '\n';
code += 'return { state, getView: () => ndtView, set: (k, v) => { eval(k + " = v"); }, ' +
    'requestDrawingCrosshairUpdate, setupDrawingCrosshairToggleButtons, setDrawingCrosshairEnabled, ' +
    'ndtImgToCanvasLocal, viewToNdtImgCoords, mapImgToCanvasLocal, isEnabled: () => drawingCrosshairEnabled };';
const api = new Function('env', code)(env);

function overlay(containerId) {
    return ids[containerId].children.find((c) => c.className === 'drawing-crosshair') || null;
}
function visible(containerId) {
    const o = overlay(containerId);
    return !!o && !o.hidden;
}
function center(containerId) {
    // 오른쪽 가로선 시작점 = x + gap + 1, 아래 세로선 시작점 = y + gap + 1
    const o = overlay(containerId);
    const m1 = /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(o.children[1].style.transform);
    const m3 = /translate3d\(([-\d.]+)px,([-\d.]+)px/.exec(o.children[3].style.transform);
    return { x: Number(m3[1]), y: Number(m1[2]), right: Number(m1[1]), below: Number(m3[2]) };
}
function mouse(target, clientX, clientY, type) {
    fire(type || 'pointermove', { pointerType: 'mouse', target, clientX, clientY });
    flush();
}

// ---------- 1) 마우스 호버 ----------
api.setupDrawingCrosshairToggleButtons();
assert.strictEqual(api.isEnabled(), true, 'default ON');
assert.strictEqual(ids.btnToggleCrosshair.attrs['aria-pressed'], 'true');
mouse(ids.planCanvas, 410, 350);
assert.ok(visible('canvasContainer'), 'hover shows');
let o = overlay('canvasContainer');
assert.deepStrictEqual([o.style.left, o.style.top, o.style.width, o.style.height], ['10px', '50px', '780px', '540px']);
let c = center('canvasContainer');
assert.strictEqual(c.x, 300);
assert.strictEqual(c.y, 200);
assert.strictEqual(c.right, 300 + 6 + 1);
assert.ok(!o.classList.contains('is-dragging'));
assert.strictEqual(o.attrs['aria-hidden'], 'true');
// 툴바·팝업 위 → 숨김
mouse(toolbar, 410, 160);
assert.ok(!visible('canvasContainer'), 'hidden over toolbar');
mouse(ids.planCanvas, 410, 350);
assert.ok(visible('canvasContainer'));
// 범례 위 → 숨김
api.set('legendHit', true);
mouse(ids.planCanvas, 420, 350);
assert.ok(!visible('canvasContainer'), 'hidden over legend');
api.set('legendHit', false);
// 다른 탭이면 숨김
env.window.state.currentTab = 'tab-ndt';
mouse(ids.planCanvas, 410, 350);
assert.ok(!visible('canvasContainer'), 'hidden on other tab');
env.window.state.currentTab = 'tab-map';
mouse(ids.planCanvas, 410, 350);
assert.ok(visible('canvasContainer'));
// 줌·팬(drawCanvas) 후에도 커서 위치 유지
api.state.view.scale = 3;
api.requestDrawingCrosshairUpdate();
flush();
assert.strictEqual(center('canvasContainer').x, 300);
api.state.view.scale = 2;

// ---------- 2) 터치·펜 ----------
fire('pointerdown', { pointerType: 'touch', target: ids.planCanvas, clientX: 200, clientY: 200 });
flush();
assert.ok(!visible('canvasContainer'), 'touch clears hover');
fire('pointermove', { pointerType: 'touch', target: ids.planCanvas, clientX: 300, clientY: 300 });
flush();
assert.ok(!visible('canvasContainer'), 'no hover for touch');
fire('pointermove', { pointerType: 'pen', target: ids.planCanvas, clientX: 300, clientY: 300 });
flush();
assert.ok(!visible('canvasContainer'), 'no hover for pen');
// 한 손가락 팬
api.set('isDragging', true);
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'), 'no crosshair while panning');
api.set('isDragging', false);

// ---------- 3) 마킹 끌기 ----------
const pin = { id: 'd1', x: 100, y: 60, targetX: 120, targetY: 90 };
api.set('isDraggingPin', true);
api.set('activeDragPin', pin);
api.set('activeDragPart', 'TIP');
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(visible('canvasContainer'), 'drag shows');
o = overlay('canvasContainer');
assert.ok(o.classList.contains('is-dragging'));
c = center('canvasContainer');
// view: offset(20,30) + img*2
assert.deepStrictEqual([c.x, c.y], [20 + 120 * 2, 30 + 90 * 2], 'TIP → arrow tip, not finger');
api.set('activeDragPart', 'BOX');
api.requestDrawingCrosshairUpdate();
flush();
c = center('canvasContainer');
assert.deepStrictEqual([c.x, c.y], [20 + 100 * 2, 30 + 60 * 2], 'BOX → box center');
// 회전 도면(90°)도 실제 위치
api.state.rotationAngle = 90;
assert.deepStrictEqual(api.mapImgToCanvasLocal(100, 60), { x: 20 + (800 - 60) * 2, y: 30 + 100 * 2 });
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'), 'rotated position is off-canvas here → hidden');
api.state.rotationAngle = 0;
// 영역 이동 → 영역 중심, 회전 손잡이 → 없음
const area = { id: 'a1', shapeType: 'area', areaX1: 10, areaY1: 20, areaX2: 50, areaY2: 60, x: 0, y: 0 };
api.set('activeDragPin', area);
api.set('activeDragPart', 'AREA_MOVE');
api.requestDrawingCrosshairUpdate();
flush();
c = center('canvasContainer');
assert.deepStrictEqual([c.x, c.y], [20 + 30 * 2, 30 + 40 * 2]);
api.set('activeDragPart', 'AREA_ROTATE');
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'), 'no crosshair for rotate handle');
api.set('isDraggingPin', false);
api.set('activeDragPin', null);
// 새 핀 마킹 끌기 → 스냅된 화살표 끝
api.set('isMarkingDrag', true);
api.set('markPreviewTargetX', 50);
api.set('markPreviewTargetY', 40);
api.requestDrawingCrosshairUpdate();
flush();
c = center('canvasContainer');
assert.deepStrictEqual([c.x, c.y], [120, 110]);
api.set('isMarkingDrag', false);
// 터치로 길게 눌러 잡은 상태(아직 이동 전)
api.set('pendingDragHit', { hitInfo: { defect: pin, part: 'TIP' }, imgX: 0, imgY: 0 });
api.set('pendingDragArmed', true);
api.set('pendingDragIsTouch', true);
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(visible('canvasContainer'), 'armed touch hold shows');
// 마우스로 핀을 누르기만 한 상태(pending)는 커서 호버와 같게(마킹 위치로 튀지 않음)
api.set('pendingDragIsTouch', false);
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'));
api.set('pendingDragHit', null);
api.set('pendingDragArmed', false);
// 핀치 중에는 끌기 상태여도 숨김
api.set('isDraggingPin', true);
api.set('activeDragPin', pin);
api.set('activeDragPart', 'TIP');
api.set('isPinching', true);
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'), 'hidden while pinching');
api.set('isPinching', false);
// 마킹이 화면 밖으로 나가면 숨김
pin.targetX = 5000;
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('canvasContainer'), 'hidden when off-canvas');
api.set('isDraggingPin', false);
api.set('activeDragPin', null);

// ---------- 5) 비파괴 도면 ----------
env.window.state.currentTab = 'tab-ndt';
api.set('ndtBgImage', { naturalWidth: 900, naturalHeight: 700 });
[0, 90, 180, 270].forEach((ang) => {
    api.set('ndtRotationAngle', ang);
    const v = api.getView();
    const p = api.ndtImgToCanvasLocal(123, 456);
    const back = api.viewToNdtImgCoords((p.x - v.offsetX) / v.scale, (p.y - v.offsetY) / v.scale);
    assert.ok(Math.abs(back.x - 123) < 1e-9 && Math.abs(back.y - 456) < 1e-9, 'ndt inverse ' + ang);
});
api.set('ndtRotationAngle', 0);
const gauge = { id: 'g1', x: 100, y: 100, boxX: 200, boxY: 150, targetX: 100, targetY: 100 };
api.set('isDraggingNdtPin', true);
api.set('activeDragNdtPin', gauge);
api.set('dragNdtPart', 'box');
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(visible('ndtCanvasContainer'), 'ndt drag shows');
c = center('ndtCanvasContainer');
assert.deepStrictEqual([c.x, c.y], [5 + 200 * 0.5, 7 + 150 * 0.5]);
assert.ok(!visible('canvasContainer'), 'map crosshair hidden on ndt tab');
api.set('isDraggingNdtPin', false);
api.set('activeDragNdtPin', null);
api.requestDrawingCrosshairUpdate();
flush();
assert.ok(!visible('ndtCanvasContainer'), 'ndt release hides');
env.window.state.currentTab = 'tab-map';

// ---------- 4) 켜기/끄기 ----------
mouse(ids.planCanvas, 410, 350);
assert.ok(visible('canvasContainer'));
ids.mobileBtnCrosshair._ls.click();
flush();
assert.strictEqual(api.isEnabled(), false);
assert.strictEqual(store.bsa_drawing_crosshair_v1, '0');
assert.ok(!visible('canvasContainer'), 'off hides');
assert.ok(!ids.btnToggleCrosshair.classList.contains('active'));
assert.strictEqual(ids.btnToggleCrosshairNdt.attrs['aria-pressed'], 'false');
mouse(ids.planCanvas, 420, 360);
assert.ok(!visible('canvasContainer'), 'stays hidden when off');
api.setDrawingCrosshairEnabled(true);
flush();
assert.strictEqual(store.bsa_drawing_crosshair_v1, '1');
assert.ok(visible('canvasContainer'));

// ---------- 6) 출력물·마크업 ----------
assert.ok(!/getContext|ctx\.|drawImage|toDataURL/.test(region), 'crosshair never draws on a canvas');
assert.ok(/pointer-events:\s*none/.test(css.slice(css.indexOf('.drawing-crosshair {'))), 'css pointer-events none');
assert.ok(/@media print[\s\S]*?\.drawing-crosshair/.test(css), 'hidden in print');
['btnToggleCrosshair', 'mobileBtnCrosshair', 'btnToggleCrosshairNdt', 'mobileNdtBtnCrosshair'].forEach((id) => {
    assert.ok(html.includes('id="' + id + '"'), 'button ' + id);
});
assert.ok(/function drawCanvas\(opts\) \{\s*opts = opts \|\| \{\};\s*requestDrawingCrosshairUpdate\(\);/.test(src), 'drawCanvas hook');
assert.ok(/function drawNdtCanvas\(\) \{\s*requestDrawingCrosshairUpdate\(\);/.test(src), 'drawNdtCanvas hook');
assert.ok(src.includes('    setupDrawingCrosshairToggleButtons();\n'), 'toggle wired');

console.log('test-drawing-crosshair: ok');
