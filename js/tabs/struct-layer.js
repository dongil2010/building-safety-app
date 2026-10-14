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
    /** 번호표 보이기 — 정한 적 없으면 구조도 그림이 있을 때는 숨긴다(그림에 이미 번호가 있다) */
    function marksOn() { var v = pref(MARKS_KEY, ''); return v === '' ? !overlayNow() : v === '1'; }
    function alpha() { var a = parseFloat(pref(ALPHA_KEY, '0.55')); return Number.isFinite(a) ? Math.min(1, Math.max(0.2, a)) : 0.55; }
    function toast(msg, kind, ms) { if (typeof window.showToast === 'function') window.showToast(msg, kind || 'info', ms || 2500); }
    function state() { return window.state; }
    function list() { return api.listFor(state(), B.floorKey()); }

    (function injectStyle() {
        if (document.getElementById('structLayerStyle')) return;
        var s = document.createElement('style');
        s.id = 'structLayerStyle';
        s.textContent = '.map-struct-overlay{position:absolute;pointer-events:none;overflow:hidden;z-index:6}'
            + '.map-struct-overlay.is-active{pointer-events:auto;cursor:crosshair}'
            + '.map-struct-overlay rect{vector-effect:non-scaling-stroke;stroke-width:2;fill-opacity:.18}'
            + '.map-struct-overlay rect.is-selected{stroke-width:4;fill-opacity:.4;stroke-dasharray:6 3}'
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
        var showMarks = marksOn() || ui.editing;
        if (ui.selId && !items.some(function (d) { return d.id === ui.selId; })) ui.selId = '';
        // 자료가 바뀌었을 때만 도형을 다시 만든다
        var sig = B.floorKey() + '|' + items.length + '|' + items.reduce(function (m, d) { return Math.max(m, d.updatedAt || 0); }, 0) + '|' + ui.selId
            + '|' + (over ? over.url + '@' + over.updatedAt : '') + '|' + showMarks;
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
            if (showMarks) items.forEach(function (d) {
                var c = api.COLORS[d.type] || '#111';
                var r = document.createElementNS(NS, 'rect');
                r.setAttribute('x', d.x - d.w / 2); r.setAttribute('y', d.y - d.h / 2);
                r.setAttribute('width', d.w); r.setAttribute('height', d.h);
                r.setAttribute('rx', Math.min(d.w, d.h) * 0.2);
                r.setAttribute('stroke', c); r.setAttribute('fill', c);
                if (d.id === ui.selId) r.setAttribute('class', 'is-selected');
                frag.appendChild(r);
                if (d.label) {
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

    // ---------- 옮기기·고르기·추가 ----------
    function local(e) {
        var r = B.canvas().getBoundingClientRect();
        return B.screenToImg(e.clientX - r.left, e.clientY - r.top);
    }
    function defaultSize(type) {
        var same = list().filter(function (d) { return d.type === type; });
        var src = same.length ? same : list();
        if (!src.length) { var c = B.canvas(); var p0 = B.screenToImg(0, 0), p1 = B.screenToImg(60, 0); var s = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 60; return { w: s, h: s * 0.5 }; }
        var med = function (k) { var a = src.map(function (d) { return d[k]; }).sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; };
        return { w: med('w'), h: med('h') };
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
            var hit = api.hitTest(list(), p.x, p.y, pad);
            if (hit) {
                ui.selId = hit.id;
                ui.drag = { id: hit.id, start: p, orig: { x: hit.x, y: hit.y }, pointerId: e.pointerId, moved: false };
                try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
            } else if (ui.addType) {
                var sz = defaultSize(ui.addType);
                var rec = api.add(state(), B.floorKey(), { type: ui.addType, label: '', x: p.x, y: p.y, w: sz.w, h: sz.h });
                if (rec) { ui.selId = rec.id; commit(); return; }
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
            d.x = dr.orig.x + (p.x - dr.start.x); d.y = dr.orig.y + (p.y - dr.start.y);
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
            d.x = dr.orig.x; d.y = dr.orig.y;
            if (e.type !== 'pointercancel') api.update(state(), B.floorKey(), d.id, now);
            ui.builtSig = '';
            commit();
        };
        ov.addEventListener('pointerup', end);
        ov.addEventListener('pointercancel', end);
    }
    function deleteSelected() {
        if (!ui.selId) return;
        api.remove(state(), B.floorKey(), ui.selId);
        ui.selId = '';
        commit();
    }
    document.addEventListener('keydown', function (e) {
        if (!ui.editing) return;
        var t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selId) { e.preventDefault(); e.stopPropagation(); deleteSelected(); }
        else if (e.key === 'Escape') { e.stopPropagation(); if (ui.selId) { ui.selId = ''; sync(); } else setEditing(false); }
    }, true);
    function setEditing(on) {
        ui.editing = !!on;
        if (!on) { ui.selId = ''; ui.addType = ''; ui.drag = null; }
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
        var n = api.importMembers(state(), floorKey, d.members || [], fit);
        setPref(SHOW_KEY, '1');
        ui.builtSig = '';
        commit();
        var ov = d.overlay;
        if (!ov || !ov.blob) {
            toast('구조 부재 ' + n + '개를 이 층에 넣었습니다.', 'success', 4000);
            return;
        }
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
                html += api.TYPES.map(function (t) {
                    return '<button type="button" data-act="type" data-type="' + t + '" class="map-count-type' + (ui.addType === t ? ' active' : '') + '" style="--mc-color:' + api.COLORS[t] + '" title="' + (ui.selId ? '고른 부재를 ' + t + '(으)로' : '빈 곳을 눌러 ' + t + ' 추가') + '">' + t + ' <b><small>' + c[t] + '</small></b></button>';
                }).join('')
                    + '<button type="button" data-act="del" ' + (ui.selId ? '' : 'disabled') + ' title="고른 부재 지우기 (Delete)">지우기</button>';
            }
            html += '<button type="button" data-act="dim" title="더 흐리게">흐리게</button>'
                + '<button type="button" data-act="bold" title="더 진하게">진하게</button>'
                + '<button type="button" data-act="marks" class="' + (marksOn() ? 'active' : '') + '" title="부재 번호표 보이기">번호</button>'
                + '<button type="button" data-act="show" class="' + (showOn() ? 'active' : '') + '">보이기</button>'
                + '<button type="button" data-act="close">닫기</button>';
            html += '<span class="map-count-hint">' + (ui.editing
                ? '눌러 고르고 끌어 옮기기 · 종류 단추로 바꾸기/추가 · 화면 전용(출력 안 됨)'
                : api.TYPES.map(function (t) { return t + ' ' + c[t]; }).join(' · ')) + '</span>';
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
            if (ui.selId) { api.update(state(), B.floorKey(), ui.selId, { type: t }); ui.builtSig = ''; commit(); }
            else { ui.addType = ui.addType === t ? '' : t; syncBar(); }
        } else if (a === 'del') deleteSelected();
        else if (a === 'dim' || a === 'bold') { setPref(ALPHA_KEY, Math.min(1, Math.max(0.2, alpha() + (a === 'bold' ? 0.15 : -0.15))).toFixed(2)); sync(); }
        else if (a === 'show') { setPref(SHOW_KEY, showOn() ? '0' : '1'); sync(); }
        else if (a === 'marks') { setPref(MARKS_KEY, marksOn() ? '0' : '1'); ui.builtSig = ''; sync(); }
        else if (a === 'close') closeBar();
    }
    function openBar() { ui.barOpen = true; sync(); }
    function closeBar() { stopCalib(); ui.barOpen = false; setEditing(false); }
    function toggleBar() { if (ui.barOpen) closeBar(); else openBar(); }

    window.BSA.structLayer = { sync: sync, openBar: openBar, closeBar: closeBar, toggleBar: toggleBar, startImport: startImport, _ui: ui };
    sync();
})();
