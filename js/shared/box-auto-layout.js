/**
 * NO. 박스(번호칸) 자동 정리 — 순수 계산 모듈 (DOM 없음, 2026-09-30)
 *
 * 마킹 점(화살표 끝)·영역은 절대 안 움직이고 박스 자리만 고른다.
 * - 후보: 박스마다 기준점(화살표 끝들의 가운데) 둘레 8방향 × 거리 4단계 + 지금 자리.
 * - 비용: 박스끼리 겹침, 박스가 마킹 점을 가림, 박스가 다른 지시선을 가림(또는 내 지시선이 다른 박스를 지남),
 *         지시선끼리 교차, 지시선 길이, 도면 밖, 지금 자리에서 옮긴 거리(작게 — 이유 없이 안 움직이게).
 * - 탐욕 배치(붐비는 박스부터) → 개선 몇 번. 같은 입력이면 늘 같은 결과(난수 없음, 동점은 후보 순서).
 * - 이웃(닿을 수 있는 범위가 겹치는 박스)만 비교해 수백 개도 빠르게.
 *
 * 입력 item: {
 *   id, cx, cy,                 지금 박스 가운데(이미지 좌표)
 *   ext: { l, t, r, b },        가운데에서 박스 왼·위·오른·아래 끝까지(이미지 좌표, 「중요」 글자·회전 포함)
 *   targets: [{ x, y }] 또는 [{ rect: { x1, y1, x2, y2 } }](영역: 지시선이 영역 테두리에 꽂힘),
 *   movable: bool
 * }
 * opts: { bounds: { w, h }, obstacles: [{ x1, y1, x2, y2 }](범례 등 — 박스가 피함), unit(박스 높이 기준, 없으면 중앙값) }
 * 결과: { moves: { id: { x, y } }, before: 충돌 수, after: 충돌 수, cost }
 */
