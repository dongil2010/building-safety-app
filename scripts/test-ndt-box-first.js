#!/usr/bin/env node
'use strict';
/** 2026-10-21 비파괴도: 점과 박스가 겹치면 박스 먼저(PC·터치), 박스 밖 점은 점, 고른 마킹 먼저 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../js/core/selected-hit.js');
const none = () => false;
// 같은 마킹: 점과 박스가 겹침 → 박스
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'a', box: true, tipDist: 3 }], none), { index: 0, part: 'box' });
// 박스 밖에서 점 → 점
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'a', box: false, tipDist: 5 }], none), { index: 0, part: 'tip' });
// 다른 마킹 점 위에 박스가 겹침 → 박스
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'a', box: false, tipDist: 1 }, { key: 'b', box: true, tipDist: Infinity }], none), { index: 1, part: 'box' });
// 점 여러 개 → 가장 가까운 점
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'a', box: false, tipDist: 9 }, { key: 'b', box: false, tipDist: 2 }], none), { index: 1, part: 'tip' });
// 고른 마킹 먼저: 고른 b의 점 > 다른 a의 박스
const selB = (k) => k === 'b';
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'a', box: true, tipDist: Infinity }, { key: 'b', box: false, tipDist: 4 }], selB), { index: 1, part: 'tip' });
// 고른 마킹 안에서도 박스 먼저
assert.deepStrictEqual(H.pickBoxFirst([{ key: 'b', box: true, tipDist: 1 }], selB), { index: 0, part: 'box' });
assert.strictEqual(H.pickBoxFirst([], none), null);
// app.js가 비파괴 히트(일반·변위)에서 이 규칙을 쓴다
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const pinFn = app.slice(app.indexOf('function findNdtPinAt('), app.indexOf('function getCurrentFloorNdtData('));
assert.ok(/pickNdtBoxFirst\(ndtHitCands\)/.test(pinFn), 'findNdtPinAt 박스 먼저');
assert.ok(!/TIP\(target\) 우선/.test(pinFn), 'PC 점 우선 규칙 제거');
const dispFn = app.slice(app.indexOf('function findNdtDisplacementHit('), app.indexOf('function setupNdtCanvas('));
assert.ok(/pickNdtBoxFirst\(dispCands\)/.test(dispFn), '변위 박스 먼저');
console.log('test-ndt-box-first: ok');
