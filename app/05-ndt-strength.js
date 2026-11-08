// @@app-part 05-ndt-strength.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 콘크리트 강도(반발경도) 추정 엔진 ---
    // 회사에서 쓰던 엑셀(반발경도-고강도포함) 자료를 그대로 옮겼다.
    // 각 행: [R, 0도 보정값, +90도 보정값, +45도 보정값, -45도 보정값, -90도 보정값]
    // 원본 엑셀의 R=80 행은 R=70 행이 그대로 복사되어 있던 오류였다(0/-1.50/-1.10/1.10/1.20로 동일).
    // R=70~79 구간의 일정한 변화폭(예: +90도 보정값이 한 칸당 +0.08씩 증가)을 그대로 이어서
    // R=80 값을 다시 계산해 넣었다: 0/-0.70/-0.60/0.90/0.70.
    const CONCRETE_ANGLE_CORRECTION_TABLE = [
        [10, 0, 0, 0, 2.40, 3.20], [11, 0, 0, 0, 2.41, 3.22], [12, 0, 0, 0, 2.42, 3.24],
        [13, 0, 0, 0, 2.43, 3.26], [14, 0, 0, 0, 2.44, 3.28], [15, 0, 0, 0, 2.45, 3.30],
        [16, 0, 0, 0, 2.46, 3.32], [17, 0, 0, 0, 2.47, 3.34], [18, 0, 0, 0, 2.48, 3.36],
        [19, 0, 0, 0, 2.49, 3.38], [20, 0, -5.40, -3.50, 2.50, 3.40], [21, 0, -5.33, -3.46, 2.48, 3.37],
        [22, 0, -5.26, -3.42, 2.46, 3.34], [23, 0, -5.19, -3.38, 2.44, 3.31], [24, 0, -5.12, -3.34, 2.42, 3.28],
        [25, 0, -5.05, -3.30, 2.40, 3.25], [26, 0, -4.98, -3.26, 2.38, 3.22], [27, 0, -4.91, -3.22, 2.36, 3.19],
        [28, 0, -4.84, -3.18, 2.34, 3.16], [29, 0, -4.77, -3.14, 2.32, 3.13], [30, 0, -4.70, -3.10, 2.30, 3.10],
        [31, 0, -4.62, -3.05, 2.27, 3.06], [32, 0, -4.54, -3.00, 2.24, 3.02], [33, 0, -4.46, -2.95, 2.21, 2.98],
        [34, 0, -4.38, -2.90, 2.18, 2.94], [35, 0, -4.30, -2.85, 2.15, 2.90], [36, 0, -4.22, -2.80, 2.12, 2.86],
        [37, 0, -4.14, -2.75, 2.09, 2.82], [38, 0, -4.06, -2.70, 2.06, 2.78], [39, 0, -3.98, -2.65, 2.03, 2.74],
        [40, 0, -3.90, -2.60, 2.00, 2.70], [41, 0, -3.82, -2.55, 1.95, 2.65], [42, 0, -3.74, -2.50, 1.90, 2.60],
        [43, 0, -3.66, -2.45, 1.85, 2.55], [44, 0, -3.58, -2.40, 1.80, 2.50], [45, 0, -3.50, -2.35, 1.75, 2.45],
        [46, 0, -3.42, -2.30, 1.70, 2.40], [47, 0, -3.34, -2.25, 1.65, 2.35], [48, 0, -3.26, -2.20, 1.60, 2.30],
        [49, 0, -3.18, -2.15, 1.55, 2.25], [50, 0, -3.10, -2.10, 1.50, 2.20], [51, 0, -3.02, -2.05, 1.48, 2.15],
        [52, 0, -2.94, -2.00, 1.46, 2.10], [53, 0, -2.86, -1.95, 1.44, 2.05], [54, 0, -2.78, -1.90, 1.42, 2.00],
        [55, 0, -2.70, -1.85, 1.40, 1.95], [56, 0, -2.62, -1.80, 1.38, 1.90], [57, 0, -2.54, -1.75, 1.36, 1.85],
        [58, 0, -2.46, -1.70, 1.34, 1.80], [59, 0, -2.38, -1.65, 1.32, 1.75], [60, 0, -2.30, -1.60, 1.30, 1.70],
        [61, 0, -2.22, -1.55, 1.28, 1.65], [62, 0, -2.14, -1.50, 1.26, 1.60], [63, 0, -2.06, -1.45, 1.24, 1.55],
        [64, 0, -1.98, -1.40, 1.22, 1.50], [65, 0, -1.90, -1.35, 1.20, 1.45], [66, 0, -1.82, -1.30, 1.18, 1.40],
        [67, 0, -1.74, -1.25, 1.16, 1.35], [68, 0, -1.66, -1.20, 1.14, 1.30], [69, 0, -1.58, -1.15, 1.12, 1.25],
        [70, 0, -1.50, -1.10, 1.10, 1.20], [71, 0, -1.42, -1.05, 1.08, 1.15], [72, 0, -1.34, -1.00, 1.06, 1.10],
        [73, 0, -1.26, -0.95, 1.04, 1.05], [74, 0, -1.18, -0.90, 1.02, 1.00], [75, 0, -1.10, -0.85, 1.00, 0.95],
        [76, 0, -1.02, -0.80, 0.98, 0.90], [77, 0, -0.94, -0.75, 0.96, 0.85], [78, 0, -0.86, -0.70, 0.94, 0.80],
        [79, 0, -0.78, -0.65, 0.92, 0.75], [80, 0, -0.70, -0.60, 0.90, 0.70]
    ];
    const CONCRETE_ANGLE_COLUMN_INDEX = { '0': 1, '90': 2, '45': 3, '-45': 4, '-90': 5 };

    // 각도별 보정값 표에서 R값에 해당하는 보정값을 찾는다. R은 정수로 반올림해 그 행을 쓰고,
    // 표 범위(10~80) 밖이면 가장 가까운 끝 행 값을 그대로 쓴다.
    function getAngleCorrection(rValue, angleDeg) {
        const colIdx = CONCRETE_ANGLE_COLUMN_INDEX[String(angleDeg)];
        if (colIdx === undefined) return 0;
        const table = CONCRETE_ANGLE_CORRECTION_TABLE;
        // 엑셀과 같이 R을 반올림한 행의 값을 그대로 쓴다: INDEX(각도보정, ROUND(R-9,0), 각도열)
        // (예전엔 앞뒤 행 사이를 보간해 엑셀과 소수점이 어긋났다, 2026-09-22)
        const r = Math.min(Math.max(excelRound(rValue, 0), table[0][0]), table[table.length - 1][0]);
        const row = table[r - table[0][0]];
        return row ? row[colIdx] : 0;
    }

    // 압축강도 추정식 3가지 (사용자 회사 자료 기준)
    // kgf/cm² → MPa 환산은 회사 엑셀(정밀점검 평가 통합 — 출력 시트 P열)과 같이 ×0.1.
    // 예전엔 ×0.098이라 식마다 약 0.7MPa, 최종 강도가 0.5MPa 가량 낮게 나왔다(2026-09-22).
    const CONCRETE_STRENGTH_FORMULAS = [
        { name: '일본재료학회식', expr: 'Fc = (13Ro - 184) × 0.1', calc: (ro) => (13 * ro - 184) * 0.1 },
        { name: '일본건축학회 제안식', expr: 'Fc = (7.3Ro + 100) × 0.1', calc: (ro) => (7.3 * ro + 100) * 0.1 },
        { name: '과학기술부식', expr: 'Fc = (15.2Ro - 112.8) × 0.1', calc: (ro) => (15.2 * ro - 112.8) * 0.1 }
    ];

    // 성과표 맨 밑에 적는 적용 추정식 줄. 번호(1식/2식/3식)는 성과표 압축강도 칸과 같이 전체 식 순서 기준.
    function getStrengthFormulaLegendLines(enabledNames) {
        return CONCRETE_STRENGTH_FORMULAS
            .map((f, i) => ({ f, i }))
            .filter(x => !enabledNames || enabledNames.includes(x.f.name))
            .map(x => `${x.i + 1}식  ${x.f.name} : ${x.f.expr} (MPa)`);
    }

    // 엑셀 ROUND와 같은 반올림(0.5는 0에서 먼 쪽). 37.65×10이 376.4999…로 떨어져 내려 반올림되는
    // 부동소수 오차를 엑셀처럼 15자리에서 한 번 정리한 뒤 반올림한다.
    function excelRound(x, digits) {
        if (!Number.isFinite(x)) return x;
        const f = Math.pow(10, digits || 0);
        const v = Number((Math.abs(x) * f).toPrecision(15));
        return (x < 0 ? -1 : 1) * Math.round(v) / f;
    }

    // 반발경도 앤빌 검정 기준값(엑셀 출력 시트 L6 = 82). 장비 앤빌 평균은 건물 설정(strengthAnvilAvg).
    const STRENGTH_ANVIL_STANDARD = 82;
    function getStrengthAnvilAvg(bldg) {
        const v = parseFloat(bldg && bldg.strengthAnvilAvg);
        return Number.isFinite(v) && v > 0 ? v : null;
    }

    // 화면·출력 숫자도 엑셀처럼 반올림해 보여 준다(toFixed는 30.35를 30.3으로 내림)
    function fmtExcel(x, digits) {
        return Number.isFinite(x) ? excelRound(x, digits).toFixed(digits) : '-';
    }

    // ±20% 제외 — 엑셀 강도입력 시트: 평균×0.8 < R < 평균×1.2 인 값만 남긴다(경계값과 같으면 제외)
    function isStrengthOutlierValue(v, rawAvg) {
        return !(v > rawAvg * 0.8 && v < rawAvg * 1.2);
    }

    // R값 목록(최대 20개) → ±20% 이상 벗어난 값 제외(KS F 2732 관례) → 재평균 → 각도보정(Ro) →
    // 3개 추정식 결과까지 한 번에 계산한다.
    // 강도비(αc, %) → 등급표. a/b는 둘 다 100% 이상이고 손상 유무로만 갈리므로(수치만으로는
    // 자동 판정 불가) hasDamage(손상 여부 입력)로 갈라 판정하고, 그 아래(c/d/e)는 강도비 구간으로
    // 자동 판정 가능하다.
    function getStrengthGrade(ratioPercent, hasDamage) {
        if (ratioPercent >= 100) {
            return hasDamage
                ? { label: 'b등급 (100% 이상 — 균열 등 손상 있음)', code: 'b' }
                : { label: 'a등급 (100% 이상 — 손상 없음)', code: 'a' };
        }
        if (ratioPercent >= 85) return { label: 'c', code: 'c' };
        if (ratioPercent >= 70) return { label: 'd', code: 'd' };
        return { label: 'e', code: 'e' };
    }

    // 건물별로 평균에 포함할 추정식을 고를 수 있게 한다. 아직 한 번도 고르지 않은 건물(설정값
    // 없음)은 일본재료학회식·일본건축학회 제안식 2개를 기본으로 쓴다(2026-09-22 사용자 요청,
    // 예전에는 3개 전부였다).
    const DEFAULT_STRENGTH_FORMULA_NAMES = ['일본재료학회식', '일본건축학회 제안식'];
    function getEnabledStrengthFormulaNames(bldg) {
        const all = CONCRETE_STRENGTH_FORMULAS.map(f => f.name);
        const saved = bldg && Array.isArray(bldg.enabledStrengthFormulas) ? bldg.enabledStrengthFormulas : null;
        const picked = all.filter(name => (saved || DEFAULT_STRENGTH_FORMULA_NAMES).includes(name));
        return picked.length ? picked : all;
    }

    // 추정식 포함/제외 체크박스 클릭 시 건물 설정에 저장하고 다시 계산한다.
    window.toggleStrengthFormula = function(formulaName) {
        const bldg = window.state.currentBuilding;
        if (!bldg) return;
        const current = getEnabledStrengthFormulaNames(bldg);
        const isCurrentlyEnabled = current.includes(formulaName);
        // 마지막 남은 하나까지 끄면 "설정 안 함(=전체 포함)"과 구분이 안 돼 조용히 3개
        // 전부 되돌아오므로, 최소 1개는 항상 켜져 있도록 막는다.
        if (isCurrentlyEnabled && current.length <= 1) {
            if (typeof window.showToast === 'function') {
                window.showToast('추정식은 최소 1개는 선택되어 있어야 합니다.', 'error', 3000);
            }
            recalcAllStrengthSlots();
            return;
        }
        const next = isCurrentlyEnabled ? current.filter(n => n !== formulaName) : [...current, formulaName];
        bldg.enabledStrengthFormulas = next;
        // 수정 표시를 찍어야 동기화 병합에서 서버의 옛 값에 덮이지 않는다
        markBuildingMetaDirty(bldg);
        saveStateToLocalStorage();
        recalcAllStrengthSlots();
    };

    // 계산 순서는 회사 엑셀(강도입력·출력 시트)과 똑같이 맞춘다(2026-09-22):
    //  ① 입력한 R값 평균(직접 입력한 0도 포함, 빈칸은 제외) → ② 평균×0.8 < R < 평균×1.2 만 남겨 재평균
    //  ③ 각도보정 = 재평균을 반올림한 R 행의 보정값(보간 없음) → ④ Ro = ROUND(재평균+보정, 1)
    //  ⑤ 추정식에 Ro 대입 → 고른 식 평균 → ⑥ 최종 강도 = ROUND(평균 × α, 1)
    //  앤빌 보정(엑셀 출력 시트 L열): 재평균 × (기준 82 ÷ 장비 앤빌 평균). 각도보정 행은 보정 전 재평균으로 찾는다.
    //  anvilAvg가 없거나 0 이하면 보정 없음(×1).
    function calcConcreteStrength(readings, angleDeg, ageDays, enabledFormulaNames, anvilAvg) {
        const nums = (readings || []).map(v => parseFloat(v)).filter(v => !isNaN(v) && v >= 0);
        if (nums.length === 0) return null;

        const rawAvg = nums.reduce((a, b) => a + b, 0) / nums.length;
        if (!(rawAvg > 0)) return null;
        const kept = nums.filter(v => !isStrengthOutlierValue(v, rawAvg));
        const excludedCount = nums.length - kept.length;
        // 전부 제외되는 극단적인 경우(엑셀은 #DIV/0!) 방지용 안전장치 — 0 아닌 값으로 평균
        const finalSet = kept.length > 0 ? kept : nums.filter(v => v > 0);
        const finalAvg = finalSet.reduce((a, b) => a + b, 0) / finalSet.length;

        const anvil = Number(anvilAvg);
        const anvilFactor = (Number.isFinite(anvil) && anvil > 0) ? STRENGTH_ANVIL_STANDARD / anvil : 1;
        const correction = getAngleCorrection(finalAvg, angleDeg);
        const ro = excelRound(finalAvg * anvilFactor + correction, 1);

        const enabledNames = (enabledFormulaNames && enabledFormulaNames.length > 0)
            ? enabledFormulaNames
            : CONCRETE_STRENGTH_FORMULAS.map(f => f.name);
        const results = CONCRETE_STRENGTH_FORMULAS.map(f => ({
            name: f.name,
            value: f.calc(ro),
            enabled: enabledNames.includes(f.name)
        }));

        // 최종 강도(FC) = 체크된 추정식 결과 평균 × α(재령보정계수). 하나도 안 골랐으면(실수로
        // 전부 해제) 평균이 안 나오니 안전하게 3개 전부로 되돌려 계산한다. 준공일이 없어 재령을
        // 못 구하면 α 없이(=1) 평균값을 그대로 최종 강도로 보여준다.
        const includedResults = results.filter(r => r.enabled);
        const avgSource = includedResults.length > 0 ? includedResults : results;
        const formulaAvg = avgSource.reduce((a, r) => a + r.value, 0) / avgSource.length;
        const alpha = getAgeCorrectionFactor(ageDays);
        const finalStrength = excelRound(formulaAvg * (alpha !== null ? alpha : 1), 1);

        return {
            totalCount: nums.length,
            excludedCount,
            rawAvg,
            finalAvg,
            anvilAvg: anvilFactor !== 1 ? anvil : null,
            anvilFactor,
            correction,
            ro,
            results,
            formulaAvg,
            ageDays: ageDays !== undefined ? ageDays : null,
            alpha,
            finalStrength
        };
    }

    function strengthSlotHasReadings(slot) {
        return !!(slot && Array.isArray(slot.readings)
            && slot.readings.some(v => v !== '' && v !== null && v !== undefined));
    }

    /** 위치 슬롯 하나의 강도 결과 — 저장·다시 계산이 같은 식을 쓴다 */
    function computeStrengthSlotResult(slot, opts) {
        const calc = calcConcreteStrength(slot.readings, opts.angle, opts.ageDays, opts.enabledNames, opts.anvilAvg);
        const ds = opts.designStrength;
        const ratio = (calc && Number.isFinite(ds) && ds > 0) ? (calc.finalStrength / ds) * 100 : null;
        const gradeObj = ratio !== null ? getStrengthGrade(ratio, opts.hasDamage) : null;
        return {
            location: slot.location || '',
            readings: (slot.readings || []).slice(),
            photoId: slot.photoId || null,
            results: calc ? calc.results : [],
            ro: calc ? calc.ro : null,
            ageDays: calc ? calc.ageDays : null,
            alpha: calc ? calc.alpha : null,
            formulaAvg: calc ? calc.formulaAvg : null,
            finalStrength: calc ? calc.finalStrength : null,
            ratio,
            grade: gradeObj ? gradeObj.code : null
        };
    }

    /**
     * 저장된 강도 항목을 지금 계산식으로 다시 계산한 사본(원본·저장 데이터는 안 바꾼다).
     * 계산식이 바뀌어도(2026-09-22 엑셀 방식) 목록·통계·한글 출력이 옛 저장값을 쓰지 않게 한다.
     * R값이 없는 슬롯은 저장된 결과를 그대로 둔다.
     */
    function refreshStrengthItemResults(item, bldg) {
        if (!item || item.category !== '강도') return item;
        const slots = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 0
            ? item.strengthSlots
            : (Array.isArray(item.strengthReadings) && item.strengthReadings.length > 0
                ? [{ location: item.location || '', readings: item.strengthReadings }]
                : []);
        if (!slots.some(strengthSlotHasReadings)) return item;
        bldg = bldg || window.state.currentBuilding;
        const ds = parseFloat(item.designStrength);
        const opts = {
            angle: parseFloat(item.strengthAngle),
            // 2026-10-19 재령일 직접 입력(이 항목 > 건물 공통 > 준공일 자동)
            ageDays: resolveStrengthAgeInfo(item, bldg).days,
            enabledNames: getEnabledStrengthFormulaNames(bldg),
            anvilAvg: getStrengthAnvilAvg(bldg),
            designStrength: Number.isFinite(ds) ? ds : NaN,
            hasDamage: item.damageStatus === '균열발생'
        };
        const fresh = slots.map(s => (strengthSlotHasReadings(s)
            ? Object.assign({}, s, computeStrengthSlotResult(s, opts))
            : s));
        const first = fresh[0] || {};
        return Object.assign({}, item, {
            strengthSlots: fresh,
            strengthResults: first.results || [],
            strengthRo: first.ro != null ? first.ro : null,
            strengthAgeDays: first.ageDays != null ? first.ageDays : null,
            strengthAlpha: first.alpha != null ? first.alpha : null,
            strengthFormulaAvg: first.formulaAvg != null ? first.formulaAvg : null,
            strengthFinal: first.finalStrength != null ? first.finalStrength : null,
            strengthRatio: first.ratio != null ? first.ratio : null,
            strengthGrade: first.grade != null ? first.grade : null
        });
    }
    window.refreshStrengthItemResults = refreshStrengthItemResults;

    /**
     * 2026-10-19 「준공일 데이터를 나중에 입력하면 재령일 적용이 안되는 버그」: 탄산화도 저장할 때의 재령으로
     * 수명·잔존수명이 굳어 있었다. 강도와 같이 보여 줄 때·내보낼 때 지금 준공일로 다시 계산한 사본을 쓴다
     * (저장 데이터는 안 바꾼다). 깊이·피복이 없어 계산이 안 되면 저장값 그대로.
     */
    function refreshCarbItemResults(item, bldg) {
        if (!item || item.category !== '탄산화') return item;
        const calcBldg = (bldg && typeof bldg === 'object') ? bldg : window.state.currentBuilding;
        const ageDays = getConcreteAgeInDays(calcBldg);
        const calc = calcCarbonation(parseFloat(item.carbDepth), parseFloat(item.carbCover), ageDays !== null ? ageDays / 365 : null);
        if (!calc) return item;
        return Object.assign({}, item, {
            carbAgeDays: ageDays,
            carbRemainMm: calc.remainMm,
            carbRate: calc.rate,
            carbLifeYears: calc.lifeYears,
            carbRemainingLifeYears: calc.remainingLifeYears
        });
    }
    window.refreshCarbItemResults = refreshCarbItemResults;

    // 콘크리트 반발경도 성과표(hwpx 내보내기 전용) — NO. 하나(위치 슬롯 하나)의 반발치 원시값
    // 5행×4열 그리드, 평균경도(R)·각도보정·Ro, 재령·α, 압축강도(식별 1식/2식/3식)+최종강도,
    // 막대그래프를 한 장의 캔버스 이미지로 그린다. ±20% 밖이라 제외된 값은 그래프/숫자 모두
    // 다른 색으로 표시한다.
    function renderStrengthPerfPointCanvas(seq, item, slot, readings, calc) {
        const W = 2200, H = 620;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 3;
        ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

        const colX = [0, 300, 820, 1110, 1340, 1680, W];
        ctx.lineWidth = 1.5;
        for (let i = 1; i < colX.length - 1; i++) {
            ctx.beginPath();
            ctx.moveTo(colX[i], 0);
            ctx.lineTo(colX[i], H);
            ctx.stroke();
        }

        const rawAvg = calc.rawAvg;
        const isOutlier = (v) => isStrengthOutlierValue(v, rawAvg);

        // 1) 측정위치
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 34px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.fillText(`NO.${String(seq).padStart(2, '0')}`, (colX[0] + colX[1]) / 2, 75);
        // 2026-09-04 사용자 요청: 위치 글씨가 너무 작아 안 보인다고 해서 NO.와 같은 글꼴/크기로 맞춤.
        ctx.font = 'bold 34px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        [slot.location || item.location || '', memberNameOut(item.component) || ''].filter(Boolean).forEach((line, i) => {
            ctx.fillText(line, (colX[0] + colX[1]) / 2, 150 + i * 42);
        });

        // 2) 반발치 그리드 (5행 × 4열, ±20% 초과 제외값은 주황색)
        // 2026-09-04: R값 글씨 크기를 2배로 키움(24px→48px) — 셀 높이도 같이 키워서 안 겹치게 함.
        const gridX0 = colX[1] + 25, gridX1 = colX[2] - 25;
        const gridCols = 4, gridRows = 5, cellH = 80, gridY0 = 45;
        const cellW = (gridX1 - gridX0) / gridCols;
        ctx.font = '48px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        readings.forEach((v, idx) => {
            if (idx >= gridCols * gridRows) return;
            const r = Math.floor(idx / gridCols), c = idx % gridCols;
            ctx.fillStyle = isOutlier(v) ? '#c2410c' : '#111111';
            ctx.fillText(String(v), gridX0 + c * cellW + cellW / 2, gridY0 + r * cellH + cellH / 2);
        });
        ctx.fillStyle = '#555555';
        // 2026-09-04 사용자 요청: 작은 글씨들이 안 보인다고 해서 Ro값(32px)만큼 전부 키움.
        ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`(총 ${calc.totalCount}개 · ±20% 제외 ${calc.excludedCount}개)`, gridX0, gridY0 + gridRows * cellH + 30);

        // 3) 평균경도(R) · 각도보정 · Ro
        ctx.textAlign = 'center';
        const c3x = (colX[2] + colX[3]) / 2;
        ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
        ctx.fillText('평균경도(R)', c3x, 45);
        ctx.font = 'bold 42px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#111111';
        ctx.fillText(fmtExcel(calc.finalAvg, 1), c3x, 105);
        ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
        ctx.fillText(`각도보정 ${calc.correction >= 0 ? '+' : ''}${calc.correction.toFixed(2)}`, c3x, 165);
        ctx.font = 'bold 32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#0369a1';
        // Ro는 엑셀처럼 소수 1자리로 반올림된 값이다(2026-09-22)
        ctx.fillText(`Ro = ${calc.ro.toFixed(1)}`, c3x, 225);
        if (calc.anvilFactor && calc.anvilFactor !== 1) {
            // 앤빌 보정(엑셀 "Anvil기준 82 / 장비평균 = 보정" 칸)은 1.00이 아닐 때만 적는다
            ctx.font = '28px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
            ctx.fillText(`앤빌 82/${calc.anvilAvg} = ${calc.anvilFactor.toFixed(3)}`, c3x, 285);
        }

        // 4) 재령 · α(재령보정계수)
        const c4x = (colX[3] + colX[4]) / 2;
        ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
        ctx.fillText('재령(일)', c4x, 45);
        ctx.font = 'bold 34px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#111111';
        ctx.fillText(calc.ageDays != null ? String(calc.ageDays) : '-', c4x, 110);
        ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
        ctx.fillText('α(재령보정)', c4x, 180);
        ctx.font = 'bold 32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#111111';
        ctx.fillText(calc.alpha != null ? calc.alpha.toFixed(2) : '-', c4x, 235);

        // 5) 압축강도(Fc): 활성화된 추정식만 1식/2식/3식 순서로, 맨 아래 최종 강도(굵게)
        const c5x0 = colX[4] + 20, c5x1 = colX[5] - 20;
        ctx.textAlign = 'left'; ctx.font = 'bold 32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#555555';
        ctx.fillText('압축강도(Fc, MPa)', c5x0, 40);
        let fy = 90;
        calc.results.forEach((r, i) => {
            if (!r.enabled) return;
            ctx.font = '32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#333333'; ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}식`, c5x0, fy);
            ctx.font = 'bold 32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#111111'; ctx.textAlign = 'right';
            ctx.fillText(fmtExcel(r.value, 1), c5x1, fy);
            fy += 54;
        });
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(c5x0, fy - 15); ctx.lineTo(c5x1, fy - 15); ctx.stroke();
        ctx.font = 'bold 32px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#333333'; ctx.textAlign = 'left';
        ctx.fillText('강도', c5x0, fy + 28);
        ctx.font = 'bold 40px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'; ctx.fillStyle = '#b91c1c'; ctx.textAlign = 'right';
        ctx.fillText(calc.finalStrength.toFixed(1), c5x1, fy + 28);

        // 6) 막대그래프 — ±20% 제외값은 옅은 빨강, 점선은 평균경도(R) 위치
        const chX0 = colX[5] + 20, chX1 = colX[6] - 20, chY0 = 35, chY1 = H - 35;
        const maxV = Math.max(...readings) * 1.15;
        const barGap = 5;
        const barW = (chX1 - chX0 - barGap * (readings.length - 1)) / readings.length;
        ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(chX0, chY1); ctx.lineTo(chX1, chY1); ctx.stroke();
        readings.forEach((v, i) => {
            const bh = (v / maxV) * (chY1 - chY0);
            const bx = chX0 + i * (barW + barGap);
            ctx.fillStyle = isOutlier(v) ? '#fca5a5' : '#93c5fd';
            ctx.fillRect(bx, chY1 - bh, barW, bh);
        });
        const avgY = chY1 - (calc.finalAvg / maxV) * (chY1 - chY0);
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
        ctx.beginPath(); ctx.moveTo(chX0, avgY); ctx.lineTo(chX1, avgY); ctx.stroke();
        ctx.setLineDash([]);

        return canvas;
    }

    // 성과표 맨 밑(마지막 NO. 아래)에 붙이는 적용 추정식 줄 — NO. 그림과 같은 폭·글꼴(2026-10-14 사용자 요청)
    function renderStrengthPerfLegendCanvas(enabledNames) {
        const lines = getStrengthFormulaLegendLines(enabledNames);
        const W = 2200, lineH = 52, padY = 14;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = padY * 2 + lineH * Math.max(1, lines.length);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, canvas.height);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111111';
        ctx.font = '34px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        lines.forEach((line, i) => {
            ctx.fillText(line, 20, padY + lineH * i + lineH / 2);
        });
        return canvas;
    }

    // 콘크리트 반발경도 측정 DATA(hwpx 내보내기 전용) — 실제 측정지 사진을 저장 안 해둔 위치의
    // 대체 이미지. 이 이미지가 들어가는 표 칸의 가로세로 비율(aspect = 폭/높이)은 위치 개수(전체를
    // 한 표에 가로로 다 펼치므로 개수가 늘수록 칸이 좁아짐)에 따라 매번 달라져서, 호출부가 실제
    // 칸 비율을 넘겨주면 캔버스를 그 비율에 딱 맞게 그린다(=축소 없이 칸을 꽉 채움). 줄 수(20개
    // 고정이 아니라 실제 입력된 개수)에 맞춰 줄 높이·글자 크기도 매번 다시 계산한다.
    /**
     * 한글 표의 각 행(tr) 안 칸(tc)을 칸 주소(colAddr) 순서로 다시 놓는다.
     * 기울기·부동침하·부재변위 결과표(501~503) 템플릿은 XML 속 칸 순서가 0,1,3,4,2,5,6(제목행 0,3,2,5,6)으로
     * 뒤섞여 있다. 한글은 칸 주소대로 그려서 겉모양은 맞지만, 칸을 누르면 커서가 엉뚱한 칸에서 깜빡이고
     * 복사해 엑셀에 붙이면 열이 틀어졌다(2026-09-22). 내용·서식은 그대로 두고 순서만 바꾼다.
     */
    function sortHwpxRowCellsByColAddr(tbl, hpNs) {
        if (!tbl) return;
        Array.from(tbl.childNodes).filter(tr => tr.localName === 'tr').forEach(tr => {
            const tcs = Array.from(tr.childNodes).filter(c => c.localName === 'tc');
            const colOf = (tc) => {
                const addr = tc.getElementsByTagNameNS(hpNs, 'cellAddr')[0];
                const v = addr ? parseInt(addr.getAttribute('colAddr'), 10) : NaN;
                return Number.isFinite(v) ? v : 0;
            };
            const sorted = tcs.map((tc, i) => ({ tc, i, col: colOf(tc) }))
                .sort((a, b) => (a.col - b.col) || (a.i - b.i));
            if (sorted.every((x, i) => x.i === i)) return;
            sorted.forEach(x => tr.appendChild(x.tc));
        });
    }

    /**
     * 반발경도 성과표 — 한 쪽에 들어가는 NO. 개수. bodyH·imgW는 한글 단위(HWPUNIT), 그림은 폭 imgW로 넣는다.
     * 제목 한 줄·문단 여백 몫으로 1500을 남긴다. 최소 1개.
     */
    function getStrengthPerfPerPage(bodyH, imgW, pxW, pxH, gapPx) {
        if (!(bodyH > 0) || !(imgW > 0) || !(pxW > 0) || !(pxH > 0)) return 1;
        const unit = imgW / pxW;
        const noH = pxH * unit;
        const gapH = (gapPx || 0) * unit;
        return Math.max(1, Math.floor((bodyH - 1500 + gapH) / (noH + gapH)));
    }

    /** 캔버스 여러 장을 폭 그대로 위아래로 이어 붙인 새 캔버스(사이 흰 여백 gapPx) */
    function stackCanvasesVertically(canvases, gapPx) {
        const list = (canvases || []).filter(Boolean);
        const out = document.createElement('canvas');
        const w = list.reduce((m, c) => Math.max(m, c.width), 1);
        const gap = gapPx || 0;
        const h = Math.max(1, list.reduce((sum, c) => sum + c.height, 0) + gap * Math.max(0, list.length - 1));
        out.width = w;
        out.height = h;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        let y = 0;
        list.forEach((c) => {
            ctx.drawImage(c, 0, y);
            y += c.height + gap;
        });
        return out;
    }

    function renderStrengthDataRowCanvas(pt, aspect) {
        const nums = pt.readings.map(v => parseFloat(v)).filter(v => !isNaN(v) && v >= 0);
        const avg = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        // 제외 판정은 calcConcreteStrength와 같은 규칙(엑셀: 평균×0.8 < R < 평균×1.2)
        const isOutlier = (v) => avg > 0 && isStrengthOutlierValue(v, avg);

        const H = 1400;
        const W = Math.max(140, Math.round(H * (aspect || 0.43)));
        const rowCount = pt.readings.length || 1;
        const totalLines = rowCount + 3; // 제목 1줄 + R값 rowCount줄 + AVERAGE 1줄 + ANGLE 1줄
        const lineH = Math.floor((H - 40) / totalLines);
        const fontRow = Math.max(14, Math.min(30, Math.floor(lineH * 0.55)));
        const fontTitle = Math.max(16, Math.min(34, Math.floor(lineH * 0.6)));
        const padX = Math.max(14, Math.round(W * 0.08));

        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        let y = lineH / 2 + 10;
        ctx.textAlign = 'center';
        ctx.font = `bold ${fontTitle}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
        ctx.fillStyle = '#111111';
        ctx.fillText('R VALUE', W / 2, y);
        y += lineH;

        ctx.textAlign = 'left';
        ctx.font = `${fontRow}px monospace`;
        pt.readings.forEach((v, i) => {
            const num = parseFloat(v);
            ctx.fillStyle = isOutlier(num) ? '#c2410c' : '#111111';
            ctx.fillText(`R${String(i + 1).padStart(2, '0')} ${v}`, padX, y);
            y += lineH;
        });

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padX, y - lineH * 0.3);
        ctx.lineTo(W - padX, y - lineH * 0.3);
        ctx.stroke();

        ctx.font = `bold ${fontRow}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
        ctx.fillStyle = '#111111';
        ctx.fillText(`AVERAGE ${avg.toFixed(1)}`, padX, y);
        y += lineH;
        ctx.font = `${fontRow}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
        ctx.fillText(`ANGLE ${Number.isFinite(pt.angle) ? pt.angle : 0}°`, padX, y);

        return canvas;
    }

    // header.xml에 반발경도 측정 DATA 표 전용 테두리 스타일 8개를 새로 만들어 넣는다. 기존
    // 스타일(템플릿 여기저기서 재활용되던 것들)을 그대로 갖다 썼더니, 옆 칸과 짝이 안 맞는 조합
    // (양쪽 다 "테두리 없음"이라 실제로 안 보이는 경계선, 라벨칸마다 제각각인 그라데이션 유무,
    // 가장자리가 얇은 선인 문제)이 계속 나왔다. 그래서 필요한 굵기·그라데이션을 직접 명시해서
    // 새로 만든다 — 표 가장자리(맨 위/왼쪽/오른쪽/맨 아래)만 굵은선(0.4mm), 안쪽 칸 경계는 전부
    // 얇은 실선(0.12mm)으로 통일해서 어느 쪽 셀 기준으로 봐도 항상 선이 그려지게 했다.
    function buildStrengthBorderFillXml(id, { l, r, t, b, gradient }) {
        const W = { THICK: '0.4 mm', THIN: '0.12 mm' };
        const side = (tag, type) => `<hh:${tag}Border type="SOLID" width="${W[type]}" color="#000000"/>`;
        const grad = gradient ? '<hc:fillBrush><hc:gradation type="LINEAR" angle="0" centerX="100" centerY="50" step="50" colorNum="2" stepCenter="50" alpha="0"><hc:color value="#FFFFFF"/><hc:color value="#BBBBBB"/></hc:gradation></hc:fillBrush>' : '';
        return `<hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>${side('left', l)}${side('right', r)}${side('top', t)}${side('bottom', b)}${grad}</hh:borderFill>`;
    }
    const STRENGTH_BORDER_SPECS = [
        ['labelR0', { l: 'THICK', r: 'THIN', t: 'THICK', b: 'THIN', gradient: true }],
        ['labelR1', { l: 'THICK', r: 'THIN', t: 'THIN', b: 'THIN', gradient: true }],
        ['labelR2', { l: 'THICK', r: 'THIN', t: 'THIN', b: 'THICK', gradient: true }],
        ['textR0', { l: 'THIN', r: 'THIN', t: 'THICK', b: 'THIN', gradient: false }],
        ['textR1', { l: 'THIN', r: 'THIN', t: 'THIN', b: 'THIN', gradient: false }],
        ['textR2', { l: 'THIN', r: 'THIN', t: 'THIN', b: 'THICK', gradient: false }],
        ['photoNonLast', { l: 'THIN', r: 'THIN', t: 'THICK', b: 'THICK', gradient: false }],
        ['photoLast', { l: 'THIN', r: 'THICK', t: 'THICK', b: 'THICK', gradient: false }],
    ];
    function injectStrengthDataBorderFills(headerXml) {
        const ids2 = [...headerXml.matchAll(/<hh:borderFill id="(\d+)"/g)].map(m => parseInt(m[1], 10));
        const maxId = ids2.length ? Math.max(...ids2) : 0;
        const ids = {};
        let out = headerXml;
        STRENGTH_BORDER_SPECS.forEach(([name, spec], i) => {
            const id = maxId + 1 + i;
            ids[name] = id;
            out = out.replace('</hh:borderFills>', buildStrengthBorderFillXml(id, spec) + '</hh:borderFills>');
        });
        const bfCnt = (out.match(/<hh:borderFill id="/g) || []).length;
        out = out.replace(/(<hh:borderFills[^>]*itemCnt=")(\d+)(")/, `$1${bfCnt}$3`);
        return { header: out, ids };
    }

    // 콘크리트 반발경도 측정 DATA 표(hwpx 내보내기 전용) — 사용자가 실제 한글에서 손으로 만들어
    // 보내준 정상 예시(구분/위치/평균 경도 3행 × "라벨칸 1 + (NO.칸+사진칸[rowSpan=3]) × 최대 3쌍"
    // = 최대 7칸) 구조를 그대로 옮긴 것이다. 사진칸이 rowSpan=3이라 위치·평균경도 행에서는 그
    // 칸이 아예 생략되고, NO./평균경도는 좁은 텍스트칸에, 사진은 그 옆의 넓고 긴 칸에 3행을
    // 통째로 차지해 들어간다 — 예전처럼 사진과 텍스트를 한 칸에 같이 넣지 않아 행이 늘어나는
    // 문제가 없다. 너비/행높이(LABEL_W/NOTEXT_W/PHOTO_W/ROW_H)는 실제 예시 파일에서 그대로
    // 읽어온 값이고, 테두리는 injectStrengthDataBorderFills()가 새로 만든 스타일(borderIds)을
    // 쓴다. 텍스트(NO./위치/평균경도)는 여기서는 빈칸으로 두고, 호출부가 setTcText()로 채운다
    // (줄바꿈 계산을 검증된 공용 로직에 맡김).
    function buildStrengthPhotoRowGroupXml(points, tblId, borderIds) {
        const LABEL_W = 3599, NOTEXT_W = 4957, PHOTO_W = 7787, ROW_H = 9365, TOTAL_H = ROW_H * 3;
        const valueCount = points.length;
        const TOTAL_W = LABEL_W + valueCount * (NOTEXT_W + PHOTO_W);
        const colCnt = 1 + valueCount * 2;

        const textCell = (colAddr, rowAddr, width, height, borderFillIDRef) => `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${borderFillIDRef}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="0" styleIDRef="91" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="13"><hp:t></hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="800" textheight="800" baseline="680" spacing="480" horzpos="0" horzsize="${Math.max(width - 282, 100)}" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="${colAddr}" rowAddr="${rowAddr}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${width}" height="${height}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;

        const photoCell = (colAddr, picId, picInstId, borderFillIDRef) => `<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${borderFillIDRef}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0"><hp:p id="2147483648" paraPrIDRef="0" styleIDRef="91" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="13"><hp:pic id="${picId}" zOrder="48" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${picInstId}" reverse="0"><hp:offset x="0" y="0"/><hp:orgSz width="16260" height="44460"/><hp:curSz width="7507" height="20526"/><hp:flip horizontal="0" vertical="0"/><hp:rotationInfo angle="0" centerX="3753" centerY="10263" rotateimage="1"/><hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="0.461685" e2="0" e3="0" e4="0" e5="0.461673" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo><hc:img binaryItemIDRef="" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="16260" y="0"/><hc:pt2 x="16260" y="44460"/><hc:pt3 x="0" y="44460"/></hp:imgRect><hp:imgClip left="0" right="15660" top="0" bottom="42780"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="15660" dimheight="42780"/><hp:effects/><hp:sz width="7507" widthRelTo="ABSOLUTE" height="20526" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="800" textheight="800" baseline="680" spacing="480" horzpos="0" horzsize="0" flags="393216"/></hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="${colAddr}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="3"/><hp:cellSz width="${PHOTO_W}" height="${TOTAL_H}"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc>`;

        const row0 = [textCell(0, 0, LABEL_W, ROW_H, borderIds.labelR0)];
        const row1 = [textCell(0, 1, LABEL_W, ROW_H, borderIds.labelR1)];
        const row2 = [textCell(0, 2, LABEL_W, ROW_H, borderIds.labelR2)];

        points.forEach((pt, i) => {
            const noCol = 1 + i * 2, picCol = 2 + i * 2;
            const isLastCol = (i === valueCount - 1);
            row0.push(textCell(noCol, 0, NOTEXT_W, ROW_H, borderIds.textR0));
            row0.push(photoCell(picCol, pt._picId, pt._picInstId, isLastCol ? borderIds.photoLast : borderIds.photoNonLast));
            row1.push(textCell(noCol, 1, NOTEXT_W, ROW_H, borderIds.textR1));
            row2.push(textCell(noCol, 2, NOTEXT_W, ROW_H, borderIds.textR2));
        });

        const rows = [row0, row1, row2].map(cells => `<hp:tr>${cells.join('')}</hp:tr>`).join('');

        return `<hp:p id="2147483648" paraPrIDRef="6" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="3"><hp:tbl id="${tblId}" zOrder="47" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="NONE" repeatHeader="1" rowCnt="3" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="2" noAdjust="1"><hp:sz width="${TOTAL_W}" widthRelTo="ABSOLUTE" height="${TOTAL_H}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="141" right="141" top="141" bottom="141"/><hp:inMargin left="140" right="140" top="140" bottom="140"/>${rows}</hp:tbl><hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="${TOTAL_H + 280}" textheight="${TOTAL_H + 280}" baseline="${Math.round((TOTAL_H + 280) * 0.85)}" spacing="1320" horzpos="0" horzsize="42520" flags="393216"/></hp:linesegarray></hp:p>`;
    }

    // hp:tbl 안에서 colAddr/rowAddr로 hp:tc 하나를 찾는다(반발경도 측정 DATA 표에서 NO./위치/
    // 평균경도 칸의 실제 텍스트를 채울 때 씀 — 사진칸은 rowSpan=3이라 rowAddr=0에만 존재).
    // HP_NS는 내보내기 함수 안에서만 지역 선언돼 있어 이 바깥 스코프에선 안 보이므로(ReferenceError:
    // HP_NS is not defined로 실제 내보내기가 깨졌던 원인), 네임스페이스 문자열을 직접 적는다.
    function tcAtAddr(tbl, colAddr, rowAddr) {
        const HP_NS_LOCAL = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
        const tcs = tbl.getElementsByTagNameNS(HP_NS_LOCAL, 'tc');
        for (let i = 0; i < tcs.length; i++) {
            const addr = tcs[i].getElementsByTagNameNS(HP_NS_LOCAL, 'cellAddr')[0];
            if (addr && addr.getAttribute('colAddr') === String(colAddr) && addr.getAttribute('rowAddr') === String(rowAddr)) return tcs[i];
        }
        return null;
    }

    window.toggleNdtModalFields = function() {
        const cat = document.getElementById('ndtCategory')?.value || '강도';
        const stdGrp = document.getElementById('groupNdtStandardFields');
        const tiltGrp = document.getElementById('groupNdtTiltFields');
        const strengthGrp = document.getElementById('groupNdtStrengthFields');
        const carbGrp = document.getElementById('groupNdtCarbonationFields');
        const genericValuesGrp = document.getElementById('groupNdtGenericValues');
        const statusGrp = document.getElementById('groupNdtStatus');
        const damageStatusGrp = document.getElementById('groupNdtDamageStatus');
        const commonLocationGrp = document.getElementById('ndtLocationFieldWrap');
        const measureGrp = document.getElementById('groupNdtMeasureFields');
        const fireproofGrp = document.getElementById('groupNdtFireproofFields');
        const measuredDepthGrp = document.getElementById('groupNdtMeasuredDepth');
        const sectionResultGrp = document.getElementById('groupNdtSectionResult');
        const avgValueGrp = document.getElementById('groupNdtAvgValue');
        const valTitle = document.getElementById('lblNdtValueTitle');
        const avgTitle = document.getElementById('lblNdtAvgTitle');

        const lblHeight = document.getElementById('lblNdtHeight');
        const lblTiltRatio = document.getElementById('lblNdtTiltRatio');
        const lblGrade = document.getElementById('lblNdtGrade');
        const v1El = document.getElementById('ndtVal1');
        const v2El = document.getElementById('ndtVal2');
        const v3El = document.getElementById('ndtVal3');

        const isTiltCat = cat === '기울기';
        placeNdtTiltValueFields(isTiltCat);
        const sideWrap = document.getElementById('ndtTiltSideWrap');
        const dirPadWrap = document.getElementById('ndtDirPadWrap');
        if (sideWrap) sideWrap.style.display = isTiltCat ? '' : 'none';
        if (dirPadWrap) dirPadWrap.style.display = isTiltCat ? 'none' : '';

        // 콘크리트 강도(반발경도)/탄산화는 각자 전용 UI를 쓰고,
        // 나머지 항목(실측/기울기/부재변위)은 기존 1~3회 입력 UI를 그대로 쓴다.
        if (strengthGrp) strengthGrp.style.display = (cat === '강도') ? 'flex' : 'none';
        if (carbGrp) carbGrp.style.display = (cat === '탄산화') ? 'flex' : 'none';
        if (genericValuesGrp) genericValuesGrp.style.display = (cat === '강도' || cat === '탄산화' || cat === '실측' || cat === '내화피복') ? 'none' : 'block';
        // 강도는 위치를 슬롯별로 따로 입력받으므로, 공용 측정위치 칸은 숨긴다.
        if (commonLocationGrp) commonLocationGrp.style.display = (cat === '강도') ? 'none' : '';
        // 부재 실측 전용 필드(설계치수/마감상태/실측 폭·춤/단면적비율)는 실측일 때만 노출.
        // 실측은 기존 1~3회 평균 UI 대신 설계치수와 동일한 폭/춤 입력을 쓰므로 평균값 칸도 숨긴다.
        if (measureGrp) {
            measureGrp.style.display = (cat === '실측') ? 'flex' : 'none';
            if (cat === '실측') measureGrp.style.flexDirection = 'column';
        }
        if (measuredDepthGrp) {
            measuredDepthGrp.style.display = (cat === '실측') ? 'flex' : 'none';
            if (cat === '실측') measuredDepthGrp.style.flexDirection = 'column';
        }
        if (sectionResultGrp) sectionResultGrp.style.display = (cat === '실측') ? 'block' : 'none';
        if (avgValueGrp) avgValueGrp.style.display = (cat === '실측' || cat === '내화피복') ? 'none' : 'block';
        if (fireproofGrp) {
            fireproofGrp.style.display = (cat === '내화피복') ? 'flex' : 'none';
            if (!document.getElementById('ndtFpMemberAvgHint')) {
                const hint = document.createElement('p');
                hint.id = 'ndtFpMemberAvgHint';
                hint.style.cssText = 'margin:0; font-size:0.82rem; color:rgba(40,40,40,0.72);';
                hint.textContent = '플렌지·웨브 최대 6개소를 한 부재 평균으로 냅니다.';
                fireproofGrp.insertBefore(hint, fireproofGrp.firstChild);
            }
            ['ndtFpFlangeAvg', 'ndtFpWebAvg'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.placeholder = '부재평균';
            });
        }
        if (cat === '실측' && !document.getElementById('ndtFinishState')?.options.length) populateNdtFinishStateDropdown(NDT_FINISH_STATE_PRESET[0]);
        if (typeof toggleNdtMeasureDimMode === 'function') toggleNdtMeasureDimMode();
        if (typeof refreshNdtComponentPickBar === 'function') refreshNdtComponentPickBar();
        if (typeof refreshNdtFinishStatePickBar === 'function') refreshNdtFinishStatePickBar();

        if (cat === '부재변위') {
            if (stdGrp) stdGrp.style.display = 'none';
            if (statusGrp) statusGrp.style.display = 'none';
            if (tiltGrp) tiltGrp.style.display = 'flex';
            if (valTitle) valTitle.textContent = '📊 세점 측정값 (양 단부 평균 - 중앙부 = 처짐량 연산)';
            if (avgTitle) avgTitle.textContent = '⚡ 처짐량 (예: 3.2mm)';
            if (lblHeight) lblHeight.textContent = '📏 부재 길이 (L) *';
            if (lblTiltRatio) lblTiltRatio.textContent = '📐 처짐비 (1/L)';
            if (lblGrade) lblGrade.textContent = '🏷️ 처짐 안전등급';
            if (v1El) v1El.placeholder = '단부 1 (예: 5.0mm)';
            if (v2El) v2El.placeholder = '중앙부 (예: 2.0mm)';
            if (v3El) v3El.placeholder = '단부 2 (예: 5.0mm)';
        } else if (cat === '기울기') {
            if (stdGrp) stdGrp.style.display = 'none';
            if (statusGrp) statusGrp.style.display = 'none';
            if (tiltGrp) tiltGrp.style.display = 'flex';
            if (valTitle) valTitle.textContent = '📊 현장 측정값 (1~3회 입력 시 변위량 자동 연산)';
            if (avgTitle) avgTitle.textContent = '⚡ 변위량 (예: 3.2mm)';
            if (lblHeight) lblHeight.textContent = '📏 측정 높이 (H) *';
            if (lblTiltRatio) lblTiltRatio.textContent = '📐 기울기 비율 (1/H)';
            if (lblGrade) lblGrade.textContent = '🏷️ 기울기 안전등급';
            if (v1El) v1El.placeholder = '1회 (예: 3.0mm)';
            if (v2El) v2El.placeholder = '2회 (예: 3.5mm)';
            if (v3El) v3El.placeholder = '3회 (예: 3.0mm)';
        } else if (cat === '실측') {
            if (stdGrp) stdGrp.style.display = 'flex';
            if (statusGrp) statusGrp.style.display = 'none'; // 상태판정 대신 단면적비율(c%)/등급 자동표시
            if (tiltGrp) tiltGrp.style.display = 'none';
            if (valTitle) valTitle.textContent = '📊 실측 폭/치수 측정값 (1~3회 입력 시 평균 자동 연산)';
            if (avgTitle) avgTitle.textContent = '⚡ 실측 폭/치수 평균';
            if (v1El) v1El.placeholder = '1회 측정값(mm)';
            if (v2El) v2El.placeholder = '2회 측정값(mm)';
            if (v3El) v3El.placeholder = '3회 측정값(mm)';
        } else if (cat === '내화피복') {
            if (stdGrp) stdGrp.style.display = 'flex';
            if (statusGrp) statusGrp.style.display = 'none';
            if (tiltGrp) tiltGrp.style.display = 'none';
        } else {
            if (stdGrp) stdGrp.style.display = 'flex';
            if (statusGrp) statusGrp.style.display = 'flex';
            if (tiltGrp) tiltGrp.style.display = 'none';
            if (valTitle) valTitle.textContent = '📊 현장 측정값 (1~3회 입력 시 평균 자동 연산)';
            if (avgTitle) avgTitle.textContent = '⚡ 평균 / 종합 결과값';
            if (v1El) v1El.placeholder = '1회 측정값';
            if (v2El) v2El.placeholder = '2회 측정값';
            if (v3El) v3El.placeholder = '3회 측정값';
        }

        // 콘크리트 강도는 상태판정(양호/주의/보강필요) 대신, a/b등급을 가르는 손상 여부만 물어본다.
        // 탄산화는 둘 다 export에 반영되지 않는 미사용 필드라 같이 숨긴다.
        if (damageStatusGrp) damageStatusGrp.style.display = (cat === '강도') ? 'flex' : 'none';
        if (cat === '강도' || cat === '탄산화') {
            if (statusGrp) statusGrp.style.display = 'none';
        }
    };

    // --- 콘크리트 강도 위치 슬롯 UI (위치+R값 묶음, 최대 3개) ---
    // 같은 부재라도 플렌지/웨브처럼 면마다 따로 타격해서 R값을 20개씩 따로 찍는 경우가 있어서,
    // 위치별로 R값 목록을 따로 관리할 수 있게 슬롯을 둔다. 슬롯 1개(빈 위치)가 기본값.
    const MAX_STRENGTH_SLOTS = 3;
    const MAX_R_VALUES_PER_SLOT = 20;
    let ndtStrengthSlots = [{ location: '', readings: [] }];
    // 비파괴 입력창에 열려 있는 항목의 현장 사진 id 목록(commitNdtFromForm이 item.photoIds로 저장)
    let ndtItemPhotoIds = [];

    // 클라우드 OCR(Cloudflare Worker 프록시 → Cloud Vision) 주소.
    // 비워두면(빈 문자열) 클라우드 시도 없이 기존 Tesseract(로컬) 인식만 사용한다.
    // 배포 방법: cloudflare-worker/README.md 참고.
    const CLOUD_OCR_ENDPOINT = 'https://frosty-king-12ef.dongilgujo2010.workers.dev';

    // 2026-09-16: Gemini를 Cloudflare Worker에서 부르면 Worker 엣지 서버 위치가 매번 달라지고
    // 그중 일부가 Gemini API 미지원 지역이라 "User location is not supported"로 거의 항상
    // 실패했다(유료 결제로도 해결 안 됨 — 위치 문제라 돈 문제가 아니었음). 실측 결과 Cloud
    // Vision보다 Gemini가 도트프린터 숫자 인식률이 훨씬 높아서, Worker를 거치지 않고 사용자
    // 브라우저(실제 국내 인터넷 회선)에서 직접 호출하기로 했다.
    // 키는 절대 이 파일(소스)에 직접 적지 않는다 — GitHub Push Protection이 실제로 막았고,
    // git 히스토리에 영원히 남는 문제도 있다. 대신 scripts/prepare-pages.py가 GitHub Actions의
    // 리포지토리 Secret(GEMINI_API_KEY)을 배포 시점에만 window.GEMINI_DIRECT_API_KEY로 주입한다
    // (.github/workflows/deploy-web.yml 참고). 로컬 개발 서버에는 이 값이 없어서 자동으로
    // 빈 문자열이 되고, 그러면 기존 클라우드(Worker→Vision)로 그대로 폴백한다.
    const GEMINI_DIRECT_API_KEY = (typeof window !== 'undefined' && window.GEMINI_DIRECT_API_KEY) || '';

    function rValueChipsHtml(slotIdx) {
        const readings = ndtStrengthSlots[slotIdx].readings;
        let html = '';
        for (let i = 0; i < MAX_R_VALUES_PER_SLOT; i++) {
            const v = readings[i];
            const val = (v !== null && v !== undefined && v !== '') ? v : '';
            html += `
            <div class="ndt-r-value-cell">
                <input type="number" step="1" min="10" max="80" class="form-control ndt-r-value-input" data-slot="${slotIdx}" data-idx="${i}" value="${val}" placeholder="—" inputmode="numeric">
                <button type="button" class="ndt-r-value-remove" data-slot="${slotIdx}" data-idx="${i}" title="지우기" aria-label="지우기">×</button>
            </div>`;
        }
        return html;
    }

    function wireRValueChipEvents(slotIdx) {
        const container = document.getElementById(`ndtRValuesList-${slotIdx}`);
        if (!container) return;
        container.querySelectorAll('.ndt-r-value-input').forEach(el => {
            el.addEventListener('input', (e) => {
                const idx = parseInt(e.target.dataset.idx, 10);
                const slot = ndtStrengthSlots[slotIdx];
                while (slot.readings.length <= idx) slot.readings.push('');
                slot.readings[idx] = e.target.value;
                recalcStrengthSlot(slotIdx);
                scheduleNdtAutoApply();
            });
        });
        container.querySelectorAll('.ndt-r-value-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx, 10);
                const slot = ndtStrengthSlots[slotIdx];
                while (slot.readings.length <= idx) slot.readings.push('');
                slot.readings[idx] = '';
                while (slot.readings.length > 0 && slot.readings[slot.readings.length - 1] === '') {
                    slot.readings.pop();
                }
                container.innerHTML = rValueChipsHtml(slotIdx);
                wireRValueChipEvents(slotIdx);
                recalcStrengthSlot(slotIdx);
                scheduleNdtAutoApply();
            });
        });
    }

    function addRValueToSlot(slotIdx, value) {
        const slot = ndtStrengthSlots[slotIdx];
        const filledCount = (slot.readings || []).filter(v => v !== '' && v !== null && v !== undefined).length;
        if (filledCount >= MAX_R_VALUES_PER_SLOT) {
            window.showToast(`R값은 위치당 최대 ${MAX_R_VALUES_PER_SLOT}개까지 입력할 수 있습니다.`, 'warning');
            return;
        }
        let idx = (slot.readings || []).findIndex(v => v === '' || v === null || v === undefined);
        if (idx === -1) idx = slot.readings.length;
        if (idx >= MAX_R_VALUES_PER_SLOT) {
            window.showToast(`R값은 위치당 최대 ${MAX_R_VALUES_PER_SLOT}개까지 입력할 수 있습니다.`, 'warning');
            return;
        }
        while (slot.readings.length <= idx) slot.readings.push('');
        slot.readings[idx] = value !== undefined ? value : '';
        const container = document.getElementById(`ndtRValuesList-${slotIdx}`);
        if (container) { container.innerHTML = rValueChipsHtml(slotIdx); wireRValueChipEvents(slotIdx); }
        scheduleNdtAutoApply();
    }

    async function clearRValuesInSlot(slotIdx) {
        const slot = ndtStrengthSlots[slotIdx];
        if (!slot) return;
        const hasValues = (slot.readings || []).some(v => v !== '' && v !== null && v !== undefined);
        if (hasValues && !await window.confirmDelete('이 위치의 R값을 모두 지울까요?')) return;
        slot.readings = [];
        const listContainer = document.getElementById(`ndtRValuesList-${slotIdx}`);
        if (listContainer) {
            listContainer.innerHTML = rValueChipsHtml(slotIdx);
            wireRValueChipEvents(slotIdx);
        }
        const statusEl = document.getElementById(`rScanStatus-${slotIdx}`);
        if (statusEl) statusEl.textContent = '';
        recalcStrengthSlot(slotIdx);
        scheduleNdtAutoApply();
        if (typeof window.showToast === 'function') window.showToast('R값을 초기화했습니다.', 'info', 1500);
    }

    function renderNdtStrengthSlots() {
        const container = document.getElementById('ndtStrengthSlotsContainer');
        if (!container) return;
        container.innerHTML = ndtStrengthSlots.map((slot, idx) => `
            <div style="border:1px solid var(--border-color); border-radius:10px; padding:0.7rem; display:flex; flex-direction:column; gap:0.6rem;">
                <div style="display:flex; gap:0.5rem; align-items:flex-end;">
                    <div class="form-group" style="flex:1; min-width:0; margin:0;">
                        <label class="form-label">📍 측정 위치 ${ndtStrengthSlots.length > 1 ? `(${idx + 1})` : ''}${idx === 0 ? ' *' : ''}</label>
                        <input type="text" class="form-control ndt-strength-slot-location" data-slot="${idx}" value="${slot.location || ''}" placeholder="예: 101동 1F 기둥 C1 하부(플렌지)" style="width:100%; min-width:0; box-sizing:border-box;">
                    </div>
                    ${ndtStrengthSlots.length > 1 ? `<button type="button" class="btn btn-sm btn-outline ndt-strength-slot-remove" data-slot="${idx}" style="border-color:#ef4444; color:#ef4444; flex-shrink:0;" title="이 위치 삭제"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label">📷 R값 측정지 사진 스캔 (사진에서 숫자 자동 인식)</label>
                    <div style="display:flex; gap:0.5rem;">
                        <button type="button" class="btn ndt-strength-slot-scan-btn" data-slot="${idx}" data-mode="camera" style="flex:1; background: linear-gradient(135deg, #2a2a2a, #1f1f1f); color:white; font-size:0.85rem;">
                            <i class="fa-solid fa-camera"></i> 측정지 촬영
                        </button>
                        <button type="button" class="btn ndt-strength-slot-scan-btn" data-slot="${idx}" data-mode="gallery" style="flex:1; background: linear-gradient(135deg, #2a2a2a, #1f1f1f); color:white; font-size:0.85rem;">
                            <i class="fa-solid fa-image"></i> 갤러리에서
                        </button>
                    </div>
                    <div style="font-size:0.72rem; color:var(--text-muted); margin-top:0.25rem;">찍은 뒤 측정지 부분만 잘라서 인식·저장합니다.</div>
                    <div id="rScanStatus-${idx}" style="font-size:0.78rem; color:var(--text-muted); margin-top:0.3rem;"></div>
                    <div id="ndtStrengthPhotoPreview-${idx}" style="margin-top:0.4rem;"></div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label class="form-label" style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                        <span>🔢 R값 (반발경도) — 최대 ${MAX_R_VALUES_PER_SLOT}개, 인식/입력 후 꼭 확인해주세요</span>
                        <span style="display:flex; gap:0.35rem; flex-shrink:0;">
                            <button type="button" class="btn btn-sm btn-outline ndt-strength-slot-clear-r" data-slot="${idx}" style="border-color:#ef4444; color:#ef4444;" title="R값 전체 지우기"><i class="fa-solid fa-eraser"></i> 초기화</button>
                            <button type="button" class="btn btn-sm btn-outline ndt-strength-slot-add-r" data-slot="${idx}" style="border-color:#6b6b6b; color:#6b6b6b;"><i class="fa-solid fa-plus"></i> 추가</button>
                        </span>
                    </label>
                    <div id="ndtRValuesList-${idx}" class="ndt-r-values-grid">${rValueChipsHtml(idx)}</div>
                </div>
                <div style="background: rgba(2,132,199,0.08); border:1px solid rgba(2,132,199,0.3); border-radius:8px; padding:0.7rem 0.9rem; font-size:0.82rem;">
                    <div id="ndtStrengthCalcSummary-${idx}" style="margin-bottom:0.5rem; color:var(--text-muted);">R값을 입력하면 자동으로 계산됩니다.</div>
                    <table style="width:100%; border-collapse:collapse; font-size:0.8rem;">
                        <thead>
                            <tr style="text-align:left; color:var(--text-muted); border-bottom:1px solid rgba(2,132,199,0.3);">
                                <th style="padding:0.25rem 0.4rem; width:1.6rem;">포함</th>
                                <th style="padding:0.25rem 0.4rem;">추정식</th>
                                <th style="padding:0.25rem 0.4rem; text-align:right;">압축강도 (MPa)</th>
                            </tr>
                        </thead>
                        <tbody id="ndtStrengthFormulaResults-${idx}"></tbody>
                    </table>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.ndt-strength-slot-location').forEach(el => {
            el.addEventListener('input', (e) => {
                ndtStrengthSlots[parseInt(e.target.dataset.slot, 10)].location = e.target.value;
                scheduleNdtAutoApply();
            });
        });
        container.querySelectorAll('.ndt-strength-slot-remove').forEach(el => {
            el.addEventListener('click', async (e) => {
                if (!await window.confirmDelete('이 측정 위치와 입력한 R값을 삭제할까요?')) return;
                const idx = parseInt(e.currentTarget.dataset.slot, 10);
                const bldgForRemove = window.state.currentBuilding;
                const removedPhotoId = ndtStrengthSlots[idx] && ndtStrengthSlots[idx].photoId;
                if (bldgForRemove && bldgForRemove.id && removedPhotoId) deleteStrengthPhotoStorage(bldgForRemove.id, removedPhotoId);
                ndtStrengthSlots.splice(idx, 1);
                renderNdtStrengthSlots();
                recalcAllStrengthSlots();
                scheduleNdtAutoApply();
            });
        });
        container.querySelectorAll('.ndt-strength-slot-add-r').forEach(el => {
            el.addEventListener('click', (e) => addRValueToSlot(parseInt(e.currentTarget.dataset.slot, 10), ''));
        });
        container.querySelectorAll('.ndt-strength-slot-clear-r').forEach(el => {
            el.addEventListener('click', (e) => clearRValuesInSlot(parseInt(e.currentTarget.dataset.slot, 10)));
        });
        container.querySelectorAll('.ndt-strength-slot-scan-btn').forEach(el => {
            el.addEventListener('click', async (e) => {
                const idx = parseInt(e.currentTarget.dataset.slot, 10);
                const mode = e.currentTarget.dataset.mode === 'camera' ? 'camera' : 'gallery';
                const picked = await pickImageFromDevice(mode);
                if (!picked) return;
                // 측정지 부분만 잘라서 인식·저장한다(2026-10-04). 취소하면 아무것도 안 바뀐다.
                const file = (window.BsaPhotoCrop && typeof window.BsaPhotoCrop.open === 'function')
                    ? await window.BsaPhotoCrop.open(picked)
                    : picked;
                if (file) scanRValuesFromImage(file, idx);
            });
        });
        const addBtn = document.getElementById('btnAddStrengthSlot');
        if (addBtn) addBtn.style.display = ndtStrengthSlots.length >= MAX_STRENGTH_SLOTS ? 'none' : '';
        ndtStrengthSlots.forEach((slot, idx) => {
            wireRValueChipEvents(idx);
            renderStrengthSlotPhotoPreview(idx);
        });
    }

    // 측정지 사진 스캔 시 원본 사진을 저장해두고(보고서 '측정 DATA' 표에 그대로 넣기 위함),
    // 슬롯 카드 안에 작은 미리보기 + 삭제 버튼을 보여준다.
    async function renderStrengthSlotPhotoPreview(slotIdx) {
        const el = document.getElementById(`ndtStrengthPhotoPreview-${slotIdx}`);
        if (!el) return;
        const slot = ndtStrengthSlots[slotIdx];
        const bldg = window.state.currentBuilding;
        if (!slot || !slot.photoId || !bldg || !bldg.id) { el.innerHTML = ''; return; }
        el.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="ndt-strength-photo-thumb" style="width:48px; height:48px; border-radius:6px; overflow:hidden; background:#eee; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:0.65rem; color:#999;">불러오는중</div>
                <span style="font-size:0.78rem; color:var(--text-muted);">📎 측정지 사진 저장됨</span>
                <button type="button" class="btn btn-sm btn-outline ndt-strength-slot-photo-remove" data-slot="${slotIdx}" style="border-color:#ef4444; color:#ef4444; margin-left:auto;" title="사진 삭제"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        const removeBtn = el.querySelector('.ndt-strength-slot-photo-remove');
        if (removeBtn) removeBtn.addEventListener('click', () => removeStrengthSlotPhoto(slotIdx));
        const url = await loadStrengthPhotoDataUrl(bldg.id, slot.photoId);
        const thumb = el.querySelector('.ndt-strength-photo-thumb');
        if (url && thumb) thumb.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
    }

    async function removeStrengthSlotPhoto(slotIdx) {
        const slot = ndtStrengthSlots[slotIdx];
        if (!slot || !slot.photoId) return;
        if (!await window.confirmDelete('저장된 측정지 사진을 삭제할까요?')) return;
        const bldg = window.state.currentBuilding;
        if (bldg && bldg.id) deleteStrengthPhotoStorage(bldg.id, slot.photoId);
        slot.photoId = null;
        renderStrengthSlotPhotoPreview(slotIdx);
        scheduleNdtAutoApply();
    }

    // R값 스캔에 쓴 원본 사진을 OCR 성공/실패와 무관하게 저장한다 — 보고서 '측정 DATA' 표에
    // 나중에 그대로 넣기 위함. 4:3 크롭 압축(compressDefectPhoto43)은 세로로 긴 측정지 사진을
    // 잘라먹으므로 쓰지 않고, 크롭 없이 긴 변만 줄이는 resizeDataUrlToMaxDim을 쓴다.
    async function savePhotoForStrengthSlot(slotIdx, file) {
        const bldg = window.state.currentBuilding;
        const slot = ndtStrengthSlots[slotIdx];
        if (!bldg || !bldg.id || !slot) return;
        try {
            const rawDataUrl = await fileToDataUrl(file);
            const resized = (typeof window.resizeDataUrlToMaxDim === 'function')
                ? await window.resizeDataUrlToMaxDim(
                    rawDataUrl,
                    (typeof window.getPhotoLongEdge === 'function') ? window.getPhotoLongEdge() : 2000,
                    (typeof window.getPhotoJpegQuality === 'function') ? window.getPhotoJpegQuality() : 0.85
                )
                : rawDataUrl;
            if (!resized) return;
            const oldPhotoId = slot.photoId;
            const photoId = createOverviewPhotoId();
            await saveStrengthPhotoDataUrl(bldg.id, photoId, resized);
            slot.photoId = photoId;
            if (oldPhotoId && oldPhotoId !== photoId) deleteStrengthPhotoStorage(bldg.id, oldPhotoId);
            renderStrengthSlotPhotoPreview(slotIdx);
            scheduleNdtAutoApply();
        } catch (e) {
            console.error('R값 측정지 사진 저장 실패:', e);
        }
    }

    // ---------------------------------------------------------------------------
    // 비파괴 장비조사 현장 사진 (2026-09-28)
    // 항목(item.photoIds)·부동침하 구역(group.photoIds)마다 여러 장. 한글 보고서 "비파괴 장비조사 사진첩"에 들어간다.
    // 저장은 측정지 사진과 같은 str_건물_id(IndexedDB + 클라우드). 사진을 넣고 빼는 건 입력창의 자동 저장을
    // 기다리지 않고 state의 항목에 바로 적는다 — 사진 압축이 끝나기 전에 창을 닫아도 사진이 빠지지 않게.
    // ---------------------------------------------------------------------------
    async function saveNdtFieldPhotoFile(bldgId, file) {
        if (!bldgId || !file) return null;
        const dataUrl = (typeof window.compressDefectPhoto43 === 'function')
            ? await window.compressDefectPhoto43(file)
            : await fileToDataUrl(file);
        if (!dataUrl) return null;
        const photoId = createOverviewPhotoId();
        await saveStrengthPhotoDataUrl(bldgId, photoId, dataUrl);
        return photoId;
    }

    /** rec(항목·구역)의 사진 목록을 바꾸고 동기화 표시를 남긴다 */
    function setNdtRecordPhotoIds(floorKey, rec, ids) {
        rec.photoIds = ids.slice();
        rec.updatedAt = Date.now();
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        saveStateToLocalStorage();
    }

    async function renderNdtFieldPhotoList(containerId, ids, onRemove) {
        const box = document.getElementById(containerId);
        const bldg = window.state.currentBuilding;
        if (!box) return;
        const list = Array.isArray(ids) ? ids : [];
        if (!list.length || !bldg || !bldg.id) {
            box.innerHTML = '<div style="font-size:0.78rem; color:var(--text-muted);">사진 없음 — 보고서 "비파괴 장비조사 사진첩"에 들어갑니다.</div>';
            return;
        }
        box.innerHTML = list.map((pid, i) => `
            <div class="ndt-field-photo-thumb" data-photo-id="${pid}" style="position:relative; width:72px; height:54px; border-radius:6px; overflow:hidden; background:#eee; display:flex; align-items:center; justify-content:center; font-size:0.65rem; color:#999;">
                <span>${i + 1}</span>
                <button type="button" class="ndt-field-photo-remove" data-photo-id="${pid}" title="사진 삭제"
                    style="position:absolute; top:2px; right:2px; width:20px; height:20px; border-radius:50%; border:none; background:rgba(239,68,68,0.9); color:#fff; font-size:0.7rem; line-height:20px; padding:0; cursor:pointer;">&times;</button>
            </div>`).join('');
        box.querySelectorAll('.ndt-field-photo-remove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove(btn.dataset.photoId);
            });
        });
        await Promise.all(list.map(async (pid) => {
            const url = await loadStrengthPhotoDataUrl(bldg.id, pid);
            const cell = box.querySelector(`.ndt-field-photo-thumb[data-photo-id="${pid}"]`);
            const label = cell && cell.querySelector('span');
            if (url && label) label.outerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;">`;
        }));
    }

    function findNdtItemInFloor(floorKey, id) {
        return ((window.state.ndtData || {})[floorKey] || []).find((x) => x && x.id === id) || null;
    }

    function findNdtDispGroupInFloor(floorKey, id) {
        return ((window.state.ndtDisplacementGroups || {})[floorKey] || []).find((g) => g && g.id === id) || null;
    }

    /**
     * 사진 추가·삭제를 항목·구역 하나에 적용한다.
     * getRec(): 지금 state의 레코드(없으면 null — 그 사이 지워짐), after(ids): 화면 갱신
     */
    async function addNdtFieldPhotos(files, floorKey, getRec, after) {
        const bldgId = window.state.currentBuildingId;
        const picked = Array.from(files || []).filter(Boolean);
        if (!bldgId || !picked.length) return;
        for (const file of picked) {
            let pid = null;
            try {
                pid = await saveNdtFieldPhotoFile(bldgId, file);
            } catch (e) {
                console.error('비파괴 현장 사진 저장 실패:', e);
            }
            if (!pid) continue;
            const rec = getRec();
            if (!rec) {
                // 사진을 저장하는 사이 항목이 지워졌다 — 붙일 곳이 없으니 방금 올린 사진도 정리
                deleteStrengthPhotoStorage(bldgId, pid);
                return;
            }
            setNdtRecordPhotoIds(floorKey, rec, ndtFieldPhotoIdsOf(rec).concat(pid));
            after(rec.photoIds);
        }
    }

    async function removeNdtFieldPhoto(pid, floorKey, getRec, after) {
        const rec = getRec();
        if (!rec || !pid) return;
        if (!await window.confirmDelete('이 사진을 삭제할까요?')) return;
        setNdtRecordPhotoIds(floorKey, rec, ndtFieldPhotoIdsOf(rec).filter((p) => p !== pid));
        // 클라우드만 정리하고 이 기기 사본은 남긴다(되돌리기·백업 되살리기 대비). 다른 항목이 같은 사진을 쓰면 안 지운다.
        releaseStrengthPhotosOfItems(window.state.currentBuildingId, [{ photoIds: [pid] }], { keepLocal: true });
        after(rec.photoIds);
    }

    /** 비파괴 입력창(항목) 사진 */
    function renderNdtItemPhotoList() {
        renderNdtFieldPhotoList('ndtPhotoPreviewList', ndtItemPhotoIds, (pid) => {
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            const pinId = document.getElementById('ndtPinId')?.value;
            removeNdtFieldPhoto(pid, floorKey, () => findNdtItemInFloor(floorKey, pinId), (ids) => {
                ndtItemPhotoIds = ids.slice();
                renderNdtItemPhotoList();
            });
        });
    }

    function bindNdtItemPhotoInputs() {
        const onFiles = async (input) => {
            const files = Array.from(input.files || []);
            input.value = '';
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            let pinId = document.getElementById('ndtPinId')?.value;
            if (!pinId) {
                // 아직 저장 전인 새 항목이면 먼저 확정해 사진을 붙일 곳을 만든다
                const created = commitNdtFromForm();
                if (!created) return;
                pinId = created.id;
                const pinIdEl = document.getElementById('ndtPinId');
                if (pinIdEl) pinIdEl.value = pinId;
            }
            await addNdtFieldPhotos(files, floorKey, () => findNdtItemInFloor(floorKey, pinId), (ids) => {
                // 창이 그 사이 다른 항목으로 바뀌었으면 화면 목록은 건드리지 않는다
                if (document.getElementById('ndtPinId')?.value !== pinId) return;
                ndtItemPhotoIds = ids.slice();
                renderNdtItemPhotoList();
            });
        };
        [['btnTriggerNdtCamera', 'inputNdtCamera'], ['btnTriggerNdtGallery', 'inputNdtPhoto']].forEach(([btnId, inputId]) => {
            const btn = document.getElementById(btnId);
            const input = document.getElementById(inputId);
            if (!btn || !input || btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                input.click();
            });
            input.addEventListener('change', () => onFiles(input));
        });
    }

    /** 부동침하·부재변위 구역(NO.01, NO.02 …) 사진 — 구역 정보 창 */
    function renderNdtDispGroupPhotoList(groupId) {
        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        const group = findNdtDispGroupInFloor(floorKey, groupId);
        renderNdtFieldPhotoList('ndtDispEditPhotoList', ndtFieldPhotoIdsOf(group), (pid) => {
            removeNdtFieldPhoto(pid, floorKey, () => findNdtDispGroupInFloor(floorKey, groupId), () => {
                renderNdtDispGroupPhotoList(groupId);
            });
        });
    }

    function bindNdtDispGroupPhotoInputs() {
        const onFiles = async (input) => {
            const files = Array.from(input.files || []);
            input.value = '';
            const groupId = document.getElementById('ndtDispEditGroupId')?.value;
            if (!groupId) return;
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            await addNdtFieldPhotos(files, floorKey, () => findNdtDispGroupInFloor(floorKey, groupId), () => {
                if (document.getElementById('ndtDispEditGroupId')?.value !== groupId) return;
                renderNdtDispGroupPhotoList(groupId);
                if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
            });
        };
        [['btnNdtDispEditCamera', 'inputNdtDispEditCamera'], ['btnNdtDispEditGallery', 'inputNdtDispEditPhoto']].forEach(([btnId, inputId]) => {
            const btn = document.getElementById(btnId);
            const input = document.getElementById(inputId);
            if (!btn || !input || btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                input.click();
            });
            input.addEventListener('change', () => onFiles(input));
        });
    }

    // 준공일(건축물 개요) ~ 점검일 사이 재령일수를 구한다. null이면 계산 불가(준공일 미입력 등).
    /** 2026-10-20 이 건물 지금 회차의 점검일(회차별 점검일 > 건물 공통 점검일) */
    function getBuildingInspectionDate(bldg, roundKey) {
        if (!bldg) return '';
        const key = roundKey || getBuildingSurveyRoundKey(bldg);
        const mm = window.BSA && window.BSA.buildingMetaMerge;
        if (mm && typeof mm.getRoundDate === 'function') return mm.getRoundDate(bldg, key);
        return bldg.date || '';
    }
    window.getBuildingInspectionDate = getBuildingInspectionDate;

    function getConcreteAgeInDays(bldgArg) {
        const bldg = bldgArg || window.state.currentBuilding;
        if (!bldg || !bldg.completionDate) return null;
        const completion = new Date(bldg.completionDate);
        const inspDate = (typeof getBuildingInspectionDate === 'function') ? getBuildingInspectionDate(bldg) : (bldg.date || '');
        const inspection = inspDate ? new Date(inspDate) : new Date();
        if (isNaN(completion.getTime()) || isNaN(inspection.getTime())) return null;
        const days = Math.round((inspection - completion) / (1000 * 60 * 60 * 24));
        return days >= 0 ? days : null;
    }

    function parseYmdParts(v) {
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v == null ? '' : v).trim());
        if (m) return { y: +m[1], m: +m[2], d: +m[3] };
        const dt = v ? new Date(v) : null;
        if (!dt || isNaN(dt.getTime())) return null;
        return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
    }

    // 엑셀 DAYS360(시작, 끝) — 미국식(기본값). 1년 = 360일, 한 달 = 30일로 센다.
    function excelDays360(a, b) {
        let d1 = a.d;
        let d2 = b.d;
        const lastDayOfStartMonth = new Date(a.y, a.m, 0).getDate();
        if (d1 === 31 || (a.m === 2 && d1 === lastDayOfStartMonth)) d1 = 30;
        if (d2 === 31 && d1 >= 30) d2 = 30;
        return (b.y - a.y) * 360 + (b.m - a.m) * 30 + (d2 - d1);
    }

    /**
     * 반발경도 재령일수 — 회사 엑셀과 같이 DAYS360(준공일, 점검일)로 센다(2026-09-22).
     * 탄산화 등 다른 계산은 실제 날짜 차이(getConcreteAgeInDays)를 그대로 쓴다.
     */
    // ── 2026-10-20 건물 수정창: 회차별 점검일 ──
    let _editRoundDatesDraft = null;
    function editRoundKeyFromSelects(bldg) {
        const y = document.getElementById('inputEditBuildingInspectionYear')?.value || (bldg && bldg.inspectionYear) || '2026년';
        const p = document.getElementById('inputEditBuildingInspectionPeriod')?.value || (bldg && bldg.inspectionPeriod) || '하반기';
        return `${y}_${p}`;
    }
    function renderEditRoundDatesList() {
        const box = document.getElementById('editRoundDatesList');
        if (!box || !_editRoundDatesDraft) return;
        const sel = _editRoundDatesDraft.selectedKey;
        const keys = Object.keys(_editRoundDatesDraft.dates).filter((k) => k !== sel);
        keys.sort((a, b) => (getSurveyRoundOrderRank(b) || 0) - (getSurveyRoundOrderRank(a) || 0));
        if (!keys.length) {
            box.innerHTML = '<div class="form-hint" style="font-size:0.78rem;color:#666;">다른 회차 점검일 없음 — 위 「점검 년도·상/하반기」를 바꾸면 그 회차 점검일을 따로 정할 수 있어요.</div>';
            return;
        }
        box.innerHTML = keys.map((k) => `<div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.3rem;">
            <span style="min-width:8rem;font-size:0.82rem;">${escapeHtml(formatSurveyRoundLabel(k))}</span>
            <input type="date" class="form-control edit-round-date-input" data-round-key="${escapeHtml(k)}" value="${escapeHtml(_editRoundDatesDraft.dates[k] || '')}" style="max-width:11rem;">
        </div>`).join('');
        box.querySelectorAll('.edit-round-date-input').forEach((inp) => {
            inp.addEventListener('change', () => { _editRoundDatesDraft.dates[inp.dataset.roundKey] = inp.value || ''; });
        });
    }
    function initEditRoundDates(bldg) {
        const dates = {};
        const map = (bldg && bldg.roundDates) || {};
        Object.keys(map).forEach((k) => {
            const e = map[k];
            const d = typeof e === 'string' ? e : (e && e.date) || '';
            if (d) dates[k] = d;
        });
        const selectedKey = editRoundKeyFromSelects(bldg);
        _editRoundDatesDraft = { bldgId: bldg && bldg.id, dates, selectedKey };
        const dateEl = document.getElementById('inputEditBuildingDate');
        if (dateEl) dates[selectedKey] = dateEl.value || '';
        ['inputEditBuildingInspectionYear', 'inputEditBuildingInspectionPeriod'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.roundDateBound) return;
            el.dataset.roundDateBound = '1';
            el.addEventListener('change', () => {
                const d = _editRoundDatesDraft;
                if (!d) return;
                const de = document.getElementById('inputEditBuildingDate');
                if (de) d.dates[d.selectedKey] = de.value || '';
                const b = (window.state.buildings || []).find((x) => x && x.id === d.bldgId) || window.state.currentBuilding;
                d.selectedKey = editRoundKeyFromSelects(b);
                if (de && d.dates[d.selectedKey]) de.value = d.dates[d.selectedKey];
                renderEditRoundDatesList();
            });
        });
        const dateInput = document.getElementById('inputEditBuildingDate');
        if (dateInput && !dateInput.dataset.roundDateBound) {
            dateInput.dataset.roundDateBound = '1';
            dateInput.addEventListener('change', () => {
                if (_editRoundDatesDraft) _editRoundDatesDraft.dates[_editRoundDatesDraft.selectedKey] = dateInput.value || '';
            });
        }
        renderEditRoundDatesList();
    }
    function applyEditRoundDates(bldg, selectedKey, selectedDate) {
        const mm = window.BSA && window.BSA.buildingMetaMerge;
        if (!bldg || !mm || typeof mm.setRoundDate !== 'function') return;
        const d = (_editRoundDatesDraft && _editRoundDatesDraft.bldgId === bldg.id) ? _editRoundDatesDraft.dates : {};
        Object.keys(d).forEach((k) => { if (k !== selectedKey) mm.setRoundDate(bldg, k, d[k]); });
        if (selectedDate) mm.setRoundDate(bldg, selectedKey, selectedDate);
    }

    function getConcreteStrengthAgeDays(bldg) {
        bldg = bldg || window.state.currentBuilding;
        if (!bldg || !bldg.completionDate) return null;
        const start = parseYmdParts(bldg.completionDate);
        const now = new Date();
        const inspDate = (typeof getBuildingInspectionDate === 'function') ? getBuildingInspectionDate(bldg) : (bldg.date || '');
        const end = inspDate ? parseYmdParts(inspDate) : { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
        if (!start || !end) return null;
        const days = excelDays360(start, end);
        return days >= 0 ? days : null;
    }

    // 재령일수 → α(재령보정계수) 구간표. 회사 자료 원본은 하루 단위로 값이 있지만,
    // 값이 바뀌는 지점(day)만 기록해 압축했다 — 예: day=250이면 다음 구간(day=300)
    // 전까지 α=0.71을 그대로 쓴다. 원본 표는 day 1~3이 공란("-")이었는데(타설 직후라
    // 이 앱의 실사용 범위 밖), day 4부터의 값만 반영했다. day 3000(=0.63) 이후 값은
    // 원본 표에 없어서 마지막 값을 그대로 유지한다.
    const AGE_CORRECTION_BREAKPOINTS = [
        [4, 1.90], [5, 1.84], [6, 1.78], [7, 1.72], [8, 1.67], [9, 1.61], [10, 1.55],
        [11, 1.49], [12, 1.45], [13, 1.40], [14, 1.36], [15, 1.32], [16, 1.25], [17, 1.23],
        [18, 1.22], [19, 1.18], [20, 1.15], [21, 1.12], [22, 1.10], [23, 1.08], [24, 1.06],
        [25, 1.04], [26, 1.02], [27, 1.01], [28, 1.00], [29, 0.99], [32, 0.98], [34, 0.96],
        [36, 0.95], [38, 0.94], [40, 0.93], [42, 0.92], [44, 0.91], [46, 0.90], [48, 0.89],
        [49, 0.88], [50, 0.87], [56, 0.86], [62, 0.85], [68, 0.84], [74, 0.83], [78, 0.82],
        [84, 0.81], [88, 0.80], [95, 0.79], [100, 0.78], [113, 0.77], [125, 0.76], [138, 0.75],
        [150, 0.74], [175, 0.73], [200, 0.72], [250, 0.71], [300, 0.70], [351, 0.69], [400, 0.68],
        [500, 0.67], [750, 0.66], [1000, 0.65], [2000, 0.64], [3000, 0.63]
    ];

    function getAgeCorrectionFactor(days) {
        if (days === null || days === undefined || isNaN(days) || days < AGE_CORRECTION_BREAKPOINTS[0][0]) return null;
        let alpha = AGE_CORRECTION_BREAKPOINTS[0][1];
        for (const [day, a] of AGE_CORRECTION_BREAKPOINTS) {
            if (days >= day) alpha = a; else break;
        }
        return alpha;
    }

    function strengthAgeApi() {
        return (window.BSA && window.BSA.strengthAge) || null;
    }

    /**
     * 2026-10-19 강도 재령일 — 이 항목 직접 입력 > 건물 공통 직접 입력 > 준공일~점검일 자동(DAYS360).
     * 직접 입력을 비우면 자동으로 돌아간다. 목록·통계·성능평가·한글 출력이 모두 이 값을 쓴다.
     * 반환 { days, source: 'item'|'building'|'auto', autoDays }
     */
    function resolveStrengthAgeInfo(item, bldg) {
        const b = (bldg && typeof bldg === 'object') ? bldg : window.state.currentBuilding;
        const autoDays = getConcreteStrengthAgeDays(b);
        const api = strengthAgeApi();
        return api ? api.resolve(item, b, autoDays) : { days: autoDays, source: 'auto', autoDays };
    }
    window.resolveStrengthAgeInfo = resolveStrengthAgeInfo;

    function getConcreteAgeInDaysText(infoArg) {
        const info = infoArg || resolveStrengthAgeInfo(null);
        const days = info ? info.days : null;
        const bldg = window.state.currentBuilding;
        if (days === null || days === undefined || !bldg) return '';
        const alpha = getAgeCorrectionFactor(days);
        const alphaText = `α(재령보정계수) = <b>${alpha !== null ? alpha.toFixed(2) : '-'}</b>`;
        if (info.source === 'item' || info.source === 'building') {
            const autoText = info.autoDays != null ? ` · 자동이면 ${info.autoDays}일` : '';
            return `📅 재령일수: <b>${days}일</b>(${info.source === 'item' ? '이 항목' : '건물 공통'} 직접 입력${autoText}) → ${alphaText}`;
        }
        return `📅 재령일수: 준공일(${bldg.completionDate}) ~ 점검일(${getBuildingInspectionDate(bldg) || '오늘'}) = <b>${days}일</b>(1년 360일 기준) → ${alphaText}`;
    }

    // 측정 각도 선택지(index.html #ndtAngle)에 있는 값만 쓴다. 그 밖(빈 값 포함)은 0°.
    const STRENGTH_ANGLE_OPTIONS = ['0', '90', '45', '-45', '-90'];
    const LAST_STRENGTH_ANGLE_KEY = 'bsa_ndt_last_strength_angle';
    function normalizeStrengthAngleValue(v) {
        if (v === undefined || v === null || v === '') return '0';
        const n = parseFloat(v);
        const s = Number.isFinite(n) ? String(n) : '';
        return STRENGTH_ANGLE_OPTIONS.includes(s) ? s : '0';
    }
    function readLastStrengthAngle() {
        try { return localStorage.getItem(LAST_STRENGTH_ANGLE_KEY); } catch (_) { return null; }
    }
    function rememberLastStrengthAngle(v) {
        try { localStorage.setItem(LAST_STRENGTH_ANGLE_KEY, normalizeStrengthAngleValue(v)); } catch (_) {}
    }

    // 앤빌 장비평균 입력칸 — index.html은 손으로 고치지 않는 규칙(UTF-8 깨짐 위험, test-survey-round-delete)이라
    // 설계강도 칸이 있는 줄 바로 아래에 JS로 한 번 만들어 넣는다.
    function ensureAnvilInputRow() {
        if (document.getElementById('ndtAnvilAvg')) return document.getElementById('ndtAnvilAvg');
        const design = document.getElementById('ndtDesignStrength');
        const designRow = design && design.closest('.form-row');
        if (!designRow || !designRow.parentNode) return null;
        const row = document.createElement('div');
        row.className = 'form-row';
        row.style.cssText = 'display:flex; gap:0.8rem; align-items:flex-end;';
        row.innerHTML = '<div class="form-group" style="flex:1;">'
            + '<label class="form-label" for="ndtAnvilAvg">🔨 앤빌 장비평균 (기준 82, 건물 공통)</label>'
            + '<input type="number" step="0.1" min="1" id="ndtAnvilAvg" class="form-control" placeholder="비우면 보정 없음 (예: 80)">'
            + '</div>'
            + '<div class="form-group" style="flex:1;">'
            + '<div id="ndtAnvilFactorHint" style="font-size:0.82rem; color:var(--text-muted); padding-bottom:0.55rem;">보정 없음 (×1.00)</div>'
            + '</div>';
        designRow.parentNode.insertBefore(row, designRow.nextSibling);
        const input = row.querySelector('#ndtAnvilAvg');
        input.addEventListener('change', applyAnvilInputToBuilding);
        return input;
    }

    // 앤빌 장비평균 입력칸 ↔ 건물 설정(strengthAnvilAvg). 입력 중(포커스)에는 칸을 덮어쓰지 않는다.
    function syncAnvilInputFromBuilding() {
        const el = ensureAnvilInputRow();
        const hint = document.getElementById('ndtAnvilFactorHint');
        const anvil = getStrengthAnvilAvg(window.state.currentBuilding);
        if (el && document.activeElement !== el) el.value = anvil != null ? String(anvil) : '';
        if (hint) {
            hint.textContent = anvil != null
                ? `보정 ×${(STRENGTH_ANVIL_STANDARD / anvil).toFixed(3)} (82 ÷ ${anvil})`
                : '보정 없음 (×1.00)';
        }
    }

    function applyAnvilInputToBuilding() {
        const bldg = window.state.currentBuilding;
        const el = document.getElementById('ndtAnvilAvg');
        if (!bldg || !el) return;
        const v = parseFloat(el.value);
        const next = Number.isFinite(v) && v > 0 ? v : null;
        const prev = getStrengthAnvilAvg(bldg);
        if (next === prev) { syncAnvilInputFromBuilding(); return; }
        if (next == null) delete bldg.strengthAnvilAvg;
        else bldg.strengthAnvilAvg = next;
        // 수정 표시를 찍어야 동기화 병합에서 서버의 옛 값에 덮이지 않는다
        markBuildingMetaDirty(bldg);
        saveStateToLocalStorage();
        syncAnvilInputFromBuilding();
        recalcAllStrengthSlots();
    }

    // 2026-10-19 강도 재령일 직접 입력 칸 — 건물 공통(건물 정보로 동기화) + 이 항목만(항목에 저장). 비우면 자동.
    // index.html은 손으로 고치지 않는 규칙이라 앤빌 칸 아래에 JS로 한 번 만들어 넣는다.
    function ensureStrengthAgeRow() {
        const existing = document.getElementById('ndtStrengthAgeBldg');
        if (existing) return existing;
        const anvil = ensureAnvilInputRow();
        const anchorRow = anvil && anvil.closest('.form-row');
        if (!anchorRow || !anchorRow.parentNode) return null;
        const row = document.createElement('div');
        row.className = 'form-row ndt-strength-age-row';
        row.innerHTML = '<div class="form-group">'
            + '<label class="form-label" for="ndtStrengthAgeBldg">📅 재령일 직접 입력 (건물 공통, 일)</label>'
            + '<input type="text" inputmode="numeric" id="ndtStrengthAgeBldg" class="form-control" placeholder="비우면 자동 (준공일 기준)" autocomplete="off">'
            + '</div>'
            + '<div class="form-group">'
            + '<label class="form-label" for="ndtStrengthAgeItem">📅 이 항목만 재령일 (일)</label>'
            + '<input type="text" inputmode="numeric" id="ndtStrengthAgeItem" class="form-control" placeholder="비우면 건물 값" autocomplete="off">'
            + '</div>'
            + '<div class="ndt-strength-age-hint" id="ndtStrengthAgeHint"></div>';
        anchorRow.parentNode.insertBefore(row, anchorRow.nextSibling);
        row.querySelector('#ndtStrengthAgeBldg').addEventListener('change', applyStrengthAgeInputToBuilding);
        row.querySelector('#ndtStrengthAgeItem').addEventListener('input', () => recalcAllStrengthSlots());
        return row.querySelector('#ndtStrengthAgeBldg');
    }

    /** 입력창의 「이 항목만 재령일」 → { strengthAgeOverride } (비었으면 null) */
    function readNdtStrengthAgeFormItem() {
        const el = document.getElementById('ndtStrengthAgeItem');
        const api = strengthAgeApi();
        const v = (el && api) ? api.parseOverride(el.value) : null;
        return v !== null ? { strengthAgeOverride: v } : null;
    }

    function setNdtStrengthAgeItemInput(item) {
        ensureStrengthAgeRow();
        const el = document.getElementById('ndtStrengthAgeItem');
        const api = strengthAgeApi();
        if (!el) return;
        const v = (api && item) ? api.parseOverride(item.strengthAgeOverride) : null;
        el.value = v !== null ? String(v) : '';
    }

    function syncStrengthAgeInputs() {
        const el = ensureStrengthAgeRow();
        const api = strengthAgeApi();
        const bldg = window.state.currentBuilding;
        const bv = (api && bldg) ? api.parseOverride(bldg.strengthAgeOverride) : null;
        if (el && document.activeElement !== el) el.value = bv !== null ? String(bv) : '';
        const hint = document.getElementById('ndtStrengthAgeHint');
        if (hint && api) {
            const info = resolveStrengthAgeInfo(readNdtStrengthAgeFormItem(), bldg);
            const autoText = info.autoDays != null ? `자동(준공일~점검일) ${info.autoDays}일` : '자동 계산 불가(준공일 없음)';
            hint.textContent = info.source === 'auto'
                ? `지금 쓰는 재령일: ${autoText}`
                : `지금 쓰는 재령일: ${info.days}일 (${api.sourceLabel(info.source)}) · ${autoText}`;
        }
    }

    function applyStrengthAgeInputToBuilding() {
        const bldg = window.state.currentBuilding;
        const el = document.getElementById('ndtStrengthAgeBldg');
        const api = strengthAgeApi();
        if (!bldg || !el || !api) return;
        const next = api.parseOverride(el.value);
        if (el.value.trim() !== '' && next === null) {
            window.showToast('재령일은 0 이상 숫자(일)로 넣어 주세요.', 'warning');
        }
        const prev = api.parseOverride(bldg.strengthAgeOverride);
        if (next === prev) { syncStrengthAgeInputs(); return; }
        // 지울 때도 null로 남긴다 — 칸별 시각 병합에서 "지움"이 다른 기기의 옛 값에 지지 않게
        bldg.strengthAgeOverride = next;
        markBuildingMetaDirty(bldg);
        saveStateToLocalStorage();
        recalcAllStrengthSlots();
    }

    function recalcAllStrengthSlots() {
        syncAnvilInputFromBuilding();
        syncStrengthAgeInputs();
        ndtStrengthSlots.forEach((_, idx) => recalcStrengthSlot(idx));
    }

    function recalcStrengthSlot(slotIdx) {
        const summaryEl = document.getElementById(`ndtStrengthCalcSummary-${slotIdx}`);
        const resultsEl = document.getElementById(`ndtStrengthFormulaResults-${slotIdx}`);
        const angleEl = document.getElementById('ndtAngle');
        const avgEl = document.getElementById('ndtAvgValue');
        if (!summaryEl || !resultsEl) return;

        const angle = angleEl ? parseFloat(angleEl.value) : 0;
        const strengthAgeInfo = resolveStrengthAgeInfo(readNdtStrengthAgeFormItem());
        const ageDays = strengthAgeInfo.days;
        const enabledNames = getEnabledStrengthFormulaNames(window.state.currentBuilding);
        const readings = ndtStrengthSlots[slotIdx] ? ndtStrengthSlots[slotIdx].readings : [];
        const calc = calcConcreteStrength(readings, angle, ageDays, enabledNames, getStrengthAnvilAvg(window.state.currentBuilding));
        // 평균값 칸(ndtAvgValue)은 분류마다 뜻이 다르다(기울기·부재변위=변위량, 실측=실측폭).
        // 창을 열 때 분류와 상관없이 이 함수가 돌아서, 강도가 아닌 항목의 변위량을 비웠고
        // 그 상태로 저장되면 외벽 기울기의 기울기·등급이 지워졌다(2026-09-21). 강도일 때만 쓴다.
        const isStrengthCat = (document.getElementById('ndtCategory')?.value || '') === '강도';

        if (!calc) {
            summaryEl.textContent = 'R값을 입력하면 자동으로 계산됩니다.';
            resultsEl.innerHTML = '';
            if (avgEl && slotIdx === 0 && isStrengthCat) avgEl.value = '';
            return;
        }

        const ageInfo = getConcreteAgeInDaysText(strengthAgeInfo);
        summaryEl.innerHTML = (ageInfo ? `${ageInfo}<br>` : '준공일·재령일을 입력하지 않아 α 없이(=1) 계산됩니다.<br>') +
            `측정 ${calc.totalCount}개 중 ${calc.excludedCount}개 제외(±20% 초과) → 평균 R = <b>${fmtExcel(calc.finalAvg, 1)}</b>${calc.anvilFactor !== 1 ? ` → 앤빌 ×${calc.anvilFactor.toFixed(3)}` : ''} → 각도보정(${angle > 0 ? '+' : ''}${angle}°) ${calc.correction >= 0 ? '+' : ''}${calc.correction.toFixed(2)} → <b>Ro = ${calc.ro.toFixed(1)}</b>`;
        resultsEl.innerHTML = calc.results.map(r => `
            <tr>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15); text-align:center;">
                    <input type="checkbox" class="ndt-strength-formula-toggle" data-formula="${r.name}" ${r.enabled ? 'checked' : ''} onchange="window.toggleStrengthFormula('${r.name}')" style="cursor:pointer;">
                </td>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15); ${r.enabled ? '' : 'color:var(--text-muted); text-decoration:line-through;'}">${r.name}</td>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15); text-align:right; font-weight:800; color:${r.enabled ? '#2a2a2a' : 'var(--text-muted)'};">${fmtExcel(r.value, 1)}</td>
            </tr>
        `).join('') + `
            <tr>
                <td colspan="2" style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4);">평균 (체크된 식만)</td>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); text-align:right; font-weight:800;">${fmtExcel(calc.formulaAvg, 2)}</td>
            </tr>
            <tr>
                <td colspan="2" style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); font-weight:800; color:#16a34a;">최종 강도 (평균 × α${calc.alpha !== null ? '=' + calc.alpha.toFixed(2) : '(미적용)'})</td>
                <td style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); text-align:right; font-weight:800; color:#16a34a; font-size:0.95rem;">${calc.finalStrength.toFixed(1)}</td>
            </tr>
        `;

        const designStrengthEl = document.getElementById('ndtDesignStrength');
        const designStrength = designStrengthEl ? parseFloat(designStrengthEl.value) : NaN;
        if (!isNaN(designStrength) && designStrength > 0) {
            const ratio = (calc.finalStrength / designStrength) * 100;
            const hasDamage = document.getElementById('ndtDamageStatus')?.value === '균열발생';
            const grade = getStrengthGrade(ratio, hasDamage);
            resultsEl.innerHTML += `
                <tr>
                    <td colspan="2" style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); font-weight:800;">강도비 (설계 ${designStrength} 대비)</td>
                    <td style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); text-align:right; font-weight:800;">${ratio.toFixed(0)}%</td>
                </tr>
                <tr>
                    <td colspan="2" style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15);">등급</td>
                    <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15); text-align:right; font-weight:800;">${grade.label}</td>
                </tr>
            `;
        }

        // #ndtAvgValue는 강도 카테고리에선 화면에 안 보이지만(다른 카테고리와 공용 필드), 저장 시
        // 하위호환용 최상위 값으로 쓰이므로 위치 1(슬롯 0) 결과로만 채워둔다.
        if (avgEl && slotIdx === 0 && isStrengthCat) avgEl.value = `${calc.finalStrength.toFixed(1)} MPa (R=${fmtExcel(calc.finalAvg, 1)}, Ro=${calc.ro.toFixed(1)})`;
    }

    // --- 콘크리트 탄산화(중성화) 계산 엔진 ---
    // 회사 자료(비파괴.pdf)의 공식을 그대로 반영:
    // 탄산화속도계수(A) = 탄산화깊이 / √재령(년)
    // 수명예측(년) = (피복두께 / A)^2
    // 잔존수명예측(년) = 수명예측(년) - 준공후 경과년수
    function calcCarbonation(depthMm, coverMm, ageYears) {
        if (isNaN(depthMm) || isNaN(coverMm) || depthMm <= 0 || coverMm <= 0) return null;
        const remainMm = coverMm - depthMm;
        if (!ageYears || ageYears <= 0) {
            return { remainMm, rate: null, lifeYears: null, remainingLifeYears: null };
        }
        const rate = depthMm / Math.sqrt(ageYears);
        const lifeYears = Math.pow(coverMm / rate, 2);
        const remainingLifeYears = lifeYears - ageYears;
        return { remainMm, rate, lifeYears, remainingLifeYears };
    }

    function recalcNdtCarbonation() {
        const resultsEl = document.getElementById('ndtCarbResults');
        if (!resultsEl) return;
        const depth = parseFloat(document.getElementById('ndtCarbDepth')?.value);
        const cover = parseFloat(document.getElementById('ndtCarbCover')?.value);
        const ageDays = getConcreteAgeInDays();
        const ageYears = ageDays !== null ? ageDays / 365 : null;
        const calc = calcCarbonation(depth, cover, ageYears);
        // 평균값 칸은 분류마다 뜻이 다르다 — 탄산화일 때만 쓴다(recalcStrengthSlot과 같은 이유).
        // 창을 열 때 분류와 상관없이 이 함수가 돌아 외벽 기울기의 변위량을 비웠다(2026-09-21).
        const isCarbCat = (document.getElementById('ndtCategory')?.value || '') === '탄산화';

        if (!calc) {
            resultsEl.innerHTML = '<tr><td style="padding:0.4rem; color:var(--text-muted);">탄산화 깊이와 피복두께를 입력하면 자동으로 계산됩니다.</td></tr>';
            const avgElCarb = document.getElementById('ndtAvgValue');
            if (avgElCarb && isCarbCat) avgElCarb.value = '';
            return;
        }

        const row = (label, value) => `
            <tr>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15);">${label}</td>
                <td style="padding:0.3rem 0.4rem; border-top:1px solid rgba(2,132,199,0.15); text-align:right; font-weight:800;">${value}</td>
            </tr>
        `;

        let html = row('잔여깊이 (mm)', calc.remainMm.toFixed(2));
        if (calc.rate !== null) {
            html += row('탄산화속도계수 (A)', calc.rate.toFixed(2));
            html += row('수명예측 (년)', Math.round(calc.lifeYears));
            html += `
                <tr>
                    <td style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); font-weight:800; color:#16a34a;">잔존수명 예측 (년)</td>
                    <td style="padding:0.35rem 0.4rem; border-top:1px solid rgba(2,132,199,0.4); text-align:right; font-weight:800; color:#16a34a; font-size:0.95rem;">${Math.round(calc.remainingLifeYears)}</td>
                </tr>
            `;
        } else {
            html += `<tr><td colspan="2" style="padding:0.4rem; color:var(--text-muted);">건축물 개요에 준공일을 입력하면 수명예측/잔존수명이 계산됩니다.</td></tr>`;
        }
        resultsEl.innerHTML = html;

        const avgElCarb = document.getElementById('ndtAvgValue');
        if (avgElCarb && isCarbCat) {
            avgElCarb.value = calc.remainingLifeYears !== null
                ? `잔존수명 ${Math.round(calc.remainingLifeYears)}년 (깊이${depth}mm/피복${cover}mm)`
                : `깊이${depth}mm/피복${cover}mm (잔여${calc.remainMm.toFixed(1)}mm)`;
        }
    }

    function applyScannedReadings(scanned, slotIdx, statusEl, sourceLabel) {
        ndtStrengthSlots[slotIdx].readings = scanned.slice(0, MAX_R_VALUES_PER_SLOT);
        const listContainer = document.getElementById(`ndtRValuesList-${slotIdx}`);
        if (listContainer) { listContainer.innerHTML = rValueChipsHtml(slotIdx); wireRValueChipEvents(slotIdx); }
        recalcStrengthSlot(slotIdx);
        scheduleNdtAutoApply();
        if (statusEl) statusEl.textContent = `✅ ${sourceLabel}: ${countFoundReadings(scanned)}개 인식됨 — 사진과 비교해서 꼭 확인/수정해주세요! (OCR은 완벽하지 않습니다)`;
    }

    function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 도트프린터 측정지는 "R 01 44" 처럼 R번호+측정값이 이어져 찍히는데, OCR이 한 줄을 통째로
    // 놓치거나(예: R03이 안 읽힘) 번호는 읽었는데 그 옆 값만 못 읽는 경우가 실측에서 확인됐다.
    // 예전엔 인식된 값들을 나온 순서대로 그냥 이어붙였는데, 그러면 중간에 한 줄이라도 빠지는
    // 순간 그 뒤 모든 값이 한 칸씩 밀려서 엉뚱한 R번호 자리에 들어갔다(실측 사진 대조로 확인:
    // R12/R13 값이 안 읽히니까 "12"/"13"이라는, 원래 R번호 라벨 숫자 자체가 값으로 잘못 채택됨).
    // 이제 각 구간에서 R번호(라벨)를 먼저 읽어서 그 번호의 제자리(rIdx-1)에만 값을 채우고,
    // 라벨은 읽었는데 값을 못 읽은 줄은 값 없이(null) 그 자리를 비워둔다 — 틀린 값을 넣느니
    // 빈칸으로 두고 사용자가 사진 보고 채우게 한다. 라벨(R번호) 자체를 못 읽은 줄은 어느 자리인지
    // 알 수 없어 건너뛴다. "ER06"처럼 다른 글자 뒤에 붙은 R(에러 코드 등)은 구간 시작에서 제외.
    // 반환값은 항상 길이 MAX_R_VALUES_PER_SLOT의 배열이며, 못 읽은 자리는 null.
    // (cloudflare-worker/ocr-proxy.js의 extractRValues와 동일 로직 — 서버/로컬 양쪽에서 씀)
    function extractRValuesFromText(text) {
        const str = String(text || '');
        const starts = [];
        const re = /R/gi;
        let m;
        while ((m = re.exec(str)) !== null) {
            const prev = str[m.index - 1];
            if (prev && /[A-Za-z]/.test(prev)) continue;
            starts.push(m.index);
        }
        const slots = new Array(MAX_R_VALUES_PER_SLOT).fill(null);
        for (let i = 0; i < starts.length; i++) {
            const segment = str.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : str.length);
            const labelMatch = segment.match(/^R\s*[:.\-]?\s*0*(\d{1,2})\b/i);
            if (!labelMatch) continue;
            const rIdx = parseInt(labelMatch[1], 10);
            if (!rIdx || rIdx < 1 || rIdx > MAX_R_VALUES_PER_SLOT) continue;
            const rest = segment.slice(labelMatch.index + labelMatch[0].length);
            const valNums = rest.match(/\d{2,3}/g);
            if (!valNums || valNums.length === 0) continue;
            const value = parseInt(valNums[0], 10);
            if (isNaN(value) || value < 10 || value > 80) continue;
            slots[rIdx - 1] = value;
        }
        return slots;
    }

    // extractRValuesFromText/scanRValuesFromImageCloud는 이제 항상 고정 길이 배열(못 읽은 자리는
    // null)을 반환하므로, "몇 개나 실제로 인식됐는지"는 배열 길이가 아니라 이 함수로 세야 한다.
    function countFoundReadings(arr) {
        return (arr || []).filter(v => v !== null && v !== undefined && v !== '').length;
    }

    // 브라우저에서 Gemini를 직접 호출한다(Cloudflare Worker를 거치지 않음 — GEMINI_DIRECT_API_KEY
    // 선언부 주석 참고: Worker 엣지의 지역 차단을 피하기 위함). ocr-proxy.js의 scanWithGemini와
    // 동일한 프롬프트/파싱: R번호 자리(rIdx-1)에 값을 채우고 못 읽은 자리는 null로 둔 고정 길이
    // 20 배열을 돌려준다. 실패 시 예외를 던져서 호출부가 기존 클라우드(Worker→Vision)로 폴백한다.
    async function scanRValuesFromImageGeminiDirect(file) {
        const dataUrl = await fileToDataUrl(file);
        const commaIdx = dataUrl.indexOf(',');
        const meta = dataUrl.slice(0, commaIdx);
        const base64Data = dataUrl.slice(commaIdx + 1);
        const mimeType = (meta.match(/^data:(.*?);base64$/) || [])[1] || 'image/jpeg';

        // 2026-10-17: 도트 글씨 0↔8 오인식 — 각 줄 옆 막대그래프 길이도 받아 js/core/r-bar-check.js로 한 번 더 확인한다
        const prompt = `이 이미지는 콘크리트 비파괴 강도 측정지(반발경도/슈미트해머 측정 기록지)이다.
표에는 R01~R20까지 번호가 매겨진 항목이 있고, 각 항목 옆에 10~80 사이의 정수 측정값과 그 값만큼 긴 막대그래프가 있다.
길이 20인 JSON 배열을 출력해라. 배열의 i번째(0-based) 원소는 R(i+1)의 [측정값, 막대길이] 이다.
- 막대길이: 그 줄 막대의 왼쪽 끝부터 오른쪽 끝까지 길이를, 그림 너비를 1000으로 본 정수로. 막대가 없거나 안 보이면 null.
- 도트 글씨라 0과 8이 헷갈리기 쉽다(예: 40과 48, 30과 38). 헷갈리면 다른 줄의 값·막대 길이와 견주어 막대 길이에 맞는 쪽으로 읽어라.
해당 번호의 측정값을 읽을 수 없거나 표에 아예 없으면 그 원소를 null로 넣어라.
오직 JSON 배열만 출력하고, 설명·코드블록·다른 텍스트는 절대 붙이지 마라.
예: [[44,352],null,[42,336],[40,320],[47,376],[44,352],[40,320],[39,312],[39,312],[48,384],[42,336],[39,312],[42,336],[43,344],[49,392],[42,336],[43,344],[41,328],[40,320],[40,320]]`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_DIRECT_API_KEY}`;
        const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Data } },
                    ],
                }],
                generationConfig: { temperature: 0, maxOutputTokens: 1024 },
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini API 오류 (${res.status}): ${errText.slice(0, 300)}`);
        }
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('Gemini 응답에서 JSON 배열을 찾지 못함: ' + text.slice(0, 200));
        let arr;
        try {
            arr = JSON.parse(match[0]);
        } catch (e) {
            throw new Error('Gemini JSON 파싱 실패: ' + e.message);
        }
        if (!Array.isArray(arr)) throw new Error('Gemini 응답이 배열이 아님');

        const slots = new Array(MAX_R_VALUES_PER_SLOT).fill(null);
        const bars = new Array(MAX_R_VALUES_PER_SLOT).fill(null);
        for (let i = 0; i < MAX_R_VALUES_PER_SLOT; i++) {
            // 원소는 [값, 막대길이] — 옛 답처럼 숫자만 와도 읽는다
            const it = arr[i];
            const rawV = Array.isArray(it) ? it[0] : (it && typeof it === 'object' ? it.v : it);
            const rawBar = Array.isArray(it) ? it[1] : (it && typeof it === 'object' ? it.bar : null);
            const n = typeof rawV === 'number' ? rawV : parseInt(rawV, 10);
            slots[i] = (Number.isFinite(n) && n >= 10 && n <= 80) ? n : null;
            const b = typeof rawBar === 'number' ? rawBar : parseFloat(rawBar);
            bars[i] = Number.isFinite(b) && b > 0 ? b : null;
        }
        // 막대 길이로 0↔8 바로잡기(줄이 5개 미만이거나 막대가 값과 안 맞으면 그대로)
        const check = window.BsaRBarCheck ? window.BsaRBarCheck.correctZeroEight(slots, bars) : null;
        if (check && check.fixes.length) {
            slots.splice(0, slots.length, ...check.values);
            slots.barFixes = check.fixes;
        }
        return slots;
    }

    // Cloudflare Worker 프록시 → Cloud Vision에 사진을 보내 R값 목록(JSON 배열)만 받는다.
    // 실패 시 예외를 던져서, 호출부(scanRValuesFromImage)가 로컬 Tesseract로 폴백하게 한다.
    //
    // 2026-09-04 버그: Worker는 Gemini가 400/403/404 등 무엇으로 실패하든 자기 응답은 항상
    // 502로 감싸서 내려준다(ocr-proxy.js의 502 응답 참고). 그런데 여기서 res.status(=502)만
    // 보고 바로 던져버려서, 응답 본문(JSON)에 들어있는 진짜 Gemini 에러 코드/메시지를 한 번도
    // 못 읽고 있었다 — 그래서 실제로는 재시도해도 안 풀리는 400/404 같은 에러가 매번 "일시적
    // 서버 오류(502)"로 오분류돼 쓸데없이 재시도만 하다 로컬로 떨어졌다. 이제 본문을 먼저
    // 읽어서 안에 담긴 진짜 에러를 우선 사용한다.
    async function scanRValuesFromImageCloud(file) {
        const dataUrl = await fileToDataUrl(file);
        const res = await fetch(CLOUD_OCR_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl })
        });
        let data = null;
        try { data = await res.json(); } catch (_) { /* 본문이 JSON이 아니면 아래에서 상태코드로 처리 */ }
        if (data && data.error) throw new Error(data.error);
        if (!res.ok) throw new Error(`클라우드 OCR 서버 오류 (${res.status})`);
        if (!data || !Array.isArray(data.values)) throw new Error('클라우드 OCR 응답 형식 오류');
        // 서버(ocr-proxy.js)도 이제 R번호 자리(rIdx-1)에 맞춰 고정 길이 배열(못 읽은 자리는 null)을
        // 돌려준다 — 여기서 compact(필터로 채워 당기기)하면 자리 정보가 다시 사라지므로 그대로 둔다.
        return data.values.slice(0, MAX_R_VALUES_PER_SLOT).map(v => {
            const n = parseInt(v, 10);
            return (v === null || v === undefined || isNaN(n) || n < 10 || n > 80) ? null : n;
        });
    }

    function isRateLimitErrorMsg(msg) {
        return /\b429\b/.test(msg) || /RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
    }

    // 2026-09-04: 실제로 확인해보니 분당 요청 제한(429)은 몇 초가 아니라 1~2분은 기다려야
    // 풀렸다 — 그래서 429는 여기서 재시도하지 않고(호출부가 바로 "잠시 후 다시 시도" 안내로
    // 처리) 진짜 서버 일시 오류(5xx)만 몇 초 쉬었다가 자동으로 재시도한다.
    //
    // 실제 실패 원인을 확인해보니 "User location is not supported for the API use"
    // (FAILED_PRECONDITION, 400)였다 — 이건 우리 위치 문제가 아니라 Cloudflare Worker가
    // 요청마다 전 세계 여러 엣지 서버 중 하나에서 실행되는데, 그중 일부가 Gemini 무료 API
    // 미지원 지역이라 그때만 나는 것으로 보인다(같은 사진이 됐다 안됐다 하던 현상과 일치).
    // 재시도하면 다른 엣지로 배정될 수 있으니 이 에러도 재시도 대상에 넣는다.
    function isLocationFlakyErrorMsg(msg) {
        return /User location is not supported|FAILED_PRECONDITION/i.test(msg);
    }
    async function scanRValuesFromImageCloudWithRetry(file, statusEl) {
        const MAX_RETRIES = 2, RETRY_DELAY_MS = 4000;
        for (let attempt = 0; ; attempt++) {
            try {
                return await scanRValuesFromImageCloud(file);
            } catch (err) {
                const msg = String((err && err.message) || err || '');
                if (isRateLimitErrorMsg(msg)) throw err;
                const isLocationFlaky = isLocationFlakyErrorMsg(msg);
                const isTransient5xx = /\b5\d\d\b/.test(msg);
                if ((!isTransient5xx && !isLocationFlaky) || attempt >= MAX_RETRIES) throw err;
                if (statusEl) {
                    statusEl.textContent = isLocationFlaky
                        ? `☁️ 서버 위치 문제로 잠시 후 다시 시도합니다... (${attempt + 1}/${MAX_RETRIES})`
                        : `☁️ 서버 오류로 잠시 후 다시 시도합니다... (${attempt + 1}/${MAX_RETRIES})`;
                }
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        }
    }

    // 기존 Tesseract(로컬, 오프라인 가능) 인식 — 클라우드 OCR을 안 쓰거나 결과가 부족할 때 보완용으로
    // 같이 돌린다. 인식된 배열만 반환하고(실패 시 빈 배열), 최종 적용/상태 메시지는 호출부
    // (scanRValuesFromImage)가 클라우드 결과와 비교해서 맡는다.
    async function scanRValuesFromImageLocal(file, statusEl) {
        if (typeof Tesseract === 'undefined') {
            if (statusEl) statusEl.textContent = 'OCR 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해주세요.';
            return [];
        }
        if (statusEl) statusEl.textContent = '🔍 (로컬) 사진에서 숫자를 인식하는 중입니다... (처음 실행 시 시간이 더 걸릴 수 있어요)';
        let worker;
        try {
            // 화이트리스트(R/숫자만)로 오인식 노이즈를 줄이고, 사진마다 레이아웃이 달라
            // 페이지 분할(PSM) 모드 하나로는 안 맞는 경우가 많아 여러 모드를 순서대로 시도한다.
            worker = await Tesseract.createWorker('eng');
            await worker.setParameters({ tessedit_char_whitelist: 'R0123456789' });
            const psmModesToTry = ['11', '6', '4', '3']; // 흩어진텍스트 → 단일블록 → 단일열 → 자동
            let scanned = [];
            for (const psm of psmModesToTry) {
                await worker.setParameters({ tessedit_pageseg_mode: psm });
                const { data: { text } } = await worker.recognize(file);
                scanned = extractRValuesFromText(text);
                if (countFoundReadings(scanned) > 0) break;
            }
            return scanned;
        } catch (err) {
            console.error('R값 스캔(로컬) 실패:', err);
            return [];
        } finally {
            if (worker) await worker.terminate();
        }
    }

    async function scanRValuesFromImage(file, slotIdx = 0) {
        const statusEl = document.getElementById(`rScanStatus-${slotIdx}`);
        if (!file) return;

        // 인식 성공/실패와 무관하게 원본 사진은 저장해둔다(보고서 '측정 DATA' 표에 그대로 삽입).
        savePhotoForStrengthSlot(slotIdx, file);

        // Gemini 직접 호출을 가장 먼저 시도한다 — Cloud Vision보다 인식률이 훨씬 높다(실측: 20개 중
        // 9개 누락 → 거의 다 인식). GEMINI_DIRECT_API_KEY는 배포 시점에만 주입되므로(빌드 산출물
        // 전용, git에는 없음) 로컬 개발 서버에서는 항상 비어있어 이 블록을 건너간다. 실패(오프라인/
        // 주입 안 됨/일시 오류 등)하면 기존 클라우드(Worker→Cloud Vision)로 조용히 넘어간다.
        if (GEMINI_DIRECT_API_KEY && navigator.onLine) {
            if (statusEl) statusEl.textContent = '🔍 (Gemini) 사진에서 숫자를 인식하는 중입니다...';
            try {
                const geminiScanned = await scanRValuesFromImageGeminiDirect(file);
                const geminiFoundCount = countFoundReadings(geminiScanned);
                if (geminiFoundCount > 0) {
                    applyScannedReadings(geminiScanned, slotIdx, statusEl, '✨ Gemini 인식');
                    if (geminiFoundCount < MAX_R_VALUES_PER_SLOT && statusEl) {
                        statusEl.textContent += ` — 총 ${MAX_R_VALUES_PER_SLOT}개 중 ${geminiFoundCount}개만 인식됐어요. 나머지는 사진 보고 직접 입력해주세요.`;
                    }
                    if (geminiScanned.barFixes && geminiScanned.barFixes.length && statusEl) {
                        statusEl.textContent += ` 📏 막대 길이로 고친 값: ${geminiScanned.barFixes.map(f => `R${String(f.idx + 1).padStart(2, '0')} ${f.from}→${f.to}`).join(', ')} (사진으로 확인해주세요)`;
                    }
                    return;
                }
                console.warn('Gemini 직접 호출 0개 반환, 클라우드(Vision)로 대체');
            } catch (err) {
                console.warn('Gemini 직접 호출 실패, 클라우드(Vision)로 대체:', err);
            }
        }

        // 2026-09-04: 로컬(Tesseract)은 이런 도트프린터 글씨엔 원래 약해서, "클라우드가 너무
        // 적게 찾으면 로컬도 같이 돌려서 더 많이 찾은 쪽을 쓴다"고 했더니 로컬이 틀린 숫자를
        // 더 많이(더 그럴듯하게) 채워서 오히려 정확한 클라우드 결과 대신 틀린 값이 채택되는
        // 부작용이 있었다. 이제 클라우드가 하나라도 찾으면 그 결과를 그대로 쓰고(로컬로 절대
        // 덮어쓰지 않음), 부족한 개수는 상태 메시지로만 알려준다. 클라우드가 아예 0개거나
        // 오프라인일 때만 로컬로 넘어간다.
        // 클라우드가 왜 실패했는지(레이트리밋/서버오류 등) 다음 사람이 바로 알 수 있게, 원인을
        // 콘솔 로그가 아니라 화면 상태 메시지에도 잠깐 남긴다 — 그동안은 조용히 로컬로 넘어가서
        // 실패 이유를 알 방법이 없었다.
        let cloudFailReason = '';
        if (CLOUD_OCR_ENDPOINT && navigator.onLine) {
            if (statusEl) statusEl.textContent = '🔍 (클라우드) 사진에서 숫자를 인식하는 중입니다...';
            try {
                const cloudScanned = await scanRValuesFromImageCloudWithRetry(file, statusEl);
                const cloudFoundCount = countFoundReadings(cloudScanned);
                if (cloudFoundCount > 0) {
                    applyScannedReadings(cloudScanned, slotIdx, statusEl, '☁️ 클라우드 인식');
                    if (cloudFoundCount < MAX_R_VALUES_PER_SLOT && statusEl) {
                        statusEl.textContent += ` — 총 ${MAX_R_VALUES_PER_SLOT}개 중 ${cloudFoundCount}개만 인식됐어요. 나머지는 사진 보고 직접 입력해주세요.`;
                    }
                    return;
                }
                cloudFailReason = '클라우드가 0개를 반환함';
            } catch (err) {
                cloudFailReason = err && err.message ? err.message : String(err);
                // 2026-09-04: 실측 결과 429(분당 요청 제한)는 몇 초~몇 분씩 걸려야 풀렸다. 그
                // 사이에 로컬(Tesseract)로 넘어가면 도트프린터 글씨를 잘못 읽어 틀린 값이
                // 채워지므로, 속도제한일 땐 로컬로 넘어가지 않고 잠시 후 다시 시도하라고만
                // 안내한다 — 사진은 이미 저장돼 있으니 나중에 다시 스캔하면 된다.
                if (isRateLimitErrorMsg(cloudFailReason)) {
                    console.warn('클라우드 OCR 속도제한:', err);
                    if (statusEl) statusEl.textContent = '⏳ 클라우드 인식 사용량이 일시적으로 다 찼습니다. 1~2분 후 다시 시도해주세요. (사진은 저장되어 있어요)';
                    return;
                }
                console.error('클라우드 OCR 실패, 로컬 OCR로 대체합니다:', err);
            }
        }

        // 2026-09-04: 여기서 상태 메시지에 클라우드 실패 사유를 잠깐 띄웠는데, 바로 다음 줄
        // scanRValuesFromImageLocal이 시작하자마자 그 메시지를 덮어써서 뜨자마자 사라지는
        // 버그가 있었다(사용자가 실패 이유를 볼 수가 없었음). 이제 최종 메시지 끝에 계속
        // 남도록 붙인다.
        const localScanned = await scanRValuesFromImageLocal(file, statusEl);
        const localFoundCount = countFoundReadings(localScanned);
        const cloudFailSuffix = cloudFailReason ? ` [클라우드 실패: ${cloudFailReason}]` : '';
        if (localFoundCount === 0) {
            if (statusEl) statusEl.textContent = `❌ 숫자를 인식하지 못했습니다. 직접 입력해주세요.${cloudFailSuffix}`;
            return;
        }
        applyScannedReadings(localScanned, slotIdx, statusEl, '💻 로컬 인식');
        if (statusEl) {
            let extra = '';
            if (localFoundCount < MAX_R_VALUES_PER_SLOT) {
                extra += ` — 총 ${MAX_R_VALUES_PER_SLOT}개 중 ${localFoundCount}개만 인식됐어요. 나머지는 사진 보고 직접 입력해주세요.`;
            }
            statusEl.textContent += extra + cloudFailSuffix;
        }
    }

    function populateNdtComponentDropdown(currentVal) {
        const select = document.getElementById('ndtComponent');
        if (!select) return;
        if (!window.state.customNdtComponents) window.state.customNdtComponents = [];
        const cur = (currentVal || '').trim();
        let html = `<option value="" ${!cur ? 'selected' : ''}>-</option>`;
        NDT_COMPONENT_PRESET.forEach(item => {
            const sel = (cur === item) ? 'selected' : '';
            html += `<option value="${item}" ${sel}>${item}</option>`;
        });
        window.state.customNdtComponents.forEach(item => {
            if (!NDT_COMPONENT_PRESET.includes(item)) {
                const sel = (cur === item) ? 'selected' : '';
                html += `<option value="${item}" ${sel}>${item}</option>`;
            }
        });
        select.innerHTML = html;
        if (cur && !NDT_COMPONENT_PRESET.includes(cur) && !window.state.customNdtComponents.includes(cur)) {
            const customOpt = document.createElement('option');
            customOpt.value = cur;
            customOpt.textContent = cur;
            customOpt.selected = true;
            select.appendChild(customOpt);
        }
        const input = document.getElementById('ndtComponentInput');
        if (input) input.value = cur;
        if (cur && select) select.value = cur;
    }

    function populateNdtFinishStateDropdown(currentVal) {
        const select = document.getElementById('ndtFinishState');
        if (!select) return;
        if (!window.state.customNdtFinishStates) window.state.customNdtFinishStates = [];
        const cur = (currentVal || '').trim();
        let html = `<option value="" ${!cur ? 'selected' : ''}>-</option>`;
        NDT_FINISH_STATE_PRESET.forEach(item => {
            const sel = (cur === item) ? 'selected' : '';
            html += `<option value="${item}" ${sel}>${item}</option>`;
        });
        window.state.customNdtFinishStates.forEach(item => {
            if (!NDT_FINISH_STATE_PRESET.includes(item)) {
                const sel = (cur === item) ? 'selected' : '';
                html += `<option value="${item}" ${sel}>${item}</option>`;
            }
        });
        select.innerHTML = html;
        if (cur && !NDT_FINISH_STATE_PRESET.includes(cur) && !window.state.customNdtFinishStates.includes(cur)) {
            const customOpt = document.createElement('option');
            customOpt.value = cur;
            customOpt.textContent = cur;
            customOpt.selected = true;
            select.appendChild(customOpt);
        }
        const input = document.getElementById('ndtFinishStateInput');
        if (input) input.value = cur;
        if (cur && select) select.value = cur;
    }

    function setNdtDispDirection(dir, opts = {}) {
        const normalized = normalizeNdtDispDirSymbol(dir || '←');
        const hidden = document.getElementById('ndtDispDirection');
        if (hidden) hidden.value = normalized;
        document.querySelectorAll('#ndtDispDirectionPad .ndt-dir-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-dir') === normalized);
        });
        if (!opts.silent && typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
    }

    function bindNdtDispDirectionPad() {
        const pad = document.getElementById('ndtDispDirectionPad');
        if (!pad || pad._ndtDirBound) return;
        pad._ndtDirBound = true;
        pad.addEventListener('click', (e) => {
            const btn = e.target.closest('.ndt-dir-btn');
            if (!btn) return;
            e.preventDefault();
            setNdtDispDirection(btn.getAttribute('data-dir'));
        });
        const sidePad = document.getElementById('ndtDispSidePad');
        if (sidePad) {
            sidePad.addEventListener('click', (e) => {
                const btn = e.target.closest('.ndt-dir-btn');
                if (!btn) return;
                e.preventDefault();
                setNdtDispSide(btn.getAttribute('data-side'));
            });
        }
    }

    /** 외벽 기울기 변위 방향: 'left' | 'right' | 'none'(0mm) | ''(아직 안 고름) */
    function setNdtDispSide(side, opts = {}) {
        const hidden = document.getElementById('ndtDispSide');
        if (hidden) hidden.value = side || '';
        document.querySelectorAll('#ndtDispSidePad .ndt-dir-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-side') === (side || ''));
        });
        if (!opts.silent && typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
    }

    /** 외벽 기울기만: 측정값·변위량 칸을 측정 높이와 기울기 비율 사이로 옮긴다(다른 항목은 원래 자리) */
    function placeNdtTiltValueFields(isTilt) {
        const slot = document.getElementById('ndtTiltValueSlot');
        const values = document.getElementById('groupNdtGenericValues');
        const avgRow = document.getElementById('groupNdtAvgValue')?.parentElement;
        if (!slot || !values || !avgRow) return;
        if (!slot._homes) {
            slot._homes = [document.createComment('ndt-values-home'), document.createComment('ndt-avg-home')];
            values.before(slot._homes[0]);
            avgRow.before(slot._homes[1]);
        }
        if (isTilt) {
            slot.append(values, avgRow);
        } else {
            slot._homes[0].after(values);
            slot._homes[1].after(avgRow);
        }
    }

    function openNdtModal(imgX, imgY, existingItem = null, extraOpts = null) {
        bindNdtDispDirectionPad();
        window._ndtFormHydrating = true;
        window.clearTimeout(window._ndtAutoApplyTimer);
        window._ndtAutoApplyTimer = null;

        const modal = document.getElementById('ndtModal');
        if (!modal) {
            window._ndtFormHydrating = false;
            return;
        }

        const pinIdEl = document.getElementById('ndtPinId');
        const noEl = document.getElementById('ndtNo');
        const catEl = document.getElementById('ndtCategory');
        const compEl = document.getElementById('ndtComponent');
        const locEl = document.getElementById('ndtLocation');
        const heightEl = document.getElementById('ndtHeight');
        const dispDirEl = document.getElementById('ndtDispDirection');
        const v1El = document.getElementById('ndtVal1');
        const v2El = document.getElementById('ndtVal2');
        const v3El = document.getElementById('ndtVal3');
        const avgEl = document.getElementById('ndtAvgValue');
        const statusEl = document.getElementById('ndtStatus');
        const damageStatusEl = document.getElementById('ndtDamageStatus');

        if (existingItem) {
            if (pinIdEl) pinIdEl.value = existingItem.id;
            if (noEl) noEl.value = existingItem.no;
            if (catEl) catEl.value = existingItem.category || '강도';
            if (compEl) compEl.value = memberNameOut(existingItem.component) || '';
            populateNdtComponentDropdown(memberNameOut(existingItem.component) || '');
            if (locEl) locEl.value = existingItem.location || '';
            if (heightEl) heightEl.value = existingItem.height || '';
            setNdtDispDirection(existingItem.dispDirection || '-', { silent: true });
            if (dispDirEl) dispDirEl.value = normalizeNdtDispDirSymbol(existingItem.dispDirection || '-');
            setNdtDispSide(existingItem.dispSide || '', { silent: true });
            if (v1El) v1El.value = existingItem.v1 || '';
            if (v2El) v2El.value = existingItem.v2 || '';
            if (v3El) v3El.value = existingItem.v3 || '';
            if (avgEl) avgEl.value = existingItem.avgValue || '';
            if (statusEl) statusEl.value = existingItem.status || '';
            // 손상 여부 기본 = 상태양호(2026-10-17) — 빈 값이면 선택칸이 비어 보였다(판정은 '균열발생'만 손상으로 봐서 같음)
            if (damageStatusEl) damageStatusEl.value = existingItem.damageStatus || '상태양호';
            setNdtStrengthAgeItemInput(existingItem.category === '강도' ? existingItem : null);
            // strengthSlots(위치별 묶음)가 있으면 그대로, 없으면(구버전 항목) location/strengthReadings
            // 하나로 슬롯 1개를 만들어서 예전과 동일하게 보이게 한다.
            if (existingItem.category === '강도') {
                ndtStrengthSlots = Array.isArray(existingItem.strengthSlots) && existingItem.strengthSlots.length > 0
                    ? existingItem.strengthSlots.map(s => ({ location: s.location || '', readings: Array.isArray(s.readings) ? s.readings.slice() : [], photoId: s.photoId || null }))
                    : [{ location: existingItem.location || '', readings: Array.isArray(existingItem.strengthReadings) ? existingItem.strengthReadings.slice() : [] }];
            } else {
                ndtStrengthSlots = [{ location: '', readings: [] }];
            }
            const angleElExisting = document.getElementById('ndtAngle');
            // 빈 값(null)은 2026-09-21 전까지 0°가 `|| null`로 지워져 저장된 것이다 — 0°로 보여 준다
            // (빈칸이면 목록에 없는 값이라 "각도가 초기화"돼 보였다)
            if (angleElExisting) angleElExisting.value = normalizeStrengthAngleValue(existingItem.strengthAngle);
            const designStrengthElExisting = document.getElementById('ndtDesignStrength');
            if (designStrengthElExisting) designStrengthElExisting.value = (existingItem.designStrength !== undefined && existingItem.designStrength !== null) ? existingItem.designStrength : '';
            const carbDepthElExisting = document.getElementById('ndtCarbDepth');
            if (carbDepthElExisting) carbDepthElExisting.value = (existingItem.carbDepth !== undefined && existingItem.carbDepth !== null) ? existingItem.carbDepth : '';
            const carbCoverElExisting = document.getElementById('ndtCarbCover');
            if (carbCoverElExisting) carbCoverElExisting.value = (existingItem.carbCover !== undefined && existingItem.carbCover !== null) ? existingItem.carbCover : '';
            const designWidthElExisting = document.getElementById('ndtDesignWidth');
            if (designWidthElExisting) designWidthElExisting.value = (existingItem.designWidth !== undefined && existingItem.designWidth !== null) ? existingItem.designWidth : '';
            const designDepthElExisting = document.getElementById('ndtDesignDepth');
            if (designDepthElExisting) designDepthElExisting.value = (existingItem.designDepth !== undefined && existingItem.designDepth !== null) ? existingItem.designDepth : '';
            const measuredDepthElExisting = document.getElementById('ndtMeasuredDepth');
            if (measuredDepthElExisting) measuredDepthElExisting.value = (existingItem.measuredDepth !== undefined && existingItem.measuredDepth !== null) ? existingItem.measuredDepth : '';
            const measuredWidthElExisting = document.getElementById('ndtMeasuredWidth');
            if (measuredWidthElExisting) {
                if (existingItem.measuredWidth !== undefined && existingItem.measuredWidth !== null) {
                    measuredWidthElExisting.value = existingItem.measuredWidth;
                } else {
                    // 이 필드가 생기기 전(구버전)에 저장된 실측 항목은 avgValue에 실측 폭이 담겨 있었다.
                    const legacyW = parseFloat((existingItem.avgValue || '').toString().replace(/[^0-9.-]/g, ''));
                    measuredWidthElExisting.value = isNaN(legacyW) ? '' : legacyW;
                }
            }
            // 2026-10-19 이쪽만 측정·슬래브 합산 — 슬래브 합산이면 춤 칸에는 슬래브 아래 춤을 보여 준다
            {
                const moApi = ndtMeasureOptsApi();
                const slabV = (existingItem.category === '실측') ? (parseFloat(existingItem.slabThickness) || null) : null;
                setNdtMeasureOptsUi(existingItem.category === '실측'
                    ? {
                        oneSide: existingItem.measureOneSide || null,
                        slabOn: !!slabV, slab: slabV,
                        excludeSlabOn: !!existingItem.excludeSlab,
                        excludeSlabMm: existingItem.excludeSlabThickness,
                        excludeInsulationOn: !!existingItem.excludeInsulation,
                        excludeInsulationMm: existingItem.excludeInsulationThickness,
                        excludeWallOn: !!existingItem.excludeWall,
                        excludeWallMm: existingItem.excludeWallThickness
                    }
                    : null);
                if (moApi && measuredDepthElExisting) measuredDepthElExisting.value = moApi.depthInputValue(existingItem);
                if (moApi && typeof moApi.widthInputValue === 'function' && measuredWidthElExisting
                    && existingItem.excludeWall) {
                    measuredWidthElExisting.value = moApi.widthInputValue(existingItem);
                }
            }
            [
                ['ndtDesignWeb', 'designWeb'],
                ['ndtDesignFlange', 'designFlange'],
                ['ndtDesignWebWidth', 'designWebWidth'],
                ['ndtDesignFlangeWidth', 'designFlangeWidth'],
                ['ndtMeasuredWeb', 'measuredWeb'],
                ['ndtMeasuredFlange', 'measuredFlange'],
                ['ndtMeasuredWebWidth', 'measuredWebWidth'],
                ['ndtMeasuredFlangeWidth', 'measuredFlangeWidth']
            ].forEach(([elId, key]) => {
                const el = document.getElementById(elId);
                if (el) el.value = (existingItem[key] !== undefined && existingItem[key] !== null) ? existingItem[key] : '';
            });
            populateNdtFinishStateDropdown(existingItem.finishState || '');
            const sectionRatioElExisting = document.getElementById('ndtSectionRatio');
            if (sectionRatioElExisting) sectionRatioElExisting.value = (existingItem.sectionRatio !== undefined && existingItem.sectionRatio !== null) ? `${existingItem.sectionRatio.toFixed(1)}%` : '';
            const sectionGradeElExisting = document.getElementById('ndtSectionGrade');
            if (sectionGradeElExisting) sectionGradeElExisting.value = existingItem.sectionGrade || '';

            const fpDesignElExisting = document.getElementById('ndtFireproofDesign');
            if (fpDesignElExisting) fpDesignElExisting.value = existingItem.fireproofDesign || '';
            ['Flange', 'Web'].forEach(part => {
                const key = part === 'Flange' ? 'fpFlange' : 'fpWeb';
                const readings = (existingItem[key] && Array.isArray(existingItem[key].readings)) ? existingItem[key].readings : [];
                [1, 2, 3].forEach((n, i) => {
                    const el = document.getElementById(`ndtFp${part}${n}`);
                    if (el) el.value = readings[i] !== undefined && readings[i] !== null ? readings[i] : '';
                });
                const unavailElExisting = document.getElementById(`ndtFp${part}Unavailable`);
                if (unavailElExisting) unavailElExisting.checked = !!(existingItem[key] && existingItem[key].unavailable);
            });
            const existingMemberAvg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                ? window.BSA.ndtStats.fireproofMemberAvg(existingItem)
                : (existingItem.fpAvg != null ? existingItem.fpAvg : null);
            const existingAvgStr = (existingMemberAvg == null || !Number.isFinite(Number(existingMemberAvg))) ? '' : Number(existingMemberAvg).toFixed(2);
            ['ndtFpFlangeAvg', 'ndtFpWebAvg'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = existingAvgStr;
            });

            window._pendingNdtExtra = {
                targetX: existingItem.targetX !== undefined ? existingItem.targetX : existingItem.x,
                targetY: existingItem.targetY !== undefined ? existingItem.targetY : existingItem.y,
                boxX: existingItem.boxX !== undefined ? existingItem.boxX : existingItem.x,
                boxY: existingItem.boxY !== undefined ? existingItem.boxY : existingItem.y
            };
        } else {
            const items = getAllFloorsNdtData(state.currentBuildingId);
            const cat = currentNdtCategory || '강도';
            const count = items.filter(x => x.category === cat).length + 1;
            const seqStr = count < 10 ? `0${count}` : `${count}`;
            const noStr = `NO.${seqStr}`;

            if (pinIdEl) pinIdEl.value = '';
            if (noEl) noEl.value = noStr;
            if (catEl) catEl.value = cat;
            if (compEl) compEl.value = '';
            populateNdtComponentDropdown('');
            if (locEl) locEl.value = '';
            if (heightEl) heightEl.value = '';
            setNdtDispDirection(extraOpts?.dispDirection || '-', { silent: true });
            if (dispDirEl) dispDirEl.value = normalizeNdtDispDirSymbol(extraOpts?.dispDirection || '-');
            setNdtDispSide('', { silent: true });
            if (v1El) v1El.value = '';
            if (v2El) v2El.value = '';
            if (v3El) v3El.value = '';
            if (avgEl) avgEl.value = '';
            if (statusEl) statusEl.value = '';
            if (damageStatusEl) damageStatusEl.value = '상태양호';   // 새 강도 항목은 상태양호로 시작
            setNdtStrengthAgeItemInput(null);
            ndtStrengthSlots = [{ location: '', readings: [] }];
            const angleElNew = document.getElementById('ndtAngle');
            // 새 항목은 이 기기에서 마지막에 쓴 각도로 시작한다(없으면 0°)
            if (angleElNew) angleElNew.value = normalizeStrengthAngleValue(readLastStrengthAngle());
            const designStrengthElNew = document.getElementById('ndtDesignStrength');
            if (designStrengthElNew) designStrengthElNew.value = '';
            const carbDepthElNew = document.getElementById('ndtCarbDepth');
            if (carbDepthElNew) carbDepthElNew.value = '';
            const carbCoverElNew = document.getElementById('ndtCarbCover');
            if (carbCoverElNew) carbCoverElNew.value = '';
            const designWidthElNew = document.getElementById('ndtDesignWidth');
            if (designWidthElNew) designWidthElNew.value = '';
            const designDepthElNew = document.getElementById('ndtDesignDepth');
            if (designDepthElNew) designDepthElNew.value = '';
            const measuredDepthElNew = document.getElementById('ndtMeasuredDepth');
            if (measuredDepthElNew) measuredDepthElNew.value = '';
            const measuredWidthElNew = document.getElementById('ndtMeasuredWidth');
            if (measuredWidthElNew) measuredWidthElNew.value = '';
            setNdtMeasureOptsUi(null);
            [
                'ndtDesignWeb', 'ndtDesignFlange', 'ndtDesignWebWidth', 'ndtDesignFlangeWidth',
                'ndtMeasuredWeb', 'ndtMeasuredFlange', 'ndtMeasuredWebWidth', 'ndtMeasuredFlangeWidth'
            ].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            populateNdtFinishStateDropdown('');
            const sectionRatioElNew = document.getElementById('ndtSectionRatio');
            if (sectionRatioElNew) sectionRatioElNew.value = '';
            const sectionGradeElNew = document.getElementById('ndtSectionGrade');
            if (sectionGradeElNew) sectionGradeElNew.value = '';
            const fpDesignElNew = document.getElementById('ndtFireproofDesign');
            if (fpDesignElNew) fpDesignElNew.value = '';
            ['Flange', 'Web'].forEach(part => {
                [1, 2, 3].forEach(n => {
                    const el = document.getElementById(`ndtFp${part}${n}`);
                    if (el) el.value = '';
                });
                const avgElNew = document.getElementById(`ndtFp${part}Avg`);
                if (avgElNew) avgElNew.value = '';
                const unavailElNew = document.getElementById(`ndtFp${part}Unavailable`);
                if (unavailElNew) unavailElNew.checked = false;
            });

            window._pendingNdtExtra = extraOpts || {
                targetX: imgX,
                targetY: imgY,
                boxX: imgX,
                boxY: imgY + 50
            };
        }

        // 기둥 단면 모양: 저장된 항목이 원형(지름)이면 원형으로 연다
        ndtColumnShapeCircle = !!(existingItem && existingItem.measureDimMode === 'circle');
        ndtItemPhotoIds = ndtFieldPhotoIdsOf(existingItem);
        bindNdtItemPhotoInputs();
        renderNdtItemPhotoList();

        window.toggleNdtModalFields();
        toggleNdtMeasureDimMode();
        renderNdtStrengthSlots();
        recalcAllStrengthSlots();
        recalcNdtCarbonation();
        syncNdtDrawerToCanvasArea();
        modal.style.display = 'flex';
        document.body.classList.add('ndt-modal-open');
        window.requestAnimationFrame(() => {
            syncNdtDrawerToCanvasArea();
            modal.classList.add('open');
            // 신규 마킹은 모달을 여는 순간 바로 저장해, 저장 버튼 없이 도면에 확정한다
            if (!existingItem) {
                const created = commitNdtFromForm();
                if (created) {
                    const pinIdFresh = document.getElementById('ndtPinId');
                    if (pinIdFresh) pinIdFresh.value = created.id;
                }
            }
            window._ndtFormHydrating = false;
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        });
        // 신규 마킹 후 선택 모드로 복귀 (도면 계속 조작)
        if (!existingItem && typeof window.setNdtMode === 'function') {
            window.setNdtMode('PAN');
        }
    }

    function isNdtModalOpen() {
        const modal = document.getElementById('ndtModal');
        if (!modal) return false;
        return modal.classList.contains('open') || modal.style.display === 'flex';
    }

    function syncNdtDrawerToCanvasArea(overlayId) {
        const ids = overlayId
            ? [overlayId]
            : ['ndtModal', 'ndtCrackMonitorModal', 'ndtDisplacementModal', 'ndtDisplacementGroupEditModal'];
        ids.forEach((id) => {
            const overlay = document.getElementById(id);
            if (!overlay) return;

            // 모바일: 결함창과 같이 전체 화면 기준 하단 시트로 — 도면 영역에 묶지 않음
            if (typeof layoutMediaMobileDefectDrawer === 'function' && layoutMediaMobileDefectDrawer()) {
                overlay.classList.remove('ndt-drawer-in-canvas');
                overlay.style.top = '';
                overlay.style.left = '';
                overlay.style.width = '';
                overlay.style.height = '';
                return;
            }

            const canvasArea = document.getElementById('ndtCanvasContainer');
            const onNdtTab = window.state.currentTab === 'tab-ndt';
            if (onNdtTab && canvasArea && (overlay.classList.contains('open') || overlay.style.display === 'flex' || id === 'ndtModal')) {
                const rect = canvasArea.getBoundingClientRect();
                if (rect.width >= 40 && rect.height >= 40) {
                    overlay.classList.add('ndt-drawer-in-canvas');
                    overlay.style.top = `${Math.round(rect.top)}px`;
                    overlay.style.left = `${Math.round(rect.left)}px`;
                    overlay.style.width = `${Math.round(rect.width)}px`;
                    overlay.style.height = `${Math.round(rect.height)}px`;
                    return;
                }
            }
            overlay.classList.remove('ndt-drawer-in-canvas');
            overlay.style.top = '';
            overlay.style.left = '';
            overlay.style.width = '';
            overlay.style.height = '';
        });
    }

    function closeNdtModal() {
        flushNdtAutoApply();
        const modal = document.getElementById('ndtModal');
        if (!isNdtDisplacementModalOpen() && !isNdtDisplacementGroupEditOpen()) {
            document.body.classList.remove('ndt-modal-open');
        }
        if (!modal) return;
        modal.classList.remove('open');
        window.setTimeout(() => {
            if (modal && !modal.classList.contains('open')) {
                modal.style.display = 'none';
                syncNdtDrawerToCanvasArea();
            }
        }, 280);
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
    }
    window.closeNdtModal = closeNdtModal;
    window.isNdtModalOpen = isNdtModalOpen;

    function flashNdtAutosaveBadge(mode) {
        const badge = document.getElementById('ndtAutosaveBadge');
        if (!badge) return;
        if (mode === 'saving') {
            badge.textContent = '적용 중…';
            badge.classList.add('is-saving');
            return;
        }
        badge.textContent = '자동 적용';
        badge.classList.remove('is-saving');
    }

    function commitNdtFromForm() {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtData[key]) state.ndtData[key] = [];

        const pinId = document.getElementById('ndtPinId')?.value;
        const noStr = document.getElementById('ndtNo')?.value || 'NDT-01';
        const cat = document.getElementById('ndtCategory')?.value || '강도';
        const comp = getDefectComboValue(document.getElementById('ndtComponent'), document.getElementById('ndtComponentInput')) || '';
        // 강도는 위치를 슬롯별로 입력받으므로(공용 위치칸은 숨겨져 비어있음), 하위호환용
        // 최상위 location은 슬롯 1(또는 값이 있는 첫 슬롯) 것을 쓴다.
        const firstStrengthSlot = (cat === '강도')
            ? (ndtStrengthSlots.find(s => (s.readings || []).filter(v => v !== '' && v !== null && v !== undefined).length > 0) || ndtStrengthSlots[0])
            : null;
        const loc = (cat === '강도') ? (firstStrengthSlot?.location || '') : (document.getElementById('ndtLocation')?.value || '');
        const rawHeightStr = (document.getElementById('ndtHeight')?.value || '').trim();
        const formattedHeight = rawHeightStr ? formatHeightValue(rawHeightStr) : '';
        const dispDir = document.getElementById('ndtDispDirection')?.value || '';
        const dispSide = document.getElementById('ndtDispSide')?.value || '';
        const v1 = document.getElementById('ndtVal1')?.value || '';
        const v2 = document.getElementById('ndtVal2')?.value || '';
        const v3 = document.getElementById('ndtVal3')?.value || '';
        let avg = document.getElementById('ndtAvgValue')?.value || '';
        const status = document.getElementById('ndtStatus')?.value || '';

        let tiltRatio = document.getElementById('ndtTiltRatio')?.value || '';
        let grade = document.getElementById('ndtGrade')?.value || '';

        if (cat === '기울기' || cat === '부재변위') {
            const hDigits = (formattedHeight || '').replace(/[^0-9.]/g, '');
            const avgDigits = (avg || '').replace(/[^0-9.-]/g, '');
            const h = parseFloat(hDigits);
            const delta = Math.abs(parseFloat(avgDigits) || 0);
            if (Number.isFinite(h) && h > 0 && delta > 0) {
                const calc = (cat === '부재변위') ? calcMemberDispGrade(h, delta) : calcTiltGrade(h, delta);
                tiltRatio = calc.tiltRatio;
                grade = calc.grade;
            } else {
                tiltRatio = '';
                grade = '';
            }
        }

        // 부재 실측(단면 규격): 설계치수/마감상태/실측치수 + 단면적비율(c%)·등급 자동 산정
        // (시설물 안전 및 유지관리 실시 세부지침(건축물편) [표 6.24])
        // RC: 보(폭×춤) / 기둥(정면·측면) / 슬래브·벽체(두께) / 철골(웨브·플렌지 4칸)
        const finishState = (cat === '실측')
            ? (getDefectComboValue(document.getElementById('ndtFinishState'), document.getElementById('ndtFinishStateInput')) || '')
            : '';
        const dimKind = (cat === '실측') ? resolveNdtFormDimKind(comp, ndtColumnShapeCircle) : null;
        let designWidth = null, designDepth = null, measuredWidth = null, measuredDepth = null;
        let designWeb = null, designFlange = null, designWebWidth = null, designFlangeWidth = null;
        let measuredWeb = null, measuredFlange = null, measuredWebWidth = null, measuredFlangeWidth = null;
        let sectionRatio = null;
        let sectionGrade = null;
        let measureOneSide = null, slabThickness = null, measuredDepthBelowSlab = null;
        let excludeSlab = false, excludeSlabThickness = null, excludeInsulation = false, excludeInsulationThickness = null;
        let excludeWall = false, excludeWallThickness = null, measuredDepthRaw = null, measuredWidthRaw = null;
        if (cat === '실측') {
            if (dimKind === 'steel') {
                const designSteel = readNdtSteelDims('ndtDesign');
                const measuredSteel = resolveNdtSteelMeasuredDims(designSteel, readNdtSteelDims('ndtMeasured'));
                designWeb = designSteel.web;
                designFlange = designSteel.flange;
                designWebWidth = designSteel.webWidth;
                designFlangeWidth = designSteel.flangeWidth;
                measuredWeb = measuredSteel.web;
                measuredFlange = measuredSteel.flange;
                measuredWebWidth = measuredSteel.webWidth;
                measuredFlangeWidth = measuredSteel.flangeWidth;
                designWidth = designWebWidth;
                designDepth = designFlangeWidth;
                measuredWidth = measuredWebWidth;
                measuredDepth = measuredFlangeWidth;
                if (measuredWeb !== null) avg = String(measuredWeb);
                const sectionCalc = calcSteelSectionGrade(designSteel, measuredSteel);
                if (sectionCalc) {
                    sectionRatio = sectionCalc.ratio;
                    sectionGrade = sectionCalc.code;
                }
            } else if (dimKind === 'circle') {
                designWidth = parseNdtDimNumber(document.getElementById('ndtDesignWidth')?.value);
                const rawCircleW = parseNdtDimNumber(document.getElementById('ndtMeasuredWidth')?.value);
                const moC = resolveNdtMeasureOptsFromForm('circle', designWidth, null, rawCircleW, null);
                measuredWidth = moC ? moC.storeW : rawCircleW;
                excludeWall = !!(moC && moC.excludeWallOn);
                excludeWallThickness = moC ? moC.excludeWallMm : null;
                measuredWidthRaw = excludeWall ? (moC ? moC.rawW : null) : null;
                if (measuredWidth !== null) avg = String(measuredWidth);
                const sectionCalc = calcCircleSectionGrade(designWidth, moC ? moC.calcW : measuredWidth);
                if (sectionCalc) {
                    sectionRatio = sectionCalc.ratio;
                    sectionGrade = sectionCalc.code;
                }
            } else {
                const noSecondary = dimKind === 'thickness';
                const designParsed = parseNdtDimensionPair(
                    document.getElementById('ndtDesignWidth')?.value,
                    noSecondary ? '' : document.getElementById('ndtDesignDepth')?.value
                );
                const measuredParsed = parseNdtDimensionPair(
                    document.getElementById('ndtMeasuredWidth')?.value,
                    noSecondary ? '' : document.getElementById('ndtMeasuredDepth')?.value
                );
                designWidth = designParsed.w;
                designDepth = noSecondary ? null : designParsed.d;
                // 2026-10-19 「이쪽만 측정」·「슬래브 두께 합산」(보) — 안 잰 쪽은 설계치수로 계산, 실측 춤 = 입력 춤 + 슬래브
                const mo = resolveNdtMeasureOptsFromForm(dimKind, designWidth, designDepth, measuredParsed.w, noSecondary ? null : measuredParsed.d);
                measuredWidth = mo ? mo.storeW : measuredParsed.w;
                measuredDepth = noSecondary ? null : (mo ? mo.storeD : measuredParsed.d);
                measureOneSide = mo ? mo.oneSide : null;
                slabThickness = mo ? mo.slab : null;
                measuredDepthBelowSlab = mo ? mo.depthBelowSlab : null;
                excludeSlab = !!(mo && mo.excludeSlabOn);
                excludeSlabThickness = mo ? mo.excludeSlabMm : null;
                excludeInsulation = !!(mo && mo.excludeInsulationOn);
                excludeInsulationThickness = mo ? mo.excludeInsulationMm : null;
                excludeWall = !!(mo && mo.excludeWallOn);
                excludeWallThickness = mo ? mo.excludeWallMm : null;
                measuredDepthRaw = (excludeSlab || excludeInsulation) ? (mo ? mo.rawD : null) : null;
                measuredWidthRaw = excludeWall ? (mo ? mo.rawW : null) : null;
                if (measuredWidth !== null) avg = String(measuredWidth);
                const sectionCalc = calcSectionGrade(designWidth, designDepth,
                    mo ? mo.calcW : measuredWidth, noSecondary ? null : (mo ? mo.calcD : measuredDepth));
                if (sectionCalc) {
                    sectionRatio = sectionCalc.ratio;
                    sectionGrade = sectionCalc.code;
                }
            }
        }

        const extra = window._pendingNdtExtra || { targetX: 100, targetY: 100, boxX: 100, boxY: 150 };

        // 콘크리트 강도(반발경도)는 위치 슬롯별로(최대 3개) R값 목록 + 각도보정 + 추정식 3개
        // 결과를 각각 저장한다. 최상위 strength* 필드들은 하위호환용으로 첫 슬롯 결과만 담는다.
        const strengthAngle = document.getElementById('ndtAngle')?.value;
        // 2026-10-19 재령일 직접 입력(이 항목 > 건물 공통 > 준공일 자동)
        const strengthAgeFormItem = (cat === '강도') ? readNdtStrengthAgeFormItem() : null;
        const strengthAgeDays = (cat === '강도') ? resolveStrengthAgeInfo(strengthAgeFormItem).days : null;
        if (cat === '강도') rememberLastStrengthAngle(strengthAngle);
        const enabledFormulaNames = getEnabledStrengthFormulaNames(window.state.currentBuilding);
        const designStrengthVal = (cat === '강도') ? parseFloat(document.getElementById('ndtDesignStrength')?.value) : NaN;
        const damageStatus = (cat === '강도') ? (document.getElementById('ndtDamageStatus')?.value || '') : null;
        const hasDamage = damageStatus === '균열발생';

        const computeSlotResult = (slot) => computeStrengthSlotResult(slot, {
            angle: parseFloat(strengthAngle),
            ageDays: strengthAgeDays,
            enabledNames: enabledFormulaNames,
            anvilAvg: getStrengthAnvilAvg(window.state.currentBuilding),
            designStrength: designStrengthVal,
            hasDamage
        });

        const strengthSlotResults = (cat === '강도')
            ? ndtStrengthSlots
                .filter(s => (s.readings || []).filter(v => v !== '' && v !== null && v !== undefined).length > 0 || (s.location || '').trim() !== '')
                .map(computeSlotResult)
            : [];
        // 슬롯을 하나도 안 채웠으면(위치/R값 둘 다 비어있는 슬롯 1개뿐) 빈 배열 대신 최소 1개는
        // 남겨서(위치 없어도) 완전히 빈 저장이 되지 않게 한다.
        if (cat === '강도' && strengthSlotResults.length === 0) strengthSlotResults.push(computeSlotResult(ndtStrengthSlots[0] || { location: '', readings: [] }));
        const firstSlotResult = strengthSlotResults[0] || null;

        const carbDepthVal = (cat === '탄산화') ? parseFloat(document.getElementById('ndtCarbDepth')?.value) : NaN;
        const carbCoverVal = (cat === '탄산화') ? parseFloat(document.getElementById('ndtCarbCover')?.value) : NaN;
        const carbAgeDays = (cat === '탄산화') ? getConcreteAgeInDays() : null;
        const carbCalc = (cat === '탄산화') ? calcCarbonation(carbDepthVal, carbCoverVal, carbAgeDays !== null ? carbAgeDays / 365 : null) : null;

        const valsArr = (cat === '강도')
            ? (firstSlotResult ? firstSlotResult.readings.filter(v => v !== '' && v !== null && v !== undefined) : [])
            : [v1, v2, v3].filter(x => x.trim() !== '');
        const valuesText = valsArr.join(', ') || '-';
        const strengthExtra = (cat === '강도') ? {
            strengthSlots: strengthSlotResults,
            strengthReadings: firstSlotResult ? firstSlotResult.readings : [],
            // 0°(수평 타격)도 정상 값이다. `|| null`이면 0이 빈 값이 됐다(2026-09-21).
            strengthAngle: Number.isFinite(parseFloat(strengthAngle)) ? parseFloat(strengthAngle) : null,
            strengthResults: firstSlotResult ? firstSlotResult.results : [],
            strengthRo: firstSlotResult ? firstSlotResult.ro : null,
            strengthAgeDays: firstSlotResult ? firstSlotResult.ageDays : null,
            strengthAlpha: firstSlotResult ? firstSlotResult.alpha : null,
            strengthFormulaAvg: firstSlotResult ? firstSlotResult.formulaAvg : null,
            strengthFinal: firstSlotResult ? firstSlotResult.finalStrength : null,
            designStrength: !isNaN(designStrengthVal) ? designStrengthVal : null,
            strengthRatio: firstSlotResult ? firstSlotResult.ratio : null,
            strengthGrade: firstSlotResult ? firstSlotResult.grade : null,
            damageStatus: damageStatus,
            strengthAgeOverride: strengthAgeFormItem ? strengthAgeFormItem.strengthAgeOverride : null
        } : { strengthSlots: [], strengthReadings: [], strengthAngle: null, strengthResults: [], strengthRo: null, strengthAgeDays: null, strengthAlpha: null, strengthFormulaAvg: null, strengthFinal: null, designStrength: null, strengthRatio: null, strengthGrade: null, damageStatus: null, strengthAgeOverride: null };

        const carbExtra = (cat === '탄산화') ? {
            carbDepth: !isNaN(carbDepthVal) ? carbDepthVal : null,
            carbCover: !isNaN(carbCoverVal) ? carbCoverVal : null,
            carbAgeDays: carbAgeDays,
            carbRemainMm: carbCalc ? carbCalc.remainMm : null,
            carbRate: carbCalc ? carbCalc.rate : null,
            carbLifeYears: carbCalc ? carbCalc.lifeYears : null,
            carbRemainingLifeYears: carbCalc ? carbCalc.remainingLifeYears : null
        } : { carbDepth: null, carbCover: null, carbAgeDays: null, carbRemainMm: null, carbRate: null, carbLifeYears: null, carbRemainingLifeYears: null };

        const measureExtra = (cat === '실측')
            ? {
                finishState,
                measureDimMode: dimKind,
                designWidth, designDepth, measuredWidth, measuredDepth,
                designWeb, designFlange, designWebWidth, designFlangeWidth,
                measuredWeb, measuredFlange, measuredWebWidth, measuredFlangeWidth,
                sectionRatio, sectionGrade,
                measureOneSide, slabThickness, measuredDepthBelowSlab,
                excludeSlab, excludeSlabThickness, excludeInsulation, excludeInsulationThickness,
                excludeWall, excludeWallThickness, measuredDepthRaw, measuredWidthRaw
            }
            : {
                finishState: null, measureDimMode: null,
                designWidth: null, designDepth: null, measuredWidth: null, measuredDepth: null,
                designWeb: null, designFlange: null, designWebWidth: null, designFlangeWidth: null,
                measuredWeb: null, measuredFlange: null, measuredWebWidth: null, measuredFlangeWidth: null,
                sectionRatio: null, sectionGrade: null,
                measureOneSide: null, slabThickness: null, measuredDepthBelowSlab: null,
                excludeSlab: false, excludeSlabThickness: null, excludeInsulation: false, excludeInsulationThickness: null,
                excludeWall: false, excludeWallThickness: null, measuredDepthRaw: null, measuredWidthRaw: null
            };

        // 내화피복 두께: 플렌지/웨브 실측값을 모으고, 평균은 한 부재(최대 6개소) 기준으로 저장.
        const buildFireproofPart = (part) => {
            const unavailable = document.getElementById(`ndtFp${part}Unavailable`)?.checked || false;
            const readings = [1, 2, 3]
                .map(n => parseFloat(document.getElementById(`ndtFp${part}${n}`)?.value))
                .filter(v => Number.isFinite(v));
            return { readings, avg: null, unavailable };
        };
        const fpFlange = (cat === '내화피복') ? buildFireproofPart('Flange') : null;
        const fpWeb = (cat === '내화피복') ? buildFireproofPart('Web') : null;
        let fpMemberAvg = null;
        if (cat === '내화피복') {
            if (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function') {
                fpMemberAvg = window.BSA.ndtStats.fireproofMemberAvg({ fpFlange, fpWeb });
            } else {
                const vals = [];
                [fpFlange, fpWeb].forEach(part => {
                    if (!part || part.unavailable) return;
                    (part.readings || []).forEach(v => { if (Number.isFinite(v)) vals.push(v); });
                });
                if (vals.length) fpMemberAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
            }
        }
        if (fpFlange) fpFlange.avg = fpMemberAvg;
        if (fpWeb) fpWeb.avg = fpMemberAvg;
        const fireproofExtra = (cat === '내화피복')
            ? {
                fireproofDesign: document.getElementById('ndtFireproofDesign')?.value || '',
                fpFlange,
                fpWeb,
                fpAvg: fpMemberAvg
            }
            : { fireproofDesign: null, fpFlange: null, fpWeb: null, fpAvg: null };

        let savedItem = null;
        if (pinId) {
            const idx = state.ndtData[key].findIndex(x => x.id === pinId);
            if (idx >= 0) {
                const existing = state.ndtData[key][idx];
                // 폼 자동적용 시 모달 오픈 시점의 _pendingNdtExtra로 덮어쓰지 않음
                // (변위 방향만 바꿔도 박스 위치가 초기화되던 버그 방지)
                const liveTargetX = existing.targetX !== undefined ? existing.targetX
                    : (existing.x !== undefined ? existing.x : extra.targetX);
                const liveTargetY = existing.targetY !== undefined ? existing.targetY
                    : (existing.y !== undefined ? existing.y : extra.targetY);
                const liveBoxX = existing.boxX !== undefined ? existing.boxX : liveTargetX;
                const liveBoxY = existing.boxY !== undefined ? existing.boxY : liveTargetY;
                state.ndtData[key][idx] = {
                    ...existing,
                    no: noStr,
                    category: cat,
                    component: comp,
                    location: loc,
                    height: formattedHeight,
                    dispDirection: (cat === '기울기' && ndtTiltSideGlyph(dispSide, liveTargetX - liveBoxX, liveTargetY - liveBoxY)) || dispDir,
                    // 예전 8방향 마킹은 왼쪽·오른쪽을 고르기 전까지 그 방향 그대로 둔다
                    ...((cat === '기울기' && (dispSide || existing.dispSide !== undefined)) ? { dispSide } : {}),
                    targetX: liveTargetX,
                    targetY: liveTargetY,
                    boxX: liveBoxX,
                    boxY: liveBoxY,
                    v1, v2, v3,
                    valuesText,
                    avgValue: avg || valuesText,
                    status,
                    tiltRatio,
                    grade,
                    ...strengthExtra,
                    ...carbExtra,
                    ...measureExtra,
                    ...fireproofExtra,
                    photoIds: ndtItemPhotoIds.slice(),
                    inspectorName: existing.inspectorName || window.state.userName || ''
                };
                touchNdtUpdatedAt(state.ndtData[key][idx]);
                savedItem = state.ndtData[key][idx];
                window._pendingNdtExtra = {
                    targetX: liveTargetX,
                    targetY: liveTargetY,
                    boxX: liveBoxX,
                    boxY: liveBoxY
                };
            }
        } else {
            const newItem = {
                id: `ndt_${Date.now()}`,
                no: noStr,
                category: cat,
                component: comp,
                location: loc,
                height: formattedHeight,
                dispDirection: (cat === '기울기' && ndtTiltSideGlyph(dispSide, extra.targetX - extra.boxX, extra.targetY - extra.boxY)) || dispDir,
                ...(cat === '기울기' ? { dispSide } : {}),
                targetX: extra.targetX,
                targetY: extra.targetY,
                boxX: extra.boxX,
                boxY: extra.boxY,
                v1, v2, v3,
                valuesText,
                avgValue: avg || valuesText,
                status,
                tiltRatio,
                grade,
                ...strengthExtra,
                ...carbExtra,
                ...measureExtra,
                ...fireproofExtra,
                photoIds: ndtItemPhotoIds.slice(),
                inspectorName: window.state.userName || '',
                updatedAt: Date.now(),
                x: extra.targetX,
                y: extra.targetY
            };
            state.ndtData[key].push(newItem);
            savedItem = newItem;
        }

        saveStateToLocalStorage();
        return savedItem;
    }

    function scheduleNdtAutoApply() {
        if (window._ndtFormHydrating) return;
        if (!isNdtModalOpen()) return;
        window.clearTimeout(window._ndtAutoApplyTimer);
        window._ndtAutoApplyTimer = window.setTimeout(() => {
            if (window._ndtFormHydrating || !isNdtModalOpen()) return;
            flashNdtAutosaveBadge('saving');
            const saved = commitNdtFromForm();
            if (saved) {
                const pinIdEl = document.getElementById('ndtPinId');
                if (pinIdEl && !pinIdEl.value) pinIdEl.value = saved.id;
            }
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
            flashNdtAutosaveBadge('done');
        }, 180);
    }

    function flushNdtAutoApply() {
        if (window._ndtAutoApplyTimer) {
            window.clearTimeout(window._ndtAutoApplyTimer);
            window._ndtAutoApplyTimer = null;
            if (!window._ndtFormHydrating && isNdtModalOpen()) {
                const saved = commitNdtFromForm();
                if (saved) {
                    const pinIdEl = document.getElementById('ndtPinId');
                    if (pinIdEl && !pinIdEl.value) pinIdEl.value = saved.id;
                }
            }
        }
    }

    function bindNdtFormAutoApply() {
        const body = document.querySelector('#ndtModal .defect-drawer-body');
        if (!body || body.dataset.autoApplyBound) return;
        body.dataset.autoApplyBound = '1';
        body.addEventListener('input', () => scheduleNdtAutoApply());
        body.addEventListener('change', () => scheduleNdtAutoApply());
    }

    function setupNdtModalEvents() {
        bindNdtFormAutoApply();
        bindNdtPickInputs();
        populateNdtComponentDropdown('');
        populateNdtFinishStateDropdown('');
        refreshNdtComponentPickBar();
        refreshNdtFinishStatePickBar();
        const modal = document.getElementById('ndtModal');
        const btnClose = document.getElementById('btnCloseNdtModal');
        const btnCancel = document.getElementById('btnCancelNdt');
        const btnSave = document.getElementById('btnSaveNdt');
        const btnDelete = document.getElementById('btnDeleteNdt');

        const v1El = document.getElementById('ndtVal1');
        const v2El = document.getElementById('ndtVal2');
        const v3El = document.getElementById('ndtVal3');
        const avgEl = document.getElementById('ndtAvgValue');
        const heightEl = document.getElementById('ndtHeight');

        function calcNdtAvg() {
            const cat = document.getElementById('ndtCategory')?.value || '강도';
            const n1 = parseFloat(v1El?.value);
            const n2 = parseFloat(v2El?.value);
            const n3 = parseFloat(v3El?.value);

            if (cat === '부재변위') {
                if (!isNaN(n1) && !isNaN(n2) && !isNaN(n3)) {
                    // 세 점 측정: (단부 1 + 단부 2) / 2 - 중앙부 = 처짐량
                    const endAvg = (n1 + n3) / 2.0;
                    const delta = (endAvg - n2).toFixed(1);
                    if (avgEl) avgEl.value = `${delta}mm`;
                } else if (!isNaN(n1) && !isNaN(n2)) {
                    const delta = (n1 - n2).toFixed(1);
                    if (avgEl) avgEl.value = `${delta}mm`;
                } else {
                    const raw1 = (v1El?.value || '').trim();
                    if (raw1 && avgEl) avgEl.value = raw1;
                }
            } else {
                const nums = [n1, n2, n3].filter(n => !isNaN(n));
                if (nums.length > 0) {
                    const sum = nums.reduce((a, b) => a + b, 0);
                    const avg = (sum / nums.length).toFixed(1);
                    const unitStr = (cat === '기울기') ? 'mm' : '';
                    if (avgEl) avgEl.value = `${avg}${unitStr}`;
                } else {
                    const raw1 = (v1El?.value || '').trim();
                    if (raw1 && avgEl) avgEl.value = raw1;
                }
            }
            calcTiltAuto();
            calcSectionAuto();
        }

        function calcSectionAuto() {
            const cat = document.getElementById('ndtCategory')?.value || '강도';
            if (cat !== '실측') return;
            const ratioEl = document.getElementById('ndtSectionRatio');
            const gradeEl = document.getElementById('ndtSectionGrade');
            const dimKind = getNdtFormDimKind();
            let calc = null;
            if (dimKind === 'steel') {
                const designSteel = readNdtSteelDims('ndtDesign');
                calc = calcSteelSectionGrade(designSteel, resolveNdtSteelMeasuredDims(designSteel, readNdtSteelDims('ndtMeasured')));
            } else if (dimKind === 'circle') {
                const designDiameter = parseNdtDimNumber(document.getElementById('ndtDesignWidth')?.value);
                const measuredDiameter = parseNdtDimNumber(document.getElementById('ndtMeasuredWidth')?.value);
                calc = calcCircleSectionGrade(designDiameter, measuredDiameter);
            } else {
                const design = parseNdtDimensionPair(
                    document.getElementById('ndtDesignWidth')?.value,
                    dimKind === 'thickness' ? '' : document.getElementById('ndtDesignDepth')?.value
                );
                const measured = parseNdtDimensionPair(
                    document.getElementById('ndtMeasuredWidth')?.value,
                    dimKind === 'thickness' ? '' : document.getElementById('ndtMeasuredDepth')?.value
                );
                const mo = resolveNdtMeasureOptsFromForm(dimKind, design.w, dimKind === 'thickness' ? null : design.d,
                    measured.w, dimKind === 'thickness' ? null : measured.d);
                calc = mo
                    ? calcSectionGrade(design.w, design.d, mo.calcW, mo.calcD)
                    : calcSectionGrade(design.w, design.d, measured.w, measured.d);
                updateNdtMeasureOptsHint(mo, measured.d);
            }
            if (calc) {
                if (ratioEl) ratioEl.value = `${calc.ratio.toFixed(1)}%`;
                if (gradeEl) gradeEl.value = calc.code;
            } else {
                if (ratioEl) ratioEl.value = '';
                if (gradeEl) gradeEl.value = '';
            }
        }

        window.recalcNdtSectionAuto = calcSectionAuto;

        // --- 내화피복 두께: 플렌지+웨브 유효 개소(최대 6)를 한 부재 평균으로 ---
        function calcFireproofAuto() {
            const cat = document.getElementById('ndtCategory')?.value || '강도';
            if (cat !== '내화피복') return;
            const partOf = (part) => {
                const unavailable = document.getElementById(`ndtFp${part}Unavailable`)?.checked || false;
                const readings = [1, 2, 3].map(n => parseFloat(document.getElementById(`ndtFp${part}${n}`)?.value)).filter(v => Number.isFinite(v));
                return { readings, unavailable };
            };
            const item = { fpFlange: partOf('Flange'), fpWeb: partOf('Web') };
            let avg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                ? window.BSA.ndtStats.fireproofMemberAvg(item)
                : null;
            if (avg == null) {
                const vals = [];
                [item.fpFlange, item.fpWeb].forEach(part => {
                    if (!part || part.unavailable) return;
                    (part.readings || []).forEach(v => { if (Number.isFinite(v)) vals.push(v); });
                });
                if (vals.length) avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            }
            const avgStr = (avg == null || !Number.isFinite(avg)) ? '' : Number(avg).toFixed(2);
            ['Flange', 'Web'].forEach(part => {
                const avgEl2 = document.getElementById(`ndtFp${part}Avg`);
                if (avgEl2) avgEl2.value = avgStr;
            });
        }

        function calcTiltAuto() {
            const cat = document.getElementById('ndtCategory')?.value || '강도';
            if (cat !== '기울기' && cat !== '부재변위') return;

            const hStr = (heightEl?.value || '').replace(/[^0-9.]/g, '');
            const deltaStr = (avgEl?.value || '').replace(/[^0-9.-]/g, '');
            const h = parseFloat(hStr);
            const delta = Math.abs(parseFloat(deltaStr) || 0);

            const tiltRatioEl = document.getElementById('ndtTiltRatio');
            const gradeEl = document.getElementById('ndtGrade');

            if (Number.isFinite(h) && h > 0 && delta > 0) {
                const calc = (cat === '부재변위') ? calcMemberDispGrade(h, delta) : calcTiltGrade(h, delta);
                if (tiltRatioEl) tiltRatioEl.value = calc.tiltRatio;
                if (gradeEl) gradeEl.value = calc.grade;
            } else {
                if (tiltRatioEl) tiltRatioEl.value = '';
                if (gradeEl) gradeEl.value = '';
            }
        }

        const catEl = document.getElementById('ndtCategory');
        if (catEl) {
            catEl.addEventListener('change', () => {
                const cat = catEl.value;
                const pinId = document.getElementById('ndtPinId')?.value;
                if (!pinId) {
                    const items = getAllFloorsNdtData(state.currentBuildingId);
                    const count = items.filter(x => x.category === cat).length + 1;
                    const seqStr = count < 10 ? `0${count}` : `${count}`;
                    const noEl = document.getElementById('ndtNo');
                    if (noEl) noEl.value = `NO.${seqStr}`;
                }
                window.toggleNdtModalFields();
                calcNdtAvg();
                recalcAllStrengthSlots();
                recalcNdtCarbonation();
                calcFireproofAuto();
            });
        }

        [v1El, v2El, v3El, heightEl].forEach(el => {
            if (el) el.addEventListener('input', calcNdtAvg);
        });

        // --- 부재 실측: 설계치수/실측치수 입력 시 단면적비율(c%)/등급 자동 재계산 ---
        ['ndtDesignWidth', 'ndtDesignDepth', 'ndtMeasuredWidth', 'ndtMeasuredDepth',
            'ndtDesignWeb', 'ndtDesignFlange', 'ndtDesignWebWidth', 'ndtDesignFlangeWidth',
            'ndtMeasuredWeb', 'ndtMeasuredFlange', 'ndtMeasuredWebWidth', 'ndtMeasuredFlangeWidth'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', calcSectionAuto);
        });

        // --- 내화피복: 실측값·측정불가 변경 시 부재 평균 자동 재계산 ---
        ['ndtFpFlange1', 'ndtFpFlange2', 'ndtFpFlange3', 'ndtFpWeb1', 'ndtFpWeb2', 'ndtFpWeb3',
            'ndtFpFlangeUnavailable', 'ndtFpWebUnavailable'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', calcFireproofAuto);
        });

        // --- 콘크리트 강도 위치 슬롯/각도 UI ---
        const btnAddStrengthSlot = document.getElementById('btnAddStrengthSlot');
        if (btnAddStrengthSlot) btnAddStrengthSlot.addEventListener('click', () => {
            if (ndtStrengthSlots.length >= MAX_STRENGTH_SLOTS) return;
            ndtStrengthSlots.push({ location: '', readings: [] });
            renderNdtStrengthSlots();
            scheduleNdtAutoApply();
        });

        const ndtAngleEl = document.getElementById('ndtAngle');
        if (ndtAngleEl) ndtAngleEl.addEventListener('change', recalcAllStrengthSlots);
        ensureAnvilInputRow();
        ensureStrengthAgeRow();

        const ndtDesignStrengthEl = document.getElementById('ndtDesignStrength');
        if (ndtDesignStrengthEl) ndtDesignStrengthEl.addEventListener('input', recalcAllStrengthSlots);

        const ndtCarbDepthEl = document.getElementById('ndtCarbDepth');
        const ndtCarbCoverEl = document.getElementById('ndtCarbCover');
        [ndtCarbDepthEl, ndtCarbCoverEl].forEach(el => {
            if (el) el.addEventListener('input', recalcNdtCarbonation);
        });

        function closeNdtModalLocal() {
            closeNdtModal();
            if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        }

        if (btnClose) btnClose.addEventListener('click', closeNdtModalLocal);
        if (btnCancel) btnCancel.addEventListener('click', closeNdtModalLocal);

        if (btnSave) {
            btnSave.addEventListener('click', () => {
                // 이미 자동 적용되므로 닫기만 수행 (대기 중인 디바운스 저장 먼저 flush)
                closeNdtModalLocal();
            });
        }

        if (btnDelete) {
            btnDelete.addEventListener('click', async () => {
                const pinId = document.getElementById('ndtPinId')?.value;
                if (!pinId) {
                    closeNdtModal();
                    return;
                }
                window.clearTimeout(window._ndtAutoApplyTimer);
                window._ndtAutoApplyTimer = null;
                if (await window.deleteNdtItem(pinId)) {
                    closeNdtModal();
                }
            });
        }

        // NDT Drawing File Upload
        const inputNdtDrawing = document.getElementById('inputNdtDrawing');
        if (inputNdtDrawing) {
            inputNdtDrawing.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const key = `${state.currentBuildingId}_${state.currentFloor}`;
                        await setNdtCustomDrawing(key, event.target.result);
                        loadFloorNdtDrawing();
                        window.showToast('NDT 전용 도면이 등록되었습니다.', 'success');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        const btnSync = document.getElementById('btnNdtSyncFloorDrawing');
        if (btnSync) {
            btnSync.addEventListener('click', async () => {
                const key = `${state.currentBuildingId}_${state.currentFloor}`;
                const ref = ndtDrawingRefFor(key);
                if ((state.ndtImages && state.ndtImages[key]) || (ref && ref.id)) {
                    // 다른 기기에도 "전용 도면 뺐음"이 가도록 참조를 빈 id로 남긴다
                    await setNdtCustomDrawing(key, null);
                }
                loadFloorNdtDrawing();
                window.showToast('층별 원본 도면으로 연동이 완료되었습니다.', 'success');
            });
        }
    }

    // --- 수직변위 / 부재변위: 그룹/포인트 등록·수정 모달 ---

    const NDT_DISP_LOCATION_PRESET = ['보', '슬래브', '바닥'];

    function refreshNdtDispLocationChips(selectId, chipsId) {
        const select = document.getElementById(selectId);
        if (!select || typeof renderQuickPickChipGroup !== 'function') return;
        const current = select.value || '보';
        renderQuickPickChipGroup(chipsId, NDT_DISP_LOCATION_PRESET, current, (value) => {
            select.value = value;
            refreshNdtDispLocationChips(selectId, chipsId);
        });
    }

    /** 입력 중인 지점이 입력창 밑에 가려지면 도면을 옮겨 보이게 한다 */
    function keepNdtDispPointInView(modal, point) {
        const canvas = document.getElementById('ndtCanvas');
        const cardEl = modal.querySelector('.ndt-drawer-card');
        if (!canvas || !cardEl || !point) return;
        const rect = canvas.getBoundingClientRect();
        const card = cardEl.getBoundingClientRect();
        const sx = rect.left + ndtView.offsetX + point.x * ndtView.scale;
        const sy = rect.top + ndtView.offsetY + point.y * ndtView.scale;
        const m = 40;
        if (sx < card.left - m || sx > card.right + m || sy < card.top - m || sy > card.bottom + m) return;
        if (card.width > rect.width / 2) {
            ndtView.offsetY += (rect.top + Math.min(card.top, rect.bottom)) / 2 - sy;
        } else {
            ndtView.offsetX += (rect.left + card.left) / 2 - sx;
        }
        drawNdtCanvas();
    }

    function openNdtDisplacementModal(imgX, imgY, existingGroup, existingPoint) {
        const modal = document.getElementById('ndtDisplacementModal');
        if (!modal) return;
        flushNdtDispLevelAutosave();
        window._pendingNdtDispCoords = { x: imgX, y: imgY };
        refreshNdtDispActiveTemplate();

        const groupIdEl = document.getElementById('ndtDispGroupId');
        const pointIdEl = document.getElementById('ndtDispPointId');
        const hintEl = document.getElementById('ndtDispModalHint');
        const infoBlock = document.getElementById('groupNdtDispInfo');
        const locEl = document.getElementById('ndtDispLocationType');
        const lenEl = document.getElementById('ndtDispMeasureLength');
        const damageRow = document.getElementById('ndtDispMinorDamageRow');
        const damageEl = document.getElementById('ndtDispHasMinorDamage');
        const levelEl = document.getElementById('ndtDispLevel');
        const modalTitleEl = document.getElementById('ndtDispModalTitle') || modal.querySelector('.modal-header h3');
        const btnDelete = document.getElementById('btnDeleteNdtDispPoint');
        const btnAddAnother = document.getElementById('btnAddAnotherNdtPoint');
        const btnNewZone = document.getElementById('btnStartNewNdtDispZone');

        const cat = (existingGroup ? existingGroup.category : currentNdtCategory) || '변위';
        const isMemberDisp = cat === '부재변위';

        if (modalTitleEl) {
            if (isMemberDisp) {
                modalTitleEl.innerHTML = `<i class="fa-solid fa-arrows-up-down"></i> 🏗️ 부재처짐 (부재변위) 측정`;
            } else {
                modalTitleEl.innerHTML = `<i class="fa-solid fa-arrows-up-down"></i> 📉 부동침하 기울기 측정`;
            }
        }

        const activeGroup = (!existingGroup && !existingPoint) ? getActiveNdtDispGroup() : null;
        const tmpl = window._ndtDisplacementTemplate;
        const continueGroup = existingGroup && !existingPoint
            ? existingGroup
            : ((!existingPoint && activeGroup) ? activeGroup : null);

        if (existingGroup && existingPoint) {
            const idx = existingGroup.points.indexOf(existingPoint);
            groupIdEl.value = existingGroup.id;
            pointIdEl.value = existingPoint.id;
            const ptRole = isMemberDisp ? (idx === 0 ? ' [단부 1]' : (idx === existingGroup.points.length - 1 ? ' [단부 2]' : ' [중앙부]')) : '';
            hintEl.textContent = `${existingGroup.groupNo} 구역 · ${idx + 1}번째 지점 ${formatNdtDisplacementPointLabel(idx + 1)}${ptRole} · 전체 ${existingGroup.points.length}개`;
            infoBlock.style.display = 'none';
            if (damageRow) damageRow.style.display = 'none';
            levelEl.value = isNdtDispLevelFilled(existingPoint.level) ? existingPoint.level : '';
            btnDelete.style.display = '';
            if (btnAddAnother) btnAddAnother.style.display = 'none';
            if (btnNewZone) btnNewZone.style.display = '';
            // 개별 마킹: 「이동 보정」 버튼 (복잡한 패널 대신)
            const xferWrap = document.getElementById('ndtDispPointStationTransfer');
            if (xferWrap) xferWrap.dataset.open = '0';
            ensureNdtDispPointModalTransferUi(existingGroup, existingPoint);
        } else if (continueGroup || tmpl) {
            const group = continueGroup || getCurrentFloorDisplacementGroups(cat).find(g => g.id === tmpl.groupId);
            if (!group) {
                setActiveNdtDispGroup(null);
                return openNdtDisplacementModal(imgX, imgY, null, null);
            }
            setActiveNdtDispGroup(group);
            const ptSeq = group.points.length + 1;
            groupIdEl.value = group.id;
            pointIdEl.value = '';
            const ptRole = isMemberDisp ? (ptSeq === 1 ? ' (단부 1)' : (ptSeq === 2 ? ' (중앙부)' : ' (단부 2)')) : '';
            hintEl.textContent = `${group.groupNo} 구역에 측정 지점 추가 ${formatNdtDisplacementPointLabel(ptSeq)}${ptRole} — 구역 안에서 번호가 이어집니다`;
            infoBlock.style.display = 'none';
            if (damageRow) damageRow.style.display = 'none';
            levelEl.value = '';
            btnDelete.style.display = 'none';
            if (btnAddAnother) btnAddAnother.style.display = '';
            if (btnNewZone) btnNewZone.style.display = '';
            ensureNdtDispPointModalTransferUi(null, null);
        } else {
            groupIdEl.value = '';
            pointIdEl.value = '';
            const ptRole = isMemberDisp ? ' (단부 1)' : '';
            hintEl.textContent = `새 측정 구역 (${nextDisplacementGroupNo(cat)}) - ${formatNdtDisplacementPointLabel(1)}${ptRole}`;
            infoBlock.style.display = '';
            if (damageRow) damageRow.style.display = isMemberDisp ? '' : 'none';
            if (damageEl) damageEl.checked = false;
            locEl.value = '보';
            lenEl.value = '';
            levelEl.value = '';
            btnDelete.style.display = 'none';
            if (btnAddAnother) btnAddAnother.style.display = '';
            if (btnNewZone) btnNewZone.style.display = 'none';
            ensureNdtDispPointModalTransferUi(null, null);
        }

        // 레벨 입력 단위 라벨: 기존 구역에 넣으면 그 구역 단위, 새 구역은 mm
        const lvlGroup = existingGroup || continueGroup
            || (tmpl ? getCurrentFloorDisplacementGroups(cat).find(g => g.id === tmpl.groupId) : null);
        const lblLevel = document.getElementById('lblNdtDispLevel');
        const isPointEdit = !!(existingGroup && existingPoint);
        if (lblLevel) {
            const unit = lvlGroup ? ndtDispLevelUnit(lvlGroup) : 'mm';
            lblLevel.textContent = isPointEdit ? `📊 레벨값 (${unit}) · 입력하면 자동 저장` : `📊 레벨값 (${unit})`;
        }
        // 지점 입력은 자동 저장 — 취소는 없고 저장 버튼은 「완료」, 다음 지점으로 바로 이동
        const btnSave = document.getElementById('btnSaveNdtDisp');
        const btnCancel = document.getElementById('btnCancelNdtDisp');
        const btnNext = document.getElementById('btnNextNdtDispPoint');
        if (btnSave) btnSave.innerHTML = `<i class="fa-solid fa-check"></i> ${isPointEdit ? '완료' : '저장'}`;
        if (btnCancel) btnCancel.style.display = isPointEdit ? 'none' : '';
        if (btnNext) btnNext.style.display = (isPointEdit && existingPoint !== existingGroup.points[existingGroup.points.length - 1]) ? '' : 'none';
        window._ndtDispEditingPointId = isPointEdit ? existingPoint.id : null;
        drawNdtCanvas();
        refreshNdtDispLocationChips('ndtDispLocationType', 'ndtDispLocationChips');
        document.body.classList.add('ndt-modal-open');
        modal.style.display = 'flex';
        modal.classList.add('open');
        syncNdtDrawerToCanvasArea('ndtDisplacementModal');
        requestAnimationFrame(() => {
            syncNdtDrawerToCanvasArea('ndtDisplacementModal');
            levelEl.focus();
        });
        if (isPointEdit) {
            window.setTimeout(() => {
                if (window._ndtDispEditingPointId === existingPoint.id) keepNdtDispPointInView(modal, existingPoint);
            }, 320);
        }
    }

    /** 레벨 칸 입력을 잠시 뒤 저장 — 쓰다 만 값('-')은 건너뛴다 */
    function saveNdtDispLevelNow() {
        window.clearTimeout(window._ndtDispLevelSaveTimer);
        window._ndtDispLevelSaveTimer = null;
        if (!document.getElementById('ndtDispPointId')?.value) return;
        const raw = document.getElementById('ndtDispLevel')?.value;
        if (raw !== '' && isNaN(parseFloat(raw))) return;
        if (!commitNdtDisplacement()) return;
        drawNdtCanvas();
        renderNdtSummaryTable();
    }

    function flushNdtDispLevelAutosave() {
        if (window._ndtDispLevelSaveTimer) saveNdtDispLevelNow();
    }

    /** 같은 구역의 다음 지점 입력으로 이동. 마지막 지점이면 false */
    function goToNextNdtDispPoint() {
        flushNdtDispLevelAutosave();
        const pointId = document.getElementById('ndtDispPointId')?.value;
        const group = pointId ? getNdtDispGroupById(document.getElementById('ndtDispGroupId')?.value) : null;
        if (!group) return false;
        const idx = group.points.findIndex((p) => p.id === pointId);
        const next = idx >= 0 ? group.points[idx + 1] : null;
        if (!next) return false;
        setActiveNdtDispGroup(group);
        openNdtDisplacementModal(next.x, next.y, group, next);
        return true;
    }

    function closeNdtDisplacementModal() {
        flushNdtDispLevelAutosave();
        if (window._ndtDispEditingPointId) {
            window._ndtDispEditingPointId = null;
            drawNdtCanvas();
        }
        // 활성 구역은 유지 — 다음 마킹에서 같은 구역 (02)(03)… 이어쓰기
        window._ndtDisplacementTemplate = null;
        refreshNdtDispActiveTemplate();
        if (typeof ensureNdtDispPointModalTransferUi === 'function') {
            ensureNdtDispPointModalTransferUi(null, null);
        }
        const modal = document.getElementById('ndtDisplacementModal');
        if (modal) {
            modal.classList.remove('open');
            window.setTimeout(() => {
                if (modal && !modal.classList.contains('open')) {
                    modal.style.display = 'none';
                    syncNdtDrawerToCanvasArea('ndtDisplacementModal');
                }
            }, 280);
        }
        if (!isNdtModalOpen() && !isNdtDisplacementGroupEditOpen()) {
            document.body.classList.remove('ndt-modal-open');
        }
    }

    function isNdtDisplacementModalOpen() {
        const modal = document.getElementById('ndtDisplacementModal');
        if (!modal) return false;
        return modal.classList.contains('open') || modal.style.display === 'flex';
    }

    function isNdtDisplacementGroupEditOpen() {
        const modal = document.getElementById('ndtDisplacementGroupEditModal');
        if (!modal) return false;
        return modal.classList.contains('open') || modal.style.display === 'flex';
    }

    window.closeNdtDisplacementModal = closeNdtDisplacementModal;
    window.isNdtDisplacementModalOpen = isNdtDisplacementModalOpen;

    // 모달 입력값을 저장하고 {group, point}를 반환 (검증 실패 시 null)
    function commitNdtDisplacement() {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtDisplacementGroups[key]) state.ndtDisplacementGroups[key] = [];
        const groups = state.ndtDisplacementGroups[key];

        const groupId = document.getElementById('ndtDispGroupId').value;
        const pointId = document.getElementById('ndtDispPointId').value;
        const levelRaw = document.getElementById('ndtDispLevel').value;
        const level = (levelRaw === '' || levelRaw === null || levelRaw === undefined)
            ? null
            : parseFloat(levelRaw);
        if (levelRaw !== '' && levelRaw != null && isNaN(level)) {
            window.showToast('레벨값을 확인해 주세요.', 'warning');
            return null;
        }
        const coords = window._pendingNdtDispCoords || { x: 100, y: 100 };

        if (pointId) {
            const group = groups.find(g => g.points.some(p => p.id === pointId));
            if (!group) return null;
            const point = group.points.find(p => p.id === pointId);
            point.level = level;
            touchNdtDispGroup(group);
            saveStateToLocalStorage();
            return { group, point };
        }

        if (groupId) {
            const group = groups.find(g => g.id === groupId);
            if (!group) return null;
            const point = { id: `ndtp_${Date.now()}`, x: coords.x, y: coords.y, level };
            group.points.push(point);
            touchNdtDispGroup(group);
            saveStateToLocalStorage();
            return { group, point };
        }

        const locationType = document.getElementById('ndtDispLocationType').value || '보';
        const measureLengthRaw = document.getElementById('ndtDispMeasureLength').value;
        const measureLength = parseFloat(measureLengthRaw);
        // 모달로 새 구역을 만들 때는 길이 권장 — 비어 있으면 null로 두고 구역 편집에서 채움
        const resolvedLength = (!measureLengthRaw || isNaN(measureLength) || measureLength <= 0)
            ? null
            : measureLength;
        const cat = currentNdtCategory === '부재변위' ? '부재변위' : '변위';
        const hasMinorDamage = cat === '부재변위' && !!document.getElementById('ndtDispHasMinorDamage')?.checked;
        const color = NDT_DISPLACEMENT_COLORS[groups.length % NDT_DISPLACEMENT_COLORS.length];
        const point = { id: `ndtp_${Date.now()}`, x: coords.x, y: coords.y, level };
        const group = {
            id: `ndtg_${Date.now()}`,
            category: cat,
            groupNo: nextDisplacementGroupNo(cat),
            locationType,
            measureLength: resolvedLength,
            levelUnit: 'mm',
            hasMinorDamage,
            color,
            boxX: coords.x - 40,
            boxY: coords.y - 50,
            points: [point]
        };
        groups.push(group);
        touchNdtDispGroup(group);
        saveStateToLocalStorage();
        return { group, point };
    }

    // --- 측기 이동 보정(2026-10-12 재설계) ---
    // 적은 레벨은 절대 고치지 않는다. 이동한 지점마다 Va(이전 측기)·Vb(이후 측기)만 따로 적어 두고,
    // 계산할 때 그 뒤 번호에서 누적 차이(Vb−Va)를 빼서 첫 측기 기준으로 맞춘다(js/core/ndt-disp-transfer.js).
    // 그래서 나중에 적는 값도, 순서 없이 적은 보정도 바로 반영된다.
    function getNdtDispGroupById(groupId) {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        return ((state.ndtDisplacementGroups || {})[key] || []).find((g) => g && g.id === groupId) || null;
    }

    function computeNdtDispStationDelta(va, vb) {
        const a = Number(va);
        const b = Number(vb);
        if (va === '' || vb === '' || va == null || vb == null) return null;
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return b - a;
    }

    /** 이동 보정 기록만 저장(레벨은 그대로) */
    function applyNdtDispStationTransfer(group, overlapIndex, va, vb) {
        if (!group || !Array.isArray(group.points) || !group.points.length) {
            return { ok: false, reason: 'no-points' };
        }
        const idx = Number(overlapIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= group.points.length) {
            return { ok: false, reason: 'bad-overlap' };
        }
        const delta = computeNdtDispStationDelta(va, vb);
        if (delta == null) return { ok: false, reason: 'bad-levels' };
        ndtDispTransferApi().setTransfer(group, idx, Number(va), Number(vb));
        return { ok: true, delta, overlapIndex: idx };
    }

    function clearNdtDispStationTransfer(group, idx) {
        const api = ndtDispTransferApi();
        return !!(api && api.clearTransfer(group, idx));
    }

    function removeNdtDispStationTransferPanel() {
        const panel = document.getElementById('ndtDispStationTransferPanel');
        if (panel) panel.remove();
    }

    /** 목록 아래: 보정이 들어간 지점 요약(지우기는 각 지점 「이동 보정」에서) */
    function ensureNdtDispStationTransferUi(group) {
        removeNdtDispStationTransferPanel();
        const host = document.getElementById('ndtDispEditPointList');
        if (!host || !host.parentElement) return;
        let bar = document.getElementById('ndtDispStationTransferUndoBar');
        const api = ndtDispTransferApi();
        const pts = (group && group.points) || [];
        const list = [];
        pts.forEach((p, i) => {
            const x = api && api.xferOf(p);
            if (x) list.push(`${formatNdtDisplacementPointLabel(i + 1)} Va ${x.va} / Vb ${x.vb} (Δ ${(x.vb - x.va).toFixed(3)})`);
        });
        if (!list.length) {
            if (bar) bar.remove();
            return;
        }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ndtDispStationTransferUndoBar';
            bar.style.cssText = 'margin-top:0.5rem;font-size:0.75rem;color:#64748b;line-height:1.4;';
            host.parentElement.appendChild(bar);
        }
        bar.textContent = `측기 이동 보정 ${list.length}곳 · ${list.join(' · ')} — 적은 값은 그대로, 계산만 보정`;
    }

    function ndtDispStationTransferErrorMessage(reason) {
        return ({
            'no-points': '측정 지점이 없습니다.',
            'bad-overlap': '지점을 확인하세요.',
            'bad-levels': '이전값(Va)·이후값(Vb)을 숫자로 입력하세요.'
        })[reason] || '보정에 실패했습니다.';
    }

    function refreshNdtDispAfterTransferChange(group, opts) {
        touchNdtDispGroup(group);
        saveStateToLocalStorage();
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        if (opts.refreshEditList !== false && document.getElementById('ndtDispEditPointList')) {
            renderNdtDispGroupPointList(group);
        }
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
    }

    function runNdtDispStationTransferApply(group, overlapIndex, va, vb, options) {
        const opts = options || {};
        const result = applyNdtDispStationTransfer(group, overlapIndex, va, vb);
        if (!result.ok) {
            window.showToast(ndtDispStationTransferErrorMessage(result.reason), 'warning', 3000);
            return result;
        }
        refreshNdtDispAfterTransferChange(group, opts);
        if (opts.syncPointModal) ensureNdtDispPointModalTransferUi(group, group.points[overlapIndex]);
        window.showToast(
            `${formatNdtDisplacementPointLabel(overlapIndex + 1)} 이동 보정 저장 · Δ=${result.delta.toFixed(3)} · 적은 값은 그대로, 이후 번호 계산에 반영`,
            'success',
            4200
        );
        return result;
    }

    function runNdtDispStationTransferClear(group, idx, options) {
        const opts = options || {};
        if (!clearNdtDispStationTransfer(group, idx)) {
            window.showToast('지울 보정이 없습니다.', 'info', 2200);
            return false;
        }
        refreshNdtDispAfterTransferChange(group, opts);
        if (opts.syncPointModal) ensureNdtDispPointModalTransferUi(group, group.points[idx]);
        window.showToast(`${formatNdtDisplacementPointLabel(idx + 1)} 이동 보정을 지웠습니다.`, 'success', 2600);
        return true;
    }

    function ndtDispTransferFormHtml(lab, x, cls) {
        const va = x ? x.va : '';
        const vb = x ? x.vb : '';
        return `
                <p class="ndt-disp-xfer-help">
                    이 지점에서 이전 측기 값(Va)과 이후 측기 값(Vb)을 적으면 ${lab} 뒤 번호는 계산할 때만 Δ=Vb−Va 만큼 맞춰집니다.
                    적은 레벨은 바뀌지 않고, 나중에 적는 값도 자동 반영됩니다.
                </p>
                <div class="ndt-disp-xfer-grid">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.75rem;">이전 측기 (Va)</label>
                        <input type="number" class="form-control ${cls}-va" step="0.1" inputmode="decimal" value="${va}" placeholder="이전">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label" style="font-size:0.75rem;">이후 측기 (Vb)</label>
                        <input type="number" class="form-control ${cls}-vb" step="0.1" inputmode="decimal" value="${vb}" placeholder="이후">
                    </div>
                </div>
                <button type="button" class="btn btn-primary ndt-disp-xfer-apply ${cls}-apply"><i class="fa-solid fa-calculator"></i> ${x ? '보정 고치기' : '보정 저장'}</button>
                ${x ? `<button type="button" class="btn btn-outline ndt-disp-xfer-apply ${cls}-clear" style="margin-top:0.35rem;"><i class="fa-solid fa-eraser"></i> 보정 지우기</button>` : ''}`;
    }

    /** 개별 지점 마킹 모달: 「이동 보정」 버튼 + Va/Vb 입력 */
    function ensureNdtDispPointModalTransferUi(group, point) {
        const levelEl = document.getElementById('ndtDispLevel');
        if (!levelEl) return;
        let wrap = document.getElementById('ndtDispPointStationTransfer');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.id = 'ndtDispPointStationTransfer';
            wrap.className = 'ndt-disp-xfer-box';
            const anchor = levelEl.closest('.form-group') || levelEl.parentElement;
            if (anchor && anchor.parentElement) {
                anchor.parentElement.insertBefore(wrap, anchor.nextSibling);
            } else if (levelEl.parentElement) {
                levelEl.parentElement.appendChild(wrap);
            }
        }
        const idx = group && point ? group.points.indexOf(point) : -1;
        if (idx < 0) {
            wrap.style.display = 'none';
            wrap.innerHTML = '';
            return;
        }
        wrap.style.display = '';
        const lab = formatNdtDisplacementPointLabel(idx + 1);
        const x = ndtDispTransferApi().xferOf(point);
        const open = wrap.dataset.open === '1';
        const calcText = formatNdtDispLevelText(group, idx);
        wrap.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.4rem;flex-wrap:wrap;">
                <span class="ndt-disp-xfer-title"><i class="fa-solid fa-arrows-left-right"></i> ${lab} 측기 이동${x ? ' · 보정 있음' : ''}</span>
                <button type="button" class="btn btn-outline ndt-disp-xfer-toggle" id="btnToggleNdtDispPointTransfer">
                    ${open ? '닫기' : '이동 보정'}
                </button>
            </div>
            ${calcText.includes('→') || calcText.includes('보정') ? `<div class="ndt-disp-xfer-help" style="margin-top:0.3rem;">계산값: ${calcText}</div>` : ''}
            <div id="ndtDispPointTransferBody" style="display:${open ? 'block' : 'none'};margin-top:0.55rem;">
                ${ndtDispTransferFormHtml(lab, x, 'ndt-disp-pt-xfer')}
            </div>`;
        const btnToggle = document.getElementById('btnToggleNdtDispPointTransfer');
        if (btnToggle) {
            btnToggle.onclick = (e) => {
                e.preventDefault();
                wrap.dataset.open = wrap.dataset.open === '1' ? '0' : '1';
                ensureNdtDispPointModalTransferUi(group, point);
                if (wrap.dataset.open === '1') revealNdtDispTransferApply(wrap.querySelector('.ndt-disp-pt-xfer-apply'));
            };
        }
        const vaInput = wrap.querySelector('.ndt-disp-pt-xfer-va');
        const vbInput = wrap.querySelector('.ndt-disp-pt-xfer-vb');
        if (vaInput) vaInput.id = 'ndtDispPointTransferVa';
        if (vbInput) vbInput.id = 'ndtDispPointTransferVb';
        const btnApply = wrap.querySelector('.ndt-disp-pt-xfer-apply');
        if (btnApply) {
            btnApply.id = 'btnApplyNdtDispPointTransfer';
            btnApply.onclick = (e) => {
                e.preventDefault();
                const va = wrap.querySelector('.ndt-disp-pt-xfer-va')?.value;
                const vb = wrap.querySelector('.ndt-disp-pt-xfer-vb')?.value;
                runNdtDispStationTransferApply(group, idx, va, vb, { syncPointModal: true, refreshEditList: true });
            };
        }
        const btnClear = wrap.querySelector('.ndt-disp-pt-xfer-clear');
        if (btnClear) {
            btnClear.onclick = (e) => {
                e.preventDefault();
                runNdtDispStationTransferClear(group, idx, { syncPointModal: true, refreshEditList: true });
            };
        }
    }

    /**
     * 구역 편집 목록 칸에 적어 둔(아직 「저장」 안 누른) 레벨을 지점에 넣는다.
     * 2026-10-12: 목록에 레벨을 다 적고 바로 「이동 보정 → 적용」을 누르면 보정이 저장된 값(빈 값)으로만 계산되고,
     * 목록을 다시 그리면서 적어 둔 값까지 지워졌다. 보정 전에 먼저 옮긴다. 형식이 틀린 칸은 건드리지 않는다.
     */
    function syncNdtDispEditListInputsToGroup(group) {
        if (!group || !Array.isArray(group.points)) return 0;
        let changed = 0;
        document.querySelectorAll('#ndtDispEditPointList .ndt-disp-edit-level-input').forEach((inp) => {
            const pt = group.points.find((p) => p.id === inp.dataset.pointId);
            if (!pt) return;
            const raw = inp.value;
            const next = (raw === '' || raw == null) ? null : parseFloat(raw);
            if (next != null && isNaN(next)) return;
            const cur = isNdtDispLevelFilled(pt.level) ? Number(pt.level) : null;
            if (cur === next) return;
            pt.level = next;
            changed += 1;
        });
        return changed;
    }

    /** 이동 보정 「적용」 버튼이 창 스크롤 안에서 보이게 */
    function revealNdtDispTransferApply(btn) {
        // 창 안 스크롤만 조금 내린다(페이지·창 자체는 안 움직임). 이미 보이면 그대로.
        if (!btn) return;
        requestAnimationFrame(() => {
            const host = btn.closest('.modal-body, .defect-drawer-body');
            if (!host) return;
            const hr = host.getBoundingClientRect();
            const br = btn.getBoundingClientRect();
            if (br.bottom > hr.bottom - 8) host.scrollTop += Math.ceil(br.bottom - hr.bottom + 12);
        });
    }

    /** 구역 편집 목록 행: 인라인 Va/Vb 「이동 보정」 */
    function toggleNdtDispEditRowTransferForm(group, pointId) {
        const row = document.querySelector(`#ndtDispEditPointList .ndt-disp-edit-point-row[data-point-id="${pointId}"]`);
        if (!row) return;
        let form = row.nextElementSibling;
        if (form && form.classList && form.classList.contains('ndt-disp-row-transfer-form')) {
            form.remove();
            return;
        }
        document.querySelectorAll('#ndtDispEditPointList .ndt-disp-row-transfer-form').forEach((el) => el.remove());
        const idx = (group.points || []).findIndex((p) => p.id === pointId);
        if (idx < 0) return;
        const pt = group.points[idx];
        const lab = formatNdtDisplacementPointLabel(idx + 1);
        const x = ndtDispTransferApi().xferOf(pt);
        form = document.createElement('div');
        form.className = 'ndt-disp-row-transfer-form ndt-disp-xfer-box';
        form.dataset.pointId = pointId;
        form.innerHTML = `<div class="ndt-disp-xfer-title" style="margin-bottom:0.35rem;"><b>${lab}</b> 측기 이동 보정</div>`
            + ndtDispTransferFormHtml(lab, x, 'ndt-disp-row');
        row.after(form);
        revealNdtDispTransferApply(form.querySelector('.ndt-disp-row-apply'));
        form.querySelector('.ndt-disp-row-apply').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const va = form.querySelector('.ndt-disp-row-va')?.value;
            const vb = form.querySelector('.ndt-disp-row-vb')?.value;
            syncNdtDispEditListInputsToGroup(group);
            runNdtDispStationTransferApply(group, idx, va, vb, { refreshEditList: true });
        };
        const clr = form.querySelector('.ndt-disp-row-clear');
        if (clr) {
            clr.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                syncNdtDispEditListInputsToGroup(group);
                runNdtDispStationTransferClear(group, idx, { refreshEditList: true });
            };
        }
    }

    /** 레벨 단위 선택 안내문·입력칸 placeholder를 선택한 단위에 맞춘다(저장된 숫자는 건드리지 않음) */
    function refreshNdtDispEditLevelUnitUi(group) {
        const sel = document.getElementById('ndtDispEditLevelUnit');
        const unit = (sel && sel.value === 'mm') ? 'mm' : 'cm';
        const hint = document.getElementById('ndtDispEditLevelUnitHint');
        if (hint) {
            const legacy = group && group.levelUnit !== 'mm' && group.levelUnit !== 'cm';
            hint.textContent = (unit === 'mm'
                ? '레벨을 mm로 읽습니다. 예) 35 → 35mm.'
                : '레벨을 cm로 읽습니다. 예) 3.5 → 35mm.')
                + ' 단위를 바꿔도 적은 숫자는 그대로이고 읽는 단위만 바뀝니다.'
                + (legacy ? ' (예전에 만든 구역이라 cm로 계산 중입니다. 현장에서 mm로 적었다면 mm로 바꾸세요.)' : '');
        }
        document.querySelectorAll('#ndtDispEditPointList .ndt-disp-edit-level-input').forEach((inp) => {
            inp.placeholder = `레벨(${unit})`;
        });
    }

    function openNdtDisplacementGroupEditModal(group) {
        if (ndtDispTransferApi() && ndtDispTransferApi().migrateLegacyGroup(group)) {
            touchNdtDispGroup(group);
            saveStateToLocalStorage();
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(`${state.currentBuildingId}_${state.currentFloor}`);
        }
        document.getElementById('ndtDispEditGroupId').value = group.id;
        document.getElementById('ndtDispGroupEditTitle').textContent = `${group.groupNo} 측정 구역 정보`;
        document.getElementById('ndtDispEditLocationType').value = group.locationType || '보';
        const lenEl = document.getElementById('ndtDispEditMeasureLength');
        if (lenEl) lenEl.value = (group.measureLength != null && group.measureLength !== '') ? group.measureLength : '';
        const colorEl = document.getElementById('ndtDispEditColor');
        if (colorEl) colorEl.value = group.color || getStyleColor(group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement');
        const damageRow = document.getElementById('ndtDispEditMinorDamageRow');
        const damageEl = document.getElementById('ndtDispEditHasMinorDamage');
        const isMemberDisp = group.category === '부재변위';
        if (damageRow) damageRow.style.display = isMemberDisp ? '' : 'none';
        if (damageEl) damageEl.checked = !!group.hasMinorDamage;
        const unitSel = document.getElementById('ndtDispEditLevelUnit');
        if (unitSel) unitSel.value = ndtDispLevelUnit(group);
        refreshNdtDispEditLevelUnitUi(group);
        const hintEl = document.getElementById('ndtDispEditPointListHint');
        if (hintEl) {
            hintEl.textContent = '마킹한 지점 레벨을 입력·수정하세요. 측기 이동 시 해당 지점의 「이동 보정」에서 이전값·이후값만 넣으면 됩니다.';
        }
        renderNdtDispGroupPointList(group);
        ensureNdtDispStationTransferUi(group);
        bindNdtDispGroupPhotoInputs();
        renderNdtDispGroupPhotoList(group.id);
        refreshNdtDispLocationChips('ndtDispEditLocationType', 'ndtDispEditLocationChips');
        const modal = document.getElementById('ndtDisplacementGroupEditModal');
        document.body.classList.add('ndt-modal-open');
        modal.style.display = 'flex';
        modal.classList.add('open');
        syncNdtDrawerToCanvasArea('ndtDisplacementGroupEditModal');
        requestAnimationFrame(() => {
            syncNdtDrawerToCanvasArea('ndtDisplacementGroupEditModal');
            const firstEmpty = modal.querySelector('.ndt-disp-edit-level-input:not([value]), .ndt-disp-edit-level-input[value=""]')
                || modal.querySelector('.ndt-disp-edit-level-input');
            if (firstEmpty) firstEmpty.focus();
        });
    }

    function closeNdtDisplacementGroupEditModal() {
        const modal = document.getElementById('ndtDisplacementGroupEditModal');
        if (modal) {
            modal.classList.remove('open');
            window.setTimeout(() => {
                if (modal && !modal.classList.contains('open')) {
                    modal.style.display = 'none';
                    syncNdtDrawerToCanvasArea('ndtDisplacementGroupEditModal');
                }
            }, 280);
        }
        if (!isNdtModalOpen() && !isNdtDisplacementModalOpen()) {
            document.body.classList.remove('ndt-modal-open');
        }
    }
    window.closeNdtDisplacementGroupEditModal = closeNdtDisplacementGroupEditModal;
    window.isNdtDisplacementGroupEditOpen = isNdtDisplacementGroupEditOpen;

    function renderNdtDispGroupPointList(group) {
        const container = document.getElementById('ndtDispEditPointList');
        if (!container) return;
        const isMemberDisp = group.category === '부재변위';
        // 이전 복잡한 패널·인라인 폼 정리
        removeNdtDispStationTransferPanel();
        document.querySelectorAll('#ndtDispEditPointList .ndt-disp-row-transfer-form').forEach((el) => el.remove());
        if (!group.points || group.points.length === 0) {
            container.innerHTML = '<div style="color:#a3a3a3; font-size:0.85rem; padding:0.5rem;">측정 지점이 없습니다. MARK 모드로 도면을 클릭해 지점을 추가하세요.</div>';
            ensureNdtDispStationTransferUi(group);
            return;
        }
        container.innerHTML = group.points.map((p, idx) => {
            const role = isMemberDisp
                ? (idx === 0 ? ' 단부1' : (idx === group.points.length - 1 ? ' 단부2' : ' 중앙'))
                : '';
            const val = isNdtDispLevelFilled(p.level) ? p.level : '';
            const hasX = !!(ndtDispTransferApi() && ndtDispTransferApi().xferOf(p));
            const calcText = formatNdtDispLevelText(group, idx);
            const calcHint = (calcText.includes('→') || calcText.startsWith('(보정'))
                ? `<span class="ndt-disp-calc-hint" style="font-size:0.68rem;color:#b45309;white-space:nowrap;">계산 ${calcText.split('→').pop().replace(/[()보정]/g, '').trim()}</span>` : '';
            return `
            <div class="option-manager-item ndt-disp-edit-point-row" data-point-id="${p.id}">
                <span class="ndt-disp-edit-point-label">${formatNdtDisplacementPointLabel(idx + 1)}${role}</span>
                <input type="number" class="form-control ndt-disp-edit-level-input" data-point-id="${p.id}"
                    step="0.1" placeholder="레벨(${ndtDispLevelUnit(group)})" value="${val}" inputmode="decimal" aria-label="${formatNdtDisplacementPointLabel(idx + 1)} 레벨(${ndtDispLevelUnit(group)})">
                ${calcHint}
                <button type="button" class="btn ${hasX ? 'btn-primary' : 'btn-outline'} ndt-disp-mark-station-btn" title="이 지점에서 측기 이동 보정(이전값·이후값)"
                    data-group-id="${group.id}" data-point-id="${p.id}" style="font-size:0.7rem;padding:0.2rem 0.35rem;">이동 보정</button>
                <button type="button" class="option-manager-item-delete" title="지점 삭제"
                    onclick="window.deleteNdtDisplacementPoint('${group.id}','${p.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>`;
        }).join('');
        container.querySelectorAll('.ndt-disp-mark-station-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const g = getNdtDispGroupById(btn.dataset.groupId);
                if (!g) return;
                toggleNdtDispEditRowTransferForm(g, btn.dataset.pointId);
            });
        });
        ensureNdtDispStationTransferUi(group);
    }

    window.deleteNdtDisplacementPoint = async function(groupId, pointId, options) {
        if (!options?.skipConfirm && !await window.confirmDelete('해당 측정 지점을 삭제하시겠습니까?')) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const groups = state.ndtDisplacementGroups[key] || [];
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        group.points = group.points.filter(p => p.id !== pointId);
        if (group.points.length === 0) {
            state.ndtDisplacementGroups[key] = groups.filter(g => g.id !== groupId);
            // 마지막 지점을 지워 구역까지 사라지는 경우도 묘비가 필요하다
            trackNdtDeletion(key, groupId, group);
            releaseStrengthPhotosOfItems(state.currentBuildingId, [group], { keepLocal: true, deferCloudFloorKey: key });
            closeNdtDisplacementGroupEditModal();
        } else {
            group.updatedAt = Date.now();
            setActiveNdtDispGroup(group);
            renderNdtDispGroupPointList(group);
        }
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        saveStateToLocalStorage();
        drawNdtCanvas();
        renderNdtSummaryTable();
    };

    window.deleteNdtDisplacementGroup = async function(groupId, options) {
        if (!options?.skipConfirm && !await window.confirmDelete('해당 측정 구역과 포함된 모든 지점을 삭제하시겠습니까?')) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const removedGroups = (state.ndtDisplacementGroups[key] || []).filter(g => g.id === groupId);
        state.ndtDisplacementGroups[key] = (state.ndtDisplacementGroups[key] || []).filter(g => g.id !== groupId);
        // 묘비를 남기지 않으면 병합 때 서버에 남아있던 구역이 그대로 되살아난다
        trackNdtDeletion(key, groupId, removedGroups[0]);
        // 구역 현장 사진 클라우드 정리 — 되돌리기 대비로 이 기기 사본은 남긴다
        releaseStrengthPhotosOfItems(state.currentBuildingId, removedGroups, { keepLocal: true, deferCloudFloorKey: key });
        if (window._activeNdtDispGroupId === groupId) setActiveNdtDispGroup(null);
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        saveStateToLocalStorage();
        drawNdtCanvas();
        renderNdtSummaryTable();
        closeNdtDisplacementGroupEditModal();
    };

    function setupNdtDisplacementModalEvents() {
        const btnSave = document.getElementById('btnSaveNdtDisp');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                const saved = commitNdtDisplacement();
                if (!saved) return;
                setActiveNdtDispGroup(saved.group);
                closeNdtDisplacementModal();
                drawNdtCanvas();
                renderNdtSummaryTable();
            });
        }

        const levelInput = document.getElementById('ndtDispLevel');
        if (levelInput) {
            levelInput.addEventListener('input', () => {
                window.clearTimeout(window._ndtDispLevelSaveTimer);
                window._ndtDispLevelSaveTimer = window.setTimeout(saveNdtDispLevelNow, 300);
            });
            // PC: Enter = 다음 지점, 마지막 지점이면 닫기
            levelInput.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' || !document.getElementById('ndtDispPointId')?.value) return;
                e.preventDefault();
                if (!goToNextNdtDispPoint()) closeNdtDisplacementModal();
            });
            // 키패드 「다음」: 창 안에 다음 숫자 칸이 없으면 다음 지점으로
            levelInput.addEventListener('bsa-mkp-no-next', (e) => {
                if (goToNextNdtDispPoint()) e.preventDefault();
            });
        }
        const btnNextPoint = document.getElementById('btnNextNdtDispPoint');
        if (btnNextPoint) btnNextPoint.addEventListener('click', () => goToNextNdtDispPoint());

        const btnAddAnother = document.getElementById('btnAddAnotherNdtPoint');
        if (btnAddAnother) {
            btnAddAnother.addEventListener('click', () => {
                const saved = commitNdtDisplacement();
                if (!saved) return;
                setActiveNdtDispGroup(saved.group);
                closeNdtDisplacementModal();
                drawNdtCanvas();
                renderNdtSummaryTable();
                window.showToast(`${saved.group.groupNo} 구역에 이어서 측정합니다. 도면에서 다음 지점을 클릭하세요.`, 'info', 3500);
            });
        }

        const btnNewZone = document.getElementById('btnStartNewNdtDispZone');
        if (btnNewZone) {
            btnNewZone.addEventListener('click', () => {
                setActiveNdtDispGroup(null);
                closeNdtDisplacementModal();
                window.showToast('새 구역 마킹 모드 · 도면을 클릭하면 새 NO. 구역이 시작됩니다', 'info', 3200);
            });
        }

        const btnDeletePoint = document.getElementById('btnDeleteNdtDispPoint');
        if (btnDeletePoint) {
            btnDeletePoint.addEventListener('click', () => {
                const pointId = document.getElementById('ndtDispPointId').value;
                if (!pointId) return;
                const key = `${state.currentBuildingId}_${state.currentFloor}`;
                const groups = state.ndtDisplacementGroups[key] || [];
                const group = groups.find(g => g.points.some(p => p.id === pointId));
                if (!group) return;
                window.deleteNdtDisplacementPoint(group.id, pointId);
                closeNdtDisplacementModal();
            });
        }

        const btnCancel = document.getElementById('btnCancelNdtDisp');
        if (btnCancel) btnCancel.addEventListener('click', closeNdtDisplacementModal);
        const btnClose = document.getElementById('btnCloseNdtDisplacementModal');
        if (btnClose) btnClose.addEventListener('click', closeNdtDisplacementModal);

        const unitSelEdit = document.getElementById('ndtDispEditLevelUnit');
        if (unitSelEdit) {
            unitSelEdit.addEventListener('change', () => {
                const gid = document.getElementById('ndtDispEditGroupId').value;
                const g = (state.ndtDisplacementGroups[`${state.currentBuildingId}_${state.currentFloor}`] || []).find(x => x.id === gid);
                refreshNdtDispEditLevelUnitUi(g);
            });
        }

        const btnSaveGroupEdit = document.getElementById('btnSaveNdtDispGroupEdit');
        if (btnSaveGroupEdit) {
            btnSaveGroupEdit.addEventListener('click', () => {
                const groupId = document.getElementById('ndtDispEditGroupId').value;
                const key = `${state.currentBuildingId}_${state.currentFloor}`;
                const group = (state.ndtDisplacementGroups[key] || []).find(g => g.id === groupId);
                if (!group) return;
                const len = parseFloat(document.getElementById('ndtDispEditMeasureLength').value);
                if (!len || len <= 0) {
                    window.showToast('측정길이를 입력해 주세요.', 'warning');
                    return;
                }
                const levelInputs = document.querySelectorAll('#ndtDispEditPointList .ndt-disp-edit-level-input');
                let badLevel = false;
                levelInputs.forEach((inp) => {
                    const pt = group.points.find((p) => p.id === inp.dataset.pointId);
                    if (!pt) return;
                    const raw = inp.value;
                    if (raw === '' || raw == null) {
                        pt.level = null;
                        return;
                    }
                    const v = parseFloat(raw);
                    if (isNaN(v)) {
                        badLevel = true;
                        return;
                    }
                    pt.level = v;
                });
                if (badLevel) {
                    window.showToast('레벨값 형식을 확인해 주세요.', 'warning');
                    return;
                }
                group.locationType = document.getElementById('ndtDispEditLocationType').value || '보';
                group.measureLength = len;
                const unitSelSave = document.getElementById('ndtDispEditLevelUnit');
                if (unitSelSave) group.levelUnit = unitSelSave.value === 'mm' ? 'mm' : 'cm';
                const colorVal = document.getElementById('ndtDispEditColor')?.value;
                if (colorVal) group.color = colorVal;
                if (group.category === '부재변위') {
                    group.hasMinorDamage = !!document.getElementById('ndtDispEditHasMinorDamage')?.checked;
                }
                touchNdtDispGroup(group);
                setActiveNdtDispGroup(group);
                saveStateToLocalStorage();
                drawNdtCanvas();
                renderNdtSummaryTable();
                closeNdtDisplacementGroupEditModal();
                const missing = !ndtDispGroupLevelsComplete(group);
                window.showToast(
                    missing
                        ? `${group.groupNo} 저장 · 미입력 레벨이 있습니다. 마킹을 이어가거나 다시 수정하세요`
                        : `${group.groupNo} 구역 저장 · 마킹하면 지점 번호가 이어집니다`,
                    missing ? 'warning' : 'success',
                    3200
                );
            });
        }

        const btnNewZoneFromEdit = document.getElementById('btnNdtDispStartNewZoneFromEdit');
        if (btnNewZoneFromEdit) {
            btnNewZoneFromEdit.addEventListener('click', () => {
                setActiveNdtDispGroup(null);
                closeNdtDisplacementGroupEditModal();
                window.showToast('새 구역 마킹 모드 · 도면을 클릭하면 새 NO. 구역이 시작됩니다', 'info', 3200);
            });
        }

        const btnDeleteGroup = document.getElementById('btnDeleteNdtDispGroup');
        if (btnDeleteGroup) {
            btnDeleteGroup.addEventListener('click', () => {
                const groupId = document.getElementById('ndtDispEditGroupId').value;
                window.deleteNdtDisplacementGroup(groupId);
            });
        }

        const btnCloseGroupEdit1 = document.getElementById('btnCloseNdtDispGroupEditModal');
        if (btnCloseGroupEdit1) btnCloseGroupEdit1.addEventListener('click', closeNdtDisplacementGroupEditModal);
        const btnCloseGroupEdit2 = document.getElementById('btnCloseNdtDispGroupEdit');
        if (btnCloseGroupEdit2) btnCloseGroupEdit2.addEventListener('click', closeNdtDisplacementGroupEditModal);

        const btnCloseChart1 = document.getElementById('btnCloseNdtDispChartModal');
        if (btnCloseChart1) btnCloseChart1.addEventListener('click', closeNdtDisplacementChartModal);
        const btnCloseChart2 = document.getElementById('btnCloseNdtDispChart2');
        if (btnCloseChart2) btnCloseChart2.addEventListener('click', closeNdtDisplacementChartModal);
    }

    function closeNdtDisplacementChartModal() {
        const modal = document.getElementById('ndtDisplacementChartModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

    function getCurrentFloorDefects() {
        if (!state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        return state.defects[key] || [];
    }

    /** 마킹 추가 취소·모드 이탈 시: 템플릿 해제 + 싱글톤 그룹의 불필요 -1 정리 */
    function shouldAddSurveyRowWithMarking() {
        return !!(window._markingAddAlsoSurveyRow || window._pendingMarkingGroup?.addAlsoSurveyRow);
    }

    function clearDefectMarkingTemplate(options) {
        const hadTemplate = !!window._defectMarkingTemplate;
        window._defectMarkingTemplate = null;
        if (!(options && options.keepSurveyRowFlag) && !shouldAddSurveyRowWithMarking()) {
            window._markingAddAlsoSurveyRow = false;
        }
        if (options && options.keepGroup) return;
        if (!hadTemplate && !(options && options.forceCollapse)) return;
        // 다음 위치 커밋 전에는 원본이 아직 멤버 1개라서, 여기서 접으면 groupId가 날아간다
        if (window._pendingMarkingGroup) return;
        if (!state.currentBuildingId || !state.currentFloor) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects[key]) return;
        collapseSingletonDefectGroups(state.defects[key]);
    }

    function snapshotMarkingGroupForCommit(tmpl, options) {
        if (!tmpl || !tmpl.groupId) {
            return window._pendingMarkingGroup || null;
        }
        const addAlsoSurveyRow = !!(options?.addAlsoSurveyRow ?? tmpl.addAlsoSurveyRow ?? window._markingAddAlsoSurveyRow);
        window._pendingMarkingGroup = {
            groupId: tmpl.groupId,
            groupNo: tmpl.groupNo,
            boxX: tmpl.boxX,
            boxY: tmpl.boxY,
            addAlsoSurveyRow
        };
        if (addAlsoSurveyRow) window._markingAddAlsoSurveyRow = true;
        return window._pendingMarkingGroup;
    }

    function getActiveMarkingGroup() {
        return window._pendingMarkingGroup || window._defectMarkingTemplate || null;
    }

    function applyMarkingGroupToNewDefect(newDefect) {
        const grp = getActiveMarkingGroup();
        if (!grp || !grp.groupId || !newDefect) return false;
        newDefect.groupId = grp.groupId;
        newDefect.groupNo = stripDefectNoSuffix(grp.groupNo || newDefect.no || '');
        newDefect.no = newDefect.groupNo;
        if (Number.isFinite(grp.boxX)) newDefect.x = grp.boxX;
        if (Number.isFinite(grp.boxY)) newDefect.y = grp.boxY;
        return true;
    }

    /**
     * 방금 새로 찍은(저장된) 마킹을 바로 선택 상태로 — 강조 표시·좌상단 팝업·「한 번 더 누르면 수정」 상태.
     * 터치로 마킹을 두 번 눌렀을 때와 같은 상태가 되도록, 만들자마자 선택해 둔다. (2026-10-27)
     * keepAfterModalClose: 새 마킹 수정창을 닫아도 선택을 유지(끌어서 위치 잡기 바로 가능)
     */
    function selectNewlyCreatedMarking(d, opts) {
        if (!d || !d.id) return;
        if (d.groupId) window._groupBoxCycle = { groupId: d.groupId, lastId: d.id };
        selectedDefectIds = new Set([d.id]);
        window._bsaNewMarkingKeepSelId = (opts && opts.keepAfterModalClose) ? d.id : null;
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
    }

    /** 수정창을 닫을 때 선택 정리: 방금 새로 만든 마킹은 선택 유지, 그 밖은 기존처럼 선택 해제 */
    function applySelectionAfterDefectModalClose(discardPending) {
        const keepId = window._bsaNewMarkingKeepSelId || null;
        window._bsaNewMarkingKeepSelId = null;
        let keep = null;
        if (keepId && !discardPending && state.currentBuildingId) {
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            keep = (state.defects[key] || []).find((d) => d && d.id === keepId) || null;
        }
        if (keep) {
            selectedDefectIds = new Set([keep.id]);
        } else if (typeof selectedDefectIds !== 'undefined' && selectedDefectIds && typeof selectedDefectIds.clear === 'function') {
            selectedDefectIds.clear();
        }
    }

    function finishMarkingGroupCommit() {
        window._pendingMarkingGroup = null;
        clearDefectMarkingTemplate({ keepGroup: true });
    }

    function getMarkingGroupRepresentative(groupId) {
        if (!groupId || !state.currentBuildingId) return null;
        const members = getDefectMarkingGroupMembers(groupId);
        if (members.length) return pickDefectGroupRepresentative(members) || members[0];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        return (state.defects[key] || []).find((d) => d && d.id === groupId) || null;
    }

    /** 위치 추가(마킹 추가) 체인: 모달 없이 같은 NO.박스·groupId로 화살표/영역만 추가 */
    function commitAdditionalMarkingAtTarget(boxX, boxY, targetX, targetY, areaRect) {
        const grp = getActiveMarkingGroup();
        if (!grp || !grp.groupId || !state.currentBuildingId) return null;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects[key]) state.defects[key] = [];
        const rep = getMarkingGroupRepresentative(grp.groupId);
        const tmpl = window._defectMarkingTemplate || {};
        const src = rep || tmpl;
        const groupNo = stripDefectNoSuffix(grp.groupNo || src.groupNo || src.no || formatDefectNoSeq(1));
        const sharedBoxX = Number.isFinite(grp.boxX) ? grp.boxX : boxX;
        const sharedBoxY = Number.isFinite(grp.boxY) ? grp.boxY : boxY;
        const tgtX = targetX !== undefined ? targetX : (sharedBoxX - 35);
        const tgtY = targetY !== undefined ? targetY : (sharedBoxY + 35);

        pushDefectHistory();
        const newDefect = {
            id: generateDefectUniqueId(key),
            no: groupNo,
            groupId: grp.groupId,
            groupNo,
            category: inheritDefectCategory(src),
            component: src.component || '',
            location: src.location || composeDefectLocation(''),
            defectType: src.defectType || '',
            cause: src.cause || '',
            size: src.size || '',
            crackWidth: src.crackWidth || '',
            crackLength: src.crackLength || '',
            crackMeasures: Array.isArray(src.crackMeasures)
                ? JSON.parse(JSON.stringify(src.crackMeasures))
                : [],
            itemCount: src.itemCount || '',
            isProgress: !!src.isProgress,
            isLeak: !!src.isLeak,
            isOpeningCrack: !!src.isOpeningCrack,
            isCarriedOver: !!src.isCarriedOver,
            isBookmark: !!src.isBookmark,
            isPriorityManage: !!src.isPriorityManage,
            forceArrowDir: false,
            arrowOctant: 0,
            surveyRound: src.surveyRound || getCurrentSurveyRoundKey(),
            mapMarkedAt: Date.now(),
            mapUnregistered: false,
            surveyNumbered: false,
            updatedAt: Date.now(),
            photos: [],
            prevRoundPhotos: [],
            inspectorName: src.inspectorName || window.state.userName || '',
            x: sharedBoxX,
            y: sharedBoxY,
            targetX: tgtX,
            targetY: tgtY
        };
        touchDefectPositionUpdatedAt(newDefect);

        if (areaRect) {
            const ax1 = Math.min(areaRect.x1, areaRect.x2);
            const ay1 = Math.min(areaRect.y1, areaRect.y2);
            const ax2 = Math.max(areaRect.x1, areaRect.x2);
            const ay2 = Math.max(areaRect.y1, areaRect.y2);
            newDefect.shapeType = 'area';
            newDefect.areaX1 = ax1;
            newDefect.areaY1 = ay1;
            newDefect.areaX2 = ax2;
            newDefect.areaY2 = ay2;
            newDefect.areaShape = normalizeAreaShape(areaRect.areaShape || 'rect');
            newDefect.areaAngle = Number(areaRect.areaAngle) || 0;
            if (Array.isArray(areaRect.areaPoints)) {
                newDefect.areaPoints = areaRect.areaPoints.map((p) => ({ x: p.x, y: p.y }));
            }
            newDefect.areaDrawings = [];
            newDefect.areaFillStyle = src.areaFillStyle || getAreaFillStyle(src);
            newDefect.areaBorderStyle = src.areaBorderStyle || getAreaBorderStyle(src);
            const attach = getAreaCenterBorderAttachDefect(sharedBoxX, sharedBoxY, newDefect);
            newDefect.targetX = attach.x;
            newDefect.targetY = attach.y;
        }

        state.defects[key].push(newDefect);
        normalizeDefectGroupNos(state.defects[key], grp.groupId);

        let surveyExtra = null;
        if (shouldAddSurveyRowWithMarking()) {
            surveyExtra = cloneDefectForSurveyTableRow(newDefect);
            window._markingAddAlsoSurveyRow = false;
            if (window._pendingMarkingGroup) window._pendingMarkingGroup.addAlsoSurveyRow = false;
        }

        finishMarkingGroupCommit();
        saveStateToLocalStorage();
        selectNewlyCreatedMarking(newDefect);
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        const label = String(groupNo).replace(/^NO\.?\s*/i, '').trim();
        const arrowIdx = getDefectMarkingGroupMembers(grp.groupId).findIndex((m) => m.id === newDefect.id);
        const arrowNum = arrowIdx >= 0 ? arrowIdx + 1 : null;
        if (surveyExtra) {
            const rowNo = String(surveyExtra.no || '').replace(/^NO\.?\s*/i, '').trim();
            window.showToast?.(
                `화살표 ${arrowNum != null ? arrowNum : ''} 추가 · 결함표 ${rowNo} 행 생성 (도면 ${label})`,
                'success',
                3200
            );
        } else {
            window.showToast?.(
                `같은 번호(${label})에 화살표${arrowNum != null ? ' ' + arrowNum : ''}를 추가했습니다. 조사표 번호는 「번호 부여」로 따로 줍니다.`,
                'success',
                2800
            );
        }
        return newDefect;
    }

    // 현재 선택된 조사 회차(연도_기간) 키 — 결함 등록 시점의 회차를 기록하는 데 사용
    function getCurrentSurveyRoundKey() {
        const year = document.getElementById('selectInspectionYear')?.value
            || (state.currentBuilding && state.currentBuilding.inspectionYear) || '2026년';
        const period = document.getElementById('selectInspectionPeriod')?.value
            || (state.currentBuilding && state.currentBuilding.inspectionPeriod) || '하반기';
        return `${year}_${period}`;
    }

    // 회차 키(예: "2026년_하반기")를 순서 비교 가능한 숫자로 바꾼다. "수시점검"은 연중
    // 아무 때나 진행될 수 있어 상/하반기와 선후 관계를 매길 수 없으므로 순서 비교
    // 대상에서 제외한다(null 반환).
    function getSurveyRoundOrderRank(roundKey) {
        if (!roundKey) return null;
        const [yearPart, periodPart] = roundKey.split('_');
        const year = parseInt(yearPart, 10);
        if (isNaN(year)) return null;
        const periodRank = periodPart === '상반기' ? 0 : (periodPart === '하반기' ? 1 : null);
        if (periodRank === null) return null;
        return year * 10 + periodRank;
    }

    function formatSurveyRoundLabel(roundKey) {
        if (!roundKey) return '회차 미지정';
        const parts = String(roundKey).split('_');
        if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
        return roundKey.replace(/_/g, ' ');
    }

    /** HWPX 비교사진 캡션 — 예: 2025년_하반기 → 25년 하반기 */
    function formatSurveyRoundLabelShort(roundKey) {
        if (!roundKey) return '';
        const parts = String(roundKey).split('_');
        const yearRaw = parts[0] || '';
        const yearNum = parseInt(yearRaw, 10);
        const shortYear = isNaN(yearNum) ? yearRaw.replace(/년\s*$/, '') : String(yearNum % 100);
        const period = parts[1] || '';
        return period ? `${shortYear}년 ${period}` : `${shortYear}년`;
    }

    function getBuildingSurveyRoundKey(bldg) {
        const y = (bldg && bldg.inspectionYear) || '2026년';
        const p = (bldg && bldg.inspectionPeriod) || '하반기';
        return `${y}_${p}`;
    }

    function getPreviousSurveyRoundKey(roundKey) {
        const rank = getSurveyRoundOrderRank(roundKey);
        if (rank === null) return null;
        const periodRank = rank % 10;
        const year = Math.floor(rank / 10);
        if (periodRank === 1) return `${year}년_상반기`;
        return `${year - 1}년_하반기`;
    }

    function getDefectHwpxCompareRoundLabels(defect, bldg) {
        const currKey = getBuildingSurveyRoundKey(bldg);
        let prevKey = defect && defect.prevSurveyRound ? defect.prevSurveyRound : null;
        // 2026-11-06 전차 칸에 이번 회차가 적혀 있으면 틀린 값 — 왼쪽·오른쪽이 같은 회차로 찍혔다(2026년 하반기 / 2026년 하반기)
        if (prevKey && prevKey === currKey) prevKey = null;
        if (!prevKey && defect && getDefectPrevOutputPhotos(defect).length > 0) {
            if (defect.surveyRound && defect.surveyRound !== currKey && isPreviousRoundDefect(defect)) {
                prevKey = defect.surveyRound;
            } else {
                prevKey = getPreviousSurveyRoundKey(currKey);
            }
        }
        return {
            prev: prevKey ? formatSurveyRoundLabelShort(prevKey) : '',
            curr: formatSurveyRoundLabelShort(currKey)
        };
    }

    /** 중점관리 비교표 캡션 — 예: 2025년 하반기 정기안전점검 */
    function formatSurveyRoundLabelHwpxCompare(roundKey) {
        if (!roundKey) return '';
        return `${formatSurveyRoundLabel(roundKey)} 정기안전점검`;
    }

    function getDefectHwpxCompareRoundLabelsFull(defect, bldg) {
        const currKey = getBuildingSurveyRoundKey(bldg);
        let prevKey = defect && defect.prevSurveyRound ? defect.prevSurveyRound : null;
        // 2026-11-06 전차 칸에 이번 회차가 적혀 있으면 틀린 값 — 왼쪽·오른쪽이 같은 회차로 찍혔다(2026년 하반기 / 2026년 하반기)
        if (prevKey && prevKey === currKey) prevKey = null;
        if (!prevKey && defect && getDefectPrevOutputPhotos(defect).length > 0) {
            if (defect.surveyRound && defect.surveyRound !== currKey && isPreviousRoundDefect(defect)) {
                prevKey = defect.surveyRound;
            } else {
                prevKey = getPreviousSurveyRoundKey(currKey);
            }
        }
        return {
            prev: prevKey ? formatSurveyRoundLabelHwpxCompare(prevKey) : '',
            curr: formatSurveyRoundLabelHwpxCompare(currKey)
        };
    }

    function formatDefectMarkingTimestamp(ts) {
        const n = Number(ts);
        if (!n || !Number.isFinite(n)) return '';
        try {
            const d = new Date(n);
            if (Number.isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const day = d.getDate();
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${y}. ${m}. ${day}. ${hh}:${mm}`;
        } catch (_e) {
            return '';
        }
    }

    function getDefectMapMarkedAt(defect) {
        if (!defect) return 0;
        if (defect.mapMarkedAt) return Number(defect.mapMarkedAt) || 0;
        if (!isDefectMapUnregistered(defect)) return getRecordUpdatedAt(defect, 'pin');
        return 0;
    }

    function syncDefectArrowFormFromMember(m) {
        if (!m) return;
        const pinId = document.getElementById('defectPinId')?.value;
        if (pinId !== m.id) return;
        const forceArrowDirEl = document.getElementById('defectForceArrowDir');
        if (forceArrowDirEl) forceArrowDirEl.checked = !!m.forceArrowDir;
        if (typeof setDefectArrowOctant === 'function') setDefectArrowOctant(m.arrowOctant);
        else if (typeof syncDefectArrowDirUi === 'function') syncDefectArrowDirUi();
    }

    function persistMarkingMemberArrowDir(m, forceArrowDir, arrowOctant) {
        if (!m) return;
        m.forceArrowDir = !!forceArrowDir;
        m.arrowOctant = ((parseInt(arrowOctant, 10) || 0) % 8 + 8) % 8;
        touchDefectUpdatedAt(m);
        saveStateToLocalStorage();
        drawCanvas();
        syncDefectArrowFormFromMember(m);
        const pinId = document.getElementById('defectPinId')?.value;
        const current = pinId
            ? (state.defects[`${state.currentBuildingId}_${state.currentFloor}`] || []).find((x) => x.id === pinId)
            : null;
        if (current) renderDefectMarkingMemberFloat(current);
    }

    function getDefectGroupMainNo(d) {
        const p = parseDefectNoParts({ no: (d && (d.groupNo || stripDefectNoSuffix(d.no || ''))) || '' });
        return p.main === Number.MAX_SAFE_INTEGER ? '?' : String(p.main);
    }

    /** 결함 수정 탭: 7-1, 7-2 … (마킹·결함표 통합, 방향은 각 슬롯의 dirMember) */
    function buildDefectMarkingFloatSlots(groupId) {
        if (!groupId) return [];
        const markingMembers = getDefectMarkingGroupMembers(groupId);
        const extras = getDefectGroupMembersOrdered(groupId).filter((m) => m.surveyExtra);
        if (markingMembers.length <= 1 && !extras.length) return [];
        const mainNo = getDefectGroupMainNo(markingMembers[0] || extras[0]);
        const slotCount = extras.length > 0
            ? Math.max(markingMembers.length, extras.length + 1)
            : markingMembers.length;
        const api = arrowSurveyNumberApi();
        const slots = [];
        for (let slot = 1; slot <= slotCount; slot++) {
            let formMember = slot === 1
                ? markingMembers[0]
                : (extras[slot - 2] || markingMembers[slot - 1] || null);
            // 결함 통합으로 생긴 결함표 행은 내용·사진이 원래 마킹(통합 화살표)에 있다 → 그 마킹을 연다
            if (formMember && formMember.surveyExtra && formMember.mergeSourceId) {
                const mApi = defectMergeApi();
                const src = mApi ? mApi.findMergeSource(markingMembers, formMember) : null;
                if (src) formMember = src;
            }
            const dirMember = markingMembers[slot - 1] || null;
            if (!formMember) continue;
            const label = api && typeof api.floatSlotLabel === 'function'
                ? api.floatSlotLabel(mainNo, slot, formMember, extras.length)
                : `${mainNo}-${slot}`;
            slots.push({
                slot,
                label,
                formMember,
                dirMember: (dirMember && !dirMember.surveyExtra) ? dirMember : null
            });
        }
        return slots;
    }

    function getDefectMarkingFloatSlotLabel(groupId, defectOrNull) {
        if (!groupId || !defectOrNull) return null;
        const slots = buildDefectMarkingFloatSlots(groupId);
        const hit = slots.find((s) => s.formMember.id === defectOrNull.id);
        return hit ? hit.label : null;
    }

    function renderDefectMarkingMemberFloat(defectOrNull) {
        const el = document.getElementById('defectMarkingMemberFloat');
        if (!el) return;

        const groupId = defectOrNull && defectOrNull.groupId;
        const slots = groupId ? buildDefectMarkingFloatSlots(groupId) : [];

        if (!defectOrNull || !slots.length) {
            el.hidden = true;
            el.innerHTML = '';
            document.getElementById('defectModal')?.classList.remove('has-marking-member-tabs');
            if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
            return;
        }

        el.hidden = false;
        document.getElementById('defectModal')?.classList.add('has-marking-member-tabs');

        const bindRow = (root) => {
            root.querySelectorAll('.defect-marking-arrow-select').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const mid = btn.getAttribute('data-marking-member-id');
                    const displayLabel = btn.getAttribute('data-display-label') || undefined;
                    const focusId = btn.getAttribute('data-focus-member-id') || mid;
                    if (mid) window.selectDefectMarkingMember(mid, displayLabel, focusId);
                });
            });
            root.querySelectorAll('.defect-marking-assign-no-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const mid = btn.getAttribute('data-marking-member-id');
                    if (mid && typeof window.assignSurveyNumberToArrow === 'function') {
                        window.assignSurveyNumberToArrow(mid);
                    }
                });
            });
        };

        let html = '<div class="defect-marking-float-section">';
        slots.forEach(({ label, formMember, dirMember }) => {
            const active = (formMember.id === defectOrNull.id || (dirMember && dirMember.id === defectOrNull.id)) ? ' is-active' : '';
            const assignTarget = (dirMember && canAssignSurveyNumberToDefect(dirMember))
                ? dirMember
                : (canAssignSurveyNumberToDefect(formMember) ? formMember : null);
            const assignClass = assignTarget ? ' has-assign-btn' : ' no-assign-btn';
            html += `<div class="defect-marking-arrow-row${assignClass}${active}">`
                + `<button type="button" class="defect-marking-float-btn defect-marking-arrow-select${active}"`
                + ` data-marking-member-id="${escapeHtml(formMember.id)}"`
                + ` data-focus-member-id="${escapeHtml((dirMember || formMember).id)}"`
                + ` data-display-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
            if (assignTarget) {
                html += `<button type="button" class="defect-marking-assign-no-btn"`
                    + ` data-marking-member-id="${escapeHtml(assignTarget.id)}"`
                    + ` title="이 화살표에 조사표 번호 부여">번호 부여</button>`;
            }
            html += '</div>';
        });
        html += '</div>';

        el.innerHTML = html;
        bindRow(el);
        if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
    }

    /** 결함 수정 이력 — 최근 것이 위. 균열 진전 여부를 이 줄들로 읽는다. */
    function renderDefectEditHistory(defectOrNull) {
        const box = document.getElementById('defectEditHistory');
        const list = document.getElementById('defectEditHistoryList');
        const count = document.getElementById('defectEditHistoryCount');
        if (!box || !list) return;
        const api = window.BSA && window.BSA.editHistory;
        const entries = api ? api.readHistory(defectOrNull) : [];
        if (!entries.length) {
            box.hidden = true;
            list.innerHTML = '';
            if (count) count.textContent = '';
            return;
        }
        box.hidden = false;
        if (count) count.textContent = `(${entries.length}건)`;
        list.innerHTML = entries.slice().reverse().map((e) => {
            const when = formatDefectMarkingTimestamp(e.at) || '시각 미기록';
            const who = String(e.by || '').trim();
            return `<li>
                <span class="defect-edit-history-when">${escapeHtml(when)}</span>
                ${who ? `<span class="defect-edit-history-who">${escapeHtml(who)}</span>` : ''}
                <span class="defect-edit-history-what">${escapeHtml(api.describeChanges(e.changes))}</span>
            </li>`;
        }).join('');
    }

    function renderDefectMarkingTimeline(defectOrNull) {
        const el = document.getElementById('defectMarkingTimeline');
        renderDefectMarkingMemberFloat(defectOrNull);
        renderDefectEditHistory(defectOrNull);
        if (!el) return;

        if (!defectOrNull) {
            const roundKey = getCurrentSurveyRoundKey();
            el.innerHTML = `
                <span class="defect-timeline-chip defect-timeline-round"><i class="fa-solid fa-calendar"></i> ${escapeHtml(formatSurveyRoundLabel(roundKey))}</span>
                <span class="defect-timeline-sep">·</span>
                <span class="defect-timeline-chip defect-timeline-mark">신규 마킹</span>
            `;
            return;
        }

        const roundLabel = formatSurveyRoundLabel(defectOrNull.surveyRound || getCurrentSurveyRoundKey());
        const markedAt = getDefectMapMarkedAt(defectOrNull);
        const markedLabel = markedAt
            ? formatDefectMarkingTimestamp(markedAt)
            : (isDefectMapUnregistered(defectOrNull) ? '도면 미배치' : '마킹 시각 미기록');
        const roundKind = isPreviousRoundDefect(defectOrNull)
            ? '<span class="defect-timeline-chip defect-timeline-prev">전회차</span>'
            : '<span class="defect-timeline-chip defect-timeline-curr">금회차</span>';

        el.innerHTML = `
            <span class="defect-timeline-chip defect-timeline-round" title="등록 회차"><i class="fa-solid fa-calendar"></i> ${escapeHtml(roundLabel)}</span>
            <span class="defect-timeline-sep">·</span>
            <span class="defect-timeline-chip defect-timeline-mark" title="도면 마킹 시각"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(markedLabel)}</span>
            <span class="defect-timeline-sep">·</span>
            ${roundKind}
        `;
    }

    /** 화살표 N 라벨 (번호 -1/-2 대신) */
    window.cycleMarkingMemberArrowDir = async function(defectId) {
        if (!defectId || !state.currentBuildingId) return;
        if (typeof flushDefectAutoApply === 'function') {
            try { await flushDefectAutoApply(); } catch (_e) { /* ignore */ }
        }
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const m = (state.defects[key] || []).find((x) => x.id === defectId);
        if (!m || m.surveyExtra) return;

        const pinId = document.getElementById('defectPinId')?.value;
        if (pinId !== m.id && typeof window.selectDefectMarkingMember === 'function') {
            await window.selectDefectMarkingMember(m.id);
        }

        let oct = ((parseInt(m.arrowOctant, 10) || 0) % 8 + 8) % 8;
        if (!m.forceArrowDir) {
            persistMarkingMemberArrowDir(m, true, oct);
            return;
        }
        if (oct >= 7) {
            persistMarkingMemberArrowDir(m, false, 0);
            return;
        }
        persistMarkingMemberArrowDir(m, true, oct + 1);
    };

    /** 같은 번호 그룹의 다른 화살표(마킹)로 전환해 수정 */
    window.selectDefectMarkingMember = async function(defectId, displayLabel, focusMemberId) {
        if (!defectId || !state.currentBuildingId) return;
        if (typeof flushDefectAutoApply === 'function') {
            try { await flushDefectAutoApply(); } catch (_e) { /* ignore */ }
        }
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const d = (state.defects[key] || []).find((x) => x.id === defectId);
        if (!d) return;
        if (d.groupId) {
            window._groupBoxCycle = { groupId: d.groupId, lastId: d.id };
        }
        if (typeof selectedDefectIds !== 'undefined') {
            selectedDefectIds = new Set([d.id]);
        }
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: true });
        const canvasFocusId = focusMemberId || d.id;
        if (typeof window.focusDefectOnCanvas === 'function') {
            window.focusDefectOnCanvas(canvasFocusId, { uncovered: true });
        }
        openAddDefectModal(d.x, d.y, d.targetX, d.targetY, d, null, { revealMarkingAboveDrawer: true });
        let label = displayLabel || getDefectMarkingFloatSlotLabel(d.groupId, d);
        if (!label) {
            const markingMembers = d.groupId ? getDefectMarkingGroupMembers(d.groupId) : [];
            const arrowIdx = markingMembers.findIndex((m) => m.id === d.id);
            label = formatDefectMemberChipLabel(d, arrowIdx >= 0 ? arrowIdx : undefined);
        }
        window.showToast?.(`${label} 선택`, 'info', 1600);
    };

    // 다음 정기 회차(상반기→하반기→다음해 상반기). 수시점검은 다음 해 수시로 이동.
    function getNextSurveyRoundParts(yearStr, periodStr) {
        const yearNum = parseInt(String(yearStr || '').replace(/[^\d]/g, ''), 10);
        const y = Number.isFinite(yearNum) ? yearNum : new Date().getFullYear();
        const p = periodStr || '하반기';
        if (p === '상반기') return { year: `${y}년`, period: '하반기' };
        if (p === '하반기') return { year: `${y + 1}년`, period: '상반기' };
        return { year: `${y + 1}년`, period: '수시점검' };
    }

    function parseSurveyYearNum(yearStr) {
        const n = parseInt(String(yearStr || '').replace(/[^\d]/g, ''), 10);
        return Number.isFinite(n) ? n : new Date().getFullYear();
    }

    /** 회차 추가 년도 셀렉트: 기준(마지막) 회차에서 5년 전부터 앞쪽까지 넉넉히 채움 */
    function fillAddSurveyRoundYearOptions(yearEl, baseYearStr, selectedYearStr) {
        if (!yearEl) return;
        const baseY = parseSurveyYearNum(baseYearStr);
        const selY = parseSurveyYearNum(selectedYearStr);
        const nowY = new Date().getFullYear();
        const fromY = baseY - 5;
        const toY = Math.max(baseY + 5, selY, nowY + 2);
        const selectedVal = selectedYearStr && String(selectedYearStr).includes('년')
            ? String(selectedYearStr)
            : `${selY}년`;
        yearEl.innerHTML = '';
        for (let y = fromY; y <= toY; y++) {
            const opt = document.createElement('option');
            opt.value = `${y}년`;
            opt.textContent = `${y}년`;
            yearEl.appendChild(opt);
        }
        yearEl.value = selectedVal;
        if (yearEl.value !== selectedVal) {
            const opt = document.createElement('option');
            opt.value = selectedVal;
            opt.textContent = selectedVal;
            yearEl.appendChild(opt);
            yearEl.value = selectedVal;
        }
    }

    function ensureSurveyRoundSelectOption(selectId, value) {
        const sel = document.getElementById(selectId);
        if (!sel || !value) return;
        if (![...sel.options].some(o => o.value === value)) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            sel.appendChild(opt);
        }
        sel.value = value;
    }

    function countBuildingDefects(bldg) {
        if (!bldg || !bldg.id) return 0;
        const prefix = `${bldg.id}_`;
        let n = 0;
        Object.keys(state.defects || {}).forEach((k) => {
            if (k.startsWith(prefix)) n += (state.defects[k] || []).length;
        });
        return n;
    }

    function defectRoundNoKey(d) {
        const raw = String((d && (d.groupNo || d.no)) || '').replace(/^NO\.?\s*/i, '').trim();
        const m = raw.match(/(\d+)(?:-(\d+))?/);
        if (!m) return raw.toUpperCase();
        const suffix = m[2] ? ('-' + parseInt(m[2], 10)) : '';
        return String(parseInt(m[1], 10)) + suffix;
    }

    function defectRoundAnchor(d) {
        const x = Number(d && (d.targetX != null ? d.targetX : d.x));
        const y = Number(d && (d.targetY != null ? d.targetY : d.y));
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x: x, y: y };
    }

    function anchorsNear(a, b, maxDist) {
        if (!a || !b) return false;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return (dx * dx + dy * dy) <= maxDist * maxDist;
    }

    /**
     * 같은 번호·가까운 위치의 전회차/현회차 쌍은 복제로 본다.
     * keepPrevious=true 이면 전회차만 남기고 현회차 복사를 뺀다.
     */
    function dropOverlappingRoundTwins(bldg, keepPrevious, floorCode) {
        if (!bldg || !bldg.id || !state.defects) return 0;
        const prefix = `${bldg.id}_`;
        const onlyKey = floorCode ? `${bldg.id}_${floorCode}` : '';
        let removed = 0;
        Object.keys(state.defects).forEach((k) => {
            if (!k.startsWith(prefix)) return;
            if (onlyKey && k !== onlyKey) return;
            const arr = state.defects[k] || [];
            const drop = new Set();
            for (let i = 0; i < arr.length; i++) {
                const a = arr[i];
                if (!a || drop.has(a.id)) continue;
                const noA = defectRoundNoKey(a);
                const ptA = defectRoundAnchor(a);
                if (!noA || !ptA) continue;
                for (let j = i + 1; j < arr.length; j++) {
                    const b = arr[j];
                    if (!b || drop.has(b.id)) continue;
                    if (defectRoundNoKey(b) !== noA) continue;
                    if (!anchorsNear(ptA, defectRoundAnchor(b), 120)) continue;
                    const aPrev = isPreviousRoundDefect(a);
                    const bPrev = isPreviousRoundDefect(b);
                    if (aPrev === bPrev) continue;
                    const dropRec = keepPrevious
                        ? (aPrev ? b : a)
                        : (aPrev ? a : b);
                    if (dropRec && dropRec.id) drop.add(dropRec.id);
                }
            }
            if (!drop.size) return;
            if (typeof pushDefectHistoryForKey === 'function') pushDefectHistoryForKey(k);
            state.defects[k] = arr.filter((d) => d && !drop.has(d.id));
            removed += drop.size;
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(k);
        });
        return removed;
    }

    /** 회차를 올리기 전 결함에 떠나기 회차를 찍어, 회차 없는 핀이 현회차(파랑)로 남지 않게 한다. */
    function stampDefectsLeavingRound(bldg, fromKey, toKey) {
        if (!bldg || !bldg.id) return;
        const prefix = `${bldg.id}_`;
        const toRank = getSurveyRoundOrderRank(toKey);
        Object.keys(state.defects || {}).forEach((k) => {
            if (!k.startsWith(prefix)) return;
            (state.defects[k] || []).forEach((d) => {
                if (!d) return;
                if (d.surveyRound === toKey) return;
                const rank = getSurveyRoundOrderRank(d.surveyRound);
                if (d.surveyRound && toRank !== null && rank !== null && rank >= toRank) return;
                d.surveyRound = fromKey;
                d.isCarriedOver = false;
            });
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(k);
        });
    }

    /**
     * 다음 회차 점검 시작 — 건물·층·도면·결함·비파괴는 그대로 두고
     * 점검 연도/기간만 다음 회차로 올린다. 기존 결함은 전회차로 분류된다.
     * (결함을 복제하지 않음: 같은 건물 데이터를 이어 쓰는 방식)
     */
    window.startNextSurveyRound = async function() {
        const bldg = state.currentBuilding;
        if (!bldg || !state.currentBuildingId) {
            window.showToast('건물을 먼저 선택해 주세요.', 'warning');
            return;
        }
        const curYear = document.getElementById('selectInspectionYear')?.value
            || bldg.inspectionYear || '2026년';
        const curPeriod = document.getElementById('selectInspectionPeriod')?.value
            || bldg.inspectionPeriod || '하반기';
        const next = getNextSurveyRoundParts(curYear, curPeriod);
        const toKey = `${next.year}_${next.period}`;
        const fromKey = `${curYear}_${curPeriod}`;
        const defectCount = countBuildingDefects(bldg);
        const siteKey = getBuildingSiteName(bldg);
        if (siteAlreadyHasRound(siteKey, next.year, next.period)) {
            window.showToast(
                `${next.year} ${next.period} 현장이 이미 있습니다. 그 현장을 여세요. 이 건물 회차를 그쪽으로 옮기면 마킹이 겹칩니다.`,
                'warning',
                6000
            );
            return;
        }

        if (!await window.appConfirm(
            `다음 회차 점검을 시작할까요?\n\n` +
            `· 현재: ${curYear} ${curPeriod}\n` +
            `· 다음: ${next.year} ${next.period}\n\n` +
            `건물·층·도면·결함(${defectCount}건)·비파괴 데이터는 그대로 유지됩니다.\n` +
            `기존 결함은 「전회차」로 표시되고, 새로 등록하는 항목부터 금회차로 기록됩니다.`
        )) return;

        ensureSurveyRoundSelectOption('selectInspectionYear', next.year);
        ensureSurveyRoundSelectOption('selectInspectionPeriod', next.period);
        const yearEl = document.getElementById('selectInspectionYear');
        const periodEl = document.getElementById('selectInspectionPeriod');
        if (yearEl) yearEl.value = next.year;
        if (periodEl) periodEl.value = next.period;

        // 2026-10-20 지난 회차 점검일을 그 회차 것으로 남겨 둔다(새 회차 날짜는 건물 수정에서 따로 정함)
        { const mm = window.BSA && window.BSA.buildingMetaMerge;
          if (mm && mm.seedRoundDate && mm.seedRoundDate(bldg, fromKey)) markBuildingMetaDirty(bldg); }
        bldg.inspectionYear = next.year;
        bldg.inspectionPeriod = next.period;

        const toRank = getSurveyRoundOrderRank(toKey);
        let droppedTwins = 0;
        if (toRank !== null) {
            // 기준점을 먼저 올려 기존 회차는 전회차(빨강)로 가른 뒤, 같은 번호로 겹친 현회차 복사를 뺀다.
            bldg.latestSurveyRoundKey = toKey;
            droppedTwins = dropOverlappingRoundTwins(bldg, true);
            stampDefectsLeavingRound(bldg, fromKey, toKey);
        } else {
            // 수시점검: 순서 비교가 불가하므로 기존 결함에 전회차 체크를 켠다
            const prefix = `${bldg.id}_`;
            Object.keys(state.defects || {}).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (state.defects[k] || []).forEach((d) => {
                    if (d && d.surveyRound !== toKey) d.isCarriedOver = true;
                });
            });
            droppedTwins = dropOverlappingRoundTwins(bldg, true);
        }

        saveStateToLocalStorage();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();

        if (typeof window.syncInspectionRoundDateInput === 'function') window.syncInspectionRoundDateInput();
        const twinNote = droppedTwins > 0 ? ` · 겹친 현회차 ${droppedTwins}건 제거` : '';
        window.showToast(
            `${next.year} ${next.period} 점검 시작 · 기존 ${defectCount}건은 전회차로 유지${twinNote}`,
            'success',
            5500
        );
    };

    /**
     * 수정창「다음 회차 시작하기」— 새 건물 ID로 차기 점검 현장을 만들고
     * 결함·도면·NDT를 복제하되 결함은 전회차로 넘긴다. PDF는 현장명 보관함에 유지.
     */
    window.startNextInspectionRoundFromEdit = async function() {
        const sourceBldg = window.currentEditingBuilding;
        if (!sourceBldg) {
            window.showToast('수정 중인 건축물 정보를 찾을 수 없습니다.', 'warning');
            return;
        }

        const curYear = sourceBldg.inspectionYear || '2026년';
        const curPeriod = sourceBldg.inspectionPeriod || '하반기';
        const next = getNextSurveyRoundParts(curYear, curPeriod);
        const defectCount = countBuildingDefects(sourceBldg);
        const siteLabel = normalizeSiteVaultKey(sourceBldg.name);

        if (!await window.appConfirm(
            `다음 회차 점검 현장을 새로 만들까요?\n\n` +
            `· 현재: ${curYear} ${curPeriod} (${sourceBldg.name || '현장'})\n` +
            `· 새 현장: ${next.year} ${next.period}\n\n` +
            `· 새 점검 기록(새 ID)이 생성됩니다. 기존 점검은 그대로 남습니다.\n` +
            `· 결함 ${defectCount}건 → 전회차로 이전, 층·도면·NDT 복사\n` +
            `· PDF 도면은 「${siteLabel}」 현장명 보관함에 유지·재사용`
        )) return;

        const created = await createSurveyRoundBuildingFromSource(sourceBldg, next.year, next.period, {
            closeEditModal: true,
            selectAfter: true
        });
        if (created) {
            window.showToast(
                `${next.year} ${next.period} 새 점검 생성 · 전회차 결함 ${defectCount}건 · PDF는 「${siteLabel}」 보관함`,
                'success',
                6500
            );
        }
    };

    /** 기준 건물(보통 마지막 회차)을 복제해 지정 연도·기간의 새 회차 점검을 만든다. */
    async function createSurveyRoundBuildingFromSource(sourceBldg, year, period, opts) {
        opts = opts || {};
        if (!sourceBldg) {
            window.showToast('기준이 될 회차 점검을 찾을 수 없습니다.', 'warning');
            return null;
        }
        const nextYear = year || '2026년';
        const nextPeriod = period || '하반기';
        const toKey = `${nextYear}_${nextPeriod}`;
        const siteLabel = getBuildingSiteName(sourceBldg);
        const defectCount = countBuildingDefects(sourceBldg);

        window.showLoading('회차 현장 생성 중…');
        try {
            await archiveBuildingPdfsToSiteVault(sourceBldg);

            const newBuildingId = 'bldg-' + Date.now();
            const siteName = getBuildingSiteName(sourceBldg);
            const dong = getBuildingDongLabel(sourceBldg);
            const newBldg = {
                id: newBuildingId,
                _pendingCloudSync: true,
                siteName,
                dong,
                multiDong: sourceBldg.multiDong === true || isSiteMultiDong(siteName),
                name: composeBuildingStorageName(siteName, dong),
                address: sourceBldg.address || '',
                inspector: sourceBldg.inspector || window.state.userName || '점검자',
                contactPhone: sourceBldg.contactPhone || '',
                date: new Date().toISOString().split('T')[0],
                floors: sourceBldg.floors || '',
                inspectionType: opts.inspectionType || sourceBldg.inspectionType || '정밀안전점검',
                inspectionYear: nextYear,
                inspectionPeriod: nextPeriod,
                latestSurveyRoundKey: toKey,
                siteVaultKey: siteVaultDocId(siteName),
                structureType: sourceBldg.structureType || '',
                facilityGrade: sourceBldg.facilityGrade || '',
                completionDate: sourceBldg.completionDate || '',
                notes: sourceBldg.notes || '',
                floorsList: JSON.parse(JSON.stringify(sourceBldg.floorsList || [])),
                floorDrawings: {},
                floorDrawingPdfs: {},
                floorDrawingTiers: {},
                floorDrawingSources: {},
                locationMapLegend: sourceBldg.locationMapLegend
                    ? JSON.parse(JSON.stringify(sourceBldg.locationMapLegend))
                    : undefined,
                locationMapLegendBox: sourceBldg.locationMapLegendBox
                    ? JSON.parse(JSON.stringify(sourceBldg.locationMapLegendBox))
                    : undefined
            };

            await cloneBuildingDataFromSource(sourceBldg, newBldg, {
                floorsDrawings: true,
                defects: true,
                defectRoundMode: 'carryOver',
                ndt: true,
                mapStyles: true,
                merge: false
            }, (msg) => {
                if (typeof window.updateLoadingText === 'function') window.updateLoadingText(msg);
            });

            await hydrateBuildingPdfsFromSiteVault(newBldg);
            await persistBuildingDrawingAssetsNow(newBldg);

            if (!window.state.buildings) window.state.buildings = [];
            window.state.buildings.unshift(newBldg);

            saveStateToLocalStorage();
            if (typeof syncStateToFirebase === 'function') syncStateToFirebase();

            if (opts.closeEditModal && typeof window.closeEditBuildingModalFunc === 'function') {
                window.closeEditBuildingModalFunc();
            }
            if (typeof renderDashboard === 'function') renderDashboard();
            if (opts.selectAfter) window.selectBuildingAndInspect(newBldg);
            return { building: newBldg, defectCount, siteLabel, toKey };
        } catch (err) {
            console.error('회차 현장 생성 오류:', err);
            window.showToast('회차 생성 중 오류가 발생했습니다.', 'error', 5000);
            return null;
        } finally {
            window.hideLoading();
        }
    }

    function getSiteBuildingsSorted(siteKey) {
        const all = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds);
        const list = all.filter((b) => getBuildingSiteName(b) === siteKey);
        const dongCmp = makeDongComparator(siteKey);
        list.sort((a, b) => {
            const ra = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(a));
            const rb = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(b));
            if (ra != null && rb != null && ra !== rb) return rb - ra;
            if (ra != null && rb == null) return -1;
            if (ra == null && rb != null) return 1;
            return dongCmp(a, b);
        });
        return list;
    }

    function siteAlreadyHasRound(siteKey, year, period) {
        const key = `${year}_${period}`;
        return getSiteBuildingsSorted(siteKey).some((b) => getBuildingSurveyRoundKey(b) === key);
    }

    function siteRoundAlreadyHasDong(siteKey, roundKey, dong) {
        const want = normalizeDongLabel(dong) || '동 미지정';
        return getSiteBuildingsSorted(siteKey).some((b) => {
            if (getBuildingSurveyRoundKey(b) !== roundKey) return false;
            return formatDongRowLabel(b) === want || normalizeDongLabel(getBuildingDongLabel(b)) === normalizeDongLabel(dong);
        });
    }

    /** 같은 현장·회차에 같은 동 이름(대소문자·공백 무시)이 다른 건물에 있는지 */
    function dongNameTakenInSiteRound(siteKey, roundKey, dong, exceptId) {
        const want = normalizeDongLabel(dong).toLowerCase();
        if (!want) return false;
        return getSiteBuildingsSorted(siteKey).some((b) => b && b.id !== exceptId
            && getBuildingSurveyRoundKey(b) === roundKey
            && normalizeDongLabel(getBuildingDongLabel(b)).toLowerCase() === want);
    }

    /** 동 이름 지정/변경 — 건물 id·결함·도면·사진·회차는 그대로, dong/name만 바꾼다 */
    window.renameDongOfBuilding = async function(bldgId) {
        const bldg = (window.state.buildings || []).find((b) => b && b.id === bldgId);
        if (!bldg) { window.showToast('동을 찾을 수 없습니다.', 'warning'); return false; }
        const siteKey = getBuildingSiteName(bldg);
        const roundKey = getBuildingSurveyRoundKey(bldg);
        const cur = getBuildingDongLabel(bldg) || '';
        const raw = await window.appPrompt(`동 이름을 입력하세요.\n(현장: ${siteKey} · ${formatSurveyRoundLabel(roundKey)})`, cur, { title: cur ? '동 이름 변경' : '동 이름 지정', placeholder: '예: 101동' });
        if (raw == null) return false;
        const dong = normalizeDongLabel(raw);
        if (!dong) { window.showToast('동 이름을 입력해 주세요.', 'warning'); return false; }
        if (dong === cur) return false;
        if (dongNameTakenInSiteRound(siteKey, roundKey, dong, bldg.id)) {
            window.showToast(`이 현장·회차에 "${dong}"이(가) 이미 있습니다.`, 'warning', 4000);
            return false;
        }
        bldg.siteName = siteKey;
        bldg.dong = dong;
        bldg.multiDong = true;
        bldg.name = composeBuildingStorageName(siteKey, dong);
        bldg._pendingCloudSync = true;
        if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(bldg);
        if (window.state.currentBuildingId === bldg.id && window.state.currentBuilding) {
            window.state.currentBuilding.dong = dong;
            window.state.currentBuilding.name = bldg.name;
        }
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderDashboard === 'function') renderDashboard();
        window.showToast(cur ? `"${cur}" → "${dong}" 이름을 바꿨습니다.` : `동 이름을 "${dong}"(으)로 지정했습니다.`, 'success');
        return true;
    };

    /** 동 삭제 — 이름 입력 + 2차 확인 후 기존 휴지통 경로(30일 뒤 영구 삭제·삭제 동기화) 사용 */
    window.deleteDongOfBuilding = async function(bldgId) {
        const bldg = (window.state.buildings || []).find((b) => b && b.id === bldgId);
        if (!bldg) { window.showToast('동을 찾을 수 없습니다.', 'warning'); return false; }
        const siteKey = getBuildingSiteName(bldg);
        const roundKey = getBuildingSurveyRoundKey(bldg);
        const label = formatDongRowLabel(bldg);
        const siteActive = getSiteBuildingsSorted(siteKey);
        if (siteActive.length <= 1) {
            window.showToast('현장의 마지막 동은 여기서 지울 수 없습니다. 현장 전체를 지우려면 「현장 정보 수정」의 삭제를 사용해 주세요.', 'warning', 6000);
            return false;
        }
        const typed = await window.appPrompt(`삭제하려면 동 이름 「${label}」을(를) 그대로 입력하세요.`, '', { title: '동 삭제', danger: true });
        if (typed == null) return false;
        if (normalizeDongLabel(typed) !== label) {
            window.showToast('입력한 이름이 달라 삭제하지 않았습니다.', 'warning');
            return false;
        }
        const defectCount = typeof countBuildingDefects === 'function' ? countBuildingDefects(bldg) : 0;
        const sameRoundLeft = siteActive.filter((b) => b.id !== bldg.id && getBuildingSurveyRoundKey(b) === roundKey).length;
        if (!await window.confirmDelete(
            `동 「${label}」을(를) 휴지통으로 보낼까요?\n\n` +
            `· 현장: ${siteKey} · ${formatSurveyRoundLabel(roundKey)}\n` +
            `· 결함 ${defectCount}건 · 도면·사진은 휴지통 보관 중에는 그대로 남습니다.\n` +
            `· 약 30일간 보관되며 그 안에 복원할 수 있고, 지나면 도면·결함·사진과 함께 영구 삭제됩니다.` +
            (sameRoundLeft === 0 ? '\n\n※ 이 회차의 마지막 동입니다. 삭제하면 이 회차가 목록에서 사라집니다.' : '')
        )) return false;
        if (window.moveBuildingToTrash(bldg)) {
            window.showToast(`동 「${label}」을(를) 휴지통으로 옮겼습니다. 30일 내 복원 가능`, 'success', 5000);
            return true;
        }
        return false;
    };

    /* ---------------- 층을 다른 동(건물)으로 옮기기 (2026-10-20 여수성광교회 본관·기념관 나누기) ----------------
     * 사진을 다시 올리지 않는다 — 결함·비파괴 기록을 같은 id·같은 사진 id 그대로 옮길 동의 층 키로 옮긴다.
     *  사진은 회사 photos/{사진id}에 있고 저장 경로는 현장·회차 기준이라, 같은 현장·회차 안이면 그대로 쓸 수 있다.
     * 원래 동 층에는 「옮겨 나감」 묘비만 남긴다(trackDefectDeletion/trackNdtDeletion). 삭제 기능(removeSingleDefectRecord·
     *  층 삭제)을 쓰지 않으므로 사진 삭제·미룬 삭제 대기열에 들어가지 않는다. 묘비가 있어야 원래 동을 나중에 영구 삭제할 때
     *  그 동에 남은 결함으로 보고 사진을 지우는 일이 없다(permanentlyDeleteBuilding은 그 동 결함의 사진을 지운다).
     * 도면은 옮길 동 id로 새 파일을 올린다(cloneFloorDrawingsFromSource, 고른 층만) — 원래 동을 지울 때 그 동 파일만 지워지게.
     * 그 밖의 층 단위 기록(메모·평가단위·부재 수·가이드·구조 부재·도면 스타일·출력 범위·회전 등, state의 「건물id_층」 칸)은 복사.
     * 개발자 도구에서 부른다: await bsaMoveFloorsToBuilding(원래id, 옮길id, ['층코드', …], { dryRun: true }) 로 먼저 확인. */
    const FLOOR_MOVE_KEEP_KEYS = new Set(['deletedDefectIds', 'deletedDefectAt', 'deletedNdtIds', 'deletedNdtAt']);
    const FLOOR_MOVE_RECORD_KEYS = ['defects', 'ndtData', 'ndtDisplacementGroups'];

    function floorMoveOtherMapKeys(sk) {
        const st = window.state;
        return Object.keys(st).filter((k) => !FLOOR_MOVE_KEEP_KEYS.has(k) && FLOOR_MOVE_RECORD_KEYS.indexOf(k) < 0
            && st[k] && typeof st[k] === 'object' && !Array.isArray(st[k])
            && Object.prototype.hasOwnProperty.call(st[k], sk));
    }

    function planFloorMove(src, dst, codes) {
        const st = window.state;
        const srcCodes = collectKnownFloorCodesForBuilding(src);
        return codes.map((fc) => {
            const sk = `${src.id}_${fc}`;
            const dk = `${dst.id}_${fc}`;
            const defects = ((st.defects || {})[sk] || []).filter(Boolean);
            const photoIds = new Set();
            defectPhotoIdsOfList(defects, photoIds);
            const problems = [];
            if (!srcCodes.has(fc)) problems.push('원래 동에 없는 층');
            if (FLOOR_MOVE_RECORD_KEYS.some((k) => ((st[k] || {})[dk] || []).length)) problems.push('옮길 동의 같은 층에 이미 기록이 있음');
            return {
                floorCode: fc,
                defects: defects.length,
                defectIds: defects.map((d) => d.id),
                photos: photoIds.size,
                ndt: ((st.ndtData || {})[sk] || []).length,
                groups: ((st.ndtDisplacementGroups || {})[sk] || []).length,
                otherMaps: floorMoveOtherMapKeys(sk),
                problems
            };
        });
    }

    window.bsaMoveFloorsToBuilding = async function (srcId, dstId, floorCodes, opts) {
        opts = opts || {};
        const st = window.state;
        const src = (st.buildings || []).find((b) => b && b.id === srcId);
        const dst = (st.buildings || []).find((b) => b && b.id === dstId);
        if (!src || !dst || src.id === dst.id) throw new Error('원래 동·옮길 동을 확인해 주세요.');
        if (getBuildingSiteName(src) !== getBuildingSiteName(dst) || getBuildingSurveyRoundKey(src) !== getBuildingSurveyRoundKey(dst)) {
            throw new Error('같은 현장·같은 회차의 동끼리만 옮길 수 있습니다(사진 저장 위치가 현장·회차 기준).');
        }
        const codes = Array.from(new Set((floorCodes || []).map(String).filter(Boolean)));
        if (!codes.length) throw new Error('옮길 층을 골라 주세요.');
        if (navigator.onLine === false || !db || !st.companyId) throw new Error('인터넷 연결·로그인이 필요합니다.');

        // 1) 원래 동 층을 서버에서 최신으로(안 열어 본 층이 빠진 채 옮겨지지 않게)
        const fresh = await refreshBuildingFloorsFromServer(src, { force: true });
        if (!fresh.ok && fresh.skipped !== 'recent') throw new Error('원래 동 층을 서버에서 받지 못했습니다: ' + ((fresh.failed || []).join(', ') || fresh.skipped));
        const plan = planFloorMove(src, dst, codes);
        const blocked = plan.some((r) => r.problems.length);
        if (opts.dryRun || blocked) return { dryRun: true, blocked, plan };

        // 2) 도면 — 옮길 동 id로 새 파일(고른 층만), 층 목록도 고른 층만 붙는다
        await cloneFloorDrawingsFromSource(src, dst.id, dst, { floorCodes: codes, merge: true }, opts.onProgress);
        if (typeof persistBuildingDrawingAssetsNow === 'function') await persistBuildingDrawingAssetsNow(dst);

        // 3) 층 기록 옮기기
        codes.forEach((fc) => {
            const sk = `${src.id}_${fc}`;
            const dk = `${dst.id}_${fc}`;
            FLOOR_MOVE_RECORD_KEYS.forEach((k) => {
                if (!st[k]) st[k] = {};
                const list = (st[k][sk] || []).filter(Boolean);
                st[k][dk] = list.slice();
                list.forEach((r) => {
                    if (!r.id) return;
                    if (k === 'defects') trackDefectDeletion(sk, r.id, r, { wallClock: true });
                    else trackNdtDeletion(sk, r.id, r, { wallClock: true });
                });
                st[k][sk] = [];
            });
            floorMoveOtherMapKeys(sk).forEach((k) => {
                try { st[k][dk] = JSON.parse(JSON.stringify(st[k][sk])); } catch (_e) { st[k][dk] = st[k][sk]; }
            });
            markFloorKeyDirty(sk);
            markFloorKeyDirty(dk);
        });
        syncBuildingDrawingFloorCodes(dst);
        markBuildingMetaDirty(dst);
        markBuildingMetaDirty(src);
        saveStateToLocalStorage();
        await syncAfterImportWithRetry('층 옮기기');
        if (typeof renderDashboard === 'function') renderDashboard();
        return { dryRun: false, plan };
    };

    /**
     * 같은 id 기록이 다른 동에 이미 있는 「사본 층」을 비운다(묘비만, 사진은 안 지움) — 휴지통에 넣기 전에.
     * 2026-10-20 「여수성광교회」(동 이름 없는 두 번째 건물)의 본관 지하 1층에 본관 결함 54개·사진 15장이 같은 id로 복사돼 있었다.
     * 그대로 휴지통 → 30일 뒤 영구 삭제되면 그 동 결함의 사진을 지우므로(permanentlyDeleteBuilding) 본관동 사진이 사라질 수 있다.
     * 다른 동에 같은 id가 없는 기록은 건드리지 않고 남은 것으로 알려 준다.
     */
    window.bsaReleaseDuplicateFloors = async function (srcId, floorCodes, opts) {
        opts = opts || {};
        const st = window.state;
        const src = (st.buildings || []).find((b) => b && b.id === srcId);
        if (!src) throw new Error('동을 찾을 수 없습니다.');
        if (navigator.onLine === false || !db || !st.companyId) throw new Error('인터넷 연결·로그인이 필요합니다.');
        const fresh = await refreshBuildingFloorsFromServer(src, { force: true });
        if (!fresh.ok && fresh.skipped !== 'recent') throw new Error('층을 서버에서 받지 못했습니다: ' + ((fresh.failed || []).join(', ') || fresh.skipped));
        const prefix = `${src.id}_`;
        const elsewhere = {};
        FLOOR_MOVE_RECORD_KEYS.forEach((k) => {
            const ids = new Set();
            Object.keys(st[k] || {}).forEach((key) => {
                if (key.startsWith(prefix)) return;
                ((st[k] || {})[key] || []).forEach((r) => { if (r && r.id) ids.add(r.id); });
            });
            elsewhere[k] = ids;
        });
        const report = [];
        (floorCodes || []).map(String).forEach((fc) => {
            const sk = `${src.id}_${fc}`;
            const row = { floorCode: fc, released: 0, kept: [] };
            FLOOR_MOVE_RECORD_KEYS.forEach((k) => {
                const list = ((st[k] || {})[sk] || []).filter(Boolean);
                const keep = [];
                list.forEach((r) => {
                    if (r.id && elsewhere[k].has(r.id)) {
                        if (!opts.dryRun) {
                            if (k === 'defects') trackDefectDeletion(sk, r.id, r, { wallClock: true });
                            else trackNdtDeletion(sk, r.id, r, { wallClock: true });
                        }
                        row.released++;
                    } else {
                        keep.push(r);
                        row.kept.push(k + ':' + (r.id || '?'));
                    }
                });
                if (!opts.dryRun && st[k]) st[k][sk] = keep;
            });
            if (!opts.dryRun && row.released) markFloorKeyDirty(sk);
            report.push(row);
        });
        if (!opts.dryRun) {
            markBuildingMetaDirty(src);
            saveStateToLocalStorage();
            await syncAfterImportWithRetry('사본 층 비우기');
        }
        return { dryRun: !!opts.dryRun, report };
    };

    /** 옮긴 뒤 서버에서 다시 읽어 맞는지 본다 — 옮길 동 층에 결함·사진 id가 다 있고, 원래 동 층엔 묘비만 남았는지 */
    window.bsaVerifyFloorMove = async function (srcId, dstId, plan) {
        const st = window.state;
        const src = (st.buildings || []).find((b) => b && b.id === srcId);
        const dst = (st.buildings || []).find((b) => b && b.id === dstId);
        if (!src || !dst) throw new Error('동을 찾을 수 없습니다.');
        const out = [];
        for (const row of (plan || [])) {
            const fc = row.floorCode;
            const sb = await readFloorSyncBundle(src, fc);
            const db2 = await readFloorSyncBundle(dst, fc);
            const dstItems = (db2 && db2.markings && db2.markings.items) || [];
            const dstIds = new Set(dstItems.map((d) => d && d.id));
            const dstPhotos = defectPhotoIdsOfList(dstItems, new Set());
            const srcItems = (sb && sb.markings && sb.markings.items) || [];
            const srcDel = new Set((sb && sb.markings && sb.markings.deletedIds) || []);
            const missing = (row.defectIds || []).filter((id) => !dstIds.has(id));
            const notTomb = (row.defectIds || []).filter((id) => !srcDel.has(id));
            out.push({
                floorCode: fc,
                expectDefects: row.defects, dstDefects: dstItems.length, missingInDst: missing,
                expectPhotos: row.photos, dstPhotos: dstPhotos.size,
                expectNdt: row.ndt + row.groups,
                dstNdt: ((db2 && db2.ndt && db2.ndt.items) || []).length + ((db2 && db2.ndt && db2.ndt.displacementGroups) || []).length,
                srcItemsLeft: srcItems.filter((d) => d && !srcDel.has(d.id)).length,
                srcNotTombstoned: notTomb,
                ok: !missing.length && !notTomb.length && dstPhotos.size >= row.photos
            });
        }
        return out;
    };

    window.updateHomeFabForDashboardMode = function() {
        const fab = document.getElementById('btnMobileFabAddBuilding');
        if (!fab) return;
        const siteKey = window.state.dashboardSiteKey;
        const siteMode = !!siteKey;
        const multiDong = siteKey ? isSiteMultiDong(siteKey) : false;
        const dongMode = !!(siteKey && window.state.dashboardRoundKey && multiDong);
        fab.classList.toggle('is-round-mode', siteMode && !dongMode);
        fab.classList.toggle('is-dong-mode', dongMode);
        const label = fab.querySelector('.home-fab-label');
        const text = dongMode ? '동 추가하기' : (siteMode ? '회차 추가하기' : '현장 추가하기');
        if (label) label.textContent = text;
        fab.title = text;
        fab.setAttribute('aria-label', text);
    };

    window.openAddSurveyRoundModal = function() {
        const siteKey = window.state.dashboardSiteKey;
        if (!siteKey) {
            window.showToast('회차를 추가할 현장을 먼저 열어 주세요.', 'warning');
            return;
        }
        const rounds = getSiteBuildingsSorted(siteKey);
        const latest = rounds[0];
        if (!latest) {
            window.showToast('이 현장에 기준이 될 회차가 없습니다. 먼저 현장을 등록해 주세요.', 'warning');
            return;
        }
        const curYear = latest.inspectionYear || '2026년';
        const curPeriod = latest.inspectionPeriod || '하반기';
        const next = getNextSurveyRoundParts(curYear, curPeriod);

        const siteEl = document.getElementById('addSurveyRoundSiteLabel');
        const baseEl = document.getElementById('addSurveyRoundBaseLabel');
        const yearEl = document.getElementById('addSurveyRoundYear');
        const periodEl = document.getElementById('addSurveyRoundPeriod');
        const typeEl = document.getElementById('addSurveyRoundType');
        const hintEl = document.getElementById('addSurveyRoundHint');
        if (siteEl) siteEl.textContent = siteKey;
        if (baseEl) {
            baseEl.textContent = `${formatSurveyRoundLabel(getBuildingSurveyRoundKey(latest))} · ${latest.inspectionType || '점검'}`;
        }
        if (yearEl) fillAddSurveyRoundYearOptions(yearEl, curYear, next.year);
        if (periodEl) periodEl.value = next.period;
        if (typeEl) typeEl.value = latest.inspectionType || '정밀안전점검';
        if (hintEl) {
            const fromY = parseSurveyYearNum(curYear) - 5;
            hintEl.textContent = `기본값: 다음 회차 ${next.year} ${next.period} · 년도는 ${fromY}년부터 선택 가능`;
        }
        window._addSurveyRoundSourceId = latest.id;
        const modal = document.getElementById('addSurveyRoundModal');
        if (modal) modal.classList.add('open');
    };

    window.closeAddSurveyRoundModal = function() {
        const modal = document.getElementById('addSurveyRoundModal');
        if (modal) modal.classList.remove('open');
        window._addSurveyRoundSourceId = null;
    };

    /**
     * 현장의 특정 회차(해당 연도_기간의 모든 동)를 휴지통으로 보낸다.
     * 다른 회차는 유지. 마지막 회차도 삭제 가능(확인 후 빈 회차 목록 → 회차 추가).
     * 동기화: trashedAt + _pendingCloudSync → mergeBuildingTrashState로 타 기기에 반영, 복원 전엔 재등장하지 않음.
     */
    window.deleteSurveyRound = async function(siteKey, roundKey) {
        if (!siteKey || !roundKey) return false;
        const members = getSiteBuildingsSorted(siteKey).filter(
            (b) => getBuildingSurveyRoundKey(b) === roundKey
        );
        if (!members.length) {
            window.showToast('삭제할 회차 건물을 찾을 수 없습니다.', 'warning');
            return false;
        }
        const roundLabel = formatSurveyRoundLabel(roundKey);
        const defectCount = members.reduce((n, b) => n + countBuildingDefects(b), 0);
        const dongHint = members.length > 1
            ? `\n· 포함 동: ${members.map(formatDongRowLabel).join(', ')} (${members.length}개)`
            : '';
        const remaining = getSiteBuildingsSorted(siteKey).filter(
            (b) => getBuildingSurveyRoundKey(b) !== roundKey
        );
        const lastRoundHint = remaining.length === 0
            ? '\n\n※ 이 현장의 마지막 회차입니다. 삭제 후 회차 목록이 비며, 「회차 추가하기」로 다시 만들 수 있습니다.'
            : '';
        if (!await window.confirmDelete(
            `회차 「${roundLabel}」을(를) 휴지통으로 보낼까요?\n\n` +
            `· 현장: ${siteKey}\n` +
            `· 점검(동) ${members.length}개 · 결함 ${defectCount}건` +
            dongHint + '\n\n' +
            `· 약 30일간 보관되며 그 안에 복원할 수 있습니다.\n` +
            `· 다른 회차 데이터는 그대로 둡니다.` +
            lastRoundHint
        )) return false;

        const memberIds = new Set(members.map((b) => b.id));
        const wasCurrent = !!(window.state.currentBuildingId && memberIds.has(window.state.currentBuildingId));
        const wasEditing = !!(window.currentEditingBuilding && memberIds.has(window.currentEditingBuilding.id));

        members.forEach((b) => window.moveBuildingToTrash(b, { skipUi: true }));

        if (wasEditing && typeof window.closeEditBuildingModalFunc === 'function') {
            window.closeEditBuildingModalFunc();
        }
        if (wasCurrent) {
            window.state.currentBuilding = null;
            window.state.currentBuildingId = null;
            if (typeof window.switchTab === 'function') window.switchTab('tab-home');
        }
        if (window.state.dashboardRoundKey === roundKey) {
            window.state.dashboardRoundKey = null;
        }
        window.state.dashboardSiteKey = siteKey;

        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
        window.showToast(
            `「${roundLabel}」 회차를 휴지통으로 옮겼습니다. 30일 내 복원 가능`,
            'success',
            5000
        );
        return true;
    };

    window.openAddDongModal = function() {
        const siteKey = window.state.dashboardSiteKey;
        const roundKey = window.state.dashboardRoundKey;
        if (!siteKey || !roundKey) {
            window.showToast('동을 추가할 회차를 먼저 열어 주세요.', 'warning');
            return;
        }
        if (!isSiteMultiDong(siteKey)) {
            window.showToast('이 현장은 단일 건물로 설정되어 있습니다. 수정 화면에서 「여러 동」으로 바꾼 뒤 동을 추가해 주세요.', 'warning', 5500);
            return;
        }
        const peers = getSiteBuildingsSorted(siteKey).filter((b) => getBuildingSurveyRoundKey(b) === roundKey);
        if (!peers.length) {
            window.showToast('이 회차에 기준이 될 동이 없습니다.', 'warning');
            return;
        }
        const siteEl = document.getElementById('addDongSiteLabel');
        const roundEl = document.getElementById('addDongRoundLabel');
        const nameEl = document.getElementById('addDongNameInput');
        const srcEl = document.getElementById('addDongCloneSource');
        if (siteEl) siteEl.textContent = siteKey;
        if (roundEl) roundEl.textContent = formatSurveyRoundLabel(roundKey);
        if (nameEl) nameEl.value = '';
        if (srcEl) {
            srcEl.innerHTML = peers.map((b) =>
                `<option value="${escapeHtml(b.id)}">${escapeHtml(formatDongRowLabel(b))}</option>`
            ).join('');
        }
        const cloneEl = document.getElementById('addDongCloneDrawings');
        if (cloneEl) cloneEl.checked = false;
        if (typeof window.syncAddDongCloneSourceVisibility === 'function') {
            window.syncAddDongCloneSourceVisibility();
        }
        const modal = document.getElementById('addDongModal');
        if (modal) modal.classList.add('open');
        setTimeout(() => nameEl?.focus(), 80);
    };

    window.closeAddDongModal = function() {
        const modal = document.getElementById('addDongModal');
        if (modal) modal.classList.remove('open');
    };

    window.confirmAddDongFromHome = async function() {
        const siteKey = window.state.dashboardSiteKey;
        const roundKey = window.state.dashboardRoundKey;
        const dong = normalizeDongLabel(document.getElementById('addDongNameInput')?.value || '');
        if (!siteKey || !roundKey) {
            window.showToast('회차 정보가 없습니다.', 'warning');
            return;
        }
        if (!dong) {
            window.showToast('동 명칭을 입력해 주세요.', 'warning');
            document.getElementById('addDongNameInput')?.focus();
            return;
        }
        if (siteRoundAlreadyHasDong(siteKey, roundKey, dong)) {
            window.showToast(`이 회차에 "${dong}"이(가) 이미 있습니다.`, 'warning', 4000);
            return;
        }
        const sourceId = document.getElementById('addDongCloneSource')?.value;
        const sourceBldg = (window.state.buildings || []).find((b) => b.id === sourceId)
            || getSiteBuildingsSorted(siteKey).find((b) => getBuildingSurveyRoundKey(b) === roundKey);
        if (!sourceBldg) {
            window.showToast('기준 동을 찾을 수 없습니다.', 'warning');
            return;
        }
        const cloneDrawings = !!document.getElementById('addDongCloneDrawings')?.checked;
        const year = sourceBldg.inspectionYear || (String(roundKey).split('_')[0] || '2026년');
        const period = sourceBldg.inspectionPeriod || (String(roundKey).split('_').slice(1).join('_') || '하반기');

        window.closeAddDongModal();
        window.showLoading('동 추가 중…');
        try {
            if (cloneDrawings) {
                await archiveBuildingPdfsToSiteVault(sourceBldg);
            }
            const newBuildingId = 'bldg-' + Date.now();
            const newBldg = {
                id: newBuildingId,
                _pendingCloudSync: true,
                siteName: siteKey,
                dong,
                multiDong: true,
                name: composeBuildingStorageName(siteKey, dong),
                address: sourceBldg.address || '',
                inspector: sourceBldg.inspector || window.state.userName || '점검자',
                contactPhone: sourceBldg.contactPhone || '',
                date: new Date().toISOString().split('T')[0],
                floors: cloneDrawings ? (sourceBldg.floors || '') : '',
                inspectionType: sourceBldg.inspectionType || '정밀안전점검',
                inspectionYear: year,
                inspectionPeriod: period,
                latestSurveyRoundKey: roundKey,
                siteVaultKey: siteVaultDocId(siteKey),
                structureType: sourceBldg.structureType || '',
                facilityGrade: sourceBldg.facilityGrade || '',
                completionDate: sourceBldg.completionDate || '',
                notes: sourceBldg.notes || '',
                floorsList: cloneDrawings ? JSON.parse(JSON.stringify(sourceBldg.floorsList || [])) : [],
                floorDrawings: {},
                floorDrawingPdfs: {},
                floorDrawingTiers: {},
                floorDrawingSources: {}
            };
            if (cloneDrawings) {
                await cloneBuildingDataFromSource(sourceBldg, newBldg, {
                    floorsDrawings: true,
                    defects: false,
                    ndt: false,
                    mapStyles: true,
                    merge: false
                }, (msg) => {
                    if (typeof window.updateLoadingText === 'function') window.updateLoadingText(msg);
                });
                await hydrateBuildingPdfsFromSiteVault(newBldg);
                await persistBuildingDrawingAssetsNow(newBldg);
            }
            if (!window.state.buildings) window.state.buildings = [];
            window.state.buildings.unshift(newBldg);
            setSiteMultiDongFlag(siteKey, true);
            saveStateToLocalStorage();
            if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
            window.state.dashboardSiteKey = siteKey;
            window.state.dashboardRoundKey = roundKey;
            if (typeof renderDashboard === 'function') renderDashboard();
            window.showToast(`${dong} 추가 완료`, 'success');
        } catch (err) {
            console.error('동 추가 오류:', err);
            window.showToast('동 추가 중 오류가 발생했습니다.', 'error');
        } finally {
            window.hideLoading();
        }
    };

    window.confirmAddSurveyRoundFromHome = async function() {
        const siteKey = window.state.dashboardSiteKey;
        const sourceId = window._addSurveyRoundSourceId;
        const sourceBldg = (window.state.buildings || []).find((b) => b.id === sourceId)
            || getSiteBuildingsSorted(siteKey)[0];
        if (!siteKey || !sourceBldg) {
            window.showToast('기준 회차를 찾을 수 없습니다.', 'warning');
            return;
        }
        const year = document.getElementById('addSurveyRoundYear')?.value || '2026년';
        const period = document.getElementById('addSurveyRoundPeriod')?.value || '하반기';
        const inspectionType = document.getElementById('addSurveyRoundType')?.value
            || sourceBldg.inspectionType || '정밀안전점검';
        if (siteAlreadyHasRound(siteKey, year, period)) {
            window.showToast(`${year} ${period} 회차가 이미 있습니다. 다른 회차를 선택해 주세요.`, 'warning', 4500);
            return;
        }
        const latestKey = getBuildingSurveyRoundKey(sourceBldg);
        const peers = getSiteBuildingsSorted(siteKey).filter((b) => getBuildingSurveyRoundKey(b) === latestKey);
        const sources = peers.length ? peers : [sourceBldg];
        const defectCount = sources.reduce((n, b) => n + countBuildingDefects(b), 0);
        const dongHint = sources.length > 1
            ? `\n· 포함 동: ${sources.map(formatDongRowLabel).join(', ')} (${sources.length}개 동 모두 복사)`
            : '';
        if (!await window.appConfirm(
            `회차를 추가할까요?\n\n` +
            `· 현장: ${siteKey}\n` +
            `· 기준: ${formatSurveyRoundLabel(latestKey)}\n` +
            `· 새 회차: ${year} ${period} (${inspectionType})` +
            `${dongHint}\n\n` +
            `도면·결함(${defectCount}건, 전회차)·NDT를 복사한 새 점검이 만들어집니다.`
        )) return;

        window.closeAddSurveyRoundModal();
        let createdCount = 0;
        for (const src of sources) {
            const created = await createSurveyRoundBuildingFromSource(src, year, period, {
                closeEditModal: false,
                selectAfter: false,
                inspectionType
            });
            if (created) createdCount += 1;
        }
        if (createdCount > 0) {
            window.state.dashboardSiteKey = siteKey;
            window.state.dashboardRoundKey = `${year}_${period}`;
            if (typeof renderDashboard === 'function') renderDashboard();
            window.showToast(
                `${year} ${period} 회차 추가 · 동 ${createdCount}개 복사`,
                'success',
                5500
            );
        }
    };

    // 건물별 "최신 회차"를 앞으로만 전진시킨다. 상단 "점검 설정" 드롭다운을 보고서
    // 미리보기 등으로 잠깐 과거 회차로 바꿔도 이 값은 되돌아가지 않으므로, 이미
    // 전회차로 분류된 결함이 드롭다운 변경만으로 다시 금회차로 돌아오지 않는다.
    // "수시점검"은 순서 비교 대상이 아니라 이 값을 전진시키지 않는다.
    function advanceLatestSurveyRound(bldg, candidateKey) {
        if (!bldg || !candidateKey) return;
        const candidateRank = getSurveyRoundOrderRank(candidateKey);
        if (candidateRank === null) return;
        const currentRank = getSurveyRoundOrderRank(bldg.latestSurveyRoundKey);
        if (currentRank === null || candidateRank > currentRank) {
            bldg.latestSurveyRoundKey = candidateKey;
        }
    }

    // 이 건물에 실제로 등록된 결함들의 surveyRound 중 가장 최신 값을 찾는다.
    // "최신 회차" 최초 부트스트랩에 상단 드롭다운(언제든 미리보기 등으로 바뀔 수 있는 값)
    // 대신 이 값을 우선 사용해, 드롭다운을 잠깐 건드린 이력이 남아있어도 영향받지 않게 한다.
    function getMaxSurveyRoundKeyForBuilding(bldg) {
        if (!bldg) return null;
        const prefix = `${bldg.id}_`;
        let bestKey = null, bestRank = null;
        Object.keys(state.defects).forEach(k => {
            if (!k.startsWith(prefix)) return;
            (state.defects[k] || []).forEach(d => {
                const rank = getSurveyRoundOrderRank(d.surveyRound);
                if (rank === null) return;
                if (bestRank === null || rank > bestRank) { bestRank = rank; bestKey = d.surveyRound; }
            });
        });
        return bestKey;
    }

