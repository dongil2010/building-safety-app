#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 결함 종류 → 발생 원인 매핑(과거 보고서 14건 집계 기준) 회귀 테스트
 *  1) 모든 분류·부재·결함 종류 조합에 원인이 1개 이상, 목록 안 중복 없음
 *  2) 부재·종류별 자동 체크(맨 위) 원인이 집계 결과와 같음
 *  3) 계정 순서에 기본 원인이 하나도 없으면 무시(직접 추가 원인만 맨 위로 가던 문제)
 *  4) '앱 기본 세팅으로' 는 순서를 비워 둠(기본 목록을 복사해 얼려 두지 않음)
 *  5) 원인 문자열 파싱: 목록에 있는 가운뎃점·빗금 이름은 한 개로 유지
 *  6) 부재 명칭을 바꿔도 직접 고른 원인은 유지, 자동 원인만 새 부재 기준으로 다시 체크
 *  7) 비구조체 '중량물'(중량물 적치·중량물 설치) — 목록·키워드·원인·예전 계정 저장 순서에서도 보임
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const q = require(path.join(__dirname, '..', 'js', 'shared', 'defect-quick-presets.js'));

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
    throw new Error('unterminated block');
}

function extractFunction(name) {
    const re = new RegExp('\\n\\s*(async\\s+)?function ' + name + '\\s*\\(');
    const m = re.exec(src);
    assert.ok(m, 'missing function ' + name);
    const body = src.indexOf(') {', m.index) + 2;
    return blockFrom(m.index + 1, body);
}

function extractConst(name) {
    const re = new RegExp('\\n\\s*const ' + name + ' = ([\\[{])');
    const m = re.exec(src);
    assert.ok(m, 'missing const ' + name);
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
    throw new Error('unterminated const ' + name);
}

const PRESET_CONSTS = ['DEFECT_JOINT_LEFT', 'DEFECT_JOINT_RIGHT', 'DEFECT_JOINT_COMPONENT_PRESET', 'DEFECT_COMPONENT_PRESET',
    'STEEL_MEMBER_DEFECTS', 'DECK_SLAB_DEFECTS', 'WALL_CRACK_KINDS', 'COLUMN_CRACK_KINDS', 'BEAM_CRACK_KINDS',
    'RC_COMMON_OTHER_DEFECTS', 'RC_WALL_DEFECTS', 'RC_COLUMN_DEFECTS', 'RC_BEAM_DEFECTS', 'RC_SLAB_DEFECTS', 'JOINT_DEFECTS',
    'MASONRY_WALL_DEFECTS', 'PARTITION_WALL_DEFECTS', 'ALC_WALL_DEFECTS', 'WINDOW_DEFECTS', 'DOOR_DEFECTS', 'SHUTTER_DEFECTS',
    'ROOF_PANEL_DEFECTS', 'PANEL_DEFECTS', 'RAILING_DEFECTS', 'NONSTRUCT_WALL_JOINT_DEFECTS', 'HEAVY_LOAD_DEFECTS', 'EXT_TILE_DEFECTS',
    'EXT_STONE_DEFECTS', 'EXT_PAINT_DEFECTS', 'METAL_PANEL_FINISH_DEFECTS', 'INT_TILE_DEFECTS', 'INTERIOR_FINISH_DEFECTS',
    'INT_PAINT_DEFECTS', 'CEILING_FINISH_DEFECTS', 'FLOOR_TILE_DEFECTS', 'FLOOR_FINISH_DEFECTS', 'componentDefectPreset',
    'categoryDefectPreset'];

