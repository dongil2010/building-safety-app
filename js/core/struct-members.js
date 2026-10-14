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
 *
 * 구조도 그림(2026-10-14): state.structOverlays[층키] = { url, storagePath, x0, y0, x1, y1, fit:{a,b,tx,ty}, color, updatedAt }
 *   - 구조도 PDF의 한 부분(x0~y1, 구조도 쪽 좌표)을 색 입힌 반투명 그림(PNG)으로 만들어 클라우드(Storage)에 올리고,
 *     층 도면에는 fit(기준점 2개 맞춤)으로 겹친다. 층 묶음에는 주소·위치만 싣는다(그림 본문은 Storage).
 *   - 뺄 때는 { removed:true, updatedAt } 을 남겨 다른 기기에서도 빠진다. 합칠 때는 updatedAt 나중 것이 이긴다.
 * 구조도 페이지 → 앱 넘기기: 같은 브라우저의 IndexedDB(bsa_struct_handoff) — 그림이 커서 localStorage에는 못 담는다.
 */
(function (root) {
    'use strict';

    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#d97706', '슬래브': '#16a34a' };

    function ensureMaps(st) {
        if (!st.structMembers || typeof st.structMembers !== 'object') st.structMembers = {};
        if (!st.deletedStructMemberIds || typeof st.deletedStructMemberIds !== 'object') st.deletedStructMemberIds = {};
        if (!st.deletedStructMemberAt || typeof st.deletedStructMemberAt !== 'object') st.deletedStructMemberAt = {};
        if (!st.structOverlays || typeof st.structOverlays !== 'object') st.structOverlays = {};
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

    /**
     * 되돌리기·다시 하기(2026-10-14): 부재 하나를 기록해 둔 모습(rec)으로 맞춘다. rec = null 이면 없앤다.
     * 바뀐 부재만 건드리므로 그 사이 다른 기기에서 들어온 부재는 그대로 둔다. → 바뀌었으면 true
     */
    function applyRecord(st, floorKey, id, rec, now) {
        if (!st || !floorKey || !id) return false;
        var cur = listFor(st, floorKey).find(function (d) { return d.id === id; });
        if (!rec) return !!(cur && remove(st, floorKey, id));
        if (cur) return !!update(st, floorKey, id, { x: rec.x, y: rec.y, w: rec.w, h: rec.h, type: rec.type, label: rec.label }, now);
        return !!add(st, floorKey, rec, { id: id, createdAt: rec.createdAt, now: now });
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

    // ---------- 구조도 그림 ----------
    function validOverlay(o) {
        return !!(o && !o.removed && typeof o.url === 'string' && o.url && o.fit
            && [o.x0, o.y0, o.x1, o.y1, o.fit.a, o.fit.b, o.fit.tx, o.fit.ty].every(function (v) { return Number.isFinite(Number(v)); })
            && o.x1 > o.x0 && o.y1 > o.y0);
    }
    /** 이 층 구조도 그림(없거나 뺐으면 null) */
    function overlayFor(st, floorKey) {
        var o = ((st && st.structOverlays) || {})[floorKey];
        return validOverlay(o) ? o : null;
    }
    /** 구조도 그림 두기 → 둔 것(시각은 앞으로만 간다) */
    function setOverlay(st, floorKey, rec, now) {
        if (!st || !floorKey || !rec) return null;
        ensureMaps(st);
        var prev = st.structOverlays[floorKey];
        var o = { url: rec.url, storagePath: rec.storagePath || '', x0: num(rec.x0), y0: num(rec.y0), x1: num(rec.x1), y1: num(rec.y1),
            fit: { a: Number(rec.fit && rec.fit.a), b: Number(rec.fit && rec.fit.b), tx: Number(rec.fit && rec.fit.tx), ty: Number(rec.fit && rec.fit.ty) },
            color: rec.color || '', updatedAt: nextStamp(prev && prev.updatedAt, now) };
        if (!validOverlay(o)) return null;
        st.structOverlays[floorKey] = o;
        return o;
    }
    /** 구조도 그림 빼기(다른 기기에도 빠지게 표시를 남긴다) → 뺀 그림 또는 null */
    function removeOverlay(st, floorKey, now) {
        var o = overlayFor(st, floorKey);
        if (!o) return null;
        st.structOverlays[floorKey] = { removed: true, updatedAt: nextStamp(o.updatedAt, now) };
        return o;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedStructMemberIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedStructMemberAt) || {})[floorKey] || {},
            overlay: ((st && st.structOverlays) || {})[floorKey] || null
        };
    }
    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length) || pack.overlay));
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
        // 구조도 그림: 늦게 바꾼 쪽이 이긴다
        var inc = pack.overlay;
        if (inc && (inc.removed || validOverlay(inc)) && Number.isFinite(Number(inc.updatedAt))) {
            var cur = st.structOverlays[floorKey];
            if (!cur || Number(inc.updatedAt) > (Number(cur.updatedAt) || 0)) st.structOverlays[floorKey] = Object.assign({}, inc);
        }
        return true;
    }

    // ---------- 구조도 페이지 → 앱 넘기기(같은 브라우저 IndexedDB) ----------
    var HANDOFF_DB = 'bsa_struct_handoff', HANDOFF_STORE = 'h';
    function handoffDb() {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') { reject(new Error('이 브라우저는 IndexedDB를 쓸 수 없습니다.')); return; }
            var req = indexedDB.open(HANDOFF_DB, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore(HANDOFF_STORE); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    function handoffTx(mode, fn) {
        return handoffDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(HANDOFF_STORE, mode);
                var out = fn(tx.objectStore(HANDOFF_STORE));
                tx.oncomplete = function () { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            });
        });
    }
    /** data: { at, fileName, refs:[{x,y},{x,y}], members:[…], overlay?:{ blob, x0,y0,x1,y1, color } } */
    function saveHandoff(data) { return handoffTx('readwrite', function (s) { return s.put(data, 'latest'); }); }
    function loadHandoff() { return handoffTx('readonly', function (s) { return s.get('latest'); }); }

    var api = { TYPES: TYPES, COLORS: COLORS, ensureMaps: ensureMaps, listFor: listFor, hasAny: hasAny, add: add, update: update, remove: remove,
        applyRecord: applyRecord, clear: clear, countsByType: countsByType, fitTwoPoints: fitTwoPoints, applyFit: applyFit, importMembers: importMembers,
        hitTest: hitTest, overlayFor: overlayFor, setOverlay: setOverlay, removeOverlay: removeOverlay,
        saveHandoff: saveHandoff, loadHandoff: loadHandoff, packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structMembers = api; }
})(typeof window !== 'undefined' ? window : null);
