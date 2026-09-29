#!/usr/bin/env node
'use strict';

/**
 * 2026-09-29 칸 단위·사진 ID 단위 병합 (sync-merge.js applyFieldLevelContent / mergePhotoIdLists,
 * app.js touchDefectUpdatedAt / recordDefectPhotoState)
 * 상황: 두 사람이 오프라인에서 같은 결함을 고치고 다시 연결.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const sm = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) return app.slice(at, i + 1); }
    }
    throw new Error(header + ' 끝');
}
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- 앱 쪽 함수(바뀐 칸 찍기·사진 기록)를 가짜 시계로 ----
let clock = 1000;
const ctx = { window: { BSA: { syncMerge: sm } }, Date: { now: () => clock }, Map, Set, Number, Object, Array, Math };
vm.createContext(ctx);
vm.runInContext([
    extractFunction('function defectContentSnap('),
    extractFunction('function seedDefectContentSnaps('),
    extractFunction('function touchDefectUpdatedAt('),
    extractFunction('function recordDefectPhotoState('),
    'this.seed = seedDefectContentSnaps; this.touch = touchDefectUpdatedAt; this.photoState = recordDefectPhotoState;'
].join('\n'), ctx);

// 서버에서 받은 같은 결함을 A·B 두 기기가 들고 있다(각자 기기 = 각자 vm 상태를 흉내 내려고 매번 seed)
const base = { id: 'd1', no: 'NO.01', location: 'B1 주차장', defectType: '균열', remark: '', crackWidth: '0.2',
    x: 10, y: 20, contentUpdatedAt: 100, updatedAt: 100, photoIds: ['d1_0', 'd1_1', 'd1_2'], photosUpdatedAt: 100 };

function deviceEdit(rec, at, fn) {
    ctx.window.__bsaDefectContentSnap = new Map();
    ctx.seed({ k: [rec] });
    clock = at;
    fn(rec);
    ctx.touch(rec);
    return rec;
}

// ---- 1) A는 비고, B는 폭 — 둘 다 남는다 ----
{
    const A = deviceEdit(clone(base), 250, (d) => { d.remark = 'A가 쓴 비고'; });
    const B = deviceEdit(clone(base), 400, (d) => { d.crackWidth = '0.5'; });
    assert.deepStrictEqual(clone(A.fieldAt), { remark: 250 }, '바뀐 칸만 찍는다');
    assert.strictEqual(A.contentBaseAt, 100, '기록 시작 전 모든 칸 = 예전 수정 시각');
    for (const [server, local] of [[A, B], [B, A]]) {
        const m = sm.mergeDefectRecord(clone(server), clone(local));
        assert.strictEqual(m.remark, 'A가 쓴 비고', '먼저/나중 동기화 순서와 상관없이');
        assert.strictEqual(m.crackWidth, '0.5');
        assert.strictEqual(m.location, 'B1 주차장');
        assert.deepStrictEqual(clone(m.fieldAt), { remark: 250, crackWidth: 400 });
    }
}

// ---- 2) 같은 칸을 둘 다 고치면 나중 것, 동점이면 서버 ----
{
    const A = deviceEdit(clone(base), 300, (d) => { d.remark = 'A'; });
    const B = deviceEdit(clone(base), 500, (d) => { d.remark = 'B'; });
    assert.strictEqual(sm.mergeDefectRecord(clone(A), clone(B)).remark, 'B');
    assert.strictEqual(sm.mergeDefectRecord(clone(B), clone(A)).remark, 'B');
    const C = deviceEdit(clone(base), 300, (d) => { d.remark = 'C'; });
    assert.strictEqual(sm.mergeDefectRecord(clone(A), clone(C)).remark, 'A', '동점이면 서버(09-27 규칙과 같게)');
}

// ---- 3) 옛 데이터(칸 기록 없음)끼리는 예전처럼 통째 ----
{
    const A = Object.assign(clone(base), { remark: 'A', contentUpdatedAt: 300, updatedAt: 300 });
    const B = Object.assign(clone(base), { crackWidth: '0.9', contentUpdatedAt: 500, updatedAt: 500 });
    const m = sm.mergeDefectRecord(clone(A), clone(B));
    assert.strictEqual(m.remark, '', '예전 동작 그대로: 나중 기기(B)의 옛 비고');
    assert.strictEqual(m.crackWidth, '0.9');
    assert.strictEqual(m.fieldAt, undefined);
}

// ---- 4) 한쪽만 새 기록: 옛 쪽 칸 시각은 그 결함 수정 시각 ----
{
    const A = deviceEdit(clone(base), 300, (d) => { d.remark = 'A'; });
    const oldB = Object.assign(clone(base), { crackWidth: '0.7', contentUpdatedAt: 200, updatedAt: 200 });
    const m = sm.mergeDefectRecord(clone(oldB), clone(A));
    assert.strictEqual(m.remark, 'A');
    assert.strictEqual(m.crackWidth, '0.7', '옛 기기가 200에 고친 폭(A는 폭을 안 건드림, A의 폭 시각=100)');
}

// ---- 5) 비교 기준이 없으면(새 결함) 모든 칸을 지금 바뀐 것으로 ----
{
    ctx.window.__bsaDefectContentSnap = new Map();
    clock = 777;
    const d = { id: 'new1', remark: 'x' };
    ctx.touch(d);
    assert.deepStrictEqual(clone(d.fieldAt), {});
    assert.strictEqual(d.contentBaseAt, 777);
    // 위치·번호만 바꾸면 내용 칸 기록은 안 생긴다
    const e = deviceEdit(clone(base), 900, (r) => { r.x = 99; r.no = 'NO.09'; });
    assert.strictEqual(e.fieldAt, undefined, '내용 칸이 안 바뀌면 칸 기록도 시작하지 않는다');
}

// ---- 6) 감사 요청서 시나리오: 사진 3장, A가 가운데 삭제, B는 삭제 전 상태에서 새 사진 추가 ----
{
    const withUrls = (d) => Object.assign(d, { photos: d.photoIds.map((p) => 'https://x/' + p) });
    ctx.window._defectPhotosComplete = true;
    // A: 가운데(d1_1) 삭제
    clock = 300;
    const A = clone(base);
    const beforeA = A.photoIds.slice();
    A.photoIds = ['d1_0', 'd1_2'];
    ctx.photoState(A, beforeA, A.photoIds);
    A.photosUpdatedAt = 300;
    assert.deepStrictEqual(clone(A.photoState), { d1_1: 300 });
    // B: 새 사진(고유 ID, 시각 250) 추가
    clock = 250;
    const B = clone(base);
    const beforeB = B.photoIds.slice();
    const newPid = 'd1_u' + (250).toString(36).padStart(8, '0') + 'abc123';
    B.photoIds = B.photoIds.concat(newPid);
    ctx.photoState(B, beforeB, B.photoIds);
    B.photosUpdatedAt = 250;
    assert.deepStrictEqual(clone(B.photoState), {}, '추가만 하면 빈 기록(= 사진마다 기록하는 기기라는 표시)');
    withUrls(A); withUrls(B);
    for (const [server, local] of [[A, B], [B, A]]) {
        const m = sm.mergeDefectRecord(clone(server), clone(local));
        assert.strictEqual(m.photoIds.length, 3, '세 장: 남은 두 장 + 새 사진');
        assert.ok(!m.photoIds.includes('d1_1'), '지운 사진이 되살아나지 않는다');
        assert.ok(m.photoIds.includes(newPid), '새 사진이 사라지지 않는다');
        assert.deepStrictEqual(m.photos, m.photoIds.map((p) => 'https://x/' + p), '이미지 주소도 ID에 맞게 정렬');
        assert.deepStrictEqual(clone(m.photoState), { d1_1: 300 });
    }
}

// ---- 7) 되돌리기로 다시 넣은 사진은 다른 기기의 옛 삭제 기록에 안 진다 ----
{
    clock = 500;
    const A = Object.assign(clone(base), { photoIds: ['d1_0', 'd1_2'], photoState: { d1_1: 300 }, photosUpdatedAt: 300 });
    const back = Object.assign(clone(base), { photoState: { d1_1: 300 } });
    ctx.photoState(back, ['d1_0', 'd1_2'], back.photoIds);   // d1_1 다시 들어옴
    back.photosUpdatedAt = 500;
    assert.strictEqual(back.photoState.d1_1, -500);
    const m = sm.mergeDefectRecord(clone(A), clone(back));
    assert.ok(m.photoIds.includes('d1_1'));
}

// ---- 8) 사진을 다 못 받은 창에서는 빠진 사진을 지운 것으로 적지 않는다 ----
{
    ctx.window._defectPhotosComplete = false;
    const d = clone(base);
    ctx.photoState(d, ['d1_0', 'd1_1', 'd1_2'], ['d1_0']);
    assert.deepStrictEqual(clone(d.photoState), {});
    ctx.window._defectPhotosComplete = true;
}

// ---- 9) 새 기록이 없는 옛 기기가 나중에 사진을 바꿨으면 예전 규칙(나중 쪽 목록) ----
{
    const newDev = Object.assign(clone(base), { photoIds: ['d1_0', 'd1_1', 'd1_2'], photoState: {}, photosUpdatedAt: 200 });
    const oldDev = Object.assign(clone(base), { photoIds: ['d1_0'], photosUpdatedAt: 400 });   // 옛 기기가 두 장 지움
    const m = sm.mergeDefectRecord(clone(newDev), clone(oldDev));
    assert.deepStrictEqual(m.photoIds, ['d1_0'], '옛 기기의 삭제를 따른다(기록이 없어 누가 지웠는지 모름 → 예전 동작)');
    const lateNew = 'd1_u' + (450).toString(36).padStart(8, '0') + 'zz';
    const newDev2 = Object.assign(clone(newDev), { photoIds: newDev.photoIds.concat(lateNew) });
    assert.ok(sm.mergeDefectRecord(clone(newDev2), clone(oldDev)).photoIds.includes(lateNew),
        '옛 기기 변경보다 나중에 만든 사진은 살린다');
}

// ---- 10) 사진 ID의 생성 시각 읽기 ----
{
    const t = 1759100000000;
    assert.strictEqual(sm.photoIdCreatedAt('abc1234_u' + t.toString(36) + 'k3j9x2'), t);
    assert.strictEqual(sm.photoIdCreatedAt('abc1234_prev_u' + t.toString(36) + 'k3j9x2'), t);
    assert.strictEqual(sm.photoIdCreatedAt('abc1234_0'), 0);
}

// ---- 내용 칸 구분: 위치·번호·사진·시각은 내용이 아니다 ----
['x', 'no', 'groupId', 'photoIds', 'photos', 'fieldAt', 'photoState', 'updatedAt', '_representative']
    .forEach((k) => assert.strictEqual(sm.isDefectContentField(k), false, k));
['remark', 'location', 'crackWidth', 'defectType', 'isProgress'].forEach((k) => assert.strictEqual(sm.isDefectContentField(k), true, k));

console.log('test-field-photo-merge: ok');
