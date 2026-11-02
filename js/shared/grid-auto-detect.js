/**
 * 행·열(통심) 선 자동 잡기 — 순수 계산 모듈 (DOM·pdf.js 없음)
 *
 * 2026-11-02 사용자 요청: 「행열 자동으로 잡아줄 수 있냐 / 캐드 PDF / 축 번호는 원일 수도, 네모 두꺼운 선 옆 번호일 수도」.
 * 캐드 벡터 PDF에서 읽은 선분·글자(이미지 좌표, js/pdf-vector-snap.js)로 통심선을 찾는다.
 *
 * ★ 2026-11-02 「선 말고 번호 풍선이랑 글자 쪽을 봐야하는데」 — 1순위는 **축 번호 표시**다(선은 보조).
 *   (가) 번호 풍선: 작은 선들이 닫힌 고리(원·네모·마름모)를 이루고 크기가 알맞으면 풍선. 안에 도면 글자가 있으면 그 이름.
 *   (나) 도면 글자: 1, A, X1, ①, 가 … 모양의 글자(풍선 밖에 번호만 있어도).
 *   (다) 같은 높이(또는 같은 세로줄)에 나란히 늘어선 표시 3개 이상(풍선이면 2개 이상)이 한 축의 번호 줄이다.
 *        위쪽 줄은 열(수직선 위치 = 표시의 x), 왼쪽 줄은 행(수평선 위치 = 표시의 y). 번호가 1,2,3처럼 이어지는지도 본다.
 *   (라) 위·아래(왼·오른쪽)에 같은 번호 줄이 또 있으면 그 사이가 선 길이, 하나뿐이면 반대편 도면 끝까지.
 *        표시 근처에 긴 선이 있으면 그 선 위치·길이를 쓴다(풍선 가운데에 정확히 맞춤).
 *   표시를 못 찾았을 때만 아래 선 기반 방식으로 돌아간다.
 *
 * (보조) 선 기반: 수직·수평 선을 찾는다.
 *
 * 1) 수직/수평(±1°) 선분만 모아 같은 위치(±0.05%)끼리 묶고, 일점쇄선처럼 끊어진 조각을 이어 한 줄로(틈 1.2%까지).
 * 2) 도면 폭·높이의 일정 비율(기본 30%) 이상 가로지르는 줄만 후보. 도면 테두리(가장자리 + 거의 전체 길이)는 뺀다.
 * 3) 근거 등급 — 선 끝에 축 번호가 있으면 가장 확실:
 *      A: 끝에 도면 글자(1, A, X1, ①, 가 …)가 있거나 작은 선들이 모인 곳(원·네모 축 번호 모양)
 *      B: 끊어진 선(일점쇄선) 여러 조각
 *      C: 긴 실선(도면의 60% 이상) — A·B가 하나도 없을 때만, 「확실하지 않음」
 *    A가 있으면 A만, 없으면 B, 그것도 없으면 C를 돌려준다. (벽선 같은 실선이 섞이지 않게)
 * 4) 글자가 같은 축 선의 90% 이상에 있고 서로 다르면 그 글자를 선 이름으로(도면 표기 그대로). 아니면 자동 번호.
 * 5) 같은 축 선은 모두 같은 길이(합친 범위)로 맞춘다.
 *
 * 좌표는 입력과 같은 이미지 좌표(회전 전). 반환의 cols = 수직선(x 고정), rows = 수평선(y 고정).
 * 화면 회전에 따른 열/행 바꿈은 부르는 쪽(app.js)이 한다.
 */
