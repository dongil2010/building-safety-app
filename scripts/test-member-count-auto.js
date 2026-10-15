'use strict';
const assert = require('assert');
const MC = require('../js/core/member-count.js');
const FK = 'b1_1F';
const D = (id, component, defectType, x, y, extra) => Object.assign({ id, category: '구조체', component, defectType, targetX: x, targetY: y }, extra || {});
const st = {
    memberCounts: { [FK]: [{ id: 'm1', type: '기둥', x: 1000, y: 1000, createdAt: 1, updatedAt: 1 }] },
    defects: { [FK]: [
        D('d1', '기둥', '균열', 1010, 1005),                 // 손 점 m1 근처 → 안 셈
        D('d2', '기둥', '기둥 상태양호', 2000, 1000),         // 양호 → 기둥 +1
        D('d3', 'RC기둥', '철근노출', 3000, 1000),            // 구조 결함 → 기둥 +1
        D('d4', 'RC기둥', '박락', 3015, 1010),                // d3 과 같은 기둥 → 합침
        D('d5', '보(G)', '균열', 500, 500),                    // 거더 +1
        D('d6', '보(B)', '백태', 800, 500),                    // 빔 +1
        D('d7', '슬래브', '누수', 900, 900, { groupId: 'g1' }), // 슬래브 +1
        D('d8', '슬래브', '누수', 1500, 900, { groupId: 'g1' }),// 같은 그룹 → 합침
        D('d9', '슬래브', '도장 오염', 4000, 4000),            // 구조 결함 아님 → 안 셈
        D('d10', '기둥-조적벽체 접합부', '균열', 100, 100),     // 접합부 → 안 셈
        D('d11', '기둥-보 접합부', '접합부 상태양호', 120, 100),// 접합부 → 안 셈
        D('d12', '보', '균열', 200, 200),                      // G/B 미지정 → 안 셈
        D('d13', '조적벽체', '균열', 300, 300, { category: '비구조체' }), // 비구조체 → 안 셈
        D('d14', '도장', '박리', 300, 300, { category: '마감재' }),       // 마감재 → 안 셈
        D('d15', '벽체', '균열', 600, 700),                    // 벽 +1
        D('d16', '기둥', '균열', 7000, 7000, { mapUnregistered: true }) // 도면에 없는 행 → 안 셈
    ] }
};
const all = MC.listWithAuto(st, FK);
const c = MC.countsByType(all);
assert.deepStrictEqual(c, { '기둥': 3, '벽': 1, '거더': 1, '빔': 1, '슬래브': 1 }, JSON.stringify(c));
assert.strictEqual(all.filter((d) => d.auto).length, 6);
assert.deepStrictEqual(MC.listFor(st, FK).length, 1, '손 점은 그대로(저장 안 바뀜)');
// 마킹을 지우면 바로 빠짐
st.defects[FK] = st.defects[FK].filter((d) => d.id !== 'd2');
assert.strictEqual(MC.countsByType(MC.listWithAuto(st, FK))['기둥'], 2);
// 구역 번호
const z = MC.autoDots([D('z1', '기둥', '균열', 0, 0)], [], { zoneNoOf: () => 2 });
assert.strictEqual(z[0].zoneNo, 2);
// 보수완료 = 양호로 셈(구조 결함 낱말 없어도)
{ const s2 = { memberCounts: {}, defects: { [FK]: [D('r1', '기둥', '보수완료', 10, 10), D('r2', '보(G)', '보수 완료', 900, 10), D('r3', '슬래브', '도장 오염', 2000, 10)] } };
  const c2 = MC.countsByType(MC.listWithAuto(s2, FK)); assert.strictEqual(c2['기둥'], 1); assert.strictEqual(c2['거더'], 1); assert.strictEqual(c2['슬래브'], 0); }
console.log('test-member-count-auto: ok');
