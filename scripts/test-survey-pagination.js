'use strict';
// 한글 상태조사표 쪽 나누기(2026-10-07): 15행씩, 마지막에 1~2행만 남으면 마지막 쪽이 흡수(최대 17)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('    function paginateSurveyDefects(list) {');
const end = app.indexOf('\n    }\n', start) + 6;
assert.ok(start > 0 && end > start);
const parseSurveyDefectNo = (d) => {
    const m = String(d.no).match(/^(\d+)(?:-(\d+))?$/);
    return { main: Number(m[1]), suffix: m[2] ? Number(m[2]) : 0 };
};
// eslint-disable-next-line no-new-func
const paginate = new Function('parseSurveyDefectNo', 'SURVEY_REPORT_ROWS_BASE', 'SURVEY_REPORT_ROWS_MAX',
    app.slice(start, end) + '\nreturn paginateSurveyDefects;')(parseSurveyDefectNo, 15, 17);
const rows = (n) => Array.from({ length: n }, (_, i) => ({ no: String(i + 1) }));
const shape = (n) => paginate(rows(n)).map((pg) => `${pg[0].no}-${pg[pg.length - 1].no}`).join(',');
const want = {
    16: '1-16', 17: '1-17', 18: '1-15,16-18',
    30: '1-15,16-30', 31: '1-15,16-31', 32: '1-15,16-32', 33: '1-15,16-30,31-33',
    47: '1-15,16-30,31-47', 62: '1-15,16-30,31-45,46-62', 15: '1-15', 3: '1-3'
};
Object.keys(want).forEach((n) => assert.strictEqual(shape(Number(n)), want[n], `${n}행`));
// n-n 추가분은 기존처럼 본번호 묶음 유지: 1~15 + 15-1, 15-2 → 1쪽
const withSub = rows(15).concat([{ no: '15-1' }, { no: '15-2' }, { no: '16' }]);
assert.deepStrictEqual(paginate(withSub).map((p) => p.length), [17, 1]);
console.log('test-survey-pagination ok');
