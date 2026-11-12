/**
 * 캐드 DXF 화면 벡터 엔진(2026-11-12)
 * - DXF로 올린 층은 화면에 그림(4000/8000/16000 JPEG)을 늘려 보여 주지 않고, 선·글자를 지금 확대 배율에 맞춰 캔버스에 직접 그린다.
 *   확대해도 선은 늘 가늘고 또렷하고, 글자는 진짜 글꼴로 그려 한글도 선명하다.
 * - 자료는 따로 저장하지 않는다. 올릴 때 만든 벡터 PDF 안에 표시해 둔 스트림을 읽는다(dxf-to-pdf.js).
 *     /BSADxf /Paths  선·채움(내용 흐름 그대로: m l h S f* w)
 *     /BSADxf /Texts  글자 목록(JSON)
 *   그래서 서버 동기화·백업·다른 기기는 지금 PDF 길 그대로다. 표시가 없는 PDF(일반 캐드 PDF, 예전에 올린 DXF)는 그림으로 본다.
 * - 좌표: PDF 점(왼쪽 아래 원점, y 위쪽). 화면 그림 좌표로는 x*imgW/pageW, imgH - y*imgH/pageH.
 * 설계: docs/cad-dxf-작업계획.md
 */
(function (root) {
    'use strict';

    var VIEW_KEY = 'BSADxf';
    var CAP_RATIO = 0.72; // dxf-to-pdf.js와 같다: 글꼴 크기 = 대문자 높이 / 0.72
    var FONT_FAMILY = 'Arial, "Malgun Gothic", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    var FILL_COLOR = '#808080';
    var MIN_TEXT_PX = 2.5; // 이보다 작은 글자는 안 그린다(어차피 못 읽음)
    var STROKE_CHUNK = 40000; // 한 번에 긋는 선분 수(너무 긴 경로는 느리다)

    // ───────────────────────── PDF 바이트에서 표시된 스트림 꺼내기 ─────────────────────────

    function asciiBytes(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i)); return a; }

    function bytesIndexOf(bytes, pat, from) {
        var n = bytes.length, m = pat.length;
        outer: for (var i = from || 0; i <= n - m; i++) {
            if (bytes[i] !== pat[0]) continue;
            for (var j = 1; j < m; j++) if (bytes[i + j] !== pat[j]) continue outer;
            return i;
        }
        return -1;
    }

    function bytesLastIndexOf(bytes, pat, from) {
        var m = pat.length;
        outer: for (var i = Math.min(from, bytes.length - m); i >= 0; i--) {
            if (bytes[i] !== pat[0]) continue;
            for (var j = 1; j < m; j++) if (bytes[i + j] !== pat[j]) continue outer;
            return i;
        }
        return -1;
    }

    /**
     * 스트림 사전에 `/BSADxf /<tag>`가 있는 스트림 찾기 → { data(Uint8Array), flate } | null
     * (pdf-lib가 객체 흐름 없이 쓴 PDF 기준 — 사전에 /Length 숫자가 바로 적혀 있다)
     */
    function findTaggedStream(bytes, tag) {
        if (!bytes || !bytes.length) return null;
        var pat = asciiBytes('/' + VIEW_KEY + ' /' + tag);
        var from = 0;
        for (var tries = 0; tries < 8; tries++) {
            var at = bytesIndexOf(bytes, pat, from);
            if (at < 0) return null;
            from = at + pat.length;
            var dictStart = bytesLastIndexOf(bytes, [0x3c, 0x3c], at);
            if (dictStart < 0 || at - dictStart > 4096) continue;
            var kw = bytesIndexOf(bytes, asciiBytes('stream'), at);
            if (kw < 0 || kw - at > 4096) continue;
            var dict = '';
            for (var i = dictStart; i < kw; i++) dict += String.fromCharCode(bytes[i]);
            var m = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
            if (!m) continue;
            var len = parseInt(m[1], 10);
            var st = kw + 6;
            if (bytes[st] === 0x0d) st++;
            if (bytes[st] === 0x0a) st++;
            if (!(len > 0) || st + len > bytes.length) continue;
            return { data: bytes.subarray(st, st + len), flate: /FlateDecode/.test(dict) };
        }
        return null;
    }

    /** zlib(Flate) 풀기 — 브라우저는 DecompressionStream, 시험(node)은 zlib */
    async function inflate(data) {
        if (typeof DecompressionStream !== 'undefined' && typeof Response !== 'undefined' && typeof Blob !== 'undefined') {
            var ds = new DecompressionStream('deflate');
            var buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
            return new Uint8Array(buf);
        }
        if (typeof require === 'function') {
            return new Uint8Array(require('zlib').inflateSync(Buffer.from(data)));
        }
        throw new Error('이 브라우저는 압축 풀기(DecompressionStream)를 지원하지 않습니다.');
    }

    async function readTaggedStream(bytes, tag) {
        var found = findTaggedStream(bytes, tag);
        if (!found) return null;
        return found.flate ? await inflate(found.data) : found.data;
    }

    // ───────────────────────── 선 자료 읽기 ─────────────────────────

    /**
     * 내용 흐름(m l h S f* w …) → 선 자료.
     * coords: [x0,y0,x1,y1,…] (PDF 점), 폴리선 i는 start[i]번째 점부터 count[i]개.
     * flags: 1=닫힘, 2=채움. group: 채움 묶음 번호(같은 번호끼리 짝홀 규칙). width: 선 굵기(점).
     */
    function parsePaths(u8) {
        var cap = 1 << 16, coords = new Float32Array(cap), nc = 0;
        var pcap = 1 << 12, n = 0;
        var start = new Uint32Array(pcap), count = new Uint32Array(pcap), flags = new Uint8Array(pcap);
        var width = new Float32Array(pcap), group = new Uint32Array(pcap);
        function growPolys() {
            pcap *= 2;
            var s2 = new Uint32Array(pcap); s2.set(start); start = s2;
            var c2 = new Uint32Array(pcap); c2.set(count); count = c2;
            var f2 = new Uint8Array(pcap); f2.set(flags); flags = f2;
            var w2 = new Float32Array(pcap); w2.set(width); width = w2;
            var g2 = new Uint32Array(pcap); g2.set(group); group = g2;
        }
        var nums = [0, 0, 0, 0, 0, 0], nn = 0;
        var curW = 0, baseW = -1, groupId = 0;
        var pendFrom = 0; // 아직 S/f*로 끝나지 않은 폴리선의 첫 번호
        var open = false; // 지금 이어 그리는 폴리선이 있는가
        var len = u8.length, i = 0;
        while (i < len) {
            var c = u8[i];
            if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) { i++; continue; }
            if ((c >= 0x30 && c <= 0x39) || c === 0x2d || c === 0x2e || c === 0x2b) {
                var neg = false;
                if (c === 0x2d) { neg = true; i++; } else if (c === 0x2b) { i++; }
                var v = 0;
                while (i < len && (c = u8[i]) >= 0x30 && c <= 0x39) { v = v * 10 + (c - 0x30); i++; }
                if (i < len && u8[i] === 0x2e) {
                    i++;
                    var f = 0.1;
                    while (i < len && (c = u8[i]) >= 0x30 && c <= 0x39) { v += (c - 0x30) * f; f *= 0.1; i++; }
                }
                if (nn < 6) nums[nn++] = neg ? -v : v;
                continue;
            }
            // 연산자
            var o0 = c, o1 = 0;
            i++;
            if (i < len) { var c1 = u8[i]; if (c1 > 0x20) { o1 = c1; i++; while (i < len && u8[i] > 0x20) i++; } }
            if (o0 === 0x6d && !o1) { // m
                if (n >= pcap) growPolys();
                start[n] = nc >> 1; count[n] = 0; flags[n] = 0; width[n] = curW; group[n] = 0;
                n++; open = true;
                if (nc + 2 > cap) { cap *= 2; var a2 = new Float32Array(cap); a2.set(coords); coords = a2; }
                coords[nc++] = nums[0]; coords[nc++] = nums[1]; count[n - 1] = 1;
            } else if (o0 === 0x6c && !o1) { // l
                if (open) {
                    if (nc + 2 > cap) { cap *= 2; var a3 = new Float32Array(cap); a3.set(coords); coords = a3; }
                    coords[nc++] = nums[0]; coords[nc++] = nums[1]; count[n - 1]++;
                }
            } else if (o0 === 0x68 && !o1) { // h
                if (open) flags[n - 1] |= 1;
            } else if (o0 === 0x53 && !o1) { // S
                for (var k = pendFrom; k < n; k++) width[k] = curW;
                pendFrom = n; open = false;
            } else if (o0 === 0x66) { // f, f*
                groupId++;
                for (var k2 = pendFrom; k2 < n; k2++) { flags[k2] |= 2; group[k2] = groupId; }
                pendFrom = n; open = false;
            } else if (o0 === 0x77 && !o1) { // w
                curW = nums[0];
                if (baseW < 0) baseW = curW;
            } else if (o0 === 0x6e && !o1) { // n (경로 버림)
                n = pendFrom; open = false;
            }
            nn = 0;
        }
        n = pendFrom; // 끝맺지 않은 경로는 버린다
        var bbox = new Float32Array(n * 4);
        for (var p = 0; p < n; p++) {
            var s = start[p] * 2, e = s + count[p] * 2;
            var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (var q = s; q < e; q += 2) {
                var x = coords[q], y = coords[q + 1];
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
            bbox[p * 4] = x0; bbox[p * 4 + 1] = y0; bbox[p * 4 + 2] = x1; bbox[p * 4 + 3] = y1;
        }
        return {
            n: n, coords: coords.subarray(0, nc), start: start.subarray(0, n), count: count.subarray(0, n),
            flags: flags.subarray(0, n), width: width.subarray(0, n), group: group.subarray(0, n), bbox: bbox,
            lw: baseW > 0 ? baseW : 0.15
        };
    }

    function parseTexts(u8) {
        try {
            var str = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8').decode(u8) : Buffer.from(u8).toString('utf8');
            var obj = JSON.parse(str);
            if (!obj || obj.v !== 1 || !Array.isArray(obj.texts)) return null;
            return obj;
        } catch (e) { return null; }
    }

    /**
     * PDF 바이트 → 화면용 모델 | null(표시 없는 PDF). meta = BSA.dxfToPdf.readMetaFromPdfBytes 결과(pageW·pageH 필요).
     */
    async function buildModelFromPdfBytes(bytes, meta) {
        if (!bytes || !meta || !(meta.pageW > 0) || !(meta.pageH > 0)) return null;
        var raw = await readTaggedStream(bytes, 'Paths');
        if (!raw) return null;
        var model = parsePaths(raw);
        model.pageW = meta.pageW;
        model.pageH = meta.pageH;
        model.texts = [];
        try {
            var traw = await readTaggedStream(bytes, 'Texts');
            var tobj = traw ? parseTexts(traw) : null;
            if (tobj) {
                model.texts = tobj.texts;
                if (tobj.lw > 0) model.lw = tobj.lw;
            }
        } catch (e) { /* 글자 없이 선만 */ }
        return model;
    }

    // ───────────────────────── 그리기 ─────────────────────────

    /**
     * 모델을 캔버스에 그린다. M = [a,b,c,d,e,f]: PDF 점 → 캔버스 픽셀 (X = a*x + c*y + e, Y = b*x + d*y + f).
     * ctx의 변환은 건드리고 되돌린다. 반환 { ms, segs, texts }
     */
    function render(ctx, model, M, W, H, opts) {
        opts = opts || {};
        var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        var a = M[0], b = M[1], c = M[2], d = M[3], e = M[4], f = M[5];
        var det = a * d - b * c;
        var k = Math.sqrt(Math.abs(det)) || 1; // 점 → 픽셀 배율
        var minPx = opts.minLinePx > 0 ? opts.minLinePx : 1;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // 쪽(종이) 흰 바탕
        var pw = model.pageW, ph = model.pageH;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(e, f);
        ctx.lineTo(a * pw + e, b * pw + f);
        ctx.lineTo(a * pw + c * ph + e, b * pw + d * ph + f);
        ctx.lineTo(c * ph + e, d * ph + f);
        ctx.closePath();
        ctx.fill();

        // 화면에 보이는 범위(PDF 점)
        var ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
        var ie = -(ia * e + ic * f), iff = -(ib * e + id * f);
        var vx0 = Infinity, vy0 = Infinity, vx1 = -Infinity, vy1 = -Infinity;
        var corners = [0, 0, W, 0, 0, H, W, H];
        for (var ci = 0; ci < 8; ci += 2) {
            var ux = ia * corners[ci] + ic * corners[ci + 1] + ie;
            var uy = ib * corners[ci] + id * corners[ci + 1] + iff;
            if (ux < vx0) vx0 = ux; if (ux > vx1) vx1 = ux;
            if (uy < vy0) vy0 = uy; if (uy > vy1) vy1 = uy;
        }
        var padPt = 4 / k;
        vx0 -= padPt; vy0 -= padPt; vx1 += padPt; vy1 += padPt;

        var n = model.n, coords = model.coords, start = model.start, count = model.count;
        var flags = model.flags, bbox = model.bbox, widths = model.width, groups = model.group;
        var segs = 0;
        var tinyPt = 0.6 / k; // 화면에서 0.6픽셀보다 작은 것
        var p, s, cnt, q, x, y, X, Y, LX, LY, last;

        // 1) 채움(회색) — 같은 묶음끼리 짝홀 규칙
        ctx.fillStyle = FILL_COLOR;
        var curGroup = -1, groupOpen = false;
        for (p = 0; p < n; p++) {
            if (!(flags[p] & 2)) continue;
            if (groups[p] !== curGroup) {
                if (groupOpen) { ctx.fill('evenodd'); groupOpen = false; }
                curGroup = groups[p];
            }
            if (bbox[p * 4 + 2] < vx0 || bbox[p * 4] > vx1 || bbox[p * 4 + 3] < vy0 || bbox[p * 4 + 1] > vy1) continue;
            if (bbox[p * 4 + 2] - bbox[p * 4] < tinyPt && bbox[p * 4 + 3] - bbox[p * 4 + 1] < tinyPt) continue;
            if (!groupOpen) { ctx.beginPath(); groupOpen = true; }
            s = start[p] * 2; cnt = count[p];
            for (q = 0; q < cnt; q++) {
                x = coords[s + q * 2]; y = coords[s + q * 2 + 1];
                X = a * x + c * y + e; Y = b * x + d * y + f;
                if (q === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
            }
            ctx.closePath();
            segs += cnt;
        }
        if (groupOpen) ctx.fill('evenodd');

        // 2) 선 — 기본 굵기는 한 묶음으로, 굵은 폴리선은 굵기별로
        var baseLw = model.lw;
        // 기본 선은 캐드 화면처럼 확대해도 늘 1픽셀(2026-11-12 사용자: 선이 두껍다). 폭을 준 폴리선만 실제 폭대로 굵어진다.
        var basePx = minPx;
        var wide = null; // 굵기(픽셀, 0.5 단위) → 폴리선 번호 목록
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = basePx;
        ctx.lineCap = basePx >= 2.5 ? 'round' : 'butt';
        ctx.lineJoin = basePx >= 2.5 ? 'round' : 'bevel';
        function tracePoly(pi) {
            var s0 = start[pi] * 2, c0 = count[pi];
            x = coords[s0]; y = coords[s0 + 1];
            X = a * x + c * y + e; Y = b * x + d * y + f;
            ctx.moveTo(X, Y);
            LX = X; LY = Y; last = c0 - 1;
            var made = 0;
            for (var qi = 1; qi < c0; qi++) {
                x = coords[s0 + qi * 2]; y = coords[s0 + qi * 2 + 1];
                X = a * x + c * y + e; Y = b * x + d * y + f;
                // 화면에서 반 픽셀도 안 움직이는 꼭짓점은 건너뛴다(호·곡선을 잘게 나눈 점들)
                if (qi !== last && Math.abs(X - LX) + Math.abs(Y - LY) < 0.5) continue;
                ctx.lineTo(X, Y); LX = X; LY = Y; made++;
            }
            if (flags[pi] & 1) { ctx.closePath(); made++; }
            return made;
        }
        var inPath = 0;
        var dots = new Float32Array(4096), nd = 0;
        ctx.beginPath();
        for (p = 0; p < n; p++) {
            if (flags[p] & 2) continue;
            if (count[p] < 2) continue;
            if (bbox[p * 4 + 2] < vx0 || bbox[p * 4] > vx1 || bbox[p * 4 + 3] < vy0 || bbox[p * 4 + 1] > vy1) continue;
            // 화면에서 점처럼 작은 것은 선으로 긋지 않고 모아서 1픽셀 점으로 찍는다(전체 보기에서 훨씬 빠르다)
            if (bbox[p * 4 + 2] - bbox[p * 4] < tinyPt && bbox[p * 4 + 3] - bbox[p * 4 + 1] < tinyPt) {
                if (nd + 2 > dots.length) { var d2 = new Float32Array(dots.length * 2); d2.set(dots); dots = d2; }
                x = coords[start[p] * 2]; y = coords[start[p] * 2 + 1];
                dots[nd++] = a * x + c * y + e; dots[nd++] = b * x + d * y + f;
                continue;
            }
            var wPt = widths[p];
            if (wPt > baseLw + 1e-3 && wPt * k > basePx + 0.25) {
                var key = Math.round(wPt * k * 2) / 2;
                if (!wide) wide = new Map();
                var arr = wide.get(key);
                if (!arr) { arr = []; wide.set(key, arr); }
                arr.push(p);
                continue;
            }
            inPath += tracePoly(p);
            if (inPath >= STROKE_CHUNK) { ctx.stroke(); ctx.beginPath(); segs += inPath; inPath = 0; }
        }
        if (inPath) { ctx.stroke(); segs += inPath; }
        if (nd) {
            ctx.fillStyle = '#000000';
            var dotPx = Math.max(1, Math.min(basePx, 2));
            // 같은 픽셀에 겹치는 점은 한 번만
            var seen = (W * H <= 40000000) ? new Uint8Array(W * H) : null;
            ctx.beginPath();
            var made2 = 0;
            for (var di = 0; di < nd; di += 2) {
                var px = Math.floor(dots[di]), py = Math.floor(dots[di + 1]);
                if (px < 0 || py < 0 || px >= W || py >= H) continue;
                if (seen) { var si = py * W + px; if (seen[si]) continue; seen[si] = 1; }
                ctx.rect(px, py, dotPx, dotPx);
                if (++made2 >= STROKE_CHUNK) { ctx.fill(); ctx.beginPath(); made2 = 0; }
            }
            if (made2) ctx.fill();
            segs += nd >> 1;
        }
        if (wide) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            wide.forEach(function (list, wpx) {
                ctx.lineWidth = wpx;
                ctx.beginPath();
                var m2 = 0;
                for (var wi = 0; wi < list.length; wi++) {
                    m2 += tracePoly(list[wi]);
                    if (m2 >= STROKE_CHUNK) { ctx.stroke(); ctx.beginPath(); segs += m2; m2 = 0; }
                }
                if (m2) { ctx.stroke(); segs += m2; }
            });
        }

        // 3) 글자 — 진짜 글꼴로
        var texts = model.texts || [];
        var drawn = 0;
        if (texts.length) {
            ctx.fillStyle = '#000000';
            ctx.textBaseline = 'alphabetic';
            var lastFont = '';
            for (var ti = 0; ti < texts.length; ti++) {
                var t = texts[ti];
                var hPx = t[2] * k;
                var size = hPx / CAP_RATIO;
                if (size < MIN_TEXT_PX) continue;
                var tx = t[0], ty = t[1];
                var reach = t[2] * (String(t[6]).length + 2);
                if (tx + reach < vx0 || tx - reach > vx1 || ty + reach < vy0 || ty - reach > vy1) continue;
                var r = (t[3] || 0) * Math.PI / 180;
                var cr = Math.cos(r), sr = Math.sin(r);
                var dx = a * cr + c * sr, dy = b * cr + d * sr;
                var dl = Math.sqrt(dx * dx + dy * dy) || 1;
                dx /= dl; dy /= dl;
                ctx.setTransform(dx, dy, -dy, dx, a * tx + c * ty + e, b * tx + d * ty + f);
                var fs = Math.round(size * 4) / 4;
                var font = fs + 'px ' + FONT_FAMILY;
                if (font !== lastFont) { ctx.font = font; lastFont = font; }
                ctx.textAlign = t[4] === 1 ? 'center' : (t[4] === 2 ? 'right' : 'left');
                var off = 0;
                if (t[5] === 1) off = -size * 0.21;
                else if (t[5] === 2) off = hPx / 2;
                else if (t[5] === 3) off = hPx;
                ctx.fillText(t[6], 0, off);
                drawn++;
            }
        }
        ctx.restore();
        var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        return { ms: t1 - t0, segs: segs, texts: drawn };
    }

    // ───────────────────────── 화면 연결: 모델 보관 + 그린 결과 재사용 ─────────────────────────

    var MAX_MODELS = 3;
    var models = new Map(); // key → { sig, model|null }
    var inflight = new Map();

    function sigOf(pdfDataUrl) {
        var s = String(pdfDataUrl || '');
        return s.length + ':' + s.slice(-48);
    }

    /** 이 층 모델(이미 읽어 둔 것만) | null */
    function getModel(key, pdfDataUrl) {
        var ent = models.get(key);
        if (!ent || !ent.model) return null;
        if (pdfDataUrl && ent.sig !== sigOf(pdfDataUrl)) return null;
        return ent.model;
    }

    /** PDF dataURL에서 모델을 읽어 보관한다. DXF로 만든 PDF가 아니면 null. 절대 던지지 않는다 */
    function ensureModel(key, pdfDataUrl) {
        if (!key || typeof pdfDataUrl !== 'string') return Promise.resolve(null);
        var sig = sigOf(pdfDataUrl);
        var ent = models.get(key);
        if (ent && ent.sig === sig) return Promise.resolve(ent.model);
        var jobKey = key + '|' + sig;
        if (inflight.has(jobKey)) return inflight.get(jobKey);
        var job = (async function () {
            var model = null;
            try {
                var P = root && root.BSA && root.BSA.dxfToPdf;
                if (P && typeof P.dataUrlToBytes === 'function') {
                    var bytes = P.dataUrlToBytes(pdfDataUrl);
                    // 일반 캐드 PDF는 여기서 바로 끝난다(표시 글자만 한 번 훑음). pdf-lib로 통째 여는 길
                    // (readMetaFromPdfBytes)은 쓰지 않는다 — 큰 PDF 층을 열 때마다 화면이 멈칫하면 안 된다.
                    if (bytes && findTaggedStream(bytes, 'Paths')) {
                        var meta = P.parseMetaFromKeywords(P.scanKeywordsFromBytes(bytes));
                        if (meta) model = await buildModelFromPdfBytes(bytes, meta);
                    }
                }
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) console.warn('[DXF 화면] 벡터 자료 읽기 실패 — 그림으로 표시', e);
                model = null;
            }
            models.delete(key);
            models.set(key, { sig: sig, model: model });
            while (models.size > MAX_MODELS) models.delete(models.keys().next().value);
            return model;
        })();
        inflight.set(jobKey, job);
        job.then(function () { inflight.delete(jobKey); }, function () { inflight.delete(jobKey); });
        return job;
    }

    function dropModel(key) { if (key) models.delete(key); else models.clear(); }

    var cache = { canvas: null, model: null, M: null, W: 0, H: 0, ms: 0 };
    var settleTimer = null;
    var forceNext = false;
    var FAST_MS = 28; // 이보다 빨리 그려지면 움직이는 동안에도 매번 새로 그린다

    function sameMatrix(A, B) {
        if (!A || !B) return false;
        for (var i = 0; i < 6; i++) {
            var tol = i < 4 ? 1e-6 * (Math.abs(A[i]) + 1e-3) + 1e-9 : 0.01;
            if (Math.abs(A[i] - B[i]) > tol) return false;
        }
        return true;
    }

    /**
     * 도면 그림 좌표계로 변환이 걸려 있는 ctx에 모델을 그린다(app drawFloorPlanLayers가 부른다).
     * opts:
     *   fallback()       새로 그리기가 느린 도면에서, 움직이는 동안 밑에 깔 그림 그리기(래스터)
     *   darken(blit)     「도면 진하게」 — blit()을 몇 번 곱해 그리는 함수
     *   requestRedraw()  멈춘 뒤 선명하게 다시 그리도록 화면 갱신 요청
     * 반환: 그렸으면 true
     */
    function drawOnCanvas(ctx, model, imgW, imgH, opts) {
        opts = opts || {};
        if (!ctx || !model || !ctx.canvas || typeof ctx.getTransform !== 'function') return false;
        var W = ctx.canvas.width, H = ctx.canvas.height;
        if (!(W > 0) || !(H > 0) || !(imgW > 0) || !(imgH > 0)) return false;
        var T = ctx.getTransform();
        var kx = imgW / model.pageW, ky = imgH / model.pageH;
        var M = [T.a * kx, T.b * kx, -T.c * ky, -T.d * ky, T.e + T.c * imgH, T.f + T.d * imgH];
        if (!isFinite(M[0] + M[1] + M[2] + M[3] + M[4] + M[5]) || Math.abs(M[0] * M[3] - M[1] * M[2]) < 1e-12) return false;

        var fresh = cache.canvas && cache.model === model && cache.W === W && cache.H === H && sameMatrix(cache.M, M);
        var stale = !fresh && cache.canvas && cache.model === model && cache.M;
        if (!fresh && (!stale || forceNext || cache.ms <= FAST_MS)) {
            if (!cache.canvas) {
                cache.canvas = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : null;
                if (!cache.canvas) return false;
            }
            if (cache.canvas.width !== W) cache.canvas.width = W;
            if (cache.canvas.height !== H) cache.canvas.height = H;
            var cctx = cache.canvas.getContext('2d');
            cctx.setTransform(1, 0, 0, 1, 0, 0);
            cctx.clearRect(0, 0, W, H);
            var res = render(cctx, model, M, W, H, { minLinePx: 1 });
            cache.model = model; cache.M = M; cache.W = W; cache.H = H; cache.ms = res.ms;
            forceNext = false;
            fresh = true;
        }
        var blit;
        if (fresh) {
            if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
            blit = function () {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(cache.canvas, 0, 0);
                ctx.restore();
            };
        } else {
            // 느린 도면: 움직이는 동안은 방금 그린 것을 옮겨·늘려 보여 주고, 멈추면 다시 그린다
            if (typeof opts.fallback === 'function') opts.fallback();
            var C = cache.M;
            var cdet = C[0] * C[3] - C[1] * C[2];
            var i0 = C[3] / cdet, i1 = -C[1] / cdet, i2 = -C[2] / cdet, i3 = C[0] / cdet;
            var i4 = -(i0 * C[4] + i2 * C[5]), i5 = -(i1 * C[4] + i3 * C[5]);
            // R = M × C⁻¹ (옛 캔버스 픽셀 → 지금 캔버스 픽셀)
            var R = [
                M[0] * i0 + M[2] * i1, M[1] * i0 + M[3] * i1,
                M[0] * i2 + M[2] * i3, M[1] * i2 + M[3] * i3,
                M[0] * i4 + M[2] * i5 + M[4], M[1] * i4 + M[3] * i5 + M[5]
            ];
            blit = function () {
                ctx.save();
                ctx.setTransform(R[0], R[1], R[2], R[3], R[4], R[5]);
                ctx.drawImage(cache.canvas, 0, 0);
                ctx.restore();
            };
            if (settleTimer) clearTimeout(settleTimer);
            settleTimer = setTimeout(function () {
                settleTimer = null;
                forceNext = true;
                if (typeof opts.requestRedraw === 'function') opts.requestRedraw();
            }, 90);
        }
        blit();
        if (typeof opts.darken === 'function') opts.darken(blit);
        return true;
    }

    function resetCache() {
        cache.model = null; cache.M = null; cache.ms = 0;
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        forceNext = false;
    }

    var api = {
        findTaggedStream: findTaggedStream,
        inflate: inflate,
        parsePaths: parsePaths,
        parseTexts: parseTexts,
        buildModelFromPdfBytes: buildModelFromPdfBytes,
        render: render,
        getModel: getModel,
        ensureModel: ensureModel,
        dropModel: dropModel,
        drawOnCanvas: drawOnCanvas,
        resetCache: resetCache,
        lastRenderMs: function () { return cache.ms; }
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.dxfView = api; }
})(typeof window !== 'undefined' ? window : globalThis);
