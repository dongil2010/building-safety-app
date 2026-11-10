/**
 * 사진 크게 보기 — 확대·축소·끌어서 이동 (2026-11-10)
 *
 * 왜: 찍은 사진을 누르면 그리기(마킹) 창이 떠서, 보려고 만지면 선이 그어졌다.
 *     「그거 말고 확대 축소 해서 볼 수 있게」 → 누르면 이 보기 창이 뜬다. 그리기는 위 「그리기」 단추로.
 * 어디에: 결함 수정창의 현차·전차 사진, 균열 게이지·팁 비교 사진.
 * 조작: 두 손가락 벌리기/오므리기, 끌어서 이동, 두 번 누르기(확대 ↔ 맞춤), 마우스 휠, + − 맞춤 단추.
 *       사진이 여러 장이면 ‹ › 단추·좌우 화살표 키·(맞춤 상태에서) 옆으로 밀기.
 * 닫기: × 단추, Esc, 뒤로가기, 사진 바깥(검은 곳) 누르기.
 * 사진은 건드리지 않는다(보기만). 화면 전용.
 */
(function (root) {
    'use strict';

    var ZOOM_STEP = 1.5;
    var DOUBLE_TAP_ZOOM = 2.5;
    var TAP_SLOP = 8;
    var DOUBLE_TAP_MS = 320;
    var SWIPE_PX = 60;

    /** 사진 전체가 보이는 배율 */
    function fitScale(iw, ih, W, H) {
        if (!(iw > 0 && ih > 0 && W > 0 && H > 0)) return 1;
        return Math.min(W / iw, H / ih);
    }

    /** 배율 범위: 맞춤 ~ 맞춤의 8배(작은 사진도 원본의 3배까지는) */
    function scaleLimits(iw, ih, W, H) {
        var fit = fitScale(iw, ih, W, H);
        return { min: fit, max: Math.max(fit * 8, 3) };
    }

    /** 사진이 화면 밖으로 달아나지 않게: 화면보다 작으면 가운데, 크면 가장자리까지만 */
    function clampView(v, iw, ih, W, H) {
        var lim = scaleLimits(iw, ih, W, H);
        var s = Math.min(Math.max(Number(v && v.scale) || lim.min, lim.min), lim.max);
        var w = iw * s, h = ih * s;
        var x = Number(v && v.x) || 0, y = Number(v && v.y) || 0;
        x = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, x));
        y = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, y));
        return { scale: s, x: x, y: y };
    }

    function fitView(iw, ih, W, H) {
        return clampView({ scale: fitScale(iw, ih, W, H), x: 0, y: 0 }, iw, ih, W, H);
    }

    /** (px,py) 화면 점 아래의 사진 자리를 그대로 둔 채 factor배 */
    function zoomAt(v, factor, px, py, iw, ih, W, H) {
        var lim = scaleLimits(iw, ih, W, H);
        var s = Math.min(Math.max(v.scale * factor, lim.min), lim.max);
        var k = s / v.scale;
        return clampView({ scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, iw, ih, W, H);
    }

    function isAtFit(v, iw, ih, W, H) {
        return v.scale <= fitScale(iw, ih, W, H) * 1.01;
    }

    var api = {
        fitScale: fitScale,
        scaleLimits: scaleLimits,
        clampView: clampView,
        fitView: fitView,
        zoomAt: zoomAt,
        isAtFit: isAtFit,
        isOpen: function () { return false; },
        isElement: function () { return false; },
        open: function () { return false; },
        close: function () {}
    };
    root.BSA = root.BSA || {};
    root.BSA.photoZoomViewer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    /* ------------------------------------------------------------------ 브라우저 */

    var st = {
        el: null, stage: null, img: null,
        photos: [], index: 0, onDraw: null, label: '',
        iw: 0, ih: 0, view: { scale: 1, x: 0, y: 0 },
        pointers: {}, moved: false, downAt: 0, downX: 0, downY: 0,
        pinchDist: 0, pinchMidX: 0, pinchMidY: 0, wasPinch: false,
        lastTapAt: 0, lastTapX: 0, lastTapY: 0
    };

    function build() {
        if (st.el) return st.el;
        var el = document.createElement('div');
        el.id = 'bsaPhotoViewer';
        el.className = 'bsa-pv';
        el.hidden = true;
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', '사진 크게 보기');
        el.innerHTML =
            '<div class="bsa-pv-stage"><img class="bsa-pv-img" alt="" draggable="false"></div>' +
            '<div class="bsa-pv-bar">' +
                '<span class="bsa-pv-count" aria-live="polite"></span>' +
                '<button type="button" class="bsa-pv-btn bsa-pv-draw" data-pv="draw" title="사진 위에 그리기(마킹)">그리기</button>' +
                '<button type="button" class="bsa-pv-btn" data-pv="out" title="축소" aria-label="축소">−</button>' +
                '<button type="button" class="bsa-pv-btn bsa-pv-fit" data-pv="fit" title="화면에 맞춤">맞춤</button>' +
                '<button type="button" class="bsa-pv-btn" data-pv="in" title="확대" aria-label="확대">+</button>' +
                '<button type="button" class="bsa-pv-btn bsa-pv-close" data-pv="close" title="닫기 (Esc)" aria-label="닫기">×</button>' +
            '</div>' +
            '<button type="button" class="bsa-pv-nav bsa-pv-prev" data-pv="prev" title="이전 사진" aria-label="이전 사진">‹</button>' +
            '<button type="button" class="bsa-pv-nav bsa-pv-next" data-pv="next" title="다음 사진" aria-label="다음 사진">›</button>' +
            '<div class="bsa-pv-hint">두 손가락으로 확대·축소 · 바깥 눌러 닫기</div>';
        document.body.appendChild(el);
        st.el = el;
        st.stage = el.querySelector('.bsa-pv-stage');
        st.img = el.querySelector('.bsa-pv-img');

        st.img.addEventListener('load', function () {
            st.iw = st.img.naturalWidth || 0;
            st.ih = st.img.naturalHeight || 0;
            st.img.style.width = st.iw + 'px';
            st.img.style.height = st.ih + 'px';
            st.el.classList.remove('bsa-pv-loading');
            resetView();
        });
        st.img.addEventListener('error', function () { st.el.classList.remove('bsa-pv-loading'); });
        st.img.addEventListener('dragstart', function (e) { e.preventDefault(); });

        el.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('[data-pv]') : null;
            if (!b) {
                // 사진 바깥(검은 곳)을 한 번 누르면 닫는다. pointerup이 아니라 click에서 닫아야
                // 그 누르기의 click이 아래에 깔린 수정창 단추에 떨어지지 않는다.
                e.preventDefault();
                e.stopPropagation();
                if (st.stage.contains(e.target) && !st.moved && !st.wasPinch && !pointInsidePhoto(stagePoint(e))) close();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            var act = b.getAttribute('data-pv');
            if (act === 'close') close();
            else if (act === 'in') zoomCenter(ZOOM_STEP);
            else if (act === 'out') zoomCenter(1 / ZOOM_STEP);
            else if (act === 'fit') resetView();
            else if (act === 'prev') go(-1);
            else if (act === 'next') go(1);
            else if (act === 'draw') {
                var fn = st.onDraw, idx = st.index;
                close();
                if (typeof fn === 'function') fn(idx);
            }
        });

        var stage = st.stage;
        stage.addEventListener('pointerdown', onDown);
        stage.addEventListener('pointermove', onMove);
        stage.addEventListener('pointerup', onUp);
        stage.addEventListener('pointercancel', onCancel);
        stage.addEventListener('wheel', function (e) {
            e.preventDefault();
            var p = stagePoint(e);
            setView(zoomAt(st.view, e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y, st.iw, st.ih, stageW(), stageH()));
        }, { passive: false });
        stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        // 확대한 사진을 끌 때 페이지가 같이 밀리거나 브라우저가 확대되지 않게
        el.addEventListener('touchmove', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
        return el;
    }

    function stageW() { return st.stage ? st.stage.clientWidth : 0; }
    function stageH() { return st.stage ? st.stage.clientHeight : 0; }
    function stagePoint(e) {
        var r = st.stage.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function setView(v) {
        st.view = v;
        st.img.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.scale + ')';
        st.el.classList.toggle('bsa-pv-zoomed', !isAtFit(v, st.iw, st.ih, stageW(), stageH()));
    }
    function resetView() {
        if (!st.iw || !st.ih) return;
        setView(fitView(st.iw, st.ih, stageW(), stageH()));
    }
    function zoomCenter(factor) {
        if (!st.iw) return;
        setView(zoomAt(st.view, factor, stageW() / 2, stageH() / 2, st.iw, st.ih, stageW(), stageH()));
    }

    function show(index) {
        var n = st.photos.length;
        st.index = Math.max(0, Math.min(n - 1, index));
        st.iw = 0; st.ih = 0;
        st.el.classList.add('bsa-pv-loading');
        st.img.style.transform = '';
        st.img.style.width = '';
        st.img.style.height = '';
        st.img.alt = (st.label ? st.label + ' ' : '사진 ') + (st.index + 1);
        st.img.src = st.photos[st.index];
        st.el.querySelector('.bsa-pv-count').textContent = (st.label ? st.label + ' ' : '') + (n > 1 ? (st.index + 1) + ' / ' + n : '');
        st.el.querySelector('.bsa-pv-prev').hidden = !(n > 1 && st.index > 0);
        st.el.querySelector('.bsa-pv-next').hidden = !(n > 1 && st.index < n - 1);
    }
    function go(d) {
        var next = st.index + d;
        if (next < 0 || next >= st.photos.length) return;
        show(next);
    }

    function pointerCount() { return Object.keys(st.pointers).length; }
    function twoPointers() {
        var k = Object.keys(st.pointers);
        return [st.pointers[k[0]], st.pointers[k[1]]];
    }

    function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var p = stagePoint(e);
        st.pointers[e.pointerId] = { x: p.x, y: p.y };
        try { st.stage.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
        if (pointerCount() === 1) {
            st.moved = false; st.wasPinch = false;
            st.downAt = Date.now(); st.downX = p.x; st.downY = p.y;
        } else if (pointerCount() === 2) {
            var t = twoPointers();
            st.pinchDist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
            st.pinchMidX = (t[0].x + t[1].x) / 2;
            st.pinchMidY = (t[0].y + t[1].y) / 2;
            st.wasPinch = true; st.moved = true;
        }
        e.preventDefault();
    }

    function onMove(e) {
        var cur = st.pointers[e.pointerId];
        if (!cur || !st.iw) return;
        var p = stagePoint(e);
        var dx = p.x - cur.x, dy = p.y - cur.y;
        cur.x = p.x; cur.y = p.y;
        var W = stageW(), H = stageH();
        if (pointerCount() >= 2) {
            var t = twoPointers();
            var dist = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y);
            var mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2;
            var v = st.view;
            if (st.pinchDist > 0 && dist > 0) v = zoomAt(v, dist / st.pinchDist, mx, my, st.iw, st.ih, W, H);
            v = clampView({ scale: v.scale, x: v.x + (mx - st.pinchMidX), y: v.y + (my - st.pinchMidY) }, st.iw, st.ih, W, H);
            st.pinchDist = dist; st.pinchMidX = mx; st.pinchMidY = my;
            setView(v);
        } else {
            if (!st.moved && Math.hypot(p.x - st.downX, p.y - st.downY) > TAP_SLOP) st.moved = true;
            if (st.moved) setView(clampView({ scale: st.view.scale, x: st.view.x + dx, y: st.view.y + dy }, st.iw, st.ih, W, H));
        }
        e.preventDefault();
    }

    function onUp(e) {
        var cur = st.pointers[e.pointerId];
        if (!cur) return;
        delete st.pointers[e.pointerId];
        try { st.stage.releasePointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
        if (pointerCount() > 0) return;
        var p = stagePoint(e);
        var W = stageW(), H = stageH();
        if (!st.moved && !st.wasPinch) { onTap(p); return; }
        // 맞춤 상태에서 옆으로 밀기 → 이전/다음 사진
        if (!st.wasPinch && st.photos.length > 1 && st.iw && isAtFit(st.view, st.iw, st.ih, W, H)) {
            var sx = p.x - st.downX, sy = p.y - st.downY;
            if (Math.abs(sx) >= SWIPE_PX && Math.abs(sx) > Math.abs(sy) * 1.5) go(sx < 0 ? 1 : -1);
        }
    }

    function onCancel(e) {
        delete st.pointers[e.pointerId];
    }

    function pointInsidePhoto(p) {
        var v = st.view;
        return st.iw > 0 && p.x >= v.x && p.x <= v.x + st.iw * v.scale && p.y >= v.y && p.y <= v.y + st.ih * v.scale;
    }

    function onTap(p) {
        var now = Date.now();
        var v = st.view;
        var isDouble = (now - st.lastTapAt) < DOUBLE_TAP_MS && Math.hypot(p.x - st.lastTapX, p.y - st.lastTapY) < 30;
        st.lastTapAt = now; st.lastTapX = p.x; st.lastTapY = p.y;
        if (isDouble && st.iw) {
            st.lastTapAt = 0;
            var W = stageW(), H = stageH();
            if (isAtFit(v, st.iw, st.ih, W, H)) setView(zoomAt(v, DOUBLE_TAP_ZOOM, p.x, p.y, st.iw, st.ih, W, H));
            else resetView();
        }
    }

    function onKey(e) {
        if (!api.isOpen()) return;
        var k = e.key;
        var handled = true;
        if (k === 'Escape') close();
        else if (k === 'ArrowLeft') go(-1);
        else if (k === 'ArrowRight') go(1);
        else if (k === '+' || k === '=') zoomCenter(ZOOM_STEP);
        else if (k === '-' || k === '_') zoomCenter(1 / ZOOM_STEP);
        else if (k === '0') resetView();
        else handled = false;
        if (handled) { e.preventDefault(); e.stopPropagation(); }
    }

    function onResize() {
        if (!api.isOpen() || !st.iw) return;
        var W = stageW(), H = stageH();
        setView(st.el.classList.contains('bsa-pv-zoomed') ? clampView(st.view, st.iw, st.ih, W, H) : fitView(st.iw, st.ih, W, H));
    }

    /**
     * opts: { photos: [src…] 또는 src: '…', index: 0, label: '현차', onDraw: function(index) }
     * onDraw가 있으면 「그리기」 단추가 보이고, 누르면 이 창을 닫은 뒤 onDraw(지금 보던 사진 번호)를 부른다.
     */
    api.open = function (opts) {
        opts = opts || {};
        var photos = (Array.isArray(opts.photos) ? opts.photos : [opts.src]).filter(Boolean);
        if (!photos.length) return false;
        build();
        st.photos = photos;
        st.onDraw = typeof opts.onDraw === 'function' ? opts.onDraw : null;
        st.label = opts.label ? String(opts.label) : '';
        st.pointers = {};
        st.lastTapAt = 0;
        st.el.querySelector('.bsa-pv-draw').hidden = !st.onDraw;
        st.el.hidden = false;
        document.documentElement.classList.add('bsa-pv-open');
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_e) { /* ignore */ }
        show(Number(opts.index) || 0);
        return true;
    };
    api.close = function () { close(); };
    api.isOpen = function () { return !!(st.el && !st.el.hidden); };
    /** 보기 창(또는 그 안) 요소인가 — 바깥 누르기로 수정창을 닫는 코드가 건너뛸 때 쓴다 */
    api.isElement = function (el) {
        return !!(el && st.el && (el === st.el || (typeof st.el.contains === 'function' && st.el.contains(el))));
    };

    function close() {
        if (!st.el || st.el.hidden) return;
        st.el.hidden = true;
        st.pointers = {};
        st.onDraw = null;
        st.photos = [];
        st.img.removeAttribute('src');
        document.documentElement.classList.remove('bsa-pv-open');
    }

    // window 캡처: 아래에 깔린 수정창의 Esc·화살표 처리보다 먼저 받는다
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', function () { setTimeout(onResize, 250); });
})(typeof window !== 'undefined' ? window : globalThis);
