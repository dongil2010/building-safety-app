/**
 * 도면 행·열(통심) 선 — 순수 계산 모듈 (DOM 없음)
 *
 * 2026-09-28 실험(exp/grid-lines). 도면(층)마다 열(X)·행(Y) 선을 두고, 마킹 점이 어느 칸에 있는지
 * 「X1~X2/Y1~Y2」처럼 위치 글자를 만든다(열/행 사이는 「/」, 공백 없음).
 *
 * - 좌표: 선 꼭짓점은 **이미지 좌표**(결함 x/y와 같은 좌표계, 회전 전)로 저장한다.
 *   번호 순서(왼→오른, 위→아래)는 도면을 **화면에 보이는 회전** 기준으로 매긴다.
 * - 번호는 **먼저 그은 선이 작은 번호**(그룹마다 seq = 그은 순서). 옮기거나 돌려도 번호는 그대로,
 *   선을 지우면 뒤 번호가 하나씩 당겨진다(빈 번호 없음). 「위치 순서로 다시 매기기」로 한 번에 왼→오른/위→아래 순서로.
 *   위치 찾기(이웃 선)는 여전히 공간 기준이고, 범위는 작은 번호~큰 번호로 쓴다(X3·X1 이웃 → X1~X3).
 * - 선은 꼭짓점 2개 이상인 꺾은선. 각도 자유(꺾인 열·날개동). 같은 축에 그룹을 여러 개 둘 수 있다
 *   (그룹마다 머리글·시작 번호·방향·기본 폭).
 * - 폭(band): 선에서 수직 거리 ≤ 폭/2 안이면 그 선 하나(X2), 아니면 이웃 두 선 사이(X1~X2).
 * - 바깥: 맨 끝 선 밖이면 바깥 쪽을 비운 범위 — 번호가 작은 쪽 끝이면 「~X1」, 큰 쪽 끝이면 「X7~」
 *   (범위를 작은 번호~큰 번호로 쓰는 것과 같은 방향. 끝 선과 안쪽 이웃 선의 번호를 비교, 선이 하나면 왼쪽/위 바깥 「~X1」, 오른쪽/아래 「X1~」).
 * - 슬래브·보(B)·철골보(B)·빔도 보통 폭 규칙(폭 안이면 X2) — 2026-09-28 「늘 범위」 규칙은 없앰.
 * - 거더(보(G)·철골보(G)·거더·철골거더·큰보): 먼저 보통 폭 규칙. 한 축이라도 폭 안이면 보통 규칙 그대로.
 *   어느 축의 폭에도 안 들면 선 하나에 붙인다: 가장 가까운 열 선과 행 선까지 거리를 재서
 *   더 가까운 축은 선 이름 하나, 다른 축은 늘 범위(X2/Y1~Y2, X1~X3/Y3). 같으면 열(X) 우선.
 *   (영역은 영역 전체가 한 선의 폭 안에 들어야 「폭 안」)
 *   영역 거더는 긴 쪽 방향(가로로 길면 행 선 위 → Y 하나, 세로로 길면 X 하나, 1.5배 이상일 때), 아니면 가운데 점 기준.
 * - G/B 안 정한 그냥 「보」·「철골보」, 접합부, 그 밖의 부재는 보통 규칙(폭 안이면 X2).
 * - 구역(zones, 2026-09-28): 한 도면에 여러 층이 그려진 경우 사각형 구역마다 따로 번호를 매긴다.
 *   그룹은 zoneId로 한 구역에 속하고(없으면 「구역 밖」 그룹), 마킹 위치는 마킹 점들의 가운데가 든 구역의 그룹만으로 계산한다
 *   (구역이 겹치면 작은 구역 우선, 어느 구역에도 없으면 구역 밖 그룹). 구역이 없는 도면은 예전과 똑같다.
 *   구역 floorLabel(층 이름)은 저장만 — 위치/층 글자는 아직 안 바꿈.
 */
