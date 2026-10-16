#!/usr/bin/env node
'use strict';

/**
 * 2026-10-16 스캔본 기둥 찾기 — 예시 하나로 같은 모양 모두 찾기(js/core/struct-raster.js).
 * 도면마다 기둥이 칠한 네모·테두리만 있는 네모·동그라미로 다르게 그려져서, 규칙 대신 예시와 닮은 곳을 찾는다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const R = require(path.join(root, 'js', 'core', 'struct-raster.js'));

/** 흰 종이 그림(RGBA) */
function paper(w, h) {
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    const img = { width: w, height: h, data };
    img.dot = (x, y, v) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const p = (y * w + x) * 4; data[p] = data[p + 1] = data[p + 2] = v; };
    img.fill = (x0, y0, x1, y1, v) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) img.dot(x, y, v); };
    img.box = (x0, y0, x1, y1, v, t = 1) => { img.fill(x0, y0, x1, y0 + t - 1, v); img.fill(x0, y1 - t + 1, x1, y1, v); img.fill(x0, y0, x0 + t - 1, y1, v); img.fill(x1 - t + 1, y0, x1, y1, v); };
    img.ring = (cx, cy, r, v) => { for (let a = 0; a < 360; a += 2) { const t = a * Math.PI / 180; img.dot(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), v); } };
    return img;
}
const near = (list, x, y, tol = 3) => list.some((m) => Math.abs(m.x - x) <= tol && Math.abs(m.y - y) <= tol);

// ---- 테두리만 있는 네모 기둥: 이름표 네모(안에 글자)는 빼고 찾는다 ----
{
    const img = paper(400, 300);
    // 통심선(연한 긴 선)
    for (let x = 0; x < 400; x += 3) { img.dot(x, 100, 170); img.dot(x, 200, 170); }
    for (let y = 0; y < 300; y += 3) { img.dot(100, y, 170); img.dot(300, y, 170); }
    // 기둥: 통심선 교차점의 빈 네모(14×14, 두께 2)
    [[100, 100], [300, 100], [100, 200], [300, 200]].forEach(([x, y]) => img.box(x - 7, y - 7, x + 6, y + 6, 40, 2));
    // 이름표: 같은 크기 네모 안에 글자 획(C1 흉내)
    [[130, 80], [330, 180]].forEach(([x, y]) => { img.box(x - 7, y - 7, x + 6, y + 6, 40, 1); img.fill(x - 3, y - 4, x - 2, y + 3, 40); img.fill(x - 3, y - 4, x, y - 3, 40); img.fill(x + 2, y - 4, x + 3, y + 3, 40); });
    const got = R.matchColumns(img, { x: 93, y: 93, w: 14, h: 14 });
    assert.strictEqual(got.length, 4, '빈 네모 기둥 4개: ' + JSON.stringify(got));
    [[100, 100], [300, 100], [100, 200], [300, 200]].forEach(([x, y]) => assert.ok(near(got, x, y), '기둥 ' + x + ',' + y));
    assert.ok(!near(got, 130, 80, 6) && !near(got, 330, 180, 6), '이름표 네모는 기둥이 아니다');
    assert.ok(got.every((m) => m.w === 14 && m.h === 14), '모두 예시와 같은 크기');
}

// ---- 동그라미 기둥, 칠한 네모 기둥(회색) ----
{
    const img = paper(300, 200);
    [[60, 60], [160, 60], [260, 140]].forEach(([x, y]) => img.ring(x, y, 7, 30));
    img.fill(153, 133, 167, 147, 150);                // 회색 칠한 네모(다른 모양)
    const circles = R.matchColumns(img, { x: 51, y: 51, w: 18, h: 18 });
    assert.strictEqual(circles.length, 3, '동그라미 3개: ' + JSON.stringify(circles));
    assert.ok(!near(circles, 160, 140, 6), '칠한 네모는 동그라미와 다르다');

    const img2 = paper(300, 200);
    [[50, 50], [150, 50], [250, 50], [50, 150], [150, 150]].forEach(([x, y]) => img2.fill(x - 6, y - 6, x + 6, y + 6, 140));
    for (let x = 0; x < 300; x++) img2.dot(x, 50, 90);   // 기둥을 지나는 보 선
    const filled = R.matchColumns(img2, { x: 42, y: 42, w: 17, h: 17 });
    assert.strictEqual(filled.length, 5, '회색 칠한 네모 5개(보 선이 지나가도): ' + JSON.stringify(filled));
}

