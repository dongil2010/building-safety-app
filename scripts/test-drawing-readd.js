'use strict';
// 도면 삭제 → 같은 층에 새 도면 → 동기화(두 기기) 회귀 테스트 (2026-10-13)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../js/core/drawing-floor-tombstone.js');
const R = require('../js/core/drawing-resize.js');
global.window = global;
require('../js/core/guide-shapes.js'); require('../js/core/member-count.js'); require('../js/core/drawing-memo.js');
require('../js/core/struct-members.js'); require('../js/core/eval-units.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
// app.js 건물 메타 병합과 같은 규칙: 묘비 합집합 + 시각 최대 + 다시 넣은 시각(LWW)
function mergeMeta(local, remote) {
    const m = clone(remote);
    m.deletedDrawingFloorCodes = T.mergeDeletedDrawingFloorCodes(local.deletedDrawingFloorCodes, remote.deletedDrawingFloorCodes);
    m.deletedDrawingFloorAt = T.mergeDeletedDrawingFloorAt(local.deletedDrawingFloorAt, remote.deletedDrawingFloorAt);
    m.drawingFloorRevivedAt = T.mergeDrawingFloorRevivedAt(local.drawingFloorRevivedAt, remote.drawingFloorRevivedAt);
    T.applyDrawingFloorRevivals(m, null);
    return m;
}
const del = (b) => T.isDeletedDrawingFloor ? T.isDeletedDrawingFloor(b, '3F') : (b.deletedDrawingFloorCodes || []).includes('3F');

let server = { id: 'B1', deletedDrawingFloorCodes: [], deletedDrawingFloorAt: {} };
let A = clone(server), Bdev = clone(server);
// A: 3F 도면 삭제 → 동기화
T.rememberDeletedDrawingFloor(A, '3F', null, 1000);
server = mergeMeta(A, server); A = clone(server);
Bdev = mergeMeta(Bdev, server);
assert(del(A) && del(Bdev), '삭제가 두 기기에 퍼져야 함');
// A: 같은 층에 새 도면(force forget) → 서버엔 아직 옛 묘비
T.forgetDeletedDrawingFloor(A, '3F', null, 2000);
assert(!del(A));
server = mergeMeta(A, server); A = mergeMeta(A, server);
assert(!del(A), '다시 넣은 도면이 다음 동기화에서 다시 지워지면 안 됨(옛 버그)');
Bdev = mergeMeta(Bdev, server);
assert(!del(Bdev), '다른 기기도 다시 넣은 층을 살려야 함');
// 옛 묘비만 든 기기(오프라인이던 C)가 나중에 올려도 되살아난 층 유지
const C = { id: 'B1', deletedDrawingFloorCodes: ['3F'], deletedDrawingFloorAt: { '3F': 1000 } };
server = mergeMeta(C, server);
assert(!del(server), '옛 묘비가 되살린 층을 이기면 안 됨');
// 다시 지우면 지우기가 이긴다
T.rememberDeletedDrawingFloor(Bdev, '3F', null, 1500); // 시계가 늦어도 revivedAt+1 이상
server = mergeMeta(Bdev, server); A = mergeMeta(A, server);
assert(del(server) && del(A), '다시 지운 것이 이겨야 함');

// PNG/JPG 교체도 다른 기기 새로고침 도장을 찍는다
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert(/if \(rasterUploaded\) stampFloorDrawingUpdated\(bldg, item\.floorCode\)/.test(app), '이미지 교체 때 floorPdfUpdatedAt 도장');
assert(/purgeFloorMarkings\?\.\(window\.state, floorKey/.test(app), '층 삭제 때 도면 위 표시 정리');

// 여러 동: 층 묶음에 건물 id, 남의 묶음은 안 읽고 안 덮음, 겹치는 칸은 건물 id 칸, 보관함 키에 동
assert(/buildingId: bldg\.id,\n\s*\/\/ 도면 메모/.test(app) || /buildingId: bldg\.id,/.test(app), '층 묶음에 buildingId');
assert(/bundle\.buildingId && bundle\.buildingId !== bldg\.id\) \{[\s\S]{0,200}return;/.test(app), '다른 동 묶음 무시');
assert(/readRes\.bundle\.buildingId !== floorBldg\.id[\s\S]{0,200}floorsSkipWrite\.add/.test(app), '다른 동 칸 덮어쓰기 금지');
assert(/owner !== bldg\.id\) dongKey = siteVaultDocId\(`b_\$\{bldg\.id\}`\)/.test(app), '겹치는 동 칸 분리');
assert(!/normalizeSiteVaultKey\(bldg\.name\)/.test(app.replace(/function siteVaultKeyForBuilding[\s\S]*?\n    \}/, '')), '보관함 키는 동 포함 함수로');
assert(/refreshDue \? Promise\.resolve\(null\) : fetchSiteVaultPdf/.test(app), '새 도면은 보관함 옛 PDF로 덮지 않음');

// 도면 크기 변화 감지 + 결함 좌표 비율 조정
const store = { m: {}, getItem(k) { return this.m[k] || null; }, setItem(k, v) { this.m[k] = v; } };
assert.strictEqual(R.noteDims(store, 'k', 'B1_3F', 1000, 800, 's1'), null);
assert.strictEqual(R.noteDims(store, 'k', 'B1_3F', 1200, 800, 's1'), null, '같은 도면(해상도 차이)은 묻지 않음');
const ch = R.noteDims(store, 'k', 'B1_3F', 2000, 1600, 's2');
assert(ch && ch.from.w === 1200 && ch.to.w === 2000);
const d = { x: 100, y: 50, points: [{ x: 10, y: 20 }] };
R.scaleDefect(d, 2, 3);
assert.deepStrictEqual([d.x, d.y, d.points[0].x, d.points[0].y], [200, 150, 20, 60]);

// 층 삭제 때 가이드·개수 점·메모·평가 구역이 묘비와 함께 지워진다
const B = global.BSA;
const st = {
    guideShapes: { B1_3F: [{ id: 'g1', x1: 0, y1: 0, x2: 1, y2: 1, updatedAt: 5 }] },
    memberCounts: { B1_3F: [{ id: 'c1', x: 1, y: 1, updatedAt: 5 }] },
    drawingMemos: { B1_3F: [{ id: 'm1', x: 1, y: 1, text: 'a', updatedAt: 5 }] },
    evalUnits: { B1_3F: [{ id: 'u1', updatedAt: 5 }] }
};
const out = R.purgeFloorMarkings(st, 'B1_3F', B, 10);
assert.deepStrictEqual([out.guides, out.counts, out.memos, out.evalUnits], [1, 1, 1, 1]);
assert(!st.guideShapes.B1_3F.length && st.deletedGuideShapeIds.B1_3F.includes('g1'));
assert(st.deletedMemberCountIds.B1_3F.includes('c1') && st.deletedMemoIds.B1_3F.includes('m1') && st.deletedEvalUnitIds.B1_3F.includes('u1'));
console.log('test-drawing-readd: ok');
