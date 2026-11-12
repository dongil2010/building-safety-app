/**
 * 마킹 DXF 쓰기 (2026-11-12) — 순수 모듈(화면·DOM 없음)
 * 벡터 PDF 내보내기와 같은 「그리기 계획」(plans, legendPlan)을 R12(AC1009) ASCII DXF 글자로 바꾼다.
 * - 쓰는 객체: LINE, POLYLINE/VERTEX/SEQEND, CIRCLE, TEXT, SOLID 만 (R12 에서 확실히 열리는 것)
 * - 한글은 \U+XXXX 로 적어 파일 전체가 ASCII → 어느 캐드에서나 안 깨짐
 * - 좌표: 호출쪽이 toWorld(ix, iy)로 「그림 픽셀 → DXF 좌표(y 위로)」를 준다. unitPerPx = 픽셀 1칸의 DXF 길이.
 */
(function (root) {
    'use strict';

    var LAYERS = [
        { name: 'BSA_PIN_BOX', aci: 1 },
        { name: 'BSA_PIN_TEXT', aci: 1 },
        { name: 'BSA_LEADER', aci: 1 },
        { name: 'BSA_AREA', aci: 1 },
        { name: 'BSA_LEGEND', aci: 8 },
        { name: 'BSA_REF', aci: 8 }
    ];
    var FONT_FILE = 'malgun.ttf';
    var TEXT_STYLE = 'BSA_KR';

    /* ---------- 색: 16진수 → 가장 가까운 AutoCAD 색 번호(ACI) ---------- */

    var _aciTable = null;

    function hsvToRgb(h, s, v) {
        var c = v * s;
        var hp = (h % 360) / 60;
        var x = c * (1 - Math.abs((hp % 2) - 1));
        var r = 0, g = 0, b = 0;
        if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
        else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
        var m = v - c;
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    /** ACI 표 만들기: 1~9 표준색 + 10~249 색상환(24색 × 10단계) + 250~255 회색 */
    function buildAciTable() {
        if (_aciTable) return _aciTable;
        var t = [
            [1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255],
            [5, 0, 0, 255], [6, 255, 0, 255], [7, 255, 255, 255], [8, 128, 128, 128], [9, 192, 192, 192]
        ];
        var sat = [1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1, 0.5];
        var val = [1, 1, 0.65, 0.65, 0.5, 0.5, 0.3, 0.3, 0.15, 0.15];
        for (var i = 10; i <= 249; i++) {
            var g = Math.floor((i - 10) / 10);
            var k = (i - 10) % 10;
            var c = hsvToRgb(g * 15, sat[k], val[k]);
            t.push([i, c[0], c[1], c[2]]);
        }
        [51, 91, 132, 173, 214, 255].forEach(function (gv, j) { t.push([250 + j, gv, gv, gv]); });
        _aciTable = t;
        return t;
    }

    function parseHex(hex) {
        var s = String(hex == null ? '' : hex).trim().replace(/^#/, '');
        if (s.length === 3) s = s.split('').map(function (c) { return c + c; }).join('');
        if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
        var n = parseInt(s, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /** 가장 가까운 ACI (1~255). 읽을 수 없는 색은 7. 0·256은 절대 안 돌려준다 */
    function hexToAci(hex) {
        var rgb = parseHex(hex);
        if (!rgb) return 7;
        if (rgb[0] < 20 && rgb[1] < 20 && rgb[2] < 20) return 7; // 검정은 캐드 기본색(7)
        var table = buildAciTable();
        var best = 7, bestD = Infinity;
        for (var i = 0; i < table.length; i++) {
            var e = table[i];
            var dr = rgb[0] - e[1], dg = rgb[1] - e[2], db = rgb[2] - e[3];
            // 사람 눈에 가깝게 초록에 가중치를 조금 더
            var d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
            if (d < bestD) { bestD = d; best = e[0]; }
        }
        return best;
    }

    /* ---------- 글자·숫자 ---------- */

    /** ASCII 이외는 \U+XXXX 로. 서로게이트 쌍(이모지 등)은 ? 로 */
    function encodeText(s) {
        var str = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ');
        var out = '';
        for (var i = 0; i < str.length; i++) {
            var cc = str.charCodeAt(i);
            if (cc >= 0xD800 && cc <= 0xDFFF) { // 서로게이트
                if (cc <= 0xDBFF) i++;
                out += '?';
            } else if (cc < 32 || cc === 127) {
                out += ' ';
            } else if (cc > 126) {
                out += '\\U+' + ('0000' + cc.toString(16).toUpperCase()).slice(-4);
            } else {
                out += str.charAt(i);
            }
        }
        if (out.length > 250) out = out.slice(0, 250);
        return out;
    }

    function num(n) {
        var v = Number(n);
        if (!isFinite(v)) return null;
        var s = v.toFixed(6);
        if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
        if (s === '-0' || s === '') s = '0';
        return s;
    }

    function finite() {
        for (var i = 0; i < arguments.length; i++) if (!isFinite(Number(arguments[i])) || arguments[i] === null || arguments[i] === '') return false;
        return true;
    }

    /* ---------- 작은 도형 도우미 ---------- */

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

    /** 선분을 사각형 안으로 자르기(Liang-Barsky). 밖이면 null */
    function clipLineToRect(x1, y1, x2, y2, minX, minY, maxX, maxY) {
        var dx = x2 - x1, dy = y2 - y1;
        var t0 = 0, t1 = 1;
        var p = [-dx, dx, -dy, dy];
        var q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];
        for (var i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return null; continue; }
            var r = q[i] / p[i];
            if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
            else { if (r < t0) return null; if (r < t1) t1 = r; }
        }
        return { x1: x1 + t0 * dx, y1: y1 + t0 * dy, x2: x1 + t1 * dx, y2: y1 + t1 * dy };
    }

    /* ---------- 본체 ---------- */

    function buildMarkingDxf(opts) {
        opts = opts || {};
        var plans = Array.isArray(opts.plans) ? opts.plans.filter(Boolean) : [];
        var legendPlan = opts.legendPlan || null;
        var refSegments = Array.isArray(opts.refSegments) ? opts.refSegments : [];
        var toWorldFn = typeof opts.toWorld === 'function' ? opts.toWorld : function (x, y) { return { x: x, y: -y }; };
        var upp = Number(opts.unitPerPx);
        if (!(upp > 0) || !isFinite(upp)) upp = 1;

        var ents = []; // 엔티티 줄(문자열 배열)
        var ext = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

        function grow(x, y) {
            if (x < ext.minX) ext.minX = x;
            if (x > ext.maxX) ext.maxX = x;
            if (y < ext.minY) ext.minY = y;
            if (y > ext.maxY) ext.maxY = y;
        }

        function W(ix, iy) {
            if (!finite(ix, iy)) return null;
            var w = toWorldFn(Number(ix), Number(iy));
            if (!w || !finite(w.x, w.y)) return null;
            return { x: Number(w.x), y: Number(w.y) };
        }

        function g(code, value) { ents.push(String(code)); ents.push(String(value)); }

        function head(type, layer, aci, ltype) {
            g(0, type);
            g(8, layer);
            if (ltype) g(6, ltype);
            if (aci) g(62, aci);
        }

        function pt(code0, p) { // 10/20/30 형태
            g(code0, num(p.x)); g(code0 + 10, num(p.y)); g(code0 + 20, '0');
            grow(p.x, p.y);
        }

        function addLine(layer, aci, a, b, ltype) {
            if (!a || !b) return;
            head('LINE', layer, aci, ltype);
            pt(10, a); pt(11, b);
        }

        function addPoly(layer, aci, pts, closed, ltype) {
            if (!pts || pts.length < 2) return;
            for (var i = 0; i < pts.length; i++) if (!pts[i]) return;
            head('POLYLINE', layer, aci, ltype);
            g(66, 1);
            g(10, '0'); g(20, '0'); g(30, '0');
            g(70, closed ? 1 : 0);
            pts.forEach(function (p) {
                g(0, 'VERTEX'); g(8, layer);
                pt(10, p);
            });
            g(0, 'SEQEND'); g(8, layer);
        }

        function addCircle(layer, aci, c, r) {
            if (!c || !(r > 0)) return;
            head('CIRCLE', layer, aci);
            pt(10, c);
            g(40, num(r));
            grow(c.x - r, c.y - r); grow(c.x + r, c.y + r);
        }

        function addTriangle(layer, aci, a, b, c) {
            if (!a || !b || !c) return;
            head('SOLID', layer, aci);
            pt(10, a); pt(11, b); pt(12, c); pt(13, c);
        }

        /** 가운데 맞춤 글자 (72=1 가운데, 73=2 가운데줄 → 위치는 11/21 점) */
        function addText(layer, aci, text, c, height) {
            if (!c) return;
            var s = encodeText(text);
            if (!s) return;
            var h = Number(height);
            if (!(h > 0) || !isFinite(h)) return;
            head('TEXT', layer, aci);
            pt(10, c);
            g(40, num(h));
            g(1, s);
            g(7, TEXT_STYLE);
            g(72, 1);
            g(73, 2);
            pt(11, c);
        }

        /* ----- 참고선(원본 도면 선) ----- */
        refSegments.forEach(function (s) {
            if (!s) return;
            var a = W(s.x1 != null ? s.x1 : s[0], s.y1 != null ? s.y1 : s[1]);
            var b = W(s.x2 != null ? s.x2 : s[2], s.y2 != null ? s.y2 : s[3]);
            addLine('BSA_REF', 8, a, b);
        });

        /* ----- 영역 마킹 한 개 ----- */
        function addArea(area, aci) {
            if (!area) return;
            var isLine = area.shape === 'polyline';
            var outline = areaOutlinePoints(area);
            if (outline.length < (isLine ? 2 : 3)) return;
            var fillStyle = area.fillStyle === 'hatch' || area.fillStyle === 'none' ? area.fillStyle : 'solid';
            var dashed = area.borderStyle === 'dashed';

            // 빗금: 바깥 사각형 안에 45도 선(벡터 PDF와 같음). 솔리드 채우기는 바깥선만
            if (!isLine && fillStyle === 'hatch') {
                var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                outline.forEach(function (p) {
                    if (!finite(p.x, p.y)) return;
                    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
                });
                var rw = maxX - minX, rh = maxY - minY;
                if (isFinite(rw) && isFinite(rh) && rw >= 0 && rh >= 0) {
                    var step = 9;
                    while ((rw + 2 * rh) / step > 1500) step *= 2; // 선이 너무 많아지지 않게
                    for (var i = -rh; i <= rw + rh; i += step) {
                        var seg = clipLineToRect(minX + i, minY, minX + i + rh, maxY, minX, minY, maxX, maxY);
                        if (!seg) continue;
                        addLine('BSA_AREA', aci, W(seg.x1, seg.y1), W(seg.x2, seg.y2));
                    }
                }
            }

            addPoly('BSA_AREA', aci, outline.map(function (p) { return W(p.x, p.y); }), !isLine, dashed ? 'DASHED' : null);

            // 손그림(자유 선·사각형·타원)
            (Array.isArray(area.drawings) ? area.drawings : []).forEach(function (st) {
                var pts = (st && st.points) || [];
                if (pts.length < 1) return;
                var type = st.type || 'path';
                if ((type === 'rect' || type === 'ellipse') && pts.length >= 2) {
                    var x1 = Math.min(pts[0].x, pts[1].x), y1 = Math.min(pts[0].y, pts[1].y);
                    var x2 = Math.max(pts[0].x, pts[1].x), y2 = Math.max(pts[0].y, pts[1].y);
                    var poly = type === 'rect'
                        ? [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]
                        : ellipsePoly((x1 + x2) / 2, (y1 + y2) / 2, Math.max((x2 - x1) / 2, 0.5), Math.max((y2 - y1) / 2, 0.5), 0, 40);
                    addPoly('BSA_AREA', aci, poly.map(function (p) { return W(p.x, p.y); }), true);
                } else {
                    var wp = pts.map(function (p) { return W(p.x, p.y); });
                    addPoly('BSA_AREA', aci, wp, type === 'polygon' && wp.length >= 3);
                }
            });
        }

        /* ----- 핀 박스·지시선 ----- */
        plans.forEach(function (p) {
            var aci = hexToAci(p.color);
            var fontH = Math.max(0.1, Number(p.fontSize) || 12) * upp;

            var areaList = (Array.isArray(p.areas) && p.areas.length) ? p.areas : (p.area ? [p.area] : []);
            areaList.forEach(function (a) { addArea(a, aci); });

            (p.leaders || []).forEach(function (L) {
                if (!L) return;
                var route = (L.route || []).map(function (q) { return W(q.x, q.y); });
                addPoly('BSA_LEADER', aci, route, false);
                if (L.skipArrowHead) return;
                var tip = W(L.tipX, L.tipY);
                if (!tip) return;
                var headLenPx = Number(L.headLen) || 11;
                if (L.useCircleTip) {
                    addCircle('BSA_LEADER', aci, tip, Math.max(0.6 * upp, 4.5 * upp * (headLenPx / 11)));
                    return;
                }
                var stemEnd = route.length && route[route.length - 1] ? route[route.length - 1] : tip;
                var ang = Math.atan2(tip.y - stemEnd.y, tip.x - stemEnd.x);
                if (!isFinite(ang) || (Math.abs(tip.x - stemEnd.x) < 1e-9 && Math.abs(tip.y - stemEnd.y) < 1e-9)) {
                    var d = W(Number(L.tipX) + (L.ux || 1), Number(L.tipY) + (L.uy || 0));
                    ang = d ? Math.atan2(d.y - tip.y, d.x - tip.x) : 0;
                }
                var hl = Math.max(2.5 * upp, headLenPx * upp);
                addTriangle('BSA_LEADER', aci, tip,
                    { x: tip.x - hl * Math.cos(ang - Math.PI / 6), y: tip.y - hl * Math.sin(ang - Math.PI / 6) },
                    { x: tip.x - hl * Math.cos(ang + Math.PI / 6), y: tip.y - hl * Math.sin(ang + Math.PI / 6) });
            });

            if (!finite(p.boxX, p.boxY, p.boxW, p.boxH)) return;
            var bx = Number(p.boxX), by = Number(p.boxY), bw = Number(p.boxW), bh = Number(p.boxH);
            var l = bx - bw / 2, r = bx + bw / 2, t = by - bh / 2, b = by + bh / 2;
            addPoly('BSA_PIN_BOX', aci, [W(l, t), W(r, t), W(r, b), W(l, b)], true);
            var textAci = p.fill ? 7 : aci;
            if (p.typeCallout && p.typeLabel) {
                var c1 = p.col1W != null ? Number(p.col1W) : bw * 0.28;
                addLine('BSA_PIN_BOX', aci, W(l + c1, t), W(l + c1, b));
                addText('BSA_PIN_TEXT', textAci, String(p.label || 'NO.01'), W(l + c1 / 2, by), fontH);
                addText('BSA_PIN_TEXT', textAci, String(p.typeLabel), W(l + c1 + (bw - c1) / 2, by), fontH);
            } else {
                addText('BSA_PIN_TEXT', textAci, String(p.label || 'NO.01'), W(bx, by), fontH);
            }
        });

        /* ----- 범례 표 ----- */
        if (legendPlan && legendPlan.items && legendPlan.items.length && finite(legendPlan.boxX, legendPlan.boxY, legendPlan.boxW, legendPlan.boxH)) {
            var lx = Number(legendPlan.boxX), ly = Number(legendPlan.boxY);
            var lw = Number(legendPlan.boxW), lh = Number(legendPlan.boxH);
            var col1W = Number(legendPlan.col1W) || lw * 0.4;
            var col2W = Number(legendPlan.col2W) || (lw - col1W);
            var headerH = Number(legendPlan.headerRowH) || 0;
            var rowH = Number(legendPlan.rowH) || 0;
            var grayAci = 8;
            var headerAci = hexToAci('#64748b');
            var legFont = Math.max(4, Number(legendPlan.fontSize) || 12) * upp;

            addPoly('BSA_LEGEND', grayAci, [W(lx, ly), W(lx + lw, ly), W(lx + lw, ly + lh), W(lx, ly + lh)], true);
            addLine('BSA_LEGEND', grayAci, W(lx + col1W, ly), W(lx + col1W, ly + lh));
            addLine('BSA_LEGEND', grayAci, W(lx, ly + headerH), W(lx + lw, ly + headerH));
            for (var i = 1; i < legendPlan.items.length; i++) {
                var yy = ly + headerH + i * rowH;
                addLine('BSA_LEGEND', grayAci, W(lx, yy), W(lx + lw, yy));
            }
            addText('BSA_LEGEND', headerAci, '구분', W(lx + col1W / 2, ly + headerH / 2), legFont);
            addText('BSA_LEGEND', headerAci, '내 용', W(lx + col1W + col2W / 2, ly + headerH / 2), legFont);
            legendPlan.items.forEach(function (item, k) {
                var cy = ly + headerH + k * rowH + rowH / 2;
                var ia = hexToAci(item.color);
                addText('BSA_LEGEND', ia, item.colorName, W(lx + col1W / 2, cy), legFont);
                addText('BSA_LEGEND', ia, item.label, W(lx + col1W + col2W / 2, cy), legFont);
            });
        }

        /* ----- 파일 조립 ----- */
        var hasGeom = isFinite(ext.minX);
        var eMin = hasGeom ? { x: ext.minX, y: ext.minY } : { x: 0, y: 0 };
        var eMax = hasGeom ? { x: ext.maxX, y: ext.maxY } : { x: 1, y: 1 };

        var out = [];
        function o(code, value) { out.push(String(code)); out.push(String(value)); }
        // 점선: 한 칸 길이를 그림 픽셀 기준으로(PDF 점선과 비슷하게)
        var dash = 8 * upp, gap = 5 * upp;

        o(0, 'SECTION'); o(2, 'HEADER');
        o(9, '$ACADVER'); o(1, 'AC1009');
        o(9, '$EXTMIN'); o(10, num(eMin.x)); o(20, num(eMin.y)); o(30, '0');
        o(9, '$EXTMAX'); o(10, num(eMax.x)); o(20, num(eMax.y)); o(30, '0');
        o(0, 'ENDSEC');

        o(0, 'SECTION'); o(2, 'TABLES');
        o(0, 'TABLE'); o(2, 'LTYPE'); o(70, 2);
        o(0, 'LTYPE'); o(2, 'CONTINUOUS'); o(70, 0); o(3, 'Solid line'); o(72, 65); o(73, 0); o(40, '0');
        o(0, 'LTYPE'); o(2, 'DASHED'); o(70, 0); o(3, 'Dashed __ __ __'); o(72, 65); o(73, 2);
        o(40, num(dash + gap)); o(49, num(dash)); o(49, num(-gap));
        o(0, 'ENDTAB');

        o(0, 'TABLE'); o(2, 'LAYER'); o(70, LAYERS.length + 1);
        o(0, 'LAYER'); o(2, '0'); o(70, 0); o(62, 7); o(6, 'CONTINUOUS');
        LAYERS.forEach(function (ly2) {
            o(0, 'LAYER'); o(2, ly2.name); o(70, 0); o(62, ly2.aci); o(6, 'CONTINUOUS');
        });
        o(0, 'ENDTAB');

        o(0, 'TABLE'); o(2, 'STYLE'); o(70, 1);
        o(0, 'STYLE'); o(2, TEXT_STYLE); o(70, 0); o(40, '0'); o(41, '1'); o(50, '0'); o(71, 0); o(42, '2.5'); o(3, FONT_FILE); o(4, ''); // 4 = 큰 글꼴(없음) — R12 STYLE 형식대로 빈 값이라도 적는다
        o(0, 'ENDTAB');
        o(0, 'ENDSEC');

        o(0, 'SECTION'); o(2, 'BLOCKS'); o(0, 'ENDSEC');

        o(0, 'SECTION'); o(2, 'ENTITIES');
        var text = out.join('\r\n') + '\r\n' + (ents.length ? ents.join('\r\n') + '\r\n' : '');
        text += ['0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n'; // 마지막 줄도 줄바꿈으로 끝낸다(일부 캐드가 요구)
        return text;
    }

    var api = {
        buildMarkingDxf: buildMarkingDxf,
        hexToAci: hexToAci,
        encodeText: encodeText,
        areaOutlinePoints: areaOutlinePoints,
        LAYERS: LAYERS.map(function (l) { return l.name; })
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.dxfWrite = api; }
})(typeof window !== 'undefined' ? window : globalThis);
