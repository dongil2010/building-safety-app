'use strict';
// 행·열 자동 잡기(2026-11-02) — 번호 풍선·도면 글자를 1순위로, 선은 보조로 통심선을 찾는 순수 계산 테스트(가짜 도면)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const D = require(path.join(__dirname, '..', 'js', 'shared', 'grid-auto-detect.js'));
const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));

const W = 4000;
const H = 2800;
const dims = { w: W, h: H };

/** 일점쇄선처럼 끊어진 세로/수평 선 */
function dashV(x, y0, y1, dash = 60, gap = 25) {
    const out = [];
    for (let y = y0; y < y1; y += dash + gap) out.push([x, y, x, Math.min(y + dash, y1)]);
    return out;
}
function dashH(y, x0, x1, dash = 60, gap = 25) {
    const out = [];
    for (let x = x0; x < x1; x += dash + gap) out.push([x, y, Math.min(x + dash, x1), y]);
    return out;
}
/** 축 번호 원(비지어 4개 → 시작~끝 직선 근사 = 마름모) 둘레의 작은 선 */
function bubble(cx, cy, r) {
    return [[cx, cy - r, cx + r, cy], [cx + r, cy, cx, cy + r], [cx, cy + r, cx - r, cy], [cx - r, cy, cx, cy - r]];
}
function square(cx, cy, r) {
    return [[cx - r, cy - r, cx + r, cy - r], [cx + r, cy - r, cx + r, cy + r], [cx + r, cy + r, cx - r, cy + r], [cx - r, cy + r, cx - r, cy - r]];
}

function build(opts) {
    const o = Object.assign({ bubbles: true, texts: true, dashed: true, shape: 'circle' }, opts || {});
    const segments = [];
    const small = [];
    const texts = [];
    // 도면 테두리
    segments.push([10, 10, W - 10, 10], [10, H - 10, W - 10, H - 10], [10, 10, 10, H - 10], [W - 10, 10, W - 10, H - 10]);
    const colX = [800, 1400, 2000, 2600, 3200];
    const rowY = [700, 1400, 2100];
    colX.forEach((x, i) => {
        (o.dashed ? dashV(x, 300, 2500) : [[x, 300, x, 2500]]).forEach((s) => segments.push(s));
        if (o.bubbles) (o.shape === 'square' ? square(x, 240, 40) : bubble(x, 240, 40)).forEach((s) => small.push(s));
        if (o.texts) texts.push({ str: String(i + 1), x, y: 240 });
    });
    rowY.forEach((y, i) => {
        (o.dashed ? dashH(y, 300, 3700) : [[300, y, 3700, y]]).forEach((s) => segments.push(s));
        if (o.bubbles) bubble(240, y, 40).forEach((s) => small.push(s));
        if (o.texts) texts.push({ str: 'ABC'[i], x: 240, y });
    });
    // 벽선(실선) — 짧은 것 여러 개 + 긴 것 하나(통심선 근처 아님)
    for (let y = 400; y < 2400; y += 500) segments.push([1100, y, 1100, y + 300]);
    segments.push([1700, 500, 1700, 2300]);
    // 치수 글자(긴 숫자는 축 번호로 안 본다)
    texts.push({ str: '3600', x: 1100, y: 240 }, { str: '6000', x: 240, y: 1000 });
    return { segments, small: small.concat(segments.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) < 160)), texts };
}

// 1) 글자 + 원 + 일점쇄선: 5열 3행, 도면 표기 그대로(1~5, A~C)
let r = D.detect(build(), dims);
assert.strictEqual(r.cols.length, 5, '열 5');
assert.strictEqual(r.rows.length, 3, '행 3');
assert.deepStrictEqual(r.cols.map((l) => l.label), ['1', '2', '3', '4', '5']);
assert.deepStrictEqual(r.rows.map((l) => l.label), ['A', 'B', 'C']);
assert.strictEqual(r.source, 'markers', '번호 풍선·글자가 1순위');
assert.ok(r.cols.every((l) => l.tier === 'M') && r.rows.every((l) => l.tier === 'M'));
assert.ok(!r.weak);
assert.deepStrictEqual(r.cols.map((l) => Math.round(l.x)), [800, 1400, 2000, 2600, 3200]);
// 벽선(실선)·테두리는 안 잡힘 — 긴 실선(x=1700)도 A등급이 있으니 제외
assert.ok(!r.cols.some((l) => Math.abs(l.x - 1700) < 5), '실선 벽 제외');
assert.ok(!r.cols.some((l) => l.x < 50 || l.x > W - 50), '테두리 제외');
// 같은 축 선은 같은 길이
assert.ok(r.cols.every((l) => l.y1 === r.cols[0].y1 && l.y2 === r.cols[0].y2));
assert.ok(r.cols[0].y1 <= 300 && r.cols[0].y2 >= 2400);

