/**
 * 평가단위(2026-10-13) — 상태평가용 묶음. 조사표·번호·도면 출력은 지금처럼 층 단위 그대로.
 *
 * 1) 건물(회차) 설정: bldg.evalUnitPlan = { units:[{id,no,name}], floors:{ 층: {mode:'whole',unitId} | {mode:'split'} }, updatedAt }
 *    - 평가단위 1, 2, 3 … 개수를 정하고, 층마다 「통째로 단위 n」 또는 「층 나누기」.
 *    - 건물 정보와 같이 동기화(metaUpdatedAt 나중 것이 이김).
 * 2) 층 나누기한 층의 세부단위: state.evalUnits[층키] = [{ id, name:'1-1', parentUnitId, color, order, … }]
 *    - 결함: defect.evalUnitId = 세부단위 id. 세부단위는 그 층 안에서만(층 결함만 들어감).
 *    - 층 묶음(pack.evalUnits)에 실려 메모와 같은 규칙(updatedAt·묘비)으로 합친다.
 * 3) (2026-10-13 개편) 나누기 부분: bldg.evalUnitPlan.parts = [{id,no,name,note,unitId}] — 건물에서 한 번 정의(기존부/증축부 …),
 *    층 나누기는 floors[층] = {mode:'split', parts:[partId…]}. 층의 구역(state.evalUnits[층키]의 항목)은 partId를 가진다.
 *    구역의 평가단위 = 부분의 unitId(옛 구역은 parentUnitId). 다른 층 구역끼리 같은 평가단위가 될 수 있다.
 *    옛 1-1/1-2 세부단위는 migrateLegacy로 같은 이름의 부분으로 옮긴다(결함 evalUnitId는 그대로).
 * 4) (2026-10-13 단순화) 구역은 번호 1,2,3… 뿐. 층 구역 번호 n = 평가단위 n(층이 달라도 같은 번호면 같은 단위).
 *    plan.parts는 단위에서 자동으로 만든다: { id:'z'+n, no:n, name:String(n), unitId:단위 n }. 이름(선택)은 단위의 label.
 *    옛 1-1/1-2 세부단위와 이름 부분(기존부 …)은 normalize(=migrateLegacy)로 번호 구역으로 옮긴다.
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
        if (!p || typeof p !== 'object') return { units: [], parts: [], floors: {}, updatedAt: 0 };
        return { units: Array.isArray(p.units) ? p.units : [], parts: Array.isArray(p.parts) ? p.parts : [],
            floors: (p.floors && typeof p.floors === 'object') ? p.floors : {}, updatedAt: Number(p.updatedAt) || 0 };
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
        Object.keys(p.floors).forEach(function (k) {
            floors[k] = Object.assign({}, p.floors[k]);
            if (Array.isArray(floors[k].parts)) floors[k].parts = floors[k].parts.slice();
        });
        return { units: p.units.map(function (u) { return Object.assign({}, u); }), parts: p.parts.map(function (x) { return Object.assign({}, x); }),
            floors: floors, updatedAt: p.updatedAt };
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
        canonicalize(p);
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
            var prev = p.floors[floorCode];
            p.floors[floorCode] = { mode: 'split', parts: (prev && prev.mode === 'split' && Array.isArray(prev.parts)) ? prev.parts : [] };
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
                var lost = c.none;
                listFor(st, f.floorKey).forEach(function (su) {
                    var r = byId[zoneUnitId(bldg, su)];
                    if (r) r.subUnits.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, sub: su, label: zoneLabel(bldg, su), count: c.byId[su.id] || 0 });
                    else lost += c.byId[su.id] || 0;
                });
                if (lost) out.unassigned.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: lost });
            } else {
                out.unsetFloors.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: defects.length });
            }
        });
        return out;
    }


    /* ---------------- 번호 구역(2026-10-13 단순화) ---------------- */

    /** 단위마다 번호 구역 z{n}. 층 목록에서 없는 번호는 뺀다 */
    function canonicalize(p) {
        p.parts = p.units.map(function (u) { return { id: 'z' + u.no, no: Number(u.no), name: String(u.no), unitId: u.id }; });
        var ok = {};
        p.parts.forEach(function (x) { ok[x.id] = true; });
        Object.keys(p.floors).forEach(function (fc) {
            var f = p.floors[fc];
            if (f && f.mode === 'split') f.parts = (Array.isArray(f.parts) ? f.parts : []).filter(function (id) { return ok[id]; });
        });
        return p;
    }

    function isCanonical(p) {
        if (p.parts.length !== p.units.length) return false;
        return p.units.every(function (u, i) {
            var x = p.parts[i];
            return x && x.id === 'z' + u.no && x.name === String(u.no) && x.unitId === u.id && Object.keys(x).length === 4;
        });
    }

    /** 단위 이름(선택). 빈칸이면 번호만 */
    function setUnitLabel(bldg, unitId, label, now) {
        var p = clonePlan(bldg);
        var u = p.units.find(function (x) { return x.id === unitId; });
        if (!u) return false;
        var l = cleanName(label);
        if ((u.label || '') === l) return false;
        if (l) u.label = l; else delete u.label;
        writePlan(bldg, p, now);
        return true;
    }

    function unitTitle(u) { return u ? ('평가단위 ' + u.no + (u.label ? ' ' + u.label : '')) : ''; }

    /** 번호 n 구역 id */
    function zoneId(n) { return 'z' + n; }

    /**
     * 옛 자료 → 번호 구역. 옛 세부단위 「k-j」 → j번, 이름 부분(기존부 …) → 그 부분 번호(이름은 단위 label로).
     * 같은 층에서 같은 번호가 둘이면 하나로 합친다(결함은 남는 구역으로).
     * floors: [{floorCode, floorKey}] → { planChanged, floorKeys }
     */
    function normalize(bldg, st, floors, now) {
        var out = { planChanged: false, floorKeys: [] };
        if (!bldg || !st || !hasPlan(bldg)) return out;
        var t = Number(now) || Date.now();
        var p0 = planOf(bldg);
        var oldParts = {};
        p0.parts.forEach(function (x) { oldParts[x.id] = x; });
        var labels = {};
        p0.parts.forEach(function (x) {
            if (!/^z\d+$/.test(x.id) && x.name && !/^\d+(-\d+)?$/.test(x.name)) labels[Number(x.no)] = labels[Number(x.no)] || x.name;
        });
        var plans = [];
        var maxN = 0;
        (floors || []).forEach(function (f) {
            var zs = listFor(st, f.floorKey);
            if (!zs.length) return;
            var items = zs.map(function (z, i) {
                var n = 0;
                var m;
                if (z.partId && /^z(\d+)$/.test(z.partId)) n = Number(z.partId.slice(1));
                else if (z.partId && oldParts[z.partId]) {
                    var op = oldParts[z.partId];
                    m = String(op.name || '').match(/^\d+-(\d+)$/);
                    n = m ? Number(m[1]) : (Number(op.no) || 0);
                } else {
                    m = String(z.name || '').match(/^\d+-(\d+)$/);
                    if (m) n = Number(m[1]);
                    else { var pu = planUnit(bldg, z.parentUnitId); n = pu ? Number(pu.no) : 0; }
                }
                if (!n) n = i + 1;
                if (n > maxN) maxN = n;
                return { z: z, n: n };
            });
            plans.push({ f: f, items: items });
        });
        if (maxN > p0.units.length) { setUnitCount(bldg, maxN, t); out.planChanged = true; }
        var p = clonePlan(bldg);
        p.units.forEach(function (u) { if (!u.label && labels[u.no]) { u.label = labels[u.no]; out.planChanged = true; } });
        plans.forEach(function (pl) {
            var fk = pl.f.floorKey;
            var keepBy = {};
            var changed = false;
            pl.items.forEach(function (it) {
                var want = zoneId(it.n);
                if (keepBy[it.n]) {
                    assign((st.defects && st.defects[fk] || []).filter(function (d) { return d && d.evalUnitId === it.z.id; }), keepBy[it.n].id, t);
                    deleteUnit(st, fk, it.z.id, [], t);
                    changed = true;
                    return;
                }
                keepBy[it.n] = it.z;
                if (it.z.partId !== want || it.z.name !== String(it.n) || it.z.parentUnitId) {
                    it.z.partId = want;
                    it.z.name = String(it.n);
                    delete it.z.parentUnitId;
                    it.z.updatedAt = Math.max(t, (Number(it.z.updatedAt) || 0) + 1);
                    changed = true;
                }
            });
            var fm = p.floors[pl.f.floorCode];
            if (fm && fm.mode === 'split') {
                var ids = Object.keys(keepBy).map(Number).sort(function (a, b) { return a - b; }).map(zoneId);
                var cur = (fm.parts || []).filter(function (id) { return /^z\d+$/.test(id); });
                ids.forEach(function (id) { if (cur.indexOf(id) < 0) cur.push(id); });
                cur.sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); });
                if (JSON.stringify(cur) !== JSON.stringify(fm.parts || [])) { fm.parts = cur; out.planChanged = true; }
            }
            if (changed) out.floorKeys.push(fk);
        });
        if (!isCanonical(p)) { canonicalize(p); out.planChanged = true; }
        if (out.planChanged) writePlan(bldg, p, t);
        return out;
    }

    /* ---------------- (옛) 이름 부분 — 단순화 뒤에도 옛 자료 읽기용으로 남김 ---------------- */

    function partOf(bldg, partId) {
        if (!partId) return null;
        return planOf(bldg).parts.find(function (x) { return x.id === partId; }) || null;
    }

    /** 부분 추가: 기본 평가단위 = 부분 번호와 같은 번호의 단위(없으면 첫 단위) */
    function addPart(bldg, opts, now) {
        if (!bldg) return null;
        var o = opts || {};
        var p = clonePlan(bldg);
        var name = cleanName(o.name);
        var no = p.parts.reduce(function (m, x) { return Math.max(m, Number(x.no) || 0); }, 0) + 1;
        if (!name) name = '부분 ' + no;
        if (p.parts.some(function (x) { return x.name === name; })) return null;
        var unit = (o.unitId && p.units.find(function (u) { return u.id === o.unitId; }))
            || p.units.find(function (u) { return Number(u.no) === no; }) || p.units[0] || null;
        var part = { id: o.id || ('part_' + (Number(now) || Date.now()) + '_' + Math.random().toString(36).slice(2, 6)), no: no, name: name,
            note: String(o.note == null ? '' : o.note).slice(0, 80), unitId: unit ? unit.id : '' };
        p.parts.push(part);
        writePlan(bldg, p, now);
        return part;
    }

    /** patch: { name?, note?, unitId? } */
    function updatePart(bldg, partId, patch, now) {
        var p = clonePlan(bldg);
        var x = p.parts.find(function (q) { return q.id === partId; });
        if (!x || !patch) return null;
        if (patch.name != null) {
            var n = cleanName(patch.name);
            if (!n || p.parts.some(function (q) { return q.id !== partId && q.name === n; })) return null;
            x.name = n;
        }
        if (patch.note != null) x.note = String(patch.note).slice(0, 80);
        if (patch.unitId != null) {
            if (patch.unitId && !p.units.some(function (u) { return u.id === patch.unitId; })) return null;
            x.unitId = patch.unitId;
        }
        writePlan(bldg, p, now);
        return x;
    }

    /** 부분 지우기: 층 목록에서도 뺀다. 그 부분 구역의 결함은 평가단위 없음(미설정)으로 보인다 */
    function removePart(bldg, partId, now) {
        var p = clonePlan(bldg);
        if (!p.parts.some(function (q) { return q.id === partId; })) return false;
        p.parts = p.parts.filter(function (q) { return q.id !== partId; });
        Object.keys(p.floors).forEach(function (fc) {
            var f = p.floors[fc];
            if (f && Array.isArray(f.parts)) f.parts = f.parts.filter(function (id) { return id !== partId; });
        });
        writePlan(bldg, p, now);
        return true;
    }

    function floorParts(bldg, floorCode) {
        var f = floorMode(bldg, floorCode);
        return (f && f.mode === 'split' && Array.isArray(f.parts)) ? f.parts.slice() : [];
    }

    /** 층에 있는 부분 정하기(층은 「나누기」가 된다) */
    function setFloorParts(bldg, floorCode, partIds, now) {
        if (!bldg || !floorCode) return false;
        var p = clonePlan(bldg);
        var ok = {};
        p.parts.forEach(function (x) { ok[x.id] = true; });
        var ids = [];
        (partIds || []).forEach(function (id) { if (ok[id] && ids.indexOf(id) < 0) ids.push(id); });
        p.floors[floorCode] = { mode: 'split', parts: ids };
        writePlan(bldg, p, now);
        return true;
    }

    function zoneForPart(st, floorKey, partId) {
        return listFor(st, floorKey).find(function (z) { return z.partId === partId; }) || null;
    }

    /** 층에 고른 부분마다 구역이 있게 만든다(새로 만든 구역 수) */
    function ensureZones(st, floorKey, bldg, floorCode, now) {
        var made = 0;
        floorParts(bldg, floorCode).forEach(function (pid, i) {
            if (zoneForPart(st, floorKey, pid)) return;
            var part = partOf(bldg, pid);
            if (!part) return;
            var name = part.name;
            var k = 2;
            while (listFor(st, floorKey).some(function (z) { return z.name === name; })) name = part.name + '(' + (k++) + ')';
            var z = createUnit(st, floorKey, { name: name, now: (Number(now) || Date.now()) + i,
                color: PALETTE[((Number(part.no) || 1) - 1) % PALETTE.length] });
            if (z) { z.partId = pid; made++; }
        });
        return made;
    }

    /** 구역의 평가단위 id: 부분의 단위 → 옛 구역은 parentUnitId */
    function zoneUnitId(bldg, zone) {
        if (!zone) return '';
        if (zone.partId) { var part = partOf(bldg, zone.partId); return part ? (part.unitId || '') : ''; }
        return zone.parentUnitId || '';
    }

    /** 화면 이름: 부분 이름(바꾸면 바로 따라감) */
    function zoneLabel(bldg, zone) {
        if (!zone) return '';
        if (zone.partId && /^z\d+$/.test(zone.partId)) return zone.partId.slice(1);
        var part = zone.partId ? partOf(bldg, zone.partId) : null;
        return part ? part.name : zone.name;
    }

    /**
     * 옛 세부단위(1-1, 1-2 … partId 없음) → 같은 이름의 부분으로. 결함 evalUnitId는 그대로.
     * floors: [{floorCode, floorKey}] → { planChanged, floorKeys:[바뀐 층키] }
     */
    function migrateLegacyNamed(bldg, st, floors, now) {
        var out = { planChanged: false, floorKeys: [] };
        if (!bldg || !st) return out;
        var t = Number(now) || Date.now();
        (floors || []).forEach(function (f) {
            var legacy = listFor(st, f.floorKey).filter(function (z) { return !z.partId; });
            if (!legacy.length) return;
            var ids = floorParts(bldg, f.floorCode);
            legacy.forEach(function (z) {
                var part = planOf(bldg).parts.find(function (x) { return x.name === z.name; });
                if (!part) part = addPart(bldg, { name: z.name, unitId: z.parentUnitId || '' }, t);
                if (!part) return;
                if (z.parentUnitId && !part.unitId && planUnit(bldg, z.parentUnitId)) updatePart(bldg, part.id, { unitId: z.parentUnitId }, t);
                z.partId = part.id;
                z.updatedAt = Math.max(t, (Number(z.updatedAt) || 0) + 1);
                if (ids.indexOf(part.id) < 0) ids.push(part.id);
            });
            setFloorParts(bldg, f.floorCode, ids, t);
            out.planChanged = true;
            out.floorKeys.push(f.floorKey);
        });
        return out;
    }

    /**
     * 설정 화면 표: 층 × 부분 → 평가단위, 건수.
     * [{ floorCode, floorLabel, floorKey, mode, unitId, total, none, cells:{ partId: { on, zoneId, count, unitId } } }]
     */
    function matrix(bldg, st, floors) {
        var p = planOf(bldg);
        return (floors || []).map(function (f) {
            var defects = ((st && st.defects) || {})[f.floorKey] || [];
            var m = p.floors[f.floorCode];
            var row = { floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey, mode: m ? m.mode : '', unitId: m && m.mode === 'whole' ? m.unitId : '',
                total: defects.length, none: 0, cells: {} };
            if (m && m.mode === 'split') {
                var c = counts(st, f.floorKey, defects);
                row.none = c.none;
                var on = floorParts(bldg, f.floorCode);
                p.parts.forEach(function (x) {
                    var z = zoneForPart(st, f.floorKey, x.id);
                    row.cells[x.id] = { on: on.indexOf(x.id) >= 0, zoneId: z ? z.id : '', count: z ? (c.byId[z.id] || 0) : 0, unitId: x.unitId || '' };
                });
            }
            return row;
        });
    }

    var api = {
        partOf: partOf, addPart: addPart, updatePart: updatePart, removePart: removePart, floorParts: floorParts,
        setFloorParts: setFloorParts, zoneForPart: zoneForPart, ensureZones: ensureZones, zoneUnitId: zoneUnitId, zoneLabel: zoneLabel,
        migrateLegacy: normalize, normalize: normalize, setUnitLabel: setUnitLabel, unitTitle: unitTitle, zoneId: zoneId, matrix: matrix,
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
