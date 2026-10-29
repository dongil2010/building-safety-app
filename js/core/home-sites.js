/**
 * 홈(현장 목록) 요약·정렬·탭 분리용 순수 계산 (2026-10-28 사용자 요청).
 * 이미 불러온 현장(건물) 레코드만 쓴다 — 서버를 읽지 않는다.
 *
 * 정의
 *  - 현장 = 현장명(siteName)으로 묶은 건물들(동 분할이면 동마다 건물). 삭제·휴지통 건물은 호출 쪽에서 미리 뺀다.
 *  - 최종 회차 = 그 현장의 회차 중 순서(연도·상/하반기)가 가장 큰 회차.
 *  - 보고서 작성 = 기존 「회차 작성완료」(bldg.roundDone.report.done). 최종 회차의 모든 동이 체크돼야 작성 완료.
 *  - 점검(다녀온) 날짜 = 최종 회차 점검일(동이 여럿이면 가장 이른 날짜).
 *  - 다녀온 현장 = 점검일이 오늘 이전(오늘 포함)이거나 최종 회차 보고서가 이미 작성된 현장.
 *  - 남은 보고서 = 다녀왔는데 최종 회차 보고서가 아직 안 쓰인 현장 수.
 *  - 결함위치도 작성 = 기존 「결함위치도 작성완료」(bldg.roundDone.defectMap.done). 최종 회차의 모든 동이 체크돼야 완료.
 *  - 결함위치도 남은 수 = 다녀왔는데 최종 회차 결함위치도가 아직 작성완료로 체크되지 않은 현장 수(2026-10-29).
 */
(function (root) {
    'use strict';

    var DATE_RE = /^\d{4}-\d{2}-\d{2}/;

    function validDate(s) {
        return typeof s === 'string' && DATE_RE.test(s) ? s.slice(0, 10) : '';
    }

    /**
     * deps: { roundKeyOf(b), roundRank(rk), inspectionDate(b, rk), isReportDone(b), isMapDone(b)? }
     * 반환: { latestRound, done, mapDone, date, visited, count } 또는 null
     */
    function siteStatus(members, deps, today) {
        var list = (members || []).filter(Boolean);
        if (!list.length) return null;
        var items = list.map(function (b) {
            var rk = deps.roundKeyOf(b) || '';
            return { b: b, rk: rk, rank: deps.roundRank(rk) };
        });
        var ranked = items.filter(function (x) { return x.rank != null; });
        var pool = ranked.length ? ranked : items;
        var latestKey = null;
        var bestRank = -Infinity;
        pool.forEach(function (x) {
            if (ranked.length) {
                if (x.rank > bestRank) { bestRank = x.rank; latestKey = x.rk; }
            } else if (latestKey === null || String(x.rk) > String(latestKey)) {
                latestKey = x.rk;
            }
        });
        var latest = pool.filter(function (x) { return x.rk === latestKey; });
        var done = latest.every(function (x) { return !!deps.isReportDone(x.b); });
        var mapDone = typeof deps.isMapDone === 'function' && latest.every(function (x) { return !!deps.isMapDone(x.b); });
        var dates = latest.map(function (x) { return validDate(deps.inspectionDate(x.b, x.rk)); }).filter(Boolean).sort();
        var date = dates[0] || '';
        var visited = done || (!!date && !!today && date <= today);
        return { latestRound: latestKey, done: done, mapDone: mapDone, date: date, visited: visited, count: latest.length };
    }

    function summarize(statuses) {
        var s = (statuses || []).filter(Boolean);
        return {
            total: s.length,
            unwritten: s.filter(function (x) { return !x.done; }).length,
            visited: s.filter(function (x) { return x.visited; }).length,
            remaining: s.filter(function (x) { return x.visited && !x.done; }).length,
            done: s.filter(function (x) { return x.done; }).length,
            mapRemaining: s.filter(function (x) { return x.visited && !x.mapDone; }).length
        };
    }

    /** 이른 점검일이 위. 점검일 없는 현장은 맨 아래(그 안에서는 이름순). 같은 날짜는 이름순 */
    function compareSites(a, b) {
        var da = a.date || '';
        var db = b.date || '';
        if (da && db && da !== db) return da < db ? -1 : 1;
        if (da && !db) return -1;
        if (!da && db) return 1;
        return String(a.name).localeCompare(String(b.name), 'ko');
    }

    function todayLocal(now) {
        var d = now || new Date();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    }

    var api = { siteStatus: siteStatus, summarize: summarize, compareSites: compareSites, todayLocal: todayLocal, validDate: validDate };
    root.BSA = root.BSA || {};
    root.BSA.homeSites = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
