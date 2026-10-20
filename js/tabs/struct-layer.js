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
    /** 이 층 통심선(2026-10-17) — 부재와 따로 다룬다 */
    var GRID = api.GRID_TYPE || '통심선';
    function gridList() { return api.listFor(state(), B.floorKey()).filter(function (d) { return d.type === GRID; }); }

    (function injectStyle() {
        if (document.getElementById('structLayerStyle')) return;
        var s = document.createElement('style');
        s.id = 'structLayerStyle';
        s.textContent = '.map-struct-overlay{position:absolute;pointer-events:none;overflow:hidden;z-index:6}'
            + '.map-struct-overlay.is-active{pointer-events:auto;cursor:crosshair;touch-action:none}'
            + '.map-struct-overlay rect{vector-effect:non-scaling-stroke;stroke-width:2;fill-opacity:.5}'
            + '.map-struct-overlay rect.map-struct-handle{fill:#fff;fill-opacity:1;stroke-width:2.5;cursor:ew-resize}'
            + '.map-struct-overlay rect.map-struct-handle.is-corner{cursor:nwse-resize}'
            + '.map-struct-overlay .map-struct-line-h{fill:#fff;fill-opacity:1;stroke:#db2777;stroke-width:2.5;vector-effect:non-scaling-stroke;cursor:grab}'
            + '.map-struct-overlay rect.map-struct-line-h.is-mid{fill:#db2777;cursor:move}'
            + '.map-struct-overlay rect.is-selected{stroke-width:4;fill-opacity:.75;stroke-dasharray:6 3}'
            + '.map-struct-overlay text{font-weight:700;text-anchor:middle;dominant-baseline:central;pointer-events:none;paint-order:stroke;stroke:#fff;stroke-width:.18em}'
            + '.map-struct-bar .map-struct-hint{flex-basis:100%;font-size:.82rem;font-weight:700;color:#0369a1}'
            // 폰(2026-10-20): 편집 중엔 자주 안 쓰는 흐리게·진하게·이름을 숨겨 도면을 덜 가린다
            + '@media (max-width:700px){.map-struct-bar.is-editing [data-act=dim],.map-struct-bar.is-editing [data-act=bold],.map-struct-bar.is-editing [data-act=marks]{display:none}.map-struct-bar .map-struct-hint{font-size:.74rem}}';
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
        var grids = gridList();
        if (ui.selId && !items.some(function (d) { return d.id === ui.selId; }) && !grids.some(function (d) { return d.id === ui.selId; })) ui.selId = '';
        // 자료가 바뀌었을 때만 도형을 다시 만든다
        var sig = B.floorKey() + '|' + items.length + '|' + items.reduce(function (m, d) { return Math.max(m, d.updatedAt || 0); }, 0) + '|' + ui.selId
            + '|' + grids.length + '|' + grids.reduce(function (m, d) { return Math.max(m, d.updatedAt || 0); }, 0) + '|' + (ui.gridMode ? 'G' : '')
            + '|' + (over ? over.url + '@' + over.updatedAt : '') + '|' + showLabels + '|' + (ui.pend ? ui.pend.x + ',' + ui.pend.y : '') + '|' + (ui.editing && ui.lineMode ? 'L' : '');
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
            // 통심선(2026-10-17): 일점쇄선 + 끝에 X1·Y1 이름 동그라미. 「통심선」 편집 중엔 진하게
            var gLabels = api.gridLabels ? api.gridLabels(grids) : {};
            var px1g = Math.hypot(B.screenToImg(1, 0).x - B.screenToImg(0, 0).x, B.screenToImg(1, 0).y - B.screenToImg(0, 0).y) || 1;
            var drawGrid = function (axis, pos, len, mid, id, preview) {
                var gl = document.createElementNS(NS, 'line');
                var a = axis === 'v' ? [pos, mid - len / 2, pos, mid + len / 2] : [mid - len / 2, pos, mid + len / 2, pos];
                gl.setAttribute('x1', a[0]); gl.setAttribute('y1', a[1]); gl.setAttribute('x2', a[2]); gl.setAttribute('y2', a[3]);
                var sel = id && id === ui.selId;
                gl.setAttribute('stroke', api.COLORS[GRID] || '#0d9488');
                gl.setAttribute('stroke-width', sel ? '3' : (ui.gridMode ? '1.8' : '1.2'));
                gl.setAttribute('stroke-dasharray', preview ? '6 4' : '14 4 2 4');
                gl.setAttribute('vector-effect', 'non-scaling-stroke');
                gl.setAttribute('opacity', ui.gridMode || sel || preview ? '1' : '0.7');
                frag.appendChild(gl);
                if (id && gLabels[id]) {
                    // 이름표: 세로선은 위 끝, 가로선은 왼쪽 끝 바깥쪽에(화면 12px 동그라미)
                    var r = px1g * 12, cx = axis === 'v' ? pos : mid - len / 2 + r * 1.2, cy = axis === 'v' ? mid - len / 2 + r * 1.2 : pos;
                    var gc = document.createElementNS(NS, 'circle');
                    gc.setAttribute('cx', cx); gc.setAttribute('cy', cy); gc.setAttribute('r', r);
                    gc.setAttribute('fill', '#fff'); gc.setAttribute('stroke', api.COLORS[GRID] || '#0d9488');
                    gc.setAttribute('stroke-width', '1.5'); gc.setAttribute('vector-effect', 'non-scaling-stroke');
                    frag.appendChild(gc);
                    var gt = document.createElementNS(NS, 'text');
                    gt.setAttribute('x', cx); gt.setAttribute('y', cy); gt.setAttribute('font-size', (r * 1.05).toFixed(1));
                    gt.setAttribute('fill', api.COLORS[GRID] || '#0d9488');
                    gt.textContent = gLabels[id];
                    frag.appendChild(gt);
                }
            };
            grids.forEach(function (g) {
                var ax = api.gridAxis(g);
                drawGrid(ax, api.gridPos(g), ax === 'v' ? g.h : g.w, ax === 'v' ? g.y : g.x, g.id, false);
            });
            if (ui.drag && ui.drag.mode === 'gridNew' && ui.drag.cur) {
                var gn = gridFromDrag(ui.drag);
                if (gn) drawGrid(gn.axis, gn.pos, gn.axis === 'v' ? gn.rec.h : gn.rec.w, gn.axis === 'v' ? gn.rec.y : gn.rec.x, '', true);
            }
            items.forEach(function (d) {
                var c = api.COLORS[d.type] || '#111';
                var r = document.createElementNS(NS, 'rect');
                r.setAttribute('x', d.x - d.w / 2); r.setAttribute('y', d.y - d.h / 2);
                r.setAttribute('width', d.w); r.setAttribute('height', d.h);
                r.setAttribute('rx', Math.min(d.w, d.h) * 0.2);
                if (d.ang) r.setAttribute('transform', 'rotate(' + d.ang + ' ' + d.x + ' ' + d.y + ')');   // 비스듬한 보(2026-10-17)
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
            if (selD && selD.type === '기둥') {
                // 고른 기둥 네 모서리 손잡이(끌면 가운데는 그대로, 가로·세로 크기만 — 2026-10-17)
                var px10c = Math.hypot(B.screenToImg(10, 0).x - B.screenToImg(0, 0).x, B.screenToImg(10, 0).y - B.screenToImg(0, 0).y);
                var hc = Math.max(Math.min(selD.w, selD.h) * 0.35, px10c);
                [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (k) {
                    var hr = document.createElementNS(NS, 'rect');
                    hr.setAttribute('x', selD.x + k[0] * selD.w / 2 - hc / 2); hr.setAttribute('y', selD.y + k[1] * selD.h / 2 - hc / 2);
                    hr.setAttribute('width', hc); hr.setAttribute('height', hc);
                    hr.setAttribute('class', 'map-struct-handle is-corner');
                    hr.setAttribute('stroke', api.COLORS['기둥']);
                    frag.appendChild(hr);
                });
            }
            if (selD && isLineType(selD.type)) {
                // 고른 거더·빔 양 끝 손잡이(잡고 끌면 그 끝만 늘이고 줄임)
                var px10 = Math.hypot(B.screenToImg(10, 0).x - B.screenToImg(0, 0).x, B.screenToImg(10, 0).y - B.screenToImg(0, 0).y);
                var th2 = Math.min(selD.w, selD.h), hs = Math.max(th2 * 1.8, px10);   // 화면에서 적어도 10px
                api.barEnds(selD).map(function (q) { return [q.x, q.y]; }).forEach(function (q) {   // 비스듬한 보도 양 끝
                    var hr = document.createElementNS(NS, 'rect');
                    hr.setAttribute('x', q[0] - hs / 2); hr.setAttribute('y', q[1] - hs / 2);
                    hr.setAttribute('width', hs); hr.setAttribute('height', hs);
                    hr.setAttribute('class', 'map-struct-handle');
                    hr.setAttribute('stroke', api.COLORS[selD.type]);
                    frag.appendChild(hr);
                });
            }
            if (ui.editing && ui.lineMode) {
                // 기둥 줄(2026-10-17): 점선 + 양 끝 동그라미(끌면 기울이기) + 가운데 네모(끌면 줄째 옮기기)
                if (!(ui.drag && ui.drag.lineIdx != null)) {   // 줄을 끄는 동안엔 찾은 줄을 그대로 쓴다
                    var cs0 = items.filter(function (d) { return d.type === '기둥'; }).map(function (d) { return Math.max(d.w, d.h); }).sort(function (a, b) { return a - b; });
                    var colSz = cs0.length ? cs0[Math.floor(cs0.length / 2)] : 0;
                    var px4 = Math.hypot(B.screenToImg(4, 0).x - B.screenToImg(0, 0).x, B.screenToImg(4, 0).y - B.screenToImg(0, 0).y);
                    ui.lines = api.columnLines(items, Math.max(colSz * 0.35, px4), 30);
                }
                var px9 = Math.hypot(B.screenToImg(9, 0).x - B.screenToImg(0, 0).x, B.screenToImg(9, 0).y - B.screenToImg(0, 0).y);
                (ui.lines || []).forEach(function (ln, li) {
                    var cur = ui.drag && ui.drag.lineIdx === li && ui.drag.cur ? ui.drag.cur : ln;
                    var ext = function (a, b) { var L = Math.hypot(a.x - b.x, a.y - b.y) || 1; return { x: a.x + (a.x - b.x) / L * px9 * 2.2, y: a.y + (a.y - b.y) / L * px9 * 2.2 }; };
                    var e0 = ext(cur.p0, cur.p1), e1 = ext(cur.p1, cur.p0);
                    var el = document.createElementNS(NS, 'line');
                    el.setAttribute('x1', e0.x); el.setAttribute('y1', e0.y); el.setAttribute('x2', e1.x); el.setAttribute('y2', e1.y);
                    el.setAttribute('stroke', '#db2777'); el.setAttribute('stroke-width', '2'); el.setAttribute('stroke-dasharray', '8 5');
                    el.setAttribute('vector-effect', 'non-scaling-stroke');
                    frag.appendChild(el);
                    [e0, e1].forEach(function (q) {
                        var hc = document.createElementNS(NS, 'circle');
                        hc.setAttribute('cx', q.x); hc.setAttribute('cy', q.y); hc.setAttribute('r', px9);
                        hc.setAttribute('class', 'map-struct-line-h');
                        frag.appendChild(hc);
                    });
                    var mq = { x: (cur.p0.x + cur.p1.x) / 2, y: (cur.p0.y + cur.p1.y) / 2 };
                    var hm = document.createElementNS(NS, 'rect');
                    hm.setAttribute('x', mq.x - px9); hm.setAttribute('y', mq.y - px9); hm.setAttribute('width', px9 * 2); hm.setAttribute('height', px9 * 2);
                    hm.setAttribute('class', 'map-struct-line-h is-mid');
                    frag.appendChild(hm);
                    ln._h = { e0: e0, e1: e1, mid: mq, r: px9 * 1.6 };
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
    // ---------- 기둥 크기(2026-10-17): 구조도 없는 층에서 평면도 위에 바로 그릴 때 — 마지막으로 고친 크기로 새 기둥을 찍는다 ----------
    var COL_SIZE_KEY = 'bsa_struct_col_size:';
    function savedColumnSize() {
        try {
            var v = JSON.parse(pref(COL_SIZE_KEY + B.floorKey(), 'null'));
            if (v && v.w > 0 && v.h > 0) return { w: Number(v.w), h: Number(v.h) };
        } catch (_e) { /* ignore */ }
        return null;
    }
    function rememberColumnSize(w, h) { if (w > 0 && h > 0) setPref(COL_SIZE_KEY + B.floorKey(), JSON.stringify({ w: w, h: h })); }
    /** 고른 기둥 모서리 근처를 눌렀으면 → { mode:'size', id, orig } */
    function grabCorner(p, pad) {
        if (!ui.selId) return null;
        var d = list().find(function (x) { return x.id === ui.selId; });
        if (!d || d.type !== '기둥') return null;
        // 가운데 쪽을 누르면 크기 바꾸기가 아니라 옮기기(작은 기둥을 손가락으로 끌 때 모서리로 잡히던 것, 2026-10-20)
        if (Math.abs(p.x - d.x) < d.w / 4 && Math.abs(p.y - d.y) < d.h / 4) return null;
        var reach = Math.max(pad * 1.5, Math.min(d.w, d.h) * 0.35);
        var near = [[-1, -1], [1, -1], [1, 1], [-1, 1]].some(function (k) {
            return Math.abs(p.x - (d.x + k[0] * d.w / 2)) <= reach && Math.abs(p.y - (d.y + k[1] * d.h / 2)) <= reach;
        });
        return near ? { mode: 'size', id: d.id, minSize: pad, orig: { x: d.x, y: d.y, w: d.w, h: d.h } } : null;
    }
    /** 모서리를 p로 끈 크기(가운데는 그대로, 너무 작아지지 않게) */
    function sizeTo(dr, p) {
        return { w: Math.max(dr.minSize, Math.abs(p.x - dr.orig.x) * 2), h: Math.max(dr.minSize, Math.abs(p.y - dr.orig.y) * 2) };
    }
    function defaultSize(type) {
        if (type === '기둥') { var cs = savedColumnSize(); if (cs) return cs; }
        var same = list().filter(function (d) { return d.type === type; });
        var src = same.length ? same : list();
        if (!src.length) {
            var p0 = B.screenToImg(0, 0), p1 = B.screenToImg(60, 0); var s = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 60;
            return type === '기둥' ? { w: s * 0.4, h: s * 0.4 } : { w: s, h: s * 0.5 };   // 첫 기둥은 정사각형
        }
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
    var SLANT_MIN_DEG = 8;   // 이보다 덜 기울면 가로·세로로 곧게(손떨림), 더 기울면 비스듬한 보
    /** 누른 점을 기둥 중심(또는 빔이면 거더·빔 중심선)에 붙인다 → { x, y, hx, hy } (hx·hy = 막대를 자를 반폭) */
    function snapPoint(p, pad, type, excludeId) {
        var targets = list().filter(function (d) { return d.id !== excludeId && (d.type === '기둥' || (type === '빔' && isLineType(d.type))); });
        var hit = api.hitTest(targets, p.x, p.y, pad);
        if (!hit) return { x: p.x, y: p.y, hx: 0, hy: 0, on: '' };
        if (hit.type === '기둥') return { id: hit.id, x: hit.x, y: hit.y, hx: hit.w / 2, hy: hit.h / 2, on: '기둥' };
        if (hit.ang) {
            // 비스듬한 보: 그 중심선 위로 내린 점
            var a = hit.ang * Math.PI / 180, q = api.toLocal(hit, p.x, p.y), t2 = Math.min(hit.w, hit.h) / 2;
            return { id: hit.id, x: hit.x + Math.cos(a) * q.u, y: hit.y + Math.sin(a) * q.u, hx: t2, hy: t2, on: hit.type };
        }
        return hit.w >= hit.h ? { id: hit.id, x: p.x, y: hit.y, hx: 0, hy: hit.h / 2, on: hit.type }   // 가로 보: 그 중심선에
            : { id: hit.id, x: hit.x, y: p.y, hx: hit.w / 2, hy: 0, on: hit.type };
    }
    // ---------- 거더·빔 끝 잡고 늘이기(2026-10-14) ----------
    /** 고른 거더·빔의 끝 근처를 눌렀으면 → { mode:'end', id, which:'s'|'e', horiz, fixed(반대 끝), orig } */
    function grabEnd(p, pad) {
        if (!ui.selId) return null;
        var d = list().find(function (x) { return x.id === ui.selId; });
        if (!d || !isLineType(d.type)) return null;
        if (d.ang) {
            // 비스듬한 보: 막대 방향 좌표로 보고, 반대쪽 끝(점)을 고정
            var q = api.toLocal(d, p.x, p.y), hf = d.h / 2, rc = Math.max(pad * 1.5, hf * 1.5);
            if (Math.abs(q.v) > hf + rc) return null;
            if (Math.abs(q.u) < d.w / 6) return null;   // 가운데 1/3은 옮기기
            var wh = Math.abs(q.u - d.w / 2) <= rc ? 'e' : (Math.abs(q.u + d.w / 2) <= rc ? 's' : '');
            if (!wh) return null;
            var ends = api.barEnds(d), ar = d.ang * Math.PI / 180;
            return { mode: 'end', slant: true, id: d.id, which: wh, fixedPt: wh === 'e' ? ends[0] : ends[1], u: { x: Math.cos(ar), y: Math.sin(ar) },
                minLen: hf * 2, orig: { x: d.x, y: d.y, w: d.w, h: d.h } };
        }
        var horiz = d.w >= d.h;
        var along = horiz ? p.x : p.y, perp = horiz ? p.y : p.x;
        var c = horiz ? d.y : d.x, half = (horiz ? d.h : d.w) / 2;
        var s = horiz ? d.x - d.w / 2 : d.y - d.h / 2, e = horiz ? d.x + d.w / 2 : d.y + d.h / 2;
        var reach = Math.max(pad * 1.5, half * 1.5);
        if (Math.abs(perp - c) > half + reach) return null;
        if (along > s + (e - s) / 3 && along < e - (e - s) / 3) return null;   // 가운데 1/3은 옮기기(짧은 보를 손가락으로 끌 때)
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
    /** 비스듬한 보 끝을 p 쪽으로 늘이고 줄인 모습(반대쪽 끝·방향·두께는 그대로) */
    function stretchSlant(dr, p) {
        var f = dr.fixedPt, u = dr.u, sg = dr.which === 'e' ? 1 : -1;
        var L = Math.max(dr.minLen, sg * ((p.x - f.x) * u.x + (p.y - f.y) * u.y));
        return { x: f.x + sg * u.x * L / 2, y: f.y + sg * u.y * L / 2, w: L, h: dr.orig.h };
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
            if (d.type !== type || d.ang || (d.w >= d.h) !== horiz) return;   // 비스듬한 보는 줄 맞춤 기준에서 뺌
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
        // 통심선이 있으면 그 선이 먼저(2026-10-17) — 찍은 곳 가까운 세로선·가로선에 붙어 교차점에 선다
        var g = api.snapToGrid ? api.snapToGrid(x, y, gridList(), Math.max(pad * 3, size)) : null;
        if (g && g.onX != null) bx = g.onX;
        if (g && g.onY != null) by = g.onY;
        return { x: bx, y: by };
    }
    /**
     * 기둥 옮길 때 줄 맞춤(2026-10-17): 원래 있던 줄(옮기기 전 x·y)에는 아주 가까울 때(화면 약 6px)만 붙어 조금만 끌어도 빠져나오고,
     * 다른 줄(먼저 옮긴 기둥이 만든 새 줄 포함)에는 화면 약 12px·기둥 절반 안이면 붙는다 — 옮긴 기둥들이 들쭉날쭉하지 않고 새 줄에 같이 선다.
     */
    function alignColumnMove(x, y, size, pad, excludeId, orig) {
        var far = Math.max(pad * 2, size * 0.5), bx = x, by = y, sx = Infinity, sy = Infinity;
        var tryX = function (v) { var dd = Math.abs(v - x), lim = Math.abs(v - orig.x) < 1e-6 ? pad : far; if (dd < lim && dd < sx) { sx = dd; bx = v; } };
        var tryY = function (v) { var dd = Math.abs(v - y), lim = Math.abs(v - orig.y) < 1e-6 ? pad : far; if (dd < lim && dd < sy) { sy = dd; by = v; } };
        tryX(orig.x); tryY(orig.y);   // 원래 줄(옆 기둥이 없어도) — 세로로만 옮길 때 가로가 손떨림으로 틀어지지 않게
        list().forEach(function (d) {
            if (d.type !== '기둥' || d.id === excludeId) return;
            tryX(d.x); tryY(d.y);
        });
        // 통심선도 다른 줄처럼 붙는다(원래 서 있던 통심선은 약하게)
        gridList().forEach(function (g) { if (api.gridAxis(g) === 'v') tryX(api.gridPos(g)); else tryY(api.gridPos(g)); });
        return { x: bx, y: by };
    }
    // ---------- 통심선 긋기·옮기기(2026-10-17): 「통심선」 켜고 빈 곳을 끌면 끈 방향(세로·가로)으로 도면 끝까지 한 줄,
    //            있는 선을 잡고 끌면 그 선과 그 위 기둥이 같이 옮겨진다. 눌러 고른 뒤 Delete·「지우기」로 지운다 ----------
    function gridFromDrag(dr) {
        var dx = dr.cur.x - dr.start.x, dy = dr.cur.y - dr.start.y;
        var sz = B.imgSize ? B.imgSize() : { w: 0, h: 0 };
        if (!(sz.w > 0 && sz.h > 0)) return null;
        var axis = Math.abs(dy) >= Math.abs(dx) ? 'v' : 'h';
        var pos = axis === 'v' ? (dr.start.x + dr.cur.x) / 2 : (dr.start.y + dr.cur.y) / 2;
        return { axis: axis, pos: pos, rec: api.gridRecord(axis, pos, sz.w, sz.h) };
    }
    /** 누른 점 가까이(화면 약 9px)에 있는 통심선 */
    function hitGrid(p, pad) {
        var best = null, bd = pad * 1.5;
        gridList().forEach(function (g) {
            var dd = Math.abs((api.gridAxis(g) === 'v' ? p.x : p.y) - api.gridPos(g));
            if (dd <= bd) { bd = dd; best = g; }
        });
        return best;
    }
    function startGridDrag(p, pad, pointerId) {
        var g = hitGrid(p, pad);
        if (g) {
            ui.selId = g.id;
            var ax = api.gridAxis(g), pos = api.gridPos(g), origs = {};
            // 그 선 위(기둥 크기 절반 안)에 선 기둥도 같이 옮긴다
            list().forEach(function (d) {
                if (d.type === '기둥' && Math.abs((ax === 'v' ? d.x : d.y) - pos) <= Math.max(pad, Math.min(d.w, d.h) / 2)) origs[d.id] = { x: d.x, y: d.y };
            });
            return { mode: 'gridMove', id: g.id, axis: ax, orig: { x: g.x, y: g.y }, origs: origs, start: p, pointerId: pointerId, moved: false };
        }
        ui.selId = '';
        return { mode: 'gridNew', start: p, cur: p, pointerId: pointerId, moved: false };
    }
    function moveGridDrag(dr, p) {
        if (dr.mode === 'gridNew') { dr.cur = p; return; }
        var dv = dr.axis === 'v' ? p.x - dr.start.x : p.y - dr.start.y;
        var g = gridList().find(function (x) { return x.id === dr.id; });
        if (g) { if (dr.axis === 'v') g.x = dr.orig.x + dv; else g.y = dr.orig.y + dv; }
        list().forEach(function (d) {
            var o = dr.origs[d.id];
            if (!o) return;
            if (dr.axis === 'v') d.x = o.x + dv; else d.y = o.y + dv;
        });
    }
    /** 통심선 교차점 중 빈 곳마다 기둥(마지막으로 고친 크기)을 한 번에 — 되돌리기 한 번에 같이 빠진다 */
    function fillGridCrossings() {
        var pts = api.emptyGridCrossings ? api.emptyGridCrossings(gridList(), list()) : [];
        if (!pts.length) { toast('기둥을 넣을 빈 교차점이 없습니다. 세로·가로 통심선을 하나 이상씩 그어 주세요.', 'info', 3000); return; }
        var fk = B.floorKey(), sz = defaultSize('기둥'), changes = [];
        pts.forEach(function (q) {
            var rec = api.add(state(), fk, { type: '기둥', label: '', x: q.x, y: q.y, w: sz.w, h: sz.h });
            if (rec) changes.push({ id: rec.id, before: null, after: snap(rec) });
        });
        if (!changes.length) return;
        pushHist(fk, changes);
        ui.selId = ''; ui.builtSig = '';
        ui.gridMode = false;   // 바로 기둥을 눌러 고르고 지울 수 있게 통심선 모드는 끈다
        commit();
        toast('교차점에 기둥 ' + changes.length + '개를 넣었습니다. 기둥이 없는 자리는 눌러 고른 뒤 Delete로 지우세요(Ctrl+Z로 한 번에 되돌리기).', 'success', 4000);
    }
    function finishGridDrag(dr, cancel) {
        var fk = B.floorKey(), changes = [];
        if (dr.mode === 'gridNew') {
            var sp = Math.hypot(B.imgToScreen(dr.cur).sx - B.imgToScreen(dr.start).sx, B.imgToScreen(dr.cur).sy - B.imgToScreen(dr.start).sy);
            var gn = !cancel && sp >= 12 ? gridFromDrag(dr) : null;
            if (gn) {
                var rec = api.add(state(), fk, gn.rec);
                if (rec) { pushHist(fk, [{ id: rec.id, before: null, after: snap(rec) }]); ui.selId = rec.id; ui.builtSig = ''; commit(); return; }
            }
            ui.builtSig = ''; sync();
            return;
        }
        // 선·기둥을 원래 자리로 돌린 뒤 한꺼번에 저장(되돌리기 한 번에)
        var save = function (d, o, now) {
            var before = snap(Object.assign({}, d, o));
            d.x = o.x; d.y = o.y;
            if (cancel || !dr.moved || (Math.abs(now.x - o.x) < 1e-9 && Math.abs(now.y - o.y) < 1e-9)) return;
            var after = api.update(state(), fk, d.id, now);
            if (after) changes.push({ id: d.id, before: before, after: snap(after) });
        };
        var g = gridList().find(function (x) { return x.id === dr.id; });
        if (g) save(g, dr.orig, { x: g.x, y: g.y });
        list().forEach(function (d) { var o = dr.origs[d.id]; if (o) save(d, o, { x: d.x, y: d.y }); });
        if (changes.length) pushHist(fk, changes);
        ui.builtSig = '';
        if (changes.length) commit(); else sync();
    }

    // ---------- 기둥 줄 끌기(2026-10-17): 끝 = 반대쪽 끝을 축으로 줄과 그 기둥들을 돌림, 가운데 = 줄의 기둥들을 같이 옮김 ----------
    /** 줄 손잡이를 눌렀으면 → { lineIdx, mode:'lineRot'|'lineMove', ids, origs, pivot, a0, line } */
    function grabLine(p) {
        var best = null, bd = Infinity;
        (ui.lines || []).forEach(function (ln, li) {
            var h = ln._h;
            if (!h) return;
            [['e0', 'lineRot'], ['e1', 'lineRot'], ['mid', 'lineMove']].forEach(function (k) {
                var q = h[k[0]], dd = Math.hypot(p.x - q.x, p.y - q.y);
                if (dd <= h.r && dd < bd) { bd = dd; best = { li: li, which: k[0], mode: k[1] }; }
            });
        });
        if (!best) return null;
        var ln = ui.lines[best.li], origs = {};
        list().forEach(function (d) { if (ln.ids.indexOf(d.id) >= 0) origs[d.id] = { x: d.x, y: d.y }; });
        // 끝을 잡으면 반대쪽 끝이 축
        var grab = best.which === 'e1' ? ln.p1 : ln.p0, pivot = best.which === 'e1' ? ln.p0 : ln.p1;
        return { lineIdx: best.li, mode: best.mode, ids: ln.ids.slice(), origs: origs, line: { p0: ln.p0, p1: ln.p1 },
            pivot: pivot, a0: Math.atan2(grab.y - pivot.y, grab.x - pivot.x), cur: { p0: ln.p0, p1: ln.p1 } };
    }
    /** 끄는 동안: 줄의 기둥들을 옮기고(자료는 놓을 때 저장) 그리는 줄 위치(cur)도 같이 */
    function dragLineTo(dr, p) {
        var tf;
        if (dr.mode === 'lineMove') {
            var dx = p.x - dr.start.x, dy = p.y - dr.start.y;
            tf = function (q) { return { x: q.x + dx, y: q.y + dy }; };
        } else {
            var ang = Math.atan2(p.y - dr.pivot.y, p.x - dr.pivot.x) - dr.a0;
            tf = function (q) { return api.rotateAbout(q, dr.pivot, ang); };
        }
        list().forEach(function (d) {
            var o = dr.origs[d.id];
            if (!o) return;
            var q = tf(o);
            d.x = q.x; d.y = q.y;
        });
        dr.cur = { p0: tf(dr.line.p0), p1: tf(dr.line.p1) };
    }
    /** 놓으면 줄의 기둥들을 한꺼번에 저장(되돌리기 한 번에 같이) */
    function finishLineDrag(dr, cancel) {
        var fk = B.floorKey(), changes = [];
        list().forEach(function (d) {
            var o = dr.origs[d.id];
            if (!o) return;
            var now = { x: d.x, y: d.y };
            d.x = o.x; d.y = o.y;
            if (cancel || !dr.moved || (Math.abs(now.x - o.x) < 1e-9 && Math.abs(now.y - o.y) < 1e-9)) return;
            var before = snap(d);
            var after = api.update(state(), fk, d.id, now);
            if (after) changes.push({ id: d.id, before: before, after: snap(after) });
        });
        if (changes.length) pushHist(fk, changes);
        ui.builtSig = '';
        if (changes.length) commit(); else sync();
    }
    function addLinePoint(p, pad) {
        var type = ui.addType;
        var a = snapPoint(p, pad, type);
        if (!ui.pend || ui.pend.type !== type) { ui.pend = Object.assign({ type: type }, a); ui.builtSig = ''; sync(); return; }
        var s = ui.pend;
        ui.pend = null;
        ui.builtSig = '';
        var dx = a.x - s.x, dy = a.y - s.y, th = lineThickness(type);
        var fk0 = B.floorKey();
        // 비스듬한 보(2026-10-17): 두 점이 가로·세로에서 8° 넘게 기울면 그 각도 그대로(면에서 면까지, 사이 기둥·거더에서 끊음)
        var dev = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
        if (Math.min(dev, 90 - dev) > SLANT_MIN_DEG && api.slantedRun) {
            var cutS = list().filter(function (d) { return d.type === '기둥' || (type === '빔' && isLineType(d.type)); });
            var segS = api.slantedRun(s, a, th, cutS), chS = [];
            segS.forEach(function (r) {
                var rec = api.add(state(), fk0, { type: type, label: '', x: r.x, y: r.y, w: r.w, h: r.h, ang: r.ang });
                if (rec) chS.push({ id: rec.id, before: null, after: snap(rec) });
            });
            if (chS.length) {
                pushHist(fk0, chS); ui.selId = ''; commit();
                toast('비스듬한 ' + type + (chS.length > 1 ? ' ' + chS.length + '칸으로 나눠' : '') + ' 그렸습니다(' + Math.round(segS[0].ang) + '°).', 'success', 1800);
                return;
            }
            toast('두 점이 너무 가깝습니다. 다시 시작 점부터 눌러 주세요.', 'warning', 2500); sync(); return;
        }
        var horiz = Math.abs(dx) >= Math.abs(dy);
        // 가로·세로 중 가까운 쪽으로 곧게. 기둥에 붙은 끝은 기둥 면까지만
        var lo = horiz ? (s.x <= a.x ? s : a) : (s.y <= a.y ? s : a), hi = lo === s ? a : s;
        var from = horiz ? lo.x + lo.hx : lo.y + lo.hy, to = horiz ? hi.x - hi.hx : hi.y - hi.hy;
        if (!(to - from > th)) { toast('두 점이 너무 가깝습니다. 다시 시작 점부터 눌러 주세요.', 'warning', 2500); sync(); return; }
        var perp = alignPerp(type, horiz, horiz ? (s.y + a.y) / 2 : (s.x + a.x) / 2, th, pad);
        // 중간에서 끊기(2026-10-16): 거더는 사이 기둥마다, 빔은 사이 거더(가로지르는 보)·기둥마다 끊고 다시 시작
        var cutters = list().filter(function (d) {
            return d.type === '기둥' || (type === '빔' && isLineType(d.type) && !d.ang && (d.w >= d.h) !== horiz);
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
        // ---------- 손가락(2026-10-20 현장 폰·태블릿) ----------
        // 편집 막이 도면을 덮으므로 도면 이동·확대도 여기서 한다: 빈 곳 한 손가락 끌기 = 도면 이동, 두 손가락 = 확대·축소.
        // 추가(기둥 찍기·거더/빔 시작·끝)는 손을 뗄 때 — 두 손가락으로 확대하려다 기둥이 찍히지 않게.
        var touches = {}, pinch = null;
        function touchIds() { return Object.keys(touches); }
        function canvasXY(x, y) { var r = B.canvas().getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; }
        function startPinch() {
            var ids = touchIds(), a = touches[ids[0]], b = touches[ids[1]], v = B.getView();
            var m = canvasXY((a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch = { ids: [ids[0], ids[1]], d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: v.scale, ix: (m.x - v.ox) / v.scale, iy: (m.y - v.oy) / v.scale };
        }
        function movePinch() {
            var a = touches[pinch.ids[0]], b = touches[pinch.ids[1]];
            if (!a || !b) return;
            var lim = B.scaleLimits(), m = canvasXY((a.x + b.x) / 2, (a.y + b.y) / 2);
            var sc = Math.min(Math.max(lim.min, pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0), lim.max);
            B.setView(sc, m.x - pinch.ix * sc, m.y - pinch.iy * sc);
        }
        function startPan(e) { ui.drag = { mode: 'pan', pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY }, moved: false }; }
        function startTap(e, act) { ui.drag = { mode: 'tap', pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY }, sx: e.clientX, sy: e.clientY, moved: false, act: act }; }
        /** 하던 끌기를 원래대로 되돌리고 그만둔다(두 번째 손가락이 닿았을 때) */
        function cancelDrag() {
            var dr = ui.drag;
            if (!dr) return;
            if (dr.mode === 'pan' || dr.mode === 'tap') { ui.drag = null; return; }
            var t = touches[dr.pointerId] || { x: 0, y: 0 };
            finishDrag({ type: 'pointercancel', pointerId: dr.pointerId, clientX: t.x, clientY: t.y });
        }
        function addAt(p, pad) {
            var sz = defaultSize(ui.addType);
            var at = ui.addType === '기둥' ? alignColumn(p.x, p.y, Math.max(sz.w, sz.h), pad) : p;   // 기둥은 다른 기둥 줄에 맞춤
            var rec = api.add(state(), B.floorKey(), { type: ui.addType, label: '', x: at.x, y: at.y, w: sz.w, h: sz.h });
            if (rec) { pushHist(B.floorKey(), [{ id: rec.id, before: null, after: snap(rec) }]); ui.selId = rec.id; commit(); return true; }
            return false;
        }
        ov.addEventListener('pointerdown', function (e) {
            if (!ui.editing || e.button > 0) return;
            e.preventDefault(); e.stopPropagation();
            var isTouch = e.pointerType === 'touch';
            if (isTouch) {
                touches[e.pointerId] = { x: e.clientX, y: e.clientY };
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                if (touchIds().length >= 2) { cancelDrag(); if (!pinch) startPinch(); ui.builtSig = ''; sync(); return; }
                if (pinch) return;
            }
            var p = local(e);
            // 손가락은 마우스보다 굵어서 잡는 범위를 넓힌다
            var padPx = isTouch ? 16 : 6;
            var pad = Math.hypot(B.screenToImg(padPx, 0).x - B.screenToImg(0, 0).x, B.screenToImg(padPx, 0).y - B.screenToImg(0, 0).y);
            // 「통심선」 켜짐: 빈 곳을 끌면 새 통심선, 선을 잡고 끌면 선과 그 위 기둥을 같이 옮김
            if (ui.gridMode) {
                ui.drag = startGridDrag(p, pad, e.pointerId);
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                ui.builtSig = ''; sync();
                return;
            }
            // 「줄」 켜짐: 줄 손잡이만 다룬다(끝 = 반대쪽 끝을 축으로 기울이기, 가운데 = 줄째 옮기기). 다른 곳은 아무것도 안 함
            if (ui.lineMode) {
                var lg = grabLine(p);
                if (lg) {
                    ui.drag = Object.assign(lg, { start: p, pointerId: e.pointerId, moved: false });
                    try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                } else if (isTouch) startPan(e);
                return;
            }
            // 거더·빔 추가 중에는 기둥을 눌러도 고르지 않고 시작·끝 점으로 쓴다
            if (isLineType(ui.addType)) {
                if (isTouch) startTap(e, function () { addLinePoint(p, pad); });
                else addLinePoint(p, pad);
                return;
            }
            // 고른 기둥의 모서리 손잡이를 잡으면 크기를 바꾼다(가운데는 그대로)
            var cornerGrab = grabCorner(p, pad);
            if (cornerGrab) {
                ui.drag = Object.assign(cornerGrab, { start: p, pointerId: e.pointerId, moved: false });
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                return;
            }
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
                if (isTouch) { startTap(e, function () { addAt(p, pad); }); return; }
                if (addAt(p, pad)) return;
            } else if (isTouch) { startPan(e); return; }   // 빈 곳 끌기 = 도면 이동, 그냥 떼면 고른 것 풀기
            else ui.selId = '';
            sync();
        });
        ov.addEventListener('pointermove', function (e) {
            if (touches[e.pointerId]) touches[e.pointerId] = { x: e.clientX, y: e.clientY };
            if (pinch) { e.preventDefault(); movePinch(); return; }
            var dr = ui.drag;
            if (!dr || e.pointerId !== dr.pointerId) return;
            e.preventDefault();
            if (dr.mode === 'tap' && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) > 10) dr.mode = 'pan';   // 누르고 끌면 추가 대신 도면 이동
            if (dr.mode === 'pan' || dr.mode === 'tap') {
                var dx = e.clientX - dr.last.x, dy = e.clientY - dr.last.y;
                dr.last = { x: e.clientX, y: e.clientY };
                if (dr.mode === 'pan' && (dx || dy)) { var v = B.getView(); B.setView(v.scale, v.ox + dx, v.oy + dy); dr.moved = true; }
                return;
            }
            var p = local(e);
            if (dr.lineIdx != null) { dragLineTo(dr, p); dr.moved = true; ui.builtSig = ''; sync(); return; }
            if (dr.mode === 'gridNew' || dr.mode === 'gridMove') { moveGridDrag(dr, p); dr.moved = true; ui.builtSig = ''; sync(); return; }
            var d = list().find(function (x) { return x.id === dr.id; });
            if (!d) return;
            if (dr.mode === 'end') Object.assign(d, dr.slant ? stretchSlant(dr, p) : stretchTo(dr, dr.horiz ? p.x : p.y));
            else if (dr.mode === 'size') Object.assign(d, sizeTo(dr, p));
            else {
                d.x = dr.orig.x + (p.x - dr.start.x); d.y = dr.orig.y + (p.y - dr.start.y);
                if (d.type === '기둥') {
                    // 끄는 동안에도 줄에 붙는 모습이 보이게(놓을 때 그 자리 그대로 저장)
                    var padM = Math.hypot(B.screenToImg(6, 0).x - B.screenToImg(0, 0).x, B.screenToImg(6, 0).y - B.screenToImg(0, 0).y);
                    var al = alignColumnMove(d.x, d.y, Math.max(d.w, d.h), padM, d.id, dr.orig);
                    d.x = al.x; d.y = al.y;
                }
            }
            dr.moved = true;
            ui.builtSig = '';
            sync();
        });
        var end = function (e) {
            delete touches[e.pointerId];
            if (pinch) {
                if (pinch.ids.indexOf(String(e.pointerId)) >= 0) { pinch = null; B.viewDone(); }
                return;
            }
            var dr = ui.drag;
            if (!dr || e.pointerId !== dr.pointerId) return;
            if (dr.mode === 'pan' || dr.mode === 'tap') {
                ui.drag = null;
                if (dr.mode === 'tap' && e.type !== 'pointercancel') dr.act();
                else if (dr.moved) B.viewDone();
                else if (e.type !== 'pointercancel') { ui.selId = ''; sync(); }
                return;
            }
            finishDrag(e);
        };
        function finishDrag(e) {
            var dr = ui.drag;
            if (!dr || e.pointerId !== dr.pointerId) return;
            ui.drag = null;
            if (dr.lineIdx != null) { finishLineDrag(dr, e.type === 'pointercancel'); return; }
            if (dr.mode === 'gridNew' || dr.mode === 'gridMove') { finishGridDrag(dr, e.type === 'pointercancel'); return; }
            var d = list().find(function (x) { return x.id === dr.id; });
            if (!d || !dr.moved) { sync(); return; }
            var now = { x: d.x, y: d.y };
            if (dr.mode === 'size') {
                // 기둥 크기 — 이 층에서 새로 찍는 기둥은 이 크기로
                now = sizeTo(dr, local(e));
                if (e.type !== 'pointercancel') rememberColumnSize(now.w, now.h);
            } else if (dr.mode === 'end') {
                // 놓은 곳이 기둥(빔이면 거더·빔도)이면 그 면에 딱 붙인다
                var pe = local(e), padE = Math.hypot(B.screenToImg(6, 0).x - B.screenToImg(0, 0).x, B.screenToImg(6, 0).y - B.screenToImg(0, 0).y);
                var sp = snapPoint(pe, padE, d.type, d.id);
                if (dr.slant) {
                    // 비스듬한 보: 놓은 곳이 기둥(빔은 거더도)이면 그 면까지
                    var tgt = pe;
                    if (sp.on && sp.id !== d.id) {
                        var sgn = dr.which === 'e' ? 1 : -1, L2 = sgn * ((sp.x - dr.fixedPt.x) * dr.u.x + (sp.y - dr.fixedPt.y) * dr.u.y) - api.faceDist(sp.hx, sp.hy, dr.u.x, dr.u.y);
                        tgt = { x: dr.fixedPt.x + sgn * dr.u.x * L2, y: dr.fixedPt.y + sgn * dr.u.y * L2 };
                    }
                    now = stretchSlant(dr, tgt);
                }
                var at = dr.horiz ? pe.x : pe.y;
                if (sp.on && sp.id !== d.id) at = dr.which === 'e' ? (dr.horiz ? sp.x - sp.hx : sp.y - sp.hy) : (dr.horiz ? sp.x + sp.hx : sp.y + sp.hy);
                if (!dr.slant) now = stretchTo(dr, at);
            }
            // 기둥을 끌어 옮기면 끄는 동안 맞춘 자리 그대로(alignColumnMove — 원래 줄엔 약하게, 다른 줄엔 붙음)
            d.x = dr.orig.x; d.y = dr.orig.y;
            if (dr.orig.w != null) { d.w = dr.orig.w; d.h = dr.orig.h; }
            if (e.type !== 'pointercancel') {
                var before = snap(d);
                var after = api.update(state(), B.floorKey(), d.id, now);
                if (after) pushHist(B.floorKey(), [{ id: d.id, before: before, after: snap(after) }]);
            }
            ui.builtSig = '';
            commit();
        }
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
            else if (ui.lineMode) { ui.lineMode = false; ui.drag = null; ui.builtSig = ''; sync(); }   // 「줄」 끄기
            else if (ui.gridMode && !ui.selId) { ui.gridMode = false; ui.drag = null; ui.builtSig = ''; sync(); }   // 「통심선」 끄기
            else if (ui.selId) { ui.selId = ''; sync(); } else setEditing(false);
        }
    }, true);
    function setEditing(on) {
        ui.editing = !!on;
        if (!on) { ui.selId = ''; ui.addType = ''; ui.drag = null; ui.pend = null; ui.lineMode = false; ui.gridMode = false; ui.builtSig = ''; }
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
        ['btnStructLayer', 'mobileBtnStructLayer'].forEach(function (id) { var b = document.getElementById(id); if (b) b.classList.toggle('active', !!ui.barOpen); });
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
            html += '<button type="button" data-act="edit" class="' + (ui.editing ? 'active' : '') + '" title="옮기기·지우기·추가">편집</button>';
            if (ui.editing) {
                html += ACTIVE.map(function (t) {
                    return '<button type="button" data-act="type" data-type="' + t + '" class="map-count-type' + (ui.addType === t ? ' active' : '') + '" style="--mc-color:' + api.COLORS[t] + '" title="' + (ui.selId && !ui.addType ? '고른 부재를 ' + t + '(으)로' : (isLineType(t) ? '시작·끝 두 곳을 눌러 ' + t + ' 추가' : '빈 곳을 눌러 ' + t + ' 추가')) + '">' + t + ' <b><small>' + c[t] + '</small></b></button>';
                }).join('')
                    + '<button type="button" data-act="grid" class="' + (ui.gridMode ? 'active' : '') + '" title="통심선 긋기 — 빈 곳을 세로·가로로 끌면 도면 끝까지 한 줄. 기둥을 찍으면 교차점에 붙습니다">통심선 <b><small>' + gridList().length + '</small></b></button>'
                    + '<button type="button" data-act="lines" class="' + (ui.lineMode ? 'active' : '') + '" title="기둥 줄 보이기 — 끝 동그라미를 끌면 줄을 기울이고, 가운데 네모를 끌면 그 줄 기둥을 통째로 옮깁니다">줄</button>'
                    + '<button type="button" data-act="del" ' + (ui.selId ? '' : 'disabled') + ' title="고른 부재 지우기 (Delete)">지우기</button>'
                    + '<button type="button" data-act="undo" ' + (hist(B.floorKey()).undo.length ? '' : 'disabled') + ' title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>'
                    + '<button type="button" data-act="redo" ' + (hist(B.floorKey()).redo.length ? '' : 'disabled') + ' title="다시 하기 (Ctrl+Y)">↷ 다시</button>';
            }
            html += '<button type="button" data-act="dim" title="더 흐리게">흐리게</button>'
                + '<button type="button" data-act="bold" title="더 진하게">진하게</button>'
                + '<button type="button" data-act="marks" class="' + (marksOn() ? 'active' : '') + '" title="부재 이름표(C1·1G2…) 보이기">이름</button>'
                + '<button type="button" data-act="show" class="' + (showOn() ? 'active' : '') + '">보이기</button>'
                + '<button type="button" data-act="close">닫기</button>';
            if (ui.editing && ui.gridMode) {
                var nEmpty = api.emptyGridCrossings ? api.emptyGridCrossings(gridList(), list()).length : 0;
                html += '<button type="button" data-act="fillcross" ' + (nEmpty ? '' : 'disabled') + ' title="세로·가로 통심선이 만나는 곳 중 기둥이 없는 곳마다 기둥을 넣습니다(마지막으로 고친 기둥 크기, 되돌리기 한 번에 빠짐)">교차점 기둥 넣기 <b><small>' + nEmpty + '</small></b></button>';
                html += '<span class="map-struct-hint">통심선: 빈 곳을 세로로 끌면 세로선, 가로로 끌면 가로선(도면 끝까지) · 선을 잡고 끌면 선과 그 위 기둥이 같이 옮겨짐 · 선을 눌러 고르고 Delete·「지우기」 · 다 하면 「기둥」을 켜고 교차점을 누르세요</span>';
            }
            if (ui.editing && ui.lineMode) {
                html += '<span class="map-struct-hint">기둥 줄 ' + (ui.lines || []).length + '개: 끝 동그라미를 끌면 반대쪽 끝을 축으로 줄과 그 기둥들이 기울고, 가운데 네모를 끌면 그 줄 기둥이 통째로 옮겨집니다 · 다 하면 「줄」을 다시 눌러 끄기</span>';
            }
            if (ui.editing && isLineType(ui.addType)) {
                var fromWhat = ui.addType === '거더' ? '기둥' : '거더·기둥';
                html += '<span class="map-struct-hint">' + ui.addType + ' 추가: '
                    + (ui.pend ? '끝 ' + fromWhat + '을 누르세요 (Esc 취소)' : '시작 ' + fromWhat + '을 누르세요 → 끝 ' + fromWhat + ' (가로·세로로 곧게, 면에서 면까지, 사이 ' + (ui.addType === '거더' ? '기둥' : '거더') + '에서 끊김)')
                    + ' · 다 하면 「' + ui.addType + '」 단추를 다시 눌러 끄기</span>';
            }
            html += '<span class="map-count-hint">' + (ui.editing
                ? '눌러 고르고 끌어 옮기기 · 고른 기둥은 모서리 네모를 끌어 크기 바꾸기(새 기둥도 그 크기로) · 고른 거더·빔은 끝 네모를 끌어 늘이기 · 기둥은 한 번, 거더·빔은 시작→끝 두 번 눌러 추가 · Ctrl+Z 되돌리기 · 화면 전용(출력 안 됨)'
                : ACTIVE.map(function (t) { return t + ' ' + c[t]; }).join(' · ')) + '</span>';
        }
        bar.classList.toggle('is-editing', !!ui.editing);
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
            if (ui.selId && !list().some(function (d) { return d.id === ui.selId; })) ui.selId = '';   // 고른 것이 통심선이면 종류 바꾸기 대신 추가 모드로
            // 추가하는 중이면 종류 단추 = 추가 종류 바꾸기·끄기(방금 찍혀 골라진 기둥이 거더로 바뀌던 것, 2026-10-20 — 폰엔 Esc가 없음)
            if (ui.selId && !ui.addType) {
                var cur = list().find(function (d) { return d.id === ui.selId; });
                var before = snap(cur);
                var after = cur && cur.type !== t ? api.update(state(), B.floorKey(), ui.selId, patchForType(cur, t)) : null;
                if (after) pushHist(B.floorKey(), [{ id: after.id, before: before, after: snap(after) }]);
                ui.builtSig = ''; commit();
            }
            else { ui.addType = ui.addType === t ? '' : t; ui.pend = null; ui.lineMode = false; ui.gridMode = false; ui.builtSig = ''; sync(); }
        } else if (a === 'lines') {
            ui.lineMode = !ui.lineMode; ui.gridMode = false; ui.addType = ''; ui.pend = null; ui.selId = ''; ui.drag = null; ui.builtSig = ''; sync();
        } else if (a === 'fillcross') {
            fillGridCrossings();
        } else if (a === 'grid') {
            ui.gridMode = !ui.gridMode; ui.lineMode = false; ui.addType = ''; ui.pend = null; ui.selId = ''; ui.drag = null; ui.builtSig = ''; sync();
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
