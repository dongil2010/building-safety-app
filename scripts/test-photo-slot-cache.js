#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 GPT 감사 6번 — 사진은 기기에 자리 번호(결함id_0, _1 …)로 캐시된다.
 * 다른 기기가 가운데 사진(B)을 지워 A·B·C → A·C가 되면 C가 _1 자리로 당겨지는데,
 * 이 기기 캐시의 _1에는 예전 B가 남아 "지운 사진이 C 자리에" 보였다.
 * 병합에서 서버 목록이 이길 때(서버가 더 나중에 사진을 바꿈) 병합 전에 그 결함의 캐시를 비운다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const syncMerge = require(path.join(root, 'js', 'core', 'sync-merge.js'));

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

function makeDevice(cache, idb) {
    const ctx = {
        window: { BSA: { syncMerge }, _photoCache: cache },
        console: { info() {}, warn() {} },
        Map, Set, Number, Array, Math,
        _idbPhotoWriteGen: new Map(),
        _idbPendingPhotoKeys: new Set(),
        _idbPersistedPhotoKeys: new Set(Object.keys(idb)),
        _cloudPhotoFetchAttempted: new Set(Object.keys(idb)),
        _nonExistentPhotoIds: new Set(['d1_2']),
        idbDelete: (store, key) => { assert.strictEqual(store, 'photos'); delete idb[key]; },
        getPhotoDocId: (id, i, kind) => (kind === 'prev' ? `${id}_prev_${i}` : `${id}_${i}`)
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction('function dropStaleDefectPhotoSlotCache(') + '\nthis.drop = dropStaleDefectPhotoSlotCache;', ctx);
    return ctx;
}

const URL_A = 'https://x/a', URL_C_NEW = 'https://x/c-at-slot1';
const IMG_A = 'data:image/jpeg;base64,AAAA', IMG_B = 'data:image/jpeg;base64,BBBB', IMG_C = 'data:image/jpeg;base64,CCCC';

function scenario(serverStamp, localStamp) {
    // 이 기기: 사진 A·B·C (캐시·IndexedDB 모두 자리 번호)
    const cache = { d1_0: IMG_A, d1_1: IMG_B, d1_2: IMG_C, other_0: 'keep' };
    const idb = { d1_0: IMG_A, d1_1: IMG_B, d1_2: IMG_C, other_0: 'keep' };
    const local = { id: 'd1', photoIds: ['d1_0', 'd1_1', 'd1_2'], photos: [IMG_A, IMG_B, IMG_C], photosUpdatedAt: localStamp };
    // 다른 기기: B를 지워 A·C → C가 _1로 당겨져 올라감
    const server = { id: 'd1', photoIds: ['d1_0', 'd1_1'], photoUrls: [URL_A, URL_C_NEW], photosUpdatedAt: serverStamp };
    const dev = makeDevice(cache, idb);
    const dropped = dev.drop({ F1: [server] }, { F1: [local], F2: [{ id: 'other', photoIds: ['other_0'] }] });
    const merged = syncMerge.mergeDefectRecord(server, local, cache);
    return { cache, idb, merged, dropped, dev };
}

// 1) 다른 기기가 더 나중에 사진을 바꿈 → 캐시 비우고, 병합 결과 _1 자리는 새 C 주소(옛 B 아님)
{
    const r = scenario(2000, 1000);
    assert.strictEqual(r.dropped, 1);
    ['d1_0', 'd1_1', 'd1_2'].forEach((k) => {
        assert.ok(!(k in r.cache), k + ' 메모리 캐시를 비워야 한다');
        assert.ok(!(k in r.idb), k + ' IndexedDB를 비워야 한다');
    });
    assert.ok(!r.dev._cloudPhotoFetchAttempted.has('d1_1'), '이미 받은 번호도 다시 받게 해야 한다');
    assert.ok(!r.dev._nonExistentPhotoIds.has('d1_2'));
    assert.ok(r.dev._cloudPhotoFetchAttempted.has('other_0'));
    assert.strictEqual(r.cache.other_0, 'keep', '다른 결함 캐시는 그대로');
    assert.strictEqual(r.idb.other_0, 'keep');
    assert.deepStrictEqual(r.merged.photoIds, ['d1_0', 'd1_1']);
    const shown = (r.merged.photos || []).map((p, i) => p || (r.merged.photoUrls || [])[i]);
    assert.ok(!shown.includes(IMG_B), '지운 사진 B가 보이면 안 된다');
    assert.strictEqual(shown[1], URL_C_NEW, '_1 자리는 새로 올라간 C');
}

// 2) 화면용 사진 불러오기는 photoIds 자리마다 메모리 캐시 → IndexedDB → 클라우드 순으로 보고,
//    그 결과가 병합 주소보다 우선한다(hydrate: curSrc = 병합 사진/주소 위에 불러온 사진을 덮음).
//    비우지 않으면 _1 자리에 지운 B가, 비우면 새 C 주소가 보인다.
function shownAfterHydrate(r) {
    const loaded = r.merged.photoIds.map((pid) => r.cache[pid] || r.idb[pid] || null);
    return r.merged.photoIds.map((pid, i) => loaded[i] || (r.merged.photos || [])[i] || (r.merged.photoUrls || [])[i]);
}
{
    const fixed = scenario(2000, 1000);
    assert.deepStrictEqual(shownAfterHydrate(fixed), [URL_A, URL_C_NEW], '비운 뒤에는 새 목록대로');
    const old = scenario(2000, 1000);
    old.cache.d1_1 = IMG_B; // 비우기 전 상태(옛 동작) 재현
    assert.strictEqual(shownAfterHydrate(old)[1], IMG_B, '(재현) 캐시가 남으면 _1에 지운 B가 보인다');
}

// 3) 이 기기가 더 나중에 바꿈 / 같은 시각 / 옛 데이터(시각 없음) → 건드리지 않는다
[[1000, 2000], [2000, 2000], [0, 0]].forEach(([sp, lp]) => {
    const r = scenario(sp, lp);
    assert.strictEqual(r.dropped, 0, `server ${sp} / local ${lp} 에서는 캐시를 비우면 안 된다`);
    assert.strictEqual(r.cache.d1_1, IMG_B);
    assert.strictEqual(r.idb.d1_1, IMG_B);
});

// 4) 연결: 병합 wrapper가 병합 전에 부른다
const wrapper = extractFunction('function mergeDefectsMaps(');
assert.ok(wrapper.indexOf('dropStaleDefectPhotoSlotCache(serverMap, localMap)') >= 0
    && wrapper.indexOf('dropStaleDefectPhotoSlotCache(serverMap, localMap)') < wrapper.indexOf('window.BSA.syncMerge.mergeDefectsMaps('),
    '병합 전에 캐시를 비워야 병합이 옛 캐시를 쓰지 않는다');

console.log('test-photo-slot-cache: ok');
