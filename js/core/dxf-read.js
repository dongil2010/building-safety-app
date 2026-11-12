/**
 * 캐드 DXF 읽기(2026-11-12) — 순수 모듈(화면 없음)
 * - decodeDxfBytes: 파일 바이트 → 글자(UTF-8 / $DWGCODEPAGE: 한글 cp949 등)
 * - parseDxf: 글자 → { header, layers, blocks, entities } (그룹 코드 짝 읽기)
 * - flattenDxf: 블록·호·곡선을 다 선분으로 펼친다(DXF 실좌표 그대로). PDF로 바꾸는 쪽(dxf-to-pdf.js)이 쓴다.
 * 설계: docs/cad-dxf-작업계획.md
 */
(function (root) {
    'use strict';

    var SAVE_AS_ASCII = '캐드에서 「다른 이름으로 저장」→ 파일 형식 DXF(ASCII)로 저장한 뒤 다시 올려 주세요.';

    function userError(msg) {
        var e = new Error(msg);
        e.bsaUserMessage = msg;
        return e;
    }

    // ───────────────────────── 글자 풀기(인코딩) ─────────────────────────

    var CODEPAGE_TO_ENCODING = {
        ANSI_949: 'euc-kr', ANSI_1361: 'euc-kr',
        ANSI_1252: 'windows-1252', ANSI_1250: 'windows-1250', ANSI_1251: 'windows-1251',
        ANSI_1253: 'windows-1253', ANSI_1254: 'windows-1254', ANSI_1257: 'windows-1257',
        ANSI_932: 'shift_jis', ANSI_936: 'gbk', ANSI_950: 'big5', ANSI_874: 'windows-874'
    };

    function asciiPrefix(bytes, n) {
        var s = '';
        var len = Math.min(bytes.length, n);
        for (var i = 0; i < len; i++) s += String.fromCharCode(bytes[i]);
        return s;
    }

    function tryDecode(bytes, enc, fatal) {
        if (typeof TextDecoder === 'undefined') return null;
        try { return new TextDecoder(enc, { fatal: !!fatal }).decode(bytes); } catch (e) { return null; }
    }

    function latin1(bytes) {
        var out = [];
        for (var i = 0; i < bytes.length; i += 8192) {
            out.push(String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, Math.min(bytes.length, i + 8192)))));
        }
        return out.join('');
    }

    /** 머리말(HEADER)에서 변수 하나 찾기(바이트를 latin1로 본 앞부분) */
    function sniffHeaderVar(head, name) {
        var re = new RegExp('\\$' + name + '\\s*\\r?\\n\\s*\\d+\\s*\\r?\\n([^\\r\\n]*)');
        var m = head.match(re);
        return m ? m[1].trim() : '';
    }

    /** 파일 바이트 → 글자. DWG·바이너리 DXF는 한국어 안내와 함께 오류 */
    function decodeDxfBytes(input) {
        var bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
        if (!bytes.length) throw userError('빈 파일입니다. ' + SAVE_AS_ASCII);
        var start = asciiPrefix(bytes, 32);
        if (/^AutoCAD Binary DXF/.test(start)) {
            throw userError('바이너리 DXF는 열 수 없습니다. ' + SAVE_AS_ASCII);
        }
        if (/^AC10\d\d/.test(start)) {
            var bin = false;
            for (var i = 6; i < Math.min(bytes.length, 128); i++) {
                var c = bytes[i];
                if (c === 0 || (c < 9) || (c > 13 && c < 32)) { bin = true; break; }
            }
            if (bin) throw userError('DWG 파일은 바로 열 수 없습니다. ' + SAVE_AS_ASCII);
        }
        // UTF-8 BOM
        if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
            return tryDecode(bytes.subarray(3), 'utf-8', false) || latin1(bytes.subarray(3));
        }
        var head = latin1(bytes.subarray(0, Math.min(bytes.length, 262144)));
        var ver = sniffHeaderVar(head, 'ACADVER');
        var cp = sniffHeaderVar(head, 'DWGCODEPAGE').toUpperCase();
        // AC1021(2007)부터는 UTF-8
        var vn = /^AC(\d{4})/.exec(ver);
        if (vn && parseInt(vn[1], 10) >= 1021) {
            return tryDecode(bytes, 'utf-8', false) || latin1(bytes);
        }
        var hasHigh = false;
        for (var j = 0; j < bytes.length; j++) { if (bytes[j] > 127) { hasHigh = true; break; } }
        if (!hasHigh) return latin1(bytes);
        var utf = tryDecode(bytes, 'utf-8', true);
        if (utf != null) return utf;
        var enc = CODEPAGE_TO_ENCODING[cp] || (cp ? null : 'euc-kr');
        if (!enc && /^ANSI_(\d+)$/.test(cp)) enc = 'windows-' + cp.slice(5);
        var out = (enc && tryDecode(bytes, enc, false)) || tryDecode(bytes, 'euc-kr', false) || tryDecode(bytes, 'windows-1252', false);
        return out != null ? out : latin1(bytes);
    }

    // ───────────────────────── 파싱 ─────────────────────────

    /** 글자 → [[코드, 값], …] */
    function readPairs(text) {
        var lines = String(text || '').split(/\r\n|\r|\n/);
        var pairs = [];
        for (var i = 0; i + 1 < lines.length; i += 2) {
            var codeStr = lines[i].trim();
            if (codeStr === '' && i + 2 >= lines.length) break;
            var code = parseInt(codeStr, 10);
            if (!isFinite(code)) {
                // 줄이 하나 밀렸으면 한 줄 건너뛰어 다시 맞춘다
                i -= 1;
                continue;
            }
            var v = lines[i + 1];
            // 글자 값(1·2·3 등)은 앞 공백을 남기고 끝 공백만 뺀다
            v = (code >= 1 && code <= 9) || code === 100 || code === 102 || code === 999 ? v.replace(/\s+$/, '') : v.trim();
            pairs.push([code, v]);
        }
        return pairs;
    }

    function makeEntity(type) {
        return { type: type, pairs: [] };
    }

    /** 객체 목록 묶기: POLYLINE→VERTEX…SEQEND, INSERT→ATTRIB…SEQEND */
    function groupEntities(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e.type === 'POLYLINE') {
                e.vertices = [];
                while (i + 1 < list.length && list[i + 1].type === 'VERTEX') e.vertices.push(list[++i]);
                if (i + 1 < list.length && list[i + 1].type === 'SEQEND') i++;
            } else if (e.type === 'INSERT') {
                e.attribs = [];
                if (i + 1 < list.length && list[i + 1].type === 'ATTRIB') {
                    while (i + 1 < list.length && list[i + 1].type === 'ATTRIB') e.attribs.push(list[++i]);
                    if (i + 1 < list.length && list[i + 1].type === 'SEQEND') i++;
                }
            } else if (e.type === 'VERTEX' || e.type === 'SEQEND' || e.type === 'ATTRIB') {
                continue;
            }
            out.push(e);
        }
        return out;
    }

    /** 글자 → { header, layers, blocks, entities } */
    function parseDxf(text) {
        var pairs = readPairs(text);
        var doc = { header: {}, layers: {}, blocks: {}, entities: [] };
        var i = 0;
        var n = pairs.length;
        while (i < n) {
            if (pairs[i][0] === 0 && pairs[i][1] === 'SECTION' && i + 1 < n && pairs[i + 1][0] === 2) {
                var name = String(pairs[i + 1][1]).toUpperCase();
                i += 2;
                var endIdx = i;
                while (endIdx < n && !(pairs[endIdx][0] === 0 && pairs[endIdx][1] === 'ENDSEC')) endIdx++;
                if (name === 'HEADER') parseHeader(pairs, i, endIdx, doc.header);
                else if (name === 'TABLES') parseTables(pairs, i, endIdx, doc.layers);
                else if (name === 'BLOCKS') parseBlocks(pairs, i, endIdx, doc.blocks);
                else if (name === 'ENTITIES') doc.entities = groupEntities(collectEntities(pairs, i, endIdx));
                i = endIdx + 1;
            } else {
                i++;
            }
        }
        return doc;
    }

    function parseHeader(pairs, a, b, header) {
        var cur = null;
        for (var i = a; i < b; i++) {
            var p = pairs[i];
            if (p[0] === 9) { cur = p[1]; header[cur] = null; continue; }
            if (!cur) continue;
            if (header[cur] == null) header[cur] = p[1];
            else if (!Array.isArray(header[cur])) header[cur] = [header[cur], p[1]];
            else header[cur].push(p[1]);
        }
    }

    function parseTables(pairs, a, b, layers) {
        var inLayer = false;
        var cur = null;
        function flush() {
            if (cur && cur.name != null) layers[String(cur.name).toUpperCase()] = cur;
            cur = null;
        }
        for (var i = a; i < b; i++) {
            var p = pairs[i];
            if (p[0] === 0) {
                flush();
                if (p[1] === 'TABLE') {
                    inLayer = (i + 1 < b && pairs[i + 1][0] === 2 && String(pairs[i + 1][1]).toUpperCase() === 'LAYER');
                } else if (p[1] === 'ENDTAB') {
                    inLayer = false;
                } else if (p[1] === 'LAYER' && inLayer) {
                    cur = { name: null, color: 7, flags: 0 };
                }
                continue;
            }
            if (!cur) continue;
            if (p[0] === 2) cur.name = p[1];
            else if (p[0] === 62) cur.color = parseInt(p[1], 10) || 0;
            else if (p[0] === 70) cur.flags = parseInt(p[1], 10) || 0;
        }
        flush();
    }

    function collectEntities(pairs, a, b) {
        var list = [];
        var cur = null;
        for (var i = a; i < b; i++) {
            var p = pairs[i];
            if (p[0] === 0) {
                cur = makeEntity(String(p[1]).toUpperCase());
                list.push(cur);
            } else if (cur) {
                cur.pairs.push(p);
            }
        }
        return list;
    }

    function parseBlocks(pairs, a, b, blocks) {
        var i = a;
        while (i < b) {
            var p = pairs[i];
            if (p[0] === 0 && p[1] === 'BLOCK') {
                var head = makeEntity('BLOCK');
                i++;
                while (i < b && pairs[i][0] !== 0) { head.pairs.push(pairs[i]); i++; }
                var s = i;
                while (i < b && !(pairs[i][0] === 0 && pairs[i][1] === 'ENDBLK')) i++;
                var name = gs(head, 2, '') || gs(head, 3, '');
                var blk = {
                    name: name,
                    layer: gs(head, 8, '0'),
                    flags: gi(head, 70, 0),
                    baseX: gn(head, 10, 0),
                    baseY: gn(head, 20, 0),
                    entities: groupEntities(collectEntities(pairs, s, i))
                };
                if (name) blocks[String(name).toUpperCase()] = blk;
                // ENDBLK 자기 짝 건너뛰기
                i++;
                while (i < b && pairs[i][0] !== 0) i++;
            } else {
                i++;
            }
        }
    }

    // 짝 값 꺼내기
    function gs(e, code, def) {
        var ps = e.pairs;
        for (var i = 0; i < ps.length; i++) if (ps[i][0] === code) return ps[i][1];
        return def;
    }
    function gn(e, code, def) {
        var v = gs(e, code, null);
        if (v == null) return def;
        var f = parseFloat(v);
        return isFinite(f) ? f : def;
    }
    function gi(e, code, def) {
        var v = gs(e, code, null);
        if (v == null) return def;
        var f = parseInt(v, 10);
        return isFinite(f) ? f : def;
    }
    function allN(e, code) {
        var out = [];
        var ps = e.pairs;
        for (var i = 0; i < ps.length; i++) if (ps[i][0] === code) out.push(parseFloat(ps[i][1]));
        return out;
    }

    // ───────────────────────── 글자 내용 풀기 ─────────────────────────

    var MBCS_CP = { 1: 'shift_jis', 2: 'big5', 3: 'euc-kr', 4: 'euc-kr', 5: 'gbk' };

    function decodeMbcs(n, hex) {
        var enc = MBCS_CP[n];
        if (!enc || typeof TextDecoder === 'undefined') return '';
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return tryDecode(bytes, enc, false) || '';
    }

    /** \U+XXXX, \M+nXXXX */
    function decodeUnicodeEscapes(s) {
        return String(s || '')
            .replace(/\\U\+([0-9A-Fa-f]{4,5})/g, function (_, h) {
                var cp = parseInt(h, 16);
                try { return String.fromCodePoint(cp); } catch (e) { return ''; }
            })
            .replace(/\\M\+(\d)([0-9A-Fa-f]{4})/g, function (_, n, h) { return decodeMbcs(parseInt(n, 10), h); });
    }

    /** %%d %%c %%p %%u %%o %%% %%nnn */
    function decodeSpecialCodes(s) {
        return String(s || '').replace(/%%(\d{3}|[dDcCpPuUoOkK%])/g, function (_, k) {
            if (/^\d{3}$/.test(k)) return String.fromCharCode(parseInt(k, 10));
            switch (k.toLowerCase()) {
                case 'd': return '°';
                case 'c': return '\u00D8'; // 지름 표시(O 빗금) — WinAnsi라 Helvetica 글자로 남는다
                case 'p': return '±';
                case '%': return '%';
                default: return '';
            }
        });
    }

    function decodeTextValue(s) {
        return decodeSpecialCodes(decodeUnicodeEscapes(s)).replace(/[\u0000-\u001f]/g, '');
    }

    /** MTEXT 서식 빼기 → 줄 배열 */
    function mtextToLines(raw) {
        var s = decodeUnicodeEscapes(String(raw || ''));
        var out = '';
        var i = 0;
        var n = s.length;
        while (i < n) {
            var ch = s[i];
            if (ch === '{' || ch === '}') { i++; continue; }
            if (ch !== '\\') { out += ch; i++; continue; }
            var k = s[i + 1];
            if (k === undefined) { i++; continue; }
            if (k === 'P' || k === 'N' || k === 'X') { out += '\n'; i += 2; continue; }
            if (k === '~') { out += ' '; i += 2; continue; }
            if (k === '\\' || k === '{' || k === '}') { out += k; i += 2; continue; }
            if ('LlOoKk'.indexOf(k) >= 0) { i += 2; continue; }
            if (k === 'S') {
                var end = s.indexOf(';', i + 2);
                if (end < 0) end = n;
                var body = s.slice(i + 2, end).replace(/[#^]/, '/').replace(/\^/g, '');
                out += body;
                i = end + 1;
                continue;
            }
            if ('fFHCcTQWApa'.indexOf(k) >= 0) {
                var e2 = s.indexOf(';', i + 2);
                i = e2 < 0 ? n : e2 + 1;
                continue;
            }
            // 모르는 코드는 그 글자만 남긴다
            out += k;
            i += 2;
        }
        return decodeSpecialCodes(out).split('\n').map(function (l) { return l.replace(/[\u0000-\u001f]/g, ''); });
    }

    // ───────────────────────── 행렬(2D 아핀) ─────────────────────────
    // m = [a, b, c, d, e, f] : x' = a*x + c*y + e, y' = b*x + d*y + f

    var IDENT = [1, 0, 0, 1, 0, 0];
    function mul(m1, m2) { // m1 · m2 (m2 먼저)
        return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ];
    }
    function tr(x, y) { return [1, 0, 0, 1, x, y]; }
    function rot(rad) { var c = Math.cos(rad), s = Math.sin(rad); return [c, s, -s, c, 0, 0]; }
    function scl(x, y) { return [x, 0, 0, y, 0, 0]; }
    var MIRROR_X = [-1, 0, 0, 1, 0, 0];

    /** 돌출 방향이 (0,0,-1)이면 X가 뒤집힌다 */
    function isMirroredExtrusion(e) {
        var z = gn(e, 230, 1);
        return z < 0 && Math.abs(gn(e, 210, 0)) < 1e-9 && Math.abs(gn(e, 220, 0)) < 1e-9;
    }
    function ocsMatrix(e, m) { return isMirroredExtrusion(e) ? mul(m, MIRROR_X) : m; }

    // ───────────────────────── 곡선 → 점 ─────────────────────────

    function arcSegCount(r, sweep, tol) {
        var a = Math.abs(sweep);
        var n;
        if (tol > 0 && r > tol) {
            var step = 2 * Math.acos(Math.max(-1, 1 - tol / r));
            n = Math.ceil(a / Math.max(step, 1e-6));
        } else {
            n = Math.ceil(a / (2 * Math.PI) * 72);
        }
        var minN = Math.max(2, Math.ceil(a / (2 * Math.PI) * 16));
        var maxN = Math.max(minN, Math.ceil(a / (2 * Math.PI) * 360));
        return Math.max(minN, Math.min(maxN, n || minN));
    }

    /** 원호 점: 중심(cx,cy), 반지름 r, 시작각 a0, 쓸린 각 sweep(라디안, 음수면 시계) */
    function arcPoints(cx, cy, r, a0, sweep, tol, out, skipFirst) {
        var n = arcSegCount(r, sweep, tol);
        for (var i = skipFirst ? 1 : 0; i <= n; i++) {
            var a = a0 + sweep * i / n;
            out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        return out;
    }

    /** bulge 구간 p1→p2 (p1은 이미 out에 있음) */
    function bulgePoints(x1, y1, x2, y2, bulge, tol, out) {
        if (!bulge || Math.abs(bulge) < 1e-9) { out.push(x2, y2); return; }
        var theta = 4 * Math.atan(bulge);
        var dx = x2 - x1, dy = y2 - y1;
        var chord = Math.hypot(dx, dy);
        if (chord < 1e-12) { out.push(x2, y2); return; }
        var r = chord / (2 * Math.sin(Math.abs(theta) / 2));
        var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        // 중심: 현의 가운데에서 수직으로
        var h = r * Math.cos(Math.abs(theta) / 2);
        var nx = -dy / chord, ny = dx / chord;
        // 반원보다 크면 cos가 음수라 중심이 저절로 반대쪽
        var sgn = bulge > 0 ? 1 : -1;
        var cx = mx + nx * h * sgn, cy = my + ny * h * sgn;
        var a0 = Math.atan2(y1 - cy, x1 - cx);
        arcPoints(cx, cy, r, a0, theta, tol, out, true);
        // 끝점은 정확히
        out[out.length - 2] = x2; out[out.length - 1] = y2;
    }

    function ellipsePoints(cx, cy, mx, my, ratio, t0, t1, flip, tol, out) {
        var mnx = flip ? my * ratio : -my * ratio;
        var mny = flip ? -mx * ratio : mx * ratio;
        var sweep = t1 - t0;
        while (sweep <= 0) sweep += Math.PI * 2;
        if (sweep > Math.PI * 2 + 1e-9) sweep = Math.PI * 2;
        var r = Math.hypot(mx, my);
        var n = arcSegCount(r, sweep, tol);
        for (var i = 0; i <= n; i++) {
            var t = t0 + sweep * i / n;
            var c = Math.cos(t), s = Math.sin(t);
            out.push(cx + c * mx + s * mnx, cy + c * my + s * mny);
        }
        return out;
    }

    /** de Boor로 B-스플라인(유리 포함) 점 계산 */
    function evalBSpline(degree, ctrl, knots, weights, samples) {
        var nCtrl = ctrl.length / 2;
        var p = degree;
        if (nCtrl < p + 1 || knots.length !== nCtrl + p + 1) return null;
        var lo = knots[p], hi = knots[nCtrl];
        if (!(hi > lo)) return null;
        var out = [];
        var w = weights && weights.length === nCtrl ? weights : null;
        for (var si = 0; si <= samples; si++) {
            var u = lo + (hi - lo) * si / samples;
            if (si === samples) u = hi - 1e-12 * (hi - lo);
            var k = p;
            while (k < nCtrl - 1 && !(u >= knots[k] && u < knots[k + 1])) k++;
            var dx = [], dy = [], dw = [];
            for (var j = 0; j <= p; j++) {
                var idx = k - p + j;
                var ww = w ? w[idx] : 1;
                dx[j] = ctrl[idx * 2] * ww; dy[j] = ctrl[idx * 2 + 1] * ww; dw[j] = ww;
            }
            for (var r = 1; r <= p; r++) {
                for (var jj = p; jj >= r; jj--) {
                    var i2 = k - p + jj;
                    var den = knots[i2 + p - r + 1] - knots[i2];
                    var alpha = den === 0 ? 0 : (u - knots[i2]) / den;
                    dx[jj] = (1 - alpha) * dx[jj - 1] + alpha * dx[jj];
                    dy[jj] = (1 - alpha) * dy[jj - 1] + alpha * dy[jj];
                    dw[jj] = (1 - alpha) * dw[jj - 1] + alpha * dw[jj];
                }
            }
            var W = dw[p] || 1;
            out.push(dx[p] / W, dy[p] / W);
        }
        return out;
    }

    /** 맞춤점 사이를 캣멀-롬으로 이어 그리기 */
    function catmullRom(fit, closed, perSeg) {
        var n = fit.length / 2;
        if (n < 2) return fit.slice();
        var out = [];
        function P(i) {
            if (closed) i = (i + n) % n; else i = Math.max(0, Math.min(n - 1, i));
            return [fit[i * 2], fit[i * 2 + 1]];
        }
        var segs = closed ? n : n - 1;
        for (var i = 0; i < segs; i++) {
            var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
            for (var t = (i === 0 ? 0 : 1); t <= perSeg; t++) {
                var u = t / perSeg, u2 = u * u, u3 = u2 * u;
                out.push(
                    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
                    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3)
                );
            }
        }
        return out;
    }

    // ───────────────────────── 펼치기 ─────────────────────────

    function headerNum(header, name, def) {
        var v = header && header[name];
        if (Array.isArray(v)) v = v[0];
        var f = parseFloat(v);
        return isFinite(f) ? f : def;
    }

    function defaultTolerance(header) {
        var x0 = headerNum(header, '$EXTMIN', NaN), x1 = headerNum(header, '$EXTMAX', NaN);
        var ymin = header && Array.isArray(header.$EXTMIN) ? parseFloat(header.$EXTMIN[1]) : NaN;
        var ymax = header && Array.isArray(header.$EXTMAX) ? parseFloat(header.$EXTMAX[1]) : NaN;
        var span = Math.max(Math.abs(x1 - x0) || 0, Math.abs(ymax - ymin) || 0);
        if (isFinite(span) && span > 0 && span < 1e12) return span / 20000;
        return 0;
    }

    /**
     * 펼치기 → { polylines, texts, bounds, layers, stats } (DXF 실좌표)
     * opts: { maxVertices, maxDepth, tol(호 허용 오차, 도면 단위), trimOutliers(기본 true) }
     */
    function flattenDxf(doc, opts) {
        opts = opts || {};
        var maxVertices = opts.maxVertices || 4000000;
        var maxDepth = opts.maxDepth || 16;
        var maxVisits = opts.maxEntityVisits || 4000000;
        var tol = opts.tol > 0 ? opts.tol : defaultTolerance(doc.header);
        var header = doc.header || {};
        var layerTable = doc.layers || {};
        var blocks = doc.blocks || {};

        var polylines = [];
        var texts = [];
        var layerCount = {};
        var stats = {
            entities: {},
            skipped: { paperSpace: 0, hiddenLayer: 0, invisible: 0, attdef: 0, patternHatch: 0, unsupported: {} },
            vertices: 0,
            trimmed: false,
            droppedPolylines: 0,
            droppedTexts: 0,
            recursionStops: 0
        };
        var vertexTotal = 0;
        var visits = 0;
        var fillSeq = 0;

        function layerHidden(name) {
            var key = String(name || '0').toUpperCase();
            if (key === 'DEFPOINTS') return true;
            var L = layerTable[key];
            if (!L) return false;
            if (L.color < 0) return true; // 꺼짐
            if (L.flags & 1) return true; // 동결
            return false;
        }
        function layerFrozen(name) {
            var L = layerTable[String(name || '0').toUpperCase()];
            return !!(L && (L.flags & 1));
        }

        function count(layer) { layerCount[layer] = (layerCount[layer] || 0) + 1; }

        function addPoly(localPts, m, closed, layer, extra) {
            var n = localPts.length;
            if (n < 4 && !(n === 2 && extra && extra.dot)) return;
            vertexTotal += n / 2;
            if (vertexTotal > maxVertices) {
                throw userError('도면이 너무 큽니다(선 점 ' + Number(maxVertices).toLocaleString('ko-KR') + '개 넘음). 캐드에서 필요 없는 레이어·객체를 지우고 다시 저장해 주세요.');
            }
            var pts = new Array(n);
            var a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
            for (var i = 0; i < n; i += 2) {
                var x = localPts[i], y = localPts[i + 1];
                pts[i] = a * x + c * y + e;
                pts[i + 1] = b * x + d * y + f;
            }
            var item = { pts: pts, closed: !!closed, layer: layer };
            if (extra) {
                if (extra.width > 0) {
                    // 폭도 행렬 배율만큼
                    item.width = extra.width * Math.sqrt(Math.abs(a * d - b * c));
                }
                if (extra.fill) { item.fill = true; item.fillId = extra.fillId; }
            }
            polylines.push(item);
            count(layer);
        }

        function addText(str, x, y, h, rotDeg, hAlign, vAlign, widthFactor, m, layer) {
            if (str == null) return;
            str = String(str);
            if (!str.trim()) return;
            if (!(h > 0)) h = headerNum(header, '$TEXTSIZE', 2.5);
            var r = rotDeg * Math.PI / 180;
            var X = m[0] * x + m[2] * y + m[4];
            var Y = m[1] * x + m[3] * y + m[5];
            // 글자 방향·높이 벡터를 행렬로
            var ux = m[0] * Math.cos(r) + m[2] * Math.sin(r);
            var uy = m[1] * Math.cos(r) + m[3] * Math.sin(r);
            var vx = -m[0] * Math.sin(r) + m[2] * Math.cos(r);
            var vy = -m[1] * Math.sin(r) + m[3] * Math.cos(r);
            var ang = Math.atan2(uy, ux) * 180 / Math.PI;
            var hh = h * Math.hypot(vx, vy);
            vertexTotal += 1;
            texts.push({ x: X, y: Y, h: hh, rot: ang, text: str, hAlign: hAlign | 0, vAlign: vAlign | 0, widthFactor: widthFactor || 1, layer: layer });
            count(layer);
        }

        function tally(type) { stats.entities[type] = (stats.entities[type] || 0) + 1; }

        // TEXT·ATTRIB
        function doText(e, m, layer, vCode) {
            var raw = gs(e, 1, '');
            var str = decodeTextValue(raw);
            var h = gn(e, 40, 0);
            var r = gn(e, 50, 0);
            var wf = gn(e, 41, 1);
            var ha = gi(e, 72, 0);
            var va = gi(e, vCode, 0);
            var x = gn(e, 10, 0), y = gn(e, 20, 0);
            var mm = ocsMatrix(e, m);
            var hAlign = 0, vAlign = 0;
            if (ha === 3 || ha === 5) {
                // 맞춤·채움: 두 점 사이 — 왼쪽 기준선에 두고 방향은 두 점으로
                var x2 = gn(e, 11, x), y2 = gn(e, 21, y);
                if (Math.hypot(x2 - x, y2 - y) > 1e-9) r = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI;
            } else if (ha !== 0 || va !== 0) {
                x = gn(e, 11, x); y = gn(e, 21, y);
                if (ha === 4) { hAlign = 1; vAlign = 2; } else { hAlign = Math.max(0, Math.min(2, ha)); vAlign = Math.max(0, Math.min(3, va)); }
            }
            addText(str, x, y, h, r, hAlign, vAlign, wf, mm, layer);
        }

        function doMText(e, m, layer) {
            var raw = '';
            var ps = e.pairs;
            for (var i = 0; i < ps.length; i++) if (ps[i][0] === 3) raw += ps[i][1];
            raw += gs(e, 1, '');
            var lines = mtextToLines(raw);
            var h = gn(e, 40, 0) || headerNum(header, '$TEXTSIZE', 2.5);
            var att = gi(e, 71, 1);
            var x = gn(e, 10, 0), y = gn(e, 20, 0);
            var dx = gn(e, 11, NaN), dy = gn(e, 21, NaN);
            var rDeg = (isFinite(dx) && isFinite(dy) && Math.hypot(dx, dy) > 1e-12)
                ? Math.atan2(dy, dx) * 180 / Math.PI
                : gn(e, 50, 0);
            var spacing = gn(e, 44, 1) || 1;
            var ls = h * 5 / 3 * spacing;
            var row = Math.floor((att - 1) / 3); // 0 위, 1 가운데, 2 아래
            var col = (att - 1) % 3; // 0 왼쪽, 1 가운데, 2 오른쪽
            if (!(row >= 0 && row <= 2)) row = 0;
            if (!(col >= 0 && col <= 2)) col = 0;
            var total = h + (lines.length - 1) * ls;
            var topOff = row === 0 ? 0 : (row === 1 ? total / 2 : total);
            var r = rDeg * Math.PI / 180;
            var cs = Math.cos(r), sn = Math.sin(r);
            for (var li = 0; li < lines.length; li++) {
                var t = lines[li];
                if (!t || !t.trim()) continue;
                var off = topOff - h - li * ls; // 글자 쪽 y(기준선)
                var px = x - sn * off, py = y + cs * off;
                addText(t, px, py, h, rDeg, col, 0, 1, m, layer);
            }
        }

        function lwPolylinePoints(e) {
            var ps = e.pairs;
            var verts = [];
            var cur = null;
            for (var i = 0; i < ps.length; i++) {
                var c = ps[i][0];
                if (c === 10) { cur = { x: parseFloat(ps[i][1]), y: 0, b: 0 }; verts.push(cur); }
                else if (c === 20 && cur) cur.y = parseFloat(ps[i][1]);
                else if (c === 42 && cur) cur.b = parseFloat(ps[i][1]) || 0;
            }
            return verts;
        }

        function bulgePath(verts, closed) {
            var out = [];
            if (!verts.length) return out;
            out.push(verts[0].x, verts[0].y);
            for (var i = 0; i < verts.length - 1; i++) {
                bulgePoints(verts[i].x, verts[i].y, verts[i + 1].x, verts[i + 1].y, verts[i].b, tol, out);
            }
            if (closed && verts.length > 1) {
                var last = verts[verts.length - 1];
                if (Math.abs(last.b) > 1e-9) bulgePoints(last.x, last.y, verts[0].x, verts[0].y, last.b, tol, out);
            }
            return out;
        }

        function hatchLoops(e) {
            // 경계 경로 → 점 고리 배열
            var ps = e.pairs;
            var i = 0;
            while (i < ps.length && ps[i][0] !== 91) i++;
            if (i >= ps.length) return [];
            var nPaths = parseInt(ps[i][1], 10) || 0;
            i++;
            var loops = [];
            function num() { return parseFloat(ps[i++][1]); }
            function next(code) { // 그 코드가 나올 때까지 건너뛰기(같은 경로 안)
                while (i < ps.length && ps[i][0] !== code) i++;
                return i < ps.length;
            }
            for (var p = 0; p < nPaths; p++) {
                if (!next(92)) break;
                var flags = parseInt(ps[i][1], 10) || 0;
                i++;
                var pts = [];
                if (flags & 2) {
                    var hasBulge = false, n = 0;
                    while (i < ps.length && ps[i][0] !== 93) {
                        if (ps[i][0] === 72) hasBulge = parseInt(ps[i][1], 10) !== 0;
                        i++;
                    }
                    if (i >= ps.length) break;
                    n = parseInt(ps[i][1], 10) || 0; i++;
                    var verts = [];
                    for (var v = 0; v < n && i < ps.length; v++) {
                        while (i < ps.length && ps[i][0] !== 10) i++;
                        if (i >= ps.length) break;
                        var vx = num();
                        var vy = ps[i] && ps[i][0] === 20 ? num() : 0;
                        var b = 0;
                        if (hasBulge && ps[i] && ps[i][0] === 42) b = num();
                        verts.push({ x: vx, y: vy, b: b });
                    }
                    pts = bulgePath(verts, true);
                } else {
                    if (!next(93)) break;
                    var nEdges = parseInt(ps[i][1], 10) || 0; i++;
                    for (var ed = 0; ed < nEdges; ed++) {
                        if (!next(72)) break;
                        var et = parseInt(ps[i][1], 10); i++;
                        var seg = [];
                        if (et === 1) {
                            var x1 = gnAt(ps, i, 10), y1 = gnAt(ps, i, 20), x2 = gnAt(ps, i, 11), y2 = gnAt(ps, i, 21);
                            seg.push(x1, y1, x2, y2);
                        } else if (et === 2) {
                            var cx = gnAt(ps, i, 10), cy = gnAt(ps, i, 20), r = gnAt(ps, i, 40);
                            var sa = gnAt(ps, i, 50), ea = gnAt(ps, i, 51), ccw = gnAt(ps, i, 73);
                            var a0, sw;
                            if (ccw) { a0 = sa; sw = ea - sa; while (sw <= 0) sw += 360; }
                            else { a0 = -sa; sw = -(ea - sa); while (sw >= 0) sw -= 360; }
                            if (Math.abs(sw) > 360) sw = sw > 0 ? 360 : -360;
                            arcPoints(cx, cy, r, a0 * Math.PI / 180, sw * Math.PI / 180, tol, seg);
                        } else if (et === 3) {
                            var ecx = gnAt(ps, i, 10), ecy = gnAt(ps, i, 20), emx = gnAt(ps, i, 11), emy = gnAt(ps, i, 21);
                            var ratio = gnAt(ps, i, 40) || 1;
                            var es = gnAt(ps, i, 50) * Math.PI / 180, ee = gnAt(ps, i, 51) * Math.PI / 180;
                            var eccw = gnAt(ps, i, 73);
                            ellipsePoints(ecx, ecy, emx, emy, ratio, eccw ? es : -ee, eccw ? ee : -es, false, tol, seg);
                            if (!eccw) seg = reversePts(seg);
                        } else if (et === 4) {
                            var sp = hatchSplineEdge(ps, i);
                            if (sp) seg = sp;
                        }
                        // 다음 72(경계 끝)까지 이동은 next가 한다
                        appendSeg(pts, seg);
                    }
                }
                if (pts.length >= 6) loops.push(pts);
            }
            return loops;
        }

        function gnAt(ps, from, code) {
            for (var k = from; k < ps.length && k < from + 40; k++) {
                if (ps[k][0] === code) return parseFloat(ps[k][1]) || 0;
                if (ps[k][0] === 72 || ps[k][0] === 92 || ps[k][0] === 97) break;
            }
            return 0;
        }

        function hatchSplineEdge(ps, from) {
            var deg = 3, knots = [], ctrl = [], w = [];
            for (var k = from; k < ps.length; k++) {
                var c = ps[k][0];
                if (c === 72 || c === 92 || c === 97 || c === 75) break;
                if (c === 94) deg = parseInt(ps[k][1], 10) || 3;
                else if (c === 40) knots.push(parseFloat(ps[k][1]));
                else if (c === 10) ctrl.push(parseFloat(ps[k][1]), 0);
                else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1] = parseFloat(ps[k][1]);
                else if (c === 42) w.push(parseFloat(ps[k][1]));
            }
            return evalBSpline(deg, ctrl, knots, w.length ? w : null, Math.max(8, ctrl.length * 8));
        }

        function appendSeg(pts, seg) {
            if (!seg || seg.length < 2) return;
            var start = 0;
            if (pts.length >= 2 && Math.abs(pts[pts.length - 2] - seg[0]) < 1e-9 && Math.abs(pts[pts.length - 1] - seg[1]) < 1e-9) start = 2;
            for (var k = start; k < seg.length; k++) pts.push(seg[k]);
        }

        function reversePts(a) {
            var out = [];
            for (var k = a.length - 2; k >= 0; k -= 2) out.push(a[k], a[k + 1]);
            return out;
        }

        function splinePoints(e) {
            var deg = gi(e, 71, 3);
            var flags = gi(e, 70, 0);
            var knots = allN(e, 40);
            var w = allN(e, 41);
            var ctrl = [], fit = [];
            var ps = e.pairs;
            for (var k = 0; k < ps.length; k++) {
                var c = ps[k][0];
                if (c === 10) ctrl.push(parseFloat(ps[k][1]), 0);
                else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1] = parseFloat(ps[k][1]);
                else if (c === 11) fit.push(parseFloat(ps[k][1]), 0);
                else if (c === 21 && fit.length) fit[fit.length - 1] = parseFloat(ps[k][1]);
            }
            var nCtrl = ctrl.length / 2;
            if (nCtrl >= 2 && knots.length) {
                var res = evalBSpline(deg, ctrl, knots, (flags & 4) && w.length ? w : null, Math.max(16, Math.min(2000, nCtrl * 10)));
                if (res) return res;
            }
            if (fit.length >= 4) return catmullRom(fit, !!(flags & 1), 8);
            return ctrl.length >= 4 ? ctrl : null;
        }

        function polylineEntity(e, m, layer) {
            var flags = gi(e, 70, 0);
            if (flags & (16 | 64)) { // 3D 망·다면 망은 건너뜀
                stats.skipped.unsupported['POLYLINE-MESH'] = (stats.skipped.unsupported['POLYLINE-MESH'] || 0) + 1;
                return;
            }
            var is3d = !!(flags & 8);
            var verts = [];
            (e.vertices || []).forEach(function (v) {
                var vf = gi(v, 70, 0);
                if (vf & 16) return; // 스플라인 뼈대 점
                verts.push({ x: gn(v, 10, 0), y: gn(v, 20, 0), b: is3d ? 0 : gn(v, 42, 0) });
            });
            var closed = !!(flags & 1);
            var w0 = gn(e, 40, 0), w1 = gn(e, 41, 0);
            var mm = is3d ? m : ocsMatrix(e, m);
            addPoly(bulgePath(verts, closed), mm, closed, layer, { width: Math.min(w0, w1) > 0 ? (w0 + w1) / 2 : 0 });
        }

        function emit(e, m, parentLayer, depth) {
            if (++visits > maxVisits) {
                throw userError('도면이 너무 큽니다(객체가 너무 많음). 캐드에서 필요 없는 객체를 지우고 다시 저장해 주세요.');
            }
            var type = e.type;
            if (gi(e, 67, 0) === 1) { stats.skipped.paperSpace++; return; }
            if (gi(e, 60, 0) === 1) { stats.skipped.invisible++; return; }
            var own = gs(e, 8, '0');
            var layer = (String(own) === '0' && parentLayer) ? parentLayer : own;
            if (type === 'INSERT') {
                // 블록 참조는 동결이면 통째로, 꺼짐이면 0 레이어 자식만 숨는다(자식 검사에서)
                if (layerFrozen(layer) || String(layer).toUpperCase() === 'DEFPOINTS') { stats.skipped.hiddenLayer++; return; }
            } else if (layerHidden(layer)) {
                stats.skipped.hiddenLayer++;
                return;
            }
            tally(type);
            var pts, mm;
            switch (type) {
                case 'LINE':
                    addPoly([gn(e, 10, 0), gn(e, 20, 0), gn(e, 11, 0), gn(e, 21, 0)], m, false, layer);
                    break;
                case 'LWPOLYLINE': {
                    var closed = !!(gi(e, 70, 0) & 1);
                    var cw = gn(e, 43, 0);
                    if (!(cw > 0)) {
                        // 꼭짓점별 폭이 모두 같으면 그 폭
                        var ws = allN(e, 40).concat(allN(e, 41));
                        if (ws.length && ws.every(function (v) { return Math.abs(v - ws[0]) < 1e-9; })) cw = ws[0];
                    }
                    addPoly(bulgePath(lwPolylinePoints(e), closed), ocsMatrix(e, m), closed, layer, { width: cw > 0 ? cw : 0 });
                    break;
                }
                case 'POLYLINE':
                    polylineEntity(e, m, layer);
                    break;
                case 'CIRCLE':
                    pts = arcPoints(gn(e, 10, 0), gn(e, 20, 0), gn(e, 40, 0), 0, Math.PI * 2, tol, []);
                    addPoly(pts, ocsMatrix(e, m), true, layer);
                    break;
                case 'ARC': {
                    var sa = gn(e, 50, 0), ea = gn(e, 51, 360);
                    var sw = ea - sa;
                    // 2026-11-12 시작각 = 끝각이면 길이 0인 호 — 캐드는 아무것도 안 그린다. 예전엔 360°를 더해
                    // 반지름 그대로 온 원이 생겼다(농협광주 지상2층 주차 레이어 R=25000 → 도면 위 큰 원).
                    if (Math.abs(sw) < 1e-9) {
                        stats.skipped.zeroArc = (stats.skipped.zeroArc || 0) + 1;
                        break;
                    }
                    while (sw <= 0) sw += 360;
                    pts = arcPoints(gn(e, 10, 0), gn(e, 20, 0), gn(e, 40, 0), sa * Math.PI / 180, sw * Math.PI / 180, tol, []);
                    addPoly(pts, ocsMatrix(e, m), false, layer);
                    break;
                }
                case 'ELLIPSE': {
                    var t0 = gn(e, 41, 0), t1 = gn(e, 42, Math.PI * 2);
                    pts = ellipsePoints(gn(e, 10, 0), gn(e, 20, 0), gn(e, 11, 1), gn(e, 21, 0), gn(e, 40, 1), t0, t1, isMirroredExtrusion(e), tol, []);
                    var full = Math.abs((t1 - t0) - Math.PI * 2) < 1e-6;
                    addPoly(pts, m, full, layer);
                    break;
                }
                case 'SPLINE':
                    pts = splinePoints(e);
                    if (pts) addPoly(pts, m, false, layer);
                    break;
                case 'LEADER': {
                    var xs = allN(e, 10), ys = allN(e, 20);
                    pts = [];
                    for (var k = 0; k < Math.min(xs.length, ys.length); k++) pts.push(xs[k], ys[k]);
                    addPoly(pts, m, false, layer);
                    // 화살촉(71=1): 첫 점에 작은 세모
                    if (gi(e, 71, 1) !== 0 && pts.length >= 4) {
                        var asz = headerNum(header, '$DIMASZ', 2.5) * (headerNum(header, '$DIMSCALE', 1) || 1);
                        var ax = pts[0], ay = pts[1], bx = pts[2] - ax, by = pts[3] - ay;
                        var L = Math.hypot(bx, by);
                        if (L > 1e-9 && asz > 0) {
                            bx /= L; by /= L;
                            var hw = asz / 6;
                            addPoly([ax, ay, ax + bx * asz - by * hw, ay + by * asz + bx * hw, ax + bx * asz + by * hw, ay + by * asz - bx * hw],
                                m, true, layer, { fill: true, fillId: ++fillSeq });
                        }
                    }
                    break;
                }
                case 'SOLID':
                case 'TRACE': {
                    var x0 = gn(e, 10, 0), y0 = gn(e, 20, 0), x1 = gn(e, 11, 0), y1 = gn(e, 21, 0);
                    var x2 = gn(e, 12, 0), y2 = gn(e, 22, 0), x3 = gn(e, 13, x2), y3 = gn(e, 23, y2);
                    // 넷째 점이 셋째와 순서가 바뀐다(DXF SOLID 규칙)
                    addPoly([x0, y0, x1, y1, x3, y3, x2, y2], ocsMatrix(e, m), true, layer, { fill: true, fillId: ++fillSeq });
                    break;
                }
                case 'HATCH': {
                    var solid = gi(e, 70, 0) === 1 || String(gs(e, 2, '')).toUpperCase() === 'SOLID';
                    if (!solid) { stats.skipped.patternHatch++; break; }
                    var loops = hatchLoops(e);
                    var id = ++fillSeq;
                    mm = ocsMatrix(e, m);
                    loops.forEach(function (lp) { addPoly(lp, mm, true, layer, { fill: true, fillId: id }); });
                    break;
                }
                case 'TEXT':
                    doText(e, m, layer, 73);
                    break;
                case 'MTEXT':
                    doMText(e, m, layer);
                    break;
                case 'ATTDEF':
                    stats.skipped.attdef++;
                    break;
                case 'INSERT':
                    doInsert(e, m, layer, depth);
                    break;
                case 'DIMENSION': {
                    var bn = gs(e, 2, '');
                    var blk = bn && blocks[String(bn).toUpperCase()];
                    if (blk) drawBlock(blk, m, layer, depth + 1);
                    break;
                }
                case 'POINT':
                case 'VIEWPORT':
                case 'XLINE':
                case 'RAY':
                    break;
                default:
                    stats.skipped.unsupported[type] = (stats.skipped.unsupported[type] || 0) + 1;
            }
        }

        function drawBlock(blk, m, layer, depth) {
            if (depth > maxDepth) { stats.recursionStops++; return; }
            if (blk._busy) { stats.recursionStops++; return; }
            blk._busy = true;
            try {
                var bm = mul(m, tr(-blk.baseX, -blk.baseY));
                for (var i = 0; i < blk.entities.length; i++) emit(blk.entities[i], bm, layer, depth);
            } finally {
                blk._busy = false;
            }
        }

        function doInsert(e, m, layer, depth) {
            var name = gs(e, 2, '');
            var blk = name && blocks[String(name).toUpperCase()];
            if (blk && !(blk.flags & 4)) { // 4 = 외부 참조(xref)는 내용이 없음
                var sx = gn(e, 41, 1) || 1, sy = gn(e, 42, 1) || 1;
                var r = gn(e, 50, 0) * Math.PI / 180;
                var cols = Math.max(1, gi(e, 70, 1)), rows = Math.max(1, gi(e, 71, 1));
                var cs = gn(e, 44, 0), rs = gn(e, 45, 0);
                if (cols * rows > 10000) { cols = Math.min(cols, 100); rows = Math.min(rows, 100); }
                var base = mul(ocsMatrix(e, m), mul(tr(gn(e, 10, 0), gn(e, 20, 0)), rot(r)));
                for (var ci = 0; ci < cols; ci++) {
                    for (var ri = 0; ri < rows; ri++) {
                        var im = mul(base, mul(tr(ci * cs, ri * rs), scl(sx, sy)));
                        drawBlock(blk, im, layer, depth + 1);
                    }
                }
            }
            // 속성(ATTRIB)은 이미 실좌표 — 블록 행렬이 아니라 바깥 행렬만
            (e.attribs || []).forEach(function (a) {
                if (gi(a, 70, 0) & 1) return; // 숨김 속성
                if (gi(a, 67, 0) === 1) return;
                var own = gs(a, 8, '0');
                var al = (String(own) === '0') ? layer : own;
                if (layerHidden(al)) return;
                tally('ATTRIB');
                doText(a, m, al, 74);
            });
        }

        for (var i = 0; i < (doc.entities || []).length; i++) emit(doc.entities[i], IDENT, null, 0);

        stats.vertices = vertexTotal;
        var bounds = computeBounds(polylines, texts, stats, opts.trimOutliers !== false);
        var keptP = bounds.keep ? polylines.filter(function (p, idx) { return bounds.keep.p[idx]; }) : polylines;
        var keptT = bounds.keep ? texts.filter(function (t, idx) { return bounds.keep.t[idx]; }) : texts;
        var layers = Object.keys(layerCount).sort().map(function (k) { return { name: k, count: layerCount[k] }; });
        return {
            polylines: keptP,
            texts: keptT,
            bounds: bounds.box,
            layers: layers,
            unit: headerNum(header, '$INSUNITS', 0) | 0,
            stats: stats
        };
    }

    // ───────────────────────── 범위(멀리 떨어진 쓰레기 거르기) ─────────────────────────

    function percentile(sorted, q) {
        if (!sorted.length) return NaN;
        var idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
        return sorted[idx];
    }

    /**
     * 꼭짓점 1~99% 범위보다 전체 범위가 훨씬(TRIM_RATIO배) 크면 1~99% 범위 + 여유를 쓰고
     * 그 밖에 통째로 있는 객체는 뺀다.
     */
    var TRIM_RATIO = 4;

    /** 글자 대강의 상자 네 모서리(글자 폭 ≈ 높이 × 0.8 × 글자 수) */
    function textCorners(t) {
        var w = t.h * 0.8 * String(t.text || '').length * (t.widthFactor || 1);
        var x0 = t.hAlign === 1 ? -w / 2 : (t.hAlign === 2 ? -w : 0);
        var y0 = t.vAlign === 2 ? -t.h / 2 : (t.vAlign === 3 ? -t.h : (t.vAlign === 1 ? 0 : -t.h * 0.3));
        var y1 = y0 + t.h * (t.vAlign === 0 ? 1.3 : 1);
        var r = (t.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
        return [[x0, y0], [x0 + w, y0], [x0 + w, y1], [x0, y1]].map(function (q) {
            return [t.x + q[0] * c - q[1] * s, t.y + q[0] * s + q[1] * c];
        });
    }
    function computeBounds(polylines, texts, stats, allowTrim) {
        var full = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        var total = 0;
        polylines.forEach(function (p) { total += p.pts.length / 2; });
        total += texts.length;
        if (!total) return { box: null, keep: null };
        var stride = Math.max(1, Math.floor(total / 400000));
        var xs = [], ys = [];
        var counter = 0;
        function take(x, y) {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < full.minX) full.minX = x; if (x > full.maxX) full.maxX = x;
            if (y < full.minY) full.minY = y; if (y > full.maxY) full.maxY = y;
            if ((counter++ % stride) === 0) { xs.push(x); ys.push(y); }
        }
        polylines.forEach(function (p) { for (var i = 0; i < p.pts.length; i += 2) take(p.pts[i], p.pts[i + 1]); });
        texts.forEach(function (t) { take(t.x, t.y); });
        if (!isFinite(full.minX)) return { box: null, keep: null };
        // 글자는 기준점만이 아니라 대강의 글자 상자까지 범위에 넣는다(가장자리 글자가 잘리지 않게)
        function growFullByText(t) {
            textCorners(t).forEach(function (c) {
                if (c[0] < full.minX) full.minX = c[0]; if (c[0] > full.maxX) full.maxX = c[0];
                if (c[1] < full.minY) full.minY = c[1]; if (c[1] > full.maxY) full.maxY = c[1];
            });
        }
        function untrimmed() { texts.forEach(growFullByText); return { box: full, keep: null }; }
        if (!allowTrim || xs.length < 20) return untrimmed();
        var sx = Float64Array.from(xs).sort(), sy = Float64Array.from(ys).sort();
        var t = { minX: percentile(sx, 0.01), maxX: percentile(sx, 0.99), minY: percentile(sy, 0.01), maxY: percentile(sy, 0.99) };
        var tw = t.maxX - t.minX, th = t.maxY - t.minY;
        var size = Math.max(tw, th);
        if (!(size > 0)) return untrimmed();
        var fw = full.maxX - full.minX, fh = full.maxY - full.minY;
        if (Math.max(fw, fh) <= size * TRIM_RATIO) return untrimmed();
        // 여유: 걸러낸 범위 크기의 절반씩
        var mg = size * 0.5;
        var box = { minX: t.minX - mg, minY: t.minY - mg, maxX: t.maxX + mg, maxY: t.maxY + mg };
        var keep = { p: new Array(polylines.length), t: new Array(texts.length) };
        var nb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        function grow(x, y) {
            x = Math.max(box.minX, Math.min(box.maxX, x));
            y = Math.max(box.minY, Math.min(box.maxY, y));
            if (x < nb.minX) nb.minX = x; if (x > nb.maxX) nb.maxX = x;
            if (y < nb.minY) nb.minY = y; if (y > nb.maxY) nb.maxY = y;
        }
        polylines.forEach(function (p, idx) {
            var a = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
            for (var i = 0; i < p.pts.length; i += 2) {
                var x = p.pts[i], y = p.pts[i + 1];
                if (x < a.minX) a.minX = x; if (x > a.maxX) a.maxX = x;
                if (y < a.minY) a.minY = y; if (y > a.maxY) a.maxY = y;
            }
            var inside = !(a.maxX < box.minX || a.minX > box.maxX || a.maxY < box.minY || a.minY > box.maxY);
            keep.p[idx] = inside;
            if (!inside) { stats.droppedPolylines++; return; }
            for (var j = 0; j < p.pts.length; j += 2) grow(p.pts[j], p.pts[j + 1]);
        });
        texts.forEach(function (tx, idx) {
            var inside = tx.x >= box.minX && tx.x <= box.maxX && tx.y >= box.minY && tx.y <= box.maxY;
            keep.t[idx] = inside;
            if (!inside) { stats.droppedTexts++; return; }
            textCorners(tx).forEach(function (c) { grow(c[0], c[1]); });
        });
        stats.trimmed = true;
        stats.fullBounds = full;
        return { box: isFinite(nb.minX) ? nb : box, keep: keep };
    }

    var api = {
        decodeDxfBytes: decodeDxfBytes,
        parseDxf: parseDxf,
        flattenDxf: flattenDxf,
        // 시험·다른 모듈용
        mtextToLines: mtextToLines,
        decodeTextValue: decodeTextValue,
        evalBSpline: evalBSpline,
        userError: userError,
        SAVE_AS_ASCII: SAVE_AS_ASCII
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.dxfRead = api; }
})(typeof window !== 'undefined' ? window : globalThis);
