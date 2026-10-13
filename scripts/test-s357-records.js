'use strict';
// 평가단위 = SafetyMan 층 기록 하나(시작층~끝층, 표본층 s) — EXE 0x40d34d: 기록마다 s로 층위치 가중치 하나
// SafetyMan 샘플(2026 정밀: 지상4·지하1, B1~1F s=-1 → 0.9, 2F~4F s=3 → 0.5)과 같은 구조가 나오는지
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const S = require(path.join(root, 'js', 'core', 'safetyman-export.js'));
const MC = require(path.join(root, 'js', 'core', 'member-count.js'));
const EM = require(path.join(root, 'js', 'core', 'eval-member.js'));
const P = require(path.join(root, 'js', 'core', 's357-prefill.js'));
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fixtures', 'scoring-exe.js'), 'utf8') + '\n;this.X={choquet,floorPositionDensity};', ctx);
const X = ctx.X;

const codes = ['B1', '1F', '2F', '3F', '4F'];
const bldg = { id: 'b', name: '은파', floorsList: codes.map((c) => ({ floorCode: c, floorLabel: c })) };
E.setUnitCount(bldg, 2, 1);
const [u1, u2] = E.planOf(bldg).units;
codes.forEach((c, i) => E.setFloorMode(bldg, c, 'whole', i < 2 ? u1.id : u2.id, 1));
const st = { defects: {} };
codes.forEach((c, i) => {
    st.defects['b_' + c] = [{ id: 'd' + i, no: 1, component: '기둥', evalMember: '기둥', defectType: '균열', crackWidth: '0.25' }];
    MC.add(st, 'b_' + c, '기둥', 1, 1); MC.add(st, 'b_' + c, '기둥', 2, 2);
});
const floors = codes.map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
const calc = P.computeAuto({ bldg, state: st, floors, E, S, MC, EM });
assert.deepStrictEqual([calc.floorsAbove, calc.floorsBelow], [4, 1]);
assert.deepStrictEqual(calc.units.map((u) => u.nos), [[-1, 1], [2, 3, 4]]);
const rows = () => ['A', 'B', 'C', 'D', 'E'].map((g) => ({ grade: g, count: 0 }));
const Fac = {
    createEmptyProject: (n) => ({ name: n, buildings: [] }),
    createEmptyBuilding: (n) => ({ id: 'tmp', name: n, floorsAbove: '', floorsBelow: '', sampleFloors: [] }),
    createSampleFloor: (o) => ({ id: 'tmp', sampleFloor: o.sampleFloor, startFloor: o.startFloor, endFloor: o.endFloor, details: [] }),
    createMemberDetail: (m) => ({ memberType: m, memberTotalCount: 0, crackGrades: rows(), leakGrades: rows(), rebarGrades: rows(), spallingGrades: rows(), scalingGrades: rows() })
};
// 지난 판(단위마다 건물)은 버림
const old = { name: '평가', buildings: [{ id: 'bsa-unit-' + u1.id, name: 'old', sampleFloors: [] }] };
let r = P.merge(old, { ['bsa-unit-x|y|기둥|memberTotalCount']: 3 }, calc, Fac);
assert.strictEqual(r.project.buildings.length, 1, '건물 하나');
const b = r.project.buildings[0];
assert.strictEqual(b.id, P.bid('b'));
assert.deepStrictEqual([b.floorsAbove, b.floorsBelow], [4, 1]);
assert.deepStrictEqual(b.sampleFloors.map((sf) => [sf.startFloor, sf.endFloor, sf.sampleFloor]), [[-1, 1, -1], [2, 4, 2]], '기록 = 평가단위, 표본층 기본 = 가장 낮은 층');
// 부재·결함은 단위의 층을 모두 더함
const col = (sf) => sf.details.find((d) => d.memberType === '기둥');
assert.strictEqual(col(b.sampleFloors[0]).memberTotalCount, 4);
assert.strictEqual(col(b.sampleFloors[1]).memberTotalCount, 6);
assert.strictEqual(col(b.sampleFloors[1]).crackGrades.find((g) => g.grade === 'C').count, 3);
assert.strictEqual(col(b.sampleFloors[1]).crackGrades.find((g) => g.grade === 'A').count, 3);
const w = (pj) => pj.buildings[0].sampleFloors.map((sf) => X.floorPositionDensity(sf.sampleFloor, 4, 1));
assert.deepStrictEqual(w(r.project), [0.9, 0.7]);
// 표본층 고르기: 2F~4F 단위의 표본층 3 → 0.5 (샘플과 같음). 범위 밖은 안 됨
assert.ok(P.setSampleFloor(r.project, P.fid(u2.id), 3));
assert.ok(!P.setSampleFloor(r.project, P.fid(u2.id), 7));
assert.deepStrictEqual(w(r.project), [0.9, 0.5]);
// 다시 합쳐도 고른 표본층 유지
r = P.merge(r.project, r.auto, calc, Fac);
assert.strictEqual(r.project.buildings[0].sampleFloors[1].sampleFloor, 3);
// 점수 요약은 SAFETY357 evaluateBuilding 결과 + 기록별 가중치
const Xs = { floorPositionDensity: X.floorPositionDensity, evaluateBuilding: (bb) => ({ floorScores: bb.sampleFloors.map((sf, i) => ({ floorId: sf.id, score: [2.96, 4.65][i], grade: 'B' })), statusScore: 3.81, averageScore: 2.96, statusGrade: 'B', overallGrade: 'B' }) };
const sum = P.scoreSummary(r.project, calc, Xs);
assert.deepStrictEqual(sum.units.map((u) => [u.startFloor, u.endFloor, u.sampleFloor, u.weight]), [[-1, 1, -1, 0.9], [2, 4, 3, 0.5]]);
// s0.sfm(SafetyMan): 기록 점수 2.96·4.65, 가중치 0.9·0.5 → 상태 3.81
assert.strictEqual(Math.round(X.choquet([2.96, 4.65], [0.9, 0.5]) * 100) / 100, 3.81);
console.log('test-s357-records: ok');
