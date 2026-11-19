'use strict';
// 결함위치도 SVG 쓰기(2026-11-19): 핀 박스·지시선·영역·범례·원본 도면(벡터)·그림 바탕
// 사용: node scripts/test-svg-write.js [DXF 경로 → 그 도면으로 SVG 파일도 만들어 봄] [출력 .svg]
const assert = require('assert');
const fs = require('fs');
const zlib = require('zlib');
const S = require('../js/core/svg-write.js');
const P = require('../js/core/dxf-to-pdf.js');
const V = require('../js/core/dxf-view.js');
const R = require('../js/core/dxf-read.js');

function fakeStreamObj(num, tag, raw) {
    const z = zlib.deflateSync(Buffer.from(raw));
    return Buffer.concat([
        Buffer.from(`${num} 0 obj\n<<\n/Filter /FlateDecode\n/BSADxf /${tag}\n/Length ${z.length}\n>>\nstream\n`, 'latin1'),
        z,
        Buffer.from('\nendstream\nendobj\n', 'latin1')
    ]);
}

/** DXF 펼친 자료 → 화면 모델(dxf-view) — 앱이 DXF 를 올릴 때와 같은 길 */
async function modelOf(flat) {
    const fit = P.computeFit(flat.bounds);
    const lw = P.pickLineWidth(flat, fit);
    const content = P.buildPathContent(flat, fit, { lineWidth: lw });
    const vt = P.buildViewTexts(flat, fit, lw);
    const bytes = new Uint8Array(Buffer.concat([
        Buffer.from('%PDF-1.7\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n', 'latin1'),
        fakeStreamObj(5, 'Paths', content),
        fakeStreamObj(6, 'Texts', Buffer.from(JSON.stringify(vt), 'utf8')),
        Buffer.from('%%EOF\n', 'latin1')
    ]));
    return V.buildModelFromPdfBytes(bytes, { pageW: fit.pageW, pageH: fit.pageH });
}

function samplePlans(W, H) {
    return [
        {
            color: '#ff0000', fontSize: 14, borderW: 1.5, lineW: 1.2, label: 'NO.01',
            boxX: W * 0.3, boxY: H * 0.2, boxW: 60, boxH: 22,
            leaders: [{ route: [{ x: W * 0.3, y: H * 0.2 + 11 }, { x: W * 0.32, y: H * 0.3 }], tipX: W * 0.32, tipY: H * 0.3, headLen: 11 }],
            area: { shape: 'rect', x1: W * 0.3, y1: H * 0.32, x2: W * 0.36, y2: H * 0.38, fillStyle: 'hatch' }
        },
        {
            color: '#0000ff', fontSize: 14, borderW: 1.5, lineW: 1.2, label: 'NO.02 <&>', fill: true,
            boxX: W * 0.6, boxY: H * 0.5, boxW: 80, boxH: 22,
            leaders: [{ route: [{ x: W * 0.6, y: H * 0.5 }, { x: W * 0.65, y: H * 0.55 }], tipX: W * 0.65, tipY: H * 0.55, useCircleTip: true }],
            areas: [{ shape: 'ellipse', x1: W * 0.62, y1: H * 0.58, x2: W * 0.7, y2: H * 0.64, fillStyle: 'solid', borderStyle: 'dashed' }]
        },
        {
            color: '#ff0000', fontSize: 12, borderW: 1, lineW: 1, label: 'NO.03', typeCallout: true, typeLabel: '균열', col1W: 40,
            boxX: W * 0.8, boxY: H * 0.8, boxW: 90, boxH: 20, leaders: []
        }
    ];
}

const legend = (W) => ({
    boxX: 20, boxY: 20, boxW: 120, boxH: 66, col1W: 45, col2W: 75, headerRowH: 22, rowH: 22, fontSize: 12, lineW: 1,
    items: [{ color: '#ff0000', colorName: '적색', label: '결함발생' }, { color: '#0000ff', colorName: '청색', label: '상태양호' }]
});

