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
        const tol = Math.max(4, Math.round(Math.min(w, h) * 0.02));
        const near = (a, b) => Math.abs(a - b) <= tol;
        const minArea = w * h * minAreaFrac;
        const pt = (px, py) => ({ x: px, y: py });
        const build = (left, top, right, bottom, score) => ({
            left: left, top: top, right: right, bottom: bottom,
            tl: pt(left, top), br: pt(right, bottom), tr: pt(right, top), bl: pt(left, bottom),
            confidence: score / 8, lines: { h: rows.length, v: cols.length }
        });

        // (가) 가장 바깥 가로선 둘·세로선 둘. 네 선이 서로 맞물리는지(가로선 끝 ≈ 세로선 위치, 세로선 끝 ≈ 가로선 위치)
        let outer = null;
        {
            const top = rows[0], bottom = rows[rows.length - 1];
            const left = cols[0], right = cols[cols.length - 1];
            const W = right.x - left.x, H = bottom.y - top.y;
            if (W > 0 && H > 0 && W * H >= minArea) {
                let score = 0;
                [top, bottom].forEach((r) => { if (near(r.s, left.x)) score++; if (near(r.e, right.x)) score++; });
                [left, right].forEach((c) => { if (near(c.s, top.y)) score++; if (near(c.e, bottom.y)) score++; });
                if (score / 8 >= 0.5) outer = build(left.x, top.y, right.x, bottom.y, score);
            }
        }
        // 네 모서리가 모두 깔끔하면 그대로(예전과 같은 결과)
        if (outer && outer.confidence >= 0.875) return outer;

        // (나) 2026-11-03 바깥에 다른 긴 선(표제란·바깥 여백선 등)이 있으면 (가)는 우하단 같은 한쪽이 틀어진다 →
        // 가로·세로 선 후보에서 네 변이 실제로 이어진 사각형만 골라 그중 가장 큰 것
        const band = (list, key) => {
            const out = [];
            list.forEach((it) => {
                const last = out[out.length - 1];
                if (last && it[key] - last.hi <= 1) { last.hi = it[key]; last.s = Math.min(last.s, it.s); last.e = Math.max(last.e, it.e); }
                else out.push({ lo: it[key], hi: it[key], s: it.s, e: it.e });
            });
            return out;
        };
        const hb = band(rows, 'y'), vb = band(cols, 'x');
        const K = 6;
        const tops = hb.slice(0, K), bottoms = hb.slice(-K);
        const lefts = vb.slice(0, K), rights = vb.slice(-K);
        let best = null, bestArea = 0, bestScore = 0;
        tops.forEach((t) => bottoms.forEach((b) => lefts.forEach((l) => rights.forEach((r) => {
            const x0 = l.lo, x1 = r.hi, y0 = t.lo, y1 = b.hi;
            if (!(x1 > x0 && y1 > y0)) return;
            const area = (x1 - x0) * (y1 - y0);
            if (area < minArea) return;
            // 네 변을 모두 덮는 선만(바깥으로 삐져나온 건 허용)
            if (t.s > l.hi + tol || t.e < r.lo - tol || b.s > l.hi + tol || b.e < r.lo - tol) return;
            if (l.s > t.hi + tol || l.e < b.lo - tol || r.s > t.hi + tol || r.e < b.lo - tol) return;
            let score = 0;
            [t, b].forEach((q) => { if (near(q.s, x0)) score++; if (near(q.e, x1)) score++; });
            [l, r].forEach((q) => { if (near(q.s, y0)) score++; if (near(q.e, y1)) score++; });
            if (score < 6) return;
            // 모서리가 더 깔끔한 쪽 먼저, 같으면 더 큰(바깥) 사각형
            if (score < bestScore || (score === bestScore && area <= bestArea)) return;
            best = build(x0, y0, x1, y1, score); bestArea = area; bestScore = score;
        }))));
        if (best) return best;
        return outer;
    }

    /** 어두운 쪽으로 r칸 번지게(3x3 최솟값, 분리형) — 축소로 흐려진 가는 선을 살린다 */
    function darkenMin(gray, w, h, r) {
        const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let m = 255;
                for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = gray[y * w + k]; if (v < m) m = v; }
                tmp[y * w + x] = m;
            }
        }
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                let m = 255;
                for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]; if (v < m) m = v; }
                out[y * w + x] = m;
            }
        }
        return out;
    }

    /**
     * 2026-11-03 테두리가 연하거나 가늘거나(축소하면 흐려짐) 끊겨 있어도 찾도록, 엄격한 기준부터 차례로 풀며 시도.
     * 먼저 성공한 결과를 쓴다(엄격할수록 오인식이 적음). 번지게 한 단계는 바깥 가장자리를 되돌려 맞춘다.
     */
    function detectOuterFrameRobust(gray, w, h) {
        const passes = [
            { dark: 128, gap: 2, minFrac: 0.5, grow: 0 },
            { dark: 190, gap: 4, minFrac: 0.5, grow: 1 },
            { dark: 225, gap: 8, minFrac: 0.4, grow: 1 },
            { dark: 235, gap: 12, minFrac: 0.3, grow: 2 }
        ];
        // 바깥 테두리가 연하고 안쪽 건물 외곽선이 진하면 엄격한 기준은 안쪽 박스를 테두리로 잘못 잡는다 →
        // 모든 단계를 돌려 가장 큰(가장 바깥) 사각형을 쓴다. 넓이가 비슷하면(1% 이내) 더 엄격한 단계를 우선.
        // 바탕이 연한 회색인 도면이면 종이 전체가 「어두운 선」으로 잡히지 않게, 바탕 밝기보다 확실히 어두운 것만 선으로 본다
        const hist = new Uint32Array(256);
        for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
        let acc = 0, bg = 255;
        for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= gray.length / 2) { bg = v; break; } }
        let best = null, bestArea = 0;
        for (let i = 0; i < passes.length; i++) {
            const p = Object.assign({}, passes[i], { dark: Math.min(passes[i].dark, bg - 20) });
            const g = p.grow ? darkenMin(gray, w, h, p.grow) : gray;
            const f = detectOuterFrame(g, w, h, p);
            if (!f) continue;
            if (p.grow) {
                f.left += p.grow; f.top += p.grow; f.right -= p.grow; f.bottom -= p.grow;
                f.tl = { x: f.left, y: f.top }; f.br = { x: f.right, y: f.bottom };
                f.tr = { x: f.right, y: f.top }; f.bl = { x: f.left, y: f.bottom };
            }
            f.pass = i;
            const area = (f.right - f.left) * (f.bottom - f.top);
            if (!best || area > bestArea * 1.01) { best = f; bestArea = area; }
        }
        return best;
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

    const api = { detectOuterFrame, detectOuterFrameRobust, darkenMin, toGray, matchCadRefsToFrame, longestRun };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.shared = root.BSA.shared || {}; root.BSA.shared.cadFrameDetect = api; }
})(typeof window !== 'undefined' ? window : globalThis);
