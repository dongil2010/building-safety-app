// 2026-11-11 「시트 배정을 층을 다 보여주고 엑셀에 어떤 탭을 넣을지로」 — 가져오기 창의 층 기준 배정
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const s = app.indexOf('    function buildImportFloorSheetAssignment');
const e = app.indexOf('    /** 어느 층에도 넣지 않은 탭');
assert.ok(s > 0 && e > s, '배정 함수 위치');
const { build, collect } = new Function(app.slice(s, e)
    + ';return { build: buildImportFloorSheetAssignment, collect: collectImportFloorSheetPairs };')();

const floors = ['B1F', '1F', '2F', '3F', 'ROOF'].map((c) => ({ floorCode: c, floorLabel: c }));
const sheets = [
    { sheetName: '1층', guessedFloorCode: '1F', rows: [[1]] },
    { sheetName: '2층', guessedFloorCode: '2F', rows: [[1]] },
    { sheetName: '1층(추가)', guessedFloorCode: '1F', rows: [[1]] },   // 같은 층으로 추정된 둘째 탭
    { sheetName: '메모', guessedFloorCode: null, rows: [[1]] },        // 맞는 층 없음
    { sheetName: '12층', guessedFloorCode: '12F', rows: [[1]] }        // 건물에 없는 층 코드
];

// 1) 처음 값: 추정된 층에 그 탭, 겹치면 앞 탭만 — 나머지는 미배정으로 알림 대상
const a = build(sheets, floors);
assert.deepStrictEqual(a.byFloor, { '1F': 0, '2F': 1 });
assert.deepStrictEqual(a.unassigned, [2, 3, 4]);
assert.deepStrictEqual(build([], floors), { byFloor: {}, unassigned: [] });

// 2) 층별 선택값 → 가져올 짝: 「넣지 않음」('')·범위 밖은 빠지고 층 순서 유지, 같은 탭을 두 층에 넣을 수 있다
const pairs = collect([
    { floorCode: 'B1F', value: '' },
    { floorCode: '1F', value: '0' },
    { floorCode: '2F', value: '2' },
    { floorCode: '3F', value: '2' },
    { floorCode: 'ROOF', value: '9' },
    { floorCode: '', value: '1' }
], sheets.length);
assert.deepStrictEqual(pairs, [
    { floorCode: '1F', sheetIdx: 0 },
    { floorCode: '2F', sheetIdx: 2 },
    { floorCode: '3F', sheetIdx: 2 }
]);
assert.deepStrictEqual(collect([{ floorCode: '1F', value: '' }], 3), []);

// 3) 화면: 층마다 한 줄(floors.map) + 탭 선택, 예전 탭 기준 선택(import-defect-sheet-floor-map)은 없어야 한다
assert.ok(app.includes('sheetMapBody.innerHTML = floors.map('), '층 기준으로 줄을 만든다');
assert.ok(app.includes('import-defect-floor-sheet-map" data-floor='), '층 줄마다 탭 선택');
assert.ok(app.includes('<option value="">(넣지 않음)</option>'), '「넣지 않음」 선택지');
assert.ok(!app.includes('import-defect-sheet-floor-map'), '탭 기준 선택은 제거');
assert.ok(!/floorBySheetName/.test(app), '탭→층 표는 더 쓰지 않는다');
assert.ok(app.includes('importPairs.forEach((pair) => {'), '가져오기는 층별 짝대로 돈다');
assert.ok(html.includes('층별 시트 배정'), 'index.html 제목');

console.log('test-import-floor-sheet-assign: OK');
