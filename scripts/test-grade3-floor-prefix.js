'use strict';
// 2026-10-28 3종 한글(조사표) 결함 번호 접두사: 층 이름이 「지하층」이면 「지하층-1」이 나오던 것을 B1-1 로.
//  지하층·지하(번호 없음)·지하1층·B1F → B1 / 지하N층·BNF → BN / 피트 → P / 그리드아이언 → G / 외부·부대시설 → O (이미 있던 규칙, 그대로)
//  이미 맞던 것(지상 N층 → N, 옥상·옥탑·지붕 계열 R·RR·RF·PH·PH{n}·PHR)은 그대로. 1·2종 번호는 접두사 없이 그대로. (합성 데이터)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const stateSrc = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');

// 표시 이름 조회(등록된 층 이름) 흉내 — 코드는 그대로 두고 이름만 바꾼 층
const labels = { X1: '피트층', X2: '그리드 아이언', X3: '부대시설 정화조', X4: '지하층', '2F': '2층', IMG_9: 'IMG_9', X5: '지하 주차장' };
const ctx = { window: { getFloorLabelFromCode: (c) => labels[c] || c, isExteriorFloorCode: () => false } };
vm.createContext(ctx);
vm.runInContext(extractFunction(stateSrc, 'window.parseRooftopIndex = function(') + ';\n'
    + extractFunction(app, 'function getGrade3RoofPrefix(') + '\n'
    + extractFunction(app, 'function getGrade3FloorPrefix(') + '\n'
    + extractFunction(app, 'function formatSurveyReportNo(')
    + '\nthis.p = getGrade3FloorPrefix; this.fmt = formatSurveyReportNo;', ctx);
// formatSurveyReportNo 가 쓰는 보조 함수(번호 꼬리 제거)는 그대로 통과
ctx.stripDefectNoSuffix = (x) => x;
vm.runInContext('var stripDefectNoSuffix = this.stripDefectNoSuffix; var getGrade3FloorPrefix = this.p; this.fmt = formatSurveyReportNo;', ctx);

const cases = {
    // 이미 맞던 규칙 — 그대로
    '1F': '1', '2F': '2', '10F': '10', B1F: 'B1', B2F: 'B2', B10F: 'B10',
    ROOF: 'R', 옥상층: 'R', 옥상지붕층: 'RR', 지붕층: 'RF', 옥탑층: 'PH', 옥탑1층: 'PH1', PH: 'PH', PH_ROOF: 'PHR',
    EXT: 'O', EXT_1: 'O', EXT_FRONT: 'O', 외부: 'O', 외부1: 'O', 부대시설: 'O',
    // 새로 맞추는 것
    지하층: 'B1', 지하: 'B1', '지하 층': 'B1', 지하1층: 'B1', '지하 1층': 'B1', '지하1F': 'B1', '지하 1F': 'B1', '지하1': 'B1',
    지하2층: 'B2', '지하 2층': 'B2', 지하10층: 'B10', 'B 1F': 'B1', B1: 'B1', b2: 'B2', 'B-1F': 'B1', 'B2': 'B2',
    피트: 'P', 피트층: 'P', '피트 층': 'P', PIT: 'P', pit: 'P', 'PIT층': 'P', '엘리베이터 피트': 'P',
    그리드아이언: 'G', '그리드 아이언': 'G', 그리드아이언층: 'G', GRIDIRON: 'G', 'GRID IRON': 'G', 'GRID_IRON': 'G'
};
Object.keys(cases).forEach((c) => assert.strictEqual(ctx.p(c), cases[c], `${c} → ${cases[c]} (실제 ${ctx.p(c)})`));

// 지하·피트·그리드 규칙에 해당 없음 — 지하(B1) 규칙으로는 안 잡힌다(초성 규칙은 test-grade3-floor-prefix-odd.js).
// 초성이 R·P·G·O·B 와 겹치는 이름은 이름 그대로 남는다.
['반지하', '필로티', '기계실', '루프', 'PITCH'].forEach((c) => {
    assert.strictEqual(ctx.p(c), c, `${c} 는 그대로`);
});
['지하주차장', '지하 1층 주차장'].forEach((c) => assert.ok(!/^B/.test(ctx.p(c)), `${c} 는 지하(B) 접두사가 아니다`));
// 등록된 이름(label)으로 알아보기: 코드는 임의 문자열이어도 이름이 피트층·그리드 아이언·부대시설·지하층이면 맞춘다
assert.strictEqual(ctx.p('X1'), 'P');
assert.strictEqual(ctx.p('X2'), 'G');
assert.strictEqual(ctx.p('X3'), 'O');
assert.strictEqual(ctx.p('X4'), 'B1');
assert.ok(!/^B/.test(ctx.p('X5')), '지하 주차장 이름은 지하(B) 규칙이 아니다');
// 코드가 정해져 있으면 이름보다 코드가 우선(2F 를 「지하층」으로 이름만 바꿔도 번호는 2)
labels['2F'] = '지하층';
assert.strictEqual(ctx.p('2F'), '2');
labels['2F'] = '2층';

// 지하층과 지하1층은 같은 접두사 → 한 건물에 둘 다 있으면 번호가 겹칠 수 있다(보고용으로 고정)
assert.strictEqual(ctx.p('지하층'), ctx.p('B1F'));

// 번호 글자: 3종만 접두사, 1·2종은 그대로
const d = { no: 'NO.3' };
assert.strictEqual(ctx.fmt(d, true, '지하층'), 'B1-3');
assert.strictEqual(ctx.fmt(d, true, '지하2층'), 'B2-3');
assert.strictEqual(ctx.fmt(d, true, '피트'), 'P-3');
assert.strictEqual(ctx.fmt(d, true, '그리드아이언'), 'G-3');
assert.strictEqual(ctx.fmt(d, true, '2F'), '2-3');
assert.strictEqual(ctx.fmt(d, false, '지하층'), '3', '1·2종은 접두사 없음');

// 외부는 A 가 아니라 O (hwpx 범례 O-외부) — 기존 결정 유지
const fnSrc = extractFunction(app, 'function getGrade3FloorPrefix(');
assert.ok(/return 'O'/.test(fnSrc) && !/return 'A'/.test(fnSrc));

console.log('test-grade3-floor-prefix: OK');
