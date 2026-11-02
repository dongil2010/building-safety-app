'use strict';
// 벡터 PDF 핀 번호 글자 (2026-11-02)
//  A) 선(획) 글꼴: 글꼴 없이 선으로 그려 EMF·WMF 변환기가 글꼴을 못 찾아 깨지는 것을 피한다. 기본은 끔(예전 Helvetica 글자), textAsPaths=true 로 켠다
//  B) 흰 윤곽선: 화면처럼 NO.XX 글자 둘레에 흰 윤곽선을 둬 도면 선과 겹쳐도 읽히게 한다(색 채운 박스·표 안 글자에는 안 씀)
//  C) 원본(캐드) PDF가 남긴 그래픽 상태를 q … Q로 가둔다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
const WHITE = { white: true };
const win = { PDFLib: { LineCapStyle: { Round: 1 }, popGraphicsState: () => 'Q-op', rgb: () => WHITE } };
win.window = win;
const ctx = { console, Array, Object, String, Number, Math, window: win, document: { createElement: () => ({ getContext: () => ({}) }) } };
vm.createContext(ctx);
vm.runInContext('var PDFLib = window.PDFLib;\n' + src, ctx);
const ST = win.BSA_PDF_VECTOR.strokeText;
assert.ok(ST && typeof ST.layout === 'function', '선 글자 배치 함수가 노출됨');
assert.strictEqual(win.BSA_PDF_VECTOR.textAsPaths, false, '선 글자는 기본 끔');

// ---- A) 선 글꼴 ----
const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_/?:()';
Array.from(need).forEach((ch) => assert.ok(ST.font[ch], '선 글꼴에 ' + ch + ' 없음'));
['NO.12', 'NO.07-2', 'B1-3', '2-1', '?-1', 'PH2-4', 'RF-10', 'no.5'].forEach((t) => assert.ok(ST.layout(t), t + ' 배치'));
assert.strictEqual(ST.layout('지상1층'), null);
assert.strictEqual(ST.layout('NO.한'), null);
assert.strictEqual(ST.layout(''), null);
assert.strictEqual(ST.layout('   '), null);
Object.keys(ST.font).forEach((ch) => {
    const g = ST.font[ch];
    assert.ok(g.strokes.length >= 1 && g.w >= 0, ch);
    g.strokes.forEach((s) => {
        assert.ok(s.length >= 2, ch + ' 획 점 2개 이상');
        s.forEach((p) => {
            assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]), ch);
            assert.ok(p[1] >= -10 && p[1] <= 110, ch + ' 높이');
        });
    });
});
assert.ok(ST.font.O.w > ST.font['0'].w, '영문 O는 숫자 0보다 넓다(NO. 구분)');
const lay = ST.layout('NO.12');
assert.strictEqual(lay.glyphs.map((g) => g.ch).join(''), 'NO.12');
for (let i = 1; i < lay.glyphs.length; i++) assert.ok(lay.glyphs[i].x > lay.glyphs[i - 1].x);
assert.strictEqual(ST.layout('no.12').glyphs.map((g) => g.ch).join(''), 'NO.12');

const calls = { lines: [], texts: [] };
const page = { drawLine: (o) => calls.lines.push(o), drawText: (t, o) => calls.texts.push([t, o]) };
const font = { widthOfTextAtSize: () => 30 };
const reset = () => { calls.lines.length = 0; calls.texts.length = 0; };

