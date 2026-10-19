#!/usr/bin/env node
'use strict';
/**
 * 2026-10-19 건물 메타 칸별 시각 비교 — 「업로드 대기」 표시만으로 로컬 메타가 통째로 이기지 않는다.
 * A가 오프라인에서 준공일만 고침, B가 그 사이 건물명·점검자를 고침 → A가 다시 연결돼도 B의 수정이 남는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const api = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));

const clone = (v) => JSON.parse(JSON.stringify(v));
function merge(remote, local) {
    return api.overlay(Object.assign({}, clone(remote)), local, remote);
}

const serverV0 = { id: 'b1', name: '창평 1동', inspector: '김', completionDate: '', metaUpdatedAt: 1000 };

// 두 기기 모두 같은 서버 상태에서 시작(병합 1번 → 본 값 기록)
const A = merge(serverV0, clone(serverV0));
const B = merge(serverV0, clone(serverV0));
assert.ok(A._metaFieldHash && A._metaFieldHash.name, '본 값 기록');

// A 오프라인: 준공일만
A.completionDate = '1998-05-01';
api.markDirty(A, 2000);
assert.deepStrictEqual(Object.keys(A.metaFieldAt), ['completionDate'], '바꾼 칸에만 시각');
assert.strictEqual(A._pendingCloudSync, true);

// B 온라인: 건물명·점검자를 더 나중에
B.name = '창평 1동(본관)';
B.inspector = '이';
api.markDirty(B, 3000);
assert.deepStrictEqual(Object.keys(B.metaFieldAt).sort(), ['inspector', 'name']);
const serverV1 = (() => { const s = clone(B); delete s._metaFieldHash; delete s._pendingCloudSync; return s; })();

// A 다시 연결 → 서버(B 수정)와 병합
const m = merge(serverV1, A);
assert.strictEqual(m.completionDate, '1998-05-01', 'A가 고친 준공일은 남는다');
assert.strictEqual(m.name, '창평 1동(본관)', 'B가 고친 건물명이 A의 옛 값에 덮이지 않는다');
assert.strictEqual(m.inspector, '이');
assert.strictEqual(m._pendingCloudSync, true, '올릴 것 표시는 유지');
assert.deepStrictEqual(m.metaFieldAt, { completionDate: 2000, inspector: 3000, name: 3000 }, '칸 시각은 양쪽 중 나중');
assert.strictEqual(m.metaUpdatedAt, 3000);

// 같은 칸: 더 나중에 고친 쪽
{
    // B의 수정을 못 본 기기가 더 이르게 고친 것 → 서버(B) 값
    const L = merge(serverV0, clone(serverV0));
    L.name = '옛 이름';
    api.markDirty(L, 2500);                  // 서버의 name(3000)보다 이른 수정
    assert.strictEqual(merge(serverV1, L).name, '창평 1동(본관)');
    // B의 값을 받은 뒤 고친 것 → 이 기기 시계가 늦어도(2500) 본 시각 뒤로 찍혀 이긴다
    const L2 = merge(serverV1, clone(serverV1));
    L2.name = '새 이름';
    api.markDirty(L2, 2500);
    assert.strictEqual(L2.metaFieldAt.name, 3001);
    assert.strictEqual(merge(serverV1, L2).name, '새 이름');
}

// 일부러 비운 칸(칸 시각 있음)은 비운 값이 이긴다 / 옛 데이터의 빈칸은 서버 값을 지우지 않는다
{
    const L = merge(serverV1, clone(serverV1));
    L.inspector = '';
    api.markDirty(L, 5000);
    assert.strictEqual(merge(serverV1, L).inspector, '');
    const legacy = { id: 'b1', inspector: '', metaUpdatedAt: 9000, _pendingCloudSync: true };
    assert.strictEqual(merge(serverV1, legacy).inspector, '이');
}

// 본 값 기록 없이 고친 경우(배포 직후 첫 수정): 모든 칸에 시각 — 예전처럼 로컬이지만 시각으로 비교
{
    const L = { id: 'b1', name: 'X', inspector: 'Y' };
    api.markDirty(L, 6000);
    assert.deepStrictEqual(Object.keys(L.metaFieldAt).sort(), ['inspector', 'name']);
    const r = merge(serverV1, L);
    assert.strictEqual(r.name, 'X');
}

// 수정 표시 없이 바뀐 칸도 병합 때 찾아서 그 기기의 마지막 수정 시각으로
{
    const L = merge(serverV1, clone(serverV1));
    L.metaUpdatedAt = 7000;
    L.notes = '메모';
    const r = merge(serverV1, L);
    assert.strictEqual(r.notes, '메모');
    assert.strictEqual(r.metaFieldAt.notes, 7000);
}

// 서버로 올릴 때 기기 전용 지문은 뺀다
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(/_pendingCloudSync, _trashRestoredAt, _metaFieldHash, \.\.\.rest/.test(app), 'sanitizeBuildingMetaForFirestore가 _metaFieldHash를 뺀다');
const src = fs.readFileSync(path.join(root, 'js', 'core', 'building-meta-merge.js'), 'utf8');
assert.ok(!/if \(shouldKeepLocal\(localMatch, remote\)\) applyLocal\(merged, localMatch\);/.test(src), 'overlay가 더는 통째로 로컬을 얹지 않음');

console.log('test-building-meta-field-merge: ok');
