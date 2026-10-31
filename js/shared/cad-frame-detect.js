/**
 * 2026-10-31 캐드 핀 기준점 자동 찾기 — 도면 가장 바깥 사각형(테두리)의 모서리.
 * 사용자는 캐드에서 늘 테두리 좌상단·우하단(또는 두 대각 모서리)에 기준점을 찍는다.
 * 도면 그림(래스터)에서 가로·세로로 길게 이어진 어두운 선을 찾아 가장 바깥 선 네 개로 사각형을 만든다.
 * 결과는 제안일 뿐 — 앱은 화면에 표시하고 사용자가 확인/직접 찍기를 고른다.
 */
(function (root) {
    'use strict';

    /** 한 줄(길이 n, get(i)=어두움)에서 가장 긴 어두운 구간. gap 이하 끊김은 이어 본다 */
    function longestRun(n, get, gap) {
        let best = 0, bestS = -1, bestE = -1, s = -1, lastDark = -1;
        for (let i = 0; i < n; i++) {
            if (get(i)) {
                if (s < 0 || i - lastDark > gap + 1) s = i;
                lastDark = i;
                const len = i - s + 1;
                if (len > best) { best = len; bestS = s; bestE = i; }
            }
        }
        return { len: best, s: bestS, e: bestE };
    }

    /**
     * gray: Uint8Array(w*h) 밝기(0=검정), w,h.
     * o: { dark(기본 128), minFrac(선이 그림 폭·높이의 몇 배 이상, 기본 0.5), gap(끊김 허용 px, 기본 2), minAreaFrac(기본 0.2) }
     * 반환: null 또는 { left, top, right, bottom, tl:{x,y}, br:{x,y}, tr, bl, confidence(0~1), lines:{h,v} }
     */
    function detectOuterFrame(gray, w, h, o) {
        const x = o || {};
        const dark = x.dark == null ? 128 : x.dark;
        const minFrac = x.minFrac || 0.5;
        const gap = x.gap == null ? 2 : x.gap;
        const minAreaFrac = x.minAreaFrac || 0.2;
        if (!gray || !(w > 8) || !(h > 8)) return null;
        const isDark = (px, py) => gray[py * w + px] < dark;
        const rows = [];
        for (let py = 0; py < h; py++) {
            const r = longestRun(w, (i) => isDark(i, py), gap);
            if (r.len >= w * minFrac) rows.push({ y: py, s: r.s, e: r.e, len: r.len });
        }
        const cols = [];
        for (let px = 0; px < w; px++) {
            const r = longestRun(h, (i) => isDark(px, i), gap);
            if (r.len >= h * minFrac) cols.push({ x: px, s: r.s, e: r.e, len: r.len });
        }
        if (rows.length < 2 || cols.length < 2) return null;
        const top = rows[0], bottom = rows[rows.length - 1];
        const left = cols[0], right = cols[cols.length - 1];
        const W = right.x - left.x, H = bottom.y - top.y;
        if (W <= 0 || H <= 0 || W * H < w * h * minAreaFrac) return null;
        // 네 선이 서로 맞물리는지(가로선 끝 ≈ 세로선 위치, 세로선 끝 ≈ 가로선 위치)
        const tol = Math.max(4, Math.round(Math.min(w, h) * 0.02));
        const near = (a, b) => Math.abs(a - b) <= tol;
        let score = 0;
        [top, bottom].forEach((r) => { if (near(r.s, left.x)) score++; if (near(r.e, right.x)) score++; });
        [left, right].forEach((c) => { if (near(c.s, top.y)) score++; if (near(c.e, bottom.y)) score++; });
        const confidence = score / 8;
        if (confidence < 0.5) return null;
        const pt = (px, py) => ({ x: px, y: py });
        return {
            left: left.x, top: top.y, right: right.x, bottom: bottom.y,
            tl: pt(left.x, top.y), br: pt(right.x, bottom.y), tr: pt(right.x, top.y), bl: pt(left.x, bottom.y),
            confidence, lines: { h: rows.length, v: cols.length }
        };
    }

    /** RGBA(ImageData.data) → 밝기. 투명은 흰색으로 */
    function toGray(rgba, w, h) {
        const g = new Uint8Array(w * h);
        for (let i = 0, j = 0; i < g.length; i++, j += 4) {
            const a = rgba[j + 3] / 255;
            const l = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
            g[i] = Math.round(l * a + 255 * (1 - a));
        }
        return g;
    }

    /**
     * 캐드 기준점 두 개(캐드 좌표, y 위쪽 +)를 테두리 모서리에 짝지음.
     * 캐드에서 x가 작은 점 → 왼쪽, y가 큰 점 → 위쪽 모서리. 반환 [앱 점1, 앱 점2] (그림 좌표, y 아래쪽 +)
     */
    function matchCadRefsToFrame(frame, cadP1, cadP2) {
        if (!frame || !cadP1 || !cadP2) return null;
        const p1Left = Number(cadP1.x) <= Number(cadP2.x);
        const p1Top = Number(cadP1.y) >= Number(cadP2.y);
        const pick = (isLeft, isTop) => ({ x: isLeft ? frame.left : frame.right, y: isTop ? frame.top : frame.bottom });
        return [pick(p1Left, p1Top), pick(!p1Left, !p1Top)];
    }

    const api = { detectOuterFrame, toGray, matchCadRefsToFrame, longestRun };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.shared = root.BSA.shared || {}; root.BSA.shared.cadFrameDetect = api; }
})(typeof window !== 'undefined' ? window : globalThis);
