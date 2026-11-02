'use strict';
// 2026-11-02 1·2종 한글(HWPX) 상태조사표·사진표: 부대시설 도면에 상세 위치를 안 적으면 위치 칸에 「외부」
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const LABELS = { '1F': '지상1층', ANNEX: '부대시설', EXT_FRONT: '정면' };
const ctx = { getDefectLocationFloorLabel: (fc) => LABELS[fc] || fc };
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function hwpxAnnexEmptyLocationText(') + '\nthis.f = hwpxAnnexEmptyLocationText;', ctx);
assert.strictEqual(ctx.f('ANNEX'), '외부');
assert.strictEqual(ctx.f('1F'), '');
assert.strictEqual(ctx.f('EXT_FRONT'), '');
assert.strictEqual(ctx.f(''), '');
// 연결: 상태조사표 행(한글 단위 표기일 때만, 비었을 때만)과 사진표 위치 칸
const row = extractFunction(app, 'function getReportSurveyRowValues(');
assert.ok(/getSurveyCellText\('location', d, \{ floorCode: ctx\.floorCode \}\)\s*\n\s*\|\| \(ctx\.hwpxUnits \? hwpxAnnexEmptyLocationText\(ctx\.floorCode\) : ''\)/.test(row));
assert.ok(app.includes("getSurveyCellText('location', d, { floorCode: fc }) || hwpxAnnexEmptyLocationText(fc)"));
console.log('test-hwpx-annex-empty-location: ok');
