/**
 * 도면 편집기 — DXF 층 벡터 저장(2026-11-24)
 * DXF로 올린 층은 그림이 아니라 캐드 선 자료(벡터 PDF 안 /BSADxf 스트림, js/core/dxf-view.js 모델)로 고친다.
 *  - 편집기 개체(js/shared/drawing-editor.js drawObj)를 「기록용 가짜 캔버스」(createRecorder)로 그려 선·채움·글자·지우기 영역을 얻는다.
 *    흰색으로 칠한 곳(지우개·영역 지우기·문 아래 벽 뚫기·창문 안쪽 …) = 지우기 영역(볼록 다각형).
 *  - 지우기 영역은 그 앞에 있던 선(원래 캐드 선 + 먼저 그린 개체)을 잘라낸다(Cyrus-Beck). 채움·글자는 가운데가 영역 안이면 뺀다.
 *  - 결과를 「펼친 DXF」(dxf-read.js flattenDxf 모양, 캐드 실좌표)로 돌려준다 → dxf-to-pdf.js convertFlatToPdf(옛 fit 그대로).
 * 좌표: 편집기 = 도면 그림 픽셀(refW×refH, 마킹과 같은 기준). PDF 점 = (x·pageW/refW, pageH − y·pageH/refH). 캐드 = 점/s + ox.
 */
