/**
 * 2026-10-21 비파괴 탭(PC): 도면 : 결과표 = 약 3:2로 화면 높이를 나눠, 페이지 전체가 아니라 결과표만 따로 스크롤.
 * 표 머리(제목·열 이름)는 표 칸 안에서 고정. 가운데 막대를 끌면 비율을 바꾸고 기기에 기억한다.
 * 태블릿(layout-tablet)·폰·좁은 화면(1000px 미만)은 예전 배치 그대로.
 */
(function (root) {
    'use strict';
    var KEY = 'bsa_ndt_split_ratio_v1';
    var DEFAULT_RATIO = 0.6;
    var MIN_TOP = 260, MIN_BOTTOM = 140;

    function clampRatio(r) {
        var n = Number(r);
        if (!Number.isFinite(n)) return DEFAULT_RATIO;
        return Math.min(0.85, Math.max(0.3, n));
    }

    /** avail(도면+막대+표 머리+표 칸에 쓸 높이), headH(표 제목줄), barH(막대) → { top, bottom } 또는 null(너무 낮음) */
    function computeSplit(avail, ratio, headH, barH) {
        var rest = avail - (headH || 0) - (barH || 0);
        if (!(rest >= MIN_TOP + MIN_BOTTOM)) return null;
        var top = Math.round(rest * clampRatio(ratio));
        top = Math.max(MIN_TOP, Math.min(rest - MIN_BOTTOM, top));
        return { top: top, bottom: rest - top };
    }

    var api = { computeSplit: computeSplit, clampRatio: clampRatio, KEY: KEY, DEFAULT_RATIO: DEFAULT_RATIO };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (!root || typeof document === 'undefined') return;
    root.BSA = root.BSA || {};
    root.BSA.ndtSplit = api;

    function readRatio() {
        try { return clampRatio(parseFloat(localStorage.getItem(KEY))); } catch (_e) { return DEFAULT_RATIO; }
    }
    function saveRatio(r) {
        try { localStorage.setItem(KEY, String(clampRatio(r))); } catch (_e) { /* ignore */ }
    }

    function scrollerOf(el) {
        var p = el && el.parentElement;
        while (p && p !== document.body) {
            var s = getComputedStyle(p);
            if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
            p = p.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    function els() {
        var tab = document.getElementById('tab-ndt');
        return {
            tab: tab,
            canvas: document.getElementById('ndtCanvasContainer'),
            col: tab && tab.querySelector('.ndt-canvas-col'),
            results: tab && tab.querySelector('.ndt-results-section'),
            head: tab && tab.querySelector('.ndt-results-head'),
            wrap: tab && tab.querySelector('.ndt-results-table-wrap')
        };
    }

    function ensureBar(e) {
        var bar = document.getElementById('ndtSplitBar');
        if (bar || !e.col || !e.col.parentNode) return bar;
        bar = document.createElement('div');
        bar.id = 'ndtSplitBar';
        bar.className = 'ndt-split-bar';
        bar.title = '끌어서 도면·결과표 높이 조절 (두 번 누르면 3:2로)';
        bar.setAttribute('role', 'separator');
        bar.setAttribute('aria-orientation', 'horizontal');
        bar.innerHTML = '<span class="ndt-split-grip"></span>';
        e.col.parentNode.insertBefore(bar, e.col.nextSibling);
        var drag = null;
        bar.addEventListener('pointerdown', function (ev) {
            var cur = els();
            if (!cur.canvas || !cur.tab.classList.contains('ndt-split-on')) return;
            ev.preventDefault();
            drag = { y: ev.clientY, top: cur.canvas.getBoundingClientRect().height, rest: lastRest || 0 };
            try { bar.setPointerCapture(ev.pointerId); } catch (_e) { /* ignore */ }
            bar.classList.add('dragging');
        });
        bar.addEventListener('pointermove', function (ev) {
            if (!drag || !drag.rest) return;
            var r = clampRatio((drag.top + (ev.clientY - drag.y)) / drag.rest);
            apply(r);
        });
        var end = function () {
            if (!drag) return;
            drag = null;
            bar.classList.remove('dragging');
            saveRatio(curRatio);
        };
        bar.addEventListener('pointerup', end);
        bar.addEventListener('pointercancel', end);
        bar.addEventListener('dblclick', function () { saveRatio(DEFAULT_RATIO); apply(DEFAULT_RATIO); });
        return bar;
    }

    var curRatio = null, lastRest = 0, lastTop = -1;

    function isDesktop() {
        var h = document.documentElement;
        if (h.classList.contains('layout-tablet')) return false;
        // 폰(좁은 화면·손가락만)은 예전 배치
        var coarseOnly = root.matchMedia && root.matchMedia('(pointer: coarse)').matches && !root.matchMedia('(any-pointer: fine)').matches;
        return root.innerWidth >= 1000 && !coarseOnly;
    }

    function off(e) {
        if (e.tab) e.tab.classList.remove('ndt-split-on');
        if (e.tab) { e.tab.style.removeProperty('--ndt-split-top'); e.tab.style.removeProperty('--ndt-split-bottom'); }
        var bar = document.getElementById('ndtSplitBar');
        if (bar) bar.hidden = true;
        if (lastTop !== -1) { lastTop = -1; notifyResize(); }
    }

    // 도면 칸 크기가 바뀌면 app.js의 ResizeObserver(#ndtCanvasContainer)가 캔버스를 다시 맞춘다
    function notifyResize() {}

    function apply(ratio) {
        var e = els();
        if (!e.tab || !e.canvas || !e.results || !e.wrap) return;
        if (!isDesktop() || !e.tab.classList.contains('active')) { off(e); return; }
        curRatio = clampRatio(ratio == null ? (curRatio == null ? readRatio() : curRatio) : ratio);
        var bar = ensureBar(e);
        if (bar) bar.hidden = false;
        var sc = scrollerOf(e.canvas);
        var scTop = (sc === document.scrollingElement || sc === document.documentElement) ? 0 : sc.getBoundingClientRect().top;
        var canvasTopInScroller = e.canvas.getBoundingClientRect().top - scTop + (sc.scrollTop || 0);
        var viewH = (sc === document.scrollingElement || sc === document.documentElement) ? root.innerHeight : sc.clientHeight;
        // 도면 위(툴바 등)는 스크롤해서 넘기지 않고 보이게 두고, 도면 위쪽부터 화면 아래까지를 나눈다
        var avail = viewH - Math.max(0, canvasTopInScroller) - 12;
        var headH = e.head ? e.head.getBoundingClientRect().height + 8 : 0;
        var barH = bar ? 14 : 0;
        var gaps = 18; // 결과표 위 여백·안쪽 여백
        var s = computeSplit(avail - gaps, curRatio, headH, barH);
        if (!s) { off(e); return; }
        lastRest = avail - gaps - headH - barH;
        e.tab.classList.add('ndt-split-on');
        e.tab.style.setProperty('--ndt-split-top', s.top + 'px');
        e.tab.style.setProperty('--ndt-split-bottom', s.bottom + 'px');
        if (s.top !== lastTop) { lastTop = s.top; notifyResize(); }
    }

    var t = null;
    function schedule() { clearTimeout(t); t = setTimeout(function () { apply(); }, 60); }
    root.applyNdtSplitLayout = function () { apply(); };
    root.addEventListener('resize', schedule);
    document.addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest && ev.target.closest('[data-tab]');
        if (b) setTimeout(function () { apply(); }, 120);
    }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule); else schedule();
    // 탭 표시 바뀜(클래스) 감지
    var mo = null;
    function watch() {
        var tab = document.getElementById('tab-ndt');
        if (!tab || mo) return;
        mo = new MutationObserver(function () { schedule(); });
        mo.observe(tab, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})(typeof window !== 'undefined' ? window : globalThis);
