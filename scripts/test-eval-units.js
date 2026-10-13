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

// 2026-10-13 단순화: 구역 = 번호 1,2,3…(같은 번호 = 같은 평가단위), 옛 1-1/1-2·이름 부분 → 번호
(function () {
    const b = { id: 'b2' };
    E.setUnitCount(b, 2, 1);
    assert.deepStrictEqual(E.planOf(b).parts.map((p) => p.id + ':' + p.unitId), ['z1:unit1', 'z2:unit2']);
    E.setFloorMode(b, '3F', 'split', null, 2);
    const s = { defects: { b2_3F: [{ id: 'd' }, { id: 'e' }] } };
    const z11 = E.createSubUnit(s, 'b2_3F', b, 'unit1', 3);
    const z12 = E.createSubUnit(s, 'b2_3F', b, 'unit1', 4);
    E.assign([s.defects.b2_3F[0]], z11.id, 5);
    E.assign([s.defects.b2_3F[1]], z12.id, 5);
    const fl = ['1F', '2F', '3F'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b2_' + c }));
    const r = E.normalize(b, s, fl, 6);
    assert.deepStrictEqual(r.floorKeys, ['b2_3F']);
    assert.deepStrictEqual(E.listFor(s, 'b2_3F').map((z) => z.name + ':' + z.partId), ['1:z1', '2:z2'], '1-1→1, 1-2→2');
    assert.deepStrictEqual(E.floorParts(b, '3F'), ['z1', 'z2']);
    assert.strictEqual(s.defects.b2_3F[0].evalUnitId, z11.id, '결함 그대로');
    assert.strictEqual(E.zoneUnitId(b, z12), 'unit2');
    const again = E.normalize(b, s, fl, 7);
    assert.ok(!again.planChanged && !again.floorKeys.length, '두 번째는 할 일 없음');
    // 다른 층도 같은 번호 → 같은 평가단위
    E.setFloorParts(b, '1F', ['z2'], 8);
    E.ensureZones(s, 'b2_1F', b, '1F', 9);
    assert.strictEqual(E.zoneForPart(s, 'b2_1F', 'z2').name, '2');
    const u2 = E.summarize(b, s, fl).units[1].subUnits.map((x) => x.floorLabel + '-' + x.label);
    assert.deepStrictEqual(u2, ['1F-2', '3F-2']);
    assert.ok(E.matrix(b, s, fl)[0].cells.z2.on);
    // 이름(선택)
    assert.ok(E.setUnitLabel(b, 'unit1', '기존부', 10));
    assert.strictEqual(E.unitTitle(E.planUnit(b, 'unit1')), '평가단위 1 기존부');
    assert.strictEqual(E.zoneLabel(b, z11), '1');
    // 지난 판(이름 부분 기존부/증축부) → 번호, 이름은 단위 label
    const b3 = { id: 'b3', evalUnitPlan: { units: [{ id: 'unit1', no: 1, name: '평가단위 1' }, { id: 'unit2', no: 2, name: '평가단위 2' }],
        parts: [{ id: 'part_a', no: 1, name: '기존부', unitId: 'unit1' }, { id: 'part_b', no: 2, name: '증축부', unitId: 'unit2' }],
        floors: { '1F': { mode: 'split', parts: ['part_a', 'part_b'] } }, updatedAt: 1 } };
    const s3 = { evalUnits: { b3_1F: [{ id: 'q1', name: '기존부', partId: 'part_a' }, { id: 'q2', name: '증축부', partId: 'part_b' }] }, defects: { b3_1F: [{ id: 'k', evalUnitId: 'q2' }] } };
    E.normalize(b3, s3, [{ floorCode: '1F', floorLabel: '1F', floorKey: 'b3_1F' }], 20);
    assert.deepStrictEqual(E.floorParts(b3, '1F'), ['z1', 'z2']);
    assert.deepStrictEqual(s3.evalUnits.b3_1F.map((z) => z.partId), ['z1', 'z2']);
    assert.strictEqual(E.planUnit(b3, 'unit2').label, '증축부');
    assert.strictEqual(E.zoneUnitId(b3, s3.evalUnits.b3_1F[1]), 'unit2');
    // 번호 늘리기: 옛 번호가 단위보다 크면 단위 개수를 늘린다
    const b4 = { id: 'b4' };
    E.setUnitCount(b4, 1, 1);
    E.setFloorMode(b4, '1F', 'split', null, 2);
    const s4 = { evalUnits: { b4_1F: [{ id: 'w', name: '1-3', parentUnitId: 'unit1' }] }, defects: {} };
    E.normalize(b4, s4, [{ floorCode: '1F', floorLabel: '1F', floorKey: 'b4_1F' }], 3);
    assert.strictEqual(E.planOf(b4).units.length, 3);
    assert.strictEqual(s4.evalUnits.b4_1F[0].partId, 'z3');
})();

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.indexOf('js/core/eval-units.js') > 0 && html.indexOf('js/core/eval-units.js') < html.indexOf('src="app.js'));
console.log('test-eval-units: OK');
