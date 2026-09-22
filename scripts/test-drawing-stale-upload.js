#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 GPT 감사 2번 — 옛 기기가 클라우드의 새 도면을 덮어쓰던 문제의 회귀 테스트.
 *  - 현장 앱은 "올린 층 목록"이 매번 빈 채로 시작해, 켤 때마다 기기의 모든 층 도면을 다시 올렸다
 *    (다른 기기가 교체한 새 도면을 옛 도면으로 덮음)
 *  - 이제 동기화는 "올려야 함" 표시가 있는 층과 클라우드에 도면이 없는 층만 올리고,
 *    표시가 있어도 클라우드 도면이 더 나중이면 올리지 않는다
 * app.js의 실제 함수를 잘라 가짜 클라우드·localStorage로 실행한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
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

const SOURCES = [
    'function getCloudSyncedStorageKey(',
    'function initCloudSyncedKeySet(',
    'function ensureCloudSyncedDrawingKeys(',
    'function readPendingDrawingUploads(',
    'function writePendingDrawingUploads(',
    'function markPendingDrawingUpload(',
    'function clearPendingDrawingUpload(',
    'async function readCloudFloorDrawingState(',
    'async function uploadFloorDrawing(',
    'async function uploadFloorDrawingsForSync('
].map(extractFunction).join('\n\n');

const OLD = 'data:image/jpeg;base64,' + 'O'.repeat(3000);
const NEW = 'data:image/jpeg;base64,' + 'N'.repeat(3000);

/** 기기 하나 + 공유 클라우드 */
function makeDevice(cloud, opts) {
    opts = opts || {};
    const store = new Map();
    const uploads = [];
    let clock = opts.clock || 1000;
    const sandbox = {
        console: { warn() {}, log() {} },
        Date: { now: () => clock },
        JSON, Number, Object, Array, Set, String, Math,
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); }
        },
        window: { state: { companyId: 'co1' }, _cloudSyncedDrawingKeys: null },
        getCompanyDocId: () => 'co1',
        scheduleSaveCloudSyncedKeys() {
            store.set('bsa_cloud_synced_drawings_co1', JSON.stringify(Array.from(sandbox.window._cloudSyncedDrawingKeys)));
        },
        isPdfDrawingUrl: (u) => String(u).startsWith('data:application/pdf'),
        isUsableRasterDrawingUrl: (u) => typeof u === 'string' && u.startsWith('data:image/') && u.length >= 2000,
        hasFirebaseStorageMeta: (d) => !!(d && d.storagePath),
        snapNeedsSiteRoundMove: (d) => !!(d && d.legacyPath),
        isDeletedDrawingFloor: (b, fc) => !!(b.deleted && b.deleted[fc]),
        collectKnownFloorCodesForBuilding: (b) => Object.keys(b.floorDrawings || {}),
        idbGet: async () => null,
        db: {
            collection: () => ({
                doc: () => ({
                    collection: () => ({
                        doc: (id) => ({
                            get: async () => {
                                if (cloud.failReads) throw new Error('offline');
                                const d = cloud.docs[id];
                                return { exists: !!d, data: () => d && Object.assign({}, d.data, { updatedAt: { toMillis: () => d.at } }) };
                            }
                        })
                    })
                })
            })
        },
        // 실제 업로드: 클라우드 문서를 바꾸고 서버 시각을 찍는다
        async uploadFloorDrawingNow(buildingId, floorCode, dataUrl) {
            if (cloud.failUploads) return false;
            const id = `${buildingId}_${floorCode}`;
            cloud.serverClock += 1;
            cloud.docs[id] = { data: { storagePath: 'p/' + id, content: dataUrl }, at: cloud.serverClock };
            sandbox.api.ensureCloudSyncedDrawingKeys().add(id);
            uploads.push(id);
            return true;
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(SOURCES + '\nthis.api = { uploadFloorDrawing, uploadFloorDrawingsForSync, readPendingDrawingUploads, ensureCloudSyncedDrawingKeys };', sandbox);
    return {
        api: sandbox.api,
        uploads,
        setClock(v) { clock = v; },
        restart() { sandbox.window._cloudSyncedDrawingKeys = null; uploads.length = 0; },
        // PC에서는 고해상도 도면 단계가 클라우드에 도면이 있는 층을 먼저 '올린 층' 목록에 넣는다
        seedSynced(ids) { store.set('bsa_cloud_synced_drawings_co1', JSON.stringify(ids)); }
    };
}

