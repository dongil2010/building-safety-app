/**
 * 구조도 부재 기호 찾기(2026-10-14) — 순수 계산 모듈 (DOM 없음, struct-plan.html 전용)
 *
 * 캐드에서 뽑은 구조평면도 PDF는 글자가 글꼴이 아니라 선(획)으로 그려져 있어 글자 데이터에 부재 기호가 없다.
 * 그래서 선 데이터에서 "기호 테두리(알약·네모/마름모·타원) 안에 글자 획이 든 것"을 찾고,
 * 획 모양을 글자 본(template)과 견줘 종류 글자를 읽는다: C=기둥, W=벽, G=거더, B=빔, S=슬래브.
 * (사용자 규칙: 부재명에 G가 들면 거더, B가 들면 빔 — 번호 바로 앞 글자가 종류 글자다. fB1B는 빔.)
 *
 * 입력 경로: { pts:[[x,y]…], lines, curves, closed } — 쪽 화면 좌표(pdf.js viewport scale 1).
 *   pts 는 moveTo/lineTo 점과 곡선의 끝점. 곡선 제어점은 버린다.
 * 글자 본은 부르는 쪽(브라우저)이 시스템 글꼴로 만들어 넘긴다: { 글자: [비트맵…] }, 비트맵 = 길이 N*N 의 0~1 배열.
 * 결과는 초안이다 — 화면에서 사람이 종류를 바꾸거나 뺀다.
 */
