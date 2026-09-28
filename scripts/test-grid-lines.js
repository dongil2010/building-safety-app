#!/usr/bin/env node
'use strict';

/**
 * 2026-09-28 (실험 exp/grid-lines) 도면 행·열(통심) 선 — 순수 계산 회귀 테스트
 *  - 이름: 먼저 그은 선이 작은 번호(그은 순서), 시작 번호 0, 개별 이름, 지우면 당겨짐, 위치 순서로 다시 매기기, 세로/가로/비스듬/꺾은선 위치 찾기
 *  - 열/행은 「/」로 이어 씀(X1~X2/Y1~Y2). 폭(띠) 안이면 한 이름, 사이면 X1~X2, 바깥이면 「~X1」/「X3~」(바깥 쪽을 비운 범위)
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
assert.strictEqual(loc(base, [{ x: 1500, y: 1000 }]), 'X1~X2/Y1~Y2', '칸 안');
assert.strictEqual(loc(base, [{ x: 2005, y: 1495 }]), 'X2/Y2', '폭 안이면 선 이름 하나');
assert.strictEqual(loc(base, [{ x: 2011, y: 1000 }]), 'X2~X3/Y1~Y2', '폭(20) 밖 11px이면 사이');
assert.strictEqual(loc(base, [{ x: 500, y: 200 }]), '~X1/~Y1', '맨 앞 선 밖(번호 작은 끝) → ~X1');
assert.strictEqual(loc(base, [{ x: 3500, y: 2500 }]), 'X3~/Y2~', '맨 뒤 선 밖(번호 큰 끝) → X3~');

// ---- 이름: 시작 번호 0, 머리글, 개별 이름, 아래에서부터 그은 행 ----
const named = grid([
    G.createGroup('col', { prefix: 'x', start: 0, lines: [vline(1000), vline(2000), vline(3000, { label: 'X3a' })] }),
    G.createGroup('row', { prefix: 'Y', start: 1, lines: [hline(2500), hline(1500), hline(500)] })
]);
assert.strictEqual(loc(named, [{ x: 1500, y: 600 }]), 'x0~x1/Y2~Y3', '시작 0 · 범위는 작은 번호 먼저');
assert.strictEqual(loc(named, [{ x: 2500, y: 2400 }]), 'x1~X3a/Y1~Y2', '개별 이름');
const od = G.orderedLines(named.groups[1], ctx0);
assert.deepStrictEqual(od.items.map((it) => it.name), ['Y3', 'Y2', 'Y1'], '아래부터 그었으면 맨 위가 Y3');

// ---- 번호 = 그은 순서(위치와 무관) ----
const placed = grid([G.createGroup('col', { band: 20, lines: [vline(3000), vline(1000), vline(2000)] })]);
assert.deepStrictEqual(G.orderedLines(placed.groups[0], ctx0).items.map((it) => it.name), ['X2', 'X3', 'X1'], '왼쪽부터 보면 X2 X3 X1');
assert.strictEqual(loc(placed, [{ x: 1500, y: 9 }]), 'X2~X3');
assert.strictEqual(loc(placed, [{ x: 2500, y: 9 }]), 'X1~X3', '이웃 X3·X1 → 작은 번호 먼저');
assert.strictEqual(loc(placed, [{ x: 500, y: 9 }]), '~X2', '왼쪽 끝 X2 < 안쪽 이웃 X3 → ~X2');
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
// 늘 범위(forceRange — 거더 다른 축에서 씀)인데 선 위: 이웃 칸 중 반대편 선 번호가 작은 쪽
const onA = grid([G.createGroup('col', { lines: [vline(2000), vline(1000), vline(3000)] })]);
assert.strictEqual(G.computeGridLocation(onA, [{ x: 2000, y: 9 }], ctx0, { forceRange: true }), 'X1~X2', 'X1 위 → 이웃 X2(1000)·X3(3000) 중 X2 쪽');
const onB = grid([G.createGroup('col', { lines: [vline(1000), vline(3000), vline(2000)] })]);
assert.strictEqual(G.computeGridLocation(onB, [{ x: 2000, y: 9 }], ctx0, { forceRange: true }), 'X1~X3', 'X3 위 → 이웃 X1·X2 중 X1 쪽');
assert.strictEqual(G.computeGridLocation(onB, [{ x: 2000, y: 9 }], ctx0, { member: '슬래브' }), 'X3', '슬래브도 선 위(폭 안)면 선 이름 하나');
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
assert.strictEqual(loc(bent, [{ x: 1200, y: 2800 }]), '~X1', '아래 구간에서는 꺾은선 왼쪽');
// 꺾인 점 추가/삭제
const ln = { id: 't', pts: [{ x: 0, y: 0 }, { x: 0, y: 1000 }] };
assert.strictEqual(G.insertVertex(ln, { x: 5, y: 400 }), 1);
assert.deepStrictEqual(ln.pts[1], { x: 0, y: 400 });
assert.strictEqual(G.removeVertex(ln, 0), false, '끝점은 지우지 않음');
assert.strictEqual(G.removeVertex(ln, 1), true);
assert.strictEqual(ln.pts.length, 2);

// ---- 영역 마킹 ----
const area = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x1, y: y2 }, { x: x2, y: y2 }];
assert.strictEqual(loc(base, area(1200, 600, 2600, 1400)), 'X1~X3/Y1~Y2', '여러 칸 걸친 영역');
assert.strictEqual(loc(base, area(1995, 600, 2008, 1400)), 'X2/Y1~Y2', '폭 안에 다 들어간 영역');
assert.strictEqual(loc(base, area(100, 100, 300, 300)), '~X1/~Y1');
assert.strictEqual(loc(base, area(100, 600, 1500, 1400)), 'X1~X2/Y1~Y2', '바깥에서 걸친 영역은 가장자리 선부터');

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
assert.strictEqual(loc(wings, [{ x: 3800, y: 2500 }]), 'B2~', '감싸는 그룹 없으면 선 범위 안·가까운 그룹');

// ---- 바깥 표기: 끝 선과 안쪽 이웃 번호 비교(번호 = 그은 순서) ----
const out7 = grid([G.createGroup('col', { prefix: 'A', lines: [1000, 1500, 2000, 2500, 3000, 3500, 3800].map((x) => vline(x)) })]);
assert.strictEqual(loc(out7, [{ x: 3900, y: 9 }]), 'A7~', '가장 큰 번호 끝 바깥 → A7~');
assert.strictEqual(loc(out7, [{ x: 500, y: 9 }]), '~A1', '가장 작은 번호 끝 바깥 → ~A1');
const outRev = grid([G.createGroup('col', { prefix: 'A', lines: [3000, 2000, 1000].map((x) => vline(x)) })]);
assert.strictEqual(loc(outRev, [{ x: 500, y: 9 }]), 'A3~', '오른쪽부터 그음: 왼쪽 끝이 가장 큰 A3 → A3~');
assert.strictEqual(loc(outRev, [{ x: 3500, y: 9 }]), '~A1', '오른쪽 끝이 가장 작은 A1 → ~A1');
const outMid = grid([G.createGroup('col', { prefix: 'A', lines: [2000, 1000, 3000].map((x) => vline(x)) })]);
assert.strictEqual(loc(outMid, [{ x: 500, y: 9 }]), 'A2~', '끝 선 A2가 이웃 A1보다 큼 → A2~');
assert.strictEqual(loc(outMid, [{ x: 3500, y: 9 }]), 'A3~', '끝 선 A3가 이웃 A1보다 큼 → A3~');
const one = grid([G.createGroup('col', { prefix: 'A', lines: [vline(2000)] })]);
assert.strictEqual(loc(one, [{ x: 1000, y: 9 }]), '~A1', '선 하나: 왼쪽 바깥 ~A1');
assert.strictEqual(loc(one, [{ x: 3000, y: 9 }]), 'A1~', '선 하나: 오른쪽 바깥 A1~');
assert.strictEqual(loc(out7, area(3850, 100, 3950, 200)), 'A7~', '영역 전체가 바깥');
assert.strictEqual(loc(out7, area(3600, 100, 3950, 200)), 'A6~A7', '안에서 바깥으로 걸친 영역은 예전처럼 끝 선까지 범위');
assert.ok(!/외측/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'shared', 'grid-lines.js'), 'utf8').replace(/^ \*.*$/gm, '')), '「외측」 만드는 코드 없음');
assert.ok(G.GRID_LOC_ALGO >= 4, '규칙 버전 올림 → 저장된 「외측」 값 자동 다시 계산');

// ---- 열/행 구분자: '/' (공백 없음) ----
assert.strictEqual(G.AXIS_SEP, '/');
assert.ok(!/, /.test(loc(base, [{ x: 1500, y: 1000 }])), '쉼표 안 씀');
assert.ok(G.GRID_LOC_ALGO >= 5, '규칙 버전 5 → 저장된 「X1~X2, Y1~Y2」도 자동 다시 계산');

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
assert.strictEqual(loc(rg, [{ x: 100, y: 2000 }], rot90), 'X2~', '이미지 아래 = 90° 화면 왼쪽 바깥(그 끝 선은 두 번째로 그은 X2, 이웃 X1보다 큼 → X2~)');
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

// ---- 부재별: 슬래브·보(B)·철골보(B)·빔도 보통 폭 규칙(2026-09-28 「늘 범위」 없앰) ----
assert.strictEqual(G.isRangeOnlyMember, undefined, '늘 범위 부재 목록은 없앰');
assert.strictEqual(G.RANGE_ONLY_MEMBER_RULES, undefined);
const locM = (pts, member, g) => G.computeGridLocation(g || base, pts, ctx0, { member });
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보(G)'), 'X2/Y2', '거더: 폭 안이면 보통 규칙 그대로(두 축 다 폭 안)');
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보'), 'X2/Y2', 'G/B 안 정한 보는 보통 규칙');
assert.strictEqual(locM([{ x: 2005, y: 1495 }], '보-슬래브 접합부'), 'X2/Y2', '접합부는 보통 규칙');
['슬래브', '데크슬래브', '계단슬래브', '슬라브', '보(B)', '보 (B)', '철골보(B)', 'RC보(B)', '빔', '철골빔', '작은보', 'slab'].forEach((m) => {
    assert.strictEqual(locM([{ x: 2005, y: 1495 }], m), 'X2/Y2', `폭 안이면 선 이름 하나: ${m}`);
    assert.strictEqual(locM([{ x: 2005, y: 1000 }], m), 'X2/Y1~Y2', `한 축만 폭 안: ${m}`);
    assert.strictEqual(locM([{ x: 1500, y: 1000 }], m), 'X1~X2/Y1~Y2', `폭 밖이면 범위: ${m}`);
    assert.strictEqual(locM([{ x: 500, y: 1000 }], m), '~X1/Y1~Y2', `바깥: ${m}`);
});
assert.strictEqual(locM([{ x: 1995, y: 1505 }], '보(B)'), 'X2/Y2', '보(B): 선 왼쪽·아래쪽이어도 폭 안이면 선 이름');
assert.strictEqual(locM([{ x: 2011, y: 1000 }], '슬래브'), 'X2~X3/Y1~Y2', '폭(20) 밖 11px → 범위');
assert.strictEqual(G.computeGridLocation(base, [{ x: 2005, y: 1000 }], ctx0, { forceRange: true }), 'X2~X3/Y1~Y2', 'forceRange 직접');
// 영역: 전체가 X2 폭 안이면 X2, 선 폭을 벗어나 걸치면 범위
assert.strictEqual(locM(area(1995, 600, 2008, 1400), '슬래브'), 'X2/Y1~Y2', '영역 전체가 X2 폭 안 → X2');
assert.strictEqual(locM(area(1995, 600, 2300, 1400), '데크슬래브'), 'X2~X3/Y1~Y2', '폭 안에서 칸 안으로 → X2~X3');
assert.strictEqual(locM(area(1500, 600, 2300, 1400), '슬래브'), 'X1~X3/Y1~Y2', '선을 넘어 걸치면 X1~X3');

// ---- 거더: 폭 안이면 보통 규칙, 어느 폭에도 안 들면 가까운 열/행 선 하나 + 다른 축은 범위 ----
const Gd = G.isGirderMember;
['보(G)', '철골보(G)', 'RC보(G)', '거더', '철골거더', '큰보', '보 (G)'].forEach((m) => assert.strictEqual(Gd(m), true, `거더: ${m}`));
['보', '철골보', '보(B)', '철골보(B)', '빔', '슬래브', '캔틸레버보', '보-거더 접합부', '기둥-보 접합부', '', null].forEach((m) => assert.strictEqual(Gd(m), false, `거더 아님: ${m}`));
const locG = (pts, member, g) => G.computeGridLocation(g || base, pts, ctx0, { member: member || '보(G)' });
assert.strictEqual(locG([{ x: 1990, y: 1000 }]), 'X2/Y1~Y2', 'X2 폭 안 → 보통 규칙');
assert.strictEqual(locG([{ x: 1300, y: 1505 }]), 'X1~X2/Y2', 'Y2 폭 안 → 보통 규칙(X는 범위)');
assert.strictEqual(locG([{ x: 1995, y: 1300 }], '철골보(G)'), 'X2/Y1~Y2', 'X 폭 안');
assert.strictEqual(locG(area(1995, 600, 2005, 1400)), 'X2/Y1~Y2', '영역 전체가 X2 폭 안 → 보통 규칙');
assert.strictEqual(locG([{ x: 1100, y: 9 }], '거더', bands), 'X1', '폭 밖 → 가까운 X1(100 < 900)');
assert.strictEqual(locG([{ x: 1600, y: 9 }], '거더', bands), 'X2', '폭 밖 → 가까운 X2(400 < 600)');
assert.strictEqual(locG([{ x: 1910, y: 9 }], '거더', bands), 'X2', '개별 폭(200) 안 → 보통 규칙 X2');
assert.strictEqual(locG([{ x: 1500, y: 1480 }]), 'X1~X2/Y2', '폭(20) 밖 → 행 선이 더 가까워(20 < 500) Y 하나');
assert.strictEqual(locG([{ x: 1300, y: 1000 }], '철골거더'), 'X1/Y1~Y2', '폭 밖 300px여도 가까운 선 하나');
assert.strictEqual(locG([{ x: 2010, y: 2500 }], '철골보(G)'), 'X2/Y2~', 'X2 폭 안(10) → 보통 규칙, Y는 바깥 Y2~');
assert.strictEqual(locG([{ x: 2030, y: 2500 }], '철골보(G)'), 'X2/Y2~', '폭 밖 → 가까운 X2 하나, 다른 축 바깥은 Y2~');
assert.strictEqual(locG([{ x: 500, y: 1000 }], '큰보'), 'X1/Y1~Y2', '바깥이어도 붙는 축은 끝 선 이름');
assert.strictEqual(locG([{ x: 1750, y: 1250 }]), 'X2/Y1~Y2', '거리가 같으면(250) 열(X) 우선');
assert.strictEqual(locG([{ x: 1990, y: 9 }], '거더', grid([G.createGroup('col', { lines: [vline(1000), vline(2000)] })])), 'X2', '열만 있으면 열 선 하나');
assert.strictEqual(locG([{ x: 9, y: 1400 }], '거더', grid([G.createGroup('row', { lines: [hline(500), hline(1500)] })])), 'Y2', '행만 있으면 행 선 하나');
// 영역 거더: 긴 쪽 방향
assert.strictEqual(locG(area(1200, 1480, 2800, 1530)), 'X1~X3/Y2', '가로로 긴 영역 → 행 선 하나, 열은 범위');
assert.strictEqual(locG(area(1980, 600, 2030, 1400)), 'X2/Y1~Y2', '세로로 긴 영역 → 열 선 하나');
assert.strictEqual(locG(area(1900, 1400, 2000, 1500)), 'X2/Y1~Y2', '정사각형 → 가운데 점, 같으면 X 우선');
// 회전 도면: 화면에서 가로로 긴 영역(= 이미지에서 세로로 긴 영역)은 화면 행 선
const rotGrid = grid([
    G.createGroup('col', { lines: [hline(1500), hline(500)] }),
    G.createGroup('row', { lines: [vline(1000), vline(2000)] })
]);
assert.strictEqual(G.computeGridLocation(rotGrid, area(1980, 600, 2030, 1400), rot90, { member: '보(G)' }), 'X1~X2/Y2', '90°: 화면 가로로 긴 영역 → 행(Y) 하나');
// 수동 지정
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { girder: true }), 'X2/Y1~Y2', 'girder 직접');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { member: '보(G)', girder: false }), 'X2/Y1~Y2', 'girder 끄면 보통 규칙(폭 안)');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1990, y: 1000 }], ctx0, { member: '보' }), 'X2/Y1~Y2', 'G/B 안 정한 보: 폭 안이라 X2');
assert.strictEqual(G.computeGridLocation(base, [{ x: 1300, y: 1000 }], ctx0, { member: '보' }), 'X1~X2/Y1~Y2', 'G/B 안 정한 보: 폭 밖은 범위(거더 규칙 아님)');

// ---- 칸 구조: 행·열(gridLoc) + 상세 위치(실 이름), 한글/PDF 위치 칸 두 줄 ----
assert.strictEqual(G.formatLocationCell('X1~X2/Y2', '거실'), 'X1~X2/Y2\n거실', '행·열 다음 줄 실 이름');
assert.strictEqual(G.formatLocationCell('X1~X2/Y2', ''), 'X1~X2/Y2', '실 이름 없으면 한 줄');
assert.strictEqual(G.formatLocationCell('', '거실'), '거실');
assert.strictEqual(G.reportLocationCell({ gridLoc: 'X2/Y3', detail: '거실' }), 'X2/Y3\n거실');
assert.strictEqual(G.reportLocationCell({ gridLoc: 'X2/Y3', detail: '' }), 'X2/Y3');
assert.strictEqual(G.reportLocationCell({ detail: '거실' }), '', '행·열 없으면 빈 값 → 예전 출력 그대로');
assert.strictEqual(G.reportLocationCell({ detail: 'X2, Y3 거실', legacyAuto: 'X2, Y3' }), 'X2, Y3\n거실', '예전 실험 데이터도 두 줄로');
assert.strictEqual(G.reportLocationCell({ detail: 'X2, Y3', legacyAuto: 'X2, Y3' }), 'X2, Y3');
assert.strictEqual(G.reportLocationCell({ gridLoc: 'X9', detail: 'X2, Y3 거실', legacyAuto: 'X2, Y3' }), 'X9\n거실', '새 칸 값이 우선');
assert.deepStrictEqual(G.splitLegacyGridLocation('X2, Y3 거실 천장', 'X2, Y3'), { grid: 'X2, Y3', room: '거실 천장' });
assert.deepStrictEqual(G.splitLegacyGridLocation('거실', 'X2, Y3'), { grid: '', room: '거실' }, '직접 쓴 글은 그대로');
assert.deepStrictEqual(G.splitLegacyGridLocation('X2, Y3', ''), { grid: '', room: 'X2, Y3' });

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
    assert.ok(drawFn.includes('if (!editing) return;') && drawFn.includes('if (!grid || !gridHasLines(grid)) return;'), '설정 밖이면 안 그림');
    assert.ok(!drawFn.includes('grid.visible'), '저장된 표시 설정은 무시');
    assert.ok(!app.includes('data-f="visible"'), '「편집 끝나도 표시」 체크 없음');
    assert.ok(app.includes('if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.button === 0) {'), '마우스: 설정 중에만');
    assert.ok(app.includes('if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.touches.length === 1 && !isPinching) {'), '터치: 설정 중에만');
    assert.ok(app.includes("if (window.BSA_gridEdit && window.BSA_gridEdit.active) {\n                window.BSA_gridEdit.onDblClick"), '더블클릭: 설정 중에만');
    const autoFn = app.slice(app.indexOf('function computeGridAutoLocationForPoints('), app.indexOf('function gridNum('));
    assert.ok(!autoFn.includes('visible') && !autoFn.includes('.active'), '숨겨져 있어도 위치 자동 입력');
    // 행·열 위치는 gridLoc 칸, 상세 위치(location)는 실 이름 — 자동 입력은 location을 쓰지 않음
    const autoSec = app.slice(app.indexOf('    // ---- 마킹 위치 자동 입력 ----'), app.indexOf('    // @@GRID_LINES_END'));
    const applyFn = autoSec.slice(autoSec.indexOf('function applyGridAutoLocationToDefect('), autoSec.indexOf('function applyGridAutoLocationAfterDrag('));
    assert.ok(applyFn.includes('d.gridLoc = next;'), '칸 이름은 gridLoc에');
    assert.ok(!/d\.location\s*=/.test(applyFn), '자동 입력이 상세 위치(location)를 쓰지 않음');
    const legacyFn = autoSec.slice(autoSec.indexOf('function migrateLegacyGridLocation('), autoSec.indexOf('function refreshGridLocHintInModal('));
    assert.ok(legacyFn.includes('splitLegacyGridLocation') && legacyFn.includes('delete d.gridLocAuto;'), '예전 실험 데이터만 옮김(칸 이름 떼고 실 이름 남김)');
    const modalFn = autoSec.slice(autoSec.indexOf('function applyGridAutoLocationToModal('), autoSec.indexOf('function gridModalMember('));
    assert.ok(!/locEl\.value\s*=\s*(r\.|next|computeGrid)/.test(modalFn), '새 마킹 창에서 상세 위치 입력칸에 칸 이름을 안 넣음');
    const takeFnTop = (name) => {
        const st = app.indexOf(`function ${name}(`);
        let depth = 0;
        for (let i = app.indexOf('{', st); i < app.length; i++) {
            if (app[i] === '{') depth++;
            else if (app[i] === '}') { depth--; if (depth === 0) return app.slice(st, i + 1); }
        }
        throw new Error(name);
    };
    // 「위치칸 비우고 행·열 다시 채우기」: 위치칸(location) 비움 + gridLoc 다시 계산, 되돌리기 한 번, 동기화 시각
    assert.ok(app.includes('data-act="resetFill"') && app.includes('위치칸 비우고 행·열 다시 채우기</button>'), '버튼(패널에 조건 없이 늘 있음)');
    {
        const panelFn = takeFnTop('renderGridPanel');
        const i = panelFn.indexOf('data-act="resetFill"');
        const before = panelFn.slice(Math.max(0, panelFn.lastIndexOf('<div class="grid-panel-sec">', i)), i);
        assert.ok(!/\$\{[^}]*\?\s*`/.test(before), '버튼이 조건부 블록(${... ? `...`})으로 숨지 않음');
    }
    assert.ok(app.includes("if (act === 'resetFill') {\n            resetGridLocationForCurrentFloor();"), '버튼 연결');
    const resetFn = autoSec.slice(autoSec.indexOf('function resetGridLocationForCurrentFloor('), autoSec.indexOf('function applyGridAutoLocationToModal('));
    assert.ok(resetFn.includes('confirm(') && resetFn.includes('위치칸을 비우고') && resetFn.includes('지워집니다'), '확인창: 위치칸을 비운다고 알림');
    assert.strictEqual((resetFn.match(/pushDefectHistory\(\)/g) || []).length, 1, '되돌리기 기록은 한 번만');
    assert.ok(resetFn.indexOf('pushDefectHistory()') < resetFn.indexOf('d.location = emptyLoc;') && resetFn.indexOf('pushDefectHistory()') < resetFn.indexOf('applyGridAutoLocationToDefect(d, fc)'), '바꾸기 전에 기록');
    assert.ok(resetFn.includes("const emptyLoc = composeDefectLocation('', fc);") && resetFn.includes('d.location = emptyLoc;'), '위치칸 비움(3종은 층 규칙대로 층만)');
    assert.ok(applyFn.includes('touchDefectUpdatedAt(d);') && autoSec.includes('saveStateToLocalStorage();'), '수정 시각·저장');
    // 한글/PDF 상태조사표 위치 칸: 행·열 → 다음 줄 실 이름
    const rowFn = app.slice(app.indexOf('function getReportSurveyRowValues('), app.indexOf('function buildReportSurveyTableHtml('));
    assert.ok(rowFn.includes('const loc = gridLocCell || extractDefectLocationDetail(d.location, ctx.floorCode)'), '1·2종 위치 칸: 행·열 있으면 두 줄, 없으면 예전 그대로');
    assert.ok(autoSec.includes('G.reportLocationCell({'), '위치 칸은 모듈 규칙으로');
    assert.ok(app.includes('white-space:pre-line;">${escapeReportHtml(text)}</td>'), 'PDF 표는 줄바꿈 유지');
    assert.strictEqual((app.match(/mergeGroupGridLocProp\((?:members|markingMembers)\) : \{\}/g) || []).length, 2, '묶음 마킹도 행·열 모음');
    assert.ok(app.includes('<div class="survey-grid-loc"'), '화면 상태조사표 위치 칸 첫 줄');
    // 실제 행 값 함수로 확인(1·2종 위치 칸 = values[1])
    const takeFn = (name) => {
        const st = app.indexOf(`function ${name}(`);
        let i = app.indexOf('{', st);
        let depth = 0;
        for (; i < app.length; i++) {
            if (app[i] === '{') depth++;
            else if (app[i] === '}') { depth--; if (depth === 0) return app.slice(st, i + 1); }
        }
        throw new Error(name);
    };
    const vm = require('vm');
    {
        const mctx = { G };
        vm.createContext(mctx);
        vm.runInContext(`${takeFn('mergeGroupGridLocProp')}\nthis.merge = mergeGroupGridLocProp;`, mctx);
        assert.strictEqual(JSON.stringify(mctx.merge([{ gridLoc: 'A1~A2/Y1' }, { gridLoc: 'A3/Y2~' }, { gridLoc: 'A1~A2/Y1' }, {}])), JSON.stringify({ gridLoc: 'A1~A2/Y1, A3/Y2~' }), '묶음 화살표 여러 개: 쌍 사이는 쉼표');
        assert.strictEqual(JSON.stringify(mctx.merge([{}])), '{}');
    }
    const sandbox = {
        G,
        gridLib: () => G,
        extractDefectLocationDetail: (loc) => String(loc || '').replace(/^1F\s*/, '').replace(/^1F$/, ''),
        getSurveyStructMarks: () => ({ struct: '○', nonstruct: '-' }),
        formatSurveyReportNo: () => '1',
        getSurveyCellText: (k, d) => (k === 'location' ? (d.location || '1F 기둥') : (k === 'component' ? '벽체' : (k === 'defectType' ? '균열' : '-'))),
        appendGrade3ProgressLeakToContent: (x) => x
    };
    vm.createContext(sandbox);
    vm.runInContext(`${takeFn('getDefectGridRoomForReport')}\n${takeFn('getReportSurveyRowValues')}\nthis.rowVals = getReportSurveyRowValues;`, sandbox);
    const locCell = (d) => sandbox.rowVals(d, { floorCode: '1F' }, false)[1];
    assert.strictEqual(locCell({ location: '1F 거실', gridLoc: 'X1~X2/Y2' }), 'X1~X2/Y2\n거실', '한글/PDF: 행·열 다음 줄 실 이름');
    assert.strictEqual(locCell({ location: '1F', gridLoc: 'X1~X2/Y2' }), 'X1~X2/Y2', '실 이름 없으면 행·열 한 줄');
    assert.strictEqual(locCell({ location: '1F 거실' }), '거실', '행·열 없으면 예전 그대로');
    assert.strictEqual(locCell({ location: '1F X2, Y3 거실', gridLocAuto: 'X2, Y3' }), 'X2, Y3\n거실', '예전 실험 데이터도 두 줄');

    // ---- 앱 흐름(같은 함수): 거더 부재를 나중에 정해도 가까운 선에 붙음 ----
    const QP = require(path.join(__dirname, '..', 'js', 'shared', 'defect-quick-presets.js'));
    const floorDefects = [];
    const saves = { n: 0 };
    const timers = [];
    const flow = {
        G,
        state: {
            currentBuildingId: 'b1', currentFloor: '1F', rotationAngle: 0, currentTab: 'tab-map',
            floorGridLines: {
                b1_1F: {
                    groups: [
                        { axis: 'col', prefix: 'A', start: 1, band: 20, lines: [vline(1000), vline(2000), vline(3000)] },
                        { axis: 'row', prefix: 'Y', start: 1, band: 20, lines: [hline(500), hline(1500)] }
                    ]
                }
            }
        },
        window: { BSA: { gridLines: G, defectQuickPresets: QP } },
        document: { getElementById: () => null },
        elements: { defectModal: null },
        console,
        WeakMap,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        getFloorMapStyleKey: (b, f) => `${b}_${f}`,
        getFloorPlanDisplayDims: () => ({ w: 4000, h: 3000 }),
        extractDefectLocationDetail: (loc) => String(loc || '').replace(/^1F\s*/, ''),
        composeDefectLocation: (room) => `1F ${room}`.trim(),
        touchDefectUpdatedAt: (d) => { d.updatedAt = (d.updatedAt || 0) + 1; },
        filterMapPlacedDefects: (list) => list,
        getCurrentFloorDefects: () => floorDefects,
        saveStateToLocalStorage: () => { saves.n += 1; },
        isDraggingPin: false,
        isDraggingPinGroup: false
    };
    vm.createContext(flow);
    const fnNames = ['gridLib', 'getMemberNameApi', 'memberNameOut', 'getGridFloorKey', 'getGridCtx', 'getCurrentFloorGrid', 'gridHasLines',
        'currentGridHasLines', 'gridMemberName', 'computeGridAutoLocationForPoints', 'gridNum', 'getDefectGridPoints',
        'migrateLegacyGridLocation', 'refreshGridLocHintInModal', 'applyGridAutoLocationToDefect', 'gridLocStampOf',
        'scheduleGridLocFreshness', 'refreshStaleGridLocForCurrentFloor', 'gridModalMember', 'refreshGridAutoLocationInModal'];
    vm.runInContext(`const gridLocStampMap = new WeakMap();\n${fnNames.map(takeFn).join('\n')}\n`
        + `this.api = { applyGridAutoLocationToDefect, refreshStaleGridLocForCurrentFloor, computeGridAutoLocationForPoints };`, flow);
    const A = flow.api;
    // 1) 핀을 찍을 때는 부재가 비어 있음 → 보통 규칙(폭 밖 → 두 축 범위)
    const pin = { id: 'p1', x: 1400, y: 900, targetX: 1300, targetY: 1000, component: '', location: '1F 거실' };
    floorDefects.push(pin);
    A.applyGridAutoLocationToDefect(pin);
    assert.strictEqual(pin.gridLoc, 'A1~A2/Y1~Y2', '부재 없음: 범위');
    assert.strictEqual(A.refreshStaleGridLocForCurrentFloor(), 0, '방금 계산한 값은 다시 안 바꿈');
    // 2) 부재를 조사표 칸/일괄 수정/다른 기기에서 보(G)로 → 다음 그리기 때 거더 규칙(가까운 A1 = 300 < Y 500)
    pin.component = '보(G)';
    assert.strictEqual(A.refreshStaleGridLocForCurrentFloor(), 1, '부재가 바뀐 마킹만 다시 계산');
    assert.strictEqual(pin.gridLoc, 'A1/Y1~Y2', '거더: 폭 밖이면 가까운 열 하나');
    assert.strictEqual(pin.location, '1F 거실', '상세 위치(실 이름)는 그대로');
    assert.strictEqual(A.refreshStaleGridLocForCurrentFloor(), 0);
    // 3) 이름 표기 여러 가지
    [['보 (G)', 'A1/Y1~Y2'], ['보（G）', 'A1/Y1~Y2'], ['큰보', 'A1/Y1~Y2'], ['철골거더', 'A1/Y1~Y2'], ['철골보(G)', 'A1/Y1~Y2'],
        ['보', 'A1~A2/Y1~Y2'], ['슬래브', 'A1~A2/Y1~Y2'], ['보(B)', 'A1~A2/Y1~Y2']].forEach(([m, want]) => {
        pin.component = m;
        A.refreshStaleGridLocForCurrentFloor();
        assert.strictEqual(pin.gridLoc, want, `부재 ${m}`);
    });
    // 4) 폭 안이면 거더도 보통 규칙
    const inBand = { id: 'p2', targetX: 1995, targetY: 1000, component: '보(G)' };
    floorDefects.push(inBand);
    A.refreshStaleGridLocForCurrentFloor();
    assert.strictEqual(inBand.gridLoc, 'A2/Y1~Y2', '거더 폭 안');
    // 5) 예전 규칙으로 저장된 옛값(지문 없음)도 고침 — 예: 새로고침 뒤
    const stale = { id: 'p3', targetX: 2600, targetY: 1400, component: '철골보(G)', gridLoc: 'A2~A3, Y1~Y2' };
    floorDefects.push(stale);
    A.refreshStaleGridLocForCurrentFloor();
    assert.strictEqual(stale.gridLoc, 'A2~A3/Y2', '옛 범위값 → 가까운 행 선(100 < 400)');
    // 6) 마킹 추가(묶음)로 생긴 화살표는 gridLoc 없이 생김 → 채워짐
    const member2 = { id: 'p4', groupId: 'p3', targetX: 3300, targetY: 600, component: '철골보(G)' };
    floorDefects.push(member2);
    A.refreshStaleGridLocForCurrentFloor();
    assert.strictEqual(member2.gridLoc, 'A3~/Y1', '묶음 화살표도 계산(Y1까지 100 < A3까지 300)');
    // 7) 선을 옮기면 다시 계산
    flow.state.floorGridLines.b1_1F.groups[0].lines[0].pts.forEach((p) => { p.x = 1350; });
    assert.ok(A.refreshStaleGridLocForCurrentFloor() >= 1, '선 이동 → 다시 계산');
    assert.strictEqual(pin.gridLoc, '~A1/Y1~Y2', '보(B) 핀(1300)이 옮긴 A1(1350) 바깥');
    pin.component = '보(G)';
    A.refreshStaleGridLocForCurrentFloor();
    assert.strictEqual(pin.gridLoc, 'A1/Y1~Y2', '거더: 옮긴 A1까지 50');
    // 8) 자동 입력 끄면 안 건드림
    flow.state.floorGridLines.b1_1F.autoLocation = false;
    pin.component = '';
    assert.strictEqual(A.refreshStaleGridLocForCurrentFloor(), 0, '자동 입력 꺼짐');
    assert.strictEqual(pin.gridLoc, 'A1/Y1~Y2');
    flow.state.floorGridLines.b1_1F.autoLocation = true;
    // 「위치칸 비우고 행·열 다시 채우기」: 위치칸 비움 + gridLoc 다시, 되돌리기 기록 한 번
    {
        const hist = { n: 0 };
        const rctx = Object.assign(flow, {
            confirm: (msg) => { rctx._msg = msg; return true; },
            pushDefectHistory: () => { hist.n += 1; },
            afterGridBulkChange: (m) => { rctx._done = m; },
            composeDefectLocation: (room) => (rctx._grade3 ? `지상1층${room ? ' ' + room : ''}` : String(room || '').trim())
        });
        vm.runInContext(`${takeFn('resetGridLocationForCurrentFloor')}\nthis.api.reset = resetGridLocationForCurrentFloor;`, rctx);
        pin.location = '지상1층 거실';
        inBand.location = 'X2, Y3 옛글';
        stale.location = '1F';
        member2.location = '';
        pin.gridLoc = 'X9';
        A.reset();
        assert.strictEqual(hist.n, 1, '되돌리기 기록 한 번');
        assert.ok(/위치칸을 비우고/.test(rctx._msg) && /3개가 지워집니다/.test(rctx._msg), '확인창 개수');
        [pin, inBand, stale, member2].forEach((d) => assert.strictEqual(d.location, '', `1·2종 위치칸 비움: ${d.id}`));
        assert.strictEqual(pin.gridLoc, '~A1/Y1~Y2', 'gridLoc 다시 계산(부재 없음, 옮긴 A1 바깥)');
        rctx._grade3 = true;
        pin.location = '거실';
        A.reset();
        assert.strictEqual(pin.location, '지상1층', '3종: 비운 뒤 층만');
        assert.ok(/층 「지상1층」만 남깁니다/.test(rctx._msg), '3종 안내');
        rctx._grade3 = false;
    }
    // 연결: 조사표 칸·일괄 수정·수정창 칩(G/B 버튼)에서 부재를 바꾸면 다시 계산, 그릴 때 옛값 확인
    assert.ok(app.includes("if (field === 'component' && key === `${state.currentBuildingId}_${state.currentFloor}` && typeof applyGridAutoLocationToDefect === 'function') {"), '조사표 부재 칸');
    assert.ok(app.includes("if (changedFields.has('component') && bulkFloorKey === `${state.currentBuildingId}_${state.currentFloor}` && typeof applyGridAutoLocationToDefect === 'function') {"), '일괄 수정 부재');
    assert.ok(takeFn('syncDefectComboFields').includes('setTimeout(refreshGridAutoLocationInModal, 0);'), '수정창 칩·G/B 버튼');
    assert.ok(takeFn('drawFloorGridOverlay').includes('scheduleGridLocFreshness();'), '그릴 때 옛값 갱신 예약');
    assert.ok(takeFn('applyGridAutoLocationToModal').includes('const live = computeGridAutoLocationForPoints(window._gridModalPts'), '수정창은 지금 선·부재로 계산해 표시');

    // ---- 「다른 층으로 복사」(앱 함수 그대로) ----
    assert.ok(app.includes('data-act="copyFloors"') && app.includes('>다른 층으로 복사</button>'), '패널 버튼');
    assert.ok(app.includes("if (act === 'copyFloors') { openGridCopyModal(); return; }"), '버튼 연결');
    assert.ok(takeFn('drawFloorGridOverlay').includes('resolvePendingGridScaleForCurrentFloor();'), '그릴 때 복사해 온 선을 도면 크기에 맞춤');
    assert.ok(takeFn('refreshStaleGridLocForCurrentFloor').includes('grid.pendingScale && !resolvePendingGridScaleForCurrentFloor()'), '크기 맞추기 전에는 위치 계산 미룸');
    assert.ok(takeFn('confirmGridCopyModal').includes('confirm(') && takeFn('confirmGridCopyModal').includes('덮어쓸까요?'), '선 있는 층은 덮어쓰기 확인');
    assert.ok(takeFn('confirmGridCopyModal').includes('개 층에 행·열 복사 완료'), '완료 알림');
    assert.ok(!/fetch|firestore|db\.|readFloorSyncBundle|\.get\(\)/i.test(takeFn('copyCurrentGridToFloors')), '복사는 서버를 읽지 않음');
    {
        const cst = { saves: 0 };
        const cctx = {
            G,
            console,
            window: { BSA: { gridLines: G }, getBuildingAvailableFloors: (b) => b.floorsList },
            state: {
                currentBuildingId: 'b1',
                currentFloor: '1F',
                currentBuilding: { id: 'b1', floorsList: [
                    { floorCode: '1F', floorLabel: '지상 1층' }, { floorCode: '2F', floorLabel: '지상 2층' },
                    { floorCode: '3F', floorLabel: '지상 3층' }, { floorCode: '외부', floorLabel: '외부' }
                ] },
                bgImage: {},
                floorPlanRef: { bldgId: 'b1', floorCode: '1F', w: 4000, h: 3000 },
                floorGridLines: {
                    b1_1F: { autoLocation: false, groups: [
                        { axis: 'col', prefix: 'A', start: 0, band: 24, lines: [vline(1000, { label: 'C1', band: 30 }), vline(2000)] },
                        { axis: 'row', prefix: 'Y', start: 1, band: 20, lines: [hline(600)] }
                    ] },
                    b1_2F: { refW: 2000, refH: 3000, groups: [{ axis: 'col', lines: [vline(10)] }] }
                }
            },
            getFloorMapStyleKey: (b, f) => `${b}_${f}`,
            getFloorPlanDisplayDims: () => ({ w: 4000, h: 3000 }),
            saveStateToLocalStorage: () => { cst.saves += 1; }
        };
        vm.createContext(cctx);
        vm.runInContext(['gridLib', 'getGridFloorKey', 'getCurrentFloorGrid', 'gridHasLines', 'gridHasContent', 'getGridReliableDims', 'getGridSourceDims',
            'listGridCopyTargetFloors', 'copyCurrentGridToFloors'].map(takeFn).join('\n')
            + '\nthis.cp = { list: listGridCopyTargetFloors, copy: copyCurrentGridToFloors };', cctx);
        const lst = cctx.cp.list();
        assert.strictEqual(lst.map((f) => `${f.floorCode}:${f.lineCount}`).join(','), '2F:1,3F:0,외부:0', '지금 층 빼고 같은 건물 층 + 선 개수');
        const r = cctx.cp.copy(['2F', '3F', '1F', '2F']);
        assert.strictEqual(r.n, 2, '지금 층·중복 제외');
        assert.strictEqual(r.pending, 1, '크기 모르는 층(3F)은 나중에 맞춤');
        assert.strictEqual(cst.saves, 1, '선 고칠 때와 같은 저장(한 번)');
        const fl = cctx.state.floorGridLines;
        const f2 = G.normalizeGrid(fl.b1_2F);
        assert.strictEqual(f2.groups.length, 2, '덮어쓰기(예전 선 1개 없어짐)');
        assert.strictEqual(f2.autoLocation, false, '자동 입력 설정도 복사');
        assert.strictEqual(f2.groups[0].prefix, 'A');
        assert.strictEqual(f2.groups[0].start, 0);
        assert.strictEqual(f2.groups[0].band, G.defaultBand(2000, 3000), '기본 폭(원본 도면 기본값) → 대상 도면 기본값');
        assert.strictEqual(f2.groups[1].band, 13.3, '직접 준 그룹 폭은 짧은 변 비율');
        assert.strictEqual(f2.groups[0].lines[0].label, 'C1', '선 이름');
        assert.strictEqual(f2.groups[0].lines[0].band, 20, '선 폭(30 × 2000/3000)');
        assert.deepStrictEqual(f2.groups[0].lines[0].pts, [{ x: 500, y: 0 }, { x: 500, y: 3000 }], '가로만 절반');
        assert.deepStrictEqual(f2.groups[1].lines[0].pts, [{ x: 0, y: 600 }, { x: 2000, y: 600 }]);
        assert.deepStrictEqual(f2.groups.map((g) => g.lines.map((l) => l.seq)), [[1, 2], [1]], '번호 순서(seq)');
        assert.ok(f2.groups[0].lines[0].id !== 'v1000' && f2.groups[0].id !== fl.b1_1F.groups[0].id, '새 id');
        assert.strictEqual(fl.b1_1F.groups[0].lines[0].id, 'v1000', '원본은 그대로');
        const f3 = G.normalizeGrid(fl.b1_3F);
        assert.deepStrictEqual(f3.pendingScale, { w: 4000, h: 3000 }, '대상 크기 모름 → 원본 크기 기록');
        assert.deepStrictEqual(f3.groups[0].lines[0].pts, [{ x: 1000, y: 0 }, { x: 1000, y: 3000 }], '좌표 그대로');
        assert.ok(!fl.b1_외부, '고르지 않은 층은 안 건드림');
    }

    // ---- 구역(한 도면에 여러 층): 앱에서 선 긋기 → 누른 자리 구역의 그룹, 구역 경계까지, 번호 새로 ----
    assert.ok(app.includes('data-tool="zone"') && app.includes('data-act="zoneAdd"') && app.includes('data-act="zoneRedraw"') && app.includes('data-act="zoneDel"'), '구역 도구·버튼');
    {
        const delFn = takeFn('deleteGridZone');
        assert.strictEqual((delFn.match(/confirm\(/g) || []).length, 2, '구역 삭제: 지울지 + 선도 지울지(아니면 구역 밖으로)');
        assert.ok(delFn.includes('delete g.zoneId;') && delFn.includes('delete grid.zones;'), '선 옮기기 · 구역 없으면 키 삭제');
        assert.ok(takeFn('drawFloorGridOverlay').includes('drawGridZones(ctx, grid, zoneDraft)'), '구역은 설정 중에만 그림');
        const zst = { changed: 0 };
        const zctx = {
            G,
            console,
            window: { BSA: { gridLines: G } },
            state: {
                currentBuildingId: 'b1', currentFloor: '1F', rotationAngle: 0,
                floorGridLines: { b1_1F: { groups: [], zones: [
                    { id: 'zA', name: '1F', floorLabel: '1F', rect: { x1: 0, y1: 0, x2: 1900, y2: 3000 } },
                    { id: 'zB', name: '2F', rect: { x1: 2100, y1: 0, x2: 4000, y2: 3000 } }
                ] } }
            },
            getFloorMapStyleKey: (b, f) => `${b}_${f}`,
            getFloorPlanDisplayDims: () => ({ w: 4000, h: 3000 }),
            gridChanged: () => { zst.changed += 1; },
            gridPointerDown() {},
            gridDblClick() {},
            gridCancelDrag() {}
        };
        vm.createContext(zctx);
        vm.runInContext(['gridLib', 'gridEditState', 'getGridFloorKey', 'getGridCtx', 'getCurrentFloorGrid', 'gridFindGroup', 'gridSelectLine',
            'gridEnsureGroup', 'gridAddLineAt'].map(takeFn).join('\n')
            + '\nthis.z = { add: gridAddLineAt, grid: () => getCurrentFloorGrid(false), ge: () => gridEditState() };', zctx);
        [[500, 'zA'], [1500, 'zA'], [2500, 'zB'], [3500, 'zB'], [2000, null]].forEach(([x, want]) => {
            zctx.z.add('col', { x, y: 100 });
            assert.strictEqual(zctx.z.ge().zoneId, want, `x=${x} → 구역 ${want}`);
        });
        zctx.z.add('row', { x: 3000, y: 1000 });
        const zg = zctx.z.grid();
        const cols = zg.groups.filter((g) => g.axis === 'col');
        assert.strictEqual(cols.length, 3, '구역마다 열 그룹 하나 + 구역 밖 하나');
        assert.deepStrictEqual(cols.map((g) => `${g.zoneId || '-'}:${g.lines.length}`), ['zA:2', 'zB:2', '-:1']);
        const rowLine = zg.groups.find((g) => g.axis === 'row').lines[0];
        assert.deepStrictEqual(rowLine.pts.map((q) => [Math.round(q.x), Math.round(q.y)]), [[2100, 1000], [4000, 1000]], '구역 경계까지만 그음');
        assert.strictEqual(zg.groups.find((g) => g.axis === 'row').zoneId, 'zB');
        assert.strictEqual(G.computeGridLocation(zg, [{ x: 1000, y: 500 }], ctx0), 'X1~X2', '1F 구역: X1~X2');
        assert.strictEqual(G.computeGridLocation(zg, [{ x: 3000, y: 500 }], ctx0), 'X1~X2/~Y1', '2F 구역: 번호 새로 X1부터');
        assert.strictEqual(G.computeGridLocation(zg, [{ x: 3800, y: 1500 }], ctx0), 'X2~/Y1~', '2F 구역 끝 밖: X3로 이어지지 않음');
        assert.strictEqual(zst.changed, 6);
    }
}

