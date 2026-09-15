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

testRememberAndStrip();
testMergeKeepsLocalTombstoneAgainstRemoteRevival();
testForgetAllowsReupload();
console.log('drawing-floor-tombstone tests ok');
