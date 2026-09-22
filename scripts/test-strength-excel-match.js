#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 반발경도 강도 계산을 회사 엑셀(정밀점검 평가 통합 — 강도입력·출력 시트)과 똑같이 맞춘 회귀 테스트.
 * 기대값은 사용자가 보여 준 엑셀 출력(광주겨자씨교회, 지하1층 NO.1~4, 재령 α=0.63) 그대로다.
 *  - 추정식 kgf/cm²→MPa 환산 ×0.1 (예전 ×0.098)
 *  - ±20% 제외: 평균×0.8 < R < 평균×1.2, 직접 입력한 0도 첫 평균에 포함
 *  - 각도보정: 반올림한 R 행(보간 없음), Ro = ROUND(,1), 최종 강도 = ROUND(평균×α, 1)
 *  - 재령: DAYS360
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

function extractArray(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    return app.slice(at, app.indexOf('];', at) + 2);
}

const ctx = { window: { state: { currentBuilding: null } }, Date };
vm.createContext(ctx);
vm.runInContext([
    extractArray('const CONCRETE_ANGLE_CORRECTION_TABLE = ['),
    'const CONCRETE_ANGLE_COLUMN_INDEX = ' + /const CONCRETE_ANGLE_COLUMN_INDEX = (\{[^}]*\});/.exec(app)[1] + ';',
    extractFunction('function getAngleCorrection('),
    extractArray('const CONCRETE_STRENGTH_FORMULAS = ['),
    extractFunction('function excelRound('),
    extractFunction('function fmtExcel('),
    extractFunction('function isStrengthOutlierValue('),
    extractFunction('function getStrengthGrade('),
    'const DEFAULT_STRENGTH_FORMULA_NAMES = ' + /const DEFAULT_STRENGTH_FORMULA_NAMES = (\[[^\]]*\]);/.exec(app)[1] + ';',
    extractFunction('function getEnabledStrengthFormulaNames('),
    extractFunction('function calcConcreteStrength('),
    extractArray('const AGE_CORRECTION_BREAKPOINTS = ['),
    extractFunction('function getAgeCorrectionFactor('),
    extractFunction('function parseYmdParts('),
    extractFunction('function excelDays360('),
    extractFunction('function getConcreteStrengthAgeDays('),
    extractFunction('function strengthSlotHasReadings('),
    extractFunction('function computeStrengthSlotResult('),
    extractFunction('function refreshStrengthItemResults('),
    'this.api = { fmtExcel, calcConcreteStrength, excelRound, excelDays360, getConcreteStrengthAgeDays, refreshStrengthItemResults, getAngleCorrection };'
].join('\n'), ctx);
const api = ctx.api;

const NAMES = ['일본재료학회식', '일본건축학회 제안식'];
const ALPHA_063_DAYS = 3000; // α=0.63 구간

// 엑셀 출력 캡처(지하1층) — R값 20개, 기대 평균경도·1식·2식·평균·강도
const EXCEL_ROWS = [
    { no: 'NO.1', r: [36, 41, 39, 48, 39, 32, 34, 39, 43, 39, 41, 34, 39, 37, 34, 38, 36, 42, 35, 0],
      R: 37.7, f1: 30.6, f2: 37.5, avg: 34.07, fc: 21.5, excluded: 2 },
    { no: 'NO.2', r: [37, 37, 37, 39, 33, 41, 34, 39, 37, 39, 42, 41, 45, 39, 42, 39, 40, 37, 35, 41],
      R: 38.7, f1: 31.9, f2: 38.3, avg: 35.08, fc: 22.1, excluded: 0 },
    { no: 'NO.3', r: [42, 35, 43, 36, 46, 35, 34, 40, 39, 37, 42, 35, 37, 36, 38, 38, 38, 34, 38, 35],
      R: 37.5, f1: 30.4, f2: 37.4, avg: 33.86, fc: 21.3, excluded: 1 },
    { no: 'NO.4', r: [33, 33, 40, 35, 36, 39, 32, 42, 38, 36, 32, 33, 37, 41, 38, 40, 41, 45, 31, 43],
      R: 36.8, f1: 29.4, f2: 36.9, avg: 33.15, fc: 20.9, excluded: 1 }
];

