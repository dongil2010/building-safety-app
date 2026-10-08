#!/usr/bin/env node
'use strict';

/**
 * 보고서 본문 요약용 한글 템플릿을 만든다.
 *
 *   node scripts/dev/build-report-summary-template.js "<실제 보고서.hwpx>" [templates/hwpx_report_summary.hwpx]
 *
 * 실제 1·2종 정기안전점검 보고서(한글에서 HWPX로 저장한 것)에서 본문 요약에 쓰는 표만 뽑아
 * 한 구역짜리 문서로 묶는다. 뽑는 표는 머리글 글자로 알아본다:
 *   ① 점검 주요결과(결과표 안에 든 표 2개)  ② 실시결과 요약표  ③ 주요 외관조사 결과 8개
 *   ④ 부분별 점검결과  ⑤ 현장조사 결과분석 2개  ⑥ 주요 결함사항 원인 및 보수방안
 *
 * 원본 보고서의 내용(건물명·결함·사진)은 템플릿에 남기지 않는다. 표를 한 번 빈 내용으로 채워
 * 글자를 지우고, 그림·바탕쪽·미리보기도 뺀다. 남는 것은 표 서식과 header.xml(글꼴·테두리)뿐이다.
 */
const fs = require('fs');
const path = require('path');
const { readZip, writeZip } = require('../lib/mini-zip.js');
const H = require('../../js/report/summary-hwpx.js');

const srcPath = process.argv[2];
const outPath = process.argv[3] || path.join(__dirname, '..', '..', 'templates', 'hwpx_report_summary.hwpx');
if (!srcPath) {
    console.error('사용법: node scripts/dev/build-report-summary-template.js "<보고서.hwpx>" [출력 경로]');
    process.exit(1);
}

const src = readZip(fs.readFileSync(srcPath));
const text = (name) => {
    if (!src[name]) throw new Error('보고서에 ' + name + ' 이(가) 없다');
    return src[name].toString('utf8');
};

function sectionParas(xml) {
    const start = xml.indexOf('<hp:p');
    const body = xml.slice(start, xml.lastIndexOf('</hs:sec>'));
    return { rootOpen: xml.slice(0, start), paras: H.topElements(body, 'hp:p').map((p) => body.slice(p.start, p.end)) };
}

/** 표 안의 표까지 훑어 종류가 알려진 표를 모은다 */
function collectTables(paraXml, found, wrapper) {
    H.topElements(paraXml, 'hp:tbl').forEach((tb) => {
        const tblXml = paraXml.slice(tb.start, tb.end);
        const kind = H.tableKind(H.parseTable(tblXml));
        if (kind) {
            found.push({ kind: kind, xml: tblXml, wrapper: wrapper });
            return;
        }
        // 종류를 모르는 표(결과표 등)는 그 안에 든 표를 본다 — 안쪽 표는 감쌀 문단이 따로 없다
        const inner = tblXml.slice(H.openTagEnd(tblXml), tblXml.lastIndexOf('</hp:tbl>'));
        collectTables(inner, found, null);
    });
}

const sectionNames = Object.keys(src).filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
const first = sectionParas(text(sectionNames[0]));

const found = [];
let headingStamp = null;
sectionNames.forEach((name) => {
    sectionParas(text(name)).paras.forEach((p) => {
        const tbls = H.topElements(p, 'hp:tbl');
        if (!tbls.length) {
            // 표 제목으로 쓸 한 줄짜리 문단 하나를 본뜬다
            if (!headingStamp && /<hp:t>\d+\.\s*주요 결함사항 원인 및 보수방안<\/hp:t>/.test(p)) headingStamp = p;
            return;
        }
        // 표를 감싼 문단: 표 앞(문단·run 여는 태그)과 표 뒤(줄 정보)만 남긴다
        let prefix = p.slice(0, tbls[0].start).replace(/<hp:ctrl>[\s\S]*?<\/hp:ctrl>/g, '');
        let suffix = p.slice(tbls[tbls.length - 1].end);
        let segSeen = false;
        suffix = suffix.replace(/<hp:lineseg\b[^>]*\/>/g, (seg) => { if (segSeen) return ''; segSeen = true; return seg; });
        // 모양 검사는 실제로 쓰는 표에만 한다(다른 문단에는 그림 등이 섞여 있다)
        collectTables(p, found, { prefix: prefix, suffix: suffix, plain: /^<hp:p\b[^>]*><hp:run\b[^>]*>$/.test(prefix) });
    });
});

