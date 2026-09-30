/**
 * 균열게이지·팁 비교사진(전차/현차)을 localStorage 저장본에서 빼서 IndexedDB·클라우드 사진으로 (2026-09-30).
 *
 * 예전에는 사진이 crackGaugeLog/crackTipLog.prevPhoto·currPhoto에 data URL로 통째로 들어 있어, 기기 저장본
 * (localStorage, 약 5백만 자 한도)의 1/5를 차지했다(영일 1층 G-01·G-02 4장 ≈ 100만 자). 한도가 차면 저장이
 * 실패해 CAD 핀·엑셀 가져오기가 사라졌다.
 *
 * 규칙
 * - 사진마다 번호(prevPhotoId·currPhotoId, 'cg' + 난수)를 붙이고, 실제 사진은 반발경도 측정지 사진과 같은
 *   저장(IndexedDB photos 'str_건물_번호' + 클라우드 photos)에 둔다. 동기화·삭제 보류·되살리기 재업로드를 그대로 탄다.
 * - 메모리(state)에는 사진 data URL을 그대로 둔다 → 화면·한글·PDF 코드는 바뀌지 않는다.
 * - 기기 저장본에서는 **IndexedDB에 쓰고 다시 읽어 같음을 확인한 사진만** 뺀다. 확인 전에는 통째로 남긴다.
 *
 * 순수 함수만 — app.js가 IndexedDB·클라우드를 붙인다. Node 테스트: scripts/test-gauge-photo-store.js
 */
(function (root) {
    'use strict';

    var LOGS = ['crackGaugeLog', 'crackTipLog'];
    var SLOTS = ['prevPhoto', 'currPhoto'];

    function idFieldOf(slot) { return slot + 'Id'; }

    function isInlineImage(s) {
        return typeof s === 'string' && s.length > 64 && /^data:image\//i.test(s);
    }

    function newPhotoId(rand) {
        var r = typeof rand === 'function' ? rand : Math.random;
        var s = '';
        while (s.length < 10) s += Math.floor(r() * 36).toString(36);
        return 'cg' + s.slice(0, 10);
    }

    /** 기록(결함·비파괴 항목)의 사진 칸 목록 [{ log, slot, idField, url, pid }] */
    function slotsOf(rec) {
        var out = [];
        if (!rec || typeof rec !== 'object') return out;
        LOGS.forEach(function (log) {
            var l = rec[log];
            if (!l || typeof l !== 'object') return;
            SLOTS.forEach(function (slot) {
                var idField = idFieldOf(slot);
                out.push({
                    log: log, slot: slot, idField: idField,
                    url: typeof l[slot] === 'string' ? l[slot] : '',
                    pid: typeof l[idField] === 'string' ? l[idField] : ''
                });
            });
        });
        return out;
    }

    function photoIdsOf(rec) {
        return slotsOf(rec).map(function (s) { return s.pid; }).filter(Boolean);
    }

    /**
     * 기기 저장용 사본. isVerified(pid) = 그 번호 사진이 IndexedDB에 확인됨.
     * 번호가 있고 확인된 사진만 data URL을 뺀다(빈 문자열 + has*Photo 표시). 그 밖은 그대로.
     * 반환: { rec, stripped, inlineLeft } — 바뀐 게 없으면 rec는 원본 그대로(복사 안 함).
     */
    function stripForLocalSave(rec, isVerified) {
        var stripped = 0;
        var inlineLeft = 0;
        var copy = null;
        slotsOf(rec).forEach(function (s) {
            if (!isInlineImage(s.url)) return;
            if (s.pid && isVerified && isVerified(s.pid)) {
                if (!copy) copy = Object.assign({}, rec);
                if (copy[s.log] === rec[s.log]) copy[s.log] = Object.assign({}, rec[s.log]);
                copy[s.log][s.slot] = '';
                var flag = s.slot === 'prevPhoto' ? 'hasPrevPhoto' : 'hasCurrPhoto';
                copy[s.log][flag] = true;
                stripped += 1;
            } else {
                inlineLeft += 1;
            }
        });
        return { rec: copy || rec, stripped: stripped, inlineLeft: inlineLeft };
    }

    /** 옮길 사진: data URL이 있는데 확인이 안 된 칸 */
    function migrationTasksOf(rec, isVerified) {
        return slotsOf(rec).filter(function (s) {
            return isInlineImage(s.url) && !(s.pid && isVerified && isVerified(s.pid));
        });
    }

    /** 불러올 사진: 번호는 있는데 메모리에 사진이 없는 칸 */
    function hydrateTasksOf(rec) {
        return slotsOf(rec).filter(function (s) { return s.pid && !s.url; });
    }

    /**
     * 원격 병합 뒤 이 기기 사진을 이어 붙여도 되나 — 번호가 다르면(다른 기기가 사진을 바꿈) 안 된다.
     * 원격에 번호가 없으면(옛 기기) 예전 규칙(has 표시가 false가 아니면 붙임).
     */
    function canCarryLocalPhoto(oldLog, newLog, slot) {
        if (!oldLog || !newLog) return false;
        var idField = idFieldOf(slot);
        var flag = slot === 'prevPhoto' ? 'hasPrevPhoto' : 'hasCurrPhoto';
        if (newLog[slot] || !oldLog[slot]) return false;
        if (newLog[idField]) return newLog[idField] === oldLog[idField];
        return newLog[flag] !== false;
    }

    var api = {
        LOGS: LOGS,
        SLOTS: SLOTS,
        idFieldOf: idFieldOf,
        isInlineImage: isInlineImage,
        newPhotoId: newPhotoId,
        slotsOf: slotsOf,
        photoIdsOf: photoIdsOf,
        stripForLocalSave: stripForLocalSave,
        migrationTasksOf: migrationTasksOf,
        hydrateTasksOf: hydrateTasksOf,
        canCarryLocalPhoto: canCarryLocalPhoto
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.gaugePhotos = api;
    }
})(typeof window !== 'undefined' ? window : null);
