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

    /**
     * 삭제 시각. 이게 있으면 "사용자가 실제로 지운 것"으로 보고, 클라우드·IDB에
     * 도면이 남아 있다는 이유만으로는 묘비를 풀지 않는다.
     *
     * 시각이 없는 옛 묘비는 예전 동작(증거 있으면 해제) 그대로 둔다. 이미 현장
     * 기기에 깔려 있는 false tombstone 때문에 층이 통째로 사라지던 문제가
     * 재발하면 안 되기 때문이다.
     */
    function getDeletedDrawingFloorAt(bldg, floorCode) {
        const code = asCode(floorCode);
        if (!bldg || !code) return 0;
        const map = bldg.deletedDrawingFloorAt;
        if (!map || typeof map !== 'object') return 0;
        const n = Number(map[code]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    /**
     * 이 묘비를 "도면이 남아 있다"는 증거만으로 풀면 안 되는가?
     * remoteMetaAt: 원격 건물 meta가 갱신된 시각(모르면 0).
     * 내 삭제보다 원격이 나중에 갱신됐다면 누가 진짜로 다시 올린 것이므로 풀어준다.
     */
    function isConfirmedDeletion(bldg, floorCode, remoteMetaAt) {
        const at = getDeletedDrawingFloorAt(bldg, floorCode);
        if (!at) return false;
        const remote = Number(remoteMetaAt);
        if (Number.isFinite(remote) && remote > at) return false;
        return true;
    }

    /** 층별 삭제 시각은 양쪽 중 더 나중 것을 남긴다. */
    function mergeDeletedDrawingFloorAt(localAt, remoteAt) {
        const out = {};
        [remoteAt, localAt].forEach(function (map) {
            if (!map || typeof map !== 'object') return;
            Object.keys(map).forEach(function (k) {
                const code = asCode(k);
                const n = Number(map[k]);
                if (!code || !Number.isFinite(n) || n <= 0) return;
                if (!out[code] || n > out[code]) out[code] = n;
            });
        });
        return out;
    }

    function rememberDeletedDrawingFloor(bldg, floorCode, sessionKeys, nowMs) {
        if (!bldg || !floorCode) return bldg;
        const code = asCode(floorCode);
        if (!code) return bldg;
        bldg.deletedDrawingFloorCodes = uniqueCodes([bldg.deletedDrawingFloorCodes, [code]]);
        const at = Number(nowMs);
        if (Number.isFinite(at) && at > 0) {
            if (!bldg.deletedDrawingFloorAt || typeof bldg.deletedDrawingFloorAt !== 'object') {
                bldg.deletedDrawingFloorAt = {};
            }
            bldg.deletedDrawingFloorAt[code] = at;
        }
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
        if (bldg.deletedDrawingFloorAt && typeof bldg.deletedDrawingFloorAt === 'object') {
            delete bldg.deletedDrawingFloorAt[code];
        }
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
            // 삭제 시각이 찍힌 묘비는 "도면이 아직 남아 있다"는 이유로 풀지 않는다.
            // 그게 바로 묘비가 막으려던 상황이다(클라우드 정리가 늦거나 다른 기기가
            // 아직 들고 있는 경우). 시각 없는 옛 묘비는 예전대로 해제한다.
            if (isConfirmedDeletion(bldg, code, 0)) return;
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
    function forgetTombstonesClearedByRemoteMeta(bldg, sessionKeys, remoteBldg, opts) {
        if (!bldg || !remoteBldg) return 0;
        const alive = collectRemotelyAliveFloorCodes(remoteBldg);
        const options = opts || {};
        /**
         * remoteBldg가 로컬 건물 자신이면 그 metaUpdatedAt은 "남이 다시 올렸다"는
         * 증거가 될 수 없다. 내 meta는 내가 뭘 저장하든 올라가므로 삭제 시각보다
         * 항상 나중이 되고, 그러면 건물에 다시 들어갈 때마다 묘비가 풀려서
         * 지운 층이 되살아난다. (2026-09-20: 지하주차장-1/-2/0층 재발 원인)
         *
         * 이때는 remoteAt을 0으로 본다. 시각이 찍힌 묘비는 지켜지고, 시각 없는
         * 옛 묘비는 예전처럼 증거만으로 풀린다(영일연립 동작 유지).
         */
        const selfCheck = options.selfCheck === true || remoteBldg === bldg;
        // 원격 meta가 내 삭제보다 나중에 갱신됐을 때만 "누가 진짜 다시 올렸다"로 본다.
        // 그렇지 않으면 원격은 아직 내 삭제를 못 받은 상태이므로 묘비를 지킨다.
        const remoteAt = selfCheck ? 0 : (Number(remoteBldg.metaUpdatedAt) || 0);
        let n = 0;
        alive.forEach(function (code) {
            if (!isDeletedDrawingFloor(bldg, code, sessionKeys)) return;
            if (isConfirmedDeletion(bldg, code, remoteAt)) return;
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
        getDeletedDrawingFloorAt: getDeletedDrawingFloorAt,
        isConfirmedDeletion: isConfirmedDeletion,
        mergeDeletedDrawingFloorAt: mergeDeletedDrawingFloorAt,
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
