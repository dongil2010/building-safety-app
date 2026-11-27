#!/usr/bin/env node
'use strict';
/**
 * 2026-11-27 비파괴 마킹 번호 1씩 올리기·내리기
 * - NO.07 → NO.08 / NO.06, 두 자리 맞춤, 1보다 작게는 안 됨
 * - 같은 종류(건물 전체)에 그 번호가 이미 있으면 서로 바꾼다(다른 층 것도)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fn = (name) => extractFunction(app, 'function ' + name + '(');

const R = new Function(`
${fn('ndtNumberStepLabel')}
${fn('ndtNumberSameKey')}
${fn('planNdtNumberStep')}
return { ndtNumberStepLabel, ndtNumberSameKey, planNdtNumberStep };
`)();

// ── 1) 번호 글자 ──
const step = R.ndtNumberStepLabel;
assert.strictEqual(step('NO.07', 1), 'NO.08');
assert.strictEqual(step('NO.07', -1), 'NO.06');
assert.strictEqual(step('NO.09', 1), 'NO.10');
assert.strictEqual(step('NO.10', -1), 'NO.09', '두 자리 맞춤');
assert.strictEqual(step('NO.100', -1), 'NO.99');
assert.strictEqual(step('07', 1), '08', 'NO. 없는 모양 유지');
assert.strictEqual(step('강도-01', 1), '강도-02');
assert.strictEqual(step('NO.01', -1), null, '1보다 작게는 안 됨');
assert.strictEqual(step('NO.', 1), null, '숫자 없음');
assert.strictEqual(step(null, 1), null);

// ── 2) 같은 번호 판단 ──
const same = R.ndtNumberSameKey;
assert.strictEqual(same('NO.07'), same('07'));
assert.strictEqual(same('NO.7'), same('NO.07'));
assert.notStrictEqual(same('NO.07'), same('NO.08'));

// ── 3) 계획: 빈 번호면 그냥, 있으면 서로 바꿈 ──
const a = { id: 'a', no: 'NO.01' };
const b = { id: 'b', no: 'NO.02' };
const c = { id: 'c', no: 'NO.04' };
const pool = [{ rec: a, key: 'B_1F' }, { rec: b, key: 'B_2F' }, { rec: c, key: 'B_1F' }];

let p = R.planNdtNumberStep(pool, 'a', 1, 'no');
assert.ok(p.ok);
assert.strictEqual(p.from, 'NO.01');
assert.strictEqual(p.to, 'NO.02');
assert.strictEqual(p.swapped, 1, 'NO.02가 있으니 서로 바꿈');
assert.deepStrictEqual(p.changes, [
    { key: 'B_1F', id: 'a', from: 'NO.01', to: 'NO.02' },
    { key: 'B_2F', id: 'b', from: 'NO.02', to: 'NO.01' }
], '다른 층 상대도 그 층 키로');

p = R.planNdtNumberStep(pool, 'b', 1, 'no');
assert.ok(p.ok);
assert.strictEqual(p.to, 'NO.03');
assert.strictEqual(p.swapped, 0, '비어 있는 번호');
assert.strictEqual(p.changes.length, 1);

p = R.planNdtNumberStep(pool, 'a', -1, 'no');
assert.strictEqual(p.ok, false, 'NO.01 아래는 없음');
assert.ok(/1보다/.test(p.reason));

p = R.planNdtNumberStep(pool, 'zz', 1, 'no');
assert.strictEqual(p.ok, false);

// 구역(부동침하·부재처짐)은 groupNo
const g1 = { id: 'g1', groupNo: 'NO.03' };
const g2 = { id: 'g2', groupNo: 'NO.02' };
p = R.planNdtNumberStep([{ rec: g1, key: 'k' }, { rec: g2, key: 'k' }], 'g1', -1, 'groupNo');
assert.ok(p.ok);
assert.deepStrictEqual(p.changes.map((x) => [x.id, x.to]), [['g1', 'NO.02'], ['g2', 'NO.03']]);

// ── 4) 화면 연결 ──
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/id="ndtSelNoStep"/.test(html), '선택 막대 −/+');
assert.strictEqual((html.match(/data-ndt-no-step="-1"/g) || []).length, 2, '선택 막대·수정창 −');
assert.strictEqual((html.match(/data-ndt-no-step="1"/g) || []).length, 2, '선택 막대·수정창 +');
assert.ok(/window\.syncNdtNumberStepUi\(\)/.test(fn('updateNdtSelectionBar')), '선택 바뀌면 번호 표시도');

console.log('test-ndt-number-step: OK');
