#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'ndt-measure-dim.js'));

function testOneSideFormat() {
    assert.strictEqual(api.formatPairDimText(650, null, '×'), '650×-');
    assert.strictEqual(api.formatPairDimText(650, '', '×'), '650×-');
    assert.strictEqual(api.formatPairDimText(null, 650, '×'), '-×650');
    assert.strictEqual(api.formatPairDimText(650, 640, '×'), '650×640');
    assert.strictEqual(api.formatPairDimText(null, null, '×'), '-');
    assert.strictEqual(api.formatPairDimText(650, null, ' × '), '650 × -');
}

function testParseKeepsEmptySide() {
    assert.deepStrictEqual(api.parseDimensionPair('650', ''), { w: 650, d: null });
    assert.deepStrictEqual(api.parseDimensionPair('650×', ''), { w: 650, d: null });
    assert.deepStrictEqual(api.parseDimensionPair('650×-', ''), { w: 650, d: null });
    assert.deepStrictEqual(api.parseDimensionPair('-×650', ''), { w: null, d: 650 });
    assert.deepStrictEqual(api.parseDimensionPair('400*600', ''), { w: 400, d: 600 });
    assert.deepStrictEqual(api.parseDimensionPair('650', '640'), { w: 650, d: 640 });
}

testOneSideFormat();
testParseKeepsEmptySide();
console.log('test-ndt-measure-dim: ok');
