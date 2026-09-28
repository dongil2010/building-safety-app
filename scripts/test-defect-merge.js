#!/usr/bin/env node
'use strict';

/** 결함 통합(js/shared/defect-merge.js) — 여러 마킹 → 가장 작은 번호칸 하나(X-1, X-2 …) · 통합 해제 */
const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'shared', 'defect-merge.js'));
const asn = require(path.join(__dirname, '..', 'js', 'shared', 'arrow-survey-number.js'));

const fmt = (n) => `NO.${String(n).padStart(2, '0')}`;

function mk(id, n, extra) {
    return Object.assign({ id, no: fmt(n), x: n * 100, y: n * 10, targetX: n * 100 + 5, targetY: n * 10 + 5, component: `부재${n}`, photos: [`p-${id}`] }, extra || {});
}

/** 앱 cloneDefectForSurveyTableRow + normalizeDefectGroupNos 흉내 */
function cloneExtraFactory(list) {
    let seq = 0;
    return (src) => {
        const group = list.filter((d) => d.groupId === src.groupId);
        const marking = group.filter((d) => !d.surveyExtra).length;
        const extras = group.filter((d) => d.surveyExtra).length;
        const copy = { id: `e${++seq}`, no: `${src.groupNo}-${marking > 0 ? extras + 2 : extras + 1}`, groupId: src.groupId, groupNo: src.groupNo, surveyExtra: true, component: src.component, photos: [] };
        list.push(copy);
        return copy;
    };
}

function boxOf(unit) {
    const d = unit.defect;
    if (!d.groupId) { d.groupId = d.id; d.groupNo = d.no; }
    return { x: d.x, y: d.y, groupId: d.groupId, groupNo: d.groupNo };
}

/** 앱 getSurveyRowsForReport 핵심(그룹 한 행 + 결함표 행) 흉내 — 통합 규칙 포함 */
function reportRows(list) {
    const rows = [];
    const seen = new Set();
    list.forEach((d) => {
        if (d.surveyExtra) { rows.push(api.mergedExtraReportRow(list, d) || d); return; }
        if (!d.groupId) { rows.push(d); return; }
        if (seen.has(d.groupId)) return;
        seen.add(d.groupId);
        let members = list.filter((m) => m.groupId === d.groupId && !m.surveyExtra);
        const kept = members.filter((m) => !api.hasLinkedMergeRow(list, m));
        if (kept.length) members = kept;
        const hasExtras = list.some((m) => m.groupId === d.groupId && m.surveyExtra);
        const rep = members.slice().sort(asn.compareMarkingForRepresentative)[0];
        rows.push(Object.assign({}, rep, { no: hasExtras ? `${rep.groupNo}-1` : rep.groupNo, _groupMemberIds: members.map((m) => m.id) }));
    });
    return rows;
}

function testPlanRules() {
    const list = [mk('a', 3), mk('b', 7), mk('c', 5)];
    let plan = api.planMerge(list, ['b', 'a', 'c']);
    assert.ok(plan.ok);
    assert.strictEqual(plan.base.defect.id, 'a');
    assert.deepStrictEqual(plan.others.map((u) => u.defect.id), ['c', 'b']);
    assert.strictEqual(api.planMerge(list, ['a']).ok, false);
    // 화살표 여러 개인 그룹은 대표일 때만 가능
    const g = [mk('a', 3, { groupId: 'a', groupNo: fmt(3) }), mk('a2', 3, { groupId: 'a', groupNo: fmt(3), surveyNumbered: false }), mk('b', 7)];
    assert.ok(api.planMerge(g, ['a', 'a2', 'b']).ok);
    const g2 = [mk('a', 3), mk('b', 7, { groupId: 'b', groupNo: fmt(7) }), mk('b2', 7, { groupId: 'b', groupNo: fmt(7), surveyNumbered: false })];
    plan = api.planMerge(g2, ['a', 'b']);
    assert.strictEqual(plan.ok, false);
    assert.ok(/NO\.07/.test(plan.reason));
}