function testMatchesExcelPrintout() {
    EXCEL_ROWS.forEach((row) => {
        const c = api.calcConcreteStrength(row.r.map(String), 0, ALPHA_063_DAYS, NAMES);
        assert.ok(c, row.no + ' 계산 결과가 없다');
        assert.strictEqual(c.alpha, 0.63);
        assert.strictEqual(c.excludedCount, row.excluded, row.no + ' ±20% 제외 개수');
        assert.strictEqual(c.ro, row.R, row.no + ' Ro');
        const f1 = c.results.find(x => x.name === '일본재료학회식').value;
        const f2 = c.results.find(x => x.name === '일본건축학회 제안식').value;
        assert.strictEqual(api.excelRound(f1, 1), row.f1, row.no + ' 1식(일본재료학회식)');
        assert.strictEqual(api.excelRound(f2, 1), row.f2, row.no + ' 2식(일본건축학회 제안식)');
        assert.strictEqual(api.excelRound(c.formulaAvg, 2), row.avg, row.no + ' 평균');
        assert.strictEqual(c.finalStrength, row.fc, row.no + ' 최종 강도');
    });
}

function testExcelRoundHalfUp() {
    assert.strictEqual(api.excelRound(30.35, 1), 30.4, '엑셀은 30.35 → 30.4 (JS toFixed는 30.3)');
    assert.strictEqual(api.excelRound(37.65, 1), 37.7);
    assert.strictEqual(api.excelRound(21.45, 1), 21.5);
    assert.strictEqual(api.excelRound(-1.05, 1), -1.1);
    assert.strictEqual(api.excelRound(37.5, 0), 38);
    // 1.005×100 = 100.49999…, 2.675×100 = 267.49999… — 엑셀은 1.01, 2.68
    assert.strictEqual(api.excelRound(1.005, 2), 1.01, '부동소수 오차로 내려 반올림하면 안 된다');
    assert.strictEqual(api.excelRound(2.675, 2), 2.68);
    assert.strictEqual(api.fmtExcel(30.35, 1), '30.4', '화면에도 엑셀처럼 30.4');
    assert.strictEqual(api.fmtExcel(34.0655, 2), '34.07');
    assert.strictEqual(api.fmtExcel(NaN, 1), '-');
    assert.ok(!app.includes('r.value.toFixed(1)'), '추정식 결과 표시는 fmtExcel로');
    assert.ok(!app.includes('calc.formulaAvg.toFixed('), '추정식 평균 표시는 fmtExcel로');
}

function testOutlierBoundaryExcluded() {
    // 평균 정확히 40 → 경계 32·48과 같은 값은 엑셀처럼 제외
    const r = [40, 40, 40, 40, 40, 40, 40, 32, 48, 40];
    const c = api.calcConcreteStrength(r, 0, null, NAMES);
    assert.strictEqual(c.excludedCount, 2, '경계값(평균×0.8, ×1.2)과 같으면 제외');
    assert.strictEqual(c.finalAvg, 40);
    // 빈칸은 평균에 안 들어가고, 직접 입력한 0은 들어간다
    const withBlank = api.calcConcreteStrength(['40', '', '40', '40'], 0, null, NAMES);
    assert.strictEqual(withBlank.totalCount, 3);
    assert.strictEqual(api.calcConcreteStrength(['0', '0'], 0, null, NAMES), null, '전부 0이면 결과 없음');
}

function testAngleUsesRoundedRow() {
    // R 37.4 → 37행, 37.5 → 38행 (보간 없음). +90°: 37행 -4.14, 38행 -4.06
    assert.strictEqual(api.getAngleCorrection(37.4, 90), -4.14);
    assert.strictEqual(api.getAngleCorrection(37.5, 90), -4.06);
    assert.strictEqual(api.getAngleCorrection(5, -90), 3.20, '표 아래쪽은 첫 행');
    assert.strictEqual(api.getAngleCorrection(95, -90), 0.70, '표 위쪽은 마지막 행');
    assert.strictEqual(api.getAngleCorrection(40, 0), 0);
}

