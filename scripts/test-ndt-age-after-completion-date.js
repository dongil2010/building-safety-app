'use strict';
// 2026-10-19 「강도 적용할때 준공일 데이터를 나중에 입력하면 재령일 적용이 안되는 버그」 회귀 테스트
// 저장값은 입력할 때의 재령으로 굳어 있다(준공일 없으면 α 없음). 보여 줄 때·내보낼 때(목록·통계·한글·평가 탭·
// SafetyMan 엑셀) 지금 준공일로 다시 계산해야 한다. 저장 데이터는 바꾸지 않는다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'missing ' + name);
    let j = src.indexOf(') {', i) + 2, d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}
function constBlock(name) {
    const i = src.indexOf('const ' + name + ' = [');
    assert.ok(i >= 0, 'missing ' + name);
    return src.slice(i, src.indexOf('];', i) + 2);
}

const H = new Function(`
const window = { state: { currentBuilding: null } };
const STRENGTH_ANVIL_STANDARD = 82;
const CONCRETE_STRENGTH_FORMULAS = [{ name: 'F1', calc: (ro) => ro }];
function excelRound(v, n) { const p = Math.pow(10, n); return Math.round(v * p) / p; }
function isStrengthOutlierValue() { return false; }
function getAngleCorrection() { return 0; }
function getEnabledStrengthFormulaNames() { return ['F1']; }
function getStrengthAnvilAvg() { return null; }
function getStrengthGrade(r) { return { code: r >= 100 ? 'a' : 'c' }; }
${constBlock('AGE_CORRECTION_BREAKPOINTS')}
${fn('getAgeCorrectionFactor')}
${fn('parseYmdParts')}
${fn('excelDays360')}
${fn('getConcreteStrengthAgeDays')}
${fn('strengthAgeApi')}
${fn('resolveStrengthAgeInfo')}
${fn('getConcreteAgeInDays')}
${fn('calcConcreteStrength')}
${fn('strengthSlotHasReadings')}
${fn('computeStrengthSlotResult')}
${fn('refreshStrengthItemResults')}
${fn('calcCarbonation')}
${fn('refreshCarbItemResults')}
return { window, refreshStrengthItemResults, refreshCarbItemResults, calcConcreteStrength };
`)();

// 준공일 없이 입력 → α 없음(=1)으로 저장된 강도 항목
const saved = H.calcConcreteStrength(['40', '40', '40'], 0, null, ['F1'], null);
assert.strictEqual(saved.alpha, null);
const item = {
    id: 's1', category: '강도', designStrength: 24, strengthAngle: 0,
    strengthSlots: [{ location: 'A', readings: ['40', '40', '40'], ageDays: null, alpha: null, finalStrength: saved.finalStrength }],
    strengthAgeDays: null, strengthAlpha: null, strengthFinal: saved.finalStrength
};
const frozen = JSON.stringify(item);
// 나중에 준공일 입력(점검일 2026-10-19) → 재령·α·최종 강도 다시 계산
const bldg = { id: 'b', completionDate: '2000-01-01', date: '2026-10-19' };
const fresh = H.refreshStrengthItemResults(item, bldg);
assert.ok(fresh.strengthAgeDays > 3000, '재령일 반영');
assert.strictEqual(fresh.strengthAlpha, 0.63, '오래된 건물 α=0.63');
assert.strictEqual(fresh.strengthFinal, Math.round(40 * 0.63 * 10) / 10, '최종 강도 = 평균 × α');
assert.strictEqual(fresh.strengthSlots[0].alpha, 0.63, '슬롯도 다시 계산');
assert.strictEqual(JSON.stringify(item), frozen, '저장 데이터는 안 바뀜');
// 준공일을 고치면 또 바뀐다
const fresh2 = H.refreshStrengthItemResults(item, { id: 'b', completionDate: '2026-09-01', date: '2026-10-19' });
assert.strictEqual(fresh2.strengthAgeDays, 48);
assert.strictEqual(fresh2.strengthAlpha, 0.89);
// 건물을 안 넘기면 지금 건물(currentBuilding) 기준
H.window.state.currentBuilding = bldg;
assert.strictEqual(H.refreshStrengthItemResults(item).strengthAlpha, 0.63);
H.window.state.currentBuilding = null;

// 탄산화: 준공일 없이 저장 → 수명 없음, 나중에 준공일 넣으면 다시 계산
const carb = { id: 'c1', category: '탄산화', carbDepth: 10, carbCover: 30, carbAgeDays: null, carbLifeYears: null, carbRemainingLifeYears: null };
const carbFresh = H.refreshCarbItemResults(carb, bldg);
assert.ok(carbFresh.carbAgeDays > 9000);
assert.ok(carbFresh.carbLifeYears > 0 && Number.isFinite(carbFresh.carbRemainingLifeYears));
assert.strictEqual(carb.carbLifeYears, null, '저장값 안 바뀜');
assert.strictEqual(H.refreshCarbItemResults(carb, { id: 'x' }).carbLifeYears, null, '준공일 없으면 수명 없음');
assert.strictEqual(H.refreshCarbItemResults({ category: '탄산화' }, bldg).carbDepth, undefined, '깊이 없으면 그대로');
// 목록 map의 (item, idx) 인자로 건물이 숫자로 들어와도 지금 건물 기준
H.window.state.currentBuilding = bldg;
assert.ok(H.refreshCarbItemResults(carb, 3).carbLifeYears > 0);

// 출력 경로가 다시 계산한 값을 쓰는지
assert.ok(/currentCat === '탄산화'\) \{[\s\S]{0,200}items\.map\(\(rawCarb\) => refreshCarbItemResults\(rawCarb\)\)/.test(src), '탄산화 목록');
assert.strictEqual((src.match(/filter\(item => item\.category === '탄산화'\)\n\s*\.map\(item => refreshCarbItemResults\(item, bldg\)\)/g) || []).length, 2, '한글 출력 2곳');
assert.strictEqual((src.match(/filter\(item => item\.category === '강도'\)\n\s*\.map\(item => refreshStrengthItemResults\(item, bldg\)\)/g) || []).length, 2, '강도 한글 출력 2곳(기존)');

// 평가 탭·SafetyMan 엑셀(safetyman-export.js)도 다시 계산한 강도
global.window = { refreshStrengthItemResults: H.refreshStrengthItemResults };
const smPath = path.join(root, 'js', 'core', 'safetyman-export.js');
delete require.cache[smPath];
const SM = require(smPath);
assert.strictEqual(SM.strengthFinalOf(item, bldg), fresh.strengthFinal, '평가 탭 강도 = 다시 계산한 값');
assert.strictEqual(SM.strengthFinalOf({ category: '강도', strengthFinal: 21.5 }, bldg), 21.5, 'R값 없는 옛 항목은 저장값');
const smSrc = fs.readFileSync(smPath, 'utf8');
assert.ok(!/parseFloat\(it\.strengthFinal\)|num\(it\.strengthFinal\)/.test(smSrc), '저장값 직접 사용 없음');
assert.ok(smSrc.includes('sampleBlock(st, s, o.memberName, i + 1, o.bldg)'));
delete global.window;

// 건물 수정 저장 뒤 열린 입력창 다시 계산
assert.ok(src.includes("if (typeof recalcAllStrengthSlots === 'function') recalcAllStrengthSlots();"));

console.log('test-ndt-age-after-completion-date: ok');
