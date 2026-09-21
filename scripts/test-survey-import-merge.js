#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

/**
 * 2026-09-21 사고 재현: 「지하1층 주차장-1」 NO.01~NO.10이 부재·결함 '기타',
 * 원인 '건조수축'으로 바뀌었다. 번호만 있고 내용 칸이 빈 시트를 가져오면서
 * 기존 내용을 기본값으로 덮어쓴 것이 원인이다.
 */
function testBlankImportKeepsExistingContent() {
    assert.strictEqual(api.pickImportedText('', '상부 보', '기타'), '상부 보',
        '가져온 부재 칸이 비면 기존 부재를 그대로 둬야 한다');
    assert.strictEqual(api.pickImportedText('', 'U자형 균열', '기타'), 'U자형 균열');
    assert.strictEqual(api.pickImportedText('', '건조수축 및 재료적 특성', '건조수축'),
        '건조수축 및 재료적 특성',
        '원인도 빈 값이 덮어쓰면 안 된다');
    assert.strictEqual(api.pickImportedText('   ', '벽체', '기타'), '벽체',
        '공백만 있는 칸도 빈 칸으로 본다');
}

function testImportedValueStillWins() {
    assert.strictEqual(api.pickImportedText('슬래브', '상부 보', '기타'), '슬래브',
        '가져온 값이 있으면 갱신해야 한다 (가져오기 본래 목적)');
    assert.strictEqual(api.pickImportedText('  슬래브  ', '', '기타'), '슬래브');
}

function testFallbackOnlyWhenBothEmpty() {
    assert.strictEqual(api.pickImportedText('', '', '기타'), '기타',
        '양쪽 다 비면 기본값 (새로 만드는 행과 같다)');
    assert.strictEqual(api.pickImportedText(null, undefined, '건조수축'), '건조수축');
    assert.strictEqual(api.pickImportedText('', '', ''), '');
}

function testCountsKeptExisting() {
    const n = api.countKeptExistingOnImport([
        { incoming: '', existing: '상부 보' },       // 지킴
        { incoming: '', existing: '' },              // 원래 비어 있음 — 셈 안 함
        { incoming: '슬래브', existing: '상부 보' }, // 정상 갱신 — 셈 안 함
        { incoming: '   ', existing: '수직균열' }    // 지킴
    ]);
    assert.strictEqual(n, 2, '빈 칸이 기존 내용을 덮을 뻔한 횟수만 센다');
    assert.strictEqual(api.countKeptExistingOnImport(null), 0);
}

/** 사고 그대로: 번호만 있는 시트를 NO.01~NO.10에 병합해도 내용이 살아남아야 한다 */
function testParkingFloorIncidentDoesNotRepeat() {
    const existingRows = [
        { no: 'NO.07', component: '상부 보', defectType: '경사균열', cause: '건조수축 및 재료적 특성' },
        { no: 'NO.08', component: '벽체', defectType: '수직·수평균열', cause: '건조수축 및 재료적 특성' }
    ];
    const importedRows = [
        { no: 'NO.07', component: '', defectType: '', cause: '' },
        { no: 'NO.08', component: '', defectType: '', cause: '' }
    ];
    const merged = existingRows.map((cur, i) => ({
        component: api.pickImportedText(importedRows[i].component, cur.component, '기타'),
        defectType: api.pickImportedText(importedRows[i].defectType, cur.defectType, '기타'),
        cause: api.pickImportedText(importedRows[i].cause, cur.cause, '건조수축')
    }));
    merged.forEach((m, i) => {
        assert.notStrictEqual(m.component, '기타', `NO.0${i + 7} 부재가 기타로 덮였다`);
        assert.notStrictEqual(m.defectType, '기타', `NO.0${i + 7} 결함이 기타로 덮였다`);
        assert.strictEqual(m.cause, existingRows[i].cause);
    });
    assert.strictEqual(merged[0].component, '상부 보');
    assert.strictEqual(merged[0].defectType, '경사균열');
}

/** app.js의 가져오기 병합이 이 규칙을 실제로 쓰는지 */
function testAppImportUsesRule() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const marker = '// 가져온 칸이 비었다고 기본값';
    const start = app.indexOf(marker);
    assert.ok(start > 0, '가져오기 병합 블록을 찾지 못했다');
    const block = app.slice(start, start + 2600);
    assert.ok(block.indexOf("pick(getCell(row, 'component'), existing.component, '기타')") >= 0,
        '부재는 pick()으로 기존 내용을 지켜야 한다');
    assert.ok(block.indexOf("pick(causeRaw, existing.cause, '건조수축')") >= 0,
        '원인은 pick()으로 기존 내용을 지켜야 한다');
    assert.ok(!/existing\.component = componentRaw;/.test(app),
        "빈 값이면 '기타'가 되는 componentRaw를 그대로 쓰면 안 된다");
    assert.ok(!/existing\.cause = isGood \? '-' : \(causeRaw \|\| '건조수축'\);/.test(app),
        "빈 원인을 '건조수축'으로 덮어쓰던 코드가 남아 있으면 안 된다");
    assert.ok(app.indexOf('keptExistingOnImport') >= 0,
        '빈 칸으로 덮어쓸 뻔한 건수를 사용자에게 알려야 한다');
}

testBlankImportKeepsExistingContent();
testImportedValueStillWins();
testFallbackOnlyWhenBothEmpty();
testCountsKeptExisting();
testParkingFloorIncidentDoesNotRepeat();
testAppImportUsesRule();
console.log('test-survey-import-merge: ok');
