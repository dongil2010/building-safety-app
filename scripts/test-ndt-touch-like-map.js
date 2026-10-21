#!/usr/bin/env node
'use strict';
/** 2026-10-20 비파괴 도면 터치 = 결함위치도 규칙(탭 선택 → 다시 탭 수정창, 0.3초 꾹 이동, 박스 먼저) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function fn(name) {
    const start = app.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let i = app.indexOf('{', start), depth = 0;
    for (; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
    }
}
const tap = new Function(fn('ndtTouchTapAction') + '\nreturn ndtTouchTapAction;')();
assert.strictEqual(tap({ wasSelected: false }, false, false), 'select', '처음 탭 = 선택만');
assert.strictEqual(tap({ wasSelected: true }, false, false), 'open', '선택된 것 다시 탭 = 수정창');
assert.strictEqual(tap({ wasSelected: true }, true, false), 'none', '꾹 눌렀다 뗌 = 탭 아님');
assert.strictEqual(tap({ wasSelected: false }, false, true), 'toggle', '추가 선택 모드');
assert.strictEqual(tap(null, false, false), 'none');

assert.ok(/const NDT_TOUCH_LONG_PRESS_MS = 300;/.test(app), '0.3초');
const pinAt = fn('findNdtPinAt');
// 2026-10-21: PC도 박스 먼저(test-ndt-box-first)
assert.ok(pinAt.indexOf('pickNdtBoxFirst(ndtHitCands)') >= 0, '터치·PC 모두 박스 먼저');
assert.ok(/findNdtDisplacementHit\(vx, vy, \{ boxOnly: true \}\) \|\| findNdtDisplacementHit\(vx, vy\)/.test(app), '변위 터치도 박스 먼저');
// 누르는 순간 선택을 바꾸지 않음(그대로 밀면 팬 + 선택 유지)
const ts = app.slice(app.indexOf("canvas.addEventListener('touchstart', (e) => {\n            ndtTouchStartedOnCanvas = true;".replace(/\n/g, app.includes('\r\n') ? '\r\n' : '\n')));
const pinBlock = ts.slice(ts.indexOf('const hitPin = findNdtPinAt(vx, vy);'), ts.indexOf("if (currentNdtCategory === '변위'"));
assert.ok(!/selectedNdtIds = new Set\(\[id\]\)/.test(pinBlock), '터치 시작에 선택 변경 없음');
assert.ok(/wasSelected/.test(pinBlock));
console.log('test-ndt-touch-like-map: ok');