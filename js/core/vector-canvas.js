/**
 * 벡터 기록 캔버스 (2026-11-19) — 순수 모듈(DOM 없이도 동작, measureText 만 진짜 캔버스를 빌림)
 *
 * 화면용 캔버스 그리기 코드(비파괴 핀·변위 묶음·균열게이지 등 drawNdtPin …)를 고치지 않고 그대로 돌려,
 * 그린 것을 벡터 도형 목록(ops)으로 받는다. 그 목록을 SVG(한글 위치도) 또는 DXF(비파괴 마킹 DXF)로 쓴다.
 *  - 좌표는 모두 「기기 좌표」(캔버스 변환을 적용한 뒤의 좌표)로 기록 — 곡선(호·타원·베지어)은 잘게 나눈 선으로.
 *  - op 종류:
 *      { t:'path', subs:[{pts:[x,y,…], closed}], fill:{color,alpha,rule}|null, stroke:{color,alpha,width,dash,cap,join}|null }
 *      { t:'text', str, x, y(기준선 왼쪽/가운데/오른쪽 점), size, angle(도, 화면 기준 시계 반대 +), anchor:'start'|'middle'|'end',
 *        weight, family, fill:{color,alpha}|null, stroke:{color,alpha,width}|null }
 *      { t:'image', img, m:[a,b,c,d,e,f](이미지 픽셀 → 기기), w, h, sx, sy, sw, sh, alpha }
 *      { t:'drawing', model, imgW, imgH, m }  — 캐드(DXF) 원본 도면을 벡터로(drawVectorDrawing 으로 넣음)
 *      { t:'clip', subs } / { t:'unclip' }   — 자르기 시작·끝(save/restore 짝)
 * 지원하지 않는 것(그림자·합성 모드·패턴)은 조용히 무시한다. 그라디언트 채움은 첫 색으로.
 */
