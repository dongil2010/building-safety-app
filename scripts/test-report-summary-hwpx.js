/**
 * 보고서 본문 요약 한글 출력(js/report/summary-hwpx.js) 테스트 (node)
 *
 * 실제 템플릿(templates/hwpx_report_summary.hwpx)을 열어 내용을 채운 뒤, 한글 출력에서 사고가
 * 잦았던 지점을 본다: 태그 짝, 표의 칸 주소·병합, 목록에 적힌 파일, 원본 글자 잔존.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readZip, writeZip } = require('./lib/mini-zip.js');
const H = require('../js/report/summary-hwpx.js');
const V = require('../js/shared/hwpx-validate.js');

// zip 읽기/쓰기 왕복
const round = readZip(writeZip([
    { name: 'mimetype', data: 'application/hwp+zip', store: true },
    { name: 'Contents/가.xml', data: '<a>한글</a>'.repeat(50) }
]));
assert.strictEqual(round.mimetype.toString('utf8'), 'application/hwp+zip');
assert.strictEqual(round['Contents/가.xml'].toString('utf8'), '<a>한글</a>'.repeat(50));

// 표 안의 표가 있어도 바깥 요소만 센다
const nested = '<hp:tr><hp:tc><hp:tbl><hp:tr><hp:tc/></hp:tr></hp:tbl></hp:tc></hp:tr><hp:tr/>';
assert.strictEqual(H.topElements(nested, 'hp:tr').length, 2);

const tplPath = path.join(__dirname, '..', 'templates', 'hwpx_report_summary.hwpx');
const tpl = readZip(fs.readFileSync(tplPath));
const tplFiles = {};
Object.keys(tpl).forEach((k) => { tplFiles[k] = /\.(xml|hpf|rdf|txt)$/.test(k) || k === 'mimetype' ? tpl[k].toString('utf8') : tpl[k]; });

// 템플릿에는 원본 보고서의 그림·바탕쪽이 남아 있지 않다
const tplSec = tplFiles['Contents/section0.xml'];
assert.ok(!/<hp:pic\b/.test(tplSec) && !/binaryItemIDRef/.test(tplSec), '템플릿에 그림이 남아 있다');
assert.ok(!/<hp:masterPage\b/.test(tplSec), '템플릿에 바탕쪽 연결이 남아 있다');
assert.deepStrictEqual(Object.keys(tpl).filter((k) => /^BinData\//.test(k)), [], '템플릿에 그림 파일이 남아 있다');

// 템플릿의 표 종류
const kinds = [];
const body = tplSec.slice(tplSec.indexOf('<hp:p'), tplSec.lastIndexOf('</hs:sec>'));
H.topElements(body, 'hp:p').forEach((p) => {
    const px = body.slice(p.start, p.end);
    H.topElements(px, 'hp:tbl').forEach((t) => kinds.push(H.tableKind(H.parseTable(px.slice(t.start, t.end)))));
});
assert.deepStrictEqual(kinds, ['main', 'main', 'summary', 'survey', 'survey', 'survey', 'survey', 'survey', 'survey', 'survey', 'survey',
    'part', 'analysis', 'analysis', 'cause']);

// 내용
const PIC = '<hp:pic id="1" zOrder="1" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="2" reverse="0">'
    + '<hp:offset x="0" y="0"/><hp:orgSz width="200000" height="150000"/><hp:curSz width="20584" height="15438"/><hp:flip horizontal="0" vertical="0"/>'
    + '<hp:rotationInfo angle="0" centerX="10292" centerY="7719" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
    + '<hc:scaMatrix e1="0.10292" e2="0" e3="0" e4="0" e5="0.10292" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'
    + '<hc:img binaryItemIDRef="photoAuto1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
    + '<hp:sz width="20584" widthRelTo="ABSOLUTE" height="15438" heightRelTo="ABSOLUTE" protect="0"/><hp:shapeComment>원본 설명</hp:shapeComment></hp:pic>';
const line = (text, blue) => ({ text: text, blue: !!blue });
const cat = (lines, photos) => ({
    lines: lines, opinion: '․ 머리말\n- 의견 & <특수문자>', body: '- 의견 & <특수문자>', major: '해당사항 없음', photos: photos || []
});
const many = (n, catKey, width) => Array.from({ length: n }, (_, i) => ({
    cat: catKey, cells: [catKey, '유형' + i].concat(new Array(width - 2).fill('값' + i))
}));
const model = {
    title: '보고서 본문 요약 — 시험건물',
    cats: {
        structure: cat([line('지하1층 슬래브 균열 (균열폭:0.45mm)', true), line('지상2층 보 누수')], [{ key: 'p1', caption: '지하1층 슬래브 균열' }]),
        nonStructure: cat([line('지하1층 블록벽체 수직균열')]),
        public: cat([line('지상5층 점검로 상태양호'), line('외부 주차장 포장부위 균열'), line('외부 환기구 덮개 상태양호')]),
        interior: cat([]), exterior: cat([]), attachment: cat([line('옥상층 철골 부재 녹 발생 및 볼트 누락')]),
        aux: cat([line('외부 사면 상태양호')]), load: cat([line('옥상층 : 추가 중량물 없음')])
    },
    repair: { text: '일부 보수 실시', blue: true },
    summaryRows: [{ cells: ['각 층', '구조체', '균열', '․ 보수실시\n(주입공법)'] }, { cells: ['각 층', '구조체', '누수', '․ 보수실시'] }, { cells: ['외부', '마감재', '들뜸', '․ 보수실시'] }],
    partRows: many(3, 'structure', 6).concat(many(2, 'interior', 6)),
    causeRows: many(120, 'structure', 5)
};
const photos = { p1: { picXml: PIC, bytes: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), ext: 'jpg' } };
const files = H.buildFiles(tplFiles, model, photos);
const sec = files['Contents/section0.xml'];

// 구조: 태그 짝, 표 칸 주소·병합, 목록의 파일
const rep = V.validateSection(sec);
assert.ok(rep.ok, '구역 구조 오류: ' + JSON.stringify(rep.problems).slice(0, 400));
assert.ok(V.checkWellFormed(files['Contents/header.xml']).ok);
assert.deepStrictEqual(V.checkManifest(files['Contents/content.hpf'], Object.keys(files)), []);

// 글자
assert.ok(sec.includes('<hp:t>보고서 본문 요약 — 시험건물</hp:t>'), '제목');
assert.ok(sec.includes('<hp:t>1. 지하1층 슬래브 균열 (균열폭:0.45mm)</hp:t>'));
assert.ok(sec.includes('- 의견 &amp; &lt;특수문자&gt;'), '특수문자는 XML로 바꿔 적는다');
assert.ok(sec.includes('<hp:t>1. 일부 보수 실시</hp:t>'), '보수상태');

// 파란 글자: 글자모양을 복제해 색만 바꾼다
const head = files['Contents/header.xml'];
const cntBefore = parseInt(/<hh:charProperties\b[^>]*\bitemCnt="(\d+)"/.exec(tplFiles['Contents/header.xml'])[1], 10);
const cntAfter = parseInt(/<hh:charProperties\b[^>]*\bitemCnt="(\d+)"/.exec(head)[1], 10);
assert.ok(cntAfter > cntBefore, '파란 글자모양이 더해져야 한다');
assert.strictEqual((head.match(/<hh:charPr\b/g) || []).length, cntAfter, '글자모양 개수와 itemCnt가 맞아야 한다');
// 표마다 본뜨는 글자모양이 달라 파란 글자모양도 여러 개 생긴다
const blueIds = [];
head.replace(/<hh:charPr\b[^>]*>/g, (tag) => {
    if (/textColor="#0000FF"/.test(tag) && parseInt(/\bid="(\d+)"/.exec(tag)[1], 10) >= cntBefore) blueIds.push(/\bid="(\d+)"/.exec(tag)[1]);
    return tag;
});
assert.strictEqual(blueIds.length, cntAfter - cntBefore);
const runOf = (textStart) => new RegExp('<hp:run charPrIDRef="(\\d+)"><hp:t>' + textStart, 'g');
let m;
const blueLine = runOf('1\\. 지하1층 슬래브 균열');
let blueSeen = 0;
while ((m = blueLine.exec(sec)) !== null) { assert.ok(blueIds.indexOf(m[1]) >= 0, '달라진 줄은 파란 글자모양'); blueSeen += 1; }
assert.ok(blueSeen >= 3, '주요 점검결과가 실리는 표마다(①③⑤) 파랗게');
const plainLine = runOf('2\\. 지상2층 보 누수');
while ((m = plainLine.exec(sec)) !== null) assert.ok(blueIds.indexOf(m[1]) < 0, '그대로인 줄은 원래 글자모양');

// 그림: 칸에 맞게 줄이고, 파일과 목록을 더한다
assert.strictEqual((sec.match(/<hp:pic\b/g) || []).length, 1);
assert.ok(files['BinData/rsphoto1.jpg'], '그림 파일');
assert.ok(/<opf:item id="rsphoto1" href="BinData\/rsphoto1\.jpg"/.test(files['Contents/content.hpf']));
assert.ok(sec.includes('binaryItemIDRef="rsphoto1"') && !sec.includes('photoAuto1'));
assert.ok(!sec.includes('원본 설명'), '그림 설명(촬영 정보)은 옮기지 않는다');
const fit = H.fitPicture(PIC, 17025, 13000, { id: 5, instId: 6, binId: 'x' });
assert.strictEqual(fit.width, 17025);
assert.strictEqual(fit.height, 12769, '가로세로 비율 유지');
assert.ok(fit.xml.includes('e1="0.085125"'));

// 줄 수가 바뀌는 표
const tables = V.extractTables(sec);
const sizes = tables.map((t) => t.rowCnt + 'x' + t.colCnt);
assert.ok(sizes.indexOf('4x4') >= 0, '요약표 머리글 + 3줄: ' + sizes.join(' '));
assert.ok(sizes.indexOf('6x6') >= 0, '부분별 머리글 + 5줄');
const causeTables = sizes.filter((s) => /x5$/.test(s) && tables[sizes.indexOf(s)].depth === 0);
// 외관조사 표 8개도 5열이라, 원인표는 행 수로 가린다(외관조사 표는 10·14·16행)
const causeParts = tables.filter((t) => t.colCnt === 5 && [10, 14, 16].indexOf(t.rowCnt) < 0);
assert.ok(causeParts.length >= 2, '원인표는 한 쪽을 넘으면 여러 표로 나뉜다: ' + sizes.join(' '));
assert.strictEqual(causeParts.reduce((a, t) => a + t.rowCnt - 1, 0), 120, '나뉜 표의 본문 줄 수 합');
assert.ok(causeTables.length > 0);

// 첫 열 병합: 「각 층」 두 줄은 한 칸
const bodyOut = sec.slice(sec.indexOf('<hp:p'), sec.lastIndexOf('</hs:sec>'));
let summaryTbl = null;
H.topElements(bodyOut, 'hp:p').forEach((p) => {
    const px = bodyOut.slice(p.start, p.end);
    H.topElements(px, 'hp:tbl').forEach((t) => {
        const parsed = H.parseTable(px.slice(t.start, t.end));
        if (H.tableKind(parsed) === 'summary') summaryTbl = parsed;
    });
});
assert.strictEqual(summaryTbl.rows.length, 4);
assert.strictEqual(summaryTbl.rows[1].cells[0].rowSpan, 2, '같은 위치는 합친다');
assert.strictEqual(summaryTbl.rows[2].cells.length, 3, '합쳐진 줄에는 첫 칸이 없다');
assert.strictEqual(summaryTbl.rows[3].cells[0].rowSpan, 1);
assert.deepStrictEqual(H.cellLines(summaryTbl.rows[1].cells[3].xml), ['․ 보수실시', '(주입공법)'], '줄바꿈은 문단으로');

// 공중이용부위 표: 항목을 조사 항목 칸에 나눠 적는다
let publicTbl = null;
H.topElements(bodyOut, 'hp:p').forEach((p) => {
    const px = bodyOut.slice(p.start, p.end);
    H.topElements(px, 'hp:tbl').forEach((t) => {
        const parsed = H.parseTable(px.slice(t.start, t.end));
        if (H.tableKind(parsed) === 'survey' && /공중/.test(H.cellText(H.cellAt(parsed, 1, 1).xml))) publicTbl = parsed;
    });
});
const subText = (labelRe) => {
    let row = -1;
    publicTbl.rows.forEach((r) => r.cells.forEach((c) => { if (c.col === 0 && labelRe.test(H.cellText(c.xml))) row = c.row; }));
    return H.cellLines(H.cellAt(publicTbl, row + 1, 2).xml);
};
assert.deepStrictEqual(subText(/추락/), ['1. 지상5층 점검로 상태양호']);
assert.deepStrictEqual(subText(/도로포장/), ['1. 외부 주차장 포장부위 균열']);
assert.deepStrictEqual(subText(/환기구/), ['1. 외부 환기구 덮개 상태양호']);
assert.deepStrictEqual(subText(/신축이음/), ['-'], '해당 없는 조사 항목은 「-」');

// ── 줄 나누기와 높이 ──
// 한글은 파일에 적힌 줄 배치·칸 높이를 그대로 쓴다. 안 맞으면 글자가 겹친다(2026-10-08 첫 시험 파일).
assert.deepStrictEqual(H.wrapStarts('짧은 글', 20), [0]);
assert.deepStrictEqual(H.wrapStarts('가나다라마 바사아자차 카타파하', 6), [0, 6, 12], '낱말 단위로 넘긴다');
assert.deepStrictEqual(H.wrapStarts('가나다라마바사아자차', 4), [0, 4, 8], '줄보다 긴 낱말은 글자 단위');
assert.deepStrictEqual(H.wrapStarts('abcdefgh', 2.2), [0, 4], '영문·숫자는 폭이 절반쯤');

const longOpinion = '․ 머리말\n- ' + '철골 보 접합부 녹 발생 및 부식은 결함부위 수분유입과 방청 시공 미흡에 의한 결함으로 판단됨. '.repeat(6);
const longModel = JSON.parse(JSON.stringify(model));
longModel.cats.structure.opinion = longOpinion;
longModel.cats.structure.lines = Array.from({ length: 7 }, (_, i) => line('지상' + (i + 1) + '층 슬래브 균열'));
const longSec = H.buildFiles(tplFiles, longModel, {})['Contents/section0.xml'];
assert.ok(V.validateSection(longSec).ok);
const tableOf = (xml, pick) => {
    const b = xml.slice(xml.indexOf('<hp:p'), xml.lastIndexOf('</hs:sec>'));
    let hit = null;
    H.topElements(b, 'hp:p').forEach((p) => {
        const px = b.slice(p.start, p.end);
        H.topElements(px, 'hp:tbl').forEach((t) => {
            const parsed = H.parseTable(px.slice(t.start, t.end));
            if (!hit && pick(parsed)) hit = { table: parsed, para: px };
        });
    });
    return hit;
};
const isStructSurvey = (t) => H.tableKind(t) === 'survey' && /^구조체$/.test(H.cellText(H.cellAt(t, 1, 1).xml));
const shortT = tableOf(sec, isStructSurvey).table;
const longHit = tableOf(longSec, isStructSurvey);
const longT = longHit.table;
const opCell = (t) => {
    let row = -1;
    t.rows.forEach((r) => r.cells.forEach((c) => { if (c.col === 0 && /책임기술자 의견/.test(H.cellText(c.xml))) row = c.row; }));
    return H.cellAt(t, row, 2);
};
const segsOf = (cellXml) => (cellXml.match(/<hp:lineseg\b[^>]*\/>/g) || []);
const longSegs = segsOf(opCell(longT).xml);
assert.ok(longSegs.length >= 8, '긴 의견은 여러 줄로 나뉜다: ' + longSegs.length);
assert.ok(longSegs.some((s) => /textpos="[1-9]\d*"/.test(s)), '둘째 줄부터는 시작 글자 위치가 적힌다');
const vertposList = longSegs.map((s) => parseInt(/vertpos="(\d+)"/.exec(s)[1], 10));
assert.deepStrictEqual(vertposList, vertposList.slice().sort((a, b) => a - b), '줄은 위에서 아래로 쌓인다');
assert.strictEqual(new Set(vertposList).size, vertposList.length, '같은 높이에 두 줄이 오면 겹친다');
assert.ok(opCell(longT).height > opCell(shortT).height, '줄이 늘면 칸 높이도 늘어난다');
assert.ok(opCell(longT).height >= H.cellNeed(opCell(longT).xml), '칸 높이는 내용이 차지하는 높이 이상');

// 같은 행의 칸은 높이가 같고, 표 높이는 행 높이의 합, 표를 담은 문단의 줄 높이도 그에 맞는다
longT.rows.forEach((r) => {
    const hs = r.cells.filter((c) => c.rowSpan === 1).map((c) => c.height);
    assert.strictEqual(new Set(hs).size <= 1, true, '한 행의 칸 높이가 서로 다르다: ' + hs.join(','));
});
const rowHeights = {};
longT.rows.forEach((r) => r.cells.forEach((c) => { if (c.rowSpan === 1) rowHeights[c.row] = c.height; }));
const sumRows = Object.keys(rowHeights).reduce((a, k) => a + rowHeights[k], 0);
const tblH = parseInt(/<hp:sz\b[^>]*\bheight="(\d+)"/.exec(longT.head)[1], 10);
assert.strictEqual(tblH, sumRows, '표 높이 = 행 높이의 합');
const paraSeg = longHit.para.slice(longHit.para.lastIndexOf('</hp:tbl>')).match(/<hp:lineseg\b[^>]*\/>/)[0];
assert.strictEqual(parseInt(/vertsize="(\d+)"/.exec(paraSeg)[1], 10), tblH + 282, '표를 담은 문단의 줄 높이');

// 주요 점검결과 7줄: 항목 칸도 늘어난다
const itemsCell = (t) => H.cellAt(t, 3, 2);
assert.strictEqual(segsOf(itemsCell(longT).xml).length, 7);
assert.ok(itemsCell(longT).height > itemsCell(shortT).height);

// 줄 수가 바뀌는 표: 조치 필요사항이 두 문단이면 그 행이 그만큼 높다
const sumFit = H.parseTable(tableOf(sec, (t) => H.tableKind(t) === 'summary').para.match(/<hp:tbl[\s\S]*<\/hp:tbl>/)[0]);
sumFit.rows.slice(1).forEach((r) => r.cells.forEach((c) => {
    assert.ok(c.height >= H.cellNeed(c.xml, { inMargin: null }) || c.rowSpan > 1, '요약표 칸 높이가 내용보다 낮다');
}));

console.log('report-summary-hwpx ok');
