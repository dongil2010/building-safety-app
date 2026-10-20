'use strict';
// 고른 마킹 먼저 잡기(2026-10-20): 고른 뒤 근처를 끌면 옆 마킹·박스가 잡히던 문제
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../js/core/selected-hit.js');

const sel = { id: 'A', tip: { x: 100, y: 100 }, tipR: 5, box: { cx: 160, cy: 100, w: 40, h: 20, rot: 0 }, leader: { x1: 160, y1: 100, x2: 100, y2: 100 } };
// 화살표 끝 근처(반경+여유 안)
assert.deepStrictEqual(H.claimSelected(112, 100, [sel], 14).part, 'TIP');
// 박스 바로 바깥(여유 안) → 박스
assert.strictEqual(H.claimSelected(160, 118, [sel], 14).part, 'BOX');
// 박스 안
assert.strictEqual(H.claimSelected(165, 100, [sel], 14).part, 'BOX');
// 지시선 가운데 근처 → 가까운 끝
const mid = H.claimSelected(125, 108, [sel], 14);
assert(mid && mid.id === 'A' && mid.part === 'TIP');
// 확실히 바깥이면 null(예전 판정으로)
assert.strictEqual(H.claimSelected(100, 200, [sel], 14), null);
assert.strictEqual(H.claimSelected(240, 100, [sel], 14), null);
// 고른 것 없으면 null
assert.strictEqual(H.claimSelected(100, 100, [], 14), null);
// 회전된 박스 거리
assert.strictEqual(H.boxDist(0, 0, { cx: 0, cy: 0, w: 10, h: 4, rot: 90 }), 0);

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const i = app.indexOf('    function findHitPinPart(imgX, imgY) {');
const head = app.slice(i, i + 1500);
assert(/const claimed = claimSelectedPinPart\(imgX, imgY, defects\);\s*if \(claimed\) return claimed;/.test(head), '다른 마킹·박스보다 먼저');
assert(head.indexOf('claimSelectedPinPart') < head.indexOf('for (let i = defects.length'), '반복 전에 판정');
assert(/selectedMarkingClaimsClient\(e\.clientX, e\.clientY\)\) \{\s*handleDragStart/.test(app), '메모가 고른 마킹 근처를 가로채지 않음');
assert(/js\/core\/selected-hit\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));
console.log('test-selected-hit: ok');
