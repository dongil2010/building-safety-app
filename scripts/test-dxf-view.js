'use strict';
// 캐드 DXF 화면 벡터 엔진(2026-11-12): PDF 안 표시된 스트림 찾기·선 자료 읽기·그리기(가짜 캔버스)
const assert = require('assert');
const zlib = require('zlib');
const P = require('../js/core/dxf-to-pdf.js');
const V = require('../js/core/dxf-view.js');

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);

/** pdf-lib가 쓰는 모양을 흉내 낸 스트림 객체 */
function fakeStreamObj(num, tag, raw) {
    const z = zlib.deflateSync(Buffer.from(raw));
    return Buffer.concat([
        Buffer.from(`${num} 0 obj\n<<\n/Filter /FlateDecode\n/BSADxf /${tag}\n/Length ${z.length}\n>>\nstream\n`, 'latin1'),
        z,
        Buffer.from('\nendstream\nendobj\n', 'latin1')
    ]);
}

function fakeCtx(W, H) {
    const log = { stroke: 0, fill: 0, lineTo: 0, moveTo: 0, rect: 0, fillText: [], widths: [] };
    const ctx = {
        canvas: { width: W, height: H }, log,
        save() {}, restore() {}, setTransform() {}, beginPath() {}, closePath() {},
        moveTo() { log.moveTo++; }, lineTo() { log.lineTo++; }, rect() { log.rect++; },
        stroke() { log.stroke++; log.widths.push(ctx.lineWidth); }, fill() { log.fill++; },
        fillText(t) { log.fillText.push(t); }, clearRect() {}, drawImage() {}
    };
    return ctx;
}

