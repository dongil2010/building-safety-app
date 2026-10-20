'use strict';
// 2026-10-20 「서버에 올리는 중 172/176」이 안 사라짐 — 두 원인 재현
//  1) 목록에 없는 유령 건물(현장명 없이 도면만 올라간 bldg-…_B1F) 층이 「올릴 것」에 남아 매번 건너뜀
//  2) 「올릴 것」에서 빠졌는데 서버 확인(confirmFloor)이 없던 층(빈 층 묶음 등)이 전체에만 남아 숫자가 끝까지 안 참
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const G = require(path.join(root, 'js', 'core', 'floor-sync-guard.js'));
const SP = require(path.join(root, 'js', 'core', 'sync-progress.js'));

// --- 1) 고아 층 키 ---
const buildings = [{ id: 'bldg-1' }, { id: 'bldg-12' }, { id: 'bldg-new', _pendingCloudSync: true }, { id: 'bldg-gone' }];
const dirty = [
    'bldg-1_1F', 'bldg-12_B1F', 'bldg-new_2F',
    'bldg-1791954528098_B1F',   // 사고 건물: 서버 목록에도 업로드 대기에도 없음
    'bldg-gone_3F',             // 삭제된 건물
    'bldg-12x_1F'               // bldg-12와 앞부분만 겹치는 다른 건물(없음)
];
assert.deepStrictEqual(
    G.orphanDirtyFloorKeys(dirty, buildings, ['bldg-gone']).sort(),
    ['bldg-12x_1F', 'bldg-1791954528098_B1F', 'bldg-gone_3F']
);
// 가장 긴 id로 찾는다: bldg-1_… 이 bldg-12 층으로 오인되지 않고, bldg-12_… 는 bldg-1이 삭제돼도 살아 있다
assert.deepStrictEqual(G.orphanDirtyFloorKeys(['bldg-12_1F'], buildings, ['bldg-1']), []);
assert.deepStrictEqual(G.orphanDirtyFloorKeys(['bldg-1_1F'], buildings, ['bldg-1']), ['bldg-1_1F']);
assert.deepStrictEqual(G.orphanDirtyFloorKeys([], buildings, []), []);
assert.deepStrictEqual(G.orphanDirtyFloorKeys(['a_1F'], null, null), ['a_1F']);

// app.js가 서버 목록을 받았을 때만 지우는지(소스 확인)
const fs = require('fs');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const at = appSrc.indexOf('floorSyncGuard.orphanDirtyFloorKeys(');
assert.ok(at > 0, 'app.js 동기화에서 고아 층 정리를 부른다');
const before = appSrc.slice(at - 600, at);
assert.ok(/Array\.isArray\(serverData\.buildings\) && serverData\.buildings\.length/.test(before), '서버 건물 목록을 받았을 때만');
assert.ok(at < appSrc.indexOf('pickDirtyFloorsForSyncBatch(SYNC_DIRTY_FLOOR_BATCH_MAX)', at), '배치 고르기 전에 정리');

// --- 2) 진행률: dirty에서 빠졌지만 확인 없던 층 ---
function memStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
let clock = 1000;
const t = SP.createTracker({ storage: memStorage(), storageKey: () => 'j', now: () => clock });
let d = ['b_1F', 'b_2F', 'b_3F', 'b_4F', 'ghost_B1F'];
t.startSession(d);
let s = t.summary({ dirtyFloorKeys: d, online: true, syncing: true });
assert.strictEqual(s.total, 5);
assert.strictEqual(SP.pillText(s), '서버에 올리는 중 0/5');

// 1F·2F는 정상 업로드(dirty에서 빠진 뒤 confirmFloor) — 사이에 summary가 끼어도 올라감으로 센다
d = ['b_2F', 'b_3F', 'b_4F', 'ghost_B1F'];
t.summary({ dirtyFloorKeys: d, online: true, syncing: true });   // 1F가 -1로 빠짐
t.confirmFloor('b_1F', t.mark());                               // 확인 오면 되살려 올라감
d = ['b_3F', 'b_4F', 'ghost_B1F'];
t.confirmFloor('b_2F', t.mark());
s = t.summary({ dirtyFloorKeys: d, online: true, syncing: true });
assert.strictEqual(s.done, 2);
assert.strictEqual(s.total, 5);

// 3F는 빈 층 묶음이라 확인 없이 dirty에서 빠짐 → 전체에서 빠진다(예전엔 total만 남아 2/5에서 멈춤)
d = ['b_4F', 'ghost_B1F'];
s = t.summary({ dirtyFloorKeys: d, online: true, syncing: true });
assert.strictEqual(s.total, 4, '확인 없이 빠진 층은 전체에서 뺀다');
assert.strictEqual(s.pending, 2);

// 3F를 다시 고침 → 다시 센다
d = ['b_3F', 'b_4F', 'ghost_B1F'];
s = t.summary({ dirtyFloorKeys: d, online: true, syncing: true });
assert.strictEqual(s.total, 5);
assert.strictEqual(s.pending, 3);
t.confirmFloor('b_3F', t.mark());
t.confirmFloor('b_4F', t.mark());

// 유령 건물 층: 동기화가 고아로 정리 → 진행률이 끝까지 찬다(사라지고 「모두 올라감」)
d = G.orphanDirtyFloorKeys(['ghost_B1F'], [{ id: 'b' }], []).length ? [] : ['ghost_B1F'];
s = t.summary({ dirtyFloorKeys: d, online: true, syncing: true });
assert.strictEqual(s.done, s.total, '숫자가 끝까지 찬다: ' + s.done + '/' + s.total);
assert.strictEqual(s.pending, 0);
s = t.summary({ dirtyFloorKeys: d, online: true, syncing: false });
assert.strictEqual(s.allDone, true);
assert.strictEqual(SP.pillText(s), '모두 서버에 올라감');

console.log('test-sync-orphan-floors: ok');
