#!/usr/bin/env node
'use strict';
/**
 * 2026-10-19 회사 공통 설정 칸별 병합 — 두 기기(A 오프라인, B 온라인)가 같은 회사 설정을 바꿀 때 서로 덮어쓰지 않는다.
 * 「오프라인 모드가 실행 중이면 온라인 데이터를 이기나?」 → 바꾼 칸만 이긴다(같은 칸이면 더 나중에 바꾼 쪽).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const csm = require(path.join(root, 'js', 'core', 'company-settings-merge.js'));

const clone = (v) => JSON.parse(JSON.stringify(v));

/** 가짜 서버 문서: set(merge) 없이 칸별 update만 흉내(FieldPath = 배열) */
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

/** 기기 하나: 설정 state + 기록(store) */
function makeDevice(server) {
    const dev = { state: {}, store: null };
    dev.receive = (now) => {
        if (!dev.store) dev.store = csm.initStore(csm.flatten(dev.state));
        const inc = csm.applyIncoming(dev.store, dev.state, server.snapshot(), now);
        Object.keys(inc.values).forEach((k) => { if (inc.values[k] === undefined) delete dev.state[k]; else dev.state[k] = inc.values[k]; });
        return inc;
    };
    dev.track = (now) => csm.trackLocal(dev.store, csm.flatten(dev.state), now);
    dev.sync = (now) => {
        dev.track(now);
        const plan = csm.planWrite(dev.store, csm.flatten(dev.state), server.snapshot());
        plan.adopt.forEach((a) => csm.setPath(dev.state, a.key, a.sub, a.value));
        csm.afterAdopt(dev.store, plan.adopt);
        if (plan.writes.length) server.update(csm.buildUpdateArgs(plan.writes, mk, del));
        csm.afterWrite(dev.store, plan.writes);
        return plan;
    };
    return dev;
}

const base = {
    floorGridLines: { 'b1_1F': { x: [1] }, 'b1_2F': { x: [2] } },
    styleColors: { crack: '#f00', leak: '#00f' },
    defectLeaderLineScale: 1,
    floorPrintCrops: { 'b1_1F': { nx: 0.1 } }
};

// 1) 다른 칸: A(오프라인)는 1F 격자선, B(온라인)는 2F 격자선 — 둘 다 남는다
{
    const server = makeServer(base);
    const A = makeDevice(server);
    const B = makeDevice(server);
    A.receive(10); B.receive(10);
    assert.deepStrictEqual(A.sync(11).writes, [], '받기만 한 기기는 쓸 것이 없다');
    // A 오프라인 수정
    A.state.floorGridLines['b1_1F'] = { x: [1, 5] };
    A.track(100);
    // B 온라인 수정 + 올림
    B.state.floorGridLines['b1_2F'] = { x: [2, 9] };
    B.state.styleColors.leak = '#0f0';
    const bw = B.sync(200);
    assert.deepStrictEqual(bw.writes.map((w) => w.path).sort(), ['floorGridLines/b1_2F', 'styleColors/leak']);
    // A 다시 연결: 먼저 올리고(바꾼 칸만) → 그 다음 받기
    const aw = A.sync(300);
    assert.deepStrictEqual(aw.writes.map((w) => w.path), ['floorGridLines/b1_1F'], 'A는 자기가 바꾼 칸만 쓴다');
    assert.deepStrictEqual(server.doc.floorGridLines, { 'b1_1F': { x: [1, 5] }, 'b1_2F': { x: [2, 9] } }, '서버에 둘 다');
    assert.strictEqual(server.doc.styleColors.leak, '#0f0', 'A의 옛 leak 색이 B의 새 색을 덮지 않음');
    A.receive(301);
    assert.deepStrictEqual(A.state.floorGridLines['b1_2F'], { x: [2, 9] }, 'A도 B의 2F를 받음');
    assert.strictEqual(A.state.styleColors.leak, '#0f0');
    B.receive(302);
    assert.deepStrictEqual(B.state.floorGridLines['b1_1F'], { x: [1, 5] }, 'B도 A의 1F를 받음');
}

// 2) 같은 칸: 더 나중에 바꾼 쪽이 이긴다(오프라인 기기라고 무조건 이기지 않음)
{
    const server = makeServer(base);
    const A = makeDevice(server);
    const B = makeDevice(server);
    A.receive(10); B.receive(10);
    A.state.styleColors.crack = '#111'; A.track(100);      // A 오프라인에서 먼저
    B.state.styleColors.crack = '#222'; B.sync(200);       // B가 나중에 바꾸고 올림
    const plan = A.sync(300);                              // A가 늦게 연결
    assert.deepStrictEqual(plan.writes, [], 'A의 옛 수정은 쓰지 않음');
    assert.deepStrictEqual(plan.adopt.map((a) => a.path), ['styleColors/crack']);
    assert.strictEqual(A.state.styleColors.crack, '#222', 'A는 B의 나중 값을 따른다');
    assert.strictEqual(server.doc.styleColors.crack, '#222');
    assert.deepStrictEqual(Object.keys(A.store.dirty), [], '올릴 칸 없음');
    // 반대: A가 더 나중
    A.state.styleColors.crack = '#333'; A.track(500);
    A.sync(501);
    assert.strictEqual(server.doc.styleColors.crack, '#333');
    B.receive(502);
    assert.strictEqual(B.state.styleColors.crack, '#333');
}

