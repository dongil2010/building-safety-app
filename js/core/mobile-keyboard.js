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
        keepLift: false,        // 같은 창에서 칸만 바꿀 때 창 위치 유지
        keyboardH: 0,
        dragging: false,
        dragStartY: 0,
        dragStartLift: 0,
        rafPending: false,
        blurTimer: null,
        pointerDown: false,     // 손가락이 화면에 닿아 있는 동안
        clearAfterTap: false,   // 그동안 칸을 벗어났으면, 손을 뗀 뒤(클릭이 끝난 뒤) 내린다
        liftKb: 0,              // 2026-11-02 마지막으로 창 높이를 맞춘 때의 키보드 높이
        settleTimer: null       // 키보드가 다 올라온 뒤 한 번 더 맞추기
    };
    // 2026-10-12: 칸에 입력한 뒤 같은 창의 버튼(부동침하 「이동 보정 → 적용」 등)을 누르면 칸이 포커스를 잃어
    // 140ms 뒤 끌기 손잡이를 떼고 들어올림을 풀었다 → 버튼이 손가락 밑에서 위로 튀어 손을 뗄 때의 클릭이 엉뚱한 곳(목록)에 떨어졌다.
    // 손가락이 닿아 있는 동안은 화면을 움직이지 않고, 뗀 뒤 클릭이 처리된 다음에 정리한다.
    var CLEAR_AFTER_TAP_MS = 350;

    function isCoarsePointer() {
        try {
            return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches
                || (window.matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 0)));
        } catch (_e) { return false; }
    }

    /**
     * 소프트 키보드 들어올림을 쓸지 — 폭이 아니라 터치로 정한다(2026-09-29).
     * 태블릿(세로·가로, iPad Safari·안드로이드 — 「데스크톱 사이트」 UA로 PC형 판정이 나도)은 손가락 포인터면 켠다.
     * PC 마우스(주 포인터 fine)는 그대로 끔.
     */
    function isTouchKeyboardUi() {
        if (window.BSA.isPcLikeLayout && window.BSA.isPcLikeLayout() && !isCoarsePointer()) return false;
        if (navigator.maxTouchPoints > 0) return true;
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (document.documentElement.classList.contains('layout-tablet')) return true;
        var w = window.innerWidth || document.documentElement.clientWidth || 0;
        return w <= 1024;
    }

    /**
     * 도면 도구줄용 「터치 기기」 판정 — 키보드 들어올림과 같은 손가락 포인터·layout-tablet 기준.
     * 단, 창 폭(≤1024) 대체 판정과 「터치스크린 달린 마우스 PC」(주 포인터 fine)는 빼서 PC는 그대로 둔다.
     */
    function isTouchToolbarUi() {
        var root = document.documentElement;
        var coarse = isCoarsePointer();
        if (window.BSA.isPcLikeLayout && window.BSA.isPcLikeLayout() && !coarse) return false;
        if (root && root.classList.contains('layout-tablet')) return true;
        return coarse;
    }

    function applyTouchToolbarClass() {
        var root = document.documentElement;
        if (root) root.classList.toggle('bsa-touch-ui', isTouchToolbarUi());
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
        var overlay = el.closest('.modal-overlay, .modal-drawer-overlay');
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

    function isNdtDrawerPanel(panel) {
        return !!(panel && panel.classList.contains('ndt-drawer-card'));
    }

    /** 지금 창에 걸려 있는 들어올림(px) — 칸 위치를 잴 때 빼야 한다 */
    function appliedPanelLift() {
        if (!state.panel) return 0;
        // 움직이는 중(transition)에도 맞게: 지금 실제로 걸린 transform의 세로 이동을 읽는다
        try {
            var tf = window.getComputedStyle(state.panel).transform;
            if (tf && tf !== 'none') {
                var m = tf.match(/matrix(3d)?\(([^)]+)\)/);
                if (m) {
                    var parts = m[2].split(',').map(parseFloat);
                    var ty = m[1] ? parts[13] : parts[5];
                    if (isFinite(ty)) return -ty;
                }
            }
        } catch (_e) { /* 아래로 */ }
        if (!state.panel.classList.contains('bsa-kb-lifted')) return 0;
        var v = parseFloat(state.panel.style.getPropertyValue('--bsa-kb-lift'));
        return isFinite(v) ? v : 0;
    }

    /** 창(시트) 아래 끝 ? 들어올리기 전 위치(px). 잴 수 없으면 null */
    function panelUnliftedBottom(panel) {
        if (!panel || typeof panel.getBoundingClientRect !== 'function') return null;
        var r = panel.getBoundingClientRect();
        if (!r || !isFinite(r.bottom) || !(r.bottom > r.top)) return null;
        return r.bottom + appliedPanelLift();
    }

    /** 창(시트) 위 끝 ? 들어올리기 전 위치(px). 잴 수 없으면 null */
    function panelUnliftedTop(panel) {
        if (!panel || typeof panel.getBoundingClientRect !== 'function') return null;
        var r = panel.getBoundingClientRect();
        if (!r || !isFinite(r.top) || !(r.bottom > r.top)) return null;
        return r.top + appliedPanelLift();
    }

    function isDefectDrawerPanel(panel) {
        return !!(panel && panel.closest && panel.closest('#defectModal') && !isNdtDrawerPanel(panel));
    }

    /** 칸이 지금 보이는 화면 안에 있는지(키보드 위) */
    function fieldVisibleNow(field) {
        var box = getVisualViewportBox();
        var r = field.getBoundingClientRect();
        return r.top >= box.top + 8 && r.bottom <= box.top + box.height - 12;
    }

    function computeAutoLift(field) {
        if (!field) return 0;
        var box = getVisualViewportBox();
        // 2026-10-12: 이미 올린 만큼 올라간 위치로 재면, 다음 계산에서 덜 올리고 → 내려가면 다시 올리고…
        // 입력 창이 혼자 위아래로 왔다 갔다 했다. 들어올리기 전(원래) 위치로 잰다.
        var raw = field.getBoundingClientRect();
        var shift = appliedPanelLift();
        var rect = { top: raw.top + shift, bottom: raw.bottom + shift };
        var padTop = 12;
        var padBottom = 28;
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
            if (isNdtDrawerPanel(state.panel) && state.keyboardH <= 72) {
                // 화면 키보드가 없으면(태블릿 외장 키보드·PC) 칸이 가려질 때만 올린다 — 칸을 맨 위 메뉴 밑으로 밀어 넣지 않게
            } else if (isNdtDrawerPanel(state.panel)) {
                // 2026-11-03 NDT 측정 입력: 예전엔 칸을 화면 맨 위(36px)까지 올려 붙였다.
                // 이제는 가려지지 않을 만큼만 올리고(위 lift), 칸을 보이는 영역 한가운데로 두는 건 scrollFieldIntoView 가 부드럽게 맡는다.
            } else {
                // 2026-11-02 결함핀 수정창: 창 아래 끝(버튼줄)이 키보드 바로 위에 오도록 실제 창 아래 끝으로 잰다.
                // (예전 0.85배 고정 → 버튼줄이 키보드에 걸려 중간에 멈춘 것처럼 보였다)
                // 아래에 붙은 시트는 키보드 높이만큼, 위에서부터 꽉 찬 옆 패널은 CSS로 키보드 위 높이로 줄어 거의 0.
                var cardBottom = panelUnliftedBottom(state.panel);
                if (cardBottom != null) {
                    // 2026-11-02 창은 CSS가 키보드 위 높이로 줄어 있으므로(applyLift가 키보드 높이를 창에 넘김) 칸이 보이게 하는 건
                    // 창 안 스크롤이 맡고, 창 자체는 「아래 끝이 키보드 바로 위」까지만 올린다. 칸 위치로 더 올리면 창 위쪽(상세위치 칸 등)이 화면 밖으로 나간다.
                    lift = Math.max(0, Math.ceil(cardBottom - (box.top + box.height)));
                    // 창 위쪽이 화면 밖으로 나가지 않게(줄어들기 전 값으로 잴 때도) — 위쪽 여백 4px까지만
                    var cardTop = panelUnliftedTop(state.panel);
                    if (cardTop != null) lift = Math.min(lift, Math.max(0, Math.floor(cardTop - (box.top + 4))));
                } else {
                    lift = Math.max(lift, Math.round(state.keyboardH * 0.85));
                }
            }
        } else if (!state.panel && state.keyboardH > 72) {
            // 페이지 본문 입력: 칸이 키보드 위 보이는 영역의 한가운데 오도록만 밀어 올림(2026-11-03, 예전엔 키보드 높이의 0.45배 고정)
            var pageMid = box.top + box.height / 2;
            var pageCenter = (rect.top + rect.bottom) / 2;
            lift = Math.max(lift, Math.min(state.keyboardH, Math.max(0, Math.ceil(pageCenter - pageMid))));
        }
        return Math.max(0, lift);
    }

    /**
     * 2026-11-03 입력칸을 「키보드에 가리고 남은 보이는 영역」의 위아래 가운데로 부드럽게 옮긴다.
     * (예전: 가려질 때만 맨 아래/맨 위로 밀어 붙이거나 화면 맨 위로 올림)
     * 스크롤 목록(창 본문)이면 그 목록이 보이는 부분 안에서, 페이지면 보이는 화면(visualViewport) 안에서 가운데를 잡는다.
     * 돌려주는 값: 이 칸이 (움직인 뒤) 보이는 영역 안에 들어오면 true.
     */
    function smoothScrollTo(host, top) {
        try {
            host.scrollTo({ top: top, behavior: 'smooth' });
        } catch (_e) {
            host.scrollTop = top;
        }
    }

    function scrollFieldIntoView(field) {
        if (!field) return false;
        var host = findScrollHost(field);
        var isPage = !host || host === document.documentElement || host === document.body || host === document.scrollingElement;
        var box = getVisualViewportBox();
        var rect = field.getBoundingClientRect();
        var region = { top: box.top + 8, bottom: box.top + box.height - 12 };
        if (!isPage) {
            var hr = host.getBoundingClientRect();
            region.top = Math.max(region.top, hr.top + 4);
            region.bottom = Math.min(region.bottom, hr.bottom - 4);
        }
        if (region.bottom - region.top < rect.height + 8) return false; // 보이는 영역이 칸보다 작음: 다른 로직(창 들어올림)에 맡김

        var delta = (rect.top + rect.bottom) / 2 - (region.top + region.bottom) / 2;
        if (Math.abs(delta) <= 10) return true; // 이미 가운데 근처

        var moved = delta;
        if (!isPage) {
            var maxTop = host.scrollHeight - host.clientHeight;
            maxTop = isFinite(maxTop) ? Math.max(0, maxTop) : Infinity;
            var target = Math.max(0, Math.min(maxTop, host.scrollTop + delta));
            moved = target - host.scrollTop;
            if (Math.abs(moved) >= 2) smoothScrollTo(host, target);
        } else {
            var se = document.scrollingElement || document.documentElement;
            var maxPage = se.scrollHeight - (window.innerHeight || se.clientHeight);
            maxPage = isFinite(maxPage) ? Math.max(0, maxPage) : Infinity;
            var pageTarget = Math.max(0, Math.min(maxPage, se.scrollTop + delta));
            moved = pageTarget - se.scrollTop;
            if (Math.abs(moved) >= 2) smoothScrollTo(window, pageTarget);
        }
        var newTop = rect.top - moved;
        var newBottom = rect.bottom - moved;
        return newTop >= region.top - 2 && newBottom <= region.bottom + 2;
    }

    // ── 2026-11-02 결함핀 수정창: 입력칸이 키보드에 가리지 않게 ──
    // ① 창 본문 아래에 키보드 높이만큼 여백 → 끝 칸까지 스크롤해 키보드 위로 올린다
    var DEFECT_MODAL_ID = 'defectModal';

    function isDefectEditField(field) {
        return !!(field && field.closest && field.closest('#' + DEFECT_MODAL_ID));
    }

    function defectBodyOf(field) {
        return field && field.closest ? field.closest('#' + DEFECT_MODAL_ID + ' .defect-drawer-body') : null;
    }

    function applyDefectBodyPad(field) {
        var body = defectBodyOf(field);
        if (!body) return;
        if (state.keyboardH > 72) {
            // 2026-11-02 창이 키보드 위 높이로 줄어들므로 키보드 높이만큼 여백을 또 줄 필요가 없다(예전엔 창이 그대로여서 필요했음)
            body.style.setProperty('padding-bottom', '24px', 'important');
            body.setAttribute('data-bsa-kb-pad', '1');
        } else if (body.hasAttribute('data-bsa-kb-pad')) {
            body.style.removeProperty('padding-bottom');
            body.removeAttribute('data-bsa-kb-pad');
        }
    }

    function clearDefectBodyPad() {
        document.querySelectorAll('[data-bsa-kb-pad]').forEach(function (b) {
            b.style.removeProperty('padding-bottom');
            b.removeAttribute('data-bsa-kb-pad');
        });
    }

    /** 결함핀 수정창: 여백 → 칸을 키보드 위로 스크롤 */
    function updateDefectEditAssist(scroll) {
        var f = state.activeField;
        if (!isDefectEditField(f)) return;
        applyDefectBodyPad(f);
        if (scroll) scrollFieldIntoView(f);
    }

    function totalLift() {
        return Math.max(0, Math.round(state.autoLift + state.dragLift));
    }

    function applyLift() {
        var lift = totalLift();
        state.liftKb = state.keyboardH;
        document.documentElement.style.setProperty('--bsa-kb-inner-h', Math.round(window.innerHeight || 0) + 'px');
        document.documentElement.style.setProperty('--bsa-kb-height', state.keyboardH + 'px');
        document.documentElement.style.setProperty('--bsa-kb-lift', lift + 'px');
        document.body.classList.toggle('bsa-keyboard-open', state.keyboardH > 72 || lift > 0);
        // 모달/드로어가 없으면 페이지 콘텐츠 전체를 위로 (입력칸이 키보드에 가리지 않게)
        document.body.classList.toggle('bsa-kb-page-lift', !state.panel && lift > 0);

        if (state.panel) {
            state.panel.style.setProperty('--bsa-kb-lift', lift + 'px');
            state.panel.classList.toggle('bsa-kb-lifted', lift > 0 || state.keyboardH > 72);
            // 2026-11-02 결함 수정창: CSS의 「키보드 위 높이로 줄이기」(max-height)가 쓰는 값을 창에 직접 넘긴다.
            // styles.css가 body.bsa-keyboard-open에서 --bsa-kb-height를 0으로 다시 정해 두어, 루트에 넣은 값이 body 아래에서는 0으로 보였다
            // (그래서 창이 줄지 않고 통째로 위로만 밀려 상세위치 칸이 화면 밖으로 나갔다). 키보드가 내려가면 clearLift가 지워 원래 높이로 돌아온다.
            if (isDefectDrawerPanel(state.panel)) {
                state.panel.style.setProperty('--bsa-kb-height', state.keyboardH + 'px');
                state.panel.style.setProperty('--bsa-kb-inner-h', Math.round(window.innerHeight || 0) + 'px');
            }
        }
        syncDockFollow(lift);
    }

    /**
     * 2026-11-02 결함핀 수정창(아래 시트)이 열린 채 키보드가 뜨면 시트는 transform으로 올라가는데,
     * 도면 아래 툴바(#mobileMapDock)는 CSS로 「시트 높이(60dvh) 위」에 고정돼 따라오지 않아 중간에 멈춰 보였다.
     * → 시트가 실제로 올라간 윗변 높이를 재서 툴바를 그 위에 붙인다(아래 시트일 때만, 옆 패널·PC는 그대로).
     */
    function syncDockFollow(lift) {
        var root = document.documentElement;
        var p = state.panel;
        var on = false;
        if (p && isDefectDrawerPanel(p) && (lift > 0 || state.keyboardH > 72)
            && typeof p.getBoundingClientRect === 'function') {
            var r = p.getBoundingClientRect();
            var applied = appliedPanelLift();
            var ih = window.innerHeight || 0;
            var unliftedTop = r.top + applied;
            var unliftedBottom = r.bottom + applied;
            // 화면 아래에 붙은 시트(아래 끝 ≈ 화면 아래)일 때만
            if (ih > 0 && isFinite(unliftedTop) && Math.abs(unliftedBottom - ih) <= 24 && unliftedTop > 0) {
                var gap = Math.max(0, Math.round(ih - (unliftedTop - lift)));
                root.style.setProperty('--bsa-kb-dock-bottom', gap + 'px');
                on = true;
            }
        }
        if (root.classList) root.classList.toggle('bsa-kb-dock-follow', on);
        if (!on) root.style.removeProperty('--bsa-kb-dock-bottom');
    }

    function clearLift() {
        clearDefectBodyPad();
        state.keepLift = false;
        state.autoLift = 0;
        state.dragLift = 0;
        state.keyboardH = 0;
        state.liftKb = 0;
        if (state.settleTimer) { clearTimeout(state.settleTimer); state.settleTimer = null; }
        state.dragging = false;
        state.activeField = null;
        if (state.panel) {
            state.panel.classList.remove('bsa-kb-lifted');
            state.panel.style.removeProperty('--bsa-kb-lift');
            state.panel.style.removeProperty('--bsa-kb-height');
            state.panel.style.removeProperty('--bsa-kb-inner-h');
        }
        document.querySelectorAll('.bsa-kb-drag-handle').forEach(function (handle) {
            handle.remove();
        });
        document.querySelectorAll('.bsa-kb-lifted').forEach(function (panel) {
            panel.classList.remove('bsa-kb-lifted');
            panel.style.removeProperty('--bsa-kb-lift');
            panel.style.removeProperty('--bsa-kb-height');
            panel.style.removeProperty('--bsa-kb-inner-h');
        });
        state.panel = null;
        state.overlay = null;
        document.body.classList.remove('bsa-keyboard-open');
        document.body.classList.remove('bsa-kb-page-lift');
        document.documentElement.style.removeProperty('--bsa-kb-height');
        document.documentElement.style.removeProperty('--bsa-kb-lift');
        document.documentElement.style.removeProperty('--bsa-kb-inner-h');
        document.documentElement.style.removeProperty('--bsa-kb-dock-bottom');
        if (document.documentElement.classList) document.documentElement.classList.remove('bsa-kb-dock-follow');
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
        var maxLift = state.keyboardH + (isNdtDrawerPanel(state.panel) ? 420 : 280);
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

    /** 화면(키보드) 크기 바뀜: 바로 맞추고, 움직임이 멎은 뒤 한 번 더(키보드가 다 올라온 높이로) */
    function onViewportChange() {
        scheduleLayoutUpdate();
        if (!state.activeField) return;
        if (state.settleTimer) clearTimeout(state.settleTimer);
        state.settleTimer = setTimeout(function () {
            state.settleTimer = null;
            updateLayout(false);
        }, 200);
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
        // 손잡이를 끄는 중·손가락으로 목록을 미는 중에는 창을 건드리지 않는다(같이 움직이면 덜컹거림)
        if (state.dragging || (state.pointerDown && !forceScroll)) return;

        var prevKb = state.keyboardH;
        state.keyboardH = measureKeyboardHeight();
        var nextLift = computeAutoLift(state.activeField);
        // 키보드 높이가 거의 그대로면(주소창·스크롤로 생긴 몇 px) 창을 다시 옮기지 않는다
        // 2026-11-02 키보드는 여러 번에 나눠(작은 resize 여러 번) 올라온다. 직전 값과 비교하면 한 번에 40px 넘게
        // 바뀌지 않아 창이 처음 잰 높이에서 멈췄다 → 마지막으로 맞춘 높이와 비교 + 멈춘(안정) 뒤엔 작은 차이도 맞춘다
        var drift = Math.abs(state.keyboardH - state.liftKb);
        var kbStable = Math.abs(state.keyboardH - prevKb) <= 2;
        var kbChanged = drift > 40 || (kbStable && drift > 4);
        // 창 안 목록을 스크롤해 칸 위치가 바뀌어도 창은 그대로 둔다(칸 따라 창이 오르내리면 덜컹거림)
        // 같은 창에서 다음 칸으로 옮겨 갈 때: 창은 그 자리에 두고(사용자가 끌어 둔 위치 포함) 창 안 목록만 스크롤.
        // 그래도 칸이 안 보일 때만 창 높이를 다시 잡는다. (칸마다 창이 오르내리던 문제)
        if (forceScroll && state.keepLift && !kbChanged) {
            if (scrollFieldIntoView(state.activeField) || fieldVisibleNow(state.activeField)) {
                updateHandle();
                updateDefectEditAssist(false);
                return;
            }
            state.keepLift = false;
        }
        if (forceScroll || kbChanged) {
            state.autoLift = nextLift;
            applyLift();
            // 결함핀 수정창: 키보드 위 높이로 줄어든 뒤의 창 아래 끝으로 한 번 더(옆 패널이 위로 밀려나지 않게)
            if (isDefectDrawerPanel(state.panel)) {
                state.autoLift = computeAutoLift(state.activeField);
                applyLift();
            }
        }

        // 칸을 화면 안으로 끌어오는 스크롤은 포커스했을 때·키보드가 막 뜨거나 바뀌었을 때만(스크롤할 때마다 하면 목록이 튄다)
        if (forceScroll || (kbChanged && state.keyboardH > 72)) {
            scrollFieldIntoView(state.activeField);
            state.autoLift = computeAutoLift(state.activeField);
            applyLift();
        }

        updateHandle();
        updateDefectEditAssist(forceScroll || kbChanged);
    }

    function updateHandle() {
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

        var prevPanel = state.panel;
        var prevField = state.activeField;
        var ctx = findPanelForField(el);
        var nextPanel = ctx ? ctx.panel : null;
        var samePanel = !!(prevPanel && nextPanel === prevPanel && prevField && prevField !== el
            && document.body.contains(prevField) && totalLift() > 0);
        // 같은 창 안에서 칸만 바뀌면 창 위치(끌어 둔 위치 포함)를 그대로 둔다
        state.keepLift = samePanel;
        if (!samePanel && prevField !== el) state.dragLift = 0;

        state.activeField = el;
        state.panel = nextPanel;
        state.overlay = ctx ? ctx.overlay : null;

        scheduleLayoutUpdate();
        setTimeout(function () { updateLayout(true); }, 280);
        setTimeout(function () { updateLayout(true); }, 520);
        setTimeout(function () { updateLayout(true); }, 900); // 부드럽게 움직이는 동안 키보드 높이가 더 바뀐 경우 마지막 맞춤
    }

    function clearIfNoField() {
        var ae = document.activeElement;
        if (isTextField(ae)) return;
        state.activeField = null;
        clearLift();
    }

    function onFocusOut() {
        if (state.blurTimer) clearTimeout(state.blurTimer);
        state.blurTimer = setTimeout(function () {
            state.blurTimer = null;
            if (state.pointerDown) { state.clearAfterTap = true; return; }
            clearIfNoField();
        }, 140);
    }

    function onPointerDownCapture(e) {
        if (e && e.pointerType === 'mouse') return;
        state.pointerDown = true;
    }

    function onPointerUpCapture(e) {
        if (e && e.pointerType === 'mouse') return;
        state.pointerDown = false;
        if (!state.clearAfterTap) return;
        state.clearAfterTap = false;
        if (state.blurTimer) clearTimeout(state.blurTimer);
        state.blurTimer = setTimeout(function () {
            state.blurTimer = null;
            if (state.pointerDown) { state.clearAfterTap = true; return; }
            clearIfNoField();
        }, CLEAR_AFTER_TAP_MS);
    }

    function bindBodyScrollDrag(gripEl, scrollEl) {
        if (!gripEl || !scrollEl || gripEl._bsaScrollDragBound) return;
        gripEl._bsaScrollDragBound = true;
        var dragging = false;
        var startY = 0;
        var startScroll = 0;

        gripEl.addEventListener('pointerdown', function (e) {
            if (e.button > 0) return;
            dragging = true;
            startY = e.clientY;
            startScroll = scrollEl.scrollTop;
            gripEl.classList.add('is-dragging');
            try { gripEl.setPointerCapture(e.pointerId); } catch (_err) {}
            e.preventDefault();
        }, { passive: false });

        gripEl.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            e.preventDefault();
            scrollEl.scrollTop = startScroll - (e.clientY - startY);
        }, { passive: false });

        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            gripEl.classList.remove('is-dragging');
            try { gripEl.releasePointerCapture(e.pointerId); } catch (_err) {}
        }

        gripEl.addEventListener('pointerup', endDrag);
        gripEl.addEventListener('pointercancel', endDrag);
    }

    function initScrollDrags() {
        var addGrip = document.getElementById('addBuildingBodyGrip');
        var addHost = document.getElementById('addBuildingScrollHost');
        bindBodyScrollDrag(addGrip, addHost);
    }

    function init() {
        applyTouchToolbarClass();
        initScrollDrags();
        if (!isTouchKeyboardUi()) return;

        document.addEventListener('focusin', onFocusIn, true);
        document.addEventListener('focusout', onFocusOut, true);
        document.addEventListener('pointerdown', onPointerDownCapture, true);
        document.addEventListener('pointerup', onPointerUpCapture, true);
        document.addEventListener('pointercancel', onPointerUpCapture, true);

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onViewportChange);
            window.visualViewport.addEventListener('scroll', onViewportChange);
        }
        window.addEventListener('resize', onViewportChange);
        window.addEventListener('orientationchange', function () {
            setTimeout(function () { updateLayout(true); }, 320);
        });
    }

    window.BSA.isTouchToolbarUi = isTouchToolbarUi;
    applyTouchToolbarClass(); // 첫 그리기 전에(깜빡임 없이) — DOMContentLoaded에서 한 번 더

    window.BSA.mobileKeyboard = {
        isActive: isTouchKeyboardUi,
        refresh: function () { updateLayout(true); },
        reset: clearLift,
        bindBodyScrollDrag: bindBodyScrollDrag
    };

    window.BSA.resetMobileKeyboard = clearLift;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
