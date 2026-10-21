#!/usr/bin/env node
'use strict';
/** 2026-10-21 비파괴 탭 PC: 도면:결과표 ≈ 3:2, 결과표만 스크롤, 끌어서 비율 조절(기억) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/core/ndt-split.js');
let s = S.computeSplit(800, 0.6, 40, 14);
assert.strictEqual(s.top + s.bottom, 746);
assert.ok(Math.abs(s.top / 746 - 0.6) < 0.01, '3:2');
assert.strictEqual(S.computeSplit(300, 0.6, 40, 14), null, '너무 낮으면 예전 배치');
assert.strictEqual(S.clampRatio(2), 0.85);
assert.strictEqual(S.clampRatio('x'), 0.6);
s = S.computeSplit(800, 0.95, 40, 14);
assert.ok(s.bottom >= 140, '표 최소 높이');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/js\/core\/ndt-split\.js/.test(html));
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.ok(/#tab-ndt\.ndt-split-on #ndtSummaryTable thead th \{\s*position: sticky;/.test(css), '열 이름 고정');
console.log('test-ndt-split: ok');
