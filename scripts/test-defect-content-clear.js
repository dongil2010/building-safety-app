'use strict';
// 「내용 비우기 (핀 위치 유지)」(2026-10-20)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../js/core/defect-content-clear.js');
const SM = require('../js/core/sync-merge.js');

const old = {
    id: 'd1', no: 'NO.03', groupNo: 'NO.03', category: '구조체', component: '기둥', defectType: '균열', cause: '건조수축',
    size: '0.3x1200', crackWidth: '0.3', crackLength: '1200', itemCount: '2', crackMeasures: [{ w: 0.3 }],
    isProgress: true, isLeak: true, isCarriedOver: true, surveyRound: '2026_상반기', location: '3F X1-Y2', evalUnitId: 'u1',
    x: 300, y: 200, targetX: 250, targetY: 260, boxManual: true,
    photos: ['data:a', 'data:b'], photoIds: ['p1', 'p2'], prevRoundPhotos: ['data:old'], prevRoundPhotoIds: ['q1'],
    updatedAt: 1000, contentUpdatedAt: 1000, positionUpdatedAt: 900
};
const d = JSON.parse(JSON.stringify(old));
assert(C.hasContent(d));
assert.strictEqual(C.currentPhotoCount(d), 2);
assert(C.clearContentFields(d));
const ids = C.unlinkCurrentPhotos(d, d.photoIds.slice());
assert.deepStrictEqual(ids, ['p1', 'p2']);
// 비움
['component', 'defectType', 'cause', 'size', 'crackWidth', 'crackLength', 'itemCount'].forEach((k) => assert.strictEqual(d[k], '', k));
assert.deepStrictEqual(d.crackMeasures, []);
assert.strictEqual(d.isProgress, false);
assert.strictEqual(d.isLeak, false);
assert.deepStrictEqual(d.photos, []);
assert.deepStrictEqual(d.photoIds, []);
// 그대로
['id', 'no', 'groupNo', 'category', 'x', 'y', 'targetX', 'targetY', 'boxManual', 'surveyRound', 'location', 'evalUnitId', 'isCarriedOver'].forEach((k) => assert.deepStrictEqual(d[k], old[k], k));
assert.deepStrictEqual(d.prevRoundPhotos, old.prevRoundPhotos, '이전 회차 사진 유지');
assert.deepStrictEqual(d.prevRoundPhotoIds, old.prevRoundPhotoIds);
assert(!C.hasContent(d), '다시 누르면 비울 것 없음');

// 동기화: 앱처럼 바뀐 칸 시각(fieldAt)·사진 지움 기록(photoState)을 찍으면 서버의 옛 내용이 이기지 않는다
const now = 5000;
const diff = SM.changedContentFields(SM.defectContentHashes(old), d);
assert(diff.changed.includes('defectType') && !diff.changed.includes('x'), '내용 칸만 바뀜');
d.fieldAt = {}; d.contentBaseAt = 1000;
diff.changed.forEach((k) => { d.fieldAt[k] = now; });
d.fieldAtThrough = now; d.updatedAt = now; d.contentUpdatedAt = now;
d.photoState = { p1: now, p2: now }; d.photosUpdatedAt = now;
const server = JSON.parse(JSON.stringify(old));
const merged = SM.mergeDefectRecord(server, d, {});
assert.strictEqual(merged.defectType, '', '서버 옛 종류가 돌아오지 않음');
assert.strictEqual(merged.component, '');
assert.strictEqual(merged.crackWidth, '');
assert.strictEqual(merged.isProgress, false);
assert(!(merged.photoIds || []).includes('p1'), '뗀 사진이 돌아오지 않음');
assert.strictEqual(merged.x, 300);
assert.deepStrictEqual(merged.prevRoundPhotoIds, ['q1']);

// 앱 연결: 지금 층 키만, 확인창(개수), 되돌리기 스택, 칸·사진 시각, 층 올림 표시
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const body = app.slice(app.indexOf('async function clearDefectContentsOnFloor'), app.indexOf('window.clearDefectContentsOnFloor ='));
assert(/const floorKey = `\$\{state\.currentBuildingId\}_\$\{state\.currentFloor\}`;/.test(body), '지금 동·층만');
assert(/appConfirm\([\s\S]*마킹 \$\{targets\.length\}개/.test(body), '개수 확인');
assert(/pushDefectHistory\(\);/.test(body) && /snapshotBeforeBulkOp\('내용 비우기'/.test(body), '되돌리기·백업');
assert(/touchDefectUpdatedAt\(d\)/.test(body) && /recordDefectPhotoState\(d, beforeIds, \[\]\)/.test(body), '동기화 시각');
assert(!/deleteAllPhotosForDefect|deletePhoto/.test(body), '사진 파일은 지우지 않음');
assert(/markFloorKeyDirty\(floorKey\)/.test(body));
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(/id="btnClearDefectContents"[\s\S]{0,600}내용 비우기 \(핀 위치 유지\)/.test(idx));
assert(/js\/core\/defect-content-clear\.js/.test(idx));
console.log('test-defect-content-clear: ok');
