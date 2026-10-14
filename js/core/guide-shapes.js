/**
 * 도면 가이드(2026-10-14) — 기둥·거더·빔 위치를 표시하려고 그리는 사각형·직선.
 * 결함이 아니다: 화면 전용. 한글·PDF·그림 내보내기·엑셀에 안 들어간다(DOM 위에만 그림).
 *
 * state.guideShapes[층키] = [{ id, kind:'rect'|'line', type:'column'|'girder'|'beam', x1, y1, x2, y2, createdAt, updatedAt }]
 *   - type(2026-10-14): 기둥·거더·빔. 예전 가이드엔 없음 → 사각형=기둥, 직선=빔으로 본다(typeOf).
 *   - 좌표: 도면 원본 픽셀. rect는 (x1,y1)-(x2,y2) 맞모서리.
 *   - 층 묶음(pack.guideShapes)에 실어 부재 수 점과 같은 규칙(updatedAt·묘비)으로 합친다.
 *   - 고칠 때마다 updatedAt = max(now, 이전+1) — 늦게 고친 기기가 이긴다.
 */
(function (root) {
    'use strict';

    // circle(2026-10-14): (x1,y1)=중심, (x2,y2)=테두리 한 점. 새로 그리는 기본 도형. rect는 예전 가이드 표시·편집용으로 남김
    var KINDS = ['rect', 'line', 'circle'];
    var TYPES = ['column', 'girder', 'beam'];
    var TYPE_LABELS = { column: '기둥', girder: '거더', beam: '빔' };
    function defaultType(kind) { return kind === 'line' ? 'beam' : 'column'; }
    function typeOf(d) { return (d && TYPES.indexOf(d.type) >= 0) ? d.type : defaultType(d && d.kind); }

    function ensureMaps(st) {
        if (!st.guideShapes || typeof st.guideShapes !== 'object') st.guideShapes = {};
        if (!st.deletedGuideShapeIds || typeof st.deletedGuideShapeIds !== 'object') st.deletedGuideShapeIds = {};
        if (!st.deletedGuideShapeAt || typeof st.deletedGuideShapeAt !== 'object') st.deletedGuideShapeAt = {};
        return st;
    }
    function num(v) { return Math.round(Number(v) * 10) / 10; }
    function valid(d) {
        return !!(d && d.id && KINDS.indexOf(d.kind) >= 0 && [d.x1, d.y1, d.x2, d.y2].every(function (v) { return Number.isFinite(Number(v)); }));
    }
    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.guideShapes || {})[floorKey] || []).filter(valid);
    }
    function nextStamp(prev, now) { return Math.max(Number(now) || Date.now(), (Number(prev) || 0) + 1); }

    function add(st, floorKey, kind, x1, y1, x2, y2, opts) {
        if (!st || !floorKey || KINDS.indexOf(kind) < 0) return null;
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var d = { id: o.id || ('gs_' + now + '_' + Math.random().toString(36).slice(2, 8)), kind: kind,
            type: TYPES.indexOf(o.type) >= 0 ? o.type : defaultType(kind),
            x1: num(x1), y1: num(y1), x2: num(x2), y2: num(y2), createdAt: Number(o.createdAt) || now, updatedAt: now };
        if (!valid(d)) return null;
        ensureMaps(st);
        if (!st.guideShapes[floorKey]) st.guideShapes[floorKey] = [];
        var ids = st.deletedGuideShapeIds[floorKey];
        if (ids && ids.indexOf(d.id) >= 0) {
            // 되살리기(되돌리기): 묘비보다 늦은 시각이어야 합칠 때 이긴다
            var at = (st.deletedGuideShapeAt[floorKey] || {})[d.id];
            d.updatedAt = nextStamp(at, now);
            st.deletedGuideShapeIds[floorKey] = ids.filter(function (k) { return k !== d.id; });
            if (st.deletedGuideShapeAt[floorKey]) delete st.deletedGuideShapeAt[floorKey][d.id];
        }
        st.guideShapes[floorKey] = st.guideShapes[floorKey].filter(function (x) { return x && x.id !== d.id; }).concat([d]);
        return d;
    }

    /** 좌표 고치기(옮기기·크기) → 고친 도형 */
    function update(st, floorKey, id, patch, now) {
        var d = listFor(st, floorKey).find(function (x) { return x.id === id; });
        if (!d || !patch) return null;
        ['x1', 'y1', 'x2', 'y2'].forEach(function (k) { if (patch[k] != null && Number.isFinite(Number(patch[k]))) d[k] = num(patch[k]); });
        if (TYPES.indexOf(patch.type) >= 0) d.type = patch.type;
        d.updatedAt = nextStamp(d.updatedAt, now);
        return d;
    }

    function remove(st, floorKey, id) {
        if (!st || !floorKey || !id) return null;
        ensureMaps(st);
        var list = st.guideShapes[floorKey] || [];
        var rec = list.find(function (d) { return d && d.id === id; });
        if (!rec) return null;
        st.guideShapes[floorKey] = list.filter(function (d) { return d && d.id !== id; });
        var ids = st.deletedGuideShapeIds[floorKey] || [];
        if (ids.indexOf(id) < 0) ids = ids.concat([id]);
        st.deletedGuideShapeIds[floorKey] = ids;
        if (!st.deletedGuideShapeAt[floorKey]) st.deletedGuideShapeAt[floorKey] = {};
        // 묘비 = 이 기기가 본 마지막 수정 시각(다른 기기가 그 뒤에 고친 것은 살아남는다 — sync-merge 규칙)
        st.deletedGuideShapeAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return Object.assign({}, rec);
    }

    /** 점과 선분 거리 */
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay;
        var L = dx * dx + dy * dy;
        var t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    /** 화면 꼭짓점: rect → 4개(0:x1y1 1:x2y1 2:x2y2 3:x1y2), line → 2개. toScreen({x,y}) → {sx,sy} */
    function radiusOf(d) { return Math.hypot(d.x2 - d.x1, d.y2 - d.y1); }
    function screenPoints(d, toScreen) {
        var pts = d.kind === 'rect'
            ? [[d.x1, d.y1], [d.x2, d.y1], [d.x2, d.y2], [d.x1, d.y2]]
            : [[d.x1, d.y1], [d.x2, d.y2]];
        return pts.map(function (p) { return toScreen({ x: p[0], y: p[1] }); });
    }
    function inPoly(px, py, pts) {
        var inside = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            var a = pts[i], b = pts[j];
            if (((a.sy > py) !== (b.sy > py)) && (px < (b.sx - a.sx) * (py - a.sy) / ((b.sy - a.sy) || 1e-9) + a.sx)) inside = !inside;
        }
        return inside;
    }
    /**
     * 화면 좌표로 고르기 → { shape, part } part: 'h0'..'h3'(꼭짓점) | 'body'. 선택된 도형의 꼭짓점을 먼저 본다.
     * 사각형은 테두리 근처나 안쪽(작은 것 우선), 직선은 선 근처.
     */
    function hitTest(list, sx, sy, toScreen, tol, selectedId) {
        tol = tol || 10;
        var sel = (list || []).find(function (d) { return d.id === selectedId; });
        if (sel) {
            var hp = screenPoints(sel, toScreen);
            for (var i = 0; i < hp.length; i++) if (Math.hypot(hp[i].sx - sx, hp[i].sy - sy) <= tol + 4) return { shape: sel, part: 'h' + i };
        }
        var best = null, bestScore = Infinity;
        (list || []).forEach(function (d) {
            var p = screenPoints(d, toScreen);
            if (d.kind === 'circle') {
                var rs = Math.hypot(p[1].sx - p[0].sx, p[1].sy - p[0].sy);
                var dc = Math.hypot(sx - p[0].sx, sy - p[0].sy);
                var sc = Infinity;
                if (Math.abs(dc - rs) <= tol) sc = Math.abs(dc - rs);
                else if (dc < rs) sc = tol + 1 + (Math.PI * rs * rs) / 1e6;
                if (sc < bestScore) { bestScore = sc; best = d; }
                return;
            }
            var edge = Infinity;
            for (var i = 0; i < p.length - (d.kind === 'line' ? 1 : 0); i++) {
                var a = p[i], b = p[(i + 1) % p.length];
                edge = Math.min(edge, segDist(sx, sy, a.sx, a.sy, b.sx, b.sy));
            }
            var score = Infinity;
            if (edge <= tol) score = edge;
            else if (d.kind === 'rect' && inPoly(sx, sy, p)) {
                var area = Math.abs((p[2].sx - p[0].sx) * (p[2].sy - p[0].sy));
                score = tol + 1 + area / 1e6; // 안쪽은 테두리보다 뒤, 작은 사각형 먼저
            }
            if (score < bestScore) { bestScore = score; best = d; }
        });
        return best ? { shape: best, part: 'body' } : null;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedGuideShapeIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedGuideShapeAt) || {})[floorKey] || {}
        };
    }
    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length)));
    }
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one((pack.items || []).filter(valid)), st.guideShapes, one(pack.deletedIds || []), st.deletedGuideShapeIds,
            one(pack.deletedAt || {}), st.deletedGuideShapeAt);
        st.guideShapes = r.ndtData;
        st.deletedGuideShapeIds = r.deletedNdtIds;
        st.deletedGuideShapeAt = r.deletedNdtAt || {};
        return true;
    }

    var api = { KINDS: KINDS, TYPES: TYPES, TYPE_LABELS: TYPE_LABELS, defaultType: defaultType, typeOf: typeOf, radiusOf: radiusOf, ensureMaps: ensureMaps, listFor: listFor, add: add, update: update, remove: remove,
        screenPoints: screenPoints, hitTest: hitTest, packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.guideShapes = api; }
})(typeof window !== 'undefined' ? window : null);
