'use strict';
// 2026-10-20 「pdf 미리보기 … 한글 출력처럼 나오게, 한글 출력은 건들지 마」
//  1) PDF 상태조사표·위치도 쪽이 한글 양식 값(쪽 여백·칸 폭·행 높이·8pt·자간 0·[도면 N-M])을 쓴다
//  2) 한글 출력 코드·양식은 그대로(지문 비교 — 한글 출력을 일부러 바꿀 때만 지문을 새로 적는다)
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

// ---- 2) 한글 출력 지문 ----
const hwpxStart = app.indexOf('    // --- HWPX 균열 게이지·팁 측정결과');
const hwpxEnd = app.indexOf('    function removeSingleDefectRecord(');
assert.ok(hwpxStart > 0 && hwpxEnd > hwpxStart);
const shared = ['function paginateSurveyDefects(', 'function formatSurveyReportNo(', 'function getReportSurveyRowValues(']
    .map((h) => extractFunction(app, h)).join('\n');
const FP = {
    "hwpxExport": "c176c50264bf9214",
    "sharedRows": "dbaace2b6b9c4ea7",
    "hwpx-survey-row-fit.js": "3d22dcdf170a4bc4",
    "hwpx-font-8pt.js": "792b4169159c5676",
    "korean-text-wrap.js": "89a43af61acc9888"
};
assert.strictEqual(sha(app.slice(hwpxStart, hwpxEnd)), FP.hwpxExport, '한글 출력 코드(exportHwpxSurveyTable·3종·1·2종) 그대로');
assert.strictEqual(sha(shared), FP.sharedRows, '한글·PDF가 같이 쓰는 행 값·쪽 나눔 그대로');
['hwpx-survey-row-fit.js', 'hwpx-font-8pt.js', 'korean-text-wrap.js'].forEach((f) => {
    assert.strictEqual(sha(fs.readFileSync(path.join(root, 'js', 'shared', f), 'utf8').replace(/\r\n/g, '\n')), FP[f], f + ' 그대로');
});
// PDF 쪽 함수는 한글 출력 안에서 안 쓴다
const hwpxSrc = app.slice(hwpxStart, hwpxEnd);
['REPORT_HWPX_LAYOUT', 'reportHwpxSurveyRowHeight', 'buildReportSurveyTableHtml', 'reportHwpxPageOpen'].forEach((n) => {
    assert.ok(hwpxSrc.indexOf(n) < 0, n + '는 PDF 전용');
});

// ---- 1) PDF 값 = 한글 양식 값 ----
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'shared', 'hwpx-survey-row-fit.js'), 'utf8'), ctx);
const a = app.indexOf('    const REPORT_HWPX_LAYOUT');
const b = app.indexOf('    /** 한글 출력과 같은 층 이름');
vm.runInContext(app.slice(a, b).replace(/^    const /gm, 'var '), ctx);
vm.runInContext(['function reportHwpxBodyHeight(', 'function reportHwpxSurveyRowHeight('].map((h) => extractFunction(app, h)).join('\n'), ctx);
const L = ctx.REPORT_HWPX_LAYOUT;

