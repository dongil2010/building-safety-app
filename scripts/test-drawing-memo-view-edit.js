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
assert.ok(/api\.updateMemo\(window\.state, floorKey, memoId, \{ text \}\)[\s\S]{0,40}commitMemoChange\(floorKey\)/.test(fn), '저장 = updateMemo → commitMemoChange(동기화)');
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
console.log('test-drawing-memo-view-edit OK');
