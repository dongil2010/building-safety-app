/**
 * 건물 점검 메타(종류·연도·상/하반기 등) 로컬 우선 병합.
 * Firebase 동기화가 원격 건물을 베이스로 덮어 현장 목록 수정이 되돌아가는 것을 막는다.
 */
(function (root) {
    'use strict';

    var KEYS = [
        'inspectionType', 'inspectionYear', 'inspectionPeriod', 'latestSurveyRoundKey',
        'siteName', 'dong', 'multiDong', 'name', 'address', 'inspector', 'contactPhone',
        'floors', 'date', 'structureType', 'facilityGrade', 'completionDate', 'notes'
    ];

    function metaUpdatedAt(bldg) {
        var n = Number(bldg && bldg.metaUpdatedAt);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function markDirty(bldg, now) {
        if (!bldg) return bldg;
        var ts = Number(now);
        bldg.metaUpdatedAt = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
        bldg._pendingCloudSync = true;
        return bldg;
    }

    /**
     * 로컬 현장 정보 수정이 원격(기본값 정밀/하반기)에 먹히지 않게.
     * - 업로드 대기면 무조건 로컬
     * - 로컬 metaUpdatedAt 이 원격보다 같거나 더 최근이면 로컬 (동점이면 방금 저장한 기기)
     */
    function shouldKeepLocal(localMatch, remote) {
        if (!localMatch) return false;
        if (localMatch._pendingCloudSync) return true;
        var localAt = metaUpdatedAt(localMatch);
        if (!localAt) return false;
        return localAt >= metaUpdatedAt(remote);
    }

    function applyLocal(merged, localMatch) {
        if (!merged || !localMatch) return merged;
        KEYS.forEach(function (key) {
            var val = localMatch[key];
            if (val == null || val === '') return;
            merged[key] = val;
        });
        if (metaUpdatedAt(localMatch)) merged.metaUpdatedAt = localMatch.metaUpdatedAt;
        return merged;
    }

    function overlay(merged, localMatch, remote) {
        if (shouldKeepLocal(localMatch, remote)) applyLocal(merged, localMatch);
        if (localMatch && localMatch._pendingCloudSync) merged._pendingCloudSync = true;
        return merged;
    }

    var api = {
        KEYS: KEYS,
        metaUpdatedAt: metaUpdatedAt,
        markDirty: markDirty,
        shouldKeepLocal: shouldKeepLocal,
        applyLocal: applyLocal,
        overlay: overlay
    };

    root.BSA = root.BSA || {};
    root.BSA.buildingMetaMerge = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
