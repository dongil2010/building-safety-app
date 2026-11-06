#!/usr/bin/env node
'use strict';

/**
 * t572u: 대분류 → 부재 → 결함내용 → 원인 소스 데이터만 추출 (XLSX 없음).
 * 배포본(origin/main)과 t571u 제안 필터를 구분한다. company-vocab.js는 읽기만.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ARTIFACT_DIR = path.join(ROOT, 'artifacts');
const BOX_DIR = '/opt/cursor/artifacts';

function gitShow(spec) {
    return execFileSync('git', ['show', spec], { cwd: ROOT, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 });
}

function gitLog(ref) {
    const raw = execFileSync('git', ['log', '-1', '--format=%H%x09%h%x09%cI%x09%s', ref], { cwd: ROOT, encoding: 'utf8' }).trim();
    const [commit, short, date, subject] = raw.split('\t');
    return { commit, short, date, subject };
}

function lineOf(src, needle) {
    const i = src.indexOf(needle);
    if (i < 0) return null;
    return src.slice(0, i).split('\n').length;
}

function lineRange(src, startNeedle, endNeedle) {
    const start = lineOf(src, startNeedle);
    const end = endNeedle ? lineOf(src, endNeedle) : null;
    return { start, end };
}

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
    throw new Error('unterminated block');
}

function extractFunction(src, name) {
    const re = new RegExp('\\n\\s*(async\\s+)?function ' + name + '\\s*\\(');
    const m = re.exec(src);
    assert.ok(m, 'missing function ' + name);
    const body = src.indexOf(') {', m.index) + 2;
    return blockFrom(src, m.index + 1, body);
}

function extractConst(src, name) {
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

const PRESET_CONSTS = [
    'DEFECT_JOINT_LEFT', 'DEFECT_JOINT_RIGHT', 'DEFECT_JOINT_COMPONENT_PRESET', 'DEFECT_COMPONENT_PRESET',
    'STEEL_MEMBER_DEFECTS', 'DECK_SLAB_DEFECTS', 'WALL_CRACK_KINDS', 'COLUMN_CRACK_KINDS', 'BEAM_CRACK_KINDS',
    'RC_COMMON_OTHER_DEFECTS', 'RC_WALL_DEFECTS', 'RC_COLUMN_DEFECTS', 'RC_BEAM_DEFECTS', 'RC_SLAB_DEFECTS', 'JOINT_DEFECTS',
    'MASONRY_WALL_DEFECTS', 'PARTITION_WALL_DEFECTS', 'ALC_WALL_DEFECTS', 'WINDOW_DEFECTS', 'DOOR_DEFECTS', 'SHUTTER_DEFECTS',
    'ROOF_PANEL_DEFECTS', 'PANEL_DEFECTS', 'RAILING_DEFECTS', 'NONSTRUCT_WALL_JOINT_DEFECTS', 'HEAVY_LOAD_DEFECTS', 'EXT_TILE_DEFECTS',
    'EXT_STONE_DEFECTS', 'EXT_PAINT_DEFECTS', 'METAL_PANEL_FINISH_DEFECTS', 'INT_TILE_DEFECTS', 'INTERIOR_FINISH_DEFECTS',
    'INT_PAINT_DEFECTS', 'CEILING_FINISH_DEFECTS', 'FLOOR_TILE_DEFECTS', 'FLOOR_FINISH_DEFECTS',
    'COMPANY_TILE_DEFECTS', 'SPRAY_FINISH_DEFECTS', 'COMPANY_FINISH_DEFECTS', 'NONSTRUCT_SITE_DEFECTS', 'componentDefectPreset',
    'categoryDefectPreset', 'DEFECT_TYPE_ALLOW'
];

function buildEnv(src, extraFns) {
    const a = src.indexOf('// @@DEFECT_CAUSE_MAP_START');
    const b = src.indexOf('// @@DEFECT_CAUSE_MAP_END');
    assert.ok(a >= 0 && b > a, 'missing cause map markers');
    const kn = src.indexOf('    let _knownDefaultCauseSet');
    assert.ok(kn > b, 'missing known cause set');
    let code = 'const window = env.window; const document = env.document;\nlet _defectTypeAllowSet = null;\n';
    code += PRESET_CONSTS.map((n) => extractConst(src, n)).join('\n') + '\n';
    code += src.slice(a, b) + '\n';
    code += src.slice(kn, src.indexOf('function isKnownCauseLabel', kn)) + '\n' + extractFunction(src, 'isKnownCauseLabel') + '\n';
    const fns = ['normalizeComponentKey', 'isRcStructuralCrackKind', 'parseDefectTypeList', 'getDefectTypePresetFor',
        'getDefectTypePresetForRaw', 'getCrackKindsForComponent', 'getCauseKey', 'getCauseDisplayGroups',
        'parseCauseList', 'getCurrentDefectCauseContext', 'getCauseOptionsForKey', 'getDefaultFirstCauseFor',
        'resetOptionManagerCurrent', 'refreshDefectTypeAfterComponentChange', 'applyCauseAutoPickForType',
        'applySavedOptionOrder'].concat(extraFns || []);
    fns.forEach((f) => {
        if (new RegExp('\\n\\s*function ' + f + '\\s*\\(').test(src)) code += extractFunction(src, f) + '\n';
    });
    code += 'return {\n' +
        '  DEFECT_COMPONENT_PRESET, DEFECT_JOINT_COMPONENT_PRESET, DEFECT_JOINT_LEFT, DEFECT_JOINT_RIGHT,\n' +
        '  DEFECT_TYPE_ALLOW, categoryDefectPreset, componentDefectPreset, defectCausePreset,\n' +
        '  CRACK_CAUSE_BY_MEMBER, DEFECT_CAUSE_BY_MEMBER, CORE_CRACK_CAUSE_PRESET,\n' +
        '  CRACK_TOP_CAUSES, FINISH_TOP_CAUSES, LEAK_TOP_CAUSES, COMPANY_CAUSE_RANK, COMPANY_CAUSE_RANK_KEY,\n' +
        '  DEFECT_CAUSE_ALLOW, CRACK_LEAD_BY_GROUP,\n' +
        '  WALL_CRACK_KINDS, COLUMN_CRACK_KINDS, BEAM_CRACK_KINDS,\n' +
        '  getDefectTypePresetFor, getDefectTypePresetForRaw, getCrackKindsForComponent,\n' +
        '  getCauseDisplayGroups, getDefaultCausePresetList, getDefaultCausePresetListRaw,\n' +
        '  getAllDefaultCausesForKey, getCauseMemberGroup, getCauseKey, companyCauseRankKey,\n' +
        '  isLeakCauseKey, isEffloCauseKey,\n' +
        '  shouldDropIncompatibleCause: (typeof shouldDropIncompatibleCause === "function") ? shouldDropIncompatibleCause : null,\n' +
        '  filterIncompatibleDefaultCauses: (typeof filterIncompatibleDefaultCauses === "function") ? filterIncompatibleDefaultCauses : null,\n' +
        '  STRUCTURAL_ONLY_CAUSES: (typeof STRUCTURAL_ONLY_CAUSES !== "undefined") ? STRUCTURAL_ONLY_CAUSES : null,\n' +
        '  MOISTURE_PIPE_CAUSES: (typeof MOISTURE_PIPE_CAUSES !== "undefined") ? MOISTURE_PIPE_CAUSES : null,\n' +
        '  isMoistureRelatedCauseKey: (typeof isMoistureRelatedCauseKey === "function") ? isMoistureRelatedCauseKey : null\n' +
        '};';
    const env = { window: { state: {}, showToast: () => {}, appConfirm: async () => true }, document: null, fields: {} };
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
    const q = require(path.join(ROOT, 'js', 'shared', 'defect-quick-presets.js'));
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
        updateDefectCauseDropdown: () => {},
        renderOptionManagerList: () => {},
        getSelectedCausesFromUi: () => [],
        hasActionableDefectType: (t) => !!t && t !== '상태양호',
        isDefectBulkEditMode: () => false,
        joinCauseList: (list) => list.join(', '),
        getDefectQuickPresetsApi: () => q,
        getDefectFavoriteList: () => []
    };
    const api = new Function('env', 'stubs', header + code)(env, stubs);
    return { api, env };
}

function clone(v) {
    return JSON.parse(JSON.stringify(v));
}

function causeRelations(api, cause, key, types, category, group) {
    const rel = [];
    const typeDefault = api.defectCausePreset[key] || [];
    if (typeDefault.indexOf(cause) >= 0) {
        rel.push({ kind: 'type-default', source: 'defectCausePreset[key]', key });
    }
    const byMem = api.DEFECT_CAUSE_BY_MEMBER[key];
    if (byMem && byMem[group] && byMem[group].indexOf(cause) >= 0) {
        rel.push({ kind: 'member-type', source: 'DEFECT_CAUSE_BY_MEMBER[key][memberGroup]', key, memberGroup: group });
    }
    if (key === '균열') {
        const crackMap = api.CRACK_CAUSE_BY_MEMBER[group];
        if (crackMap) {
            let dirHit = null;
            (types || []).forEach((t) => {
                if (!dirHit && Array.isArray(crackMap[t]) && crackMap[t].indexOf(cause) >= 0) dirHit = t;
            });
            if (dirHit) {
                rel.push({ kind: 'member-direction', source: 'CRACK_CAUSE_BY_MEMBER[memberGroup][direction]', memberGroup: group, direction: dirHit });
            } else if (Array.isArray(crackMap['*']) && crackMap['*'].indexOf(cause) >= 0) {
                rel.push({ kind: 'member-group-default', source: 'CRACK_CAUSE_BY_MEMBER[memberGroup]["*"]', memberGroup: group, direction: '*' });
            }
        }
        if (api.CRACK_LEAD_BY_GROUP[group] && api.CRACK_LEAD_BY_GROUP[group].indexOf(cause) >= 0) {
            rel.push({ kind: 'member-group-lead', source: 'CRACK_LEAD_BY_GROUP', memberGroup: group });
        }
    }
    const rk = api.companyCauseRankKey(key);
    if (rk === '균열' && api.CRACK_TOP_CAUSES.indexOf(cause) >= 0) {
        rel.push({
            kind: 'type-family-wide',
            source: 'CRACK_TOP_CAUSES',
            family: '균열',
            note: '균열류 공통 맨 위 3개. 부재 교차곱이 아니라 균열 키에만 전치.'
        });
    }
    if (api.isLeakCauseKey(key) && api.LEAK_TOP_CAUSES.indexOf(cause) >= 0) {
        rel.push({
            kind: 'type-family-wide',
            source: 'LEAK_TOP_CAUSES',
            family: '누수',
            note: '누수·누수흔적 키에만 전치. 다른 결함 종류에 교차곱하지 않음.'
        });
    }
    if (api.isEffloCauseKey(key) && (cause === '결함부위 수분유입' || cause === '상부 방수층 파손')) {
        rel.push({ kind: 'type-family-wide', source: 'efflo-lead', family: '백태' });
    }
    if (category === '마감재' && key !== '미장균열' && !api.isEffloCauseKey(key) && api.FINISH_TOP_CAUSES.indexOf(cause) >= 0) {
        rel.push({
            kind: 'category-wide',
            source: 'FINISH_TOP_CAUSES',
            category: '마감재',
            shared: true,
            note: '마감재 분류 공통 맨 위 4개(미장균열·백태류 제외). 부재마다 따로 만든 교차곱이 아님.'
        });
    }
    if (!rel.length) {
        rel.push({
            kind: 'allow-or-rank-fallback',
            source: 'DEFECT_CAUSE_ALLOW / COMPANY_CAUSE_RANK',
            note: '엑셀 허용 목록 필터 후 비면 회사 순위 일반 원인으로 채움. 새 관계를 만들지 않음.'
        });
    }
    return rel;
}

function dropReason(proposed, key, cause, category) {
    if (!proposed.shouldDropIncompatibleCause) return { reasonCode: 'unknown', reason: '제안본 필터 함수 없음' };
    if (!proposed.shouldDropIncompatibleCause(key, cause, category)) {
        return { reasonCode: 'allow-filter-or-order', reason: '제안본 목록에서만 빠짐(허용목록/순위 차이 가능)' };
    }
    const c = String(cause || '').trim();
    if ((category === '마감재' || category === '비구조체') && proposed.STRUCTURAL_ONLY_CAUSES && proposed.STRUCTURAL_ONLY_CAUSES.indexOf(c) >= 0) {
        return {
            reasonCode: 'structural-only-on-nonstructure',
            reason: '내력부족·철근 부식 팽창·피복두께 부족은 구조체 문맥 원인. 마감재·비구조체 기본 제안에서만 제외(용어 자체는 유지).'
        };
    }
    if (category === '마감재' && proposed.MOISTURE_PIPE_CAUSES && proposed.MOISTURE_PIPE_CAUSES.indexOf(c) >= 0) {
        return {
            reasonCode: 'moisture-pipe-on-dry-finish',
            reason: '상부 배관 누수·상부 누수는 수분/들뜸류가 아닌 마감 결함 기본 제안에서만 제외. 오염·들뜸·누수흔적 등은 유지.'
        };
    }
    return { reasonCode: 'incompatible-filter', reason: 'shouldDropIncompatibleCause가 제외' };
}

function walkChipTree(baseline, proposed) {
    const categories = ['구조체', '비구조체', '마감재'];
    const tree = [];
    const removed = [];
    let comboCount = 0;
    categories.forEach((category, catOrder) => {
        const chipMembers = baseline.DEFECT_COMPONENT_PRESET[category] || [];
        const joints = category === '구조체' ? (baseline.DEFECT_JOINT_COMPONENT_PRESET || []) : [];
        const members = [];
        chipMembers.forEach((component, memberOrder) => {
            members.push(walkMember(baseline, proposed, {
                category, categoryOrder: catOrder + 1, component, memberOrder: memberOrder + 1,
                role: 'chip',
                causeLookupComponent: component === '기타' ? '' : component,
                note: component === '기타'
                    ? '칩 라벨은 기타. 원인 부재군 조회는 빈 문자열 → 구조기타/비구조기타/마감기타.'
                    : null
            }, removed, () => { comboCount++; }));
        });
        joints.forEach((component, i) => {
            members.push(walkMember(baseline, proposed, {
                category, categoryOrder: catOrder + 1, component,
                memberOrder: chipMembers.length + i + 1,
                role: 'joint-composer-not-chip',
                causeLookupComponent: component,
                note: '부재 칩 목록에 없음. 「접합부」 단추 프리셋 두 가지만. 좌·우 선택으로 다른 접합부를 만들 수 있으나 그 교차곱은 기본 칩 트리가 아님.'
            }, removed, () => { comboCount++; }));
        });
        tree.push({
            category,
            order: catOrder + 1,
            memberCount: members.length,
            members
        });
    });
    return { tree, removed, comboCount };
}

function walkMember(baseline, proposed, meta, removed, onCombo) {
    const { category, component, causeLookupComponent } = meta;
    const typesRaw = baseline.getDefectTypePresetFor(category, component) || [];
    const types = [];
    typesRaw.forEach((type, typeOrder) => {
        if (type === '상태양호') {
            types.push({
                type,
                order: typeOrder + 1,
                skippedCauses: true,
                reason: '상태양호는 원인 그룹을 만들지 않음 (getCauseDisplayGroups가 빈 배열).'
            });
            return;
        }
        const groups = baseline.getCauseDisplayGroups(type);
        const groupOut = groups.map((g) => {
            onCombo();
            const deployed = baseline.getDefaultCausePresetList(g.key, g.types, category, causeLookupComponent);
            const proposedList = proposed.getDefaultCausePresetList(g.key, g.types, category, causeLookupComponent);
            const memberGroup = baseline.getCauseMemberGroup(category, causeLookupComponent);
            const dropped = deployed.filter((c) => proposedList.indexOf(c) < 0);
            dropped.forEach((cause) => {
                const why = dropReason(proposed, g.key, cause, category);
                removed.push({
                    category,
                    component,
                    role: meta.role,
                    type,
                    causeKey: g.key,
                    causeTypes: g.types.slice(),
                    memberGroup,
                    cause,
                    status: 'unreleased',
                    proposedCleanup: true,
                    deployedBaselineStillShows: true,
                    ...why
                });
            });
            return {
                causeKey: g.key,
                label: g.label,
                types: g.types.slice(),
                isCrackGroup: !!g.isCrackGroup,
                memberGroup,
                causeScope: describeScope(baseline, g.key, g.types, category, memberGroup),
                causesDeployed: deployed.map((cause, i) => ({
                    label: cause,
                    order: i + 1,
                    relations: causeRelations(baseline, cause, g.key, g.types, category, memberGroup),
                    inProposedCleanup: proposedList.indexOf(cause) >= 0
                })),
                causesProposed: listsEqual(deployed, proposedList) ? undefined : proposedList.map((cause, i) => ({
                    label: cause,
                    order: i + 1,
                    relations: causeRelations(proposed, cause, g.key, g.types, category, memberGroup)
                })),
                proposedDiff: listsEqual(deployed, proposedList) ? 'unchanged' : 'filtered'
            };
        });
        types.push({
            type,
            order: typeOrder + 1,
            causeGroups: groupOut
        });
    });
    return {
        component,
        order: meta.memberOrder,
        role: meta.role,
        causeLookupComponent,
        note: meta.note || undefined,
        memberGroup: baseline.getCauseMemberGroup(category, causeLookupComponent),
        crackKindsForComponent: baseline.getCrackKindsForComponent(component),
        types
    };
}

function describeScope(api, key, types, category, memberGroup) {
    if (key === '균열' && api.CRACK_CAUSE_BY_MEMBER[memberGroup]) {
        const dirs = (types || []).filter((t) => api.CRACK_CAUSE_BY_MEMBER[memberGroup][t]);
        if (dirs.length) return { kind: 'member-direction', memberGroup, directions: dirs };
        return { kind: 'member-group-default', memberGroup, direction: '*' };
    }
    if (api.DEFECT_CAUSE_BY_MEMBER[key] && api.DEFECT_CAUSE_BY_MEMBER[key][memberGroup]) {
        return { kind: 'member-type', key, memberGroup };
    }
    if (category === '마감재' && key !== '미장균열' && !api.isEffloCauseKey(key)) {
        return { kind: 'type-default-plus-category-wide-finish-top', key, category };
    }
    if (api.isLeakCauseKey(key)) return { kind: 'type-default-plus-leak-top', key };
    return { kind: 'type-default', key };
}

function listsEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function collectTypeListSources(api) {
    const keys = [
        'STEEL_MEMBER_DEFECTS', 'DECK_SLAB_DEFECTS', 'RC_WALL_DEFECTS', 'RC_COLUMN_DEFECTS', 'RC_BEAM_DEFECTS',
        'RC_SLAB_DEFECTS', 'JOINT_DEFECTS', 'MASONRY_WALL_DEFECTS', 'PARTITION_WALL_DEFECTS', 'ALC_WALL_DEFECTS',
        'WINDOW_DEFECTS', 'DOOR_DEFECTS', 'SHUTTER_DEFECTS', 'ROOF_PANEL_DEFECTS', 'PANEL_DEFECTS', 'RAILING_DEFECTS',
        'NONSTRUCT_WALL_JOINT_DEFECTS', 'HEAVY_LOAD_DEFECTS', 'EXT_TILE_DEFECTS', 'EXT_STONE_DEFECTS', 'EXT_PAINT_DEFECTS',
        'METAL_PANEL_FINISH_DEFECTS', 'INT_TILE_DEFECTS', 'INTERIOR_FINISH_DEFECTS', 'INT_PAINT_DEFECTS',
        'CEILING_FINISH_DEFECTS', 'FLOOR_TILE_DEFECTS', 'FLOOR_FINISH_DEFECTS', 'COMPANY_TILE_DEFECTS',
        'SPRAY_FINISH_DEFECTS', 'COMPANY_FINISH_DEFECTS', 'NONSTRUCT_SITE_DEFECTS'
    ];
    const out = {};
    keys.forEach((k) => {
        try {
            // eslint-disable-next-line no-new-func
            // constants are on api only if we exposed them — several are not. Skip missing.
        } catch (e) { /* ignore */ }
    });
    return out;
}

