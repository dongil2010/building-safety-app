#!/usr/bin/env node
'use strict';

/**
 * 감사 🔴 네 건 (2026-09-28): O-05 옛 PDF 잔존, R-10 비파괴 창 연 채 층 변경,
 * R-03 사진 업로드 실패 재시도, O-20-C NDT 전용 도면 저장.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const bridge = fs.readFileSync(path.join(root, 'js', 'pdf-vector-bridge.js'), 'utf8');
const metaMerge = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// ---- O-05: PDF를 그림으로 바꾸면 옛 PDF를 모든 곳에서 버리고, 다른 기기도 버리게 표시를 동기화 ----
(function o05() {
    const loop = app.slice(app.indexOf('await invalidateFloorDrawingBeforeReplace(bldg, item.floorCode);'));
    const pdfBranch = loop.indexOf('if (prepared && prepared.pdfDataUrl) {');
    const rasterBranch = loop.indexOf('await markFloorPdfRemoved(bldg, item.floorCode);');
    assert.ok(pdfBranch > 0 && rasterBranch > pdfBranch && rasterBranch < pdfBranch + 900,
        'JPG로 바꿀 때 옛 PDF를 버리지 않으면 그 층 핀이 옛 PDF 비율로 어긋난다');
    assert.ok(loop.slice(pdfBranch, rasterBranch).includes('clearFloorPdfRemoved(bldg, item.floorCode)'),
        '다시 PDF를 넣으면 표시를 풀어야 한다');
    const mark = extractFunction('async function markFloorPdfRemoved(');
    assert.ok(mark.includes('deleteFloorDrawingPdfFromCloud(') && mark.includes('markBuildingMetaDirty(bldg)'));
    assert.ok(metaMerge.KEYS.includes('floorPdfRemovedAt'), '표시가 건물 병합에서 다른 기기로 가야 한다');
    // 다른 기기는 표시를 보면 자기 PDF를 쓰지 않는다
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(bridge.slice(bridge.indexOf('  window.isFloorPdfRemoved'), bridge.indexOf('  function hexToPdfRgb')), ctx);
    const b = { floorDrawingPdfs: { '1F': 'data:application/pdf;base64,AAA' } };
    assert.ok(ctx.window.getFloorPdfDataUrl(b, '1F'));
    b.floorPdfRemovedAt = { '1F': 123 };
    assert.strictEqual(ctx.window.getFloorPdfDataUrl(b, '1F'), null, '표시가 있는데 옛 PDF를 쓰면 안 된다');
    b.floorPdfRemovedAt = { '1F': 0 };
    assert.ok(ctx.window.getFloorPdfDataUrl(b, '1F'), '표시를 풀면(0) 다시 쓴다');
    assert.ok(extractFunction('async function ensureFloorPlanRefForPdf(').includes('dropRemovedFloorPdf(bldg, floorCode)'));
    assert.ok(extractFunction('async function resolveBuildingFloorPdf(').includes('dropRemovedFloorPdf(bldg, floorCode)'));
    const sync = extractFunction('async function uploadFloorDrawingPdfsForSync(');
    assert.ok(sync.indexOf('dropRemovedFloorPdf(b, floorCode)') < sync.indexOf('uploadFloorDrawingPdf(b.id'),
        '동기화가 뺀 PDF를 다시 올리면 안 된다');
})();

// ---- R-10: 층을 바꾸기 전에 비파괴 창을 저장하며 닫는다 ----
(function r10() {
    const load = extractFunction('function loadFloorDrawing(');
    assert.ok(load.indexOf('closeNdtDrawersBeforeFloorChange()') < load.indexOf('state.currentFloor = floorCode'));
    const handler = app.slice(app.indexOf("elements.floorSelect.addEventListener('change'"));
    assert.ok(handler.indexOf('closeNdtDrawersBeforeFloorChange()') < handler.indexOf('window.state.currentFloor = e.target.value'),
        '층 선택 상자는 currentFloor를 먼저 바꾸므로 그 전에 닫아야 한다');
    const close = extractFunction('function closeNdtDrawersBeforeFloorChange(');
    ['closeNdtModal()', 'closeNdtCrackMonitorModal()', 'closeNdtDisplacementModal()', 'closeNdtDisplacementGroupEditModal()']
        .forEach((c) => assert.ok(close.includes(c), c));
    assert.ok(extractFunction('function closeNdtModal(').indexOf('flushNdtAutoApply()') >= 0, '닫을 때 저장해야 한다');
})();

// ---- R-03: 사진을 못 올린 층은 다시 "올릴 것 있음"으로 ----
(async function r03() {
    const results = { 'A_u1': true, 'A_u2': false, 'B_u3': true };
    const ctx = {
        db: {},
        window: { state: { companyId: 'c', buildings: [], ndtData: {} } },
        console: { warn() {} },
        getPhotoDocId: (id, i) => `${id}_${i}`,
        getOverviewPhotoDocId: () => '',
        getStrengthPhotoDocId: () => '',
        ensurePhotoPersistedToStorage: async (pid) => results[pid],
        runPhotoJobsInBatches: async (items, worker) => { for (const it of items) await worker(it); }
    };
    vm.createContext(ctx);
    vm.runInContext([
        'const PHOTO_SYNC_UPLOAD_MAX_RETRY = 5; const _photoSyncUploadFailCount = new Map();',
        extractFunction('async function uploadInlineDefectPhotosForSync('),
        'this.run = uploadInlineDefectPhotosForSync;'
    ].join('\n'), ctx);
    const map = {
        'bld_1F': [{ id: 'A', photoIds: ['A_u1', 'A_u2'] }],
        'bld_2F': [{ id: 'B', photoIds: ['B_u3'] }]
    };
    const failed = await ctx.run(map);
    assert.deepStrictEqual(Array.from(failed), ['bld_1F'], '사진 하나라도 못 올린 층만');
    for (let i = 0; i < 6; i++) await ctx.run(map);
    assert.strictEqual((await ctx.run(map)).size, 0, '같은 사진이 계속 실패하면 끝없이 다시 쓰지 않는다');

    const sync = extractFunction('async function syncStateToFirebase(');
    const write = sync.indexOf('await writeFloorSyncBundle(floorBldg, code);');
    const remark = sync.indexOf('photoFailedFloors.forEach((k) => markFloorKeyDirty(k))');
    assert.ok(write > 0 && remark > write, '층 쓰기가 표시를 지운 뒤에 다시 남겨야 한다');

    // NDT 전용 도면도 동기화가 다시 올린다 — 넣을 때 실패하면 그림이 영영 안 올라갔다(2026-09-28)
    const tried = [];
    const ctx2 = Object.assign({}, ctx, {
        window: { state: { companyId: 'c', buildings: [{ id: 'bld' }], ndtData: {},
            ndtDrawingRefs: { bld_1F: { id: 'ndtimg_x', at: 1 }, bld_2F: { id: '', at: 2 }, other_1F: { id: 'ndtimg_y', at: 3 } } } },
        ensurePhotoPersistedToStorage: async (pid) => { tried.push(pid); return pid !== 'ndtimg_x'; }
    });
    vm.createContext(ctx2);
    vm.runInContext([
        'const PHOTO_SYNC_UPLOAD_MAX_RETRY = 5; const _photoSyncUploadFailCount = new Map();',
        extractFunction('async function uploadInlineDefectPhotosForSync('),
        'this.run = uploadInlineDefectPhotosForSync;'
    ].join('\n'), ctx2);
    const failed2 = await ctx2.run({});
    assert.deepStrictEqual(tried, ['ndtimg_x'], '이 건물의 전용 도면만, 빈 id(원본 도면 연동)는 빼고');
    assert.deepStrictEqual(Array.from(failed2), ['bld_1F'], '못 올리면 그 층을 다시 올릴 것으로');
})().catch((e) => { console.error(e); process.exit(1); });

// ---- O-20-C: NDT 전용 도면은 기기·클라우드에 저장하고 참조를 동기화 ----
(function o20c() {
    assert.ok(/ndtDrawingRefs: window\.state\.ndtDrawingRefs \|\| \{\}/.test(app), '기기 저장에 참조가 없으면 새로고침에 사라진다');
    assert.ok(/window\.state\.ndtDrawingRefs = parsed\.ndtDrawingRefs/.test(app));
    const write = extractFunction('async function writeFloorSyncBundle(');
    assert.ok(write.includes('customDrawing: ndtDrawingRefFor(floorKey)'), '층 문서에 실어야 다른 기기로 간다');
    assert.ok(extractFunction('function mergeFloorBundleIntoState(').includes('mergeNdtDrawingRef(floorKey, ndt.customDrawing)'));
    const set = extractFunction('async function setNdtCustomDrawing(');
    assert.ok(set.includes('persistPhotoUrlToIdb(id, dataUrl)') && set.includes('persistPhotoToCloud(id, dataUrl)'));
    assert.ok(/photoId\.indexOf\('ndtimg_'\) === 0/.test(app), 'Storage 현장 폴더를 찾으려면 ndtimg_도 건물을 읽어야 한다');

    // 병합: 나중에 바꾼 쪽, 같으면 서버. 바뀌면 옛 그림을 버린다
    const ctx = { window: { state: { ndtDrawingRefs: { K: { id: 'ndtimg_old', at: 100 } }, currentTab: 'tab-home' } },
        state: null, setTimeout };
    ctx.state = ctx.window.state;
    ctx.state.ndtImages = { K: 'data:old' };
    vm.createContext(ctx);
    vm.runInContext([
        'const _ndtImageLoadedId = { K: "ndtimg_old" };',
        extractFunction('function ndtDrawingRefFor('),
        extractFunction('function currentNdtCustomDrawingSrc('),
        extractFunction('function mergeNdtDrawingRef('),
        'this.merge = mergeNdtDrawingRef; this.cur = currentNdtCustomDrawingSrc;'
    ].join('\n'), ctx);
    ctx.merge('K', { id: 'ndtimg_srv', at: 50 });
    assert.strictEqual(ctx.state.ndtDrawingRefs.K.id, 'ndtimg_old', '옛 서버 값이 새 로컬을 덮으면 안 된다');
    ctx.merge('K', { id: 'ndtimg_new', at: 200 });
    assert.strictEqual(ctx.state.ndtDrawingRefs.K.id, 'ndtimg_new');
    assert.strictEqual(ctx.cur('K'), null, '다른 기기가 바꾼 뒤엔 옛 그림을 쓰면 안 된다');
    ctx.merge('K', { id: '', at: 300 });
    assert.strictEqual(ctx.state.ndtDrawingRefs.K.id, '', '다른 기기가 전용 도면을 빼면 따라 뺀다');
})();

console.log('test-audit-red-fixes: ok');
