#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

/**
 * 외부(EXT) 결함을 남측(EXT_S) 도면으로 '옮긴' 경우.
 *
 * 병합 규칙상 서버에만 있고 로컬에 없는 결함은 묘비가 없으면 복원된다.
 * 그래서 옮기기만 하고 원래 층에 묘비를 안 남기면 서버의 원본이 되살아나
 * 같은 결함이 두 층에 동시에 존재한다. 외부는 조사표를 하나로 합치므로
 * 표에 같은 결함이 두 번 나온다. (2026-09-20 현장 보고)
 */
function testMovedExteriorDefectDoesNotComeBack() {
    const EXT = 'bldg_EXT';
    const EXT_S = 'bldg_EXT_S';
    const rec = { id: 'pin-7', no: '7', contentUpdatedAt: 100 };

    // 서버는 아직 옮기기 전 상태 (EXT에 원본이 있다)
    const server = { [EXT]: [rec], [EXT_S]: [] };
    // 로컬은 옮긴 뒤 (EXT는 비었고 EXT_S에 있다)
    const local = { [EXT]: [], [EXT_S]: [Object.assign({}, rec, { contentUpdatedAt: 300 })] };

    // 묘비 없이 병합하면 EXT에 되살아난다 — 이게 현장에서 본 증상이다
    const without = api.mergeDefectsMaps(server, local, {}, {}, {}, {});
    assert.strictEqual(without.defects[EXT].length, 1,
        '묘비가 없으면 서버 원본이 복원된다 (이 규칙이 바뀌면 전제를 다시 볼 것)');

    // 옮길 때 원래 층에 묘비를 남기면 되살아나지 않는다
    const withTomb = api.mergeDefectsMaps(
        server, local,
        {}, { [EXT]: ['pin-7'] },
        {}, { [EXT]: { 'pin-7': 200 } }
    );
    assert.strictEqual(withTomb.defects[EXT].length, 0,
        '옮긴 결함이 원래 층에 되살아났다 — 외부 조사표에 중복으로 나온다');
    assert.strictEqual(withTomb.defects[EXT_S].length, 1,
        '옮겨간 층의 결함까지 지우면 안 된다');
}

/** 되돌려 찍는 경우: 도착 층 묘비를 풀고 내용 시각을 올리면 살아남아야 한다 */
function testMoveBackSurvivesOldTombstone() {
    const EXT = 'bldg_EXT';
    const rec = { id: 'pin-7', contentUpdatedAt: 500 };
    const merged = api.mergeDefectsMaps(
        { [EXT]: [] }, { [EXT]: [rec] },
        { [EXT]: ['pin-7'] }, {},
        { [EXT]: { 'pin-7': 200 } }, {}
    );
    assert.strictEqual(merged.defects[EXT].length, 1,
        '되돌려 찍은 결함이 옛 묘비 때문에 사라졌다');
}

/** app.js의 이동 지점이 묘비를 남기는지 (빠뜨리면 증상이 그대로 재발한다) */
function testAppJsMoveWritesTombstone() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const idx = app.indexOf('state.defects[srcKey].splice(idx, 1);');
    assert.ok(idx > 0, '결함 이동 지점을 찾지 못했다');
    const block = app.slice(idx, idx + 1200);
    assert.ok(block.indexOf('trackDefectDeletion(srcKey') >= 0,
        '다른 층으로 옮길 때 원래 층에 묘비를 안 남긴다 — 서버 원본이 되살아난다');
    assert.ok(block.indexOf('untrackDefectDeletion(destKey') >= 0,
        '도착 층의 옛 묘비를 풀지 않는다 — 되돌려 찍으면 결함이 사라진다');
    assert.ok(block.indexOf('markFloorKeyDirty(srcKey)') >= 0,
        '원래 층을 dirty로 표시하지 않으면 묘비가 서버에 올라가지 않는다');
}

function testOldTombstoneNeverRevives() {
    const rec = { id: 'pin-1', contentUpdatedAt: 9999 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 0, 'pin'), false);
}

function testPositionOnlyDoesNotRevive() {
    const rec = { id: 'pin-1', contentUpdatedAt: 100, positionUpdatedAt: 500 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 200, 'pin'), false);
}

function testLaterContentRevivesDefect() {
    const rec = { id: 'pin-1', contentUpdatedAt: 500 };
    assert.strictEqual(api.recordSurvivesDelete(rec, 200, 'pin'), true);
}