(async () => {
    // 기본(끔): 예전처럼 Helvetica 글자 한 번, 선 없음
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red');
    assert.strictEqual(calls.lines.length, 0, '기본은 선 글자 아님');
    assert.strictEqual(calls.texts.length, 1);
    assert.deepStrictEqual(calls.texts[0][1].color, 'red');

    // 켜면 선으로(가운데 정렬·둥근 끝·drawText 안 씀)
    reset();
    win.BSA_PDF_VECTOR.textAsPaths = true;
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red');
    assert.ok(calls.lines.length > 20, '선으로 그림: ' + calls.lines.length);
    assert.strictEqual(calls.texts.length, 0);
    const xs = calls.lines.flatMap((l) => [l.start.x, l.end.x]);
    const ys = calls.lines.flatMap((l) => [l.start.y, l.end.y]);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 100) < 1.5, '가로 가운데');
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 50) < 2, '세로 가운데');
    assert.ok(calls.lines.every((l) => l.thickness > 0 && l.lineCap === 1), '둥근 끝·굵기');
    // 선 글꼴에 없는 글자가 섞이면 Helvetica
    reset();
    await ST.drawCentered(page, null, font, 'NO#1', 100, 50, 16, 'red');
    assert.strictEqual(calls.lines.length, 0);
    assert.strictEqual(calls.texts.length, 1);

    // ---- B) 흰 윤곽선 ----
    // 선 글자 + 윤곽선: 같은 획을 굵은 흰 선으로 먼저, 글자색 선은 그 위
    reset();
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red', { halo: true });
    const n = calls.lines.length / 2;
    assert.ok(Number.isInteger(n) && n > 20, '획 수의 두 배');
    assert.ok(calls.lines.slice(0, n).every((l) => l.color === WHITE), '앞쪽은 흰색');
    assert.ok(calls.lines.slice(n).every((l) => l.color === 'red'), '뒤쪽은 글자색');
    assert.ok(calls.lines[0].thickness > calls.lines[n].thickness, '흰 선이 더 굵다');
    // 윤곽선 없이는 한 겹
    reset();
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red');
    assert.ok(calls.lines.every((l) => l.color === 'red'));
    win.BSA_PDF_VECTOR.textAsPaths = false;

    // Helvetica + 윤곽선: 흰 글자 여덟 방향 + 글자색 한 번(마지막)
    reset();
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red', { halo: true });
    assert.strictEqual(calls.lines.length, 0);
    assert.strictEqual(calls.texts.length, 9);
    assert.ok(calls.texts.slice(0, 8).every((t) => t[1].color === WHITE), '앞 여덟은 흰색');
    assert.strictEqual(calls.texts[8][1].color, 'red', '마지막이 글자색(맨 위)');
    const dx = calls.texts.slice(0, 8).map((t) => t[1].x - calls.texts[8][1].x);
    const dy = calls.texts.slice(0, 8).map((t) => t[1].y - calls.texts[8][1].y);
    assert.ok(dx.some((v) => v > 0) && dx.some((v) => v < 0) && dy.some((v) => v > 0) && dy.some((v) => v < 0), '사방으로 퍼짐');
    assert.ok(Math.max(...dx.map(Math.abs), ...dy.map(Math.abs)) <= 16 * 0.1 + 1e-6, '반경은 글자 크기의 10% 이내');
    assert.strictEqual(calls.texts[8][1].x, 100 - 15, '글자색 글자는 원래 자리(가운데)');

    // 윤곽선을 안 부르면(박스 안이 흰색·색 채운 박스·범례 표) 한 번만
    reset();
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'white');
    assert.strictEqual(calls.texts.length, 1);

    // 호출부 연결: 색을 채우지 않은 핀 번호 박스에서만 윤곽선
    assert.ok(src.includes('{ halo: !p.fill }'), '채우지 않은 박스에서만 윤곽선');
    const legendIdx = src.indexOf("'구분'");
    assert.ok(legendIdx > 0 && !/halo/.test(src.slice(legendIdx, legendIdx + 600)), '범례 표 글자에는 윤곽선 없음');

    // ---- C) 원본 그래픽 상태 격리 ----
    const order = [];
    const contents = { insert: (i, ref) => order.push(['insert', i, ref]) };
    const pdfDoc = { context: { stream: (str) => ({ str }), register: (st) => st.str } };
    const pg = { node: { normalize: () => order.push('normalize'), Contents: () => contents }, pushOperators: (op) => order.push(['push', op]) };
    assert.strictEqual(ST.isolate(pdfDoc, pg), true);
    assert.strictEqual(order[0], 'normalize');
    assert.strictEqual(order[1][0], 'insert');
    assert.strictEqual(order[1][1], 0, '맨 앞에');
    assert.strictEqual(String(order[1][2]).trim(), 'q', 'q 연산자');
    assert.deepStrictEqual(order[2], ['push', 'Q-op'], '원본 뒤에 Q');
    const warn = console.warn; console.warn = () => {};
    assert.strictEqual(ST.isolate(pdfDoc, { node: { Contents: () => { throw new Error('boom'); } } }), false);
    console.warn = warn;
    assert.ok(src.includes('isolatePageGraphicsState(outDoc, page);'), '내보내기에서 격리 호출');
    assert.ok(src.indexOf('isolatePageGraphicsState(outDoc, page);') > src.indexOf('const page = outDoc.getPages()[0];'), '페이지를 얻은 뒤에');

    console.log('test-vector-pdf-stroke-text: ok');
})().catch((e) => { console.error(e); process.exit(1); });
