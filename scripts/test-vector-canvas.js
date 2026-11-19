'use strict';
// 벡터 기록 캔버스(2026-11-19): 캔버스 그리기 → 도형 목록 → SVG(한글 비파괴 위치도)·DXF(비파괴 마킹)
const assert = require('assert');
const VC = require('../js/core/vector-canvas.js');
const DW = require('../js/core/dxf-write.js');

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);

// 1) 변환·선·채움·글자 기준선
{
    const ctx = VC.createVectorContext({ width: 200, height: 100 });
    ctx.save();
    ctx.translate(10, 20);
    ctx.scale(2, 2);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 2]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#00f';
    ctx.fillRect(1, 1, 2, 3);
    ctx.font = 'bold 12px "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO.1', 5, 5);
    ctx.restore();
    const [line, rect, text] = ctx.ops;
    assert.deepStrictEqual(line.subs[0].pts, [10, 20, 30, 20], '선은 기기 좌표로');
    assert.strictEqual(line.stroke.color, '#ff0000');
    near(line.stroke.alpha, 0.5);
    near(line.stroke.width, 6, 1e-9, '굵기도 배율만큼');
    assert.deepStrictEqual(line.stroke.dash, [8, 4], '점선도 배율만큼');
    assert.strictEqual(rect.fill.color, '#0000ff');
    assert.deepStrictEqual(rect.subs[0].pts, [12, 22, 16, 22, 16, 28, 12, 28]);
    assert(rect.subs[0].closed);
    assert.strictEqual(text.anchor, 'middle');
    assert.strictEqual(text.weight, 700);
    near(text.size, 24, 1e-9, '글자 크기도 배율만큼');
    near(text.x, 20); near(text.y, 30 + 12 * 0.35 * 2, 1e-9, 'middle → 기준선 = 가운데 + 0.35em');
    console.log('변환·선·채움·글자: ok');
}

// 2) 호·돌림 글자·자르기
{
    const ctx = VC.createVectorContext({ width: 100, height: 100 });
    ctx.beginPath(); ctx.arc(50, 50, 10, 0, Math.PI * 2); ctx.fill();
    const pts = ctx.ops[0].subs[0].pts;
    for (let i = 0; i < pts.length; i += 2) near(Math.hypot(pts[i] - 50, pts[i + 1] - 50), 10, 1e-9, '원 위의 점');
    ctx.save();
    ctx.translate(30, 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Y1', 0, 0);
    ctx.beginPath(); ctx.rect(0, 0, 5, 5); ctx.clip();
    ctx.restore();
    const t = ctx.ops[1];
    near(t.angle, -90, 1e-9, '왼쪽으로 돈 글자');
    assert.strictEqual(ctx.ops[2].t, 'clip');
    assert.strictEqual(ctx.ops[3].t, 'unclip', 'restore 에서 자르기 끝');
    const svg = VC.opsToSvg(ctx.ops, { width: 100, height: 100 });
    assert(/<text [^>]*transform="rotate\(-90 30 30\)"[^>]*>Y1<\/text>/.test(svg), 'SVG 글자 돌림');
    assert(!/paint-order|dominant-baseline/.test(svg), '한글이 무시하는 속성 없음');
    assert(/<clipPath id="vcClip1">/.test(svg));
    assert.strictEqual((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, '<g> 짝');
    console.log('호·돌림 글자·자르기: ok');
}

// 3) 그림·벡터 도면 자리
{
    const ctx = VC.createVectorContext({ width: 100, height: 100 });
    const img = { naturalWidth: 40, naturalHeight: 20 };
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0, 40, 20);
    ctx.drawVectorDrawing({ fake: 1 }, 40, 20);
    const svg = VC.opsToSvg(ctx.ops, {
        width: 100, height: 100,
        imageHref: () => 'data:image/jpeg;base64,AA',
        drawingSvg: () => '<g id="BSA_DRAWING"></g>'
    });
    assert(svg.includes('<g transform="matrix(2 0 0 2 0 0)"><image x="0" y="0" width="40" height="20"'), '그림은 변환 그대로');
    assert(svg.includes('<g transform="matrix(2 0 0 2 0 0)"><g id="BSA_DRAWING"></g></g>'), '벡터 도면 자리');
    console.log('그림·벡터 도면: ok');
}

// 4) DXF: 선·채운 삼각형·둥근 점·글자, 흰색은 뺌
{
    const ctx = VC.createVectorContext({ width: 100, height: 100 });
    ctx.strokeStyle = '#ff0000';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.stroke();
    ctx.fillStyle = '#0000ff';
    ctx.beginPath(); ctx.moveTo(20, 20); ctx.lineTo(30, 20); ctx.lineTo(25, 30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(50, 50, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.strokeText('실측1', 60, 60);
    ctx.fillStyle = '#ff0000'; ctx.textAlign = 'center'; ctx.fillText('실측1', 60, 60);
    const dxf = DW.buildMarkingDxf({ plans: [], vectorOps: ctx.ops, toWorld: (x, y) => ({ x, y: 100 - y }), unitPerPx: 1 });
    const lines = dxf.split('\r\n');
    const count = (type) => lines.filter((l, i) => l === type && lines[i - 1] === '0').length;
    assert(dxf.includes('BSA_NDT'), 'BSA_NDT 레이어');
    assert.strictEqual(count('SOLID'), 1, '채운 삼각형 → SOLID');
    assert.strictEqual(count('TEXT'), 1, '흰 테두리 글자는 빼고 하나');
    assert(dxf.includes('\\U+C2E4\\U+CE21' + '1'), '한글 글자');
    assert(count('POLYLINE') >= 2, '선 + 둥근 점(도넛)');
    assert(/\r\n42\r\n1\r\n/.test(dxf), '둥근 점은 채운 원(도넛)');
    console.log('DXF: ok');
}
console.log('test-vector-canvas: ok');