function loadCompanyVocab() {
    const vocabPath = path.join(ROOT, 'js', 'core', 'company-vocab.js');
    const src = fs.readFileSync(vocabPath, 'utf8');
    const api = require(vocabPath);
    const extractArr = (name) => {
        const re = new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n    \\];)');
        const m = src.match(re);
        return m ? m[1] : null;
    };
    const aliasesM = src.match(/const CAUSE_ALIASES = \{[\s\S]*?\n    \};/);
    return {
        path: 'js/core/company-vocab.js',
        role: 'excel-import-conversion-only',
        notChipTree: true,
        unreadFirebase: true,
        note: '엑셀 가져오기 변환·원인 표기 통일만. 결함 수정창 칩 트리(getDefectTypePresetFor / getDefaultCausePresetList)를 바꾸지 않음. 이 파일은 읽기만 함.',
        CAUSE_STANDARD: api.CAUSE_STANDARD.slice(),
        CAUSE_ALIASES: (function () {
            const m = src.match(/const CAUSE_ALIASES = \{([\s\S]*?)\n    \};/);
            const o = {};
            if (!m) return o;
            m[1].split('\n').forEach((line) => {
                const kv = line.match(/'([^']+)':\s*'([^']+)'/);
                if (kv) o[kv[1]] = kv[2];
            });
            return o;
        })(),
        DEFECT_WORDS: (function () {
            const m = src.match(/const DEFECT_WORDS = \[([\s\S]*?)\];/);
            if (!m) return [];
            return m[1].split(',').map((s) => s.replace(/['\s]/g, '')).filter(Boolean);
        })(),
        rules: [
            '구조체 행은 부재/조사내용을 쪼개지 않음(원인 표기 통일만).',
            '비구조체·마감재만 splitSurveyContent + combineMember.',
            '저장된 결함은 고치지 않음.',
            'CAUSE_STANDARD / CAUSE_ALIASES는 가져온 원인 문자열 정규화. 새 칩 원인을 추가하지 않음.'
        ],
        sourceLines: {
            file: 'js/core/company-vocab.js',
            CAUSE_STANDARD: lineOf(src, 'const CAUSE_STANDARD'),
            CAUSE_ALIASES: lineOf(src, 'const CAUSE_ALIASES'),
            convertImportRow: lineOf(src, 'function convertImportRow'),
            splitSurveyContent: lineOf(src, 'function splitSurveyContent')
        }
    };
}

function loadFavorites() {
    const p = path.join(ROOT, 'js', 'shared', 'defect-quick-presets.js');
    const src = fs.readFileSync(p, 'utf8');
    const q = require(p);
    return {
        path: 'js/shared/defect-quick-presets.js',
        role: 'chip-visibility-favorites-only',
        notTypeList: true,
        note: '★ 기본 즐겨찾기·칩 개수. 대분류→부재→결함내용 목록 자체가 아님.',
        DEFAULT_FAVORITES: q.DEFAULT_FAVORITES || (function () {
            const m = src.match(/const DEFAULT_FAVORITES = \{[\s\S]*?\n    \};/);
            return m ? m[0] : null;
        })(),
        sourceLines: { DEFAULT_FAVORITES: lineOf(src, 'const DEFAULT_FAVORITES') }
    };
}

function sourcePaths(deployedSrc, proposedSrc) {
    const needles = [
        ['DEFECT_COMPONENT_PRESET', 'const DEFECT_COMPONENT_PRESET'],
        ['DEFECT_JOINT_COMPONENT_PRESET', 'const DEFECT_JOINT_COMPONENT_PRESET'],
        ['DEFECT_TYPE_ALLOW', 'const DEFECT_TYPE_ALLOW'],
        ['componentDefectPreset', 'const componentDefectPreset'],
        ['getDefectTypePresetFor', 'function getDefectTypePresetFor('],
        ['getDefectTypePresetForRaw', 'function getDefectTypePresetForRaw('],
        ['categoryDefectPreset', 'const categoryDefectPreset'],
        ['getCrackKindsForComponent', 'function getCrackKindsForComponent('],
        ['DEFECT_CAUSE_MAP', '// @@DEFECT_CAUSE_MAP_START'],
        ['CRACK_CAUSE_BY_MEMBER', 'const CRACK_CAUSE_BY_MEMBER'],
        ['DEFECT_CAUSE_BY_MEMBER', 'const DEFECT_CAUSE_BY_MEMBER'],
        ['defectCausePreset', 'const defectCausePreset'],
        ['getCauseMemberGroup', 'function getCauseMemberGroup('],
        ['FINISH_TOP_CAUSES', 'const FINISH_TOP_CAUSES'],
        ['CRACK_TOP_CAUSES', 'const CRACK_TOP_CAUSES'],
        ['LEAK_TOP_CAUSES', 'const LEAK_TOP_CAUSES'],
        ['COMPANY_CAUSE_RANK', 'const COMPANY_CAUSE_RANK'],
        ['DEFECT_CAUSE_ALLOW', 'const DEFECT_CAUSE_ALLOW'],
        ['getDefaultCausePresetList', 'function getDefaultCausePresetList('],
        ['getDefaultCausePresetListRaw', 'function getDefaultCausePresetListRaw('],
        ['shouldDropIncompatibleCause', 'function shouldDropIncompatibleCause('],
        ['filterIncompatibleDefaultCauses', 'function filterIncompatibleDefaultCauses(']
    ];
    return needles.map(([id, needle]) => ({
        id,
        path: 'app.js',
        deployedLine: lineOf(deployedSrc, needle),
        proposedLine: lineOf(proposedSrc, needle)
    })).concat([
        { id: 'company-vocab', path: 'js/core/company-vocab.js', note: 'READ ONLY. 가져오기 변환. 칩 트리 아님.' },
        { id: 'defect-quick-presets', path: 'js/shared/defect-quick-presets.js', note: '즐겨찾기/칩 가시성. 종류 목록 아님.' },
        { id: 'extract-harness', path: 'scripts/test-defect-cause-mapping.js', note: '같은 구간 추출 방식.' },
        { id: 'this-export', path: 'scripts/export-preset-tree.js' }
    ]);
}

function summarizeRemoved(removed) {
    const byReason = {};
    const byKeyCause = {};
    removed.forEach((r) => {
        byReason[r.reasonCode] = (byReason[r.reasonCode] || 0) + 1;
        const k = [r.category, r.causeKey, r.cause].join('\t');
        if (!byKeyCause[k]) byKeyCause[k] = { category: r.category, causeKey: r.causeKey, cause: r.cause, reasonCode: r.reasonCode, reason: r.reason, members: [], types: [] };
        if (byKeyCause[k].members.indexOf(r.component) < 0) byKeyCause[k].members.push(r.component);
        if (byKeyCause[k].types.indexOf(r.type) < 0) byKeyCause[k].types.push(r.type);
    });
    return {
        totalAssociations: removed.length,
        byReasonCode: byReason,
        uniqueCategoryKeyCause: Object.keys(byKeyCause).length,
        groups: Object.keys(byKeyCause).sort().map((k) => byKeyCause[k])
    };
}

function renderNotes(data) {
    const d = data.meta.deployedBaseline;
    const p = data.meta.proposedCleanup;
    const rem = data.t571uRemovedAssociations.summary;
    const lines = [];
    const L = (s) => { lines.push(s); };
    L('# 프리셋 트리 소스 노트 (t572u)');
    L('');
    L('워크북(XLSX)은 이 추출에 포함하지 않는다. 아래 JSON이 엑셀 트리의 유일한 소스 데이터다.');
    L('');
    L('## 산출물');
    L('');
    L('- `artifacts/preset-tree.json`');
    L('- `artifacts/preset-tree-notes.md` (이 파일)');
    L('- 박스 복사본: `/opt/cursor/artifacts/preset-tree.json`, `/opt/cursor/artifacts/preset-tree-notes.md`');
    L('');
    L('## 범위');
    L('');
    L('| 층 | 상태 | 설명 |');
    L('|---|---|---|');
    L('| 앱 기본 칩 트리 | 포함 | `DEFECT_COMPONENT_PRESET` × `getDefectTypePresetFor` × `getCauseDisplayGroups` × `getDefaultCausePresetList`. 코드에 있는 조합만. |');
    L('| 접합부 작곡 | 별도 | 칩에 없는 `DEFECT_JOINT_COMPONENT_PRESET` 두 개만. 좌×우 교차곱은 만들지 않음. |');
    L('| company-vocab 보충 | 포함(가져오기 전용) | `js/core/company-vocab.js` READ ONLY. 엑셀 가져오기 변환·원인 표기 통일. 칩 목록을 바꾸지 않음. |');
    L('| 계정 커스텀 프리셋 | **unavailable** | `customDefectTypes` / `customDefectCauses` / `customDefectComponents` / `defectPinPresets`는 회사 Firestore·기기 localStorage. 저장소에 없음. Firebase 실데이터 읽지 않음. |');
    L('| t571u 제외 연관 | 별도 섹션 | 미배포. 배포본 트리는 그대로 두고 제안 제외분만 기록. |');
    L('');
    L('## 소스 커밋');
    L('');
    L(`- **배포 기준(current deployed baseline)**: \`${d.commit}\` (\`${d.short}\`) ${d.date} — ${d.subject}`);
    L(`- **t571u 제안 정리(proposed cleanup, unreleased)**: \`${p.commit}\` (\`${p.short}\`) ${p.date} — ${p.subject}`);
    L(`- 트리의 \`causesDeployed\`는 배포 기준. \`causesProposed\`는 목록이 달라질 때만 붙임.`);
    L('');
    L('## 소스 경로 (줄 번호는 각 커밋의 app.js)');
    L('');
    L('| id | path | deployed | proposed |');
    L('|---|---|---:|---:|');
    data.meta.sourcePaths.filter((s) => s.deployedLine || s.proposedLine || s.note).forEach((s) => {
        L(`| ${s.id} | \`${s.path}\` | ${s.deployedLine || '—'} | ${s.proposedLine || '—'} |`);
    });
    L('');
    L('## 관계를 만드는 방식 (교차곱 금지)');
    L('');
    L('1. 대분류는 코드 순서 그대로: 구조체 → 비구조체 → 마감재.');
    L('2. 부재는 그 분류의 `DEFECT_COMPONENT_PRESET[분류]` 배열 순서만. 다른 분류 부재를 섞지 않음.');
    L('3. 결함내용은 `getDefectTypePresetFor(분류, 부재)`가 돌려 준 배열만. 허용 목록(`DEFECT_TYPE_ALLOW`)으로 걸러서 비면 걸러내기 전 목록.');
    L('4. 원인은 `getCauseDisplayGroups(결함내용)`의 키마다 `getDefaultCausePresetList(key, types, 분류, 부재)`.');
    L('5. 같은 바탕 부재 이름(벽체·기둥·보·슬래브·바닥)도 **분류가 다르면 결함 목록이 다름** — 한 표로 합치지 말 것.');
    L('6. 마감재 `FINISH_TOP_CAUSES`(시공미흡, 경과년수 증대에 따른 노후화, 상부 배관 누수, 상부 누수)는 **마감재 분류 공통 전치**(미장균열·백태류 제외). 부재마다 새로 만든 관계가 아님. JSON에서 `kind: category-wide`, `shared: true`.');
    L('7. 균열 `CRACK_TOP_CAUSES`·누수 `LEAK_TOP_CAUSES`는 **그 결함 가족만**. 다른 종류에 펼치지 말 것.');
    L('8. 균열 방향별 원인은 `CRACK_CAUSE_BY_MEMBER[부재군][방향]`. 그 방향 키가 없으면 `"*"`.');
    L('9. `DEFECT_CAUSE_BY_MEMBER`에 없는 (종류, 부재군)은 `defectCausePreset[종류]` 타입 기본값.');
    L('10. `componentDefectPreset`의 칩 밖 키(창호·문·철골기둥 …)는 직접 입력/예전 이름 경로. 칩 트리에 끼워 넣지 않음 — `typedOrLegacyMemberRoutes`.');
    L('11. 접합부 좌·우 목록(`DEFECT_JOINT_LEFT` × `DEFECT_JOINT_RIGHT`)은 작곡기이지 기본 칩 행이 아님.');
    L('');
    L('## 배포 기준 칩 부재 (원 라벨·순서)');
    L('');
    Object.keys(data.definitions.DEFECT_COMPONENT_PRESET).forEach((cat) => {
        L(`- **${cat}**: ${data.definitions.DEFECT_COMPONENT_PRESET[cat].map((n, i) => `${i + 1}. ${n}`).join(' · ')}`);
    });
    L('');
    L(`- 접합부 작곡 프리셋(칩 아님, 구조체만 시험 경로와 동일): ${data.definitions.DEFECT_JOINT_COMPONENT_PRESET.join(', ')}`);
    L('');
    L('## company-vocab 보충 규칙 (칩 트리 아님)');
    L('');
    L(`- 파일: \`${data.companyVocabSupplemental.path}\` (READ ONLY, 배포/제안 커밋 동일)`);
    L(`- 표준 원인: ${data.companyVocabSupplemental.CAUSE_STANDARD.join(', ')}`);
    L('- 별칭:');
    Object.keys(data.companyVocabSupplemental.CAUSE_ALIASES).forEach((k) => {
        L(`  - ${k} → ${data.companyVocabSupplemental.CAUSE_ALIASES[k]}`);
    });
    L('- 규칙:');
    data.companyVocabSupplemental.rules.forEach((r) => L(`  - ${r}`));
    L('');
    L('## 사용자 커스텀 프리셋');
    L('');
    L(`**${data.userCustomPresets.status}** — ${data.userCustomPresets.reason}`);
    L('');
    L('## t571u 제외 연관 (미배포)');
    L('');
    L(`- 상태: **${data.t571uRemovedAssociations.status}**`);
    L(`- 제안 커밋: \`${p.commit}\``);
    L(`- PR: ${data.t571uRemovedAssociations.pr}`);
    L(`- 배포본에는 아직 그대로 보임. 저장된 결함·커스텀·Firebase는 변경 없음. company-vocab.js 미수정.`);
    L(`- 제외 건수(칩+접합부 작곡 조합): **${rem.totalAssociations}**`);
    L(`- (분류, 원인키, 원인) 묶음: **${rem.uniqueCategoryKeyCause}**`);
    L('');
    L('| reasonCode | count |');
    L('|---|---:|');
    Object.keys(rem.byReasonCode).forEach((k) => L(`| ${k} | ${rem.byReasonCode[k]} |`));
    L('');
    L('묶음 목록 (부재·종류는 JSON 전체 행을 볼 것):');
    L('');
    rem.groups.forEach((g) => {
        L(`- [${g.category}] ${g.causeKey} ↛ ${g.cause} (${g.reasonCode}) — 부재 ${g.members.length}개, 종류 ${g.types.length}개`);
    });
    L('');
    L('## 관련 작업 상태');
    L('');
    Object.keys(data.relatedWorkStatus).forEach((k) => {
        const s = data.relatedWorkStatus[k];
        L(`- **${k}** [${s.status}]: ${s.summary}`);
    });
    L('');
    L('## 통계');
    L('');
    L(`- 원인 그룹 조합 수(상태양호 제외): ${data.stats.causeGroupCombos}`);
    L(`- 배포본과 제안본이 다른 그룹: ${data.stats.filteredGroups}`);
    L('');
    return lines.join('\n');
}

function main() {
    const deployedRef = process.env.PRESET_DEPLOYED_REF || 'origin/main';
    const proposedRef = process.env.PRESET_PROPOSED_REF || 'origin/cursor/cause-mapping-cleanup-45fc';
    const deployedMeta = gitLog(deployedRef);
    const proposedMeta = gitLog(proposedRef);
    const deployedSrc = gitShow(deployedRef + ':app.js');
    const proposedSrc = gitShow(proposedRef + ':app.js');
    const baseline = buildEnv(deployedSrc).api;
    const proposed = buildEnv(proposedSrc).api;
    assert.ok(baseline.getDefaultCausePresetList, 'baseline extract');
    assert.ok(proposed.shouldDropIncompatibleCause, 'proposed filter present');
    assert.ok(!fs.readFileSync(path.join(ROOT, 'js/core/company-vocab.js'), 'utf8').includes('shouldDropIncompatibleCause'),
        'company-vocab must stay untouched');

    const walked = walkChipTree(baseline, proposed);
    let filteredGroups = 0;
    walked.tree.forEach((cat) => {
        cat.members.forEach((m) => {
            (m.types || []).forEach((t) => {
                (t.causeGroups || []).forEach((g) => { if (g.proposedDiff === 'filtered') filteredGroups++; });
            });
        });
    });

    const chipKeys = new Set();
    Object.keys(baseline.DEFECT_COMPONENT_PRESET).forEach((cat) => {
        baseline.DEFECT_COMPONENT_PRESET[cat].forEach((c) => chipKeys.add(c));
    });
    (baseline.DEFECT_JOINT_COMPONENT_PRESET || []).forEach((c) => chipKeys.add(c));

    const typedKeys = {};
    Object.keys(baseline.componentDefectPreset).forEach((k) => {
        if (!chipKeys.has(k)) typedKeys[k] = baseline.componentDefectPreset[k].slice();
    });

    const data = {
        meta: {
            task: 't572u',
            exportedAt: new Date().toISOString(),
            workbook: 'not-produced',
            note: '엑셀 워크북은 별도 작업. 이 파일은 소스 데이터만.',
            deployedBaseline: Object.assign({ role: 'current-deployed-chip-tree', ref: deployedRef }, deployedMeta),
            proposedCleanup: Object.assign({ role: 't571u-unreleased-filter', status: 'unreleased', ref: proposedRef }, proposedMeta),
            sourcePaths: sourcePaths(deployedSrc, proposedSrc),
            scope: {
                builtInDefaults: 'included',
                companyVocabSupplemental: 'included-import-only',
                userCustomPresets: 'unavailable'
            }
        },
        definitions: {
            from: deployedRef + ' app.js (deployed baseline)',
            DEFECT_COMPONENT_PRESET: clone(baseline.DEFECT_COMPONENT_PRESET),
            DEFECT_JOINT_COMPONENT_PRESET: clone(baseline.DEFECT_JOINT_COMPONENT_PRESET),
            DEFECT_JOINT_LEFT: clone(baseline.DEFECT_JOINT_LEFT),
            DEFECT_JOINT_RIGHT: clone(baseline.DEFECT_JOINT_RIGHT),
            DEFECT_TYPE_ALLOW: clone(baseline.DEFECT_TYPE_ALLOW),
            categoryDefectPreset: clone(baseline.categoryDefectPreset),
            componentDefectPreset: clone(baseline.componentDefectPreset),
            WALL_CRACK_KINDS: clone(baseline.WALL_CRACK_KINDS),
            COLUMN_CRACK_KINDS: clone(baseline.COLUMN_CRACK_KINDS),
            BEAM_CRACK_KINDS: clone(baseline.BEAM_CRACK_KINDS),
            CRACK_CAUSE_BY_MEMBER: clone(baseline.CRACK_CAUSE_BY_MEMBER),
            DEFECT_CAUSE_BY_MEMBER: clone(baseline.DEFECT_CAUSE_BY_MEMBER),
            defectCausePreset: clone(baseline.defectCausePreset),
            CRACK_TOP_CAUSES: clone(baseline.CRACK_TOP_CAUSES),
            FINISH_TOP_CAUSES: clone(baseline.FINISH_TOP_CAUSES),
            LEAK_TOP_CAUSES: clone(baseline.LEAK_TOP_CAUSES),
            COMPANY_CAUSE_RANK: clone(baseline.COMPANY_CAUSE_RANK),
            COMPANY_CAUSE_RANK_KEY: clone(baseline.COMPANY_CAUSE_RANK_KEY),
            DEFECT_CAUSE_ALLOW: clone(baseline.DEFECT_CAUSE_ALLOW),
            CRACK_LEAD_BY_GROUP: clone(baseline.CRACK_LEAD_BY_GROUP),
            CORE_CRACK_CAUSE_PRESET: clone(baseline.CORE_CRACK_CAUSE_PRESET)
        },
        proposedCleanupDefinitions: {
            from: proposedRef + ' app.js (t571u unreleased)',
            STRUCTURAL_ONLY_CAUSES: clone(proposed.STRUCTURAL_ONLY_CAUSES),
            MOISTURE_PIPE_CAUSES: clone(proposed.MOISTURE_PIPE_CAUSES),
            note: '전역 용어 삭제가 아니라 getDefaultCausePresetList 필터 층.'
        },
        tree: walked.tree,
        typedOrLegacyMemberRoutes: {
            note: '칩 목록에 없는 componentDefectPreset 키. 직접 입력·예전 이름 경로. 칩 트리 교차곱에 넣지 말 것.',
            keys: typedKeys
        },
        companyVocabSupplemental: loadCompanyVocab(),
        chipVisibilityFavorites: loadFavorites(),
        userCustomPresets: {
            status: 'unavailable',
            available: false,
            reason: '계정 커스텀(customDefectTypes / customDefectCauses / customDefectComponents / hidden* / defectPinPresets)은 회사 Firestore와 기기 localStorage에만 있다. 이 저장소에는 없고, Firebase 실데이터는 읽지 않았다.',
            storageHints: [
                'users/{uid}.defectPinPresets',
                'localStorage building_safety_user_defect_pin_v1_{uid}',
                'window.state.customDefectTypes|Causes|Components'
            ]
        },
        t571uRemovedAssociations: {
            status: 'unreleased',
            pr: 'https://github.com/dongil2010/building-safety-app/pull/36',
            branch: 'cursor/cause-mapping-cleanup-45fc',
            proposedCommit: proposedMeta.commit,
            deployedCommitStillShowsThem: deployedMeta.commit,
            policy: '명백히 안 맞는 기본 제안만 제외. 애매한 것은 유지. 전역 유효 용어는 삭제하지 않음. 저장 결함·커스텀·Firebase 불변. company-vocab.js 미수정.',
            items: walked.removed,
            summary: summarizeRemoved(walked.removed)
        },
        relatedWorkStatus: {
            t568u: {
                status: 'deployed',
                summary: '회차선택에 현장 담당자/연락처(inspector·contactPhone, 없으면 미등록). t570u로 main 배포.'
            },
            t569u: {
                status: 'deployed',
                summary: '직접입력 「프리셋에 저장」/「이번만 사용」 토글. 기기 localStorage. t570u로 main 배포.'
            },
            t570u: {
                status: 'deployed',
                summary: `main ${deployedMeta.short}. 구현 a246cab, 버전 토큰 20261106_112232, live web-version short c3f9122.`
            },
            t571u: {
                status: 'unreleased',
                summary: `원인 매핑 정리 PR #36, ${proposedMeta.short}. 배포하지 않음. 이 추출의 proposed/removed 섹션.`
            },
            t572u: {
                status: 'source-export-only',
                summary: '프리셋 트리 소스 JSON+노트. XLSX 없음.'
            }
        },
        stats: {
            causeGroupCombos: walked.comboCount,
            filteredGroups,
            removedAssociations: walked.removed.length
        }
    };

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const jsonPath = path.join(ARTIFACT_DIR, 'preset-tree.json');
    const notesPath = path.join(ARTIFACT_DIR, 'preset-tree-notes.md');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
    const notes = renderNotes(data);
    fs.writeFileSync(notesPath, notes + '\n');

    try {
        fs.mkdirSync(BOX_DIR, { recursive: true });
        fs.writeFileSync(path.join(BOX_DIR, 'preset-tree.json'), JSON.stringify(data, null, 2) + '\n');
        fs.writeFileSync(path.join(BOX_DIR, 'preset-tree-notes.md'), notes + '\n');
    } catch (e) {
        console.warn('box copy skipped:', e.message);
    }

    assert.strictEqual(data.tree.length, 3, 'three categories');
    assert.ok(data.tree[0].category === '구조체');
    assert.ok(data.stats.causeGroupCombos > 400, 'combo count');
    assert.ok(data.t571uRemovedAssociations.items.length > 0, 't571u removals');
    console.log(JSON.stringify({
        json: jsonPath,
        notes: notesPath,
        box: [path.join(BOX_DIR, 'preset-tree.json'), path.join(BOX_DIR, 'preset-tree-notes.md')],
        stats: data.stats,
        deployed: deployedMeta.short,
        proposed: proposedMeta.short
    }, null, 2));
}

main();
