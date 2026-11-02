'use strict';
// 2026-11-02 벡터 PDF 핀 번호 글자: 글꼴 없이 선(획)으로 그린다 — EMF·WMF 변환기가 글꼴을 못 찾아 글자가 깨지던 문제
//  - 번호에 쓰는 글자(영문 대문자·숫자·. - _ / ? : ( ))는 모두 선 글꼴에 있다
//  - 선 글꼴에 없는 글자가 섞이면 null(→ 예전처럼 Helvetica 글자로)
//  - 가운데 정렬로 선만 그린다(page.drawText 안 씀), 끄는 스위치(textAsPaths=false)
//  - 원본(캐드) PDF가 남긴 그래픽 상태를 q … Q로 가둔다
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-bridge.js'), 'utf8');
const win = { PDFLib: { LineCapStyle: { Round: 1 }, popGraphicsState: () => 'Q-op' } };
win.window = win;
const ctx = { console, Array, Object, String, Number, Math, window: win, document: { createElement: () => ({ getContext: () => ({}) }) } };
vm.createContext(ctx);
vm.runInContext('var PDFLib = window.PDFLib;\n' + src, ctx);
const ST = win.BSA_PDF_VECTOR.strokeText;
assert.ok(ST && typeof ST.layout === 'function', '선 글자 배치 함수가 노출됨');

// 1) 번호에 쓰는 글자는 전부 있다
const need = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_/?:()';
Array.from(need).forEach((ch) => assert.ok(ST.font[ch], '선 글꼴에 ' + ch + ' 없음'));
['NO.12', 'NO.07-2', 'B1-3', '2-1', '?-1', 'PH2-4', 'RF-10', 'no.5'].forEach((t) => assert.ok(ST.layout(t), t + ' 배치'));

// 2) 없는 글자(한글 등)가 섞이면 null → 호출하는 쪽이 다른 방법을 쓴다
assert.strictEqual(ST.layout('지상1층'), null);
assert.strictEqual(ST.layout('NO.한'), null);
assert.strictEqual(ST.layout(''), null);
assert.strictEqual(ST.layout('   '), null);

// 3) 글자마다 획이 있고 좌표가 유한한 수, 높이 100 안팎
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
// 영문 O는 숫자 0보다 넓다(NO. 와 N0. 구분)
assert.ok(ST.font.O.w > ST.font['0'].w);

// 4) 배치: 글자 위치는 왼쪽에서 오른쪽으로 늘고, 소문자는 대문자로
const lay = ST.layout('NO.12');
assert.strictEqual(lay.glyphs.map((g) => g.ch).join(''), 'NO.12');
for (let i = 1; i < lay.glyphs.length; i++) assert.ok(lay.glyphs[i].x > lay.glyphs[i - 1].x);
assert.ok(lay.width > 0);
assert.strictEqual(ST.layout('no.12').glyphs.map((g) => g.ch).join(''), 'NO.12');

// 5) drawCentered: 선만 그리고(drawText 안 씀), 가운데 정렬, 끄면 예전 방식
const calls = { lines: [], texts: [] };
const page = { drawLine: (o) => calls.lines.push(o), drawText: (t, o) => calls.texts.push([t, o]) };
const font = { widthOfTextAtSize: () => 30 };

(async () => {
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red');
    assert.ok(calls.lines.length > 20, '선으로 그림: ' + calls.lines.length);
    assert.strictEqual(calls.texts.length, 0, 'drawText 안 씀');
    const xs = calls.lines.flatMap((l) => [l.start.x, l.end.x]);
    const ys = calls.lines.flatMap((l) => [l.start.y, l.end.y]);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 100) < 1.5, '가로 가운데');
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 50) < 2, '세로 가운데');
    assert.ok(calls.lines.every((l) => l.thickness > 0 && l.lineCap === 1), '둥근 끝·굵기');
    assert.ok(Math.max(...ys) - Math.min(...ys) < 16 * 0.9, '글자 높이가 글자 크기 안');

    // 선 글꼴에 없는 글자가 섞인 영문(기호)은 예전처럼 Helvetica 글자
    calls.lines.length = 0; calls.texts.length = 0;
    await ST.drawCentered(page, null, font, 'NO#1', 100, 50, 16, 'red');
    assert.strictEqual(calls.lines.length, 0);
    assert.strictEqual(calls.texts.length, 1, '없는 글자는 Helvetica');

    // 끄는 스위치
    calls.lines.length = 0; calls.texts.length = 0;
    win.BSA_PDF_VECTOR.textAsPaths = false;
    await ST.drawCentered(page, null, font, 'NO.12', 100, 50, 16, 'red');
    assert.strictEqual(calls.lines.length, 0);
    assert.strictEqual(calls.texts.length, 1, '끄면 예전 방식');
    win.BSA_PDF_VECTOR.textAsPaths = true;

    // 6) 원본 그래픽 상태 격리: 맨 앞에 q, 원본 뒤에 Q
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
    // 실패해도 출력은 계속(예외를 밖으로 안 던짐)
    assert.strictEqual(ST.isolate(pdfDoc, { node: { Contents: () => { throw new Error('boom'); } } }), false);
    // 연결: 내보내기가 격리 함수를 부른다
    assert.ok(src.includes('isolatePageGraphicsState(outDoc, page);'), '내보내기에서 격리 호출');
    assert.ok(src.indexOf('isolatePageGraphicsState(outDoc, page);') > src.indexOf('const page = outDoc.getPages()[0];'), '페이지를 얻은 뒤에');

    console.log('test-vector-pdf-stroke-text: ok');
})().catch((e) => { console.error(e); process.exit(1); });
