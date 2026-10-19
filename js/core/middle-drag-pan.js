/* 2026-10-19 PC 휠 클릭(가운데 버튼) 끌기로 넘치는 칸 보기 — 통계 탭 표·상태조사표 사진 앨범
   사용자: 「잘리면 드래그 사용해서 볼 수 있게 해주고 억지로 찌그러트리지는 말고」
   PC 왼쪽 클릭은 언제나 선택·끌어 선택이라 건드리지 않는다. 휠 클릭 끌기 + 휠 + 스크롤바로 본다.
   손가락(터치)은 원래대로 브라우저 스크롤(touch-action: pan-x pan-y). */
(function (root) {
    'use strict';

    var TARGETS = '#tab-stats, #photoAlbumGrid, #tab-survey .survey-album-panel';

    function canScroll(style, axis) {
        var v = axis === 'x' ? style.overflowX : style.overflowY;
        return v === 'auto' || v === 'scroll';
    }

    /** el부터 위로 올라가며 가로·세로로 실제 넘치는(스크롤 가능한) 칸을 각각 찾는다. stopAt(포함)에서 멈춤 */
    function findScrollers(el, getStyle, stopAt) {
        var out = { x: null, y: null };
        var cur = el;
        while (cur && cur.nodeType === 1) {
            var st = getStyle(cur);
            if (!out.x && canScroll(st, 'x') && cur.scrollWidth > cur.clientWidth + 1) out.x = cur;
            if (!out.y && canScroll(st, 'y') && cur.scrollHeight > cur.clientHeight + 1) out.y = cur;
            if ((out.x && out.y) || cur === stopAt) break;
            cur = cur.parentElement;
        }
        return out;
    }

    /** 끌기 이동량 → 새 스크롤 위치(손잡이 끌듯: 마우스를 왼쪽으로 끌면 내용이 왼쪽으로 = 오른쪽을 보게) */
    function nextScroll(start, delta, max) {
        var v = start - delta;
        if (v < 0) v = 0;
        if (max != null && v > max) v = max;
        return v;
    }

    function install(doc) {
        if (!doc || doc.__bsaMiddlePan) return;
        doc.__bsaMiddlePan = true;
        var win = doc.defaultView || root;
        var drag = null;
        function getStyle(el) { return win.getComputedStyle(el); }

        doc.addEventListener('mousedown', function (e) {
            if (e.button !== 1) return; // 왼쪽(0)·오른쪽(2)은 그대로
            var t = e.target && e.target.closest ? e.target.closest(TARGETS) : null;
            if (!t) return;
            var page = doc.scrollingElement || doc.documentElement;
            var s = findScrollers(e.target, getStyle, null);
            if (!s.y && page.scrollHeight > page.clientHeight + 1) s.y = page;
            if (!s.x && !s.y) return;
            e.preventDefault(); // 브라우저 자동 스크롤(휠 클릭 화살표) 대신 끌기
            drag = {
                x0: e.clientX, y0: e.clientY, sx: s.x, sy: s.y,
                left: s.x ? s.x.scrollLeft : 0, top: s.y ? s.y.scrollTop : 0
            };
            doc.documentElement.classList.add('bsa-middle-panning');
        }, true);

        doc.addEventListener('mousemove', function (e) {
            if (!drag) return;
            if (!(e.buttons & 4)) { end(); return; }
            if (drag.sx) drag.sx.scrollLeft = nextScroll(drag.left, e.clientX - drag.x0, drag.sx.scrollWidth - drag.sx.clientWidth);
            if (drag.sy) drag.sy.scrollTop = nextScroll(drag.top, e.clientY - drag.y0, drag.sy.scrollHeight - drag.sy.clientHeight);
            e.preventDefault();
        }, true);

        function end() {
            if (!drag) return;
            drag = null;
            doc.documentElement.classList.remove('bsa-middle-panning');
        }
        doc.addEventListener('mouseup', function (e) { if (e.button === 1) end(); }, true);
        win.addEventListener('blur', end);
        // 휠 클릭을 놓을 때 링크가 새 탭으로 열리지 않게(끌기를 시작한 경우만)
        doc.addEventListener('auxclick', function (e) {
            if (e.button === 1 && e.target && e.target.closest && e.target.closest(TARGETS)) e.preventDefault();
        }, true);
    }

    var api = { TARGETS: TARGETS, findScrollers: findScrollers, nextScroll: nextScroll, install: install };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) {
        root.BsaMiddleDragPan = api;
        install(root.document);
    }
})(typeof window !== 'undefined' ? window : null);
