#!/usr/bin/env node
'use strict';
/** 부동침하·부재변위: 마킹 즉시 입력창, 지점 표시, 자동 저장, 다음 지점 이동, 키패드 위치 재계산 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pad = fs.readFileSync(path.join(root, 'js', 'shared', 'measure-keypad.js'), 'utf8');

// 마킹을 찍는 두 경로(마우스·터치) 모두 입력창까지 연다
assert.strictEqual((app.match(/placeNdtDisplacementMarkAndEdit\(coords\.x, coords\.y\)/g) || []).length, 2);
assert.ok(!/[^.]placeNdtDisplacementMarkAt\(coords\.x, coords\.y\)/.test(app), '입력창 없이 찍는 경로 없음');
// 터치 한 번 탭에 바로 열림
assert.ok(/ndtTouchTapAction\(Object\.assign\(\{\}, pendD, \{ wasSelected: true \}\), armedD/.test(app));

// 몇 번째 지점인지 창과 도면에 표시
assert.ok(/\$\{idx \+ 1\}번째 지점/.test(app));
assert.ok(/_ndtDispEditingPointId === p\.id/.test(app));

// 자동 저장: 입력 → 저장 예약, 닫기·다음 지점 전에 밀어 넣음
assert.ok(/levelInput\.addEventListener\('input'[\s\S]{0,200}saveNdtDispLevelNow/.test(app));
const closeFn = app.slice(app.indexOf('function closeNdtDisplacementModal()'));
assert.ok(closeFn.indexOf('flushNdtDispLevelAutosave()') < 60, '닫을 때 먼저 저장');

// 다음 지점 버튼·키패드 연결
assert.ok(html.includes('id="btnNextNdtDispPoint"'));
assert.ok(/'bsa-mkp-no-next'/.test(app) && /'bsa-mkp-no-next'/.test(pad));

// 창이 다 들어온 뒤 키패드 위치를 다시 잡는다
assert.ok(/addEventListener\('transitionend'/.test(pad));

console.log('test-ndt-displacement-quick-entry: ok');
