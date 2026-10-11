/**
 * 도면 메모(2026-10-12) — 층 도면(회차별 건물 id + 층) 위에 붙이는 글 메모.
 *
 * - 결함이 아니다: state.defects와 따로 state.drawingMemos[층키]에 둔다(조사표·한글 번호·통계에 안 들어감).
 * - 동기화: 층 묶음(pack.memos = { items, deletedIds, deletedAt })에 실려 결함과 같은 길로 오간다.
 *   합치기는 비파괴 항목과 같은 규칙(updatedAt 나중 것이 이김, 묘비는 지울 때 본 마지막 수정 시각).
 * - 화면 전용: 캔버스가 아니라 DOM 겹층에 그린다 → 캡처·PDF·한글 출력에 안 들어간다.
 */
(function (root) {
    'use strict';

    var MAX_TEXT = 300;

    function cleanText(s) {
        return String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT);
    }

    function newMemoId(now) {
        return 'memo_' + (Number(now) || Date.now()) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function createMemo(opts) {
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var text = cleanText(o.text);
        if (!text) return null;
        return {
            id: o.id || newMemoId(now),
            x: Math.round(Number(o.x) || 0),
            y: Math.round(Number(o.y) || 0),
            text: text,
            by: o.by || '',
            createdAt: now,
            updatedAt: now
        };
    }

    function ensureMaps(st) {
        if (!st.drawingMemos || typeof st.drawingMemos !== 'object') st.drawingMemos = {};
        if (!st.deletedMemoIds || typeof st.deletedMemoIds !== 'object') st.deletedMemoIds = {};
        if (!st.deletedMemoAt || typeof st.deletedMemoAt !== 'object') st.deletedMemoAt = {};
        return st;
    }

    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.drawingMemos || {})[floorKey] || []).filter(function (m) { return m && m.id; });
    }

    function addMemo(st, floorKey, memo) {
        if (!st || !floorKey || !memo) return null;
        ensureMaps(st);
        if (!st.drawingMemos[floorKey]) st.drawingMemos[floorKey] = [];
        st.drawingMemos[floorKey].push(memo);
        return memo;
    }

    /** patch: { text?, x?, y? } — 바뀐 게 있으면 updatedAt을 올리고 메모를 돌려준다 */
    function updateMemo(st, floorKey, id, patch, now) {
        var list = (st && st.drawingMemos && st.drawingMemos[floorKey]) || [];
        var m = list.find(function (r) { return r && r.id === id; });
        if (!m || !patch) return null;
        var changed = false;
        if (patch.text != null) {
            var t = cleanText(patch.text);
            if (t && t !== m.text) { m.text = t; changed = true; }
        }
        ['x', 'y'].forEach(function (k) {
            if (patch[k] == null) return;
            var v = Math.round(Number(patch[k]) || 0);
            if (v !== m[k]) { m[k] = v; changed = true; }
        });
        if (!changed) return null;
        m.updatedAt = Math.max((Number(now) || Date.now()), (Number(m.updatedAt) || 0) + 1);
        return m;
    }

    /** 지우기 + 묘비(이 기기가 본 마지막 수정 시각 — 그보다 나중에 남이 고친 메모는 살아남는다) */
    function deleteMemo(st, floorKey, id) {
        if (!st || !floorKey || !id) return false;
        ensureMaps(st);
        var list = st.drawingMemos[floorKey] || [];
        var rec = list.find(function (r) { return r && r.id === id; });
        if (!rec) return false;
        st.drawingMemos[floorKey] = list.filter(function (r) { return r && r.id !== id; });
        var ids = new Set(st.deletedMemoIds[floorKey] || []);
        ids.add(id);
        st.deletedMemoIds[floorKey] = Array.from(ids);
        if (!st.deletedMemoAt[floorKey]) st.deletedMemoAt[floorKey] = {};
        st.deletedMemoAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return true;
    }

    /** 층 묶음에 실을 모양 */
    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (m) {
                return { id: m.id, x: m.x, y: m.y, text: m.text, by: m.by || '', createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0 };
            }),
            deletedIds: ((st && st.deletedMemoIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedMemoAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        if (!pack) return false;
        return !!((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length));
    }

    /**
     * 서버 층 묶음의 메모를 기기 데이터에 합친다. mergeNdtDataMaps(sync-merge)를 그대로 쓴다.
     * pack이 없으면(옛 버전이 쓴 층) 아무것도 안 한다 — 기기 메모를 지우지 않는다.
     */
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var r = mergeFn(
            (function () { var o = {}; o[floorKey] = pack.items || []; return o; })(),
            st.drawingMemos,
            (function () { var o = {}; o[floorKey] = pack.deletedIds || []; return o; })(),
            st.deletedMemoIds,
            (function () { var o = {}; o[floorKey] = pack.deletedAt || {}; return o; })(),
            st.deletedMemoAt
        );
        st.drawingMemos = r.ndtData;
        st.deletedMemoIds = r.deletedNdtIds;
        st.deletedMemoAt = r.deletedNdtAt || {};
        return true;
    }

    /** 화면 좌표(캔버스 기준)에서 가장 가까운 메모 — 반지름 r 안 */
    function hitTest(points, sx, sy, r) {
        var best = null;
        var bestD = (r || 18);
        (points || []).forEach(function (p) {
            var d = Math.hypot(p.sx - sx, p.sy - sy);
            if (d <= bestD) { best = p; bestD = d; }
        });
        return best;
    }

    function shortLabel(text, n) {
        var t = String(text || '').replace(/\s+/g, ' ').trim();
        var lim = n || 18;
        return t.length > lim ? t.slice(0, lim - 1) + '…' : t;
    }

    var api = {
        MAX_TEXT: MAX_TEXT,
        cleanText: cleanText,
        createMemo: createMemo,
        ensureMaps: ensureMaps,
        listFor: listFor,
        addMemo: addMemo,
        updateMemo: updateMemo,
        deleteMemo: deleteMemo,
        packFor: packFor,
        packHasContent: packHasContent,
        mergePackIntoState: mergePackIntoState,
        hitTest: hitTest,
        shortLabel: shortLabel
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.drawingMemo = api;
    }
})(typeof window !== 'undefined' ? window : null);
