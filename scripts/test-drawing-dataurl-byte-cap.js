#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function drawingDataUrlByteCap(maxDataUrlBytes) {
    const n = Number(maxDataUrlBytes);
    return (Number.isFinite(n) && n > 0) ? n : 0;
}

assert.strictEqual(drawingDataUrlByteCap(undefined), 0);
assert.strictEqual(drawingDataUrlByteCap(null), 0);
assert.strictEqual(drawingDataUrlByteCap(0), 0);
assert.strictEqual(drawingDataUrlByteCap(-1), 0);
assert.strictEqual(drawingDataUrlByteCap(Infinity), 0);
assert.strictEqual(drawingDataUrlByteCap(950000), 950000);
assert.strictEqual(drawingDataUrlByteCap('1400000'), 1400000);

const stateSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'state.js'), 'utf8');
assert(stateSrc.includes('window.drawingDataUrlByteCap'), 'helper exported on window');
assert(!/maxBytes = \{ 4000: 950000/.test(stateSrc), 'PDF tiers no longer cap 4000px at 1MB');
assert(!/maxDataUrlBytes = 950000/.test(stateSrc), 'renderPdfFileToImage default is not 1MB');
assert(!/maxDim = 2200/.test(stateSrc), 'compressDrawingImage default is not 2200px');
assert(/byteCap > 0 && dataUrl && dataUrl\.length > byteCap/.test(stateSrc), 'byte shrink only when cap set');

const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert(!/maxPreviewBytes/.test(appSrc), 'PDF preview no longer uses 1MB maxPreviewBytes');
assert(/renderPdfDataUrlToImage\(pdfUrl, attempt\.dim, 0, pdfCacheKey\)/.test(appSrc), 'preview render has no byte cap');

const bridgeSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
assert(!/renderPdfFileToImage\(file, 4000, 1400000\)/.test(bridgeSrc), 'PDF fallback has no 1.4MB cap');

console.log('drawing dataUrl byte-cap tests ok');
