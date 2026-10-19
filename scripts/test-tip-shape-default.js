'use strict';
// 2026-10-19 지시선 끝 기본 = 동그라미. 직접 고른 값(tipShapeChosen)만 지킨다 — 앱·PDF·한글이 같은 state.tipShape
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const st = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');

assert.ok(/tipShape: 'circle',/.test(st), 'state.js 기본 동그라미');
assert.ok(!/tipShape: 'arrow',/.test(st));
assert.ok(/tipShape: window\.state\.tipShape \|\| 'circle',/.test(app), '저장 기본 동그라미');
assert.ok(/tipShapeChosen: !!window\.state\.tipShapeChosen,/.test(app), '직접 고름 표시 저장');
assert.ok(/state\.tipShapeChosen = true;/.test(app), '고르면 표시');

// 불러오기 — 표시가 없던 옛 저장값(고르지 않아도 'arrow')은 새 기본으로
const m = /if \(parsed\.tipShape && parsed\.tipShapeChosen\) \{[\s\S]*?\n(\s*)\} else \{\n\s*window\.state\.tipShape = 'circle';\n\s*\}/.exec(app);
assert.ok(m, '불러오기 분기');
const load = new Function('window', 'parsed', m[0]);
const run = (parsed) => { const w = { state: { tipShape: 'circle' } }; load(w, parsed); return w.state; };
assert.strictEqual(run({ tipShape: 'arrow' }).tipShape, 'circle', '옛 기본 저장값 → 동그라미');
assert.strictEqual(run({}).tipShape, 'circle');
assert.strictEqual(run({ tipShape: 'arrow', tipShapeChosen: true }).tipShape, 'arrow', '직접 고른 화살표는 유지');
assert.strictEqual(run({ tipShape: 'circle', tipShapeChosen: true }).tipShape, 'circle');
// 그리기는 모두 state.tipShape를 본다(따로 화살표 고정 없음)
assert.ok((app.match(/tipShape === 'circle'/g) || []).length >= 1);
console.log('test-tip-shape-default: ok');
