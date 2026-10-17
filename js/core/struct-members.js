/**
 * 구조 부재 레이어(2026-10-14) — 구조도에서 가져온 기둥·벽·거더·빔·슬래브 기호를 층 도면 위에 둔다.
 * 결함이 아니다: 화면 전용. 한글·PDF·그림 내보내기·엑셀에 안 들어간다(DOM 위에만 그림).
 * 부재 수 점(member-count)·가이드(guide-shapes)와는 따로 둔 별도 자료다.
 *
 * state.structMembers[층키] = [{ id, type, label, x, y, w, h, createdAt, updatedAt }]
 *   - x,y = 기호 가운데, w,h = 기호 크기. 도면 원본 픽셀 좌표(결함 x/y와 같은 좌표계).
 *   - 층 묶음(pack.structMembers)에 실어 가이드와 같은 규칙(updatedAt·묘비)으로 합친다.
 *   - 고칠 때마다 updatedAt = max(now, 이전+1) — 늦게 고친 기기가 이긴다.
 * 화면(겹쳐 보기·옮기기·가져오기)은 js/tabs/struct-layer.js — 쓸 때만 불러온다.
 *
 * 구조도 그림(2026-10-14): state.structOverlays[층키] = { url, storagePath, x0, y0, x1, y1, fit:{a,b,tx,ty}, color, updatedAt }
 *   - 구조도 PDF의 한 부분(x0~y1, 구조도 쪽 좌표)을 색 입힌 반투명 그림(PNG)으로 만들어 클라우드(Storage)에 올리고,
 *     층 도면에는 fit(기준점 2개 맞춤)으로 겹친다. 층 묶음에는 주소·위치만 싣는다(그림 본문은 Storage).
 *   - 뺄 때는 { removed:true, updatedAt } 을 남겨 다른 기기에서도 빠진다. 합칠 때는 updatedAt 나중 것이 이긴다.
 * 구조도 페이지 → 앱 넘기기: 같은 브라우저의 IndexedDB(bsa_struct_handoff) — 그림이 커서 localStorage에는 못 담는다.
 */
