'use strict';
// 2026-10-28 규모 「Cw:0.1~0.6/1.5*2.0」 = 폭 0.1~0.6 + 망상균열 범위 1.5×2.0 (가로×세로).
// 예전엔 ~ 범위를 몰라 앞 숫자 0.1만 남기고 나머지를 버렸다(Cw:0.1). 앱의 기존 망상균열 표기(폭 행 + 면적 행 'x')에 맞춘다.
// 풀지 못한 규모는 일부만 저장하지 않고 원문을 규모 칸에 그대로 둔다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');
const lint = require('../js/core/defect-lint.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const names = ['normalizeMeasureJoin', 'inferMeasureJoin', 'sizeTextSaysAreaJoin', 'isMeasureOnlySizeText', 'parseSizeTextToCrackMeasures',
    'applyParsedCrackMeasuresToDefect', 'normalizeCrackDecimalText', 'normalizeEaSpacingInText', 'formatCrackMeasurePair',
    'normalizeCrackMeasureForEdit', 'getDefectCrackMeasureRowsForEdit', 'applyCrackMeasuresEditToDefect',
    'reconcileDefectMeasuresWithEditedSize', 'formatDefectSizeMeasuresJoined'];
const api = new Function(names.map((n) => extractFunction(app, 'function ' + n + '(')).join('\n') + '\nreturn {' + names.join(',') + '};')();

const MESH = '망상균열';
const fmt = (raw, type) => api.parseSizeTextToCrackMeasures(raw, { defectType: type }).map(api.formatCrackMeasurePair).join(' | ');
const rows = (raw, type) => api.parseSizeTextToCrackMeasures(raw, { defectType: type }).map((m) => [m.width, m.length, m.count, m.join].join(','));

// 사용자 사례
assert.strictEqual(fmt('Cw:0.1~0.6/1.5*2.0', MESH), 'Cw:0.1~0.6 | 1.5x2.0');
assert.strictEqual(fmt('Cw:0.1~0.6/1.5*2.0', '균열'), 'Cw:0.1~0.6 | 1.5x2.0', 'Cw 형식은 종류가 균열이어도 범위(소수라 개수일 수 없음)');
assert.strictEqual(fmt('Cw:0.1~0.6/1.5*2.0'), 'Cw:0.1~0.6 | 1.5x2.0');
assert.deepStrictEqual(rows('Cw:0.1~0.6/1.5*2.0', MESH), ['0.1~0.6,,,/', '1.5,2.0,,x']);
// 범위 (폭만 · 폭/길이 · 개수)
assert.strictEqual(fmt('Cw:0.1~0.6'), 'Cw:0.1~0.6');
assert.strictEqual(fmt('0.3~0.7/0.5 -12EA'), '0.3~0.7/0.5 -12EA');
assert.strictEqual(fmt('0.3~0.45/6.0'), '0.3~0.45/6.0');
assert.strictEqual(fmt('0.1~0.6'), 'Cw:0.1~0.6');
assert.strictEqual(fmt('1~2/3.0'), '1.0~2.0/3.0');
// 폭/가로*세로 (망상균열이면 범위)
assert.strictEqual(fmt('0.1/1.5*2.0', MESH), 'Cw:0.1 | 1.5x2.0');
assert.strictEqual(fmt('0.1/1.5*2.0'), 'Cw:0.1 | 1.5x2.0', '세 번째가 소수면 개수일 수 없다');
assert.strictEqual(fmt('0.3/2.0*3', MESH), 'Cw:0.3 | 2.0x3.0', '망상균열이면 정수여도 범위');
assert.deepStrictEqual(rows('0.3/2.0*3', '균열'), [], '균열: 길이×개수인지 범위인지 몰라 풀지 않는다(원문 보존)');
assert.deepStrictEqual(rows('0.3/2.0*3'), []);
assert.deepStrictEqual(rows('Cw:0.3/2.0*3', '균열'), []);
// Cw:폭/길이
assert.strictEqual(fmt('Cw:0.3/2.0'), '0.3/2.0');
assert.strictEqual(fmt('Cw:0.3/2.0 -2EA'), '0.3/2.0 -2EA');
// 기존 정상 케이스 불변
const same = {
    '0.3/2.0': '0.3/2.0', '0.3*2.0*3': '0.3x2.0 -3EA', '0.3x2.0x3': '0.3x2.0 -3EA', '0.3/2.0/3': '0.3/2.0 -3EA', '0.3*0.3': '0.3x0.3',
    '0.3/2.0 -2EA': '0.3/2.0 -2EA', 'Cw:0.3': 'Cw:0.3', 'Cw:0.3 -2EA': 'Cw:0.3 -2EA', '0.3': 'Cw:0.3', '3EA': '3EA', '2.0m': '2.0m',
    '0.3/3.00.2/3.0': '0.3/3.0 | 0.2/3.0', '0.3/2.00.3*0.3': '0.3/2.0 | 0.3x0.3', 'Cw:0.3, 2.0/2.0': 'Cw:0.3 | 2.0/2.0',
    'Cw:0.2, 1.5*2.0': 'Cw:0.2 | 1.5x2.0', '0.3mm/2.0mm': '0.3/2.0', '0.3×2.0': '0.3x2.0'
};
Object.keys(same).forEach((k) => assert.strictEqual(fmt(k, '균열'), same[k], k));
// 풀지 못하면 [] (일부만 돌려주지 않음)
['abc', 'Cw:0.1~', '0.3~/2.0', '0.3 이상', '0.3/2.0 건조수축', 'W=0.3mm', '0.3/2.0 누수', ''].forEach((k) => assert.deepStrictEqual(rows(k, '균열'), [], JSON.stringify(k)));