(function (root) {
    'use strict';

    function mul(m, n) { // m · n (n 먼저)
        return [
            m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
        ];
    }

    function parseFont(font) {
        var s = String(font || '10px sans-serif');
        var m = s.match(/(\d+(?:\.\d+)?)px/);
        var size = m ? parseFloat(m[1]) : 10;
        var weight = /\bbold\b|\b[6-9]00\b/i.test(s.slice(0, m ? m.index : s.length)) ? 700 : 400;
        var family = m ? s.slice(m.index + m[0].length).replace(/^\s*\/\s*[\d.]+(px)?/, '').trim() : 'sans-serif';
        return { size: size, weight: weight, family: family || 'sans-serif' };
    }

    /** CSS 색 → { color:'#rrggbb', alpha } (rgba·#rgb·#rrggbbaa·이름 몇 개). 모르면 검정 */
    var NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080', transparent: '#000000' };
    function parseColor(c) {
        if (c && typeof c === 'object' && c._stops) c = c._stops.length ? c._stops[0] : '#000000';
        var s = String(c == null ? '#000000' : c).trim().toLowerCase();
        if (NAMED[s]) return { color: NAMED[s], alpha: s === 'transparent' ? 0 : 1 };
        var h = s.match(/^#([0-9a-f]{3,8})$/);
        if (h) {
            var x = h[1];
            if (x.length === 3 || x.length === 4) x = x.split('').map(function (ch) { return ch + ch; }).join('');
            var a = x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1;
            return { color: '#' + x.slice(0, 6), alpha: a };
        }
        var r = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
        if (r) {
            var hex = '#' + [r[1], r[2], r[3]].map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(+v))).toString(16)).slice(-2); }).join('');
            var al = r[4] == null ? 1 : (/%$/.test(r[4]) ? parseFloat(r[4]) / 100 : parseFloat(r[4]));
            return { color: hex, alpha: isFinite(al) ? al : 1 };
        }
        return { color: '#000000', alpha: 1 };
    }

    /**
     * opts: { width, height, measureCtx(진짜 2d 캔버스 — 글자 폭 재기, 없으면 어림), curveStep(곡선 나눔 각도, 기본 6°) }
     */
    function createVectorContext(opts) {
        opts = opts || {};
        var ops = [];
        var measure = opts.measureCtx || null;
        var stepRad = ((opts.curveStep || 6) * Math.PI) / 180;
        var st = {
            m: [1, 0, 0, 1, 0, 0], fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
            dash: [], dashOffset: 0, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, clips: 0
        };
        var stack = [];
        var subs = []; // 지금 경로: [{pts, closed}]
        var cur = null; // 지금 하위 경로
        var lastUser = null; // 마지막 점(사용자 좌표)

        function dev(x, y) { var m = st.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
        function scaleOf() { var m = st.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }
        function startSub(x, y) {
            cur = { pts: [], closed: false };
            subs.push(cur);
            var p = dev(x, y);
            cur.pts.push(p[0], p[1]);
            lastUser = [x, y];
        }
        function addPt(x, y) {
            if (!cur) { startSub(x, y); return; }
            var p = dev(x, y);
            cur.pts.push(p[0], p[1]);
            lastUser = [x, y];
        }
        function cloneSubs() { return subs.filter(function (s) { return s.pts.length >= 2; }).map(function (s) { return { pts: s.pts.slice(), closed: s.closed }; }); }

        var ctx = {
            canvas: { width: opts.width || 1, height: opts.height || 1 },
            ops: ops,
            isVectorRecorder: true,
            save: function () {
                stack.push({
                    m: st.m.slice(), fillStyle: st.fillStyle, strokeStyle: st.strokeStyle, lineWidth: st.lineWidth, lineCap: st.lineCap,
                    lineJoin: st.lineJoin, dash: st.dash.slice(), dashOffset: st.dashOffset, font: st.font, textAlign: st.textAlign,
                    textBaseline: st.textBaseline, globalAlpha: st.globalAlpha, clips: st.clips
                });
                st.clips = 0;
            },
            restore: function () {
                while (st.clips > 0) { ops.push({ t: 'unclip' }); st.clips--; }
                var s = stack.pop();
                if (s) Object.keys(s).forEach(function (k) { st[k] = s[k]; });
            },
            translate: function (x, y) { st.m = mul(st.m, [1, 0, 0, 1, +x || 0, +y || 0]); },
            scale: function (x, y) { st.m = mul(st.m, [+x, 0, 0, +y, 0, 0]); },
            rotate: function (a) { var c = Math.cos(a), s = Math.sin(a); st.m = mul(st.m, [c, s, -s, c, 0, 0]); },
            transform: function (a, b, c, d, e, f) { st.m = mul(st.m, [a, b, c, d, e, f]); },
            setTransform: function (a, b, c, d, e, f) {
                if (a && typeof a === 'object') { st.m = [a.a, a.b, a.c, a.d, a.e, a.f]; return; }
                st.m = [a, b, c, d, e, f].map(Number);
            },
            resetTransform: function () { st.m = [1, 0, 0, 1, 0, 0]; },
            getTransform: function () { var m = st.m; return { a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }; },
            beginPath: function () { subs = []; cur = null; lastUser = null; },
            moveTo: function (x, y) { startSub(+x, +y); },
            lineTo: function (x, y) { addPt(+x, +y); },
            closePath: function () {
                if (cur) {
                    cur.closed = true;
                    var x0 = cur.pts[0], y0 = cur.pts[1];
                    // 닫은 뒤 이어 그리면 시작점에서 새로
                    var m = st.m, det = m[0] * m[3] - m[1] * m[2] || 1;
                    var ux = (m[3] * (x0 - m[4]) - m[2] * (y0 - m[5])) / det;
                    var uy = (-m[1] * (x0 - m[4]) + m[0] * (y0 - m[5])) / det;
                    cur = null;
                    lastUser = [ux, uy];
                }
            },
            rect: function (x, y, w, h) {
                startSub(x, y); addPt(x + w, y); addPt(x + w, y + h); addPt(x, y + h); cur.closed = true; cur = null; lastUser = [x, y];
            },
            roundRect: function (x, y, w, h, r) {
                var rr = Array.isArray(r) ? (+r[0] || 0) : (+r || 0);
                rr = Math.max(0, Math.min(rr, Math.abs(w) / 2, Math.abs(h) / 2));
                if (!rr) { ctx.rect(x, y, w, h); return; }
                ctx.moveTo(x + rr, y);
                ctx.arcTo(x + w, y, x + w, y + h, rr);
                ctx.arcTo(x + w, y + h, x, y + h, rr);
                ctx.arcTo(x, y + h, x, y, rr);
                ctx.arcTo(x, y, x + w, y, rr);
                ctx.closePath();
            },
            arc: function (cx, cy, r, a0, a1, ccw) {
                ctx.ellipse(cx, cy, r, r, 0, a0, a1, ccw);
            },
            ellipse: function (cx, cy, rx, ry, rot, a0, a1, ccw) {
                var sweep = a1 - a0;
                if (ccw) { if (sweep > 0) sweep = sweep - Math.ceil(sweep / (2 * Math.PI)) * 2 * Math.PI; if (sweep <= -2 * Math.PI) sweep = -2 * Math.PI; }
                else { if (sweep < 0) sweep = sweep + Math.ceil(-sweep / (2 * Math.PI)) * 2 * Math.PI; if (sweep >= 2 * Math.PI) sweep = 2 * Math.PI; }
                if (Math.abs(a1 - a0) >= 2 * Math.PI) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
                var n = Math.max(4, Math.ceil(Math.abs(sweep) / stepRad));
                var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
                for (var i = 0; i <= n; i++) {
                    var t = a0 + (sweep * i) / n;
                    var lx = Math.cos(t) * rx, ly = Math.sin(t) * ry;
                    var x = cx + lx * cr - ly * sr, y = cy + lx * sr + ly * cr;
                    if (i === 0 && cur) addPt(x, y); else if (i === 0) startSub(x, y); else addPt(x, y);
                }
            },
            arcTo: function (x1, y1, x2, y2, r) {
                if (!lastUser) { startSub(x1, y1); return; }
                var x0 = lastUser[0], y0 = lastUser[1];
                var v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1;
                var l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
                if (!(r > 0) || l1 < 1e-9 || l2 < 1e-9) { addPt(x1, y1); return; }
                v1x /= l1; v1y /= l1; v2x /= l2; v2y /= l2;
                var cosA = v1x * v2x + v1y * v2y;
                var ang = Math.acos(Math.max(-1, Math.min(1, cosA)));
                if (ang < 1e-6 || Math.abs(ang - Math.PI) < 1e-6) { addPt(x1, y1); return; }
                var d = r / Math.tan(ang / 2);
                var t1x = x1 + v1x * d, t1y = y1 + v1y * d, t2x = x1 + v2x * d, t2y = y1 + v2y * d;
                var bx = v1x + v2x, by = v1y + v2y, bl = Math.hypot(bx, by) || 1;
                var cd = r / Math.sin(ang / 2);
                var ccx = x1 + (bx / bl) * cd, ccy = y1 + (by / bl) * cd;
                var s0 = Math.atan2(t1y - ccy, t1x - ccx), s1 = Math.atan2(t2y - ccy, t2x - ccx);
                var cross = v1x * v2y - v1y * v2x;
                addPt(t1x, t1y);
                ctx.ellipse(ccx, ccy, r, r, 0, s0, s1, cross > 0);
            },
            quadraticCurveTo: function (cx, cy, x, y) {
                if (!lastUser) { startSub(cx, cy); }
                var x0 = lastUser[0], y0 = lastUser[1];
                for (var i = 1; i <= 12; i++) {
                    var t = i / 12, u = 1 - t;
                    addPt(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
                }
            },
            bezierCurveTo: function (c1x, c1y, c2x, c2y, x, y) {
                if (!lastUser) { startSub(c1x, c1y); }
                var x0 = lastUser[0], y0 = lastUser[1];
                for (var i = 1; i <= 16; i++) {
                    var t = i / 16, u = 1 - t;
                    addPt(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
                        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
                }
            },
            setLineDash: function (a) { st.dash = Array.isArray(a) ? a.map(Number).filter(function (v) { return isFinite(v) && v >= 0; }) : []; },
            getLineDash: function () { return st.dash.slice(); },
            fill: function (a, b) {
                var rule = (a === 'evenodd' || b === 'evenodd') ? 'evenodd' : 'nonzero';
                var list = cloneSubs();
                if (!list.length) return;
                var c = parseColor(st.fillStyle);
                ops.push({ t: 'path', subs: list, fill: { color: c.color, alpha: c.alpha * st.globalAlpha, rule: rule }, stroke: null });
            },
            stroke: function () {
                var list = cloneSubs();
                if (!list.length) return;
                var c = parseColor(st.strokeStyle);
                var k = scaleOf();
                ops.push({
                    t: 'path', subs: list, fill: null,
                    stroke: {
                        color: c.color, alpha: c.alpha * st.globalAlpha, width: Math.max(0, st.lineWidth * k),
                        dash: st.dash.length ? st.dash.map(function (v) { return v * k; }) : null, cap: st.lineCap, join: st.lineJoin
                    }
                });
            },
            clip: function () {
                var list = cloneSubs();
                if (!list.length) return;
                ops.push({ t: 'clip', subs: list });
                st.clips++;
            },
            fillRect: function (x, y, w, h) {
                var keep = subs, keepCur = cur, keepLast = lastUser;
                ctx.beginPath(); ctx.rect(x, y, w, h); ctx.fill();
                subs = keep; cur = keepCur; lastUser = keepLast;
            },
            strokeRect: function (x, y, w, h) {
                var keep = subs, keepCur = cur, keepLast = lastUser;
                ctx.beginPath(); ctx.rect(x, y, w, h); ctx.stroke();
                subs = keep; cur = keepCur; lastUser = keepLast;
            },
            clearRect: function () { /* 흰 종이 위에 그리므로 무시 */ },
            measureText: function (text) {
                if (measure) { measure.font = st.font; return measure.measureText(String(text)); }
                var f = parseFont(st.font);
                var w = 0, s = String(text);
                for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 0x2E7F ? 1 : 0.6;
                return { width: w * f.size, actualBoundingBoxAscent: f.size * 0.75, actualBoundingBoxDescent: f.size * 0.2 };
            },
            fillText: function (text, x, y) { pushText(text, x, y, true); },
            strokeText: function (text, x, y) { pushText(text, x, y, false); },
            drawImage: function (img) {
                var a = Array.prototype.slice.call(arguments, 1).map(Number);
                var iw = img && (img.naturalWidth || img.width) || 0, ih = img && (img.naturalHeight || img.height) || 0;
                var sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
                if (a.length >= 8) { sx = a[0]; sy = a[1]; sw = a[2]; sh = a[3]; dx = a[4]; dy = a[5]; dw = a[6]; dh = a[7]; }
                else if (a.length >= 4) { dx = a[0]; dy = a[1]; dw = a[2]; dh = a[3]; }
                else { dx = a[0] || 0; dy = a[1] || 0; dw = iw; dh = ih; }
                if (!(dw > 0) || !(dh > 0)) return;
                ops.push({ t: 'image', img: img, m: mul(st.m, [1, 0, 0, 1, dx, dy]), w: dw, h: dh, sx: sx, sy: sy, sw: sw, sh: sh, alpha: st.globalAlpha });
            },
            /** 캐드 원본 도면(dxf-view 모델)을 그림 픽셀 좌표(imgW×imgH)에 벡터로 깐다 — 이 기록기 전용 */
            drawVectorDrawing: function (model, imgW, imgH) {
                if (model) ops.push({ t: 'drawing', model: model, imgW: imgW, imgH: imgH, m: st.m.slice() });
            },
            createLinearGradient: function () { var g = { _stops: [], addColorStop: function (o, c) { g._stops.push(c); } }; return g; },
            createRadialGradient: function () { var g = { _stops: [], addColorStop: function (o, c) { g._stops.push(c); } }; return g; },
            createPattern: function () { return '#808080'; },
            isPointInPath: function () { return false; },
            isPointInStroke: function () { return false; }
        };
        ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'font', 'textAlign', 'textBaseline', 'globalAlpha'].forEach(function (k) {
            Object.defineProperty(ctx, k, { get: function () { return st[k]; }, set: function (v) { st[k] = v; }, enumerable: true });
        });
        Object.defineProperty(ctx, 'lineDashOffset', { get: function () { return st.dashOffset; }, set: function (v) { st.dashOffset = +v || 0; } });
        // 무시하는 속성(값만 받아 둠)
        ['shadowColor', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'globalCompositeOperation', 'imageSmoothingEnabled',
            'imageSmoothingQuality', 'miterLimit', 'filter', 'direction', 'letterSpacing'].forEach(function (k) {
            var v;
            Object.defineProperty(ctx, k, { get: function () { return v; }, set: function (x) { v = x; } });
        });

        function pushText(text, x, y, isFill) {
            var str = String(text == null ? '' : text);
            if (!str || !isFinite(x) || !isFinite(y)) return;
            var f = parseFont(st.font);
            // 기준선 맞춤 → 글자 기준선(alphabetic) 위치로 바꿔 둔다(SVG·DXF 모두 기준선으로 쓴다)
            var off = 0;
            var tb = st.textBaseline;
            if (tb === 'middle') off = f.size * 0.35;
            else if (tb === 'top' || tb === 'hanging') off = f.size * 0.8;
            else if (tb === 'bottom' || tb === 'ideographic') off = -f.size * 0.2;
            var p = dev(x, y + off);
            var m = st.m;
            var k = scaleOf();
            var angle = Math.atan2(m[1], m[0]) * 180 / Math.PI; // 화면 좌표(아래 +y)에서의 각
            var ta = st.textAlign;
            var anchor = ta === 'center' ? 'middle' : ((ta === 'right' || ta === 'end') ? 'end' : 'start');
            var c = parseColor(isFill ? st.fillStyle : st.strokeStyle);
            ops.push({
                t: 'text', str: str, x: p[0], y: p[1], size: f.size * k, angle: angle, anchor: anchor, weight: f.weight, family: f.family,
                fill: isFill ? { color: c.color, alpha: c.alpha * st.globalAlpha } : null,
                stroke: isFill ? null : { color: c.color, alpha: c.alpha * st.globalAlpha, width: st.lineWidth * k }
            });
        }
        return ctx;
    }

    /* ───────────── SVG 로 쓰기 ───────────── */

    function n2(v) { var x = Math.round(Number(v) * 100) / 100; return isFinite(x) ? String(x === 0 ? 0 : x) : '0'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function subsD(subs) {
        var d = '';
        subs.forEach(function (s) {
            for (var i = 0; i < s.pts.length; i += 2) d += (i ? 'L' : 'M') + n2(s.pts[i]) + ' ' + n2(s.pts[i + 1]);
            if (s.closed) d += 'Z';
        });
        return d;
    }
    var SVG_FONT = "'Malgun Gothic','맑은 고딕','Noto Sans KR',Arial,sans-serif";

    /**
     * ops → SVG 글자. opts: { width, height, imageHref(img) → data URL|null, drawingSvg(model, imgW, imgH) → SVG 조각 }
     * 한글(HWP)에 넣어도 같은 모양: dominant-baseline·paint-order 를 쓰지 않는다(기준선은 기록 때 맞춰 둠).
     */
    function opsToSvg(ops, opts) {
        opts = opts || {};
        var W = Math.max(1, Number(opts.width) || 1), H = Math.max(1, Number(opts.height) || 1);
        var out = [], defs = [], clipN = 0;
        out.push('<?xml version="1.0" encoding="UTF-8"?>');
        out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="' + n2(W) + '" height="' + n2(H) + '" viewBox="0 0 ' + n2(W) + ' ' + n2(H) + '">');
        if (opts.title) out.push('<title>' + esc(opts.title) + '</title>');
        var defsAt = out.length;
        out.push('<rect x="0" y="0" width="' + n2(W) + '" height="' + n2(H) + '" fill="#ffffff"/>');
        var hrefCache = new Map();
        var openClips = 0;
        (ops || []).forEach(function (op) {
            if (!op) return;
            if (op.t === 'path') {
                var d = subsD(op.subs);
                if (!d) return;
                var a = '';
                if (op.fill) {
                    a += ' fill="' + op.fill.color + '"';
                    if (op.fill.alpha < 0.999) a += ' fill-opacity="' + n2(op.fill.alpha) + '"';
                    if (op.fill.rule === 'evenodd') a += ' fill-rule="evenodd"';
                } else a += ' fill="none"';
                if (op.stroke) {
                    a += ' stroke="' + op.stroke.color + '" stroke-width="' + n2(op.stroke.width) + '"';
                    if (op.stroke.alpha < 0.999) a += ' stroke-opacity="' + n2(op.stroke.alpha) + '"';
                    if (op.stroke.dash && op.stroke.dash.length) a += ' stroke-dasharray="' + op.stroke.dash.map(n2).join(' ') + '"';
                    if (op.stroke.cap && op.stroke.cap !== 'butt') a += ' stroke-linecap="' + op.stroke.cap + '"';
                    if (op.stroke.join && op.stroke.join !== 'miter') a += ' stroke-linejoin="' + op.stroke.join + '"';
                }
                out.push('<path d="' + d + '"' + a + '/>');
            } else if (op.t === 'text') {
                var tr = Math.abs(op.angle) > 0.01 ? ' transform="rotate(' + n2(op.angle) + ' ' + n2(op.x) + ' ' + n2(op.y) + ')"' : '';
                var ta = ' x="' + n2(op.x) + '" y="' + n2(op.y) + '" font-family="' + SVG_FONT + '" font-size="' + n2(op.size) + '"'
                    + (op.weight >= 600 ? ' font-weight="700"' : '') + (op.anchor !== 'start' ? ' text-anchor="' + op.anchor + '"' : '') + tr;
                var paint = op.fill
                    ? ' fill="' + op.fill.color + '"' + (op.fill.alpha < 0.999 ? ' fill-opacity="' + n2(op.fill.alpha) + '"' : '')
                    : ' fill="none" stroke="' + op.stroke.color + '" stroke-width="' + n2(op.stroke.width) + '" stroke-linejoin="round"'
                    + (op.stroke.alpha < 0.999 ? ' stroke-opacity="' + n2(op.stroke.alpha) + '"' : '');
                out.push('<text' + ta + paint + '>' + esc(op.str) + '</text>');
            } else if (op.t === 'image') {
                var href = hrefCache.get(op.img);
                if (href === undefined) { href = opts.imageHref ? opts.imageHref(op.img) : null; hrefCache.set(op.img, href); }
                if (!href) return;
                var iw = op.img && (op.img.naturalWidth || op.img.width) || op.sw || op.w;
                var ih = op.img && (op.img.naturalHeight || op.img.height) || op.sh || op.h;
                // 원본 일부(sx,sy,sw,sh)를 dw×dh 에 — 전체 그림을 늘려 놓고 그 칸만 보이게 자른다
                var kx = op.w / (op.sw || iw), ky = op.h / (op.sh || ih);
                var inner = '<image x="' + n2(-op.sx * kx) + '" y="' + n2(-op.sy * ky) + '" width="' + n2(iw * kx) + '" height="' + n2(ih * ky) + '" preserveAspectRatio="none"'
                    + (op.alpha < 0.999 ? ' opacity="' + n2(op.alpha) + '"' : '') + ' xlink:href="' + esc(href) + '" href="' + esc(href) + '"/>';
                var mm = op.m.map(function (v) { return String(Math.round(v * 1e6) / 1e6); }).join(' ');
                var partial = op.sx || op.sy || (op.sw && Math.abs(op.sw - iw) > 0.5) || (op.sh && Math.abs(op.sh - ih) > 0.5);
                if (partial) {
                    var cid = 'vcImg' + (++clipN);
                    defs.push('<clipPath id="' + cid + '"><rect x="0" y="0" width="' + n2(op.w) + '" height="' + n2(op.h) + '"/></clipPath>');
                    out.push('<g transform="matrix(' + mm + ')"><g clip-path="url(#' + cid + ')">' + inner + '</g></g>');
                } else out.push('<g transform="matrix(' + mm + ')">' + inner + '</g>');
            } else if (op.t === 'drawing') {
                if (!opts.drawingSvg) return;
                var frag = opts.drawingSvg(op.model, op.imgW, op.imgH);
                if (!frag) return;
                out.push('<g transform="matrix(' + op.m.map(function (v) { return String(Math.round(v * 1e6) / 1e6); }).join(' ') + ')">' + frag + '</g>');
            } else if (op.t === 'clip') {
                var id = 'vcClip' + (++clipN);
                defs.push('<clipPath id="' + id + '"><path d="' + subsD(op.subs) + '"/></clipPath>');
                out.push('<g clip-path="url(#' + id + ')">');
                openClips++;
            } else if (op.t === 'unclip') {
                if (openClips > 0) { out.push('</g>'); openClips--; }
            }
        });
        while (openClips-- > 0) out.push('</g>'); // restore 없이 끝난 자르기
        if (defs.length) out.splice(defsAt, 0, '<defs>' + defs.join('') + '</defs>');
        out.push('</svg>');
        return out.join('\n') + '\n';
    }

    // SVG_FONT: 비파괴 SVG 글자 글꼴 — 글자 폭도 이 글꼴로 재야 박스가 맞는다(svg-write.js svgMeasureCtx)
    var api = { createVectorContext: createVectorContext, opsToSvg: opsToSvg, parseColor: parseColor, parseFont: parseFont, SVG_FONT: SVG_FONT };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.vectorCanvas = api; }
})(typeof window !== 'undefined' ? window : globalThis);