function testMergeRowsAndUnmerge() {
    const list = [mk('a', 3), mk('z', 4), mk('c', 5), mk('b', 7)];
    const plan = api.planMerge(list, ['a', 'b', 'c']);
    const res = api.applyMerge(list, plan, { boxOf, cloneExtra: cloneExtraFactory(list), touch: (d) => { d.touched = true; }, now: () => 1 });
    const a = list.find((d) => d.id === 'a');
    const b = list.find((d) => d.id === 'b');
    const c = list.find((d) => d.id === 'c');
    // 통합 화살표: 번호칸은 대표 위치, 화살표 끝은 원래 자리
    assert.strictEqual(c.groupId, 'a');
    assert.strictEqual(c.no, fmt(3));
    assert.strictEqual(c.surveyNumbered, true);
    assert.deepStrictEqual([c.x, c.y, c.targetX, c.targetY], [300, 30, 505, 55]);
    assert.strictEqual(c.mergedFrom.no, fmt(5));
    assert.strictEqual(c.mergedFrom.order, 1);
    assert.strictEqual(b.mergedFrom.order, 2);
    assert.ok(c.touched && b.touched);
    assert.deepStrictEqual(res.extras.map((e) => [e.no, e.mergeSourceId]), [['NO.03-2', 'c'], ['NO.03-3', 'b']]);

    // 보고서: 03-1 = 대표 내용, 03-2 = 원래 05 내용·사진, 03-3 = 원래 07, 04는 그대로(당기지 않음)
    const rows = reportRows(list);
    const pick = (no) => rows.find((r) => r.no === no);
    assert.strictEqual(pick('NO.03-1').component, '부재3');
    assert.deepStrictEqual(pick('NO.03-1')._groupMemberIds, ['a']);
    assert.strictEqual(pick('NO.03-2').component, '부재5');
    assert.strictEqual(pick('NO.03-2').id, 'c');
    assert.deepStrictEqual(pick('NO.03-2').photos, ['p-c']);
    assert.deepStrictEqual(pick('NO.03-2')._groupMemberIds, ['c']);
    assert.strictEqual(pick('NO.03-3').component, '부재7');
    assert.ok(pick('NO.04'));
    assert.strictEqual(rows.length, 4);

    // 대표·그룹 정렬: 원래 화살표 → 통합 화살표(원래 번호 순)
    const order = list.filter((d) => d.groupId === 'a' && !d.surveyExtra).sort(asn.compareMarkingForRepresentative).map((d) => d.id);
    assert.deepStrictEqual(order, ['a', 'c', 'b']);

    // 통합 해제: 05 자리를 그새 다른 마킹이 차지 → 가장 작은 빈 번호
    list.push(mk('n', 5));
    assert.deepStrictEqual(api.mergedGroupIdsInSelection(list, ['a']), ['a']);
    const up = api.planUnmerge(list, 'a');
    assert.ok(up.ok);
    const removed = [];
    const out = api.applyUnmerge(list, up, { removeExtra: (e) => removed.push(e.id) });
    assert.deepStrictEqual(removed.sort(), ['e1', 'e2']);
    assert.deepStrictEqual(out, [{ id: 'c', no: fmt(1) }, { id: 'b', no: fmt(7) }]);
    assert.strictEqual(c.groupId, undefined);
    assert.strictEqual(c.mergedFrom, null);
    assert.deepStrictEqual([c.x, c.y, c.targetX, c.targetY], [500, 50, 505, 55]);
    assert.strictEqual(api.isMergedArrow(c), false);
    assert.strictEqual(a.groupId, 'a');
}

function testUnmergeBlockedByExtraPhotos() {
    const list = [mk('a', 1), mk('b', 2)];
    const plan = api.planMerge(list, ['a', 'b']);
    const res = api.applyMerge(list, plan, { boxOf, cloneExtra: cloneExtraFactory(list) });
    res.extras[0].photos = ['x'];
    assert.strictEqual(api.planUnmerge(list, 'a').ok, false);
}

function testOrphanExtraFallsBack() {
    const list = [mk('a', 1), mk('b', 2)];
    const plan = api.planMerge(list, ['a', 'b']);
    const res = api.applyMerge(list, plan, { boxOf, cloneExtra: cloneExtraFactory(list) });
    const b = list.find((d) => d.id === 'b');
    assert.strictEqual(api.hasLinkedMergeRow(list, b), true);
    list.splice(list.indexOf(b), 1);
    assert.strictEqual(api.mergedExtraReportRow(list, res.extras[0]), null);
    assert.strictEqual(api.usedMainNumbers(list).has(1), true);
}

testPlanRules();
testMergeRowsAndUnmerge();
testUnmergeBlockedByExtraPhotos();
testOrphanExtraFallsBack();
console.log('test-defect-merge: ok');
