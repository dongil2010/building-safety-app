/**
 * 도면 교체 후 마킹 위치 맞추기 — 순수 계산 (2026-11-12)
 *
 * PDF 도면을 DXF로 바꾸면 테두리·도면 범위가 달라져 그림 좌표(4000px 기준)가 어긋난다.
 * 도면 내용 자체는 같은 축척이므로, 옛 도면과 새 도면에서 같은 점 두 쌍을 찍으면
 * 「이동 + 배율 (+ 회전)」 한 번으로 그 층 마킹 전체를 옮길 수 있다.
 *
 * 변환 T:  x' = a·x − b·y + e,   y' = b·x + a·y + f   (a = s·cosθ, b = s·sinθ)
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
        return { a: a, b: b, e: e, f: f, scale: s, angleDeg: theta * 180 / Math.PI, rotated: rotated };
    }

    /** T 뒤에 화면 미세 조정(배율 ds는 중심 c 기준, 이동 dx·dy)을 더한 새 변환 */
    function adjustTransform(T, opt) {
        if (!T) return null;
        opt = opt || {};
        var ds = isNum(opt.ds) && opt.ds > 0 ? opt.ds : 1;
        var cx = isNum(opt.cx) ? opt.cx : 0, cy = isNum(opt.cy) ? opt.cy : 0;
        var dx = isNum(opt.dx) ? opt.dx : 0, dy = isNum(opt.dy) ? opt.dy : 0;
        // p' = c + ds·(T(p) − c) + d
        var a = T.a * ds, b = T.b * ds;
        var e = cx + ds * (T.e - cx) + dx;
        var f = cy + ds * (T.f - cy) + dy;
        return { a: a, b: b, e: e, f: f, scale: Math.hypot(a, b), angleDeg: Math.atan2(b, a) * 180 / Math.PI, rotated: !!T.rotated };
    }

    function applyPoint(T, x, y) {
        return { x: T.a * x - T.b * y + T.e, y: T.b * x + T.a * y + T.f };
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
                // 사각·타원: 가운데를 옮기고 크기는 배율만큼, 기울기는 회전만큼
                var x1 = Math.min(d.areaX1, d.areaX2), x2 = Math.max(d.areaX1, d.areaX2);
                var y1 = Math.min(d.areaY1, d.areaY2), y2 = Math.max(d.areaY1, d.areaY2);
                var c = applyPoint(T, (x1 + x2) / 2, (y1 + y2) / 2);
                var hw = (x2 - x1) / 2 * T.scale, hh = (y2 - y1) / 2 * T.scale;
                d.areaX1 = round2(c.x - hw); d.areaX2 = round2(c.x + hw);
                d.areaY1 = round2(c.y - hh); d.areaY2 = round2(c.y + hh);
                if (T.rotated && Math.abs(T.angleDeg) > 1e-9) {
                    var ang = (isNum(Number(d.areaAngle)) ? Number(d.areaAngle) : 0) + T.angleDeg;
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

    var api = {
        DEFAULT_SNAP_ANGLE_DEG: DEFAULT_SNAP_ANGLE_DEG,
        solveSimilarity: solveSimilarity,
        adjustTransform: adjustTransform,
        applyPoint: applyPoint,
        transformDefect: transformDefect,
        transformNdtItem: transformNdtItem,
        transformDispGroup: transformDispGroup,
        snapshotPositions: snapshotPositions,
        restorePositions: restorePositions,
        hasPosition: hasPosition,
        tintGhostPixels: tintGhostPixels
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.markingAlign = api; }
})(typeof window !== 'undefined' ? window : globalThis);