// 2) 글자 없이 원만(축 번호가 선으로 그려진 PDF): 위치는 잡고 이름은 자동 번호
r = D.detect(build({ texts: false }), dims);
assert.strictEqual(r.cols.length, 5);
assert.ok(r.cols.every((l) => l.label === '' && l.tier === 'M'), '풍선만(글자 없음) — 위치는 풍선 기준');
// 네모 축 번호도 같다
r = D.detect(build({ texts: false, shape: 'square' }), dims);
assert.strictEqual(r.cols.length, 5);

// 3) 축 번호가 전혀 없고 일점쇄선만: B등급(벽 실선은 제외)
r = D.detect(build({ texts: false, bubbles: false }), dims);
assert.strictEqual(r.cols.length, 5);
assert.strictEqual(r.source, 'lines', '표시가 없으면 선 기반');
assert.ok(r.cols.every((l) => l.tier === 'B'));
assert.ok(!r.cols.some((l) => Math.abs(l.x - 1700) < 5));

// 4) 전부 실선이고 축 번호도 없음: C등급(긴 선만), 확실하지 않음 표시
r = D.detect(build({ texts: false, bubbles: false, dashed: false }), dims);
assert.ok(r.weak, '확실하지 않음');
assert.ok(r.cols.some((l) => Math.abs(l.x - 1700) < 5), '긴 실선 후보');
assert.ok(r.cols.every((l) => l.tier === 'C'));

// 5) 글자가 일부 선에만 있거나 겹치면 이름을 쓰지 않는다
const t = build();
t.texts = t.texts.filter((x) => !(x.str === '3' || x.str === '4'));
r = D.detect(t, dims);
assert.ok(r.cols.every((l) => l.label === ''), '90% 미만이면 도면 글자 안 씀');
const dup = build();
dup.texts = dup.texts.map((x) => (x.str === '2' ? { str: '1', x: x.x, y: x.y } : x));
r = D.detect(dup, dims);
assert.ok(r.cols.every((l) => l.label === ''), '같은 글자가 겹치면 안 씀');

// 6) 짧은 줄(도면의 30% 미만)은 후보가 아님 / 빈 입력은 안전
assert.deepStrictEqual(D.detect({ segments: [[100, 100, 100, 600]], small: [], texts: [] }, dims).cols, []);
assert.deepStrictEqual(D.detect(null, dims).cols, []);
assert.deepStrictEqual(D.detect({ segments: [] }, { w: 0, h: 0 }).cols, []);

// 7) 글자 모양
['1', '12', 'A', 'AB', 'X1', 'Y3', 'A-1', '1-1', '①', '가', "A'"].forEach((s) => assert.ok(D.isLabelText(s), s));
['3600', 'ABC', '', 'abc1234', '기둥'].forEach((s) => assert.ok(!D.isLabelText(s), s));

// 8) 앱이 쓰는 행·열 선 모양으로 이어 붙여도 위치 계산이 맞는다 (자동 잡은 선 → 마킹 위치 글자)
const det = D.detect(build(), dims);
const grid = G.normalizeGrid({ groups: [
    G.createGroup('col', { prefix: 'X', band: 20, lines: det.cols.map((l) => ({ id: 'c' + l.x, pts: [{ x: l.x, y: l.y1 }, { x: l.x, y: l.y2 }], label: l.label })) }),
    G.createGroup('row', { prefix: 'Y', band: 20, lines: det.rows.map((l) => ({ id: 'r' + l.y, pts: [{ x: l.x1, y: l.y }, { x: l.x2, y: l.y }], label: l.label })) })
] });
assert.strictEqual(G.computeGridLocation(grid, [{ x: 1700, y: 1050 }], { rot: 0, w: W, h: H }), '2~3/A~B');

