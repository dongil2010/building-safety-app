/**
 * 부재실측 선택 입력 — 2026-10-19 / 2026-11-06
 *  - 「이쪽만 측정」: 보·기둥에서 한쪽만 잰 부재. 안 잰 쪽은 설계치수로 보고 단면적 비율을 낸다.
 *  - 「슬래브 두께 합산」(보만): 입력한 춤 + 슬래브 두께 = 실측 춤.
 *  - 「슬래브/단열 두께 제외」(보): 체크만이면 주석만. mm를 적으면 춤에서 뺀다. 합산과 슬래브 제외는 서로 못 켬.
 *  - 「벽체 두께 제외」(기둥 사각/원형): 체크만이면 주석만. mm를 적으면 폭·지름에서 뺀다.
 * 순수 함수 — app.js와 테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function flag(v) { return v === true || v === 1 || v === '1' || v === 'true'; }

    function supportsOneSide(kind) { return kind === 'beam' || kind === 'column'; }
    function supportsSlab(kind) { return kind === 'beam'; }
    function supportsExcludeSlab(kind) { return kind === 'beam'; }
    function supportsExcludeInsulation(kind) { return kind === 'beam'; }
    function supportsExcludeWall(kind) { return kind === 'column' || kind === 'circle'; }

    function normOneSide(kind, oneSide) {
        if (!supportsOneSide(kind)) return null;
        return (oneSide === 'primary' || oneSide === 'secondary') ? oneSide : null;
    }

    /** 칸 이름 — 보: 폭/춤, 기둥: 정면/측면 */
    function sideNames(kind) {
        return kind === 'column' ? { primary: '정면', secondary: '측면' } : { primary: '폭', secondary: '춤' };
    }

    function clampPositive(n, fallback) {
        return (n !== null && n > 0) ? n : fallback;
    }

    /**
     * 입력값 → 저장값·계산값
     * o: { kind, designW, designD, rawW, rawD, oneSide, slabOn, slab,
     *      excludeSlabOn, excludeSlabMm, excludeInsulationOn, excludeInsulationMm,
     *      excludeWallOn, excludeWallMm }
     */
    function resolveRc(o) {
        o = o || {};
        var kind = o.kind;
        var os = normOneSide(kind, o.oneSide);
        var slabOn = !!(supportsSlab(kind) && o.slabOn);
        var exSlabOn = !!(supportsExcludeSlab(kind) && flag(o.excludeSlabOn));
        var exInsOn = !!(supportsExcludeInsulation(kind) && flag(o.excludeInsulationOn));
        var exWallOn = !!(supportsExcludeWall(kind) && flag(o.excludeWallOn));
        if (slabOn && exSlabOn) exSlabOn = false;
        var slab = slabOn ? num(o.slab) : null;
        var exSlabMm = exSlabOn ? num(o.excludeSlabMm) : null;
        var exInsMm = exInsOn ? num(o.excludeInsulationMm) : null;
        var exWallMm = exWallOn ? num(o.excludeWallMm) : null;
        var rawW = num(o.rawW);
        var rawD = num(o.rawD);
        var designW = num(o.designW);
        var designD = num(o.designD);
        var depthTotal = rawD;
        if (depthTotal !== null) {
            if (slab) depthTotal = depthTotal + slab;
            if (exSlabMm) depthTotal = depthTotal - exSlabMm;
            if (exInsMm) depthTotal = depthTotal - exInsMm;
            depthTotal = clampPositive(depthTotal, rawD);
        }
        var widthTotal = rawW;
        if (widthTotal !== null && exWallMm) {
            widthTotal = clampPositive(widthTotal - exWallMm, rawW);
        }
        var storeW = os === 'secondary' ? null : widthTotal;
        var storeD = os === 'primary' ? null : depthTotal;
        return {
            oneSide: os,
            slab: slab,
            depthBelowSlab: (slab !== null && os !== 'primary') ? rawD : null,
            storeW: storeW,
            storeD: storeD,
            calcW: os === 'secondary' ? designW : storeW,
            calcD: os === 'primary' ? designD : storeD,
            rawW: rawW,
            rawD: rawD,
            excludeSlabOn: exSlabOn,
            excludeSlabMm: exSlabMm,
            excludeInsulationOn: exInsOn,
            excludeInsulationMm: exInsMm,
            excludeWallOn: exWallOn,
            excludeWallMm: exWallMm
        };
    }

    /** 저장된 항목의 계산용 실측치수(안 잰 쪽은 설계치수). 이미 빼 둔 저장값을 다시 빼지 않음. */
    function measuredForCalc(item, kind) {
        if (!item) return { w: null, d: null };
        var os = normOneSide(kind, item.measureOneSide);
        var mw = num(item.measuredWidth !== undefined && item.measuredWidth !== null ? item.measuredWidth : item.avgValue);
        var md = num(item.measuredDepth);
        return {
            w: os === 'secondary' ? num(item.designWidth) : mw,
            d: os === 'primary' ? num(item.designDepth) : md
        };
    }

    /** 「폭만 측정」 같은 표시(없으면 '') */
    function oneSideNote(item, kind) {
        var os = normOneSide(kind, item && item.measureOneSide);
        if (!os) return '';
        return sideNames(kind)[os] + '만 측정';
    }

    /** 「슬래브 150 포함」 표시(없으면 '') */
    function slabNote(item, kind) {
        if (!supportsSlab(kind)) return '';
        var s = num(item && item.slabThickness);
        if (s === null || normOneSide(kind, item.measureOneSide) === 'primary') return '';
        return '슬래브 ' + s + ' 포함';
    }

    function excludePartNote(on, mm, labeled, labeledBare) {
        if (!flag(on)) return '';
        var n = num(mm);
        return n ? (labeled + ' ' + n + ' 제외') : labeledBare;
    }

    function excludeNote(item, kind) {
        if (!item) return '';
        var parts = [];
        if (supportsExcludeSlab(kind)) {
            var s = excludePartNote(item.excludeSlab, item.excludeSlabThickness, '슬래브', '슬래브 두께 제외');
            if (s) parts.push(s);
        }
        if (supportsExcludeInsulation(kind)) {
            var i = excludePartNote(item.excludeInsulation, item.excludeInsulationThickness, '단열', '단열 두께 제외');
            if (i) parts.push(i);
        }
        if (supportsExcludeWall(kind)) {
            var w = excludePartNote(item.excludeWall, item.excludeWallThickness, '벽체', '벽체 두께 제외');
            if (w) parts.push(w);
        }
        return parts.join(' · ');
    }

    /** 다시 열 때 춤 칸에 넣을 값 — 합산이면 슬래브 아래 춤, 제외면 빼기 전 입력값 */
    function depthInputValue(item) {
        if (!item) return '';
        var raw = num(item.measuredDepthRaw);
        if (raw !== null && (flag(item.excludeSlab) || flag(item.excludeInsulation))) return raw;
        var s = num(item.slabThickness);
        if (s !== null) {
            var below = num(item.measuredDepthBelowSlab);
            if (below !== null) return below;
            var total = num(item.measuredDepth);
            if (total !== null && total > s) return Math.round((total - s) * 100) / 100;
        }
        if (flag(item.excludeSlab) || flag(item.excludeInsulation)) {
            var stored = num(item.measuredDepth);
            var add = (num(item.excludeSlabThickness) || 0) + (num(item.excludeInsulationThickness) || 0);
            if (stored !== null && add) return Math.round((stored + add) * 100) / 100;
        }
        return (item.measuredDepth !== undefined && item.measuredDepth !== null) ? item.measuredDepth : '';
    }

    /** 다시 열 때 폭/지름 칸 — 벽체 제외면 빼기 전 입력값 */
    function widthInputValue(item) {
        if (!item) return '';
        var raw = num(item.measuredWidthRaw);
        if (raw !== null && flag(item.excludeWall)) return raw;
        if (flag(item.excludeWall)) {
            var stored = num(item.measuredWidth !== undefined && item.measuredWidth !== null ? item.measuredWidth : item.avgValue);
            var add = num(item.excludeWallThickness) || 0;
            if (stored !== null && add) return Math.round((stored + add) * 100) / 100;
            if (stored !== null) return stored;
        }
        if (item.measuredWidth !== undefined && item.measuredWidth !== null) return item.measuredWidth;
        return '';
    }

    var api = {
        supportsOneSide: supportsOneSide, supportsSlab: supportsSlab, normOneSide: normOneSide, sideNames: sideNames,
        supportsExcludeSlab: supportsExcludeSlab, supportsExcludeInsulation: supportsExcludeInsulation,
        supportsExcludeWall: supportsExcludeWall,
        resolveRc: resolveRc, measuredForCalc: measuredForCalc, oneSideNote: oneSideNote, slabNote: slabNote,
        excludeNote: excludeNote, depthInputValue: depthInputValue, widthInputValue: widthInputValue
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.ndtMeasureOpts = api;
})(typeof window !== 'undefined' ? window : globalThis);
