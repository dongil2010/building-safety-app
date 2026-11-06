/**
 * 마감재 부재: 기둥/벽체/보/슬래브는 바탕만 고르는 단추.
 * 자식 팝업에서 타일·도장·마감을 고르면 「기둥 타일」처럼 합친 이름만 저장한다.
 * 맨몸 기둥·보·슬래브는 마감재 재사용 목록에 넣지 않는다.
 */
(function (root) {
    'use strict';

    var BASES = ['기둥', '벽체', '보', '슬래브'];
    var MATERIALS = ['타일', '도장', '마감재'];
    var OVERLAY_ID = 'bsaFinishMemberChooser';
    var OVERLAY_CLASS = 'bsa-finish-chooser-overlay';
    var REMOVE_DELAY_MS = 450;

    var BASE_SET = {};
    BASES.forEach(function (b) { BASE_SET[b] = true; });
    var MATERIAL_SET = {};
    MATERIALS.forEach(function (m) { MATERIAL_SET[m] = true; });

    var active = null;
    var shieldOverlay = null;
    var removeTimer = null;

    function str(v) {
        return String(v == null ? '' : v).trim();
    }

    function isBase(name) {
        return !!BASE_SET[str(name)];
    }

    function isMaterial(name) {
        return !!MATERIAL_SET[str(name)];
    }

    function combine(base, material) {
        var b = str(base);
        var m = str(material);
        if (!isBase(b) || !isMaterial(m)) return '';
        return b + ' ' + m;
    }

    function parse(label) {
        var raw = str(label);
        if (!raw) return null;
        var parts = raw.split(/\s+/);
        if (parts.length < 2) return null;
        var material = parts[parts.length - 1];
        var base = parts.slice(0, -1).join(' ');
        if (!isBase(base) || !isMaterial(material)) return null;
        return { base: base, material: material, label: combine(base, material) };
    }

    function isCombined(label) {
        return !!parse(label);
    }

    function hasFinishContext(label) {
        var key = str(label).replace(/\s+/g, '');
        if (!key) return false;
        return /타일|도장|마감재|미장|뿜칠|페인트|석재|수장/.test(key);
    }

    function stopFromParent(e) {
        if (!e) return;
        if (e.stopPropagation) e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
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

    function isolateOverlayEvent(e) {
        var onBackdrop = e.target === e.currentTarget;
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
        ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup',
            'touchstart', 'touchend', 'touchcancel', 'click', 'wheel'].forEach(function (t) {
            overlay.addEventListener(t, isolateOverlayEvent, { capture: true, passive: false });
            overlay.addEventListener(t, isolateOverlayEvent, { capture: false, passive: false });
        });
    }

    function removeOverlayLater(overlay) {
        shieldOverlay = overlay;
        overlay.setAttribute('data-bsa-finish-chooser-closing', '1');
        if (removeTimer) clearTimeout(removeTimer);
        removeTimer = setTimeout(function () {
            removeTimer = null;
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (shieldOverlay === overlay) shieldOverlay = null;
        }, REMOVE_DELAY_MS);
    }

    function finish(mode, label) {
        if (!active) return;
        var a = active;
        active = null;
        document.removeEventListener('keydown', onGlobalKeydown, true);
        if (mode === 'confirm' && label && typeof a.onConfirm === 'function') a.onConfirm(label);
        if (mode === 'cancel' && typeof a.onCancel === 'function') a.onCancel(a.previousValue);
        removeOverlayLater(a.overlay);
    }

    function onGlobalKeydown(e) {
        if (!active) return;
        var k = (e.key || '').toLowerCase();
        if (k === 'escape' || k === 'esc') {
            stopFromParent(e);
            if (e.preventDefault) e.preventDefault();
            finish('cancel');
        }
    }

    function open(opts) {
        opts = opts || {};
        var base = str(opts.base);
        if (!isBase(base)) return false;
        if (active) finish('cancel');
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
            '<div class="bsa-finish-chooser-card">' +
            '<div class="bsa-finish-chooser-title"></div>' +
            '<div class="bsa-finish-chooser-choices" role="group"></div>' +
            '<div class="bsa-finish-chooser-actions">' +
            '<button type="button" class="bsa-finish-chooser-cancel">취소</button>' +
            '</div></div>';
        overlay.querySelector('.bsa-finish-chooser-title').textContent = base + ' 마감 선택';
        var host = overlay.querySelector('.bsa-finish-chooser-choices');
        MATERIALS.forEach(function (m) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bsa-finish-chooser-choice';
            btn.setAttribute('data-material', m);
            btn.textContent = m;
            host.appendChild(btn);
        });
        document.body.appendChild(overlay);

        active = {
            overlay: overlay,
            base: base,
            previousValue: opts.previousValue == null ? '' : String(opts.previousValue),
            onConfirm: opts.onConfirm,
            onCancel: opts.onCancel
        };

        bindOverlayIsolation(overlay);
        overlay.addEventListener('pointerdown', function (e) {
            if (e.target === overlay) {
                if (e.preventDefault) e.preventDefault();
                stopFromParent(e);
                finish('cancel');
            }
        });
        overlay.querySelectorAll('[data-material]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                if (e.preventDefault) e.preventDefault();
                stopFromParent(e);
                finish('confirm', combine(base, btn.getAttribute('data-material')));
            });
        });
        overlay.querySelector('.bsa-finish-chooser-cancel').addEventListener('click', function (e) {
            if (e.preventDefault) e.preventDefault();
            stopFromParent(e);
            finish('cancel');
        });
        document.addEventListener('keydown', onGlobalKeydown, true);
        return true;
    }

    function close(mode) {
        finish(mode === 'confirm' ? 'confirm' : 'cancel');
    }

    var api = {
        BASES: BASES.slice(),
        MATERIALS: MATERIALS.slice(),
        isBase: isBase,
        isMaterial: isMaterial,
        combine: combine,
        parse: parse,
        isCombined: isCombined,
        hasFinishContext: hasFinishContext,
        open: open,
        close: close,
        isOpen: isOpen,
        isElement: isElement
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.finishMemberChooser = api;
    root.BsaFinishMemberChooser = api;
})(typeof window !== 'undefined' ? window : globalThis);
