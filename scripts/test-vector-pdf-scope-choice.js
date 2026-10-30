#!/usr/bin/env node
'use strict';
/** 2026-10-30 벡터 PDF 범위 선택: 기본 prompt가 막힌 앱 창에서도 동작(appChoose 사용) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
const s = src.indexOf('window.exportVectorPdfWithScopeChoice = async function');
assert.ok(s >= 0, 'scope choice fn');
let i = src.indexOf('{', s), depth = 0;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
const body = src.slice(s, i + 1);
async function run(pick, hasChoose) {
    const calls = [];
    const window = {
        state: { currentBuildingId: 'b', currentBuilding: {}, currentFloor: '1F' },
        listFloorsForVectorPdfExport: () => ['1F', '2F'],
        exportAllFloorsVectorPdf: async () => calls.push('all'),
        exportCurrentFloorVectorPdf: async () => calls.push('cur'),
        prompt: () => { calls.push('prompt'); return null; },
        showToast: () => {}
    };
    if (hasChoose) window.appChoose = async (msg, choices) => { assert.strictEqual(choices.length, 2); return pick; };
    new Function('window', body)(window);
    await window.exportVectorPdfWithScopeChoice();
    return calls.join(',');
}
(async () => {
    assert.strictEqual(await run(1, true), 'all');
    assert.strictEqual(await run(0, true), 'cur');
    assert.strictEqual(await run(null, true), '');
    assert.strictEqual(await run(null, false), 'prompt'); // 앱 창 없으면 예전 prompt
    console.log('test-vector-pdf-scope-choice: ok');
})().catch((e) => { console.error(e); process.exit(1); });