function building(drawing) {
    return { id: 'b1', floorDrawings: { '3F': drawing } };
}

async function testFieldAppDoesNotOverwriteNewerDrawing() {
    // PC가 3층 도면을 교체해 클라우드에는 새 도면, 태블릿 기기에는 옛 도면
    const cloud = { docs: {}, serverClock: 5000 };
    cloud.docs['b1_3F'] = { data: { storagePath: 'p/b1_3F', content: NEW }, at: 5000 };
    const tablet = makeDevice(cloud);
    // 앱을 새로 켠 첫 동기화 (올린 층 목록이 비어 있음)
    await tablet.api.uploadFloorDrawingsForSync([building(OLD)]);
    assert.deepStrictEqual(tablet.uploads, [], '태블릿이 켤 때 옛 도면을 다시 올리면 안 된다');
    assert.strictEqual(cloud.docs['b1_3F'].data.content, NEW, '클라우드 새 도면이 그대로여야 한다');
    // 다시 켜도 마찬가지이고, 이미 확인한 층은 클라우드를 다시 조회하지 않는다
    tablet.restart();
    cloud.failReads = true;
    await tablet.api.uploadFloorDrawingsForSync([building(OLD)]);
    assert.deepStrictEqual(tablet.uploads, [], '재시작 후에도 옛 도면을 올리면 안 된다');
}

async function testMissingCloudDrawingIsHealed() {
    const cloud = { docs: {}, serverClock: 100 };
    const dev = makeDevice(cloud);
    await dev.api.uploadFloorDrawingsForSync([building(OLD)]);
    assert.deepStrictEqual(dev.uploads, ['b1_3F'], '클라우드에 도면이 없으면 올려서 채워야 한다');
}

async function testUnknownCloudStateDoesNotUpload() {
    const cloud = { docs: {}, serverClock: 100, failReads: true };
    const dev = makeDevice(cloud);
    await dev.api.uploadFloorDrawingsForSync([building(OLD)]);
    assert.deepStrictEqual(dev.uploads, [], '클라우드 상태를 모르면 올리지 않는다');
}

async function testOfflineReplacementUploadsLater() {
    // 이 기기에서 도면을 교체했는데 오프라인이라 실패 → 다음 동기화가 올린다
    const cloud = { docs: {}, serverClock: 5000 };
    cloud.docs['b1_3F'] = { data: { storagePath: 'p/b1_3F', content: OLD }, at: 5000 };
    const pc = makeDevice(cloud, { clock: 6000 });
    cloud.failUploads = true;
    const ok = await pc.api.uploadFloorDrawing('b1', '3F', NEW);
    assert.strictEqual(ok, false);
    assert.strictEqual(pc.api.readPendingDrawingUploads()['b1_3F'], 6000, '실패하면 "올려야 함" 표시가 남아야 한다');
    cloud.failUploads = false;
    pc.restart();
    pc.seedSynced(['b1_3F']);
    await pc.api.uploadFloorDrawingsForSync([building(NEW)]);
    assert.deepStrictEqual(pc.uploads, ['b1_3F'], '표시가 있는 도면은 클라우드에 옛 도면이 있어도 올려야 한다');
    assert.strictEqual(cloud.docs['b1_3F'].data.content, NEW);
    assert.strictEqual(pc.api.readPendingDrawingUploads()['b1_3F'], undefined, '올린 뒤에는 표시를 지운다');
}

