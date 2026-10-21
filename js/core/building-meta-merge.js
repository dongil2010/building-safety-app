/**
 * 건물 점검 메타(종류·연도·상/하반기 등) 병합.
 * Firebase 동기화가 원격 건물을 베이스로 덮어 현장 목록 수정이 되돌아가는 것을 막는다.
 *
 * 2026-10-19 칸별 시각 비교: 예전에는 「업로드 대기(_pendingCloudSync)」면 시각을 보지 않고 로컬 메타가 통째로 이겼다.
 *  오프라인에서 준공일 하나만 고친 기기가 다시 연결되면, 그동안 다른 기기가 고친 건물명·점검자 같은 다른 칸까지 옛 값으로 되돌렸다.
 *  이제는 칸마다 고친 시각(metaFieldAt[칸])을 찍고, 칸마다 더 나중에 고친 쪽을 남긴다.
 *  - 이 기기에서 바뀐 칸은 _metaFieldHash(이 기기가 마지막으로 본 값, 기기에만 저장)와 비교해서 안다.
 *  - 칸 시각이 없는 옛 데이터는 예전처럼 metaUpdatedAt(건물 전체 시각)으로 비교한다.
 */
(function (root) {
    'use strict';

    // floorsOrderManual: 사용자가 층 순서를 직접 정했다는 표시. 빠져 있으면 병합 때
    // 원격의 옛 값(없음)으로 되돌아가 건물 복제에서 저층→고층으로 다시 정렬된다.
    // (floorsOrderUpdatedAt은 여기 넣지 않는다 — 순서와 무관한 메타 수정이 순서 시각을
    //  덮어써서 "마지막에 저장한 기기가 이김"이 되어 버린다. app.js에서 따로 병합.)
    var KEYS = [
        'inspectionType', 'inspectionYear', 'inspectionPeriod', 'latestSurveyRoundKey',
        'floorsOrderManual',
        'siteName', 'dong', 'multiDong', 'name', 'address', 'inspector', 'contactPhone',
        'floors', 'date', 'structureType', 'facilityGrade', 'completionDate', 'notes',
        // 반발경도 평균에 넣을 추정식 — 빠져 있어 동기화 때마다 서버 옛 값으로 초기화됐다(2026-09-22)
        'enabledStrengthFormulas',
        // 반발경도 장비 앤빌 평균(기준 82) — 같은 이유로 로컬 수정이 서버 옛 값에 덮이지 않게
        'strengthAnvilAvg',
        // 강도 재령일 건물 공통 직접 입력(비우면 준공일 기준 자동) — 2026-10-19
        'strengthAgeOverride',
        // 층별 "PDF를 뺀 시각" — 도면을 그림으로 바꾼 층의 옛 PDF를 다른 기기도 버리게(감사 O-05, 2026-09-28)
        'floorPdfRemovedAt',
        // 층별 "도면을 다시 넣은 시각" — 다른 기기가 받아 둔 옛 PDF를 버리고 새 파일을 받게
        'floorPdfUpdatedAt',
        // 상태평가용 평가단위 설정(단위 개수·층별 통째/나누기) — 2026-10-13
        'evalUnitPlan',
        // 평가 탭 입력표(평가단위 × 부재 값, 기울기) — 2026-10-13
        'evalInputs',
        // 평가 탭 SAFETY357 입력(평가단위 = 건물) — 2026-10-13
        'evalSafetyman',
        // 회차별 보고서/결함위치도 작성완료 표시(round-done.js) — 2026-10-21
        'roundDone'
    ];

    function metaUpdatedAt(bldg) {
        var n = Number(bldg && bldg.metaUpdatedAt);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function hashOf(v) {
        if (v === undefined) return 'u';
        var s;
        try { s = JSON.stringify(v); } catch (_e) { s = String(v); }
        if (s === undefined) return 'u';
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return s.length.toString(36) + ':' + (h >>> 0).toString(36);
    }

    /** 칸마다 지금 값의 지문 — 이 기기가 「본 값」으로 기억해 두고, 나중에 바뀐 칸을 찾는다 */
    function fieldHashes(bldg) {
        var o = {};
        KEYS.forEach(function (k) { o[k] = hashOf(bldg ? bldg[k] : undefined); });
        return o;
    }

    function fieldStamps(bldg) {
        var m = bldg && bldg.metaFieldAt;
        return (m && typeof m === 'object' && !Array.isArray(m)) ? m : null;
    }

    /**
     * 본 값(_metaFieldHash)과 달라진 칸에 시각을 찍는다. 반환: 찍은 칸 수.
     * 본 값 기록이 없으면(이 기기에서 아직 병합 전) 어떤 칸이 바뀌었는지 모른다 →
     *  allIfUnknown이면 모든 칸에 찍고(예전 「통째로 로컬」과 같지만 시각으로 비교됨), 아니면 아무것도 안 찍는다.
     */
    function stampChangedFields(bldg, ts, allIfUnknown) {
        if (!bldg) return 0;
        var t = Number(ts);
        if (!Number.isFinite(t) || t <= 0) t = Date.now();
        var base = bldg._metaFieldHash;
        var known = base && typeof base === 'object';
        if (!known && !allIfUnknown) return 0;
        var at = fieldStamps(bldg) ? bldg.metaFieldAt : {};
        var n = 0;
        var nextBase = known ? base : {};
        KEYS.forEach(function (k) {
            var h = hashOf(bldg[k]);
            if (known && nextBase[k] === h) return;
            if (!known && bldg[k] === undefined) { nextBase[k] = h; return; }
            // 이 기기가 본 시각보다 늘 뒤(시계가 늦은 기기도 「본 뒤에 고친 것」이 이기게)
            at[k] = Math.max(t, (Number(at[k]) || 0) + 1);
            nextBase[k] = h;
            n++;
        });
        if (n) bldg.metaFieldAt = at;
        bldg._metaFieldHash = nextBase;
        return n;
    }

    function markDirty(bldg, now) {
        if (!bldg) return bldg;
        var ts = Number(now);
        bldg.metaUpdatedAt = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
        bldg._pendingCloudSync = true;
        stampChangedFields(bldg, bldg.metaUpdatedAt, true);
        return bldg;
    }

    /**
     * (예전 함수 — 건물 전체 기준) 로컬 메타를 통째로 쓸지.
     * - 업로드 대기면 로컬 / 로컬 metaUpdatedAt 이 원격보다 같거나 더 최근이면 로컬
     * overlay는 이제 칸별 비교(fieldWinner)를 쓴다.
     */
    function shouldKeepLocal(localMatch, remote) {
        if (!localMatch) return false;
        if (localMatch._pendingCloudSync) return true;
        var localAt = metaUpdatedAt(localMatch);
        if (!localAt) return false;
        return localAt >= metaUpdatedAt(remote);
    }

    function applyLocal(merged, localMatch) {
        if (!merged || !localMatch) return merged;
        KEYS.forEach(function (key) {
            var val = localMatch[key];
            if (val == null || val === '') return;
            merged[key] = val;
        });
        if (metaUpdatedAt(localMatch)) merged.metaUpdatedAt = localMatch.metaUpdatedAt;
        return merged;
    }

    /** 칸 하나의 시각: 칸 시각 기록이 있으면 그것(없는 칸은 0), 기록 자체가 없는 옛 데이터면 건물 전체 시각 */
    function fieldAt(bldg, key) {
        var m = fieldStamps(bldg);
        if (m) return Number(m[key]) || 0;
        return metaUpdatedAt(bldg);
    }

    /** 이 칸은 로컬 값을 남길지 — 로컬 칸 시각이 있고 원격보다 같거나 나중일 때(동점은 방금 저장한 이 기기) */
    function localFieldWins(localMatch, remote, key) {
        var la = fieldAt(localMatch, key);
        if (!la) return false;
        if (la < fieldAt(remote, key)) return false;
        var v = localMatch[key];
        // 빈 값: 그 칸을 이 기기에서 일부러 비운 것(칸 시각 있음)일 때만 이긴다 — 옛 데이터의 빈칸이 서버 값을 지우지 않게
        if (v == null || v === '') {
            var m = fieldStamps(localMatch);
            return !!(m && Number(m[key]) > 0) && v !== undefined;
        }
        return true;
    }

    /** 층별 시각 맵. 키가 겹치면 더 나중 시각. 한쪽 메타가 통째로 이겨도 다른 층의 새 시각은 남긴다. */
    function mergeFloorStampMaps(localMap, remoteMap) {
        var out = {};
        function take(map) {
            if (!map || typeof map !== 'object') return;
            Object.keys(map).forEach(function (k) {
                var n = Number(map[k]) || 0;
                if (n > (Number(out[k]) || 0)) out[k] = n;
            });
        }
        take(remoteMap);
        take(localMap);
        return out;
    }

    /**
     * merged(원격 기준 건물)에 로컬 메타를 칸별로 얹는다.
     * 반환: merged — metaFieldAt(칸 시각, 양쪽 중 나중)·metaUpdatedAt(나중)·_metaFieldHash(이 기기가 본 값) 갱신
     */
    function overlay(merged, localMatch, remote) {
        if (!merged) return merged;
        if (localMatch) {
            // 수정 표시 없이 바뀐 칸도 놓치지 않게(본 값 기록이 있을 때만) — 그 기기의 마지막 수정 시각으로
            stampChangedFields(localMatch, metaUpdatedAt(localMatch) || Date.now(), false);
            KEYS.forEach(function (key) {
                if (localFieldWins(localMatch, remote, key)) merged[key] = localMatch[key];
            });
            var lm = fieldStamps(localMatch);
            var rm = fieldStamps(remote);
            if (lm || rm) merged.metaFieldAt = mergeFloorStampMaps(lm, rm);
            var at = Math.max(metaUpdatedAt(localMatch), metaUpdatedAt(remote));
            if (at) merged.metaUpdatedAt = at;
            if (localMatch._pendingCloudSync) merged._pendingCloudSync = true;
            if (localMatch.roundDone || (remote && remote.roundDone)) {
                var rdApi = root.BSA && root.BSA.roundDone;
                if (!rdApi && typeof require === 'function') { try { rdApi = require('./round-done.js'); } catch (_e) { rdApi = null; } }
                if (rdApi) {
                    var rdm = rdApi.merge(localMatch.roundDone, remote && remote.roundDone);
                    if (rdm) merged.roundDone = rdm;
                }
            }
            if (localMatch.roundDates || (remote && remote.roundDates)) {
                merged.roundDates = mergeRoundDates(localMatch.roundDates, remote && remote.roundDates);
            }
        }
        merged._metaFieldHash = fieldHashes(merged);
        return merged;
    }

    /**
     * 2026-10-20 회차별 점검일 — bldg.roundDates = { '2026년_하반기': { date: 'YYYY-MM-DD', at: 고친시각 } }
     *  회차(키)마다 따로 고친 시각으로 비교해 더 나중 것을 남긴다(다른 회차를 고친 기기끼리 서로 안 지움).
     *  회차 날짜가 없으면 예전 건물 공통 점검일(bldg.date)을 쓴다.
     */
    function normalizeRoundDateEntry(v) {
        if (v == null) return null;
        if (typeof v === 'string') return { date: v, at: 0 };
        if (typeof v !== 'object') return null;
        return { date: typeof v.date === 'string' ? v.date : '', at: Number(v.at) || 0 };
    }

    function mergeRoundDates(localMap, remoteMap) {
        var out = {};
        function take(map, preferOnTie) {
            if (!map || typeof map !== 'object' || Array.isArray(map)) return;
            Object.keys(map).forEach(function (k) {
                var e = normalizeRoundDateEntry(map[k]);
                if (!e) return;
                var cur = out[k];
                if (!cur || e.at > cur.at || (preferOnTie && e.at === cur.at)) out[k] = e;
            });
        }
        take(remoteMap, false);
        take(localMap, true);
        return out;
    }

    function getRoundDate(bldg, roundKey) {
        if (!bldg) return '';
        var map = bldg.roundDates;
        if (roundKey && map && typeof map === 'object') {
            var e = normalizeRoundDateEntry(map[roundKey]);
            if (e && e.date) return e.date;
        }
        return bldg.date || '';
    }

    /** 회차 점검일을 정한다. 값이 그대로면 시각을 안 찍는다(반환 false). 빈 값이면 그 회차는 건물 공통 점검일로 돌아간다. */
    function setRoundDate(bldg, roundKey, date, now) {
        if (!bldg || !roundKey) return false;
        var map = (bldg.roundDates && typeof bldg.roundDates === 'object' && !Array.isArray(bldg.roundDates)) ? bldg.roundDates : {};
        var prev = normalizeRoundDateEntry(map[roundKey]);
        var next = String(date == null ? '' : date).trim();
        if (prev && prev.date === next) return false;
        if (!prev && !next) return false;
        var t = Number(now);
        if (!Number.isFinite(t) || t <= 0) t = Date.now();
        map[roundKey] = { date: next, at: Math.max(t, ((prev && prev.at) || 0) + 1) };
        bldg.roundDates = map;
        return true;
    }

    /** 옛 데이터 옮기기: 이 회차 날짜가 없고 건물 공통 점검일이 있으면 그 날짜를 이 회차 것으로 적어 둔다(시각 0 = 다른 기기 값이 늘 이김). */
    function seedRoundDate(bldg, roundKey) {
        if (!bldg || !roundKey || !bldg.date) return false;
        var map = (bldg.roundDates && typeof bldg.roundDates === 'object' && !Array.isArray(bldg.roundDates)) ? bldg.roundDates : {};
        if (normalizeRoundDateEntry(map[roundKey])) return false;
        map[roundKey] = { date: bldg.date, at: 0 };
        bldg.roundDates = map;
        return true;
    }

    var api = {
        mergeRoundDates: mergeRoundDates,
        getRoundDate: getRoundDate,
        setRoundDate: setRoundDate,
        seedRoundDate: seedRoundDate,
        KEYS: KEYS,
        metaUpdatedAt: metaUpdatedAt,
        markDirty: markDirty,
        mergeFloorStampMaps: mergeFloorStampMaps,
        shouldKeepLocal: shouldKeepLocal,
        applyLocal: applyLocal,
        overlay: overlay,
        fieldHashes: fieldHashes,
        stampChangedFields: stampChangedFields,
        localFieldWins: localFieldWins,
        hashOf: hashOf
    };

    root.BSA = root.BSA || {};
    root.BSA.buildingMetaMerge = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
