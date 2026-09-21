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

function main() {
    testUserExampleStrengthHeadline();
    testSlotsCountSeparatelyAndSkipIncomplete();
    testLegacyItemWithoutSlots();
    testFloorAndGroupPayload();
    testCarbonationHeadlineAndRisk();
    testOverallParticle();
    console.log('OK test-ndt-stats.js');
}

main();
