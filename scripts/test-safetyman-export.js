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
const old = E.addPart(bldg, { name: '기존부', note: 'RC 라멘' }, 2);
const ext = E.addPart(bldg, { name: '증축부', note: '철골' }, 3);
assert.strictEqual(old.unitId, 'unit1'); assert.strictEqual(ext.unitId, 'unit2');
E.setFloorMode(bldg, 'B1', 'whole', 'unit1', 4);
E.setFloorParts(bldg, '1F', [old.id, ext.id], 5);
E.setFloorParts(bldg, '2F', [old.id, ext.id], 6);
['1F', '2F'].forEach((f) => E.ensureZones(st, 'b_' + f, bldg, f, 7));
const z = (f, p) => E.zoneForPart(st, 'b_' + f, p.id).id;
st.defects.b_B1 = [{ id: 'x', no: '1', component: '슬래브', defectType: '백태' }];
st.defects.b_1F = [{ id: 'a', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.15', evalUnitId: z('1F', old) },
    { id: 'b', no: '2', component: '기둥', defectType: '균열', size: 'Cw:0.35', evalUnitId: z('1F', old) },
    { id: 'c', no: '3', component: '보', defectType: '균열', crackWidth: '0.6', evalUnitId: z('1F', ext) },
    { id: 'n', no: '4', component: '벽', defectType: '균열' }];
st.defects.b_2F = [{ id: 'd', no: '1', component: '벽', defectType: '박락', evalUnitId: z('2F', ext) }];
st.defects.b_3F = [{ id: 'g', no: '1', component: '기둥', defectType: '균열', crackWidth: '0.1' }];
st.ndtData.b_1F = [{ category: '강도', component: '기둥', location: 'C1', strengthFinal: 24.5, designStrength: 24 }];
const floors = ['B1', '1F', '2F', '3F'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
const sheets = S.buildSheets({ bldg, state: st, floors, evalUnits: E });
assert.deepStrictEqual(sheets.map((s) => s.name), ['요약', '평가단위 1', '평가단위 2', '미설정', '근거_결함목록', '참고']);
const u1 = sheets[1].aoa;
assert.deepStrictEqual(u1.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['B1', '1F-기존부', '2F-기존부']);
assert.ok(u1.some((r) => r[1] === '1F-기존부' && r[5] === 'RC 라멘'));
const col = u1.find((r) => r[0] === '기둥' && r[3] === 0.35);
assert.strictEqual(col[4], '0.5mm미만');
assert.ok(u1.some((r) => r[0] === '콘크리트 강도' && r[4] === 24.5));
const u2 = sheets[2].aoa;
assert.deepStrictEqual(u2.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['1F-증축부', '2F-증축부']);
assert.ok(u2.some((r) => r[0] === '보' && r[4] === '0.5mm이상'));
assert.ok(u2.some((r) => r[0] === '벽' && r[7] === '(직접 입력)'));
const un = sheets[3].aoa;
assert.ok(String(un[1][0]).indexOf('미설정') >= 0);
assert.deepStrictEqual(un.filter((r) => /^표본층 \d/.test(r[0])).map((r) => r[1]), ['1F-미지정', '3F']);
assert.strictEqual(sheets[4].aoa.length, 1 + 7);
// 부분의 단위를 바꾸면 다른 층 구역도 같이 옮겨진다
E.updatePart(bldg, ext.id, { unitId: 'unit1' }, 9);
const again = S.buildSheets({ bldg, state: st, floors, evalUnits: E });
assert.deepStrictEqual(again.map((s) => s.name), ['요약', '평가단위 1', '미설정', '근거_결함목록', '참고']);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/safetyman-export.js') > 0 && html.indexOf('js/core/safetyman-export.js') < html.indexOf('src="app.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(app.indexOf('eval-plan-safetyman') > 0 && app.indexOf('downloadSafetyManExcel') > 0);
console.log('test-safetyman-export: ok');
