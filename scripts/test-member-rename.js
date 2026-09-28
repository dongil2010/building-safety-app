#!/usr/bin/env node
/* 2026-09-28 부재 명칭: 큰보→보(G)·작은보→보(B)·철골거더→철골보(G)·철골빔→철골보(B), '상부' 삭제,
 * 접합부는 G/B 없이, G/B 미지정 보 표시(도면 G/B 버튼) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
global.window = global.window || {};
require(path.join(root, 'js/shared/defect-quick-presets.js'));
const q = (global.window.BSA && global.window.BSA.defectQuickPresets) || (global.BSA && global.BSA.defectQuickPresets);
assert.ok(q && typeof q.normalizeMemberName === 'function', 'api');

const n = q.normalizeMemberName;
assert.strictEqual(n('큰보'), '보(G)');
assert.strictEqual(n('작은보'), '보(B)');
assert.strictEqual(n('철골거더'), '철골보(G)');
assert.strictEqual(n('철골빔'), '철골보(B)');
assert.strictEqual(n('상부 보'), '보');
assert.strictEqual(n('상부보'), '보');
assert.strictEqual(n('상부 슬래브'), '슬래브');
assert.strictEqual(n('상부슬래브'), '슬래브');
assert.strictEqual(n('상부 큰보'), '보(G)');
assert.strictEqual(n('상부'), '상부');
assert.strictEqual(n('캔틸레버보'), '캔틸레버보');
assert.strictEqual(n('보(G)'), '보(G)');
assert.strictEqual(n(''), '');
assert.strictEqual(n(null), null);
// 접합부는 거더/빔 구분 없이
assert.strictEqual(n('큰보 접합부'), '보 접합부');
assert.strictEqual(n('철골거더 접합부'), '철골보 접합부');
assert.strictEqual(n('큰보-슬래브 접합부'), '보-슬래브 접합부');
assert.strictEqual(n('기둥-작은보 접합부'), '기둥-보 접합부');
assert.strictEqual(n('보 접합부'), '보 접합부');
assert.strictEqual(n('철골보 접합부'), '철골보 접합부');

const amb = q.getAmbiguousBeamChoices;
assert.deepStrictEqual(amb('보'), ['보(G)', '보(B)']);
assert.deepStrictEqual(amb('상부 보'), ['보(G)', '보(B)']);
assert.deepStrictEqual(amb('RC보'), ['보(G)', '보(B)']);
assert.deepStrictEqual(amb('거더'), ['보(G)', '보(B)']);
assert.deepStrictEqual(amb('철골보'), ['철골보(G)', '철골보(B)']);
[
    '보(G)', '보(B)', '철골보(G)', '철골보(B)', '큰보', '철골빔', '캔틸레버보', '기둥', '슬래브', '',
    '보 접합부', '철골보 접합부', '큰보 접합부', '철골거더 접합부', '기둥-보 접합부', '보-슬래브 접합부', '철골 접합부'
].forEach((v) => assert.strictEqual(amb(v), null, 'not ambiguous: ' + v));

// 계정 목록 이전: 이름 바꾸고 중복 제거, ★·순서의 그냥 '보'는 보(G)·보(B)로
let r = q.migrateMemberNameList(['기둥', '큰보', '보(G)', '작은보', '상부 슬래브', '슬래브'], {});
assert.deepStrictEqual(r.list, ['기둥', '보(G)', '보(B)', '슬래브']);
assert.strictEqual(r.changed, true);
r = q.migrateMemberNameList(['기둥', '보', '슬래브'], { expandPlainBeam: true });
assert.deepStrictEqual(r.list, ['기둥', '보(G)', '보(B)', '슬래브']);
r = q.migrateMemberNameList(['기둥', '보(G)'], { expandPlainBeam: true });
assert.strictEqual(r.changed, false);
const again = q.migrateMemberNameList(q.migrateMemberNameList(['큰보', '보'], { expandPlainBeam: true }).list, { expandPlainBeam: true });
assert.strictEqual(again.changed, false, 'idempotent');
const u = q.migrateMemberUsageCounts({ '큰보': 3, '보(G)': 2, '기둥': 1 });
assert.deepStrictEqual(u.counts, { '보(G)': 5, '기둥': 1 });
assert.strictEqual(q.migrateMemberUsageCounts({ '기둥': 1 }).changed, false);
assert.deepStrictEqual(q.DEFAULT_FAVORITES.component['구조체'], ['기둥', '보(G)', '보(B)', '슬래브', '벽체', '계단', '옹벽', '파라펫', '기초']);

// app.js 프리셋
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const pick = (re) => {
    const m = app.match(re);
    assert.ok(m, 'match ' + re);
    return m[1];
};
const structPreset = pick(/const DEFECT_COMPONENT_PRESET = \{\s*'구조체': \[([\s\S]*?)\],\s*\/\//);
['보(G)', '보(B)', '철골보(G)', '철골보(B)', '캔틸레버보'].forEach((v) => assert.ok(structPreset.includes(`'${v}'`), 'preset has ' + v));
["'큰보'", "'작은보'", "'철골거더'", "'철골빔'", "'보',"].forEach((v) => assert.ok(!structPreset.includes(v), 'preset lacks ' + v));
const jl = pick(/const DEFECT_JOINT_LEFT = \[([^\]]*)\]/);
const jr = pick(/const DEFECT_JOINT_RIGHT = \[([^\]]*)\]/);
[jl, jr].forEach((l) => assert.ok(!/\((G|B)\)|큰보|작은보|철골거더|철골빔/.test(l), 'joint lists without G/B: ' + l));
const ndt = pick(/const NDT_COMPONENT_PRESET = \[([\s\S]*?)\];/);
assert.ok(ndt.includes("'보(G)'") && ndt.includes("'철골보(B)'") && !ndt.includes("'큰보'"), 'ndt preset renamed');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(html.includes('<option value="보(G)">보(G)</option>') && !html.includes('<option value="큰보">'), 'html options');

// 결함 종류 기본 목록: 새 이름 = 예전 이름
const typeMap = app.slice(app.indexOf("'큰보': RC_BEAM_DEFECTS"), app.indexOf("'큰보': RC_BEAM_DEFECTS") + 200);
assert.ok(typeMap.includes("'보(G)': RC_BEAM_DEFECTS") && typeMap.includes("'보(B)': RC_BEAM_DEFECTS"));
assert.ok(app.includes("'철골보(G)': STEEL_MEMBER_DEFECTS") && app.includes("'철골보(B)': STEEL_MEMBER_DEFECTS"));

// 표시·출력 경로는 memberNameOut
assert.ok(/function memberNameOut\(v\)/.test(app));
assert.ok(app.includes("case 'component': return memberNameOut(d.component) || '기둥';"));
assert.ok(app.includes("setTcText(getHwpxTblCellByAddr(tbl, 1, 1), memberNameOut(d.component) || '')"));
assert.ok(app.includes("return field === 'component' ? (memberNameOut(cellVal) || '') : cellVal;"), 'excel import normalizes');
assert.ok(app.includes("component: memberNameOut(cadItem.component) || '',"), 'cad import normalizes');
assert.ok(fs.readFileSync(path.join(root, 'js/shared/hwpx-import.js'), 'utf8').replace(/\r\n/g, '\n').includes('component: normalizeImportedMember(parsed.component)'));
assert.ok(app.includes('migrateLegacyMemberNamesInState();'), 'account preset migration hooked');

// 도면 표시: 화면 paint에서만, 출력(drawPinSafe)에는 없음
const paint = app.slice(app.indexOf('function paintMapCanvas('));
assert.ok(paint.slice(0, 4000).includes('drawMemberGbNeededMarkers(ctx, currentDefects)'));
const safe = app.slice(app.indexOf('function drawPinSafe('), app.indexOf('function drawPinSafe(') + 20000);
assert.ok(!safe.includes('drawMemberGbNeededMarkers') && !safe.includes('syncMemberGbOverlay'));
assert.ok(/function applyMemberGbChoice\(defectIds, value\)/.test(app));
const apply = app.slice(app.indexOf('function applyMemberGbChoice('), app.indexOf('function applyMemberGbChoice(') + 3000);
assert.ok(apply.includes('touchDefectUpdatedAt') && apply.includes('saveStateToLocalStorage'), 'normal save path');
assert.ok(!apply.includes('openAddDefectModal'), 'G/B tap does not open edit window');
assert.ok(!/defect\.cause\s*=/.test(apply), 'cause untouched');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(css.includes('/* @@MEMBER_GB_CSS */') && css.includes('.map-member-gb-btn') && css.includes('#c026d3'));

