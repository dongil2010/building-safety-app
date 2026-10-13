/**
 * SAFETY357(평가 탭) 자동 채움(2026-10-13).
 * 평가단위 = SAFETY357 건물 1개, 그 단위의 층 = 표본층 1개, 부재 = 기둥·내력벽·큰보·작은보·슬래브.
 * 도면에서 나오는 값만 채운다: 확인부재 수(부재 수 점·직접 입력만 — 양호 부재도 있으니 결함으로 늘리지 않음) · 결함 등급별 부재 수(B~E).
 * 양호(A) = 확인부재 − 결함 부재(최소 0). 결함이 확인부재보다 많으면 경고만 하고 총수는 올리지 않는다.
 * 사용자가 고친 칸은 건드리지 않는다(지난번 자동값과 같을 때만 새 자동값으로 바꿈).
 * 점수·가중치·등급 계산은 여기 없음 — SAFETY357 번들(grades/safetymanWeights/conditionAggregate) 한 곳에만 있다.
 */
(function (root) {
    'use strict';
    var MEMBER_MAP = { '기둥': '기둥', '벽': '내력벽', '거더': '큰보', '빔': '작은보', '슬래브': '슬래브' };
    var S357_MEMBERS = ['기둥', '내력벽', '큰보', '작은보', '슬래브'];
    var GRADE_FIELDS = ['crackGrades', 'leakGrades', 'rebarGrades', 'spallingGrades', 'scalingGrades'];

    function txt(v) { return v == null ? '' : String(v).trim(); }

    /** 결함 → { field, grade } | { field, grade:null, why } (null = 못 정함) */
    function classify(d, S) {
        var k = S.defectKind(d);
        if (k === 'crack') {
            var w = S.crackWidthOf(d);
            if (w == null) return { field: 'crackGrades', grade: null, why: 'noWidth' };
            if (w < 0.1) return { field: 'crackGrades', grade: 'A' };
            if (w < 0.2) return { field: 'crackGrades', grade: 'B' };
            if (w < 0.3) return { field: 'crackGrades', grade: 'C' };
            if (w < 0.5) return { field: 'crackGrades', grade: 'D' };
            return { field: 'crackGrades', grade: 'E' };
        }
        if (k === 'leak' || k === 'eff') return { field: 'leakGrades', grade: 'B', assumed: true };
        if (k === 'rebar') return { field: 'rebarGrades', grade: 'B', assumed: true };
        if (k === 'spall') {
            var dp = S.spallDepthOf(d);
            var isScale = /박락|층분리|들뜸/.test(txt(d && d.defectType));
            if (isScale) {
                if (dp == null || dp < 15) return { field: 'scalingGrades', grade: 'B', assumed: dp == null };
                if (dp < 20) return { field: 'scalingGrades', grade: 'C' };
                if (dp < 25) return { field: 'scalingGrades', grade: 'D' };
                return { field: 'scalingGrades', grade: 'E' };
            }
            if (dp == null || dp < 0.5) return { field: 'spallingGrades', grade: 'B', assumed: dp == null };
            if (dp < 1.0) return { field: 'spallingGrades', grade: 'C' };
            if (dp < 25) return { field: 'spallingGrades', grade: 'D' };
            return { field: 'spallingGrades', grade: 'E' };
        }
        return null;
    }

    function floorNumber(code, idx) {
        var s = txt(code).toUpperCase();
        var m = s.match(/^B\s*(\d+)/) || s.match(/^지하\s*(\d+)/);
        if (m) return -Number(m[1]);
        m = s.match(/(\d+)/);
        if (m) return Number(m[1]);
        return idx + 1;
    }

    /** SAFETY357 건물 = 이 건물 1개, 표본층 기록 = 평가단위 1개(시작층~끝층, 표본층) — SafetyMan sfm 층 기록과 같음 */
    function bid(bldgId) { return 'bsa-bldg-' + bldgId; }
    function fid(unitId) { return 'bsa-unit-' + unitId; }

    /**
     * 도면 값 → { auto: {path: n}, building: {id, name}, units: [{ id(기록), unitId, name, floors:[{floorKey, no, label}], nos }], issues: {unitId: …}, floorsAbove, floorsBelow }
     * 부재 수·결함 수는 평가단위의 모든 층을 더한다(평가단위 하나 = 층 기록 하나).
     */
    function computeAuto(o) {
        var bldg = o.bldg, st = o.state, floors = o.floors || [], E = o.E, S = o.S, MC = o.MC, EM = o.EM;
        var auto = {}, units = [], issues = {};
        var plan = E.planOf(bldg);
        var samples = S.buildSamples(bldg, st, floors, E);
        var idxOf = {};
        floors.forEach(function (f, i) { idxOf[f.floorKey] = i; });
        var B = bid(bldg && bldg.id);
        var building = { id: B, name: txt(bldg && (bldg.name || bldg.siteName)) || '건물' };
        plan.units.forEach(function (u) {
            var F = fid(u.id);
            var uinfo = { id: F, unitId: u.id, name: E.unitTitle(u), floors: [], nos: [] };
            var iss = issues[u.id] = { noMember: 0, noWidth: 0, assumed: 0, defects: 0 };
            var seen = {};
            samples.forEach(function (s) {
                if (s.unitId !== u.id) return;
                if (!seen[s.floorKey]) {
                    seen[s.floorKey] = true;
                    var no = floorNumber(s.floorCode, idxOf[s.floorKey] || 0);
                    uinfo.floors.push({ floorKey: s.floorKey, no: no, label: s.floorLabel });
                    if (uinfo.nos.indexOf(no) < 0) uinfo.nos.push(no);
                    // 확인부재 수: 이 층(이 단위) 점 — 단위의 층을 모두 더함
                    if (MC && typeof MC.unitCounts === 'function') {
                        var f1 = floors.filter(function (f) { return f.floorKey === s.floorKey; });
                        var uc = (MC.unitCounts(bldg, st, f1, E).byUnit || {})[u.id] || {};
                        Object.keys(uc).forEach(function (t) {
                            var mt = MEMBER_MAP[t];
                            if (mt && uc[t]) auto[B + '|' + F + '|' + mt + '|memberTotalCount'] = (auto[B + '|' + F + '|' + mt + '|memberTotalCount'] || 0) + uc[t];
                        });
                    }
                }
                s.defects.forEach(function (d) {
                    var c = classify(d, S);
                    if (!c) return;
                    iss.defects++;
                    var em = EM ? EM.stateOf(d, o.memberName).type : null;
                    var mt = em && MEMBER_MAP[em];
                    if (!mt) { iss.noMember++; return; }
                    if (!c.grade) { iss.noWidth++; return; }
                    if (c.assumed) iss.assumed++;
                    if (c.grade === 'A') return;
                    var p = B + '|' + F + '|' + mt + '|' + c.field + '|' + c.grade;
                    auto[p] = (auto[p] || 0) + 1;
                });
            });
            uinfo.nos.sort(function (x, y) { return x - y; });
            if (uinfo.nos.length) units.push(uinfo);
        });
        // 건물 전체 지상·지하 층수(층 이름에 숫자가 있는 층만: B1/지하1 → 지하, 1F → 지상) — 층위치 가중치 r 용
        var above = 0, below = 0;
        floors.forEach(function (f) {
            var c = txt(f.floorCode).toUpperCase();
            if (/^(B|지하)\s*\d+/.test(c)) below++;
            else if (/\d/.test(c)) above++;
        });
        return { auto: auto, building: building, units: units, issues: issues, floorsAbove: above, floorsBelow: below };
    }

    function detailOf(sf, mt, F) {
        sf.details = sf.details || [];
        var d = sf.details.find(function (x) { return x && x.memberType === mt; });
        if (!d) { d = F.createMemberDetail(mt); sf.details.push(d); }
        return d;
    }
    function getRef(project, path, F, ctx) {
        var p = path.split('|');
        var b = project.buildings.find(function (x) { return x.id === p[0]; });
        if (!b) return null;
        var sf = (b.sampleFloors || []).find(function (x) { return x.id === p[1]; });
        if (!sf) return null;
        var d = detailOf(sf, p[2], F);
        if (p[3] === 'memberTotalCount') return { obj: d, key: 'memberTotalCount' };
        var rows = d[p[3]];
        if (!Array.isArray(rows)) return null;
        var row = rows.find(function (r) { return r && r.grade === p[4]; });
        return row ? { obj: row, key: 'count' } : null;
    }

    /** 저장된 SAFETY357 프로젝트 + 새 자동값 → { project, auto } (고친 칸 유지) */
    function merge(saved, prevAuto, calc, F) {
        var project = saved && saved.buildings ? JSON.parse(JSON.stringify(saved)) : F.createEmptyProject('평가');
        prevAuto = Object.assign({}, prevAuto || {});
        // 지난 판(평가단위마다 건물 하나)은 버린다 — 이제 건물 하나에 평가단위 = 층 기록
        project.buildings = project.buildings.filter(function (x) { return !(x && /^bsa-unit-/.test(String(x.id))); });
        Object.keys(prevAuto).forEach(function (k) { if (/^bsa-unit-/.test(k)) delete prevAuto[k]; });
        var CB = calc.building || { id: bid(''), name: '건물' };
        var b = project.buildings.find(function (x) { return x.id === CB.id; });
        if (!b) { b = F.createEmptyBuilding(CB.name); b.id = CB.id; project.buildings.push(b); }
        // 지상·지하 층수: 비어 있을 때만 건물 전체 층수로(사용자가 넣은 값은 그대로)
        if ((b.floorsAbove === '' || b.floorsAbove == null) && calc.floorsAbove > 0) b.floorsAbove = calc.floorsAbove;
        if ((b.floorsBelow === '' || b.floorsBelow == null) && (calc.floorsAbove > 0 || calc.floorsBelow > 0)) b.floorsBelow = calc.floorsBelow || 0;
        b.sampleFloors = (b.sampleFloors || []).filter(function (sf) {
            return !(sf && /^bsa-unit-/.test(String(sf.id))) || calc.units.some(function (u) { return u.id === sf.id; });
        });
        calc.units.forEach(function (u) {
            var lo = u.nos[0], hi = u.nos[u.nos.length - 1];
            var sf = b.sampleFloors.find(function (x) { return x.id === u.id; });
            if (!sf) {
                // 표본층 기본 = 가장 낮은 층(사용자가 평가 탭에서 고름)
                sf = F.createSampleFloor({ sampleFloor: lo, startFloor: lo, endFloor: hi });
                sf.id = u.id;
                b.sampleFloors.push(sf);
            }
            sf.startFloor = lo;
            sf.endFloor = hi;
            if (u.nos.indexOf(Number(sf.sampleFloor)) < 0) sf.sampleFloor = lo;
            sf.bsaUnitName = u.name;
        });
        b.sampleFloors.sort(function (x, y) { return (Number(x.startFloor) || 0) - (Number(y.startFloor) || 0) || (Number(x.endFloor) || 0) - (Number(y.endFloor) || 0); });
        b.sampleFloors.forEach(function (sf) { S357_MEMBERS.forEach(function (mt) { detailOf(sf, mt, F); }); });
        var paths = {};
        Object.keys(prevAuto).forEach(function (k) { paths[k] = 1; });
        Object.keys(calc.auto).forEach(function (k) { paths[k] = 1; });
        var nextAuto = {};
        Object.keys(paths).forEach(function (path) {
            var ref = getRef(project, path, F);
            if (!ref) return;
            var cur = Number(ref.obj[ref.key]) || 0;
            var next = calc.auto[path] || 0;
            var untouched = Object.prototype.hasOwnProperty.call(prevAuto, path) ? cur === prevAuto[path] : cur === 0;
            if (untouched) ref.obj[ref.key] = next;
            if (next) nextAuto[path] = next;
            else if (!untouched) nextAuto[path] = prevAuto[path];
        });
        syncGradeA(project, [CB.id]);
        return { project: project, auto: nextAuto };
    }

    var DEFECT_GRADES = ['B', 'C', 'D', 'E'];
    function defectSum(rows) {
        return (rows || []).reduce(function (s, r) { return s + (r && DEFECT_GRADES.indexOf(r.grade) >= 0 ? (Number(r.count) || 0) : 0); }, 0);
    }
    function eachDetail(project, ids, fn) {
        (project && project.buildings || []).forEach(function (b) {
            if (ids && ids.indexOf(b.id) < 0) return;
            (b.sampleFloors || []).forEach(function (sf) { (sf.details || []).forEach(function (d) { if (d) fn(b, sf, d); }); });
        });
    }
    /** 양호(A) = 확인부재 − 결함(B~E) 부재, 최소 0. 확인부재 0이면 손대지 않음. */
    function syncGradeA(project, ids) {
        eachDetail(project, ids, function (b, sf, d) {
            var total = Number(d.memberTotalCount) || 0;
            if (total <= 0) return;
            GRADE_FIELDS.forEach(function (f) {
                var rows = d[f];
                if (!Array.isArray(rows)) return;
                var a = rows.find(function (r) { return r && r.grade === 'A'; });
                if (a) a.count = Math.max(0, total - defectSum(rows));
            });
        });
        return project;
    }
    var FIELD_LABEL = { crackGrades: '균열', leakGrades: '누수·백태', rebarGrades: '철근노출', spallingGrades: '박리', scalingGrades: '박락·층분리' };
    /** 결함 부재가 확인부재보다 많은 칸 → [{ buildingId, floorId, member, field, label, total, defects }] */
    function check(project, ids) {
        var out = [];
        eachDetail(project, ids, function (b, sf, d) {
            var total = Number(d.memberTotalCount) || 0;
            GRADE_FIELDS.forEach(function (f) {
                var n = defectSum(d[f]);
                if (n > total) out.push({ buildingId: b.id, floorId: sf.id, member: d.memberType, field: f, label: FIELD_LABEL[f] || f, total: total, defects: n });
            });
        });
        return out;
    }

    /** 평가단위(층 기록)의 표본층 바꾸기 — 단위의 층 중 하나만. 바뀌면 true */
    function setSampleFloor(project, recordId, no) {
        var n = Number(no);
        var ok = false;
        (project && project.buildings || []).forEach(function (b) {
            (b.sampleFloors || []).forEach(function (sf) {
                if (sf.id !== recordId || !Number.isFinite(n)) return;
                if (n < Number(sf.startFloor) || n > Number(sf.endFloor) || n === 0) return;
                if (Number(sf.sampleFloor) !== n) { sf.sampleFloor = n; ok = true; }
            });
        });
        return ok;
    }
    /**
     * 점수 요약(SAFETY357 evaluateBuilding 그대로 — SafetyMan 0x40d34d: 층 기록마다 표본층 s 하나로 층위치 가중치,
     * 상태 = Choquet(기록 점수, 가중치), 종합 = Choquet([안전성, 상태, 기울기·침하], [0.9, 0.7, 0.7]))
     */
    function scoreSummary(project, calc, X) {
        var CB = calc && calc.building;
        var b = CB && (project && project.buildings || []).find(function (x) { return x.id === CB.id; });
        if (!b || !X || typeof X.evaluateBuilding !== 'function') return null;
        var ev = X.evaluateBuilding(b, project.gradeRules);
        var A = Number(b.floorsAbove) || 0, Bl = Number(b.floorsBelow) || 0;
        var units = (b.sampleFloors || []).map(function (sf) {
            var fs = (ev.floorScores || []).find(function (x) { return x.floorId === sf.id; }) || {};
            var u = (calc.units || []).find(function (x) { return x.id === sf.id; });
            return { id: sf.id, name: sf.bsaUnitName || (u && u.name) || ('층 ' + sf.startFloor + '~' + sf.endFloor), startFloor: sf.startFloor, endFloor: sf.endFloor,
                sampleFloor: sf.sampleFloor, nos: u ? u.nos.slice() : [], score: fs.score, grade: fs.grade,
                weight: typeof X.floorPositionDensity === 'function' ? X.floorPositionDensity(Number(sf.sampleFloor), A, Bl) : fs.bandWeight };
        });
        return { units: units, floorsAbove: A, floorsBelow: Bl, statusScore: ev.statusScore, statusGrade: ev.statusGrade,
            safetyScore: ev.safetyScore, safetyGrade: ev.safetyGrade, overallScore: ev.averageScore, overallGrade: ev.overallGrade };
    }
    var WARN_TEXT = '부재 수가 결함 수보다 적어요';

    var api = { MEMBER_MAP: MEMBER_MAP, S357_MEMBERS: S357_MEMBERS, GRADE_FIELDS: GRADE_FIELDS, classify: classify, floorNumber: floorNumber,
        computeAuto: computeAuto, merge: merge, syncGradeA: syncGradeA, check: check, WARN_TEXT: WARN_TEXT, setSampleFloor: setSampleFloor, scoreSummary: scoreSummary, bid: bid, fid: fid };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.s357Prefill = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
