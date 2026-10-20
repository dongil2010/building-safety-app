/**
 * 선택된 마킹 먼저 잡기(2026-10-20)
 * 마킹을 눌러 고른 뒤 그 근처를 눌러 끌면 옆의 다른 마킹·박스가 잡히던 문제.
 * 고른 마킹의 화살표 끝·NO.박스·지시선에서 넉넉한 거리(pad) 안이면 그 마킹을 먼저 돌려준다.
 * cands: [{ id, tip:{x,y}|null, tipR, box:{cx,cy,w,h,rot}|null, leader:{x1,y1,x2,y2}|null }]
 * 반환 { id, part:'TIP'|'BOX', dist } | null
 */
(function (root) {
    'use strict';
    function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        var t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    function boxDist(px, py, b) {
        var rad = ((b.rot || 0) * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
        var dx = px - b.cx, dy = py - b.cy;
        var lx = Math.abs(dx * c - dy * s) - b.w / 2, ly = Math.abs(dx * s + dy * c) - b.h / 2;
        return Math.hypot(Math.max(lx, 0), Math.max(ly, 0));   // 박스 안이면 0
    }
    function claimSelected(px, py, cands, pad) {
        var best = null;
        (cands || []).forEach(function (c) {
            if (!c || !c.id) return;
            var tipD = c.tip ? Math.hypot(px - c.tip.x, py - c.tip.y) : Infinity;
            var boxD = c.box ? boxDist(px, py, c.box) : Infinity;
            var r = null;
            if (tipD <= (c.tipR || 0) + pad) r = { id: c.id, part: 'TIP', dist: tipD };
            if (boxD <= pad && (!r || boxD === 0 || boxD < tipD)) r = { id: c.id, part: 'BOX', dist: boxD };
            if (!r && c.leader) {
                var ld = segDist(px, py, c.leader.x1, c.leader.y1, c.leader.x2, c.leader.y2);
                if (ld <= pad) {
                    // 지시선 위: 가까운 끝으로(박스 쪽이면 박스, 화살표 쪽이면 끝)
                    r = { id: c.id, part: tipD < Math.hypot(px - c.leader.x1, py - c.leader.y1) ? 'TIP' : 'BOX', dist: ld };
                }
            }
            if (r && (!best || r.dist < best.dist)) best = r;
        });
        return best;
    }
    var api = { claimSelected: claimSelected, segDist: segDist, boxDist: boxDist };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.selectedHit = api; }
})(typeof window !== 'undefined' ? window : globalThis);
