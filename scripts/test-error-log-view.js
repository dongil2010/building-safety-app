#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 앱 안 오류 기록 조회 화면 (js/core/error-log-view.js)
 * 같은 오류(숫자만 다른 변종 포함) 묶기, 우리 회사·기간 거르기, 시각 읽기, 기기 이름.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.BSA = {};
globalThis.BSA.errorLog = require(path.join(root, 'js', 'core', 'error-log.js'));
const view = require(path.join(root, 'js', 'core', 'error-log-view.js'));

// 시각: 서버 Timestamp(toMillis) > {seconds} > atLocal
assert.strictEqual(view.timeOf({ at: { toMillis: () => 5000 }, atLocal: 1 }), 5000);
assert.strictEqual(view.timeOf({ at: { seconds: 7 } }), 7000);
assert.strictEqual(view.timeOf({ at: null, atLocal: 900 }), 900, '오프라인에서 쓴 직후 등 서버 시각이 없으면 기기 시각');
assert.strictEqual(view.timeOf({}), 0);

assert.strictEqual(view.deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit'), 'Android 태블릿');
assert.strictEqual(view.deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S921N) Mobile Safari'), 'Android 폰');
assert.strictEqual(view.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows PC');
assert.strictEqual(view.deviceLabel(''), '알 수 없는 기기');

const logs = [
    { kind: 'error', message: 'NO.57 없음', source: 'app.js:10:2', companyId: 'c1', deviceId: 'd1', userName: '이수근', appVersion: 'a1', atLocal: 1000 },
    { kind: 'error', message: 'NO.58 없음', source: 'app.js:10:2', companyId: 'c1', deviceId: 'd2', userName: '정병수', appVersion: 'a2', atLocal: 3000 },
    { kind: 'error', message: 'NO.9 없음', source: 'app.js:10:2', companyId: '', deviceId: 'd1', atLocal: 2000 },
    { kind: 'unhandledrejection', message: 'quota', source: '', companyId: 'c1', deviceId: 'd1', atLocal: 2500 },
    { kind: 'error', message: '다른 회사', source: '', companyId: 'c2', deviceId: 'dx', atLocal: 4000 },
    { kind: 'error', message: '옛날', source: '', companyId: 'c1', deviceId: 'd1', atLocal: 10 }
];

const mine = view.filterLogs(logs, { companyId: 'c1', since: 500 });
assert.deepStrictEqual(mine.map((l) => l.message), ['NO.57 없음', 'NO.58 없음', 'NO.9 없음', 'quota'],
    '다른 회사·기간 밖은 빼고, 로그인 전(회사 빈 것)은 넣는다');

const groups = view.groupLogs(mine);
assert.strictEqual(groups.length, 2, '숫자만 다른 오류는 한 묶음');
assert.strictEqual(groups[0].count, 3);
assert.strictEqual(groups[0].devices, 2);
assert.strictEqual(groups[0].message, 'NO.58 없음', '묶음 대표 문구는 가장 최근 것');
assert.strictEqual(groups[0].first, 1000);
assert.strictEqual(groups[0].last, 3000);
assert.deepStrictEqual(groups[0].users.sort(), ['이수근', '정병수']);
assert.deepStrictEqual(groups[0].samples.map((s) => s.atLocal), [3000, 2000, 1000], '자세히 보기는 최근 것부터');
assert.strictEqual(groups[1].message, 'quota', '최근에 난 묶음이 위로');
assert.deepStrictEqual(view.groupLogs([]), []);

// 화면 연결
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
['btnOpenErrorLogs', 'errorLogModal', 'errorLogList', 'errorLogRange', 'btnReloadErrorLogs'].forEach((id) => {
    assert.ok(html.indexOf(`id="${id}"`) >= 0, `index.html에 ${id}`);
});
assert.ok(/<script src="js\/core\/error-log-view\.js\?v=/.test(html), 'index.html이 조회 화면 스크립트를 불러온다');
// 규칙: 읽기는 열려 있고 고치기·지우기는 막혀 있어야 한다(조회 화면은 읽기만 한다)
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const block = rules.slice(rules.indexOf('match /errorLogs/{logId}'));
assert.ok(/allow read: if request\.auth != null/.test(block));
assert.ok(/allow update, delete: if false;/.test(block));

console.log('test-error-log-view: ok');
