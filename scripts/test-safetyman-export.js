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
assert.strictEqual(S.memberType('보(G)'), '보');
assert.strictEqual(S.memberType('조적벽'), '벽');
assert.strictEqual(S.defectKind({ defectType: '철근노출' }), 'rebar');
assert.strictEqual(S.defectKind({ defectType: '백태' }), 'leak');
assert.strictEqual(S.spallBand(S.spallDepthOf({ size: '깊이 3mm' })), '15mm미만의 박리발생');
assert.strictEqual(S.spallBand(18), '20mm미만의 박리발생');

const bldg = { id: 'b', name: '테스트' };
const st = { defects: {}, evalUnits: {}, ndtData: {} };
E.setUnitCount(bldg, 2, 1);
E.setFloorMode(bldg, '1F', 'whole', 'unit1', 2);
E.setFloorMode(bldg, '2F', 'split', null, 3);
const s1 = E.createSubUnit(st, 'b_2F', bldg, 'unit2', 4);
const s2 = E.createSubUnit(st, 'b_2F', bldg, 'unit2', 5);
st.defects.b_1F = [{ id: 'a', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.15' },
    { id: 'b', no: '2', component: '기둥', defectType: '균열', size: 'Cw:0.35' },
    { id: 'c', no: '3', component: '슬래브', defectType: '백태' }];
st.defects.b_2F = [{ id: 'd', no: '1', component: '보', defectType: '균열', crackWidth: '0.6', evalUnitId: s1.id },
    { id: 'e', no: '2', component: '벽', defectType: '박락', evalUnitId: s2.id },
    { id: 'f', no: '3', component: '기둥', defectType: '균열' }];
st.defects.b_3F = [{ id: 'g', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.1' }];
st.ndtData.b_1F = [{ category: '강도', component: '기둥', location: 'C1', strengthFinal: 24.5, designStrength: 24 }];
const floors = ['1F', '2F', '3F'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
const sheets = S.buildSheets({ bldg, state: st, floors, evalUnits: E });
const names = sheets.map((s) => s.name);
assert.deepStrictEqual(names, ['요약', '1_평가단위 1_1F', '2_2-1_2F', '3_2-2_2F', '4_미설정_2F', '5_미설정_3F', '근거_결함목록', '참고']);
const sh1 = sheets[1].aoa;
const col = sh1.find((r) => r[0] === '기둥');
assert.strictEqual(col[3], 0.35);
assert.strictEqual(col[4], '0.5mm미만');
const slab = sh1.find((r) => r[0] === '슬래브');
assert.strictEqual(slab[9], '(직접 입력)');
assert.ok(sh1.some((r) => r[0] === '콘크리트 강도' && r[4] === 24.5));
assert.strictEqual(sheets[2].aoa.find((r) => r[0] === '보')[4], '0.5mm이상');
assert.strictEqual(sheets[3].aoa.find((r) => r[0] === '벽')[7], '(직접 입력)');
assert.ok(String(sheets[4].aoa[1][0]).indexOf('미설정') >= 0);
assert.strictEqual(sheets[6].aoa.length, 1 + 7);
// 원본 데이터는 그대로
assert.strictEqual(st.defects.b_2F[2].evalUnitId, undefined);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/safetyman-export.js') > 0 && html.indexOf('js/core/safetyman-export.js') < html.indexOf('src="app.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(app.indexOf('eval-plan-safetyman') > 0 && app.indexOf('downloadSafetyManExcel') > 0);
console.log('test-safetyman-export: ok');
