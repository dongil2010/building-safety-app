/**
 * 도면 행·열(통심) 선 — 순수 계산 모듈 (DOM 없음)
 *
 * 2026-09-28 실험(exp/grid-lines). 도면(층)마다 열(X)·행(Y) 선을 두고, 마킹 점이 어느 칸에 있는지
 * 「X1~X2, Y1~Y2」처럼 위치 글자를 만든다.
 *
 * - 좌표: 선 꼭짓점은 **이미지 좌표**(결함 x/y와 같은 좌표계, 회전 전)로 저장한다.
 *   번호 순서(왼→오른, 위→아래)는 도면을 **화면에 보이는 회전** 기준으로 매긴다.
 * - 선은 꼭짓점 2개 이상인 꺾은선. 각도 자유(꺾인 열·날개동). 같은 축에 그룹을 여러 개 둘 수 있다
 *   (그룹마다 머리글·시작 번호·방향·기본 폭).
 * - 폭(band): 선에서 수직 거리 ≤ 폭/2 안이면 그 선 하나(X2), 아니면 이웃 두 선 사이(X1~X2).
 * - 바깥: 맨 끝 선 밖이면 「X1 외측」.
 * - 부재에 따라(슬래브·보(B)·철골보(B)·빔 — 보통 한 선 위에 안 놓임) 폭을 무시하고 늘 「X1~X2」 범위로 쓴다.
 *   선 폭 안이면 점이 실제로 있는 쪽 칸, 선 위에 딱 걸치면 번호가 작은 쪽 칸(X2 위 → X1~X2, 첫 선이면 X1~X2).
 *   거더(보(G)·철골보(G)·거더)와 G/B 안 정한 그냥 「보」, 접합부는 보통 규칙(폭 안이면 X2).
 */
