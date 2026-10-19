/**
 * 회사 공통 설정(루트 문서) 키별 병합 — 2026-10-19
 * 예전: 동기화 때마다 이 기기의 설정 맵(격자·스타일 색·층 격자선·지도 스타일…)을 통째로 서버에 덮어써서,
 *  오프라인이던 기기가 다시 연결되면 그동안 다른 기기가 바꾼 설정을 옛 값으로 되돌렸다(나중에 쓴 쪽이 통째로 이김).
 * 지금: 설정을 "칸(경로)" 단위로 쪼갠다 — 맵 설정은 맵 키 하나(예: floorGridLines의 층 하나)가 한 칸, 나머지는 설정 하나가 한 칸.
 *  - 이 기기에서 바뀐 칸만 「올릴 칸」으로 시각과 함께 적는다(기기 저장소).
 *  - 올릴 때는 그 칸만 경로 지정으로 쓴다. 서버의 그 칸 시각(settingsAt)이 더 나중이면 쓰지 않고 서버 값을 따른다.
 *  - 받을 때는 아직 안 올린 칸만 내 값을 남기고 나머지는 서버 값을 따른다.
 * 서버 규칙·다른 데이터는 그대로. 순수 함수 — app.js와 테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    // [키, 깊이] — 깊이 2: 맵(값이 객체면 맵 키 하나가 한 칸), 1: 통째로 한 칸
    var SPEC = [
        ['grids', 2],
        ['styleColors', 2],
        ['styleColorsPaletteVersion', 1],
        ['styleSizes', 2],
        ['defectLeaderLineScale', 1],
        ['ndtLeaderLineScale', 1],
        ['styleSizeBarLockedMap', 1],
        ['styleSizeBarLockedNdt', 1],
        ['floorMapStyleSettings', 2],
        ['floorDrawingRotations', 2],
        ['floorGridLines', 2],
        ['floorPrintCrops', 2],
        ['floorDrawingDarken', 2],
        ['styleShapes', 2],
        ['locationMapLegend', 1],
        ['locationMapLegendBox', 1]
    ];
    var KEYS = SPEC.map(function (s) { return s[0]; });
    var DEPTH = {};
    SPEC.forEach(function (s) { DEPTH[s[0]] = s[1]; });
    var SEP = '/';
    var ABSENT = 'u';

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v)
            && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
    }

    function hashOf(v) {
        if (v === undefined) return ABSENT;
        var s;
        try { s = JSON.stringify(v); } catch (_e) { s = String(v); }
        if (s === undefined) return ABSENT;
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return s.length.toString(36) + ':' + (h >>> 0).toString(36);
    }

    function pathOf(key, sub) { return sub == null ? key : key + SEP + sub; }
    function splitPath(p) {
        var i = String(p).indexOf(SEP);
        return i < 0 ? { key: String(p), sub: null } : { key: p.slice(0, i), sub: p.slice(i + 1) };
    }

    /** 설정 객체(state 모양) → { 경로: 값 }. 없는 설정은 칸이 없다. */
    function flatten(obj) {
        var out = {};
        if (!obj) return out;
        KEYS.forEach(function (key) {
            var v = obj[key];
            if (v === undefined) return;
            if (DEPTH[key] === 2 && isPlainObject(v)) {
                Object.keys(v).forEach(function (sub) {
                    if (v[sub] !== undefined) out[pathOf(key, sub)] = v[sub];
                });
                return;
            }
            out[pathOf(key, null)] = v;
        });
        return out;
    }

    function hashes(flat) {
        var out = {};
        Object.keys(flat || {}).forEach(function (p) { out[p] = hashOf(flat[p]); });
        return out;
    }

    /**
     * 기기 저장 기록 { base: {경로: 해시}, at: {경로: 시각}, dirty: {경로: {at, h}} }
     *  base = 마지막으로 서버와 맞춘 값 · at = 그 값의 서버 칸 시각(이보다 옛 스냅샷은 무시) · dirty = 아직 안 올린 칸
     */
    function emptyStore() { return { v: 1, base: {}, at: {}, dirty: {} }; }
    function normalizeStore(s) {
        if (!s || typeof s !== 'object' || !s.base || typeof s.base !== 'object') return null;
        return {
            v: 1,
            base: s.base,
            at: (s.at && typeof s.at === 'object') ? s.at : {},
            dirty: (s.dirty && typeof s.dirty === 'object') ? s.dirty : {}
        };
    }
    /** 기록이 없으면(처음) 지금 기기 값을 기준으로 — 「바뀐 칸 없음」에서 시작 */
    function initStore(flatLocal) {
        var s = emptyStore();
        s.base = hashes(flatLocal);
        return s;
    }

    /**
     * 이 기기 값이 기준(base)과 달라진 칸을 「올릴 칸」으로 적는다. 다시 같아지면 지운다.
     * 반환: 바뀐 것이 있으면 true(저장 필요)
     */
    function trackLocal(store, flatLocal, now) {
        var changed = false;
        var t = Number(now) || Date.now();
        var seen = {};
        Object.keys(flatLocal || {}).forEach(function (p) { seen[p] = 1; });
        Object.keys(store.base).forEach(function (p) { seen[p] = 1; });
        Object.keys(store.dirty).forEach(function (p) { seen[p] = 1; });
        Object.keys(seen).forEach(function (p) {
            var h = hashOf(flatLocal ? flatLocal[p] : undefined);
            var base = Object.prototype.hasOwnProperty.call(store.base, p) ? store.base[p] : ABSENT;
            var d = store.dirty[p];
            if (h === base) {
                if (d) { delete store.dirty[p]; changed = true; }
                return;
            }
            if (!d || d.h !== h) {
                // 이 칸에 대해 본 서버 시각보다 늘 뒤 — 받은 뒤에 고친 것은 시계가 늦은 기기라도 이긴다
                var seenAt = Number(store.at && store.at[p]) || 0;
                store.dirty[p] = { at: Math.max(t, d ? (Number(d.at) || 0) + 1 : 0, seenAt + 1), h: h };
                changed = true;
            }
        });
        return changed;
    }

    function serverStampOf(serverData, p) {
        var m = serverData && serverData.settingsAt;
        if (!m || typeof m !== 'object') return 0;
        var n = Number(m[p]);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    /** 서버 문서에서 칸 값 — 설정이 아예 없거나 null이면(예전 동작처럼) 「서버에 없음」 */
    function serverHasKey(serverData, key) {
        return !!serverData && serverData[key] !== undefined && serverData[key] !== null;
    }

    /**
     * 올릴 계획. serverData: 쓰기 직전에 서버에서 읽은 루트 문서.
     * 반환: { writes: [{path, key, sub, value, at, h}], adopt: [{path, key, sub, value}] }
     *  - writes: 이 칸만 경로 지정으로 쓴다(value === undefined면 칸 지우기)
     *  - adopt: 서버 칸이 내 수정보다 나중 — 쓰지 않고 서버 값을 따른다
     */
    function planWrite(store, flatLocal, serverData) {
        var writes = [];
        var adopt = [];
        var serverFlat = flatten(serverData || {});
        Object.keys(store.dirty).sort().forEach(function (p) {
            var d = store.dirty[p];
            var sp = splitPath(p);
            if (KEYS.indexOf(sp.key) < 0) { delete store.dirty[p]; return; }
            var serverAt = serverStampOf(serverData, p);
            if (serverAt > (Number(d.at) || 0)) {
                adopt.push({ path: p, key: sp.key, sub: sp.sub, value: serverFlat[p], serverAt: serverAt });
                return;
            }
            var v = flatLocal ? flatLocal[p] : undefined;
            writes.push({ path: p, key: sp.key, sub: sp.sub, value: v, at: Number(d.at) || 0, h: hashOf(v) });
        });
        return { writes: writes, adopt: adopt };
    }

    /** 서버 칸이 더 나중이라 내 값을 버리고 서버 값을 따를 때 — 기록 정리 */
    function afterAdopt(store, adopt) {
        (adopt || []).forEach(function (a) {
            delete store.dirty[a.path];
            store.base[a.path] = hashOf(a.value);
            if (a.serverAt) store.at[a.path] = a.serverAt;
        });
    }

    /** 쓰기가 끝난 칸: 기준을 쓴 값으로, 그 뒤에 또 안 고쳤으면 「올릴 칸」에서 뺀다 */
    function afterWrite(store, writes) {
        (writes || []).forEach(function (w) {
            store.base[w.path] = w.h;
            if (w.at) store.at[w.path] = w.at;
            var d = store.dirty[w.path];
            if (d && d.h === w.h) delete store.dirty[w.path];
        });
    }

    function clone(v) {
        if (v === undefined || v === null || typeof v !== 'object') return v;
        try { return JSON.parse(JSON.stringify(v)); } catch (_e) { return v; }
    }

    /**
     * 서버 문서를 받을 때. localObj: 지금 기기 설정(state 모양) — 바꾸지 않는다.
     * 반환: { values: {키: 새 값}, keys: [바뀐 키] } — 아직 안 올린 칸은 내 값을 남긴다.
     * 서버에 그 설정이 아예 없으면 기기 값을 그대로 두고, 그 칸들을 올릴 칸으로 적는다(서버를 채우게).
     */
    function applyIncoming(store, localObj, serverData, now) {
        var values = {};
        var keys = [];
        var t = Number(now) || Date.now();
        var localFlat = flatten(localObj || {});
        // 받기 전에 이 기기에서 바뀐 칸부터 적는다(아직 저장 안 한 수정도 지키게)
        trackLocal(store, localFlat, t);
        // 이 칸에 대해 기기가 아는 것보다 옛 스냅샷이면(방금 내가 쓴 칸을 쓰기 전 스냅샷이 되돌리는 것) 무시
        function staleFor(p) {
            var known = Number(store.at[p]) || 0;
            return known > 0 && serverStampOf(serverData, p) < known;
        }
        function keepMine(p) { return !!store.dirty[p] || staleFor(p); }
        function noteBase(p, v) {
            if (staleFor(p)) return;
            store.base[p] = hashOf(v);
            var sAt = serverStampOf(serverData, p);
            if (sAt) store.at[p] = sAt;
        }
        KEYS.forEach(function (key) {
            var depth = DEPTH[key];
            if (!serverHasKey(serverData, key)) {
                // 서버에 없음 — 기기 값을 올리게(아주 이른 시각: 서버에 시각 있는 칸이 생기면 그쪽이 이김)
                Object.keys(localFlat).forEach(function (p) {
                    if (splitPath(p).key !== key) return;
                    if (!store.dirty[p]) store.dirty[p] = { at: 1, h: hashOf(localFlat[p]) };
                    store.base[p] = ABSENT;
                });
                return;
            }
            var sv = serverData[key];
            var lv = localObj ? localObj[key] : undefined;
            var next;
            if (depth === 2 && isPlainObject(sv)) {
                next = clone(sv);
                var subsSeen = {};
                Object.keys(sv).forEach(function (sub) { subsSeen[sub] = 1; });
                if (isPlainObject(lv)) Object.keys(lv).forEach(function (sub) { subsSeen[sub] = 1; });
                Object.keys(store.base).forEach(function (p) { var s = splitPath(p); if (s.key === key && s.sub != null) subsSeen[s.sub] = 1; });
                Object.keys(subsSeen).forEach(function (sub) {
                    var p = pathOf(key, sub);
                    var mineWins = keepMine(p);
                    noteBase(p, sv[sub]);
                    if (mineWins) {
                        var mine = isPlainObject(lv) ? lv[sub] : undefined;
                        if (mine === undefined) delete next[sub];
                        else next[sub] = clone(mine);
                    }
                });
                // 예전 모양(통째 한 칸) 기준이 남아 있으면 정리
                if (Object.prototype.hasOwnProperty.call(store.base, key)) delete store.base[key];
            } else {
                var p1 = pathOf(key, null);
                var mine1 = keepMine(p1);
                noteBase(p1, sv);
                next = mine1 ? clone(lv) : clone(sv);
            }
            if (hashOf(next) !== hashOf(lv)) keys.push(key);
            values[key] = next;
        });
        // 받은 값과 같아진 칸은 올릴 필요가 없다
        var merged = {};
        KEYS.forEach(function (k) { merged[k] = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : (localObj ? localObj[k] : undefined); });
        trackLocal(store, flatten(merged), t);
        return { values: values, keys: keys };
    }

    /** 경로 지정 쓰기용 인자 [FieldPath, 값, …]. makePath(a, b?) · del(): 칸 지우기 값 */
    function buildUpdateArgs(writes, makePath, del) {
        var args = [];
        (writes || []).forEach(function (w) {
            args.push(w.sub == null ? makePath(w.key) : makePath(w.key, w.sub));
            args.push(w.value === undefined ? del() : w.value);
            args.push(makePath('settingsAt', w.path));
            args.push(w.at || 1);
        });
        return args;
    }

    /** state 모양 객체의 칸 하나에 값 넣기(서버 값을 따를 때) */
    function setPath(obj, key, sub, value) {
        if (!obj) return;
        if (sub == null) {
            if (value === undefined) delete obj[key];
            else obj[key] = clone(value);
            return;
        }
        if (!isPlainObject(obj[key])) {
            if (value === undefined) return;
            obj[key] = {};
        }
        if (value === undefined) delete obj[key][sub];
        else obj[key][sub] = clone(value);
    }

    var api = {
        SPEC: SPEC, KEYS: KEYS, hashOf: hashOf, flatten: flatten, hashes: hashes,
        initStore: initStore, normalizeStore: normalizeStore, trackLocal: trackLocal,
        planWrite: planWrite, afterWrite: afterWrite, afterAdopt: afterAdopt, applyIncoming: applyIncoming,
        buildUpdateArgs: buildUpdateArgs, setPath: setPath, splitPath: splitPath
    };
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.companySettingsMerge = api;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
