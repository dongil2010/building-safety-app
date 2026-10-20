'use strict';
// 2026-10-20 「중점관리 항목 체크 되어 있어도 보수 했으면 검정으로 보여주라 사진은 보수완료한 사진 넣을 거니깐 삽입 해주고」
// 1) 중점관리 + 보수됨(결함 종류 보수완료·상태양호, 또는 보수완료 사진을 고름) → 핀·목록 글자 검정, 1·2종 범례 「보수완료」 검정 줄
// 2) 3종 중점관리 비교표(한글)·조사표 화면 비교 칸의 금회차 자리 = 고른 보수완료 사진
// 3) 수정창: 중점관리를 켜면 「보수완료 사진 추가」·사진마다 「보수완료」 단추, 저장 때 번호·사진 ID를 적는다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const goodType = require('../js/core/good-type.js');
const COLORS = { priorityManage: '#00ff00', defectGoodGrade3: '#000000', defectExistingGrade3: '#ff0000', defectNewGrade3: '#0000ff', defectBad: '#ff0000', defectGood: '#0000ff' };
function makeCtx(grade3) {
    const ctx = {
        window: { BsaGoodType: goodType },
        isGrade3Building: () => grade3,
        isPreviousRoundDefect: (d) => !!d.prev,
        getStyleColor: (k) => COLORS[k]
    };
    vm.createContext(ctx);
    vm.runInContext(['isGoodDefectType', 'getDefectRepairPhotoIndex', 'getDefectRepairPhotoSrc', 'isDefectRepaired',
        'isPriorityRepairedDefect', 'getDefectColor', 'applyPendingRepairPhotoToDefect']
        .map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
        + "\nconst PRIORITY_REPAIRED_COLOR = '#000000';\nthis.api = { getDefectRepairPhotoIndex, getDefectRepairPhotoSrc, isDefectRepaired, isPriorityRepairedDefect, getDefectColor, applyPendingRepairPhotoToDefect };", ctx);
    return ctx;
}
for (const g3 of [false, true]) {
    const c = makeCtx(g3);
    const a = c.api;
    assert.strictEqual(a.getDefectColor({ isPriorityManage: true, defectType: '균열' }), '#00ff00', '중점관리 그대로 녹색');
    assert.strictEqual(a.getDefectColor({ isPriorityManage: true, defectType: '균열 보수완료' }), '#000000', '보수완료 글자 → 검정');
    assert.strictEqual(a.getDefectColor({ isPriorityManage: true, defectType: '상태양호' }), '#000000');
    assert.strictEqual(a.getDefectColor({ isPriorityManage: true, defectType: '보수요망' }), '#00ff00', '보수요망은 아직 결함');
    assert.strictEqual(a.getDefectColor({ isPriorityManage: true, defectType: '균열', photos: ['p0', 'p1'], repairPhotoNo: 2 }), '#000000', '보수완료 사진 → 검정');
    assert.strictEqual(a.getDefectColor({ defectType: '균열', photos: ['p0'], repairPhotoNo: 1 }), g3 ? '#0000ff' : '#ff0000', '중점관리 아니면 예전 색 그대로');
}
{
    const a = makeCtx(true).api;
    const d = { photos: ['A', 'B', 'C'], photoIds: ['x0', 'x1', 'x2'], repairPhotoId: 'x2', repairPhotoNo: 1 };
    assert.strictEqual(a.getDefectRepairPhotoIndex(d), 2, '사진 ID가 먼저');
    assert.strictEqual(a.getDefectRepairPhotoSrc(d), 'C');
    assert.strictEqual(a.getDefectRepairPhotoSrc({ photos: ['A'] }), '');
    assert.strictEqual(a.getDefectRepairPhotoIndex({ photos: ['A'], repairPhotoNo: 3 }), -1, '없는 칸은 무시');
    assert.strictEqual(a.isPriorityRepairedDefect({ isPriorityManage: false, defectType: '보수완료' }), false);
}
{
    const c = makeCtx(true);
    const d = { photos: ['A', 'B'], photoIds: ['x0', 'x1'] };
    c.window._pendingRepairPhotoIdx = 1;
    c.api.applyPendingRepairPhotoToDefect(d);
    assert.strictEqual(d.repairPhotoNo, 2);
    assert.strictEqual(d.repairPhotoId, 'x1');
    c.window._pendingRepairPhotoIdx = -1;
    c.api.applyPendingRepairPhotoToDefect(d);
    assert.ok(!('repairPhotoNo' in d) && !('repairPhotoId' in d), '풀면 지운다');
    const e = { photos: ['A'], repairPhotoNo: 1 };
    delete c.window._pendingRepairPhotoIdx;
    c.api.applyPendingRepairPhotoToDefect(e);
    assert.strictEqual(e.repairPhotoNo, 1, '수정창 값이 없으면(일괄 수정 등) 건드리지 않음');
}
// 연결: 범례·목록·비교표·수정창
assert.ok(app.includes("&& !d.mapUnregistered && !isDefectRepaired(d));"), '1·2종 중점관리 범례 줄은 보수 안 된 것만');
assert.ok(app.includes("label: '보수완료', color: PRIORITY_REPAIRED_COLOR"), '1·2종 범례 보수완료 검정 줄');
assert.strictEqual((app.match(/text === '중점관리' \? \(isDefectRepaired\(d\) \? PRIORITY_REPAIRED_COLOR : getStyleColor\('priorityManage'\)\)/g) || []).length, 2, '조사표 목록 글자');
assert.ok(app.includes('const currSrc = repairSrc || getDefectOutputPhotos(d)[0];'), '한글 비교표 금회차 = 보수완료 사진');
assert.ok(app.includes("const currSrc = getDefectRepairPhotoSrc(d) || getDefectOutputPhotos(d)[0] || '';"), '화면 비교 칸');
assert.ok(app.includes("if (target === 'repair') window._pendingRepairPhotoIdx = window._pendingPhotos.length - 1;"));
assert.ok(app.includes('syncRepairPhotoUi(curr.length);'));
assert.ok(app.includes('if (savedDefect) applyPendingRepairPhotoToDefect(savedDefect);'));
assert.ok(app.includes('applyPendingRepairPhotoToDefect(d);'), '사진 즉시 저장 경로');
console.log('test-priority-repaired-black: ok');
