#!/usr/bin/env node
'use strict';

/**
 * 2026-11-24 「뭘 보고 이렇게 잡는건지」 — 층 도면을 바꿨는데(도면 편집기 저장·DXF 다시 올리기·동기화)
 * 스냅·행열 자동 잡기 자료(js/pdf-vector-snap.js)가 층 번호로만 캐시돼 옛 PDF 선을 계속 썼다.
 * → 행·열 선이 새 도면보다 약 3% 커지고 밀려 보였다. PDF가 바뀌면 다시 뽑는지 확인한다.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js', 'pdf-vector-snap.js'), 'utf8');

// 가짜 PDF: dataURL 안에 쪽 폭을 적어 둔다. 세로선 하나(x = 쪽 폭의 절반)를 그린 도면.
const OPS = { save: 1, restore: 2, transform: 3, constructPath: 4, moveTo: 10, lineTo: 11, curveTo: 12, curveTo2: 13, curveTo3: 14, rectangle: 15, closePath: 16 };
function fakePage(pageW) {
    const pageH = 500;
    return {
        getViewport({ scale }) {
            const w = pageW * scale, h = pageH * scale;
            return {
                width: w, height: h,
                transform: [scale, 0, 0, -scale, 0, h],
                convertToViewportPoint: (x, y) => [x * scale, h - y * scale]
            };
        },
        async getOperatorList() {
            return { fnArray: [OPS.constructPath], argsArray: [[[OPS.moveTo, OPS.lineTo], [pageW / 2, 0, pageW / 2, pageH]]] };
        },
        async getTextContent() { return { items: [] }; }
    };
}
let opened = 0;
const sandbox = {
    console,
    setTimeout,
    pdfjsLib: { OPS },
    acquirePdfPageFromDataUrl: async (url) => {
        opened++;
        const pageW = Number(String(url).split('W=')[1]);
        const page = fakePage(pageW);
        return { page, baseViewport: page.getViewport({ scale: 1 }) };
    }
};
sandbox.window = sandbox;
sandbox.invalidatePdfPageCache = () => { sandbox.invalidated = (sandbox.invalidated || 0) + 1; };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const S = sandbox.BSA_PDF_SNAP;

(async () => {
    const urlA = 'data:application/pdf;base64,AAAA#W=1000';
    const urlB = 'data:application/pdf;base64,AAAA#W=1030'; // 도면 편집 뒤 쪽 맞춤이 3% 달라진 PDF

    assert.strictEqual(await S.ensureGeometry(urlA, 'b1', '1F', 4000), true);
    const a = S.getDetectionData('b1', '1F');
    assert.strictEqual(opened, 1);

    // 같은 PDF → 캐시 그대로
    assert.strictEqual(await S.ensureGeometry(urlA, 'b1', '1F', 4000), true);
    assert.strictEqual(opened, 1, '같은 PDF는 다시 읽지 않는다');

    // 다른 PDF → 다시 뽑는다(예전엔 옛 자료를 그대로 돌려줬다)
    assert.strictEqual(await S.ensureGeometry(urlB, 'b1', '1F', 4000), true);
    const b = S.getDetectionData('b1', '1F');
    assert.strictEqual(opened, 2, '바뀐 PDF는 다시 읽는다');
    assert.ok(sandbox.invalidated >= 1, '쪽 캐시도 비운다');
    assert.notStrictEqual(a.h, b.h, '긴 변은 4000으로 같고 짧은 변이 달라진다');
    const xA = a.segments[0][0], xB = b.segments[0][0];
    assert.ok(Math.abs(xA - a.w / 2) < 1 && Math.abs(xB - b.w / 2) < 1, '선 위치가 새 PDF 기준');

    // 쪽 캐시(js/core/state.js)도 PDF가 바뀌면 옛 쪽을 돌려주지 않는다
    const state = fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8');
    assert.ok(/hit\.sig === sig/.test(state) && /baseViewport, sig \}/.test(state), 'state.js 쪽 캐시 sig 확인');

    console.log('test-pdf-snap-cache-sig: ok');
})().catch((e) => { console.error(e); process.exit(1); });
