/**
 * 2026-10-16 층 동기화 안전장치(덮어쓰기 방지). 브라우저(window.BSA.floorSyncGuard)·node(require) 둘 다.
 *  - 층 문서 상태 가리기: 없음(missing) / 다른 기기가 쓰는 중·깨짐(busy) / 읽을 수 있음(ready)
 *    → busy·읽기 실패는 '빈 층'이 아니다. 그 층은 이번에 쓰지 않고 다음 동기화에서 다시 한다.
 *  - 층 버전(syncRev): 쓸 때마다 서버에서 1씩 올린다(FieldValue.increment). 읽은 뒤 바뀌었으면 다시 읽고 합쳐서 쓴다.
 *    옛 문서(syncRev 없음)는 0으로 본다.
 *  - 쓰기 전후 비교: 서버에 있던 마킹이 묘비(삭제 기록) 없이 빠지면 경고한다.
 */
(function (root) {
    'use strict';

    function classifyFloorSnap(exists, data) {
        if (!exists) return 'missing';
        var d = data || {};
        if (d.chunkStatus === 'uploading' || d.chunkStatus === 'failed') return 'busy';
        return 'ready';
    }

    function revOf(data) {
        var n = Number(data && data.syncRev);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    /** 서버 마킹 중 쓰려는 목록에도 없고 묘비에도 없는 id = 아무 이유 없이 사라지는 것 */
    function lostServerIds(serverItems, writeItems, deletedIds) {
        var keep = new Set();
        (writeItems || []).forEach(function (r) { if (r && r.id) keep.add(r.id); });
        (deletedIds || []).forEach(function (id) { if (id) keep.add(id); });
        var out = [];
        (serverItems || []).forEach(function (r) {
            if (r && r.id && !keep.has(r.id)) out.push(r.id);
        });
        return out;
    }

    /**
     * 쓰기 직전 버전 확인을 몇 번까지 다시 할지 정하는 작은 상태기계.
     * check(): 서버 rev를 돌려주는 async 함수, reread(): 다시 읽고 합친 뒤 새 rev를 돌려주는 async 함수(실패 시 throw).
     * 반환: { ok: true, rev } 이면 써도 됨 / { ok: false, reason } 이면 이번엔 쓰지 말 것(층은 '올릴 것'으로 남김)
     */
    async function confirmRevBeforeWrite(readRev, check, reread, maxTries) {
        var rev = Number(readRev) || 0;
        var tries = Math.max(1, Number(maxTries) || 3);
        for (var i = 0; i < tries; i++) {
            var cur;
            try { cur = await check(); } catch (e) { return { ok: false, reason: 'check-failed' }; }
            if (cur && cur.busy) {
                // 다른 기기가 쓰는 중 — 기다렸다 다시
            } else if ((Number(cur && cur.rev) || 0) === rev) {
                return { ok: true, rev: rev };
            }
            try { rev = Number(await reread()) || 0; } catch (e) { return { ok: false, reason: 'reread-failed' }; }
        }
        return { ok: false, reason: 'changed-repeatedly' };
    }

    /**
     * 2026-10-16 사고: 어떤 기기가 빈(기본) 상태로 회사 문서를 덮어써 건물 21개가 예시 1개로, 회사 설정이 기본값으로 바뀌었다.
     * 쓰기 직전에 서버를 다시 읽어, 서버에 있던 건물(삭제기록 없는 것) 중 이번 쓰기에서 빠지는 것을 돌려준다.
     * 하나라도 있으면 쓰지 않는다(건물은 삭제기록으로만 지운다 — 목록에서 그냥 빠지는 일은 없어야 한다).
     * → 빠지는 건물 [{ id, name }]
     */
    function lostServerBuildings(serverBuildings, writeBuildings, deletedIds) {
        var del = {}, keep = {};
        (deletedIds || []).forEach(function (id) { if (id) del[id] = true; });
        (writeBuildings || []).forEach(function (b) { if (b && b.id) keep[b.id] = true; });
        return (serverBuildings || []).filter(function (b) {
            return b && b.id && !del[b.id] && !keep[b.id];
        }).map(function (b) { return { id: b.id, name: b.name || '' }; });
    }

    /**
     * 2026-10-20 「올려야 할 층」 중 건물이 없는 것 — 서버 목록을 받은 뒤(동기화 중 병합 직후)에만 부른다.
     * buildings: 서버+업로드 대기 건물을 합친 목록. 층 키 「건물id_층」의 건물을 가장 긴 id로 찾고(app의 findBuildingForFloorKey와 같음),
     * 못 찾았거나 그 건물이 삭제 목록에 있으면 고아. 사고: 현장명 없이 도면만 올라간 유령 건물 층이 남아 「올리는 중 172/176」이 안 끝남.
     * → 고아 층 키 배열
     */
    function orphanDirtyFloorKeys(dirtyKeys, buildings, deletedIds) {
        var del = {};
        (deletedIds || []).forEach(function (id) { if (id) del[String(id)] = true; });
        var ids = (buildings || []).filter(function (b) { return b && b.id; }).map(function (b) { return String(b.id); });
        return (dirtyKeys || []).map(String).filter(function (k) {
            var best = '';
            ids.forEach(function (id) {
                if (k.indexOf(id + '_') === 0 && id.length > best.length) best = id;
            });
            return !best || !!del[best];
        });
    }

    var api = {
        classifyFloorSnap: classifyFloorSnap,
        revOf: revOf,
        lostServerIds: lostServerIds,
        confirmRevBeforeWrite: confirmRevBeforeWrite,
        lostServerBuildings: lostServerBuildings,
        orphanDirtyFloorKeys: orphanDirtyFloorKeys
    };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.floorSyncGuard = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