(async () => {
    const flat = {
        polylines: [
            { pts: [0, 0, 1000, 0, 1000, 500, 0, 500], closed: true },
            { pts: [100, 100, 900, 400] },
            { pts: [200, 200, 300, 200], width: 50 },
            { pts: [400, 100, 500, 100, 500, 200, 400, 200], fill: true, fillId: 1 },
            { pts: [420, 120, 480, 120, 480, 180, 420, 180], fill: true, fillId: 1 },
            { pts: [600, 100, 700, 100, 650, 200], fill: true, fillId: 2 }
        ],
        texts: [
            { x: 500, y: 250, h: 20, rot: 0, hAlign: 1, vAlign: 2, text: 'X1' },
            { x: 100, y: 450, h: 20, rot: 90, hAlign: 0, vAlign: 0, text: '계단실' },
            { x: 100, y: 50, h: 20, rot: 0, hAlign: 0, vAlign: 0, text: '6,000' },
            { x: 100, y: 50, h: 0.001, rot: 0, hAlign: 0, vAlign: 0, text: 'tiny' }
        ],
        bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 }
    };
    const fit = P.computeFit(flat.bounds);

    // 선 굵기: 글자 높이의 5%(범위 안에서), 글자가 없으면 0.15
    {
        const lw = P.pickLineWidth(flat, fit);
        near(lw, Math.min(0.35, 20 * fit.s * 0.05), 1e-9, '글자 높이의 5%');
        assert.strictEqual(P.pickLineWidth({ texts: [] }, fit), 0.15);
        // 범위가 아주 넓은 도면(글자가 0.4점) → 가는 선
        const wideFit = { s: 0.02 };
        near(P.pickLineWidth(flat, wideFit), 0.02, 1e-9, '아주 작은 글자는 최소 굵기');
        console.log('선 굵기: ok');
    }

    const lineW = 0.1;
    const content = P.buildPathContent(flat, fit, { lineWidth: lineW });
    const vt = P.buildViewTexts(flat, fit, lineW);
    assert.strictEqual(vt.texts.length, 4, '아주 작은 글자도 화면용 목록에는 들어간다');
    const pdfBytes = new Uint8Array(Buffer.concat([
        Buffer.from('%PDF-1.7\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n', 'latin1'),
        fakeStreamObj(5, 'Paths', content),
        fakeStreamObj(6, 'Texts', Buffer.from(JSON.stringify(vt), 'utf8')),
        Buffer.from('%%EOF\n', 'latin1')
    ]));

    // 스트림 찾기
    {
        const f = V.findTaggedStream(pdfBytes, 'Paths');
        assert(f && f.flate, '선 스트림을 찾는다');
        assert.strictEqual(Buffer.from(await V.inflate(f.data)).toString('latin1'), content);
        assert.strictEqual(V.findTaggedStream(pdfBytes, 'Nope'), null);
        assert.strictEqual(V.findTaggedStream(new Uint8Array(Buffer.from('%PDF-1.7 plain')), 'Paths'), null, '일반 PDF');
        console.log('스트림 찾기: ok');
    }

    // 모델
    const meta = P.buildMeta(fit, 4, 't.dxf');
    const model = await V.buildModelFromPdfBytes(pdfBytes, meta);
    {
        assert(model, '모델');
        assert.strictEqual(model.n, 6);
        // 채움 3개가 먼저 쓰이고(0~2) 선이 뒤(3~5)
        assert.strictEqual(model.flags[0] & 2, 2, '채움');
        assert.strictEqual(model.group[0], model.group[1], '같은 해치는 한 묶음');
        assert.notStrictEqual(model.group[1], model.group[2]);
        assert.strictEqual(model.count[3], 4);
        assert.strictEqual(model.flags[3], 1, '닫힌 폴리선(선)');
        assert.strictEqual(model.flags[4], 0);
        near(model.lw, lineW, 1e-9);
        const strokes = [];
        for (let i = 0; i < model.n; i++) if (!(model.flags[i] & 2)) strokes.push(i);
        assert.strictEqual(strokes.length, 3);
        const wide = strokes.find((i) => model.width[i] > lineW + 1e-3);
        near(model.width[wide], 50 * fit.s, 0.01, '폭 있는 폴리선');
        const [px, py] = P.worldToPdf(fit, 100, 100);
        const diag = strokes.find((i) => model.count[i] === 2 && Math.abs(model.width[i] - lineW) < 1e-3);
        near(model.coords[model.start[diag] * 2], px, 0.01);
        near(model.coords[model.start[diag] * 2 + 1], py, 0.01);
        near(model.bbox[diag * 4 + 2], P.worldToPdf(fit, 900, 400)[0], 0.01);
        assert.strictEqual(model.texts.length, 4);
        assert.strictEqual(model.texts[1][6], '계단실', '한글 그대로');
        assert.strictEqual(await V.buildModelFromPdfBytes(new Uint8Array(Buffer.from('%PDF-1.7 plain')), meta), null);
        console.log('모델 읽기: ok');
    }

    // 그리기: 전체 보기 / 깊이 확대(보이는 것만) / 선 굵기
    {
        const W = 1200, H = 700;
        const k = 0.4; // 점 → 픽셀
        let ctx = fakeCtx(W, H);
        let r = V.render(ctx, model, [k, 0, 0, -k, 0, model.pageH * k], W, H, {});
        assert(ctx.log.fill >= 3, '종이 바탕 + 채움 두 묶음');
        assert(ctx.log.stroke >= 2, '기본 선 + 굵은 선');
        near(ctx.log.widths[0], 1, 1e-9, '가는 선은 화면 1픽셀');
        assert(ctx.log.widths.some((w) => w > 20), '폭 있는 폴리선은 굵게');
        assert.deepStrictEqual(ctx.log.fillText.slice().sort(), ['6,000', 'X1', '계단실'].sort(), '읽을 수 있는 글자만');
        assert(r.segs > 0);

        // 100배 확대해 도면 밖 빈 곳을 보면 선·글자를 안 그린다
        ctx = fakeCtx(W, H);
        V.render(ctx, model, [40, 0, 0, -40, -5e6, 5e6], W, H, {});
        assert.strictEqual(ctx.log.lineTo, 3, '종이 바탕 네모만');
        assert.strictEqual(ctx.log.fillText.length, 0);

        // 깊이 확대하면 아주 작은 글자도 나온다
        ctx = fakeCtx(W, H);
        const kk = 20000;
        const [tx, ty] = P.worldToPdf(fit, 100, 50);
        V.render(ctx, model, [kk, 0, 0, -kk, W / 2 - tx * kk, H / 2 + ty * kk], W, H, {});
        assert(ctx.log.fillText.includes('tiny'), '확대하면 작은 글자도 보인다');
        // 아주 축소하면 점처럼 작은 것은 선 대신 점으로(같은 픽셀은 한 번만)
        ctx = fakeCtx(W, H);
        V.render(ctx, model, [0.0001, 0, 0, -0.0001, 600.5, 350.5], W, H, {});
        assert.strictEqual(ctx.log.rect, 1, '겹친 점은 하나만');
        assert.strictEqual(ctx.log.stroke, 0);
        console.log('그리기: ok');
    }

    console.log('test-dxf-view: ok');
})().catch((e) => { console.error(e); process.exit(1); });
