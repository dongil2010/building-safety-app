/**
 * 2026-10-20 층 도면을 다른 크기의 도면으로 바꿨을 때(잘못 넣은 도면 지우고 새 도면 등) 마킹 위치 맞추기.
 * 마킹 좌표는 도면 이미지 px 기준이라, 크기가 다른 도면으로 바뀌면 마킹이 어긋난다.
 *  - noteDims(store, key, w, h): 이 기기가 본 층 도면 크기를 기억하고, 바뀌었으면 { from, to } 를 돌려준다.
 *  - scaleDefect(d, sx, sy): 마킹 한 개의 위치 칸을 비율대로 옮긴다(내용은 그대로).
 * 지우지 않는다. 맞출지는 사용자가 고른다.
 */
(function (root) {
    'use strict';

    function readMap(store, key) {
        if (!store) return {};
        try { return JSON.parse(store.getItem(key) || '{}') || {}; } catch (_e) { return {}; }
    }

    /** 바뀌었으면 { from:{w,h}, to:{w,h} }, 처음 보거나 같으면 null. 기록은 항상 새 크기로 갱신 */
    function noteDims(store, storageKey, floorKey, w, h, sig) {
        if (!floorKey || !(w > 0) || !(h > 0)) return null;
        const map = readMap(store, storageKey);
        const prev = map[floorKey];
        const W = Math.round(w);
        const H = Math.round(h);
        let change = null;
        const sigChanged = sig == null || prev == null || String(prev.sig || '') !== String(sig);
        if (prev && sigChanged && prev.w > 0 && prev.h > 0 && (Math.abs(prev.w - W) > 1 || Math.abs(prev.h - H) > 1)) {
            change = { from: { w: prev.w, h: prev.h }, to: { w: W, h: H } };
        }
        map[floorKey] = { w: W, h: H, sig: sig == null ? '' : String(sig), at: Date.now() };
        if (store) { try { store.setItem(storageKey, JSON.stringify(map)); } catch (_e) { /* ignore */ } }
        return change;
    }

    const SCALAR_X = ['x', 'targetX', 'areaX1', 'areaX2', 'boxX', 'labelX'];
    const SCALAR_Y = ['y', 'targetY', 'areaY1', 'areaY2', 'boxY', 'labelY'];
    const POINT_LISTS = ['points', 'vertices', 'areaPoints'];

    function scalePointList(list, sx, sy) {
        if (!Array.isArray(list)) return list;
        return list.map(function (p) {
            if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number') return [p[0] * sx, p[1] * sy].concat(p.slice(2));
            if (p && typeof p === 'object' && typeof p.x === 'number' && typeof p.y === 'number') {
                return Object.assign({}, p, { x: p.x * sx, y: p.y * sy });
            }
            if (Array.isArray(p)) return scalePointList(p, sx, sy);
            return p;
        });
    }

    function scaleDefect(d, sx, sy) {
        if (!d || !(sx > 0) || !(sy > 0)) return false;
        let changed = false;
        SCALAR_X.forEach(function (k) { if (typeof d[k] === 'number' && Number.isFinite(d[k])) { d[k] = d[k] * sx; changed = true; } });
        SCALAR_Y.forEach(function (k) { if (typeof d[k] === 'number' && Number.isFinite(d[k])) { d[k] = d[k] * sy; changed = true; } });
        if (typeof d.width === 'number' && Number.isFinite(d.width)) { d.width *= sx; changed = true; }
        if (typeof d.height === 'number' && Number.isFinite(d.height)) { d.height *= sy; changed = true; }
        POINT_LISTS.forEach(function (k) { if (Array.isArray(d[k])) { d[k] = scalePointList(d[k], sx, sy); changed = true; } });
        if (Array.isArray(d.areaDrawings)) {
            d.areaDrawings = d.areaDrawings.map(function (a) {
                if (!a || typeof a !== 'object') return a;
                const o = Object.assign({}, a);
                POINT_LISTS.forEach(function (k) { if (Array.isArray(o[k])) o[k] = scalePointList(o[k], sx, sy); });
                SCALAR_X.forEach(function (k) { if (typeof o[k] === 'number') o[k] *= sx; });
                SCALAR_Y.forEach(function (k) { if (typeof o[k] === 'number') o[k] *= sy; });
                return o;
            });
            changed = true;
        }
        return changed;
    }

    /**
     * 층 도면 삭제 때 그 층의 도면 위 표시(가이드·개수 점·메모·부재·평가 구역)를 묘비와 함께 지운다.
     * 안 지우면 같은 층 코드로 새 도면을 넣었을 때 옛 표시가 엉뚱한 자리에 되살아났다(2026-10-13).
     */
    function purgeFloorMarkings(st, floorKey, B, now) {
        var out = { guides: 0, counts: 0, memos: 0, members: 0, evalUnits: 0 };
        if (!st || !floorKey || !B) return out;
        function ids(map) { return ((st[map] || {})[floorKey] || []).map(function (r) { return r && r.id; }).filter(Boolean); }
        if (B.guideShapes) ids('guideShapes').forEach(function (id) { if (B.guideShapes.remove(st, floorKey, id)) out.guides++; });
        if (B.memberCount) ids('memberCounts').forEach(function (id) { if (B.memberCount.remove(st, floorKey, id)) out.counts++; });
        if (B.drawingMemo) ids('drawingMemos').forEach(function (id) { if (B.drawingMemo.deleteMemo(st, floorKey, id)) out.memos++; });
        if (B.structMembers) {
            ids('structMembers').forEach(function (id) { if (B.structMembers.remove(st, floorKey, id)) out.members++; });
            if (B.structMembers.removeOverlay && (st.structOverlays || {})[floorKey]) B.structMembers.removeOverlay(st, floorKey, now);
        }
        if (B.evalUnits) ids('evalUnits').forEach(function (id) { if (B.evalUnits.deleteUnit(st, floorKey, id, [], now) >= 0) out.evalUnits++; });
        return out;
    }

    const api = { noteDims: noteDims, scaleDefect: scaleDefect, scalePointList: scalePointList, purgeFloorMarkings: purgeFloorMarkings };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.drawingResize = api; }
})(typeof window !== 'undefined' ? window : globalThis);
