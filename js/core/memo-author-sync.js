/**
 * 2026-10-23 계정별 메모 저장(「메모는 서버에 저장」·「계정별로 따로」).
 * 주석(drawingMemos)·손글씨(sketchMemos)를 작성 계정마다 문서 하나에 따로 올린다:
 *   …/rounds/{회차}/(dongs/{동}/)floors/MEMOS_BY_{uid}   (기존 규칙의 floors/{floorCode} 자리 — 규칙 변경 불필요)
 * 문서: { kind:'memosByAuthor', byUid, by, buildingId, payload: JSON, updatedAt }
 * payload: { v:1, memos: { 층코드: [주석…] }, sketches: [손글씨…], deleted: { id: 지운 시각 } }
 * - 각 계정은 자기 문서만 쓴다 → 다른 계정 메모를 덮거나 지울 수 없다. 문서는 절대 지우지 않는다.
 * - 읽을 때는 모든 계정 문서 + 예전 공용 칸(층 묶음 memos/sketches)을 모두 합친다.
 * 브라우저(window.BSA.memoAuthorSync)·node(require) 둘 다.
 */
(function (root) {
    'use strict';
    var PREFIX = 'MEMOS_BY_';
    var KIND = 'memosByAuthor';

    function docIdFor(uid) { return PREFIX + String(uid || '').replace(/[^A-Za-z0-9_-]/g, '_'); }
    function normMe(me) { return { uid: String((me && me.uid) || '').trim(), name: String((me && me.name) || '').trim() }; }
    function isMine(rec, me) {
        var m = normMe(me);
        if (!rec || !m.uid) return false;
        if (rec.byUid) return String(rec.byUid) === m.uid;
        return !!m.name && String(rec.by || '').trim() === m.name;   // 계정 표시 전 옛 메모: 이름이 같으면 내 것
    }
    function stamp(rec, me) {
        var m = normMe(me);
        var o = Object.assign({}, rec);
        if (!o.byUid) o.byUid = m.uid;
        if (!o.by) o.by = m.name;
        return o;
    }

    /** 이 건물(회차별 건물 id)에서 내가 쓴 주석·손글씨 */
    function collectMine(st, bldgId, me, roundCode) {
        var prefix = String(bldgId) + '_';
        var out = { v: 1, memos: {}, sketches: [], deleted: {} };
        var dm = (st && st.drawingMemos) || {};
        Object.keys(dm).forEach(function (k) {
            if (k.indexOf(prefix) !== 0) return;
            var fc = k.slice(prefix.length);
            (dm[k] || []).forEach(function (m) {
                if (m && m.id && isMine(m, me)) (out.memos[fc] = out.memos[fc] || []).push(stamp(m, me));
            });
        });
        var sm = (st && st.sketchMemos) || {};
        Object.keys(sm).forEach(function (k) {
            if (k.indexOf(prefix) !== 0) return;
            (sm[k] || []).forEach(function (m) {
                if (!m || !m.id || !isMine(m, me)) return;
                var o = stamp(m, me);
                if (k !== prefix + roundCode && !o.fromFloor) o.fromFloor = k.slice(prefix.length);
                out.sketches.push(o);
            });
        });
        return out;
    }

    /** 이 건물의 지운 기록(주석·손글씨) { id: 시각 } */
    function collectTombs(st, bldgId) {
        var prefix = String(bldgId) + '_';
        var t = {};
        [['deletedMemoIds', 'deletedMemoAt'], ['deletedSketchIds', 'deletedSketchAt']].forEach(function (pair) {
            var ids = (st && st[pair[0]]) || {};
            var at = (st && st[pair[1]]) || {};
            Object.keys(ids).forEach(function (k) {
                if (k.indexOf(prefix) !== 0) return;
                (ids[k] || []).forEach(function (id) { t[id] = Math.max(t[id] || 0, Number((at[k] || {})[id]) || 1); });
            });
        });
        return t;
    }

    function itemsOf(p) {
        var list = [];
        if (!p) return list;
        Object.keys(p.memos || {}).forEach(function (fc) { (p.memos[fc] || []).forEach(function (m) { if (m && m.id) list.push({ kind: 'memo', fc: fc, rec: m }); }); });
        (p.sketches || []).forEach(function (m) { if (m && m.id) list.push({ kind: 'sketch', rec: m }); });
        return list;
    }

    /**
     * 서버의 내 문서 + 이 기기 내 메모 → 새 내 문서. 같은 id는 updatedAt 나중 것.
     * 지운 기록은 「내 문서에 있던 id」만(남의 메모 지운 기록은 남의 문서에 영향 없음), 시각이 메모보다 나중이면 뺀다.
     */
    function mergeDocs(serverP, localP, localTombs) {
        var byId = {};
        var deleted = Object.assign({}, (serverP && serverP.deleted) || {});
        itemsOf(serverP).concat(itemsOf(localP)).forEach(function (it) {
            var cur = byId[it.rec.id];
            if (!cur || (Number(it.rec.updatedAt) || 0) >= (Number(cur.rec.updatedAt) || 0)) byId[it.rec.id] = it;
        });
        var known = {};
        itemsOf(serverP).forEach(function (it) { known[it.rec.id] = 1; });
        itemsOf(localP).forEach(function (it) { known[it.rec.id] = 1; });
        Object.keys(localTombs || {}).forEach(function (id) {
            if (known[id] || deleted[id]) deleted[id] = Math.max(Number(deleted[id]) || 0, Number(localTombs[id]) || 1);
        });
        var out = { v: 1, memos: {}, sketches: [], deleted: deleted };
        Object.keys(byId).forEach(function (id) {
            var it = byId[id];
            if (deleted[id] && deleted[id] >= (Number(it.rec.updatedAt) || 0)) return;
            if (it.kind === 'memo') (out.memos[it.fc] = out.memos[it.fc] || []).push(it.rec);
            else out.sketches.push(it.rec);
        });
        return out;
    }

    function countItems(p) { return itemsOf(p).length; }

    /** 문서 내용 → 층 묶음 모양(합치기용). { memoPacks: { 층키: pack }, sketchPack } */
    function toPacks(p, bldgId, roundCode, extraFloorKeys) {
        var prefix = String(bldgId) + '_';
        var memoPacks = {};
        var del = (p && p.deleted) || {};
        var delIds = Object.keys(del);
        Object.keys((p && p.memos) || {}).forEach(function (fc) {
            memoPacks[prefix + fc] = { items: p.memos[fc] || [], deletedIds: [], deletedAt: {} };
        });
        (extraFloorKeys || []).forEach(function (k) {
            if (String(k).indexOf(prefix) === 0 && !memoPacks[k]) memoPacks[k] = { items: [], deletedIds: [], deletedAt: {} };
        });
        // 지운 기록은 어느 층 것인지 모르므로 이 건물 모든 층 pack에 같이 실어도 안전(id가 고유)
        Object.keys(memoPacks).forEach(function (k) {
            delIds.forEach(function (id) { if (/^memo_/.test(id)) { memoPacks[k].deletedIds.push(id); memoPacks[k].deletedAt[id] = del[id]; } });
        });
        var sk = { items: (p && p.sketches) || [], deletedIds: [], deletedAt: {} };
        delIds.forEach(function (id) { if (/^sketch_/.test(id)) { sk.deletedIds.push(id); sk.deletedAt[id] = del[id]; } });
        return { memoPacks: memoPacks, sketchPack: sk, sketchKey: prefix + roundCode };
    }

    var api = { PREFIX: PREFIX, KIND: KIND, docIdFor: docIdFor, isMine: isMine, collectMine: collectMine, collectTombs: collectTombs, mergeDocs: mergeDocs, toPacks: toPacks, countItems: countItems };
    root.BSA = root.BSA || {};
    root.BSA.memoAuthorSync = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
