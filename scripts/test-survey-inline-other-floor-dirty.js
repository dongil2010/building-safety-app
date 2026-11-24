/**
 * 2026-11-24 전체층 조사표에서 다른 층 행을 고치면 그 층을 「올릴 층」으로 표시해야 한다.
 * 저장(saveStateToLocalStorage)은 지금 보는 층만 표시해서, 다른 층 수정이 서버에 안 올라갔다
 * (능주고 원인 칸 73건: 「대기 0건」인데 서버는 옛 값).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', '12-survey-table.js'), 'utf8');
const start = src.indexOf('window.updateSurveyInlineField = function');
const end = src.indexOf('\n    };', start) + '\n    };'.length;
assert.ok(start > 0 && end > start, 'updateSurveyInlineField 를 찾지 못함');

function run(defectFloorKey, currentFloor, newCause) {
    const dirty = [];
    const defect = { id: 'd1', cause: '건조수축|사진38' };
    const sb = {
        window: {},
        state: { currentBuildingId: 'b1', currentFloor, defects: { [defectFloorKey]: [defect] } },
        findDefectAcrossBuildingFloors: () => ({ floorKey: defectFloorKey }),
        surveyRowEditTargetIds: () => ['d1'],
        touchDefectUpdatedAt: (d) => { d.updatedAt = 1; },
        markFloorKeyDirty: (k) => dirty.push(k),
        saveStateToLocalStorage: () => {},
        refreshSurveyColumnWidthsFromDom: () => {},
        isGoodDefectType: () => false,
        renderSurveyTable: () => {}
    };
    vm.createContext(sb);
    vm.runInContext(src.slice(start, end), sb);
    sb.window.updateSurveyInlineField('d1', 'cause', newCause);
    return { dirty, defect };
}

// 다른 층(4F) 행을 3F 를 보면서 고침 → 4F 가 올릴 층에 들어간다
let r = run('b1_4F', '3F', '건조수축');
assert.strictEqual(r.defect.cause, '건조수축');
assert.deepStrictEqual(r.dirty, ['b1_4F']);

// 값이 그대로면 표시하지 않는다(쓸데없는 업로드 방지)
r = run('b1_4F', '3F', '건조수축|사진38');
assert.deepStrictEqual(r.dirty, []);

console.log('test-survey-inline-other-floor-dirty: ok');
