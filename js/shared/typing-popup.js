/**
 * 결함/NDT 수정창 직접 입력칸 → 화면 가운데 입력 팝업 (터치 기기) — 2026-11-05
 *
 * 왜:    폰·태블릿에서 상세 위치·부재 명칭·결함 종류·발생 원인 칸을 누르면 키보드에 밀리고
 *        위쪽 수정창에 가려 치는 글자가 안 보였다.
 * 어떻게: 손가락으로 칸을 누르면 원래 칸 대신 보이는 화면(키보드 위) 가운데에 큰 입력칸을 띄운다.
 *        치는 글자는 원래 칸에 그대로 넣고 input 이벤트를 보낸다 → 기존 자동 저장 코드가 그대로 돈다.
 *        완료/Enter: 원래 칸의 확정 동작(blur·change, 원인·NDT 부재/마감은 Enter)을 그대로 부른다.
 *        취소: 원래 값으로 되돌린다.
 *        팝업이 떠 있는 동안 화면 전체를 덮어서 뒤쪽 도면·수정창은 터치되지 않는다.
 * 닫기:  완료/취소/Esc/Enter는 이 팝업만 닫는다. 부모 수정창·스크롤·다른 칸 값은 그대로.
 *        (2026-11-06: 확인·취소가 부모 창까지 닫던 문제 — 캡처 단계 바깥 누르기·Esc 전파·지연 클릭)
 * PC:    마우스로 누르면 예전처럼 칸에 바로 입력한다(Tab 이동 등 유지).
 */
