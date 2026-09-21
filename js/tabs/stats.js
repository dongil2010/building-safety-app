/* 탭: 통계 — 층별·전체·층묶음 결함 종류 집계 + 강도·탄산화 */
(function (root) {
    'use strict';

    root.BSA = root.BSA || { tabs: {}, shared: {} };

    /** "1F"·"지상5층"·"5층"처럼 표기가 달라도 같은 지상층으로 본다 —
     * 층묶음 평균이 표기 차이로 쪼개지면 지상1층 4개 + 지상5층 4개가 8개로 합쳐지지 않는다 */
    function parseGroundFloorNumber(floorCode) {
        var fi = root.BSA && root.BSA.floorIdentity;
        if (fi && typeof fi.parseGroundNumber === 'function') {
            var n = fi.parseGroundNumber(floorCode);
            if (n != null) return n;
        }
        var raw = String(floorCode || '').trim();
        var m = raw.toUpperCase().match(/^([0-9]{1,2})\s*F$/);
        if (m) return parseInt(m[1], 10);
        m = raw.match(/^지상\s*([0-9]{1,2})\s*층?$/);
        if (m) return parseInt(m[1], 10);
        m = raw.match(/^([0-9]{1,2})\s*층$/);
        if (m) return parseInt(m[1], 10);
        return null;
    }

    function classifyFloorGroup(floorCode) {
        var c = String(floorCode || '').toUpperCase().trim();
        var raw = String(floorCode || '');
        if (/^B\s*\d+\s*F?$/i.test(c) || raw.indexOf('지하') >= 0) {
            return { key: 'basement', label: '지하층', sort: 100 };
        }
        if (c === 'ROOF' || raw.indexOf('옥상') >= 0) {
            return { key: 'roof', label: '옥상층', sort: 9000 };
        }
        if (c === 'PH' || c === 'PH_ROOF' || raw.indexOf('옥탑') >= 0) {
            return { key: 'penthouse', label: '옥탑층', sort: 9100 };
        }
        if (c.indexOf('EXT') === 0 || raw.indexOf('외부') >= 0 || raw.indexOf('부대') >= 0) {
            return { key: 'external', label: '부대·외부', sort: 9200 };
        }
        var ground = parseGroundFloorNumber(raw);
        if (ground != null) {
            return { key: 'ground', label: '지상층', sort: 1000 + ground, sub: ground + 'F' };
        }
        return { key: 'other', label: '기타', sort: 8000 };
    }

    function getCoarseFloorGroup(floorCode) {
        var info = classifyFloorGroup(floorCode);
        if (info.key === 'ground') return { key: 'ground_all', label: '지상층', sort: 2000 };
        if (info.key === 'basement') return { key: 'basement_all', label: '지하층', sort: 100 };
        if (info.key === 'roof' || info.key === 'penthouse') return { key: 'roof_all', label: '옥상·옥탑', sort: 9000 };
        if (info.key === 'external') return { key: 'external_all', label: '부대·외부', sort: 9100 };
        return { key: 'other_all', label: '기타', sort: 8000 };
    }

    function toNum(v) {
        if (typeof v === 'number' && isFinite(v)) return v;
        if (v == null || v === '') return null;
        var n = parseFloat(v);
        return isFinite(n) ? n : null;
    }

    function cloneGrades(src) {
        return {
            a: (src && src.a) || 0,
            b: (src && src.b) || 0,
            a_or_b: (src && src.a_or_b) || 0,
            c: (src && src.c) || 0,
            d: (src && src.d) || 0,
            e: (src && src.e) || 0,
            unknown: (src && src.unknown) || 0
        };
    }

    function emptyStrengthSummary() {
        return {
            count: 0,
            min: null,
            max: null,
            avg: null,
            sum: 0,
            ratioCount: 0,
            ratioMin: null,
            ratioMax: null,
            ratioAvg: null,
            ratioSum: 0,
            grades: cloneGrades(null)
        };
    }

    function emptyCarbSummary() {
        return {
            count: 0,
            depthMin: null,
            depthMax: null,
            depthAvg: null,
            depthSum: 0,
            remainCount: 0,
            remainMin: null,
            remainMax: null,
            remainAvg: null,
            remainSum: 0,
            lifeCount: 0,
            lifeMin: null,
            lifeMax: null,
            lifeAvg: null,
            lifeSum: 0,
            depleted: 0,
            remainLow: 0,
            lifeOver: 0,
            lifeShort: 0
        };
    }

    function minOf(a, b) {
        if (a == null) return b;
        if (b == null) return a;
        return a < b ? a : b;
    }

    function maxOf(a, b) {
        if (a == null) return b;
        if (b == null) return a;
        return a > b ? a : b;
    }

    function normalizeGrade(g) {
        var s = String(g == null ? '' : g).trim();
        if (s === 'a/b') return 'a_or_b';
        if (s === 'a_or_b' || s === 'a' || s === 'b' || s === 'c' || s === 'd' || s === 'e') return s;
        return '';
    }

    /** 위치 슬롯별 최종강도가 있으면 슬롯마다 한 건, 없으면 항목 strengthFinal 한 건 */
    function collectStrengthSamples(item) {
        var samples = [];
        var slots = Array.isArray(item && item.strengthSlots) ? item.strengthSlots : [];
        slots.forEach(function (slot) {
            if (!slot) return;
            var final = toNum(slot.finalStrength);
            if (final == null) return;
            samples.push({
                final: final,
                ratio: toNum(slot.ratio),
                grade: normalizeGrade(slot.grade)
            });
        });
        if (samples.length) return samples;
        var top = toNum(item && item.strengthFinal);
        if (top == null) return [];
        return [{
            final: top,
            ratio: toNum(item.strengthRatio),
            grade: normalizeGrade(item.strengthGrade)
        }];
    }

    function collectCarbSample(item) {
        var depth = toNum(item && item.carbDepth);
        if (depth == null) return null;
        var cover = toNum(item && item.carbCover);
        var remain = toNum(item && item.carbRemainMm);
        if (remain == null && cover != null) remain = cover - depth;
        return {
            depth: depth,
            cover: cover,
            remainMm: remain,
            remainingLifeYears: toNum(item && item.carbRemainingLifeYears)
        };
    }

    function looksLikeStrength(item) {
        if (!item) return false;
        if (item.category === '강도') return true;
        if (item.category) return false;
        return collectStrengthSamples(item).length > 0;
    }

    function looksLikeCarb(item) {
        if (!item) return false;
        if (item.category === '탄산화') return true;
        if (item.category) return false;
        return collectCarbSample(item) != null;
    }

    function summarizeStrengthSamples(samples) {
        var out = emptyStrengthSummary();
        (samples || []).forEach(function (s) {
            if (!s || s.final == null) return;
            out.count += 1;
            out.sum += s.final;
            out.min = minOf(out.min, s.final);
            out.max = maxOf(out.max, s.final);
            if (s.ratio != null) {
                out.ratioCount += 1;
                out.ratioSum += s.ratio;
                out.ratioMin = minOf(out.ratioMin, s.ratio);
                out.ratioMax = maxOf(out.ratioMax, s.ratio);
            }
            var g = s.grade || '';
            if (g && Object.prototype.hasOwnProperty.call(out.grades, g)) out.grades[g] += 1;
            else out.grades.unknown += 1;
        });
        if (out.count) out.avg = out.sum / out.count;
        if (out.ratioCount) out.ratioAvg = out.ratioSum / out.ratioCount;
        return out;
    }

    function summarizeCarbSamples(samples) {
        var out = emptyCarbSummary();
        (samples || []).forEach(function (s) {
            if (!s || s.depth == null) return;
            out.count += 1;
            out.depthSum += s.depth;
            out.depthMin = minOf(out.depthMin, s.depth);
            out.depthMax = maxOf(out.depthMax, s.depth);
            if (s.remainMm != null) {
                out.remainCount += 1;
                out.remainSum += s.remainMm;
                out.remainMin = minOf(out.remainMin, s.remainMm);
                out.remainMax = maxOf(out.remainMax, s.remainMm);
                if (s.remainMm <= 0) out.depleted += 1;
                else if (s.remainMm < 10) out.remainLow += 1;
            }
            if (s.remainingLifeYears != null) {
                out.lifeCount += 1;
                out.lifeSum += s.remainingLifeYears;
                out.lifeMin = minOf(out.lifeMin, s.remainingLifeYears);
                out.lifeMax = maxOf(out.lifeMax, s.remainingLifeYears);
                if (s.remainingLifeYears < 0) out.lifeOver += 1;
                else if (s.remainingLifeYears < 10) out.lifeShort += 1;
            }
        });
        if (out.count) out.depthAvg = out.depthSum / out.count;
        if (out.remainCount) out.remainAvg = out.remainSum / out.remainCount;
        if (out.lifeCount) out.lifeAvg = out.lifeSum / out.lifeCount;
        return out;
    }

    function mergeStrengthSummary(a, b) {
        a = a || emptyStrengthSummary();
        b = b || emptyStrengthSummary();
        var grades = cloneGrades(a.grades);
        var bg = cloneGrades(b.grades);
        Object.keys(grades).forEach(function (k) { grades[k] += bg[k] || 0; });
        var count = a.count + b.count;
        var ratioCount = a.ratioCount + b.ratioCount;
        return {
            count: count,
            min: minOf(a.min, b.min),
            max: maxOf(a.max, b.max),
            sum: a.sum + b.sum,
            avg: count ? (a.sum + b.sum) / count : null,
            ratioCount: ratioCount,
            ratioMin: minOf(a.ratioMin, b.ratioMin),
            ratioMax: maxOf(a.ratioMax, b.ratioMax),
            ratioSum: a.ratioSum + b.ratioSum,
            ratioAvg: ratioCount ? (a.ratioSum + b.ratioSum) / ratioCount : null,
            grades: grades
        };
    }

    function mergeCarbSummary(a, b) {
        a = a || emptyCarbSummary();
        b = b || emptyCarbSummary();
        var count = a.count + b.count;
        var remainCount = a.remainCount + b.remainCount;
        var lifeCount = a.lifeCount + b.lifeCount;
        return {
            count: count,
            depthMin: minOf(a.depthMin, b.depthMin),
            depthMax: maxOf(a.depthMax, b.depthMax),
            depthSum: a.depthSum + b.depthSum,
            depthAvg: count ? (a.depthSum + b.depthSum) / count : null,
            remainCount: remainCount,
            remainMin: minOf(a.remainMin, b.remainMin),
            remainMax: maxOf(a.remainMax, b.remainMax),
            remainSum: a.remainSum + b.remainSum,
            remainAvg: remainCount ? (a.remainSum + b.remainSum) / remainCount : null,
            lifeCount: lifeCount,
            lifeMin: minOf(a.lifeMin, b.lifeMin),
            lifeMax: maxOf(a.lifeMax, b.lifeMax),
            lifeSum: a.lifeSum + b.lifeSum,
            lifeAvg: lifeCount ? (a.lifeSum + b.lifeSum) / lifeCount : null,
            depleted: a.depleted + b.depleted,
            remainLow: a.remainLow + b.remainLow,
            lifeOver: a.lifeOver + b.lifeOver,
            lifeShort: a.lifeShort + b.lifeShort
        };
    }

    function formatFixed(n, digits) {
        if (n == null || !isFinite(n)) return '-';
        return Number(n).toFixed(digits);
    }

    function formatRange(min, max, digits) {
        if (min == null) return '-';
        if (max == null || min === max) return formatFixed(min, digits);
        return formatFixed(min, digits) + '~' + formatFixed(max, digits);
    }

    function eunNeun(label) {
        var s = String(label || '');
        if (!s) return '은';
        var last = s.charCodeAt(s.length - 1);
        if (last >= 0xAC00 && last <= 0xD7A3) {
            return ((last - 0xAC00) % 28) ? '은' : '는';
        }
        return '은';
    }

    function formatStrengthHeadline(label, summary, avgWord) {
        if (!summary || !summary.count) return '';
        var word = avgWord || '층별 평균';
        var parts = [
            String(label || '') + eunNeun(label) + ' 강도가 ' + formatRange(summary.min, summary.max, 1),
            word + ' ' + formatFixed(summary.avg, 1)
        ];
        if (summary.ratioCount) {
            parts.push('측정강도/설계강도 평균 ' + Math.round(summary.ratioAvg) + '%');
        }
        return parts.join(' ');
    }

    function formatCarbHeadline(label, summary, avgWord) {
        if (!summary || !summary.count) return '';
        var word = avgWord || '층별 평균';
        var parts = [
            String(label || '') + eunNeun(label) + ' 탄산화깊이 ' + formatRange(summary.depthMin, summary.depthMax, 1),
            word + ' ' + formatFixed(summary.depthAvg, 1)
        ];
        if (summary.remainCount) {
            parts.push('잔여피복 평균 ' + formatFixed(summary.remainAvg, 2));
        }
        if (summary.lifeCount) {
            parts.push('잔존수명 평균 ' + Math.round(summary.lifeAvg) + '년');
        }
        return parts.join(' ');
    }

    function formatGradeCounts(grades) {
        grades = grades || {};
        var order = [
            { key: 'a', label: 'a' },
            { key: 'b', label: 'b' },
            { key: 'a_or_b', label: 'a/b' },
            { key: 'c', label: 'c' },
            { key: 'd', label: 'd' },
            { key: 'e', label: 'e' }
        ];
        var parts = [];
        order.forEach(function (g) {
            var n = grades[g.key] || 0;
            if (n) parts.push(g.label + ' ' + n);
        });
        return parts.join(' · ') || '-';
    }

    function formatCarbCaution(summary) {
        if (!summary || !summary.count) return '-';
        var parts = [];
        if (summary.depleted) parts.push('피복소진 ' + summary.depleted);
        if (summary.remainLow) parts.push('잔여<10mm ' + summary.remainLow);
        if (summary.lifeOver) parts.push('수명초과 ' + summary.lifeOver);
        if (summary.lifeShort) parts.push('수명10년↓ ' + summary.lifeShort);
        return parts.join(' · ') || '이상 없음';
    }

    function buildNdtStatsPayload(ndtData, opts) {
        opts = opts || {};
        var buildingId = opts.buildingId || '';
        var prefix = buildingId + '_';
        var getFloorLabel = typeof opts.getFloorLabel === 'function'
            ? opts.getFloorLabel
            : function (code) { return code; };
        var floorCodes = (opts.floorCodes || []).slice();
        Object.keys(ndtData || {}).forEach(function (key) {
            if (key.indexOf(prefix) !== 0) return;
            var code = key.slice(prefix.length);
            if (code && floorCodes.indexOf(code) < 0) floorCodes.push(code);
        });

        var floorRows = [];
        floorCodes.forEach(function (floorCode) {
            var items = (ndtData && ndtData[prefix + floorCode]) || [];
            if (!Array.isArray(items)) items = [];
            var strengthSamples = [];
            var carbSamples = [];
            items.forEach(function (item) {
                if (!item) return;
                if (looksLikeStrength(item)) {
                    collectStrengthSamples(item).forEach(function (s) { strengthSamples.push(s); });
                }
                if (looksLikeCarb(item)) {
                    var carb = collectCarbSample(item);
                    if (carb) carbSamples.push(carb);
                }
            });
            var strength = summarizeStrengthSamples(strengthSamples);
            var carbonation = summarizeCarbSamples(carbSamples);
            if (!strength.count && !carbonation.count) return;
            floorRows.push({
                floorCode: floorCode,
                floorLabel: getFloorLabel(floorCode),
                coarseGroup: getCoarseFloorGroup(floorCode),
                strength: strength,
                carbonation: carbonation
            });
        });

        var groupMap = {};
        floorRows.forEach(function (fr) {
            var g = fr.coarseGroup;
            if (!groupMap[g.key]) {
                groupMap[g.key] = {
                    key: g.key,
                    label: g.label,
                    floorLabel: g.label,
                    sort: g.sort,
                    floors: [],
                    strength: emptyStrengthSummary(),
                    carbonation: emptyCarbSummary()
                };
            }
            var bucket = groupMap[g.key];
            bucket.floors.push(fr.floorLabel);
            bucket.strength = mergeStrengthSummary(bucket.strength, fr.strength);
            bucket.carbonation = mergeCarbSummary(bucket.carbonation, fr.carbonation);
        });
        var groupRows = Object.keys(groupMap).map(function (k) { return groupMap[k]; });
        groupRows.sort(function (a, b) { return a.sort - b.sort; });

        var overall = {
            key: 'overall',
            label: '전체',
            floorLabel: '전체',
            floors: floorRows.map(function (fr) { return fr.floorLabel; }),
            strength: emptyStrengthSummary(),
            carbonation: emptyCarbSummary()
        };
        floorRows.forEach(function (fr) {
            overall.strength = mergeStrengthSummary(overall.strength, fr.strength);
            overall.carbonation = mergeCarbSummary(overall.carbonation, fr.carbonation);
        });

        return {
            floorRows: floorRows,
            groupRows: groupRows,
            overall: overall,
            currentFloor: opts.currentFloor || ''
        };
    }

    // 통계 대분류 — 상태조사(결함)와 비파괴조사를 섞어 보면 표가 길어져 현장에서 못 읽는다.
    var STATS_CATEGORIES = [
        { key: 'defect', label: '상태조사' },
        { key: 'ndt', label: '비파괴조사' }
    ];

    function normalizeStatsCategory(key) {
        return key === 'ndt' ? 'ndt' : 'defect';
    }

    function getStatsSectionVisibility(category) {
        var isNdt = normalizeStatsCategory(category) === 'ndt';
        return {
            summaryCards: !isNdt,
            componentCrack: !isNdt,
            defectMatrix: !isNdt,
            defectFilters: !isNdt,
            viewChips: !isNdt,
            ndtStrength: isNdt,
            ndtCarb: isNdt
        };
    }

    /** 비파괴 한 페이지: 층 행 + 전체 행. 층묶음은 안 넣는다 */
    function ndtCombinedRows(payload, kind) {
        payload = payload || {};
        var field = kind === 'carbonation' ? 'carbonation' : 'strength';
        var floors = (payload.floorRows || []).filter(function (row) {
            return row[field] && row[field].count;
        });
        var overall = payload.overall && payload.overall[field] && payload.overall[field].count
            ? payload.overall
            : null;
        return { floors: floors, overall: overall };
    }

    var api = {
        STATS_CATEGORIES: STATS_CATEGORIES,
        normalizeStatsCategory: normalizeStatsCategory,
        getStatsSectionVisibility: getStatsSectionVisibility,
        ndtCombinedRows: ndtCombinedRows,
        classifyFloorGroup: classifyFloorGroup,
        getCoarseFloorGroup: getCoarseFloorGroup,
        toNum: toNum,
        collectStrengthSamples: collectStrengthSamples,
        collectCarbSample: collectCarbSample,
        summarizeStrengthSamples: summarizeStrengthSamples,
        summarizeCarbSamples: summarizeCarbSamples,
        mergeStrengthSummary: mergeStrengthSummary,
        mergeCarbSummary: mergeCarbSummary,
        buildNdtStatsPayload: buildNdtStatsPayload,
        formatFixed: formatFixed,
        formatRange: formatRange,
        formatStrengthHeadline: formatStrengthHeadline,
        formatCarbHeadline: formatCarbHeadline,
        formatGradeCounts: formatGradeCounts,
        formatCarbCaution: formatCarbCaution,
        emptyStrengthSummary: emptyStrengthSummary,
        emptyCarbSummary: emptyCarbSummary
    };

    root.BSA.ndtStats = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
    if (typeof document === 'undefined') return;

    var statsView = 'floor';
    var statsCategory = 'defect';
    var statsBound = false;
    var selectedComponentGroup = null;
    var ndtStats = (window.BSA && window.BSA.ndtStats) || {};

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseDefectTypeList(raw) {
        return String(raw == null ? '' : raw)
            .split(/[,，]+/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    // 경사균열/수직균열/수평균열/망상균열/U자형균열은 통계에서 "균열"로 통합 집계
    var CRACK_KIND_SET = { '수직균열': true, '수평균열': true, '경사균열': true, '망상균열': true, 'U자형균열': true };
    function normalizeTypeLabel(t) {
        return CRACK_KIND_SET[t] ? '균열' : t;
    }

    var COMPONENT_GROUP_ORDER = [
        { key: 'column', label: '기둥', sort: 1 },
        { key: 'bigBeam', label: '큰보', sort: 2 },
        { key: 'smallBeam', label: '작은보', sort: 3 },
        { key: 'upperBeam', label: '상부 보', sort: 4 },
        { key: 'slab', label: '슬래브', sort: 5 },
        { key: 'rcWall', label: 'RC벽체', sort: 6 },
        { key: 'masonryWall', label: '조적벽체', sort: 7 },
        { key: 'other', label: '기타 부재', sort: 99 }
    ];
    function classifyComponentGroup(component) {
        var key = String(component || '').replace(/\s+/g, '');
        if (!key) return 'other';
        if (key.indexOf('접합') >= 0) return 'other';
        if (key.indexOf('조적') >= 0) return 'masonryWall';
        if (key.indexOf('상부보') >= 0) return 'upperBeam';
        if (key.indexOf('큰보') >= 0) return 'bigBeam';
        if (key.indexOf('작은보') >= 0) return 'smallBeam';
        if (key.indexOf('슬래브') >= 0) return 'slab';
        if (key === 'RC벽체' || key === '벽체' || key === '내력벽') return 'rcWall';
        if (key.indexOf('기둥') >= 0) return 'column';
        return 'other';
    }

    /** 균열폭/길이 자유텍스트 한 조각에서 "폭"에 해당하는 숫자만 뽑는다.
     * 지원 표기: "Cw:0.4"(폭 라벨), "0.4mm"(단위 명시), "1.0/4.5"(폭/길이, 앞이 폭) */
    function extractWidthFromSegment(seg) {
        if (!seg) return null;
        var cwMatch = seg.match(/cw\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
        if (cwMatch) return parseFloat(cwMatch[1]);
        var mmMatch = seg.match(/(\d+(?:\.\d+)?)\s*(?:mm|㎜)/i);
        if (mmMatch) return parseFloat(mmMatch[1]);
        var slashMatch = seg.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
        if (slashMatch) return parseFloat(slashMatch[1]);
        var bareMatch = seg.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
        if (bareMatch) return parseFloat(bareMatch[1]);
        return null;
    }

    /** 균열폭 값 추출. crackWidth("0.15 / 0.20"처럼 여러 측정점의 폭을 슬래시로 이어붙인 값)가
     * 있으면 그대로 쓰고, 비어 있으면 균열폭/길이 분리 입력 이전 구버전 데이터(자유텍스트 size:
     * "Cw:0.4", "0.4mm", "1.0/4.5"(앞이 폭·뒤가 길이) 등)에서 폭만 뽑아본다. */
    function getCrackWidthNumbers(d) {
        var raw = String(d && d.crackWidth != null ? d.crackWidth : '').trim();
        if (raw) {
            return raw.split(/\s*[\/,]\s*/).map(function (part) {
                var n = parseFloat(String(part).replace(/[^\d.\-]/g, ''));
                return isNaN(n) ? null : n;
            }).filter(function (n) { return n != null; });
        }
        var sizeRaw = String(d && d.size != null ? d.size : '').trim();
        if (!sizeRaw) return [];
        return sizeRaw.split(/\s*,\s*/).map(extractWidthFromSegment).filter(function (n) {
            return n != null && !isNaN(n);
        });
    }

    function getSurveyRows(defects) {
        if (typeof window.getSurveyRowsForReport === 'function') {
            return window.getSurveyRowsForReport(defects || []);
        }
        var seen = {};
        return (defects || []).filter(function (d) {
            if (!d) return false;
            var numApi = window.BSA && window.BSA.shared && window.BSA.shared.arrowSurveyNumber;
            if (numApi && numApi.shouldSkipOrphanUnnumberedInSurveyList(d)) return false;
            if (d.groupId) {
                if (seen[d.groupId]) return false;
                seen[d.groupId] = true;
            }
            return true;
        });
    }

    function shouldIncludeDefect(d, opts) {
        if (!d) return false;
        if (opts.excludeGood) {
            var types = parseDefectTypeList(d.defectType);
            // "접합부 상태양호"처럼 부재명과 붙여 쓴 경우도 상태양호로 인식해 제외한다
            if (!types.length || (types.length === 1 && String(types[0] || '').indexOf('상태양호') !== -1)) return false;
        }
        if (opts.currentRoundOnly && typeof window.isPreviousRoundDefect === 'function') {
            if (window.isPreviousRoundDefect(d)) return false;
        }
        return true;
    }

    function collectTypeCounts(rows) {
        var counts = {};
        rows.forEach(function (d) {
            var types = parseDefectTypeList(d.defectType);
            if (!types.length) {
                counts['(미입력)'] = (counts['(미입력)'] || 0) + 1;
                return;
            }
            types.forEach(function (t) {
                if (!t) return;
                var label = normalizeTypeLabel(t);
                counts[label] = (counts[label] || 0) + 1;
            });
        });
        return counts;
    }

    function sortedTypeKeys(allCounts) {
        var keys = Object.keys(allCounts);
        keys.sort(function (a, b) {
            var diff = (allCounts[b] || 0) - (allCounts[a] || 0);
            if (diff !== 0) return diff;
            return a.localeCompare(b, 'ko');
        });
        return keys;
    }

    // 층 구역 분류는 결함·비파괴가 같은 규칙을 써야 층묶음 집계가 갈라지지 않는다
    var classifyFloorGroup = ndtStats.classifyFloorGroup;
    var getCoarseFloorGroup = ndtStats.getCoarseFloorGroup;

    function getFloorLabel(floorCode, bldg) {
        if (typeof window.getFloorLabelFromCode === 'function') {
            var floors = typeof window.getBuildingAvailableFloors === 'function'
                ? window.getBuildingAvailableFloors(bldg) : [];
            var hit = floors.find(function (f) { return f.floorCode === floorCode; });
            if (hit && hit.floorLabel) return hit.floorLabel;
            return window.getFloorLabelFromCode(floorCode);
        }
        return floorCode;
    }

    function buildStatsPayload(bldg, opts) {
        opts = opts || {};
        if (!bldg || !bldg.id) return null;
        var prefix = bldg.id + '_';
        var floorRows = [];
        var overallCounts = {};
        var totalRows = 0;
        var categoryCounts = { structural: 0, nonStructural: 0, finishing: 0, other: 0 };
        var componentCounts = {};

        var floors = typeof window.getBuildingAvailableFloors === 'function'
            ? window.getBuildingAvailableFloors(bldg) : [];
        if (typeof window.sortFloorsLowToHigh === 'function') {
            floors = window.sortFloorsLowToHigh(floors);
        }

        var floorCodes = floors.map(function (f) { return f.floorCode; });
        Object.keys(window.state.defects || {}).forEach(function (key) {
            if (key.indexOf(prefix) !== 0) return;
            var code = key.slice(prefix.length);
            if (floorCodes.indexOf(code) < 0) floorCodes.push(code);
        });
        if (typeof window.sortFloorsLowToHigh === 'function') {
            floorCodes = window.sortFloorsLowToHigh(floorCodes.map(function (c) {
                return { floorCode: c, floorLabel: getFloorLabel(c, bldg) };
            })).map(function (f) { return f.floorCode; });
        }

        floorCodes.forEach(function (floorCode) {
            var raw = window.state.defects[prefix + floorCode] || [];
            var rows = getSurveyRows(raw).filter(function (d) { return shouldIncludeDefect(d, opts); });
            var typeCounts = collectTypeCounts(rows);
            Object.keys(typeCounts).forEach(function (t) {
                overallCounts[t] = (overallCounts[t] || 0) + typeCounts[t];
            });
            var floorComponentCounts = {};
            var floorComponentCrackMax = {};
            rows.forEach(function (d) {
                var cat = d.category || '구조체';
                if (cat === '비구조체') categoryCounts.nonStructural += 1;
                else if (cat === '마감재') categoryCounts.finishing += 1;
                else if (cat === '구조체') categoryCounts.structural += 1;
                else categoryCounts.other += 1;
                var compGroup = classifyComponentGroup(d.component);
                componentCounts[compGroup] = (componentCounts[compGroup] || 0) + 1;
                floorComponentCounts[compGroup] = (floorComponentCounts[compGroup] || 0) + 1;
                getCrackWidthNumbers(d).forEach(function (w) {
                    var cur = floorComponentCrackMax[compGroup];
                    if (!cur || w > cur.value) {
                        floorComponentCrackMax[compGroup] = { value: w, id: d.id || '', no: d.no || d.groupNo || '' };
                    }
                });
            });
            totalRows += rows.length;
            floorRows.push({
                floorCode: floorCode,
                floorLabel: getFloorLabel(floorCode, bldg),
                rowCount: rows.length,
                typeCounts: typeCounts,
                componentCounts: floorComponentCounts,
                componentCrackMax: floorComponentCrackMax,
                coarseGroup: getCoarseFloorGroup(floorCode),
                zoneInfo: classifyFloorGroup(floorCode)
            });
        });

        var groupMap = {};
        floorRows.forEach(function (fr) {
            var g = fr.coarseGroup;
            if (!groupMap[g.key]) {
                groupMap[g.key] = {
                    key: g.key,
                    label: g.label,
                    sort: g.sort,
                    rowCount: 0,
                    typeCounts: {},
                    floors: []
                };
            }
            var bucket = groupMap[g.key];
            bucket.rowCount += fr.rowCount;
            bucket.floors.push(fr.floorLabel);
            Object.keys(fr.typeCounts).forEach(function (t) {
                bucket.typeCounts[t] = (bucket.typeCounts[t] || 0) + fr.typeCounts[t];
            });
        });

        var groupRows = Object.keys(groupMap).map(function (k) { return groupMap[k]; });
        groupRows.sort(function (a, b) { return a.sort - b.sort; });

        return {
            bldg: bldg,
            floorRows: floorRows,
            groupRows: groupRows,
            overallCounts: overallCounts,
            typeKeys: sortedTypeKeys(overallCounts),
            totalRows: totalRows,
            categoryCounts: categoryCounts,
            componentCounts: componentCounts,
            currentFloor: window.state.currentFloor
        };
    }

    function renderSummaryCards(payload, root) {
        if (!root || !payload) return;
        var cc = payload.categoryCounts;
        root.innerHTML = [
            { label: '조사 행 합계', value: payload.totalRows, cls: 'stats-card-total' },
            { label: '결함 종류', value: payload.typeKeys.length, cls: 'stats-card-types' },
            { label: '구조체', value: cc.structural, cls: 'stats-card-struct' },
            { label: '비구조체', value: cc.nonStructural, cls: 'stats-card-nonstruct' },
            { label: '마감재', value: cc.finishing, cls: 'stats-card-finish' }
        ].map(function (card) {
            return '<div class="stats-summary-card ' + card.cls + '"><span class="stats-summary-value">' + esc(card.value) + '</span><span class="stats-summary-label">' + esc(card.label) + '</span></div>';
        }).join('');
    }

    function renderMatrixTable(payload, view) {
        var head = document.getElementById('statsMatrixHead');
        var body = document.getElementById('statsMatrixBody');
        var title = document.getElementById('statsPanelTitle');
        if (!head || !body || !payload) return;

        var typeKeys = payload.typeKeys.slice(0, 16);
        var rowLabel = view === 'group' ? '층묶음' : (view === 'overall' ? '전체' : '층');
        if (title) {
            title.textContent = view === 'floor' ? '층별 결함 종류' : (view === 'group' ? '층묶음별 결함 종류' : '전체 결함 종류');
        }

        if (!typeKeys.length) {
            head.innerHTML = '<tr><th>' + esc(rowLabel) + '</th><th>건수</th></tr>';
            body.innerHTML = '<tr><td colspan="2" class="stats-empty">표시할 결함 데이터가 없습니다.</td></tr>';
            return;
        }

        head.innerHTML = '<tr><th>' + esc(rowLabel) + '</th><th>합계</th>' + typeKeys.map(function (t) {
            return '<th>' + esc(t) + '</th>';
        }).join('') + '</tr>';

        var rows = [];
        if (view === 'floor') rows = payload.floorRows;
        else if (view === 'group') rows = payload.groupRows;
        else {
            rows = [{
                label: '전체',
                rowCount: payload.totalRows,
                typeCounts: payload.overallCounts
            }];
        }

        body.innerHTML = rows.map(function (row) {
            var label = row.floorLabel || row.label;
            if (view === 'group' && row.floors && row.floors.length) {
                label = row.label + ' (' + row.floors.join(', ') + ')';
            }
            var isCurrent = view === 'floor' && row.floorCode === payload.currentFloor;
            var trCls = isCurrent ? ' class="stats-row-current"' : '';
            var cells = typeKeys.map(function (t) {
                var n = row.typeCounts[t] || 0;
                return '<td class="' + (n ? 'stats-cell-hit' : 'stats-cell-zero') + '">' + (n || '-') + '</td>';
            }).join('');
            return '<tr' + trCls + '><th scope="row">' + esc(label) + '</th><td class="stats-cell-sum">' + esc(row.rowCount) + '</td>' + cells + '</tr>';
        }).join('');
    }

    function renderComponentCrackPanel(payload, root) {
        if (!root || !payload) return;
        var counts = payload.componentCounts || {};
        var groups = COMPONENT_GROUP_ORDER;
        if (!selectedComponentGroup || !groups.some(function (g) { return g.key === selectedComponentGroup; })) {
            selectedComponentGroup = groups[0].key;
        }

        var chipsHtml = '<div class="chips-container stats-component-chips">' + groups.map(function (g) {
            var active = g.key === selectedComponentGroup ? ' active' : '';
            return '<button type="button" class="chip' + active + '" data-component-group="' + esc(g.key) + '">' + esc(g.label) + ' (' + (counts[g.key] || 0) + ')</button>';
        }).join('') + '</div>';

        var activeLabel = groups.filter(function (g) { return g.key === selectedComponentGroup; }).map(function (g) { return g.label; })[0] || '';
        var floorsWithData = payload.floorRows.filter(function (fr) {
            return (fr.componentCounts[selectedComponentGroup] || 0) > 0;
        });

        var tableHtml;
        if (!floorsWithData.length) {
            tableHtml = '<p class="stats-empty">' + esc(activeLabel) + ' 결함 데이터가 없습니다.</p>';
        } else {
            tableHtml = '<div class="table-responsive stats-table-wrap"><table class="data-table stats-component-crack-table"><thead><tr><th>층</th><th>최대 균열폭(mm)</th><th>결함 번호</th><th>건수</th></tr></thead><tbody>' +
                floorsWithData.map(function (fr) {
                    var info = fr.componentCrackMax[selectedComponentGroup];
                    var isCurrent = fr.floorCode === payload.currentFloor;
                    var trCls = isCurrent ? ' class="stats-row-current"' : '';
                    var widthCell = (info && info.value != null) ? info.value : '-';
                    var noCell = '-';
                    if (info && info.id) {
                        var noLabel = info.no ? String(info.no) : '보기';
                        noCell = '<button type="button" class="stats-defect-no-link" data-defect-id="' + esc(info.id) + '" data-floor-code="' + esc(fr.floorCode) + '">' + esc(noLabel) + '</button>';
                    }
                    return '<tr' + trCls + '><th scope="row">' + esc(fr.floorLabel) + '</th><td class="stats-cell-sum">' + widthCell + '</td><td>' + noCell + '</td><td class="' + (fr.componentCounts[selectedComponentGroup] ? 'stats-cell-hit' : 'stats-cell-zero') + '">' + (fr.componentCounts[selectedComponentGroup] || 0) + '</td></tr>';
                }).join('') + '</tbody></table></div>';
        }

        root.innerHTML = '<h4 class="stats-bar-title">구조 부재별 층별 최대 균열폭</h4>' + chipsHtml + tableHtml;

        root.querySelectorAll('[data-component-group]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                selectedComponentGroup = btn.getAttribute('data-component-group');
                if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            });
        });
        root.querySelectorAll('[data-defect-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                goToDefectOnMap(btn.getAttribute('data-floor-code'), btn.getAttribute('data-defect-id'));
            });
        });
    }

    /** 통계탭의 특정 결함을 결함위치도 작성 화면으로 이동해 선택 표시한다 */
    function goToDefectOnMap(floorCode, defectId) {
        if (!floorCode || !defectId || !window.state) return;
        if (window.state.currentFloor !== floorCode && typeof window.loadFloorDrawing === 'function') {
            window.loadFloorDrawing(floorCode);
        }
        if (typeof window.viewDefectOnMapFromSurvey === 'function') {
            window.viewDefectOnMapFromSurvey(defectId);
        } else if (typeof window.switchTab === 'function') {
            window.switchTab('tab-map');
        }
    }

    function updateHint(view, bldg) {
        var hint = document.getElementById('statsViewHint');
        if (!hint) return;
        var isPrecise = bldg && bldg.inspectionType === '정밀안전점검';
        if (statsCategory === 'ndt') {
            hint.textContent = '층별과 건물 전체를 한 표에 보여 줍니다. 현재 선택 층은 강조됩니다.';
            return;
        }
        if (view === 'group') {
            hint.textContent = isPrecise
                ? '정밀안전점검: 지하·지상·옥상·부대 등 층 구역별로 결함 종류를 묶어 봅니다.'
                : '층을 구역(지하·지상·옥상·부대)별로 묶어 결함 종류를 집계합니다.';
        } else if (view === 'floor') {
            hint.textContent = '각 층별 결함 종류 건수입니다. 현재 선택 층은 강조 표시됩니다.';
        } else {
            hint.textContent = '건물 전체 결함 종류 합계입니다.';
        }
    }

    function getStatsOptions() {
        return {
            excludeGood: !!document.getElementById('statsExcludeGood')?.checked,
            currentRoundOnly: !!document.getElementById('statsCurrentRoundOnly')?.checked
        };
    }

    /** 대분류 칩(상태조사·비파괴조사)은 index.html을 건드리지 않고 여기서 만들어 붙인다 */
    function ensureCategoryChips() {
        var page = document.querySelector('#tab-stats .stats-page');
        if (!page) return null;
        var host = document.getElementById('statsCategoryChips');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'statsCategoryChips';
        host.className = 'stats-category-chips';
        host.setAttribute('role', 'tablist');
        host.setAttribute('aria-label', '통계 대분류');
        var cats = (ndtStats.STATS_CATEGORIES || [
            { key: 'defect', label: '상태조사' },
            { key: 'ndt', label: '비파괴조사' }
        ]);
        host.innerHTML = cats.map(function (cat) {
            var on = cat.key === statsCategory;
            return '<button type="button" class="chip stats-category-chip' + (on ? ' active' : '')
                + '" data-stats-category="' + esc(cat.key) + '" aria-pressed="' + (on ? 'true' : 'false')
                + '">' + esc(cat.label) + '</button>';
        }).join('');
        var toolbar = page.querySelector('.stats-toolbar');
        if (toolbar) page.insertBefore(host, toolbar);
        else page.appendChild(host);
        host.querySelectorAll('[data-stats-category]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                statsCategory = (ndtStats.normalizeStatsCategory || function (k) { return k; })(
                    btn.getAttribute('data-stats-category')
                );
                if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            });
        });
        return host;
    }

    function syncCategoryChips() {
        var host = ensureCategoryChips();
        if (!host) return;
        host.querySelectorAll('[data-stats-category]').forEach(function (btn) {
            var on = btn.getAttribute('data-stats-category') === statsCategory;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function applyCategoryVisibility() {
        var vis = (ndtStats.getStatsSectionVisibility || function () { return null; })(statsCategory);
        if (!vis) return;
        var matrixTable = document.getElementById('statsMatrixTable');
        var defectPanel = matrixTable ? matrixTable.closest('.stats-panel') : null;
        var viewChips = document.querySelector('#tab-stats .stats-view-chips');
        var toolbar = document.querySelector('#tab-stats .stats-toolbar');
        var toggles = [
            [document.getElementById('statsSummaryCards'), vis.summaryCards],
            [document.getElementById('statsComponentSection'), vis.componentCrack],
            [defectPanel, vis.defectMatrix],
            [document.querySelector('#tab-stats .stats-filter-row'), vis.defectFilters],
            [viewChips, vis.viewChips],
            [toolbar, vis.viewChips || vis.defectFilters],
            [document.getElementById('statsNdtStrengthSection'), vis.ndtStrength],
            [document.getElementById('statsNdtCarbSection'), vis.ndtCarb]
        ];
        toggles.forEach(function (pair) {
            if (pair[0]) pair[0].hidden = !pair[1];
        });
    }

    function ensureNdtStatsMount() {
        var page = document.querySelector('#tab-stats .stats-page');
        if (!page) return null;
        var strength = document.getElementById('statsNdtStrengthSection');
        if (!strength) {
            strength = document.createElement('div');
            strength.id = 'statsNdtStrengthSection';
            strength.className = 'stats-panel stats-ndt-panel';
            page.appendChild(strength);
        }
        var carb = document.getElementById('statsNdtCarbSection');
        if (!carb) {
            carb = document.createElement('div');
            carb.id = 'statsNdtCarbSection';
            carb.className = 'stats-panel stats-ndt-panel';
            page.appendChild(carb);
        }
        return { strength: strength, carb: carb };
    }

    function listNdtFloorCodes(bldg) {
        if (!bldg || !bldg.id) return [];
        var prefix = bldg.id + '_';
        var floorCodes = [];
        var floors = typeof window.getBuildingAvailableFloors === 'function'
            ? window.getBuildingAvailableFloors(bldg) : [];
        floors.forEach(function (f) {
            if (f && f.floorCode && floorCodes.indexOf(f.floorCode) < 0) floorCodes.push(f.floorCode);
        });
        Object.keys((window.state && window.state.ndtData) || {}).forEach(function (key) {
            if (key.indexOf(prefix) !== 0) return;
            var code = key.slice(prefix.length);
            if (code && floorCodes.indexOf(code) < 0) floorCodes.push(code);
        });
        if (typeof window.listNdtFloorCodesForBuilding === 'function') {
            window.listNdtFloorCodesForBuilding(bldg.id).forEach(function (code) {
                if (code && floorCodes.indexOf(code) < 0) floorCodes.push(code);
            });
        }
        if (typeof window.sortFloorsLowToHigh === 'function') {
            floorCodes = window.sortFloorsLowToHigh(floorCodes.map(function (c) {
                return { floorCode: c, floorLabel: getFloorLabel(c, bldg) };
            })).map(function (f) { return f.floorCode; });
        }
        return floorCodes;
    }

    function ndtStrengthRatioCell(s) {
        if (!s || !s.ratioCount) return '-';
        return Math.round(s.ratioAvg) + '%' + (s.ratioMin != null && s.ratioMax != null && s.ratioMin !== s.ratioMax
            ? ' <span class="stats-ndt-sub">(' + Math.round(s.ratioMin) + '~' + Math.round(s.ratioMax) + '%)</span>'
            : '');
    }

    function renderNdtStrengthSection(root, payload) {
        if (!root) return;
        var combined = (ndtStats.ndtCombinedRows || function () { return { floors: [], overall: null }; })(payload, 'strength');
        var floors = combined.floors || [];
        var overall = combined.overall;
        var title = '콘크리트 강도';
        var lead = '';
        if (overall && ndtStats.formatStrengthHeadline) {
            lead = ndtStats.formatStrengthHeadline('전체', overall.strength, '평균');
        }
        if (!floors.length && !overall) {
            root.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">' + esc(title) + '</h3></div>'
                + '<p class="stats-empty">표시할 강도 측정값이 없습니다.</p>';
            return;
        }
        var formatRange = ndtStats.formatRange;
        var formatFixed = ndtStats.formatFixed;
        var formatGrade = ndtStats.formatGradeCounts;
        var rowHtml = function (label, s, trCls) {
            return '<tr' + (trCls ? ' class="' + trCls + '"' : '') + '>'
                + '<th scope="row">' + esc(label) + '</th>'
                + '<td>' + esc(s.count) + '</td>'
                + '<td class="stats-cell-hit">' + esc(formatRange(s.min, s.max, 1)) + '</td>'
                + '<td class="stats-cell-sum">' + esc(formatFixed(s.avg, 1)) + '</td>'
                + '<td>' + ndtStrengthRatioCell(s) + '</td>'
                + '<td>' + esc(formatGrade(s.grades)) + '</td>'
                + '</tr>';
        };
        var body = floors.map(function (row) {
            var isCurrent = row.floorCode === payload.currentFloor;
            return rowHtml(row.floorLabel || row.label, row.strength, isCurrent ? 'stats-row-current' : '');
        }).join('');
        if (overall) body += rowHtml('전체', overall.strength, 'stats-ndt-total');
        root.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">' + esc(title) + '</h3>'
            + (lead ? '<p class="stats-ndt-lead">' + esc(lead) + '</p>' : '')
            + '</div>'
            + '<div class="table-responsive stats-table-wrap"><table class="data-table stats-matrix-table stats-ndt-table">'
            + '<thead><tr><th>층</th><th>건수</th><th>강도(MPa)</th><th>평균</th><th>측정/설계 평균</th><th>등급</th></tr></thead>'
            + '<tbody>' + body + '</tbody></table></div>';
    }

    function renderNdtCarbSection(root, payload) {
        if (!root) return;
        var combined = (ndtStats.ndtCombinedRows || function () { return { floors: [], overall: null }; })(payload, 'carbonation');
        var floors = combined.floors || [];
        var overall = combined.overall;
        var title = '탄산화';
        var lead = '';
        if (overall && ndtStats.formatCarbHeadline) {
            lead = ndtStats.formatCarbHeadline('전체', overall.carbonation, '평균');
        }
        if (!floors.length && !overall) {
            root.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">' + esc(title) + '</h3></div>'
                + '<p class="stats-empty">표시할 탄산화 측정값이 없습니다.</p>';
            return;
        }
        var formatRange = ndtStats.formatRange;
        var formatFixed = ndtStats.formatFixed;
        var formatCaution = ndtStats.formatCarbCaution;
        var rowHtml = function (label, c, trCls) {
            var caution = formatCaution(c);
            var cautionCls = (c.depleted || c.lifeOver) ? 'stats-ndt-warn' : ((c.remainLow || c.lifeShort) ? 'stats-ndt-caution' : '');
            var lifeCell = c.lifeCount ? (Math.round(c.lifeAvg) + '년') : '-';
            return '<tr' + (trCls ? ' class="' + trCls + '"' : '') + '>'
                + '<th scope="row">' + esc(label) + '</th>'
                + '<td>' + esc(c.count) + '</td>'
                + '<td class="stats-cell-hit">' + esc(formatRange(c.depthMin, c.depthMax, 1)) + '</td>'
                + '<td class="stats-cell-sum">' + esc(formatFixed(c.depthAvg, 1)) + '</td>'
                + '<td>' + (c.remainCount ? esc(formatFixed(c.remainAvg, 2)) : '-') + '</td>'
                + '<td>' + esc(lifeCell) + '</td>'
                + '<td class="' + cautionCls + '">' + esc(caution) + '</td>'
                + '</tr>';
        };
        var body = floors.map(function (row) {
            var isCurrent = row.floorCode === payload.currentFloor;
            return rowHtml(row.floorLabel || row.label, row.carbonation, isCurrent ? 'stats-row-current' : '');
        }).join('');
        if (overall) body += rowHtml('전체', overall.carbonation, 'stats-ndt-total');
        root.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">' + esc(title) + '</h3>'
            + (lead ? '<p class="stats-ndt-lead">' + esc(lead) + '</p>' : '')
            + '</div>'
            + '<div class="table-responsive stats-table-wrap"><table class="data-table stats-matrix-table stats-ndt-table">'
            + '<thead><tr><th>층</th><th>건수</th><th>깊이(mm)</th><th>평균</th><th>잔여피복 평균</th><th>잔존수명 평균</th><th>주의</th></tr></thead>'
            + '<tbody>' + body + '</tbody></table></div>';
    }

    function renderNdtStatsPanels(bldg) {
        var mount = ensureNdtStatsMount();
        if (!mount) return;
        if (!bldg || !ndtStats.buildNdtStatsPayload) {
            mount.strength.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">콘크리트 강도</h3></div>'
                + '<p class="stats-empty">건물을 선택하면 강도 통계를 볼 수 있습니다.</p>';
            mount.carb.innerHTML = '<div class="stats-panel-head"><h3 class="stats-panel-title">탄산화</h3></div>'
                + '<p class="stats-empty">건물을 선택하면 탄산화 통계를 볼 수 있습니다.</p>';
            return;
        }
        var payload = ndtStats.buildNdtStatsPayload((window.state && window.state.ndtData) || {}, {
            buildingId: bldg.id,
            floorCodes: listNdtFloorCodes(bldg),
            getFloorLabel: function (code) { return getFloorLabel(code, bldg); },
            currentFloor: window.state && window.state.currentFloor
        });
        renderNdtStrengthSection(mount.strength, payload);
        renderNdtCarbSection(mount.carb, payload);
    }

    window.renderDefectStatsTab = function () {
        var bldg = window.state.currentBuilding;
        var titleEl = document.getElementById('statsBuildingTitle');
        var metaEl = document.getElementById('statsBuildingMeta');
        if (titleEl) titleEl.textContent = bldg ? (bldg.name || '결함 통계') : '결함 통계';
        if (metaEl) {
            if (!bldg) metaEl.textContent = '건물을 선택하면 층별·전체 결함 통계를 볼 수 있습니다.';
            else {
                var parts = [bldg.facilityGrade, bldg.inspectionType, bldg.inspectionYear, bldg.inspectionPeriod].filter(Boolean);
                metaEl.textContent = parts.join(' · ');
            }
        }

        syncCategoryChips();
        var payload = buildStatsPayload(bldg, getStatsOptions());
        renderSummaryCards(payload, document.getElementById('statsSummaryCards'));
        renderComponentCrackPanel(payload, document.getElementById('statsComponentSection'));
        renderMatrixTable(payload, statsView);
        renderNdtStatsPanels(bldg);
        updateHint(statsView, bldg);
        applyCategoryVisibility();
    };

    function bindStatsControlsOnce() {
        if (statsBound) return;
        statsBound = true;
        ensureCategoryChips();
        document.querySelectorAll('[data-stats-view]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                statsView = btn.getAttribute('data-stats-view') || 'floor';
                document.querySelectorAll('[data-stats-view]').forEach(function (b) {
                    var on = b === btn;
                    b.classList.toggle('active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                window.renderDefectStatsTab();
            });
        });
        ['statsExcludeGood', 'statsCurrentRoundOnly'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', function () { window.renderDefectStatsTab(); });
        });
    }

    window.BSA.tabs['tab-stats'] = {
        id: 'tab-stats',
        title: '통계',
        features: [
            '대분류: 상태조사 / 비파괴조사',
            '건물 전체 결함 종류 집계',
            '층별 결함 종류 표 (현재 선택 층 강조)',
            '층묶음 보기: 지하·지상·옥상·부대 구역별 집계',
            '전체 보기: 건물 합산 결함 종류',
            '정밀안전점검 시 층 구역 묶음 분석',
            '상태양호 제외 · 금회차만 필터',
            '구조체/비구조체/마감재 요약 카드',
            '구조 부재(기둥·큰보·작은보·상부 보·슬래브·RC벽체·조적벽체) 클릭 시 층별 최대 균열폭 표시',
            '경사·수직·수평균열은 "균열"로 통합 집계',
            '비파괴조사: 층별과 전체를 한 표에 (층묶음·보기 칩 없음)',
            '콘크리트 강도: 범위·평균·측정강도/설계강도 평균·등급',
            '탄산화: 깊이 범위·평균·잔여피복·잔존수명·피복소진 주의'
        ],
        ownerHint: 'js/tabs/stats.js',
        enter: function () {
            bindStatsControlsOnce();
            function refreshStats() {
                if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
            }
            if (window.BSA && window.BSA.performance && typeof window.BSA.performance.scheduleTabRefresh === 'function') {
                window.BSA.performance.scheduleTabRefresh(function () { refreshStats(); });
            } else {
                refreshStats();
                setTimeout(refreshStats, 120);
            }
        }
    };

    document.addEventListener('DOMContentLoaded', bindStatsControlsOnce);
})();
