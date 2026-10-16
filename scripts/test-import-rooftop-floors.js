// 2026-10-16 「엑셀표 가져올때 옥탑층, 옥탑1층 이런 층들도 있다」 — 시트 이름 ↔ 앱 층 매칭·정렬
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const st = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');
global.window = globalThis;
window.EXT_DIRECTION_DEFS = window.EXT_DIRECTION_DEFS || [];
// state.js의 옥상·옥탑 판정 부분만
eval(st.slice(st.indexOf('window.ROOF_FLOOR_DEFS'), st.indexOf('window.parseFloorInfoFromFilename')));
const FI = require(path.join(root, 'js', 'core', 'floor-identity.js'));
const s1 = app.indexOf('    function isInteriorFloorDrawingCode');
const e1 = app.indexOf('\n    }\n', s1) + 7;
const s2 = app.indexOf('    function parseSheetFloorStoryHint');
const e2 = app.indexOf('    window.handleImportDefectExcelFile');
assert.ok(s1 > 0 && s2 > 0 && e2 > s2);
const guess = new Function('isExteriorFloorCode', app.slice(s1, e1) + app.slice(s2, e2) + ';return guessFloorForSheetName;')((c) => /^EXT/.test(c));
const mk = (codes) => codes.map((c) => ({ floorCode: c, floorLabel: FI.labelFromCode(c) }));

// A) 표준 층 + 옥상·옥탑·옥탑지붕
const A = mk(['B1F', '1F', '2F', '3F', 'ROOF', 'PH', 'PH_ROOF']);
const expA = {
    '옥탑층': 'PH', '옥탑1층': 'PH', '옥탑 1층': 'PH', 'PH': 'PH', 'PH1': 'PH', 'RF1': 'PH',
    '옥탑2층': null, 'PH2': null,                 // 옥탑 2층이 앱에 없음 → 1층·옥탑층으로 몰지 않고 직접 선택
    'RF': 'ROOF', '지붕층': 'ROOF', '옥상층': 'ROOF', '옥탑지붕층': 'PH_ROOF',
    '1층': '1F', '지하1층': 'B1F', '12층': null    // 없는 층은 아무 층으로 가지 않음
};
for (const [k, v] of Object.entries(expA)) assert.strictEqual(guess(k, A), v, `A: ${k} → ${v}`);

// B) 옥탑1층·옥탑2층을 따로 만든 건물
const B = [...mk(['B1F', '1F', '2F', 'ROOF']), { floorCode: '옥탑1층', floorLabel: '옥탑1층' }, { floorCode: '옥탑2층', floorLabel: '옥탑2층' }];
const expB = {
    '옥탑1층': '옥탑1층', '옥탑 1층': '옥탑1층', 'PH1': '옥탑1층', 'RF1': '옥탑1층',
    '옥탑2층': '옥탑2층', '옥탑 2층': '옥탑2층', 'PH2': '옥탑2층', 'RF2': '옥탑2층',
    '1층': '1F', '2층': '2F', '지붕층': 'ROOF'
};
for (const [k, v] of Object.entries(expB)) assert.strictEqual(guess(k, B), v, `B: ${k} → ${v}`);

// 정렬: 지하 < 지상 < 옥상 < 옥탑1 < 옥탑2 < 옥탑지붕
const r = (c) => FI.rankFromCode(c);
assert.ok(r('B1F') < r('1F') && r('1F') < r('10F') && r('10F') < r('ROOF'));
assert.ok(r('ROOF') < r('옥탑1층') && r('옥탑1층') < r('옥탑2층') && r('옥탑2층') < r('PH_ROOF'));
assert.ok(r('PH1') < r('PH2') && r('RF') === r('ROOF') && r('지붕층') === r('ROOF'));
const sorted = FI.sortFloorsLowToHigh(['옥탑2층', '2F', 'ROOF', '옥탑1층', 'B1F', '1F'].map((c) => ({ floorCode: c }))).map((f) => f.floorCode);
assert.deepStrictEqual(sorted, ['B1F', '1F', '2F', 'ROOF', '옥탑1층', '옥탑2층']);
// 이름: 번호를 살림
assert.strictEqual(FI.labelFromCode('PH2'), '옥탑2층 (PH2)');
assert.strictEqual(FI.labelFromCode('옥탑1층'), '옥탑1층');
assert.strictEqual(FI.labelFromCode('PH'), '옥탑층 (PH)');
// 맞는 층이 없으면 화면에 알림
assert.ok(app.includes('import-floor-nomatch'), '맞는 층 없음 알림');
console.log('test-import-rooftop-floors OK');
