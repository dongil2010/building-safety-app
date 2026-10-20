#!/usr/bin/env node
'use strict';
/** 2026-10-20 상태조사표 엑셀 — 전체 층 한 파일(층마다 탭) */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const xl = require('../js/core/survey-xlsx.js');
const fi = require('../js/core/floor-identity.js');
const used = new Set();
assert.strictEqual(xl.sheetName('지하1층', used), '지하1층');
assert.strictEqual(xl.sheetName('지하1층', used), '지하1층(2)');
assert.strictEqual(xl.sheetName('지하1층', used), '지하1층(3)');
const bad = xl.sheetName('a/b\\c?d*e[f]g:h', used);
assert.ok(!/[:\\/?*\[\]]/.test(bad), bad);
const long = xl.sheetName('아주긴층이름'.repeat(10), used);
assert.ok(long.length <= 31);
const long2 = xl.sheetName('아주긴층이름'.repeat(10), used);
assert.ok(long2.length <= 31 && long2 !== long);
assert.strictEqual(xl.sheetName('', used), '시트');
const ord = xl.orderFloorCodes(['2F', 'EXT_정면', '1F', 'RF', 'B1F', 'B2F'], (c) => /^EXT/.test(c), (l) => fi.sortFloorsLowToHigh(l));
assert.deepStrictEqual(ord.inner, ['B2F', 'B1F', '1F', '2F', 'RF']);
assert.deepStrictEqual(ord.exterior, ['EXT_정면']);
assert.deepStrictEqual(xl.parseCellStyle('font-weight:800; color:#ef4444;'), { bold: true, color: 'FFEF4444' });
assert.deepStrictEqual(xl.parseCellStyle(''), { bold: false, color: '' });
const parts = xl.buildXlsxParts([
    { name: '지하1층', title: 't1', header: ['번호', '내용'], rows: [[{ text: 'NO.01', style: 'font-weight:700; color:#2a2a2a;' }, { text: '균열 <&>', style: '' }]] },
    { name: '1층', title: 't2', header: ['번호', '내용'], rows: [] }
]);
assert.ok(parts['xl/worksheets/sheet1.xml'] && parts['xl/worksheets/sheet2.xml']);
assert.ok(/<sheet name="지하1층" sheetId="1"/.test(parts['xl/workbook.xml']));
assert.ok(/<sheet name="1층" sheetId="2"/.test(parts['xl/workbook.xml']));
assert.ok(parts['xl/sharedStrings.xml'].includes('균열 &lt;&amp;&gt;'));
assert.ok(parts['xl/styles.xml'].includes('FF1E293B') && parts['xl/styles.xml'].includes('FF2A2A2A'));
// 앱 연결: 버튼·스크립트·기존 한 층 저장 유지
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(html.includes('id="btnExportExcelAll"') && html.includes('id="btnExportExcel"'));
assert.ok(/js\/core\/survey-xlsx\.js\?v=/.test(html));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(app.includes('window.exportSurveyExcelAllFloors') && app.includes('window.exportToExcel = function'));
// SheetJS로 실제로 열리는지(설치돼 있을 때만)
try {
    const JSZip = require('jszip');
    const XLSX = require('xlsx');
    const zip = new JSZip();
    Object.keys(parts).forEach((p) => zip.file(p, parts[p]));
    zip.generateAsync({ type: 'nodebuffer' }).then((buf) => {
        const wb = XLSX.read(buf, { type: 'buffer' });
        assert.deepStrictEqual(wb.SheetNames, ['지하1층', '1층']);
        assert.strictEqual(wb.Sheets['지하1층'].A3.v, 'NO.01');
        console.log('test-survey-xlsx-all-floors: ok (xlsx 열림 확인)');
    }).catch((e) => { console.error(e); process.exit(1); });
} catch (_e) {
    console.log('test-survey-xlsx-all-floors: ok');
}