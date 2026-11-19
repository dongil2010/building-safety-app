/**
 * 결함위치도 SVG 쓰기 (2026-11-19) — 순수 모듈(화면·DOM 없음)
 * 벡터 PDF·마킹 DXF 와 같은 「그리기 계획」(plans, legendPlan)을 SVG 글자로 바꾼다.
 * - 좌표 = 그림 픽셀(왼쪽 위 원점, 아래로 +y) 그대로. viewBox 가 그림 크기라 일러스트레이터·잉크스케이프·브라우저에서 바로 열린다.
 * - 바탕 도면: DXF 로 올린 층은 원본 선·글자를 벡터로(drawing), 그 밖(PDF·그림) 층은 그림 한 장(background)으로 넣는다.
 * - 층(레이어)마다 <g id="…"> 로 나눠 편집 프로그램에서 레이어처럼 켜고 끌 수 있다.
 * 모양 규칙(굵기·채움 28%·빗금·화살표·글자 흰 테두리·범례 회색)은 js/pdf-vector-bridge.js 의 벡터 PDF 와 맞춘다.
 */
(function (root) {
    'use strict';

    var FONT = "'Malgun Gothic','맑은 고딕','Noto Sans KR','Apple SD Gothic Neo',Arial,sans-serif";
    var DRAW_FONT = "Arial,'Malgun Gothic','맑은 고딕','Noto Sans KR',sans-serif";
    var CAP_RATIO = 0.72; // 도면 글자: 대문자 높이 → 글꼴 크기 (dxf-view.js 와 같음)
    var DRAW_FILL = '#808080';

    function n2(v) {
        var x = Math.round(Number(v) * 100) / 100;
        if (!isFinite(x)) return '0';
        if (x === 0) return '0';
        return String(x);
    }

    function finite() {
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            if (v === null || v === '' || v === undefined || !isFinite(Number(v))) return false;
        }
        return true;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** #rgb·#rrggbb·rgb() 만 그대로, 나머지는 검정 */
    function color(c) {
        var s = String(c == null ? '' : c).trim();
        if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(s)) return s.toLowerCase();
        if (/^rgba?\([\d\s.,%]+\)$/i.test(s)) return s;
        return '#000000';
    }

    function ellipsePoly(cx, cy, rx, ry, angleDeg, segments) {
        var n = Math.max(16, segments || 48);
        var rad = ((Number(angleDeg) || 0) * Math.PI) / 180;
        var c = Math.cos(rad), s = Math.sin(rad);
        var pts = [];
        for (var i = 0; i < n; i++) {
            var t = (i / n) * Math.PI * 2;
            var lx = Math.cos(t) * rx, ly = Math.sin(t) * ry;
            pts.push({ x: cx + lx * c - ly * s, y: cy + lx * s + ly * c });
        }
        return pts;
    }

    /** 영역 마킹 바깥선(그림 픽셀) — pdf-vector-bridge 의 areaOutlineImgPoints 와 같은 규칙 */
    function areaOutlinePoints(area) {
        var shape = area.shape === 'ellipse' || area.shape === 'polygon' || area.shape === 'polyline' ? area.shape : 'rect';
        var ix1 = Math.min(area.x1, area.x2), iy1 = Math.min(area.y1, area.y2);
        var ix2 = Math.max(area.x1, area.x2), iy2 = Math.max(area.y1, area.y2);
        var cx = (ix1 + ix2) / 2, cy = (iy1 + iy2) / 2;
        var hw = (ix2 - ix1) / 2, hh = (iy2 - iy1) / 2;
        var ang = Number(area.angle) || 0;
        if (shape === 'ellipse') return ellipsePoly(cx, cy, Math.max(hw, 0.5), Math.max(hh, 0.5), ang, 56);
        if (Array.isArray(area.points) && area.points.length >= (shape === 'polyline' ? 2 : 3)) {
            return area.points.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; });
        }
        var rad = (ang * Math.PI) / 180;
        var c = Math.cos(rad), s = Math.sin(rad);
        return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }].map(function (p) {
            return { x: cx + p.x * c - p.y * s, y: cy + p.x * s + p.y * c };
        });
    }

    function ptsAttr(pts) {
        var out = [];
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (!p || !finite(p.x, p.y)) return '';
            out.push(n2(p.x) + ',' + n2(p.y));
        }
        return out.join(' ');
    }

    /**
     * opts:
     *  - width, height: 그림 크기(픽셀) — viewBox
     *  - plans, legendPlan: 벡터 PDF 와 같은 계획
     *  - background: { href(data URL), x, y, w, h } — 그림 바탕(PDF·그림 층)
     *  - drawing: { model(js/core/dxf-view.js 모델, PDF 점 좌표, y 위로) } — DXF 층 원본 도면(벡터)
     *  - title: <title> 글자
     *  - page: { w, h, matrix:[a,b,c,d,e,f](그림 픽셀 → 종이), clip:{x,y,w,h}(그림 픽셀, 범례 빼고 자름) } — 한글 위치도용(선택)
     * 반환 SVG 글자
     */
    function buildMarkingSvg(opts) {
        opts = opts || {};
        var W = Math.max(1, Number(opts.width) || 1);
        var H = Math.max(1, Number(opts.height) || 1);
        var plans = Array.isArray(opts.plans) ? opts.plans.filter(Boolean) : [];
        var legendPlan = opts.legendPlan || null;
        var out = [];
        var clipN = 0;
        var defs = [];
        // 2026-11-19 한글 위치도(page): 종이 크기·변환(돌림·배율)·자르기 범위. 없으면 종이 = 그림.
        var page = opts.page && Number(opts.page.w) > 0 && Number(opts.page.h) > 0 ? opts.page : null;
        var PW = page ? Number(page.w) : W;
        var PH = page ? Number(page.h) : H;
        var M = page && Array.isArray(page.matrix) && page.matrix.length === 6 && finite.apply(null, page.matrix) ? page.matrix : null;
        var clip = page && page.clip && finite(page.clip.x, page.clip.y, page.clip.w, page.clip.h) ? page.clip : null;

        out.push('<?xml version="1.0" encoding="UTF-8"?>');
        out.push('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"'
            + ' width="' + n2(PW) + '" height="' + n2(PH) + '" viewBox="0 0 ' + n2(PW) + ' ' + n2(PH) + '">');
        if (opts.title) out.push('<title>' + esc(opts.title) + '</title>');
        var defsAt = out.length; // <defs> 자리(빗금 자르기 모양)
        out.push('<rect id="BSA_PAPER" x="0" y="0" width="' + n2(PW) + '" height="' + n2(PH) + '" fill="#ffffff"/>');
        if (M) out.push('<g transform="matrix(' + M.map(function (v) { return String(Math.round(Number(v) * 1e6) / 1e6); }).join(' ') + ')">');
        if (clip) {
            defs.push('<clipPath id="bsaPageClip"><rect x="' + n2(clip.x) + '" y="' + n2(clip.y) + '" width="' + n2(clip.w) + '" height="' + n2(clip.h) + '"/></clipPath>');
            out.push('<g clip-path="url(#bsaPageClip)">');
        }

        /* ----- 바탕 도면 ----- */
        var bg = opts.background;
        if (bg && bg.href) {
            out.push('<g id="BSA_DRAWING">');
            out.push('<image x="' + n2(bg.x || 0) + '" y="' + n2(bg.y || 0) + '" width="' + n2(bg.w || W) + '" height="' + n2(bg.h || H) + '"'
                + ' preserveAspectRatio="none" xlink:href="' + esc(bg.href) + '" href="' + esc(bg.href) + '"/>');
            out.push('</g>');
        }
        var dr = opts.drawing;
        if (dr && dr.model && dr.model.pageW > 0 && dr.model.pageH > 0) {
            out.push(drawingSvg(dr.model, W, H));
        }

        /* ----- 영역 마킹 한 개 ----- */
        function areaSvg(area, col) {
            if (!area) return '';
            var isLine = area.shape === 'polyline';
            var outline = areaOutlinePoints(area);
            if (outline.length < (isLine ? 2 : 3)) return '';
            var pts = ptsAttr(outline);
            if (!pts) return '';
            var fillStyle = area.fillStyle === 'hatch' || area.fillStyle === 'none' ? area.fillStyle : 'solid';
            var dashed = area.borderStyle === 'dashed';
            var s = '';
            if (!isLine && fillStyle === 'solid') {
                s += '<polygon points="' + pts + '" fill="' + col + '" fill-opacity="0.28" stroke="none"/>';
            } else if (!isLine && fillStyle === 'hatch') {
                var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                outline.forEach(function (p) {
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                var rw = maxX - minX, rh = maxY - minY;
                if (isFinite(rw) && isFinite(rh)) {
                    var id = 'bsaClip' + (++clipN);
                    defs.push('<clipPath id="' + id + '"><polygon points="' + pts + '"/></clipPath>');
                    var step = 9;
                    while ((rw + 2 * rh) / step > 1500) step *= 2;
                    var d = '';
                    for (var i = -rh; i <= rw + rh; i += step) {
                        // 왼쪽 위 → 오른쪽 아래 45도(벡터 PDF 와 같은 방향)
                        d += 'M' + n2(minX + i) + ' ' + n2(minY) + 'L' + n2(minX + i + rh) + ' ' + n2(maxY);
                    }
                    s += '<path d="' + d + '" clip-path="url(#' + id + ')" fill="none" stroke="' + col + '" stroke-opacity="0.7" stroke-width="0.9"/>';
                }
            }
            var dash = dashed ? ' stroke-dasharray="5 4"' : '';
            s += isLine
                ? '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>'
                : '<polygon points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.1" stroke-linejoin="round"' + dash + '/>';
            // 손그림(자유 선·사각형·타원)
            (Array.isArray(area.drawings) ? area.drawings : []).forEach(function (st) {
                var dp = (st && st.points) || [];
                if (dp.length < 1) return;
                var type = st.type || 'path';
                var poly;
                var closed = false;
                if ((type === 'rect' || type === 'ellipse') && dp.length >= 2) {
                    var x1 = Math.min(dp[0].x, dp[1].x), y1 = Math.min(dp[0].y, dp[1].y);
                    var x2 = Math.max(dp[0].x, dp[1].x), y2 = Math.max(dp[0].y, dp[1].y);
                    poly = type === 'rect'
                        ? [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
                        : ellipsePoly((x1 + x2) / 2, (y1 + y2) / 2, Math.max((x2 - x1) / 2, 0.5), Math.max((y2 - y1) / 2, 0.5), 0, 40);
                    closed = true;
                } else {
                    poly = dp;
                    closed = type === 'polygon' && dp.length >= 3;
                }
                var pa = ptsAttr(poly);
                if (!pa) return;
                s += '<' + (closed ? 'polygon' : 'polyline') + ' points="' + pa + '" fill="none" stroke="' + col
                    + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
            });
            return s;
        }

        /**
         * 가운데 맞춤 글자. halo = 흰 테두리(도면 선 위에서도 읽히게).
         * 2026-11-19 한글(HWP)에 SVG 를 넣으면 dominant-baseline 을 무시해 글자가 위로 올라가고,
         * paint-order 도 무시해 흰 테두리가 글자를 덮어 번호가 안 보였다 →
         * 기준선(y)을 직접 글자 가운데에 맞추고(대문자·한글 가운데 ≈ 기준선 위 0.35em),
         * 흰 테두리는 같은 글자를 한 번 더 아래에 깔아 그린다(어느 프로그램에서나 같은 모양).
         */
        function textSvg(str, cx, cy, size, col, halo, weight) {
            if (!finite(cx, cy, size) || !(size > 0)) return '';
            var t = String(str == null ? '' : str);
            if (!t) return '';
            var base = ' x="' + n2(cx) + '" y="' + n2(Number(cy) + size * 0.35) + '" font-family="' + FONT + '" font-size="' + n2(size) + '"'
                + ' font-weight="' + (weight || 700) + '" text-anchor="middle"';
            var s = '';
            if (halo) {
                s += '<text' + base + ' fill="#ffffff" stroke="#ffffff" stroke-width="' + n2(Math.max(0.6, size * 0.22)) + '" stroke-linejoin="round">'
                    + esc(t) + '</text>';
            }
            return s + '<text' + base + ' fill="' + col + '">' + esc(t) + '</text>';
        }

        /* ----- 핀(영역·지시선·번호 박스) ----- */
        var areas = [];
        var leaders = [];
        var boxes = [];
        plans.forEach(function (p) {
            var col = color(p.color);
            var lineW = Math.max(0.2, Number(p.lineW) || 1);
            var borderW = Math.max(0.2, Number(p.borderW) || 1);
            var fontSize = Math.max(0.5, Number(p.fontSize) || 12);

            var areaList = (Array.isArray(p.areas) && p.areas.length) ? p.areas : (p.area ? [p.area] : []);
            areaList.forEach(function (a) { var s = areaSvg(a, col); if (s) areas.push(s); });

            (p.leaders || []).forEach(function (L) {
                if (!L) return;
                var route = (L.route || []).filter(function (q) { return q && finite(q.x, q.y); });
                if (route.length >= 2) {
                    leaders.push('<polyline points="' + ptsAttr(route) + '" fill="none" stroke="' + col + '" stroke-width="' + n2(lineW)
                        + '" stroke-linejoin="round" stroke-linecap="round"/>');
                }
                if (L.skipArrowHead || !finite(L.tipX, L.tipY)) return;
                var tx = Number(L.tipX), ty = Number(L.tipY);
                var headLen = Number(L.headLen) || 11;
                if (L.useCircleTip) {
                    leaders.push('<circle cx="' + n2(tx) + '" cy="' + n2(ty) + '" r="' + n2(Math.max(0.6, 4.5 * (headLen / 11))) + '" fill="' + col + '"/>');
                    return;
                }
                var stem = route.length ? route[route.length - 1] : { x: tx, y: ty };
                var ang = Math.atan2(ty - stem.y, tx - stem.x);
                if (!isFinite(ang) || (Math.abs(tx - stem.x) < 1e-6 && Math.abs(ty - stem.y) < 1e-6)) {
                    ang = Math.atan2(Number(L.uy) || 0, Number(L.ux) || 1);
                }
                var hl = Math.max(2.5, headLen);
                var a1 = { x: tx - hl * Math.cos(ang - Math.PI / 6), y: ty - hl * Math.sin(ang - Math.PI / 6) };
                var a2 = { x: tx - hl * Math.cos(ang + Math.PI / 6), y: ty - hl * Math.sin(ang + Math.PI / 6) };
                leaders.push('<polygon points="' + ptsAttr([{ x: tx, y: ty }, a1, a2]) + '" fill="' + col + '"/>');
            });

            if (!finite(p.boxX, p.boxY, p.boxW, p.boxH)) return;
            var bx = Number(p.boxX), by = Number(p.boxY), bw = Number(p.boxW), bh = Number(p.boxH);
            var l = bx - bw / 2, t = by - bh / 2;
            var fill = p.fill ? col : (p.typeCallout ? '#ffffff' : 'none');
            var g = '<g class="bsa-pin">';
            g += '<rect x="' + n2(l) + '" y="' + n2(t) + '" width="' + n2(bw) + '" height="' + n2(bh) + '" fill="' + fill
                + '" stroke="' + col + '" stroke-width="' + n2(borderW) + '"/>';
            if (p.typeCallout && p.typeLabel) {
                var c1 = p.col1W != null ? Number(p.col1W) : bw * 0.28;
                g += '<line x1="' + n2(l + c1) + '" y1="' + n2(t) + '" x2="' + n2(l + c1) + '" y2="' + n2(t + bh) + '" stroke="' + col + '" stroke-width="' + n2(borderW) + '"/>';
                g += textSvg(String(p.label || 'NO.01'), l + c1 / 2, by, fontSize, col, false);
                g += textSvg(String(p.typeLabel), l + c1 + (bw - c1) / 2, by, fontSize, col, false);
            } else {
                g += textSvg(String(p.label || 'NO.01'), bx, by, fontSize, p.fill ? '#ffffff' : col, !p.fill);
            }
            g += '</g>';
            boxes.push(g);
        });
        if (areas.length) out.push('<g id="BSA_AREA">' + areas.join('') + '</g>');
        if (leaders.length) out.push('<g id="BSA_LEADER">' + leaders.join('') + '</g>');
        if (boxes.length) out.push('<g id="BSA_PIN">' + boxes.join('') + '</g>');
        if (clip) out.push('</g>'); // 범례는 자르기 밖(범위 안 구석에 따로 놓는다)

        /* ----- 범례 표 ----- */
        if (legendPlan && legendPlan.items && legendPlan.items.length && finite(legendPlan.boxX, legendPlan.boxY, legendPlan.boxW, legendPlan.boxH)) {
            var lx = Number(legendPlan.boxX), ly = Number(legendPlan.boxY);
            var lw = Number(legendPlan.boxW), lh = Number(legendPlan.boxH);
            var col1W = Number(legendPlan.col1W) || lw * 0.4;
            var col2W = Number(legendPlan.col2W) || (lw - col1W);
            var headerH = Number(legendPlan.headerRowH) || 0;
            var rowH = Number(legendPlan.rowH) || 0;
            var lineW2 = Math.max(0.3, Number(legendPlan.lineW) || 1);
            var gray = '#a3a3a3';
            var headGray = '#64748b';
            var fs = Math.max(4, Number(legendPlan.fontSize) || 12);
            var lg = '<g id="BSA_LEGEND">';
            lg += '<rect x="' + n2(lx) + '" y="' + n2(ly) + '" width="' + n2(lw) + '" height="' + n2(lh) + '" fill="#ffffff" stroke="' + gray + '" stroke-width="' + n2(lineW2) + '"/>';
            var ld = 'M' + n2(lx + col1W) + ' ' + n2(ly) + 'V' + n2(ly + lh) + 'M' + n2(lx) + ' ' + n2(ly + headerH) + 'H' + n2(lx + lw);
            for (var i = 1; i < legendPlan.items.length; i++) {
                var yy = ly + headerH + i * rowH;
                ld += 'M' + n2(lx) + ' ' + n2(yy) + 'H' + n2(lx + lw);
            }
            lg += '<path d="' + ld + '" fill="none" stroke="' + gray + '" stroke-width="' + n2(lineW2) + '"/>';
            lg += textSvg('구분', lx + col1W / 2, ly + headerH / 2, fs, headGray, false);
            lg += textSvg('내 용', lx + col1W + col2W / 2, ly + headerH / 2, fs, headGray, false);
            legendPlan.items.forEach(function (item, k) {
                var cy = ly + headerH + k * rowH + rowH / 2;
                var ic = color(item.color);
                lg += textSvg(item.colorName, lx + col1W / 2, cy, fs, ic, false);
                lg += textSvg(item.label, lx + col1W + col2W / 2, cy, fs, ic, false);
            });
            lg += '</g>';
            out.push(lg);
        }

        if (M) out.push('</g>');
        if (defs.length) out.splice(defsAt, 0, '<defs>' + defs.join('') + '</defs>');
        out.push('</svg>');
        return out.join('\n') + '\n';
    }

    /**
     * DXF 로 올린 층의 원본 도면(dxf-view 모델, PDF 점 좌표·y 위로) → 그림 픽셀 좌표의 SVG 묶음.
     * 채움(회색, 짝홀) → 선(굵기별) → 글자 순서는 화면(dxf-view render)과 같다.
     */
    function drawingSvg(model, W, H) {
        var kx = W / model.pageW, ky = H / model.pageH;
        var k = Math.sqrt(kx * ky) || 1;
        var coords = model.coords, start = model.start, count = model.count, flags = model.flags;
        var widths = model.width || [], groups = model.group || [];
        var X = function (x) { return n2(x * kx); };
        var Y = function (y) { return n2(H - y * ky); };
        var parts = ['<g id="BSA_DRAWING">'];

        function trace(p) {
            var s = start[p] * 2, c = count[p];
            var d = 'M' + X(coords[s]) + ' ' + Y(coords[s + 1]);
            var lx = d;
            for (var q = 1; q < c; q++) {
                var seg = 'L' + X(coords[s + q * 2]) + ' ' + Y(coords[s + q * 2 + 1]);
                if (seg === lx) continue; // 반올림 뒤 같은 점은 뺀다
                d += seg;
                lx = seg;
            }
            if (flags[p] & 1) d += 'Z';
            return d;
        }

        // 1) 채움 — 묶음(group)마다 path 하나(짝홀 규칙)
        var fillD = new Map();
        for (var p = 0; p < model.n; p++) {
            if (!(flags[p] & 2) || count[p] < 2) continue;
            var gk = groups[p] || 0;
            fillD.set(gk, (fillD.get(gk) || '') + trace(p) + (flags[p] & 1 ? '' : 'Z'));
        }
        if (fillD.size) {
            var fp = [];
            fillD.forEach(function (d) { fp.push('<path d="' + d + '" fill-rule="evenodd"/>'); });
            parts.push('<g fill="' + DRAW_FILL + '" stroke="none">' + fp.join('') + '</g>');
        }

        // 2) 선 — 굵기(0.05 단위)별로 모아서 path 몇 개로
        var baseLw = Number(model.lw) > 0 ? Number(model.lw) : 0.15;
        var byW = new Map();
        for (var p2 = 0; p2 < model.n; p2++) {
            if ((flags[p2] & 2) || count[p2] < 2) continue;
            var wPt = Number(widths[p2]) || 0;
            var wPx = Math.max(0.5, (wPt > baseLw + 1e-3 ? wPt : baseLw) * k);
            var key = Math.round(wPx * 20) / 20;
            var arr = byW.get(key);
            if (!arr) { arr = []; byW.set(key, arr); }
            arr.push(trace(p2));
        }
        byW.forEach(function (list, w) {
            var round = w >= 2.5;
            // 너무 긴 d 는 편집 프로그램이 느려서 4000개씩 나눈다
            for (var i = 0; i < list.length; i += 4000) {
                parts.push('<path d="' + list.slice(i, i + 4000).join('') + '" fill="none" stroke="#000000" stroke-width="' + n2(w) + '"'
                    + (round ? ' stroke-linecap="round" stroke-linejoin="round"' : ' stroke-linejoin="bevel"') + '/>');
            }
        });

        // 3) 글자
        var texts = model.texts || [];
        if (texts.length) {
            var tp = [];
            for (var ti = 0; ti < texts.length; ti++) {
                var t = texts[ti];
                if (!t || !finite(t[0], t[1], t[2])) continue;
                var hPx = Number(t[2]) * k;
                var size = hPx / CAP_RATIO;
                if (!(size > 0)) continue;
                var r = (Number(t[3]) || 0) * Math.PI / 180;
                var dx = kx * Math.cos(r), dy = -ky * Math.sin(r);
                var deg = Math.atan2(dy, dx) * 180 / Math.PI;
                var anchor = t[4] === 1 ? 'middle' : (t[4] === 2 ? 'end' : 'start');
                var off = 0;
                if (t[5] === 1) off = -size * 0.21;
                else if (t[5] === 2) off = hPx / 2;
                else if (t[5] === 3) off = hPx;
                var tr = 'translate(' + n2(t[0] * kx) + ' ' + n2(H - t[1] * ky) + ')' + (Math.abs(deg) > 0.01 ? ' rotate(' + n2(deg) + ')' : '');
                tp.push('<text transform="' + tr + '" y="' + n2(off) + '" font-size="' + n2(size) + '"'
                    + (anchor !== 'start' ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(t[6]) + '</text>');
            }
            if (tp.length) parts.push('<g font-family="' + DRAW_FONT + '" fill="#000000">' + tp.join('') + '</g>');
        }
        parts.push('</g>');
        return parts.join('\n');
    }

    var api = { buildMarkingSvg: buildMarkingSvg, areaOutlinePoints: areaOutlinePoints, escapeXml: esc };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.svgWrite = api; }
})(typeof window !== 'undefined' ? window : globalThis);
