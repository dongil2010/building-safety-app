#!/usr/bin/env node
'use strict';
/** 비파괴 도면은 받은 그림 크기가 아니라 좌표 기준 크기로 그린다 — 새로고침 뒤 마킹이 어긋나지 않게 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const src = app.slice(app.indexOf('function getNdtDrawingDims()'), app.indexOf('window.fitNdtCanvas = function()'));
const dimsWith = (env) => new Function(
    'state', 'ndtBgImage', 'currentNdtCustomDrawingSrc', 'getFloorPlanDisplayDims',
    src + '\nreturn getNdtDrawingDims();'
)({ currentBuildingId: 'b', currentFloor: '1F' }, env.img, () => env.custom, () => ({ w: 4000, h: 2800 }));

const small = { naturalWidth: 3300, naturalHeight: 2310 };
assert.deepStrictEqual(dimsWith({ img: small, custom: null }), { w: 4000, h: 2800 }, '층 도면: 그림이 작아도 좌표 기준 크기');
assert.deepStrictEqual(dimsWith({ img: small, custom: 'data:x' }), { w: 3300, h: 2310 }, '비파괴 전용 도면: 그 그림 크기');
assert.deepStrictEqual(dimsWith({ img: null, custom: null }), { w: 1200, h: 700 }, '도면 없음: 기본 크기');

assert.ok(!/ctx\.drawImage\(ndtBgImage, 0, 0\)/.test(app), '비파괴 도면을 그림 픽셀 크기 그대로 그리지 않음');
assert.ok(/ctx\.drawImage\(ndtBgImage, 0, 0, imgW, imgH\)/.test(app));
assert.ok(!/ndtBgImage \? \(ndtBgImage\.naturalWidth/.test(app), '좌표 계산에 그림 크기를 직접 쓰지 않음');

console.log('test-ndt-drawing-ref-dims: ok');
