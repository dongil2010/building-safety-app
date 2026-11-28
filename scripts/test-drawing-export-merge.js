#!/usr/bin/env node
'use strict';
/**
 * 2026-11-17 「DXF·PDF 출력」 — 벡터 PDF·마킹 DXF 를 버튼 하나로.
 * DXF로 올린 층 = 마킹 DXF, PDF로 올린 층 = 벡터 PDF, 도면 원본 없는 층은 전층에서 뺀다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'dxf-marking-export.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js', 'pdf-vector-bridge.js'), 'utf8');

/** 파일 전체를 가짜 window 로 돌린다(함수 정의만, 브라우저 일은 안 함) */
function loadModule(extra) {
    const window = Object.assign({ state: null }, extra || {});
    new Function('window', 'JSZip', 'PDFLib', src)(window, extra && extra.JSZip, extra && extra.PDFLib);
    return window;
}

// 1) 나누기·출력 모양(순수)
{
    const w = loadModule();
    const E = w.BSA.drawingExport;
    const split = E.splitFloorsByDrawingKind([
        { floorCode: 'B1', kind: 'pdf' },
        { floorCode: '1F', kind: 'dxf' },
        { floorCode: '2F', kind: 'none' },
        { floorCode: '3F', kind: 'pdf' },
        { floorCode: '', kind: 'pdf' },
        null,
        { floorCode: '4F', kind: '이상한값' }
    ]);
    assert.deepStrictEqual(split, { dxf: ['1F'], pdf: ['B1', '3F'], none: ['2F', '4F'] }, '층 순서 유지, 모르는 값은 none');
    assert.strictEqual(E.planAllFloorsDrawingExport(split), 'mixed-zip');
    assert.strictEqual(E.planAllFloorsDrawingExport({ dxf: ['1F'], pdf: [], none: ['2F'] }), 'dxf');
    assert.strictEqual(E.planAllFloorsDrawingExport({ dxf: [], pdf: ['1F'], none: [] }), 'pdf');
    assert.strictEqual(E.planAllFloorsDrawingExport({ dxf: [], pdf: [], none: ['1F'] }), 'nothing');
    assert.strictEqual(E.pickCurrentFloorExport('dxf'), 'dxf');
    assert.strictEqual(E.pickCurrentFloorExport('pdf'), 'pdf');
    assert.strictEqual(E.pickCurrentFloorExport('none'), 'pdf', '원본 없음 안내는 벡터 PDF 쪽이 한다');
    console.log('나누기: ok');
}

// 2) 현재 층: 층 종류대로 DXF / PDF
async function runCurrent(kind) {
    const calls = [];
    const w = loadModule({
        showLoading() {}, hideLoading() {}, showToast() {},
        resolveFloorPdfDataUrlAsync: async () => (kind === 'none' ? null : 'data:application/pdf;base64,AA=='),
        BSA: { dxfToPdf: { readMetaFromPdfDataUrl: async () => (kind === 'dxf' ? { s: 2, ox: 0, oy: 0 } : null) } }
    });
    w.state = { currentBuildingId: 'b1', currentBuilding: { id: 'b1' }, currentFloor: '1F' };
    w.exportCurrentFloorMarkingDxf = async () => calls.push('dxf');
    w.exportCurrentFloorVectorPdf = async () => calls.push('pdf');
    assert.strictEqual(await w.detectFloorDrawingKind(w.state.currentBuilding, '1F'), kind);
    await w.exportCurrentFloorDrawing();
    return calls.join(',');
}

// 3) 범위 고르기: appChoose(앱 창) 우선, 없으면 prompt
async function runScope(pick, hasChoose, floors) {
    const calls = [];
    const w = loadModule({ showToast() {} });
    w.state = { currentBuildingId: 'b1', currentBuilding: { id: 'b1' }, currentFloor: '1F' };
    w.listFloorsForVectorPdfExport = () => floors || ['1F', '2F'];
    w.exportAllFloorsDrawing = async () => calls.push('all');
    w.exportCurrentFloorDrawing = async () => calls.push('cur');
    w.prompt = () => { calls.push('prompt'); return null; };
    if (hasChoose) w.appChoose = async (msg, choices) => { assert.strictEqual(choices.length, 2); return pick; };
    await w.exportFloorDrawingWithScopeChoice();
    return calls.join(',');
}

