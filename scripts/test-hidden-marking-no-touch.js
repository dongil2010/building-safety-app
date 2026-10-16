'use strict';
// 2026-10-16 「숨긴 마킹은 터치 안 되게」 회귀 테스트
// 부재 종류 필터로 끈 마킹이 클릭·박스 선택·통합 번호칸 순환·선택 삭제/일괄 수정 대상이 되지 않아야 한다.
// app.js의 실제 함수를 떼어 와 돌린다(그리기 판정 기하만 단순화).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'missing ' + name);
    let j = src.indexOf('{', i), d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}

// 1) 판정 함수들이 필터 적용 목록을 쓰는지(필터 없는 전체 목록 금지)
for (const name of ['findHitPinPart', 'collectMarqueeHits', 'cycleMarkingGroupMemberOnBoxClick']) {
    const body = fn(name);
    assert.ok(body.includes('getCurrentFloorMapPlacedDefects()'), name + ' must use filtered list');
    assert.ok(!body.includes('filterMapPlacedDefects(getCurrentFloorDefects())'), name + ' must not use unfiltered list');
}
for (const name of ['deleteSelectedDefects', 'openBulkDefectEditModal', 'setCategoryFilterOn']) {
    assert.ok(fn(name).includes('pruneHiddenDefectSelection()'), name + ' must prune hidden selection');
}

// 2) 실제 함수로 시나리오
const harness = `
const window = { state: {} }; const state = window.state;
state.currentBuildingId = 'b1'; state.currentFloor = '1F';
let selectedDefectIds = new Set();
function isDefectMapUnregistered() { return false; }
function getCurrentFloorDefects() { return state.defects['b1_1F'] || []; }
function parseDefectSortNoValue(d) { return getDefectSortNo(d); }
function getDefectSortNo(d) { return parseInt(String(d.no || '').replace(/\\D/g, ''), 10) || 0; }
function getDefectMarqueeAnchor(d) { return { x: d.x, y: d.y }; }
function arrowSurveyNumberApi() { return null; }
${fn('filterMapPlacedDefects')}
${fn('getCurrentFloorMapPlacedDefects')}
${fn('getStructuralComponentGroup')}
${fn('getCurrentFloorFilteredDefects')}
${fn('getVisibleDefectIdSet')}
${fn('pruneHiddenDefectSelection')}
${fn('collectMarqueeHits')}
${fn('getDefectMarkingGroupMembers')}
${fn('cycleMarkingGroupMemberOnBoxClick')}
function hitAt(x, y) { // findHitPinPart와 같은 후보·순서(뒤에서부터)
    const defects = getCurrentFloorMapPlacedDefects();
    for (let i = defects.length - 1; i >= 0; i--) { const d = defects[i]; if (Math.hypot(d.x - x, d.y - y) < 12) return d.id; }
    return null;
}
return { window, state, sel: () => selectedDefectIds, setSel: (a) => { selectedDefectIds = new Set(a); },
    hitAt, collectMarqueeHits, pruneHiddenDefectSelection, cycleMarkingGroupMemberOnBoxClick };
`;
const H = new Function(harness)();
H.state.defects = { b1_1F: [
    { id: 'V1', no: 'NO.01', category: '구조체', component: '기둥', x: 100, y: 100 },
    { id: 'H2', no: 'NO.02', category: '구조체', component: '슬래브', x: 102, y: 101 },
    { id: 'F3', no: 'NO.03', category: '마감재', component: '천장 마감재', x: 300, y: 300 },
    { id: 'G1', no: 'NO.04', category: '구조체', component: '기둥', x: 500, y: 500, groupId: 'g' },
    { id: 'G2', no: 'NO.04', category: '구조체', component: '보(G)', x: 500, y: 500, groupId: 'g' },
    { id: 'G3', no: 'NO.04', category: '구조체', component: '기둥', x: 500, y: 500, groupId: 'g' }
] };

// 전체 보기: 겹친 자리는 나중 것(H2)
H.state.categoryFilter = { columnWall: true, beamSlab: true, nonStructural: true, finishing: true };
assert.strictEqual(H.hitAt(101, 100), 'H2');

// 보·슬래브 끔 → 같은 자리 클릭은 보이는 V1, 숨긴 H2는 안 잡힘
H.setSel(['H2', 'F3']);
H.state.categoryFilter.beamSlab = false;
assert.strictEqual(H.hitAt(101, 100), 'V1');
assert.strictEqual(H.hitAt(102, 101), 'V1');
// 박스 선택에 숨긴 것 없음
assert.deepStrictEqual(H.collectMarqueeHits(0, 0, 600, 600).sort(), ['F3', 'G1', 'G3', 'V1']);
// 필터를 바꾸면 선택 정리
assert.strictEqual(H.pruneHiddenDefectSelection(), 1);
assert.deepStrictEqual([...H.sel()], ['F3']);
// 통합 번호칸 순환: 숨긴 G2는 건너뜀
H.window._groupBoxCycle = null; H.setSel([]);
const seen = [];
let cur = H.state.defects.b1_1F[3];
for (let i = 0; i < 4; i++) { cur = H.cycleMarkingGroupMemberOnBoxClick(cur); seen.push(cur.id); }
assert.ok(!seen.includes('G2'), 'hidden group member cycled: ' + seen);
// 마감재 끔 → 그 자리 클릭 안 됨, 선택도 빠짐
H.setSel(['F3', 'V1']);
H.state.categoryFilter.finishing = false;
assert.strictEqual(H.hitAt(300, 300), null);
H.pruneHiddenDefectSelection();
assert.deepStrictEqual([...H.sel()], ['V1']);
console.log('test-hidden-marking-no-touch: ok');