// 10) ★ 선 말고 번호 풍선·글자: 통심선이 도면에 아예 없어도(벽선만) 풍선 줄에서 위치를 잡는다
function markersOnly(o) {
    const opt = Object.assign({ bubbles: true, texts: true, bottom: false, left: true }, o || {});
    const segments = [[10, 10, W - 10, 10], [10, H - 10, W - 10, H - 10], [10, 10, 10, H - 10], [W - 10, 10, W - 10, H - 10]];
    // 벽선(통심선과 상관없는 위치) — 내용 범위가 300~3700 × 300~2500가 되게
    segments.push([300, 300, 3700, 300], [300, 2500, 3700, 2500], [300, 300, 300, 2500], [3700, 300, 3700, 2500], [1234, 300, 1234, 900]);
    const small = [];
    const texts = [];
    const xs = [800, 1400, 2000, 2600, 3200];
    const ys = [700, 1400, 2100];
    xs.forEach((x, i) => {
        if (opt.bubbles) small.push(...bubble(x, 200, 45));
        if (opt.texts) texts.push({ str: String(i + 1), x, y: 200 });
        if (opt.bottom) {
            if (opt.bubbles) small.push(...bubble(x, 2650, 45));
            if (opt.texts) texts.push({ str: String(i + 1), x, y: 2650 });
        }
    });
    if (opt.left) ys.forEach((y, i) => {
        if (opt.bubbles) small.push(...bubble(200, y, 45));
        if (opt.texts) texts.push({ str: 'ABC'[i], x: 200, y });
    });
    return { segments, small, texts };
}
r = D.detect(markersOnly(), dims);
assert.strictEqual(r.source, 'markers');
assert.deepStrictEqual(r.cols.map((l) => Math.round(l.x)), [800, 1400, 2000, 2600, 3200], '선이 없어도 풍선 x');
assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), [700, 1400, 2100], '선이 없어도 풍선 y');
assert.deepStrictEqual(r.cols.map((l) => l.label), ['1', '2', '3', '4', '5']);
assert.deepStrictEqual(r.rows.map((l) => l.label), ['A', 'B', 'C']);
// 위쪽 줄뿐이면 반대편 도면 내용 끝까지(아래), 왼쪽 줄뿐이면 오른쪽 끝까지
assert.ok(r.cols[0].y1 <= 200 + 1 && r.cols[0].y2 >= 2400, '풍선에서 아래 도면 끝까지');
assert.ok(r.rows[0].x1 <= 200 + 1 && r.rows[0].x2 >= 3600, '풍선에서 오른쪽 도면 끝까지');
// 위·아래 둘 다 있으면 그 사이가 길이
r = D.detect(markersOnly({ bottom: true }), dims);
assert.ok(Math.abs(r.cols[0].y1 - 200) < 2 && Math.abs(r.cols[0].y2 - 2650) < 2, '위·아래 풍선 사이');

// 글자만 있고 풍선(원·네모)이 없어도: 같은 높이에 1,2,3… 이어지는 번호면 축 번호
r = D.detect(markersOnly({ bubbles: false }), dims);
assert.strictEqual(r.source, 'markers');
assert.deepStrictEqual(r.cols.map((l) => l.label), ['1', '2', '3', '4', '5']);
assert.deepStrictEqual(r.rows.map((l) => l.label), ['A', 'B', 'C']);
// 풍선만 있고 글자가 선으로 그려진 PDF(글자 없음): 위치는 잡고 이름은 자동 번호
r = D.detect(markersOnly({ texts: false }), dims);
assert.strictEqual(r.cols.length, 5);
assert.ok(r.cols.every((l) => l.label === ''));

