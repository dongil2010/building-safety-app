#!/usr/bin/env node
'use strict';
/**
 * 2026-11-09 층별 설정 대량 삭제 보류 (js/core/company-settings-merge.js holdMassDeletes).
 * 11-06 18:00:33 53개 건물 행·열(floorGridLines)이 한 시각에 지워진 사고: 기기의 층별 설정 맵이 비면
 * 「기준엔 있는데 기기에 없는 칸」이 전부 삭제로 올라갔다. 이제 그런 쓰기는 막고 기기를 서버 값으로 되돌린다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const csm = require(path.join(root, 'js', 'core', 'company-settings-merge.js'));

const clone = (v) => JSON.parse(JSON.stringify(v));

function makeServer(initial) {
    const doc = clone(initial);
    return {
        doc,
        update(args) {
            for (let i = 0; i < args.length; i += 2) {
                const p = args[i];
                const v = args[i + 1];
                let o = doc;
                for (let k = 0; k < p.length - 1; k++) {
                    if (!o[p[k]] || typeof o[p[k]] !== 'object') o[p[k]] = {};
                    o = o[p[k]];
                }
                if (v === '__DEL__') delete o[p[p.length - 1]];
                else o[p[p.length - 1]] = clone(v);
            }
        },
        snapshot() { return clone(doc); }
    };
}
const mk = (a, b) => (b === undefined ? [a] : [a, b]);
const del = () => '__DEL__';

/** app/16-backup-auth-init.js writeCompanySettingsPerKey와 같은 순서(보류 → 서버 값 따르기 → 쓰기) */
function makeDevice(server) {
    const dev = { state: {}, store: null, held: [] };
    dev.receive = (now) => {
        if (!dev.store) dev.store = csm.initStore(csm.flatten(dev.state));
        const inc = csm.applyIncoming(dev.store, dev.state, server.snapshot(), now);
        Object.keys(inc.values).forEach((k) => { if (inc.values[k] === undefined) delete dev.state[k]; else dev.state[k] = inc.values[k]; });
        return inc;
    };
    dev.sync = (now) => {
        csm.trackLocal(dev.store, csm.flatten(dev.state), now);
        const serverData = server.snapshot();
        const plan = csm.planWrite(dev.store, csm.flatten(dev.state), serverData);
        const guard = csm.holdMassDeletes(plan, serverData);
        dev.held = guard.held;
        if (guard.held.length) {
            plan.writes = guard.writes;
            guard.held.forEach((h) => csm.setPath(dev.state, h.key, h.sub, h.value));
            csm.afterHold(dev.store, guard.held);
            csm.trackLocal(dev.store, csm.flatten(dev.state), now);   // 앱은 되돌린 뒤 기기 저장 → 추적이 한 번 더 돈다
        }
        plan.adopt.forEach((a) => csm.setPath(dev.state, a.key, a.sub, a.value));
        csm.afterAdopt(dev.store, plan.adopt);
        if (plan.writes.length) server.update(csm.buildUpdateArgs(plan.writes, mk, del));
        csm.afterWrite(dev.store, plan.writes);
        return plan;
    };
    return dev;
}

const grids = {
    'b1_1F': { groups: [{ axis: 'x', lines: [1] }] },
    'b1_2F': { groups: [{ axis: 'x', lines: [2] }] },
    'b2_1F': { groups: [{ axis: 'y', lines: [3] }] },
    'b3_B1F': { groups: [{ axis: 'y', lines: [4] }] }
};
const base = {
    floorGridLines: grids,
    floorPrintCrops: { 'b1_1F': { nx: 0.1 }, 'b1_2F': { nx: 0.2 } },
    customDefectTypes: { 구조체: ['a'], 비구조체: ['b'], 마감재: ['c'], 기타: ['d'] },
    settingsAt: {}
};

// 1) 기기의 행·열이 통째로 빈 맵이 됨(11-06 모양) → 서버는 그대로, 기기는 서버 값으로 돌아옴
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    A.state.floorGridLines = {};
    A.sync(100);
    assert.strictEqual(A.held.length, 4, '네 층 삭제를 모두 막음');
    assert.deepStrictEqual(server.doc.floorGridLines, grids, '서버 행·열 그대로');
    assert.ok(!Object.keys(server.doc.settingsAt || {}).some((p) => p.startsWith('floorGridLines/')), '삭제 도장도 안 찍힘');
    assert.deepStrictEqual(A.state.floorGridLines, grids, '기기도 서버 값으로 되돌림');
    assert.deepStrictEqual(Object.keys(A.store.dirty), [], '올릴 칸이 남지 않음');
    const again = A.sync(200);
    assert.deepStrictEqual(again.writes, [], '다음 동기화에도 쓸 것 없음');
    assert.strictEqual(A.held.length, 0);
    // 다른 기기는 아무 영향 없음
    const B = makeDevice(server);
    B.receive(300);
    assert.deepStrictEqual(B.state.floorGridLines, grids);
}

