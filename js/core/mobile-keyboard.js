/* 모바일·태블릿: 소프트 키보드에 가려지는 입력란 자동 들어올림 + 드래그 조정 */
(function () {
    window.BSA = window.BSA || {};

    var TEXT_INPUT_SELECTOR = [
        'input[type="text"]',
        'input[type="email"]',
        'input[type="tel"]',
        'input[type="number"]',
        'input[type="search"]',
        'input[type="date"]',
        'input[type="url"]',
        'input[type="password"]',
        'textarea',
        '[contenteditable="true"]'
    ].join(',');

    var PANEL_SELECTOR = '.modal-card, .defect-drawer-card, .ndt-drawer-card, .bsa-select-sheet-card';
    var SCROLL_BODY_SELECTOR = '.modal-body, .defect-drawer-body, .add-building-body, .edit-building-body, .app-content';

    var state = {
        activeField: null,
        panel: null,
        overlay: null,
        autoLift: 0,
        dragLift: 0,
        keyboardH: 0,
        dragging: false,
        dragStartY: 0,
        dragStartLift: 0,
        rafPending: false,
        blurTimer: null
    };

    function isTouchKeyboardUi() {
        if (window.BSA.isPcLikeLayout && window.BSA.isPcLikeLayout()) return false;
        if (navigator.maxTouchPoints > 0) return true;
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (document.documentElement.classList.contains('layout-tablet')) return true;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 1024;
    }

    function isTextField(el) {
        if (!el || el.disabled || el.readOnly) return false;
        if (el.closest && el.closest('[data-bsa-kb-skip]')) return false;
        if (el.matches && el.matches(TEXT_INPUT_SELECTOR)) return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function isOverlayVisible(overlay) {
        if (!overlay) return false;
        if (overlay.hidden) return false;
        if (overlay.classList.contains('open')) return true;
        if (overlay.id === 'loginOverlay') {
            var ds = overlay.style.display;
            return ds !== 'none';
        }
        var display = window.getComputedStyle(overlay).display;
        return display === 'flex' || display === 'block' || display === 'grid';
    }

    function findPanelForField(el) {
        var overlay = el.closest('.modal-overlay');
        if (overlay && overlay.id === 'loginOverlay') return null;
        if (overlay && isOverlayVisible(overlay)) {
            var panel = overlay.querySelector(PANEL_SELECTOR);
            if (panel) return { panel: panel, overlay: overlay };
        }
        return null;
    }

    function findScrollHost(el) {
        var body = el.closest(SCROLL_BODY_SELECTOR);
        if (body) return body;
        return document.scrollingElement || document.documentElement;
    }

    function getVisualViewportBox() {
        var vv = window.visualViewport;
        if (!vv) {
            return {
                top: 0,
                left: 0,
                width: window.innerWidth,
                height: window.innerHeight
            };
        }
        return {
            top: vv.offsetTop,
            left: vv.offsetLeft,
            width: vv.width,
            height: vv.height
        };
    }

    function measureKeyboardHeight() {
        var vv = window.visualViewport;
        if (!vv) return 0;
        var kh = window.innerHeight - vv.height - vv.offsetTop;
        return kh > 72 ? Math.round(kh) : 0;
    }

    function isBottomSheetPanel(panel) {
        if (!panel) return false;
        return panel.classList.contains('defect-drawer-card')
            || panel.classList.contains('ndt-drawer-card');
    }

    function computeAutoLift(field) {
        if (!field) return 0;
        var box = getVisualViewportBox();
        var rect = field.getBoundingClientRect();
        var padTop = 12;
        var padBottom = 20;
        var visibleTop = box.top + padTop;
        var visibleBottom = box.top + box.height - padBottom;
        var lift = 0;

        if (rect.bottom > visibleBottom) {
            lift = Math.ceil(rect.bottom - visibleBottom);
        }
        if (rect.top < visibleTop) {
            lift = Math.max(lift, Math.ceil(visibleTop - rect.top));
        }

        if (state.panel && isBottomSheetPanel(state.panel)) {
            lift = Math.max(lift, state.keyboardH);
        }
        return Math.max(0, lift);
    }

    function scrollFieldIntoView(field) {
        if (!field) return;
        var host = findScrollHost(field);
        var box = getVisualViewportBox();
        var rect = field.getBoundingClientRect();
        var safeBottom = box.top + box.height - 18;

        if (rect.bottom <= safeBottom && rect.top >= box.top + 12) return;

        if (host && host !== document.documentElement && host !== document.body) {
            var hostRect = host.getBoundingClientRect();
            if (rect.bottom > safeBottom) {
                host.scrollTop += Math.ceil(rect.bottom - safeBottom + 12);
            } else if (rect.top < hostRect.top + 12) {
                host.scrollTop -= Math.ceil(hostRect.top + 12 - rect.top);
            }
            return;
        }

        try {
            field.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        } catch (_e) {
            field.scrollIntoView(true);
        }
    }

    function totalLift() {
        return Math.max(0, Math.round(state.autoLift + state.dragLift));
    }

    function applyLift() {
        var lift = totalLift();
        document.documentElement.style.setProperty('--bsa-kb-height', state.keyboardH + 'px');
        document.documentElement.style.setProperty('--bsa-kb-lift', lift + 'px');
        document.body.classList.toggle('bsa-keyboard-open', state.keyboardH > 72 || lift > 0);

        if (state.panel) {
            state.panel.style.setProperty('--bsa-kb-lift', lift + 'px');
            state.panel.classList.toggle('bsa-kb-lifted', lift > 0 || state.keyboardH > 72);
        }
    }

    function clearLift() {
        state.autoLift = 0;
        state.dragLift = 0;
        state.keyboardH = 0;
        state.dragging = false;
        state.activeField = null;
        if (state.panel) {
            state.panel.classList.remove('bsa-kb-lifted');
            state.panel.style.removeProperty('--bsa-kb-lift');
        }
        document.querySelectorAll('.bsa-kb-drag-handle').forEach(function (handle) {
            handle.remove();
        });
        document.querySelectorAll('.bsa-kb-lifted').forEach(function (panel) {
            panel.classList.remove('bsa-kb-lifted');
            panel.style.removeProperty('--bsa-kb-lift');
        });
        state.panel = null;
        state.overlay = null;
        document.body.classList.remove('bsa-keyboard-open');
        document.documentElement.style.removeProperty('--bsa-kb-height');
        document.documentElement.style.removeProperty('--bsa-kb-lift');
    }

    function ensureDragHandle(panel) {
        if (!panel) return null;
        var existing = panel.querySelector(':scope > .bsa-kb-drag-handle');
        if (existing) return existing;

        var handle = document.createElement('div');
        handle.className = 'bsa-kb-drag-handle';
        handle.setAttribute('role', 'presentation');
        handle.innerHTML = '<span class="bsa-kb-drag-grip" aria-hidden="true"></span>'
            + '<span class="bsa-kb-drag-hint">위·아래로 드래그</span>';

        handle.addEventListener('pointerdown', onDragStart, { passive: false });
        handle.addEventListener('pointermove', onDragMove, { passive: false });
        handle.addEventListener('pointerup', onDragEnd);
        handle.addEventListener('pointercancel', onDragEnd);

        panel.insertBefore(handle, panel.firstChild);
        return handle;
    }

    function onDragStart(e) {
        if (!state.panel || e.button > 0) return;
        e.preventDefault();
        state.dragging = true;
        state.dragStartY = e.clientY;
        state.dragStartLift = state.dragLift;
        e.currentTarget.classList.add('is-dragging');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_err) {}
    }

    function onDragMove(e) {
        if (!state.dragging) return;
        e.preventDefault();
        var dy = state.dragStartY - e.clientY;
        var maxLift = state.keyboardH + 280;
        var next = state.dragStartLift + dy;
        state.dragLift = Math.max(-state.autoLift, Math.min(next, maxLift));
        applyLift();
    }

    function onDragEnd(e) {
        if (!state.dragging) return;
        state.dragging = false;
        if (e.currentTarget) {
            e.currentTarget.classList.remove('is-dragging');
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_err) {}
        }
    }

    function scheduleLayoutUpdate() {
        if (state.rafPending) return;
        state.rafPending = true;
        requestAnimationFrame(function () {
            state.rafPending = false;
            updateLayout(false);
        });
    }

    function updateLayout(forceScroll) {
        if (!state.activeField || !document.body.contains(state.activeField)) {
            clearLift();
            return;
        }

        state.keyboardH = measureKeyboardHeight();
        state.autoLift = computeAutoLift(state.activeField);
        applyLift();

        if (forceScroll || state.keyboardH > 72) {
            scrollFieldIntoView(state.activeField);
            state.autoLift = computeAutoLift(state.activeField);
            applyLift();
        }

        if (state.panel) {
            var handle = ensureDragHandle(state.panel);
            if (handle) {
                handle.classList.toggle('is-active', state.keyboardH > 72 || totalLift() > 0);
            }
        }
    }

    function onFocusIn(e) {
        var el = e.target;
        if (!isTextField(el)) return;

        if (state.blurTimer) {
            clearTimeout(state.blurTimer);
            state.blurTimer = null;
        }

        if (state.panel && state.activeField !== el) {
            state.dragLift = 0;
        }

        state.activeField = el;
        var ctx = findPanelForField(el);
        state.panel = ctx ? ctx.panel : null;
        state.overlay = ctx ? ctx.overlay : null;

        scheduleLayoutUpdate();
        setTimeout(function () { updateLayout(true); }, 280);
        setTimeout(function () { updateLayout(true); }, 520);
    }

    function onFocusOut() {
        if (state.blurTimer) clearTimeout(state.blurTimer);
        state.blurTimer = setTimeout(function () {
            state.blurTimer = null;
            var ae = document.activeElement;
            if (isTextField(ae)) return;
            state.activeField = null;
            clearLift();
        }, 140);
    }

    function init() {
        if (!isTouchKeyboardUi()) return;

        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleLayoutUpdate);
            window.visualViewport.addEventListener('scroll', scheduleLayoutUpdate);
        }
        window.addEventListener('resize', scheduleLayoutUpdate);
        window.addEventListener('orientationchange', function () {
            setTimeout(function () { updateLayout(true); }, 320);
        });
    }

    window.BSA.mobileKeyboard = {
        isActive: isTouchKeyboardUi,
        refresh: function () { updateLayout(true); },
        reset: clearLift
    };

    window.BSA.resetMobileKeyboard = clearLift;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