function testDays360() {
    const d = (y, m, dd) => ({ y, m, d: dd });
    // 엑셀 DAYS360 기준값
    assert.strictEqual(api.excelDays360(d(2026, 1, 1), d(2026, 12, 31)), 360);
    assert.strictEqual(api.excelDays360(d(2026, 1, 30), d(2026, 2, 1)), 1);
    assert.strictEqual(api.excelDays360(d(2026, 1, 31), d(2026, 3, 31)), 60);
    assert.strictEqual(api.excelDays360(d(2026, 2, 28), d(2026, 3, 31)), 30, '2월 말일 시작은 30일로 본다');
    assert.strictEqual(api.excelDays360(d(2026, 1, 15), d(2026, 3, 31)), 76, '끝이 31일이고 시작이 30일 전이면 다음달 1일');
    assert.strictEqual(api.excelDays360(d(2000, 6, 15), d(2026, 9, 22)), 9457);
    assert.strictEqual(api.getConcreteStrengthAgeDays({ completionDate: '2026-01-31', date: '2026-03-31' }), 60);
    assert.strictEqual(api.getConcreteStrengthAgeDays({ completionDate: '2026-05-01', date: '2026-04-01' }), null, '준공일이 점검일보다 뒤면 없음');
    assert.strictEqual(api.getConcreteStrengthAgeDays({ date: '2026-04-01' }), null);
}

function testRefreshRecomputesStoredItems() {
    // 옛 계산식(×0.098)으로 저장된 항목 → 목록·통계·출력은 지금 식으로 다시 계산한 값을 쓴다
    const bldg = { id: 'b1', completionDate: '2000-01-01', date: '2026-09-22' };
    const stored = {
        id: 'n1', category: '강도', strengthAngle: null, designStrength: 24, damageStatus: '',
        strengthSlots: [
            { location: 'A', readings: EXCEL_ROWS[1].r.map(String), finalStrength: 21.6, ratio: 90, grade: 'c' },
            { location: 'B', readings: [], finalStrength: 18.0, ratio: 75, grade: 'd' }
        ],
        strengthFinal: 21.6, strengthRatio: 90, strengthGrade: 'c'
    };
    const fresh = api.refreshStrengthItemResults(stored, bldg);
    assert.notStrictEqual(fresh, stored, '원본을 바꾸지 않고 사본을 돌려준다');
    assert.strictEqual(stored.strengthSlots[0].finalStrength, 21.6, '저장 데이터는 그대로');
    assert.strictEqual(fresh.strengthSlots[0].finalStrength, 22.1, '엑셀과 같은 22.1');
    assert.strictEqual(fresh.strengthFinal, 22.1);
    assert.strictEqual(Math.round(fresh.strengthRatio), 92);
    assert.strictEqual(fresh.strengthGrade, 'c');
    assert.strictEqual(fresh.strengthSlots[1].finalStrength, 18.0, 'R값 없는 슬롯은 저장값 유지');
    assert.strictEqual(fresh.strengthSlots[0].location, 'A');

    const legacy = { id: 'n2', category: '강도', strengthReadings: EXCEL_ROWS[3].r.map(String), strengthFinal: 20.4 };
    assert.strictEqual(api.refreshStrengthItemResults(legacy, bldg).strengthFinal, 20.9, '슬롯 없는 옛 형식도 다시 계산');
    const other = { id: 'n3', category: '탄산화', carbDepth: 10 };
    assert.strictEqual(api.refreshStrengthItemResults(other, bldg), other, '강도 아닌 항목은 그대로');
}

function testCallSites() {
    assert.ok(/const item = refreshStrengthItemResults\(rawItem\);/.test(app), '비파괴 목록은 다시 계산한 값');
    assert.strictEqual((app.match(/\.map\(item => refreshStrengthItemResults\(item, bldg\)\)/g) || []).length, 2, '한글 출력 2곳');
    assert.strictEqual((app.match(/getConcreteStrengthAgeDays\(bldg\)/g) || []).length >= 2, true, '한글 출력은 그 건물의 360일 재령');
    assert.ok(/strengthAgeDays = \(cat === '강도'\) \? getConcreteStrengthAgeDays\(\)/.test(app), '저장도 360일 재령');
    assert.ok(/carbAgeDays = \(cat === '탄산화'\) \? getConcreteAgeInDays\(\)/.test(app), '탄산화는 실제 날짜 그대로');
    const stats = fs.readFileSync(path.join(root, 'js', 'tabs', 'stats.js'), 'utf8');
    assert.ok(/refreshStrength\(item, statsBldg\)/.test(stats), '통계도 다시 계산한 값');
}

[
    testMatchesExcelPrintout,
    testExcelRoundHalfUp,
    testOutlierBoundaryExcluded,
    testAngleUsesRoundedRow,
    testDays360,
    testRefreshRecomputesStoredItems,
    testCallSites
].forEach((t) => {
    t();
    console.log('ok -', t.name);
});
console.log('test-strength-excel-match: ok');
