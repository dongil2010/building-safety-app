#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'shared', 'cad-unmarked-place.js'));

function testNormalize() {
    assert.strictEqual(api.normalizeCadNoKey('NO.3'), '3');
    assert.strictEqual(api.normalizeCadNoKey('03'), '3');
    assert.strictEqual(api.normalizeCadNoKey('01-02'), '1-2');
    assert.strictEqual(api.normalizeCadNoKey('1-2'), '1-2');
    assert.strictEqual(api.normalizeCadNoKey(''), '');
}

function testNumberMatchKeepsContent() {
    const unmarked = [
        { id: 'u2', no: '2', mapUnregistered: true, defectType: '박리' },
        { id: 'u1', no: '1', mapUnregistered: true, defectType: '균열' }
    ];
    const cad = [
        { no: '1', cadBoxX: 10 },
        { no: '2', cadBoxX: 20 },
        { no: '3', cadBoxX: 30 }
    ];
    const m = api.matchUnmarkedToCadItems(unmarked, cad);
    assert.strictEqual(m.pairs.length, 2);
    assert.strictEqual(m.pairs[0].how, 'number');
    assert.strictEqual(m.pairs[0].defect.id, 'u1');
    assert.strictEqual(m.pairs[0].cad.no, '1');
    assert.strictEqual(m.pairs[1].defect.id, 'u2');
    assert.strictEqual(m.leftoverCad.length, 1);
    assert.strictEqual(m.leftoverCad[0].no, '3');
    assert.strictEqual(m.leftoverUnmarked.length, 0);
}

function testOrderUsesUnlabeledBoxes() {
    const unmarked = [
        { id: 'a', no: '11', mapUnregistered: true },
        { id: 'b', no: '12', mapUnregistered: true }
    ];
    const cad = [
        { no: '', cadBoxX: 100 },
        { no: '', cadBoxX: 200 }
    ];
    const m = api.matchUnmarkedToCadItems(unmarked, cad);
    assert.strictEqual(m.pairs.length, 2);
    assert.strictEqual(m.pairs[0].how, 'order');
    assert.strictEqual(m.pairs[0].defect.id, 'a');
    assert.strictEqual(m.pairs[0].cad.cadBoxX, 100);
    assert.strictEqual(m.pairs[1].defect.id, 'b');
    assert.strictEqual(m.leftoverCad.length, 0);
}

function testLeftoverUnmarkedStays() {
    const unmarked = [
        { id: 'a', no: '1', mapUnregistered: true },
        { id: 'b', no: '2', mapUnregistered: true },
        { id: 'c', no: '3', mapUnregistered: true }
    ];
    const cad = [{ no: '1', cadBoxX: 1 }];
    const m = api.matchUnmarkedToCadItems(unmarked, cad);
    assert.strictEqual(m.pairs.length, 1);
    assert.strictEqual(m.leftoverUnmarked.map((d) => d.id).join(','), 'b,c');
}

function testUnlabeledLeftoverNotNumbered() {
    const unmarked = [{ id: 'a', no: '1', mapUnregistered: true }];
    const cad = [
        { no: '1', cadBoxX: 1 },
        { no: '', cadBoxX: 9 }
    ];
    const m = api.matchUnmarkedToCadItems(unmarked, cad);
    assert.strictEqual(m.leftoverCad.length, 1);
    assert.ok(api.isUnlabeledCadItem(m.leftoverCad[0]));
    assert.strictEqual(api.leftoverNumberedCad(m.leftoverCad).length, 0);
}

function testCollectUnmarked() {
    const list = [
        { id: '1', mapUnregistered: true },
        { id: '2', mapUnregistered: false },
        { id: '3' }
    ];
    assert.strictEqual(api.collectUnmarkedDefects(list).length, 1);
}

testNormalize();
testNumberMatchKeepsContent();
testOrderUsesUnlabeledBoxes();
testLeftoverUnmarkedStays();
testUnlabeledLeftoverNotNumbered();
testCollectUnmarked();

function testMatchNumberedOnly() {
    const placed = [
        { id: 'e1', no: 'NO.01', mapUnregistered: false, defectType: 'crack', size: '0.3' },
        { id: 'e2', no: '02', mapUnregistered: false, defectType: 'peel' }
    ];
    const cad = [
        { no: '1', cadBoxX: 10 },
        { no: '2', cadBoxX: 20 },
        { no: '3', cadBoxX: 30 }
    ];
    const m = api.matchNumberedDefectsToCadItems(placed, cad);
    assert.strictEqual(m.pairs.length, 2);
    assert.strictEqual(m.pairs[0].defect.id, 'e1');
    assert.strictEqual(m.pairs[0].cad.no, '1');
    assert.strictEqual(m.pairs[1].defect.id, 'e2');
    assert.strictEqual(m.leftoverCad.length, 1);
    assert.strictEqual(m.leftoverCad[0].no, '3');
}

function testFindNormalizedNo() {
    const list = [
        { id: 'a', no: 'NO.03', isCadImported: true },
        { id: 'b', no: '3', surveyExtra: true }
    ];
    const hit = api.findDefectByNormalizedNo(list, '3');
    assert.strictEqual(hit.id, 'a');
    assert.strictEqual(api.findDefectByNormalizedNo(list, 'NO.03').id, 'a');
    assert.strictEqual(api.findDefectByNormalizedNo(list, '99'), null);
}

testMatchNumberedOnly();
testFindNormalizedNo();
console.log('test-cad-unmarked-place.js: ok');
