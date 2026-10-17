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

// 기울기 맞추기(2026-10-17): 끈 선이 수평·수직이 되게 더 돌릴 각도(화면 시계 방향 +)
{
    const { straightenDelta, rotatedSize, normDeg } = crop._pure;
    const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, msg + ': ' + a + ' ≠ ' + b);
    const deg = (d) => d * Math.PI / 180;
    const line = (d, len = 300) => [10, 20, 10 + len * Math.cos(deg(d)), 20 + len * Math.sin(deg(d))];
    near(straightenDelta(...line(5)), -5, '오른쪽 아래로 5° 기운 가로선 → 반시계 5°');
    near(straightenDelta(...line(-3)), 3, '오른쪽 위로 3° 기운 가로선 → 시계 3°');
    near(straightenDelta(...line(185)), -5, '오른쪽에서 왼쪽으로 그어도 같음');
    near(straightenDelta(...line(92)), -2, '세로에 가까운 선은 수직으로');
    near(straightenDelta(...line(-88)), -2, '아래에서 위로 그은 세로선');
    near(straightenDelta(...line(0)), 0, '이미 수평');
    assert.strictEqual(Object.is(straightenDelta(...line(0)), -0), false, '-0 아님');
    assert.strictEqual(straightenDelta(5, 5, 5, 5), 0, '점 하나면 0');
    assert.ok(Math.abs(straightenDelta(...line(30))) <= 45 && Math.abs(straightenDelta(...line(50))) <= 45, '한 번에 45° 넘게 돌리지 않음');
    assert.deepStrictEqual(rotatedSize(400, 300, 0), { w: 400, h: 300 });
    assert.deepStrictEqual(rotatedSize(400, 300, 90), { w: 300, h: 400 });
    const r5 = rotatedSize(400, 300, 5);
    assert.ok(r5.w > 400 && r5.h > 300, '돌리면 다 들어가게 커짐');
    assert.strictEqual(normDeg(190), -170);
    assert.strictEqual(normDeg(-185), 175);
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'photo-crop.js'), 'utf8');
    assert.ok(src.includes('data-act="level"') && src.includes('setFine(fine + straightenDelta(L.x0, L.y0, L.x1, L.y1));'), '「∠ 기울기」로 끈 선만큼 돌림');
    assert.ok(src.includes('work = drawWorkCanvas(loaded.img, quarter, fine);'), '90° 회전해도 미세 회전 유지');
}

// 연결: 촬영/갤러리 버튼 + 자르기 후 인식, index.html 로드
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/ndt-strength-slot-scan-btn" data-slot="\$\{idx\}" data-mode="camera"/.test(app), '촬영 버튼');
assert.ok(/ndt-strength-slot-scan-btn" data-slot="\$\{idx\}" data-mode="gallery"/.test(app), '갤러리 버튼');
assert.ok(/BsaPhotoCrop\.open\(picked\)[\s\S]{0,120}scanRValuesFromImage\(file, idx\)/.test(app), '자른 사진으로 인식');
assert.ok(/<script src="js\/shared\/photo-crop\.js\?v=/.test(html), 'index.html 로드');

console.log('test-photo-crop: OK');