// ---- 다른 층으로 복사: 순수 함수 ----
{
    const src = G.normalizeGrid({ groups: [
        { axis: 'col', prefix: 'X', start: 1, band: G.defaultBand(W, H), angle: 2, lines: [vline(1000), vline(3000, { label: 'X9' })] },
        { axis: 'row', prefix: 'AY', start: 5, band: 40, lines: [hline(1500, { band: 12 })] }
    ] });
    assert.strictEqual(G.countGridLines(src), 3);
    // 같은 크기: 좌표 그대로, refW 기록
    const same = G.cloneGridForFloor(src, { srcW: W, srcH: H, dstW: W, dstH: H });
    assert.deepStrictEqual(same.groups[0].lines[0].pts, src.groups[0].lines[0].pts);
    assert.strictEqual(same.refW, W);
    assert.ok(!same.pendingScale);
    assert.strictEqual(same.groups[0].angle, 2, '각도 복사');
    assert.strictEqual(same.groups[1].prefix, 'AY');
    assert.strictEqual(same.groups[1].start, 5);
    const ids = new Set();
    [src, same].forEach((g) => g.groups.forEach((gr) => { ids.add(gr.id); gr.lines.forEach((l) => ids.add(l.id)); }));
    assert.strictEqual(ids.size, 10, '그룹·선 id 모두 새로');
    // 크기 다름: 가로·세로 따로, 폭은 짧은 변 비율
    const big = G.cloneGridForFloor(src, { srcW: W, srcH: H, dstW: 8000, dstH: 4500 });
    assert.deepStrictEqual(big.groups[0].lines[1].pts, [{ x: 6000, y: 0 }, { x: 6000, y: 4500 }]);
    assert.strictEqual(big.groups[0].lines[1].label, 'X9');
    assert.strictEqual(big.groups[0].band, G.defaultBand(8000, 4500), '기본 폭 → 대상 기본값');
    assert.strictEqual(big.groups[1].band, 60, '직접 준 폭 40 × 1.5');
    assert.strictEqual(big.groups[1].lines[0].band, 18, '선 폭 12 × 1.5');
    assert.strictEqual(G.computeGridLocation(big, [{ x: 4000, y: 2400 }], { rot: 0, w: 8000, h: 4500 }),
        G.computeGridLocation(src, [{ x: 2000, y: 1600 }], ctx0), '비율대로 맞춘 선 → 같은 칸');
    // 대상 크기 모름: 그대로 + pendingScale → 저장/불러오기(normalize)에도 남고 → 그 층을 열 때 맞춤
    const pend = G.normalizeGrid(JSON.parse(JSON.stringify(G.cloneGridForFloor(src, { srcW: W, srcH: H }))));
    assert.deepStrictEqual(pend.pendingScale, { w: W, h: H });
    assert.deepStrictEqual(pend.groups[0].lines[0].pts, src.groups[0].lines[0].pts);
    const sig0 = G.gridSignature(pend);
    assert.strictEqual(G.resolvePendingScale(pend, 2000, 1500), true);
    assert.ok(!pend.pendingScale && pend.refW === 2000 && pend.refH === 1500);
    assert.deepStrictEqual(pend.groups[0].lines[0].pts, [{ x: 500, y: 0 }, { x: 500, y: 1500 }]);
    assert.notStrictEqual(G.gridSignature(pend), sig0, '맞추면 선 지문이 바뀜 → 마킹 위치 다시 계산');
    assert.strictEqual(G.resolvePendingScale(pend, 100, 100), false, '한 번만');
    // 원본 크기도 모르면 그대로(표시 없음)
    const unk = G.cloneGridForFloor(src, {});
    assert.ok(!unk.pendingScale && !unk.refW);
    assert.deepStrictEqual(unk.groups[1].lines[0].pts, src.groups[1].lines[0].pts);
    // 복사본을 다시 복사(아직 못 맞춘 것) → 그 원본 크기 기준
    const again = G.cloneGridForFloor(G.cloneGridForFloor(src, { srcW: W, srcH: H }), { srcW: 1, srcH: 1, dstW: 2000, dstH: 1500 });
    assert.deepStrictEqual(again.groups[0].lines[0].pts, [{ x: 500, y: 0 }, { x: 500, y: 1500 }]);
    // Firestore: undefined 값 없음
    const hasUndef = (o) => o && typeof o === 'object' && Object.keys(o).some((k) => o[k] === undefined || hasUndef(o[k]));
    [same, big, pend, unk].forEach((g) => assert.ok(!hasUndef(g), 'undefined 없음'));
}

