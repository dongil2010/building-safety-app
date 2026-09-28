#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 (실험 exp/grid-lines) 도면 행·열(통심) 선 — 순수 계산 회귀 테스트
 *  - 이름: 먼저 그은 선이 작은 번호(그은 순서), 시작 번호 0, 개별 이름, 지우면 당겨짐, 위치 순서로 다시 매기기, 세로/가로/비스듬/꺾은선 위치 찾기
 *  - 폭(띠) 안이면 한 이름, 사이면 X1~X2, 바깥이면 「X1 외측」
 *  - 같은 축 그룹 여러 개(날개동), 회전된 도면 번호 순서, 영역 마킹 범위
 *  - 위치 글자 자동 입력 규칙(직접 쓴 글은 안 덮음)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const G = require(path.join(__dirname, '..', 'js', 'shared', 'grid-lines.js'));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n');

const W = 4000;
const H = 3000;
const ctx0 = { rot: 0, w: W, h: H };

function vline(x, extra) {
    return Object.assign({ id: `v${x}`, pts: [{ x, y: 0 }, { x, y: H }] }, extra || {});
}
function hline(y, extra) {
    return Object.assign({ id: `h${y}`, pts: [{ x: 0, y }, { x: W, y }] }, extra || {});
}
function grid(groups) {
    return G.normalizeGrid({ groups });
}
const loc = (g, pts, ctx) => G.computeGridLocation(g, pts, ctx || ctx0);

// ---- 기본: 세로 열 3개 + 가로 행 2개, 폭 20 ----
const base = grid([
    G.createGroup('col', { band: 20, lines: [vline(1000), vline(2000), vline(3000)] }),
    G.createGroup('row', { band: 20, lines: [hline(500), hline(1500)] })
]);
assert.strictEqual(loc(base, [{ x: 1500, y: 1000 }]), 'X1~X2, Y1~Y2', '칸 안');
assert.strictEqual(loc(base, [{ x: 2005, y: 1495 }]), 'X2, Y2', '폭 안이면 선 이름 하나');
assert.strictEqual(loc(base, [{ x: 2011, y: 1000 }]), 'X2~X3, Y1~Y2', '폭(20) 밖 11px이면 사이');
assert.strictEqual(loc(base, [{ x: 500, y: 200 }]), 'X1 외측, Y1 외측', '맨 앞 선 밖');
assert.strictEqual(loc(base, [{ x: 3500, y: 2500 }]), 'X3 외측, Y2 외측', '맨 뒤 선 밖');

// ---- 이름: 시작 번호 0, 머리글, 개별 이름, 아래에서부터 그은 행 ----
const named = grid([
    G.createGroup('col', { prefix: 'x', start: 0, lines: [vline(1000), vline(2000), vline(3000, { label: 'X3a' })] }),
    G.createGroup('row', { prefix: 'Y', start: 1, lines: [hline(2500), hline(1500), hline(500)] })
]);
assert.strictEqual(loc(named, [{ x: 1500, y: 600 }]), 'x0~x1, Y2~Y3', '시작 0 · 범위는 작은 번호 먼저');
assert.strictEqual(loc(named, [{ x: 2500, y: 2400 }]), 'x1~X3a, Y1~Y2', '개별 이름');
const od = G.orderedLines(named.groups[1], ctx0);
assert.deepStrictEqual(od.items.map((it) => it.name), ['Y3', 'Y2', 'Y1'], '아래부터 그었으면 맨 위가 Y3');

