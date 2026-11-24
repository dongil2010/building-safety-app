/**
 * 도면 마킹 균열폭 배지 — 순수 계산 (DOM 없음, 2026-11-06 t592u)
 *
 * 화면 번호칸에만 쓴다. 저장값·PDF/한글 레이아웃은 바꾸지 않는다.
 * 균열 계열(2026-11-24 이격 포함) + 파싱된 폭 ≥ 0.3mm 만 "0.3" / "0.3 / 0.5" 형태로.
 * 2026-11-10 「mm는 자르고」 — 배지에는 숫자만(단위 mm 생략).
 */
(function (root) {
    'use strict';

    var PREF_KEY = 'bsa_map_crack_width_badge_v1';
    var MIN_MM = 0.3;
    var EPS = 1e-9;

    function readPref(storage) {
        try {
            var ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
            if (!ls) return true;
            return ls.getItem(PREF_KEY) !== '0';
        } catch (_e) {
            return true;
        }
    }

    function writePref(on, storage) {
        try {
            var ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
            if (ls) ls.setItem(PREF_KEY, on ? '1' : '0');
        } catch (_e) { /* 기기 저장 실패해도 화면 토글은 동작 */ }
    }

    function isCrackDefect(d) {
        if (!d) return false;
        // 2026-11-24 「이격도 균열폭 보이게」 — 이격(이격폭)도 균열폭 칸에 적으므로 배지에 띄운다
        var t = String(d.defectType || d.type || '');
        return t.indexOf('균열') >= 0 || t.indexOf('이격') >= 0;
    }

    /** 옛 자료 포함: "0.3", "0.3mm", "0.3㎜", "Cw:0.3", "0,3", "폭:0.5" */
    function parseCrackWidthMm(raw) {
        var s = String(raw == null ? '' : raw).trim();
        if (!s || s === '-') return null;
        s = s.replace(/^\s*Cw\s*[:=]\s*/i, '');
        s = s.replace(/mm|㎜/ig, '');
        s = s.replace(/,/g, '.');
        var m = s.match(/-?\d+(?:\.\d+)?/);
        if (!m) return null;
        var n = parseFloat(m[0]);
        if (!Number.isFinite(n) || n < 0) return null;
        return n;
    }

    function formatWidthMm(n) {
        if (!Number.isFinite(n) || n < 0) return '';
        var t = String(Math.round(n * 1000) / 1000);
        if (t.indexOf('e') >= 0 || t.indexOf('E') >= 0) {
            t = n.toFixed(3);
        }
        if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
        if (t.indexOf('.') < 0) t += '.0'; // 2026-11-10 「1은 1.0으로」 — 정수는 소수 한 자리
        return t; // 배지에는 숫자만(mm 생략)
    }

    function meetsMinWidth(n) {
        return n != null && Number.isFinite(n) && (n + EPS) >= MIN_MM;
    }

    /** 규모 글자에 이 값으로 시작하는 면적 조각(0.3x0.5)이 있는가 — 면적(가로x세로)은 균열폭이 아니다 */
    function isAreaWidthInSize(size, widthRaw) {
        var w = parseCrackWidthMm(widthRaw);
        if (w == null) return false;
        var re = /(\d+(?:[.,]\d+)?)\s*[x×*]\s*\d+(?:[.,]\d+)?/ig, m;
        var str = String(size || '');
        while ((m = re.exec(str))) {
            if (Math.abs(parseFloat(m[1].replace(',', '.')) - w) < EPS) return true;
        }
        return false;
    }

    /** 2026-11-11 「0.1 ~ 0.5」 같은 범위·여러 값 표기를 낱개로 나눈다 (~ 뒤 값도 본다) */
    // 2026-11-16 「0.3~0.5」는 범위라 배지에도 ~ 로 — 묶음(/ , 로 나뉜 덩어리) 안의 ~ 앞뒤 값은 한 묶음
    function splitWidthGroups(raw) {
        return String(raw == null ? '' : raw).trim()
            .split(/\s*[\/,]\s*/)
            .map(function (g) {
                return g.split(/\s*(?:[~∼〜～–]|-(?=\s|\d|\.))\s*/)
                    .map(function (s) { return s.trim(); })
                    .filter(Boolean);
            })
            .filter(function (g) { return g.length; });
    }

    function collectWidthGroups(d) {
        if (!d) return [];
        // 2026-11-10 면적용(가로x세로)으로 넣은 값(0.3x0.5)은 배지에 안 나오게 — 측정 행 구분이 x이거나 규모 글자가 면적이면 뺀다
        if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
            var out = [];
            d.crackMeasures.forEach(function (m) {
                if (!m) return;
                if (/^[x×*]$/i.test(String(m.join || '').trim())) return;
                if (isAreaWidthInSize(d.size, m.width)) return;
                splitWidthGroups(m.width).forEach(function (g) { out.push(g); });
            });
            return out;
        }
        var raw = String(d.crackWidth != null ? d.crackWidth : '').trim();
        if (raw) {
            return splitWidthGroups(raw).map(function (g) {
                return g.filter(function (w) { return !isAreaWidthInSize(d.size, w); });
            }).filter(function (g) { return g.length; });
        }
        var p = collectWidthParts(d, true);
        return p.map(function (w) { return [w]; });
    }

    function collectWidthParts(d, sizeOnly) {
        if (!d) return [];
        if (!sizeOnly) {
            var flat = [];
            collectWidthGroups(d).forEach(function (g) { g.forEach(function (w) { flat.push(w); }); });
            return flat;
        }
        var size = String(d.size || '').trim();
        if (!size || size === '-') return [];
        var patterns = [
            /(?:W\s*=\s*|폭\s*[:=]?\s*|이격\s*[:=]?\s*|Cw\s*[:=]\s*)(\d+(?:[.,]\d+)?)\s*(?:mm|㎜)?/i,
            /^(\d+(?:[.,]\d+)?)\s*(?:mm|㎜)\b/i,
            /^(\d+(?:[.,]\d+)?)\s*\/\s*\d+/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var m = size.match(patterns[i]);
            if (m) return [m[1]];
        }
        return [];
    }

    function formatBadgeText(d) {
        if (!isCrackDefect(d)) return '';
        var groups = collectWidthGroups(d);
        var out = [];
        var seen = Object.create(null);
        for (var gi = 0; gi < groups.length; gi++) {
            var labels = [];
            for (var i = 0; i < groups[gi].length; i++) {
                var n = parseCrackWidthMm(groups[gi][i]);
                if (!meetsMinWidth(n)) continue;
                var label = formatWidthMm(n);
                if (!label || seen[label]) continue;
                seen[label] = true;
                labels.push(label);
            }
            if (labels.length) out.push(labels.join('~'));
        }
        return out.join(' / ');
    }

    function shouldShow(d, opts) {
        opts = opts || {};
        if (opts.toggleOn === false) return false;
        return !!formatBadgeText(d);
    }

    /**
     * 박스 로컬 좌표에서 균열폭 배지 자리.
     * 중요(좌상)와 겹치면 박스 오른쪽 바깥으로 민다. 중요는 자리를 바꾸지 않음.
     * 반환: { cx, cy, textW, glyphH, outsideRight }
     */
    function layout(boxW, boxH, scale, text, hasBookmark, measureWidthFn) {
        var glyphH = 2 * Math.max(8, 10 * Math.max(0.85, Number(scale) || 1)) / 3;
        var textW = 0;
        if (typeof measureWidthFn === 'function') {
            textW = Number(measureWidthFn(text, glyphH)) || 0;
        }
        if (!(textW > 0)) textW = Math.max(glyphH, String(text || '').length * glyphH * 0.62);
        var cx = boxW / 2;
        var cy = -boxH / 2;
        var outsideRight = false;
        if (hasBookmark) {
            var bookmarkW = glyphH * 2.2;
            if ((bookmarkW / 2) + (textW / 2) > boxW - 1) {
                cx = boxW / 2 + textW / 2 + Math.max(2, glyphH * 0.15);
                outsideRight = true;
            }
        }
        return { cx: cx, cy: cy, textW: textW, glyphH: glyphH, outsideRight: outsideRight };
    }

    function badgeExtentExtra(boxW, scale, text, hasBookmark, measureWidthFn) {
        if (!text) {
            return hasBookmark ? { w: (2 * Math.max(8, 10 * Math.max(0.85, Number(scale) || 1)) / 3) * 2.2, h: 2 * Math.max(8, 10 * Math.max(0.85, Number(scale) || 1)) / 3, right: 0 } : null;
        }
        var L = layout(boxW, 0, scale, text, !!hasBookmark, measureWidthFn);
        var badge = { w: hasBookmark ? L.glyphH * 2.2 : 0, h: L.glyphH, right: L.outsideRight ? (L.cx + L.textW / 2 - (boxW / 2)) : (L.textW / 2) };
        return badge;
    }

    var api = {
        PREF_KEY: PREF_KEY,
        MIN_MM: MIN_MM,
        readPref: readPref,
        writePref: writePref,
        isCrackDefect: isCrackDefect,
        parseCrackWidthMm: parseCrackWidthMm,
        formatWidthMm: formatWidthMm,
        meetsMinWidth: meetsMinWidth,
        collectWidthParts: collectWidthParts,
        formatBadgeText: formatBadgeText,
        shouldShow: shouldShow,
        layout: layout,
        badgeExtentExtra: badgeExtentExtra
    };
    root.BSA = root.BSA || {};
    root.BSA.crackWidthBadge = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
