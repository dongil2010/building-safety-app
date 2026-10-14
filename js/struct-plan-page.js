/**
 * 구조도 부재 세기 화면 (struct-plan.html 전용, 2026-10-14)
 * 구조평면도 PDF를 이 브라우저 안에서만 읽어 부재 기호를 찾고 종류별로 센다. 어디에도 올리지 않는다.
 * 계산은 js/core/struct-marks.js. 여기서는 PDF 읽기·글자 본 만들기·화면만 한다.
 */
(function () {
    'use strict';

    var SM = window.BSA.structMarks;
    var SS = window.BSA.structShapes || null;   // 옛 HTML(스크립트 태그 없음)이면 없다 — 그때는 기호 방식만
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#f59e0b', '슬래브': '#16a34a' };
    var PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var $ = function (id) { return document.getElementById(id); };
    var ZOOM_MAX = 8;

    var st = { doc: null, pageNo: 1, base: null, scale: 1, members: [], unread: [], region: null, zoom: 1, picking: false, drag: null, fileName: '', refs: [], refPicking: false };

    /** 배율 표시. 배포 직후 브라우저에 남은 옛 HTML에는 이 칸이 없을 수 있다 — 없으면 건너뛴다(2026-10-14 PDF 열기 실패). */
    function showZoom() {
        var el = $('zoomLabel');
        if (el) el.textContent = Math.round(st.zoom * 100) + '%';
    }

    function setStatus(msg, kind) {
        var el = $('status');
        el.textContent = msg || '';
        el.className = 'status' + (kind ? ' ' + kind : '');
    }

    // ---------- 글자 본: 캐드 선 글꼴의 실제 획(js/core/struct-glyphs.js) ----------
    var _templates = null;
    function buildTemplates() {
        if (!_templates) _templates = SM.templatesFromStrokes(window.BSA.structGlyphs || {});
        return _templates;
    }

    // ---------- PDF 한 쪽에서 선·글자 꺼내기 ----------
    async function extractPage(page) {
        var OPS = pdfjsLib.OPS;
        var vp = page.getViewport({ scale: 1 });
        var ol = await page.getOperatorList();
        var mul = function (a, b) {
            return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
                a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
        };
        var ctm = vp.transform.slice(), stack = [], paths = [], images = 0;
        // 칠하는 명령 — 그 앞에 만든 경로에 fill 표시(기둥·벽 칠 찾기, js/core/struct-shapes.js)
        var FILL_OPS = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke];
        var PAINT_OPS = FILL_OPS.concat([OPS.stroke, OPS.closeStroke, OPS.endPath]);
        var painted = 0;
        for (var i = 0; i < ol.fnArray.length; i++) {
            var fn = ol.fnArray[i], a = ol.argsArray[i];
            if (PAINT_OPS.indexOf(fn) >= 0) {
                if (FILL_OPS.indexOf(fn) >= 0) for (var pi = painted; pi < paths.length; pi++) paths[pi].fill = true;
                painted = paths.length;
            }
            else if (fn === OPS.save) stack.push(ctm.slice());
            else if (fn === OPS.restore) ctm = stack.pop() || ctm;
            else if (fn === OPS.transform) ctm = mul(ctm, a);
            else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) images++;
            else if (fn === OPS.constructPath) {
                var ops = a[0], co = a[1], k = 0;
                var cur = null;
                var flush = function () { if (cur && cur.pts.length > 1) paths.push(cur); cur = null; };
                var P = function (x, y) { cur.pts.push([ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]); };
                for (var j = 0; j < ops.length; j++) {
                    var op = ops[j];
                    if (op === OPS.moveTo) { flush(); cur = { pts: [], lines: 0, curves: 0, closed: false }; P(co[k], co[k + 1]); k += 2; }
                    else if (op === OPS.lineTo) { if (cur) { P(co[k], co[k + 1]); cur.lines++; } k += 2; }
                    else if (op === OPS.curveTo) { if (cur) { P(co[k + 4], co[k + 5]); cur.curves++; } k += 6; }
                    else if (op === OPS.curveTo2 || op === OPS.curveTo3) { if (cur) { P(co[k + 2], co[k + 3]); cur.curves++; } k += 4; }
                    else if (op === OPS.rectangle) {
                        flush();
                        var x = co[k], y = co[k + 1], w = co[k + 2], h = co[k + 3];
                        cur = { pts: [], lines: 4, curves: 0, closed: true };
                        P(x, y); P(x + w, y); P(x + w, y + h); P(x, y + h);
                        flush();
                        k += 4;
                    } else if (op === OPS.closePath) { if (cur) cur.closed = true; }
                }
                flush();
            }
        }
        var tc = await page.getTextContent();
        var texts = [];
        tc.items.forEach(function (it) {
            if (!it.str || !it.str.trim()) return;
            var t = pdfjsLib.Util.transform(vp.transform, it.transform);
            var sx = Math.hypot(t[0], t[1]) || 1, sy = Math.hypot(t[2], t[3]) || 1;
            var w = it.width || 0, h = it.height || sy;
            texts.push({ str: it.str.trim(), w: w, h: h,
                x: t[4] + (t[0] / sx) * w / 2 + (t[2] / sy) * h / 2,
                y: t[5] + (t[1] / sx) * w / 2 + (t[3] / sy) * h / 2 });
        });
        return { paths: paths, texts: texts, images: images, page: { w: vp.width, h: vp.height } };
    }

    async function analyzePage() {
        var page = await st.doc.getPage(st.pageNo);
        setStatus('도면을 읽는 중…');
        var ex = await extractPage(page);
        // 화면에 보여 줄 그림(긴 쪽 3000 픽셀까지)
        var vp1 = page.getViewport({ scale: 1 });
        // 화면용 그림은 긴 쪽 4000 픽셀까지(기준점을 찍을 때 크게 확대해도 선이 덜 뭉개지게)
        st.scale = Math.min(6, 4000 / Math.max(vp1.width, vp1.height));
        var vp = page.getViewport({ scale: st.scale });
        var base = document.createElement('canvas');
        base.width = Math.round(vp.width); base.height = Math.round(vp.height);
        var bctx = base.getContext('2d');
        bctx.fillStyle = '#fff'; bctx.fillRect(0, 0, base.width, base.height);
        // intent 'print': 화면 갱신 박자(rAF)를 기다리지 않아, 다른 탭을 보고 있어도 멈추지 않는다
        await page.render({ canvasContext: bctx, viewport: vp, intent: 'print' }).promise;
        st.base = base;
        st.region = null;
        st.refs = [];
        st.refPicking = false;

        if (ex.paths.length < 200) {
            st.members = []; st.unread = []; st.marks = null; st.shapes = null;
            redraw(); renderSide();
            setStatus(ex.images > 0
                ? '이 PDF는 스캔한 그림이라 선 데이터가 없습니다. 스캔본은 아직 읽지 못합니다(캐드에서 뽑은 PDF만 됩니다).'
                : '이 쪽에는 읽을 선이 거의 없습니다.', 'warn');
            return;
        }
        setStatus('부재 기호를 찾는 중…');
        await new Promise(function (r) { setTimeout(r, 20); });
        var t0 = performance.now();
        var res = SM.detect({ paths: ex.paths, texts: ex.texts, page: ex.page, templates: buildTemplates(), debug: !!window.__structDebug });
        st.marks = res;
        st.shapes = null;
        if (window.__structDebug) st.ex = ex;   // 확인용: 꺼낸 선·글자
        if (SS) {
            try { st.shapes = SS.extractShapes({ paths: ex.paths, page: ex.page, marks: res.members }); }
            catch (err) { console.error(err); }
        }
        st.ms = Math.round(performance.now() - t0);
        applyMode();
    }

    // ---------- 읽는 방식: 기호(글자 테두리) / 실제 도형(기둥·벽 칠, 보 점선) ----------
    var MODE_KEY = 'bsa_struct_plan_mode';
    /** 배포 직후 옛 HTML에는 이 칸이 없을 수 있다 — 없으면 기호 방식 */
    function readMode() {
        var el = $('readMode');
        return el && el.value === 'shapes' && SS ? 'shapes' : 'marks';
    }
    function clone(list) { return (list || []).map(function (m) { return Object.assign({}, m); }); }
    /** 읽어 둔 결과에서 화면 목록을 다시 만든다(바꾼 종류·뺀 것은 처음으로 돌아간다) */
    function applyMode() {
        if (!st.marks) { redraw(); renderSide(); return; }
        var res = st.marks;
        if (readMode() === 'shapes' && st.shapes) {
            var s = st.shapes.stats;
            st.members = clone(st.shapes.members);
            st.unread = [];
            redraw(); renderSide();
            setStatus(st.members.length
                ? '실제 도형: 기둥 ' + s.columns + ' · 벽 ' + s.walls + ' · 보 ' + s.beams + '칸'
                    + (s.guessed ? ' (이름 없는 보 ' + s.guessed + '칸은 점선 — 양 끝이 기둥·벽이면 거더, 아니면 빔으로 짐작)' : '')
                    + ' · 슬래브는 기호. 초안이니 도면에서 확인하고 고쳐 주세요.'
                : '부재 모양을 찾지 못했습니다. 기둥·벽을 칠하지 않았거나 보를 점선 두 줄로 그리지 않은 도면일 수 있습니다 — 「기호」 방식을 쓰세요.',
                st.members.length ? 'ok' : 'warn');
            return;
        }
        st.members = clone(res.members);
        st.unread = clone(res.unread);
        redraw(); renderSide();
        setStatus(res.members.length
            ? '부재 기호 ' + res.members.length + '개를 찾았습니다 (' + st.ms + 'ms). 초안이니 도면에서 확인하고 고쳐 주세요.'
            : '부재 기호를 찾지 못했습니다. 기호가 테두리(네모·알약·타원) 없이 그려진 도면일 수 있습니다.', res.members.length ? 'ok' : 'warn');
    }

    /**
     * 앱 도면에 겹칠 구조도 그림 — 범위(없으면 쪽 전체)를 크게 그린 뒤, 흰 바탕은 투명하게, 선·칠한 부분은 고른 색으로.
     * 연한 회색 선(기둥 칠, 점선 보)도 잘 보이게 진하기를 올린다. → { blob(PNG), x0, y0, x1, y1(쪽 좌표), color }
     */
    async function makeOverlayImage(color) {
        var page = await st.doc.getPage(st.pageNo);
        var v1 = page.getViewport({ scale: 1 });
        var r = st.region || { x0: 0, y0: 0, x1: v1.width, y1: v1.height };
        var rw = r.x1 - r.x0, rh = r.y1 - r.y0;
        var S = Math.min(8, 3600 / Math.max(rw, rh));
        var vp = page.getViewport({ scale: S, offsetX: -r.x0 * S, offsetY: -r.y0 * S });
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(rw * S)); cv.height = Math.max(1, Math.round(rh * S));
        var cx = cv.getContext('2d', { willReadFrequently: true });
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: cx, viewport: vp, intent: 'print' }).promise;
        var img = cx.getImageData(0, 0, cv.width, cv.height), d = img.data;
        var hex = /^#?([0-9a-f]{6})$/i.exec(color || '') ? color.replace('#', '') : '2563eb';
        var cr = parseInt(hex.slice(0, 2), 16), cg = parseInt(hex.slice(2, 4), 16), cb = parseInt(hex.slice(4, 6), 16);
        for (var i = 0; i < d.length; i += 4) {
            var lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
            var a = Math.min(255, Math.round((255 - lum) * 1.9));
            d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = a < 12 ? 0 : a;
        }
        cx.putImageData(img, 0, 0);
        var blob = await new Promise(function (res) { cv.toBlob(res, 'image/png'); });
        if (!blob) throw new Error('그림을 만들지 못했습니다.');
        return { blob: blob, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, color: '#' + hex };
    }

    // ---------- 그리기 ----------
    function inRegion(m) {
        var r = st.region;
        return !r || (m.x >= r.x0 && m.x <= r.x1 && m.y >= r.y0 && m.y <= r.y1);
    }
    function counted() { return st.members.filter(function (m) { return !m.excluded && inRegion(m); }); }

    function redraw() {
        var cv = $('view');
        if (!st.base) { cv.width = cv.height = 0; return; }
        if (cv.width !== st.base.width || cv.height !== st.base.height) { cv.width = st.base.width; cv.height = st.base.height; }
        cv.style.width = Math.round(st.base.width * st.zoom) + 'px';
        var x = cv.getContext('2d'), s = st.scale;
        x.drawImage(st.base, 0, 0);
        var box = function (m, pad) { x.strokeRect((m.x - m.w / 2) * s - pad, (m.y - m.h / 2) * s - pad, m.w * s + pad * 2, m.h * s + pad * 2); };
        x.lineWidth = 2; x.setLineDash([6, 4]); x.strokeStyle = '#94a3b8';
        st.unread.forEach(function (m) { box(m, 3); });
        x.setLineDash([]);
        st.members.forEach(function (m) {
            var on = !m.excluded && inRegion(m);
            // 실제 도형(기둥·벽·보)은 제 크기 그대로 진하게 칠하고, 기호는 테두리 밖으로 조금 넓혀 그린다
            var real = m.shape === 'column' || m.shape === 'wall' || m.shape === 'beam';
            var pad = real ? 0 : 3;
            x.globalAlpha = on ? 1 : 0.35;
            x.lineWidth = on ? (real ? 2 : 4) : 2;
            x.strokeStyle = on ? (COLORS[m.type] || '#111') : '#94a3b8';
            if (on) {
                x.fillStyle = COLORS[m.type] || '#111'; x.globalAlpha = real ? (m.guess ? 0.2 : 0.4) : 0.12;
                x.fillRect((m.x - m.w / 2) * s - pad, (m.y - m.h / 2) * s - pad, m.w * s + pad * 2, m.h * s + pad * 2); x.globalAlpha = 1;
            }
            if (m.guess) x.setLineDash([8, 5]);   // 이름 없이 짐작한 보
            box(m, pad);
            x.setLineDash([]);
        });
        x.globalAlpha = 1;
        var r = st.drag || st.region;
        if (r) {
            x.lineWidth = 3; x.setLineDash([12, 8]); x.strokeStyle = '#0f172a';
            x.strokeRect(Math.min(r.x0, r.x1) * s, Math.min(r.y0, r.y1) * s, Math.abs(r.x1 - r.x0) * s, Math.abs(r.y1 - r.y0) * s);
            x.setLineDash([]);
        }
        // 앱으로 보낼 때 쓰는 기준점 2개
        st.refs.forEach(function (p, i) {
            var px = p.x * s, py = p.y * s;
            x.strokeStyle = '#dc2626'; x.fillStyle = '#dc2626'; x.lineWidth = 3;
            x.beginPath(); x.arc(px, py, 16, 0, Math.PI * 2); x.stroke();
            x.beginPath(); x.moveTo(px - 26, py); x.lineTo(px + 26, py); x.moveTo(px, py - 26); x.lineTo(px, py + 26); x.stroke();
            x.font = 'bold 30px sans-serif'; x.fillText('기준점 ' + (i + 1), px + 22, py - 20);
        });
    }

    function renderSide() {
        var list = counted();
        var c = SM.countsByType(list);
        $('counts').innerHTML = SM.TYPES.map(function (t) {
            return '<div class="count"><span class="dot" style="background:' + COLORS[t] + '"></span><span>' + t + '</span><b>' + c[t] + '</b></div>';
        }).join('') + '<div class="count total"><span></span><span>합계</span><b>' + list.length + '</b></div>';
        var out = st.members.length - list.length;
        $('countNote').textContent = (out ? '뺀 기호 ' + out + '개 · ' : '') + (st.unread.length ? '못 읽은 기호 ' + st.unread.length + '개(회색 점선)' : '');
        var groups = SM.labelGroups(list);
        $('groups').innerHTML = groups.length ? groups.map(function (g) {
            return '<tr><td><b>' + (g.label ? esc(g.label) : '<span class="muted">(이름 없음)</span>') + '</b></td><td class="num">' + g.count + '</td><td><select data-label="' + esc(g.label) + '">'
                + SM.TYPES.map(function (t) { return '<option' + (t === g.type ? ' selected' : '') + '>' + t + '</option>'; }).join('')
                + '<option value="">빼기</option></select></td></tr>';
        }).join('') : '<tr><td colspan="3" class="muted">아직 찾은 기호가 없습니다.</td></tr>';
        $('btnCopy').disabled = !list.length;
        $('btnSend').disabled = !(st.base && st.refs.length === 2);
        $('sendNote').textContent = st.refs.length === 2 ? '기준점 2개 정함' : '기준점 ' + st.refs.length + '/2 — 「기준점 지정」으로 두 곳을 찍으세요';
    }

    function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]; }); }

    // ---------- 조작 ----------
    function pagePoint(ev) {
        var cv = $('view'), r = cv.getBoundingClientRect();
        var k = cv.width / r.width / st.scale;
        return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k };
    }
    function hit(list, p) {
        var best = null, bd = Infinity;
        list.forEach(function (m) {
            if (Math.abs(p.x - m.x) <= m.w / 2 + 1.5 && Math.abs(p.y - m.y) <= m.h / 2 + 1.5) {
                var d = Math.hypot(p.x - m.x, p.y - m.y);
                if (d < bd) { bd = d; best = m; }
            }
        });
        return best;
    }

    function onClickMark(p) {
        var action = $('clickAction').value;
        var m = hit(st.members, p);
        if (m) {
            if (action === 'toggle') m.excluded = !m.excluded;
            else { m.type = action; m.excluded = false; }
        } else {
            var u = hit(st.unread, p);
            if (!u || action === 'toggle') return;
            st.unread = st.unread.filter(function (q) { return q !== u; });
            st.members.push({ id: 'sm_u' + Date.now(), shape: u.shape, x: u.x, y: u.y, w: u.w, h: u.h, type: action, label: '(직접)', letter: '', score: 0 });
        }
        redraw(); renderSide();
    }

    function bind() {
        var cv = $('view');
        cv.addEventListener('mousedown', function (ev) {
            if (!st.base || !st.picking) return;
            var p = pagePoint(ev);
            st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
            ev.preventDefault();
        });
        window.addEventListener('mousemove', function (ev) {
            if (!st.drag) return;
            var p = pagePoint(ev);
            st.drag.x1 = p.x; st.drag.y1 = p.y;
            redraw();
        });
        window.addEventListener('mouseup', function () {
            if (!st.drag) return;
            var d = st.drag;
            st.drag = null;
            st.picking = false;
            $('btnRegion').classList.remove('on');
            cv.style.cursor = '';
            if (Math.abs(d.x1 - d.x0) > 5 && Math.abs(d.y1 - d.y0) > 5) {
                st.region = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) };
            }
            st._justDragged = true;
            redraw(); renderSide();
        });
        cv.addEventListener('click', function (ev) {
            if (st._justDragged) { st._justDragged = false; return; }
            if (!st.base || st.picking) return;
            if (st.refPicking) {
                st.refs.push(pagePoint(ev));
                if (st.refs.length >= 2) {
                    st.refPicking = false;
                    $('btnRefs').classList.remove('on');
                    cv.style.cursor = '';
                    setStatus('기준점 2개를 정했습니다. 「앱으로 보내기」를 누른 뒤, 앱의 그 층 도면에서 같은 두 곳을 같은 순서로 누르면 됩니다.', 'ok');
                } else setStatus('기준점 1을 찍었습니다. 멀리 떨어진 두 번째 기준점을 누르세요(예: 반대쪽 모서리 기둥 중심).');
                redraw(); renderSide();
                return;
            }
            onClickMark(pagePoint(ev));
        });
        $('btnRegion').addEventListener('click', function () {
            if (!st.base) return;
            st.picking = !st.picking;
            this.classList.toggle('on', st.picking);
            cv.style.cursor = st.picking ? 'crosshair' : '';
        });
        $('btnRegionClear').addEventListener('click', function () { st.region = null; redraw(); renderSide(); });
        $('btnRefs').addEventListener('click', function () {
            if (!st.base) return;
            st.refPicking = !st.refPicking;
            if (st.refPicking) { st.refs = []; setStatus('앱 도면에서도 찾을 수 있는 곳을 첫 번째 기준점으로 누르세요(예: 모서리 기둥 중심). 마우스 휠로 크게 확대하고(끌어서 이동) 찍으면 정확합니다.'); }
            this.classList.toggle('on', st.refPicking);
            cv.style.cursor = st.refPicking ? 'crosshair' : '';
            redraw(); renderSide();
        });
        $('btnSend').addEventListener('click', function () {
            var btn = this;
            var list = counted();
            if (!st.base || st.refs.length !== 2) return;
            btn.disabled = true;
            setStatus('구조도 그림을 만드는 중…');
            makeOverlayImage($('overlayColor').value).then(function (overlay) {
                var data = { at: Date.now(), fileName: st.fileName, refs: st.refs.map(function (p) { return { x: p.x, y: p.y }; }),
                    members: list.map(function (m) { return { type: m.type, label: m.label === '(직접)' ? '' : m.label, x: m.x, y: m.y, w: m.w, h: m.h }; }),
                    overlay: overlay };
                return window.BSA.structMembers.saveHandoff(data).then(function () {
                    setStatus('구조도 그림(' + Math.round(overlay.blob.size / 1024) + 'KB)과 부재 ' + list.length + '개를 보낼 준비가 됐습니다. 앱의 그 층 결함위치도에서 「구조 부재」 → 「가져오기」를 누르고, 같은 두 기준점을 같은 순서로 누르세요.', 'ok');
                });
            }).catch(function (err) { setStatus('보내지 못했습니다: ' + (err && err.message ? err.message : err), 'warn'); })
                .then(function () { renderSide(); });
        });
        // 확대·축소: 단추는 보이는 가운데를, 휠은 마우스 자리를 기준으로(그 자리가 그대로 손 밑에 남는다)
        var stage = $('stage');
        var zoomAt = function (factor, clientX, clientY) {
            if (!st.base) return;
            var sr = stage.getBoundingClientRect();
            var ax = clientX == null ? sr.left + sr.width / 2 : clientX;
            var ay = clientY == null ? sr.top + sr.height / 2 : clientY;
            var old = st.zoom;
            var next = Math.min(ZOOM_MAX, Math.max(0.15, old * factor));
            if (next === old) return;
            var r0 = cv.getBoundingClientRect();
            var px = (ax - r0.left) / old, py = (ay - r0.top) / old;   // 손 밑 지점(배율 1 기준)
            st.zoom = next;
            redraw();
            var r1 = cv.getBoundingClientRect();
            stage.scrollLeft += r1.left - (ax - px * next);
            stage.scrollTop += r1.top - (ay - py * next);
            showZoom();
        };
        $('btnZoomIn').addEventListener('click', function () { zoomAt(1.25); });
        $('btnZoomOut').addEventListener('click', function () { zoomAt(1 / 1.25); });
        stage.addEventListener('wheel', function (ev) {
            if (!st.base) return;
            ev.preventDefault();
            zoomAt(ev.deltaY < 0 ? 1.2 : 1 / 1.2, ev.clientX, ev.clientY);
        }, { passive: false });
        // 끌어서 옮기기(범위 지정 중이 아닐 때). 조금이라도 끌었으면 그 뒤 클릭(기호 누르기·기준점 찍기)은 무시한다.
        var pan = null;
        cv.addEventListener('mousedown', function (ev) {
            if (!st.base || st.picking || ev.button !== 0) return;
            pan = { x: ev.clientX, y: ev.clientY, sl: stage.scrollLeft, st: stage.scrollTop, moved: false };
        });
        window.addEventListener('mousemove', function (ev) {
            if (!pan) return;
            var dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
            if (!pan.moved && Math.hypot(dx, dy) < 4) return;
            pan.moved = true;
            cv.style.cursor = 'grabbing';
            stage.scrollLeft = pan.sl - dx;
            stage.scrollTop = pan.st - dy;
        });
        window.addEventListener('mouseup', function () {
            if (!pan) return;
            if (pan.moved) { st._justDragged = true; cv.style.cursor = st.refPicking ? 'crosshair' : ''; }
            pan = null;
        });
        $('groups').addEventListener('change', function (ev) {
            var sel = ev.target.closest('select');
            if (!sel) return;
            var label = sel.getAttribute('data-label'), v = sel.value;
            st.members.forEach(function (m) {
                if (m.label !== label || m.excluded || !inRegion(m)) return;
                if (v) m.type = v; else m.excluded = true;
            });
            redraw(); renderSide();
        });
        $('btnCopy').addEventListener('click', function () {
            var c = SM.countsByType(counted());
            var text = (st.fileName ? st.fileName + '\n' : '') + SM.TYPES.map(function (t) { return t + '\t' + c[t]; }).join('\n');
            navigator.clipboard.writeText(text).then(function () { setStatus('부재 수를 복사했습니다(엑셀에 붙여 넣을 수 있습니다).', 'ok'); },
                function () { setStatus('복사하지 못했습니다.', 'warn'); });
        });
        var modeSel = $('readMode');
        if (modeSel) {
            if (!SS) modeSel.disabled = true;
            try { if (SS && localStorage.getItem(MODE_KEY) === 'shapes') modeSel.value = 'shapes'; } catch (_e) { /* ignore */ }
            modeSel.addEventListener('change', function () {
                try { localStorage.setItem(MODE_KEY, this.value); } catch (_e) { /* ignore */ }
                applyMode();
            });
        }
        $('pageNo').addEventListener('change', function () {
            st.pageNo = Math.min(Math.max(1, parseInt(this.value, 10) || 1), st.doc ? st.doc.numPages : 1);
            this.value = st.pageNo;
            if (st.doc) analyzePage().catch(fail);
        });
        var openFile = function (file) {
            if (!file) return;
            st.fileName = file.name;
            setStatus('파일을 여는 중…');
            file.arrayBuffer().then(function (buf) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
                return pdfjsLib.getDocument({ data: buf }).promise;
            }).then(function (doc) {
                st.doc = doc; st.pageNo = 1;
                $('pageNo').value = 1; $('pageNo').max = doc.numPages;
                $('pageTotal').textContent = '/ ' + doc.numPages + '쪽';
                // 화면 폭에 맞춰 처음 배율을 잡는다
                return doc.getPage(1).then(function (pg) {
                    var v = pg.getViewport({ scale: 1 });
                    var s = Math.min(6, 4000 / Math.max(v.width, v.height));
                    st.zoom = Math.min(1, ($('stage').clientWidth - 24) / (v.width * s));
                    showZoom();
                    return analyzePage();
                });
            }).catch(fail);
        };
        $('file').addEventListener('change', function () { openFile(this.files[0]); });
        var stage = $('stage');
        stage.addEventListener('dragover', function (ev) { ev.preventDefault(); });
        stage.addEventListener('drop', function (ev) { ev.preventDefault(); openFile(ev.dataTransfer.files[0]); });
        window.__structPlan = { state: st, openFile: openFile };   // 확인·시험용
    }

    function fail(err) {
        console.error(err);
        setStatus('읽지 못했습니다: ' + (err && err.message ? err.message : err), 'warn');
    }

    bind();
    renderSide();
})();
