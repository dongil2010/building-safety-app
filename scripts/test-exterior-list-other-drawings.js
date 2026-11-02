'use strict';
// 2026-11-02 외부 조사항목: 모든 외부 도면의 마킹번호를 보여 주고(다른 도면은 도면 이름 칩 + 눌러서 이동),
// 외부에서는 「빈 번호 있음」 알림을 띄우지 않는다(번호를 당기지 않는다).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// 빈 번호 알림: 외부면 숨김
const gap = extractFunction(app, 'function updateDefectNumberGapNotice(');
assert.ok(/isExteriorFloorCode\(state\.currentFloor\)\) return hide\(\);/.test(gap), '외부는 빈 번호 알림 없음');
assert.ok(gap.indexOf('isExteriorFloorCode') < gap.indexOf('findDefectMarkingNumberGaps'), '번호 계산 전에 숨김');

// 목록 합치기 동작
const vm = require('vm');
const ctx = {
    state: { currentBuildingId: 'B', currentFloor: 'EXT_1', defects: {} },
    isExteriorFloorCode: (c) => /^EXT/.test(c),
    listExteriorFloorCodesForBuilding: () => ['EXT_1', 'EXT_2'],
    isDefectMapUnregistered: (d) => !!d.mapUnregistered,
    getDefectsForListPanel: (list) => list.slice(),
    getCurrentFloorFilteredDefects: (l) => l.filter((d) => !d.hidden),
    parseDefectNoParts: (d) => { const m = String(d.no).match(/(\d+)(?:-(\d+))?/); return { main: +m[1], suffix: m[2] ? +m[2] : 0 }; }
};
vm.createContext(ctx);
vm.runInContext(['isExteriorListMode', 'appendOtherExteriorListRows'].map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
    + '\nthis.f = appendOtherExteriorListRows; this.m = isExteriorListMode;', ctx);
const mk = (id, no, extra) => Object.assign({ id, no }, extra || {});
ctx.state.defects.B_EXT_1 = [mk('a1', 'NO.01'), mk('a3', 'NO.03')];
ctx.state.defects.B_EXT_2 = [mk('b2', 'NO.02'), mk('b4', 'NO.04', { mapUnregistered: true }), mk('b5', 'NO.05', { hidden: true }), mk('b6', 'NO.06')];
const out = ctx.f(ctx.state.defects.B_EXT_1.slice());
assert.deepStrictEqual(out.map((d) => d.id), ['a1', 'b2', 'a3', 'b6'], '번호순으로 섞고 미등록·필터된 것은 뺌');
assert.deepStrictEqual(out.map((d) => d._listFloorCode || ''), ['', 'EXT_2', '', 'EXT_2']);
assert.ok(!('_listFloorCode' in ctx.state.defects.B_EXT_2[0]), '원본 마킹은 건드리지 않음');
// 실내 층에서는 그대로
ctx.state.currentFloor = '1F';
const same = [mk('x', 'NO.01')];
assert.strictEqual(ctx.f(same), same);

// 연결: 목록 행에 도면 칩 + 다른 도면은 이동
const row = extractFunction(app, 'function buildDefectRow(');
assert.ok(row.includes('defect-list-item-floor') && row.includes("window.viewDefectOnMapFromSurvey(d.id)"));
assert.ok(extractFunction(app, 'function renderDefectListPanel(').includes('appendOtherExteriorListRows(defects)'));
console.log('test-exterior-list-other-drawings: ok');
