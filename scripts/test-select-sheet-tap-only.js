#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 터치에서 select(조사표 구조체/비구조체/마감재 등)를 스치기만 해도 선택 시트가 뜨던 문제.
 * touchstart에서 열던 것을 「제자리 탭」 touchend로 옮겼다(10px·800ms). touchstart는 passive라 그 위에서 스크롤도 된다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('function bindBsaSelectSheet()');
assert.ok(start >= 0);
const body = app.slice(start, app.indexOf('bindBsaSelectSheet();', start));

assert.ok(!/addEventListener\('touchstart', intercept/.test(body), 'touchstart에서 바로 열지 않음');
assert.ok(/addEventListener\('touchstart', \(e\) => \{[\s\S]*?\}, \{ capture: true, passive: true \}\);/.test(body), 'touchstart는 기록만(passive)');
assert.ok(/addEventListener\('touchmove'[\s\S]*?selectTouch\.moved = true/.test(body), '움직이면 탭 아님');
assert.ok(/const SELECT_TAP_SLOP_PX = 10;/.test(body) && /const SELECT_TAP_MAX_MS = 800;/.test(body));
const end = body.slice(body.indexOf("addEventListener('touchend'"));
assert.ok(/if \(st\.moved \|\| far \|\| \(Date\.now\(\) - st\.at\) > SELECT_TAP_MAX_MS\) \{[\s\S]*?return;/.test(end), '스크롤·드래그·길게 누름은 무시');
assert.ok(/openBsaSelectSheet\(st\.sel\)/.test(end), '제자리 탭이면 연다');
assert.ok(/\{ capture: true, passive: false \}\);\s*document\.addEventListener\('mousedown', intercept, true\);/.test(body), '마우스는 그대로');
assert.ok(/document\.addEventListener\('click', intercept, true\);/.test(body));
console.log('test-select-sheet-tap-only: ok');