function testDeletedNdtStaysDeleted() {
    const floor = 'bldg_1F';
    const item = { id: 'ndt_100', value: 10, updatedAt: 100 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [] },
        { [floor]: ['ndt_100'] },
        {},
        { [floor]: { ndt_100: 200 } },
        {}
    );
    assert.strictEqual((result.ndtData[floor] || []).length, 0);
    assert.ok((result.deletedNdtIds[floor] || []).includes('ndt_100'));
}

function testLaterNdtEditRevives() {
    const floor = 'bldg_1F';
    const item = { id: 'ndt_100', value: 12, updatedAt: 300 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [item] },
        { [floor]: ['ndt_100'] },
        {},
        { [floor]: { ndt_100: 200 } },
        {}
    );
    assert.strictEqual(result.ndtData[floor].length, 1);
    assert.strictEqual(result.ndtData[floor][0].value, 12);
    assert.ok(!result.deletedNdtIds[floor]);
}

function testDisplacementDeleteUsesSameMerge() {
    const floor = 'bldg_1F';
    const item = { id: 'ndtg_50', points: [{ x: 1 }], updatedAt: 10 };
    const result = api.mergeNdtDataMaps(
        { [floor]: [item] },
        { [floor]: [] },
        { [floor]: ['ndtg_50'] },
        { [floor]: ['ndtg_50'] },
        { [floor]: { ndtg_50: 20 } },
        { [floor]: { ndtg_50: 20 } }
    );
    assert.strictEqual((result.ndtData[floor] || []).length, 0);
}

function testTwoDeviceDefectKeepsNewerContentAndOtherPhotos() {
    const server = {
        id: 'pin-1',
        status: '관찰',
        width: '0.3',
        contentUpdatedAt: 100,
        photoIds: ['pin-1_0']
    };
    const local = {
        id: 'pin-1',
        status: '진행',
        width: '0.3',
        contentUpdatedAt: 200,
        photoIds: ['pin-1_0', 'pin-1_1']
    };
    const merged = api.mergeDefectRecord(server, local, {});
    assert.strictEqual(merged.status, '진행');
    assert.deepStrictEqual(merged.photoIds, ['pin-1_0', 'pin-1_1']);
}

function testLocalOnlyDefectAppended() {
    const floor = 'bldg_1F';
    const result = api.mergeDefectsMaps(
        { [floor]: [{ id: 'pin-1', no: '1', contentUpdatedAt: 1 }] },
        { [floor]: [
            { id: 'pin-1', no: '1', contentUpdatedAt: 1 },
            { id: 'pin-2', no: '2', contentUpdatedAt: 2 }
        ] },
        {},
        {},
        {},
        {}
    );
    const ids = result.defects[floor].map((d) => d.id);
    assert.deepStrictEqual(ids, ['pin-1', 'pin-2']);
}

function testDeletedDefectStaysOut() {
    const floor = 'bldg_1F';
    const rec = { id: 'pin-9', contentUpdatedAt: 50 };
    const result = api.mergeDefectsMaps(
        { [floor]: [rec] },
        { [floor]: [] },
        { [floor]: ['pin-9'] },
        {},
        { [floor]: { 'pin-9': 80 } },
        {}
    );
    assert.strictEqual((result.defects[floor] || []).length, 0);
    assert.ok((result.deletedDefectIds[floor] || []).includes('pin-9'));
}

function testAppJsDelegatesMerge() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /js\/core\/sync-merge\.js/);
    assert.match(app, /BSA\.syncMerge\.mergeDefectsMaps/);
    assert.match(app, /BSA\.syncMerge\.mergeNdtDataMaps/);
    assert.doesNotMatch(app, /function recordSurvivesDelete\(rec, deletedAt, kind\) \{\s*if \(!rec \|\| !rec\.id\) return false;/);
}

testOldTombstoneNeverRevives();
testPositionOnlyDoesNotRevive();
testLaterContentRevivesDefect();
testDeletedNdtStaysDeleted();
testLaterNdtEditRevives();
testDisplacementDeleteUsesSameMerge();
testTwoDeviceDefectKeepsNewerContentAndOtherPhotos();
testLocalOnlyDefectAppended();
testDeletedDefectStaysOut();
testAppJsDelegatesMerge();
testMovedExteriorDefectDoesNotComeBack();
testMoveBackSurvivesOldTombstone();
testAppJsMoveWritesTombstone();

/**
 * 2026-09-27 겨자씨 「지하1층 주차장-2」: 9/21 서버 복구가 수정 시각을 안 올렸고(09-16 그대로),
 * 9/19 껍데기(기둥/균열/건조수축)를 든 옛 기기가 동기화하며 **시각 동점**으로 이겨 9개를 되돌렸다.
 * 앱에서 고치면 시각이 올라가므로, 동점에 내용이 다르면 서버를 따른다.
 */
