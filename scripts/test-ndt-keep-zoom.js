#!/usr/bin/env node
'use strict';
/** 비파괴 도면: 같은 도면이면 그림 교체·탭 복귀에 확대를 맞춤으로 되돌리지 않는다 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const tab = fs.readFileSync(path.join(root, 'js', 'tabs', 'ndt.js'), 'utf8');

const src = app.slice(app.indexOf('let _ndtFitDrawingSig'), app.indexOf('function loadFloorNdtDrawing()'));
const make = () => new Function('env', `
    let ndtBgImage = null, ndtRotationAngle = 0;
    const getNdtDrawingDims = () => env.dims;
    const fitNdtCanvas = () => { env.fits++; };
    const drawNdtCanvas = () => { env.draws++; };
    ${src}
    return applyNdtBackgroundImage;
`);
const env = { dims: { w: 4000, h: 2800 }, fits: 0, draws: 0 };
const apply = make()(env);
const wide = { naturalWidth: 4000, naturalHeight: 2800 };
const hires = { naturalWidth: 8000, naturalHeight: 5600 };

apply(wide, 'b_1F');
assert.strictEqual(env.fits, 1, '처음 연 도면은 맞춤');
apply(hires, 'b_1F');
apply(wide, 'b_1F');
assert.strictEqual(env.fits, 1, '같은 도면의 화질 교체는 확대 유지');
assert.strictEqual(env.draws, 3, '그림은 매번 다시 그림');
apply(wide, 'b_2F');
assert.strictEqual(env.fits, 2, '다른 층은 맞춤');
env.dims = { w: 5000, h: 2800 };
apply(wide, 'b_2F');
assert.strictEqual(env.fits, 3, '도면 크기가 바뀌면 맞춤');

const portraitEnv = { dims: { w: 2800, h: 4000 }, fits: 0, draws: 0 };
const applyP = make()(portraitEnv);
const portrait = { naturalWidth: 2800, naturalHeight: 4000 };
applyP(portrait, 'b_1F');
assert.strictEqual(portraitEnv.fits, 1, '세로 도면 첫 자동 회전은 맞춤');
applyP(portrait, 'b_1F');
assert.strictEqual(portraitEnv.fits, 1, '이미 돌린 뒤에는 유지');

assert.ok(/var keepZoom = [^\n]*isNdtViewZoomedIn\(\)/.test(tab), '탭에 들어오는 시점에 확대 상태를 잡음');
assert.ok(/fitNdtCanvas === 'function' && !keepZoom\)/.test(tab), '탭 복귀 맞춤은 확대 안 한 때만');
assert.strictEqual((app.match(/^\s*fitNdtCanvas\(\);$/gm) || []).length, 2, '자동 맞춤은 applyNdtBackgroundImage와 회전 버튼뿐');

console.log('test-ndt-keep-zoom: ok');
