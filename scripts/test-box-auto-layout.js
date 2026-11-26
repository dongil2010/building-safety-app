/**
 * NO. 박스 자동 정리(2026-09-30): 마킹 점은 그대로, 박스만 겹치지 않는 자리로. 같은 입력 = 같은 결과.
 * 겹친 박스만 모드(움직일 수 없는 박스 존중)·통합 묶음(화살표 여럿)·「중요」 크기·회전·앱 연결 확인.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'shared', 'box-auto-layout.js'));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const ext = { l: 30, t: 12, r: 30, b: 12 };
const mk = (id, tx, ty, extra) => Object.assign({ id, cx: tx + 5, cy: ty - 35, ext, targets: [{ x: tx, y: ty }], movable: true }, extra || {});

// 1) 두 박스가 겹침 → 겹침 없어짐, 마킹 점 입력은 그대로
const two = [mk('a', 500, 500), mk('b', 520, 505)];
const snapshot = JSON.stringify(two);
const r1 = L.layoutBoxes(two, { bounds: { w: 2000, h: 1500 } });
assert.ok(r1.before > 0 && r1.after === 0, `겹침 없앰 ${r1.before}→${r1.after}`);
assert.strictEqual(JSON.stringify(two), snapshot, '입력(마킹 점) 안 바꿈');
assert.ok(Object.keys(r1.moves).length >= 1);

// 2) 겹침 없는 박스는 안 움직임
const lone = [mk('x', 300, 300), mk('y', 1200, 900)];
assert.deepStrictEqual(L.layoutBoxes(lone, { bounds: { w: 2000, h: 1500 } }).moves, {});

// 3) 움직일 수 없는 박스(직접 옮김)는 제자리, 다른 박스가 비켜 감
const fixed = [mk('m', 500, 500, { movable: false }), mk('n', 510, 500)];
const r3 = L.layoutBoxes(fixed, { bounds: { w: 2000, h: 1500 } });
assert.ok(!r3.moves.m && r3.moves.n && r3.after === 0);

// 4) 박스가 다른 마킹 점을 가리면 비킴
const cover = [mk('p', 500, 500), { id: 'q', cx: 800, cy: 800, ext, targets: [{ x: 505, y: 466 }], movable: false }];
const conf = L.conflictsAtCurrent(cover, {});
assert.ok(conf.p > 0);
const r4 = L.layoutBoxes(cover, {});
assert.ok(r4.moves.p && r4.after < r4.before);

// 5) 통합 묶음: 화살표 둘 → 박스 하나(결과도 하나)
const grp = [{ id: 'g', cx: 600, cy: 600, ext, targets: [{ x: 560, y: 640 }, { x: 640, y: 640 }], movable: true }, mk('h', 600, 620)];
const r5 = L.layoutBoxes(grp, { bounds: { w: 2000, h: 1500 } });
assert.strictEqual(r5.after, 0);

// 6) 같은 입력이면 같은 결과, 수백 개도 빠르게
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const many = [];
for (let i = 0; i < 400; i++) { const tx = 100 + rnd() * 3800; const ty = 100 + rnd() * 2800; many.push(mk('d' + i, tx, ty)); }
const t0 = Date.now();
const ra = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 } });
const ms = Date.now() - t0;
const rb = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 } });
assert.strictEqual(JSON.stringify(ra.moves), JSON.stringify(rb.moves), '결정적');
assert.ok(ra.after < ra.before / 4, `많이 줄어듦 ${ra.before}→${ra.after}`);
assert.ok(ms < 3000, `빠름 ${ms}ms`);

// 7) 범례 등 가림막·도면 밖 피함
const ob = [mk('o', 100, 100)];
const r7 = L.layoutBoxes(ob, { bounds: { w: 2000, h: 1500 }, obstacles: [{ x1: 0, y1: 0, x2: 200, y2: 90 }] });
assert.ok(r7.moves.o && r7.after === 0);

// 8) 「중요」 글자·회전 반영한 박스 크기
assert.deepStrictEqual(L.boxExtent(60, 24, 0, null), { l: 30, t: 12, r: 30, b: 12 });
const eb = L.boxExtent(60, 24, 0, { w: 20, h: 8 });
assert.ok(eb.l === 40 && eb.t === 16 && eb.r === 30 && eb.b === 12, JSON.stringify(eb));
const er = L.boxExtent(60, 24, 0, { w: 20, h: 8, right: 12 });
assert.ok(er.l === 40 && er.t === 16 && er.r === 42 && er.b === 12, '균열폭 우측 여백 ' + JSON.stringify(er));
const e90 = L.boxExtent(60, 24, 90, null);
assert.ok(Math.abs(e90.l - 12) < 1e-9 && Math.abs(e90.t - 30) < 1e-9, '90° 회전은 가로·세로 바뀜');
// 기하
assert.ok(L.segCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }));
assert.ok(!L.segCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }), '같은 끝점은 교차 아님');
assert.ok(L.segHitsRect({ x: 0, y: 5 }, { x: 20, y: 5 }, { x1: 5, y1: 0, x2: 15, y2: 10 }));

// 9) 45°(2026-11-11): 「모든 박스」(fresh)는 지시선이 45° 대각선에 가깝게 놓고(방사형 아님 — 어느 대각선이든), 점 가림·지시선 교차가 없어야 함
{
    const W2 = 2000; const H2 = 1500;
    let sd = 7; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const pts = [];
    for (let i = 0; i < 60; i++) pts.push(mk('r' + i, 100 + rn() * (W2 - 200), 100 + rn() * (H2 - 200)));
    const rr = L.layoutBoxes(pts, { bounds: { w: W2, h: H2 }, fresh: true });
    assert.strictEqual(rr.after, 0, `충돌 없음 ${rr.before}→${rr.after}`);
    const placedAt = (it) => rr.moves[it.id] || { x: it.cx, y: it.cy };
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    // 지시선(점 → 박스에서 가장 가까운 점)이 가장 가까운 45° 대각선에서 벗어난 각도
    let devSum = 0; let exact45 = 0;
    const leads = pts.map((it) => {
        const m = placedAt(it); const T = it.targets[0];
        const ax = cl(T.x, m.x - ext.l, m.x + ext.r); const ay = cl(T.y, m.y - ext.t, m.y + ext.b);
        const d = Math.abs(Math.atan2(Math.abs(ay - T.y), Math.abs(ax - T.x)) - Math.PI / 4);
        devSum += d;
        if (d < 1e-6) exact45 += 1;
        // 박스가 어떤 마킹 점도 가리지 않음
        pts.forEach((o) => {
            const q = o.targets[0];
            assert.ok(!(q.x > m.x - ext.l && q.x < m.x + ext.r && q.y > m.y - ext.t && q.y < m.y + ext.b), `박스가 점을 가림 ${it.id}/${o.id}`);
        });
        return { a: { x: ax, y: ay }, b: T };
    });
    assert.ok(devSum / pts.length < 5 * Math.PI / 180, `45° 대각선 평균 편차 ${(devSum / pts.length * 57.3).toFixed(1)}°`);
    assert.ok(exact45 >= pts.length * 0.8, `대부분 딱 45° (${exact45}/${pts.length})`);
    for (let i = 0; i < leads.length; i++) {
        for (let j = i + 1; j < leads.length; j++) assert.ok(!L.segCross(leads[i].a, leads[i].b, leads[j].a, leads[j].b), `지시선 교차 ${i}/${j}`);
    }
    // 한 점: 지금 박스가 있는 쪽(오른쪽 위) 대각선으로, 지시선은 딱 45°
    const one = L.layoutBoxes([mk('s', 1500, 1100)], { bounds: { w: W2, h: H2 }, fresh: true }).moves.s;
    assert.ok(one && one.x > 1500 && one.y < 1100, '지금 있는 쪽 대각선 ' + JSON.stringify(one));
    assert.ok(Math.abs((one.x - ext.l - 1500) - (1100 - (one.y + ext.b))) < 1e-6, '지시선 45° ' + JSON.stringify(one));
}

// 2026-11-24 새 마킹 첫 자리: 다른 박스와 겹치면 새 박스만 옮김(다른 박스·마킹 점은 그대로)
{
    const others = [mk('o1', 500, 500), mk('o2', 900, 500)];
    const othersSnap = JSON.stringify(others);
    // 겹치지 않는 자리 → 그대로
    const free = L.placeNewBox(others, mk('new', 1400, 900), { bounds: { w: 2000, h: 1500 } });
    assert.ok(free && !free.moved && free.x === 1405 && free.y === 865, '안 겹치면 그대로 ' + JSON.stringify(free));
    // o1 박스 바로 옆에 찍음 → 박스가 겹치니 옮긴다
    const item = mk('new', 515, 505);
    const r = L.placeNewBox(others, item, { bounds: { w: 2000, h: 1500 } });
    assert.ok(r && r.moved && r.before > 0 && r.after === 0, '겹침 없는 자리로 ' + JSON.stringify(r));
    assert.strictEqual(JSON.stringify(others), othersSnap, '다른 마킹 입력 안 바꿈');
    assert.deepStrictEqual(item.targets, [{ x: 515, y: 505 }], '화살표 끝(찍은 점) 그대로');
    const placedAll = others.map((o) => Object.assign({}, o, { movable: false }))
        .concat([Object.assign({}, item, { cx: r.x, cy: r.y, movable: false })]);
    const c2 = L.conflictsAtCurrent(placedAll, { bounds: { w: 2000, h: 1500 } });
    assert.ok(!c2.o1 && !c2.o2 && !c2.new, '옮긴 뒤 아무 충돌 없음 ' + JSON.stringify(c2));
    assert.ok(Math.hypot(r.x - 515, r.y - 505) < 300, '가까운 자리 ' + JSON.stringify(r));
    // 같은 입력 같은 결과
    assert.deepStrictEqual(L.placeNewBox(others, mk('new', 515, 505), { bounds: { w: 2000, h: 1500 } }), r);
    // 영역 마킹 박스
    const ar = L.placeNewBox(others, { id: 'na', cx: 505, cy: 470, ext, targets: [{ rect: { x1: 470, y1: 480, x2: 540, y2: 520 } }] }, { bounds: { w: 2000, h: 1500 } });
    assert.ok(ar && ar.moved && ar.after < ar.before, '영역 박스도 비켜 감');
    assert.strictEqual(L.placeNewBox(others, null, {}), null);
}

// 2026-11-24 도면 선·글자(잉크) 피하기: 박스 숫자가 도면 위에 안 올라가게 빈 곳 우선
{
    // 가짜 도면(이미지 2000×1500 → 잉크 지도 500×375): 흰 바탕, 오른쪽 위(점 기준)에 글자 덩어리처럼 까만 판
    const IW = 2000; const IH = 1500; const cw = 500; const ch = 375; const k = cw / IW;
    const rgba = new Uint8ClampedArray(cw * ch * 4).fill(255);
    const paint = (x1, y1, x2, y2, v) => {
        for (let y = Math.floor(y1 * k); y < Math.ceil(y2 * k); y++) {
            for (let x = Math.floor(x1 * k); x < Math.ceil(x2 * k); x++) {
                const q = (y * cw + x) * 4; rgba[q] = rgba[q + 1] = rgba[q + 2] = v;
            }
        }
    };
    paint(1000, 300, 1400, 500, 0); // 점(1000,500)의 오른쪽 위 = 지금 박스 쪽 대각선
    // 얇은 선(가로·세로)도 잉크
    paint(0, 1200, 2000, 1204, 0);
    const ink = L.buildInkMap(rgba, cw, ch, IW, IH);
    assert.ok(ink && ink.I.length === (cw + 1) * (ch + 1), '잉크 지도');
    assert.ok(L.inkDensity(ink, { x1: 1100, y1: 350, x2: 1300, y2: 450 }) > 0.95, '까만 판 안 = 잉크');
    assert.ok(L.inkDensity(ink, { x1: 100, y1: 100, x2: 300, y2: 200 }) < 0.01, '빈 곳 = 0');
    const half = L.inkDensity(ink, { x1: 900, y1: 350, x2: 1100, y2: 450 });
    assert.ok(half > 0.4 && half < 0.6, '반쯤 걸치면 반 ' + half);
    assert.ok(L.inkDensity(ink, { x1: 0, y1: 1190, x2: 2000, y2: 1214 }) > 0.1, '가는 선도 셈');
    assert.strictEqual(L.inkDensity(ink, { x1: 5000, y1: 5000, x2: 6000, y2: 6000 }), 0, '도면 밖 = 0');
    assert.strictEqual(L.buildInkMap(null, 10, 10, 100, 100), null);
    assert.strictEqual(L.buildInkMap(new Uint8Array(4), 10, 10, 100, 100), null, '크기 안 맞으면 null');
    // 누런 스캔 바탕(밝기 200)은 잉크 아님
    const yel = new Uint8ClampedArray(40 * 30 * 4);
    for (let q = 0; q < yel.length; q += 4) { yel[q] = 215; yel[q + 1] = 205; yel[q + 2] = 160; yel[q + 3] = 255; }
    const yInk = L.buildInkMap(yel, 40, 30, 400, 300);
    assert.ok(L.inkDensity(yInk, { x1: 0, y1: 0, x2: 400, y2: 300 }) < 0.01, '바탕색은 잉크 아님');

    // 「모든 박스」: 잉크 없으면 지금 쪽(오른쪽 위) 45° → 까만 판 위. 잉크 주면 빈 대각선으로
    const it = mk('ink1', 1000, 500);
    const noInk = L.layoutBoxes([it], { bounds: { w: IW, h: IH }, fresh: true }).moves.ink1;
    const boxAt = (m) => ({ x1: m.x - ext.l, y1: m.y - ext.t, x2: m.x + ext.r, y2: m.y + ext.b });
    assert.ok(noInk && L.inkDensity(ink, boxAt(noInk)) > 0.5, '잉크 모르면 판 위 ' + JSON.stringify(noInk));
    const withInk = L.layoutBoxes([it], { bounds: { w: IW, h: IH }, fresh: true, ink }).moves.ink1;
    assert.ok(withInk && L.inkDensity(ink, boxAt(withInk)) < 0.01, '잉크 피해 빈 곳 ' + JSON.stringify(withInk));
    assert.ok(Math.hypot(withInk.x - 1000, withInk.y - 500) < 300, '그래도 가까운 자리');
    // 잉크는 「충돌」 수에 안 셈(겹친 박스만 모드에서 멀쩡한 박스를 괜히 안 움직임)
    assert.deepStrictEqual(L.conflictsAtCurrent([mk('c1', 1150, 435)], { bounds: { w: IW, h: IH }, ink }), { c1: 0 });
    assert.deepStrictEqual(L.layoutBoxes([mk('c1', 1150, 435, { movable: false })], { ink }).moves, {});
    // 겹침 풀기는 그대로 되고, 옮겨 간 자리는 빈 곳
    const pair = [mk('pa', 1000, 500, { movable: false }), mk('pb', 1010, 505)];
    const rp = L.layoutBoxes(pair, { bounds: { w: IW, h: IH }, ink });
    assert.ok(rp.after === 0 && rp.moves.pb && L.inkDensity(ink, boxAt(rp.moves.pb)) < 0.05, '겹침 풀고 빈 곳 ' + JSON.stringify(rp.moves.pb));
    // 수백 개 + 잉크도 빠르게, 결정적
    const big = new Uint8ClampedArray(1000 * 750 * 4);
    let sd2 = 11; const rn2 = () => (sd2 = (sd2 * 16807) % 2147483647) / 2147483647;
    for (let q = 0; q < big.length; q += 4) { const v = rn2() < 0.15 ? 0 : 255; big[q] = big[q + 1] = big[q + 2] = v; big[q + 3] = 255; }
    const tInk0 = Date.now();
    const bigInk = L.buildInkMap(big, 1000, 750, 4000, 3000);
    const r1i = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 }, ink: bigInk });
    const msInk = Date.now() - tInk0;
    const r2i = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 }, ink: bigInk });
    assert.strictEqual(JSON.stringify(r1i.moves), JSON.stringify(r2i.moves), '잉크 있어도 결정적');
    assert.ok(r1i.after < r1i.before / 4, `잉크 있어도 겹침 줄임 ${r1i.before}→${r1i.after}`);
    assert.ok(msInk < 3000, `잉크 포함 빠름 ${msInk}ms`);
}

// 2026-11-24 현장 제보: 가는 이중 벽선(줄이면 옅은 회색 1px) 위에 박스 — 「겹친 박스만」에서도 비켜야 함
{
    const IW = 6000; const IH = 4000; const pw = 2560; const ph = Math.round(IH * pw / IW); // 앱처럼 긴 변 2560
    const k = pw / IW;
    const px = new Uint8ClampedArray(pw * ph * 4).fill(255);
    const vline = (ix, lum) => { const x = Math.round(ix * k); for (let y = 0; y < ph; y++) { const q = (y * pw + x) * 4; px[q] = px[q + 1] = px[q + 2] = lum; } };
    vline(3000, 185); vline(3020, 185); // 이중 벽선, 줄여서 옅어짐
    const ink = L.buildInkMap(px, pw, ph, IW, IH, { pool: 2 });
    assert.ok(ink.cw === pw / 2, '2×2 묶음');
    const e2 = { l: 110, t: 40, r: 110, b: 40 }; // 크게 키운 박스
    const onWall = { id: 'w15', cx: 3000, cy: 1000, ext: e2, targets: [{ x: 3300, y: 1300 }], movable: true };
    const cur = L.inkAtCurrent([onWall], { ink });
    assert.ok(cur.w15 > L.INK_ON, '벽선 지나는 박스 = 도면 위 ' + cur.w15);
    assert.deepStrictEqual(L.conflictsAtCurrent([onWall], { bounds: { w: IW, h: IH }, ink }), { w15: 0 }, '충돌은 아님');
    const r = L.layoutBoxes([onWall], { bounds: { w: IW, h: IH }, ink });
    assert.ok(r.moves.w15, '옮김');
    const m = r.moves.w15;
    assert.ok(m.x - e2.l > 3025 || m.x + e2.r < 2995, '벽선 밖으로 ' + JSON.stringify(m));
    assert.ok(r.inkBefore === 1 && r.inkAfter === 0, `도면 위 박스 ${r.inkBefore}→${r.inkAfter}`);
    // 잉크 없는 곳 박스는 안 옮김
    assert.ok(L.inkAtCurrent([Object.assign({}, onWall, { cx: 1000 })], { ink }).w15 < L.INK_ON);
}

// 2026-11-24 현장 2차: 「NO.」는 걸쳐도 됨(숫자 칸만), 지시선 길게 빼지 않음, 45°에 안 매임
{
    const IW = 2000; const IH = 1500;
    const blank = () => new Uint8ClampedArray(IW * IH * 4).fill(255);
    const vline = (px, x) => { for (let y = 0; y < IH; y++) { const q = (y * IW + x) * 4; px[q] = px[q + 1] = px[q + 2] = 0; } };
    const hline = (px, y, x1, x2) => { for (let x = x1; x < x2; x++) { const q = (y * IW + x) * 4; px[q] = px[q + 1] = px[q + 2] = 0; } };
    const e = { l: 60, t: 20, r: 60, b: 20 };
    // 숫자 칸 = 박스 오른쪽 절반쯤(가운데 정렬 「NO.10」에서 「NO.」 뺀 부분)
    const dig = L.rectExtent(-5, -12, 55, 12, 0);
    assert.deepStrictEqual(dig, { l: 5, t: 12, r: 55, b: 12 });
    assert.deepStrictEqual(L.rectExtent(-5, -12, 55, 12, 90), { l: 12, t: 55, r: 12, b: 5 }, '90° 회전(boxExtent와 같은 방향)');
    assert.deepStrictEqual(L.rectExtent(-30, -12, 30, 12, 90), L.boxExtent(60, 24, 90, null), 'boxExtent와 일치');
    // 「NO.」 자리(박스 왼쪽)에만 선 → 도면 위 아님, 안 옮김
    const p1 = blank(); vline(p1, 959); vline(p1, 960); vline(p1, 961); // 앱 지도(칸이 이미지 몇 px)처럼 굵게
    const ink1 = L.buildInkMap(p1, IW, IH, IW, IH);
    const it1 = { id: 'n1', cx: 1000, cy: 700, ext: e, inkExt: dig, targets: [{ x: 900, y: 800 }], movable: true };
    assert.ok(L.inkAtCurrent([it1], { ink: ink1 }).n1 < L.INK_ON, 'NO. 위 선은 괜찮음');
    assert.ok(L.inkAtCurrent([Object.assign({}, it1, { inkExt: null })], { ink: ink1 }).n1 > L.INK_ON, '숫자 칸 없으면 박스 전체로 봄');
    assert.deepStrictEqual(L.layoutBoxes([it1], { bounds: { w: IW, h: IH }, ink: ink1 }).moves, {}, 'NO.만 걸치면 그대로');
    // 대각선 네 쪽이 모두 선(가로선 위·아래 가까이) — 옆(수평 쪽)은 비었음 → 45° 아니어도 가까운 옆자리, 지시선 짧게
    const p2 = blank();
    hline(p2, 640, 0, IW); hline(p2, 760, 0, IW); // 점(1000,700) 위·아래 60px
    for (let x = 0; x < IW; x += 7) { if (Math.abs(x - 1000) > 220) { for (let y = 640; y < 760; y += 9) { const q = (y * IW + x) * 4; p2[q] = p2[q + 1] = p2[q + 2] = 0; } } }
    const ink2 = L.buildInkMap(p2, IW, IH, IW, IH);
    const it2 = { id: 'n2', cx: 1100, cy: 650, ext: e, targets: [{ x: 1000, y: 700 }], movable: true };
    const r2 = L.layoutBoxes([it2], { bounds: { w: IW, h: IH }, fresh: true, ink: ink2 }).moves.n2;
    assert.ok(r2, '옮김');
    const box2 = { x1: r2.x - e.l, y1: r2.y - e.t, x2: r2.x + e.r, y2: r2.y + e.b };
    assert.ok(L.inkDensity(ink2, box2) < L.INK_ON, '빈 곳 ' + JSON.stringify(r2));
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const lead = Math.hypot(cl(1000, box2.x1, box2.x2) - 1000, cl(700, box2.y1, box2.y2) - 700);
    assert.ok(lead < 4 * 40, '지시선 짧게 ' + lead.toFixed(0));
    // 박스 수십 개 + 도면: 지시선이 길게 빠지지 않음(대부분 박스 높이 4배 안)
    let sd3 = 5; const rn3 = () => (sd3 = (sd3 * 16807) % 2147483647) / 2147483647;
    const p3 = blank();
    for (let x = 100; x < IW; x += 300) vline(p3, x);
    for (let y = 100; y < IH; y += 250) hline(p3, y, 0, IW);
    const ink3 = L.buildInkMap(p3, IW, IH, IW, IH);
    const its = [];
    for (let i = 0; i < 40; i++) { const tx = 150 + rn3() * 1700; const ty = 150 + rn3() * 1200; its.push({ id: 'k' + i, cx: tx + 70, cy: ty - 40, ext: e, inkExt: dig, targets: [{ x: tx, y: ty }], movable: true }); }
    const r3 = L.layoutBoxes(its, { bounds: { w: IW, h: IH }, fresh: true, ink: ink3 });
    assert.strictEqual(r3.after, 0, '충돌 없음');
    const longs = its.filter((it) => { const m = r3.moves[it.id] || { x: it.cx, y: it.cy }; const T = it.targets[0]; return Math.hypot(cl(T.x, m.x - e.l, m.x + e.r) - T.x, cl(T.y, m.y - e.t, m.y + e.b) - T.y) > 4 * 40; }).length;
    assert.ok(longs <= 2, '긴 지시선 ' + longs + '/40');
    assert.ok(r3.inkAfter <= 4, `숫자 칸 도면 위 ${r3.inkBefore}→${r3.inkAfter}`);
}

// 앱 연결
const app = read('app.js');
const idx = read('index.html');
assert.ok(idx.includes('id="btnBoxAutoLayout"') && idx.includes('id="mobileBtnBoxAutoLayout"'), 'PC·터치 버튼');
assert.ok(idx.indexOf('js/shared/box-auto-layout.js') > 0 && idx.indexOf('js/shared/box-auto-layout.js') < idx.indexOf('src="app.js'));
const blk = app.slice(app.indexOf('function buildBoxAutoLayoutItems('), app.indexOf("window.runMarkingBoxAutoLayout = runMarkingBoxAutoLayout;"));
assert.ok(blk.includes('pickDefectGroupRepresentative(gm)'), '통합 묶음 = 박스 하나');
assert.ok(blk.includes('getBookmarkChromeGlyphHeight(scale)'), '「중요」 글자 크기');
assert.ok(blk.includes("movable: mode === 'all' ? true : !manual"), '직접 옮긴 박스 제외(모든 박스면 포함)');
assert.ok(app.includes("fresh: mode === 'all'"), '모든 박스 = 방사형으로 새로 놓음');
assert.ok(blk.includes('if (typeof pushDefectHistory === \'function\') pushDefectHistory();'), '되돌리기 한 번');
const apply = blk.slice(blk.indexOf('function applyMarkingBoxAutoLayout('));
assert.ok(apply.includes('m.x = mv.x;') && apply.includes('m.y = mv.y;') && !/m\.targetX\s*=|m\.targetY\s*=|m\.area[XY][12]\s*=/.test(apply), '박스 x·y만 바꿈');
assert.ok(apply.includes('touchDefectPositionUpdatedAt(m)'), '동기화 위치 시각');
const dragEnd = app.slice(app.indexOf('박스를 직접 끌어 옮김'), app.indexOf('박스를 직접 끌어 옮김') + 600);
assert.ok(dragEnd.includes('activeDragPin.boxManual = true;'), '직접 옮기면 표시');
assert.ok(/'boxManual'/.test(read('js/core/sync-merge.js')), '표시도 위치와 함께 동기화');
const placeFn = app.slice(app.indexOf('function placeNewMarkingBoxAvoidingOverlap('), app.indexOf('window.placeNewMarkingBoxAvoidingOverlap ='));
assert.ok(placeFn.includes('L.placeNewBox(items, item,') && placeFn.includes("buildBoxAutoLayoutItems(defects, 'all')"), '새 마킹: 이 층 박스 전부를 고정으로');
assert.ok(!/.target[XY]s*=/.test(placeFn), '새 마킹: 화살표 끝 안 바꿈');
const relIdx = app.indexOf('2026-11-24 첫 마킹: 박스가 다른 마킹과 겹치면');
assert.ok(relIdx > 0, '점 마킹 손 뗄 때 연결');
const rel = app.slice(relIdx, relIdx + 2000);
assert.ok(rel.includes('!getActiveMarkingGroup()?.groupId') && rel.includes('liveBoxImgX = placed.x;') && rel.indexOf('placeNewMarkingBoxAvoidingOverlap') < rel.indexOf('openAddDefectModal(liveBoxImgX'), '묶음 제외, 창 열기 전에 박스만 옮김');
assert.ok(app.includes('2026-11-24 첫 영역 마킹') && app.includes('areaPlaced ? areaPlaced.x : boxPos.boxX'), '영역 마킹 연결');
assert.ok(app.includes('function boxAutoLayoutInkMap()') && app.includes('L.buildInkMap(cx.getImageData('), '앱: 도면 잉크 지도');
assert.ok(app.includes("fresh: mode === 'all', ink: boxAutoLayoutInkMap()"), '박스 정리에 잉크 넘김');
assert.ok(placeFn.includes('ink: boxAutoLayoutInkMap()'), '새 마킹 자리에도 잉크');
assert.ok(app.includes('{ pool })') && app.includes('2560 / Math.max(dims.w, dims.h)'), '가는 선 안 사라지게 크게 그려 묶음');
assert.ok(app.includes('inkExt: pinDigitsInkExt(label, dims, rot)') && app.includes('function pinDigitsInkExt('), '숫자 칸만 잉크로 봄');
assert.ok(app.includes('L.inkAtCurrent(items, opts)') && app.includes("!((inkNow[it.id] || 0) > inkOn)"), '겹친 박스만: 도면 위 박스도 옮김');
// 2026-11-26 지시선은 화면처럼 박스 **모서리**에서 — 테두리 가장 가까운 점으로 보면 놓치던 「다른 마킹 점 지남」을 잡는다
{
    const le = { l: 100, t: 25, r: 100, b: 25, shape: 'rect' };
    // 박스 A(가운데 500,100) → 점 (450,348): 모서리(400,125)에서 나감(예전 계산은 (450,125) 수직선). 그 선 위에 B의 점
    const tB = { x: 420, y: 125 + (348 - 125) * 0.4 };
    const A = { id: 'A', cx: 500, cy: 100, ext: le, lead: le, targets: [{ x: 450, y: 348 }], movable: false };
    const B = { id: 'B', cx: 100, cy: 214, ext: le, lead: le, targets: [tB], movable: true };
    const plain = L.conflictsAtCurrent([Object.assign({}, A, { lead: null }), Object.assign({}, B, { lead: null })], {});
    const corner = L.conflictsAtCurrent([A, B], {});
    assert.ok(!plain.A && corner.A > 0, '모서리 지시선이 다른 점을 지나면 충돌 ' + JSON.stringify({ plain, corner }));
    // 정리 후: 모서리 지시선끼리 안 엇갈림(많은 박스)
    let sd = 11; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const lst = [];
    for (let i = 0; i < 60; i++) { const tx = 200 + rr() * 1600; const ty = 200 + rr() * 1100; lst.push({ id: 'c' + i, cx: tx + 120, cy: ty - 60, ext: le, lead: le, targets: [{ x: tx, y: ty }], movable: true }); }
    const rc = L.layoutBoxes(lst, { bounds: { w: 2000, h: 1500 }, fresh: true });
    assert.ok(rc.after < rc.before, `모서리 지시선 기준 충돌 줄임 ${rc.before}→${rc.after}`);
    const after = L.conflictsAtCurrent(lst.map((it) => Object.assign({}, it, rc.moves[it.id] ? { cx: rc.moves[it.id].x, cy: rc.moves[it.id].y } : {})), { bounds: { w: 2000, h: 1500 } });
    assert.strictEqual(Object.values(after).reduce((s, v) => s + v, 0), rc.after, '결과 충돌 수 = 다시 센 값');
    assert.ok(app.includes("lead: Object.assign(L.boxExtent(dims.w, dims.h, rot, null), { shape:"), '앱: 박스 모서리·모양 넘김');
}

console.log('test-box-auto-layout: ok');