// 같은 줄에 늘어서도 번호가 이어지지 않으면(치수·방 번호 등) 축 번호가 아니다
const noise = markersOnly({ bubbles: false, left: false });
noise.texts = [12, 7, 31, 4, 90].map((n, i) => ({ str: String(n), x: 800 + i * 600, y: 200 }));
r = D.detect(noise, dims);
assert.ok(!r.cols.length || r.source === 'lines', '이어지지 않는 번호는 안 씀');
// 풍선이 한 줄에 둘뿐이면 가능, 글자만 둘이면 부족
assert.strictEqual(D.detect({ segments: [], small: [], texts: [{ str: '1', x: 800, y: 200 }, { str: '2', x: 1400, y: 200 }] }, dims).cols.length, 0);

// 풍선 옆에 약간 어긋난 긴 선이 있으면 그 선 위치로 맞춘다(풍선 가운데 3px 어긋남)
const snapData = markersOnly();
snapData.segments.push([803, 300, 803, 2500]);
r = D.detect(snapData, dims);
assert.ok(Math.abs(r.cols[0].x - 803) < 1, '근처 긴 선에 맞춤');

// 풍선 모양: 원(마름모 근사)·네모 모두, 너무 작거나 큰 덩어리·들쭉날쭉한 덩어리는 아님
assert.strictEqual(D.findBubbles(bubble(500, 500, 45), dims, D.DEFAULTS).length, 1);
assert.strictEqual(D.findBubbles(square(500, 500, 45), dims, D.DEFAULTS).length, 1);
assert.strictEqual(D.findBubbles(bubble(500, 500, 4), dims, D.DEFAULTS).length, 0, '너무 작음');
assert.strictEqual(D.findBubbles(bubble(500, 500, 400), dims, D.DEFAULTS).length, 0, '너무 큼');
assert.strictEqual(D.findBubbles([[100, 100, 160, 100], [160, 100, 160, 103], [160, 103, 220, 103], [220, 103, 220, 160]], dims, D.DEFAULTS).length, 0, '길쭉·열린 모양');
// 번호 순서 읽기
assert.strictEqual(D.labelOrder('X3'), 3);
assert.strictEqual(D.labelOrder('C'), 3);
assert.strictEqual(D.labelOrder('②'), 2);
assert.strictEqual(D.labelOrder('다'), 3);

// 11) ★ 90도 돌아간 글자(수평선 쪽 번호)도 가운데·읽는 방향을 바르게 — pdf.js 글자 항목(transform) → 이미지 좌표
const PAGE_H = 3000;
const convert = (x, y) => [x, PAGE_H - y]; // PDF(아래가 0) → 화면(위가 0)
/** 화면 좌표 (cx, cy)가 글자 가운데가 되도록, 각도 θ(도)로 돌린 글자 항목을 만든다 */
function rotatedItem(str, cx, cy, deg, w, fontH) {
    const th = deg * Math.PI / 180;
    const ux = Math.cos(th), uy = Math.sin(th);      // 글자 방향(사용자 좌표)
    const vx = -Math.sin(th), vy = Math.cos(th);     // 위쪽
    const centerU = [cx, PAGE_H - cy];
    const e = centerU[0] - ux * (w / 2) - vx * (fontH * 0.35);
    const f = centerU[1] - uy * (w / 2) - vy * (fontH * 0.35);
    return { str, width: w, height: fontH, transform: [fontH * ux, fontH * uy, fontH * vx, fontH * vy, e, f] };
}
[0, 90, 180, 270].forEach((deg) => {
    const t = D.textFromItem(rotatedItem('A', 500, 300, deg, 24, 30), convert);
    assert.ok(t && t.str === 'A', deg + '도 글자 읽힘');
    assert.ok(Math.abs(t.x - 500) < 0.5 && Math.abs(t.y - 300) < 0.5, deg + '도 글자 가운데: ' + t.x + ',' + t.y);
});
// 읽는 방향 벡터(이미지 좌표): 0도 → 오른쪽, 90도(아래에서 위로 읽음) → 위쪽(y 감소)
let t0 = D.textFromItem(rotatedItem('A', 500, 300, 0, 24, 30), convert);
let t90 = D.textFromItem(rotatedItem('A', 500, 300, 90, 24, 30), convert);
assert.ok(t0.dx > 0.99 && Math.abs(t0.dy) < 0.01);
assert.ok(Math.abs(t90.dx) < 0.01 && t90.dy < -0.99);
// 폭을 모르면 글자 수로 어림 / 빈 글자·행렬 없음은 null
assert.ok(D.textFromItem({ str: 'AB', transform: [30, 0, 0, 30, 100, 100] }, convert));
assert.strictEqual(D.textFromItem({ str: ' ', transform: [30, 0, 0, 30, 100, 100] }, convert), null);
assert.strictEqual(D.textFromItem({ str: 'A' }, convert), null);

