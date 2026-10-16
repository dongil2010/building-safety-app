#!/usr/bin/env node
'use strict';
/**
 * 2026-10-16 「마킹 이동도 수정으로 판단하나? 사진 넣은 뒤에 적용되나? 꼬일 가능성」 분석의 재현 시나리오 회귀 테스트.
 * S1 자동 행·열 칸 이름은 위치 갈래 / S2 되돌리기는 바뀐 갈래만 / S3 시각 단조·서버 보정 /
 * S4 사진 순서 별도 / S6 소속 갈리면 박스 자리도 / S5 사진 미로드 삭제 막기·지움 기록 90일.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
global.window = global.window || {};
const sm = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const base = () => ({
    id: 'pin-1', no: '1', x: 10, y: 10, targetX: 20, targetY: 20, location: 'A동', gridLoc: 'X1-Y1', remark: '',
    updatedAt: 1000, contentUpdatedAt: 1000, positionUpdatedAt: 1000, fieldAt: {}, contentBaseAt: 1000, fieldAtThrough: 1000,
    photoIds: ['pin-1_ua', 'pin-1_ub'], photoState: {}, photosUpdatedAt: 1000
});
const m = (s, l, sd = {}, ld = {}, sa = {}, la = {}) => sm.mergeDefectsMaps({ F: s }, { F: l }, sd, ld, sa, la);

// S1: 지운 뒤 다른 기기가 옮김 + 자동 gridLoc(칸 시각만, 내용 시각 그대로) → 삭제 유지, 이동은 사라짐(의도)
{
    const B = base(); B.x = 50; B.positionUpdatedAt = 2000; B.gridLoc = 'X2-Y1'; B.fieldAt.gridLoc = 2000;
    const r = m([], [B], { F: ['pin-1'] }, {}, { F: { 'pin-1': 1000 } }, {});
    assert.strictEqual(r.defects.F.length, 0, 'S1 자동 칸 이름 변경이 삭제를 이기면 안 됨');
    // 자동 gridLoc은 칸별로 나중 것이 이김(내용 병합)
    const A = base(); A.remark = '균열'; A.fieldAt.remark = 1500; A.contentUpdatedAt = 1500; A.fieldAtThrough = 1500;
    const r2 = m([A], [B]);
    assert.strictEqual(r2.defects.F[0].gridLoc, 'X2-Y1');
    assert.strictEqual(r2.defects.F[0].remark, '균열');
    assert.strictEqual(r2.defects.F[0].x, 50);
}
// S1 app.js 연결
{
    const fn = app.slice(app.indexOf('function applyGridAutoLocationToDefect('), app.indexOf('function applyGridAutoLocationToDefect(') + 2000);
    assert.ok(/if \(d\.location !== locBefore\) touchDefectUpdatedAt\(d\);\s*else touchDefectGridLocAuto\(d\);/.test(fn), 'S1 자동 gridLoc → touchDefectGridLocAuto(위치칸까지 바뀐 옛 정리만 내용)');
    const g = app.slice(app.indexOf('function touchDefectGridLocAuto('), app.indexOf('function touchDefectGridLocAuto(') + 1500);
    assert.ok(!/contentUpdatedAt\s*=/.test(g), 'S1 내용 시각 안 올림');
    assert.ok(/fieldAt\.gridLoc = bsaStampAfter/.test(g));
}
// S2: 내용만 되돌린 기기 vs 다른 기기 이동 — 위치는 이동한 쪽
{
    const A = base(); A.contentUpdatedAt = 3000; A.updatedAt = 3000; A.fieldAt = { remark: 3000 }; A.fieldAtThrough = 3000;
    const Bm = base(); Bm.x = 99; Bm.positionUpdatedAt = 2500; Bm.updatedAt = 2500;
    assert.strictEqual(m([Bm], [A]).defects.F[0].x, 99, 'S2 내용 되돌리기가 위치를 덮으면 안 됨');
    const rec = app.slice(app.indexOf('function reconcileDefectHistoryJump('), app.indexOf('function undoDefectChange('));
    assert.ok(/const br = defectHistoryBranchDiff\(prev, d\);/.test(rec));
    assert.ok(/if \(br\.content\) touchDefectUpdatedAt\(d\);/.test(rec));
    assert.ok(/if \(br\.position\) touchDefectPositionUpdatedAt\(d\);/.test(rec));
    assert.ok(!/\} else if \(JSON\.stringify\(prev\) !== JSON\.stringify\(d\)\) \{\s*touchDefectUpdatedAt\(d\);\s*touchDefectPositionUpdatedAt\(d\);/.test(rec), 'S2 예전 통째 찍기 제거');
}
// S3: 시각 단조 + 서버 보정
{
    assert.ok(/function bsaStampAfter\(prev\) \{\s*return Math\.max\(bsaSyncNow\(\), \(Number\(prev\) \|\| 0\) \+ 1\);/.test(app));
    assert.ok(/defect\.positionUpdatedAt = bsaStampAfter\(defect\.positionUpdatedAt\);/.test(app));
    assert.ok(/defect\.photosUpdatedAt = bsaStampAfter\(defect\.photosUpdatedAt\);/.test(app));
    assert.ok(/function measureServerClockOffset\(/.test(app) && /void measureServerClockOffset\(false\)/.test(app));
    // 단조: 늦은 시계 기기가 받은 기록(2000)을 옮기면 2001 이상 → 이김
    const A3 = base(); A3.x = 30; A3.positionUpdatedAt = 2000;
    const B3 = Object.assign({}, A3, { x: 70, positionUpdatedAt: Math.max(1500, A3.positionUpdatedAt + 1) });
    assert.strictEqual(m([A3], [B3]).defects.F[0].x, 70, 'S3 받은 뒤 옮긴 건 시계가 늦어도 이김');
}
// S4: 대표 사진(순서) 바꾼 쪽 순서 + 상대 추가분은 뒤
{
    const A5 = base(); A5.photoIds = ['pin-1_ub', 'pin-1_ua']; A5.photosUpdatedAt = 2000; A5.photoOrderAt = 2000;
    const B4 = base(); B4.photoIds = ['pin-1_ua', 'pin-1_ub', 'pin-1_uc']; B4.photosUpdatedAt = 2500;
    assert.deepStrictEqual(m([A5], [B4]).defects.F[0].photoIds, ['pin-1_ub', 'pin-1_ua', 'pin-1_uc'], 'S4 순서 유지 + 추가는 뒤');
    // 삭제 + 추가는 예전처럼
    const A4 = base(); A4.photoIds = ['pin-1_ua']; A4.photoState = { 'pin-1_ub': 2000 }; A4.photosUpdatedAt = 2000;
    assert.deepStrictEqual(m([A4], [B4]).defects.F[0].photoIds, ['pin-1_ua', 'pin-1_uc']);
}
// S6: 통합 해제(소속 나중) vs 공유 박스 이동 → 풀린 마킹은 자기 박스 자리
{
    const A6 = base(); A6.groupUpdatedAt = 3000; A6.x = 200; A6.positionUpdatedAt = 3000;
    const B6 = base(); B6.groupId = 'g1'; B6.groupUpdatedAt = 1500; B6.x = 150; B6.positionUpdatedAt = 3500;
    const r = m([A6], [B6]).defects.F[0];
    assert.strictEqual(r.groupId, undefined);
    assert.strictEqual(r.x, 200, 'S6 소속 갈리면 박스 자리는 소속 정한 쪽');
    // 소속이 같으면 위치 시각 규칙 그대로
    const C = base(); C.x = 300; C.positionUpdatedAt = 4000;
    assert.strictEqual(m([base()], [C]).defects.F[0].x, 300);
}
// S5: 사진 미로드 삭제 막기 + 지움 기록 90일
{
    const rm = app.slice(app.indexOf('window.removePendingPhoto = async function'), app.indexOf('window.removePendingPhoto = async function') + 600);
    assert.ok(/_defectPhotosComplete === false/.test(rm), 'S5 미로드 상태 삭제 막기');
    const rs = app.slice(app.indexOf('function recordDefectPhotoState('), app.indexOf('function recordDefectPhotoState(') + 2600);
    assert.ok(/90 \* 24 \* 3600 \* 1000/.test(rs), 'S5 90일 기준');
    assert.ok(!/gone\.slice\(60\)/.test(rs), 'S5 60개 자르기 제거');
    assert.ok(/defect\.photoOrderAt = bsaStampAfter/.test(rs), 'S4 순서 시각 기록');
}
// 메모: 손글씨 메모 = 도면 메모 목록 항목(손글씨 메모-1, -2 …), 자리 저장·옛 장은 차례대로
{
    const sk = require(path.join(__dirname, '..', 'js', 'core', 'sketch-memo.js'));
    const st = {};
    const r1 = sk.saveSheet(st, 'F', { strokes: [{ c: '#000', w: 3, p: [1, 1, 50, 5, 5, 50] }], x: 100, y: 200 }, 1000);
    const r0 = { id: 'old', w: 1200, h: 1600, strokes: [], createdAt: 500, updatedAt: 500 };
    st.sketchMemos.F.push(r0);
    assert.strictEqual(r1.x, 100); assert.strictEqual(r1.y, 200);
    assert.strictEqual(sk.packFor(st, 'F').items.find((i) => i.id === r1.id).x, 100, '자리도 동기화');
    assert.strictEqual(sk.labelFor(st, 'F', 'old'), '손글씨 메모-1');
    assert.strictEqual(sk.labelFor(st, 'F', r1.id), '손글씨 메모-2');
    const pt = sk.placedPoint(st, 'F', r0, 1000, 1000);
    assert.ok(pt.legacy && pt.x === 40 && pt.y === 60, '옛 장은 왼쪽 위부터');
    const again = sk.saveSheet(st, 'F', { id: r1.id, strokes: [] }, 2000);
    assert.strictEqual(again.x, 100, '다시 저장해도 자리 유지');
    assert.ok(/memoAddKind === 'sketch' && typeof window\.openSketchMemo === 'function'/.test(app), '메모 모드에서 손글씨로 추가');
    assert.ok(/id: 'sk:' \+ r\.id, sketchId: r\.id/.test(app), '도면 메모 겹층에 손글씨 항목');
}
console.log('test-sync-branch-conflicts OK');
