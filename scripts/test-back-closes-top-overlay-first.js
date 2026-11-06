#!/usr/bin/env node
'use strict';
/** 뒤로가기: 수정창(결함·비파괴) 위에 뜬 시트·키패드·그래프·세팅 창을 먼저 닫고 아래 창은 유지 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('function tryCloseTopOverlayForBack(');
const back = app.slice(start, app.indexOf('function handleAppBackPress(', start));

const firstDrawer = Math.min(back.indexOf('closeDefectModal();'), back.indexOf('closeNdtModal();'));
[
    "getElementById('bsaSelectSheet')",
    'BsaMeasureKeypad.isOpen()',
    "getElementById('ndtDisplacementChartModal')",
    "getElementById('optionManagerModal')"
].forEach((needle) => {
    const i = back.indexOf(needle);
    assert.ok(i > 0 && i < firstDrawer, needle + ' 는 수정창보다 먼저 닫음');
});

console.log('test-back-closes-top-overlay-first: ok');