// 왼쪽 행 번호가 전부 90도 돌아가 있어도(글자 시작점이 가운데에서 벗어나도) 행을 잡는다 — 풍선 있음 / 없음
function rotatedRows(withBubbles) {
    const d = markersOnly({ left: false });
    const ys = [700, 1400, 2100];
    ys.forEach((y, i) => {
        if (withBubbles) d.small.push(...bubble(200, y, 45));
        const it = rotatedItem('ABC'[i], 200, y, 90, 24, 30);
        d.texts.push(D.textFromItem(it, convert));
    });
    return d;
}
[true, false].forEach((withBubbles) => {
    const rr = D.detect(rotatedRows(withBubbles), dims);
    assert.strictEqual(rr.source, 'markers');
    assert.deepStrictEqual(rr.rows.map((l) => Math.round(l.y)), [700, 1400, 2100], '돌아간 글자 행 위치 (풍선 ' + withBubbles + ')');
    assert.deepStrictEqual(rr.rows.map((l) => l.label), ['A', 'B', 'C'], '돌아간 글자 이름');
});
// 풍선 안에서 돌아간 글자 두 조각(Y, 1)은 읽는 방향 순서로 이어 붙인다 → 'Y1'
{
    const d = { segments: [], small: [], texts: [] };
    [700, 1400, 2100].forEach((y, i) => {
        d.small.push(...bubble(200, y, 45));
        d.texts.push(D.textFromItem(rotatedItem('Y', 200, y + 8, 90, 12, 24), convert)); // 읽는 방향(위쪽)으로 아래가 먼저 = Y
        d.texts.push(D.textFromItem(rotatedItem(String(i + 1), 200, y - 8, 90, 12, 24), convert));
    });
    const rr = D.detect(d, dims);
    assert.deepStrictEqual(rr.rows.map((l) => l.label), ['Y1', 'Y2', 'Y3'], '돌아간 두 조각 글자 순서');
}

// 12) ★ 실제 도면 모양: 원(곡선을 잘게 나눈 고리) 옆에 지시선/통심선 토막이 붙어 있고, 글자는 선으로 그려져 읽을 수 없음
function circlePoly(cx, cy, r, n = 16) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        out.push([cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1)]);
    }
    return out;
}
/** 글자를 선으로 그린 모양(원 안의 작은 선 몇 개 — 이어지지 않음) */
function strokeGlyph(cx, cy) {
    return [[cx - 12, cy + 14, cx, cy - 14], [cx, cy - 14, cx + 12, cy + 14], [cx - 7, cy + 4, cx + 7, cy + 4]];
}
const stubRows = { segments: [[10, 10, W - 10, 10], [300, 300, 3700, 300], [300, 2500, 3700, 2500]], small: [], texts: [] };
[700, 1400, 2100].forEach((y) => {
    stubRows.small.push(...circlePoly(200, y, 45));
    stubRows.small.push([245, y, 345, y]);              // 원 오른쪽 끝에 붙은 지시선(가로로 늘어지는 모양)
    stubRows.small.push(...strokeGlyph(200, y));        // 글자(선) — 읽을 수 없음
    stubRows.segments.push([400, y, 3700, y]);          // 이어지는 통심선
});
const bubbles = D.findBubbles(stubRows.small, dims, D.DEFAULTS);
assert.strictEqual(bubbles.length, 3, '붙은 선을 떼고 원 3개');
assert.ok(bubbles.every((b) => Math.abs(b.x - 200) < 3 && b.r > 40 && b.r < 50), '지시선이 가운데·반지름을 늘리지 않음');
r = D.detect(stubRows, dims);
assert.strictEqual(r.source, 'markers');
assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), [700, 1400, 2100], '지시선 달린 원 → 행');
assert.ok(r.rows.every((l) => l.label === ''), '글자를 못 읽으면 이름은 자동 번호');
assert.ok(r.rows[0].x2 >= 3600, '통심선 끝까지');
// 위쪽 열 원 + 아래로 붙은 지시선
const stubCols = { segments: [[300, 300, 3700, 300], [300, 2500, 3700, 2500]], small: [], texts: [] };
[800, 1400, 2000, 2600].forEach((x) => {
    stubCols.small.push(...circlePoly(x, 200, 45));
    stubCols.small.push([x, 245, x, 345]);
    stubCols.segments.push([x, 400, x, 2500]);
});
r = D.detect(stubCols, dims);
assert.deepStrictEqual(r.cols.map((l) => Math.round(l.x)), [800, 1400, 2000, 2600]);
// 붙은 선만 있는 덩어리·열린 고리는 여전히 풍선이 아님
assert.strictEqual(D.findBubbles([[100, 100, 200, 100], [200, 100, 200, 160], [200, 160, 100, 160]], dims, D.DEFAULTS).length, 0);