// 같은 표가 보고서에 되풀이해 실려 있다(3장과 5장). 종류별로 처음 나온 것만 쓴다.
const want = { main: 2, summary: 1, survey: 8, part: 1, analysis: 2, cause: 1 };
const byKind = {};
found.forEach((f) => {
    byKind[f.kind] = byKind[f.kind] || [];
    if (byKind[f.kind].length < want[f.kind]) byKind[f.kind].push(f);
});
Object.keys(want).forEach((k) => {
    const n = (byKind[k] || []).length;
    if (n !== want[k]) throw new Error('표 「' + k + '」를 ' + want[k] + '개 찾아야 하는데 ' + n + '개다. 보고서 서식이 다른지 확인할 것.');
    byKind[k].forEach((f) => {
        if (f.wrapper && !f.wrapper.plain) throw new Error('표 「' + k + '」 앞 문단 모양이 예상과 다르다: ' + f.wrapper.prefix.slice(0, 200));
    });
});
if (!headingStamp) throw new Error('제목 문단으로 본뜰 문단을 찾지 못했다');

const anyWrapper = byKind.summary[0].wrapper;
const wrapTable = (f, pageBreak) => {
    const w = f.wrapper || anyWrapper;
    const end = H.openTagEnd(w.prefix);
    const open = H.setAttr(w.prefix.slice(0, end), 'pageBreak', pageBreak ? 1 : 0);
    return open + w.prefix.slice(end) + f.xml + w.suffix;
};
const heading = (label, pageBreak) => {
    const end = H.openTagEnd(headingStamp);
    return H.setAttr(headingStamp.slice(0, end), 'pageBreak', pageBreak ? 1 : 0)
        + headingStamp.slice(end).replace(/<hp:t>[^<]*<\/hp:t>/, '<hp:t>' + H.escXml(label) + '</hp:t>');
};