(function (root) {
    'use strict';

    // 저장된 자료가 가질 수 있는 종류(옛 벽·슬래브 자료도 깨지지 않게 그대로).
    // 통심선(2026-10-17): 구조도 없는 층에서 평면도 위에 먼저 긋는 그리드 선 — 세로선은 w<h, 가로선은 w>h 인 가는 막대로 둔다.
    //   부재가 아니라 개수·평가에 안 들어가고(ACTIVE 밖), 기둥을 찍거나 옮길 때 교차점에 붙는 기준이 된다.
    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브', '통심선'];
    var ACTIVE_TYPES = ['기둥', '거더', '빔'];                   // 지금 화면에서 다루는 종류(벽·슬래브는 우선 뺌, 2026-10-14)
    var GRID_TYPE = '통심선';
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#b7791f', '슬래브': '#16a34a', '통심선': '#0d9488' };   // 기둥 빨강 · 거더 파랑 · 빔 황토 · 통심선 청록

    function ensureMaps(st) {
        if (!st.structMembers || typeof st.structMembers !== 'object') st.structMembers = {};
        if (!st.deletedStructMemberIds || typeof st.deletedStructMemberIds !== 'object') st.deletedStructMemberIds = {};
        if (!st.deletedStructMemberAt || typeof st.deletedStructMemberAt !== 'object') st.deletedStructMemberAt = {};
        if (!st.structOverlays || typeof st.structOverlays !== 'object') st.structOverlays = {};
        return st;
    }
    function num(v) { return Math.round(Number(v) * 10) / 10; }
    function valid(d) {
        return !!(d && d.id && TYPES.indexOf(d.type) >= 0
            && [d.x, d.y, d.w, d.h].every(function (v) { return Number.isFinite(Number(v)); }) && d.w > 0 && d.h > 0);
    }
    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.structMembers || {})[floorKey] || []).filter(valid);
    }
    function hasAny(st, floorKey) { return listFor(st, floorKey).length > 0; }
    function nextStamp(prev, now) { return Math.max(Number(now) || Date.now(), (Number(prev) || 0) + 1); }
    var _seq = 0;
    function newId(now) { _seq = (_seq + 1) % 100000; return 'st_' + now + '_' + _seq + '_' + Math.random().toString(36).slice(2, 7); }

    /** 부재 하나 추가 → 부재. rec: { type, label?, x, y, w, h } */
    function add(st, floorKey, rec, opts) {
        if (!st || !floorKey || !rec) return null;
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var d = { id: o.id || rec.id || newId(now), type: rec.type, label: String(rec.label == null ? '' : rec.label).slice(0, 12),
            x: num(rec.x), y: num(rec.y), w: num(rec.w), h: num(rec.h), createdAt: Number(o.createdAt) || now, updatedAt: now };
        // 비스듬한 거더·빔(2026-10-17): ang = 기운 각도(도, 화면 시계 방향 +). 이때 w = 길이, h = 두께, 가운데를 축으로 돌린 막대
        var ang = Number(rec.ang);
        if (Number.isFinite(ang) && Math.abs(ang) > 0.01) d.ang = Math.round(ang * 100) / 100;
        if (!valid(d)) return null;
        ensureMaps(st);
        if (!st.structMembers[floorKey]) st.structMembers[floorKey] = [];
        var ids = st.deletedStructMemberIds[floorKey];
        if (ids && ids.indexOf(d.id) >= 0) {
            // 되살리기(되돌리기): 묘비보다 늦은 시각이어야 합칠 때 이긴다
            var at = (st.deletedStructMemberAt[floorKey] || {})[d.id];
            d.updatedAt = nextStamp(at, now);
            st.deletedStructMemberIds[floorKey] = ids.filter(function (k) { return k !== d.id; });
            if (st.deletedStructMemberAt[floorKey]) delete st.deletedStructMemberAt[floorKey][d.id];
        }
        st.structMembers[floorKey] = st.structMembers[floorKey].filter(function (x) { return x && x.id !== d.id; }).concat([d]);
        return d;
    }

    /** 옮기기·종류·기호 고치기 → 고친 부재 */
    function update(st, floorKey, id, patch, now) {
        var d = listFor(st, floorKey).find(function (x) { return x.id === id; });
        if (!d || !patch) return null;
        ['x', 'y', 'w', 'h'].forEach(function (k) { if (patch[k] != null && Number.isFinite(Number(patch[k]))) d[k] = num(patch[k]); });
        if (patch.type != null && TYPES.indexOf(patch.type) >= 0) d.type = patch.type;
        if (patch.label != null) d.label = String(patch.label).slice(0, 12);
        if (patch.ang != null) {
            var a = Number(patch.ang);
            if (Number.isFinite(a) && Math.abs(a) > 0.01) d.ang = Math.round(a * 100) / 100; else delete d.ang;
        }
        d.updatedAt = nextStamp(d.updatedAt, now);
        return d;
    }

    function remove(st, floorKey, id) {
        if (!st || !floorKey || !id) return null;
        ensureMaps(st);
        var list = st.structMembers[floorKey] || [];
        var rec = list.find(function (d) { return d && d.id === id; });
        if (!rec) return null;
        st.structMembers[floorKey] = list.filter(function (d) { return d && d.id !== id; });
        var ids = st.deletedStructMemberIds[floorKey] || [];
        if (ids.indexOf(id) < 0) ids = ids.concat([id]);
        st.deletedStructMemberIds[floorKey] = ids;
        if (!st.deletedStructMemberAt[floorKey]) st.deletedStructMemberAt[floorKey] = {};
        // 묘비 = 이 기기가 본 마지막 수정 시각(다른 기기가 그 뒤에 고친 것은 살아남는다 — sync-merge 규칙)
        st.deletedStructMemberAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return Object.assign({}, rec);
    }

    /**
     * 되돌리기·다시 하기(2026-10-14): 부재 하나를 기록해 둔 모습(rec)으로 맞춘다. rec = null 이면 없앤다.
     * 바뀐 부재만 건드리므로 그 사이 다른 기기에서 들어온 부재는 그대로 둔다. → 바뀌었으면 true
     */
    function applyRecord(st, floorKey, id, rec, now) {
        if (!st || !floorKey || !id) return false;
        var cur = listFor(st, floorKey).find(function (d) { return d.id === id; });
        if (!rec) return !!(cur && remove(st, floorKey, id));
        if (cur) return !!update(st, floorKey, id, { x: rec.x, y: rec.y, w: rec.w, h: rec.h, type: rec.type, label: rec.label, ang: rec.ang || 0 }, now);
        return !!add(st, floorKey, rec, { id: id, createdAt: rec.createdAt, now: now });
    }

    /** 이 층 부재를 모두 지운다(묘비를 남겨 다른 기기에도 지워진다) → 지운 개수 */
    function clear(st, floorKey) {
        var list = listFor(st, floorKey).slice();
        list.forEach(function (d) { remove(st, floorKey, d.id); });
        return list.length;
    }

    /**
     * 거더·빔 두께 통일(2026-10-14): 종류마다 두께(짧은 변)를 그 종류의 중간값으로 맞춘다. 길이·중심선은 그대로.
     * list 의 사본을 돌려준다. 다른 종류(기둥 등)는 그대로.
     */
    var BEAM_TYPES = ['거더', '빔'];
    function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return s.length ? s[Math.floor(s.length / 2)] : 0; }
    function beamThickness(list) {
        var out = {};
        BEAM_TYPES.forEach(function (t) {
            var v = (list || []).filter(function (d) { return d && d.type === t; }).map(function (d) { return Math.min(d.w, d.h); });
            if (v.length) out[t] = median(v);
        });
        return out;
    }
    function unifyThickness(list) {
        var th = beamThickness(list);
        return (list || []).map(function (d) {
            var t = d && th[d.type];
            if (!t) return d;
            var c = Object.assign({}, d);
            if (c.w >= c.h) c.h = t; else c.w = t;
            return c;
        });
    }
    /** 기둥 크기(2026-10-16): 모든 기둥을 같은 크기의 정사각형으로 — 한 변 = 기둥 (가로+세로)/2 의 중간값. 가운데는 그대로 */
    function columnSize(list) {
        var v = (list || []).filter(function (d) { return d && d.type === '기둥'; }).map(function (d) { return (d.w + d.h) / 2; });
        return v.length ? median(v) : 0;
    }
    function unifyColumns(list) {
        var side = columnSize(list);
        if (!side) return (list || []).slice();
        return (list || []).map(function (d) { return d && d.type === '기둥' ? Object.assign({}, d, { w: side, h: side }) : d; });
    }

    function countsByType(list) {
        var out = {};
        TYPES.forEach(function (t) { if (t !== GRID_TYPE) out[t] = 0; });   // 통심선은 부재가 아니라 세지 않는다
        (list || []).forEach(function (d) { if (out[d.type] != null) out[d.type]++; });
        return out;
    }

    /**
     * 구조도 좌표 → 층 도면 좌표 맞춤(늘이기·돌리기·옮기기, 뒤집기는 없음).
     * 구조도에서 찍은 기준점 둘(s1, s2)이 층 도면의 두 점(a1, a2)에 오도록 한다.
     * → { a, b, tx, ty, scale, angle } : X = a·x − b·y + tx, Y = b·x + a·y + ty. 두 기준점이 너무 가까우면 null.
     */
    function fitTwoPoints(s1, s2, a1, a2) {
        var sx = s2.x - s1.x, sy = s2.y - s1.y, ax = a2.x - a1.x, ay = a2.y - a1.y;
        var den = sx * sx + sy * sy;
        if (!(den > 1e-6) || !(ax * ax + ay * ay > 1e-6)) return null;
        var a = (ax * sx + ay * sy) / den, b = (ay * sx - ax * sy) / den;
        return { a: a, b: b, tx: a1.x - (a * s1.x - b * s1.y), ty: a1.y - (b * s1.x + a * s1.y),
            scale: Math.hypot(a, b), angle: Math.atan2(b, a) * 180 / Math.PI };
    }
    /** 맞춤을 부재 하나에 적용 → { x, y, w, h }. 90°쯤 돌아간 맞춤이면 가로·세로 크기를 바꾼다. */
    function applyFit(fit, m) {
        var quarter = Math.abs(Math.round(fit.angle / 90)) % 2 === 1;
        return { x: fit.a * m.x - fit.b * m.y + fit.tx, y: fit.b * m.x + fit.a * m.y + fit.ty,
            w: (quarter ? m.h : m.w) * fit.scale, h: (quarter ? m.w : m.h) * fit.scale };
    }

    /**
     * 구조도에서 찾은 부재를 이 층에 들인다. 이 층에 있던 부재는 모두 지우고(묘비) 새로 넣는다.
     * members: [{ type, label, x, y, w, h }] (구조도 좌표), fit: fitTwoPoints 결과 → 넣은 개수
     */
    function importMembers(st, floorKey, members, fit, now) {
        if (!st || !floorKey || !fit) return 0;
        clear(st, floorKey);
        var t = Number(now) || Date.now();
        var n = 0;
        (members || []).forEach(function (m) {
            var p = applyFit(fit, m);
            if (add(st, floorKey, { type: m.type, label: m.label, x: p.x, y: p.y, w: p.w, h: p.h }, { now: t })) n++;
        });
        return n;
    }

    /**
     * 기둥 줄(2026-10-17): 기둥 2개 이상이 가로(h)·세로(v)로, 또는 조금 기울어(maxDeg 안) 늘어선 줄을 찾는다.
     * 기둥은 세로줄 하나·가로줄 하나에만 든다(많이 늘어선 줄부터). tol = 줄에서 벗어나도 되는 거리(도면 픽셀).
     * → [{ dir:'v'|'h', ids:[…], p0:{x,y}, p1:{x,y} }]  p0·p1 = 줄 양 끝(맨 끝 기둥 가운데를 줄에 내린 점)
     */
    function columnLines(list, tol, maxDeg) {
        var cols = (list || []).filter(function (d) { return d && d.type === '기둥' && Number.isFinite(d.x) && Number.isFinite(d.y); });
        var lim = Math.tan(((maxDeg == null ? 30 : maxDeg) * Math.PI) / 180), t = Math.max(1e-6, Number(tol) || 0);
        var out = [];
        ['v', 'h'].forEach(function (dir) {
            // 세로줄은 x = a + b·y, 가로줄은 y = a + b·x 로 본다(u = 줄을 따라가는 좌표, w = 가로지르는 좌표)
            var U = function (d) { return dir === 'v' ? d.y : d.x; }, W = function (d) { return dir === 'v' ? d.x : d.y; };
            var cands = [], seen = {};
            for (var i = 0; i < cols.length; i++) {
                for (var j = i + 1; j < cols.length; j++) {
                    var du = U(cols[j]) - U(cols[i]);
                    if (Math.abs(du) < 1e-9) continue;
                    var b = (W(cols[j]) - W(cols[i])) / du;
                    if (Math.abs(b) > lim) continue;
                    var a = W(cols[i]) - b * U(cols[i]);
                    var k = Math.sqrt(1 + b * b);
                    var mem = cols.filter(function (d) { return Math.abs(W(d) - (a + b * U(d))) / k <= t; });
                    if (mem.length < 2) continue;
                    var key = mem.map(function (d) { return d.id; }).sort().join('|');
                    if (seen[key]) continue;
                    seen[key] = true;
                    cands.push(mem);
                }
            }
            // 많이 늘어선 줄부터, 같으면 덜 기운 줄부터
            var slope = function (mem) {
                var n = mem.length, su = 0, sw = 0, suu = 0, suw = 0;
                mem.forEach(function (d) { su += U(d); sw += W(d); suu += U(d) * U(d); suw += U(d) * W(d); });
                var den = n * suu - su * su;
                var b = Math.abs(den) < 1e-9 ? 0 : (n * suw - su * sw) / den;
                return { a: (sw - b * su) / n, b: b };
            };
            cands.sort(function (p, q) { return q.length - p.length || Math.abs(slope(p).b) - Math.abs(slope(q).b); });
            var used = {};
            cands.forEach(function (mem) {
                var free = mem.filter(function (d) { return !used[d.id]; });
                if (free.length < 2 || free.length < mem.length) return;   // 이미 다른 줄에 든 기둥이 섞이면 버림
                free.forEach(function (d) { used[d.id] = true; });
                var f = slope(free);
                var us = free.map(U), u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us);
                var P = function (u) { var w = f.a + f.b * u; return dir === 'v' ? { x: w, y: u } : { x: u, y: w }; };
                out.push({ dir: dir, ids: free.map(function (d) { return d.id; }), p0: P(u0), p1: P(u1) });
            });
        });
        return out;
    }
    // ---------- 통심선(2026-10-17) ----------
    /** 통심선 방향: 세로선 'v'(x 위치) · 가로선 'h'(y 위치) */
    function gridAxis(d) { return d.h >= d.w ? 'v' : 'h'; }
    function gridPos(d) { return gridAxis(d) === 'v' ? d.x : d.y; }
    /** 통심선 이름: 세로선은 왼쪽부터 X1, X2…, 가로선은 위부터 Y1, Y2… → { id: 'X1' } */
    function gridLabels(grids) {
        var out = {};
        ['v', 'h'].forEach(function (ax) {
            (grids || []).filter(function (g) { return gridAxis(g) === ax; })
                .sort(function (a, b) { return gridPos(a) - gridPos(b); })
                .forEach(function (g, i) { out[g.id] = (ax === 'v' ? 'X' : 'Y') + (i + 1); });
        });
        return out;
    }
    /** 통심선 한 줄(전체 길이 W 또는 H에 걸침)의 저장 모습. axis 'v'|'h', pos = x 또는 y */
    function gridRecord(axis, pos, imgW, imgH) {
        return axis === 'v' ? { type: GRID_TYPE, label: '', x: pos, y: imgH / 2, w: 1, h: imgH }
            : { type: GRID_TYPE, label: '', x: imgW / 2, y: pos, w: imgW, h: 1 };
    }
    /**
     * 기둥 자리를 통심선에 붙인다: x는 세로선, y는 가로선 중 reach 안에서 가장 가까운 것(따로따로 — 둘 다 붙으면 교차점).
     * → { x, y, onX(붙은 세로선 x|null), onY }
     */
    function snapToGrid(x, y, grids, reach) {
        var bx = x, by = y, dx = reach, dy = reach, onX = null, onY = null;
        (grids || []).forEach(function (g) {
            var v = gridPos(g);
            if (gridAxis(g) === 'v') { if (Math.abs(v - x) <= dx) { dx = Math.abs(v - x); bx = v; onX = v; } }
            else if (Math.abs(v - y) <= dy) { dy = Math.abs(v - y); by = v; onY = v; }
        });
        return { x: bx, y: by, onX: onX, onY: onY };
    }

    /**
     * 통심선 교차점 중 기둥이 아직 없는 곳(2026-10-17, 「교차점 기둥」 한 번에 넣기).
     * 이미 기둥 가운데가 교차점에서 (그 기둥 반폭) 안이면 있는 것으로 본다. → [{ x, y }]
     */
    function emptyGridCrossings(grids, members) {
        var xs = [], ys = [];
        (grids || []).forEach(function (g) {
            var arr = gridAxis(g) === 'v' ? xs : ys, v = gridPos(g);
            if (!arr.some(function (q) { return Math.abs(q - v) < 0.5; })) arr.push(v);
        });
        var cols = (members || []).filter(function (d) { return d && d.type === '기둥'; });
        var out = [];
        xs.sort(function (a, b) { return a - b; }).forEach(function (x) {
            ys.slice().sort(function (a, b) { return a - b; }).forEach(function (y) {
                var taken = cols.some(function (d) { return Math.abs(d.x - x) <= Math.max(d.w / 2, 1) && Math.abs(d.y - y) <= Math.max(d.h / 2, 1); });
                if (!taken) out.push({ x: x, y: y });
            });
        });
        return out;
    }

    /** 점 p를 중심 c로 ang(라디안) 돌린 점 */
    function rotateAbout(p, c, ang) {
        var cs = Math.cos(ang), sn = Math.sin(ang), dx = p.x - c.x, dy = p.y - c.y;
        return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
    }

    /** 점 (x,y)를 부재 d 기준 좌표로: u = 막대 방향(가로 w 쪽), v = 가로지르는 방향(세로 h 쪽). 각도 없으면 그냥 가운데 기준 */
    function toLocal(d, x, y) {
        var dx = x - d.x, dy = y - d.y, a = (Number(d.ang) || 0) * Math.PI / 180;
        if (!a) return { u: dx, v: dy };
        var c = Math.cos(a), s = Math.sin(a);
        return { u: dx * c + dy * s, v: -dx * s + dy * c };
    }
    /** 막대 d의 양 끝 점(비스듬한 것 포함) — [시작, 끝] */
    function barEnds(d) {
        var a = (Number(d.ang) || 0) * Math.PI / 180;
        if (!a) return d.w >= d.h ? [{ x: d.x - d.w / 2, y: d.y }, { x: d.x + d.w / 2, y: d.y }] : [{ x: d.x, y: d.y - d.h / 2 }, { x: d.x, y: d.y + d.h / 2 }];
        var c = Math.cos(a) * d.w / 2, s = Math.sin(a) * d.w / 2;
        return [{ x: d.x - c, y: d.y - s }, { x: d.x + c, y: d.y + s }];
    }
    /** 가운데에서 방향 (ux,uy)로 나가 네모(반폭 hx·hy) 면에 닿는 거리 */
    function faceDist(hx, hy, ux, uy) {
        var a = Math.abs(ux) > 1e-9 ? hx / Math.abs(ux) : Infinity, b = Math.abs(uy) > 1e-9 ? hy / Math.abs(uy) : Infinity;
        var t = Math.min(a, b);
        return Number.isFinite(t) ? t : 0;
    }
    /**
     * 비스듬한 보 그리기(2026-10-17): 중심 s→a 사이에 비스듬한 막대를 놓고, 길 위의 받침(cutters)에서 끊는다.
     * s·a = { x, y, hx, hy }(hx·hy = 그 끝이 붙은 기둥 반폭, 없으면 0), th = 두께.
     * 받침: 기둥은 가운데가 길에서 (반폭) 안이면, 보는 그 보의 중심선과 길이 만나면 그 자리에서 끊는다.
     * → [{ x, y, w(길이), h(두께), ang(도) }]
     */
    function slantedRun(s, a, th, cutters) {
        var dx = a.x - s.x, dy = a.y - s.y, L = Math.hypot(dx, dy);
        if (!(L > 0)) return [];
        var ux = dx / L, uy = dy / L;
        var from = faceDist(s.hx || 0, s.hy || 0, ux, uy), to = L - faceDist(a.hx || 0, a.hy || 0, ux, uy);
        var cuts = [];
        (cutters || []).forEach(function (d) {
            if (!d) return;
            if (d.type === '기둥') {
                var px = d.x - s.x, py = d.y - s.y, t = px * ux + py * uy, perp = Math.abs(-px * uy + py * ux);
                if (perp > Math.max(d.w, d.h) / 2) return;
                var f = faceDist(d.w / 2, d.h / 2, ux, uy);
                if (t + f <= from || t - f >= to) return;
                cuts.push([Math.max(from, t - f), Math.min(to, t + f)]);
            } else {
                // 보: 중심선끼리 만나는 곳
                var e = barEnds(d), ex = e[1].x - e[0].x, ey = e[1].y - e[0].y;
                var den = ux * ey - uy * ex;
                if (Math.abs(den) < 1e-9) return;   // 나란함
                var wx = e[0].x - s.x, wy = e[0].y - s.y;
                var tt = (wx * ey - wy * ex) / den, k = (wx * uy - wy * ux) / den;
                if (k < 0 || k > 1 || tt <= from || tt >= to) return;
                var sinA = Math.abs(den) / Math.hypot(ex, ey), half = Math.min(d.w, d.h) / 2 / Math.max(sinA, 0.2);
                cuts.push([Math.max(from, tt - half), Math.min(to, tt + half)]);
            }
        });
        cuts.sort(function (p, q) { return p[0] - q[0]; });
        var segs = [], cur = from;
        cuts.forEach(function (c) { if (c[0] > cur) segs.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
        if (to > cur) segs.push([cur, to]);
        var deg = Math.atan2(uy, ux) * 180 / Math.PI;
        return segs.filter(function (g) { return g[1] - g[0] > th * 0.5; }).map(function (g) {
            var m = (g[0] + g[1]) / 2;
            return { x: s.x + ux * m, y: s.y + uy * m, w: g[1] - g[0], h: th, ang: Math.round(deg * 100) / 100 };
        });
    }

    /** 도면 좌표 점에 걸린 부재(작은 것 우선). pad = 여유(도면 픽셀) */
    function hitTest(list, x, y, pad) {
        var best = null, bestArea = Infinity;
        (list || []).forEach(function (d) {
            var q = toLocal(d, x, y);   // 비스듬한 보는 막대 방향으로 돌려 본다
            if (Math.abs(q.u) > d.w / 2 + (pad || 0) || Math.abs(q.v) > d.h / 2 + (pad || 0)) return;
            var area = d.w * d.h;
            if (area < bestArea) { bestArea = area; best = d; }
        });
        return best;
    }

    /**
     * 이어 그리기 끊기(2026-10-16): 시작→끝 사이를 가로지르는 부재(cutters)에서 보를 끊어 여러 칸으로 나눈다.
     * 거더는 중간 기둥에서, 빔은 중간 거더(·기둥)에서 끊고 그 다음부터 다시 시작한다.
     * run: { horiz, from, to, perp, minLen } (from·to = 보가 지나는 방향 좌표, perp = 중심선)
     * 중심선이 그 부재를 지나고, 부재가 from~to 안쪽에 걸쳐 있을 때만 끊는다. → [{ from, to }, …] (짧은 조각은 뺀다)
     */
    function splitRun(run, cutters) {
        var horiz = !!run.horiz, from = Number(run.from), to = Number(run.to), perp = Number(run.perp);
        var minLen = Math.max(0, Number(run.minLen) || 0);
        var cuts = [];
        (cutters || []).forEach(function (d) {
            if (!d) return;
            var a0 = horiz ? d.x - d.w / 2 : d.y - d.h / 2, a1 = horiz ? d.x + d.w / 2 : d.y + d.h / 2;
            var p0 = horiz ? d.y - d.h / 2 : d.x - d.w / 2, p1 = horiz ? d.y + d.h / 2 : d.x + d.w / 2;
            if (perp < p0 || perp > p1) return;            // 중심선이 안 지나감
            if (a1 <= from || a0 >= to) return;            // 구간 밖(양 끝 기둥 면 바깥)
            cuts.push([Math.max(a0, from), Math.min(a1, to)]);
        });
        cuts.sort(function (p, q) { return p[0] - q[0]; });
        var out = [], cur = from;
        cuts.forEach(function (c) {
            if (c[0] > cur) out.push({ from: cur, to: c[0] });
            cur = Math.max(cur, c[1]);
        });
        if (to > cur) out.push({ from: cur, to: to });
        return out.filter(function (s) { return s.to - s.from > minLen; });
    }

    // ---------- 구조도 그림 ----------
    function validOverlay(o) {
        return !!(o && !o.removed && typeof o.url === 'string' && o.url && o.fit
            && [o.x0, o.y0, o.x1, o.y1, o.fit.a, o.fit.b, o.fit.tx, o.fit.ty].every(function (v) { return Number.isFinite(Number(v)); })
            && o.x1 > o.x0 && o.y1 > o.y0);
    }
    /** 이 층 구조도 그림(없거나 뺐으면 null) */
    function overlayFor(st, floorKey) {
        var o = ((st && st.structOverlays) || {})[floorKey];
        return validOverlay(o) ? o : null;
    }
    /** 구조도 그림 두기 → 둔 것(시각은 앞으로만 간다) */
    function setOverlay(st, floorKey, rec, now) {
        if (!st || !floorKey || !rec) return null;
        ensureMaps(st);
        var prev = st.structOverlays[floorKey];
        var o = { url: rec.url, storagePath: rec.storagePath || '', x0: num(rec.x0), y0: num(rec.y0), x1: num(rec.x1), y1: num(rec.y1),
            fit: { a: Number(rec.fit && rec.fit.a), b: Number(rec.fit && rec.fit.b), tx: Number(rec.fit && rec.fit.tx), ty: Number(rec.fit && rec.fit.ty) },
            color: rec.color || '', updatedAt: nextStamp(prev && prev.updatedAt, now) };
        if (!validOverlay(o)) return null;
        st.structOverlays[floorKey] = o;
        return o;
    }
    /** 구조도 그림 빼기(다른 기기에도 빠지게 표시를 남긴다) → 뺀 그림 또는 null */
    function removeOverlay(st, floorKey, now) {
        var o = overlayFor(st, floorKey);
        if (!o) return null;
        st.structOverlays[floorKey] = { removed: true, updatedAt: nextStamp(o.updatedAt, now) };
        return o;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedStructMemberIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedStructMemberAt) || {})[floorKey] || {},
            overlay: ((st && st.structOverlays) || {})[floorKey] || null
        };
    }
    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length) || pack.overlay));
    }
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one((pack.items || []).filter(valid)), st.structMembers, one(pack.deletedIds || []), st.deletedStructMemberIds,
            one(pack.deletedAt || {}), st.deletedStructMemberAt);
        st.structMembers = r.ndtData;
        st.deletedStructMemberIds = r.deletedNdtIds;
        st.deletedStructMemberAt = r.deletedNdtAt || {};
        // 구조도 그림: 늦게 바꾼 쪽이 이긴다
        var inc = pack.overlay;
        if (inc && (inc.removed || validOverlay(inc)) && Number.isFinite(Number(inc.updatedAt))) {
            var cur = st.structOverlays[floorKey];
            if (!cur || Number(inc.updatedAt) > (Number(cur.updatedAt) || 0)) st.structOverlays[floorKey] = Object.assign({}, inc);
        }
        return true;
    }

    // ---------- 구조도 페이지 → 앱 넘기기(같은 브라우저 IndexedDB) ----------
    var HANDOFF_DB = 'bsa_struct_handoff', HANDOFF_STORE = 'h';
    function handoffDb() {
        return new Promise(function (resolve, reject) {
            if (typeof indexedDB === 'undefined') { reject(new Error('이 브라우저는 IndexedDB를 쓸 수 없습니다.')); return; }
            var req = indexedDB.open(HANDOFF_DB, 1);
            req.onupgradeneeded = function () { req.result.createObjectStore(HANDOFF_STORE); };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
        });
    }
    function handoffTx(mode, fn) {
        return handoffDb().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(HANDOFF_STORE, mode);
                var out = fn(tx.objectStore(HANDOFF_STORE));
                tx.oncomplete = function () { db.close(); resolve(out && 'result' in out ? out.result : undefined); };
                tx.onerror = function () { db.close(); reject(tx.error); };
            });
        });
    }
    /** data: { at, fileName, refs:[{x,y},{x,y}], members:[…], overlay?:{ blob, x0,y0,x1,y1, color } } */
    function saveHandoff(data) { return handoffTx('readwrite', function (s) { return s.put(data, 'latest'); }); }
    function loadHandoff() { return handoffTx('readonly', function (s) { return s.get('latest'); }); }

    var api = { TYPES: TYPES, ACTIVE_TYPES: ACTIVE_TYPES, COLORS: COLORS, ensureMaps: ensureMaps, listFor: listFor, hasAny: hasAny, add: add, update: update, remove: remove,
        applyRecord: applyRecord, clear: clear, beamThickness: beamThickness, unifyThickness: unifyThickness, countsByType: countsByType, fitTwoPoints: fitTwoPoints, applyFit: applyFit, importMembers: importMembers,
        hitTest: hitTest, splitRun: splitRun, columnLines: columnLines, rotateAbout: rotateAbout,
        toLocal: toLocal, barEnds: barEnds, faceDist: faceDist, slantedRun: slantedRun,
        GRID_TYPE: GRID_TYPE, gridAxis: gridAxis, gridPos: gridPos, gridLabels: gridLabels, gridRecord: gridRecord, snapToGrid: snapToGrid, emptyGridCrossings: emptyGridCrossings, columnSize: columnSize, unifyColumns: unifyColumns, overlayFor: overlayFor, setOverlay: setOverlay, removeOverlay: removeOverlay,
        saveHandoff: saveHandoff, loadHandoff: loadHandoff, packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structMembers = api; }
})(typeof window !== 'undefined' ? window : null);
