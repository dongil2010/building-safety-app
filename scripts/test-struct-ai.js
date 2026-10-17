#!/usr/bin/env node
'use strict';

/**
 * 2026-10-16 구조도 AI 읽기(js/core/struct-ai.js) — 스캔한 구조평면도를 Gemini에 보여 기둥·거더·빔 상자를 받는다.
 * 답 읽기·도면 좌표로 바꾸기·보 끊기(거더는 사이 기둥, 빔은 사이 거더)와 페이지 연결을 확인한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const AI = require(path.join(root, 'js', 'core', 'struct-ai.js'));
const MS = require(path.join(root, 'js', 'core', 'struct-members.js'));

// ---- 답 읽기 ----
{
    const items = AI.parseResponse('```json\n[{"type":"기둥","label":"C1","box":[100,100,120,120]},'
        + '{"type":"girder","label":"G1","box":[105,120,115,880]},'
        + '{"type":"벽","box":[0,0,10,10]},{"type":"빔","box":[1,2,3]},{"type":"빔","label":"B1","box":[500,500,500,600]}]\n```');
    assert.strictEqual(items.length, 2, '모르는 종류·잘못된 상자·폭 0은 버린다');
    assert.deepStrictEqual(items[0], { type: '기둥', label: 'C1', box: [100, 100, 120, 120] });
    assert.strictEqual(items[1].type, '거더', '영어 종류도 받는다');
    // 끝이 잘린 답은 마지막 온전한 항목까지
    const cut = AI.parseResponse('[{"type":"기둥","label":"C1","box":[0,0,10,10]},{"type":"기둥","label":"C2","box":[0,20,10,30]},{"type":"거');
    assert.strictEqual(cut.length, 2, '잘린 답도 앞부분은 읽는다');
    assert.throws(() => AI.parseResponse('부재가 없습니다'), /찾지 못했습니다/);
}

// ---- 단계별: ① 기둥 → ② 거더(기둥 면에 붙고 사이 기둥에서 끊김) → ③ 빔(거더 면에 붙고 사이 거더에서 끊김) ----
{
    const crop = { x0: 100, y0: 200, w: 1000, h: 1000 };   // 범위 오프셋 (100,200), 0~1000 상자 = 쪽 좌표 1:1
    // ① 기둥: 가로줄 y=100에 3개, y=500에 3개
    const colItems = [];
    [100, 500].forEach((y) => [100, 500, 900].forEach((x) => colItems.push({ type: '기둥', label: 'C1', box: [y - 10, x - 10, y + 10, x + 10] })));
    colItems.push({ type: '거더', label: 'G9', box: [0, 0, 5, 500] });   // 다른 종류는 이 단계에서 버린다
    const cols = AI.stepMembers('기둥', colItems, crop, [], { now: 1 });
    assert.strictEqual(cols.length, 6, '기둥 단계는 기둥만');
    assert.ok(cols.every((c) => c.shape === 'column' && c.w === 20), '기둥 크기 그대로');
    assert.ok(cols.some((c) => c.x === 200 && c.y === 300), '쪽 좌표 = 범위 오프셋 + 상자');

    // ② 거더 묻는 글에는 확인한 기둥이 0~1000 상자로 들어간다
    const pG = AI.buildPrompt('거더', cols, crop);
    assert.ok(pG.includes('[90,90,110,110]') && pG.includes('거더(큰보)만'), '거더 단계: 기둥 위치를 알려 준다');
    assert.ok(AI.buildPrompt('빔', cols, crop).includes('이미 찾은 거더 [ymin,xmin,ymax,xmax]: (없음)'));
    // 거더: AI가 기둥 안쪽까지 조금 넘치거나 모자라게, 중심선도 살짝 어긋나게 줌 → 기둥 면에 붙고 기둥 중심선에, 가운데 기둥에서 두 칸
    const g = AI.stepMembers('거더', [
        { type: '거더', label: 'G1', box: [97, 104, 107, 885] },     // y 중심 102, 끝 104(기둥 속)·885(모자람)
        { type: '거더', label: 'G2', box: [110, 85, 490, 95] }       // 세로: x=90 중심(기둥 x=100에서 어긋남), y 110~490
    ], crop, cols, { splitRun: MS.splitRun, now: 2 });
    const g1 = g.filter((m) => m.label === 'G1').sort((p, q) => p.x - q.x);
    assert.deepStrictEqual(g1.map((m) => [m.x - m.w / 2, m.x + m.w / 2]), [[210, 590], [610, 990]], '기둥 면에서 면까지, 사이 기둥에서 끊김');
    assert.ok(g1.every((m) => m.y === 300), '기둥 중심선(y=300)에 맞춘다');
    const g2 = g.filter((m) => m.label === 'G2');
    assert.strictEqual(g2.length, 1);
    assert.strictEqual(g2[0].x, 200, '세로 거더도 기둥 중심선(x=200)에');
    assert.deepStrictEqual([g2[0].y - g2[0].h / 2, g2[0].y + g2[0].h / 2], [310, 690], '위·아래 기둥 면에 붙음');
    assert.ok(g.every((m) => m.h === 10 || m.w === 10), '거더 두께 = 중간값');

    // ③ 빔: 세로로 위 거더(G1, y=300)에서 아래 가로 거더까지, 중간에 가로 거더(y=500 줄 → 쪽 y=700)를 지나감
    const g3 = AI.stepMembers('거더', [{ type: '거더', label: 'G3', box: [495, 110, 505, 490] }], crop, cols, { splitRun: MS.splitRun, now: 3 });
    const known = cols.concat(g, g3, [{ type: '거더', label: 'G4', x: 400, y: 1000, w: 600, h: 10 }]);   // 맨 아래 가로 거더(y=1000)
    const b = AI.stepMembers('빔', [{ type: '빔', label: 'B1', box: [100, 297, 803, 303] }], crop, known, { splitRun: MS.splitRun, now: 4 });
    // 빔 x=400: 위 G1(y 295~305)에서 시작 → 가운데 G3(y 695~705)에서 끊김 → 아래 G4(995~1005) 면까지
    assert.deepStrictEqual(b.map((m) => [m.y - m.h / 2, m.y + m.h / 2]).sort((p, q) => p[0] - q[0]), [[305, 695], [705, 995]], '빔: 거더 면에 붙고 사이 거더에서 끊김');
    assert.ok(b.every((m) => m.type === '빔' && m.shape === 'beam' && m.x === 400 && m.w === 6));
    assert.ok(new Set(cols.concat(g, b).map((m) => m.id)).size === cols.length + g.length + b.length, 'id가 겹치지 않는다');
}

// ---- 페이지 연결 ----
const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
const prep = fs.readFileSync(path.join(root, 'scripts', 'prepare-pages.py'), 'utf8');
assert.ok(html.includes('<script src="js/core/struct-ai.js?v=dev"></script>'), 'AI 스크립트를 싣는다');
assert.ok(html.indexOf('struct-members.js') < html.indexOf('struct-ai.js'), 'splitRun이 있는 struct-members.js가 먼저');
assert.ok(['btnAiCol', 'btnAiGir', 'btnAiBeam'].every((id) => html.includes('id="' + id + '"')) && html.includes('<option value="ai">'), 'AI 단계 단추 ①②③·읽는 방식');
assert.ok(html.includes('accept="application/pdf,.pdf,image/*"'), '그림 파일도 연다');
assert.ok(page.includes('if (b) b.addEventListener(\'click\', function () { runAiStep(t); });'), '옛 HTML(단추 없음)이어도 멈추지 않는다');
assert.ok(page.includes("var keep = cur.filter(function (m) { return m.type !== step; });"), '그 단계 종류만 새로 바꾸고 앞 단계(고친 것)는 그대로');
assert.ok(page.includes("if (readMode() === 'ai') st.aiMembers = st.members;"), 'AI 결과를 고친 것이 다음 단계로 이어진다');
assert.ok(page.includes("if (!aiKey()) {"), '키 없으면 안내만');
assert.ok(prep.includes('# 2026-10-16: 스캔 구조도 「AI로 읽기」도 같은 키를 쓴다'), '배포 때 구조도 페이지에도 키 주입');

// ---- 기둥 조각 읽기(2026-10-17): 통째로 보내면 기둥이 몇 픽셀이라 AI가 거의 못 찾음 → 겹치게 잘라 묻고 합친다 ----
{
    const tiles = AI.tileGrid({ x0: 0, y0: 0, x1: 1000, y1: 500 }, 300, 20);
    assert.strictEqual(tiles.length, 4 * 2, '가로 4 · 세로 2 조각');
    assert.ok(tiles.every((t) => t.w <= 300 + 1e-9 && t.h <= 300 + 1e-9), '조각 한 변은 tile 이하');
    assert.ok(Math.abs(tiles[3].x0 + tiles[3].w - 1000) < 1e-9 && Math.abs(tiles[7].y0 + tiles[7].h - 500) < 1e-9, '범위 끝까지 덮음');
    assert.ok(Math.abs((tiles[0].x0 + tiles[0].w) - tiles[1].x0 - 20) < 1e-9, '이웃과 overlap만큼 겹침');
    assert.deepStrictEqual(tiles[0].edge, { l: true, t: true, r: false, b: false });
    assert.deepStrictEqual(AI.tileGrid({ x0: 5, y0: 5, x1: 100, y1: 80 }, 300, 20).map((t) => [t.x0, t.y0, t.w, t.h]), [[5, 5, 95, 75]], '작은 범위는 한 조각');
    assert.deepStrictEqual(AI.tileGrid({ x0: 0, y0: 0, x1: 0, y1: 10 }, 300, 20), []);

    // 두 조각(0~520, 480~1000)이 겹치는 곳의 기둥 하나를 양쪽이 다 찾음 + 왼 조각 오른쪽 경계에 잘린 기둥 + 범위 바깥 경계의 기둥
    const [L, R] = AI.tileGrid({ x0: 0, y0: 0, x1: 1000, y1: 400 }, 520, 40);
    const merged = AI.mergeTileColumns([
        { tile: L, rects: [{ x: 500, y: 200, w: 10, h: 10, label: '' }, { x: 516, y: 100, w: 8, h: 10, label: 'C1' }, { x: 3, y: 50, w: 6, h: 6 }] },
        { tile: R, rects: [{ x: 502, y: 202, w: 12, h: 10, label: 'C2' }, { x: 520, y: 100, w: 10, h: 10, label: 'C1' }] }
    ], 2);
    merged.sort((a, b) => a.x - b.x || a.y - b.y);
    assert.strictEqual(merged.length, 3, '겹친 같은 기둥은 하나로, 잘린 조각은 버림: ' + JSON.stringify(merged));
    assert.deepStrictEqual([merged[0].x, merged[0].y], [3, 50], '범위 바깥 경계에 붙은 기둥은 그대로');
    assert.deepStrictEqual([merged[1].x, merged[1].y, merged[1].w, merged[1].label], [501, 201, 11, 'C2'], '두 조각 답의 평균 자리');
    assert.deepStrictEqual([merged[2].x, merged[2].label], [520, 'C1'], '왼 조각 경계에서 잘린 것 대신 오른 조각의 온전한 것');

    assert.ok(AI.buildPrompt('기둥', [], null, { tile: true }).includes('한 조각'), '조각이면 조각이라고 알림');
    assert.ok(!AI.buildPrompt('기둥', [], null).includes('한 조각'));
    assert.ok(page.includes("if (step === '기둥' && AI.tileGrid) { runAiColumnsTiled(r, keep); return; }"), '페이지: AI ① 기둥은 조각으로');
    assert.ok(/var TILE_PX = 900, TILE_OVERLAP_PX = 80, TILE_PARALLEL = 3;/.test(page), '페이지: 조각 900px · 겹침 80px · 3개씩');
    assert.ok(page.includes('/\\(429\\)/.test(String(err && err.message))'), '페이지: 429면 기다렸다 다시');
}

console.log('test-struct-ai: ok');
