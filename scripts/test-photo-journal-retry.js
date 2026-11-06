#!/usr/bin/env node
'use strict';
/** 2026-11-06 일지에 남은 사진: 층과 상관없이 올리고, 원본·서버 모두 없으면 멈춤 (새희망교회·영광군청사 2장씩 끝없이 남던 문제) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require('../js/core/sync-retry.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const start = app.indexOf('    async function uploadPendingJournalPhotos() {');
const end = app.indexOf('    async function runPhotoJobsInBatches(', start);
assert.ok(start > 0 && end > start);
const a = app.indexOf('const photoFailedFloors = await uploadInlineDefectPhotosForSync(');
assert.ok(app.slice(a, a + 200).includes('await uploadPendingJournalPhotos();'), '동기화 때 함께 돈다');
assert.ok(app.indexOf('await uploadPendingJournalPhotos()', app.indexOf('async function runOfflineReturnSync')) < app.indexOf('const hadPending = _dirtyFloorKeys.size > 0', app.indexOf('async function runOfflineReturnSync')), '오프라인 복귀: 올릴 층이 없어도 돈다');

async function run(cfg) {
    const marked = new Set(cfg.marked || []);
    const store = {};
    const tracker = R.createItemTracker({ storage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } }, storageKey: () => 'k', maxAttempts: 5, baseMs: 0 });
    let runs = 0;
    const reads = [];
    const uploads = [];
    const sb = {
        console: { warn() {} }, navigator: { onLine: true }, Promise,
        syncJournal: () => ({ summary() { runs += 1; }, pendingEntries: () => (cfg.laterEntries && runs > 1 ? cfg.laterEntries : cfg.entries) }),
        syncProgressCtx: () => ({}),
        getCompanyPhotosCollection: () => ({ doc: (id) => ({ get: async () => { reads.push(id); if (cfg.readError) throw cfg.readError; const d = (cfg.server || {})[id]; return { exists: !!d, data: () => d }; } }) }),
        isPhotoMarkedOnStorage: (id) => marked.has(id),
        markPhotoOnStorage: (id) => marked.add(id),
        photoRetryTracker: () => tracker,
        runPhotoJobsInBatches: async (items, w) => { for (const i of items) await w(i); },
        resolveLocalPhotoUrl: async (id) => (cfg.local || {})[id] || null,
        persistPhotoToCloud: async (id) => { uploads.push(id); return cfg.uploadOk !== false; },
        isFirebaseStorageHttpUrl: (u) => /^https:/.test(u),
        hasFirebaseStorageMeta: (d) => !!d.storagePath,
        MISSING_PHOTO_REASON: '이 기기에 원본 없음',
        _photoLastError: new Map(),
        scheduleSyncProgressRender() {}
    };
    vm.createContext(sb);
    vm.runInContext(app.slice(start, end) + '\n;this.f = uploadPendingJournalPhotos;', sb);
    for (let i = 0; i < (cfg.times || 1); i++) await sb.f();
    return { marked, reads, uploads, parked: tracker.parked() };
}

(async () => {
    const e = (id) => ({ k: 'photo', id });
    let r = await run({ entries: [e('p1'), { k: 'edit', id: 'd1' }], local: { p1: 'data:image/jpeg;base64,xx' } });
    assert.deepStrictEqual(r.uploads, ['p1'], '기기에 원본 있으면 층과 상관없이 올림(수정 일지는 안 건드림)');
    assert.strictEqual(r.reads.length, 0, '원본 있으면 서버 안 읽음');

    r = await run({ entries: [e('p2')], server: { p2: { storagePath: 'x' } } });
    assert.ok(r.marked.has('p2'), '원본 없지만 서버에 있으면 올라간 것으로');
    assert.strictEqual(r.parked.length, 0);

    r = await run({ entries: [e('p3')], times: 4 });
    assert.strictEqual(r.parked.length, 1, '원본도 서버 사본도 없으면 멈춤');
    assert.ok(r.parked[0].reason.includes('다시 촬영'));
    assert.strictEqual(r.reads.length, 1, '멈춘 뒤엔 서버를 다시 읽지 않음');
    assert.ok(!r.marked.has('p3'), '올라갔다고 거짓 표시하지 않음');

    r = await run({ entries: [e('p4')], readError: { code: 'unavailable', message: 'offline' }, times: 2 });
    assert.strictEqual(r.parked.length, 0, '읽기 오류(통신)는 사진이 없다고 단정하지 않음');
    assert.strictEqual(r.reads.length, 2);

    r = await run({ entries: [e('p5')], local: { p5: 'data:image/jpeg;base64,xx' }, uploadOk: false, times: 7 });
    assert.strictEqual(r.uploads.length, 5, '계속 실패하면 5번에서 멈춤');
    assert.strictEqual(r.parked.length, 1);

    r = await run({ entries: [e('p6')], marked: ['p6'] });
    assert.strictEqual(r.uploads.length + r.reads.length, 0, '이미 올라간 사진은 건드리지 않음');
    r = await run({ entries: [e('p7')], laterEntries: [], times: 2 });
    assert.strictEqual(r.parked.length, 0, '원본 없는 사진을 지워 일지에서 빠지면 멈춤도 풀림');
    r = await run({ entries: [e('p8')], local: { p8: 'data:image/jpeg;base64,xx' }, uploadOk: false, times: 5, laterEntries: [e('p8')] });
    assert.strictEqual(r.parked.length, 1, '통신 실패로 멈춘 사진은 그대로 유지');
    // 목록에서 빼기: 원본이 정말 없을 때만, 지움 기록을 남겨 합치기에서 되살아나지 않게
    {
        const a2 = app.indexOf('    function findDefectByPhotoId(photoId) {');
        const b2 = app.indexOf('    /** 진행률 창·오프라인 준비 창 공통', a2);
        assert.ok(a2 > 0 && b2 > a2);
        const SM = require('../js/core/sync-merge.js');
        async function drop(cfg) {
            const d = { id: 'D', photoIds: ['new', 'dead'], photos: ['data:n', null], photoState: {}, photosUpdatedAt: 5 };
            const calls = { dirty: [], ok: [], confirm: 0 };
            const sb = {
                window: { state: { defects: { B_1F: [d] } }, _defectPhotosComplete: false, showToast() {}, confirmDelete: async () => { calls.confirm += 1; return cfg.confirm !== false; } },
                navigator: { onLine: true }, photoRetryTracker: () => ({ ok: (id) => calls.ok.push(id) }),
                resolveLocalPhotoUrl: async () => cfg.local || null,
                getCompanyPhotosCollection: () => ({ doc: () => ({ get: async () => ({ exists: !!cfg.server }) }) }),
                syncProgressPhotoLabel: (x) => x,
                recordDefectPhotoState: (rec, before, after) => { before.forEach((p) => { if (!after.includes(p) && sb.window._defectPhotosComplete !== false) rec.photoState[p] = 100; }); },
                stampDefectPhotosChangedIfSafe: (rec) => { if (sb.window._defectPhotosComplete !== false) rec.photosUpdatedAt = 100; },
                touchDefectUpdatedAt() {}, markFloorKeyDirty: (k) => calls.dirty.push(k), saveStateToLocalStorage() {}, scheduleSyncToFirebase() {},
                console
            };
            vm.createContext(sb);
            vm.runInContext(app.slice(a2, b2) + '\n;this.f = dropMissingPhotoFromDefect;', sb);
            const res = await sb.f('dead');
            return { res, d, calls, complete: sb.window._defectPhotosComplete };
        }
        let x = await drop({});
        assert.deepStrictEqual(JSON.parse(JSON.stringify(x.d.photoIds)), ['new'], '없는 번호만 빠짐');
        assert.deepStrictEqual(JSON.parse(JSON.stringify(x.d.photos)), ['data:n'], '사진 칸 자리도 맞춤');
        assert.strictEqual(x.d.photoState.dead, 100, '지움 기록');
        assert.strictEqual(x.complete, false, '창의 사진 받기 상태는 되돌림');
        assert.deepStrictEqual(x.calls.dirty, ['B_1F'], '서버에 다시 올림');
        const merged = SM.mergeDefectsMaps({ B_1F: [{ id: 'D', photoIds: ['new', 'dead'], photoState: {}, photosUpdatedAt: 5 }] }, { B_1F: [JSON.parse(JSON.stringify(x.d))] }, {}, {}, {}, {});
        assert.deepStrictEqual(merged.defects.B_1F[0].photoIds, ['new'], '서버 옛 목록과 합쳐도 안 되살아남');
        x = await drop({ server: true });
        assert.strictEqual(x.res, false);
        assert.strictEqual(x.d.photoIds.length, 2, '서버에 있으면 빼지 않음');
        assert.strictEqual(x.calls.confirm, 0);
        x = await drop({ local: 'data:x' });
        assert.strictEqual(x.d.photoIds.length, 2, '기기에 원본 있으면 빼지 않음');
        x = await drop({ confirm: false });
        assert.strictEqual(x.d.photoIds.length, 2, '취소하면 그대로');
    }
    console.log('test-photo-journal-retry: ok');
})().catch((err) => { console.error(err); process.exit(1); });
