/**
 * 한글(HWPX) 비파괴조사 위치도 — 캡션 번호·삽입 목록.
 * 작성하지 않은 항목은 목록에서 빼고, 넣은 위치도는 7.1.8부터 번호를 붙인다.
 */
(function (root) {
    'use strict';

    function compact(text) {
        return String(text || '').replace(/\s+/g, '');
    }

    function headingContains(paraText, needle) {
        return compact(paraText).indexOf(compact(needle)) >= 0;
    }

    function listLocationMapJobs(flags) {
        const jobs = [];
        if (flags && flags.measure) {
            jobs.push({ category: '실측', title: '부재실측 위치도', imgIdPrefix: 'ndtLocMapMeasure' });
        }
        if (flags && flags.strengthCarb) {
            jobs.push({ category: '일반비파괴', title: '비파괴장비조사 위치도', imgIdPrefix: 'ndtLocMapStrengthCarb' });
        }
        if (flags && flags.fireproof) {
            jobs.push({ category: '내화피복', title: '내화피복 측정 위치도', imgIdPrefix: 'ndtLocMapFireproof' });
        }
        if (flags && flags.tilt) {
            jobs.push({ category: '기울기', title: '외벽 기울기 측정 위치도', imgIdPrefix: 'ndtLocMapTilt' });
        }
        if (flags && flags.settlement) {
            jobs.push({ category: '변위', title: '부동침하 기울기 측정 위치도', imgIdPrefix: 'ndtLocMapSettlement' });
        }
        if (flags && flags.memberDisp) {
            jobs.push({ category: '부재변위', title: '변위측정 위치도', imgIdPrefix: 'ndtLocMapMemberDisp' });
        }
        return jobs;
    }

    /** seq 1 → 7.1.8 */
    function formatCaption(seq, title, floorLabel, manyFloors) {
        const num = '7.1.' + (7 + seq);
        const floor = (manyFloors && floorLabel) ? (String(floorLabel).trim() + ' ') : '';
        return num + ' ' + floor + title;
    }

    function uniqueFloorCodes(items, category) {
        const codes = [];
        (items || []).forEach(function (it) {
            if (!it) return;
            if (category === '일반비파괴') {
                if (it.category !== '강도' && it.category !== '탄산화') return;
            } else if (category === '변위') {
                if (it.category && it.category !== '변위') return;
            } else if (it.category && it.category !== category) return;
            const c = it._ndtFloorCode;
            if (c && codes.indexOf(c) < 0) codes.push(c);
        });
        return codes;
    }

    function sourceForJob(job, items, groups) {
        if (!job) return items || [];
        if (job.category === '변위' || job.category === '부재변위') return groups || [];
        return items || [];
    }

    /**
     * 작성한 항목×층만 위치도 삽입 목록으로 펼친다. seq 1 → 캡션 7.1.8
     */
    function expandLocationMapInserts(flags, items, groups, fallbackFloor, getFloorLabel) {
        const jobs = listLocationMapJobs(flags);
        const inserts = [];
        let seq = 0;
        jobs.forEach(function (job) {
            const source = sourceForJob(job, items, groups);
            let floors = uniqueFloorCodes(source, job.category);
            if (floors.length === 0 && fallbackFloor) floors = [fallbackFloor];
            if (floors.length === 0) return;
            const many = floors.length > 1;
            floors.forEach(function (fc) {
                seq += 1;
                const hit = source.find(function (it) { return it && it._ndtFloorCode === fc; });
                let floorLabel = (hit && hit._ndtFloorLabel) || '';
                if (!floorLabel && typeof getFloorLabel === 'function') {
                    try { floorLabel = getFloorLabel(fc) || ''; } catch (_e) { floorLabel = ''; }
                }
                if (!floorLabel) floorLabel = fc;
                inserts.push({
                    category: job.category,
                    title: job.title,
                    imgIdPrefix: job.imgIdPrefix,
                    floorCode: fc,
                    caption: formatCaption(seq, job.title, floorLabel, many)
                });
            });
        });
        return inserts;
    }

    /** 작성 안 한 항목의 제목 문단(결과표·위치도 잔여)을 한글에서 뺄지 */
    function shouldDropEmptyHeading(paraText, flags) {
        const t = compact(paraText);
        if (!t) return false;
        if (t.indexOf('사진첩') >= 0 || t.indexOf('상태조사표') >= 0) return false;
        const empty = function (written, needles) {
            if (written) return false;
            return needles.some(function (n) { return t.indexOf(compact(n)) >= 0; });
        };
        if (empty(flags && flags.measure, ['부재실측'])) return true;
        if (empty(flags && flags.strength, ['콘크리트 강도', '반발경도', '강도측정'])) return true;
        if (empty(flags && flags.carb, ['탄산화'])) return true;
        if (empty(flags && flags.fireproof, ['내화피복'])) return true;
        if (empty(flags && flags.tilt, ['외벽 기울기', '기울기 측정'])) return true;
        if (empty(flags && flags.settlement, ['부동침하'])) return true;
        if (empty(flags && flags.memberDisp, ['부재처짐', '부재변위'])) return true;
        return false;
    }

    var api = {
        headingContains: headingContains,
        listLocationMapJobs: listLocationMapJobs,
        formatCaption: formatCaption,
        uniqueFloorCodes: uniqueFloorCodes,
        expandLocationMapInserts: expandLocationMapInserts,
        shouldDropEmptyHeading: shouldDropEmptyHeading
    };

    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxNdtMaps = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
