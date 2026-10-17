#!/usr/bin/env node
'use strict';

/**
 * 2026-10-17 강도 「손상 여부」 기본값 = 상태양호.
 * 예전엔 새 항목에서 빈 값('')을 넣어 선택칸이 비어 보였다(목록에 빈 칸이 없음). 판정은 '균열발생'만 손상으로 봐서 결과는 같다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.ok(/<select id="ndtDamageStatus" class="form-select">\s*<option value="상태양호">/.test(html), '선택칸 첫 항목이 상태양호');
assert.ok(app.includes("if (damageStatusEl) damageStatusEl.value = existingItem.damageStatus || '상태양호';"), '손상 여부가 빈 옛 항목도 상태양호로');
assert.ok(app.includes("if (damageStatusEl) damageStatusEl.value = '상태양호';"), '새 항목은 상태양호로 시작');
assert.ok(!/damageStatusEl\.value = '';/.test(app), '빈 값으로 두는 곳이 없음');
assert.ok(app.includes("hasDamage: item.damageStatus === '균열발생'"), '판정은 균열발생만 손상');

console.log('test-ndt-damage-default: ok');
