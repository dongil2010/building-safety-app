/**
 * 폭·길이·개수 전용 숫자 키패드 (터치 기기)
 *
 * 어디에: 마킹 편집창·모바일 편집 시트의 폭/길이/개수 칸(data-crack-w/l/n),
 *         조사표 인라인 폭/길이 칸(data-measure-keypad).
 * 언제:   손가락으로 칸을 눌렀을 때(pointerType touch/pen), 또는 손가락이 주 포인터인
 *         기기(pointer: coarse)에서 칸에 포커스가 갔을 때. 화면 폭은 보지 않는다.
 *         마우스로 누르면(PC) 예전처럼 키보드로 입력한다.
 * 어떻게: 칸에 inputmode="none"을 걸어 OS 키보드를 막고, 칸 위/아래에 키패드를 띄운다.
 *         키를 누르면 커서 자리에 글자를 넣고 input 이벤트를, 닫을 때 change 이벤트를
 *         보낸다 → 기존 저장·동기화 코드가 손으로 친 것과 똑같이 돈다.
 * 닫기:   완료 키, 바깥 누르기, 다른 칸으로 포커스 이동.
 */
(function (root) {
    'use strict';

    var TARGET_SELECTOR = 'input[data-crack-w], input[data-crack-l], input[data-crack-n], [data-measure-keypad]';

    /** 세로(4×4)·가로(8×2) 배열. 'BS' = 지우기, 'OK' = 완료, ' ' = 띄어쓰기 */
    var LAYOUT_PORTRAIT = [
        ['7', '8', '9', 'BS'],
        ['4', '5', '6', '~'],
        ['1', '2', '3', ','],
        ['.', '0', ' ', 'OK']
    ];
    var LAYOUT_LANDSCAPE = [
        ['1', '2', '3', '4', '5', '6', '.', 'BS'],
        ['7', '8', '9', '0', '~', ',', ' ', 'OK']
    ];

    function allKeys() {
        var out = [];
        LAYOUT_PORTRAIT.forEach(function (r) { r.forEach(function (k) { out.push(k); }); });
        return out;
    }

    function clampSel(value, start, end) {
        var len = value.length;
        var s = (typeof start === 'number' && start >= 0) ? Math.min(start, len) : len;
        var e = (typeof end === 'number' && end >= 0) ? Math.min(end, len) : s;
        if (e < s) { var t = s; s = e; e = t; }
        return { s: s, e: e };
    }

    /** 커서(선택 영역) 자리에 text를 넣는다 → { value, caret } */
    function insertAtCaret(value, start, end, text) {
        value = String(value == null ? '' : value);
        var c = clampSel(value, start, end);
        var next = value.slice(0, c.s) + text + value.slice(c.e);
        return { value: next, caret: c.s + text.length };
    }

    /** 지우기: 선택 영역이 있으면 그걸, 없으면 커서 앞 한 글자 */
    function backspaceAtCaret(value, start, end) {
        value = String(value == null ? '' : value);
        var c = clampSel(value, start, end);
        if (c.e > c.s) return { value: value.slice(0, c.s) + value.slice(c.e), caret: c.s };
        if (c.s === 0) return { value: value, caret: 0 };
        return { value: value.slice(0, c.s - 1) + value.slice(c.s), caret: c.s - 1 };
    }

    /**
     * 키패드 위치 — 칸을 가리지 않게 아래(우선) 또는 위에 붙인다.
     * field: {top,bottom,left,right}, pad: {width,height}, vp: {width,height,top?,left?}
     * 결과 { top, left, place: 'below'|'above'|'dock', scrollBy }
     * dock: 위·아래 모두 자리가 없으면 화면 아래에 붙이고, scrollBy 만큼 칸을 위로 올려야 한다.
     */
    function computePosition(field, pad, vp, gap) {
        gap = gap == null ? 6 : gap;
        var vTop = vp.top || 0;
        var vLeft = vp.left || 0;
        var vBottom = vTop + vp.height;
        var vRight = vLeft + vp.width;
        var margin = 4;
        var left = field.left;
        if (left + pad.width > vRight - margin) left = vRight - margin - pad.width;
        if (left < vLeft + margin) left = vLeft + margin;

        var below = vBottom - field.bottom;
        var above = field.top - vTop;
        if (below >= pad.height + gap + margin) {
            return { top: field.bottom + gap, left: left, place: 'below', scrollBy: 0 };
        }
        if (above >= pad.height + gap + margin) {
            return { top: field.top - gap - pad.height, left: left, place: 'above', scrollBy: 0 };
        }
        var top = vBottom - margin - pad.height;
        // 칸 아래쪽이 키패드 윗선보다 gap만큼 위에 오도록 스크롤
        var scrollBy = Math.ceil(field.bottom - (top - gap));
        return { top: top, left: left, place: 'dock', scrollBy: scrollBy > 0 ? scrollBy : 0 };
    }

    /** 터치 기기 판정 (폭 무관). env 주입은 테스트용 */
    function isCoarseDevice(env) {
        env = env || {};
        var w = env.window || (typeof window !== 'undefined' ? window : null);
        if (!w) return false;
        try {
            var pref = w.localStorage && w.localStorage.getItem('bsaMeasureKeypad');
            if (pref === 'off') return false;
            if (pref === 'on') return true;
        } catch (_e) { /* ignore */ }
        var mm = w.matchMedia ? function (q) { try { return w.matchMedia(q).matches; } catch (_e) { return false; } } : function () { return false; };
        if (mm('(pointer: coarse)')) return true;
        var nav = w.navigator || {};
        if ((nav.maxTouchPoints || 0) > 0 && mm('(hover: none)')) return true;
        return false;
    }

    function isKeypadDisabledByPref(w) {
        try { return !!(w.localStorage && w.localStorage.getItem('bsaMeasureKeypad') === 'off'); } catch (_e) { return false; }
    }

    function isTarget(el) {
        if (!el || el.nodeType !== 1 || !el.matches) return false;
        if (el.disabled || el.readOnly) return false;
        var tag = el.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
        if (tag === 'INPUT') {
            var t = (el.getAttribute('type') || 'text').toLowerCase();
            if (t !== 'text' && t !== 'search' && t !== 'tel') return false;
        }
        return el.matches(TARGET_SELECTOR);
    }

    function keyLabel(k) {
        if (k === 'BS') return '⌫';
        if (k === 'OK') return '완료';
        if (k === ' ') return '␣';
        return k;
    }

    function keyAria(k) {
        if (k === 'BS') return '지우기';
        if (k === 'OK') return '완료';
        if (k === ' ') return '띄어쓰기';
        return k;
    }

    var api = {
        TARGET_SELECTOR: TARGET_SELECTOR,
        LAYOUT_PORTRAIT: LAYOUT_PORTRAIT,
        LAYOUT_LANDSCAPE: LAYOUT_LANDSCAPE,
        allKeys: allKeys,
        insertAtCaret: insertAtCaret,
        backspaceAtCaret: backspaceAtCaret,
        computePosition: computePosition,
        isCoarseDevice: isCoarseDevice,
        isTarget: isTarget
    };

    root.BsaMeasureKeypad = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    /* ------------------------------------------------------------------ 브라우저 */

    var state = {
        pad: null,
        field: null,
        startValue: '',
        dirty: false,
        orientation: '',
        repeatTimer: null,
        repeatDelay: null,
        raf: 0,
        lastPointerType: '',
        lastPointerAt: 0
    };

    function prepField(el) {
        if (el.dataset.mkpPrepared === '1') return;
        el.dataset.mkpPrepared = '1';
        el.dataset.mkpOrigInputmode = el.hasAttribute('inputmode') ? el.getAttribute('inputmode') : '__none__';
        el.setAttribute('inputmode', 'none');
        // mobile-keyboard.js(소프트 키보드 들어올림)는 이 칸을 건너뛴다 — 키보드가 안 뜨므로
        el.setAttribute('data-bsa-kb-skip', '');
        el.setAttribute('autocomplete', 'off');
    }

    function unprepField(el) {
        if (!el || el.dataset.mkpPrepared !== '1') return;
        var orig = el.dataset.mkpOrigInputmode;
        if (orig === '__none__') el.removeAttribute('inputmode');
        else if (orig != null) el.setAttribute('inputmode', orig);
        el.removeAttribute('data-bsa-kb-skip');
        delete el.dataset.mkpPrepared;
        delete el.dataset.mkpOrigInputmode;
    }

    function prepAll(scope) {
        if (!isCoarseDevice()) return;
        var list = [];
        if (scope.matches && scope.matches(TARGET_SELECTOR)) list.push(scope);
        if (scope.querySelectorAll) {
            var found = scope.querySelectorAll(TARGET_SELECTOR);
            for (var i = 0; i < found.length; i++) list.push(found[i]);
        }
        list.forEach(function (el) { if (isTarget(el)) prepField(el); });
    }

    function buildPad() {
        if (state.pad) return state.pad;
        var pad = document.createElement('div');
        pad.id = 'bsaMeasureKeypad';
        pad.className = 'bsa-mkp';
        pad.setAttribute('role', 'group');
        pad.setAttribute('aria-label', '숫자 키패드');
        pad.hidden = true;
        document.body.appendChild(pad);

        var press = function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-mkp-key]') : null;
            if (e.cancelable) e.preventDefault(); // 칸 포커스 유지 (키보드도 안 뜸)
            if (!btn) return;
            var k = btn.getAttribute('data-mkp-key');
            pressKey(k);
            if (k === 'BS') startRepeat();
        };
        if (window.PointerEvent) {
            pad.addEventListener('pointerdown', press);
            pad.addEventListener('mousedown', function (e) { e.preventDefault(); });
            pad.addEventListener('touchstart', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
        } else {
            pad.addEventListener('touchstart', press, { passive: false });
            pad.addEventListener('mousedown', press);
        }
        ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel', 'mouseup'].forEach(function (t) {
            pad.addEventListener(t, stopRepeat);
        });
        pad.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); });
        pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        state.pad = pad;
        return pad;
    }

    function isLandscape() {
        var vv = window.visualViewport;
        var w = vv ? vv.width : window.innerWidth;
        var h = vv ? vv.height : window.innerHeight;
        return w > h && h < 560;
    }

    function renderKeys() {
        var pad = buildPad();
        var orient = isLandscape() ? 'landscape' : 'portrait';
        if (state.orientation === orient && pad.firstChild) return;
        state.orientation = orient;
        var layout = orient === 'landscape' ? LAYOUT_LANDSCAPE : LAYOUT_PORTRAIT;
        pad.className = 'bsa-mkp bsa-mkp-' + orient;
        pad.style.setProperty('--mkp-cols', String(layout[0].length));
        var html = '';
        layout.forEach(function (row) {
            row.forEach(function (k) {
                var cls = 'bsa-mkp-key' + (k === 'BS' ? ' bsa-mkp-bs' : '') + (k === 'OK' ? ' bsa-mkp-ok' : '') +
                    (/^[0-9]$/.test(k) ? ' bsa-mkp-num' : ' bsa-mkp-sym');
                html += '<button type="button" tabindex="-1" class="' + cls + '" data-mkp-key="' +
                    (k === ' ' ? ' ' : k) + '" aria-label="' + keyAria(k) + '">' + keyLabel(k) + '</button>';
            });
        });
        pad.innerHTML = html;
    }

    function fire(el, type) {
        var ev;
        try { ev = new Event(type, { bubbles: true, cancelable: false }); } catch (_e) {
            ev = document.createEvent('Event'); ev.initEvent(type, true, false);
        }
        el.dispatchEvent(ev);
    }

    function pressKey(k) {
        var el = state.field;
        if (!el || !el.isConnected) { close(false); return; }
        if (k === 'OK') { close(true, true); return; }
        var s = null, e = null;
        try { s = el.selectionStart; e = el.selectionEnd; } catch (_e) { /* 선택 미지원 */ }
        var res = k === 'BS' ? backspaceAtCaret(el.value, s, e) : insertAtCaret(el.value, s, e, k);
        if (res.value === el.value && k === 'BS') return;
        el.value = res.value;
        try { el.setSelectionRange(res.caret, res.caret); } catch (_e) { /* ignore */ }
        state.dirty = true;
        fire(el, 'input');
        // input 핸들러가 칸을 다시 그렸으면(분리) 닫는다
        if (!el.isConnected) { close(false); return; }
        schedulePosition();
    }

    function startRepeat() {
        stopRepeat();
        state.repeatDelay = setTimeout(function () {
            state.repeatTimer = setInterval(function () { pressKey('BS'); }, 70);
        }, 420);
    }

    function stopRepeat() {
        if (state.repeatDelay) { clearTimeout(state.repeatDelay); state.repeatDelay = null; }
        if (state.repeatTimer) { clearInterval(state.repeatTimer); state.repeatTimer = null; }
    }

    function viewportBox() {
        var vv = window.visualViewport;
        if (vv) return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
        return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    }

    function findScrollParent(el) {
        var p = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
            var cs = window.getComputedStyle(p);
            if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
            p = p.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function position() {
        state.raf = 0;
        var el = state.field;
        var pad = state.pad;
        if (!el || !pad || pad.hidden) return;
        if (!el.isConnected) { close(false); return; }
        renderKeys();
        var vp = viewportBox();
        var r = el.getBoundingClientRect();
        var size = { width: pad.offsetWidth, height: pad.offsetHeight };
        var pos = computePosition(r, size, vp);
        if (pos.place === 'dock' && pos.scrollBy > 0 && !state.scrolled) {
            state.scrolled = true; // 한 번만 (스크롤 이벤트로 되돌아오지 않게)
            var host = findScrollParent(el);
            var before = host.scrollTop;
            host.scrollTop = before + pos.scrollBy;
            if (host.scrollTop === before && host !== document.scrollingElement) {
                var se = document.scrollingElement || document.documentElement;
                se.scrollTop += pos.scrollBy;
            }
            r = el.getBoundingClientRect();
            pos = computePosition(r, size, vp);
        }
        pad.style.top = Math.round(pos.top) + 'px';
        pad.style.left = Math.round(pos.left) + 'px';
        pad.setAttribute('data-place', pos.place);
    }

    function schedulePosition() {
        if (state.raf) return;
        state.raf = (window.requestAnimationFrame || function (f) { return setTimeout(f, 16); })(position);
    }

    function open(el) {
        if (state.field === el && state.pad && !state.pad.hidden) { schedulePosition(); return; }
        if (state.field && state.field !== el) close(true, false);
        prepField(el);
        buildPad();
        state.field = el;
        state.startValue = el.value;
        state.dirty = false;
        state.scrolled = false;
        state.orientation = '';
        renderKeys();
        state.pad.hidden = false;
        document.documentElement.classList.add('bsa-mkp-open');
        el.classList.add('bsa-mkp-active');
        position();
    }

    /** commit: 값이 바뀌었으면 change 발송. blur: 칸 포커스도 뺀다(완료 키) */
    function close(commit, blur) {
        stopRepeat();
        var el = state.field;
        state.field = null;
        if (state.pad) state.pad.hidden = true;
        document.documentElement.classList.remove('bsa-mkp-open');
        if (!el) return;
        el.classList.remove('bsa-mkp-active');
        var changed = state.dirty && el.value !== state.startValue;
        state.dirty = false;
        if (commit && changed && el.isConnected) fire(el, 'change');
        if (blur && el.isConnected && document.activeElement === el) el.blur();
    }

    function wantsKeypadFor(el) {
        if (!isTarget(el)) return false;
        if (isKeypadDisabledByPref(window)) return false;
        var recent = (Date.now() - state.lastPointerAt) < 800;
        if (recent && state.lastPointerType === 'mouse') return false;
        if (recent && (state.lastPointerType === 'touch' || state.lastPointerType === 'pen')) return true;
        return isCoarseDevice();
    }

    function onPointerDown(e) {
        state.lastPointerType = e.pointerType || (e.type === 'touchstart' ? 'touch' : 'mouse');
        state.lastPointerAt = Date.now();
        var t = e.target;
        if (!isTarget(t) && t && t.closest) {
            // 「폭」「mm」 글자(라벨)를 눌러도 칸에 포커스가 가므로 그 칸을 미리 준비
            var lab = t.closest('label');
            if (lab && lab.control && isTarget(lab.control)) t = lab.control;
        }
        if (!isTarget(t)) return;
        if (state.lastPointerType === 'touch' || state.lastPointerType === 'pen') {
            if (!isKeypadDisabledByPref(window)) prepField(t); // 포커스 전에 → OS 키보드 안 뜸
        } else if (!isCoarseDevice()) {
            unprepField(t); // 터치 겸용 PC에서 마우스로 누르면 일반 키보드 입력
        }
    }

    function onFocusIn(e) {
        var t = e.target;
        if (wantsKeypadFor(t)) open(t);
        else if (state.field && t !== state.field && !(state.pad && state.pad.contains(t))) close(true, false);
    }

    function onFocusOut(e) {
        if (!state.field || e.target !== state.field) return;
        // 다른 폭·길이·개수 칸으로 옮겨가도 여기서 닫고(change 먼저), focusin이 새 칸에 다시 연다
        close(true, false);
    }

    function onDocClick(e) {
        var t = e.target;
        // 이미 포커스된 칸을 다시 누르면(엔터로 닫은 뒤 등) 키패드를 다시 연다
        if (isTarget(t) && document.activeElement === t && !api.isOpen() && wantsKeypadFor(t)) { open(t); return; }
        if (!state.field || !state.pad || state.pad.hidden) return;
        if (t === state.field || state.pad.contains(t)) return;
        if (isTarget(t)) return;
        close(true, true);
    }

    function onKeyDown(e) {
        if (!state.field || e.target !== state.field) return;
        if (e.key === 'Escape') { close(true, true); }
        else if (e.key === 'Enter') { close(true, false); }
    }

    function init() {
        document.addEventListener('pointerdown', onPointerDown, true);
        if (!window.PointerEvent) document.addEventListener('touchstart', onPointerDown, { capture: true, passive: true });
        document.addEventListener('focusin', onFocusIn, true);
        // blur 캡처: 칸 자신의 blur 핸들러보다 먼저 change를 보낸다 (브라우저 순서 change → blur)
        document.addEventListener('blur', onFocusOut, true);
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('scroll', schedulePosition, true);
        window.addEventListener('resize', function () { state.orientation = ''; schedulePosition(); });
        window.addEventListener('orientationchange', function () { state.orientation = ''; setTimeout(schedulePosition, 250); });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', schedulePosition);
            window.visualViewport.addEventListener('scroll', schedulePosition);
        }
        if (isCoarseDevice()) {
            prepAll(document.body);
            if (window.MutationObserver) {
                new MutationObserver(function (muts) {
                    for (var i = 0; i < muts.length; i++) {
                        var added = muts[i].addedNodes;
                        for (var j = 0; j < added.length; j++) {
                            if (added[j].nodeType === 1) prepAll(added[j]);
                        }
                    }
                    if (state.field && !state.field.isConnected) close(false);
                }).observe(document.body, { childList: true, subtree: true });
            }
        }
    }

    api.open = function (el) { if (isTarget(el)) open(el); };
    api.close = function () { close(true, false); };
    api.isOpen = function () { return !!(state.field && state.pad && !state.pad.hidden); };
    api.activeField = function () { return state.field; };

    // mobile-keyboard.js보다 먼저 focusin을 잡도록 index.html에서 그보다 앞에 로드한다
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : globalThis);
