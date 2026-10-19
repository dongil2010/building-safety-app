'use strict';
// 2026-10-19 3종 상태조사표 「구분」 칸 — 상세 위치가 있으면 층 + 상세 위치, 없으면 층만(화면·한글·엑셀 공통 getSurveyCellText)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const ctx = {
    state: { currentFloor: '1F' },
    getDefectLocationFloorLabel: (fc) => ({ '1F': '지상1층', B1: '지하1층', O: '외부' }[fc] || fc)
};
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function extractDefectLocationDetail(') + '\n' + extractFunction(app, 'function grade3DivisionText(') + '\nthis.g = grade3DivisionText;', ctx);

const c = { floorCode: '1F' };
assert.strictEqual(ctx.g({ location: '' }, c, '지상1층'), '지상1층', '비었으면 예전처럼 층만');
assert.strictEqual(ctx.g({}, c, '지상1층'), '지상1층');
assert.strictEqual(ctx.g({ location: '지상1층' }, c, '지상1층'), '지상1층', '층 이름만이면 층만');
assert.strictEqual(ctx.g({ location: '지상1층 기둥 C1 하부' }, c, '지상1층'), '지상1층 기둥 C1 하부');
assert.strictEqual(ctx.g({ location: '계단실 벽체' }, c, '지상1층'), '지상1층 계단실 벽체', '층이 안 붙은 상세 위치엔 층을 붙인다');
// 구분 표시명이 등록 층 라벨(예: 1층)로 다를 때 — 앞의 「지상1층」은 떼고 붙인다
assert.strictEqual(ctx.g({ location: '지상1층 보 G2' }, c, '1층'), '1층 보 G2');
assert.strictEqual(ctx.g({ location: '외부 북측면' }, { floorCode: 'O' }, '외부'), '외부 북측면');

const cell = extractFunction(app, 'function getSurveyCellText(');
assert.ok(/case 'floorGroup': return grade3DivisionText\(d, ctx,/.test(cell), 'getSurveyCellText가 상세 위치를 쓴다');
assert.strictEqual((app.match(/ctx\.floorDisplayLabel \|\| getSurveyCellText\('floorGroup'/g) || []).length, 0, '층 라벨이 상세 위치를 가리지 않는다');
assert.strictEqual((app.match(/^\s+getSurveyCellText\('floorGroup', d, ctx\),$/gm) || []).length, 2);
console.log('test-grade3-division-detail: ok');
