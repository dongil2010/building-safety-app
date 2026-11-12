'use strict';
// 캐드 DXF → 벡터 PDF(2026-11-12): 배율 계산·meta 쓰기/읽기·내용 흐름(PDF 만들기는 브라우저 전용이라 여기선 순수 부분만)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/core/dxf-to-pdf.js');

const near = (a, b, eps, msg) => assert(Math.abs(a - b) <= (eps || 1e-6), (msg || '') + ` ${a} ≈ ${b}`);

(async () => {
    // 배율: 긴 변 2384점, 비율 유지, 여유 포함, 원점 왕복
    {
        const fit = P.computeFit({ minX: 1000, minY: 2000, maxX: 51000, maxY: 27000 });
        near(Math.max(fit.pageW, fit.pageH), 2384, 1e-9, '긴 변');
        near(fit.pageW / fit.pageH, (50000 + 2000) / (25000 + 2000), 1e-9, '비율(여유 2%)');
        const [px, py] = P.worldToPdf(fit, 1000, 2000);
        assert(px > 0 && py > 0, '도면이 쪽 안');
        const meta = P.buildMeta(fit, 4, '1층.dxf');
        const [wx, wy] = P.pdfToWorld(meta, px, py);
        near(wx, 1000, 1e-6); near(wy, 2000, 1e-6);
        const [qx, qy] = P.worldToPdf(fit, 51000, 27000);
        assert(qx < fit.pageW && qy < fit.pageH);
        assert.strictEqual(P.computeFit(null), null);
        assert.strictEqual(P.computeFit({ minX: 1, minY: 1, maxX: 1, maxY: 1 }), null, '점 하나는 그릴 수 없음');
        // 가는 선 하나만 있어도 쪽 짧은 변이 0이 아님
        const thin = P.computeFit({ minX: 0, minY: 0, maxX: 100, maxY: 0 });
        assert(thin.pageH > 50);
        console.log('배율·좌표 왕복: ok');
    }

    // meta 글자 왕복 + 이상한 값은 null
    {
        const meta = { v: 1, s: 0.05, ox: -12.5, oy: 3, pageW: 2384, pageH: 1600, unit: 4, src: '본관 {1}층 "도면".dxf' };
        const kw = P.encodeMeta(meta);
        assert(kw.startsWith('BSA-DXF:'));
        assert.deepStrictEqual(P.parseMetaFromKeywords(kw), meta);
        assert.deepStrictEqual(P.parseMetaFromKeywords('다른 말 ' + kw + ' 뒤 글자'), meta, '앞뒤에 다른 키워드');
        assert.strictEqual(P.parseMetaFromKeywords(''), null);
        assert.strictEqual(P.parseMetaFromKeywords('PDF, 도면'), null);
        assert.strictEqual(P.parseMetaFromKeywords('BSA-DXF:{"v":2,"s":1,"ox":0,"oy":0,"pageW":1,"pageH":1}'), null, '버전 다름');
        assert.strictEqual(P.parseMetaFromKeywords('BSA-DXF:{"v":1,"s":0,"ox":0,"oy":0,"pageW":1,"pageH":1}'), null, '배율 0');
        assert.strictEqual(P.parseMetaFromKeywords('BSA-DXF:{broken'), null);
        console.log('meta 글자 왕복: ok');
    }

    // PDF 바이트에서 Keywords 읽기: pdf-lib가 쓰는 UTF-16BE hex, 글자열 (…) 둘 다. 보통 PDF는 null(던지지 않음)
    {
        const meta = { v: 1, s: 2, ox: 10, oy: 20, pageW: 2384, pageH: 1000, unit: 4, src: '한글 도면.dxf' };
        const text = P.encodeMeta(meta);
        let hex = 'FEFF';
        for (const ch of text) {
            const c = ch.charCodeAt(0);
            hex += c.toString(16).padStart(4, '0').toUpperCase();
        }
        const pdfLike = (info) => Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n5 0 obj\n<< ' + info + ' /Producer (pdf-lib) >>\nendobj\ntrailer\n<< /Info 5 0 R >>\n%%EOF', 'latin1');
        const a = pdfLike('/Keywords <' + hex + '>');
        assert.deepStrictEqual(await P.readMetaFromPdfBytes(new Uint8Array(a)), meta, 'hex UTF-16BE');
        const ascii = { v: 1, s: 2, ox: 10, oy: 20, pageW: 2384, pageH: 1000, unit: 0, src: 'a(b).dxf' };
        const lit = P.encodeMeta(ascii).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
        const b = pdfLike('/Keywords (' + lit + ')');
        assert.deepStrictEqual(await P.readMetaFromPdfBytes(new Uint8Array(b)), ascii, '(literal) 글자열');
        // 덧붙여 저장: 뒤쪽 Keywords가 이긴다
        const both = Buffer.concat([pdfLike('/Keywords (old)'), Buffer.from('\n6 0 obj\n<< /Keywords <' + hex + '> >>\nendobj\n', 'latin1')]);
        assert.deepStrictEqual(await P.readMetaFromPdfBytes(new Uint8Array(both)), meta);
        assert.strictEqual(await P.readMetaFromPdfBytes(new Uint8Array(pdfLike('/Title (x)'))), null, '보통 PDF');
        assert.strictEqual(await P.readMetaFromPdfBytes(null), null);
        assert.strictEqual(await P.readMetaFromPdfBytes(new Uint8Array([1, 2, 3])), null);
        const url = 'data:application/pdf;base64,' + a.toString('base64');
        assert.deepStrictEqual(await P.readMetaFromPdfDataUrl(url), meta, 'dataURL');
        assert.strictEqual(await P.readMetaFromPdfDataUrl('data:application/pdf;base64,' + pdfLike('').toString('base64')), null);
        assert.strictEqual(await P.readMetaFromPdfDataUrl('https://example.com/a.pdf'), null, 'dataURL 아니면 null');
        assert.strictEqual(await P.readMetaFromPdfDataUrl(undefined), null);
        console.log('PDF Keywords 읽기: ok');
    }

    // 내용 흐름: 채움 먼저(같은 fillId는 한 경로 f*), 선은 검정 0.6, 두꺼운 폴리선은 폭 반영, q…Q로 감쌈
    {
        const fit = { s: 2, ox: 0, oy: 0, pageW: 100, pageH: 100 };
        const flat = {
            polylines: [
                { pts: [0, 0, 10, 0], closed: false },
                { pts: [0, 0, 1, 0, 1, 1], closed: true, fill: true, fillId: 7 },
                { pts: [2, 2, 3, 2, 3, 3], closed: true, fill: true, fillId: 7 },
                { pts: [0, 0, 0, 10, 5, 5], closed: true, width: 1 },
                { pts: [1, 1, 2, 2.333333], closed: false }
            ],
            texts: []
        };
        const c = P.buildPathContent(flat, fit);
        assert(c.startsWith('q\n') && c.trim().endsWith('Q'), 'q…Q');
        const fillPart = c.slice(c.indexOf('0.5 g'), c.indexOf('0.6 w'));
        assert.strictEqual((fillPart.match(/f\*/g) || []).length, 1, '구멍 있는 해치는 한 경로');
        assert(c.indexOf('0.5 g') < c.indexOf('0.6 w'), '채움 먼저');
        assert(/0 0 m\n20 0 l\nS/.test(c), '선 좌표 ×배율');
        assert(/\n2 w\n0 0 m\n0 20 l\n10 10 l\nh\nS\n/.test(c), '폭 1 × 배율 2 = 2점, 닫힘 h');
        assert(/0\.6 w\n2 2 m\n4 4\.67 l\nS/.test(c), '폭 되돌림·소수 둘째 자리');
        assert(!/e[+-]?\d/.test(c), '지수 표기 없음');
        console.log('내용 흐름: ok');
    }

    // 글자: WinAnsi 판별, 맞춤 자리
    {
        assert(P.isWinAnsiText('X1 \u00D825 ±0.5 °'));
        assert(!P.isWinAnsiText('A동'));
        assert(!P.isWinAnsiText('⌀'));
        const fit = { s: 1, ox: 0, oy: 0 };
        const left = P.placeText({ x: 10, y: 10, h: 5, rot: 0, hAlign: 0, vAlign: 0 }, fit, 40, 7);
        assert.deepStrictEqual([left.x, left.y], [10, 10]);
        const center = P.placeText({ x: 10, y: 10, h: 5, rot: 0, hAlign: 1, vAlign: 2 }, fit, 40, 7);
        near(center.x, -10); near(center.y, 7.5);
        const rot90 = P.placeText({ x: 0, y: 0, h: 5, rot: 90, hAlign: 2, vAlign: 3 }, fit, 40, 7);
        near(rot90.x, 5, 1e-9); near(rot90.y, -40, 1e-9);
        assert.strictEqual(rot90.rotate, 90);
        console.log('글자 자리: ok');
    }

    // 연결 확인: 올리기 문·파일 고르기·스크립트 태그·내보내기 버튼
    {
        const root = path.join(__dirname, '..');
        const bridge = fs.readFileSync(path.join(root, 'js', 'pdf-vector-bridge.js'), 'utf8');
        const fnStart = bridge.indexOf('window.prepareFloorDrawingUpload = async function');
        const fnBody = bridge.slice(fnStart, bridge.indexOf('window.isFloorPdfRemoved'));
        assert(/\.dxf\$\/i/.test(fnBody) && /dxfFileToPdfFile/.test(fnBody), 'DXF는 PDF File로 바꿔 PDF 길로');
        assert(fnBody.indexOf('dxfFileToPdfFile') < fnBody.indexOf('const isPdf'), '바꾼 뒤 PDF 판별');
        const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        ['inputBuildingDrawingsPdf', 'inputEditBuildingDrawingsPdf'].forEach((id) => {
            const m = html.match(new RegExp('id="' + id + '"[^>]*accept="([^"]+)"'));
            assert(m && /\.dxf/.test(m[1]) && /\.pdf/.test(m[1]), id + ' accept에 .dxf');
        });
        const tag = (f) => html.indexOf('<script src="' + f + '?v=');
        assert(tag('js/core/dxf-read.js') > 0 && tag('js/core/dxf-to-pdf.js') > tag('js/core/dxf-read.js'));
        assert(tag('js/core/dxf-write.js') > tag('js/pdf-vector-snap.js') && tag('js/dxf-marking-export.js') > tag('js/core/dxf-write.js'));
        assert(/id="btnExportMarkingDxf"[^>]*class="btn-rotate-hero pc-only-chrome"/.test(html));
        assert(/getElementById\('btnExportMarkingDxf'\)[\s\S]{0,400}exportMarkingDxfWithScopeChoice[\s\S]{0,300}exportCurrentFloorMarkingDxf/.test(html));
        const app = fs.readFileSync(path.join(root, 'app', '02-buildings.js'), 'utf8');
        assert(/picker\.accept = 'image\/\*,application\/pdf,\.pdf,\.dxf'/.test(app), '층 1:1 교체도 .dxf');
        assert((app.match(/err && err\.bsaUserMessage/g) || []).length >= 2, '변환 실패 안내를 사용자에게');
        console.log('연결: ok');
    }

    console.log('test-dxf-to-pdf: ok');
})().catch((e) => { console.error(e); process.exit(1); });
