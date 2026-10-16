/**
 * 구조도 AI 읽기(2026-10-16) — 스캔한 구조평면도(그림·스캔 PDF)를 Gemini에 보여 기둥·거더·빔 위치를 받는다.
 * struct-plan.html 전용. 여기는 묻는 글·답 읽기·도면 좌표로 바꾸기만 하고, 그림 만들기·부르기는 js/struct-plan-page.js.
 *
 * 받은 상자는 0~1000으로 나눈 [ymin, xmin, ymax, xmax](Gemini가 물체 위치를 주는 기본 형식).
 * 보(거더·빔)는 가로·세로 막대로 바로 세우고, 앱에서 그릴 때와 같게 거더는 사이 기둥에서, 빔은 사이 거더·기둥에서 끊는다
 * (js/core/struct-members.js splitRun). 그림이 Google로 나가므로 버튼을 누를 때만 부른다.
 */
(function (root) {
    'use strict';

    // 본 앱 R값 OCR·보고서 AI 초안과 같은 모델(같은 키)
    var MODEL = 'gemini-3.5-flash-lite';
    var TYPES = ['기둥', '거더', '빔'];

    function buildPrompt() {
        return [
            '이 그림은 건물 구조평면도(스캔본)다. 그림 안의 구조 부재를 모두 찾아라.',
            '',
            '찾을 것',
            '- 기둥: 칠하거나 빗금친 작은 네모·동그라미. 보통 C1, C2, TC1 같은 이름이 옆에 있다. 상자는 기둥 모양에 딱 맞게.',
            '- 거더(큰보): 기둥과 기둥을 잇는 보. 보통 G1, 1G2, TG1, WG1 같은 이름(G가 들어감). 두 줄(실선·점선)로 그린 긴 띠.',
            '- 빔(작은보): 거더와 거더(또는 거더와 기둥) 사이에 걸친 보. 보통 B1, 1B2 같은 이름(B가 들어감).',
            '',
            '규칙',
            '- 보는 가로나 세로로 곧은 긴 막대다. 상자는 보 두 줄 사이 폭으로 얇게, 길이는 받치는 기둥(빔이면 거더) 면에서 면까지.',
            '- 한 줄로 이어진 보는 기둥·거더마다 끊어 따로 적지 않아도 된다(이어서 한 상자로 적어도 된다).',
            '- 통심선(그리드선)·치수선·치수 글자·벽·슬래브·계단·표·범례·도면 제목칸은 넣지 않는다.',
            '- 이름(label)은 그림에 적힌 그대로(없으면 빈 문자열). 이름이 없는 보는 양 끝이 기둥이면 거더, 아니면 빔으로 본다.',
            '- box: [ymin, xmin, ymax, xmax], 그림 전체를 0~1000으로 나눈 정수.',
            '',
            '출력은 JSON 배열 하나만: [{"type":"기둥","label":"C1","box":[ymin,xmin,ymax,xmax]}, ...]. type은 기둥·거더·빔 중 하나.'
        ].join('\n');
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

    /**
     * 받은 상자 → 도면(쪽) 좌표 부재. crop = 그림으로 보낸 범위 { x0, y0, w, h }(쪽 좌표).
     * 보는 가로·세로 막대로 세우고 두께를 종류마다 하나(중간값)로, 그 다음 사이 기둥·거더에서 끊는다.
     * → [{ id, shape:'column'|'beam', type, label, x, y, w, h, ai:true }]
     */
    function toMembers(items, crop, opts) {
        var o = opts || {};
        var splitRun = o.splitRun || (root && root.BSA && root.BSA.structMembers && root.BSA.structMembers.splitRun);
        var sx = crop.w / 1000, sy = crop.h / 1000;
        var seq = 0, stamp = Number(o.now) || Date.now();
        var nid = function () { seq++; return 'sm_ai' + stamp + '_' + seq; };
        var rects = (items || []).map(function (it) {
            var b = it.box;
            var x0 = crop.x0 + b[1] * sx, x1 = crop.x0 + b[3] * sx, y0 = crop.y0 + b[0] * sy, y1 = crop.y0 + b[2] * sy;
            return { type: it.type, label: it.label || '', x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
        });
        var cols = rects.filter(function (r) { return r.type === '기둥'; });
        var beams = rects.filter(function (r) { return r.type !== '기둥'; });
        // 보 두께: 종류마다 짧은 변의 중간값(너무 두껍게 잡힌 상자도 막대로)
        var th = {};
        ['거더', '빔'].forEach(function (t) {
            var v = beams.filter(function (r) { return r.type === t; }).map(function (r) { return Math.min(r.w, r.h); });
            th[t] = median(v);
        });
        if (!th['거더']) th['거더'] = th['빔']; if (!th['빔']) th['빔'] = th['거더'];
        beams = beams.map(function (r) {
            var horiz = r.w >= r.h, t = th[r.type] || Math.min(r.w, r.h);
            return horiz ? Object.assign({}, r, { h: t }) : Object.assign({}, r, { w: t });
        });
        var out = cols.map(function (r) { return Object.assign({ id: nid(), shape: 'column', ai: true }, r); });
        var girders = beams.filter(function (r) { return r.type === '거더'; });
        beams.forEach(function (r) {
            var horiz = r.w >= r.h;
            var from = horiz ? r.x - r.w / 2 : r.y - r.h / 2, to = horiz ? r.x + r.w / 2 : r.y + r.h / 2;
            var segs = [{ from: from, to: to }];
            if (typeof splitRun === 'function') {
                var cutters = cols.concat(r.type === '빔' ? girders.filter(function (g) { return (g.w >= g.h) !== horiz; }) : []);
                segs = splitRun({ horiz: horiz, from: from, to: to, perp: horiz ? r.y : r.x, minLen: (horiz ? r.h : r.w) * 0.5 }, cutters);
            }
            segs.forEach(function (sg) {
                var c = (sg.from + sg.to) / 2, len = sg.to - sg.from;
                out.push(Object.assign({ id: nid(), shape: 'beam', ai: true, type: r.type, label: r.label },
                    horiz ? { x: c, y: r.y, w: len, h: r.h } : { x: r.x, y: c, w: r.w, h: len }));
            });
        });
        return out;
    }

    /** Gemini 부르기 → 답 글. image = { mimeType, base64 } */
    async function callGemini(key, image, opts) {
        var o = opts || {};
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + (o.model || MODEL) + ':generateContent?key=' + encodeURIComponent(key);
        var res = await (o.fetch || fetch)(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: buildPrompt() }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] }],
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

    var api = { MODEL: MODEL, TYPES: TYPES, buildPrompt: buildPrompt, parseResponse: parseResponse, toMembers: toMembers, callGemini: callGemini };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.structAi = api; }
})(typeof window !== 'undefined' ? window : null);
