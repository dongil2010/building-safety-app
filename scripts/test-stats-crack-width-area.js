#!/usr/bin/env node
'use strict';

/**
 * 2026-10-08 — 통계의 「구조 부재별 층별 최대 균열폭」에서 면적(가로×세로)으로 적은 측정값이
 * 균열폭으로 잡히던 문제의 회귀 테스트. 망상균열을 "2.0×2.0"으로 적으면 최대 균열폭이 2.0mm로 찍혔다.
 * getCrackWidthNumbers(d)를 stats.js에서 잘라 vm으로 실행해 검사한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const statsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext([
    extractFunction(statsSrc, 'function extractWidthFromSegment('),
    extractFunction(statsSrc, 'function isAreaSizeSegment('),
    extractFunction(statsSrc, 'function getCrackWidthNumbers('),
    'this.widthsJson = function (d) { return JSON.stringify(getCrackWidthNumbers(d)); };'
].join('\n'), sandbox);
// vm 안에서 만든 배열은 바깥 배열과 원형이 달라 값이 같아도 다르다고 나온다 — 글자로 받아 다시 읽는다
const widths = (d) => JSON.parse(sandbox.widthsJson(d));

// 측정 행에 구분이 있는 지금 데이터
assert.deepStrictEqual(widths({
    size: 'Cw:0.2, 2.0x2.0', crackWidth: '0.2 / 2.0', crackLength: '2.0',
    crackMeasures: [{ width: '0.2', length: '', join: '/' }, { width: '2.0', length: '2.0', join: 'x' }]
}), [0.2], '면적 행(2.0x2.0)의 2.0은 균열폭이 아니다');

assert.deepStrictEqual(widths({
    size: '0.3/1.0, 0.4/2.2', crackWidth: '0.3 / 0.4',
    crackMeasures: [{ width: '0.3', length: '1.0', join: '/' }, { width: '0.4', length: '2.2', join: '/' }]
}), [0.3, 0.4], '폭/길이 행은 그대로');

assert.deepStrictEqual(widths({
    size: '1.2x2.4', crackWidth: '1.2', crackMeasures: [{ width: '1.2', length: '2.4', join: 'x' }]
}), [], '면적만 있는 결함은 균열폭이 없다');

// 구분이 저장되기 전 데이터: 규모 글자의 같은 자리 조각으로 가른다
assert.deepStrictEqual(widths({
    size: '0.3/1.5, 0.2*0.5', crackMeasures: [{ width: '0.3', length: '1.5' }, { width: '0.2', length: '0.5' }]
}), [0.3]);
assert.deepStrictEqual(widths({ size: '2.0×2.0', crackMeasures: [{ width: '2.0', length: '2.0' }] }), []);

// 측정 행 없이 폭 글자만 남은 데이터
assert.deepStrictEqual(widths({ size: '2.0*2.0', crackWidth: '2.0' }), [], '규모가 면적이면 폭 글자도 뺀다');
assert.deepStrictEqual(widths({ size: '0.3/1.5, 0.2x0.5', crackWidth: '0.3 / 0.2' }), [0.3]);
assert.deepStrictEqual(widths({ size: '0.3/1.5', crackWidth: '0.3' }), [0.3]);
assert.deepStrictEqual(widths({ size: '', crackWidth: '0.15 / 0.20' }), [0.15, 0.2], '규모가 없으면 폭 글자 그대로');

// 폭 글자가 없는 더 옛 데이터(규모 자유 글자)
assert.deepStrictEqual(widths({ size: 'Cw:0.4' }), [0.4]);
assert.deepStrictEqual(widths({ size: '1.0/4.5' }), [1]);
assert.deepStrictEqual(widths({ size: '2.0*2.0' }), []);

console.log('test-stats-crack-width-area: ok');
