'use strict';
// 양호(A) 부재 수 스윕: 결함 부재는 고정, 확인부재(5..200)만 바꿔 점수가 어떻게 움직이는지
// 앱 경로(s357-prefill → A 자동) + EXE 참조(scoring-exe.js + 0x457639 최소범위 + 0x4577e3 균열면적 ×1.1)를
// SAFETY357 번들 로직(conditionAggregate.crackToCell + safetymanExe.rcMemberScore)이 만든 표(fixtures/s357-sweep.json)와 비교.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const P = require(path.join(root, 'js', 'core', 's357-prefill.js'));
const ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fixtures', 'scoring-exe.js'), 'utf8') + '\n;this.X={rcMemberScore,crackAreaFactor};', ctx);
const X = ctx.X;
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 's357-sweep.json'), 'utf8'));

// EXE 0x457639: 최소범위 = ceil(총수 × (기둥·내력벽 0.2, 그 밖 0.3)), 최소 1
const PT = { A: 1, B: 3, C: 5, D: 7, E: 9 };
function exeItem(rows, memberType, totalCount) {
    const nA = (rows.find((r) => r.grade === 'A') || { count: 0 }).count;
    const defects = [];
    ['E', 'D', 'C', 'B'].forEach((g) => { const r = rows.find((x) => x.grade === g); for (let i = 0; i < (r ? r.count : 0); i++) defects.push(PT[g]); });
    const total = nA + defects.length; // 확인부재 전부(양호 포함)
    assert.strictEqual(total, totalCount, '점수에 들어가는 부재 = 양호 + 결함 = 확인부재');
    const k = Math.max(1, Math.ceil(total * (memberType === '기둥' || memberType === '내력벽' ? 0.2 : 0.3)));
    const sum = defects.length <= k ? defects.reduce((s, v) => s + v, 0) + (k - defects.length) * PT.A : defects.slice(0, k).reduce((s, v) => s + v, 0);
    return Math.round((sum / k) * 100) / 100;
}

const rowsOf = () => ['A', 'B', 'C', 'D', 'E'].map((g) => ({ grade: g, count: 0 }));
const Fac = {
    createEmptyProject: (n) => ({ name: n, buildings: [] }),
    createEmptyBuilding: (n) => ({ id: 'tmp', name: n, sampleFloors: [] }),
    createSampleFloor: (o) => ({ id: 'tmp', sampleFloor: o.sampleFloor, details: [] }),
    createMemberDetail: (m) => ({ memberType: m, memberTotalCount: 0, crackGrades: rowsOf(), leakGrades: rowsOf(), rebarGrades: rowsOf(), spallingGrades: rowsOf(), scalingGrades: rowsOf() })
};
const table = {};
golden.forEach((g) => {
    const B = P.bid('b1'), F = P.fid('u1');
    const auto = {};
    auto[`${B}|${F}|${g.memberType}|memberTotalCount`] = g.total;
    Object.keys(g.defects).forEach((k) => { auto[`${B}|${F}|${g.memberType}|crackGrades|${k}`] = g.defects[k]; });
    const calc = { auto, building: { id: B, name: 't' }, units: [{ id: F, unitId: 'u1', name: '평가단위 1', nos: [1], floors: [{ floorKey: 'f1', no: 1, label: '1층' }] }], issues: {} };
    const pj = P.merge(null, null, calc, Fac).project;
    const d = pj.buildings[0].sampleFloors[0].details.find((x) => x.memberType === g.memberType);
    assert.strictEqual(d.crackGrades.find((r) => r.grade === 'A').count, g.nA, 'A = 확인부재 − 결함');
    assert.deepStrictEqual(P.check(pj), []);
    let item = exeItem(d.crackGrades, g.memberType, g.total);
    if (g.over > 0) item = Math.min(9, Math.round(item * X.crackAreaFactor(g.under, g.over) * 100) / 100);
    const member = Math.round(X.rcMemberScore([0, item, 0, 0, 0, 0]) * 1e6) / 1e6;
    assert.strictEqual(item, g.crack, `${g.case} total ${g.total}: 항목 ${item} ≠ SAFETY357 ${g.crack}`);
    assert.strictEqual(member, g.member, `${g.case} total ${g.total}: 부재 ${member} ≠ SAFETY357 ${g.member}`);
    (table[g.case] = table[g.case] || []).push(g);
});
// 양호 부재를 빼고(결함만으로) 매기지 않는다: 확인부재가 늘면 점수가 내려가야 한다
Object.values(table).forEach((list) => assert.ok(list[0].crack > list[list.length - 1].crack));
if (process.env.SWEEP_TABLE) Object.keys(table).forEach((k) => console.log(k, table[k].map((g) => `${g.total}:${g.crack}/${g.member}`).join(' ')));
console.log('test-s357-scoring-sweep: ok (' + golden.length + ')');
