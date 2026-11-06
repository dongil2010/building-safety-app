#!/usr/bin/env node
'use strict';
/** 2026-11-06 점검자1 촬영 → 점검자2 촬영 → 점검자1이 본인 사진 삭제·저장 → 점검자2 사진까지 서버에서 지워지던 사고 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('../js/core/floor-sync-guard.js');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
function fn(name) {
    let s = app.indexOf('    function ' + name + '(');
    if (s < 0) s = app.indexOf('    async function ' + name + '(');
    assert.ok(s > 0, name);
    const e = app.indexOf('\n    }\n', s);
    return app.slice(s, e + 7);
}
const sb = { window: { BSA: { floorSyncGuard: G }, _photoCache: {}, _defectPhotosComplete: true }, console: { warn() {} }, Set, Array, Math, bsaStampAfter: (x) => Math.max(Number(x) || 0, 1e12) + 1, bsaSyncNow: () => 1e12 };
vm.createContext(sb);
vm.runInContext(['defectPhotoIdAt', 'captureDefectPhotoPairs', 'captureDefectPhotoIdsBefore', 'assignDefectPhotoIds', 'recordDefectPhotoState', 'noteDefectFormShownPhotos', 'keepUnseenDefectPhotos', 'syncDefectPhotoRefs', 'pruneRemovedDefectPhotos'].map(fn).join('\n')
    + '\n;this.api = { captureDefectPhotoIdsBefore, noteDefectFormShownPhotos, syncDefectPhotoRefs, pruneRemovedDefectPhotos };', sb);
const A = sb.api;
const W = sb.window;
sb.getPhotoDocId = (id, i) => id + '_' + i;
let seq = 0;
sb.createDefectPhotoId = (id) => id + '_new' + (++seq);
const deleted = [];
sb._idbPersistedPhotoKeys = new Set();
sb.idbDelete = async () => {};
sb.deleteCloudPhoto = async (id) => { deleted.push(id); };
sb.photoIdsUsedByOtherDefects = () => new Set();
sb.Math = Math;

(async () => {
    // 창을 열 때는 점검자1 사진만 보임
    const d = { id: 'D', photoIds: ['P1'], photos: ['url1'] };
    W._pendingPhotos = ['url1'];
    W._pendingPrevRoundPhotos = [];
    A.noteDefectFormShownPhotos(d);
    // 창이 열린 사이 동기화로 점검자2 사진이 들어옴(원본 아직 없음)
    d.photoIds = ['P1', 'P2'];
    d.photos = ['url1', null];
    // 점검자1이 본인 사진 삭제 → 저장
    W._pendingPhotos = [];
    let before = A.captureDefectPhotoIdsBefore(d);
    d.photos = [];
    A.syncDefectPhotoRefs(d, [], [], before);
    await A.pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
    assert.deepStrictEqual(Array.from(d.photoIds), ['P2'], '점검자2 사진은 목록에 남음');
    assert.ok(d.photoState.P1 > 0, '점검자1 사진은 지움 기록');
    assert.ok(!d.photoState.P2, '점검자2 사진은 지움 기록 없음');
    assert.deepStrictEqual(deleted, ['P1'], '서버에서 지우는 것은 점검자1 사진뿐');

    // 이 창에서 새로 넣은 사진은 이 창에서 지울 수 있다
    deleted.length = 0;
    const e = { id: 'E', photoIds: ['A1'], photos: ['ua'] };
    W._pendingPhotos = ['ua'];
    A.noteDefectFormShownPhotos(e);
    before = A.captureDefectPhotoIdsBefore(e);
    e.photos = ['ua', 'ub'];
    A.syncDefectPhotoRefs(e, ['ua', 'ub'], [], before);
    const newId = e.photoIds[1];
    assert.ok(newId && newId !== 'A1');
    before = A.captureDefectPhotoIdsBefore(e);
    e.photos = ['ua'];
    A.syncDefectPhotoRefs(e, ['ua'], [], before);
    await A.pruneRemovedDefectPhotos(before.cur.visibleIds, e.photoIds);
    assert.deepStrictEqual(Array.from(e.photoIds), ['A1'], '방금 넣은 사진은 지워짐');
    assert.deepStrictEqual(deleted, [newId]);

    // 사진을 다 받지 못한 창에서 사진을 추가해도 못 받은 사진은 안 지운다
    deleted.length = 0;
    const f = { id: 'F', photoIds: ['OLD'], photos: [null] };
    W._pendingPhotos = [];
    A.noteDefectFormShownPhotos(f);
    before = A.captureDefectPhotoIdsBefore(f);
    f.photos = ['unew'];
    A.syncDefectPhotoRefs(f, ['unew'], [], before);
    await A.pruneRemovedDefectPhotos(before.cur.visibleIds, f.photoIds);
    assert.ok(Array.from(f.photoIds).includes('OLD'), '못 받은 사진 유지');
    assert.strictEqual(f.photos.length, f.photoIds.length, '사진 칸과 번호 자리 일치');
    assert.deepStrictEqual(deleted, []);
    console.log('test-photo-unseen-keep: ok');
})().catch((err) => { console.error(err); process.exit(1); });
