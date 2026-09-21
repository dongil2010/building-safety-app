#!/usr/bin/env node
'use strict';

/**
 * 일괄 작업 전 자동 백업 (1단계: 조사표 가져오기).
 *
 * 2026-09-21 광주겨자씨교회: 가져오기(번호 병합)가 지하1층 주차장-1 NO.01~10의
 * 부재·조사내용을 '기타', 원인을 '건조수축'으로 덮어썼다. 서버에 이전 값이 없어
 * 동기화 안 된 기기를 비행기모드로 열어 되살려야 했다.
 *
 * 이 테스트는 그 사고를 재현한 뒤, 가져오기 직전 스냅샷으로 고른 행만
 * 되살리는지 본다. 사진 dataURL이 안 들어가고, 층당 5개만 남기는지도 같이 본다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const api = require(path.join(__dirname, '..', 'js', 'core', 'data-health.js'));

const BLDG = 'bldg-mustard-20260921';
const FLOOR = '지하1층 주차장-1';
const KEY = BLDG + '_' + FLOOR;
const SNAP_AT = 1_000_000;
const RESTORE_AT = 2_000_000;

function padNo(n) {
    return n < 10 ? 'NO.0' + n : 'NO.' + n;
}

function healthyDefect(n, extra) {
    const even = n % 2 === 0;
    return Object.assign({
        id: 'def-' + n,
        no: padNo(n),
        component: even ? '벽체' : '기둥',
        defectType: even ? '수직균열' : '박락',
        cause: even ? '건조수축' : '철근부식',
        size: even ? '' : '200x100',
        crackWidth: even ? '0.3' : '',
        crackLength: even ? '1.20' : '',
        location: FLOOR,
        x: 40 + n * 8,
        y: 80,
        targetX: 20 + n * 8,
        targetY: 110,
        updatedAt: 100,
        contentUpdatedAt: 100,
        positionUpdatedAt: 100,
        photoIds: ['ph-' + n],
        photos: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD'],
        photoUrls: ['https://example.invalid/photos/ph-' + n + '.jpg']
    }, extra || {});
}

function emptyFloorState(defects) {
    return {
        defects: defects.slice(),
        ndtData: [],
        ndtDisplacementGroups: [],
        deletedDefectIds: [],
        deletedDefectAt: {},
        deletedNdtIds: [],
        deletedNdtAt: {}
    };
}

function makeState(defects) {
    const st = {
        currentBuildingId: BLDG,
        defects: {},
        ndtData: {},
        ndtDisplacementGroups: {},
        deletedDefectIds: {},
        deletedDefectAt: {},
        deletedNdtIds: {},
        deletedNdtAt: {}
    };
    st.defects[KEY] = defects;
    return st;
}

function overwriteLikeImport(defects) {
    defects.forEach(function (d) {
        const n = Number(String(d.id).replace('def-', ''));
        if (n >= 1 && n <= 10) {
            d.component = '기타';
            d.defectType = '기타';
            d.cause = '건조수축';
            d.updatedAt = 500;
            d.contentUpdatedAt = 500;
        }
    });
}

async function testIncidentRestoreOnlyTouchedRows() {
    const original = [];
    for (let i = 1; i <= 10; i += 1) original.push(healthyDefect(i));
    original.push(healthyDefect(28));

    const state = makeState(original.map(function (d) { return Object.assign({}, d, { photos: d.photos.slice() }); }));
    const store = api.createMemorySnapshotStore();
    const saved = await api.saveSnapshotsWithStore(state, '조사표 가져오기', [KEY], store, SNAP_AT);
    assert.strictEqual(saved.length, 1, '가져오기 직전에 층 하나 저장');
    const snap = saved[0];
    assert.strictEqual(snap.opName, '조사표 가져오기');
    assert.strictEqual(snap.floorCode, FLOOR);
    assert.strictEqual(snap.defectCount, 11);

    overwriteLikeImport(state.defects[KEY]);
    const corrupted = state.defects[KEY].find((d) => d.id === 'def-1');
    assert.strictEqual(corrupted.component, '기타');
    assert.strictEqual(corrupted.defectType, '기타');

    const diff = api.compareDefects(snap.defects, state.defects[KEY]);
    assert.strictEqual(diff.changed.length, 10, '오늘 사고처럼 NO.01~10만 바뀐 행이어야 한다');
    assert.strictEqual(diff.unchanged.length, 1);
    assert.strictEqual(diff.unchanged[0].id, 'def-28');
    const selected = api.defaultSelectedIds(diff);
    assert.deepStrictEqual(selected.slice().sort(), [
        'def-1', 'def-2', 'def-3', 'def-4', 'def-5',
        'def-6', 'def-7', 'def-8', 'def-9', 'def-10'
    ].sort());
    assert.ok(selected.indexOf('def-28') < 0, 'NO.28은 기본 선택에 들어가면 안 된다');

    const slice = emptyFloorState(state.defects[KEY]);
    const result = api.applyRestoreToFloor(slice, snap, { ids: selected, now: RESTORE_AT });
    assert.strictEqual(result.restored.length, 10);

    const d1 = slice.defects.find((d) => d.id === 'def-1');
    assert.strictEqual(d1.component, '기둥', '홀수 번호는 원래 기둥이어야 한다');
    assert.strictEqual(d1.defectType, '박락');
    assert.strictEqual(d1.cause, '철근부식');
    assert.ok(d1.updatedAt > snap.createdAt, '되살린 updatedAt이 스냅샷보다 나중이어야 서버 값을 이긴다');
    assert.ok(d1.contentUpdatedAt > snap.createdAt, 'contentUpdatedAt을 안 찍으면 동기화가 망가진 값을 다시 가져온다');
    assert.ok(d1.positionUpdatedAt > snap.createdAt, '위치 시각도 지금으로 찍어야 한다');
    assert.strictEqual(d1.updatedAt, RESTORE_AT);
    assert.strictEqual(d1.contentUpdatedAt, RESTORE_AT);
    assert.strictEqual(d1.positionUpdatedAt, RESTORE_AT);

    const d28 = slice.defects.find((d) => d.id === 'def-28');
    assert.strictEqual(d28.component, '벽체');
    assert.strictEqual(d28.updatedAt, 100, '고르지 않은 번호는 건드리면 안 된다');
    assert.strictEqual(d28.contentUpdatedAt, 100);
}

async function testRestoringDeletedUntracksTombstone() {
    const state = makeState([healthyDefect(3), healthyDefect(4)]);
    const snap = api.buildFloorSnapshot(state, KEY, '조사표 가져오기', SNAP_AT);
    const slice = emptyFloorState([healthyDefect(4)]);
    slice.deletedDefectIds = ['def-3'];
    slice.deletedDefectAt = { 'def-3': 1500 };

    const result = api.applyRestoreToFloor(slice, snap, { ids: ['def-3'], now: RESTORE_AT });
    assert.strictEqual(result.restoredIds[0], 'def-3');
    assert.ok(slice.defects.some((d) => d.id === 'def-3'), '지워진 결함이 다시 들어와야 한다');
    assert.ok(slice.deletedDefectIds.indexOf('def-3') < 0, '묘비를 안 풀면 다음 동기화에서 다시 지워진다');
    assert.ok(!Object.prototype.hasOwnProperty.call(slice.deletedDefectAt, 'def-3'));
}

async function testNewDefectsAreKept() {
    const state = makeState([healthyDefect(1)]);
    const snap = api.buildFloorSnapshot(state, KEY, '조사표 가져오기', SNAP_AT);
    const slice = emptyFloorState([healthyDefect(1), healthyDefect(99)]);
    overwriteLikeImport(slice.defects);

    const diff = api.compareDefects(snap.defects, slice.defects);
    assert.strictEqual(diff.addedAfter.length, 1);
    assert.strictEqual(diff.addedAfter[0].id, 'def-99');
    const selected = api.defaultSelectedIds(diff);
    assert.ok(selected.indexOf('def-99') < 0, '새로 생긴 행은 기본 선택에서 빼야 한다');

    api.applyRestoreToFloor(slice, snap, { ids: selected, now: RESTORE_AT });
    assert.ok(slice.defects.some((d) => d.id === 'def-99'), '스냅샷 이후 새 결함은 지우면 안 된다');
    assert.strictEqual(slice.defects.length, 2);
}

async function testSnapshotDropsPhotoDataUrls() {
    const state = makeState([healthyDefect(1)]);
    const snap = api.buildFloorSnapshot(state, KEY, '조사표 가져오기', SNAP_AT);
    assert.strictEqual(api.hasDataUrlAnywhere(snap), false, '스냅샷에 dataURL이 남아 있으면 용량이 폭증한다');
    assert.deepStrictEqual(snap.defects[0].photoIds, ['ph-1']);
    assert.deepStrictEqual(snap.defects[0].photoUrls, ['https://example.invalid/photos/ph-1.jpg']);
    assert.ok(!snap.defects[0].photos || snap.defects[0].photos.length === 0,
        'photos dataURL은 빠져야 한다');
    const cloned = api.cloneWithoutDataUrls({
        photos: ['data:image/png;base64,xxxx', 'https://cdn.example/a.jpg'],
        nested: { dataUrl: 'data:image/jpeg;base64,yyyy', url: 'https://cdn.example/b.jpg' }
    });
    assert.deepStrictEqual(cloned.photos, ['https://cdn.example/a.jpg']);
    assert.strictEqual(cloned.nested.url, 'https://cdn.example/b.jpg');
    assert.ok(!Object.prototype.hasOwnProperty.call(cloned.nested, 'dataUrl')
        || cloned.nested.dataUrl === '');
}

async function testKeepsFivePerFloor() {
    const store = api.createMemorySnapshotStore();
    const state = makeState([healthyDefect(1)]);
    for (let i = 0; i < 7; i += 1) {
        await api.saveSnapshotsWithStore(state, '조사표 가져오기', [KEY], store, SNAP_AT + i * 10);
    }
    const kept = await store.listByFloor(KEY);
    assert.strictEqual(kept.length, 5, '층당 최근 5개만 남겨야 한다');
    const times = kept.map((s) => s.createdAt).sort(function (a, b) { return a - b; });
    assert.strictEqual(times[0], SNAP_AT + 20, '가장 오래된 2개는 삭제');
    assert.strictEqual(times[4], SNAP_AT + 60);

    const otherKey = BLDG + '_2F';
    state.defects[otherKey] = [healthyDefect(1)];
    await api.saveSnapshotsWithStore(state, '조사표 가져오기', [otherKey], store, SNAP_AT + 100);
    assert.strictEqual((await store.listByFloor(KEY)).length, 5, '다른 층 저장이 이 층 한도를 건드리면 안 된다');
    assert.strictEqual((await store.listByFloor(otherKey)).length, 1);
}

async function testNdtRestoreUntracksTombstone() {
    const state = makeState([healthyDefect(1)]);
    state.ndtData[KEY] = [{ id: 'ndt-1', category: '탄산화', updatedAt: 100 }];
    const snap = api.buildFloorSnapshot(state, KEY, '층 도면 삭제', SNAP_AT);
    const slice = emptyFloorState([healthyDefect(1)]);
    slice.deletedNdtIds = ['ndt-1'];
    slice.deletedNdtAt = { 'ndt-1': 1500 };

    api.applyRestoreToFloor(slice, snap, { ids: [], restoreNdt: true, now: RESTORE_AT });
    assert.ok(slice.ndtData.some((n) => n.id === 'ndt-1'));
    assert.ok(slice.deletedNdtIds.indexOf('ndt-1') < 0, '비파괴 묘비도 풀어야 한다');
    assert.ok(slice.ndtData[0].updatedAt > snap.createdAt);
}

function testSourceWiring() {
    const root = path.join(__dirname, '..');
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const stateJs = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');
    const health = fs.readFileSync(path.join(root, 'js', 'core', 'data-health.js'), 'utf8');
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

    assert.ok(/LOCAL_IMAGE_DB_VERSION\s*=\s*4/.test(stateJs),
        '기존 IndexedDB 버전을 올리면 옛 탭이 업그레이드를 막아 도면·사진 저장이 멈춘다');
    assert.ok(health.indexOf("building_safety_bulk_snapshots") >= 0,
        '스냅샷은 별도 DB 이름이어야 한다');
    assert.ok(app.indexOf('function untrackNdtDeletion') >= 0,
        '비파괴 묘비를 푸는 untrackNdtDeletion이 없다');
    assert.ok(app.indexOf('window.listBulkSnapshots') >= 0);
    assert.ok(app.indexOf('window.previewBulkSnapshot') >= 0);
    assert.ok(app.indexOf('window.restoreBulkSnapshot') >= 0);
    assert.ok(app.indexOf('window.captureBulkSnapshots') >= 0);

    const fnStart = app.indexOf('window.confirmImportDefectExcel');
    assert.ok(fnStart > 0, 'confirmImportDefectExcel을 찾지 못했다');
    const fn = app.slice(fnStart, fnStart + 20000);
    assert.ok(fn.indexOf('captureBulkSnapshots') >= 0,
        '가져오기 적용 직전에 captureBulkSnapshots를 호출해야 한다');
    assert.ok(fn.indexOf('조사표 가져오기') >= 0);
    const captureAt = fn.indexOf('captureBulkSnapshots');
    const mutateAt = fn.indexOf('pushDefectHistoryForKey(key)');
    assert.ok(captureAt >= 0 && mutateAt > captureAt,
        '스냅샷 저장이 결함 덮어쓰기보다 앞에 있어야 한다');

    const restoreStart = app.indexOf('window.restoreBulkSnapshot');
    const restoreFn = app.slice(restoreStart, restoreStart + 8000);
    assert.ok(restoreFn.indexOf('touchDefectUpdatedAt') >= 0,
        '되살린 결함은 touchDefectUpdatedAt으로 지금 시각을 찍어야 한다');
    assert.ok(restoreFn.indexOf('touchDefectPositionUpdatedAt') >= 0);
    assert.ok(restoreFn.indexOf('untrackDefectDeletion') >= 0,
        '지워진 결함을 되살릴 때 묘비를 풀지 않으면 동기화가 다시 지운다');
    assert.ok(restoreFn.indexOf('markFloorKeyDirty') >= 0);
    assert.ok(restoreFn.indexOf('saveStateToLocalStorage') >= 0);
    assert.ok(restoreFn.indexOf("captureBulkSnapshots('되살리기'") >= 0
        || restoreFn.indexOf('captureBulkSnapshots("되살리기"') >= 0
        || restoreFn.indexOf('captureBulkSnapshots(`되살리기`') >= 0,
        '되살리기 직전에도 스냅샷을 남겨야 되살리기를 되돌릴 수 있다');

    assert.ok(app.indexOf('btnRestoreBulkSnapshot') >= 0
        || app.indexOf('가져오기 전으로 되살리기') >= 0,
        '조사표에 되살리기 버튼이 없다');
    assert.ok(index.indexOf('js/core/data-health.js') >= 0);
}

function testIndexHtmlUntouched() {
    const st = spawnSync('git', ['diff', '--name-only', '--', 'index.html'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8'
    });
    const names = (st.stdout || '').trim();
    assert.strictEqual(names, '', 'index.html을 바꾸면 test-survey-round-delete가 실패한다: ' + names);
}

async function main() {
    await testIncidentRestoreOnlyTouchedRows();
    await testRestoringDeletedUntracksTombstone();
    await testNewDefectsAreKept();
    await testSnapshotDropsPhotoDataUrls();
    await testKeepsFivePerFloor();
    await testNdtRestoreUntracksTombstone();
    testSourceWiring();
    testIndexHtmlUntouched();
    console.log('OK test-bulk-snapshot.js');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