// ---- 번호 = 그은 순서(위치와 무관) ----
const placed = grid([G.createGroup('col', { band: 20, lines: [vline(3000), vline(1000), vline(2000)] })]);
assert.deepStrictEqual(G.orderedLines(placed.groups[0], ctx0).items.map((it) => it.name), ['X2', 'X3', 'X1'], '왼쪽부터 보면 X2 X3 X1');
assert.strictEqual(loc(placed, [{ x: 1500, y: 9 }]), 'X2~X3');
assert.strictEqual(loc(placed, [{ x: 2500, y: 9 }]), 'X1~X3', '이웃 X3·X1 → 작은 번호 먼저');
assert.strictEqual(loc(placed, [{ x: 500, y: 9 }]), 'X2 외측', '공간상 맨 끝 선 기준');
assert.strictEqual(loc(placed, [{ x: 3005, y: 9 }]), 'X1', '폭 안');
// 행도 그은 순서: 아래(1500) 먼저, 위(500) 나중 → 맨 위가 Y2
const rowsPlaced = grid([G.createGroup('row', { lines: [hline(1500), hline(500)] })]);
assert.deepStrictEqual(G.orderedLines(rowsPlaced.groups[0], ctx0).items.map((it) => it.name), ['Y2', 'Y1'], '행: 맨 위가 낮은 번호가 아님');
// 예전 데이터(seq 없음) → 저장 순서대로 seq
const migrated = G.normalizeGrid({ groups: [{ axis: 'col', lines: [vline(3000), vline(1000), vline(2000)] }] });
assert.deepStrictEqual(migrated.groups[0].lines.map((l) => l.seq), [1, 2, 3], 'seq 없으면 배열 순서');
const mixed = G.normalizeGrid({ groups: [{ axis: 'col', lines: [Object.assign(vline(3000), { seq: 5 }), vline(1000), Object.assign(vline(2000), { seq: 2 })] }] });
assert.deepStrictEqual(mixed.groups[0].lines.map((l) => l.seq), [5, 6, 2], '있는 seq는 유지, 없는 것은 뒤로');
assert.deepStrictEqual(G.orderedLines(mixed.groups[0], ctx0).items.map((it) => it.name), ['X3', 'X1', 'X2'], 'seq 2 → X1, 5 → X2, 6 → X3');
// 선 추가·지우기·옮기기
const gAdd = G.createGroup('col', { band: 20 });
[2000, 1000, 3000].forEach((x) => G.addLineToGroup(gAdd, G.makeLineThrough({ x, y: 10 }, 'col', 0, ctx0)));
assert.deepStrictEqual(gAdd.lines.map((l) => l.seq), [1, 2, 3]);
const nameOf = (g, x) => G.orderedLines(g, ctx0).items.find((it) => Math.abs(it.line.pts[0].x - x) < 1e-6).name;
assert.strictEqual(nameOf(gAdd, 2000), 'X1');
assert.strictEqual(nameOf(gAdd, 1000), 'X2');
gAdd.lines = gAdd.lines.filter((l) => Math.abs(l.pts[0].x - 2000) > 1e-6);
assert.strictEqual(nameOf(gAdd, 1000), 'X1', '지우면 뒤 번호가 당겨짐');
assert.strictEqual(nameOf(gAdd, 3000), 'X2');
G.addLineToGroup(gAdd, G.makeLineThrough({ x: 2500, y: 10 }, 'col', 0, ctx0));
assert.strictEqual(nameOf(gAdd, 2500), 'X3', '새 선은 맨 끝 번호');
const mv = gAdd.lines.find((l) => Math.abs(l.pts[0].x - 1000) < 1e-6);
mv.pts = mv.pts.map((q) => ({ x: q.x + 2800, y: q.y }));
assert.strictEqual(nameOf(gAdd, 3800), 'X1', '옮겨도 번호 그대로');
G.setLineAngle(mv, 'col', 20, ctx0);
assert.strictEqual(G.orderedLines(gAdd, ctx0).items.find((it) => it.line === mv).name, 'X1', '돌려도 번호 그대로');
// 위치 순서로 다시 매기기(한 번만)
G.renumberBySpatialOrder(placed.groups[0], ctx0);
assert.deepStrictEqual(G.orderedLines(placed.groups[0], ctx0).items.map((it) => it.name), ['X1', 'X2', 'X3'], '다시 매기기');
assert.deepStrictEqual(placed.groups[0].lines.map((l) => l.pts[0].x), [1000, 2000, 3000], '배열도 번호 순서로');
// 범위 전용 부재가 선 위: 이웃 칸 중 반대편 선 번호가 작은 쪽
const onA = grid([G.createGroup('col', { lines: [vline(2000), vline(1000), vline(3000)] })]);
assert.strictEqual(G.computeGridLocation(onA, [{ x: 2000, y: 9 }], ctx0, { member: '슬래브' }), 'X1~X2', 'X1 위 → 이웃 X2(1000)·X3(3000) 중 X2 쪽');
const onB = grid([G.createGroup('col', { lines: [vline(1000), vline(3000), vline(2000)] })]);
assert.strictEqual(G.computeGridLocation(onB, [{ x: 2000, y: 9 }], ctx0, { member: '보(B)' }), 'X1~X3', 'X3 위 → 이웃 X1·X2 중 X1 쪽');
assert.strictEqual(G.computeGridLocation(onB, [{ x: 2000, y: 9 }], ctx0, { member: '보(G)' }), 'X3', '거더는 가까운 선 이름');

