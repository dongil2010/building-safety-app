/**
 * 부재 수 세기(2026-10-13) — 도면을 눌러 기둥·벽·거더·빔·슬래브 점을 찍어 부재 개수를 센다.
 * 결함이 아니다: 결함 번호·조사표·한글/PDF 출력에 안 들어간다(화면 전용 점).
 *
 * state.memberCounts[층키] = [{ id, type, x, y, zoneNo?, createdAt, updatedAt }]
 *   - x,y: 도면 원본 픽셀 좌표. zoneNo: 번호로 나눈 층에서 구역 번호(층 전체면 비움)
 *   - 층 묶음(pack.memberCounts)에 실어 메모·평가단위와 같은 규칙(updatedAt·묘비)으로 합친다.
 */
(function (root) {
    'use strict';

    var TYPES = ['기둥', '벽', '거더', '빔', '슬래브'];
    var KEYS = { c: '기둥', w: '벽', g: '거더', b: '빔', s: '슬래브' };
    var COLORS = { '기둥': '#dc2626', '벽': '#7c3aed', '거더': '#2563eb', '빔': '#0891b2', '슬래브': '#16a34a' };
    var SHORT = { '기둥': 'C', '벽': 'W', '거더': 'G', '빔': 'B', '슬래브': 'S' };

    function ensureMaps(st) {
        if (!st.memberCounts || typeof st.memberCounts !== 'object') st.memberCounts = {};
        if (!st.deletedMemberCountIds || typeof st.deletedMemberCountIds !== 'object') st.deletedMemberCountIds = {};
        if (!st.deletedMemberCountAt || typeof st.deletedMemberCountAt !== 'object') st.deletedMemberCountAt = {};
        return st;
    }

    /** 저장된 것 전부(손 점 + 자동 점 빼기 기록 exclude:true) — 묶음·동기화용 */
    function rawFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.memberCounts || {})[floorKey] || []).filter(function (d) { return d && d.id && TYPES.indexOf(d.type) >= 0; });
    }
    /** 손 점(세는 점)만 */
    function listFor(st, floorKey) {
        return rawFor(st, floorKey).filter(function (d) { return !d.exclude; });
    }
    /** 2026-10-14 지우개로 지운 자동 점 = 빼기 기록 { id:'mcx_…', exclude:true, srcIds:[결함 id…], type, x, y } */
    function excludesFor(st, floorKey) {
        return rawFor(st, floorKey).filter(function (d) { return d.exclude; });
    }
    function excludedSrcIds(st, floorKey) {
        var set = {};
        excludesFor(st, floorKey).forEach(function (d) { (d.srcIds || []).forEach(function (k) { set[k] = true; }); });
        return set;
    }
    function addExclude(st, floorKey, dot, opts) {
        if (!st || !floorKey || !dot || !dot.srcIds || !dot.srcIds.length) return null;
        var o = opts || {};
        var rec = add(st, floorKey, dot.type, dot.x, dot.y, { id: o.id || ('mcx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)), now: o.now });
        if (!rec) return null;
        rec.exclude = true;
        rec.srcIds = dot.srcIds.slice();
        return rec;
    }

    /** 점 하나 추가 → 점 */
    function add(st, floorKey, type, x, y, opts) {
        if (!st || !floorKey || TYPES.indexOf(type) < 0) return null;
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        ensureMaps(st);
        var o = opts || {};
        var now = Number(o.now) || Date.now();
        var d = { id: o.id || ('mc_' + now + '_' + Math.random().toString(36).slice(2, 8)), type: type,
            x: Math.round(Number(x) * 10) / 10, y: Math.round(Number(y) * 10) / 10, createdAt: now, updatedAt: now };
        var zn = Math.floor(Number(o.zoneNo) || 0);
        if (zn > 0) d.zoneNo = zn;
        if (!st.memberCounts[floorKey]) st.memberCounts[floorKey] = [];
        st.memberCounts[floorKey].push(d);
        // 되살리기(되돌리기)면 묘비를 걷는다
        var ids = st.deletedMemberCountIds[floorKey];
        if (ids && ids.indexOf(d.id) >= 0) {
            st.deletedMemberCountIds[floorKey] = ids.filter(function (k) { return k !== d.id; });
            if (st.deletedMemberCountAt[floorKey]) delete st.deletedMemberCountAt[floorKey][d.id];
        }
        return d;
    }

    /** 점 지우기 + 묘비 → 지운 점(되돌리기용) 또는 null */
    function remove(st, floorKey, id) {
        if (!st || !floorKey || !id) return null;
        ensureMaps(st);
        var list = st.memberCounts[floorKey] || [];
        var rec = list.find(function (d) { return d && d.id === id; });
        if (!rec) return null;
        st.memberCounts[floorKey] = list.filter(function (d) { return d && d.id !== id; });
        var ids = st.deletedMemberCountIds[floorKey] || [];
        if (ids.indexOf(id) < 0) ids = ids.concat([id]);
        st.deletedMemberCountIds[floorKey] = ids;
        if (!st.deletedMemberCountAt[floorKey]) st.deletedMemberCountAt[floorKey] = {};
        st.deletedMemberCountAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return rec;
    }

    /** 화면 좌표로 가장 가까운 점(반지름 r 안). toScreen(d) → {sx, sy} */
    function hitTest(list, sx, sy, r, toScreen) {
        var best = null, bd = Infinity;
        (list || []).forEach(function (d) {
            var p = toScreen(d);
            var dist = Math.hypot(p.sx - sx, p.sy - sy);
            if (dist <= r && dist < bd) { bd = dist; best = d; }
        });
        return best;
    }

    /** 층 안 종류별 순번(점에 찍는 숫자) { id: n } */
    function seqNumbers(list) {
        var n = {};
        var out = {};
        (list || []).slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); }).forEach(function (d) {
            n[d.type] = (n[d.type] || 0) + 1;
            out[d.id] = n[d.type];
        });
        return out;
    }

    function countsByType(list) {
        var out = {};
        TYPES.forEach(function (t) { out[t] = 0; });
        (list || []).forEach(function (d) { if (out[d.type] != null) out[d.type]++; });
        return out;
    }

    /* ---------------- 자동 점(2026-10-14): 양호·구조 결함 마킹 → 부재 수 ----------------
     * 저장하지 않고 그때그때 계산한다(마킹을 넣고 지우면 바로 따라감, 동기화·묘비 없음). 손으로 찍은 점은 그대로.
     * 세는 마킹: 분류 '구조체' + 부재가 기둥·거더·빔·벽·슬래브 그 자체(접합부·조적 등 제외)
     *   + (상태양호 마킹 또는 결함 종류에 구조 결함 낱말이 든 마킹)
     * 한 부재 = 한 개: 같은 그룹(번호) 마킹, 같은 종류로 가까운(AUTO_MERGE_PX) 마킹, 같은 종류 손 점 가까이 있는 마킹은 하나로 본다. */
    var STRUCT_DEFECT_WORDS = ['균열', '누수', '백태', '철근노출', '철근 노출', '노출', '공극', '파손', '결손', '박리', '박락', '층분리', '들뜸',
        '처짐', '녹', '부식', '재료분리', '단면손실', '단면 손실', '변형', '좌굴', '침하', '탈락', '곰보', '콜드조인트', '재료 분리'];
    var AUTO_MERGE_PX = 40;
    function isGoodType(t) { return String(t || '').indexOf('상태양호') >= 0; }
    function isStructuralDefectType(t) {
        var s = String(t || '');
        if (!s || isGoodType(s)) return false;
        return STRUCT_DEFECT_WORDS.some(function (w) { return s.indexOf(w) >= 0; });
    }
    /** 부재 명칭 → 부재 수 종류(없으면 '') */
    function memberTypeOfComponent(comp) {
        var c = String(comp || '').replace(/\s+/g, '');
        if (!c || c.indexOf('접합') >= 0 || c.indexOf('-') >= 0 || c.indexOf('조적') >= 0) return '';
        if (c.indexOf('기둥') >= 0) return '기둥';
        if (c.indexOf('슬래브') >= 0) return '슬래브';
        if (/\(G\)|거더|큰보/i.test(c)) return '거더';
        if (/\(B\)|빔|작은보|캔틸레버보/i.test(c)) return '빔';
        if (/벽체$|^벽$|내력벽|옹벽|전단벽|RC벽/.test(c)) return '벽';
        return '';   // 그냥 '보'(G/B 미지정)·계단·기초·기타는 세지 않음
    }
    function defectPoint(d) {
        var x = Number(d.targetX), y = Number(d.targetY);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x: x, y: y };
        x = Number(d.x); y = Number(d.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { x: x, y: y };
        return null;
    }
    /** 이 마킹이 부재 수에 들어가면 종류, 아니면 '' */
    function autoTypeOfDefect(d) {
        if (!d || d.mapUnregistered === true || d.deleted) return '';
        if ((d.category || '구조체') !== '구조체') return '';
        var t = memberTypeOfComponent(d.component);
        if (!t) return '';
        return (isGoodType(d.defectType) || isStructuralDefectType(d.defectType)) ? t : '';
    }
    /**
     * 자동 점 목록 [{ id:'auto_<결함id>', type, x, y, zoneNo?, auto:true, srcIds:[] }]
     * opts.zoneNoOf(defect) → 구역 번호(나눈 층), opts.mergePx
     */
    function autoDots(defects, manual, opts) {
        var o = opts || {};
        var R = Number(o.mergePx) || AUTO_MERGE_PX;
        var out = [];
        var byGroup = {};
        (defects || []).forEach(function (d) {
            var type = autoTypeOfDefect(d);
            if (!type) return;
            var p = defectPoint(d);
            if (!p) return;
            var gk = d.groupId ? type + '|' + d.groupId : '';
            if (gk && byGroup[gk]) { byGroup[gk].srcIds.push(d.id); return; }
            var zn = typeof o.zoneNoOf === 'function' ? Math.floor(Number(o.zoneNoOf(d)) || 0) : 0;
            var near = function (q) { return q.type === type && Math.hypot(q.x - p.x, q.y - p.y) <= R && (!zn || !q.zoneNo || Number(q.zoneNo) === zn); };
            if ((manual || []).some(near)) return;          // 손으로 찍은 점이 이미 있음
            var dup = out.find(near);
            if (dup) { dup.srcIds.push(d.id); if (gk) byGroup[gk] = dup; return; }
            var dot = { id: 'auto_' + d.id, type: type, x: p.x, y: p.y, auto: true, srcIds: [d.id], createdAt: Number(d.mapMarkedAt) || Number(d.updatedAt) || 0 };
            if (zn > 0) dot.zoneNo = zn;
            out.push(dot);
            if (gk) byGroup[gk] = dot;
        });
        return out;
    }
    /** 손 점 + 자동 점 */
    function listWithAuto(st, floorKey, opts) {
        var manual = listFor(st, floorKey);
        var ex = excludedSrcIds(st, floorKey);
        var defects = (((st && st.defects) || {})[floorKey] || []).filter(function (d) { return d && !ex[d.id]; });
        return manual.concat(autoDots(defects, manual, opts));
    }

    /**
     * 평가단위별 부재 수: { unitId: { 기둥: n, … } }
     * 층 전체 → 그 층 점 모두. 번호로 나눈 층 → 점의 zoneNo 단위(번호 없는 점은 unassigned).
     * E: eval-units api. → { byUnit, unassigned:[{floorCode, floorLabel, count}] }
     */
    function unitCounts(bldg, st, floors, E) {
        var out = { byUnit: {}, unassigned: [] };
        if (!E || !bldg) return out;
        var plan = E.planOf(bldg);
        var byNo = {};
        plan.units.forEach(function (u) { byNo[Number(u.no)] = u; });
        var bump = function (unitId, type) {
            var r = out.byUnit[unitId] = out.byUnit[unitId] || countsByType([]);
            r[type] = (r[type] || 0) + 1;
        };
        (floors || []).forEach(function (f) {
            var zoneNoOf = null;
            if (E && typeof E.unitOf === 'function' && typeof E.zoneUnitId === 'function') {
                zoneNoOf = function (d) {
                    var z = E.unitOf(st, f.floorKey, d);
                    var uid = z ? E.zoneUnitId(bldg, z) : '';
                    var u = uid && plan.units.find(function (x) { return x.id === uid; });
                    return u ? Number(u.no) : 0;
                };
            }
            var list = listWithAuto(st, f.floorKey, { zoneNoOf: zoneNoOf });
            if (!list.length) return;
            var m = plan.floors[f.floorCode];
            var lost = 0;
            list.forEach(function (d) {
                if (m && m.mode === 'whole' && plan.units.some(function (u) { return u.id === m.unitId; })) bump(m.unitId, d.type);
                else if (m && m.mode === 'split' && d.zoneNo && byNo[d.zoneNo]) bump(byNo[d.zoneNo].id, d.type);
                else lost++;
            });
            if (lost) out.unassigned.push({ floorCode: f.floorCode, floorLabel: f.floorLabel, count: lost });
        });
        return out;
    }

    function packFor(st, floorKey) {
        return {
            items: rawFor(st, floorKey).map(function (d) { return Object.assign({}, d); }),
            deletedIds: ((st && st.deletedMemberCountIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedMemberCountAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        return !!(pack && ((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length)));
    }

    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var one = function (v) { var o = {}; o[floorKey] = v; return o; };
        var r = mergeFn(one(pack.items || []), st.memberCounts, one(pack.deletedIds || []), st.deletedMemberCountIds,
            one(pack.deletedAt || {}), st.deletedMemberCountAt);
        st.memberCounts = r.ndtData;
        st.deletedMemberCountIds = r.deletedNdtIds;
        st.deletedMemberCountAt = r.deletedNdtAt || {};
        return true;
    }

    var api = { TYPES: TYPES, KEYS: KEYS, COLORS: COLORS, SHORT: SHORT, ensureMaps: ensureMaps, listFor: listFor, rawFor: rawFor, excludesFor: excludesFor, excludedSrcIds: excludedSrcIds, addExclude: addExclude, add: add, remove: remove,
        hitTest: hitTest, seqNumbers: seqNumbers, autoDots: autoDots, listWithAuto: listWithAuto, autoTypeOfDefect: autoTypeOfDefect, memberTypeOfComponent: memberTypeOfComponent, isStructuralDefectType: isStructuralDefectType, STRUCT_DEFECT_WORDS: STRUCT_DEFECT_WORDS, countsByType: countsByType, unitCounts: unitCounts,
        packFor: packFor, packHasContent: packHasContent, mergePackIntoState: mergePackIntoState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.memberCount = api; }
})(typeof window !== 'undefined' ? window : null);
