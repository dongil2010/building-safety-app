#!/usr/bin/env node
'use strict';

/**
 * 2026-09-21 감사: 지운 사진이 되살아난다.
 * 사진은 서버·기기 photoIds의 합집합으로 병합돼, 옛 기기뿐 아니라 **같은 기기에서도**
 * 지운 사진이 돌아왔다(동기화는 서버+기기를 합친 뒤 올리는데, 지운 직후엔 서버에 아직 있음).
 *
 * 사진 번호는 자리 번호(결함id_0, _1, …)라 번호별 삭제 기록은 맞지 않는다.
 * 사용자가 사진을 바꿀 때 photosUpdatedAt을 찍고, 나중에 바꾼 쪽 목록을 통째로 따른다.
 * 사진을 잃지 않는 것이 되살아나지 않는 것보다 우선이다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

const ids = (n, from) => Array.from({ length: n }, (_, i) => 'd1_' + ((from || 0) + i));

function rec(extra) {
    return Object.assign({ id: 'd1', component: '기둥', defectType: '균열' }, extra);
}

/** 오늘 재현한 것: 같은 기기에서 가운데 사진을 지운 직후 병합하면 되살아났다 */
function testSameDeviceDeleteSticks() {
    const server = rec({ photoIds: ids(3), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'], contentUpdatedAt: 100, updatedAt: 100 });
    // 가운데(B) 삭제 → 자리 번호라 C가 _1로 당겨짐
    const local = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'], contentUpdatedAt: 200, updatedAt: 200, photosUpdatedAt: 200 });
    const merged = m.mergeDefectRecord(server, local, {});
    assert.deepStrictEqual(merged.photoIds, ids(2), '지운 사진 자리가 되살아나면 안 된다');
    assert.deepStrictEqual(merged.photoUrls, ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'],
        '당겨진 자리의 이미지가 서버의 옛 이미지(u-B)로 바뀌면 안 된다');
    assert.strictEqual(merged.photosUpdatedAt, 200);
}

/** 옛 기기(시각 없음)가 지운 사진을 들고 있어도 서버의 최신 목록을 따른다 */
function testStaleDeviceDoesNotResurrect() {
    const server = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'], contentUpdatedAt: 200, photosUpdatedAt: 200 });
    const stale = rec({ photoIds: ids(3), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'], contentUpdatedAt: 100 });
    const merged = m.mergeDefectRecord(server, stale, {});
    assert.deepStrictEqual(merged.photoIds, ids(2), '옛 기기가 들고 있던 사진이 되살아나면 안 된다');
    assert.deepStrictEqual(merged.photoUrls, ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg']);
}

/** 둘 다 시각이 없는 옛 데이터는 예전처럼 합친다(호환) */
function testLegacyUnion() {
    const merged = m.mergeDefectRecord(
        rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg'], contentUpdatedAt: 100 }),
        rec({ photoIds: ids(3), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'], contentUpdatedAt: 50 }),
        {}
    );
    assert.deepStrictEqual(merged.photoIds, ids(3), '옛 데이터는 사진을 잃지 않게 합쳐야 한다');
    assert.strictEqual(m.pickPhotoListSide({}, {}), null);
}

/**
 * 한쪽만 시각이 있는데 반대쪽이 그 뒤에 따로 바뀌었으면 사진이 추가됐을 수 있다 → 합친다.
 * (옛 코드 기기가 오프라인에서 사진을 추가한 경우 — 잃는 것보다 되살아나는 게 덜 나쁘다)
 */
function testNoLossWhenOtherSideChangedLater() {
    const server = rec({ photoIds: ids(1), photoUrls: ['https://storage.example/p-A.jpg'], contentUpdatedAt: 200, photosUpdatedAt: 200 });
    const oldCodeDevice = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-NEW.jpg'], contentUpdatedAt: 300 });
    const merged = m.mergeDefectRecord(server, oldCodeDevice, {});
    assert.deepStrictEqual(merged.photoIds, ids(2), '그 뒤에 추가된 사진을 잃으면 안 된다');
}

/** 반대 방향: 기기만 시각이 있고 서버가 그 뒤에 따로 바뀌었으면(다른 기기가 사진 추가) 합친다 */
function testNoLossWhenServerChangedLater() {
    const local = rec({ photoIds: ids(1), photoUrls: ['https://storage.example/p-A.jpg'], contentUpdatedAt: 200, photosUpdatedAt: 200 });
    const server = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-NEW.jpg'], contentUpdatedAt: 300 });
    assert.deepStrictEqual(m.mergeDefectRecord(server, local, {}).photoIds, ids(2),
        '서버에 그 뒤 추가된 사진을 잃으면 안 된다');
}

/**
 * 따르는 쪽에 그 자리 이미지가 아직 없을 때(업로드 전) 반대쪽의 같은 번호 이미지로 채우면 안 된다.
 * 자리 번호라 서버의 옛 _1은 지운 사진(B)이다.
 */
function testNoCrossSideImageForSameSlot() {
    const server = rec({
        photoIds: ids(3),
        photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'],
        contentUpdatedAt: 100
    });
    // 가운데를 지워 C가 _1로 당겨졌지만, 새 _1은 아직 업로드 전이라 주소가 없다
    const local = rec({
        photoIds: ids(2),
        photoUrls: ['https://storage.example/p-A.jpg', ''],
        contentUpdatedAt: 200, photosUpdatedAt: 200
    });
    const merged = m.mergeDefectRecord(server, local, {});
    const all = [].concat(merged.photos || [], merged.photoUrls || []).filter(Boolean);
    assert.ok(!all.some((p) => /p-B/.test(p)),
        '지운 사진 B가 당겨진 자리(_1)를 채우면 안 된다: ' + JSON.stringify(all));
}

/** 둘 다 시각이 있으면 나중에 바꾼 쪽 */
function testBothStampedNewerWins() {
    const a = rec({ photoIds: ids(1), photoUrls: ['https://storage.example/p-A.jpg'], photosUpdatedAt: 300, contentUpdatedAt: 300 });
    const b = rec({ photoIds: ids(3), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'], photosUpdatedAt: 250, contentUpdatedAt: 400 });
    assert.deepStrictEqual(m.mergeDefectRecord(a, b, {}).photoIds, ids(1),
        '사진은 사진을 나중에 바꾼 쪽을 따른다(다른 칸 수정 시각과 무관)');
    assert.deepStrictEqual(m.mergeDefectRecord(b, a, {}).photoIds, ids(1), '서버·기기 방향과 무관');
}

/** 사진을 전부 지웠으면 병합 뒤에도 없어야 한다 */
function testDeleteAllSticks() {
    const server = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg'], contentUpdatedAt: 100 });
    const local = rec({ contentUpdatedAt: 200, photosUpdatedAt: 200 });
    const merged = m.mergeDefectRecord(server, local, {});
    assert.ok(!merged.photoIds || merged.photoIds.length === 0, '전부 지운 사진이 돌아오면 안 된다');
    assert.ok(!merged.photoUrls || merged.photoUrls.length === 0);
}

/** 지운 뒤 새 사진을 추가하면 같은 자리 번호를 다시 쓴다 — 그래도 보여야 한다 */
function testAddAfterDeleteShows() {
    const server = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'], photosUpdatedAt: 200, contentUpdatedAt: 200 });
    const local = rec({ photoIds: ids(3), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg', 'https://storage.example/p-NEW.jpg'], photosUpdatedAt: 300, contentUpdatedAt: 300 });
    const merged = m.mergeDefectRecord(server, local, {});
    assert.deepStrictEqual(merged.photoIds, ids(3), '다시 추가한 사진이 막히면 안 된다');
    assert.deepStrictEqual(merged.photoUrls, ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg', 'https://storage.example/p-NEW.jpg']);
}

/** 사진 3장 중 1장만 지우면 나머지는 그대로, 번호·이미지·URL 짝이 맞아야 한다 */
function testArraysStayAligned() {
    const server = rec({
        photoIds: ids(3), photos: ['img-A', 'img-B', 'img-C'], photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-B.jpg', 'https://storage.example/p-C.jpg'],
        contentUpdatedAt: 100
    });
    const local = rec({
        photoIds: ids(2), photos: ['img-A', 'img-C'], photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'],
        contentUpdatedAt: 200, photosUpdatedAt: 200
    });
    const merged = m.mergeDefectRecord(server, local, {});
    assert.strictEqual(merged.photoIds.length, merged.photos.length);
    assert.strictEqual(merged.photoIds.length, merged.photoUrls.length);
    // photos 칸은 클라우드 주소가 있으면 주소를 우선 쓴다(기존 동작). 자리마다 맞는 사진인지만 본다.
    assert.ok(/A/.test(merged.photos[0]) && /C/.test(merged.photos[1]),
        '_1 자리에 C가 있어야 한다(서버의 옛 _1인 B가 섞이면 안 됨): ' + JSON.stringify(merged.photos));
    assert.ok(!merged.photos.some((p) => /B/.test(p)) && !merged.photoUrls.some((p) => /B/.test(p)),
        '지운 사진 B가 어느 배열에도 남으면 안 된다');
}

/** 사진을 안 바꾼 쪽의 다른 칸 수정은 그대로 반영된다(사진 규칙이 내용 병합을 해치지 않음) */
function testOtherFieldsStillMerge() {
    const server = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'], photosUpdatedAt: 200, contentUpdatedAt: 200 });
    const local = rec({ photoIds: ids(2), photoUrls: ['https://storage.example/p-A.jpg', 'https://storage.example/p-C.jpg'], photosUpdatedAt: 200, contentUpdatedAt: 300, cause: '누수' });
    const merged = m.mergeDefectRecord(server, local, {});
    assert.strictEqual(merged.cause, '누수');
    assert.deepStrictEqual(merged.photoIds, ids(2));
}

/** 앱이 시각을 "사용자가 사진을 바꿨을 때만, 사진이 다 내려왔을 때만" 찍는지 */
function testAppStampsOnlyOnRealPhotoChange() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const fn = app.slice(app.indexOf('function stampDefectPhotosChangedIfSafe'), app.indexOf('function stampDefectPhotosChangedIfSafe') + 700);
    assert.ok(fn.indexOf('window._defectPhotosComplete === false') > 0,
        '사진이 다 안 내려왔으면 찍지 않는다 — 못 받은 사진이 지워진 것으로 퍼지면 안 된다');
    assert.ok(app.indexOf('if (window._defectPhotosDirty) stampDefectPhotosChangedIfSafe(state.defects[key][idx]);') > 0,
        '다른 칸만 고친 저장에서는 찍지 않는다');
    const persist = app.slice(app.indexOf('async function persistOpenDefectPhotosNow'), app.indexOf('async function persistOpenDefectPhotosNow') + 2500);
    assert.ok(persist.indexOf('stampDefectPhotosChangedIfSafe(d)') > 0, '사진 추가·삭제 즉시 저장 경로에서 찍는다');
    assert.ok(app.indexOf('window._defectPhotosComplete = !existingPin ||') > 0, '폼을 다 채운 뒤 완전성을 판단한다');
    assert.ok(app.indexOf('window._defectPhotosComplete = false;') > 0, '폼을 채우는 동안은 미완으로 둔다');
    // 서버에 올릴 때 새 필드가 빠지면 소용없다 — sanitize가 나머지 필드를 그대로 올리는지
    const san = app.slice(app.indexOf('function sanitizeDefectsForFirestore'), app.indexOf('function sanitizeDefectsForFirestore') + 600);
    assert.ok(/const \{ photos, prevRoundPhotos, photoIds, prevRoundPhotoIds, photoUrls, prevRoundPhotoUrls, \.\.\.rest \} = d;/.test(san)
        && san.indexOf('const out = { ...rest };') > 0,
        'photosUpdatedAt이 서버로 올라가야 다른 기기 병합에서 쓰인다');
}

testSameDeviceDeleteSticks();
testStaleDeviceDoesNotResurrect();
testLegacyUnion();
testNoLossWhenOtherSideChangedLater();
testNoLossWhenServerChangedLater();
testNoCrossSideImageForSameSlot();
testBothStampedNewerWins();
testDeleteAllSticks();
testAddAfterDeleteShows();
testArraysStayAligned();
testOtherFieldsStillMerge();
testAppStampsOnlyOnRealPhotoChange();
console.log('test-photo-merge: ok');
