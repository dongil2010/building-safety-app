const fs = require('fs');
const path = require('path');
const assert = require('assert');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const s = app.indexOf('function selectNewlyCreatedMarking(');
const e = app.indexOf('function finishMarkingGroupCommit()');
assert(s > 0 && e > s, 'helpers present');
const src = app.slice(s, e);

function env(defects, extra) {
    const calls = { bar: 0 };
    const w = {};
    const st = { currentBuildingId: 'b1', currentFloor: '1F', defects: { b1_1F: defects } };
    const body = `let selectedDefectIds = new Set(); const window = __w; const state = __st;
        function updateMapSelectionBar() { __calls.bar++; }
        ${src}
        return { selectNewlyCreatedMarking, applySelectionAfterDefectModalClose,
          get sel() { return selectedDefectIds; }, set sel(v) { selectedDefectIds = v; } };`;
    const api = new Function('__w', '__st', '__calls', body)(w, st, calls);
    return { api, w, calls, st };
}

// 1) 새 마킹은 바로 선택 + 목록/팝업 갱신 호출
{
    const d = { id: 'n1' };
    const { api, calls, w } = env([d]);
    api.sel = new Set(['old1', 'old2']); // 이전 다중 선택은 새 마킹 하나로 대체
    api.selectNewlyCreatedMarking(d, { keepAfterModalClose: true });
    assert.deepStrictEqual([...api.sel], ['n1']);
    assert.strictEqual(calls.bar, 1);
    assert.strictEqual(w._bsaNewMarkingKeepSelId, 'n1');
}
// 2) 통합(그룹) 마킹은 팝업이 이 멤버를 가리키게 _groupBoxCycle
{
    const d = { id: 'm2', groupId: 'g1' };
    const { api, w } = env([d]);
    api.selectNewlyCreatedMarking(d);
    assert.deepStrictEqual(w._groupBoxCycle, { groupId: 'g1', lastId: 'm2' });
    assert.strictEqual(w._bsaNewMarkingKeepSelId, null);
}
// 3) 수정창을 닫을 때: 방금 만든 마킹은 유지
{
    const d = { id: 'n1' };
    const { api, w } = env([d]);
    api.selectNewlyCreatedMarking(d, { keepAfterModalClose: true });
    api.applySelectionAfterDefectModalClose(false);
    assert.deepStrictEqual([...api.sel], ['n1'], 'kept after close');
    assert.strictEqual(w._bsaNewMarkingKeepSelId, null, 'flag consumed');
    // 두 번째 닫기(기존 마킹 수정 후)는 예전처럼 해제
    api.applySelectionAfterDefectModalClose(false);
    assert.strictEqual(api.sel.size, 0, 'next close clears');
}
// 4) 기존 마킹을 열었다 닫는 경우(표시 없음)는 기존처럼 선택 해제
{
    const { api } = env([{ id: 'x' }]);
    api.sel = new Set(['x']);
    api.applySelectionAfterDefectModalClose(false);
    assert.strictEqual(api.sel.size, 0);
}
// 5) 취소(discardPending)이면 유지하지 않음, 삭제된 마킹도 유지하지 않음
{
    const d = { id: 'n1' };
    const a = env([d]);
    a.api.selectNewlyCreatedMarking(d, { keepAfterModalClose: true });
    a.api.applySelectionAfterDefectModalClose(true);
    assert.strictEqual(a.api.sel.size, 0);
    const b = env([d]);
    b.api.selectNewlyCreatedMarking(d, { keepAfterModalClose: true });
    b.st.defects.b1_1F.length = 0; // 사라짐
    b.api.applySelectionAfterDefectModalClose(false);
    assert.strictEqual(b.api.sel.size, 0);
}
// 6) 배선(정적)
assert(/selectNewlyCreatedMarking\(savedDefect, \{ keepAfterModalClose: isDefectModalOpen\(\) \}\);/.test(app), 'form commit selects new marking');
assert(/saveStateToLocalStorage\(\);\s*\n\s*selectNewlyCreatedMarking\(newDefect\);/.test(app), '위치 추가 chain selects');
assert(/selectNewlyCreatedMarking\(defect\);\s*\n\s*drawCanvas\(\);[\s\S]{0,200}도면 배치 완료/.test(app), 'map register selects');
assert(/applySelectionAfterDefectModalClose\(discardPending\);/.test(app), 'close uses helper');
assert(/window\._bsaNewMarkingKeepSelId = null; \/\/ 새 창마다/.test(app), 'open resets flag');
console.log('test-new-marking-selected: ok');
