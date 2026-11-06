#!/usr/bin/env node
'use strict';
/**
 * 2026-11-06: 직접 입력 자식 팝업(js/shared/typing-popup.js)
 * 완료/취소·Esc·바깥 누르기·뒤로가기는 팝업만 닫고, 부모 결함/NDT 수정창은 유지한다.
 *
 * 원인: 결함 창 바깥 pointerdown 캡처가 body에 붙은 팝업을 창 밖으로 보고 closeDefectModal()을 불렀다.
 *       Esc 는 팝업 입력칸에서 부모 단축키(수정창 닫기)로 새었다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js/shared/typing-popup.js'), 'utf8');

function extractFunction(name) {
    const start = APP.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'missing ' + name);
    let i = APP.indexOf('{', start);
    let depth = 0;
    for (; i < APP.length; i++) {
        const c = APP[i];
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return APP.slice(start, i + 1);
        }
    }
    throw new Error('unterminated ' + name);
}

// ── 정적: 부모 창 유지·뒤로가기·공유 소비자 ──────────────────────────────
{
    const keepFn = extractFunction('shouldKeepDefectModalForTarget');
    assert.ok(/#bsaTypingPopup, \.bsa-typing-overlay/.test(keepFn), 'shouldKeep 가 입력 팝업을 창 안으로 본다');

    const keepAt = APP.indexOf('function shouldKeepDefectModalForTarget(');
    const closerAt = APP.indexOf("document.addEventListener('pointerdown'", keepAt);
    const closer = APP.slice(closerAt, closerAt + 280);
    assert.ok(/shouldKeepDefectModalForTarget\(e\.target\)/.test(closer), '바깥 누르기 닫기는 shouldKeep 를 탄다');
    assert.ok(/closeDefectModal\(\);\s*\}, true\)/.test(closer), '바깥 누르기는 캡처 단계(팝업 stopPropagation 보다 먼저)');

    const back = extractFunction('handleAppBackPress');
    const iDlg = back.indexOf('window.appDialog');
    const iPop = back.indexOf('BsaTypingPopup');
    const iTop = back.indexOf('tryCloseTopOverlayForBack');
    assert.ok(iPop > 0, '뒤로가기 = 입력 팝업 취소');
    assert.ok(iPop < iTop, '팝업을 부모 수정창보다 먼저 닫는다');
    assert.ok(iDlg >= 0 && iDlg < iPop, '확인창 다음, 부모 창 전에 팝업을 처리');
    assert.ok(/BsaTypingPopup\.close\('cancel'\)/.test(back), '뒤로가기 취소는 자식만');

    assert.ok(/ndtLocation:/.test(SRC) && /ndtComponentInput:/.test(SRC) && /ndtFinishStateInput:/.test(SRC),
        'NDT 조사창 직접 입력칸도 같은 팝업 소비자');
    assert.ok(/defectLocation:/.test(SRC) && /defectCauseInput:/.test(SRC), '결함 수정창 소비자 유지');
    assert.ok(/id = 'bsaTypingPopup'|id="bsaTypingPopup"/.test(SRC), '오버레이 id');
    assert.ok(/isPopupElement/.test(SRC), 'isPopupElement API');
    assert.ok(/e\.stopPropagation\(\);\s*close\('done'\)/.test(SRC), '완료 클릭 전파 차단');
    assert.ok(/e\.stopPropagation\(\);\s*close\('cancel'\)/.test(SRC), '취소 클릭 전파 차단');
    assert.ok(/stopImmediatePropagation/.test(SRC), 'Esc/Enter 가 부모 단축키로 안 새게');
    assert.ok(/mode !== 'cancel'/.test(SRC), '취소는 확정 이벤트 안 보냄');

    const iTp = HTML.indexOf('js/shared/typing-popup.js?v=');
    const iApp = HTML.indexOf('src="app.js?v=');
    assert.ok(iTp > 0 && iApp > 0 && iTp < iApp, 'typing-popup.js 가 app.js 보다 먼저');
    assert.ok(/\.bsa-typing-overlay\s*\{/.test(CSS) && /\.bsa-typing-btn\.bsa-typing-done/.test(CSS));
}

// ── 추출한 shouldKeep: 완료/취소/덮개 터치는 부모를 닫지 않는다 ──────────
const shouldKeep = new Function(`
function isMeasureKeypadTarget() { return false; }
${extractFunction('shouldKeepDefectModalForTarget')}
return shouldKeepDefectModalForTarget;
`)();

function fakeClosest(sels) {
    return {
        closest(sel) { return sels.some((s) => s === sel) ? this : null; }
    };
}

{
    assert.strictEqual(shouldKeep(fakeClosest(['#bsaTypingPopup, .bsa-typing-overlay'])), true, '팝업 덮개');
    assert.strictEqual(shouldKeep(fakeClosest(['#defectModal .defect-drawer-card'])), true, '부모 카드');
    assert.strictEqual(shouldKeep(fakeClosest(['#bsaAppDialog'])), true, '확인창');
    assert.strictEqual(shouldKeep(fakeClosest(['#someHeader'])), false, '진짜 바깥은 닫힘');
}

function parentCloser(parent) {
    return function onPointerDown(target, type) {
        if (!parent.open) return;
        if (shouldKeep(target)) return;
        parent.open = false;
        parent.closedBy = type || 'pointerdown';
    };
}

{
    const parent = { open: true, scrollTop: 180, otherValue: '보', closedBy: null };
    const closeIfOutside = parentCloser(parent);
    const doneBtn = fakeClosest(['#bsaTypingPopup, .bsa-typing-overlay']);
    const cancelBtn = fakeClosest(['#bsaTypingPopup, .bsa-typing-overlay']);
    const backdrop = fakeClosest(['#bsaTypingPopup, .bsa-typing-overlay']);
    closeIfOutside(doneBtn, 'click');
    closeIfOutside(cancelBtn, 'click');
    closeIfOutside(backdrop, 'pointerdown');
    assert.strictEqual(parent.open, true, '완료/취소/바깥 눌러도 부모 수정창 유지');
    assert.strictEqual(parent.scrollTop, 180, '부모 스크롤 유지');
    assert.strictEqual(parent.otherValue, '보', '부모의 다른 입력 유지');

    const header = fakeClosest(['#someHeader']);
    closeIfOutside(header, 'pointerdown');
    assert.strictEqual(parent.open, false, '진짜 바깥은 예전처럼 닫힘');
}

// ── 동작: 목 DOM 에서 완료/취소/키보드/바깥 클릭 ─────────────────────────
function makeEl(tag, attrs) {
    const el = {
        tagName: String(tag || 'div').toUpperCase(),
        className: '',
        id: '',
        children: [],
        parentNode: null,
        style: {},
        value: '',
        placeholder: '',
        textContent: '',
        hidden: false,
        offsetHeight: 160,
        attributes: Object.assign({}, attrs || {}),
        listeners: {},
        _html: ''
    };
    if (attrs && attrs.id) el.id = attrs.id;
    if (attrs && attrs.className) el.className = attrs.className;
    el.setAttribute = (k, v) => {
        el.attributes[k] = String(v);
        if (k === 'id') el.id = String(v);
        if (k === 'class') el.className = String(v);
    };
    el.getAttribute = (k) => (k in el.attributes ? el.attributes[k] : null);
    el.appendChild = (c) => { c.parentNode = el; el.children.push(c); return c; };
    el.removeChild = (c) => {
        el.children = el.children.filter((x) => x !== c);
        if (c.parentNode === el) c.parentNode = null;
        return c;
    };
    el.contains = (n) => {
        if (n === el) return true;
        return el.children.some((c) => c.contains && c.contains(n));
    };
    el.matches = (sel) => matches(el, sel);
    el.closest = (sel) => {
        for (let n = el; n; n = n.parentNode) {
            if (matches(n, sel)) return n;
        }
        return null;
    };
    el.querySelector = (sel) => qsa(el, sel)[0] || null;
    el.querySelectorAll = (sel) => qsa(el, sel);
    el.addEventListener = (t, f, opt) => {
        const capture = !!(opt && opt !== false && (opt === true || opt.capture));
        (el.listeners[t] = el.listeners[t] || []).push({ f, capture });
    };
    el.removeEventListener = (t, f) => {
        el.listeners[t] = (el.listeners[t] || []).filter((x) => x.f !== f);
    };
    el.focus = (opts) => { if (el._doc) el._doc.activeElement = el; el._preventScroll = !!(opts && opts.preventScroll); };
    el.blur = () => { if (el._doc && el._doc.activeElement === el) el._doc.activeElement = el._doc.body; };
    el.setSelectionRange = () => {};
    el.dispatchEvent = (ev) => dispatch(el, ev);
    Object.defineProperty(el, 'innerHTML', {
        get() { return el._html; },
        set(html) {
            el._html = String(html);
            el.children = [];
            if (/bsa-typing-card/.test(html)) {
                const card = makeEl('div');
                card.className = 'bsa-typing-card';
                const title = makeEl('div');
                title.className = 'bsa-typing-title';
                const input = makeEl('input');
                input.className = 'bsa-typing-input';
                input.type = 'text';
                const actions = makeEl('div');
                actions.className = 'bsa-typing-actions';
                const cancel = makeEl('button');
                cancel.className = 'bsa-typing-btn bsa-typing-cancel';
                cancel.textContent = '취소';
                const done = makeEl('button');
                done.className = 'bsa-typing-btn bsa-typing-done';
                done.textContent = '완료';
                actions.appendChild(cancel);
                actions.appendChild(done);
                card.appendChild(title);
                card.appendChild(input);
                card.appendChild(actions);
                el.appendChild(card);
            }
        }
    });
    return el;
}

function matches(el, sel) {
    return String(sel).split(',').some((part) => {
        const s = part.trim();
        if (!s) return false;
        if (s.startsWith('#')) return el.id === s.slice(1);
        if (s.startsWith('.')) {
            const need = s.slice(1).split('.').filter(Boolean);
            const have = String(el.className || '').split(/\s+/);
            return need.every((c) => have.includes(c));
        }
        return el.tagName && el.tagName.toLowerCase() === s.toLowerCase();
    });
}

function walkKids(el, fn) {
    (el.children || []).forEach((c) => { fn(c); walkKids(c, fn); });
}

function qsa(root, sel) {
    const out = [];
    walkKids(root, (el) => { if (matches(el, sel)) out.push(el); });
    return out;
}

class FakeEvent {
    constructor(type, opts) {
        opts = opts || {};
        this.type = type;
        this.bubbles = !!opts.bubbles;
        this.cancelable = !!opts.cancelable;
        this.key = opts.key;
        this.code = opts.code;
        this.keyCode = opts.keyCode;
        this.which = opts.which;
        this.isComposing = !!opts.isComposing;
        this.pointerType = opts.pointerType || '';
        this.target = opts.target || null;
        this.defaultPrevented = false;
        this._stopped = false;
        this._stoppedImmediate = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this._stopped = true; }
    stopImmediatePropagation() { this._stopped = true; this._stoppedImmediate = true; }
}

function pathOf(el) {
    const path = [];
    for (let n = el; n; n = n.parentNode) path.push(n);
    return path;
}

function fireList(el, ev, capture) {
    const list = (el.listeners && el.listeners[ev.type]) || [];
    for (let i = 0; i < list.length; i++) {
        if (!!list[i].capture !== capture) continue;
        ev.currentTarget = el;
        list[i].f.call(el, ev);
        if (ev._stoppedImmediate) return;
    }
}

function dispatch(el, ev) {
    ev.target = ev.target || el;
    const path = pathOf(el);
    for (let i = path.length - 1; i >= 0; i--) {
        fireList(path[i], ev, true);
        if (ev._stoppedImmediate || ev._stopped) return !ev.defaultPrevented;
    }
    fireList(el, ev, false);
    if (ev._stoppedImmediate || ev._stopped) return !ev.defaultPrevented;
    if (ev.bubbles) {
        for (let i = 1; i < path.length; i++) {
            fireList(path[i], ev, false);
            if (ev._stoppedImmediate || ev._stopped) break;
        }
    }
    return !ev.defaultPrevented;
}

function bindDoc(el, doc) {
    el._doc = doc;
    (el.children || []).forEach((c) => bindDoc(c, doc));
}

function setupEnv() {
    const timers = [];
    let now = 1_700_000_000_000;
    const body = makeEl('body');
    const docEl = makeEl('html');
    const doc = {
        readyState: 'complete',
        body,
        documentElement: docEl,
        activeElement: body,
        listeners: {},
        getElementById(id) {
            if (body.id === id) return body;
            return qsa(body, '#' + id)[0] || null;
        },
        querySelector(sel) { return body.querySelector(sel); },
        querySelectorAll(sel) { return body.querySelectorAll(sel); },
        createElement(tag) { const el = makeEl(tag); bindDoc(el, doc); return el; },
        addEventListener(t, f, opt) { body.addEventListener(t, f, opt); },
        removeEventListener(t, f) { body.removeEventListener(t, f); },
        dispatchEvent(ev) { ev.target = ev.target || doc; return dispatch(body, ev); }
    };
    body._doc = doc;
    body.appendChild = function (c) {
        c.parentNode = body;
        body.children.push(c);
        bindDoc(c, doc);
        return c;
    };
    const origAppend = body.appendChild;

    const win = {
        document: doc,
        innerHeight: 800,
        matchMedia: (q) => ({ matches: String(q).indexOf('coarse') >= 0 }),
        visualViewport: null,
        BsaTypingPopup: null
    };
    win.window = win;

    const EventCtor = function (type, opts) { return new FakeEvent(type, opts); };
    const g = {
        window: win,
        document: doc,
        Event: EventCtor,
        FocusEvent: EventCtor,
        KeyboardEvent: EventCtor,
        Date: { now: () => now },
        setTimeout: (fn, ms) => { timers.push({ fn, at: now + (ms || 0) }); return timers.length; },
        clearTimeout: () => {},
        module: { exports: {} },
        exports: {}
    };
    g.global = g;
    g.this = win;

    const vm = require('vm');
    const ctx = vm.createContext(g);
    vm.runInContext(SRC + '\nthis.__api = (typeof module !== "undefined" && module.exports) ? module.exports : window.BsaTypingPopup;', ctx);
    const api = ctx.__api;
    assert.ok(api && typeof api.isOpen === 'function');

    function flush(ms) {
        now += (ms || 0);
        const ready = timers.filter((t) => t.at <= now);
        timers.splice(0, timers.length, ...timers.filter((t) => t.at > now));
        ready.forEach((t) => t.fn());
    }

    function makeField(id, value) {
        const input = makeEl('input');
        input.id = id;
        input.value = value == null ? '' : value;
        input.events = [];
        input.addEventListener('input', (e) => input.events.push(e.type));
        input.addEventListener('change', (e) => input.events.push(e.type));
        input.addEventListener('blur', (e) => input.events.push(e.type));
        input.addEventListener('keydown', (e) => input.events.push('keydown:' + e.key));
        body.appendChild(input);
        return input;
    }

    function markTouch() {
        const ev = new FakeEvent('pointerdown', { pointerType: 'touch', bubbles: true });
        ev.target = body;
        dispatch(body, ev);
    }

    function openField(id, value) {
        const input = makeField(id, value);
        markTouch();
        const ev = new FakeEvent('focusin', { bubbles: true });
        ev.target = input;
        dispatch(input, ev);
        assert.strictEqual(api.isOpen(), true, '팝업이 열림: ' + id);
        const overlay = body.querySelector('.bsa-typing-overlay');
        assert.ok(overlay, '덮개');
        assert.strictEqual(overlay.id, 'bsaTypingPopup');
        return { input, overlay, proxy: overlay.querySelector('.bsa-typing-input') };
    }

    return { api, doc, body, win, flush, openField, makeField, markTouch };
}

function typeInto(proxy, field, text) {
    proxy.value = text;
    field.value = text;
    const ev = new FakeEvent('input', { bubbles: true });
    ev.target = proxy;
    dispatch(proxy, ev);
}

{
    const { api, openField, flush } = setupEnv();
    const { input, overlay, proxy } = openField('defectLocation', '기둥 C1');
    typeInto(proxy, input, '기둥 C1 하부');
    const parent = { open: true, scrollTop: 240, other: '균열' };
    const closeIfOutside = parentCloser(parent);

    const done = overlay.querySelector('.bsa-typing-done');
    closeIfOutside(done);
    done.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    assert.strictEqual(api.isOpen(), false, '완료 → 팝업만 닫힘');
    assert.strictEqual(input.value, '기둥 C1 하부', '완료는 친 값을 확정');
    assert.ok(input.events.includes('change') && input.events.includes('blur'), '완료는 원래 칸 확정 이벤트');
    assert.strictEqual(parent.open, true, '부모 수정창 유지');
    assert.strictEqual(parent.scrollTop, 240, '부모 스크롤 유지');
    assert.strictEqual(parent.other, '균열', '부모의 다른 입력 유지');
    flush(60);
}

{
    const { api, openField, flush } = setupEnv();
    const { input, overlay, proxy } = openField('defectComponentInput', '보');
    typeInto(proxy, input, '슬래브');
    const parent = { open: true, scrollTop: 90, other: '누수' };
    const closeIfOutside = parentCloser(parent);

    const cancel = overlay.querySelector('.bsa-typing-cancel');
    closeIfOutside(cancel);
    cancel.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    assert.strictEqual(api.isOpen(), false, '취소 → 팝업만 닫힘');
    assert.strictEqual(input.value, '보', '취소는 원래 값으로 되돌림');
    assert.ok(!input.events.includes('change') && !input.events.includes('blur'), '취소는 확정 이벤트 없음');
    assert.ok(input.events.includes('input'), '되돌린 값은 input 으로 부모 칸에 반영');
    assert.strictEqual(parent.open, true, '부모 수정창 유지');
    assert.strictEqual(parent.scrollTop, 90);
    assert.strictEqual(parent.other, '누수');
    flush(60);
}

{
    const { api, openField, body } = setupEnv();
    const { input, overlay, proxy } = openField('defectCauseInput', '');
    typeInto(proxy, input, '건조수축');
    const parent = { open: true };
    const closeIfOutside = parentCloser(parent);

    overlay.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    assert.strictEqual(api.isOpen(), false, '바깥(덮개) 클릭 = 완료로 팝업만 닫힘');
    assert.strictEqual(input.value, '건조수축', '바깥 클릭은 친 값을 확정');
    assert.ok(input.events.includes('keydown:Enter'), '원인 칸 완료는 Enter 확정');
    assert.strictEqual(parent.open, true);
    closeIfOutside(overlay);
    assert.strictEqual(parent.open, true, '덮개 pointerdown 도 부모를 닫지 않음');
}

{
    const { api, openField, body } = setupEnv();
    const { input, proxy } = openField('ndtComponentInput', '기둥');
    typeInto(proxy, input, '벽체');
    const parent = { open: true, kind: 'ndt' };
    const esc = new FakeEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    esc.target = proxy;
    dispatch(body, esc);
    assert.strictEqual(api.isOpen(), false, 'Esc = 팝업만 취소');
    assert.strictEqual(input.value, '기둥', 'Esc 는 자식 입력을 버림');
    assert.ok(!input.events.includes('keydown:Enter'), 'Esc 는 NDT Enter 확정 안 함');
    assert.strictEqual(parent.open, true, 'NDT 부모 창 유지');
    assert.strictEqual(esc._stopped, true, 'Esc 가 부모 단축키로 안 새게 막음');
}

{
    const { api, openField, body } = setupEnv();
    const { input, proxy } = openField('ndtFinishStateInput', '미장');
    typeInto(proxy, input, '몰탈');
    const parent = { open: true, kind: 'ndt' };
    const enter = new FakeEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    enter.target = proxy;
    dispatch(body, enter);
    assert.strictEqual(api.isOpen(), false, 'Enter = 팝업만 완료');
    assert.strictEqual(input.value, '몰탈', 'Enter 는 친 값을 확정');
    assert.ok(input.events.includes('keydown:Enter'), 'NDT 직접 입력은 Enter 확정');
    assert.strictEqual(parent.open, true, 'NDT 부모 창 유지');
    assert.strictEqual(enter._stopped, true, 'Enter 가 부모로 안 새게 막음');
}

{
    const { api, openField } = setupEnv();
    const { overlay, proxy } = openField('ndtLocation', '1F 기둥');
    assert.strictEqual(api.isPopupElement(overlay), true);
    assert.strictEqual(api.isPopupElement(proxy), true);
    assert.strictEqual(api.isPopupElement({ closest: () => null }), false);

    const parent = { open: true };
    const closeIfOutside = parentCloser(parent);
    const done = overlay.querySelector('.bsa-typing-done');
    const ev = new FakeEvent('pointerdown', { pointerType: 'touch', bubbles: true });
    ev.target = done;
    closeIfOutside(ev.target, 'pointerdown');
    done.dispatchEvent(ev);
    assert.strictEqual(parent.open, true, '터치 pointerdown(완료)도 부모 유지');
    assert.strictEqual(api.isOpen(), true, 'pointerdown 만으로는 팝업이 안 닫힘(클릭에서 닫힘)');
    done.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    assert.strictEqual(api.isOpen(), false, '완료 클릭 후 팝업 닫힘');
    assert.strictEqual(parent.open, true, '완료 클릭 뒤에도 부모 유지');
}

{
    const { api, openField } = setupEnv();
    openField('defectTypeInput', '균열');
    assert.strictEqual(api.isOpen(), true);
    api.close('cancel');
    assert.strictEqual(api.isOpen(), false, 'API close(cancel) 후 isOpen=false');
}

{
    const { api } = setupEnv();
    assert.deepStrictEqual(Object.keys(api.FIELDS).sort(), [
        'defectCauseInput', 'defectComponentInput', 'defectLocation', 'defectTypeInput',
        'ndtComponentInput', 'ndtFinishStateInput', 'ndtLocation'
    ].sort());
}

console.log('test-typing-popup: ok');
