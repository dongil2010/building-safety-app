/**
 * SafetyMan용 엑셀(2026-10-13) — 평가단위(상태평가용 묶음)를 KISTEC SafetyMan 입력 순서로 정리한다.
 * 등급 계산은 하지 않는다(SafetyMan이 한다). 여기서는 표본층별·부재별 최악값과 SafetyMan 구간만 만든다.
 *
 * buildSheets({ bldg, state, floors:[{floorCode,floorLabel,floorKey}], evalUnits, memberName? })
 *   → [{ name, aoa, cols }]  (XLSX.utils.aoa_to_sheet 로 바로 쓰는 2차원 배열)
 */
(function (root) {
    'use strict';

    var MEMBER_ORDER = ['기둥', '보', '슬래브', '벽', '테두리보', '지판'];
    var BASE_MEMBERS = ['기둥', '보', '슬래브', '벽'];
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
        if (/보|거더|girder|beam|^[gb]\d/i.test(s)) return '보';
        if (/벽|wall|^w\d/i.test(s)) return '벽';
        return '기타';
    }

    /** 결함 종류 → 'crack' | 'spall' | 'leak' | 'rebar' | 'other' */
    function defectKind(d) {
        var t = str(d && d.defectType);
        if (/철근\s*노출/.test(t)) return 'rebar';
        if (/박리|박락|층분리|들뜸/.test(t)) return 'spall';
        if (/누수|백태|백화|에플로/.test(t)) return 'leak';
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

    /** 표본층 목록: [{ id, unitLabel, floorCode, floorLabel, floorKey, subName, status, defects }] */
    function buildSamples(bldg, st, floors, E) {
        var plan = E.planOf(bldg);
        var defectsOf = function (k) { return (((st && st.defects) || {})[k] || []).filter(Boolean); };
        var samples = [];
        var unitByNo = {};
        plan.units.forEach(function (u) { unitByNo[u.id] = u; });
        // 평가단위 순서대로
        plan.units.forEach(function (u) {
            (floors || []).forEach(function (f) {
                var m = plan.floors[f.floorCode];
                if (m && m.mode === 'whole' && m.unitId === u.id) {
                    samples.push({ unitLabel: u.name, unitNo: u.no, floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                        subName: '', status: '층 전체', defects: defectsOf(f.floorKey) });
                } else if (m && m.mode === 'split') {
                    E.listFor(st, f.floorKey).forEach(function (su) {
                        if (su.parentUnitId !== u.id) return;
                        samples.push({ unitLabel: u.name, unitNo: u.no, floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                            subName: su.name, status: '세부단위', defects: defectsOf(f.floorKey).filter(function (d) { return d.evalUnitId === su.id; }) });
                    });
                }
            });
        });
        // 나눈 층에서 세부단위에 안 넣은 결함, 설정 안 한 층 → 따로(미설정) 표시
        (floors || []).forEach(function (f) {
            var m = plan.floors[f.floorCode];
            var validWhole = m && m.mode === 'whole' && unitByNo[m.unitId];
            if (m && m.mode === 'split') {
                var subs = E.listFor(st, f.floorKey);
                var ok = {};
                subs.forEach(function (s) { if (unitByNo[s.parentUnitId]) ok[s.id] = true; });
                var rest = defectsOf(f.floorKey).filter(function (d) { return !ok[d.evalUnitId]; });
                if (rest.length) samples.push({ unitLabel: '미설정', floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                    subName: '미지정', status: '미설정(세부단위 미지정 결함)', defects: rest });
            } else if (!validWhole) {
                samples.push({ unitLabel: '미설정', floorCode: f.floorCode, floorLabel: f.floorLabel, floorKey: f.floorKey,
                    subName: '', status: '미설정(평가단위 설정 안 한 층)', defects: defectsOf(f.floorKey) });
            }
        });
        return samples;
    }

    function sampleTitle(s) {
        return s.subName && s.subName !== '미지정' ? s.subName : (s.unitLabel === '미설정' ? '미설정' : s.unitLabel);
    }

    function memberRows(s, memberName) {
        var nm = function (v) { return typeof memberName === 'function' ? (memberName(v) || v) : v; };
        var groups = {};
        s.defects.forEach(function (d) {
            var t = memberType(nm(d.component));
            (groups[t] = groups[t] || []).push(d);
        });
        var order = BASE_MEMBERS.slice();
        MEMBER_ORDER.concat(['기타']).forEach(function (t) { if (groups[t] && order.indexOf(t) < 0) order.push(t); });
        return order.map(function (t) {
            var ds = groups[t] || [];
            var cracks = ds.filter(function (d) { return defectKind(d) === 'crack'; });
            var spalls = ds.filter(function (d) { return defectKind(d) === 'spall'; });
            var leaks = ds.filter(function (d) { return defectKind(d) === 'leak'; });
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

    var MEMBER_HEAD = ['평가부재', '결함 수', '균열 건수', '최대 균열폭(mm)', 'SafetyMan 균열 구간',
        '박리·박락 건수', '박리 깊이(mm)', 'SafetyMan 박리 구간', '누수·백태 건수', '백태 면적율(%)', '누수·백태 비고',
        '철근노출 건수', '노출 면적율(%)', '철근노출 비고', '근거 결함 No.'];

    function buildSheets(opts) {
        var o = opts || {};
        var E = o.evalUnits;
        var st = o.state || {};
        var bldg = o.bldg || {};
        var samples = buildSamples(bldg, st, o.floors || [], E);
        var sheets = [];
        var used = {};
        var sheetName = function (n) {
            var c = String(n).replace(/[:\\/?*\[\]]/g, '').trim().slice(0, 31) || '시트';
            var f = c, k = 2;
            while (used[f]) { f = c.slice(0, 27) + '(' + k + ')'; k++; }
            used[f] = true;
            return f;
        };
        // 요약
        var sum = [['SafetyMan용 상태평가 입력 자료', ''], ['건물', str(bldg.name || bldg.buildingName)], ['만든 날', o.dateText || ''], [],
            ['No', '표본층(시트)', '평가단위', '층', '세부단위', '구분', '결함 수']];
        var plan = [];
        samples.forEach(function (s, i) {
            s.sheet = sheetName((i + 1) + '_' + (s.unitLabel === '미설정' ? '미설정' : sampleTitle(s)) + '_' + s.floorLabel);
            sum.push([i + 1, s.sheet, s.unitLabel, s.floorLabel, s.subName, s.status, s.defects.length]);
            var aoa = [
                ['표본층', s.floorLabel + (s.subName ? ' · ' + s.subName : ''), '평가단위', s.unitLabel, '구분', s.status],
                s.unitLabel === '미설정' ? ['※ 미설정: 평가단위가 정해지지 않은 자료입니다. SafetyMan에 넣기 전에 단위를 정하세요.'] : [],
                [],
                ['[부재별 최악값 — 균열 · 표면노후(박리·박락, 누수·백태, 철근노출)]'],
                MEMBER_HEAD
            ].concat(memberRows(s, o.memberName));
            aoa.push([]);
            aoa.push(['[비파괴 시험값' + (s.subName ? ' — 층 공통(세부단위로 나누지 않음)' : '') + ']']);
            aoa.push(['항목', '부재', '위치', '값1 항목', '값1', '값2 항목', '값2']);
            aoa = aoa.concat(ndtRows(st, s, o.memberName));
            plan.push({ name: s.sheet, aoa: aoa, cols: [12, 8, 9, 13, 18, 11, 12, 22, 12, 13, 20, 11, 13, 14, 30] });
        });
        sheets.push({ name: sheetName('요약'), aoa: sum, cols: [6, 28, 14, 10, 10, 26, 8] });
        sheets = sheets.concat(plan);
        // 근거
        var ev = [['표본층(시트)', '평가단위', '층', '세부단위', '결함 No.', '부재(원문)', '평가부재', '결함종류', '위치', '규모', '균열폭(mm)', '반영 구간']];
        samples.forEach(function (s) {
            s.defects.forEach(function (d) {
                var nmv = typeof o.memberName === 'function' ? (o.memberName(d.component) || d.component) : d.component;
                var k = defectKind(d);
                var w = k === 'crack' ? crackWidthOf(d) : null;
                var dep = k === 'spall' ? spallDepthOf(d) : null;
                ev.push([s.sheet, s.unitLabel, s.floorLabel, s.subName, str(d.no), str(nmv), memberType(nmv), str(d.defectType), str(d.location), str(d.size),
                    w == null ? '' : w, k === 'crack' ? crackBand(w) : (k === 'spall' ? spallBand(dep) : '')]);
            });
        });
        sheets.push({ name: sheetName('근거_결함목록'), aoa: ev, cols: [24, 12, 8, 8, 10, 14, 10, 16, 26, 18, 10, 20] });
        sheets.push({ name: sheetName('참고'), aoa: NOTES.map(function (t) { return [t]; }), cols: [110] });
        return sheets;
    }

    var NOTES = [
        'SafetyMan용 엑셀 — 정리 기준(가정). SafetyMan에 바로 불러오는 파일이 아니라, 입력 화면 순서대로 옮겨 적는 자료입니다.',
        '1. 표본층: 「층 전체」 평가단위는 층마다 한 표본층(시트). 층 나누기 세부단위(1-1, 1-2 …)는 세부단위마다 한 표본층.',
        '2. 평가단위를 정하지 않은 층, 나눈 층에서 세부단위에 안 넣은 결함은 「미설정」 시트로 따로 둡니다(요약에 표시).',
        '3. 평가부재: 부재 명칭에 「기둥」→기둥, 「테두리보」→테두리보, 「보·거더」→보, 「슬래브」→슬래브, 「벽」→벽, 「지판」→지판, 그 밖은 기타. 기둥·보·슬래브·벽은 결함이 없어도 줄을 둡니다.',
        '4. 결함 종류: 「균열」→균열, 「박리·박락·층분리·들뜸」→박리·박락, 「누수·백태·백화」→누수·백태, 「철근노출」→철근노출. 그 밖의 결함은 결함 수에만 들어갑니다.',
        '5. 균열 구간은 부재별 최대 균열폭: 0.1 미만→0.1mm미만, 0.1~0.2 미만→0.2mm미만, 0.2~0.3 미만→0.3mm미만, 0.3~0.5 미만→0.5mm미만, 0.5 이상→0.5mm이상 (경계값은 위 구간).',
        '6. 균열폭은 결함의 균열폭 칸, 없으면 규모의 「Cw:0.3」「0.3mm」에서 읽습니다. 못 읽으면 「(직접 입력)」.',
        '7. 박리 깊이는 규모에 「깊이 3」「D=3」처럼 적은 경우만 읽습니다(앱에 깊이 칸이 없음). 없으면 「(직접 입력)」. 구간: 2.5mm 미만은 0.5/1.0/2.5mm, 2.5mm 이상은 15/20/25mm 기준(「2.5mm이상의 박리발생」은 쓰지 않음 — SafetyMan에서 확인).',
        '8. 백태·철근노출 면적율(%)은 앱에 부재면적이 없어 계산하지 않습니다. 해당 결함이 있으면 「(직접 입력)」 칸을 채우세요.',
        '9. 비파괴 시험값(강도·중성화)은 층 단위로 저장돼 있어, 세부단위 시트에는 그 층 값이 공통으로 들어갑니다. 염화물은 앱에 입력 칸이 없어 빈칸입니다.',
        '10. 부재변형·기울기·부동침하는 이 파일에 넣지 않았습니다(건물 전체 항목). 등급 계산은 하지 않습니다 — SafetyMan에서 계산하세요.'
    ];

    var api = { buildSheets: buildSheets, buildSamples: buildSamples, memberType: memberType, defectKind: defectKind,
        crackWidthOf: crackWidthOf, crackBand: crackBand, spallDepthOf: spallDepthOf, spallBand: spallBand, NOTES: NOTES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.safetymanExport = api; }
})(typeof window !== 'undefined' ? window : null);
