/**
 * 2026-10-21 회차별 「작성완료」 표시 — 보고서 작성완료 / 결함위치도 작성완료.
 * 건물(= 한 회차 점검 기록)마다 bldg.roundDone = { report: { done, at, by, doneAt }, defectMap: {...} }
 *  - 칸마다 고친 시각(at)으로 비교해 더 나중 것을 남긴다(한 기기가 보고서, 다른 기기가 위치도를 체크해도 둘 다 남음).
 *  - 출력(PDF·한글·엑셀)에는 쓰지 않는다. 현장명 옆 배지 표시에만 쓴다.
 *  - 배지는 종류마다 「체크된 회차 중 가장 최근 회차」 하나만 보인다. 옛 회차 체크 기록은 그대로 둔다.
 */
(function (root) {
    'use strict';

    var KINDS = ['report', 'defectMap'];

    function normEntry(v) {
        if (!v || typeof v !== 'object') return null;
        return { done: v.done === true, at: Number(v.at) || 0, by: typeof v.by === 'string' ? v.by : '', doneAt: Number(v.doneAt) || 0 };
    }

    function getEntry(bldg, kind) {
        var m = bldg && bldg.roundDone;
        return (m && typeof m === 'object') ? normEntry(m[kind]) : null;
    }

    function isDone(bldg, kind) {
        var e = getEntry(bldg, kind);
        return !!(e && e.done);
    }

    /** 체크/해제. 값이 그대로면 false */
    function setDone(bldg, kind, done, user, now) {
        if (!bldg || KINDS.indexOf(kind) < 0) return false;
        var want = done === true;
        var prev = getEntry(bldg, kind);
        if ((prev ? prev.done : false) === want) return false;
        var t = Number(now);
        if (!Number.isFinite(t) || t <= 0) t = Date.now();
        var map = (bldg.roundDone && typeof bldg.roundDone === 'object' && !Array.isArray(bldg.roundDone)) ? bldg.roundDone : {};
        map[kind] = {
            done: want,
            at: Math.max(t, ((prev && prev.at) || 0) + 1),
            by: want ? String(user || '') : '',
            doneAt: want ? t : 0
        };
        bldg.roundDone = map;
        return true;
    }

    /** 칸(종류)마다 at이 큰 쪽. 동점이면 로컬 */
    function merge(localMap, remoteMap) {
        var out = {};
        var any = false;
        KINDS.forEach(function (k) {
            var r = remoteMap && typeof remoteMap === 'object' ? normEntry(remoteMap[k]) : null;
            var l = localMap && typeof localMap === 'object' ? normEntry(localMap[k]) : null;
            var w = l && (!r || l.at >= r.at) ? l : r;
            if (w) { out[k] = w; any = true; }
        });
        return any ? out : undefined;
    }

    /** 회차 키 "2026년_하반기" → 순서 숫자(수시 등은 null) */
    function roundRank(roundKey) {
        if (!roundKey) return null;
        var parts = String(roundKey).split('_');
        var y = parseInt(parts[0], 10);
        if (isNaN(y)) return null;
        var p = parts[1] === '상반기' ? 0 : (parts[1] === '하반기' ? 1 : null);
        return p === null ? null : y * 10 + p;
    }

    function roundKeyOf(bldg) {
        if (!bldg) return '';
        if (bldg.inspectionYear || bldg.inspectionPeriod) {
            return (bldg.inspectionYear || '') + '_' + (bldg.inspectionPeriod || '');
        }
        return '';
    }

    /** "2026년_하반기" → "2026년 하반기", 반기 없는 회차는 회차 이름 그대로 */
    function roundLabel(roundKey) {
        var parts = String(roundKey || '').split('_').filter(Boolean);
        return parts.join(' ') || '회차';
    }

    function badgeText(kind, roundKey) {
        if (kind === 'report') return roundLabel(roundKey) + ' 보고서 작성완료';
        return '결함위치도 작성완료';
    }

    /**
     * 현장(여러 회차·여러 동) 건물 목록 → 종류마다 최신 완료 회차 배지.
     * 한 회차에 동이 여럿이면 모든 동이 체크돼야 그 회차 완료.
     * 반환: [{ kind, roundKey, text, by, doneAt }]
     */
    function latestBadges(buildings, keyFn) {
        var kf = typeof keyFn === 'function' ? keyFn : roundKeyOf;
        var byRound = {};
        (buildings || []).forEach(function (b) {
            if (!b) return;
            var rk = kf(b) || '';
            (byRound[rk] = byRound[rk] || []).push(b);
        });
        var out = [];
        KINDS.forEach(function (kind) {
            var best = null;
            Object.keys(byRound).forEach(function (rk) {
                var members = byRound[rk];
                if (!members.length || !members.every(function (b) { return isDone(b, kind); })) return;
                var rank = roundRank(rk);
                var doneAt = 0, by = '';
                members.forEach(function (b) { var e = getEntry(b, kind); if (e.doneAt >= doneAt) { doneAt = e.doneAt; by = e.by; } });
                var cand = { kind: kind, roundKey: rk, text: badgeText(kind, rk), by: by, doneAt: doneAt, _rank: rank == null ? -1 : rank };
                if (!best || cand._rank > best._rank || (cand._rank === best._rank && cand.doneAt > best.doneAt)) best = cand;
            });
            if (best) { delete best._rank; out.push(best); }
        });
        return out;
    }

    var api = { KINDS: KINDS, getEntry: getEntry, isDone: isDone, setDone: setDone, merge: merge, latestBadges: latestBadges, badgeText: badgeText, roundLabel: roundLabel, roundRank: roundRank };
    root.BSA = root.BSA || {};
    root.BSA.roundDone = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
