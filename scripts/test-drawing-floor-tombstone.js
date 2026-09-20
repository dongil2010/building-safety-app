#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'drawing-floor-tombstone.js'));

function testRememberAndStrip() {
    const session = new Set();
    const bldg = {
        id: 'bldg-1',
        floorsList: [
            { floorCode: '1F', floorLabel: '1층' },
            { floorCode: '2F', floorLabel: '2층' }
        ],
        drawingFloorCodes: ['1F', '2F'],
        floorDrawings: { '1F': 'data:1', '2F': 'data:2' },
        floorDrawingPdfs: { '1F': 'pdf-1' },
        floorDrawingTiers: { '1F': { '4000': 't' } },
        floorDrawingSources: { '1F': 'src' }
    };
    api.rememberDeletedDrawingFloor(bldg, '1F', session);
    api.stripDeletedDrawingFloorsFromBuilding(bldg, session);
    assert.deepStrictEqual(bldg.drawingFloorCodes, ['2F']);
    assert.deepStrictEqual(bldg.floorsList.map((f) => f.floorCode), ['2F']);
    assert.strictEqual(bldg.floorDrawings['1F'], undefined);
    assert.strictEqual(bldg.floorDrawings['2F'], 'data:2');
    assert.strictEqual(bldg.floorDrawingPdfs['1F'], undefined);
    assert.ok(session.has('bldg-1_1F'));
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '1F', session), true);
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), false);
}

function testMergeKeepsLocalTombstoneAgainstRemoteRevival() {
    const session = new Set(['bldg-1_1F']);
    const remote = {
        id: 'bldg-1',
        floorsList: [
            { floorCode: '1F', floorLabel: '1층' },
            { floorCode: '2F', floorLabel: '2층' }
        ],
        drawingFloorCodes: ['1F', '2F'],
        floorDrawings: { '1F': 'revived' }
    };
    const local = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['1F'],
        floorsList: [{ floorCode: '2F', floorLabel: '2층' }],
        drawingFloorCodes: ['2F'],
        floorDrawings: {}
    };
    remote.deletedDrawingFloorCodes = api.mergeDeletedDrawingFloorCodes(
        local.deletedDrawingFloorCodes,
        remote.deletedDrawingFloorCodes
    );
    remote.floorDrawings = { ...remote.floorDrawings, ...local.floorDrawings };
    api.stripDeletedDrawingFloorsFromBuilding(remote, session);
    assert.ok(!remote.floorDrawings['1F']);
    assert.deepStrictEqual(remote.drawingFloorCodes, ['2F']);
    assert.deepStrictEqual(remote.deletedDrawingFloorCodes, ['1F']);
}

function testForgetAllowsReupload() {
    const session = new Set();
    const bldg = { id: 'bldg-1', deletedDrawingFloorCodes: ['3F'] };
    api.rememberDeletedDrawingFloor(bldg, '3F', session);
    api.forgetDeletedDrawingFloor(bldg, '3F', session);
    assert.deepStrictEqual(bldg.deletedDrawingFloorCodes, []);
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '3F', session), false);
}

function testEvidenceClearsFalseTombstoneAndSession() {
    const session = new Set();
    const bldg = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['1F', '2F', 'ROOF'],
        floorsList: [{ floorCode: 'EXT', floorLabel: '외부' }],
        drawingFloorCodes: ['EXT'],
        floorDrawings: {}
    };
    session.add('bldg-1_1F');
    session.add('bldg-1_2F');
    const n = api.forgetTombstonesWithDrawingEvidence(bldg, session, ['1F', '2F']);
    assert.strictEqual(n, 2);
    assert.deepStrictEqual(bldg.deletedDrawingFloorCodes, ['ROOF']);
    assert.strictEqual(session.has('bldg-1_1F'), false);
    assert.strictEqual(session.has('bldg-1_2F'), false);
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '1F', session), false);
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, 'ROOF', session), true);
}


function testRemoteMetaClearsStaleLocalTombstone() {
    const session = new Set(['bldg-1_1F', 'bldg-1_2F', 'bldg-1_3F']);
    const local = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['1F', '2F', '3F', 'ROOF'],
        floorsList: [
            { floorCode: 'EXT', floorLabel: '외부' },
            { floorCode: '부대시설', floorLabel: '부대시설' }
        ],
        drawingFloorCodes: ['EXT', '부대시설']
    };
    const remote = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['ROOF'],
        floorsList: [
            { floorCode: 'EXT', floorLabel: '외부' },
            { floorCode: '부대시설', floorLabel: '부대시설' },
            { floorCode: '1F', floorLabel: '1층' },
            { floorCode: '2F', floorLabel: '2층' },
            { floorCode: '3F', floorLabel: '3층' }
        ],
        drawingFloorCodes: ['EXT', '부대시설', '1F', '2F', '3F']
    };
    // union like merge
    local.deletedDrawingFloorCodes = api.mergeDeletedDrawingFloorCodes(
        local.deletedDrawingFloorCodes,
        remote.deletedDrawingFloorCodes
    );
    assert.deepStrictEqual(
        local.deletedDrawingFloorCodes.slice().sort(),
        ['1F', '2F', '3F', 'ROOF'].sort()
    );
    const n = api.forgetTombstonesClearedByRemoteMeta(local, session, remote);
    assert.strictEqual(n, 3);
    assert.deepStrictEqual(local.deletedDrawingFloorCodes, ['ROOF']);
    assert.strictEqual(session.has('bldg-1_1F'), false);
    assert.strictEqual(session.has('bldg-1_ROOF'), false);
    assert.strictEqual(api.isDeletedDrawingFloor(local, '1F', session), false);
    assert.strictEqual(api.isDeletedDrawingFloor(local, 'ROOF', session), true);
    // strip must keep remotely-alive floors when applied to a merged floorsList
    local.floorsList = remote.floorsList.slice();
    local.drawingFloorCodes = remote.drawingFloorCodes.slice();
    api.stripDeletedDrawingFloorsFromBuilding(local, session);
    assert.deepStrictEqual(
        local.floorsList.map((f) => f.floorCode),
        ['EXT', '부대시설', '1F', '2F', '3F']
    );
}