// ---- 폭: 선마다 다른 폭 ----
const bands = grid([G.createGroup('col', { band: 10, lines: [vline(1000), vline(2000, { band: 200 })] })]);
assert.strictEqual(loc(bands, [{ x: 1090, y: 10 }]), 'X1~X2', '기본 폭 10 → 사이');
assert.strictEqual(loc(bands, [{ x: 1910, y: 10 }]), 'X2', '개별 폭 200 → 선 위');
assert.strictEqual(loc(bands, [{ x: 1004, y: 10 }]), 'X1');

// ---- 행/열 한 축만 있으면 그 축만 ----
assert.strictEqual(loc(grid([G.createGroup('row', { lines: [hline(500), hline(1500)] })]), [{ x: 9, y: 900 }]), 'Y1~Y2');
assert.strictEqual(loc(grid([]), [{ x: 9, y: 900 }]), '');

// ---- 비스듬한 선(30°) ----
const angled = G.createGroup('col', { angle: 30, band: 20 });
[1000, 2000, 3000].forEach((x) => angled.lines.push(G.makeLineThrough({ x, y: 1500 }, 'col', 30, ctx0)));
const gA = grid([angled]);
assert.ok(Math.abs(G.lineAngle(gA.groups[0].lines[0], 'col', ctx0) - 30) < 0.5, '만든 선 각도 30°');
// 선 위를 따라가면 같은 이름
const dir = G.dirFromAngle('col', 30);
assert.strictEqual(loc(gA, [{ x: 2000 + dir.x * 800, y: 1500 + dir.y * 800 }]), 'X2', '비스듬한 선 위');
assert.strictEqual(loc(gA, [{ x: 1500 + dir.x * -600, y: 1500 + dir.y * -600 }]), 'X1~X2', '비스듬한 선 사이');
// 세로선이라면 X2 오른쪽이지만, 30° 기울어 X1~X2 사이인 점
assert.strictEqual(loc(gA, [{ x: 2100, y: 500 }]), 'X1~X2', '기울기 반영');
// setLineAngle 되돌리기
const ln0 = gA.groups[0].lines[0];
G.setLineAngle(ln0, 'col', 0, ctx0);
assert.ok(Math.abs(G.lineAngle(ln0, 'col', ctx0)) < 0.5, '각도 0으로');
assert.ok(Math.abs(ln0.pts[0].x - ln0.pts[1].x) < 1e-6, '세로가 됨');

// ---- 꺾은선: 위 절반은 x=1000, 아래는 x=1500 쪽으로 꺾임 ----
const bent = grid([G.createGroup('col', { band: 20, lines: [
    { id: 'b1', pts: [{ x: 1000, y: 0 }, { x: 1000, y: 1500 }, { x: 1500, y: 3000 }] },
    vline(2500)
] })]);
assert.strictEqual(loc(bent, [{ x: 1003, y: 700 }]), 'X1', '꺾은선 위 구간');
assert.strictEqual(loc(bent, [{ x: 1250, y: 2250 }]), 'X1', '꺾은선 아래 구간(비스듬) 위');
assert.strictEqual(loc(bent, [{ x: 1200, y: 700 }]), 'X1~X2', '위 구간 오른쪽');
assert.strictEqual(loc(bent, [{ x: 1200, y: 2800 }]), 'X1 외측', '아래 구간에서는 꺾은선 왼쪽');
// 꺾인 점 추가/삭제
const ln = { id: 't', pts: [{ x: 0, y: 0 }, { x: 0, y: 1000 }] };
assert.strictEqual(G.insertVertex(ln, { x: 5, y: 400 }), 1);
assert.deepStrictEqual(ln.pts[1], { x: 0, y: 400 });
assert.strictEqual(G.removeVertex(ln, 0), false, '끝점은 지우지 않음');
assert.strictEqual(G.removeVertex(ln, 1), true);
assert.strictEqual(ln.pts.length, 2);

