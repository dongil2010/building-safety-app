#!/usr/bin/env node
'use strict';

/**
 * 2026-10-14 구조도 실제 도형 뽑기(B안, js/core/struct-shapes.js).
 * 실제 도면(지상1층 바닥 구조도)에서 본 그리기 방식을 작은 가짜 도면으로 흉내 낸다:
 *   - 기둥·벽(그리고 칠해 그린 보): 캐드 SOLID 칠 → 삼각형 둘
 *   - 숨은 보: 나란한 점선 두 줄(조각 1.6, 틈 0.8)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SS = require(path.join(root, 'js', 'core', 'struct-shapes.js'));

const PAGE = { w: 842, h: 595 };   // u ≈ 1.03

/** 칠한 네모 = 삼각형 둘(캐드 SOLID) */
function solid(x0, y0, x1, y1) {
    return [
        { pts: [[x0, y0], [x1, y0], [x1, y1]], fill: true },
        { pts: [[x0, y0], [x1, y1], [x0, y1]], fill: true }
    ];
}
/** 점선 한 줄(가로 'H' 는 y=c, x: s→e / 세로 'V' 는 x=c) */
function dashed(o, c, s, e) {
    const out = [];
    for (let p = s; p + 1.6 <= e + 1e-9; p += 2.4) {
        out.push({ pts: o === 'H' ? [[p, c], [p + 1.6, c]] : [[c, p], [c, p + 1.6]] });
    }
    return out;
}
/** 보 = 나란한 점선 두 줄(가운데 c, 폭 w) */
function beam(o, c, w, s, e) { return dashed(o, c - w / 2, s, e).concat(dashed(o, c + w / 2, s, e)); }
function mark(label, x, y, horiz) {
    const letter = /([CWGBS])\d/.exec(label)[1];
    const type = SS.TYPE_OF_LETTER[letter];
    return { label, letter, type, x, y, w: horiz === false ? 4 : 12, h: horiz === false ? 12 : 4 };
}
const byShape = (ms, shape) => ms.filter((m) => m.shape === shape);

// ---- 칠: 삼각형 짝 → 네모, 짝 없는 삼각형(화살표 머리 등)은 버림 ----
{
    const u = Math.hypot(PAGE.w, PAGE.h) / 1000;
    const rects = SS.fillRects(solid(10, 10, 14, 14).concat([{ pts: [[50, 50], [52, 50], [51, 53]], fill: true }]), u);
    assert.strictEqual(rects.length, 1, '짝 없는 삼각형은 버린다');
    assert.deepStrictEqual(rects[0], { x0: 10, y0: 10, x1: 14, y1: 14 });
    assert.strictEqual(SS.fillRects(solid(10, 10, 14, 14).map((p) => ({ pts: p.pts })), u).length, 0, '칠하지 않은 선은 칠이 아니다');
    // 점선: 조각을 이어 한 줄로, 조각 둘뿐인 것은 버림
    const lines = SS.dashedLines(dashed('H', 100, 0, 30).concat(dashed('V', 5, 0, 4)), u);
    assert.strictEqual(lines.length, 1);
    assert.ok(lines[0].o === 'H' && lines[0].c === 100 && lines[0].s === 0 && Math.abs(lines[0].e - 28) < 1e-6);
}

// ---- 기둥 4개 사이 거더(점선) + 가운데 빔 ----
//   기둥: (100,100) (200,100) (100,200) (200,200), 4×4
//   거더: 가로 y=100 (100~200), 세로 x=100 / x=200, 가로 y=200 — 폭 2.9, 기둥을 지나 길게 그린 점선(기둥에서 끊겨야 한다)
//   빔: 세로 x=150, y=100~200 — 폭 1.4, 거더 면에서 멈춤, 이름 없음 → 양 끝이 기둥이 아니니 빔으로 짐작
{
    let paths = [];
    [[100, 100], [200, 100], [100, 200], [200, 200]].forEach(([x, y]) => { paths = paths.concat(solid(x - 2, y - 2, x + 2, y + 2)); });
    paths = paths.concat(beam('H', 100, 2.9, 80, 220), beam('H', 200, 2.9, 80, 220), beam('V', 100, 2.9, 80, 220), beam('V', 200, 2.9, 80, 220));
    paths = paths.concat(beam('V', 150, 1.4, 101.5, 198.5));
    const marks = [mark('C1', 92, 92), mark('1G1', 150, 94, true), mark('1G2', 94, 150, false), mark('1B1', 145, 150, false)];
    const r = SS.extractShapes({ paths, page: PAGE, marks });
    const cols = byShape(r.members, 'column');
    assert.strictEqual(cols.length, 4, '기둥 4');
    assert.ok(cols.some((c) => c.label === 'C1' && Math.abs(c.x - 100) < 0.01), '가까운 C 기호가 이름');
    assert.ok(cols.filter((c) => c.label === '').length >= 2, '기호가 먼 기둥은 이름 없음');
    const beams = byShape(r.members, 'beam');
    const girders = beams.filter((b) => b.type === '거더');
    // 바깥으로 삐져나온 끝 조각(80~98, 202~220)도 한 칸씩 → 기둥 사이 4칸 + 끝 8칸
    const inner = girders.filter((g) => g.x >= 100 && g.x <= 200 && g.y >= 100 && g.y <= 200);
    assert.strictEqual(inner.length, 4, '기둥 사이 거더 4칸(기둥에서 끊김): ' + JSON.stringify(inner));
    const g1 = inner.find((g) => g.label === '1G1');
    assert.ok(g1 && Math.abs(g1.y - 100) < 0.01 && Math.abs(g1.w - 96) < 0.5 && Math.abs(g1.h - 2.9) < 0.01, '1G1: 기둥 면~면, 폭 2.9');
    assert.ok(!g1.guess);
    assert.ok(inner.some((g) => g.label === '1G2' && Math.abs(g.x - 100) < 0.01), '누운 기호는 세로 거더에');
    const b1 = beams.find((b) => b.type === '빔' && Math.abs(b.x - 150) < 0.01);
    assert.ok(b1 && b1.label === '1B1' && !b1.guess, '빔: 기호에서 이름·종류');
    const unnamed = inner.filter((g) => !g.label);
    assert.ok(unnamed.every((g) => g.guess), '이름 없는 거더는 짐작 표시(양 끝이 기둥)');
    assert.strictEqual(r.stats.unusedBeamLabels, 0);
}