(function (root) {
    'use strict';

    const DEFAULTS = {
        minSpanFrac: 0.30,      // 이만큼 이상 가로지르는 줄만(도면 폭·높이 대비)
        posTolFrac: 0.0005,     // 같은 위치로 보는 오차(긴 변 대비)
        gapFrac: 0.012,         // 끊어진 선 조각을 잇는 틈(긴 변 대비)
        angleTol: 0.02,         // tan(각도) — 약 1.1°
        frameEdgeFrac: 0.015,   // 가장자리 이만큼 안 + 거의 전체 길이면 도면 테두리
        weakSpanFrac: 0.60,     // C등급(긴 실선) 최소 길이
        labelRadiusFrac: 0.035, // 선 끝에서 축 번호를 찾는 거리
        bubbleMinSegs: 4,       // 선 끝 둘레의 작은 선 수(원·네모 축 번호)
        bubbleMinDiaFrac: 0.006, // 번호 풍선 지름(긴 변 대비) 범위
        bubbleMaxDiaFrac: 0.05,
        alignTolFrac: 0.006,    // 같은 높이(세로줄)로 보는 오차
        snapTolFrac: 0.012      // 표시 ↔ 긴 선·반대편 표시를 같은 축으로 보는 거리
    };

    // 도면 글자로 인정하는 축 번호 모양: 1, 12, A, AB, X1, Y3, A-1, 1-1, ①, ⓐ, 가, A'
    const LABEL_RE = /^(?:[A-Za-z]{1,2}[-_]?\d{1,3}|\d{1,3}(?:-\d{1,2})?|[A-Za-z]{1,2}'?|[가-힣]|[①-⑳]|[ⓐ-ⓩ]|[Ⓐ-Ⓩ])$/;

    function isLabelText(s) {
        return LABEL_RE.test(String(s == null ? '' : s).trim());
    }

    function num(v, d) {
        const n = Number(v);
        return Number.isFinite(n) ? n : d;
    }

    /** 수직/수평 선분 → { pos, a0, a1 } (axis: 'col'=수직 x 고정, 'row'=수평 y 고정) */
    function splitAxisSegments(segments, angleTol) {
        const cols = [];
        const rows = [];
        (segments || []).forEach((s) => {
            if (!s || s.length < 4) return;
            const x1 = num(s[0], NaN), y1 = num(s[1], NaN), x2 = num(s[2], NaN), y2 = num(s[3], NaN);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return;
            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);
            if (dx <= dy * angleTol && dy > 0) cols.push({ pos: (x1 + x2) / 2, a0: Math.min(y1, y2), a1: Math.max(y1, y2) });
            else if (dy <= dx * angleTol && dx > 0) rows.push({ pos: (y1 + y2) / 2, a0: Math.min(x1, x2), a1: Math.max(x1, x2) });
        });
        return { cols, rows };
    }

    /** 같은 위치 조각을 묶고 틈이 gap 이하면 한 줄로 이어 붙인다 → [{ pos, a0, a1, covered, pieces }] */
    function chainPieces(pieces, posTol, gap) {
        const sorted = pieces.slice().sort((p, q) => p.pos - q.pos);
        const clusters = [];
        sorted.forEach((p) => {
            const last = clusters[clusters.length - 1];
            if (last && p.pos - last.maxPos <= posTol) {
                last.items.push(p);
                last.maxPos = Math.max(last.maxPos, p.pos);
            } else {
                clusters.push({ items: [p], maxPos: p.pos });
            }
        });
        const out = [];
        clusters.forEach((c) => {
            const items = c.items.slice().sort((p, q) => p.a0 - q.a0);
            let cur = null;
            const flush = () => {
                if (!cur) return;
                const w = cur.items.reduce((s, it) => s + (it.a1 - it.a0), 0) || 1;
                const pos = cur.items.reduce((s, it) => s + it.pos * (it.a1 - it.a0), 0) / w;
                // 겹친 조각이 이중으로 세어지지 않게 덮은 길이는 합집합으로
                let covered = 0;
                let curEnd = -Infinity;
                cur.items.forEach((it) => {
                    const s0 = Math.max(it.a0, curEnd);
                    if (it.a1 > s0) covered += it.a1 - s0;
                    curEnd = Math.max(curEnd, it.a1);
                });
                out.push({ pos, a0: cur.a0, a1: cur.a1, covered, pieces: cur.items.length });
            };
            items.forEach((it) => {
                if (cur && it.a0 - cur.a1 <= gap) {
                    cur.items.push(it);
                    cur.a1 = Math.max(cur.a1, it.a1);
                } else {
                    flush();
                    cur = { items: [it], a0: it.a0, a1: it.a1 };
                }
            });
            flush();
        });
        return out;
    }

    /** 선 끝(E)에서 바깥 방향(u)으로 가까운 도면 글자 → 글자 또는 '' */
    function labelAtEnd(texts, E, u, radius) {
        let best = null;
        (texts || []).forEach((t) => {
            if (!t || !isLabelText(t.str)) return;
            const dx = t.x - E.x;
            const dy = t.y - E.y;
            const along = dx * u.x + dy * u.y;          // 바깥으로 얼마나
            const cross = Math.abs(dx * -u.y + dy * u.x); // 선에서 옆으로 얼마나
            if (along < -radius * 0.35 || along > radius * 1.8 || cross > radius * 0.9) return;
            const d = Math.hypot(dx, dy);
            if (!best || d < best.d) best = { str: String(t.str).trim(), d };
        });
        return best ? best.str : '';
    }

    /** 선 끝 둘레에 작은 선이 모여 있는가(원·네모 축 번호, 글자를 선으로 그린 경우 포함) */
    function bubbleAtEnd(small, E, u, radius, minSegs) {
        const cx = E.x + u.x * radius * 0.5;
        const cy = E.y + u.y * radius * 0.5;
        const r2 = radius * radius;
        let n = 0;
        for (let i = 0; i < (small || []).length; i++) {
            const s = small[i];
            const mx = (s[0] + s[2]) / 2;
            const my = (s[1] + s[3]) / 2;
            const dx = mx - cx;
            const dy = my - cy;
            if (dx * dx + dy * dy <= r2) n++;
            if (n >= minSegs) return true;
        }
        return false;
    }

    function detectAxis(axis, pieces, dims, data, o) {
        const L = Math.max(dims.w, dims.h);
        const full = axis === 'col' ? dims.h : dims.w;     // 선이 달리는 방향의 도면 길이
        const across = axis === 'col' ? dims.w : dims.h;   // 선 위치가 놓이는 방향
        const chains = chainPieces(pieces, L * o.posTolFrac, L * o.gapFrac);
        const radius = L * o.labelRadiusFrac;
        const out = [];
        chains.forEach((c) => {
            const span = c.a1 - c.a0;
            if (span < full * o.minSpanFrac) return;
            // 도면 테두리: 가장자리 근처 + 거의 전체 길이
            const edge = across * o.frameEdgeFrac;
            if ((c.pos < edge || c.pos > across - edge) && span >= full * 0.9) return;
            const ends = axis === 'col'
                ? [{ p: { x: c.pos, y: c.a0 }, u: { x: 0, y: -1 } }, { p: { x: c.pos, y: c.a1 }, u: { x: 0, y: 1 } }]
                : [{ p: { x: c.a0, y: c.pos }, u: { x: -1, y: 0 } }, { p: { x: c.a1, y: c.pos }, u: { x: 1, y: 0 } }];
            let label = '';
            let bubble = false;
            ends.forEach((e) => {
                if (!label) label = labelAtEnd(data.texts, e.p, e.u, radius);
                if (!bubble) bubble = bubbleAtEnd(data.small, e.p, e.u, radius, o.bubbleMinSegs);
            });
            const dashed = c.pieces >= 3 && c.covered < span * 0.92;
            // 축 번호 모양만으로 A등급이 되려면 끊어진 선이거나 도면의 절반 이상 — 선 끝에 잡다한 선이 몰린 짧은 실선(벽 접합부 등)은 제외
            const tier = (label || (bubble && (dashed || span >= full * 0.5))) ? 'A' : (dashed ? 'B' : (span >= full * o.weakSpanFrac ? 'C' : ''));
            if (!tier) return;
            out.push({ pos: c.pos, a0: c.a0, a1: c.a1, label, tier, pieces: c.pieces });
        });
        // 가장 좋은 등급만
        ['A', 'B', 'C'].some((t) => {
            const hit = out.filter((l) => l.tier === t);
            if (!hit.length) return false;
            out.length = 0;
            hit.forEach((l) => out.push(l));
            return true;
        });
        out.sort((p, q) => p.pos - q.pos);
        if (!out.length) return { lines: [], tier: '' };
        // 같은 축 선은 같은 길이(합친 범위)로
        const a0 = Math.min.apply(null, out.map((l) => l.a0));
        const a1 = Math.max.apply(null, out.map((l) => l.a1));
        out.forEach((l) => { l.a0 = a0; l.a1 = a1; });
        // 글자: 90% 이상에 있고 서로 달라야 도면 표기 그대로 쓴다
        const labelled = out.filter((l) => l.label);
        const distinct = new Set(labelled.map((l) => l.label)).size === labelled.length;
        const useLabels = labelled.length >= Math.ceil(out.length * 0.9) && distinct && out.length > 0;
        out.forEach((l) => { if (!useLabels) l.label = ''; });
        return { lines: out, tier: out[0].tier, labelled: useLabels };
    }

    // =====================================================================
    // 1순위: 번호 풍선 · 도면 글자
    // =====================================================================

    /** 작은 선분들을 끝점이 맞닿은 것끼리 묶어, 닫힌 고리 모양(원·네모·마름모) 중 풍선 크기인 것의 가운데·반지름 */
    function findBubbles(small, dims, o) {
        const L = Math.max(dims.w, dims.h);
        const eps = Math.max(1.5, L * 0.0008);
        const rMin = L * o.bubbleMinDiaFrac / 2;
        const rMax = L * o.bubbleMaxDiaFrac / 2;
        const segs = (small || []).filter((q) => q && q.length >= 4);
        const n = segs.length;
        if (!n) return [];
        const parent = new Array(n);
        for (let i = 0; i < n; i++) parent[i] = i;
        const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
        const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; };
        // 끝점 공간 해시
        const cell = eps * 2;
        const grid = new Map();
        const key = (x, y) => Math.floor(x / cell) + ',' + Math.floor(y / cell);
        for (let i = 0; i < n; i++) {
            [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]].forEach(([x, y]) => {
                const cx = Math.floor(x / cell);
                const cy = Math.floor(y / cell);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const arr = grid.get((cx + dx) + ',' + (cy + dy));
                        if (arr) arr.forEach((j) => {
                            const t = segs[j];
                            if (Math.hypot(t[0] - x, t[1] - y) <= eps || Math.hypot(t[2] - x, t[3] - y) <= eps) union(i, j);
                        });
                    }
                }
                const k = key(x, y);
                const a = grid.get(k);
                if (a) a.push(i); else grid.set(k, [i]);
            });
        }
        const comps = new Map();
        for (let i = 0; i < n; i++) {
            const r = find(i);
            if (!comps.has(r)) comps.set(r, []);
            comps.get(r).push(i);
        }
        const found = [];
        comps.forEach((idxs) => {
            if (idxs.length < 3 || idxs.length > 400) return;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            const pts = [];
            idxs.forEach((i) => {
                const q = segs[i];
                pts.push([q[0], q[1]], [q[2], q[3]]);
                x0 = Math.min(x0, q[0], q[2]); x1 = Math.max(x1, q[0], q[2]);
                y0 = Math.min(y0, q[1], q[3]); y1 = Math.max(y1, q[1], q[3]);
            });
            const w = x1 - x0;
            const h = y1 - y0;
            const r = (w + h) / 4;
            if (r < rMin || r > rMax) return;
            if (w < h * 0.75 || h < w * 0.75) return;      // 거의 정사각 틀
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            // 끝점이 가운데에서 비슷한 거리(원·마름모·네모 꼭짓점) — 들쭉날쭉한 덩어리(글자·해칭)는 제외
            const dist = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
            const mean = dist.reduce((a, b) => a + b, 0) / dist.length;
            const dev = dist.filter((d) => Math.abs(d - mean) > mean * 0.3).length;
            if (dev > dist.length * 0.15) return;
            found.push({ x: cx, y: cy, r: Math.max(w, h) / 2 });
        });
        // 이중 원 등 겹친 것은 바깥 것 하나만
        found.sort((a, b) => b.r - a.r);
        const kept = [];
        found.forEach((f) => {
            if (!kept.some((k) => Math.hypot(k.x - f.x, k.y - f.y) < k.r * 0.6)) kept.push(f);
        });
        return kept;
    }

    /** 풍선 안 글자(여러 조각이면 이어 붙임) → 도면 글자 모양이면 그 글자, 아니면 '' */
    function textInside(texts, b) {
        const inside = (texts || []).filter((t) => t && Math.hypot(t.x - b.x, t.y - b.y) <= b.r * 1.05);
        if (!inside.length) return '';
        const joined = inside.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y)).map((t) => String(t.str).trim()).join('');
        if (isLabelText(joined)) return joined;
        const near = inside.slice().sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y));
        for (let i = 0; i < near.length; i++) if (isLabelText(near[i].str)) return String(near[i].str).trim();
        return '';
    }

    /** 표시 후보: 풍선(안 글자 포함) + 풍선 밖의 도면 글자 */
    function findMarkers(data, dims, o) {
        const bubbles = findBubbles(data.small, dims, o);
        const markers = bubbles.map((b) => ({ x: b.x, y: b.y, r: b.r, bubble: true, label: textInside(data.texts, b) }));
        (data.texts || []).forEach((t) => {
            if (!t || !isLabelText(t.str)) return;
            if (bubbles.some((b) => Math.hypot(t.x - b.x, t.y - b.y) <= b.r * 1.05)) return; // 이미 풍선 안
            markers.push({ x: t.x, y: t.y, r: 0, bubble: false, label: String(t.str).trim() });
        });
        return markers;
    }

    /** 번호 글자 → 순서 값(1, 2 … / A=1, B=2 / X3 → 3 / ① → 1 / 가=1). 못 읽으면 null */
    function labelOrder(str) {
        const t = String(str == null ? '' : str).trim().replace(/'$/, '');
        if (!t) return null;
        let m = t.match(/(\d+)(?!.*\d)/);
        if (m) return parseInt(m[1], 10);
        if (/^[A-Za-z]{1,2}$/.test(t)) return t.toUpperCase().split('').reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
        const circ = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'.indexOf(t);
        if (circ >= 0) return circ + 1;
        const ko = '가나다라마바사아자차카타파하'.indexOf(t);
        if (ko >= 0) return ko + 1;
        return null;
    }

    /** 위치순으로 늘어선 번호가 한 방향으로 이어지는 정도(0~1). 글자가 없으면 1 */
    function sequenceScore(group) {
        const vals = group.items.map((m) => labelOrder(m.label)).filter((v) => v != null);
        if (vals.length < 2) return group.items.some((m) => m.label) ? 0.3 : 1;
        let up = 0;
        let down = 0;
        for (let i = 1; i < vals.length; i++) {
            if (vals[i] > vals[i - 1]) up++;
            else if (vals[i] < vals[i - 1]) down++;
        }
        return Math.max(up, down) / (vals.length - 1);
    }

    /** axis 'col': 같은 높이(y)에 늘어선 표시 묶음(수직선 위치 = x) / 'row': 같은 x에 늘어선 묶음(수평선 위치 = y) */
    function alignGroups(markers, axis, dims, o) {
        const L = Math.max(dims.w, dims.h);
        const tol = L * o.alignTolFrac;
        const cross = (m) => (axis === 'col' ? m.y : m.x);   // 묶음을 정하는 값
        const along = (m) => (axis === 'col' ? m.x : m.y);   // 선 위치가 될 값
        const sorted = markers.slice().sort((a, b) => cross(a) - cross(b));
        const groups = [];
        sorted.forEach((m) => {
            const g = groups.find((q) => Math.abs(q.cross - cross(m)) <= tol);
            if (g) {
                g.items.push(m);
                g.cross = g.items.reduce((s, it) => s + cross(it), 0) / g.items.length;
            } else {
                groups.push({ cross: cross(m), items: [m] });
            }
        });
        const minGap = L * 0.01;
        const out = [];
        groups.forEach((g) => {
            g.items.sort((a, b) => along(a) - along(b));
            // 너무 붙은 표시(같은 풍선의 중복 글자)는 하나만
            const uniq = [];
            g.items.forEach((m) => {
                const last = uniq[uniq.length - 1];
                if (last && along(m) - along(last) < minGap) {
                    if (m.bubble && !last.bubble) uniq[uniq.length - 1] = m;
                    return;
                }
                uniq.push(m);
            });
            g.items = uniq;
            const bubbles = uniq.filter((m) => m.bubble).length;
            const need = bubbles >= Math.ceil(uniq.length * 0.6) ? 2 : 3;
            if (uniq.length < need) return;
            g.bubbleFrac = bubbles / uniq.length;
            g.seq = sequenceScore(g);
            if (g.seq < 0.7) return; // 번호가 이어지지 않는 늘어섬(치수 글자 등)은 축 번호가 아니다
            g.score = uniq.length * (g.bubbleFrac >= 0.6 ? 2 : 1) * g.seq;
            out.push(g);
        });
        out.sort((a, b) => b.score - a.score);
        return out;
    }

    /** 도면 내용 범위(테두리·바깥 점 무시) — 반대편 끝까지 그을 때 쓴다 */
    function contentRange(segments, dims) {
        const xs = [];
        const ys = [];
        (segments || []).forEach((q) => {
            xs.push((q[0] + q[2]) / 2);
            ys.push((q[1] + q[3]) / 2);
        });
        if (xs.length < 4) return { x0: 0, x1: dims.w, y0: 0, y1: dims.h };
        xs.sort((a, b) => a - b);
        ys.sort((a, b) => a - b);
        const at = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * f)))];
        return { x0: at(xs, 0.01), x1: at(xs, 0.99), y0: at(ys, 0.01), y1: at(ys, 0.99) };
    }

    /** 표시 묶음 → 선들. counterpart: 반대편(위↔아래) 묶음이 있으면 그 사이가 길이 */
    function linesFromGroup(axis, g, counter, dims, content, chains, o) {
        const L = Math.max(dims.w, dims.h);
        const snapTol = L * o.snapTolFrac;
        const full = axis === 'col' ? [content.y0, content.y1] : [content.x0, content.x1];
        const along = (m) => (axis === 'col' ? m.x : m.y);
        const crossOf = (m) => (axis === 'col' ? m.y : m.x);
        const lines = [];
        g.items.forEach((m) => {
            let pos = along(m);
            let a0;
            let a1;
            // 반대편 묶음에서 같은 위치(±허용)의 표시
            const twin = counter ? counter.items.find((q) => Math.abs(along(q) - pos) <= snapTol * 0.6) : null;
            if (twin) {
                pos = (pos + along(twin)) / 2;
                a0 = Math.min(crossOf(m), crossOf(twin));
                a1 = Math.max(crossOf(m), crossOf(twin));
            } else {
                // 이 줄이 도면의 어느 쪽에 있나 → 반대편 내용 끝까지
                const mid = (full[0] + full[1]) / 2;
                const c = crossOf(m);
                if (c <= mid) { a0 = c; a1 = full[1]; } else { a0 = full[0]; a1 = c; }
            }
            // 근처 긴 선이 있으면 그 위치·길이(더 정확)
            let best = null;
            chains.forEach((ch) => {
                const d = Math.abs(ch.pos - pos);
                if (d > snapTol) return;
                const overlap = Math.min(ch.a1, a1) - Math.max(ch.a0, a0);
                if (overlap < (a1 - a0) * 0.5) return;
                if (!best || d < best.d) best = { d, ch };
            });
            if (best) {
                pos = best.ch.pos;
                a0 = Math.min(a0, best.ch.a0);
                a1 = Math.max(a1, best.ch.a1);
            }
            lines.push({ pos, a0, a1, label: m.label || '', tier: 'M' });
        });
        // 같은 위치 중복 제거
        lines.sort((a, b) => a.pos - b.pos);
        const dedup = [];
        lines.forEach((l) => {
            const last = dedup[dedup.length - 1];
            if (last && l.pos - last.pos < L * 0.004) return;
            dedup.push(l);
        });
        return dedup;
    }

    function finishLines(lines) {
        if (!lines.length) return { lines: [], labelled: false };
        const a0 = Math.min.apply(null, lines.map((l) => l.a0));
        const a1 = Math.max.apply(null, lines.map((l) => l.a1));
        lines.forEach((l) => { l.a0 = a0; l.a1 = a1; });
        const labelled = lines.filter((l) => l.label);
        const distinct = new Set(labelled.map((l) => l.label)).size === labelled.length;
        const useLabels = labelled.length >= Math.ceil(lines.length * 0.9) && distinct;
        lines.forEach((l) => { if (!useLabels) l.label = ''; });
        return { lines, labelled: useLabels };
    }

    function detectByMarkers(data, dims, o) {
        const markers = findMarkers(data, dims, o);
        if (markers.length < 2) return null;
        const content = contentRange(data.segments, dims);
        const L = Math.max(dims.w, dims.h);
        const split = splitAxisSegments(data.segments, o.angleTol);
        const colChains = chainPieces(split.cols, L * o.posTolFrac, L * o.gapFrac).filter((c) => c.a1 - c.a0 >= dims.h * 0.2);
        const rowChains = chainPieces(split.rows, L * o.posTolFrac, L * o.gapFrac).filter((c) => c.a1 - c.a0 >= dims.w * 0.2);
        const pick = (axis, chains) => {
            const groups = alignGroups(markers, axis, dims, o);
            if (!groups.length) return { lines: [], labelled: false };
            const best = groups[0];
            const span = axis === 'col' ? dims.h : dims.w;
            // 반대편에 같은 번호 줄이 또 있으면(위·아래 / 왼·오른쪽) 그 사이가 선 길이
            const counter = groups.find((g) => g !== best && Math.abs(g.cross - best.cross) >= span * 0.15
                && g.items.filter((m) => best.items.some((q) => Math.abs((axis === 'col' ? m.x - q.x : m.y - q.y)) <= L * o.snapTolFrac * 0.6)).length >= Math.ceil(best.items.length * 0.6));
            return finishLines(linesFromGroup(axis, best, counter || null, dims, content, chains, o));
        };
        const c = pick('col', colChains);
        const r = pick('row', rowChains);
        if (!c.lines.length && !r.lines.length) return null;
        return { c, r };
    }

    /**
     * data: { segments: [[x1,y1,x2,y2]…](수직·수평 위주, 이미지 좌표), small: [[…]](작은 선분 — 번호 풍선 모양 판정용),
     *         texts: [{ str, x, y }](글자 중심, 이미지 좌표) }
     * dims: { w, h } 이미지 좌표 크기. opts: DEFAULTS 덮어쓰기.
     * 반환: { cols: [{ x, y1, y2, label, tier }], rows: [{ y, x1, x2, label, tier }], weak: bool, source: 'markers'|'lines' }
     *   tier: 'M' 번호 풍선·글자 기반 / 'A'·'B'·'C' 선 기반(C = 확실하지 않음)
     */
    function detect(data, dims, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const d = data || {};
        const dm = { w: num(dims && dims.w, 0), h: num(dims && dims.h, 0) };
        if (!(dm.w > 0 && dm.h > 0)) return { cols: [], rows: [], weak: false };
        // 1순위: 번호 풍선·글자
        const m = detectByMarkers(d, dm, o);
        if (m) {
            return {
                cols: m.c.lines.map((l) => ({ x: l.pos, y1: l.a0, y2: l.a1, label: l.label, tier: 'M' })),
                rows: m.r.lines.map((l) => ({ y: l.pos, x1: l.a0, x2: l.a1, label: l.label, tier: 'M' })),
                weak: false,
                labelled: { cols: !!m.c.labelled, rows: !!m.r.labelled },
                source: 'markers'
            };
        }
        // 보조: 선 기반
        const split = splitAxisSegments(d.segments, o.angleTol);
        const c = detectAxis('col', split.cols, dm, d, o);
        const r = detectAxis('row', split.rows, dm, d, o);
        return {
            cols: c.lines.map((l) => ({ x: l.pos, y1: l.a0, y2: l.a1, label: l.label, tier: l.tier })),
            rows: r.lines.map((l) => ({ y: l.pos, x1: l.a0, x2: l.a1, label: l.label, tier: l.tier })),
            weak: [c.tier, r.tier].filter(Boolean).every((t) => t === 'C') && !!(c.lines.length || r.lines.length),
            labelled: { cols: !!c.labelled, rows: !!r.labelled },
            source: 'lines'
        };
    }

    const api = { DEFAULTS, LABEL_RE, isLabelText, splitAxisSegments, chainPieces, labelAtEnd, bubbleAtEnd, findBubbles, findMarkers, alignGroups, labelOrder, detect };
    root.BSA = root.BSA || {};
    root.BSA.gridAutoDetect = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
