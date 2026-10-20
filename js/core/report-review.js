/**
 * 한글(상태조사표) 출력 전 규칙 검토(2026-10-20) — 순수 계산 모듈(DOM 없음).
 * 보고서 미리보기 「검토」 단추가 층마다 조사표 행을 넘겨 주면, 이상해 보이는 칸을 목록으로 돌려준다.
 * 고치지는 않는다(사람이 보고 판단). 상태양호·보수완료 같은 양호 행은 원인·균열폭 같은 「빠진 것」 검사에서 뺀다.
 *
 * 행 하나 = { id, floorCode, floorLabel, no, good, location, component, defectType, cause,
 *            widths:[균열폭 글자…], crackLength, itemCount, sizeText }
 * 결과 하나 = { level:'error'|'warn'|'info', rule, floorCode, floorLabel, no, id, msg }
 * 브라우저(window.BsaReportReview)·node(require) 둘 다.
 */
(function (root) {
    'use strict';

    function s(v) { return v == null ? '' : String(v); }
    function trim(v) { return s(v).trim(); }
    function squash(v) { return s(v).replace(/\s+/g, ''); }
    /** "0.3mm" "0.3㎜" "0,3" → 0.3 (숫자가 아니면 NaN) */
    function num(v) {
        var t = trim(v).replace(/mm|㎜|m|ｍ/gi, '').replace(/,/g, '.').trim();
        if (!t) return NaN;
        return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : NaN;
    }
    /** 범위로 적은 값도 받는다(2026-10-20 사용자: 「0.1~0.2」): "0.1~0.2" "0.1～0.2mm" "0.1-0.2" → [0.1, 0.2], 숫자 아니면 null */
    function nums(v) {
        var t = trim(v);
        if (!t) return null;
        var parts = t.split(/\s*[~～∼〜]\s*|(?:(?<=\d)\s*-\s*(?=[\d.]))/);
        var out = parts.map(num);
        return out.length && out.every(Number.isFinite) ? out : null;
    }
    function isCrackType(t) { return /균열/.test(squash(t)); }

    // 균열폭(mm): 이보다 크면 단위(cm·m)나 소수점 실수를 의심
    var CRACK_WIDTH_MAX_MM = 5;
    // 이보다 작으면 m 단위로 적은 것 같다(0.0003 등)
    var CRACK_WIDTH_MIN_MM = 0.01;
    // 균열 길이(m): 이보다 길면 확인
    var CRACK_LENGTH_MAX_M = 30;

    /** 같은 말이 붙어서 두 번: "균열 균열", "기둥기둥", "mm mm", ",," */
    function findRepeat(text) {
        var t = s(text);
        if (!t) return '';
        var toks = t.split(/\s+/).filter(Boolean);
        for (var i = 1; i < toks.length; i++) {
            if (toks[i] === toks[i - 1] && toks[i].length >= 1 && /[가-힣A-Za-z㎜㎡]/.test(toks[i])) return toks[i] + ' ' + toks[i];
        }
        var m = t.match(/([가-힣]{2,})\1/);
        if (m) return m[0];
        m = t.match(/(mm|㎜|㎡|m2|EA|개소)\s*\1/i);
        if (m) return m[0];
        m = t.match(/([,.\/·])\s*\1/);
        if (m) return m[0];
        return '';
    }

    function push(out, r, level, rule, msg) {
        out.push({ level: level, rule: rule, floorCode: r.floorCode || '', floorLabel: r.floorLabel || r.floorCode || '', no: s(r.no), id: r.id || '', msg: msg });
    }

    var TEXT_FIELDS = [['location', '위치'], ['component', '부재'], ['defectType', '결함 종류'], ['cause', '원인'], ['sizeText', '규모']];

    function reviewRows(rows) {
        rows = Array.isArray(rows) ? rows : [];
        var out = [];

        rows.forEach(function (r) {
            if (!r) return;
            var dt = trim(r.defectType);
            var crack = isCrackType(dt);

            // ---- 빈칸 ----
            if (!dt) push(out, r, 'error', 'empty-type', '결함 종류가 비어 있습니다.');
            if (!trim(r.location)) push(out, r, 'warn', 'empty-location', '위치가 비어 있습니다.');
            if (!trim(r.component)) push(out, r, 'warn', 'empty-component', '부재가 비어 있습니다 — 한글에는 「기둥」으로 나갑니다.');
            if (!r.good && dt && !trim(r.cause)) push(out, r, 'error', 'empty-cause', '원인이 비어 있습니다 — 한글에는 「건조수축」으로 나갑니다.');

            // ---- 균열폭·길이·개수 ----
            var widths = (Array.isArray(r.widths) ? r.widths : []).map(trim).filter(Boolean);
            if (!r.good && crack && !widths.length && !trim(r.sizeText).replace(/^-$/, '')) push(out, r, 'warn', 'empty-width', '균열인데 균열폭(규모)이 비어 있습니다.');
            // 균열이 아닌 것(이격 등)도 폭을 균열폭 칸에 적는다(2026-10-20 사용자) — 「균열 아닌데 폭」은 안 띄우고,
            // 크기 범위(>5mm·<0.01mm)도 균열만 본다(이격폭 20mm는 정상). 숫자 아님·0 이하는 다 본다.
            var wName = crack ? '균열폭' : '폭';
            widths.forEach(function (w) {
                var ns = nums(w);   // 0.1~0.2 같은 범위는 양끝을 본다
                if (!ns) { push(out, r, 'error', 'width-nan', wName + ' 「' + w + '」이 숫자가 아닙니다.'); return; }
                var lo = Math.min.apply(null, ns), n = Math.max.apply(null, ns);
                if (lo <= 0) push(out, r, 'error', 'width-range', wName + '이 0 이하입니다(' + w + ').');
                else if (crack && n > CRACK_WIDTH_MAX_MM) push(out, r, 'warn', 'width-range', '균열폭 ' + w + ' — mm로 보기엔 너무 큽니다(cm·소수점 확인).');
                else if (crack && lo < CRACK_WIDTH_MIN_MM) push(out, r, 'warn', 'width-range', '균열폭 ' + w + ' — mm로 보기엔 너무 작습니다(m로 적었는지 확인).');
            });
            String(trim(r.crackLength)).split(/\s*[\/,]\s*/).filter(Boolean).forEach(function (l) {
                var ns = nums(l);
                if (!ns) { push(out, r, 'error', 'length-nan', '균열 길이 「' + l + '」이 숫자가 아닙니다.'); return; }
                var n = Math.max.apply(null, ns);
                if (Math.min.apply(null, ns) <= 0) push(out, r, 'error', 'length-range', '균열 길이가 0 이하입니다(' + l + ').');
                else if (n > CRACK_LENGTH_MAX_M) push(out, r, 'warn', 'length-range', '균열 길이 ' + l + 'm — 너무 깁니다(mm·cm로 적었는지 확인).');
            });
            String(trim(r.itemCount)).split(/\s*[\/,]\s*/).filter(Boolean).forEach(function (c) {
                var n = num(c);
                if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) push(out, r, 'warn', 'count', '개수 「' + c + '」이 1 이상의 정수가 아닙니다.');
            });

            // ---- 같은 말 두 번·띄어쓰기 ----
            TEXT_FIELDS.forEach(function (f) {
                var v = s(r[f[0]]);
                var rep = findRepeat(v);
                if (rep) push(out, r, 'warn', 'repeat', f[1] + '에 같은 말이 두 번 들어갔습니다: 「' + rep + '」');
                else if (/\S {2,}\S/.test(v)) push(out, r, 'info', 'space', f[1] + '에 띄어쓰기가 두 칸 이상입니다: 「' + v.trim() + '」');
            });
        });

        // ---- 같은 층에 똑같은 행(복사 실수) ----
        var seen = {};
        rows.forEach(function (r) {
            if (!r || !trim(r.location)) return;
            var k = [r.floorCode, squash(r.location), squash(r.component), squash(r.defectType), squash(r.sizeText), (r.widths || []).join('/')].join('|');
            if (seen[k]) push(out, r, 'warn', 'dup-row', seen[k].no + '번과 위치·부재·결함·규모가 모두 같습니다(복사 실수인지 확인).');
            else seen[k] = r;
        });

        // ---- 표기 통일: 띄어쓰기만 다른 같은 말(철근노출 / 철근 노출) — 건물 전체에서 적게 쓴 쪽을 알린다 ----
        [['defectType', '결함 종류'], ['cause', '원인'], ['component', '부재']].forEach(function (f) {
            var groups = {};
            rows.forEach(function (r) {
                var v = trim(r && r[f[0]]);
                if (!v) return;
                var k = squash(v);
                (groups[k] = groups[k] || {})[v] = ((groups[k] || {})[v] || 0) + 1;
            });
            Object.keys(groups).forEach(function (k) {
                var g = groups[k], vars = Object.keys(g);
                if (vars.length < 2) return;
                vars.sort(function (a, b) { return g[b] - g[a]; });
                var main = vars[0];
                rows.forEach(function (r) {
                    var v = trim(r && r[f[0]]);
                    if (v && v !== main && squash(v) === k) push(out, r, 'info', 'variant', f[1] + ' 「' + v + '」 — 다른 곳은 「' + main + '」(' + g[main] + '곳)로 썼습니다.');
                });
            });
        });

        // ---- 단위 표기 섞임(규모 칸): ㎡와 m2, ㎜와 mm ----
        [[/㎡/, /m2|m\^2/i, '㎡', 'm2'], [/㎜/, /mm/i, '㎜', 'mm']].forEach(function (u) {
            var a = rows.filter(function (r) { return r && u[0].test(s(r.sizeText)); });
            var b = rows.filter(function (r) { return r && u[1].test(s(r.sizeText)); });
            if (!a.length || !b.length) return;
            var minor = a.length < b.length ? a : b, label = a.length < b.length ? u[2] : u[3], other = a.length < b.length ? u[3] : u[2];
            minor.forEach(function (r) { push(out, r, 'info', 'unit-mix', '규모 단위를 「' + label + '」로 썼습니다 — 다른 곳은 「' + other + '」.'); });
        });

        var order = { error: 0, warn: 1, info: 2 };
        return out.sort(function (x, y) { return (order[x.level] - order[y.level]); });
    }

    var api = { reviewRows: reviewRows, findRepeat: findRepeat, num: num, nums: nums, CRACK_WIDTH_MAX_MM: CRACK_WIDTH_MAX_MM, CRACK_LENGTH_MAX_M: CRACK_LENGTH_MAX_M };
    root.BsaReportReview = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
