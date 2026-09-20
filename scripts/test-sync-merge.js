#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

/**
 * 외부(EXT) 결함을 남측(EXT_S) 도면으로 '옮긴' 경우.
 *
 * 병합 규칙상 서버에만 있고 로컬에 없는 결함은 묘비가 없으면 복원된다.
 * 그래서 옮기기만 하고 원래 층에 묘비를 안 남기면 서버의 원본이 되살아나
 * 같은 결함이 두 층에 동시에 존재한다. 외부는 조사표를 하나로 합치므로
 * 표에 같은 결함이 두 번 나온다. (2026-09-20 현장 보고)
 */
function testMovedExteriorDefectDoesNotComeBack() {
    const EXT = 'bldg_EXT';
    const EXT_S = 'bldg_EXT_S';
    const rec = { id: 'pin-7', no: '7', contentUpdatedAt: 100 };

    // 서버는 아직 옮기기 전 상태 (EXT에 원본이 있다)
    const server = { [EXT]: [rec], [EXT_S]: [] };
    // 로컬은 옮긴 뒤 (EXT는 비었고 EXT_S에 있다)
    const local = { [EXT]: [], [EXT_S]: [Object.assign({}, rec, { contentUpdatedAt: 300 })] };

    // 묘비 없이 병합하면 EXT에 되살아난다 — 이게 현장에서 본 증상이다
    const without = api.mergeDefectsMaps(server, local, {}, {}, {}, {});
    assert.strictEqual(without.defects[EXT].length, 1,
        '묘비가 없으면 서버 원본이 복원된다 (이 규칙이 바뀌면 전제를 다시 볼 것)');

    // 옮길 때 원래 층에 묘비를 남기면 되살아나지 않는다
    const withTomb = api.mergeDefectsMaps(
        server, local,
        {}, { [EXT]: ['pin-7'] },
        {}, { [EXT]: { 'pin-7': 200 } }
    );
    assert.strictEqual(withTomb.defects[EXT].length, 0,
        '옮긴 결함이 원래 층에 되살아났다 — 외부 조사표에 중복으로 나온다');
    assert.strictEqual(withTomb.defects[EXT_S].length, 1,
        '옮겨간 층의 결함까지 지우면 안 된다');
}

/** 되돌려 찍는 경우: 도착 층 묘비를 풀고 내용 시각을 올리면 살아남아야 한다 */
function testMoveBackSurvivesOldTombstone() {
    const EXT = 'bldg_EXT';
    const rec = { id: 'pin-7', contentUpdatedAt: 500 };
    const merged = api.mergeDefectsMaps(
        { [EXT]: [] }, { [EXT]: [rec] },
        { [EXT]: ['pin-7'] }, {},
        { [EXT]: { 'pin-7': 200 } }, {}
    );
    assert.strictEqual(merged.defects[EXT].length, 1,
        '되돌려 찍은 결함이 옛 묘비 때문에 사라졌다');
}

/** app.js의 이동 지점이 묘비를 남기는지 (빠뜨리면 증상이 그대로 재발한다) */
function testAppJsMoveWritesTombstone() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const idx = app.indexOf('state.defects[srcKey].splice(idx, 1);');
    assert.ok(idx > 0, '결함 이동 지점을 찾지 못했다');
    const block = app.slice(idx, idx + 1200);
    assert.ok(block.indexOf('trackDefectDeletion(srcKey') >= 0,
        '다른 층으로 옮길 때 원래 층에 묘비를 안 남긴다 — 서버 원본이 되살아난다');
    assert.ok(block.indexOf('untrackDefectDeletion(destKey') >= 0,
        '도착 층의 옛 묘비를 풀지 않는다 — 되돌려 찍으면 결함이 사라진다');
    assert.ok(block.indexOf('markFloorKeyDirty(srcKey)') >= 0,
        '원래 층을 dirty로 표시하지 않으면 묘비가 서버에 올라가지 않는다');
}

function testOldTombstoneNeverRevives() {
    const rec = { id: 'pin-1', contentUpdatedAt: 9999 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 0, 'pin'), false);
}

function testPositionOnlyDoesNotRevive() {
    const rec = { id: 'pin-1', contentUpdatedAt: 100, positionUpdatedAt: 500 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 200, 'pin'), false);
}

function testLaterContentRevivesDefect() {
    const rec = { id: 'pin-1', contentUpdatedAt: 500 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 200, 'pin'), true);
}

