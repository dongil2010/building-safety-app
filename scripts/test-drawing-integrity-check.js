#!/usr/bin/env node
'use strict';

/**
 * 2026-11-17 이미 꼬인 층 자동 정리: 기기 도면 사본의 바이트 수를 서버 메타(size)와 비교하는 규칙.
 * app.js의 dataUrlByteLength / judgeLocalDrawingCopy를 잘라 와서 시험한다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const code = [
    extractFunction(src, 'function dataUrlByteLength('),
    extractFunction(src, 'function judgeLocalDrawingCopy('),
    'module.exports = { dataUrlByteLength, judgeLocalDrawingCopy };'
].join('\n');
const m = { exports: {} };
new Function('module', code)(m);
const { dataUrlByteLength, judgeLocalDrawingCopy } = m.exports;

// 바이트 수: 실제 Buffer 길이와 같아야 한다(패딩 0·1·2개)
[0, 1, 2, 3, 10, 1000, 4097].forEach((n) => {
    const buf = Buffer.alloc(n, 7);
    const url = 'data:image/jpeg;base64,' + buf.toString('base64');
    if (n === 0) assert.strictEqual(dataUrlByteLength(url), 0);
    else assert.strictEqual(dataUrlByteLength(url), n, 'bytes ' + n);
});
assert.strictEqual(dataUrlByteLength('https://example.invalid/a.jpg'), 0);
assert.strictEqual(dataUrlByteLength('data:image/svg+xml,<svg/>'), 0, 'base64 아니면 모름');
assert.strictEqual(dataUrlByteLength(null), 0);

const H = 3600 * 1000;
const now = Date.now();

// 같으면 ok
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 500 }), 'ok');
// 다르면 바꿈(교체 시각 기록이 없는 층)
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700 }), 'stale');
// 서버 사본이 마지막 교체 뒤(또는 15분 안)에 올라갔으면 서버를 믿는다
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, floorStampMs: now, serverUpdatedMs: now - 60 * 1000 }), 'stale');
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, floorStampMs: now - H, serverUpdatedMs: now }), 'stale');
// 서버 사본이 마지막 교체보다 한참 옛것이면(올리기 실패) 기기 쪽을 그대로 둔다
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, floorStampMs: now, serverUpdatedMs: now - 2 * H }), 'skip');
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, floorStampMs: now, serverUpdatedMs: 0 }), 'skip');
// 아직 서버에 못 올린 층·교체 직후·모르는 값은 건드리지 않는다
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, pendingUpload: true }), 'skip');
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 700, replaceGuarded: true }), 'skip');
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 0, serverSize: 700 }), 'skip');
assert.strictEqual(judgeLocalDrawingCopy({ localBytes: 500, serverSize: 0 }), 'skip');
assert.strictEqual(judgeLocalDrawingCopy(null), 'skip');

// 진입 경로가 검사를 예약하는지(온라인일 때)
const enter = fs.readFileSync(path.join(__dirname, '..', 'app', '02-buildings.js'), 'utf8');
assert.ok(/canFetchDrawings && typeof window\.scheduleFloorDrawingIntegrityCheck === 'function'/.test(enter));

console.log('test-drawing-integrity-check: ok');
