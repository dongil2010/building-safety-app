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

testRememberAndStrip();
testMergeKeepsLocalTombstoneAgainstRemoteRevival();
testForgetAllowsReupload();
testEvidenceClearsFalseTombstoneAndSession();
testRemoteMetaClearsStaleLocalTombstone();
testRemoteMetaKeepsRemoteTombstone();
console.log('drawing-floor-tombstone tests ok');