function testDeletedNdtStaysDeleted() {
    const floor = 'bldg_1F';
    const item = { id: 'ndt_100', value: 10, updatedAt: 100 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [] },
        { [floor]: ['ndt_100'] },
        {},
        { [floor]: { ndt_100: 200 } },
        {}
    );
    assert.strictEqual((result.ndtData[floor] || []).length, 0);
    assert.ok((result.deletedNdtIds[floor] || []).includes('ndt_100'));
}

function testLaterNdtEditRevives() {
    const floor = 'bldg_1F';
    const item = { id: 'ndt_100', value: 12, updatedAt: 300 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [item] },
        { [floor]: ['ndt_100'] },
        {},
        { [floor]: { ndt_100: 200 } },
        {}
    );
    assert.strictEqual(result.ndtData[floor].length, 1);
    assert.strictEqual(result.ndtData[floor][0].value, 12);
    assert.ok(!result.deletedNdtIds[floor]);
}

function testDisplacementDeleteUsesSameMerge() {
    const floor = 'bldg_1F';
    const item = { id: 'ndtg_50', points: [{ x: 1 }], updatedAt: 10 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [] },
        { [floor]: ['ndtg_50'] },
        { [floor]: ['ndtg_50'] },
        { [floor]: { ndtg_50: 20 } },
        { [floor]: { ndtg_50: 20 } }
    );
    assert.strictEqual((result.ndtData[floor] || []).length, 0);
}

function testTwoDeviceDefectKeepsNewerContentAndOtherPhotos() {
    const server = {
        id: 'pin-1',
        status: '관찰',
        width: '0.3',
        contentUpdatedAt: 100,
        photoIds: ['pin-1_0']
    };
    const local = {
        id: 'pin-1',
        status: '진행',
        width: '0.3',
        contentUpdatedAt: 200,
        photoIds: ['pin-1_0', 'pin-1_1']
    };
    const merged = api.mergeDefectRecord(server, local, {});
    assert.strictEqual(merged.status, '진행');
    assert.deepStrictEqual(merged.photoIds, ['pin-1_0', 'pin-1_1']);
}

function testLocalOnlyDefectAppended() {
    const floor = 'bldg_1F';
    const result = api.mergeDefectsMaps(
        { [floor]: [{ id: 'pin-1', no: '1', contentUpdatedAt: 1 }] },
        { [floor]: [
            { id: 'pin-1', no: '1', contentUpdatedAt: 1 },
            { id: 'pin-2', no: '2', contentUpdatedAt: 2 }
        ] },
        {},
        {},
        {},
        {}
    );
    const ids = result.defects[floor].map((d) => d.id);
    assert.deepStrictEqual(ids, ['pin-1', 'pin-2']);
}

function testDeletedDefectStaysOut() {
    const floor = 'bldg_1F';
    const rec = { id: 'pin-9', contentUpdatedAt: 50 };
    const result = api.mergeDefectsMaps(
        { [floor]: [rec] },
        { [floor]: [] },
        { [floor]: ['pin-9'] },
        {},
        { [floor]: { 'pin-9': 80 } },
        {}
    );
    assert.strictEqual((result.defects[floor] || []).length, 0);
    assert.ok((result.deletedDefectIds[floor] || []).includes('pin-9'));
}

function testAppJsDelegatesMerge() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /js\/core\/sync-merge\.js/);
    assert.match(app, /BSA\.syncMerge\.mergeDefectsMaps/);
    assert.match(app, /BSA\.syncMerge\.mergeNdtDataMaps/);
    assert.doesNotMatch(app, /function recordSurvivesDelete\(rec, deletedAt, kind\) \{\s*if \(!rec \|\| !rec\.id\) return false;/);
}

testOldTombstoneNeverRevives();
testPositionOnlyDoesNotRevive();
testLaterContentRevivesDefect();
testDeletedNdtStaysDeleted();
testLaterNdtEditRevives();
testDisplacementDeleteUsesSameMerge();
testTwoDeviceDefectKeepsNewerContentAndOtherPhotos();
testLocalOnlyDefectAppended();
testDeletedDefectStaysOut();
testAppJsDelegatesMerge();
testMovedExteriorDefectDoesNotComeBack();
testMoveBackSurvivesOldTombstone();
testAppJsMoveWritesTombstone();
console.log('test-sync-merge: ok');
