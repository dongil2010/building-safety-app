'use strict';
// 2026-11-02 오프라인 데이터 2일 유예 삭제 — 「전부 서버에 올라간 것을 확인한 뒤 2일이 지나면 기기 사본을 지워 서버에만 남긴다」
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'core', 'cache-purge-guard.js'));
const { extractFunction } = require('./lib-extract-fn');

const DAY = 24 * 60 * 60 * 1000;
const GRACE = 2 * DAY;
const RETRY = 6 * 60 * 60 * 1000;
const now = 100 * DAY;

// 2일이 안 지났으면 지우지 않는다 / 지났으면 지운다
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - GRACE + 1000 }, now, GRACE, {}, RETRY), []);
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - GRACE }, now, GRACE, {}, RETRY), ['a']);
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - 5 * DAY, b: now - DAY, c: now - 3 * DAY }, now, GRACE, {}, RETRY).sort(), ['a', 'c']);
// 지금 열어 둔 건물은 건너뜀
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - 5 * DAY, b: now - 5 * DAY }, now, GRACE, {}, RETRY, 'a'), ['b']);
// 보류된 건물은 6시간 안에 다시 시도하지 않음(서버 읽기 폭주 방지)
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - 5 * DAY }, now, GRACE, { a: now - RETRY + 1000 }, RETRY), []);
assert.deepStrictEqual(G.offlineExpiryDue({ a: now - 5 * DAY }, now, GRACE, { a: now - RETRY }, RETRY), ['a']);
// 표시가 없거나 이상하면 아무것도 안 함
assert.deepStrictEqual(G.offlineExpiryDue({}, now, GRACE, {}, RETRY), []);
assert.deepStrictEqual(G.offlineExpiryDue(null, now, GRACE, {}, RETRY), []);
assert.deepStrictEqual(G.offlineExpiryDue({ a: 0, b: 'x', c: -5 }, now, GRACE, {}, RETRY), []);

// 앱 연결
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
// 표시는 「서버에 다 올라간 것을 확인」한 뒤에만 찍는다 (runOfflineReturnSync의 ③ 단계, 검증 실패면 그 앞에서 return)
const ret = extractFunction(app, 'async function runOfflineReturnSync(');
const failIdx = ret.indexOf("오프라인 데이터는 지우지 않았습니다");
const stampIdx = ret.indexOf('bsaOfflineExpiry.stamp(');
assert.ok(failIdx > 0 && stampIdx > failIdx, '검증 실패 분기 뒤에서만 표시');
// 지우기 직전에 서버 확인을 한 번 더 하고, 문제가 있으면 건너뛴다
const runStart = app.indexOf('async run(reason) {');
const runSrc = app.slice(runStart, app.indexOf('// ---- 2026-10-19 최신으로 다시 받기', runStart));
assert.ok(runSrc.indexOf('verifyBuildingOnServer(b)') > 0 && runSrc.indexOf('if (problems.length)') > runSrc.indexOf('verifyBuildingOnServer(b)'));
assert.ok(runSrc.indexOf('if (problems.length)') < runSrc.indexOf('clearOfflinePrep([b])'), '확인 → 준비 비우기 순서');
assert.ok(runSrc.indexOf('clearOfflinePrep([b])') < runSrc.indexOf('purgeBuildingIndexedDbAssets(id, { keepUnuploaded: true })'));
assert.ok(runSrc.includes('pruneBlockReason') && runSrc.includes('offlineExpiryDue'), '올리는 중·안 올라간 것이 있으면 안 지움');
assert.ok(runSrc.includes("keepUnuploaded: true"), '서버에 안 올라간 사진은 남김');
// 새 오프라인 작업·손으로 새로 받기는 카운트다운을 멈춘다
assert.ok(/markOfflineWorked = \(\) => \{[\s\S]*?bsaOfflineExpiry\.clearAll\(\)/.test(app));
assert.ok(app.includes('window.bsaOfflineExpiry.clear(b.id)'));
// 부팅·온라인·주기 실행
assert.ok(app.includes("bsaOfflineExpiry.run('boot')") && app.includes("bsaOfflineExpiry.run('online')") && app.includes("bsaOfflineExpiry.run('timer')"));
console.log('test-offline-expiry: ok');
