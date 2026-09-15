/**
 * 층 코드/라벨/순서.
 * 사용자가 직접 입력한 이름(지하주차장-1 등)과 등록·드래그 순서는
 * 파일명 자동인식·저층→고층 정렬이 덮어쓰지 않는다.
 */
(function (root) {
    'use strict';

    function asText(value) {
        return value == null ? '' : String(value).trim();
    }

    function isParkingZoneName(text) {
        return /주차/.test(asText(text));
    }

    function isStandardFloorCode(code) {
        const raw = asText(code);
        if (!raw) return false;
        const c = raw.toUpperCase();
        if (c === 'EXT' || c.indexOf('EXT_') === 0 || raw.indexOf('외부') >= 0) return true;
        if (c === 'ROOF' || c === 'PH' || c === 'PH_ROOF') return true;
        if (/^B[\s_-]*\d+\s*F?$/.test(c)) return true;
        if (/^\d+\s*F$/.test(c)) return true;
        if (/^지하\s*\d+\s*층?$/.test(raw)) return true;
        if (/^지상\s*\d+\s*층?$/.test(raw)) return true;
        return false;
    }

    /** 지하 1층 / B1F 만. "지하주차장-1" 은 해당 없음 */
    function parseBasementNumber(text) {
        const raw = asText(text);
        if (!raw || isParkingZoneName(raw)) return null;
        const c = raw.toUpperCase();
        let m = c.match(/^B[\s_-]*([0-9]{1,2})\s*F?$/);
        if (m) return parseInt(m[1], 10);
        m = raw.match(/^지하\s*([0-9]{1,2})\s*층?$/);
        if (m) return parseInt(m[1], 10);
        m = c.match(/^B\s*([0-9]+)\s*F$/);
        if (m) return parseInt(m[1], 10);
        if (/B\s*\d+/.test(c) && /지하\s*([0-9]{1,2})\s*층/.test(raw)) {
            return parseInt(raw.match(/지하\s*([0-9]{1,2})\s*층/)[1], 10);
        }
        return null;
    }

    function parseGroundNumber(text) {
        const raw = asText(text);
        if (!raw || isParkingZoneName(raw)) return null;
        const c = raw.toUpperCase();
        let m = c.match(/^([0-9]{1,2})\s*F$/);
        if (m) return parseInt(m[1], 10);
        m = raw.match(/^지상\s*([0-9]{1,2})\s*층?$/);
        if (m) return parseInt(m[1], 10);
        return null;
    }

    function rankFromCode(code) {
        const raw = asText(code);
        if (!raw) return 0;
        const c = raw.toUpperCase();
        if (c.indexOf('EXT') >= 0 || raw.indexOf('외부') >= 0) return 10000;
        if (typeof root.resolveRoofFloorFromText === 'function') {
            const roof = root.resolveRoofFloorFromText(raw);
            if (roof) return roof.rank;
        }
        const b = parseBasementNumber(raw);
        if (b != null) return -b;
        const g = parseGroundNumber(raw);
        if (g != null) return g;
        const fMatch = c.match(/^([0-9]+)\s*F/);
        if (fMatch && isStandardFloorCode(raw)) return parseInt(fMatch[1], 10);
        return 0;
    }

    function labelFromCode(code) {
        const raw = asText(code);
        if (!raw) return '1F';
        const c = raw.toUpperCase();
        const defs = root.EXT_DIRECTION_DEFS || [];
        for (let i = 0; i < defs.length; i++) {
            if (defs[i] && defs[i].code === c) return defs[i].label;
        }
        if (c === 'EXT' || raw.indexOf('외부') >= 0) return '건축물 외부 (EXT)';
        if (typeof root.resolveRoofFloorFromText === 'function') {
            const roof = root.resolveRoofFloorFromText(raw);
            if (roof) return roof.label;
        }
        const b = parseBasementNumber(raw);
        if (b != null) {
            const codeLabel = /^B/i.test(c) ? c : ('B' + b + 'F');
            return '지하 ' + b + '층 (' + codeLabel + ')';
        }
        const g = parseGroundNumber(raw);
        if (g != null) return '지상 ' + g + '층 (' + g + 'F)';
        if (/^B\s*([0-9]+)/.test(c) && isStandardFloorCode(raw)) {
            return '지하 ' + c.match(/([0-9]+)/)[1] + '층 (' + c + ')';
        }
        if (/([0-9]+)\s*F/.test(c) && isStandardFloorCode(raw)) {
            return '지상 ' + c.match(/([0-9]+)/)[1] + '층 (' + c + ')';
        }
        return raw;
    }

    function normalizeUserLabel(code, label) {
        const raw = asText(code);
        const given = asText(label);
        if (!raw) return given;
        if (!given) return labelFromCode(raw);
        const upper = raw.toUpperCase();
        const mangled = [
            raw + '층',
            raw + '층 (' + raw + ')',
            upper + '층',
            upper + '층 (' + upper + ')'
        ];
        if (mangled.indexOf(given) >= 0) return raw;
        return given;
    }

    function lookupFloorLabel(code, bldg) {
        const raw = asText(code);
        if (bldg && Array.isArray(bldg.floorsList)) {
            for (let i = 0; i < bldg.floorsList.length; i++) {
                const f = bldg.floorsList[i];
                if (f && String(f.floorCode) === raw && f.floorLabel) {
                    return normalizeUserLabel(raw, f.floorLabel);
                }
            }
        }
        return labelFromCode(raw);
    }

    /**
     * 표준 층(B2F·1F 등)끼리만 저층→고층. 직접 입력 이름은 원래 순서 유지.
     */
    function sortFloorsLowToHigh(floorsList) {
        if (!Array.isArray(floorsList)) return [];
        const items = floorsList.map(function (f, i) {
            return { f: f, i: i };
        });
        items.sort(function (a, b) {
            const aCode = a.f && (a.f.floorCode || a.f);
            const bCode = b.f && (b.f.floorCode || b.f);
            const aStd = isStandardFloorCode(aCode);
            const bStd = isStandardFloorCode(bCode);
            if (aStd && bStd) return rankFromCode(aCode) - rankFromCode(bCode);
            return a.i - b.i;
        });
        return items.map(function (x) { return x.f; });
    }

    /**
     * preferred(사용자가 저장한 floorsList) 순서를 최우선.
     * 목록에 없는 새 표준 층만 뒤에 저층→고층으로 붙인다.
     */
    function assembleFloors(preferredList, extras) {
        const map = {};
        const add = function (code, label) {
            const c = asText(code);
            if (!c) return;
            if (!map[c]) {
                map[c] = {
                    floorCode: c,
                    floorLabel: normalizeUserLabel(c, label || labelFromCode(c))
                };
            } else if (label) {
                map[c].floorLabel = normalizeUserLabel(c, label);
            }
        };
        (preferredList || []).forEach(function (f) {
            if (!f) return;
            if (typeof f === 'string') add(f, '');
            else add(f.floorCode, f.floorLabel);
        });
        (extras || []).forEach(function (f) {
            if (!f) return;
            if (typeof f === 'string') add(f, '');
            else add(f.floorCode, f.floorLabel);
        });
        const ordered = [];
        const seen = {};
        (preferredList || []).forEach(function (f) {
            const c = asText(typeof f === 'string' ? f : (f && f.floorCode));
            if (!c || seen[c] || !map[c]) return;
            seen[c] = true;
            ordered.push(map[c]);
        });
        const rest = [];
        Object.keys(map).forEach(function (c) {
            if (!seen[c]) rest.push(map[c]);
        });
        const restStd = rest.every(function (f) { return isStandardFloorCode(f.floorCode); });
        const restOrdered = restStd ? sortFloorsLowToHigh(rest) : rest;
        return ordered.concat(restOrdered);
    }

    function parseCustomStemFromFilename(fileName) {
        const stem = asText(String(fileName || '').replace(/\.[^/.]+$/, ''));
        if (!stem) return null;
        if (isParkingZoneName(stem) || !isStandardFloorCode(stem)) {
            if (isParkingZoneName(stem)) {
                return { rank: 0, floorCode: stem, floorLabel: stem, matched: true };
            }
        }
        return null;
    }

    var api = {
        isParkingZoneName: isParkingZoneName,
        isStandardFloorCode: isStandardFloorCode,
        parseBasementNumber: parseBasementNumber,
        parseGroundNumber: parseGroundNumber,
        rankFromCode: rankFromCode,
        labelFromCode: labelFromCode,
        normalizeUserLabel: normalizeUserLabel,
        lookupFloorLabel: lookupFloorLabel,
        sortFloorsLowToHigh: sortFloorsLowToHigh,
        assembleFloors: assembleFloors,
        parseCustomStemFromFilename: parseCustomStemFromFilename
    };

    root.BSA = root.BSA || {};
    root.BSA.floorIdentity = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
