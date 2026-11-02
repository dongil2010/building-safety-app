#!/usr/bin/env node
'use strict';
/**
 * 2026-11-02 결함핀 수정창: 키보드가 여러 번에 나눠(작은 resize) 올라와도 창 아래 버튼줄이 키보드 바로 위까지 따라 올라와 멈춘다.
 * (예전: 직전 값과 40px 넘게 차이 날 때만 다시 맞춤 + 0.85배 → 중간에 멈춤)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/core/mobile-keyboard.js'), 'utf8');

function cls() { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; } }; }
function styleObj() { const m = {}; return { _m: m, setProperty: (k, v) => { m[k] = v; }, removeProperty: (k) => { delete m[k]; }, getPropertyValue: (k) => m[k] || '' }; }
function el() { const attrs = {}; return { classList: cls(), style: styleObj(), setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => (k in attrs ? attrs[k] : null), hasAttribute: (k) => k in attrs, removeAttribute: (k) => { delete attrs[k]; }, addEventListener() {}, removeEventListener() {}, querySelector: () => ({ textContent: '', classList: cls() }), insertBefore() {} }; }

function setup(kind) {
    const H = 1000;
    let timers = [];
    const docL = {}; const vvL = {};
    const overlay = el(); overlay.id = 'defectModal'; overlay.classList.add('open');
    const panel = el(); panel.classList.add('modal-card'); panel.classList.add('defect-drawer-card');
    const lift = () => (panel.classList.contains('bsa-kb-lifted') ? parseFloat(panel.style._m['--bsa-kb-lift']) || 0 : 0);
    const root = { classList: cls(), style: styleObj() };
    const maxH = () => { const ih = parseFloat(root.style._m['--bsa-kb-inner-h']); const kb = parseFloat(root.style._m['--bsa-kb-height']) || 0; return panel.classList.contains('bsa-kb-lifted') && isFinite(ih) ? ih - kb - 8 : Infinity; };
    panel.getBoundingClientRect = () => {
        if (kind === 'sheet') { const h = Math.min(600, maxH()); return { top: H - h - lift(), bottom: H - lift() }; }
        const h = Math.min(H, maxH()); return { top: 0 - lift(), bottom: h - lift() }; // 위에서부터 꽉 찬 옆 패널
    };
    panel.closest = (s) => (s === '#defectModal' ? overlay : null);
    overlay.querySelector = () => panel;
    const dbody = el(); dbody.scrollTop = 0;
    dbody.getBoundingClientRect = () => panel.getBoundingClientRect();
    const field = el();
    field.matches = (sel) => sel.indexOf('input[type="text"]') >= 0;
    field.value = '';
    field.getBoundingClientRect = () => { const p = panel.getBoundingClientRect(); const t = p.top + 60 - dbody.scrollTop; return { top: t, bottom: t + 40 }; };
    field.closest = (sel) => {
        if (sel === '[data-bsa-kb-skip]') return null;
        if (sel.indexOf('.modal-overlay') >= 0 || sel === '#defectModal') return overlay;
        if (sel.indexOf('defect-drawer-body') >= 0 || sel.indexOf('.modal-body') >= 0) return dbody;
        return null;
    };
    const vv = { width: 800, height: H, offsetTop: 0, offsetLeft: 0, addEventListener: (t, f) => { vvL[t] = f; } };
    const doc = { readyState: 'complete', activeElement: field, documentElement: root,
        body: { classList: cls(), contains: () => true, appendChild() {} },
        addEventListener: (t, f) => { docL[t] = f; }, getElementById: () => null, querySelector: () => null,
        querySelectorAll: () => [], createElement: () => el() };
    const win = { BSA: {}, matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }), innerWidth: 800, innerHeight: H,
        visualViewport: vv, addEventListener() {}, getComputedStyle: () => ({ transform: 'none', display: 'flex' }) };
    const ctx = { window: win, document: doc, navigator: { maxTouchPoints: 5 }, requestAnimationFrame: (f) => f(),
        setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {} };
    vm.runInNewContext(src, ctx);
    const flush = () => { let n = 0; while (timers.length && n++ < 50) { const t = timers; timers = []; t.forEach((f) => f()); } };
    return { docL, vvL, vv, panel, field, flush, H, root };
}

for (const kind of ['sheet', 'side']) {
    const s = setup(kind);
    s.docL.focusin({ target: s.field }); s.flush();           // 키보드 아직 없음
    // 키보드가 30px씩 나눠 올라옴(한 번에 40px 넘게 바뀌지 않음) → 마지막 400px
    for (let kb = 30; kb <= 390; kb += 30) { s.vv.height = s.H - kb; s.vvL.resize(); }
    s.vv.height = s.H - 400; s.vvL.resize();
    s.flush();                                                   // 키보드 멈춘 뒤(안정) 다시 맞춤
    const visBottom = s.H - 400;
    const pb = s.panel.getBoundingClientRect();
    assert.ok(Math.abs(pb.bottom - visBottom) <= 10, kind + ': 버튼줄(창 아래 끝)이 키보드 바로 위 ' + pb.bottom + ' vs ' + visBottom);
    assert.ok(pb.top >= -1, kind + ': 창 위쪽이 화면 밖으로 안 나감 ' + pb.top);
    const fr = s.field.getBoundingClientRect();
    assert.ok(fr.top >= 0 && fr.bottom <= visBottom, kind + ': 입력칸 보임');
    // 도면 아래 툴바: 아래 시트면 올라간 시트 윗변에 붙음, 옆 패널이면 그대로
    if (kind === 'sheet') {
        assert.ok(s.root.classList.contains('bsa-kb-dock-follow'), 'sheet: 툴바 따라감');
        const db = parseFloat(s.root.style._m['--bsa-kb-dock-bottom']);
        assert.ok(Math.abs(db - (s.H - pb.top)) <= 2, 'sheet: 툴바 = 시트 윗변 ' + db + ' vs ' + (s.H - pb.top));
    } else {
        assert.ok(!s.root.classList.contains('bsa-kb-dock-follow'), 'side: 툴바 그대로');
    }
    // 키보드 내림 → 다시 내려옴
    s.vv.height = s.H; s.vvL.resize(); s.flush();
    assert.ok(Math.abs(s.panel.getBoundingClientRect().bottom - (kind === 'sheet' ? s.H : s.H)) <= 10, kind + ': 키보드 내리면 원위치');
    s.field.closest = () => null; s.docL.focusout({}); s.flush();
    assert.ok(!s.root.classList.contains('bsa-kb-dock-follow') && !('--bsa-kb-dock-bottom' in s.root.style._m), kind + ': 칸 벗어나면 툴바 원래 CSS');
}
console.log('test-mobile-keyboard-staged-resize: ok');
