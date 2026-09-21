/**
 * 결함 데이터 건강 점검.
 *
 * 2026-09-20: 광주겨자씨교회 「지하1층 주차장-2」의 결함 15개가 전부 부재=기둥,
 * 결함=균열, 크기·폭 없음인 껍데기 상태로 남아 있는 것을 우연히 발견했다.
 * 하루 전 복구 작업 때 개수(15개)만 맞는지 보고 "복구 완료"로 판단해서, 내용이
 * 비어 있다는 걸 아무도 몰랐다.
 *
 * 데이터가 망가지는 것보다 **망가진 걸 며칠 모르는 것**이 더 나쁘다. 그래서
 * 사람이 눈으로 훑지 않아도 껍데기 층을 바로 짚어내게 한다.
 *
 * 판정 기준(둘 다여야 의심):
 *   - 부재와 결함이 각각 딱 한 종류뿐이다 (진짜 점검이면 층마다 여러 종류가 나온다)
 *   - 크기·균열폭이 하나도 없다
 * 결함이 2개 이하인 층은 원래 종류가 적을 수 있어 의심하지 않는다.
 */
(function (root) {
    'use strict';

    /** 결함이 이보다 적으면 종류가 하나여도 이상하지 않다 */
    const MIN_DEFECTS_TO_JUDGE = 3;

    function textOf(value) {
        return value == null ? '' : String(value).trim();
    }

    function uniqueNonEmpty(list) {
        const seen = Object.create(null);
        const out = [];
        (list || []).forEach(function (v) {
            const s = textOf(v);
            if (!s || seen[s]) return;
            seen[s] = true;
            out.push(s);
        });
        return out;
    }

    /** 이 결함에 실측값이 하나라도 있나 */
    function hasMeasurement(d) {
        if (!d) return false;
        return !!(textOf(d.size) || textOf(d.crackWidth) || textOf(d.crackLength));
    }

    /**
     * 부재나 조사내용이 비어 있는 결함인가.
     * 현장에서 위치만 찍고 내용을 빠뜨린 행 — 보고서에 빈 줄로 나간다.
     * 조사표 화면 표시(renderSurveyTable)와 checkDataHealth()가 같은 기준을 쓴다.
     */
    function isBlankContentDefect(d) {
        if (!d) return false;
        return !textOf(d.component) || !textOf(d.defectType);
    }

    /** 비어 있는 칸 이름들 ('component' / 'defectType') — 화면에서 그 칸만 짚어주려고 */
    function blankContentFields(d) {
        const out = [];
        if (!d) return out;
        if (!textOf(d.component)) out.push('component');
        if (!textOf(d.defectType)) out.push('defectType');
        return out;
    }

    function analyzeFloor(floorCode, defects) {
        const arr = Array.isArray(defects) ? defects.filter(Boolean) : [];
        const components = uniqueNonEmpty(arr.map(function (d) { return d.component; }));
        const defectTypes = uniqueNonEmpty(arr.map(function (d) { return d.defectType; }));
        const withMeasure = arr.filter(hasMeasurement).length;
        const blankContent = arr.filter(isBlankContentDefect).length;

        const row = {
            floorCode: floorCode,
            count: arr.length,
            components: components,
            defectTypes: defectTypes,
            withMeasure: withMeasure,
            blankContent: blankContent,
            suspicious: false,
            reason: ''
        };

        if (arr.length === 0) return row;

        if (blankContent > 0) {
            row.suspicious = true;
            row.reason = '부재·결함이 비어 있는 결함 ' + blankContent + '개';
            return row;
        }

        if (arr.length >= MIN_DEFECTS_TO_JUDGE
            && components.length === 1
            && defectTypes.length === 1
            && withMeasure === 0) {
            row.suspicious = true;
            row.reason = '전부 ' + components[0] + '/' + defectTypes[0]
                + ' 한 종류인데 크기·폭이 하나도 없음 (껍데기로 보임)';
        }
        return row;
    }

    /**
     * 건물 하나의 층별 상태.
     * defectsMap: window.state.defects ({ '<건물id>_<층코드>': [결함…] })
     */
    function analyzeBuilding(defectsMap, buildingId) {
        const out = [];
        const id = textOf(buildingId);
        if (!defectsMap || !id) return out;
        const prefix = id + '_';
        Object.keys(defectsMap).forEach(function (key) {
            if (String(key).indexOf(prefix) !== 0) return;
            out.push(analyzeFloor(String(key).slice(prefix.length), defectsMap[key]));
        });
        return out;
    }

    /**
     * 같은 번호(id)가 여러 층에 들어가 있는지 찾는다.
     *
     * 2026-09-21: 광주겨자씨교회에서 지상1층 비파괴 20건이 「지하1층 주차장-2」에
     * 같은 id로 통째 복사돼 있었다. 앱은 한 번에 한 층만 보여줘서 아무도 몰랐고,
     * 모든 층을 합쳐 찍는 한글 보고서에서야 같은 측정이 두 번 나와 드러났다.
     * (9/19 층 섞임 사고가 남긴 자국. 섞임 자체는 9/20에 막았다)
     *
     * recordsMap: { '<건물id>_<층코드>': [ {id…} … ] }
     * returns [{ id, floorCodes: [...] }]
     */
    function crossFloorDuplicateIds(recordsMap, buildingId) {
        const id = textOf(buildingId);
        const out = [];
        if (!recordsMap || !id) return out;
        const prefix = id + '_';
        const floorsById = Object.create(null);
        Object.keys(recordsMap).forEach(function (key) {
            if (String(key).indexOf(prefix) !== 0) return;
            const floorCode = String(key).slice(prefix.length);
            const arr = Array.isArray(recordsMap[key]) ? recordsMap[key] : [];
            arr.forEach(function (rec) {
                const rid = rec && textOf(rec.id);
                if (!rid) return;
                if (!floorsById[rid]) floorsById[rid] = [];
                if (floorsById[rid].indexOf(floorCode) < 0) floorsById[rid].push(floorCode);
            });
        });
        Object.keys(floorsById).forEach(function (rid) {
            if (floorsById[rid].length < 2) return;
            out.push({ id: rid, floorCodes: floorsById[rid] });
        });
        return out;
    }

    /**
     * 한 층에서 "다른 층에도 있는" 번호만 골라낸다(정리 대상 후보).
     * 그 층에만 있는 항목은 절대 고르지 않는다 — 지우면 안 되는 데이터다.
     */
    function duplicatedRecordsOnFloor(recordsMap, buildingId, floorCode) {
        const code = textOf(floorCode);
        const dups = crossFloorDuplicateIds(recordsMap, buildingId);
        const onFloor = Object.create(null);
        dups.forEach(function (d) {
            if (d.floorCodes.indexOf(code) >= 0) onFloor[d.id] = d.floorCodes;
        });
        const key = textOf(buildingId) + '_' + code;
        const arr = Array.isArray(recordsMap && recordsMap[key]) ? recordsMap[key] : [];
        return arr.filter(function (rec) {
            return rec && onFloor[textOf(rec.id)];
        });
    }

    /**
     * 여러 층을 합쳐 보고서에 넣을 때, 같은 번호(id)는 처음 만난 층에서 한 번만 가져온다.
     *
     * 층 섞임으로 같은 항목이 두 층에 들어가 있으면 결과표에 같은 측정이 두 번 나온다.
     * 어느 층이 맞는지는 여기서 알 수 없으므로, 중복은 duplicates로 따로 알려서
     * 사람이 데이터를 고치게 한다(cleanDuplicateNdt).
     *
     * returns { kept: [{ floorCode, record }], duplicates: [{ id, floorCode, firstFloorCode }] }
     */
    function collectFirstByIdAcrossFloors(recordsMap, buildingId, floorCodes) {
        const id = textOf(buildingId);
        const kept = [];
        const duplicates = [];
        if (!recordsMap || !id) return { kept: kept, duplicates: duplicates };
        const firstFloorById = Object.create(null);
        const seenFloors = Object.create(null);
        (floorCodes || []).forEach(function (fc) {
            const floorCode = textOf(fc);
            if (!floorCode || seenFloors[floorCode]) return;
            seenFloors[floorCode] = true;
            const arr = recordsMap[id + '_' + floorCode];
            if (!Array.isArray(arr)) return;
            arr.forEach(function (rec) {
                if (!rec) return;
                const rid = textOf(rec.id);
                if (rid) {
                    if (firstFloorById[rid]) {
                        duplicates.push({
                            id: rid,
                            floorCode: floorCode,
                            firstFloorCode: firstFloorById[rid]
                        });
                        return;
                    }
                    firstFloorById[rid] = floorCode;
                }
                kept.push({ floorCode: floorCode, record: rec });
            });
        });
        return { kept: kept, duplicates: duplicates };
    }

    function suspiciousFloors(defectsMap, buildingId) {
        return analyzeBuilding(defectsMap, buildingId).filter(function (r) {
            return r.suspicious;
        });
    }

    const api = {
        MIN_DEFECTS_TO_JUDGE: MIN_DEFECTS_TO_JUDGE,
        hasMeasurement: hasMeasurement,
        isBlankContentDefect: isBlankContentDefect,
        blankContentFields: blankContentFields,
        analyzeFloor: analyzeFloor,
        analyzeBuilding: analyzeBuilding,
        suspiciousFloors: suspiciousFloors,
        crossFloorDuplicateIds: crossFloorDuplicateIds,
        collectFirstByIdAcrossFloors: collectFirstByIdAcrossFloors,
        duplicatedRecordsOnFloor: duplicatedRecordsOnFloor
    };

    root.BSA = root.BSA || {};
    root.BSA.dataHealth = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
