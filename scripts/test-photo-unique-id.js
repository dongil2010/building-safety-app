#!/usr/bin/env node
'use strict';

/**
 * 사진 고유 ID 전환 3단계 (2026-09-27) — 새 사진은 고유 ID, 남은 사진은 ID가 안 바뀐다.
 *
 * 자리 번호(결함id_0, _1 …)일 때는 가운데 사진을 지우면 뒤 사진이 앞 번호로 이사했고,
 * IndexedDB·Firestore·Storage·캐시 중 하나라도 늦으면 다른 기기에 지운 사진이 보였다
 * (09-21 6e6fa27·1db0c51, 09-22 e30aa81). 이제 사진은 한 번 받은 ID를 끝까지 쓴다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
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

function makeCtx() {
    const log = [];
    const ctx = {
        window: { _photoCache: {}, state: { defects: {}, buildings: [] } },
        _idbPersistedPhotoKeys: new Set(),
        idbDelete: (store, key) => { log.push(['idb', key]); return Promise.resolve(true); },
        deleteCloudPhoto: (key) => { log.push(['cloud', key]); return Promise.resolve(); },
        console
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction('function getPhotoDocId('),
        extractFunction('function createDefectPhotoId('),
        extractFunction('function captureDefectPhotoPairs('),
        extractFunction('function captureDefectPhotoIdsBefore('),
        extractFunction('function assignDefectPhotoIds('),
        extractFunction('function defectPhotoIdAt('),
        extractFunction('function defectPhotoIdList('),
        extractFunction('function recordDefectPhotoState('),
        extractFunction('function syncDefectPhotoRefs('),
        extractFunction('async function pruneRemovedDefectPhotos('),
        extractFunction('function findBuildingIdForDefectId('),
        extractFunction('function resolveBuildingIdFromPhotoId('),
        'this.api = { getPhotoDocId, createDefectPhotoId, captureDefectPhotoIdsBefore, assignDefectPhotoIds,',
        '  syncDefectPhotoRefs, pruneRemovedDefectPhotos, resolveBuildingIdFromPhotoId };'
    ].join('\n'), ctx);
    return { api: ctx.api, ctx, log };
}

const LEGACY_CUR = /_\d+$/;
const LEGACY_PREV = /_prev_\d+$/;

(async () => {
    // --- 새 ID: 결함id_ 접두어 유지, 옛 자리 번호와 절대 안 겹침 ---
    {
        const { api } = makeCtx();
        const seen = new Set();
        for (let i = 0; i < 500; i++) {
            const cur = api.createDefectPhotoId('B1_1F_d9', undefined);
            const prev = api.createDefectPhotoId('B1_1F_d9', 'prev');
            assert.ok(cur.startsWith('B1_1F_d9_'), '접두어가 없으면 캐시 무효화가 이 사진을 못 찾는다: ' + cur);
            assert.ok(prev.startsWith('B1_1F_d9_prev_'), prev);
            assert.ok(!LEGACY_CUR.test(cur) && !LEGACY_PREV.test(prev), '옛 자리 번호와 겹친다: ' + cur + ' / ' + prev);
            assert.ok(!seen.has(cur) && !seen.has(prev), '같은 ID가 두 번 나왔다');
            seen.add(cur); seen.add(prev);
        }
    }

    // --- 가운데 사진을 지우면: 남은 사진 ID 그대로, 지운 사진만 정리 ---
    {
        const { api, log } = makeCtx();
        const d = { id: 'D', photos: ['A', 'B', 'C'], photoIds: ['D_ua', 'D_ub', 'D_uc'] };
        const before = api.captureDefectPhotoIdsBefore(d);
        d.photos = ['A', 'C'];
        api.syncDefectPhotoRefs(d, d.photos, [], before);
        assert.deepStrictEqual(Array.from(d.photoIds), ['D_ua', 'D_uc'], 'C가 B의 ID를 물려받으면 안 된다');
        await api.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
        assert.deepStrictEqual(log.filter((x) => x[0] === 'cloud').map((x) => x[1]), ['D_ub'], '지운 사진만 클라우드에서 지운다');
        assert.deepStrictEqual(log.filter((x) => x[0] === 'idb').map((x) => x[1]), ['D_ub']);
    }

    // --- 옛 자리 번호 결함도 같은 규칙: 이사하지 않고 빠진 번호만 지운다 ---
    {
        const { api, log } = makeCtx();
        const d = { id: 'D', photos: ['A', 'B', 'C'] }; // 목록 없는 옛 데이터
        const before = api.captureDefectPhotoIdsBefore(d);
        d.photos = ['A', 'C'];
        api.syncDefectPhotoRefs(d, d.photos, [], before);
        assert.deepStrictEqual(Array.from(d.photoIds), ['D_0', 'D_2'], '옛 사진도 ID가 그대로여야 한다(D_2 → D_1 이사 금지)');
        await api.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
        assert.deepStrictEqual(log.filter((x) => x[0] === 'cloud').map((x) => x[1]), ['D_1']);
    }

    // --- 사진 추가: 기존 ID 유지 + 새 사진만 새 고유 ID, 아무것도 안 지움 ---
    {
        const { api, log } = makeCtx();
        const d = { id: 'D', photos: ['A', 'B'], photoIds: ['D_0', 'D_1'] };
        const before = api.captureDefectPhotoIdsBefore(d);
        d.photos = ['A', 'B', 'N'];
        api.syncDefectPhotoRefs(d, d.photos, [], before);
        assert.strictEqual(d.photoIds[0], 'D_0');
        assert.strictEqual(d.photoIds[1], 'D_1');
        assert.ok(/^D_u[0-9a-z]+$/.test(d.photoIds[2]), '새 사진은 고유 ID: ' + d.photoIds[2]);
        await api.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
        assert.deepStrictEqual(log, []);
    }

    // --- 같은 목록으로 다시 저장(자동 저장이 연달아 돌 때): ID가 흔들리지 않는다 ---
    {
        const { api, log } = makeCtx();
        const d = { id: 'D', photos: ['A', 'N'], photoIds: ['D_0', 'D_uxyz'], prevRoundPhotos: ['P'], prevRoundPhotoIds: ['D_prev_0'] };
        for (let n = 0; n < 3; n++) {
            const before = api.captureDefectPhotoIdsBefore(d);
            d.photos = d.photos.slice();
            api.syncDefectPhotoRefs(d, d.photos, d.prevRoundPhotos, before);
            await api.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
            await api.pruneRemovedDefectPhotos(before.prev.visibleIds, d.prevRoundPhotoIds);
        }
        assert.deepStrictEqual(Array.from(d.photoIds), ['D_0', 'D_uxyz']);
        assert.deepStrictEqual(Array.from(d.prevRoundPhotoIds), ['D_prev_0']);
        assert.deepStrictEqual(log, [], '같은 목록 저장은 아무것도 지우면 안 된다');
    }

    // --- 순서 바꾸기: 사진이 자기 ID를 따라간다 ---
    {
        const { api } = makeCtx();
        const d = { id: 'D', photos: ['A', 'B', 'C'], photoIds: ['D_ua', 'D_ub', 'D_uc'] };
        const before = api.captureDefectPhotoIdsBefore(d);
        api.syncDefectPhotoRefs(d, ['C', 'A', 'B'], [], before);
        assert.deepStrictEqual(Array.from(d.photoIds), ['D_uc', 'D_ua', 'D_ub']);
    }

    // --- 그림을 그려 넣은 사진(URL이 바뀜)은 새 ID, 옛 그림 ID는 정리 ---
    {
        const { api, log } = makeCtx();
        const d = { id: 'D', photos: ['A', 'B'], photoIds: ['D_ua', 'D_ub'] };
        const before = api.captureDefectPhotoIdsBefore(d);
        api.syncDefectPhotoRefs(d, ['A', 'B-annotated'], [], before);
        assert.strictEqual(d.photoIds[0], 'D_ua');
        assert.notStrictEqual(d.photoIds[1], 'D_ub', '같은 ID에 다른 그림이 들어가면 다른 기기가 옛 그림 캐시를 계속 보여준다');
        await api.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
        assert.deepStrictEqual(log.filter((x) => x[0] === 'cloud').map((x) => x[1]), ['D_ub']);
    }

    // --- 같은 사진이 두 장이면 ID도 두 개 그대로(한 ID를 두 칸이 나눠 쓰지 않음) ---
    {
        const { api } = makeCtx();
        const d = { id: 'D', photos: ['A', 'A'], photoIds: ['D_u1', 'D_u2'] };
        const before = api.captureDefectPhotoIdsBefore(d);
        api.syncDefectPhotoRefs(d, ['A', 'A'], [], before);
        assert.deepStrictEqual(Array.from(d.photoIds), ['D_u1', 'D_u2']);
        const before2 = api.captureDefectPhotoIdsBefore(d);
        api.syncDefectPhotoRefs(d, ['A', 'A', 'A'], [], before2);
        assert.strictEqual(new Set(d.photoIds).size, 3, 'ID가 겹치면 한 장을 지울 때 다른 칸 사진도 사라진다');
    }

    // --- 새 결함(바꾸기 전 목록 없음): 전부 새 고유 ID ---
    {
        const { api } = makeCtx();
        const d = { id: 'NEW' };
        api.syncDefectPhotoRefs(d, ['A', 'B'], ['P'], null);
        assert.ok(d.photoIds.every((id) => /^NEW_u[0-9a-z]+$/.test(id)), d.photoIds.join());
        assert.ok(/^NEW_prev_u[0-9a-z]+$/.test(d.prevRoundPhotoIds[0]), d.prevRoundPhotoIds[0]);
    }

    // --- 사진 ID로 건물을 찾는다(Storage 폴더) — 새 ID도 읽어야 한다 ---
    {
        const { api, ctx } = makeCtx();
        ctx.window.state.buildings = [{ id: 'B1' }];
        ctx.window.state.defects = { B1_1F: [{ id: 'B1_1F_d9' }] };
        assert.strictEqual(api.resolveBuildingIdFromPhotoId('B1_1F_d9_0'), 'B1');
        assert.strictEqual(api.resolveBuildingIdFromPhotoId('B1_1F_d9_prev_3'), 'B1');
        assert.strictEqual(api.resolveBuildingIdFromPhotoId(api.createDefectPhotoId('B1_1F_d9')), 'B1',
            '새 ID에서 결함을 못 찾으면 사진이 엉뚱한 Storage 폴더로 올라간다');
        assert.strictEqual(api.resolveBuildingIdFromPhotoId(api.createDefectPhotoId('B1_1F_d9', 'prev')), 'B1');
    }

    // --- 저장이 화면 배열을 그대로 넣지 않는다(지울 때 결함 배열이 ID보다 먼저 줄면 짝이 어긋남) ---
    {
        assert.ok(!/\.photos = photosVal;/.test(app), '결함.photos = photosVal 은 화면 배열(_pendingPhotos)을 공유한다');
        assert.ok(!/photos: photosVal,/.test(app), '새 결함도 화면 배열을 공유하면 안 된다');
    }

    // --- 새 사진 ID는 정해진 곳에서만 만든다 ---
    {
        const allowed = new Set([
            'assignDefectPhotoIds' // 저장·복제·전회차 표시·전회차 보관 모두 이 함수를 거친다
        ]);
        const re = /createDefectPhotoId\(/g;
        const offenders = [];
        let m;
        while ((m = re.exec(app)) !== null) {
            if (app.slice(m.index - 9, m.index) === 'function ') continue;
            const before = app.slice(0, m.index);
            const fns = [...before.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)];
            const name = fns.length ? fns[fns.length - 1][1] : '?';
            if (!allowed.has(name)) offenders.push(name);
        }
        assert.deepStrictEqual(offenders, [], '새 사진 ID는 assignDefectPhotoIds로 매길 것 — 원래 ID 유지 규칙을 건너뛴다');
    }

    console.log('test-photo-unique-id: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
