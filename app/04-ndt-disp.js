// @@app-part 04-ndt-disp.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 바닥 수직변위: 그룹(NO.박스) + 다중 레벨 포인트 데이터 ---
    const NDT_DISPLACEMENT_COLORS = ['#ef4444', '#525252', '#f97316', '#22c55e', '#a855f7', '#eab308', '#06b6d4', '#ec4899'];
    const NDT_GRADE_BADGES = {
        'a등급': '<span class="badge" style="background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid rgba(34,197,94,0.4); font-weight:800;">a등급 (1/750이상)</span>',
        'b등급': '<span class="badge" style="background:rgba(56,189,248,0.2); color:#6b6b6b; border:1px solid rgba(56,189,248,0.4); font-weight:800;">b등급 (1/500이하)</span>',
        'c등급': '<span class="badge" style="background:rgba(250,204,21,0.2); color:#facc15; border:1px solid rgba(250,204,21,0.4); font-weight:800;">c등급 (1/250이하)</span>',
        'd등급': '<span class="badge" style="background:rgba(249,115,22,0.2); color:#fb923c; border:1px solid rgba(249,115,22,0.4); font-weight:800;">d등급 (1/150이하)</span>',
        'e등급': '<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-weight:800;">e등급 (1/150초과)</span>'
    };

    function getCurrentFloorDisplacementGroups(cat = null) {
        if (!state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtDisplacementGroups) state.ndtDisplacementGroups = {};
        if (!state.ndtDisplacementGroups[key]) state.ndtDisplacementGroups[key] = [];
        const groups = state.ndtDisplacementGroups[key];
        const targetCat = cat || currentNdtCategory || '변위';
        if (targetCat === '부재변위') {
            return groups.filter(g => g.category === '부재변위');
        } else if (targetCat === '변위') {
            return groups.filter(g => !g.category || g.category === '변위');
        }
        return groups;
    }

    // 부동침하/부재변위 그룹 번호도 결함위치도·비파괴조사 NO.와 같은 이유로 건물 전체(층 무관,
    // 카테고리별)로 센다 — 1층에서 NO.03까지 썼으면 5층은 NO.04부터 시작해야 한다.
    function getAllFloorsDisplacementGroups(buildingId, cat = null) {
        if (!buildingId || !state.ndtDisplacementGroups) return [];
        const floorCodes = listNdtFloorCodesForBuilding(buildingId);
        const targetCat = cat || currentNdtCategory || '변위';
        const seen = new Set();
        const out = [];
        floorCodes.forEach(fc => {
            if (seen.has(fc)) return;
            seen.add(fc);
            const groups = state.ndtDisplacementGroups[`${buildingId}_${fc}`] || [];
            const filtered = targetCat === '부재변위'
                ? groups.filter(g => g.category === '부재변위')
                : targetCat === '변위'
                    ? groups.filter(g => !g.category || g.category === '변위')
                    : groups;
            out.push(...filtered);
        });
        return out;
    }

    function nextDisplacementGroupNo(cat = null) {
        const groups = getAllFloorsDisplacementGroups(state.currentBuildingId, cat);
        return `NO.${String(groups.length + 1).padStart(2, '0')}`;
    }

    /** 부동침하/부재변위: 지정한 측정 구역에 이어서 지점 번호를 늘리기 위한 활성 구역 */
    function getActiveNdtDispGroup() {
        const id = window._activeNdtDispGroupId;
        if (!id) return null;
        return getCurrentFloorDisplacementGroups(currentNdtCategory).find(g => g.id === id) || null;
    }

    function setActiveNdtDispGroup(groupOrId) {
        if (!groupOrId) {
            window._activeNdtDispGroupId = null;
            window._ndtDisplacementTemplate = null;
            return null;
        }
        const id = typeof groupOrId === 'string' ? groupOrId : groupOrId.id;
        window._activeNdtDispGroupId = id;
        const g = getActiveNdtDispGroup();
        if (!g) {
            window._activeNdtDispGroupId = null;
            window._ndtDisplacementTemplate = null;
            return null;
        }
        window._ndtDisplacementTemplate = {
            groupId: g.id,
            groupNo: g.groupNo,
            locationType: g.locationType,
            nextPointNo: (g.points || []).length + 1
        };
        return g;
    }

    function refreshNdtDispActiveTemplate() {
        const g = getActiveNdtDispGroup();
        if (g) setActiveNdtDispGroup(g);
        else window._ndtDisplacementTemplate = null;
    }

    // 외벽 기울기: 높이 H(mm) 대비 변위량(mm)으로 1/H 기울기 비율과 기울기 안전등급 산정
    // H·변위가 없으면 비율/등급을 채우지 않음 (기본 H=3000 등 가정값 사용 안 함)
    // 등급 계산식은 js/core/ndt-grade.js에 있다 — 통계 탭도 같은 식을 써야 해서 옮겼다.
    // 두 벌로 두면 기준이 어긋나도 알아채기 어렵다.
    function calcTiltGrade(lengthMm, deltaMm) {
        return window.BSA.ndtGrade.calcTiltGrade(lengthMm, deltaMm);
    }

    function calcMemberDispGrade(lengthMm, deltaMm, hasMinorDamage = false) {
        return window.BSA.ndtGrade.calcMemberDispGrade(lengthMm, deltaMm, hasMinorDamage);
    }

    // 설계/실측 치수 입력칸 하나에 "400*400"처럼 폭*춤을 한번에 적어도 되고, 폭/춤 칸을
    // 따로 나눠 적어도 되게 한다. 폭 칸에 구분자(×,x,X,*)가 있으면 그걸 폭/춤으로 쪼개고,
    // 없으면 폭 칸은 숫자만 뽑아 폭으로, 춤 칸은 따로 파싱한다.
    function parseNdtDimensionPair(rawWidth, rawDepth) {
        const wStr = (rawWidth || '').toString().trim();
        const parts = wStr.split(/[×xX*]/).map(s => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            const w = parseFloat(parts[0]);
            const d = parseFloat(parts[1]);
            return { w: isNaN(w) ? null : w, d: isNaN(d) ? null : d };
        }
        const w = parseFloat(wStr.replace(/[^0-9.]/g, ''));
        const d = parseFloat((rawDepth || '').toString().replace(/[^0-9.]/g, ''));
        return { w: isNaN(w) ? null : w, d: isNaN(d) ? null : d };
    }

    function parseNdtDimNumber(raw) {
        const n = parseFloat(String(raw ?? '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    // 철골 H형 단면: 웨브(두께)·플렌지(두께)·웨브폭(H)·플렌지폭(B)
    function isNdtSteelComponent(name) {
        const t = String(name || '');
        return t.includes('철골');
    }

    // 부재 실측 치수 입력 방식: steel | beam(폭×춤) | column(정면·측면) | circle(지름) | thickness(두께만)
    function getNdtMeasureDimKind(name) {
        const t = String(name || '').trim();
        if (isNdtSteelComponent(t)) return 'steel';
        if (/슬래브|벽체/.test(t)) return 'thickness';
        if (/원형/.test(t)) return 'circle';
        if (/기둥/.test(t)) return 'column';
        if (/보|거더|빔/.test(t)) return 'beam';
        return 'beam';
    }

    // 2026-10-21 「기둥」도 단면 모양 사각/원형을 고를 수 있게 — 원형이면 지름 하나(Φ), 저장은 measureDimMode 'circle'
    let ndtColumnShapeCircle = false;
    function resolveNdtFormDimKind(componentName, circleOn) {
        const k = getNdtMeasureDimKind(componentName);
        return (k === 'column' && circleOn) ? 'circle' : k;
    }
    function getNdtFormDimKind() {
        return resolveNdtFormDimKind(getNdtCurrentComponentName(), ndtColumnShapeCircle);
    }
    window.resolveNdtFormDimKind = resolveNdtFormDimKind;

    function ensureNdtColumnShapeRow() {
        let row = document.getElementById('ndtColumnShapeRow');
        if (row) return row;
        const anchor = document.getElementById('ndtMeasureRcDesignBlock');
        if (!anchor || !anchor.parentNode) return null;
        row = document.createElement('div');
        row.id = 'ndtColumnShapeRow';
        row.className = 'ndt-column-shape-row';
        row.innerHTML = '<span class="ndt-column-shape-label">기둥 단면</span>'
            + '<button type="button" class="ndt-column-shape-btn" data-shape="rect">▭ 사각 (정면×측면)</button>'
            + '<button type="button" class="ndt-column-shape-btn" data-shape="circle">◯ 원형 (지름 Φ)</button>';
        anchor.parentNode.insertBefore(row, anchor);
        row.addEventListener('click', (e) => {
            const btn = e.target.closest('.ndt-column-shape-btn');
            if (!btn) return;
            const on = btn.getAttribute('data-shape') === 'circle';
            if (on === ndtColumnShapeCircle) return;
            ndtColumnShapeCircle = on;
            const dd = document.getElementById('ndtDesignDepth');
            const md = document.getElementById('ndtMeasuredDepth');
            if (on) { if (dd) dd.value = ''; if (md) md.value = ''; }
            toggleNdtMeasureDimMode();
            const dw = document.getElementById('ndtDesignWidth');
            if (dw) dw.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return row;
    }

    function syncNdtColumnShapeRow() {
        const row = ensureNdtColumnShapeRow();
        if (!row) return;
        const base = getNdtMeasureDimKind(getNdtCurrentComponentName());
        row.hidden = base !== 'column';
        row.style.display = base === 'column' ? '' : 'none';
        row.querySelectorAll('.ndt-column-shape-btn').forEach((b) => {
            const isC = b.getAttribute('data-shape') === 'circle';
            b.classList.toggle('active', isC === ndtColumnShapeCircle);
        });
    }

    const NDT_DIM_LABELS = {
        beam: {
            designPrimary: '📐 설계 폭 (mm)',
            designSecondary: '📐 설계 춤 (mm)',
            measuredPrimary: '📐 실측 폭 (mm)',
            measuredSecondary: '📐 실측 춤 (mm)',
            designPrimaryPh: '예: 400',
            designSecondaryPh: '예: 600',
            measuredPrimaryPh: '예: 396',
            measuredSecondaryPh: '예: 598'
        },
        column: {
            designPrimary: '📐 설계 정면폭 (mm)',
            designSecondary: '📐 설계 측면폭 (mm)',
            measuredPrimary: '📐 실측 정면폭 (mm)',
            measuredSecondary: '📐 실측 측면폭 (mm)',
            designPrimaryPh: '예: 600',
            designSecondaryPh: '예: 600',
            measuredPrimaryPh: '예: 595',
            measuredSecondaryPh: '예: 595'
        },
        thickness: {
            designPrimary: '📐 설계 두께 (mm)',
            designSecondary: '',
            measuredPrimary: '📐 실측 두께 (mm)',
            measuredSecondary: '',
            designPrimaryPh: '예: 200',
            designSecondaryPh: '',
            measuredPrimaryPh: '예: 198',
            measuredSecondaryPh: ''
        },
        circle: {
            designPrimary: '📐 설계 지름 (mm)',
            designSecondary: '',
            measuredPrimary: '📐 실측 지름 (mm)',
            measuredSecondary: '',
            designPrimaryPh: '예: 500',
            designSecondaryPh: '',
            measuredPrimaryPh: '예: 497',
            measuredSecondaryPh: ''
        }
    };

    function applyNdtDimLabels(kind) {
        const labels = NDT_DIM_LABELS[kind] || NDT_DIM_LABELS.beam;
        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text || '';
        };
        set('lblNdtDesignPrimary', labels.designPrimary);
        set('lblNdtDesignSecondary', labels.designSecondary);
        set('lblNdtMeasuredPrimary', labels.measuredPrimary);
        set('lblNdtMeasuredSecondary', labels.measuredSecondary);
        const dw = document.getElementById('ndtDesignWidth');
        const dd = document.getElementById('ndtDesignDepth');
        const mw = document.getElementById('ndtMeasuredWidth');
        const md = document.getElementById('ndtMeasuredDepth');
        if (dw) dw.placeholder = labels.designPrimaryPh || '';
        if (dd) dd.placeholder = labels.designSecondaryPh || '';
        if (mw) mw.placeholder = labels.measuredPrimaryPh || '';
        if (md) md.placeholder = labels.measuredSecondaryPh || '';
    }

    function getNdtCurrentComponentName() {
        return getDefectComboValue(
            document.getElementById('ndtComponent'),
            document.getElementById('ndtComponentInput')
        ) || '';
    }

    function toggleNdtMeasureDimMode() {
        try { syncNdtColumnShapeRow(); } catch (_e) { /* ignore */ }
        const kind = getNdtFormDimKind();
        const rcDesign = document.getElementById('ndtMeasureRcDesignBlock');
        const steelDesign = document.getElementById('ndtMeasureSteelDesignBlock');
        const rcMeasured = document.getElementById('ndtMeasureRcMeasuredBlock');
        const steelMeasured = document.getElementById('ndtMeasureSteelMeasuredBlock');
        const measuredRoot = document.getElementById('groupNdtMeasuredDepth');
        const isSteel = kind === 'steel';
        if (rcDesign) rcDesign.style.display = isSteel ? 'none' : '';
        if (steelDesign) steelDesign.style.display = isSteel ? 'flex' : 'none';
        if (rcMeasured) rcMeasured.style.display = isSteel ? 'none' : '';
        if (steelMeasured) steelMeasured.style.display = isSteel ? 'flex' : 'none';
        [rcDesign, rcMeasured, measuredRoot].forEach(root => {
            if (!root) return;
            root.classList.remove('ndt-dim-beam', 'ndt-dim-column', 'ndt-dim-thickness', 'ndt-dim-circle');
            if (!isSteel) root.classList.add(`ndt-dim-${kind}`);
        });
        const secDesign = document.getElementById('ndtDesignSecondaryGroup');
        const secMeasured = document.getElementById('ndtMeasuredSecondaryGroup');
        const showSecondary = !isSteel && kind !== 'thickness' && kind !== 'circle';
        // display:none 대신 숨김 유지해 2열 그리드(50%) 폭을 설계/실측 동일하게 맞춤
        [secDesign, secMeasured].forEach(el => {
            if (!el) return;
            if (showSecondary) {
                el.style.display = '';
                el.style.visibility = '';
                el.style.pointerEvents = '';
            } else {
                el.style.display = '';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
            }
        });
        if (!isSteel) applyNdtDimLabels(kind);
        refreshNdtMeasureOptsUi(kind);
    }

    // --- 2026-10-19 부재실측 「이쪽만 측정」(보·기둥)·「슬래브 두께 합산」(보) ---
    // 계산은 js/core/ndt-measure-opts.js. 입력창 안 상태는 #ndtMeasureOptsRow의 data-oneside / data-slab.
    function ndtMeasureOptsApi() {
        return (window.BSA && window.BSA.ndtMeasureOpts) || null;
    }

    function ensureNdtMeasureOptsRow() {
        let row = document.getElementById('ndtMeasureOptsRow');
        if (row) return row;
        const anchor = document.getElementById('ndtMeasureRcMeasuredRow');
        if (!anchor || !anchor.parentNode) return null;
        row = document.createElement('div');
        row.id = 'ndtMeasureOptsRow';
        row.className = 'ndt-measure-opts';
        row.innerHTML = '<div class="ndt-mo-group" data-role="oneside">'
            + '<span class="ndt-mo-label">이쪽만 측정</span>'
            + '<button type="button" class="ndt-mo-chip" data-oneside="primary" aria-pressed="false">폭만</button>'
            + '<button type="button" class="ndt-mo-chip" data-oneside="secondary" aria-pressed="false">춤만</button>'
            + '</div>'
            + '<div class="ndt-mo-group" data-role="slab">'
            + '<button type="button" class="ndt-mo-chip" data-role="slab-toggle" aria-pressed="false">슬래브 두께 합산</button>'
            + '<input type="text" inputmode="decimal" id="ndtSlabThickness" class="form-control ndt-mo-slab-input" placeholder="슬래브 두께 (mm)" autocomplete="off" hidden>'
            + '</div>'
            + '<div class="ndt-mo-group" data-role="ex-slab">'
            + '<label class="ndt-mo-check"><input type="checkbox" data-role="ex-slab-on"> 슬래브 두께 제외</label>'
            + '<input type="text" inputmode="decimal" id="ndtExcludeSlabMm" class="form-control ndt-mo-slab-input" placeholder="mm (선택)" autocomplete="off" hidden>'
            + '</div>'
            + '<div class="ndt-mo-group" data-role="ex-ins">'
            + '<label class="ndt-mo-check"><input type="checkbox" data-role="ex-ins-on"> 단열 두께 제외</label>'
            + '<input type="text" inputmode="decimal" id="ndtExcludeInsulationMm" class="form-control ndt-mo-slab-input" placeholder="mm (선택)" autocomplete="off" hidden>'
            + '</div>'
            + '<div class="ndt-mo-group" data-role="ex-wall">'
            + '<label class="ndt-mo-check"><input type="checkbox" data-role="ex-wall-on"> 벽체 두께 제외</label>'
            + '<input type="text" inputmode="decimal" id="ndtExcludeWallMm" class="form-control ndt-mo-slab-input" placeholder="mm (선택)" autocomplete="off" hidden>'
            + '</div>'
            + '<div class="ndt-mo-hint" data-role="hint" hidden></div>';
        anchor.parentNode.insertBefore(row, anchor.nextSibling);
        row.addEventListener('click', (e) => {
            const chip = e.target.closest('.ndt-mo-chip');
            if (!chip || !row.contains(chip)) return;
            e.preventDefault();
            if (chip.dataset.oneside) {
                row.dataset.oneside = row.dataset.oneside === chip.dataset.oneside ? '' : chip.dataset.oneside;
            } else if (chip.dataset.role === 'slab-toggle') {
                row.dataset.slab = row.dataset.slab === '1' ? '' : '1';
                if (row.dataset.slab === '1') {
                    const ex = row.querySelector('[data-role="ex-slab-on"]');
                    if (ex) ex.checked = false;
                }
            }
            refreshNdtMeasureOptsUi();
            if (typeof window.recalcNdtSectionAuto === 'function') window.recalcNdtSectionAuto();
            if (typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
            if (chip.dataset.role === 'slab-toggle' && row.dataset.slab === '1') {
                const inp = document.getElementById('ndtSlabThickness');
                if (inp) { try { inp.focus(); } catch (_e) { /* ignore */ } }
            }
        });
        row.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || t.type !== 'checkbox') return;
            if (t.getAttribute('data-role') === 'ex-slab-on' && t.checked) row.dataset.slab = '';
            refreshNdtMeasureOptsUi();
            if (typeof window.recalcNdtSectionAuto === 'function') window.recalcNdtSectionAuto();
            if (typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
            if (t.checked) {
                const inpId = t.getAttribute('data-role') === 'ex-slab-on' ? 'ndtExcludeSlabMm'
                    : (t.getAttribute('data-role') === 'ex-ins-on' ? 'ndtExcludeInsulationMm' : 'ndtExcludeWallMm');
                const inp = document.getElementById(inpId);
                if (inp) { try { inp.focus(); } catch (_e) { /* ignore */ } }
            }
        });
        ['#ndtSlabThickness', '#ndtExcludeSlabMm', '#ndtExcludeInsulationMm', '#ndtExcludeWallMm'].forEach((sel) => {
            const el = row.querySelector(sel);
            if (el) el.addEventListener('input', () => {
                if (typeof window.recalcNdtSectionAuto === 'function') window.recalcNdtSectionAuto();
            });
        });
        return row;
    }

    function setNdtMeasureOptsUi(o) {
        const row = ensureNdtMeasureOptsRow();
        if (!row) return;
        row.dataset.oneside = (o && (o.oneSide === 'primary' || o.oneSide === 'secondary')) ? o.oneSide : '';
        row.dataset.slab = (o && o.slabOn) ? '1' : '';
        const inp = row.querySelector('#ndtSlabThickness');
        if (inp) inp.value = (o && o.slab != null && o.slab !== '') ? String(o.slab) : '';
        const setChk = (role, on, inpId, mm) => {
            const c = row.querySelector(`[data-role="${role}"]`);
            if (c) c.checked = !!on;
            const i = row.querySelector(inpId);
            if (i) i.value = (mm != null && mm !== '') ? String(mm) : '';
        };
        setChk('ex-slab-on', o && o.excludeSlabOn, '#ndtExcludeSlabMm', o && o.excludeSlabMm);
        setChk('ex-ins-on', o && o.excludeInsulationOn, '#ndtExcludeInsulationMm', o && o.excludeInsulationMm);
        setChk('ex-wall-on', o && o.excludeWallOn, '#ndtExcludeWallMm', o && o.excludeWallMm);
        refreshNdtMeasureOptsUi();
    }

    function readNdtMeasureOptsUi() {
        const row = document.getElementById('ndtMeasureOptsRow');
        if (!row) {
            return {
                oneSide: null, slabOn: false, slab: null,
                excludeSlabOn: false, excludeSlabMm: null,
                excludeInsulationOn: false, excludeInsulationMm: null,
                excludeWallOn: false, excludeWallMm: null
            };
        }
        const val = (sel) => { const el = row.querySelector(sel); return el ? el.value : null; };
        const on = (role) => !!(row.querySelector(`[data-role="${role}"]`) || {}).checked;
        return {
            oneSide: row.dataset.oneside || null,
            slabOn: row.dataset.slab === '1',
            slab: val('#ndtSlabThickness'),
            excludeSlabOn: on('ex-slab-on'),
            excludeSlabMm: val('#ndtExcludeSlabMm'),
            excludeInsulationOn: on('ex-ins-on'),
            excludeInsulationMm: val('#ndtExcludeInsulationMm'),
            excludeWallOn: on('ex-wall-on'),
            excludeWallMm: val('#ndtExcludeWallMm')
        };
    }

    function resolveNdtMeasureOptsFromForm(kind, designW, designD, rawW, rawD) {
        const api = ndtMeasureOptsApi();
        if (!api) return null;
        const ui = readNdtMeasureOptsUi();
        return api.resolveRc({
            kind, designW, designD, rawW, rawD,
            oneSide: ui.oneSide, slabOn: ui.slabOn, slab: ui.slab,
            excludeSlabOn: ui.excludeSlabOn, excludeSlabMm: ui.excludeSlabMm,
            excludeInsulationOn: ui.excludeInsulationOn, excludeInsulationMm: ui.excludeInsulationMm,
            excludeWallOn: ui.excludeWallOn, excludeWallMm: ui.excludeWallMm
        });
    }

    function refreshNdtMeasureOptsUi(kindArg) {
        const row = ensureNdtMeasureOptsRow();
        const api = ndtMeasureOptsApi();
        if (!row || !api) return;
        const kind = kindArg || getNdtFormDimKind();
        const showOne = api.supportsOneSide(kind);
        const showSlab = api.supportsSlab(kind);
        const showExWallKind = typeof api.supportsExcludeWall === 'function' && api.supportsExcludeWall(kind);
        row.hidden = !(showOne || showSlab || showExWallKind);
        if (kind !== 'steel') applyNdtDimLabels(kind);   // 칸 이름·안내를 기본으로 되돌린 뒤 아래에서 고친다
        const names = api.sideNames(kind);
        const os = showOne ? (row.dataset.oneside || '') : '';
        row.querySelectorAll('[data-oneside]').forEach((b) => {
            b.textContent = `${names[b.dataset.oneside]}만`;
            const on = os === b.dataset.oneside;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const oneGroup = row.querySelector('[data-role="oneside"]');
        if (oneGroup) oneGroup.hidden = !showOne;
        const slabOn = showSlab && row.dataset.slab === '1' && os !== 'primary';
        const slabGroup = row.querySelector('[data-role="slab"]');
        if (slabGroup) slabGroup.hidden = !showSlab || os === 'primary';
        const slabBtn = row.querySelector('[data-role="slab-toggle"]');
        if (slabBtn) {
            slabBtn.classList.toggle('active', slabOn);
            slabBtn.setAttribute('aria-pressed', slabOn ? 'true' : 'false');
        }
        const slabInput = row.querySelector('#ndtSlabThickness');
        if (slabInput) slabInput.hidden = !slabOn;
        const showExSlab = showSlab && os !== 'primary' && typeof api.supportsExcludeSlab === 'function' && api.supportsExcludeSlab(kind);
        const showExIns = showSlab && os !== 'primary' && typeof api.supportsExcludeInsulation === 'function' && api.supportsExcludeInsulation(kind);
        const showExWall = typeof api.supportsExcludeWall === 'function' && api.supportsExcludeWall(kind) && os !== 'secondary';
        const visCheck = (groupRole, chkRole, inpSel, show) => {
            const g = row.querySelector(`[data-role="${groupRole}"]`);
            if (g) g.hidden = !show;
            const chk = row.querySelector(`[data-role="${chkRole}"]`);
            const on = show && !!(chk && chk.checked);
            const inp = row.querySelector(inpSel);
            if (inp) inp.hidden = !on;
            if (slabOn && chkRole === 'ex-slab-on' && chk) chk.checked = false;
        };
        visCheck('ex-slab', 'ex-slab-on', '#ndtExcludeSlabMm', showExSlab);
        visCheck('ex-ins', 'ex-ins-on', '#ndtExcludeInsulationMm', showExIns);
        visCheck('ex-wall', 'ex-wall-on', '#ndtExcludeWallMm', showExWall);
        // 안 잰 쪽 칸은 잠근다(값은 지우지 않음 — 다시 끄면 그대로)
        const lock = (el, locked) => {
            if (!el) return;
            el.disabled = !!locked;
            el.classList.toggle('ndt-mo-locked', !!locked);
            if (locked) el.placeholder = '미측정(설계치)';
        };
        lock(document.getElementById('ndtMeasuredWidth'), os === 'secondary');
        lock(document.getElementById('ndtMeasuredDepth'), os === 'primary');
        const lbl = document.getElementById('lblNdtMeasuredSecondary');
        if (lbl && kind === 'beam' && slabOn) lbl.textContent = '📐 실측 춤 — 슬래브 아래 (mm)';
    }

    function updateNdtMeasureOptsHint(mo, rawD) {
        const hint = document.querySelector('#ndtMeasureOptsRow [data-role="hint"]');
        if (!hint) return;
        const parts = [];
        if (mo && mo.slab != null && rawD > 0) parts.push(`실측 춤 = ${rawD} + 슬래브 ${mo.slab} = ${Math.round((rawD + mo.slab) * 100) / 100} mm`);
        if (mo && (mo.excludeSlabMm || mo.excludeInsulationMm) && rawD > 0 && mo.storeD != null) {
            parts.push(`실측 춤 = ${rawD}${mo.excludeSlabMm ? ` − 슬래브 ${mo.excludeSlabMm}` : ''}${mo.excludeInsulationMm ? ` − 단열 ${mo.excludeInsulationMm}` : ''} = ${mo.storeD} mm`);
        }
        if (mo && mo.excludeWallMm && mo.rawW > 0 && mo.storeW != null) {
            parts.push(`실측 폭/지름 = ${mo.rawW} − 벽체 ${mo.excludeWallMm} = ${mo.storeW} mm`);
        }
        if (mo && ((mo.excludeSlabOn && !mo.excludeSlabMm) || (mo.excludeInsulationOn && !mo.excludeInsulationMm) || (mo.excludeWallOn && !mo.excludeWallMm))) {
            parts.push('두께를 비워 두면 실측값은 그대로 두고 제외 표시만 남깁니다');
        }
        if (mo && mo.oneSide) parts.push('안 잰 쪽은 설계치수로 보고 단면적 비율을 냅니다');
        hint.textContent = parts.join(' · ');
        hint.hidden = parts.length === 0;
    }

    // H형강 단면적 ≈ 2·B·tf + tw·(H − 2·tf)
    // 표기 순서: 높이(H) × 폭(B) × 웨브두께(tw) × 플랜지두께(tf)
    function calcSteelSectionArea(web, flange, webWidth, flangeWidth) {
        if (!(web > 0) || !(flange > 0) || !(webWidth > 0) || !(flangeWidth > 0)) return null;
        const clearWeb = Math.max(webWidth - 2 * flange, 0);
        return (2 * flangeWidth * flange) + (web * clearWeb);
    }

    function readNdtSteelDims(prefix) {
        // prefix: 'ndtDesign' | 'ndtMeasured'
        // WebWidth=높이(H), FlangeWidth=폭(B), Web=웨브두께, Flange=플랜지두께
        return {
            web: parseNdtDimNumber(document.getElementById(`${prefix}Web`)?.value),
            flange: parseNdtDimNumber(document.getElementById(`${prefix}Flange`)?.value),
            webWidth: parseNdtDimNumber(document.getElementById(`${prefix}WebWidth`)?.value),
            flangeWidth: parseNdtDimNumber(document.getElementById(`${prefix}FlangeWidth`)?.value)
        };
    }

    /** 철골 실측 칸이 비어 있으면 설계치수 값으로 보정 (칸별 fallback) */
    function resolveNdtSteelMeasuredDims(design, measured) {
        const pick = (m, d) => (m !== null && Number.isFinite(m) ? m : d);
        return {
            web: pick(measured.web, design.web),
            flange: pick(measured.flange, design.flange),
            webWidth: pick(measured.webWidth, design.webWidth),
            flangeWidth: pick(measured.flangeWidth, design.flangeWidth)
        };
    }

    function resolveNdtSteelMeasuredFromItem(item) {
        if (!item) return { web: null, flange: null, webWidth: null, flangeWidth: null };
        return resolveNdtSteelMeasuredDims(
            {
                web: item.designWeb,
                flange: item.designFlange,
                webWidth: item.designWebWidth,
                flangeWidth: item.designFlangeWidth
            },
            {
                web: item.measuredWeb,
                flange: item.measuredFlange,
                webWidth: item.measuredWebWidth,
                flangeWidth: item.measuredFlangeWidth
            }
        );
    }

    function formatNdtSteelDimText(web, flange, webWidth, flangeWidth, joiner = ' × ') {
        // 높이 × 폭 × 웨브 두께 × 플랜지 두께
        const parts = [webWidth, flangeWidth, web, flange];
        if (parts.every(v => v === undefined || v === null || v === '')) return '';
        return parts.map(v => (v === undefined || v === null || v === '') ? '-' : v).join(joiner);
    }

    function formatNdtMeasureDimText(item, kind = 'design', joiner = ' × ') {
        if (!item) return '-';
        const dimMode = (item.measureDimMode === 'rc' || !item.measureDimMode)
            ? getNdtMeasureDimKind(item.component)
            : item.measureDimMode;
        if (dimMode === 'steel') {
            if (kind === 'design') {
                const t = formatNdtSteelDimText(item.designWeb, item.designFlange, item.designWebWidth, item.designFlangeWidth, joiner);
                return t || '-';
            }
            const resolved = resolveNdtSteelMeasuredFromItem(item);
            const t = formatNdtSteelDimText(resolved.web, resolved.flange, resolved.webWidth, resolved.flangeWidth, joiner);
            return t || '-';
        }
        if (dimMode === 'thickness') {
            if (kind === 'design') return item.designWidth != null && item.designWidth !== '' ? String(item.designWidth) : '-';
            const measuredW = (item.measuredWidth !== undefined && item.measuredWidth !== null) ? item.measuredWidth : item.avgValue;
            return measuredW != null && measuredW !== '' ? String(measuredW) : '-';
        }
        if (dimMode === 'circle') {
            // 원형기둥은 폭×춤이 아니라 지름 하나 — 표/보고서에서 폭과 헷갈리지 않게 Φ(지름 기호) 접두
            if (kind === 'design') return item.designWidth != null && item.designWidth !== '' ? `Φ${item.designWidth}` : '-';
            const measuredW = (item.measuredWidth !== undefined && item.measuredWidth !== null) ? item.measuredWidth : item.avgValue;
            return measuredW != null && measuredW !== '' ? `Φ${measuredW}` : '-';
        }
        // 2026-10-19 「이쪽만 측정」 — 안 잰 쪽은 '-'
        const oneSide = (dimMode === 'beam' || dimMode === 'column')
            && (item.measureOneSide === 'primary' || item.measureOneSide === 'secondary') ? item.measureOneSide : null;
        if (kind !== 'design' && oneSide) {
            const has = (v) => v !== undefined && v !== null && v !== '';
            if (oneSide === 'primary') return has(item.measuredWidth) ? `${item.measuredWidth}${joiner}-` : '-';
            return has(item.measuredDepth) ? `-${joiner}${item.measuredDepth}` : '-';
        }
        if (kind === 'design') {
            return item.designWidth ? `${item.designWidth}${item.designDepth ? joiner + item.designDepth : ''}` : '-';
        }
        const measuredW = (item.measuredWidth !== undefined && item.measuredWidth !== null) ? item.measuredWidth : item.avgValue;
        return measuredW ? `${measuredW}${item.measuredDepth ? joiner + item.measuredDepth : ''}` : '-';
    }

    /**
     * 부재실측 단면적(mm²) — 결과표에서 규격 아래 괄호로 보여 준다(2026-09-28 요청).
     * 등급 계산(calcSectionGrade 등)과 같은 식: 사각=폭×춤, 원형=π(d/2)², 철골=H형 단면적.
     * 두께 하나뿐인 부재(슬래브·벽체)나 치수가 모자라면 null — 면적이 아니라서 표시하지 않는다.
     */
    function calcNdtMeasureSectionArea(item, kind = 'design') {
        if (!item) return null;
        const num = (v) => {
            const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
            return Number.isFinite(n) && n > 0 ? n : null;
        };
        const dimMode = (item.measureDimMode === 'rc' || !item.measureDimMode)
            ? getNdtMeasureDimKind(item.component)
            : item.measureDimMode;
        if (dimMode === 'thickness') return null;
        if (dimMode === 'steel') {
            const d = kind === 'design'
                ? { web: item.designWeb, flange: item.designFlange, webWidth: item.designWebWidth, flangeWidth: item.designFlangeWidth }
                : resolveNdtSteelMeasuredFromItem(item);
            const a = calcSteelSectionArea(num(d.web), num(d.flange), num(d.webWidth), num(d.flangeWidth));
            return a > 0 ? a : null;
        }
        // 「이쪽만 측정」이면 안 잰 쪽은 설계치수(단면적 비율 계산과 같은 식)
        const oneSide = kind !== 'design' && (dimMode === 'beam' || dimMode === 'column')
            && (item.measureOneSide === 'primary' || item.measureOneSide === 'secondary') ? item.measureOneSide : null;
        const w = (kind === 'design' || oneSide === 'secondary')
            ? num(item.designWidth)
            : num((item.measuredWidth !== undefined && item.measuredWidth !== null) ? item.measuredWidth : item.avgValue);
        if (!w) return null;
        if (dimMode === 'circle') return Math.PI * (w / 2) ** 2;
        const dep = num((kind === 'design' || oneSide === 'primary') ? item.designDepth : item.measuredDepth);
        return dep ? w * dep : null;
    }

    /** "(560,000mm²)" — 면적을 못 구하면 빈 글자 */
    function formatNdtMeasureAreaText(item, kind = 'design') {
        const a = calcNdtMeasureSectionArea(item, kind);
        return a ? `(${Math.round(a).toLocaleString('ko-KR')}mm²)` : '';
    }

    /** 규격 글자 + 줄바꿈 + 단면적 괄호 (면적이 없으면 규격만) */
    function formatNdtMeasureDimWithArea(item, kind, joiner, lineBreak = '\n') {
        const dim = formatNdtMeasureDimText(item, kind, joiner);
        const area = dim && dim !== '-' ? formatNdtMeasureAreaText(item, kind) : '';
        const note = kind === 'design' ? '' : formatNdtMeasureNotes(item, true);
        const out = area ? `${dim}${lineBreak}${area}` : dim;
        return note && dim !== '-' ? `${out}${lineBreak}(${note})` : out;
    }

    /** 실측치 옆 표시 — 「폭만 측정」, 화면이면 「슬래브 150 포함」까지 (2026-10-19) */
    function formatNdtMeasureNotes(item, withSlab) {
        const api = (typeof window !== 'undefined' && window.BSA && window.BSA.ndtMeasureOpts) || null;
        if (!api || !item) return '';
        const dimMode = (item.measureDimMode === 'rc' || !item.measureDimMode)
            ? getNdtMeasureDimKind(item.component)
            : item.measureDimMode;
        return [api.oneSideNote(item, dimMode), withSlab ? api.slabNote(item, dimMode) : '',
            typeof api.excludeNote === 'function' ? api.excludeNote(item, dimMode) : ''].filter(Boolean).join(' · ');
    }

    /**
     * 한글·보고서용 규격 — 단면적(mm²) 괄호는 앱 화면에서만 보이고 출력하지 않는다(2026-10-19 요청).
     * 「이쪽만 측정」 표시는 출력에도 남긴다(안 잰 쪽이 '-'인 이유).
     */
    function formatNdtMeasureDimForOutput(item, kind, joiner, lineBreak = '\n') {
        const dim = formatNdtMeasureDimText(item, kind, joiner);
        const note = kind === 'design' ? '' : formatNdtMeasureNotes(item, false);
        return note && dim !== '-' ? `${dim}${lineBreak}(${note})` : dim;
    }

    // 콘크리트 부재단면의 규격: 시설물의 안전 및 유지관리 실시 세부지침(건축물편) [표 6.24]
    // c(%) = (측정단면적 ÷ 설계단면적) × 100. a: 100%이상, b: 95%이상, c: 90%이상, d: 75%이상, e: 75%미만.
    // 춤(depth)이 없는 단일치수 부재(슬래브 두께 등)는 면적 대신 그 치수 자체의 비율로 계산한다.
    // 철골은 H형 단면적으로 동일 표 기준을 적용한다.
    function calcSectionGrade(designW, designD, measuredW, measuredD) {
        if (!(designW > 0) || !(measuredW > 0)) return null;
        const designArea = designD > 0 ? designW * designD : designW;
        const measuredArea = measuredD > 0 ? measuredW * measuredD : measuredW;
        return gradeFromSectionRatio((measuredArea / designArea) * 100);
    }

    // 원형기둥: 단면적은 지름의 제곱에 비례(π(d/2)²) — 정사각형처럼 폭×춤이 아니라
    // 지름 하나만 입력받고, 여기서 면적으로 환산해 동일한 등급 기준(a~e)을 적용한다.
    function calcCircleSectionGrade(designDiameter, measuredDiameter) {
        if (!(designDiameter > 0) || !(measuredDiameter > 0)) return null;
        const designArea = Math.PI * (designDiameter / 2) ** 2;
        const measuredArea = Math.PI * (measuredDiameter / 2) ** 2;
        return gradeFromSectionRatio((measuredArea / designArea) * 100);
    }

    function calcSteelSectionGrade(design, measured) {
        const designArea = calcSteelSectionArea(design.web, design.flange, design.webWidth, design.flangeWidth);
        const measuredArea = calcSteelSectionArea(measured.web, measured.flange, measured.webWidth, measured.flangeWidth);
        if (!(designArea > 0) || !(measuredArea > 0)) return null;
        return gradeFromSectionRatio((measuredArea / designArea) * 100);
    }

    // 등급 기준은 통계와 같이 쓰려고 js/core/ndt-grade.js 한 곳에 둔다
    function gradeFromSectionRatio(ratio) {
        return window.BSA.ndtGrade.sectionRatioGrade(ratio) || { ratio, code: 'e' };
    }

    // 레벨 미입력(null/빈값) 허용 — 마크 우선 UX에서 먼저 지점만 찍고 나중에 일괄 입력
    function isNdtDispLevelFilled(level) {
        return window.BSA.ndtGrade.isLevelFilled(level);
    }

    function ndtDispGroupLevelsComplete(group) {
        return window.BSA.ndtGrade.groupLevelsComplete(group);
    }

    function calcGroupDisplacement(group) {
        return window.BSA.ndtGrade.calcGroupDisplacement(group);
    }

    /** 구역 레벨값 단위: 'mm'(새 구역) 또는 'cm'(levelUnit 없는 옛 구역) */
    function ndtDispLevelUnit(group) {
        return window.BSA.ndtGrade.levelUnitOf(group);
    }

    // ---- 측기 이동 보정(2026-10-12 재설계, js/core/ndt-disp-transfer.js) ----
    // 적은 레벨은 그대로 두고, 계산·그래프·보고서 값만 보정한다.
    function ndtDispTransferApi() { return window.BSA && window.BSA.ndtDispTransfer; }
    /** 계산에 쓰는(보정한) 레벨 배열 */
    function ndtDispCalcLevels(group) {
        return window.BSA.ndtGrade.calcLevels(group);
    }
    /** 표시: 적은 값이 먼저, 보정으로 달라졌으면 「→ 보정값」 */
    function formatNdtDispLevelText(group, idx, unit) {
        const u = unit == null ? ndtDispLevelUnit(group) : unit;
        const p = (group.points || [])[idx];
        const c = ndtDispCalcLevels(group)[idx];
        const raw = p && isNdtDispLevelFilled(p.level) ? Number(p.level) : null;
        const fmt = (v) => `${Math.round(v * 1000) / 1000}`;
        if (raw == null && c == null) return '-';
        if (raw == null) return `(보정 ${fmt(c)}${u})`;
        if (c == null || Math.abs(c - raw) < 1e-9) return `${fmt(raw)}${u}`;
        return `${fmt(raw)}${u} → ${fmt(c)}${u}`;
    }
    /** 옛 「적용」이 고쳐 둔 값을 원래 적은 값으로 되돌리고 보정 기록(Va/Vb)만 남긴다. 바꾼 구역 수 */
    function migrateNdtDispTransfersForFloor(key) {
        const api = ndtDispTransferApi();
        const groups = ((state.ndtDisplacementGroups || {})[key]) || [];
        if (!api || !groups.length) return 0;
        let n = 0;
        groups.forEach((g) => {
            if (api.migrateLegacyGroup(g)) {
                n += 1;
                if (typeof touchNdtDispGroup === 'function') touchNdtDispGroup(g);
            }
        });
        if (n) {
            console.info('[부동침하] 옛 이동 보정 기록을 계산 방식으로 옮김:', key, n + '구역');
            saveStateToLocalStorage();
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        }
        return n;
    }

    function formatDispCalcForExport(calc) {
        if (!calc || calc.incomplete) {
            return { delta: '-', deltaCm: '-', tiltRatio: '-', grade: '미입력' };
        }
        // delta: mm 값(표 머리글 "(mm)"과 일치). deltaCm: 이름은 옛 그대로지만 구역 단위(mm/cm)를 붙인 값.
        const unit = calc.unit || 'cm';
        const deltaMm = (calc.deltaMm != null) ? calc.deltaMm : calc.delta * 10;
        return {
            delta: deltaMm.toFixed(1),
            deltaCm: `${calc.delta.toFixed(1)}${unit}`,
            tiltRatio: calc.tiltRatio || '-',
            grade: calc.grade || '-'
        };
    }

    /** MARK 모드: 모달 없이 측정 지점을 즉시 배치 (레벨은 나중에 구역 편집에서 일괄 입력) */
    function placeNdtDisplacementMarkAt(imgX, imgY) {
        if (!state.currentBuildingId) {
            window.showToast('건물을 먼저 선택해 주세요.', 'warning');
            return null;
        }
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtDisplacementGroups) state.ndtDisplacementGroups = {};
        if (!state.ndtDisplacementGroups[key]) state.ndtDisplacementGroups[key] = [];
        const groups = state.ndtDisplacementGroups[key];
        const cat = currentNdtCategory === '부재변위' ? '부재변위' : '변위';

        let group = getActiveNdtDispGroup();
        if (group) {
            const gCat = group.category || '변위';
            if (gCat !== cat) {
                group = null;
                setActiveNdtDispGroup(null);
            }
        }

        const point = { id: `ndtp_${Date.now()}`, x: imgX, y: imgY, level: null };

        if (group) {
            group.points.push(point);
            group.updatedAt = Date.now();
            setActiveNdtDispGroup(group);
            recordNdtDispMarkUndo({
                key, groupId: group.id, pointId: point.id, createdGroup: false
            });
            saveStateToLocalStorage();
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
            drawNdtCanvas();
            renderNdtSummaryTable();
            return { group, point };
        }

        const color = NDT_DISPLACEMENT_COLORS[groups.length % NDT_DISPLACEMENT_COLORS.length];
        group = {
            id: `ndtg_${Date.now()}`,
            category: cat,
            groupNo: nextDisplacementGroupNo(cat),
            locationType: '보',
            measureLength: null,
            levelUnit: 'mm',
            hasMinorDamage: false,
            color,
            boxX: imgX - 40,
            boxY: imgY - 50,
            points: [point],
            updatedAt: Date.now()
        };
        groups.push(group);
        setActiveNdtDispGroup(group);
        recordNdtDispMarkUndo({
            key, groupId: group.id, pointId: point.id, createdGroup: true
        });
        saveStateToLocalStorage();
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        drawNdtCanvas();
        renderNdtSummaryTable();
        window.showToast(`${group.groupNo} 구역 시작 · 위치·길이는 NO.박스를 눌러 입력`, 'info', 3600);
        return { group, point };
    }
    window.placeNdtDisplacementMarkAt = placeNdtDisplacementMarkAt;

    /** 마킹을 찍자마자 그 지점의 레벨 입력창을 연다 */
    function placeNdtDisplacementMarkAndEdit(imgX, imgY) {
        const placed = placeNdtDisplacementMarkAt(imgX, imgY);
        if (placed) openNdtDisplacementModal(imgX, imgY, placed.group, placed.point);
    }

    // 수직변위/부재변위 그룹의 라벨 박스/포인트 원 히트테스트
    function findNdtDisplacementHit(vx, vy, opts) {
        const boxOnly = !!(opts && opts.boxOnly);
        const groups = getCurrentFloorDisplacementGroups(currentNdtCategory);
        const viewScale = getMapCanvasViewScale();
        const minMouseRadiusImg = 18 / viewScale; // 화면상 최소 18px 반경 (지름 36px 클릭 영역 확보)
        const counterAngle = ndtRotationAngle === 90 ? -90 : (ndtRotationAngle === 180 ? -180 : (ndtRotationAngle === 270 ? -270 : 0));
        const rotRad = (counterAngle * Math.PI) / 180;

        const dispCands = []; // 2026-10-21 박스 먼저(고른 구역 먼저) — pickNdtBoxFirst
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const dispCand = { key: group.id ? ndtDispSelKey(group.id) : '', group, box: false, tipDist: Infinity, point: null };
            const groupSize = getStyleSize(group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement');
            const pinScale = groupSize.pin || 1;
            const ptHitRadius = Math.max(16 * pinScale, minMouseRadiusImg);

            // 포인트 원과 (01) 번호 라벨 히트테스트 (포인트 우선) — boxOnly(터치 박스 먼저)면 건너뜀
            for (let j = boxOnly ? -1 : group.points.length - 1; j >= 0; j--) {
                const p = group.points[j];
                const distDot = Math.hypot(vx - p.x, vy - p.y);
                
                // (01) 라벨 위치: drawNdtDisplacementGroup에서 r + 2*pinScale 아래에 baseline 'top'으로 그려짐
                const labelDist = (5 + 8) * pinScale;
                const labelX = p.x - labelDist * Math.sin(rotRad);
                const labelY = p.y + labelDist * Math.cos(rotRad);
                const distLabel = Math.hypot(vx - labelX, vy - labelY);

                if (distDot <= ptHitRadius || distLabel <= ptHitRadius) {
                    const dd = Math.min(distDot, distLabel);
                    if (dd < dispCand.tipDist) { dispCand.tipDist = dd; dispCand.point = p; }
                }
            }

            const bx = group.boxX !== undefined ? group.boxX : (group.points[0] ? group.points[0].x : 100);
            const by = group.boxY !== undefined ? group.boxY : (group.points[0] ? group.points[0].y : 100);
            const groupStyleKey = group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement';
            let groupNoStr = formatPinNumberLabel(group.groupNo || 'NO.01', groupStyleKey);
            const groupDim = measurePinBoxDimensions(state.ctx || null, groupNoStr, groupSize.pin, 1);
            dispCand.box = isPointInsideMarkBox(vx, vy, bx, by, groupDim.w, groupDim.h, ndtRotationAngle || 0);
            if (dispCand.box || dispCand.point) dispCands.push(dispCand);
        }
        const pick = pickNdtBoxFirst(dispCands);
        if (!pick) return null;
        const dc = dispCands[pick.index];
        return pick.part === 'box' ? { type: 'box', group: dc.group } : { type: 'point', group: dc.group, point: dc.point };
    }

    function setupNdtCanvas() {
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas) return;
        resizeNdtCanvas();
        loadFloorNdtDrawing();
        initNdtEvents();
    }

    function resizeNdtCanvas() {
        const container = document.getElementById('ndtCanvasContainer');
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas || !container) return;

        const prevFit = getNdtFitScale();
        const prevScale = ndtView.scale || 1;
        const prevZoomVsFit = prevFit > 0 ? prevScale / prevFit : 1;
        const preserveZoom = !!(ndtBgImage && prevZoomVsFit > 1.05);
        const oldScale = prevScale;
        const oldOffX = ndtView.offsetX;
        const oldOffY = ndtView.offsetY;
        const oldCw = window._ndtCanvasCssW || canvas.clientWidth || 800;
        const oldCh = window._ndtCanvasCssH || canvas.clientHeight || 600;
        const focalX = oldCw / 2;
        const focalY = oldCh / 2;
        const imgX = (focalX - oldOffX) / Math.max(oldScale, 0.001);
        const imgY = (focalY - oldOffY) / Math.max(oldScale, 0.001);

        let cssW = container.clientWidth || container.offsetWidth || (window.innerWidth - 40);
        let cssH = container.clientHeight || container.offsetHeight;
        const isMobile = layoutIsMobileWidth();
        if (cssH <= 50) cssH = isMobile ? 360 : 420;

        cssW = Math.max(1, Math.floor(cssW));
        cssH = Math.max(1, Math.floor(cssH));
        const dpr = getSafeCanvasDpr(cssW, cssH);
        const bw = Math.max(1, Math.round(cssW * dpr));
        const bh = Math.max(1, Math.round(cssH * dpr));

        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        if (canvas.width !== bw || canvas.height !== bh) {
            canvas.width = bw;
            canvas.height = bh;
        }
        window._ndtCanvasDpr = dpr;
        window._ndtCanvasCssW = cssW;
        window._ndtCanvasCssH = cssH;

        if (preserveZoom) {
            const lim = getNdtViewScaleLimits();
            const fit = getNdtFitScale();
            const newScale = Math.min(Math.max(fit * prevZoomVsFit, lim.min), lim.max);
            const newFocalX = cssW / 2;
            const newFocalY = cssH / 2;
            ndtView.scale = newScale;
            ndtView.offsetX = newFocalX - imgX * newScale;
            ndtView.offsetY = newFocalY - imgY * newScale;
            const zoomTxt = document.getElementById('ndtZoomScaleText');
            if (zoomTxt) zoomTxt.textContent = formatNdtZoomLabel();
        }

        drawNdtCanvas();
    }

    /**
     * 비파괴 도면 그림을 바꾼다. 맞춤은 층이나 도면 크기가 바뀔 때만 — 같은 도면의 화질 교체·진하게·
     * 탭 복귀에 쓰던 확대·위치를 맞춤으로 되돌리지 않는다.
     */
    let _ndtFitDrawingSig = '';
    function applyNdtBackgroundImage(img, key) {
        ndtBgImage = img;
        let autoRotated = false;
        if (img.naturalHeight > img.naturalWidth * 1.15 && (ndtRotationAngle === undefined || ndtRotationAngle === 0)) {
            ndtRotationAngle = 90;
            autoRotated = true;
        }
        const dims = getNdtDrawingDims();
        const sig = `${key}|${dims.w}x${dims.h}`;
        if (autoRotated || sig !== _ndtFitDrawingSig) {
            _ndtFitDrawingSig = sig;
            fitNdtCanvas();
        }
        drawNdtCanvas();
    }

    function loadFloorNdtDrawing() {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const ref = ndtDrawingRefFor(key);
        if (ref && ref.id && _ndtImageLoadedId[key] !== ref.id) {
            // 다른 기기가 넣었거나 새로고침 뒤 — 받아 오면 다시 그린다(그 사이엔 층 도면)
            ensureNdtCustomDrawingLoaded(key).then((url) => {
                if (url && `${state.currentBuildingId}_${state.currentFloor}` === key) loadFloorNdtDrawing();
            });
        }
        const customImg = currentNdtCustomDrawingSrc(key);
        const src = customImg || state.bgImage?.src;

        if (src) {
            const img = new Image();
            img.onload = () => applyNdtBackgroundImage(img, key);
            img.src = src;
        } else if (state.bgImage) {
            applyNdtBackgroundImage(state.bgImage, key);
        } else {
            ndtBgImage = null;
            drawNdtCanvas();
        }
    }

    /**
     * 비파괴 도면의 좌표 기준 크기. 층 도면은 결함위치도와 같은 기준(floorPlanRef)을 쓴다 —
     * 받은 그림(티어)의 픽셀 크기를 쓰면 새로고침 뒤 다른 크기 그림이 오는 순간 마킹이 어긋난다.
     * 비파괴 전용 도면은 층 도면과 별개의 그림이라 그 그림 크기가 기준이다.
     */
    function getNdtDrawingDims() {
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (ndtBgImage && currentNdtCustomDrawingSrc(key)) {
            return { w: ndtBgImage.naturalWidth || ndtBgImage.width || 1200, h: ndtBgImage.naturalHeight || ndtBgImage.height || 700 };
        }
        if (ndtBgImage) return getFloorPlanDisplayDims();
        return { w: 1200, h: 700 };
    }

    window.fitNdtCanvas = function() {
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas) return;
        const cw = window._ndtCanvasCssW || canvas.clientWidth || canvas.width;
        const ch = window._ndtCanvasCssH || canvas.clientHeight || canvas.height;
        const { w: imgW, h: imgH } = getNdtDrawingDims();

        const isRotated = (ndtRotationAngle === 90 || ndtRotationAngle === 270);
        const drawW = isRotated ? imgH : imgW;
        const drawH = isRotated ? imgW : imgH;

        ndtView.scale = getNdtFitScale();
        ndtView.offsetX = Math.max(20, (cw - drawW * ndtView.scale) / 2);
        ndtView.offsetY = Math.max(20, (ch - drawH * ndtView.scale) / 2);

        const zoomTxt = document.getElementById('ndtZoomScaleText');
        if (zoomTxt) zoomTxt.textContent = formatNdtZoomLabel();
        drawNdtCanvas();
    };

    function getNdtFitScale() {
        const canvas = document.getElementById('ndtCanvas');
        const cw = window._ndtCanvasCssW || canvas?.clientWidth || canvas?.width || 800;
        const ch = window._ndtCanvasCssH || canvas?.clientHeight || canvas?.height || 600;
        const { w: imgW, h: imgH } = getNdtDrawingDims();
        const isRotated = (ndtRotationAngle === 90 || ndtRotationAngle === 270);
        const drawW = isRotated ? imgH : imgW;
        const drawH = isRotated ? imgW : imgH;
        if (drawW <= 0 || drawH <= 0) return 1;
        return Math.min((cw - 40) / drawW, (ch - 40) / drawH, 1.2);
    }

    function getNdtZoomVsFitPercent() {
        const fit = getNdtFitScale();
        const scale = Math.max(ndtView.scale || 1, 0.001);
        return Math.round((scale / Math.max(fit, 0.001)) * 100);
    }

    function formatNdtZoomLabel() {
        return `${getNdtZoomVsFitPercent()}%`;
    }

    function getNdtViewScaleLimits() {
        return getViewScaleLimits(getNdtFitScale);
    }

    function shouldAutoFitNdtView() {
        const fit = getNdtFitScale();
        return (ndtView.scale || 1) <= fit * 1.08;
    }
    /** 지금 도면을 확대해 둔 상태인가 — 탭에 다시 들어올 때 맞춤으로 되돌릴지 정한다 */
    window.isNdtViewZoomedIn = function() {
        const dims = getNdtDrawingDims();
        const sig = `${state.currentBuildingId}_${state.currentFloor}|${dims.w}x${dims.h}`;
        return sig === _ndtFitDrawingSig && !shouldAutoFitNdtView();
    };

    window.zoomNdtCanvas = function(factor, focalX, focalY) {
        const canvas = document.getElementById('ndtCanvas');
        let fx = focalX;
        let fy = focalY;
        if (fx == null && canvas) {
            fx = (window._ndtCanvasCssW || canvas.clientWidth || canvas.width) / 2;
            fy = (window._ndtCanvasCssH || canvas.clientHeight || canvas.height) / 2;
        }
        if (fx != null && fy != null) {
            applyFocalZoom(ndtView, fx, fy, factor, undefined, undefined, getNdtFitScale);
        } else {
            const lim = getNdtViewScaleLimits();
            ndtView.scale = Math.min(Math.max(lim.min, ndtView.scale * factor), lim.max);
        }
        const zoomTxt = document.getElementById('ndtZoomScaleText');
        if (zoomTxt) zoomTxt.textContent = formatNdtZoomLabel();
        drawNdtCanvas();
    };

    window.rotateNdtDrawing = function() {
        ndtRotationAngle = (ndtRotationAngle + 90) % 360;
        fitNdtCanvas();
        drawNdtCanvas();
    };

    window.setNdtMode = function(mode) {
        ndtMode = mode;
        const btnPan = document.getElementById('btnNdtModePan');
        const btnMark = document.getElementById('btnNdtModeMark');
        if (btnPan) btnPan.classList.toggle('active', mode === 'PAN');
        if (btnMark) btnMark.classList.toggle('active', mode === 'MARK');
        document.querySelectorAll('#mobileNdtSideRail .mobile-rail-btn[data-ndt-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.ndtMode === mode);
        });
        const canvas = document.getElementById('ndtCanvas');
        if (canvas) canvas.style.cursor = mode === 'MARK' ? 'crosshair' : 'default';
    };

    window.setNdtCategory = function(cat) {
        if (cat !== '균열모니터' && typeof closeNdtCrackMonitorModal === 'function') {
            closeNdtCrackMonitorModal();
        }
        currentNdtCategory = cat;
        setActiveNdtDispGroup(null);
        selectedNdtIds.clear();
        updateNdtSelectionBar();
        const catMap = { '실측': 'Dim', '강도': 'Strength', '탄산화': 'Carb', '기울기': 'Tilt', '변위': 'Vert', '부재변위': 'MemberDisp', '내화피복': 'Fireproof', '균열모니터': 'CrackMonitor' };
        Object.values(catMap).forEach(id => {
            const btn = document.getElementById(`btnNdtCat${id}`);
            if (btn) btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`btnNdtCat${catMap[cat]}`);
        if (activeBtn) activeBtn.classList.add('active');
        document.querySelectorAll('#tab-ndt .ndt-cat-rail-btn[data-ndt-cat], #tab-ndt .ndt-touch-cat-btn[data-ndt-cat]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-ndt-cat') === cat);
        });
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
        if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
        if (typeof syncNdtTiltRotateButtons === 'function') syncNdtTiltRotateButtons();
        if (typeof syncNdtDispUndoButton === 'function') syncNdtDispUndoButton();
        const hintSpan = document.querySelector('#ndtCanvasHintText span');
        if (hintSpan) {
            if (cat === '균열모니터') {
                hintSpan.textContent = '[📍 마킹] 모드에서 게이지 설치 위치를 도면에 찍으면 새 균열 게이지가 만들어지고 측정 팝업이 열립니다 (드래그하면 지시선)';
            } else {
                hintSpan.textContent = '[📍 NDT 위치 마킹] 6대 비파괴 조사 측정 위치를 도면 상에 핀으로 표시하세요';
            }
        }
    };

    let _ndtDrawRafId = 0;
    function drawNdtCanvas() {
        requestDrawingCrosshairUpdate();
        if (_ndtDrawRafId) return;
        _ndtDrawRafId = requestAnimationFrame(() => {
            _ndtDrawRafId = 0;
            paintNdtCanvas();
        });
    }

    function paintNdtCanvas() {
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas) return;
        try { updateNdtPrintCropButtons(); } catch (_e) { /* 초기화 전 */ }
        const ctx = canvas.getContext('2d');
        const dpr = window._ndtCanvasDpr || 1;
        const cw = window._ndtCanvasCssW || Math.round(canvas.width / dpr);
        const ch = window._ndtCanvasCssH || Math.round(canvas.height / dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#d0d0d0';
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        ctx.translate(ndtView.offsetX, ndtView.offsetY);
        ctx.scale(ndtView.scale, ndtView.scale);

        const { w: imgW, h: imgH } = getNdtDrawingDims();

        ctx.save();
        if (ndtRotationAngle === 90) {
            ctx.translate(imgH, 0);
            ctx.rotate((90 * Math.PI) / 180);
        } else if (ndtRotationAngle === 180) {
            ctx.translate(imgW, imgH);
            ctx.rotate((180 * Math.PI) / 180);
        } else if (ndtRotationAngle === 270) {
            ctx.translate(0, imgW);
            ctx.rotate((270 * Math.PI) / 180);
        }

        if (ndtBgImage) {
            ctx.drawImage(ndtBgImage, 0, 0, imgW, imgH);
            const ndtKey = `${state.currentBuildingId}_${state.currentFloor}`;
            if (!currentNdtCustomDrawingSrc(ndtKey)) {
                applyFloorDrawingDarken(ctx, getFloorDrawingDarken(state.currentBuildingId, state.currentFloor),
                    () => ctx.drawImage(ndtBgImage, 0, 0, imgW, imgH));
            }
        }

        // Filter NDT pins by current active category tab
        let ndtItems = getCurrentFloorNdtData();
        const currentCat = currentNdtCategory || '실측';
        if (currentCat === '기울기') {
            ndtItems = ndtItems.filter(item => item.category === currentCat);
        } else if (currentCat === '변위' || currentCat === '부재변위') {
            ndtItems = [];
        } else if (currentCat === '균열모니터') {
            // 예전 방식(균열 결함에 연결)으로 기록된 게이지는 그 결함 핀으로 계속 보여 준다.
            getCurrentFloorCrackMonitorDefects().forEach((defect) => {
                drawPin(ctx, defect);
            });
            // 새 방식: 도면에 직접 찍은 게이지 마킹
            ndtItems = ndtItems.filter(isCrackGaugeNdtItem);
        } else if (currentCat === '실측') {
            ndtItems = ndtItems.filter(item => item.category === '실측');
        } else if (currentCat === '내화피복') {
            ndtItems = ndtItems.filter(item => item.category === '내화피복');
        } else {
            // 강도 / 탄산화 탭: 같은 도면에 함께 표시 (부재 실측은 별도 도면)
            ndtItems = ndtItems.filter(item => ['강도', '탄산화'].includes(item.category));
        }
        ndtItems.forEach(item => {
            drawNdtPin(ctx, item, ndtItems);
            if (item && item.id && selectedNdtIds.has(item.id)) {
                drawNdtSelectionHalo(ctx, item);
            }
        });
        if (currentCat === '변위' || currentCat === '부재변위') {
            getCurrentFloorDisplacementGroups(currentCat).forEach(g => {
                drawNdtDisplacementGroup(ctx, g);
                if (g && g.id && selectedNdtIds.has(ndtDispSelKey(g.id))) {
                    drawNdtDispSelectionHalo(ctx, g);
                }
            });
        }

        if (isNdtMarqueeSelecting) {
            const x1 = Math.min(ndtMarqueeStartX, ndtMarqueeCurX);
            const y1 = Math.min(ndtMarqueeStartY, ndtMarqueeCurY);
            const x2 = Math.max(ndtMarqueeStartX, ndtMarqueeCurX);
            const y2 = Math.max(ndtMarqueeStartY, ndtMarqueeCurY);
            ctx.save();
            ctx.fillStyle = 'rgba(40, 40, 40, 0.12)';
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 1.5 / Math.max(ndtView.scale || 1, 0.01);
            ctx.setLineDash([6 / Math.max(ndtView.scale || 1, 0.01), 4 / Math.max(ndtView.scale || 1, 0.01)]);
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            ctx.restore();
        }

        ctx.restore();
        ctx.restore();

        const flTitleEl = document.getElementById('ndtFloorTitle');
        const tblTitleEl = document.getElementById('lblNdtTableTitle');
        const flLabel = window.getFloorLabelFromCode(state.currentFloor);
        if (flTitleEl) flTitleEl.textContent = flLabel;
        if (tblTitleEl) tblTitleEl.textContent = flLabel;
    }

    function getNdtStrengthCarbTypeLabel(cat) {
        if (cat === '강도') return '콘크리트 강도측정';
        if (cat === '탄산화') return '콘크리트 탄산화';
        return cat || '';
    }

    // 외벽 기울기 콜아웃 — 박스 회전(calloutRotation) + 면 수직 화살표(calloutEdge/T/Len)
    function getNdtTiltItemRotation(item, cat) {
        return (cat === '기울기') ? (((item && item.calloutRotation) || 0) % 360 + 360) % 360 : 0;
    }

    function getNdtTiltCalloutLayout(item, cat) {
        const pinScale = getStyleSize(getNdtStyleKey(cat || '기울기')).pin;
        const boxW = 168 * pinScale;
        const boxH = 44 * pinScale;
        const boxX = item.boxX !== undefined ? item.boxX : (item.x || 0);
        const boxY = item.boxY !== undefined ? item.boxY : (item.y || 0);
        const netRotDeg = normalizeDrawingRotation(getNdtTiltItemRotation(item, cat) - (ndtRotationAngle || 0));
        return { boxX, boxY, boxW, boxH, hw: boxW / 2, hh: boxH / 2, pinScale, netRotDeg };
    }

    function ndtTiltWorldToLocal(boxX, boxY, wx, wy, netRotDeg) {
        const dx = wx - boxX;
        const dy = wy - boxY;
        const rad = (-(netRotDeg || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }

    function ndtTiltLocalToWorld(boxX, boxY, lx, ly, netRotDeg) {
        const r = rotateVec2Deg(lx, ly, netRotDeg || 0);
        return { x: boxX + r.x, y: boxY + r.y };
    }

    function getNdtTiltEdgeDefs(hw, hh) {
        return [
            { edge: 0, nx: 0, ny: -1, tOf: (lx) => lx / hw, lenOf: (lx, ly) => -(ly + hh) },
            { edge: 1, nx: 1, ny: 0, tOf: (_lx, ly) => ly / hh, lenOf: (lx) => lx - hw },
            { edge: 2, nx: 0, ny: 1, tOf: (lx) => lx / hw, lenOf: (_lx, ly) => ly - hh },
            { edge: 3, nx: -1, ny: 0, tOf: (_lx, ly) => ly / hh, lenOf: (lx) => -(lx + hw) }
        ];
    }

    /** 로컬 좌표 기준: 가장 바깥쪽 면 + 그 면을 따라 t · 수직 len */
    function resolveNdtTiltArrowLocal(local, hw, hh) {
        const lx = local.x;
        const ly = local.y;
        const edges = getNdtTiltEdgeDefs(hw, hh);
        let best = edges[2];
        let bestScore = -Infinity;
        edges.forEach((e) => {
            const score = lx * e.nx + ly * e.ny;
            if (score > bestScore) { bestScore = score; best = e; }
        });
        const t = Math.max(-1, Math.min(1, best.tOf(lx, ly)));
        const len = Math.max(12, best.lenOf(lx, ly));
        return { edge: best.edge, t, len, nx: best.nx, ny: best.ny };
    }

    function ensureNdtTiltArrowModel(item, cat) {
        if (!item || cat !== '기울기') return;
        if (item.calloutEdge != null && Number.isFinite(item.calloutEdgeT) && Number.isFinite(item.calloutArrowLen)) return;
        const layout = getNdtTiltCalloutLayout(item, cat);
        const tx = item.targetX !== undefined ? item.targetX : layout.boxX;
        const ty = item.targetY !== undefined ? item.targetY : layout.boxY + layout.hh + 40;
        const local = ndtTiltWorldToLocal(layout.boxX, layout.boxY, tx, ty, layout.netRotDeg);
        const resolved = resolveNdtTiltArrowLocal(local, layout.hw, layout.hh);
        item.calloutEdge = resolved.edge;
        item.calloutEdgeT = resolved.t;
        item.calloutArrowLen = resolved.len;
    }

    function syncNdtTiltArrowModelFromTarget(item, cat) {
        if (!item || cat !== '기울기') return;
        const layout = getNdtTiltCalloutLayout(item, cat);
        const tx = item.targetX !== undefined ? item.targetX : layout.boxX;
        const ty = item.targetY !== undefined ? item.targetY : layout.boxY + layout.hh + 40;
        const local = ndtTiltWorldToLocal(layout.boxX, layout.boxY, tx, ty, layout.netRotDeg);
        const resolved = resolveNdtTiltArrowLocal(local, layout.hw, layout.hh);
        item.calloutEdge = resolved.edge;
        item.calloutEdgeT = resolved.t;
        item.calloutArrowLen = resolved.len;
    }

    function getNdtTiltArrowGeometry(item, cat) {
        const draggingTip = typeof activeDragNdtPin !== 'undefined'
            && activeDragNdtPin === item
            && dragNdtPart === 'target';
        if (draggingTip) ensureNdtTiltArrowModel(item, cat);
        else syncNdtTiltArrowModelFromTarget(item, cat);
        const layout = getNdtTiltCalloutLayout(item, cat);
        const edge = item.calloutEdge ?? 2;
        const t = Math.max(-1, Math.min(1, Number(item.calloutEdgeT) || 0));
        const len = Math.max(12, Number(item.calloutArrowLen) || 40);
        const { boxX, boxY, hw, hh, netRotDeg } = layout;
        let ax; let ay; let nx; let ny;
        if (edge === 0) { ax = t * hw; ay = -hh; nx = 0; ny = -1; }
        else if (edge === 1) { ax = hw; ay = t * hh; nx = 1; ny = 0; }
        else if (edge === 2) { ax = t * hw; ay = hh; nx = 0; ny = 1; }
        else { ax = -hw; ay = t * hh; nx = -1; ny = 0; }
        const anchor = ndtTiltLocalToWorld(boxX, boxY, ax, ay, netRotDeg);
        const normal = rotateVec2Deg(nx, ny, netRotDeg);
        const tip = { x: anchor.x + normal.x * len, y: anchor.y + normal.y * len };
        return { anchor, tip, normal, edge, t, len, layout };
    }

    function updateNdtTiltArrowFromDrag(item, cat, mx, my) {
        if (!item || cat !== '기울기') return;
        ensureNdtTiltArrowModel(item, cat);
        const layout = getNdtTiltCalloutLayout(item, cat);
        const local = ndtTiltWorldToLocal(layout.boxX, layout.boxY, mx, my, layout.netRotDeg);
        const resolved = resolveNdtTiltArrowLocal(local, layout.hw, layout.hh);
        item.calloutEdge = resolved.edge;
        item.calloutEdgeT = resolved.t;
        item.calloutArrowLen = resolved.len;
        const geom = getNdtTiltArrowGeometry(item, cat);
        item.targetX = geom.tip.x;
        item.targetY = geom.tip.y;
    }

    function getNdtTiltRotateHandle(item, cat) {
        const layout = getNdtTiltCalloutLayout(item, cat);
        return ndtTiltLocalToWorld(layout.boxX, layout.boxY, 0, -layout.hh - 28, layout.netRotDeg);
    }

    function isNearNdtTiltRotateHandle(item, cat, vx, vy) {
        const handle = getNdtTiltRotateHandle(item, cat);
        const pinScale = getNdtTiltCalloutLayout(item, cat).pinScale;
        const viewScale = getMapCanvasViewScale();
        const minR = ndtActivePointerIsTouch
            ? Math.max(14 / viewScale, 12 * pinScale)
            : Math.max(10 / viewScale, 9 * pinScale);
        return Math.hypot(vx - handle.x, vy - handle.y) <= minR;
    }

    function beginNdtTiltRotateSession(item, imgX, imgY, cat) {
        if (!item) return;
        const layout = getNdtTiltCalloutLayout(item, cat);
        ndtTiltRotatePivot = { x: layout.boxX, y: layout.boxY };
        ndtTiltRotateStartMouse = Math.atan2(imgY - layout.boxY, imgX - layout.boxX);
        ndtTiltRotateBaseAngle = getNdtTiltItemRotation(item, cat);
        ensureNdtTiltArrowModel(item, cat);
    }

    function applyNdtTiltRotateSession(item, cat, imgX, imgY) {
        if (!item || !ndtTiltRotatePivot) return;
        const mouse = Math.atan2(imgY - ndtTiltRotatePivot.y, imgX - ndtTiltRotatePivot.x);
        let deltaDeg = ((mouse - ndtTiltRotateStartMouse) * 180) / Math.PI;
        while (deltaDeg > 180) deltaDeg -= 360;
        while (deltaDeg < -180) deltaDeg += 360;
        item.calloutRotation = ndtTiltRotateBaseAngle + deltaDeg;
        const geom = getNdtTiltArrowGeometry(item, cat);
        item.targetX = geom.tip.x;
        item.targetY = geom.tip.y;
    }

    function endNdtTiltRotateSession() {
        ndtTiltRotatePivot = null;
        ndtTiltRotateStartMouse = 0;
        ndtTiltRotateBaseAngle = 0;
    }

    function drawNdtTiltRotateHandle(ctx, item, cat) {
        const layout = getNdtTiltCalloutLayout(item, cat);
        const handle = getNdtTiltRotateHandle(item, cat);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(layout.boxX, layout.boxY);
        ctx.lineTo(handle.x, handle.y);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
    }

    window.rotateSelectedNdtTiltBoxes = function () {
        if (typeof window.showToast === 'function') {
            window.showToast('외벽 기울기 박스는 선택 후 주황 회전 핸들을 드래그해 각도를 조절하세요.', 'info', 2800);
        }
    };

    function drawNdtSelectionHalo(ctx, item) {
        const bx = item.boxX !== undefined ? item.boxX : (item.x || 0);
        const by = item.boxY !== undefined ? item.boxY : (item.y || 0);
        const cat = item.category || '';
        const ndtStyleKey = getNdtStyleKey(cat);
        const pinScale = getStyleSize(ndtStyleKey).pin;
        let noStr = item.no || 'NO.01';
        if (noStr.startsWith('기울기-') || noStr.startsWith('NDT-') || noStr.startsWith('변위-')) {
            const numPart = noStr.replace(/^[^\d]+/, '');
            noStr = `NO.${numPart.length === 1 ? '0' + numPart : numPart}`;
        }
        noStr = formatPinNumberLabel(noStr, ndtStyleKey);
        let w;
        let h;
        let itemRot = 0;
        if (cat === '기울기' || cat === '변위' || cat === '부재변위') {
            w = 168 * pinScale;
            h = 44 * pinScale;
            itemRot = getNdtTiltItemRotation(item, cat);
        } else if (cat === '강도' || cat === '탄산화') {
            const dims = measureNdtTypeCalloutDimensions(ctx, noStr, getNdtStrengthCarbTypeLabel(cat), pinScale);
            w = dims.boxW;
            h = dims.boxH;
        } else {
            const dims = measurePinBoxDimensions(ctx, noStr, pinScale, 1, getStyleSize(ndtStyleKey).font);
            w = dims.w;
            h = dims.h;
        }
        const pad = 2 * pinScale;
        ctx.save();
        ctx.translate(bx, by);
        if (ndtRotationAngle === 90) ctx.rotate((-90 * Math.PI) / 180);
        else if (ndtRotationAngle === 180) ctx.rotate((-180 * Math.PI) / 180);
        else if (ndtRotationAngle === 270) ctx.rotate((-270 * Math.PI) / 180);
        if (itemRot) ctx.rotate((itemRot * Math.PI) / 180);
        ctx.strokeStyle = '#6b6b6b';
        ctx.lineWidth = Math.max(2, 2.4 * pinScale);
        ctx.setLineDash([]);
        ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2);
        ctx.restore();
        if (cat === '기울기') drawNdtTiltRotateHandle(ctx, item, cat);
    }

    function drawNdtDispSelectionHalo(ctx, group) {
        const pinScale = getStyleSize(group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement').pin;
        const bx = group.boxX !== undefined ? group.boxX : (group.points?.[0]?.x || 0);
        const by = group.boxY !== undefined ? group.boxY : (group.points?.[0]?.y || 0);
        const label = group.groupNo || 'NO.01';
        const dim = measurePinBoxDimensions(ctx, label, pinScale, 1);
        ctx.save();
        ctx.translate(bx, by);
        ctx.strokeStyle = '#6b6b6b';
        ctx.lineWidth = Math.max(2, 2.4 * pinScale);
        ctx.strokeRect(-dim.w / 2 - 3 * pinScale, -dim.h / 2 - 3 * pinScale, dim.w + 6 * pinScale, dim.h + 6 * pinScale);
        ctx.restore();
    }

    // 강도·탄산화 자석/자동스택 제거 — 박스는 저장된 좌표 그대로 사용

    function measureNdtTypeCalloutDimensions(ctx, noStr, typeLabel, pinScale) {
        const fontNo = Math.max(10, Math.round(12 * pinScale));
        const fontType = Math.max(10, Math.round(11 * pinScale));
        const padX = 8 * pinScale;
        const padY = 5 * pinScale;
        const gap = 6 * pinScale;
        let noW = String(noStr || 'NO.01').length * fontNo * 0.62;
        let typeW = String(typeLabel || '').length * fontType * 0.62;
        if (ctx) {
            ctx.save();
            ctx.font = `bold ${fontNo}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
            noW = ctx.measureText(noStr || 'NO.01').width;
            ctx.font = `bold ${fontType}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
            typeW = ctx.measureText(typeLabel || '').width;
            ctx.restore();
        }
        const col1W = Math.max(44 * pinScale, noW + padX * 2);
        const col2W = Math.max(110 * pinScale, typeW + padX * 2);
        const boxH = Math.max(22 * pinScale, fontType + padY * 2);
        return {
            boxW: col1W + col2W,
            boxH,
            col1W,
            col2W,
            fontNo,
            fontType,
            gap
        };
    }

    function formatNdtTiltValue(item) {
        const raw = item && (item.avgValue != null && item.avgValue !== ''
            ? item.avgValue
            : (item.v1 != null && item.v1 !== '' ? item.v1 : null));
        if (raw == null) return '—';
        const s = String(raw).trim();
        if (!s) return '—';
        if (/mm/i.test(s)) return s;
        const n = parseFloat(s);
        if (Number.isFinite(n)) return `${n}mm`;
        return s;
    }

    function normalizeNdtDispDirSymbol(dir) {
        const d = String(dir || '').trim();
        // 변위 0mm — 방향 없음
        if (d === '-' || d === '−' || d === '–' || d === '—' || d === '0' || d === '없음' || d.toLowerCase() === 'none') {
            return '-';
        }
        const map = {
            '→': '→', '←': '←', '↑': '↑', '↓': '↓',
            '↗': '↗', '↖': '↖', '↘': '↘', '↙': '↙',
            '➡': '→', '⬅': '←', '⬆': '↑', '⬇': '↓',
            '⇒': '→', '⇐': '←', '⇑': '↑', '⇓': '↓',
            '>': '→', '<': '←', '^': '↑', 'v': '↓', 'V': '↓'
        };
        return map[d] || d || '→';
    }

    /** 마킹 화살표(ux,uy)를 바라본 기준 왼쪽·오른쪽 = 화살표에서 90도 꺾은 방향. 화면 y는 아래가 + */
    function ndtTiltSideVector(side, ux, uy) {
        const len = Math.hypot(ux, uy);
        if ((side !== 'left' && side !== 'right') || !(len > 0)) return null;
        const x = ux / len;
        const y = uy / len;
        return side === 'left' ? { x: y, y: -x } : { x: -y, y: x };
    }

    /** 왼쪽·오른쪽을 8방향 글자로 — dispSide를 모르는 예전 앱에도 방향이 보이도록 함께 저장 */
    function ndtTiltSideGlyph(side, ux, uy) {
        if (side === 'none') return '-';
        const v = ndtTiltSideVector(side, ux, uy);
        if (!v) return null;
        const glyphs = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
        const i = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4));
        return glyphs[(i + 8) % 8];
    }

    /** 표의 변위방향 칸에 방향 화살표를 그린다(박스 회전을 뺀 좌표계) */
    function drawNdtTiltSideArrow(ctx, cx, cy, worldDir, netRotDeg, pinScale, color) {
        const d = rotateVec2Deg(worldDir.x, worldDir.y, -(netRotDeg || 0));
        const half = 8 * pinScale;
        const head = 5 * pinScale;
        const tipX = cx + d.x * half;
        const tipY = cy + d.y * half;
        const angle = Math.atan2(d.y, d.x);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.8 * pinScale;
        ctx.beginPath();
        ctx.moveTo(cx - d.x * half, cy - d.y * half);
        ctx.lineTo(tipX - d.x * head * 0.7, tipY - d.y * head * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - head * Math.cos(angle - Math.PI / 6), tipY - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(tipX - head * Math.cos(angle + Math.PI / 6), tipY - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    /**
     * 외벽 기울기 콜아웃 — 흰 배경 표(NO | 변위량/값 · 변위방향/화살표) + 측정점 지시 화살표
     */
    function drawNdtTiltCallout(ctx, opts) {
        const {
            item, noStr, cat, boxX, boxY, targetX, targetY,
            pinScale, arrowScale, color, isBeingDragged, rotationAngle
        } = opts;
        const tiltVal = formatNdtTiltValue(item);
        const dispDir = normalizeNdtDispDirSymbol(item.dispDirection);
        const amountLabel = (cat === '부재변위') ? '처 짐 량' : '변 위 량';

        // 표 치수 (참고 이미지 비율). 박스 자체의 회전(글씨 포함)은 itemRot으로 별도 적용한다.
        const boxW = 168 * pinScale;
        const boxH = 44 * pinScale;
        const col1W = 52 * pinScale;
        const col2W = 58 * pinScale;
        const col3W = boxW - col1W - col2W;
        const lineW = Math.max(1.1, getNdtLeaderLineWidth(pinScale, false, getNdtStyleKey(cat || '기울기')) * 0.85);
        const headLen = 15 * arrowScale;
        const itemRot = getNdtTiltItemRotation(item, cat);

        const arrowGeom = (cat === '기울기') ? getNdtTiltArrowGeometry(item, cat) : null;
        const tipX = arrowGeom ? arrowGeom.tip.x : targetX;
        const tipY = arrowGeom ? arrowGeom.tip.y : targetY;
        const anchor = arrowGeom
            ? arrowGeom.anchor
            : getPinLeaderBoxEdgeCenterAnchor(boxX, boxY, tipX, tipY, boxW, boxH, (rotationAngle || 0) - itemRot);
        const ux = tipX - anchor.x;
        const uy = tipY - anchor.y;
        const dist = Math.hypot(ux, uy);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.8, lineW * 1.35) * (arrowScale / Math.max(pinScale, 0.01));
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (dist > 4) {
            const stemEnd = getArrowStemEndPoint(tipX, tipY, ux, uy, headLen * 0.85);
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(stemEnd.x, stemEnd.y);
            if (isBeingDragged) ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            const angle = Math.atan2(uy, ux);
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(
                tipX - headLen * Math.cos(angle - Math.PI / 7),
                tipY - headLen * Math.sin(angle - Math.PI / 7)
            );
            ctx.lineTo(
                tipX - headLen * Math.cos(angle + Math.PI / 7),
                tipY - headLen * Math.sin(angle + Math.PI / 7)
            );
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // 표 — 도면 전체 회전(counter-rotate)에 이어 박스 자체 회전(itemRot)을 추가로 적용한다.
        // 글씨도 박스와 같이 돌아간다(전치/반전 없이 그대로 회전).
        ctx.save();
        ctx.translate(boxX, boxY);
        if (rotationAngle === 90) {
            ctx.rotate((-90 * Math.PI) / 180);
        } else if (rotationAngle === 180) {
            ctx.rotate((-180 * Math.PI) / 180);
        } else if (rotationAngle === 270) {
            ctx.rotate((-270 * Math.PI) / 180);
        }
        if (itemRot) ctx.rotate((itemRot * Math.PI) / 180);

        // 흰 배경으로 도면 위 글자·숫자·화살표 가독성 확보
        ctx.beginPath();
        ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.stroke();

        // 격자: 세로 2줄 + 가로 1줄(오른쪽만)
        ctx.beginPath();
        ctx.moveTo(-boxW / 2 + col1W, -boxH / 2);
        ctx.lineTo(-boxW / 2 + col1W, boxH / 2);
        ctx.moveTo(-boxW / 2 + col1W + col2W, -boxH / 2);
        ctx.lineTo(-boxW / 2 + col1W + col2W, boxH / 2);
        ctx.moveTo(-boxW / 2 + col1W, 0);
        ctx.lineTo(boxW / 2, 0);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 흰 배경 위에서는 외곽선 없이 본문색만 써도 잘 읽힘
        const textOpts = { outlineWidth: 0 };
        drawOutlinedPinText(ctx, noStr, -boxW / 2 + col1W / 2, 0, color, `bold ${Math.round(15 * pinScale)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff', textOpts);

        const midX = -boxW / 2 + col1W + col2W / 2;
        const rightX = -boxW / 2 + col1W + col2W + col3W / 2;
        drawOutlinedPinText(ctx, amountLabel, midX, -boxH / 4, color, `bold ${Math.round(10.5 * pinScale)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff', textOpts);
        drawOutlinedPinText(ctx, '변위방향', midX, boxH / 4, color, `bold ${Math.round(10.5 * pinScale)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff', textOpts);
        drawOutlinedPinText(ctx, tiltVal, rightX, -boxH / 4, color, `bold ${Math.round(12.5 * pinScale)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff', textOpts);
        // 왼쪽·오른쪽으로 입력한 값은 마킹 화살표에서 90도 꺾은 방향으로 그린다. 예전 8방향 값은 글자 그대로
        const sideDir = (cat === '기울기') ? ndtTiltSideVector(item.dispSide, ux, uy) : null;
        if (sideDir) {
            drawNdtTiltSideArrow(ctx, rightX, boxH / 4, sideDir, itemRot - (rotationAngle || 0), pinScale, color);
        } else {
            const dirText = (cat === '기울기' && item.dispSide !== undefined) ? '-' : dispDir;
            drawOutlinedPinText(ctx, dirText, rightX, boxH / 4, color, `bold ${Math.round(18 * pinScale)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff', textOpts);
        }

        ctx.restore();
    }

    function drawNdtPin(ctx, item, allItems) {
        const baseBoxX = item.boxX !== undefined ? item.boxX : (item.x || 100);
        const baseBoxY = item.boxY !== undefined ? item.boxY : (item.y || 100);
        const targetX = item.targetX !== undefined ? item.targetX : (item.x || baseBoxX);
        const targetY = item.targetY !== undefined ? item.targetY : (item.y || baseBoxY);
        const isBeingDragged = (typeof activeDragNdtPin !== 'undefined' && activeDragNdtPin && activeDragNdtPin === item);
        const cat = item.category || '강도';
        const ndtStyleKey = getNdtStyleKey(cat);
        const ndtSize = getStyleSize(ndtStyleKey);
        const ndtShapeCfg = getStyleShape(ndtStyleKey);
        const pinScale = ndtSize.pin;
        const arrowScale = ndtSize.arrow;
        const useCircleTip = state.tipShape === 'circle';

        let noStr = item.no || 'NO.01';
        if (noStr.startsWith('기울기-') || noStr.startsWith('NDT-') || noStr.startsWith('변위-')) {
            const numPart = noStr.replace(/^[^\d]+/, '');
            noStr = `NO.${numPart.length === 1 ? '0' + numPart : numPart}`;
        }
        noStr = formatPinNumberLabel(noStr, ndtStyleKey);

        // 외벽 기울기: 참고 디자인 — NO | 변위량/값 · 변위방향/화살표 표 + 지시 화살표
        if (cat === '기울기' || cat === '변위' || cat === '부재변위') {
            drawNdtTiltCallout(ctx, {
                item,
                noStr,
                cat,
                boxX: baseBoxX,
                boxY: baseBoxY,
                targetX,
                targetY,
                pinScale,
                arrowScale,
                color: isBeingDragged ? '#facc15' : getStyleColor(ndtStyleKey),
                isBeingDragged,
                rotationAngle: ndtRotationAngle || 0
            });
            return;
        }

        // 강도·탄산화: 2열 콜아웃 (NO | 콘크리트 강도측정/탄산화) + 측정점 원
        if (cat === '강도' || cat === '탄산화') {
            const typeLabel = getNdtStrengthCarbTypeLabel(cat);
            const color = isBeingDragged ? '#facc15' : getStyleColor(ndtStyleKey);
            const dims = measureNdtTypeCalloutDimensions(ctx, noStr, typeLabel, pinScale);
            const boxX = baseBoxX;
            const boxY = baseBoxY;

            // 지시선: 콜아웃 박스 모서리 → 측정점 (항상 원 끝)
            const anchor = getPinLeaderBoxAnchor(boxX, boxY, targetX, targetY, dims.boxW, dims.boxH, ndtRotationAngle || 0);
            const tipR = 4 * arrowScale;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = getNdtLeaderLineWidth(pinScale, false, ndtStyleKey);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            if (Math.hypot(targetX - anchor.x, targetY - anchor.y) > 3) {
                const ux = targetX - anchor.x;
                const uy = targetY - anchor.y;
                const stemEnd = getArrowStemEndPoint(targetX, targetY, ux, uy, tipR);
                ctx.beginPath();
                ctx.moveTo(anchor.x, anchor.y);
                ctx.lineTo(stemEnd.x, stemEnd.y);
                if (isBeingDragged) ctx.setLineDash([5, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.arc(targetX, targetY, tipR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.translate(boxX, boxY);
            if (ndtRotationAngle === 90) {
                ctx.rotate((-90 * Math.PI) / 180);
            } else if (ndtRotationAngle === 180) {
                ctx.rotate((-180 * Math.PI) / 180);
            } else if (ndtRotationAngle === 270) {
                ctx.rotate((-270 * Math.PI) / 180);
            }

            const { boxW, boxH, col1W, fontNo, fontType } = dims;
            ctx.strokeStyle = color;
            ctx.lineWidth = getNdtLeaderLineWidth(pinScale, false, ndtStyleKey);
            ctx.beginPath();
            ctx.rect(-boxW / 2, -boxH / 2, boxW, boxH);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-boxW / 2 + col1W, -boxH / 2);
            ctx.lineTo(-boxW / 2 + col1W, boxH / 2);
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            drawOutlinedPinText(ctx, noStr, -boxW / 2 + col1W / 2, 0, color, `bold ${fontNo}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff');
            drawOutlinedPinText(ctx, typeLabel, -boxW / 2 + col1W + (boxW - col1W) / 2, 0, color, `bold ${fontType}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`, '#ffffff');
            ctx.restore();
            return;
        }

        // 실측: 결함위치도와 동일 핀 스타일 (NDT 전용 크기·굵기)
        const boxX = baseBoxX;
        const boxY = baseBoxY;
        const color = isBeingDragged ? '#facc15' : getStyleColor(ndtStyleKey);
        const { w, h } = measurePinBoxDimensions(ctx, noStr, pinScale, 1, ndtSize.font);

        const anchor = getPinLeaderBoxAnchor(boxX, boxY, targetX, targetY, w, h, ndtRotationAngle || 0, { shape: ndtShapeCfg.shape, scale: pinScale });
        const headLen = 10 * arrowScale;
        const stemInset = useCircleTip
            ? 4.5 * arrowScale
            : headLen * Math.cos(Math.PI / 6);
        const ux = targetX - anchor.x;
        const uy = targetY - anchor.y;
        const stemEnd = stemInset > 0
            ? getArrowStemEndPoint(targetX, targetY, ux, uy, stemInset)
            : { x: targetX, y: targetY };

        if (Math.hypot(ux, uy) > 3) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = getNdtLeaderLineWidth(pinScale, false, ndtStyleKey);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(anchor.x, anchor.y);
            ctx.lineTo(stemEnd.x, stemEnd.y);
            if (isBeingDragged) ctx.setLineDash([5, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            if (useCircleTip) {
                ctx.beginPath();
                ctx.arc(targetX, targetY, 4.5 * arrowScale, 0, Math.PI * 2);
                ctx.fill();
            } else {
                const angle = Math.atan2(uy, ux);
                ctx.beginPath();
                ctx.moveTo(targetX, targetY);
                ctx.lineTo(targetX - headLen * Math.cos(angle - Math.PI / 6), targetY - headLen * Math.sin(angle - Math.PI / 6));
                ctx.lineTo(targetX - headLen * Math.cos(angle + Math.PI / 6), targetY - headLen * Math.sin(angle + Math.PI / 6));
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.save();
        ctx.translate(boxX, boxY);
        if (ndtRotationAngle === 90) {
            ctx.rotate((-90 * Math.PI) / 180);
        } else if (ndtRotationAngle === 180) {
            ctx.rotate((-180 * Math.PI) / 180);
        } else if (ndtRotationAngle === 270) {
            ctx.rotate((-270 * Math.PI) / 180);
        }

        // 비파괴 실측: 투명 배경 + 색 테두리/글자 (결함위치도와 동일)
        paintPinBox(ctx, w, h, ndtShapeCfg, color, pinScale, 1, isBeingDragged, getNdtLeaderLineScale(ndtStyleKey));
        drawPinBoxLabel(ctx, noStr, getPinBoxTextColor(color, ndtShapeCfg, isBeingDragged), pinScale, ndtShapeCfg, ndtSize.font);
        ctx.restore();
    }

    // 바닥 수직변위: 그룹 NO.박스 + 측정점(작은 원 + 아래 (01)(02)… 순번)
    function formatNdtDisplacementPointLabel(seq) {
        const n = Math.max(1, parseInt(seq, 10) || 1);
        return `(${String(n).padStart(2, '0')})`;
    }

    function drawNdtDisplacementGroup(ctx, group) {
        const groupStyleKey = group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement';
        const groupSize = getStyleSize(groupStyleKey);
        const pinScale = groupSize.pin;
        const color = group.color || getStyleColor(groupStyleKey);
        const boxX = group.boxX !== undefined ? group.boxX : (group.points[0] ? group.points[0].x : 100);
        const boxY = group.boxY !== undefined ? group.boxY : (group.points[0] ? group.points[0].y : 100);
        const isGroupDragged = activeDragNdtDisplacementGroup === group && !activeDragNdtDisplacementPoint;
        const groupCounterRotate = ndtRotationAngle === 90 ? -90 : (ndtRotationAngle === 180 ? -180 : (ndtRotationAngle === 270 ? -270 : 0));

        // 측정점: 작은 원 + 바로 아래 (01)(02)… (그룹 내 1부터 1씩 증가)
        group.points.forEach((p, idx) => {
            const isPtDragged = activeDragNdtDisplacementGroup === group && activeDragNdtDisplacementPoint === p;
            const r = 5 * pinScale;
            const seqLabel = formatNdtDisplacementPointLabel(idx + 1);
            const fontSize = Math.max(9, Math.round(11 * pinScale));

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.fillStyle = isPtDragged ? '#facc15' : color;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();

            if (groupCounterRotate) ctx.rotate((groupCounterRotate * Math.PI) / 180);
            // 지금 레벨을 입력 중인 지점 표시
            if (window._ndtDispEditingPointId && window._ndtDispEditingPointId === p.id) {
                ctx.strokeStyle = '#f97316';
                ctx.lineWidth = 3 * pinScale;
                ctx.beginPath();
                ctx.arc(0, 0, r + 5 * pinScale, 0, Math.PI * 2);
                ctx.stroke();
            }
            const ptColor = isPtDragged ? '#d97706' : color;
            drawOutlinedPinText(
                ctx,
                seqLabel,
                0,
                r + 2 * pinScale,
                ptColor,
                `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`,
                '#ffffff',
                { textBaseline: 'top' }
            );
            ctx.restore();
        });

        // 그룹 라벨 박스 (NO.xx) — 구역 식별
        const groupShapeCfg = getStyleShape(groupStyleKey);
        let groupNoStr = group.groupNo || 'NO.01';
        groupNoStr = formatPinNumberLabel(groupNoStr, groupStyleKey);
        const groupDim = measurePinBoxDimensions(ctx, groupNoStr, pinScale, 1);
        const isActiveZone = window._activeNdtDispGroupId && group.id === window._activeNdtDispGroupId;
        ctx.save();
        ctx.translate(boxX, boxY);
        if (groupCounterRotate) ctx.rotate((groupCounterRotate * Math.PI) / 180);
        const boxColor = isGroupDragged ? '#facc15' : (isActiveZone ? '#ea580c' : color);
        // 투명 배경 + 색 테두리/글자
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = getNdtLeaderLineWidth(pinScale, !!isActiveZone, groupStyleKey);
        ctx.beginPath();
        ctx.rect(-groupDim.w / 2, -groupDim.h / 2, groupDim.w, groupDim.h);
        ctx.stroke();
        if (isActiveZone && !isGroupDragged) {
            ctx.strokeStyle = 'rgba(234,88,12,0.45)';
            ctx.lineWidth = Math.max(1, 2 * pinScale);
            ctx.setLineDash([4 * pinScale, 3 * pinScale]);
            ctx.strokeRect(-groupDim.w / 2 - 3 * pinScale, -groupDim.h / 2 - 3 * pinScale, groupDim.w + 6 * pinScale, groupDim.h + 6 * pinScale);
            ctx.setLineDash([]);
        }
        drawPinBoxLabel(
            ctx,
            groupNoStr,
            getPinBoxTextColor(boxColor, groupShapeCfg, isGroupDragged || isActiveZone),
            pinScale,
            groupShapeCfg
        );
        ctx.restore();
    }

    // 긴 한 줄 텍스트를 지정된 폭에 맞춰 여러 줄로 나눠 그림 (공백 기준)
    // 둥근 사각형 path만 구성(칠하기/선긋기는 호출부에서) — 배지·값 라벨 칩·플롯 배경 패널 등에 공용.
    function roundRectPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let curY = y;
        words.forEach(word => {
            const testLine = line ? `${line} ${word}` : word;
            if (ctx.measureText(testLine).width > maxWidth && line) {
                ctx.fillText(line, x, curY);
                line = word;
                curY += lineHeight;
            } else {
                line = testLine;
            }
        });
        if (line) ctx.fillText(line, x, curY);
    }

    // 바닥 수직변위 그룹 하나의 꺾은선 그래프를 캔버스로 그려 PNG dataURL로 반환
    // 꺾은선 그래프 본체를 ctx에 그린다 — 캔버스 폭은 항상 900을 가정하고, y좌표는 전부 yOffset만큼
    // 밀어서 그린다. renderNdtDisplacementChartDataUrl(그래프 단독, PDF에서도 씀)과
    // renderNdtDisplacementCombinedCanvas(요약박스+그래프를 한 장으로, HWPX용) 둘 다 이 함수를 공유해서
    // 그래프를 그리는 코드가 두 군데로 갈라지지 않게 한다.
    // 16진 색상 문자열에 알파를 입혀 rgba()로 반환 — 영역 채우기 그라데이션/은은한 배경 등에 사용.
    function hexColorWithAlpha(hex, alpha) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return `rgba(100,116,139,${alpha})`;
        const n = parseInt(m[1], 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    function drawNdtDisplacementChartBody(ctx, group, floorCode, yOffset, cw = 900, ch = 620) {
        // 여러 동 한글 출력은 동 이름을 붙인 층 이름을 미리 넣어 둔다(group._hwpxFloorTitle)
        const floorLabel = group._hwpxFloorTitle
            || ((typeof window.getFloorLabelFromCode === 'function') ? window.getFloorLabelFromCode(floorCode) : (floorCode || ''));
        const chartColor = group.color || getStyleColor(group.category === '부재변위' ? 'ndtMemberDisp' : 'ndtSettlement');
        const catLabel = group.category === '부재변위' ? '부재변위(처짐)' : '부동침하 기울기';
        const calc = calcGroupDisplacement(group);
        const gradeColors = { a등급: '#16a34a', b등급: '#2563eb', c등급: '#ca8a04', d등급: '#ea580c', e등급: '#dc2626' };
        const gradeColor = gradeColors[calc.grade] || '#64748b';

        // 상단 타이틀 바 — 왼쪽 색 액센트 + 제목, 오른쪽에 등급 배지(다른 조사표와 동일한 느낌).
        ctx.textAlign = 'left';
        ctx.fillStyle = chartColor;
        ctx.fillRect(0, yOffset + 18, 6, 30);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 22px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.fillText(`${floorLabel} ${group.locationType} ${catLabel} (${group.groupNo})`, 18, yOffset + 40);

        if (calc.grade) {
            ctx.font = 'bold 15px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
            const badgeText = `${calc.grade}  ${calc.tiltRatio || ''}`.trim();
            const badgeW = ctx.measureText(badgeText).width + 26;
            const badgeX = cw - 20 - badgeW, badgeY = yOffset + 14;
            ctx.fillStyle = hexColorWithAlpha(gradeColor, 0.12);
            roundRectPath(ctx, badgeX, badgeY, badgeW, 30, 15);
            ctx.fill();
            ctx.strokeStyle = hexColorWithAlpha(gradeColor, 0.5);
            ctx.lineWidth = 1.2;
            roundRectPath(ctx, badgeX, badgeY, badgeW, 30, 15);
            ctx.stroke();
            ctx.fillStyle = gradeColor;
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + 21);
        }

        const points = group.points || [];
        const marginL = 84, marginR = 60, marginT = 90, marginB = 140;
        const plotW = cw - marginL - marginR;
        const plotH = ch - marginT - marginB;

        if (points.length === 0) {
            ctx.textAlign = 'center';
            ctx.font = '16px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
            ctx.fillStyle = '#a3a3a3';
            ctx.fillText('측정 지점이 없습니다.', cw / 2, yOffset + ch / 2);
            return;
        }

        if (!ndtDispGroupLevelsComplete(group)) {
            ctx.textAlign = 'center';
            ctx.font = '16px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
            ctx.fillStyle = '#a3a3a3';
            ctx.fillText('레벨이 미입력된 지점이 있습니다.', cw / 2, yOffset + ch / 2);
            return;
        }

        const calcLv = ndtDispCalcLevels(group);
        // 축 범위 = 측정점 평균 ± 20 (사용자 요청). 평균을 정중앙에 두므로 선이 그래프 가운데에 온다.
        const levels = calcLv.map(Number);
        const meanL = levels.reduce((a, b) => a + b, 0) / levels.length;
        const minL = meanL - 20;
        const maxL = meanL + 20;

        // 바닥 측정과 보/슬래브(상부) 측정은 침하 방향이 반대로 읽힌다(천장·보 밑면은 레벨 막대를
        // 거꾸로 대고 측정하므로) — 값·등급판정은 그대로 두고, 그래프 선의 위아래 모양만 뒤집는다.
        // 바닥: 값이 작을수록 위로 / 보·슬래브(기본값): 값이 작을수록 아래로.
        const flipY = (group.locationType === '바닥');
        const xFor = (idx) => marginL + (points.length === 1 ? plotW / 2 : (idx / (points.length - 1)) * plotW);
        const yFor = (level) => {
            const frac = (level - minL) / (maxL - minL);
            return yOffset + marginT + (flipY ? frac : (1 - frac)) * plotH;
        };

        // 플롯 영역 배경 패널(은은한 카드 느낌) + 가로 그리드라인 4단.
        roundRectPath(ctx, marginL, yOffset + marginT, plotW, plotH, 8);
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        roundRectPath(ctx, marginL, yOffset + marginT, plotW, plotH, 8);
        ctx.stroke();

        const gridSteps = 4;
        ctx.font = '12px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.textAlign = 'right';
        for (let i = 0; i <= gridSteps; i++) {
            const gy = yOffset + marginT + (plotH * i) / gridSteps;
            ctx.strokeStyle = '#e8edf3';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(marginL, gy);
            ctx.lineTo(marginL + plotW, gy);
            ctx.stroke();
            const gLevel = flipY ? (minL + ((maxL - minL) * i) / gridSteps) : (maxL - ((maxL - minL) * i) / gridSteps);
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(gLevel.toFixed(1), marginL - 10, gy + 4);
        }

        if (minL < 0 && maxL > 0) {
            const zeroY = yFor(0);
            ctx.strokeStyle = '#cbd5e1';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(marginL, zeroY);
            ctx.lineTo(marginL + plotW, zeroY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 선을 기준으로 그라데이션 영역을 채운다 — 바닥은 선 아래(바닥에 깔린 느낌), 보/슬래브는
        // 선 위(천장·보 밑면에 매달린 느낌)로 채워야 실제 측정 방향과 시각적으로 맞는다(사용자 요청).
        const plotTop = yOffset + marginT;
        const plotBottom = yOffset + marginT + plotH;
        const fillEdge = flipY ? plotBottom : plotTop;
        const areaGrad = flipY
            ? ctx.createLinearGradient(0, plotTop, 0, plotBottom)
            : ctx.createLinearGradient(0, plotBottom, 0, plotTop);
        areaGrad.addColorStop(0, hexColorWithAlpha(chartColor, 0.28));
        areaGrad.addColorStop(1, hexColorWithAlpha(chartColor, 0.02));
        ctx.beginPath();
        points.forEach((p, idx) => {
            const x = xFor(idx), y = yFor(calcLv[idx]);
            if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(xFor(points.length - 1), fillEdge);
        ctx.lineTo(xFor(0), fillEdge);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // 꺾은선 — 은은한 그림자로 입체감.
        ctx.save();
        ctx.shadowColor = hexColorWithAlpha(chartColor, 0.35);
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
        ctx.strokeStyle = chartColor;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        points.forEach((p, idx) => {
            const x = xFor(idx);
            const y = yFor(calcLv[idx]);
            if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();

        points.forEach((p, idx) => {
            const x = xFor(idx);
            const y = yFor(calcLv[idx]);

            ctx.save();
            ctx.shadowColor = 'rgba(15,23,42,0.25)';
            ctx.shadowBlur = 4;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = chartColor;
            ctx.beginPath();
            ctx.arc(x, y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 값 라벨은 흰 배경 칩 위에 올려 그래프 선과 겹쳐도 읽기 쉽게 한다.
            const labelText = formatNdtDispLevelText(group, idx);
            ctx.font = 'bold 13px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
            ctx.textAlign = 'center';
            const labelW = ctx.measureText(labelText).width + 12;
            const labelY = y - 15;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            roundRectPath(ctx, x - labelW / 2, labelY - 15, labelW, 19, 5);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.fillText(labelText, x, labelY);

            ctx.fillStyle = '#64748b';
            ctx.font = '12px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
            ctx.fillText(`${idx + 1}`, x, yOffset + marginT + plotH + 20);
        });

        ctx.textAlign = 'left';
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 14px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.fillText('측정값', marginL, yOffset + marginT + plotH + 55);
        ctx.font = '13px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
        ctx.fillStyle = '#475569';
        const listText = points.map((p, idx) => `${formatNdtDisplacementPointLabel(idx + 1)}: ${formatNdtDispLevelText(group, idx)}`).join('    ');
        wrapCanvasText(ctx, listText, marginL, yOffset + marginT + plotH + 78, plotW + marginR - 10, 20);
    }

    function renderNdtDisplacementChartDataUrl(group, floorCode) {
        try {
            const canvas = document.createElement('canvas');
            const cw = 900, ch = 620;
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, cw, ch);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, cw - 2, ch - 2);

            drawNdtDisplacementChartBody(ctx, group, floorCode, 0);

            return canvas.toDataURL('image/png');
        } catch (e) {
            console.warn('renderNdtDisplacementChartDataUrl error:', e);
            return null;
        }
    }

    // 숫자 n(1부터 시작)을 동그라미 숫자(①②③…)로 변환. 부동침하/부재변위 요약박스의 "마지막 지점"
    // 라벨은 그룹마다 실제 측정 지점 개수가 다르므로 고정된 ⑨가 아니라 매번 다시 계산해야 한다 —
    // 20개를 넘어가는 드문 경우에는 괄호숫자로 대체한다.
    const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];
    function formatCircledNumber(n) {
        return (n >= 1 && n <= CIRCLED_DIGITS.length) ? CIRCLED_DIGITS[n - 1] : `(${n})`;
    }

    // 부동침하/부재변위 그룹 하나의 요약 박스 + 꺾은선 그래프를 캔버스 한 장에 같이 그려 PNG dataURL로
    // 반환(테두리도 한 번만 둘러서 박스/그래프 선이 서로 어긋나지 않게 함). HWPX 내보내기에서 결과표
    // 밑에 그룹마다 이 그림 하나씩 이어붙이는 데 쓴다(다른 점검업체 보고서의 "요약 박스 + 그래프" 구성).
    function renderNdtDisplacementCombinedCanvas(group, floorCode, seqNo) {
        try {
            const isMemberDisp = group.category === '부재변위';
            const points = group.points || [];
            const first = points[0];
            const last = points[points.length - 1];
            const midIdx = Math.floor(points.length / 2);
            const mid = points[midIdx];
            const calc = calcGroupDisplacement(group);
            const deltaAbs = Math.abs(calc.delta);
            const arrow = calc.delta > 0 ? '↑' : (calc.delta < 0 ? '↓' : '');
            const lengthMmText = group.measureLength ? `${(group.measureLength * 1000).toLocaleString()}mm` : '-';

            const firstLabel = formatCircledNumber(1);
            const lastLabel = formatCircledNumber(points.length);
            const midLabel = formatCircledNumber(midIdx + 1);

            // 라벨은 동그라미 숫자만(값부/중앙부 같은 수식어 없이) — 사용자 요청.
            const cols = [{ label: `NO.${seqNo}`, value: group.locationType || '-', wide: true }];
            if (isMemberDisp) {
                cols.push({ label: firstLabel, value: first ? formatNdtDispLevelText(group, 0) : '-' });
                cols.push({ label: midLabel, value: mid ? formatNdtDispLevelText(group, midIdx) : '-' });
                cols.push({ label: lastLabel, value: last ? formatNdtDispLevelText(group, points.length - 1) : '-' });
                cols.push({ label: `처짐량총합\n((${firstLabel}+${lastLabel})/2-${midLabel})`, value: `${arrow}${deltaAbs.toFixed(1)}${calc.unit || 'cm'}` });
            } else {
                cols.push({ label: firstLabel, value: first ? formatNdtDispLevelText(group, 0) : '-' });
                cols.push({ label: lastLabel, value: last ? formatNdtDispLevelText(group, points.length - 1) : '-' });
                cols.push({ label: '변위량총합', value: `${arrow}${deltaAbs.toFixed(1)}${calc.unit || 'cm'}` });
            }
            cols.push({ label: `변위평가\n(L=${lengthMmText})`, value: calc.tiltRatio || '-' });

            // W:H가 보고서에 삽입될 때 쓰는 박스(42520 x 27000, insertGroupResultImages의 maxW/maxH)와
            // 같은 비율이어야 높이 제한에 걸려 폭이 줄어들지 않고 보고서 폭에 꽉 차게 나온다(사용자 요청).
            const W = 1150, BOX_H = 110, CHART_H = 620;
            const H = BOX_H + CHART_H;
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);

            // 요약 박스 (위쪽 BOX_H)
            const wideW = 220;
            const restW = (W - wideW) / (cols.length - 1);
            ctx.textAlign = 'center';
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#94a3b8';
            let x = 0;
            cols.forEach((col, i) => {
                const w = col.wide ? wideW : restW;
                if (i > 0) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, BOX_H);
                    ctx.stroke();
                }
                const cx = x + w / 2;
                ctx.fillStyle = '#555555';
                ctx.font = '15px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
                String(col.label).split('\n').forEach((line, li) => {
                    ctx.fillText(line, cx, 22 + li * 18);
                });
                ctx.fillStyle = '#111111';
                ctx.font = 'bold 24px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
                ctx.fillText(col.value, cx, BOX_H - 26);
                x += w;
            });

            // 박스/그래프 경계선 + 그래프 본체 (아래쪽 CHART_H, 같은 함수로 그래프 단독 이미지와 공유)
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, BOX_H);
            ctx.lineTo(W, BOX_H);
            ctx.stroke();
            drawNdtDisplacementChartBody(ctx, group, floorCode, BOX_H, W, CHART_H);

            // 박스+그래프 전체를 한 번에 둘러싸는 테두리 — 박스 따로/그래프 따로 선이 어긋나 보이지
            // 않도록 맨 마지막에 통째로 한 번만 그린다.
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, W - 2, H - 2);

            return canvas.toDataURL('image/png');
        } catch (e) {
            console.warn('renderNdtDisplacementCombinedCanvas error:', e);
            return null;
        }
    }

    window.showNdtDisplacementChart = function(groupId) {
        const group = getCurrentFloorDisplacementGroups().find(g => g.id === groupId);
        if (!group) return;
        if (!ndtDispGroupLevelsComplete(group) || !(Number(group.measureLength) > 0)) {
            window.showToast('위치·측정길이·모든 지점 레벨을 입력한 뒤 그래프를 확인하세요. NO.박스를 눌러 일괄 입력할 수 있습니다.', 'warning', 3800);
            openNdtDisplacementGroupEditModal(group);
            return;
        }
        const dataUrl = renderNdtDisplacementChartDataUrl(group, state.currentFloor);
        if (!dataUrl) {
            window.showToast('그래프를 생성할 수 없습니다.', 'error');
            return;
        }
        const img = document.getElementById('ndtDispChartImage');
        if (img) img.src = dataUrl;
        const modal = document.getElementById('ndtDisplacementChartModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function viewToNdtImgCoords(vx, vy) {
        const angle = ndtRotationAngle || 0;
        const { w: imgW, h: imgH } = getNdtDrawingDims();

        if (angle === 90) {
            return { x: vy, y: imgH - vx };
        } else if (angle === 180) {
            return { x: imgW - vx, y: imgH - vy };
        } else if (angle === 270) {
            return { x: imgW - vy, y: vx };
        }
        return { x: vx, y: vy };
    }

    function initNdtEvents() {
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas || canvas._ndtBound) return;
        canvas._ndtBound = true;

        canvas.addEventListener('mousedown', (e) => {
            // 터치 직후 합성 마우스 → 빈 곳 마퀴/오선택 방지
            if (ndtActivePointerIsTouch || Date.now() < ndtSuppressMouseUntil) return;
            if (e.button === 1) {
                e.preventDefault();
                ndtStartMouseX = e.clientX;
                ndtStartMouseY = e.clientY;
                ndtInitialOffsetX = ndtView.offsetX;
                ndtInitialOffsetY = ndtView.offsetY;
                isNdtDragging = true;
                isNdtMarkingDrag = false;
                isNdtDisplacementMarking = false;
                isNdtMarqueeSelecting = false;
                isDraggingNdtPinGroup = false;
                pendingNdtDispHit = null;
                pendingNdtPinHit = null;
                canvas.style.cursor = 'grabbing';
                return;
            }
            if (e.button !== 0) return;
            const additive = !!(e.ctrlKey || e.metaKey);
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const rawVx = (mouseX - ndtView.offsetX) / ndtView.scale;
            const rawVy = (mouseY - ndtView.offsetY) / ndtView.scale;
            const pt = viewToNdtImgCoords(rawVx, rawVy);
            const vx = pt.x;
            const vy = pt.y;

            ndtStartMouseX = e.clientX;
            ndtStartMouseY = e.clientY;
            ndtInitialOffsetX = ndtView.offsetX;
            ndtInitialOffsetY = ndtView.offsetY;

            // 균열모니터: 도면에 찍은 게이지 마킹(아래 일반 핀 처리)이 우선, 없으면 예전 방식의
            // 균열 결함 연결 게이지 핀. 빈 곳은 MARK면 새 게이지 마킹, PAN이면 열린 팝업 닫기.
            if (currentNdtCategory === '균열모니터' && !findNdtPinAt(vx, vy)) {
                const crackHit = findHitPinPart(vx, vy);
                if (crackHit && crackHit.defect && isLegacyCrackMonitorDefect(crackHit.defect)) {
                    pendingNdtCrackDefectHit = { defect: crackHit.defect, grabX: vx, grabY: vy };
                    return;
                }
                if (ndtMode === 'PAN' && isNdtCrackMonitorModalOpen()) {
                    closeNdtCrackMonitorModal();
                    return;
                }
            }
            // 바닥 수직변위 및 부재변위: 전용 그룹/포인트 히트
            if (currentNdtCategory === '변위' || currentNdtCategory === '부재변위') {
                const hitDisp = findNdtDisplacementHit(vx, vy);
                if (hitDisp) {
                    const gid = hitDisp.group && hitDisp.group.id;
                    const selKey = gid ? ndtDispSelKey(gid) : null;
                    if (selKey) {
                        if (additive) {
                            if (selectedNdtIds.has(selKey)) selectedNdtIds.delete(selKey);
                            else selectedNdtIds.add(selKey);
                        } else if (!selectedNdtIds.has(selKey) || selectedNdtIds.size <= 1) {
                            selectedNdtIds = new Set([selKey]);
                        }
                        updateNdtSelectionBar();
                        drawNdtCanvas();
                    }
                    pendingNdtDispHit = { hit: hitDisp, grabX: vx, grabY: vy, additive };
                    pendingNdtDispIsTouch = false;
                    if (pendingNdtLongPressTimer) {
                        clearTimeout(pendingNdtLongPressTimer);
                        pendingNdtLongPressTimer = null;
                    }
                    pendingNdtDispArmed = true; // 마우스: 홀딩 없이 바로 드래그
                    return;
                }
            } else {
                // Check hit test on existing NDT pin (Box or Target point)
                // 클릭=수정창 / 드래그=이동 — 임계값 넘기기 전에는 pending만 보관
                const hitPin = findNdtPinAt(vx, vy);
                if (hitPin) {
                    const id = hitPin.item && hitPin.item.id;
                    if (id) {
                        if (additive) {
                            if (selectedNdtIds.has(id)) selectedNdtIds.delete(id);
                            else selectedNdtIds.add(id);
                        } else if (!selectedNdtIds.has(id) || selectedNdtIds.size <= 1) {
                            selectedNdtIds = new Set([id]);
                        }
                        updateNdtSelectionBar();
                        drawNdtCanvas();
                    }
                    pendingNdtPinHit = {
                        item: hitPin.item,
                        part: hitPin.part,
                        grabX: vx,
                        grabY: vy,
                        additive
                    };
                    pendingNdtPinIsTouch = false;
                    pendingNdtPinArmed = true;
                    ndtActivePointerIsTouch = false;
                    clearPendingNdtLongPress();
                    return;
                }
            }

            // 빈 곳 클릭 + 등록창 열려 있으면 닫기 (결함위치도와 동일)
            if (ndtMode === 'PAN' && currentNdtCategory === '균열모니터' && isNdtCrackMonitorModalOpen()) {
                closeNdtCrackMonitorModal();
                return;
            }
            if (ndtMode === 'PAN' && isNdtModalOpen()) {
                if (window.BsaTypingPopup && typeof window.BsaTypingPopup.isOpen === 'function' && window.BsaTypingPopup.isOpen()) return;
                if (window.BsaFinishMemberChooser && typeof window.BsaFinishMemberChooser.isOpen === 'function' && window.BsaFinishMemberChooser.isOpen()) return;
                closeNdtModal();
                if (!additive) {
                    selectedNdtIds.clear();
                    updateNdtSelectionBar();
                    drawNdtCanvas();
                }
                return;
            }

            // 바닥 수직변위 및 부재변위: 빈 곳 클릭 시 새 지점 등록
            if (currentNdtCategory === '변위' || currentNdtCategory === '부재변위') {
                if (ndtMode === 'MARK') {
                    isNdtDisplacementMarking = true;
                    window._ndtDispMarkCoords = { x: vx, y: vy };
                    return;
                }
            } else if (ndtMode === 'MARK') {
                // 균열모니터도 일반 마킹과 같이 찍기/끌기 → 놓을 때 게이지 마킹 생성
                isNdtMarkingDrag = true;
                window._ndtMarkStartCoords = { x: vx, y: vy };
                window._ndtMarkCurrentCoords = { x: vx, y: vy };
            } else {
                // 좌클릭 빈 곳 = 마퀴 선택 (화면 이동은 휠클릭)
                isNdtMarqueeSelecting = true;
                ndtMarqueeAdditive = additive;
                ndtMarqueeStartX = vx;
                ndtMarqueeStartY = vy;
                ndtMarqueeCurX = vx;
                ndtMarqueeCurY = vy;
                ndtMarqueeStartClientX = e.clientX;
                ndtMarqueeStartClientY = e.clientY;
                canvas.style.cursor = 'crosshair';
                drawNdtCanvas();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (ndtActivePointerIsTouch) return;
            const canvas = document.getElementById('ndtCanvas');
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const rawVx = (mouseX - ndtView.offsetX) / ndtView.scale;
            const rawVy = (mouseY - ndtView.offsetY) / ndtView.scale;
            const pt = viewToNdtImgCoords(rawVx, rawVy);
            const vx = pt.x;
            const vy = pt.y;

            if (pendingNdtPinHit && !isDraggingNdtPin && !isDraggingNdtPinGroup) {
                const dx = e.clientX - ndtStartMouseX;
                const dy = e.clientY - ndtStartMouseY;
                if (Math.hypot(dx, dy) > 6 && (pendingNdtPinArmed || !pendingNdtPinIsTouch)) {
                    const item = pendingNdtPinHit.item;
                    const grabX = pendingNdtPinHit.grabX;
                    const grabY = pendingNdtPinHit.grabY;
                    const multiGroup = item && item.id
                        && selectedNdtIds.size > 1
                        && selectedNdtIds.has(item.id)
                        && pendingNdtPinHit.part === 'box';
                    clearPendingNdtLongPress();
                    if (multiGroup) {
                        isDraggingNdtPinGroup = true;
                        ndtGroupDragLastX = grabX;
                        ndtGroupDragLastY = grabY;
                        pendingNdtPinHit = null;
                        canvas.style.cursor = 'move';
                    } else {
                        isDraggingNdtPin = true;
                        activeDragNdtPin = item;
                        dragNdtPart = pendingNdtPinHit.part;
                        if (dragNdtPart === 'rotate') {
                            beginNdtTiltRotateSession(item, grabX, grabY, item.category || '기울기');
                        } else if (dragNdtPart === 'target') {
                            ndtPinDragOffsetX = grabX - (item.targetX !== undefined ? item.targetX : (item.x || 0));
                            ndtPinDragOffsetY = grabY - (item.targetY !== undefined ? item.targetY : (item.y || 0));
                        } else if (dragNdtPart === 'box') {
                            ndtPinDragOffsetX = grabX - (item.boxX !== undefined ? item.boxX : (item.x || 0));
                            ndtPinDragOffsetY = grabY - (item.boxY !== undefined ? item.boxY : (item.y || 0));
                        } else {
                            ndtPinDragOffsetX = grabX - (item.x || 0);
                            ndtPinDragOffsetY = grabY - (item.y || 0);
                        }
                        pendingNdtPinHit = null;
                        canvas.style.cursor = 'move';
                    }
                } else {
                    return;
                }
            }

            if (pendingNdtDispHit && !isDraggingNdtDisplacement) {
                const dx = e.clientX - ndtStartMouseX;
                const dy = e.clientY - ndtStartMouseY;
                if (Math.hypot(dx, dy) > 6) {
                    isDraggingNdtDisplacement = true;
                    activeDragNdtDisplacementGroup = pendingNdtDispHit.hit.group;
                    activeDragNdtDisplacementPoint = pendingNdtDispHit.hit.type === 'point' ? pendingNdtDispHit.hit.point : null;
                    const grabX = pendingNdtDispHit.grabX;
                    const grabY = pendingNdtDispHit.grabY;
                    if (activeDragNdtDisplacementPoint) {
                        ndtDispDragOffsetX = grabX - activeDragNdtDisplacementPoint.x;
                        ndtDispDragOffsetY = grabY - activeDragNdtDisplacementPoint.y;
                    } else {
                        const g = activeDragNdtDisplacementGroup;
                        const bx = g.boxX !== undefined ? g.boxX : (g.points[0] ? g.points[0].x : 0);
                        const by = g.boxY !== undefined ? g.boxY : (g.points[0] ? g.points[0].y : 0);
                        ndtDispDragOffsetX = grabX - bx;
                        ndtDispDragOffsetY = grabY - by;
                    }
                    pendingNdtDispHit = null;
                    canvas.style.cursor = 'move';
                } else {
                    return;
                }
            }

            if (isDraggingNdtDisplacement && activeDragNdtDisplacementGroup) {
                if (activeDragNdtDisplacementPoint) {
                    activeDragNdtDisplacementPoint.x = vx - ndtDispDragOffsetX;
                    activeDragNdtDisplacementPoint.y = vy - ndtDispDragOffsetY;
                } else {
                    activeDragNdtDisplacementGroup.boxX = vx - ndtDispDragOffsetX;
                    activeDragNdtDisplacementGroup.boxY = vy - ndtDispDragOffsetY;
                }
                drawNdtCanvas();
            } else if (isDraggingNdtPinGroup) {
                const dx = vx - ndtGroupDragLastX;
                const dy = vy - ndtGroupDragLastY;
                if (dx || dy) {
                    const floorPins = getCurrentFloorNdtData();
                    selectedNdtIds.forEach((id) => {
                        if (String(id).startsWith('disp_')) {
                            const gid = id.slice(5);
                            const g = getCurrentFloorDisplacementGroups(currentNdtCategory).find(x => x.id === gid);
                            if (g) translateNdtDispGroupBy(g, dx, dy);
                        } else {
                            const pin = floorPins.find(x => x.id === id);
                            if (pin) translateNdtPinBy(pin, dx, dy);
                        }
                    });
                    ndtGroupDragLastX = vx;
                    ndtGroupDragLastY = vy;
                    drawNdtCanvas();
                }
            } else if (isDraggingNdtPin && activeDragNdtPin) {
                if (dragNdtPart === 'rotate') {
                    applyNdtTiltRotateSession(activeDragNdtPin, activeDragNdtPin.category || '기울기', vx, vy);
                } else if (dragNdtPart === 'target') {
                    if (activeDragNdtPin.category === '기울기') {
                        updateNdtTiltArrowFromDrag(activeDragNdtPin, '기울기', vx, vy);
                    } else {
                        activeDragNdtPin.targetX = vx - ndtPinDragOffsetX;
                        activeDragNdtPin.targetY = vy - ndtPinDragOffsetY;
                    }
                } else if (dragNdtPart === 'box') {
                    activeDragNdtPin.boxX = vx - ndtPinDragOffsetX;
                    activeDragNdtPin.boxY = vy - ndtPinDragOffsetY;
                } else {
                    const newX = vx - ndtPinDragOffsetX;
                    const newY = vy - ndtPinDragOffsetY;
                    const dx = newX - (activeDragNdtPin.x || newX);
                    const dy = newY - (activeDragNdtPin.y || newY);
                    activeDragNdtPin.x = newX;
                    activeDragNdtPin.y = newY;
                    activeDragNdtPin.boxX = (activeDragNdtPin.boxX !== undefined ? activeDragNdtPin.boxX : newX) + dx;
                    activeDragNdtPin.boxY = (activeDragNdtPin.boxY !== undefined ? activeDragNdtPin.boxY : newY) + dy;
                    activeDragNdtPin.targetX = (activeDragNdtPin.targetX !== undefined ? activeDragNdtPin.targetX : newX) + dx;
                    activeDragNdtPin.targetY = (activeDragNdtPin.targetY !== undefined ? activeDragNdtPin.targetY : newY) + dy;
                }
                drawNdtCanvas();
            } else if (isNdtMarqueeSelecting) {
                ndtMarqueeCurX = vx;
                ndtMarqueeCurY = vy;
                drawNdtCanvas();
            } else if (isNdtMarkingDrag) {
                window._ndtMarkCurrentCoords = { x: vx, y: vy };
                drawNdtCanvas();
            } else if (isNdtDragging) {
                const dx = e.clientX - ndtStartMouseX;
                const dy = e.clientY - ndtStartMouseY;
                ndtView.offsetX = ndtInitialOffsetX + dx;
                ndtView.offsetY = ndtInitialOffsetY + dy;
                drawNdtCanvas();
            } else if (mouseX >= 0 && mouseX <= rect.width && mouseY >= 0 && mouseY <= rect.height) {
                if (ndtMode === 'MARK') {
                    canvas.style.cursor = 'crosshair';
                } else if (currentNdtCategory === '변위' || currentNdtCategory === '부재변위') {
                    const hitDisp = findNdtDisplacementHit(vx, vy);
                    if (hitDisp) {
                        canvas.style.cursor = hitDisp.type === 'point' ? 'pointer' : 'move';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                } else if (currentNdtCategory === '균열모니터') {
                    const gaugeHit = findNdtPinAt(vx, vy);
                    const crackHit = gaugeHit ? null : findHitPinPart(vx, vy);
                    if (gaugeHit) {
                        canvas.style.cursor = gaugeHit.part === 'target' ? 'pointer' : 'move';
                    } else if (crackHit && crackHit.defect && isLegacyCrackMonitorDefect(crackHit.defect)) {
                        canvas.style.cursor = 'pointer';
                    } else {
                        canvas.style.cursor = 'default';
                    }
                } else {
                    const hit = findNdtPinAt(vx, vy);
                    if (hit) {
                        canvas.style.cursor = hit.part === 'target' ? 'pointer' : (hit.part === 'rotate' ? 'grab' : 'move');
                    } else {
                        canvas.style.cursor = 'default';
                    }
                }
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (ndtActivePointerIsTouch) return;
            try {
            if (pendingNdtCrackDefectHit && !isDraggingNdtPin && !isDraggingNdtPinGroup) {
                const defect = pendingNdtCrackDefectHit.defect;
                pendingNdtCrackDefectHit = null;
                if (defect && defect.id) openNdtCrackMonitorModal(defect.id, state.currentFloor);
                return;
            }
            if (pendingNdtPinHit && !isDraggingNdtPin && !isDraggingNdtPinGroup) {
                const item = pendingNdtPinHit.item;
                const wasAdditive = !!pendingNdtPinHit.additive;
                const part = pendingNdtPinHit.part;
                pendingNdtPinHit = null;
                if (part === 'rotate') return;
                if (item && !wasAdditive) openNdtItemEditor(item);
                return;
            }
            if (pendingNdtDispHit && !isDraggingNdtDisplacement) {
                const hit = pendingNdtDispHit.hit;
                const wasAdditive = !!pendingNdtDispHit.additive;
                pendingNdtDispHit = null;
                if (wasAdditive) return;
                if (hit.type === 'point') {
                    setActiveNdtDispGroup(hit.group);
                    openNdtDisplacementModal(hit.point.x, hit.point.y, hit.group, hit.point);
                } else {
                    setActiveNdtDispGroup(hit.group);
                    openNdtDisplacementGroupEditModal(hit.group);
                    window.showToast(`${hit.group.groupNo} 구역 · 레벨·길이를 입력하세요 (마킹 시 지점 번호 이어짐)`, 'info', 2800);
                }
                return;
            }
            pendingNdtDispHit = null;
            if (isDraggingNdtDisplacement) {
                // 지점을 끌어 옮긴 것도 구역 수정이다 — 시각을 올려야 다른 기기의 옛 위치가 이기지 않는다
                touchNdtDispGroup(activeDragNdtDisplacementGroup);
                isDraggingNdtDisplacement = false;
                activeDragNdtDisplacementGroup = null;
                activeDragNdtDisplacementPoint = null;
                saveStateToLocalStorage();
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
                drawNdtCanvas();
            }
            if (isNdtDisplacementMarking) {
                isNdtDisplacementMarking = false;
                const coords = window._ndtDispMarkCoords || { x: 100, y: 100 };
                placeNdtDisplacementMarkAndEdit(coords.x, coords.y);
            }
            if (isDraggingNdtPinGroup) {
                touchMovedNdtItems(null);   // 함께 옮긴 핀·구역의 시각을 올린다
                isDraggingNdtPinGroup = false;
                saveStateToLocalStorage();
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
                drawNdtCanvas();
            }
            if (isDraggingNdtPin) {
                if (activeDragNdtPin) {
                    window._pendingNdtExtra = {
                        targetX: activeDragNdtPin.targetX !== undefined ? activeDragNdtPin.targetX : (activeDragNdtPin.x || 0),
                        targetY: activeDragNdtPin.targetY !== undefined ? activeDragNdtPin.targetY : (activeDragNdtPin.y || 0),
                        boxX: activeDragNdtPin.boxX !== undefined ? activeDragNdtPin.boxX : (activeDragNdtPin.x || 0),
                        boxY: activeDragNdtPin.boxY !== undefined ? activeDragNdtPin.boxY : (activeDragNdtPin.y || 0)
                    };
                }
                endNdtTiltRotateSession();
                if (activeDragNdtPin) touchMovedNdtItems(activeDragNdtPin);   // 끌어 옮긴 위치가 다른 기기의 옛 위치에 지지 않게
                isDraggingNdtPin = false;
                activeDragNdtPin = null;
                dragNdtPart = 'box';
                saveStateToLocalStorage();
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
                drawNdtCanvas();
            }
            if (isNdtMarqueeSelecting) {
                isNdtMarqueeSelecting = false;
                const x1 = Math.min(ndtMarqueeStartX, ndtMarqueeCurX);
                const y1 = Math.min(ndtMarqueeStartY, ndtMarqueeCurY);
                const x2 = Math.max(ndtMarqueeStartX, ndtMarqueeCurX);
                const y2 = Math.max(ndtMarqueeStartY, ndtMarqueeCurY);
                // 화면 픽셀 기준으로 탭/드래그 구분 (이미지 좌표 임계값은 줌아웃 시 오선택 유발)
                const screenDist = Math.hypot(
                    (e.clientX || 0) - ndtMarqueeStartClientX,
                    (e.clientY || 0) - ndtMarqueeStartClientY
                );
                const tiny = screenDist < 10;
                if (!ndtMarqueeAdditive) selectedNdtIds.clear();
                if (!tiny) {
                    collectNdtMarqueeHits(x1, y1, x2, y2).forEach((id) => {
                        if (ndtMarqueeAdditive) {
                            if (selectedNdtIds.has(id)) selectedNdtIds.delete(id);
                            else selectedNdtIds.add(id);
                        } else {
                            selectedNdtIds.add(id);
                        }
                    });
                }
                ndtMarqueeAdditive = false;
                updateNdtSelectionBar();
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
                drawNdtCanvas();
            }
            if (isNdtMarkingDrag) {
                isNdtMarkingDrag = false;
                const start = window._ndtMarkStartCoords || { x: 100, y: 100 };
                const end = window._ndtMarkCurrentCoords || start;

                const dx = start.x - end.x;
                const dy = start.y - end.y;
                let autoDir = '←';
                if (Math.hypot(dx, dy) > 8) {
                    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                    if (angleDeg >= -22.5 && angleDeg < 22.5) autoDir = '→';
                    else if (angleDeg >= 22.5 && angleDeg < 67.5) autoDir = '↘';
                    else if (angleDeg >= 67.5 && angleDeg < 112.5) autoDir = '↓';
                    else if (angleDeg >= 112.5 && angleDeg < 157.5) autoDir = '↙';
                    else if (angleDeg >= 157.5 || angleDeg < -157.5) autoDir = '←';
                    else if (angleDeg >= -157.5 && angleDeg < -112.5) autoDir = '↖';
                    else if (angleDeg >= -112.5 && angleDeg < -67.5) autoDir = '↑';
                    else if (angleDeg >= -67.5 && angleDeg < -22.5) autoDir = '↗';
                }

                const distMoved = Math.hypot(start.x - end.x, start.y - end.y);
                const targetX = start.x;
                const targetY = start.y;
                const boxX = distMoved > 10 ? end.x : start.x;
                const boxY = distMoved > 10 ? end.y : (start.y + 60);

                if (currentNdtCategory === '균열모니터') {
                    createCrackGaugeMarkAt({ targetX, targetY, boxX, boxY });
                } else openNdtModal(start.x, start.y, null, {
                    targetX,
                    targetY,
                    boxX,
                    boxY,
                    dispDirection: autoDir
                });
            }
            if (isNdtDragging) {
                isNdtDragging = false;
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
            }
            } finally {
                if (typeof scheduleFlushPendingRemoteSync === 'function') scheduleFlushPendingRemoteSync();
            }
        });

        canvas.addEventListener('auxclick', (e) => {
            if (e.button === 1) e.preventDefault();
        });

        const btnDelNdtSel = document.getElementById('btnDeleteSelectedNdt');
        if (btnDelNdtSel && !btnDelNdtSel.dataset.ndtSelBound) {
            btnDelNdtSel.dataset.ndtSelBound = '1';
            btnDelNdtSel.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteSelectedNdtMarks();
            });
        }

        const btnRotateNdtSel = document.getElementById('btnRotateSelectedNdtTilt');
        if (btnRotateNdtSel && !btnRotateNdtSel.dataset.ndtSelBound) {
            btnRotateNdtSel.dataset.ndtSelBound = '1';
            btnRotateNdtSel.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.rotateSelectedNdtTiltBoxes();
            });
        }
        const btnRotateNdtMobile = document.getElementById('mobileNdtBtnRotateTilt');
        if (btnRotateNdtMobile && !btnRotateNdtMobile.dataset.ndtSelBound) {
            btnRotateNdtMobile.dataset.ndtSelBound = '1';
            btnRotateNdtMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.rotateSelectedNdtTiltBoxes();
            });
        }
        syncNdtTiltRotateButtons();
        syncNdtDispUndoButton();

        const btnUndoDisp = document.getElementById('btnNdtUndoDispMark');
        if (btnUndoDisp && !btnUndoDisp.dataset.ndtUndoBound) {
            btnUndoDisp.dataset.ndtUndoBound = '1';
            btnUndoDisp.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                undoLastNdtDisplacementMark();
            });
        }
        const btnUndoDispMobile = document.getElementById('mobileNdtBtnUndoDisp');
        if (btnUndoDispMobile && !btnUndoDispMobile.dataset.ndtUndoBound) {
            btnUndoDispMobile.dataset.ndtUndoBound = '1';
            btnUndoDispMobile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                undoLastNdtDisplacementMark();
            });
        }

        canvas.addEventListener('touchstart', (e) => {
            ndtTouchStartedOnCanvas = true;
            if (e.touches.length === 1 && !isNdtPinching) {
                const touch = e.touches[0];
                const pt = ndtClientToImg(touch.clientX, touch.clientY);
                const vx = pt.x;
                const vy = pt.y;

                ndtStartMouseX = touch.clientX;
                ndtStartMouseY = touch.clientY;
                ndtInitialOffsetX = ndtView.offsetX;
                ndtInitialOffsetY = ndtView.offsetY;
                ndtActivePointerIsTouch = true;
                ndtTouchMayPageScroll = false;
                ndtSuppressMouseUntil = Date.now() + 700;
                isNdtMarqueeSelecting = false;
                clearPendingNdtLongPress();

                if (currentNdtCategory === '균열모니터' && !findNdtPinAt(vx, vy)) {
                    const crackHit = findHitPinPart(vx, vy);
                    if (crackHit && crackHit.defect && isLegacyCrackMonitorDefect(crackHit.defect)) {
                        if (e.cancelable) e.preventDefault();
                        pendingNdtCrackDefectHit = { defect: crackHit.defect, grabX: vx, grabY: vy };
                        return;
                    }
                    if (ndtMode === 'PAN' && isNdtCrackMonitorModalOpen()) {
                        if (e.cancelable) e.preventDefault();
                        closeNdtCrackMonitorModal();
                        return;
                    }
                }

                const hitPin = findNdtPinAt(vx, vy);
                if (hitPin) {
                    if (e.cancelable) e.preventDefault();
                    const id = hitPin.item && hitPin.item.id;
                    // 2026-10-20 결함위치도와 같게: 누르는 순간엔 선택을 바꾸지 않는다(그대로 밀면 도면 팬, 선택 유지).
                    // 떼면(탭) 선택 → 이미 선택된 것을 다시 탭하면 수정창. 0.3초 꾹 누르면 선택하고 끌어 이동.
                    pendingNdtPinHit = {
                        item: hitPin.item,
                        part: hitPin.part,
                        grabX: vx,
                        grabY: vy,
                        wasSelected: !!(id && selectedNdtIds.has(id)),
                        startedAt: Date.now()
                    };
                    pendingNdtPinIsTouch = true;
                    pendingNdtPinArmed = false;
                    pendingNdtLongPressTimer = setTimeout(() => {
                        if (!pendingNdtPinHit || !pendingNdtPinIsTouch) return;
                        pendingNdtPinArmed = true;
                        const hid = pendingNdtPinHit.item && pendingNdtPinHit.item.id;
                        if (hid && !selectedNdtIds.has(hid)) {
                            if (ndtAddSelectEnabled) selectedNdtIds.add(hid);
                            else selectedNdtIds = new Set([hid]);
                            updateNdtSelectionBar();
                        }
                        try { if (navigator.vibrate) navigator.vibrate(12); } catch (_e) { /* ignore */ }
                        drawNdtCanvas();
                        refreshNdtLoupe(ndtStartMouseX, ndtStartMouseY);
                    }, NDT_TOUCH_LONG_PRESS_MS);
                    return;
                }

                if (currentNdtCategory === '변위' || currentNdtCategory === '부재변위') {
                    // 터치: 지점 원과 구역 박스가 겹치면 박스 먼저
                    const hitDisp = findNdtDisplacementHit(vx, vy, { boxOnly: true }) || findNdtDisplacementHit(vx, vy);
                    if (hitDisp) {
                        if (e.cancelable) e.preventDefault();
                        const dispKey = hitDisp.group && hitDisp.group.id ? ndtDispSelKey(hitDisp.group.id) : '';
                        pendingNdtDispHit = { hit: hitDisp, grabX: vx, grabY: vy, wasSelected: !!(dispKey && selectedNdtIds.has(dispKey)) };
                        pendingNdtDispIsTouch = true;
                        pendingNdtDispArmed = false;
                        // 0.3초 꾹 누른 뒤 끌면 이동 (바로 밀면 도면 팬)
                        pendingNdtLongPressTimer = setTimeout(() => {
                            if (!pendingNdtDispHit || !pendingNdtDispIsTouch) return;
                            pendingNdtDispArmed = true;
                            if (dispKey && !selectedNdtIds.has(dispKey)) {
                                if (ndtAddSelectEnabled) selectedNdtIds.add(dispKey);
                                else selectedNdtIds = new Set([dispKey]);
                                updateNdtSelectionBar();
                            }
                            try { if (navigator.vibrate) navigator.vibrate(12); } catch (_e) { /* ignore */ }
                            drawNdtCanvas();
                        }, NDT_TOUCH_LONG_PRESS_MS);
                        return;
                    }
                    if (ndtMode === 'MARK') {
                        if (e.cancelable) e.preventDefault();
                        ndtGestureCancelledByPinch = false;
                        isNdtDisplacementMarking = true;
                        window._ndtDispMarkCoords = { x: vx, y: vy };
                        return;
                    }
                }

                if (ndtMode === 'MARK') {
                    if (e.cancelable) e.preventDefault();
                    // 균열모니터도 일반 마킹과 같이 찍기/끌기 → 손을 떼면 게이지 마킹 생성
                    isNdtMarkingDrag = true;
                    window._ndtMarkStartCoords = { x: vx, y: vy };
                    window._ndtMarkCurrentCoords = { x: vx, y: vy };
                } else if (ndtMarqueeSelectEnabled && ndtMode === 'PAN') {
                    if (e.cancelable) e.preventDefault();
                    isNdtMarqueeSelecting = true;
                    ndtMarqueeAdditive = ndtAddSelectEnabled;
                    ndtMarqueeStartX = vx;
                    ndtMarqueeStartY = vy;
                    ndtMarqueeCurX = vx;
                    ndtMarqueeCurY = vy;
                    ndtMarqueeStartClientX = touch.clientX;
                    ndtMarqueeStartClientY = touch.clientY;
                    canvas.style.cursor = 'crosshair';
                    drawNdtCanvas();
                } else if (layoutIsCompactWidth()) {
                    // 모바일 PAN: 도면 위 한손가락 드래그는 페이지 스크롤이 아니라 도면 팬만
                    ndtTouchMayPageScroll = false;
                    isNdtDragging = true;
                    if (e.cancelable) e.preventDefault();
                } else {
                    ndtTouchMayPageScroll = false;
                    isNdtDragging = true;
                }
            } else if (e.touches.length >= 2) {
                cancelNdtGestureForPinch();
                isNdtPinching = true;
                hideTouchLoupe(NDT_LOUPE_ID);
                const rect = canvas.getBoundingClientRect();
                ndtPinchDist = getTouchDistance(e.touches[0], e.touches[1]);
                ndtPinchScale = ndtView.scale;
                const mid = getTouchMidpoint(e.touches[0], e.touches[1], rect);
                ndtPinchMidX = mid.x;
                ndtPinchMidY = mid.y;
                ndtPinchOffsetX = ndtView.offsetX;
                ndtPinchOffsetY = ndtView.offsetY;
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            // 조사표 등 다른 탭 / 도면 밖에서 시작한 터치 → 스크롤 잠금 금지
            if (window.state && window.state.currentTab !== 'tab-ndt') return;
            if (!ndtTouchStartedOnCanvas) return;
            if (isNdtPinching && e.touches.length >= 2) {
                if (e.cancelable) e.preventDefault();
                const canvas = document.getElementById('ndtCanvas');
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
                if (ndtPinchDist > 0) {
                    const scaleFactor = currentDist / ndtPinchDist;
                    const lim = getNdtViewScaleLimits();
                    const newScale = Math.min(Math.max(lim.min, ndtPinchScale * scaleFactor), lim.max);
                    const currentMid = getTouchMidpoint(e.touches[0], e.touches[1], rect);

                    const imgX = (ndtPinchMidX - ndtPinchOffsetX) / ndtPinchScale;
                    const imgY = (ndtPinchMidY - ndtPinchOffsetY) / ndtPinchScale;

                    ndtView.scale = newScale;
                    ndtView.offsetX = currentMid.x - imgX * newScale;
                    ndtView.offsetY = currentMid.y - imgY * newScale;

                    const zoomTxt = document.getElementById('ndtZoomScaleText');
                    if (zoomTxt) zoomTxt.textContent = formatNdtZoomLabel();
                    drawNdtCanvas();
                }
            } else if (!isNdtPinching && (pendingNdtPinHit || isDraggingNdtPin) && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                const canvas = document.getElementById('ndtCanvas');
                if (!canvas) return;
                const touch = e.touches[0];

                if (pendingNdtPinHit && !isDraggingNdtPin) {
                    const dx = touch.clientX - ndtStartMouseX;
                    const dy = touch.clientY - ndtStartMouseY;
                    const dist = Math.hypot(dx, dy);
                    if (!pendingNdtPinArmed) {
                        // 번호박스·화살표(target) 모두: 홀딩 전 이동이면 도면 팬
                        if (dist > 14) {
                            clearPendingNdtLongPress();
                            pendingNdtPinHit = null;
                            isNdtDragging = true;
                        }
                        return;
                    }
                    if (dist <= 8) {
                        refreshNdtLoupe(touch.clientX, touch.clientY);
                        return;
                    }
                    const item = pendingNdtPinHit.item;
                    const grabX = pendingNdtPinHit.grabX;
                    const grabY = pendingNdtPinHit.grabY;
                    const multiGroup = item && item.id
                        && selectedNdtIds.size > 1
                        && selectedNdtIds.has(item.id)
                        && pendingNdtPinHit.part === 'box';
                    if (pendingNdtLongPressTimer) {
                        clearTimeout(pendingNdtLongPressTimer);
                        pendingNdtLongPressTimer = null;
                    }
                    if (multiGroup) {
                        isDraggingNdtPinGroup = true;
                        ndtGroupDragLastX = grabX;
                        ndtGroupDragLastY = grabY;
                        pendingNdtPinHit = null;
                    } else {
                        isDraggingNdtPin = true;
                        activeDragNdtPin = item;
                        dragNdtPart = pendingNdtPinHit.part;
                        if (dragNdtPart === 'rotate') {
                            beginNdtTiltRotateSession(item, grabX, grabY, item.category || '기울기');
                        } else if (dragNdtPart === 'target') {
                            ndtPinDragOffsetX = grabX - (item.targetX !== undefined ? item.targetX : (item.x || 0));
                            ndtPinDragOffsetY = grabY - (item.targetY !== undefined ? item.targetY : (item.y || 0));
                        } else if (dragNdtPart === 'box') {
                            ndtPinDragOffsetX = grabX - (item.boxX !== undefined ? item.boxX : (item.x || 0));
                            ndtPinDragOffsetY = grabY - (item.boxY !== undefined ? item.boxY : (item.y || 0));
                        } else {
                            ndtPinDragOffsetX = grabX - (item.x || 0);
                            ndtPinDragOffsetY = grabY - (item.y || 0);
                        }
                        pendingNdtPinHit = null;
                    }
                }

                if (isDraggingNdtPinGroup) {
                    const pt = ndtClientToImg(touch.clientX, touch.clientY);
                    const dx = pt.x - ndtGroupDragLastX;
                    const dy = pt.y - ndtGroupDragLastY;
                    ndtGroupDragLastX = pt.x;
                    ndtGroupDragLastY = pt.y;
                    const items = getCurrentFloorNdtData();
                    selectedNdtIds.forEach((id) => {
                        if (String(id).startsWith('disp_')) return;
                        const it = items.find(x => x && x.id === id);
                        if (!it) return;
                        if (it.boxX !== undefined) it.boxX += dx;
                        if (it.boxY !== undefined) it.boxY += dy;
                        if (it.targetX !== undefined) it.targetX += dx;
                        if (it.targetY !== undefined) it.targetY += dy;
                        if (it.x !== undefined) it.x += dx;
                        if (it.y !== undefined) it.y += dy;
                    });
                    drawNdtCanvas();
                    refreshNdtLoupe(touch.clientX, touch.clientY);
                    return;
                }

                if (!isDraggingNdtPin || !activeDragNdtPin) return;

                const pt = ndtClientToImg(touch.clientX, touch.clientY);
                const vx = pt.x;
                const vy = pt.y;

                if (dragNdtPart === 'rotate') {
                    applyNdtTiltRotateSession(activeDragNdtPin, activeDragNdtPin.category || '기울기', vx, vy);
                } else if (dragNdtPart === 'target') {
                    if (activeDragNdtPin.category === '기울기') {
                        updateNdtTiltArrowFromDrag(activeDragNdtPin, '기울기', vx, vy);
                    } else {
                        activeDragNdtPin.targetX = vx - ndtPinDragOffsetX;
                        activeDragNdtPin.targetY = vy - ndtPinDragOffsetY;
                    }
                } else if (dragNdtPart === 'box') {
                    activeDragNdtPin.boxX = vx - ndtPinDragOffsetX;
                    activeDragNdtPin.boxY = vy - ndtPinDragOffsetY;
                } else {
                    const newX = vx - ndtPinDragOffsetX;
                    const newY = vy - ndtPinDragOffsetY;
                    const dx = newX - (activeDragNdtPin.x || newX);
                    const dy = newY - (activeDragNdtPin.y || newY);
                    activeDragNdtPin.x = newX;
                    activeDragNdtPin.y = newY;
                    activeDragNdtPin.boxX = (activeDragNdtPin.boxX !== undefined ? activeDragNdtPin.boxX : newX) + dx;
                    activeDragNdtPin.boxY = (activeDragNdtPin.boxY !== undefined ? activeDragNdtPin.boxY : newY) + dy;
                    activeDragNdtPin.targetX = (activeDragNdtPin.targetX !== undefined ? activeDragNdtPin.targetX : newX) + dx;
                    activeDragNdtPin.targetY = (activeDragNdtPin.targetY !== undefined ? activeDragNdtPin.targetY : newY) + dy;
                }
                drawNdtCanvas();
                refreshNdtLoupe(touch.clientX, touch.clientY);
            } else if (!isNdtPinching && (pendingNdtDispHit || isDraggingNdtDisplacement) && e.touches.length === 1) {
                const canvas = document.getElementById('ndtCanvas');
                if (!canvas) return;
                const touch = e.touches[0];

                if (pendingNdtDispHit && !isDraggingNdtDisplacement) {
                    const dx = touch.clientX - ndtStartMouseX;
                    const dy = touch.clientY - ndtStartMouseY;
                    const dist = Math.hypot(dx, dy);
                    if (pendingNdtDispIsTouch && !pendingNdtDispArmed) {
                        // 홀딩 전 이동 → 도면 팬 (마킹이 따라오지 않음)
                        if (dist > 14) {
                            clearPendingNdtLongPress();
                            pendingNdtDispHit = null;
                            pendingNdtDispIsTouch = false;
                            isNdtDragging = true;
                        }
                        return;
                    }
                    if (dist > 6) {
                        if (e.cancelable) e.preventDefault();
                        isDraggingNdtDisplacement = true;
                        activeDragNdtDisplacementGroup = pendingNdtDispHit.hit.group;
                        activeDragNdtDisplacementPoint = pendingNdtDispHit.hit.type === 'point' ? pendingNdtDispHit.hit.point : null;
                        const grabX = pendingNdtDispHit.grabX;
                        const grabY = pendingNdtDispHit.grabY;
                        if (activeDragNdtDisplacementPoint) {
                            ndtDispDragOffsetX = grabX - activeDragNdtDisplacementPoint.x;
                            ndtDispDragOffsetY = grabY - activeDragNdtDisplacementPoint.y;
                        } else {
                            const g = activeDragNdtDisplacementGroup;
                            const bx = g.boxX !== undefined ? g.boxX : (g.points[0] ? g.points[0].x : 0);
                            const by = g.boxY !== undefined ? g.boxY : (g.points[0] ? g.points[0].y : 0);
                            ndtDispDragOffsetX = grabX - bx;
                            ndtDispDragOffsetY = grabY - by;
                        }
                        pendingNdtDispHit = null;
                        pendingNdtDispIsTouch = false;
                        clearPendingNdtLongPress();
                    } else {
                        return;
                    }
                }

                if (e.cancelable) e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mouseX = touch.clientX - rect.left;
                const mouseY = touch.clientY - rect.top;
                const rawVx = (mouseX - ndtView.offsetX) / ndtView.scale;
                const rawVy = (mouseY - ndtView.offsetY) / ndtView.scale;
                const pt = viewToNdtImgCoords(rawVx, rawVy);
                const vx = pt.x;
                const vy = pt.y;

                if (activeDragNdtDisplacementPoint) {
                    activeDragNdtDisplacementPoint.x = vx - ndtDispDragOffsetX;
                    activeDragNdtDisplacementPoint.y = vy - ndtDispDragOffsetY;
                } else if (activeDragNdtDisplacementGroup) {
                    activeDragNdtDisplacementGroup.boxX = vx - ndtDispDragOffsetX;
                    activeDragNdtDisplacementGroup.boxY = vy - ndtDispDragOffsetY;
                }
                drawNdtCanvas();
            } else if (!isNdtPinching && isNdtMarkingDrag && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                const touch = e.touches[0];
                const pt = ndtClientToImg(touch.clientX, touch.clientY);
                window._ndtMarkCurrentCoords = { x: pt.x, y: pt.y };
                drawNdtCanvas();
                refreshNdtLoupe(touch.clientX, touch.clientY);
            } else if (!isNdtPinching && isNdtDisplacementMarking && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                const touch = e.touches[0];
                const pt = ndtClientToImg(touch.clientX, touch.clientY);
                window._ndtDispMarkCoords = { x: pt.x, y: pt.y };
                drawNdtCanvas();
                refreshNdtLoupe(touch.clientX, touch.clientY);
            } else if (!isNdtPinching && isNdtMarqueeSelecting && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                const touch = e.touches[0];
                const pt = ndtClientToImg(touch.clientX, touch.clientY);
                ndtMarqueeCurX = pt.x;
                ndtMarqueeCurY = pt.y;
                drawNdtCanvas();
            } else if (!isNdtPinching && isNdtDragging && e.touches.length === 1) {
                const touch = e.touches[0];
                const dx = touch.clientX - ndtStartMouseX;
                const dy = touch.clientY - ndtStartMouseY;
                if (e.cancelable) e.preventDefault();
                ndtView.offsetX = ndtInitialOffsetX + dx;
                ndtView.offsetY = ndtInitialOffsetY + dy;
                drawNdtCanvas();
            } else if (!isNdtPinching && ndtTouchMayPageScroll && e.touches.length === 1) {
                // 하위호환: 예전 세로스크롤 분기 — 이제는 도면 팬으로 전환
                const touch = e.touches[0];
                const dx = touch.clientX - ndtStartMouseX;
                const dy = touch.clientY - ndtStartMouseY;
                if (Math.hypot(dx, dy) < 8) return;
                ndtTouchMayPageScroll = false;
                isNdtDragging = true;
                if (e.cancelable) e.preventDefault();
                ndtView.offsetX = ndtInitialOffsetX + dx;
                ndtView.offsetY = ndtInitialOffsetY + dy;
                drawNdtCanvas();
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            try {
            if (isNdtPinching && e.touches.length < 2) isNdtPinching = false;
            clearPendingNdtLongPress();
            // 합성 mouse(down/up)가 마퀴 선택을 시작하지 않도록 잠시 차단
            ndtSuppressMouseUntil = Date.now() + 700;
            const t = e.changedTouches && e.changedTouches[0];
            const tapMoved = t
                ? Math.hypot(t.clientX - ndtStartMouseX, t.clientY - ndtStartMouseY)
                : 99;
            const wasEmptyTap = ndtTouchStartedOnCanvas
                && !pendingNdtPinHit && !pendingNdtDispHit && !pendingNdtCrackDefectHit
                && !isDraggingNdtPin && !isDraggingNdtDisplacement && !isDraggingNdtPinGroup
                && !isNdtMarkingDrag && !isNdtDisplacementMarking && !isNdtPinching
                && ndtMode === 'PAN' && tapMoved < 14;

            ndtActivePointerIsTouch = false;
            ndtTouchMayPageScroll = false;
            if (e.touches.length === 0) ndtTouchStartedOnCanvas = false;
            hideTouchLoupe(NDT_LOUPE_ID);
            if (pendingNdtCrackDefectHit && !isDraggingNdtPin && !isDraggingNdtPinGroup) {
                const defect = pendingNdtCrackDefectHit.defect;
                pendingNdtCrackDefectHit = null;
                if (defect && defect.id) openNdtCrackMonitorModal(defect.id, state.currentFloor);
                return;
            }
            if (pendingNdtPinHit && !isDraggingNdtPin && !isDraggingNdtPinGroup) {
                const pend = pendingNdtPinHit;
                const armed = pendingNdtPinArmed;
                pendingNdtPinHit = null;
                pendingNdtPinArmed = false;
                if (pend.part === 'rotate') return;
                const act = ndtTouchTapAction(pend, armed, ndtAddSelectEnabled);
                applyNdtTouchTapSelection(act, pend.item && pend.item.id);
                if (act === 'open' && pend.item) openNdtItemEditor(pend.item);
                return;
            }
            if (pendingNdtDispHit && !isDraggingNdtDisplacement) {
                const pendD = pendingNdtDispHit;
                const hit = pendD.hit;
                const armedD = pendingNdtDispArmed;
                pendingNdtDispHit = null;
                pendingNdtDispArmed = false;
                // 부동침하·부재변위 마킹은 한 번 탭에 바로 입력창 (선택 단계 없음)
                const actD = ndtTouchTapAction(Object.assign({}, pendD, { wasSelected: true }), armedD, ndtAddSelectEnabled);
                applyNdtTouchTapSelection(actD, hit.group && hit.group.id ? ndtDispSelKey(hit.group.id) : '');
                if (actD !== 'open') {
                    if (hit.group) setActiveNdtDispGroup(hit.group);
                    return;
                }
                if (hit.type === 'point') {
                    setActiveNdtDispGroup(hit.group);
                    openNdtDisplacementModal(hit.point.x, hit.point.y, hit.group, hit.point);
                } else {
                    setActiveNdtDispGroup(hit.group);
                    openNdtDisplacementGroupEditModal(hit.group);
                    window.showToast(`${hit.group.groupNo} 구역 · 레벨·길이를 입력하세요 (마킹 시 지점 번호 이어짐)`, 'info', 2800);
                }
                return;
            }
            pendingNdtDispHit = null;
            if (isDraggingNdtDisplacement) {
                // 지점을 끌어 옮긴 것도 구역 수정이다 — 시각을 올려야 다른 기기의 옛 위치가 이기지 않는다
                touchNdtDispGroup(activeDragNdtDisplacementGroup);
                isDraggingNdtDisplacement = false;
                activeDragNdtDisplacementGroup = null;
                activeDragNdtDisplacementPoint = null;
                saveStateToLocalStorage();
                drawNdtCanvas();
            }
            if (isNdtDisplacementMarking) {
                isNdtDisplacementMarking = false;
                const cancelled = ndtGestureCancelledByPinch || isNdtPinching || (e.touches && e.touches.length > 0);
                ndtGestureCancelledByPinch = false;
                if (!cancelled) {
                    const coords = window._ndtDispMarkCoords || { x: 100, y: 100 };
                    placeNdtDisplacementMarkAndEdit(coords.x, coords.y);
                }
                window._ndtDispMarkCoords = null;
            }
            if (isNdtMarkingDrag && (ndtGestureCancelledByPinch || isNdtPinching || (e.touches && e.touches.length > 0))) {
                isNdtMarkingDrag = false;
                window._ndtMarkStartCoords = null;
                window._ndtMarkCurrentCoords = null;
                ndtGestureCancelledByPinch = false;
            }
            if (e.touches.length === 0) ndtGestureCancelledByPinch = false;
            if (isDraggingNdtPinGroup) {
                touchMovedNdtItems(null);   // 함께 옮긴 핀·구역의 시각을 올린다
                isDraggingNdtPinGroup = false;
                saveStateToLocalStorage();
                drawNdtCanvas();
            }
            if (isDraggingNdtPin) {
                if (activeDragNdtPin) {
                    window._pendingNdtExtra = {
                        targetX: activeDragNdtPin.targetX !== undefined ? activeDragNdtPin.targetX : (activeDragNdtPin.x || 0),
                        targetY: activeDragNdtPin.targetY !== undefined ? activeDragNdtPin.targetY : (activeDragNdtPin.y || 0),
                        boxX: activeDragNdtPin.boxX !== undefined ? activeDragNdtPin.boxX : (activeDragNdtPin.x || 0),
                        boxY: activeDragNdtPin.boxY !== undefined ? activeDragNdtPin.boxY : (activeDragNdtPin.y || 0)
                    };
                }
                endNdtTiltRotateSession();
                if (activeDragNdtPin) touchMovedNdtItems(activeDragNdtPin);   // 끌어 옮긴 위치가 다른 기기의 옛 위치에 지지 않게
                isDraggingNdtPin = false;
                activeDragNdtPin = null;
                dragNdtPart = 'box';
                saveStateToLocalStorage();
                drawNdtCanvas();
            }
            if (isNdtMarkingDrag) {
                isNdtMarkingDrag = false;
                const start = window._ndtMarkStartCoords || { x: 100, y: 100 };
                const end = window._ndtMarkCurrentCoords || start;

                const dx = start.x - end.x;
                const dy = start.y - end.y;
                let autoDir = '←';
                if (Math.hypot(dx, dy) > 8) {
                    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
                    if (angleDeg >= -22.5 && angleDeg < 22.5) autoDir = '→';
                    else if (angleDeg >= 22.5 && angleDeg < 67.5) autoDir = '↘';
                    else if (angleDeg >= 67.5 && angleDeg < 112.5) autoDir = '↓';
                    else if (angleDeg >= 112.5 && angleDeg < 157.5) autoDir = '↙';
                    else if (angleDeg >= 157.5 || angleDeg < -157.5) autoDir = '←';
                    else if (angleDeg >= -157.5 && angleDeg < -112.5) autoDir = '↖';
                    else if (angleDeg >= -112.5 && angleDeg < -67.5) autoDir = '↑';
                    else if (angleDeg >= -67.5 && angleDeg < -22.5) autoDir = '↗';
                }

                const distMoved = Math.hypot(start.x - end.x, start.y - end.y);
                const targetX = start.x;
                const targetY = start.y;
                const boxX = distMoved > 10 ? end.x : start.x;
                const boxY = distMoved > 10 ? end.y : (start.y + 60);

                if (currentNdtCategory === '균열모니터') {
                    createCrackGaugeMarkAt({ targetX, targetY, boxX, boxY });
                } else openNdtModal(start.x, start.y, null, {
                    targetX,
                    targetY,
                    boxX,
                    boxY,
                    dispDirection: autoDir
                });
            }
            if (isNdtMarqueeSelecting) {
                isNdtMarqueeSelecting = false;
                const x1 = Math.min(ndtMarqueeStartX, ndtMarqueeCurX);
                const y1 = Math.min(ndtMarqueeStartY, ndtMarqueeCurY);
                const x2 = Math.max(ndtMarqueeStartX, ndtMarqueeCurX);
                const y2 = Math.max(ndtMarqueeStartY, ndtMarqueeCurY);
                const screenDist = t
                    ? Math.hypot(t.clientX - ndtMarqueeStartClientX, t.clientY - ndtMarqueeStartClientY)
                    : 99;
                const tiny = screenDist < 10;
                if (!ndtMarqueeAdditive) selectedNdtIds.clear();
                if (!tiny) {
                    collectNdtMarqueeHits(x1, y1, x2, y2).forEach((id) => {
                        if (ndtMarqueeAdditive) {
                            if (selectedNdtIds.has(id)) selectedNdtIds.delete(id);
                            else selectedNdtIds.add(id);
                        } else {
                            selectedNdtIds.add(id);
                        }
                    });
                }
                ndtMarqueeAdditive = false;
                updateNdtSelectionBar();
                const canvas = document.getElementById('ndtCanvas');
                if (canvas) canvas.style.cursor = ndtMode === 'MARK' ? 'crosshair' : 'default';
                drawNdtCanvas();
            }
            isNdtDragging = false;

            // 선택 모드에서 빈 곳 탭 → 선택 해제 (삭제 바 숨김)
            if (wasEmptyTap) {
                if (selectedNdtIds.size) {
                    selectedNdtIds.clear();
                    updateNdtSelectionBar();
                    drawNdtCanvas();
                } else {
                    updateNdtSelectionBar();
                }
            }
            } finally {
                if (typeof scheduleFlushPendingRemoteSync === 'function') scheduleFlushPendingRemoteSync();
            }
        });

        // 도면 밖 터치 시작 → 스크롤 잠금 즉시 해제
        if (!document._ndtOutsideScrollUnlockBound) {
            document._ndtOutsideScrollUnlockBound = true;
            document.addEventListener('touchstart', (e) => {
                if (window.state && window.state.currentTab !== 'tab-ndt') return;
                if (isNdtDrawingTouchTarget(e.target)) return;
                releaseNdtScrollLockFromOutsideTouch();
            }, { capture: true, passive: true });
        }

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            window.zoomNdtCanvas(factor, e.clientX - rect.left, e.clientY - rect.top);
        }, { passive: false });
    }

    function renderNdtSummaryTable() {
        if (state.currentBuildingId) migrateNdtDispTransfersForFloor(`${state.currentBuildingId}_${state.currentFloor}`);
        const tbody = document.getElementById('ndtTableBody');
        const thead = document.querySelector('#ndtSummaryTable thead tr');
        if (!tbody) return;

        const currentCat = currentNdtCategory || '실측';
        let items = getCurrentFloorNdtData();

        if (currentCat === '균열모니터') {
            const crackDefects = getCurrentFloorCrackMonitorDefects();
            const gaugeMarks = getCurrentFloorCrackGaugeMarks();
            if (thead) {
                thead.innerHTML = `
                    <th>번호</th>
                    <th>부재·조사내용</th>
                    <th>게이지</th>
                    <th>최근 X/Y (Δ)</th>
                    <th>팁 길이 (누적)</th>
                    <th>관리</th>
                `;
            }
            if (!crackDefects.length && !gaugeMarks.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#a3a3a3;padding:1.5rem;">이 층에 균열 게이지가 없습니다. [📍 마킹] 모드에서 게이지 위치를 도면에 찍으면 새 게이지가 만들어집니다.</td></tr>';
                return;
            }
            tbody.innerHTML = renderNdtCrackMonitorSummaryRows(crackDefects) + renderNdtCrackGaugeMarkSummaryRows(gaugeMarks);
            return;
        }

        if (currentCat === '변위' || currentCat === '부재변위') {
            renderNdtDisplacementSummaryTable(tbody, thead);
            return;
        }

        if (currentCat === '기울기') {
            items = items.filter(x => x.category === currentCat);
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>측정위치</th>
                    <th>측정높이(H)</th>
                    <th>변위량(mm)</th>
                    <th>기울기(1/H)</th>
                    <th>안전 등급</th>
                    <th>관리</th>
                `;
            }
        } else if (currentCat === '실측') {
            items = items.filter(x => x.category === '실측');
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>측정위치</th>
                    <th>부재명</th>
                    <th>설계치수(mm)</th>
                    <th>실측치수(mm)</th>
                    <th>마감상태</th>
                    <th>평가(c%)</th>
                    <th>비고(등급)</th>
                    <th>관리</th>
                `;
            }
        } else if (currentCat === '강도') {
            items = items.filter(x => x.category === '강도');
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>측정위치</th>
                    <th>부재명</th>
                    <th>설계기준강도(Fck)</th>
                    <th>측정강도(Fck)</th>
                    <th>강도비(%)</th>
                    <th>등급</th>
                    <th>관리</th>
                `;
            }
        } else if (currentCat === '탄산화') {
            items = items.filter(x => x.category === '탄산화');
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>측정위치</th>
                    <th>부재명</th>
                    <th>탄산화깊이(mm)</th>
                    <th>피복두께(mm)</th>
                    <th>잔존피복(mm)</th>
                    <th>잔존수명(년)</th>
                    <th>관리</th>
                `;
            }
        } else if (currentCat === '내화피복') {
            items = items.filter(x => x.category === '내화피복');
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>측정위치</th>
                    <th>부재명</th>
                    <th>설계치</th>
                    <th>평균(mm)</th>
                    <th>비고</th>
                    <th>관리</th>
                `;
            }
        } else {
            items = items.filter(x => ['강도', '탄산화'].includes(x.category));
            if (thead) {
                thead.innerHTML = `
                    <th>조사번호</th>
                    <th>조사항목</th>
                    <th>측정위치</th>
                    <th>부재명</th>
                    <th>측정수치</th>
                    <th>평균결과</th>
                    <th>상태판정</th>
                    <th>관리</th>
                `;
            }
        }

        if (items.length === 0) {
            const colSpan = (currentCat === '기울기' || currentCat === '변위' || currentCat === '부재변위') ? 7 : (currentCat === '실측' ? 9 : 8);
            tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align: center; color: #a3a3a3; padding: 1.5rem;">등록된 ${currentCat} 측정 데이터가 없습니다. 도면 상에 [📍 NDT 위치 마킹]을 클릭해 주세요.</td></tr>`;
            return;
        }

        const gradeBadges = {
            'a등급': '<span class="badge" style="background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid rgba(34,197,94,0.4); font-weight:800;">a등급 (1/750이상)</span>',
            'b등급': '<span class="badge" style="background:rgba(56,189,248,0.2); color:#6b6b6b; border:1px solid rgba(56,189,248,0.4); font-weight:800;">b등급 (1/500이하)</span>',
            'c등급': '<span class="badge" style="background:rgba(250,204,21,0.2); color:#facc15; border:1px solid rgba(250,204,21,0.4); font-weight:800;">c등급 (1/250이하)</span>',
            'd등급': '<span class="badge" style="background:rgba(249,115,22,0.2); color:#fb923c; border:1px solid rgba(249,115,22,0.4); font-weight:800;">d등급 (1/150이하)</span>',
            'e등급': '<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-weight:800;">e등급 (1/150초과)</span>'
        };

        // 부재단면 규격 등급(a~e) — [표 6.24] 단면적비율(c%) 기준, 별도 뱃지(문자 하나로 간결하게 표기)
        const sectionGradeBadges = {
            a: '<span class="badge" style="background:rgba(34,197,94,0.2); color:#4ade80; border:1px solid rgba(34,197,94,0.4); font-weight:800;">a</span>',
            b: '<span class="badge" style="background:rgba(56,189,248,0.2); color:#6b6b6b; border:1px solid rgba(56,189,248,0.4); font-weight:800;">b</span>',
            c: '<span class="badge" style="background:rgba(250,204,21,0.2); color:#facc15; border:1px solid rgba(250,204,21,0.4); font-weight:800;">c</span>',
            d: '<span class="badge" style="background:rgba(249,115,22,0.2); color:#fb923c; border:1px solid rgba(249,115,22,0.4); font-weight:800;">d</span>',
            e: '<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4); font-weight:800;">e</span>'
        };

        if (currentCat === '기울기' || currentCat === '부재변위') {
            tbody.innerHTML = items.map((item, idx) => `
                <tr>
                    <td style="font-weight:700; color:#6b6b6b;">${item.no || (idx + 1)}</td>
                    <td style="font-weight:700;">${item.location || '-'}</td>
                    <td style="font-weight:700; color:#6b6b6b;">${formatHeightValue(item.height) || '-'}</td>
                    <td class="ndt-col-disp-value">${item.avgValue || '-'}</td>
                    <td class="ndt-col-disp-ratio">${item.tiltRatio || '-'}</td>
                    <td>${gradeBadges[item.grade] || '-'}</td>
                    <td class="ndt-row-actions">
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtItem('${item.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtItem('${item.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
        } else if (currentCat === '실측') {
            tbody.innerHTML = items.map((item, idx) => {
                const designText = formatNdtMeasureDimWithArea(item, 'design', ' × ', '<br>');
                const measuredText = formatNdtMeasureDimWithArea(item, 'measured', ' × ', '<br>');
                const ratioText = (item.sectionRatio !== undefined && item.sectionRatio !== null) ? `${item.sectionRatio.toFixed(1)}%` : '-';
                return `
                <tr>
                    <td class="ndt-col-no">${item.no || (idx + 1)}</td>
                    <td class="ndt-col-location">${item.location || '-'}</td>
                    <td>${memberNameOut(item.component) || '-'}</td>
                    <td class="ndt-col-dim">${designText}</td>
                    <td class="ndt-col-dim">${measuredText}</td>
                    <td>${item.finishState || '-'}</td>
                    <td class="ndt-col-ratio">${ratioText}</td>
                    <td>${item.sectionGrade ? (sectionGradeBadges[item.sectionGrade] || item.sectionGrade) : '-'}</td>
                    <td class="ndt-row-actions">
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtItem('${item.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtItem('${item.id}')">삭제</button>
                    </td>
                </tr>
            `;
            }).join('');
        } else if (currentCat === '강도') {
            tbody.innerHTML = items.map((rawItem, idx) => {
                // 저장값이 아니라 지금 계산식으로 다시 계산해 보여 준다(계산식 변경 후 옛 값 방지)
                const item = refreshStrengthItemResults(rawItem);
                const locText = Array.isArray(item.strengthSlots) && item.strengthSlots.length > 1
                    ? item.strengthSlots.map(s => s.location || item.location || '-').join(', ')
                    : (item.location || '-');
                const measuredText = typeof item.strengthFinal === 'number' ? item.strengthFinal.toFixed(1) : (item.strengthFinal || '-');
                const ratioText = item.strengthRatio != null ? `${Math.round(item.strengthRatio)}%` : '-';
                const gradeText = item.strengthGrade === 'a_or_b' ? 'a/b' : (item.strengthGrade || '-');
                return `
                <tr>
                    <td style="font-weight:700; color:#6b6b6b;">${item.no || (idx + 1)}</td>
                    <td style="font-weight:700;">${locText}</td>
                    <td>${memberNameOut(item.component) || '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${item.designStrength != null ? item.designStrength : '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${measuredText}</td>
                    <td style="font-weight:800; color:#4ade80;">${ratioText}</td>
                    <td>${sectionGradeBadges[item.strengthGrade] || gradeText}</td>
                    <td class="ndt-row-actions">
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtItem('${item.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtItem('${item.id}')">삭제</button>
                    </td>
                </tr>
            `;
            }).join('');
        } else if (currentCat === '탄산화') {
            // 2026-10-19 저장값이 아니라 지금 준공일로 다시 계산해 보여 준다
            tbody.innerHTML = items.map((rawCarb) => refreshCarbItemResults(rawCarb)).map((item, idx) => `
                <tr>
                    <td style="font-weight:700; color:#6b6b6b;">${item.no || (idx + 1)}</td>
                    <td style="font-weight:700;">${item.location || '-'}</td>
                    <td>${memberNameOut(item.component) || '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${item.carbDepth != null ? item.carbDepth : '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${item.carbCover != null ? item.carbCover : '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${typeof item.carbRemainMm === 'number' ? item.carbRemainMm.toFixed(2) : '-'}</td>
                    <td style="font-weight:800; color:#4ade80;">${typeof item.carbRemainingLifeYears === 'number' ? Math.round(item.carbRemainingLifeYears) : '-'}</td>
                    <td class="ndt-row-actions">
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtItem('${item.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtItem('${item.id}')">삭제</button>
                    </td>
                </tr>
            `).join('');
        } else if (currentCat === '내화피복') {
            tbody.innerHTML = items.map((item, idx) => {
                const memberAvg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                    ? window.BSA.ndtStats.fireproofMemberAvg(item)
                    : (item.fpAvg != null ? item.fpAvg : null);
                const avgText = (memberAvg == null || !Number.isFinite(Number(memberAvg))) ? '-' : Number(memberAvg).toFixed(2);
                const note = ((item.fpFlange && item.fpFlange.unavailable) || (item.fpWeb && item.fpWeb.unavailable)) ? '측정불가 있음' : '-';
                return `
                <tr>
                    <td style="font-weight:700; color:#6b6b6b;">${item.no || (idx + 1)}</td>
                    <td style="font-weight:700;">${item.location || '-'}</td>
                    <td>${memberNameOut(item.component) || '-'}</td>
                    <td style="font-family:monospace; font-size:0.88rem;">${item.fireproofDesign || '-'}</td>
                    <td style="font-weight:800; color:#4ade80;">${avgText}</td>
                    <td>${note}</td>
                    <td class="ndt-row-actions">
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtItem('${item.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtItem('${item.id}')">삭제</button>
                    </td>
                </tr>
            `;
            }).join('');
        }
    }

    // 수직변위/부재변위: 그룹 단위(측정 구역 하나 = 행 하나) 결과표
    function renderNdtDisplacementSummaryTable(tbody, thead) {
        const groups = getCurrentFloorDisplacementGroups();
        const isMemberDisp = currentNdtCategory === '부재변위';

        if (thead) {
            const col4Name = isMemberDisp ? '처짐량(mm)' : '변위량(mm)';
            const col5Name = isMemberDisp ? '처짐비(1/L)' : '기울기(1/L)';
            const col6Name = isMemberDisp ? '처짐 등급' : '안전 등급';
            thead.innerHTML = `
                <th>조사번호</th>
                <th>측정위치</th>
                <th>측정길이(m)</th>
                <th>${col4Name}</th>
                <th>${col5Name}</th>
                <th>${col6Name}</th>
                <th>관리</th>
            `;
        }

        if (groups.length === 0) {
            const labelStr = isMemberDisp ? '부재변위(부재처짐)' : '부동침하 기울기';
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #a3a3a3; padding: 1.5rem;">등록된 ${labelStr} 측정 데이터가 없습니다. 도면 상에 [📍 NDT 위치 마킹]을 클릭해 주세요.</td></tr>`;
            return;
        }

        tbody.innerHTML = groups.map(group => {
            const calc = calcGroupDisplacement(group);
            const lenText = (Number(group.measureLength) > 0) ? group.measureLength : '—';
            const deltaText = calc.incomplete ? '미입력' : calc.deltaMm.toFixed(1);
            const ratioText = calc.incomplete ? '—' : calc.tiltRatio;
            const gradeHtml = calc.incomplete
                ? '<span style="color:#a3a3a3; font-weight:700;">미입력</span>'
                : (NDT_GRADE_BADGES[calc.grade] || '—');
            return `
                <tr>
                    <td style="font-weight:800; color:${group.color || getStyleColor(isMemberDisp ? 'ndtMemberDisp' : 'ndtSettlement')};">${group.groupNo}</td>
                    <td style="font-weight:700;">${group.locationType || '보'} (${group.points.length}개 지점)</td>
                    <td style="font-weight:700; color:#6b6b6b;">${lenText}</td>
                    <td class="ndt-col-disp-value">${deltaText}</td>
                    <td class="ndt-col-disp-ratio">${ratioText}</td>
                    <td>${gradeHtml}</td>
                    <td class="ndt-row-actions ndt-row-actions-wide">
                        <button type="button" class="btn btn-sm btn-outline" onclick="window.showNdtDisplacementChart('${group.id}')">그래프</button>
                        <button type="button" class="btn btn-sm btn-outline ndt-btn-edit" onclick="window.editNdtDisplacementGroup('${group.id}')">수정</button>
                        <button type="button" class="btn btn-sm btn-danger-outline ndt-btn-delete" onclick="window.deleteNdtDisplacementGroup('${group.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.editNdtDisplacementGroup = function(groupId) {
        const group = getCurrentFloorDisplacementGroups().find(g => g.id === groupId);
        if (group) openNdtDisplacementGroupEditModal(group);
    };

    window.editNdtItem = function(id) {
        const items = getCurrentFloorNdtData();
        const item = items.find(x => x.id === id);
        if (item) {
            openNdtModal(item.x, item.y, item);
        }
    };

    window.deleteNdtItem = async function(id, options) {
        if (!options?.skipConfirm && !await window.confirmDelete('해당 비파괴 조사 측정 항목을 삭제하시겠습니까?')) return false;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        trackNdtDeletion(key, id);
        const removedNdt = (state.ndtData[key] || []).filter(x => x.id === id);
        state.ndtData[key] = (state.ndtData[key] || []).filter(x => x.id !== id);
        // 측정지 사진 클라우드 사본 정리 — 되돌리기·일괄 복원 대비로 이 기기 사본은 남긴다
        releaseStrengthPhotosOfItems(state.currentBuildingId, removedNdt, { keepLocal: true, deferCloudFloorKey: key });
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        saveStateToLocalStorage();
        drawNdtCanvas();
        renderNdtSummaryTable();
        return true;
    };

    window.exportNdtTableExcel = function() {
        const items = getCurrentFloorNdtData().filter((item) => !isCrackGaugeNdtItem(item));
        const dispGroups = getCurrentFloorDisplacementGroups();
        if (items.length === 0 && dispGroups.length === 0) {
            window.showToast('엑셀로 출력할 비파괴 조사 측정 데이터가 없습니다.', 'warning');
            return;
        }

        let csvContent = "\ufeff";
        const measureItems = items.filter(x => x.category === '실측');
        const fireproofItems = items.filter(x => x.category === '내화피복');
        const standardItems = items.filter(x => ['강도', '탄산화'].includes(x.category));
        const tiltItems = items.filter(x => ['기울기', '부재변위'].includes(x.category));

        if (measureItems.length > 0) {
            csvContent += "조사번호,측정위치,부재명,설계치수(mm),실측치수(mm),마감상태,평가(c%),비고(등급)\n";
            measureItems.forEach(item => {
                const designText = formatNdtMeasureDimText(item, 'design', ' x ');
                const measuredText = formatNdtMeasureDimText(item, 'measured', ' x ');
                const ratioText = (item.sectionRatio !== undefined && item.sectionRatio !== null) ? item.sectionRatio.toFixed(1) + '%' : '';
                csvContent += `"${item.no}","${item.location}","${memberNameOut(item.component)}","${designText === '-' ? '' : designText}","${measuredText === '-' ? '' : measuredText}","${item.finishState || ''}","${ratioText}","${item.sectionGrade || ''}"\n`;
            });
        }
        if (fireproofItems.length > 0) {
            if (measureItems.length > 0) csvContent += "\n";
            csvContent += "조사번호,측정위치,부재명,설계치,플렌지1,플렌지2,플렌지3,웨브1,웨브2,웨브3,부재평균\n";
            fireproofItems.forEach(item => {
                const fl = item.fpFlange || {}; const web = item.fpWeb || {};
                const memberAvg = (window.BSA && window.BSA.ndtStats && typeof window.BSA.ndtStats.fireproofMemberAvg === 'function')
                    ? window.BSA.ndtStats.fireproofMemberAvg(item)
                    : (item.fpAvg != null ? item.fpAvg : null);
                const avgText = (memberAvg == null || !Number.isFinite(Number(memberAvg))) ? '' : Number(memberAvg).toFixed(2);
                const flVals = fl.unavailable ? ['측정불가', '', ''] : [fl.readings?.[0] ?? '', fl.readings?.[1] ?? '', fl.readings?.[2] ?? ''];
                const webVals = web.unavailable ? ['측정불가', '', ''] : [web.readings?.[0] ?? '', web.readings?.[1] ?? '', web.readings?.[2] ?? ''];
                csvContent += `"${item.no}","${item.location}","${memberNameOut(item.component)}","${item.fireproofDesign || ''}","${flVals[0]}","${flVals[1]}","${flVals[2]}","${webVals[0]}","${webVals[1]}","${webVals[2]}","${avgText}"\n`;
            });
        }
        if (standardItems.length > 0) {
            if (measureItems.length > 0 || fireproofItems.length > 0) csvContent += "\n";
            csvContent += "조사번호,조사항목,측정위치,부재명,측정수치,평균결과,상태판정\n";
            standardItems.forEach(item => {
                csvContent += `"${item.no}","${item.category}","${item.location}","${memberNameOut(item.component)}","${item.valuesText || ''}","${item.avgValue || ''}","${item.status}"\n`;
            });
        }
        if (tiltItems.length > 0) {
            if (measureItems.length > 0 || fireproofItems.length > 0 || standardItems.length > 0) csvContent += "\n";
            csvContent += "조사번호,조사항목,측정위치,높이/길이(H/L),변위/처짐량(mm),비율(1/N),안전등급\n";
            tiltItems.forEach(item => {
                const fmtH = formatHeightValue(item.height) || '-';
                const isMemberDisp = item.category === '부재변위';
                const hDigits = (fmtH || '').replace(/[^0-9.]/g, '');
                const avgDigits = (item.avgValue || '').replace(/[^0-9.-]/g, '');
                const h = parseFloat(hDigits);
                const delta = Math.abs(parseFloat(avgDigits) || 0);
                const calc = (Number.isFinite(h) && h > 0 && delta > 0)
                    ? (isMemberDisp ? calcMemberDispGrade(h, delta) : calcTiltGrade(h, delta))
                    : { tiltRatio: '', grade: '' };
                const ratioStr = item.tiltRatio || calc.tiltRatio || '-';
                const gradeStr = item.grade || calc.grade || '-';
                csvContent += `"${item.no}","${item.category}","${item.location}","${fmtH}","${item.avgValue || ''}","${ratioStr}","${gradeStr}"\n`;
            });
        }
        if (dispGroups.length > 0) {
            if (items.length > 0) csvContent += "\n";
            csvContent += "조사번호,조사항목,측정위치,측정길이(m),변위/처짐량(mm),비율(1/L),안전등급\n";
            dispGroups.forEach(group => {
                const calc = calcGroupDisplacement(group);
                const fmt = formatDispCalcForExport(calc);
                const catLabel = group.category === '부재변위' ? '부재처짐' : '부동침하 기울기';
                csvContent += `"${group.groupNo}","${catLabel}","${group.locationType || ''}","${group.measureLength ?? ''}","${fmt.delta}","${fmt.tiltRatio}","${fmt.grade}"\n`;
            });
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `비파괴조사결과_${state.currentBuildingId}_${state.currentFloor}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

