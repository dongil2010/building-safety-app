#!/usr/bin/env node
'use strict';

/**
 * 2026-10-17 강도 R값 0↔8 바로잡기(js/core/r-bar-check.js) — 측정지 막대그래프 길이로 확인.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const C = require(path.join(root, 'js', 'core', 'r-bar-check.js'));

// 0↔8 바꾼 후보
assert.deepStrictEqual(C.swapCandidates(40).sort(), [48]);
assert.deepStrictEqual(C.swapCandidates(48).sort(), [40]);
assert.deepStrictEqual(C.swapCandidates(38).sort(), [30]);
assert.deepStrictEqual(C.swapCandidates(80).sort((a, b) => a - b), [], '88·08 등은 범위 밖');
assert.deepStrictEqual(C.swapCandidates(44), [], '0·8 없으면 후보 없음');

// 실제 값 → 막대(값×8 + 막대 읽기 잡음), OCR이 0↔8을 몇 개 틀림
const truth = [44, 42, 40, 47, 44, 40, 39, 39, 48, 42, 39, 42, 43, 49, 42, 43, 41, 30, 40, 38];
const noise = [2, -3, 1, 0, -2, 3, -1, 2, 0, -3, 1, 2, -2, 0, 3, -1, 0, 2, -2, 1];
const bars = truth.map((v, i) => v * 8 + noise[i]);
const read = truth.slice();
read[2] = 48;   // R03 40 → 48로 잘못 읽음
read[8] = 40;   // R09 48 → 40
read[17] = 38;  // R18 30 → 38
read[19] = 30;  // R20 38 → 30
const r = C.correctZeroEight(read, bars);
assert.deepStrictEqual(r.values, truth, '0↔8 틀린 4개를 막대로 바로잡음: ' + JSON.stringify(r.fixes));
assert.deepStrictEqual(r.fixes.map((f) => [f.idx, f.from, f.to]), [[2, 48, 40], [8, 40, 48], [17, 38, 30], [19, 30, 38]]);
assert.ok(r.fit && r.fit.b > 0);

// 맞게 읽은 값은 그대로(0·8이 들어 있어도)
const same = C.correctZeroEight(truth, bars);
assert.deepStrictEqual(same.values, truth);
assert.strictEqual(same.fixes.length, 0, '맞는 값은 안 건드림');

// 0·8과 상관없이 틀린 값(막대와 안 맞지만 바꿔도 안 맞음)은 그대로 둔다
const odd = truth.slice(); odd[0] = 55;
assert.strictEqual(C.correctZeroEight(odd, bars).values[0], 55, '0↔8로 설명 안 되면 안 바꿈');

// 막대 정보가 없거나 적으면 아무것도 안 함
assert.deepStrictEqual(C.correctZeroEight(read, null).values, read);
assert.deepStrictEqual(C.correctZeroEight(read, read.map((v, i) => (i < 4 ? bars[i] : null))).values, read, '5줄 미만');
// 막대가 값과 반대로 가면(엉뚱한 막대) 믿지 않음
assert.deepStrictEqual(C.correctZeroEight(read, bars.map((b) => 1000 - b)).values, read);
// 못 읽은 자리(null)는 그대로 null
const withNull = read.slice(); withNull[5] = null;
assert.strictEqual(C.correctZeroEight(withNull, bars).values[5], null);

// 앱 연결
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/<script src="js\/core\/r-bar-check\.js\?v=[^"]+"><\/script>/.test(html), 'index.html 로드');
assert.ok(app.includes('window.BsaRBarCheck.correctZeroEight(slots, bars)'), 'Gemini 결과를 막대로 확인');
assert.ok(app.includes('원소는 R(i+1)의 [측정값, 막대길이]'), 'Gemini에 막대 길이도 물음');
assert.ok(app.includes('막대 길이로 고친 값'), '고친 값을 상태 문구로 알림');

console.log('test-r-bar-check: ok');