// ---- 영역 마킹 ----
const area = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 }];
assert.strictEqual(loc(base, area(1200, 600, 2600, 1400)), 'X1~X3, Y1~Y2', '여러 칸 걸친 영역');
assert.strictEqual(loc(base, area(1995, 600, 2008, 1400)), 'X2, Y1~Y2', '폭 안에 다 들어간 영역');
assert.strictEqual(loc(base, area(100, 100, 300, 300)), 'X1 외측, Y1 외측');
assert.strictEqual(loc(base, area(100, 600, 1500, 1400)), 'X1~X2, Y1~Y2', '바깥에서 걸친 영역은 가장자리 선부터');

// ---- 같은 축 그룹 여러 개(날개동): 감싸는 그룹 우선 ----
const wingA = G.createGroup('col', { prefix: 'A', band: 20, lines: [
    { id: 'a1', pts: [{ x: 500, y: 0 }, { x: 500, y: 1400 }] },
    { id: 'a2', pts: [{ x: 1500, y: 0 }, { x: 1500, y: 1400 }] }
] });
const wingB = G.createGroup('col', { prefix: 'B', band: 20, lines: [
    { id: 'b1', pts: [{ x: 2500, y: 1600 }, { x: 2500, y: 3000 }] },
    { id: 'b2', pts: [{ x: 3500, y: 1600 }, { x: 3500, y: 3000 }] }
] });
const wings = grid([wingA, wingB]);
assert.strictEqual(loc(wings, [{ x: 1000, y: 700 }]), 'A1~A2');
assert.strictEqual(loc(wings, [{ x: 3000, y: 2500 }]), 'B1~B2');
assert.strictEqual(loc(wings, [{ x: 1000, y: 2500 }]), 'A1~A2', '양쪽으로 감싸는 그룹 우선');
assert.strictEqual(loc(wings, [{ x: 3800, y: 2500 }]), 'B2 외측', '감싸는 그룹 없으면 선 범위 안·가까운 그룹');

// ---- 회전된 도면: 번호는 화면 기준 왼→오른 / 위→아래 ----
// 이미지의 가로선(y=500,1500)은 90° 회전 화면에서 세로선이 된다 → 열로 쓰면 화면 왼쪽부터 X1
const rot90 = { rot: 90, w: W, h: H };
const rg = grid([G.createGroup('col', { band: 20, lines: [hline(500), hline(1500)] })]);
const disp = G.toDisplay({ x: 0, y: 1500 }, 90, W, H);
assert.strictEqual(disp.x, 1500, '90° 표시 좌표');
assert.deepStrictEqual(G.toImage(disp, 90, W, H), { x: 0, y: 1500 }, '역변환');
const odr = G.orderedLines(rg.groups[0], rot90);
assert.deepStrictEqual(odr.items.map((it) => it.line.id), ['h1500', 'h500'], '90° 화면 공간 순서: 이미지 아래쪽 선이 왼쪽');
assert.strictEqual(loc(rg, [{ x: 100, y: 1000 }], rot90), 'X1~X2');
assert.strictEqual(loc(rg, [{ x: 100, y: 2000 }], rot90), 'X2 외측', '이미지 아래 = 90° 화면 왼쪽 바깥(그 끝 선은 두 번째로 그은 X2)');
assert.deepStrictEqual(odr.items.map((it) => it.name), ['X2', 'X1'], '회전해도 번호는 그은 순서');
[180, 270].forEach((r) => {
    const c = { rot: r, w: W, h: H };
    [{ x: 10, y: 20 }, { x: 3999, y: 5 }].forEach((p) => assert.deepStrictEqual(G.toImage(G.toDisplay(p, r, W, H), r, W, H), p));
});
// 회전 화면에서 새 열 선 만들기 → 화면에서 세로(=이미지에서 가로)
const made = G.makeLineThrough({ x: 2000, y: 1200 }, 'col', 0, rot90);
assert.ok(Math.abs(made.pts[0].y - made.pts[1].y) < 1e-6, '90° 화면 열 선 = 이미지 가로선');
assert.ok(Math.abs(Math.abs(made.pts[0].x - made.pts[1].x) - W) < 1e-6, '도면 경계까지');

// ---- 잡기(hitTest) ----
const hit = G.hitTest(base, { x: 2004, y: 1000 }, 8);
assert.ok(hit && hit.lineId === 'v2000' && hit.vertexIndex == null, '선 잡기');
const hitV = G.hitTest(base, { x: 2003, y: 2996 }, 8);
assert.ok(hitV && hitV.vertexIndex === 1, '끝점 잡기 우선');
assert.strictEqual(G.hitTest(base, { x: 2500, y: 1000 }, 8), null);

