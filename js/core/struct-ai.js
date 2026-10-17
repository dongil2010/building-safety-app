/**
 * 구조도 AI 읽기(2026-10-16) — 스캔한 구조평면도(그림·스캔 PDF)를 Gemini에 보여 기둥·거더·빔 위치를 받는다.
 * struct-plan.html 전용. 여기는 묻는 글·답 읽기·도면 좌표로 바꾸기만 하고, 그림 만들기·부르기는 js/struct-plan-page.js.
 *
 * 손으로 그릴 때와 같은 순서로 한 종류씩 읽는다: ① 기둥 → (사람이 확인) → ② 거더 → (확인) → ③ 빔.
 * ②·③에는 앞에서 확인한 기둥(·거더) 위치를 알려 주고, 받은 보는 끝을 기둥(빔은 거더·기둥) 면에 붙인 뒤
 * 사이 기둥(빔은 사이 거더·기둥)에서 끊는다(js/core/struct-members.js splitRun, 앱 직접 그리기와 같은 규칙).
 *
 * 받은 상자는 0~1000으로 나눈 [ymin, xmin, ymax, xmax](Gemini가 물체 위치를 주는 기본 형식).
 * 그림이 Google로 나가므로 단추를 누를 때만 부른다.
 */
(function (root) {
    'use strict';

    // 본 앱 R값 OCR·보고서 AI 초안과 같은 모델(같은 키)
    var MODEL = 'gemini-3.5-flash-lite';
    var TYPES = ['기둥', '거더', '빔'];

    /** 이미 확인한 부재(쪽 좌표) → 그림 안 0~1000 상자 글(범위 밖은 뺀다) */
    function knownLines(known, type, crop) {
        var out = [];
        (known || []).forEach(function (d) {
            if (d.type !== type) return;
            var x0 = (d.x - d.w / 2 - crop.x0) / crop.w * 1000, x1 = (d.x + d.w / 2 - crop.x0) / crop.w * 1000;
            var y0 = (d.y - d.h / 2 - crop.y0) / crop.h * 1000, y1 = (d.y + d.h / 2 - crop.y0) / crop.h * 1000;
            if (x1 < 0 || y1 < 0 || x0 > 1000 || y0 > 1000) return;
            out.push('[' + [y0, x0, y1, x1].map(function (v) { return Math.round(Math.max(0, Math.min(1000, v))); }).join(',') + ']');
        });
        return out;
    }

    /**
     * 단계별 묻는 글. step = '기둥' | '거더' | '빔', known = 이미 확인한 부재(쪽 좌표), crop = 보낸 범위 { x0, y0, w, h }
     */
    function buildPrompt(step, known, crop, opts) {
        var L = [(opts && opts.tile)
            ? '이 그림은 건물 구조평면도(스캔본)를 여러 조각으로 나눈 것 중 한 조각이다. 이 조각 안에 보이는 것만 답한다.'
            : '이 그림은 건물 구조평면도(스캔본)다.', ''];
        var cols = crop ? knownLines(known, '기둥', crop) : [], girders = crop ? knownLines(known, '거더', crop) : [];
        if (step === '기둥') {
            L.push('기둥만 모두 찾아라.',
                '- 기둥: 통심선(그리드선)이 만나는 곳에 놓인 작은 네모·동그라미(칠했거나 빗금이거나 테두리만). 보통 C1, C2, TC1 같은 이름이 옆에 있다.',
                '- C1·C2 같은 글자를 둘러싼 네모·타원은 이름표다. 기둥이 아니다(기둥은 그 이름표 옆의 다른 도형).',
                '- 상자는 기둥 모양에 딱 맞게. 보·벽·글자·통심선 자체는 기둥이 아니다.',
                '- 표·범례·도면 제목칸 안의 것은 넣지 않는다.');
        } else if (step === '거더') {
            L.push('거더(큰보)만 모두 찾아라. 기둥은 이미 찾았다(아래 상자).',
                '- 거더: 기둥과 기둥을 잇는 보. 보통 G1, 1G2, TG1, WG1 같은 이름(G가 들어감). 두 줄(실선·점선)로 그린 긴 띠.',
                '- 가로나 세로로 곧은 막대다. 상자 폭은 보 두 줄 사이로 얇게, 길이는 받치는 기둥 면에서 면까지.',
                '- 한 줄로 이어진 거더는 중간 기둥마다 끊지 않고 한 상자로 적어도 된다(나중에 기둥에서 끊는다).',
                '- 빔(작은보, B가 들어간 이름)·벽·통심선·치수선은 넣지 않는다.',
                '', '이미 찾은 기둥 [ymin,xmin,ymax,xmax]: ' + (cols.length ? cols.join(' ') : '(없음)'));
        } else {
            L.push('빔(작은보)만 모두 찾아라. 기둥과 거더는 이미 찾았다(아래 상자).',
                '- 빔: 거더와 거더(또는 거더와 기둥) 사이에 걸친 보. 보통 B1, 1B2 같은 이름(B가 들어감). 두 줄로 그린 띠.',
                '- 가로나 세로로 곧은 막대다. 상자 폭은 보 두 줄 사이로 얇게, 길이는 받치는 거더(기둥) 면에서 면까지.',
                '- 한 줄로 이어진 빔은 중간 거더마다 끊지 않고 한 상자로 적어도 된다(나중에 거더에서 끊는다).',
                '- 이미 찾은 거더와 겹치는 것, 벽·통심선·치수선은 넣지 않는다.',
                '', '이미 찾은 기둥 [ymin,xmin,ymax,xmax]: ' + (cols.length ? cols.join(' ') : '(없음)'),
                '이미 찾은 거더 [ymin,xmin,ymax,xmax]: ' + (girders.length ? girders.join(' ') : '(없음)'));
        }
        L.push('', '- 이름(label)은 그림에 적힌 그대로(없으면 빈 문자열).',
            '- box: [ymin, xmin, ymax, xmax], 그림 전체를 0~1000으로 나눈 정수.',
            '출력은 JSON 배열 하나만: [{"type":"' + step + '","label":"…","box":[ymin,xmin,ymax,xmax]}, ...]');
        return L.join('\n');
    }

    function typeOf(t) {
        var s = String(t || '').trim().toLowerCase();
        if (s === '기둥' || s === 'column' || s === 'col') return '기둥';
        if (s === '거더' || s === '큰보' || s === 'girder') return '거더';
        if (s === '빔' || s === '작은보' || s === 'beam') return '빔';
        return '';
    }

    /** AI 답 → [{ type, label, box:[ymin,xmin,ymax,xmax] }] (모르는 종류·잘못된 상자는 버린다) */
    function parseResponse(text) {
        var src = String(text || '');
        var at = src.indexOf('[');
        if (at < 0) throw new Error('AI 답에서 부재 목록을 찾지 못했습니다.');
        var body = src.slice(at), end = body.lastIndexOf(']');
        var arr;
        try { arr = JSON.parse(body.slice(0, end + 1)); }
        catch (e) {
            // 답이 길어 끝이 잘렸으면 마지막 온전한 항목까지만 읽는다
            var cut = body.lastIndexOf('}');
            try { arr = JSON.parse(body.slice(0, cut + 1) + ']'); }
            catch (_e) { throw new Error('AI 답을 읽지 못했습니다: ' + e.message); }
        }
        if (!Array.isArray(arr)) throw new Error('AI 답이 목록이 아닙니다.');
        var out = [];
        arr.forEach(function (it) {
            if (!it || typeof it !== 'object') return;
            var type = typeOf(it.type);
            var b = it.box || it.box_2d;
            if (!type || !Array.isArray(b) || b.length !== 4) return;
            b = b.map(Number);
            if (!b.every(Number.isFinite)) return;
            var y0 = Math.max(0, Math.min(b[0], b[2])), y1 = Math.min(1000, Math.max(b[0], b[2]));
            var x0 = Math.max(0, Math.min(b[1], b[3])), x1 = Math.min(1000, Math.max(b[1], b[3]));
            if (!(x1 > x0) || !(y1 > y0)) return;
            out.push({ type: type, label: String(it.label == null ? '' : it.label).trim().slice(0, 12), box: [y0, x0, y1, x1] });
        });
        return out;
    }

    function median(a) { a = a.slice().sort(function (p, q) { return p - q; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }

    /** 0~1000 상자 → 쪽 좌표 사각형 */
    function boxToRect(it, crop) {
        var b = it.box, sx = crop.w / 1000, sy = crop.h / 1000;
        var x0 = crop.x0 + b[1] * sx, x1 = crop.x0 + b[3] * sx, y0 = crop.y0 + b[0] * sy, y1 = crop.y0 + b[2] * sy;
        return { type: it.type, label: it.label || '', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    }
    function span(d, horiz) {
        return { a0: horiz ? d.x - d.w / 2 : d.y - d.h / 2, a1: horiz ? d.x + d.w / 2 : d.y + d.h / 2,
            p0: horiz ? d.y - d.h / 2 : d.x - d.w / 2, p1: horiz ? d.y + d.h / 2 : d.x + d.w / 2, c: horiz ? d.y : d.x };
    }
    /**
     * 보 한쪽 끝을 받침(기둥·거더) 면에 붙인다. end = 'from' | 'to', at = 지금 끝 좌표.
     * 중심선(여유 th)이 지나가는 받침 중 끝에서 reach 안이거나 끝이 그 안에 들어간 것 → { at, sup } (없으면 null)
     */
    function snapEnd(end, at, perp, th, horiz, supports, reach) {
        var best = null, bd = Infinity;
        supports.forEach(function (d) {
            var s = span(d, horiz);
            if (perp < s.p0 - th || perp > s.p1 + th) return;
            var face = end === 'to' ? s.a0 : s.a1;
            var inside = at >= s.a0 && at <= s.a1;
            var dist = Math.abs(at - face);
            if (!inside && dist > reach) return;
            if (dist < bd) { bd = dist; best = { at: face, sup: d }; }
        });
        return best;
    }

    /**
     * 한 단계 답 → 그 종류의 새 부재(쪽 좌표). items = parseResponse 결과(그 종류만 쓴다), crop = 보낸 범위,
     * known = 이미 확인한 부재(앞 단계, 쪽 좌표). 보는 가로·세로 막대로, 두께는 그 종류 중간값으로,
     * 끝은 받침 면에 붙이고(거더 → 기둥, 빔 → 거더·기둥), 사이 받침에서 끊는다.
     * → [{ id, shape:'column'|'beam', type, label, x, y, w, h, ai:true }]
     */
    function stepMembers(step, items, crop, known, opts) {
        var o = opts || {};
        var splitRun = o.splitRun || (root && root.BSA && root.BSA.structMembers && root.BSA.structMembers.splitRun);
        var seq = 0, stamp = Number(o.now) || Date.now();
        var nid = function () { seq++; return 'sm_ai' + stamp + '_' + step + '_' + seq; };
        var rects = (items || []).filter(function (it) { return it.type === step; }).map(function (it) { return boxToRect(it, crop); });
        if (step === '기둥') return rects.map(function (r) { return Object.assign({ id: nid(), shape: 'column', ai: true }, r); });
        known = (known || []).filter(function (d) { return d && TYPES.indexOf(d.type) >= 0; });
        var cols = known.filter(function (d) { return d.type === '기둥'; });
        var girders = known.filter(function (d) { return d.type === '거더'; });
        // 두께: 새로 받은 것의 짧은 변 중간값(없으면 이미 있는 같은 종류·거더 두께)
        var th = median(rects.map(function (r) { return Math.min(r.w, r.h); }))
            || median(known.filter(function (d) { return d.type === step; }).map(function (d) { return Math.min(d.w, d.h); }))
            || median(girders.map(function (d) { return Math.min(d.w, d.h); }));
        var reachBase = Math.max(crop.w, crop.h) * 0.02;
        var out = [];
        rects.forEach(function (r) {
            var horiz = r.w >= r.h, t = th || Math.min(r.w, r.h);
            var from = horiz ? r.x - r.w / 2 : r.y - r.h / 2, to = horiz ? r.x + r.w / 2 : r.y + r.h / 2;
            var perp = horiz ? r.y : r.x;
            // 받침: 거더 → 기둥, 빔 → 기둥 + 가로지르는 거더
            var sups = cols.concat(step === '빔' ? girders.filter(function (g) { return (g.w >= g.h) !== horiz; }) : []);
            var reach = Math.max(reachBase, t * 3);
            var s0 = snapEnd('from', from, perp, t, horiz, sups, reach), s1 = snapEnd('to', to, perp, t, horiz, sups, reach);
            if (s0) from = s0.at;
            if (s1) to = s1.at;
            // 기둥에 붙은 거더·빔은 그 기둥 중심선에 맞춘다(앱에서 기둥을 눌러 그릴 때와 같게)
            var cc = [s0, s1].filter(function (x) { return x && x.sup.type === '기둥'; }).map(function (x) { return horiz ? x.sup.y : x.sup.x; });
            if (cc.length) perp = cc.reduce(function (m, v) { return m + v; }, 0) / cc.length;
            if (!(to - from > t * 0.5)) return;
            var segs = typeof splitRun === 'function' ? splitRun({ horiz: horiz, from: from, to: to, perp: perp, minLen: t * 0.5 }, sups) : [{ from: from, to: to }];
            segs.forEach(function (sg) {
                var c = (sg.from + sg.to) / 2, len = sg.to - sg.from;
                out.push(Object.assign({ id: nid(), shape: 'beam', ai: true, type: step, label: r.label },
                    horiz ? { x: c, y: perp, w: len, h: t } : { x: perp, y: c, w: t, h: len }));
            });
        });
        return out;
    }

    // ---------- 기둥 조각 읽기(2026-10-17) ----------
    // 도면 한 장을 통째로 보내면 기둥(쪽 너비의 0.5% 남짓)이 AI 눈에 몇 픽셀밖에 안 돼 거의 못 찾는다(2층 스캔본: 기둥 한 변 ≈ 18/4000px).
    // 겹치게 여러 조각으로 잘라 따로 묻고, 조각 안쪽 경계에 걸려 잘린 기둥은 버린 뒤(겹친 옆 조각에 온전히 있다) 같은 기둥을 하나로 합친다.

    /**
     * 범위 r { x0, y0, x1, y1 }(쪽 좌표)을 한 변 tile 이하 조각으로, 이웃과 overlap만큼 겹치게 나눈다.
     * → [{ x0, y0, w, h, edge: { l, t, r, b } }]  edge = 그 변이 범위 바깥 경계인지(그쪽은 잘린 기둥도 버리지 않는다)
     */
    function tileGrid(r, tile, overlap) {
        var W = r.x1 - r.x0, H = r.y1 - r.y0, ov = Math.max(0, overlap || 0);
        if (!(W > 0) || !(H > 0) || !(tile > ov)) return [];
        var nx = Math.max(1, Math.ceil((W - ov) / (tile - ov))), ny = Math.max(1, Math.ceil((H - ov) / (tile - ov)));
        // 조각 크기를 고르게(마지막 조각만 가늘어지지 않게)
        var tw = nx === 1 ? W : (W + ov * (nx - 1)) / nx, th = ny === 1 ? H : (H + ov * (ny - 1)) / ny;
        var out = [];
        for (var j = 0; j < ny; j++) {
            for (var i = 0; i < nx; i++) {
                out.push({ x0: r.x0 + i * (tw - ov), y0: r.y0 + j * (th - ov), w: tw, h: th,
                    edge: { l: i === 0, t: j === 0, r: i === nx - 1, b: j === ny - 1 } });
            }
        }
        return out;
    }

    /**
     * 조각마다 받은 기둥(쪽 좌표 사각형) → 하나로 합친 기둥 목록.
     * perTile = [{ tile(tileGrid 한 칸), rects:[{ x, y, w, h, label }] }], margin = 조각 안쪽 경계에서 이만큼 안에 닿으면 잘린 것으로 본다.
     * 같은 기둥(가운데끼리 두 기둥 중 큰 변의 절반 안)은 평균 자리로 하나만 남긴다. → [{ x, y, w, h, label }]
     */
    function mergeTileColumns(perTile, margin) {
        var m = Math.max(0, margin || 0), kept = [];
        (perTile || []).forEach(function (pt) {
            var t = pt.tile;
            (pt.rects || []).forEach(function (r) {
                if (!(r.w > 0) || !(r.h > 0)) return;
                var l = r.x - r.w / 2, rr = r.x + r.w / 2, tp = r.y - r.h / 2, bt = r.y + r.h / 2;
                if ((!t.edge.l && l <= t.x0 + m) || (!t.edge.r && rr >= t.x0 + t.w - m)
                    || (!t.edge.t && tp <= t.y0 + m) || (!t.edge.b && bt >= t.y0 + t.h - m)) return;   // 조각 경계에서 잘림
                kept.push(r);
            });
        });
        var groups = [];
        kept.forEach(function (r) {
            var g = null;
            for (var i = 0; i < groups.length && !g; i++) {
                var c = groups[i];
                var reach = Math.max(r.w, r.h, c.w, c.h) * 0.5;
                if (Math.abs(c.x - r.x) <= reach && Math.abs(c.y - r.y) <= reach) g = c;
            }
            if (!g) { groups.push({ x: r.x, y: r.y, w: r.w, h: r.h, label: r.label || '', n: 1, sx: r.x, sy: r.y, sw: r.w, sh: r.h }); return; }
            g.n++; g.sx += r.x; g.sy += r.y; g.sw += r.w; g.sh += r.h;
            g.x = g.sx / g.n; g.y = g.sy / g.n; g.w = g.sw / g.n; g.h = g.sh / g.n;
            if (!g.label && r.label) g.label = r.label;
        });
        return groups.map(function (g) { return { x: g.x, y: g.y, w: g.w, h: g.h, label: g.label }; });
    }

    /** Gemini 부르기 → 답 글. image = { mimeType, base64 } */
    async function callGemini(key, image, prompt, opts) {
        var o = opts || {};
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (o.model || MODEL) + ':generateContent?key=' + encodeURIComponent(key);
        var res = await (o.fetch || fetch)(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: 'application/json' }
            })
        });
        if (!res.ok) {
            var errText = '';
            try { errText = await res.text(); } catch (_e) { /* ignore */ }
            throw new Error('AI 오류 (' + res.status + ')' + (res.status === 429 ? ' — 잠시(1~2분) 뒤 다시 눌러 주세요' : '') + ': ' + errText.slice(0, 200));
        }
        var data = await res.json();
        var parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        return parts.map(function (p) { return p.text || ''; }).join('');
    }

    var api = { MODEL: MODEL, TYPES: TYPES, buildPrompt: buildPrompt, parseResponse: parseResponse, stepMembers: stepMembers, callGemini: callGemini,
        tileGrid: tileGrid, mergeTileColumns: mergeTileColumns };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structAi = api; }
})(typeof window !== 'undefined' ? window : null);