// 가져오기(엑셀 규모 칸): 결함 → 행·규모 글자·폭/길이 칸
function importDefect(sizeRaw, type) {
    const d = { defectType: type, size: sizeRaw, crackWidth: '', crackLength: '' };
    const m = api.parseSizeTextToCrackMeasures(sizeRaw, { defectType: type });
    if (m.length) api.applyParsedCrackMeasuresToDefect(d, m, sizeRaw);
    return d;
}
['망상균열', '균열'].forEach((type) => {
    const d = importDefect('Cw:0.1~0.6/1.5*2.0', type);
    assert.strictEqual(api.formatDefectSizeMeasuresJoined(d), 'Cw:0.1~0.6, 1.5x2.0', '조사표·한글 규모');
    assert.strictEqual(d.size, 'Cw:0.1~0.6, 1.5x2.0');
    assert.strictEqual(d.crackMeasures.length, 2);
    assert.strictEqual(d.crackMeasures[0].width, '0.1~0.6');
    assert.strictEqual(d.crackMeasures[1].join, 'x');
    // 수정창을 열었다 저장해도 다시 잘리지 않는다(행 → 편집 행 → 저장)
    const edit = api.getDefectCrackMeasureRowsForEdit(d);
    assert.strictEqual(edit.length, 2);
    assert.strictEqual(edit[0].width, '0.1~0.6');
    assert.strictEqual(edit[1].width, '1.5'); assert.strictEqual(edit[1].length, '2.0'); assert.strictEqual(edit[1].join, 'x');
    const saved = JSON.parse(JSON.stringify(d));
    api.applyCrackMeasuresEditToDefect(saved, edit);
    assert.strictEqual(saved.size, 'Cw:0.1~0.6, 1.5x2.0');
    assert.strictEqual(api.formatDefectSizeMeasuresJoined(saved), 'Cw:0.1~0.6, 1.5x2.0');
});
// 행이 없고 규모 글자만 있는 결함도 수정창에서 풀린다
const bare = { defectType: MESH, size: 'Cw:0.1~0.6/1.5*2.0' };
const bareRows = api.getDefectCrackMeasureRowsForEdit(bare);
assert.strictEqual(bareRows.length, 2); assert.strictEqual(bareRows[0].width, '0.1~0.6'); assert.strictEqual(bareRows[1].join, 'x');
// 규모 글자를 고쳐 저장(행이 따라감)
const edited = { defectType: MESH, size: 'Cw:0.1~0.6/1.5*2.0', crackMeasures: [{ width: '0.1', length: '', count: '', join: '/' }] };
assert.strictEqual(api.reconcileDefectMeasuresWithEditedSize(edited, 'Cw:0.1'), true);
assert.strictEqual(edited.crackMeasures.length, 2);
assert.strictEqual(edited.size, 'Cw:0.1~0.6, 1.5x2.0');
// 풀지 못하는 규모는 원문 그대로, 행은 만들지 않는다
['0.3/2.0*3', '0.3 이상', 'Cw:0.3/2.0*3'].forEach((raw) => {
    const d = importDefect(raw, '균열');
    assert.strictEqual(d.size, raw, raw); assert(!d.crackMeasures, raw);
    assert.deepStrictEqual(api.getDefectCrackMeasureRowsForEdit(d), [], '수정창 행 없음 → 저장해도 규모 원문은 규모 칸에 남는다');
    assert.strictEqual(api.reconcileDefectMeasuresWithEditedSize(JSON.parse(JSON.stringify(d)), ''), false);
});

// 규모 글자 판정
['Cw:0.1~0.6/1.5*2.0', 'Cw:0.1~0.6, 1.5x2.0', '0.3~0.7/0.5 -12EA', '0.3mm/2.0mm'].forEach((s) => assert(api.isMeasureOnlySizeText(s), s));
['0.3 이상', 'W=0.2mm, 누수 흔적', 'abc'].forEach((s) => assert(!api.isMeasureOnlySizeText(s), s));

// 통계·점검: 폭 범위는 큰 값, 면적 행은 폭이 아니다(망상균열 범위가 균열폭 1.5mm로 잡히지 않음)
const d1 = importDefect('Cw:0.1~0.6/1.5*2.0', MESH);
d1.category = '구조체'; d1.component = '슬래브';
const issues = lint.lintDefect(d1).map((i) => i.code);
assert(!issues.includes('mesh-as-length') && !issues.includes('width-spread') && !issues.includes('width-too-large'), JSON.stringify(issues));

// 앱 연결: 가져오기·수정창·규모 글자 고침이 종류를 넘긴다
assert(/parseSizeTextToCrackMeasures\(sizeRaw, \{ defectType \}\)/.test(app));
assert(/parseSizeTextToCrackMeasures\(defect\.size, \{ defectType: defect\.defectType \}\)/.test(app));
console.log('test-import-cw-range-mesh: ok');