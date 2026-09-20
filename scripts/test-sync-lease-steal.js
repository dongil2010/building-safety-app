#!/usr/bin/env node
'use strict';

/**
 * 동기화 잠금(syncLease) 강제 탈취 방지 — R-07.
 *
 * 예전에는 45초를 기다린 뒤 잠금을 **다시 읽지도 않고** 덮어썼다.
 * 그런데 죽은 기기의 잠금은 heartbeat가 끊겨 60초면 저절로 만료된다.
 * 즉 45초를 버틴 보유자는 대개 살아서 실제로 업로드 중인 기기다.
 * 하필 그때 뺏으면 두 기기가 같은 문서에 동시에 쓴다 — 2026-09-19에 층끼리
 * 결함이 섞인 사고와 같은 종류의 경합이다.
 *
 * 여기서는 (1) 잠금 신선도 판정을 실제로 실행해 검증하고,
 * (2) 탈취 경로가 다시 무조건 덮어쓰기로 돌아가지 않았는지 소스로 확인한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 저장소가 CRLF로 체크아웃되므로 줄끝을 맞춰놓고 다룬다
const APP = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8')
    .replace(/\r\n/g, '\n');

/** app.js 안의 함수 하나를 소스에서 떼어낸다 (들여쓰기 4칸 기준) */
function extractFunction(name) {
    const start = APP.indexOf('    function ' + name + '(');
    assert.ok(start >= 0, name + ' 함수를 app.js에서 못 찾았다 (이름이 바뀌었나?)');
    const end = APP.indexOf('\n    }\n', start);
    assert.ok(end > start, name + ' 함수의 끝을 못 찾았다');
    return APP.slice(start, end + '\n    }\n'.length);
}

const SYNC_LEASE_STALE_MS = 60000;
const sandbox = new Function(
    'SYNC_LEASE_STALE_MS',
    extractFunction('isSyncLeaseFresh')
    + extractFunction('isForeignSyncLease')
    + 'return { isSyncLeaseFresh: isSyncLeaseFresh, isForeignSyncLease: isForeignSyncLease };'
)(SYNC_LEASE_STALE_MS);

const { isSyncLeaseFresh, isForeignSyncLease } = sandbox;
const NOW = 1_700_000_000_000;

/* ------------------------------------------------------------------ */

function testFreshLeaseIsFresh() {
    const lease = { token: 't1', heartbeatAt: NOW - 5000 };
    assert.strictEqual(isSyncLeaseFresh(lease, NOW), true,
        '5초 전 heartbeat는 살아있는 잠금이다');
}

function testDeadDeviceExpires() {
    // 기기가 죽으면 heartbeat가 멈춘다 → 60초 뒤 저절로 만료된다.
    // 이게 있기 때문에 강제 탈취가 필요 없다.
    const lease = { token: 't1', heartbeatAt: NOW - 61000 };
    assert.strictEqual(isSyncLeaseFresh(lease, NOW), false,
        '죽은 기기의 잠금은 만료돼야 한다 — 이게 안 되면 강제 탈취가 다시 필요해진다');
}

function testFutureClockSkewExpires() {
    // 시계가 틀어진 태블릿이 미래 시각을 써두면, 예전 판정으로는 이 잠금이
    // 영원히 "살아있음"이 돼 모두의 동기화를 막는다.
    const lease = { token: 't1', heartbeatAt: NOW + 3600_000 };
    assert.strictEqual(isSyncLeaseFresh(lease, NOW), false,
        '말이 안 되게 미래인 heartbeat는 만료로 봐야 한다 (시계 틀어진 기기가 모두를 막는다)');
}

function testSmallSkewStillFresh() {
    // 초 단위 오차까지 만료로 보면 멀쩡한 잠금을 뺏게 된다
    const lease = { token: 't1', heartbeatAt: NOW + 3000 };
    assert.strictEqual(isSyncLeaseFresh(lease, NOW), true,
        '몇 초 앞선 시계는 정상 범위로 봐야 한다');
}

