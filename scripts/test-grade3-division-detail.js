'use strict';
// 3종 상태조사표 「구분」 칸 (화면·한글·엑셀 공통 getSurveyCellText('floorGroup'))
//  - 실내 층: 층 + 상세 위치(상세 위치에 층이 있으면 상세 위치만), 비었으면 층만
//  - 외부(입면)·부대시설: 상세 위치만(정면·좌측면·배면·부대시설 …), 비었으면 그 도면 이름 — 2026-10-19
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const LABELS = { '1F': '지상1층', B1F: '지하1층', EXT_FRONT: '정면', EXT_LEFT: '좌측면', EXT: '외부', ANNEX: '부대시설', ROOF: '옥상층' };
const ctx = {
    window: {},
    state: { currentFloor: '1F' },
    getDefectLocationFloorLabel: (fc) => LABELS[fc] || fc
};
vm.createContext(ctx);
vm.runInContext(['getGrade3FloorPrefix', 'isExteriorFloorCode', 'extractDefectLocationDetail', 'isGrade3OutsideDrawing',
    'grade3LocationDetailOnly', 'grade3DivisionText']
    .map((n) => extractFunction(app, 'function ' + n + '(')).join('\n') + '\nthis.g = grade3DivisionText;', ctx);

// 실내 층
const c = { floorCode: '1F' };
assert.strictEqual(ctx.g({ location: '' }, c, '지상1층'), '지상1층', '비었으면 층만');
assert.strictEqual(ctx.g({}, c, '지상1층'), '지상1층');
assert.strictEqual(ctx.g({ location: '지상1층' }, c, '지상1층'), '지상1층');
assert.strictEqual(ctx.g({ location: '지상1층 기둥 C1 하부' }, c, '지상1층'), '지상1층 기둥 C1 하부');
assert.strictEqual(ctx.g({ location: '계단실 벽체' }, c, '지상1층'), '지상1층 계단실 벽체');
assert.strictEqual(ctx.g({ location: '지상1층 보 G2' }, c, '1층'), '1층 보 G2', '표시명이 달라도 층은 한 번만');
assert.strictEqual(ctx.g({ location: '지상1층 지하1층 기계실' }, c, '지상1층'), '지하1층 기계실', '상세 위치에 층이 있으면 그것만');
assert.strictEqual(ctx.g({ location: '옥상 파라펫' }, c, '지상1층'), '옥상 파라펫');

// 외부 입면(한 장씩 보는 화면)
assert.strictEqual(ctx.g({ location: '정면 정면' }, { floorCode: 'EXT_FRONT' }, '정면'), '정면');
assert.strictEqual(ctx.g({ location: '정면 2층 창호 하부' }, { floorCode: 'EXT_FRONT' }, '정면'), '2층 창호 하부', '상세 위치만');
assert.strictEqual(ctx.g({ location: '정면' }, { floorCode: 'EXT_FRONT' }, '정면'), '정면', '비었으면 도면 이름');
// 한글: 외부 입면을 한 표로 묶은 행(_exteriorFloorCode, 원래 위치 _rawLocation)
const ext = { floorCode: 'EXT' };
assert.strictEqual(ctx.g({ location: '좌측면 외벽', _rawLocation: '좌측면 외벽', _exteriorFloorCode: 'EXT_LEFT' }, ext, '외부'), '외벽');
assert.strictEqual(ctx.g({ location: '좌측면 배면 쪽 모서리', _rawLocation: '배면 쪽 모서리', _exteriorFloorCode: 'EXT_LEFT' }, ext, '외부'), '배면 쪽 모서리', '적은 그대로');
assert.strictEqual(ctx.g({ location: '좌측면', _rawLocation: '좌측면', _exteriorFloorCode: 'EXT_LEFT' }, ext, '외부'), '좌측면', '비었으면 그 입면 이름');
assert.strictEqual(ctx.g({ location: '외부 북측면' }, { floorCode: 'EXT' }, '외부'), '북측면');
// 부대시설 도면
assert.strictEqual(ctx.g({ location: '부대시설 정화조 상부' }, { floorCode: 'ANNEX' }, '부대시설'), '정화조 상부');
assert.strictEqual(ctx.g({ location: '' }, { floorCode: 'ANNEX' }, '부대시설'), '부대시설');

// 연결: 화면·한글·엑셀이 모두 같은 칸 함수
const cell = extractFunction(app, 'function getSurveyCellText(');
assert.ok(/case 'floorGroup': return grade3DivisionText\(d, ctx,/.test(cell));
assert.strictEqual((app.match(/ctx\.floorDisplayLabel \|\| getSurveyCellText\('floorGroup'/g) || []).length, 0);
assert.strictEqual((app.match(/^\s+getSurveyCellText\('floorGroup', d, ctx\),$/gm) || []).length, 2, '한글 상태조사표 2곳(6칸·7칸)');
assert.ok(/_rawLocation: d\.location \|\| ''/.test(extractFunction(app, 'function buildCombinedExteriorSurveyDefects(')), '외부 묶음은 적은 위치를 같이 넘긴다');
console.log('test-grade3-division-detail: ok');