function buildEnv() {
    const a = src.indexOf('// @@DEFECT_CAUSE_MAP_START');
    const b = src.indexOf('// @@DEFECT_CAUSE_MAP_END');
    assert.ok(a >= 0 && b > a, 'missing cause map markers');
    const kn = src.indexOf('    let _knownDefaultCauseSet');
    assert.ok(kn > b, 'missing known cause set');
    let code = 'const window = env.window; const document = env.document;\n';
    code += PRESET_CONSTS.map(extractConst).join('\n') + '\n';
    code += src.slice(a, b) + '\n';
    code += src.slice(kn, src.indexOf('function isKnownCauseLabel', kn)) + '\n' + extractFunction('isKnownCauseLabel') + '\n';
    ['normalizeComponentKey', 'isRcStructuralCrackKind', 'parseDefectTypeList', 'getDefectTypePresetFor', 'getCauseKey',
        'getCauseDisplayGroups', 'parseCauseList', 'getCurrentDefectCauseContext', 'getCauseOptionsForKey',
        'getDefaultFirstCauseFor', 'resetOptionManagerCurrent', 'refreshDefectTypeAfterComponentChange',
        'applyCauseAutoPickForType', 'applySavedOptionOrder'].forEach((f) => { code += extractFunction(f) + '\n'; });
    code += 'return { DEFECT_COMPONENT_PRESET, defectCausePreset, getDefectTypePresetFor, getCauseDisplayGroups, ' +
        'getDefaultCausePresetList, getAllDefaultCausesForKey, getEffectiveCauseOrder, parseCauseList, ' +
        'getCauseOptionsForKey, getDefaultFirstCauseFor, resetOptionManagerCurrent, refreshDefectTypeAfterComponentChange, ' +
        'getCauseMemberGroup, applySavedOptionOrder, categoryDefectPreset };';
    const env = { window: { state: {}, showToast: () => {} }, document: null, fields: {} };
    const stubNames = ['getDefectComboValue', 'ensureOptionOrderEntry', 'getOptionManagerContext',
        'confirm', 'saveStateToLocalStorage', 'scheduleSyncUserDefectPinPresets', 'populateDefectComponentDropdown',
        'updateDefectTypeDropdown', 'updateDefectCauseDropdown', 'renderOptionManagerList', 'getSelectedCausesFromUi',
        'hasActionableDefectType', 'isDefectBulkEditMode', 'joinCauseList', 'getDefectQuickPresetsApi',
        'getDefectFavoriteList'];
    const stubs = {};
    stubNames.forEach((n) => { stubs[n] = (...args) => env.stubs[n](...args); });
    const header = stubNames.map((n) => 'const ' + n + ' = stubs.' + n + ';').join('\n') +
        '\nlet _lastSyncedUserDefectPinJson = "";\n';
    env.document = {
        getElementById: (id) => (Object.prototype.hasOwnProperty.call(env.fields, id) ? { id, value: env.fields[id] } : null)
    };
    const api = new Function('env', 'stubs', header + code)(env, stubs);
    env.stubs = {
        getDefectComboValue: (sel, inp) => (sel && sel.value) || (inp && inp.value) || '',
        ensureOptionOrderEntry: (field, key) => {
            const st = env.window.state;
            if (!st[field]) st[field] = {};
            if (!Array.isArray(st[field][key])) st[field][key] = [];
            return st[field][key];
        },
        getOptionManagerContext: () => env.ctx,
        confirm: () => true,
        saveStateToLocalStorage: () => {},
        scheduleSyncUserDefectPinPresets: () => {},
        populateDefectComponentDropdown: () => {},
        updateDefectTypeDropdown: () => {},
        updateDefectCauseDropdown: (type, joined) => { env.lastCause = { type, joined: joined == null ? null : joined }; },
        renderOptionManagerList: () => {},
        getSelectedCausesFromUi: () => env.selected.slice(),
        hasActionableDefectType: (t) => !!t && t !== '상태양호',
        isDefectBulkEditMode: () => !!env.bulk,
        joinCauseList: (list) => list.join(', '),
        getDefectQuickPresetsApi: () => q,
        getDefectFavoriteList: () => []
    };
    return { api, env };
}

const { api, env } = buildEnv();

function setContext(category, component, type) {
    env.fields = { defectCategory: category, defectComponent: component || '', defectComponentInput: '', defectType: type || '', defectTypeInput: '' };
}

function firstFor(category, component, type) {
    setContext(category, component, type);
    return api.getDefaultFirstCauseFor(type);
}

// ---------- 1) 모든 조합에 원인 ----------
function testEveryTypeHasCause() {
    let n = 0;
    ['구조체', '비구조체', '마감재'].forEach((cat) => {
        const comps = api.DEFECT_COMPONENT_PRESET[cat].concat(['']);
        comps.forEach((comp) => {
            const compArg = comp === '기타' ? '' : comp;
            (api.getDefectTypePresetFor(cat, comp) || []).forEach((t) => {
                if (t === '상태양호') return;
                api.getCauseDisplayGroups(t).forEach((g) => {
                    const list = api.getDefaultCausePresetList(g.key, g.types, cat, compArg);
                    assert.ok(list.length >= 1, `no cause: ${cat}/${comp}/${t}`);
                    assert.strictEqual(new Set(list).size, list.length, `duplicate cause: ${cat}/${comp}/${t}`);
                    if (g.key !== '기타') {
                        assert.ok(list.some((c) => c !== '기타'), `only 기타: ${cat}/${comp}/${t}`);
                    }
                    n++;
                });
            });
        });
    });
    assert.ok(n > 400, 'checked combos ' + n);
    // 원인 이름에는 쉼표가 들어가면 안 됨(저장할 때 쉼표로 이어 붙임)
    Object.keys(api.defectCausePreset).forEach((k) => {
        api.getAllDefaultCausesForKey(k).forEach((c) => {
            assert.ok(!/[,，]/.test(c), 'comma in cause ' + c);
            assert.strictEqual(c, c.trim());
        });
    });
}

