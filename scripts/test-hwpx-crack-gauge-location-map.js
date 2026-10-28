'use strict';
// 2026-10-28 「한글 출력할 때 균열게이지 위치도도 나오게」
//  - 비파괴 위치도 그림에 「균열모니터」 분류: 게이지 마킹 + 예전 방식(균열 결함 연결) 게이지 결함 핀
//  - 한글 균열게이지 구간: 측정표 뒤·비교사진 앞에 게이지가 있는 층마다 위치도 한 장, 표 틀은 결함 위치도 표 복제
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const render = extractFunction(app, 'function renderNdtFloorPlanCanvasDataUrl(');
assert.ok(/categoryFilter === '균열모니터'/.test(render), '균열모니터 분류');
assert.ok(/\.filter\(isCrackGaugeNdtItem\)/.test(render), '게이지 마킹만');
assert.ok(/isLegacyCrackMonitorDefect/.test(render), '예전 방식 게이지 결함 핀');
assert.strictEqual((render.match(/pinDefects\.forEach\(d => drawPin\(ctx, d\)\)/g) || []).length, 2, '가로·세로 도면 둘 다');
assert.ok(/renderNdtPrintCropCanvas\([^)]*pinDefects\)/.test(render), '출력 범위 정한 층도');
assert.ok(/pinDefects/.test(extractFunction(app, 'function renderNdtPrintCropCanvas(')));

const sec = extractFunction(app, 'async function appendHwpxCrackMonitorSectionEnd(');
assert.ok(/renderNdtFloorPlanCanvasDataUrlAsync\(floorCode, '균열모니터'\)/.test(sec), '균열모니터 위치도를 그린다');
assert.ok(/상태조사위치도/.test(sec), '결함 위치도 표를 틀로');
assert.ok(/균열게이지 위치도`/.test(sec) && /\$\{HWPX_FIG_MARK\}\$\{owner\.label\(floorCode\)\} 균열게이지 위치도/.test(sec), '캡션 [도면 N-M] 층 균열게이지 위치도');
const callAt = sec.indexOf('await appendCrackGaugeLocationMaps()');
assert.ok(callAt > sec.indexOf('sec.appendChild(dataPara)'), '측정표 뒤');
assert.ok(callAt < sec.indexOf('const summaryProtos'), '비교사진 앞');
assert.ok(/_hwpxRenderBldgOverride = owner\.b/.test(sec) && /_hwpxRenderBldgOverride = prevOverride/.test(sec), '여러 동: 그 동 도면으로 그리고 되돌림');
console.log('test-hwpx-crack-gauge-location-map: ok');
