#!/usr/bin/env node
'use strict';

/**
 * 통계 탭 강도·탄산화 집계.
 * 현장 표기: "지상1층은 강도가 20.6~22.6 층별 평균 21.7 측정강도/설계강도 평균"
 */
const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'));

const BLDG = 'bldg-ndt-1';

function floorKey(code) {
    return BLDG + '_' + code;
}

function testUserExampleStrengthHeadline() {
    const samples = [
        { final: 20.6, ratio: 85.833, grade: 'c' },
        { final: 21.9, ratio: 91.25, grade: 'c' },
        { final: 22.6, ratio: 94.167, grade: 'c' }
    ];
    const summary = api.summarizeStrengthSamples(samples);
    assert.strictEqual(summary.count, 3);
    assert.strictEqual(summary.min, 20.6);
    assert.strictEqual(summary.max, 22.6);
    assert.strictEqual(Number(summary.avg.toFixed(1)), 21.7);
    const line = api.formatStrengthHeadline('지상 1층', summary, '층별 평균');
    assert.strictEqual(
        line,
        '지상 1층은 강도가 20.6~22.6 층별 평균 21.7 측정강도/설계강도 평균 90%',
        line
    );
}

function testSlotsCountSeparatelyAndSkipIncomplete() {
    const item = {
        category: '강도',
        strengthFinal: 20.6,
        strengthRatio: 80,
        strengthGrade: 'd',
        strengthSlots: [
            { finalStrength: 20.6, ratio: 80, grade: 'd' },
            { finalStrength: 22.6, ratio: 90, grade: 'c' },
            { location: '비어있는 슬롯', readings: [] }
        ]
    };
    const samples = api.collectStrengthSamples(item);
    assert.strictEqual(samples.length, 2, '값 있는 슬롯만 센다');
    const empty = api.collectStrengthSamples({
        category: '강도',
        strengthFinal: null,
        strengthSlots: [{ readings: [32, 33] }]
    });
    assert.strictEqual(empty.length, 0, 'strengthFinal 없는 항목은 건너뛴다');
}

function testLegacyItemWithoutSlots() {
    const samples = api.collectStrengthSamples({
        category: '강도',
        strengthFinal: 24.1,
        strengthRatio: 100,
        strengthGrade: 'a_or_b'
    });
    assert.strictEqual(samples.length, 1);
    assert.strictEqual(samples[0].grade, 'a_or_b');
    assert.strictEqual(api.formatGradeCounts({ a_or_b: 1 }), 'a/b 1');
}

function testFloorAndGroupPayload() {
    const ndtData = {};
    ndtData[floorKey('B1F')] = [
        { category: '강도', strengthFinal: 18.2, strengthRatio: 76, strengthGrade: 'd' }
    ];
    ndtData[floorKey('1F')] = [
        {
            category: '강도',
            strengthSlots: [
                { finalStrength: 20.6, ratio: 86, grade: 'c' },
                { finalStrength: 22.6, ratio: 94, grade: 'c' }
            ]
        }
    ];
    ndtData[floorKey('2F')] = [
        { category: '기울기', avgValue: 1.2 },
        { category: '강도', strengthFinal: null }
    ];
    ndtData[floorKey('PH')] = [
        { category: '강도', strengthFinal: 25.0, strengthRatio: 104, strengthGrade: 'a' }
    ];

    const payload = api.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        floorCodes: ['B1F', '1F', '2F', 'PH'],
        getFloorLabel: function (code) {
            return { B1F: '지하 1층', '1F': '지상 1층', '2F': '지상 2층', PH: '옥탑' }[code] || code;
        }
    });

    assert.strictEqual(payload.floorRows.length, 3, '값 없는 2F는 빼야 한다');
    const ground = payload.groupRows.find((g) => g.key === 'ground_all');
    const basement = payload.groupRows.find((g) => g.key === 'basement_all');
    const roof = payload.groupRows.find((g) => g.key === 'roof_all');
    assert.ok(ground && basement && roof, '층묶음이 빠졌다');
    assert.strictEqual(ground.strength.count, 2);
    assert.strictEqual(api.formatRange(ground.strength.min, ground.strength.max, 1), '20.6~22.6');
    assert.strictEqual(api.formatFixed(ground.strength.avg, 1), '21.6');
    assert.strictEqual(basement.strength.count, 1);
    assert.strictEqual(payload.overall.strength.count, 4);
    const groupLine = api.formatStrengthHeadline('지상층', ground.strength, '평균');
    assert.ok(groupLine.indexOf('지상층은 강도가 20.6~22.6') === 0, groupLine);
    assert.ok(groupLine.indexOf('평균 21.6') >= 0, groupLine);
}

