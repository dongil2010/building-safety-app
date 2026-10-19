#!/usr/bin/env node
'use strict';
/**
 * 2026-10-19 오래된 캐시 정리 보호 — A건물 사진 시나리오.
 * 어제 오프라인으로 A건물에서 사진을 찍음(아직 안 올라감) → 오늘 B건물 작업 → 인터넷 연결.
 * 예전: 연결 순간 「24시간 안 연 건물 캐시 정리」가 올리기보다 먼저 돌아 A의 사진 사본(IndexedDB)을 지울 수 있었다.
 * 지금: ① 올리기·확인이 끝나기 전에는 정리 안 함 ② 끝난 뒤에도 안 올라간 사진·올릴 층·오프라인 준비한 건물은 남김.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const guard = require(path.join(root, 'js', 'core', 'cache-purge-guard.js'));
const { extractFunction } = require('./lib-extract-fn');

// --- 모듈 ---
assert.strictEqual(guard.pruneBlockReason({ offlineReturnPending: true }), 'offline-return-pending');
assert.strictEqual(guard.pruneBlockReason({ dirtyCount: 2 }), 'dirty-floors');
assert.strictEqual(guard.pruneBlockReason({ syncing: true }), 'syncing');
assert.strictEqual(guard.pruneBlockReason({ photoSavesPending: 1 }), 'photo-saving');
assert.strictEqual(guard.pruneBlockReason({}), '');
{
    const sel = guard.selectPurgeable(['A', 'C', 'D', 'E', 'F'], {
        dirtyFloorKeys: ['D_1F'],
        unuploadedPhotoBuildingIds: ['A'],
        preparedIds: ['E'],
        pendingJournalBuildingIds: ['F']
    });
    assert.deepStrictEqual(sel.purge, ['C']);
    assert.deepStrictEqual(sel.kept.map((k) => k.id + ':' + k.why).sort(),
        ['A:unuploaded-photos', 'D:dirty-floors', 'E:offline-prepared', 'F:unconfirmed-changes']);
}
assert.strictEqual(guard.isUnuploadedLocalPhoto(false, 'data:image/jpeg;base64,xx'), true);
assert.strictEqual(guard.isUnuploadedLocalPhoto(true, 'data:image/jpeg;base64,xx'), false);
assert.strictEqual(guard.isUnuploadedLocalPhoto(false, 'https://x/y.jpg'), false);

// --- app.js 실제 함수로 A건물 시나리오 ---
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const code = [
    extractFunction(app, 'async function purgeBuildingIndexedDbAssets('),
    extractFunction(app, 'async function buildingHasUnuploadedPhotos('),
    extractFunction(app, 'async function collectPurgeProtection('),
    extractFunction(app, 'async function pruneStaleIndexedDbInspectionData(')
].join('\n');

async function scenario() {
    const HOUR = 3600 * 1000;
    const now = Date.now();
    const idb = new Map([
        ['pA1', 'data:image/jpeg;base64,AAAA'],        // A: 오프라인에서 찍음, 아직 안 올라감
        ['pC1', 'data:image/jpeg;base64,CCCC']         // C: 서버에 올라간 사진(서버 표시 있음)
    ]);
    const marked = new Set(['pC1']);
    const ls = new Map([['bsa_offline_worked_v1', '1']]);
    const accessMap = { A: now - 30 * HOUR, B: now, C: now - 40 * HOUR };
    const env = {
        window: {
            BSA: { cachePurgeGuard: guard, offlinePrep: { listStatuses: async () => [] } },
            state: {
                currentBuildingId: 'B',
                defects: { A_1F: [{ id: 'dA', photoIds: ['pA1'] }], C_1F: [{ id: 'dC', photoIds: ['pC1'] }], B_1F: [] }
            },
            _photoCache: {},
            showToast() {}
        },
        localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
        navigator: { onLine: true },
        state: null,
        _dirtyFloorKeys: new Set(),
        _syncInFlight: false,
        _offlineReturnRunning: false,
        BUILDING_ACCESS_TTL_MS: 24 * HOUR,
        ensureBuildingAccessSeeded: () => accessMap,
        writeBuildingAccessMap: () => {},
        deleteIdbKeysWithBuildingPrefix: async () => 0,
        getPhotoDocId: (id, i, kind) => `${id}${kind ? '_' + kind : ''}_${i}`,
        idbGet: async (store, k) => idb.get(k),
        idbDelete: async (store, k) => idb.delete(k),
        _idbPersistedPhotoKeys: new Set(),
        clearPersistedKeyPrefix: () => {},
        _idbPersistedDrawingKeys: new Set(), _idbPersistedTierKeys: new Set(), _idbPersistedPdfKeys: new Set(), _idbPersistedSourceKeys: new Set(),
        isPhotoMarkedOnStorage: (k) => marked.has(k),
        offlinePrepPhotoKeysOfBuilding: (id) => new Set(((env.window.state.defects[`${id}_1F`] || [])[0] || { photoIds: [] }).photoIds),
        syncJournal: () => ({ pendingEntries: () => [] }),
        console: { info() {}, warn() {}, log() {} }
    };
    env.state = env.window.state;
    const names = Object.keys(env);
    const factory = new Function(...names, `let _idbInspectionPruneInFlight = null;\n${code}\nreturn { pruneStaleIndexedDbInspectionData, purgeBuildingIndexedDbAssets };`);
    const api = factory(...names.map((n) => env[n]));

    // 1) 연결 직후: 오프라인 작업 표시가 남아 있음(올리기·확인 전) → 정리하지 않음
    let r = await api.pruneStaleIndexedDbInspectionData();
    assert.strictEqual(r.skipped, 'offline-return-pending');
    assert.ok(idb.has('pA1') && idb.has('pC1'), '아무것도 안 지움');

    // 2) 올리는 중 / 올릴 층 남음 → 정리하지 않음
    ls.delete('bsa_offline_worked_v1');
    env._dirtyFloorKeys.add('A_1F');
    // (factory 안의 _dirtyFloorKeys는 같은 Set 객체)
    r = await api.pruneStaleIndexedDbInspectionData();
    assert.strictEqual(r.skipped, 'dirty-floors');
    env._dirtyFloorKeys.clear();

    // 3) 다 끝난 뒤: A는 안 올라간 사진이 있어 남기고, C(올라간 사진만)는 정리
    r = await api.pruneStaleIndexedDbInspectionData();
    assert.strictEqual(r.removedBuildings, 1, 'C만 정리');
    assert.ok(idb.has('pA1'), 'A의 안 올라간 사진은 그대로');
    assert.ok(!idb.has('pC1'), 'C의 서버에 있는 사진 사본은 정리');
    assert.ok(accessMap.A, 'A는 다음에 다시 본다');

    // 4) 정리 함수 자체도 안 올라간 사진은 지우지 않는다(이중 보호)
    idb.set('pA1', 'data:image/jpeg;base64,AAAA');
    await api.purgeBuildingIndexedDbAssets('A', { keepUnuploaded: true });
    assert.ok(idb.has('pA1'));
    // 건물 삭제 같은 다른 경로(옵션 없음)는 예전 그대로
    await api.purgeBuildingIndexedDbAssets('A');
    assert.ok(!idb.has('pA1'));

    // 5) 오프라인 준비한 건물은 정리 안 함
    const accessMap2 = { P: now - 50 * HOUR };
    env.window.BSA.offlinePrep.listStatuses = async () => [{ buildingId: 'P' }];
    env.window.state.defects.P_1F = [];
    idb.set('pP', 'data:x');
    const api2 = factory(...names.map((n) => (n === 'ensureBuildingAccessSeeded' ? () => accessMap2 : env[n])));
    r = await api2.pruneStaleIndexedDbInspectionData();
    assert.strictEqual(r.removedBuildings, 0, '오프라인 준비한 건물은 남김');
}

// --- 연결 순서 ---
{
    const onl = app.slice(app.indexOf("window.addEventListener('online', () => {"), app.indexOf("window.addEventListener('online', () => {") + 1200);
    assert.ok(!/pruneStaleIndexedDbInspectionData\(\)/.test(onl.slice(0, onl.indexOf('});'))), '연결 순간에는 정리하지 않는다');
    const ret = extractFunction(app, 'async function runOfflineReturnSync(');
    const fin = ret.slice(ret.lastIndexOf('} finally {'));
    assert.ok(/_offlineReturnRunning = false;[\s\S]*pruneStaleIndexedDbInspectionData\(\)/.test(fin), '올리기·확인·다시 받기 뒤에 정리');
    const prune = extractFunction(app, 'async function pruneStaleIndexedDbInspectionData(');
    assert.ok(prune.indexOf('pruneBlockReason') < prune.indexOf('_idbInspectionPruneInFlight = (async'), '먼저 막을지 본다');
    assert.ok(/purgeBuildingIndexedDbAssets\(id, \{ keepUnuploaded: true \}\)/.test(prune));
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(/js\/core\/cache-purge-guard\.js\?v=/.test(index));
}

scenario().then(() => console.log('test-cache-purge-guard: ok')).catch((e) => { console.error(e); process.exit(1); });
