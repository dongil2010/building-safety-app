/**
 * 구조 부재 레이어 화면(2026-10-14) — 결함위치도 위에 구조 부재 기호를 반투명하게 겹쳐 보이고, 옮기기·지우기·추가·가져오기.
 * 이 파일은 쓸 때만 불러온다(app.js loadStructLayer). 자료·합치기는 js/core/struct-members.js.
 * 화면 전용: SVG(DOM)로만 그려서 한글·PDF·그림·엑셀 출력에는 들어가지 않는다.
 *
 * 그리기: 부재는 도면 좌표로 한 번만 만들고, 확대·이동 때는 묶음(g)의 변환 행렬만 바꾼다(부재가 수백 개여도 가볍다).
 * 구조도 그림: 구조도 PDF를 색 입힌 반투명 그림으로 깔고(번호표는 기본으로 숨김), 그림은 클라우드(Storage)에 올려 다른 기기와 나눈다.
 * 가져오기: 「구조도 부재」 페이지(struct-plan.html)가 IndexedDB(bsa_struct_handoff)에 넣어 둔 것을,
 *   층 도면에서 기준점 2개를 눌러 맞춘 뒤 이 층에 들인다(캐드 핀 가져오기와 같은 흐름).
 */
(function () {
    'use strict';

    var B = window.__bsaStructBridge;
    var api = window.BSA && window.BSA.structMembers;
    if (!B || !api) return;

    var NS = 'http://www.w3.org/2000/svg';
    var SHOW_KEY = 'bsa_struct_layer_show';
    var ALPHA_KEY = 'bsa_struct_layer_alpha';
    var MARKS_KEY = 'bsa_struct_marks_show';
    var ui = { barOpen: false, editing: false, selId: '', addType: '', drag: null, calib: null, builtSig: '' };

    function pref(key, dflt) { try { var v = localStorage.getItem(key); return v == null ? dflt : v; } catch (_e) { return dflt; } }
    function setPref(key, v) { try { localStorage.setItem(key, String(v)); } catch (_e) { /* ignore */ } }
    function showOn() { return pref(SHOW_KEY, '1') !== '0'; }
    /** 이 층의 구조도 그림(클라우드에 못 올려 이번 화면에서만 쓰는 것 포함) */
    function overlayNow() {
        var fk = B.floorKey();
        if (ui.tempOverlay && ui.tempOverlay.floorKey === fk) return ui.tempOverlay;
        return api.overlayFor(state(), fk);
    }
    /** 이름표(C1·1G2…) 보이기 — 기본은 숨김. 기둥·거더·빔 도형은 늘 보인다(2026-10-14). */
    function marksOn() { return pref(MARKS_KEY, '') === '1'; }
    function alpha() { var a = parseFloat(pref(ALPHA_KEY, '0.55')); return Number.isFinite(a) ? Math.min(1, Math.max(0.2, a)) : 0.55; }
    function toast(msg, kind, ms) { if (typeof window.showToast === 'function') window.showToast(msg, kind || 'info', ms || 2500); }
    function state() { return window.state; }
    // 지금은 기둥·거더·빔만 보이고 다룬다(예전에 넣은 벽·슬래브는 자료에 남겨 두고 화면에서만 뺀다, 2026-10-14)
    var ACTIVE = api.ACTIVE_TYPES || api.TYPES;
    function active(d) { return ACTIVE.indexOf(d.type) >= 0; }
    function list() { return api.listFor(state(), B.floorKey()).filter(active); }

    (function injectStyle() {
        if (document.getElementById('structLayerStyle')) return;
        var s = document.createElement('style');
        s.id = 'structLayerStyle';
        s.textContent = '.map-struct-overlay{position:absolute;pointer-events:none;overflow:hidden;z-index:6}'
            + '.map-struct-overlay.is-active{pointer-events:auto;cursor:crosshair}'
            + '.map-struct-overlay rect{vector-effect:non-scaling-stroke;stroke-width:2;fill-opacity:.5}'
            + '.map-struct-overlay rect.map-struct-handle{fill:#fff;fill-opacity:1;stroke-width:2.5;cursor:ew-resize}'
            + '.map-struct-overlay rect.is-selected{stroke-width:4;fill-opacity:.75;stroke-dasharray:6 3}'
            + '.map-struct-overlay text{font-weight:700;text-anchor:middle;dominant-baseline:central;pointer-events:none;paint-order:stroke;stroke:#fff;stroke-width:.18em}'
            + '.map-struct-bar .map-struct-hint{flex-basis:100%;font-size:.82rem;font-weight:700;color:#0369a1}';
        document.head.appendChild(s);
    })();

    // ---------- 겹쳐 그리기 ----------
    function getOverlay() {
        var canvas = B.canvas();
        var host = canvas && canvas.parentElement;
        if (!host) return null;
        var ov = document.getElementById('mapStructOverlay');
        if (!ov) {
            ov = document.createElementNS(NS, 'svg');
            ov.id = 'mapStructOverlay';
            ov.setAttribute('class', 'map-struct-overlay');
            ov.setAttribute('data-html2canvas-ignore', 'true');
            ov.setAttribute('aria-hidden', 'true');
            ov.appendChild(document.createElementNS(NS, 'g'));
            bindOverlay(ov);
        }
        if (ov.parentElement !== host) host.appendChild(ov);
        ov.style.left = canvas.offsetLeft + 'px';
        ov.style.top = canvas.offsetTop + 'px';
        ov.style.width = canvas.clientWidth + 'px';
        ov.style.height = canvas.clientHeight + 'px';
        return ov;
    }

    function visible() {
        return !!(B.hasDrawing() && B.onMapTab() && B.floorKey() && (showOn() || ui.editing));
    }

    /** drawCanvas(확대·이동·층 바꿈)마다 불린다 */
    function sync() {
        var ov = document.getElementById('mapStructOverlay');
        if (!visible()) {
            if (ov) { ov.style.display = 'none'; ov.classList.remove('is-active'); }
            syncBar();
            return;
        }
        ov = getOverlay();
        if (!ov) return;
        ov.style.display = '';
        ov.style.opacity = String(ui.editing ? Math.max(alpha(), 0.75) : alpha());
        ov.classList.toggle('is-active', ui.editing);
        var g = ov.firstChild;
        var items = list();
        var over = overlayNow();
        var showLabels = marksOn();
        if (ui.selId && !items.some(function (d) { return d.id === ui.selId; })) ui.selId = '';
        // 자료가 바뀌었을 때만 도형을 다시 만든다
        var sig = B.floorKey() + '|' + items.length + '|' + items.reduce(function (m, d) { return Math.max(m, d.updatedAt || 0); }, 0) + '|' + ui.selId
            + '|' + (over ? over.url + '@' + over.updatedAt : '') + '|' + showLabels + '|' + (ui.pend ? ui.pend.x + ',' + ui.pend.y : '');
        if (sig !== ui.builtSig) {
            ui.builtSig = sig;
            var frag = document.createDocumentFragment();
            if (over) {
                // 구조도 그림: 구조도 쪽 좌표로 놓고, 기준점 맞춤(fit)으로 층 도면 좌표에 얹는다
                var gi = document.createElementNS(NS, 'g');
                gi.setAttribute('transform', 'matrix(' + [over.fit.a, over.fit.b, -over.fit.b, over.fit.a, over.fit.tx, over.fit.ty].join(' ') + ')');
                var im = document.createElementNS(NS, 'image');
                im.setAttribute('href', over.url);
                im.setAttribute('x', over.x0); im.setAttribute('y', over.y0);
                im.setAttribute('width', over.x1 - over.x0); im.setAttribute('height', over.y1 - over.y0);
                im.setAttribute('preserveAspectRatio', 'none');
                gi.appendChild(im);
                frag.appendChild(gi);
            }
            items.forEach(function (d) {
                var c = api.COLORS[d.type] || '#111';
                var r = document.createElementNS(NS, 'rect');
                r.setAttribute('x', d.x - d.w / 2); r.setAttribute('y', d.y - d.h / 2);
                r.setAttribute('width', d.w); r.setAttribute('height', d.h);
                r.setAttribute('rx', Math.min(d.w, d.h) * 0.2);
                r.setAttribute('stroke', c); r.setAttribute('fill', c);
                if (d.id === ui.selId) r.setAttribute('class', 'is-selected');
                frag.appendChild(r);
                if (showLabels && d.label) {
                    var t = document.createElementNS(NS, 'text');
                    var wide = d.w >= d.h;
                    var fs = Math.min((wide ? d.h : d.w) * 0.62, (wide ? d.w : d.h) / Math.max(2, d.label.length) * 1.5);
                    t.setAttribute('x', d.x); t.setAttribute('y', d.y);
                    t.setAttribute('font-size', fs.toFixed(1));
                    t.setAttribute('fill', c);
                    if (!wide) t.setAttribute('transform', 'rotate(-90 ' + d.x + ' ' + d.y + ')');
                    t.textContent = d.label;
                    frag.appendChild(t);
                }
            });
            var selD = ui.editing && ui.selId && items.find(function (d) { return d.id === ui.selId; });
            if (selD && isLineType(selD.type)) {
                // 고른 거더·빔 양 끝 손잡이(잡고 끌면 그 끝만 늘이고 줄임)
                var px10 = Math.hypot(B.screenToImg(10, 0).x - B.screenToImg(0, 0).x, B.screenToImg(10, 0).y - B.screenToImg(0, 0).y);
                var hz = selD.w >= selD.h, th2 = hz ? selD.h : selD.w, hs = Math.max(th2 * 1.8, px10);   // 화면에서 적어도 10px
                [hz ? [selD.x - selD.w / 2, selD.y] : [selD.x, selD.y - selD.h / 2], hz ? [selD.x + selD.w / 2, selD.y] : [selD.x, selD.y + selD.h / 2]].forEach(function (q) {
                    var hr = document.createElementNS(NS, 'rect');
                    hr.setAttribute('x', q[0] - hs / 2); hr.setAttribute('y', q[1] - hs / 2);
                    hr.setAttribute('width', hs); hr.setAttribute('height', hs);
                    hr.setAttribute('class', 'map-struct-handle');
                    hr.setAttribute('stroke', api.COLORS[selD.type]);
                    frag.appendChild(hr);
                });
            }
            if (ui.pend) {
                // 거더·빔 시작 점 표시
                var pr = Math.max(lineThickness(ui.pend.type) * 1.6, ui.pend.hx, ui.pend.hy);
                var ci = document.createElementNS(NS, 'circle');
                ci.setAttribute('cx', ui.pend.x); ci.setAttribute('cy', ui.pend.y); ci.setAttribute('r', pr);
                ci.setAttribute('fill', 'none'); ci.setAttribute('stroke', api.COLORS[ui.pend.type] || '#111');
                ci.setAttribute('stroke-width', '3'); ci.setAttribute('vector-effect', 'non-scaling-stroke'); ci.setAttribute('stroke-dasharray', '5 3');
                frag.appendChild(ci);
            }
            g.replaceChildren(frag);
        }
        // 도면 좌표 → 화면 좌표 행렬(회전·확대·이동 모두 여기 담긴다)
        var o = B.imgToScreen({ x: 0, y: 0 }), px = B.imgToScreen({ x: 1, y: 0 }), py = B.imgToScreen({ x: 0, y: 1 });
        g.setAttribute('transform', 'matrix(' + [px.sx - o.sx, px.sy - o.sy, py.sx - o.sx, py.sy - o.sy, o.sx, o.sy].map(function (v) { return v.toFixed(4); }).join(' ') + ')');
        syncBar();
    }

    function commit() {
        B.commit(B.floorKey());
        sync();
    }

    // ---------- 되돌리기·다시 하기(층마다, 바뀐 부재만 기록) ----------
    // ui.hist[층키] = { undo: [묶음], redo: [묶음] }, 묶음 = [{ id, before, after }] (before/after = 부재 사본, 없으면 null)
    var HIST_MAX = 100;
    function hist(fk) {
        if (!ui.hist) ui.hist = {};
        if (!ui.hist[fk]) ui.hist[fk] = { undo: [], redo: [] };
        return ui.hist[fk];
    }
    function snap(d) { return d ? Object.assign({}, d) : null; }
    function pushHist(fk, changes) {
        var ch = (changes || []).filter(function (c) { return c && c.id; });
        if (!fk || !ch.length) return;
        var h = hist(fk);
        h.undo.push(ch);
        if (h.undo.length > HIST_MAX) h.undo.shift();
        h.redo = [];
    }
    function stepHist(back) {
        var fk = B.floorKey();
        var h = hist(fk);
        var from = back ? h.undo : h.redo;
        var ch = from.pop();
        if (!ch) { toast(back ? '되돌릴 것이 없습니다.' : '다시 할 것이 없습니다.', 'info', 1600); syncBar(); return; }
        // 되돌리기는 거꾸로, 다시 하기는 차례대로
        (back ? ch.slice().reverse() : ch).forEach(function (c) { api.applyRecord(state(), fk, c.id, back ? c.before : c.after); });
        (back ? h.redo : h.undo).push(ch);
        if (ui.selId && !list().some(function (d) { return d.id === ui.selId; })) ui.selId = '';
        ui.builtSig = '';
        commit();
    }
    function undo() { stepHist(true); }
    function redo() { stepHist(false); }

    // ---------- 옮기기·고르기·추가 ----------
    function local(e) {
        var r = B.canvas().getBoundingClientRect();
        return B.screenToImg(e.clientX - r.left, e.clientY - r.top);
    }
    function defaultSize(type) {
        var same = list().filter(function (d) { return d.type === type; });
        var src = same.length ? same : list();
        if (!src.length) { var c = B.canvas(); var p0 = B.screenToImg(0, 0), p1 = B.screenToImg(60, 0); var s = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 60; return { w: s, h: s * 0.5 }; }
        var med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; };
        if (type === '거더' || type === '빔') {
            // 보는 가로 막대로: 두께 = 그 종류 두께(통일값), 길이 = 그 종류 길이의 중간값
            var thick = (api.beamThickness ? api.beamThickness(list())[type] : 0) || med(src.map(function (d) { return Math.min(d.w, d.h); }));
            var len = med(src.map(function (d) { return Math.max(d.w, d.h); }));
            return { w: Math.max(len, thick * 3), h: thick };
        }
        return { w: med(src.map(function (d) { return d.w; })), h: med(src.map(function (d) { return d.h; })) };
    }
    /** 종류를 바꾸면 보 두께도 그 종류 두께로(길이·방향·중심은 그대로) */
    function patchForType(d, t) {
        var patch = { type: t };
        var th = (t === '거더' || t === '빔') && api.beamThickness ? api.beamThickness(list().filter(function (x) { return x.id !== d.id; }))[t] : 0;
        if (th) { if (d.w >= d.h) patch.h = th; else patch.w = th; }
        return patch;
    }
    // ---------- 거더·빔 두 점 찍기(2026-10-14): 시작 → 끝. 기둥(빔은 거더·빔도)에 붙고, 막대는 면에서 면까지 ----
    function isLineType(t) { return t === '거더' || t === '빔'; }
    /** 누른 점을 기둥 중심(또는 빔이면 거더·빔 중심선)에 붙인다 → { x, y, hx, hy } (hx·hy = 막대를 자를 반폭) */
    function snapPoint(p, pad, type, excludeId) {
        var targets = list().filter(function (d) { return d.id !== excludeId && (d.type === '기둥' || (type === '빔' && isLineType(d.type))); });
        var hit = api.hitTest(targets, p.x, p.y, pad);
        if (!hit) return { x: p.x, y: p.y, hx: 0, hy: 0, on: '' };
        if (hit.type === '기둥') return { id: hit.id, x: hit.x, y: hit.y, hx: hit.w / 2, hy: hit.h / 2, on: '기둥' };
        return hit.w >= hit.h ? { id: hit.id, x: p.x, y: hit.y, hx: 0, hy: hit.h / 2, on: hit.type }   // 가로 보: 그 중심선에
            : { id: hit.id, x: hit.x, y: p.y, hx: hit.w / 2, hy: 0, on: hit.type };
    }
    // ---------- 거더·빔 끝 잡고 늘이기(2026-10-14) ----------
    /** 고른 거더·빔의 끝 근처를 눌렀으면 → { mode:'end', id, which:'s'|'e', horiz, fixed(반대 끝), orig } */
    function grabEnd(p, pad) {
        if (!ui.selId) return null;
        var d = list().find(function (x) { return x.id === ui.selId; });
        if (!d || !isLineType(d.type)) return null;
        var horiz = d.w >= d.h;
        var along = horiz ? p.x : p.y, perp = horiz ? p.y : p.x;
        var c = horiz ? d.y : d.x, half = (horiz ? d.h : d.w) / 2;
        var s = horiz ? d.x - d.w / 2 : d.y - d.h / 2, e = horiz ? d.x + d.w / 2 : d.y + d.h / 2;
        var reach = Math.max(pad * 1.5, half * 1.5);
        if (Math.abs(perp - c) > half + reach) return null;
        var which = Math.abs(along - e) <= reach ? 'e' : (Math.abs(along - s) <= reach ? 's' : '');
        if (!which) return null;
        return { mode: 'end', id: d.id, which: which, horiz: horiz, fixed: which === 'e' ? s : e, minLen: half * 2,
            orig: { x: d.x, y: d.y, w: d.w, h: d.h } };
    }
    /** 끝을 at 으로 옮긴 모습 → { x, y, w, h } (반대 끝·두께·중심선은 그대로, 너무 짧아지거나 뒤집히지 않게) */
    function stretchTo(dr, at) {
        var lo = dr.which === 'e' ? dr.fixed : Math.min(at, dr.fixed - dr.minLen);
        var hi = dr.which === 'e' ? Math.max(at, dr.fixed + dr.minLen) : dr.fixed;
        return dr.horiz ? { x: (lo + hi) / 2, y: dr.orig.y, w: hi - lo, h: dr.orig.h }
            : { x: dr.orig.x, y: (lo + hi) / 2, w: dr.orig.w, h: hi - lo };
    }
    /** 그 종류 통일 두께. 이 층에 그 종류가 아직 없으면 다른 보 종류(거더↔빔) 두께, 그것도 없으면 기본 */
    function lineThickness(type) {
        var th = api.beamThickness ? api.beamThickness(list()) : {};
        return th[type] || th[type === '거더' ? '빔' : '거더'] || defaultSize(type).h;
    }
    /**
     * 줄 맞춤(2026-10-15): 같은 종류·같은 방향으로 이미 그린 보의 중심선이 가까우면(화면 약 12px 또는 두께 2배 안) 그 줄에 맞춘다.
     * 한 열에 이어 그리는 빔(거더)이 들쭉날쭉하지 않고 한 줄로 반듯하게 선다. → 맞춘 중심 좌표
     */
    function alignPerp(type, horiz, perp, th, pad) {
        var reach = Math.max(pad * 2, th * 2), best = perp, bd = reach;
        list().forEach(function (d) {
            if (d.type !== type || (d.w >= d.h) !== horiz) return;
            var c = horiz ? d.y : d.x;
            var dist = Math.abs(c - perp);
            if (dist < bd) { bd = dist; best = c; }
        });
        return best;
    }
    /**
     * 기둥 줄 맞춤(2026-10-15): 다른 기둥과 세로줄(x)·가로줄(y)이 가까우면(화면 약 12px 또는 기둥 크기 3/4 안) 따로따로 그 줄에 맞춘다.
     * → { x, y }
     */
    function alignColumn(x, y, size, pad, excludeId) {
        var reach = Math.max(pad * 2, size * 0.75), bx = x, by = y, dx = reach, dy = reach;
        list().forEach(function (d) {
            if (d.type !== '기둥' || d.id === excludeId) return;
            if (Math.abs(d.x - x) < dx) { dx = Math.abs(d.x - x); bx = d.x; }
            if (Math.abs(d.y - y) < dy) { dy = Math.abs(d.y - y); by = d.y; }
        });
        return { x: bx, y: by };
    }
    function addLinePoint(p, pad) {
        var type = ui.addType;
        var a = snapPoint(p, pad, type);
        if (!ui.pend || ui.pend.type !== type) { ui.pend = Object.assign({ type: type }, a); ui.builtSig = ''; sync(); return; }
        var s = ui.pend;
        ui.pend = null;
        ui.builtSig = '';
        var dx = a.x - s.x, dy = a.y - s.y, th = lineThickness(type);
        var horiz = Math.abs(dx) >= Math.abs(dy);
        // 가로·세로 중 가까운 쪽으로 곧게. 기둥에 붙은 끝은 기둥 면까지만
        var lo = horiz ? (s.x <= a.x ? s : a) : (s.y <= a.y ? s : a), hi = lo === s ? a : s;
        var from = horiz ? lo.x + lo.hx : lo.y + lo.hy, to = horiz ? hi.x - hi.hx : hi.y - hi.hy;
        if (!(to - from > th)) { toast('두 점이 너무 가깝습니다. 다시 시작 점부터 눌러 주세요.', 'warning', 2500); sync(); return; }
        var perp = alignPerp(type, horiz, horiz ? (s.y + a.y) / 2 : (s.x + a.x) / 2, th, pad);
        // 중간에서 끊기(2026-10-16): 거더는 사이 기둥마다, 빔은 사이 거더(가로지르는 보)·기둥마다 끊고 다시 시작
        var cutters = list().filter(function (d) {
            return d.type === '기둥' || (type === '빔' && isLineType(d.type) && (d.w >= d.h) !== horiz);
        });
        var segs = api.splitRun({ horiz: horiz, from: from, to: to, perp: perp, minLen: th * 0.5 }, cutters);
        var fk = B.floorKey(), changes = [];
        segs.forEach(function (sg) {
            var r = horiz ? { x: (sg.from + sg.to) / 2, y: perp, w: sg.to - sg.from, h: th } : { x: perp, y: (sg.from + sg.to) / 2, w: th, h: sg.to - sg.from };
            var rec = api.add(state(), fk, { type: type, label: '', x: r.x, y: r.y, w: r.w, h: r.h });
            if (rec) changes.push({ id: rec.id, before: null, after: snap(rec) });
        });
        // 고르지는 않는다(이어서 다른 종류 단추를 누르면 방금 그린 것이 바뀌지 않고 추가 종류만 바뀌게). 한 번에 그린 칸들은 되돌리기 한 번에 같이 빠진다
        if (changes.length) {
            pushHist(fk, changes); ui.selId = ''; commit();
            if (changes.length > 1) toast(type + ' ' + changes.length + '칸으로 나눠 그렸습니다.', 'success', 1800);
            return;
        }
        sync();
    }
    function bindOverlay(ov) {
        // 휠 확대·축소는 도면으로 넘긴다
        ov.addEventListener('wheel', function (e) {
            e.preventDefault();
            B.canvas().dispatchEvent(new WheelEvent('wheel', e));
        }, { passive: false });
        ov.addEventListener('pointerdown', function (e) {
            if (!ui.editing || e.button > 0) return;
            e.preventDefault(); e.stopPropagation();
            var p = local(e);
            var pad = Math.hypot(B.screenToImg(6, 0).x - B.screenToImg(0, 0).x, B.screenToImg(6, 0).y - B.screenToImg(0, 0).y);
            // 거더·빔 추가 중에는 기둥을 눌러도 고르지 않고 시작·끝 점으로 쓴다
            if (isLineType(ui.addType)) { addLinePoint(p, pad); return; }
            // 고른 거더·빔의 끝 손잡이를 잡으면 그 끝만 늘이고 줄인다(반대쪽 끝은 그대로)
            var endGrab = grabEnd(p, pad);
            if (endGrab) {
                ui.drag = Object.assign(endGrab, { start: p, pointerId: e.pointerId, moved: false });
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                return;
            }
            var hit = api.hitTest(list(), p.x, p.y, pad);
            if (hit) {
                ui.selId = hit.id;
                ui.drag = { id: hit.id, start: p, orig: { x: hit.x, y: hit.y }, pointerId: e.pointerId, moved: false };
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
            } else if (ui.addType) {
                var sz = defaultSize(ui.addType);
                var at = ui.addType === '기둥' ? alignColumn(p.x, p.y, Math.max(sz.w, sz.h), pad) : p;   // 기둥은 다른 기둥 줄에 맞춤
                var rec = api.add(state(), B.floorKey(), { type: ui.addType, label: '', x: at.x, y: at.y, w: sz.w, h: sz.h });
                if (rec) { pushHist(B.floorKey(), [{ id: rec.id, before: null, after: snap(rec) }]); ui.selId = rec.id; commit(); return; }
            } else ui.selId = '';
            sync();
        });
        ov.addEventListener('pointermove', function (e) {
            var dr = ui.drag;
            if (!dr || e.pointerId !== dr.pointerId) return;
            e.preventDefault();
            var p = local(e);
            var d = list().find(function (x) { return x.id === dr.id; });
            if (!d) return;
            if (dr.mode === 'end') Object.assign(d, stretchTo(dr, dr.horiz ? p.x : p.y));
            else { d.x = dr.orig.x + (p.x - dr.start.x); d.y = dr.orig.y + (p.y - dr.start.y); }
            dr.moved = true;
            ui.builtSig = '';
            sync();
        });
        var end = function (e) {
            var dr = ui.drag;
            if (!dr || e.pointerId !== dr.pointerId) return;
            ui.drag = null;
            var d = list().find(function (x) { return x.id === dr.id; });
            if (!d || !dr.moved) { sync(); return; }
            var now = { x: d.x, y: d.y };
            if (dr.mode === 'end') {
                // 놓은 곳이 기둥(빔이면 거더·빔도)이면 그 면에 딱 붙인다
                var pe = local(e), padE = Math.hypot(B.screenToImg(6, 0).x - B.screenToImg(0, 0).x, B.screenToImg(6, 0).y - B.screenToImg(0, 0).y);
                var sp = snapPoint(pe, padE, d.type, d.id);
                var at = dr.horiz ? pe.x : pe.y;
                if (sp.on && sp.id !== d.id) at = dr.which === 'e' ? (dr.horiz ? sp.x - sp.hx : sp.y - sp.hy) : (dr.horiz ? sp.x + sp.hx : sp.y + sp.hy);
                now = stretchTo(dr, at);
            } else if (d.type === '기둥') {
                // 기둥을 옮겨 놓으면 다른 기둥 줄에 맞춘다
                var padM = Math.hypot(B.screenToImg(6, 0).x - B.screenToImg(0, 0).x, B.screenToImg(6, 0).y - B.screenToImg(0, 0).y);
                now = alignColumn(d.x, d.y, Math.max(d.w, d.h), padM, d.id);
            }
            d.x = dr.orig.x; d.y = dr.orig.y;
            if (dr.orig.w != null) { d.w = dr.orig.w; d.h = dr.orig.h; }
            if (e.type !== 'pointercancel') {
                var before = snap(d);
                var after = api.update(state(), B.floorKey(), d.id, now);
                if (after) pushHist(B.floorKey(), [{ id: d.id, before: before, after: snap(after) }]);
            }
            ui.builtSig = '';
            commit();
        };
        ov.addEventListener('pointerup', end);
        ov.addEventListener('pointercancel', end);
    }
    function deleteSelected() {
        if (!ui.selId) return;
        var rec = api.remove(state(), B.floorKey(), ui.selId);
        if (rec) pushHist(B.floorKey(), [{ id: rec.id, before: rec, after: null }]);
        ui.selId = '';
        commit();
    }
    document.addEventListener('keydown', function (e) {
        if (!ui.editing) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        // Ctrl+Z 되돌리기 · Ctrl+Y / Ctrl+Shift+Z 다시 하기 — 편집 중에는 결함 되돌리기로 넘기지 않는다(한글 입력 상태도 e.code로 잡는다)
        var isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z', isY = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y';
        if ((e.ctrlKey || e.metaKey) && !e.altKey && (isZ || isY)) {
            e.preventDefault(); e.stopPropagation();
            if (isZ && !e.shiftKey) undo(); else redo();
        }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selId) { e.preventDefault(); e.stopPropagation(); deleteSelected(); }
        else if (e.key === 'Escape') {
            e.stopPropagation();
            if (ui.pend) { ui.pend = null; ui.builtSig = ''; sync(); }          // 거더·빔 시작 점 취소
            else if (ui.selId) { ui.selId = ''; sync(); } else setEditing(false);
        }
    }, true);
    function setEditing(on) {
        ui.editing = !!on;
        if (!on) { ui.selId = ''; ui.addType = ''; ui.drag = null; ui.pend = null; ui.builtSig = ''; }
        sync();
    }

    // ---------- 가져오기(기준점 2개 맞춤) ----------
    function readHandoff() {
        return api.loadHandoff().then(function (d) {
            if (d && Array.isArray(d.refs) && d.refs.length === 2 && ((d.members && d.members.length) || (d.overlay && d.overlay.blob))) return d;
            return null;
        }).catch(function () { return null; });
    }
    function startImport() {
        readHandoff().then(function (d) {
            if (!d) {
                toast('가져올 구조도가 없습니다. 「구조도 부재」 페이지에서 기준점 2개를 찍고 「앱으로 보내기」를 먼저 눌러 주세요(같은 컴퓨터·같은 브라우저).', 'warning', 6000);
                return;
            }
            beginCalib(d);
        });
    }
    function beginCalib(d) {
        if (!B.hasDrawing()) { toast('이 층에 도면이 없습니다.', 'warning'); return; }
        setEditing(false);
        ui.calib = { data: d, pts: [], down: null };
        var canvas = B.canvas();
        ui.calib.onDown = function (e) { ui.calib.down = { x: e.clientX, y: e.clientY }; };
        ui.calib.onUp = function (e) {
            var c = ui.calib;
            if (!c || !c.down) return;
            var moved = Math.hypot(e.clientX - c.down.x, e.clientY - c.down.y);
            c.down = null;
            if (moved > 5) return;                       // 끌기는 도면 이동
            var r = canvas.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            c.pts.push(B.screenToImg(e.clientX - r.left, e.clientY - r.top));
            if (c.pts.length >= 2) finishImport(); else syncBar();
        };
        canvas.addEventListener('pointerdown', ui.calib.onDown, true);
        window.addEventListener('pointerup', ui.calib.onUp, true);
        syncBar();
    }
    function stopCalib() {
        var c = ui.calib;
        if (!c) return;
        B.canvas().removeEventListener('pointerdown', c.onDown, true);
        window.removeEventListener('pointerup', c.onUp, true);
        ui.calib = null;
    }
    function finishImport() {
        var c = ui.calib;
        var d = c.data, pts = c.pts;
        stopCalib();
        var fit = api.fitTwoPoints(d.refs[0], d.refs[1], pts[0], pts[1]);
        if (!fit) { toast('두 기준점이 너무 가깝습니다. 다시 가져오기를 눌러 주세요.', 'warning', 4000); syncBar(); return; }
        var floorKey = B.floorKey();
        var had = api.listFor(state(), floorKey).length;
        var hadOverlay = api.overlayFor(state(), floorKey);
        if ((had || hadOverlay) && !window.confirm('이 층에 있던 구조도' + (had ? '(부재 ' + had + '개)' : '') + '를 지우고 새로 넣습니다. 계속할까요?')) { syncBar(); return; }
        var n = api.importMembers(state(), floorKey, (d.members || []).filter(active), fit);
        // 통째로 바꿨으니 이 층의 되돌리기 기록은 버린다(되돌리면 새로 넣은 것과 섞인다)
        if (ui.hist) delete ui.hist[floorKey];
        setPref(SHOW_KEY, '1');
        var ov = d.overlay;
        if (!ov || !ov.blob) {
            // 도형만 가져오면 예전 구조도 그림은 뺀다(새 도형과 어긋난 채 남지 않게, 다른 기기에서도 빠짐)
            if (ui.tempOverlay && ui.tempOverlay.floorKey === floorKey) ui.tempOverlay = null;
            if (hadOverlay && api.removeOverlay(state(), floorKey) && hadOverlay.storagePath) B.deleteStoragePath(hadOverlay.storagePath);
            ui.builtSig = '';
            commit();
            var cnt = api.countsByType(list());
            toast('구조 부재를 넣었습니다: ' + ACTIVE.map(function (t) { return t + ' ' + cnt[t]; }).join(' · '), 'success', 4500);
            return;
        }
        ui.builtSig = '';
        commit();
        // 구조도 그림: 먼저 이 화면에 바로 보이고, 클라우드에 올라가면 다른 기기에도 보인다
        var rec = { floorKey: floorKey, url: URL.createObjectURL(ov.blob), x0: ov.x0, y0: ov.y0, x1: ov.x1, y1: ov.y1, fit: fit, color: ov.color, updatedAt: Date.now() };
        ui.tempOverlay = rec;
        ui.builtSig = '';
        sync();
        toast('구조도 그림을 올리는 중입니다…', 'info', 2500);
        B.uploadOverlay(ov.blob).then(function (up) {
            var saved = api.setOverlay(state(), floorKey, { url: up.downloadURL, storagePath: up.storagePath, x0: ov.x0, y0: ov.y0, x1: ov.x1, y1: ov.y1, fit: fit, color: ov.color });
            if (!saved) throw new Error('그림 정보를 저장하지 못했습니다.');
            if (ui.tempOverlay === rec) ui.tempOverlay = null;
            if (hadOverlay && hadOverlay.storagePath && hadOverlay.storagePath !== up.storagePath) B.deleteStoragePath(hadOverlay.storagePath);
            ui.builtSig = '';
            commit();
            toast('구조도를 이 층에 겹쳤습니다' + (n ? '(부재 ' + n + '개)' : '') + '. 「흐리게·진하게」로 농도를 맞추세요.', 'success', 4500);
        }).catch(function (err) {
            toast('구조도 그림을 클라우드에 올리지 못해 이 화면에서만 보입니다: ' + (err && err.message ? err.message : err), 'warning', 6000);
        });
    }

    // ---------- 막대 ----------
    function syncBar() {
        var canvas = B.canvas();
        var host = canvas && canvas.parentElement;
        var bar = document.getElementById('mapStructBar');
        if (!ui.barOpen || !host || !B.onMapTab()) { if (bar) bar.hidden = true; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'mapStructBar';
            bar.className = 'map-count-bar map-struct-bar';
            bar.setAttribute('data-html2canvas-ignore', 'true');
            bar.addEventListener('click', onBarClick);
            ['mousedown', 'touchstart', 'pointerdown'].forEach(function (t) { bar.addEventListener(t, function (e) { e.stopPropagation(); }, { passive: true }); });
        }
        if (bar.parentElement !== host) host.appendChild(bar);
        bar.hidden = false;
        var items = list(), c = api.countsByType(items);
        var html = '<span class="map-count-title">구조 부재 <small>' + items.length + '</small></span>';
        if (ui.calib) {
            html += '<button type="button" data-act="cancel">가져오기 취소</button>'
                + '<span class="map-struct-hint">[' + (ui.calib.pts.length + 1) + '/2] 구조도에서 찍은 ' + (ui.calib.pts.length ? '두' : '첫') + ' 번째 기준점과 같은 곳을 도면에서 누르세요. (끌면 도면 이동, 휠로 확대)</span>';
        } else {
            html += '<button type="button" data-act="import" title="「구조도 부재」 페이지에서 보낸 부재를 이 층에 넣습니다">가져오기</button>'
                + '<button type="button" data-act="edit" class="' + (ui.editing ? 'active' : '') + '" title="옮기기·지우기·추가">편집</button>';
            if (ui.editing) {
                html += ACTIVE.map(function (t) {
                    return '<button type="button" data-act="type" data-type="' + t + '" class="map-count-type' + (ui.addType === t ? ' active' : '') + '" style="--mc-color:' + api.COLORS[t] + '" title="' + (ui.selId ? '고른 부재를 ' + t + '(으)로' : (isLineType(t) ? '시작·끝 두 곳을 눌러 ' + t + ' 추가' : '빈 곳을 눌러 ' + t + ' 추가')) + '">' + t + ' <b><small>' + c[t] + '</small></b></button>';
                }).join('')
                    + '<button type="button" data-act="del" ' + (ui.selId ? '' : 'disabled') + ' title="고른 부재 지우기 (Delete)">지우기</button>'
                    + '<button type="button" data-act="undo" ' + (hist(B.floorKey()).undo.length ? '' : 'disabled') + ' title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>'
                    + '<button type="button" data-act="redo" ' + (hist(B.floorKey()).redo.length ? '' : 'disabled') + ' title="다시 하기 (Ctrl+Y)">↷ 다시</button>';
            }
            html += '<button type="button" data-act="dim" title="더 흐리게">흐리게</button>'
                + '<button type="button" data-act="bold" title="더 진하게">진하게</button>'
                + '<button type="button" data-act="marks" class="' + (marksOn() ? 'active' : '') + '" title="부재 이름표(C1·1G2…) 보이기">이름</button>'
                + '<button type="button" data-act="show" class="' + (showOn() ? 'active' : '') + '">보이기</button>'
                + '<button type="button" data-act="close">닫기</button>';
            if (ui.editing && isLineType(ui.addType)) {
                var fromWhat = ui.addType === '거더' ? '기둥' : '거더·기둥';
                html += '<span class="map-struct-hint">' + ui.addType + ' 추가: '
                    + (ui.pend ? '끝 ' + fromWhat + '을 누르세요 (Esc 취소)' : '시작 ' + fromWhat + '을 누르세요 → 끝 ' + fromWhat + ' (가로·세로로 곧게, 면에서 면까지, 사이 ' + (ui.addType === '거더' ? '기둥' : '거더') + '에서 끊김)')
                    + ' · 다 하면 「' + ui.addType + '」 단추를 다시 눌러 끄기</span>';
            }
            html += '<span class="map-count-hint">' + (ui.editing
                ? '눌러 고르고 끌어 옮기기 · 고른 거더·빔은 끝 네모를 끌어 늘이기 · 기둥은 한 번, 거더·빔은 시작→끝 두 번 눌러 추가 · Ctrl+Z 되돌리기 · 화면 전용(출력 안 됨)'
                : ACTIVE.map(function (t) { return t + ' ' + c[t]; }).join(' · ')) + '</span>';
        }
        if (bar._h !== html) { bar._h = html; bar.innerHTML = html; }
        if (typeof B.placeBar === 'function') B.placeBar(bar, host);
    }
    function onBarClick(e) {
        var b = e.target.closest('button');
        if (!b) return;
        e.preventDefault();
        var a = b.dataset.act;
        if (a === 'import') startImport();
        else if (a === 'cancel') { stopCalib(); syncBar(); }
        else if (a === 'edit') setEditing(!ui.editing);
        else if (a === 'type') {
            var t = b.dataset.type;
            if (ui.selId) {
                var cur = list().find(function (d) { return d.id === ui.selId; });
                var before = snap(cur);
                var after = cur && cur.type !== t ? api.update(state(), B.floorKey(), ui.selId, patchForType(cur, t)) : null;
                if (after) pushHist(B.floorKey(), [{ id: after.id, before: before, after: snap(after) }]);
                ui.builtSig = ''; commit();
            }
            else { ui.addType = ui.addType === t ? '' : t; ui.pend = null; ui.builtSig = ''; sync(); }
        } else if (a === 'del') deleteSelected();
        else if (a === 'undo') undo();
        else if (a === 'redo') redo();
        else if (a === 'dim' || a === 'bold') { setPref(ALPHA_KEY, Math.min(1, Math.max(0.2, alpha() + (a === 'bold' ? 0.15 : -0.15))).toFixed(2)); sync(); }
        else if (a === 'show') { setPref(SHOW_KEY, showOn() ? '0' : '1'); sync(); }
        else if (a === 'marks') { setPref(MARKS_KEY, marksOn() ? '0' : '1'); ui.builtSig = ''; sync(); }
        else if (a === 'close') closeBar();
    }
    function openBar() { ui.barOpen = true; sync(); }
    function closeBar() { stopCalib(); ui.barOpen = false; setEditing(false); }
    function toggleBar() { if (ui.barOpen) closeBar(); else openBar(); }

    window.BSA.structLayer = { sync: sync, openBar: openBar, closeBar: closeBar, toggleBar: toggleBar, startImport: startImport, undo: undo, redo: redo, _ui: ui };
    sync();
})();
