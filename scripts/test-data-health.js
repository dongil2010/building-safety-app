#!/usr/bin/env node
'use strict';

/**
 * 껍데기 결함 데이터 탐지 (2026-09-20 지하1층 주차장-2 사고).
 *
 * 실제로 있었던 모양 그대로를 넣어서 잡히는지 보고, 멀쩡한 층을 잘못 잡지
 * 않는지도 같이 본다. 오탐이 나면 아무도 이 점검을 안 보게 된다.
 */

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'data-health.js'));

const BLDG = 'bldg-1789457037785';

/** 2026-09-20에 실제로 발견된 모양: 15개 전부 기둥/균열, 크기·폭 없음 */
function placeholderFloor(n) {
    const out = [];
    for (let i = 1; i <= n; i += 1) {
        out.push({
            no: 'NO.' + (i < 10 ? '0' + i : i),
            component: '기둥',
            defectType: '균열',
            location: '지하1층 주차장-2',
            size: '',
            crackWidth: ''
        });
    }
    return out;
}

/** 정상 층: 부재·결함 종류가 여럿이고 실측값이 있다 */
function healthyFloor() {
    return [
        { no: 'NO.01', component: '벽체', defectType: '수직균열', crackWidth: '0.3' },
        { no: 'NO.02', component: '상부 보', defectType: '박락', size: '200x100' },
        { no: 'NO.03', component: '천장 마감재', defectType: '갈라짐', crackWidth: '' },
        { no: 'NO.04', component: '기둥', defectType: '경사균열', crackWidth: '0.2' }
    ];
}

function testDetectsPlaceholderFloor() {
    const row = api.analyzeFloor('지하1층 주차장-2', placeholderFloor(15));
    assert.strictEqual(row.suspicious, true,
        '전부 같은 부재·결함에 실측값이 하나도 없는 층을 못 잡았다 (2026-09-20 사고 모양)');
    assert.match(row.reason, /껍데기/);
    assert.strictEqual(row.withMeasure, 0);
    assert.deepStrictEqual(row.components, ['기둥']);
}

function testHealthyFloorNotFlagged() {
    const row = api.analyzeFloor('2F', healthyFloor());
    assert.strictEqual(row.suspicious, false,
        '정상 층을 의심으로 잡으면 아무도 이 점검을 안 본다: ' + row.reason);
    assert.strictEqual(row.withMeasure, 3, 'NO.01 폭, NO.02 크기, NO.04 폭 = 3개');
}

function testBlankContentFlagged() {
    const row = api.analyzeFloor('3F', [
        { no: 'NO.01', component: '', defectType: '균열' },
        { no: 'NO.02', component: '벽체', defectType: '수직균열', crackWidth: '0.3' },
        { no: 'NO.03', component: '기둥', defectType: '', size: '10' }
    ]);
    assert.strictEqual(row.suspicious, true, '부재·결함이 빈 결함을 못 잡았다');
    assert.strictEqual(row.blankContent, 2);
}

function testTinyFloorNotFlagged() {
    // PH층처럼 결함이 2개뿐이면 종류가 하나여도 이상하지 않다
    const row = api.analyzeFloor('PH', [
        { no: 'NO.01', component: '상부 슬래브', defectType: '균열' },
        { no: 'NO.02', component: '상부 슬래브', defectType: '균열' }
    ]);
    assert.strictEqual(row.suspicious, false,
        '결함이 적은 층까지 잡으면 오탐이 된다');
}

function testEmptyFloorNotFlagged() {
    // 외부(EXT)처럼 의도적으로 비워둔 층이 있다 — 비었다고 사고가 아니다
    const row = api.analyzeFloor('EXT', []);
    assert.strictEqual(row.suspicious, false, '빈 층은 사고가 아니다');
    assert.strictEqual(row.count, 0);
}

function testMeasurementCountsAnyField() {
    assert.strictEqual(api.hasMeasurement({ crackLength: '1200' }), true,
        '균열길이만 있어도 실측값으로 본다');
    assert.strictEqual(api.hasMeasurement({ size: '', crackWidth: '', crackLength: '' }), false);
}

function testBuildingScanPicksOnlyThisBuilding() {
    const map = {};
    map[BLDG + '_지하1층 주차장-2'] = placeholderFloor(15);
    map[BLDG + '_2F'] = healthyFloor();
    map['bldg-other_9F'] = placeholderFloor(15);

    const rows = api.analyzeBuilding(map, BLDG);
    assert.strictEqual(rows.length, 2, '다른 건물 층까지 섞어보면 안 된다');

    const bad = api.suspiciousFloors(map, BLDG);
    assert.strictEqual(bad.length, 1);
    assert.strictEqual(bad[0].floorCode, '지하1층 주차장-2');
}

function testAppExposesCheck() {
    const fs = require('fs');
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.ok(app.indexOf('window.checkDataHealth') >= 0,
        'app.js가 window.checkDataHealth를 노출해야 콘솔에서 점검할 수 있다');

    const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(index.indexOf('js/core/data-health.js') >= 0,
        'index.html이 data-health.js를 불러와야 한다');
}

testDetectsPlaceholderFloor();
testHealthyFloorNotFlagged();
testBlankContentFlagged();
testTinyFloorNotFlagged();
testEmptyFloorNotFlagged();
testMeasurementCountsAnyField();
testBuildingScanPicksOnlyThisBuilding();
testAppExposesCheck();
console.log('test-data-health: ok');
