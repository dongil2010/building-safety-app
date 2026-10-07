#!/usr/bin/env node
'use strict';

/**
 * 위치도 출력 범위 (2026-10-07) — js/shared/print-crop.js
 *
 * 도면 여백이 많아 한글·PDF 위치도에서 결함 박스가 작게 나오던 것을, 층마다 출력 범위를 정해
 * 그 부분만 종이에 꽉 차게 넣는다. 지킬 것:
 *  - 범위를 안 정한 층은 예전 그대로(도면 전체).
 *  - 자동 맞춤은 도면 내용(제목·치수선 포함)을 다 남기고 바깥 여백만 자른다. 테두리선은 내용이 아니다.
 *  - 저장은 도면 크기에 대한 비율 — 같은 비율의 다른 해상도 도면으로 바꿔도 범위가 유지된다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require(path.join(__dirname, '..', 'js', 'shared', 'print-crop.js'));

// --- normalizeCrop ---
assert.strictEqual(C.normalizeCrop(null, 1000, 800), null);
assert.strictEqual(C.normalizeCrop({ x: 0, y: 0, w: 1000, h: 800 }, 1000, 800), null, '도면 전체와 같으면 기본');
assert.strictEqual(C.normalizeCrop({ x: 2, y: 2, w: 996, h: 797 }, 1000, 800), null, '거의 전체도 기본');
assert.strictEqual(C.normalizeCrop({ x: 100, y: 100, w: 20, h: 300 }, 1000, 800), null, '너무 좁으면 실수로 본다');
assert.deepStrictEqual(C.normalizeCrop({ x: 100, y: 50, w: 600, h: 400 }, 1000, 800), { x: 100, y: 50, w: 600, h: 400 });
assert.deepStrictEqual(C.normalizeCrop({ x: -50, y: -20, w: 600, h: 400 }, 1000, 800), { x: 0, y: 0, w: 550, h: 380 }, '도면 밖은 잘라 낸다');
assert.deepStrictEqual(C.normalizeCrop({ x: 700, y: 450, w: -600, h: -400 }, 1000, 800), { x: 100, y: 50, w: 600, h: 400 }, '거꾸로 끌어도 같다');
assert.strictEqual(C.normalizeCrop({ x: 'a', y: 0, w: 10, h: 10 }, 1000, 800), null);

// --- 저장(비율) ↔ 복원 ---
{
    const stored = C.toStored({ x: 100, y: 80, w: 600, h: 400 }, 1000, 800);
    assert.deepStrictEqual(stored, { nx: 0.1, ny: 0.1, nw: 0.6, nh: 0.5 });
    assert.deepStrictEqual(C.fromStored(stored, 1000, 800), { x: 100, y: 80, w: 600, h: 400 });
    assert.deepStrictEqual(C.fromStored(stored, 2000, 1600), { x: 200, y: 160, w: 1200, h: 800 }, '더 선명한 같은 도면으로 바꿔도 같은 자리');
    assert.strictEqual(C.toStored(null, 1000, 800), null);
    assert.strictEqual(C.fromStored(null, 1000, 800), null, '안 정한 층 = 기본');
    assert.strictEqual(C.fromStored({ nx: 0, ny: 0, nw: 1, nh: 1 }, 1000, 800), null);
}

// --- inkBounds ---
function makeImage(w, h, paint) {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const set = (x, y, v) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
    };
    paint({
        set,
        hline: (y, x1, x2, v) => { for (let x = x1; x <= x2; x++) set(x, y, v); },
        vline: (x, y1, y2, v) => { for (let y = y1; y <= y2; y++) set(x, y, v); },
        rect: (x1, y1, x2, y2, v) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, v); }
    });
    return data;
}

{
    // 빈 종이
    assert.strictEqual(C.inkBounds(makeImage(100, 80, () => {}), 100, 80), null);

    // 가운데 내용만
    const d1 = makeImage(200, 300, (p) => p.rect(60, 90, 139, 199, 0));
    assert.deepStrictEqual(C.inkBounds(d1, 200, 300), { x: 60, y: 90, w: 80, h: 110 });

    // 가장자리 테두리선(도곽)이 있어도 안쪽 내용만 — 광주교회 도면이 이 모양이었다
    const d2 = makeImage(200, 300, (p) => {
        p.hline(3, 3, 196, 120); p.hline(296, 3, 196, 120);
        p.vline(3, 3, 296, 120); p.vline(196, 3, 296, 120);
        p.rect(60, 90, 139, 199, 0);
    });
    assert.deepStrictEqual(C.inkBounds(d2, 200, 300), { x: 60, y: 90, w: 80, h: 110 }, '테두리선은 내용으로 치지 않는다');

    // 도면 안쪽의 긴 선(치수선·벽)은 내용이다 — 가장자리 띠 밖이면 한 줄을 다 채워도 남긴다
    const d3 = makeImage(200, 300, (p) => { p.hline(150, 0, 199, 0); p.rect(90, 100, 110, 120, 0); });
    assert.deepStrictEqual(C.inkBounds(d3, 200, 300), { x: 0, y: 100, w: 200, h: 51 });

    // 옅은 회색 선도 내용, 거의 흰 얼룩은 아님
    const d4 = makeImage(100, 100, (p) => { p.rect(20, 20, 30, 30, 200); p.rect(70, 70, 80, 80, 250); });
    assert.deepStrictEqual(C.inkBounds(d4, 100, 100), { x: 20, y: 20, w: 11, h: 11 });
}

// --- 범례 구석: 여백을 자르면 범례가 도면 내용 위에 올라가므로, 안 가리는 구석을 골라 저장한다 ---
{
    assert.deepStrictEqual(C.normalizeCrop({ x: 100, y: 50, w: 600, h: 400, lc: 'br' }, 1000, 800), { x: 100, y: 50, w: 600, h: 400, lc: 'br' });
    assert.strictEqual(C.normalizeCrop({ x: 100, y: 50, w: 600, h: 400, lc: '엉뚱' }, 1000, 800).lc, undefined);
    const stored = C.toStored({ x: 100, y: 80, w: 600, h: 400, lc: 'tr' }, 1000, 800);
    assert.strictEqual(stored.lc, 'tr');
    assert.strictEqual(C.fromStored(stored, 1000, 800).lc, 'tr');

    assert.deepStrictEqual(C.cornerOrigin('tl', 600, 400, 100, 50, 10), { x: 10, y: 10 });
    assert.deepStrictEqual(C.cornerOrigin('tr', 600, 400, 100, 50, 10), { x: 490, y: 10 });
    assert.deepStrictEqual(C.cornerOrigin('bl', 600, 400, 100, 50, 10), { x: 10, y: 340 });
    assert.deepStrictEqual(C.cornerOrigin('br', 600, 400, 100, 50, 10), { x: 490, y: 340 });

    const d = makeImage(100, 100, (p) => p.rect(0, 0, 19, 9, 0));   // 왼쪽 위 구석에 내용
    assert.strictEqual(C.inkCount(d, 100, 100, { x: 0, y: 0, w: 30, h: 20 }), 200);
    assert.strictEqual(C.inkCount(d, 100, 100, { x: 60, y: 60, w: 30, h: 20 }), 0, '빈 구석');
    assert.strictEqual(C.inkCount(d, 100, 100, { x: 90, y: 90, w: 50, h: 50 }), 0, '그림 밖으로 나가도 터지지 않는다');
}

// --- padRect / scaleRect ---
assert.deepStrictEqual(C.padRect({ x: 10, y: 10, w: 50, h: 50 }, 20, 100, 100), { x: 0, y: 0, w: 80, h: 80 });
assert.deepStrictEqual(C.scaleRect({ x: 10, y: 20, w: 30, h: 40 }, 2, 3), { x: 20, y: 60, w: 60, h: 120 });

// --- fitCrop: 그림은 범위 비율 그대로(여백 없음), 가로로 긴 범위는 세운다 ---
{
    const tall = C.fitCrop(900, 1270, 1800, 2540);
    assert.deepStrictEqual(tall, { rotate: false, scale: 2, canvasW: 1800, canvasH: 2540 });
    const wide = C.fitCrop(1270, 900, 1800, 2540);
    assert.deepStrictEqual(wide, { rotate: true, scale: 2, canvasW: 1800, canvasH: 2540 });
    const sq = C.fitCrop(1000, 1000, 1800, 2540);
    assert.strictEqual(sq.rotate, false);
    assert.strictEqual(sq.canvasW, 1800);
    assert.strictEqual(sq.canvasH, 1800, '정사각 범위는 정사각 그림 — 종이 비율로 늘려 여백을 만들지 않는다');
    // 정사각에 가까운데 가로가 조금 긴 범위: 돌려 봐야 이득이 10%도 안 되니 똑바로 둔다
    const nearSq = C.fitCrop(962, 892, 1800, 2540);
    assert.strictEqual(nearSq.rotate, false);
    assert.strictEqual(nearSq.canvasW, 1800);
    // A4 가로 도면은 돌려 세운다
    assert.strictEqual(C.fitCrop(2400, 1700, 1800, 2540).rotate, true);
    // 도면의 절반만 고르면 전체일 때보다 크게 들어간다
    const full = C.fitCrop(2000, 3000, 1800, 2540).scale;
    const half = C.fitCrop(1000, 1500, 1800, 2540).scale;
    assert.ok(Math.abs(half / full - 2) < 1e-9);
}

// --- app.js 연결 ---
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/js\/shared\/print-crop\.js/.test(index), 'index.html 이 모듈을 불러야 한다');
assert.ok(/id="btnOpenPrintCropModal"/.test(index) && /id="mobileBtnPrintCrop"/.test(index), '여는 버튼 두 곳');
// 저장·불러오기·동기화 네 곳
assert.ok(/floorPrintCrops: window\.state\.floorPrintCrops \|\| null,/.test(app), '기기 저장');
assert.ok(/if \(parsed\.floorPrintCrops\)/.test(app), '기기에서 불러오기');
assert.ok(/if \(data\.floorPrintCrops\)/.test(app), '서버에서 받기');
assert.ok(/\.\.\.\(window\.state\.floorPrintCrops \? \{ floorPrintCrops: window\.state\.floorPrintCrops \} : \{\}\)/.test(app),
    '서버에 올릴 때는 있을 때만 — null 로 올리면 아직 못 받은 기기가 남의 범위를 지운다');
// 지울 때는 키를 delete 하지 않는다(merge 로 올려 서버에 남는다)
assert.ok(!/delete state\.floorPrintCrops\[/.test(app), '기본으로 되돌릴 때는 null 을 넣는다');
// 범위가 없으면 예전 경로 그대로
const render = app.slice(app.indexOf('function renderFloorPlanCanvasDataUrl('), app.indexOf('// --- 위치도 출력 범위'));
assert.ok(/if \(printCrop\) \{/.test(render) && /canvas\.width = cw;/.test(render), '범위가 없을 때의 기본 그리기는 그대로 둔다');

console.log('test-print-crop: ok');