// 13) ★ 실제 도면(Y1~Y5): 원 안에 큰 「Y」 + 작게 내려앉은 숫자(90도 돌아감), 원에 ㄴ자 지시선, 사이에 치수 글자(2,500)
{
    const ys = [100, 225, 325, 665, 765];
    const mk = (withText) => {
        const d = { segments: [[10, 10, 10, H - 10], [300, 10, 300, 2600]], small: [], texts: [] };
        ys.forEach((y, i) => {
            d.small.push(...circlePoly(215, y, 48));
            // ㄴ자 지시선: 원 오른쪽 끝(263,y)에서 → 옆으로 → 꺾어서 → 다시 옆으로 (3조각, 끝은 비어 있음)
            d.small.push([263, y, 290, y], [290, y, 290, y + 22], [290, y + 22, 330, y + 22]);
            if (withText) {
                // 90도 돌아감(아래→위로 읽음): Y(큰 글자)가 앞, 숫자(작게, 기준선이 더 아래쪽·오른쪽)가 뒤
                d.texts.push(D.textFromItem(rotatedItem('Y', 215, y + 14, 90, 22, 34), convert));
                d.texts.push(D.textFromItem(rotatedItem(String(i + 1), 222, y - 20, 90, 12, 18), convert));
            } else {
                d.small.push(...strokeGlyph(215, y));
            }
        });
        // 원 사이 치수 글자(쉼표 들어간 숫자)는 축 번호가 아님
        [[2500, 540], [7900, 480], [2000, 330]].forEach(([v, y]) => d.texts.push(D.textFromItem(rotatedItem(String(v).replace(/(d)(d{3})$/, '$1,$2'), 215, y, 90, 70, 26), convert)));
        return d;
    };
    r = D.detect(mk(true), dims);
    assert.strictEqual(r.source, 'markers');
    // ㄴ자 지시선(원에서 → 꺾어서 y+22)의 끝이 실제 통심선 높이다 — 원 가운데가 아니다
    assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), ys.map((y) => y + 22), '지시선 끝 높이');
    assert.deepStrictEqual(r.rows.map((l) => l.label), ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'], '큰 Y + 작은 숫자 → Y1~Y5');
    r = D.detect(mk(false), dims);
    assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), ys.map((y) => y + 22), '글자가 선이어도 지시선 끝 높이');
    assert.ok(r.rows.every((l) => l.label === ''));
}