// 첫 문단(쪽 설정): 바탕쪽 연결을 떼고, 쪽 번호는 아라비아 숫자로
let firstPara = first.paras[0];
if (!/<hp:secPr\b/.test(firstPara)) throw new Error('첫 문단에 쪽 설정(secPr)이 없다');
firstPara = firstPara
    .replace(/<hp:masterPage\b[^>]*\/>/g, '')
    .replace(/(\bmasterPageCnt=")\d+(")/, '$10$2')
    .replace(/(<hp:pageNum\b[^>]*\bformatType=")[^"]*(")/, '$1DIGIT$2')
    .replace(/<hp:t>[^<]*<\/hp:t>/, '<hp:t>보고서 본문 요약</hp:t>');

const body = [
    firstPara,
    // 건물명·점검 회차 자리(작은 글자). 큰 제목 줄은 글자가 커서 긴 글을 넣으면 겹친다.
    heading(H.SUBTITLE_PLACEHOLDER, false),
    heading('① 점검 주요결과 (결과표 · 5.1 현장조사 결과)', false),
    wrapTable(byKind.main[0], false),
    wrapTable(byKind.main[1], false),
    heading('② 실시결과 요약표', true),
    wrapTable(byKind.summary[0], false),
    heading('③ 주요 외관조사 결과 (3.3)', true)
].concat(byKind.survey.map((f, i) => wrapTable(f, i > 0))).concat([
    heading('④ 부분별 점검결과 (3.3)', true),
    wrapTable(byKind.part[0], false),
    heading('⑤ 현장조사 결과분석 (3.3)', true),
    wrapTable(byKind.analysis[0], false),
    wrapTable(byKind.analysis[1], true),
    heading('⑥ 주요 결함사항 원인 및 보수방안 (종합결론 4)', true),
    wrapTable(byKind.cause[0], false)
]);
let section = first.rootOpen + body.join('') + '</hs:sec>';

// 원본 보고서의 글자·그림을 지운다: 빈 내용으로 한 번 채운다(줄 수가 바뀌는 표는 본문 두 줄 = 가운데 줄 + 마지막 줄 서식)
const blankRow = (n) => ({ cat: null, cells: new Array(n).fill('-') });
const emptyModel = {
    title: null,
    cats: {},
    repair: null,
    summaryRows: [blankRow(4), blankRow(4)],
    partRows: [blankRow(6), blankRow(6)],
    causeRows: [blankRow(5), blankRow(5)]
};
section = H.fillSection(section, emptyModel, { blueCharPr: (id) => id, photo: () => null }, { noMerge: true });
if (/<hp:pic\b/.test(section)) throw new Error('그림이 남아 있다');
if (/binaryItemIDRef/.test(section)) throw new Error('그림 참조가 남아 있다');

let header = text('Contents/header.xml');
header = header.replace(/(<hh:head\b[^>]*\bsecCnt=")\d+(")/, '$11$2');

let hpf = text('Contents/content.hpf');
hpf = hpf.replace(/<opf:manifest>[\s\S]*<\/opf:manifest>/, '<opf:manifest>'
    + '<opf:item id="header" href="Contents/header.xml" media-type="application/xml"/>'
    + '<opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>'
    + '<opf:item id="settings" href="settings.xml" media-type="application/xml"/>'
    + '</opf:manifest>');
hpf = hpf.replace(/<opf:spine>[\s\S]*<\/opf:spine>/, '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine>');
hpf = hpf.replace(/<opf:title>[^<]*<\/opf:title>/, '<opf:title>보고서 본문 요약</opf:title>');
hpf = hpf.replace(/(<opf:meta name="(?:creator|lastsaveby)" content="text">)[^<]*(<\/opf:meta>)/g, '$1$2');

const pkg = 'http://www.hancom.co.kr/hwpml/2016/meta/pkg#';
const rdfPart = (file, type) => '<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="' + pkg + '" rdf:resource="' + file + '"/></rdf:Description>'
    + '<rdf:Description rdf:about="' + file + '"><rdf:type rdf:resource="' + pkg + type + '"/></rdf:Description>';
const rdf = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    + rdfPart('Contents/header.xml', 'HeaderFile') + rdfPart('Contents/section0.xml', 'SectionFile')
    + '<rdf:Description rdf:about=""><rdf:type rdf:resource="' + pkg + 'Document"/></rdf:Description></rdf:RDF>';

const settings = text('settings.xml').replace(/<ha:CaretPosition\b[^>]*\/>/, '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>');

const out = writeZip([
    { name: 'mimetype', data: src.mimetype, store: true },
    { name: 'version.xml', data: src['version.xml'], store: true },
    { name: 'Contents/header.xml', data: header },
    { name: 'Contents/section0.xml', data: section },
    { name: 'Contents/content.hpf', data: hpf },
    { name: 'settings.xml', data: settings },
    { name: 'META-INF/container.xml', data: src['META-INF/container.xml'] },
    { name: 'META-INF/container.rdf', data: rdf },
    { name: 'META-INF/manifest.xml', data: src['META-INF/manifest.xml'] },
    { name: 'Preview/PrvText.txt', data: '보고서 본문 요약' }
]);
fs.writeFileSync(outPath, out);
console.log('템플릿 저장: ' + outPath + ' (' + out.length + ' bytes)');
console.log('표: ' + Object.keys(want).map((k) => k + ' ' + byKind[k].length).join(', '));
console.log('구역 글자 수: ' + section.length);