// ---- 직사각형 기둥은 90° 돌린 것도 ----
{
    const img = paper(300, 200);
    img.box(40, 50, 69, 61, 30, 2);    // 가로로 긴 직사각형(30×12)
    img.box(150, 40, 161, 69, 30, 2);  // 세로로 긴 것
    const got = R.matchColumns(img, { x: 38, y: 48, w: 34, h: 16 });
    assert.strictEqual(got.length, 2, JSON.stringify(got));
}

// ---- 통심선 교차점에서 기둥 찾기: 교차점의 네모·동그라미만, 옆 이름표 네모는 안 봄 ----
{
    const img = paper(520, 420);
    const XS = [80, 220, 360, 480], YS = [70, 200, 330];
    // 통심선(일점쇄선, 연한 회색): 긴 선 12 + 틈 3 + 점 1 + 틈 3
    const dashDot = (fn, len) => { for (let k = 0; k < len; k++) { const m = k % 19; if (m < 12 || m === 15) fn(k); } };
    XS.forEach((x) => dashDot((k) => img.dot(x, k + 10, 175), 400));
    YS.forEach((y) => dashDot((k) => img.dot(k + 10, y, 175), 500));
    // 거더(점선 두 줄) — 교차점을 지나간다
    YS.forEach((y) => { for (let x = 20; x < 500; x += 4) { img.fill(x, y - 3, x + 1, y - 3, 90); img.fill(x, y + 3, x + 1, y + 3, 90); } });
    // 기둥: 칠한 네모 / 빈 네모 / 동그라미, 교차점 하나(480,330)는 비움
    const cols = [];
    XS.forEach((x, i) => YS.forEach((y, j) => {
        if (x === 480 && y === 330) return;
        const kind = (i + j) % 3;
        if (kind === 0) img.fill(x - 6, y - 6, x + 6, y + 6, 40);
        else if (kind === 1) img.box(x - 6, y - 6, x + 6, y + 6, 40, 2);
        else { img.ring(x, y, 6, 40); img.ring(x, y, 5, 40); }
        cols.push([x, y]);
    }));
    // 이름표 네모(C1 흉내)는 교차점 옆에
    XS.forEach((x) => YS.forEach((y) => { img.box(x + 14, y - 22, x + 28, y - 9, 40, 1); img.fill(x + 18, y - 19, x + 19, y - 12, 40); }));
    // 길게 그은 치수선 하나(통심선 아님, 기둥 없음)
    for (let x = 30; x < 500; x++) img.dot(x, 395, 120);
    const r = R.gridColumns(img);
    assert.ok(XS.every((x) => r.xs.some((v) => Math.abs(v - x) <= 1)), '세로 통심선: ' + r.xs);
    assert.ok(YS.every((y) => r.ys.some((v) => Math.abs(v - y) <= 4)), '가로 통심선: ' + r.ys);
    assert.strictEqual(r.columns.length, cols.length, '교차점 기둥 ' + cols.length + '개(빈 교차점·이름표·치수선 제외): ' + JSON.stringify(r.columns));
    cols.forEach(([x, y]) => assert.ok(near(r.columns, x, y, 3), '기둥 ' + x + ',' + y));
    assert.ok(!near(r.columns, 480, 330, 8), '기둥 없는 교차점은 빈 채로');
    assert.ok(r.columns.every((c) => c.w === r.columns[0].w && c.w >= 11 && c.w <= 15), '모두 같은 크기: ' + r.columns.map((c) => c.w));
}

// ---- 페이지 연결 ----
{
    const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
    assert.ok(/<script src="js\/core\/struct-raster\.js\?v=[^"]+"><\/script>/.test(html));
    assert.ok(html.includes('id="btnColSample"') && html.includes('id="colStrict"'));
    assert.ok(page.includes('RS.matchColumns('), '예시 기둥으로 찾기');
}

console.log('test-struct-raster: ok');
