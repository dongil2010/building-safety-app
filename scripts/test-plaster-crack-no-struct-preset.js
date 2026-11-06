#!/usr/bin/env node
'use strict';

/**
 * t577u: 구조체에서 미장균열을 고르면 이 결함은 비구조체로 바뀌지만,
 * 맨몸 기둥·보·슬래브가 비구조체 재사용 프리셋에 쌓이지 않는다.
 * 프리셋에 저장 / 이번만 사용 모두.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function blockFrom(src, startIdx, bodyIdx) {
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
function extractNamed(name) {
    const re = new RegExp('\\n\\s*function ' + name + '\\s*\\(');
    const m = re.exec(app);
    assert.ok(m, 'missing ' + name);
    const body = app.indexOf(') {', m.index) + 2;
    return blockFrom(app, m.index + 1, body);
}
function extractConst(name) {
    const re = new RegExp('\\n\\s*const ' + name + ' = ([\\[{])');
    const m = re.exec(app);
    assert.ok(m, 'missing ' + name);
    const at = m.index + 1;
    const openIdx = app.indexOf(m[1], at + ('const ' + name).length);
    const close = m[1] === '[' ? ']' : '}';
    let depth = 0;
    for (let i = openIdx; i < app.length; i++) {
        const ch = app[i];
        if (ch === m[1]) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return app.slice(at, i + 1) + ';';
        }
    }
    throw new Error('unterminated ' + name);
}

const helpers = new Function(
    extractConst('DEFECT_COMPONENT_PRESET') + '\n' +
    extractConst('BARE_STRUCTURAL_MEMBER_CHIPS') + '\n' +
    'const _bareStructuralMemberChipSet = new Set(BARE_STRUCTURAL_MEMBER_CHIPS);\n' +
    extractNamed('isBareStructuralMemberChipName') + '\n' +
    extractNamed('getDefectComponentPresetForCategory') + '\n' +
    extractNamed('shouldLearnDefectComponentForCategory') + '\n' +
    extractNamed('getDefaultVisibleOptionTexts') + '\n' +
    'return { isBareStructuralMemberChipName, getDefectComponentPresetForCategory, shouldLearnDefectComponentForCategory, getDefaultVisibleOptionTexts };'
)();

function persistEnv(category) {
    const state = {
        customDefectComponents: { '구조체': [], '비구조체': [], '마감재': [] },
        defectComponentOrder: { '구조체': [], '비구조체': [], '마감재': [] }
    };
    const document = {
        getElementById(id) {
            if (id === 'defectCategory') return { value: category.value };
            return { value: '' };
        }
    };
    const window = { state };
    const fns = [
        extractNamed('knownDefectCategoryOrEmpty'),
        extractNamed('persistTypedDefectComponent'),
        'return { persistTypedDefectComponent };'
    ].join('\n');
    const api = new Function(
        'document', 'window', 'migrateDefectComponentStateShape',
        'getDefectComponentPresetForCategory', 'shouldLearnDefectComponentForCategory',
        'ensureOptionOrderEntry', 'saveStateToLocalStorage',
        fns
    )(
        document, window, () => {},
        helpers.getDefectComponentPresetForCategory,
        helpers.shouldLearnDefectComponentForCategory,
        (bucket, key) => {
            if (!state[bucket]) state[bucket] = {};
            if (!Array.isArray(state[bucket][key])) state[bucket][key] = [];
            return state[bucket][key];
        },
        () => {}
    );
    return { api, state, category };
}

function plasterSwitch(state) {
    const els = {
        defectCategory: { value: state.cat, events: [], dispatchEvent(e) { this.events.push(e.type); return true; } },
        defectComponent: { value: state.comp },
        defectComponentInput: { value: '' },
        defectType: { value: state.type },
        defectTypeInput: { value: '' }
    };
    const toasts = [];
    const win = { showToast: (m) => toasts.push(m) };
    const src = [
        extractFunction(app, 'function parseDefectTypeList('),
        extractFunction(app, 'function isPlasterCrackDefectType('),
        extractFunction(app, 'function defectTypeListHasPlasterCrack('),
        extractFunction(app, 'function maybeReclassifyPlasterCrackToNonStructural('),
        extractFunction(app, 'function bsaPlasterNonStructCategory('),
        'return { maybeReclassifyPlasterCrackToNonStructural, bsaPlasterNonStructCategory, isPlasterCrackDefectType };'
    ].join('\n');
    const helpersSrc = 'const getDefectComboValue = (a, b) => (a && a.value) || (b && b.value) || "";\n'
        + 'const isDefectBulkEditMode = () => !!bulk;\n'
        + 'const markDefectBulkFieldChanged = () => {};\n';
    const api = new Function('document', 'window', 'bulk', 'Event', helpersSrc + src)(
        { getElementById: (id) => els[id] || null }, win, !!state.bulk, function (type) { this.type = type; }
    );
    return { api, els, win, toasts };
}

// 1) 이 결함은 비구조체로 옮기고 부재·종류를 유지
{
    const t = plasterSwitch({ cat: '구조체', comp: '기둥', type: '미장균열' });
    assert.strictEqual(t.api.bsaPlasterNonStructCategory('구조체', '미장균열'), '비구조체');
    assert.strictEqual(t.api.maybeReclassifyPlasterCrackToNonStructural(), true);
    assert.strictEqual(t.els.defectCategory.value, '비구조체');
    assert.deepStrictEqual(t.els.defectCategory.events, ['change']);
    assert.strictEqual(t.win._preserveDefectTypeOnCategoryChange, '미장균열');
    assert.strictEqual(t.win._preserveDefectComponentOnCategoryChange, '기둥');
    assert.ok(t.toasts.length >= 1);
}

// 2) 프리셋에 저장 모드에서도 비구조체 재사용 목록에 기둥을 넣지 않음
{
    const cat = { value: '비구조체' };
    const { api, state } = persistEnv(cat);
    assert.strictEqual(api.persistTypedDefectComponent('기둥'), false, 'save 모드여도 기둥은 비구조체 목록에 안 넣음');
    assert.deepStrictEqual(state.customDefectComponents['비구조체'], []);
    assert.strictEqual(api.persistTypedDefectComponent('보(G)'), false);
    assert.strictEqual(api.persistTypedDefectComponent('슬래브'), false);
    assert.ok(api.persistTypedDefectComponent('우리집 칸막이'));
    assert.deepStrictEqual(state.customDefectComponents['비구조체'], ['우리집 칸막이']);
}

// 3) 이번만 사용: persist를 안 타도 학습 가드가 막고, 칩 목록에도 없음
{
    const chips = helpers.getDefaultVisibleOptionTexts({
        presetList: helpers.getDefectComponentPresetForCategory('비구조체'),
        hiddenList: [],
        customList: []
    });
    assert.ok(!chips.includes('기둥') && !chips.includes('보(G)') && !chips.includes('슬래브'));
    assert.ok(chips.includes('조적벽체'));
}

// 4) 저장 시 분류 규칙·전환 호출은 그대로
assert.ok(/bsaPlasterNonStructCategory\(readDefectCategoryUi\(\), dTypeVal\)/.test(app)
    || /bsaPlasterNonStructCategory\(/.test(app));
assert.ok(/if \(maybeReclassifyPlasterCrackToNonStructural\(\)\) return;/.test(app));
assert.ok(/shouldLearnDefectComponentForCategory\(cat, trimmed\)/.test(app));
assert.ok(/shouldLearnDefectComponentForCategory\(ctx\.favBucket, val\)/.test(app), '⚙ 직접추가도 학습 가드');

console.log('test-plaster-crack-no-struct-preset: ok');
