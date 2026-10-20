/**
 * 한글(HWPX) 3종 상태조사표 행 높이 — 2026-10-19
 *  - 기본: 한 쪽에 15행 + 1행쯤 남도록(본문 높이 ÷ 16) 행을 키운다.
 *  - 16·17행이 찬 쪽은 그 쪽에 다 들어가게 행을 줄인다.
 *  - 줄이 많아 키워야 하는 행(need)은 그 높이를 지키고 나머지 행을 줄여 쪽을 넘지 않게 한다.
 * 순수 함수 — app.js와 테스트가 같이 쓴다. 단위 HWPUNIT(1/7200 inch).
 */
(function (root) {
    'use strict';

    var BASE_ROWS = 15;
    var SPARE_ROWS = 1;
    var SAFETY = 400;     // 테두리·반올림 여유
    var MIN_ROW_H = 1600; // 8pt 한 줄 + 여백보다 작게는 줄이지 않는다
    var FONT_HEIGHT = 800; // 8pt
    // 2026-10-20 표 위 「N) 층」 제목 한 줄(12pt 1200 + 줄 간격 1440). 기본 행 높이는 모든 쪽이 이 기준으로 같다
    // — 첫 쪽에 다른 글이 더 있거나 제목이 없는 다음 쪽이어도 행 높이가 쪽마다 달라지지 않게(넘칠 때만 줄임)
    var STD_RESERVE_H = 2640;

    function int(v, d) { var n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; }

    /** 표 행이 쓸 수 있는 높이 */
    function rowsArea(o) {
        return int(o.bodyH, 0) - int(o.reserveH, 0) - int(o.headerH, 0) - int(o.tableMarginV, 0) - int(o.safety, SAFETY);
    }

    /**
     * @param {{bodyH:number, reserveH:number, headerH:number, tableMarginV:number, needs:number[],
     *          baseRows?:number, spareRows?:number, safety?:number, minRowH?:number, defaultAreaH?:number}} o
     *   reserveH = 이 쪽에서 표 위에 오는 글(층 제목 등) 높이
     *   defaultAreaH = 기본 행 높이를 정할 때 쓸 행 영역(없으면 이 쪽 영역)
     * @returns {{area:number, defaultH:number, rowH:number, heights:number[], total:number, fits:boolean}}
     */
    function planRows(o) {
        o = o || {};
        var needs = (o.needs || []).map(function (v) { return Math.max(0, int(v, 0)); });
        var area = rowsArea(o);
        var per = int(o.baseRows, BASE_ROWS) + int(o.spareRows, SPARE_ROWS);
        var minH = int(o.minRowH, MIN_ROW_H);
        var defArea = o.defaultAreaH != null ? int(o.defaultAreaH, area)
            : (o.stdReserveH != null ? rowsArea({ bodyH: o.bodyH, reserveH: o.stdReserveH, headerH: o.headerH, tableMarginV: o.tableMarginV, safety: o.safety }) : area);
        var defaultH = Math.max(minH, Math.floor(defArea / Math.max(1, per)));
        var totalAt = function (h) {
            return needs.reduce(function (s, nd) { return s + Math.max(nd, h); }, 0);
        };
        var h = defaultH;
        if (totalAt(h) > area) {
            var lo = minH, hi = defaultH;
            if (totalAt(lo) > area) {
                h = lo;
            } else {
                while (lo < hi) {
                    var mid = Math.ceil((lo + hi) / 2);
                    if (totalAt(mid) <= area) lo = mid; else hi = mid - 1;
                }
                h = lo;
            }
        }
        var heights = needs.map(function (nd) { return Math.max(nd, h); });
        var total = heights.reduce(function (s, v) { return s + v; }, 0);
        return { area: area, defaultH: defaultH, rowH: h, heights: heights, total: total, fits: total <= area };
    }

    /** 줄 수 → 그 행에 필요한 높이(한글 칸 여백 포함) */
    function lineNeed(lines, vertsize, spacing, marginV) {
        var L = Math.max(1, int(lines, 1));
        var vs = Math.max(1, int(vertsize, FONT_HEIGHT));
        return int(marginV, 0) + vs + (L - 1) * (vs + int(spacing, 0)) + Math.round(vs * 0.2);
    }

    /** 문단 하나의 높이(줄 배치 정보 linesegs: [{vertpos, vertsize, spacing}]) */
    function paraHeight(segs) {
        if (!segs || !segs.length) return 0;
        var first = segs[0], last = segs[segs.length - 1];
        return int(last.vertpos, 0) - int(first.vertpos, 0) + int(last.vertsize, 0) + int(last.spacing, 0);
    }

    /** 본문 높이 = 쪽 높이 − 위·아래·머리말·꼬리말 여백 */
    function bodyHeight(page) {
        page = page || {};
        return int(page.height, 83340) - int(page.top, 5669) - int(page.bottom, 4252) - int(page.header, 4331) - int(page.footer, 4252);
    }

    var api = {
        BASE_ROWS: BASE_ROWS, SPARE_ROWS: SPARE_ROWS, SAFETY: SAFETY, MIN_ROW_H: MIN_ROW_H, FONT_HEIGHT: FONT_HEIGHT, STD_RESERVE_H: STD_RESERVE_H,
        rowsArea: rowsArea, planRows: planRows, lineNeed: lineNeed, paraHeight: paraHeight, bodyHeight: bodyHeight
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxSurveyRowFit = api;
})(typeof window !== 'undefined' ? window : globalThis);
