#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'floor-identity.js'));

const four = [
    { floorCode: 'EXT_FRONT', floorLabel: '건축물 외부-정면 (EXT_FRONT)' },
    { floorCode: 'EXT_BACK', floorLabel: '건축물 외부-배면 (EXT_BACK)' },
    { floorCode: 'EXT_LEFT', floorLabel: '건축물 외부-좌측면 (EXT_LEFT)' },
    { floorCode: 'EXT_RIGHT', floorLabel: '건축물 외부-우측면 (EXT_RIGHT)' },
    { floorCode: '1F', floorLabel: '지상 1층 (1F)' }
];
assert.deepStrictEqual(api.groupElevationFloors(four, 'EXT_FRONT').sort(), ['EXT_BACK', 'EXT_FRONT', 'EXT_LEFT', 'EXT_RIGHT']);
assert.deepStrictEqual(api.groupElevationFloors(four, '1F'), ['1F']);

const two = [
    { floorCode: '정배', floorLabel: '본관동 정배' },
    { floorCode: '좌우', floorLabel: '본관동 좌우' },
    { floorCode: '신관정면', floorLabel: '신관동 정면' },
    { floorCode: '신관배면', floorLabel: '신관동 배면' }
];
assert.deepStrictEqual(api.groupElevationFloors(two, '정배').sort(), ['정배', '좌우']);
assert.deepStrictEqual(api.groupElevationFloors(two, '신관정면').sort(), ['신관배면', '신관정면']);

const serial = [
    { floorCode: 'EXT_1', floorLabel: '외부1' },
    { floorCode: 'EXT_2', floorLabel: '외부2' },
    { floorCode: 'EXT', floorLabel: '건축물 외부 (EXT)' }
];
assert.deepStrictEqual(api.groupElevationFloors(serial, 'EXT_1').sort(), ['EXT_1', 'EXT_2']);
assert.deepStrictEqual(api.groupElevationFloors(serial, 'EXT'), ['EXT']);

assert.strictEqual(api.elevationGroupStem('EXT_FRONT', '본관동 정면'), '본관동');
assert.strictEqual(api.elevationGroupStem('EXT_1', '외부1'), '');

console.log('test-elevation-group: ok');
