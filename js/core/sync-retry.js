/**
 * 2026-10-20 동기화(올리기) 재시도 정책 — 「오프라인 올리기가 끝없이 재시도해서 사용량을 태운다」 수정.
 *
 *  - classify(err): 'permanent'(권한·없음·잘못된 값·너무 큼·기기 사본 없음 — 자동 재시도 안 함)
 *                   'quota'(한도 — 길게 쉼) / 'transient'(통신 등 — 지수 백오프)
 *  - backoffMs(n): 기본 × 2^n, 상한, 지터(0.5~1.0배)
 *  - createGate(): 연속 실패 수를 기기 저장소에 남긴다(새로고침해도 처음부터 다시 세지 않음).
 *      maxAttempts번 연속 실패하거나 영구 오류면 「멈춤(parked)」 — 자동 재시도 없음, 화면에 표시, 「다시 시도」 버튼으로만 푼다.
 *  - createItemTracker(): 사진 같은 항목별 실패 수 — 같은 방식으로 멈춘 항목은 자동 재시도에서 뺀다(지우지 않음).
 * 아무것도 지우지 않는다: 멈춘 것은 기기에 그대로 남고 「다시 시도」로 다시 올린다.
 * DOM·Firebase를 쓰지 않는다.
 */
(function (root) {
    'use strict';

    var PERMANENT_CODES = [
        'permission-denied', 'not-found', 'invalid-argument', 'unauthenticated', 'out-of-range', 'unimplemented',
        'storage/unauthorized', 'storage/unauthenticated', 'storage/object-not-found', 'storage/bucket-not-found',
        'storage/project-not-found', 'storage/invalid-argument', 'storage/invalid-format', 'storage/invalid-checksum',
        'storage/cannot-slice-blob', 'storage/server-file-wrong-size', 'storage/invalid-url', 'storage/no-default-bucket',
        'missing-local-blob', 'oversized'
    ];
    var QUOTA_CODES = ['resource-exhausted', 'storage/quota-exceeded'];
    // 2026-11-07 신호가 약해 응답이 없어 끊은 것 — 사진·데이터 문제가 아니므로 「멈춤」까지의 실패 횟수에 세지 않는다
    // 2026-11-24 storage/retry-limit-exceeded(Storage SDK가 통신이 안 돼 재시도를 포기한 것)·unavailable·deadline-exceeded도
    //   신호 문제다. 예전엔 retry-limit-exceeded를 「한도」로 세어, 현장에서 신호가 약하면 사진이 5번 만에 멈추고
    //   인터넷이 돌아와도 자동으로 안 올라갔다(찍은 기기에서 앱을 다시 열거나 「지금 다시 올리기」를 눌러야 올라감).
    var NETWORK_STALL_CODES = ['upload-stalled', 'write-timeout', 'storage/retry-limit-exceeded'];
    // 통신 오류로 보는 것(실패로는 센다) — 인터넷이 다시 연결되면 clearNetworkBackoff가 대기·멈춤을 푼다
    var NETWORK_CODES = NETWORK_STALL_CODES.concat(['unavailable', 'deadline-exceeded']);

    function codeOf(err) { return String((err && err.code) || '').toLowerCase(); }
    function msgOf(err) { return String((err && err.message) || (typeof err === 'string' ? err : '') || ''); }
    function isNetworkError(err) {
        if (!err) return false;
        if (NETWORK_CODES.indexOf(codeOf(err)) >= 0) return true;
        return /Failed to fetch|NetworkError|network error|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|client is offline/i.test(msgOf(err));
    }

    function classify(err) {
        if (!err) return 'transient';
        var code = codeOf(err);
        var msg = msgOf(err);
        if (QUOTA_CODES.indexOf(code) >= 0 || /\b429\b|RESOURCE_EXHAUSTED|quota|Write stream exhausted|maximum allowed queued writes/i.test(msg)) return 'quota';
        if (PERMANENT_CODES.indexOf(code) >= 0) return 'permanent';
        if (/Missing or insufficient permissions|exceeds the maximum allowed size|maximum size|too large|No document to update|INVALID_ARGUMENT/i.test(msg)) return 'permanent';
        return 'transient';
    }

    function backoffMs(attempt, opts) {
        var o = opts || {};
        var base = o.baseMs || 5000;
        var cap = o.capMs || 10 * 60 * 1000;
        var rnd = typeof o.random === 'function' ? o.random : Math.random;
        var n = Math.max(0, Math.min(30, attempt | 0));
        var raw = Math.min(cap, base * Math.pow(2, n));
        return Math.max(base / 2, Math.round(raw * (0.5 + 0.5 * rnd())));
    }

    function readJson(storage, key) {
        if (!storage || !key) return null;
        try { return JSON.parse(storage.getItem(key) || 'null'); } catch (_e) { return null; }
    }
    function writeJson(storage, key, v) {
        if (!storage || !key) return;
        try { storage.setItem(key, JSON.stringify(v)); } catch (_e) { /* 용량 부족 무시 */ }
    }
    function keyOf(k) { return typeof k === 'function' ? k() : k; }

    /** 동기화 전체의 연속 실패 관리 */
    function createGate(opts) {
        var o = opts || {};
        var max = o.maxAttempts || 6;
        var now = o.now || function () { return Date.now(); };
        var mem = { fails: 0, parked: false, reason: '', kind: '', at: 0, nextAt: 0 };
        function load() {
            var v = readJson(o.storage, keyOf(o.storageKey));
            if (v && typeof v === 'object') mem = Object.assign({ fails: 0, parked: false, reason: '', kind: '', at: 0, nextAt: 0 }, v);
            return mem;
        }
        function save() { writeJson(o.storage, keyOf(o.storageKey), mem); }
        load();
        return {
            state: function () { return Object.assign({}, load()); },
            isParked: function () { return !!load().parked; },
            /** 실패 기록 → { parked, delayMs, kind } */
            fail: function (err, reason) {
                load();
                var kind = err && err.__kind ? err.__kind : classify(err);
                mem.fails += 1;
                mem.kind = kind;
                mem.reason = String(reason || msgOf(err) || kind).slice(0, 200);
                mem.at = now();
                // 2026-11-24 신호 문제로 멈춘 것은 인터넷이 다시 연결되면(clearNetworkBackoff) 저절로 풀린다
                if (kind === 'transient' && isNetworkError(err)) mem.kind = 'network';
                if (kind === 'permanent' || mem.fails >= max) mem.parked = true;
                var delay = mem.parked ? 0 : backoffMs(mem.fails - 1, {
                    baseMs: o.baseMs, capMs: o.capMs, random: o.random
                });
                if (kind === 'quota' && !mem.parked) delay = Math.max(delay, o.quotaMinMs || 120000);
                mem.nextAt = mem.parked ? 0 : now() + delay;
                save();
                return { parked: mem.parked, delayMs: delay, kind: kind, fails: mem.fails };
            },
            ok: function () {
                load();
                if (mem.fails || mem.parked) { mem = { fails: 0, parked: false, reason: '', kind: '', at: 0, nextAt: 0 }; save(); }
            },
            /** 「다시 시도」 버튼 — 멈춤을 풀고 처음부터 센다 */
            unpark: function () { mem = { fails: 0, parked: false, reason: '', kind: '', at: 0, nextAt: 0 }; save(); },
            /**
             * 2026-11-24 인터넷이 다시 연결됐다 — 통신 실패로 생긴 대기·멈춤은 의미가 없으니 푼다.
             * 영구 오류(권한 등)·한도(quota)는 그대로 둔다. 반환: 풀었으면 true
             */
            clearNetworkBackoff: function () {
                load();
                if (!mem.fails && !mem.parked) return false;
                if (mem.kind === 'permanent' || mem.kind === 'quota') return false;
                mem = { fails: 0, parked: false, reason: '', kind: '', at: 0, nextAt: 0 };
                save();
                return true;
            },
            /** 자동 트리거(온라인·포커스·시작)가 지금 돌려도 되는지 — 멈췄거나 백오프 중이면 false */
            autoAllowed: function () { load(); return !mem.parked && now() >= (mem.nextAt || 0); }
        };
    }

    /** 항목별(사진 등) 실패 관리 — 멈춘 항목은 자동 재시도에서 뺀다. 지우지 않는다. */
    function createItemTracker(opts) {
        var o = opts || {};
        var max = o.maxAttempts || 5;
        var now = o.now || function () { return Date.now(); };
        var map = {};
        var loadedKey = null;
        function load() {
            var k = keyOf(o.storageKey);
            if (k !== loadedKey) { map = readJson(o.storage, k) || {}; loadedKey = k; }
            return map;
        }
        function save() { writeJson(o.storage, keyOf(o.storageKey), map); }
        return {
            /** 지금 자동으로 올려도 되는지 */
            shouldTry: function (id) {
                var r = load()[id];
                if (!r) return true;
                if (r.parked) return false;
                return now() >= (r.nextAt || 0);
            },
            fail: function (id, err) {
                load();
                if (NETWORK_STALL_CODES.indexOf(codeOf(err)) >= 0) {
                    return { parked: false, kind: 'transient', n: (map[id] && map[id].n) || 0 };
                }
                var kind = classify(err);
                var r = map[id] || { n: 0 };
                r.n += 1;
                r.kind = kind;
                r.reason = msgOf(err).slice(0, 120) || kind;
                r.at = now();
                r.parked = kind === 'permanent' || r.n >= max;
                r.nextAt = (r.parked || !o.baseMs) ? 0 : now() + backoffMs(r.n - 1, { baseMs: o.baseMs, capMs: o.capMs, random: o.random });
                map[id] = r;
                save();
                return { parked: r.parked, kind: kind, n: r.n };
            },
            ok: function (id) { load(); if (map[id]) { delete map[id]; save(); } },
            /** 2026-11-24 인터넷 복귀 — 영구 오류·한도가 아닌 실패 기록은 지워 바로 다시 올린다. 반환: 푼 개수 */
            clearNetworkBackoff: function () {
                load();
                var n = 0;
                Object.keys(map).forEach(function (id) {
                    var r = map[id];
                    if (!r || r.kind === 'permanent' || r.kind === 'quota') return;
                    delete map[id];
                    n++;
                });
                if (n) save();
                return n;
            },
            parked: function () {
                load();
                return Object.keys(map).filter(function (id) { return map[id] && map[id].parked; })
                    .map(function (id) { return Object.assign({ id: id }, map[id]); });
            },
            unparkAll: function () { load(); map = {}; save(); }
        };
    }

    /** 탭 사이 단일 실행 — navigator.locks 있으면 사용(없으면 항상 허용). 반환: Promise<release 함수|null> */
    function tryCrossTabLock(name, nav) {
        var n = nav || (typeof navigator !== 'undefined' ? navigator : null);
        if (!n || !n.locks || typeof n.locks.request !== 'function') return Promise.resolve(function () {});
        return new Promise(function (resolve) {
            n.locks.request(name, { ifAvailable: true }, function (lock) {
                if (!lock) { resolve(null); return undefined; }
                return new Promise(function (release) { resolve(function () { release(); }); });
            }).catch(function () { resolve(function () {}); });
        });
    }

    var api = { classify: classify, isNetworkError: isNetworkError, backoffMs: backoffMs, createGate: createGate, createItemTracker: createItemTracker, tryCrossTabLock: tryCrossTabLock };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.syncRetry = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
