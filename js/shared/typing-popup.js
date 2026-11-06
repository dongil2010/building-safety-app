/**
 * 결함 핀 수정창 직접 입력칸 → 화면 가운데 입력 팝업 (터치 기기) — 2026-11-05
 *
 * 왜:    폰·태블릿에서 상세 위치·부재 명칭·결함 종류·발생 원인 칸을 누르면 키보드에 밀리고
 *        위쪽 결함 핀 수정창에 가려 치는 글자가 안 보였다.
 * 어떻게: 손가락으로 칸을 누르면 원래 칸 대신 보이는 화면(키보드 위) 가운데에 큰 입력칸을 띄운다.
 *        치는 글자는 원래 칸에 그대로 넣고 input 이벤트를 보낸다 → 기존 자동 저장 코드가 그대로 돈다.
 *        완료/Enter: 원래 칸의 확정 동작(blur·change, 원인 칸은 Enter)을 그대로 부른다.
 *        취소: 원래 값으로 되돌리고 확정 이벤트는 보내지 않는다.
 *        완료·취소·Esc·뒤로가기는 이 팝업만 닫는다. 부모 결함/NDT 수정창은 연 채로 둔다.
 *        팝업이 떠 있는 동안 화면 전체를 덮어서 뒤쪽 도면·수정창은 터치되지 않는다.
 * PC:    마우스로 누르면 예전처럼 칸에 바로 입력한다(Tab 이동 등 유지).
 */