(function (root) {
    'use strict';

    const W = {
        box: 1000,        // 박스끼리 겹침(1쌍)
        boxArea: 300,     // + 겹친 넓이(단위² 기준)
        point: 800,       // 박스가 마킹 점을 가림(점 하나)
        leaderBox: 400,   // 지시선이 다른 박스를 지남
        cross: 120,       // 지시선끼리 교차
        length: 2,        // 지시선 길이(단위당)
        outside: 2000,    // 도면 밖
        obstacle: 600,    // 범례 등 가림
        area: 40,         // 다른 영역 마킹 위에 올라감(약하게)
        move: 0.25,       // 지금 자리에서 옮긴 거리(단위당)
        stay: 3           // 지금 자리 그대로 두면 덜어 줌(충돌 없는 박스가 괜히 안 움직이게)
    };
    const HARD = 100; // 이보다 큰 비용 항목 = 「충돌」

    function num(v, d) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }

    function rectOf(cx, cy, ext, m) {
        const mm = m || 0;
        return { x1: cx - ext.l - mm, y1: cy - ext.t - mm, x2: cx + ext.r + mm, y2: cy + ext.b + mm };
    }

    function overlapArea(a, b) {
        const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        return w > 0 && h > 0 ? w * h : 0;
    }

    function inRect(p, r) {
        return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
    }

    function clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    /** 박스 가운데에서 가장 가까운 사각형(영역) 테두리 점 */
    function nearestOnRectBorder(p, r) {
        const x = clamp(p.x, r.x1, r.x2);
        const y = clamp(p.y, r.y1, r.y2);
        if (x !== p.x || y !== p.y) return { x, y };
        // 안에 있으면 가장 가까운 변으로
        const d = [p.x - r.x1, r.x2 - p.x, p.y - r.y1, r.y2 - p.y];
        const k = d.indexOf(Math.min.apply(null, d));
        if (k === 0) return { x: r.x1, y: p.y };
        if (k === 1) return { x: r.x2, y: p.y };
        if (k === 2) return { x: p.x, y: r.y1 };
        return { x: p.x, y: r.y2 };
    }

    function targetPoint(t, cx, cy) {
        if (t.rect) return nearestOnRectBorder({ x: cx, y: cy }, t.rect);
        return { x: t.x, y: t.y };
    }

    /** 지시선: 박스 테두리에서 가장 가까운 점 → 마킹 점 */
    function leadersFor(item, cx, cy) {
        const box = rectOf(cx, cy, item.ext, 0);
        return item.targets.map((t) => {
            const p = targetPoint(t, cx, cy);
            const a = { x: clamp(p.x, box.x1, box.x2), y: clamp(p.y, box.y1, box.y2) };
            return { a, b: p };
        });
    }

    function orient(p, q, r) {
        const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0);
    }

    function segCross(a, b, c, d) {
        // 끝점을 공유하면(같은 마킹 점) 교차 아님
        const eq = (u, v) => Math.abs(u.x - v.x) < 1e-6 && Math.abs(u.y - v.y) < 1e-6;
        if (eq(a, c) || eq(a, d) || eq(b, c) || eq(b, d)) return false;
        const o1 = orient(a, b, c);
        const o2 = orient(a, b, d);
        const o3 = orient(c, d, a);
        const o4 = orient(c, d, b);
        return o1 * o2 < 0 && o3 * o4 < 0;
    }

    /** 선분이 사각형 안을 지나는지(Liang–Barsky) — 테두리에 닿기만 하는 건 아님 */
    function segHitsRect(a, b, r) {
        const shrink = 0.5;
        const x1 = r.x1 + shrink; const y1 = r.y1 + shrink; const x2 = r.x2 - shrink; const y2 = r.y2 - shrink;
        if (x2 <= x1 || y2 <= y1) return false;
        let t0 = 0; let t1 = 1;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const clip = (p, q) => {
            if (Math.abs(p) < 1e-12) return q >= 0;
            const t = q / p;
            if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
            return true;
        };
        if (!clip(-dx, a.x - x1) || !clip(dx, x2 - a.x) || !clip(-dy, a.y - y1) || !clip(dy, y2 - a.y)) return false;
        return t1 - t0 > 1e-6;
    }

    function median(arr) {
        const s = arr.slice().sort((x, y) => x - y);
        return s.length ? s[Math.floor(s.length / 2)] : 0;
    }

    function prepare(items, opts) {
        const o = opts || {};
        const list = (items || []).filter((it) => it && it.id != null && Number.isFinite(num(it.cx, NaN)) && Number.isFinite(num(it.cy, NaN)))
            .map((it) => ({
                id: String(it.id),
                cx0: Number(it.cx),
                cy0: Number(it.cy),
                ext: {
                    l: Math.max(1, num(it.ext && it.ext.l, 20)),
                    t: Math.max(1, num(it.ext && it.ext.t, 10)),
                    r: Math.max(1, num(it.ext && it.ext.r, 20)),
                    b: Math.max(1, num(it.ext && it.ext.b, 10))
                },
                targets: (Array.isArray(it.targets) ? it.targets : []).map((t) => {
                    if (t && t.rect) {
                        const r = t.rect;
                        return { rect: { x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2), x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2) } };
                    }
                    return { x: num(t && t.x, NaN), y: num(t && t.y, NaN) };
                }).filter((t) => t.rect || (Number.isFinite(t.x) && Number.isFinite(t.y))),
                movable: !!it.movable
            }));
        const unit = num(o.unit, 0) > 0 ? Number(o.unit) : Math.max(4, median(list.map((it) => it.ext.t + it.ext.b)) || 20);
        const bounds = o.bounds && num(o.bounds.w, 0) > 0 && num(o.bounds.h, 0) > 0 ? { x1: 0, y1: 0, x2: Number(o.bounds.w), y2: Number(o.bounds.h) } : null;
        const obstacles = (Array.isArray(o.obstacles) ? o.obstacles : []).filter((r) => r && [r.x1, r.y1, r.x2, r.y2].every((v) => Number.isFinite(Number(v))));
        return { list, unit, bounds, obstacles };
    }

    function anchorOf(it) {
        const pts = it.targets.map((t) => (t.rect ? { x: (t.rect.x1 + t.rect.x2) / 2, y: (t.rect.y1 + t.rect.y2) / 2 } : t));
        if (!pts.length) return { x: it.cx0, y: it.cy0 };
        return pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
    }

    const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // 위부터 시계 방향
    const DISTS = [1.1, 1.9, 2.9, 4.2, 6];

    function candidatesFor(it, unit, bounds) {
        const out = [{ x: it.cx0, y: it.cy0 }];
        if (!it.movable) return out;
        const a = anchorOf(it);
        // 영역은 영역 테두리 밖에서 시작
        let hw = 0; let hh = 0;
        it.targets.forEach((t) => {
            if (!t.rect) return;
            hw = Math.max(hw, (t.rect.x2 - t.rect.x1) / 2);
            hh = Math.max(hh, (t.rect.y2 - t.rect.y1) / 2);
        });
        DISTS.forEach((dk) => {
            DIRS.forEach(([ux, uy]) => {
                const diag = ux !== 0 && uy !== 0;
                const g = dk * unit * (diag ? 0.72 : 1);
                let x = a.x + ux * (g + hw) + (ux > 0 ? it.ext.l : (ux < 0 ? -it.ext.r : 0));
                let y = a.y + uy * (g + hh) + (uy > 0 ? it.ext.t : (uy < 0 ? -it.ext.b : 0));
                if (bounds) {
                    x = clamp(x, bounds.x1 + it.ext.l, bounds.x2 - it.ext.r);
                    y = clamp(y, bounds.y1 + it.ext.t, bounds.y2 - it.ext.b);
                }
                out.push({ x, y });
            });
        });
        return out;
    }

    function unionRect(a, b) {
        if (!a) return Object.assign({}, b);
        return { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) };
    }

    function pointsOf(it) {
        return it.targets.filter((t) => !t.rect);
    }

    /** item i를 (x,y)에 둘 때 비용 — 이웃의 지금 자리(pos) 기준. placed(j)=false인 이웃은 박스·지시선 무시(점은 늘 있음) */
    function costAt(P, i, x, y, pos, placed, detail) {
        const it = P.list[i];
        const u = P.unit;
        const m = 0.15 * u;
        const box = rectOf(x, y, it.ext, 0);
        const boxM = rectOf(x, y, it.ext, m);
        const leads = leadersFor(it, x, y);
        let cost = 0;
        let hard = 0;
        const pr = 0.5 * u;
        const boxP = rectOf(x, y, it.ext, pr);
        // 내 마킹 점도 가리면 안 됨
        pointsOf(it).forEach((p) => { if (inRect(p, boxP)) { cost += W.point; hard += 1; } });
        leads.forEach((l) => { cost += W.length * Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y) / u; });
        cost += W.move * Math.hypot(x - it.cx0, y - it.cy0) / u;
        if (P.bounds) {
            const inside = overlapArea(box, P.bounds);
            const all = (box.x2 - box.x1) * (box.y2 - box.y1);
            if (inside < all - 1e-6) { cost += W.outside; hard += 1; }
        }
        P.obstacles.forEach((r) => { if (overlapArea(box, r) > 0) { cost += W.obstacle; hard += 1; } });
        const nb = P.neighbors[i];
        for (let k = 0; k < nb.length; k++) {
            const j = nb[k];
            const jt = P.list[j];
            pointsOf(jt).forEach((p) => { if (inRect(p, boxP)) { cost += W.point; hard += 1; } });
            jt.targets.forEach((t) => { if (t.rect && overlapArea(box, t.rect) > 0) cost += W.area; });
            if (!placed[j]) continue;
            const q = pos[j];
            const jb = rectOf(q.x, q.y, jt.ext, 0);
            const jbM = rectOf(q.x, q.y, jt.ext, m);
            const ov = overlapArea(boxM, jbM);
            if (ov > 0) { cost += W.box + W.boxArea * ov / (u * u); hard += 1; }
            const jl = P.leadCache[j];
            jl.forEach((l) => { if (segHitsRect(l.a, l.b, box)) { cost += W.leaderBox; hard += 1; } });
            leads.forEach((l) => {
                if (segHitsRect(l.a, l.b, jb)) { cost += W.leaderBox; hard += 1; }
                jl.forEach((l2) => { if (segCross(l.a, l.b, l2.a, l2.b)) { cost += W.cross; hard += 1; } });
            });
        }
        if (detail) detail.hard = hard;
        return cost;
    }

    function buildNeighbors(P, cands) {
        const n = P.list.length;
        const reach = P.list.map((it, i) => {
            let r = null;
            cands[i].forEach((c) => { r = unionRect(r, rectOf(c.x, c.y, it.ext, 0.5 * P.unit)); });
            it.targets.forEach((t) => {
                r = unionRect(r, t.rect ? t.rect : { x1: t.x - P.unit, y1: t.y - P.unit, x2: t.x + P.unit, y2: t.y + P.unit });
            });
            return r;
        });
        // x 정렬 후 훑기(수백 개도 빠르게)
        const order = reach.map((r, i) => i).sort((a, b) => reach[a].x1 - reach[b].x1 || a - b);
        const nbs = P.list.map(() => []);
        for (let a = 0; a < n; a++) {
            const i = order[a];
            for (let b = a + 1; b < n; b++) {
                const j = order[b];
                if (reach[j].x1 > reach[i].x2) break;
                if (reach[j].y1 <= reach[i].y2 && reach[j].y2 >= reach[i].y1) {
                    nbs[i].push(j);
                    nbs[j].push(i);
                }
            }
        }
        nbs.forEach((l) => l.sort((x, y) => x - y));
        return nbs;
    }

    function countConflicts(P, pos) {
        const placed = P.list.map(() => true);
        let c = 0;
        P.list.forEach((it, i) => {
            const d = {};
            costAt(P, i, pos[i].x, pos[i].y, pos, placed, d);
            c += d.hard;
        });
        return c;
    }

    function conflictsAtCurrent(items, opts) {
        const P = prepare(items, opts);
        const cands = P.list.map((it) => [{ x: it.cx0, y: it.cy0 }]);
        P.neighbors = buildNeighbors(P, cands);
        const pos = P.list.map((it) => ({ x: it.cx0, y: it.cy0 }));
        P.leadCache = P.list.map((it, i) => leadersFor(it, pos[i].x, pos[i].y));
        const placed = P.list.map(() => true);
        const out = {};
        P.list.forEach((it, i) => {
            const d = {};
            costAt(P, i, pos[i].x, pos[i].y, pos, placed, d);
            out[it.id] = d.hard;
        });
        return out;
    }

    function layoutBoxes(items, opts) {
        const P = prepare(items, opts);
        const n = P.list.length;
        const passes = Math.max(0, Math.round(num(opts && opts.passes, 6)));
        const cands = P.list.map((it) => candidatesFor(it, P.unit, P.bounds));
        P.neighbors = buildNeighbors(P, cands);
        const pos = P.list.map((it) => ({ x: it.cx0, y: it.cy0 }));
        P.leadCache = P.list.map((it, i) => leadersFor(it, pos[i].x, pos[i].y));
        const allPlaced = P.list.map(() => true);
        const before = countConflicts(P, pos);
        // 붐비는 박스부터(이웃 많은 순), 같으면 위→아래, 왼→오른, id
        const movers = P.list.map((it, i) => i).filter((i) => P.list[i].movable);
        movers.sort((a, b) => (P.neighbors[b].length - P.neighbors[a].length)
            || (P.list[a].cy0 - P.list[b].cy0) || (P.list[a].cx0 - P.list[b].cx0)
            || (P.list[a].id < P.list[b].id ? -1 : (P.list[a].id > P.list[b].id ? 1 : 0)));
        const placed = P.list.map((it) => !it.movable);
        const pick = (i, pl) => {
            let best = -1; let bestC = Infinity;
            cands[i].forEach((c, k) => {
                const v = costAt(P, i, c.x, c.y, pos, pl) - (k === 0 ? W.stay : 0);
                if (v < bestC - 1e-9) { bestC = v; best = k; }
            });
            return { k: best, cost: bestC };
        };
        const setPos = (i, c) => {
            pos[i] = { x: c.x, y: c.y };
            P.leadCache[i] = leadersFor(P.list[i], c.x, c.y);
        };
        movers.forEach((i) => {
            const r = pick(i, placed);
            if (r.k >= 0) setPos(i, cands[i][r.k]);
            placed[i] = true;
        });
        for (let pass = 0; pass < passes; pass++) {
            let changed = 0;
            movers.forEach((i) => {
                const it = P.list[i];
                const atStart = Math.abs(pos[i].x - it.cx0) < 1e-6 && Math.abs(pos[i].y - it.cy0) < 1e-6;
                const cur = costAt(P, i, pos[i].x, pos[i].y, pos, allPlaced) - (atStart ? W.stay : 0);
                const r = pick(i, allPlaced);
                if (r.k >= 0 && r.cost < cur - 1e-6) {
                    const c = cands[i][r.k];
                    if (Math.abs(c.x - pos[i].x) > 1e-6 || Math.abs(c.y - pos[i].y) > 1e-6) {
                        setPos(i, c);
                        changed += 1;
                    }
                }
            });
            if (!changed) break;
        }
        let after = countConflicts(P, pos);
        // 나빠지면(드묾) 그대로 둠
        if (after > before) {
            P.list.forEach((it, i) => setPos(i, { x: it.cx0, y: it.cy0 }));
            after = before;
        }
        const moves = {};
        P.list.forEach((it, i) => {
            if (Math.hypot(pos[i].x - it.cx0, pos[i].y - it.cy0) > 0.5) moves[it.id] = { x: pos[i].x, y: pos[i].y };
        });
        let cost = 0;
        for (let i = 0; i < n; i++) cost += costAt(P, i, pos[i].x, pos[i].y, pos, allPlaced);
        return { moves, before, after, cost, unit: P.unit };
    }

    /** 가운데 기준 박스 끝 거리(회전 반영). 박스는 화면 기준 수평으로 그려지고(역회전), 「중요」는 화면 왼쪽 위 모서리 */
    function boxExtent(w, h, rotationDeg, badge) {
        const bw = badge ? Math.max(0, num(badge.w, 0)) : 0;
        const bh = badge ? Math.max(0, num(badge.h, 0)) : 0;
        // 화면 기준 사각형(가운데 0,0): 왼쪽·위로 「중요」 글자 반쯤 튀어나옴
        const sx1 = -w / 2 - bw / 2; const sy1 = -h / 2 - bh / 2; const sx2 = w / 2; const sy2 = h / 2;
        const r = ((Math.round(num(rotationDeg, 0) / 90) * 90) % 360 + 360) % 360;
        // 화면 → 이미지: 그릴 때 이미지 좌표에서 -rot 만큼 돌려 그림 → 로컬 (x,y)는 이미지에서 rot(-rot)(x,y)
        const rad = -r * Math.PI / 180;
        const c = Math.round(Math.cos(rad)); const s = Math.round(Math.sin(rad));
        const pts = [[sx1, sy1], [sx2, sy1], [sx2, sy2], [sx1, sy2]].map(([x, y]) => ({ x: x * c - y * s, y: x * s + y * c }));
        const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
        return { l: -Math.min.apply(null, xs), t: -Math.min.apply(null, ys), r: Math.max.apply(null, xs), b: Math.max.apply(null, ys) };
    }

    const api = { layoutBoxes, conflictsAtCurrent, boxExtent, segCross, segHitsRect, WEIGHTS: W, HARD };
    root.BSA = root.BSA || {};
    root.BSA.boxAutoLayout = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
