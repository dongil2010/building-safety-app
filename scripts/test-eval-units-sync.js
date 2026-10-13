'use strict';
// 평가단위 지정이 사라지던 문제(2026-10-13): 기기마다 다른 구역 id · 지정이 updatedAt만 올려 칸별 병합에서 서버 옛 값이 이김
const assert = require('assert');
const path = require('path');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const EM = require(path.join(root, 'js', 'core', 'eval-member.js'));
const SM = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const S = require(path.join(root, 'js', 'core', 'safetyman-export.js'));

const plan = () => { const b = { id: 'b' }; E.setUnitCount(b, 3, 1); E.setFloorMode(b, '1F', 'split', null, 1); E.setFloorParts(b, '1F', ['z1', 'z3'], 1); return b; };
// 1) 두 기기가 따로 구역을 만들어도 같은 id
const bA = plan(), bB = plan();
const sA = { evalUnits: {}, defects: { b_1F: [] } }, sB = { evalUnits: {}, defects: { b_1F: [] } };
E.ensureZones(sA, 'b_1F', bA, '1F', 100);
E.ensureZones(sB, 'b_1F', bB, '1F', 999);
assert.deepStrictEqual(E.listFor(sA, 'b_1F').map((z) => z.id), ['ez_z1', 'ez_z3']);
assert.deepStrictEqual(E.listFor(sA, 'b_1F').map((z) => z.id), E.listFor(sB, 'b_1F').map((z) => z.id));
assert.ok(E.packFor(sA, 'b_1F').items.every((z) => z.partId), 'partId도 묶음에 실림');

// 2) 지정은 칸 시각(contentUpdatedAt·fieldAt)을 올려 옛 서버 값을 이긴다
const server = { id: 'd1', defectType: '균열', updatedAt: 1000, contentUpdatedAt: 1000, fieldAt: { defectType: 1000 }, contentBaseAt: 900, fieldAtThrough: 1000 };
const local = JSON.parse(JSON.stringify(server));
const z3 = E.zoneForPart(sA, 'b_1F', 'z3');
assert.strictEqual(E.assign([local], z3.id, 2000, { partId: z3.partId }), 1);
assert.strictEqual(local.evalPart, 3);
assert.ok(local.contentUpdatedAt >= 2000 && local.fieldAt.evalUnitId >= 2000 && local.fieldAtThrough >= 2000);
EM.assign([local], '기둥', 2100);
assert.ok(local.fieldAt.evalMember >= 2100 && local.contentUpdatedAt >= 2100);
const m = SM.mergeDefectRecord(server, local);
assert.strictEqual(m.evalUnitId, 'ez_z3', '서버 옛 값이 지정을 지우지 않음');
assert.strictEqual(m.evalMember, '기둥');
assert.strictEqual(m.evalPart, 3);
// 반대로 서버 쪽이 나중에 지정한 경우에도 서버 지정이 남는다
const m2 = SM.mergeDefectRecord(local, server);
assert.strictEqual(m2.evalUnitId, 'ez_z3');
// 다른 칸을 서버가 나중에 고쳐도 지정은 유지(칸별)
const srv2 = Object.assign({}, server, { memo: '서버 메모', updatedAt: 3000, contentUpdatedAt: 3000, fieldAt: Object.assign({}, server.fieldAt, { memo: 3000 }), fieldAtThrough: 3000 });
const m3 = SM.mergeDefectRecord(srv2, local);
assert.strictEqual(m3.evalUnitId, 'ez_z3'); assert.strictEqual(m3.memo, '서버 메모');

// 3) 옛(무작위 id) 구역 + 새 기기 구역이 겹치면 정해진 id를 남기고 옛 id는 aliases — 결함은 안 고쳐도 찾음
const b = plan();
const s = { evalUnits: { b_1F: [{ id: 'eu_old_rand', name: '3', partId: 'z3', order: 0, createdAt: 1, updatedAt: 1 }, { id: 'ez_z3', name: '3(2)', partId: 'z3', order: 1, createdAt: 2, updatedAt: 2 }] },
    defects: { b_1F: [{ id: 'k1', evalUnitId: 'eu_old_rand', updatedAt: 5 }, { id: 'k2', evalPart: 3, evalUnitId: 'eu_gone' }] } };
const fl = [{ floorCode: '1F', floorLabel: '1F', floorKey: 'b_1F' }];
E.normalize(b, s, fl, 50);
const zs = E.listFor(s, 'b_1F').filter((z) => z.partId === 'z3');
assert.strictEqual(zs.length, 1); assert.strictEqual(zs[0].id, 'ez_z3');
assert.ok(zs[0].aliases.includes('eu_old_rand'));
assert.strictEqual(s.defects.b_1F[0].evalUnitId, 'eu_old_rand', '결함 자료는 그대로');
assert.strictEqual(s.defects.b_1F[0].updatedAt, 5);
assert.strictEqual(E.resolveZoneId(s, 'b_1F', s.defects.b_1F[0]), 'ez_z3', 'aliases로 찾음');
assert.strictEqual(E.resolveZoneId(s, 'b_1F', s.defects.b_1F[1]), 'ez_z3', 'evalPart로 찾음');
assert.strictEqual(E.counts(s, 'b_1F', s.defects.b_1F).byId.ez_z3, 2);
// 출력(SafetyMan 표본)도 같은 규칙
const samples = S.buildSamples(b, s, fl, E).filter((x) => x.unitId);
const u3 = samples.find((x) => x.subName === '3');
assert.ok(u3 && u3.defects.length === 2, '엑셀 표본에도 두 결함');
console.log('test-eval-units-sync: ok');
