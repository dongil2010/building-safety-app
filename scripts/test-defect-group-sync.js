#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28: 「통합 해제」 뒤 다시 통합됨.
 * 동기화 병합(mergeDefectRecord)이 groupId를 항상 서버 것으로 되살려, 풀어 둔 마킹이 서버의 옛 묶음으로
 * 돌아갔다. 묶기·풀기 때 groupUpdatedAt을 찍고 나중 쪽 소속을 따른다.
 */
const assert = require('assert');
const path = require('path');
const sm = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
const dm = require(path.join(__dirname, '..', 'js', 'shared', 'defect-merge.js'));

const clone = (v) => JSON.parse(JSON.stringify(v));

function testUnmergedLocalBeatsServerGroup() {
    const server = { id: 'b', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: { no: 'NO.05', order: 1 }, contentUpdatedAt: 1000, updatedAt: 1000, groupUpdatedAt: 1000 };
    const local = { id: 'b', no: 'NO.05', mergedFrom: null, contentUpdatedAt: 2000, updatedAt: 2000, groupUpdatedAt: 2000 };
    const m = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m.groupId, undefined, '풀어 둔 마킹이 서버 groupId로 되돌아감');
    assert.strictEqual(m.groupNo, undefined);
    assert.strictEqual(m.mergedFrom, null);
    assert.strictEqual(m.surveyNumbered, undefined);
    assert.strictEqual(m.no, 'NO.05');
    assert.strictEqual(m.groupUpdatedAt, 2000);
}

function testUngroupedBaseBeatsServerGroup() {
    // 대표: 서버엔 통합 때 만든 groupId, 기기는 통합 해제 뒤 혼자 남아 묶음이 풀림
    const server = { id: 'a', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', contentUpdatedAt: 1000, groupUpdatedAt: 1000 };
    const local = { id: 'a', no: 'NO.03', contentUpdatedAt: 1000, updatedAt: 2000, groupUpdatedAt: 2000 };
    const m = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m.groupId, undefined);
    assert.strictEqual(m.groupNo, undefined);
}

function testLaterServerGroupWins() {
    // 다른 기기가 나중에 통합 → 이 기기에서 내용만 더 늦게 고쳤어도 소속은 서버
    const server = { id: 'b', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: { no: 'NO.05', order: 1 }, contentUpdatedAt: 2000, groupUpdatedAt: 2000 };
    const local = { id: 'b', no: 'NO.05', component: '벽', contentUpdatedAt: 3000 };
    const m = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m.groupId, 'a');
    assert.strictEqual(m.no, 'NO.03');
    assert.strictEqual(m.component, '벽');
    assert.deepStrictEqual(m.mergedFrom, { no: 'NO.05', order: 1 });
}

function testLegacyWithoutStampsUnchanged() {
    const server = { id: 'b', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', contentUpdatedAt: 1000 };
    const local = { id: 'b', no: 'NO.05', contentUpdatedAt: 2000 };
    const m = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m.groupId, 'a', '찍힌 시각이 없으면 예전 규칙 그대로');
}

