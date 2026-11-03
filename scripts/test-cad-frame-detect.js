'use strict';
// 2026-10-31 캐드 기준점 자동 찾기: 도면 가장 바깥 사각형(테두리) 모서리
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require('../js/shared/cad-frame-detect.js');
function blank(w, h) { return new Uint8Array(w * h).fill(255); }
function hline(g, w, y, x1, x2, t) { for (let k = 0; k < (t || 1); k++) for (let x = x1; x <= x2; x++) g[(y + k) * w + x] = 0; }
function vline(g, w, x, y1, y2, t) { for (let k = 0; k < (t || 1); k++) for (let y = y1; y <= y2; y++) g[y * w + x + k] = 0; }
function rect(g, w, x1, y1, x2, y2, t) { hline(g, w, y1, x1, x2, t); hline(g, w, y2 - (t || 1) + 1, x1, x2, t); vline(g, w, x1, y1, y2, t); vline(g, w, x2 - (t || 1) + 1, y1, y2, t); }
const W = 400, H = 300;
// 테두리 + 안쪽 벽(긴 선 포함) + 표제란 + 글자 점
let g = blank(W, H);
rect(g, W, 20, 15, 380, 285, 3);
rect(g, W, 60, 50, 300, 240, 2);          // 건물 외곽(안쪽, 무시)
hline(g, W, 150, 25, 370, 1);              // 긴 안쪽 선(무시: 바깥이 아님)
rect(g, W, 310, 240, 378, 283, 1);         // 표제란
for (let i = 0; i < 300; i++) g[(70 + (i * 7) % 150) * W + 80 + (i * 13) % 200] = 0; // 잡음
let f = D.detectOuterFrame(g, W, H);
assert.ok(f, 'found');
assert.deepStrictEqual([f.left, f.top, f.right, f.bottom], [20, 15, 382, 287].map((v, i) => (i >= 2 ? v - 2 : v)), 'outer edge');
assert.ok(f.confidence >= 0.75);
// 이중 테두리 → 가장 바깥
g = blank(W, H); rect(g, W, 10, 10, 390, 290, 1); rect(g, W, 16, 16, 384, 284, 4);
f = D.detectOuterFrame(g, W, H);
assert.deepStrictEqual([f.left, f.top, f.right, f.bottom], [10, 10, 390, 290]);
// 테두리 없음 → null (작은 방들만)
g = blank(W, H); rect(g, W, 50, 50, 150, 120, 2); rect(g, W, 200, 150, 260, 200, 2);
assert.strictEqual(D.detectOuterFrame(g, W, H), null, 'no frame');
// 빈 그림
assert.strictEqual(D.detectOuterFrame(blank(W, H), W, H), null);
// 2026-11-03 보강: 연하거나(밝은 색 선)·가늘거나·끊긴 테두리도 찾는다
const R = D.detectOuterFrameRobust;
const paint = (g, w, x, y, v) => { g[y * w + x] = v; };
function lightRect(v, brk) {
    const gg = blank(W, H);
    for (let x = 20; x <= 380; x++) { if (!(brk && x >= 100 && x <= 106)) { paint(gg, W, x, 15, v); paint(gg, W, x, 285, v); } }
    for (let y = 15; y <= 285; y++) { paint(gg, W, 20, y, v); paint(gg, W, 380, y, v); }
    rect(gg, W, 60, 50, 300, 240, 2);
    return gg;
}
// 바깥 테두리가 연하고 안쪽 건물 박스가 진하면, 기존 기준은 안쪽 박스를 테두리로 잘못 잡았다
g = lightRect(210, false);
f = D.detectOuterFrame(g, W, H);
assert.ok(f && f.left === 60 && f.right === 300, '(기존 동작: 안쪽 박스로 오인식)');
f = R(g, W, H);
assert.ok(f, '연한 선도 찾음');
assert.deepStrictEqual([f.left, f.top, f.right, f.bottom], [20, 15, 380, 285], '번지게 한 보정 뒤에도 정확한 자리');
// 중간이 끊긴 연한 선
f = R(lightRect(200, true), W, H);
assert.ok(f && f.left === 20 && f.right === 380 && f.top === 15 && f.bottom === 285, '끊겨도 찾음');
// 엄격한 기준으로 보이는 도면은 예전과 같은 결과(첫 단계)
g = blank(W, H); rect(g, W, 10, 10, 390, 290, 1); rect(g, W, 16, 16, 384, 284, 4);
f = R(g, W, H);
assert.ok(f && f.pass === 0 && [f.left, f.top, f.right, f.bottom].join() === '10,10,390,290');
// 테두리가 없으면 풀어서 봐도 null
g = blank(W, H); rect(g, W, 50, 50, 150, 120, 2); rect(g, W, 200, 150, 260, 200, 2);
assert.strictEqual(R(g, W, H), null, '풀어도 방만 있으면 null');
assert.strictEqual(R(blank(W, H), W, H), null);
// 바탕이 연한 회색(230)인 도면: 종이 전체를 테두리로 잡지 않고 진짜 테두리(40..360)를 찾는다
g = new Uint8Array(W * H).fill(230);
rect(g, W, 40, 30, 360, 270, 2);
f = R(g, W, H);
assert.ok(f && f.left === 40 && f.top === 30 && f.right === 360 && f.bottom === 270, '회색 바탕에서도 정확');
assert.ok(/detectOuterFrameRobust/.test(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8')), '앱이 보강 함수를 씀');
// 캐드 기준점 짝짓기: 캐드 y 위쪽 + / 그림 y 아래쪽 +
const fr = { left: 10, top: 20, right: 300, bottom: 200 };
assert.deepStrictEqual(D.matchCadRefsToFrame(fr, { x: 0, y: 1000 }, { x: 5000, y: 0 }), [{ x: 10, y: 20 }, { x: 300, y: 200 }], 'TL→BR');
assert.deepStrictEqual(D.matchCadRefsToFrame(fr, { x: 5000, y: 0 }, { x: 0, y: 1000 }), [{ x: 300, y: 200 }, { x: 10, y: 20 }], 'BR→TL');
assert.deepStrictEqual(D.matchCadRefsToFrame(fr, { x: 0, y: 0 }, { x: 5000, y: 1000 }), [{ x: 10, y: 200 }, { x: 300, y: 20 }], 'BL→TR');
// toGray: 투명 = 흰색
assert.deepStrictEqual(Array.from(D.toGray(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]), 2, 1)), [0, 255]);
// 앱 연결: 제안만 하고 확인 후 적용
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/proposeCadFrameCorners\(\)\.catch/.test(app));
const body = app.slice(app.indexOf('async function proposeCadFrameCorners('), app.indexOf('async function proposeCadFrameCorners(') + 3000);
assert.ok(body.indexOf('window.appChoose(') > 0 && body.indexOf('cur.pt1 = pair[0]') > body.indexOf('window.appChoose('), '확인 뒤에만 적용');
assert.ok(/js\/shared\/cad-frame-detect\.js/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));
console.log('test-cad-frame-detect: ok');

// 「자동 인식」 체크(기본 켬, localStorage)
assert.ok(app.indexOf('id="chkCadAutoDetect"') > 0 && app.indexOf('>자동 인식</label>') > 0, 'checkbox');
assert.ok(/localStorage\.getItem\('bsa\.cadAutoDetect'\) !== '0'/.test(app), 'default on');
assert.ok(/if \(isCadAutoDetectOn\(\)\) setTimeout\(\(\) => \{ proposeCadFrameCorners/.test(app), 'gated');
console.log('test-cad-frame-detect: checkbox ok');
