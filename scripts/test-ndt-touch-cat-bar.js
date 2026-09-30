#!/usr/bin/env node
'use strict';

/** 폰·태블릿 비파괴: 실측~균열은 도면 위 가로 줄, 마킹·더보기는 우측 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

assert.ok(html.includes('id="ndtTouchCatBar"'));
assert.ok(html.includes('class="ndt-touch-cat-btn active" data-ndt-cat="실측"'));
assert.ok(html.includes('data-ndt-cat="균열모니터"'));
const rail = html.indexOf('id="mobileNdtSideRail"');
const mark = html.indexOf('id="mobileNdtBtnModeMark"', rail);
assert.ok(rail > 0 && mark > rail, '마킹 버튼은 우측 레일에 남는다');
assert.ok(css.includes('html.layout-tablet #tab-ndt .ndt-touch-cat-bar'));
assert.ok(css.includes('.ndt-unified-rail > button.ndt-cat-rail-btn'));
assert.ok(app.includes('.ndt-touch-cat-btn[data-ndt-cat]'));
console.log('test-ndt-touch-cat-bar: ok');
