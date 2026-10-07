#!/usr/bin/env node
'use strict';

/**
 * 고른 사진이 조용히 버려지던 문제 (2026-10-07)
 *
 * 사진은 줄이는 작업(압축)이 끝나야 결함에 붙는다. 그 사이 결함 창이 닫히거나 다른 결함 창으로 바뀌면
 * 사진이 window._pendingPhotos에 떠돌다 다음 창이 열릴 때 버려졌고, 화면 안내도 오류 기록도 없었다.
 * 광주교회에서 금회 추가 결함의 사진이 서버·백업 어디에도 없던 일을 조사하다 샘플건축물에서 재현.
 *
 * 지킬 것:
 *  1. 사진을 고르는 순간의 결함을 잡아 두고, 창이 그대로면 예전처럼 창에 넣는다.
 *  2. 창이 닫혔거나 다른 결함으로 바뀌었으면 고를 때의 그 결함에 바로 붙여 저장한다(다른 결함에 붙이지 않는다).
 *  3. 붙일 곳이 없으면 화면에 알리고 오류 기록에 남긴다 — 조용히 버리지 않는다.
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

function makeWorld() {
    const world = {
        modalOpen: true,
        pinId: 'A',
        toasts: [],
        logs: [],
        uploads: [],
        idb: [],
        dirty: [],
        rendered: 0,
        autoApply: 0,
        compress: null   // 테스트가 풀어 줄 약속
    };
    const state = {
        currentBuildingId: 'b1',
        currentFloor: '1F',
        currentTab: 'tab-map',
        userName: '검사자',
        defects: {
            b1_1F: [
                { id: 'A', no: 'NO.01', photoIds: ['A_old'], photos: [null] },   // 사진 1장이 아직 안 내려온 결함
                { id: 'B', no: 'NO.02', photos: [] }
            ]
        }
    };
    let idSeq = 0;
    const win = {
        state,
        _defectModalOpenSeq: 1,
        _pendingPhotos: [],
        _photoCache: {},
        showToast: (msg, type) => world.toasts.push([type, msg]),
        compressDefectPhoto43: () => new Promise((resolve, reject) => { world.compress = { resolve, reject }; }),
        BSA: { errorLog: { record: (e) => world.logs.push(e) } }
    };
    const ctx = {
        window: win,
        state,
        console: { warn() {} },
        document: { getElementById: (id) => (id === 'defectPinId' ? { value: world.pinId } : null) },
        isDefectModalOpen: () => world.modalOpen,
        captureDefectPhotoIdsBefore: (d) => ({ cur: { visibleIds: (d.photoIds || []).slice() }, prev: { visibleIds: [] } }),
        defectPhotoIdAt: (d, i) => (d.photoIds && d.photoIds[i]) || `${d.id}_${i}`,
        assignDefectPhotoIds: (id, photos) => photos.map(() => `${id}_new${++idSeq}`),
        recordDefectPhotoState: (d) => { d.photoState = d.photoState || {}; },
        touchDefectUpdatedAt: (d) => { d.updatedAt = 123; },
        markFloorKeyDirty: (k) => world.dirty.push(k),
        saveStateToLocalStorage() {},
        persistPhotoUrlToIdb: async (id, url) => { world.idb.push([id, url]); return true; },
        uploadDefectPhotos: async (id, photos, kind, ids) => { world.uploads.push([id, photos, ids]); return ids; },
        scheduleSyncToFirebase() {},
        renderDefectListPanel() {},
        renderDefectPhotoSection: () => { world.rendered++; },
        persistOpenDefectPhotosNow: async () => {},
        scheduleDefectAutoApply: () => { world.autoApply++; }
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractFunction('function captureDefectPhotoTarget('),
        extractFunction('function isDefectPhotoTargetStillOpen('),
        extractFunction('async function attachPhotoToDefectDirect('),
        extractFunction('function reportDefectPhotoLost('),
        extractFunction('function handleSelectedPhotoFile('),
        'this.capture = captureDefectPhotoTarget; this.handle = handleSelectedPhotoFile;'
    ].join('\n'), ctx);
    return { world, state, win, ctx };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const FILE = { name: 'p.jpg' };

(async () => {
    // --- 1. 창이 그대로면 예전처럼 창(_pendingPhotos)에 넣는다 ---
    {
        const { world, win, ctx, state } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.compress.resolve('data:NEW');
        await done;
        assert.deepStrictEqual(plain(win._pendingPhotos), ['data:NEW']);
        assert.strictEqual(win._defectPhotosDirty, true);
        assert.strictEqual(world.autoApply, 1);
        assert.deepStrictEqual(plain(state.defects.b1_1F[0].photoIds), ['A_old'], '창이 저장하므로 결함은 여기서 건드리지 않는다');
        assert.strictEqual(world.toasts.length, 0);
    }

    // --- 2. 압축이 끝나기 전에 창이 닫힘 → 고를 때의 그 결함에 바로 저장 ---
    {
        const { world, win, ctx, state } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.modalOpen = false;                 // 창 닫힘
        world.compress.resolve('data:NEW');
        await done;
        const a = state.defects.b1_1F[0];
        assert.deepStrictEqual(plain(win._pendingPhotos), [], '닫힌 창에 떠돌게 두지 않는다');
        assert.deepStrictEqual(plain(a.photoIds), ['A_old', 'A_new1'], '아직 안 내려온 사진의 ID를 지키고 뒤에 붙인다');
        assert.deepStrictEqual(plain(a.photos), [null, 'data:NEW']);
        assert.deepStrictEqual(plain(world.idb), [['A_new1', 'data:NEW']]);
        assert.deepStrictEqual(plain(world.uploads), [['A', ['data:NEW'], ['A_new1']]]);
        assert.deepStrictEqual(world.dirty, ['b1_1F']);
        assert.strictEqual(a.updatedAt, 123);
        assert.strictEqual(world.toasts[0][0], 'info');
        assert.ok(/NO\.01/.test(world.toasts[0][1]));
        assert.strictEqual(world.logs.length, 0);
    }

    // --- 2. 다른 결함 창으로 바뀜 → 새로 열린 결함이 아니라 고를 때의 결함에 ---
    {
        const { world, win, ctx, state } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.pinId = 'B';                       // 다른 결함 창이 열림
        win._defectModalOpenSeq = 2;
        world.compress.resolve('data:NEW');
        await done;
        assert.deepStrictEqual(plain(win._pendingPhotos), [], '지금 열린 다른 결함 창에 넣으면 안 된다');
        assert.deepStrictEqual(plain(state.defects.b1_1F[0].photoIds), ['A_old', 'A_new1']);
        assert.strictEqual(state.defects.b1_1F[1].photoIds, undefined);
    }

    // --- 같은 결함을 닫았다 다시 연 경우 → 열린 창에 넣는다(창이 저장하며 덮어쓰지 않게) ---
    {
        const { world, win, ctx, state } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        win._defectModalOpenSeq = 2;             // 같은 결함(A)을 다시 엶
        world.compress.resolve('data:NEW');
        await done;
        assert.deepStrictEqual(plain(win._pendingPhotos), ['data:NEW']);
        assert.deepStrictEqual(plain(state.defects.b1_1F[0].photoIds), ['A_old']);
    }

    // --- 3. 붙일 곳이 없으면 알린다: 그 사이 결함이 지워짐 ---
    {
        const { world, ctx, state } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.modalOpen = false;
        state.defects.b1_1F.shift();
        world.compress.resolve('data:NEW');
        await done;
        assert.strictEqual(world.toasts[0][0], 'error');
        assert.strictEqual(world.logs.length, 1);
        assert.strictEqual(world.logs[0].kind, 'photo-lost');
    }

    // --- 3. 저장 전인 새 결함(id 없음)의 창이 닫힘 ---
    {
        const { world, win, ctx } = makeWorld();
        world.pinId = '';
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.modalOpen = false;
        world.compress.resolve('data:NEW');
        await done;
        assert.deepStrictEqual(plain(win._pendingPhotos), []);
        assert.strictEqual(world.toasts[0][0], 'error');
        assert.strictEqual(world.logs.length, 1);
    }

    // --- 새 결함 창이 그대로 열려 있으면(같은 창 번호) 창에 넣는다 ---
    {
        const { world, win, ctx } = makeWorld();
        world.pinId = '';
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.pinId = 'C';                       // 첫 저장으로 id가 생김
        world.compress.resolve('data:NEW');
        await done;
        assert.deepStrictEqual(plain(win._pendingPhotos), ['data:NEW']);
    }

    // --- 3. 사진을 못 읽음(지원 안 하는 형식 등) → 알린다 ---
    {
        const { world, ctx } = makeWorld();
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.compress.reject(new Error('decode failed'));
        await done;
        assert.strictEqual(world.toasts[0][0], 'error');
        assert.strictEqual(world.logs.length, 1);
    }

    // --- 4. 사진을 저장하는 동안·입력 창이 열린 동안은 자동 새로고침을 미룬다 ---
    // 다른 직원이 배포한 직후, 사진 파일 창을 닫고 앱 창으로 돌아오는 순간(focus) 자동 새로고침이 걸려
    // 방금 고른 사진이 사라졌다(광주교회 B1F NO.44: 17:14 배포, 17:15~17:17 작성, 사진 없음).
    {
        const { world, win, ctx } = makeWorld();
        vm.runInContext(extractFunction('function isAutoReloadUnsafeNow(') + '\nthis.unsafe = isAutoReloadUnsafeNow;', ctx);
        ctx.isOverviewPhotosModalOpen = () => false;
        world.modalOpen = false;
        assert.strictEqual(ctx.unsafe(), false, '아무것도 안 열려 있으면 새로고침해도 된다');
        world.modalOpen = true;
        assert.strictEqual(ctx.unsafe(), true, '결함 창이 열려 있으면 미룬다');
        const done = ctx.handle(FILE, 'curr', ctx.capture());
        world.modalOpen = false;
        assert.strictEqual(win._defectPhotoSaves.size, 1);
        assert.strictEqual(ctx.unsafe(), true, '창이 닫혀도 사진을 저장하는 중이면 미룬다');
        world.compress.resolve('data:NEW');
        await done;
        assert.strictEqual(win._defectPhotoSaves.size, 0, '끝나면 표시를 지운다(실패해도)');
        assert.strictEqual(ctx.unsafe(), false);

        const done2 = ctx.handle(FILE, 'curr', ctx.capture());
        world.compress.reject(new Error('x'));
        await done2;
        assert.strictEqual(win._defectPhotoSaves.size, 0);
    }
    {
        const at = app.indexOf('async function checkRemoteWebVersion(');
        const body = app.slice(at, app.indexOf("document.addEventListener('visibilitychange'", at));
        const gate = body.indexOf('if (isAutoReloadUnsafeNow()) return;');
        assert.ok(gate > 0, '자동 새로고침 전에 입력 중인지 봐야 한다');
        assert.ok(gate < body.indexOf('sessionStorage.setItem(KEY, sha);\n                    window.reloadWebAppFromServer();'),
            '미룰 때는 기록을 바꾸지 않아야 다음에 다시 판단한다');
        const reload = app.slice(app.indexOf('window.reloadWebAppFromServer = function'), app.indexOf('function isAutoReloadUnsafeNow('));
        assert.ok(/_defectPhotoSaves/.test(reload), '수동 새로고침도 저장 중인 사진을 기다린다');
    }

    // --- 연결: 파일 창을 띄우기 전에 결함을 잡아 둔다 ---
    const trigger = extractFunction('async function triggerDefectPhotoPick(');
    assert.ok(trigger.indexOf('captureDefectPhotoTarget()') < trigger.indexOf('pickImageFromDevice('), '파일 창보다 먼저 잡아야 한다');
    assert.ok(/handleSelectedPhotoFile\(file, target, photoTarget\)/.test(trigger));

    console.log('test-defect-photo-pick-target: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
