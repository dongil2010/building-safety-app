/**
 * 건물 점검 메타(종류·연도·상/하반기 등) 로컬 우선 병합.
 * Firebase 동기화가 원격 건물을 베이스로 덮어 현장 목록 수정이 되돌아가는 것을 막는다.
 */
(function (root) {
    'use strict';

    // floorsOrderManual: 사용자가 층 순서를 직접 정했다는 표시. 빠져 있으면 병합 때
    // 원격의 옛 값(없음)으로 되돌아가 건물 복제에서 저층→고층으로 다시 정렬된다.
    // (floorsOrderUpdatedAt은 여기 넣지 않는다 — 순서와 무관한 메타 수정이 순서 시각을
    //  덮어써서 "마지막에 저장한 기기가 이김"이 되어 버린다. app.js에서 따로 병합.)
    var KEYS = [
        'inspectionType', 'inspectionYear', 'inspectionPeriod', 'latestSurveyRoundKey',
        'floorsOrderManual',
        'siteName', 'dong', 'multiDong', 'name', 'address', 'inspector', 'contactPhone',
        'floors', 'date', 'structureType', 'facilityGrade', 'completionDate', 'notes',
        // 반발경도 평균에 넣을 추정식 — 빠져 있어 동기화 때마다 서버 옛 값으로 초기화됐다(2026-09-22)
        'enabledStrengthFormulas',
        // 반발경도 장비 앤빌 평균(기준 82) — 같은 이유로 로컬 수정이 서버 옛 값에 덮이지 않게
        'strengthAnvilAvg',
        // 층별 "PDF를 뺀 시각" — 도면을 그림으로 바꾼 층의 옛 PDF를 다른 기기도 버리게(감사 O-05, 2026-09-28)
        'floorPdfRemovedAt',
        // 층별 "도면을 다시 넣은 시각" — 다른 기기가 받아 둔 옛 PDF를 버리고 새 파일을 받게
        'floorPdfUpdatedAt'
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

    /** 층별 시각 맵. 키가 겹치면 더 나중 시각. 한쪽 메타가 통째로 이겨도 다른 층의 새 시각은 남긴다. */
    function mergeFloorStampMaps(localMap, remoteMap) {
        var out = {};
        function take(map) {
            if (!map || typeof map !== 'object') return;
            Object.keys(map).forEach(function (k) {
                var n = Number(map[k]) || 0;
                if (n > (Number(out[k]) || 0)) out[k] = n;
            });
        }
        take(remoteMap);
        take(localMap);
        return out;
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
        mergeFloorStampMaps: mergeFloorStampMaps,
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
