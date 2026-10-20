'use strict';
// 2026-10-20 「한글에서 조사표 앞에 27포인트로 시작하다가 12포인트로 바뀌면서 칸 차지」·「15~17개 칸에 알맞게」
//  1) 제목 문단의 글자 없는 27pt run → 제목 글자 크기, 첫 줄 배치도 제목 크기로(표·그림·글자 run은 그대로)
//  2) 1·2종 상태조사표도 3종처럼 쪽마다 행 맞춤(15행 + 1행 여유, 16·17행이면 그 쪽에 맞게), 기본 높이는 모든 쪽 같게
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const fit = require(path.join(root, 'js', 'shared', 'hwpx-survey-row-fit.js'));

// ---- 작은 가짜 XML 요소 ----
function el(name, attrs, kids) {
    const e = { localName: name, attrs: Object.assign({}, attrs || {}), children: [], parentNode: null, text: '' };
    e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
    e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
    e.removeChild = (c) => { e.children = e.children.filter((x) => x !== c); c.parentNode = null; };
    e.getElementsByTagName = () => { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(e); return out; };
    Object.defineProperty(e, 'textContent', { get() { return e.text + e.children.map((c) => c.textContent).join(''); }, set(v) { e.text = v; } });
    (kids || []).forEach((c) => { c.parentNode = e; e.children.push(c); });
    return e;
}
const H = { 10: 2700, 11: 1200, 12: 1100 };
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function normalizeHwpxTitleParaFont(') + '\nthis.norm = normalizeHwpxTitleParaFont;', ctx);

{
    const t = el('t'); t.text = '1) 지하1층 상태조사표 ';
    const ctrlRun = el('run', { charPrIDRef: '10' }, [el('ctrl')]);
    const emptyRun = el('run', { charPrIDRef: '10' });
    const textRun = el('run', { charPrIDRef: '11' }, [t]);
    const segs = el('linesegarray', {}, [el('lineseg', { vertpos: '0', vertsize: '2700', textheight: '2700', baseline: '2295', spacing: '1620' })]);
    const para = el('p', {}, [ctrlRun, emptyRun, textRun, segs]);
    assert.strictEqual(ctx.norm(para, t, H), true);
    assert.deepStrictEqual([ctrlRun, emptyRun, textRun].map((r) => r.getAttribute('charPrIDRef')), ['11', '11', '11'], '27pt 빈 run → 12pt');
    const sg = segs.children[0];
    assert.deepStrictEqual(['vertsize', 'textheight', 'baseline', 'spacing'].map((k) => sg.getAttribute(k)), ['1200', '1200', '1020', '720'], '줄 높이 27pt+1620 → 12pt+720');
    assert.strictEqual(ctx.norm(para, t, H), false, '두 번 해도 그대로');
}
{
    // 같은 문단 안 제목 + 표(1·2종 정기): 표 run·표 줄은 안 건드리고, 표 줄 위치만 당긴다
    const t = el('t'); t.text = '1) 지하1층 ';
    const big = el('run', { charPrIDRef: '10' });
    const textRun = el('run', { charPrIDRef: '11' }, [t]);
    const tblRun = el('run', { charPrIDRef: '12' }, [el('tbl')]);
    const s1 = el('lineseg', { vertpos: '0', vertsize: '2700', spacing: '1620' });
    const s2 = el('lineseg', { vertpos: '4320', vertsize: '61365', spacing: '1200' });
    const para = el('p', {}, [big, textRun, tblRun, el('linesegarray', {}, [s1, s2])]);
    ctx.norm(para, t, H);
    assert.strictEqual(tblRun.getAttribute('charPrIDRef'), '12', '표 run 그대로');
    assert.strictEqual(big.getAttribute('charPrIDRef'), '11');
    assert.strictEqual(s2.getAttribute('vertsize'), '61365');
    assert.strictEqual(s2.getAttribute('vertpos'), '1920', '표 줄이 제목 12pt 줄 바로 아래로');
}
{
    // 글자가 든 다른 run(더 큰 글자)은 건드리지 않는다
    const t = el('t'); t.text = '제목';
    const other = el('t'); other.text = '큰 글';
    const r1 = el('run', { charPrIDRef: '10' }, [other]);
    const r2 = el('run', { charPrIDRef: '11' }, [t]);
    const para = el('p', {}, [r1, r2, el('linesegarray', {}, [el('lineseg', { vertsize: '2700', spacing: '1620' })])]);
    ctx.norm(para, t, H);
    assert.strictEqual(r1.getAttribute('charPrIDRef'), '10');
}

// ---- 제목에 연결 ----
assert.strictEqual((app.match(/normalizeHwpxTitleParaFont\(slot\.titlePara, t, await hwpxCharPrHeightsFromZip\(zip\)\);/g) || []).length, 2, '3종·1·2종 제목');

// ---- 행 맞춤 ----
assert.strictEqual(fit.STD_RESERVE_H, 2640);
const area = (reserve, headH) => 64836 - reserve - headH - 280 - 400;
[[3950, '1·2종'], [4298, '3종']].forEach(([headH, label]) => {
    const def = Math.floor(area(2640, headH) / 16);
    const plan = (n, reserve) => fit.planRows({ bodyH: 64836, reserveH: reserve, headerH: headH, tableMarginV: 280, stdReserveH: 2640, needs: new Array(n).fill(0) });
    assert.strictEqual(plan(15, 2640).rowH, def, label + ' 15행: 1행 여유');
    assert.ok(area(2640, headH) - 15 * def >= def, label + ' 15행이면 한 행 더 들어갈 자리');
    assert.strictEqual(plan(15, 0).rowH, def, label + ' 제목 없는 다음 쪽도 같은 높이');
    assert.strictEqual(plan(16, 2640).rowH, def, label + ' 16행 그대로 들어감');
    const p17 = plan(17, 2640);
    assert.ok(p17.rowH < def && p17.fits && 17 * p17.rowH <= area(2640, headH), label + ' 17행: 줄여서 한 쪽');
    assert.ok(plan(17, 0).fits);
});
// 1·2종 연결: 예전 양식 고정 3809 대신 쪽 맞춤
const fn12 = app.slice(app.indexOf('async function exportHwpxSurveyTable12('), app.indexOf('    function removeSingleDefectRecord('));
assert.ok(/fitRows12\.push\(\{ row: newRow, need \}\)/.test(fn12));
assert.ok(/fitHwpxSurveyTablePage12\(destTbl, fitRows12, \{ xmlDoc, HP_NS, HEADER_ROW_COUNT, centerCellContent, floorCode \}\)/.test(fn12));
const fitFn = extractFunction(app, 'function fitHwpxSurveyTablePage12(');
assert.ok(/stdReserveH: fit\.STD_RESERVE_H/.test(fitFn));
assert.ok(/stdReserveH: rowFitApi\.STD_RESERVE_H/.test(app.slice(app.indexOf('async function exportHwpxSurveyTable3('), app.indexOf('async function exportHwpxSurveyTable12('))), '3종도 같은 기본 높이');
console.log('test-hwpx-title-font-row-fit12: ok');
