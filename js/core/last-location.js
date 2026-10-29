/**
 * 마지막 작업 위치 기억·복원 (2026-10-28 사용자 요청: "새 버전으로 새로고침돼도 하던 현장·층으로 바로 접속").
 *
 * 저장: 기기(localStorage)에, 계정(uid)+회사별 키 하나. { v, uid, companyId, buildingId, floor, tab, savedAt }.
 *   - buildingId 하나가 현장·동·점검 회차를 모두 가리킨다(건물 레코드가 동·회차별로 따로 있음).
 *   - 홈으로 직접 나가면 지우고(의도한 이동), 로그아웃·삭제된 건물이면 지운다.
 * 복원: 로그인 직후 한 번만. 가능한 단계까지만 가고 안 되면 홈(건물 없음/휴지통 → 홈, 층 없음 → 건물의 첫 층).
 * 서버 읽기를 만들지 않는다 — 이미 불러온 state.buildings만 보고, 진입은 사용자가 건물을 누른 것과 같은 길(selectBuildingAndInspect)이다.
 */
(function (root) {
    'use strict';

    var KEY_PREFIX = 'bsa_last_location_v1:';
    var VERSION = 1;
    // 홈이 아닌 작업 탭만 기억한다
    var TABS = ['tab-map', 'tab-ndt', 'tab-survey', 'tab-eval', 'tab-stats'];
    var lastWritten = {};

    function keyOf(uid, companyId) {
        return KEY_PREFIX + String(uid) + ':' + String(companyId);
    }

    function build(ctx) {
        if (!ctx || !ctx.uid || !ctx.companyId || !ctx.buildingId) return null;
        if (TABS.indexOf(ctx.tab) < 0) return null;
        return {
            v: VERSION,
            uid: String(ctx.uid),
            companyId: String(ctx.companyId),
            buildingId: String(ctx.buildingId),
            floor: ctx.floor ? String(ctx.floor) : '',
            tab: ctx.tab
        };
    }

    /** 바뀐 때만 쓴다(저장이 잦아도 localStorage를 매번 쓰지 않게). 썼으면 true */
    function save(storage, ctx) {
        var rec = build(ctx);
        if (!rec || !storage) return false;
        var k = keyOf(rec.uid, rec.companyId);
        var sig = JSON.stringify(rec);
        // 같은 값을 이미 써 뒀고 저장소에 아직 있으면 건너뜀(다른 곳에서 지워졌으면 다시 쓴다)
        if (lastWritten[k] === sig) {
            var present = null;
            try { present = storage.getItem(k); } catch (e) { present = null; }
            if (present) return false;
        }
        rec.savedAt = Date.now();
        try {
            storage.setItem(k, JSON.stringify(rec));
            lastWritten[k] = sig;
            return true;
        } catch (e) {
            return false;
        }
    }

    function load(storage, uid, companyId) {
        if (!storage || !uid || !companyId) return null;
        var raw;
        try { raw = storage.getItem(keyOf(uid, companyId)); } catch (e) { return null; }
        if (!raw) return null;
        var rec;
        try { rec = JSON.parse(raw); } catch (e) { return null; }
        if (!rec || rec.v !== VERSION) return null;
        // 다른 계정·회사 것이면 쓰지 않는다(키가 달라 보통 못 읽지만 값도 한 번 더 본다)
        if (rec.uid !== String(uid) || rec.companyId !== String(companyId)) return null;
        if (!rec.buildingId || TABS.indexOf(rec.tab) < 0) return null;
        return rec;
    }

    function clear(storage, uid, companyId) {
        if (!uid || !companyId) return;
        var k = keyOf(uid, companyId);
        delete lastWritten[k];
        try { if (storage) storage.removeItem(k); } catch (e) { /* ignore */ }
    }

    /**
     * 저장된 위치를 지금 데이터에 맞춰 풀어 본다.
     * opts.isTrashed(bldg): 휴지통 건물인지, opts.getFloorCodes(bldg): 건물의 층 코드 목록
     * 반환: { ok:false, reason } 또는 { ok:true, buildingId, floor('' 이면 건물의 첫 층), tab, floorKept }
     */
    function resolve(loc, buildings, opts) {
        opts = opts || {};
        if (!loc) return { ok: false, reason: 'none' };
        var list = Array.isArray(buildings) ? buildings : [];
        var bldg = null;
        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === loc.buildingId) { bldg = list[i]; break; }
        }
        if (!bldg) return { ok: false, reason: 'building-missing' };
        if (typeof opts.isTrashed === 'function' && opts.isTrashed(bldg)) return { ok: false, reason: 'building-trashed' };
        var floor = '';
        var floorKept = false;
        if (loc.floor && typeof opts.getFloorCodes === 'function') {
            var codes = opts.getFloorCodes(bldg) || [];
            if (codes.indexOf(loc.floor) >= 0) { floor = loc.floor; floorKept = true; }
        }
        return { ok: true, buildingId: bldg.id, floor: floor, tab: loc.tab, floorKept: floorKept };
    }

    var api = {
        KEY_PREFIX: KEY_PREFIX,
        TABS: TABS,
        keyOf: keyOf,
        build: build,
        save: save,
        load: load,
        clear: clear,
        resolve: resolve
    };
    root.BSA = root.BSA || {};
    root.BSA.lastLocation = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