// 양식에서 읽은 값과 같다(templates/*.hwpx 가 있으면 직접 대조)
const tplDir = path.join(root, 'templates');
function tplSection(name) {
    const p = path.join(tplDir, name);
    if (!fs.existsSync(p)) return Promise.resolve(null);
    // 의존성 없이 zip 안 Contents/section0.xml 만 읽는다(중앙 디렉터리)
    const buf = fs.readFileSync(p);
    const zlib = require('zlib');
    let eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let off = buf.readUInt32LE(eocd + 16);
    const n = buf.readUInt16LE(eocd + 10);
    for (let i = 0; i < n; i++) {
        const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
        const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
        const local = buf.readUInt32LE(off + 42);
        const fname = buf.slice(off + 46, off + 46 + nl).toString();
        if (fname === 'Contents/section0.xml') {
            const ds = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
            const data = buf.slice(ds, ds + csize);
            return Promise.resolve((method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8'));
        }
        off += 46 + nl + el + cl;
    }
    return Promise.resolve(null);
}
function surveyTblFrom(xml, pred) {
    const tbls = xml.match(/<hp:tbl [\s\S]*?<\/hp:tbl>/g) || [];
    for (const tb of tbls) {
        const rows = tb.match(/<hp:tr>[\s\S]*?<\/hp:tr>/g) || [];
        if (!rows.length) continue;
        const h = rows[0].replace(/<[^>]+>/g, '').replace(/\s/g, '');
        if (!pred(h)) continue;
        const sz = (r) => [...r.matchAll(/<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"\/><hp:cellSz width="(\d+)" height="(\d+)"/g)].map((m) => m.slice(1).map(Number));
        return { data: sz(rows[2]), head1: sz(rows[1]), head0: sz(rows[0]) };
    }
    return null;
}

assert.deepStrictEqual(JSON.parse(JSON.stringify(L.page)), { width: 59528, height: 83340, left: 8504, right: 8504, top: 5669, bottom: 4252, header: 4331, footer: 4252 });
assert.strictEqual(L.grade12.fontPt, 8);
assert.strictEqual(L.grade3.fontPt, 8);
assert.strictEqual(ctx.reportHwpxBodyHeight(), 64836);
// 행 높이(2026-10-20): 1·2종·3종 모두 한글 행 맞춤과 같은 값 — 15행 + 1행 여유, 16·17행이면 그 쪽에 맞게 줄임
const fit = ctx.window.BSA.shared.hwpxSurveyRowFit;
assert.strictEqual(L.titleH, fit.STD_RESERVE_H, 'PDF 제목 높이 = 한글 제목 한 줄');
[[false, 3950], [true, 4298]].forEach(([g3, headH]) => {
    [15, 16, 17].forEach((n) => {
        const want = fit.planRows({ bodyH: 64836, reserveH: 2640, headerH: headH, tableMarginV: 280, stdReserveH: 2640, needs: new Array(n).fill(0) }).rowH;
        assert.strictEqual(ctx.reportHwpxSurveyRowHeight(g3, n, true), want, (g3 ? '3종 ' : '1·2종 ') + n + '행 = 한글');
        assert.ok(2640 + headH + 280 + n * want <= 64836, n + '행 한 쪽');
    });
    // 기본: 16행 몫(15행 + 1행 여유), 제목 없는 다음 쪽도 같은 높이
    assert.strictEqual(ctx.reportHwpxSurveyRowHeight(g3, 15, true), Math.floor((64836 - 2640 - headH - 280 - 400) / 16));
    assert.strictEqual(ctx.reportHwpxSurveyRowHeight(g3, 15, false), ctx.reportHwpxSurveyRowHeight(g3, 15, true));
});

// 표 HTML: colgroup 폭(mm) = 양식 칸 폭, 8pt·자간 0, 외곽 좌우 선 없음
const tableFn = extractFunction(app, 'function buildReportSurveyTableHtml(');
assert.ok(/table-layout:fixed/.test(tableFn) && /letter-spacing:0/.test(tableFn) && /font-size:\$\{spec\.fontPt\}pt/.test(tableFn));
assert.ok(/<col style="width:\$\{mm\(w\)\}mm;">/.test(tableFn));
assert.ok(/reportHwpxWrapCell\(v, w, spec\.vertsize\)/.test(tableFn), '한글 칸과 같은 줄나눔');

// 미리보기: 상태조사표·위치도 쪽이 한글 쪽 틀 + [도면 N-M] 캡션
const prev = extractFunction(app, 'window.openReportPreviewModalFunc = async function(');
assert.ok(/reportHwpxPageOpen\(`data-role="survey-page"/.test(prev));
assert.ok(/reportHwpxPageOpen\(`data-role="location-map-page"/.test(prev));
assert.ok(/\[도면 \$\{hwpxFigChapter\}-\$\{hwpxFigNo\}\] \$\{reportHwpxFloorLabel\(bldg, floorCode\)\} 상태조사위치도/.test(prev));
assert.ok(/hwpxFigureChapterNo\(bldg\.inspectionType, \{ grade3: isGrade3Building\(bldg\) \}\)/.test(prev), '3종 5, 정기 6, 정밀 7');
assert.ok(/\$\{hwpxSurveyTitleNo\}\) \$\{hwpxTitleFloor\} 상태조사표/.test(prev) && /\$\{hwpxSurveyTitleNo\}\) \$\{hwpxTitleFloor\}`/.test(prev), '한글과 같은 제목');

const p12 = tplSection('hwpx_survey_template.hwpx');
const p3 = tplSection('hwpx_survey_template_grade3.hwpx');
Promise.all([p12, p3]).then(([x12, x3]) => {
    if (x12) {
        const t = surveyTblFrom(x12, (h) => h.includes('구분(NO') && h.includes('조사내용') && !h.includes('부재종류'));
        assert.deepStrictEqual(t.data.map((c) => c[2]), JSON.parse(JSON.stringify(L.grade12.cols)), '1·2종 칸 폭 = 양식');
        assert.strictEqual(t.data[0][3], L.grade12.rowH);
        assert.strictEqual(t.head0[0][3], L.grade12.headH);
    }
    if (x3) {
        const t = surveyTblFrom(x3, (h) => h.includes('No.') && h.includes('점검내용'));
        assert.deepStrictEqual(t.data.map((c) => c[2]), JSON.parse(JSON.stringify(L.grade3.cols)), '3종 칸 폭 = 양식');
        assert.strictEqual(t.head0[0][3], L.grade3.headH);
    }
    console.log('test-pdf-preview-hwpx-layout: ok' + (x12 && x3 ? '' : ' (양식 대조 생략)'));
}).catch((e) => { console.error(e); process.exit(1); });
