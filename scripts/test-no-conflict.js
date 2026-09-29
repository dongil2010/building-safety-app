#!/usr/bin/env node
'use strict';

/**
 * 2026-09-29 오프라인 동시 작업 번호 겹침 자동 정리 (js/core/no-conflict.js)
 * 상황: A·B 둘 다 비행기모드로 지하1층을 작업하고 1층에서 연결. A가 먼저 동기화, B가 나중.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const api = require(path.join(root, 'js', 'core', 'no-conflict.js'));
const merge = require(path.join(root, 'js', 'core', 'sync-merge.js'));

const clone = (x) => JSON.parse(JSON.stringify(x));
const base = [
    { id: 'd1', no: 'NO.01', groupId: 'd1', groupNo: 'NO.01', contentUpdatedAt: 100, updatedAt: 100 },
    { id: 'd2', no: 'NO.02', groupId: 'd2', groupNo: 'NO.02', contentUpdatedAt: 100, updatedAt: 100 }
];

// ---- 결함: A가 먼저 올린 NO.03·NO.04, B가 오프라인에서 만든 NO.03(결함표 추가행 포함)·NO.04 ----
{
    const server = base.concat([
        { id: 'a3', no: 'NO.03', groupId: 'a3', groupNo: 'NO.03', contentUpdatedAt: 300, updatedAt: 300 },
        { id: 'a4', no: 'NO.04', groupId: 'a4', groupNo: 'NO.04', contentUpdatedAt: 310, updatedAt: 310 }
    ]);
    const local = clone(base).concat([
        { id: 'b3', no: 'NO.03', groupId: 'b3', groupNo: 'NO.03', contentUpdatedAt: 320, updatedAt: 320 },
        { id: 'b3x', no: 'NO.03-2', groupId: 'b3', groupNo: 'NO.03', surveyExtra: true, contentUpdatedAt: 320, updatedAt: 320 },
        { id: 'b4', no: 'NO.04', groupId: 'b4', groupNo: 'NO.04', contentUpdatedAt: 330, updatedAt: 330 }
    ]);
    const merged = merge.mergeDefectsMaps({ k: server }, { k: local }, {}, {}, {}, {}, {}).defects.k;
    const changes = api.resolveDefectNoConflicts(merged, [], new Set(server.map((d) => d.id)), 999);
    const byId = Object.fromEntries(merged.map((d) => [d.id, d]));
    assert.deepStrictEqual(['a3', 'a4', 'd1', 'd2'].map((id) => byId[id].no), ['NO.03', 'NO.04', 'NO.01', 'NO.02'],
        '먼저 올린 사람(서버에 있던 것) 번호는 그대로');
    assert.strictEqual(byId.b3.no, 'NO.05');
    assert.strictEqual(byId.b3x.no, 'NO.05-2', '결함표 추가행은 꼬리를 살려 같이 옮긴다');
    assert.strictEqual(byId.b3x.groupNo, 'NO.05');
    assert.strictEqual(byId.b4.no, 'NO.06');
    assert.strictEqual(byId.b3.contentUpdatedAt, 999, '바꾼 번호가 서버에서 이기게 수정 시각을 올린다');
    assert.deepStrictEqual(changes.map((c) => c.from + '→' + c.to), ['NO.03→NO.05', 'NO.04→NO.06']);
    assert.strictEqual(api.describeChanges(changes), '결함 NO.03→NO.05 · 결함 NO.04→NO.06');

    // A가 다시 동기화하면(B가 올린 뒤) 아무것도 안 바뀐다 — 서로 번호를 주고받으며 계속 바꾸지 않는다
    const again = clone(merged);
    assert.deepStrictEqual(api.resolveDefectNoConflicts(again, [], new Set(again.map((d) => d.id)), 1000), []);
}

// ---- 겹치지 않으면 손대지 않음, CAD 번호는 절대 안 바꿈 ----
{
    const floor = [
        { id: 'c5', no: 'NO.05', isCadImported: true },           // 서버에 없지만 CAD 번호
        { id: 'n5', no: 'NO.05', groupId: 'n5', groupNo: 'NO.05' }, // 서버에 있던 것
        { id: 'n7', no: 'NO.07', groupId: 'n7', groupNo: 'NO.07' }  // 새 것, 안 겹침
    ];
    const changes = api.resolveDefectNoConflicts(floor, [], new Set(['n5']), 1);
    assert.deepStrictEqual(changes, []);
    assert.deepStrictEqual(floor.map((d) => d.no), ['NO.05', 'NO.05', 'NO.07'], 'CAD·서버 번호끼리 겹친 건 이 기능이 고칠 일이 아니다');
}

// ---- 번호 없는 화살표·묶음 없는 꼬리 번호는 칸으로 안 센다 ----
{
    const floor = [
        { id: 's1', no: 'NO.01', groupId: 's1', groupNo: 'NO.01' },
        { id: 'arrow', no: '' },
        { id: 'legacy', no: 'NO.01-1' }
    ];
    assert.deepStrictEqual(api.resolveDefectNoConflicts(floor, [], new Set(['s1']), 1), []);
}

// ---- 외부 입면: 다른 외부 도면의 번호와도 겹치면 옮긴다 ----
{
    const floor = [{ id: 'e2', no: 'NO.02', groupId: 'e2', groupNo: 'NO.02' }];
    const otherExt = [{ id: 'x2', no: 'NO.02', groupId: 'x2', groupNo: 'NO.02' }, { id: 'x9', no: 'NO.09', groupId: 'x9', groupNo: 'NO.09' }];
    const changes = api.resolveDefectNoConflicts(floor, otherExt, new Set(), 1);
    assert.strictEqual(floor[0].no, 'NO.10');
    assert.strictEqual(changes.length, 1);
}

// ---- 비파괴: 분류별·건물 전체 번호 공간 ----
{
    const floor = [
        { id: 'na', category: '강도', no: 'NO.02' },   // 서버에 있던 것
        { id: 'nb', category: '강도', no: 'NO.02' },   // B가 오프라인에서 만든 것
        { id: 'nc', category: '탄산화', no: 'NO.02' }  // 분류가 달라 안 겹침
    ];
    const otherFloors = [{ id: 'o1', category: '강도', no: 'NO.04' }];
    const changes = api.resolveRecordNoConflicts(floor, otherFloors, new Set(['na']), { field: 'no', kind: 'ndt', now: 5 });
    assert.deepStrictEqual(floor.map((r) => r.no), ['NO.02', 'NO.05', 'NO.02'], '건물 전체 강도 최대 NO.04 다음');
    assert.strictEqual(floor[1].updatedAt, 5);
    assert.strictEqual(api.describeChanges(changes), '강도 NO.02→NO.05');
}

// ---- 부동침하·부재처짐 구역 ----
{
    const floor = [
        { id: 'g1', groupNo: 'NO.01' },                      // 옛 구역(분류 없음 = 부동침하), 서버에 있음
        { id: 'g2', groupNo: 'NO.01', category: '변위' },     // 새로 만든 부동침하
        { id: 'g3', groupNo: 'NO.01', category: '부재변위' }  // 부재처짐은 따로 셈
    ];
    const changes = api.resolveRecordNoConflicts(floor, [], new Set(['g1']), {
        field: 'groupNo', kind: 'group', now: 1, categoryOf: (g) => (g.category === '부재변위' ? '부재변위' : '변위')
    });
    assert.deepStrictEqual(floor.map((g) => g.groupNo), ['NO.01', 'NO.02', 'NO.01']);
    assert.strictEqual(api.describeChanges(changes), '부동침하 구역 NO.01→NO.02');
}

// ---- 앱 연결: 층 동기화 병합 직후에 부르고, 모듈을 앱보다 먼저 읽는다 ----
{
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    const at = app.indexOf('function mergeFloorBundleIntoState(');
    const body = app.slice(at, app.indexOf('\n    }\n', at));
    assert.ok(/resolveOfflineNoConflicts\(bldg, floorCode, markings, ndt\);\s*$/.test(body), '병합이 모두 끝난 뒤 마지막에');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(html.indexOf('js/core/no-conflict.js') > 0 && html.indexOf('js/core/no-conflict.js') < html.indexOf('src="app.js'));
}

console.log('test-no-conflict: ok');