function testOwnLeaseIsNotForeign() {
    const lease = { token: 'mine', heartbeatAt: NOW, ownerId: 'u1', deviceId: 'd1' };
    assert.strictEqual(isForeignSyncLease(lease, 'mine', 'u1', 'd1', NOW), false,
        '내 토큰이면 남의 잠금이 아니다');
    assert.strictEqual(isForeignSyncLease(lease, 'other', 'u1', 'd1', NOW), false,
        '같은 기기면 즉시 회수할 수 있어야 한다');
}

function testLiveForeignLeaseIsForeign() {
    const lease = { token: 'theirs', heartbeatAt: NOW - 1000, ownerId: 'u2', deviceId: 'd2' };
    assert.strictEqual(isForeignSyncLease(lease, 'mine', 'u1', 'd1', NOW), true,
        '살아있는 다른 기기의 잠금은 기다려야 한다');
}

function testExpiredForeignLeaseIsTakeable() {
    const lease = { token: 'theirs', heartbeatAt: NOW - 61000, ownerId: 'u2', deviceId: 'd2' };
    assert.strictEqual(isForeignSyncLease(lease, 'mine', 'u1', 'd1', NOW), false,
        '만료된 남의 잠금은 정상적으로 회수할 수 있어야 한다');
}

/* ------------------------------------------------------------------ */
/* 소스 가드 — 탈취 경로가 예전 방식으로 돌아가지 않게                    */
/* ------------------------------------------------------------------ */

function testNoBlindSteal() {
    assert.doesNotMatch(APP, /forced:\s*true/,
        '잠금을 다시 읽지 않고 덮어쓰는 강제 탈취(forced: true)가 되살아났다. '
        + '살아있는 기기의 잠금을 뺏으면 두 기기가 동시에 쓴다');

    // 대기 시간이 끝난 뒤에도 반드시 트랜잭션으로 다시 확인해야 한다
    const idx = APP.indexOf('if (Date.now() >= waitDeadline)');
    assert.ok(idx > 0, '잠금 대기 마감 분기를 찾지 못했다');
    const branch = APP.slice(idx, idx + 1800);
    assert.match(branch, /runTransaction/,
        '대기 마감 후 잠금을 트랜잭션으로 다시 확인하지 않는다');
    assert.match(branch, /isForeignSyncLease/,
        '대기 마감 후 보유자가 아직 살아있는지 확인하지 않는다');
    assert.match(branch, /syncLeaseBusy\s*=\s*true/,
        '아직 살아있으면 이번 회차를 양보해야 한다 (busy 신호)');
}

function testBusyIsNotTreatedAsError() {
    assert.match(APP, /isSyncLeaseBusyError\(e\)/,
        '양보를 일반 동기화 실패와 구분하지 않는다 — 경고 토스트와 지수 백오프가 잘못 걸린다');
    const idx = APP.indexOf('isSyncLeaseBusyError(e)');
    const block = APP.slice(idx, idx + 400);
    assert.match(block, /_syncPending\s*=\s*true/,
        '양보했으면 다음 회차를 예약해야 한다 (안 하면 그 변경분이 영영 안 올라간다)');
    assert.doesNotMatch(block, /scheduleSyncRetryAfterError/,
        '양보는 실패가 아니므로 지수 백오프를 키우면 안 된다');
}

/* ------------------------------------------------------------------ */

testFreshLeaseIsFresh();
testDeadDeviceExpires();
testFutureClockSkewExpires();
testSmallSkewStillFresh();
testOwnLeaseIsNotForeign();
testLiveForeignLeaseIsForeign();
testExpiredForeignLeaseIsTakeable();
testNoBlindSteal();
testBusyIsNotTreatedAsError();
console.log('test-sync-lease-steal: ok');
