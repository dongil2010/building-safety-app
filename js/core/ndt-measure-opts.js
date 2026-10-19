/**
 * 부재실측 선택 입력 — 2026-10-19
 *  - 「이쪽만 측정」: 보·기둥에서 한쪽(폭/춤, 정면/측면)만 잰 부재. 안 잰 쪽은 설계치수로 보고 단면적 비율을 낸다
 *    (= 잰 쪽 치수 비율). 안 잰 쪽 실측값은 저장하지 않는다(null) — 표에는 '-'와 「폭만 측정」 같은 표시.
 *  - 「슬래브 두께 합산」(보만): 현장에서는 슬래브 아래 보 춤만 잴 수 있어서, 입력한 춤 + 슬래브 두께를 실측 춤으로 쓴다.
 *    저장: measuredDepth = 합계, measuredDepthBelowSlab = 입력한 춤, slabThickness = 슬래브 두께.
 * 순수 함수 — app.js와 테스트가 같이 쓴다.
 */
(function (root) {
    'use strict';

    function num(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    function supportsOneSide(kind) { return kind === 'beam' || kind === 'column'; }
    function supportsSlab(kind) { return kind === 'beam'; }

    function normOneSide(kind, oneSide) {
        if (!supportsOneSide(kind)) return null;
        return (oneSide === 'primary' || oneSide === 'secondary') ? oneSide : null;
    }

    /** 칸 이름 — 보: 폭/춤, 기둥: 정면/측면 */
    function sideNames(kind) {
        return kind === 'column' ? { primary: '정면', secondary: '측면' } : { primary: '폭', secondary: '춤' };
    }

    /**
     * 입력값 → 저장값·계산값
     * o: { kind, designW, designD, rawW, rawD, oneSide, slabOn, slab }
     */
    function resolveRc(o) {
        o = o || {};
        var kind = o.kind;
        var os = normOneSide(kind, o.oneSide);
        var slab = (supportsSlab(kind) && o.slabOn) ? num(o.slab) : null;
        var rawW = num(o.rawW);
        var rawD = num(o.rawD);
        var designW = num(o.designW);
        var designD = num(o.designD);
        var depthTotal = rawD !== null ? rawD + (slab || 0) : null;
        var storeW = os === 'secondary' ? null : rawW;
        var storeD = os === 'primary' ? null : depthTotal;
        return {
            oneSide: os,
            slab: slab,
            depthBelowSlab: (slab !== null && os !== 'primary') ? rawD : null,
            storeW: storeW,
            storeD: storeD,
            calcW: os === 'secondary' ? designW : storeW,
            calcD: os === 'primary' ? designD : storeD
        };
    }

    /** 저장된 항목의 계산용 실측치수(안 잰 쪽은 설계치수) */
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

    /** 다시 열 때 춤 칸에 넣을 값 — 슬래브 합산이면 슬래브 아래 춤 */
    function depthInputValue(item) {
        if (!item) return '';
        var s = num(item.slabThickness);
        if (s !== null) {
            var below = num(item.measuredDepthBelowSlab);
            if (below !== null) return below;
            var total = num(item.measuredDepth);
            if (total !== null && total > s) return Math.round((total - s) * 100) / 100;
        }
        return (item.measuredDepth !== undefined && item.measuredDepth !== null) ? item.measuredDepth : '';
    }

    var api = {
        supportsOneSide: supportsOneSide, supportsSlab: supportsSlab, normOneSide: normOneSide, sideNames: sideNames,
        resolveRc: resolveRc, measuredForCalc: measuredForCalc, oneSideNote: oneSideNote, slabNote: slabNote,
        depthInputValue: depthInputValue
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.ndtMeasureOpts = api;
})(typeof window !== 'undefined' ? window : globalThis);