// ---- 빔은 중간에 안 끊긴다: 가로지르는 거더를 지나도 한 줄(거더도 빔에서 안 끊긴다) ----
{
    let paths = [];
    [[100, 100], [300, 100]].forEach(([x, y]) => { paths = paths.concat(solid(x - 2, y - 2, x + 2, y + 2)); });
    paths = paths.concat(beam('V', 100, 2.9, 98, 202), beam('V', 300, 2.9, 98, 202));   // 기둥에서 아래로 내려온 거더(끝은 자유)
    paths = paths.concat(beam('H', 100, 2.9, 102, 298));                                   // 기둥 사이 거더
    paths = paths.concat(beam('V', 200, 2.9, 101.5, 202));                                 // 가운데 거더(1G9, 기호로)
    paths = paths.concat(beam('H', 150, 1.4, 101.5, 298.5));                              // 빔: 가운데 거더를 가로지름
    const marks = [mark('1G9', 194, 175, false), mark('1B3', 150, 146, true)];
    const r = SS.extractShapes({ paths, page: PAGE, marks });
    const beams = byShape(r.members, 'beam').filter((b) => b.type === '빔' && b.w > b.h);
    assert.strictEqual(beams.length, 1, '빔은 거더를 지나도 하나: ' + JSON.stringify(beams));
    assert.ok(beams[0].label === '1B3' && beams[0].w > 190, '양쪽 칸을 이은 한 줄, 이름은 기호에서');
    // 기둥에서 내려와 끝이 비는 이름 없는 보는 빔으로 짐작
    assert.strictEqual(byShape(r.members, 'beam').filter((b) => b.guess && b.type === '빔' && b.h > b.w).length, 2);
    const g9 = byShape(r.members, 'beam').filter((b) => b.label === '1G9');
    assert.strictEqual(g9.length, 1, '거더는 빔에서 안 끊긴다');
}

// ---- 칠한 거더에 끊기고 점선이 잠깐 빈 빔도 한 줄로 잇는다. 멀리 떨어진 같은 줄 빔은 따로 ----
{
    let paths = [];
    paths = paths.concat(solid(98, 80, 102, 220));                                     // 칠한 세로 거더(fG1, 기호로)
    paths = paths.concat(beam('H', 150, 1.4, 40, 98), beam('H', 150, 1.4, 102, 140));  // 거더 양쪽 빔
    paths = paths.concat(beam('H', 150, 1.4, 145, 180));                               // 점선이 5 쯤 빈 뒤 이어짐
    paths = paths.concat(beam('H', 150, 1.4, 260, 300));                               // 80 떨어진 다른 빔
    paths = paths.concat(solid(300, 148, 304, 152), solid(36, 148, 40, 152));          // 끝을 받치는 기둥
    const marks = [mark('fG1', 94, 120, false), mark('1B5', 70, 146, true)];
    const r = SS.extractShapes({ paths, page: PAGE, marks });
    const bms = byShape(r.members, 'beam').filter((b) => b.type === '빔').sort((p, q) => p.x - q.x);
    assert.strictEqual(bms.length, 2, '이어진 빔 하나 + 떨어진 빔 하나: ' + JSON.stringify(bms));
    assert.ok(bms[0].label === '1B5' && bms[0].x - bms[0].w / 2 < 42 && bms[0].x + bms[0].w / 2 > 176, '40~178 한 줄');
    assert.ok(byShape(r.members, 'beam').some((b) => b.label === 'fG1' && b.type === '거더'), '칠한 거더는 그대로');
}

