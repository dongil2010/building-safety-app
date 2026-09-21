#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

/**
 * 2026-09-21: 결함 폼은 값 하나만 바꿔도(또는 창을 닫기만 해도) 모든 칸을 다시 저장한다.
 * 조사내용·원인은 화면 칩에서 다시 조립되며 값이 샜다 — 실제 「지하1층 주차장-1」 값:
 *   NO.93 '경사,수직균열' → '수직균열'
 *   NO.77 '철근의 부식·팽창에 의한 콘크리트 들뜸' → '철근의 부식, 팽창에 의한 …'
 * 안 건드린 칸은 저장값을 그대로 써야 한다.
 */
function testUntouchedFieldKeepsStoredValue() {
    // 폼이 '수직균열'로 보여줬고(칩 정리 결과) 사용자는 안 바꿨다 → 저장값 유지
    assert.strictEqual(api.keepStoredIfUntouched('수직균열', '수직균열', '경사,수직균열'), '경사,수직균열',
        '안 건드린 조사내용이 칩 정리 결과로 바뀌면 안 된다');
    assert.strictEqual(
        api.keepStoredIfUntouched(
            '철근의 부식, 팽창에 의한 콘크리트 들뜸',
            '철근의 부식, 팽창에 의한 콘크리트 들뜸',
            '철근의 부식·팽창에 의한 콘크리트 들뜸'
        ),
        '철근의 부식·팽창에 의한 콘크리트 들뜸',
        '안 건드린 원인의 구분자가 바뀌면 안 된다'
    );
}

function testChangedFieldTakesUiValue() {
    assert.strictEqual(api.keepStoredIfUntouched('경사균열, 수직균열, 누수', '수직균열', '경사,수직균열'),
        '경사균열, 수직균열, 누수', '사용자가 바꾼 칸은 화면 값을 저장해야 한다');
    assert.strictEqual(api.keepStoredIfUntouched('', '상부 보', '상부 보'), '',
        '사용자가 일부러 지운 칸은 비워야 한다');
}

function testNoBaselineUsesUiValue() {
    // 새 핀·기준을 모를 때는 예전 동작(화면 값) 그대로
    assert.strictEqual(api.keepStoredIfUntouched('균열', undefined, '망상균열'), '균열');
    // 저장값이 없으면 화면 값
    assert.strictEqual(api.keepStoredIfUntouched('균열', '균열', undefined), '균열');
    assert.strictEqual(api.keepStoredIfUntouched('균열', '균열', null), '균열');
}

/** app.js가 이 규칙을 실제 저장 경로에서 쓰는지 */
function testAppWiring() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

    const commitStart = app.indexOf('async function commitDefectFromForm(');
    assert.ok(commitStart > 0, 'commitDefectFromForm을 찾지 못했다');
    const commitBlock = app.slice(commitStart, commitStart + 9000);
    assert.ok(commitBlock.indexOf('syncMergeApi.keepStoredIfUntouched(') >= 0,
        '단건 저장은 안 건드린 칸의 저장값을 지켜야 한다');
    ['component', 'defectType', 'cause', 'location', 'no', 'category'].forEach((f) => {
        assert.ok(commitBlock.indexOf(`guardField('${f}')`) >= 0, `${f} 칸도 보호해야 한다`);
    });
    assert.ok(/state\.defects\[key\]\[idx\]\.no = noVal;/.test(app),
        "번호 칸이 비면 'NO.01'로 덮어쓰던 경로도 보호값을 써야 한다");

    // 기준값은 폼을 연 직후 기록해야 한다
    assert.ok(app.indexOf('captureDefectFormBaseline(existingPin || null);') >= 0,
        '폼을 연 직후 화면 값을 기준으로 기록해야 한다');

    // 기준 기록과 저장이 같은 읽기 함수를 써야 비교가 맞는다
    const readerCount = (app.match(/readDefectGuardedFieldsFromUi\(\)/g) || []).length;
    assert.ok(readerCount >= 3, '기준 기록·단건 저장·일괄 저장이 같은 읽기 함수를 써야 한다');

    // 칩 정리 중 버려지는 말이 있으면 입력한 그대로 써야 한다
    const readTypeStart = app.indexOf('function readDefectTypeFromUi()');
    assert.ok(readTypeStart > 0);
    const readTypeBlock = app.slice(readTypeStart, readTypeStart + 900);
    assert.ok(readTypeBlock.indexOf('kindsSelected.length === rawParts.length') >= 0,
        "칩 목록에 없는 말('경사', '누수')을 조용히 버리면 안 된다");
}

testUntouchedFieldKeepsStoredValue();
testChangedFieldTakesUiValue();
testNoBaselineUsesUiValue();
testAppWiring();
console.log('test-defect-form-guard: ok');
