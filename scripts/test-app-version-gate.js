#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const api = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

const HOST = 'dongil2010.github.io';

/**
 * 2026-09-21: 지운 층 부활·옛 데이터 덮어쓰기는 모두 업데이트 안 된 기기가 옛 코드로
 * 동기화하면서 생겼다. 지금 코드가 배포본과 다르면 클라우드에 쓰면 안 된다.
 */
function testOutdatedBuildIsBlocked() {
    assert.strictEqual(
        api.isOutdatedBuild('02f035d', { sha: 'ad158660d91d7a32f785d8ace9c4dd59e282c6d7', short: 'ad15866' }, HOST),
        true,
        '배포본(ad15866)보다 옛 코드(02f035d)면 막아야 한다'
    );
}

function testLatestBuildIsAllowed() {
    const meta = { sha: 'ad158660d91d7a32f785d8ace9c4dd59e282c6d7', short: 'ad15866' };
    assert.strictEqual(api.isOutdatedBuild('ad15866', meta, HOST), false, '최신 코드는 막으면 안 된다');
    assert.strictEqual(api.isOutdatedBuild('AD15866', meta, HOST), false, '대소문자 차이는 같은 버전');
    assert.strictEqual(api.isOutdatedBuild('ad158660d91d', meta, HOST), false, '더 긴 해시 앞부분도 같은 버전');
}

/** 애매하면 막지 않는다 — 잘못 막으면 전원의 동기화가 멈춘다 */
function testUnknownNeverBlocks() {
    const meta = { sha: 'ad158660d91d7a32f785d8ace9c4dd59e282c6d7', short: 'ad15866' };
    assert.strictEqual(api.isOutdatedBuild('02f035d', null, HOST), false, '배포 정보를 못 받으면(오프라인) 막지 않는다');
    assert.strictEqual(api.isOutdatedBuild('02f035d', {}, HOST), false);
    assert.strictEqual(api.isOutdatedBuild('', meta, HOST), false, '지금 버전을 모르면 막지 않는다');
    assert.strictEqual(api.isOutdatedBuild(undefined, meta, HOST), false);
    assert.strictEqual(api.isOutdatedBuild('02f035d', { sha: 'local', short: 'local' }, HOST), false);
    // 배포 경로가 바뀌어 한쪽이 시각 라벨이면 비교 불가 → 막지 않는다
    assert.strictEqual(api.isOutdatedBuild('20260921_111044', meta, HOST), false,
        '형식이 다르면(시각 라벨) 전원 차단 사고가 나므로 판단하지 않는다');
    assert.strictEqual(api.isOutdatedBuild('02f035d', { short: '20260921_111044' }, HOST), false);
}

function testLocalDevNeverBlocks() {
    const meta = { sha: 'ad158660d91d7a32f785d8ace9c4dd59e282c6d7', short: 'ad15866' };
    assert.strictEqual(api.isOutdatedBuild('02f035d', meta, 'localhost'), false, '로컬 개발 서버는 막지 않는다');
    assert.strictEqual(api.isOutdatedBuild('02f035d', meta, '127.0.0.1'), false);
    assert.strictEqual(api.isOutdatedBuild('02f035d', meta, ''), false);
}

/** 배포 스크립트가 두 값을 같은 해시로 박는지 — 어긋나면 최신 기기도 막힌다 */
function testDeployWritesSameToken() {
    const py = fs.readFileSync(path.join(__dirname, 'prepare-pages.py'), 'utf8');
    assert.ok(/window\\\.BSA_APP_VERSION = '\[\^'\]\*'",\s*\n\s*f"window\.BSA_APP_VERSION = '\{SHORT\}'"/.test(py),
        'prepare-pages.py가 BSA_APP_VERSION을 SHORT로 박아야 한다');
    assert.ok(/"short":\s*SHORT/.test(py), 'web-version.json의 short도 같은 SHORT여야 한다');
}

/** app.js가 동기화 진입점에서 실제로 막는지 */
function testSyncEntryIsGated() {
    const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const start = app.indexOf('async function syncStateToFirebase()');
    assert.ok(start > 0, 'syncStateToFirebase를 찾지 못했다');
    const head = app.slice(start, start + 900);
    const gateAt = head.indexOf('await refreshAppVersionGate(false)');
    const inflightAt = head.indexOf('if (isRemoteSyncing || _syncInFlight)');
    assert.ok(gateAt > 0, '동기화 시작 전에 옛 버전인지 확인해야 한다');
    assert.ok(inflightAt > gateAt,
        'await는 in-flight 확인보다 앞에 둬야 한다 — 뒤에 두면 동시 호출이 둘 다 통과한다');
    assert.ok(app.indexOf("api.isOutdatedBuild(window.BSA_APP_VERSION, meta, window.location.hostname)") >= 0,
        '지금 돌고 있는 코드 버전(BSA_APP_VERSION)과 비교해야 한다');
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    assert.ok(css.indexOf('.bsa-outdated-banner') >= 0, '새로고침 안내 띠 스타일이 있어야 한다');
}

testOutdatedBuildIsBlocked();
testLatestBuildIsAllowed();
testUnknownNeverBlocks();
testLocalDevNeverBlocks();
testDeployWritesSameToken();
testSyncEntryIsGated();
console.log('test-app-version-gate: ok');
