/* 부재 수 세기(2026-10-13): 점 추가·지우기·묘비·동기화 합치기·평가단위별 합계·SafetyMan 입력표 반영, 출력 제외 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const MC = require(path.join(root, 'js', 'core', 'member-count.js'));
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const S = require(path.join(root, 'js', 'core', 'safetyman-export.js'));
const SM = require(path.join(root, 'js', 'core', 'sync-merge.js'));

assert.deepStrictEqual(MC.TYPES, ['기둥', '벽', '거더', '빔', '슬래브']);
assert.strictEqual(MC.KEYS.g, '거더');
assert.strictEqual(MC.KEYS.b, '빔');
const st = {};
assert.strictEqual(MC.add(st, 'b_1F', '보', 1, 1), null, '모르는 종류 거부');
const c1 = MC.add(st, 'b_1F', '기둥', 10, 10, { now: 100 });
const c2 = MC.add(st, 'b_1F', '기둥', 50, 10, { now: 101 });
const s1 = MC.add(st, 'b_1F', '슬래브', 30, 30, { now: 102 });
assert.deepStrictEqual(MC.countsByType(MC.listFor(st, 'b_1F')), { '기둥': 2, '벽': 0, '거더': 0, '빔': 0, '슬래브': 1 });
assert.deepStrictEqual(MC.seqNumbers(MC.listFor(st, 'b_1F')), { [c1.id]: 1, [c2.id]: 2, [s1.id]: 1 });
// 화면 맞추기: 가까운 점
const hit = MC.hitTest(MC.listFor(st, 'b_1F'), 48, 12, 14, (d) => ({ sx: d.x, sy: d.y }));
assert.strictEqual(hit.id, c2.id);
assert.strictEqual(MC.hitTest(MC.listFor(st, 'b_1F'), 200, 200, 14, (d) => ({ sx: d.x, sy: d.y })), null);
// 지우기 → 묘비, 되돌리기(같은 id로 다시) → 묘비 걷힘
const gone = MC.remove(st, 'b_1F', c2.id);
assert.ok(gone && st.deletedMemberCountIds.b_1F.includes(c2.id));
MC.add(st, 'b_1F', gone.type, gone.x, gone.y, { id: gone.id, now: 200 });
assert.ok(!st.deletedMemberCountIds.b_1F.includes(c2.id));
MC.remove(st, 'b_1F', s1.id);
// 동기화: 다른 기기로 합치면 지운 점은 안 살아남
const other = { memberCounts: { b_1F: [Object.assign({}, s1)] } };
MC.mergePackIntoState(other, 'b_1F', MC.packFor(st, 'b_1F'), SM.mergeNdtDataMaps);
assert.deepStrictEqual(MC.listFor(other, 'b_1F').map((d) => d.type).sort(), ['기둥', '기둥']);
assert.ok(MC.packHasContent(MC.packFor(st, 'b_1F')) && !MC.packHasContent(MC.packFor({}, 'x')));

// 평가단위별 합계: 층 전체 / 번호로 나눈 층(점의 구역 번호)
const bldg = { id: 'b', name: 't' };
E.setUnitCount(bldg, 2, 1);
E.setFloorMode(bldg, '1F', 'whole', 'unit1', 2);
E.setFloorParts(bldg, '2F', ['z1', 'z2'], 3);
MC.add(st, 'b_2F', '거더', 1, 1, { zoneNo: 1 });
MC.add(st, 'b_2F', '빔', 2, 2, { zoneNo: 2 });
MC.add(st, 'b_2F', '빔', 3, 3, { zoneNo: 2 });
MC.add(st, 'b_2F', '벽', 4, 4);
const floors = ['1F', '2F'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
const uc = MC.unitCounts(bldg, st, floors, E);
assert.strictEqual(uc.byUnit.unit1['기둥'], 2);
assert.strictEqual(uc.byUnit.unit1['거더'], 1);
assert.strictEqual(uc.byUnit.unit2['빔'], 2);
assert.deepStrictEqual(uc.unassigned, [{ floorCode: '2F', floorLabel: '2F', count: 1 }]);
// 평가 탭 부재 수: 회색 자동, 직접 입력이 이김
st.defects = {};
const comp = S.unitComputed(bldg, st, floors, E, null, MC);
assert.deepStrictEqual(S.cellValue({}, comp, 'unit2', '빔', 'count'), { value: 2, source: 'auto', hint: '' });
assert.strictEqual(S.cellValue({ unit2: { members: { '빔': { count: 7 } } } }, comp, 'unit2', '빔', 'count').value, 7);
const sheets = S.buildSheets({ bldg, state: st, floors, evalUnits: E, memberCount: MC });
assert.ok(sheets[1].aoa.some((r) => r[0] === '기둥' && r[1] === 2), 'SafetyMan 입력표에 부재 수');

// 앱 연결: 층 묶음·저장, 화면 전용(출력 그림에는 없음)
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(/memberCounts: \(window\.BSA && window\.BSA\.memberCount\) \? window\.BSA\.memberCount\.packFor/.test(app), '층 묶음에 실음');
assert.ok(/window\.BSA\.memberCount\.mergePackIntoState\(window\.state, floorKey, bundle\.memberCounts/.test(app), '받을 때 합침');
assert.ok(/memberCounts: window\.state\.memberCounts \|\| \{\}/.test(app), '기기에 저장');
assert.ok(app.indexOf("state.mode === 'COUNT'") > 0 && app.indexOf('syncMemberCountOverlay') > 0);
const safe = app.slice(app.indexOf('function drawPinSafe('), app.indexOf('function drawPinSafe(') + 6000);
assert.ok(!/memberCount/i.test(safe), '보고서 그림엔 안 넣음');
assert.ok(!/memberCount/i.test(app.slice(app.indexOf('function drawMemosForReport'), app.indexOf('function drawMemosForReport') + 1500)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/member-count.js') > 0 && html.indexOf('js/core/member-count.js') < html.indexOf('src="app.js'));
assert.ok(html.indexOf('id="btnModeCount"') > 0 && html.indexOf('id="mobileBtnModeCount"') > 0);
console.log('test-member-count: ok');
