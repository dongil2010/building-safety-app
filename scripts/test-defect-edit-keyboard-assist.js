#!/usr/bin/env node
'use strict';
/**
 * 2026-11-02 결함핀 수정창(#defectModal): 폰·태블릿 키보드에 입력칸이 가리면
 * 본문 아래 키보드 높이 여백 + 스크롤로 칸을 키보드 위로(맨 위 미리보기 줄은 2026-11-02 뺌).
 * 숫자 키패드 칸(data-bsa-kb-skip)·PC는 그대로.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/core/mobile-keyboard.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function cls() { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; } }; }
function styleObj() { const m = {}; return { _m: m, setProperty: (k, v) => { m[k] = v; }, removeProperty: (k) => { delete m[k]; }, getPropertyValue: (k) => m[k] || '' }; }
function el(tag) {
    const attrs = {}; const listeners = {};
    const e = { tagName: tag, classList: cls(), style: styleObj(), children: [], attrs,
        setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
        hasAttribute: (k) => k in attrs, removeAttribute: (k) => { delete attrs[k]; },
        addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((x) => x !== f); },
        fire: (t) => (listeners[t] || []).forEach((f) => f({ target: e })), listeners };
    return e;
}

function setup(opts) {
    const timers = [];
    const docL = {};
    const body = el('body');
    const appended = [];
    body.appendChild = (x) => { appended.push(x); };
    body.contains = () => true;
    const overlay = el('div'); overlay.id = 'defectModal'; overlay.classList.add('open');
    const panel = el('div'); panel.classList.add('modal-card'); panel.classList.add('defect-drawer-card');
    panel.querySelector = () => null; panel.insertBefore = () => {};
    overlay.querySelector = () => panel;
    const dbody = el('div'); dbody.scrollTop = 0;
    dbody.getBoundingClientRect = () => ({ top: 100, bottom: 800 });
    const label = { textContent: '  비고  ' };
    const field = el('input');
    field.id = 'defectRemark'; field.value = '';
    field.matches = (sel) => sel.indexOf('input[type="text"]') >= 0;
    field.getBoundingClientRect = () => { const t = 620 - (opts.scrollable ? dbody.scrollTop : 0); return { top: t, bottom: t + 40 }; };
    field.closest = (sel) => {
        if (sel === '[data-bsa-kb-skip]') return opts.skip ? field : null;
        if (sel.indexOf('.modal-overlay') >= 0) return overlay;
        if (sel === '#defectModal') return overlay;
        if (sel === '#defectModal .defect-drawer-body') return dbody;
        if (sel.indexOf('.modal-body') >= 0) return dbody;
        return null;
    };
    const mirrorEls = [];
    const doc = {
        readyState: 'complete', body, activeElement: field,
        documentElement: { classList: cls(), style: styleObj() },
        addEventListener: (t, f) => { docL[t] = f; },
        getElementById: () => null,
        querySelector: (s) => (s.indexOf('label[for="defectRemark"]') >= 0 ? label : null),
        querySelectorAll: (s) => (s === '[data-bsa-kb-pad]' ? [dbody].filter((b) => b.hasAttribute('data-bsa-kb-pad')) : []),
        scrollingElement: null,
        createElement: (t) => { const m = el(t); const lab = { textContent: '' }; const val = { textContent: '', classList: cls(), scrollLeft: 0, scrollWidth: 0 };
            m.querySelector = (s) => (s.indexOf('label') >= 0 ? lab : val); m._lab = lab; m._val = val; mirrorEls.push(m); return m; }
    };
    const win = {
        BSA: {}, matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }),
        innerWidth: 800, innerHeight: 1000,
        visualViewport: { width: 800, height: 600, offsetTop: 0, offsetLeft: 0, addEventListener() {} },
        addEventListener() {},
        getComputedStyle: () => ({ transform: 'none', display: 'flex' }),
        CSS: { escape: (s) => s }
    };
    const ctx = { window: win, document: doc, navigator: { maxTouchPoints: 5 }, CSS: win.CSS,
        requestAnimationFrame: (f) => f(), setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout() {} };
    vm.runInNewContext(src, ctx);
    return { docL, field, dbody, mirrorEls, flush: () => { while (timers.length) timers.shift()(); }, doc };
}

// A) 스크롤로 칸이 키보드 위로 → 여백만, 미리보기 없음
{
    const s = setup({ scrollable: true });
    s.docL.focusin({ target: s.field }); s.flush();
    assert.ok(/px$/.test(s.dbody.style._m['padding-bottom'] || ''), '키보드 높이 여백');
    assert.strictEqual(parseInt(s.dbody.style._m['padding-bottom'], 10), 400 + 24);
    assert.ok(s.dbody.scrollTop > 0, '스크롤');
    assert.ok(s.field.getBoundingClientRect().bottom <= 600 - 12, '키보드 위');
    assert.ok(!s.mirrorEls.some((m) => m.id === 'bsaKbMirror' && m.classList.contains('is-open')), '미리보기 없음');
}
// B) 칸을 벗어나면 여백 원래대로, 미리보기 줄은 없음(2026-11-02 사용자 요청으로 뺌)
{
    const s = setup({ scrollable: false });
    s.docL.focusin({ target: s.field }); s.flush();
    assert.strictEqual(s.mirrorEls.filter((x) => x.id === 'bsaKbMirror').length, 0, '미리보기 줄 없음');
    s.doc.activeElement = null; s.docL.focusout({}); s.flush();
    assert.ok(!('padding-bottom' in s.dbody.style._m), '여백 해제');
}
// C) 숫자 키패드 칸(data-bsa-kb-skip)은 건드리지 않음
{
    const s = setup({ scrollable: false, skip: true });
    s.docL.focusin({ target: s.field }); s.flush();
    assert.strictEqual(s.mirrorEls.filter((x) => x.id === 'bsaKbMirror').length, 0);
    assert.ok(!('padding-bottom' in s.dbody.style._m));
}
assert.ok(css.indexOf('bsa-kb-mirror') < 0 && src.indexOf('bsaKbMirror') < 0, '미리보기 줄 코드 없음');
console.log('test-defect-edit-keyboard-assist: ok');
