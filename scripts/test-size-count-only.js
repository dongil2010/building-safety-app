'use strict';
// 2026-10-31: 규모 칸에 개수만 있으면 균열폭이 아니라 개수로(엑셀 가져오기·수정창 저장 공통 풀이)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const grab = (n) => { const s = app.indexOf('function ' + n + '('); const e = app.indexOf('\n    }\n', s); return app.slice(s, e + 6); };
const P = new Function(grab('normalizeCrackDecimalText') + grab('parseSizeTextToCrackMeasures') + ';return parseSizeTextToCrackMeasures;')();
const cnt = (n) => [{ width: '', length: '', count: n, join: '/' }];
for (const s of ['3', '3개', '3EA', '-3EA', '3 EA', '3개소', '개수 3', '갯수3', '수량3', 'EA 3', 'N=3']) {
    assert.deepStrictEqual(P(s, { defectType: '균열' }), cnt('3'), s);
}
assert.deepStrictEqual(P('12', { defectType: '박리' }), cnt('12'));
// 폭·길이만은 예전 그대로
assert.deepStrictEqual(P('0.3', {}), [{ width: '0.3', length: '', count: '', join: '/' }]);
assert.deepStrictEqual(P('0.3mm', {}), [{ width: '0.3', length: '', count: '', join: '/' }]);
assert.deepStrictEqual(P('2.0m', {}), [{ width: '', length: '2.0', count: '', join: '/' }]);
assert.deepStrictEqual(P('0.3/2.0', {}), [{ width: '0.3', length: '2.0', count: '', join: '/' }]);
assert.deepStrictEqual(P('0.3/2.0-3EA', {}), [{ width: '0.3', length: '2.0', count: '3', join: '/' }]);
console.log('test-size-count-only: ok');
