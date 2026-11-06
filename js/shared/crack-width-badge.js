/**
 * 도면 마킹 균열폭 배지 — 순수 계산 (DOM 없음, 2026-11-06 t592u)
 *
 * 화면 번호칸에만 쓴다. 저장값·PDF/한글 레이아웃은 바꾸지 않는다.
 * 균열 계열 + 파싱된 폭 ≥ 0.3mm 만 "0.3mm" / "0.3mm / 0.5mm" 형태로.
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
        return String(d.defectType || d.type || '').indexOf('균열') >= 0;
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
        return t + 'mm';
    }

    function meetsMinWidth(n) {
        return n != null && Number.isFinite(n) && (n + EPS) >= MIN_MM;
    }

    function collectWidthParts(d) {
        if (!d) return [];
        if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
            return d.crackMeasures.map(function (m) {
                return String(m && m.width != null ? m.width : '').trim();
            }).filter(Boolean);
        }
        var raw = String(d.crackWidth != null ? d.crackWidth : '').trim();
        if (raw) {
            return raw.split(/\s*[\/,]\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
        }
        var size = String(d.size || '').trim();
        if (!size || size === '-') return [];
        var patterns = [
            /(?:W\s*=\s*|폭\s*[:=]?\s*|Cw\s*[:=]\s*)(\d+(?:[.,]\d+)?)\s*(?:mm|㎜)?/i,
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
        var parts = collectWidthParts(d);
        var out = [];
        var seen = Object.create(null);
        for (var i = 0; i < parts.length; i++) {
            var n = parseCrackWidthMm(parts[i]);
            if (!meetsMinWidth(n)) continue;
            var label = formatWidthMm(n);
            if (!label || seen[label]) continue;
            seen[label] = true;
            out.push(label);
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
