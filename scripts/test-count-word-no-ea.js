#!/usr/bin/env node
'use strict';
/** 2026-11-24 개수 칸에 낱말(다수·전체 …)을 넣으면 EA를 붙이지 않는다. 숫자는 예전처럼 -nEA */
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
const names = ['normalizeMeasureJoin', 'normalizeCrackDecimalText', 'normalizeEaSpacingInText',
    'formatCrackMeasurePair', 'formatCrackMeasurePairHwpx', 'isMeasureOnlySizeText'];
const api = new Function(names.map(fn).join('\n') + '\nreturn {' + names.join(',') + '};')();
const F = api.formatCrackMeasurePair;
const H = api.formatCrackMeasurePairHwpx;

// 숫자: 예전 그대로
assert.strictEqual(F({ width: '0.3', length: '2.0', count: '2', join: '/' }), '0.3/2.0 -2EA');
assert.strictEqual(F({ count: '3', join: '/' }), '3EA');
assert.strictEqual(F({ width: '0.3', length: '2.0', count: '2~3', join: '/' }), '0.3/2.0 -2~3EA');
// 낱말: EA 없음
assert.strictEqual(F({ width: '0.3', length: '2.0', count: '다수', join: '/' }), '0.3/2.0 -다수');
assert.strictEqual(F({ count: '다수', join: '/' }), '다수');
assert.strictEqual(F({ width: '6.0', length: '2.0', count: '전체', join: 'x' }), '6.0x2.0 -전체');
assert.strictEqual(F({ length: '5.0', count: '다수', join: '/' }), '5.0m -다수');
assert.strictEqual(F({ width: '0.3', count: '다수', join: '/' }), 'Cw:0.3 -다수');
assert.strictEqual(H({ width: '0.3', length: '2.0', count: '다수', join: '/' }), '0.3/2.0 -다수');
assert.strictEqual(H({ count: '전체', join: '/' }), '전체');
assert.strictEqual(H({ width: '0.3', length: '2.0', count: '2', join: '/' }), '0.3/2.0 -2EA');
// 낱말 개수가 붙은 규모도 「측정값 표기뿐」으로 본다(행을 고치면 규모가 같이 바뀜)
assert.strictEqual(api.isMeasureOnlySizeText('0.3/2.0 -다수'), true);
assert.strictEqual(api.isMeasureOnlySizeText('0.3/2.0 -2EA'), true);
assert.strictEqual(api.isMeasureOnlySizeText('철근 노출 심함'), false);
console.log('test-count-word-no-ea: ok');
