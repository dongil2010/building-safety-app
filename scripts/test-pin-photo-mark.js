'use strict';
// 2026-11-10 「마킹에 사진을 찍어 놨으면 네모마킹에도 보이게, 한글 출력에는 안 보이게」
// 번호칸 카메라 표시: 현차 사진만(전차 제외), 묶음은 구성원 중 하나라도, 본 화면 캔버스에만(출력 미포함).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

let groupMembers = [];
const defectHasPhotoMark = new Function('getDefectMarkingGroupMembers',
    extractFunction(app, 'function defectHasCurrentPhoto(') + '\n'
    + extractFunction(app, 'function defectHasPhotoMark(') + '\nreturn defectHasPhotoMark;')(() => groupMembers);

assert.strictEqual(defectHasPhotoMark(null), false);
assert.strictEqual(defectHasPhotoMark({}), false);
assert.strictEqual(defectHasPhotoMark({ photos: [], photoIds: [] }), false);
assert.strictEqual(defectHasPhotoMark({ photos: ['', null] }), false, '빈 칸만 있으면 사진 없음');
assert.strictEqual(defectHasPhotoMark({ photos: ['data:image/jpeg;base64,x'] }), true);
assert.strictEqual(defectHasPhotoMark({ photoIds: ['p1'] }), true, '사진을 아직 안 받아 온 기기(ID만)도 표시');
assert.strictEqual(defectHasPhotoMark({ prevRoundPhotos: ['x'], prevRoundPhotoIds: ['q1'] }), false, '전차 사진은 제외');

// 묶음(한 번호에 마킹 여러 개): 대표가 아닌 마킹에 넣은 사진도 번호칸에 표시
groupMembers = [{ id: 'a' }, { id: 'b', photoIds: ['p2'] }];
assert.strictEqual(defectHasPhotoMark({ id: 'a', groupId: 'g1' }), true);
groupMembers = [{ id: 'a' }, { id: 'b' }];
assert.strictEqual(defectHasPhotoMark({ id: 'a', groupId: 'g1' }), false);

// 화면에만: drawPinBody에서 본 화면 캔버스(state.ctx)일 때만 그린다 — 비파괴 위치도 출력도 drawPin을 쓰기 때문
const pinBody = extractFunction(app, 'function drawPinBody(');
assert.ok(pinBody.includes('if (ctx === state.ctx && defectHasPhotoMark(defect)) drawPhotoChrome(ctx, w, h, scale);'));
assert.strictEqual((app.match(/drawPhotoChrome\(/g) || []).length, 2, '정의 1 + 화면 호출 1');
const safe = app.slice(app.indexOf('function drawPinSafe('), app.indexOf('window.buildVectorPinDrawPlan'));
assert.ok(safe.length > 1000 && !safe.includes('PhotoChrome') && !safe.includes('defectHasPhotoMark'), 'PDF/한글 drawPinSafe에는 없음');
const plan = app.slice(app.indexOf('window.buildVectorPinDrawPlan'), app.indexOf('window.buildVectorPinDrawPlan') + 3500);
assert.ok(!plan.includes('PhotoChrome') && !plan.includes('defectHasPhotoMark'), '벡터 PDF 플랜에도 없음');

console.log('test-pin-photo-mark: ok');