// ---- 저장 형식 정리 ----
const n = G.normalizeGrid({ groups: [{ axis: 'row', lines: [{ pts: [{ x: 1, y: 1 }] }, { id: 'ok', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }], label: '  ', band: '' }] }] });
assert.strictEqual(n.groups[0].prefix, 'Y');
assert.strictEqual(n.groups[0].lines.length, 1, '꼭짓점 1개짜리 선은 버림');
assert.ok(!('label' in n.groups[0].lines[0]) && !('band' in n.groups[0].lines[0]));
assert.strictEqual(n.visible, true);
assert.strictEqual(n.autoLocation, true);

// ---- 부재별: 슬래브·보(B)·철골보(B)·빔은 폭 무시하고 늘 범위 ----
const M = G.isRangeOnlyMember;
['슬래브', '데크슬래브', '계단슬래브', '슬라브', '보(B)', '보 (B)', '철골보(B)', 'RC보(B)', '빔', '철골빔', '작은보', 'slab'].forEach((m) => assert.strictEqual(M(m), true, `범위 전용: ${m}`));
['보(G)', '철골보(G)', '거더', '철골거더', '큰보', '보', '철골보', '캔틸레버보', '기둥', '벽체', '보-슬래브 접합부', '기둥-슬래브 접합부', '벽체-보 접합부', '철골 접합부', '', null].forEach((m) => assert.strictEqual(M(m), false, `보통 규칙: ${m}`));
const locM = (pts, member, g) => G.computeGridLocation(g || base, pts, ctx0, { member });
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보(G)'), 'X2, Y1~Y2', '거더: 둘 다 5px면 열(X) 우선 하나, 행은 범위');
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보'), 'X2, Y2', 'G/B 안 정한 보는 보통 규칙');
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보-슬래브 접합부'), 'X2, Y2', '접합부는 보통 규칙');
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '슬래브'), 'X2~X3, Y1~Y2', '슬래브: 폭 안이어도 점이 있는 쪽 칸');
assert.strictEqual(locM([{ x: 1995, y: 1505 }], '보(B)'), 'X1~X2, Y2 외측', '보(B): 선 왼쪽·아래쪽');
assert.strictEqual(locM([{ x: 2000, y: 1500 }], '철골보(B)'), 'X1~X2, Y1~Y2', '선 위에 딱 걸치면 번호 작은 쪽');
assert.strictEqual(locM([{ x: 1000, y: 500 }], '빔'), 'X1~X2, Y1~Y2', '첫 선 위면 안쪽 칸');
assert.strictEqual(locM([{ x: 1500, y: 1000 }], '슬래브'), 'X1~X2, Y1~Y2', '칸 안은 같음');
assert.strictEqual(locM([{ x: 500, y: 1000 }], '슬래브'), 'X1 외측, Y1~Y2', '바깥은 그대로');
// 아래부터 그은 행: Y2 선 위 → 반대편 번호가 작은 Y1 쪽 칸
assert.strictEqual(locM([{ x: 1500, y: 1500 }], '슬래브', named), 'x0~x1, Y1~Y2', '반대편 선 번호가 작은 쪽');
assert.strictEqual(G.computeGridLocation(base, [{ x: 2005, y: 1000 }], ctx0, { forceRange: true }), 'X2~X3, Y1~Y2', 'forceRange 직접');
// 영역: 슬래브가 X2 폭 안에만 있어도 선을 걸치면 X1~X3
assert.strictEqual(locM(area(1995, 600, 2008, 1400), '슬래브'), 'X1~X3, Y1~Y2', '선을 걸친 슬래브 영역');
assert.strictEqual(locM(area(2002, 600, 2008, 1400), '데크슬래브'), 'X2~X3, Y1~Y2', '선 한쪽 폭 안 영역은 그쪽 칸');

