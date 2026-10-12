/**
 * 부동침하(바닥레벨) 측기 이동 보정 — 계산 전용 (2026-10-12 다시 설계)
 *
 * 사용자가 적은 레벨(point.level)은 절대 고치지 않는다. 화면·입력칸은 적은 값 그대로.
 * 측기를 옮긴 지점에는 point.xfer = { va, vb } 만 둔다.
 *   va: 그 지점을 옮기기 전 측기로 잰 값, vb: 옮긴 뒤 측기로 잰 값
 * 계산(변위량·등급·그래프)은 correctedLevels()로 그때그때 한다.
 *   offset은 앞에서부터 누적: 이동 지점 j를 지나면 offset += (vb_j − va_j)
 *   이동 지점 j의 보정값 = va_j − (j 앞까지의 offset)   (적은 값이 vb든 비었든 상관없음)
 *   그 밖의 지점 i 보정값 = level_i − (i까지의 offset)
 * → 이동 지점을 몇 개든, 어떤 순서로 적든, 나중에 적은 값도 자동으로 보정된다.
 *
 * 옛 방식(9/18~): 「적용」이 level을 직접 바꾸고 levelRaw·stationTransfers에 기록을 남겼다.
 * migrateLegacyGroup()이 levelRaw로 원래 값을 되살리고 stationTransfers의 va/vb를 xfer로 옮긴다
 * (보정은 계산 때만 하므로 두 번 빠지지 않는다).
 */
(function (root) {
    'use strict';

    function filled(v) {
        return !(v === null || v === undefined || v === '') && Number.isFinite(Number(v));
    }

    function xferOf(p) {
        var x = p && p.xfer;
        if (!x || !filled(x.va) || !filled(x.vb)) return null;
        return { va: Number(x.va), vb: Number(x.vb) };
    }

    /** 보정한 레벨 배열(못 구하면 null). 원본은 안 건드린다. */
    function correctedLevels(group) {
        var pts = (group && group.points) || [];
        var offset = 0;
        return pts.map(function (p) {
            var x = xferOf(p);
            if (x) {
                var v = x.va - offset;
                offset += (x.vb - x.va);
                return round(v);
            }
            if (!p || !filled(p.level)) return null;
            return round(Number(p.level) - offset);
        });
    }

    function round(v) { return Math.round(v * 1e6) / 1e6; }

    function hasTransfers(group) {
        return ((group && group.points) || []).some(function (p) { return !!xferOf(p); });
    }

    /** 보정값이 적은 값과 다른 지점만 { i: 값 } */
    function correctedDiffs(group) {
        var out = {};
        var c = correctedLevels(group);
        ((group && group.points) || []).forEach(function (p, i) {
            if (c[i] == null) return;
            if (!filled(p.level) || Math.abs(Number(p.level) - c[i]) > 1e-9) out[i] = c[i];
        });
        return out;
    }

    function setTransfer(group, index, va, vb) {
        var p = group && group.points && group.points[index];
        if (!p) return { ok: false, reason: 'bad-overlap' };
        if (!filled(va) || !filled(vb)) return { ok: false, reason: 'bad-levels' };
        p.xfer = { va: Number(va), vb: Number(vb), at: Date.now() };
        return { ok: true, delta: Number(vb) - Number(va) };
    }

    function clearTransfer(group, index) {
        var p = group && group.points && group.points[index];
        if (!p || !p.xfer) return false;
        delete p.xfer;
        return true;
    }

    /**
     * 옛 「적용」으로 바뀐 값 되돌리기. 바꾼 게 있으면 true.
     * - levelRaw가 있는 지점: 그게 처음 적은 값 → level로
     * - stationTransfers[k].overlapPointId 지점: xfer = { va, vb } (이미 xfer가 있으면 그대로)
     */
    function migrateLegacyGroup(group) {
        if (!group || !Array.isArray(group.points)) return false;
        var changed = false;
        var hops = Array.isArray(group.stationTransfers) ? group.stationTransfers : [];
        group.points.forEach(function (p) {
            if (!p) return;
            if (p.levelRaw !== undefined && p.levelRaw !== null && p.levelRaw !== '') {
                p.level = filled(p.levelRaw) ? Number(p.levelRaw) : p.level;
                delete p.levelRaw;
                changed = true;
            } else if (p.levelRaw !== undefined) {
                delete p.levelRaw;
                changed = true;
            }
            if (p.levelAtA !== undefined) { delete p.levelAtA; changed = true; }
        });
        hops.forEach(function (h) {
            if (!h) return;
            var idx = group.points.findIndex(function (p) { return p && p.id === h.overlapPointId; });
            if (idx < 0) idx = Number(h.overlapIndex);
            var p = group.points[idx];
            if (!p || xferOf(p) || !filled(h.va) || !filled(h.vb)) return;
            p.xfer = { va: Number(h.va), vb: Number(h.vb), at: Number(h.appliedAt) || 0 };
            changed = true;
        });
        if (Array.isArray(group.stationTransfers)) {
            delete group.stationTransfers;
            changed = true;
        }
        if (group.transferOverlapPointId !== undefined) { delete group.transferOverlapPointId; changed = true; }
        return changed;
    }

    var api = {
        correctedLevels: correctedLevels,
        correctedDiffs: correctedDiffs,
        hasTransfers: hasTransfers,
        setTransfer: setTransfer,
        clearTransfer: clearTransfer,
        migrateLegacyGroup: migrateLegacyGroup,
        xferOf: xferOf
    };
    root.BSA = root.BSA || {};
    root.BSA.ndtDispTransfer = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
