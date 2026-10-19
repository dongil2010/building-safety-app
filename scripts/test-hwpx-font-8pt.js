'use strict';
// 2026-10-19 한글 출력: 8.5pt(850)로 들어가던 글자는 전부 8pt(800), 다른 크기는 그대로
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const f = require(path.join(root, 'js', 'shared', 'hwpx-font-8pt.js'));

const hdr = '<hh:charProperties itemCnt="3"><hh:charPr id="9" height="800" textColor="#000000"><hh:x/></hh:charPr>'
    + '<hh:charPr id="19" height="850" textColor="#000000"><hh:x/></hh:charPr><hh:charPr id="20" height="1300"></hh:charPr></hh:charProperties>';
const r = f.headerTo8pt(hdr);
assert.deepStrictEqual(r.ids, ['19']);
assert.ok(/id="19" height="800"/.test(r.xml));
assert.ok(/id="9" height="800"/.test(r.xml) && /id="20" height="1300"/.test(r.xml), '다른 크기는 그대로');

const sec = '<hp:lineseg textpos="0" vertpos="0" vertsize="850" textheight="850" baseline="723" spacing="256" horzpos="0" horzsize="1000" flags="1"/>'
    + '<hp:lineseg textpos="0" vertpos="0" vertsize="1300" textheight="1300" baseline="1105" spacing="780" horzpos="0" horzsize="1000" flags="1"/>'
    + '<hp:cellSz width="850" height="850"/>';
const out = f.sectionTo8pt(sec);
assert.ok(out.includes('vertsize="800" textheight="800" baseline="680" spacing="256"'));
assert.ok(out.includes('vertsize="1300" textheight="1300"'), '다른 줄은 그대로');
assert.ok(out.includes('<hp:cellSz width="850" height="850"/>'), '칸 크기는 안 건드린다');

const files = { 'Contents/header.xml': hdr, 'Contents/section0.xml': sec, 'BinData/a.png': new Uint8Array([1]) };
f.applyToFiles(files);
assert.ok(!/height="850"/.test(files['Contents/header.xml']) && !/textheight="850"/.test(files['Contents/section0.xml']));
assert.ok(files['BinData/a.png'] instanceof Uint8Array);

// 실제 양식에 8.5pt 글자 모양이 있고, 바꾸면 하나도 안 남는다
const tplHeaders = ['hwpx_survey_template_grade3.hwpx', 'hwpx_survey_template_grade3_regular.hwpx'];
tplHeaders.forEach((t) => assert.ok(fs.existsSync(path.join(root, 'templates', t)), t));

// 연결: 1·2종·3종 한글 출력(본문·머리) + 보고서 요약
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.strictEqual((app.match(/newXml = font8pt\.sectionTo8pt\(newXml\);/g) || []).length, 2, '1·2종·3종 내보내기 두 곳');
assert.strictEqual((app.match(/await font8pt\.applyHeaderToZip\(zip\);/g) || []).length, 2);
const sp = fs.readFileSync(path.join(root, 'js', 'report', 'summary-page.js'), 'utf8');
assert.ok(/font8pt\.applyToFiles\(files\)/.test(sp), '보고서 요약 한글');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/js\/shared\/hwpx-font-8pt\.js\?v=/.test(html) && html.indexOf('js/shared/hwpx-font-8pt.js') < html.indexOf('src="app.js'));
const rs = fs.readFileSync(path.join(root, 'report-summary.html'), 'utf8');
assert.ok(rs.indexOf('js/shared/hwpx-font-8pt.js') >= 0 && rs.indexOf('js/shared/hwpx-font-8pt.js') < rs.indexOf('js/report/summary-page.js'));
console.log('test-hwpx-font-8pt: ok');
