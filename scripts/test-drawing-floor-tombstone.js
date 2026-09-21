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

function testDrawingEvidenceClearsStaleConfirmedAt() {
    const session = new Set();
    const bldg = { id: 'b1', floorDrawings: { '2F': 'data:still-here' } };
    api.rememberDeletedDrawingFloor(bldg, '2F', session, 1000);

    // 의도 삭제는 증거를 지운다. 증거+At가 같이 남아 있으면 오탐·정리 실패 → 푼다.
    // (진행 중 삭제는 앱의 _sessionDeletingDrawingFloors가 막는다)
    const n = api.forgetTombstonesWithDrawingEvidence(bldg, session, ['2F']);
    assert.strictEqual(n, 1, '도면 증거가 있으면 At가 있어도 오탐 묘비는 풀려야 한다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, '2F', session), false);
    assert.strictEqual(api.getDeletedDrawingFloorAt(bldg, '2F'), 0);
}

function testRoofSameAsAnyFloorEvidenceHeal() {
    const session = new Set(['bldg-1_ROOF']);
    const bldg = {
        id: 'bldg-1',
        deletedDrawingFloorCodes: ['ROOF'],
        deletedDrawingFloorAt: { ROOF: 1000 },
        floorsList: [{ floorCode: '1F', floorLabel: '1층' }],
        drawingFloorCodes: ['1F']
    };
    const n = api.forgetTombstonesWithDrawingEvidence(bldg, session, ['ROOF']);
    assert.strictEqual(n, 1, 'ROOF도 다른 층과 같이 도면 증거로 풀려야 한다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, 'ROOF', session), false);
    // 원격 deleted에만 있고 floorsList에 없으면 remotelyAlive 아님 → At 유지 경로
    const remote = {
        id: 'bldg-1',
        metaUpdatedAt: 500,
        deletedDrawingFloorCodes: ['ROOF'],
        floorsList: [{ floorCode: '1F', floorLabel: '1층' }],
        drawingFloorCodes: ['1F']
    };
    api.rememberDeletedDrawingFloor(bldg, 'ROOF', session, 2000);
    const n2 = api.forgetTombstonesClearedByRemoteMeta(bldg, session, remote);
    assert.strictEqual(n2, 0, '서버가 ROOF를 삭제 목록에 두면 remotelyAlive로 풀리면 안 된다');
    assert.strictEqual(api.isDeletedDrawingFloor(bldg, 'ROOF', session), true);
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
 * 2026-09-20: 지운 층(지하주차장-1/-2, 0층)이 건물에 다시 들어갈 때마다 살아났다.
 * 원인은 app.js가 건물 자신을 '원격'으로 넘겨서, 비교 기준이 내 기기의
 * metaUpdatedAt이 된 것이다. 내 meta는 저장할 때마다 올라가므로 삭제 시각보다
 * 항상 나중이 되고, 그러면 묘비가 매번 풀린다.
 * (09-21 b924940에서 selfCheck가 빠졌다가 복구 — app.js는 계속 넘기고 있었다)
 */
function testSelfMetaNeverClearsOwnDeletion() {
    const session = new Set();
    const bldg = { id: 'b1', drawingFloorCodes: ['지하주차장-1', '지하주차장-2', '0층'] };
    ['지하주차장-1', '지하주차장-2', '0층'].forEach(function (code) {
        sessionOnlyTombstone(bldg, code, session, 1000);
    });
    bldg.metaUpdatedAt = 9999;   // 삭제 후에도 작업하면 내 meta 시각이 올라간다

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

/**
 * 2026-09-21 재발: 태블릿에서 지운 「지하1층 주차장-2」가 회사 PC 접속 후 되살아났다.
 * 회사 PC는 삭제 전 데이터(층 목록·IDB 도면)를 들고 있어 병합에서 로컬 증거가 나온다.
 * 이때 원격 건물 metaUpdatedAt(삭제 뒤 편집창 저장으로 올라감)이 삭제 시각보다
 * 나중이라는 이유로 묘비를 풀고 층을 다시 올렸다. 서버가 묘비를 들고 있으면
 * 건물 meta 시각은 해제 근거가 될 수 없다.
 */
function testRemoteTombstoneBlocksLocalEvidenceRelease() {
    const session = new Set();
    const remote = {
        id: 'b1',
        metaUpdatedAt: 5000,                       // 삭제(1000) 뒤 저장으로 올라감
        deletedDrawingFloorCodes: ['지하1층 주차장-2'],
        deletedDrawingFloorAt: { '지하1층 주차장-2': 1000 }
    };
    assert.strictEqual(api.remoteMetaAtForRelease(remote, '지하1층 주차장-2'), 0,
        '원격이 묘비를 들고 있으면 meta 시각을 해제 근거로 쓰면 안 된다');

    // 회사 PC 병합 재현: 묘비는 원격에서 넘어오고, 회사 PC엔 로컬 도면 증거가 있다
    const merged = {
        id: 'b1',
        deletedDrawingFloorCodes: api.mergeDeletedDrawingFloorCodes([], remote.deletedDrawingFloorCodes),
        deletedDrawingFloorAt: api.mergeDeletedDrawingFloorAt({}, remote.deletedDrawingFloorAt)
    };
    const at = api.remoteMetaAtForRelease(remote, '지하1층 주차장-2');
    assert.strictEqual(api.isConfirmedDeletion(merged, '지하1층 주차장-2', at), true,
        '옛 데이터를 든 기기가 접속해도 지운 층이 되살아나면 안 된다');
    assert.strictEqual(api.isDeletedDrawingFloor(merged, '지하1층 주차장-2', session), true);
}

/** 원격이 묘비를 이미 풀었다면(누가 도면을 다시 올림) 예전처럼 meta 시각으로 판단한다 */
function testRemoteWithoutTombstoneUsesMeta() {
    const remote = { id: 'b1', metaUpdatedAt: 5000, drawingFloorCodes: ['2F'] };
    assert.strictEqual(api.remoteMetaAtForRelease(remote, '2F'), 5000);
    const local = { id: 'b1' };
    api.rememberDeletedDrawingFloor(local, '2F', new Set(), 1000);
    assert.strictEqual(
        api.isConfirmedDeletion(local, '2F', api.remoteMetaAtForRelease(remote, '2F')),
        false,
        '원격에서 다시 올린 도면은 옛 묘비를 풀어야 한다'
    );
}

/**
 * 서버 증거(클라우드 도면 문서)와 로컬 증거는 app.js에서 다르게 다뤄야 한다.
 * - 클라우드 조회 경로: fromEvidence로 푼다 (옥상 등 오탐 묘비 해소, b924940)
 * - 병합(로컬 IDB·옛 층 목록): remoteMetaAtForRelease로 판단 (되살아남 방지)
 */
function testAppSeparatesCloudAndLocalEvidence() {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const mergeStart = src.indexOf('const remoteMetaAtForMerge');
    const mergeEnd = src.indexOf('mergeDiscoveredFloorsIntoBuilding(merged', mergeStart);
    assert.ok(mergeStart > 0 && mergeEnd > mergeStart, '병합 구간을 찾지 못했다');
    const mergeBlock = src.slice(mergeStart, mergeEnd);
    assert.ok(src.includes('remoteMetaAtForRelease(b, code)'),
        '병합은 remoteMetaAtForRelease로 층별 원격 시각을 구해야 한다');
    assert.ok(!mergeBlock.includes('fromEvidence'),
        '병합 증거는 내 기기 로컬에서 나온 것이라 fromEvidence로 풀면 지운 층이 되살아난다');
    assert.ok(!/remoteMetaAtForMerge\s*=\s*Number\(b\?\.metaUpdatedAt\)/.test(src),
        '건물 metaUpdatedAt을 그대로 해제 기준으로 쓰면 지운 층이 되살아난다');
    // 클라우드 조회 경로는 서버 증거이므로 그대로 둔다
    assert.ok(src.includes('{ fromEvidence: true }'),
        '클라우드 도면 문서 증거로 오탐 묘비를 푸는 경로는 유지돼야 한다 (옥상)');
    // 진행 중 삭제 가드는 넣는 곳이 있어야 동작한다
    assert.ok(/_sessionDeletingDrawingFloors\.add\(/.test(src),
        '삭제를 시작할 때 진행 중 표시를 넣어야 정리 레이스를 막는다');
}

testRememberAndStrip();
testMergeKeepsLocalTombstoneAgainstRemoteRevival();
testForgetAllowsReupload();
testEvidenceClearsFalseTombstoneAndSession();
testRemoteMetaClearsStaleLocalTombstone();
testRemoteMetaKeepsRemoteTombstone();
testDrawingEvidenceClearsStaleConfirmedAt();
testRoofSameAsAnyFloorEvidenceHeal();
testLegacyTombstoneStillClearedByEvidence();
testRemoteNewerThanDeletionClearsTombstone();
testRemoteOlderThanDeletionKeepsTombstone();
testForgetClearsDeletionTimestamp();
testMergeDeletedAtKeepsLatest();
testSelfMetaNeverClearsOwnDeletion();
testSelfMetaDetectedWithoutFlag();
testLegacySelfCheckStillClears();
testRemoteTombstoneBlocksLocalEvidenceRelease();
testRemoteWithoutTombstoneUsesMeta();
testAppSeparatesCloudAndLocalEvidence();
console.log('drawing-floor-tombstone tests ok');
