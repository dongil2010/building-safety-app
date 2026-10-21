#!/usr/bin/env node
'use strict';
/** 2026-10-21 회차별 보고서/결함위치도 작성완료 — 체크·해제, 배지(최신 회차만), 동기화 병합 */
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const rd = require(path.join(root, 'js', 'core', 'round-done.js'));
const mm = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));
const clone = (v) => JSON.parse(JSON.stringify(v));

const b25 = { id: 'a', siteName: '창평', inspectionYear: '2025년', inspectionPeriod: '하반기' };
const b26 = { id: 'b', siteName: '창평', inspectionYear: '2026년', inspectionPeriod: '상반기' };
assert.deepStrictEqual(rd.latestBadges([b25, b26]), [], '체크 없으면 배지 없음');

assert.strictEqual(rd.setDone(b25, 'report', true, '정병수', 1000), true);
assert.strictEqual(rd.setDone(b25, 'report', true, '정병수', 1001), false, '같은 값이면 안 바뀜');
assert.strictEqual(b25.roundDone.report.by, '정병수');
let badges = rd.latestBadges([b25, b26]);
assert.deepStrictEqual(badges.map((x) => x.text), ['2025년 하반기 보고서 작성완료']);

// 새 회차 체크 → 옛 회차 배지는 숨김(기록은 남음)
rd.setDone(b26, 'report', true, '김', 2000);
rd.setDone(b25, 'defectMap', true, '김', 2100);
badges = rd.latestBadges([b25, b26]);
assert.deepStrictEqual(badges.map((x) => x.text), ['2026년 상반기 보고서 작성완료', '결함위치도 작성완료']);
assert.strictEqual(badges[1].roundKey, '2025년_하반기', '위치도는 체크된 최신 회차(2025 하반기)');
assert.strictEqual(rd.isDone(b25, 'report'), true, '옛 회차 기록 유지');

// 해제
rd.setDone(b26, 'report', false, '김', 3000);
assert.strictEqual(rd.isDone(b26, 'report'), false);
assert.deepStrictEqual(rd.latestBadges([b25, b26]).map((x) => x.text)[0], '2025년 하반기 보고서 작성완료');

// 반기 없는 회차는 회차 이름
assert.strictEqual(rd.badgeText('report', '2026년_수시점검'), '2026년 수시점검 보고서 작성완료');

// 여러 동: 모든 동이 체크돼야 완료
const d1 = { inspectionYear: '2026년', inspectionPeriod: '하반기' };
const d2 = clone(d1);
rd.setDone(d1, 'report', true, 'x', 10);
assert.strictEqual(rd.latestBadges([d1, d2]).length, 0);
rd.setDone(d2, 'report', true, 'x', 11);
assert.strictEqual(rd.latestBadges([d1, d2]).length, 1);

// 동기화: 칸 시각(fieldAt) 병합 — A는 보고서, B는 위치도를 체크 → 둘 다 남음
const server = { id: 'b1', name: '창평', inspectionYear: '2026년', inspectionPeriod: '하반기', metaUpdatedAt: 100 };
const A = mm.overlay(clone(server), clone(server), server);
const B = mm.overlay(clone(server), clone(server), server);
rd.setDone(A, 'report', true, 'A', 5000); mm.markDirty(A, 5000);
assert.ok(A.metaFieldAt && A.metaFieldAt.roundDone, 'roundDone 칸 시각');
rd.setDone(B, 'defectMap', true, 'B', 6000); mm.markDirty(B, 6000);
const srv2 = mm.overlay(clone(server), B, server); // B 업로드
const mergedA = mm.overlay(clone(srv2), A, srv2);   // A가 받음
assert.strictEqual(rd.isDone(mergedA, 'report'), true, 'A 보고서 유지');
assert.strictEqual(rd.isDone(mergedA, 'defectMap'), true, 'B 위치도 유지');
// 해제도 나중 시각이면 이김
rd.setDone(B, 'defectMap', false, 'B', 9000); mm.markDirty(B, 9000);
const m3 = mm.overlay(clone(mergedA), B, mergedA);
assert.strictEqual(rd.isDone(m3, 'defectMap'), false, '해제가 동기화됨');
assert.strictEqual(rd.isDone(m3, 'report'), true);
console.log('test-round-done: ok');
