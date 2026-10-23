/**
 * 앱 공용 확인·알림·입력 창 (2026-09-29)
 * 안드로이드·브라우저 기본 confirm/alert/prompt 창 대신 앱 디자인(모달 카드) 창을 띄운다.
 *
 *   await window.appConfirm(message, { title, okText, cancelText, danger })  → true(확인) / false(취소)
 *   await window.appAlert(message, { title })                                → (닫힐 때)
 *   await window.appPrompt(message, defaultValue, { title, okText })         → 문자열 / null(취소)
 *   await window.appChoose(message, choices, { title, okText, defaultIndex }) → 고른 번호(0부터) / null(취소)
 *       choices: [{ label, detail }] 또는 문자열 — 라디오 목록(2026-09-30)
 *   await window.appChooseMany(message, choices, { title, okText, checked }) → 고른 번호 배열 / null(취소)
 *       checked: 처음에 체크할 번호 배열(없으면 전부 체크) — 체크 목록(2026-10-23 여러 동 한글 출력)
 *   window.appDialog.isOpen() / .cancel()  — 안드로이드 뒤로가기 = 취소
 *
 * 키: Enter = 확인, Esc = 취소 (PC). 창이 떠 있는 동안 앱의 다른 키 단축키로는 안 흘러간다.
 * 여러 개가 겹치면 차례로 하나씩 띄운다. window.alert 는 이 창으로 바꿔 둔다(반환값을 쓰는 곳이 없음).
 * confirm·prompt 는 기다려야 하므로(비동기) 부르는 쪽을 await 로 고쳐 쓴다.
 */