(function (root) {
    'use strict';

    const AXES = ['col', 'row'];
    const DEFAULT_PREFIX = { col: 'X', row: 'Y' };

    /**
     * 늘 범위로 쓸 부재 — 목록만 고치면 된다(나중에 설정으로 뺄 수 있게 한곳에 둠).
     * 이름은 공백을 빼고 비교. 접합부는 항상 제외.
     */
    const RANGE_ONLY_MEMBER_RULES = {
        exclude: ['접합부'],
        contains: ['슬래브', '슬라브', 'SLAB'],
        endsWith: ['(B)', '빔', 'BEAM'],
        exact: ['작은보']
    };

    function isRangeOnlyMember(name, rules) {
        const r = rules || RANGE_ONLY_MEMBER_RULES;
        const n = String(name == null ? '' : name).replace(/\s+/g, '').toUpperCase();
        if (!n) return false;
        if ((r.exclude || []).some((k) => n.includes(k.toUpperCase()))) return false;
        if ((r.contains || []).some((k) => n.includes(k.toUpperCase()))) return true;
        if ((r.endsWith || []).some((k) => n.endsWith(k.toUpperCase()))) return true;
        return (r.exact || []).some((k) => n === k.toUpperCase());
    }

    function num(v, d) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }

    function uid(prefix) {
        return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    }

    function defaultBand(w, h) {
        const m = Math.min(num(w, 4000), num(h, 3000));
        return Math.max(4, Math.round(m * 0.008));
    }

    function sanitizePts(pts) {
        return (Array.isArray(pts) ? pts : [])
            .map((p) => ({ x: num(p && p.x, NaN), y: num(p && p.y, NaN) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    }

    function createGroup(axis, opts) {
        const o = opts || {};
        const ax = axis === 'row' ? 'row' : 'col';
        return {
            id: o.id || uid('gg'),
            axis: ax,
            prefix: o.prefix != null ? String(o.prefix) : DEFAULT_PREFIX[ax],
            start: Math.round(num(o.start, 1)),
            reverse: !!o.reverse,
            angle: num(o.angle, 0),
            band: Math.max(0, num(o.band, 0)),
            lines: Array.isArray(o.lines) ? o.lines : []
        };
    }

    function normalizeGrid(raw) {
        const g = raw && typeof raw === 'object' ? raw : {};
        const groups = (Array.isArray(g.groups) ? g.groups : []).map((gr) => {
            const out = createGroup(gr && gr.axis, gr || {});
            out.lines = (Array.isArray(gr && gr.lines) ? gr.lines : []).map((ln) => {
                const pts = sanitizePts(ln && ln.pts);
                if (pts.length < 2) return null;
                const line = { id: (ln && ln.id) || uid('gl'), pts };
                if (ln && ln.label != null && String(ln.label).trim()) line.label = String(ln.label).trim();
                if (ln && ln.band != null && ln.band !== '' && Number.isFinite(Number(ln.band))) line.band = Math.max(0, Number(ln.band));
                return line;
            }).filter(Boolean);
            return out;
        });
        return {
            version: 1,
            visible: g.visible !== false,
            autoLocation: g.autoLocation !== false,
            groups
        };
    }

    // ---- 회전(화면에 보이는 방향) ----
    function toDisplay(p, rot, w, h) {
        const r = ((num(rot, 0) % 360) + 360) % 360;
        if (r === 90) return { x: h - p.y, y: p.x };
        if (r === 180) return { x: w - p.x, y: h - p.y };
        if (r === 270) return { x: p.y, y: w - p.x };
        return { x: p.x, y: p.y };
    }

    function toImage(v, rot, w, h) {
        const r = ((num(rot, 0) % 360) + 360) % 360;
        if (r === 90) return { x: v.y, y: h - v.x };
        if (r === 180) return { x: w - v.x, y: h - v.y };
        if (r === 270) return { x: w - v.y, y: v.x };
        return { x: v.x, y: v.y };
    }

    function vecToImage(d, rot) {
        const r = ((num(rot, 0) % 360) + 360) % 360;
        if (r === 90) return { x: d.y, y: -d.x };
        if (r === 180) return { x: -d.x, y: -d.y };
        if (r === 270) return { x: -d.y, y: d.x };
        return { x: d.x, y: d.y };
    }

    function norm(v) {
        const l = Math.hypot(v.x, v.y);
        return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
    }

    /** 축별 선 방향을 한쪽으로 맞춤 — 열: 아래로(+y), 행: 오른쪽으로(+x) (화면 기준) */
    function orientDir(d, axis) {
        if (axis === 'row') return (d.x < 0 || (Math.abs(d.x) < 1e-9 && d.y < 0)) ? { x: -d.x, y: -d.y } : d;
        return (d.y < 0 || (Math.abs(d.y) < 1e-9 && d.x > 0)) ? { x: -d.x, y: -d.y } : d;
    }

    /** 번호가 커지는 쪽 법선 — 열: 오른쪽(+x), 행: 아래(+y) */
    function normalOf(d, axis) {
        return axis === 'row' ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x };
    }

    /** 각도(도) → 화면 방향. 열은 세로에서 시계 방향, 행은 가로에서 시계 방향 */
    function dirFromAngle(axis, angleDeg) {
        const a = num(angleDeg, 0) * Math.PI / 180;
        return axis === 'row' ? { x: Math.cos(a), y: Math.sin(a) } : { x: -Math.sin(a), y: Math.cos(a) };
    }

    function angleFromDir(axis, d) {
        const o = orientDir(norm(d), axis);
        const a = axis === 'row' ? Math.atan2(o.y, o.x) : Math.atan2(-o.x, o.y);
        return Math.round(a * 180 / Math.PI * 10) / 10;
    }

    function groupDir(group, ctx) {
        const acc = { x: 0, y: 0 };
        (group.lines || []).forEach((ln) => {
            const pts = ln.pts || [];
            if (pts.length < 2) return;
            const a = toDisplay(pts[0], ctx.rot, ctx.w, ctx.h);
            const b = toDisplay(pts[pts.length - 1], ctx.rot, ctx.w, ctx.h);
            const d = orientDir(norm({ x: b.x - a.x, y: b.y - a.y }), group.axis);
            acc.x += d.x;
            acc.y += d.y;
        });
        const n = norm(acc);
        if (n.x === 0 && n.y === 0) return orientDir(dirFromAngle(group.axis, group.angle), group.axis);
        return orientDir(n, group.axis);
    }

    /** 부호 있는 거리(화면 좌표). 끝 구간은 무한히 연장, 가운데 꺾인 점은 구간에 묶음 */
    function signedDistance(p, ptsDisp, axis, D) {
        let best = null;
        const last = ptsDisp.length - 2;
        for (let i = 0; i <= last; i++) {
            const a = ptsDisp[i];
            const b = ptsDisp[i + 1];
            let s = norm({ x: b.x - a.x, y: b.y - a.y });
            if (s.x === 0 && s.y === 0) continue;
            if (s.x * D.x + s.y * D.y < 0) s = { x: -s.x, y: -s.y };
            const segLen = Math.hypot(b.x - a.x, b.y - a.y);
            const ax = a.x;
            const ay = a.y;
            // a에서 b 방향으로의 투영(원래 방향 기준)
            const ob = norm({ x: b.x - a.x, y: b.y - a.y });
            let t = (p.x - ax) * ob.x + (p.y - ay) * ob.y;
            if (i > 0) t = Math.max(0, t);
            if (i < last) t = Math.min(segLen, t);
            const q = { x: ax + ob.x * t, y: ay + ob.y * t };
            const n = normalOf(s, axis);
            const dx = p.x - q.x;
            const dy = p.y - q.y;
            const dist = Math.hypot(dx, dy);
            const sd = dx * n.x + dy * n.y;
            const signed = Math.abs(sd) > 1e-9 ? Math.sign(sd) * dist : 0;
            if (!best || dist < Math.abs(best.sd) - 1e-9) best = { sd: signed, dist, along: q };
        }
        return best ? best.sd : Infinity;
    }

    /** 공간 순서(왼→오른 / 위→아래)로 정렬한 선 + 이름 */
    function orderedLines(group, ctx) {
        const D = groupDir(group, ctx);
        const N = normalOf(D, group.axis);
        const items = (group.lines || []).filter((ln) => ln && ln.pts && ln.pts.length >= 2).map((ln) => {
            const pd = ln.pts.map((p) => toDisplay(p, ctx.rot, ctx.w, ctx.h));
            const c = pd.reduce((acc, p) => ({ x: acc.x + p.x / pd.length, y: acc.y + p.y / pd.length }), { x: 0, y: 0 });
            return { line: ln, ptsDisp: pd, offset: c.x * N.x + c.y * N.y };
        });
        items.sort((a, b) => a.offset - b.offset);
        const n = items.length;
        items.forEach((it, i) => {
            const k = group.reverse ? (n - 1 - i) : i;
            it.numberIndex = k;
            it.autoName = `${group.prefix}${group.start + k}`;
            it.name = it.line.label || it.autoName;
        });
        return { items, D, N };
    }

    function lineBand(line, group, ctx) {
        if (line.band != null && Number.isFinite(Number(line.band))) return Math.max(0, Number(line.band));
        if (group.band > 0) return group.band;
        return defaultBand(ctx.w, ctx.h);
    }

    /**
     * 한 점의 그룹 안 위치. pos: 선 i 위(폭 안)=i, 선 i와 i+1 사이=i+0.5, 맨 앞 밖=-0.5, 맨 뒤 밖=n-0.5
     */
    function locateInGroup(pImg, group, ctx, ordered, opts) {
        const forceRange = !!(opts && opts.forceRange);
        const od = ordered || orderedLines(group, ctx);
        const items = od.items;
        const n = items.length;
        if (!n) return null;
        const p = toDisplay(pImg, ctx.rot, ctx.w, ctx.h);
        const sds = items.map((it) => signedDistance(p, it.ptsDisp, group.axis, od.D));
        // 폭 안
        let onIdx = -1;
        let onDist = Infinity;
        items.forEach((it, i) => {
            const half = forceRange ? 1e-6 : lineBand(it.line, group, ctx) / 2;
            if (Math.abs(sds[i]) <= half && Math.abs(sds[i]) < onDist) {
                onIdx = i;
                onDist = Math.abs(sds[i]);
            }
        });
        // 선 방향 범위(날개동 그룹 구분용)
        const alongs = [];
        items.forEach((it) => it.ptsDisp.forEach((q) => alongs.push(q.x * od.D.x + q.y * od.D.y)));
        const pa = p.x * od.D.x + p.y * od.D.y;
        const aMin = Math.min(...alongs);
        const aMax = Math.max(...alongs);
        const margin = Math.max(8, (aMax - aMin) * 0.03);
        const inExtent = pa >= aMin - margin && pa <= aMax + margin;
        const nearest = Math.min(...sds.map(Math.abs));
        if (onIdx >= 0 && forceRange && n > 1) {
            // 범위 전용 부재가 선 위에 딱 걸침 → 번호가 작은 쪽 칸(그쪽이 없으면 반대쪽)
            const lowerNumSide = group.reverse ? onIdx + 1 : onIdx - 1;
            const side = (lowerNumSide >= 0 && lowerNumSide < n) ? lowerNumSide : (group.reverse ? onIdx - 1 : onIdx + 1);
            return { pos: (onIdx + side) / 2, n, inExtent, bracket: 0, nearest, bounded: true };
        }
        if (onIdx >= 0) return { pos: onIdx, n, inExtent, bracket: 0, nearest, bounded: true };
        let lower = -1;
        let upper = -1;
        sds.forEach((sd, i) => {
            if (sd > 0 && (lower < 0 || sd < sds[lower])) lower = i;
            if (sd < 0 && (upper < 0 || sd > sds[upper])) upper = i;
        });
        if (lower >= 0 && upper >= 0) {
            const lo = Math.min(lower, upper);
            const hi = Math.max(lower, upper);
            const pos = (hi - lo === 1) ? lo + 0.5 : (lower < upper ? lower + 0.5 : lower - 0.5);
            return { pos, n, inExtent, bracket: Math.abs(sds[lower]) + Math.abs(sds[upper]), nearest, bounded: true };
        }
        if (lower >= 0) return { pos: n - 0.5, n, inExtent, bracket: Infinity, nearest, bounded: false };
        return { pos: -0.5, n, inExtent, bracket: Infinity, nearest, bounded: false };
    }

    function nameAt(items, idx) {
        return items[Math.max(0, Math.min(items.length - 1, idx))].name;
    }

    function joinRange(items, a, b) {
        if (a === b) return nameAt(items, a);
        const ia = items[a];
        const ib = items[b];
        // 번호 순서(작은 번호 먼저)
        return ia.numberIndex <= ib.numberIndex ? `${ia.name}~${ib.name}` : `${ib.name}~${ia.name}`;
    }

    /** 여러 점(영역 꼭짓점)을 한 그룹 기준 글자로 */
    function labelForPositions(items, positions) {
        const n = items.length;
        if (!n || !positions.length) return '';
        const allLow = positions.every((q) => q < 0);
        const allHigh = positions.every((q) => q > n - 1);
        if (allLow || allHigh) {
            const edge = allLow ? 0 : n - 1;
            return `${nameAt(items, edge)} 외측`;
        }
        const minP = Math.min(...positions);
        const maxP = Math.max(...positions);
        if (minP === maxP && Number.isInteger(minP)) return nameAt(items, minP);
        const a = Math.max(0, Math.floor(minP));
        const b = Math.min(n - 1, Math.ceil(maxP));
        return joinRange(items, a, b);
    }

    function rankLocate(res) {
        if (!res) return 9;
        if (res.bounded && res.inExtent) return 0;
        if (res.bounded) return 1;
        if (res.inExtent) return 2;
        return 3;
    }

    /** 축 하나: 그룹이 여럿이면 양쪽으로 감싸는 그룹 → 선 범위 안 → 가까운 그룹 순 */
    function locateAxis(grid, axis, pointsImg, ctx, opts) {
        const groups = (grid.groups || []).filter((g) => g.axis === axis && (g.lines || []).length);
        if (!groups.length || !pointsImg.length) return '';
        let best = null;
        groups.forEach((g) => {
            const od = orderedLines(g, ctx);
            const results = pointsImg.map((p) => locateInGroup(p, g, ctx, od, opts));
            if (results.some((r) => !r)) return;
            const rank = Math.max(...results.map(rankLocate));
            const score = results.reduce((s, r) => s + (Number.isFinite(r.bracket) ? r.bracket : r.nearest * 4), 0);
            if (!best || rank < best.rank || (rank === best.rank && score < best.score)) {
                best = { rank, score, label: labelForPositions(od.items, results.map((r) => r.pos)) };
            }
        });
        return best ? best.label : '';
    }

    /**
     * 마킹 점(들) → 「X1~X2, Y1~Y2」. ctx: { rot, w, h }
     * opts: { member: 부재 명칭 } 또는 { forceRange: true } — 범위 전용 부재면 폭 무시
     */
    function computeGridLocation(rawGrid, pointsImg, ctx, opts) {
        const grid = normalizeGrid(rawGrid);
        const pts = sanitizePts(pointsImg);
        if (!pts.length) return '';
        const c = { rot: num(ctx && ctx.rot, 0), w: num(ctx && ctx.w, 4000), h: num(ctx && ctx.h, 3000) };
        const o = opts || {};
        const lo = { forceRange: o.forceRange != null ? !!o.forceRange : isRangeOnlyMember(o.member) };
        return AXES.map((ax) => locateAxis(grid, ax, pts, c, lo)).filter(Boolean).join(', ');
    }

    /**
     * 위치 글자 자동 입력 — 사용자가 직접 쓴 글은 덮지 않는다.
     * detail: 지금 위치(층 제외), prevAuto: 지난번 자동으로 넣은 글자, nextAuto: 새로 계산한 글자
     * → { detail, auto } (auto가 ''이면 더 이상 자동 추적 안 함)
     */
    function applyAutoLocation(detail, prevAuto, nextAuto) {
        const cur = String(detail == null ? '' : detail).trim();
        const prev = String(prevAuto == null ? '' : prevAuto).trim();
        const next = String(nextAuto == null ? '' : nextAuto).trim();
        const tracked = prev && (cur === prev || cur.startsWith(prev + ' '));
        if (!cur) return next ? { detail: next, auto: next } : { detail: '', auto: '' };
        if (!tracked) return { detail: cur, auto: '' };
        const rest = cur.slice(prev.length).trim();
        if (!next) return { detail: rest, auto: '' };
        return { detail: rest ? `${next} ${rest}` : next, auto: next };
    }

    // ---- 편집 ----
    /** 점 p를 지나는 선(화면 각도 angle)을 도면 경계까지 */
    function makeLineThrough(pImg, axis, angleDeg, ctx) {
        const dDisp = dirFromAngle(axis, angleDeg);
        const d = norm(vecToImage(dDisp, ctx.rot));
        const w = ctx.w;
        const h = ctx.h;
        let t0 = -Infinity;
        let t1 = Infinity;
        [[pImg.x, d.x, w], [pImg.y, d.y, h]].forEach(([p0, dv, lim]) => {
            if (Math.abs(dv) < 1e-9) return;
            const a = (0 - p0) / dv;
            const b = (lim - p0) / dv;
            t0 = Math.max(t0, Math.min(a, b));
            t1 = Math.min(t1, Math.max(a, b));
        });
        if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 - t0 < 1) {
            const L = Math.hypot(w, h) / 2;
            t0 = -L;
            t1 = L;
        }
        return {
            id: uid('gl'),
            pts: [
                { x: pImg.x + d.x * t0, y: pImg.y + d.y * t0 },
                { x: pImg.x + d.x * t1, y: pImg.y + d.y * t1 }
            ]
        };
    }

    function lineAngle(line, axis, ctx) {
        const pts = line.pts || [];
        if (pts.length < 2) return 0;
        const a = toDisplay(pts[0], ctx.rot, ctx.w, ctx.h);
        const b = toDisplay(pts[pts.length - 1], ctx.rot, ctx.w, ctx.h);
        return angleFromDir(axis, { x: b.x - a.x, y: b.y - a.y });
    }

    /** 선을 가운데를 중심으로 각도 맞춤 (꺾은선은 전체를 회전) */
    function setLineAngle(line, axis, angleDeg, ctx) {
        const pts = line.pts || [];
        if (pts.length < 2) return line;
        const cur = lineAngle(line, axis, ctx);
        let delta = (num(angleDeg, cur) - cur) * Math.PI / 180;
        // 화면 시계 방향 회전 → 이미지 좌표에서도 회전 방향은 같다(회전·평행이동만)
        const c = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 });
        const cos = Math.cos(delta);
        const sin = Math.sin(delta);
        line.pts = pts.map((p) => {
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
        });
        return line;
    }

    function distToSegment(p, a, b) {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const L2 = vx * vx + vy * vy;
        let t = L2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const q = { x: a.x + vx * t, y: a.y + vy * t };
        return { dist: Math.hypot(p.x - q.x, p.y - q.y), q, t };
    }

    /** 이미지 좌표 기준 가장 가까운 선/꼭짓점. tol: 이미지 좌표 허용 거리 */
    function hitTest(rawGrid, pImg, tol) {
        const grid = rawGrid && rawGrid.groups ? rawGrid : normalizeGrid(rawGrid);
        let bestV = null;
        let bestL = null;
        (grid.groups || []).forEach((g) => {
            (g.lines || []).forEach((ln) => {
                (ln.pts || []).forEach((q, vi) => {
                    const d = Math.hypot(pImg.x - q.x, pImg.y - q.y);
                    if (d <= tol * 1.3 && (!bestV || d < bestV.dist)) bestV = { groupId: g.id, lineId: ln.id, vertexIndex: vi, dist: d };
                });
                for (let i = 0; i < ln.pts.length - 1; i++) {
                    const r = distToSegment(pImg, ln.pts[i], ln.pts[i + 1]);
                    if (r.dist <= tol && (!bestL || r.dist < bestL.dist)) {
                        bestL = { groupId: g.id, lineId: ln.id, vertexIndex: null, segIndex: i, dist: r.dist, point: r.q };
                    }
                }
            });
        });
        const best = bestV || bestL;
        return best;
    }

    /** 선 위 가장 가까운 자리에 꺾인 점 추가 → 새 꼭짓점 번호 */
    function insertVertex(line, pImg) {
        let bestI = 0;
        let bestD = Infinity;
        let bestQ = null;
        for (let i = 0; i < line.pts.length - 1; i++) {
            const r = distToSegment(pImg, line.pts[i], line.pts[i + 1]);
            if (r.dist < bestD) {
                bestD = r.dist;
                bestI = i;
                bestQ = r.q;
            }
        }
        line.pts.splice(bestI + 1, 0, { x: bestQ.x, y: bestQ.y });
        return bestI + 1;
    }

    function removeVertex(line, idx) {
        if (!line || line.pts.length <= 2 || idx <= 0 || idx >= line.pts.length - 1) return false;
        line.pts.splice(idx, 1);
        return true;
    }

    function findLine(grid, lineId) {
        for (const g of (grid.groups || [])) {
            const ln = (g.lines || []).find((l) => l.id === lineId);
            if (ln) return { group: g, line: ln };
        }
        return null;
    }

    const api = {
        DEFAULT_PREFIX,
        RANGE_ONLY_MEMBER_RULES,
        isRangeOnlyMember,
        defaultBand,
        createGroup,
        normalizeGrid,
        toDisplay,
        toImage,
        dirFromAngle,
        orderedLines,
        lineBand,
        locateInGroup,
        computeGridLocation,
        applyAutoLocation,
        makeLineThrough,
        lineAngle,
        setLineAngle,
        hitTest,
        insertVertex,
        removeVertex,
        findLine,
        signedDistance
    };
    root.BSA = root.BSA || {};
    root.BSA.gridLines = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