function testRemoteMetaKeepsRemoteTombstone() {
    const session = new Set();
    const bldg = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['1F'],
        floorsList: [{ floorCode: 'EXT', floorLabel: '외부' }],
        drawingFloorCodes: ['EXT']
    };
    const remote = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['1F'],
        floorsList: [
            { floorCode: 'EXT', floorLabel: '외부' },
            { floorCode: '2F', floorLabel: '2층' }
        ],
        drawingFloorCodes: ['EXT', '2F']
    };
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, remote);
    assert.strictEqual(n, 0);
    assert.deepStrictEqual(bldg.deletedDrawingFloorCodes, ['1F']);
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '1F', session), true);
}

// --- 삭제 시각 기반 보호 (2026-09-19: 삭제한 도면이 되살아나던 문제) ---
//
// 묘비를 "도면이 아직 남아 있다"는 증거만으로 풀면, 클라우드 정리가 늦거나 다른
// 기기가 아직 들고 있을 때 지운 도면이 그대로 되살아난다. 그게 묘비가 막으려던
// 상황이기 때문이다. 삭제 시각을 남기고 원격이 그보다 나중에 갱신됐을 때만 푼다.
//
// 시각이 없는 옛 묘비는 예전 동작을 유지해야 한다 — 그러지 않으면 이미 기기에
// 깔려 있는 false tombstone이 층을 통째로 숨기던 문제가 재발한다.

function testConfirmedDeletionSurvivesDrawingEvidence() {
    const session = new Set();
    const bldg = { id: 'b1', floorDrawings: { '2F': 'data:still-here' } };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 1000);

    // 클라우드/IDB에 도면이 남아 있어도(증거) 확정 삭제는 안 풀린다
    const n = api.forgetTombstonesWithDrawingEvidence(bldg, session, ['2F']);
    assert.strictEqual(n, 0, '삭제 시각이 있는 묘비는 증거만으로 풀리면 안 된다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), true);
}

function testLegacyTombstoneStillClearedByEvidence() {
    const session = new Set();
    const bldg = { id: 'b1' };
    // 시각 없이 기록된 옛 묘비 (nowMs 생략)
    api.rememberDeletedDrawingFloor(bldg, '2F', session);
    assert.strictEqual(api.getDeletedDrawingFloorAt(bldg, '2F'), 0);

    const n = api.forgetTombstonesWithDrawingEvidence(bldg, session, ['2F']);
    assert.strictEqual(n, 1, '시각 없는 옛 묘비는 예전대로 증거로 풀려야 한다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), false);
}

function testRemoteNewerThanDeletionClearsTombstone() {
    const session = new Set();
    const bldg = { id: 'b1' };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 1000);

    // 원격 meta가 내 삭제보다 나중 = 누가 진짜로 다시 올렸다 → 풀어준다
    const remote = { id: 'b1', metaUpdatedAt: 2000, drawingFloorCodes: ['2F'] };
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, remote);
    assert.strictEqual(n, 1, '내 삭제보다 나중에 올라온 원격 도면은 묘비를 풀어야 한다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), false);
}

function testRemoteOlderThanDeletionKeepsTombstone() {
    const session = new Set();
    const bldg = { id: 'b1' };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 3000);

    // 원격이 내 삭제보다 이전 = 아직 내 삭제를 못 받은 것 → 묘비 유지
    const remote = { id: 'b1', metaUpdatedAt: 1000, drawingFloorCodes: ['2F'] };
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, remote);
    assert.strictEqual(n, 0, '내 삭제를 아직 못 받은 원격은 묘비를 풀면 안 된다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), true);
}

function testForgetClearsDeletionTimestamp() {
    const session = new Set();
    const bldg = { id: 'b1' };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 1000);
    assert.strictEqual(api.getDeletedDrawingFloorAt(bldg, '2F'), 1000);
    api.forgetDeletedDrawingFloor(bldg, '2F', session);
    assert.strictEqual(api.getDeletedDrawingFloorAt(bldg, '2F'), 0,
        '묘비를 풀면 삭제 시각도 같이 지워져야 재등록이 막히지 않는다');
}

