// 측정지 사진 자르기 화면(js/shared/photo-crop.js)의 순수 계산 + app.js 연결 확인
// node scripts/test-photo-crop.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const crop = require('../js/shared/photo-crop.js');
const { dragRect, rotateRectCW, rectToPixels, fitWithin } = crop._pure;

const near = (a, b) => Math.abs(a - b) < 1e-9;
const eqRect = (r, e, msg) => {
    ['x', 'y', 'w', 'h'].forEach(k => assert.ok(near(r[k], e[k]), `${msg}: ${k} ${r[k]} != ${e[k]}`));
};

const base = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

// 이동은 크기 그대로, 사진 밖으로 못 나간다
eqRect(dragRect(base, 'move', 0.1, -0.1), { x: 0.3, y: 0.1, w: 0.5, h: 0.5 }, 'move');
eqRect(dragRect(base, 'move', 0.9, 0.9), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 'move clamp');

// 모서리: 반대쪽 모서리는 고정
eqRect(dragRect(base, 'nw', -0.1, -0.1), { x: 0.1, y: 0.1, w: 0.6, h: 0.6 }, 'nw');
eqRect(dragRect(base, 'se', 0.5, 0.5), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 }, 'se clamp');
// 변: 한 축만
eqRect(dragRect(base, 'e', 0.1, 0.3), { x: 0.2, y: 0.2, w: 0.6, h: 0.5 }, 'e');
eqRect(dragRect(base, 'n', 0.3, -0.1), { x: 0.2, y: 0.1, w: 0.5, h: 0.6 }, 'n');
// 뒤집히지 않고 최소 크기 유지
const tiny = dragRect(base, 'w', 0.9, 0, 0.04);
assert.ok(near(tiny.w, 0.04) && near(tiny.x + tiny.w, 0.7), 'w 최소 크기');

// 회전 4번 = 제자리
let r = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
const r1 = rotateRectCW(r);
eqRect(r1, { x: 0.4, y: 0.1, w: 0.4, h: 0.3 }, 'rotate 1');
for (let i = 0; i < 3; i++) r = rotateRectCW(i === 0 ? r1 : r);
eqRect(r, { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 'rotate 4');

// 픽셀 변환
assert.deepStrictEqual(rectToPixels({ x: 0.1, y: 0.25, w: 0.5, h: 0.5 }, 1000, 800), { sx: 100, sy: 200, sw: 500, sh: 400 });
assert.deepStrictEqual(rectToPixels({ x: 0, y: 0, w: 1, h: 1 }, 7, 3), { sx: 0, sy: 0, sw: 7, sh: 3 });

assert.deepStrictEqual(fitWithin(6000, 3000, 4000), { w: 4000, h: 2000 });
assert.deepStrictEqual(fitWithin(1000, 3000, 4000), { w: 1000, h: 3000 });

// 연결: 촬영/갤러리 버튼 + 자르기 후 인식, index.html 로드
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/ndt-strength-slot-scan-btn" data-slot="\$\{idx\}" data-mode="camera"/.test(app), '촬영 버튼');
assert.ok(/ndt-strength-slot-scan-btn" data-slot="\$\{idx\}" data-mode="gallery"/.test(app), '갤러리 버튼');
assert.ok(/BsaPhotoCrop\.open\(picked\)[\s\S]{0,120}scanRValuesFromImage\(file, idx\)/.test(app), '자른 사진으로 인식');
assert.ok(/<script src="js\/shared\/photo-crop\.js\?v=/.test(html), 'index.html 로드');

console.log('test-photo-crop: OK');
