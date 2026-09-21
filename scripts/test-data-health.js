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

/**
 * 2026-09-21: 지상1층(1F) 비파괴 20건이 「지하1층 주차장-2」에 같은 id로 복사돼 있었다.
 * 앱은 한 층씩만 보여줘 안 보였고, 모든 층을 합치는 한글 보고서에서 같은 측정이
 * 두 번 나와 드러났다.
 */
function testFindsSameIdOnTwoFloors() {
    const map = {
        [`${BLDG}_1F`]: [
            { id: 'ndt_1', category: '탄산화', location: '지상1층' },
            { id: 'ndt_2', category: '강도', location: '지상1층' }
        ],
        [`${BLDG}_지하1층 주차장-2`]: [
            { id: 'ndt_1', category: '탄산화', location: '지상1층' },
            { id: 'ndt_2', category: '강도', location: '지상1층' }
        ],
        [`${BLDG}_5F`]: [{ id: 'ndt_9', category: '실측', location: '예배당' }]
    };
    const dup = api.crossFloorDuplicateIds(map, BLDG);
    assert.strictEqual(dup.length, 2, '두 층에 같은 번호로 있는 항목을 찾아야 한다');
    assert.deepStrictEqual(dup.map((d) => d.id).sort(), ['ndt_1', 'ndt_2']);
    assert.deepStrictEqual(dup[0].floorCodes.slice().sort(), ['1F', '지하1층 주차장-2'].sort());
}

/** 한 층에만 있는 항목은 절대 정리 후보가 되면 안 된다 (지우면 진짜 데이터가 날아간다) */
function testOnlyDuplicatesAreCleanupCandidates() {
    const map = {
        [`${BLDG}_1F`]: [
            { id: 'ndt_1', category: '탄산화', location: '지상1층' }
        ],
        [`${BLDG}_지하1층 주차장-2`]: [
            { id: 'ndt_1', category: '탄산화', location: '지상1층' },
            { id: 'ndt_only', category: '실측', location: '주차장 기둥' }
        ]
    };
    const targets = api.duplicatedRecordsOnFloor(map, BLDG, '지하1층 주차장-2');
    assert.strictEqual(targets.length, 1, '겹치는 항목만 골라야 한다');
    assert.strictEqual(targets[0].id, 'ndt_1');

    // 원본 층에서 부르면 그쪽 사본이 후보가 된다 — 어느 쪽을 지울지는 사람이 고른다
    const onSource = api.duplicatedRecordsOnFloor(map, BLDG, '1F');
    assert.strictEqual(onSource.length, 1);
}

/** 다른 건물의 같은 id는 중복이 아니다 */
function testOtherBuildingNotMixedIn() {
    const map = {
        [`${BLDG}_1F`]: [{ id: 'ndt_1', category: '강도' }],
        ['other_1F']: [{ id: 'ndt_1', category: '강도' }]
    };
    assert.strictEqual(api.crossFloorDuplicateIds(map, BLDG).length, 0);
}

/** 보고서는 같은 번호를 두 번 넣지 않아야 한다 (실제 동작 확인) */
function testReportDedupesByItemId() {
    const map = {
        [`${BLDG}_지하1층 주차장-2`]: [
            { id: 'ndt_1', category: '탄산화', carbDepth: 34.57 },
            { id: 'ndt_2', category: '강도' }
        ],
        [`${BLDG}_1F`]: [
            { id: 'ndt_1', category: '탄산화', carbDepth: 34.57 },
            { id: 'ndt_2', category: '강도' }
        ],
        [`${BLDG}_5F`]: [{ id: 'ndt_9', category: '실측' }]
    };
    const floors = ['지하1층 주차장-2', '1F', '5F'];
    const picked = api.collectFirstByIdAcrossFloors(map, BLDG, floors);
    assert.strictEqual(picked.kept.length, 3,
        '같은 번호는 한 번만 — 5건이 아니라 3건이어야 한다');
    assert.strictEqual(picked.duplicates.length, 2, '건너뛴 중복을 알려줘야 한다');
    assert.strictEqual(picked.duplicates[0].firstFloorCode, '지하1층 주차장-2');
    assert.strictEqual(picked.duplicates[0].floorCode, '1F');
    // 같은 층을 두 번 넘겨도 두 번 넣지 않는다
    const twice = api.collectFirstByIdAcrossFloors(map, BLDG, ['5F', '5F']);
    assert.strictEqual(twice.kept.length, 1);
    // 번호 없는 항목은 그대로 살린다 (예전 데이터)
    const noIdMap = { [`${BLDG}_1F`]: [{ category: '강도' }, { category: '강도' }] };
    const noId = api.collectFirstByIdAcrossFloors(noIdMap, BLDG, ['1F']);
    assert.strictEqual(noId.kept.length, 2, '번호 없는 옛 항목을 중복으로 지우면 안 된다');
    // 같은 층이 목록에 두 번 들어와도 번호 없는 항목이 두 배가 되면 안 된다
    const noIdTwice = api.collectFirstByIdAcrossFloors(noIdMap, BLDG, ['1F', '1F']);
    assert.strictEqual(noIdTwice.kept.length, 2,
        '같은 층을 두 번 훑으면 번호 없는 항목이 두 배가 된다');
}

/** 콘솔 도구가 노출돼 있어야 현장에서 정리할 수 있다 */
function testAppExposesCleanup() {
    const fs = require('fs');
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert.ok(app.indexOf('window.cleanDuplicateNdt') >= 0,
        'app.js가 window.cleanDuplicateNdt를 노출해야 콘솔에서 정리할 수 있다');
    const start = app.indexOf('function buildCombinedNdtDataForReport');
    const block = app.slice(start, start + 3000);
    assert.ok(block.indexOf('health.collectFirstByIdAcrossFloors(map, buildingId, floorCodes)') >= 0,
        '보고서 합치기는 중복 제거 모듈을 실제로 호출해야 한다');
    // 부동침하·부재변위 측정 구역도 같은 방식으로 복사되므로 정리 대상에 들어가야 한다
    const cleanStart = app.indexOf('window.cleanDuplicateNdt');
    const cleanBlock = app.slice(cleanStart, cleanStart + 3000);
    assert.ok(cleanBlock.indexOf('window.state.ndtDisplacementGroups') >= 0,
        '정리 도구가 측정 구역(부동침하)도 봐야 한다');
}

testDetectsPlaceholderFloor();
testHealthyFloorNotFlagged();
testBlankContentFlagged();
testTinyFloorNotFlagged();
testEmptyFloorNotFlagged();
testMeasurementCountsAnyField();
testBuildingScanPicksOnlyThisBuilding();
testAppExposesCheck();
testFindsSameIdOnTwoFloors();
testOnlyDuplicatesAreCleanupCandidates();
testOtherBuildingNotMixedIn();
testReportDedupesByItemId();
testAppExposesCleanup();
console.log('test-data-health: ok');
