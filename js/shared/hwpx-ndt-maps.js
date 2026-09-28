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
            const c = it._ndtFloorCode || it.floorCode;
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
                    // floorLabel/manyFloors: 캡션을 부르는 쪽에서 다시 조립할 수 있게 같이 넘긴다.
                    // (한글 템플릿의 개요번호 제목을 살려 쓰는 경우 캡션은 [도면 7-N]으로 따로 매긴다)
                    floorLabel: floorLabel,
                    manyFloors: many,
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

    /**
     * "비파괴 장비조사 사진첩" 소제목 순서(2026-09-28). from: 비파괴 항목(items) / 부동침하·부재처짐 구역(groups).
     * 구역의 category가 비어 있으면 옛 부동침하 구역이다.
     */
    var PHOTO_ALBUM_SECTIONS = [
        { from: 'items', category: '실측', title: '부재실측' },
        { from: 'items', category: '강도', title: '콘크리트 강도' },
        { from: 'items', category: '탄산화', title: '콘크리트 탄산화' },
        { from: 'items', category: '내화피복', title: '내화피복 두께' },
        { from: 'items', category: '기울기', title: '외벽 기울기' },
        { from: 'items', category: '부재변위', title: '부재 변위' },
        { from: 'groups', category: '변위', title: '바닥 부동침하' },
        { from: 'groups', category: '부재변위', title: '부재 처짐(변위)' }
    ];

    function text(v) {
        return String(v == null ? '' : v).trim();
    }

    /**
     * 사진이 있는 항목·구역만 소제목별로 모은다. 사진 번호(사진1…)는 사진첩 전체에 이어서 매긴다.
     * items: buildCombinedNdtDataForReport의 allItems(location에 층 이름이 이미 붙어 있다)
     * groups: allDispGroups(_ndtFloorLabel)
     * 반환: [{ title, entries: [{ photoId, label, location, content }] }]
     */
    function buildPhotoAlbumSections(items, groups) {
        var seq = 0;
        var out = [];
        PHOTO_ALBUM_SECTIONS.forEach(function (sec) {
            var source = sec.from === 'groups' ? (groups || []) : (items || []);
            var entries = [];
            source.forEach(function (rec) {
                if (!rec) return;
                var cat = sec.from === 'groups' ? (rec.category || '변위') : rec.category;
                if (cat !== sec.category) return;
                var ids = Array.isArray(rec.photoIds) ? rec.photoIds.filter(Boolean) : [];
                if (!ids.length) return;
                var location;
                var no;
                if (sec.from === 'groups') {
                    location = [text(rec._ndtFloorLabel), text(rec.locationType)].filter(Boolean).join(' ');
                    no = text(rec.groupNo);
                } else {
                    location = text(rec.location);
                    var comp = text(rec.component);
                    if (comp && location.replace(/\s+/g, '').indexOf(comp.replace(/\s+/g, '')) < 0) {
                        location = location ? location + ' ' + comp : comp;
                    }
                    no = text(rec.no);
                }
                var content = no ? sec.title + ' ' + no : sec.title;
                ids.forEach(function (pid) {
                    seq += 1;
                    entries.push({ photoId: pid, label: '사진' + seq, location: location || '-', content: content });
                });
            });
            if (entries.length) out.push({ title: sec.title, entries: entries });
        });
        return out;
    }

    var api = {
        headingContains: headingContains,
        listLocationMapJobs: listLocationMapJobs,
        formatCaption: formatCaption,
        uniqueFloorCodes: uniqueFloorCodes,
        expandLocationMapInserts: expandLocationMapInserts,
        shouldDropEmptyHeading: shouldDropEmptyHeading,
        PHOTO_ALBUM_SECTIONS: PHOTO_ALBUM_SECTIONS,
        buildPhotoAlbumSections: buildPhotoAlbumSections
    };

    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxNdtMaps = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
