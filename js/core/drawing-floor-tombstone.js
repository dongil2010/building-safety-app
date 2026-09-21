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

    /**
     * 병합에서 "내 기기 로컬 증거"로 묘비를 풀지 판단할 때 쓸 원격 시각.
     *
     * 원격 문서가 그 층의 묘비를 아직 들고 있으면 0을 돌려준다. 서버가 "지워졌다"고
     * 말하고 있는데 건물 metaUpdatedAt이 삭제보다 나중이라는 이유로 풀면 안 된다.
     * metaUpdatedAt은 건물 단위라 삭제한 기기가 편집창을 저장하기만 해도 올라가므로
     * 거의 항상 삭제 시각보다 나중이다. 그러면 옛 데이터를 들고 있던 다른 기기(회사 PC
     * 등)가 접속하는 순간 묘비를 풀고 층을 다시 올려버린다.
     * (2026-09-21: 지하1층 주차장-2가 회사 PC 접속 후 되살아난 원인)
     *
     * 원격에 묘비가 없을 때(누가 도면을 다시 올려 force로 푼 경우)만 원격 시각을 쓴다.
     * 서버 쪽 도면 문서가 남아 있는 오탐 묘비(옥상 등)는 app.js 클라우드 조회 경로가
     * 서버 증거로 푼다 — 여기서 막는 건 로컬 증거뿐이다.
     */
    function remoteMetaAtForRelease(remoteBldg, floorCode) {
        const code = asCode(floorCode);
        if (!remoteBldg || !code) return 0;
        const remoteDeleted = uniqueCodes([remoteBldg.deletedDrawingFloorCodes]);
        if (remoteDeleted.indexOf(code) >= 0) return 0;
        if (getDeletedDrawingFloorAt(remoteBldg, code)) return 0;
        const n = Number(remoteBldg.metaUpdatedAt);
        return Number.isFinite(n) && n > 0 ? n : 0;
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
    /**
     * 도면 페이로드 증거가 있으면 묘비를 푼다.
     * 의도 삭제는 RAM·IDB·클라우드 문서를 함께 지우므로 증거가 없다.
     * 삭제 시각(At)만 있고 도면 증거가 남은 경우는 오탐·정리 실패로 보고 푼다.
     * (원격 floorsList 부활 레이스는 forgetTombstonesClearedByRemoteMeta + At가 막는다)
     * 진행 중 삭제는 앱 계층(_sessionDeletingDrawingFloors)에서 막는다.
     *
     * ⚠️ evidenceCodes는 서버(클라우드 도면 문서)에서 나온 증거여야 한다.
     * 내 기기 로컬(IDB·옛 층 목록) 증거로 부르면, 삭제 전 데이터를 들고 있던 기기가
     * 접속하는 순간 지운 층을 되살린다. 로컬 증거는 app.js 병합에서
     * remoteMetaAtForRelease로 판단한다. (2026-09-21 지하1층 주차장-2)
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
    function forgetTombstonesClearedByRemoteMeta(bldg, sessionKeys, remoteBldg, opts) {
        if (!bldg || !remoteBldg) return 0;
        const alive = collectRemotelyAliveFloorCodes(remoteBldg);
        const options = opts || {};
        /**
         * remoteBldg가 로컬 건물 자신이면 그 metaUpdatedAt은 "남이 다시 올렸다"는
         * 증거가 될 수 없다. 내 meta는 내가 뭘 저장하든 올라가므로 삭제 시각보다
         * 항상 나중이 되고, 그러면 건물에 다시 들어갈 때마다 묘비가 풀려서
         * 지운 층이 되살아난다. (2026-09-20: 지하주차장-1/-2/0층 재발 원인.
         * 09-21 b924940에서 빠졌다가 복구 — app.js는 계속 selfCheck: true를 넘긴다)
         *
         * 이때는 remoteAt을 0으로 본다. 시각이 찍힌 묘비는 지켜지고, 시각 없는
         * 옛 묘비는 예전처럼 풀린다(영일연립 동작 유지).
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
        remoteMetaAtForRelease: remoteMetaAtForRelease,
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
