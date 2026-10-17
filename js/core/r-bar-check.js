/**
 * 2026-10-17 강도 R값 0↔8 바로잡기 — 측정지 각 줄 옆 막대그래프 길이로 확인.
 * 도트프린터 글씨는 0과 8이 비슷해 OCR(Gemini)이 40을 48로, 38을 30으로 읽는 일이 있다.
 * 막대 길이는 값에 비례하므로, 20줄의 (막대 길이 → 값) 관계를 직선으로 맞추고(틀린 줄 몇 개에 안 끌려가게 Theil–Sen),
 * 0·8이 들어간 값이 직선에서 크게 벗어나는데 0↔8을 바꾼 값이 직선에 맞으면 그것으로 바꾼다.
 * 막대 길이를 못 받았거나 줄이 적으면(5줄 미만) 아무것도 안 바꾼다. 브라우저(window.BsaRBarCheck)·node(require) 둘 다.
 */
(function (root) {
    'use strict';

    var MIN_POINTS = 5;
    var V_MIN = 10, V_MAX = 80;

    function median(a) {
        var s = a.slice().sort(function (x, y) { return x - y; });
        var n = s.length;
        if (!n) return NaN;
        return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    }
    function ok(n) { return typeof n === 'number' && Number.isFinite(n); }

    /** 점들 [{ x: 막대, y: 값 }] → 값 = a + b·막대 (Theil–Sen: 기울기 = 두 점씩 기울기의 중간값) */
    function fitLine(pts) {
        var slopes = [];
        for (var i = 0; i < pts.length; i++) {
            for (var j = i + 1; j < pts.length; j++) {
                var dx = pts[j].x - pts[i].x;
                if (Math.abs(dx) > 1e-9) slopes.push((pts[j].y - pts[i].y) / dx);
            }
        }
        if (!slopes.length) return null;
        var b = median(slopes);
        var a = median(pts.map(function (p) { return p.y - b * p.x; }));
        return { a: a, b: b };
    }

    /** v의 0·8 자리를 서로 바꾼 값들(자기 자신 빼고, 10~80 안) */
    function swapCandidates(v) {
        var s = String(v), out = [];
        var pos = [];
        for (var i = 0; i < s.length; i++) if (s[i] === '0' || s[i] === '8') pos.push(i);
        for (var mask = 1; mask < (1 << pos.length); mask++) {
            var c = s.split('');
            pos.forEach(function (p, k) { if (mask & (1 << k)) c[p] = c[p] === '0' ? '8' : '0'; });
            var n = parseInt(c.join(''), 10);
            if (n >= V_MIN && n <= V_MAX && n !== v && out.indexOf(n) < 0) out.push(n);
        }
        return out;
    }

    /**
     * values: 길이 20 배열(못 읽은 자리 null), bars: 같은 자리 막대 길이(아무 단위, 못 읽으면 null).
     * → { values(바로잡은 사본), fixes:[{ idx, from, to }], fit:{a,b}|null, tol }
     */
    function correctZeroEight(values, bars) {
        var vals = (values || []).slice();
        var res = { values: vals, fixes: [], fit: null, tol: 0 };
        var pts = [];
        vals.forEach(function (v, i) {
            var bar = bars ? bars[i] : null;
            if (ok(v) && ok(bar) && bar > 0) pts.push({ x: bar, y: v, i: i });
        });
        if (pts.length < MIN_POINTS) return res;
        var fit = fitLine(pts);
        if (!fit || !(fit.b > 0)) return res;          // 막대가 값과 같이 늘지 않으면 막대 정보를 못 믿음
        res.fit = fit;
        var pred = function (bar) { return fit.a + fit.b * bar; };
        // 허용 오차: 줄마다 벗어난 정도의 중간값 ×3 (막대 읽기 오차) — 0↔8을 바꾸면 최소 8 차이라 3 이상, 6 이하로
        var mad = median(pts.map(function (p) { return Math.abs(p.y - pred(p.x)); }));
        var tol = Math.min(6, Math.max(3, mad * 3));
        res.tol = tol;
        pts.forEach(function (p) {
            var v = p.y, e = Math.abs(v - pred(p.x));
            if (e <= tol) return;
            var best = null, be = Infinity;
            swapCandidates(v).forEach(function (c) {
                var ce = Math.abs(c - pred(p.x));
                if (ce < be) { be = ce; best = c; }
            });
            if (best != null && be <= tol && be < e) {
                vals[p.i] = best;
                res.fixes.push({ idx: p.i, from: v, to: best });
            }
        });
        return res;
    }

    var api = { correctZeroEight: correctZeroEight, swapCandidates: swapCandidates, fitLine: fitLine };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.BsaRBarCheck = api;
})(typeof window !== 'undefined' ? window : null);
