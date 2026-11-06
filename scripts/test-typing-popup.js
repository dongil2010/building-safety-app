#!/usr/bin/env node
'use strict';
/**
 * 2026-11-06: 모바일·태블릿 직접 입력 자식 팝업
 * 완료/취소/Enter/Esc는 팝업만 닫고, 부모 수정창·다른 칸·스크롤은 유지.
 *
 * 확인된 닫힘 경로(최신 main 기준, 추정 아님):
 *  1) document 캡처 pointerdown → shouldKeepDefectModalForTarget 미포함이면 closeDefectModal
 *  2) window keydown Esc → 결함/NDT 부모 창 닫기 (팝업이 stop 안 하면 같이 닫힘)
 *  3) 덮개 60ms 제거 후 지연 click이 부모 취소/닫기·도면 빈곳(NDT PAN)에 떨어짐
 *  4) 뒤로가기 tryCloseTopOverlayForBack 가 부모를 먼저 닫음
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/shared/typing-popup.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

// ── 정적: 공유 모듈이 결함+NDT 직접입력칸을 다룸 ──
assert.ok(/defectLocation:/.test(src) && /defectComponentInput:/.test(src)
    && /defectTypeInput:/.test(src) && /defectCauseInput:/.test(src), '결함 수정창 칸');
assert.ok(/ndtLocation:/.test(src) && /ndtComponentInput:/.test(src)
    && /ndtFinishStateInput:/.test(src), 'NDT 직접입력칸');
assert.ok(/OVERLAY_ID = 'bsaTypingPopup'/.test(src), '덮개 id');
assert.ok(/REMOVE_DELAY_MS = 450/.test(src), '지연 클릭 가드');
assert.ok(/stopFromParent/.test(src) && /stopImmediatePropagation/.test(src), '부모로 이벤트 전파 차단');
assert.ok(/e\.eventPhase === 1/.test(src), '캡처에서 단추 이벤트까지 막지 않음');
assert.ok(/onGlobalKeydown/.test(src) && /addEventListener\('keydown', onGlobalKeydown, true\)/.test(src),
    'Esc/Enter 캡처에서 부모 단축키로 안 흘러가게');
assert.ok(/close\('cancel'\)/.test(src) && /close\('done'\)/.test(src), '완료/취소 모드');

// ── 정적: 부모 창 유지 가드 ──
const keepFn = app.slice(
    app.indexOf('function shouldKeepDefectModalForTarget('),
    app.indexOf("document.addEventListener('pointerdown'", app.indexOf('function shouldKeepDefectModalForTarget('))
);
assert.ok(/BsaTypingPopup\.isElement/.test(keepFn), '모듈 판정으로 부모 창 유지');
assert.ok(/#bsaTypingPopup/.test(keepFn) && /\.bsa-typing-overlay/.test(keepFn), '선택자 폴백으로 부모 창 유지');

assert.ok(/function tryCloseTopOverlayForBack\(\) \{[\s\S]{0,400}BsaTypingPopup\.isOpen\(\)[\s\S]{0,200}BsaTypingPopup\.close\('cancel'\)/.test(app),
    '뒤로가기 = 자식 팝업만 취소');
assert.ok(/tab-ndt[\s\S]{0,200}k === 'escape'[\s\S]{0,200}BsaTypingPopup\.isOpen/.test(app),
    'NDT Esc가 팝업 떠 있으면 부모를 안 닫음');
assert.ok(/k === 'escape'[\s\S]{0,200}BsaTypingPopup\.isOpen[\s\S]{0,400}선 그리는 중/.test(app),
    '도면 Esc가 팝업 떠 있으면 부모를 안 닫음');
assert.ok(/ndtMode === 'PAN' && isNdtModalOpen\(\)[\s\S]{0,200}BsaTypingPopup\.isOpen/.test(app),
    'NDT 빈곳 탭이 팝업 떠 있으면 부모를 안 닫음');

// 로드 순서·스타일
assert.ok(html.indexOf('js/shared/typing-popup.js?v=') > 0, 'index에 로드');
assert.ok(/#bsaTypingPopup,\s*\n\.bsa-typing-overlay \{/.test(css)
    || /#bsaTypingPopup,\s*\.bsa-typing-overlay \{/.test(css), '덮개 스타일 id+class');
assert.ok(/z-index: 2147483300/.test(css), '덮개가 수정창보다 위');

// ── 동작: 가벼운 DOM 흉내 ──
function makeDom() {
    const listeners = new Map(); // el -> {type+phase: [fn]}
    function key(type, capture) { return type + ':' + (capture ? '1' : '0'); }
    function on(el, type, fn, opts) {
        const cap = !!(opts && (opts === true || opts.capture));
        const bag = listeners.get(el) || {};
        const k = key(type, cap);
        bag[k] = bag[k] || [];
        bag[k].push(fn);
        listeners.set(el, bag);
    }
    function off(el, type, fn) {
        const bag = listeners.get(el);
        if (!bag) return;
        Object.keys(bag).forEach((k) => {
            if (k.split(':')[0] !== type) return;
            bag[k] = bag[k].filter((f) => f !== fn);
        });
    }
    function fireOn(el, ev, capture) {
        const bag = listeners.get(el);
        if (!bag) return;
        const list = (bag[key(ev.type, capture)] || []).slice();
        list.forEach((fn) => fn(ev));
    }

    function el(tag, id) {
        const node = {
            tagName: String(tag || 'DIV').toUpperCase(),
            id: id || '',
            className: '',
            classList: {
                contains(c) { return (' ' + node.className + ' ').indexOf(' ' + c + ' ') >= 0; },
                add(c) { if (!node.classList.contains(c)) node.className = (node.className + ' ' + c).trim(); },
                remove(c) { node.className = node.className.split(/\s+/).filter((x) => x && x !== c).join(' '); }
            },
            children: [],
            parentNode: null,
            style: {},
            attributes: {},
            dataset: {},
            value: '',
            placeholder: '',
            innerHTML: '',
            textContent: '',
            offsetHeight: 160,
            disabled: false,
            readOnly: false,
            isContentEditable: false,
            setAttribute(n, v) { node.attributes[n] = String(v); if (n === 'id') node.id = String(v); },
            getAttribute(n) { return node.attributes[n]; },
            addEventListener(t, fn, o) { on(node, t, fn, o); },
            removeEventListener(t, fn) { off(node, t, fn); },
            focus() { document.activeElement = node; },
            blur() { if (document.activeElement === node) document.activeElement = document.body; },
            setSelectionRange() {},
            matches(sel) {
                if (sel.charAt(0) === '#' && node.id === sel.slice(1)) return true;
                if (sel.charAt(0) === '.' && node.classList.contains(sel.slice(1))) return true;
                return false;
            },
            closest(sel) {
                const parts = String(sel).split(',').map((s) => s.trim());
                for (let n = node; n; n = n.parentNode) {
                    if (parts.some((p) => {
                        if (p.charAt(0) === '#' && n.id === p.slice(1)) return true;
                        if (p.charAt(0) === '.' && n.classList && n.classList.contains(p.slice(1))) return true;
                        return false;
                    })) return n;
                }
                return null;
            },
            contains(other) {
                for (let n = other; n; n = n.parentNode) if (n === node) return true;
                return false;
            },
            querySelector(sel) {
                const all = [];
                (function walk(n) { n.children.forEach((c) => { all.push(c); walk(c); }); })(node);
                if (sel.charAt(0) === '.') return all.find((c) => c.classList.contains(sel.slice(1))) || null;
                if (sel.charAt(0) === '#') return all.find((c) => c.id === sel.slice(1)) || null;
                return all.find((c) => c.tagName === String(sel).toUpperCase()) || null;
            },
            querySelectorAll(sel) {
                const one = node.querySelector(sel);
                return one ? [one] : [];
            },
            appendChild(child) {
                child.parentNode = node;
                node.children.push(child);
                return child;
            },
            removeChild(child) {
                node.children = node.children.filter((c) => c !== child);
                child.parentNode = null;
                return child;
            },
            dispatchEvent(ev) {
                ev.target = ev.target || node;
                ev.currentTarget = node;
                fireOn(node, ev, false);
                return true;
            }
        };
        Object.defineProperty(node, 'innerHTML', {
            get() { return node._html || ''; },
            set(htmlStr) {
                node._html = String(htmlStr);
                node.children = [];
                const cls = htmlStr.match(/class="([^"]+)"/g) || [];
                const tags = htmlStr.match(/<(div|input|button)([^>]*)>/g) || [];
                tags.forEach((t) => {
                    const tag = t.match(/^<(\w+)/)[1];
                    const idm = t.match(/id="([^"]+)"/);
                    const cm = t.match(/class="([^"]+)"/);
                    const child = el(tag, idm ? idm[1] : '');
                    if (cm) child.className = cm[1];
                    node.appendChild(child);
                });
            }
        });
        return node;
    }

    const body = el('body');
    const document = {
        readyState: 'complete',
        body,
        documentElement: el('html'),
        activeElement: body,
        createElement: (tag) => el(tag),
        createEvent() {
            return { initEvent(type, bubbles) { this.type = type; this.bubbles = bubbles; } };
        },
        getElementById: (id) => {
            const all = [];
            (function walk(n) { all.push(n); (n.children || []).forEach(walk); })(body);
            return all.find((n) => n.id === id) || null;
        },
        addEventListener(t, fn, o) { on(document, t, fn, o); },
        removeEventListener(t, fn) { off(document, t, fn); }
    };

    const winListeners = {};
    const window = {
        document,
        innerHeight: 800,
        visualViewport: null,
        matchMedia: (q) => ({ matches: q.indexOf('coarse') >= 0 }),
        addEventListener(t, fn, o) {
            const cap = !!(o && (o === true || o.capture));
            const k = t + ':' + (cap ? '1' : '0');
            winListeners[k] = winListeners[k] || [];
            winListeners[k].push(fn);
        },
        removeEventListener() {}
    };

    function dispatch(target, type, extra) {
        const ev = Object.assign({
            type,
            target,
            currentTarget: target,
            bubbles: true,
            cancelable: true,
            defaultPrevented: false,
            propagationStopped: false,
            immediateStopped: false,
            eventPhase: 0,
            pointerType: 'touch',
            key: '',
            isComposing: false,
            preventDefault() { ev.defaultPrevented = true; },
            stopPropagation() { ev.propagationStopped = true; },
            stopImmediatePropagation() { ev.immediateStopped = true; ev.propagationStopped = true; }
        }, extra || {});
        const path = [];
        for (let n = target; n; n = n.parentNode) path.push(n);
        path.push(document);
        // capture: window → document → ... → target
        ev.eventPhase = 1;
        (winListeners[type + ':1'] || []).forEach((fn) => { if (!ev.immediateStopped) fn(ev); });
        if (!ev.propagationStopped) {
            for (let i = path.length - 1; i >= 0; i--) {
                if (ev.propagationStopped) break;
                ev.currentTarget = path[i];
                fireOn(path[i], ev, true);
            }
        }
        // target + bubble
        ev.eventPhase = 2;
        if (!ev.propagationStopped) {
            ev.currentTarget = target;
            fireOn(target, ev, false);
        }
        ev.eventPhase = 3;
        if (ev.bubbles && !ev.propagationStopped) {
            for (let i = 1; i < path.length; i++) {
                if (ev.propagationStopped) break;
                ev.currentTarget = path[i];
                fireOn(path[i], ev, false);
            }
        }
        if (!ev.propagationStopped) {
            (winListeners[type + ':0'] || []).forEach((fn) => { if (!ev.immediateStopped) fn(ev); });
        }
        return ev;
    }

    return { window, document, body, el, dispatch, on };
}

function loadPopup(env) {
    const ctx = {
        window: env.window,
        document: env.document,
        module: { exports: {} },
        exports: {},
        FocusEvent: function (type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); },
        Event: function (type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); },
        KeyboardEvent: function (type, o) {
            this.type = type;
            this.key = o && o.key;
            this.bubbles = !!(o && o.bubbles);
            this.cancelable = !!(o && o.cancelable);
        },
        Date,
        setTimeout,
        clearTimeout
    };
    ctx.window.document = env.document;
    ctx.global = ctx;
    vm.runInNewContext(src, ctx);
    return ctx.window.BsaTypingPopup;
}

function makeField(env, id, value) {
    const input = env.el('input', id);
    input.value = value == null ? '' : value;
    input.placeholder = '직접 입력';
    const events = { input: 0, change: 0, blur: 0, keydown: [] };
    input.addEventListener('input', () => { events.input++; });
    input.addEventListener('change', () => { events.change++; });
    input.addEventListener('blur', () => { events.blur++; });
    input.addEventListener('keydown', (e) => { events.keydown.push(e.key); });
    env.body.appendChild(input);
    return { input, events };
}

function openField(env, api, field) {
    env.dispatch(env.body, 'pointerdown', { pointerType: 'touch' });
    env.dispatch(field, 'focusin', { pointerType: 'touch' });
    assert.ok(api.isOpen(), '팝업이 열려야 함');
    const overlay = env.document.getElementById('bsaTypingPopup');
    assert.ok(overlay, '덮개 존재');
    return overlay;
}

function parentCloseGuard(env, overlay) {
    let parentClosed = 0;
    env.on(env.document, 'pointerdown', (e) => {
        if (env.window.BsaTypingPopup && env.window.BsaTypingPopup.isElement(e.target)) return;
        if (e.target && e.target.closest && e.target.closest('#bsaTypingPopup, .bsa-typing-overlay')) return;
        parentClosed++;
    }, true);
    return () => parentClosed;
}

{
    const env = makeDom();
    const api = loadPopup(env);
    assert.ok(api.FIELDS.defectLocation && api.FIELDS.ndtComponentInput, 'FIELDS 노출');
    const { input, events } = makeField(env, 'defectLocation', '기존위치');
    const overlay = openField(env, api, input);
    const parentClosed = parentCloseGuard(env, overlay);

    const proxy = overlay.querySelector('.bsa-typing-input');
    const done = overlay.querySelector('.bsa-typing-done');
    const cancel = overlay.querySelector('.bsa-typing-cancel');
    assert.ok(proxy && done && cancel, '팝업 칸·단추');
    assert.strictEqual(proxy.value, '기존위치');

    proxy.value = '새위치';
    env.dispatch(proxy, 'input');
    assert.strictEqual(input.value, '새위치', '치는 글자는 원래 칸에 반영');
    assert.ok(events.input >= 1, 'input 이벤트');

    const scrollHost = { scrollTop: 240 };
    env.dispatch(done, 'pointerdown', { pointerType: 'touch' });
    env.dispatch(done, 'pointerup', { pointerType: 'touch' });
    env.dispatch(done, 'click', { pointerType: 'touch' });
    assert.strictEqual(parentClosed(), 0, '완료 pointer/click이 부모 닫기를 안 탐');
    assert.strictEqual(input.value, '새위치', '완료 = 친 값 확정');
    assert.ok(events.change >= 1 && events.blur >= 1, 'blur 확정 경로');
    assert.ok(!api.isOpen() || env.document.getElementById('bsaTypingPopup'), '닫힌 뒤에도 덮개는 잠시 남김');
    assert.strictEqual(scrollHost.scrollTop, 240, '부모 스크롤 그대로');
}

{
    const env = makeDom();
    const api = loadPopup(env);
    const { input, events } = makeField(env, 'defectComponentInput', '기둥');
    const overlay = openField(env, api, input);
    const parentClosed = parentCloseGuard(env, overlay);
    const proxy = overlay.querySelector('.bsa-typing-input');
    const cancel = overlay.querySelector('.bsa-typing-cancel');
    proxy.value = '보(G)';
    env.dispatch(proxy, 'input');
    assert.strictEqual(input.value, '보(G)');
    env.dispatch(cancel, 'pointerdown', { pointerType: 'touch' });
    env.dispatch(cancel, 'click', { pointerType: 'touch' });
    assert.strictEqual(parentClosed(), 0, '취소가 부모 닫기를 안 탐');
    assert.strictEqual(input.value, '기둥', '취소 = 원래 값 복구');
    assert.ok(events.input >= 2, '복구 input');
}

{
    const env = makeDom();
    const api = loadPopup(env);
    const { input } = makeField(env, 'ndtLocation', '1F 기둥');
    const overlay = openField(env, api, input);
    let parentEsc = 0;
    env.window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') parentEsc++;
    }, false);
    const ev = env.dispatch(overlay.querySelector('.bsa-typing-input'), 'keydown', { key: 'Escape' });
    assert.ok(ev.defaultPrevented || ev.propagationStopped, 'Esc 전파 차단');
    assert.strictEqual(parentEsc, 0, '부모 Esc 닫기 안 탐');
    assert.strictEqual(input.value, '1F 기둥', 'Esc = 취소, 값 유지');
}

{
    const env = makeDom();
    const api = loadPopup(env);
    const { input, events } = makeField(env, 'ndtComponentInput', '');
    const overlay = openField(env, api, input);
    let parentEnter = 0;
    env.window.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') parentEnter++;
    }, false);
    const proxy = overlay.querySelector('.bsa-typing-input');
    proxy.value = '벽체';
    env.dispatch(proxy, 'input');
    const ev = env.dispatch(proxy, 'keydown', { key: 'Enter' });
    assert.ok(ev.propagationStopped, 'Enter 전파 차단');
    assert.strictEqual(parentEnter, 0, '부모 Enter 안 탐');
    assert.strictEqual(input.value, '벽체', 'Enter = 완료, 값 유지');
    assert.ok(events.keydown.indexOf('Enter') >= 0, 'NDT 부재칸 Enter 확정');
}

{
    const env = makeDom();
    const api = loadPopup(env);
    const { input } = makeField(env, 'defectCauseInput', '');
    openField(env, api, input);
    const overlay = env.document.getElementById('bsaTypingPopup');
    assert.ok(api.isElement(overlay), 'isElement(덮개)');
    assert.ok(api.isElement(overlay.querySelector('.bsa-typing-done')), 'isElement(완료)');
    assert.ok(api.isElement(overlay.querySelector('.bsa-typing-cancel')), 'isElement(취소)');
    assert.ok(!api.isElement(input), '원래 칸은 덮개 아님');
    assert.ok(!api.isElement(null));
}

{
    const env = makeDom();
    loadPopup(env);
    const { input } = makeField(env, 'defectTypeInput', '균열');
    // 마우스 = 팝업 안 띄움
    env.dispatch(input, 'pointerdown', { pointerType: 'mouse' });
    env.dispatch(input, 'focusin', { pointerType: 'mouse' });
    assert.strictEqual(env.document.getElementById('bsaTypingPopup'), null, 'PC 마우스는 팝업 없음');
}

{
    // shouldKeep 동작 흉내 (문서 캡처 핸들러와 같은 조건)
    function shouldKeep(target) {
        if (!target || typeof target.closest !== 'function') return false;
        if (target.closest('#defectModal .defect-drawer-card')) return true;
        if (target.closest('#bsaAppDialog')) return true;
        if (globalThis._tp && globalThis._tp.isElement(target)) return true;
        if (target.closest('#bsaTypingPopup, .bsa-typing-overlay')) return true;
        return false;
    }
    const env = makeDom();
    globalThis._tp = loadPopup(env);
    const { input } = makeField(env, 'defectLocation', 'A');
    const overlay = openField(env, globalThis._tp, input);
    assert.strictEqual(shouldKeep(overlay.querySelector('.bsa-typing-done')), true, '완료 단추 → 부모 유지');
    assert.strictEqual(shouldKeep(overlay.querySelector('.bsa-typing-cancel')), true, '취소 단추 → 부모 유지');
    assert.strictEqual(shouldKeep(overlay), true, '덮개 → 부모 유지');
    const outside = env.el('div', 'mapHeader');
    assert.strictEqual(shouldKeep(outside), false, '바깥은 그대로 닫힘');
    delete globalThis._tp;
}

console.log('test-typing-popup: ok');
