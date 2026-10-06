#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 조사표 「결함 크기」 칸 → 결함 수정창과 같은 폭·길이·개수 팝업(#surveySizeModal).
 * - 불러오기: crackMeasures / crackWidth·Length·itemCount / 규모 글자만("Cw:0.3") 모두 행으로
 * - "Cw:0.3" 이 폭 칸에 박혀 있어도 숫자로 풀어 키패드로 고칠 수 있게
 * - 저장: 결함 수정창과 같은 모양(crackMeasures · " / " 연결 · size ", " 연결)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function extractFunction(name) {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let i = app.indexOf('{', start);
    let depth = 0;
    for (; i < app.length; i++) {
        const c = app[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return app.slice(start, i + 1); }
    }
    throw new Error('unterminated ' + name);
}
const names = ['normalizeMeasureJoin', 'inferMeasureJoin', 'parseSizeTextToCrackMeasures', 'normalizeCrackDecimalText',
    'normalizeEaSpacingInText', 'formatCrackMeasurePair', 'normalizeCrackMeasureForEdit', 'getDefectCrackMeasureRowsForEdit',
    'applyCrackMeasuresEditToDefect'];
const api = new Function(names.map(extractFunction).join('\n') + '\nreturn {' + names.join(',') + '};')();
const rows = (d) => api.getDefectCrackMeasureRowsForEdit(d);
const save = (d, r) => { const x = Object.assign({}, d); api.applyCrackMeasuresEditToDefect(x, r); return x; };

// ---- 불러오기
// 규모 글자만 있는 결함(가져오기·예전 입력)
assert.deepStrictEqual(rows({ size: 'Cw:0.3' }), [{ width: '0.3', length: '', count: '', join: '/' }]);
assert.deepStrictEqual(rows({ size: 'Cw:0.3 -2EA' }), [{ width: '0.3', length: '', count: '2', join: '/' }]);
assert.deepStrictEqual(rows({ size: '0.3/2.0 -3EA, Cw:0.2' }), [
    { width: '0.3', length: '2.0', count: '3', join: '/' },
    { width: '0.2', length: '', count: '', join: '/' }
]);
// 폭 칸에 "Cw:0.3" 이 그대로 들어간 결함
assert.deepStrictEqual(rows({ crackWidth: 'Cw:0.3', size: 'Cw:0.3' }), [{ width: '0.3', length: '', count: '', join: '/' }]);
assert.deepStrictEqual(rows({ crackMeasures: [{ width: 'Cw:0.2 -2EA', length: '', count: '' }] }), [{ width: '0.2', length: '', count: '2', join: '/' }]);
assert.deepStrictEqual(rows({ crackMeasures: [{ width: '0.3mm', length: '1.5m', count: '' }] }), [{ width: '0.3', length: '1.5', count: '', join: '/' }]);
// 보통 결함(수정창에서 저장한 것) — 그대로
assert.deepStrictEqual(rows({ crackMeasures: [{ width: '0.3', length: '2.0', count: '', join: '/' }, { width: '0.5', length: '0.3', count: '1', join: 'x' }] }), [
    { width: '0.3', length: '2.0', count: '', join: '/' },
    { width: '0.5', length: '0.3', count: '1', join: 'x' }
]);
assert.deepStrictEqual(rows({ crackWidth: '0.15 / 0.20', crackLength: '1.0 / 2.0' }), [
    { width: '0.15', length: '1.0', count: '', join: '/' },
    { width: '0.20', length: '2.0', count: '', join: '/' }
]);
assert.deepStrictEqual(rows({ defectType: '박리', itemCount: '3' }), [{ width: '', length: '', count: '3', join: '/' }]);
assert.deepStrictEqual(rows({}), []);

// ---- 저장 (결함 수정창과 같은 모양)
let d = save({ size: 'Cw:0.3' }, rows({ size: 'Cw:0.3' }));
assert.deepStrictEqual([d.size, d.crackWidth, d.crackLength, d.itemCount], ['Cw:0.3', '0.3', '', ''], 'Cw 그대로 왕복');
assert.deepStrictEqual(d.crackMeasures, [{ width: '0.3', length: '', count: '', join: '/' }]);
d = save(d, [{ width: '0.5', length: '2', count: '2', join: '/' }]);
assert.deepStrictEqual([d.size, d.crackWidth, d.crackLength, d.itemCount], ['0.5/2.0 -2EA', '0.5', '2.0', '2'], '고친 값');
d = save(d, [{ width: '0.3', length: '', count: '', join: '/' }, { width: '1.2', length: '0.4', count: '', join: 'x' }, { width: '', length: '', count: '', join: '/' }]);
assert.strictEqual(d.size, 'Cw:0.3, 1.2x0.4');
assert.strictEqual(d.crackWidth, '0.3 / 1.2');
assert.strictEqual(d.crackMeasures.length, 2, '빈 행은 버림');
assert.deepStrictEqual(rows(d), d.crackMeasures, '저장한 걸 다시 열면 같은 행');
d = save(d, []);
assert.deepStrictEqual([d.size, d.crackWidth, d.crackLength, d.itemCount, d.crackMeasures.length], ['', '', '', '', 0], '다 지우면 비움');

// 표시: 폭 칸의 "Cw:0.3" 이 Cw:Cw:0.3 으로 두 번 붙지 않음
assert.strictEqual(api.formatCrackMeasurePair({ width: 'Cw:0.3', length: '', count: '', join: '/' }), 'Cw:0.3');

