/**
 * 도면 교체 후 마킹 위치 맞추기 — 순수 계산 (2026-11-12)
 *
 * PDF 도면을 DXF로 바꾸면 테두리·도면 범위가 달라져 그림 좌표(4000px 기준)가 어긋난다.
 * 도면 내용 자체는 같은 축척이므로, 옛 도면과 새 도면에서 같은 점 두 쌍을 찍으면
 * 「이동 + 배율 (+ 회전)」 한 번으로 그 층 마킹 전체를 옮길 수 있다.
 *
 * 변환 T:  x' = a·x + c·y + e,   y' = b·x + d·y + f   (캔버스 transform(a,b,c,d,e,f)과 같은 순서)
 *   - 2점(solveSimilarity): 닮음 변환 — c = −b, d = a (a = s·cosθ, b = s·sinθ). 작은 기울기는 0으로 버린다.
 *   - 3점(solveAffine3, 2026-11-16): 세 쌍을 정확히 지나는 아핀 변환 — 회전(작은 기울기 포함)·가로세로 배율 차이·
 *     뒤집힘까지 맞춘다. 세 점이 한 줄에 있으면 못 구함.
 *   c·d가 없는 옛 변환 객체는 c = −b, d = a 로 읽는다.
 *
 * 브라우저(app/11-cad-import.js)가 화면·저장을 맡고, 여기는 계산만 한다(node 시험: scripts/test-marking-align.js).
 */
