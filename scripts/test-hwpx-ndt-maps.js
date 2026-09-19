#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'shared', 'hwpx-ndt-maps.js'));

function testJobsSkipEmpty() {
    const jobs = api.listLocationMapJobs({
        measure: true,
        strengthCarb: true,
        fireproof: false,
        tilt: false,
        settlement: false,
        memberDisp: false
    });
    assert.deepStrictEqual(jobs.map((j) => j.title), [
        '부재실측 위치도',
        '비파괴장비조사 위치도'
    ]);
}

function testCaptionStartsAt718() {
    assert.strictEqual(api.formatCaption(1, '부재실측 위치도'), '7.1.8 부재실측 위치도');
    assert.strictEqual(api.formatCaption(2, '비파괴장비조사 위치도'), '7.1.9 비파괴장비조사 위치도');
    assert.strictEqual(api.formatCaption(3, '변위측정 위치도'), '7.1.10 변위측정 위치도');
    assert.strictEqual(
        api.formatCaption(1, '부재실측 위치도', '지상 1층', true),
        '7.1.8 지상 1층 부재실측 위치도'
    );
}

function testHeadingContainsIgnoresNumber() {
    assert.ok(api.headingContains('7.1.8 부재실측 위치도', '부재실측 위치도'));
    assert.ok(api.headingContains('비파괴 장비조사 위치도(콘크리트 강도 측정 및 탄산화 측정)', '비파괴 장비조사 위치도'));
    assert.ok(!api.headingContains('부재실측 결과표', '부재실측 위치도'));
}

function testUniqueFloors() {
    const items = [
        { category: '실측', _ndtFloorCode: '1F' },
        { category: '실측', _ndtFloorCode: '2F' },
        { category: '강도', _ndtFloorCode: '1F' }
    ];
    assert.deepStrictEqual(api.uniqueFloorCodes(items, '실측'), ['1F', '2F']);
    assert.deepStrictEqual(api.uniqueFloorCodes(items, '일반비파괴'), ['1F']);
}

function testExpandCaptions718() {
    const inserts = api.expandLocationMapInserts(
        { measure: true, strengthCarb: true, memberDisp: true },
        [
            { category: '실측', _ndtFloorCode: '1F', _ndtFloorLabel: '지상 1층' },
            { category: '강도', _ndtFloorCode: '1F', _ndtFloorLabel: '지상 1층' }
        ],
        [
            { category: '부재변위', _ndtFloorCode: '1F', _ndtFloorLabel: '지상 1층' }
        ],
        '1F'
    );
    assert.deepStrictEqual(inserts.map((i) => i.caption), [
        '7.1.8 부재실측 위치도',
        '7.1.9 비파괴장비조사 위치도',
        '7.1.10 변위측정 위치도'
    ]);
}

function testDropEmptyMemberDisp() {
    assert.ok(api.shouldDropEmptyHeading('7.1.6 부재처짐 (부재변위) 측정 결과표', { memberDisp: false }));
    assert.ok(!api.shouldDropEmptyHeading('7.1.6 부재처짐 (부재변위) 측정 결과표', { memberDisp: true }));
    assert.ok(!api.shouldDropEmptyHeading('비파괴 장비조사 사진첩', { measure: false }));
}

function testStrengthMapIncludesCatwalk() {
    const inserts = api.expandLocationMapInserts(
        { strengthCarb: true },
        [
            { category: '강도', _ndtFloorCode: '1F', _ndtFloorLabel: '지상 1층' },
            { category: '탄산화', _ndtFloorCode: '캣워크', _ndtFloorLabel: '캣워크' }
        ],
        [],
        '1F'
    );
    assert.deepStrictEqual(inserts.map((i) => i.floorCode), ['1F', '캣워크']);
    assert.strictEqual(inserts[0].title, '비파괴장비조사 위치도');
    assert.ok(inserts[1].manyFloors);
}

testJobsSkipEmpty();
testCaptionStartsAt718();
testHeadingContainsIgnoresNumber();
testUniqueFloors();
testExpandCaptions718();
testDropEmptyMemberDisp();
testStrengthMapIncludesCatwalk();

function testMeasureMapsInclude5F() {
    const inserts = api.expandLocationMapInserts(
        { measure: true },
        [
            { category: '실측', _ndtFloorCode: '1F', _ndtFloorLabel: '지상 1층' },
            { category: '실측', _ndtFloorCode: '5F', _ndtFloorLabel: '지상 5층' }
        ],
        [],
        '1F'
    );
    assert.deepStrictEqual(inserts.map((i) => i.floorCode), ['1F', '5F']);
    assert.ok(inserts[1].manyFloors);
    assert.ok(inserts[1].caption.indexOf('지상 5층') >= 0);
}

function testUniqueFloorsAcceptsFloorCodeFallback() {
    const items = [
        { category: '실측', floorCode: '5F' }
    ];
    assert.deepStrictEqual(api.uniqueFloorCodes(items, '실측'), ['5F']);
}

testMeasureMapsInclude5F();
testUniqueFloorsAcceptsFloorCodeFallback();
console.log('test-hwpx-ndt-maps: ok');