function testMergeDeletedAtKeepsLatest() {
    const merged = api.mergeDeletedDrawingFloorAt({ '2F': 500, '3F': 900 }, { '2F': 700 });
    assert.strictEqual(merged['2F'], 700, '더 나중 삭제 시각이 남아야 한다');
    assert.strictEqual(merged['3F'], 900, '한쪽에만 있는 시각도 살아남아야 한다');
}

/**
 * 병합이 저장된 묘비(deletedDrawingFloorCodes)를 지웠지만 세션 키는 남은 상태.
 * 이 상태에서만 self 비교가 실제로 해제를 시도하므로, 테스트는 여기를 재현해야 한다.
 */
function sessionOnlyTombstone(bldg, code, session, at) {
    api.rememberDeletedDrawingFloor(bldg, code, session, at);
    bldg.deletedDrawingFloorCodes = [];          // 병합이 지웠다고 가정
    return bldg;
}

/**
 * 2026-09-20 재발: 지운 층(지하주차장-1/-2, 0층)이 건물에 다시 들어갈 때마다 살아났다.
 * 원인은 app.js가 건물 자신을 '원격'으로 넘겨서, 비교 기준이 내 기기의
 * metaUpdatedAt이 된 것이다. 내 meta는 내가 저장할 때마다 올라가므로 삭제
 * 시각보다 항상 나중이 되고, 그러면 묘비가 매번 풀린다.
 */
function testSelfMetaNeverClearsOwnDeletion() {
    const session = new Set();
    const bldg = { id: 'b1', drawingFloorCodes: ['지하주차장-1', '지하주차장-2', '0층'] };
    ['지하주차장-1', '지하주차장-2', '0층'].forEach(function (code) {
        sessionOnlyTombstone(bldg, code, session, 1000);
    });

    // 삭제 후에도 계속 작업하면 내 meta 시각이 올라간다 (위치도 찍기 등)
    bldg.metaUpdatedAt = 9999;

    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, bldg, { selfCheck: true });
    assert.strictEqual(n, 0,
        '내 meta 시각으로는 내 삭제를 되돌리면 안 된다 (지운 층이 되살아난다)');
    ['지하주차장-1', '지하주차장-2', '0층'].forEach(function (code) {
        assert.strictEqual(api.isDeletedDrawingFloor(bldg, code, session), true,
            code + ' 묘비가 풀렸다');
    });
}

/** selfCheck를 안 줘도 같은 객체면 자동으로 알아채야 한다 (호출부를 또 틀리지 않게) */
function testSelfMetaDetectedWithoutFlag() {
    const session = new Set();
    const bldg = { id: 'b1', drawingFloorCodes: ['2F'], metaUpdatedAt: 9999 };
    sessionOnlyTombstone(bldg, '2F', session, 1000);
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, bldg);
    assert.strictEqual(n, 0, '같은 객체를 원격으로 넘기면 자기 meta는 증거가 될 수 없다');
}

/** 영일연립 회귀 방지: 시각 없는 옛 묘비는 self 비교에서도 예전처럼 풀려야 한다 */
function testLegacySelfCheckStillClears() {
    const session = new Set();
    const bldg = { id: 'b1', drawingFloorCodes: ['2F'], metaUpdatedAt: 9999 };
    sessionOnlyTombstone(bldg, '2F', session);   // 시각 없음
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, bldg, { selfCheck: true });
    assert.strictEqual(n, 1,
        '시각 없는 옛 묘비는 예전 동작을 유지해야 한다 (영일연립 층 사라짐 재발 방지)');
}

/** 진짜 원격(다른 객체)이 더 나중이면 여전히 풀어준다 */
function testRealRemoteStillClears() {
    const session = new Set();
    const bldg = { id: 'b1' };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 1000);
    const remote = { id: 'b1', metaUpdatedAt: 2000, drawingFloorCodes: ['2F'] };
    const n = api.forgetTombstonesClearedByRemoteMeta(bldg, session, remote);
    assert.strictEqual(n, 1, '진짜 원격이 내 삭제보다 나중이면 풀어야 한다');
}

testRememberAndStrip();
testMergeKeepsLocalTombstoneAgainstRemoteRevival();
testForgetAllowsReupload();
testEvidenceClearsFalseTombstoneAndSession();
testRemoteMetaClearsStaleLocalTombstone();
testRemoteMetaKeepsRemoteTombstone();
testConfirmedDeletionSurvivesDrawingEvidence();
testLegacyTombstoneStillClearedByEvidence();
testRemoteNewerThanDeletionClearsTombstone();
testRemoteOlderThanDeletionKeepsTombstone();
testForgetClearsDeletionTimestamp();
testMergeDeletedAtKeepsLatest();
testSelfMetaNeverClearsOwnDeletion();
testSelfMetaDetectedWithoutFlag();
testLegacySelfCheckStillClears();
testRealRemoteStillClears();
console.log('drawing-floor-tombstone tests ok');