(function (root) {
    'use strict';

    var CAP_RATIO = 0.72; // dxf-to-pdf.js와 같다

    // ───────── 기하 ─────────

    function polyArea(pts) {
        var a = 0;
        for (var i = 0, n = pts.length; i < n; i++) {
            var p = pts[i], q = pts[(i + 1) % n];
            a += p[0] * q[1] - q[0] * p[1];
        }
        return a / 2;
    }

    /** 볼록 다각형 → 변마다 바깥 법선 */
    function makeConvex(pts) {
        var clean = [];
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i], last = clean[clean.length - 1];
            if (!last || Math.abs(p[0] - last[0]) > 1e-9 || Math.abs(p[1] - last[1]) > 1e-9) clean.push([p[0], p[1]]);
        }
        if (clean.length > 1) {
            var f = clean[0], l = clean[clean.length - 1];
            if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) clean.pop();
        }
        if (clean.length < 3) return null;
        var area = polyArea(clean);
        if (Math.abs(area) < 1e-12) return null;
        var sgn = area > 0 ? 1 : -1; // 반시계(양)면 바깥 법선 = (dy, -dx)
        var edges = [];
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var k = 0; k < clean.length; k++) {
            var a = clean[k], b = clean[(k + 1) % clean.length];
            var dx = b[0] - a[0], dy = b[1] - a[1];
            edges.push({ px: a[0], py: a[1], nx: sgn * dy, ny: -sgn * dx });
            if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0];
            if (a[1] < y0) y0 = a[1]; if (a[1] > y1) y1 = a[1];
        }
        return { pts: clean, edges: edges, bbox: [x0, y0, x1, y1] };
    }

    /** 선분 P0→P1 중 볼록 다각형 안에 든 구간 [t0, t1] | null */
    function segInside(poly, x0, y0, x1, y1) {
        var tE = 0, tL = 1, dx = x1 - x0, dy = y1 - y0;
        var E = poly.edges;
        for (var i = 0; i < E.length; i++) {
            var e = E[i];
            var N = e.nx * (x0 - e.px) + e.ny * (y0 - e.py);
            var D = e.nx * dx + e.ny * dy;
            if (Math.abs(D) < 1e-15) { if (N > 0) return null; continue; }
            var t = -N / D;
            if (D > 0) { if (t < tL) tL = t; } else if (t > tE) tE = t;
            if (tE >= tL) return null;
        }
        return [tE, tL];
    }

    function pointInConvex(poly, x, y) {
        var E = poly.edges;
        for (var i = 0; i < E.length; i++) {
            if (E[i].nx * (x - E[i].px) + E[i].ny * (y - E[i].py) > 1e-9) return false;
        }
        return true;
    }

    function bboxOverlap(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }

    /** 선분을 두께 r로 감싼 볼록 다각형(양 끝 반원은 6조각) */
    function capsule(ax, ay, bx, by, r) {
        var dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
        var pts = [];
        var k, ang, steps = 6;
        if (L < 1e-9) {
            for (k = 0; k < 12; k++) { ang = (k / 12) * Math.PI * 2; pts.push([ax + Math.cos(ang) * r, ay + Math.sin(ang) * r]); }
            return makeConvex(pts);
        }
        var base = Math.atan2(dy, dx);
        for (k = 0; k <= steps; k++) { ang = base - Math.PI / 2 + (k / steps) * Math.PI; pts.push([bx + Math.cos(ang) * r, by + Math.sin(ang) * r]); }
        for (k = 0; k <= steps; k++) { ang = base + Math.PI / 2 + (k / steps) * Math.PI; pts.push([ax + Math.cos(ang) * r, ay + Math.sin(ang) * r]); }
        return makeConvex(pts);
    }

    /**
     * 폴리선(평평한 배열 [x,y,…])에서 다각형들 안 구간을 빼고 남은 조각들(평평한 배열 목록).
     * 하나도 안 잘리면 null(그대로 둠).
     */
    function cutPolyline(flatPts, closed, polys) {
        var n = flatPts.length / 2;
        if (n < 2) return null;
        var segCount = closed ? n : n - 1;
        var out = [], cur = null, touched = false;
        for (var s = 0; s < segCount; s++) {
            var i0 = s, i1 = (s + 1) % n;
            var x0 = flatPts[i0 * 2], y0 = flatPts[i0 * 2 + 1], x1 = flatPts[i1 * 2], y1 = flatPts[i1 * 2 + 1];
            var sb = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
            var ivs = [];
            for (var k = 0; k < polys.length; k++) {
                if (!bboxOverlap(sb, polys[k].bbox)) continue;
                var iv = segInside(polys[k], x0, y0, x1, y1);
                if (iv && iv[1] - iv[0] > 1e-9) ivs.push(iv);
            }
            if (!ivs.length) {
                if (!cur) { cur = [x0, y0]; }
                cur.push(x1, y1);
                continue;
            }
            touched = true;
            ivs.sort(function (a, b) { return a[0] - b[0]; });
            // 겹치는 구간 합치기 → 남는 구간
            var keep = [], t = 0;
            for (var j = 0; j < ivs.length; j++) {
                if (ivs[j][0] > t) keep.push([t, ivs[j][0]]);
                if (ivs[j][1] > t) t = ivs[j][1];
            }
            if (t < 1) keep.push([t, 1]);
            var dx = x1 - x0, dy = y1 - y0;
            var reachedEnd = false;
            for (var q = 0; q < keep.length; q++) {
                var a = keep[q][0], b = keep[q][1];
                if (b - a < 1e-6) continue;
                var ax = x0 + dx * a, ay = y0 + dy * a, bx = x0 + dx * b, by = y0 + dy * b;
                if (a <= 1e-9 && cur) cur.push(bx, by);
                else {
                    if (cur && cur.length >= 4) out.push(cur);
                    cur = [ax, ay, bx, by];
                }
                if (b < 1 - 1e-9) { out.push(cur); cur = null; } else reachedEnd = true;
            }
            if (!reachedEnd) { if (cur && cur.length >= 4) out.push(cur); cur = null; }
        }
        if (!touched) return null;
        if (cur && cur.length >= 4) out.push(cur);
        // 닫힌 폴리선: 마지막 조각이 첫 조각에 이어지면 붙인다
        if (closed && out.length > 1) {
            var first = out[0], lastP = out[out.length - 1];
            if (Math.abs(first[0] - lastP[lastP.length - 2]) < 1e-9 && Math.abs(first[1] - lastP[lastP.length - 1]) < 1e-9
                && Math.abs(first[0] - flatPts[0]) < 1e-9 && Math.abs(first[1] - flatPts[1]) < 1e-9) {
                out[0] = lastP.concat(first.slice(2));
                out.pop();
            }
        }
        return out;
    }

    // ───────── 기록용 캔버스 ─────────

    function isWhite(style) {
        var s = String(style || '').replace(/\s+/g, '').toLowerCase();
        return s === '#fff' || s === '#ffffff' || s === 'white' || s === 'rgb(255,255,255)';
    }

    /**
     * 캔버스 2D 흉내(편집기 drawObj가 쓰는 만큼). 처음 변환 base = [a,b,c,d,e,f](그림 픽셀 → PDF 점).
     * events: { type:'line', pts, closed, w } | { type:'fill', pts } | { type:'erase', polys } | { type:'text', x, y, size, rot, text }
     * (좌표·굵기·크기는 모두 PDF 점)
     */
    function createRecorder(base) {
        var events = [];
        var M = base.slice();
        var st = {
            lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif',
            textAlign: 'start', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter', clips: []
        };
        var stack = [];
        var path = [], sub = null;
        function tp(x, y) { return [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]; }
        function scaleK() { return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; }
        function mul(a, b, c, d, e, f) {
            M = [M[0] * a + M[2] * b, M[1] * a + M[3] * b, M[0] * c + M[2] * d, M[1] * c + M[3] * d,
                M[0] * e + M[2] * f + M[4], M[1] * e + M[3] * f + M[5]];
        }
        function addPt(x, y) {
            if (!sub) { sub = { pts: [], closed: false }; path.push(sub); }
            sub.pts.push(tp(x, y));
        }
        function arcPts(cx, cy, rx, ry, rot, a0, a1, ccw) {
            var sweep = a1 - a0;
            if (!ccw && sweep < 0) sweep += Math.PI * 2 * Math.ceil(-sweep / (Math.PI * 2));
            if (ccw && sweep > 0) sweep -= Math.PI * 2 * Math.ceil(sweep / (Math.PI * 2));
            if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
            var steps = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
            var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
            for (var i = 0; i <= steps; i++) {
                var t = a0 + (sweep * i) / steps;
                var ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
                addPt(cx + ex * cr - ey * sr, cy + ex * sr + ey * cr);
            }
        }
        function flatOf(pts) { var a = []; for (var i = 0; i < pts.length; i++) a.push(pts[i][0], pts[i][1]); return a; }
        /** 지금 잘림 영역(여러 볼록 다각형의 교집합) 안 조각만 */
        function clipToCurrent(flatPts, closed) {
            if (!st.clips.length) return [{ pts: flatPts, closed: closed }];
            var n = flatPts.length / 2, segN = closed ? n : n - 1, out = [], cur = null;
            for (var s = 0; s < segN; s++) {
                var i1 = (s + 1) % n;
                var x0 = flatPts[s * 2], y0 = flatPts[s * 2 + 1], x1 = flatPts[i1 * 2], y1 = flatPts[i1 * 2 + 1];
                var tE = 0, tL = 1, ok = true;
                for (var c = 0; c < st.clips.length && ok; c++) {
                    for (var k = 0; k < st.clips[c].length && ok; k++) {
                        var iv = segInside(st.clips[c][k], x0, y0, x1, y1);
                        if (!iv) { ok = false; break; }
                        if (iv[0] > tE) tE = iv[0];
                        if (iv[1] < tL) tL = iv[1];
                    }
                }
                if (!ok || tL - tE < 1e-9) { if (cur) { out.push({ pts: cur, closed: false }); cur = null; } continue; }
                var dx = x1 - x0, dy = y1 - y0;
                var ax = x0 + dx * tE, ay = y0 + dy * tE, bx = x0 + dx * tL, by = y0 + dy * tL;
                if (cur && tE < 1e-9) cur.push(bx, by);
                else { if (cur) out.push({ pts: cur, closed: false }); cur = [ax, ay, bx, by]; }
                if (tL < 1 - 1e-9) { out.push({ pts: cur, closed: false }); cur = null; }
            }
            if (cur) out.push({ pts: cur, closed: false });
            if (out.length === 1 && closed && out[0].pts.length / 2 === n + 1) return [{ pts: flatPts, closed: true }];
            return out;
        }
        function convexOfPath() {
            var list = [];
            path.forEach(function (sp) { if (sp.pts.length >= 3) { var cv = makeConvex(sp.pts); if (cv) list.push(cv); } });
            return list;
        }
        var ctx = {
            canvas: null,
            setLineDash: function () {}, getLineDash: function () { return []; },
            save: function () { stack.push({ M: M.slice(), st: Object.assign({}, st, { clips: st.clips.slice() }) }); },
            restore: function () { var s = stack.pop(); if (s) { M = s.M; st = s.st; } },
            translate: function (x, y) { mul(1, 0, 0, 1, x, y); },
            scale: function (x, y) { mul(x, 0, 0, y, 0, 0); },
            rotate: function (a) { var c = Math.cos(a), s = Math.sin(a); mul(c, s, -s, c, 0, 0); },
            beginPath: function () { path = []; sub = null; },
            moveTo: function (x, y) { sub = { pts: [], closed: false }; path.push(sub); sub.pts.push(tp(x, y)); },
            lineTo: function (x, y) { addPt(x, y); },
            closePath: function () { if (sub) { sub.closed = true; var f = sub.pts[0]; sub = { pts: [f], closed: false }; path.push(sub); } },
            rect: function (x, y, w, h) {
                sub = { pts: [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)], closed: true };
                path.push(sub);
                sub = { pts: [tp(x, y)], closed: false }; path.push(sub);
            },
            arc: function (cx, cy, r, a0, a1, ccw) { arcPts(cx, cy, r, r, 0, a0, a1, ccw); },
            ellipse: function (cx, cy, rx, ry, rot, a0, a1, ccw) { arcPts(cx, cy, rx, ry, rot, a0, a1, ccw); },
            stroke: function () {
                var w = st.lineWidth * scaleK();
                var white = isWhite(st.strokeStyle);
                path.forEach(function (sp) {
                    if (sp.pts.length < 1) return;
                    if (white) {
                        var polys = [];
                        var pts = sp.pts.slice();
                        if (sp.closed) pts.push(pts[0]);
                        if (pts.length === 1) polys.push(capsule(pts[0][0], pts[0][1], pts[0][0], pts[0][1], w / 2));
                        for (var i = 0; i + 1 < pts.length; i++) polys.push(capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w / 2));
                        events.push({ type: 'erase', polys: polys.filter(Boolean) });
                        return;
                    }
                    if (sp.pts.length < 2) return;
                    clipToCurrent(flatOf(sp.pts), sp.closed).forEach(function (piece) {
                        if (piece.pts.length >= 4) events.push({ type: 'line', pts: piece.pts, closed: piece.closed, w: w });
                    });
                });
            },
            fill: function () {
                var white = isWhite(st.fillStyle);
                path.forEach(function (sp) {
                    if (sp.pts.length < 3) return;
                    if (white) {
                        var cv = makeConvex(sp.pts);
                        if (cv) events.push({ type: 'erase', polys: [cv] });
                    } else {
                        events.push({ type: 'fill', pts: flatOf(sp.pts) });
                    }
                });
            },
            clip: function () { var list = convexOfPath(); if (list.length) st.clips.push(list); },
            fillRect: function (x, y, w, h) { var p = path, s2 = sub; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill(); path = p; sub = s2; },
            strokeRect: function (x, y, w, h) { var p = path, s2 = sub; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke(); path = p; sub = s2; },
            clearRect: function () {},
            fillText: function (text, x, y) {
                var m = /(\d+(?:\.\d+)?)px/.exec(st.font || '');
                var px = m ? parseFloat(m[1]) : 10;
                var p = tp(x, y);
                // 글자 방향(점 공간, y 위쪽) → 반시계 각도
                var rot = Math.atan2(M[1], M[0]) * 180 / Math.PI;
                events.push({ type: 'text', x: p[0], y: p[1], size: px * scaleK(), rot: rot, text: String(text) });
            },
            strokeText: function () {},
            measureText: function (t) { var m = /(\d+(?:\.\d+)?)px/.exec(st.font || ''); return { width: String(t).length * (m ? parseFloat(m[1]) : 10) * 0.6 }; },
            drawImage: function () {}
        };
        ['lineWidth', 'fillStyle', 'strokeStyle', 'font', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin'].forEach(function (k) {
            Object.defineProperty(ctx, k, { get: function () { return st[k]; }, set: function (v) { st[k] = v; } });
        });
        ['imageSmoothingEnabled', 'imageSmoothingQuality', 'globalAlpha'].forEach(function (k) { ctx[k] = null; });
        return { ctx: ctx, events: events };
    }

    /** 그림 픽셀 → PDF 점 변환(캔버스 행렬) */
    function pxToPtMatrix(refW, refH, pageW, pageH) {
        var sx = pageW / refW, sy = pageH / refH;
        return [sx, 0, 0, -sy, 0, pageH];
    }

    // ───────── 모델 + 개체 → 펼친 DXF ─────────

    /** 글자 대략 상자 가운데(점) — 지우기 판정용 */
    function textCenter(t) {
        var x = t[0], y = t[1], h = t[2], rot = (t[3] || 0) * Math.PI / 180, ha = t[4] | 0, va = t[5] | 0, str = String(t[6] || '');
        var w = 0;
        for (var i = 0; i < str.length; i++) w += str.charCodeAt(i) > 255 ? h * 1.35 : h * 0.8;
        var dx = ha === 1 ? 0 : (ha === 2 ? -w / 2 : w / 2);
        var dy = va === 2 ? 0 : (va === 3 ? -h / 2 : h / 2);
        var c = Math.cos(rot), s = Math.sin(rot);
        return [x + dx * c - dy * s, y + dx * s + dy * c];
    }

    function polyCentroid(flatPts) {
        var n = flatPts.length / 2, sx = 0, sy = 0;
        for (var i = 0; i < n; i++) { sx += flatPts[i * 2]; sy += flatPts[i * 2 + 1]; }
        return [sx / n, sy / n];
    }

    /**
     * model: dxf-view 모델(PDF 점) · meta: { s, ox, oy, pageW, pageH } · events: createRecorder 결과(PDF 점)
     * opts.baseLwPt: 편집기 기본 선 굵기를 PDF 점으로 바꾼 값(이 굵기 그린 선 = 캐드 기본 선)
     * 반환: { flat, stats }
     */
    function buildEditedFlat(model, meta, events, opts) {
        opts = opts || {};
        var lw = model.lw > 0 ? model.lw : 0.15;
        var baseLwPt = opts.baseLwPt > 0 ? opts.baseLwPt : lw;
        var s = meta.s, ox = meta.ox, oy = meta.oy;
        var stats = { cutLines: 0, removedFills: 0, removedTexts: 0, addedLines: 0, addedFills: 0, addedTexts: 0 };

        // 선: 원래 캐드 선은 번호로만 들고 있다가 잘릴 때만 배열로 꺼낸다
        var lines = [];
        var fills = [];
        var p;
        for (p = 0; p < model.n; p++) {
            if (model.flags[p] & 2) fills.push({ i: p, group: model.group[p] });
            else if (model.count[p] >= 2) lines.push({ i: p });
        }
        function linePts(L) {
            if (L.pts) return L.pts;
            var st = model.start[L.i] * 2, cnt = model.count[L.i];
            return Array.prototype.slice.call(model.coords.subarray(st, st + cnt * 2));
        }
        function lineBbox(L) {
            if (L.i != null && !L.pts) {
                var b = model.bbox;
                return [b[L.i * 4], b[L.i * 4 + 1], b[L.i * 4 + 2], b[L.i * 4 + 3]];
            }
            var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, a = L.pts;
            for (var k = 0; k < a.length; k += 2) {
                if (a[k] < x0) x0 = a[k]; if (a[k] > x1) x1 = a[k];
                if (a[k + 1] < y0) y0 = a[k + 1]; if (a[k + 1] > y1) y1 = a[k + 1];
            }
            return [x0, y0, x1, y1];
        }
        function lineClosed(L) { return L.pts ? !!L.closed : !!(model.flags[L.i] & 1); }
        function lineWidthPt(L) { return L.pts ? L.w : model.width[L.i]; }
        var texts = (model.texts || []).map(function (t) { return { t: t }; });
        var groupSeq = 1e7;

        events.forEach(function (ev) {
            if (ev.type === 'erase') {
                var polys = ev.polys;
                if (!polys.length) return;
                var eb = [Infinity, Infinity, -Infinity, -Infinity];
                polys.forEach(function (pg) {
                    eb[0] = Math.min(eb[0], pg.bbox[0]); eb[1] = Math.min(eb[1], pg.bbox[1]);
                    eb[2] = Math.max(eb[2], pg.bbox[2]); eb[3] = Math.max(eb[3], pg.bbox[3]);
                });
                var next = [];
                for (var li = 0; li < lines.length; li++) {
                    var L = lines[li];
                    if (!bboxOverlap(lineBbox(L), eb)) { next.push(L); continue; }
                    var pieces = cutPolyline(linePts(L), lineClosed(L), polys);
                    if (!pieces) { next.push(L); continue; }
                    stats.cutLines++;
                    var w = lineWidthPt(L);
                    pieces.forEach(function (pc) { next.push({ pts: pc, closed: false, w: w }); });
                }
                lines = next;
                fills = fills.filter(function (F) {
                    var c = F.pts ? polyCentroid(F.pts) : (function () {
                        var st = model.start[F.i] * 2, cnt = model.count[F.i];
                        return polyCentroid(model.coords.subarray(st, st + cnt * 2));
                    })();
                    for (var k = 0; k < polys.length; k++) if (pointInConvex(polys[k], c[0], c[1])) { stats.removedFills++; return false; }
                    return true;
                });
                texts = texts.filter(function (T) {
                    var c = T.t ? textCenter(T.t) : [T.x, T.y];
                    for (var k = 0; k < polys.length; k++) if (pointInConvex(polys[k], c[0], c[1])) { stats.removedTexts++; return false; }
                    return true;
                });
            } else if (ev.type === 'line') {
                var wPt = lw * (ev.w / baseLwPt);
                lines.push({ pts: ev.pts.slice(), closed: !!ev.closed, w: wPt > lw * 1.3 ? wPt : lw });
                stats.addedLines++;
            } else if (ev.type === 'fill') {
                fills.push({ pts: ev.pts.slice(), group: ++groupSeq });
                stats.addedFills++;
            } else if (ev.type === 'text') {
                texts.push({ x: ev.x, y: ev.y, size: ev.size, rot: ev.rot, text: ev.text });
                stats.addedTexts++;
            }
        });

        // 점 → 캐드 실좌표
        function toWorld(a) {
            var out = new Array(a.length);
            for (var k = 0; k < a.length; k += 2) { out[k] = a[k] / s + ox; out[k + 1] = a[k + 1] / s + oy; }
            return out;
        }
        var polylines = [];
        // 채움 먼저(원래 순서·묶음 유지 — buildPathContent가 같은 fillId끼리 짝홀 규칙)
        fills.forEach(function (F) {
            var pts = F.pts ? F.pts : (function () {
                var st = model.start[F.i] * 2, cnt = model.count[F.i];
                return Array.prototype.slice.call(model.coords.subarray(st, st + cnt * 2));
            })();
            polylines.push({ pts: toWorld(pts), closed: true, fill: true, fillId: F.group, width: 0 });
        });
        lines.forEach(function (L) {
            var w = lineWidthPt(L);
            polylines.push({ pts: toWorld(linePts(L)), closed: lineClosed(L), fill: false, width: (w > lw * 1.01) ? w / s : 0 });
        });
        var flatTexts = [];
        texts.forEach(function (T) {
            if (T.t) {
                var t = T.t;
                flatTexts.push({ x: t[0] / s + ox, y: t[1] / s + oy, h: t[2] / s, rot: t[3] || 0, hAlign: t[4] | 0, vAlign: t[5] | 0, text: String(t[6] || '') });
            } else {
                flatTexts.push({ x: T.x / s + ox, y: T.y / s + oy, h: (T.size * CAP_RATIO) / s, rot: T.rot || 0, hAlign: 1, vAlign: 2, text: T.text });
            }
        });
        var bounds = { minX: ox, minY: oy, maxX: meta.pageW / s + ox, maxY: meta.pageH / s + oy };
        return {
            flat: { polylines: polylines, texts: flatTexts, bounds: bounds, unit: meta.unit | 0 },
            stats: stats
        };
    }

    var api = {
        makeConvex: makeConvex,
        segInside: segInside,
        pointInConvex: pointInConvex,
        capsule: capsule,
        cutPolyline: cutPolyline,
        createRecorder: createRecorder,
        pxToPtMatrix: pxToPtMatrix,
        buildEditedFlat: buildEditedFlat
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.drawingEditVector = api; }
})(typeof window !== 'undefined' ? window : globalThis);