/** 층묶음 평균은 층별 평균을 또 평균하지 않고, 측정값 전체(지상1층 4개 + 지상5층 4개 = 8개)로 낸다.
 * 층 코드가 "1F"와 "지상5층"처럼 섞여 있어도 같은 지상층으로 묶여야 8개가 된다. */
function testGroupPoolsAllMeasurements() {
    const ndtData = {};
    ndtData[floorKey('1F')] = [20.1, 20.3, 20.5, 20.7].map((v) => ({
        category: '강도', strengthFinal: v, strengthRatio: v * 4, strengthGrade: 'c'
    }));
    ndtData[floorKey('지상5층')] = [30.1, 30.3, 30.5, 30.7].map((v) => ({
        category: '강도', strengthFinal: v, strengthRatio: v * 4, strengthGrade: 'a'
    }));

    const payload = api.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        getFloorLabel: (code) => ({ '1F': '지상 1층', 지상5층: '지상 5층' }[code] || code)
    });

    const ground = payload.groupRows.find((g) => g.key === 'ground_all');
    assert.ok(ground, '"지상5층" 같은 한글 층 코드가 지상층 묶음에서 빠졌다');
    assert.strictEqual(ground.strength.count, 8, '층묶음 건수가 8개가 아니다');
    assert.strictEqual(api.formatRange(ground.strength.min, ground.strength.max, 1), '20.1~30.7');
    assert.strictEqual(api.formatFixed(ground.strength.avg, 1), '25.4', '8개 전체 평균이어야 한다');
    assert.deepStrictEqual(ground.strength.grades.c, 4);
    assert.deepStrictEqual(ground.strength.grades.a, 4);
    assert.strictEqual(payload.groupRows.length, 1, '지상층 하나로 묶여야 한다');
}

/** 건수가 다른 층을 묶을 때도 층별 평균의 평균이 되면 안 된다 */
function testGroupAverageIsNotAverageOfFloorAverages() {
    const ndtData = {};
    ndtData[floorKey('1F')] = [10, 10, 10].map((v) => ({ category: '강도', strengthFinal: v }));
    ndtData[floorKey('2F')] = [30].map((v) => ({ category: '강도', strengthFinal: v }));

    const payload = api.buildNdtStatsPayload(ndtData, { buildingId: BLDG });
    const ground = payload.groupRows.find((g) => g.key === 'ground_all');
    assert.strictEqual(ground.strength.count, 4);
    // 측정값 전체 평균 = (10+10+10+30)/4 = 15. 층별 평균의 평균이면 (10+30)/2 = 20.
    assert.strictEqual(api.formatFixed(ground.strength.avg, 1), '15.0');
    assert.strictEqual(api.formatFixed(payload.overall.strength.avg, 1), '15.0');
}

/** 탄산화도 같은 규칙 */
function testCarbGroupPoolsAllMeasurements() {
    const ndtData = {};
    ndtData[floorKey('1F')] = [10, 12, 14, 16].map((v) => ({
        category: '탄산화', carbDepth: v, carbCover: 40, carbRemainMm: 40 - v
    }));
    ndtData[floorKey('지상 5층')] = [20, 22].map((v) => ({
        category: '탄산화', carbDepth: v, carbCover: 40, carbRemainMm: 40 - v
    }));
    const payload = api.buildNdtStatsPayload(ndtData, { buildingId: BLDG });
    const ground = payload.groupRows.find((g) => g.key === 'ground_all');
    assert.strictEqual(ground.carbonation.count, 6, '한글 층 코드까지 6개로 묶여야 한다');
    // (10+12+14+16+20+22)/6 = 15.667 — 층별 평균의 평균이면 (13+21)/2 = 17
    assert.strictEqual(api.formatFixed(ground.carbonation.depthAvg, 1), '15.7');
}

