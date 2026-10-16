/**
 * 스캔본 구조도에서 기둥 찾기 — 예시 하나로 같은 모양 모두 찾기(2026-10-16). 순수 계산 모듈(DOM 없음), struct-plan.html 전용.
 *
 * 도면마다 기둥 모양이 다르다(검게·회색으로 칠한 네모, 테두리만 있는 네모, 동그라미…). 그래서 규칙으로 가르지 않고,
 * 사람이 기둥 하나를 네모로 감싸 주면 그림 전체에서 그것과 똑같이 생긴 곳을 찾는다(템플릿 매칭, 정규화 상관).
 * 옆의 이름표 네모(C1 글자를 두른 것)는 안에 글자가 있어 예시와 모양이 달라 걸러진다.
 *
 *  1) 그림을 "잉크 양"(255 − 밝기)으로 바꾼다. 예시가 크면 그림을 줄여(f배) 빠르게.
 *  2) 예시를 그림 위로 한 칸씩 옮기며 닮은 정도(−1~1)를 잰다. 잉크 합이 예시와 크게 다른 자리(빈 종이 등)는 건너뛴다.
 *  3) 기준(threshold) 넘는 자리 중 겹치는 것은 가장 닮은 하나만.
 *  4) 직사각형 예시는 90° 돌린 모양도 찾는다(가로·세로로 놓인 직사각형 기둥).
 *
 * 입력 img: { width, height, data } — canvas getImageData 결과(RGBA). rect: 예시 상자 { x, y, w, h }(그림 픽셀).
 * → [{ x, y, w, h, score }] (그림 픽셀, x·y = 가운데, 크기는 예시와 같음)
 */
