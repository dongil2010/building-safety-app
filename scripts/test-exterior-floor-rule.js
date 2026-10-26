'use strict';
// 2026-10-26 외부 도면 판정 하나(이름에 외부) · 지붕층 등록/자동 인식 · 목록 순서 — 테스트 데이터만
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx;
ctx.document = { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } };
ctx.localStorage = { getItem() { return null; }, setItem() {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'core', 'floor-identity.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8'), ctx);
const W = ctx.window;
const FI = W.BSA.floorIdentity;
const ext = (c, l) => W.isExteriorFloorCode(c, l);

// 1) 코드 규칙은 그대로
['EXT', 'EXT_1', 'EXT_FRONT', '외부', '외부1', '외부-정면', '입면도'].forEach((c) => assert.ok(ext(c, ''), `코드 ${c}`));
['1F', 'B1F', 'ROOF', 'PH', '지붕층', '필로티'].forEach((c) => assert.ok(!ext(c, ''), `코드 ${c} 외부 아님`));

// 2) 표시 이름에 외부(공백·붙임표 무시) — 층 코드는 그대로여도 외부
['외부', '외부-정면', '외부 좌측면', '외 부', '외부_배면', '건축물 외부 (EXT)', '외부–정면'.replace('–', '-')].forEach((l) => assert.ok(ext('2F', l), `이름 ${l}`));
assert.ok(!ext('2F', '지상 2층 (2F)'));
assert.ok(!ext('2F', '정면도'), '이름에 외부가 없으면 코드 규칙만(2F는 외부 아님)');
// 이름을 안 주면 보고 있는 건물의 floorsList에서 찾는다
W.state = { currentBuilding: { floorsList: [{ floorCode: '3F', floorLabel: '외부-정면' }, { floorCode: '4F', floorLabel: '지상 4층 (4F)' }] } };
assert.ok(ext('3F'));
assert.ok(!ext('4F'));
// 외부로 만든 이름을 다시 바꾸면(코드 일반) 외부 아님으로 돌아온다 — 데이터는 층 코드 키 그대로
W.state.currentBuilding.floorsList[0].floorLabel = '3층 평면도';
assert.ok(!ext('3F'));
// EXT_n 코드는 이름을 바꿔도 외부(핀·결함 키가 그 코드라서)
W.state.currentBuilding.floorsList.push({ floorCode: 'EXT_2', floorLabel: '정면도' });
assert.ok(ext('EXT_2'));

// 3) 순서
const mk = (arr) => arr.map((x) => (typeof x === 'string' ? { floorCode: x, floorLabel: x } : x));
const codes = (l) => Array.from(l, (f) => f.floorCode);
const floors = mk(['3F', 'ROOF', 'B2F', '지붕층', '1F', 'PH', 'B1F', '2F', 'PH_ROOF', 'EXT_1', 'EXT_2', '반지하', '지하층']);
const asc = FI.sortFloorsLowToHigh(floors);
assert.deepStrictEqual(codes(asc), ['B2F', 'B1F', '지하층', '반지하', '1F', '2F', '3F', 'ROOF', 'PH', 'PH_ROOF', '지붕층', 'EXT_1', 'EXT_2'], '저층→고층(저장·출력 순서)');
assert.deepStrictEqual(codes(FI.sortFloorsForDisplay(floors)), ['지붕층', 'PH_ROOF', 'PH', 'ROOF', '3F', '2F', '1F', '반지하', '지하층', 'B1F', 'B2F', 'EXT_1', 'EXT_2'], '목록(위→아래): 지붕 맨 위, 지하 아래, 외부 끝');
// 이름만 외부로 바꾼 층은 외부 자리
const renamed = mk(['1F', { floorCode: '2F', floorLabel: '외부-정면' }, '3F', 'B1F']);
assert.deepStrictEqual(codes(FI.sortFloorsLowToHigh(renamed)), ['B1F', '1F', '3F', '2F']);
// 한국어 혼합 이름
const mixed = mk(['지하 1층', '3층', '옥탑층', '지상 2층', '옥상', '지붕', '1F', '지하2층', 'B3']);
const m = codes(FI.sortFloorsLowToHigh(mixed));
const pos = (c) => m.indexOf(c);
assert.ok(pos('B3') < pos('지하2층') && pos('지하2층') < pos('지하 1층') && pos('지하 1층') < pos('1F'), '지하 순서');
assert.ok(pos('1F') < pos('지상 2층') && pos('지상 2층') < pos('3층'), '지상 순서(3층 표기 포함)');
assert.ok(pos('3층') < pos('옥상') && pos('옥상') < pos('옥탑층') && pos('옥탑층') < pos('지붕'), '옥상<옥탑<지붕');
// 코드는 바뀌지 않는다
assert.deepStrictEqual(codes(FI.sortFloorsLowToHigh(floors)).slice().sort(), codes(floors).slice().sort());

// 4) 지붕층 등록·자동 인식 (옥상·옥탑과 별개 층 — 2026-10-16 결정 유지)
const P = (n) => W.parseFloorInfoFromFilename(n);
['지붕층.pdf', '지붕층 평면도.pdf', '지붕.jpg', '지붕층-평면도.png', '지붕 평면도.pdf'].forEach((n) => {
    const r = P(n);
    assert.strictEqual(r.floorCode, '지붕층', n);
    assert.strictEqual(r.matched, true, n);
});
assert.strictEqual(P('옥상.pdf').floorCode, 'ROOF');
assert.strictEqual(P('옥탑.pdf').floorCode, 'PH');
assert.strictEqual(P('옥탑지붕층.pdf').floorCode, 'PH_ROOF');
assert.strictEqual(P('ROOF.pdf').floorCode, 'ROOF');
assert.strictEqual(P('옥상지붕층.pdf').floorCode, '옥상지붕층');
assert.strictEqual(P('지붕배수상세.pdf').matched, false, '지붕이 앞에 와도 다른 말이 붙으면 건드리지 않음');
assert.ok(W.FLOOR_CODE_OPTION_LIST.includes('지붕층'));
// 5) 등록창 선택지: 외부 이름 21개 숨기고 한 줄
['EXT', 'EXT_1', 'EXT_12', 'EXT_FRONT', 'EXT_BACK', 'EXT_LEFT', 'EXT_RIGHT', 'EXT_N', 'EXT_E', 'EXT_S', 'EXT_W'].forEach((c) => assert.ok(!W.FLOOR_CODE_OPTION_LIST.includes(c), c));
assert.ok(W.FLOOR_CODE_OPTION_LIST.includes('__EXT_NEXT__'));
assert.strictEqual(W.FLOOR_CODE_OPTION_LIST.length, 10 + 30 + 3 + 1 + 1);
// 이미 등록된 외부는 목록에서 숨겨도 선택 항목으로 남는다(✏️ 직접 입력 표시 아님)
const html = W.buildFloorCodeOptionsHtml('EXT_3');
assert.ok(html.includes('value="EXT_3" selected') && !html.includes('✏️ EXT_3'));
// 자동 번호
assert.strictEqual(FI.allocateNextExteriorSerial(['EXT_1', '1F']).floorCode, 'EXT_2');
assert.strictEqual(FI.allocateNextExteriorSerial([]).floorCode, 'EXT_1');
console.log('test-exterior-floor-rule: ok');