// ---------- 2) 자동 체크 원인 ----------
function testAutoCheckedCause() {
    env.window.state = {};
    const cases = [
        // [분류, 부재, 종류, 기대 원인]
        ['구조체', '기둥', '수직균열', '건조수축 및 재료적 특성'],
        ['구조체', '보', '경사균열', '건조수축 및 재료적 특성'],
        ['구조체', '보', '수평균열', '건조수축 및 재료적 특성'],
        ['구조체', '슬래브', '균열', '건조수축 및 재료적 특성'],
        ['구조체', '벽체', '수직균열', '건조수축 및 재료적 특성'],
        ['구조체', 'SRC기둥', '수직균열', 'SRC기둥 이질재료 간 인장변형률 상이'],
        ['구조체', '슬래브', '누수', '방수층 파손'],
        ['구조체', '기둥', '백태/유출', '결함부위 수분유입'],
        ['구조체', '기둥', '철근노출', '피복두께 부족'],
        ['구조체', '기둥', '콘크리트 박락', '철근 부식 팽창'],
        ['비구조체', '벽체 접합부', '이격', '이질재료 거동차이'],
        ['비구조체', '창호', '누수', '창호 주변 밀봉 불량'],
        ['마감재', '천장 마감재', '오염/변색', '상부 배관 누수'],
        ['마감재', '천장 마감재', '처짐', '시공미흡'],
        ['마감재', '천장 마감재', '누수 흔적', '상부 배관 누수'],
        ['비구조체', '', '변형', '시공미흡']
    ];
    cases.forEach(([cat, comp, type, want]) => {
        const types = api.getDefectTypePresetFor(cat, comp) || [];
        if (comp) assert.ok(types.includes(type), `type ${type} not in preset of ${cat}/${comp}`);
        assert.strictEqual(firstFor(cat, comp, type), want, `${cat}/${comp}/${type}`);
    });
    // 비구조 변형 목록에 부식이 맨 위로 오지 않음(이전: 부식 계열로 묶임)
    setContext('비구조체', '', '변형');
    assert.notStrictEqual(api.getCauseOptionsForKey('변형', ['변형'])[0], '부식');
    // 미장균열은 구조 균열과 다른 목록
    const g = api.getCauseDisplayGroups('미장균열')[0];
    assert.strictEqual(g.key, '미장균열');
    setContext('구조체', '벽체', '미장균열');
    assert.ok(api.getCauseOptionsForKey(g.key, g.types).includes('미장 시공미흡'));
    // 벽체 접합부 누수는 이질재료 원인을 억지로 끼워 넣지 않음
    setContext('비구조체', '벽체 접합부', '누수');
    assert.ok(!/^이질재료/.test(api.getCauseOptionsForKey('누수', ['누수'])[0]));
    // 조적 벽체 균열에는 개구부 원인이 있음
    setContext('비구조체', '조적 벽체', '수직균열');
    const cg = api.getCauseDisplayGroups('수직균열')[0];
    assert.ok(api.getCauseOptionsForKey(cg.key, cg.types).includes('개구부 주위 응력집중'));
}

