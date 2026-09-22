#!/usr/bin/env node
'use strict';

/**
 * 현장 오류 자동 기록의 한도·자르기 검사.
 *
 * 이 기능에서 무서운 건 "안 남는 것"보다 **폭주해서 쓰기가 터지는 것**이다.
 * 렌더 루프 안에서 오류가 나면 초당 수십 건이 Firestore로 나간다. 그래서
 * 한도 계산과 길이 자르기를 기계가 지킨다. 길이 제한은 firestore.rules의
 * errorLogShapeOk()와 같은 값이어야 해서 그것도 같이 본다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'error-log.js'));

const DAY = '2026-09-23';

// --- 같은 오류는 하루 3건까지 ---
(function sameErrorStopsAtThree() {
    const entry = { kind: 'error', message: '결함 저장 실패', source: 'app.js:1200:5' };
    const sig = api.signatureOf(entry);
    let quota = api.emptyQuota(DAY);
    const seqs = [];
    for (let i = 0; i < 6; i += 1) {
        const verdict = api.shouldLog(quota, sig, DAY);
        if (verdict.allow) {
            seqs.push(verdict.seq);
            quota = verdict.quota;
        } else {
            seqs.push(verdict.reason);
        }
    }
    assert.deepStrictEqual(seqs, [1, 2, 3, 'signature', 'signature', 'signature']);
})();

// --- 숫자만 다른 오류는 같은 오류로 본다 (NO.57 / NO.58) ---
(function digitsCollapse() {
    const a = api.signatureOf({ kind: 'error', message: 'NO.57 사진 없음', source: 'app.js:10:1' });
    const b = api.signatureOf({ kind: 'error', message: 'NO.58 사진 없음', source: 'app.js:10:1' });
    assert.strictEqual(a, b, '숫자만 다른 오류가 따로 세어지면 한도가 소용없다');

    const c = api.signatureOf({ kind: 'error', message: '도면 로드 실패', source: 'app.js:10:1' });
    assert.notStrictEqual(a, c);
})();

// --- 서로 다른 오류라도 기기당 하루 30건에서 멈춘다 ---
(function dailyCapStops() {
    let quota = api.emptyQuota(DAY);
    let allowed = 0;
    for (let i = 0; i < 200; i += 1) {
        // 서명이 매번 달라지도록 숫자가 아닌 부분을 바꾼다
        const sig = api.signatureOf({ kind: 'error', message: '오류 ' + String.fromCharCode(97 + (i % 26)) + i, source: 'a' + i });
        const verdict = api.shouldLog(quota, sig, DAY);
        if (!verdict.allow) {
            assert.strictEqual(verdict.reason, 'daily');
            break;
        }
        allowed += 1;
        quota = verdict.quota;
    }
    assert.strictEqual(allowed, api.MAX_PER_DAY);
})();

// --- 날이 바뀌면 한도가 초기화된다 ---
(function newDayResets() {
    const sig = 'sig';
    let quota = api.emptyQuota(DAY);
    for (let i = 0; i < api.MAX_PER_SIGNATURE_PER_DAY; i += 1) {
        quota = api.shouldLog(quota, sig, DAY).quota;
    }
    assert.strictEqual(api.shouldLog(quota, sig, DAY).allow, false);
    const next = api.shouldLog(quota, sig, '2026-09-24');
    assert.strictEqual(next.allow, true);
    assert.strictEqual(next.quota.total, 1);
})();

// --- 한도 계산이 원본을 건드리지 않는다 ---
(function shouldLogIsPure() {
    const quota = api.emptyQuota(DAY);
    api.shouldLog(quota, 'sig', DAY);
    assert.strictEqual(quota.total, 0);
    assert.deepStrictEqual(quota.sigs, {});
})();

// --- 긴 stack·message가 규칙 한도 안으로 잘린다 ---
(function longFieldsAreClipped() {
    const entry = api.buildEntry({
        kind: 'unhandledrejection',
        message: 'ㄱ'.repeat(5000),
        stack: 'at foo\n'.repeat(5000),
        source: 'x'.repeat(5000)
    }, {
        now: 1758585600000,
        url: 'https://example.com/' + 'y'.repeat(5000),
        device: 'UA'.repeat(5000),
        online: true
    });
    assert.strictEqual(entry.message.length, api.LIMITS.message);
    assert.strictEqual(entry.stack.length, api.LIMITS.stack);
    assert.strictEqual(entry.source.length, api.LIMITS.source);
    assert.strictEqual(entry.url.length, api.LIMITS.url);
    assert.strictEqual(entry.device.length, api.LIMITS.device);
    assert.strictEqual(entry.atLocal, 1758585600000);
    assert.strictEqual(entry.online, true);
})();

// --- 값이 없어도 규칙이 요구하는 필드는 채워진다 ---
(function missingContextStillValid() {
    const entry = api.buildEntry({}, {});
    assert.strictEqual(entry.kind, 'error');
    assert.ok(entry.message.length > 0, 'message가 비면 규칙이 거부한다');
    assert.strictEqual(entry.online, false);
    assert.strictEqual(typeof entry.atLocal, 'number');
    assert.strictEqual(entry.sameErrorToday, 1);
})();

// --- 내용 없는 CDN 오류("Script error.")는 버린다 ---
(function crossOriginNoiseDropped() {
    assert.strictEqual(api.isNoise({ message: 'Script error.' }), true);
    assert.strictEqual(api.isNoise({ message: '' }), true);
    assert.strictEqual(api.isNoise({ message: 'Script error.', stack: 'at x' }), false);
    assert.strictEqual(api.isNoise({ message: 'x is not a function' }), false);
})();

// --- 날짜 키는 로컬 날짜 ---
(function dayKeyFormat() {
    assert.match(api.dayKeyOf(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
})();

// --- Node에서 불러도 브라우저 전용 코드가 돌지 않는다 ---
(function noBrowserSideEffectsInNode() {
    assert.strictEqual(typeof api.record, 'undefined', 'window 없이 핸들러가 설치되면 안 된다');
})();

// --- firestore.rules의 길이 제한이 모듈과 같은 값인지 ---
(function rulesMatchLimits() {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const block = rules.slice(rules.indexOf('function errorLogShapeOk()'));
    assert.ok(block.indexOf('match /errorLogs/') > 0, 'errorLogs 규칙이 없다');

    [
        ['message', api.LIMITS.message],
        ['stack', api.LIMITS.stack],
        ['source', api.LIMITS.source],
        ['url', api.LIMITS.url],
        ['device', api.LIMITS.device],
        ['kind', api.LIMITS.kind]
    ].forEach(function (pair) {
        const re = new RegExp('d\\.' + pair[0] + '\\.size\\(\\) <= ' + pair[1] + '\\b');
        assert.match(block, re, pair[0] + ' 길이 제한이 error-log.js와 다르다');
    });

    // 모듈이 보내는 필드가 규칙의 hasOnly 목록에 다 있어야 한다
    const sent = Object.keys(api.buildEntry({}, {})).concat(['at']);
    sent.forEach(function (key) {
        assert.ok(block.indexOf("'" + key + "'") > 0, 'errorLogShapeOk()에 ' + key + ' 필드가 빠졌다');
    });

    assert.match(block, /allow update, delete: if false;/, '오류 기록은 고치거나 지울 수 없어야 한다');
})();

// --- index.html에서 오류 기록이 맨 먼저 실려야 한다 ---
(function loadedFirst() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const mine = html.indexOf('js/core/error-log.js');
    const app = html.indexOf('src="app.js');
    assert.ok(mine > 0, 'index.html에 error-log.js가 없다');
    assert.ok(mine < app, 'app.js보다 먼저 실려야 로딩 중 오류를 잡는다');

    const firstLocal = html.search(/<script src="js\//);
    assert.strictEqual(html.slice(firstLocal, firstLocal + 60).indexOf('error-log.js') > 0, true,
        'js/ 스크립트 중 맨 앞이어야 한다');
})();

console.log('test-error-log: ok');
