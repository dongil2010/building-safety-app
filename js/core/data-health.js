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

    function analyzeFloor(floorCode, defects) {
        const arr = Array.isArray(defects) ? defects.filter(Boolean) : [];
        const components = uniqueNonEmpty(arr.map(function (d) { return d.component; }));
        const defectTypes = uniqueNonEmpty(arr.map(function (d) { return d.defectType; }));
        const withMeasure = arr.filter(hasMeasurement).length;
        const blankContent = arr.filter(function (d) {
            return !textOf(d.component) || !textOf(d.defectType);
        }).length;

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

    function suspiciousFloors(defectsMap, buildingId) {
        return analyzeBuilding(defectsMap, buildingId).filter(function (r) {
            return r.suspicious;
        });
    }

    const api = {
        MIN_DEFECTS_TO_JUDGE: MIN_DEFECTS_TO_JUDGE,
        hasMeasurement: hasMeasurement,
        analyzeFloor: analyzeFloor,
        analyzeBuilding: analyzeBuilding,
        suspiciousFloors: suspiciousFloors
    };

    root.BSA = root.BSA || {};
    root.BSA.dataHealth = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
