/* 평가단위(상태평가용, 2026-10-13)
 * 건물 설정(단위 개수·층별 통째/나누기) + 나눈 층의 세부단위(1-1, 1-2) + 결함 분류 + 동기화 합치기
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const SM = require(path.join(root, 'js', 'core', 'sync-merge.js'));

const bldg = { id: 'b1' };
assert.ok(!E.hasPlan(bldg));
assert.strictEqual(E.setUnitCount(bldg, 3, 1000), 0);
assert.deepStrictEqual(E.planOf(bldg).units.map((u) => u.name), ['평가단위 1', '평가단위 2', '평가단위 3']);
assert.ok(E.setFloorMode(bldg, '1F', 'whole', 'unit1', 1001));
assert.ok(E.setFloorMode(bldg, '2F', 'whole', 'unit1', 1002));
assert.ok(E.setFloorMode(bldg, '3F', 'split', null, 1003));
assert.ok(E.setFloorMode(bldg, 'B1', 'whole', 'unit3', 1004));
assert.ok(!E.setFloorMode(bldg, '4F', 'whole', 'nope', 1005), '없는 단위 거부');
assert.ok(bldg.evalUnitPlan.updatedAt >= 1004);

// 나눈 층: 세부단위 이름은 단위번호-k
const st = { defects: {
    b1_1F: [{ id: 'a' }, { id: 'b' }],
    b1_2F: [{ id: 'c' }],
    b1_3F: [{ id: 'd', updatedAt: 1 }, { id: 'e', updatedAt: 1 }, { id: 'f', updatedAt: 1 }],
    b1_B1: []
} };
const s11 = E.createSubUnit(st, 'b1_3F', bldg, 'unit1', 2000);
const s12 = E.createSubUnit(st, 'b1_3F', bldg, 'unit1', 2001);
const s21 = E.createSubUnit(st, 'b1_3F', bldg, 'unit2', 2002);
assert.deepStrictEqual([s11.name, s12.name, s21.name], ['1-1', '1-2', '2-1']);
assert.strictEqual(s21.parentUnitId, 'unit2');
assert.strictEqual(E.assign([st.defects.b1_3F[0], st.defects.b1_3F[1]], s11.id, 3000), 2);
assert.strictEqual(E.assign([st.defects.b1_3F[2]], s21.id, 3000), 1);
assert.ok(st.defects.b1_3F[0].updatedAt >= 3000, '결함 updatedAt 올림');
assert.strictEqual(E.assign([st.defects.b1_3F[0]], s11.id, 4000), 0, '같으면 안 바꿈');

const floors = ['1F', '2F', '3F', 'B1', '4F'].map((fc) => ({ floorCode: fc, floorLabel: fc, floorKey: 'b1_' + fc }));
const sum = E.summarize(bldg, st, floors);
assert.deepStrictEqual(sum.units[0].wholeFloors.map((w) => w.floorCode + ':' + w.count), ['1F:2', '2F:1']);
assert.deepStrictEqual(sum.units[0].subUnits.map((s) => s.sub.name + ':' + s.count), ['1-1:2', '1-2:0']);
assert.deepStrictEqual(sum.units[1].subUnits.map((s) => s.sub.name + ':' + s.count), ['2-1:1']);
assert.deepStrictEqual(sum.units[2].wholeFloors.map((w) => w.floorCode), ['B1']);
assert.deepStrictEqual(sum.unsetFloors.map((f) => f.floorCode), ['4F']);
assert.deepStrictEqual(sum.unassigned, []);

// 세부단위 지우면 결함은 미지정으로
assert.strictEqual(E.deleteUnit(st, 'b1_3F', s21.id, st.defects.b1_3F, 5000), 1);
assert.ok(!('evalUnitId' in st.defects.b1_3F[2]));
assert.deepStrictEqual(E.summarize(bldg, st, floors).unassigned.map((u) => u.floorCode + ':' + u.count), ['3F:1']);

// 개수 줄이면 그 단위를 통째로 쓰던 층은 설정 안 함
assert.strictEqual(E.setUnitCount(bldg, 2, 6000), 1);
assert.strictEqual(E.floorMode(bldg, 'B1'), null);
assert.strictEqual(E.floorMode(bldg, '1F').unitId, 'unit1');

// 동기화: 층 묶음 합치기(묘비 포함)
const other = { evalUnits: {}, deletedEvalUnitIds: {}, deletedEvalUnitAt: {} };
E.mergePackIntoState(other, 'b1_3F', E.packFor(st, 'b1_3F'), SM.mergeNdtDataMaps);
assert.deepStrictEqual(E.listFor(other, 'b1_3F').map((u) => u.name), ['1-1', '1-2']);
assert.strictEqual(E.listFor(other, 'b1_3F')[0].parentUnitId, 'unit1');
assert.ok(!E.listFor(other, 'b1_3F').some((u) => u.id === s21.id), '지운 세부단위 안 살아남');
assert.ok(!E.packHasContent(E.packFor({}, 'x')));

// 건물 정보 동기화 키 + 앱 연결
const meta = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));
assert.ok((meta.KEYS || []).includes('evalUnitPlan'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(/evalUnits: \(window\.BSA && window\.BSA\.evalUnits\) \? window\.BSA\.evalUnits\.packFor/.test(app), '층 묶음에 실음');
assert.ok(/window\.BSA\.evalUnits\.mergePackIntoState\(window\.state, floorKey, bundle\.evalUnits/.test(app), '받을 때 합침');
assert.ok(/drawEvalUnitTag\(ctx, defect, w, h, scale\); \/\/ 화면 전용/.test(app), '화면에만 꼬리표');
const safe = app.slice(app.indexOf('function drawPinSafe('), app.indexOf('function drawPinSafe(') + 6000);
assert.ok(!/drawEvalUnitTag/.test(safe), '보고서 그림엔 안 넣음');

// 2026-10-13 개편: 건물 부분(기존부/증축부) + 층 × 부분 → 평가단위, 옛 세부단위 옮기기
(function () {
    const b = { id: 'b2' };
    E.setUnitCount(b, 2, 1);
    E.setFloorMode(b, '3F', 'split', null, 2);
    const s = { defects: { b2_3F: [{ id: 'd' }, { id: 'e' }] } };
    const z11 = E.createSubUnit(s, 'b2_3F', b, 'unit1', 3);
    const z21 = E.createSubUnit(s, 'b2_3F', b, 'unit2', 4);
    E.assign([s.defects.b2_3F[0]], z11.id, 5);
    E.assign([s.defects.b2_3F[1]], z21.id, 5);
    const fl = [{ floorCode: '1F', floorLabel: '1F', floorKey: 'b2_1F' }, { floorCode: '2F', floorLabel: '2F', floorKey: 'b2_2F' }, { floorCode: '3F', floorLabel: '3F', floorKey: 'b2_3F' }];
    const before = E.summarize(b, s, fl);
    const r = E.migrateLegacy(b, s, fl, 6);
    assert.ok(r.planChanged && r.floorKeys[0] === 'b2_3F');
    assert.deepStrictEqual(E.planOf(b).parts.map((p) => p.name + ':' + p.unitId), ['1-1:unit1', '2-1:unit2']);
    assert.strictEqual(E.floorParts(b, '3F').length, 2);
    assert.strictEqual(s.defects.b2_3F[0].evalUnitId, z11.id, '결함 그대로');
    const after = E.summarize(b, s, fl);
    assert.deepStrictEqual(after.units.map((u) => u.subUnits.map((x) => x.label + x.count)), before.units.map((u) => u.subUnits.map((x) => x.sub.name + x.count)));
    assert.ok(!E.migrateLegacy(b, s, fl, 7).planChanged, '두 번째는 할 일 없음');
    // 부분 추가: 기본 단위 = 같은 번호
    const ext = E.addPart(b, { name: '증축부', note: '철골' }, 8);
    assert.strictEqual(ext.unitId, 'unit1'); // 3번째 부분 → 단위 3 없음 → 첫 단위
    assert.ok(!E.addPart(b, { name: '증축부' }, 9), '이름 겹침');
    E.setFloorParts(b, '1F', [ext.id], 10);
    E.setFloorParts(b, '2F', [ext.id], 11);
    assert.strictEqual(E.ensureZones(s, 'b2_1F', b, '1F', 12), 1);
    assert.strictEqual(E.ensureZones(s, 'b2_1F', b, '1F', 13), 0);
    E.ensureZones(s, 'b2_2F', b, '2F', 14);
    // 다른 층 구역끼리 같은 단위, 부분의 단위를 바꾸면 같이 움직임
    E.updatePart(b, ext.id, { unitId: 'unit2' }, 15);
    const u2 = E.summarize(b, s, fl).units[1].subUnits.map((x) => x.floorLabel + '-' + x.label);
    assert.deepStrictEqual(u2, ['1F-증축부', '2F-증축부', '3F-2-1']);
    const m = E.matrix(b, s, fl);
    assert.ok(m[0].cells[ext.id].on && m[0].cells[ext.id].unitId === 'unit2');
    // 부분 지우기 → 층 목록에서 빠지고, 그 구역 결함은 단위 없음(unassigned)
    s.defects.b2_1F = [{ id: 'q', evalUnitId: E.zoneForPart(s, 'b2_1F', ext.id).id }];
    E.removePart(b, ext.id, 16);
    assert.deepStrictEqual(E.floorParts(b, '1F'), []);
    assert.ok(E.summarize(b, s, fl).unassigned.some((x) => x.floorCode === '1F' && x.count === 1));
    // 단위 줄이면 그 단위 부분은 단위 없음
    E.setUnitCount(b, 1, 17);
    assert.strictEqual(E.planOf(b).parts.find((p) => p.name === '2-1').unitId, '');
})();

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/eval-units.js') > 0 && html.indexOf('js/core/eval-units.js') < html.indexOf('src="app.js'));
console.log('test-eval-units: OK');
