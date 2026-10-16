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

// ---- 도면 좌표 + 보 끊기 ----
{
    // 범위 (100,200) 크기 1000x1000 → 0~1000 상자 그대로 +오프셋
    // 기둥 3개(가로줄 y=100), 거더 하나가 셋을 모두 지나 길게, 세로 빔 하나가 가로 거더 2줄을 가로지름
    const items = [
        { type: '기둥', label: 'C1', box: [90, 90, 110, 110] },
        { type: '기둥', label: 'C1', box: [90, 490, 110, 510] },
        { type: '기둥', label: 'C1', box: [90, 890, 110, 910] },
        { type: '거더', label: 'G1', box: [96, 110, 104, 890] },          // 가로, 가운데 기둥에서 끊겨야 함
        { type: '거더', label: 'G2', box: [496, 110, 504, 890] },         // 가로(기둥 없는 줄)
        { type: '빔', label: 'B1', box: [104, 297, 900, 303] }            // 세로, G2(y=500)에서 끊겨야 함
    ];
    const ms = AI.toMembers(items, { x0: 100, y0: 200, w: 1000, h: 1000 }, { splitRun: MS.splitRun, now: 1 });
    const cols = ms.filter((m) => m.type === '기둥');
    const g = ms.filter((m) => m.type === '거더');
    const b = ms.filter((m) => m.type === '빔');
    assert.strictEqual(cols.length, 3);
    assert.ok(cols.every((c) => c.shape === 'column' && c.w === 20 && c.y === 300), '기둥 좌표 = 범위 오프셋 + 상자');
    assert.strictEqual(g.length, 3, 'G1은 가운데 기둥에서 두 칸, G2는 한 칸');
    const g1 = g.filter((m) => m.label === 'G1').sort((p, q) => p.x - q.x);
    assert.deepStrictEqual(g1.map((m) => [m.x - m.w / 2, m.x + m.w / 2]), [[210, 590], [610, 990]], '기둥 면에서 끊김');
    assert.strictEqual(b.length, 2, '빔은 가로지르는 거더에서 두 칸');
    assert.ok(b.every((m) => m.shape === 'beam' && m.w === 6), '세로 빔 두께 그대로');
    const bs = b.sort((p, q) => p.y - q.y).map((m) => [m.y - m.h / 2, m.y + m.h / 2]);
    assert.deepStrictEqual(bs, [[304, 696], [704, 1100]], '거더 면(696·704)에서 끊김');
    assert.ok(new Set(ms.map((m) => m.id)).size === ms.length, 'id가 겹치지 않는다');
}
// 두께 통일: 같은 종류 보는 짧은 변 중간값으로 막대가 된다
{
    const ms = AI.toMembers([
        { type: '거더', label: '', box: [100, 0, 110, 400] },
        { type: '거더', label: '', box: [200, 0, 240, 400] },
        { type: '거더', label: '', box: [300, 0, 312, 400] }
    ], { x0: 0, y0: 0, w: 1000, h: 1000 }, { splitRun: MS.splitRun });
    assert.ok(ms.every((m) => m.h === 12), '거더 두께 = 중간값 12');
}

// ---- 페이지 연결 ----
const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
const prep = fs.readFileSync(path.join(root, 'scripts', 'prepare-pages.py'), 'utf8');
assert.ok(html.includes('<script src="js/core/struct-ai.js?v=dev"></script>'), 'AI 스크립트를 싣는다');
assert.ok(html.indexOf('struct-members.js') < html.indexOf('struct-ai.js'), 'splitRun이 있는 struct-members.js가 먼저');
assert.ok(html.includes('id="btnAi"') && html.includes('<option value="ai">'), 'AI 단추·읽는 방식');
assert.ok(html.includes('accept="application/pdf,.pdf,image/*"'), '그림 파일도 연다');
assert.ok(page.includes("var aiBtn = $('btnAi');") && page.includes('if (aiBtn) {'), '옛 HTML(단추 없음)이어도 멈추지 않는다');
assert.ok(page.includes("if (!aiKey()) {"), '키 없으면 안내만');
assert.ok(prep.includes('# 2026-10-16: 스캔 구조도 「AI로 읽기」도 같은 키를 쓴다'), '배포 때 구조도 페이지에도 키 주입');

console.log('test-struct-ai: ok');
