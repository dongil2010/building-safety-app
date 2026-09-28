#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 통계 탭에 부재실측 — s = (측정 단면적 ÷ 설계 단면적) × 100 의 범위·평균과 a~e 등급별 개소.
 * 등급 기준([표 6.24])은 js/core/ndt-grade.js sectionRatioGrade 하나(입력창과 통계가 같은 식).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const grade = require(path.join(root, 'js', 'core', 'ndt-grade.js'));
const stats = require(path.join(root, 'js', 'tabs', 'stats.js'));

// --- 등급 경계: a 100≤s, b 95≤s<100, c 90≤s<95, d 75≤s<90, e s<75 ---
[[100, 'a'], [120, 'a'], [99.9, 'b'], [95, 'b'], [94.99, 'c'], [90, 'c'], [89.9, 'd'], [75, 'd'], [74.9, 'e'], [0, 'e']]
    .forEach(([r, code]) => assert.strictEqual(grade.sectionRatioGrade(r).code, code, 's=' + r));
assert.strictEqual(grade.sectionRatioGrade(null), null);
assert.strictEqual(grade.sectionRatioGrade(''), null);

// --- 층별·전체 집계 ---
const B = 'b1';
const ndtData = {
    [B + '_B1']: [
        { category: '실측', sectionRatio: 101.3, sectionGrade: 'a' },
        { category: '실측', sectionRatio: 96.0, sectionGrade: 'b' },
        { category: '실측', designWidth: 400, designDepth: 700 },          // 실측치 없음 → 미산출
        { category: '실측' },                                              // 아무것도 안 적음 → 안 센다
        { category: '강도', strengthFinal: 24 }
    ],
    [B + '_1F']: [
        { category: '실측', sectionRatio: 92.1, sectionGrade: 'a' },       // 저장된 등급이 틀려도 s로 다시 매긴다
        { category: '실측', sectionRatio: 70, sectionGrade: 'e' }
    ],
    [B + '_2F']: [{ category: '탄산화', carbDepth: 5 }]
};
const payload = stats.buildNdtStatsPayload(ndtData, {
    buildingId: B,
    floorCodes: ['B1', '1F', '2F'],
    getFloorLabel: (c) => c,
    displacementGroups: {}
});
const b1 = payload.floorRows.find((r) => r.floorCode === 'B1').measure;
assert.strictEqual(b1.count, 2);
assert.strictEqual(b1.pending, 1, '설계치만 적은 부재는 미산출');
assert.deepStrictEqual([b1.grades.a, b1.grades.b], [1, 1]);
const f1 = payload.floorRows.find((r) => r.floorCode === '1F').measure;
assert.strictEqual(f1.grades.c, 1, '저장값 a가 아니라 s=92.1 → c');
assert.strictEqual(f1.grades.e, 1);
assert.strictEqual(payload.floorRows.find((r) => r.floorCode === '2F').measure.count, 0);

const all = payload.overall.measure;
assert.strictEqual(all.count, 4);
assert.strictEqual(all.pending, 1);
assert.strictEqual(stats.formatSectionRatioRange(all), 's=70.0~101.3%');
assert.strictEqual(all.ratioAvg.toFixed(2), ((101.3 + 96 + 92.1 + 70) / 4).toFixed(2));
assert.strictEqual(stats.formatMeasureHeadline('전체', all),
    '전체는 부재실측 4개소 s=70.0~101.3% 평균 ' + all.ratioAvg.toFixed(1) + '% a등급 1개소 · b등급 1개소 · c등급 1개소 · e등급 1개소 · 미산출 1개소',
    '나온 등급만, 미산출은 따로');

// 부재실측만 있는 층도 통계에 남는다
const only = stats.buildNdtStatsPayload({ [B + '_3F']: [{ category: '실측', sectionRatio: 100 }] }, {
    buildingId: B, floorCodes: ['3F'], getFloorLabel: (c) => c, displacementGroups: {}
});
assert.strictEqual(only.floorRows.length, 1);
assert.strictEqual(stats.ndtCombinedRows(only, 'measure').floors.length, 1);
assert.strictEqual(stats.getStatsSectionVisibility('ndt').ndtMeasure, true);
assert.strictEqual(stats.getStatsSectionVisibility('defect').ndtMeasure, false);

// app.js 입력창 등급도 같은 식을 부른다(두 벌로 갈라지지 않게)
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(/function gradeFromSectionRatio\(ratio\) \{\s*(\/\/[^\n]*\n\s*)?return window\.BSA\.ndtGrade\.sectionRatioGrade\(ratio\)/.test(app));

console.log('test-stats-ndt-measure: ok');
