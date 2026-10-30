#!/usr/bin/env node
'use strict';
/** 2026-10-30 한글(HWPX) 상태조사표 규모에 단위: 길이만 → "L: 5m", 폭만 → "Cw:0.3mm" (화면·PDF·엑셀은 그대로) */
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
const names = ['normalizeMeasureJoin', 'inferMeasureJoin', 'sizeTextSaysAreaJoin', 'normalizeCrackDecimalText', 'normalizeEaSpacingInText', 'formatCrackMeasurePair', 'formatCrackMeasurePairHwpx', 'formatDefectSizeMeasuresJoined'];
const api = new Function(names.map(fn).join('\n') + '\nreturn {' + names.join(',') + '};')();
const cases = [
    [{ width: '', length: '5', count: '' }, '5.0m', 'L: 5.0m'],
    [{ width: '0.3', length: '', count: '' }, 'Cw:0.3', 'Cw:0.3mm'],
    [{ width: '', length: '', count: '3' }, '3EA', '3EA'],
    [{ width: '0.3', length: '5', count: '' }, '0.3/5.0', '0.3mm/5.0m'],
    [{ width: '0.3', length: '5', count: '2' }, '0.3/5.0 -2EA', '0.3mm/5.0m -2EA'],
    [{ width: '', length: '5', count: '2' }, '5.0m -2EA', 'L: 5.0m -2EA'],
    [{ width: '0.3', length: '', count: '2' }, 'Cw:0.3 -2EA', 'Cw:0.3mm -2EA'],
    [{ width: '0.3mm', length: '5m', count: '' }, null, '0.3mm/5.0m'],
    [{ width: '1.5', length: '2.0', count: '', join: 'x' }, '1.5x2.0', '1.5x2.0']
];
cases.forEach(([m, before, after]) => {
    const b = api.formatCrackMeasurePair(Object.assign({ join: '/' }, m));
    const h = api.formatCrackMeasurePairHwpx(Object.assign({ join: '/' }, m));
    if (process.env.SHOW) console.log(JSON.stringify(m), '| 화면/PDF/엑셀:', b, '| 한글:', h);
    if (before != null) assert.strictEqual(b, before, 'screen ' + JSON.stringify(m));
    assert.strictEqual(h, after, 'hwpx ' + JSON.stringify(m));
});
const d = { crackMeasures: [{ width: '', length: '5', count: '' }, { width: '0.2', length: '', count: '' }] };
assert.strictEqual(api.formatDefectSizeMeasuresJoined(d), '5.0m, Cw:0.2');
assert.strictEqual(api.formatDefectSizeMeasuresJoined(d, api.formatCrackMeasurePairHwpx), 'L: 5.0m, Cw:0.2mm');
// 한글 출력 3곳 모두 hwpxUnits로 호출
assert.strictEqual((app.match(/getReportSurveyRowValues\(d, Object\.assign\(\{ hwpxUnits: true \}, rowCtx\)/g) || []).length, 3);
console.log('test-hwpx-size-units: ok');