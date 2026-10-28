'use strict';
// 2026-10-20 「한글출력할때 3종에 범례 붙는데 거기서 층수 꼬이는 거 있는지 확인」
//  1) 3종 번호 접두사: 지붕 쪽 층이 겹치지 않게(옥상층 R · 옥상지붕층 RR · 지붕층 RF · 옥탑층 PH · 옥탑N층 PH{N} · 옥탑 지붕층 PHR)
//  2) 위치도 범례는 그리는 도면의 층 기준(1·2종 중점관리 줄), 출력 중 저장된 범례 박스를 다른 층 크기로 덮어쓰지 않음
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// 실제 state.js의 옥탑 번호 읽기를 쓴다
const win = {};
vm.createContext({ window: win });
const stateSrc = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');
const rti = extractFunction(stateSrc, 'window.parseRooftopIndex = function(');
const ctx = { window: { getFloorLabelFromCode: (c) => ({ PH: '옥탑2층 (PH)', ROOF: '옥상층 (ROOF)' }[c] || c) } };
vm.createContext(ctx);
vm.runInContext(rti + ';\n' + extractFunction(app, 'function getGrade3RoofPrefix(') + '\n'
    + extractFunction(app, 'function getGrade3FloorPrefix(') + '\nthis.p = getGrade3FloorPrefix;', ctx);

const cases = {
    ROOF: 'R', 옥상층: 'R', 옥상지붕층: 'RR', 지붕층: 'RF', 옥탑층: 'PH', 옥탑1층: 'PH1', '옥탑 2층': 'PH2', PH1: 'PH1', RF2: 'PH2',
    PH_ROOF: 'PHR', 옥탑지붕층: 'PHR', '옥탑 지붕층': 'PHR', PH: 'PH2',
    '1F': '1', B1F: 'B1', '10F': '10', EXT_FRONT: 'O', 외부: 'O', 부대시설: 'O'
};
Object.keys(cases).forEach((c) => assert.strictEqual(ctx.p(c), cases[c], c));
// 서로 다른 층은 서로 다른 접두사
const roofFloors = ['옥상층', '옥상지붕층', '지붕층', '옥탑지붕층', '옥탑층', '옥탑1층', '옥탑2층'];
assert.strictEqual(new Set(roofFloors.map((c) => ctx.p(c))).size, roofFloors.length, '지붕 쪽 층 접두사 안 겹침');
assert.notStrictEqual(ctx.p('옥탑1층'), ctx.p('1F'), '옥탑1층은 1층이 아님');
assert.notStrictEqual(ctx.p('옥탑2층'), ctx.p('2F'));

// 범례: 그리는 층을 넘긴다(화면만 지금 층)
assert.ok(/const items = getLocationMapLegendDrawItems\(legendOpts && legendOpts\.floorCode\);/.test(app));
assert.ok(/drawLocationMapLegend\(ctx, imgW, imgH, false, 0, \{ floorCode \}\);/.test(extractFunction(app, 'function renderFloorPlanCanvasDataUrl(')), '한글·보고서 도면 그림');
assert.ok(/legendBoxForPrintCrop\(imgW, imgH, crop, floorCode\), floorCode \}/.test(extractFunction(app, 'function renderFloorPrintCropCanvas(')), '출력 범위 그림');
assert.ok(/window\.buildVectorLegendDrawPlan = function\(measureCtx, imgW, imgH, floorCode\)/.test(app));
const bridge = fs.readFileSync(path.join(root, 'js', 'pdf-vector-bridge.js'), 'utf8');
assert.ok(/buildVectorLegendDrawPlan\(measureCtx, imgW, imgH, floorCode\)/.test(bridge), '벡터 PDF도 그 층');
// 저장된 범례 박스에 비율을 찍는 것은 화면에서만
const legendFn = extractFunction(app, 'function drawLocationMapLegend(');
assert.ok(/if \(interactive && !\(legendOpts && legendOpts\.box\)/.test(legendFn));
// 3종 위치도 캡션은 그 도면(외부 입면은 입면마다) 이름
assert.ok(/captionT\.textContent = `\$\{HWPX_FIG_MARK\}\$\{getFloorLabel\(floorCode\)\} 상태조사위치도`/.test(app));
console.log('test-grade3-floor-prefix-legend-floor: ok');
