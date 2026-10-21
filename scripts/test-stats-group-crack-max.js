#!/usr/bin/env node
'use strict';

/**
 * 2026-10-22 — 묶인 결함(같은 groupId)의 균열·이격 행은 균열폭이 가장 큰 한 행만 통계에 남는지 검사.
 * collapseGroupedCrackRows(rows)와 그 의존 함수를 stats.js에서 잘라 vm으로 실행한다.
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
    'function extractWidthFromSegment(',
    'function isAreaSizeSegment(',
    'function getCrackWidthNumbers(',
    'function collapseGroupedCrackRows('
].map((h) => extractFunction(statsSrc, h)).join('\n')
    + '\nthis.collapseIds = function (rows) { return collapseGroupedCrackRows(rows).map(function (d) { return d.id; }).join(","); };', sandbox);
const ids = (rows) => sandbox.collapseIds(rows);

// 같은 묶음의 균열 3행 → 폭이 가장 큰 행만
assert.strictEqual(ids([
    { id: 'a1', groupId: 'g', defectType: '수직균열', crackWidth: '0.2' },
    { id: 'a2', groupId: 'g', defectType: '경사균열', crackWidth: '0.4' },
    { id: 'a3', groupId: 'g', defectType: '균열', crackWidth: '0.15 / 0.3' }
]), 'a2');

// 균열 아닌 행은 묶음이어도 그대로, 묶음 없는 균열도 그대로
assert.strictEqual(ids([
    { id: 'b1', groupId: 'g', defectType: '균열', crackWidth: '0.3' },
    { id: 'b2', groupId: 'g', defectType: '백태' },
    { id: 'b3', groupId: 'g', defectType: '균열', crackWidth: '0.5' },
    { id: 'c1', defectType: '균열', crackWidth: '0.1' },
    { id: 'c2', defectType: '균열', crackWidth: '0.2' }
]), 'b2,b3,c1,c2');

// 묶음이 다르면 따로, 폭 없는 행보다 폭 있는 행, 폭이 같으면 앞 행
assert.strictEqual(ids([
    { id: 'd1', groupId: 'g1', defectType: '망상균열', size: '2.0x2.0' },
    { id: 'd2', groupId: 'g1', defectType: '균열', crackWidth: '0.2' },
    { id: 'e1', groupId: 'g2', defectType: '균열', crackWidth: '0.3' },
    { id: 'e2', groupId: 'g2', defectType: '이격', crackWidth: '0.3' }
]), 'd2,e1');

console.log('test-stats-group-crack-max: ok');
