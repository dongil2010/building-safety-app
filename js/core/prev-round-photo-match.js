/**
 * 전차 사진 → 현차로 옮기기 — 전차(이전 회차 점검) 결함 ↔ 현차 결함 맞추기 (2026-09-30)
 *
 * 순수 함수(브라우저·Node 공용, 서버 읽기 없음). app.js 가 두 점검의 층별 결함을 넘기면
 * 「어느 전차 결함의 어느 사진을 어느 현차 결함에 넣을지」 계획만 만든다.
 *
 * 넣는 칸 (opts.mode)
 *  - 'cur'(기본): 현차 결함의 사진(photos/photoIds — 출력되는 사진) 맨 뒤에 붙인다.
 *    이미 옮긴 전차 사진(결함의 copiedPhotoSrcIds 에 원본 사진 ID가 있음)은 다시 넣지 않는다 → 두 번 눌러도 안 겹침.
 *    현차 사진이 이미 있는 결함도 넣는다(뒤에 붙임, existing 에 기존 장수).
 *  - 'prev': 현차 결함의 「전차 사진」 칸. 이미 전차 사진이 있으면 덮어쓰지 않고 건너뜀.
 *
 * 맞추는 규칙
 *  1) 같은 층 + 같은 번호(NO. — 통합 행은 01-2 처럼 가지 번호까지). 같은 번호가 여럿이면 마킹 위치가 가까운 쪽.
 *  2) 번호로 못 찾으면 같은 층에서 마킹 위치(화살표 끝)가 maxDist 안에 있는 가장 가까운 결함.
 *     비슷하게 가까운 후보가 둘 이상이면 틀릴 수 있어 맞추지 않는다(목록으로 보고).
 *  - 현차 결함 하나에는 전차 결함 하나만. 번호 맞춤을 먼저 다 하고 위치 맞춤을 한다(위치가 번호 짝을 뺏지 않게).
 *  - 건너뜀: 'cur' 는 옮길 사진을 모두 이미 옮김, 'prev' 는 이미 전차 사진이 있음.
 *  - 사진 없는 전차 결함은 옮길 것이 없어 계획에서 뺀다.
 */
