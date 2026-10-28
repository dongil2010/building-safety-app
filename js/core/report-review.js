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

    // 자주 틀리는 표기 [찾을 말, 바꿀 말, 설명] — 2026-10-20 성광교회 검토에서 나온 것
    var TYPOS = [
        [/천정/, '천장', '표준어'],
        [/([가-힣]+)또는/, '$1 또는', '띄어쓰기'],
        [/경과\s+년\s*수/, '경과년수', '붙여 씀']
    ];

    var TEXT_FIELDS = [['location', '위치'], ['component', '부재'], ['defectType', '결함 종류'], ['cause', '원인'], ['sizeText', '규모']];

    function reviewRows(rows) {
        rows = Array.isArray(rows) ? rows : [];
        var out = [];

        rows.forEach(function (r) {
            if (!r) return;
            var dt = trim(r.defectType);
            var crack = isCrackType(dt);

            // ---- 빈칸 ----
            // 행·열을 설정해 둔 층(gridSet)은 위치를 안 적어도 된다(2026-10-28 사용자)
            var noLoc = !trim(r.location) && !r.gridSet, noComp = !trim(r.component);
            // 위치·부재가 다 비면 마킹만 하고 내용을 안 채운 것 — 칸마다 따로 띄우지 않고 한 줄로(2026-10-20 성광교회 외부 19곳)
            var emptyPin = noLoc && noComp;
            if (!dt) push(out, r, 'error', 'empty-type', '결함 종류가 비어 있습니다.');
            if (emptyPin) push(out, r, 'warn', 'empty-pin', '위치·부재가 비어 있습니다 — 마킹만 하고 내용을 안 채운 것 같습니다(한글엔 부재 「기둥」으로 나감).');
            else {
                if (noLoc) push(out, r, 'warn', 'empty-location', '위치가 비어 있습니다.');
                if (noComp) push(out, r, 'warn', 'empty-component', '부재가 비어 있습니다 — 한글에는 「기둥」으로 나갑니다.');
            }
            if (!r.good && dt && !trim(r.cause)) push(out, r, 'error', 'empty-cause', '원인이 비어 있습니다 — 한글에는 「건조수축」으로 나갑니다.');
            // 결함인데 원인이 「-」(물탱크 설치처럼 결함이 아닌 글이거나 원인을 안 적은 것)
            else if (!r.good && dt && /^[-–—]+$/.test(trim(r.cause))) push(out, r, 'error', 'dash-cause', '원인이 「-」입니다 — 결함이면 원인을, 결함이 아니면 결함 종류를 「상태양호」로.');

            // ---- 균열폭·길이·개수 ----
            var widths = (Array.isArray(r.widths) ? r.widths : []).map(trim).filter(Boolean);
            if (!r.good && crack && !emptyPin && !widths.length && !trim(r.sizeText).replace(/^-$/, '')) push(out, r, 'warn', 'empty-width', '균열인데 균열폭(규모)이 비어 있습니다.');
            // 균열이 아닌 것(이격 등)도 폭을 균열폭 칸에 적는다(2026-10-20 사용자) — 「균열 아닌데 폭」은 안 띄우고,
            // 크기 범위(>5mm·<0.01mm)도 균열만 본다(이격폭 20mm는 정상). 숫자 아님·0 이하는 다 본다.
            // 「이격균열」은 균열이라도 이격이라 큰 폭이 정상 — 너무 크다는 안 띄운다(성광교회 6.0mm)
            var gap = /이격/.test(squash(dt));
            var wName = crack ? '균열폭' : '폭';
            widths.forEach(function (w) {
                var ns = nums(w);   // 0.1~0.2 같은 범위는 양끝을 본다
                if (!ns) { push(out, r, 'error', 'width-nan', wName + ' 「' + w + '」이 숫자가 아닙니다.'); return; }
                var lo = Math.min.apply(null, ns), n = Math.max.apply(null, ns);
                if (lo <= 0) push(out, r, 'error', 'width-range', wName + '이 0 이하입니다(' + w + ').');
                else if (crack && !gap && n > CRACK_WIDTH_MAX_MM) push(out, r, 'warn', 'width-range', '균열폭 ' + w + ' — mm로 보기엔 너무 큽니다(cm·소수점 확인).');
                else if (crack && lo < CRACK_WIDTH_MIN_MM) push(out, r, 'warn', 'width-range', '균열폭 ' + w + ' — mm로 보기엔 너무 작습니다(m로 적었는지 확인).');
            });
            // 개수를 폭 칸에도 적음: 규모 「7EA」인데 폭 7.0(타일 파손·볼트 누락 등) — 한글 규모에 폭 숫자로 같이 나간다
            var eaM = s(r.sizeText).match(/(\d+(?:\.\d+)?)\s*(?:EA|개소|개)(?![A-Za-z가-힣])/i);
            if (eaM && !crack && widths.length === 1) {
                var wn = num(widths[0]);
                if (Number.isFinite(wn) && wn === parseFloat(eaM[1])) push(out, r, 'warn', 'count-in-width', '개수(' + trim(eaM[0]) + ')가 폭 칸에도 들어 있습니다(폭 ' + widths[0] + ') — 폭 칸은 비우세요.');
            }
            // 폭·길이가 바뀐 듯: 균열폭 2mm 이상인데 길이 0.3m 이하
            var lens = String(trim(r.crackLength)).split(/\s*[\/,]\s*/).filter(Boolean);
            if (crack && !gap && widths.length === 1 && lens.length === 1) {
                var wv = nums(widths[0]), lv = nums(lens[0]);
                if (wv && lv && Math.max.apply(null, wv) >= 2 && Math.max.apply(null, lv) <= 0.3) push(out, r, 'info', 'swap', '균열폭 ' + widths[0] + 'mm·길이 ' + lens[0] + 'm — 폭과 길이가 바뀌었는지 확인.');
            }
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

            // ---- 같은 말 두 번·띄어쓰기·메모 문구·오타·가운뎃점 ----
            TEXT_FIELDS.forEach(function (f) {
                var v = s(r[f[0]]);
                var rep = findRepeat(v);
                if (rep) push(out, r, 'warn', 'repeat', f[1] + '에 같은 말이 두 번 들어갔습니다: 「' + rep + '」');
                else if (/\S {2,}\S/.test(v)) push(out, r, 'info', 'space', f[1] + '에 띄어쓰기가 두 칸 이상입니다: 「' + v.trim() + '」');
                // 현장 메모가 남은 것: 「(추후 기재)」「(확인요)」
                // 「(균열폭 표시)」는 현장에 균열폭을 표시해 둔 결함이라 그대로 쓰는 표기다(2026-10-28 사용자) — 빼고 본다
                var memo = v.match(/\([^()]*(?:표시|기재|입력|작성|확인요|추후)[^()]*\)/);
                if (memo && /^\(\s*균열\s*폭\s*표시\s*\)$/.test(memo[0])) memo = null;
                if (memo) push(out, r, 'warn', 'memo-text', f[1] + '에 메모 문구가 남아 있습니다: 「' + memo[0] + '」');
                TYPOS.forEach(function (t) {
                    var m = v.match(t[0]);
                    if (m) push(out, r, 'info', 'typo', f[1] + ' 「' + m[0] + '」 → 「' + m[0].replace(t[0], t[1]) + '」' + (t[2] ? '(' + t[2] + ')' : '') + '.');
                });
                var dot = v.match(/[․•∙]/);
                if (dot) push(out, r, 'info', 'dot', f[1] + '에 가운뎃점이 「' + dot[0] + '」입니다 — 「·」로 맞추세요.');
            });
            // 칸 섞임: 부재 칸에 결함 글(「슬래브 콘크리트 파취 및…」「철골보 이음부 상태양호」)
            var comp = trim(r.component);
            var cm = comp.match(/상태양호|보수완료|균열|파취|박락|박리|탈락|누수|들뜸|파손|녹\s?발생/);
            if (cm) push(out, r, 'warn', 'mixed-field', '부재 칸에 결함 내용(「' + cm[0] + '」)이 들어 있습니다: 「' + comp + '」 — 결함 종류 칸으로.');
            // 결함 종류 칸에 치수(「높이 부족 H:630mm」)
            var dm = dt.match(/[HhLlWw]\s*[:：=]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)?|\d+(?:\.\d+)?\s*(?:mm|cm)(?![A-Za-z])/);
            if (dm) push(out, r, 'info', 'mixed-field', '결함 종류에 치수(「' + dm[0] + '」)가 들어 있습니다 — 규모 칸으로.');
        });

        // ---- 같은 층에 똑같은 행(복사 실수) ----
        var seen = {};
        rows.forEach(function (r) {
            // 상태양호·보수완료는 같은 자리·같은 글이 여러 번 나오는 게 정상(2026-10-20 사용자) — 빼고 본다
            if (!r || r.good || !trim(r.location)) return;
            var k = [r.floorCode, squash(r.location), squash(r.component), squash(r.defectType), squash(r.sizeText), (r.widths || []).join('/')].join('|');
            if (seen[k]) push(out, r, 'warn', 'dup-row', seen[k].no + '번과 위치·부재·결함·규모가 모두 같습니다(복사 실수인지 확인).');
            else seen[k] = r;
        });

        // ---- 위치만 다르고 부재·결함·폭·길이가 같은 행(복사 후 위치만 고친 듯, 성광교회 정원 옹벽/썬큰 옹벽) ----
        var seenM = {};
        rows.forEach(function (r) {
            if (!r || r.good || !trim(r.location)) return;
            var ws = (r.widths || []).map(trim).filter(Boolean).join('/'), ln = trim(r.crackLength);
            if (!ws || !ln) return;
            var k = [r.floorCode, squash(r.component), squash(r.defectType), ws, ln].join('|');
            var prev = seenM[k];
            if (prev && squash(prev.location) !== squash(r.location)) push(out, r, 'info', 'same-measure', prev.no + '번(' + trim(prev.location) + ')과 위치만 다르고 부재·결함·폭·길이가 같습니다 — 복사 후 안 고쳤는지 확인.');
            else if (!prev) seenM[k] = r;
        });

        // ---- 높이 단위 섞임: H:800mm / H:80cm ----
        var hUnits = {};
        rows.forEach(function (r) {
            if (!r) return;
            var m = (s(r.sizeText) + ' ' + s(r.defectType)).match(/[Hh]\s*[:：=]\s*\d+(?:\.\d+)?\s*(mm|cm|m)(?![A-Za-z])/);
            if (m) (hUnits[m[1].toLowerCase()] = hUnits[m[1].toLowerCase()] || []).push(r);
        });
        var hu = Object.keys(hUnits).sort(function (a, b) { return hUnits[b].length - hUnits[a].length; });
        hu.slice(1).forEach(function (u) {
            hUnits[u].forEach(function (r) { push(out, r, 'info', 'unit-mix', '높이 단위를 「' + u + '」로 썼습니다 — 다른 곳은 「' + hu[0] + '」(' + hUnits[hu[0]].length + '곳).'); });
        });

        // ---- 표기 통일: 띄어쓰기만 다른 같은 말(철근노출 / 철근 노출) — 건물 전체에서 적게 쓴 쪽을 알린다 ----
        [['defectType', '결함 종류'], ['cause', '원인'], ['component', '부재'], ['location', '위치']].forEach(function (f) {
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
