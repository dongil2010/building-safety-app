#!/usr/bin/env node
'use strict';
/** 2026-10-21 부재실측 「기둥」 단면 사각/원형 — 원형이면 지름(Φ) 하나로 저장·표시, 예전 사각 데이터는 그대로 */
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
const src = [fn('isNdtSteelComponent'), fn('getNdtMeasureDimKind'), fn('resolveNdtFormDimKind'), fn('formatNdtMeasureDimText'),
    'function formatNdtSteelDimText(){return "";} function resolveNdtSteelMeasuredFromItem(){return {};}',
    'return { resolveNdtFormDimKind, formatNdtMeasureDimText };'].join('\n');
const M = new Function(src)();
assert.strictEqual(M.resolveNdtFormDimKind('기둥', false), 'column');
assert.strictEqual(M.resolveNdtFormDimKind('기둥', true), 'circle', '기둥 + 원형 → 지름');
assert.strictEqual(M.resolveNdtFormDimKind('원형기둥', false), 'circle');
assert.strictEqual(M.resolveNdtFormDimKind('보(G)', true), 'beam', '보는 원형 토글 무시');
assert.strictEqual(M.resolveNdtFormDimKind('철골기둥', true), 'steel');
// 표/보고서 글자: 원형 기둥 = Φ지름
const round = { component: '기둥', measureDimMode: 'circle', designWidth: 600, measuredWidth: 596 };
assert.strictEqual(M.formatNdtMeasureDimText(round, 'design'), 'Φ600');
assert.strictEqual(M.formatNdtMeasureDimText(round, 'measured'), 'Φ596');
// 예전 사각 기둥(모드 없음/rc/column)은 그대로
const rect = { component: '기둥', designWidth: 600, designDepth: 500, measuredWidth: 598, measuredDepth: 497 };
assert.strictEqual(M.formatNdtMeasureDimText(rect, 'design'), '600 × 500');
assert.strictEqual(M.formatNdtMeasureDimText(Object.assign({ measureDimMode: 'column' }, rect), 'measured'), '598 × 497');
// 저장은 폼의 모양 선택을 따름, 열 때 원형 항목은 원형으로
assert.ok(/resolveNdtFormDimKind\(comp, ndtColumnShapeCircle\)/.test(app));
assert.ok(/ndtColumnShapeCircle = !!\(existingItem && existingItem\.measureDimMode === 'circle'\)/.test(app));
console.log('test-ndt-round-column: ok');
