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

    var api = { matchColumns: matchColumns, inkOf: inkOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structRaster = api; }
})(typeof window !== 'undefined' ? window : null);
