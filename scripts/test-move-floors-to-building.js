'use strict';
// 2026-10-20 층을 다른 동으로 옮기기(여수성광교회 본관·기념관 나누기) — 사진을 다시 올리지 않고 같은 id로 옮기는지
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
// vm 안에서 만든 배열·객체는 프로토타입이 달라 deepStrictEqual이 실패한다 — 내용으로 비교
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const constBlock = app.slice(app.indexOf('    const FLOOR_MOVE_KEEP_KEYS'), app.indexOf('    function floorMoveOtherMapKeys('));
const src = [
    constBlock,
    extractFunction(app, 'function floorMoveOtherMapKeys('),
    extractFunction(app, 'function planFloorMove('),
    extractFunction(app, 'function defectPhotoIdsOfList('),
    extractFunction(app, 'function trackDefectDeletion('),
    extractFunction(app, 'function trackNdtDeletion('),
    extractFunction(app, 'function tombstoneValue('),
    'window.bsaMoveFloorsToBuilding = ' + extractFunction(app, 'window.bsaMoveFloorsToBuilding = async function').replace(/^window\.bsaMoveFloorsToBuilding = /, '')
].join('\n');

function makeCtx() {
    const A = { id: 'bA', siteName: '여수성광교회', dong: '', floorsList: [{ floorCode: '본관 1층' }, { floorCode: '기념관 1층' }] };
    const B = { id: 'bB', siteName: '여수성광교회', dong: '기념관', floorsList: [] };
    const d1 = { id: 'd1', photoIds: ['d1_u1', 'd1_u2'], updatedAt: 5 };
    const d2 = { id: 'd2', photoIds: ['d2_u1'], prevRoundPhotoIds: ['d2_prev_u1'], updatedAt: 5 };
    const n1 = { id: 'n1', category: '강도' };
    const g1 = { id: 'g1' };
    const state = {
        buildings: [A, B],
        companyId: 'c',
        defects: { 'bA_기념관 1층': [d1, d2], 'bA_본관 1층': [{ id: 'k1', photoIds: ['k1_u1'] }] },
        ndtData: { 'bA_기념관 1층': [n1] },
        ndtDisplacementGroups: { 'bA_기념관 1층': [g1] },
        deletedDefectIds: {}, deletedDefectAt: {}, deletedNdtIds: {}, deletedNdtAt: {},
        drawingMemos: { 'bA_기념관 1층': [{ id: 'm1', text: '메모' }] },
        floorPrintCrops: { 'bA_기념관 1층': { x: 1, y: 2, w: 3, h: 4 } },
        floorMapStyleSettings: { 'bA_기념관 1층': { styleSizes: { pin: 3 } }, 'bA_본관 1층': { styleSizes: { pin: 9 } } }
    };
    const calls = { photoDelete: 0, clone: null, dirty: [], synced: 0, journal: [] };
    const ctx = {
        window: { state, BSA: { syncMerge: { tombstoneStampFor: () => 1 } } },
        state,
        navigator: { onLine: true },
        db: {},
        Date, Set, Array, Object, JSON, String, Promise, Error,
        getBuildingSiteName: (b) => b.siteName,
        getBuildingSurveyRoundKey: () => '2026년_하반기',
        collectKnownFloorCodesForBuilding: (b) => new Set((b.floorsList || []).map((f) => f.floorCode)),
        refreshBuildingFloorsFromServer: async () => ({ ok: true, failed: [] }),
        defectPhotoIdList: (e, n, kind) => (kind === 'prev' ? (e.prevRoundPhotoIds || []) : (e.photoIds || [])).slice(0, n),
        ensureSyncMetaState: () => {},
        journalRecord: (k, id, fk) => calls.journal.push([k, id, fk]),
        cloneFloorDrawingsFromSource: async (s, dstId, dst, o) => { calls.clone = { dstId, codes: o.floorCodes }; (o.floorCodes || []).forEach((fc) => dst.floorsList.push({ floorCode: fc })); },
        persistBuildingDrawingAssetsNow: async () => {},
        markFloorKeyDirty: (k) => calls.dirty.push(k),
        syncBuildingDrawingFloorCodes: () => {},
        markBuildingMetaDirty: () => {},
        saveStateToLocalStorage: () => {},
        syncAfterImportWithRetry: async () => { calls.synced++; },
        renderDashboard: () => {},
        // 이 함수들이 불리면 사진을 지우는 길로 간 것 — 절대 안 불려야 한다
        deleteAllPhotosForDefect: () => { calls.photoDelete++; },
        removeSingleDefectRecord: () => { calls.photoDelete++; }
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { ctx, state, calls, A, B, d1, d2, n1, g1 };
}

(async () => {
    // 먼저 보기(dryRun): 아무것도 안 바뀐다
    let t = makeCtx();
    let r = await t.ctx.window.bsaMoveFloorsToBuilding('bA', 'bB', ['기념관 1층'], { dryRun: true });
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(r.plan[0].defects, 2);
    assert.strictEqual(r.plan[0].photos, 4, '현재 사진 3 + 전회차 1');
    assert.strictEqual(r.plan[0].ndt, 1);
    assert.strictEqual(r.plan[0].groups, 1);
    eq([...r.plan[0].otherMaps].sort(), ['drawingMemos', 'floorMapStyleSettings', 'floorPrintCrops']);
    assert.strictEqual(t.state.defects['bA_기념관 1층'].length, 2, 'dryRun은 그대로');
    assert.strictEqual(t.calls.clone, null);

    // 실제로 옮기기
    t = makeCtx();
    r = await t.ctx.window.bsaMoveFloorsToBuilding('bA', 'bB', ['기념관 1층']);
    assert.strictEqual(r.dryRun, false);
    const moved = t.state.defects['bB_기념관 1층'];
    assert.strictEqual(moved.length, 2);
    assert.strictEqual(moved[0], t.d1, '같은 객체(같은 id·같은 사진 id)');
    eq(moved[0].photoIds, ['d1_u1', 'd1_u2'], '사진 id 그대로 — 다시 올리지 않음');
    eq(t.state.defects['bA_기념관 1층'], [], '원래 층은 비움');
    eq(t.state.deletedDefectIds['bA_기념관 1층'].sort(), ['d1', 'd2'], '원래 층에 묘비');
    assert.ok(t.state.deletedDefectAt['bA_기념관 1층'].d1 > 1000, '묘비 시각 = 지금(옮긴 뒤 원래 쪽 수정이 되살리지 않게)');
    assert.strictEqual(t.state.ndtData['bB_기념관 1층'][0], t.n1);
    assert.strictEqual(t.state.ndtDisplacementGroups['bB_기념관 1층'][0], t.g1);
    eq(t.state.deletedNdtIds['bA_기념관 1층'].sort(), ['g1', 'n1']);
    assert.strictEqual(t.calls.photoDelete, 0, '사진 삭제 길로 안 감');
    // 다른 층 기록은 복사(원래 쪽은 그대로)
    eq(t.state.drawingMemos['bB_기념관 1층'], [{ id: 'm1', text: '메모' }]);
    eq(t.state.floorPrintCrops['bB_기념관 1층'], { x: 1, y: 2, w: 3, h: 4 });
    assert.notStrictEqual(t.state.floorPrintCrops['bB_기념관 1층'], t.state.floorPrintCrops['bA_기념관 1층'], '복사본');
    // 고른 층만
    eq(t.calls.clone, { dstId: 'bB', codes: ['기념관 1층'] });
    assert.strictEqual(t.state.defects['bA_본관 1층'].length, 1, '안 고른 층은 그대로');
    assert.ok(!('bB_본관 1층' in t.state.floorMapStyleSettings));
    eq(t.calls.dirty.sort(), ['bA_기념관 1층', 'bB_기념관 1층']);
    assert.strictEqual(t.calls.synced, 1);
    // 묘비 칸은 옮기지 않는다
    assert.ok(!t.state.deletedDefectIds['bB_기념관 1층']);

    // 옮길 동 같은 층에 이미 기록이 있으면 막는다
    t = makeCtx();
    t.state.defects['bB_기념관 1층'] = [{ id: 'x' }];
    r = await t.ctx.window.bsaMoveFloorsToBuilding('bA', 'bB', ['기념관 1층']);
    assert.strictEqual(r.blocked, true);
    assert.strictEqual(t.state.defects['bA_기념관 1층'].length, 2, '막히면 안 바뀜');

    // 다른 현장이면 거부
    t = makeCtx();
    t.B.siteName = '다른현장';
    await assert.rejects(() => t.ctx.window.bsaMoveFloorsToBuilding('bA', 'bB', ['기념관 1층']), /같은 현장/);

    // 원래 동에 없는 층이면 막는다
    t = makeCtx();
    r = await t.ctx.window.bsaMoveFloorsToBuilding('bA', 'bB', ['없는층']);
    assert.strictEqual(r.blocked, true);

    // 사본 층 비우기(bsaReleaseDuplicateFloors): 다른 동에 같은 id가 있는 기록만 묘비, 사진 삭제 길 안 감, 고유 기록은 남김
    {
        const tt = makeCtx();
        vm.runInContext('window.bsaReleaseDuplicateFloors = ' + extractFunction(app, 'window.bsaReleaseDuplicateFloors = async function').replace(/^window\.bsaReleaseDuplicateFloors = /, ''), tt.ctx);
        tt.state.defects['bB_기념관 1층'] = [{ id: 'd1' }];   // d1만 다른 동에 같은 id로 있다
        tt.state.ndtData['bB_기념관 1층'] = [{ id: 'n1' }];
        const rr = await tt.ctx.window.bsaReleaseDuplicateFloors('bA', ['기념관 1층'], { dryRun: true });
        assert.strictEqual(rr.report[0].released, 2);
        assert.strictEqual(tt.state.defects['bA_기념관 1층'].length, 2, 'dryRun은 그대로');
        const r2 = await tt.ctx.window.bsaReleaseDuplicateFloors('bA', ['기념관 1층']);
        assert.strictEqual(r2.report[0].released, 2, 'd1 + n1');
        eq(tt.state.defects['bA_기념관 1층'].map((d) => d.id), ['d2'], '고유 결함 d2는 남김');
        eq(tt.state.deletedDefectIds['bA_기념관 1층'], ['d1']);
        eq(tt.state.deletedNdtIds['bA_기념관 1층'], ['n1']);
        eq(tt.state.ndtDisplacementGroups['bA_기념관 1층'].map((g) => g.id), ['g1'], '다른 데 없는 변위 구역은 남김');
        assert.strictEqual(tt.calls.photoDelete, 0);
        assert.ok(r2.report[0].kept.includes('defects:d2'));
    }

    // 이 코드는 한글 출력 지문 구간 밖에 있어야 한다
    const hwpxStart = app.indexOf('    // --- HWPX 균열 게이지·팁 측정결과');
    const at = app.indexOf('window.bsaMoveFloorsToBuilding = async function');
    assert.ok(at > 0 && at < hwpxStart);
    // 도면 복사는 고른 층만(options.floorCodes)
    assert.ok(app.includes('const onlyCodes = Array.isArray(options.floorCodes)'));

    console.log('test-move-floors-to-building: ok');
})().catch((e) => { console.error(e); process.exit(1); });