// ---- 칠한 긴 띠: G·B 기호가 붙으면 칠해 그린 보, 아니면 벽. 기둥에서 끊는다 ----
{
    let paths = [];
    paths = paths.concat(solid(98, 98, 102, 102), solid(198, 98, 202, 102));   // 기둥 둘
    paths = paths.concat(solid(60, 98.2, 240, 101.8));                          // 기둥을 지나는 칠한 띠(가로)
    paths = paths.concat(solid(98.5, 140, 101.5, 260));                         // 세로 칠한 띠(기호 없음 → 벽)
    const r = SS.extractShapes({ paths, page: PAGE, marks: [mark('fG3', 150, 94, true)] });
    const filled = byShape(r.members, 'beam');
    assert.ok(filled.some((b) => b.label === 'fG3' && b.type === '거더' && Math.abs(b.x - 150) < 0.01 && Math.abs(b.w - 96) < 0.5), '기둥 사이 칠한 거더');
    const walls = byShape(r.members, 'wall');
    assert.ok(walls.some((w) => Math.abs(w.x - 100) < 0.01 && Math.abs(w.h - 120) < 0.5), '기호 없는 칠한 띠는 벽');
    // 같은 띠의 기둥 밖 조각(60~98, 202~240)은 기호가 없으니 벽
    assert.strictEqual(walls.length, 3);
    assert.strictEqual(r.stats.filledBeams, 1);
}

// ---- 점선 셋이 나란하면(좁은 보 + 긴 단차선) 양 끝이 맞는 짝만 ----
{
    const u = Math.hypot(PAGE.w, PAGE.h) / 1000;
    const lines = SS.dashedLines(dashed('H', 250, 200, 260).concat(dashed('H', 251.44, 200, 260), dashed('H', 252.88, 40, 400)), u);
    const bands = SS.pairBands(lines, u);
    assert.strictEqual(bands.length, 1, '띠 하나: ' + JSON.stringify(bands));
    assert.ok(Math.abs(bands[0].c0 - 250) < 0.01 && Math.abs(bands[0].c1 - 251.44) < 0.01);
    // 한쪽은 기둥마다 끊기고 맞은편은 길게 이어진 점선 → 조각마다 짝
    const l2 = SS.dashedLines(dashed('V', 50, 10, 60).concat(dashed('V', 50, 70, 120), dashed('V', 52.9, 10, 120)), u);
    assert.strictEqual(SS.pairBands(l2, u).length, 2, '긴 점선 하나가 두 조각과 짝');
}

// ---- 아무것에도 안 닿는 이름 없는 점선 짝(건축 평면도 숨은선 등)은 보가 아니다 ----
{
    const lone = SS.extractShapes({ paths: beam('H', 300, 2, 100, 200), page: PAGE, marks: [] });
    assert.strictEqual(lone.members.length, 0, '혼자 떠 있는 점선 짝은 버린다');
    // 같은 점선 짝도 한쪽 끝이 기둥에 닿으면 보
    const touch = SS.extractShapes({ paths: beam('H', 300, 2, 100, 200).concat(solid(96, 298, 100, 302)), page: PAGE, marks: [] });
    assert.strictEqual(byShape(touch.members, 'beam').length, 1);
}

// ---- 슬래브는 기호 그대로, 칠·점선 없으면 빈 결과 ----
{
    const r = SS.extractShapes({ paths: [], page: PAGE, marks: [mark('1S1', 50, 50, true), mark('1G1', 10, 10, true)] });
    assert.strictEqual(r.members.length, 1);
    assert.strictEqual(r.members[0].type, '슬래브');
    assert.strictEqual(r.stats.unusedBeamLabels, 1);
}

// ---- 페이지: 옛 HTML(칸·스크립트 없음)에서도 기호 방식으로 돈다 ----
{
    const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
    assert.ok(page.includes("var SS = window.BSA.structShapes || null;"));
    assert.ok(page.includes("return el && el.value === 'shapes' && SS ? 'shapes' : 'marks';"), '칸이 없으면 기호 방식');
    assert.ok(page.includes('if (FILL_OPS.indexOf(fn) >= 0)'), '칠한 경로 표시');
    assert.ok(/<script src="js\/core\/struct-shapes\.js\?v=[^"]+"><\/script>\s*<script src="js\/struct-plan-page\.js/.test(html), '페이지 스크립트보다 먼저 싣는다');
    assert.ok(html.includes('id="readMode"'));
    assert.ok(html.includes('<option value="shapes" selected>'), '기본은 실제 도형');
    assert.ok(/<input type="checkbox" id="sendOverlay">/.test(html), '구조도 그림은 고를 때만(기본 꺼짐)');
    assert.ok(page.includes('var withPic = chk ? chk.checked : true;'));
}

console.log('test-struct-shapes: ok');
