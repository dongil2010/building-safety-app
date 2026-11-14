#!/usr/bin/env node
'use strict';
/**
 * 2026-11-15 ⚙ 세팅 창 이름 바꾸기: 지우고 다시 추가하면 원인이 다 날아가 불편 → 이름만 바꾸고 딸린 세팅은 옮김
 *  - 목록 칸 바꾸기(replaceInList)·세팅 칸 옮기기(moveSettingsBucket)를 잘라 와서 확인
 *  - 줄마다 연필 버튼이 있고 renameOptionItem을 부름
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(app.includes("renameBtn.className = 'option-manager-item-rename'"), '연필 버튼');
assert.ok(app.includes('renameOptionItem(text)'), '버튼이 이름 바꾸기를 부름');
assert.ok(app.includes('carryCauseSettingsToRenamedType(cat, component, item, next)'), '결함 종류면 원인 칸을 새 이름으로');

const ctx = { window: { state: {} } };
vm.createContext(ctx);
vm.runInContext([
    extractFunction(app, 'function replaceInList('),
    extractFunction(app, 'function moveSettingsBucket('),
    extractFunction(app, 'function nextCopyName('),
    'this.replaceInList = replaceInList; this.moveSettingsBucket = moveSettingsBucket; this.nextCopyName = nextCopyName;'
].join('\n'), ctx);

const l = ['a', 'b', 'c'];
ctx.replaceInList(l, 'b', 'B');
assert.deepStrictEqual(l, ['a', 'B', 'c'], '같은 자리');
ctx.replaceInList(l, 'a', 'c');
assert.deepStrictEqual(l, ['B', 'c'], '새 이름이 이미 있으면 옛 이름만 빠짐');

ctx.window.state = {
    customDefectCauses: { '구조체|보|균열': ['x'], '구조체|기둥|균열': ['y'] },
    hiddenDefectCauses: { '구조체|보|균열': ['h'] }
};
ctx.moveSettingsBucket(['customDefectCauses', 'hiddenDefectCauses'], '구조체|보|균열', '구조체|큰보|균열');
const st = ctx.window.state;
assert.deepStrictEqual(st.customDefectCauses['구조체|큰보|균열'], ['x']);
assert.deepStrictEqual(st.hiddenDefectCauses['구조체|큰보|균열'], ['h']);
assert.ok(!('구조체|보|균열' in st.customDefectCauses), '옛 칸은 지움');
assert.deepStrictEqual(st.customDefectCauses['구조체|기둥|균열'], ['y'], '다른 부재는 그대로');
// 새 칸이 이미 있으면 덮지 않음
st.customDefectCauses['구조체|A|균열'] = ['old'];
st.customDefectCauses['구조체|B|균열'] = ['keep'];
ctx.moveSettingsBucket(['customDefectCauses'], '구조체|A|균열', '구조체|B|균열');
assert.deepStrictEqual(st.customDefectCauses['구조체|B|균열'], ['keep']);

// 2026-11-15 복사: 「이름-1」, 이미 있으면 -2
assert.strictEqual(ctx.nextCopyName('하부면 균열', new Set(['하부면 균열'])), '하부면 균열-1');
assert.strictEqual(ctx.nextCopyName('보(G)', new Set(['보(G)', '보(G)-1'])), '보(G)-2');
assert.ok(app.includes('copyOptionItem(text)'), '복사 버튼');
assert.ok(app.includes("carryCauseSettingsToRenamedType(cat, component, item, next, { keepOld: true })"), '결함 종류 복사는 원인까지(원본 칸 유지)');
assert.ok(app.includes('copyComponentSettings(ctx.favBucket, item, next)'), '부재 복사는 결함 종류·원인까지');

console.log('test-option-rename: ok');
