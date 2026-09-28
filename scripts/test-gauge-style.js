#!/usr/bin/env node
/* 2026-09-28 균열 게이지 마킹 스타일 카드 + 게이지/팁 측정 행 추가 버튼 위치 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

['styleCatCardNdtCrackGauge', 'styleColorNdtCrackGauge', 'styleFontSizeNdtCrackGauge'].forEach((id) => {
    assert.ok(html.includes(`id="${id}"`), 'html id ' + id);
});
assert.ok(app.includes("['styleColorNdtCrackGauge', 'ndtCrackGauge']"), 'STYLE_COLOR_FIELDS has gauge');
assert.ok(app.includes("['NdtCrackGauge', 'ndtCrackGauge']"), 'NDT_STYLE_SIZE_FIELDS has gauge');
assert.ok(/function getPinBoxFontSizeWithMul\(/.test(app), 'font multiplier helper');
assert.ok(/function normalizePinFontMul\(/.test(app));
assert.ok(/function measurePinBoxDimensions\(ctx, labelText, scale, roundLineMul, fontMul\)/.test(app), 'measure takes fontMul');
const plan = app.slice(app.indexOf('window.buildVectorNdtPinDrawPlan = function'));
assert.ok(app.indexOf('window.buildVectorNdtPinDrawPlan = function') > 0, 'vector plan present');
assert.ok(plan.slice(0, 6000).includes('getPinBoxFontSizeWithMul'), 'vector plan uses font multiplier');
assert.ok(app.includes('styleFontSize${'), 'font slider wired');

// 측정 행 추가 버튼: 수기 입력 표 바로 아래, 비교 사진 위
[['btnAddCrackGaugeReading'], ['btnAddCrackTipReading']].forEach(([id]) => {
    const btn = html.indexOf(`id="${id}"`);
    assert.ok(btn > 0, id);
    const wrap = html.lastIndexOf('defect-crack-monitor-table-wrap', btn);
    const photo = html.indexOf('비교 사진 (전차 / 현차)', wrap);
    assert.ok(wrap > 0 && wrap < btn, id + ' after table');
    assert.ok(photo > btn, id + ' before photo compare');
});
console.log('test-gauge-style: OK');