// 3) 받을 때: 아직 안 올린 내 칸은 남고, 나머지는 서버 값(통째로 덮지 않음)
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    A.state.floorGridLines['b1_1F'] = { x: [7] };
    A.track(20);
    server.doc.floorGridLines['b1_2F'] = { x: [8] };
    server.doc.settingsAt = { 'floorGridLines/b1_2F': 25 };
    A.receive(30);
    assert.deepStrictEqual(A.state.floorGridLines, { 'b1_1F': { x: [7] }, 'b1_2F': { x: [8] } });
    assert.deepStrictEqual(Object.keys(A.store.dirty), ['floorGridLines/b1_1F'], '내 칸은 아직 올릴 칸');
}

// 4) 방금 쓴 칸을 쓰기 전 스냅샷(옛 값)이 되돌리지 않고, 되돌린 값을 다시 올리지도 않는다
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    const before = server.snapshot();          // 리스너가 들고 있던 쓰기 전 스냅샷
    A.state.defectLeaderLineScale = 1.5;
    A.sync(100);
    assert.strictEqual(server.doc.defectLeaderLineScale, 1.5);
    const inc = A.receive.call(null, 101);     // 지금 서버(최신)
    void inc;
    // 옛 스냅샷이 늦게 들어옴
    const old = csm.applyIncoming(A.store, A.state, before, 102);
    Object.keys(old.values).forEach((k) => { A.state[k] = old.values[k]; });
    assert.strictEqual(A.state.defectLeaderLineScale, 1.5, '옛 스냅샷이 내 새 값을 되돌리지 않음');
    assert.deepStrictEqual(Object.keys(A.store.dirty), [], '되돌린 값을 올릴 칸으로 적지 않음');
}

// 5) 아직 못 받은 기기(설정 없음)는 남의 설정을 지우지 않는다 · 서버에 없는 설정은 채운다
{
    const server = makeServer({ styleColors: { crack: '#f00' }, floorPrintCrops: { 'b1_1F': { nx: 0.2 } } });
    const C = makeDevice(server);
    C.state = { styleShapes: { crack: 'circle' } };     // 서버에 없는 설정만 들고 있음
    C.receive(10);
    const plan = C.sync(11);
    assert.deepStrictEqual(plan.writes.map((w) => w.path), ['styleShapes/crack'], '서버에 없는 설정은 올려서 채운다');
    assert.deepStrictEqual(server.doc.floorPrintCrops, { 'b1_1F': { nx: 0.2 } }, '출력 범위는 그대로');
    assert.strictEqual(C.state.styleColors.crack, '#f00');
}

// 6) 칸 지우기(맵 키 삭제)도 칸 하나로
{
    const server = makeServer(base);
    const A = makeDevice(server);
    A.receive(10);
    delete A.state.floorGridLines['b1_2F'];
    const plan = A.sync(50);
    assert.deepStrictEqual(plan.writes.map((w) => [w.path, w.value]), [['floorGridLines/b1_2F', undefined]]);
    assert.deepStrictEqual(Object.keys(server.doc.floorGridLines), ['b1_1F']);
    assert.strictEqual(server.doc.settingsAt['floorGridLines/b1_2F'], 50, '지운 시각도 남긴다(옛 기기가 되살리지 않게)');
}

// --- app.js 연결 ---
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/js\/core\/company-settings-merge\.js\?v=/.test(index), 'index.html이 모듈을 부른다');
assert.ok(index.indexOf('js/core/company-settings-merge.js') < index.indexOf('src="app.js'), 'app.js보다 먼저');
assert.ok(/if \(csPerKey\) companySettingsApi\(\)\.KEYS\.forEach\(\(k\) => \{ delete dataToSync\[k\]; \}\);/.test(app), '설정은 통째로 쓰지 않음');
assert.ok(/await docRef\.set\(dataToSync, \{ merge: true \}\);\n\s+if \(csPerKey\) await writeCompanySettingsPerKey\(docRef, rootGuardData\);/.test(app), '바뀐 칸만 경로 지정으로');
assert.ok(/rootGuardData = guardData;/.test(app), '쓰기 직전 서버에서 읽은 문서로 칸 시각 비교');
assert.ok(/await docRef\.update\(\.\.\.args\);/.test(app));
assert.ok(/const inc = csApi\.applyIncoming\(csStore, window\.state, data, bsaSyncNow\(\)\);/.test(app), '받을 때 칸별');
assert.ok(/trackCompanySettingsLocal\(\); \} catch/.test(app), '기기 저장 때 바뀐 칸 적기');
assert.ok(/window\.bsaCompanySettingsPending\(\)\.length\) \{\n\s+scheduleSyncToFirebase\(\{ skipMarkCurrent: true \}\);/.test(app), '다시 연결: 설정 칸만 남아도 올린다');

console.log('test-company-settings-merge: ok');