// ---- 구역(한 도면에 여러 층): 순수 함수 ----
{
    const zoned = G.normalizeGrid({
        zones: [
            { id: 'z1', name: '1F', floorLabel: '1F', rect: { x1: 1900, y1: 3000, x2: 0, y2: 0 } }, // 뒤집혀 있어도 정리
            { id: 'z2', name: '2F', rect: { x1: 2100, y1: 0, x2: 4000, y2: 3000 } },
            { id: 'z3', name: '빈 구역', rect: { x1: 3000, y1: 2000, x2: 3900, y2: 2900 } },
            { id: 'bad', name: 'x', rect: { x1: 5, y1: 5, x2: 5, y2: 900 } } // 너비 0 → 버림
        ],
        groups: [
            { axis: 'col', prefix: 'X', start: 1, band: 20, zoneId: 'z1', lines: [vline(500), vline(1500)] },
            { axis: 'col', prefix: 'X', start: 1, band: 20, zoneId: 'z2', lines: [vline(2500), vline(3500)] },
            { axis: 'row', prefix: 'Y', start: 1, band: 20, zoneId: 'z2', lines: [hline(1000)] },
            { axis: 'col', prefix: 'U', start: 1, band: 20, lines: [vline(1950), vline(2050)] },
            { axis: 'col', prefix: 'Q', start: 1, band: 20, zoneId: 'nope', lines: [vline(10)] } // 없는 구역 → 구역 밖
        ]
    });
    assert.strictEqual(zoned.zones.length, 3, '잘못된 구역은 버림');
    assert.deepStrictEqual(zoned.zones[0].rect, { x1: 0, y1: 0, x2: 1900, y2: 3000 });
    assert.strictEqual(zoned.zones[0].floorLabel, '1F', '층 이름 저장');
    assert.ok(!('floorLabel' in zoned.zones[1]), '층 이름 없으면 키 없음');
    assert.ok(!('zoneId' in zoned.groups[3]) && !('zoneId' in zoned.groups[4]), '구역 밖 그룹 · 없는 구역 id 정리');
    assert.strictEqual(loc(zoned, [{ x: 1000, y: 100 }]), 'X1~X2', '1F 구역 선만');
    assert.strictEqual(loc(zoned, [{ x: 3000, y: 100 }]), 'X1~X2/~Y1', '2F 구역: 번호가 X1부터 다시');
    assert.strictEqual(loc(zoned, [{ x: 2600, y: 1500 }]), 'X1~X2/Y1~');
    assert.strictEqual(loc(zoned, [{ x: 3600, y: 100 }]), 'X2~/~Y1', '구역 끝 선 밖 — X3로 이어지지 않음');
    assert.strictEqual(loc(zoned, [{ x: 2000, y: 100 }]), 'U1~U2', '어느 구역에도 없음 → 구역 없는 선');
    assert.strictEqual(loc(zoned, [{ x: 1700, y: 100 }, { x: 2300, y: 100 }, { x: 1700, y: 200 }, { x: 2300, y: 200 }]), 'U1~U2', '영역은 가운데 점 기준');
    assert.strictEqual(loc(zoned, [{ x: 3500, y: 2500 }]), '', '선 없는 구역(작은 구역 우선) → 비움');
    assert.strictEqual(G.zoneAt(zoned, { x: 3500, y: 2500 }).id, 'z3', '겹치면 작은 구역');
    assert.strictEqual(G.zoneForPoints(zoned, [{ x: 0, y: 0 }, { x: 1000, y: 1000 }]).id, 'z1');
    assert.strictEqual(G.computeGridLocation(zoned, [{ x: 2600, y: 1200 }], ctx0, { member: '보(G)' }), 'X1/Y1~', '거더 규칙도 구역 안 선만(가까운 X1 = 100)');
    // 구역 없는 도면은 예전과 같음
    assert.ok(!('zones' in G.normalizeGrid({ groups: [] })), '구역 없으면 zones 키 없음');
    assert.strictEqual(loc(base, [{ x: 1500, y: 1000 }]), 'X1~X2/Y1~Y2');
    // 지문: 구역 범위·소속이 바뀌면 달라짐
    const sigZ = G.gridSignature(zoned);
    const moved = G.normalizeGrid(JSON.parse(JSON.stringify(zoned)));
    moved.zones[1].rect.x1 = 2200;
    assert.notStrictEqual(G.gridSignature(moved), sigZ, '구역 범위 → 지문');
    const unz = G.normalizeGrid(JSON.parse(JSON.stringify(zoned)));
    delete unz.groups[1].zoneId;
    assert.notStrictEqual(G.gridSignature(unz), sigZ, '그룹 소속 → 지문');
    assert.strictEqual(G.GRID_LOC_ALGO, 6, '규칙 버전 6 → 구역 도입 뒤 저장된 값 자동 다시 계산');
    // 편집 도우미
    assert.deepStrictEqual(G.hitZone(zoned, { x: 2103, y: 4 }, 8), { zoneId: 'z2', corner: 0, dist: Math.hypot(3, 4) }, '모서리');
    assert.strictEqual(G.hitZone(zoned, { x: 2104, y: 1500 }, 8).corner, null, '테두리');
    assert.strictEqual(G.hitZone(zoned, { x: 2600, y: 1500 }, 8), null, '안쪽은 안 잡음');
    assert.deepStrictEqual(G.resizeRectCorner({ x1: 0, y1: 0, x2: 10, y2: 10 }, 2, { x: 20, y: 30 }), { x1: 0, y1: 0, x2: 20, y2: 30 });
    assert.deepStrictEqual(G.resizeRectCorner({ x1: 0, y1: 0, x2: 10, y2: 10 }, 0, { x: 15, y: 12 }), { x1: 10, y1: 10, x2: 15, y2: 12 }, '넘어가면 뒤집어 정리');
    assert.deepStrictEqual(G.moveRect({ x1: 0, y1: 0, x2: 10, y2: 10 }, 5, -2), { x1: 5, y1: -2, x2: 15, y2: 8 });
    const clipped = G.makeLineThrough({ x: 3000, y: 1000 }, 'row', 0, ctx0, zoned.zones[1].rect);
    assert.deepStrictEqual(clipped.pts.map((q) => [Math.round(q.x), Math.round(q.y)]), [[2100, 1000], [4000, 1000]], '구역 경계까지');
    // 다른 층으로 복사: 구역도 새 id·같은 비율로
    const zc = G.cloneGridForFloor(zoned, { srcW: W, srcH: H, dstW: 2000, dstH: 3000 });
    assert.strictEqual(zc.zones.length, 3);
    assert.ok(zc.zones.every((z, i) => z.id !== zoned.zones[i].id), '구역 id 새로');
    assert.deepStrictEqual(zc.zones[1].rect, { x1: 1050, y1: 0, x2: 2000, y2: 3000 }, '구역도 가로 절반');
    assert.strictEqual(zc.zones[0].floorLabel, '1F');
    assert.strictEqual(zc.groups[1].zoneId, zc.zones[1].id, '그룹 소속은 새 구역 id로');
    assert.ok(!('zoneId' in zc.groups[3]));
    const zctx2 = { rot: 0, w: 2000, h: 3000 };
    assert.strictEqual(G.computeGridLocation(zc, [{ x: 1300, y: 500 }], zctx2), loc(zoned, [{ x: 2600, y: 500 }]), '복사한 층에서도 같은 칸');
    const zp = G.normalizeGrid(JSON.parse(JSON.stringify(G.cloneGridForFloor(zoned, { srcW: W, srcH: H }))));
    assert.ok(zp.pendingScale && zp.zones.length === 3 && zp.groups[0].zoneId === zp.zones[0].id, '크기 모름: 구역 그대로 + 나중에 맞춤');
    G.resolvePendingScale(zp, 2000, 3000);
    assert.deepStrictEqual(zp.zones[1].rect, { x1: 1050, y1: 0, x2: 2000, y2: 3000 }, '열 때 구역도 맞춤');
    const hasUndef = (o) => o && typeof o === 'object' && Object.keys(o).some((k) => o[k] === undefined || hasUndef(o[k]));
    [zoned, zc, zp].forEach((g) => assert.ok(!hasUndef(g), 'Firestore: undefined 없음'));
}

console.log('test-grid-lines: OK');