function testCarbonationHeadlineAndRisk() {
    const samples = [
        { depth: 12.4, remainMm: 27.6, remainingLifeYears: 32 },
        { depth: 18.2, remainMm: 21.8, remainingLifeYears: 28 },
        { depth: 14.7, remainMm: 25.3, remainingLifeYears: 36 }
    ];
    const summary = api.summarizeCarbSamples(samples);
    assert.strictEqual(Number(summary.depthAvg.toFixed(1)), 15.1);
    const line = api.formatCarbHeadline('지상 1층', summary, '층별 평균');
    assert.strictEqual(
        line,
        '지상 1층은 탄산화깊이 12.4~18.2 층별 평균 15.1 잔여피복 평균 24.90 잔존수명 평균 32년',
        line
    );

    const ndtData = {};
    ndtData[floorKey('1F')] = [
        { category: '탄산화', carbDepth: 12.4, carbCover: 40, carbRemainMm: 27.6, carbRemainingLifeYears: 32 },
        { category: '탄산화', carbDepth: null, carbCover: 40 }
    ];
    ndtData[floorKey('B1F')] = [
        { category: '탄산화', carbDepth: 42, carbCover: 40, carbRemainMm: -2, carbRemainingLifeYears: -8 }
    ];
    ndtData[floorKey('EXT')] = [
        { category: '탄산화', carbDepth: 8, carbCover: 16 }
    ];
    const payload = api.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        getFloorLabel: function (code) {
            return { '1F': '지상 1층', B1F: '지하 1층', EXT: '외부' }[code] || code;
        }
    });
    const oneF = payload.floorRows.find((r) => r.floorCode === '1F');
    assert.strictEqual(oneF.carbonation.count, 1, '깊이 없는 탄산화는 건너뛴다');
    const ext = payload.floorRows.find((r) => r.floorCode === 'EXT');
    assert.strictEqual(Number(ext.carbonation.remainAvg.toFixed(2)), 8.00, '잔여피복은 피복-깊이로 채운다');
    const basement = payload.groupRows.find((g) => g.key === 'basement_all');
    assert.strictEqual(basement.carbonation.depleted, 1);
    assert.strictEqual(basement.carbonation.lifeOver, 1);
    assert.strictEqual(api.formatCarbCaution(basement.carbonation), '피복소진 1 · 수명초과 1');
}

function testOverallParticle() {
    const summary = api.summarizeStrengthSamples([{ final: 21.7, ratio: 90, grade: 'c' }]);
    assert.strictEqual(
        api.formatStrengthHeadline('전체', summary, '평균'),
        '전체는 강도가 21.7 평균 21.7 측정강도/설계강도 평균 90%'
    );
}

/** 대분류를 고르면 상태조사 표와 비파괴 표가 섞이지 않아야 한다 */
function testCategoryVisibility() {
    assert.deepStrictEqual(api.STATS_CATEGORIES.map((c) => c.key), ['defect', 'ndt']);
    assert.strictEqual(api.normalizeStatsCategory(undefined), 'defect');
    assert.strictEqual(api.normalizeStatsCategory('ndt'), 'ndt');
    assert.strictEqual(api.normalizeStatsCategory('없는값'), 'defect');

    const defect = api.getStatsSectionVisibility('defect');
    assert.deepStrictEqual(defect, {
        summaryCards: true,
        componentCrack: true,
        defectMatrix: true,
        defectFilters: true,
        ndtStrength: false,
        ndtCarb: false
    });

    const ndt = api.getStatsSectionVisibility('ndt');
    assert.deepStrictEqual(ndt, {
        summaryCards: false,
        componentCrack: false,
        defectMatrix: false,
        defectFilters: false,
        ndtStrength: true,
        ndtCarb: true
    });

    Object.keys(defect).forEach((key) => {
        assert.notStrictEqual(defect[key], ndt[key], key + '가 두 대분류에서 같이 보인다');
    });
}

function main() {
    testCategoryVisibility();
    testGroupPoolsAllMeasurements();
    testGroupAverageIsNotAverageOfFloorAverages();
    testCarbGroupPoolsAllMeasurements();
    testUserExampleStrengthHeadline();
    testSlotsCountSeparatelyAndSkipIncomplete();
    testLegacyItemWithoutSlots();
    testFloorAndGroupPayload();
    testCarbonationHeadlineAndRisk();
    testOverallParticle();
    console.log('OK test-ndt-stats.js');
}

main();