(function (root) {
    'use strict';

    const AXES = ['col', 'row'];
    /** 열 축과 행 축 사이 구분(2026-09-28 사용자 요청: 「An/Xn」) */
    const AXIS_SEP = '/';
    const DEFAULT_PREFIX = { col: 'X', row: 'Y' };
    /**
     * 번호 방식(2026-09-30): 없음/'num' = 숫자(1, 2, 3 — 예전 그대로), 'upper' = A, B, C.
     * 글자는 엑셀 열 이름처럼 이어짐(Z 다음 AA, AB …). 시작 번호 1 = A, 2 = B.
     * 소문자(a, b, c)는 잠깐 있다가 뺌(사용자 요청: 대문자) — 저장된 'lower'는 대문자로 읽는다.
     * 숫자 그룹은 저장할 때 numbering 키가 아예 없다(예전 데이터 모양 그대로).
     */
    const NUMBERINGS = ['num', 'upper'];

    function normalizeNumbering(v) {
        return v === 'upper' || v === 'lower' ? 'upper' : 'num'; // 옛 'lower' → 대문자
    }

    /** 1 → a, 26 → z, 27 → aa (lower=false면 대문자). 1보다 작으면 숫자 그대로 */
    function seqToLetters(n, lower) {
        let k = Math.round(Number(n));
        if (!Number.isFinite(k) || k < 1) return String(Number.isFinite(k) ? k : '');
        let s = '';
        while (k > 0) {
            const r = (k - 1) % 26;
            s = String.fromCharCode(65 + r) + s;
            k = Math.floor((k - 1) / 26);
        }
        return lower ? s.toLowerCase() : s;
    }

    /** 그룹의 n번째(시작 번호 포함한 값) 선 이름 — 머리글 + 번호/글자 */
    function groupSeqLabel(group, n) {
        const g = group || {};
        const mode = normalizeNumbering(g.numbering);
        const body = mode === 'num' ? String(n) : seqToLetters(n, false);
        return `${g.prefix == null ? '' : g.prefix}${body}`;
    }

    /** 거더 — 가까운 열/행 선 하나에 붙임(다른 축은 범위). 접합부는 제외 */
    const GIRDER_MEMBER_RULES = {
        exclude: ['접합부'],
        contains: ['거더', 'GIRDER'],
        endsWith: ['(G)'],
        exact: ['큰보']
    };

    function matchMemberRules(name, r) {
        // 전각 괄호 （G） ·［G］도 (G)로
        const n = String(name == null ? '' : name).replace(/[（［]/g, '(').replace(/[）］]/g, ')').replace(/\s+/g, '').toUpperCase();
        if (!n) return false;
        if ((r.exclude || []).some((k) => n.includes(k.toUpperCase()))) return false;
        if ((r.contains || []).some((k) => n.includes(k.toUpperCase()))) return true;
        if ((r.endsWith || []).some((k) => n.endsWith(k.toUpperCase()))) return true;
        return (r.exact || []).some((k) => n === k.toUpperCase());
    }

    function isGirderMember(name, rules) {
        return matchMemberRules(name, rules || GIRDER_MEMBER_RULES);
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
        const out = {
            id: o.id || uid('gg'),
            axis: ax,
            prefix: o.prefix != null ? String(o.prefix) : DEFAULT_PREFIX[ax],
            start: Math.round(num(o.start, 1)),
            angle: num(o.angle, 0),
            band: Math.max(0, num(o.band, 0)),
            lines: Array.isArray(o.lines) ? o.lines : []
        };
        if (o.zoneId) out.zoneId = String(o.zoneId); // 구역에 속한 그룹만(없으면 키 자체가 없음)
        const nb = normalizeNumbering(o.numbering);
        if (nb !== 'num') out.numbering = nb; // 숫자는 키 없음(예전 데이터 그대로)
        return out;
    }

    // ---- 구역(한 도면에 여러 층) ----
    function rectFromPoints(a, b) {
        return {
            x1: Math.min(a.x, b.x),
            y1: Math.min(a.y, b.y),
            x2: Math.max(a.x, b.x),
            y2: Math.max(a.y, b.y)
        };
    }

    function normalizeZone(z) {
        if (!z || typeof z !== 'object') return null;
        const r = z.rect && typeof z.rect === 'object' ? z.rect : z;
        const xs = [num(r.x1, NaN), num(r.x2, NaN)];
        const ys = [num(r.y1, NaN), num(r.y2, NaN)];
        if (![...xs, ...ys].every(Number.isFinite)) return null;
        const rect = rectFromPoints({ x: xs[0], y: ys[0] }, { x: xs[1], y: ys[1] });
        if (rect.x2 - rect.x1 < 1 || rect.y2 - rect.y1 < 1) return null;
        const out = {
            id: z.id ? String(z.id) : uid('gz'),
            name: String(z.name == null ? '' : z.name).trim() || '구역',
            rect
        };
        const fl = String(z.floorLabel == null ? '' : z.floorLabel).trim();
        if (fl) out.floorLabel = fl;
        return out;
    }

    function createZone(opts) {
        const o = opts || {};
        return normalizeZone({ id: o.id || uid('gz'), name: o.name, floorLabel: o.floorLabel, rect: o.rect });
    }

    function findZone(grid, id) {
        if (!id) return null;
        return ((grid && grid.zones) || []).find((z) => z.id === id) || null;
    }

    function rectContains(r, p) {
        return p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2;
    }

    /** 점이 든 구역(겹치면 넓이가 작은 구역) — 없으면 null */
    function zoneAt(grid, p) {
        let best = null;
        let bestA = Infinity;
        ((grid && grid.zones) || []).forEach((z) => {
            if (!z || !z.rect || !rectContains(z.rect, p)) return;
            const a = (z.rect.x2 - z.rect.x1) * (z.rect.y2 - z.rect.y1);
            if (a < bestA) {
                best = z;
                bestA = a;
            }
        });
        return best;
    }

    /** 마킹 점들(핀은 화살표 끝 한 점, 영역은 네 모서리)의 가운데가 든 구역 */
    function zoneForPoints(grid, pointsImg) {
        const pts = sanitizePts(pointsImg);
        if (!pts.length) return null;
        const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
        return zoneAt(grid, c);
    }

    /** 구역이 있으면: 점들이 든 구역의 그룹만(구역 밖이면 구역 없는 그룹만) 남긴 grid */
    function restrictGridToZone(grid, pointsImg) {
        if (!grid || !(grid.zones || []).length) return grid;
        const z = zoneForPoints(grid, pointsImg);
        const zid = z ? z.id : null;
        return Object.assign({}, grid, { groups: (grid.groups || []).filter((gr) => (gr.zoneId || null) === zid) });
    }

    /** 구역 모서리(corner 0~3: 왼위·오른위·오른아래·왼아래) 또는 테두리(corner null) 누름 */
    function hitZone(grid, p, tol) {
        let best = null;
        ((grid && grid.zones) || []).forEach((z) => {
            const r = z.rect;
            [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]].forEach(([x, y], i) => {
                const d = Math.hypot(p.x - x, p.y - y);
                if (d <= tol * 1.5 && (!best || best.corner == null || d < best.dist)) best = { zoneId: z.id, corner: i, dist: d };
            });
            const inX = p.x >= r.x1 - tol && p.x <= r.x2 + tol;
            const inY = p.y >= r.y1 - tol && p.y <= r.y2 + tol;
            const de = Math.min(
                inY ? Math.abs(p.x - r.x1) : Infinity,
                inY ? Math.abs(p.x - r.x2) : Infinity,
                inX ? Math.abs(p.y - r.y1) : Infinity,
                inX ? Math.abs(p.y - r.y2) : Infinity
            );
            if (de <= tol && (!best || (best.corner == null && de < best.dist))) best = { zoneId: z.id, corner: null, dist: de };
        });
        return best;
    }

    function moveRect(r, dx, dy) {
        return { x1: r.x1 + dx, y1: r.y1 + dy, x2: r.x2 + dx, y2: r.y2 + dy };
    }

    /** 모서리 하나를 p로(맞은편 모서리는 그대로) */
    function resizeRectCorner(r, corner, p) {
        const cs = [{ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y1 }, { x: r.x2, y: r.y2 }, { x: r.x1, y: r.y2 }];
        const opp = cs[(((Number(corner) || 0) % 4) + 6) % 4];
        return rectFromPoints(opp, p);
    }

    /** seq 없는 선(예전 실험 데이터 등)은 저장된 배열 순서(= 그은 순서)대로 뒤에 붙임 */
    function assignMissingSeq(group) {
        const lines = group.lines || [];
        let max = 0;
        lines.forEach((ln) => { if (Number.isFinite(ln.seq)) max = Math.max(max, ln.seq); });
        lines.forEach((ln) => { if (!Number.isFinite(ln.seq)) ln.seq = ++max; });
        return group;
    }

    function nextSeq(group) {
        let max = 0;
        (group.lines || []).forEach((ln) => { if (Number.isFinite(Number(ln.seq))) max = Math.max(max, Number(ln.seq)); });
        return max + 1;
    }

    /** 그은 순서대로 선 추가(번호 = 시작 번호 + 그은 순서) */
    function addLineToGroup(group, line) {
        assignMissingSeq(group);
        line.seq = nextSeq(group);
        group.lines.push(line);
        return line;
    }

    /** 번호 순서(seq, 없거나 같으면 배열 순서) → 선별 0부터의 번호 칸 */
    function numberRanks(lines) {
        const arr = (lines || []).map((ln, i) => ({ ln, i }));
        let max = 0;
        arr.forEach(({ ln }) => { if (Number.isFinite(ln.seq)) max = Math.max(max, ln.seq); });
        const key = ({ ln, i }) => (Number.isFinite(ln.seq) ? ln.seq : max + 1 + i);
        arr.sort((a, b) => key(a) - key(b) || a.i - b.i);
        const map = new Map();
        arr.forEach(({ ln }, k) => map.set(ln, k));
        return map;
    }

    function normalizeGrid(raw) {
        const g = raw && typeof raw === 'object' ? raw : {};
        const zones = (Array.isArray(g.zones) ? g.zones : []).map(normalizeZone).filter(Boolean);
        const zoneIds = new Set(zones.map((z) => z.id));
        const groups = (Array.isArray(g.groups) ? g.groups : []).map((gr) => {
            const out = createGroup(gr && gr.axis, gr || {});
            if (out.zoneId && !zoneIds.has(out.zoneId)) delete out.zoneId; // 없는 구역 → 구역 밖 그룹
            out.lines = (Array.isArray(gr && gr.lines) ? gr.lines : []).map((ln) => {
                const pts = sanitizePts(ln && ln.pts);
                if (pts.length < 2) return null;
                const line = { id: (ln && ln.id) || uid('gl'), pts };
                if (ln && ln.seq !== null && ln.seq !== '' && Number.isFinite(Number(ln.seq))) line.seq = Number(ln.seq);
                if (ln && ln.label != null && String(ln.label).trim()) line.label = String(ln.label).trim();
                if (ln && ln.band != null && ln.band !== '' && Number.isFinite(Number(ln.band))) line.band = Math.max(0, Number(ln.band));
                return line;
            }).filter(Boolean);
            assignMissingSeq(out);
            return out;
        });
        const out = {
            version: 1,
            visible: g.visible !== false,
            autoLocation: g.autoLocation !== false,
            groups
        };
        if (zones.length) out.zones = zones; // 구역 없는 도면은 예전 모양 그대로
        // 도면 크기(선 좌표 기준) · 다른 층에서 복사해 와서 아직 이 층 도면 크기에 못 맞춘 원본 크기 — 있을 때만(Firestore에 undefined 금지)
        const rw = num(g.refW, 0);
        const rh = num(g.refH, 0);
        if (rw > 0 && rh > 0) {
            out.refW = rw;
            out.refH = rh;
        }
        const ps = g.pendingScale;
        if (ps && num(ps.w, 0) > 0 && num(ps.h, 0) > 0) out.pendingScale = { w: num(ps.w, 0), h: num(ps.h, 0) };
        return out;
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

    /** 공간 순서(왼→오른 / 위→아래)로 정렬한 선 + 이름(번호는 그은 순서) */
    function orderedLines(group, ctx) {
        const D = groupDir(group, ctx);
        const N = normalOf(D, group.axis);
        const items = (group.lines || []).filter((ln) => ln && ln.pts && ln.pts.length >= 2).map((ln) => {
            const pd = ln.pts.map((p) => toDisplay(p, ctx.rot, ctx.w, ctx.h));
            const c = pd.reduce((acc, p) => ({ x: acc.x + p.x / pd.length, y: acc.y + p.y / pd.length }), { x: 0, y: 0 });
            return { line: ln, ptsDisp: pd, offset: c.x * N.x + c.y * N.y };
        });
        // 번호 칸은 배열 순서(그은 순서) 기준으로 먼저 매기고, 그다음 공간 순서로 정렬
        const ranks = numberRanks(items.map((it) => it.line));
        items.sort((a, b) => a.offset - b.offset);
        items.forEach((it) => {
            const k = ranks.get(it.line);
            it.numberIndex = k;
            it.autoName = groupSeqLabel(group, group.start + k);
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
        let nearestIdx = 0;
        sds.forEach((sd, i) => { if (Math.abs(sd) < Math.abs(sds[nearestIdx])) nearestIdx = i; });
        const nearest = Math.abs(sds[nearestIdx]);
        if (onIdx >= 0 && forceRange && n > 1) {
            // 늘 범위(forceRange — 거더의 다른 축)인데 선 위에 딱 걸침 → 이웃 칸 중 반대편 선 번호가 더 작은 쪽(이웃이 하나면 그쪽)
            const a = onIdx - 1;
            const b = onIdx + 1;
            let side;
            if (a < 0) side = b;
            else if (b >= n) side = a;
            else side = items[a].numberIndex <= items[b].numberIndex ? a : b;
            return { pos: (onIdx + side) / 2, n, inExtent, bracket: 0, nearest, nearestIdx, bounded: true };
        }
        if (onIdx >= 0) return { pos: onIdx, n, inExtent, bracket: 0, nearest, nearestIdx, bounded: true };
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
            return { pos, n, inExtent, bracket: Math.abs(sds[lower]) + Math.abs(sds[upper]), nearest, nearestIdx, bounded: true };
        }
        if (lower >= 0) return { pos: n - 0.5, n, inExtent, bracket: Infinity, nearest, nearestIdx, bounded: false };
        return { pos: -0.5, n, inExtent, bracket: Infinity, nearest, nearestIdx, bounded: false };
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
            const name = nameAt(items, edge);
            // 끝 선이 안쪽 이웃보다 번호가 작으면 바깥은 「작은 쪽」 → ~X1, 크면 X7~ (선 하나면 공간 방향)
            const tildeFirst = n === 1
                ? allLow
                : items[edge].numberIndex < items[allLow ? 1 : n - 2].numberIndex;
            return tildeFirst ? `~${name}` : `${name}~`;
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
        const best = pickAxis(grid, axis, pointsImg, ctx, opts);
        return best ? best.label : '';
    }

    function pickAxis(grid, axis, pointsImg, ctx, opts) {
        const groups = (grid.groups || []).filter((g) => g.axis === axis && (g.lines || []).length);
        if (!groups.length || !pointsImg.length) return null;
        let best = null;
        groups.forEach((g) => {
            const od = orderedLines(g, ctx);
            const results = pointsImg.map((p) => locateInGroup(p, g, ctx, od, opts));
            if (results.some((r) => !r)) return;
            const rank = Math.max(...results.map(rankLocate));
            const score = results.reduce((s, r) => s + (Number.isFinite(r.bracket) ? r.bracket : r.nearest * 4), 0);
            if (!best || rank < best.rank || (rank === best.rank && score < best.score)) {
                best = { rank, score, od, results, label: labelForPositions(od.items, results.map((r) => r.pos)) };
            }
        });
        return best;
    }

    /** 부재 규칙 이름: 'girder'(거더 규칙) | 'normal'(보통 폭 규칙) */
    function memberRule(name) {
        return isGirderMember(name) ? 'girder' : 'normal';
    }

    /** 계산 방식이 바뀌면 올림 → 화면이 저장된 행·열 위치를 다시 계산함 */
    const GRID_LOC_ALGO = 6; // 4: 끝 선 바깥 ~X1 / X7~, 5: 열/행 구분 「/」, 6: 구역(한 도면 여러 층)마다 따로

    function roundPts(pts) {
        return pts.map((p) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`).join(';');
    }

    /** 행·열 선 내용 지문(선 추가·삭제·이동·이름·번호·폭·머리글이 바뀌면 달라짐) */
    function gridSignature(rawGrid) {
        const grid = normalizeGrid(rawGrid);
        const parts = [];
        const zones = grid.zones || [];
        zones.forEach((z) => parts.push(`z|${roundPts([{ x: z.rect.x1, y: z.rect.y1 }, { x: z.rect.x2, y: z.rect.y2 }])}`));
        (grid.groups || []).forEach((g) => {
            // 번호 방식은 글자일 때만 붙임(숫자 그룹 지문은 예전과 같아 저장된 위치를 다시 계산하지 않음)
            parts.push(`g${g.axis}|${g.prefix}|${g.start}|${g.band}${g.zoneId ? `|z${zones.findIndex((z) => z.id === g.zoneId)}` : ''}${g.numbering ? `|n${g.numbering}` : ''}`);
            (g.lines || []).forEach((ln) => {
                parts.push(`l${ln.seq}|${ln.label || ''}|${ln.band != null ? ln.band : ''}|${roundPts(ln.pts)}`);
            });
        });
        const str = parts.join('#');
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return `${grid.groups.length}.${str.length}.${h.toString(36)}`;
    }

    /** 결함 하나의 계산 입력 지문(계산 방식 + 선 지문 + 부재 규칙 + 점) — 같으면 다시 계산할 필요 없음 */
    function gridLocStamp(sig, pointsImg, member) {
        return `${GRID_LOC_ALGO}|${sig}|${memberRule(member)}|${roundPts(sanitizePts(pointsImg))}`;
    }

    /** 거더: 한 축은 가장 가까운 선 이름 하나, 다른 축은 범위 */
    function girderLocation(grid, pts, ctx) {
        const center = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
        const info = {};
        AXES.forEach((ax) => { info[ax] = pickAxis(grid, ax, [center], ctx, { forceRange: true }); });
        if (!info.col && !info.row) return '';
        let snap = null;
        if (pts.length > 1) {
            const dp = pts.map((p) => toDisplay(p, ctx.rot, ctx.w, ctx.h));
            const w = Math.max(...dp.map((q) => q.x)) - Math.min(...dp.map((q) => q.x));
            const h = Math.max(...dp.map((q) => q.y)) - Math.min(...dp.map((q) => q.y));
            if (w > h * 1.5 && info.row) snap = 'row';
            else if (h > w * 1.5 && info.col) snap = 'col';
        }
        if (!snap) {
            if (info.col && info.row) snap = info.col.results[0].nearest <= info.row.results[0].nearest ? 'col' : 'row';
            else snap = info.col ? 'col' : 'row';
        }
        return AXES.map((ax) => {
            const b = info[ax];
            if (!b) return '';
            if (ax === snap) {
                const r = b.results[0];
                return b.od.items[r.nearestIdx].name;
            }
            return locateAxis(grid, ax, pts, ctx, { forceRange: true });
        }).filter(Boolean).join(AXIS_SEP);
    }

    /**
     * 마킹 점(들) → 「X1~X2/Y1~Y2」. ctx: { rot, w, h }
     * opts: { member: 부재 명칭 } 또는 { girder: true } / { forceRange: true }(폭 무시·늘 범위 — 거더 규칙 안에서만 씀)
     *   — 거더면 폭 먼저, 어느 폭에도 안 들 때만 가까운 선 하나 + 다른 축 범위. 그 밖의 부재(슬래브·보(B) 포함)는 보통 폭 규칙
     */
    function computeGridLocation(rawGrid, pointsImg, ctx, opts) {
        const pts = sanitizePts(pointsImg);
        if (!pts.length) return '';
        // 구역이 있으면 마킹이 든 구역의 선만(구역 밖이면 구역 없는 선만) — 번호도 구역마다 따로
        const grid = restrictGridToZone(normalizeGrid(rawGrid), pts);
        const c = { rot: num(ctx && ctx.rot, 0), w: num(ctx && ctx.w, 4000), h: num(ctx && ctx.h, 3000) };
        const o = opts || {};
        const girder = o.girder != null ? !!o.girder : (o.forceRange == null && isGirderMember(o.member));
        if (girder) {
            // 폭 안(영역은 전체가 한 선 폭 안)인 축이 하나라도 있으면 보통 규칙 그대로, 아니면 가까운 선에 붙임
            const normal = {};
            let girderInBand = false;
            AXES.forEach((ax) => {
                const b = pickAxis(grid, ax, pts, c, { forceRange: false });
                normal[ax] = b ? b.label : '';
                if (b && b.results.length && b.results.every((r) => Number.isInteger(r.pos) && r.pos === b.results[0].pos)) girderInBand = true;
            });
            if (girderInBand) return AXES.map((ax) => normal[ax]).filter(Boolean).join(AXIS_SEP);
            return girderLocation(grid, pts, c);
        }
        const lo = { forceRange: !!o.forceRange };
        return AXES.map((ax) => locateAxis(grid, ax, pts, c, lo)).filter(Boolean).join(AXIS_SEP);
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

    // ---- 결함 칸 구조: 행·열(gridLoc)과 상세 위치(실 이름) ----
    /** 예전 실험 데이터: 상세 위치 앞에 붙은 자동 칸 이름을 떼어냄 → { grid, room } */
    function splitLegacyGridLocation(detail, legacyAuto) {
        const cur = String(detail == null ? '' : detail).trim();
        const auto = String(legacyAuto == null ? '' : legacyAuto).trim();
        if (auto && (cur === auto || cur.startsWith(auto + ' '))) return { grid: auto, room: cur.slice(auto.length).trim() };
        return { grid: '', room: cur };
    }

    /** 위치 칸 두 줄: 행·열 → 다음 줄 실 이름. 하나만 있으면 한 줄 */
    function formatLocationCell(grid, room) {
        const g = String(grid == null ? '' : grid).trim();
        const r = String(room == null ? '' : room).trim();
        if (g && r) return `${g}\n${r}`;
        return g || r;
    }

    /**
     * 한글/PDF 상태조사표 위치 칸. 행·열이 없으면 ''(→ 부르는 쪽이 예전 출력 그대로)
     * o: { gridLoc, legacyAuto, detail(층을 뺀 상세 위치) }
     */
    function reportLocationCell(o) {
        const x = o || {};
        let grid = String(x.gridLoc == null ? '' : x.gridLoc).trim();
        let room = String(x.detail == null ? '' : x.detail).trim();
        if (x.legacyAuto) {
            const sp = splitLegacyGridLocation(room, x.legacyAuto);
            if (sp.grid) {
                room = sp.room;
                if (!grid) grid = sp.grid;
            }
        }
        if (!grid) return '';
        if (Number(x.maxUnits) > 0) grid = splitGridLocLines(grid, x.maxUnits, x.measure).join('\n');
        return formatLocationCell(grid, room);
    }

    // ---- 한글/PDF 위치 칸 줄나눔: 행·열이 칸 폭을 넘을 때만 '/' 뒤(여러 쌍이면 ', ' 뒤 먼저)에서 줄바꿈 ----
    /** 글자 폭 어림(em, 1 = 글자 크기): 영문 대문자 0.62 · 그 밖의 영문·숫자·~·/ 0.55 · 공백 0.3 · 한글 등 1 */
    function gridLocTextEm(text) {
        let n = 0;
        Array.from(String(text == null ? '' : text)).forEach((ch) => {
            if (ch === ' ') n += 0.3;
            else if (/[A-Z]/.test(ch)) n += 0.62;
            else if (/[\u0021-\u007E]/.test(ch)) n += 0.55;
            else n += 1;
        });
        return n;
    }

    /**
     * 칸 한 줄에 들어가는 폭(em). o: { cellWidth, marginLeft, marginRight, fontHeight(HWPUNIT), safety }
     * (칸 폭 − 좌우 여백) ÷ 글자 크기 × 안전 여유(기본 0.92). 알 수 없으면 0
     */
    function cellTextUnits(o) {
        const x = o || {};
        const w = Number(x.cellWidth) || 0;
        const fh = Number(x.fontHeight) || 0;
        if (w <= 0 || fh <= 0) return 0;
        const usable = w - (Number(x.marginLeft) || 0) - (Number(x.marginRight) || 0);
        if (usable <= 0) return 0;
        const safety = Number(x.safety) > 0 ? Number(x.safety) : 0.92;
        return (usable / fh) * safety;
    }

    /**
     * 행·열 글자를 칸 폭(maxUnits em)에 맞춰 줄 배열로. 들어가면 한 줄 그대로.
     * 넘치면: 쌍(', ' 구분)을 통째로 먼저 옮기고, 한 쌍이 혼자서도 넘치면 그 쌍만 '/' 뒤에서 나눔.
     * 'A1~A2' 같은 토큰 중간은 절대 안 자름('/'는 윗줄 끝, ','도 윗줄 끝에 남김). 빈 줄 없음
     */
    function splitGridLocLines(grid, maxUnits, measure) {
        const g = String(grid == null ? '' : grid).replace(/\s+/g, ' ').trim();
        if (!g) return [];
        const m = typeof measure === 'function' ? measure : gridLocTextEm;
        const max = Number(maxUnits);
        if (!(max > 0) || m(g) <= max) return [g];
        const pairs = g.split(/\s*,\s*/).filter(Boolean);
        const atoms = [];
        pairs.forEach((p, pi) => {
            const lastPair = pi === pairs.length - 1;
            const tail = lastPair ? '' : ',';
            if (m(p + tail) <= max || p.indexOf('/') < 0) {
                atoms.push({ text: p + tail, pairEnd: !lastPair });
                return;
            }
            const segs = p.split('/').map((x) => x.trim());
            segs.forEach((s, si) => {
                const segLast = si === segs.length - 1;
                const text = s + (segLast ? tail : '/');
                if (text) atoms.push({ text, pairEnd: segLast && !lastPair });
            });
        });
        const lines = [];
        let cur = '';
        let prevPairEnd = false;
        atoms.forEach((a) => {
            if (!cur) {
                cur = a.text;
            } else {
                const cand = cur + (prevPairEnd ? ' ' : '') + a.text;
                if (m(cand) <= max) cur = cand;
                else {
                    lines.push(cur);
                    cur = a.text;
                }
            }
            prevPairEnd = a.pairEnd;
        });
        if (cur) lines.push(cur);
        return lines;
    }

    /**
     * PDF(HTML) 위치 칸 첫 줄: 쌍마다 inline-block(쉼표 뒤에서 먼저 넘어감), 쌍 안은 '/' 뒤에만 줄바꿈 허용(<wbr>)
     * esc: HTML 이스케이프 함수
     */
    function gridLocBreakableHtml(grid, esc) {
        const e = typeof esc === 'function' ? esc : (s) => String(s);
        const g = String(grid == null ? '' : grid).replace(/\s+/g, ' ').trim();
        if (!g) return '';
        const pairs = g.split(/\s*,\s*/).filter(Boolean);
        return pairs.map((p, i) => {
            const text = p + (i < pairs.length - 1 ? ',' : '');
            return `<span style="display:inline-block;">${text.split('/').map((s) => e(s)).join('/<wbr>')}</span>`;
        }).join(' ');
    }

    // ---- 편집 ----
    /** 점 p를 지나는 선(화면 각도 angle)을 도면 경계까지 */
    /** bounds(선택): 구역 사각형 { x1, y1, x2, y2 } — 주면 도면 경계 대신 구역 경계까지 */
    function makeLineThrough(pImg, axis, angleDeg, ctx, bounds) {
        const dDisp = dirFromAngle(axis, angleDeg);
        const d = norm(vecToImage(dDisp, ctx.rot));
        const bx = bounds && [bounds.x1, bounds.y1, bounds.x2, bounds.y2].every((v) => Number.isFinite(Number(v)))
            ? { x1: Number(bounds.x1), y1: Number(bounds.y1), x2: Number(bounds.x2), y2: Number(bounds.y2) }
            : { x1: 0, y1: 0, x2: ctx.w, y2: ctx.h };
        const w = bx.x2 - bx.x1;
        const h = bx.y2 - bx.y1;
        let t0 = -Infinity;
        let t1 = Infinity;
        [[pImg.x, d.x, bx.x1, bx.x2], [pImg.y, d.y, bx.y1, bx.y2]].forEach(([p0, dv, lo, hi]) => {
            if (Math.abs(dv) < 1e-9) return;
            const a = (lo - p0) / dv;
            const b = (hi - p0) / dv;
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

    /** 한 번만: 지금 화면 기준 위치 순서(왼→오른 / 위→아래)로 번호를 다시 매김 */
    function renumberBySpatialOrder(group, ctx) {
        const od = orderedLines(group, ctx);
        od.items.forEach((it, i) => { it.line.seq = i + 1; });
        const order = new Map(od.items.map((it, i) => [it.line, i]));
        group.lines.sort((x, y) => (order.has(x) ? order.get(x) : 1e9) - (order.has(y) ? order.get(y) : 1e9));
        return group;
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

    // ---- 다른 층으로 복사 (2026-09-28) ----
    function roundTo(v, digits) {
        const m = Math.pow(10, digits);
        return Math.round(v * m) / m;
    }

    function countGridLines(rawGrid) {
        return normalizeGrid(rawGrid).groups.reduce((s, g) => s + (g.lines || []).length, 0);
    }

    /**
     * 선 좌표·폭을 도면 크기 비율대로 맞춤(제자리). 좌표는 이미지 px — 가로는 dstW/srcW, 세로는 dstH/srcH.
     * 폭(띠)은 짧은 변 비율. 그룹 기본 폭이 원본 도면의 기본값(짧은 변 0.8%)이면 대상 도면의 기본값으로.
     * 크기 하나라도 모르거나 같으면 그대로. 바뀌면 true
     */
    function scaleGridInPlace(grid, srcW, srcH, dstW, dstH) {
        const sw = num(srcW, 0);
        const sh = num(srcH, 0);
        const dw = num(dstW, 0);
        const dh = num(dstH, 0);
        if (!(sw > 0 && sh > 0 && dw > 0 && dh > 0) || !grid) return false;
        const sx = dw / sw;
        const sy = dh / sh;
        if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return false;
        const sb = Math.min(dw, dh) / Math.min(sw, sh);
        const srcDefault = defaultBand(sw, sh);
        (grid.zones || []).forEach((z) => {
            if (!z || !z.rect) return;
            z.rect = {
                x1: roundTo(z.rect.x1 * sx, 2),
                y1: roundTo(z.rect.y1 * sy, 2),
                x2: roundTo(z.rect.x2 * sx, 2),
                y2: roundTo(z.rect.y2 * sy, 2)
            };
        });
        (grid.groups || []).forEach((g) => {
            (g.lines || []).forEach((ln) => {
                ln.pts = sanitizePts(ln.pts).map((p) => ({ x: roundTo(p.x * sx, 2), y: roundTo(p.y * sy, 2) }));
                if (ln.band != null && ln.band !== '' && Number.isFinite(Number(ln.band))) ln.band = roundTo(Math.max(0, Number(ln.band)) * sb, 1);
            });
            const gb = num(g.band, 0);
            if (gb > 0) g.band = gb === srcDefault ? defaultBand(dw, dh) : roundTo(gb * sb, 1);
        });
        return true;
    }

    /**
     * 다른 층으로 복사할 행·열 설정 — 선(꺾은 점 포함)·그룹·머리글·시작 번호·각도·기본 폭·선 이름·선 폭·번호 순서(seq)·
     * 보이기/자동 입력 설정을 모두 복사하고 그룹·선 id는 새로 만든다(원본과 겹치지 않게).
     * o: { srcW, srcH, dstW, dstH } 도면 크기(이미지 좌표계).
     *  - 둘 다 알면 비율대로 맞추고 refW/refH를 대상 크기로.
     *  - 대상 크기를 모르면 좌표는 그대로 두고 pendingScale(원본 크기)을 남김 → 그 층을 열어 도면 크기를 알 때 resolvePendingScale.
     *  - 원본 크기도 모르면 그대로.
     */
    function cloneGridForFloor(rawSrc, o) {
        const opt = o || {};
        const src = normalizeGrid(rawSrc);
        // 구역도 새 id로(그룹의 zoneId는 새 구역 id로 이어 줌)
        const zoneMap = {};
        const zones = (src.zones || []).map((z) => {
            const nz = { id: uid('gz'), name: z.name, rect: { x1: z.rect.x1, y1: z.rect.y1, x2: z.rect.x2, y2: z.rect.y2 } };
            if (z.floorLabel) nz.floorLabel = z.floorLabel;
            zoneMap[z.id] = nz.id;
            return nz;
        });
        const out = {
            version: 1,
            visible: src.visible,
            autoLocation: src.autoLocation,
            groups: src.groups.map((g) => {
                const ng = createGroup(g.axis, { prefix: g.prefix, start: g.start, angle: g.angle, band: g.band, numbering: g.numbering, zoneId: g.zoneId ? zoneMap[g.zoneId] : '' });
                ng.lines = (g.lines || []).map((ln) => {
                    const line = { id: uid('gl'), pts: ln.pts.map((p) => ({ x: p.x, y: p.y })) };
                    if (Number.isFinite(ln.seq)) line.seq = ln.seq;
                    if (ln.label) line.label = ln.label;
                    if (ln.band != null) line.band = ln.band;
                    return line;
                });
                return ng;
            })
        };
        if (zones.length) out.zones = zones;
        // 원본이 아직 자기 도면 크기에 못 맞춘 복사본이면 그 좌표 기준은 pendingScale 크기
        const sw = src.pendingScale ? src.pendingScale.w : num(opt.srcW, 0);
        const sh = src.pendingScale ? src.pendingScale.h : num(opt.srcH, 0);
        const dw = num(opt.dstW, 0);
        const dh = num(opt.dstH, 0);
        const srcKnown = sw > 0 && sh > 0;
        const dstKnown = dw > 0 && dh > 0;
        if (srcKnown && dstKnown) {
            scaleGridInPlace(out, sw, sh, dw, dh);
            out.refW = dw;
            out.refH = dh;
        } else if (srcKnown) {
            out.pendingScale = { w: sw, h: sh };
        }
        return out;
    }

    /** 복사해 온 선(pendingScale)을 이 층 도면 크기에 맞춤(제자리). 맞췄으면 true */
    function resolvePendingScale(grid, dstW, dstH) {
        if (!grid || !grid.pendingScale) return false;
        const dw = num(dstW, 0);
        const dh = num(dstH, 0);
        if (!(dw > 0 && dh > 0)) return false;
        scaleGridInPlace(grid, grid.pendingScale.w, grid.pendingScale.h, dw, dh);
        delete grid.pendingScale;
        grid.refW = dw;
        grid.refH = dh;
        return true;
    }

    const api = {
        DEFAULT_PREFIX,
        NUMBERINGS,
        normalizeNumbering,
        seqToLetters,
        groupSeqLabel,
        AXIS_SEP,
        GIRDER_MEMBER_RULES,
        isGirderMember,
        memberRule,
        GRID_LOC_ALGO,
        gridSignature,
        gridLocStamp,
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
        splitLegacyGridLocation,
        formatLocationCell,
        reportLocationCell,
        gridLocTextEm,
        cellTextUnits,
        splitGridLocLines,
        gridLocBreakableHtml,
        makeLineThrough,
        addLineToGroup,
        nextSeq,
        renumberBySpatialOrder,
        lineAngle,
        setLineAngle,
        hitTest,
        insertVertex,
        removeVertex,
        findLine,
        signedDistance,
        countGridLines,
        scaleGridInPlace,
        cloneGridForFloor,
        resolvePendingScale,
        rectFromPoints,
        createZone,
        findZone,
        zoneAt,
        zoneForPoints,
        restrictGridToZone,
        hitZone,
        moveRect,
        resizeRectCorner
    };
    root.BSA = root.BSA || {};
    root.BSA.gridLines = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
