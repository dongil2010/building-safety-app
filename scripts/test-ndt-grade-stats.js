#!/usr/bin/env node
'use strict';

/**
 * 통계 탭의 기울기·부동침하·부재처짐 등급 집계와 탄산화 피복두께(D) 표기.
 *
 * 2026-09-23 사용자 요청: "기울기나 부동침하는 각 a등급 몇개소, b등급 몇개소
 * 이런식으로", "탄산화는 0.75D~0.9D 이런식으로도 표기", "모든 등급이 나와야".
 *
 * 등급 계산식이 app.js와 통계에 두 벌로 갈라지면 화면마다 다른 등급이 나오고
 * 그걸 알아채기 어렵다. 그래서 js/core/ndt-grade.js 하나만 쓰는지도 같이 본다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const grade = require(path.join(__dirname, '..', 'js', 'core', 'ndt-grade.js'));
const stats = require(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'));

const BLDG = 'bldg-grade-1';
const fk = (code) => BLDG + '_' + code;

// --- 기울기 등급 경계 (세부지침 [표 6.33]) ---
(function tiltGradeBoundaries() {
    // 1/750 이상 a — 높이 7500mm에 변위 10mm면 정확히 1/750
    assert.strictEqual(grade.calcTiltGrade(7500, 10).grade, 'a등급');
    assert.strictEqual(grade.calcTiltGrade(7500, 10).tiltRatio, '1/750');
    assert.strictEqual(grade.calcTiltGrade(5000, 10).grade, 'b등급');
    assert.strictEqual(grade.calcTiltGrade(2500, 10).grade, 'c등급');
    assert.strictEqual(grade.calcTiltGrade(1500, 10).grade, 'd등급');
    assert.strictEqual(grade.calcTiltGrade(1000, 10).grade, 'e등급');
    // 잰 게 없으면 등급도 없다
    assert.strictEqual(grade.calcTiltGrade(0, 10).grade, '');
    assert.strictEqual(grade.calcTiltGrade(7500, 0).grade, '');
})();

// --- 부재처짐은 480/240/150 3단계 (기울기와 구간이 다르다) ---
(function memberDispBoundaries() {
    assert.strictEqual(grade.calcMemberDispGrade(4800, 10).grade, 'a등급');
    // 경미한 손상을 같이 봤으면 같은 처짐비라도 a가 아니라 b
    assert.strictEqual(grade.calcMemberDispGrade(4800, 10, true).grade, 'b등급');
    assert.strictEqual(grade.calcMemberDispGrade(2400, 10).grade, 'c등급');
    assert.strictEqual(grade.calcMemberDispGrade(1500, 10).grade, 'd등급');
    assert.strictEqual(grade.calcMemberDispGrade(1000, 10).grade, 'e등급');
    // 기울기에 있는 500 구간(b)이 처짐에는 없다
    assert.strictEqual(grade.calcMemberDispGrade(5000, 10).grade, 'a등급');
    assert.strictEqual(grade.calcTiltGrade(5000, 10).grade, 'b등급');
})();

// --- 구역 계산: level은 cm, 등급 계산은 mm ---
(function groupDisplacementUnits() {
    // 부동침하: 양 끝 레벨차 2cm = 20mm, 측정길이 10m = 10000mm → 1/500 → b
    const settle = grade.calcGroupDisplacement({
        category: '변위',
        measureLength: 10,
        points: [{ level: 2 }, { level: 0 }]
    });
    assert.strictEqual(settle.incomplete, false);
    assert.strictEqual(settle.tiltRatio, '1/500');
    assert.strictEqual(settle.grade, 'b등급');
    assert.strictEqual(settle.absDelta, 2, 'delta는 화면 표시용 cm 그대로여야 한다');

    // 레벨이 하나라도 비면 등급을 내지 않는다
    const partial = grade.calcGroupDisplacement({
        category: '변위', measureLength: 10, points: [{ level: 2 }, { level: '' }]
    });
    assert.strictEqual(partial.incomplete, true);

    // 측정길이가 없어도 마찬가지
    assert.strictEqual(grade.calcGroupDisplacement({
        category: '변위', points: [{ level: 1 }, { level: 0 }]
    }).incomplete, true);
})();

// --- 부재처짐 구역은 양끝 평균 - 중앙 ---
(function memberDispGroupUsesMidpoint() {
    const r = grade.calcGroupDisplacement({
        category: '부재변위',
        measureLength: 4.8,
        points: [{ level: 0 }, { level: -1 }, { level: 0 }]
    });
    // 양끝 평균 0 - 중앙 -1 = 1cm = 10mm, L=4800mm → 1/480 → a
    assert.strictEqual(r.tiltRatio, '1/480');
    assert.strictEqual(r.grade, 'a등급');
})();

// --- 등급 문자 정규화 ---
(function gradeLetters() {
    assert.strictEqual(grade.gradeLetter('a등급'), 'a');
    assert.strictEqual(grade.gradeLetter('C등급'), 'c');
    assert.strictEqual(grade.gradeLetter('e'), 'e');
    assert.strictEqual(grade.gradeLetter('a/b'), 'a_or_b');
    assert.strictEqual(grade.gradeLetter(''), '');
    assert.strictEqual(grade.gradeLetter('미입력'), '');
})();

// --- 등급별 개소: 나온 등급만 적는다 (2026-09-23 사용자 확정) ---
(function gradeSpotCountsSkipZero() {
    let s = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(s, 'a등급', '1/800');
    stats.addGradeSpot(s, 'a등급', '1/900');
    stats.addGradeSpot(s, 'c등급', '1/300');
    assert.strictEqual(stats.formatGradeSpotCounts(s), 'a등급 2개소 · c등급 1개소');
    assert.strictEqual(s.count, 3);

    // 순서는 a→b→c→d→e 그대로 (섞이면 보고서에서 읽기 나쁘다)
    let mixed = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(mixed, 'e등급', '1/100');
    stats.addGradeSpot(mixed, 'b등급', '1/600');
    assert.strictEqual(stats.formatGradeSpotCounts(mixed), 'b등급 1개소 · e등급 1개소');

    // 아무 등급도 없으면 '-'
    assert.strictEqual(stats.formatGradeSpotCounts(stats.emptyGradeSpotSummary()), '-');

    // 미산출만 있으면 그것만
    let pendingOnly = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(pendingOnly, '', '1/300');
    assert.strictEqual(stats.formatGradeSpotCounts(pendingOnly), '미산출 1개소');
})();

// --- 아직 안 잰 항목은 세지 않는다 (0개소와 "안 쟀다"는 다르다) ---
(function unmeasuredNotCounted() {
    const s = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(s, '', '');
    assert.strictEqual(s.count, 0);
    assert.strictEqual(s.pending, 0, '값이 아예 없으면 미산출로도 세지 않는다');

    // 비는 나왔는데 등급을 못 읽으면 미산출로 남긴다
    stats.addGradeSpot(s, '', '1/300');
    assert.strictEqual(s.pending, 1);
})();

// --- 기울기 범위는 나쁜 쪽(N이 작은 쪽)부터 ---
(function tiltRatioRange() {
    const s = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(s, 'a등급', '1/980');
    stats.addGradeSpot(s, 'c등급', '1/210');
    assert.strictEqual(stats.formatTiltRatioRange(s), '1/210~1/980');

    const one = stats.emptyGradeSpotSummary();
    stats.addGradeSpot(one, 'a등급', '1/800');
    assert.strictEqual(stats.formatTiltRatioRange(one), '1/800');
    assert.strictEqual(stats.formatTiltRatioRange(stats.emptyGradeSpotSummary()), '-');
})();

// --- 탄산화: 피복두께 D 대비 비율 표기 ---
(function carbonationCoverRatio() {
    const summary = stats.summarizeCarbSamples([
        { depth: 30, cover: 40, remainMm: 10 },
        { depth: 36, cover: 40, remainMm: 4 }
    ]);
    assert.strictEqual(summary.coverCount, 2);
    assert.strictEqual(summary.coverMin, 40);
    assert.strictEqual(summary.coverAvg, 40);
    // 30/40 = 0.75, 36/40 = 0.90 — 사용자가 예로 든 그 표기
    assert.strictEqual(stats.formatCoverRatioRange(summary), '0.75D~0.90D');

    const headline = stats.formatCarbHeadline('지상1층', summary, '층별 평균');
    assert.ok(headline.indexOf('0.75D~0.90D') >= 0, headline);
    assert.ok(headline.indexOf('피복두께') >= 0, '피복두께가 머리글에 없다: ' + headline);
})();

// --- 피복두께가 없으면 비율을 만들지 않는다 (0으로 나누지 않는다) ---
(function noCoverNoRatio() {
    const summary = stats.summarizeCarbSamples([
        { depth: 30, cover: null, remainMm: null },
        { depth: 20, cover: 0, remainMm: null }
    ]);
    assert.strictEqual(summary.count, 2);
    assert.strictEqual(summary.coverCount, 0);
    assert.strictEqual(summary.ratioCount, 0);
    assert.strictEqual(stats.formatCoverRatioRange(summary), '');
})();

// --- 층 집계: 항목(기울기)과 구역(부동침하·부재처짐)을 같이 모은다 ---
(function payloadCollectsItemsAndGroups() {
    const ndtData = {};
    ndtData[fk('1F')] = [
        { category: '기울기', grade: 'a등급', tiltRatio: '1/800' },
        { category: '기울기', grade: 'c등급', tiltRatio: '1/300' },
        { category: '부재변위', grade: 'd등급', tiltRatio: '1/200' }
    ];
    const displacementGroups = {};
    displacementGroups[fk('1F')] = [
        { category: '변위', measureLength: 10, points: [{ level: 2 }, { level: 0 }] },   // 1/500 b
        { category: '변위', measureLength: 10, points: [{ level: 5 }, { level: 0 }] },   // 1/200 d
        { category: '변위', measureLength: 10, points: [{ level: 1 }, { level: '' }] },  // 미산출
        { category: '부재변위', measureLength: 4.8, points: [{ level: 0 }, { level: -1 }, { level: 0 }] } // 1/480 a
    ];

    const payload = stats.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG,
        floorCodes: ['1F'],
        displacementGroups: displacementGroups,
        getFloorLabel: (c) => ({ '1F': '지상 1층' }[c] || c)
    });

    const row = payload.floorRows.find((r) => r.floorCode === '1F');
    assert.ok(row, '기울기·구역만 있는 층이 빠졌다');

    assert.strictEqual(row.tilt.count, 2);
    assert.deepStrictEqual(row.tilt.grades.a, 1);
    assert.deepStrictEqual(row.tilt.grades.c, 1);

    assert.strictEqual(row.settlement.count, 2, '부동침하 구역 2개가 안 잡혔다');
    assert.strictEqual(row.settlement.pending, 1, '레벨 미입력 구역은 미산출로 남아야 한다');
    assert.strictEqual(row.settlement.grades.b, 1);
    assert.strictEqual(row.settlement.grades.d, 1);

    // 부재처짐은 항목 1개 + 구역 1개
    assert.strictEqual(row.memberDisp.count, 2);
    assert.strictEqual(row.memberDisp.grades.d, 1);
    assert.strictEqual(row.memberDisp.grades.a, 1);

    // 전체 행에도 합산된다
    assert.strictEqual(payload.overall.settlement.count, 2);
    assert.strictEqual(payload.overall.tilt.count, 2);
})();

// --- 비파괴 페이지 행 고르기: 미산출만 있는 층도 남긴다 ---
(function combinedRowsKeepPendingOnly() {
    const ndtData = {};
    const displacementGroups = {};
    displacementGroups[fk('2F')] = [
        { category: '변위', measureLength: 10, points: [{ level: 1 }, { level: '' }] }
    ];
    const payload = stats.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG, floorCodes: ['2F'], displacementGroups: displacementGroups
    });
    const comb = stats.ndtCombinedRows(payload, 'settlement');
    assert.strictEqual(comb.floors.length, 1, '미산출만 있는 층이 사라지면 잰 적 없는 것과 구별이 안 된다');
    assert.strictEqual(comb.floors[0].settlement.pending, 1);
})();

// --- 내화피복 설계치는 자유 텍스트다. 거기서 두께만 뽑는다 ---
(function parseDesignThickness() {
    const p = grade.parseFireproofDesignThickness;
    assert.strictEqual(p('THK 25 에스코트 뿜칠'), 25);
    assert.strictEqual(p('THK25'), 25);
    assert.strictEqual(p('T=30 뿜칠'), 30);
    assert.strictEqual(p('25mm 뿜칠'), 25);
    assert.strictEqual(p('22.5mm'), 22.5);
    // 제품명에 숫자가 먼저 나와도 THK 뒤 값을 쓴다
    assert.strictEqual(p('SK-100 THK 25'), 25);
    assert.strictEqual(p('에스코트 뿜칠'), null, '숫자가 없으면 Cf를 만들 수 없다');
    assert.strictEqual(p(''), null);
    assert.strictEqual(p(null), null);
    assert.strictEqual(p('THK 0'), null, '0으로 나누면 안 된다');
})();

// --- Cf = 측정두께 ÷ 설계기준두께 × 100 ---
(function cfFormula() {
    assert.strictEqual(grade.fireproofCf(25, 25), 100);
    assert.strictEqual(grade.fireproofCf(20, 25), 80);
    assert.strictEqual(Number(grade.fireproofCf(17.125, 25).toFixed(1)), 68.5);
    assert.strictEqual(grade.fireproofCf(20, 0), null);
    assert.strictEqual(grade.fireproofCf(20, null), null);
})();

// --- 내화피복 통계에 Cf 범위가 들어간다 ---
(function fireproofCfSummary() {
    const s = stats.summarizeFireproofSamples([
        // 설계 25mm에 평균 17.125mm → Cf 68.5
        stats.collectFireproofSample({
            category: '내화피복', fireproofDesign: 'THK 25 에스코트 뿜칠',
            fpFlange: { readings: [17.125, 17.125, 17.125], unavailable: false },
            fpWeb: { readings: [17.125, 17.125, 17.125], unavailable: false }
        }),
        // 평균 22.875mm → Cf 91.5
        stats.collectFireproofSample({
            category: '내화피복', fireproofDesign: 'THK 25 에스코트 뿜칠',
            fpFlange: { readings: [22.875, 22.875, 22.875], unavailable: false },
            fpWeb: { readings: [22.875, 22.875, 22.875], unavailable: false }
        })
    ]);
    assert.strictEqual(s.count, 2);
    assert.strictEqual(s.cfCount, 2, 'Cf가 안 잡혔다');
    assert.strictEqual(stats.formatCfRange(s), 'Cf=68.5~91.5');

    // 설계치를 안 적은 부재는 두께만 세고 Cf에서는 빠진다
    const noDesign = stats.summarizeFireproofSamples([
        stats.collectFireproofSample({
            category: '내화피복', fireproofDesign: '',
            fpFlange: { readings: [20, 20, 20], unavailable: false },
            fpWeb: { readings: [20, 20, 20], unavailable: false }
        })
    ]);
    assert.strictEqual(noDesign.count, 1);
    assert.strictEqual(noDesign.cfCount, 0);
    assert.strictEqual(stats.formatCfRange(noDesign), '-');
})();

// --- 변위량: 항목은 mm, 구역은 cm → mm로 통일해서 섞는다 ---
(function deltaUnitsUnified() {
    const ndtData = {};
    ndtData[fk('1F')] = [
        // 항목의 avgValue는 mm 문자열
        { category: '기울기', grade: 'a등급', tiltRatio: '1/800', avgValue: '9.4' }
    ];
    const displacementGroups = {};
    displacementGroups[fk('1F')] = [
        // 구역 level은 cm — 2cm 차이 = 20mm
        { category: '변위', measureLength: 10, points: [{ level: 2 }, { level: 0 }] }
    ];
    const payload = stats.buildNdtStatsPayload(ndtData, {
        buildingId: BLDG, floorCodes: ['1F'], displacementGroups: displacementGroups
    });
    const row = payload.floorRows[0];
    assert.strictEqual(row.tilt.deltaMin, 9.4, '항목 변위량은 mm 그대로');
    assert.strictEqual(row.settlement.deltaMin, 20, '구역 변위량은 cm→mm 환산이어야 한다');
    assert.strictEqual(stats.formatDeltaRange(row.settlement), '20.00mm');
    assert.strictEqual(stats.formatDeltaRange(row.tilt), '9.40mm');
    assert.strictEqual(stats.formatDeltaRange(stats.emptyGradeSpotSummary()), '-');
})();

// --- 피복두께는 mm 단위로 범위 표기 ---
(function coverRangeWithUnit() {
    const summary = stats.summarizeCarbSamples([
        { depth: 10, cover: 15.11, remainMm: 5.11 },
        { depth: 12, cover: 34.54, remainMm: 22.54 }
    ]);
    assert.strictEqual(stats.formatMmRange(summary.coverMin, summary.coverMax, 2), '15.11mm~34.54mm');
    // 값이 하나뿐이면 범위로 적지 않는다
    assert.strictEqual(stats.formatMmRange(20, 20, 2), '20.00mm');
})();

// --- app.js가 등급식을 따로 갖고 있지 않은지 (두 벌이면 기준이 갈라진다) ---
(function appDelegatesToModule() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.match(app, /window\.BSA\.ndtGrade\.calcTiltGrade\(/);
    assert.match(app, /window\.BSA\.ndtGrade\.calcMemberDispGrade\(/);
    assert.match(app, /window\.BSA\.ndtGrade\.calcGroupDisplacement\(/);
    assert.doesNotMatch(app, /ratioInv >= 750/, 'app.js에 기울기 등급식이 아직 남아 있다');
    assert.doesNotMatch(app, /ratioInv >= 480/, 'app.js에 처짐 등급식이 아직 남아 있다');

    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const mine = html.indexOf('js/core/ndt-grade.js');
    assert.ok(mine > 0, 'index.html에 ndt-grade.js가 없다');
    assert.ok(mine < html.indexOf('src="app.js'), 'app.js보다 먼저 실려야 한다');
})();

console.log('test-ndt-grade-stats: ok');
