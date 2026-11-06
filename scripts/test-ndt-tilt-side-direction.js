#!/usr/bin/env node
'use strict';
/** 외벽 기울기 변위 방향: 마킹 화살표를 바라본 왼쪽·오른쪽 → 90도 꺾은 화살표, 입력 칸 순서 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const src = app.slice(app.indexOf('function ndtTiltSideVector('), app.indexOf('/** 표의 변위방향 칸에'));
const { vec, glyph } = new Function(src + '\nreturn { vec: ndtTiltSideVector, glyph: ndtTiltSideGlyph };')();
const near = (a, x, y) => assert.ok(a && Math.abs(a.x - x) < 1e-9 && Math.abs(a.y - y) < 1e-9, JSON.stringify(a));

// 화면 좌표는 y가 아래로 + : 위를 바라보면 왼쪽은 화면 왼쪽
near(vec('left', 0, -10), -1, 0);
near(vec('right', 0, -10), 1, 0);
// 아래를 바라보면 좌우가 뒤집힌다
near(vec('left', 0, 10), 1, 0);
near(vec('right', 0, 10), -1, 0);
// 오른쪽을 바라보면 왼쪽은 화면 위
near(vec('left', 10, 0), 0, -1);
near(vec('right', 10, 0), 0, 1);
assert.strictEqual(vec('', 0, 10), null, '안 고르면 방향 없음');
assert.strictEqual(vec('left', 0, 0), null, '화살표 길이 0');

assert.strictEqual(glyph('left', 0, -10), '←');
assert.strictEqual(glyph('right', 0, -10), '→');
assert.strictEqual(glyph('left', 10, 0), '↑');
assert.strictEqual(glyph('right', 10, 10), '↙');
assert.strictEqual(glyph('none', 0, -10), '-');
assert.strictEqual(glyph('', 0, -10), null, '안 고르면 기존 값 유지');

// 칸 순서: 측정 높이 → 측정값 자리 → 기울기 비율 → 등급
const order = ['id="lblNdtHeight"', 'id="ndtTiltValueSlot"', 'id="lblNdtTiltRatio"', 'id="lblNdtGrade"'].map((s) => html.indexOf(s));
order.forEach((v, i) => assert.ok(v > 0 && (i === 0 || v > order[i - 1]), '순서 ' + i));
assert.ok(/placeNdtTiltValueFields\(isTiltCat\)/.test(app), '기울기일 때 측정값 칸을 옮김');

// 예전 8방향 마킹은 왼쪽·오른쪽을 고르기 전까지 지우지 않는다
assert.ok(/\(dispSide \|\| existing\.dispSide !== undefined\)/.test(app));

console.log('test-ndt-tilt-side-direction: ok');
