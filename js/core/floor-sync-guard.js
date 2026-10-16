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

    var api = {
        classifyFloorSnap: classifyFloorSnap,
        revOf: revOf,
        lostServerIds: lostServerIds,
        confirmRevBeforeWrite: confirmRevBeforeWrite
    };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.floorSyncGuard = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