(function (root) {
    'use strict';

    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var LETTER_TYPE = { C: '기둥', W: '벽', G: '거더', B: '빔', S: '슬래브' };
    var TYPE_LETTERS = Object.keys(LETTER_TYPE);
    var DIGITS = '0123456789'.split('');
    var N = 16;

    function bboxOf(pts) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (p[0] < x0) x0 = p[0];
            if (p[0] > x1) x1 = p[0];
            if (p[1] < y0) y0 = p[1];
            if (p[1] > y1) y1 = p[1];
        }
        return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0 };
    }

    /** 경로마다 테두리 상자(x0…h)를 붙인다. 점이 없는 경로는 버린다. */
    function prepare(paths) {
        var out = [];
        (paths || []).forEach(function (p) {
            if (!p || !p.pts || !p.pts.length) return;
            var b = bboxOf(p.pts);
            if (!Number.isFinite(b.w) || !Number.isFinite(b.h)) return;
            out.push({ pts: p.pts, lines: p.lines | 0, curves: p.curves | 0, closed: !!p.closed,
                x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.w, h: b.h });
        });
        return out;
    }

    function near(a, b, t) { return Math.abs(a - b) <= t; }

    function firstLastClose(p, tol) {
        var a = p.pts[0], b = p.pts[p.pts.length - 1];
        return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
    }

    /**
     * 기호 테두리 후보: 알약(마주 보는 반원 두 개), 네모·마름모(선 네 개로 닫힌 것), 타원·원(곡선 네 개).
     * page: { w, h }. 크기 기준은 쪽 대각선에 대한 비율(도면 축척이 달라도 통하게).
     * → [{ shape:'pill'|'box'|'oval', x0,y0,x1,y1, own:[경로…] }]
     */
    function findEnclosures(paths, page) {
        var unit = Math.hypot(page.w, page.h) / 1000;
        var minL = 3 * unit, maxL = 42 * unit;
        var out = [];

        // 1) 알약: 반원(곡선만 1~3개, 짧은 쪽/긴 쪽 ≈ 1/2). 긴 쪽 = 알약 두께.
        var caps = paths.filter(function (p) {
            if (p.lines !== 0 || p.curves < 1 || p.curves > 3) return false;
            var L = Math.max(p.w, p.h), S = Math.min(p.w, p.h);
            return L >= minL && L <= maxL / 2 && S / L > 0.38 && S / L < 0.62;
        });
        var endMean = function (p, k) { return (p.pts[0][k] + p.pts[p.pts.length - 1][k]) / 2; };
        // 가로 알약: 세로로 긴 반원. 끝점이 오른쪽에 있으면 왼쪽 뚜껑.
        var tall = caps.filter(function (p) { return p.h > p.w; });
        var leftCaps = tall.filter(function (p) { return endMean(p, 0) > (p.x0 + p.x1) / 2; });
        var rightCaps = tall.filter(function (p) { return endMean(p, 0) <= (p.x0 + p.x1) / 2; });
        var usedR = {};
        leftCaps.forEach(function (a) {
            var best = -1, bd = Infinity;
            rightCaps.forEach(function (b, j) {
                if (usedR[j]) return;
                if (!near(a.y0, b.y0, a.h * 0.12) || !near(a.h, b.h, a.h * 0.08)) return;
                var d = b.x1 - a.x0;
                if (b.x0 < a.x1 - a.w * 0.2 || d > a.h * 8) return;
                if (d < bd) { bd = d; best = j; }
            });
            if (best < 0) return;
            usedR[best] = true;
            var b = rightCaps[best];
            out.push({ shape: 'pill', x0: a.x0, y0: Math.min(a.y0, b.y0), x1: b.x1, y1: Math.max(a.y1, b.y1), own: [a, b] });
        });
        // 세로 알약: 가로로 긴 반원. 끝점이 아래쪽에 있으면 위 뚜껑.
        var wide = caps.filter(function (p) { return p.w > p.h; });
        var topCaps = wide.filter(function (p) { return endMean(p, 1) > (p.y0 + p.y1) / 2; });
        var botCaps = wide.filter(function (p) { return endMean(p, 1) <= (p.y0 + p.y1) / 2; });
        var usedB = {};
        topCaps.forEach(function (a) {
            var best = -1, bd = Infinity;
            botCaps.forEach(function (b, j) {
                if (usedB[j]) return;
                if (!near(a.x0, b.x0, a.w * 0.12) || !near(a.w, b.w, a.w * 0.08)) return;
                var d = b.y1 - a.y0;
                if (b.y0 < a.y1 - a.h * 0.2 || d > a.w * 8) return;
                if (d < bd) { bd = d; best = j; }
            });
            if (best < 0) return;
            usedB[best] = true;
            var b = botCaps[best];
            out.push({ shape: 'pill', x0: Math.min(a.x0, b.x0), y0: a.y0, x1: Math.max(a.x1, b.x1), y1: b.y1, own: [a, b] });
        });

        // 2) 네모·마름모: 곡선 없이 꼭짓점 넷으로 닫힌 경로
        // 3) 타원·원: 곡선 넷으로 닫힌 경로
        paths.forEach(function (p) {
            var L = Math.max(p.w, p.h), S = Math.min(p.w, p.h);
            if (L < minL || L > maxL || S / L < 0.4) return;
            var tol = L * 0.03;
            var loop = p.closed || firstLastClose(p, tol);
            if (!loop) return;
            var n = p.pts.length - (firstLastClose(p, tol) ? 1 : 0);
            if (p.curves === 0 && n === 4) out.push({ shape: 'box', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, own: [p] });
            else if (p.lines === 0 && p.curves === 4) out.push({ shape: 'oval', x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, own: [p] });
        });

        // 같은 자리에 두 번 그려진 테두리는 하나로
        var seen = {};
        return out.filter(function (e) {
            var k = e.shape + '|' + [e.x0, e.y0, e.x1, e.y1].map(function (v) { return Math.round(v / (unit * 0.5)); }).join(',');
            if (seen[k]) return false;
            seen[k] = true;
            return true;
        });
    }

    /** 경로를 칸에 담아 두고, 상자 안에 든 경로만 빨리 찾는다 */
    function makeIndex(paths, cell) {
        var map = {};
        paths.forEach(function (p) {
            var k = Math.floor(((p.x0 + p.x1) / 2) / cell) + ',' + Math.floor(((p.y0 + p.y1) / 2) / cell);
            (map[k] = map[k] || []).push(p);
        });
        return function (x0, y0, x1, y1) {
            var res = [];
            for (var i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
                for (var j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
                    var list = map[i + ',' + j];
                    if (!list) continue;
                    for (var k = 0; k < list.length; k++) {
                        var p = list[k];
                        if (p.x0 >= x0 && p.x1 <= x1 && p.y0 >= y0 && p.y1 <= y1) res.push(p);
                    }
                }
            }
            return res;
        };
    }

    /**
     * 테두리 안의 글자 획을 읽는 방향 좌표(u = 글 진행, v = 위→아래)로 바꿔 글자 단위로 묶는다.
     * horiz=false 면 글자가 왼쪽으로 90° 누운 것으로 본다(아래에서 위로 읽음). 안 주면 테두리가 가로로 길 때 가로.
     * → [{ u0,u1,v0,v1, strokes:[[[u,v]…]…] }] (왼쪽 글자부터)
     */
    function charsIn(enc, inside, horizOpt) {
        var W = enc.x1 - enc.x0, H = enc.y1 - enc.y0;
        var horiz = horizOpt == null ? W >= H : !!horizOpt;
        var short = Math.min(W, H), edge = short * 0.06;
        var onEdge = function (pt) {
            return pt[0] - enc.x0 < edge || enc.x1 - pt[0] < edge || pt[1] - enc.y0 < edge || enc.y1 - pt[1] < edge;
        };
        var strokes = [];
        inside.forEach(function (p) {
            if (enc.own.indexOf(p) >= 0) return;
            if (Math.max(p.w, p.h) > short * 0.95) return;                       // 테두리 옆선·가로지르는 선
            if (p.pts.length === 2 && onEdge(p.pts[0]) && onEdge(p.pts[1])) return; // 알약의 곧은 옆선
            var pts = p.pts.map(function (q) {
                return horiz ? [q[0] - enc.x0, q[1] - enc.y0] : [enc.y1 - q[1], q[0] - enc.x0];
            });
            var b = bboxOf(pts);
            strokes.push({ pts: pts, u0: b.x0, u1: b.x1, v0: b.y0, v1: b.y1 });
        });
        if (!strokes.length) return [];
        var vTop = Math.min.apply(null, strokes.map(function (s) { return s.v0; }));
        var vBot = Math.max.apply(null, strokes.map(function (s) { return s.v1; }));
        var lineH = vBot - vTop;
        if (!(lineH > 0)) return [];
        strokes = strokes.filter(function (s) { return Math.max(s.u1 - s.u0, s.v1 - s.v0) >= lineH * 0.12; }); // 점·먼지
        strokes.sort(function (a, b) { return a.u0 - b.u0; });
        var chars = [];
        strokes.forEach(function (s) {
            var last = chars[chars.length - 1];
            if (last && s.u0 < last.u1 - lineH * 0.06) {
                last.strokes.push(s.pts);
                last.u1 = Math.max(last.u1, s.u1);
                last.v0 = Math.min(last.v0, s.v0);
                last.v1 = Math.max(last.v1, s.v1);
            } else {
                chars.push({ u0: s.u0, u1: s.u1, v0: s.v0, v1: s.v1, strokes: [s.pts] });
            }
        });
        return chars;
    }

    /** 같은 글꼴의 같은 글자는 획이 똑같다 — 획 좌표를 거칠게 반올림한 열쇠 */
    function glyphKey(ch, unit) {
        return ch.strokes.map(function (s) {
            return s.map(function (p) { return Math.round((p[0] - ch.u0) / unit * 4) + ',' + Math.round((p[1] - ch.v0) / unit * 4); }).join(' ');
        }).join('|');
    }

    /** 글자 획을 N×N 칸 그림으로(가로세로 비율 유지, 가운데 맞춤). 값 0~1. */
    function rasterStrokes(strokes) {
        var all = [];
        strokes.forEach(function (s) { s.forEach(function (p) { all.push(p); }); });
        var b = bboxOf(all);
        var size = Math.max(b.w, b.h) || 1;
        var k = (N - 2) / size;
        var ox = (N - 1 - b.w * k) / 2 - b.x0 * k;
        var oy = (N - 1 - b.h * k) / 2 - b.y0 * k;
        var bmp = new Array(N * N).fill(0);
        var R = 1.0;   // 칸 사이를 지나는 곧은 획도 양쪽 칸에 0.5로 남는다
        var splat = function (x, y) {
            for (var j = Math.max(0, Math.floor(y - R)); j <= Math.min(N - 1, Math.ceil(y + R)); j++) {
                for (var i = Math.max(0, Math.floor(x - R)); i <= Math.min(N - 1, Math.ceil(x + R)); i++) {
                    var v = 1 - Math.hypot(i - x, j - y) / R;
                    if (v > bmp[j * N + i]) bmp[j * N + i] = v;
                }
            }
        };
        strokes.forEach(function (s) {
            if (s.length === 1) splat(s[0][0] * k + ox, s[0][1] * k + oy);
            for (var i = 1; i < s.length; i++) {
                var ax = s[i - 1][0] * k + ox, ay = s[i - 1][1] * k + oy, bx = s[i][0] * k + ox, by = s[i][1] * k + oy;
                var steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.3));
                for (var t = 0; t <= steps; t++) splat(ax + (bx - ax) * t / steps, ay + (by - ay) * t / steps);
            }
        });
        return bmp;
    }

    function inkOf(bmp) {
        if (bmp._ink) return bmp._ink;
        var ink = [];
        for (var i = 0; i < bmp.length; i++) if (bmp[i] > 0.3) ink.push([i % N, Math.floor(i / N)]);
        bmp._ink = ink;
        return ink;
    }
    function meanNearest(a, b) {
        var sum = 0;
        for (var i = 0; i < a.length; i++) {
            var best = Infinity;
            for (var j = 0; j < b.length; j++) {
                var d = Math.abs(a[i][0] - b[j][0]) + Math.abs(a[i][1] - b[j][1]);
                if (d < best) { best = d; if (!d) break; }
            }
            sum += Math.min(best, N / 2);
        }
        return sum / a.length;
    }
    /**
     * 두 칸 그림이 얼마나 닮았는지 0~1 — 한쪽 획의 칸에서 다른 쪽 획까지의 평균 거리(양쪽 다)로 잰다.
     * 겹치는 넓이로 재면 선 글꼴(가는 획)과 시스템 글꼴(굵은 획)의 굵기 차이 때문에 G·B·C가 잘 안 갈린다.
     */
    function scoreBitmaps(a, b) {
        var ia = inkOf(a), ib = inkOf(b);
        if (!ia.length || !ib.length) return 0;
        var d = (meanNearest(ia, ib) + meanNearest(ib, ia)) / 2;
        return Math.max(0, 1 - d / (N * 0.14));
    }

    /** 글자 하나의 본별 점수 { 글자: 점수 } (본이 여러 장이면 가장 높은 것) */
    function scoreChar(bmp, templates) {
        var out = {};
        Object.keys(templates).forEach(function (ch) {
            var best = 0;
            templates[ch].forEach(function (t) { var s = scoreBitmaps(bmp, t); if (s > best) best = s; });
            out[ch] = best;
        });
        return out;
    }

    function bestOf(scores, letters) {
        var b = null, bs = -1;
        letters.forEach(function (ch) { var s = scores[ch] || 0; if (s > bs) { bs = s; b = ch; } });
        return { ch: b, score: bs };
    }

    /**
     * 글자 점수 줄을 「머리글 0~2자 + 종류 글자(C/W/G/B/S) + 번호 1~3자 + 꼬리 0~1자」로 읽는다.
     * 종류 글자·번호 자리는 그 글자의 1등 본이 각각 종류 글자·숫자여야 하고 점수가 minScore 이상이어야 한다
     * (같은 글꼴의 본이면 0.9를 넘는다 — 모르는 글꼴은 틀리게 읽느니 못 읽은 것으로 둔다).
     * heights(글자 높이 / 줄에서 가장 큰 글자 높이)가 있으면 종류 글자는 대문자 높이여야 한다 — 머리글 소문자 w(wG1)를 W(벽)로 읽지 않게.
     * → { letter, type, label, score } 또는 null
     */
    function parseLabel(charScores, opts) {
        var o = opts || {};
        var minScore = o.minScore == null ? 0.78 : o.minScore;
        var heights = o.heights || null;
        var n = charScores.length;
        if (n < 2 || n > 7) return null;
        var all = charScores.map(function (sc) { return bestOf(sc, Object.keys(sc)); });
        var best = null;
        for (var p = 0; p <= 2 && p < n - 1; p++) {
            if (heights && heights[p] < 0.85) continue;
            var t = bestOf(charScores[p], TYPE_LETTERS);
            if (t.score < minScore || t.score < all[p].score - 1e-9) continue;
            for (var d = 1; d <= 3; d++) {
                var rest = n - (p + 1 + d);
                if (rest < 0 || rest > 1) continue;
                var ok = true, dsum = 0, digits = '';
                for (var i = p + 1; i <= p + d; i++) {
                    var dg = bestOf(charScores[i], DIGITS);
                    if (dg.score < minScore || dg.score < all[i].score - 1e-9) { ok = false; break; }
                    dsum += dg.score;
                    digits += dg.ch;
                }
                if (!ok) continue;
                var total = t.score * 1.5 + dsum / d + d * 0.01;
                if (!best || total > best.score) {
                    var label = '';
                    for (var q = 0; q < p; q++) label += all[q].score >= minScore ? all[q].ch : '?';
                    label += t.ch + digits;
                    if (rest === 1) label += all[n - 1].score >= minScore ? all[n - 1].ch : '?';
                    best = { letter: t.ch, type: LETTER_TYPE[t.ch], label: label, score: total };
                }
            }
        }
        return best;
    }

    /** 내장 글자 획(struct-glyphs.js: { 글꼴: { 글자: 획 } })을 칸 그림 본으로 → { 글자: [비트맵…] } */
    function templatesFromStrokes(sets) {
        var out = {};
        Object.keys(sets || {}).forEach(function (font) {
            Object.keys(sets[font]).forEach(function (ch) {
                (out[ch] = out[ch] || []).push(rasterStrokes(sets[font][ch]));
            });
        });
        return out;
    }

    /** 진짜 글자(글꼴)로 들어 있는 기호: 번호 바로 앞 글자가 종류 글자 */
    function parseText(str) {
        var s = String(str == null ? '' : str).replace(/\s+/g, '');
        var m = /^([A-Za-z0-9]{0,2})([CWGBS])(\d{1,3})([A-Za-z]?)$/.exec(s);
        if (!m) return null;
        return { letter: m[2], type: LETTER_TYPE[m[2]], label: s, score: 3 };
    }

    /**
     * 부재 기호 찾기.
     * input: { paths, page:{w,h}, texts?:[{str,x,y}], templates:{글자:[비트맵]} }
     * → { members:[{ id, type, letter, label, shape, x, y, w, h, score }], unread:[{shape,x,y,w,h}] }
     *   x,y = 기호 가운데(쪽 좌표). unread = 테두리 안에 글자 획은 있는데 부재 기호로 못 읽은 것.
     */
    function detect(input) {
        var paths = prepare(input.paths);
        var page = input.page;
        var unit = Math.hypot(page.w, page.h) / 1000;
        var templates = input.templates || {};
        var encs = findEnclosures(paths, page);
        var query = makeIndex(paths, 42 * unit);
        var texts = input.texts || [];
        var members = [], unread = [], usedText = {};
        var cache = {};
        var scoreOf = function (ch) {
            var key = glyphKey(ch, unit);
            if (!cache[key]) cache[key] = scoreChar(rasterStrokes(ch.strokes), templates);
            return cache[key];
        };
        encs.forEach(function (e) {
            var pad = Math.min(e.x1 - e.x0, e.y1 - e.y0) * 0.02;
            var rec = { shape: e.shape, x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2, w: e.x1 - e.x0, h: e.y1 - e.y0 };
            var parsed = null;
            texts.forEach(function (t, i) {
                if (parsed || usedText[i]) return;
                if (t.x < e.x0 || t.x > e.x1 || t.y < e.y0 || t.y > e.y1) return;
                var r = parseText(t.str);
                if (r) { parsed = r; usedText[i] = true; }
            });
            if (!parsed) {
                // 가로로 긴 테두리는 가로 글, 세로로 긴 테두리는 누운 글부터. 정사각형에 가까우면(네모 기둥 기호) 둘 다 해 본다.
                var W = e.x1 - e.x0, H = e.y1 - e.y0;
                var tries = W >= H * 1.25 ? [true] : (H >= W * 1.25 ? [false, true] : [true, false]);
                var inside = query(e.x0 - pad, e.y0 - pad, e.x1 + pad, e.y1 + pad);
                var firstChars = null;
                for (var ti = 0; ti < tries.length && !parsed; ti++) {
                    var chars = charsIn(e, inside, tries[ti]);
                    if (!chars.length) continue;
                    if (!firstChars) firstChars = chars;
                    var scores = chars.map(scoreOf);
                    var lineH = Math.max.apply(null, chars.map(function (c) { return c.v1 - c.v0; }));
                    parsed = parseLabel(scores, { heights: chars.map(function (c) { return (c.v1 - c.v0) / lineH; }) });
                    if (parsed && input.debug) rec.chars = chars;
                }
                if (!firstChars) return;
                if (!parsed) {
                    // 글자를 다 읽었는데 부재 기호가 아닌 것(통심 번호 X1·Y2, 계단 ST1 …)은 못 읽은 것이 아니다 — 버린다.
                    // 알약은 보 기호일 가능성이 높아 남긴다(획이 겹쳐 못 읽은 것을 사람이 넣을 수 있게).
                    var allRead = firstChars.map(scoreOf).every(function (sc) { return bestOf(sc, Object.keys(sc)).score >= 0.78; });
                    if (e.shape === 'pill' || (firstChars.length >= 2 && !allRead)) {
                        rec.chars = firstChars;
                        if (input.debug) {
                            rec.dbg = firstChars.map(scoreOf).map(function (sc) {
                                return Object.keys(sc).sort(function (p, q) { return sc[q] - sc[p]; }).slice(0, 2)
                                    .map(function (ch) { return ch + sc[ch].toFixed(2); }).join(' ');
                            });
                        }
                        unread.push(rec);
                    }
                    return;
                }
            }
            rec.type = parsed.type; rec.letter = parsed.letter; rec.label = parsed.label; rec.score = parsed.score;
            members.push(rec);
        });
        // 테두리 없이 글자만 있는 기호(글꼴로 들어 있는 PDF)
        texts.forEach(function (t, i) {
            if (usedText[i]) return;
            var r = parseText(t.str);
            if (!r) return;
            members.push({ shape: 'text', x: t.x, y: t.y, w: (t.w || 8 * unit), h: (t.h || 4 * unit),
                type: r.type, letter: r.letter, label: r.label, score: r.score });
        });
        // 한 테두리가 다른 테두리 안에 통째로 든 경우(네모 안 타원 등)는 점수 높은 쪽만
        members.sort(function (a, b) { return b.score - a.score; });
        var kept = [];
        members.forEach(function (m) {
            var dup = kept.some(function (k) {
                return Math.abs(k.x - m.x) < Math.min(k.w, m.w) * 0.4 && Math.abs(k.y - m.y) < Math.min(k.h, m.h) * 0.4;
            });
            if (!dup) kept.push(m);
        });
        kept.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
        kept.forEach(function (m, i) { m.id = 'sm_' + (i + 1); });
        return { members: kept, unread: unread };
    }

    function countsByType(members) {
        var out = {};
        TYPES.forEach(function (t) { out[t] = 0; });
        (members || []).forEach(function (m) { if (m && !m.excluded && out[m.type] != null) out[m.type]++; });
        return out;
    }

    /** 기호 글자별 묶음: [{ label, type, count }] (많은 것부터) */
    function labelGroups(members) {
        var map = {};
        (members || []).forEach(function (m) {
            if (!m || m.excluded) return;
            var g = map[m.label] = map[m.label] || { label: m.label, type: m.type, count: 0 };
            g.count++;
        });
        return Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b) { return TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.label.localeCompare(b.label); });
    }

    var api = { TYPES: TYPES, LETTER_TYPE: LETTER_TYPE, N: N, prepare: prepare, findEnclosures: findEnclosures, charsIn: charsIn,
        rasterStrokes: rasterStrokes, glyphKey: glyphKey, scoreBitmaps: scoreBitmaps, scoreChar: scoreChar, parseLabel: parseLabel, templatesFromStrokes: templatesFromStrokes, parseText: parseText,
        detect: detect, countsByType: countsByType, labelGroups: labelGroups };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structMarks = api; }
})(typeof window !== 'undefined' ? window : null);
