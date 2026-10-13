/**
 * 평가단위(2026-10-13) — 상태평가용 묶음. 조사표·번호·도면 출력은 지금처럼 층 단위 그대로.
 *
 * 1) 건물(회차) 설정: bldg.evalUnitPlan = { units:[{id,no,name}], floors:{ 층: {mode:'whole',unitId} | {mode:'split'} }, updatedAt }
 *    - 평가단위 1, 2, 3 … 개수를 정하고, 층마다 「통째로 단위 n」 또는 「층 나누기」.
 *    - 건물 정보와 같이 동기화(metaUpdatedAt 나중 것이 이김).
 * 2) 층 나누기한 층의 세부단위: state.evalUnits[층키] = [{ id, name:'1-1', parentUnitId, color, order, … }]
 *    - 결함: defect.evalUnitId = 세부단위 id. 세부단위는 그 층 안에서만(층 결함만 들어감).
 *    - 층 묶음(pack.evalUnits)에 실려 메모와 같은 규칙(updatedAt·묘비)으로 합친다.
 * 설정을 안 하면 아무것도 안 바뀐다.
 */
(function (root) {
    'use strict';

    var PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
    var MAX_NAME = 20;

    function cleanName(s) {
        return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    }

    function ensureMaps(st) {
        if (!st.evalUnits || typeof st.evalUnits !== 'object') st.evalUnits = {};
        if (!st.deletedEvalUnitIds || typeof st.deletedEvalUnitIds !== 'object') st.deletedEvalUnitIds = {};
        if (!st.deletedEvalUnitAt || typeof st.deletedEvalUnitAt !== 'object') st.deletedEvalUnitAt = {};
        return st;
    }

    /** 순서대로 정렬한 단위 목록 */
    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.evalUnits || {})[floorKey] || []).filter(function (u) { return u && u.id; })
            .slice().sort(function (a, b) {
                return (Number(a.order) || 0) - (Number(b.order) || 0) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
            });
    }

    function hasUnits(st, floorKey) { return listFor(st, floorKey).length > 0; }

    function findUnit(st, floorKey, id) {
        if (!id) return null;
        return listFor(st, floorKey).find(function (u) { return u.id === id; }) || null;
    }

    function nextDefaultName(st, floorKey) {
        var used = {};
        listFor(st, floorKey).forEach(function (u) { used[u.name] = true; });
        for (var i = 0; i < 26; i++) {
            var n = String.fromCharCode(65 + i);
            if (!used[n]) return n;
        }
        return 'U' + (listFor(st, floorKey).length + 1);
    }

    function createUnit(st, floorKey, opts) {
        if (!st || !floorKey) return null;
        ensureMaps(st);
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var list = listFor(st, floorKey);
        var name = cleanName(o.name) || nextDefaultName(st, floorKey);
        if (list.some(function (u) { return u.name === name; })) return null;
        var unit = {
            id: o.id || ('eu_' + now + '_' + Math.random().toString(36).slice(2, 8)),
            name: name,
            color: /^#[0-9a-f]{6}$/i.test(o.color || '') ? o.color : PALETTE[list.length % PALETTE.length],
            order: list.length ? Math.max.apply(null, list.map(function (u) { return Number(u.order) || 0; })) + 1 : 0,
            createdAt: now,
            updatedAt: now
        };
        if (o.parentUnitId) unit.parentUnitId = String(o.parentUnitId);
        if (!st.evalUnits[floorKey]) st.evalUnits[floorKey] = [];
        st.evalUnits[floorKey].push(unit);
        return unit;
    }

    /** patch: { name?, color? } → 바뀐 단위 또는 null(이름 겹침·변화 없음) */
    function updateUnit(st, floorKey, id, patch, now) {
        var u = findUnit(st, floorKey, id);
        if (!u || !patch) return null;
        var changed = false;
        if (patch.name != null) {
            var n = cleanName(patch.name);
            if (n && n !== u.name) {
                if (listFor(st, floorKey).some(function (x) { return x.id !== id && x.name === n; })) return null;
                u.name = n; changed = true;
            }
        }
        if (patch.color != null && /^#[0-9a-f]{6}$/i.test(patch.color) && patch.color !== u.color) {
            u.color = patch.color; changed = true;
        }
        if (!changed) return null;
        u.updatedAt = Math.max(Number(now) || Date.now(), (Number(u.updatedAt) || 0) + 1);
        return u;
    }

    /** 단위 지우기 + 묘비. 그 단위였던 결함은 미지정으로(바꾼 결함 수를 돌려준다) */
    function deleteUnit(st, floorKey, id, defects, now) {
        if (!st || !floorKey || !id) return -1;
        ensureMaps(st);
        var list = st.evalUnits[floorKey] || [];
        var rec = list.find(function (u) { return u && u.id === id; });
        if (!rec) return -1;
        st.evalUnits[floorKey] = list.filter(function (u) { return u && u.id !== id; });
        var ids = new Set(st.deletedEvalUnitIds[floorKey] || []);
        ids.add(id);
        st.deletedEvalUnitIds[floorKey] = Array.from(ids);
        if (!st.deletedEvalUnitAt[floorKey]) st.deletedEvalUnitAt[floorKey] = {};
        st.deletedEvalUnitAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        var moved = 0;
        (defects || []).forEach(function (d) {
            if (d && d.evalUnitId === id) { moved += assignOne(d, null, now); }
        });
        return moved;
    }

    function assignOne(d, unitId, now) {
        var cur = d.evalUnitId || null;
        var next = unitId || null;
        if (cur === next) return 0;
        if (next) d.evalUnitId = next; else delete d.evalUnitId;
        d.updatedAt = Math.max(Number(now) || Date.now(), (Number(d.updatedAt) || 0) + 1);
        return 1;
    }

    /** 결함들을 단위로(unitId null = 미지정). 바뀐 수 */
    function assign(defects, unitId, now) {
        var n = 0;
        (defects || []).forEach(function (d) { if (d) n += assignOne(d, unitId, now); });
        return n;
    }

    /** 결함의 단위(없거나 지워진 단위면 null = 미지정) */
    function unitOf(st, floorKey, defect) {
        return defect ? findUnit(st, floorKey, defect.evalUnitId) : null;
    }

    /** filter: '' 전체 | '__none__' 미지정 | 단위 id */
    function matchesFilter(st, floorKey, defect, filter) {
        if (!filter) return true;
        var u = unitOf(st, floorKey, defect);
        if (filter === '__none__') return !u;
        return !!(u && u.id === filter);
    }

    /** { byId: {id: n}, none: n, total: n } */
    function counts(st, floorKey, defects) {
        var out = { byId: {}, none: 0, total: 0 };
        listFor(st, floorKey).forEach(function (u) { out.byId[u.id] = 0; });
        (defects || []).forEach(function (d) {
            if (!d) return;
            out.total++;
            var u = unitOf(st, floorKey, d);
            if (u) out.byId[u.id]++; else out.none++;
        });
        return out;
    }

    /** 출력·평가에 쓰는 이름: 단위가 없으면 층 이름 그대로, 있으면 「1F-A」 */
    function groupLabel(floorLabel, unit) {
        var f = String(floorLabel == null ? '' : floorLabel);
        return unit ? (f + '-' + unit.name) : f;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (u) {
                var o = { id: u.id, name: u.name, color: u.color, order: Number(u.order) || 0, createdAt: u.createdAt || 0, updatedAt: u.updatedAt || 0 };
                if (u.parentUnitId) o.parentUnitId = u.parentUnitId;
                return o;
            }),
            deletedIds: ((st && st.deletedEvalUnitIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedEvalUnitAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length)));
    }

    /** 서버 층 묶음의 단위를 합친다(mergeNdtDataMaps). pack이 없으면(옛 버전) 그대로 둔다 */
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one(pack.items || []), st.evalUnits, one(pack.deletedIds || []), st.deletedEvalUnitIds,
            one(pack.deletedAt || {}), st.deletedEvalUnitAt);
        st.evalUnits = r.ndtData;
        st.deletedEvalUnitIds = r.deletedNdtIds;
        st.deletedEvalUnitAt = r.deletedNdtAt || {};
        return true;
    }

    /* ---------------- 건물(회차) 설정: 평가단위 1…n + 층별 통째/나누기 ---------------- */

    function planOf(bldg) {
        var p = bldg && bldg.evalUnitPlan;
        if (!p || typeof p !== 'object') return { units: [], floors: {}, updatedAt: 0 };
        return { units: Array.isArray(p.units) ? p.units : [], floors: (p.floors && typeof p.floors === 'object') ? p.floors : {}, updatedAt: Number(p.updatedAt) || 0 };
    }

    function hasPlan(bldg) { return planOf(bldg).units.length > 0; }

    function writePlan(bldg, plan, now) {
        plan.updatedAt = Math.max(Number(now) || Date.now(), (Number(bldg.evalUnitPlan && bldg.evalUnitPlan.updatedAt) || 0) + 1);
        bldg.evalUnitPlan = plan;
        return plan;
    }

    function clonePlan(bldg) {
        var p = planOf(bldg);
        var floors = {};
        Object.keys(p.floors).forEach(function (k) { floors[k] = Object.assign({}, p.floors[k]); });
        return { units: p.units.map(function (u) { return Object.assign({}, u); }), floors: floors, updatedAt: p.updatedAt };
    }

    /** 평가단위 개수 정하기. 줄이면 뒤 번호부터 빠지고, 그 단위를 쓰던 층 설정도 빠진다(반환: 빠진 층 수) */
    function setUnitCount(bldg, n, now) {
        if (!bldg) return -1;
        var count = Math.max(0, Math.min(50, Math.floor(Number(n) || 0)));
        var p = clonePlan(bldg);
        var units = [];
        for (var i = 1; i <= count; i++) {
            var old = p.units.find(function (u) { return Number(u.no) === i; });
            units.push(old || { id: 'unit' + i, no: i, name: '평가단위 ' + i });
        }
        var keep = {};
        units.forEach(function (u) { keep[u.id] = true; });
        var dropped = 0;
        Object.keys(p.floors).forEach(function (fc) {
            var f = p.floors[fc];
            if (f && f.mode === 'whole' && !keep[f.unitId]) { delete p.floors[fc]; dropped++; }
        });
        p.units = units;
        writePlan(bldg, p, now);
        return dropped;
    }

    function planUnit(bldg, unitId) {
        return planOf(bldg).units.find(function (u) { return u.id === unitId; }) || null;
    }

    /** 층 설정: mode 'whole'(unitId 필요) | 'split' | '' (설정 안 함) */
    function setFloorMode(bldg, floorCode, mode, unitId, now) {
        if (!bldg || !floorCode) return false;
        var p = clonePlan(bldg);
        if (mode === 'whole') {
            if (!planUnit(bldg, unitId)) return false;
            p.floors[floorCode] = { mode: 'whole', unitId: unitId };
        } else if (mode === 'split') {
            p.floors[floorCode] = { mode: 'split' };
        } else {
            delete p.floors[floorCode];
        }
        writePlan(bldg, p, now);
        return true;
    }

    function floorMode(bldg, floorCode) {
        var f = planOf(bldg).floors[floorCode];
        return f && (f.mode === 'whole' || f.mode === 'split') ? f : null;
    }

    /** 나눈 층에 세부단위 추가: 이름 「단위번호-k」(예: 1-1, 1-2) */
    function createSubUnit(st, floorKey, bldg, parentUnitId, now) {
        var pu = planUnit(bldg, parentUnitId);
        if (!pu) return null;
        var used = {};
        listFor(st, floorKey).forEach(function (u) { used[u.name] = true; });
        var k = 1;
        while (used[pu.no + '-' + k]) k++;
        return createUnit(st, floorKey, { name: pu.no + '-' + k, parentUnitId: pu.id, now: now });
    }

    /**
     * 상태평가 묶음 요약. floors: [{ floorCode, floorLabel, floorKey }]
     * 결과: { units: [{ unit, wholeFloors:[{floorCode,floorLabel,count}], subUnits:[{floorCode,floorLabel,sub,count}] }],
     *         unsetFloors:[…], unassigned:[{floorCode,floorLabel,count}] }  (unassigned = 나눈 층에서 세부단위 안 넣은 결함)
     */
    function summarize(bldg, st, floors) {
        var p = planOf(bldg);
        var out = { units: p.units.map(function (u) { return { unit: u, wholeFloors: [], subUnits: [] }; }), unsetFloors: [], unassigned: [] };
        var byId = {};
        out.units.forEach(function (r) { byId[r.unit.id] = r; });
        (floors || []).forEach(function (f) {
            var defects = ((st && st.defects) || {})[f.floorKey] || [];
            var m = p.floors[f.floorCode];
            if (m && m.mode === 'whole' && byId[m.unitId]) {
                byId[m.unitId].wholeFloors.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: defects.length });
            } else if (m && m.mode === 'split') {
                var c = counts(st, f.floorKey, defects);
                listFor(st, f.floorKey).forEach(function (su) {
                    var r = byId[su.parentUnitId];
                    if (r) r.subUnits.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, sub: su, count: c.byId[su.id] || 0 });
                });
                if (c.none) out.unassigned.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: c.none });
            } else {
                out.unsetFloors.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: defects.length });
            }
        });
        return out;
    }

    var api = {
        planOf: planOf,
        hasPlan: hasPlan,
        setUnitCount: setUnitCount,
        planUnit: planUnit,
        setFloorMode: setFloorMode,
        floorMode: floorMode,
        createSubUnit: createSubUnit,
        summarize: summarize,
        PALETTE: PALETTE,
        cleanName: cleanName,
        ensureMaps: ensureMaps,
        listFor: listFor,
        hasUnits: hasUnits,
        findUnit: findUnit,
        nextDefaultName: nextDefaultName,
        createUnit: createUnit,
        updateUnit: updateUnit,
        deleteUnit: deleteUnit,
        assign: assign,
        unitOf: unitOf,
        matchesFilter: matchesFilter,
        counts: counts,
        groupLabel: groupLabel,
        packFor: packFor,
        packHasContent: packHasContent,
        mergePackIntoState: mergePackIntoState
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.evalUnits = api;
    }
})(typeof window !== 'undefined' ? window : null);
