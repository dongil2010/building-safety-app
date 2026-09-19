/**
 * 층 도면 삭제 tombstone — 동기화/IDB/클라우드 hydrate가 삭제한 층을 되살리지 않게 한다.
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
        return codes;
    }

    function isDeletedDrawingFloor(bldg, floorCode, sessionKeys) {
        const code = asCode(floorCode);
        if (!bldg || !code) return false;
        const deleted = getDeletedDrawingFloorCodes(bldg, sessionKeys);
        if (deleted.indexOf(code) >= 0) return true;
        if (bldg.id && sessionKeys && typeof sessionKeys.has === 'function') {
            return sessionKeys.has(drawingFloorKey(bldg.id, code));
        }
        return false;
    }

    function rememberDeletedDrawingFloor(bldg, floorCode, sessionKeys) {
        if (!bldg || !floorCode) return bldg;
        const code = asCode(floorCode);
        if (!code) return bldg;
        bldg.deletedDrawingFloorCodes = uniqueCodes([bldg.deletedDrawingFloorCodes, [code]]);
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
        if (deleted.length) bldg.deletedDrawingFloorCodes = deleted.slice();
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

    /**
     * 살아 있는 도면 증거가 있는 층 코드는 tombstone에서 뺀다.
     * (의도 삭제는 RAM·IDB·클라우드 도면을 함께 지우므로, 증거가 남으면 오탐으로 본다)
     * evidenceCodes: string[] | Set
     * returns number of forgotten codes
     */
    function forgetTombstonesWithDrawingEvidence(bldg, sessionKeys, evidenceCodes) {
        if (!bldg) return 0;
        const evidence = {};
        const list = evidenceCodes
            ? (typeof evidenceCodes.forEach === 'function' && !Array.isArray(evidenceCodes)
                ? evidenceCodes
                : Array.from(evidenceCodes))
            : [];
        if (list && typeof list.forEach === 'function') {
            list.forEach(function (c) {
                const code = asCode(c);
                if (code) evidence[code] = true;
            });
        }
        const deleted = getDeletedDrawingFloorCodes(bldg, sessionKeys);
        let n = 0;
        deleted.forEach(function (code) {
            if (!evidence[code]) return;
            forgetDeletedDrawingFloor(bldg, code, sessionKeys);
            n += 1;
        });
        return n;
    }

    /**
     * 원격 건물 meta가 "살아 있음"으로 선언한 층.
     * floorsList/drawingFloorCodes에 있고 remote.deletedDrawingFloorCodes에는 없는 코드.
     * (서버에서 복구한 층을 로컬·세션 false tombstone이 다시 지우지 않게 할 때 사용)
     */
    function collectRemotelyAliveFloorCodes(remoteBldg) {
        const alive = {};
        const out = [];
        if (!remoteBldg) return out;
        const remoteDeleted = {};
        (remoteBldg.deletedDrawingFloorCodes || []).forEach(function (c) {
            const code = asCode(c);
            if (code) remoteDeleted[code] = true;
        });
        const mark = function (c) {
            const code = asCode(c);
            if (!code || remoteDeleted[code] || alive[code]) return;
            alive[code] = true;
            out.push(code);
        };
        (remoteBldg.drawingFloorCodes || []).forEach(mark);
        (remoteBldg.floorsList || []).forEach(function (f) {
            if (f) mark(f.floorCode);
        });
        return out;
    }

    /**
     * 원격 meta가 살아있다고 한 층의 tombstone·세션 키를 해제한다.
     * returns number forgotten
     */
    function forgetTombstonesClearedByRemoteMeta(bldg, sessionKeys, remoteBldg) {
        if (!bldg || !remoteBldg) return 0;
        const alive = collectRemotelyAliveFloorCodes(remoteBldg);
        let n = 0;
        alive.forEach(function (code) {
            if (!isDeletedDrawingFloor(bldg, code, sessionKeys)) return;
            forgetDeletedDrawingFloor(bldg, code, sessionKeys);
            n += 1;
        });
        return n;
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
        forgetTombstonesWithDrawingEvidence: forgetTombstonesWithDrawingEvidence,
        collectRemotelyAliveFloorCodes: collectRemotelyAliveFloorCodes,
        forgetTombstonesClearedByRemoteMeta: forgetTombstonesClearedByRemoteMeta,
        filterFloorCodes: filterFloorCodes
    };

    root.BSA = root.BSA || {};
    root.BSA.drawingFloorTombstone = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
