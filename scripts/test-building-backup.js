#!/usr/bin/env node
'use strict';

/**
 * 건물 백업(체크포인트) — 2026-09-27.
 * 작업 중간에 건물 전체를 서버에 저장해 두고, 나중에 그 시점으로 골라서 되돌린다. 사진 포함.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const health = require(path.join(__dirname, '..', 'js', 'core', 'data-health.js'));
const merge = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

function fnBody(header, span) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    return app.slice(at, at + (span || 3000));
}

// --- 사진 문서 id: 목록 + 목록이 없는 옛 데이터는 자리 번호 ---
(function photoDocIds() {
    assert.deepStrictEqual(
        health.defectPhotoDocIds({ id: 'D', photoIds: ['D_ua', 'D_ub'], prevRoundPhotoIds: ['D_prev_uc'] }),
        ['D_ua', 'D_ub', 'D_prev_uc']);
    assert.deepStrictEqual(health.defectPhotoDocIds({ id: 'D', photos: ['x', 'y'] }), ['D_0', 'D_1']);
    assert.deepStrictEqual(health.defectPhotoDocIds({ id: 'D', photoIds: ['D_ua'], photos: ['x', 'y'] }), ['D_ua', 'D_1']);
})();

// --- 백업 본문: 층별 스냅샷 + 백업이 쓰는 사진(결함 + 측정지) ---
(function buildBackup() {
    const bundles = [
        { floorCode: 'B1', bundle: {
            markings: { items: [{ id: 'd1', no: 'NO.01', component: '보', photoIds: ['d1_ua'] }], deletedIds: ['old'], deletedAt: { old: 5 } },
            ndt: { items: [{ id: 'ndt_1', strengthSlots: [{ photoId: 'p9' }] }], displacementGroups: [{ id: 'g1' }] }
        } },
        { floorCode: '1F', bundle: { markings: { items: [{ id: 'd2', photos: ['data:x'] }] }, ndt: {} } }
    ];
    const b = health.buildBuildingBackup('bldg', bundles, 1000);
    assert.deepStrictEqual(b.floorCodes, ['B1', '1F']);
    assert.strictEqual(b.defectCount, 2);
    assert.strictEqual(b.ndtCount, 2);
    assert.deepStrictEqual(b.photoIds.sort(), ['d1_ua', 'd2_0', 'str_bldg_p9'].sort(),
        '백업이 쓰는 사진을 빠뜨리면 그 사진이 클라우드에서 지워져 되살릴 수 없다');
    const f = b.payload.floors[0];
    assert.strictEqual(f.floorKey, 'bldg_B1');
    assert.strictEqual(f.floorCode, 'B1');
    assert.deepStrictEqual(f.deletedDefectIds, ['old']);
    assert.ok(!JSON.stringify(b.payload).includes('data:x'), '사진 원본(dataURL)은 백업 본문에 넣지 않는다');
})();

// --- 비교: 사진만 바뀐 결함도 "바뀜", 비파괴는 시각 말고 값이 다를 때만 ---
(function planRestore() {
    const backupFloor = {
        floorCode: 'B1', floorKey: 'bldg_B1',
        defects: [
            { id: 'a', component: '보', photoIds: ['a_u1', 'a_u2'] },
            { id: 'b', component: '기둥' },
            { id: 'c', component: '벽' }
        ],
        ndtData: [{ id: 'n1', avgValue: '32', updatedAt: 1 }, { id: 'n2', avgValue: '30', updatedAt: 1 }],
        ndtDisplacementGroups: []
    };
    const current = {
        markings: { items: [
            { id: 'a', component: '보', photoIds: ['a_u1'] },    // 사진 하나 지움
            { id: 'c', component: '벽' },                          // 그대로
            { id: 'z', component: '새 결함' }                      // 이후 추가
        ] },
        ndt: { items: [{ id: 'n1', avgValue: '32', updatedAt: 99 }, { id: 'n2', avgValue: '', updatedAt: 99 }] }
    };
    const plan = health.planFloorRestore(backupFloor, current);
    assert.deepStrictEqual(plan.defectIds.sort(), ['a', 'b'], '사진만 지운 결함(a)과 지워진 결함(b)을 되돌릴 대상으로');
    assert.deepStrictEqual(plan.diff.addedAfter.map((r) => r.id), ['z']);
    assert.deepStrictEqual(plan.ndtIds, ['n2'], '시각만 다른 비파괴(n1)는 건드리지 않는다');
})();

// --- 되돌린 결함은 사진 목록까지 이긴다 (photosUpdatedAt을 안 찍으면 서버의 목록이 이김) ---
(function restoredPhotosWinMerge() {
    const snap = { defects: [{ id: 'a', component: '보', photoIds: ['a_u1', 'a_u2'], contentUpdatedAt: 10, photosUpdatedAt: 10 }] };
    const slice = { defects: [{ id: 'a', component: '보', photoIds: ['a_u1'], contentUpdatedAt: 50, photosUpdatedAt: 50 }] };
    health.applyRestoreToFloor(slice, snap, { ids: ['a'], now: 100 });
    const restored = slice.defects[0];
    assert.strictEqual(restored.photosUpdatedAt, 100);
    const server = { id: 'a', component: '보', photoIds: ['a_u1'], contentUpdatedAt: 50, updatedAt: 50, photosUpdatedAt: 50 };
    const merged = merge.mergeDefectRecord(server, restored, {});
    assert.deepStrictEqual(merged.photoIds, ['a_u1', 'a_u2'], '되살린 사진 목록이 동기화에서 이겨야 한다');
})();

// --- 백업이 쓰는 사진은 클라우드에서 지우지 않는다 ---
(function deleteGuard() {
    const del = fnBody('async function deleteCloudPhoto(', 1200);
    const guard = del.indexOf('await isPhotoKeptByBuildingBackup(photoId)');
    const destroy = del.indexOf('deleteCloudAssetDoc(');
    assert.ok(guard > 0 && destroy > guard, 'deleteCloudPhoto가 백업 사진인지 확인하기 전에 지운다');
    const kept = fnBody('async function isPhotoKeptByBuildingBackup(', 900);
    assert.ok(/source: 'server'/.test(kept), '다른 기기가 만든 백업도 봐야 한다 — 기기 캐시로 판단하면 안 된다');
    assert.ok(/catch \(e\)[\s\S]*return true;/.test(kept), '확인을 못 하면 지우지 않아야 한다');
})();

// --- 건물 영구 삭제는 백업을 먼저 지운다 (남아 있으면 사진이 영영 안 지워짐) ---
(function permanentDeleteOrder() {
    const fn = fnBody('window.permanentlyDeleteBuilding = async function', 2000);
    const backups = fn.indexOf('await deleteAllBuildingBackups(bldg.id)');
    const photos = fn.indexOf('deleteAllPhotosForDefect(d)');
    assert.ok(backups > 0 && photos > backups);
})();

// --- 백업은 서버에서 읽는다 (기기 state는 안 연 층이 옛 데이터일 수 있다) ---
(function backupReadsServer() {
    const create = fnBody('async function createBuildingBackup(', 1600);
    assert.ok(create.indexOf('await flushBuildingEditsToServer(bldg)') > 0, '안 올라간 수정을 먼저 올려야 한다');
    assert.ok(create.indexOf('readBuildingBundlesFromServer(bldg)') > 0);
    assert.ok(create.indexOf('writeChunkedPdfToDocRef(') < create.indexOf('await ref.set('),
        '본문을 먼저 써야 목록에 보이는 백업이 항상 본문을 가진다');
    const strict = fnBody('async function readFloorBundleStrict(', 900);
    assert.ok(/source: 'server'/.test(strict) && /throw new Error/.test(strict), '읽기 실패를 빈 층으로 저장하면 안 된다');
    const restore = fnBody('async function restoreBuildingBackup(', 800);
    assert.ok(restore.indexOf("createBuildingBackup(bldg, '되살리기 직전 자동 백업')") > 0, '되살리기도 되돌릴 수 있어야 한다');
})();

// --- 보안 규칙: 회사 직원만 ---
(function rulesCoverCheckpoints() {
    const at = rules.indexOf('match /buildingCheckpoints/{checkpointId}');
    assert.ok(at > 0, 'buildingCheckpoints 규칙이 없으면 기본 차단에 걸려 백업이 안 된다');
    const block = rules.slice(at, at + 600);
    assert.ok(/match \/data\/\{docId\}/.test(block) && /match \/parts\/\{partId\}/.test(block));
    assert.ok(!/if true/.test(block), '백업은 회사 직원만 읽고 써야 한다');
    (block.match(/allow [^;]+;/g) || []).forEach((line) => {
        assert.ok(/isCompanyMember\(companyId\)/.test(line), '규칙이 회사 직원 확인 없이 열려 있다: ' + line);
    });
})();

console.log('test-building-backup: ok');
