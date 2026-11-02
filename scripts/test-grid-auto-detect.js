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

// 9) 앱 연결: 모듈 로드(app.js보다 먼저) · 스냅 엔진이 자료를 내준다 · 패널 버튼
const idx = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(idx.includes('js/shared/grid-auto-detect.js'));
assert.ok(idx.indexOf('js/shared/grid-auto-detect.js') < idx.indexOf('src="app.js'));
const snap = fs.readFileSync(path.join(__dirname, '..', 'js', 'pdf-vector-snap.js'), 'utf8');
assert.ok(/getDetectionData/.test(snap) && /window\.BSA_PDF_SNAP = \{[^}]*getDetectionData/.test(snap));
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(app.includes('data-act="autoDetect"') && app.includes("act === 'autoDetect'") && app.includes("act === 'autoApply'"));
console.log('test-grid-auto-detect: ok');
