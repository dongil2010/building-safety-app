#!/usr/bin/env node
'use strict';
/** 2026-11-04 진행률 창 「건물 정보(점검날짜 등)」 줄 ? 점검날짜만 바꿨는데 층 단위 「기타 변경」으로만 보이던 문제 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/core/sync-progress.js');
const mem = {};
const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
let t = 1000;
const tr = P.createTracker({ storage, storageKey: () => 'k', now: () => t });
const row = (s, kind) => s.rows.find((r) => r.kind === kind);

// 점검날짜만 바꿈: 층은 안 바뀜 → 건물 정보 줄 하나, 기타 변경 없음
let s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: ['bC', 'bD'], online: true });
assert.deepStrictEqual({ p: row(s, 'bldg').pending, l: row(s, 'bldg').label }, { p: 2, l: '건물 정보(점검날짜 등)' });
assert.ok(!row(s, 'other'), '층 단위 기타 변경으로 세지 않음');
assert.strictEqual(s.pending, 2);
assert.ok(P.pillText(s).includes('2'));

// 올리기 시작 → 실패(목록 그대로) → 남음, 실패 표시
tr.startSession([]);
tr.noteFailure('sync', '서버 동기화 실패');
s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: ['bC', 'bD'], online: true, syncing: true });
assert.deepStrictEqual([row(s, 'bldg').done, row(s, 'bldg').total], [0, 2]);
assert.strictEqual(s.failures.length, 1);
const html = P.renderPanelHtml(s, (w) => (w === 'sync' ? '건물 정보·회사 동기화' : w));
assert.ok(html.includes('건물 정보(점검날짜 등)') && html.includes('건물 정보·회사 동기화'), '실패가 그 줄과 함께 보임');

// 성공(앱이 _pendingCloudSync를 지움 = 목록에서 빠짐) → 올라감
tr.clearFailure('sync');
t += 1000;
s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: [], online: true, syncing: false });
assert.deepStrictEqual([row(s, 'bldg').done, row(s, 'bldg').total, row(s, 'bldg').pending], [2, 2, 0]);
assert.ok(s.allDone && s.finishedNow);

// 다음에 또 고치면 새로 센다
s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: ['bC'], online: true });
assert.strictEqual(row(s, 'bldg').pending, 1);
tr.startSession([]);
s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: ['bC'], online: true });
s = tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: [], online: true });
assert.deepStrictEqual([row(s, 'bldg').done, row(s, 'bldg').total], [1, 1]);

// 건물별(summaryFor): 그 건물만
tr.startSession([]);
let g = tr.summaryFor({ dirtyFloorKeys: ['bD_1F'], pendingBuildingIds: ['bD'], online: true }, 'bD_');
assert.strictEqual(row(g, 'bldg').pending, 1);
assert.strictEqual(row(g, 'other').pending, 1);
g = tr.summaryFor({ dirtyFloorKeys: [], pendingBuildingIds: ['bD'], online: true }, 'bC_');
assert.ok(!row(g, 'bldg'), '다른 건물은 안 셈');
tr.summary({ dirtyFloorKeys: [], pendingBuildingIds: [], online: true });
g = tr.summaryFor({ dirtyFloorKeys: [], pendingBuildingIds: [], online: true }, 'bD_');
assert.strictEqual(row(g, 'bldg').done, 1);

// 일지에 bldg를 직접 적을 수 없음(층 기록과 섞이지 않게)
assert.strictEqual(tr.record('bldg', 'x', ''), 0);
// ctx 없이(옛 호출) 부르면 예전과 같음
s = tr.summary({ dirtyFloorKeys: [] });
assert.ok(!row(s, 'bldg'));

// 앱 연결
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/\.filter\(\(b\) => b && b\.id && b\._pendingCloudSync\)\.map\(\(b\) => String\(b\.id\)\);[\s\S]{0,200}dirtyFloorKeys: dirty,\s*pendingBuildingIds,/.test(app), '진행률에 올릴 건물 정보 목록');
assert.ok(app.includes("if (fk === 'sync') return '건물 정보·회사 동기화';"));
console.log('test-sync-progress-building-info: ok');
