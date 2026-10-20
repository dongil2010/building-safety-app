// 3종 중점관리 비교사진 끝 「※ 범례」: 표에 찍힌 번호 접두사와 같아야 한다(예전엔 양식 글자 그대로 2-지상1층 …).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function extractFunction(head) {
    const i = src.indexOf(head);
    if (i < 0) throw new Error('not found ' + head);
    let depth = 0;
    for (let j = src.indexOf('{', i); j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) return src.slice(i, j + 1);
    }
    throw new Error('unclosed');
}
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(extractFunction('function getGrade3RoofPrefix(') + '\n' + extractFunction('function getGrade3FloorPrefix(')
    + '\n' + extractFunction('function buildGrade3PrefixLegendText(')
    + '\nthis.pre = getGrade3FloorPrefix; this.leg = buildGrade3PrefixLegendText;', ctx);
const item = (code, label) => ({ prefix: ctx.pre(code), label });
// 표 번호: 1F → 1-n, 2F → 2-n, B1F → B1-n, EXT → O-n
assert.strictEqual(ctx.pre('1F'), '1');
assert.strictEqual(ctx.pre('B1F'), 'B1');
const t = ctx.leg([item('2F', '2층'), item('1F', '1층'), item('B1F', '지하1층'), item('1F', '1층'), item('EXT', '외부')]);
assert.strictEqual(t, '※ 범례 : B1-지하1층 / 1-지상1층 / 2-지상2층 / O-외부');
assert.ok(!/2-지상1층|3-지상2층/.test(t));
// 건물에 없는 층은 안 나온다
assert.strictEqual(ctx.leg([item('3F', '3층')]), '※ 범례 : 3-지상3층');
// 옥상층 R
assert.strictEqual(ctx.leg([item('ROOF', '옥상층 (ROOF)'), item('1F', '1층')]), '※ 범례 : 1-지상1층 / R-옥상층');
assert.strictEqual(ctx.leg([]), '');
// 내보내기에서 양식 글자를 그대로 쓰지 않음
assert.ok(/buildGrade3PrefixLegendText\(compareLegendItems\)/.test(src));
assert.ok(/compareLegendItems\.push\(\{ prefix: getGrade3FloorPrefix\(cmpFloorCode\)/.test(src));
console.log('test-grade3-priority-legend: ok');
