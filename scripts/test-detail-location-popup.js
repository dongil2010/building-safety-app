#!/usr/bin/env node
'use strict';
/**
 * 2026-11-17 「상세위치 입력」 팝업: 글자를 쓰고 마킹을 고른 뒤(순서 상관없음) 적용 → 고른 마킹들의 상세위치에 그 글자.
 * 3종은 층 이름을 앞에 붙임(composeDefectLocation). 이미 같은 글자인 마킹은 건드리지 않음.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

// 1) 대상 고르기(순수)
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function planDetailLocationApply(') + ';this.plan = planDetailLocationApply;', ctx);
// vm 안에서 만든 배열은 바깥 배열과 원형이 달라 deepStrictEqual이 어긋난다 — JSON으로 바꿔 비교
const plain = (v) => JSON.parse(JSON.stringify(v));
const plan = (...args) => ctx.plan(...args);

const defects = [
    { id: 'a', location: '' },
    { id: 'b', location: '101호' },
    { id: 'c', location: '계단실' },
    { id: 'd', location: '' }
];
const sel = new Set(['a', 'b', 'c', 'zz']);
const same = (t) => t; // 1·2종: 적은 그대로
let r = plan(defects, sel, '  101호  ', same);
assert.deepStrictEqual(plain(r.map((x) => x.d.id)), ['a', 'c'], '고른 것 중 바뀌는 것만(이미 101호인 b·안 고른 d·없는 zz 제외)');
assert(r.every((x) => x.next === '101호'), '앞뒤 빈칸은 뗌');

// 3종: 층 이름을 앞에 붙인 글자로 비교·저장
const grade3 = (t) => `지상1층 ${t}`;
r = plan([{ id: 'a', location: '지상1층 거실' }, { id: 'b', location: '거실' }], new Set(['a', 'b']), '거실', grade3);
assert.deepStrictEqual(plain(r.map((x) => [x.d.id, x.next])), [['b', '지상1층 거실']]);

// 빈 글자·선택 없음 → 아무것도 안 함
assert.strictEqual(plan(defects, sel, '   ', same).length, 0);
assert.strictEqual(plan(defects, new Set(), '101호', same).length, 0);
assert.strictEqual(plan(defects, null, '101호', same).length, 0);
console.log('대상 고르기: ok');

// 2) 적용: 되돌리기 → 바꾸기 → 칸 시각 → 저장·다시 그리기
const applyBody = extractFunction(app, 'function applyDetailLocationToSelection(');
assert(/pushDefectHistory\(\)[\s\S]*d\.location = next;[\s\S]*touchDefectUpdatedAt\(d\)[\s\S]*afterGridBulkChange\(/.test(applyBody), '되돌리기 한 번 · 칸 시각 · 저장');
assert(/composeDefectLocation\(t, fc\)/.test(applyBody), '3종 층 이름 규칙');
assert(/migrateLegacyGridLocation\(d, fc\)/.test(applyBody), '예전 행·열 자료는 먼저 옮김');
console.log('적용: ok');

// 3) 팝업: 글자 칸 키가 도면 단축키로 새지 않음, Enter = 적용, Esc = 닫기, 끌어 옮기기, 자리 기억
const ensureBody = extractFunction(app, 'function ensureDetailLocPopup(');
assert(/input\.addEventListener\('keydown', \(e\) => \{\s*e\.stopPropagation\(\);/.test(ensureBody), '키 막기');
assert(/e\.key === 'Enter' && !e\.isComposing/.test(ensureBody), 'Enter(한글 조합 중 제외)');
assert(/e\.key === 'Escape'[\s\S]{0,80}closeDetailLocPopup\(\)/.test(ensureBody));
assert(/data-role="close"[^>]*>X<\/button>/.test(ensureBody), 'X 닫기 버튼');
assert(/data-role="apply"/.test(ensureBody) && /data-role="input"/.test(ensureBody));
assert(/setPointerCapture/.test(ensureBody) && /localStorage\.setItem\(DETAIL_LOC_POPUP_POS_KEY/.test(ensureBody), '끌어 옮기고 자리 기억');
assert(/'pointerdown', 'mousedown', 'touchstart', 'wheel'/.test(ensureBody), '팝업 위 누름이 도면으로 안 샘');
console.log('팝업: ok');

// 4) 연결: 툴바 버튼 · 선택이 바뀌면 「선택된 마킹 N개」 갱신 · 스타일
assert(/id="btnDetailLocPopup"[^>]*>\s*상세위치 입력\s*<\/button>/.test(html), '툴바 버튼');
const toolbar = html.slice(html.indexOf('<div class="toolbar-action-group">'), html.indexOf('id="inputImportCadPins"'));
assert(toolbar.includes('id="btnDetailLocPopup"'), '결함위치도 툴바 안');
const selBar = extractFunction(app, 'function updateMapSelectionBar(');
assert(/window\.syncDetailLocPopupCount\(\)/.test(selBar), '선택 바뀌면 개수 갱신');
assert(/\.detail-loc-popup\s*\{[\s\S]*?position:\s*absolute/.test(css) && /\.detail-loc-popup\[hidden\]/.test(css));
console.log('test-detail-location-popup: ok');