// 2) 맵이 null이 됨 → 맵 전체를 null로 쓰는 것도 막음(서버의 층 설정 전부가 사라질 쓰기)
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    A.state.floorGridLines = null;
    const plan = A.sync(100);
    assert.ok(A.held.some((h) => h.path === 'floorGridLines' && h.wipe), '맵 전체 쓰기를 막음');
    assert.ok(!plan.writes.some((w) => w.key === 'floorGridLines'), '행·열 쓰기는 하나도 안 나감');
    assert.deepStrictEqual(server.doc.floorGridLines, grids, '서버 그대로');
    assert.deepStrictEqual(A.state.floorGridLines, grids, '기기 되돌림');
    const again = A.sync(200);
    assert.deepStrictEqual(again.writes, [], '되돌린 뒤 맵 칸이 다시 삭제로 잡히지 않음');
}

// 3) 층이 둘뿐인 설정이 null이 돼도 같이 막음(칸 삭제가 기준 개수 아래여도)
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    A.state.floorPrintCrops = null;
    A.sync(100);
    assert.deepStrictEqual(server.doc.floorPrintCrops, base.floorPrintCrops, '출력 범위 그대로');
    assert.deepStrictEqual(A.state.floorPrintCrops, base.floorPrintCrops);
    assert.deepStrictEqual(A.sync(200).writes, []);
}

// 4) 한두 층 지우기는 그대로 올라감(화면에서 한 층씩 지우는 정상 동작)
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    delete A.state.floorGridLines['b1_2F'];
    delete A.state.floorGridLines['b2_1F'];
    const plan = A.sync(100);
    assert.strictEqual(A.held.length, 0);
    assert.deepStrictEqual(plan.writes.map((w) => w.path).sort(), ['floorGridLines/b1_2F', 'floorGridLines/b2_1F']);
    assert.deepStrictEqual(Object.keys(server.doc.floorGridLines).sort(), ['b1_1F', 'b3_B1F']);
}

// 5) 서버에 이미 없는 칸을 지우는 건 세지 않음(지울 것이 없으니 사고 아님)
{
    const plan = {
        writes: ['b9_1F', 'b9_2F', 'b9_3F'].map((s) => ({ path: `floorGridLines/${s}`, key: 'floorGridLines', sub: s, value: undefined, at: 5 })),
        adopt: []
    };
    const g = csm.holdMassDeletes(plan, clone(base));
    assert.strictEqual(g.held.length, 0);
    assert.strictEqual(g.writes.length, 3);
}

// 6) 부재·결함 프리셋 「앱 기본 세팅으로 복원」처럼 일부러 여러 칸을 지우는 설정은 대상이 아님
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    A.state.customDefectTypes = {};
    A.sync(100);
    assert.strictEqual(A.held.length, 0);
    assert.deepStrictEqual(server.doc.customDefectTypes, {}, '프리셋 복원은 그대로 올라감');
}

// 7) 기준 개수(3)와 대상 설정
assert.strictEqual(csm.MASS_DELETE_LIMIT, 3);
['grids', 'floorGridLines', 'floorPrintCrops', 'floorDrawingRotations', 'floorDrawingDarken', 'floorMapStyleSettings']
    .forEach((k) => assert.ok(csm.MASS_DELETE_KEYS.includes(k), k));
assert.ok(!csm.MASS_DELETE_KEYS.includes('customDefectTypes'));

// --- app.js 연결 ---
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const i = app.indexOf('async function writeCompanySettingsPerKey(');
assert.ok(i > 0);
const body = app.slice(i, app.indexOf('async function applyMergedRemoteData(', i));
const at = (s) => body.indexOf(s);
assert.ok(at('api.holdMassDeletes(plan, serverData || {})') > at('api.planWrite('), '계획 뒤에 보류 검사');
assert.ok(at('plan.writes = guard.writes;') > 0, '막은 쓰기는 빠짐');
assert.ok(at('api.setPath(window.state, h.key, h.sub, h.value)') > 0, '기기를 서버 값으로 되돌림');
assert.ok(at('api.afterHold(store, guard.held)') > 0);
assert.ok(at('api.holdMassDeletes(') < at('await docRef.update(...args)'), '쓰기 전에 막음');
assert.ok(at('api.holdMassDeletes(') < at('buildingMetaCol(docRef).doc(id).set(patch'), '건물 문서 쓰기 전에도 막음');

console.log('test-settings-mass-delete-guard: ok');