// ---------- 3) 계정 순서 ----------
function testCustomOrderRules() {
    setContext('구조체', '기둥', '수직균열');
    const g = api.getCauseDisplayGroups('수직균열')[0];
    // 직접 추가 원인만 들어 있는 순서 → 무시, 기본 원인이 먼저, 직접 추가는 뒤
    env.window.state = { customDefectCauses: { [g.key]: ['내가 넣은 원인'] }, defectCauseOrder: { [g.key]: ['내가 넣은 원인'] } };
    let list = api.getCauseOptionsForKey(g.key, g.types);
    assert.strictEqual(list[0], '건조수축 및 재료적 특성');
    assert.strictEqual(list[list.length - 1], '내가 넣은 원인');
    assert.deepStrictEqual(api.getEffectiveCauseOrder(g.key, ['내가 넣은 원인']), []);
    // 기본 원인이 들어 있는 순서는 그대로 따름
    env.window.state = { customDefectCauses: { [g.key]: ['내가 넣은 원인'] }, defectCauseOrder: { [g.key]: ['과하중', '내가 넣은 원인'] } };
    list = api.getCauseOptionsForKey(g.key, g.types);
    assert.deepStrictEqual(list.slice(0, 2), ['과하중', '내가 넣은 원인']);
    // 숨긴 원인은 빠짐
    env.window.state = { hiddenDefectCauses: { [g.key]: ['건조수축 및 재료적 특성'] } };
    assert.ok(!api.getCauseOptionsForKey(g.key, g.types).includes('건조수축 및 재료적 특성'));
    env.window.state = {};
}

// ---------- 4) 앱 기본 세팅으로 ----------
function testResetKeepsOrderEmpty() {
    const order = ['과하중', '부등침하'];
    const hidden = ['철근 부식 팽창'];
    const custom = ['내가 넣은 원인'];
    env.window.state = { favoriteDefectCauses: { 균열: ['과하중'] } };
    env.window._optionManagerField = 'cause';
    env.ctx = { orderList: order, hiddenList: hidden, customList: custom, favField: 'cause', favBucket: '균열' };
    setContext('구조체', '기둥', '수직균열');
    api.resetOptionManagerCurrent();
    assert.deepStrictEqual(order, []);
    assert.deepStrictEqual(hidden, []);
    assert.deepStrictEqual(custom, []);
    assert.ok(!('균열' in env.window.state.favoriteDefectCauses));
    assert.strictEqual(env.lastCause.joined, '건조수축 및 재료적 특성');
    env.window._optionManagerField = null;
    env.window.state = {};
}

// ---------- 5) 원인 문자열 파싱 ----------
function testParseCauseList() {
    env.window.state = {};
    assert.deepStrictEqual(api.parseCauseList('건조수축 및 재료적 특성, 개구부 주위 응력집중'),
        ['건조수축 및 재료적 특성', '개구부 주위 응력집중']);
    // 예전 목록 이름(기존 결함 기록)도 한 개로
    assert.deepStrictEqual(api.parseCauseList('수화열·온도균열, 배관 파손/연결부 누수'), ['수화열·온도균열', '배관 파손/연결부 누수']);
    assert.deepStrictEqual(api.parseCauseList('외력·충격'), ['외력·충격']);
    // 모르는 옛 표기는 예전처럼 나눔
    assert.deepStrictEqual(api.parseCauseList('건조수축/과하중'), ['건조수축', '과하중']);
    // 직접 추가한 원인 이름은 유지
    env.window.state = { customDefectCauses: { 균열: ['A·B 원인'] } };
    assert.deepStrictEqual(api.parseCauseList('A·B 원인'), ['A·B 원인']);
    env.window.state = {};
}

// ---------- 6) 부재 명칭 변경 ----------
function testComponentChangeKeepsManualCauses() {
    env.window.state = {};
    env.bulk = false;
    // 직접 고른 원인만 있으면 그대로
    setContext('구조체', '보', '수직균열');
    env.selected = ['과하중'];
    env.window._defectAutoCauses = [];
    api.refreshDefectTypeAfterComponentChange('구조체');
    assert.strictEqual(env.lastCause.joined, '과하중');
    // 자동 원인만 있으면 새 부재 기준으로 다시 체크
    setContext('구조체', 'SRC기둥', '수직균열');
    env.selected = ['건조수축 및 재료적 특성'];
    env.window._defectAutoCauses = ['건조수축 및 재료적 특성'];
    api.refreshDefectTypeAfterComponentChange('구조체');
    assert.strictEqual(env.lastCause.joined, 'SRC기둥 이질재료 간 인장변형률 상이');
    // 자동 + 직접: 직접 고른 것만 남김
    setContext('구조체', '보', '수직균열');
    env.selected = ['SRC기둥 이질재료 간 인장변형률 상이', '과하중'];
    env.window._defectAutoCauses = ['SRC기둥 이질재료 간 인장변형률 상이'];
    api.refreshDefectTypeAfterComponentChange('구조체');
    assert.strictEqual(env.lastCause.joined, '과하중');
    // 일괄 수정 모드는 원인 그대로
    env.bulk = true;
    env.selected = ['과하중', '부등침하'];
    env.window._defectAutoCauses = [];
    api.refreshDefectTypeAfterComponentChange('구조체');
    assert.strictEqual(env.lastCause.joined, '과하중, 부등침하');
    env.bulk = false;
}

