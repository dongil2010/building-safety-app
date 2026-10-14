'use strict';
const assert = require('assert');
const MC = require('../js/core/member-count.js');
const FK = 'b_1F';
const st = { memberCounts: {}, defects: { [FK]: [{ id: 'd1', category: '구조체', component: '기둥', defectType: '균열', targetX: 500, targetY: 500 }] } };
const m = MC.add(st, FK, '기둥', 100, 100);
assert.strictEqual(MC.countsByType(MC.listWithAuto(st, FK))['기둥'], 2);
// 자동 점 지우기 → 빼기 기록
const auto = MC.listWithAuto(st, FK).find((d) => d.auto);
const ex = MC.addExclude(st, FK, auto);
assert.ok(ex && ex.exclude);
assert.strictEqual(MC.countsByType(MC.listWithAuto(st, FK))['기둥'], 1, '자동 점 빠짐');
assert.strictEqual(MC.listFor(st, FK).length, 1, '빼기 기록은 손 점으로 안 셈');
assert.strictEqual(MC.packFor(st, FK).items.length, 2, '빼기 기록도 동기화 묶음에 실림');
// 되돌리기 = 빼기 기록 지우기
MC.remove(st, FK, ex.id);
assert.strictEqual(MC.countsByType(MC.listWithAuto(st, FK))['기둥'], 2);
// 손 점 지우기·되살리기
const r = MC.remove(st, FK, m.id);
assert.strictEqual(MC.listFor(st, FK).length, 0);
MC.add(st, FK, r.type, r.x, r.y, { id: r.id });
assert.strictEqual(MC.listFor(st, FK).length, 1);
assert.ok(!(st.deletedMemberCountIds[FK] || []).includes(r.id), '묘비 걷힘');
console.log('test-member-count-erase: ok');
