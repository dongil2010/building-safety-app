/**
 * 사진 자르기 화면 (2026-10-04) — 비파괴 강도 R값 측정지 사진에서 측정지 부분만 남기기
 *
 * 어디에: 장비조사 → 강도 측정 위치 카드의 「촬영」/「갤러리」 버튼 (scanRValuesFromImage 직전)
 * 어떻게: 전체 화면에 사진을 띄우고, 네 모서리·네 변을 끌어 범위를 맞춘다. 범위 안을 끌면 통째로 이동.
 *         90° 회전(옆으로 찍은 사진), 「원본 그대로」(자르지 않음), 「취소」, 「잘라서 적용」.
 *         「∠ 기울기」(2026-10-17): 비뚤게 찍힌 측정지 — 가장자리를 따라 두 점을 끌면 그 선이 수평·수직이 되게 사진을 미세하게 돌린다.
 * 결과:   open(file) → Promise<File|null>
 *           - 잘라서 적용: 자른 JPEG File
 *           - 원본 그대로: 넘겨받은 file 그대로
 *           - 취소: null (호출부는 아무것도 안 한다)
 * 순수 계산(범위 끌기·회전 좌표·출력 크기)은 BsaPhotoCrop._pure 로 노출 — scripts/test-photo-crop.js
 */
