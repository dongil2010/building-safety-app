/**
 * 구조도 실제 도형 뽑기(2026-10-14, B안) — 순수 계산 모듈 (DOM 없음, struct-plan.html 전용)
 *
 * 기호(struct-marks.js)는 "C1·1G2 글자 테두리"를 찾는다. 여기서는 부재 자체의 모양을 찾는다:
 *   - 기둥·벽: 칠한 회색 면. 캐드 SOLID 칠은 PDF에서 삼각형 둘로 나뉘어 나온다 → 같은 테두리 상자를 가진 삼각형 둘 = 네모 하나.
 *     작고 정사각형에 가까우면 기둥, 길면 벽(한 줄로 이어진 벽 조각은 합친다).
 *   - 거더·빔: 슬래브 밑에 숨은 보는 나란한 점선 두 줄로 그린다 → 점선 조각을 이어 점선으로, 나란한 점선 짝을 띠(보)로.
 *     띠는 기둥·벽에서 끊어 한 칸(경간)씩 부재로 센다. 빔은 가로지르는 거더에서도 끊는다(거더는 빔에서 안 끊는다).
 *   - 종류·이름: 보는 가까운 G·B 기호(같은 방향으로 누운 것)에서, 기둥·벽은 가까운 C·W 기호에서 가져온다.
 *     이름 없는 보는 짐작한다(양 끝이 기둥·벽이면 거더, 아니면 빔) — guess:true, 화면에서 점선으로 보여 사람이 확인.
 *   - 슬래브는 모양을 뽑지 않고 기호 그대로 둔다.
 *
 * 입력 경로: { pts:[[x,y]…], closed, fill } — 쪽 좌표(pdf.js viewport scale 1). fill = 칠한 경로(struct-plan-page.js가 붙인다).
 * 크기 기준 u = 쪽 대각선/1000 (A3 가로 쪽이면 약 1pt). 결과는 가로·세로로 놓인 네모만(비스듬한 보는 못 찾는다).
 */
