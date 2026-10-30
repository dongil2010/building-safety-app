'use strict';
// 2026-10-30: 개구부 균열 → 상태조사표(한글·PDF) 비구조체 칸. 슬래브 개구부는 구조체
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const s = app.indexOf('function getSurveyStructMarks(');
const e = app.indexOf('\n    }\n', s);
const fn = new Function(app.slice(s, e + 6) + '\nreturn getSurveyStructMarks;')();
const m = (d, g) => fn(d, g);
assert.deepStrictEqual(m({ category: '구조체', isOpeningCrack: true, component: '벽체' }), { struct: '-', nonstruct: '○' });
assert.deepStrictEqual(m({ category: '구조체', isOpeningCrack: true, component: '벽체' }, true), { struct: '-', nonstruct: 'O' });
assert.deepStrictEqual(m({ category: '구조체', isOpeningCrack: true, component: '슬래브' }), { struct: '○', nonstruct: '-' });
assert.deepStrictEqual(m({ category: '구조체', isOpeningCrack: true, component: '지붕슬래브' }, true), { struct: 'O', nonstruct: '-' });
assert.deepStrictEqual(m({ category: '구조체', component: '기둥' }), { struct: '○', nonstruct: '-' });
assert.deepStrictEqual(m({ category: '비구조체', isOpeningCrack: true, component: '슬래브' }), { struct: '-', nonstruct: '○' });
console.log('test-opening-crack-nonstruct: ok');