async function testPendingOlderThanCloudIsDropped() {
    // A가 오프라인에서 교체(6000) → B가 그보다 나중에 교체(7000) → A가 온라인이 돼도 B 것을 덮지 않는다
    const cloud = { docs: {}, serverClock: 7000 };
    cloud.docs['b1_3F'] = { data: { storagePath: 'p/b1_3F', content: NEW }, at: 7000 };
    const a = makeDevice(cloud, { clock: 6000 });
    cloud.failUploads = true;
    await a.api.uploadFloorDrawing('b1', '3F', OLD);
    cloud.failUploads = false;
    await a.api.uploadFloorDrawingsForSync([building(OLD)]);
    assert.deepStrictEqual(a.uploads, [], '더 나중에 올라간 클라우드 도면을 덮으면 안 된다');
    assert.strictEqual(cloud.docs['b1_3F'].data.content, NEW);
    assert.strictEqual(a.api.readPendingDrawingUploads()['b1_3F'], undefined, '옛 표시는 정리한다');
}

async function testSuccessfulUploadClearsPending() {
    const cloud = { docs: {}, serverClock: 100 };
    const dev = makeDevice(cloud, { clock: 500 });
    assert.strictEqual(await dev.api.uploadFloorDrawing('b1', '3F', NEW), true);
    assert.deepStrictEqual(dev.api.readPendingDrawingUploads(), {}, '바로 올라가면 표시가 남지 않는다');
}

async function testDeletedFloorClearsPendingAndSkips() {
    const cloud = { docs: {}, serverClock: 100 };
    const dev = makeDevice(cloud, { clock: 500 });
    cloud.failUploads = true;
    await dev.api.uploadFloorDrawing('b1', '3F', NEW);
    cloud.failUploads = false;
    const b = building(NEW);
    b.deleted = { '3F': true };
    await dev.api.uploadFloorDrawingsForSync([b]);
    assert.deepStrictEqual(dev.uploads, [], '지운 층은 올리지 않는다');
    assert.deepStrictEqual(dev.api.readPendingDrawingUploads(), {}, '지운 층의 표시는 지운다');
}

function testCallSites() {
    const sync = extractFunction('async function uploadFloorDrawingsForSync(');
    assert.ok(!/new Set\(\)/.test(sync), '동기화는 빈 목록이 아니라 기기에 저장된 목록으로 시작해야 한다');
    assert.ok(!/_cloudSyncedDrawingKeys = new Set\(\)/.test(app), '도면 목록을 빈 Set으로 새로 만들면 저장된 목록을 덮는다');
    const tiers = extractFunction('async function ensureRasterTiersForSync(');
    assert.ok(/uploadFloorDrawing\([^;]*\{ fromSync: true \}\)/.test(tiers), '동기화가 대신 올리는 도면은 fromSync여야 한다');
    const del = app.slice(app.indexOf('_sessionDeletingDrawingFloors.delete(floorKey);') - 200,
        app.indexOf('_sessionDeletingDrawingFloors.delete(floorKey);') + 200);
    assert.ok(/clearPendingDrawingUpload\(floorKey\)/.test(del), '층 삭제 때 "올려야 함" 표시를 지워야 한다');
}

(async () => {
    const tests = [
        testFieldAppDoesNotOverwriteNewerDrawing,
        testMissingCloudDrawingIsHealed,
        testUnknownCloudStateDoesNotUpload,
        testOfflineReplacementUploadsLater,
        testPendingOlderThanCloudIsDropped,
        testSuccessfulUploadClearsPending,
        testDeletedFloorClearsPendingAndSkips,
        testCallSites
    ];
    for (const t of tests) {
        await t();
        console.log('ok -', t.name);
    }
    console.log('test-drawing-stale-upload: ' + tests.length + ' ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