// ---- 거더: 가까운 열/행 선 하나 + 다른 축은 범위(폭 무관) ----
const Gd = G.isGirderMember;
['보(G)', '철골보(G)', 'RC보(G)', '거더', '철골거더', '큰보', '보 (G)'].forEach((m) => assert.strictEqual(Gd(m), true, `거더: ${m}`));
['보', '철골보', '보(B)', '철골보(B)', '빔', '슬래브', '캔틸레버보', '보-거더 접합부', '기둥-보 접합부', '', null].forEach((m) => assert.strictEqual(Gd(m), false, `거더 아님: ${m}`));
const locG = (pts, member, g) => G.computeGridLocation(g || base, pts, ctx0, { member: member || '보(G)' });
assert.strictEqual(locG([{ x: 1990, y: 1000 }]), 'X2, Y1~Y2', '열 선이 더 가까움(10 < 500)');
assert.strictEqual(locG([{ x: 1500, y: 1480 }]), 'X1~X2, Y2', '행 선이 더 가까움 — 폭(20) 밖이어도 붙임');
assert.strictEqual(locG([{ x: 1300, y: 1000 }], '철골거더'), 'X1, Y1~Y2', '폭 밖 300px여도 가까운 선 하나');
assert.strictEqual(locG([{ x: 2010, y: 2500 }], '철골보(G)'), 'X2, Y2 외측', '다른 축이 바깥이면 외측 규칙');
assert.strictEqual(locG([{ x: 500, y: 1000 }], '큰보'), 'X1, Y1~Y2', '바깥이어도 붙는 축은 끝 선 이름');
assert.strictEqual(locG([{ x: 1750, y: 1250 }]), 'X2, Y1~Y2', '거리가 같으면(250) 열(X) 우선');
assert.strictEqual(locG([{ x: 1990, y: 9 }], '거더', grid([G.createGroup('col', { lines: [vline(1000), vline(2000)] })])), 'X2', '열만 있으면 열 선 하나');
assert.strictEqual(locG([{ x: 9, y: 1400 }], '거더', grid([G.createGroup('row', { lines: [hline(500), hline(1500)] })])), 'Y2', '행만 있으면 행 선 하나');
// 영역 거더: 긴 쪽 방향
assert.strictEqual(locG(area(1200, 1480, 2800, 1530)), 'X1~X3, Y2', '가로로 긴 영역 → 행 선 하나, 열은 범위');
assert.strictEqual(locG(area(1980, 600, 2030, 1400)), 'X2, Y1~Y2', '세로로 긴 영역 → 열 선 하나');
assert.strictEqual(locG(area(1900, 1400, 2000, 1500)), 'X2, Y1~Y2', '정사각형 → 가운데 점, 같으면 X 우선');
// 회전 도면: 화면에서 가로로 긴 영역(= 이미지에서 세로로 긴 영역)은 화면 행 선
const rotGrid = grid([
    G.createGroup('col', { lines: [hline(1500), hline(500)] }),
    G.createGroup('row', { lines: [vline(1000), vline(2000)] })
]);
assert.strictEqual(G.computeGridLocation(rotGrid, area(1980, 600, 2030, 1400), rot90, { member: '보(G)' }), 'X1~X2, Y2', '90°: 화면 가로로 긴 영역 → 행(Y) 하나');
// 수동 지정
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { girder: true }), 'X2, Y1~Y2', 'girder 직접');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { member: '보(G)', girder: false }), 'X2, Y1~Y2', 'girder 끄면 보통 규칙(폭 안)');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { member: '보' }), 'X2, Y1~Y2', 'G/B 안 정한 보: 폭 안이라 X2');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1300, y: 1000 }], ctx0, { member: '보' }), 'X1~X2, Y1~Y2', 'G/B 안 정한 보: 폭 밖은 범위(거더 규칙 아님)');

// ---- 위치 자동 입력 규칙 ----
const A = G.applyAutoLocation;
assert.deepStrictEqual(A('', '', 'X1~X2, Y1~Y2'), { detail: 'X1~X2, Y1~Y2', auto: 'X1~X2, Y1~Y2' }, '빈칸이면 채움');
assert.deepStrictEqual(A('X1~X2, Y1~Y2', 'X1~X2, Y1~Y2', 'X2, Y2'), { detail: 'X2, Y2', auto: 'X2, Y2' }, '자동 글자면 바꿈');
assert.deepStrictEqual(A('X1~X2, Y1~Y2 거실', 'X1~X2, Y1~Y2', 'X2, Y2'), { detail: 'X2, Y2 거실', auto: 'X2, Y2' }, '뒤에 덧붙인 글은 살림');
assert.deepStrictEqual(A('거실 천장', 'X1~X2, Y1~Y2', 'X2, Y2'), { detail: '거실 천장', auto: '' }, '직접 쓴 글은 안 덮음');
assert.deepStrictEqual(A('거실 천장', '', 'X2, Y2'), { detail: '거실 천장', auto: '' });
assert.deepStrictEqual(A('X2, Y2', 'X2, Y2', ''), { detail: '', auto: '' }, '선이 없어지면 자동 글자만 지움');
assert.deepStrictEqual(A('X2, Y2 거실', 'X2, Y2', ''), { detail: '거실', auto: '' });
assert.deepStrictEqual(A('', '', ''), { detail: '', auto: '' });

