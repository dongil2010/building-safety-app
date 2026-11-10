'use strict';
// 2026-11-10 「찍은 사진 눌러보면 막 그리게 되어 있는데 그거 말고 확대 축소 해서 볼 수 있게」
// 사진을 누르면 크게 보기(확대·축소·이동). 그리기는 보기 창의 「그리기」 단추로만.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn.js');

const root = path.join(__dirname, '..');
const v = require(path.join(root, 'js', 'shared', 'photo-zoom-viewer.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(root, 'js', 'shared', 'photo-zoom-viewer.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const near = (a, b) => Math.abs(a - b) < 1e-6;

// 맞춤: 사진 전체가 보이고 가운데
const W = 400, H = 800, iw = 4000, ih = 3000;
assert.ok(near(v.fitScale(iw, ih, W, H), 0.1));
assert.deepStrictEqual(v.fitView(iw, ih, W, H), { scale: 0.1, x: 0, y: 250 });
assert.strictEqual(v.fitScale(0, 0, W, H), 1, '크기를 모르면 1');
assert.ok(v.isAtFit(v.fitView(iw, ih, W, H), iw, ih, W, H));

// 배율 범위: 맞춤보다 작아지지 않고, 맞춤의 8배(작은 사진은 원본 3배)까지
assert.ok(near(v.scaleLimits(iw, ih, W, H).max, 3));
assert.ok(near(v.scaleLimits(100, 100, W, H).max, 32), '작은 사진은 맞춤의 8배');
assert.ok(near(v.clampView({ scale: 0.001, x: 0, y: 0 }, iw, ih, W, H).scale, 0.1));
assert.ok(near(v.clampView({ scale: 99, x: 0, y: 0 }, iw, ih, W, H).scale, 3));

// 확대: 누른 점 아래의 사진 자리가 그대로
let view = v.fitView(iw, ih, W, H);
const px = 300, py = 400;
const before = { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
view = v.zoomAt(view, 4, px, py, iw, ih, W, H);
assert.ok(near(view.scale, 0.4));
assert.ok(near((px - view.x) / view.scale, before.x) && near((py - view.y) / view.scale, before.y));
assert.ok(!v.isAtFit(view, iw, ih, W, H));

// 끌기: 사진이 화면 밖으로 달아나지 않는다(가장자리까지만)
let c = v.clampView({ scale: 0.4, x: 500, y: 500 }, iw, ih, W, H);
assert.deepStrictEqual([c.x, c.y], [0, 0]);
c = v.clampView({ scale: 0.4, x: -99999, y: -99999 }, iw, ih, W, H);
assert.ok(near(c.x, W - iw * 0.4) && near(c.y, H - ih * 0.4));
// 화면보다 작은 방향은 늘 가운데
c = v.clampView({ scale: 0.15, x: -50, y: 700 }, iw, ih, W, H);
assert.ok(near(c.y, (H - ih * 0.15) / 2) && near(c.x, -50));
// 축소는 맞춤에서 멈춘다
assert.deepStrictEqual(v.zoomAt(view, 0.0001, px, py, iw, ih, W, H), v.fitView(iw, ih, W, H));

// 연결: 스크립트가 app.js보다 먼저, 사진 누르기 = 보기 창
assert.ok(html.includes('js/shared/photo-zoom-viewer.js'));
assert.ok(html.indexOf('js/shared/photo-zoom-viewer.js') < html.indexOf('src="app.js'));
assert.ok(app.includes("const openFn = isPrev ? 'previewPrevRoundPhoto' : 'viewPendingPhoto';"), '현차 사진 누르기 = 크게 보기');
const viewFn = extractFunction(app, 'window.viewPendingPhoto = function(');
assert.ok(viewFn.includes('openPhotoZoomViewer(') && viewFn.includes('window.annotatePendingPhoto(i)'), '그리기는 보기 창의 단추로');
const prevFn = extractFunction(app, 'window.previewPrevRoundPhoto = function(');
assert.ok(prevFn.includes('openPhotoZoomViewer(') && prevFn.includes("'전차', null)"), '전차 사진은 보기만');
assert.ok(app.includes('window.bsaOpenPhotoZoomViewer([src], 0, label, null)'), '게이지·팁 비교 사진도 보기 창');
assert.ok(app.includes('window.annotatePendingPhoto = function('), '그리기 기능은 그대로 있다');
// 보기 창은 body에 붙는다 → 수정창 바깥 누르기·뒤로가기가 보기 창만 닫는다
assert.ok(extractFunction(app, 'function shouldKeepDefectModalForTarget(').includes("target.closest('#bsaPhotoViewer')"));
const back = extractFunction(app, 'function tryCloseTopOverlayForBack(');
assert.ok(back.includes('window.BSA.photoZoomViewer.close()'));
assert.ok(back.indexOf('photoZoomViewer') < back.indexOf('closeDefectModal'), '뒤로가기: 보기 창이 수정창보다 먼저');
// 바깥 누르기는 click에서 닫는다(그 click이 아래 단추에 떨어지지 않게), 사진은 건드리지 않는다
assert.ok(/if \(st\.stage\.contains\(e\.target\) && !st\.moved && !st\.wasPinch && !pointInsidePhoto\(stagePoint\(e\)\)\) close\(\);/.test(src));
assert.ok(!/toDataURL|getContext/.test(src), '보기 전용');
assert.ok(/\.bsa-pv-stage \{[^}]*touch-action: none/.test(css));
assert.ok(/\.bsa-pv \{[^}]*z-index: 2147482000/.test(css));

console.log('test-photo-zoom-viewer: ok');