(function (root) {
    'use strict';

    var FIELDS = {
        defectLocation: { label: '상세 위치', commit: 'blur' },
        defectComponentInput: { label: '부재 명칭', commit: 'blur' },
        defectTypeInput: { label: '결함 종류', commit: 'blur' },
        defectCauseInput: { label: '발생 원인 (이번 결함)', commit: 'enter' },
        // 비파괴 조사 등록창 — 같은 직접 입력 패턴(이번 항목만 Enter 확정)
        ndtLocation: { label: '측정 위치', commit: 'blur' },
        ndtComponentInput: { label: '부재 구분', commit: 'enter' },
        ndtFinishStateInput: { label: '마감상태', commit: 'enter' }
    };

    var lastPointerType = '';
    var lastPointerAt = 0;
    var active = null; // { input, cfg, initial, overlay, proxy }
    var suppressBlurFor = null;

    function isTouchLike() {
        var recent = Date.now() - lastPointerAt < 1500;
        if (recent) return lastPointerType === 'touch' || lastPointerType === 'pen';
        try {
            return !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
        } catch (e) {
            return false;
        }
    }

    function fire(el, type) {
        var ev;
        if (type === 'blur') {
            try { ev = new FocusEvent('blur', { bubbles: false }); } catch (e) { ev = document.createEvent('Event'); ev.initEvent('blur', false, false); }
        } else {
            try { ev = new Event(type, { bubbles: true }); } catch (e2) { ev = document.createEvent('Event'); ev.initEvent(type, true, false); }
        }
        el.dispatchEvent(ev);
    }

    function fireEnter(el) {
        var ev;
        try {
            ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true });
        } catch (e) {
            ev = document.createEvent('Event');
            ev.initEvent('keydown', true, true);
            ev.key = 'Enter';
            ev.keyCode = 13;
        }
        el.dispatchEvent(ev);
    }

    function positionCard() {
        if (!active) return;
        var card = active.overlay.querySelector('.bsa-typing-card');
        if (!card) return;
        var vv = root.visualViewport;
        var top = vv ? vv.offsetTop : 0;
        var h = vv ? vv.height : root.innerHeight;
        var cardH = card.offsetHeight || 160;
        // 보이는 화면(키보드 위) 세로 가운데. 너무 좁으면 위에서 12px.
        var y = top + Math.max(12, Math.round((h - cardH) / 2));
        card.style.top = y + 'px';
    }

    function isPopupElement(el) {
        if (!el) return false;
        if (active && active.overlay) {
            if (el === active.overlay) return true;
            if (typeof active.overlay.contains === 'function' && active.overlay.contains(el)) return true;
        }
        if (typeof el.closest === 'function') {
            return !!el.closest('#bsaTypingPopup, .bsa-typing-overlay');
        }
        return false;
    }

    function close(mode) {
        if (!active) return;
        var a = active;
        active = null;
        if (root.visualViewport) {
            root.visualViewport.removeEventListener('resize', positionCard);
            root.visualViewport.removeEventListener('scroll', positionCard);
        }
        if (mode === 'cancel') {
            if (a.input.value !== a.initial) {
                a.input.value = a.initial;
                fire(a.input, 'input');
            }
        }
        if (a.cfg.commit === 'enter') {
            if (mode !== 'cancel' && a.input.value.trim()) fireEnter(a.input);
        } else if (mode !== 'cancel') {
            // 완료일 때만 원래 칸의 blur 확정 코드(콤보 확정·원인 자동 체크 등)를 돌린다.
            // 취소는 값을 되돌린 뒤 확정 이벤트를 보내지 않는다(부모 창 상태 유지).
            fire(a.input, 'change');
            fire(a.input, 'blur');
        }
        try { a.proxy.blur(); } catch (e) { /* ignore */ }
        // 닫는 탭이 뒤쪽 도면·부모 수정창으로 새지 않게 한 박자 늦게 치운다.
        setTimeout(function () {
            if (a.overlay.parentNode) a.overlay.parentNode.removeChild(a.overlay);
        }, 60);
    }

    function open(input, cfg) {
        if (active) close('done');
        var overlay = document.createElement('div');
        overlay.id = 'bsaTypingPopup';
        overlay.className = 'bsa-typing-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML =
            '<div class="bsa-typing-card">' +
            '<div class="bsa-typing-title"></div>' +
            '<input type="text" class="bsa-typing-input" autocomplete="off" enterkeyhint="done">' +
            '<div class="bsa-typing-actions">' +
            '<button type="button" class="bsa-typing-btn bsa-typing-cancel">취소</button>' +
            '<button type="button" class="bsa-typing-btn bsa-typing-done">완료</button>' +
            '</div></div>';
        overlay.querySelector('.bsa-typing-title').textContent = cfg.label;
        var proxy = overlay.querySelector('.bsa-typing-input');
        proxy.value = input.value;
        proxy.placeholder = input.placeholder || '';
        document.body.appendChild(overlay);

        active = { input: input, cfg: cfg, initial: input.value, overlay: overlay, proxy: proxy };

        proxy.addEventListener('input', function () {
            if (!active || active.proxy !== proxy) return;
            input.value = proxy.value;
            fire(input, 'input');
        });
        proxy.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.isComposing) {
                e.preventDefault();
                e.stopPropagation();
                close('done');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close('cancel');
            }
        });
        overlay.querySelector('.bsa-typing-done').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            close('done');
        });
        overlay.querySelector('.bsa-typing-cancel').addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            close('cancel');
        });
        // 뒤쪽(도면·수정창)으로 터치가 가지 않게 덮개가 다 받는다. 빈 곳을 누르면 완료.
        ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach(function (t) {
            overlay.addEventListener(t, function (e) {
                e.stopPropagation();
                if (e.target === overlay && e.cancelable) e.preventDefault();
            }, { passive: false });
        });
        overlay.addEventListener('click', function (e) {
            e.stopPropagation();
            if (e.target === overlay) close('done');
        });

        if (root.visualViewport) {
            root.visualViewport.addEventListener('resize', positionCard);
            root.visualViewport.addEventListener('scroll', positionCard);
        }
        positionCard();

        // 원래 칸 → 팝업 칸으로 포커스를 옮긴다. 이때 원래 칸의 blur 확정은 막는다(닫을 때 한 번만).
        suppressBlurFor = input;
        try { proxy.focus({ preventScroll: true }); } catch (e) { proxy.focus(); }
        try { proxy.setSelectionRange(proxy.value.length, proxy.value.length); } catch (e2) { /* ignore */ }
        suppressBlurFor = null;
        if (document.activeElement === input) input.blur();
        setTimeout(positionCard, 50);
        setTimeout(positionCard, 350);
    }

    function onFocusIn(e) {
        var el = e.target;
        if (!el || !el.id || !FIELDS[el.id]) return;
        if (active && active.input === el) return;
        if (!isTouchLike()) return;
        open(el, FIELDS[el.id]);
    }

    function init() {
        if (!root.document || root.__bsaTypingPopupBound) return;
        root.__bsaTypingPopupBound = true;
        document.addEventListener('pointerdown', function (e) {
            lastPointerType = e.pointerType || '';
            lastPointerAt = Date.now();
        }, true);
        // 팝업이 떠 있는 동안 Enter/Esc 가 부모 수정창 단축키(Esc=닫기)로 새지 않게 캡처에서 처리한다.
        document.addEventListener('keydown', function (e) {
            if (!active || e.isComposing) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                close('done');
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                close('cancel');
            }
        }, true);
        // 팝업으로 포커스를 옮길 때 원래 칸의 blur 리스너(확정 코드)가 미리 돌지 않게 막는다.
        document.addEventListener('blur', function (e) {
            if (suppressBlurFor && e.target === suppressBlurFor) e.stopImmediatePropagation();
        }, true);
        document.addEventListener('focusout', function (e) {
            if (suppressBlurFor && e.target === suppressBlurFor) e.stopImmediatePropagation();
        }, true);
        // focus 리스너(종류 칸의 「들어올 때 값 기억」)가 먼저 돌도록 focusin(버블) 단계에서 연다.
        document.addEventListener('focusin', onFocusIn, false);
    }

    var api = {
        init: init,
        close: close,
        isOpen: function () { return !!active; },
        isPopupElement: isPopupElement,
        FIELDS: FIELDS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BsaTypingPopup = api;
    if (root.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})(typeof window !== 'undefined' ? window : this);
