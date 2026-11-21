#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(name) {
    const re = new RegExp(`function ${name}\\(raw\\) \\{[\\s\\S]*?\\n    \\}`);
    const m = src.match(re);
    if (!m) throw new Error(`Could not extract ${name} from app.js`);
    // eslint-disable-next-line no-eval
    return eval(`(${m[0]})`);
}

const normalizeEaSpacingInText = extractFunction('normalizeEaSpacingInText');
const insertHwpxEaCountLineBreaks = extractFunction('insertHwpxEaCountLineBreaks');

function simulateWrapHwpxCellText(raw) {
    const flat = String(normalizeEaSpacingInText(raw == null ? '' : raw))
        .replace(/\r\n|\r|\n/g, ' ')
        .replace(/[ \t]{2,}/g, ' ');
    return insertHwpxEaCountLineBreaks(flat);
}

function testScreenshotCase() {
    assert.strictEqual(
        simulateWrapHwpxCellText('0.3~0.7/0.5 -12EA'),
        '0.3~0.7/0.5\n-12EA'
    );
}

function testNoSpaceAndStuckSuffix() {
    assert.strictEqual(simulateWrapHwpxCellText('0.3/2.0-2EA'), '0.3/2.0\n-2EA');
    assert.strictEqual(simulateWrapHwpxCellText('Cw:0.3 -2EA'), 'Cw:0.3\n-2EA');
    assert.strictEqual(simulateWrapHwpxCellText('2.0m -3EA'), '2.0m\n-3EA');
    assert.strictEqual(simulateWrapHwpxCellText('0.3x0.3 -4EA'), '0.3x0.3\n-4EA');
}

function testMultipleMeasures() {
    assert.strictEqual(
        simulateWrapHwpxCellText('0.3/0.5 -2EA, 0.2/1.0 -3EA'),
        '0.3/0.5\n-2EA, 0.2/1.0\n-3EA'
    );
}

function testFlattenThenBreak() {
    assert.strictEqual(
        simulateWrapHwpxCellText('0.3/0.5\n-12EA'),
        '0.3/0.5\n-12EA'
    );
    assert.strictEqual(
        simulateWrapHwpxCellText('슬래브 균열 0.3~0.7/0.5 -12EA'),
        '슬래브 균열 0.3~0.7/0.5\n-12EA'
    );
}

function testUnchangedWithoutCount() {
    assert.strictEqual(simulateWrapHwpxCellText('0.3~0.7/0.5'), '0.3~0.7/0.5');
    assert.strictEqual(simulateWrapHwpxCellText('Cw:0.3'), 'Cw:0.3');
    assert.strictEqual(simulateWrapHwpxCellText('12EA'), '12EA');
    assert.strictEqual(simulateWrapHwpxCellText('-12EA'), '-12EA');
    assert.strictEqual(simulateWrapHwpxCellText('슬래브 균열'), '슬래브 균열');
    assert.strictEqual(simulateWrapHwpxCellText(''), '');
}

function testCaseInsensitive() {
    // normalizeEaSpacingInText / insertHwpxEaCountLineBreaks both emit EA
    assert.strictEqual(simulateWrapHwpxCellText('0.3/0.5 -12ea'), '0.3/0.5\n-12EA');
}

testScreenshotCase();
testNoSpaceAndStuckSuffix();
testMultipleMeasures();
testFlattenThenBreak();
testUnchangedWithoutCount();
testCaseInsensitive();

console.log('test-hwpx-ea-break: ok');

// 2026-11-21 3종 한글 점검내용: -nEA 를 측정값에 붙여 넘치면 측정값째 다음 줄로
function testGrade3GlueMeasure() {
    const glue = extractFunction('glueHwpxEaCountToMeasure');
    const wrap = require('../js/shared/korean-text-wrap.js');
    const prep = (raw) => glue(normalizeEaSpacingInText(raw));
    assert.strictEqual(prep('보(G) 경사균열 0.2/0.5 -2EA'), '보(G) 경사균열\n0.2/0.5-2EA');
    assert.strictEqual(prep('보(G) 경사균열 0.2/0.5-2EA'), '보(G) 경사균열\n0.2/0.5-2EA');
    assert.strictEqual(prep('Cw:0.3 -2EA'), 'Cw:0.3-2EA');
    assert.strictEqual(prep('균열 Cw:0.3 -2EA'), '균열\nCw:0.3-2EA');
    assert.strictEqual(prep('슬래브 균열 0.3/0.5'), '슬래브 균열 0.3/0.5');
    assert.strictEqual(prep('3EA'), '3EA');
    // 칸이 넓어도 측정값 앞에서 나눈 두 줄 그대로
    assert.strictEqual(wrap.wrapHwpxCellText(prep('보(G) 경사균열 0.2/0.5 -2EA'), 30), '보(G) 경사균열\n0.2/0.5-2EA');
}
testGrade3GlueMeasure();
