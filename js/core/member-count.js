/**
 * 부재 수 세기(2026-10-13) — 도면을 눌러 기둥·벽·거더·빔·슬래브 점을 찍어 부재 개수를 센다.
 * 결함이 아니다: 결함 번호·조사표·한글/PDF 출력에 안 들어간다(화면 전용 점).
 *
 * state.memberCounts[층키] = [{ id, type, x, y, zoneNo?, createdAt, updatedAt }]
 *   - x,y: 도면 원본 픽셀 좌표. zoneNo: 번호로 나눈 층에서 구역 번호(층 전체면 비움)
 *   - 층 묶음(pack.memberCounts)에 실어 메모·평가단위와 같은 규칙(updatedAt·묘비)으로 합친다.
 */
(function (root) {
    'use strict';

    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var KEYS = { c: '기둥', w: '벽', g: '거더', b: '빔', s: '슬래브' };
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#0891b2', '슬래브': '#16a34a' };
    var SHORT = { '기둥': 'C', '벽': 'W', '거더': 'G', '빔': 'B', '슬래브': 'S' };

    function ensureMaps(st) {
        if (!st.memberCounts || typeof st.memberCounts !== 'object') st.memberCounts = {};
        if (!st.deletedMemberCountIds || typeof st.deletedMemberCountIds !== 'object') st.deletedMemberCountIds = {};
        if (!st.deletedMemberCountAt || typeof st.deletedMemberCountAt !== 'object') st.deletedMemberCountAt = {};
        return st;
    }

    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.memberCounts || {})[floorKey] || []).filter(function (d) { return d && d.id && TYPES.indexOf(d.type) >= 0; });
    }

    /** 점 하나 추가 → 점 */
    function add(st, floorKey, type, x, y, opts) {
        if (!st || !floorKey || TYPES.indexOf(type) < 0) return null;
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        ensureMaps(st);
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var d = { id: o.id || ('mc_' + now + '_' + Math.random().toString(36).slice(2, 8)), type: type,
            x: Math.round(Number(x) * 10) / 10, y: Math.round(Number(y) * 10) / 10, createdAt: now, updatedAt: now };
        var zn = Math.floor(Number(o.zoneNo) || 0);
        if (zn > 0) d.zoneNo = zn;
        if (!st.memberCounts[floorKey]) st.memberCounts[floorKey] = [];
        st.memberCounts[floorKey].push(d);
        // 되살리기(되돌리기)면 묘비를 걷는다
        var ids = st.deletedMemberCountIds[floorKey];
        if (ids && ids.indexOf(d.id) >= 0) {
            st.deletedMemberCountIds[floorKey] = ids.filter(function (k) { return k !== d.id; });
            if (st.deletedMemberCountAt[floorKey]) delete st.deletedMemberCountAt[floorKey][d.id];
        }
        return d;
    }

    /** 점 지우기 + 묘비 → 지운 점(되돌리기용) 또는 null */
    function remove(st, floorKey, id) {
        if (!st || !floorKey || !id) return null;
        ensureMaps(st);
        var list = st.memberCounts[floorKey] || [];
        var rec = list.find(function (d) { return d && d.id === id; });
        if (!rec) return null;
        st.memberCounts[floorKey] = list.filter(function (d) { return d && d.id !== id; });
        var ids = st.deletedMemberCountIds[floorKey] || [];
        if (ids.indexOf(id) < 0) ids = ids.concat([id]);
        st.deletedMemberCountIds[floorKey] = ids;
        if (!st.deletedMemberCountAt[floorKey]) st.deletedMemberCountAt[floorKey] = {};
        st.deletedMemberCountAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return rec;
    }

    /** 화면 좌표로 가장 가까운 점(반지름 r 안). toScreen(d) → {sx, sy} */
    function hitTest(list, sx, sy, r, toScreen) {
        var best = null, bd = Infinity;
        (list || []).forEach(function (d) {
            var p = toScreen(d);
            var dist = Math.hypot(p.sx - sx, p.sy - sy);
            if (dist <= r && dist < bd) { bd = dist; best = d; }
        });
        return best;
    }

    /** 층 안 종류별 순번(점에 찍는 숫자) { id: n } */
    function seqNumbers(list) {
        var n = {};
        var out = {};
        (list || []).slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }).forEach(function (d) {
            n[d.type] = (n[d.type] || 0) + 1;
            out[d.id] = n[d.type];
        });
        return out;
    }

    function countsByType(list) {
        var out = {};
        TYPES.forEach(function (t) { out[t] = 0; });
        (list || []).forEach(function (d) { if (out[d.type] != null) out[d.type]++; });
        return out;
    }

    /**
     * 평가단위별 부재 수: { unitId: { 기둥: n, … } }
     * 층 전체 → 그 층 점 모두. 번호로 나눈 층 → 점의 zoneNo 단위(번호 없는 점은 unassigned).
     * E: eval-units api. → { byUnit, unassigned:[{floorCode, floorLabel, count}] }
     */
    function unitCounts(bldg, st, floors, E) {
        var out = { byUnit: {}, unassigned: [] };
        if (!E || !bldg) return out;
        var plan = E.planOf(bldg);
        var byNo = {};
        plan.units.forEach(function (u) { byNo[Number(u.no)] = u; });
        var bump = function (unitId, type) {
            var r = out.byUnit[unitId] = out.byUnit[unitId] || countsByType([]);
            r[type] = (r[type] || 0) + 1;
        };
        (floors || []).forEach(function (f) {
            var list = listFor(st, f.floorKey);
            if (!list.length) return;
            var m = plan.floors[f.floorCode];
            var lost = 0;
            list.forEach(function (d) {
                if (m && m.mode === 'whole' && plan.units.some(function (u) { return u.id === m.unitId; })) bump(m.unitId, d.type);
                else if (m && m.mode === 'split' && d.zoneNo && byNo[d.zoneNo]) bump(byNo[d.zoneNo].id, d.type);
                else lost++;
            });
            if (lost) out.unassigned.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: lost });
        });
        return out;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedMemberCountIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedMemberCountAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length)));
    }

    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one(pack.items || []), st.memberCounts, one(pack.deletedIds || []), st.deletedMemberCountIds,
            one(pack.deletedAt || {}), st.deletedMemberCountAt);
        st.memberCounts = r.ndtData;
        st.deletedMemberCountIds = r.deletedNdtIds;
        st.deletedMemberCountAt = r.deletedNdtAt || {};
        return true;
    }

    var api = { TYPES: TYPES, KEYS: KEYS, COLORS: COLORS, SHORT: SHORT, ensureMaps: ensureMaps, listFor: listFor, add: add, remove: remove,
        hitTest: hitTest, seqNumbers: seqNumbers, countsByType: countsByType, unitCounts: unitCounts,
        packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.memberCount = api; }
})(typeof window !== 'undefined' ? window : null);
