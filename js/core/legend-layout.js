/**
 * 결함위치도 범례 박스(위치·크기) 저장/복원.
 * 건물 객체와 작업 중 state 사이를 오갈 때 기본값 적용이 사용자 배치를 지우지 않게 한다.
 */
(function (root) {
    'use strict';

    function cloneItems(items) {
        return JSON.parse(JSON.stringify(items || []));
    }

    function cloneBox(box) {
        if (!box || typeof box !== 'object') return null;
        var out = {};
        Object.keys(box).forEach(function (key) {
            out[key] = box[key];
        });
        return out;
    }

    /** 동마다 따로 정하는 박스 설정 — 다른 동 박스를 이어 쓸 때 넘기지 않는다 */
    var PER_BUILDING_OPTS = ['hidden', 'monoPin', 'locked'];

    function hasCustomItems(bldg) {
        return !!(bldg && Array.isArray(bldg.locationMapLegend) && bldg.locationMapLegend.length);
    }

    /**
     * 건물 → 작업 state 복원.
     * - forceDefault: 항목·박스를 기본값으로 되돌리고 건물에도 기록
     * - 박스: 건물에 있으면 그걸 쓰고, 없으면 현재 state 박스를 유지(reload/sync 가 지운 경우 복구)
     *   유지한 박스는 건물에 다시 심어 다음 저장에 남긴다
     * - 항목: 커스터마이즈된 것만 건물에서 복원. 없으면 defaultItems를 쓰되 건물에 고정하지 않음
     */
    function applyFromBuilding(bldg, stateLegend, opts) {
        opts = opts || {};
        var defaultItems = opts.defaultItems || [];
        var result = {
            items: cloneItems((stateLegend && stateLegend.items) || defaultItems),
            box: cloneBox(stateLegend && stateLegend.box),
            writeItemsToBuilding: undefined,
            writeBoxToBuilding: undefined
        };
        if (!bldg) return result;

        if (opts.forceDefault) {
            result.items = cloneItems(defaultItems);
            result.box = null;
            result.writeItemsToBuilding = cloneItems(defaultItems);
            result.writeBoxToBuilding = null;
            return result;
        }

        if (hasCustomItems(bldg)) {
            result.items = cloneItems(bldg.locationMapLegend);
        } else {
            result.items = cloneItems(defaultItems);
        }

        if (bldg.locationMapLegendBox) {
            result.box = cloneBox(bldg.locationMapLegendBox);
        } else if (result.box) {
            // 2026-11-27 「현장별(동별)로 따로 둬야」: 범례 설정이 없는 동을 처음 열면 직전 동의 박스를 이어 쓰는데,
            // 위치·크기만 잇고 동마다 정하는 설정(범례 숨기기·핀 한 색·범례 고정)은 다른 동에서 온 것이면 뺀다.
            // 같은 동의 박스가 동기화·새로고침으로 지워진 복구일 때(주인이 같거나 모를 때)는 그대로 둔다.
            if (result.box.ownerBldgId && bldg.id && result.box.ownerBldgId !== bldg.id) {
                PER_BUILDING_OPTS.forEach(function (k) { delete result.box[k]; });
            }
            if (bldg.id) result.box.ownerBldgId = bldg.id;
            result.writeBoxToBuilding = cloneBox(result.box);
        }
        if (result.box && bldg.id) result.box.ownerBldgId = bldg.id;
        return result;
    }

    /** 원격 건물을 베이스로 병합할 때 로컬 범례 항목/박스를 잃지 않게 덮어쓴다. */
    function overlayOnMerged(merged, localMatch) {
        if (!merged || !localMatch) return merged;
        if (hasCustomItems(localMatch)) {
            merged.locationMapLegend = cloneItems(localMatch.locationMapLegend);
        }
        if (localMatch.locationMapLegendBox) {
            merged.locationMapLegendBox = cloneBox(localMatch.locationMapLegendBox);
        }
        return merged;
    }

    function stampNormalized(box, imgW, imgH) {
        if (!box || typeof box !== 'object') return box;
        var w = Number(imgW) || 0;
        var h = Number(imgH) || 0;
        if (box.x !== undefined && w > 0) box.nx = box.x / w;
        if (box.y !== undefined && h > 0) box.ny = box.y / h;
        return box;
    }

    /**
     * 도면 좌표로 범례 좌상단을 구한다.
     * nx/ny(0..1)가 있으면 층·해상도가 달라도 같은 상대 위치를 유지한다.
     */
    function resolveOrigin(box, imgW, imgH, margin) {
        var m = margin || 0;
        var w = Number(imgW) || 0;
        var h = Number(imgH) || 0;
        if (box && box.nx != null && isFinite(Number(box.nx)) && w > 0) {
            var y;
            if (box.ny != null && isFinite(Number(box.ny)) && h > 0) y = Number(box.ny) * h;
            else y = (box.y !== undefined) ? box.y : m;
            return { x: Number(box.nx) * w, y: y };
        }
        return {
            x: (box && box.x !== undefined) ? box.x : m,
            y: (box && box.y !== undefined) ? box.y : m
        };
    }

    var api = {
        cloneItems: cloneItems,
        cloneBox: cloneBox,
        hasCustomItems: hasCustomItems,
        applyFromBuilding: applyFromBuilding,
        overlayOnMerged: overlayOnMerged,
        stampNormalized: stampNormalized,
        resolveOrigin: resolveOrigin
    };

    root.BSA = root.BSA || {};
    root.BSA.legendLayout = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
