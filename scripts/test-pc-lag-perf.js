'use strict';
// 2026-11-13 「컴터 프로그램 렉」: 도면 이동·마킹·입력창 타이핑이 느리던 원인들이 다시 들어오지 않게.
//  1) 아무 데서도 안 읽는 층 스냅샷(화면 전체 JPEG toDataURL)을 그리기·저장마다 만들지 않는다
//  2) 결함 입력 자동 적용은 조사표 탭을 보고 있을 때만 조사표를 다시 그린다
//  3) 마킹 그리기는 그룹 멤버를 한 번만 묶는다(마킹마다 층 전체를 훑지 않음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

assert.ok(!/floorSnapshots\[/.test(app), '층 스냅샷을 만들지 않는다');
assert.ok(!app.includes('captureFloorSnapshotNow('), '저장 때 스냅샷 없음');

const auto = extractFunction(app, 'function scheduleDefectAutoApply(');
assert.ok(/renderSurveyTable === 'function' && state\.currentTab === 'tab-survey'\) renderSurveyTable\(\)/.test(auto), '조사표는 보고 있을 때만');

// renderDefectsGrouped: 그룹은 한 번 그리고, 순서·멤버는 예전과 같다
const ctx = {
    state: { currentBuildingId: 'b', currentFloor: '1F', defects: {} },
    parseDefectSortNoValue: (d) => Number(d.no) || 0,
    pickDefectGroupRepresentative: (list) => list[0],
    getDefectMarkingGroupMembers: () => { throw new Error('그리는 중엔 묶어 둔 것을 쓴다'); },
    calls: []
};
vm.createContext(ctx);
vm.runInContext([
    'let _pinDrawFrame = null;',
    extractFunction(app, 'function pinDrawGroupMembers('),
    extractFunction(app, 'function renderDefectsGrouped('),
    extractFunction(app, 'function renderDefectsGroupedBody('),
    'this.render = renderDefectsGrouped; this.members = pinDrawGroupMembers;'
].join('\n'), ctx);
const defects = [
    { id: 'a', no: '1', groupId: 'g1', targetX: 1, targetY: 1 },
    { id: 'b', no: '2' },
    { id: 'c', no: '3', groupId: 'g1', targetX: 2, targetY: 2 },
    { id: 'd', no: '4', groupId: 'g2' }
];
ctx.state.defects['b_1F'] = defects;
let seenInside = null;
ctx.render(null, defects, (_c, d, arrows) => {
    ctx.calls.push([d.id, arrows ? arrows.length : 0]);
    if (d.id === 'a') seenInside = ctx.members('g1').map((m) => m.id);
});
assert.strictEqual(JSON.stringify(ctx.calls), JSON.stringify([['a', 2], ['b', 0], ['d', 0]]));
assert.strictEqual(JSON.stringify(seenInside), JSON.stringify(['a', 'c']));

console.log('test-pc-lag-perf: ok');
