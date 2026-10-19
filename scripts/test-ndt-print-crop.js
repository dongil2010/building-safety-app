'use strict';
// 2026-10-19 비파괴 조사 위치도 출력 범위 — 결함 위치도와 따로, 같은 저장소(floorPrintCrops)에 '건물_층#ndt'
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const pc = require(path.join(root, 'js', 'shared', 'print-crop.js'));

const ctx = {
    state: { floorPrintCrops: {} },
    saved: 0, synced: 0,
    getFloorMapStyleKey: (b, f) => `${b}_${f}`,
    printCropApi: () => pc,
    NDT_PRINT_CROP_SUFFIX: '#ndt'
};
ctx.saveStateToLocalStorage = () => { ctx.saved++; };
ctx.scheduleSyncToFirebase = () => { ctx.synced++; };
vm.createContext(ctx);
vm.runInContext(['ndtPrintCropKey', 'getNdtPrintCrop', 'setNdtPrintCrop']
    .map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
    + '\nthis.key = ndtPrintCropKey; this.get = getNdtPrintCrop; this.set = setNdtPrintCrop;', ctx);

assert.strictEqual(ctx.key('b1', '1F'), 'b1_1F#ndt');
assert.strictEqual(ctx.get('b1', '1F', 1000, 800), null, '처음엔 도면 전체');
ctx.state.floorPrintCrops['b1_1F'] = pc.toStored({ x: 0, y: 0, w: 500, h: 400 }, 1000, 800);
assert.strictEqual(ctx.get('b1', '1F', 1000, 800), null, '결함 위치도 범위와 섞이지 않는다');
ctx.set('b1', '1F', { x: 100, y: 80, w: 600, h: 400 }, 1000, 800);
const got = ctx.get('b1', '1F', 1000, 800);
assert.ok(got && Math.abs(got.x - 100) < 1 && Math.abs(got.w - 600) < 1, '저장한 범위');
assert.ok(ctx.saved >= 1 && ctx.synced >= 1, '저장·동기화(일반 앱 동기화 길)');
assert.ok(ctx.state.floorPrintCrops['b1_1F'], '결함 위치도 범위는 그대로');
ctx.set('b1', '1F', null, 1000, 800);
assert.strictEqual(ctx.get('b1', '1F', 1000, 800), null, '되돌리면 도면 전체');

// 출력(PDF·한글 위치도)이 범위를 쓰고, 버튼 3곳(PC 칩·레일·모바일)
const render = extractFunction(app, 'function renderNdtFloorPlanCanvasDataUrl(');
assert.ok(/getNdtPrintCrop\(currentBldgId, floorCode, imgW, imgH\)/.test(render));
assert.ok(/renderNdtPrintCropCanvas\(/.test(render));
['btnOpenNdtPrintCropModal', 'ndtRailBtnPrintCrop', 'mobileNdtBtnPrintCrop'].forEach((id) => assert.ok(app.includes(id), id));
assert.ok(/window\.openNdtPrintCropModal/.test(app));
const csm = fs.readFileSync(path.join(root, 'js', 'core', 'company-settings-merge.js'), 'utf8');
assert.ok(/\['floorPrintCrops', 2\]/.test(csm), '층별 칸 병합으로 다른 기기와 공유');
console.log('test-ndt-print-crop: ok');
