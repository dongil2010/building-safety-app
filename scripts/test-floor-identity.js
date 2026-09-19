#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'floor-identity.js'));

function testParkingIsNotBasement() {
    assert.strictEqual(api.parseBasementNumber('지하주차장-1'), null);
    assert.strictEqual(api.parseBasementNumber('지하주차장-2'), null);
    assert.strictEqual(api.isStandardFloorCode('지하주차장-1'), false);
    assert.strictEqual(api.parseBasementNumber('B1F'), 1);
    assert.strictEqual(api.parseBasementNumber('지하 2층'), 2);
    assert.strictEqual(api.parseBasementNumber('지하1층'), 1);
}

function testCustomLabelNotRewritten() {
    assert.strictEqual(api.labelFromCode('지하주차장-1'), '지하주차장-1');
    assert.strictEqual(api.labelFromCode('지하주차장-2'), '지하주차장-2');
    assert.strictEqual(api.normalizeUserLabel('지하주차장-1', '지하주차장-1층 (지하주차장-1)'), '지하주차장-1');
    assert.strictEqual(api.normalizeUserLabel('지하주차장-2', '지하주차장-2층'), '지하주차장-2');
    assert.strictEqual(api.labelFromCode('B1F'), '지하 1층 (B1F)');
    assert.strictEqual(api.labelFromCode('2F'), '지상 2층 (2F)');
}

function testUserOrderPreserved() {
    const preferred = [
        { floorCode: '지하주차장-1', floorLabel: '지하주차장-1' },
        { floorCode: '지하주차장-2', floorLabel: '지하주차장-2' }
    ];
    const assembled = api.assembleFloors(preferred, [
        { floorCode: '지하주차장-2', floorLabel: '지하주차장-2층 (지하주차장-2)' },
        { floorCode: '지하주차장-1', floorLabel: '지하주차장-1층 (지하주차장-1)' }
    ]);
    assert.deepStrictEqual(assembled.map((f) => f.floorCode), ['지하주차장-1', '지하주차장-2']);
    assert.deepStrictEqual(assembled.map((f) => f.floorLabel), ['지하주차장-1', '지하주차장-2']);
}

function testCustomSortDoesNotReverseParking() {
    const list = [
        { floorCode: '지하주차장-1', floorLabel: '지하주차장-1' },
        { floorCode: '지하주차장-2', floorLabel: '지하주차장-2' }
    ];
    const sorted = api.sortFloorsLowToHigh(list);
    assert.deepStrictEqual(sorted.map((f) => f.floorCode), ['지하주차장-1', '지하주차장-2']);
}

function testStandardStillSortsLowToHigh() {
    const list = [
        { floorCode: '2F', floorLabel: '지상 2층 (2F)' },
        { floorCode: 'B1F', floorLabel: '지하 1층 (B1F)' },
        { floorCode: '1F', floorLabel: '지상 1층 (1F)' },
        { floorCode: 'B2F', floorLabel: '지하 2층 (B2F)' }
    ];
    const sorted = api.sortFloorsLowToHigh(list);
    assert.deepStrictEqual(sorted.map((f) => f.floorCode), ['B2F', 'B1F', '1F', '2F']);
}

function testFilenameParkingStem() {
    const parsed = api.parseCustomStemFromFilename('지하주차장-1.jpg');
    assert.ok(parsed);
    assert.strictEqual(parsed.floorCode, '지하주차장-1');
    assert.strictEqual(parsed.floorLabel, '지하주차장-1');
    assert.strictEqual(parsed.matched, true);
}

function testLookupUsesFloorsList() {
    const bldg = {
        floorsList: [
            { floorCode: '지하주차장-1', floorLabel: '지하주차장-1' }
        ]
    };
    assert.strictEqual(api.lookupFloorLabel('지하주차장-1', bldg), '지하주차장-1');
}

function testUnmatchedFilenameIsNot1F() {
    const parsed = api.unmatchedFloorFromFilename('IMG_001.jpg');
    assert.strictEqual(parsed.floorCode, 'IMG_001');
    assert.strictEqual(parsed.floorLabel, 'IMG_001');
    assert.strictEqual(parsed.matched, false);
    const drawing = api.unmatchedFloorFromFilename('도면.jpg');
    assert.strictEqual(drawing.floorCode, '도면');
    assert.strictEqual(drawing.matched, false);
}

