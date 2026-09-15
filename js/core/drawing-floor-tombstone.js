/**
 * 층 도면 삭제 tombstone — 동기화/IDB/클라우드 hydrate가 삭제한 층을 되살리지 않게 한다.
 * 같은 층을 다시 올리면 revivedDrawingFloorAt 이 원격의 옛 삭제 기록보다 우선한다.
 */
(function (root) {
    'use strict';

    function asCode(value) {
        if (value == null) return '';
        const s = String(value).trim();
        return s;
    }

    function drawingFloorKey(buildingId, floorCode) {
        const id = asCode(buildingId);
        const code = asCode(floorCode);
        if (!id || !code) return '';
        return id + '_' + code;
    }

    function uniqueCodes(lists) {
        const set = {};
        const out = [];
        (lists || []).forEach(function (list) {
            (list || []).forEach(function (c) {
                const code = asCode(c);
                if (!code || set[code]) return;
                set[code] = true;
                out.push(code);
            });
        });
        return out;
    }

    function readAtMap(bldg, field) {
        const src = (bldg && bldg[field]) || {};
        const out = {};
        Object.keys(src).forEach(function (k) {
            const code = asCode(k);
            const n = Number(src[k]);
            if (!code || !Number.isFinite(n) || n <= 0) return;
            out[code] = n;
        });
        return out;
    }

    function mergeAtMaps(a, b) {
        const out = {};
        [a, b].forEach(function (map) {
            Object.keys(map || {}).forEach(function (k) {
                const n = Number(map[k]) || 0;
                if (n > (Number(out[k]) || 0)) out[k] = n;
            });
        });
        return out;
    }

    function deletedAtOf(bldg, code) {
        return Number(bldg && bldg.deletedDrawingFloorAt && bldg.deletedDrawingFloorAt[code]) || 0;
    }

    function revivedAtOf(bldg, code) {
        return Number(bldg && bldg.revivedDrawingFloorAt && bldg.revivedDrawingFloorAt[code]) || 0;
    }

    function revivalBeatsDeletion(bldg, code) {
        const c = asCode(code);
        if (!c) return false;
        return revivedAtOf(bldg, c) > deletedAtOf(bldg, c);
    }

    function getDeletedDrawingFloorCodes(bldg, sessionKeys) {
        const codes = uniqueCodes([bldg && bldg.deletedDrawingFloorCodes]);
        const id = bldg && bldg.id;
        if (id && sessionKeys && typeof sessionKeys.forEach === 'function') {
            const prefix = String(id) + '_';
            sessionKeys.forEach(function (key) {
                if (!key || String(key).indexOf(prefix) !== 0) return;
                const rest = String(key).slice(prefix.length);
                if (rest && codes.indexOf(rest) < 0) codes.push(rest);
            });
        }
        return codes.filter(function (c) {
            return !revivalBeatsDeletion(bldg, c);
        });
    }

    function isDeletedDrawingFloor(bldg, floorCode, sessionKeys) {
        const code = asCode(floorCode);
        if (!bldg || !code) return false;
        if (revivalBeatsDeletion(bldg, code)) return false;
        const delAt = deletedAtOf(bldg, code);
        const revAt = revivedAtOf(bldg, code);
        if (delAt > revAt) return true;
        const deleted = getDeletedDrawingFloorCodes(bldg, sessionKeys);
        if (deleted.indexOf(code) >= 0) return true;
        if (bldg.id && sessionKeys && typeof sessionKeys.has === 'function') {
            if (revivalBeatsDeletion(bldg, code)) return false;
            return sessionKeys.has(drawingFloorKey(bldg.id, code));
        }
        return false;
    }

    function rememberDeletedDrawingFloor(bldg, floorCode, sessionKeys) {
        if (!bldg || !floorCode) return bldg;
        const code = asCode(floorCode);
        if (!code) return bldg;
        bldg.deletedDrawingFloorCodes = uniqueCodes([bldg.deletedDrawingFloorCodes, [code]]);
        bldg.deletedDrawingFloorAt = bldg.deletedDrawingFloorAt || {};
        bldg.deletedDrawingFloorAt[code] = Date.now();
        if (bldg.revivedDrawingFloorAt) delete bldg.revivedDrawingFloorAt[code];
        if (bldg.id && sessionKeys && typeof sessionKeys.add === 'function') {
            sessionKeys.add(drawingFloorKey(bldg.id, code));
        }
        return bldg;
    }

    function forgetDeletedDrawingFloor(bldg, floorCode, sessionKeys) {
        if (!bldg || !floorCode) return bldg;
        const code = asCode(floorCode);
        bldg.deletedDrawingFloorCodes = (bldg.deletedDrawingFloorCodes || []).filter(function (c) {
            return asCode(c) !== code;
        });
        bldg.revivedDrawingFloorAt = bldg.revivedDrawingFloorAt || {};
        bldg.revivedDrawingFloorAt[code] = Date.now();
        if (bldg.deletedDrawingFloorAt) delete bldg.deletedDrawingFloorAt[code];
        if (bldg.id && sessionKeys && typeof sessionKeys.delete === 'function') {
            sessionKeys.delete(drawingFloorKey(bldg.id, code));
        }
        return bldg;
    }

    function dropMapKeys(map, deleted) {
        if (!map || !deleted || !deleted.length) return map;
        deleted.forEach(function (code) {
            if (map[code] != null) delete map[code];
        });
        return map;
    }

    function stripDeletedDrawingFloorsFromBuilding(bldg, sessionKeys) {
        if (!bldg) return bldg;
        const deleted = getDeletedDrawingFloorCodes(bldg, sessionKeys);
        bldg.deletedDrawingFloorCodes = deleted.slice();
        if (!deleted.length) return bldg;
        const banned = {};
        deleted.forEach(function (c) { banned[c] = true; });
        dropMapKeys(bldg.floorDrawings, deleted);
        dropMapKeys(bldg.floorDrawingPdfs, deleted);
        dropMapKeys(bldg.floorDrawingTiers, deleted);
        dropMapKeys(bldg.floorDrawingSources, deleted);
        if (Array.isArray(bldg.floorsList)) {
            bldg.floorsList = bldg.floorsList.filter(function (f) {
                return f && !banned[asCode(f.floorCode)];
            });
        }
        if (Array.isArray(bldg.drawingFloorCodes)) {
            bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter(function (c) {
                return !banned[asCode(c)];
            });
        }
        return bldg;
    }

    function mergeDeletedDrawingFloorCodes(localCodes, remoteCodes) {
        return uniqueCodes([remoteCodes, localCodes]);
    }

    function mergeDeletedDrawingFloorState(localBldg, remoteBldg) {
        const deletedAt = mergeAtMaps(
            readAtMap(localBldg, 'deletedDrawingFloorAt'),
            readAtMap(remoteBldg, 'deletedDrawingFloorAt')
        );
        const revivedAt = mergeAtMaps(
            readAtMap(localBldg, 'revivedDrawingFloorAt'),
            readAtMap(remoteBldg, 'revivedDrawingFloorAt')
        );
        const probe = {
            deletedDrawingFloorCodes: uniqueCodes([
                localBldg && localBldg.deletedDrawingFloorCodes,
                remoteBldg && remoteBldg.deletedDrawingFloorCodes
            ]),
            deletedDrawingFloorAt: deletedAt,
            revivedDrawingFloorAt: revivedAt
        };
        const codes = probe.deletedDrawingFloorCodes.filter(function (code) {
            return !revivalBeatsDeletion(probe, code);
        });
        return {
            deletedDrawingFloorCodes: codes,
            deletedDrawingFloorAt: deletedAt,
            revivedDrawingFloorAt: revivedAt
        };
    }

    function filterFloorCodes(codes, bldg, sessionKeys) {
        return (codes || []).filter(function (c) {
            return c && !isDeletedDrawingFloor(bldg, c, sessionKeys);
        });
    }

    const api = {
        drawingFloorKey: drawingFloorKey,
        uniqueCodes: uniqueCodes,
        getDeletedDrawingFloorCodes: getDeletedDrawingFloorCodes,
        isDeletedDrawingFloor: isDeletedDrawingFloor,
        rememberDeletedDrawingFloor: rememberDeletedDrawingFloor,
        forgetDeletedDrawingFloor: forgetDeletedDrawingFloor,
        stripDeletedDrawingFloorsFromBuilding: stripDeletedDrawingFloorsFromBuilding,
        mergeDeletedDrawingFloorCodes: mergeDeletedDrawingFloorCodes,
        mergeDeletedDrawingFloorState: mergeDeletedDrawingFloorState,
        filterFloorCodes: filterFloorCodes
    };

    root.BSA = root.BSA || {};
    root.BSA.drawingFloorTombstone = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
