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
    // 나온 등급만 적는다 — d·e가 0개소면 자리만 차지한다(2026-09-23 사용자 확정)
    assert.strictEqual(api.formatGradeCounts({ a_or_b: 1 }), 'a/b 1');
    assert.strictEqual(api.formatGradeCounts({ a: 2, c: 1 }), 'a 2 · c 1');
    assert.strictEqual(api.formatGradeCounts({ a: 2 }, '개소'), 'a 2개소');
    assert.strictEqual(api.formatGradeCounts({}), '-');
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
        '지상 1층은 탄산화깊이 12.4~18.2 층별 평균 15.1 잔여피복 21.80~27.60 평균 24.90 잔존수명 28~36년 평균 32년',
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
        viewChips: true,
        ndtStrength: false,
        ndtCarb: false,
        ndtFireproof: false,
        ndtTilt: false,
        ndtSettlement: false,
        ndtMemberDisp: false
    });

    const ndt = api.getStatsSectionVisibility('ndt');
    assert.deepStrictEqual(ndt, {
        summaryCards: false,
        componentCrack: false,
        defectMatrix: false,
        defectFilters: false,
        viewChips: false,
        ndtStrength: true,
        ndtCarb: true,
        ndtFireproof: true,
        ndtTilt: true,
        ndtSettlement: true,
        ndtMemberDisp: true
    });

    Object.keys(defect).forEach((key) => {
        assert.notStrictEqual(defect[key], ndt[key], key + '가 두 대분류에서 같이 보인다');
    });
}

/** 비파괴 한 페이지는 층 행 + 전체 행이고 층묶음 행은 없다 */
function testNdtPageCombinesFloorAndOverall() {
    const ndtData = {};
    ndtData[floorKey('1F')] = [20.1, 20.3, 20.5, 20.7].map((v) => ({
        category: '강도', strengthFinal: v
    }));
    ndtData[floorKey('지상5층')] = [30.1, 30.3, 30.5, 30.7].map((v) => ({
        category: '강도', strengthFinal: v
    }));
    const payload = api.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        getFloorLabel: (code) => ({ '1F': '지상 1층', 지상5층: '지상 5층' }[code] || code)
    });
    const comb = api.ndtCombinedRows(payload, 'strength');
    assert.strictEqual(comb.floors.length, 2);
    assert.ok(comb.floors.every((r) => r.floorCode !== 'overall' && r.key !== 'ground_all'));
    assert.strictEqual(comb.overall.strength.count, 8);
    assert.strictEqual(api.formatFixed(comb.overall.strength.avg, 1), '25.4');
    assert.ok(!comb.floors.some((r) => r.key === 'ground_all'), '층묶음 행이 한 페이지에 들어가면 안 된다');
}

/** 플렌지 3 + 웨브 3 = 한 부재 6개소 평균. 부위별 평균을 또 평균하면 안 된다 */
function testFireproofSixPointMemberAvg() {
    const item = {
        category: '내화피복',
        fpFlange: { readings: [20, 21, 22], avg: 21, unavailable: false },
        fpWeb: { readings: [24, 25, 26], avg: 25, unavailable: false }
    };
    assert.strictEqual(api.fireproofMemberAvg(item), 23);
    const samples = api.collectFireproofReadings(item);
    assert.strictEqual(samples.length, 6);

    const uneven = {
        category: '내화피복',
        fpFlange: { readings: [10, 10, 10], avg: 10 },
        fpWeb: { readings: [30], avg: 30 }
    };
    // 4개소 전체 평균 15. 부위 평균의 평균이면 (10+30)/2 = 20.
    assert.strictEqual(api.fireproofMemberAvg(uneven), 15);
}

function testFireproofSkipUnavailablePart() {
    const item = {
        category: '내화피복',
        fpFlange: { readings: [20, 21, 22], avg: 21, unavailable: true },
        fpWeb: { readings: [24, 25, 26], avg: 25, unavailable: false }
    };
    assert.strictEqual(api.fireproofMemberAvg(item), 25);
    assert.deepStrictEqual(api.collectFireproofReadings(item), [24, 25, 26]);
}

function testFireproofStatsOnCombinedPage() {
    const ndtData = {};
    ndtData[floorKey('1F')] = [{
        category: '내화피복',
        fpFlange: { readings: [20, 21, 22] },
        fpWeb: { readings: [24, 25, 26] }
    }];
    ndtData[floorKey('지상5층')] = [{
        category: '내화피복',
        fpFlange: { readings: [30, 30, 30] },
        fpWeb: { readings: [30, 30, 30] }
    }];
    const payload = api.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        getFloorLabel: (code) => ({ '1F': '지상 1층', 지상5층: '지상 5층' }[code] || code)
    });
    const oneF = payload.floorRows.find((r) => r.floorCode === '1F');
    assert.ok(oneF, '내화피복만 있는 층이 빠졌다');
    assert.strictEqual(oneF.fireproof.count, 1);
    assert.strictEqual(oneF.fireproof.readingCount, 6);
    assert.strictEqual(api.formatFixed(oneF.fireproof.avg, 2), '23.00');
    assert.strictEqual(payload.overall.fireproof.count, 2);
    assert.strictEqual(api.formatFixed(payload.overall.fireproof.avg, 2), '26.50');
    const comb = api.ndtCombinedRows(payload, 'fireproof');
    assert.strictEqual(comb.floors.length, 2);
    assert.strictEqual(comb.overall.fireproof.count, 2);
    const line = api.formatFireproofHeadline('전체', payload.overall.fireproof, '평균');
    assert.strictEqual(line, '전체는 내화피복두께 23.00~30.00 평균 26.50', line);
}

function testCarbRemainAndLifeShowRangeAndAvg() {
    assert.strictEqual(api.formatRangeWithAvg(5, 10, 7.5, 1), '5.0~10.0 평균 7.5');
    assert.strictEqual(api.formatRangeWithAvg(5, 5, 5, 0), '5');
    assert.strictEqual(api.formatRangeWithAvg(28, 36, 32, 0, '년'), '28~36년 평균 32년');
}

function main() {
    testCategoryVisibility();
    testNdtPageCombinesFloorAndOverall();
    testGroupPoolsAllMeasurements();
    testGroupAverageIsNotAverageOfFloorAverages();
    testCarbGroupPoolsAllMeasurements();
    testUserExampleStrengthHeadline();
    testSlotsCountSeparatelyAndSkipIncomplete();
    testLegacyItemWithoutSlots();
    testFloorAndGroupPayload();
    testCarbonationHeadlineAndRisk();
    testOverallParticle();
    testFireproofSixPointMemberAvg();
    testFireproofSkipUnavailablePart();
    testFireproofStatsOnCombinedPage();
    testCarbRemainAndLifeShowRangeAndAvg();
    console.log('OK test-ndt-stats.js');
}

main();