(function (root) {
    'use strict';

    /** 이 각도(도)보다 작게 기울면 손 떨림으로 보고 회전 없이 맞춘다 — 도면이 살짝 기울어 핀 글자가 비뚤어지는 일 방지 */
    var DEFAULT_SNAP_ANGLE_DEG = 1.5;

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    /**
     * 두 쌍(옛 → 새)으로 닮음 변환을 구한다. 못 구하면(두 점이 너무 가까움) null.
     * opts.snapAngleDeg: 이보다 작은 회전은 0으로(기본 1.5°). opts.allowRotation === false 면 늘 회전 없음.
     */
    function solveSimilarity(oldPts, newPts, opts) {
        opts = opts || {};
        if (!oldPts || !newPts || oldPts.length < 2 || newPts.length < 2) return null;
        var p1 = oldPts[0], p2 = oldPts[1], q1 = newPts[0], q2 = newPts[1];
        var pdx = p2.x - p1.x, pdy = p2.y - p1.y;
        var qdx = q2.x - q1.x, qdy = q2.y - q1.y;
        var pl = Math.hypot(pdx, pdy), ql = Math.hypot(qdx, qdy);
        if (!(pl > 1e-6) || !(ql > 1e-6)) return null;
        var s = ql / pl;
        var theta = Math.atan2(qdy, qdx) - Math.atan2(pdy, pdx);
        while (theta > Math.PI) theta -= 2 * Math.PI;
        while (theta < -Math.PI) theta += 2 * Math.PI;
        var snapDeg = isNum(opts.snapAngleDeg) ? opts.snapAngleDeg : DEFAULT_SNAP_ANGLE_DEG;
        var rotated = true;
        if (opts.allowRotation === false || Math.abs(theta * 180 / Math.PI) < snapDeg) {
            theta = 0;
            rotated = false;
        }
        var a = s * Math.cos(theta), b = s * Math.sin(theta);
        // 이동: 두 점의 가운데끼리 맞춘다(회전을 0으로 고정했을 때도 두 점 오차를 반씩 나눔)
        var pcx = (p1.x + p2.x) / 2, pcy = (p1.y + p2.y) / 2;
        var qcx = (q1.x + q2.x) / 2, qcy = (q1.y + q2.y) / 2;
        var e = qcx - (a * pcx - b * pcy);
        var f = qcy - (b * pcx + a * pcy);
        return withInfo({ a: a, b: b, c: -b, d: a, e: e, f: f, mode: 2 });
    }

    function mC(T) { return isNum(T.c) ? T.c : -T.b; }
    function mD(T) { return isNum(T.d) ? T.d : T.a; }

    /** 행렬에서 화면에 보일 정보(배율·회전·뒤집힘·가로세로 배율)를 채운다 */
    function withInfo(T) {
        var c = mC(T), d = mD(T);
        var sx = Math.hypot(T.a, T.b), sy = Math.hypot(c, d);
        var det = T.a * d - T.b * c;
        T.c = c; T.d = d;
        T.scaleX = sx;
        T.scaleY = sy;
        T.scale = Math.sqrt(Math.abs(det));
        T.angleDeg = Math.atan2(T.b, T.a) * 180 / Math.PI;
        T.mirrored = det < 0;
        T.rotated = Math.abs(T.angleDeg) > 1e-9;
        // 기울어짐(가로축과 세로축이 직각에서 벗어난 정도, 도) — 3점을 손으로 찍은 오차가 여기 나온다
        var cosk = (sx > 0 && sy > 0) ? (T.a * c + T.b * d) / (sx * sy) : 0;
        T.skewDeg = Math.asin(Math.max(-1, Math.min(1, cosk))) * 180 / Math.PI;
        return T;
    }

    /**
     * 세 쌍(옛 → 새)으로 아핀 변환을 구한다(세 점을 정확히 지남). 세 점이 거의 한 줄이면 null.
     * 회전은 작아도 버리지 않는다 — 도면이 살짝 돌아간 경우를 맞추려고 쓰는 모드다.
     */
    function solveAffine3(oldPts, newPts) {
        if (!oldPts || !newPts || oldPts.length < 3 || newPts.length < 3) return null;
        var p = oldPts, q = newPts;
        var ux = p[1].x - p[0].x, uy = p[1].y - p[0].y;
        var vx = p[2].x - p[0].x, vy = p[2].y - p[0].y;
        var det = ux * vy - uy * vx;
        var lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy), lw = Math.hypot(p[2].x - p[1].x, p[2].y - p[1].y);
        var lmax = Math.max(lu, lv, lw);
        // 삼각형 높이가 가장 긴 변의 3% 미만이면 거의 한 줄 — 조금만 잘못 찍어도 크게 틀어진다
        if (!(lmax > 1e-6) || Math.abs(det) / lmax < 0.03 * lmax) return null;
        var qux = q[1].x - q[0].x, quy = q[1].y - q[0].y;
        var qvx = q[2].x - q[0].x, qvy = q[2].y - q[0].y;
        if (Math.abs(qux * qvy - quy * qvx) < 1e-6) return null;
        // [a c; b d] · [u v] = [qu qv]  →  M = Q · P⁻¹
        var i11 = vy / det, i12 = -vx / det, i21 = -uy / det, i22 = ux / det;
        var a = qux * i11 + qvx * i21, c = qux * i12 + qvx * i22;
        var b = quy * i11 + qvy * i21, d = quy * i12 + qvy * i22;
        var e = q[0].x - (a * p[0].x + c * p[0].y);
        var f = q[0].y - (b * p[0].x + d * p[0].y);
        return withInfo({ a: a, b: b, c: c, d: d, e: e, f: f, mode: 3 });
    }

    /** 찍은 점 수(2 또는 3)에 맞춰 변환을 구한다 */
    function solveTransform(oldPts, newPts, opts) {
        var n = Math.min((oldPts || []).length, (newPts || []).length);
        if (n >= 3) return solveAffine3(oldPts, newPts);
        return solveSimilarity(oldPts, newPts, opts);
    }

    /**
     * T 뒤에 화면 미세 조정을 더한 새 변환.
     * 중심 (cx,cy) 기준으로 배율 ds·회전 dr(도, 시계 방향 +: 화면 y가 아래라서) 후 이동 dx·dy.
     */
    function adjustTransform(T, opt) {
        if (!T) return null;
        opt = opt || {};
        var ds = isNum(opt.ds) && opt.ds > 0 ? opt.ds : 1;
        var dr = isNum(opt.dr) ? opt.dr * Math.PI / 180 : 0;
        var cx = isNum(opt.cx) ? opt.cx : 0, cy = isNum(opt.cy) ? opt.cy : 0;
        var dx = isNum(opt.dx) ? opt.dx : 0, dy = isNum(opt.dy) ? opt.dy : 0;
        // p' = c + ds·R·(T(p) − c) + d
        var k = ds * Math.cos(dr), m = ds * Math.sin(dr);
        var c0 = mC(T), d0 = mD(T);
        var a = k * T.a - m * T.b, b = m * T.a + k * T.b;
        var c = k * c0 - m * d0, d = m * c0 + k * d0;
        var ex = T.e - cx, fy = T.f - cy;
        var e = cx + k * ex - m * fy + dx;
        var f = cy + m * ex + k * fy + dy;
        return withInfo({ a: a, b: b, c: c, d: d, e: e, f: f, mode: T.mode || 2 });
    }

    function applyPoint(T, x, y) {
        return { x: T.a * x + mC(T) * y + T.e, y: T.b * x + mD(T) * y + T.f };
    }

    function round2(v) { return Math.round(v * 100) / 100; }

    function mapXY(T, obj, kx, ky) {
        if (!obj || !isNum(obj[kx]) || !isNum(obj[ky])) return;
        var p = applyPoint(T, obj[kx], obj[ky]);
        obj[kx] = round2(p.x);
        obj[ky] = round2(p.y);
    }

    function mapPointList(T, list) {
        if (!Array.isArray(list)) return;
        list.forEach(function (p) { mapXY(T, p, 'x', 'y'); });
    }

    function isPolyArea(d) {
        return (d.areaShape === 'polygon' || d.areaShape === 'polyline')
            && Array.isArray(d.areaPoints) && d.areaPoints.length >= 2;
    }

    /** 결함 마킹 하나를 옮긴다(제자리). 핀 박스·지시 끝·영역(사각·타원·다각형·선)·영역 안 손그림 */
    function transformDefect(d, T) {
        if (!d || !T) return;
        mapXY(T, d, 'x', 'y');
        mapXY(T, d, 'targetX', 'targetY');
        if (isNum(d.areaX1) && isNum(d.areaY1) && isNum(d.areaX2) && isNum(d.areaY2)) {
            if (isPolyArea(d)) {
                mapPointList(T, d.areaPoints);
                var xs = d.areaPoints.map(function (p) { return Number(p.x); });
                var ys = d.areaPoints.map(function (p) { return Number(p.y); });
                d.areaX1 = Math.min.apply(null, xs); d.areaX2 = Math.max.apply(null, xs);
                d.areaY1 = Math.min.apply(null, ys); d.areaY2 = Math.max.apply(null, ys);
            } else {
                // 사각·타원: 가운데를 옮기고, 도형의 가로축·세로축을 T로 보내 크기·기울기를 구한다
                // (3점 모드의 가로세로 배율 차이·뒤집힘도 반영. 기울어짐(skew)은 직사각형으로 근사)
                var x1 = Math.min(d.areaX1, d.areaX2), x2 = Math.max(d.areaX1, d.areaX2);
                var y1 = Math.min(d.areaY1, d.areaY2), y2 = Math.max(d.areaY1, d.areaY2);
                var c = applyPoint(T, (x1 + x2) / 2, (y1 + y2) / 2);
                var hadAngle = isNum(Number(d.areaAngle)) && d.areaAngle != null && d.areaAngle !== '';
                var th0 = (hadAngle ? Number(d.areaAngle) : 0) * Math.PI / 180;
                var tc = mC(T), td = mD(T);
                var uxX = T.a * Math.cos(th0) + tc * Math.sin(th0), uxY = T.b * Math.cos(th0) + td * Math.sin(th0);
                var uyX = -T.a * Math.sin(th0) + tc * Math.cos(th0), uyY = -T.b * Math.sin(th0) + td * Math.cos(th0);
                var hw = (x2 - x1) / 2 * Math.hypot(uxX, uxY), hh = (y2 - y1) / 2 * Math.hypot(uyX, uyY);
                d.areaX1 = round2(c.x - hw); d.areaX2 = round2(c.x + hw);
                d.areaY1 = round2(c.y - hh); d.areaY2 = round2(c.y + hh);
                var ang = Math.atan2(uxY, uxX) * 180 / Math.PI;
                if (Math.abs(ang) < 1e-9) ang = 0;
                if (hadAngle || ang !== 0) {
                    ang = ((ang % 360) + 540) % 360 - 180;
                    d.areaAngle = round2(ang);
                }
                // 옛 앱이 다각형 점을 남겨 둔 사각형도 같이 옮겨 둔다(모양을 바꿨다 되돌릴 때 엉뚱한 곳에 안 나오게)
                if (Array.isArray(d.areaPoints)) mapPointList(T, d.areaPoints);
            }
        } else if (Array.isArray(d.areaPoints)) {
            mapPointList(T, d.areaPoints);
        }
        if (Array.isArray(d.areaDrawings)) {
            d.areaDrawings.forEach(function (st) { if (st) mapPointList(T, st.points); });
        }
    }

    /** 비파괴 핀(강도·탄산화·기울기·실측 등) */
    function transformNdtItem(it, T) {
        if (!it || !T) return;
        mapXY(T, it, 'x', 'y');
        mapXY(T, it, 'boxX', 'boxY');
        mapXY(T, it, 'targetX', 'targetY');
    }

    /** 부동침하·부재변위 구역(박스 + 측점들) */
    function transformDispGroup(g, T) {
        if (!g || !T) return;
        mapXY(T, g, 'boxX', 'boxY');
        mapPointList(T, g.points);
    }

    /**
     * 구조 부재 기호 하나(2026-11-26) — { x, y(가운데), w(가로·막대 길이), h(세로·두께), ang?(도) }.
     * 가운데를 옮기고, 부재의 가로축·세로축을 T로 보내 길이·두께·각도를 구한다.
     * 90°·180° 근처로 돌면 ang 없이 가로·세로를 바꿔 둔다(곧은 기둥·보가 비스듬한 막대로 바뀌지 않게).
     * 제자리에서 바꾸지 않고 바뀐 값 { x, y, w, h, ang } 을 돌려준다(저장은 BSA.structMembers.update로).
     */
    function transformStructMember(m, T) {
        if (!m || !T || !isNum(Number(m.x)) || !isNum(Number(m.y))) return null;
        var c = applyPoint(T, Number(m.x), Number(m.y));
        var th = (Number(m.ang) || 0) * Math.PI / 180;
        var tc = mC(T), td = mD(T);
        var ux = T.a * Math.cos(th) + tc * Math.sin(th), uy = T.b * Math.cos(th) + td * Math.sin(th);
        var vx = -T.a * Math.sin(th) + tc * Math.cos(th), vy = -T.b * Math.sin(th) + td * Math.cos(th);
        var w = Number(m.w) * Math.hypot(ux, uy), h = Number(m.h) * Math.hypot(vx, vy);
        var ang = Math.atan2(uy, ux) * 180 / Math.PI;
        var q = Math.round(ang / 90);
        if (Math.abs(ang - q * 90) < 0.05) {
            if (Math.abs(q) % 2 === 1) { var t = w; w = h; h = t; }
            ang = 0;
        } else {
            ang = ((ang % 180) + 270) % 180 - 90;   // 막대는 앞뒤가 같다 → -90~90
        }
        return { x: round2(c.x), y: round2(c.y), w: round2(w), h: round2(h), ang: round2(ang) };
    }

    /**
     * 구조도 그림 맞춤(fit: X = a·x − b·y + tx, Y = b·x + a·y + ty)에 T를 이어 붙인다 → 새 fit.
     * fit은 닮음 변환만 담으므로 3점 변환(가로세로 배율 차이)은 가로축 기준으로 근사한다.
     */
    function composeOverlayFit(fit, T) {
        if (!fit || !T || ![fit.a, fit.b, fit.tx, fit.ty].every(function (v) { return isNum(Number(v)); })) return null;
        var fa = Number(fit.a), fb = Number(fit.b);
        var tc = mC(T), td = mD(T);
        // 열1 = M·(a, b), 열2 = M·(−b, a) → 닮음꼴 (A, B)는 두 열의 평균
        var A1 = T.a * fa + tc * fb, B1 = T.b * fa + td * fb;
        var A2 = -T.b * fb + td * fa, B2 = T.a * fb - tc * fa;   // 열2 = (−B, A) → B = −열2.x, A = 열2.y
        var p = applyPoint(T, Number(fit.tx), Number(fit.ty));
        var A = (A1 + A2) / 2, B = (B1 + B2) / 2;
        return { a: A, b: B, tx: p.x, ty: p.y };
    }

    var POS_KEYS = ['x', 'y', 'targetX', 'targetY', 'boxX', 'boxY', 'areaX1', 'areaY1', 'areaX2', 'areaY2', 'areaAngle'];
    var POS_LIST_KEYS = ['areaPoints', 'areaDrawings', 'points'];

    /** 위치 칸만 떠 둔다(취소·미리보기 다시 계산용). 내용·사진은 건드리지 않는다 */
    function snapshotPositions(obj) {
        var snap = { has: {} };
        if (!obj) return snap;
        POS_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) { snap.has[k] = true; snap[k] = obj[k]; }
        });
        POS_LIST_KEYS.forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                snap.has[k] = true;
                snap[k] = obj[k] == null ? obj[k] : JSON.parse(JSON.stringify(obj[k]));
            }
        });
        return snap;
    }

    function restorePositions(obj, snap) {
        if (!obj || !snap) return;
        POS_KEYS.concat(POS_LIST_KEYS).forEach(function (k) {
            if (snap.has[k]) {
                var v = snap[k];
                obj[k] = (v != null && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v;
            } else if (Object.prototype.hasOwnProperty.call(obj, k)) {
                delete obj[k];
            }
        });
    }

    /** 마킹이 하나라도 좌표를 가지고 있나 */
    function hasPosition(obj) {
        if (!obj) return false;
        return (isNum(obj.x) && isNum(obj.y)) || (isNum(obj.targetX) && isNum(obj.targetY))
            || (isNum(obj.boxX) && isNum(obj.boxY)) || (isNum(obj.areaX1) && isNum(obj.areaY1))
            || (Array.isArray(obj.points) && obj.points.length > 0);
    }

    /**
     * 옛 도면 그림 → 빨간 선만 남은 투명 그림 픽셀(제자리). 흰 바탕은 투명, 어두운 선일수록 진하게.
     * data: RGBA Uint8ClampedArray(ImageData.data)
     */
    function tintGhostPixels(data, rgb) {
        var r = rgb ? rgb[0] : 220, g = rgb ? rgb[1] : 38, b = rgb ? rgb[2] : 38;
        for (var i = 0; i < data.length; i += 4) {
            var lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            var alpha = Math.max(0, Math.min(255, (255 - lum) * 1.6)) * (data[i + 3] / 255);
            data[i] = r; data[i + 1] = g; data[i + 2] = b;
            data[i + 3] = alpha < 18 ? 0 : alpha;
        }
        return data;
    }

    /**
     * 그림의 바깥 테두리 상자(2026-11-16). lum: 밝기 0~255 배열(w×h). 어두운 점이 가로·세로로 길게 이어진
     * 줄(테두리 선) 중 가장 바깥 줄을 찾는다. 도면 안 글자·먼지는 짧아서 무시된다. 못 찾으면 null.
     * 반환 {x0,y0,x1,y1}(픽셀, x1·y1은 마지막 어두운 줄).
     */
    function findFrameBox(lum, w, h, opts) {
        opts = opts || {};
        var dark = isNum(opts.darkLum) ? opts.darkLum : 200;
        var ratio = isNum(opts.lineRatio) ? opts.lineRatio : 0.6;
        if (!lum || !(w > 8) || !(h > 8) || lum.length < w * h) return null;
        var rows = new Array(h), cols = new Array(w), i, x, y;
        for (i = 0; i < h; i++) rows[i] = 0;
        for (i = 0; i < w; i++) cols[i] = 0;
        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                if (lum[y * w + x] < dark) { rows[y]++; cols[x]++; }
            }
        }
        var maxR = Math.max.apply(null, rows), maxC = Math.max.apply(null, cols);
        if (!(maxR > 0) || !(maxC > 0)) return null;
        var y0 = -1, y1 = -1, x0 = -1, x1 = -1;
        for (y = 0; y < h; y++) if (rows[y] >= maxR * ratio) { if (y0 < 0) y0 = y; y1 = y; }
        for (x = 0; x < w; x++) if (cols[x] >= maxC * ratio) { if (x0 < 0) x0 = x; x1 = x; }
        if (x0 < 0 || y0 < 0) return null;
        if ((x1 - x0) < w * 0.3 || (y1 - y0) < h * 0.3) return null;
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }

    /** 옛 테두리 상자 → 새 테두리 상자: 왼쪽 위·오른쪽 아래 모서리 두 쌍(solveSimilarity에 그대로 넣는다) */
    function frameCornerPairs(oldBox, newBox) {
        if (!oldBox || !newBox) return null;
        return {
            oldPts: [{ x: oldBox.x0, y: oldBox.y0 }, { x: oldBox.x1, y: oldBox.y1 }],
            newPts: [{ x: newBox.x0, y: newBox.y0 }, { x: newBox.x1, y: newBox.y1 }]
        };
    }

    var api = {
        findFrameBox: findFrameBox,
        frameCornerPairs: frameCornerPairs,
        DEFAULT_SNAP_ANGLE_DEG: DEFAULT_SNAP_ANGLE_DEG,
        solveSimilarity: solveSimilarity,
        solveAffine3: solveAffine3,
        solveTransform: solveTransform,
        adjustTransform: adjustTransform,
        applyPoint: applyPoint,
        transformDefect: transformDefect,
        transformNdtItem: transformNdtItem,
        transformDispGroup: transformDispGroup,
        transformStructMember: transformStructMember,
        composeOverlayFit: composeOverlayFit,
        snapshotPositions: snapshotPositions,
        restorePositions: restorePositions,
        hasPosition: hasPosition,
        tintGhostPixels: tintGhostPixels
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.markingAlign = api; }
})(typeof window !== 'undefined' ? window : globalThis);
