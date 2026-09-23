#!/usr/bin/env node
'use strict';

/**
 * 한글(HWPX) 표 구조 검사.
 *
 * 2026-09-22 기울기·부동침하·부재변위 결과표(501~503)는 템플릿 속 칸 순서가 뒤섞여
 * 있었는데, 한글이 파일을 열어 주니 몇 주 동안 아무도 몰랐다. 그전까지 실제 파일 구조는
 * 사람이 브라우저에서 손으로 확인했다. 템플릿을 한글에서 손으로 고쳐 저장하다 생긴
 * 사고도 세 번 있었다(층 중복, 죽은 목록 항목, 다른 병원 자료 섞임).
 *
 * 그래서 CI가 매번 템플릿 9개의 구조를 본다. 앱은 같은 검사기로 내보낸 파일도 본다
 * (app.js reportHwpxStructure → 현장 오류 기록).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const v = require(path.join(__dirname, '..', 'js', 'shared', 'hwpx-validate.js'));
const { readZip } = require(path.join(__dirname, 'lib', 'zip-read.js'));

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------- 가짜 XML 조립
function tc(col, row, colSpan, rowSpan, inner) {
    return '<hp:tc><hp:subList>' + (inner || '<hp:p><hp:run><hp:t>x</hp:t></hp:run></hp:p>') + '</hp:subList>'
        + '<hp:cellAddr colAddr="' + col + '" rowAddr="' + row + '"/>'
        + '<hp:cellSpan colSpan="' + (colSpan || 1) + '" rowSpan="' + (rowSpan || 1) + '"/>'
        + '<hp:cellSz width="100" height="100"/></hp:tc>';
}
function tbl(id, rowCnt, colCnt, rows) {
    return '<hp:tbl id="' + id + '" rowCnt="' + rowCnt + '" colCnt="' + colCnt + '">'
        + '<hp:sz width="1" height="1"/>'
        + rows.map((cells) => '<hp:tr>' + cells.join('') + '</hp:tr>').join('')
        + '</hp:tbl>';
}
function section(body) {
    return '<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="s" xmlns:hp="p"><hp:p>' + body + '</hp:p></hs:sec>';
}
function codes(xml) {
    return v.validateSection(xml).problems.map((p) => p.code).sort();
}

// --- 정상 표 ---
(function cleanTable() {
    const xml = section(tbl('1', 2, 2, [[tc(0, 0), tc(1, 0)], [tc(0, 1), tc(1, 1)]]));
    const r = v.validateSection(xml);
    assert.strictEqual(r.ok, true, JSON.stringify(r.problems));
    assert.strictEqual(r.tables, 1);
})();

// --- 병합 칸이 있어도 격자를 정확히 덮으면 정상 ---
(function mergedCellsOk() {
    // 0행: 두 칸 가로 병합 / 1~2행: 왼쪽 세로 병합
    const xml = section(tbl('1', 3, 2, [
        [tc(0, 0, 2, 1)],
        [tc(0, 1, 1, 2), tc(1, 1)],
        [tc(1, 2)]
    ]));
    assert.deepStrictEqual(codes(xml), []);
})();

// --- 501~503 사고: 같은 행 안에서 칸 순서가 뒤섞임 ---
(function colOrderScrambled() {
    const xml = section(tbl('501', 1, 3, [[tc(0, 0), tc(2, 0), tc(1, 0)]]));
    assert.deepStrictEqual(codes(xml), ['col-order']);
})();

// --- 구멍: 어느 칸도 안 덮는 자리 ---
(function gridHole() {
    const xml = section(tbl('1', 2, 2, [[tc(0, 0), tc(1, 0)], [tc(0, 1)]]));
    assert.deepStrictEqual(codes(xml), ['grid-hole']);
})();

// --- 겹침: 병합 칸이 옆 칸을 덮는데 옆 칸도 따로 있음 ---
(function gridOverlap() {
    const xml = section(tbl('1', 1, 2, [[tc(0, 0, 2, 1), tc(1, 0)]]));
    assert.deepStrictEqual(codes(xml), ['grid-overlap']);
})();

// --- rowCnt와 실제 행 수가 다름 (행 복제하고 rowCnt 안 늘린 경우) ---
(function rowCountMismatch() {
    const xml = section(tbl('1', 1, 1, [[tc(0, 0)], [tc(0, 1)]]));
    assert.ok(codes(xml).includes('row-count'));
})();

// --- 병합이 표 밖으로 나감 ---
(function outOfBounds() {
    const xml = section(tbl('1', 1, 2, [[tc(0, 0), tc(1, 0, 2, 1)]]));
    assert.ok(codes(xml).includes('out-of-bounds'));
})();

// --- 칸에 적힌 행 번호가 실제 위치와 다름 ---
(function rowAddrMismatch() {
    const xml = section(tbl('1', 2, 1, [[tc(0, 0)], [tc(0, 5)]]));
    assert.ok(codes(xml).includes('row-addr'));
})();

// --- 중첩 표: 칸 안의 표가 바깥 표의 칸 주소를 헷갈리게 하면 안 된다 ---
(function nestedTable() {
    const inner = tbl('9', 1, 2, [[tc(0, 0), tc(1, 0)]]);
    const xml = section(tbl('1', 1, 2, [[tc(0, 0, 1, 1, inner), tc(1, 0)]]));
    const r = v.validateSection(xml);
    assert.strictEqual(r.tables, 2, '중첩 표도 따로 세야 한다');
    assert.strictEqual(r.ok, true, JSON.stringify(r.problems));
    const tables = v.extractTables(xml);
    assert.strictEqual(tables[0].depth, 0);
    assert.strictEqual(tables[1].depth, 1);
    assert.deepStrictEqual(tables[0].rows[0].map((c) => c.colAddr), [0, 1], '바깥 표 칸 주소가 안쪽 표에 먹혔다');

    // 안쪽 표만 망가져도 그 표 하나로 잡힌다
    const badInner = tbl('9', 1, 2, [[tc(1, 0), tc(0, 0)]]);
    const bad = v.validateSection(section(tbl('1', 1, 2, [[tc(0, 0, 1, 1, badInner), tc(1, 0)]])));
    assert.deepStrictEqual(bad.problems.map((p) => p.table.id), ['9']);
})();

// --- 파일이 중간에 잘림 / 태그 짝이 안 맞음 ---
(function brokenXml() {
    const full = section(tbl('1', 1, 1, [[tc(0, 0)]]));
    assert.deepStrictEqual(codes(full.slice(0, full.length - 30)), ['xml'], '잘린 파일');
    assert.deepStrictEqual(codes(full.replace('</hp:subList>', '</hp:run>')), ['xml'], '태그 짝 어긋남');
    // 속성 값 안의 > 는 태그 끝이 아니다
    assert.strictEqual(v.checkWellFormed('<a x="1>2"><b/></a>').ok, true);
})();

// --- 목록(content.hpf)에 있는데 zip에 없는 파일 (2026-08 죽은 목록 항목 사고) ---
(function manifestMissing() {
    const hpf = '<opf:manifest><opf:item id="s0" href="Contents/section0.xml" media-type="x"/>'
        + '<opf:item id="img1" href="BinData/image1.png" media-type="image/png"/></opf:manifest>';
    assert.deepStrictEqual(v.checkManifest(hpf, ['Contents/section0.xml', 'BinData/image1.png']), []);
    assert.deepStrictEqual(v.checkManifest(hpf, ['Contents/section0.xml']), ['BinData/image1.png']);
})();

// --- 출력 직후 검사: 문제가 있으면 현장 오류 기록에 남기고, 없으면 조용히 ---
(function reportsToErrorLog() {
    const recorded = [];
    globalThis.BSA = globalThis.BSA || {};
    const prev = globalThis.BSA.errorLog;
    const prevWarn = console.warn;
    globalThis.BSA.errorLog = { record: (e) => { recorded.push(e); return true; } };
    console.warn = () => {};
    try {
        const clean = v.reportGeneratedHwpx({ sectionXml: section(tbl('1', 1, 1, [[tc(0, 0)]])), label: 'T' });
        assert.strictEqual(clean.ok, true);
        assert.strictEqual(recorded.length, 0, '정상 파일인데 기록을 남겼다');

        const bad = v.reportGeneratedHwpx({
            sectionXml: section(tbl('501', 1, 2, [[tc(1, 0), tc(0, 0)]])),
            hpfText: '<opf:item href="BinData/x.png"/>',
            fileNames: [],
            label: '한글 출력(1·2종)'
        });
        assert.strictEqual(bad.ok, false);
        assert.strictEqual(recorded.length, 1);
        assert.strictEqual(recorded[0].kind, 'hwpx-structure');
        assert.ok(recorded[0].message.indexOf('id=501') >= 0, recorded[0].message);
        assert.ok(recorded[0].message.indexOf('BinData/x.png') >= 0, '목록 누락도 같이 적어야 한다');

        // 이상한 입력에도 절대 던지지 않는다 (출력을 막으면 안 된다)
        assert.doesNotThrow(() => v.reportGeneratedHwpx(null));
        assert.doesNotThrow(() => v.reportGeneratedHwpx({ sectionXml: 12345 }));
    } finally {
        globalThis.BSA.errorLog = prev;
        console.warn = prevWarn;
    }
})();

// ---------------------------------------------------------------- 실제 템플릿 9개
/**
 * 알려진 예외: 정밀점검 템플릿 두 개의 501~503 표는 템플릿 속 칸 순서가 뒤섞여 있고,
 * 출력할 때 sortHwpxRowCellsByColAddr가 바로잡는다(test-hwpx-row-cell-order.js).
 * 템플릿 자체를 고치지 않은 건, 한글에서 다시 저장하면 표 id·구조가 바뀌는 등 템플릿
 * 손대기가 사고가 잦았기 때문이다. **여기 없는 문제는 전부 실패다.**
 */
