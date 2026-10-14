'use strict';
// 2026-10-14 전경사진: 회차 선택·동 선택 카드에서는 버튼 없음, 점검 화면 위쪽 「전경사진」 버튼으로만 입력. 출력은 그대로
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(!app.includes('icon-btn-overview'), '회차·동 카드에 전경 버튼 없음');
assert.ok(html.includes('id="btnOpenOverviewPhotos"'), '점검 화면 위쪽 전경사진 버튼은 남김');
assert.ok(app.includes("btnOpen.addEventListener('click', () => openOverviewPhotosModal());"), '버튼이 전경사진 창을 연다');
assert.ok(html.includes('id="overviewPhotosModalTitle"'), '전경사진 창 유지');
assert.strictEqual((app.match(/\/\/ ---- 전경사진 \(문서 맨 마지막\) ----/g) || []).length, 2, '한글 출력 두 곳에 전경사진 유지');
console.log('test-overview-photo-entry: ok');
