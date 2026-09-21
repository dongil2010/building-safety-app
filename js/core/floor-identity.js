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
        const extSerialRank = c.match(/^EXT_(\d+)$/) || raw.match(/^외부\s*(\d+)$/);
        if (extSerialRank) return 10000 + parseInt(extSerialRank[1], 10);
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
        const serial = c.match(/^EXT_(\d+)$/);
        if (serial) return '외부' + serial[1] + ' (EXT_' + serial[1] + ')';
        const extNum = raw.match(/^외부\s*(\d+)$/);
        if (extNum) return '외부' + extNum[1] + ' (EXT_' + extNum[1] + ')';
        const defs = root.EXT_DIRECTION_DEFS || [];
        for (let i = 0; i < defs.length; i++) {
            if (defs[i] && defs[i].code === c) return defs[i].label;
        }
        if (c === 'EXT' || raw === '외부') return '건축물 외부 (EXT)';
        if (raw.indexOf('외부') >= 0) return raw;
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
     * 비파괴조사 결과표·위치도에 넣을 층 코드.
     * floorsList만 보면 드롭다운에는 있는 캣워크 같은 추가 도면 층이 빠진다.
     */
    function listFloorCodesForNdtReport(bldg, extraKeyMaps) {
        const codes = [];
        const seen = {};
        const add = function (fc) {
            const c = asText(typeof fc === 'string' ? fc : (fc && fc.floorCode));
            if (!c || seen[c]) return;
            seen[c] = true;
            codes.push(c);
        };
        (bldg && bldg.floorsList || []).forEach(add);
        (bldg && bldg.drawingFloorCodes || []).forEach(add);
        Object.keys((bldg && bldg.floorDrawings) || {}).forEach(add);
        Object.keys((bldg && bldg.floorDrawingPdfs) || {}).forEach(add);
        Object.keys((bldg && bldg.floorDrawingTiers) || {}).forEach(add);
        Object.keys((bldg && bldg.floorDrawingSources) || {}).forEach(add);
        const prefix = (bldg && bldg.id) ? String(bldg.id) + '_' : '';
        (extraKeyMaps || []).forEach(function (map) {
            Object.keys(map || {}).forEach(function (k) {
                if (!prefix) return;
                if (String(k).indexOf(prefix) === 0) add(String(k).slice(prefix.length));
            });
        });
        return codes;
    }

    function mapEntryHasNdtPayload(val) {
        if (Array.isArray(val)) return val.length > 0;
        return !!val;
    }

    /**
     * ndtData/변위/ndtImages에 실제로 내용이 있는 층만.
     * 빈 배열 키는 빼고, 도면 톰스톤과 무관하게 보고서 합본에 넣어야 하는 잔여 키를 찾는다.
     */
    function listNdtPayloadFloorCodes(buildingId, extraKeyMaps) {
        const prefix = buildingId ? String(buildingId) + '_' : '';
        const out = [];
        const seen = {};
        if (!prefix) return out;
        (extraKeyMaps || []).forEach(function (map) {
            Object.keys(map || {}).forEach(function (k) {
                if (String(k).indexOf(prefix) !== 0) return;
                const c = String(k).slice(prefix.length);
                if (!c || seen[c]) return;
                if (!mapEntryHasNdtPayload(map[k])) return;
                seen[c] = true;
                out.push(c);
            });
        });
        return out;
    }

    /** 도면을 지워도 그 층 비파괴 데이터가 있으면 보고서에서 빼지 않는다. */
    function keepNdtFloorCode(code, isDeletedDrawing, hasNdtPayload) {
        if (!code) return false;
        if (hasNdtPayload) return true;
        return !isDeletedDrawing;
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

    function stemFromFilename(fileName) {
        return asText(String(fileName || '').replace(/\.[^/.]+$/, '')) || '도면';
    }

    function parseCustomStemFromFilename(fileName) {
        const stem = stemFromFilename(fileName);
        if (!stem) return null;
        if (isParkingZoneName(stem) || !isStandardFloorCode(stem)) {
            if (isParkingZoneName(stem)) {
                return { rank: 0, floorCode: stem, floorLabel: stem, matched: true };
            }
        }
        return null;
    }

    /**
     * 파일명에서 층을 못 알아낸 경우 1F로 몰지 않고, 파일 이름(확장자 제외)을 층 코드로 쓴다.
     * IMG_001.jpg / 도면.jpg 가 기존 1F 도면을 덮어쓰던 문제 방지.
     */
    function unmatchedFloorFromFilename(fileName) {
        const stem = stemFromFilename(fileName);
        return { rank: 0, floorCode: stem, floorLabel: stem, matched: false };
    }

    /**
     * 직접 입력(커스텀) 층만 고유화. 1F·B1F 등 표준 코드는 같은 층 교체로 둔다.
     */
    function uniquifyCustomFloorCode(baseCode, usedCodes) {
        const base = asText(baseCode) || '도면';
        if (isStandardFloorCode(base)) return base;
        const used = new Set();
        (usedCodes || []).forEach(function (c) {
            if (c != null && String(c)) used.add(String(c));
        });
        if (!used.has(base)) return base;
        var n = 2;
        var next = base + '-' + n;
        while (used.has(next)) {
            n += 1;
            next = base + '-' + n;
        }
        return next;
    }

    function isExteriorLikeCode(code) {
        const raw = asText(code);
        if (!raw) return false;
        if (typeof root.isExteriorFloorCode === 'function') return !!root.isExteriorFloorCode(raw);
        const c = raw.toUpperCase();
        return c === 'EXT' || c.indexOf('EXT_') === 0 || raw.indexOf('외부') >= 0 || raw.indexOf('입면') >= 0;
    }

    /**
     * 건축물 외부 결함위치도에 넣을 도면 코드들.
     *
     * 상태조사표는 외부 하나(EXT)로 합치지만 도면은 현장마다 다르게 쓴다.
     *  - 배치도 한 장에 몰아서 찍는 경우 → 핀이 EXT에 있다
     *  - 입면도(정면·배면·좌측·우측)에 나눠 찍는 경우 → 핀이 EXT_S·EXT_BACK… 에 있다
     * 예전에는 위치도가 EXT 코드 하나만 봐서, 입면도에 나눠 찍으면 외부 위치도가
     * 통째로 빠졌다. 두 방식 모두 되도록 결함이 있는 코드를 전부 돌려준다.
     *
     * hasDefects: (code) => boolean — 그 코드에 결함(핀)이 있는지
     * 결함이 있는 코드가 하나도 없으면 후보를 그대로 돌려준다(도면만 있어도 넣게).
     */
    function exteriorLocationMapCodes(baseCode, exteriorCodes, hasDefects) {
        const codes = [];
        const push = function (c) {
            const code = asText(c);
            if (code && codes.indexOf(code) < 0) codes.push(code);
        };
        push(baseCode);
        (exteriorCodes || []).forEach(push);
        if (!codes.length) return [];
        if (typeof hasDefects !== 'function') return codes;
        const withDefects = codes.filter(function (code) {
            try { return !!hasDefects(code); } catch (_e) { return false; }
        });
        return withDefects.length ? withDefects : codes;
    }

    function usedCodeSet(usedCodes) {
        const used = new Set();
        (usedCodes || []).forEach(function (c) {
            if (c != null && String(c)) used.add(String(c));
        });
        return used;
    }

    /** 외부1·외부2… (코드 EXT_1·EXT_2). 정배좌우로 강제하지 않고 도면 장수대로 붙인다. */
    function allocateNextExteriorSerial(usedCodes) {
        const used = usedCodeSet(usedCodes);
        var n;
        for (n = 1; n <= 99; n++) {
            var code = 'EXT_' + n;
            var label = '외부' + n;
            if (!used.has(code) && !used.has(label) && !used.has('외부 ' + n)) {
                return { floorCode: code, floorLabel: label, rank: 10000 + n };
            }
        }
        code = 'EXT_' + Date.now();
        return { floorCode: code, floorLabel: code, rank: 10000 };
    }

    function parseExteriorSerialNumber(text) {
        const raw = asText(text);
        if (!raw) return null;
        var m = raw.match(/외부\s*[_\-]?\s*(\d{1,2})(?!\d)/);
        if (!m) m = raw.toUpperCase().match(/(?:^|[^A-Z0-9])EXT[_\s\-]*([0-9]{1,2})(?![A-Z0-9])/);
        if (!m) return null;
        var n = parseInt(m[1], 10);
        if (!(n >= 1 && n <= 99)) return null;
        return n;
    }

    /**
     * 업로드 한 장의 층 코드를 확정.
     * 인식 실패(matched:false)만 기존·같은 배치 코드와 겹치지 않게 고유화한다.
     * 외부는 정배좌우 강제 대신 EXT_1·EXT_2(표시: 외부1·2)로 붙이고, 같은 코드 충돌도 다음 번호로 넘긴다.
     */
    function assignParsedFloorForUpload(parsed, usedCodes) {
        const src = parsed || {};
        const matched = !!src.matched;
        var code = asText(src.floorCode) || '도면';
        var label = asText(src.floorLabel) || code;
        var rank = typeof src.rank === 'number' ? src.rank : 0;
        const used = usedCodeSet(usedCodes);

        if (src.exteriorSerial || code === 'EXT_SERIAL') {
            const alloc = allocateNextExteriorSerial(usedCodes);
            return { rank: alloc.rank, floorCode: alloc.floorCode, floorLabel: alloc.floorLabel, matched: true };
        }

        if (isExteriorLikeCode(code) && used.has(code)) {
            const alloc = allocateNextExteriorSerial(usedCodes);
            return { rank: alloc.rank, floorCode: alloc.floorCode, floorLabel: alloc.floorLabel, matched: true };
        }

        if (!matched) {
            code = uniquifyCustomFloorCode(code, usedCodes);
            label = code;
        }
        return {
            rank: rank,
            floorCode: code,
            floorLabel: label,
            matched: matched
        };
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
        listFloorCodesForNdtReport: listFloorCodesForNdtReport,
        listNdtPayloadFloorCodes: listNdtPayloadFloorCodes,
        keepNdtFloorCode: keepNdtFloorCode,
        stemFromFilename: stemFromFilename,
        parseCustomStemFromFilename: parseCustomStemFromFilename,
        unmatchedFloorFromFilename: unmatchedFloorFromFilename,
        uniquifyCustomFloorCode: uniquifyCustomFloorCode,
        isExteriorLikeCode: isExteriorLikeCode,
        exteriorLocationMapCodes: exteriorLocationMapCodes,
        allocateNextExteriorSerial: allocateNextExteriorSerial,
        parseExteriorSerialNumber: parseExteriorSerialNumber,
        assignParsedFloorForUpload: assignParsedFloorForUpload
    };

    root.BSA = root.BSA || {};
    root.BSA.floorIdentity = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
