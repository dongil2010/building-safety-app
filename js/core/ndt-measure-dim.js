/**
 * 부재실측 폭×춤 / 정면×측면 치수.
 * 한쪽만 있으면 빈 칸을 '-' 로 남겨 650×- 처럼 표기한다.
 */
(function (root) {
    'use strict';

    function isFilledDim(value) {
        if (value === undefined || value === null) return false;
        const s = String(value).trim();
        if (!s || s === '-') return false;
        return true;
    }

    function parseDimNumber(raw) {
        if (raw === undefined || raw === null) return null;
        const s = String(raw).trim();
        if (!s || s === '-') return null;
        const n = parseFloat(s.replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    /**
     * 한 칸에 "650×" / "650×-" / "400*600" 을 적어도 되고,
     * 폭·춤 칸을 나눠 적어도 된다. 빈 쪽은 null.
     */
    function parseDimensionPair(rawWidth, rawDepth) {
        const wStr = String(rawWidth == null ? '' : rawWidth).trim();
        if (/[×xX*]/.test(wStr)) {
            const parts = wStr.split(/[×xX*]/).map(function (s) { return s.trim(); });
            if (parts.length >= 2) {
                return { w: parseDimNumber(parts[0]), d: parseDimNumber(parts[1]) };
            }
        }
        return {
            w: parseDimNumber(wStr),
            d: parseDimNumber(rawDepth)
        };
    }

    /** 둘 다 없으면 '-', 한쪽만 있으면 650×- 또는 -×650 */
    function formatPairDimText(primary, secondary, joiner) {
        const sep = joiner == null ? ' × ' : joiner;
        const hasP = isFilledDim(primary);
        const hasS = isFilledDim(secondary);
        if (!hasP && !hasS) return '-';
        return (hasP ? String(primary).trim() : '-') + sep + (hasS ? String(secondary).trim() : '-');
    }

    var api = {
        isFilledDim: isFilledDim,
        parseDimNumber: parseDimNumber,
        parseDimensionPair: parseDimensionPair,
        formatPairDimText: formatPairDimText
    };

    root.BSA = root.BSA || {};
    root.BSA.ndtMeasureDim = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
