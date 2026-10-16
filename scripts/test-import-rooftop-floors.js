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
    // 지붕층은 옥상층·옥탑 지붕층과 다른 층 → 앱에 지붕층이 없으면 연결 안 함. RF(번호 없음)는 뜻이 정해져 있지 않아 자동 연결 안 함
    'RF': null, '지붕층': null, '옥상층': 'ROOF', '옥탑지붕층': 'PH_ROOF',
    '1층': '1F', '지하1층': 'B1F', '12층': null    // 없는 층은 아무 층으로 가지 않음
};
for (const [k, v] of Object.entries(expA)) assert.strictEqual(guess(k, A), v, `A: ${k} → ${v}`);

// B) 옥탑1층·옥탑2층을 따로 만든 건물
const B = [...mk(['B1F', '1F', '2F', 'ROOF']), { floorCode: '옥탑1층', floorLabel: '옥탑1층' }, { floorCode: '옥탑2층', floorLabel: '옥탑2층' }];
const expB = {
    '옥탑1층': '옥탑1층', '옥탑 1층': '옥탑1층', 'PH1': '옥탑1층', 'RF1': '옥탑1층',
    '옥탑2층': '옥탑2층', '옥탑 2층': '옥탑2층', 'PH2': '옥탑2층', 'RF2': '옥탑2층',
    '1층': '1F', '2층': '2F', '지붕층': null
};
for (const [k, v] of Object.entries(expB)) assert.strictEqual(guess(k, B), v, `B: ${k} → ${v}`);
// C) 지붕층을 따로 만든 건물 → 지붕층 시트는 거기로, 옥상층 시트는 옥상층으로
const C = [...mk(['1F', 'ROOF', 'PH_ROOF']), { floorCode: '지붕층', floorLabel: '지붕층' }, { floorCode: 'RF', floorLabel: 'RF' }];
assert.strictEqual(guess('지붕층', C), '지붕층');
assert.strictEqual(guess('지붕 층', C), '지붕층');
assert.strictEqual(guess('옥상층', C), 'ROOF');
assert.strictEqual(guess('옥탑 지붕층', C), 'PH_ROOF');
assert.strictEqual(guess('RF', C), 'RF', 'RF라는 층이 앱에 있으면 그대로');

// 정렬: 지하 < 지상 < 옥상 < 옥탑1 < 옥탑2 < 옥탑지붕
const r = (c) => FI.rankFromCode(c);
assert.ok(r('B1F') < r('1F') && r('1F') < r('10F') && r('10F') < r('ROOF'));
assert.ok(r('ROOF') < r('옥탑1층') && r('옥탑1층') < r('옥탑2층') && r('옥탑2층') < r('PH_ROOF'));
assert.ok(r('PH1') < r('PH2'));
assert.ok(r('지붕층') > r('PH_ROOF') && r('지붕층') > r('옥탑2층'), '지붕층은 맨 위');
const sorted = FI.sortFloorsLowToHigh(['지붕층', '옥탑2층', '2F', 'ROOF', '옥탑1층', 'B1F', '1F'].map((c) => ({ floorCode: c }))).map((f) => f.floorCode);
assert.deepStrictEqual(sorted, ['B1F', '1F', '2F', 'ROOF', '옥탑1층', '옥탑2층', '지붕층']);
// 이름: 번호를 살림
assert.strictEqual(FI.labelFromCode('PH2'), '옥탑2층 (PH2)');
assert.strictEqual(FI.labelFromCode('옥탑1층'), '옥탑1층');
assert.strictEqual(FI.labelFromCode('PH'), '옥탑층 (PH)');
// 맞는 층이 없으면 화면에 알림
assert.ok(app.includes('import-floor-nomatch'), '맞는 층 없음 알림');
// 2026-10-16 지붕층·옥상층·옥상지붕층·옥탑지붕층은 모두 다른 층 — 서로 대신 연결하지 않음
{
    const four = ['지붕층', '옥상층', '옥상지붕층', '옥탑지붕층'];
    const D = [...mk(['1F', 'ROOF', 'PH_ROOF']), { floorCode: '지붕층', floorLabel: '지붕층' }, { floorCode: '옥상지붕층', floorLabel: '옥상지붕층' }];
    const want = { '지붕층': '지붕층', '옥상층': 'ROOF', '옥상지붕층': '옥상지붕층', '옥탑지붕층': 'PH_ROOF', '옥상 지붕층': '옥상지붕층', '옥탑 지붕층': 'PH_ROOF' };
    for (const [k, v] of Object.entries(want)) assert.strictEqual(guess(k, D), v, `D: ${k} → ${v}`);
    // 하나씩 빠진 건물: 빠진 층의 시트는 다른 셋 어디로도 가지 않음(⚠ 알림 대상)
    for (const miss of four) {
        const floors = D.filter((f) => want[miss] !== f.floorCode);
        assert.strictEqual(guess(miss, floors), null, `${miss} 없으면 연결 안 함`);
    }
    // 정렬: 지상 < 옥상 < 옥상지붕 < 옥탑1 < 옥탑2 < 옥탑지붕 < 지붕
    const order = ['10F', 'ROOF', '옥상지붕층', '옥탑1층', '옥탑2층', 'PH_ROOF', '지붕층'];
    for (let i = 1; i < order.length; i++) assert.ok(r(order[i - 1]) < r(order[i]), `${order[i - 1]} < ${order[i]}`);
    const sorted2 = FI.sortFloorsLowToHigh(['지붕층', 'PH_ROOF', '옥탑2층', '옥상지붕층', '옥탑1층', 'ROOF', '10F'].map((c) => ({ floorCode: c }))).map((f) => f.floorCode);
    assert.deepStrictEqual(sorted2, order);
    // 옥상지붕층은 옥상층(ROOF) 이름으로 바뀌지 않음(저장 코드 그대로)
    assert.strictEqual(FI.labelFromCode('옥상지붕층'), '옥상지붕층');
    assert.strictEqual(FI.labelFromCode('ROOF'), '옥상층 (ROOF)');
}
console.log('test-import-rooftop-floors OK');