(function (root) {
    'use strict';

    var TYPE_OF_LETTER = { C: '기둥', W: '벽', G: '거더', B: '빔', S: '슬래브' };

    function bbox(pts) {
        var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (p[0] < x0) x0 = p[0];
            if (p[0] > x1) x1 = p[0];
            if (p[1] < y0) y0 = p[1];
            if (p[1] > y1) y1 = p[1];
        }
        return { x0: x0, y0: y0, x1: x1, y1: y1 };
    }

    /** 칠한 경로 → 네모 목록. 삼각형은 같은 상자 짝이 있을 때만, 네 꼭짓점이 상자 모서리인 것은 그대로. */
    function fillRects(paths, u) {
        var tri = {}, out = [];
        var key = function (b) { return [b.x0, b.y0, b.x1, b.y1].map(function (v) { return Math.round(v / (0.1 * u)); }).join(','); };
        (paths || []).forEach(function (p) {
            if (!p || !p.fill || !p.pts) return;
            var pts = p.pts;
            if (pts.length > 4 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.05 * u) pts = pts.slice(0, -1);
            var b = bbox(pts);
            if (pts.length === 3) {
                var k = key(b);
                (tri[k] = tri[k] || []).push(b);
            } else if (pts.length === 4) {
                var tol = 0.05 * u;
                var onCorner = pts.every(function (q) {
                    return (Math.abs(q[0] - b.x0) < tol || Math.abs(q[0] - b.x1) < tol) && (Math.abs(q[1] - b.y0) < tol || Math.abs(q[1] - b.y1) < tol);
                });
                if (onCorner) out.push(b);
            }
        });
        Object.keys(tri).forEach(function (k) { if (tri[k].length >= 2) out.push(tri[k][0]); });
        // 같은 네모가 겹쳐 나온 것(칠+테두리 등)은 하나만
        var seen = {};
        return out.filter(function (b) { var k = key(b); if (seen[k]) return false; seen[k] = true; return true; });
    }

    /** 한 줄로 이어진(같은 두께·같은 중심선·맞닿은) 벽 조각을 합친다 */
    function mergeWalls(walls, u) {
        var list = walls.map(function (b) {
            var horiz = (b.x1 - b.x0) >= (b.y1 - b.y0);
            return { b: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, horiz: horiz };
        });
        var merged = true;
        while (merged) {
            merged = false;
            for (var i = 0; i < list.length && !merged; i++) {
                for (var j = i + 1; j < list.length && !merged; j++) {
                    var a = list[i], c = list[j];
                    if (a.horiz !== c.horiz) continue;
                    var A = a.b, C = c.b, tol = 0.15 * u;
                    var same = a.horiz
                        ? Math.abs(A.y0 - C.y0) < tol && Math.abs(A.y1 - C.y1) < tol && C.x0 <= A.x1 + 0.3 * u && A.x0 <= C.x1 + 0.3 * u
                        : Math.abs(A.x0 - C.x0) < tol && Math.abs(A.x1 - C.x1) < tol && C.y0 <= A.y1 + 0.3 * u && A.y0 <= C.y1 + 0.3 * u;
                    if (!same) continue;
                    a.b = { x0: Math.min(A.x0, C.x0), y0: Math.min(A.y0, C.y0), x1: Math.max(A.x1, C.x1), y1: Math.max(A.y1, C.y1) };
                    list.splice(j, 1);
                    merged = true;
                }
            }
        }
        return list.map(function (w) { return w.b; });
    }

    /** 칠하지 않은 짧은 가로·세로 선 조각을 이어 점선으로 → [{ o:'H'|'V', c(중심선), s, e, n(조각 수) }] */
    function dashedLines(paths, u) {
        var buckets = { H: {}, V: {} };
        (paths || []).forEach(function (p) {
            if (!p || p.fill || !p.pts) return;
            for (var i = 1; i < p.pts.length; i++) {
                var a = p.pts[i - 1], b = p.pts[i];
                var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
                if (len < 0.5 * u || len > 4 * u) continue;
                var o, c, s, e;
                if (Math.abs(dy) <= 0.03 * len) { o = 'H'; c = (a[1] + b[1]) / 2; s = Math.min(a[0], b[0]); e = Math.max(a[0], b[0]); }
                else if (Math.abs(dx) <= 0.03 * len) { o = 'V'; c = (a[0] + b[0]) / 2; s = Math.min(a[1], b[1]); e = Math.max(a[1], b[1]); }
                else continue;
                var k = Math.round(c / (0.1 * u));
                (buckets[o][k] = buckets[o][k] || []).push({ c: c, s: s, e: e });
            }
        });
        var lines = [];
        ['H', 'V'].forEach(function (o) {
            Object.keys(buckets[o]).forEach(function (k) {
                var arr = buckets[o][k].sort(function (p, q) { return p.s - q.s; });
                var cur = null;
                var flush = function () { if (cur && cur.n >= 3 && cur.e - cur.s >= 5 * u) lines.push(cur); };
                arr.forEach(function (d) {
                    if (cur && d.s - cur.e <= 1.4 * u) { cur.e = Math.max(cur.e, d.e); cur.n++; }
                    else { flush(); cur = { o: o, c: d.c, s: d.s, e: d.e, n: 1 }; }
                });
                flush();
            });
        });
        return lines;
    }

    /**
     * 나란한 점선 짝 → 띠 [{ o, c0, c1, s, e }]. 두 점선이 겹치는 구간이 띠가 된다.
     * 한쪽 점선은 기둥마다 끊기고 맞은편은 길게 이어진 도면이 흔해서, 한 점선이 여러 짝을 가질 수 있다.
     * 둘 사이에 다른 점선이 그 구간 절반 넘게 끼어 있으면 짝이 아니다(더 가까운 짝이 따로 있다).
     * 점선 셋이 나란하면(좁은 보 + 바닥 단차선 등) 가운데 점선이 두 짝에 다 들어간다 →
     *   보의 두 모서리는 같은 곳(받치는 보·기둥 면)에서 시작하고 끝나므로, 양 끝이 더 잘 맞는 짝 하나만 남긴다.
     */
    function pairBands(lines, u) {
        var cand = [];
        ['H', 'V'].forEach(function (o) {
            var L = lines.filter(function (l) { return l.o === o; }).sort(function (p, q) { return p.c - q.c; });
            for (var i = 0; i < L.length; i++) {
                var a = L[i];
                for (var j = i + 1; j < L.length; j++) {
                    var b = L[j], gap = b.c - a.c;
                    if (gap > 9 * u) break;
                    if (gap < 0.8 * u) continue;
                    var s = Math.max(a.s, b.s), e = Math.min(a.e, b.e);
                    if (e - s < 3 * u) continue;
                    var between = false;
                    for (var k = i + 1; k < j && !between; k++) {
                        var m = L[k];
                        if (m.c - a.c < 0.05 * u || b.c - m.c < 0.05 * u) continue;
                        if (Math.min(e, m.e) - Math.max(s, m.s) > 0.5 * (e - s)) between = true;
                    }
                    if (between) continue;
                    // 양 끝 어긋남(겹친 길이에 대한 비율) — 작을수록 같은 보의 두 모서리답다
                    var miss = (Math.abs(a.s - b.s) + Math.abs(a.e - b.e)) / (e - s);
                    cand.push({ o: o, c0: a.c, c1: b.c, s: s, e: e, la: a, lb: b, miss: miss });
                }
            }
        });
        cand.sort(function (p, q) { return p.miss - q.miss; });
        var kept = [];
        cand.forEach(function (c) {
            var clash = kept.some(function (k) {
                if (k.o !== c.o || (k.la !== c.la && k.la !== c.lb && k.lb !== c.la && k.lb !== c.lb)) return false;
                if (k.la === c.la && k.lb === c.lb) return false;
                return Math.min(k.e, c.e) - Math.max(k.s, c.s) > 0.3 * (c.e - c.s);
            });
            if (!clash) kept.push(c);
        });
        return kept.map(function (c) { return { o: c.o, c0: c.c0, c1: c.c1, s: c.s, e: c.e }; });
    }

    /** 띠가 덮는 구간 [s,e]에서 막는 것(네모들)이 걸친 구간을 뺀다 → [{ s, e, atS, atE }] (atS/atE = 그 끝이 막는 것에 닿음) */
    function cutBand(band, blockers, u, minLen) {
        var cuts = [];
        blockers.forEach(function (r) {
            var p0 = band.o === 'H' ? r.y0 : r.x0, p1 = band.o === 'H' ? r.y1 : r.x1;   // 막는 것의 가로지름 쪽 범위
            var a0 = band.o === 'H' ? r.x0 : r.y0, a1 = band.o === 'H' ? r.x1 : r.y1;   // 띠 방향 범위
            if (Math.min(p1, band.c1) - Math.max(p0, band.c0) < -0.2 * u) return;
            if (a1 < band.s - 0.5 * u || a0 > band.e + 0.5 * u) return;
            cuts.push([a0, a1]);
        });
        cuts.sort(function (p, q) { return p[0] - q[0]; });
        var near = 0.6 * u;
        var pieces = [], pos = band.s, atS = false;
        cuts.forEach(function (c) {
            // 띠 시작에 붙었거나(점선이 기둥 면 앞에서 멈춤) 시작을 덮은 것 → 다음 조각의 시작이 막힘
            if (c[1] <= pos + near) { atS = true; pos = Math.max(pos, c[1]); return; }
            if (c[0] > pos + near) pieces.push({ s: pos, e: Math.min(c[0], band.e), atS: atS, atE: true });
            pos = Math.max(pos, c[1]);
            atS = true;
        });
        if (band.e > pos + near) pieces.push({ s: pos, e: band.e, atS: atS, atE: false });
        return pieces.filter(function (pc) { return pc.e - pc.s >= minLen; });
    }

    function rectOfPiece(o, c0, c1, s, e) {
        return o === 'H' ? { x0: s, y0: c0, x1: e, y1: c1 } : { x0: c0, y0: s, x1: c1, y1: e };
    }
    function toMember(r, type, label, shape, extra) {
        var m = { type: type, label: label || '', shape: shape, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, w: r.x1 - r.x0, h: r.y1 - r.y0 };
        return extra ? Object.assign(m, extra) : m;
    }
    function letterOf(mark) {
        if (mark.letter) return mark.letter;
        var m = /([CWGBS])\d/.exec(String(mark.label || ''));
        return m ? m[1] : '';
    }

    /** 기둥·벽 이름: 가장 가까운 같은 종류 기호(가운데 거리 maxD 안) */
    function nearestLabel(r, marks, type, maxD) {
        var cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, best = '', bd = maxD;
        marks.forEach(function (m) {
            if (m.type !== type) return;
            // 네모 바깥 테두리까지의 거리
            var dx = Math.max(r.x0 - m.x, 0, m.x - r.x1), dy = Math.max(r.y0 - m.y, 0, m.y - r.y1);
            var d = Math.hypot(dx, dy) + 0.01 * Math.hypot(cx - m.x, cy - m.y);
            if (d < bd) { bd = d; best = m.label || ''; }
        });
        return best;
    }

    /**
     * 실제 도형 뽑기.
     * input: { paths, page:{w,h}, marks?: struct-marks detect 결과 members }
     * → { members:[{ type, label, shape:'column'|'wall'|'beam'|기호모양, x,y,w,h, guess? }], stats }
     */
    function extractShapes(input) {
        var page = input.page || { w: 842, h: 595 };
        var u = Math.hypot(page.w, page.h) / 1000;
        var marks = (input.marks || []).filter(function (m) { return m && !m.excluded; });
        var paths = input.paths || [];

        // 1) 칠한 면 → 기둥과 긴 칠(벽 또는 칠해 그린 보 — 아래 4)에서 기호로 가른다)
        var cols = [], strips = [];
        fillRects(paths, u).forEach(function (r) {
            var w = r.x1 - r.x0, h = r.y1 - r.y0, lo = Math.min(w, h), hi = Math.max(w, h);
            if (lo < 1 * u) return;
            if (hi / lo < 1.6 && hi <= 8 * u) cols.push(r); else strips.push(r);
        });
        strips = mergeWalls(strips, u);
        var supports = cols.concat(strips);

        // 2) 긴 칠 → 기둥에서 끊은 칸
        var pieces = [];
        strips.forEach(function (r) {
            var o = (r.x1 - r.x0) >= (r.y1 - r.y0) ? 'H' : 'V';
            var b = o === 'H' ? { o: o, c0: r.y0, c1: r.y1, s: r.x0, e: r.x1 } : { o: o, c0: r.x0, c1: r.x1, s: r.y0, e: r.y1 };
            cutBand(b, cols, u, 1.5 * u).forEach(function (pc) {
                pieces.push({ kind: 'fill', o: o, c0: b.c0, c1: b.c1, s: pc.s, e: pc.e, atS: pc.atS, atE: pc.atE, labels: [] });
            });
        });

        // 3) 점선 짝 → 띠 → 기둥·긴 칠에서 끊은 조각
        var bands = pairBands(dashedLines(paths, u), u);
        bands.forEach(function (b) {
            var width = b.c1 - b.c0;
            cutBand(b, supports, u, Math.max(2 * u, width)).forEach(function (pc) {
                pieces.push({ kind: 'dash', o: b.o, c0: b.c0, c1: b.c1, s: pc.s, e: pc.e, atS: pc.atS, atE: pc.atE, labels: [] });
            });
        });

        // 4) G·B 기호를 같은 방향 조각에 붙인다(조각과 나란히 누운 기호, 조각 모서리에서 14u 안의 가장 가까운 것)
        var beamMarks = marks.filter(function (m) { var L = letterOf(m); return L === 'G' || L === 'B'; });
        var unusedBeamLabels = 0;
        beamMarks.forEach(function (m) {
            var o = m.w >= m.h ? 'H' : 'V';
            var along = o === 'H' ? m.x : m.y, perp = o === 'H' ? m.y : m.x;
            var best = null, bd = 14 * u;
            pieces.forEach(function (pc) {
                if (pc.o !== o || along < pc.s - u || along > pc.e + u) return;
                var d = Math.max(0, Math.abs(perp - (pc.c0 + pc.c1) / 2) - (pc.c1 - pc.c0) / 2);
                if (d < bd) { bd = d; best = pc; }
            });
            if (best) best.labels.push({ label: m.label || '', letter: letterOf(m), along: along });
            else unusedBeamLabels++;
        });
        // 긴 칠: G·B 기호가 붙었으면 칠해 그린 보, 아니면 벽
        var walls = [];
        pieces = pieces.filter(function (pc) {
            if (pc.kind !== 'fill' || pc.labels.length) return true;
            walls.push(rectOfPiece(pc.o, pc.c0, pc.c1, pc.s, pc.e));
            return false;
        });
        var decide = function (labels, fallbackType) {
            if (!labels.length) return null;
            var g = labels.filter(function (l) { return l.letter === 'G'; }).length;
            var type = g * 2 >= labels.length ? '거더' : '빔';
            var cnt = {};
            labels.forEach(function (l) { cnt[l.label] = (cnt[l.label] || 0) + 1; });
            var label = Object.keys(cnt).sort(function (p, q) { return cnt[q] - cnt[p]; })[0] || '';
            return { type: type || fallbackType, label: label };
        };
        pieces.forEach(function (pc) {
            var d = decide(pc.labels);
            if (d) { pc.type = d.type; pc.label = d.label; pc.guess = false; }
            else { pc.type = pc.atS && pc.atE ? '거더' : '빔'; pc.label = ''; pc.guess = true; }
        });
        // 5) 단계별로 그린다(2026-10-15 사용자 요청): 기둥 → 거더 → 빔.
        //    조각을 같은 줄(같은 방향·같은 중심선)로 모은 뒤, 그 줄을 가로지르는 받침 사이를 한 칸으로 채운다.
        //      거더: 기둥·벽 면에서 면까지 / 빔: 기둥·벽·(먼저 만든) 거더 면에서 면까지.
        //    점선이 중간에 비어도 칸은 끊기지 않는다. 다만 조각이 칸 길이의 40% 이상 덮은 칸만 그린다(없는 보를 지어내지 않게).
        var runs = makeRuns(pieces, u);
        runs.forEach(function (R) {
            var d = decide(R.labels);
            if (d) { R.type = d.type; R.label = d.label; R.guess = false; }
            else {
                // 이름이 없으면: 양 끝이 받침에 닿은 조각이 있으면 거더, 아니면 빔으로 짐작
                R.type = R.pieces.some(function (pc) { return pc.atS && pc.atE; }) ? '거더' : '빔';
                R.label = ''; R.guess = true;
            }
        });
        var spanMembers = function (R, sup) {
            return spansOf(R, sup, u).map(function (sp) {
                var mine = R.labels.filter(function (l) { return l.along >= sp[0] - u && l.along <= sp[1] + u; });
                var dd = decide(mine);
                return { kind: R.kind, o: R.o, c0: R.mid - R.half, c1: R.mid + R.half, s: sp[0], e: sp[1], type: R.type,
                    label: dd ? dd.label : R.label, guess: R.guess };
            });
        };
        var base = cols.concat(walls);
        var girders = [];
        runs.filter(function (R) { return R.type === '거더'; }).forEach(function (R) { girders = girders.concat(spanMembers(R, base)); });
        girders = dedupeSpans(girders);
        var girderRects = girders.map(function (g) { return rectOfPiece(g.o, g.c0, g.c1, g.s, g.e); });
        var beamsOnly = [];
        runs.filter(function (R) { return R.type === '빔'; }).forEach(function (R) { beamsOnly = beamsOnly.concat(spanMembers(R, base.concat(girderRects))); });
        var beams = dedupeSpans(girders).concat(dedupeSpans(beamsOnly));

        // 6) 부재로 — 그리는 차례도 기둥 → 거더 → 빔
        var out = [];
        cols.forEach(function (r) { out.push(toMember(r, '기둥', nearestLabel(r, marks, '기둥', 12 * u), 'column')); });
        walls.forEach(function (r) { out.push(toMember(r, '벽', nearestLabel(r, marks, '벽', 12 * u), 'wall')); });
        beams.forEach(function (pc) {
            out.push(toMember(rectOfPiece(pc.o, pc.c0, pc.c1, pc.s, pc.e), pc.type, pc.label, 'beam', pc.guess ? { guess: true } : null));
        });
        marks.forEach(function (m) {
            if (m.type === '슬래브') out.push({ type: m.type, label: m.label || '', shape: m.shape || 'mark', x: m.x, y: m.y, w: m.w, h: m.h });
        });
        out.forEach(function (m, i) { m.id = 'ss_' + (i + 1); });
        return {
            members: out,
            stats: { columns: cols.length, walls: walls.length, beams: beams.length, girders: girders.length,
                filledBeams: beams.filter(function (b) { return b.kind === 'fill'; }).length,
                guessed: beams.filter(function (b) { return b.guess; }).length, unusedBeamLabels: unusedBeamLabels, bands: bands.length }
        };
    }

    /**
     * 겹친 칸 하나만: 같은 방향 칸이 두께 쪽으로 겹치고 길이 쪽으로 짧은 쪽의 절반 넘게 겹치면
     * (점선 셋이 나란해 옆 줄이 하나 더 생긴 것) 이름 있는 것 → 긴 것을 남긴다.
     */
    function dedupeSpans(list) {
        var sorted = list.slice().sort(function (p, q) { return ((q.label ? 1 : 0) - (p.label ? 1 : 0)) || ((q.e - q.s) - (p.e - p.s)); });
        var kept = [];
        sorted.forEach(function (c) {
            var dup = kept.some(function (k) {
                if (k.o !== c.o) return false;
                if (Math.min(k.c1, c.c1) - Math.max(k.c0, c.c0) <= 0) return false;
                return Math.min(k.e, c.e) - Math.max(k.s, c.s) > 0.5 * Math.min(k.e - k.s, c.e - c.s);
            });
            if (!dup) kept.push(c);
        });
        return list.filter(function (c) { return kept.indexOf(c) >= 0; });
    }

    /**
     * 조각 → 줄: 같은 방향·같은 중심선(0.8u 안)이고 서로 30u 안으로 이어지는 조각 묶음.
     * → [{ o, mid, half(두께 반), s, e, kind, pieces, labels, iv(조각이 덮은 구간들) }]
     */
    function makeRuns(pieces, u) {
        var groups = [];
        pieces.slice().sort(function (p, q) { return (p.o < q.o ? -1 : p.o > q.o ? 1 : 0) || ((p.c0 + p.c1) - (q.c0 + q.c1)); }).forEach(function (pc) {
            var mid = (pc.c0 + pc.c1) / 2;
            var g = groups.find(function (G) { return G.o === pc.o && Math.abs(G.mid - mid) <= 0.8 * u; });
            if (!g) { g = { o: pc.o, mid: mid, list: [] }; groups.push(g); }
            g.list.push(pc);
        });
        var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; };
        var runs = [];
        groups.forEach(function (G) {
            G.list.sort(function (p, q) { return p.s - q.s; });
            var cur = null;
            var flush = function () {
                if (!cur) return;
                var L = cur.pieces;
                cur.mid = med(L.map(function (pc) { return (pc.c0 + pc.c1) / 2; }));
                cur.half = med(L.map(function (pc) { return (pc.c1 - pc.c0) / 2; }));
                cur.kind = L.some(function (pc) { return pc.kind === 'fill'; }) ? 'fill' : 'dash';
                cur.labels = [].concat.apply([], L.map(function (pc) { return pc.labels; }));
                // 덮은 구간(겹친 조각은 합침)
                cur.iv = [];
                L.forEach(function (pc) {
                    var last = cur.iv[cur.iv.length - 1];
                    if (last && pc.s <= last[1]) last[1] = Math.max(last[1], pc.e); else cur.iv.push([pc.s, pc.e]);
                });
                runs.push(cur);
            };
            G.list.forEach(function (pc) {
                if (cur && pc.s - cur.e <= 30 * u) { cur.e = Math.max(cur.e, pc.e); cur.pieces.push(pc); }
                else { flush(); cur = { o: G.o, s: pc.s, e: pc.e, pieces: [pc] }; }
            });
            flush();
        });
        return runs;
    }

    /**
     * 한 줄을 받침(가로지르는 네모들) 사이 칸으로 → [[s, e], …] (받침 면에서 면까지).
     * 줄과 나란히 길게 누운 받침(같은 줄 위의 다른 보 등)은 받침이 아니다. 받침이 하나도 없으면 이름 있는 줄만 통째로.
     */
    function spansOf(R, supports, u) {
        var tol = R.half + 0.5 * u;
        var iv = [];
        supports.forEach(function (r) {
            var p0 = R.o === 'H' ? r.y0 : r.x0, p1 = R.o === 'H' ? r.y1 : r.x1;
            var a0 = R.o === 'H' ? r.x0 : r.y0, a1 = R.o === 'H' ? r.x1 : r.y1;
            if (p0 > R.mid + tol || p1 < R.mid - tol) return;            // 줄을 안 지난다
            if ((a1 - a0) > 1.5 * (p1 - p0)) return;                      // 줄과 나란히 누운 것
            if (a1 < R.s - 15 * u || a0 > R.e + 15 * u) return;           // 줄 끝에서 멀다(점선이 기둥 조금 앞에서 멈춘 것은 기둥까지 잇는다)
            iv.push([a0, a1]);
        });
        iv.sort(function (p, q) { return p[0] - q[0]; });
        var sup = [];
        iv.forEach(function (c) { var l = sup[sup.length - 1]; if (l && c[0] <= l[1]) l[1] = Math.max(l[1], c[1]); else sup.push([c[0], c[1]]); });
        var covered = function (lo, hi) {
            var n = 0;
            R.iv.forEach(function (c) { n += Math.max(0, Math.min(hi, c[1]) - Math.max(lo, c[0])); });
            return n;
        };
        var minLen = Math.max(2 * u, 2 * R.half);
        var out = [];
        if (!sup.length) { if (R.labels.length && R.e - R.s >= minLen) out.push([R.s, R.e]); return out; }
        // 첫 받침 앞으로 내민 부분, 받침 사이 칸, 마지막 받침 뒤로 내민 부분
        if (sup[0][0] - R.s >= minLen) out.push([R.s, sup[0][0]]);
        for (var i = 0; i + 1 < sup.length; i++) {
            var lo = sup[i][1], hi = sup[i + 1][0];
            if (hi - lo >= minLen && covered(lo, hi) >= 0.4 * (hi - lo)) out.push([lo, hi]);
        }
        var lastSup = sup[sup.length - 1];
        if (R.e - lastSup[1] >= minLen) out.push([lastSup[1], R.e]);
        return out;
    }

    var api = { TYPE_OF_LETTER: TYPE_OF_LETTER, fillRects: fillRects, mergeWalls: mergeWalls, dashedLines: dashedLines, pairBands: pairBands,
        cutBand: cutBand, extractShapes: extractShapes };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structShapes = api; }
})(typeof window !== 'undefined' ? window : null);
