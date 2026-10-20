/**
 * 기기 저장 공간(localStorage ≈ 5백만 자) 관리 — 2026-10-20
 * - report(): 키별 크기(진단). 콘솔: bsaStorageReport()
 * - freeSpace(): 큰 데이터를 IndexedDB로 옮긴다(쓰고 → 다시 읽어 같을 때만 원래 키 삭제).
 *   지우기만 하는 것은 다시 만들 수 있는 기록(진단 로그 등)뿐 — 올리지 않은 사용자 변경은 절대 버리지 않는다.
 * - setWithRetry(): 가득 차면 freeSpace 후 한 번 더 쓴다.
 */
(function (root) {
    'use strict';

    var STATE_PREFIX = 'building_safety_app_state_v2';
    var S357_IMG_PREFIX = 'bsa.s357img.';
    // 지워도 되는 것(다시 생기는 진단·화면 기록) — 사용자 작업·동기화 표시는 넣지 않는다
    var DISPOSABLE = ['bsa_live_tab_beats', 'bsa_error_log_quota', 'bsa_floor_drawing_dims_v1'];

    function isQuotaError(e) {
        return !!(e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || e.code === 22 || e.code === 1014));
    }

    function keysOf(storage) {
        var out = [];
        if (!storage) return out;
        var n = Number(storage.length) || 0;
        for (var i = 0; i < n; i++) { var k = storage.key(i); if (k != null) out.push(k); }
        return out;
    }

    /** [{ key, chars }] 큰 순 + total(문자 수 — 한도도 문자 기준) */
    function report(storage) {
        var rows = keysOf(storage).map(function (k) {
            var v = '';
            try { v = storage.getItem(k) || ''; } catch (_e) { /* ignore */ }
            return { key: k, chars: k.length + v.length };
        }).sort(function (a, b) { return b.chars - a.chars; });
        var total = rows.reduce(function (s, r) { return s + r.chars; }, 0);
        return { rows: rows, total: total };
    }

    function formatReport(rep, top) {
        var lines = (rep.rows || []).slice(0, top || 20).map(function (r) {
            return (r.chars / 1024).toFixed(1).padStart(8) + ' K자  ' + r.key;
        });
        lines.unshift('기기 저장 공간 사용: ' + (rep.total / 1024).toFixed(0) + ' K자 (한도 약 5,000 K자)');
        return lines.join('\n');
    }

    /**
     * 옮길 키 고르기. currentStateKey(지금 회사 저장본)는 여기서 옮기지 않는다 — 그건 저장 경로가 따로 다룬다.
     * 반환: [{ key, idbKey }]
     */
    function movableKeys(storage, currentStateKey) {
        return keysOf(storage).filter(function (k) {
            if (k.indexOf(S357_IMG_PREFIX) === 0) return true;
            // 다른 회사·가입 전 저장본(지금 쓰는 것 아님) — IndexedDB 예비 저장본으로 옮기면 그 회사로 들어갈 때 거기서 읽는다
            if (k.indexOf(STATE_PREFIX) === 0 && k !== currentStateKey) return true;
            return false;
        }).map(function (k) { return { key: k, idbKey: idbKeyFor(k) }; });
    }

    function idbKeyFor(lsKey) {
        if (lsKey.indexOf(S357_IMG_PREFIX) === 0) return 's357img:' + lsKey.slice(S357_IMG_PREFIX.length);
        if (lsKey.indexOf(STATE_PREFIX) === 0) return 'state:' + lsKey;
        return 'ls:' + lsKey;
    }

    /** 옮긴 값의 IndexedDB 모양 — 저장본은 { raw, savedAt }(저장 경로의 예비 저장과 같은 모양) */
    function wrapFor(lsKey, raw) {
        if (lsKey.indexOf(STATE_PREFIX) === 0) return { raw: raw, savedAt: savedAtOf(raw), storageKey: lsKey, movedAt: Date.now() };
        return raw;
    }
    function unwrap(v) { return (v && typeof v === 'object' && typeof v.raw === 'string') ? v.raw : v; }

    function savedAtOf(raw) {
        if (typeof raw !== 'string') return 0;
        // 저장본 맨 앞의 "__savedAt"만 본다(건물 안의 다른 savedAt과 헷갈리지 않게 앞쪽 200자만)
        var m = raw.slice(0, 200).match(/"__savedAt":(\d{10,})/);
        return m ? Number(m[1]) : 0;
    }

    /**
     * 공간 만들기. io = { put(idbKey, value) → Promise, get(idbKey) → Promise }
     * 반환 { moved:[key], removed:[key], failed:[key], freedChars }
     */
    async function freeSpace(storage, io, opts) {
        opts = opts || {};
        var res = { moved: [], removed: [], failed: [], freedChars: 0 };
        if (!storage) return res;
        DISPOSABLE.forEach(function (k) {
            try {
                var v = storage.getItem(k);
                if (v != null) { storage.removeItem(k); res.removed.push(k); res.freedChars += k.length + v.length; }
            } catch (_e) { /* ignore */ }
        });
        if (!io || typeof io.put !== 'function' || typeof io.get !== 'function') return res;
        var list = movableKeys(storage, opts.currentStateKey || '');
        for (var i = 0; i < list.length; i++) {
            var it = list[i];
            var raw = null;
            try { raw = storage.getItem(it.key); } catch (_e) { raw = null; }
            if (raw == null) continue;
            try {
                var prev = await io.get(it.idbKey);
                // IndexedDB에 더 새 저장본이 있으면 덮지 않는다(옛 기기 저장본이 새 예비 저장본을 이기면 안 됨)
                var keepPrev = it.idbKey.indexOf('state:') === 0 && prev && typeof prev === 'object'
                    && Number(prev.savedAt) > savedAtOf(raw);
                if (!keepPrev) await io.put(it.idbKey, wrapFor(it.key, raw));
                var back = await io.get(it.idbKey);
                var ok = keepPrev ? !!back : unwrap(back) === raw;
                if (!ok) { res.failed.push(it.key); continue; }
                storage.removeItem(it.key);
                res.moved.push(it.key);
                res.freedChars += it.key.length + raw.length;
            } catch (_e) {
                res.failed.push(it.key);
            }
        }
        return res;
    }

    /** 쓰기 — 가득 차면 공간을 만든 뒤 한 번 더. 반환 { ok, retried, error, freed } */
    async function setWithRetry(storage, key, value, io, opts) {
        try { storage.setItem(key, value); return { ok: true, retried: false }; } catch (e) {
            if (!isQuotaError(e)) return { ok: false, retried: false, error: e };
            var freed = await freeSpace(storage, io, Object.assign({ currentStateKey: key }, opts || {}));
            try { storage.setItem(key, value); return { ok: true, retried: true, freed: freed }; } catch (e2) {
                return { ok: false, retried: true, error: e2, freed: freed };
            }
        }
    }

    /** 로그 같은 배열·맵을 개수로 자르기(새 것 남김) */
    function capList(list, max) {
        if (!Array.isArray(list) || list.length <= max) return list;
        return list.slice(list.length - max);
    }

    var api = {
        isQuotaError: isQuotaError, report: report, formatReport: formatReport, movableKeys: movableKeys,
        idbKeyFor: idbKeyFor, freeSpace: freeSpace, setWithRetry: setWithRetry, savedAtOf: savedAtOf,
        unwrap: unwrap, capList: capList, STATE_PREFIX: STATE_PREFIX, S357_IMG_PREFIX: S357_IMG_PREFIX
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.lsQuota = api; }
})(typeof window !== 'undefined' ? window : globalThis);
