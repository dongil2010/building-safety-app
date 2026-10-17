/**
 * 구조도 부재 세기 화면 (struct-plan.html 전용, 2026-10-14)
 * 구조평면도 PDF를 이 브라우저 안에서만 읽어 부재 기호를 찾고 종류별로 센다. 어디에도 올리지 않는다.
 * 계산은 js/core/struct-marks.js. 여기서는 PDF 읽기·글자 본 만들기·화면만 한다.
 */
(function () {
    'use strict';

    var SM = window.BSA.structMarks;
    var SS = window.BSA.structShapes || null;   // 옛 HTML(스크립트 태그 없음)이면 없다 — 그때는 기호 방식만
    // 기둥 빨강 · 거더 파랑 · 빔 황토 (앱 레이어 js/core/struct-members.js COLORS와 같게)
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#b7791f', '슬래브': '#16a34a' };
    var USE_TYPES = ['기둥', '거더', '빔'];   // 지금 세는 종류(벽·슬래브는 우선 뺌)
    var PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    var $ = function (id) { return document.getElementById(id); };
    var ZOOM_MAX = 8;

    var st = { doc: null, pageNo: 1, base: null, scale: 1, members: [], unread: [], region: null, zoom: 1, picking: false, drag: null, fileName: '', refs: [], refPicking: false,
        selId: '', pend: null, mdrag: null, hist: [], redo: [] };   // 편집(2026-10-17): 고른 부재·그리기 시작 점·끌기·되돌리기

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
            resetEdit();
            redraw(); renderSide();
            setStatus(ex.images > 0
                ? '이 PDF는 스캔한 그림이라 선 데이터가 없습니다. 「AI ① 기둥」부터 누르면 AI가 기둥 → 거더 → 빔 순서로 찾습니다(평면만 「범위 지정」하면 더 정확).'
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
        if (el && el.value === 'ai') return 'ai';
        return el && el.value === 'shapes' && SS ? 'shapes' : 'marks';
    }
    /** 지금은 기둥·거더·빔만 센다(벽·슬래브는 나중에, 2026-10-14) */
    function useType(m) { return USE_TYPES.indexOf(m.type) >= 0; }
    function clone(list) { return (list || []).filter(useType).map(function (m) { return Object.assign({}, m); }); }
    /**
     * 실제 도형 보(거더·빔)의 두께를 종류마다 하나로(그 종류의 중간값, js/core/struct-members.js unifyThickness).
     * 종류를 바꾸면 다시 부른다 — 빔을 거더로 바꾸면 거더 두께가 된다. 기호 방식의 이름 테두리는 건드리지 않는다.
     */
    function unifyBeams(list) {
        var MS = window.BSA.structMembers;
        if (!MS || !MS.unifyThickness) return list;
        var idx = [], beams = [];
        list.forEach(function (m, i) { if (m.shape === 'beam' && !m.excluded) { idx.push(i); beams.push(m); } });
        var u = MS.unifyThickness(beams);
        var out = list.slice();
        idx.forEach(function (i, k) { out[i] = u[k]; });
        // 기둥도 모두 같은 크기 정사각형으로(2026-10-16, 기호 방식의 이름 테두리는 빼고)
        if (MS.unifyColumns) {
            var ci = [], cs = [];
            out.forEach(function (m, i) { if (m.shape === 'column' && !m.excluded) { ci.push(i); cs.push(m); } });
            var uc = MS.unifyColumns(cs);
            ci.forEach(function (i, k) { out[i] = uc[k]; });
        }
        return out;
    }
    /** 읽어 둔 결과에서 화면 목록을 다시 만든다(바꾼 종류·뺀 것은 처음으로 돌아간다) */
    function applyMode() {
        resetEdit();
        applyModeInner();
        st.members.forEach(function (m, i) { if (!m.id) m.id = 'sm_k' + Date.now() + '_' + i; });   // 편집은 id로 고른다
    }
    function applyModeInner() {
        if (readMode() === 'ai') {
            // AI로 읽은 결과(스캔본) — 바꾼 종류·뺀 것은 처음으로 돌아간다
            // AI 결과는 단계마다 고친 것을 이어 쓴다(st.members와 같은 목록)
            st.members = st.aiMembers = st.aiMembers || [];
            st.unread = [];
            redraw(); renderSide();
            if (!st.aiMembers.length) setStatus('「AI ① 기둥」부터 누르세요. 기둥 → 거더 → 빔 순서로, 단계마다 확인하고 고친 뒤 다음 단계로 갑니다.');
            return;
        }
        if (!st.marks) { redraw(); renderSide(); return; }
        var res = st.marks;
        if (readMode() === 'shapes' && st.shapes) {
            var s = st.shapes.stats;
            st.members = unifyBeams(clone(st.shapes.members));
            st.unread = [];
            redraw(); renderSide();
            setStatus(st.members.length
                ? '실제 도형: 기둥 ' + s.columns + ' · 보 ' + s.beams + '칸'
                    + (s.guessed ? ' (이름 없는 보 ' + s.guessed + '칸은 점선 — 양 끝이 기둥·벽이면 거더, 아니면 빔으로 짐작)' : '')
                    + '. 초안이니 도면에서 확인하고 고쳐 주세요.'
                : '부재 모양을 찾지 못했습니다. 기둥을 칠하지 않았거나 보를 점선 두 줄로 그리지 않은 도면일 수 있습니다 — 「기호」 방식을 쓰세요.',
                st.members.length ? 'ok' : 'warn');
            return;
        }
        st.members = clone(res.members);
        st.unread = (res.unread || []).map(function (m) { return Object.assign({}, m); });
        redraw(); renderSide();
        setStatus(st.members.length
            ? '부재 기호 ' + st.members.length + '개를 찾았습니다 (' + st.ms + 'ms). 초안이니 도면에서 확인하고 고쳐 주세요.'
            : '부재 기호를 찾지 못했습니다. 기호가 테두리(네모·알약·타원) 없이 그려진 도면일 수 있습니다.', st.members.length ? 'ok' : 'warn');
    }

    /**
     * 앱 도면에 겹칠 구조도 그림 — 범위(없으면 쪽 전체)를 크게 그린 뒤, 흰 바탕은 투명하게, 선·칠한 부분은 고른 색으로.
     * 연한 회색 선(기둥 칠, 점선 보)도 잘 보이게 진하기를 올린다. → { blob(PNG), x0, y0, x1, y1(쪽 좌표), color }
     */
    async function makeOverlayImage(color) {
        var r, cv, cx;
        if (st.doc) {
            var page = await st.doc.getPage(st.pageNo);
            var v1 = page.getViewport({ scale: 1 });
            r = st.region || { x0: 0, y0: 0, x1: v1.width, y1: v1.height };
            var rw = r.x1 - r.x0, rh = r.y1 - r.y0;
            var S = Math.min(8, 3600 / Math.max(rw, rh));
            var vp = page.getViewport({ scale: S, offsetX: -r.x0 * S, offsetY: -r.y0 * S });
            cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(rw * S)); cv.height = Math.max(1, Math.round(rh * S));
            cx = cv.getContext('2d', { willReadFrequently: true });
            cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
            await page.render({ canvasContext: cx, viewport: vp, intent: 'print' }).promise;
        } else {
            // 그림 파일(스캔 사진): 화면용 그림에서 범위만 잘라 쓴다
            r = st.region || { x0: 0, y0: 0, x1: st.base.width / st.scale, y1: st.base.height / st.scale };
            cv = cropBase(r, 3600);
            cx = cv.getContext('2d', { willReadFrequently: true });
        }
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

    /** 화면용 그림(st.base)에서 쪽 좌표 범위 r을 잘라, 긴 쪽 maxPx 이하 캔버스로 */
    function cropBase(r, maxPx) {
        var s = st.scale;
        var sw = Math.max(1, Math.round((r.x1 - r.x0) * s)), sh = Math.max(1, Math.round((r.y1 - r.y0) * s));
        var k = Math.min(1, maxPx / Math.max(sw, sh));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
        var cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        cx.drawImage(st.base, Math.round(r.x0 * s), Math.round(r.y0 * s), sw, sh, 0, 0, cv.width, cv.height);
        return cv;
    }

    // ---------- AI 읽기(스캔본, 2026-10-16): 그림을 Gemini에 보여 기둥·거더·빔 위치를 받는다(js/core/struct-ai.js) ----------
    var AI = window.BSA.structAi || null;
    function aiKey() { return window.GEMINI_DIRECT_API_KEY || ''; }
    var AI_STEPS = ['기둥', '거더', '빔'];
    var AI_BTN = { '기둥': 'btnAiCol', '거더': 'btnAiGir', '빔': 'btnAiBeam' };
    var AI_NEXT = { '기둥': '거더', '거더': '빔', '빔': '' };
    /** 손으로 그릴 때와 같은 순서: ① 기둥 → 확인 → ② 거더(기둥 알려 줌) → 확인 → ③ 빔(기둥·거더 알려 줌). 그 종류만 새로 바꾼다 */
    /**
     * ① 예시로 기둥 찾기(2026-10-16, js/core/struct-raster.js) — 사람이 기둥 하나를 네모로 감싸면 그림 전체에서
     * 똑같이 생긴 곳을 모두 기둥으로. 도면마다 기둥이 칠한 네모·빈 네모·동그라미로 달라 규칙·AI보다 정확하다.
     * 찾은 기둥은 모두 예시와 같은 크기. 범위를 정했으면 그 안만.
     */
    function strictness() { var el = $('colStrict'); var v = el ? parseFloat(el.value) : 0.6; return Number.isFinite(v) ? v : 0.6; }
    /**
     * 예시 + 기둥 줄(2026-10-17, js/core/struct-raster.js matchOnLines): 「① 기둥 줄 찍기」로 누른 기둥들의 X·Y 줄 교차점은
     * 예시와 덜 닮아도(기준 −0.2) 기둥으로 친다 — 스캔 얼룩·보 선이 겹쳐 통째 찾기에서 빠지던 기둥을 잡는다.
     * 누른 기둥 자체는 늘 기둥. 둘을 합쳐 겹치는 것은 하나만.
     */
    function lineThreshold() { return Math.max(0.3, strictness() - 0.2); }
    function runColumnMatch() {
        var RS = window.BSA.structRaster, smp = st.colSample;
        if (!RS || !st.base || !smp) return;
        setStatus('예시와 같은 기둥을 찾는 중…');
        setTimeout(function () {
            try {
                if (!st.baseImg || st.baseImg.src !== st.base) {
                    st.baseImg = { src: st.base, img: st.base.getContext('2d').getImageData(0, 0, st.base.width, st.base.height) };
                }
                var s = st.scale, t0 = performance.now();
                var rect = { x: smp.x0 * s, y: smp.y0 * s, w: (smp.x1 - smp.x0) * s, h: (smp.y1 - smp.y0) * s };
                var hits = RS.matchColumns(st.baseImg.img, rect, { threshold: strictness() });
                var pts = st.linePts || [], onLines = null;
                if (pts.length && RS.matchOnLines) {
                    onLines = RS.matchOnLines(st.baseImg.img, rect, pts.map(function (p) { return { x: p.x * s, y: p.y * s }; }), { threshold: lineThreshold() });
                    st.lineGrid = { xs: onLines.xs.map(function (v) { return v / s; }), ys: onLines.ys.map(function (v) { return v / s; }) };
                    // 줄에서 찾은 것을 먼저(누른 기둥 포함), 통째 찾기 결과는 겹치지 않는 것만 보탠다
                    var size = Math.max(rect.w, rect.h) * 0.6;
                    hits = onLines.columns.concat(hits.filter(function (h) {
                        return !onLines.columns.some(function (c) { return Math.abs(c.x - h.x) < size && Math.abs(c.y - h.y) < size; });
                    }));
                } else st.lineGrid = null;
                var stamp = Date.now();
                var found = hits.map(function (b, i) {
                    return { id: 'sm_px' + stamp + '_' + (i + 1), shape: 'column', type: '기둥', label: '', ai: true, x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s };
                }).filter(function (m) { return inRegion(m); });
                var cur = readMode() === 'ai' ? st.members : (st.aiMembers || []);
                st.aiMembers = unifyBeams(cur.filter(function (m) { return m.type !== '기둥'; }).concat(found));
                var sel = $('readMode');
                if (sel) sel.value = 'ai';
                applyMode();
                syncAiButtons();
                var ms = Math.round(performance.now() - t0);
                if (onLines) {
                    setStatus('기둥 ' + found.length + '개(기둥 줄 가로 ' + onLines.ys.length + ' · 세로 ' + onLines.xs.length + '줄 교차점 ' + onLines.columns.length + '개 포함, ' + ms + 'ms). '
                        + (st.linePicking ? '줄이 빠졌으면 그 줄의 기둥을 하나 더 누르세요(잘못 누른 점은 다시 누르면 빠짐). 다 되면 「① 기둥 줄 찍기」를 다시 눌러 끝냅니다.'
                            : '틀린 것은 눌러서 빼고, 다 확인했으면 「AI ② 거더」를 누르세요.'), found.length ? 'ok' : 'warn');
                } else {
                    setStatus('기둥 ' + found.length + '개를 찾았습니다(예시와 같은 크기, ' + ms + 'ms). '
                        + '빠진 기둥이 많으면 「① 기둥 줄 찍기」로 맨 윗줄·왼쪽 줄 기둥을 눌러 주세요. 너무 많이 잡혔으면 「엄격」. 다 확인했으면 「AI ② 거더」.', found.length ? 'ok' : 'warn');
                }
            } catch (err) {
                console.error(err);
                setStatus('기둥을 찾지 못했습니다: ' + (err && err.message ? err.message : err), 'warn');
            }
        }, 20);
    }
    /** 「① 기둥 줄 찍기」 중 누른 점: 이미 찍은 점(예시 크기 안)을 누르면 빼고, 아니면 보탠 뒤 바로 다시 찾는다 */
    function toggleLinePoint(p) {
        var smp = st.colSample;
        var reach = smp ? Math.max(smp.x1 - smp.x0, smp.y1 - smp.y0) : screenPad(12);
        st.linePts = st.linePts || [];
        var i = st.linePts.findIndex(function (q) { return Math.abs(q.x - p.x) <= reach && Math.abs(q.y - p.y) <= reach; });
        if (i >= 0) st.linePts.splice(i, 1); else st.linePts.push(p);
        redraw();
        runColumnMatch();
    }
    async function runAiStep(step) {
        if (!st.base || !AI) return;
        var sel = $('readMode');
        var cur = readMode() === 'ai' ? st.members : (st.aiMembers || []);
        var keep = cur.filter(function (m) { return m.type !== step; });   // 이 종류는 새로 받은 것으로 바꾼다
        var known = keep.filter(function (m) { return !m.excluded; });
        var r = st.region || { x0: 0, y0: 0, x1: st.base.width / st.scale, y1: st.base.height / st.scale };
        if (!aiKey()) { setStatus('AI 키가 없습니다. 배포된 사이트(github.io)에서만 AI로 읽을 수 있습니다.', 'warn'); return; }
        if (step === '거더' && !known.some(function (m) { return m.type === '기둥'; })) { setStatus('기둥이 없습니다. 먼저 「AI ① 기둥」을 누르세요.', 'warn'); return; }
        if (step === '빔' && !known.some(function (m) { return m.type === '거더'; })) { setStatus('거더가 없습니다. 먼저 「AI ② 거더」를 누르세요.', 'warn'); return; }
        var crop = { x0: r.x0, y0: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
        if (step === '기둥' && AI.tileGrid) { runAiColumnsTiled(r, keep); return; }
        st.aiBusy = true; syncAiButtons();
        setStatus('AI가 ' + step + '을(를) 찾는 중입니다… (큰 도면은 1분 가까이 걸릴 수 있습니다)');
        try {
            var cv = cropBase(r, 3072);
            var dataUrl = cv.toDataURL('image/jpeg', 0.92);
            var text = await AI.callGemini(aiKey(), { mimeType: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }, AI.buildPrompt(step, known, crop));
            var got = AI.stepMembers(step, AI.parseResponse(text), crop, known);
            st.aiMembers = unifyBeams(keep.concat(got));
            if (sel) sel.value = 'ai';
            applyMode();
            var next = AI_NEXT[step];
            setStatus(step + ' ' + got.length + '개를 찾았습니다. 틀린 것은 눌러서 빼거나 종류를 바꾸고'
                + (step === '기둥' ? '(빠진 기둥은 「누르면: 기둥으로」로 고른 뒤 그 자리를 누르면 추가)' : '')
                + (next ? ', 다 확인했으면 「AI ' + (AI_STEPS.indexOf(next) + 1) + ' ' + next + '」를 누르세요.' : ', 다 됐으면 기준점을 찍고 「앱으로 보내기」를 누르세요.')
                + ' (AI 초안이라 빠지거나 틀린 것이 있습니다)', got.length ? 'ok' : 'warn');
        } catch (err) {
            console.error(err);
            setStatus('AI로 읽지 못했습니다: ' + (err && err.message ? err.message : err), 'warn');
        } finally {
            st.aiBusy = false; syncAiButtons();
        }
    }
    /**
     * AI ① 기둥 — 조각으로 나눠 묻기(2026-10-17). 통째로 보내면 기둥이 몇 픽셀이라 AI가 거의 못 찾는다.
     * 화면용 그림 기준 한 변 900px 조각(이웃과 80px 겹침, 기둥보다 넉넉히)으로 잘라 3개씩 동시에 묻고,
     * 잘린 기둥은 버리고 겹친 것은 하나로 합친다(js/core/struct-ai.js tileGrid·mergeTileColumns).
     */
    var TILE_PX = 900, TILE_OVERLAP_PX = 80, TILE_PARALLEL = 3;
    async function runAiColumnsTiled(r, keep) {
        var s = st.scale;
        var tiles = AI.tileGrid(r, TILE_PX / s, TILE_OVERLAP_PX / s);
        if (!tiles.length) return;
        st.aiBusy = true; syncAiButtons();
        var done = 0, failed = 0, lastErr = null, perTile = [];
        var show = function () { setStatus('AI가 기둥을 찾는 중입니다… 조각 ' + done + '/' + tiles.length + (failed ? ' (실패 ' + failed + ')' : '') + ' — 도면을 ' + tiles.length + '조각으로 나눠 크게 보여 줍니다.'); };
        var wait = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
        var ask = async function (t) {
            var cv = cropBase({ x0: t.x0, y0: t.y0, x1: t.x0 + t.w, y1: t.y0 + t.h }, 1536);
            var dataUrl = cv.toDataURL('image/jpeg', 0.92);
            var crop = { x0: t.x0, y0: t.y0, w: t.w, h: t.h };
            for (var attempt = 0; ; attempt++) {
                try {
                    var text = await AI.callGemini(aiKey(), { mimeType: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }, AI.buildPrompt('기둥', [], crop, { tile: true }));
                    return AI.stepMembers('기둥', AI.parseResponse(text), crop, []);
                } catch (err) {
                    // 한꺼번에 많이 물어 429가 나면 조금 기다렸다 다시(두 번까지)
                    if (attempt < 2 && /\(429\)/.test(String(err && err.message))) { await wait(15000 * (attempt + 1)); continue; }
                    throw err;
                }
            }
        };
        show();
        var next = 0;
        var worker = async function () {
            while (next < tiles.length) {
                var t = tiles[next++];
                try { perTile.push({ tile: t, rects: await ask(t) }); }
                catch (err) { console.error(err); failed++; lastErr = err; }
                done++; show();
            }
        };
        try {
            var workers = [];
            for (var w = 0; w < Math.min(TILE_PARALLEL, tiles.length); w++) workers.push(worker());
            await Promise.all(workers);
            if (!perTile.length) throw lastErr || new Error('답을 받은 조각이 없습니다.');
            var stamp = Date.now();
            var got = AI.mergeTileColumns(perTile, 4 / s).map(function (c, i) {
                return { id: 'sm_ai' + stamp + '_기둥_' + (i + 1), shape: 'column', type: '기둥', label: c.label, ai: true, x: c.x, y: c.y, w: c.w, h: c.h };
            }).filter(inRegion);
            st.aiMembers = unifyBeams(keep.concat(got));
            var sel = $('readMode');
            if (sel) sel.value = 'ai';
            applyMode();
            setStatus('기둥 ' + got.length + '개를 찾았습니다(' + tiles.length + '조각' + (failed ? ', 실패 ' + failed + '조각 — 그 부분은 빠졌을 수 있음' : '') + '). '
                + '틀린 것은 눌러서 빼고, 빠진 기둥은 「누르면: 기둥으로」로 그 자리를 누르면 추가. 다 확인했으면 「AI ② 거더」를 누르세요. (AI 초안이라 빠지거나 틀린 것이 있습니다)',
                got.length && !failed ? 'ok' : 'warn');
        } catch (err) {
            console.error(err);
            setStatus('AI로 읽지 못했습니다: ' + (err && err.message ? err.message : err), 'warn');
        } finally {
            st.aiBusy = false; syncAiButtons();
        }
    }
    /** 단계 단추: 앞 단계 결과가 있어야 다음 단계를 누를 수 있고, 다음에 누를 단추를 파랗게 */
    function syncAiButtons() {
        var list = readMode() === 'ai' ? st.members : (st.aiMembers || []);
        var has = function (t) { return list.some(function (m) { return m.type === t && !m.excluded; }); };
        var ready = { '기둥': true, '거더': has('기둥'), '빔': has('거더') };
        var nextStep = !has('기둥') ? '기둥' : (!has('거더') ? '거더' : (!has('빔') ? '빔' : ''));
        AI_STEPS.forEach(function (t) {
            var b = $(AI_BTN[t]);
            if (!b) return;
            b.disabled = !AI || !st.base || !!st.aiBusy || !ready[t];
            b.classList.toggle('primary', !!st.base && t === nextStep);
        });
        // ① 기둥은 예시로 찾기를 먼저 권한다(AI ① 기둥은 파랗게 하지 않음)
        var sb = $('btnColSample');
        if (sb) {
            sb.disabled = !st.base || !window.BSA.structRaster;
            sb.classList.toggle('primary', !!st.base && !st.colSample && nextStep === '기둥');
            var ac = $(AI_BTN['기둥']);
            if (ac) ac.classList.remove('primary');
        }
        // ① 기둥 줄 찍기: 예시를 감싼 뒤에 쓴다
        var lb = $('btnColLines');
        if (lb) {
            lb.disabled = !st.base || !st.colSample || !(window.BSA.structRaster && window.BSA.structRaster.matchOnLines);
            if (lb.disabled && st.linePicking) st.linePicking = false;
            lb.classList.toggle('on', !!st.linePicking);
            lb.classList.toggle('primary', !st.linePicking && !!st.colSample && !(st.linePts && st.linePts.length));
        }
    }

    // ---------- 그리기 ----------
    function inRegion(m) {
        var r = st.region;
        return !r || (m.x >= r.x0 && m.x <= r.x1 && m.y >= r.y0 && m.y <= r.y1);
    }
    function counted() { return st.members.filter(function (m) { return !m.excluded && useType(m) && inRegion(m); }); }

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
        // 편집: 고른 부재(검은 점선) · 거더·빔은 양 끝 손잡이 · 그리기 시작 점
        var px1 = screenPad(1) * s;   // 화면 1픽셀 = 캔버스 몇 픽셀
        var sm = selected();
        if (sm) {
            var g = 3 * px1;
            x.lineWidth = 2 * px1; x.setLineDash([6 * px1, 4 * px1]); x.strokeStyle = '#0f172a';
            x.strokeRect((sm.x - sm.w / 2) * s - g, (sm.y - sm.h / 2) * s - g, sm.w * s + g * 2, sm.h * s + g * 2);
            x.setLineDash([]);
            if (isLine(sm.type)) {
                var hz = sm.w >= sm.h, hs = 5 * px1;
                [[-1], [1]].forEach(function (k) {
                    var ex = hz ? sm.x + k[0] * sm.w / 2 : sm.x, ey = hz ? sm.y : sm.y + k[0] * sm.h / 2;
                    x.fillStyle = '#ffffff'; x.fillRect(ex * s - hs, ey * s - hs, hs * 2, hs * 2);
                    x.lineWidth = 2 * px1; x.strokeStyle = '#0f172a'; x.strokeRect(ex * s - hs, ey * s - hs, hs * 2, hs * 2);
                });
            }
        }
        if (st.pend) {
            var pp = st.pend, pr = 7 * px1;
            x.strokeStyle = COLORS[pp.type] || '#111'; x.lineWidth = 2.5 * px1;
            x.beginPath(); x.arc(pp.x * s, pp.y * s, pr, 0, Math.PI * 2); x.stroke();
            x.beginPath(); x.moveTo(pp.x * s - pr * 1.6, pp.y * s); x.lineTo(pp.x * s + pr * 1.6, pp.y * s);
            x.moveTo(pp.x * s, pp.y * s - pr * 1.6); x.lineTo(pp.x * s, pp.y * s + pr * 1.6); x.stroke();
        }
        var r = st.drag || st.region;
        if (r) {
            x.lineWidth = 3; x.setLineDash([12, 8]); x.strokeStyle = '#0f172a';
            x.strokeRect(Math.min(r.x0, r.x1) * s, Math.min(r.y0, r.y1) * s, Math.abs(r.x1 - r.x0) * s, Math.abs(r.y1 - r.y0) * s);
            x.setLineDash([]);
        }
        if (st.colSample && readMode() === 'ai') {
            // ① 기둥 예시(이것과 닮은 것을 찾았다)
            var cs = st.colSample;
            x.lineWidth = 3; x.setLineDash([6, 4]); x.strokeStyle = '#db2777';
            x.strokeRect(cs.x0 * s - 4, cs.y0 * s - 4, (cs.x1 - cs.x0) * s + 8, (cs.y1 - cs.y0) * s + 8);
            x.setLineDash([]);
        }
        if (readMode() === 'ai' && st.lineGrid) {
            // 기둥 줄(누른 기둥들로 알아낸 X·Y) — 연한 분홍 선
            x.save();
            x.globalAlpha = 0.45; x.strokeStyle = '#db2777'; x.lineWidth = 1.5 * px1; x.setLineDash([10 * px1, 6 * px1]);
            st.lineGrid.xs.forEach(function (v) { x.beginPath(); x.moveTo(v * s, 0); x.lineTo(v * s, st.base.height); x.stroke(); });
            st.lineGrid.ys.forEach(function (v) { x.beginPath(); x.moveTo(0, v * s); x.lineTo(st.base.width, v * s); x.stroke(); });
            x.restore();
        }
        if (readMode() === 'ai' && st.linePts && st.linePts.length) {
            // 「① 기둥 줄 찍기」로 누른 점
            x.strokeStyle = '#db2777'; x.lineWidth = 2.5 * px1;
            st.linePts.forEach(function (p) {
                var r0 = 9 * px1;
                x.beginPath(); x.arc(p.x * s, p.y * s, r0, 0, Math.PI * 2); x.stroke();
                x.beginPath(); x.moveTo(p.x * s - r0 * 1.5, p.y * s); x.lineTo(p.x * s + r0 * 1.5, p.y * s);
                x.moveTo(p.x * s, p.y * s - r0 * 1.5); x.lineTo(p.x * s, p.y * s + r0 * 1.5); x.stroke();
            });
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
        $('counts').innerHTML = USE_TYPES.map(function (t) {
            return '<div class="count"><span class="dot" style="background:' + COLORS[t] + '"></span><span>' + t + '</span><b>' + c[t] + '</b></div>';
        }).join('') + '<div class="count total"><span></span><span>합계</span><b>' + list.length + '</b></div>';
        var out = st.members.length - list.length;
        $('countNote').textContent = (out ? '뺀 기호 ' + out + '개 · ' : '') + (st.unread.length ? '못 읽은 기호 ' + st.unread.length + '개(회색 점선)' : '');
        // 이름 없는 것((직접)·AI·빈 이름)은 종류마다 따로 한 줄 — 한데 묶으면 거더까지 기둥으로 바뀐다(2026-10-17)
        var groups = [];
        SM.labelGroups(list.filter(function (m) { return !unnamed(m.label); })).forEach(function (g) { groups.push(g); });
        USE_TYPES.forEach(function (t) {
            var byLabel = {};
            list.forEach(function (m) { if (unnamed(m.label) && m.type === t) byLabel[m.label || ''] = (byLabel[m.label || ''] || 0) + 1; });
            Object.keys(byLabel).forEach(function (l) { groups.push({ label: l, type: t, count: byLabel[l], byType: true }); });
        });
        $('groups').innerHTML = groups.length ? groups.map(function (g) {
            var name = g.label && !g.byType ? esc(g.label) : '<span class="muted">' + (g.label ? esc(g.label) + ' ' : '(이름 없음) ') + g.type + '</span>';
            return '<tr><td><b>' + name + '</b></td><td class="num">' + g.count + '</td><td><select data-label="' + esc(g.label) + '"' + (g.byType ? ' data-type="' + g.type + '"' : '') + '>'
                + USE_TYPES.map(function (t) { return '<option' + (t === g.type ? ' selected' : '') + '>' + t + '</option>'; }).join('')
                + '<option value="">빼기</option></select></td></tr>';
        }).join('') : '<tr><td colspan="3" class="muted">아직 찾은 기호가 없습니다.</td></tr>';
        $('btnCopy').disabled = !list.length;
        var bu = $('btnUndo'), bd = $('btnDel');
        if (bu) bu.disabled = !st.hist.length;
        if (bd) bd.disabled = !selected();
        $('btnSend').disabled = !(st.base && st.refs.length === 2);
        syncAiButtons();
        $('sendNote').textContent = st.refs.length === 2 ? '기준점 2개 정함' : '기준점 ' + st.refs.length + '/2 — 「기준점 지정」으로 두 곳을 찍으세요';
    }

    function unnamed(label) { return !label || label === '(직접)'; }
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

    // ---------- 편집(2026-10-17): 앱 「구조 부재」 레이어(js/tabs/struct-layer.js)와 같은 손놀림 ----------
    // 고르기·끌어 옮기기, 고른 거더·빔 끝 늘이기, 기둥 추가(한 번)·거더·빔 그리기(두 번), 지우기, 되돌리기
    var MS = window.BSA.structMembers || null;
    function clickAction() { var el = $('clickAction'); return el ? el.value : 'toggle'; }
    function isLine(t) { return t === '거더' || t === '빔'; }
    function med(a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }
    function live() { return st.members.filter(function (m) { return !m.excluded && useType(m); }); }
    function selected() { return st.selId ? st.members.find(function (m) { return m.id === st.selId; }) || null : null; }
    function newId(tag) { return 'sm_e' + tag + Date.now() + '_' + Math.floor(Math.random() * 1e6); }
    /** 화면 n픽셀 = 쪽 좌표 얼마(누르는 여유·손잡이 크기) */
    function screenPad(n) {
        var cv = $('view'), r = cv.getBoundingClientRect();
        return n * cv.width / (r.width || cv.width || 1) / (st.scale || 1);
    }
    function hitAt(list, p) { return MS && MS.hitTest ? MS.hitTest(list, p.x, p.y, screenPad(6)) : hit(list, p); }
    function resetEdit() { st.selId = ''; st.pend = null; st.mdrag = null; st.hist = []; st.redo = []; }
    function snapshot() { return { members: st.members.map(function (m) { return Object.assign({}, m); }), unread: st.unread.slice() }; }
    /** 고치기 직전 모습을 되돌리기 목록에 */
    function remember(before) { st.hist.push(before); if (st.hist.length > 60) st.hist.shift(); st.redo = []; }
    function changed() {
        if (readMode() === 'ai') st.aiMembers = st.members;
        if (st.selId && !selected()) st.selId = '';
        redraw(); renderSide();
    }
    function stepHist(back) {
        var from = back ? st.hist : st.redo, to = back ? st.redo : st.hist;
        var s = from.pop();
        if (!s) { setStatus(back ? '되돌릴 것이 없습니다.' : '다시 할 것이 없습니다.'); return; }
        to.push(snapshot());
        st.members = s.members; st.unread = s.unread; st.pend = null;
        changed();
        setStatus(back ? '되돌렸습니다.' : '다시 했습니다.');
    }
    function deleteSelected() {
        var m = selected();
        if (!m) return;
        remember(snapshot());
        st.members = st.members.filter(function (q) { return q !== m; });
        st.selId = '';
        changed();
        setStatus(m.type + ' 하나를 지웠습니다(Ctrl+Z 되돌리기).', 'ok');
    }
    /** 기둥 크기 = 다른 기둥 중간값(없으면 화면 약 20px) */
    function columnBox() {
        var cs = live().filter(function (q) { return q.type === '기둥'; });
        var d = screenPad(20);
        return { w: cs.length ? med(cs.map(function (q) { return q.w; })) : d, h: cs.length ? med(cs.map(function (q) { return q.h; })) : d };
    }
    /** 그 종류 통일 두께. 없으면 다른 보 종류, 그것도 없으면 기둥의 절반쯤 */
    function lineThickness(type) {
        var th = MS && MS.beamThickness ? MS.beamThickness(live()) : {};
        if (th[type] || th[type === '거더' ? '빔' : '거더']) return th[type] || th[type === '거더' ? '빔' : '거더'];
        var c = columnBox();
        return Math.max(screenPad(4), Math.min(c.w, c.h) * 0.5);
    }
    /** 누른 점을 기둥 중심(빔이면 거더·빔 중심선도)에 붙인다 → { x, y, hx, hy, on } */
    function snapPoint(p, pad, type, exclude) {
        var targets = live().filter(function (d) { return d !== exclude && (d.type === '기둥' || (type === '빔' && isLine(d.type))); });
        var h = MS && MS.hitTest ? MS.hitTest(targets, p.x, p.y, pad) : null;
        if (!h) return { x: p.x, y: p.y, hx: 0, hy: 0, on: null };
        if (h.type === '기둥') return { x: h.x, y: h.y, hx: h.w / 2, hy: h.h / 2, on: h };
        return h.w >= h.h ? { x: p.x, y: h.y, hx: 0, hy: h.h / 2, on: h } : { x: h.x, y: p.y, hx: h.w / 2, hy: 0, on: h };
    }
    /** 같은 종류·같은 방향 보의 중심선이 가까우면 그 줄에 맞춘다 */
    function alignPerp(type, horiz, perp, th, pad) {
        var reach = Math.max(pad * 2, th * 2), best = perp, bd = reach;
        live().forEach(function (d) {
            if (d.type !== type || (d.w >= d.h) !== horiz) return;
            var dist = Math.abs((horiz ? d.y : d.x) - perp);
            if (dist < bd) { bd = dist; best = horiz ? d.y : d.x; }
        });
        return best;
    }
    /** 기둥은 다른 기둥의 세로줄·가로줄이 가까우면 따로따로 그 줄에 맞춘다 */
    function alignColumn(x, y, size, pad, exclude) {
        var reach = Math.max(pad * 2, size * 0.75), bx = x, by = y, dx = reach, dy = reach;
        live().forEach(function (d) {
            if (d.type !== '기둥' || d === exclude) return;
            if (Math.abs(d.x - x) < dx) { dx = Math.abs(d.x - x); bx = d.x; }
            if (Math.abs(d.y - y) < dy) { dy = Math.abs(d.y - y); by = d.y; }
        });
        return { x: bx, y: by };
    }
    /** 거더·빔 그리기: 첫 번째 누름 = 시작, 두 번째 = 끝. 가로·세로 중 가까운 쪽으로 곧게, 기둥 면에서 면까지, 사이 기둥(빔은 거더도)에서 끊음 */
    function addLinePoint(p, type) {
        var pad = screenPad(6);
        var a = snapPoint(p, pad, type);
        if (!st.pend || st.pend.type !== type) {
            st.pend = Object.assign({ type: type }, a);
            redraw();
            setStatus(type + ' 시작 점을 찍었습니다' + (a.on ? '(' + a.on.type + '에 붙음)' : '') + '. 끝 점을 누르세요(Esc 취소).');
            return;
        }
        var s = st.pend;
        st.pend = null;
        var dx = a.x - s.x, dy = a.y - s.y, th = lineThickness(type);
        var horiz = Math.abs(dx) >= Math.abs(dy);
        var lo = horiz ? (s.x <= a.x ? s : a) : (s.y <= a.y ? s : a), hi = lo === s ? a : s;
        var from = horiz ? lo.x + lo.hx : lo.y + lo.hy, to = horiz ? hi.x - hi.hx : hi.y - hi.hy;
        if (!(to - from > th)) { redraw(); setStatus('두 점이 너무 가깝습니다. 시작 점부터 다시 눌러 주세요.', 'warn'); return; }
        var perp = alignPerp(type, horiz, horiz ? (s.y + a.y) / 2 : (s.x + a.x) / 2, th, pad);
        var cutters = live().filter(function (d) { return d.type === '기둥' || (type === '빔' && isLine(d.type) && (d.w >= d.h) !== horiz); });
        var segs = MS && MS.splitRun ? MS.splitRun({ horiz: horiz, from: from, to: to, perp: perp, minLen: th * 0.5 }, cutters) : [{ from: from, to: to }];
        if (!segs.length) { redraw(); setStatus('그릴 칸이 없습니다(기둥 사이가 너무 좁음).', 'warn'); return; }
        remember(snapshot());
        segs.forEach(function (sg, i) {
            var r = horiz ? { x: (sg.from + sg.to) / 2, y: perp, w: sg.to - sg.from, h: th } : { x: perp, y: (sg.from + sg.to) / 2, w: th, h: sg.to - sg.from };
            st.members.push({ id: newId('l' + i), shape: 'beam', type: type, label: '(직접)', x: r.x, y: r.y, w: r.w, h: r.h });
        });
        st.members = unifyBeams(st.members);
        changed();
        setStatus(type + ' ' + segs.length + '칸을 그렸습니다' + (segs.length > 1 ? '(사이 ' + (type === '빔' ? '거더·기둥' : '기둥') + '에서 끊음)' : '') + '. 이어서 다음 시작 점을 누르세요.', 'ok');
    }
    /** 고른 거더·빔의 끝 근처를 눌렀으면 → 끝 잡기 정보 */
    function grabEnd(p, pad) {
        var d = selected();
        if (!d || !isLine(d.type)) return null;
        var horiz = d.w >= d.h;
        var along = horiz ? p.x : p.y, perp = horiz ? p.y : p.x;
        var c = horiz ? d.y : d.x, half = (horiz ? d.h : d.w) / 2;
        var s = horiz ? d.x - d.w / 2 : d.y - d.h / 2, e = horiz ? d.x + d.w / 2 : d.y + d.h / 2;
        var reach = Math.max(pad * 1.5, half * 1.5);
        if (Math.abs(perp - c) > half + reach) return null;
        var which = Math.abs(along - e) <= reach ? 'e' : (Math.abs(along - s) <= reach ? 's' : '');
        if (!which) return null;
        return { mode: 'end', which: which, horiz: horiz, fixed: which === 'e' ? s : e, minLen: half * 2 };
    }
    /** 끝을 at으로 옮긴 모습(반대 끝·두께·중심선은 그대로, 뒤집히지 않게) */
    function stretchTo(dr, at) {
        var lo = dr.which === 'e' ? dr.fixed : Math.min(at, dr.fixed - dr.minLen);
        var hi = dr.which === 'e' ? Math.max(at, dr.fixed + dr.minLen) : dr.fixed;
        return dr.horiz ? { x: (lo + hi) / 2, y: dr.orig.y, w: hi - lo, h: dr.orig.h } : { x: dr.orig.x, y: (lo + hi) / 2, w: dr.orig.w, h: hi - lo };
    }

    function onClickMark(p) {
        var action = clickAction();
        if (action === 'edit') {
            var g = hitAt(st.members, p);
            st.selId = g ? g.id : '';
            redraw(); renderSide();
            if (g) setStatus(g.type + (g.label && g.label !== '(직접)' ? ' ' + g.label : '') + ' 고름 — 끌어서 옮기기' + (isLine(g.type) ? ', 끝 네모를 끌어 늘이기' : '') + ', Delete 지우기.');
            return;
        }
        if (action.indexOf('draw:') === 0) { addLinePoint(p, action.slice(5)); return; }
        var before = snapshot();
        var m = hitAt(st.members, p);
        if (m) {
            if (action === 'toggle') m.excluded = !m.excluded;
            else { m.type = action; m.excluded = false; }
        } else {
            var u = hit(st.unread, p);
            if (!u && action === '기둥') {
                // 빠진 기둥: 누른 자리(다른 기둥 줄에 맞춤)에 다른 기둥 크기(중간값)로 넣는다
                var b = columnBox();
                var at = alignColumn(p.x, p.y, Math.max(b.w, b.h), screenPad(6));
                st.members.push({ id: newId('c'), shape: 'column', type: '기둥', label: '(직접)', x: at.x, y: at.y, w: b.w, h: b.h, ai: readMode() === 'ai' });
                remember(before);
                changed();
                return;
            }
            if (!u || action === 'toggle') return;
            st.unread = st.unread.filter(function (q) { return q !== u; });
            st.members.push({ id: newId('u'), shape: u.shape, x: u.x, y: u.y, w: u.w, h: u.h, type: action, label: '(직접)', letter: '', score: 0 });
        }
        remember(before);
        st.members = unifyBeams(st.members);   // 종류가 바뀌었으면 그 종류 두께로
        changed();
    }

    function bind() {
        var cv = $('view');
        cv.addEventListener('mousedown', function (ev) {
            if (!st.base || !(st.picking || st.samplePicking)) return;
            var p = pagePoint(ev);
            st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
            ev.preventDefault();
        });
        // 편집: 부재를 잡으면 옮기고, 고른 거더·빔의 끝 네모를 잡으면 늘인다. 빈 곳을 잡으면 아래 「끌어서 이동」으로 넘어간다
        cv.addEventListener('mousedown', function (ev) {
            if (!st.base || st.picking || st.samplePicking || st.refPicking || ev.button !== 0 || clickAction() !== 'edit') return;
            var p = pagePoint(ev), pad = screenPad(6);
            var g = grabEnd(p, pad);
            var m = g ? selected() : hitAt(st.members, p);
            if (!m) return;
            st.selId = m.id;
            st.mdrag = Object.assign(g || { mode: 'move' }, { m: m, start: p, cx: ev.clientX, cy: ev.clientY,
                orig: { x: m.x, y: m.y, w: m.w, h: m.h }, before: snapshot(), moved: false });
            ev.preventDefault();
            redraw(); renderSide();
        });
        window.addEventListener('mousemove', function (ev) {
            var dr = st.mdrag;
            if (!dr) return;
            if (!dr.moved && Math.hypot(ev.clientX - dr.cx, ev.clientY - dr.cy) < 3) return;
            dr.moved = true;
            var p = pagePoint(ev);
            if (dr.mode === 'end') Object.assign(dr.m, stretchTo(dr, dr.horiz ? p.x : p.y));
            else { dr.m.x = dr.orig.x + (p.x - dr.start.x); dr.m.y = dr.orig.y + (p.y - dr.start.y); }
            redraw();
        });
        window.addEventListener('mouseup', function (ev) {
            var dr = st.mdrag;
            if (!dr) return;
            st.mdrag = null;
            if (!dr.moved) return;   // 누르기만 했으면 click이 고른다
            st._justDragged = true;
            var m = dr.m, pad = screenPad(6);
            if (dr.mode === 'end') {
                // 놓은 곳이 기둥(빔이면 거더·빔도)이면 그 면에 딱 붙인다
                var pe = pagePoint(ev), sp = snapPoint(pe, pad, m.type, m);
                var at = dr.horiz ? pe.x : pe.y;
                if (sp.on) at = dr.which === 'e' ? (dr.horiz ? sp.x - sp.hx : sp.y - sp.hy) : (dr.horiz ? sp.x + sp.hx : sp.y + sp.hy);
                Object.assign(m, stretchTo(dr, at));
            } else if (m.type === '기둥') {
                var a = alignColumn(m.x, m.y, Math.max(m.w, m.h), pad, m);   // 다른 기둥 줄에 맞춤
                m.x = a.x; m.y = a.y;
            }
            remember(dr.before);
            changed();
        });
        var undoBtn = $('btnUndo');
        if (undoBtn) undoBtn.addEventListener('click', function () { stepHist(true); });
        var delBtn = $('btnDel');
        if (delBtn) delBtn.addEventListener('click', deleteSelected);
        var actSel = $('clickAction');
        if (actSel) actSel.addEventListener('change', function () {
            st.pend = null;
            if (this.value !== 'edit') st.selId = '';
            redraw(); renderSide();
            if (this.value === 'edit') setStatus('부재를 눌러 고르고 끌어서 옮기세요. 고른 거더·빔은 양 끝 네모를 끌어 늘입니다. Delete 지우기 · Ctrl+Z 되돌리기.');
            else if (this.value.indexOf('draw:') === 0) setStatus(this.value.slice(5) + ' 그리기: 시작 점(기둥)과 끝 점(기둥)을 차례로 누르세요. 사이 ' + (this.value === 'draw:빔' ? '거더·기둥' : '기둥') + '에서 칸마다 끊습니다.');
        });
        document.addEventListener('keydown', function (e) {
            var t = e.target;
            if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return;
            if (!st.base) return;
            // 한글 입력 상태에서도 잡히게 e.code도 본다
            var isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z', isY = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y';
            if ((e.ctrlKey || e.metaKey) && !e.altKey && (isZ || isY)) {
                e.preventDefault();
                stepHist(isZ && !e.shiftKey);
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected()) {
                e.preventDefault();
                deleteSelected();
            } else if (e.key === 'Escape' && (st.pend || st.selId || st.linePicking)) {
                st.pend = null; st.selId = '';
                if (st.linePicking) { st.linePicking = false; $('view').style.cursor = ''; syncAiButtons(); }
                redraw(); renderSide();
                setStatus('취소했습니다.');
            }
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
            cv.style.cursor = '';
            if (st.samplePicking) {
                // ① 예시 기둥: 감싼 네모로 같은 모양 찾기
                st.samplePicking = false;
                var sb = $('btnColSample');
                if (sb) sb.classList.remove('on');
                st._justDragged = true;
                if (Math.abs(d.x1 - d.x0) > 0.5 && Math.abs(d.y1 - d.y0) > 0.5) {
                    st.colSample = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) };
                    runColumnMatch();
                } else setStatus('기둥을 끌어서 네모로 감싸 주세요(누르기만 하면 안 됩니다).', 'warn');
                redraw();
                return;
            }
            st.picking = false;
            $('btnRegion').classList.remove('on');
            if (Math.abs(d.x1 - d.x0) > 5 && Math.abs(d.y1 - d.y0) > 5) {
                st.region = { x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1), x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1) };
            }
            st._justDragged = true;
            redraw(); renderSide();
        });
        cv.addEventListener('click', function (ev) {
            if (st._justDragged) { st._justDragged = false; return; }
            if (!st.base || st.picking || st.samplePicking) return;
            if (st.linePicking) { toggleLinePoint(pagePoint(ev)); return; }
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
            // 기본은 기둥·거더·빔 도형만 보낸다. 「구조도 그림도 같이」를 켰을 때만 그림을 만든다(칸이 없는 옛 HTML이면 예전처럼 그림도).
            var chk = $('sendOverlay');
            var withPic = chk ? chk.checked : true;
            if (!list.length && !withPic) { setStatus('보낼 부재가 없습니다.', 'warn'); return; }
            btn.disabled = true;
            setStatus(withPic ? '구조도 그림을 만드는 중…' : '보내는 중…');
            (withPic ? makeOverlayImage($('overlayColor').value) : Promise.resolve(null)).then(function (overlay) {
                var data = { at: Date.now(), fileName: st.fileName, refs: st.refs.map(function (p) { return { x: p.x, y: p.y }; }),
                    members: list.map(function (m) { return { type: m.type, label: m.label === '(직접)' ? '' : m.label, x: m.x, y: m.y, w: m.w, h: m.h }; }),
                    overlay: overlay };
                return window.BSA.structMembers.saveHandoff(data).then(function () {
                    var c = SM.countsByType(list);
                    setStatus((overlay ? '구조도 그림(' + Math.round(overlay.blob.size / 1024) + 'KB)과 ' : '')
                        + USE_TYPES.map(function (t) { return t + ' ' + c[t]; }).join(' · ')
                        + '개를 보낼 준비가 됐습니다. 앱의 그 층 결함위치도에서 「구조 부재」 → 「가져오기」를 누르고, 같은 두 기준점을 같은 순서로 누르세요.', 'ok');
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
            if (!st.base || st.picking || st.samplePicking || st.mdrag || ev.button !== 0) return;
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
            var label = sel.getAttribute('data-label'), only = sel.getAttribute('data-type'), v = sel.value;
            remember(snapshot());
            st.members.forEach(function (m) {
                if ((m.label || '') !== label || (only && m.type !== only) || m.excluded || !inRegion(m)) return;
                if (v) m.type = v; else m.excluded = true;
            });
            st.members = unifyBeams(st.members);
            changed();
        });
        $('btnCopy').addEventListener('click', function () {
            var c = SM.countsByType(counted());
            var text = (st.fileName ? st.fileName + '\n' : '') + USE_TYPES.map(function (t) { return t + '\t' + c[t]; }).join('\n');
            navigator.clipboard.writeText(text).then(function () { setStatus('부재 수를 복사했습니다(엑셀에 붙여 넣을 수 있습니다).', 'ok'); },
                function () { setStatus('복사하지 못했습니다.', 'warn'); });
        });
        var modeSel = $('readMode');
        if (modeSel) {
            if (!SS) modeSel.disabled = true;
            // 기본은 실제 도형, 사람이 고른 적 있으면 그것
            try { var saved = localStorage.getItem(MODE_KEY); if (saved === 'marks' || saved === 'shapes') modeSel.value = saved; } catch (_e) { /* ignore */ }
            if (!SS) modeSel.value = 'marks';
            modeSel.addEventListener('change', function () {
                if (this.value !== 'ai') { try { localStorage.setItem(MODE_KEY, this.value); } catch (_e) { /* ignore */ } }
                applyMode();
            });
        }
        $('pageNo').addEventListener('change', function () {
            st.pageNo = Math.min(Math.max(1, parseInt(this.value, 10) || 1), st.doc ? st.doc.numPages : 1);
            this.value = st.pageNo;
            if (st.doc) analyzePage().catch(fail);
        });
        AI_STEPS.forEach(function (t) {
            var b = $(AI_BTN[t]);
            if (b) b.addEventListener('click', function () { runAiStep(t); });
        });
        // ① 예시로 기둥 찾기: 누르고 → 기둥 하나를 끌어서 감싸기. 닮은 정도를 바꾸면 같은 예시로 다시 찾는다
        // ① 기둥 줄 찍기: 켜고 맨 윗줄·왼쪽 줄 기둥을 누른다(누를 때마다 다시 찾음). 다시 누르면 끝
        var linesBtn = $('btnColLines');
        if (linesBtn) linesBtn.addEventListener('click', function () {
            if (!st.base || !st.colSample) return;
            st.linePicking = !st.linePicking;
            st.refPicking = false;
            var rb = $('btnRefs');
            if (rb) rb.classList.remove('on');
            cv.style.cursor = st.linePicking ? 'crosshair' : '';
            syncAiButtons();
            if (st.linePicking) setStatus('맨 윗줄 기둥을 왼쪽부터 끝까지, 왼쪽 줄 기둥을 위부터 끝까지 누르세요(대충 눌러도 기둥에 붙음). 다른 동에 줄이 따로 있으면 그 줄 기둥도 하나씩. 누를 때마다 다시 찾습니다.');
            else { redraw(); setStatus('기둥 줄 찍기를 끝냈습니다(누른 점 ' + (st.linePts || []).length + '개). 틀린 것은 눌러서 빼고, 다 확인했으면 「AI ② 거더」를 누르세요.', 'ok'); }
        });
        var smpBtn = $('btnColSample');
        if (smpBtn) smpBtn.addEventListener('click', function () {
            if (!st.base) return;
            st.samplePicking = !st.samplePicking;
            this.classList.toggle('on', st.samplePicking);
            cv.style.cursor = st.samplePicking ? 'crosshair' : '';
            if (st.samplePicking) setStatus('기둥 하나를 끌어서 네모로 감싸세요(기둥보다 조금 여유 있게). 크게 확대해서 감싸면 정확합니다.');
        });
        var strictSel = $('colStrict');
        if (strictSel) strictSel.addEventListener('change', function () { if (st.colSample) runColumnMatch(); });
        var openFile = function (file) {
            if (!file) return;
            st.fileName = file.name;
            st.aiMembers = null;
            st.colSample = null; st.linePts = []; st.lineGrid = null; st.linePicking = false;
            if (modeSel && modeSel.value === 'ai') modeSel.value = (SS ? 'shapes' : 'marks');
            if (/^image\//.test(file.type || '') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name || '')) { openImage(file); return; }
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
        // 스캔 사진(JPG·PNG): 선 데이터가 없으니 그림만 깔고 「AI ①②③」으로 찾는다. 쪽 좌표 = 화면용 그림 픽셀(배율 1)
        var openImage = function (file) {
            setStatus('그림을 여는 중…');
            var url = URL.createObjectURL(file);
            var im = new Image();
            im.onload = function () {
                URL.revokeObjectURL(url);
                var k = Math.min(1, 4000 / Math.max(im.naturalWidth, im.naturalHeight));
                var base = document.createElement('canvas');
                base.width = Math.max(1, Math.round(im.naturalWidth * k)); base.height = Math.max(1, Math.round(im.naturalHeight * k));
                var bx = base.getContext('2d');
                bx.fillStyle = '#fff'; bx.fillRect(0, 0, base.width, base.height);
                bx.drawImage(im, 0, 0, base.width, base.height);
                st.doc = null; st.pageNo = 1; st.base = base; st.scale = 1;
                st.region = null; st.refs = []; st.refPicking = false;
                st.members = []; st.unread = []; st.marks = null; st.shapes = null;
                resetEdit();
                $('pageNo').value = 1; $('pageTotal').textContent = '(그림)';
                st.zoom = Math.min(1, ($('stage').clientWidth - 24) / base.width);
                showZoom();
                redraw(); renderSide();
                setStatus('그림을 열었습니다. 「AI ① 기둥」부터 누르면 AI가 기둥 → 거더 → 빔 순서로 찾습니다(평면만 「범위 지정」하면 더 정확).', 'ok');
            };
            im.onerror = function () { URL.revokeObjectURL(url); setStatus('그림을 열지 못했습니다.', 'warn'); };
            im.src = url;
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
