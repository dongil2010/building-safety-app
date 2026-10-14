'use strict';
// 2026-10-14 재현: 고흥군립남부도서관 — 층 목록에 다른 건물 층(본관 지하 1층)이 섞여 첫 층으로 골라지고
// 「클라우드에서 도면을 받지 못했습니다」. 도면이 어디에도 없고 마킹도 없는 층은 진입 때 자동으로 빠져야 한다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function sliceFn(name) {
    let start = app.indexOf(`    async function ${name}(`);
    if (start < 0) start = app.indexOf(`    function ${name}(`);
    assert.ok(start >= 0, name);
    return app.slice(start, app.indexOf('\n    }\n', start) + 6);
}
const src = ['countFloorMarkings', 'removeDrawinglessFloorFromBuilding', 'probeFloorDrawingOnCloud', 'findDrawinglessFloors', 'autoRemoveDrawinglessFloors'].map(sliceFn).join('\n');

function makeEnv({ cloud, idb, online = true, failCloud = false, markings = {} }) {
    const B = 'goheung';
    const bldg = { id: B, floorsList: ['본관 지하 1층', '2F', '3F', 'ROOF', 'EXT', '1F'].map((c) => ({ floorCode: c, floorLabel: c })) };
    const state = { companyId: 'c', currentBuildingId: B, currentFloor: '본관 지하 1층', defects: {}, ndtData: {} };
    Object.entries(markings).forEach(([fc, n]) => { state.defects[`${B}_${fc}`] = new Array(n).fill({ id: 'x' }); });
    const tomb = new Set();
    const doc = (col, id) => ({ get: async () => { if (failCloud) throw new Error('net'); return { exists: cloud.has(`${col}/${id}`) }; } });
    const db = { collection: () => ({ doc: () => ({ collection: (col) => ({ doc: (id) => doc(col, id) }) }) }) };
    const win = {
        state, showToast() {},
        getBuildingAvailableFloors: (b) => b.floorsList.filter((f) => !tomb.has(f.floorCode))
    };
    const deps = {
        window: win, state, db, navigator: { onLine: online },
        getCompanyDocId: () => 'c',
        floorDrawingTierCloudDocId: (b, f, d) => `${b}_${f}_${d}`,
        floorHasDrawingData: () => false,
        idbGetFloorDrawingTier: async (b, f) => idb.has(f) ? 'data:image/jpeg;base64,' + 'A'.repeat(40) : null,
        idbGet: async () => null,
        isUsableRasterDrawingUrl: (u) => typeof u === 'string' && u.length > 32,
        rememberDeletedDrawingFloor: (b, f) => tomb.add(f),
        stripDeletedDrawingFloorsFromBuilding: (b) => { b.floorsList = b.floorsList.filter((f) => !tomb.has(f.floorCode)); },
        markBuildingMetaDirty() {}, saveStateToLocalStorage() {}, scheduleSyncToFirebase() {}, console: { info() {}, warn() {} }
    };
    const names = Object.keys(deps);
    const api = new Function(...names, src + '; return { autoRemoveDrawinglessFloors };')(...names.map((k) => deps[k]));
    return { api, bldg, state };
}

(async () => {
    // 실제 층: 1F·2F·3F·ROOF·EXT는 클라우드나 기기에 도면이 있다. 본관 지하 1층은 어디에도 없다.
    const cloud = new Set(['floorDrawings/goheung_1F', 'floorDrawingPdfs/goheung_3F', 'floorDrawingTiers/goheung_ROOF_4000', 'floorDrawings/goheung_EXT']);
    const idb = new Set(['2F']);
    let env = makeEnv({ cloud, idb });
    let removed = await env.api.autoRemoveDrawinglessFloors(env.bldg, { silent: true });
    assert.deepStrictEqual(removed, ['본관 지하 1층'], '도면 없는 새어 들어온 층만 뺀다');
    assert.deepStrictEqual(env.bldg.floorsList.map((f) => f.floorCode), ['2F', '3F', 'ROOF', 'EXT', '1F'], '실제 층은 그대로');
    assert.strictEqual(env.state.currentFloor, '', '지금 층이 빠졌으면 비워서 실제 첫 층을 고르게 한다');

    // 마킹이 있으면 안 지운다
    env = makeEnv({ cloud, idb, markings: { '본관 지하 1층': 2 } });
    assert.deepStrictEqual(await env.api.autoRemoveDrawinglessFloors(env.bldg, { silent: true }), []);
    // 오프라인·클라우드 조회 실패면 안 지운다
    env = makeEnv({ cloud, idb, online: false });
    assert.deepStrictEqual(await env.api.autoRemoveDrawinglessFloors(env.bldg, { silent: true }), []);
    env = makeEnv({ cloud, idb, failCloud: true });
    assert.deepStrictEqual(await env.api.autoRemoveDrawinglessFloors(env.bldg, { silent: true }), [], '조회 실패 = 모름 = 안 지움');

    // 연결: 진입 때 기본 층 고르기 전에, 수정창 열 때도
    const enter = app.indexOf('try { await autoRemoveDrawinglessFloors(bldg); }');
    assert.ok(enter > 0 && enter < app.indexOf('populateFloorSelectDropdown(bldg);\n        warnIfBuildingDataLooksHollow(bldg);'));
    assert.ok(app.includes('autoRemoveDrawinglessFloors(bldg).then((removed) => {'), '수정창 열 때도 정리');
    // 지운 층이 서버의 옛 문서 때문에 되살아나지 않는다(삭제 시각보다 나중 문서만 되살림)
    const revive = new Function('_drawingFloorTombstone', sliceFn('evidenceCanReviveDeletedFloor') + '; return evidenceCanReviveDeletedFloor;')(
        { getDeletedDrawingFloorAt: (b, fc) => (b.deletedDrawingFloorAt || {})[fc] || 0 });
    const del = { deletedDrawingFloorAt: { '본관 지하 1층': 5000 } };
    assert.strictEqual(revive(del, '본관 지하 1층', 4000), false, '삭제 전 문서로는 안 되살림');
    assert.strictEqual(revive(del, '본관 지하 1층', 0), false, '시각 모르는 문서로도 안 되살림');
    assert.strictEqual(revive(del, '본관 지하 1층', 6000), true, '지운 뒤 다시 올린 문서면 되살림');
    assert.strictEqual(revive({}, '1F', 0), true, '삭제 시각 없는 옛 오탐 묘비는 예전처럼 해제');
    assert.ok(app.includes('if (!evidenceCanReviveDeletedFloor(bldg, fc, docAtByCode.get(fc) || 0)) {'));
    assert.ok(app.includes('if (!evidenceCanReviveDeletedFloor(bldg, fc, 0)) { codes.delete(fc); return; }'));
    console.log('test-floor-auto-clean: ok');
})().catch((e) => { console.error(e); process.exit(1); });