(function (root) {
    'use strict';

    var MIN_SIZE = 0.04;          // 범위 최소 크기(사진 대비 비율)
    var MAX_WORK_EDGE = 4000;     // 작업 캔버스 긴 변 상한 — 폰 메모리 보호
    var INITIAL_INSET = 0.04;     // 처음 범위: 가장자리에서 4% 안쪽

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    /**
     * 범위(0~1 비율 좌표 {x,y,w,h})를 handle 종류에 따라 dx,dy(비율)만큼 끈다.
     * handle: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'
     */
    function dragRect(start, handle, dx, dy, minSize) {
        var m = typeof minSize === 'number' ? minSize : MIN_SIZE;
        var x1 = start.x, y1 = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
        if (handle === 'move') {
            var nx = clamp(x1 + dx, 0, 1 - start.w);
            var ny = clamp(y1 + dy, 0, 1 - start.h);
            return { x: nx, y: ny, w: start.w, h: start.h };
        }
        if (handle.indexOf('w') >= 0) x1 = clamp(x1 + dx, 0, x2 - m);
        if (handle.indexOf('e') >= 0) x2 = clamp(x2 + dx, x1 + m, 1);
        if (handle.indexOf('n') >= 0) y1 = clamp(y1 + dy, 0, y2 - m);
        if (handle.indexOf('s') >= 0) y2 = clamp(y2 + dy, y1 + m, 1);
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    /** 사진을 시계 방향 90°×quarter 돌렸을 때 범위 좌표도 같이 돌린다 (돌리기 전 범위 → 돌린 뒤 범위) */
    function rotateRectCW(r) {
        // (x,y) → (1-y, x) : 시계 방향 90°
        return { x: 1 - (r.y + r.h), y: r.x, w: r.h, h: r.w };
    }

    /** 각도(도)를 (-180, 180] 으로 */
    function normDeg(d) {
        var a = ((Number(d) || 0) % 360 + 360) % 360;
        return a > 180 ? a - 360 : a;
    }

    /**
     * 기울기 맞추기(2026-10-17): 화면에서 끈 선 (x0,y0)→(x1,y1) 이 수평(가로에 가까우면) 또는 수직(세로에 가까우면)이
     * 되도록 사진을 더 돌릴 각도(도, 화면 기준 시계 방향 +). 결과는 (-45, 45]. 선이 너무 짧으면 0.
     */
    function straightenDelta(x0, y0, x1, y1) {
        var dx = x1 - x0, dy = y1 - y0;
        if (Math.hypot(dx, dy) < 1e-6) return 0;
        var a = Math.atan2(dy, dx) * 180 / Math.PI;     // 화면은 y가 아래로 → 시계 방향 +
        var r = ((a % 90) + 90) % 90;                   // 가장 가까운 가로·세로 줄과의 차이 [0, 90)
        var d = r > 45 ? 90 - r : -r;
        return d === 0 ? 0 : d;                         // -0 방지
    }

    /** w×h 그림을 deg도 돌렸을 때 다 들어가는 크기 */
    function rotatedSize(w, h, deg) {
        var t = deg * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
        return { w: Math.max(1, Math.round(w * c + h * s)), h: Math.max(1, Math.round(w * s + h * c)) };
    }

    /** 비율 범위 → 실제 픽셀 범위(정수, 사진 안으로 잘림) */
    function rectToPixels(r, imgW, imgH) {
        var sx = Math.round(clamp(r.x, 0, 1) * imgW);
        var sy = Math.round(clamp(r.y, 0, 1) * imgH);
        var ex = Math.round(clamp(r.x + r.w, 0, 1) * imgW);
        var ey = Math.round(clamp(r.y + r.h, 0, 1) * imgH);
        return { sx: sx, sy: sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
    }

    /** 긴 변을 maxEdge 이하로 줄인 크기 */
    function fitWithin(w, h, maxEdge) {
        var long = Math.max(w, h);
        if (!maxEdge || long <= maxEdge) return { w: w, h: h };
        var s = maxEdge / long;
        return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
    }

    // ---------------------------------------------------------------- 화면

    function loadImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () { resolve({ img: img, url: url }); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('사진을 열 수 없습니다')); };
            img.src = url;
        });
    }

    /**
     * 원본(EXIF 방향은 브라우저가 반영) → 작업 캔버스, quarter번 시계 방향 90° 회전 + fine도 미세 회전(2026-10-17).
     * 미세 회전하면 캔버스를 돌린 사진이 다 들어가게 키우고, 빈 귀퉁이는 흰색(R값 글자 읽기에 방해 안 되게).
     */
    function drawWorkCanvas(img, quarter, fine) {
        var base = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, MAX_WORK_EDGE);
        var q = ((quarter % 4) + 4) % 4, f = Number(fine) || 0;
        var qw = (q % 2) ? base.h : base.w, qh = (q % 2) ? base.w : base.h;
        var size = f ? rotatedSize(qw, qh, f) : { w: qw, h: qh };
        var c = document.createElement('canvas');
        c.width = size.w;
        c.height = size.h;
        var ctx = c.getContext('2d');
        if (f) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.translate(c.width / 2, c.height / 2);
        ctx.rotate(q * Math.PI / 2 + f * Math.PI / 180);
        ctx.drawImage(img, -base.w / 2, -base.h / 2, base.w, base.h);
        return c;
    }

    function injectStyle() {
        if (document.getElementById('bsaPhotoCropStyle')) return;
        var st = document.createElement('style');
        st.id = 'bsaPhotoCropStyle';
        st.textContent = [
            '#bsaPhotoCrop{position:fixed;inset:0;z-index:2147483000;background:#111;display:flex;flex-direction:column;color:#fff;font-family:inherit;touch-action:none;user-select:none;-webkit-user-select:none;}',
            '#bsaPhotoCrop .bpc-top{padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 8px;font-size:0.9rem;line-height:1.35;text-align:center;color:#e5e5e5;}',
                        // 손잡이(44px)가 사진 가장자리 밖으로 반쯤 나오므로 여백을 두고, 아래 버튼 줄보다 위에 둔다
            '#bsaPhotoCrop .bpc-stage{position:relative;z-index:1;flex:1;min-height:0;margin:22px 24px;}',
            '#bsaPhotoCrop canvas.bpc-img{position:absolute;display:block;}',
            '#bsaPhotoCrop .bpc-shade{position:absolute;background:rgba(0,0,0,0.55);pointer-events:none;}',
            '#bsaPhotoCrop .bpc-rect{position:absolute;border:2px solid #38bdf8;box-sizing:border-box;cursor:move;touch-action:none;}',
            '#bsaPhotoCrop .bpc-rect::before,#bsaPhotoCrop .bpc-rect::after{content:"";position:absolute;pointer-events:none;border-color:rgba(255,255,255,0.35);border-style:dashed;}',
            '#bsaPhotoCrop .bpc-rect::before{left:33.33%;right:33.33%;top:0;bottom:0;border-width:0 1px;}',
            '#bsaPhotoCrop .bpc-rect::after{top:33.33%;bottom:33.33%;left:0;right:0;border-width:1px 0;}',
            '#bsaPhotoCrop .bpc-h{position:absolute;width:44px;height:44px;margin:-22px 0 0 -22px;touch-action:none;z-index:2;}',
            '#bsaPhotoCrop .bpc-h::after{content:"";position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#fff;border:3px solid #38bdf8;box-sizing:border-box;}',
            '#bsaPhotoCrop .bpc-h.edge::after{width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:3px;}',
            '#bsaPhotoCrop .bpc-bar{display:flex;gap:8px;padding:10px 12px calc(env(safe-area-inset-bottom,0px) + 12px);flex-wrap:wrap;justify-content:center;}',
            '#bsaPhotoCrop .bpc-bar button{flex:1 1 0;min-width:72px;min-height:46px;border-radius:10px;border:1px solid #444;background:#262626;color:#fff;font-size:0.9rem;font-weight:600;cursor:pointer;}',
            '#bsaPhotoCrop .bpc-bar button.bpc-ok{background:#0284c7;border-color:#0284c7;flex:1.6 1 0;}',
            '#bsaPhotoCrop .bpc-bar button.on{background:#f59e0b;border-color:#f59e0b;color:#111;}',
            '#bsaPhotoCrop .bpc-bar button[hidden]{display:none;}',
            // 기울기 맞추기: 끄는 동안 보이는 선(가운데 축 기준 회전)
            '#bsaPhotoCrop.bpc-leveling .bpc-stage{cursor:crosshair;}',
            '#bsaPhotoCrop .bpc-line{position:absolute;height:0;border-top:3px solid #f59e0b;transform-origin:0 50%;pointer-events:none;z-index:3;box-shadow:0 0 0 1px rgba(0,0,0,0.5);}',
            '#bsaPhotoCrop .bpc-line::before,#bsaPhotoCrop .bpc-line::after{content:"";position:absolute;top:-8px;width:13px;height:13px;border-radius:50%;background:#f59e0b;}',
            '#bsaPhotoCrop .bpc-line::before{left:-7px;}',
            '#bsaPhotoCrop .bpc-line::after{right:-7px;}'
        ].join('\n');
        document.head.appendChild(st);
    }

    var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

    function open(file, opts) {
        opts = opts || {};
        if (!file) return Promise.resolve(null);
        if (typeof document === 'undefined') return Promise.resolve(file);
        return loadImage(file).then(function (loaded) {
            return new Promise(function (resolve) {
                injectStyle();
                var old = document.getElementById('bsaPhotoCrop');
                if (old) old.remove();

                var quarter = 0;
                var fine = 0;          // 미세 회전(도) — 「∠ 기울기」로 두 점을 끌어 맞춘다
                var leveling = false;  // 기울기 맞추기 중(끌면 선을 긋는다)
                var titleText = opts.title || '측정지 부분만 남도록 모서리를 끌어 맞추세요';
                var work = drawWorkCanvas(loaded.img, quarter, fine);
                var rect = { x: INITIAL_INSET, y: INITIAL_INSET, w: 1 - 2 * INITIAL_INSET, h: 1 - 2 * INITIAL_INSET };
                var view = { left: 0, top: 0, w: 1, h: 1 }; // 화면 위 사진 위치(px, stage 기준)

                var wrap = document.createElement('div');
                wrap.id = 'bsaPhotoCrop';
                wrap.setAttribute('role', 'dialog');
                wrap.setAttribute('aria-label', '사진 자르기');
                wrap.innerHTML =
                    '<div class="bpc-top">' + titleText + '</div>' +
                    '<div class="bpc-stage">' +
                    '<canvas class="bpc-img"></canvas>' +
                    '<div class="bpc-shade" data-s="t"></div><div class="bpc-shade" data-s="b"></div>' +
                    '<div class="bpc-shade" data-s="l"></div><div class="bpc-shade" data-s="r"></div>' +
                    '<div class="bpc-rect"></div>' +
                    HANDLES.map(function (h) {
                        return '<div class="bpc-h' + (h.length === 1 ? ' edge' : '') + '" data-h="' + h + '"></div>';
                    }).join('') +
                    '<div class="bpc-line" hidden></div>' +
                    '</div>' +
                    '<div class="bpc-bar">' +
                    '<button type="button" data-act="cancel">취소</button>' +
                    '<button type="button" data-act="rotate">↻ 회전</button>' +
                    '<button type="button" data-act="level" title="반듯해야 할 선(측정지 가장자리)을 따라 끌면 사진을 그만큼 돌립니다">∠ 기울기</button>' +
                    '<button type="button" data-act="unlevel" hidden>기울기 취소</button>' +
                    '<button type="button" data-act="original">원본 그대로</button>' +
                    '<button type="button" class="bpc-ok" data-act="ok">✂ 잘라서 적용</button>' +
                    '</div>';
                document.body.appendChild(wrap);

                var stage = wrap.querySelector('.bpc-stage');
                var cv = wrap.querySelector('canvas.bpc-img');
                var rectEl = wrap.querySelector('.bpc-rect');
                var shades = {};
                wrap.querySelectorAll('.bpc-shade').forEach(function (el) { shades[el.getAttribute('data-s')] = el; });
                var handleEls = {};
                wrap.querySelectorAll('.bpc-h').forEach(function (el) { handleEls[el.getAttribute('data-h')] = el; });
                var topEl = wrap.querySelector('.bpc-top');
                var lineEl = wrap.querySelector('.bpc-line');
                var levelBtn = wrap.querySelector('button[data-act="level"]');
                var unlevelBtn = wrap.querySelector('button[data-act="unlevel"]');

                /** 기울기 단추·안내 글 갱신 */
                function syncLevel() {
                    wrap.classList.toggle('bpc-leveling', leveling);
                    levelBtn.classList.toggle('on', leveling);
                    var deg = Math.round(fine * 10) / 10;
                    levelBtn.textContent = leveling ? '∠ 선 긋는 중' : (deg ? '∠ 기울기 ' + (deg > 0 ? '+' : '') + deg + '°' : '∠ 기울기');
                    unlevelBtn.hidden = !fine;
                    topEl.textContent = leveling
                        ? '반듯해야 할 선(측정지 가장자리·표 줄)을 따라 한쪽 끝에서 다른 쪽 끝까지 끌어 주세요. 놓으면 그 선이 수평(세로 선이면 수직)이 되게 돌립니다.'
                        : titleText;
                }
                /** 미세 회전을 바꾸고 작업 그림을 다시 만든다(자르기 범위는 비율 그대로) */
                function setFine(next) {
                    fine = normDeg(next);
                    if (Math.abs(fine) < 0.05) fine = 0;
                    work = drawWorkCanvas(loaded.img, quarter, fine);
                    layout();
                    syncLevel();
                }

                function layout() {
                    var sw = stage.clientWidth || 1, sh = stage.clientHeight || 1;
                    var s = Math.min(sw / work.width, sh / work.height);
                    view.w = Math.max(1, Math.floor(work.width * s));
                    view.h = Math.max(1, Math.floor(work.height * s));
                    view.left = Math.floor((sw - view.w) / 2);
                    view.top = Math.floor((sh - view.h) / 2);
                    var dpr = Math.min(root.devicePixelRatio || 1, 2);
                    cv.width = Math.round(view.w * dpr);
                    cv.height = Math.round(view.h * dpr);
                    cv.style.width = view.w + 'px';
                    cv.style.height = view.h + 'px';
                    cv.style.left = view.left + 'px';
                    cv.style.top = view.top + 'px';
                    cv.getContext('2d').drawImage(work, 0, 0, cv.width, cv.height);
                    paint();
                }

                function paint() {
                    var L = view.left + rect.x * view.w;
                    var T = view.top + rect.y * view.h;
                    var W = rect.w * view.w;
                    var H = rect.h * view.h;
                    rectEl.style.left = L + 'px'; rectEl.style.top = T + 'px';
                    rectEl.style.width = W + 'px'; rectEl.style.height = H + 'px';
                    var VL = view.left, VT = view.top, VR = view.left + view.w, VB = view.top + view.h;
                    function box(el, l, t, r, b) {
                        el.style.left = l + 'px'; el.style.top = t + 'px';
                        el.style.width = Math.max(0, r - l) + 'px'; el.style.height = Math.max(0, b - t) + 'px';
                    }
                    box(shades.t, VL, VT, VR, T);
                    box(shades.b, VL, T + H, VR, VB);
                    box(shades.l, VL, T, L, T + H);
                    box(shades.r, L + W, T, VR, T + H);
                    var cx = L + W / 2, cy = T + H / 2;
                    var pos = { nw: [L, T], n: [cx, T], ne: [L + W, T], e: [L + W, cy], se: [L + W, T + H], s: [cx, T + H], sw: [L, T + H], w: [L, cy] };
                    Object.keys(pos).forEach(function (k) {
                        handleEls[k].style.left = pos[k][0] + 'px';
                        handleEls[k].style.top = pos[k][1] + 'px';
                    });
                }

                var drag = null;
                var level = null;   // 기울기 선: { id, x0, y0, x1, y1 } (stage 기준 px)
                function stagePoint(e) {
                    var r = stage.getBoundingClientRect();
                    return { x: e.clientX - r.left, y: e.clientY - r.top };
                }
                function drawLine() {
                    var dx = level.x1 - level.x0, dy = level.y1 - level.y0;
                    lineEl.hidden = false;
                    lineEl.style.left = level.x0 + 'px';
                    lineEl.style.top = level.y0 + 'px';
                    lineEl.style.width = Math.hypot(dx, dy) + 'px';
                    lineEl.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
                }
                function onDown(e) {
                    if (leveling) {
                        e.preventDefault();
                        e.stopPropagation();
                        var p = stagePoint(e);
                        level = { id: e.pointerId, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
                        try { stage.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                        drawLine();
                        return;
                    }
                    var t = e.target;
                    var h = t.getAttribute && t.getAttribute('data-h');
                    var handle = h || (t === rectEl ? 'move' : null);
                    if (!handle) return;
                    e.preventDefault();
                    e.stopPropagation();
                    drag = { id: e.pointerId, handle: handle, x0: e.clientX, y0: e.clientY, start: { x: rect.x, y: rect.y, w: rect.w, h: rect.h } };
                    try { t.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
                }
                function onMove(e) {
                    if (level && e.pointerId === level.id) {
                        e.preventDefault();
                        var p = stagePoint(e);
                        level.x1 = p.x; level.y1 = p.y;
                        drawLine();
                        return;
                    }
                    if (!drag || e.pointerId !== drag.id) return;
                    e.preventDefault();
                    rect = dragRect(drag.start, drag.handle, (e.clientX - drag.x0) / view.w, (e.clientY - drag.y0) / view.h);
                    paint();
                }
                function onUp(e) {
                    if (level && e.pointerId === level.id) {
                        var L = level;
                        level = null;
                        lineEl.hidden = true;
                        if (e.type === 'pointercancel') return;
                        // 너무 짧은 선은 손떨림 — 각도가 부정확하니 무시하고 다시 긋게
                        if (Math.hypot(L.x1 - L.x0, L.y1 - L.y0) < 30) {
                            topEl.textContent = '선이 너무 짧습니다. 가장자리를 따라 길게 끌어 주세요.';
                            return;
                        }
                        leveling = false;
                        setFine(fine + straightenDelta(L.x0, L.y0, L.x1, L.y1));
                        return;
                    }
                    if (drag && e.pointerId === drag.id) drag = null;
                }
                stage.addEventListener('pointerdown', onDown);
                stage.addEventListener('pointermove', onMove);
                stage.addEventListener('pointerup', onUp);
                stage.addEventListener('pointercancel', onUp);

                function onResize() { layout(); }
                root.addEventListener('resize', onResize);

                var finished = false;
                function finish(result) {
                    if (finished) return;
                    finished = true;
                    root.removeEventListener('resize', onResize);
                    try { wrap.remove(); } catch (_e) { /* ignore */ }
                    try { URL.revokeObjectURL(loaded.url); } catch (_e) { /* ignore */ }
                    resolve(result);
                }

                function exportCrop() {
                    var px = rectToPixels(rect, work.width, work.height);
                    var out = document.createElement('canvas');
                    out.width = px.sw; out.height = px.sh;
                    var ctx = out.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, out.width, out.height);
                    ctx.drawImage(work, px.sx, px.sy, px.sw, px.sh, 0, 0, px.sw, px.sh);
                    out.toBlob(function (blob) {
                        if (!blob) { finish(file); return; }
                        var base = String(file.name || 'photo').replace(/\.[^.]+$/, '');
                        finish(new File([blob], base + '_crop.jpg', { type: 'image/jpeg' }));
                    }, 'image/jpeg', 0.92);
                }

                wrap.querySelector('.bpc-bar').addEventListener('click', function (e) {
                    var b = e.target.closest && e.target.closest('button[data-act]');
                    if (!b) return;
                    var act = b.getAttribute('data-act');
                    if (act === 'cancel') finish(null);
                    else if (act === 'original') finish(file);
                    else if (act === 'ok') exportCrop();
                    else if (act === 'rotate') {
                        quarter = (quarter + 1) % 4;
                        work = drawWorkCanvas(loaded.img, quarter, fine);
                        rect = rotateRectCW(rect);
                        layout();
                    } else if (act === 'level') {
                        leveling = !leveling;
                        syncLevel();
                    } else if (act === 'unlevel') {
                        leveling = false;
                        setFine(0);
                    }
                });

                // 안드로이드 뒤로가기·ESC = 취소
                wrap.tabIndex = -1;
                wrap.addEventListener('keydown', function (e) {
                    if (e.key !== 'Escape') return;
                    if (leveling) { leveling = false; level = null; lineEl.hidden = true; syncLevel(); return; }   // 선 긋기만 그만
                    finish(null);
                });
                layout(); // clientWidth를 읽으면 브라우저가 바로 배치를 계산한다 — 화면이 가려져도(rAF 멈춤) 그려지게
                try { wrap.focus(); } catch (_e) { /* ignore */ }
            });
        }).catch(function (err) {
            // 브라우저가 못 여는 형식(HEIC 등)이면 자르기 없이 원본으로 넘긴다 — 기존 흐름 유지
            console.warn('사진 자르기 화면을 열 수 없어 원본을 씁니다:', err);
            return file;
        });
    }

    var api = {
        open: open,
        _pure: { dragRect: dragRect, rotateRectCW: rotateRectCW, rectToPixels: rectToPixels, fitWithin: fitWithin,
            straightenDelta: straightenDelta, rotatedSize: rotatedSize, normDeg: normDeg }
    };
    root.BsaPhotoCrop = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
