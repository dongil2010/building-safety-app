/**
 * 2026-09-30 영일연립: 두 점검에 같은 id 결함이 있어(사진 번호 결함id_0 공유), 한쪽 행을 지우면
 * 다른 점검의 사진까지 서버에서 지워졌다. 다른 결함이 아직 쓰는 사진은 지우지 않는지 확인.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const run = app.slice(app.indexOf('async function runDeleteAllPhotosForDefect('), app.indexOf('async function deleteFloorDrawingsForBuilding('));
assert.ok(run.includes('const keepIds = photoIdsUsedByOtherDefects(d);'), '결함 삭제: 다른 결함이 쓰는 사진 모음');
assert.ok(run.includes("deletePhotosForDefect(d.id, curCount, undefined, d.photoIds, keepIds, opts)") && run.includes("deletePhotosForDefect(d.id, prevCount, 'prev', d.prevRoundPhotoIds, keepIds, opts)"));
const del = app.slice(app.indexOf('async function deletePhotosForDefect('), app.indexOf('function deleteAllPhotosForDefect('));
const guardAt = del.indexOf('if (keepIds && keepIds.size)');
assert.ok(guardAt > 0 && guardAt < del.indexOf('for (const photoDocId of targets)'), '지우기 전에 뺌');
const helper = app.slice(app.indexOf('function photoIdsUsedByOtherDefects('), app.indexOf('async function runDeleteAllPhotosForDefect('));
assert.ok(helper.includes('if (!e || e === d) return;') && helper.includes("defectPhotoIdList(e, nPrev, 'prev')"), '같은 객체만 빼고 모든 점검·층, 전차 칸 포함');
const prune = app.slice(app.indexOf('async function pruneRemovedDefectPhotos('), app.indexOf('async function pruneRemovedDefectPhotos(') + 900);
assert.ok(prune.includes('photoIdsUsedByOtherDefects(null).forEach((pid) => keep.add(pid));'), '사진 빼기: 다른 결함이 쓰면 남김');
// 동작: 두 점검에 같은 id 결함
const m = helper.match(/function photoIdsUsedByOtherDefects\(d\) \{[\s\S]*?\n    \}\n/);
const defectPhotoIdList = (d, n, kind) => {
    const ids = kind === 'prev' ? d.prevRoundPhotoIds : d.photoIds;
    const out = [];
    for (let i = 0; i < n; i++) out.push((ids && ids[i]) || `${d.id}${kind === 'prev' ? '_prev' : ''}_${i}`);
    return out;
};
const window = { state: { defects: {} } };
const fn = new Function('window', 'defectPhotoIdList', m[0] + '\nreturn photoIdsUsedByOtherDefects;')(window, defectPhotoIdList);
const prevRound = { id: 'ee1f5bd', photoIds: ['ee1f5bd_0'] };
const dup = { id: 'ee1f5bd', photoIds: ['ee1f5bd_0'] };
window.state.defects = { 'bPrev_1F': [prevRound], 'bCur_1F': [dup] };
assert.ok(fn(dup).has('ee1f5bd_0'), '복제 행을 지워도 전차 사진은 남김');
window.state.defects = { 'bCur_1F': [dup] };
assert.ok(!fn(dup).has('ee1f5bd_0'), '아무도 안 쓰면 예전처럼 지움');
console.log('test-shared-photo-delete-guard: ok');