(function testTieKeepsServerContent() {
    const T = 1789517586000; // 09-16 09:13:06
    const server = { id: '1077ca1', no: 'NO.02', component: '보 및 데크슬래브', defectType: '녹 발생', size: '1.0x1.0', contentUpdatedAt: T, updatedAt: T };
    const stale = { id: '1077ca1', no: 'NO.02', component: '기둥', defectType: '균열', size: '', contentUpdatedAt: T, updatedAt: T };
    const merged = api.mergeDefectRecord(server, stale, {});
    assert.strictEqual(merged.component, '보 및 데크슬래브', '동점이면 옛 기기의 껍데기가 서버 복구값을 덮으면 안 된다');
    assert.strictEqual(merged.defectType, '녹 발생');
    assert.strictEqual(merged.size, '1.0x1.0');

    // 기기에서 나중에 고친 건 그대로 이긴다
    const edited = Object.assign({}, stale, { component: '철골 보', contentUpdatedAt: T + 1, updatedAt: T + 1 });
    assert.strictEqual(api.mergeDefectRecord(server, edited, {}).component, '철골 보');
})();

// 같은 날 창평 B1F: 옛 기기의 옛 번호가 동점으로 이겨 NO.16·NO.22가 두 개씩 됐다
(function testTieKeepsServerNo() {
    const T = 1789517586000;
    const server = { id: 'p15', no: 'NO.15', contentUpdatedAt: T, updatedAt: T };
    const stale = { id: 'p15', no: 'NO.16', contentUpdatedAt: T, updatedAt: T };
    assert.strictEqual(api.mergeDefectRecord(server, stale, {}).no, 'NO.15');
    const renumbered = Object.assign({}, stale, { updatedAt: T + 5 });
    assert.strictEqual(api.mergeDefectRecord(server, renumbered, {}).no, 'NO.16', '기기에서 번호를 다시 매겼으면 기기 번호');
})();

// 동점을 서버로 바꿨으니, 결함 내용을 고치는 곳은 전부 시각을 올려야 한다(안 올리면 다음 동기화에 되돌아감)
(function testContentEditPathsTouchTimestamp() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const inline = app.slice(app.indexOf('window.updateSurveyInlineField = function'));
    const inlineBody = inline.slice(0, inline.indexOf('saveStateToLocalStorage();'));
    assert.ok(/touchDefectUpdatedAt\(defect\)/.test(inlineBody), '조사표 칸 직접 수정이 수정 시각을 안 올린다');
    const imp = app.indexOf('existing.isCarriedOver = true;');
    assert.ok(imp > 0);
    const impTail = app.slice(imp, app.indexOf('matchedThisFloor++;', imp));
    assert.ok(/touchDefectUpdatedAt\(existing\)/.test(impTail), '엑셀 가져오기가 기존 결함 수정 시각을 안 올린다');
})();

// 비파괴 기록·부동침하 구역도 동점이면 서버 — 결함과 같은 이유
(function testNdtTieKeepsServer() {
    const T = 1789517586000;
    const server = { id: 'ndt_1', avgValue: '32.1', grade: 'B', updatedAt: T };
    const stale = { id: 'ndt_1', avgValue: '', grade: '', updatedAt: T };
    const merged = api.mergeNdtRecord(server, stale);
    assert.strictEqual(merged.avgValue, '32.1', '동점이면 옛 기기의 빈 측정값이 서버 값을 덮으면 안 된다');
    const edited = Object.assign({}, stale, { avgValue: '30.0', updatedAt: T + 1 });
    assert.strictEqual(api.mergeNdtRecord(server, edited).avgValue, '30.0');
})();

// 부동침하 "마지막 지점 되돌리기": 지점만 빼면 시각을 올리고, 구역이 없어지면 묘비를 남긴다
(function testNdtDispUndoTouchesAndTombstones() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const at = app.indexOf('function undoLastNdtDisplacementMark()');
    assert.ok(at > 0);
    const body = app.slice(at, app.indexOf('window.undoLastNdtDisplacementMark', at));
    assert.ok(/trackNdtDeletion\(entry\.key, entry\.groupId, group\)/.test(body), '되돌리기로 구역을 지울 때 묘비가 없다 — 서버 구역이 되살아난다');
    assert.ok(/group\.updatedAt = Date\.now\(\)/.test(body), '되돌리기로 지점을 뺄 때 시각을 안 올린다');
})();

console.log('test-sync-merge: ok');
