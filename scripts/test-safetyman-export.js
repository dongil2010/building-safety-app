'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const S = require(path.join(root, 'js', 'core', 'safetyman-export.js'));

assert.strictEqual(S.crackBand(0.05), '0.1mm미만');
assert.strictEqual(S.crackBand(0.1), '0.2mm미만');
assert.strictEqual(S.crackBand(0.3), '0.5mm미만');
assert.strictEqual(S.crackBand(0.5), '0.5mm이상');
assert.strictEqual(S.crackWidthOf({ size: 'Cw:0.3' }), 0.3);
assert.strictEqual(S.crackWidthOf({ size: '0.25mm/2.0m' }), 0.25);
assert.strictEqual(S.crackWidthOf({ crackWidth: '0.4' }), 0.4);
assert.strictEqual(S.memberType('테두리보'), '테두리보');
assert.strictEqual(S.memberType('보(G)'), '거더');
assert.strictEqual(S.memberType('보(B)'), '빔');
assert.strictEqual(S.memberType('보'), '거더');
assert.deepStrictEqual(S.BASE_MEMBERS, ['기둥', '벽', '거더', '빔', '슬래브']);
assert.strictEqual(S.memberType('조적벽'), '벽');
assert.strictEqual(S.defectKind({ defectType: '철근노출' }), 'rebar');
assert.strictEqual(S.defectKind({ defectType: '백태' }), 'eff');
assert.strictEqual(S.defectKind({ defectType: '누수' }), 'leak');
assert.strictEqual(S.spallBand(S.spallDepthOf({ size: '깊이 3mm' })), '15mm미만의 박리발생');
assert.strictEqual(S.spallBand(18), '20mm미만의 박리발생');

const bldg = { id: 'b', name: '테스트' };
const st = { defects: {}, evalUnits: {}, ndtData: {} };
E.setUnitCount(bldg, 2, 1);
E.setUnitLabel(bldg, 'unit1', '기존부', 2);
E.setFloorMode(bldg, 'B1', 'whole', 'unit1', 4);
E.setFloorParts(bldg, '1F', ['z1', 'z2'], 5);
E.setFloorParts(bldg, '2F', ['z1', 'z2'], 6);
['1F', '2F'].forEach((f) => E.ensureZones(st, 'b_' + f, bldg, f, 7));
const z = (f, n) => E.zoneForPart(st, 'b_' + f, 'z' + n).id;
st.defects.b_B1 = [{ id: 'x', no: '1', component: '슬래브', defectType: '백태' }];
st.defects.b_1F = [{ id: 'a', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.15', evalUnitId: z('1F', 1) },
    { id: 'b', no: '2', component: '기둥', defectType: '균열', size: 'Cw:0.35', evalUnitId: z('1F', 1) },
    { id: 'c', no: '3', component: '보(B)', defectType: '균열', crackWidth: '0.6', evalUnitId: z('1F', 2) },
    { id: 'n', no: '4', component: '벽', defectType: '균열' }];
st.defects.b_2F = [{ id: 'd', no: '1', component: '벽', defectType: '박락', evalUnitId: z('2F', 2) }];
st.defects.b_3F = [{ id: 'g', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.1' }];
st.ndtData.b_1F = [{ category: '강도', component: '기둥', location: 'C1', strengthFinal: 24.5, designStrength: 24 }];
const floors = ['B1', '1F', '2F', '3F'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
// 평가 탭 기본값 + 직접 입력
const comp = S.unitComputed(bldg, st, floors, E);
assert.strictEqual(comp.unit1['기둥'].crackW, 0.35);
assert.strictEqual(comp.unit1['기둥'].strength, 24.5);
assert.strictEqual(comp.unit1['슬래브'].effN, 1);
assert.strictEqual(comp.unit2['빔'].crackW, 0.6);
bldg.evalInputs = { unit1: { members: { '기둥': { crackW: 0.2, count: 12 }, '슬래브': { eff: 3 } }, tilt: 500 } };
assert.deepStrictEqual(S.cellValue(bldg.evalInputs, comp, 'unit1', '기둥', 'crackW'), { value: 0.2, source: 'input', hint: '' });
assert.strictEqual(S.cellValue(bldg.evalInputs, comp, 'unit1', '기둥', 'strength').source, 'auto');
assert.strictEqual(S.cellValue({}, comp, 'unit1', '슬래브', 'eff').hint, '1건');
const sheets = S.buildSheets({ bldg, state: st, floors, evalUnits: E });
assert.deepStrictEqual(sheets.map((s) => s.name), ['요약', '평가단위 1', '평가단위 2', '미설정', '근거_결함목록', '참고']);
const u1 = sheets[1].aoa;
const inCol = u1.find((r) => r[0] === '기둥' && r[1] === 12);
assert.ok(inCol && inCol[2] === 0.2 && inCol[11] === '0.3mm미만', '입력표: 직접 입력 우선');
assert.ok(u1.some((r) => r[0] === '건물 기울기' && r[1] === '1/500'));
assert.deepStrictEqual(u1.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['B1', '1F-1', '2F-1']);
const col = u1.find((r) => r[0] === '기둥' && r[3] === 0.35);
assert.strictEqual(col[4], '0.5mm미만');
assert.ok(u1.some((r) => r[0] === '콘크리트 강도' && r[4] === 24.5));
const u2 = sheets[2].aoa;
assert.deepStrictEqual(u2.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['1F-2', '2F-2']);
assert.ok(u2.some((r) => r[0] === '빔' && r[4] === '0.5mm이상'));
assert.ok(u2.some((r) => r[0] === '벽' && r[7] === '(직접 입력)'));
const un = sheets[3].aoa;
assert.ok(String(un[1][0]).indexOf('미설정') >= 0);
assert.deepStrictEqual(un.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['1F-미지정', '3F']);
assert.strictEqual(sheets[4].aoa.length, 1 + 7);
// 원본 결함은 그대로
assert.strictEqual(st.defects.b_1F[3].evalUnitId, undefined);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/safetyman-export.js') > 0 && html.indexOf('js/core/safetyman-export.js') < html.indexOf('src="app.js'));
assert.ok(html.indexOf('id="tab-eval"') > 0 && html.indexOf("switchTab('tab-eval')") > 0, '평가 탭');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(app.indexOf('eval-plan-safetyman') > 0 && app.indexOf('downloadSafetyManExcel') > 0);
assert.ok(app.indexOf("window.BSA.tabs['tab-eval']") > 0 && app.indexOf('evalInputs') > 0);
console.log('test-safetyman-export: ok');
