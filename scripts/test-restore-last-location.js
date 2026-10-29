#!/usr/bin/env node
'use strict';

/**
 * 마지막 작업 위치 기억·복원 (js/core/last-location.js + app.js 연결).
 * 2026-10-28 사용자 요청: 새 버전으로 새로고침돼도 하던 현장·회차(건물)·층으로 바로 접속.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const LL = require(path.join(root, 'js', 'core', 'last-location.js'));
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function memStorage() {
    const m = {};
    return {
        m,
        getItem: (k) => (k in m ? m[k] : null),
        setItem: (k, v) => { m[k] = String(v); },
        removeItem: (k) => { delete m[k]; }
    };
}
const ctx = (extra) => Object.assign({ uid: 'u1', companyId: 'c1', buildingId: 'b1', floor: '2F', tab: 'tab-map' }, extra);

// 1) 저장·읽기: 계정+회사별 키, 홈·빈 값은 저장하지 않는다
(function saveLoad() {
    const st = memStorage();
    assert.strictEqual(LL.save(st, ctx()), true);
    assert.deepStrictEqual(Object.keys(st.m), [LL.keyOf('u1', 'c1')]);
    const loc = LL.load(st, 'u1', 'c1');
    assert.strictEqual(loc.buildingId, 'b1');
    assert.strictEqual(loc.floor, '2F');
    assert.strictEqual(loc.tab, 'tab-map');
    assert.ok(loc.savedAt > 0);
    // 같은 값이면 다시 쓰지 않는다(저장이 잦아도 localStorage를 덜 건드림)
    assert.strictEqual(LL.save(st, ctx()), false);
    assert.strictEqual(LL.save(st, ctx({ floor: '3F' })), true);
    assert.strictEqual(LL.load(st, 'u1', 'c1').floor, '3F');
    // 홈·건물 없음·계정 없음은 저장 안 함
    const st2 = memStorage();
    assert.strictEqual(LL.save(st2, ctx({ tab: 'tab-home' })), false);
    assert.strictEqual(LL.save(st2, ctx({ buildingId: null })), false);
    assert.strictEqual(LL.save(st2, ctx({ uid: '' })), false);
    assert.strictEqual(LL.save(st2, ctx({ companyId: null })), false);
    assert.deepStrictEqual(Object.keys(st2.m), []);
    // 층이 없어도(도면 없는 건물) 건물·탭은 기억
    assert.strictEqual(LL.save(memStorage(), ctx({ floor: '' })), true);
})();

// 2) 다른 계정·회사는 이전 위치를 못 쓴다 / 지우면 사라진다 / 깨진 값은 무시
(function accountIsolation() {
    const st = memStorage();
    LL.save(st, ctx());
    assert.strictEqual(LL.load(st, 'u2', 'c1'), null, '다른 계정');
    assert.strictEqual(LL.load(st, 'u1', 'c2'), null, '다른 회사');
    // 키를 억지로 옮겨 놔도 값의 uid가 다르면 쓰지 않는다
    st.m[LL.keyOf('u2', 'c1')] = st.m[LL.keyOf('u1', 'c1')];
    assert.strictEqual(LL.load(st, 'u2', 'c1'), null);
    LL.clear(st, 'u1', 'c1');
    assert.strictEqual(LL.load(st, 'u1', 'c1'), null);
    // clear 뒤에는 같은 값도 다시 저장된다
    assert.strictEqual(LL.save(st, ctx()), true);
    st.m[LL.keyOf('u1', 'c1')] = '{broken';
    assert.strictEqual(LL.load(st, 'u1', 'c1'), null);
    st.m[LL.keyOf('u1', 'c1')] = JSON.stringify({ v: 99, uid: 'u1', companyId: 'c1', buildingId: 'b1', tab: 'tab-map' });
    assert.strictEqual(LL.load(st, 'u1', 'c1'), null);
    st.m[LL.keyOf('u1', 'c1')] = JSON.stringify({ v: 1, uid: 'u1', companyId: 'c1', buildingId: 'b1', tab: 'tab-evil' });
    assert.strictEqual(LL.load(st, 'u1', 'c1'), null);
    assert.strictEqual(LL.load(null, 'u1', 'c1'), null);
})();

// 3) 풀어 보기: 가능한 단계까지만
(function resolveSteps() {
    const buildings = [
        { id: 'b1', name: '1동', floorsList: [] },
        { id: 'b2', name: '2동', trashedAt: '2026-10-01' }
    ];
    const opts = {
        isTrashed: (b) => !!b.trashedAt,
        getFloorCodes: (b) => (b.id === 'b1' ? ['1F', '2F'] : ['1F'])
    };
    const loc = LL.load((() => { const s = memStorage(); LL.save(s, ctx()); return s; })(), 'u1', 'c1');
    const ok = LL.resolve(loc, buildings, opts);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ok)), { ok: true, buildingId: 'b1', floor: '2F', tab: 'tab-map', floorKept: true });
    // 층이 사라졌으면 건물까지만(floor '' = 건물의 첫 층)
    const noFloor = LL.resolve(Object.assign({}, loc, { floor: '9F' }), buildings, opts);
    assert.strictEqual(noFloor.ok, true);
    assert.strictEqual(noFloor.floor, '');
    assert.strictEqual(noFloor.floorKept, false);
    // 건물이 없거나 휴지통이면 홈으로
    assert.deepStrictEqual(LL.resolve(Object.assign({}, loc, { buildingId: 'zzz' }), buildings, opts), { ok: false, reason: 'building-missing' });
    assert.deepStrictEqual(LL.resolve(Object.assign({}, loc, { buildingId: 'b2' }), buildings, opts), { ok: false, reason: 'building-trashed' });
    assert.strictEqual(LL.resolve(null, buildings, opts).ok, false);
    assert.strictEqual(LL.resolve(loc, null, opts).ok, false);
})();

// 4) 연결: 홈으로 나가면 지움, 로그인 직후 1회 복원, 로그아웃 때 지움, 층 바뀔 때 기록
(function wiring() {
    assert.ok(htmlSrc.includes('js/core/last-location.js'), 'index.html이 모듈을 싣는다');
    assert.ok(htmlSrc.indexOf('js/core/last-location.js') < htmlSrc.indexOf('src="app.js'), '모듈이 app.js보다 먼저');
    assert.ok(/if \(targetTabId === 'tab-home'\) clearLastLocation\(\);\s*else recordLastLocation\(\);/.test(appSrc), '홈으로 나가면 기록을 지운다');
    assert.ok(appSrc.includes('window.BSA.lastLocUi.tryRestore(profile)'), '로그인 직후 복원을 시도한다');
    assert.ok(appSrc.includes('window._lastLocRestoreDone'), '복원은 페이지 로드당 한 번');
    assert.ok(/state\.currentFloor = floorCode;\s*recordLastLocation\(\);/.test(appSrc), '층을 바꾸면 기록');
    assert.ok(appSrc.includes('lastLocUi.clear(window.state.uid, window.state.companyId)'), '로그아웃하면 지운다');
    // 기록은 복원 시도가 끝난 뒤부터(부팅 중 홈 이동이 기록을 지우지 않게)
    assert.ok(appSrc.includes('let _lastLocTracking = false;'));
    assert.ok(appSrc.includes('lastLocUi.enableTracking()'));
    // 복원이 서버를 따로 읽지 않는다: 로컬 state.buildings와 selectBuildingAndInspect만 쓴다
    const fnStart = appSrc.indexOf('async function tryRestoreLastLocation');
    const fnBody = appSrc.slice(fnStart, appSrc.indexOf('window.BSA.lastLocUi = {', fnStart));
    assert.ok(!/\.collection\(|\.get\(\)|firestore|fetch\(/.test(fnBody), '복원에서 서버를 직접 읽으면 안 된다');
    assert.ok(fnBody.includes('window.selectBuildingAndInspect(r.buildingId)'));
})();

console.log('test-restore-last-location OK');
