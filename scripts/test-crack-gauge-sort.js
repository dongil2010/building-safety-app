// 균열 게이지 번호 순 정렬(sortCrackGaugesByNo) — 번호를 고쳐도 찍은 순서로 나오던 문제(2026-10-22)
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('    function sortCrackGaugesByNo(');
assert(start > 0, 'sortCrackGaugesByNo 없음');
const end = app.indexOf('\n    }\n', start) + 6;
const sortCrackGaugesByNo = new Function(app.slice(start, end) + '\nreturn sortCrackGaugesByNo;')();

const no = (x) => x.no;
const ids = (list) => list.map((x) => x.id).join(',');

// 화면에서 본 경우: G-05, G-04, G-06 순으로 찍힘 → 번호 순
assert.strictEqual(ids(sortCrackGaugesByNo([{ id: 'a', no: 'G-05' }, { id: 'b', no: 'G-04' }, { id: 'c', no: 'G-06' }], no)), 'b,a,c');
// 두 자리·세 자리 숫자는 글자 순이 아니라 숫자 순
assert.strictEqual(ids(sortCrackGaugesByNo([{ id: 'a', no: 'G-10' }, { id: 'b', no: 'G-9' }, { id: 'c', no: 'G-100' }], no)), 'b,a,c');
// 번호 없는 것은 뒤로, 원래 순서 유지
assert.strictEqual(ids(sortCrackGaugesByNo([{ id: 'x', no: '' }, { id: 'a', no: 'G-02' }, { id: 'y' }, { id: 'b', no: 'G-01' }], no)), 'b,a,x,y');
// 같은 번호끼리는 원래 순서
assert.strictEqual(ids(sortCrackGaugesByNo([{ id: 'a', no: 'G-03' }, { id: 'b', no: 'G-03' }], no)), 'a,b');
// 원본 배열은 건드리지 않음
const orig = [{ id: 'a', no: 'G-2' }, { id: 'b', no: 'G-1' }];
sortCrackGaugesByNo(orig, no);
assert.strictEqual(ids(orig), 'a,b');

console.log('test-crack-gauge-sort: OK');
