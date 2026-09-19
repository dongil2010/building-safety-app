#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

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
console.log('test-sync-merge: ok');
