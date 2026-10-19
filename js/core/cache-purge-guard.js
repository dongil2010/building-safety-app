/**
 * 오래된 점검 캐시 정리(IndexedDB 도면·사진 사본) 보호 — 2026-10-19
 * 사고 시나리오: 어제 오프라인으로 A건물 사진 작업 → 오늘 B건물 작업 → 인터넷 연결.
 *  연결 순간 「24시간 안 연 건물 캐시 정리」가 올리기보다 먼저 돌아, A에서 찍고 아직 안 올라간 사진 사본을 지울 수 있었다.
 * 규칙:
 *  1) 다시 연결된 뒤 올리기·서버 확인이 끝나기 전에는 정리하지 않는다(오프라인 작업 표시·올리는 중·올릴 층·저장 중 사진).
 *  2) 정리 대상이어도 ─ 올릴 층이 남은 건물 / 서버에 안 올라간 사진이 있는 건물 / 오프라인 준비한 건물 ─ 은 빼고 남긴다.
 * 순수 함수 — app.js와 테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    /** 지금 정리를 미뤄야 하면 이유(문자열), 아니면 '' */
    function pruneBlockReason(ctx) {
        var c = ctx || {};
        if (c.offline) return 'offline';
        if (c.offlineReturnPending) return 'offline-return-pending';   // 오프라인에서 작업 → 올리기·확인이 아직 안 끝남
        if (c.offlineReturnRunning) return 'offline-return-running';
        if (c.syncing) return 'syncing';
        if ((Number(c.dirtyCount) || 0) > 0) return 'dirty-floors';
        if ((Number(c.photoSavesPending) || 0) > 0) return 'photo-saving';
        return '';
    }

    function toSet(v) {
        if (!v) return new Set();
        if (v instanceof Set) return v;
        return new Set(Array.isArray(v) ? v.map(String) : Object.keys(v));
    }

    /**
     * staleIds: 오래돼 정리 후보인 건물 id
     * ctx.dirtyFloorKeys: 올릴 층 키(「건물id_층」) · ctx.unuploadedPhotoBuildingIds: 서버에 안 올라간 사진이 있는 건물
     * ctx.preparedIds: 오프라인 준비한 건물 · ctx.pendingJournalBuildingIds: 진행률 일지에 서버 확인 안 된 변경이 있는 건물
     * 반환: { purge: [id], kept: [{ id, why }] }
     */
    function selectPurgeable(staleIds, ctx) {
        var c = ctx || {};
        var dirty = Array.from(toSet(c.dirtyFloorKeys)).map(String);
        var photos = toSet(c.unuploadedPhotoBuildingIds);
        var prepared = toSet(c.preparedIds);
        var journal = toSet(c.pendingJournalBuildingIds);
        var purge = [];
        var kept = [];
        (staleIds || []).forEach(function (raw) {
            var id = String(raw || '');
            if (!id) return;
            var prefix = id + '_';
            if (dirty.some(function (k) { return k.indexOf(prefix) === 0; })) { kept.push({ id: id, why: 'dirty-floors' }); return; }
            if (journal.has(id)) { kept.push({ id: id, why: 'unconfirmed-changes' }); return; }
            if (photos.has(id)) { kept.push({ id: id, why: 'unuploaded-photos' }); return; }
            if (prepared.has(id)) { kept.push({ id: id, why: 'offline-prepared' }); return; }
            purge.push(id);
        });
        return { purge: purge, kept: kept };
    }

    /** 사진 하나가 「이 기기에만 있는 사진」인지: 서버 표시가 없고 기기 사본이 그림(data URL)이면 */
    function isUnuploadedLocalPhoto(markedOnServer, localValue) {
        if (markedOnServer) return false;
        return typeof localValue === 'string' && localValue.indexOf('data:') === 0;
    }

    var api = { pruneBlockReason: pruneBlockReason, selectPurgeable: selectPurgeable, isUnuploadedLocalPhoto: isUnuploadedLocalPhoto };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.cachePurgeGuard = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
