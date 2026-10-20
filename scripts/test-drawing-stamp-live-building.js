'use strict';
// 2026-10-20 고흥군립남부도서관 외부 도면: PC와 폰 위치도가 어긋남.
// 건물 수정창 저장이 시작할 때 잡은 건물 객체에 「도면 다시 넣은 시각」을 찍는 동안, 동기화가 state.buildings를
// 새 병합 객체로 바꾸면 시각이 옛 객체에만 남아 클라우드에 안 올라갔다 → 다른 기기가 옛 도면을 계속 썼다.
// stampFloorDrawingUpdated는 지금 살아 있는 같은 건물 객체에도 시각을 찍어야 한다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const src = extractFunction(app, 'function stampFloorDrawingUpdated(');

const applied = {};
const dirty = [];
const ctx = {
    window: { state: null },
    state: null,
    markBuildingMetaDirty: (b) => { dirty.push(b); b._pendingCloudSync = true; },
    markFloorDrawingApplied: (id, fc, ts) => { applied[id + '_' + fc] = ts; },
    Date, Set, Object
};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.stampFloorDrawingUpdated = stampFloorDrawingUpdated;', ctx);

// 저장 핸들러가 잡은 옛 객체(orphan)와, 동기화가 바꿔 넣은 살아 있는 객체(live)
const orphan = { id: 'b1', floorPdfUpdatedAt: { EXT: 100, '1F': 50 } };
const live = { id: 'b1', floorPdfUpdatedAt: { EXT: 100, '1F': 50 } };
const other = { id: 'b2', floorPdfUpdatedAt: { EXT: 7 } };
ctx.window.state = { buildings: [live, other] };
ctx.state = { currentBuilding: live };

const ts = ctx.stampFloorDrawingUpdated(orphan, 'EXT');
assert.ok(ts > 100);
assert.strictEqual(orphan.floorPdfUpdatedAt.EXT, ts, '잡은 객체');
assert.strictEqual(live.floorPdfUpdatedAt.EXT, ts, '살아 있는 객체에도(클라우드로 올라갈 쪽)');
assert.strictEqual(live.floorPdfUpdatedAt['1F'], 50, '다른 층 시각은 그대로');
assert.strictEqual(other.floorPdfUpdatedAt.EXT, 7, '다른 건물은 안 건드림');
assert.ok(dirty.includes(live) && dirty.includes(orphan), '둘 다 올릴 것으로 표시');
assert.strictEqual(applied.b1_EXT, ts);

// 같은 객체면 한 번만
dirty.length = 0;
ctx.window.state = { buildings: [live] };
ctx.state = { currentBuilding: live };
ctx.stampFloorDrawingUpdated(live, '1F');
assert.strictEqual(dirty.length, 1, '같은 객체는 한 번');

console.log('test-drawing-stamp-live-building: ok');
