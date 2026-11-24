#!/usr/bin/env node
'use strict';
// 2026-10-16 「메모는 볼 수도 있고 수정도 가능하게」: 도면 글 메모를 누르면 보기 겸 고치기 창(여러 줄·큰 글씨)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const memo = require(path.join(__dirname, '..', 'js', 'core', 'drawing-memo.js'));

const fn = app.slice(app.indexOf('function openDrawingMemoMenu('), app.indexOf('window.openDrawingMemoMenu = openDrawingMemoMenu;'));
assert.ok(fn.length > 500, '함수 있음');
assert.ok(/<textarea data-mv-text/.test(fn), '여러 줄 입력칸(줄바꿈 유지)');
assert.ok(!/appPrompt\(/.test(fn), '한 줄 입력칸(appPrompt) 안 씀');
assert.ok(/font-size:1\.2rem/.test(fn), '큰 글씨로 보기');
assert.ok(/📝 도면 주석<\/strong>/.test(fn) && !/['`"][^'`"]*메모/.test(fn.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), '창 이름 「도면 주석」(메모 문구 없음)');
assert.ok(/api\.updateMemo\(window\.state, floorKey, memoId, \{ text, color \}\)[\s\S]{0,120}commitMemoChange\(floorKey\)/.test(fn), '저장 = updateMemo(글·색) → commitMemoChange(동기화)');
assert.ok(/api\.deleteMemo\(window\.state, floorKey, memoId\)/.test(fn), '지우기');
assert.ok(/e\.key === 'Escape'/.test(fn) && /e\.ctrlKey \|\| e\.metaKey/.test(fn), 'Esc 닫기, Ctrl+Enter 저장');
// 메모를 누르면(모드 상관없이) 이 창
assert.ok(/isCleanTouchTap\(\{ downAt: d\.downAt, maxMove: d\.moved, multi: false \}, Date\.now\(\)\)\) \{\s*openDrawingMemoMenu\(d\.id\);/.test(app));

// 줄바꿈 유지 + 수정 시각은 늘 앞으로(병합에서 나중 쪽이 이김)
const st = {};
const m = memo.createMemo({ text: '첫 줄', x: 1, y: 2, now: 1000 });
memo.addMemo(st, 'F', m);
const u = memo.updateMemo(st, 'F', m.id, { text: '첫 줄\n둘째 줄' }, 900);
assert.strictEqual(u.text, '첫 줄\n둘째 줄');
assert.ok(u.updatedAt > 1000, '시계가 늦어도 수정 시각은 앞으로');

// 2026-11-24 「주석 글자도 주석별로 따로 설정 — 색상」
assert.strictEqual(memo.normColor('#DC2626'), '#dc2626');
assert.strictEqual(memo.normColor('#f00'), '#ff0000');
assert.strictEqual(memo.normColor('red'), '', '이름 색·잘못된 값은 기본');
assert.strictEqual(memo.normColor(''), '');
const st2 = {};
const plain = memo.createMemo({ text: '기본 색', now: 1000 });
assert.ok(!('color' in plain), '색 안 고르면 필드 없음(기본 = 스타일 설정 색)');
const red = memo.createMemo({ text: '빨강', color: '#DC2626', now: 1000 });
assert.strictEqual(red.color, '#dc2626');
memo.addMemo(st2, 'F', plain); memo.addMemo(st2, 'F', red);
const pk = memo.packFor(st2, 'F');
assert.strictEqual(pk.items.find((i) => i.id === red.id).color, '#dc2626', '색도 동기화 묶음에 실림');
assert.ok(!('color' in pk.items.find((i) => i.id === plain.id)));
const c1 = memo.updateMemo(st2, 'F', plain.id, { color: '#2563eb' }, 2000);
assert.ok(c1 && c1.color === '#2563eb' && c1.updatedAt >= 2000, '색만 바꿔도 저장·수정 시각');
assert.strictEqual(memo.updateMemo(st2, 'F', plain.id, { color: '#2563EB' }, 3000), null, '같은 색이면 안 바뀜');
const c2 = memo.updateMemo(st2, 'F', plain.id, { color: '' }, 4000);
assert.ok(c2 && !('color' in c2), '「기본」으로 되돌림');
assert.strictEqual(memo.updateMemo(st2, 'F', red.id, { text: '빨강' }, 5000), null, '색 안 넘기면 그대로');
assert.strictEqual(st2.drawingMemos.F.find((m) => m.id === red.id).color, '#dc2626');
// 화면·출력·창 연결
const colorFn = app.slice(app.indexOf('function getDrawingMemoTextColor('), app.indexOf('function drawingMemoOutlineWidth('));
assert.ok(/normDrawingMemoColor\(memo\.color\)/.test(colorFn) && /getStyleColor\('drawingMemo'\)/.test(colorFn), '주석 색 없으면 스타일 설정 색');
assert.ok(/el\.style\.color = getDrawingMemoTextColor\(m\)/.test(app), '화면 주석 = 주석별 색');
const rep = app.slice(app.indexOf('function drawMemosForReport('), app.indexOf('window.drawMemosForReport'));
assert.ok(/getDrawingMemoTextColor\(m\)/.test(rep), '한글·PDF 출력도 주석별 색');
const prompt = app.slice(app.indexOf('function promptDrawingMemoText('), app.indexOf('window.promptDrawingMemoText = promptDrawingMemoText;'));
assert.ok(/drawingMemoColorRowHtml\(\)/.test(prompt) && /drawingMemoColorRowHtml\(\)/.test(fn), '새 주석·고치기 창 모두 색 줄');
assert.ok(/resolve\(v == null \? null : \{ text: v, color: getColor\(\) \}\)/.test(prompt), '새 주석 창은 글·색을 함께');
const create = app.slice(app.indexOf('async function createDrawingMemoAt('), app.indexOf('window.createDrawingMemoAt = createDrawingMemoAt;'));
assert.ok(/color: picked\.color/.test(create), '새 주석 저장에 색');
console.log('test-drawing-memo-view-edit OK');