(function (root) {
    'use strict';

    /** 그림의 한 부분 → 잉크 양 배열(f배 줄임, 칸 평균) */
    function inkOf(img, x0, y0, w, h, f) {
        var W = img.width, src = img.data;
        var ow = Math.max(1, Math.floor(w / f)), oh = Math.max(1, Math.floor(h / f));
        var d = new Float32Array(ow * oh);
        for (var oy = 0; oy < oh; oy++) {
            for (var ox = 0; ox < ow; ox++) {
                var s = 0, n = 0;
                for (var j = 0; j < f; j++) {
                    var yy = y0 + oy * f + j;
                    if (yy < 0 || yy >= img.height) continue;
                    for (var i = 0; i < f; i++) {
                        var xx = x0 + ox * f + i;
                        if (xx < 0 || xx >= W) continue;
                        var p = (yy * W + xx) * 4;
                        var lum = src[p + 3] < 128 ? 255 : (src[p] * 299 + src[p + 1] * 587 + src[p + 2] * 114) / 1000;
                        s += 255 - lum; n++;
                    }
                }
                d[oy * ow + ox] = n ? s / n : 0;
            }
        }
        return { w: ow, h: oh, d: d };
    }

    function transpose(T) {
        var d = new Float32Array(T.w * T.h);
        for (var y = 0; y < T.h; y++) for (var x = 0; x < T.w; x++) d[x * T.h + y] = T.d[y * T.w + x];
        return { w: T.h, h: T.w, d: d };
    }

    /** 한 예시 모양으로 닮은 자리 찾기 → [{ x, y(왼쪽 위, 줄인 좌표), tw, th, s }] */
    function scan(I, T, thr) {
        var w = I.w, h = I.h, tw = T.w, th = T.h, n = tw * th;
        if (tw > w || th > h || n < 4) return [];
        var mean = 0, k;
        for (k = 0; k < n; k++) mean += T.d[k];
        var tSum = mean; mean /= n;
        var Tz = new Float32Array(n), tn = 0;
        for (k = 0; k < n; k++) { Tz[k] = T.d[k] - mean; tn += Tz[k] * Tz[k]; }
        tn = Math.sqrt(tn);
        if (tn < 1) return [];
        // 합·제곱합 누적표(창 안 잉크 합을 바로 구하려고)
        var W1 = w + 1, S = new Float64Array(W1 * (h + 1)), S2 = new Float64Array(W1 * (h + 1));
        for (var y = 0; y < h; y++) {
            var rs = 0, rs2 = 0;
            for (var x = 0; x < w; x++) {
                var v = I.d[y * w + x];
                rs += v; rs2 += v * v;
                S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + rs;
                S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + rs2;
            }
        }
        var lo = tSum * 0.5, hi = tSum * 1.8, out = [];
        for (var py = 0; py + th <= h; py++) {
            for (var px = 0; px + tw <= w; px++) {
                var a = py * W1 + px, b = a + tw, c = (py + th) * W1 + px, e = c + tw;
                var sum = S[e] - S[b] - S[c] + S[a];
                if (sum < lo || sum > hi) continue;                     // 빈 종이·시커먼 덩어리는 건너뜀
                var vr = (S2[e] - S2[b] - S2[c] + S2[a]) - sum * sum / n;
                if (vr <= 1e-6) continue;
                var cross = 0;
                for (var j = 0; j < th; j++) {
                    var row = (py + j) * w + px, trow = j * tw;
                    for (var i = 0; i < tw; i++) cross += I.d[row + i] * Tz[trow + i];
                }
                var s = cross / (Math.sqrt(vr) * tn);
                if (s >= thr) out.push({ x: px, y: py, tw: tw, th: th, s: s });
            }
        }
        return out;
    }

    function matchColumns(img, rect, opts) {
        var o = opts || {};
        var thr = o.threshold != null ? o.threshold : 0.6;
        var rw = Math.round(rect.w), rh = Math.round(rect.h);
        if (rw < 3 || rh < 3) return [];
        // 예시가 10칸 남짓이 되게 줄인다 — 스캔 얼룩·기둥 둘레의 자잘한 차이가 흐려져 덜 빠진다(실제 스캔본에서 맞춤)
        var f = o.scale || Math.max(1, Math.floor(Math.max(rw, rh) / 10));
        var I = inkOf(img, 0, 0, img.width, img.height, f);
        var T = inkOf(img, Math.round(rect.x), Math.round(rect.y), rw, rh, f);
        var cand = scan(I, T, thr);
        if (Math.max(T.w, T.h) / Math.min(T.w, T.h) >= 1.25) cand = cand.concat(scan(I, transpose(T), thr));
        // 겹치는 자리는 가장 닮은 하나만
        cand.sort(function (p, q) { return q.s - p.s; });
        var kept = [];
        cand.forEach(function (c) {
            var cx = c.x + c.tw / 2, cy = c.y + c.th / 2;
            var near = kept.some(function (k) {
                return Math.abs(k.x + k.tw / 2 - cx) < Math.max(k.tw, c.tw) * 0.6 && Math.abs(k.y + k.th / 2 - cy) < Math.max(k.th, c.th) * 0.6;
            });
            if (!near) kept.push(c);
        });
        return kept.map(function (c) {
            return { x: (c.x + c.tw / 2) * f, y: (c.y + c.th / 2) * f, w: c.tw * f, h: c.th * f, score: Math.round(c.s * 1000) / 1000 };
        });
    }

    // ---------- 통심선 교차점에서 기둥 찾기(2026-10-16) ----------
    // 기둥은 X·Y 통심선이 만나는 곳에 놓인다. 이름표 네모(C1)는 교차점에서 비켜나 있어 애초에 보지 않는다.
    //  1) 통심선: 그림을 길게 가로지르는 가로·세로 선(일점쇄선의 틈은 이어 봄). 열·행마다 가장 긴 잉크 줄을 재서
    //     가장 긴 것의 35% 넘는 곳(이웃 중 가장 긴 곳 하나)만.
    //  2) 교차점마다(두 선이 실제로 지나는 곳만) 둘레를 한 바퀴씩 넓혀 가며 "닫힌 도형"을 찾는다:
    //     네모 테두리(네 변 모두 잉크) 또는 동그라미(여덟 방향 모두 잉크), 바로 바깥은 비어 있음(따로 떨어진 작은 도형).
    //     교차점을 지나는 보 선은 둘레에 2~4점만 닿아 닫힌 도형이 아니다.

    function lumOf(img) {
        var N = img.width * img.height, L = new Uint8Array(N), d = img.data;
        for (var i = 0, p = 0; i < N; i++, p += 4) L[i] = d[p + 3] < 128 ? 255 : (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
        return L;
    }
    /** 한 줄(열 또는 행) 잉크의 가장 긴 구간(틈 gap 이하는 이어 봄) → { len, s, e } */
    function longestRun(L, start, step, count, thr, gap) {
        var best = { len: 0, s: 0, e: 0 }, s = -1, last = -1;
        for (var k = 0; k < count; k++) {
            if (L[start + k * step] < thr) {
                if (s < 0 || k - last > gap + 1) s = k;
                last = k;
                if (last - s + 1 > best.len) best = { len: last - s + 1, s: s, e: last };
            }
        }
        return best;
    }
    /** 통심선 찾기 → { xs:[{ at, s, e }], ys:[…] } */
    function gridLines(L, W, H, o) {
        var thr = o.lineInk || 215, gap = Math.max(4, Math.round(Math.max(W, H) * 0.006));
        var col = [], row = [], x, y;
        for (x = 0; x < W; x++) col.push(longestRun(L, x, W, H, thr, gap));
        for (y = 0; y < H; y++) row.push(longestRun(L, y * W, 1, W, thr, gap));
        var pick = function (runs, sep) {
            var mx = 0;
            runs.forEach(function (r) { if (r.len > mx) mx = r.len; });
            var cand = [];
            runs.forEach(function (r, i) { if (r.len >= mx * (o.lineFrac || 0.35)) cand.push({ at: i, s: r.s, e: r.e, len: r.len }); });
            // 붙어 있는 열(굵은 선·겹선)은 가장 긴 하나만
            cand.sort(function (a, b) { return b.len - a.len; });
            var kept = [];
            cand.forEach(function (c) { if (!kept.some(function (k) { return Math.abs(k.at - c.at) < sep; })) kept.push(c); });
            return kept.sort(function (a, b) { return a.at - b.at; });
        };
        var sep = Math.max(3, Math.round(Math.max(W, H) * 0.004));
        return { xs: pick(col, sep), ys: pick(row, sep) };
    }
    /** (cx,cy) 둘레 반지름 r의 닫힌 정도 → { sq: 네 변 중 가장 덜 찬 변의 잉크 비율, ci: 여덟 방향 중 가장 덜 찬 방향, all: 둘레 전체 } */
    function ringAt(L, W, H, cx, cy, r, thr) {
        var side = [0, 0, 0, 0], sideN = 0, oct = [0, 0, 0, 0, 0, 0, 0, 0], octN = [0, 0, 0, 0, 0, 0, 0, 0], ink = 0, n = 0, t, x, y;
        var at = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && L[y * W + x] < thr; };
        for (t = -r; t <= r; t++) {
            if (at(cx + t, cy - r)) side[0]++;
            if (at(cx + t, cy + r)) side[1]++;
            if (at(cx - r, cy + t)) side[2]++;
            if (at(cx + r, cy + t)) side[3]++;
            sideN++;
        }
        for (y = -r - 1; y <= r + 1; y++) {
            for (x = -r - 1; x <= r + 1; x++) {
                var d = Math.sqrt(x * x + y * y);
                if (d < r - 0.5 || d >= r + 0.5) continue;
                var k = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
                octN[k]++; n++;
                if (at(cx + x, cy + y)) { oct[k]++; ink++; }
            }
        }
        var sq = Math.min.apply(null, side) / sideN;
        var ci = Math.min.apply(null, oct.map(function (v, i) { return octN[i] ? v / octN[i] : 0; }));
        var sqAll = (side[0] + side[1] + side[2] + side[3]) / (4 * sideN);
        return { sq: sq, ci: ci, all: Math.max(sqAll, n ? ink / n : 0) };
    }
    /** 교차점 한 곳의 기둥 → { r, score } 또는 null */
    function columnAt(L, W, H, cx, cy, rMax, thr) {
        var best = null;
        for (var r = 2; r <= rMax; r++) {
            var a = ringAt(L, W, H, cx, cy, r, thr);
            var closed = Math.max(a.sq >= 0.5 ? a.sq : 0, a.ci >= 0.4 ? a.ci : 0);
            if (!closed) continue;
            // 바로 바깥(r+2, r+3)은 비어야 따로 떨어진 기둥(벽·보 덩어리 속이 아님)
            var o1 = ringAt(L, W, H, cx, cy, r + 2, thr).all, o2 = ringAt(L, W, H, cx, cy, r + 3, thr).all;
            var out = Math.max(o1, o2);
            if (out > 0.35 || out > a.all * 0.6) continue;
            // 바깥이 빈 닫힌 둘레 중 가장 큰 것 = 기둥 겉모서리
            best = { r: r, score: closed - out };
        }
        return best;
    }
    /**
     * 통심선 교차점의 기둥 → { columns:[{ x, y, w, h, score }], xs, ys } (그림 픽셀). 기둥 크기는 찾은 것의 중간값으로 같게.
     */
    function gridColumns(img, opts) {
        var o = opts || {};
        var W = img.width, H = img.height, L = lumOf(img);
        var thr = o.colInk || 170;
        var g = gridLines(L, W, H, o);
        var rMax = o.rMax || Math.max(6, Math.round(Math.min(W, H) * 0.015));
        var found = [];
        g.xs.forEach(function (vx) {
            g.ys.forEach(function (hy) {
                // 모든 교차점을 본다(선이 그 자리를 지나는지는 따지지 않음 — 가장 긴 구간이 다른 데 있을 수 있다).
                // 선 두께·기둥 짝수 크기·스캔 기울기만큼 둘레 3칸 안에서 가장 잘 맞는 가운데
                var best = null;
                for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
                    var c = columnAt(L, W, H, vx.at + dx, hy.at + dy, rMax, thr);
                    if (c && (!best || c.score > best.score)) best = { x: vx.at + dx, y: hy.at + dy, r: c.r, score: c.score };
                }
                if (best) found.push(best);
            });
        });
        // 통심선 옆 보 선·겹선도 긴 선으로 잡혀 한 기둥이 이웃 교차점에서 여러 번 나온다 → 가장 잘 맞는 하나만
        found.sort(function (a, b) { return b.score - a.score; });
        var uniq = [];
        found.forEach(function (f) {
            if (!uniq.some(function (k) { return Math.abs(k.x - f.x) <= Math.max(k.r, f.r) + 2 && Math.abs(k.y - f.y) <= Math.max(k.r, f.r) + 2; })) uniq.push(f);
        });
        found = uniq;
        var rs = found.map(function (f) { return f.r; }).sort(function (a, b) { return a - b; });
        var rm = rs.length ? rs[Math.floor(rs.length / 2)] : 0, side = 2 * rm + 1;
        return {
            columns: found.map(function (f) { return { x: f.x + 0.5, y: f.y + 0.5, w: side, h: side, score: Math.round(f.score * 1000) / 1000 }; }),
            xs: g.xs.map(function (l) { return l.at; }), ys: g.ys.map(function (l) { return l.at; })
        };
    }

    var api = { matchColumns: matchColumns, inkOf: inkOf, gridColumns: gridColumns, gridLines: gridLines };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structRaster = api; }
})(typeof window !== 'undefined' ? window : null);
