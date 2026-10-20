#!/usr/bin/env node
'use strict';
/** 2026-10-20 「/ → x(*) 바꿨는데 안 바뀐 게 있음」 회귀 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let i = app.indexOf('{', start), depth = 0;
    for (; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
    }
}
const names = ['normalizeMeasureJoin', 'inferMeasureJoin', 'sizeTextSaysAreaJoin', 'isMeasureOnlySizeText', 'parseSizeTextToCrackMeasures',
    'normalizeCrackDecimalText', 'normalizeEaSpacingInText', 'formatCrackMeasurePair', 'applyCrackMeasuresEditToDefect',
    'reconcileDefectMeasuresWithEditedSize', 'formatDefectSizeMeasuresJoined'];
const api = new Function(names.map(fn).join('\n') + '\nreturn {' + names.join(',') + '};')();

// '*' 규모 글자만 있는 결함 → x
assert.strictEqual(api.inferMeasureJoin({ size: '0.3*0.3' }, null), 'x');
assert.strictEqual(api.inferMeasureJoin({ size: '0.3/2.0' }, null), '/');

// 글자만 x로 고치고 행은 '/'로 남은 기존 결함 → 화면·출력은 x
const stale = { size: '0.3x0.5', crackMeasures: [{ width: '0.3', length: '0.5', count: '', join: '/' }] };
assert.strictEqual(api.formatDefectSizeMeasuresJoined(stale), '0.3x0.5');
const stale2 = { size: '0.3*0.5 -2EA', crackMeasures: [{ width: '0.3', length: '0.5', count: '2', join: '/' }] };
assert.strictEqual(api.formatDefectSizeMeasuresJoined(stale2), '0.3x0.5 -2EA');
// 값이 다르면 행을 따른다
const diff = { size: '0.3x0.9', crackMeasures: [{ width: '0.3', length: '0.5', count: '', join: '/' }] };
assert.strictEqual(api.formatDefectSizeMeasuresJoined(diff), '0.3/0.5');
// x 행 → 글자가 '/'여도 x 유지(토글 버튼으로 바꾼 경우)
assert.strictEqual(api.formatDefectSizeMeasuresJoined({ size: '0.3/0.5', crackMeasures: [{ width: '0.3', length: '0.5', join: 'x' }] }), '0.3x0.5');

// 저장: 규모 글자를 고치면 행도 따라간다
const d = { size: '0.3*0.5', crackMeasures: [{ width: '0.3', length: '0.5', count: '', join: '/' }], crackWidth: '0.3', crackLength: '0.5' };
assert.strictEqual(api.reconcileDefectMeasuresWithEditedSize(d, '0.3/0.5'), true);
assert.strictEqual(d.crackMeasures[0].join, 'x');
assert.strictEqual(d.size, '0.3x0.5');
// 안 고쳤거나 자유 글자면 그대로
const e = { size: '누수 흔적 0.3x0.5', crackMeasures: [{ width: '0.3', length: '0.5', join: '/' }] };
assert.strictEqual(api.reconcileDefectMeasuresWithEditedSize(e, ''), false);
assert.strictEqual(e.crackMeasures[0].join, '/');
const f = { size: '0.3/0.5', crackMeasures: [{ width: '0.3', length: '0.5', join: 'x' }] };
assert.strictEqual(api.reconcileDefectMeasuresWithEditedSize(f, '0.3/0.5'), false);
console.log('test-size-join-edit OK');
