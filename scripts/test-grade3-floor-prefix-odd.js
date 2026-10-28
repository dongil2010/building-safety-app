'use strict';
// 2026-10-28 3종 한글 층 접두사: 어떤 규칙에도 안 걸린 특이한 층은 이름 첫 글자 초성(로마자)으로 — 중2층 → J2, 지하주차장 → J.
// 이미 정해진 접두사(숫자층·B·R·RR·RF·PH·PH{N}·PHR·P·G·O)와 겹치는 글자(R·P·G·O·B)는 접두사를 만들지 않고 이름 그대로(보류).
// 기존 규칙의 결과는 하나도 바뀌지 않는다. (합성 이름)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const stateSrc = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');
const labels = { Z1: '화장실', Z2: '필로티', Z3: '지하주차장', Z4: '중 2층' };
const ctx = { window: { getFloorLabelFromCode: (c) => labels[c] || c, isExteriorFloorCode: () => false } };
vm.createContext(ctx);
vm.runInContext(extractFunction(stateSrc, 'window.parseRooftopIndex = function(') + ';\n'
    + extractFunction(app, 'function getGrade3RoofPrefix(') + '\n'
    + extractFunction(app, 'function getGrade3FloorPrefix(') + '\nthis.p = getGrade3FloorPrefix;', ctx);
const p = (c) => ctx.p(c);

// 1) 초성 매핑 (평자음·쌍자음·ㅇ 건너뛰기·영문·숫자)
const odd = {
    중2층: 'J2', '중 2층': 'J2', 지하주차장: 'J', '지하 1층 주차장': 'J1', 주차장: 'J', 전기실: 'J', 화장실: 'H', 홀: 'H', 한옥: 'H',
    옥내주차장: 'N', 샤프트: 'S', 쓰레기장: 'S', 승강기: 'S', 다락방: 'D', 대피공간: 'D', 창고: 'C', 출입구: 'C', 캐노피: 'K', 테라스: 'T',
    마당: 'M', 쌍용동: 'S', 따로: 'D', 짜장실: 'J',
    Lobby: 'L', Lobby2: 'L2', Ticket: 'T', '(주)주차': 'J', '지하주차장-2': 'J2'
};
Object.keys(odd).forEach((n) => assert.strictEqual(p(n), odd[n], `${n} → ${odd[n]} (실제 ${p(n)})`));

// 2) 이미 정해진 접두사와 겹치는 초성(R·P·G·O·B)은 접두사를 만들지 않고 이름 그대로 — 보류
['필로티', '기계실', '계단실', '반지하', '로비', '엘리베이터', '오락실', '펌프실', '피난층', 'Office', 'Pump room', 'Boiler', 'Gym', 'Roomx', '그늘막', '배전실'].forEach((n) => {
    assert.strictEqual(p(n), n, `${n} 는 충돌이라 그대로`);
});
// 숫자로 시작/지상N층은 건드리지 않음
['3층', '2.5층', '지상2층', '지상 3층'].forEach((n) => assert.strictEqual(p(n), n));

// 3) 기존 규칙의 결과는 그대로
const keep = {
    '1F': '1', '2F': '2', B1F: 'B1', B2F: 'B2', ROOF: 'R', 옥상층: 'R', 옥상지붕층: 'RR', 지붕층: 'RF', 옥탑층: 'PH', 옥탑1층: 'PH1', PH_ROOF: 'PHR',
    EXT: 'O', 외부: 'O', 외부1: 'O', 부대시설: 'O', 지하층: 'B1', 지하1층: 'B1', 지하2층: 'B2', '지하 1F': 'B1', 피트: 'P', 피트층: 'P', 그리드아이언: 'G', '그리드 아이언': 'G'
};
Object.keys(keep).forEach((n) => assert.strictEqual(p(n), keep[n], `기존 규칙 ${n} → ${keep[n]}`));

// 4) 등록된 이름(label) 기준 — 코드가 임의 문자열이어도 이름으로
assert.strictEqual(p('Z1'), 'H');
assert.strictEqual(p('Z2'), 'Z2', '필로티는 충돌 → 코드 그대로');
assert.strictEqual(p('Z3'), 'J');
assert.strictEqual(p('Z4'), 'J2');

// 5) 한 건물에서 첫 글자가 같은 특이한 층은 같은 접두사 — 번호가 겹칠 수 있음(보고용으로 고정)
assert.strictEqual(p('주차장'), p('전기실'));
assert.strictEqual(p('지하주차장'), p('주차장'));
assert.notStrictEqual(p('중2층'), p('주차장'), '숫자가 다르면 구분됨');

console.log('test-grade3-floor-prefix-odd: OK');