// ---- 연결
assert.ok(/id="surveySizeModal"/.test(html) && /id="surveySizeMeasureList" *>|id="surveySizeMeasureList"><\/div>/.test(html));
assert.ok(/id="btnSurveySizeAdd"[\s\S]{0,200}폭·길이·개수 추가/.test(html));
assert.ok(/id="btnSurveySizeSave"/.test(html) && /id="btnSurveySizeCancel"/.test(html));
assert.ok(/return sizeOpenBtn\(display, '규모'\);/.test(app), '크기 칸 = 팝업 버튼');
assert.ok(/sizeOpenBtn\(sizeDisp, '크기', 'survey-inline-narrow'\)/.test(app), '한 줄 조사내용 칸도');
assert.ok(/window\.openSurveySizeEditor\('\$\{id\}'\)/.test(app));
assert.ok(/renderCrackMeasureRows\(rows\.length \? rows : \[[^\]]*\], \{ list, onChange: surveySizePreviewUpdate \}\)/.test(app), '결함 수정창 편집기 재사용');
assert.ok(/case 'crackMeasures': \{[\s\S]{0,300}applyCrackMeasuresEditToDefect\(defect, rows\)/.test(app), '저장은 updateSurveyInlineField(그룹·통합 규칙 그대로)');
assert.ok(/function setCrackMeasuresToUi\(defect\) \{\s*const measures = getDefectCrackMeasureRowsForEdit\(defect\);/.test(app), '수정창도 같은 불러오기');
// 키패드 대상: 행 칸은 data-crack-w/l/n (measure-keypad TARGET_SELECTOR)
const kp = require(path.join(ROOT, 'js/shared/measure-keypad.js'));
assert.ok(/input\[data-crack-w\]/.test(kp.TARGET_SELECTOR));
assert.ok(/\.survey-size-open:empty::before/.test(css));


// ---- 2026-10-06: 결함 수정창에서 폭을 고쳐도 규모(조사표 값)가 옛 폭이던 문제
{
    const isMeasureOnly = new Function(extractFunction('isMeasureOnlySizeText') + '; return isMeasureOnlySizeText;')();
    ['', '-', 'Cw:0.3', 'Cw:0.3 -2EA', '0.3/2.0', '0.3/2.0 -2EA', '0.3mm/2.0m', '0.3㎜/2.0m', '0.3 / 2.0',
        '0.3x2.0', '0.3×2.0', '2.0m', '2.0m -3EA', '3EA', '0.3/2.0 -3EA, Cw:0.2', '0.3/3.00.2/3.0'].forEach((t) => {
        assert.strictEqual(isMeasureOnly(t), true, '측정 표기 → 행을 따라 바뀜: ' + t);
    });
    ['W=0.2mm, L=1.5m', '누수 흔적', '0.3/2.0 누수', '균열 0.3'].forEach((t) => {
        assert.strictEqual(isMeasureOnly(t), false, '손으로 쓴 글자는 그대로: ' + t);
    });
    assert.ok(/sizeEl\.dataset\.autoSize = \(composed && \(\(existingPin\.size \|\| ''\) === composed\s*\|\| isMeasureOnlySizeText\(existingPin\.size\)\)\)/.test(app),
        '결함 수정창을 열 때 측정 표기 규모면 자동 따라가기');
}

// ---- 2026-10-06: 묶음 마킹(41-1·41-2)에서 41-2 폭을 결함 수정창으로 고쳐도 조사표(첫 마킹 값)는 옛 폭이던 문제
{
    const src = extractFunction('crackMeasureSig') + '\n' + extractFunction('propagateMeasureEditToSurveyRow');
    const touched = [];
    const make = new Function('surveyRowEditTargetIds', 'touchDefectUpdatedAt', src + '; return propagateMeasureEditToSurveyRow;');
    const prop = make((list, id) => list.filter((d) => d.groupId === 'g1' && !d.mergeLinked).map((d) => d.id), (d) => touched.push(d.id));
    const A = { id: 'A', groupId: 'g1', crackMeasures: [{ width: '0.3', length: '2.0', count: '', join: '/' }], crackWidth: '0.3', crackLength: '2.0', itemCount: '', size: '0.3/2.0' };
    const B = JSON.parse(JSON.stringify(A)); B.id = 'B';
    const C = JSON.parse(JSON.stringify(A)); C.id = 'C'; C.mergeLinked = true;
    const list = [A, B, C];
    const sigB = new Function(extractFunction('crackMeasureSig') + '; return crackMeasureSig;')()(B);
    // 안 바뀐 저장은 번지지 않는다
    assert.strictEqual(prop(list, B, sigB), 0);
    B.crackMeasures = [{ width: '0.5', length: '2.0', count: '', join: '/' }]; B.crackWidth = '0.5'; B.size = '0.5/2.0';
    assert.strictEqual(prop(list, B, sigB), 1);
    assert.strictEqual(A.crackWidth, '0.5'); assert.strictEqual(A.size, '0.5/2.0');
    assert.deepStrictEqual(A.crackMeasures, B.crackMeasures); assert.notStrictEqual(A.crackMeasures, B.crackMeasures, '복사본');
    assert.strictEqual(C.crackWidth, '0.3', '통합 연결 행 규칙(대상 밖)은 건드리지 않음');
    assert.deepStrictEqual(touched, ['A'], '바뀐 마킹만 수정 시각(동기화)');
    assert.ok(/const targetIds = surveyRowEditTargetIds\(list, defectId, field\);/.test(app), '조사표 칸과 같은 대상 규칙');
    assert.ok(/propagateMeasureEditToSurveyRow\(state\.defects\[key\], state\.defects\[key\]\[idx\], crackSnapBefore\)/.test(app), '결함 수정창 저장에서 부름');
}
console.log('test-survey-size-popup: ok');
