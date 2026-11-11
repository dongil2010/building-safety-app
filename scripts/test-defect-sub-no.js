#!/usr/bin/env node
'use strict';
/**
 * 2026-11-11 결함 하위번호 직접 입력(js/shared/defect-sub-no.js) — NO.74-1, 74-2 … 를 번호칸 따로 둔 채 쓰기.
 *  - 번호 검사(형식·중복·묶음 번호)와 적용
 *  - 앱 정리 함수(옛 데이터 자동 묶기·꼬리 떼기·빈칸 당기기)가 직접 준 하위번호를 건드리지 않음
 *  - 보고서 번호 칸·정렬(74, 74-1, 74-2, 75)
 *  - 통계: 같은 본번호 하위번호 = 한 개소, 가장 넓은 균열
 *  - 동기화: noManual이 번호와 같은 쪽을 따름
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');
const api = require('../js/shared/defect-sub-no.js');
const sm = require('../js/core/sync-merge.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

// ---- 입력 읽기
assert.deepStrictEqual(api.parseInput('74-2'), { main: 74, suffix: 2 });
assert.deepStrictEqual(api.parseInput('NO.74'), { main: 74, suffix: 0 });
assert.deepStrictEqual(api.parseInput(' no 07 - 3 '), { main: 7, suffix: 3 });
assert.deepStrictEqual(api.parseInput('７４－１'), { main: 74, suffix: 1 });
assert.strictEqual(api.parseInput('74-0'), null);
assert.strictEqual(api.parseInput('0'), null);
assert.strictEqual(api.parseInput('B1-1'), null);
assert.strictEqual(api.parseInput(''), null);

const fmt = (n) => `NO.${String(n).padStart(2, '0')}`;
const mk = (id, no, extra) => Object.assign({ id, no, defectType: '균열', component: '기둥' }, extra || {});

// ---- 계획: 74 → 74-1, 137 → 74-2 (스크린샷 흐름)
{
    const list = [mk('a', fmt(74)), mk('b', fmt(137)), mk('c', fmt(136)), mk('z', fmt(43))];
    let plan = api.planRenumber(list, list[0], '74-1');
    assert.ok(plan.ok && !plan.unchanged, '자기 자신의 본번호에 -1 붙이기');
    const stamped = [];
    api.applyRenumber(plan, { stamp: (d) => stamped.push(d.id) });
    assert.strictEqual(list[0].no, 'NO.74-1');
    assert.strictEqual(list[0].noManual, true);
    assert.deepStrictEqual(stamped, ['a'], '번호 바뀐 시각 찍음');

    plan = api.planRenumber(list, list[1], '74-2');
    assert.ok(plan.ok);
    api.applyRenumber(plan, {});
    assert.strictEqual(list[1].no, 'NO.74-2');

    // 중복
    plan = api.planRenumber(list, list[2], '74-2');
    assert.ok(!plan.ok && /이미 있는/.test(plan.reason));
    // 같은 번호 그대로 → 바꿀 것 없음
    plan = api.planRenumber(list, list[1], 'NO.74-2');
    assert.ok(plan.ok && plan.unchanged);
    // 본번호로 되돌리면 noManual 지움
    plan = api.planRenumber(list, list[1], '137');
    assert.ok(plan.ok);
    api.applyRenumber(plan, {});
    assert.strictEqual(list[1].no, 'NO.137');
    assert.strictEqual(list[1].noManual, undefined);
    // 이미 있는 본번호(단독)로는 안 됨
    plan = api.planRenumber(list, list[1], '43');
    assert.ok(!plan.ok);
    // 형식 틀림
    assert.ok(!api.planRenumber(list, list[1], 'abc').ok);
}

// ---- 사용자(11-11): 하위번호가 생기면 원래 NO.74는 바로 74-1 (74로 남지 않음)
{
    const list = [mk('a', fmt(74)), mk('b', fmt(137)), mk('c', fmt(136)), mk('d', fmt(140))];
    let plan = api.planRenumber(list, list[1], '74-2');
    assert.ok(plan.ok);
    assert.deepStrictEqual(plan.extra.map((x) => [x.d.id, x.no]), [['a', 'NO.74-1']]);
    const stamped = [];
    api.applyRenumber(plan, { stamp: (d) => stamped.push(d.id) });
    assert.deepStrictEqual(list.map((d) => d.no), ['NO.74-1', 'NO.74-2', 'NO.136', 'NO.140']);
    assert.ok(list[0].noManual && list[1].noManual, '둘 다 하위번호 표시');
    assert.deepStrictEqual(stamped.sort(), ['a', 'b'], '원래 74도 바뀐 시각(동기화)');
    // 다음 것은 74-3: 원래 번호는 이미 74-1이라 더 바뀌지 않음
    plan = api.planRenumber(list, list[2], '74-3');
    assert.deepStrictEqual(plan.extra, []);
    api.applyRenumber(plan, {});
    assert.strictEqual(list[2].no, 'NO.74-3');
}
{
    // 새 쪽에 74-1을 치면: 원래 74가 74-1, 새 쪽은 74-2로 밀림
    const list = [mk('a', fmt(74)), mk('b', fmt(137))];
    const plan = api.planRenumber(list, list[1], '74-1');
    assert.ok(plan.ok && plan.shifted);
    api.applyRenumber(plan, {});
    assert.deepStrictEqual(list.map((d) => d.no), ['NO.74-1', 'NO.74-2']);
}
{
    // 묶인 74(통합·결함표 추가)는 여전히 끼어들기 안 됨 — 자동 변경도 없음
    const list = [mk('a', fmt(74), { groupId: 'a', groupNo: fmt(74) }), mk('e', fmt(74) + '-2', { groupId: 'a', groupNo: fmt(74), surveyExtra: true }), mk('b', fmt(137))];
    assert.ok(!api.planRenumber(list, list[2], '74-3').ok);
    assert.strictEqual(list[0].no, 'NO.74');
}

// ---- 묶인 결함: 하위번호 불가, 다른 마킹이 묶음 번호를 못 씀, 묶음 본번호 이동은 묶음째
{
    const g = [
        mk('g1', fmt(10), { groupId: 'g1', groupNo: fmt(10) }),
        mk('g2', fmt(10), { groupId: 'g1', groupNo: fmt(10) }),
        mk('e1', fmt(10) + '-2', { groupId: 'g1', groupNo: fmt(10), surveyExtra: true })
    ];
    const lone = mk('s', fmt(11));
    const list = g.concat([lone]);
    assert.ok(!api.planRenumber(list, g[0], '10-3').ok, '묶음엔 하위번호 안 됨');
    assert.ok(!api.planRenumber(list, lone, '10-5').ok, '묶음 본번호에 하위번호 붙여 끼어들기 안 됨');
    assert.ok(!api.planRenumber(list, g[2], '12').ok, '결함표 추가 행은 따로 못 바꿈');
    const plan = api.planRenumber(list, g[1], '20');
    assert.ok(plan.ok && plan.group);
    const fnApply = new Function('return ' + extractFunction(app, 'function applyDefectGroupNumbering('))();
    api.applyRenumber(plan, { groupNumbering: fnApply });
    assert.deepStrictEqual(g.map((d) => d.no), ['NO.20', 'NO.20', 'NO.20-2']);
    assert.deepStrictEqual(g.map((d) => d.groupNo), ['NO.20', 'NO.20', 'NO.20']);
}

// ---- 앱 정리 함수가 직접 준 하위번호를 건드리지 않음
const names = ['parseDefectNoParts', 'parseDefectSortNoValue', 'stripDefectNoSuffix', 'formatDefectNoSeq',
    'applyDefectGroupNumbering', 'normalizeDefectGroupNos', 'normalizeAllDefectGroupNos', 'repairLegacyMarkingSuffixGroups',
    'stampDefectNumberChanged', 'healStaleDefectGroupNos', 'findDefectMarkingNumberGaps', 'compactDefectMarkingNumberGaps'];
const win = {};
const A = new Function('window', names.map((n) => extractFunction(app, 'function ' + n + '(')).join('\n')
    + '\nreturn {' + names.join(',') + '};')(win);
{
    const list = [mk('a', 'NO.74-1', { noManual: true }), mk('b', 'NO.74-2', { noManual: true }), mk('c', 'NO.75')];
    assert.strictEqual(A.repairLegacyMarkingSuffixGroups(list), false, '직접 준 하위번호는 옛 데이터 복구로 묶지 않음');
    assert.ok(list.every((d) => !d.groupId));
    const solo = [mk('a', 'NO.74-1', { noManual: true })];
    A.normalizeAllDefectGroupNos(solo);
    assert.strictEqual(solo[0].no, 'NO.74-1', '혼자 남은 -1도 떼지 않음');
    // 옛 데이터(표시 없음)는 예전처럼 묶음 복구
    const legacy = [mk('x', 'NO.38'), mk('y', 'NO.38-2')];
    assert.strictEqual(A.repairLegacyMarkingSuffixGroups(legacy), true);
    assert.strictEqual(legacy[1].groupId, 'x');
}
{
    // 빈칸 당기기: 74-1·74-2가 본번호째 옮겨지고 꼬리 유지
    const list = [mk('a', 'NO.01'), mk('b', 'NO.03-1', { noManual: true }), mk('c', 'NO.03-2', { noManual: true })];
    const r = A.compactDefectMarkingNumberGaps(list);
    assert.strictEqual(r.moved, 1);
    assert.deepStrictEqual(list.map((d) => d.no), ['NO.01', 'NO.02-1', 'NO.02-2']);
    assert.ok(list[1].noManual && list[2].noManual);
    assert.deepStrictEqual(A.findDefectMarkingNumberGaps(list), []);
}

// ---- 보고서 번호 칸·정렬
{
    const fmtReportNo = new Function('getGrade3FloorPrefix',
        extractFunction(app, 'function stripDefectNoSuffix(') + '\nreturn '
        + extractFunction(app, 'function formatSurveyReportNo('))(() => 'B1');
    assert.strictEqual(fmtReportNo(mk('a', 'NO.74-2', { noManual: true }), false, 'B1'), '74-2', '한글·PDF·엑셀 번호 칸: 꼬리 유지');
    assert.strictEqual(fmtReportNo(mk('a', 'NO.74-2', { noManual: true }), true, 'B1'), 'B1-74-2', '3종 번호');
    assert.strictEqual(fmtReportNo(mk('a', 'NO.38-2'), false, 'B1'), '38', '표시 없는 옛 꼬리는 예전처럼 뗌');
    assert.strictEqual((app.match(/seenMainMarking\.has\(parts\.main\) && !\(d\.noManual && !d\.groupId && !d\.surveyExtra\)/g) || []).length, 2,
        '보고서 행·결함목록: 74가 있어도 74-2 행을 버리지 않음');
    const sorted = [mk('d', 'NO.75'), mk('b', 'NO.74-2'), mk('a', 'NO.74'), mk('c', 'NO.74-1'), mk('e', 'NO.74-10')]
        .sort((x, y) => A.parseDefectSortNoValue(x) - A.parseDefectSortNoValue(y));
    assert.deepStrictEqual(sorted.map((d) => d.no), ['NO.74', 'NO.74-1', 'NO.74-2', 'NO.74-10', 'NO.75']);
}

// ---- 통계 한 개소 열쇠
{
    const rows = [
        mk('a', 'NO.74', {}),
        mk('b', 'NO.74-1', { noManual: true }),
        mk('c', 'NO.74-2', { noManual: true }),
        mk('d', 'NO.75'),
        mk('e', 'NO.76', { groupId: 'g' })
    ];
    const subs = api.subMainsOf(rows);
    assert.deepStrictEqual(Array.from(subs), [74]);
    assert.deepStrictEqual(rows.map((d) => api.statsUnitKey(d, subs)), ['sub:74', 'sub:74', 'sub:74', null, 'g:g']);
    // stats.js가 이 열쇠로 균열 최대폭 하나만 남기는지(collapseGroupedCrackRows)
    const statsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'), 'utf8');
    const getW = (d) => d._w;
    const collapse = new Function('window', 'getCrackWidthNumbers',
        'return ' + extractFunction(statsSrc, 'function collapseGroupedCrackRows('))(
        { BSA: { shared: { defectSubNo: api } } }, (d) => (d._w != null ? [getW(d)] : []));
    const crackRows = [
        mk('a', 'NO.74-1', { noManual: true, _w: 1.2 }),
        mk('b', 'NO.74-2', { noManual: true, _w: 0.7 }),
        mk('c', 'NO.74-3', { noManual: true, _w: 0.4 }),
        mk('d', 'NO.74-4', { noManual: true, defectType: '박락' }),
        mk('e', 'NO.75', { _w: 0.5 })
    ];
    const out = collapse(crackRows);
    assert.deepStrictEqual(out.map((d) => d.id), ['a', 'd', 'e'], '74 묶음은 가장 넓은 균열(1.2) 한 행 + 균열 아닌 행');
}

// ---- 동기화: noManual은 번호와 같은 쪽
{
    const server = { id: 'a', no: 'NO.74', updatedAt: 1000, contentUpdatedAt: 1000 };
    const local = { id: 'a', no: 'NO.74-1', noManual: true, updatedAt: 2000, contentUpdatedAt: 2000 };
    const m1 = sm.mergeDefectRecord(server, local, {});
    assert.strictEqual(m1.no, 'NO.74-1');
    assert.strictEqual(m1.noManual, true);
    const back = { id: 'a', no: 'NO.74', updatedAt: 3000, contentUpdatedAt: 3000 };
    const m2 = sm.mergeDefectRecord(back, local, {});
    assert.strictEqual(m2.no, 'NO.74');
    assert.strictEqual(m2.noManual, undefined, '본번호로 되돌린 쪽이 이기면 표시도 사라짐');
}

// ---- 화면 연결
{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('id="btnDefectRenumber"'));
    assert.ok(/js\/shared\/defect-sub-no\.js/.test(html));
    assert.ok(app.includes("getElementById('btnDefectRenumber')?.addEventListener('click'"));
    assert.ok(app.includes("formatPinNumberLabel(defect.groupNo || defect.no || 'NO.01', styleKey, true)"), '도면 라벨 숫자만 모양도 74-2');
}

console.log('test-defect-sub-no: ok');