// 4) 전층: PDF 층은 한 PDF, DXF 층은 DXF 한 파일(층 나란히), 섞이면 zip 하나
async function runAll(kinds) {
    const downloads = [];
    const toasts = [];
    const zipFiles = [];
    class FakeZip {
        file(name, data) { zipFiles.push(name); }
        async generateAsync() { return { zip: zipFiles.slice() }; }
    }
    const w = loadModule({
        JSZip: FakeZip,
        PDFLib: {},
        showLoading() {}, hideLoading() {},
        showToast: (m, t) => toasts.push(t + ':' + m),
        downloadBlobFile: (blob, name) => downloads.push(name),
        resolveFloorPdfDataUrlAsync: async (b, fc) => (kinds[fc] === 'none' ? null : 'pdf:' + fc),
        BSA: {
            dxfToPdf: { readMetaFromPdfDataUrl: async (u) => (kinds[u.slice(4)] === 'dxf' ? { s: 1, ox: 0, oy: 0 } : null) },
            dxfWrite: { buildSheetsDxf: (sheets) => 'DXF:' + sheets.map((x) => x.title).join(',') }
        }
    });
    w.state = { currentBuildingId: 'b1', currentBuilding: { id: 'b1', name: '본관', floorsList: [] }, currentFloor: '1F' };
    w.listFloorsForVectorPdfExport = () => Object.keys(kinds);
    const pdfAsked = [];
    w.buildMergedFloorsVectorPdfBlob = async (b, codes) => { pdfAsked.push(...codes); return { blob: codes.length ? 'PDF' : null, ok: codes.length, skipped: [] }; };
    const dxfAsked = [];
    w.buildFloorMarkingDxfInfo = async (b, fc) => { dxfAsked.push(fc); return { text: 'DXF', system: 'cad', count: 3, floorCode: fc }; };
    await w.exportAllFloorsDrawing();
    return { downloads, toasts, zipFiles, pdfAsked, dxfAsked };
}

(async () => {
    assert.strictEqual(await runCurrent('dxf'), 'dxf');
    assert.strictEqual(await runCurrent('pdf'), 'pdf');
    assert.strictEqual(await runCurrent('none'), 'pdf');
    console.log('현재 층: ok');

    assert.strictEqual(await runScope(1, true), 'all');
    assert.strictEqual(await runScope(0, true), 'cur');
    assert.strictEqual(await runScope(null, true), '');
    assert.strictEqual(await runScope(null, false), 'prompt');
    assert.strictEqual(await runScope(1, true, ['1F']), 'cur', '층이 하나면 묻지 않고 현재 층');
    console.log('범위 고르기: ok');

    // PDF 층만 → PDF 한 파일(예전 전층 벡터 PDF와 같은 이름 모양), 원본 없는 층은 뺌
    let r = await runAll({ B1: 'pdf', '1F': 'pdf', '2F': 'none' });
    assert.deepStrictEqual(r.pdfAsked, ['B1', '1F']);
    assert.deepStrictEqual(r.dxfAsked, []);
    assert.strictEqual(r.downloads.length, 1);
    assert(/^결함위치도_벡터_전층_본관_\d+\.pdf$/.test(r.downloads[0]), r.downloads[0]);
    assert(r.toasts.some((t) => /^success:/.test(t) && /제외 1층/.test(t)));

    // DXF 층만 → DXF 한 파일(층 순서대로 나란히), zip 없음
    r = await runAll({ '1F': 'dxf', '2F': 'dxf' });
    assert.deepStrictEqual(r.pdfAsked, []);
    assert.deepStrictEqual(r.dxfAsked, ['1F', '2F']);
    assert.strictEqual(r.zipFiles.length, 0);
    assert.strictEqual(r.downloads.length, 1);
    assert(/^결함위치도_마킹_본관_\d+\.dxf$/.test(r.downloads[0]), r.downloads[0]);

    // 섞임 → zip 하나 안에 DXF 들 + PDF 한 파일
    r = await runAll({ B1: 'pdf', '1F': 'dxf', '2F': 'pdf', '3F': 'none' });
    assert.deepStrictEqual(r.dxfAsked, ['1F'], 'PDF 층은 DXF로 안 만듦');
    assert.deepStrictEqual(r.pdfAsked, ['B1', '2F'], 'DXF 층은 PDF로 안 만듦');
    assert.strictEqual(r.zipFiles.filter((n) => /\.dxf$/.test(n)).length, 1);
    assert.strictEqual(r.zipFiles.filter((n) => /\.pdf$/.test(n)).length, 1);
    assert.strictEqual(r.downloads.length, 1, '내려받기는 한 번(zip)');

    // 아무 도면도 없음 → 내려받지 않고 안내
    r = await runAll({ '1F': 'none' });
    assert.strictEqual(r.downloads.length, 0);
    assert(r.toasts.some((t) => /^warning:/.test(t)));
    console.log('전층: ok');

    // 화면 연결: 버튼 하나, 예전 벡터 PDF 버튼은 결함위치도에서 없앰
    assert(/id="btnExportFloorDrawing"[^>]*>\s*DXF·PDF 출력\s*<\/button>/.test(html), '버튼 글자');
    assert(!/id="btnExportVectorPdf"/.test(html), '예전 벡터 PDF 버튼 없음');
    assert(!/id="btnExportMarkingDxf"/.test(html), '예전 마킹 DXF 버튼 없음');
    assert(/getElementById\('btnExportFloorDrawing'\)[\s\S]{0,400}exportFloorDrawingWithScopeChoice/.test(html));
    assert(/window\.buildMergedFloorsVectorPdfBlob = async function/.test(bridge));
    assert(/window\.exportAllFloorsVectorPdf = async function[\s\S]{0,1200}buildMergedFloorsVectorPdfBlob\(/.test(bridge), '예전 전층 PDF도 같은 묶기 사용');
    console.log('test-drawing-export-merge: ok');
})().catch((e) => { console.error(e); process.exit(1); });
