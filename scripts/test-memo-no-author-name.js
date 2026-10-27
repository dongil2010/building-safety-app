#!/usr/bin/env node
'use strict';
/**
 * 2026-10-27 「주석작성에 작성자 이름 박히는거 빼라」: 도면 주석(drawingMemo)에는 작성자 이름을 보이지 않는다.
 * 계정별 저장(byUid·MEMOS_BY_uid)과 서버 동기화는 그대로.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const dm = require(path.join(root, 'js', 'core', 'drawing-memo.js'));
const ma = require(path.join(root, 'js', 'core', 'memo-author-sync.js'));

// 보기·고치기 창 머리글: 시각만
assert.ok(!/\$\{esc\(memo\.by \?/.test(app), '주석 보기 창 머리글에 작성자 이름 없음');
assert.ok(/<span style="flex:1;color:#6b7280;font-size:0\.8rem;">\$\{esc\(when\)\}<\/span>/.test(app), '머리글은 시각만');
// 도면 위 주석: 이름 span·툴팁 이름 없음
const a = app.indexOf('function syncDrawingMemoOverlay');
assert.ok(a > 0);
const body = app.slice(a, a + 4500);
assert.ok(!/map-memo-by/.test(body) && !/— \$\{m\.by\}/.test(body) && !/m\.by \?/.test(body), '도면 위 주석에 작성자 이름 없음');
assert.ok(/el\.title = m\.text;/.test(body), '툴팁은 내용만');
// 계정별 저장은 그대로: 새 주석에 byUid, 내 문서 수집
assert.ok(/byUid: \(sketchMe\(\)\.uid \|\| ''\)/.test(app), '새 주석에 계정 uid 저장');
const st = { drawingMemos: { B_1F: [dm.createMemo({ x: 1, y: 2, text: '창 상부', by: '홍길동', byUid: 'u1' })] } };
const mine = ma.collectMine(st, 'B', { uid: 'u1', name: '홍길동' }, 'ROUND_SKETCH_MEMO');
assert.strictEqual(mine.memos['1F'].length, 1, '계정별 저장 수집은 그대로');
assert.strictEqual(mine.memos['1F'][0].byUid, 'u1');
// 이미 저장된 이름 필드는 데이터를 고치지 않는다(표시만 숨김)
assert.strictEqual(mine.memos['1F'][0].by, '홍길동');
// 주석 글자(text)에는 이름이 섞이지 않는다
assert.strictEqual(mine.memos['1F'][0].text, '창 상부');
console.log('test-memo-no-author-name OK');