// applyMemberGbChoice 동작 (vm)
const helperSrc = app.slice(app.indexOf('    function getMemberNameApi()'), app.indexOf('    function migrateDefectComponentStateShape()'));
const defects = [
    { id: 'a', component: '상부 보', cause: '건조수축' },
    { id: 'b', component: '철골보', cause: '부식' },
    { id: 'c', component: '보 접합부' }
];
let saved = 0;
const sb = {
    window: { BSA: { defectQuickPresets: q }, state: { userName: 'x', currentTab: 'tab-map' }, showToast() {} },
    state: { defects: { k: defects }, currentBuildingId: 'b', currentFloor: '1F' },
    document: { getElementById: () => null },
    findDefectAcrossBuildingFloors: () => ({ floorKey: 'k' }),
    touchDefectUpdatedAt: (d) => { d.updatedAt = 1; },
    saveStateToLocalStorage: () => { saved++; },
    drawCanvas() {},
    escapeSurveyAttr: (v) => String(v),
    console
};
vm.createContext(sb);
vm.runInContext(helperSrc + '\n;this.__h = { applyMemberGbChoice, getAmbiguousMemberChoices, memberNameOut, withMemberGbHint };', sb);
const h = sb.__h;
assert.strictEqual(h.applyMemberGbChoice(['a'], '보(B)'), 1);
assert.strictEqual(defects[0].component, '보(B)');
assert.strictEqual(defects[0].cause, '건조수축');
assert.strictEqual(defects[0].updatedAt, 1);
assert.strictEqual(h.applyMemberGbChoice(['b'], '보(G)'), 0, 'steel beam only takes 철골보(G)/(B)');
assert.strictEqual(h.applyMemberGbChoice(['b'], '철골보(G)'), 1);
assert.strictEqual(defects[1].component, '철골보(G)');
assert.strictEqual(h.applyMemberGbChoice(['c'], '보(G)'), 0, 'joint is never ambiguous');
assert.strictEqual(saved, 2);
assert.ok(h.withMemberGbHint('<input type="text">', '보').startsWith('<input title="보(G)/보(B) 지정 필요" '));
assert.strictEqual(h.withMemberGbHint('<input type="text">', '보(G)'), '<input type="text">');

// 통계 분류 (예전·새 이름 같은 칸)
const stats = fs.readFileSync(path.join(root, 'js/tabs/stats.js'), 'utf8').replace(/\r\n/g, '\n');
const cs = stats.indexOf('function classifyComponentGroup');
const ce = stats.indexOf('\n    }\n', cs);
const csb = {};
vm.createContext(csb);
vm.runInContext(stats.slice(cs, ce + 6) + '\n;this.f = classifyComponentGroup;', csb);
assert.strictEqual(csb.f('보(G)', '구조체'), 'bigBeam');
assert.strictEqual(csb.f('큰보', '구조체'), 'bigBeam');
assert.strictEqual(csb.f('보(B)', '구조체'), 'smallBeam');
assert.strictEqual(csb.f('작은보', '구조체'), 'smallBeam');
assert.strictEqual(csb.f('상부 보', '구조체'), 'upperBeam');
assert.strictEqual(csb.f('보', '구조체'), 'upperBeam');
assert.strictEqual(csb.f('철골보(G)', '구조체'), 'other');
assert.strictEqual(csb.f('보 접합부', '구조체'), 'other');
console.log('test-member-rename: OK');
