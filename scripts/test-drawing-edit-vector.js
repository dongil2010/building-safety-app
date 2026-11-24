'use strict';
// 도면 편집기 DXF 벡터 저장(2026-11-24): 지우기 영역으로 캐드 선 자르기 · 기록용 캔버스 · 편집 결과 → 펼친 DXF(옛 좌표계 그대로)
const assert = require('assert');
const V = require('../js/core/drawing-edit-vector.js');
const P = require('../js/core/dxf-to-pdf.js');
const DV = require('../js/core/dxf-view.js');

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);

// 볼록 다각형 안 구간
{
    const sq = V.makeConvex([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const iv = V.segInside(sq, -5, 5, 15, 5);
    near(iv[0], 0.25); near(iv[1], 0.75);
    assert.strictEqual(V.segInside(sq, -5, 20, 15, 20), null, '밖');
    // 시계 방향으로 줘도 같다
    const cw = V.makeConvex([[0, 10], [10, 10], [10, 0], [0, 0]]);
    const iv2 = V.segInside(cw, -5, 5, 15, 5);
    near(iv2[0], 0.25); near(iv2[1], 0.75);
    assert(V.pointInConvex(sq, 5, 5) && !V.pointInConvex(sq, 11, 5));
    console.log('볼록 다각형 구간: ok');
}

// 폴리선 자르기: 가운데가 잘리면 두 조각, 안 닿으면 null, 닫힌 사각형은 한 줄로 이어짐
{
    const hole = V.makeConvex([[4, -1], [6, -1], [6, 1], [4, 1]]);
    const pieces = V.cutPolyline([0, 0, 10, 0], false, [hole]);
    assert.strictEqual(pieces.length, 2);
    assert.deepStrictEqual(pieces[0].map((v) => Math.round(v * 1000) / 1000), [0, 0, 4, 0]);
    assert.deepStrictEqual(pieces[1].map((v) => Math.round(v * 1000) / 1000), [6, 0, 10, 0]);
    assert.strictEqual(V.cutPolyline([0, 5, 10, 5], false, [hole]), null, '안 닿음');
    // 꺾인 폴리선: 꺾인 점에서 끊기지 않고 이어진다
    const bent = V.cutPolyline([0, 0, 10, 0, 10, 10], false, [V.makeConvex([[-1, -1], [2, -1], [2, 1], [-1, 1]])]);
    assert.strictEqual(bent.length, 1);
    assert.deepStrictEqual(bent[0].map((v) => Math.round(v)), [2, 0, 10, 0, 10, 10]);
    // 닫힌 사각형 윗변 가운데를 지우면 한 줄(열린 폴리선)로
    const rect = [0, 0, 10, 0, 10, 10, 0, 10];
    const cut = V.cutPolyline(rect, true, [V.makeConvex([[4, 9], [6, 9], [6, 11], [4, 11]])]);
    assert.strictEqual(cut.length, 1, '닫힌 선은 이어 붙여 한 줄');
    const c = cut[0].map((v) => Math.round(v));
    assert.deepStrictEqual([c[0], c[1]], [4, 10]);
    assert.deepStrictEqual([c[c.length - 2], c[c.length - 1]], [6, 10]);
    // 완전히 덮으면 빈 목록
    assert.deepStrictEqual(V.cutPolyline([2, 2, 3, 3], false, [V.makeConvex([[0, 0], [5, 0], [5, 5], [0, 5]])]), []);
    console.log('폴리선 자르기: ok');
}

// 기록용 캔버스: 흰 사각형 = 지우기, 검은 선 = 선, 잘림 영역 안만, 글자 각도
{
    const R = V.createRecorder([1, 0, 0, -1, 0, 100]); // 그림 픽셀(y 아래) → 점(y 위), 쪽 높이 100
    const ctx = R.ctx;
    ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, 20, 10); ctx.restore();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(40, 50); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(10, 40, 10, 20); ctx.clip();
    ctx.beginPath(); ctx.moveTo(0, 45); ctx.lineTo(40, 45); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(50, 50); ctx.rotate(Math.PI / 2); ctx.font = '600 12px sans-serif'; ctx.fillText('실', 0, 0); ctx.restore();
    const ev = R.events;
    assert.strictEqual(ev[0].type, 'erase');
    assert.deepStrictEqual(ev[0].polys[0].bbox, [10, 80, 30, 90], '흰 사각형 → 점 좌표 지우기 영역');
    assert.strictEqual(ev[1].type, 'line');
    assert.deepStrictEqual(ev[1].pts, [0, 50, 40, 50]);
    near(ev[1].w, 2);
    assert.strictEqual(ev[2].type, 'line');
    assert.deepStrictEqual(ev[2].pts.map((v) => Math.round(v)), [10, 55, 20, 55], '잘림 영역 안만');
    assert.strictEqual(ev[3].type, 'text');
    near(ev[3].rot, -90, 1e-9, '화면 시계 90° = 점 공간 −90°');
    near(ev[3].size, 12);
    // 흰 선(지우개) = 캡슐 지우기
    const R2 = V.createRecorder([1, 0, 0, 1, 0, 0]);
    R2.ctx.strokeStyle = '#fff'; R2.ctx.lineWidth = 4;
    R2.ctx.beginPath(); R2.ctx.moveTo(0, 0); R2.ctx.lineTo(10, 0); R2.ctx.stroke();
    assert.strictEqual(R2.events[0].type, 'erase');
    const cap = R2.events[0].polys[0];
    assert(V.pointInConvex(cap, 5, 1.9) && !V.pointInConvex(cap, 5, 2.2) && V.pointInConvex(cap, -1.5, 0));
    console.log('기록용 캔버스: ok');
}

// 모델 + 편집 → 펼친 DXF: 옛 좌표계 그대로, 지운 곳 잘림, 새 선·글자 추가, 다시 읽으면 같은 모양
(async () => {
    const meta = { v: 1, s: 0.5, ox: 1000, oy: 2000, pageW: 200, pageH: 100, unit: 4, src: 'a.dxf' };
    // 원래 캐드 선: 가로 벽선(점 좌표 0,50 → 200,50) + 채움 하나 + 글자 하나
    const content = 'q\n0 G 0 g\n0.5 g\n150 10 m\n160 10 l\n160 20 l\n150 20 l\nh\nf*\n0 g\n0.15 w\n0 50 m\n200 50 l\nS\nQ\n';
    const model = DV.parsePaths(Buffer.from(content, 'latin1'));
    model.pageW = 200; model.pageH = 100;
    model.texts = [[100, 80, 4, 0, 1, 2, 'ROOM']];
    model.lw = 0.15;
    const refW = 400, refH = 200; // 그림 픽셀 = 점 × 2
    const R = V.createRecorder(V.pxToPtMatrix(refW, refH, meta.pageW, meta.pageH));
    // 벽선 가운데(그림 x 180~220, y 100 근처)를 흰색으로 지우기
    R.ctx.save(); R.ctx.fillStyle = '#fff'; R.ctx.fillRect(180, 90, 40, 20); R.ctx.restore();
    // 채움 가운데를 지우기 → 채움 빠짐
    R.ctx.save(); R.ctx.fillStyle = '#fff'; R.ctx.fillRect(305, 165, 10, 10); R.ctx.restore();
    // 새 선(편집기 기본 굵기 2px = 점 1)
    R.ctx.lineWidth = 2; R.ctx.beginPath(); R.ctx.moveTo(0, 20); R.ctx.lineTo(100, 20); R.ctx.stroke();
    // 새 글자
    R.ctx.save(); R.ctx.translate(40, 40); R.ctx.font = '600 20px sans-serif'; R.ctx.fillText('사무실', 0, 0); R.ctx.restore();
    const res = V.buildEditedFlat(model, meta, R.events, { baseLwPt: 1 });
    const flat = res.flat;
    assert.strictEqual(res.stats.cutLines, 1);
    assert.strictEqual(res.stats.removedFills, 1);
    assert.strictEqual(res.stats.addedLines, 1);
    assert.strictEqual(res.stats.addedTexts, 1);
    const lines = flat.polylines.filter((p) => !p.fill);
    assert.strictEqual(lines.length, 3, '벽선 두 조각 + 새 선');
    // 벽선 첫 조각: 점 0..90 → 캐드 x = 점/0.5 + 1000
    near(lines[0].pts[0], 1000); near(lines[0].pts[2], 90 / 0.5 + 1000, 1e-6);
    near(lines[1].pts[0], 110 / 0.5 + 1000, 1e-6);
    near(lines[0].pts[1], 50 / 0.5 + 2000);
    assert.strictEqual(lines[2].width, 0, '편집기 기본 굵기 = 캐드 기본 선');
    near(lines[2].pts[1], (100 - 10) / 0.5 + 2000, 1e-6, '그림 y 20 → 점 90');
    assert.strictEqual(flat.polylines.filter((p) => p.fill).length, 0);
    assert.strictEqual(flat.texts.length, 2);
    const nt = flat.texts[1];
    assert.strictEqual(nt.text, '사무실');
    near(nt.h, (10 * 0.72) / 0.5, 1e-9, '글자 높이: 20px → 10점 × 0.72');
    assert.strictEqual(nt.hAlign, 1); assert.strictEqual(nt.vAlign, 2);
    near(flat.bounds.minX, 1000); near(flat.bounds.maxX, 200 / 0.5 + 1000);

    // 내용 흐름으로 다시 쓰고(옛 fit) 다시 읽으면 같은 점 좌표
    const fit = { s: meta.s, ox: meta.ox, oy: meta.oy, pageW: meta.pageW, pageH: meta.pageH };
    const content2 = P.buildPathContent(flat, fit, { lineWidth: 0.15 });
    const m2 = DV.parsePaths(Buffer.from(content2, 'latin1'));
    assert.strictEqual(m2.n, 3);
    near(m2.coords[0], 0, 0.01); near(m2.coords[2], 90, 0.01);
    console.log('편집 → 펼친 DXF(옛 좌표계): ok');
    console.log('test-drawing-edit-vector: ok');
})().catch((e) => { console.error(e); process.exit(1); });
