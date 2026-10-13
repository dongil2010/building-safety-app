/**
 * SafetyMan용 엑셀(2026-10-13) — 평가단위(상태평가용 묶음)를 KISTEC SafetyMan 입력 순서로 정리한다.
 * 등급 계산은 하지 않는다(SafetyMan이 한다). 여기서는 표본층별·부재별 최악값과 SafetyMan 구간만 만든다.
 *
 * buildSheets({ bldg, state, floors:[{floorCode,floorLabel,floorKey}], evalUnits, memberName? })
 *   → [{ name, aoa, cols }]  (XLSX.utils.aoa_to_sheet 로 바로 쓰는 2차원 배열)
 */
(function (root) {
    'use strict';

    // 2026-10-13: 평가 부재는 기둥·벽·거더·빔·슬래브 5종(+있으면 테두리보·지판·기타)
    var BASE_MEMBERS = ['기둥', '벽', '거더', '빔', '슬래브'];
    var MEMBER_ORDER = BASE_MEMBERS.concat(['테두리보', '지판']);
    var FILL = '(직접 입력)';

    function str(v) { return v == null ? '' : String(v).trim(); }

    /** 부재 명칭 → SafetyMan 평가부재 */
    function memberType(name) {
        var s = str(name).replace(/\s+/g, '');
        if (!s) return '기타';
        if (/테두리보/.test(s)) return '테두리보';
        if (/지판|드롭패널/i.test(s)) return '지판';
        if (/기둥|column|^c\d/i.test(s)) return '기둥';
        if (/슬래브|slab|바닥판|^s\d/i.test(s)) return '슬래브';
        if (/빔|\(b\)|beam|^b\d/i.test(s)) return '빔';
        if (/보|거더|girder|\(g\)|^g\d/i.test(s)) return '거더';
        if (/벽|wall|^w\d/i.test(s)) return '벽';
        return '기타';
    }

    /** 결함의 평가 부재: 확정(d.evalMember) 우선, 없으면 부재 글로 추정 */
    function evalMemberOf(d, memberName) {
        var v = str(d && d.evalMember);
        if (BASE_MEMBERS.indexOf(v) >= 0) return v;
        var c = d && d.component;
        return memberType(typeof memberName === 'function' ? (memberName(c) || c) : c);
    }

    /** 평가단위별 평가 부재 상태: { unitId: { total, confirmed, guessed, none } } */
    function unitMemberStatus(bldg, st, floors, E, memberName) {
        var out = {};
        buildSamples(bldg, st, floors, E).forEach(function (s) {
            if (!s.unitId) return;
            var u = out[s.unitId] = out[s.unitId] || { total: 0, confirmed: 0, guessed: 0, none: 0 };
            s.defects.forEach(function (d) {
                u.total++;
                if (BASE_MEMBERS.indexOf(str(d && d.evalMember)) >= 0) u.confirmed++;
                else if (evalMemberOf(d, memberName) === '기타') u.none++;
                else u.guessed++;
            });
        });
        return out;
    }

    /** 결함 종류 → 'crack' | 'spall' | 'leak' | 'rebar' | 'other' */
    function defectKind(d) {
        var t = str(d && d.defectType);
        if (/철근\s*노출/.test(t)) return 'rebar';
        if (/박리|박락|층분리|들뜸/.test(t)) return 'spall';
        if (/백태|백화|에플로/.test(t)) return 'eff';
        if (/누수/.test(t)) return 'leak';
        if (/균열/.test(t)) return 'crack';
        return 'other';
    }

    /** 균열폭(mm): crackWidth 우선, 없으면 규모에서 「Cw:0.3」「0.3mm」「W=0.3」 */
    function crackWidthOf(d) {
        var n = parseFloat(str(d && d.crackWidth).replace(/[^0-9.]/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
        var s = str(d && d.size);
        var m = s.match(/(?:cw|w)\s*[:=]\s*([0-9]*\.?[0-9]+)/i) || s.match(/([0-9]*\.?[0-9]+)\s*mm/i) || s.match(/^\s*([0-9]*\.[0-9]+)/);
        if (m) { n = parseFloat(m[1]); if (Number.isFinite(n) && n > 0) return n; }
        return null;
    }

    /** SafetyMan 균열 구간 */
    function crackBand(w) {
        if (w == null || !Number.isFinite(w)) return '';
        if (w < 0.1) return '0.1mm미만';
        if (w < 0.2) return '0.2mm미만';
        if (w < 0.3) return '0.3mm미만';
        if (w < 0.5) return '0.5mm미만';
        return '0.5mm이상';
    }

    /** 박리·박락 깊이(mm): 규모에 「깊이 3mm」「D=3」「d:3」로 적은 경우만 */
    function spallDepthOf(d) {
        var s = str(d && d.size);
        var m = s.match(/(?:깊이|depth|\bd)\s*[:=]?\s*([0-9]*\.?[0-9]+)/i);
        if (!m) return null;
        var n = parseFloat(m[1]);
        return Number.isFinite(n) && n > 0 ? n : null;
    }

    /** SafetyMan 박리(표면노후 0.5/1.0/2.5mm) · 박락(15/20/25mm) 구간 */
    function spallBand(mm) {
        if (mm == null || !Number.isFinite(mm)) return '';
        if (mm < 0.5) return '0.5mm미만의 박리발생';
        if (mm < 1.0) return '1.0mm미만의 박리발생';
        if (mm < 2.5) return '2.5mm미만의 박리발생';
        if (mm < 15) return '15mm미만의 박리발생';
        if (mm < 20) return '20mm미만의 박리발생';
        if (mm < 25) return '25mm미만의 박리발생';
        return '25mm이상의 박리발생';
    }

    function maxOf(list) {
        var v = null;
        list.forEach(function (x) { if (x != null && (v == null || x > v)) v = x; });
        return v;
    }

    /** 표본층 목록: [{ unitId, unitLabel, floorCode, floorLabel, floorKey, subName, partNote, status, defects }] — 평가단위 순서, 그 안에서 층 순서 */
    function buildSamples(bldg, st, floors, E) {
        var plan = E.planOf(bldg);
        var defectsOf = function (k) { return (((st && st.defects) || {})[k] || []).filter(Boolean); };
        // 결함의 구역: id → 합쳐진 옛 id(aliases) → 구역 번호(evalPart) 순으로 찾는다
        var zoneOf = function (k, d) { return typeof E.resolveZoneId === 'function' ? E.resolveZoneId(st, k, d) : (d.evalUnitId || ''); };
        var samples = [];
        var unitIds = {};
        plan.units.forEach(function (u) { unitIds[u.id] = true; });
        plan.units.forEach(function (u) {
            (floors || []).forEach(function (f) {
                var m = plan.floors[f.floorCode];
                if (m && m.mode === 'whole' && m.unitId === u.id) {
                    samples.push({ unitId: u.id, unitLabel: u.name, floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                        subName: '', partNote: '', status: '층 전체', defects: defectsOf(f.floorKey) });
                } else if (m && m.mode === 'split') {
                    E.listFor(st, f.floorKey).forEach(function (z) {
                        if (E.zoneUnitId(bldg, z) !== u.id) return;
                        var part = z.partId ? E.partOf(bldg, z.partId) : null;
                        samples.push({ unitId: u.id, unitLabel: u.name, floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                            subName: E.zoneLabel(bldg, z), partNote: part ? str(part.note) : '', status: '층 나누기 구역',
                            defects: defectsOf(f.floorKey).filter(function (d) { return zoneOf(f.floorKey, d) === z.id; }) });
                    });
                }
            });
        });
        (floors || []).forEach(function (f) {
            var m = plan.floors[f.floorCode];
            if (m && m.mode === 'split') {
                var ok = {};
                E.listFor(st, f.floorKey).forEach(function (z) { if (unitIds[E.zoneUnitId(bldg, z)]) ok[z.id] = true; });
                var rest = defectsOf(f.floorKey).filter(function (d) { return !ok[zoneOf(f.floorKey, d)]; });
                if (rest.length) samples.push({ unitId: '', unitLabel: '미설정', floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                    subName: '미지정', partNote: '', status: '미설정(구역 미지정·단위 없는 구역 결함)', defects: rest });
            } else if (!(m && m.mode === 'whole' && unitIds[m.unitId])) {
                samples.push({ unitId: '', unitLabel: '미설정', floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                    subName: '', partNote: '', status: '미설정(평가단위 설정 안 한 층)', defects: defectsOf(f.floorKey) });
            }
        });
        return samples;
    }

    function sampleName(s) { return s.floorLabel + (s.subName ? '-' + s.subName : ''); }

    function memberRows(s, memberName) {
        var nm = function (v) { return typeof memberName === 'function' ? (memberName(v) || v) : v; };
        var groups = {};
        s.defects.forEach(function (d) {
            var t = evalMemberOf(d, memberName);
            (groups[t] = groups[t] || []).push(d);
        });
        var order = BASE_MEMBERS.slice();
        MEMBER_ORDER.concat(['기타']).forEach(function (t) { if (groups[t] && order.indexOf(t) < 0) order.push(t); });
        return order.map(function (t) {
            var ds = groups[t] || [];
            var cracks = ds.filter(function (d) { return defectKind(d) === 'crack'; });
            var spalls = ds.filter(function (d) { return defectKind(d) === 'spall'; });
            var leaks = ds.filter(function (d) { var k = defectKind(d); return k === 'leak' || k === 'eff'; });
            var rebars = ds.filter(function (d) { return defectKind(d) === 'rebar'; });
            var w = maxOf(cracks.map(crackWidthOf));
            var dep = maxOf(spalls.map(spallDepthOf));
            return [
                t, ds.length,
                cracks.length, w == null ? '' : w, w == null ? (cracks.length ? FILL : '발생없음') : crackBand(w),
                spalls.length, dep == null ? (spalls.length ? FILL : '') : dep, dep == null ? (spalls.length ? FILL : '발생없음') : spallBand(dep),
                leaks.length, leaks.length ? FILL : '', leaks.length ? '' : '누수 및 백태발생 없음',
                rebars.length, rebars.length ? FILL : '', rebars.length ? '' : '노출발생없음',
                ds.map(function (d) { return str(d.no); }).filter(Boolean).join(', ')
            ];
        });
    }

    function num(v) {
        var n = typeof v === 'number' ? v : parseFloat(str(v));
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : '';
    }

    function ndtRows(st, s, memberName) {
        var nm = function (v) { return typeof memberName === 'function' ? (memberName(v) || v) : v; };
        var items = (((st && st.ndtData) || {})[s.floorKey] || []).filter(Boolean);
        var rows = [];
        items.forEach(function (it) {
            if (it.category === '강도') {
                rows.push(['콘크리트 강도', nm(it.component) || '', str(it.location), '측정강도(MPa)', num(it.strengthFinal), '설계강도(MPa)', num(it.designStrength)]);
            } else if (it.category === '탄산화') {
                rows.push(['콘크리트 중성화', nm(it.component) || '', str(it.location), '중성화깊이(mm)', num(it.carbDepth), '피복두께(mm)', num(it.carbCover)]);
            }
        });
        rows.push(['염화물함유량', '', '', 'kg/㎥', FILL, '', '']);
        return rows;
    }

    /* ---------- 평가 탭 입력표(평가단위 × 부재) ---------- */
    // key, 머리글, 단위
    var INPUT_ITEMS = [
        { key: 'count', label: '부재 수', unit: '개' },
        { key: 'crackW', label: '균열폭', unit: 'mm' },
        { key: 'leak', label: '누수', unit: '건/면적%' },
        { key: 'eff', label: '백태 면적율', unit: '%' },
        { key: 'rebar', label: '철근노출 면적율', unit: '%' },
        { key: 'spall', label: '박리·박락 깊이', unit: 'mm' },
        { key: 'strength', label: '강도', unit: 'MPa' },
        { key: 'carb', label: '탄산화 깊이', unit: 'mm' },
        { key: 'cover', label: '피복', unit: 'mm' },
        { key: 'chloride', label: '염화물', unit: 'kg/㎥' }
    ];

    /** 도면 결함·비파괴값에서 나온 기본값: { unitId: { 부재: { crackW, leakN, effN, rebarN, spall, strength, carb, cover, defects } } } */
    function unitComputed(bldg, st, floors, E, memberName, MC) {
        var nm = function (v) { return typeof memberName === 'function' ? (memberName(v) || v) : v; };
        var out = {};
        var samples = buildSamples(bldg, st, floors, E);
        var ndtDone = {};
        samples.forEach(function (s) {
            if (!s.unitId) return;
            var u = out[s.unitId] = out[s.unitId] || {};
            var row = function (t) { return u[t] = u[t] || { count: null, crackW: null, leakN: 0, effN: 0, rebarN: 0, spall: null, strength: null, carb: null, cover: null, defects: 0 }; };
            s.defects.forEach(function (d) {
                var r = row(evalMemberOf(d, memberName));
                r.defects++;
                var k = defectKind(d);
                if (k === 'crack') { var w = crackWidthOf(d); if (w != null && (r.crackW == null || w > r.crackW)) r.crackW = w; }
                else if (k === 'leak') r.leakN++;
                else if (k === 'eff') r.effN++;
                else if (k === 'rebar') r.rebarN++;
                else if (k === 'spall') { var dp = spallDepthOf(d); if (dp != null && (r.spall == null || dp > r.spall)) r.spall = dp; }
            });
            var nk = s.unitId + '|' + s.floorKey;
            if (ndtDone[nk]) return;
            ndtDone[nk] = true;
            (((st && st.ndtData) || {})[s.floorKey] || []).forEach(function (it) {
                if (!it) return;
                var r = row(memberType(nm(it.component)));
                var v;
                if (it.category === '강도') { v = parseFloat(it.strengthFinal); if (Number.isFinite(v) && (r.strength == null || v < r.strength)) r.strength = Math.round(v * 10) / 10; }
                if (it.category === '탄산화') {
                    v = parseFloat(it.carbDepth); if (Number.isFinite(v) && (r.carb == null || v > r.carb)) r.carb = v;
                    v = parseFloat(it.carbCover); if (Number.isFinite(v) && (r.cover == null || v < r.cover)) r.cover = v;
                }
            });
        });
        // 도면에서 센 부재 수(부재 수 세기 점)
        if (MC && typeof MC.unitCounts === 'function') {
            var uc = MC.unitCounts(bldg, st, floors, E).byUnit;
            Object.keys(uc).forEach(function (uid) {
                var u = out[uid] = out[uid] || {};
                Object.keys(uc[uid]).forEach(function (t) {
                    if (!uc[uid][t]) return;
                    var r = u[t] = u[t] || { count: null, crackW: null, leakN: 0, effN: 0, rebarN: 0, spall: null, strength: null, carb: null, cover: null, defects: 0 };
                    r.count = uc[uid][t];
                });
            });
        }
        return out;
    }

    /** 입력표 한 칸: 직접 입력이 있으면 그것, 없으면 기본값. { value, source:'input'|'auto'|'' , hint } */
    function cellValue(inputs, comp, unitId, member, key) {
        var ov = (((inputs || {})[unitId] || {}).members || {})[member];
        if (ov && ov[key] != null && ov[key] !== '') return { value: ov[key], source: 'input', hint: '' };
        var c = ((comp || {})[unitId] || {})[member];
        if (!c) return { value: '', source: '', hint: '' };
        if (key === 'count' && c.count != null) return { value: c.count, source: 'auto', hint: '' };
        if (key === 'crackW' && c.crackW != null) return { value: c.crackW, source: 'auto', hint: '' };
        if (key === 'spall' && c.spall != null) return { value: c.spall, source: 'auto', hint: '' };
        if (key === 'strength' && c.strength != null) return { value: c.strength, source: 'auto', hint: '' };
        if (key === 'carb' && c.carb != null) return { value: c.carb, source: 'auto', hint: '' };
        if (key === 'cover' && c.cover != null) return { value: c.cover, source: 'auto', hint: '' };
        if (key === 'leak' && c.leakN) return { value: '', source: '', hint: c.leakN + '건' };
        if (key === 'eff' && c.effN) return { value: '', source: '', hint: c.effN + '건' };
        if (key === 'rebar' && c.rebarN) return { value: '', source: '', hint: c.rebarN + '건' };
        return { value: '', source: '', hint: '' };
    }

    /** 단위 입력표에 보일 부재 줄: 5종 + 결함·입력이 있는 그 밖의 부재 */
    function unitMembers(inputs, comp, unitId) {
        var list = BASE_MEMBERS.slice();
        var extra = Object.keys(((comp || {})[unitId]) || {}).concat(Object.keys((((inputs || {})[unitId] || {}).members) || {}));
        MEMBER_ORDER.concat(['기타']).forEach(function (t) { if (extra.indexOf(t) >= 0 && list.indexOf(t) < 0) list.push(t); });
        return list;
    }

    var MEMBER_HEAD = ['평가부재', '결함 수', '균열 건수', '최대 균열폭(mm)', 'SafetyMan 균열 구간',
        '박리·박락 건수', '박리 깊이(mm)', 'SafetyMan 박리 구간', '누수·백태 건수', '백태 면적율(%)', '누수·백태 비고',
        '철근노출 건수', '노출 면적율(%)', '철근노출 비고', '근거 결함 No.'];

    function sampleBlock(st, s, memberName, idx) {
        var aoa = [
            ['표본층 ' + idx, sampleName(s), '구분', s.status, '부분 비고(구조형식·부재)', s.partNote || ''],
            ['[부재별 최악값 — 균열 · 표면노후(박리·박락, 누수·백태, 철근노출)]'],
            MEMBER_HEAD
        ].concat(memberRows(s, memberName));
        aoa.push(['[비파괴 시험값' + (s.subName ? ' — 층 공통(구역으로 나누지 않음)' : '') + ']']);
        aoa.push(['항목', '부재', '위치', '값1 항목', '값1', '값2 항목', '값2']);
        return aoa.concat(ndtRows(st, s, memberName));
    }

    function buildSheets(opts) {
        var o = opts || {};
        var E = o.evalUnits;
        var st = o.state || {};
        var bldg = o.bldg || {};
        var samples = buildSamples(bldg, st, o.floors || [], E);
        var inputs = bldg.evalInputs || {};
        var comp = unitComputed(bldg, st, o.floors || [], E, o.memberName, o.memberCount);
        var used = {};
        var sheetName = function (n) {
            var c = String(n).replace(/[:\\/?*\[\]]/g, '').trim().slice(0, 31) || '시트';
            var f = c, k = 2;
            while (used[f]) { f = c.slice(0, 27) + '(' + k + ')'; k++; }
            used[f] = true;
            return f;
        };
        used['요약'] = used['근거_결함목록'] = used['참고'] = true;
        // 평가단위마다 시트 1장(그 안에 표본층 = 층 전체 / 층 구역)
        var groups = [];
        var byKey = {};
        samples.forEach(function (s) {
            var k = s.unitId || '__unset__';
            if (!byKey[k]) { byKey[k] = { label: s.unitLabel, unset: !s.unitId, list: [] }; groups.push(byKey[k]); }
            byKey[k].list.push(s);
        });
        var sum = [['SafetyMan용 상태평가 입력 자료', ''], ['건물', str(bldg.name || bldg.buildingName)], ['만든 날', o.dateText || ''], [],
            ['평가단위(시트)', '표본층', '층', '구역', '부분 비고', '구분', '결함 수']];
        var unitSheets = [];
        groups.forEach(function (g) {
            g.sheet = sheetName(g.unset ? '미설정' : g.label);
            var aoa = [['평가단위', g.label, '표본층 수', g.list.length]];
            if (g.unset) aoa.push(['※ 미설정: 평가단위가 정해지지 않은 자료입니다. SafetyMan에 넣기 전에 단위를 정하세요.']);
            else {
                var uid = g.list[0].unitId;
                aoa.push([]);
                aoa.push(['[평가 탭 입력표 — 부재별 값(직접 입력 우선, 빈칸은 도면 결함·비파괴값)]']);
                aoa.push(['평가부재'].concat(INPUT_ITEMS.map(function (it) { return it.label + '(' + it.unit + ')'; })).concat(['SafetyMan 균열 구간']));
                unitMembers(inputs, comp, uid).forEach(function (m) {
                    var vals = INPUT_ITEMS.map(function (it) { var c = cellValue(inputs, comp, uid, m, it.key); return c.value !== '' ? c.value : (c.hint || ''); });
                    var w = parseFloat(cellValue(inputs, comp, uid, m, 'crackW').value);
                    aoa.push([m].concat(vals).concat([Number.isFinite(w) ? crackBand(w) : '']));
                });
                var tilt = ((inputs || {})[uid] || {}).tilt;
                aoa.push(['건물 기울기', tilt ? '1/' + tilt : '(직접 입력)']);
            }
            g.list.forEach(function (s, i) {
                s.sheet = g.sheet;
                sum.push([g.sheet, sampleName(s), s.floorLabel, s.subName, s.partNote, s.status, s.defects.length]);
                aoa.push([]);
                aoa = aoa.concat(sampleBlock(st, s, o.memberName, i + 1));
            });
            unitSheets.push({ name: g.sheet, aoa: aoa, cols: [12, 14, 9, 13, 18, 11, 12, 22, 12, 13, 20, 11, 13, 14, 30] });
        });
        var ev = [['평가단위(시트)', '표본층', '층', '구역', '결함 No.', '부재(원문)', '평가부재', '결함종류', '위치', '규모', '균열폭(mm)', '반영 구간']];
        samples.forEach(function (s) {
            s.defects.forEach(function (d) {
                var nmv = typeof o.memberName === 'function' ? (o.memberName(d.component) || d.component) : d.component;
                var k = defectKind(d);
                var w = k === 'crack' ? crackWidthOf(d) : null;
                var dep = k === 'spall' ? spallDepthOf(d) : null;
                ev.push([s.sheet, sampleName(s), s.floorLabel, s.subName, str(d.no), str(nmv), evalMemberOf(d, o.memberName) + (BASE_MEMBERS.indexOf(str(d.evalMember)) >= 0 ? '' : ' (추정)'), str(d.defectType), str(d.location), str(d.size),
                    w == null ? '' : w, k === 'crack' ? crackBand(w) : (k === 'spall' ? spallBand(dep) : '')]);
            });
        });
        return [{ name: '요약', aoa: sum, cols: [16, 18, 8, 12, 24, 30, 8] }].concat(unitSheets).concat([
            { name: '근거_결함목록', aoa: ev, cols: [16, 18, 8, 12, 10, 14, 10, 16, 26, 18, 10, 20] },
            { name: '참고', aoa: NOTES.map(function (t) { return [t]; }), cols: [110] }]);
    }

    var NOTES = [
        'SafetyMan용 엑셀 — 정리 기준(가정). SafetyMan에 바로 불러오는 파일이 아니라, 입력 화면 순서대로 옮겨 적는 자료입니다.',
        '1. 시트 = 평가단위(SafetyMan 프로젝트·평가 단위 1개). 그 안의 「표본층 n」 = 층 전체 또는 층 구역(예: 2F-증축부). SafetyMan에서는 평가단위마다 표본층을 이 순서로 입력하세요.',
        '2. 평가단위를 정하지 않은 층, 나눈 층에서 구역에 안 넣은 결함, 평가단위가 없는 부분의 결함은 「미설정」 시트로 따로 둡니다(요약에 표시).',
        '3. 평가부재: 기둥·벽·거더·빔·슬래브 5종(결함이 없어도 줄을 둠). 「빔·보(B)」→빔, 「거더·보(G)·G/B 안 정한 보」→거더, 「테두리보」「지판」은 있으면 따로, 그 밖은 기타.',
        '4. 결함 종류: 「균열」→균열, 「박리·박락·층분리·들뜸」→박리·박락, 「누수·백태·백화」→누수·백태, 「철근노출」→철근노출. 그 밖의 결함은 결함 수에만 들어갑니다.',
        '5. 균열 구간은 부재별 최대 균열폭: 0.1 미만→0.1mm미만, 0.1~0.2 미만→0.2mm미만, 0.2~0.3 미만→0.3mm미만, 0.3~0.5 미만→0.5mm미만, 0.5 이상→0.5mm이상 (경계값은 위 구간).',
        '6. 균열폭은 결함의 균열폭 칸, 없으면 규모의 「Cw:0.3」「0.3mm」에서 읽습니다. 못 읽으면 「(직접 입력)」.',
        '7. 박리 깊이는 규모에 「깊이 3」「D=3」처럼 적은 경우만 읽습니다(앱에 깊이 칸이 없음). 없으면 「(직접 입력)」. 구간: 2.5mm 미만은 0.5/1.0/2.5mm, 2.5mm 이상은 15/20/25mm 기준(「2.5mm이상의 박리발생」은 쓰지 않음 — SafetyMan에서 확인).',
        '8. 백태·철근노출 면적율(%)은 앱에 부재면적이 없어 계산하지 않습니다. 해당 결함이 있으면 「(직접 입력)」 칸을 채우세요.',
        '9. 비파괴 시험값(강도·중성화)은 층 단위로 저장돼 있어, 구역 표본층에는 그 층 값이 공통으로 들어갑니다. 염화물은 앱에 입력 칸이 없어 빈칸입니다.',
        '9-1. 부재 수: 도면 「부재 수 세기」로 찍은 점 개수(층 전체 층은 그 층 단위, 번호로 나눈 층은 점의 구역 번호). 평가 탭에 직접 적은 값이 우선입니다.',
        '9-2. 결함의 평가부재는 도면에서 지정한 값(평가 부재 바)을 쓰고, 지정 안 한 결함은 부재 글로 추정합니다(근거_결함목록에 「(추정)」). 추정도 안 되는 결함은 「기타」.',
        '10. 부재변형·기울기·부동침하는 이 파일에 넣지 않았습니다(건물 전체 항목). 등급 계산은 하지 않습니다 — SafetyMan에서 계산하세요.'
    ];

    var api = { INPUT_ITEMS: INPUT_ITEMS, BASE_MEMBERS: BASE_MEMBERS, unitComputed: unitComputed, cellValue: cellValue, unitMembers: unitMembers,
        buildSheets: buildSheets, buildSamples: buildSamples, memberType: memberType, evalMemberOf: evalMemberOf, unitMemberStatus: unitMemberStatus, defectKind: defectKind,
        crackWidthOf: crackWidthOf, crackBand: crackBand, spallDepthOf: spallDepthOf, spallBand: spallBand, NOTES: NOTES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.safetymanExport = api; }
})(typeof window !== 'undefined' ? window : null);
