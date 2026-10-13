/**
 * 평가 부재 지정(2026-10-13) — 결함의 「평가 부재」(기둥·벽·거더·빔·슬래브)를 결함 자신의 부재 글과 따로 둔다.
 * d.evalMember: 확정값(없으면 부재 글로 추정, 화면에 흐리게)
 */
(function (root) {
    'use strict';
    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var KEYS = { c: '기둥', w: '벽', g: '거더', b: '빔', s: '슬래브' };
    var SHORT = { '기둥': 'C', '벽': 'W', '거더': 'G', '빔': 'B', '슬래브': 'S' };
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#0891b2', '슬래브': '#16a34a' };

    function sm() {
        if (root && root.BSA && root.BSA.safetymanExport) return root.BSA.safetymanExport;
        try { return require('./safetyman-export.js'); } catch (_e) { return null; }
    }
    function nmOf(d, memberName) {
        var c = d && d.component;
        return typeof memberName === 'function' ? (memberName(c) || c) : c;
    }
    /** { type, confirmed } — type null = 모름 */
    function stateOf(d, memberName) {
        var v = d && d.evalMember != null ? String(d.evalMember).trim() : '';
        if (TYPES.indexOf(v) >= 0) return { type: v, confirmed: true };
        var S = sm();
        var g = S ? S.memberType(nmOf(d, memberName)) : '기타';
        return { type: g && g !== '기타' ? g : null, confirmed: false };
    }
    function guess(d, memberName) { var s = stateOf(Object.assign({}, d, { evalMember: '' }), memberName); return s.type; }
    function assignOne(d, type, now) {
        var next = TYPES.indexOf(type) >= 0 ? type : '';
        var cur = TYPES.indexOf(d.evalMember) >= 0 ? d.evalMember : '';
        if (cur === next) return 0;
        if (next) d.evalMember = next; else delete d.evalMember;
        // 칸별 병합에서 이기도록 contentUpdatedAt·fieldAt도(eval-units touchFields와 같음)
        var t = Number(now) || Date.now();
        var prevContent = Number(d.contentUpdatedAt) || Number(d.updatedAt) || 0;
        var c = Math.max(t, (Number(d.contentUpdatedAt) || 0) + 1);
        if (!d.fieldAt || typeof d.fieldAt !== 'object') { d.fieldAt = {}; if (d.contentBaseAt == null) d.contentBaseAt = prevContent; }
        d.fieldAt.evalMember = c;
        d.fieldAtThrough = c;
        d.contentUpdatedAt = c;
        d.updatedAt = Math.max(t, (Number(d.updatedAt) || 0) + 1);
        return 1;
    }
    /** type 빈 값 = 확정 해제(추정으로) */
    function assign(defects, type, now) {
        var n = 0;
        (defects || []).forEach(function (d) { if (d) n += assignOne(d, type, now); });
        return n;
    }
    /** { byType: { 기둥: {confirmed, guessed} … }, none, confirmed, guessed, total } */
    function summarize(defects, memberName) {
        var out = { byType: {}, none: 0, confirmed: 0, guessed: 0, total: 0 };
        TYPES.forEach(function (t) { out.byType[t] = { confirmed: 0, guessed: 0 }; });
        (defects || []).forEach(function (d) {
            if (!d) return;
            out.total++;
            var s = stateOf(d, memberName);
            if (!s.type) { out.none++; return; }
            var b = out.byType[s.type] = out.byType[s.type] || { confirmed: 0, guessed: 0 };
            if (s.confirmed) { b.confirmed++; out.confirmed++; } else { b.guessed++; out.guessed++; }
        });
        return out;
    }
    var api = { TYPES: TYPES, KEYS: KEYS, SHORT: SHORT, COLORS: COLORS, stateOf: stateOf, guess: guess, assign: assign, summarize: summarize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.evalMember = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
