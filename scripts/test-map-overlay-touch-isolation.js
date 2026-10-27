const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

function slice(startRe, endRe) {
    const s = app.search(startRe);
    assert(s >= 0, 'start not found: ' + startRe);
    const rest = app.slice(s);
    const e = rest.search(endRe);
    assert(e > 0, 'end not found: ' + endRe);
    return rest.slice(0, e);
}
const src = slice(/const MAP_FLOATING_OVERLAY_SELECTOR/, /function getMapCanvasCursor\(\)/);

function makeEnv(flags) {
    const f = Object.assign({ isDragging: false, isMarkingDrag: false, isAreaDrag: false, isAreaInkDrag: false, isDraggingPin: false,
        isDraggingPinGroup: false, pendingDragHit: null, isDraggingLegend: false, isResizingLegend: false, isMarqueeSelecting: false, isPinching: false }, flags || {});
    const listeners = {};
    const host = { addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); } };
    const fakeDoc = { getElementById: (id) => (id === 'canvasContainer' ? host : null) };
    const body = `let mapSuppressMouseUntil = 0;
        const { ${Object.keys(f).join(', ')} } = __f;
        const document = __doc;
        ${src}
        return { isMapFloatingOverlayTarget, isMapGestureInProgress, bindMapFloatingOverlayIsolation, get sup() { return mapSuppressMouseUntil; } };`;
    const api = new Function('__f', '__doc', body)(f, fakeDoc);
    return { api, host, listeners };
}
const overlayEl = (id) => ({ closest: (sel) => (sel.split(',').map((x) => x.trim()).includes(id) ? {} : null) });
const popup = overlayEl('#mapSelectedDefectPopup');
const plainCanvas = { closest: () => null };
const ev = (type, target, extra) => {
    const e = Object.assign({ type, target, stopped: false, stopPropagation() { this.stopped = true; } }, extra || {});
    return e;
};

// 1) 오버레이 판별
{
    const { api } = makeEnv();
    assert(api.isMapFloatingOverlayTarget(popup), 'popup is overlay');
    ['#markShapeBar', '#areaPolyTouchBar', '#areaPolygonRedrawBanner', '#areaToolPanel', '#mapStyleSizeToolbar', '#evalUnitBar', '#mapGuideBar', '#mapCountBar']
        .forEach((id) => assert(api.isMapFloatingOverlayTarget(overlayEl(id)), id));
    assert(!api.isMapFloatingOverlayTarget(plainCanvas), 'canvas is not overlay');
    assert(!api.isMapFloatingOverlayTarget(null));
}

// 2) 컨테이너에 격리 리스너가 붙고, 한 번만 붙는다
{
    const { api, host, listeners } = makeEnv();
    api.bindMapFloatingOverlayIsolation();
    api.bindMapFloatingOverlayIsolation();
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel'].forEach((t) => {
        assert.strictEqual((listeners[t] || []).length, 1, t + ' bound once');
    });
}

// 3) 팝업 터치/클릭은 위로 못 퍼지고, 뒤따르는 합성 마우스를 막는다
{
    const { api, listeners } = makeEnv();
    api.bindMapFloatingOverlayIsolation();
    const call = (t, target, extra) => { const e = ev(t, target, extra); listeners[t][0](e); return e; };
    for (const t of ['touchstart', 'touchend', 'mousedown', 'touchcancel']) {
        assert(call(t, popup).stopped, t + ' on popup must stop');
    }
    assert(api.sup > Date.now() + 500, 'synthetic mouse suppressed after touch on popup');
    assert(call('pointerdown', popup, { pointerType: 'touch' }).stopped);
    assert(call('pointerdown', popup, { pointerType: 'pen' }).stopped);
    assert(call('pointerup', popup, { pointerType: 'touch' }).stopped);
    // 도면 자체는 건드리지 않는다
    for (const t of ['touchstart', 'touchend', 'mousedown', 'mouseup']) {
        assert(!call(t, plainCanvas).stopped, t + ' on canvas must pass');
    }
}

// 4) 마우스: 도면에서 끌다가 팝업 위에서 놓아도 끌기 종료가 막히지 않는다
{
    const idle = makeEnv();
    idle.api.bindMapFloatingOverlayIsolation();
    assert(idle.listeners.mouseup[0].call(null, Object.assign(ev('mouseup', popup), {})) === undefined);
    const dragging = makeEnv({ isDragging: true });
    dragging.api.bindMapFloatingOverlayIsolation();
    const up = ev('mouseup', popup);
    dragging.listeners.mouseup[0](up);
    assert(!up.stopped, 'mouseup during canvas drag must propagate');
    const pup = ev('pointerup', popup, { pointerType: 'mouse' });
    dragging.listeners.pointerup[0](pup);
    assert(!pup.stopped, 'mouse pointerup must propagate');
    assert(dragging.api.sup === 0, 'mouse events do not arm the ghost-click guard');
}

// 5) 마우스 pointerdown 은 막되 합성 억제는 걸지 않는다 (PC 클릭 지연 방지)
{
    const { api, listeners } = makeEnv();
    api.bindMapFloatingOverlayIsolation();
    const e = ev('pointerdown', popup, { pointerType: 'mouse' });
    listeners.pointerdown[0](e);
    assert(e.stopped && api.sup === 0);
}

// 6) 배선(정적) 확인
assert(/bindMapFloatingOverlayIsolation\(\);\s*\n\s*\/\/ Mouse Events/.test(app), 'isolation is bound before canvas mouse events');
assert(/addEventListener\('touchstart', \(e\) => \{\s*\n\s*if \(isMapFloatingOverlayTarget\(e\.target\)\) return;/.test(app), 'canvas touchstart ignores overlay targets');
assert(/addEventListener\('pointerdown', \(e\) => \{\s*\n\s*if \(isMapFloatingOverlayTarget\(e\.target\)\) return;/.test(app), 'canvas pointerdown ignores overlay targets');
assert(/if \(isMapFloatingOverlayTarget\(e\.target\)\) return;\s*\n\s*if \(window\.cadCalibrationState && e\.button === 0\)/.test(app), 'canvas mousedown ignores overlay targets');
assert(/popup\.onclick = \(e\) => \{\s*\n\s*e\.stopPropagation\(\);/.test(app), 'popup click stops propagation');
assert(/if \(sel\.size > 1 && !d\.groupId\) return;/.test(app), 'multi-select popup body tap is inert');
assert(/\.map-selected-defect-popup,\s*\n\.mark-shape-bar,[\s\S]*?touch-action: pan-x pan-y;/.test(css), 'popup touch-action css');
console.log('test-map-overlay-touch-isolation: ok');