(function (root) {
    'use strict';

    var DANGER_RE = /삭제|지울까|지웁|지우|비우고|비웁|초기화|되돌릴 수 없|복구할 수 없|탈퇴|거절|보내시겠|회사에서 나가|덮어쓰/;

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** 옵션 정리 (테스트용으로 내보냄) */
    function normalizeOptions(kind, message, opts) {
        opts = opts || {};
        var msg = String(message == null ? '' : message);
        var danger = typeof opts.danger === 'boolean' ? opts.danger : (kind === 'confirm' && DANGER_RE.test(msg));
        return {
            kind: kind,
            message: msg,
            title: opts.title || (kind === 'alert' ? '알림' : (kind === 'prompt' ? '입력' : ((kind === 'choose' || kind === 'chooseMany') ? '선택' : (danger ? '주의' : '확인')))),
            okText: opts.okText || '확인',
            cancelText: opts.cancelText || '취소',
            danger: !!danger,
            defaultValue: opts.defaultValue == null ? '' : String(opts.defaultValue),
            placeholder: opts.placeholder || '',
            choices: (kind === 'choose' || kind === 'chooseMany') ? normalizeChoices(opts.choices) : [],
            defaultIndex: kind === 'choose' ? clampIndex(opts.defaultIndex, opts.choices) : 0,
            checked: kind === 'chooseMany' ? normalizeChecked(opts.checked, opts.choices) : []
        };
    }

    function normalizeChoices(list) {
        return (Array.isArray(list) ? list : []).map(function (c) {
            if (c && typeof c === 'object') return { label: String(c.label == null ? '' : c.label), detail: String(c.detail == null ? '' : c.detail) };
            return { label: String(c == null ? '' : c), detail: '' };
        });
    }

    /** 체크 목록 처음 체크 — 없으면 전부 */
    function normalizeChecked(list, choices) {
        var n = Array.isArray(choices) ? choices.length : 0;
        if (!Array.isArray(list)) return Array.from({ length: n }, function (_v, i) { return i; });
        return list.map(function (v) { return parseInt(v, 10); }).filter(function (v) { return v >= 0 && v < n; });
    }

    function clampIndex(i, list) {
        var n = Array.isArray(list) ? list.length : 0;
        var v = parseInt(i, 10);
        return (v >= 0 && v < n) ? v : 0;
    }

    var api = { normalizeOptions: normalizeOptions, DANGER_RE: DANGER_RE };
    root.BsaAppDialog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    /* ------------------------------------------------------------------ 브라우저 */
    var queue = [];
    var current = null; // { o, resolve, el, prevFocus }
    var nativeAlert = window.alert ? window.alert.bind(window) : null;
    window.__bsaNativeAlert = nativeAlert;

    function ensureRoot() {
        var el = document.getElementById('bsaAppDialog');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'bsaAppDialog';
        el.className = 'bsa-dialog-overlay';
        el.setAttribute('aria-hidden', 'true');
        el.hidden = true;
        (document.body || document.documentElement).appendChild(el);
        // 창 안 누르기가 다른 「바깥 누르면 닫기」 처리로 새지 않게(버블 단계)
        ['pointerdown', 'mousedown', 'touchstart', 'click'].forEach(function (t) {
            el.addEventListener(t, function (e) { e.stopPropagation(); }, t === 'touchstart' ? { passive: true } : false);
        });
        el.addEventListener('click', function (e) {
            var t = e.target;
            if (!current) return;
            if (t === el) { // 어두운 바깥 = 취소 (알림은 닫기)
                finish(current.o.kind === 'alert' ? true : false);
                return;
            }
            var btn = t && t.closest ? t.closest('[data-bsa-dialog]') : null;
            if (!btn) return;
            finish(btn.getAttribute('data-bsa-dialog') === 'ok');
        });
        return el;
    }

    function render(o) {
        var el = ensureRoot();
        var body = '<p class="bsa-dialog-message">' + escapeHtml(o.message) + '</p>';
        if (o.kind === 'prompt') {
            body += '<input type="text" class="form-control bsa-dialog-input" autocomplete="off"' +
                ' value="' + escapeHtml(o.defaultValue) + '" placeholder="' + escapeHtml(o.placeholder) + '">';
        }
        if (o.kind === 'choose') {
            body += '<div class="bsa-dialog-choices" role="radiogroup">' + o.choices.map(function (c, i) {
                return '<label class="bsa-dialog-choice">' +
                    '<input type="radio" name="bsaDialogChoice" value="' + i + '"' + (i === o.defaultIndex ? ' checked' : '') + '>' +
                    '<span class="bsa-dialog-choice-text"><span class="bsa-dialog-choice-label">' + escapeHtml(c.label) + '</span>' +
                    (c.detail ? '<span class="bsa-dialog-choice-detail">' + escapeHtml(c.detail) + '</span>' : '') +
                    '</span></label>';
            }).join('') + '</div>';
        }
        if (o.kind === 'chooseMany') {
            body += '<div class="bsa-dialog-choices" role="group">' + o.choices.map(function (c, i) {
                return '<label class="bsa-dialog-choice">' +
                    '<input type="checkbox" name="bsaDialogCheck" value="' + i + '"' + (o.checked.indexOf(i) >= 0 ? ' checked' : '') + '>' +
                    '<span class="bsa-dialog-choice-text"><span class="bsa-dialog-choice-label">' + escapeHtml(c.label) + '</span>' +
                    (c.detail ? '<span class="bsa-dialog-choice-detail">' + escapeHtml(c.detail) + '</span>' : '') +
                    '</span></label>';
            }).join('') + '</div>';
        }
        var icon = o.danger ? 'fa-triangle-exclamation' : (o.kind === 'alert' ? 'fa-circle-info' : (o.kind === 'prompt' ? 'fa-pen' : 'fa-circle-question'));
        el.innerHTML =
            '<div class="modal-card bsa-dialog-card' + (o.danger ? ' is-danger' : '') + '" role="' + (o.kind === 'alert' ? 'alertdialog' : 'dialog') + '"' +
            ' aria-modal="true" aria-labelledby="bsaDialogTitle" aria-describedby="bsaDialogMsg">' +
            '<div class="modal-header"><h3 id="bsaDialogTitle"><i class="fa-solid ' + icon + '"></i> ' + escapeHtml(o.title) + '</h3></div>' +
            '<div class="modal-body" id="bsaDialogMsg">' + body + '</div>' +
            '<div class="modal-footer bsa-dialog-footer">' +
            (o.kind === 'alert' ? '' : '<button type="button" class="btn btn-outline" data-bsa-dialog="cancel">' + escapeHtml(o.cancelText) + '</button>') +
            '<button type="button" class="btn ' + (o.danger ? 'btn-danger bsa-dialog-danger' : 'btn-primary') + '" data-bsa-dialog="ok">' + escapeHtml(o.okText) + '</button>' +
            '</div></div>';
        el.hidden = false;
        el.classList.add('open');
        el.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('bsa-dialog-open');
        var focusEl = o.kind === 'prompt' ? el.querySelector('.bsa-dialog-input')
            : (o.kind === 'choose' ? el.querySelector('input[name="bsaDialogChoice"]:checked')
                : (o.kind === 'chooseMany' ? el.querySelector('input[name="bsaDialogCheck"]') : el.querySelector('[data-bsa-dialog="ok"]')));
        setTimeout(function () {
            try { focusEl && focusEl.focus(); if (o.kind === 'prompt' && focusEl.select) focusEl.select(); } catch (_e) { /* ignore */ }
        }, 30);
        armPromptFocusGuard(el, o, focusEl);
        return el;
    }

    // 2026-10-14 입력 창(도면 메모 등) 키보드 안 먹힘 대책:
    //  · 창이 떠 있는 동안 포커스가 창 밖(도면·body)으로 빠지면 입력칸으로 되돌린다
    //  · 입력칸을 누르면 확실히 포커스(안드로이드 WebView에서 자동 포커스로 키보드가 안 뜬 경우)
    //  · 키보드가 올라오면 창을 보이는 화면(visualViewport) 높이에 맞추고 입력칸을 화면 안으로
    var promptGuard = null;
    function armPromptFocusGuard(el, o, focusEl) {
        disarmPromptFocusGuard();
        if (o.kind !== 'prompt' || !focusEl) return;
        var g = { el: el, input: focusEl };
        g.onFocusOut = function (e) {
            var to = e.relatedTarget;
            if (to && el.contains(to)) return;
            setTimeout(function () {
                if (promptGuard !== g || !current) return;
                var ae = document.activeElement;
                if (ae && ae !== document.body && ae !== document.documentElement && !el.contains(ae)) return;
                try { g.input.focus({ preventScroll: true }); } catch (_e) { /* ignore */ }
            }, 0);
        };
        g.onTapInput = function (e) {
            if (e.target !== g.input) return;
            if (document.activeElement !== g.input) { try { g.input.focus(); } catch (_e) { /* ignore */ } }
        };
        g.fit = function () {
            var vv = window.visualViewport;
            if (!vv) return;
            var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
            el.style.top = vv.offsetTop + 'px';
            el.style.height = vv.height + 'px';
            el.style.bottom = 'auto';
            el.style.overflowY = 'auto';
            el.style.alignItems = kb > 80 ? 'flex-start' : '';
            if (document.activeElement === g.input) {
                try { g.input.scrollIntoView({ block: 'center' }); } catch (_e) { /* ignore */ }
            }
        };
        g.onFocusIn = function () { setTimeout(g.fit, 150); setTimeout(g.fit, 450); };
        el.addEventListener('focusout', g.onFocusOut);
        el.addEventListener('focusin', g.onFocusIn);
        el.addEventListener('pointerup', g.onTapInput);
        el.addEventListener('touchend', g.onTapInput);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', g.fit);
            window.visualViewport.addEventListener('scroll', g.fit);
        }
        promptGuard = g;
    }
    function disarmPromptFocusGuard() {
        var g = promptGuard;
        if (!g) return;
        promptGuard = null;
        g.el.removeEventListener('focusout', g.onFocusOut);
        g.el.removeEventListener('focusin', g.onFocusIn);
        g.el.removeEventListener('pointerup', g.onTapInput);
        g.el.removeEventListener('touchend', g.onTapInput);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', g.fit);
            window.visualViewport.removeEventListener('scroll', g.fit);
        }
        ['top', 'height', 'bottom', 'overflowY', 'alignItems'].forEach(function (k) { g.el.style[k] = ''; });
    }

    function showNext() {
        if (current || !queue.length) return;
        var item = queue.shift();
        current = item;
        item.prevFocus = document.activeElement;
        try { render(item.o); } catch (err) {
            // 그릴 수 없으면(문서 준비 전 등) 기본 창으로
            current = null;
            item.resolve(fallback(item.o));
            showNext();
        }
    }

    function fallback(o) {
        try {
            if (o.kind === 'confirm') return window.confirm(o.message);
            if (o.kind === 'prompt') return window.prompt(o.message, o.defaultValue);
            if (o.kind === 'choose') {
                var lines = o.choices.map(function (c, i) { return (i + 1) + ' = ' + c.label + (c.detail ? ' (' + c.detail + ')' : ''); });
                var r = window.prompt(o.message + '\n\n' + lines.join('\n'), String(o.defaultIndex + 1));
                var k = r == null ? -1 : parseInt(r, 10) - 1;
                return (k >= 0 && k < o.choices.length) ? k : null;
            }
            if (o.kind === 'chooseMany') {
                var mLines = o.choices.map(function (c, i) { return (i + 1) + ' = ' + c.label + (c.detail ? ' (' + c.detail + ')' : ''); });
                var mr = window.prompt(o.message + '\n\n' + mLines.join('\n') + '\n(번호를 쉼표로)', o.checked.map(function (i) { return i + 1; }).join(','));
                if (mr == null) return null;
                return String(mr).split(/[,\s]+/).map(function (v) { return parseInt(v, 10) - 1; })
                    .filter(function (v, i, a) { return v >= 0 && v < o.choices.length && a.indexOf(v) === i; });
            }
            if (nativeAlert) nativeAlert(o.message);
        } catch (_e) { /* ignore */ }
        return o.kind === 'confirm' ? false : ((o.kind === 'prompt' || o.kind === 'choose' || o.kind === 'chooseMany') ? null : undefined);
    }

    function finish(ok) {
        var item = current;
        if (!item) return;
        var el = document.getElementById('bsaAppDialog');
        var value;
        if (item.o.kind === 'confirm') value = !!ok;
        else if (item.o.kind === 'prompt') {
            var inp = el && el.querySelector('.bsa-dialog-input');
            value = ok ? (inp ? inp.value : '') : null;
        } else if (item.o.kind === 'choose') {
            var picked = el && el.querySelector('input[name="bsaDialogChoice"]:checked');
            value = (ok && picked) ? parseInt(picked.value, 10) : null;
        } else if (item.o.kind === 'chooseMany') {
            value = ok && el
                ? Array.prototype.map.call(el.querySelectorAll('input[name="bsaDialogCheck"]:checked'), function (c) { return parseInt(c.value, 10); })
                : null;
        } else value = undefined;
        current = null;
        disarmPromptFocusGuard();
        if (el) {
            el.classList.remove('open');
            el.hidden = true;
            el.setAttribute('aria-hidden', 'true');
            el.innerHTML = '';
        }
        document.documentElement.classList.remove('bsa-dialog-open');
        try { if (item.prevFocus && item.prevFocus.focus && item.prevFocus.isConnected) item.prevFocus.focus({ preventScroll: true }); } catch (_e) { /* ignore */ }
        item.resolve(value);
        setTimeout(showNext, 0);
    }

    function open(kind, message, opts) {
        var o = normalizeOptions(kind, message, opts);
        return new Promise(function (resolve) {
            queue.push({ o: o, resolve: resolve });
            if (document.body) showNext();
            else document.addEventListener('DOMContentLoaded', showNext, { once: true });
        });
    }

    // Enter = 확인, Esc = 취소 — 창이 떠 있으면 앱 단축키(Delete·Esc 등)로 안 흘러가게 가장 먼저 잡는다
    window.addEventListener('keydown', function (e) {
        if (!current) return;
        var inInput = e.target && e.target.classList && e.target.classList.contains('bsa-dialog-input');
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(current.o.kind === 'alert');
            return;
        }
        if (e.key === 'Enter' && !e.isComposing) {
            var onBtn = e.target && e.target.closest && e.target.closest('[data-bsa-dialog]');
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(onBtn ? onBtn.getAttribute('data-bsa-dialog') === 'ok' : true);
            return;
        }
        if (e.key === 'Tab') { // 창 안에서만 돈다
            var el = document.getElementById('bsaAppDialog');
            var f = el ? Array.prototype.slice.call(el.querySelectorAll('button, input')) : [];
            if (f.length) {
                var i = f.indexOf(document.activeElement);
                var n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
                e.preventDefault();
                f[n].focus();
            }
            e.stopImmediatePropagation();
            return;
        }
        if (!inInput) e.stopImmediatePropagation();
        else e.stopPropagation();
    }, true);

    window.appDialog = {
        confirm: function (message, opts) { return open('confirm', message, opts); },
        alert: function (message, opts) { return open('alert', message, opts); },
        prompt: function (message, defaultValue, opts) {
            var o = Object.assign({}, opts || {});
            if (o.defaultValue == null) o.defaultValue = defaultValue;
            return open('prompt', message, o);
        },
        choose: function (message, choices, opts) {
            var o = Object.assign({}, opts || {});
            o.choices = choices;
            return open('choose', message, o);
        },
        chooseMany: function (message, choices, opts) {
            var o = Object.assign({}, opts || {});
            o.choices = choices;
            return open('chooseMany', message, o);
        },
        isOpen: function () { return !!current; },
        /** 안드로이드 뒤로가기 등: 떠 있는 창을 취소로 닫는다 */
        cancel: function () { if (current) finish(current.o.kind === 'alert'); },
        isDialogElement: function (el) { return !!(el && el.closest && el.closest('#bsaAppDialog')); }
    };
    window.appConfirm = window.appDialog.confirm;
    window.appAlert = window.appDialog.alert;
    window.appPrompt = window.appDialog.prompt;
    window.appChoose = window.appDialog.choose;
    window.appChooseMany = window.appDialog.chooseMany;
    // alert: 돌려주는 값이 없으니 그대로 앱 창으로 바꾼다(기다리지 않음)
    window.alert = function (message) { window.appDialog.alert(message); };
})(typeof window !== 'undefined' ? window : globalThis);