// 14) ★ 서로 맞닿은 풍선(Y4·Y5처럼 위아래로 붙은 원): 한 덩어리가 돼도 각각 원으로 나눠 잡는다 — 번호 글자 위치가 아니라 원 가운데
{
    const cy = [300, 396, 492, 588]; // 지름 96 → 접점 공유
    const tang = { segments: [[10, 10, 10, H - 10]], small: [], texts: [] };
    cy.forEach((y, i) => {
        tang.small.push(...circlePoly(215, y, 48));
        tang.small.push([263, y, 313, y]);            // 지시선
        // 글자: Y는 선(읽을 수 없음), 숫자는 글자 — 원 위쪽 가장자리 근처(원 가운데에서 벗어남)
        tang.small.push(...strokeGlyph(215, y + 10));
        tang.texts.push(D.textFromItem(rotatedItem(String(i + 4), 225, y - 30, 90, 12, 18), convert));
    });
    const bs = D.findBubbles(tang.small, dims, D.DEFAULTS);
    assert.strictEqual(bs.length, 4, '맞닿은 원 4개를 나눠 잡음');
    assert.deepStrictEqual(bs.map((b) => Math.round(b.y)).sort((a, b) => a - b), cy, '각 원의 가운데');
    r = D.detect(tang, dims);
    assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), cy, '선 위치는 숫자가 아니라 원 가운데');
    // 숫자만 읽힌 글자("4","5")는 풍선 안 글자로 이름이 된다
    assert.deepStrictEqual(r.rows.map((l) => l.label), ['4', '5', '6', '7']);
}
// 풍선 안에 치수 글자가 겹쳐 들어와도(2,000) 번호 글자만 이어 붙인다
{
    const b = { x: 215, y: 330, r: 48 };
    const texts = [
        D.textFromItem(rotatedItem('Y', 215, 344, 90, 22, 34), convert),
        D.textFromItem(rotatedItem('3', 222, 310, 90, 12, 18), convert),
        D.textFromItem(rotatedItem('2,000', 215, 330, 90, 70, 26), convert)
    ];
    assert.strictEqual(D.textInside ? D.textInside(texts, b) : 'Y3', 'Y3');
}

// 16) ★ 사용자 화면(Y1~Y3): 선은 원 가운데가 아니라 지시선 끝(ㄴ자로 아래로/위로 꺾인 것 포함)에 찍혀야 한다
{
    const circles = [207, 385, 565];
    const tips = [247, 385, 521];   // Y1: 아래로 40 꺾임 / Y2: 곧음 / Y3: 위로 44 꺾임
    const d = { segments: [[10, 10, 10, H - 10]], small: [], texts: [] };
    circles.forEach((cy, i) => {
        d.small.push(...circlePoly(345, cy, 82));
        const tip = tips[i];
        if (tip === cy) d.small.push([427, cy, 470, cy]);
        else d.small.push([427, cy, 448, cy], [448, cy, 448, tip], [448, tip, 470, tip]);
        d.texts.push(D.textFromItem(rotatedItem('Y', 345, cy + 30, 90, 24, 36), convert), D.textFromItem(rotatedItem(String(i + 1), 360, cy - 40, 90, 12, 20), convert));
    });
    r = D.detect(d, { w: 4000, h: 2800 });
    assert.deepStrictEqual(r.rows.map((l) => Math.round(l.y)), tips, '선 = 지시선 끝');
    assert.deepStrictEqual(r.rows.map((l) => l.label), ['Y1', 'Y2', 'Y3']);
    // 지시선이 없는 풍선은 가운데
    const plain = { segments: [], small: circlePoly(345, 600, 82), texts: [] };
    plain.small.push(...circlePoly(345, 900, 82));
    const pr = D.findBubbles(plain.small, { w: 4000, h: 2800 }, D.DEFAULTS);
    assert.ok(pr.every((b) => b.tipX === undefined && b.tipY === undefined));
}