(function (root) {
    'use strict';

    function noKey(d) {
        var raw = String((d && (d.groupNo || d.no)) || '').replace(/^NO\.?\s*/i, '').trim();
        // 통합 행(surveyExtra)은 자기 번호(01-2)가 groupNo 보다 정확하다
        if (d && d.surveyExtra && d.no) raw = String(d.no).replace(/^NO\.?\s*/i, '').trim();
        var m = raw.match(/(\d+)(?:-(\d+))?/);
        if (!m) return raw.toUpperCase();
        var suffix = m[2] ? ('-' + parseInt(m[2], 10)) : '';
        return String(parseInt(m[1], 10)) + suffix;
    }

    function anchor(d) {
        var x = Number(d && (d.targetX != null ? d.targetX : d.x));
        var y = Number(d && (d.targetY != null ? d.targetY : d.y));
        if (!isFinite(x) || !isFinite(y)) return null;
        return { x: x, y: y };
    }

    function dist(a, b) {
        if (!a || !b) return Infinity;
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function photoCount(d, kind) {
        if (!d) return 0;
        var ids = kind === 'prev' ? d.prevRoundPhotoIds : d.photoIds;
        var inline = kind === 'prev' ? d.prevRoundPhotos : d.photos;
        var a = Array.isArray(ids) ? ids.filter(Boolean).length : 0;
        var b = Array.isArray(inline) ? inline.filter(Boolean).length : 0;
        return Math.max(a, b);
    }

    /** 전차 결함 사진 i번째의 원본 ID(옮겼는지 기억하는 키). ID 목록이 없으면 옛 자리 번호(결함id_i). */
    function srcPhotoKeys(d) {
        var n = photoCount(d);
        var ids = Array.isArray(d && d.photoIds) ? d.photoIds : [];
        var out = [];
        for (var i = 0; i < n; i++) out.push(String(ids[i] || (d.id + '_' + i)));
        return out;
    }

    function copiedKeys(t) {
        return new Set((Array.isArray(t && t.copiedPhotoSrcIds) ? t.copiedPhotoSrcIds : []).map(String));
    }

    /** 현차 결함 t에 아직 안 옮긴 전차 사진 자리(0부터) */
    function pendingPhotoIndexes(s, t) {
        var done = copiedKeys(t);
        var out = [];
        srcPhotoKeys(s).forEach(function (k, i) { if (!done.has(k)) out.push(i); });
        return out;
    }

    /**
     * @param {Object} srcByFloor  { 층코드: [전차 결함] }  (현차 층코드로 이미 맞춘 것)
     * @param {Object} tgtByFloor  { 층코드: [현차 결함] }
     * @param {Object} [opts]      { maxDist: 120, ambiguousRatio: 1.25, mode: 'cur'|'prev' }
     * @returns {{matches:Array, skipped:Array, unmatched:Array, photoTotal:number, withExisting:number}}
     *   matches[i] = { floor, src, tgt, by: 'no'|'pos', photos, indexes, existing }
     *     indexes: 옮길 전차 사진 자리, existing: 넣을 칸에 이미 있는 사진 수('cur'이면 그 뒤에 붙음)
     *   skipped(= skippedHasPrev, 예전 이름) : 옮길 것 없음
     *   unmatched[i] = { floor, src, photos, reason }
     */
    function plan(srcByFloor, tgtByFloor, opts) {
        var o = opts || {};
        var maxDist = o.maxDist > 0 ? o.maxDist : 120;
        var ambiguousRatio = o.ambiguousRatio > 1 ? o.ambiguousRatio : 1.25;
        var mode = o.mode === 'prev' ? 'prev' : 'cur';
        var out = { mode: mode, matches: [], skipped: [], unmatched: [], photoTotal: 0, withExisting: 0 };
        out.skippedHasPrev = out.skipped;
        Object.keys(srcByFloor || {}).forEach(function (floor) {
            var sources = (srcByFloor[floor] || []).filter(function (d) { return d && photoCount(d) > 0; });
            if (!sources.length) return;
            var targets = ((tgtByFloor || {})[floor] || []).filter(function (d) { return d && d.id; });
            if (!targets.length) {
                sources.forEach(function (s) {
                    out.unmatched.push({ floor: floor, src: s, photos: photoCount(s), reason: '현차에 이 층이 없음(또는 결함 없음)' });
                });
                return;
            }
            var used = new Set();
            var pending = [];
            var claim = function (s, t, by) {
                used.add(t.id);
                var idx;
                if (mode === 'prev') {
                    if (photoCount(t, 'prev') > 0) {
                        out.skipped.push({ floor: floor, src: s, tgt: t, by: by, photos: photoCount(s), reason: '이미 전차 사진 있음' });
                        return;
                    }
                    idx = srcPhotoKeys(s).map(function (_k, i) { return i; });
                } else {
                    idx = pendingPhotoIndexes(s, t);
                    if (!idx.length) {
                        out.skipped.push({ floor: floor, src: s, tgt: t, by: by, photos: photoCount(s), reason: '이미 옮김' });
                        return;
                    }
                }
                var existing = mode === 'prev' ? 0 : photoCount(t);
                if (existing > 0) out.withExisting++;
                out.matches.push({ floor: floor, src: s, tgt: t, by: by, photos: idx.length, indexes: idx, existing: existing });
                out.photoTotal += idx.length;
            };
            // 1) 번호
            sources.forEach(function (s) {
                var k = noKey(s);
                var cands = k ? targets.filter(function (t) { return !used.has(t.id) && noKey(t) === k; }) : [];
                if (cands.length === 1) { claim(s, cands[0], 'no'); return; }
                if (cands.length > 1) {
                    var sa = anchor(s);
                    var sorted = cands.slice().sort(function (a, b) { return dist(sa, anchor(a)) - dist(sa, anchor(b)); });
                    var d0 = dist(sa, anchor(sorted[0]));
                    var d1 = dist(sa, anchor(sorted[1]));
                    if (isFinite(d0) && (!isFinite(d1) || d1 > d0 * ambiguousRatio)) { claim(s, sorted[0], 'no'); return; }
                    out.unmatched.push({ floor: floor, src: s, photos: photoCount(s), reason: '같은 번호가 여러 개라 고르지 못함' });
                    return;
                }
                pending.push(s);
            });
            // 2) 위치
            pending.forEach(function (s) {
                var sa = anchor(s);
                if (!sa) {
                    out.unmatched.push({ floor: floor, src: s, photos: photoCount(s), reason: '같은 번호 없음(마킹 위치도 없음)' });
                    return;
                }
                var near = targets.filter(function (t) { return !used.has(t.id); })
                    .map(function (t) { return { t: t, d: dist(sa, anchor(t)) }; })
                    .filter(function (x) { return x.d <= maxDist; })
                    .sort(function (a, b) { return a.d - b.d; });
                if (!near.length) {
                    out.unmatched.push({ floor: floor, src: s, photos: photoCount(s), reason: '같은 번호 없음 · 가까운 마킹 없음' });
                    return;
                }
                if (near.length > 1 && near[1].d <= Math.max(near[0].d * ambiguousRatio, near[0].d + 10)) {
                    out.unmatched.push({ floor: floor, src: s, photos: photoCount(s), reason: '같은 번호 없음 · 가까운 마킹이 여러 개' });
                    return;
                }
                claim(s, near[0].t, 'pos');
            });
        });
        return out;
    }

    var api = {
        plan: plan, noKey: noKey, anchor: anchor, photoCount: photoCount,
        srcPhotoKeys: srcPhotoKeys, pendingPhotoIndexes: pendingPhotoIndexes
    };
    if (!root.BSA) root.BSA = {};
    root.BSA.prevRoundPhotoMatch = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