(async () => {
    // 1) 마킹만(바탕 없음)
    {
        const W = 1000, H = 700;
        const svg = S.buildMarkingSvg({ width: W, height: H, plans: samplePlans(W, H), legendPlan: legend(W), title: '1층 <결함위치도>' });
        assert(svg.startsWith('<?xml'), 'XML 머리');
        assert(/viewBox="0 0 1000 700"/.test(svg), 'viewBox = 그림 크기');
        assert(svg.includes('<title>1층 &lt;결함위치도&gt;</title>'), '제목 이스케이프');
        assert(svg.includes('NO.02 &lt;&amp;&gt;'), '글자 이스케이프');
        assert(!svg.includes('NO.02 <&>'), '날것의 < & 없음');
        assert(svg.includes('id="BSA_PIN"') && svg.includes('id="BSA_LEADER"') && svg.includes('id="BSA_AREA"') && svg.includes('id="BSA_LEGEND"'), '레이어 묶음');
        assert(!svg.includes('id="BSA_DRAWING"'), '바탕 없으면 도면 묶음 없음');
        assert(/<clipPath id="bsaClip1">/.test(svg) && /clip-path="url\(#bsaClip1\)"/.test(svg), '빗금은 영역 모양으로 자름');
        assert(svg.includes('fill-opacity="0.28"'), '채운 영역 28%');
        assert(svg.includes('stroke-dasharray="5 4"'), '점선 테두리');
        assert(/<circle [^>]*fill="#0000ff"/.test(svg), '동그라미 끝');
        // 한글(HWP)은 paint-order·dominant-baseline 을 무시한다 → 쓰지 않고, 흰 테두리 글자를 따로 아래에 깐다
        assert(!/paint-order|dominant-baseline/.test(svg), '한글에서 무시되는 속성 없음');
        const halo = svg.indexOf('fill="#ffffff" stroke="#ffffff"');
        const no1 = svg.indexOf('fill="#ff0000">NO.01</text>');
        assert(halo > 0 && no1 > halo, '흰 테두리 글자가 번호 글자보다 먼저(아래)');
        // 기준선: 박스 가운데(300, 140) + 0.35em(14 → 4.9)
        assert(/<text x="300" y="144.9"[^>]*fill="#ff0000">NO.01</.test(svg), '기준선을 글자 가운데에 맞춤');
        assert(svg.includes('>균열</text>') && svg.includes('>결함발생</text>') && svg.includes('>구분</text>'), '글자들');
        // 화살촉: 끝점이 꼭짓점인 삼각형
        assert(/<polygon points="320,210 /.test(svg), '화살촉 끝 = 지시선 끝');
        // 잘 짜인 XML(간단 확인: 열고 닫는 <g> 수)
        assert.strictEqual((svg.match(/<g[ >]/g) || []).length, (svg.match(/<\/g>/g) || []).length, '<g> 짝');
        assert(svg.trim().endsWith('</svg>'));
        console.log('마킹만: ok');
    }

    // 2) 그림 바탕
    {
        const svg = S.buildMarkingSvg({ width: 400, height: 300, plans: [], background: { href: 'data:image/jpeg;base64,AAAA', w: 400, h: 300 } });
        assert(/<g id="BSA_DRAWING">\n<image x="0" y="0" width="400" height="300" preserveAspectRatio="none" xlink:href="data:image\/jpeg;base64,AAAA"/.test(svg), '그림 바탕');
        console.log('그림 바탕: ok');
    }

    // 3) 원본 도면(벡터) — 좌표·채움·굵은 선·글자 회전
    {
        const flat = {
            polylines: [
                { pts: [0, 0, 1000, 0, 1000, 500, 0, 500], closed: true },
                { pts: [200, 200, 300, 200], width: 50 },
                { pts: [400, 100, 500, 100, 500, 200, 400, 200], fill: true, fillId: 1 }
            ],
            texts: [
                { x: 500, y: 250, h: 20, rot: 0, hAlign: 1, vAlign: 2, text: 'X1' },
                { x: 100, y: 450, h: 20, rot: 90, hAlign: 0, vAlign: 0, text: '계단실' }
            ],
            bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500 }
        };
        const model = await modelOf(flat);
        assert(model && model.n === 3, '모델');
        const W = 2000, H = Math.round(2000 * model.pageH / model.pageW);
        const svg = S.buildMarkingSvg({ width: W, height: H, plans: [], drawing: { model } });
        assert(svg.includes('id="BSA_DRAWING"'));
        assert(/<g fill="#808080" stroke="none"><path d="M[^"]+Z" fill-rule="evenodd"\/><\/g>/.test(svg), '채움 회색');
        const widths = Array.from(svg.matchAll(/stroke="#000000" stroke-width="([\d.]+)"/g)).map((m) => Number(m[1]));
        assert(widths.length >= 2 && Math.max(...widths) > Math.min(...widths) * 3, '굵은 폴리선은 따로 굵게: ' + widths);
        assert(svg.includes('text-anchor="middle">X1</text>'), '가운데 글자');
        assert(/rotate\(-90\)"[^>]*>계단실<\/text>/.test(svg), '90도 글자는 위로(화면 y 아래)');
        // 테두리 사각형 꼭짓점이 그림 안에(0~W, 0~H)
        const nums = (svg.match(/M[\d. L]+Z/) || [''])[0].match(/[\d.]+/g).map(Number);
        assert(nums.every((v) => v >= -0.01 && v <= Math.max(W, H) + 0.01), '좌표가 그림 안');
        console.log('원본 도면 벡터: ok');
    }

    // 4) (선택) 실제 DXF 로 SVG 파일 만들어 보기
    const src = process.argv[2];
    if (src && fs.existsSync(src)) {
        const flat = R.flattenDxf(R.parseDxf(R.decodeDxfBytes(new Uint8Array(fs.readFileSync(src)))), {});
        const model = await modelOf(flat);
        const W = 4000, H = Math.round(4000 * model.pageH / model.pageW);
        const svg = S.buildMarkingSvg({ width: W, height: H, plans: samplePlans(W, H), legendPlan: legend(W), drawing: { model }, title: 'test' });
        const out = process.argv[3] || 'test-out.svg';
        fs.writeFileSync(out, svg);
        console.log('실제 DXF → SVG:', out, Math.round(svg.length / 1024) + 'KB', 'polylines', model.n, 'texts', (model.texts || []).length);
    }
    console.log('test-svg-write: ok');
})().catch((e) => { console.error(e); process.exit(1); });
