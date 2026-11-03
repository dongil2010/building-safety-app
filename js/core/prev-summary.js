/**
 * 전차 종합결론 (2026-11-04)
 * 회차(건물 기록)마다 「지난 보고서 종합결과표」를 캡처·사진·PDF 쪽으로 넣어 두고, 점검 들어가기 전에 확인하는 창의 자료.
 * - 건물 칸: prevSummaryImages = [{ id, name, addedAt }]  (그림 본문 dataUrl은 메모리에만 — 저장·동기화 때 뺀다)
 *            prevSummaryDeleted = { id: 지운 시각 }      (다른 기기의 옛 목록이 지운 그림을 되살리지 않게)
 * - 그림 본문은 사진 저장소(IndexedDB + 클라우드)에 문서 키 pvs_<건물ID>_<그림ID> 로 둔다(전경사진 ov_ 와 같은 방식).
 */
(function (root) {
    'use strict';

    var PREFIX = 'pvs_';

    function docId(bldgId, imageId) { return PREFIX + bldgId + '_' + imageId; }

    function createId() {
        return 's' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function list(bldg) {
        if (!bldg) return [];
        if (!Array.isArray(bldg.prevSummaryImages)) bldg.prevSummaryImages = [];
        return bldg.prevSummaryImages;
    }

    function cleanItem(p) {
        if (!p || !p.id) return null;
        var out = { id: String(p.id) };
        out.name = p.name != null ? String(p.name).slice(0, 120) : '';
        var at = Number(p.addedAt) || 0;
        if (at) out.addedAt = at;
        return out;
    }

    /** 저장·동기화용: dataUrl을 뺀 가벼운 목록 */
    function sanitize(arr) {
        if (!Array.isArray(arr)) return arr;
        return arr.map(cleanItem).filter(Boolean);
    }

    function cleanTombs(map) {
        var out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach(function (k) {
            var t = Number(map[k]) || 0;
            if (k && t > 0) out[k] = t;
        });
        return out;
    }

    /**
     * 로컬·원격 건물의 목록을 합친다. 지운 표시는 합집합, 지운 그림은 어느 쪽에 있어도 뺀다.
     * 순서: 로컬 순서 → 원격에만 있는 것. 그림 본문(dataUrl)은 있는 쪽 것을 남긴다.
     */
    function merge(localB, remoteB) {
        var tombs = cleanTombs(remoteB && remoteB.prevSummaryDeleted);
        var lt = cleanTombs(localB && localB.prevSummaryDeleted);
        Object.keys(lt).forEach(function (k) { tombs[k] = Math.max(tombs[k] || 0, lt[k]); });
        var byId = {};
        var order = [];
        function take(arr) {
            (Array.isArray(arr) ? arr : []).forEach(function (p) {
                var c = cleanItem(p);
                if (!c || tombs[c.id]) return;
                var prev = byId[c.id];
                if (!prev) {
                    byId[c.id] = c;
                    order.push(c.id);
                } else if (!prev.name && c.name) {
                    prev.name = c.name;
                }
                if (p.dataUrl && !byId[c.id].dataUrl) byId[c.id].dataUrl = p.dataUrl;
            });
        }
        take(localB && localB.prevSummaryImages);
        take(remoteB && remoteB.prevSummaryImages);
        return { images: order.map(function (id) { return byId[id]; }), deleted: tombs };
    }

    /** 그림 하나 지우기 — 목록에서 빼고 지운 표시를 남긴다. 반환: 지웠으면 true */
    function remove(bldg, imageId, now) {
        if (!bldg || !imageId) return false;
        var arr = list(bldg);
        var before = arr.length;
        bldg.prevSummaryImages = arr.filter(function (p) { return p && p.id !== imageId; });
        if (!bldg.prevSummaryDeleted || typeof bldg.prevSummaryDeleted !== 'object') bldg.prevSummaryDeleted = {};
        bldg.prevSummaryDeleted[imageId] = Number(now) || Date.now();
        return bldg.prevSummaryImages.length !== before;
    }

    /** 그림 순서 옮기기(dir -1 위로, 1 아래로). 반환: 옮겼으면 true */
    function move(bldg, imageId, dir) {
        var arr = list(bldg);
        var i = arr.findIndex(function (p) { return p && p.id === imageId; });
        var j = i + (dir < 0 ? -1 : 1);
        if (i < 0 || j < 0 || j >= arr.length) return false;
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        return true;
    }

    var api = { PREFIX: PREFIX, docId: docId, createId: createId, list: list, sanitize: sanitize, merge: merge, remove: remove, move: move };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.prevSummary = api;
    }
})(typeof window !== 'undefined' ? window : null);