// ---------- 7) 중량물 ----------
function testHeavyLoadItems() {
    env.window.state = {};
    const HEAVY = ['상태양호', '중량물 적치', '중량물 설치', '기타'];
    const comps = api.DEFECT_COMPONENT_PRESET['비구조체'];
    assert.ok(comps.includes('중량물'), '비구조체 부재에 중량물');
    assert.strictEqual(comps[comps.length - 1], '기타');
    assert.ok(!api.DEFECT_COMPONENT_PRESET['구조체'].includes('중량물'));
    assert.deepStrictEqual(api.getDefectTypePresetFor('비구조체', '중량물'), HEAVY);
    // 직접 입력 부재명(물탱크·실외기·태양광 패널 등)도 중량물 목록
    ['옥상 물탱크', '실외기', '태양광 패널', '냉각탑', '쿨링타워', '중량물(창고)'].forEach((c) => {
        assert.deepStrictEqual(api.getDefectTypePresetFor('비구조체', c), HEAVY, c);
    });
    assert.notDeepStrictEqual(api.getDefectTypePresetFor('비구조체', '패널'), HEAVY);
    // 부재를 안 고른 비구조체(회사 결함표는 부재명칭 빈칸이 많음)에도 보임
    const cat = api.categoryDefectPreset['비구조체'];
    assert.ok(cat.includes('중량물 적치') && cat.includes('중량물 설치'));
    assert.strictEqual(cat[cat.length - 1], '기타');
    // 원인 자동 체크 = 회사 결함원인추정 표현
    assert.strictEqual(firstFor('비구조체', '중량물', '중량물 적치'), '중량물 적치');
    assert.strictEqual(firstFor('비구조체', '중량물', '중량물 설치'), '중량물 설치');
    assert.strictEqual(firstFor('비구조체', '', '중량물 적치'), '중량물 적치');
    setContext('비구조체', '중량물', '중량물 적치');
    const list = api.getCauseOptionsForKey('중량물 적치', ['중량물 적치']);
    ['추가하중 적치', '실 변경으로 인한 하중증가', '사용자 부주의'].forEach((c) => assert.ok(list.includes(c), c));
    assert.strictEqual(api.getCauseDisplayGroups('중량물 설치')[0].key, '중량물 설치');
    // 예전에 순서를 저장한 계정: 새 항목이 '기타' 앞에 들어가 보임(숨지 않음)
    const savedOld = ['조적벽체', '칸막이벽', 'ALC벽', '벽체 접합부', '창호', '문', '셔터', '난간', '지붕 패널', '패널', '기타'];
    const merged = api.applySavedOptionOrder(comps, savedOld);
    assert.deepStrictEqual(merged.slice(-2), ['중량물', '기타']);
    assert.strictEqual(merged.length, comps.length);
    // 사용자가 '기타'를 중간에 둔 순서는 건드리지 않고 새 항목은 끝에
    assert.deepStrictEqual(api.applySavedOptionOrder(['a', '기타', 'b', 'new'], ['기타', 'a', 'b']), ['기타', 'a', 'b', 'new']);
    assert.deepStrictEqual(api.applySavedOptionOrder(['a', 'b', 'new', '기타'], ['b', 'a', '기타']), ['b', 'a', 'new', '기타']);
    assert.deepStrictEqual(api.applySavedOptionOrder(['a', 'b'], []), ['a', 'b']);
    // '앱 기본 세팅으로 전체' 로 굳힌 종류 순서(분류 목록)에서도 중량물 목록이 기타 앞
    const frozen = api.categoryDefectPreset['비구조체'].slice();
    assert.deepStrictEqual(api.applySavedOptionOrder(HEAVY, frozen), HEAVY);
    // 기본 ★: 비구조체 부재 칩 첫 줄에 중량물
    assert.ok(q.DEFAULT_FAVORITES.component['비구조체'].includes('중량물'));
    assert.ok(q.DEFAULT_FAVORITES.component['비구조체'].length <= q.VISIBLE_LIMIT.component);
}

testHeavyLoadItems();
testEveryTypeHasCause();
testAutoCheckedCause();
testCustomOrderRules();
testResetKeepsOrderEmpty();
testParseCauseList();
testComponentChangeKeepsManualCauses();
console.log('test-defect-cause-mapping: ok');