function testUniquifyCustomOnly() {
    assert.strictEqual(api.uniquifyCustomFloorCode('1F', ['1F', '2F']), '1F');
    assert.strictEqual(api.uniquifyCustomFloorCode('2F', ['2F']), '2F');
    assert.strictEqual(api.uniquifyCustomFloorCode('도면', ['지하주차장-1']), '도면');
    assert.strictEqual(api.uniquifyCustomFloorCode('도면', ['도면']), '도면-2');
    assert.strictEqual(api.uniquifyCustomFloorCode('IMG_001', ['IMG_001', 'IMG_001-2']), 'IMG_001-3');
}

function testAssignParsedFloorForUpload() {
    const used = ['지하주차장-1', '지하주차장-2'];
    const a = api.assignParsedFloorForUpload(
        { floorCode: 'IMG_001', floorLabel: 'IMG_001', matched: false, rank: 0 },
        used
    );
    used.push(a.floorCode);
    const b = api.assignParsedFloorForUpload(
        { floorCode: 'IMG_001', floorLabel: 'IMG_001', matched: false, rank: 0 },
        used
    );
    assert.strictEqual(a.floorCode, 'IMG_001');
    assert.strictEqual(b.floorCode, 'IMG_001-2');

    const replace = api.assignParsedFloorForUpload(
        { floorCode: '2F', floorLabel: '지상 2층 (2F)', matched: true, rank: 2 },
        ['2F', '지하주차장-1']
    );
    assert.strictEqual(replace.floorCode, '2F');
    assert.strictEqual(replace.matched, true);
}

function testExtraDrawingsDoNotCollapseTo1F() {
    const used = ['지하주차장-1', '지하주차장-2', '1F'];
    const names = ['IMG_001.jpg', 'IMG_002.jpg', '도면.jpg', '2F.jpg'];
    const assigned = names.map((name) => {
        const parking = api.parseCustomStemFromFilename(name);
        const parsed = parking || (/^\d+F\./i.test(name)
            ? { floorCode: name.replace(/\.[^.]+$/, '').toUpperCase(), floorLabel: name, matched: true, rank: 2 }
            : api.unmatchedFloorFromFilename(name));
        const next = api.assignParsedFloorForUpload(parsed, used);
        used.push(next.floorCode);
        return next.floorCode;
    });
    assert.deepStrictEqual(assigned, ['IMG_001', 'IMG_002', '도면', '2F']);
    assert.ok(!assigned.includes('1F'));
}

function testCatwalkIsIncludedWhenMissingFromFloorsList() {
    const bldg = {
        id: 'mustard',
        floorsList: [{ floorCode: '1F', floorLabel: '지상 1층 (1F)' }],
        floorDrawings: { '1F': 'data:1', '캣워크': 'data:c' }
    };
    const codes = api.listFloorCodesForNdtReport(bldg, [
        { mustard_1F: [{}], mustard_캣워크: [{ category: '강도' }] }
    ]);
    assert.deepStrictEqual(codes, ['1F', '캣워크']);
}

function testNdtOnlyFloorKeysAreIncluded() {
    const bldg = {
        id: 'b1',
        floorsList: [{ floorCode: '1F', floorLabel: '지상 1층 (1F)' }]
    };
    const codes = api.listFloorCodesForNdtReport(bldg, [
        { b1_1F: [] },
        { b1_캣워크층: [{ id: 'ndtg_1' }] }
    ]);
    assert.ok(codes.includes('1F'));
    assert.ok(codes.includes('캣워크층'));
}

testParkingIsNotBasement();
testCustomLabelNotRewritten();
testUserOrderPreserved();
testCustomSortDoesNotReverseParking();
testStandardStillSortsLowToHigh();
testFilenameParkingStem();
testLookupUsesFloorsList();
testUnmatchedFilenameIsNot1F();
testUniquifyCustomOnly();
testAssignParsedFloorForUpload();
testExtraDrawingsDoNotCollapseTo1F();
testCatwalkIsIncludedWhenMissingFromFloorsList();
testNdtOnlyFloorKeysAreIncluded();
console.log('test-floor-identity: ok');
