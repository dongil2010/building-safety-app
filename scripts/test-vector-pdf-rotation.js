#!/usr/bin/env node
'use strict';
/** 2026-10-30 벡터 PDF: 도면 PDF 페이지 회전(/Rotate)·자르기 상자 원점 → 화면 좌표계 cm 행렬 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
const s = src.indexOf('window.vectorPdfDisplayFrame = function');
assert.ok(s >= 0);
let i = src.indexOf('{', s), depth = 0;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
const window = {};
new Function('window', src.slice(s, i + 1))(window);
const page = (rot, box) => ({ getCropBox: () => box || { x: 0, y: 0, width: 600, height: 400 }, getSize: () => ({ width: 600, height: 400 }), getRotation: () => ({ angle: rot }) });
const apply = (m, X, Y) => [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]];
// 화면 왼쪽 위 근처 점(10, 화면높이-10)이 pdf.js 회전 표시에서 왼쪽 위로 가는 원래 좌표
const want = { 0: [10, 390], 90: [10, 10], 180: [590, 10], 270: [590, 390] };
[0, 90, 180, 270].forEach((r) => {
    const f = window.vectorPdfDisplayFrame(page(r));
    assert.deepStrictEqual([f.width, f.height], (r % 180) ? [400, 600] : [600, 400], 'size ' + r);
    if (r === 0) { assert.strictEqual(f.matrix, null); return; }
    assert.deepStrictEqual(apply(f.matrix, 10, f.height - 10), want[r], 'map ' + r);
});
const off = window.vectorPdfDisplayFrame(page(0, { x: 20, y: 30, width: 600, height: 400 }));
assert.deepStrictEqual(apply(off.matrix, 0, 0), [20, 30], 'crop origin');
assert.strictEqual(window.vectorPdfDisplayFrame(page(-90)).rotation, 270);
assert.ok(/pushGraphicsState\(\), PDFLib\.concatTransformationMatrix\(\.\.\.view\.matrix\)/.test(src) && /popGraphicsState\(\)\);\s*\}\s*const pdfBytes = await outDoc\.save\(\)/.test(src), 'cm wraps all drawing');
console.log('test-vector-pdf-rotation: ok');