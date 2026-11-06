#!/usr/bin/env node
'use strict';
/** 톱니바퀴 프리셋 세팅 창을 누르거나 뒤로가기로 닫아도 결함 수정창은 닫히지 않는다 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const keepSrc = app.slice(
    app.indexOf('function shouldKeepDefectModalForTarget('),
    app.indexOf("document.addEventListener('pointerdown', (e) => {\n        if (!isDefectModalOpen()) return;\n        if (shouldKeepDefectModalForTarget")
);
assert.ok(keepSrc.length > 0, 'shouldKeepDefectModalForTarget 찾기');
const keep = new Function('isMeasureKeypadTarget', keepSrc + '\nreturn shouldKeepDefectModalForTarget;')(() => false);
const targetIn = (selector) => ({ closest: (s) => (s === selector ? {} : null) });

assert.strictEqual(keep(targetIn('#optionManagerModal')), true, '세팅 창을 눌러도 유지');
assert.strictEqual(keep(targetIn('#someOtherPanel')), false, '다른 곳을 누르면 닫힘');

const back = app.slice(app.indexOf('function tryCloseTopOverlayForBack('));
const optionIdx = back.indexOf("getElementById('optionManagerModal')");
const defectIdx = back.indexOf('closeDefectModal();');
assert.ok(optionIdx > 0 && optionIdx < defectIdx, '뒤로가기는 세팅 창을 수정창보다 먼저 닫음');

console.log('test-option-manager-keeps-defect-modal: ok');