(function (root) {
    'use strict';

    var FIELDS = {
        defectLocation: { label: '상세 위치', commit: 'blur' },
        defectComponentInput: { label: '부재 명칭', commit: 'blur', presetMode: true },
        defectTypeInput: { label: '결함 종류', commit: 'blur', presetMode: true },
        defectCauseInput: { label: '발생 원인', commit: 'enter', presetMode: true },
        ndtLocation: { label: '측정 위치', commit: 'blur' },
        ndtComponentInput: { label: '부재 구분', commit: 'enter' },
        ndtFinishStateInput: { label: '마감상태', commit: 'enter' }
    };

    var OVERLAY_ID = 'bsaTypingPopup';
    var OVERLAY_CLASS = 'bsa-typing-overlay';
    var REMOVE_DELAY_MS = 450; // iOS·안드로이드 지연 클릭이 부모 취소/닫기에 떨어지지 않게

    var lastPointerType = '';
    var lastPointerAt = 0;
    var active = null; // { input, cfg, initial, overlay, proxy }
    var shieldOverlay = null; // 닫은 뒤에도 잠시 남겨 뒤쪽 클릭을 막음
    var suppressBlurFor = null;
    var removeTimer = null;

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

    function isElement(el) {
        if (!el) return false;
        if (el.id === OVERLAY_ID) return true;
        if (el.classList && el.classList.contains(OVERLAY_CLASS)) return true;
        if (el.closest) {
            if (el.closest('#' + OVERLAY_ID) || el.closest('.' + OVERLAY_CLASS)) return true;
        }
        if (shieldOverlay && (el === shieldOverlay || (shieldOverlay.contains && shieldOverlay.contains(el)))) return true;
        if (active && active.overlay && (el === active.overlay || (active.overlay.contains && active.overlay.contains(el)))) return true;
        return false;
    }

    function isOpen() {
        return !!(active || shieldOverlay);
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

    function stopFromParent(e) {
        if (!e) return;
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }

    function isolateOverlayEvent(e) {
        var onBackdrop = e.target === e.currentTarget;
        // 캡처에서 stop하면 완료/취소 단추까지 이벤트가 안 내려간다.
        // 문서 캡처(부모 창 바깥 누르기 닫기)는 이미 지난 뒤라, 버블에서만 끊는다.
        if (e.eventPhase === 1) {
            if (onBackdrop && e.cancelable
                && (e.type === 'touchstart' || e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'wheel')) {
                e.preventDefault();
            }
            return;
        }
        stopFromParent(e);
        if (onBackdrop && e.cancelable
            && (e.type === 'touchstart' || e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'wheel')) {
            e.preventDefault();
        }
    }

    function bindOverlayIsolation(overlay) {
        var types = [
            'pointerdown', 'pointerup', 'pointercancel',
            'mousedown', 'mouseup',
            'touchstart', 'touchend', 'touchcancel',
            'click', 'wheel'
        ];
        types.forEach(function (t) {
            overlay.addEventListener(t, isolateOverlayEvent, { capture: true, passive: false });
            overlay.addEventListener(t, isolateOverlayEvent, { capture: false, passive: false });
        });
    }

    function syncPresetModeButtons(rootEl) {
        if (!rootEl) return;
        var TPM = root.BSA && root.BSA.typedPresetMode;
        var mode = TPM && typeof TPM.getMode === 'function' ? TPM.getMode() : 'once';
        rootEl.querySelectorAll('[data-typed-preset-mode]').forEach(function (btn) {
            var on = btn.getAttribute('data-typed-preset-mode') === mode;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function resetPresetMode() {
        var TPM = root.BSA && root.BSA.typedPresetMode;
        if (TPM && typeof TPM.setMode === 'function') TPM.setMode('once');
        if (typeof root.syncTypedPresetModeUi === 'function') root.syncTypedPresetModeUi();
    }

    function applyCommit(a, mode) {
        if (mode === 'cancel') {
            if (a.input.value !== a.initial) {
                a.input.value = a.initial;
                fire(a.input, 'input');
            }
        }
        if (a.cfg.commit === 'enter') {
            if (mode !== 'cancel' && a.input.value.trim()) fireEnter(a.input);
        } else {
            // 원래 칸의 blur 확정 코드(콤보 확정·원인 자동 체크 등)를 그대로 돌린다.
            fire(a.input, 'change');
            fire(a.input, 'blur');
        }
    }

    function removeOverlayLater(overlay) {
        shieldOverlay = overlay;
        overlay.setAttribute('data-bsa-typing-closing', '1');
        if (removeTimer) clearTimeout(removeTimer);
        removeTimer = setTimeout(function () {
            removeTimer = null;
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (shieldOverlay === overlay) shieldOverlay = null;
        }, REMOVE_DELAY_MS);
    }

    function close(mode) {
        if (!active) return;
        var a = active;
        active = null;
        if (root.visualViewport) {
            root.visualViewport.removeEventListener('resize', positionCard);
            root.visualViewport.removeEventListener('scroll', positionCard);
        }
        // 취소는 원래 값을 확정 코드로 다시 돌리므로 저장 모드를 먼저 끈다(취소했는데 프리셋에 들어가지 않게).
        if (mode === 'cancel') resetPresetMode();
        applyCommit(a, mode);
        resetPresetMode();
        try { a.proxy.blur(); } catch (e) { /* ignore */ }
        // 닫는 탭·지연 클릭이 뒤쪽 수정창 취소/닫기·도면 빈곳(부모 닫기)으로 새지 않게 덮개를 잠시 남긴다.
        removeOverlayLater(a.overlay);
    }

    function bindAction(el, mode) {
        function go(e) {
            if (e) {
                if (e.preventDefault) e.preventDefault();
                stopFromParent(e);
            }
            close(mode);
        }
        ['pointerup', 'click'].forEach(function (t) {
            el.addEventListener(t, go);
        });
        // 키보드 활성화(Space/Enter)는 click으로 들어온다.
    }

    function open(input, cfg) {
        if (active) close('done');
        if (shieldOverlay && shieldOverlay.parentNode) {
            shieldOverlay.parentNode.removeChild(shieldOverlay);
            shieldOverlay = null;
        }
        if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }

        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = OVERLAY_CLASS;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML =
            '<div class="bsa-typing-card">' +
            '<div class="bsa-typing-title"></div>' +
            (cfg.presetMode
                ? '<div class="bsa-typing-preset-mode" role="group" aria-label="직접 입력 저장 방식">' +
                    '<button type="button" class="defect-typed-preset-mode-btn" data-typed-preset-mode="save">프리셋에 저장</button>' +
                    '<button type="button" class="defect-typed-preset-mode-btn" data-typed-preset-mode="once">이번만 사용</button>' +
                    '</div>'
                : '') +
            '<input type="text" class="bsa-typing-input" autocomplete="off" enterkeyhint="done">' +
            '<div class="bsa-typing-actions">' +
            '<button type="button" class="bsa-typing-btn bsa-typing-cancel">취소</button>' +
            '<button type="button" class="bsa-typing-btn bsa-typing-done">완료</button>' +
            '</div></div>';
        overlay.querySelector('.bsa-typing-title').textContent = cfg.label;
        if (cfg.presetMode) {
            syncPresetModeButtons(overlay);
            overlay.querySelectorAll('[data-typed-preset-mode]').forEach(function (btn) {
                btn.addEventListener('click', function (e) {
                    if (e.preventDefault) e.preventDefault();
                    if (e.stopPropagation) e.stopPropagation();
                    var TPM = root.BSA && root.BSA.typedPresetMode;
                    if (TPM && typeof TPM.setMode === 'function') TPM.setMode(btn.getAttribute('data-typed-preset-mode'));
                    syncPresetModeButtons(overlay);
                    if (typeof root.syncTypedPresetModeUi === 'function') root.syncTypedPresetModeUi();
                });
            });
        }
        var proxy = overlay.querySelector('.bsa-typing-input');
        proxy.value = input.value;
        proxy.placeholder = input.placeholder || '';
        document.body.appendChild(overlay);

        active = { input: input, cfg: cfg, initial: input.value, overlay: overlay, proxy: proxy };

        bindOverlayIsolation(overlay);

        proxy.addEventListener('input', function () {
            if (!active || active.proxy !== proxy) return;
            input.value = proxy.value;
            fire(input, 'input');
        });
        proxy.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.isComposing) {
                if (e.preventDefault) e.preventDefault();
                stopFromParent(e);
                close('done');
            } else if (e.key === 'Escape' || e.key === 'Esc') {
                if (e.preventDefault) e.preventDefault();
                stopFromParent(e);
                close('cancel');
            }
        });
        bindAction(overlay.querySelector('.bsa-typing-done'), 'done');
        bindAction(overlay.querySelector('.bsa-typing-cancel'), 'cancel');
        // 빈 곳을 누르면 완료. isolate가 먼저 전파를 끊고, 여기선 덮개 자신만 닫는다.
        overlay.addEventListener('click', function (e) {
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

    function onGlobalKeydown(e) {
        if (!isOpen() || !active) return;
        if (e.key === 'Enter' && !e.isComposing) {
            if (e.preventDefault) e.preventDefault();
            stopFromParent(e);
            close('done');
        } else if (e.key === 'Escape' || e.key === 'Esc') {
            if (e.preventDefault) e.preventDefault();
            stopFromParent(e);
            close('cancel');
        }
    }

    function init() {
        if (!root.document || root.__bsaTypingPopupBound) return;
        root.__bsaTypingPopupBound = true;
        document.addEventListener('pointerdown', function (e) {
            lastPointerType = e.pointerType || '';
            lastPointerAt = Date.now();
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
        // 캡처에서 Esc/Enter를 끊어 부모 수정창 단축키(창 닫기)로 안 흘러가게.
        if (root.addEventListener) {
            root.addEventListener('keydown', onGlobalKeydown, true);
        } else {
            document.addEventListener('keydown', onGlobalKeydown, true);
        }
    }

    var api = {
        init: init,
        close: close,
        isOpen: isOpen,
        isElement: isElement,
        FIELDS: FIELDS,
        OVERLAY_ID: OVERLAY_ID,
        REMOVE_DELAY_MS: REMOVE_DELAY_MS
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BsaTypingPopup = api;
    if (root.document) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})(typeof window !== 'undefined' ? window : this);
