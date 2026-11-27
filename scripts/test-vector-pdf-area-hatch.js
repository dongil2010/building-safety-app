'use strict';
// 벡터 PDF 영역 빗금(2026-11-26): 오목 다각형(ㄱ자)은 빗금이 바깥선 안쪽으로만 — 감싸는 사각형까지 삐져나오지 않음
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
const win = {
  PDFLib: {
    LineCapStyle: { Round: 1 }, rgb: () => ({}),
    pushGraphicsState: () => 'q', popGraphicsState: () => 'Q', moveTo: () => 'm', lineTo: () => 'l',
    closePath: () => 'h', stroke: () => 'S', fill: () => 'f', setLineWidth: () => 'w',
    setStrokingColor: () => 'RG', setFillingColor: () => 'rg', setLineCap: () => 'J', setLineJoin: () => 'j',
    setDashPattern: () => 'd', setGraphicsState: () => 'gs'
  }
};
win.window = win;
const ctx = { console, Array, Object, String, Number, Math, window: win, document: { createElement: () => ({ getContext: () => ({}) }) } };
vm.createContext(ctx);
vm.runInContext('var PDFLib = window.PDFLib;\n' + src, ctx);
const draw = win.BSA_PDF_VECTOR.drawAreaMark;
assert.strictEqual(typeof draw, 'function');

const hatch = [];
const page = {
  drawLine: (o) => { if (o.opacity === 0.7) hatch.push(o); },
  drawRectangle: () => {}, drawSvgPath: () => {}, pushOperators: () => {},
  node: { normalizedEntries: () => ({}) }
};
const H = 100;
const imgToPdf = (x, y) => ({ x, y: H - y });

function insideImg(poly, q) { // q: PDF 좌표 → 그림 좌표로 바꿔 검사
  const p = { x: q.x, y: H - q.y };
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

// ㄱ자 다각형
const L = [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 60 }, { x: 0, y: 60 }];
draw(page, { shape: 'polygon', x1: 0, y1: 0, x2: 60, y2: 60, points: L, fillStyle: 'hatch' }, {}, imgToPdf, 1, 1, H, 1);
assert.ok(hatch.length > 5, 'ㄱ자 빗금 선 ' + hatch.length);
hatch.forEach((o) => {
  for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
    const q = { x: o.start.x + (o.end.x - o.start.x) * f, y: o.start.y + (o.end.y - o.start.y) * f };
    assert.ok(insideImg(L, q), 'ㄱ자 밖 빗금 ' + JSON.stringify([o.start, o.end]));
  }
});

// 반듯한 사각형은 예전처럼 사각형 안 빗금
hatch.length = 0;
draw(page, { shape: 'rect', x1: 0, y1: 0, x2: 50, y2: 30, fillStyle: 'hatch' }, {}, imgToPdf, 1, 1, H, 1);
assert.ok(hatch.length > 5);
hatch.forEach((o) => [o.start, o.end].forEach((q) => {
  assert.ok(q.x >= -1e-6 && q.x <= 50 + 1e-6 && q.y >= 70 - 1e-6 && q.y <= 100 + 1e-6);
}));

console.log('test-vector-pdf-area-hatch: ok');