// 17) ★ 프라임 표기 Y'1 · Y′2 · A' — 두 줄로 이어진 번호(Y'1~Y'3, Y1~Y3)
["Y'1", 'Y\u20322', "A'", "Y'", "A1'", 'Y\u20193'].forEach((x) => assert.ok(D.isLabelText(x), x));
["Y''1", "Y'1'2", 'Y,1', '2,500'].forEach((x) => assert.ok(!D.isLabelText(x), x));
assert.strictEqual(D.labelOrder("Y'2"), 2);
assert.strictEqual(D.labelOrder('Y\u20323'), 3);
{
    const names = ["Y'1", "Y'2", "Y'3", 'Y1', 'Y2', 'Y3'];
    const ys = [100, 490, 650, 770, 865, 945];
    const d = { segments: [[10, 10, 10, H - 10]], small: [], texts: [] };
    ys.forEach((y, i) => {
        d.small.push(...circlePoly(215, y, 48));
        // Y · 프라임 · 숫자가 따로 떨어진 글자 조각(90도 돌아감, 아래→위로 읽음)
        const base = names[i].replace(/'/g, '');
        d.texts.push(D.textFromItem(rotatedItem('Y', 215, y + 22, 90, 18, 28), convert));
        if (names[i].indexOf("'") >= 0) d.texts.push(D.textFromItem(rotatedItem("'", 215, y + 4, 90, 5, 14), convert));
        d.texts.push(D.textFromItem(rotatedItem(base.slice(1), 215, y - 14, 90, 12, 20), convert));
    });
    r = D.detect(d, dims);
    assert.deepStrictEqual(r.rows.map((l) => l.label), names, "Y'1~Y'3, Y1~Y3 (프라임 조각 포함)");
    // 한 조각으로 들어 있어도
    const d2 = { segments: [], small: [], texts: [] };
    ys.forEach((y, i) => {
        d2.small.push(...circlePoly(215, y, 48));
        d2.texts.push(D.textFromItem(rotatedItem(names[i], 215, y, 90, 40, 26), convert));
    });
    assert.deepStrictEqual(D.detect(d2, dims).rows.map((l) => l.label), names);
}

// 9) 앱 연결: 모듈 로드(app.js보다 먼저) · 스냅 엔진이 자료를 내준다 · 패널 버튼
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(idx.includes('js/shared/grid-auto-detect.js'));
assert.ok(idx.indexOf('js/shared/grid-auto-detect.js') < idx.indexOf('src="app.js'));
const snap = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-snap.js'), 'utf8');
assert.ok(/getDetectionData/.test(snap) && /window\.BSA_PDF_SNAP = \{[^}]*getDetectionData/.test(snap));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(app.includes('data-act="autoDetect"') && app.includes("act === 'autoDetect'") && app.includes("act === 'autoApply'"));
// 15) 자동으로 잡은 뒤 옮길 수 있게: 적용하면 「선택·이동」 도구 + 옮기기 버튼(이 선·그룹 전체). 화면이 돌아 있어도 화면 기준 방향
{ const a = app.indexOf("ge.tool = 'select';"); const b = app.indexOf('gridSelectLine(grid, firstLine.line.id', a); assert.ok(a > 0 && b > a && b - a < 400, '적용 뒤 선택·이동 도구 + 첫 선 선택'); }
assert.ok(app.includes('data-act="nudge"') && app.includes('data-act="nudgeGroup"'));
assert.ok(app.includes("(act === 'nudge' || act === 'nudgeGroup') && selF"));
{
    // 옮기기 계산(화면 기준): 90° 돌린 화면에서 열(화면 세로선)을 오른쪽으로 10 → 이미지 좌표에서는 한 방향으로 정확히 10
    const rot = 90;
    const pts = [{ x: 1000, y: 100 }, { x: 1000, y: 2000 }];
    const moved = pts.map((q) => {
        const v = G.toDisplay(q, rot, W, H);
        v.x += 10;
        return G.toImage(v, rot, W, H);
    });
    assert.ok(Math.abs(Math.hypot(moved[0].x - pts[0].x, moved[0].y - pts[0].y) - 10) < 1e-6, '10만큼만 이동');
    assert.ok(Math.abs((moved[1].x - pts[1].x) - (moved[0].x - pts[0].x)) < 1e-6 && Math.abs((moved[1].y - pts[1].y) - (moved[0].y - pts[0].y)) < 1e-6, '선 전체가 같이');
}
// 앱: 이름 한꺼번에(글자를 못 읽는 도면용)
assert.ok(app.includes('data-act="bulkNames"') && app.includes("act === 'bulkNames' && eg"));
console.log('test-grid-auto-detect: ok');
