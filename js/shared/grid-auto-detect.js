/**
 * 행·열(통심) 선 자동 잡기 — 순수 계산 모듈 (DOM·pdf.js 없음)
 *
 * 2026-11-02 사용자 요청: 「행열 자동으로 잡아줄 수 있냐 / 캐드 PDF / 축 번호는 원일 수도, 네모 두꺼운 선 옆 번호일 수도」.
 * 캐드 벡터 PDF에서 읽은 선분(이미지 좌표, js/pdf-vector-snap.js)에서 도면을 길게 가로지르는 수직·수평 선을 찾는다.
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
        bubbleMinSegs: 4        // 선 끝 둘레의 작은 선 수(원·네모 축 번호)
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

    /**
     * data: { segments: [[x1,y1,x2,y2]…](수직·수평 위주, 이미지 좌표), small: [[…]](작은 선분, 축 번호 모양 판정용),
     *         texts: [{ str, x, y }](글자 중심, 이미지 좌표) }
     * dims: { w, h } 이미지 좌표 크기. opts: DEFAULTS 덮어쓰기.
     * 반환: { cols: [{ x, y1, y2, label, tier }], rows: [{ y, x1, x2, label, tier }], weak: bool }
     */
    function detect(data, dims, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const d = data || {};
        const dm = { w: num(dims && dims.w, 0), h: num(dims && dims.h, 0) };
        if (!(dm.w > 0 && dm.h > 0)) return { cols: [], rows: [], weak: false };
        const split = splitAxisSegments(d.segments, o.angleTol);
        const c = detectAxis('col', split.cols, dm, d, o);
        const r = detectAxis('row', split.rows, dm, d, o);
        return {
            cols: c.lines.map((l) => ({ x: l.pos, y1: l.a0, y2: l.a1, label: l.label, tier: l.tier })),
            rows: r.lines.map((l) => ({ y: l.pos, x1: l.a0, x2: l.a1, label: l.label, tier: l.tier })),
            weak: [c.tier, r.tier].filter(Boolean).every((t) => t === 'C') && !!(c.lines.length || r.lines.length),
            labelled: { cols: !!c.labelled, rows: !!r.labelled }
        };
    }

    const api = { DEFAULTS, LABEL_RE, isLabelText, splitAxisSegments, chainPieces, labelAtEnd, bubbleAtEnd, detect };
    root.BSA = root.BSA || {};
    root.BSA.gridAutoDetect = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
