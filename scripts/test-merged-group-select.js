#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28: 결함 통합 마킹에서 NO.박스(선택 하이라이트)를 눌러 X-1 → X-2 로 못 넘어감.
 * 결함표 행이 있는 묶음은 박스 클릭이 늘 대표(X-1)로 돌아갔다. 이제 번호 부여·통합 묶음도 1→2→… 순환.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const asn = require(path.join(__dirname, '..', 'js', 'shared', 'arrow-survey-number.js'));
const dm = require(path.join(__dirname, '..', 'js', 'shared', 'defect-merge.js'));

function clicks(members, n, selected) {
    let st = null;
    const out = [];
    for (let i = 0; i < n; i++) {
        const p = asn.nextGroupMemberOnBoxClick(members, 'g', st, i === 0 ? selected : null);
        out.push(p.id);
        st = { groupId: 'g', lastId: p.id };
    }
    return out;
}

function testMergedGroupCycles() {
    const list = [
        { id: 'a', no: 'NO.03', groupId: 'g', groupNo: 'NO.03' },
        { id: 'b', no: 'NO.03', groupId: 'g', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: { no: 'NO.09', order: 2 } },
        { id: 'c', no: 'NO.03', groupId: 'g', groupNo: 'NO.03', surveyNumbered: true, mergedFrom: { no: 'NO.05', order: 1 } },
        { id: 'e1', no: 'NO.03-2', groupId: 'g', groupNo: 'NO.03', surveyExtra: true, mergeSourceId: 'c' },
        { id: 'e2', no: 'NO.03-3', groupId: 'g', groupNo: 'NO.03', surveyExtra: true, mergeSourceId: 'b' }
    ];
    const members = list.filter((d) => !d.surveyExtra).sort(asn.compareMarkingForRepresentative);
    assert.deepStrictEqual(clicks(members, 4), ['a', 'c', 'b', 'a'], '박스 클릭: X-1 → X-2 → X-3 → X-1');
    // 이미 X-2(c)를 골라 둔 상태에서 박스 → X-3
    assert.strictEqual(asn.nextGroupMemberOnBoxClick(members, 'g', null, new Set(['c'])).id, 'b');
    // 고른 마킹 → 수정창 칸(X-k)은 원래 마킹: 결함표 행의 mergeSourceId로 되찾음
    const extras = list.filter((d) => d.surveyExtra);
    assert.strictEqual(dm.findMergeSource(members, extras[0]).id, 'c');
    assert.strictEqual(dm.findMergeSource(members, extras[1]).id, 'b');
    // 결함표 행은 순환 대상 아님
    assert.ok(clicks(list, 6).every((id) => id[0] !== 'e'));
}

function testNumberedGroupAlsoCycles() {
    const members = [
        { id: 'p', groupId: 'g' },
        { id: 'n', groupId: 'g', surveyNumbered: true },
        { id: 'u', groupId: 'g', surveyNumbered: false }
    ].sort(asn.compareMarkingForRepresentative);
    assert.deepStrictEqual(clicks(members, 3), ['p', 'n', 'u']);
    assert.strictEqual(asn.nextGroupMemberOnBoxClick([members[0]], 'g', null, null).id, 'p');
    assert.strictEqual(asn.nextGroupMemberOnBoxClick([], 'g', null, null), null);
}

function testAppWiring() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const fnStart = app.indexOf('function cycleMarkingGroupMemberOnBoxClick(');
    assert.ok(fnStart > 0);
    const fnBody = app.slice(fnStart, app.indexOf('function consolidateDefectGroups(', fnStart));
    assert.ok(fnBody.includes('nextGroupMemberOnBoxClick'), '박스 클릭은 공용 순환 규칙');
    assert.ok(!/extras\.length > 0\)\s*\{\s*return pickDefectGroupRepresentative/.test(fnBody), '결함표 행이 있다고 대표로 되돌리면 -2로 못 넘어감');
    assert.ok(app.includes("if (hitInfo && hitInfo.part === 'BOX' && hitInfo.defect && hitInfo.defect.groupId) {"), '박스만 순환');
    assert.ok(app.includes("(hitInfo.part === 'TIP' || hitInfo.part === 'AREA_MOVE')"), '화살표 끝·영역은 그 마킹 자체');
    assert.ok(/const live = liveDefectForListRow\(d\);[\s\S]{0,120}openAddDefectModal\(live\.x/.test(app), '목록 X-k 행은 실제 마킹을 연다');
}

testMergedGroupCycles();
testNumberedGroupAlsoCycles();
testAppWiring();
console.log('test-merged-group-select: ok');
