#!/usr/bin/env node
'use strict';

/**
 * t575u: 맨몸 구조 부재는 구조체 칩만. 비구조체·마감재 기본 칩/폴백에 다시 끼지 않음.
 * 조적벽체·벽체 타일·기둥 미장·그냥 벽체는 유지. 저장 결함·커스텀은 지우지 않음.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const q = require(path.join(root, 'js/shared/defect-quick-presets.js'));

assert.ok(!fs.readFileSync(path.join(root, 'js/core/company-vocab.js'), 'utf8').includes('BARE_STRUCTURAL_MEMBER_CHIPS'),
    'company-vocab.js는 수정하지 않음');

function blockFrom(startIdx, bodyIdx) {
    let i = bodyIdx != null ? bodyIdx : src.indexOf('{', startIdx);
    let depth = 0;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(startIdx, i + 1);
        }
    }
    throw new Error('unterminated');
}
function extractConst(name) {
    const re = new RegExp('\\n\\s*const ' + name + ' = ([\\[{])');
    const m = re.exec(src);
    assert.ok(m, 'missing ' + name);
    const at = m.index + 1;
    const openIdx = src.indexOf(m[1], at + ('const ' + name).length);
    const close = m[1] === '[' ? ']' : '}';
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
        const ch = src[i];
        if (ch === m[1]) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return src.slice(at, i + 1) + ';';
        }
    }
    throw new Error('unterminated ' + name);
}
function extractFunction(name) {
    const re = new RegExp('\\n\\s*function ' + name + '\\s*\\(');
    const m = re.exec(src);
    assert.ok(m, 'missing function ' + name);
    const body = src.indexOf(') {', m.index) + 2;
    return blockFrom(m.index + 1, body);
}

const api = new Function(
    extractConst('DEFECT_COMPONENT_PRESET') + '\n' +
    extractConst('BARE_STRUCTURAL_MEMBER_CHIPS') + '\n' +
    'const _bareStructuralMemberChipSet = new Set(BARE_STRUCTURAL_MEMBER_CHIPS);\n' +
    extractFunction('isBareStructuralMemberChipName') + '\n' +
    extractFunction('getDefectComponentPresetForCategory') + '\n' +
    extractFunction('finishMemberChooserApi') + '\n' +
    extractFunction('isFinishMemberBaseName') + '\n' +
    extractFunction('isFinishCombinedMemberName') + '\n' +
    extractFunction('shouldLearnDefectComponentForCategory') + '\n' +
    extractFunction('applySavedOptionOrder') + '\n' +
    extractFunction('getDefaultVisibleOptionTexts') + '\n' +
    'return { DEFECT_COMPONENT_PRESET, BARE_STRUCTURAL_MEMBER_CHIPS, isBareStructuralMemberChipName, getDefectComponentPresetForCategory, shouldLearnDefectComponentForCategory, applySavedOptionOrder, getDefaultVisibleOptionTexts };'
)();

const BARE = ['기둥', '보', '보(G)', '보(B)', '철골보(G)', '철골보(B)', '슬래브', 'RC벽체', '내력벽', '구조벽',
    'RC기둥', '철골기둥', 'SRC기둥', '데크슬래브', '철골보'];

const struct = api.getDefectComponentPresetForCategory('구조체');
const nonstruct = api.getDefectComponentPresetForCategory('비구조체');
const finish = api.getDefectComponentPresetForCategory('마감재');

['기둥', '보(G)', '보(B)', '철골보(G)', '철골보(B)', '슬래브', 'RC벽체', '벽체'].forEach((n) => {
    assert.ok(struct.includes(n), '구조체에 유지 ' + n);
});

BARE.forEach((n) => {
    assert.ok(!nonstruct.includes(n), '비구조체 칩에 없음 ' + n);
    assert.ok(!finish.includes(n), '마감재 칩에 없음 ' + n);
    assert.ok(!api.DEFECT_COMPONENT_PRESET['비구조체'].includes(n), '비구조체 원본 배열에도 없음 ' + n);
    assert.ok(!api.DEFECT_COMPONENT_PRESET['마감재'].includes(n), '마감재 원본 배열에도 없음 ' + n);
});

['조적벽체', '벽체', '벽체 접합부', '치장벽돌', '난간', '바닥', '파라펫'].forEach((n) => {
    assert.ok(nonstruct.includes(n), '비구조 유지 ' + n);
});
['벽체 타일', '기둥 미장', '천장 마감재', '타일 마감재', '벽체', '바닥'].forEach((n) => {
    assert.ok(finish.includes(n), '마감 유지 ' + n);
});

assert.ok(api.isBareStructuralMemberChipName('기둥'));
assert.ok(api.isBareStructuralMemberChipName('보 (G)'));
assert.ok(!api.isBareStructuralMemberChipName('기둥 미장'));
assert.ok(!api.isBareStructuralMemberChipName('벽체 타일'));
assert.ok(!api.isBareStructuralMemberChipName('벽체'));
assert.ok(!api.isBareStructuralMemberChipName('조적벽체'));

// 비구조체·마감재는 구조체 목록으로 폴백하지 않음
assert.notDeepStrictEqual(nonstruct, struct);
assert.ok(nonstruct.length > 0 && finish.length > 0);
assert.deepStrictEqual(api.getDefectComponentPresetForCategory('비구조체'), nonstruct);

// 예전 계정 순서에 기둥이 남아 있어도 기본 칩에 다시 안 끼움
const oldOrder = ['벽체', '기둥', '조적벽체', '슬래브', '보(G)', '기타'];
const reordered = api.applySavedOptionOrder(nonstruct, oldOrder);
BARE.forEach((n) => assert.ok(!reordered.includes(n), '저장된 순서로 재진입하지 않음 ' + n));
assert.ok(reordered.includes('조적벽체') && reordered.includes('벽체'));

// 사용자가 직접 추가한 커스텀은 유지(저장된 프리셋을 지우지 않음)
const withCustom = api.getDefaultVisibleOptionTexts({
    presetList: nonstruct,
    hiddenList: [],
    customList: ['기둥', '우리집 칸막이']
});
assert.ok(withCustom.includes('기둥'), '커스텀 기둥은 비구조체에서 유지');
assert.ok(withCustom.includes('우리집 칸막이'));
assert.ok(withCustom.includes('조적벽체'));

// 기본 ★도 빠진 이름을 가리키지 않음
['비구조체', '마감재'].forEach((cat) => {
    q.DEFAULT_FAVORITES.component[cat].forEach((n) => {
        assert.ok(!api.isBareStructuralMemberChipName(n), '기본 ★이 맨몸 구조 부재 ' + cat + '/' + n);
        assert.ok(api.getDefectComponentPresetForCategory(cat).includes(n), '기본 ★이 그 분류 프리셋에 있음 ' + cat + '/' + n);
    });
});
q.DEFAULT_FAVORITES.component['구조체'].forEach((n) => {
    assert.ok(struct.includes(n), '구조체 ★ ' + n);
});

assert.strictEqual(api.shouldLearnDefectComponentForCategory('구조체', '기둥'), true);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('비구조체', '기둥'), false);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('마감재', '보(G)'), false);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('비구조체', '조적벽체'), true);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('마감재', '기둥 미장'), true);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('마감재', '기둥'), false, '마감재 바탕 단추는 목록에 안 넣음');
assert.strictEqual(api.shouldLearnDefectComponentForCategory('마감재', '벽체'), false);
assert.strictEqual(api.shouldLearnDefectComponentForCategory('마감재', '기둥 타일'), true, '합친 이름은 배워도 됨');
assert.ok(src.includes('shouldLearnDefectComponentForCategory(cat, trimmed)'), '직접추가·저장이 학습 가드를 탐');
assert.ok(src.includes("|| !shouldLearnDefectComponentForCategory(cat, v)"), '이번만 사용이어도 이 결함 값은 유지');
assert.ok(/isBareStructuralMemberChipName\(currentComponent\)/.test(src), '이 결함만 칩으로 보여 줌');

console.log('test-bare-structural-member-chips: ok');
