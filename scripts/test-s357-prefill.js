/* SAFETY357 평가 탭 자동 채움(2026-10-13): 평가 부재 지정·확인부재 수·결함 등급별 부재 수, 고친 칸 유지 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'js', 'core', 'eval-units.js'));
const S = require(path.join(root, 'js', 'core', 'safetyman-export.js'));
const MC = require(path.join(root, 'js', 'core', 'member-count.js'));
const EM = require(path.join(root, 'js', 'core', 'eval-member.js'));
const P = require(path.join(root, 'js', 'core', 's357-prefill.js'));

// 평가 부재: 확정 우선, 없으면 부재 글로 추정, 결함의 부재 글은 그대로
const d0 = { id: 'x', component: '보(G)', updatedAt: 1 };
assert.deepStrictEqual(EM.stateOf(d0), { type: '거더', confirmed: false });
assert.strictEqual(EM.assign([d0], '빔', 5), 1);
assert.deepStrictEqual(EM.stateOf(d0), { type: '빔', confirmed: true });
assert.strictEqual(d0.component, '보(G)');
assert.ok(d0.updatedAt >= 5);
assert.strictEqual(EM.assign([d0], '', 6), 1);
assert.strictEqual(d0.evalMember, undefined);
assert.strictEqual(EM.stateOf({ component: '계단' }).type, null);
const sum = EM.summarize([{ component: '기둥' }, { component: '?', evalMember: '벽' }, { component: '?' }]);
assert.strictEqual(sum.byType['기둥'].guessed, 1);
assert.strictEqual(sum.byType['벽'].confirmed, 1);
assert.strictEqual(sum.none, 1);

// 등급 구간(SAFETY357 createMemberDetail 기준과 같게)
const cls = (d) => P.classify(d, S);
assert.deepStrictEqual(cls({ defectType: '균열', crackWidth: '0.05' }), { field: 'crackGrades', grade: 'A' });
assert.strictEqual(cls({ defectType: '균열', crackWidth: '0.1' }).grade, 'B');
assert.strictEqual(cls({ defectType: '균열', crackWidth: '0.25' }).grade, 'C');
assert.strictEqual(cls({ defectType: '균열', crackWidth: '0.3' }).grade, 'D');
assert.strictEqual(cls({ defectType: '균열', crackWidth: '0.5' }).grade, 'E');
assert.strictEqual(cls({ defectType: '균열' }).grade, null);
assert.strictEqual(cls({ defectType: '누수' }).field, 'leakGrades');
assert.strictEqual(cls({ defectType: '백태' }).field, 'leakGrades');
assert.strictEqual(cls({ defectType: '철근노출' }).field, 'rebarGrades');
assert.strictEqual(cls({ defectType: '박락', size: '깊이 22' }).grade, 'D');
assert.strictEqual(cls({ defectType: '박리' }).field, 'spallingGrades');
assert.strictEqual(P.floorNumber('B2', 0), -2);
assert.strictEqual(P.floorNumber('3F', 0), 3);

// 단위 1 = 1층 전체
const bldg = { id: 'b', name: '본관', floorsList: [{ floorCode: '1F', floorLabel: '1층' }] };
E.setUnitCount(bldg, 1, 1);
const u = E.planOf(bldg).units[0];
E.setFloorMode(bldg, '1F', 'whole', u.id, 1);
const st = { defects: { b_1F: [
    { id: 'a', no: 1, component: '기둥', defectType: '균열', crackWidth: '0.25' },
    { id: 'c', no: 2, component: '기둥', defectType: '균열', crackWidth: '0.4' },
    { id: 'e', no: 3, component: 'C1', defectType: '누수', evalMember: '벽' },
    { id: 'f', no: 4, component: '계단', defectType: '균열', crackWidth: '0.3' },
    { id: 'g', no: 5, component: '슬래브', defectType: '균열' }
] } };
MC.add(st, 'b_1F', '기둥', 1, 1); MC.add(st, 'b_1F', '기둥', 2, 1); MC.add(st, 'b_1F', '벽', 3, 1);
const floors = [{ floorCode: '1F', floorLabel: '1층', floorKey: 'b_1F' }];
const calc = P.computeAuto({ bldg, state: st, floors, E, S, MC, EM });
const B = P.bid(bldg.id), F = P.fid(u.id);
assert.deepStrictEqual(calc.units.map((x) => [x.id, x.nos]), [[F, [1]]]);
assert.strictEqual(calc.building.id, B);
assert.strictEqual(calc.auto[`${B}|${F}|기둥|memberTotalCount`], 2);
assert.strictEqual(calc.auto[`${B}|${F}|내력벽|memberTotalCount`], 1);
assert.strictEqual(calc.auto[`${B}|${F}|기둥|crackGrades|C`], 1);
assert.strictEqual(calc.auto[`${B}|${F}|기둥|crackGrades|D`], 1);
assert.strictEqual(calc.auto[`${B}|${F}|내력벽|leakGrades|B`], 1);
assert.deepStrictEqual(calc.issues[u.id], { noMember: 1, noWidth: 1, assumed: 1, defects: 5 });

// 가짜 SAFETY357 공장(실제 번들은 같은 모양)
const rows = () => ['A', 'B', 'C', 'D', 'E'].map((g) => ({ grade: g, count: 0, label: g }));
const Fac = {
    createEmptyProject: (n) => ({ version: 1, format: 'safetyman', name: n, buildings: [] }),
    createEmptyBuilding: (n) => ({ id: 'tmp', name: n, sampleFloors: [] }),
    createSampleFloor: (o) => ({ id: 'tmp', sampleFloor: o.sampleFloor, startFloor: o.startFloor, endFloor: o.endFloor, details: [] }),
    createMemberDetail: (m) => ({ memberType: m, memberTotalCount: 0, crackGrades: rows(), leakGrades: rows(), rebarGrades: rows(), spallingGrades: rows(), scalingGrades: rows() })
};
let r = P.merge(null, null, calc, Fac);
const det = (proj, m) => proj.buildings[0].sampleFloors[0].details.find((d) => d.memberType === m);
assert.strictEqual(r.project.buildings[0].id, B);
assert.strictEqual(r.project.buildings[0].sampleFloors[0].sampleFloor, 1);
assert.strictEqual(r.project.buildings[0].sampleFloors[0].details.length, 5);
assert.strictEqual(det(r.project, '기둥').memberTotalCount, 2);
assert.strictEqual(det(r.project, '기둥').crackGrades.find((x) => x.grade === 'C').count, 1);
// 사용자가 기둥 총수를 10으로 고침 → 점이 늘어도 10 유지, 고치지 않은 벽 총수는 따라감
det(r.project, '기둥').memberTotalCount = 10;
MC.add(st, 'b_1F', '기둥', 4, 1); MC.add(st, 'b_1F', '벽', 5, 1);
const calc2 = P.computeAuto({ bldg, state: st, floors, E, S, MC, EM });
const r2 = P.merge(r.project, r.auto, calc2, Fac);
assert.strictEqual(det(r2.project, '기둥').memberTotalCount, 10);
assert.strictEqual(det(r2.project, '내력벽').memberTotalCount, 2);
// 결함이 사라지면 자동 칸은 0으로
st.defects.b_1F = st.defects.b_1F.filter((d) => d.id !== 'a');
const r3 = P.merge(r2.project, r2.auto, P.computeAuto({ bldg, state: st, floors, E, S, MC, EM }), Fac);
assert.strictEqual(det(r3.project, '기둥').crackGrades.find((x) => x.grade === 'C').count, 0);
assert.strictEqual(det(r3.project, '기둥').memberTotalCount, 10);

// 확인부재는 점/입력만 — 결함으로 늘리지 않음. 양호(A) = 총수 − 결함(B~E), 최소 0
const gA = (d, f) => d[f].find((x) => x.grade === 'A').count;
assert.strictEqual(gA(det(r3.project, '기둥'), 'crackGrades'), 10 - 1);
assert.strictEqual(gA(det(r3.project, '기둥'), 'leakGrades'), 10);
assert.strictEqual(gA(det(r3.project, '내력벽'), 'leakGrades'), 2 - 1);
assert.deepStrictEqual(P.check(r3.project), []);
{
    const pj = JSON.parse(JSON.stringify(r3.project));
    const dw = det(pj, '내력벽');
    dw.crackGrades.find((x) => x.grade === 'B').count = 5; // 총 2 < 결함 5
    P.syncGradeA(pj);
    assert.strictEqual(dw.memberTotalCount, 2, '총수 자동으로 올리지 않음');
    assert.strictEqual(gA(dw, 'crackGrades'), 0);
    const w = P.check(pj);
    assert.strictEqual(w.length, 1);
    assert.deepStrictEqual([w[0].member, w[0].field, w[0].total, w[0].defects], ['내력벽', 'crackGrades', 2, 5]);
    // 총수 0인데 결함 있음 → 경고, A 손대지 않음
    const ds = det(pj, '슬래브');
    ds.rebarGrades.find((x) => x.grade === 'B').count = 1;
    assert.ok(P.check(pj).some((x) => x.member === '슬래브' && x.total === 0));
    assert.strictEqual(P.WARN_TEXT, '부재 수가 결함 수보다 적어요');
}

// 지상·지하 층수: 건물 전체 층 목록에서, 비어 있을 때만
assert.strictEqual(calc.floorsAbove, 1); assert.strictEqual(calc.floorsBelow, 0);
assert.strictEqual(r.project.buildings[0].floorsAbove, 1);
assert.strictEqual(r.project.buildings[0].floorsBelow, 0);
{
    const fl5 = ['B1', '1F', '2F', '3F', '4F', 'RF'].map((c) => ({ floorCode: c, floorLabel: c, floorKey: 'b_' + c }));
    const c5 = P.computeAuto({ bldg, state: st, floors: fl5, E, S, MC, EM });
    assert.deepStrictEqual([c5.floorsAbove, c5.floorsBelow], [4, 1], 'RF(숫자 없음)는 세지 않음');
    const pj = JSON.parse(JSON.stringify(r.project));
    pj.buildings[0].floorsAbove = 7; pj.buildings[0].floorsBelow = '';
    const m5 = P.merge(pj, r.auto, c5, Fac).project.buildings[0];
    assert.strictEqual(m5.floorsAbove, 7, '사용자 값 유지');
    assert.strictEqual(m5.floorsBelow, 1, '빈칸만 채움');
}

// 화면 연결: 스크립트 순서, 번들, 템플릿
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const at = (s) => html.indexOf(s);
assert.ok(at('js/core/eval-member.js') > at('js/core/safetyman-export.js') && at('js/core/s357-prefill.js') > 0 && at('js/core/s357-prefill.js') < at('src="app.js'));
assert.ok(at('id="evalMapSlot"') > 0 && at('id="evalS357Host"') > 0);
assert.ok(fs.existsSync(path.join(root, 'vendor', 'safety357', 'safety357.js')));
assert.ok(fs.existsSync(path.join(root, 'vendor', 'eval', 'templates', 'eval-template.xlsx')));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.ok(app.includes("'evalSafetyman'"));
assert.ok(app.includes('function openMcDotMenu') && app.includes('function mcOffZoneDots') && app.includes('map-count-zone-badge'));
assert.ok(fs.readFileSync(path.join(root, 'js', 'core', 'building-meta-merge.js'), 'utf8').includes("'evalSafetyman'"));
assert.ok(!fs.existsSync(path.join(root, 'vendor', 'safety357', 'templates')));
assert.ok(fs.readFileSync(path.join(root, 'vendor', 'safety357', 'safety357.js'), 'utf8').includes('vendor/eval/templates/eval-template.xlsx'));
// GitHub Pages 배포 목록에 vendor(번들·양식)가 있어야 함 — 빠지면 평가 탭 「SAFETY357 화면을 불러오지 못했습니다」
assert.ok(/DIRS\s*=\s*\[[^\]]*"vendor"/.test(fs.readFileSync(path.join(root, 'scripts', 'prepare-pages.py'), 'utf8')));
assert.ok(app.includes('if (window.__bsaEvalMapOn !== true) return; // 결함위치도 탭'));
console.log('test-s357-prefill: ok');
