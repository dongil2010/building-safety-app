#!/usr/bin/env node
'use strict';

/**
 * 삭제 vs 수정 = 수정 우선 (2026-09-30).
 * 오프라인에서 한 사람은 결함(비파괴 항목)을 지우고 다른 사람은 같은 기록을 고치거나 사진을 찍었다.
 * 묘비 값 = "지울 때 본 마지막 수정 시각" → 지운 사람이 못 본 수정은 누가 나중에 눌렀든 살아난다.
 * 사진은 지울 때 클라우드에서 바로 지우지 않고 대기열로 미룬다(app.js processDeferredPhotoDeletes).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
const APP = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const FLOOR = 'bldg_1F';

// A가 본 결함(09:00에 마지막 수정) — A는 10:05에 지우고, B는 10:00에 오프라인에서 사진을 찍었다.
function testUnseenEditWinsEvenIfEarlierThanDelete() {
    const seen = { id: 'pin-1', no: '01', contentUpdatedAt: 900 };
    const stamp = api.tombstoneStampFor(seen, 'pin');
    assert.strictEqual(stamp, 900, '묘비 값은 지운 시각이 아니라 본 수정 시각');

    const edited = Object.assign({}, seen, { contentUpdatedAt: 1000, photoIds: ['p_new'] });
    // 서버 = A가 지운 결과(묘비), 로컬 = B의 수정본
    const onB = api.mergeDefectsMaps(
        { [FLOOR]: [] }, { [FLOOR]: [edited] },
        { [FLOOR]: ['pin-1'] }, {},
        { [FLOOR]: { 'pin-1': stamp } }, {}
    );
    assert.strictEqual(onB.defects[FLOOR].length, 1, 'B의 수정이 살아남는다');
    assert.deepStrictEqual(onB.defects[FLOOR][0].photoIds, ['p_new']);
    assert.ok(!onB.deletedDefectIds[FLOOR], '살아난 기록의 묘비는 걷힌다');
    assert.deepStrictEqual(onB.revived[FLOOR], [{ id: 'pin-1', keptLocal: true, deletedHere: false }]);

    // A 쪽: 서버 = B가 올린 수정본, 로컬 = A의 묘비
    const onA = api.mergeDefectsMaps(
        { [FLOOR]: [edited] }, { [FLOOR]: [] },
        {}, { [FLOOR]: ['pin-1'] },
        {}, { [FLOOR]: { 'pin-1': stamp } }
    );
    assert.strictEqual(onA.defects[FLOOR].length, 1, 'A에서도 되살아난다');
    assert.deepStrictEqual(onA.revived[FLOOR], [{ id: 'pin-1', keptLocal: false, deletedHere: true }],
        'A에게는 "다른 사람 수정으로 복원" 알림 대상');
}

// B의 수정을 A가 이미 보고 지웠으면 되살아나면 안 된다(옛 사본을 들고 있던 C가 올려도).
function testSeenEditStaysDeleted() {
    const synced = { id: 'pin-2', no: '02', contentUpdatedAt: 1000, photoIds: ['p1'] };
    const stamp = api.tombstoneStampFor(synced, 'pin');
    const merged = api.mergeDefectsMaps(
        { [FLOOR]: [] }, { [FLOOR]: [Object.assign({}, synced)] },
        { [FLOOR]: ['pin-2'] }, {},
        { [FLOOR]: { 'pin-2': stamp } }, {}
    );
    assert.strictEqual(merged.defects[FLOOR].length, 0, '본 수정은 삭제를 못 이긴다');
    assert.deepStrictEqual(merged.deletedDefectIds[FLOOR], ['pin-2']);
    assert.ok(!merged.revived[FLOOR]);
}

// 예전 규칙(지운 시각)으로는 삭제보다 먼저 한 수정이 사라졌다 — 이제는 살아난다.
function testOldRuleWouldHaveLostEdit() {
    const edited = { id: 'pin-3', contentUpdatedAt: 1000 };
    const wallClockTomb = 1005; // 옛 코드: 지운 시각
    assert.strictEqual(api.recordSurvivesDelete(edited, wallClockTomb, 'pin'), false, '옛 묘비는 그대로 해석된다');
    assert.strictEqual(api.recordSurvivesDelete(edited, api.tombstoneStampFor({ id: 'pin-3', contentUpdatedAt: 900 }, 'pin'), 'pin'), true);
}

// 두 사람이 다른 시점에 지웠으면 더 많이 본 쪽(큰 값)을 따른다.
function testTwoDeletersTakeMostInformed() {
    const merged = api.mergeDeletedAtMaps({ [FLOOR]: { x: 900 } }, { [FLOOR]: { x: 1000 } });
    assert.strictEqual(merged[FLOOR].x, 1000);
}

// 수정 시각이 없는 옛 기록도 묘비 값이 0이 되면 안 된다(0 = 시각 없음 = 무조건 삭제).
function testStampNeverZero() {
    assert.strictEqual(api.tombstoneStampFor({ id: 'weird' }, 'pin'), 1);
    assert.strictEqual(api.tombstoneStampFor({ id: 'x' }, 'ndt'), 1);
}

function testNdtSameRule() {
    const seen = { id: 'ndt_500', updatedAt: 900 };
    const stamp = api.tombstoneStampFor(seen, 'ndt');
    assert.strictEqual(stamp, 900);
    const edited = Object.assign({}, seen, { updatedAt: 1000, value: 41 });
    const onB = api.mergeNdtDataMaps(
        { [FLOOR]: [] }, { [FLOOR]: [edited] },
        { [FLOOR]: ['ndt_500'] }, {},
        { [FLOOR]: { ndt_500: stamp } }, {}
    );
    assert.strictEqual(onB.ndtData[FLOOR].length, 1, '비파괴도 못 본 수정이 이긴다');
    assert.deepStrictEqual(onB.revived[FLOOR], [{ id: 'ndt_500', keptLocal: true, deletedHere: false }]);

    const stale = api.mergeNdtDataMaps(
        { [FLOOR]: [] }, { [FLOOR]: [Object.assign({}, seen)] },
        { [FLOOR]: ['ndt_500'] }, {},
        { [FLOOR]: { ndt_500: stamp } }, {}
    );
    assert.strictEqual(stale.ndtData[FLOOR].length, 0, '본 그대로의 사본은 지워진다');
}

// app.js 연결 확인 — 자리 치우기(층 삭제·옮김·중복 정리)는 예전 규칙, 사용자 삭제는 새 규칙과 미룬 사진 삭제
function testAppWiring() {
    assert.match(APP, /window\.state\.deletedDefectAt\[floorKey\]\[defectId\] = tombstoneValue\(rec, 'pin', opts\)/);
    assert.match(APP, /window\.state\.deletedNdtAt\[floorKey\]\[itemId\] = tombstoneValue\(rec, 'ndt', opts\)/);
    assert.match(APP, /trackDefectDeletion\(srcKey, defect\.id, defect, \{ wallClock: true \}\)/, '옮김은 지운 시각 규칙');
    assert.match(APP, /trackDefectDeletion\(key, id, target\);\s*deleteAllPhotosForDefect\(target, \{ deferCloudFloorKey: key \}\)/,
        '결함 삭제는 본 시각 묘비 + 사진 미룬 삭제');
    assert.match(APP, /defect\.contentUpdatedAt = Math\.max\(now, \(Number\(defect\.contentUpdatedAt\) \|\| 0\) \+ 1\)/,
        '수정 시각은 늘 앞으로만');
    assert.match(APP, /handleRevivedRecords\(result\.revived, 'pin', result\.defects\)/);
    assert.match(APP, /handleRevivedRecords\(result\.revived, 'ndt', result\.ndtData\)/);
    assert.match(APP, /processDeferredPhotoDeletes\(\)\.catch/);
    // 미룬 삭제도 지우기 직전에 "다른 결함이 쓰는 사진"을 다시 거른다(영일연립 사고 보호 장치와 같은 셈법)
    assert.match(APP, /defectPhotoIdsOfList\(bundle && bundle\.markings && bundle\.markings\.items, usedPinPhotos\)/);
    assert.match(APP, /\(e\.photoDocIds \|\| \[\]\)\.filter\(\(pid\) => \{\s*if \(!usedPinPhotos\.has\(pid\)\) return true;/);
    assert.match(APP, /deletePhotosForDefect\(d\.id, curCount, undefined, d\.photoIds, keepIds, opts\)/,
        '즉시 삭제 보호(keepIds)와 미룬 삭제(opts)를 둘 다 넘긴다');
    // 건물 영구 삭제는 되살릴 수 없으니 바로 지운다(대기열 옵션 없음)
    assert.match(APP, /photoDeleteJobs\.push\(deleteAllPhotosForDefect\(d\)\)/);
    assert.match(APP, /releaseStrengthPhotosOfItems\(bldg\.id, removedNdtItems, \{ keepLocal: false \}\)/);
}

testUnseenEditWinsEvenIfEarlierThanDelete();
testSeenEditStaysDeleted();
testOldRuleWouldHaveLostEdit();
testTwoDeletersTakeMostInformed();
testStampNeverZero();
testNdtSameRule();
testAppWiring();
console.log('test-delete-vs-edit: ok');
