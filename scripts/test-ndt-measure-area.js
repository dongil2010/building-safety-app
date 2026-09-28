#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 부재실측 결과표 — 설계치·실측치 규격 아래 괄호로 단면적(mm²)
 * 사각(폭×춤)·원형(π(d/2)²)·철골(H형 단면적)은 보이고, 두께 하나뿐인 슬래브·벽체와 치수가 모자란 건 안 보인다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const ctx = { isNdtSteelComponent: (t) => /철골|H형/.test(t) };
vm.createContext(ctx);
vm.runInContext([
    'getNdtMeasureDimKind', 'calcSteelSectionArea', 'resolveNdtSteelMeasuredDims', 'resolveNdtSteelMeasuredFromItem',
    'formatNdtSteelDimText', 'formatNdtMeasureDimText', 'calcNdtMeasureSectionArea', 'formatNdtMeasureAreaText',
    'formatNdtMeasureDimWithArea'
].map((n) => extractFunction('function ' + n + '(')).join('\n') + '\nthis.f = formatNdtMeasureDimWithArea; this.area = calcNdtMeasureSectionArea;', ctx);

// 사각 기둥·보: 폭×춤
const col = { component: '기둥', designWidth: 700, designDepth: 800, measuredWidth: 710, measuredDepth: 810 };
assert.strictEqual(ctx.f(col, 'design', '×'), '700×800\n(560,000mm²)');
assert.strictEqual(ctx.f(col, 'measured', '×'), '710×810\n(575,100mm²)');
assert.strictEqual(ctx.f(col, 'design', ' × ', '<br>'), '700 × 800<br>(560,000mm²)', '화면 표는 <br>');

// 원형 기둥: 지름
const circle = { component: '원형기둥', measureDimMode: 'circle', designWidth: 600, measuredWidth: 610 };
assert.strictEqual(ctx.f(circle, 'design', '×'), 'Φ600\n(282,743mm²)');

// 철골 H-400×200×8×13: 2·200·13 + 8·(400−26) = 5200 + 2992 = 8192
const steel = { component: '철골 보', measureDimMode: 'steel', designWebWidth: 400, designFlangeWidth: 200, designWeb: 8, designFlange: 13 };
assert.strictEqual(ctx.area(steel, 'design'), 8192);
assert.strictEqual(ctx.f(steel, 'measured', '×'), '400×200×8×13\n(8,192mm²)', '철골 실측이 비면 설계치로 채운 규격·면적');

// 면적을 안 보이는 경우
assert.strictEqual(ctx.f({ component: '슬래브', designWidth: 150 }, 'design', '×'), '150', '두께만 있는 부재는 규격만');
assert.strictEqual(ctx.f({ component: '보', designWidth: 400 }, 'design', '×'), '400', '춤이 없으면 규격만');
assert.strictEqual(ctx.f({ component: '보' }, 'design', '×'), '-', '값이 없으면 그대로 -');
// 옛 항목: 실측 폭이 avgValue에만 있다
assert.strictEqual(ctx.f({ component: '보', avgValue: '300', measuredDepth: 600 }, 'measured', '×'), '300×600\n(180,000mm²)');

// 한글(1·2종·3종)·화면 표·보고서 미리보기가 단면적 붙은 글자를 쓴다 (CSV는 칸 모양을 안 바꾸려고 그대로)
assert.strictEqual((app.match(/formatNdtMeasureDimWithArea\(item, 'design', '×'\)/g) || []).length, 2);
assert.strictEqual((app.match(/formatNdtMeasureDimWithArea\(item, 'measured', ' × ', '<br>'\)/g) || []).length, 2);

console.log('test-ndt-measure-area: ok');
