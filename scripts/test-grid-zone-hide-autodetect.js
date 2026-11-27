#!/usr/bin/env node
'use strict';

/**
 * 2026-11-27 「행열 구역 설정하면 해당 구역 내부에는 선이 사라지게 해주고 구역 내부에서 자동 잡기 가능하게」
 *  - visibleLineParts: 구역 밖 선은 구역 안에서 끊기고, 구역 선은 그 구역 안에서만 보임(겹친 작은 구역 안은 숨김)
 *  - hitTest visibleOnly: 숨긴 부분은 안 잡히고, 고른 선(keepLineId)은 잡힘
 *  - zoneDetectionInput: 구역 안의 선분·글자만 구역 기준 좌표로 — 자동 잡기가 구역 안 축 번호로 선을 찾고 도면 좌표로 되돌림
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const D = require(path.join(__dirname, '..', 'js', 'shared', 'grid-auto-detect.js'));

const W = 4000;
const H = 3000;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 1e-6), `${msg || ''} ${a} ≈ ${b}`);

// ---- 1) 구역 밖 선이 구역 안에서 사라짐 ----
{
    const grid = G.normalizeGrid({
        zones: [{ id: 'z1', name: '1F', rect: { x1: 1000, y1: 1000, x2: 2000, y2: 2000 } }],
        groups: [
            { id: 'gOut', axis: 'col', lines: [{ id: 'o1', pts: [{ x: 1500, y: 0 }, { x: 1500, y: H }] }, { id: 'o2', pts: [{ x: 500, y: 0 }, { x: 500, y: H }] }] },
            { id: 'gIn', axis: 'row', zoneId: 'z1', lines: [{ id: 'i1', pts: [{ x: 1000, y: 1500 }, { x: 2000, y: 1500 }] }] }
        ]
    });
    const gOut = grid.groups.find((g) => g.id === 'gOut');
    const gIn = grid.groups.find((g) => g.id === 'gIn');
    const p1 = G.visibleLineParts(grid, gOut, gOut.lines[0]);
    assert.strictEqual(p1.length, 2, '구역을 지나는 구역 밖 선은 두 토막');
    near(p1[0][0].y, 0, 1e-6, '위 토막 시작');
    near(p1[0][p1[0].length - 1].y, 1000, 1e-6, '위 토막은 구역 윗변까지');
    near(p1[1][0].y, 2000, 1e-6, '아래 토막은 구역 아랫변부터');
    near(p1[1][p1[1].length - 1].y, H, 1e-6, '아래 토막 끝');
    const p2 = G.visibleLineParts(grid, gOut, gOut.lines[1]);
    assert.strictEqual(p2.length, 1, '구역을 안 지나는 선은 그대로 한 토막');
    const p3 = G.visibleLineParts(grid, gIn, gIn.lines[0]);
    assert.strictEqual(p3.length, 1, '구역 선은 구역 안에서 보임');
    near(p3[0][0].x, 1000);
    near(p3[0][p3[0].length - 1].x, 2000);
    assert.ok(G.vertexVisible(grid, gIn, gIn.lines[0], 0), '구역 경계 위 끝점은 보임');

    // 구역 없는 도면은 원래 점 그대로
    const plain = G.normalizeGrid({ groups: [{ id: 'g', axis: 'col', lines: [{ id: 'a', pts: [{ x: 1, y: 0 }, { x: 1, y: H }] }] }] });
    const pp = G.visibleLineParts(plain, plain.groups[0], plain.groups[0].lines[0]);
    assert.strictEqual(pp.length, 1);
    assert.strictEqual(pp[0], plain.groups[0].lines[0].pts, '구역이 없으면 원래 점 배열 그대로');

    // 숨긴 자리는 안 잡힘, 고른 선이면 잡힘
    const inside = { x: 1500, y: 1200 };
    const h0 = G.hitTest(grid, inside, 8);
    assert.ok(h0 && h0.lineId === 'o1', '옛 동작(옵션 없음)은 숨긴 선도 잡음');
    const h1 = G.hitTest(grid, inside, 8, { visibleOnly: true });
    assert.ok(!h1, '구역 안에서 숨긴 구역 밖 선은 안 잡힘');
    const h2 = G.hitTest(grid, inside, 8, { visibleOnly: true, keepLineId: 'o1' });
    assert.ok(h2 && h2.lineId === 'o1', '고른 선은 숨긴 부분도 잡힘');
    const h3 = G.hitTest(grid, { x: 1500, y: 500 }, 8, { visibleOnly: true });
    assert.ok(h3 && h3.lineId === 'o1', '구역 밖 자리에서는 잡힘');
    const h4 = G.hitTest(grid, { x: 1200, y: 1500 }, 8, { visibleOnly: true });
    assert.ok(h4 && h4.lineId === 'i1', '구역 선은 구역 안에서 잡힘');
}

// ---- 2) 겹친 구역: 큰 구역 선은 안쪽 작은 구역 안에서 숨김, 다각형·돌린 구역 ----
{
    const grid = G.normalizeGrid({
        zones: [
            { id: 'big', name: 'A', rect: { x1: 0, y1: 0, x2: 2000, y2: 2000 } },
            { id: 'small', name: 'B', rect: { x1: 500, y1: 500, x2: 1000, y2: 1000 } }
        ],
        groups: [{ id: 'gb', axis: 'col', zoneId: 'big', lines: [{ id: 'b1', pts: [{ x: 700, y: 0 }, { x: 700, y: 2000 }] }] }]
    });
    const parts = G.visibleLineParts(grid, grid.groups[0], grid.groups[0].lines[0]);
    assert.strictEqual(parts.length, 2, '안쪽 작은 구역에서 끊김');
    near(parts[0][parts[0].length - 1].y, 500);
    near(parts[1][0].y, 1000);

    // 돌린 구역(45°)을 지나는 구역 밖 선 — 구역 안(가운데)은 숨김
    const rz = G.normalizeGrid({
        zones: [{ id: 'r', name: 'R', angle: 45, rect: { x1: 1000, y1: 1000, x2: 2000, y2: 2000 } }],
        groups: [{ id: 'g', axis: 'col', lines: [{ id: 'c', pts: [{ x: 1500, y: 0 }, { x: 1500, y: H }] }] }]
    });
    const rp = G.visibleLineParts(rz, rz.groups[0], rz.groups[0].lines[0]);
    assert.strictEqual(rp.length, 2);
    const half = Math.SQRT2 * 500; // 돌린 정사각형의 꼭짓점까지
    near(rp[0][rp[0].length - 1].y, 1500 - half, 1e-6, '돌린 구역 위 꼭짓점');
    near(rp[1][0].y, 1500 + half, 1e-6, '돌린 구역 아래 꼭짓점');

    // 꺾은선: 꺾인 점이 구역 밖이면 한 토막으로 이어짐
    const bz = G.normalizeGrid({
        zones: [{ id: 'z', name: 'Z', rect: { x1: 3000, y1: 0, x2: 3500, y2: 500 } }],
        groups: [{ id: 'g', axis: 'col', lines: [{ id: 'k', pts: [{ x: 100, y: 0 }, { x: 120, y: 1500 }, { x: 100, y: H }] }] }]
    });
    const bp = G.visibleLineParts(bz, bz.groups[0], bz.groups[0].lines[0]);
    assert.strictEqual(bp.length, 1, '구역과 안 만나는 꺾은선은 한 토막');
    assert.strictEqual(bp[0].length, 3, '꺾인 점 그대로');
}

// ---- 3) 구역 안에서 자동 잡기 ----
{
    // 도면 왼쪽(구역 밖)에 X1~X3, 오른쪽 구역 안에 A1~A4 축 번호 — 구역 안 것만 잡혀야 한다
    const segments = [];
    const texts = [];
    const addCol = (x, y0, y1, label) => {
        for (let y = y0; y < y1; y += 60) segments.push([x, y, x, Math.min(y1, y + 40)]); // 일점쇄선
        texts.push({ str: label, x, y: y0 - 40, dx: 1, dy: 0, tw: 30, th: 24 });
    };
    [300, 700, 1100].forEach((x, i) => addCol(x, 400, 2600, `X${i + 1}`));
    [2400, 2800, 3200, 3600].forEach((x, i) => addCol(x, 400, 2600, `A${i + 1}`));
    // 벽선 몇 개(건물 영역 판정용)
    for (let k = 0; k < 40; k++) segments.push([2300 + k * 35, 600, 2300 + k * 35, 2500]);
    for (let k = 0; k < 40; k++) segments.push([150 + k * 25, 600, 150 + k * 25, 2500]);
    const zone = G.normalizeGrid({ zones: [{ id: 'z', name: '2F', rect: { x1: 2200, y1: 200, x2: 3900, y2: 2800 } }] }).zones[0];
    const zin = G.zoneDetectionInput(zone, { segments, small: [], texts });
    assert.ok(zin, '구역 입력');
    near(zin.dims.w, 1700);
    near(zin.dims.h, 2600);
    assert.ok(zin.data.texts.every((t) => /^A/.test(t.str)), '구역 밖 글자(X1~X3)는 빠짐');
    assert.ok(zin.data.segments.every((s) => s.every((v) => v >= -1e-6)), '구역 기준 좌표(원점 = 구역 왼위)');
    const res = D.detect(zin.data, zin.dims, { outerOnly: false });
    assert.strictEqual(res.cols.length, 4, `구역 안 열 4개 (찾은 것: ${res.cols.map((c) => c.label).join(',')})`);
    const xs = res.cols.map((c) => zin.toWorld({ x: c.x, y: c.y1 }).x).sort((a, b) => a - b);
    [2400, 2800, 3200, 3600].forEach((x, i) => near(xs[i], x, 2, `열 ${i + 1} 도면 좌표`));

    // 돌린 구역: 도면 좌표로 되돌리면 구역과 같이 돈 자리
    const rz = { id: 'r', rect: { x1: 0, y1: 0, x2: 100, y2: 100 }, angle: 90 };
    const back = G.zoneDetectionInput(rz, { segments: [], small: [], texts: [] }).toWorld({ x: 0, y: 0 });
    near(back.x, 100, 1e-6, '90° 돌린 구역 왼위 → 도면 오른위');
    near(back.y, 0, 1e-6);
    // 돌린 구역의 글자 방향도 같이 돈다
    const tz = G.zoneDetectionInput(rz, { segments: [], small: [], texts: [{ str: 'A1', x: 50, y: 50, dx: 0, dy: 1 }] });
    near(tz.data.texts[0].dx, 1, 1e-9, '글자 방향 돌림');
    near(tz.data.texts[0].dy, 0, 1e-9);

    // 다각형 구역: 감싼 사각형 안이라도 다각형 밖 글자는 빠짐
    const pz = G.normalizeGrid({ zones: [{ id: 'p', poly: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 100 }, { x: 0, y: 100 }] }] }).zones[0];
    const pin = G.zoneDetectionInput(pz, { segments: [[75, 60, 75, 90], [25, 10, 25, 90]], small: [], texts: [{ str: '1', x: 80, y: 80 }, { str: '2', x: 20, y: 20 }] });
    assert.deepStrictEqual(pin.data.texts.map((t) => t.str), ['2'], '다각형 밖 글자 빠짐');
    assert.strictEqual(pin.data.segments.length, 1, '다각형 밖 선분 빠짐');
}

// ---- 4) 화면 코드가 새 함수를 쓰는지 ----
{
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', '10-marking.js'), 'utf8');
    assert.ok(/G\.visibleLineParts\(grid, g, ln\)/.test(src), '그리기에서 숨김 적용');
    assert.ok(/visibleOnly: true/.test(src), '누르기에서 숨긴 부분 제외');
    assert.ok(/G\.zoneDetectionInput\(zone, input\)/.test(src), '자동 잡기가 고른 구역 안에서');
    assert.ok(/zoneId: zid, angle: gridZoneLineAngle\(grid, zid\)/.test(src), '적용하면 구역 그룹');
}

console.log('test-grid-zone-hide-autodetect: ok');
