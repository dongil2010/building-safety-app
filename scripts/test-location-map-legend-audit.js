'use strict';
// 2026-10-19 범례 점검 — 도면 마킹 색과 범례가 어긋나지 않게(화면·보고서/PDF·한글 그림·벡터 PDF 공용 줄)
//  1) 범례 색이 처음 만든 때 색으로 굳어 마킹 색 설정을 바꾸면 어긋나던 것 → 기본 항목은 마킹 색 설정을 따른다(범례에서 직접 고른 색은 그대로)
//  2) 1·2종도 중점관리 마킹은 녹색인데 범례에 그 줄이 없던 것 → 중점관리 마킹이 있으면 줄을 붙인다(중복 없이)
//  3) 범례 이름을 바꿔도 도면이 바로 안 바뀌던 것 → 바로 다시 그림
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const COLORS = { defectBad: '#dc2626', defectGood: '#2563eb', priorityManage: '#16a34a', defectGoodGrade3: '#000000', defectExistingGrade3: '#ff0000', defectNewGrade3: '#0000ff' };
function makeCtx(o) {
    const ctx = {
        state: { currentBuilding: { id: 'B' }, currentBuildingId: 'B', currentFloor: o.floor || '1F', locationMapLegend: o.legend || null, defects: o.defects || {} },
        isGrade3Building: () => !!o.grade3,
        getStyleColor: (k) => (o.colors || COLORS)[k],
        window: {}
    };
    vm.createContext(ctx);
    vm.runInContext(['normalizeHexColor', 'hexToLegendColorName', 'resolveLegendColorName', 'getDefaultLocationMapLegend',
        'legendStyleKeyByLabel', 'normalizeLegendLabelKey', 'resolveLegendItemStyleKey', 'floorHasPriorityManageMarking',
        'floorHasPriorityRepairedMarking', 'isGoodDefectType', 'getDefectRepairPhotoIndex', 'isDefectRepaired', 'isPriorityRepairedDefect',
        'getLocationMapLegendDrawItems', 'enrichLocationMapLegendItem', 'getActiveLocationMapLegend']
        .map((n) => extractFunction(app, 'function ' + n + '(')).join('\n') + "\nconst PRIORITY_REPAIRED_COLOR = '#000000';" + '\nthis.items = getLocationMapLegendDrawItems; this.defaults = getDefaultLocationMapLegend;', ctx);
    return ctx;
}
const J = (v) => JSON.parse(JSON.stringify(v)); // vm 쪽 배열과 비교
const simple = (items) => J(items.map((i) => [i.label, i.color, i.colorName]));

// 기본 항목은 마킹 색 설정과 이어져 있다
{
    const c = makeCtx({});
    assert.ok(c.defaults().every((i) => i.styleKey), '1·2종 기본 항목 styleKey');
    assert.deepStrictEqual(simple(c.items()), [['결함발생', '#dc2626', '적색'], ['상태양호', '#2563eb', '청색']]);
    const g3 = makeCtx({ grade3: true });
    assert.deepStrictEqual(J(g3.items().map((i) => i.label)), ['상태양호', '기존조사', '신규조사', '중점관리'], '3종 순서');
}
// 예전에 저장된 범례(styleKey 없음) — 마킹 색을 바꾼 뒤에도 같은 색으로
{
    const legend = [{ label: '결함발생', color: '#ff0000', colorName: '적색' }, { label: '상태양호', color: '#0000ff', colorName: '청색' }];
    const c = makeCtx({ legend, colors: { ...COLORS, defectBad: '#f97316', defectGood: '#16a34a' } });
    assert.deepStrictEqual(simple(c.items()), [['결함발생', '#f97316', '적색'], ['상태양호', '#16a34a', '녹색']], '구분 색 이름도 지금 색으로');
    assert.strictEqual(legend[0].color, '#ff0000', '저장된 범례 자체는 안 바꾼다');
}
// 범례에서 직접 고른 색·사용자가 만든 항목은 그대로
{
    const legend = [{ label: '결함발생', color: '#7c3aed', colorCustom: true }, { label: '보수 필요', color: '#64748b' }];
    const c = makeCtx({ legend });
    assert.deepStrictEqual(J(c.items().map((i) => i.color)), ['#7c3aed', '#64748b']);
}
// 1·2종 중점관리 줄
{
    const pri = { B_1F: [{ id: 'a', isPriorityManage: true }], X_1F: [] };
    assert.deepStrictEqual(J(makeCtx({ defects: pri }).items().map((i) => i.label)), ['결함발생', '상태양호', '중점관리'], '중점관리 마킹 있으면 줄');
    // 2026-10-20 층(도면) 단위 — 중점관리가 없는 층 도면에는 줄을 안 붙인다
    const two = { B_1F: [{ id: 'a', isPriorityManage: true }], B_2F: [{ id: 'b' }] };
    assert.strictEqual(makeCtx({ defects: two, floor: '2F' }).items().length, 2, '지금 층(2F)엔 중점관리 없음');
    assert.strictEqual(makeCtx({ defects: two, floor: '2F' }).items('1F').length, 3, '출력은 그 층(1F) 기준');
    assert.strictEqual(makeCtx({ defects: two, floor: '1F' }).items('2F').length, 2, '출력은 그 층(2F) 기준');
    assert.strictEqual(makeCtx({ defects: pri }).items()[2].color, '#16a34a');
    assert.strictEqual(makeCtx({ defects: { B_1F: [{ id: 'a' }], X_1F: [{ isPriorityManage: true }] } }).items().length, 2, '다른 건물 것은 안 셈');
    assert.strictEqual(makeCtx({ defects: { B_1F: [{ isPriorityManage: true, mapUnregistered: true }] } }).items().length, 2, '도면에 없는 것은 안 셈');
    const own = [{ label: '결함발생', color: '#dc2626' }, { label: '중점 관리', color: '#16a34a' }];
    assert.strictEqual(makeCtx({ legend: own, defects: pri }).items().length, 2, '이미 있으면 중복 없음');
    assert.strictEqual(makeCtx({ grade3: true, legend: [{ label: '상태양호', color: '#000' }], defects: pri }).items().length, 1, '3종은 사용자가 지운 줄을 다시 붙이지 않음');
}

// 연결: 화면·보고서·벡터 PDF·범위 맞춤이 같은 줄을 쓴다
assert.strictEqual((app.match(/const items = getLocationMapLegendDrawItems\((?:legendOpts && legendOpts\.floorCode|floorCode)\);/g) || []).length, 3, "그리는 층을 넘김");
assert.strictEqual((app.match(/getActiveLocationMapLegend\(\)\.map\(enrichLocationMapLegendItem\)/g) || []).length, 1, 'getLocationMapLegendDrawItems 안에서만');
assert.ok(/items\[idx\]\.colorCustom = true;/.test(extractFunction(app, 'window.recolorLocationMapLegendItem = function(')), '직접 고른 색 표시');
assert.ok(/drawCanvas\(\)/.test(extractFunction(app, 'window.renameLocationMapLegendItem = function(')), '이름 바꾸면 다시 그림');
console.log('test-location-map-legend-audit: ok');