/** 통합 → 서버에 올라감 → 기기에서 통합 해제 → 동기화(서버+기기 병합) 뒤에도 풀린 상태 */
function testMergeUnmergeSyncRoundTrip() {
    let t = 1000;
    const now = () => t;
    const list = [
        { id: 'a', no: 'NO.03', x: 300, y: 30, targetX: 305, targetY: 35, contentUpdatedAt: 1, updatedAt: 1 },
        { id: 'b', no: 'NO.05', x: 500, y: 50, targetX: 505, targetY: 55, contentUpdatedAt: 1, updatedAt: 1 }
    ];
    let seq = 0;
    const plan = dm.planMerge(list, ['a', 'b']);
    dm.applyMerge(list, plan, {
        now,
        boxOf: (u) => {
            const d = u.defect;
            d.groupId = d.id; d.groupNo = d.no; d.groupUpdatedAt = t;
            return { x: d.x, y: d.y, groupId: d.groupId, groupNo: d.groupNo };
        },
        cloneExtra: (src) => {
            const e = { id: `e${++seq}`, no: 'NO.03-2', groupId: src.groupId, groupNo: src.groupNo, surveyExtra: true, updatedAt: t, photos: [] };
            list.push(e);
            return e;
        },
        touch: (d) => { d.contentUpdatedAt = t; d.updatedAt = t; d.positionUpdatedAt = t; }
    });
    const serverFloor = clone(list);

    t = 2000;
    const tomb = {};
    const up = dm.planUnmerge(list, 'a');
    dm.applyUnmerge(list, up, {
        now,
        removeExtra: (e) => { tomb[e.id] = t; },
        touch: (d) => { d.contentUpdatedAt = t; d.updatedAt = t; d.positionUpdatedAt = t; }
    });
    for (let i = list.length - 1; i >= 0; i--) if (tomb[list[i].id]) list.splice(i, 1);
    // 앱의 collapseSingletonDefectGroups + stampDefectsLeftGroup
    const a = list.find((d) => d.id === 'a');
    delete a.groupId; delete a.groupNo; a.groupUpdatedAt = t; a.updatedAt = t;

    const res = sm.mergeDefectsMaps(
        { f: serverFloor }, { f: list },
        {}, { f: Object.keys(tomb) }, {}, { f: tomb }
    );
    const out = res.defects.f;
    assert.deepStrictEqual(out.map((d) => d.id).sort(), ['a', 'b'], '지운 결함표 행(X-2)이 서버에서 되살아남');
    out.forEach((d) => {
        assert.strictEqual(d.groupId, undefined, `${d.id}가 다시 묶임`);
        assert.ok(!dm.isMergedArrow(d));
    });
    const b = out.find((d) => d.id === 'b');
    assert.strictEqual(b.no, 'NO.05');
    assert.deepStrictEqual([b.x, b.y], [500, 50]);
}

/** 고치기 전 판에서 되돌아간 데이터: mergedFrom === null 인데 남의 묶음 → 다시 풀기 */
function testRepairStaleRemerged() {
    const list = [
        { id: 'a', no: 'NO.03', groupId: 'a', groupNo: 'NO.03' },
        { id: 'b', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: null },
        { id: 'c', no: 'NO.04' },
        { id: 'd', no: 'NO.01' },
        // 통합 해제 뒤 정상으로 「화살표 추가」해 새로 묶은 것(자기 묶음·시각 있음)은 건드리지 않음
        { id: 'k', no: 'NO.07', groupId: 'k', groupNo: 'NO.07', mergedFrom: null, groupUpdatedAt: 5 },
        { id: 'k2', no: 'NO.07', groupId: 'k', groupNo: 'NO.07', surveyNumbered: false, groupUpdatedAt: 5 }
    ];
    const fixed = dm.repairStaleRemergedArrows(list, { now: () => 9 });
    assert.deepStrictEqual(fixed.sort(), ['a', 'b']);
    const b = list.find((d) => d.id === 'b');
    const a = list.find((d) => d.id === 'a');
    assert.strictEqual(b.groupId, undefined);
    assert.strictEqual(b.no, 'NO.02');
    assert.strictEqual(b.groupUpdatedAt, 9);
    assert.strictEqual(a.groupId, undefined);
    assert.strictEqual(a.no, 'NO.03');
    assert.strictEqual(a.groupUpdatedAt, 9);
    assert.strictEqual(list.find((d) => d.id === 'k2').groupId, 'k');
    assert.deepStrictEqual(dm.repairStaleRemergedArrows(list), [], '두 번째는 할 일 없음');
    // 고친 값이 서버의 옛 묶음을 이긴다
    const server = { id: 'b', no: 'NO.03', groupId: 'a', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: null, updatedAt: 5 };
    const m = sm.mergeDefectRecord(server, b, {});
    assert.strictEqual(m.groupId, undefined);
    assert.strictEqual(m.no, 'NO.02');
}

testUnmergedLocalBeatsServerGroup();
testRepairStaleRemerged();
testUngroupedBaseBeatsServerGroup();
testLaterServerGroupWins();
testLegacyWithoutStampsUnchanged();
testMergeUnmergeSyncRoundTrip();
console.log('test-defect-group-sync: ok');