const KNOWN = {
    'hwpx_survey_template.hwpx': { 'col-order': ['501', '502', '503'] },
    'hwpx_survey_template_grade3.hwpx': { 'col-order': ['501', '502', '503'] }
};

(function templatesAreStructurallySound() {
    const dir = path.join(ROOT, 'templates');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.hwpx')).sort();
    assert.ok(files.length >= 9, '템플릿이 ' + files.length + '개뿐이다');

    const failures = [];
    const knownSeen = {};
    files.forEach((file) => {
        const zip = readZip(path.join(dir, file));
        const names = zip.names();

        const missing = v.checkManifest(zip.text('Contents/content.hpf'), names);
        missing.forEach((href) => failures.push(file + ': 목록에 있는데 파일이 없음 ' + href));

        const sections = names.filter((n) => /^Contents\/section\d+\.xml$/.test(n));
        assert.ok(sections.length > 0, file + ': 섹션이 없다');
        sections.forEach((s) => {
            const r = v.validateSection(zip.text(s));
            r.problems.forEach((p) => {
                const allowed = KNOWN[file] && KNOWN[file][p.code];
                if (allowed && p.table && allowed.indexOf(p.table.id) >= 0) {
                    knownSeen[file + '|' + p.code + '|' + p.table.id] = true;
                    return;
                }
                failures.push(file + ' ' + s + ': ' + (p.table ? '표 id=' + p.table.id + ' ' : '') + p.message);
            });
        });
    });
    assert.deepStrictEqual(failures, [], '템플릿 구조 문제:\n  ' + failures.join('\n  '));

    // 예외 목록이 낡으면(템플릿을 고쳤는데 목록은 그대로) 다른 문제를 가릴 수 있다
    Object.keys(KNOWN).forEach((file) => {
        Object.keys(KNOWN[file]).forEach((code) => {
            KNOWN[file][code].forEach((id) => {
                assert.ok(knownSeen[file + '|' + code + '|' + id],
                    file + ' 표 id=' + id + '의 ' + code + '가 더는 안 나온다 — KNOWN에서 지울 것');
            });
        });
    });
})();

// ---------------------------------------------------------------- 앱 연결
(function wiredIntoExport() {
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
    const calls = app.match(/await reportHwpxStructure\(zip, sectionPath, newXml, bldg\);\n\n\s*if \(typeof window\.updateLoadingText === 'function'\) \{\n\s*window\.updateLoadingText\('한글\(hwpx\) 파일 압축 중\.\.\.'\);\n\s*\}\n\s*const blob = await zip\.generateAsync/g) || [];
    assert.strictEqual(calls.length, 2, '1·2종 / 3종 두 출력 경로 모두 압축 직전에 검사해야 한다');

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const mine = html.indexOf('js/shared/hwpx-validate.js');
    assert.ok(mine > 0, 'index.html에 hwpx-validate.js가 없다');
    assert.ok(mine < html.indexOf('src="app.js'), 'app.js보다 먼저 실려야 한다');
})();

console.log('test-hwpx-structure: ok');
