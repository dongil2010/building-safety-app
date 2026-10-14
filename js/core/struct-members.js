/**
 * 구조 부재 레이어(2026-10-14) — 구조도에서 가져온 기둥·벽·거더·빔·슬래브 기호를 층 도면 위에 둔다.
 * 결함이 아니다: 화면 전용. 한글·PDF·그림 내보내기·엑셀에 안 들어간다(DOM 위에만 그림).
 * 부재 수 점(member-count)·가이드(guide-shapes)와는 따로 둔 별도 자료다.
 *
 * state.structMembers[층키] = [{ id, type, label, x, y, w, h, createdAt, updatedAt }]
 *   - x,y = 기호 가운데, w,h = 기호 크기. 도면 원본 픽셀 좌표(결함 x/y와 같은 좌표계).
 *   - 층 묶음(pack.structMembers)에 실어 가이드와 같은 규칙(updatedAt·묘비)으로 합친다.
 *   - 고칠 때마다 updatedAt = max(now, 이전+1) — 늦게 고친 기기가 이긴다.
 * 화면(겹쳐 보기·옮기기·가져오기)은 js/tabs/struct-layer.js — 쓸 때만 불러온다.
 */
(function (root) {
    'use strict';

    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#d97706', '슬래브': '#16a34a' };

    function ensureMaps(st) {
        if (!st.structMembers || typeof st.structMembers !== 'object') st.structMembers = {};
        if (!st.deletedStructMemberIds || typeof st.deletedStructMemberIds !== 'object') st.deletedStructMemberIds = {};
        if (!st.deletedStructMemberAt || typeof st.deletedStructMemberAt !== 'object') st.deletedStructMemberAt = {};
        return st;
    }
    function num(v) { return Math.round(Number(v) * 10) / 10; }
    function valid(d) {
        return !!(d && d.id && TYPES.indexOf(d.type) >= 0
            && [d.x, d.y, d.w, d.h].every(function (v) { return Number.isFinite(Number(v)); }) && d.w > 0 && d.h > 0);
    }
    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.structMembers || {})[floorKey] || []).filter(valid);
    }
    function hasAny(st, floorKey) { return listFor(st, floorKey).length > 0; }
    function nextStamp(prev, now) { return Math.max(Number(now) || Date.now(), (Number(prev) || 0) + 1); }
    var _seq = 0;
    function newId(now) { _seq = (_seq + 1) % 100000; return 'st_' + now + '_' + _seq + '_' + Math.random().toString(36).slice(2, 7); }

    /** 부재 하나 추가 → 부재. rec: { type, label?, x, y, w, h } */
    function add(st, floorKey, rec, opts) {
        if (!st || !floorKey || !rec) return null;
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var d = { id: o.id || rec.id || newId(now), type: rec.type, label: String(rec.label == null ? '' : rec.label).slice(0, 12),
            x: num(rec.x), y: num(rec.y), w: num(rec.w), h: num(rec.h), createdAt: Number(o.createdAt) || now, updatedAt: now };
        if (!valid(d)) return null;
        ensureMaps(st);
        if (!st.structMembers[floorKey]) st.structMembers[floorKey] = [];
        var ids = st.deletedStructMemberIds[floorKey];
        if (ids && ids.indexOf(d.id) >= 0) {
            // 되살리기(되돌리기): 묘비보다 늦은 시각이어야 합칠 때 이긴다
            var at = (st.deletedStructMemberAt[floorKey] || {})[d.id];
            d.updatedAt = nextStamp(at, now);
            st.deletedStructMemberIds[floorKey] = ids.filter(function (k) { return k !== d.id; });
            if (st.deletedStructMemberAt[floorKey]) delete st.deletedStructMemberAt[floorKey][d.id];
        }
        st.structMembers[floorKey] = st.structMembers[floorKey].filter(function (x) { return x && x.id !== d.id; }).concat([d]);
        return d;
    }

    /** 옮기기·종류·기호 고치기 → 고친 부재 */
    function update(st, floorKey, id, patch, now) {
        var d = listFor(st, floorKey).find(function (x) { return x.id === id; });
        if (!d || !patch) return null;
        ['x', 'y', 'w', 'h'].forEach(function (k) { if (patch[k] != null && Number.isFinite(Number(patch[k]))) d[k] = num(patch[k]); });
        if (patch.type != null && TYPES.indexOf(patch.type) >= 0) d.type = patch.type;
        if (patch.label != null) d.label = String(patch.label).slice(0, 12);
        d.updatedAt = nextStamp(d.updatedAt, now);
        return d;
    }

    function remove(st, floorKey, id) {
        if (!st || !floorKey || !id) return null;
        ensureMaps(st);
        var list = st.structMembers[floorKey] || [];
        var rec = list.find(function (d) { return d && d.id === id; });
        if (!rec) return null;
        st.structMembers[floorKey] = list.filter(function (d) { return d && d.id !== id; });
        var ids = st.deletedStructMemberIds[floorKey] || [];
        if (ids.indexOf(id) < 0) ids = ids.concat([id]);
        st.deletedStructMemberIds[floorKey] = ids;
        if (!st.deletedStructMemberAt[floorKey]) st.deletedStructMemberAt[floorKey] = {};
        // 묘비 = 이 기기가 본 마지막 수정 시각(다른 기기가 그 뒤에 고친 것은 살아남는다 — sync-merge 규칙)
        st.deletedStructMemberAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return Object.assign({}, rec);
    }

    /** 이 층 부재를 모두 지운다(묘비를 남겨 다른 기기에도 지워진다) → 지운 개수 */
    function clear(st, floorKey) {
        var list = listFor(st, floorKey).slice();
        list.forEach(function (d) { remove(st, floorKey, d.id); });
        return list.length;
    }

    function countsByType(list) {
        var out = {};
        TYPES.forEach(function (t) { out[t] = 0; });
        (list || []).forEach(function (d) { if (out[d.type] != null) out[d.type]++; });
        return out;
    }

    /**
     * 구조도 좌표 → 층 도면 좌표 맞춤(늘이기·돌리기·옮기기, 뒤집기는 없음).
     * 구조도에서 찍은 기준점 둘(s1, s2)이 층 도면의 두 점(a1, a2)에 오도록 한다.
     * → { a, b, tx, ty, scale, angle } : X = a·x − b·y + tx, Y = b·x + a·y + ty. 두 기준점이 너무 가까우면 null.
     */
    function fitTwoPoints(s1, s2, a1, a2) {
        var sx = s2.x - s1.x, sy = s2.y - s1.y, ax = a2.x - a1.x, ay = a2.y - a1.y;
        var den = sx * sx + sy * sy;
        if (!(den > 1e-6) || !(ax * ax + ay * ay > 1e-6)) return null;
        var a = (ax * sx + ay * sy) / den, b = (ay * sx - ax * sy) / den;
        return { a: a, b: b, tx: a1.x - (a * s1.x - b * s1.y), ty: a1.y - (b * s1.x + a * s1.y),
            scale: Math.hypot(a, b), angle: Math.atan2(b, a) * 180 / Math.PI };
    }
    /** 맞춤을 부재 하나에 적용 → { x, y, w, h }. 90°쯤 돌아간 맞춤이면 가로·세로 크기를 바꾼다. */
    function applyFit(fit, m) {
        var quarter = Math.abs(Math.round(fit.angle / 90)) % 2 === 1;
        return { x: fit.a * m.x - fit.b * m.y + fit.tx, y: fit.b * m.x + fit.a * m.y + fit.ty,
            w: (quarter ? m.h : m.w) * fit.scale, h: (quarter ? m.w : m.h) * fit.scale };
    }

    /**
     * 구조도에서 찾은 부재를 이 층에 들인다. 이 층에 있던 부재는 모두 지우고(묘비) 새로 넣는다.
     * members: [{ type, label, x, y, w, h }] (구조도 좌표), fit: fitTwoPoints 결과 → 넣은 개수
     */
    function importMembers(st, floorKey, members, fit, now) {
        if (!st || !floorKey || !fit) return 0;
        clear(st, floorKey);
        var t = Number(now) || Date.now();
        var n = 0;
        (members || []).forEach(function (m) {
            var p = applyFit(fit, m);
            if (add(st, floorKey, { type: m.type, label: m.label, x: p.x, y: p.y, w: p.w, h: p.h }, { now: t })) n++;
        });
        return n;
    }

    /** 도면 좌표 점에 걸린 부재(작은 것 우선). pad = 여유(도면 픽셀) */
    function hitTest(list, x, y, pad) {
        var best = null, bestArea = Infinity;
        (list || []).forEach(function (d) {
            if (Math.abs(x - d.x) > d.w / 2 + (pad || 0) || Math.abs(y - d.y) > d.h / 2 + (pad || 0)) return;
            var area = d.w * d.h;
            if (area < bestArea) { bestArea = area; best = d; }
        });
        return best;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedStructMemberIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedStructMemberAt) || {})[floorKey] || {}
        };
    }
    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length)));
    }
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one((pack.items || []).filter(valid)), st.structMembers, one(pack.deletedIds || []), st.deletedStructMemberIds,
            one(pack.deletedAt || {}), st.deletedStructMemberAt);
        st.structMembers = r.ndtData;
        st.deletedStructMemberIds = r.deletedNdtIds;
        st.deletedStructMemberAt = r.deletedNdtAt || {};
        return true;
    }

    var api = { TYPES: TYPES, COLORS: COLORS, ensureMaps: ensureMaps, listFor: listFor, hasAny: hasAny, add: add, update: update, remove: remove,
        clear: clear, countsByType: countsByType, fitTwoPoints: fitTwoPoints, applyFit: applyFit, importMembers: importMembers,
        hitTest: hitTest, packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structMembers = api; }
})(typeof window !== 'undefined' ? window : null);