// ---- app.js / index.html 연결(파일이 있을 때만) ----
const appPath = path.join(__dirname, '..', 'app.js');
if (fs.existsSync(appPath)) {
    const app = read('app.js');
    const idx = read('index.html');
    assert.ok(idx.includes('js/shared/grid-lines.js'), 'index.html에서 모듈 로드');
    assert.ok(idx.indexOf('js/shared/grid-lines.js') < idx.indexOf('src="app.js'), 'app.js보다 먼저 로드');
    assert.ok(idx.includes('id="btnGridLines"') && idx.includes('id="mobileBtnGridLines"'), 'PC·모바일 버튼');
    assert.ok(app.includes('floorGridLines: window.state.floorGridLines || null'), '로컬/클라우드 저장');
    assert.ok(app.includes('if (data.floorGridLines)'), '클라우드 불러오기');
    assert.ok(app.includes('drawFloorGridOverlay(ctx, imgW, imgH);'), '화면 그리기');
    assert.ok(/gridLocAuto/.test(app), '자동 입력 표시');
    // 설정(편집) 중에만 보임 — 저장된 visible 값과 무관, 설정 밖에서는 도면 누르기를 가로채지 않음
    const drawFn = app.slice(app.indexOf('function drawFloorGridOverlay('), app.indexOf('// ---- 편집: 누르기 · 끌기 ----'));
    assert.ok(drawFn.includes('if (!editing || !grid || !gridHasLines(grid)) return;'), '설정 밖이면 안 그림');
    assert.ok(!drawFn.includes('grid.visible'), '저장된 표시 설정은 무시');
    assert.ok(!app.includes('data-f="visible"'), '「편집 끝나도 표시」 체크 없음');
    assert.ok(app.includes('if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.button === 0) {'), '마우스: 설정 중에만');
    assert.ok(app.includes('if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.touches.length === 1 && !isPinching) {'), '터치: 설정 중에만');
    assert.ok(app.includes("if (window.BSA_gridEdit && window.BSA_gridEdit.active) {\n                window.BSA_gridEdit.onDblClick"), '더블클릭: 설정 중에만');
    const autoFn = app.slice(app.indexOf('function computeGridAutoLocationForPoints('), app.indexOf('function gridNum('));
    assert.ok(!autoFn.includes('visible') && !autoFn.includes('.active'), '숨겨져 있어도 위치 자동 입력');
    // 「위치 비우고 행·열로 다시 채우기」: 직접 쓴 글도 지우고 칸 이름 + 자동 표시, 되돌리기 한 번, 동기화 시각
    assert.ok(app.includes('data-act="resetFill"'), '다시 채우기 버튼');
    assert.ok(app.includes("if (act === 'resetFill') {\n            resetGridLocationForCurrentFloor();"), '버튼 연결');
    const resetFn = app.slice(app.indexOf('function resetGridLocationForCurrentFloor('), app.indexOf('/** 결함 창 열 때: 새 마킹이면'));
    assert.ok(resetFn.includes('confirm('), '확인창');
    assert.ok(resetFn.indexOf('pushDefectHistory()') > 0 && resetFn.indexOf('pushDefectHistory()') < resetFn.indexOf('d.location = nextLoc;'), '바꾸기 전에 되돌리기 기록 한 번');
    assert.strictEqual((resetFn.match(/pushDefectHistory\(\)/g) || []).length, 1, '되돌리기 기록은 한 번만');
    assert.ok(resetFn.includes('d.gridLocAuto = next;') && resetFn.includes('touchDefectUpdatedAt(d);') && resetFn.includes('saveStateToLocalStorage();'), '자동 표시·수정 시각·저장');
    assert.ok(!resetFn.includes('applyAutoLocation'), '직접 쓴 글 보존 규칙을 쓰지 않음(전부 덮어씀)');
}

console.log('test-grid-lines: OK');
