// @@app-part 09-settings-input-camera.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 카테고리별 핀/박스 색상 설정 모달 ---
    // 결함 색상은 getDefectColor()가 쓰는 등급·상태 키와 맞춰야 도면에 바로 반영됨
    const STYLE_COLOR_FIELDS = [
        ['styleColorDefectBad', 'defectBad'],
        ['styleColorDefectGood', 'defectGood'],
        ['styleColorDefectNewGrade3', 'defectNewGrade3'],
        ['styleColorDefectExistingGrade3', 'defectExistingGrade3'],
        ['styleColorDefectGoodGrade3', 'defectGoodGrade3'],
        ['styleColorPriorityManage', 'priorityManage'],
        ['styleColorDrawingMemo', 'drawingMemo'],
        ['styleColorGuideColumn', 'guideColumn'],
        ['styleColorGuideGirder', 'guideGirder'],
        ['styleColorGuideBeam', 'guideBeam'],
        ['styleColorNdtMeasure', 'ndtMeasure'],
        ['styleColorNdtStrength', 'ndtStrength'],
        ['styleColorNdtCarbonation', 'ndtCarbonation'],
        ['styleColorNdtTilt', 'ndtTilt'],
        ['styleColorNdtSettlement', 'ndtSettlement'],
        ['styleColorNdtMemberDisp', 'ndtMemberDisp'],
        ['styleColorNdtFireproof', 'ndtFireproof'],
        ['styleColorNdtCrackGauge', 'ndtCrackGauge']
    ];

    // [ID 접미사, styleSizes 키] — stylePinSize{suffix}/styleArrowSize{suffix} 슬라이더에 사용
    const DEFECT_STYLE_SIZE_FIELDS = [
        ['DefectStructural', 'defectStructural'],
        ['DefectNonStructural', 'defectNonStructural'],
        ['DefectFinish', 'defectFinish'],
        ['DefectStructuralGood', 'defectStructuralGood'],
        ['DefectNonStructuralGood', 'defectNonStructuralGood'],
        ['DefectFinishGood', 'defectFinishGood']
    ];
    const NDT_STYLE_SIZE_FIELDS = [
        ['NdtMeasure', 'ndtMeasure'],
        ['NdtStrength', 'ndtStrength'],
        ['NdtCarbonation', 'ndtCarbonation'],
        ['NdtTilt', 'ndtTilt'],
        ['NdtSettlement', 'ndtSettlement'],
        ['NdtMemberDisp', 'ndtMemberDisp'],
        ['NdtFireproof', 'ndtFireproof'],
        ['NdtCrackGauge', 'ndtCrackGauge']
    ];
    const STYLE_SIZE_FIELDS = DEFECT_STYLE_SIZE_FIELDS.concat(NDT_STYLE_SIZE_FIELDS);

    // [ID 접미사, styleShapes 키] — styleShape{suffix}/styleFill{suffix}/styleNumFmt{suffix} 컨트롤에 사용
    const STYLE_SHAPE_FIELDS = STYLE_SIZE_FIELDS;

    let _styleModalDraftActive = false;
    let _styleModalSnapshot = null;

    function cloneStyleModalState() {
        return {
            styleColors: JSON.parse(JSON.stringify(state.styleColors || {})),
            styleSizes: cloneStyleSizesMap(state.styleSizes) || {},
            styleShapes: JSON.parse(JSON.stringify(state.styleShapes || {})),
            defectLeaderLineScale: state.defectLeaderLineScale !== undefined ? state.defectLeaderLineScale : 1.0,
            ndtLeaderLineScale: state.ndtLeaderLineScale !== undefined ? state.ndtLeaderLineScale : 1.0
        };
    }

    function restoreStyleModalSnapshot(snap) {
        if (!snap) return;
        state.styleColors = JSON.parse(JSON.stringify(snap.styleColors || {}));
        state.styleSizes = cloneStyleSizesMap(snap.styleSizes) || {};
        state.styleShapes = JSON.parse(JSON.stringify(snap.styleShapes || {}));
        state.defectLeaderLineScale = snap.defectLeaderLineScale !== undefined ? snap.defectLeaderLineScale : 1.0;
        state.ndtLeaderLineScale = snap.ndtLeaderLineScale !== undefined ? snap.ndtLeaderLineScale : 1.0;
    }

    function populateStyleColorModalControls() {
        migrateStyleColorsToPureDefaults();
        syncGuideOpacityUi();
        STYLE_COLOR_FIELDS.forEach(([inputId, key]) => {
            const input = document.getElementById(inputId);
            if (input) input.value = getStyleColor(key);
        });
        STYLE_SIZE_FIELDS.forEach(([suffix, key]) => {
            const sz = getStyleSize(key);
            const pinInput = document.getElementById(`stylePinSize${suffix}`);
            const pinLabel = document.getElementById(`stylePinSize${suffix}Label`);
            const arrowInput = document.getElementById(`styleArrowSize${suffix}`);
            const arrowLabel = document.getElementById(`styleArrowSize${suffix}Label`);
            const leaderInput = document.getElementById(`styleLeaderSize${suffix}`);
            const leaderLabel = document.getElementById(`styleLeaderSize${suffix}Label`);
            if (pinInput) pinInput.value = sz.pin;
            if (pinLabel) pinLabel.textContent = `${Math.round(sz.pin * 100)}%`;
            if (arrowInput) arrowInput.value = sz.arrow;
            if (arrowLabel) arrowLabel.textContent = `${Math.round(sz.arrow * 100)}%`;
            if (leaderInput) leaderInput.value = sz.leader;
            if (leaderLabel) leaderLabel.textContent = `${Math.round(sz.leader * 100)}%`;
            const fontInput = document.getElementById(`styleFontSize${suffix}`);
            const fontLabel = document.getElementById(`styleFontSize${suffix}Label`);
            if (fontInput) fontInput.value = sz.font;
            if (fontLabel) fontLabel.textContent = `${Math.round(sz.font * 100)}%`;
        });
        STYLE_SHAPE_FIELDS.forEach(([suffix, key]) => {
            const sh = getStyleShape(key);
            const shapeInput = document.getElementById(`styleShape${suffix}`);
            const fillInput = document.getElementById(`styleFill${suffix}`);
            const numFmtInput = document.getElementById(`styleNumFmt${suffix}`);
            if (shapeInput) shapeInput.value = sh.shape;
            if (fillInput) fillInput.checked = sh.fill;
            if (numFmtInput) numFmtInput.value = sh.numberFormat;
        });
    }

    function refreshAllStyleColoredCanvases() {
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof window.syncDrawingMemoOverlay === 'function') window.syncDrawingMemoOverlay();
    }

    function saveFloorMapStyleSettings(floorCode, buildingId) {
        if (!floorCode || !buildingId) return;
        if (!state.floorMapStyleSettings) state.floorMapStyleSettings = {};
        // 2026-10-20 「다른 도면 갔다 오면 마킹 크기가 들쭉날쭉」: 지금 크기 설정이 다른 층 것이면(층을 바꾸는 길 중
        // 설정을 안 바꾼 곳) 그걸 이 층에 저장하면 이 층 크기가 다른 층 크기로 덮였다 — 주인이 다르면 저장하지 않는다.
        const owner = state._mapStyleFloorKey;
        if (owner && owner !== getFloorMapStyleKey(buildingId, floorCode)) return;
        state.floorMapStyleSettings[getFloorMapStyleKey(buildingId, floorCode)] = snapshotMapStyleSettings();
    }

    /** 그리기 직전: 크기 설정이 지금 층 것이 아니면 지금 층 것으로(층 전환 길마다 빠짐없이) */
    function ensureMapStyleMatchesCurrentFloor() {
        if (_mapStyleRenderContext || !state.currentFloor || !state.currentBuildingId) return;
        const key = getFloorMapStyleKey(state.currentBuildingId, state.currentFloor);
        if (state._mapStyleFloorKey === key) return;
        applyFloorMapStyleSettings(state.currentFloor, state.currentBuildingId);
    }
    window.ensureMapStyleMatchesCurrentFloor = ensureMapStyleMatchesCurrentFloor;

    function applyFloorMapStyleSettings(floorCode, buildingId) {
        if (!floorCode) return;
        // 떠나는 층의 지금 설정을 먼저 그 층에 남긴다(목록·검색으로 다른 층으로 뛰는 길은 저장을 안 했다)
        const leaving = state._mapStyleFloorKey;
        const target = getFloorMapStyleKey(buildingId, floorCode);
        if (leaving && leaving !== target && state.currentBuildingId && String(leaving).indexOf(String(state.currentBuildingId) + '') >= 0) {
            if (!state.floorMapStyleSettings) state.floorMapStyleSettings = {};
            if (state.floorMapStyleSettings[leaving]) state.floorMapStyleSettings[leaving] = snapshotMapStyleSettings();
        }
        state._mapStyleFloorKey = target;
        const saved = state.floorMapStyleSettings?.[getFloorMapStyleKey(buildingId, floorCode)];
        const ndtKept = cloneStyleSizesSubset(state.styleSizes, NDT_STYLE_SIZE_KEYS);
        if (saved) {
            state.styleSizes = mergeStyleSizesSubset(
                mergeStyleSizesSubset(cloneStyleSizesMap(state._globalStyleSizesFallback), saved.styleSizes),
                ndtKept
            );
            state.defectLeaderLineScale = saved.defectLeaderLineScale ?? 1.0;
        } else {
            const fallback = cloneStyleSizesMap(state._globalStyleSizesFallback) || null;
            state.styleSizes = mergeStyleSizesSubset(fallback, ndtKept);
            state.defectLeaderLineScale = state._globalDefectLeaderLineScaleFallback ?? 1.0;
        }
        if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
    }

    function getBuildingFloorCodesForStyle(bldg) {
        const codes = new Set();
        (bldg?.floorsList || []).forEach(f => {
            if (f && f.floorCode) codes.add(f.floorCode);
        });
        if (bldg?.floorDrawings && typeof bldg.floorDrawings === 'object') {
            Object.keys(bldg.floorDrawings).forEach(code => {
                if (code) codes.add(code);
            });
        }
        if (codes.size === 0 && state.currentFloor) codes.add(state.currentFloor);
        return [...codes];
    }

    window.applyCurrentFloorMapStyleToAllFloors = function() {
        const bldg = state.currentBuilding;
        const bldgId = state.currentBuildingId;
        if (!bldg || !bldgId) {
            if (typeof window.showToast === 'function') window.showToast('건물을 먼저 선택해 주세요.', 'warning');
            return;
        }
        saveFloorMapStyleSettings(state.currentFloor, bldgId);
        const snapshot = state.floorMapStyleSettings[getFloorMapStyleKey(bldgId, state.currentFloor)];
        if (!state.floorMapStyleSettings) state.floorMapStyleSettings = {};
        const floorCodes = getBuildingFloorCodesForStyle(bldg);
        floorCodes.forEach(fc => {
            state.floorMapStyleSettings[getFloorMapStyleKey(bldgId, fc)] = {
                styleSizes: cloneStyleSizesMap(snapshot.styleSizes),
                defectLeaderLineScale: snapshot.defectLeaderLineScale
            };
        });
        saveStateToLocalStorage();
        if (typeof window.showToast === 'function') {
            window.showToast(`핀·화살표·연결선 설정을 ${floorCodes.length}개 층에 적용했습니다.`, 'success');
        }
    };

    window.applyStyleSizeBarLockUi = function() {
        const mapLocked = window.state.styleSizeBarLockedMap !== false;
        const ndtLocked = window.state.styleSizeBarLockedNdt !== false;
        const mapCb = document.getElementById('styleSizeLockMap');
        const ndtCb = document.getElementById('styleSizeLockNdt');
        if (mapCb) mapCb.checked = mapLocked;
        if (ndtCb) ndtCb.checked = ndtLocked;

        const mapToolbar = document.getElementById('mapStyleSizeToolbar');
        const ndtToolbar = document.getElementById('ndtStyleSizeToolbar');
        if (mapToolbar) mapToolbar.classList.toggle('is-size-locked', mapLocked);
        if (ndtToolbar) ndtToolbar.classList.toggle('is-size-locked', ndtLocked);

        ['stylePinSizeAll', 'styleArrowSizeAll', 'styleLeaderLineScaleAll'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = mapLocked;
        });
        ['stylePinSizeNdtCurrent', 'styleArrowSizeNdtCurrent', 'styleLeaderLineScaleNdtCurrent'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = ndtLocked;
        });

        const mapIcon = mapCb?.parentElement?.querySelector('i');
        if (mapIcon) mapIcon.className = mapLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
        const ndtIcon = ndtCb?.parentElement?.querySelector('i');
        if (ndtIcon) ndtIcon.className = ndtLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
    };

    function syncPcSizeToggleBtn(btn, on) {
        if (!btn) return;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        const stateEl = btn.querySelector('.toolbar-toggle-state');
        if (stateEl) stateEl.textContent = on ? 'ON' : 'OFF';
    }

    window.applyStyleSizePanelUi = function () {
        if (window.state.styleSizePanelOpenMap === undefined) window.state.styleSizePanelOpenMap = false;
        if (window.state.styleSizePanelOpenNdt === undefined) window.state.styleSizePanelOpenNdt = false;
        const mapOpen = !!window.state.styleSizePanelOpenMap;
        const ndtOpen = !!window.state.styleSizePanelOpenNdt;
        const mapBar = document.getElementById('mapStyleSizeToolbar');
        const ndtBar = document.getElementById('ndtStyleSizeToolbar');
        const pcLayout = !layoutIsCompactWidth();
        if (mapBar) mapBar.classList.toggle('is-pc-size-panel-open', pcLayout && mapOpen);
        if (ndtBar) ndtBar.classList.toggle('is-pc-size-panel-open', pcLayout && ndtOpen);
        syncPcSizeToggleBtn(document.getElementById('btnToggleMapStyleSize'), mapOpen);
        syncPcSizeToggleBtn(document.getElementById('btnToggleNdtStyleSize'), ndtOpen);
        positionPcSizePanelsBelowToolbar();
    };

    // 2026-10-23 PC 창이 좁아 위 도구줄이 두 줄이 되면 크기조절창이 둘째 줄을 덮었다 — 도구줄 실제 아래끝에 맞춘다(PC만)
    function positionPcSizePanelBelowToolbar(panel, toggleBtn) {
        if (!panel) return;
        panel.style.removeProperty('top');
        if (!panel.classList.contains('is-pc-size-panel-open') || !toggleBtn) return;
        const parent = panel.offsetParent;
        const bar = toggleBtn.closest('.map-toolbar, .toolbar, [class*="toolbar"]:not(.toolbar-size-toggle)') || toggleBtn.parentElement;
        if (!parent || !bar) return;
        const pr = parent.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const defTop = panel.getBoundingClientRect().top;
        // 도구줄이 패널 위쪽을 넘어오면(겹치면) 그 아래로 내린다
        if (br.bottom > defTop && br.top < defTop + 4 + panel.offsetHeight) {
            panel.style.setProperty('top', Math.round(br.bottom - pr.top + 4) + 'px', 'important');
        }
    }
    function positionPcSizePanelsBelowToolbar() {
        positionPcSizePanelBelowToolbar(document.getElementById('mapStyleSizeToolbar'), document.getElementById('btnToggleMapStyleSize'));
        positionPcSizePanelBelowToolbar(document.getElementById('ndtStyleSizeToolbar'), document.getElementById('btnToggleNdtStyleSize'));
    }
    window.addEventListener('resize', () => requestAnimationFrame(positionPcSizePanelsBelowToolbar));
    if (typeof ResizeObserver === 'function') {
        try {
            const ro = new ResizeObserver(() => requestAnimationFrame(positionPcSizePanelsBelowToolbar));
            ['btnToggleMapStyleSize', 'btnToggleNdtStyleSize'].forEach((id) => {
                const b = document.getElementById(id);
                if (b && b.parentElement) ro.observe(b.parentElement);
            });
        } catch (_e) { /* ignore */ }
    }

    function refreshCanvasAfterStylePanelToggle() {
        requestAnimationFrame(() => {
            if ((state.currentTab === 'tab-map') && typeof resizeCanvas === 'function') {
                resizeCanvas();
                if (typeof drawCanvas === 'function') drawCanvas();
            }
            if (state.currentTab === 'tab-ndt' && typeof resizeNdtCanvas === 'function') {
                resizeNdtCanvas();
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            }
        });
    }

    window.syncBulkStyleSlidersUi = function() {
        const pinAllInput = document.getElementById('stylePinSizeAll');
        const pinAllLabel = document.getElementById('stylePinSizeAllLabel');
        const arrowAllInput = document.getElementById('styleArrowSizeAll');
        const arrowAllLabel = document.getElementById('styleArrowSizeAllLabel');
        const leaderLineAllInput = document.getElementById('styleLeaderLineScaleAll');
        const leaderLineAllLabel = document.getElementById('styleLeaderLineScaleAllLabel');
        const sampleSize = getStyleSize('defectStructural');
        const pinV = sampleSize.pin;
        const arrowV = sampleSize.arrow;
        const lineV = clampLeaderLineScale(getActiveLeaderLineScale() || 1);
        if (pinAllInput) pinAllInput.value = pinV;
        if (pinAllLabel) pinAllLabel.textContent = `${Math.round(pinV * 100)}%`;
        if (arrowAllInput) arrowAllInput.value = arrowV;
        if (arrowAllLabel) arrowAllLabel.textContent = `${Math.round(arrowV * 100)}%`;
        if (leaderLineAllInput) leaderLineAllInput.value = lineV;
        if (leaderLineAllLabel) leaderLineAllLabel.textContent = `${Math.round(lineV * 100)}%`;

        const ndtPinAll = document.getElementById('stylePinSizeNdtCurrent');
        const ndtPinLabel = document.getElementById('stylePinSizeNdtCurrentLabel');
        const ndtArrowAll = document.getElementById('styleArrowSizeNdtCurrent');
        const ndtArrowLabel = document.getElementById('styleArrowSizeNdtCurrentLabel');
        const ndtLineAll = document.getElementById('styleLeaderLineScaleNdtCurrent');
        const ndtLineLabel = document.getElementById('styleLeaderLineScaleNdtCurrentLabel');
        const ndtCatLabel = document.getElementById('ndtStyleCatLabel');
        const ndtKey = getCurrentNdtStyleKey();
        const ndtSample = getStyleSize(ndtKey);
        const ndtPinV = ndtSample.pin;
        const ndtArrowV = ndtSample.arrow;
        const ndtLineV = clampLeaderLineScale(ndtSample.leader || 1, LEADER_LINE_SCALE_MAX_NDT);
        if (ndtCatLabel) {
            const cat = currentNdtCategory || '실측';
            ndtCatLabel.textContent = (cat === '강도' || cat === '탄산화')
                ? '강도·탄산화 (크기 동기화)'
                : getNdtCategoryLabel(cat);
        }
        if (ndtPinAll) ndtPinAll.value = ndtPinV;
        if (ndtPinLabel) ndtPinLabel.textContent = `${Math.round(ndtPinV * 100)}%`;
        if (ndtArrowAll) ndtArrowAll.value = ndtArrowV;
        if (ndtArrowLabel) ndtArrowLabel.textContent = `${Math.round(ndtArrowV * 100)}%`;
        if (ndtLineAll) ndtLineAll.value = ndtLineV;
        if (ndtLineLabel) ndtLineLabel.textContent = `${Math.round(ndtLineV * 100)}%`;
        if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
        if (typeof window.applyStyleSizePanelUi === 'function') window.applyStyleSizePanelUi();
    };

    function persistCurrentFloorMapStyleFromSliders() {
        saveFloorMapStyleSettings(state.currentFloor, state.currentBuildingId);
    }

    function commitStyleModalChanges() {
        persistCurrentFloorMapStyleFromSliders();
        state._globalStyleSizesFallback = cloneStyleSizesMap(state.styleSizes);
        state._globalDefectLeaderLineScaleFallback = state.defectLeaderLineScale !== undefined
            ? state.defectLeaderLineScale
            : 1.0;
        if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
        saveStateToLocalStorage();
        if (typeof window.showToast === 'function') window.showToast('스타일 설정을 저장했습니다.', 'success');
    }

    window.openStyleColorModal = function() {
        _styleModalSnapshot = cloneStyleModalState();
        _styleModalDraftActive = true;
        populateStyleColorModalControls();
        const modal = document.getElementById('styleColorModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function hideStyleColorModal() {
        const modal = document.getElementById('styleColorModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
        _styleModalDraftActive = false;
        _styleModalSnapshot = null;
    }

    function closeStyleColorModal() {
        // 닫기: 수정사항 저장 없이 스냅샷 복원
        if (_styleModalSnapshot) {
            restoreStyleModalSnapshot(_styleModalSnapshot);
            if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
            refreshAllStyleColoredCanvases();
        }
        hideStyleColorModal();
    }

    function saveStyleColorModal() {
        commitStyleModalChanges();
        hideStyleColorModal();
    }

    function setupStyleColorModalEvents() {
        const btnOpen1 = document.getElementById('btnOpenStyleColorModal');
        if (btnOpen1) btnOpen1.addEventListener('click', window.openStyleColorModal);
        const btnOpen2 = document.getElementById('btnOpenStyleColorModalNdt');
        if (btnOpen2) btnOpen2.addEventListener('click', window.openStyleColorModal);

        const btnClose1 = document.getElementById('btnCloseStyleColorModal');
        if (btnClose1) btnClose1.addEventListener('click', closeStyleColorModal);
        const btnClose2 = document.getElementById('btnCloseStyleColorModal2');
        if (btnClose2) btnClose2.addEventListener('click', closeStyleColorModal);
        const btnSave = document.getElementById('btnSaveStyleColorModal');
        if (btnSave) btnSave.addEventListener('click', saveStyleColorModal);
        const styleModalEl = document.getElementById('styleColorModal');
        if (styleModalEl && !styleModalEl.dataset.overlayBound) {
            styleModalEl.dataset.overlayBound = '1';
            styleModalEl.addEventListener('click', (e) => {
                if (e.target === styleModalEl) closeStyleColorModal();
            });
        }

        const guideOpInput = document.getElementById('styleGuideOpacity');
        if (guideOpInput) guideOpInput.addEventListener('input', () => {
            if (!state.styleColors) state.styleColors = {};
            state.styleColors.guideOpacity = String(clampGuideOpacity(guideOpInput.value));
            syncGuideOpacityUi();
            refreshAllStyleColoredCanvases();
        });

        STYLE_COLOR_FIELDS.forEach(([inputId, key]) => {
            const input = document.getElementById(inputId);
            if (!input) return;
            input.addEventListener('input', () => {
                if (!state.styleColors) state.styleColors = {};
                state.styleColors[key] = input.value;
                refreshAllStyleColoredCanvases();
            });
        });

        STYLE_SIZE_FIELDS.forEach(([suffix, key]) => {
            const pinInput = document.getElementById(`stylePinSize${suffix}`);
            const pinLabel = document.getElementById(`stylePinSize${suffix}Label`);
            const arrowInput = document.getElementById(`styleArrowSize${suffix}`);
            const arrowLabel = document.getElementById(`styleArrowSize${suffix}Label`);
            const leaderInput = document.getElementById(`styleLeaderSize${suffix}`);
            const leaderLabel = document.getElementById(`styleLeaderSize${suffix}Label`);

            if (pinInput) {
                pinInput.addEventListener('input', () => {
                    const v = parseFloat(pinInput.value);
                    setStyleSizeFields(key, { pin: v });
                    if (pinLabel) pinLabel.textContent = `${Math.round(v * 100)}%`;
                    if (key === 'ndtStrength' || key === 'ndtCarbonation') syncNdtStrengthCarbSizeControlsUi();
                    if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
                    refreshAllStyleColoredCanvases();
                });
            }
            if (arrowInput) {
                arrowInput.addEventListener('input', () => {
                    const v = parseFloat(arrowInput.value);
                    setStyleSizeFields(key, { arrow: v });
                    if (arrowLabel) arrowLabel.textContent = `${Math.round(v * 100)}%`;
                    if (key === 'ndtStrength' || key === 'ndtCarbonation') syncNdtStrengthCarbSizeControlsUi();
                    if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
                    refreshAllStyleColoredCanvases();
                });
            }
            if (leaderInput) {
                leaderInput.addEventListener('input', () => {
                    const v = clampLeaderLineScale(leaderInput.value || '1', LEADER_LINE_SCALE_MAX_NDT);
                    setStyleSizeFields(key, { leader: v });
                    if (leaderLabel) leaderLabel.textContent = `${Math.round(v * 100)}%`;
                    if (key === 'ndtStrength' || key === 'ndtCarbonation') syncNdtStrengthCarbSizeControlsUi();
                    if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
                    refreshAllStyleColoredCanvases();
                });
            }
            const fontInput = document.getElementById(`styleFontSize${suffix}`);
            const fontLabel = document.getElementById(`styleFontSize${suffix}Label`);
            if (fontInput) {
                fontInput.addEventListener('input', () => {
                    const v = normalizePinFontMul(parseFloat(fontInput.value));
                    setStyleSizeFields(key, { font: v });
                    if (fontLabel) fontLabel.textContent = `${Math.round(v * 100)}%`;
                    refreshAllStyleColoredCanvases();
                });
            }
        });

        // 결함위치도 일괄: 결함 카테고리만 (NDT와 분리)
        const pinAllInput = document.getElementById('stylePinSizeAll');
        const pinAllLabel = document.getElementById('stylePinSizeAllLabel');
        if (pinAllInput) {
            pinAllInput.addEventListener('input', () => {
                const v = parseFloat(pinAllInput.value);
                if (pinAllLabel) pinAllLabel.textContent = `${Math.round(v * 100)}%`;
                if (!state.styleSizes) state.styleSizes = {};
                DEFECT_STYLE_SIZE_FIELDS.forEach(([suffix, key]) => {
                    if (!state.styleSizes[key]) state.styleSizes[key] = {};
                    state.styleSizes[key].pin = v;
                    const pinInput = document.getElementById(`stylePinSize${suffix}`);
                    const pinLabel = document.getElementById(`stylePinSize${suffix}Label`);
                    if (pinInput) pinInput.value = v;
                    if (pinLabel) pinLabel.textContent = `${Math.round(v * 100)}%`;
                });
                persistCurrentFloorMapStyleFromSliders();
                if (typeof drawCanvas === 'function') drawCanvas();
                if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            });
            pinAllInput.addEventListener('change', () => {
                persistCurrentFloorMapStyleFromSliders();
                saveStateToLocalStorage();
            });
        }
        const arrowAllInput = document.getElementById('styleArrowSizeAll');
        const arrowAllLabel = document.getElementById('styleArrowSizeAllLabel');
        if (arrowAllInput) {
            arrowAllInput.addEventListener('input', () => {
                const v = parseFloat(arrowAllInput.value);
                if (arrowAllLabel) arrowAllLabel.textContent = `${Math.round(v * 100)}%`;
                if (!state.styleSizes) state.styleSizes = {};
                DEFECT_STYLE_SIZE_FIELDS.forEach(([suffix, key]) => {
                    if (!state.styleSizes[key]) state.styleSizes[key] = {};
                    state.styleSizes[key].arrow = v;
                    const arrowInput = document.getElementById(`styleArrowSize${suffix}`);
                    const arrowLabel = document.getElementById(`styleArrowSize${suffix}Label`);
                    if (arrowInput) arrowInput.value = v;
                    if (arrowLabel) arrowLabel.textContent = `${Math.round(v * 100)}%`;
                });
                persistCurrentFloorMapStyleFromSliders();
                if (typeof drawCanvas === 'function') drawCanvas();
            });
            arrowAllInput.addEventListener('change', () => {
                persistCurrentFloorMapStyleFromSliders();
                saveStateToLocalStorage();
            });
        }

        const btnApplyAllFloors = document.getElementById('btnApplyMapStyleAllFloors');
        if (btnApplyAllFloors) {
            btnApplyAllFloors.addEventListener('click', () => window.applyCurrentFloorMapStyleToAllFloors());
        }

        const leaderLineAllInput = document.getElementById('styleLeaderLineScaleAll');
        const leaderLineAllLabel = document.getElementById('styleLeaderLineScaleAllLabel');
        const syncLeaderLineUi = () => {
            const v = clampLeaderLineScale(getActiveLeaderLineScale() || 1);
            if (leaderLineAllInput) leaderLineAllInput.value = v;
            if (leaderLineAllLabel) leaderLineAllLabel.textContent = `${Math.round(v * 100)}%`;
        };
        syncLeaderLineUi();
        if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
        if (leaderLineAllInput) {
            leaderLineAllInput.addEventListener('input', () => {
                const v = clampLeaderLineScale(leaderLineAllInput.value || '1');
                state.defectLeaderLineScale = v;
                if (leaderLineAllLabel) leaderLineAllLabel.textContent = `${Math.round(v * 100)}%`;
                persistCurrentFloorMapStyleFromSliders();
                if (typeof drawCanvas === 'function') drawCanvas();
            });
            leaderLineAllInput.addEventListener('change', () => {
                persistCurrentFloorMapStyleFromSliders();
                saveStateToLocalStorage();
            });
        }

        // NDT 툴바: 현재 선택한 조사 항목만 조절 (강도·탄산화 크기는 동기화)
        const syncNdtModalSizeUi = (key) => {
            const keys = (key === 'ndtStrength' || key === 'ndtCarbonation')
                ? ['ndtStrength', 'ndtCarbonation']
                : [key];
            keys.forEach((k) => {
                const entry = NDT_STYLE_SIZE_FIELDS.find(([, x]) => x === k);
                if (!entry) return;
                const [suffix] = entry;
                const sz = getStyleSize(k);
                const pinInput = document.getElementById(`stylePinSize${suffix}`);
                const pinLabel = document.getElementById(`stylePinSize${suffix}Label`);
                const arrowInput = document.getElementById(`styleArrowSize${suffix}`);
                const arrowLabel = document.getElementById(`styleArrowSize${suffix}Label`);
                const leaderInput = document.getElementById(`styleLeaderSize${suffix}`);
                const leaderLabel = document.getElementById(`styleLeaderSize${suffix}Label`);
                if (pinInput) pinInput.value = sz.pin;
                if (pinLabel) pinLabel.textContent = `${Math.round(sz.pin * 100)}%`;
                if (arrowInput) arrowInput.value = sz.arrow;
                if (arrowLabel) arrowLabel.textContent = `${Math.round(sz.arrow * 100)}%`;
                if (leaderInput) leaderInput.value = sz.leader;
                if (leaderLabel) leaderLabel.textContent = `${Math.round(sz.leader * 100)}%`;
            });
        };

        const ndtPinCur = document.getElementById('stylePinSizeNdtCurrent');
        const ndtPinCurLabel = document.getElementById('stylePinSizeNdtCurrentLabel');
        if (ndtPinCur) {
            ndtPinCur.addEventListener('input', () => {
                const key = getCurrentNdtStyleKey();
                const v = parseFloat(ndtPinCur.value);
                if (ndtPinCurLabel) ndtPinCurLabel.textContent = `${Math.round(v * 100)}%`;
                setStyleSizeFields(key, { pin: v });
                syncNdtModalSizeUi(key);
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            });
            ndtPinCur.addEventListener('change', () => saveStateToLocalStorage());
        }
        const ndtArrowCur = document.getElementById('styleArrowSizeNdtCurrent');
        const ndtArrowCurLabel = document.getElementById('styleArrowSizeNdtCurrentLabel');
        if (ndtArrowCur) {
            ndtArrowCur.addEventListener('input', () => {
                const key = getCurrentNdtStyleKey();
                const v = parseFloat(ndtArrowCur.value);
                if (ndtArrowCurLabel) ndtArrowCurLabel.textContent = `${Math.round(v * 100)}%`;
                setStyleSizeFields(key, { arrow: v });
                syncNdtModalSizeUi(key);
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            });
            ndtArrowCur.addEventListener('change', () => saveStateToLocalStorage());
        }
        const ndtLineCur = document.getElementById('styleLeaderLineScaleNdtCurrent');
        const ndtLineCurLabel = document.getElementById('styleLeaderLineScaleNdtCurrentLabel');
        if (ndtLineCur) {
            ndtLineCur.addEventListener('input', () => {
                const key = getCurrentNdtStyleKey();
                const v = clampLeaderLineScale(ndtLineCur.value || '1', LEADER_LINE_SCALE_MAX_NDT);
                if (ndtLineCurLabel) ndtLineCurLabel.textContent = `${Math.round(v * 100)}%`;
                setStyleSizeFields(key, { leader: v });
                syncNdtModalSizeUi(key);
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            });
            ndtLineCur.addEventListener('change', () => saveStateToLocalStorage());
        }

        const mapLockCb = document.getElementById('styleSizeLockMap');
        if (mapLockCb && !mapLockCb.dataset.lockBound) {
            mapLockCb.dataset.lockBound = '1';
            mapLockCb.addEventListener('change', () => {
                window.state.styleSizeBarLockedMap = !!mapLockCb.checked;
                if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
                saveStateToLocalStorage();
            });
        }
        const ndtLockCb = document.getElementById('styleSizeLockNdt');
        if (ndtLockCb && !ndtLockCb.dataset.lockBound) {
            ndtLockCb.dataset.lockBound = '1';
            ndtLockCb.addEventListener('change', () => {
                window.state.styleSizeBarLockedNdt = !!ndtLockCb.checked;
                if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
                saveStateToLocalStorage();
            });
        }
        if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
        if (typeof window.applyStyleSizePanelUi === 'function') window.applyStyleSizePanelUi();

        STYLE_SHAPE_FIELDS.forEach(([suffix, key]) => {
            const shapeInput = document.getElementById(`styleShape${suffix}`);
            const fillInput = document.getElementById(`styleFill${suffix}`);
            const numFmtInput = document.getElementById(`styleNumFmt${suffix}`);

            if (shapeInput) {
                shapeInput.addEventListener('change', () => {
                    if (!state.styleShapes) state.styleShapes = {};
                    if (!state.styleShapes[key]) state.styleShapes[key] = {};
                    state.styleShapes[key].shape = shapeInput.value;
                    refreshAllStyleColoredCanvases();
                });
            }
            if (fillInput) {
                fillInput.addEventListener('change', () => {
                    if (!state.styleShapes) state.styleShapes = {};
                    if (!state.styleShapes[key]) state.styleShapes[key] = {};
                    state.styleShapes[key].fill = fillInput.checked;
                    refreshAllStyleColoredCanvases();
                });
            }
            if (numFmtInput) {
                numFmtInput.addEventListener('change', () => {
                    if (!state.styleShapes) state.styleShapes = {};
                    if (!state.styleShapes[key]) state.styleShapes[key] = {};
                    state.styleShapes[key].numberFormat = numFmtInput.value;
                    refreshAllStyleColoredCanvases();
                });
            }
        });

        const btnReset = document.getElementById('btnResetStyleColors');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (!await window.appConfirm('모든 색상/크기/모양 설정을 기본값으로 초기화하시겠습니까?\n(저장을 눌러야 반영됩니다)')) return;
                state.styleColors = {};
                state.styleColorsPaletteVersion = STYLE_COLORS_PALETTE_VERSION;
                state.styleSizes = {};
                state.styleShapes = {};
                state.ndtLeaderLineScale = 1.0;
                state.defectLeaderLineScale = 1.0;
                populateStyleColorModalControls();
                if (typeof window.syncBulkStyleSlidersUi === 'function') window.syncBulkStyleSlidersUi();
                refreshAllStyleColoredCanvases();
            });
        }
    }

    function setupTipShapeEvents() {
        const btnArrow = document.getElementById('btnTipShapeArrow');
        const btnCircle = document.getElementById('btnTipShapeCircle');

        const applyTipShape = (shape) => {
            state.tipShape = shape;
            state.tipShapeChosen = true;   // 직접 고름 — 기본(동그라미)이 바뀌어도 이 값을 지킨다
            if (btnArrow) btnArrow.classList.toggle('active', shape === 'arrow');
            if (btnCircle) btnCircle.classList.toggle('active', shape === 'circle');
            refreshAllStyleColoredCanvases();
            saveStateToLocalStorage();
        };

        if (btnArrow) btnArrow.addEventListener('click', () => applyTipShape('arrow'));
        if (btnCircle) btnCircle.addEventListener('click', () => applyTipShape('circle'));

        if (btnArrow) btnArrow.classList.toggle('active', state.tipShape !== 'circle');
        if (btnCircle) btnCircle.classList.toggle('active', state.tipShape === 'circle');
    }

    function setupAreaMarkStyleEvents() {
        const fillBtns = {
            solid: document.getElementById('btnAreaFillSolid'),
            hatch: document.getElementById('btnAreaFillHatch'),
            none: document.getElementById('btnAreaFillNone')
        };
        const borderBtns = {
            solid: document.getElementById('btnAreaBorderSolid'),
            dashed: document.getElementById('btnAreaBorderDashed')
        };

        Object.keys(fillBtns).forEach(k => {
            if (!fillBtns[k]) return;
            fillBtns[k].addEventListener('click', () => {
                if (isDefectBulkEditMode()) markDefectBulkFieldChanged('areaFillStyle');
                syncDefectAreaStyleUi(k, getSelectedAreaBorderFromUi());
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
        });
        Object.keys(borderBtns).forEach(k => {
            if (!borderBtns[k]) return;
            borderBtns[k].addEventListener('click', () => {
                if (isDefectBulkEditMode()) markDefectBulkFieldChanged('areaBorderStyle');
                syncDefectAreaStyleUi(getSelectedAreaFillFromUi(), k);
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
        });
    }

    const btnManageComponent = document.getElementById('btnManageComponent');
    if (btnManageComponent) btnManageComponent.addEventListener('click', () => window.openOptionManagerModal('component'));

    const btnManageDefectType = document.getElementById('btnManageDefectType');
    if (btnManageDefectType) btnManageDefectType.addEventListener('click', () => window.openOptionManagerModal('type'));

    const btnManageCause = document.getElementById('btnManageCause');
    if (btnManageCause) btnManageCause.addEventListener('click', () => window.openOptionManagerModal('cause'));

    const btnCloseOptionManager = document.getElementById('btnCloseOptionManager');
    if (btnCloseOptionManager) btnCloseOptionManager.addEventListener('click', closeOptionManagerModal);

    const btnOptionManagerAdd = document.getElementById('btnOptionManagerAdd');
    if (btnOptionManagerAdd) {
        btnOptionManagerAdd.addEventListener('click', () => {
            const input = document.getElementById('optionManagerNewInput');
            const val = (input?.value || '').trim();
            if (!val) return;

            const ctx = getOptionManagerContext();
            if (!ctx) return;

            const isVisiblePreset = ctx.presetList.includes(val) && !ctx.hiddenList.includes(val);
            if (isVisiblePreset || ctx.customList.includes(val)) {
                window.showToast('이미 있는 항목입니다.', 'info');
                return;
            }

            const hiddenIdx = ctx.hiddenList.indexOf(val);
            if (hiddenIdx !== -1) {
                // 숨겨뒀던 기본 항목을 다시 추가하는 경우 -> 숨김 해제
                ctx.hiddenList.splice(hiddenIdx, 1);
            } else if (ctx.favField === 'component'
                && typeof shouldLearnDefectComponentForCategory === 'function'
                && !shouldLearnDefectComponentForCategory(ctx.favBucket, val)) {
                window.showToast('기둥·보·슬래브 등 맨몸 구조 부재는 구조체 목록에만 둡니다.', 'info');
                return;
            } else {
                ctx.customList.push(val);
            }
            if (Array.isArray(ctx.orderList) && !ctx.orderList.includes(val)) {
                ctx.orderList.push(val);
            }

            saveStateToLocalStorage();
            if (input) input.value = '';
            renderOptionManagerList();
            ctx.refresh();
        });
    }

    const btnResetCurrentOptionManager = document.getElementById('btnOptionManagerResetCurrent');
    if (btnResetCurrentOptionManager) {
        btnResetCurrentOptionManager.addEventListener('click', () => resetOptionManagerCurrent());
    }

    const btnResetAllOptionManager = document.getElementById('btnOptionManagerResetAll');
    if (btnResetAllOptionManager) {
        btnResetAllOptionManager.addEventListener('click', () => resetOptionManagerAll());
    }

    [['btnOptionManagerLoadServer', 'load', 'server'], ['btnOptionManagerLoadCompany', 'load', 'company'],
        ['btnOptionManagerSaveServer', 'save', 'server'], ['btnOptionManagerSaveCompany', 'save', 'company']].forEach(([id, act, which]) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => (act === 'load' ? loadDefectSettingsPreset(which) : saveDefectSettingsPreset(which)));
    });

    // Canvas Mouse & Touch Event Handlers with Threshold-Based Pin & Arrow Dragging & Multi-Touch Pinch Zoom
    let isDragging = false;
    let isMarkingDrag = false;
    // 2026-10-19 터치로 빈 곳을 눌렀을 때 선택 해제·수정창 닫기를 뗄 때까지 미룸(끌어서 도면 이동하면 그대로 둠)
    let emptyTapPending = null;
    let pendingDragHit = null; // 눌렀지만 아직 이동임계값을 넘지 않아 드래그 시작을 보류 중인 히트 정보
    let pendingDragIsTouch = false; // pendingDragHit이 터치로 시작됐는지 (임계값/유예시간을 마우스와 다르게 적용)
    let pendingDragHitStartTime = 0; // 터치로 핀을 짚은 시각(ms)
    let pendingDragArmed = false; // 길게 누름 완료 → 이후 이동 시 드래그 허용
    let pendingDragOpenedModal = false; // PC 마우스: mousedown에서 이미 수정창을 연 경우 mouseup 중복 오픈 방지
    let pendingDragLongPressTimer = null;
    let activePointerIsTouch = false; // 현재 제스처가 터치인지 (합성 마우스 무시·돋보기용)
    // 2026-10-16 마지막으로 도면을 누른 포인터 종류(mouse/pen/touch). 펜은 마우스 이벤트로도 들어오므로 따로 기억.
    let mapLastPointerType = 'mouse';
    let mapTouchStartedOnCanvas = false; // 도면에서 시작한 터치만 스크롤 잠금
    let mapSuppressMouseUntil = 0; // 터치 후 합성 mouseup/move가 드래그를 끊지 않게
    let _mapLoupeRaf = 0;
    let _mapLoupePending = null;
    const TOUCH_DRAG_THRESHOLD = 10; // 터치 클릭 vs 드래그 구분 (너무 크면 돋보기만 움직이는 구간이 김)
    const MOUSE_DRAG_THRESHOLD = 14;
    const TOUCH_QUICK_DRAG_THRESHOLD = 14; // 터치: 길게 누르지 않고 바로 끌 때 이만큼 움직여야 이동 시작
    const TOUCH_LONG_PRESS_MS = 500; // (레거시 상수)
    // 2026-10-16 PC·터치 공통: 이미 선택된 마킹을 0.3초 꾹 누른 뒤에야 끌어서 이동
    const MARKING_HOLD_TO_DRAG_MS = 300;
    const MARKING_TAP_MAX_MS = 500; // 이보다 오래 누르고 떼면 탭(선택·수정창)으로 보지 않음
    const MAP_LOUPE_ID = 'mapTouchLoupe';
    const NDT_LOUPE_ID = 'ndtTouchLoupe';
    const TOUCH_LOUPE_SIZE = 168;
    // 1.0 = 손가락 아래를 그대로 위로 옮겨 보여줌 (실제 도면/화면은 확대하지 않음)
    const TOUCH_LOUPE_ZOOM = 1.0;
    let mobileMarqueeSelectEnabled = false; // 우측 레일 '선택' — 빈 곳 드래그로 마퀴 선택
    let mobileAddSelectEnabled = false; // 우측 레일 '추가' — 터치마다 선택 토글
    let isDraggingPin = false;
    let isDraggingPinGroup = false;
    /** 마킹 핀 드래그 중(터치·마우스) — 목록 center 스크롤/선택 팬이 뷰를 흔들지 않게 */
    function isMapPinDragActive() {
        return !!(isDraggingPin || isDraggingPinGroup);
    }
    let groupDragLastImgX = 0;
    let groupDragLastImgY = 0;
    let activeDragPin = null;
    let activeDragPart = 'BOX'; // BOX | TIP | AREA_MOVE | AREA_RESIZE | AREA_ROTATE | AREA_VERTEX
    let activeResizeXField = null; // 'areaX1' | 'areaX2' | null
    let activeResizeYField = null; // 'areaY1' | 'areaY2' | null
    // 박스/팁 드래그: 클릭 지점 → 중심 오프셋 (순간 중앙 스냅 방지)
    let pinDragOffsetX = 0;
    let pinDragOffsetY = 0;

    /** 원격 merge로 defects 배열 객체가 바뀌어도 드래그 중인 결함 참조·좌표를 유지 */
    function rebindActiveDragPinFromState() {
        if (!activeDragPin?.id || !state.currentBuildingId || !state.currentFloor) return activeDragPin;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const arr = state.defects?.[key];
        if (!Array.isArray(arr)) return activeDragPin;
        const fresh = arr.find(d => d.id === activeDragPin.id);
        if (!fresh || fresh === activeDragPin) return activeDragPin;
        if (activeDragPart === 'TIP') {
            if (activeDragPin.targetX !== undefined) fresh.targetX = activeDragPin.targetX;
            if (activeDragPin.targetY !== undefined) fresh.targetY = activeDragPin.targetY;
            fresh.x = activeDragPin.x;
            fresh.y = activeDragPin.y;
            if (activeDragPin.groupId) {
                arr.forEach(d => {
                    if (d.groupId === activeDragPin.groupId && d.id !== activeDragPin.id) {
                        d.x = activeDragPin.x;
                        d.y = activeDragPin.y;
                    }
                });
            }
        } else if (activeDragPart === 'AREA_MOVE') {
            fresh.areaX1 = activeDragPin.areaX1;
            fresh.areaY1 = activeDragPin.areaY1;
            fresh.areaX2 = activeDragPin.areaX2;
            fresh.areaY2 = activeDragPin.areaY2;
            fresh.areaAngle = activeDragPin.areaAngle;
            fresh.areaShape = activeDragPin.areaShape;
            fresh.areaPoints = activeDragPin.areaPoints;
            fresh.areaDrawings = activeDragPin.areaDrawings;
            fresh.x = activeDragPin.x;
            fresh.y = activeDragPin.y;
            if (activeDragPin.targetX !== undefined) fresh.targetX = activeDragPin.targetX;
            if (activeDragPin.targetY !== undefined) fresh.targetY = activeDragPin.targetY;
        } else if (activeDragPart === 'AREA_RESIZE' || activeDragPart === 'AREA_ROTATE' || activeDragPart === 'AREA_VERTEX') {
            fresh.areaX1 = activeDragPin.areaX1;
            fresh.areaY1 = activeDragPin.areaY1;
            fresh.areaX2 = activeDragPin.areaX2;
            fresh.areaY2 = activeDragPin.areaY2;
            fresh.areaAngle = activeDragPin.areaAngle;
            fresh.areaPoints = activeDragPin.areaPoints;
            fresh.areaDrawings = activeDragPin.areaDrawings;
            if (activeDragPin.targetX !== undefined) fresh.targetX = activeDragPin.targetX;
            if (activeDragPin.targetY !== undefined) fresh.targetY = activeDragPin.targetY;
        } else {
            fresh.x = activeDragPin.x;
            fresh.y = activeDragPin.y;
            if (activeDragPin.groupId) {
                arr.forEach(d => {
                    if (d.groupId === activeDragPin.groupId && d.id !== activeDragPin.id) {
                        d.x = activeDragPin.x;
                        d.y = activeDragPin.y;
                    }
                });
            }
        }
        activeDragPin = fresh;
        return fresh;
    }

    // 결함위치도 범례 박스 드래그 이동/크기조절 상태
    let isDraggingLegend = false;
    let isResizingLegend = false;
    let legendDragOffsetX = 0;
    let legendDragOffsetY = 0;
    let legendResizeStartDist = 1;
    let legendResizeStartScale = 1;

    // lastLegendBoxBounds(도면 원본 픽셀 좌표, 결함 핀과 동일 좌표계) 기준으로 이미지 좌표(imgX, imgY —
    // 핀 히트테스트에 쓰는 것과 동일하게 팬/줌/회전을 역변환한 좌표)가 범례 박스의 크기조절 손잡이/본문
    // 중 어디에 해당하는지 판정한다. 영역 마킹과 같이 모서리·변 히트도 지원한다.
    function legendImageToLocal(imgX, imgY, boxX, boxY, rotDeg) {
        const dx = imgX - boxX;
        const dy = imgY - boxY;
        const rad = ((rotDeg || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }

    function hitTestLegendBox(imgX, imgY) {
        if (isLocationMapLegendLocked()) return null;
        if (!lastLegendBoxBounds) return null;
        const b = lastLegendBoxBounds;
        const local = legendImageToLocal(imgX, imgY, b.x, b.y, state.rotationAngle || 0);
        const lx = local.x;
        const ly = local.y;
        const x1 = 0;
        const y1 = 0;
        const x2 = b.w;
        const y2 = b.h;
        const cornerR = Math.max(LEGEND_HANDLE_SIZE * (b.scale || 1), 14);
        const edgeTol = Math.max(8, 6 * (b.scale || 1));

        const corners = [
            { x: x1, y: y1, cursor: 'nwse-resize' },
            { x: x2, y: y1, cursor: 'nesw-resize' },
            { x: x1, y: y2, cursor: 'nesw-resize' },
            { x: x2, y: y2, cursor: 'nwse-resize' }
        ];
        const hitCorner = corners.find(c => Math.hypot(lx - c.x, ly - c.y) <= cornerR);
        if (hitCorner) {
            return { part: 'handle', cursor: hitCorner.cursor };
        }
        if (Math.abs(ly - y1) <= edgeTol && lx >= x1 + cornerR && lx <= x2 - cornerR) {
            return { part: 'handle', cursor: 'ns-resize' };
        }
        if (Math.abs(ly - y2) <= edgeTol && lx >= x1 + cornerR && lx <= x2 - cornerR) {
            return { part: 'handle', cursor: 'ns-resize' };
        }
        if (Math.abs(lx - x1) <= edgeTol && ly >= y1 + cornerR && ly <= y2 - cornerR) {
            return { part: 'handle', cursor: 'ew-resize' };
        }
        if (Math.abs(lx - x2) <= edgeTol && ly >= y1 + cornerR && ly <= y2 - cornerR) {
            return { part: 'handle', cursor: 'ew-resize' };
        }
        if (lx >= x1 && lx <= x2 && ly >= y1 && ly <= y2) {
            return { part: 'body', cursor: 'move' };
        }
        return null;
    }

    // Area(면적) Marking Mode State
    let isAreaDrag = false;
    let areaStartImgX = 0;
    let areaStartImgY = 0;
    let areaCurImgX = 0;
    let areaCurImgY = 0;
    let areaMoveLastImgX = 0;
    let areaMoveLastImgY = 0;
    let pendingAreaPoly = null; // 다각형 영역 생성 중 점들
    // 터치 다각형: 손가락을 뗄 때 점을 찍는다(두 손가락 확대·한 손가락 끌어 이동과 안 겹치게) — { clientX, clientY, x, y }
    let touchPolyTap = null;
    /**
     * 도면 터치 제스처 규칙 (2026-10-03 실기기: 확대·이동 중에 다각형 점이 찍힘)
     * - 점은 「깨끗한 한 손가락 탭」만: 누르고 뗄 때까지 8px 미만·500ms 미만, 그동안 두 번째 손가락 없음
     * - 두 손가락이 한 번이라도 닿으면 모든 손가락이 떨어질 때까지 터치를 무시하고, 그 뒤 250ms 더 무시
     *   (확대 끝에 남은 손가락을 떼거나 다시 대는 것이 탭/그리기로 잡히지 않게)
     */
    const TOUCH_TAP_MAX_MOVE_PX = 8;
    const TOUCH_TAP_MAX_MS = 500;
    const TOUCH_MULTI_COOLDOWN_MS = 250;
    let touchMultiActive = false;
    let touchCooldownUntil = 0;
    function isCleanTouchTap(tap, now) {
        if (!tap || tap.multi) return false;
        if ((tap.maxMove || 0) >= TOUCH_TAP_MAX_MOVE_PX) return false;
        return (now - (tap.downAt || 0)) < TOUCH_TAP_MAX_MS;
    }
    window.__bsaTouchTapRule = { isCleanTouchTap, TOUCH_TAP_MAX_MOVE_PX, TOUCH_TAP_MAX_MS, TOUCH_MULTI_COOLDOWN_MS };
    let pendingAreaPolyRedraw = null; // { defectId } 기존 영역 외곽 다시그리기
    let isAreaInkDrag = false;
    let areaInkStroke = null;
    let pendingInkPoly = null; // 내부 다각형 그리기 점들
    let areaRotateStartAngle = 0; // legacy
    let areaRotatePivot = null;
    let areaRotateStartMouse = 0;
    let areaRotateBaseAngle = 0;
    let areaRotateSnapshot = null;
    let activeVertexIndex = -1;

    // 선택 모드: 좌클릭 드래그로 마퀴 선택 (휠클릭은 도면 이동)
    // Ctrl/Meta + 마퀴 = 기존 선택에 추가(여러 번 가능)
    let isMarqueeSelecting = false;
    let marqueeAdditive = false;
    let marqueeStartImgX = 0;
    let marqueeStartImgY = 0;
    let marqueeCurImgX = 0;
    let marqueeCurImgY = 0;
    let selectedDefectIds = new Set();
    window.getSelectedDefectIds = () => selectedDefectIds;

    function updateMapSelectionBar(options = {}) {
        const n = selectedDefectIds.size;
        const label = n > 0 ? `선택 삭제 (${n})` : '선택 삭제';
        const bulkLabel = n > 1 ? `일괄 수정 (${n})` : '일괄 수정';
        const desktopBtn = document.getElementById('btnDeleteSelectedDefects');
        const desktopLabel = document.getElementById('mapSelectionToolbarLabel');
        const bulkDesktopBtn = document.getElementById('btnBulkEditSelectedDefects');
        const bulkDesktopLabel = document.getElementById('mapBulkEditToolbarLabel');
        const mobileBtn = document.getElementById('mobileBtnDeleteSelected');
        const mobileLabel = document.getElementById('mobileMapSelectionLabel');
        const bulkMobileBtn = document.getElementById('mobileBtnBulkEditSelected');
        const bulkMobileLabel = document.getElementById('mobileMapBulkEditLabel');
        if (desktopLabel) desktopLabel.textContent = label;
        if (mobileLabel) mobileLabel.textContent = label;
        if (bulkDesktopLabel) bulkDesktopLabel.textContent = bulkLabel;
        if (bulkMobileLabel) bulkMobileLabel.textContent = bulkLabel;
        if (desktopBtn) {
            desktopBtn.hidden = n === 0;
            desktopBtn.disabled = n === 0;
            desktopBtn.title = n > 0 ? `선택한 결함 ${n}건 삭제` : '선택한 결함 삭제';
        }
        if (bulkDesktopBtn) {
            bulkDesktopBtn.hidden = n < 2;
            bulkDesktopBtn.disabled = n < 2;
            bulkDesktopBtn.title = n > 1 ? `선택한 결함 ${n}건 일괄 수정` : '2개 이상 선택 시 일괄 수정';
        }
        if (mobileBtn) {
            mobileBtn.hidden = n === 0;
            mobileBtn.disabled = n === 0;
            mobileBtn.title = n > 0 ? `선택한 결함 ${n}건 삭제` : '선택한 결함 삭제';
        }
        if (bulkMobileBtn) {
            bulkMobileBtn.hidden = n < 2;
            bulkMobileBtn.disabled = n < 2;
            bulkMobileBtn.title = n > 1 ? `선택한 결함 ${n}건 일괄 수정` : '2개 이상 선택 시 일괄 수정';
        }
        syncDefectMergeButtons();
        // 결함목록: 선택됨은 바깥 고정 칸 — 본 목록 scrollTop은 선택 변경으로 움직이지 않음
        // scrollToSelection 플래그는 호환용(렌더러가 목록 점프에 쓰지 않음)
        if (typeof renderDefectListPanel === 'function') {
            renderDefectListPanel({ scrollToSelection: false });
        }
        if (typeof syncAreaToolPanelUi === 'function') syncAreaToolPanelUi();
        // 조사항목 창 OFF: 좌상단 팝업으로 선택 결함 내용·폭 표시
        if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
        if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
    }

    /** 선택 상태 → 「통합」(마킹 2개 이상) · 「통합 해제」(통합된 번호칸 하나) */
    function getDefectMergeSelectionState() {
        const out = { units: 0, plan: null, unmergeGroupId: null, list: null, key: null };
        const api = defectMergeApi();
        if (!api || !state.currentBuildingId || !selectedDefectIds.size) return out;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const list = state.defects[key] || [];
        const ids = [...selectedDefectIds];
        if (!ids.every((id) => list.some((d) => d && d.id === id))) return out;
        const units = api.collectMergeUnits(list, ids);
        out.units = units.length;
        out.list = list;
        out.key = key;
        if (units.length >= 2) out.plan = api.planMerge(list, ids);
        if (units.length === 1) {
            const gids = api.mergedGroupIdsInSelection(list, ids);
            if (gids.length === 1) out.unmergeGroupId = gids[0];
        }
        return out;
    }

    function syncDefectMergeButtons() {
        const st = getDefectMergeSelectionState();
        const showMerge = st.units >= 2;
        const showUnmerge = !!st.unmergeGroupId;
        const mergeTitle = showMerge
            ? (st.plan && st.plan.ok
                ? `선택한 마킹 ${st.units}개를 가장 작은 번호칸 하나로 통합`
                : ((st.plan && st.plan.reason) || '통합할 수 없습니다'))
            : '마킹 2개 이상 선택 시 통합';
        ['btnMergeSelectedDefects', 'mobileBtnMergeSelected'].forEach((id) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.hidden = !showMerge;
            b.disabled = !showMerge;
            b.title = mergeTitle;
        });
        ['btnUnmergeSelectedDefects', 'mobileBtnUnmergeSelected'].forEach((id) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.hidden = !showUnmerge;
            b.disabled = !showUnmerge;
        });
        const fab = document.getElementById('mobileMapFabBar');
        if (fab) fab.classList.toggle('has-merge', showMerge || showUnmerge);
    }

    function syncMobileAddMarkingFab() {
        const btn = document.getElementById('mobileBtnAddAnotherMarking');
        const assignBtn = document.getElementById('mobileBtnAssignSurveyNo');
        const fab = document.getElementById('mobileMapFabBar');
        const bulk = typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode();
        const modalOpen = document.body.classList.contains('defect-modal-open');
        const showAdd = modalOpen && !bulk;
        if (btn) {
            btn.hidden = !showAdd;
            btn.disabled = !showAdd;
            if (showAdd) btn.style.display = '';
        }
        const pinId = document.getElementById('defectPinId')?.value;
        const current = pinId
            ? (state.defects[`${state.currentBuildingId}_${state.currentFloor}`] || []).find((x) => x.id === pinId)
            : null;
        const showAssign = showAdd && canAssignSurveyNumberToDefect(current);
        if (assignBtn) {
            assignBtn.hidden = !showAssign;
            assignBtn.disabled = !showAssign;
            if (showAssign) assignBtn.style.display = '';
            else assignBtn.style.display = 'none';
        }
        const desktopAssign = document.getElementById('btnAssignSurveyNo');
        if (desktopAssign) {
            desktopAssign.hidden = !showAssign;
            desktopAssign.disabled = !showAssign;
        }
        if (fab) {
            fab.classList.toggle('has-add-marking', showAdd);
            fab.classList.toggle('has-assign-no', showAssign);
        }
    }
    window.syncMobileAddMarkingFab = syncMobileAddMarkingFab;

    // 상태조사표 → 결함위치도: 해당 마킹 선택·화면 이동
    // 외부는 조사표가 전체 공유이므로, 다른 외부 도면에 있는 번호면 그 도면으로 전환 후 보여 준다.
    window.viewDefectOnMapFromSurvey = function(defectId) {
        if (!defectId) return;
        if (!state.currentBuildingId) {
            window.showToast?.('건물을 먼저 선택하세요.', 'info');
            return;
        }
        const located = findDefectAcrossBuildingFloors(defectId);
        const consolidated = located && located.defect ? located.defect : null;
        const focusId = consolidated ? consolidated.id : defectId;
        const targetFloor = (located && located.floorCode) || state.currentFloor;
        selectedDefectIds.clear();
        if (consolidated && consolidated._groupMemberIds && consolidated._groupMemberIds.length > 1) {
            consolidated._groupMemberIds.forEach(id => selectedDefectIds.add(id));
        } else if (focusId) {
            selectedDefectIds.add(focusId);
        }
        if (typeof setDrawMode === 'function') setDrawMode('PAN');

        const floorChanged = targetFloor && targetFloor !== state.currentFloor;
        if (floorChanged) {
            if (elements.floorSelect) {
                try { elements.floorSelect.value = targetFloor; } catch (_e) { /* ignore */ }
            }
            if (typeof applyFloorMapStyleSettings === 'function') {
                applyFloorMapStyleSettings(targetFloor, state.currentBuildingId);
            }
            if (typeof loadFloorDrawing === 'function') loadFloorDrawing(targetFloor);
            if (typeof refreshFloorDependentUi === 'function') refreshFloorDependentUi();
            const label = (typeof window.getFloorLabelFromCode === 'function')
                ? window.getFloorLabelFromCode(targetFloor)
                : targetFloor;
            window.showToast?.(`외부 도면 「${label}」으로 이동`, 'info', 2200);
        }

        window.switchTab('tab-map');
        setTimeout(() => {
            if (typeof resizeCanvas === 'function') resizeCanvas();
            if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: true });
            if (typeof drawCanvas === 'function') drawCanvas();
            if (floorChanged) {
                focusDefectAfterFloorReady(focusId, targetFloor, 0);
            } else if (typeof window.focusDefectOnCanvas === 'function') {
                window.focusDefectOnCanvas(focusId, { uncovered: true });
            }
        }, floorChanged ? 320 : 280);
    };

    function translateDefectBy(d, dx, dy) {
        if (!d || (!dx && !dy)) return;
        if (typeof d.x === 'number') d.x += dx;
        if (typeof d.y === 'number') d.y += dy;
        if (typeof d.targetX === 'number') d.targetX += dx;
        if (typeof d.targetY === 'number') d.targetY += dy;
        if (d.areaX1 !== undefined) {
            d.areaX1 += dx;
            d.areaY1 += dy;
            d.areaX2 += dx;
            d.areaY2 += dy;
            translateAreaDrawings(d, dx, dy);
        }
    }

    function syncSharedMarkingGroupBox(defect) {
        if (!defect || !defect.groupId) return;
        const x = defect.x;
        const y = defect.y;
        getCurrentFloorDefects().forEach((d) => {
            if (d && d.groupId === defect.groupId && d.id !== defect.id) {
                d.x = x;
                d.y = y;
            }
        });
    }

    /** 화살표/점 드래그: 번호칸과 지시 끝을 같은 거리만큼 함께 이동 */
    function translatePinMarkingRigid(defect, dx, dy) {
        if (!defect || (!dx && !dy)) return;
        if (typeof defect.x === 'number') defect.x += dx;
        else defect.x = (defect.targetX || 0) + dx;
        if (typeof defect.y === 'number') defect.y += dy;
        else defect.y = (defect.targetY || 0) + dy;
        if (typeof defect.targetX === 'number') defect.targetX += dx;
        if (typeof defect.targetY === 'number') defect.targetY += dy;
        syncSharedMarkingGroupBox(defect);
    }

    function getDefectMarqueeAnchor(d) {
        if (!d) return null;
        if (d.targetX !== undefined && d.targetY !== undefined) {
            return { x: d.targetX, y: d.targetY };
        }
        if (d.shapeType === 'area' && d.areaX1 !== undefined) {
            return {
                x: (Math.min(d.areaX1, d.areaX2) + Math.max(d.areaX1, d.areaX2)) / 2,
                y: (Math.min(d.areaY1, d.areaY2) + Math.max(d.areaY1, d.areaY2)) / 2
            };
        }
        return { x: d.x || 0, y: d.y || 0 };
    }

    function collectMarqueeHits(x1, y1, x2, y2) {
        const hits = [];
        getCurrentFloorMapPlacedDefects().forEach(d => {   // 숨긴 마킹은 박스 선택 안 됨
            const anchor = getDefectMarqueeAnchor(d);
            if (!anchor) return;
            if (anchor.x >= x1 && anchor.x <= x2 && anchor.y >= y1 && anchor.y <= y2) {
                hits.push(d.id);
            }
        });
        return hits;
    }

    async function deleteSelectedDefects() {
        pruneHiddenDefectSelection();   // 숨긴 마킹은 지우지 않는다
        const ids = [...selectedDefectIds];
        if (!ids.length || !state.currentBuildingId) return;
        if (!await window.confirmDelete(`선택한 결함 ${ids.length}건을 삭제할까요? (되돌리기로 복원 가능)`)) return;
        const byKey = new Map();
        ids.forEach((id) => {
            const located = (typeof findDefectFloorKeyById === 'function') ? findDefectFloorKeyById(id) : null;
            const key = located
                ? located.floorKey
                : `${state.currentBuildingId}_${state.currentFloor}`;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(id);
        });
        pushDefectHistory();
        let removed = 0;
        byKey.forEach((idList, key) => {
            if (!state.defects[key]) return;
            idList.forEach((id) => {
                if ((state.defects[key] || []).some((d) => d && d.id === id)) {
                    removeSingleDefectRecord(key, id, { skipRenumber: true });
                    removed += 1;
                }
            });
            normalizeAllDefectGroupNos(state.defects[key]);
            collapseSingletonDefectGroups(state.defects[key]);
        });
        selectedDefectIds.clear();
        updateMapSelectionBar();
        saveStateToLocalStorage();
        renderSurveyTable();
        drawCanvas();
        window.showToast?.(`${removed}건 삭제됨`, 'success');
    }
    window.deleteSelectedDefects = deleteSelectedDefects;

    // Multi-Touch Pinch Zoom & Pan Variables
    let isPinching = false;
    let initialPinchDist = 0;
    let initialPinchScale = 1.0;
    let initialPinchMidX = 0;
    let initialPinchMidY = 0;
    let initialPinchOffsetX = 0;
    let initialPinchOffsetY = 0;

    let markTargetImgX = 0;
    let markTargetImgY = 0;
    let markPreviewTargetX = 0;
    let markPreviewTargetY = 0;
    let markingHasMoved = false;
    let liveBoxImgX = 0;
    let liveBoxImgY = 0;

    function getLiveMarkPinPreviewMeta() {
        const pendingId = window._pendingMapRegisterDefectId;
        if (pendingId) {
            let pendingDefect = getCurrentFloorDefects().find(d => d.id === pendingId);
            if (!pendingDefect && typeof findDefectFloorKeyById === 'function') {
                const located = findDefectFloorKeyById(pendingId);
                if (located) {
                    pendingDefect = (state.defects[located.floorKey] || []).find((d) => d && d.id === pendingId);
                }
            }
            if (pendingDefect) {
                const label = pendingDefect.no || 'NO.??';
                const scale = getStyleSize(getDefectStyleKey(pendingDefect.category, pendingDefect.defectType)).pin;
                return { label, scale, defect: pendingDefect };
            }
        }
        const tmpl = window._defectMarkingTemplate;
        if (tmpl && tmpl.groupId) {
            const label = tmpl.groupNo || 'NO.01';
            const scale = getStyleSize(getDefectStyleKey(tmpl.category || '구조체', tmpl.defectType || '')).pin;
            return {
                label,
                scale,
                defect: {
                    no: label,
                    groupNo: label,
                    category: inheritDefectCategory(tmpl),
                    defectType: tmpl.defectType || ''
                },
                fromGroup: true,
                boxX: tmpl.boxX,
                boxY: tmpl.boxY
            };
        }
        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        const label = getNextDefectNoStr(getFloorDefectsForNumbering(floorKey));
        const defaultCat = readDefectCategoryUi();
        const scale = getStyleSize(getDefectStyleKey(defaultCat, '균열')).pin;
        return { label, scale, defect: null };
    }

    function syncLiveMarkBoxAboveTarget(targetX, targetY) {
        const meta = getLiveMarkPinPreviewMeta();
        if (meta.fromGroup && Number.isFinite(meta.boxX) && Number.isFinite(meta.boxY)) {
            liveBoxImgX = meta.boxX;
            liveBoxImgY = meta.boxY;
            markPreviewTargetX = targetX;
            markPreviewTargetY = targetY;
            return;
        }
        const pos = computePinBoxAboveTarget(targetX, targetY, meta.label, meta.scale, state.ctx, 1);
        liveBoxImgX = pos.boxX;
        liveBoxImgY = pos.boxY;
        markPreviewTargetX = targetX;
        markPreviewTargetY = targetY;
    }

    function isDefectModalOpen() {
        const modal = elements.defectModal || document.getElementById('defectModal');
        if (!modal) return false;
        return modal.classList.contains('open') || modal.style.display === 'flex';
    }

    function isNewDefectModalSession() {
        if (isDefectBulkEditMode()) return false;
        return !document.getElementById('defectPinId')?.value;
    }

    function drawPendingDefectPreview(ctx, currentDefects) {
        if (!isDefectModalOpen() || !isNewDefectModalSession()) return;
        const category = readDefectCategoryUi();
        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        const no = document.getElementById('defectNo')?.value || getNextDefectNoStr(getFloorDefectsForNumbering(floorKey));
        const forceArrowDir = document.getElementById('defectForceArrowDir')?.checked || false;
        const arrowOctant = ((parseInt(document.getElementById('defectArrowOctant')?.value || '0', 10) % 8) + 8) % 8;
        const grp = getActiveMarkingGroup();
        const pinNo = (grp && grp.groupNo) ? grp.groupNo : no;

        if (window._pendingAreaRect) {
            const r = window._pendingAreaRect;
            const pending = window._pendingPinCoords || {};
        drawPin(ctx, {
            shapeType: 'area',
            areaX1: r.x1,
            areaY1: r.y1,
            areaX2: r.x2,
            areaY2: r.y2,
            no: pinNo,
            groupNo: pinNo,
            category,
            defectType: getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput')) || '',
            x: pending.x,
            y: pending.y,
            targetX: pending.targetX,
            targetY: pending.targetY,
            forceArrowDir,
            arrowOctant
        });
            return;
        }

        const pending = window._pendingPinCoords;
        if (!pending) return;
        drawPin(ctx, {
            no: pinNo,
            groupNo: pinNo,
            category,
            defectType: getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput')) || '',
            x: pending.x,
            y: pending.y,
            targetX: pending.targetX,
            targetY: pending.targetY,
            forceArrowDir,
            arrowOctant
        });
    }

    let startMouseX = 0;
    let startMouseY = 0;
    let initialOffsetX = 0;
    let initialOffsetY = 0;

    function getTouchDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.hypot(dx, dy);
    }

    function getTouchMidpoint(t1, t2, canvasRect) {
        return {
            x: (t1.clientX + t2.clientX) / 2 - canvasRect.left,
            y: (t1.clientY + t2.clientY) / 2 - canvasRect.top
        };
    }


    function findHitPinPart(imgX, imgY) {
        // 2026-10-16 숨긴(부재 종류·필터로 끈) 마킹은 터치·클릭·커서·균열모니터 판정에서 빠진다 — 그리는 목록과 같게
        const defects = getCurrentFloorMapPlacedDefects();
        const ptrKindHit = getMapPointerKind();
        // 2026-10-20 고른 마킹이 먼저: 그 화살표 끝·NO.박스·지시선 근처를 누르면 옆 마킹·박스가 아니라 고른 마킹을 잡는다
        // (2026-10-27 터치·펜은 고른 마킹 몸체/점 중심 바로 위일 때만, 그 밖에는 가장 가까운 마킹 — claimSelectedPinPart)
        const claimed = claimSelectedPinPart(imgX, imgY, defects);
        if (claimed) return claimed;
        // 터치/조밀 배치: 화살표(TIP)가 박스 안·근처에 있어도 TIP을 잡을 수 있게
        // 박스 즉시 return 하지 않고, TIP·BOX 후보를 모은 뒤 TIP을 우선한다.
        let bestTip = null; // { defect, dist, tipR }
        let bestBox = null; // { defect } — NO.박스만
        // 2026-10-21 영역 안쪽·외곽선 이동(AREA_MOVE)은 따로 — 위에 그린 영역이 아래 마킹의 NO.박스를 가리지 않게
        let bestArea = null;

        for (let i = defects.length - 1; i >= 0; i--) {
            const d = defects[i];
            const dSize = getStyleSize(getDefectStyleKey(d.category, d.defectType));
            const scale = dSize.pin;
            const arrowScale = dSize.arrow;
            const tipR = getMapTipHitRadius(arrowScale, activePointerIsTouch, ptrKindHit);

            if (d.shapeType === 'area' && d.areaX1 !== undefined) {
                ensureAreaPinPlacement(d);
                const pad = 10;
                const aabb = getAreaAabb(d);
                const minXField = d.areaX1 <= d.areaX2 ? 'areaX1' : 'areaX2';
                const maxXField = d.areaX1 <= d.areaX2 ? 'areaX2' : 'areaX1';
                const minYField = d.areaY1 <= d.areaY2 ? 'areaY1' : 'areaY2';
                const maxYField = d.areaY1 <= d.areaY2 ? 'areaY2' : 'areaY1';

                if (areaShapeSupportsRotation(d)) {
                    const rotHandle = getAreaRotateHandle(d);
                    if (Math.hypot(imgX - rotHandle.x, imgY - rotHandle.y) <= 14) {
                        return { defect: d, part: 'AREA_ROTATE' };
                    }
                }

                // 안쪽(살짝 inset)=이동, 테두리·바깥 밴드=리사이즈
                // 좁은 영역에서도 내부 클릭이 코너/엣지 히트에 먹히지 않게 한다.
                const insideForMove = isPointInAreaMark(d, imgX, imgY, -2);

                // 다각형: 꼭짓점 핸들 (AABB 모서리 리사이즈 대신)
                const polyKindHit = getAreaShape(d);
                if (isPolyPointAreaShape(polyKindHit)) {
                    const pts = getAreaPolyPoints(d);
                    const segCountHit = polyKindHit === 'polyline' ? pts.length - 1 : pts.length;
                    const vertR = 14;
                    for (let vi = 0; vi < pts.length; vi++) {
                        if (Math.hypot(imgX - pts[vi].x, imgY - pts[vi].y) <= vertR) {
                            return { defect: d, part: 'AREA_VERTEX', vertexIndex: vi };
                        }
                    }
                    if (!insideForMove) {
                        const edgeTol = 10;
                        for (let ei = 0; ei < segCountHit; ei++) {
                            const a = pts[ei];
                            const b = pts[(ei + 1) % pts.length];
                            if (distPointToSegment(imgX, imgY, a.x, a.y, b.x, b.y) <= edgeTol) {
                                // 외곽선 근처(바깥/테두리) — 이동은 내부에서만
                                if (!bestArea) bestArea = { defect: d, part: 'AREA_MOVE' };
                                break;
                            }
                        }
                    }
                } else if (!insideForMove) {
                    const cornerR = 14;
                    const hw = aabb.w / 2;
                    const hh = aabb.h / 2;
                    const cornerDefs = [
                        { lx: -hw, ly: -hh, xField: minXField, yField: minYField },
                        { lx: hw, ly: -hh, xField: maxXField, yField: minYField },
                        { lx: -hw, ly: hh, xField: minXField, yField: maxYField },
                        { lx: hw, ly: hh, xField: maxXField, yField: maxYField }
                    ];
                    for (let ci = 0; ci < cornerDefs.length; ci++) {
                        const cdef = cornerDefs[ci];
                        const c = areaLocalToImg(d, cdef.lx, cdef.ly);
                        if (Math.hypot(imgX - c.x, imgY - c.y) <= cornerR) {
                            return { defect: d, part: 'AREA_RESIZE', resizeXField: cdef.xField, resizeYField: cdef.yField };
                        }
                    }

                    // 외곽선 바깥(또는 선 위) 밴드만 리사이즈 — 안쪽은 위에서 이동으로 처리
                    const edgeTol = 12;
                    const loc = areaImgToLocal(d, imgX, imgY);
                    const onTop = loc.y <= -hh + 1 && loc.y >= -hh - edgeTol;
                    const onBot = loc.y >= hh - 1 && loc.y <= hh + edgeTol;
                    const onLeft = loc.x <= -hw + 1 && loc.x >= -hw - edgeTol;
                    const onRight = loc.x >= hw - 1 && loc.x <= hw + edgeTol;
                    const alongX = loc.x >= -hw - edgeTol && loc.x <= hw + edgeTol;
                    const alongY = loc.y >= -hh - edgeTol && loc.y <= hh + edgeTol;
                    if (onTop && alongX && loc.x >= -hw + cornerR && loc.x <= hw - cornerR) {
                        return { defect: d, part: 'AREA_RESIZE', resizeXField: null, resizeYField: minYField };
                    }
                    if (onBot && alongX && loc.x >= -hw + cornerR && loc.x <= hw - cornerR) {
                        return { defect: d, part: 'AREA_RESIZE', resizeXField: null, resizeYField: maxYField };
                    }
                    if (onLeft && alongY && loc.y >= -hh + cornerR && loc.y <= hh - cornerR) {
                        return { defect: d, part: 'AREA_RESIZE', resizeXField: minXField, resizeYField: null };
                    }
                    if (onRight && alongY && loc.y >= -hh + cornerR && loc.y <= hh - cornerR) {
                        return { defect: d, part: 'AREA_RESIZE', resizeXField: maxXField, resizeYField: null };
                    }
                }

                const pinStyleKey = getDefectStyleKey(d.category, d.defectType);
                const boxDim = getPinBoxDimensions(scale, formatPinNumberLabel(d.groupNo || d.no || 'NO.01', pinStyleKey, true), state.ctx);
                const bx = d.x || 100;
                const by = d.y || 100;
                if (d.targetX !== undefined && d.targetY !== undefined) {
                    const tipHit = getMapArrowTipHitCenter(d.targetX, d.targetY, bx, by, arrowScale);
                    const distTip = Math.hypot(imgX - tipHit.x, imgY - tipHit.y);
                    if (distTip <= tipR && (!bestTip || distTip < bestTip.dist)) {
                        bestTip = { defect: d, dist: distTip, tipR };
                    }
                }
                if (!bestBox && isPointInsideMarkBox(imgX, imgY, bx, by, boxDim.w, boxDim.h, state.rotationAngle || 0)) {
                    bestBox = { defect: d, part: 'BOX' };
                }

                if (insideForMove && !bestArea) {
                    bestArea = { defect: d, part: 'AREA_MOVE' };
                }
                continue;
            }

            const bx = d.x || 100;
            const by = d.y || 100;
            const pinStyleKey = getDefectStyleKey(d.category, d.defectType);
            const boxDim = getPinBoxDimensions(scale, formatPinNumberLabel(d.groupNo || d.no || 'NO.01', pinStyleKey, true), state.ctx);

            if (d.targetX !== undefined && d.targetY !== undefined) {
                const tipHit = getMapArrowTipHitCenter(d.targetX, d.targetY, bx, by, arrowScale);
                const distTip = Math.hypot(imgX - tipHit.x, imgY - tipHit.y);
                if (distTip <= tipR && (!bestTip || distTip < bestTip.dist)) {
                    bestTip = { defect: d, dist: distTip, tipR };
                }
            }
            if (!bestBox && isPointInsideMarkBox(imgX, imgY, bx, by, boxDim.w, boxDim.h, state.rotationAngle || 0)) {
                bestBox = { defect: d, part: 'BOX' };
            }
        }

        // 2026-10-19 「마킹이랑 네모박스랑 너무 가까우면 … 네모 박스가 먼저 드래그로 옮길 수 있게」:
        // 누른 곳이 NO.박스 안이면 박스가 먼저(화살표 끝은 박스 밖으로 나온 부분으로 잡는다).
        // 영역 안쪽(AREA_MOVE)·외곽선 근처에서는 예전처럼 화살표 끝(TIP)이 우선.
        // 2026-10-21 PC·터치 같음: 다른 마킹의 화살표 끝이 박스 위에 있어도, 위에 그린 영역이 덮고 있어도 NO.박스 먼저
        if (bestBox) return { defect: bestBox.defect, part: 'BOX' };
        // 화살표 반경 안이면 영역 이동보다 TIP 우선 (근처 영역에 드래그가 뺏기던 문제 해결)
        if (bestTip) return { defect: bestTip.defect, part: 'TIP' };
        if (bestArea) return { defect: bestArea.defect, part: 'AREA_MOVE' };
        return null;
    }

    /** 지금 도면을 누른 도구 종류: 'mouse' | 'pen' | 'touch' */
    function getMapPointerKind() {
        if (mapLastPointerType === 'pen') return 'pen';
        if (activePointerIsTouch || mapLastPointerType === 'touch') return 'touch';
        return 'mouse';
    }

    /** 고른 마킹의 우선 판정 여분(화면 px) — 마우스 14(예전 그대로) ≤ 펜 16 ≤ 손가락 18 */
    const SELECTED_CLAIM_PAD_CSS = { mouse: 14, pen: 16, touch: 18 };

    /**
     * 고른 마킹의 우선 판정 범위 안이면 { defect, part }.
     * 마우스: 화면 14px 여분 + 화살촉 반경 안이면 항상 고른 마킹(2026-10-20, 그대로).
     * 터치·펜(2026-10-27): 고른 마킹의 몸체(NO.박스 안·화살촉 실제 크기+여분) 바로 위일 때만 우선하고,
     *   누른 곳에서 더 가까운 다른 마킹(박스·화살촉)이 있으면 우선을 포기해 그 마킹이 눌리게 한다
     *   (넓은 손가락 반경이 이웃 마킹 탭을 삼키던 문제).
     */
    function claimSelectedPinPart(imgX, imgY, defects) {
        const SH = window.BSA && window.BSA.selectedHit;
        if (!SH || typeof selectedDefectIds === 'undefined' || !selectedDefectIds || !selectedDefectIds.size) return null;
        const kind = getMapPointerKind();
        const fine = kind !== 'mouse';
        const viewScale = Math.max(getMapCanvasViewScale() || 1, 0.02);
        const pad = (SELECTED_CLAIM_PAD_CSS[kind] || 14) / viewScale;
        const byId = new Map();
        const cands = [];
        let nearestOther = Infinity;
        (defects || []).forEach((d) => {
            if (!d) return;
            const isSel = selectedDefectIds.has(d.id);
            const dSize = getStyleSize(getDefectStyleKey(d.category, d.defectType));
            const bx = d.x || 100;
            const by = d.y || 100;
            const hasTip = d.targetX !== undefined && d.targetY !== undefined;
            const isAreaD = d.shapeType === 'area' && d.areaX1 !== undefined;
            if (!isSel) {
                if (!fine) return;
                // 터치·펜: 이웃 마킹이 누른 곳에서 얼마나 가까운지(박스는 안이면 0, 화살촉은 중심까지 거리)
                const boxDimO = getPinBoxDimensions(dSize.pin, formatPinNumberLabel(d.groupNo || d.no || 'NO.01', getDefectStyleKey(d.category, d.defectType), true), state.ctx);
                const bd = SH.boxDist(imgX, imgY, { cx: bx, cy: by, w: boxDimO.w, h: boxDimO.h, rot: state.rotationAngle || 0 });
                const otherR = getMapTipHitRadius(dSize.arrow, true, kind);
                if (bd <= otherR) nearestOther = Math.min(nearestOther, bd);
                if (hasTip) {
                    const tipO = getMapArrowTipHitCenter(d.targetX, d.targetY, bx, by, dSize.arrow);
                    const td = Math.hypot(imgX - tipO.x, imgY - tipO.y);
                    if (td <= otherR) nearestOther = Math.min(nearestOther, td);
                }
                if (isAreaD && isPointInAreaMark(d, imgX, imgY, -2)) nearestOther = Math.min(nearestOther, 0);
                return;
            }
            // 영역은 꼭짓점·변 손잡이가 있으니, 영역 둘레 근처면 예전 판정에 맡긴다
            if (isAreaD && isPointInAreaMark(d, imgX, imgY, 16)) return;
            const boxDim = getPinBoxDimensions(dSize.pin, formatPinNumberLabel(d.groupNo || d.no || 'NO.01', getDefectStyleKey(d.category, d.defectType), true), state.ctx);
            const tip = hasTip ? getMapArrowTipHitCenter(d.targetX, d.targetY, bx, by, dSize.arrow) : null;
            byId.set(d.id, d);
            cands.push({
                id: d.id,
                tip,
                // 터치·펜은 넓은 손가락 반경 대신 화살촉 실제 크기만(넓은 탭 판정은 가까운 순 선택에 맡김)
                tipR: fine ? getMapTipHitRadius(dSize.arrow, false, 'mouse') : getMapTipHitRadius(dSize.arrow, activePointerIsTouch),
                box: { cx: bx, cy: by, w: boxDim.w, h: boxDim.h, rot: state.rotationAngle || 0 },
                leader: hasTip ? { x1: bx, y1: by, x2: d.targetX, y2: d.targetY } : null
            });
        });
        const r = SH.claimSelected(imgX, imgY, cands, pad);
        if (r && fine && nearestOther < r.dist) return null; // 더 가까운 다른 마킹이 있으면 그 마킹이 눌리게
        return r ? { defect: byId.get(r.id), part: r.part } : null;
    }

    /** 히트 결과에 맞는 CSS 커서 (이동=4방향, 변=상하/좌우, 꼭짓점=대각선) */
    function getCursorForHitInfo(hit) {
        if (!hit) return null;
        if (hit.part === 'AREA_RESIZE') {
            const d = hit.defect;
            const rx = hit.resizeXField;
            const ry = hit.resizeYField;
            if (rx && ry && d) {
                const minXField = d.areaX1 <= d.areaX2 ? 'areaX1' : 'areaX2';
                const minYField = d.areaY1 <= d.areaY2 ? 'areaY1' : 'areaY2';
                const isMinX = rx === minXField;
                const isMinY = ry === minYField;
                return (isMinX === isMinY) ? 'nwse-resize' : 'nesw-resize';
            }
            if (ry && !rx) return 'ns-resize';
            if (rx && !ry) return 'ew-resize';
            return 'nwse-resize';
        }
        if (hit.part === 'AREA_VERTEX') return 'move';
        if (hit.part === 'AREA_ROTATE') return 'grab';
        // BOX / TIP / AREA_MOVE — 드래그로 위치 이동
        return 'move';
    }

    function updateMapHoverCursor(clientX, clientY) {
        if (!elements.planCanvas) return;
        if (state.mode === 'MARK' || state.mode === 'AREA') {
            elements.planCanvas.style.cursor = 'crosshair';
            return;
        }
        if (isDragging || isMarkingDrag || isAreaDrag || isDraggingPin || isDraggingPinGroup
            || isDraggingLegend || isResizingLegend || isMarqueeSelecting || isPinching) {
            return;
        }
        const coords = clientToImgCoords(clientX, clientY);
        const legendHit = hitTestLegendBox(coords.x, coords.y);
        if (legendHit && legendHit.part === 'handle') {
            elements.planCanvas.style.cursor = legendHit.cursor || 'nwse-resize';
            return;
        }
        if (legendHit && legendHit.part === 'body') {
            elements.planCanvas.style.cursor = 'move';
            return;
        }
        const hit = findHitPinPart(coords.x, coords.y);
        elements.planCanvas.style.cursor = getCursorForHitInfo(hit) || getMapCanvasCursor();
    }

    function clearPendingDragLongPress() {
        if (pendingDragLongPressTimer) {
            clearTimeout(pendingDragLongPressTimer);
            pendingDragLongPressTimer = null;
        }
        pendingDragArmed = false;
    }

    function ensureTouchLoupe(host, loupeId) {
        if (!host) return null;
        let el = document.getElementById(loupeId);
        if (!el) {
            el = document.createElement('canvas');
            el.id = loupeId;
            el.className = 'touch-loupe';
            el.width = TOUCH_LOUPE_SIZE;
            el.height = TOUCH_LOUPE_SIZE;
            el.setAttribute('aria-hidden', 'true');
            host.appendChild(el);
        } else if (el.parentElement !== host) {
            host.appendChild(el);
        }
        return el;
    }

    function hideTouchLoupe(loupeId) {
        const el = document.getElementById(loupeId);
        if (!el) return;
        el.classList.remove('is-visible', 'is-fixed');
        el.hidden = true;
    }

    function updateTouchLoupe(sourceCanvas, container, clientX, clientY, loupeId) {
        if (!sourceCanvas || !container) return;
        const canvasRect = sourceCanvas.getBoundingClientRect();
        // CSS→백버퍼 비율 (HiDPI 반영). ZOOM=1이면 손가락 아래를 1:1로 옮겨 표시
        const scaleX = sourceCanvas.width / Math.max(canvasRect.width, 1);
        const scaleY = sourceCanvas.height / Math.max(canvasRect.height, 1);
        const srcW = (TOUCH_LOUPE_SIZE / TOUCH_LOUPE_ZOOM) * scaleX;
        const srcH = (TOUCH_LOUPE_SIZE / TOUCH_LOUPE_ZOOM) * scaleY;
        const localX = clientX - canvasRect.left;
        const localY = clientY - canvasRect.top;
        const srcX = localX * scaleX - srcW / 2;
        const srcY = localY * scaleY - srcH / 2;

        const gap = 32;
        // 항상 body fixed — 제스처 중 부모를 바꾸면( WebView touchcancel ) 드래그가 끊김
        const loupe = ensureTouchLoupe(document.body, loupeId);
        if (!loupe) return;

        const lctx = loupe.getContext('2d');
        lctx.save();
        lctx.clearRect(0, 0, TOUCH_LOUPE_SIZE, TOUCH_LOUPE_SIZE);
        lctx.beginPath();
        lctx.arc(TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
        lctx.clip();
        try {
            lctx.drawImage(sourceCanvas, srcX, srcY, srcW, srcH, 0, 0, TOUCH_LOUPE_SIZE, TOUCH_LOUPE_SIZE);
        } catch (_e) { /* ignore */ }
        lctx.strokeStyle = 'rgba(37, 99, 235, 0.95)';
        lctx.lineWidth = 1.5;
        lctx.beginPath();
        lctx.moveTo(TOUCH_LOUPE_SIZE / 2, 10);
        lctx.lineTo(TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE - 10);
        lctx.moveTo(10, TOUCH_LOUPE_SIZE / 2);
        lctx.lineTo(TOUCH_LOUPE_SIZE - 10, TOUCH_LOUPE_SIZE / 2);
        lctx.stroke();
        lctx.beginPath();
        lctx.arc(TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE / 2, 5, 0, Math.PI * 2);
        lctx.stroke();
        lctx.restore();
        lctx.beginPath();
        lctx.arc(TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE / 2, TOUCH_LOUPE_SIZE / 2 - 1.5, 0, Math.PI * 2);
        lctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
        lctx.lineWidth = 3;
        lctx.stroke();
        lctx.strokeStyle = '#fff';
        lctx.lineWidth = 1.5;
        lctx.stroke();

        let left = clientX - TOUCH_LOUPE_SIZE / 2;
        let top = clientY - TOUCH_LOUPE_SIZE - gap;
        left = Math.max(6, Math.min(left, window.innerWidth - TOUCH_LOUPE_SIZE - 6));
        top = Math.max(6, Math.min(top, window.innerHeight - TOUCH_LOUPE_SIZE - 6));
        loupe.classList.add('is-fixed');
        loupe.style.left = Math.round(left) + 'px';
        loupe.style.top = Math.round(top) + 'px';
        loupe.hidden = false;
        loupe.classList.add('is-visible');
    }

    function refreshMapLoupe(clientX, clientY) {
        const dragArmedLoupe = pendingDragArmed && pendingDragHit && pendingDragIsTouch;
        if (!activePointerIsTouch || !(isDraggingPin || isDraggingPinGroup || isMarkingDrag || isAreaDrag || dragArmedLoupe)) {
            hideTouchLoupe(MAP_LOUPE_ID);
            _mapLoupePending = null;
            if (_mapLoupeRaf) {
                cancelAnimationFrame(_mapLoupeRaf);
                _mapLoupeRaf = 0;
            }
            return;
        }
        // 매 touchmove마다 drawImage 하면 태블릿에서 끊김 → rAF로 합침
        _mapLoupePending = { clientX, clientY };
        if (_mapLoupeRaf) return;
        _mapLoupeRaf = requestAnimationFrame(() => {
            _mapLoupeRaf = 0;
            const p = _mapLoupePending;
            _mapLoupePending = null;
            if (!p) return;
            if (!activePointerIsTouch || !(isDraggingPin || isDraggingPinGroup || isMarkingDrag || isAreaDrag
                || (pendingDragArmed && pendingDragHit && pendingDragIsTouch))) {
                hideTouchLoupe(MAP_LOUPE_ID);
                return;
            }
            updateTouchLoupe(elements.planCanvas, document.getElementById('canvasContainer'), p.clientX, p.clientY, MAP_LOUPE_ID);
        });
    }

    function refreshNdtLoupe(clientX, clientY) {
        const ndtDragArmedLoupe = pendingNdtPinArmed && pendingNdtPinHit && pendingNdtPinIsTouch;
        if (!ndtActivePointerIsTouch || !(isDraggingNdtPin || isDraggingNdtPinGroup || isNdtMarkingDrag || isNdtDisplacementMarking || ndtDragArmedLoupe)) {
            hideTouchLoupe(NDT_LOUPE_ID);
            return;
        }
        const canvas = document.getElementById('ndtCanvas');
        updateTouchLoupe(canvas, document.getElementById('ndtCanvasContainer'), clientX, clientY, NDT_LOUPE_ID);
    }


    function handleDragStart(clientX, clientY, isTouch = false, forcePan = false, mods = {}) {
        if (!elements.planCanvas) return;
        const additive = !!(mods.ctrlKey || mods.metaKey);
        activePointerIsTouch = !!isTouch;
        emptyTapPending = null;
        clearPendingDragLongPress();
        pendingDragOpenedModal = false;
        hideTouchLoupe(MAP_LOUPE_ID);
        if (typeof cancelCanvasPanAnimation === 'function') cancelCanvasPanAnimation();

        // 중간 클릭(휠 클릭): MARK/AREA 모드에서도 도면 PAN 이동
        if (forcePan) {
            startMouseX = clientX;
            startMouseY = clientY;
            initialOffsetX = state.view.offsetX;
            initialOffsetY = state.view.offsetY;
            isDragging = true;
            isMarkingDrag = false;
            markingHasMoved = false;
            isAreaDrag = false;
            pendingDragHit = null;
            if (elements.planCanvas) elements.planCanvas.style.cursor = 'grabbing';
            return;
        }

        const rect = elements.planCanvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const vx = (mouseX - state.view.offsetX) / state.view.scale;
        const vy = (mouseY - state.view.offsetY) / state.view.scale;
        const coords = viewToImgCoords(vx, vy);
        const imgX = coords.x;
        const imgY = coords.y;

        // 범례 박스는 결함 핀과 동일한 도면 이미지 좌표계에 붙어있으므로, 핀 히트테스트와 같은
        // imgX/imgY(팬/줌/회전 역변환 좌표)로 판정한다 — 핀 히트테스트보다 우선.
        const legendHit = hitTestLegendBox(imgX, imgY);
        if (legendHit && !isAreaPolygonRedrawActive() && legendHit.part === 'handle') {
            isResizingLegend = true;
            legendResizeStartScale = getLocationMapLegendScale(state.locationMapLegendBox);
            legendResizeStartDist = Math.hypot(imgX - lastLegendBoxBounds.x, imgY - lastLegendBoxBounds.y) || 1;
            elements.planCanvas.style.cursor = legendHit.cursor || 'nwse-resize';
            return;
        }
        if (legendHit && !isAreaPolygonRedrawActive() && legendHit.part === 'body') {
            isDraggingLegend = true;
            legendDragOffsetX = imgX - lastLegendBoxBounds.x;
            legendDragOffsetY = imgY - lastLegendBoxBounds.y;
            elements.planCanvas.style.cursor = 'move';
            return;
        }

        startMouseX = clientX;
        startMouseY = clientY;
        initialOffsetX = state.view.offsetX;
        initialOffsetY = state.view.offsetY;

        // Check if existing pin box, arrowhead tip, or area handle was clicked.
        // 터치: 즉시 선택만 하고, 약 0.3초 길게 누른 뒤에야 드래그 시작.
        const hitInfoRaw = findHitPinPart(imgX, imgY);
        let hitInfo = hitInfoRaw;
        // 점(다각형·선)을 이어 찍는 중에는 이미 있는 마킹 위를 눌러도 선택하지 않고 점으로 찍는다
        if (hitInfo && pendingAreaPoly && pendingAreaPoly.length && getActivePolyCreateShape()) hitInfo = null;
        // 공유 NO.박스 클릭: 처음 41-1(대표), 다시 누르면 41-2 … 순환.
        // 영역 안쪽(AREA_MOVE)은 그 영역의 마킹 자체를 고른다(통합 마킹은 영역이 원래 자리에 따로 있다)
        // 2026-10-16 새 규칙: 선택된 통합 마킹을 다시 누르면 수정창. 순환은 수정창이 이미 열려 있을 때만
        // (= 기존처럼 수정창 연 채로 NO.박스를 다시 누르면 다음 화살표로 넘어감).
        let groupSelectedMember = null;
        let groupCycledInOpenModal = false;
        const groupCyclePrev = window._groupBoxCycle ? { ...window._groupBoxCycle } : window._groupBoxCycle;
        if (hitInfo && hitInfo.defect && hitInfo.defect.groupId && !additive && !(isTouch && mobileAddSelectEnabled)) {
            const gid0 = hitInfo.defect.groupId;
            groupSelectedMember = getCurrentFloorMapPlacedDefects().find((m) => m && m.groupId === gid0 && selectedDefectIds.has(m.id)) || null;
        }
        if (groupSelectedMember && !isDefectModalOpen() && (hitInfo.part === 'BOX' || hitInfo.defect.id === groupSelectedMember.id || selectedDefectIds.size > 1)) {
            if (hitInfo.part === 'BOX') hitInfo = { ...hitInfo, defect: groupSelectedMember };
            window._groupBoxCycle = { groupId: groupSelectedMember.groupId, lastId: hitInfo.defect.id };
        } else if (hitInfo && hitInfo.part === 'BOX' && hitInfo.defect && hitInfo.defect.groupId) {
            groupCycledInOpenModal = !!(groupSelectedMember && isDefectModalOpen());
            const cycled = cycleMarkingGroupMemberOnBoxClick(hitInfo.defect);
            if (cycled) {
                hitInfo = { ...hitInfo, defect: cycled };
            }
        } else if (hitInfo && (hitInfo.part === 'TIP' || hitInfo.part === 'AREA_MOVE') && hitInfo.defect && hitInfo.defect.groupId) {
            window._groupBoxCycle = { groupId: hitInfo.defect.groupId, lastId: hitInfo.defect.id };
        }
        if (hitInfo && state.areaInkTool && hitInfo.defect && hitInfo.defect.shapeType === 'area'
            && (hitInfo.part === 'AREA_MOVE' || hitInfo.part === 'BOX')
            && !isAreaPolygonRedrawActive()) {
            selectedDefectIds = new Set([hitInfo.defect.id]);
            updateMapSelectionBar({ scrollToSelection: true });
            const tool = state.areaInkTool;
            const target = hitInfo.defect;
            if (tool === 'polygon') {
                if (!pendingInkPoly || pendingInkPoly.defectId !== target.id) {
                    pendingInkPoly = { defectId: target.id, points: [] };
                }
                const pts = pendingInkPoly.points;
                if (pts.length >= 3 && Math.hypot(imgX - pts[0].x, imgY - pts[0].y) < 14) {
                    if (typeof pushDefectHistory === 'function') pushDefectHistory();
                    if (!Array.isArray(target.areaDrawings)) target.areaDrawings = [];
                    target.areaDrawings.push({ type: 'polygon', points: pts.map((p) => ({ x: p.x, y: p.y })) });
                    pendingInkPoly = null;
                    saveStateToLocalStorage();
                } else {
                    pts.push({ x: imgX, y: imgY });
                }
                drawCanvas();
                return;
            }
            isAreaInkDrag = true;
            areaInkStroke = { defectId: target.id, type: tool, points: [{ x: imgX, y: imgY }] };
            drawCanvas();
            return;
        }
        if (hitInfo && !isAreaPolygonRedrawActive()) {
            const useAdditive = additive || (isTouch && mobileAddSelectEnabled);
            pendingDragHit = { hitInfo, imgX, imgY, additive: useAdditive };
            pendingDragIsTouch = isTouch;
            pendingDragHitStartTime = Date.now();
            // 2026-10-16 PC·터치 공통: 선택 안 된 마킹은 누르면 선택만, 끌면 도면 이동.
            // 이미 선택된 마킹은 0.3초 꾹 누른 뒤에만 끌어서 이동, 그냥 떼면 수정창.
            pendingDragArmed = false;
            if (hitInfo.defect && hitInfo.defect.id) {
                const id = hitInfo.defect.id;
                const wasInSelection = selectedDefectIds.has(id);
                pendingDragHit.wasSelectedBefore = wasInSelection || groupCycledInOpenModal;
                // 2026-10-16 선택은 누를 때가 아니라 「움직이지 않은 짧은 탭」으로 뗄 때 확정(handleDragEnd).
                // 마킹 위에서 시작해 도면을 끌거나 핀치하면 선택이 바뀌지 않는다.
                pendingDragHit.wasInSelection = wasInSelection;
                pendingDragHit.groupCyclePrev = groupCyclePrev;
            }
            if (pendingDragHit.wasSelectedBefore) {
                pendingDragLongPressTimer = setTimeout(() => {
                    pendingDragLongPressTimer = null;
                    if (!pendingDragHit || isDraggingPin || isDragging) return;
                    const hd = pendingDragHit.hitInfo && pendingDragHit.hitInfo.defect;
                    if (!hd || !selectedDefectIds.has(hd.id)) return;
                    pendingDragArmed = true;
                    try { if (navigator.vibrate) navigator.vibrate(20); } catch (_e) { /* ignore */ }
                    if (elements.planCanvas) elements.planCanvas.style.cursor = 'grabbing';
                    drawCanvas();
                    if (pendingDragIsTouch) refreshMapLoupe(startMouseX, startMouseY);
                }, MARKING_HOLD_TO_DRAG_MS);
            }
            // 2026-10-16 「pc는 드래그도 바로 해도됨. 어차피 중앙 휠로 도면 이동」: 마우스 왼쪽 버튼은
            // 선택 여부·0.3초 대기 없이 끌면 바로 이동(도면 이동은 가운데 휠 드래그). 터치·펜은 그대로.
            if (!isTouch && mapLastPointerType === 'mouse' && hitInfo.defect && hitInfo.defect.id) {
                clearPendingDragLongPress();
                pendingDragArmed = true;
                pendingDragHit.pcMouseInstantDrag = true;
            }
            return;
        }

        // 도면 빈곳 터치/클릭 → 입력창 닫기 + (선택 모드면) 선택 해제
        // 2026-10-19 「도면 드래그하면 마킹이 1회 클릭 했던게 사라져서」: 터치(마킹·영역 그리기 모드 아님)는
        // 누를 때가 아니라 움직이지 않고 뗄 때(탭)만 닫기·해제. 끌어서 도면 이동하면 선택·수정창 그대로.
        if (isTouch && state.mode !== 'MARK' && state.mode !== 'AREA') {
            const closeOnTap = isDefectModalOpen() && !isDefectMarkingGroupPending();
            const clearOnTap = state.mode === 'PAN' && !additive && !mobileAddSelectEnabled && selectedDefectIds.size > 0;
            if (closeOnTap || clearOnTap) emptyTapPending = { closeModal: closeOnTap, clearSel: clearOnTap, moved: false };
        } else if (isDefectModalOpen() && !isDefectMarkingGroupPending()) {
            closeDefectModal();
        }
        if (!isTouch && state.mode === 'PAN' && !additive && !mobileAddSelectEnabled && selectedDefectIds.size > 0) {
            selectedDefectIds.clear();
            updateMapSelectionBar();
            drawCanvas();
            if (!isTouch) {
                // 마우스: 빈곳 클릭은 선택 해제만 (마퀴는 드래그로)
                return;
            }
        }

        if (state.mode === 'MARK' && !getMarkPolyShape()) {
            isMarkingDrag = true;
            markingHasMoved = false;
            const rawMarkCoords = clientToImgCoords(clientX, clientY);
            const markCoords = snapImgCoordsForMarking(rawMarkCoords.x, rawMarkCoords.y);
            syncLiveMarkBoxAboveTarget(markCoords.x, markCoords.y);
            drawCanvas();
        } else if (state.mode === 'AREA' || state.mode === 'MARK') {
            // 마킹 모드에서 다각형·선을 고른 경우도 영역 마킹과 같은 길(번호 박스와 함께 생성)
            const createShape = state.mode === 'MARK' ? (getMarkPolyShape() || 'rect') : (state.areaCreateShape || 'rect');
            const areaCoords = clientToImgCoords(clientX, clientY);
            if (isPolyPointAreaShape(createShape) && isTouch) {
                // 터치: 점은 손을 뗄 때(handleDragEnd → commitTouchPolygonTap). 끌면 도면 이동.
                touchPolyTap = { clientX, clientY, x: areaCoords.x, y: areaCoords.y, downAt: Date.now(), maxMove: 0, multi: false };
                startMouseX = clientX;
                startMouseY = clientY;
                initialOffsetX = state.view.offsetX;
                initialOffsetY = state.view.offsetY;
                isDragging = true;
                return;
            }
            if (isPolyPointAreaShape(createShape)) {
                if (!pendingAreaPoly) pendingAreaPoly = [];
                if (createShape === 'polygon' && pendingAreaPoly.length >= 3
                    && Math.hypot(areaCoords.x - pendingAreaPoly[0].x, areaCoords.y - pendingAreaPoly[0].y) < 16) {
                    finishPendingAreaPolygon();
                    return;
                }
                addPendingPolyPoint(areaCoords.x, areaCoords.y);
                return;
            }
            isAreaDrag = true;
            areaStartImgX = areaCoords.x;
            areaStartImgY = areaCoords.y;
            areaCurImgX = areaCoords.x;
            areaCurImgY = areaCoords.y;
            drawCanvas();
        } else if (isTouch) {
            if (mobileMarqueeSelectEnabled && state.mode === 'PAN') {
                isMarqueeSelecting = true;
                marqueeAdditive = additive || mobileAddSelectEnabled;
                marqueeStartImgX = imgX;
                marqueeStartImgY = imgY;
                marqueeCurImgX = imgX;
                marqueeCurImgY = imgY;
                if (elements.planCanvas) elements.planCanvas.style.cursor = 'crosshair';
                drawCanvas();
            } else {
                // 터치(태블릿): 한 손가락으로 도면 이동
                isDragging = true;
                if (elements.planCanvas) elements.planCanvas.style.cursor = 'grabbing';
            }
        } else {
            // 마우스 좌클릭: 빈 곳 드래그 = 마퀴 선택 (Ctrl = 추가 선택, 이동은 휠클릭)
            isMarqueeSelecting = true;
            marqueeAdditive = additive;
            marqueeStartImgX = imgX;
            marqueeStartImgY = imgY;
            marqueeCurImgX = imgX;
            marqueeCurImgY = imgY;
            elements.planCanvas.style.cursor = 'crosshair';
            drawCanvas();
        }
    }

    function handleDragMove(clientX, clientY) {
        if (!elements.planCanvas) return;
        const rect = elements.planCanvas.getBoundingClientRect();
        if (emptyTapPending && !emptyTapPending.moved
            && Math.hypot(clientX - startMouseX, clientY - startMouseY) > TOUCH_DRAG_THRESHOLD) {
            emptyTapPending.moved = true;
        }

        if (isResizingLegend || isDraggingLegend) {
            const mouseX = clientX - rect.left;
            const mouseY = clientY - rect.top;
            const vx = (mouseX - state.view.offsetX) / state.view.scale;
            const vy = (mouseY - state.view.offsetY) / state.view.scale;
            const coords = viewToImgCoords(vx, vy);
            const imgX = coords.x;
            const imgY = coords.y;

            if (!state.locationMapLegendBox) state.locationMapLegendBox = {};

            if (isResizingLegend) {
                const dist = Math.hypot(imgX - lastLegendBoxBounds.x, imgY - lastLegendBoxBounds.y);
                const newScale = clampLegendScale(legendResizeStartScale * (dist / legendResizeStartDist));
                // 결함 핀과 동일한 도면 원본 픽셀 좌표로 저장 — 앵커(좌상단)는 고정
                state.locationMapLegendBox.x = lastLegendBoxBounds.x;
                state.locationMapLegendBox.y = lastLegendBoxBounds.y;
                state.locationMapLegendBox.scale = newScale;
            } else {
                state.locationMapLegendBox.x = imgX - legendDragOffsetX;
                state.locationMapLegendBox.y = imgY - legendDragOffsetY;
            }
            const legendDims = (typeof getFloorPlanDisplayDims === 'function')
                ? getFloorPlanDisplayDims()
                : { w: 0, h: 0 };
            if (_legendLayout && typeof _legendLayout.stampNormalized === 'function') {
                _legendLayout.stampNormalized(state.locationMapLegendBox, legendDims.w, legendDims.h);
            }
            drawCanvas();
            return;
        }

        if (pendingDragHit && !isDraggingPin) {
            const dx = clientX - startMouseX;
            const dy = clientY - startMouseY;
            const dist = Math.hypot(dx, dy);
            const threshold = pendingDragIsTouch ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD;

            // 모바일: 홀딩 전에 손가락이 많이 움직이면 핀/화살표 고정 해제 → 도면 팬으로 전환
            // 2026-10-16 한 번 누른 채 끌면 바로 이동(길게 누를 필요 없음). 단순 탭(문턱값 이하)은 기존처럼 선택·수정창,
            // 마킹 없는 곳에서 끌면 도면 이동. 스크롤하다 실수로 옮기지 않게 문턱값은 클릭 구분보다 조금 크게.
            // 2026-10-16 꾹 누름(0.3초) 완료 전에 움직이면 마킹은 그대로, 도면 이동으로 전환 (PC·터치 공통)
            if (!pendingDragArmed) {
                if (dist <= threshold) return;
                clearPendingDragLongPress();
                // 도면 이동으로 바뀜 → 선택 없음, 통합 마킹 순환 차례도 되돌림
                if (pendingDragHit && 'groupCyclePrev' in pendingDragHit) window._groupBoxCycle = pendingDragHit.groupCyclePrev;
                pendingDragHit = null;
                isDragging = true;
                if (elements.planCanvas) elements.planCanvas.style.cursor = 'grabbing';
                return;
            }

            // 임계값 이하: 클릭 대기. 홀딩 완료 후 터치면 돋보기만 갱신(핀은 아직 고정)
            if (pendingDragIsTouch && pendingDragArmed && dist <= threshold) {
                refreshMapLoupe(clientX, clientY);
                return;
            }
            if (dist <= threshold) return;

            if (dist > threshold) {
                pushDefectHistory();
                const hitDefect = pendingDragHit.hitInfo.defect;
                // PC 즉시 끌기: 선택 안 된 마킹을 끌면 그 마킹만 골라서 옮김(다른 선택 묶음이 같이 끌려가지 않게)
                if (pendingDragHit.pcMouseInstantDrag && hitDefect && hitDefect.id && !selectedDefectIds.has(hitDefect.id)) {
                    selectedDefectIds = new Set([hitDefect.id]);
                    updateMapSelectionBar();
                }
                const hitPart = pendingDragHit.hitInfo.part;
                // 여러 마킹 통째 이동은 「서로 다른 마킹」을 골랐을 때만.
                // 결함 통합·화살표 추가 묶음 하나만 선택된 상태(통합 직후 등)에서 NO.박스를 끌면 박스만 움직인다.
                const asnDrag = arrowSurveyNumberApi();
                const multiGroup = (asnDrag && typeof asnDrag.pinDragMode === 'function')
                    ? asnDrag.pinDragMode(pendingDragHit.hitInfo, selectedDefectIds, getCurrentFloorDefects()) === 'GROUP'
                    : (hitDefect && hitDefect.id
                        && selectedDefectIds.size > 1
                        && selectedDefectIds.has(hitDefect.id)
                        && hitPart !== 'AREA_RESIZE'
                        && hitPart !== 'AREA_ROTATE'
                        && hitPart !== 'AREA_VERTEX');
                const grabX = pendingDragHit.imgX;
                const grabY = pendingDragHit.imgY;
                clearPendingDragLongPress();

                discardStalePendingRemoteAfterLocalPinEdit();

                if (multiGroup) {
                    isDraggingPinGroup = true;
                    isDraggingPin = true;
                    activeDragPin = hitDefect;
                    activeDragPart = 'GROUP';
                    groupDragLastImgX = grabX;
                    groupDragLastImgY = grabY;
                    pendingDragHit = null;
                    if (elements.planCanvas) elements.planCanvas.style.cursor = 'move';
                } else {
                    isDraggingPin = true;
                    activeDragPin = hitDefect;
                    activeDragPart = hitPart;
                    activeResizeXField = pendingDragHit.hitInfo.resizeXField || null;
                    activeResizeYField = pendingDragHit.hitInfo.resizeYField || null;
                    activeVertexIndex = (hitPart === 'AREA_VERTEX' && Number.isInteger(pendingDragHit.hitInfo.vertexIndex))
                        ? pendingDragHit.hitInfo.vertexIndex
                        : -1;
                    if (hitPart === 'TIP') {
                        pinDragOffsetX = grabX - (hitDefect.targetX !== undefined ? hitDefect.targetX : hitDefect.x);
                        pinDragOffsetY = grabY - (hitDefect.targetY !== undefined ? hitDefect.targetY : hitDefect.y);
                    } else if (hitPart === 'BOX' || !hitPart) {
                        pinDragOffsetX = grabX - (hitDefect.x || 0);
                        pinDragOffsetY = grabY - (hitDefect.y || 0);
                    } else {
                        pinDragOffsetX = 0;
                        pinDragOffsetY = 0;
                    }
                    if (activeDragPart === 'AREA_MOVE') {
                        areaMoveLastImgX = grabX;
                        areaMoveLastImgY = grabY;
                    }
                    if (activeDragPart === 'AREA_ROTATE') {
                        beginAreaRotateSession(hitDefect, grabX, grabY);
                    }
                    pendingDragHit = null;
                    if (elements.planCanvas) {
                        elements.planCanvas.style.cursor = getCursorForHitInfo({
                            defect: hitDefect,
                            part: hitPart,
                            resizeXField: activeResizeXField,
                            resizeYField: activeResizeYField
                        }) || 'move';
                    }
                }
                document.body.classList.add('dragging-pin');
                document.body.style.touchAction = 'none';
                if (typeof cancelScheduledRevealMarkingAboveDrawer === 'function') {
                    cancelScheduledRevealMarkingAboveDrawer();
                }
                refreshMapLoupe(clientX, clientY);
            } else {
                return;
            }
        }

        if (isDraggingPinGroup) {
            const coords = clientToImgCoords(clientX, clientY);
            const dx = coords.x - groupDragLastImgX;
            const dy = coords.y - groupDragLastImgY;
            if (dx || dy) {
                getCurrentFloorMapPlacedDefects().forEach(d => {   // 숨긴 마킹은 같이 끌려가지 않음
                    if (selectedDefectIds.has(d.id)) translateDefectBy(d, dx, dy);
                });
                groupDragLastImgX = coords.x;
                groupDragLastImgY = coords.y;
                drawCanvas();
                refreshMapLoupe(clientX, clientY);
            }
        } else if (isDraggingPin && activeDragPin) {
            rebindActiveDragPinFromState();
            const coords = clientToImgCoords(clientX, clientY);
            const currentImgX = coords.x;
            const currentImgY = coords.y;

            if (activeDragPart === 'TIP') {
                if (activeDragPin.shapeType === 'area' && activeDragPin.areaX1 !== undefined) {
                    const snapped = projectPointToAreaEdgeCenterDefect(
                        currentImgX - pinDragOffsetX, currentImgY - pinDragOffsetY,
                        activeDragPin
                    );
                    activeDragPin.targetX = snapped.x;
                    activeDragPin.targetY = snapped.y;
                } else {
                    const newTipX = currentImgX - pinDragOffsetX;
                    const newTipY = currentImgY - pinDragOffsetY;
                    const prevTipX = (activeDragPin.targetX !== undefined) ? activeDragPin.targetX : newTipX;
                    const prevTipY = (activeDragPin.targetY !== undefined) ? activeDragPin.targetY : newTipY;
                    const asnTip = arrowSurveyNumberApi();
                    const tipMovesBox = (asnTip && typeof asnTip.tipDragMovesSharedBox === 'function')
                        ? asnTip.tipDragMovesSharedBox(getCurrentFloorDefects(), activeDragPin)
                        : true;
                    if (tipMovesBox) {
                        translatePinMarkingRigid(activeDragPin, newTipX - prevTipX, newTipY - prevTipY);
                    } else {
                        // 공유 번호칸 묶음: 이 결함의 화살표 끝만 — 박스·다른 화살표는 제자리
                        activeDragPin.targetX = newTipX;
                        activeDragPin.targetY = newTipY;
                    }
                }
            } else if (activeDragPart === 'AREA_MOVE') {
                const dx = currentImgX - areaMoveLastImgX;
                const dy = currentImgY - areaMoveLastImgY;
                activeDragPin.areaX1 += dx;
                activeDragPin.areaY1 += dy;
                activeDragPin.areaX2 += dx;
                activeDragPin.areaY2 += dy;
                translateAreaDrawings(activeDragPin, dx, dy);
                areaMoveLastImgX = currentImgX;
                areaMoveLastImgY = currentImgY;
            } else if (activeDragPart === 'AREA_ROTATE') {
                applyAreaRotateSession(activeDragPin, currentImgX, currentImgY);
                if (typeof activeDragPin.x === 'number' && typeof activeDragPin.y === 'number') {
                    const attachLive = getAreaCenterBorderAttachDefect(activeDragPin.x, activeDragPin.y, activeDragPin);
                    activeDragPin.targetX = attachLive.x;
                    activeDragPin.targetY = attachLive.y;
                }
                const angElLive = document.getElementById('defectAreaAngle');
                const pinIdLive = document.getElementById('defectPinId')?.value;
                if (angElLive && pinIdLive && String(pinIdLive) === String(activeDragPin.id)) {
                    let shown = Math.round(getAreaAngleDeg(activeDragPin));
                    if (isPolyPointAreaShape(getAreaShape(activeDragPin)) && areaRotatePivot) {
                        const mouse = Math.atan2(currentImgY - areaRotatePivot.cy, currentImgX - areaRotatePivot.cx);
                        let d = ((mouse - areaRotateStartMouse) * 180) / Math.PI;
                        while (d > 180) d -= 360;
                        while (d < -180) d += 360;
                        shown = Math.round(d);
                    }
                    angElLive.value = String(shown);
                }
            } else if (activeDragPart === 'AREA_VERTEX') {
                applyAreaVertexMove(activeDragPin, activeVertexIndex, currentImgX, currentImgY);
                if (typeof activeDragPin.x === 'number' && typeof activeDragPin.y === 'number') {
                    const attachLive = getAreaCenterBorderAttachDefect(activeDragPin.x, activeDragPin.y, activeDragPin);
                    activeDragPin.targetX = attachLive.x;
                    activeDragPin.targetY = attachLive.y;
                }
            } else if (activeDragPart === 'AREA_RESIZE') {
                const nextFields = applyAreaResizeLocal(
                    activeDragPin, currentImgX, currentImgY, activeResizeXField, activeResizeYField
                );
                activeResizeXField = nextFields.xField;
                activeResizeYField = nextFields.yField;
                if (typeof activeDragPin.x === 'number' && typeof activeDragPin.y === 'number') {
                    const attachLive = getAreaCenterBorderAttachDefect(activeDragPin.x, activeDragPin.y, activeDragPin);
                    activeDragPin.targetX = attachLive.x;
                    activeDragPin.targetY = attachLive.y;
                }
                if (elements.planCanvas) {
                    elements.planCanvas.style.cursor = getCursorForHitInfo({
                        defect: activeDragPin,
                        part: 'AREA_RESIZE',
                        resizeXField: activeResizeXField,
                        resizeYField: activeResizeYField
                    }) || 'nwse-resize';
                }
            } else {
                // 번호칸만 이동 — 화살표/점(target)은 고정
                const newX = currentImgX - pinDragOffsetX;
                const newY = currentImgY - pinDragOffsetY;
                activeDragPin.x = newX;
                activeDragPin.y = newY;
                syncSharedMarkingGroupBox(activeDragPin);
            }
            drawCanvas();
            refreshMapLoupe(clientX, clientY);
        } else if (isMarkingDrag) {
            markingHasMoved = true;
            const rawCoords = clientToImgCoords(clientX, clientY);
            const coords = snapImgCoordsForMarking(rawCoords.x, rawCoords.y);
            syncLiveMarkBoxAboveTarget(coords.x, coords.y);
            drawCanvas();
            refreshMapLoupe(clientX, clientY);
        } else if (isAreaInkDrag && areaInkStroke) {
            const coords = clientToImgCoords(clientX, clientY);
            const pts = areaInkStroke.points;
            if (areaInkStroke.type === 'path') {
                const last = pts[pts.length - 1];
                if (!last || Math.hypot(coords.x - last.x, coords.y - last.y) >= 2) {
                    pts.push({ x: coords.x, y: coords.y });
                }
            } else if (pts.length === 1) {
                pts.push({ x: coords.x, y: coords.y });
            } else {
                pts[1] = { x: coords.x, y: coords.y };
            }
            drawCanvas();
            refreshMapLoupe(clientX, clientY);
        } else if (isAreaDrag) {
            const coords = clientToImgCoords(clientX, clientY);
            areaCurImgX = coords.x;
            areaCurImgY = coords.y;
            drawCanvas();
            refreshMapLoupe(clientX, clientY);
        } else if (isMarqueeSelecting) {
            const coords = clientToImgCoords(clientX, clientY);
            marqueeCurImgX = coords.x;
            marqueeCurImgY = coords.y;
            drawCanvas();
        } else if (isDragging) {
            const dx = clientX - startMouseX;
            const dy = clientY - startMouseY;
            state.view.offsetX = initialOffsetX + dx;
            state.view.offsetY = initialOffsetY + dy;
            drawCanvas();
        }
    }

    function clientToImgCoords(clientX, clientY) {
        if (!elements.planCanvas) return { x: 0, y: 0 };
        const rect = elements.planCanvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const vx = (mouseX - state.view.offsetX) / state.view.scale;
        const vy = (mouseY - state.view.offsetY) / state.view.scale;
        return viewToImgCoords(vx, vy);
    }

    const SNAP_MARKING_DISABLED = true;
    const SNAP_SCREEN_RADIUS_PX = 16; // 화면상 이 반경 안에 CAD 선이 있으면 달라붙는다

    /** 결함 마킹 중일 때만, 근처 CAD 벡터 선/끝점/교차점에 좌표를 스냅한다 (없으면 원래 좌표 그대로) */
    function snapImgCoordsForMarking(x, y) {
        // 2026-11-05 결함 마킹은 CAD 선에 달라붙지 않게(사용자: 「스냅 걸려서 너무 불편」) — 찍은 자리 그대로. 통심선 스냅(gridSnap)은 그대로 둔다
        if (SNAP_MARKING_DISABLED) return { x, y, snapped: false };
        if (state.snapToCad === false && !isTouchToolbarUi()) return { x, y, snapped: false };
        if (state.mode !== 'MARK') return { x, y, snapped: false };
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        if (!bldg || !fc || !window.BSA_PDF_SNAP) return { x, y, snapped: false };
        const scale = state.view.scale || 1;
        const radius = SNAP_SCREEN_RADIUS_PX / scale;
        const hit = window.BSA_PDF_SNAP.snap(bldg.id, fc, x, y, radius);
        if (!hit) return { x, y, snapped: false };
        return { x: hit.x, y: hit.y, snapped: true, snapType: hit.type };
    }

    function handleDragEnd(clientX, clientY) {
        let hadPinDragSave = false;
        try {
        const pendingDragArmedAtEnd = pendingDragArmed;
        clearPendingDragLongPress();
        hideTouchLoupe(MAP_LOUPE_ID);
        // 터치 제스처 종료 여부 — 아래에서 클리어되기 전에 보관 (PC 전용 동작 분기)
        const endedFromTouch = !!activePointerIsTouch;
        if (endedFromTouch) mapSuppressMouseUntil = Date.now() + 700;
        activePointerIsTouch = false;
        document.body.classList.remove('dragging-pin');
        document.body.style.touchAction = '';

        if (touchPolyTap) {
            const tap = touchPolyTap;
            touchPolyTap = null;
            const moved = (clientX == null || clientY == null)
                ? 0
                : Math.hypot(clientX - tap.clientX, clientY - tap.clientY);
            tap.maxMove = Math.max(tap.maxMove || 0, moved);
            if (isCleanTouchTap(tap, Date.now())) {
                isDragging = false;
                if (elements.planCanvas) elements.planCanvas.style.cursor = getMapCanvasCursor();
                commitTouchPolygonTap(tap);
                return;
            }
            // 끌었다 → 도면 이동으로 끝(아래 isDragging 처리)
        }

        if (isResizingLegend) {
            isResizingLegend = false;
            persistCurrentBuildingLocationMapLegend();
            saveStateToLocalStorage();
            if (elements.planCanvas) {
                elements.planCanvas.style.cursor = getMapCanvasCursor();
            }
            return;
        }
        if (isDraggingLegend) {
            isDraggingLegend = false;
            persistCurrentBuildingLocationMapLegend();
            saveStateToLocalStorage();
            if (elements.planCanvas) {
                elements.planCanvas.style.cursor = getMapCanvasCursor();
            }
            return;
        }

        if (pendingDragHit && !isDraggingPin) {
            // 이동임계값을 넘지 않고 그냥 뗐음 = 클릭으로 간주
            const d = pendingDragHit.hitInfo.defect;
            const wasAdditive = !!pendingDragHit.additive;
            const wasInSelection = !!pendingDragHit.wasInSelection;
            const pendingDragWasSelectedBefore = !!pendingDragHit.wasSelectedBefore;
            const tapHit = pendingDragHit;
            // PC 즉시 끌기 대기(pcMouseInstantDrag)는 「꾹 누름」이 아님 — 안 움직이고 떼면 클릭(수정창)
            const holdArmed = pendingDragArmedAtEnd && !tapHit.pcMouseInstantDrag;
            pendingDragHit = null;
            // 2026-10-16 움직이지 않은 짧은 탭만 선택·수정창. 길게 눌렀다 뗀 것(꾹 눌러 이동 대기 포함)은 아무것도 안 함.
            const tapMoved = (clientX == null || clientY == null) ? 0 : Math.hypot(clientX - startMouseX, clientY - startMouseY);
            const tapMs = Date.now() - (pendingDragHitStartTime || 0);
            const tapThreshold = endedFromTouch ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD;
            if (holdArmed || tapMoved > tapThreshold || tapMs > MARKING_TAP_MAX_MS || !d?.id) {
                if ('groupCyclePrev' in tapHit) window._groupBoxCycle = tapHit.groupCyclePrev;
                pendingDragOpenedModal = false;
                drawCanvas();
                return;
            }
            // 선택 확정
            if (wasAdditive) {
                if (wasInSelection) selectedDefectIds.delete(d.id); else selectedDefectIds.add(d.id);
            } else if (!wasInSelection || selectedDefectIds.size <= 1) {
                selectedDefectIds = new Set([d.id]);
            }
            // Ctrl 토글 클릭이면 내용 수정 모달 열지 않음
            if (wasAdditive) {
                pendingDragOpenedModal = false;
                updateMapSelectionBar({ scrollToSelection: true });
                drawCanvas();
                return;
            }
            // PC 마우스: mousedown에서 이미 수정창을 연 경우 중복 오픈 방지
            if (pendingDragOpenedModal) {
                pendingDragOpenedModal = false;
                updateMapSelectionBar({ scrollToSelection: true });
                if (d && typeof scheduleRevealMarkingAboveDrawer === 'function') {
                    scheduleRevealMarkingAboveDrawer(d, { animate: true });
                }
                drawCanvas();
                if (d?.groupId && getDefectMarkingGroupMembers(d.groupId).length > 1) {
                    window.showToast?.(
                        `마킹 ${formatDefectMemberChipLabel(d)} 선택 · NO.박스를 다시 누르면 다음 화살표`,
                        'info',
                        2200
                    );
                }
                return;
            }
            // 2026-10-16 「pc에서는 원클릭으로 결함 수정창 까지 켜도 됨」: 마우스는 짧은 클릭 한 번에 선택+수정창.
            // 터치·펜은 그대로(한 번 탭 선택, 다시 탭 수정창).
            const pcMouseOneClick = !endedFromTouch && mapLastPointerType === 'mouse';
            // 2026-10-16 선택 안 돼 있던 마킹을 한 번 누름 → 선택만(수정창 열지 않음)
            if (!pendingDragWasSelectedBefore && !pcMouseOneClick) {
                if (isDefectModalOpen() && !isDefectMarkingGroupPending()) closeDefectModal();
                updateMapSelectionBar({ scrollToSelection: true });
                drawCanvas();
                if (d?.groupId && getDefectMarkingGroupMembers(d.groupId).length > 1) {
                    window.showToast?.(
                        `마킹 ${formatDefectMemberChipLabel(d)} 선택 · 한 번 더 누르면 수정창, 수정창에서 NO.박스를 다시 누르면 다음 화살표`,
                        'info',
                        2400
                    );
                }
                return;
            }
            // 다중 선택 상태에서 핀 클릭 → 일괄 수정창
            if (selectedDefectIds.size > 1) {
                if (d?.id && selectedDefectIds.has(d.id)) {
                    openBulkDefectEditModal();
                }
                updateMapSelectionBar({ scrollToSelection: true });
                drawCanvas();
                return;
            }
            selectedDefectIds = new Set([d.id]);
            updateMapSelectionBar({ scrollToSelection: true });
            // 2026-10-13 PC ???? ??? ?? ???? ?? ??? ? ? ?? ?? ?? ? ?(??? ???)
            const pcMouseClick = !endedFromTouch && !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
            openAddDefectModal(d.x, d.y, d.targetX, d.targetY, d, null, { revealMarkingAboveDrawer: true, fromCanvas: true, noCanvasReveal: pcMouseClick });
            if (d.groupId && getDefectMarkingGroupMembers(d.groupId).length > 1) {
                window.showToast?.(
                    `마킹 ${formatDefectMemberChipLabel(d)} 선택 · NO.박스를 다시 누르면 다음 화살표`,
                    'info',
                    2200
                );
            }
            return;
        }
        pendingDragHit = null;

        if (isDraggingPin || isDraggingPinGroup) {
            rebindActiveDragPinFromState();
            if (activeDragPin) touchDefectPositionUpdatedAt(activeDragPin);
            // 박스를 직접 끌어 옮김 → 「박스 자동 정리(겹친 박스만)」가 건드리지 않게 표시(묶음은 박스를 함께 씀)
            if (activeDragPin && !isDraggingPinGroup && (activeDragPart === 'BOX' || !activeDragPart)) {
                activeDragPin.boxManual = true;
                if (activeDragPin.groupId) {
                    getCurrentFloorDefects().forEach((d) => {
                        if (d && d !== activeDragPin && d.groupId === activeDragPin.groupId) d.boxManual = true;
                    });
                }
            }
            // 공유 NO.박스를 옮겼으면 묶음 모두의 x·y가 바뀌었다 → 모두 위치 시각을 올려야
            // 다른 기기와 칸 단위 병합할 때 옛 박스 자리로 되돌아가지 않는다
            if (activeDragPin && activeDragPin.groupId && !isDraggingPinGroup) {
                const gidMoved = activeDragPin.groupId;
                getCurrentFloorDefects().forEach(d => {
                    if (d && d !== activeDragPin && d.groupId === gidMoved
                        && d.x === activeDragPin.x && d.y === activeDragPin.y) {
                        touchDefectPositionUpdatedAt(d);
                    }
                });
            }
            if (isDraggingPinGroup) {
                getCurrentFloorMapPlacedDefects().forEach(d => {
                    if (selectedDefectIds.has(d.id)) touchDefectPositionUpdatedAt(d);
                });
            }
            // 행·열 선이 있으면 옮긴 마킹 위치를 칸 이름으로 (비었거나 자동으로 넣은 위치만 — 직접 쓴 글은 그대로)
            try {
                const movedForGrid = isDraggingPinGroup
                    ? getCurrentFloorMapPlacedDefects().filter(d => selectedDefectIds.has(d.id))
                    : (activeDragPin ? [activeDragPin] : []);
                if (typeof applyGridAutoLocationAfterDrag === 'function') applyGridAutoLocationAfterDrag(movedForGrid);
            } catch (gridErr) {
                console.warn('[grid-lines] drag', gridErr);
            }
            isDraggingPin = false;
            isDraggingPinGroup = false;
            activeDragPin = null;
            activeResizeXField = null;
            activeResizeYField = null;
            activeVertexIndex = -1;
            endAreaRotateSession();
            saveStateToLocalStorage();
            hadPinDragSave = true;
            // 마킹 드래그 종료 후 뷰포트/카메라를 마킹으로 재팬하지 않는다.
            // (조사표 행 클릭·터치 → viewDefectOnMapFromSurvey → focusDefectOnCanvas 만 이동)
            // 목록 UI만 갱신하고 center 스크롤도 생략 — 드래그 직후 화면 튐 방지
            updateMapSelectionBar({ scrollToSelection: false });
            drawCanvas();
        }

        if (isMarkingDrag) {
            isMarkingDrag = false;
            if (clientX != null && clientY != null) {
                const rawCoords = clientToImgCoords(clientX, clientY);
                const coords = snapImgCoordsForMarking(rawCoords.x, rawCoords.y);
                markTargetImgX = coords.x;
                markTargetImgY = coords.y;
                syncLiveMarkBoxAboveTarget(markTargetImgX, markTargetImgY);
            }
            markingHasMoved = false;
            if (window._pendingMapRegisterDefectId) {
                commitMapRegisterFromMarking(liveBoxImgX, liveBoxImgY, markTargetImgX, markTargetImgY);
                setDrawMode('PAN');
            } else if (getActiveMarkingGroup()?.groupId) {
                commitAdditionalMarkingAtTarget(liveBoxImgX, liveBoxImgY, markTargetImgX, markTargetImgY);
                setDrawMode('PAN');
            } else if (shouldAddSurveyRowWithMarking()) {
                window.showToast?.(
                    '화살표 추가가 끊겼습니다. 결함 수정에서 「화살표 추가」를 다시 눌러 주세요.',
                    'warning',
                    3500
                );
                setDrawMode('PAN');
            } else {
                openAddDefectModal(liveBoxImgX, liveBoxImgY, markTargetImgX, markTargetImgY, null, null, { revealMarkingAboveDrawer: true, fromCanvas: true });
                setDrawMode('PAN');
            }
            drawCanvas();
        }

        if (isAreaInkDrag && areaInkStroke) {
            isAreaInkDrag = false;
            const stroke = areaInkStroke;
            areaInkStroke = null;
            const target = getCurrentFloorDefects().find((d) => d.id === stroke.defectId);
            if (target && stroke.points && stroke.points.length >= 2) {
                if (typeof pushDefectHistory === 'function') pushDefectHistory();
                if (!Array.isArray(target.areaDrawings)) target.areaDrawings = [];
                target.areaDrawings.push({
                    type: stroke.type || 'path',
                    points: stroke.points.map((p) => ({ x: p.x, y: p.y }))
                });
                saveStateToLocalStorage();
            }
            drawCanvas();
        }

        if (isAreaDrag) {
            isAreaDrag = false;
            const x1 = Math.min(areaStartImgX, areaCurImgX);
            const y1 = Math.min(areaStartImgY, areaCurImgY);
            const x2 = Math.max(areaStartImgX, areaCurImgX);
            const y2 = Math.max(areaStartImgY, areaCurImgY);
            if (Math.hypot(x2 - x1, y2 - y1) < 15) {
                if (getActiveMarkingGroup()?.groupId) finishMarkingGroupCommit();
                setDrawMode('PAN');
                drawCanvas();
            } else {
                const shape = state.areaCreateShape || 'rect';
                const areaPayload = {
                    x1, y1, x2, y2,
                    areaShape: shape === 'ellipse' ? 'ellipse' : 'rect',
                    areaAngle: 0
                };
                if (getActiveMarkingGroup()?.groupId) {
                    commitAdditionalMarkingAtTarget(x1, y1, undefined, undefined, areaPayload);
                    setDrawMode('PAN');
                } else {
                    openAddDefectModal(x1, y1, undefined, undefined, null, areaPayload, { revealMarkingAboveDrawer: true, fromCanvas: true });
                    setDrawMode('PAN');
                }
                drawCanvas();
            }
        }

        if (emptyTapPending) {
            const tap = emptyTapPending;
            emptyTapPending = null;
            const movedAtEnd = (clientX == null || clientY == null)
                ? 0 : Math.hypot(clientX - startMouseX, clientY - startMouseY);
            if (!tap.moved && movedAtEnd <= TOUCH_DRAG_THRESHOLD) {
                if (tap.closeModal && isDefectModalOpen() && !isDefectMarkingGroupPending()) closeDefectModal();
                if (tap.clearSel && selectedDefectIds.size > 0) {
                    selectedDefectIds.clear();
                    updateMapSelectionBar();
                    drawCanvas();
                }
            }
        }

        if (isMarqueeSelecting) {
            isMarqueeSelecting = false;
            const x1 = Math.min(marqueeStartImgX, marqueeCurImgX);
            const y1 = Math.min(marqueeStartImgY, marqueeCurImgY);
            const x2 = Math.max(marqueeStartImgX, marqueeCurImgX);
            const y2 = Math.max(marqueeStartImgY, marqueeCurImgY);
            const tiny = Math.hypot(x2 - x1, y2 - y1) < 6;
            if (!marqueeAdditive) selectedDefectIds.clear();
            if (!tiny) {
                collectMarqueeHits(x1, y1, x2, y2).forEach(id => {
                    if (marqueeAdditive) {
                        if (selectedDefectIds.has(id)) selectedDefectIds.delete(id);
                        else selectedDefectIds.add(id);
                    } else {
                        selectedDefectIds.add(id);
                    }
                });
            }
            marqueeAdditive = false;
            updateMapSelectionBar({ scrollToSelection: true });
            drawCanvas();
            // PC: 드래그(마퀴)로 정확히 1개만 선택되면 클릭과 같이 결함 수정창 오픈
            if (!endedFromTouch && !tiny && selectedDefectIds.size === 1) {
                const onlyId = [...selectedDefectIds][0];
                const d = getCurrentFloorDefects().find(def => def.id === onlyId);
                if (d) openAddDefectModal(d.x, d.y, d.targetX, d.targetY, d, null, { revealMarkingAboveDrawer: true, fromCanvas: true });
            }
        }

        isDragging = false;
        if (elements.planCanvas) {
            elements.planCanvas.style.cursor = getMapCanvasCursor();
        }
        scheduleFloorDrawingTierSync();
        } finally {
            if (hadPinDragSave) discardStalePendingRemoteAfterLocalPinEdit();
            if (typeof scheduleFlushPendingRemoteSync === 'function') scheduleFlushPendingRemoteSync();
        }
    }

    // @@DRAWING_CROSSHAIR_START
    // ── CAD 커서식 십자선 ─────────────────────────────────────────────────────────
    // PC 마우스: 도면 위에 올리면 커서를 지나는 가로·세로 전체 길이 선(AutoCAD 커서처럼).
    // 터치·마우스 공통: 마킹을 끌어 옮기는 동안에는 마킹의 실제 위치(손가락 접점이 아님)를 지나는 선.
    // 도면 팬·핀치 줌만 할 때는 표시하지 않음. 캔버스에 그리지 않는 DOM 오버레이(pointer-events: none)라
    // 클릭·드래그를 막지 않고 PDF·HWPX·벡터 출력에도 들어가지 않는다.
    const DRAWING_CROSSHAIR_STORAGE_KEY = 'bsa_drawing_crosshair_v1';
    const DRAWING_CROSSHAIR_GAP_PX = 6; // 가운데 빈칸 — 원래 커서·마킹이 선에 가리지 않게
    /**
     * 폰·태블릿(터치 도구줄): 도면 도구줄에서 스냅·십자선·행·열 버튼을 뺀다(2026-09-29).
     * 판정은 mobile-keyboard.js의 isTouchToolbarUi(손가락 포인터·layout-tablet, PC 마우스 제외).
     */
    function isTouchToolbarUi() {
        try {
            if (window.BSA && typeof window.BSA.isTouchToolbarUi === 'function') return !!window.BSA.isTouchToolbarUi();
            const root = document.documentElement;
            return !!(root && root.classList && root.classList.contains('bsa-touch-ui'));
        } catch (_e) { return false; }
    }
    // 터치 기기는 십자선 늘 켬(끄는 버튼 없음). PC는 저장한 켜기/끄기 그대로.
    let drawingCrosshairEnabled = (function readDrawingCrosshairPref() {
        if (isTouchToolbarUi()) return true;
        try { return localStorage.getItem(DRAWING_CROSSHAIR_STORAGE_KEY) !== '0'; } catch (_e) { return true; }
    })();
    let drawingCrosshairLastClient = null; // 마지막 포인터 위치(터치 포함) — 크기 조절 손잡이처럼 손가락을 그대로 따라가는 부분용

    function isFiniteCrosshairPoint(p) {
        return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
    }

    function createDrawingCrosshair(cfg) {
        let root = null;
        let segs = null;
        let hover = null; // { clientX, clientY } — 마우스가 도면 캔버스 위에 있을 때만
        let raf = 0;
        let shown = false;
        let lastBox = '';
        let lastPos = '';

        function ensure(container) {
            if (root && root.parentElement === container) return;
            if (root && root.parentElement) root.parentElement.removeChild(root);
            root = document.createElement('div');
            root.className = 'drawing-crosshair';
            root.setAttribute('aria-hidden', 'true');
            root.setAttribute('data-html2canvas-ignore', 'true');
            root.hidden = true;
            segs = ['h', 'h', 'v', 'v'].map((axis) => {
                const s = document.createElement('div');
                s.className = 'drawing-crosshair-seg drawing-crosshair-' + axis;
                root.appendChild(s);
                return s;
            });
            container.appendChild(root);
            shown = false;
            lastBox = '';
            lastPos = '';
        }

        function hide() {
            if (root && shown) {
                root.hidden = true;
                shown = false;
            }
        }

        function frame() {
            raf = 0;
            if (!drawingCrosshairEnabled) { hide(); return; }
            const st = window.state;
            if (st && st.currentTab && st.currentTab !== cfg.tabId) { hide(); return; }
            const canvas = document.getElementById(cfg.canvasId);
            const container = document.getElementById(cfg.containerId);
            if (!canvas || !container) { hide(); return; }
            const cr = canvas.getBoundingClientRect();
            if (!(cr.width > 0 && cr.height > 0)) { hide(); return; }

            let p = null;
            let dragging = false;
            let dp = null;
            try { dp = cfg.getDragPoint(); } catch (_e) { dp = null; }
            if (isFiniteCrosshairPoint(dp)) {
                p = dp;
                dragging = true;
            } else if (hover) {
                let blocked = false;
                try { blocked = !!(cfg.isHoverBlocked && cfg.isHoverBlocked(hover.clientX, hover.clientY)); } catch (_e) { blocked = false; }
                if (!blocked) p = { x: hover.clientX - cr.left, y: hover.clientY - cr.top };
            }
            if (!p || p.x < 0 || p.y < 0 || p.x > cr.width || p.y > cr.height) { hide(); return; }

            ensure(container);
            const kr = container.getBoundingClientRect();
            const left = Math.round(cr.left - kr.left - container.clientLeft);
            const top = Math.round(cr.top - kr.top - container.clientTop);
            const w = Math.round(cr.width);
            const h = Math.round(cr.height);
            const box = left + ',' + top + ',' + w + ',' + h;
            if (box !== lastBox) {
                root.style.left = left + 'px';
                root.style.top = top + 'px';
                root.style.width = w + 'px';
                root.style.height = h + 'px';
                lastBox = box;
                lastPos = '';
            }
            const x = Math.round(p.x);
            const y = Math.round(p.y);
            const pos = x + ',' + y;
            if (pos !== lastPos) {
                const g = DRAWING_CROSSHAIR_GAP_PX;
                // 선 길이는 오버레이 전체(100%) — 위치만 transform 으로 옮김(레이아웃 없음)
                segs[0].style.transform = 'translate3d(' + (x - g - w) + 'px,' + y + 'px,0)';
                segs[1].style.transform = 'translate3d(' + (x + g + 1) + 'px,' + y + 'px,0)';
                segs[2].style.transform = 'translate3d(' + x + 'px,' + (y - g - h) + 'px,0)';
                segs[3].style.transform = 'translate3d(' + x + 'px,' + (y + g + 1) + 'px,0)';
                lastPos = pos;
            }
            root.classList.toggle('is-dragging', dragging);
            if (!shown) {
                root.hidden = false;
                shown = true;
            }
        }

        function request() {
            if (raf) return;
            raf = requestAnimationFrame(frame);
        }

        function onMousePointerMove(e) {
            const canvas = document.getElementById(cfg.canvasId);
            const over = !!canvas && e.target === canvas;
            if (!over && !hover) return;
            hover = over ? { clientX: e.clientX, clientY: e.clientY } : null;
            request();
        }

        function clearHover() {
            if (!hover) return;
            hover = null;
            request();
        }

        return { request, onMousePointerMove, clearHover, isShown: () => shown };
    }

    function mapImgToCanvasLocal(imgX, imgY) {
        if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) return null;
        const v = imgToViewCoords(imgX, imgY);
        return { x: state.view.offsetX + v.x * state.view.scale, y: state.view.offsetY + v.y * state.view.scale };
    }

    function clientToCanvasLocal(canvasId, client) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !client) return null;
        const r = canvas.getBoundingClientRect();
        return { x: client.clientX - r.left, y: client.clientY - r.top };
    }

    /** 결함위치도 마킹의 끌리는 부분 실제 위치(도면 이미지 좌표 → 캔버스 CSS px) */
    function getMapMarkingPartCanvasPoint(d, part) {
        if (!d) return null;
        if (part === 'AREA_ROTATE') return null;
        if (part === 'TIP') {
            const tx = Number(d.targetX !== undefined ? d.targetX : d.x);
            const ty = Number(d.targetY !== undefined ? d.targetY : d.y);
            return mapImgToCanvasLocal(tx, ty);
        }
        if (part === 'AREA_MOVE') {
            const c = getDefectMarkingImgCenter(d);
            return c ? mapImgToCanvasLocal(c.x, c.y) : null;
        }
        if (part === 'AREA_RESIZE' || part === 'AREA_VERTEX') {
            // 손잡이·꼭짓점은 포인터를 그대로 따라감(오프셋 없음)
            return clientToCanvasLocal('planCanvas', drawingCrosshairLastClient);
        }
        return mapImgToCanvasLocal(Number(d.x), Number(d.y));
    }

    function getMapCrosshairDragPoint() {
        if (isPinching || isDragging || isDraggingLegend || isResizingLegend) return null;
        if (isDraggingPinGroup) return mapImgToCanvasLocal(groupDragLastImgX, groupDragLastImgY);
        if (isDraggingPin && activeDragPin) return getMapMarkingPartCanvasPoint(activeDragPin, activeDragPart);
        if (isMarkingDrag) return mapImgToCanvasLocal(markPreviewTargetX, markPreviewTargetY);
        if (isAreaDrag) return mapImgToCanvasLocal(areaCurImgX, areaCurImgY);
        // 터치: 길게 눌러 잡은 뒤(아직 움직이기 전)부터 표시
        if (pendingDragHit && pendingDragArmed && pendingDragIsTouch && pendingDragHit.hitInfo) {
            const hi = pendingDragHit.hitInfo;
            if (hi.part === 'AREA_RESIZE' || hi.part === 'AREA_VERTEX') {
                return mapImgToCanvasLocal(pendingDragHit.imgX, pendingDragHit.imgY);
            }
            return getMapMarkingPartCanvasPoint(hi.defect, hi.part);
        }
        return null;
    }

    function isMapCrosshairHoverBlocked(clientX, clientY) {
        if (isPinching) return true;
        // 범례 위에서는 숨김(범례 이동·크기 조절 커서가 보이게)
        const c = clientToImgCoords(clientX, clientY);
        return !!hitTestLegendBox(c.x, c.y);
    }

    function ndtImgToCanvasLocal(imgX, imgY) {
        if (!Number.isFinite(imgX) || !Number.isFinite(imgY)) return null;
        const angle = ndtRotationAngle || 0;
        const { w: imgW, h: imgH } = getNdtDrawingDims();
        let vx = imgX;
        let vy = imgY;
        // viewToNdtImgCoords 의 역변환
        if (angle === 90) { vx = imgH - imgY; vy = imgX; }
        else if (angle === 180) { vx = imgW - imgX; vy = imgH - imgY; }
        else if (angle === 270) { vx = imgY; vy = imgW - imgX; }
        return { x: ndtView.offsetX + vx * ndtView.scale, y: ndtView.offsetY + vy * ndtView.scale };
    }

    function getNdtPinPartCanvasPoint(item, part) {
        if (!item || part === 'rotate') return null;
        if (part === 'target') {
            return ndtImgToCanvasLocal(Number(item.targetX !== undefined ? item.targetX : item.x),
                Number(item.targetY !== undefined ? item.targetY : item.y));
        }
        if (part === 'box') {
            return ndtImgToCanvasLocal(Number(item.boxX !== undefined ? item.boxX : item.x),
                Number(item.boxY !== undefined ? item.boxY : item.y));
        }
        return ndtImgToCanvasLocal(Number(item.x), Number(item.y));
    }

    function getNdtCrosshairDragPoint() {
        if (isNdtPinching || isNdtDragging) return null;
        if (isDraggingNdtDisplacement && activeDragNdtDisplacementGroup) {
            const pt = activeDragNdtDisplacementPoint;
            if (pt) return ndtImgToCanvasLocal(Number(pt.x), Number(pt.y));
            const g = activeDragNdtDisplacementGroup;
            return ndtImgToCanvasLocal(Number(g.boxX), Number(g.boxY));
        }
        if (isDraggingNdtPinGroup) return ndtImgToCanvasLocal(ndtGroupDragLastX, ndtGroupDragLastY);
        if (isDraggingNdtPin && activeDragNdtPin) return getNdtPinPartCanvasPoint(activeDragNdtPin, dragNdtPart);
        if (isNdtMarkingDrag && window._ndtMarkCurrentCoords) {
            return ndtImgToCanvasLocal(Number(window._ndtMarkCurrentCoords.x), Number(window._ndtMarkCurrentCoords.y));
        }
        if (pendingNdtPinHit && pendingNdtPinArmed && pendingNdtPinIsTouch) {
            return getNdtPinPartCanvasPoint(pendingNdtPinHit.item, pendingNdtPinHit.part);
        }
        return null;
    }

    const mapDrawingCrosshair = createDrawingCrosshair({
        tabId: 'tab-map',
        containerId: 'canvasContainer',
        canvasId: 'planCanvas',
        getDragPoint: getMapCrosshairDragPoint,
        isHoverBlocked: isMapCrosshairHoverBlocked
    });
    const ndtDrawingCrosshair = createDrawingCrosshair({
        tabId: 'tab-ndt',
        containerId: 'ndtCanvasContainer',
        canvasId: 'ndtCanvas',
        getDragPoint: getNdtCrosshairDragPoint,
        isHoverBlocked: () => isNdtPinching
    });
    // var: drawCanvas 가 이 줄보다 먼저 불려도(초기화 중) undefined 로 읽히게 — let/const 는 TDZ 오류
    var drawingCrosshairs = [mapDrawingCrosshair, ndtDrawingCrosshair];

    function requestDrawingCrosshairUpdate() {
        if (!drawingCrosshairs) return;
        for (let i = 0; i < drawingCrosshairs.length; i++) drawingCrosshairs[i].request();
    }

    (function bindDrawingCrosshairGlobalEvents() {
        if (window._bsaDrawingCrosshairBound) return;
        window._bsaDrawingCrosshairBound = true;
        const cap = { capture: true, passive: true };
        const clearAllHover = () => drawingCrosshairs.forEach((x) => x.clearHover());
        window.addEventListener('pointermove', (e) => {
            drawingCrosshairLastClient = { clientX: e.clientX, clientY: e.clientY };
            // 호버 십자선은 실제 마우스만 — 터치·펜은 끌 때만
            if (e.pointerType !== 'mouse') return;
            drawingCrosshairs.forEach((x) => x.onMousePointerMove(e));
        }, cap);
        window.addEventListener('pointerdown', (e) => {
            drawingCrosshairLastClient = { clientX: e.clientX, clientY: e.clientY };
            if (e.pointerType !== 'mouse') clearAllHover();
            requestDrawingCrosshairUpdate();
        }, cap);
        window.addEventListener('touchmove', (e) => {
            const t = e.touches && e.touches[0];
            if (t) drawingCrosshairLastClient = { clientX: t.clientX, clientY: t.clientY };
        }, cap);
        ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'resize', 'scroll'].forEach((type) => {
            window.addEventListener(type, requestDrawingCrosshairUpdate, cap);
        });
        window.addEventListener('blur', clearAllHover);
        document.addEventListener('mouseleave', clearAllHover);
        document.documentElement.addEventListener('pointerleave', (e) => {
            if (e.pointerType === 'mouse') clearAllHover();
        });
    })();

    function syncDrawingCrosshairButtons() {
        ['btnToggleCrosshair', 'mobileBtnCrosshair', 'btnToggleCrosshairNdt', 'mobileNdtBtnCrosshair'].forEach((id) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.classList.toggle('active', drawingCrosshairEnabled);
            b.setAttribute('aria-pressed', drawingCrosshairEnabled ? 'true' : 'false');
        });
    }

    function setDrawingCrosshairEnabled(on) {
        if (isTouchToolbarUi()) on = true; // 터치 기기: 늘 켬
        drawingCrosshairEnabled = !!on;
        try { localStorage.setItem(DRAWING_CROSSHAIR_STORAGE_KEY, drawingCrosshairEnabled ? '1' : '0'); } catch (_e) { /* ignore */ }
        syncDrawingCrosshairButtons();
        requestDrawingCrosshairUpdate();
    }

    function setupDrawingCrosshairToggleButtons() {
        ['btnToggleCrosshair', 'mobileBtnCrosshair', 'btnToggleCrosshairNdt', 'mobileNdtBtnCrosshair'].forEach((id) => {
            const b = document.getElementById(id);
            if (!b || b._crosshairBound) return;
            b._crosshairBound = true;
            b.addEventListener('click', () => {
                setDrawingCrosshairEnabled(!drawingCrosshairEnabled);
                window.showToast?.(drawingCrosshairEnabled ? '십자선 켜짐' : '십자선 꺼짐', 'info', 1500);
            });
        });
        syncDrawingCrosshairButtons();
    }
    window.setDrawingCrosshairEnabled = setDrawingCrosshairEnabled;
    // @@DRAWING_CROSSHAIR_END

    /** 도면 위에 떠 있는 UI(선택 결함 팝업·모양 막대·툴바·패널). 이 안을 누른 입력은 도면이 받지 않는다 */
    const MAP_FLOATING_OVERLAY_SELECTOR = [
        '#mapSelectedDefectPopup', '.map-selected-defect-popup', '#markShapeBar', '#areaPolyTouchBar', '#areaPolygonRedrawBanner',
        '#areaToolPanel', '#mapStyleSizeToolbar', '#mapGuideBar', '#mapCountBar', '#mapEvalMemberBar', '#evalUnitBar',
        '#areaShapePicker', '.canvas-top-toolbar', '.canvas-bottom-toolbar', '#mobileMapSideRail',
        '.map-selection-bar', '#mapSelectionBar'
    ].join(', ');

    function isMapFloatingOverlayTarget(target) {
        try {
            return !!(target && typeof target.closest === 'function' && target.closest(MAP_FLOATING_OVERLAY_SELECTOR));
        } catch (_e) { return false; }
    }

    function isMapGestureInProgress() {
        return !!(isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup
            || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting || isPinching);
    }

    /**
     * 도면 컨테이너 안의 떠 있는 UI를 누르면(pointerdown·mousedown·touchstart·touchend…) 이벤트가 위로(문서·창 단위 도면 처리기)
     * 퍼지지 않게 막고, 뒤따르는 합성 마우스 이벤트(터치 뒤 mousedown/click)도 700ms 동안 도면이 무시하게 한다.
     * 팝업 안 스크롤은 기본 동작이라 그대로. 도면에서 시작한 끌기(마우스 놓기 등)는 막지 않는다.
     */
    function mapFloatingOverlayIsolationHandler(e) {
        if (!isMapFloatingOverlayTarget(e.target)) return;
        const t = e.type;
        if (t === 'mouseup' && isMapGestureInProgress()) return; // 도면에서 끌던 중 팝업 위에서 놓음 → 끌기 마무리는 그대로
        if (t === 'pointerup' && (e.pointerType === 'mouse' || isMapGestureInProgress())) return;
        e.stopPropagation();
        if (t === 'touchstart' || t === 'touchend' || t === 'pointerdown' && e.pointerType !== 'mouse') {
            mapSuppressMouseUntil = Date.now() + 700;
        }
    }

    function bindMapFloatingOverlayIsolation() {
        const host = document.getElementById('canvasContainer');
        if (!host || host._bsaOverlayIsolationBound) return;
        host._bsaOverlayIsolationBound = true;
        ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel'].forEach((type) => {
            host.addEventListener(type, mapFloatingOverlayIsolationHandler, { passive: true });
        });
    }

    function getMapCanvasCursor() {
        if (state.mode === 'MARK' || state.mode === 'AREA' || state.areaInkTool) return 'crosshair';
        if (state.mode === 'MEMO') return 'copy';
        return 'default';
    }

    if (elements.planCanvas) {
        elements.planCanvas.addEventListener('pointerdown', (e) => {
            if (isMapFloatingOverlayTarget(e.target)) return;
            mapLastPointerType = e.pointerType || 'mouse';
        }, true);
        // 도면 위에 뜬 팝업·막대·패널을 누른 터치·클릭이 도면(뒤쪽 마킹)으로 새지 않게 (2026-10-27)
        bindMapFloatingOverlayIsolation();
        // Mouse Events
        elements.planCanvas.addEventListener('mousedown', (e) => {
            // 터치 제스처 중·직후 합성 마우스 이벤트는 무시 (드래그 중 끊김 방지)
            if (activePointerIsTouch || Date.now() < mapSuppressMouseUntil) return;
            if (isMapFloatingOverlayTarget(e.target)) return;
            if (window.cadCalibrationState && e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof handleCadCalibrationClick === 'function') {
                    handleCadCalibrationClick(e.clientX, e.clientY);
                }
                return;
            }
            // 2026-11-12 마킹 맞추기: 끌면 화면 이동, 누르면 기준점(다른 도면 동작은 막음)
            if (window.drawingAlignState && e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof drawingAlignPointerDown === 'function') drawingAlignPointerDown(e.clientX, e.clientY, false);
                return;
            }
            // 행·열(통심) 선 편집 중에는 선 긋기·옮기기만 (마킹 안 함)
            if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                window.BSA_gridEdit.onPointerDown(e.clientX, e.clientY, false);
                return;
            }
            if (e.button === 1) {
                e.preventDefault();
                handleDragStart(e.clientX, e.clientY, false, true);
                return;
            }
            if (e.button === 0 && state.mode === 'MEMO') {
                // 메모 모드: 끌면 도면 이동, 제자리 클릭이면 메모(놓을 때 판단)
                memoTapStart(e.clientX, e.clientY);
                handleDragStart(e.clientX, e.clientY, false, true);
                return;
            }
            if (e.button === 0) {
                handleDragStart(e.clientX, e.clientY, false, false, {
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey
                });
            }
        });

        elements.planCanvas.addEventListener('auxclick', (e) => {
            if (e.button === 1) e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (activePointerIsTouch || Date.now() < mapSuppressMouseUntil) return;
            if (memoTap) memoTapMove(e.clientX, e.clientY);
            if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) {
                handleDragMove(e.clientX, e.clientY);
            }
        });

        elements.planCanvas.addEventListener('mousemove', (e) => {
            if (activePointerIsTouch || Date.now() < mapSuppressMouseUntil) return;
            if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) return;
            updateMapHoverCursor(e.clientX, e.clientY);
        });

        elements.planCanvas.addEventListener('mouseleave', () => {
            if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) return;
            elements.planCanvas.style.cursor = getMapCanvasCursor();
        });

        window.addEventListener('mouseup', (e) => {
            if (activePointerIsTouch || Date.now() < mapSuppressMouseUntil) return;
            if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) handleDragEnd(e.clientX, e.clientY);
            if (memoTap && e.button === 0) memoTapEnd();
        });

        elements.planCanvas.addEventListener('dblclick', (e) => {
            if (activePointerIsTouch) return;
            e.preventDefault();
            if (window.BSA_gridEdit && window.BSA_gridEdit.active) {
                window.BSA_gridEdit.onDblClick(e.clientX, e.clientY);
                return;
            }
            if (canFinishPendingPoly()) {
                finishPendingAreaPolygon();
                return;
            }
            if (pendingInkPoly && pendingInkPoly.points && pendingInkPoly.points.length >= 3) {
                const target = getCurrentFloorDefects().find((d) => d.id === pendingInkPoly.defectId);
                if (target) {
                    if (typeof pushDefectHistory === 'function') pushDefectHistory();
                    if (!Array.isArray(target.areaDrawings)) target.areaDrawings = [];
                    target.areaDrawings.push({
                        type: 'polygon',
                        points: pendingInkPoly.points.map((p) => ({ x: p.x, y: p.y }))
                    });
                    pendingInkPoly = null;
                    saveStateToLocalStorage();
                    drawCanvas();
                }
            }
        });

        // Touch Events (Galaxy Tab & Smartphone Support with Multi-Touch Pinch Zoom & Pan)
        elements.planCanvas.addEventListener('touchstart', (e) => {
            if (isMapFloatingOverlayTarget(e.target)) return;
            if (typeof cancelCanvasPanAnimation === 'function') cancelCanvasPanAnimation();
            mapTouchStartedOnCanvas = true;
            mapSuppressMouseUntil = Date.now() + 700;
            if (window.drawingAlignState && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                if (typeof drawingAlignPointerDown === 'function') drawingAlignPointerDown(e.touches[0].clientX, e.touches[0].clientY, true);
                return;
            }
            if (window.cadCalibrationState && e.touches.length === 1) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                if (typeof handleCadCalibrationClick === 'function') {
                    handleCadCalibrationClick(e.touches[0].clientX, e.touches[0].clientY);
                }
                return;
            }
            if (window.BSA_gridEdit && window.BSA_gridEdit.active && e.touches.length === 1 && !isPinching) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
                window.BSA_gridEdit.onPointerDown(e.touches[0].clientX, e.touches[0].clientY, true);
                return;
            }
            if (window.BSA_gridEdit && window.BSA_gridEdit.drag && e.touches.length >= 2) window.BSA_gridEdit.cancelDrag();
            if (e.touches.length === 1 && !isPinching) {
                if (e.cancelable) e.preventDefault();
                // 두 손가락 제스처 뒤: 모두 떼고 잠깐(250ms) 지날 때까지는 점·그리기 시작 안 함
                // 2026-10-19 「확대 축소하고 드래그 하려면 처음 드래그는 씹히고」: 이 동안에도 도면 이동(팬)만은 바로 된다
                if (touchMultiActive || Date.now() < touchCooldownUntil) {
                    handleDragStart(e.touches[0].clientX, e.touches[0].clientY, true, true);
                    return;
                }
                if (state.mode === 'MEMO') {
                    memoTapStart(e.touches[0].clientX, e.touches[0].clientY);
                    handleDragStart(e.touches[0].clientX, e.touches[0].clientY, true, true);
                    return;
                }
                handleDragStart(e.touches[0].clientX, e.touches[0].clientY, true);
            } else if (e.touches.length >= 2) {
                touchMultiActive = true;
                if (touchPolyTap) touchPolyTap.multi = true;
                if (memoTap) memoTap.multi = true;
                // Multi-touch detected: cancel active 1-finger mark or drag operations safely
                emptyTapPending = null;
                clearPendingDragLongPress();
                hideTouchLoupe(MAP_LOUPE_ID);
                pendingDragHit = null;
                isMarkingDrag = false;
                markingHasMoved = false;
                isDragging = false;
                isDraggingPin = false;
                isDraggingPinGroup = false;
                isAreaDrag = false;
                touchPolyTap = null;
                isAreaInkDrag = false;
                areaInkStroke = null;
                isMarqueeSelecting = false;
                activeDragPin = null;
                isDraggingLegend = false;
                isResizingLegend = false;
                activePointerIsTouch = false;

                isPinching = true;
                const rect = elements.planCanvas.getBoundingClientRect();
                initialPinchDist = getTouchDistance(e.touches[0], e.touches[1]);
                initialPinchScale = state.view.scale;
                const mid = getTouchMidpoint(e.touches[0], e.touches[1], rect);
                initialPinchMidX = mid.x;
                initialPinchMidY = mid.y;
                initialPinchOffsetX = state.view.offsetX;
                initialPinchOffsetY = state.view.offsetY;
            }
        }, { passive: false });

        window.addEventListener('touchmove', (e) => {
            // 결함위치도가 아니거나, 도면 밖에서 시작한 터치 → 스크롤 잠금 금지
            if (window.state && (window.state.currentTab !== 'tab-map')) return;
            if (!mapTouchStartedOnCanvas) return;
            if (isPinching && e.touches.length >= 2) {
                if (e.cancelable) e.preventDefault();
                const rect = elements.planCanvas.getBoundingClientRect();
                const currentDist = getTouchDistance(e.touches[0], e.touches[1]);
                if (initialPinchDist > 0) {
                    const scaleFactor = currentDist / initialPinchDist;
                    const lim = getMapViewScaleLimits();
                    const newScale = Math.min(Math.max(lim.min, initialPinchScale * scaleFactor), lim.max);
                    const currentMid = getTouchMidpoint(e.touches[0], e.touches[1], rect);

                    // Compute focal point zoom offset based on touch midpoint
                    const imgX = (initialPinchMidX - initialPinchOffsetX) / initialPinchScale;
                    const imgY = (initialPinchMidY - initialPinchOffsetY) / initialPinchScale;

                    state.view.scale = newScale;
                    state.view.offsetX = currentMid.x - imgX * newScale;
                    state.view.offsetY = currentMid.y - imgY * newScale;

                    if (elements.zoomScaleText) elements.zoomScaleText.textContent = formatMapZoomLabel();
                    drawCanvas();
                    if (typeof updateMapZoomOverlay === 'function') updateMapZoomOverlay();
                    scheduleFloorDrawingTierSync();
                    if (shouldUseViewportTilesForCurrentFloor()) scheduleViewportHiPatchSync();
                }
            } else if (!isPinching && e.touches.length === 1) {
                if (memoTap) memoTapMove(e.touches[0].clientX, e.touches[0].clientY);
                if (touchPolyTap) {
                    const t0 = e.touches[0];
                    touchPolyTap.maxMove = Math.max(touchPolyTap.maxMove || 0,
                        Math.hypot(t0.clientX - touchPolyTap.clientX, t0.clientY - touchPolyTap.clientY));
                }
                if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) {
                    // 브라우저가 스크롤/제스처로 터치 드래그를 가로채 끊지 않게
                    if (e.cancelable) e.preventDefault();
                    handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
                }
            }
        }, { passive: false });

        window.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) mapTouchStartedOnCanvas = false;
            if (touchMultiActive && e.touches.length === 0) {
                touchMultiActive = false;
                touchCooldownUntil = Date.now() + TOUCH_MULTI_COOLDOWN_MS;
            }
            mapSuppressMouseUntil = Date.now() + 700;
            if (isPinching) {
                if (e.touches.length < 2) {
                    isPinching = false;
                    // 2026-10-19 남은 한 손가락은 바로 도면 이동(예전엔 손을 다 떼고 다시 대야 움직였음)
                    if (e.touches.length === 1) handleDragStart(e.touches[0].clientX, e.touches[0].clientY, true, true);
                    flushViewportHiPatchSync();
                    scheduleFloorDrawingTierSync();
                    if (typeof scheduleFlushPendingRemoteSync === 'function') scheduleFlushPendingRemoteSync();
                }
            } else {
                const t = e.changedTouches && e.changedTouches[0];
                if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) {
                    handleDragEnd(t ? t.clientX : undefined, t ? t.clientY : undefined);
                }
                if (shouldUseViewportTilesForCurrentFloor()) {
                    flushViewportHiPatchSync();
                }
            }
            if (memoTap && e.touches.length === 0) memoTapEnd();
        });

        // 도면 밖 터치 시작 → 스크롤 잠금 해제 (결함목록·툴바 등)
        if (!document._mapOutsideScrollUnlockBound) {
            document._mapOutsideScrollUnlockBound = true;
            document.addEventListener('touchstart', (e) => {
                if (window.state && (window.state.currentTab !== 'tab-map')) return;
                const t = e.target;
                if (t && typeof t.closest === 'function' && t.closest('#canvasContainer, #planCanvas')) return;
                mapTouchStartedOnCanvas = false;
                isDragging = false;
                isMarkingDrag = false;
                isAreaDrag = false;
                isAreaInkDrag = false;
                areaInkStroke = null;
                isPinching = false;
                pendingDragHit = null;
                isMarqueeSelecting = false;
                activePointerIsTouch = false;
                document.body.classList.remove('dragging-pin');
                document.body.style.touchAction = '';
                if (typeof scheduleFlushPendingRemoteSync === 'function') scheduleFlushPendingRemoteSync();
            }, { capture: true, passive: true });
        }

        window.addEventListener('touchcancel', (e) => {
            isPinching = false;
            // 취소된 터치는 탭이 아니다(점을 찍지 않는다)
            if (touchPolyTap) touchPolyTap.multi = true;
            memoTap = null;
            if (!e.touches || e.touches.length === 0) {
                if (touchMultiActive) touchCooldownUntil = Date.now() + TOUCH_MULTI_COOLDOWN_MS;
                touchMultiActive = false;
            }
            const t = e.changedTouches && e.changedTouches[0];
            if (isDragging || isMarkingDrag || isAreaDrag || isAreaInkDrag || isDraggingPin || isDraggingPinGroup || pendingDragHit || isDraggingLegend || isResizingLegend || isMarqueeSelecting) {
                handleDragEnd(t ? t.clientX : undefined, t ? t.clientY : undefined);
            }
        });


        // Wheel Zoom (마우스 커서 위치 기준)
        ['pointerdown', 'touchstart', 'mousedown', 'wheel'].forEach((evName) => {
            elements.planCanvas.addEventListener(evName, stopMapAutoPanOnUserInput, { capture: true, passive: true });
        });
        elements.planCanvas.addEventListener('wheel', (e) => {
            if (typeof cancelCanvasPanAnimation === 'function') cancelCanvasPanAnimation();
            e.preventDefault();
            const rect = elements.planCanvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            applyFocalZoom(state.view, mouseX, mouseY, zoomFactor, undefined, undefined, getMapFitScale);
            if (elements.zoomScaleText) elements.zoomScaleText.textContent = formatMapZoomLabel();
            drawCanvas();
            scheduleFloorDrawingTierSync();
        }, { passive: false });
    }

    function isMobileDefectDrawerViewport() {
        return layoutMediaMobileDefectDrawer();
    }

    function syncDefectDrawerToCanvasArea() {
        const overlay = elements.defectModal || document.getElementById('defectModal');
        if (!overlay) return;

        // 모바일 세로 1/2 · 가로 1/3 은 전체 화면 기준이므로 도면 영역에 묶지 않음
        if (isMobileDefectDrawerViewport()) {
            overlay.classList.remove('defect-drawer-in-canvas');
            overlay.style.top = '';
            overlay.style.left = '';
            overlay.style.width = '';
            overlay.style.height = '';
            return;
        }

        const canvasArea = document.getElementById('canvasContainer');
        const onMapTab = (window.state.currentTab === 'tab-map');
        if (onMapTab && canvasArea) {
            const rect = canvasArea.getBoundingClientRect();
            if (rect.width >= 40 && rect.height >= 40) {
                overlay.classList.add('defect-drawer-in-canvas');
                overlay.style.top = `${Math.round(rect.top)}px`;
                overlay.style.left = `${Math.round(rect.left)}px`;
                overlay.style.width = `${Math.round(rect.width)}px`;
                overlay.style.height = `${Math.round(rect.height)}px`;
                return;
            }
        }

        overlay.classList.remove('defect-drawer-in-canvas');
        overlay.style.top = '';
        overlay.style.left = '';
        overlay.style.width = '';
        overlay.style.height = '';
    }

    /**
     * 결함 수정창이 열려 있을 때 좌측 목록창 하단이 수정창(바닥 시트)·올려진 하단 툴바에 가려지지 않도록
     * 가려지는 높이만큼 목록창 아래 여백(--bsa-list-obstruct)을 잡아 목록창이 줄어들게 한다.
     * 창을 닫으면 변수를 지워 원래 크기로 돌아간다. (styles.css: body.defect-modal-open … .inspect-sidebar-left)
     */
    function computeDefectListObstruction() {
        const side = document.querySelector('#tab-map .inspect-sidebar-left');
        if (!side || !document.body.classList.contains('defect-modal-open')) return 0;
        const sr = side.getBoundingClientRect();
        if (sr.width < 8 || sr.height < 8) return 0;
        const candidates = [
            document.querySelector('#defectModal.open .defect-drawer-card'),
            document.getElementById('mobileMapDock')
        ];
        let need = 0;
        candidates.forEach((el) => {
            if (!el) return;
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            if (r.right <= sr.left + 1 || r.left >= sr.right - 1) return; // 목록창과 가로로 겹치지 않음(우측 서랍 등)
            if (r.bottom <= sr.top || r.top >= sr.bottom) return;
            need = Math.max(need, sr.bottom - Math.max(r.top, sr.top));
        });
        return Math.max(0, Math.round(need));
    }

    let defectListObstructTimers = [];
    function syncDefectListObstruction() {
        const root = document.documentElement;
        const px = computeDefectListObstruction();
        if (px > 0) {
            root.style.setProperty('--bsa-list-obstruct', `${px}px`);
            root.classList.add('bsa-list-obstructed');
        } else {
            root.style.removeProperty('--bsa-list-obstruct');
            root.classList.remove('bsa-list-obstructed');
        }
    }
    function scheduleDefectListObstructionSync() {
        defectListObstructTimers.forEach((t) => window.clearTimeout(t));
        defectListObstructTimers = [];
        syncDefectListObstruction();
        // 시트가 올라오는 전환(0.28s)이 끝난 뒤와 툴바 재배치 뒤에 한 번 더 맞춘다
        [120, 360, 700].forEach((ms) => {
            defectListObstructTimers.push(window.setTimeout(syncDefectListObstruction, ms));
        });
    }
    function initDefectListObstructionSync() {
        if (window.__bsaDefectListObstructInit || !document.body) return;
        window.__bsaDefectListObstructInit = true;
        let wasOpen = document.body.classList.contains('defect-modal-open');
        if (typeof MutationObserver === 'function') {
            new MutationObserver(() => {
                const open = document.body.classList.contains('defect-modal-open');
                if (open === wasOpen) return;
                wasOpen = open;
                scheduleDefectListObstructionSync();
            }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
        window.addEventListener('resize', () => {
            if (document.body.classList.contains('defect-modal-open')) scheduleDefectListObstructionSync();
        });
        window.addEventListener('orientationchange', () => {
            if (document.body.classList.contains('defect-modal-open')) scheduleDefectListObstructionSync();
        });
        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(() => {
                if (document.body.classList.contains('defect-modal-open')) syncDefectListObstruction();
            });
            ['mobileMapDock', 'defectModal'].forEach((id) => {
                const el = document.getElementById(id);
                if (el) ro.observe(el);
            });
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDefectListObstructionSync);
    else initDefectListObstructionSync();

    function isDefectBulkEditMode() {
        return Array.isArray(window._defectBulkEditIds) && window._defectBulkEditIds.length > 1;
    }

    function clearDefectBulkEditState() {
        window._defectBulkEditIds = null;
        window._defectBulkChangedFields = null;
    }

    function markDefectBulkFieldChanged(fieldKey) {
        if (!isDefectBulkEditMode() || !fieldKey) return;
        if (!window._defectBulkChangedFields) window._defectBulkChangedFields = new Set();
        window._defectBulkChangedFields.add(fieldKey);
        updateDefectBulkEditBanner();
    }

    function defectFieldKeyFromTarget(el) {
        if (!el || !el.id) {
            if (el && el.closest && el.closest('#defectCauseChecks')) return 'cause';
            if (el && el.closest && el.closest('#defectCrackMeasureList')) return 'crackMeasures';
            return null;
        }
        const map = {
            defectCategory: 'category',
            defectComponent: 'component',
            defectComponentInput: 'component',
            defectType: 'defectType',
            defectTypeInput: 'defectType',
            defectLocation: 'location',
            defectSize: 'size',
            defectCause: 'cause',
            defectCauseInput: 'cause',
            defectProgressCheck: 'isProgress',
            defectLeakCheck: 'isLeak',
            defectOpeningCrackCheck: 'isOpeningCrack',
            defectCarriedOver: 'isCarriedOver',
            defectBookmark: 'isBookmark',
            defectPriorityManage: 'isPriorityManage',
            defectForceArrowDir: 'forceArrowDir',
        };
        return map[el.id] || null;
    }

    function bulkFieldConsensus(defects, getter, normalize) {
        if (!defects.length) return { mixed: false, value: undefined };
        const norm = normalize || (v => v);
        const vals = defects.map(d => norm(getter(d)));
        const first = vals[0];
        const mixed = !vals.every(v => v === first);
        return { mixed, value: mixed ? undefined : first };
    }

    function bulkBoolConsensus(defects, getter) {
        const r = bulkFieldConsensus(defects, getter, v => !!v);
        if (r.mixed) return { mixed: true, value: null };
        return { mixed: false, value: !!r.value };
    }

    function getDefectCrackMeasureSignature(d) {
        if (!d) return '';
        let measures = [];
        if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
            measures = d.crackMeasures.map(m => ({
                w: String(m?.width ?? m?.w ?? '').trim(),
                l: String(m?.length ?? m?.l ?? '').trim(),
                n: String(m?.count ?? m?.n ?? '').trim(),
                j: normalizeMeasureJoin(m?.join),
            }));
        } else {
            const ws = String(d.crackWidth || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const ls = String(d.crackLength || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const ns = String(d.itemCount || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const join = inferMeasureJoin(d, null);
            const n = Math.max(ws.length, ls.length, ns.length, 0);
            for (let i = 0; i < n; i++) {
                measures.push({
                    w: ws[i] || '',
                    l: ls[i] || '',
                    n: ns[i] || (i === 0 && ns.length === 1 ? ns[0] : ''),
                    j: join,
                });
            }
            if (!measures.length && String(d.itemCount || '').trim()) {
                measures.push({ w: '', l: '', n: String(d.itemCount).trim(), j: join });
            }
        }
        return JSON.stringify({ measures, size: String(d.size || '').trim() });
    }

    function getDefectsForBulkEdit() {
        if (!isDefectBulkEditMode() || !state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const list = state.defects[key] || [];
        return window._defectBulkEditIds
            .map(id => list.find(d => d.id === id))
            .filter(Boolean);
    }

    function setBulkMixedPlaceholder(input, mixed, placeholder) {
        if (!input) return;
        if (mixed) {
            input.value = '';
            input.placeholder = placeholder || '(선택마다 다름 — 변경 시 전체 적용)';
            input.dataset.bulkMixed = '1';
        } else {
            delete input.dataset.bulkMixed;
        }
    }

    function applyBulkBoolCheckbox(el, consensus) {
        if (!el) return;
        if (consensus.mixed) {
            el.checked = false;
            el.indeterminate = true;
            el.dataset.bulkMixed = '1';
        } else {
            el.indeterminate = false;
            el.checked = !!consensus.value;
            delete el.dataset.bulkMixed;
        }
    }

    function getBulkMixedFieldLabels(defects) {
        const labels = [];
        if (bulkFieldConsensus(defects, d => d.category || '구조체').mixed) labels.push('구조 분류');
        if (bulkFieldConsensus(defects, d => memberNameOut(d.component) || '').mixed) labels.push('부재 명칭');
        if (bulkFieldConsensus(defects, d => d.defectType || '').mixed) labels.push('결함 종류');
        if (bulkFieldConsensus(defects, d => d.cause || '').mixed) labels.push('발생 원인');
        if (bulkFieldConsensus(defects, d => extractDefectLocationDetail(d.location || '')).mixed) labels.push('상세 위치');
        if (bulkFieldConsensus(defects, d => d.size || '').mixed) labels.push('규모 및 상태');
        if (bulkFieldConsensus(defects, d => getDefectCrackMeasureSignature(d)).mixed) labels.push('폭·길이·개수');
        if (bulkBoolConsensus(defects, d => d.isProgress).mixed) labels.push('진행중');
        if (bulkBoolConsensus(defects, d => d.isLeak).mixed) labels.push('누수');
        if (bulkBoolConsensus(defects, d => d.isOpeningCrack).mixed) labels.push('개구부 결함');
        if (bulkBoolConsensus(defects, d => d.isCarriedOver).mixed) labels.push('전회차');
        if (bulkBoolConsensus(defects, d => d.isBookmark).mixed) labels.push('중요');
        if (bulkBoolConsensus(defects, d => d.isPriorityManage).mixed) labels.push('중점관리');
        return labels;
    }

    function updateDefectBulkEditBanner() {
        const banner = document.getElementById('defectBulkEditBanner');
        const mixedHint = document.getElementById('defectBulkEditMixedHint');
        if (!banner) return;
        if (!isDefectBulkEditMode()) {
            banner.hidden = true;
            if (mixedHint) mixedHint.hidden = true;
            return;
        }
        const defects = getDefectsForBulkEdit();
        const n = defects.length;
        const title = document.getElementById('defectBulkEditBannerTitle');
        if (title) title.textContent = `일괄 수정 (${n}건)`;
        banner.hidden = false;
        if (mixedHint) {
            const mixedLabels = getBulkMixedFieldLabels(defects);
            const changed = window._defectBulkChangedFields ? [...window._defectBulkChangedFields] : [];
            const parts = [];
            if (mixedLabels.length) parts.push(`항목마다 다름: ${mixedLabels.join(', ')}`);
            if (changed.length) parts.push(`적용 예정: ${changed.length}개 항목`);
            if (parts.length) {
                mixedHint.textContent = parts.join(' · ');
                mixedHint.hidden = false;
            } else {
                mixedHint.hidden = true;
            }
        }
    }

    function syncDefectBulkEditChrome(isBulk) {
        const form = document.getElementById('defectForm');
        if (form) form.classList.toggle('is-bulk-edit', !!isBulk);
        const banner = document.getElementById('defectBulkEditBanner');
        if (banner && !isBulk) banner.hidden = true;
        const badge = document.getElementById('defectAutosaveBadge');
        if (badge) badge.textContent = isBulk ? '변경 항목만 적용' : '자동 적용';
        [
            'btnDeleteDefect', 'btnAddAnotherMarking',
            'mobileBtnAddAnotherMarking', 'btnAssignSurveyNo', 'mobileBtnAssignSurveyNo',
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = isBulk ? 'none' : '';
        });
        const redrawBtn = document.getElementById('btnRedrawDefectPolygon');
        if (redrawBtn && isBulk) redrawBtn.hidden = true;
        if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
        if (isBulk) updateDefectBulkEditBanner();
    }

    function hydrateBulkDefectForm(defects) {
        const rep = defects[0];
        const pinIdEl = document.getElementById('defectPinId');
        const noEl = document.getElementById('defectNo');
        const catEl = document.getElementById('defectCategory');
        const locEl = document.getElementById('defectLocation');
        const sizeEl = document.getElementById('defectSize');
        const progCheckEl = document.getElementById('defectProgressCheck');
        const leakCheckEl = document.getElementById('defectLeakCheck');
        const openingCrackCheckEl = document.getElementById('defectOpeningCrackCheck');
        const carriedOverEl = document.getElementById('defectCarriedOver');
        const bookmarkEl = document.getElementById('defectBookmark');
        const priorityManageEl = document.getElementById('defectPriorityManage');
        const forceArrowDirEl = document.getElementById('defectForceArrowDir');
        const componentInput = document.getElementById('defectComponentInput');
        const typeInput = document.getElementById('defectTypeInput');
        const causeInput = document.getElementById('defectCauseInput');

        if (pinIdEl) pinIdEl.value = '';
        if (noEl) noEl.value = `선택 ${defects.length}건`;

        const cat = bulkFieldConsensus(defects, d => resolveDefectCategory(d.category));
        const comp = bulkFieldConsensus(defects, d => memberNameOut(d.component) || '');
        const type = bulkFieldConsensus(defects, d => d.defectType || '');
        const cause = bulkFieldConsensus(defects, d => d.cause || '');
        const loc = bulkFieldConsensus(defects, d => extractDefectLocationDetail(d.location || ''));
        const size = bulkFieldConsensus(defects, d => d.size || '');
        const measureSig = bulkFieldConsensus(defects, d => getDefectCrackMeasureSignature(d));

        const uiCategory = cat.mixed ? resolveDefectCategory(rep.category) : cat.value;
        if (catEl) catEl.value = uiCategory;
        populateDefectComponentDropdown(uiCategory, comp.mixed ? '' : (comp.value || ''));
        updateDefectTypeDropdown(uiCategory, type.mixed ? '' : (type.value || ''));
        updateDefectCauseDropdown(type.mixed ? '' : (type.value || ''), cause.mixed ? '' : (cause.value || ''));

        setBulkMixedPlaceholder(componentInput, comp.mixed);
        setBulkMixedPlaceholder(typeInput, type.mixed);
        setBulkMixedPlaceholder(causeInput, cause.mixed);
        if (locEl) {
            if (loc.mixed) {
                locEl.value = '';
                locEl.placeholder = '비우면 각 핀의 기존 위치 유지 · 입력 시 선택 전체에 동일 적용';
                locEl.dataset.bulkMixed = '1';
            } else {
                locEl.value = loc.value || '';
                locEl.placeholder = '비우면 층수만 · 입력 예: 기둥 C1 하부 → 지상1층 기둥 C1 하부';
                delete locEl.dataset.bulkMixed;
            }
        }
        if (sizeEl) {
            if (size.mixed) {
                sizeEl.value = '';
                sizeEl.placeholder = '(선택마다 다름 — 변경 시 전체 적용)';
                sizeEl.dataset.bulkMixed = '1';
                sizeEl.dataset.autoSize = '';
            } else {
                sizeEl.value = size.value || '';
                sizeEl.placeholder = '';
                delete sizeEl.dataset.bulkMixed;
            }
        }

        if (measureSig.mixed) {
            renderCrackMeasureRows([{ width: '', length: '', count: '', join: '/' }]);
        } else {
            setCrackMeasuresToUi(rep);
        }

        applyBulkBoolCheckbox(progCheckEl, bulkBoolConsensus(defects, d => d.isProgress));
        applyBulkBoolCheckbox(leakCheckEl, bulkBoolConsensus(defects, d => d.isLeak));
        applyBulkBoolCheckbox(openingCrackCheckEl, bulkBoolConsensus(defects, d => d.isOpeningCrack));
        applyBulkBoolCheckbox(carriedOverEl, bulkBoolConsensus(defects, d => d.isCarriedOver));
        applyBulkBoolCheckbox(bookmarkEl, bulkBoolConsensus(defects, d => d.isBookmark));
        applyBulkBoolCheckbox(priorityManageEl, bulkBoolConsensus(defects, d => d.isPriorityManage));
        if (forceArrowDirEl) {
            forceArrowDirEl.checked = false;
            forceArrowDirEl.indeterminate = false;
            forceArrowDirEl.disabled = true;
        }

        const allArea = defects.every(d => d.shapeType === 'area' && d.areaX1 !== undefined);
        if (allArea) {
            const fill = bulkFieldConsensus(defects, d => d.areaFillStyle || 'solid');
            const border = bulkFieldConsensus(defects, d => d.areaBorderStyle || 'solid');
            syncDefectAreaStyleUi(
                fill.mixed ? (rep.areaFillStyle || 'solid') : (fill.value || 'solid'),
                border.mixed ? (rep.areaBorderStyle || 'solid') : (border.value || 'solid')
            );
        }

        window._pendingPhotos = [];
        window._defectFormShownPhotoIds = null;
        window._pendingPrevRoundPhotos = [];
        window._pendingRepairPhotoIdx = -1;
        window._pendingPinCoords = null;
        window._pendingAreaRect = null;
        refreshDefectQuickPickBar();
        toggleDefectSizeInputMode();
        renderDefectPhotoSection();
        updateDefectBulkEditBanner();
    }

    function openBulkDefectEditModal() {
        pruneHiddenDefectSelection();   // 숨긴 마킹은 일괄 수정에서 빠진다
        const ids = [...selectedDefectIds];
        if (ids.length < 2 || !state.currentBuildingId) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const defects = ids.map(id => (state.defects[key] || []).find(d => d.id === id)).filter(Boolean);
        if (defects.length < 2) return;

        window._defectFormHydrating = true;
        window._jointGapKeepStructural = false; // 새로 연 창이면 접합부 이격 자동 전환을 다시 켠다
        window._plasterKeepStructural = false; // 2026-11-08 미장 → 비구조체 자동 전환도 새 창마다 다시 켠다
        window.clearTimeout(window._defectAutoApplyTimer);
        window._defectAutoApplyTimer = null;
        window._defectBulkEditIds = ids.slice();
        window._defectBulkChangedFields = new Set();
        clearDefectMarkingTemplate({ keepGroup: true });

        hydrateBulkDefectForm(defects);
        renderDefectMarkingTimeline(null);
        resetDefectDrawerScroll();

        const titleEl = document.getElementById('defectModalTitle');
        if (titleEl) titleEl.textContent = `📍 결함 핀 일괄 수정 (${defects.length}건)`;
        if (typeof window.syncDefectRenumberButton === 'function') window.syncDefectRenumberButton(null);

        const bulkAllArea = defects.every(d => d.shapeType === 'area' && d.areaX1 !== undefined);
        setDefectAreaStylePanelVisible(
            bulkAllArea,
            bulkAllArea && defects.some(d => getAreaShape(d) === 'polygon') ? 'polygon' : (defects[0] || 'rect')
        );

        window._defectPhotosDirty = false;
        window._defectEditSessionHistoryPushed = false;
        syncDefectBulkEditChrome(true);

        if (elements.defectModal) {
            syncDefectDrawerToCanvasArea();
            elements.defectModal.style.display = 'flex';
            document.body.classList.add('defect-modal-open');
            if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
            window.requestAnimationFrame(() => {
                syncDefectDrawerToCanvasArea();
                resetDefectDrawerScroll();
                if (elements.defectModal) elements.defectModal.classList.add('open');
                window._defectFormHydrating = false;
                drawCanvas();
                if (typeof renderDefectListPanel === 'function') {
                    renderDefectListPanel({ scrollToSelection: true });
                }
            });
        }
    }
    window.openBulkDefectEditModal = openBulkDefectEditModal;

    function closeDefectModal(options = {}) {
        const discardPending = !!(options && options.discardPending);
        if (discardPending) {
            if (window._defectAutoApplyTimer) {
                window.clearTimeout(window._defectAutoApplyTimer);
                window._defectAutoApplyTimer = null;
            }
            window._defectEditSessionHistoryPushed = false;
            window._defectPhotosDirty = false;
        } else {
            flushDefectAutoApply();
        }
        window._defectPhotoHydrateToken = (window._defectPhotoHydrateToken || 0) + 1;
        clearDefectMarkingTemplate();
        window._pendingPinCoords = null;
        window._pendingAreaRect = null;
        window._pendingPhotos = [];
        window._defectFormShownPhotoIds = null;
        window._pendingPrevRoundPhotos = [];
        window._pendingRepairPhotoIdx = -1;
        renderDefectMarkingTimeline(null);
        clearDefectBulkEditState();
        syncDefectBulkEditChrome(false);
        const pinIdEl = document.getElementById('defectPinId');
        if (pinIdEl) pinIdEl.value = '';
        document.body.classList.remove('defect-modal-open');
        if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
        if (elements.defectModal) {
            elements.defectModal.classList.remove('open');
            window.setTimeout(() => {
                if (elements.defectModal && !elements.defectModal.classList.contains('open')) {
                    elements.defectModal.style.display = 'none';
                    syncDefectDrawerToCanvasArea();
                }
            }, 280);
        }
        // 수정창을 닫으면 선택 해제 → 좌측 조사표 '선택됨' 상단 고정 해제
        // (단, 방금 새로 찍은 마킹은 선택·강조 유지 — applySelectionAfterDefectModalClose)
        applySelectionAfterDefectModalClose(discardPending);
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
        else if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        drawCanvas();
    }
    window.closeDefectModal = closeDefectModal;

    function isMeasureKeypadTarget(target) {
        const kp = window.BsaMeasureKeypad;
        if (kp && typeof kp.isKeypadElement === 'function') return kp.isKeypadElement(target);
        return !!(target && typeof target.closest === 'function' && target.closest('#bsaMeasureKeypad, .bsa-measure-keypad'));
    }

    // 도면 밖(목록·헤더 등) 터치/클릭 시에도 결함 입력창 닫기
    function shouldKeepDefectModalForTarget(target) {
        if (!target || typeof target.closest !== 'function') return false;
        if (target.closest('#defectModal .defect-drawer-card')) return true;
        // 폭·길이·개수 키패드는 body에 붙어 있어 창 밖으로 보인다 — 키를 누를 때 창이 닫히던 문제(2026-09-29)
        if (isMeasureKeypadTarget(target)) return true;
        // 앱 확인 창(삭제 확인 등)도 body에 붙는다 — 확인/취소 누를 때 결함 창이 닫히지 않게
        if (target.closest('#bsaAppDialog')) return true;
        // 톱니바퀴 프리셋 세팅 창도 수정창 밖 형제 요소다 — 세팅 중 수정창이 닫히던 문제
        if (target.closest('#optionManagerModal')) return true;
        // 2026-11-06 직접 입력 자식 팝업(완료/취소)도 body에 붙는다 — 누르면 부모 수정창이 같이 닫히던 문제
        if (typeof window !== 'undefined' && window.BsaTypingPopup && typeof window.BsaTypingPopup.isElement === 'function' && window.BsaTypingPopup.isElement(target)) return true;
        if (target.closest('#bsaTypingPopup') || target.closest('.bsa-typing-overlay')) return true;
        if (typeof window !== 'undefined' && window.BsaFinishMemberChooser && typeof window.BsaFinishMemberChooser.isElement === 'function' && window.BsaFinishMemberChooser.isElement(target)) return true;
        if (target.closest('#bsaFinishMemberChooser') || target.closest('.bsa-finish-chooser-overlay')) return true;
        // 2026-10-19 접합부 부재(기둥·보…) 고르는 선택 목록 시트도 body에 붙는다 — 고를 때 수정창이 사라지던 문제
        if (target.closest('#bsaSelectSheet')) return true;
        // 2026-11-10 사진 크게 보기 창도 body에 붙는다 — 사진을 끌거나 단추를 누를 때 수정창이 닫히지 않게
        if (target.closest('#bsaPhotoViewer')) return true;
        // 2026-11-10 사진 위에 그리기 창도 수정창 밖 형제 요소다 — 그리려고 누르는 순간 수정창이 닫히지 않게
        if (target.closest('#photoAnnotationModal')) return true;
        if (target.closest('#defectMarkingMemberFloat')) return true;
        if (target.closest('#mobileMapDock')) return true;
        if (target.closest('.defect-list-item')) return true; // 목록에서 다른 결함 열기
        if (target.closest('#planCanvas')) return true; // 캔버스는 handleDragStart가 처리
        if (target.closest('#canvasContainer')) return true;
        return false;
    }

    document.addEventListener('pointerdown', (e) => {
        if (!isDefectModalOpen()) return;
        if (shouldKeepDefectModalForTarget(e.target)) return;
        closeDefectModal();
    }, true);

    function resetDefectDrawerScroll() {
        const body = document.querySelector('#defectModal .defect-drawer-body');
        if (!body) return;
        body.scrollTop = 0;
        if (typeof body.scrollTo === 'function') {
            try { body.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch (_e) { body.scrollTop = 0; }
        }
    }

    function openAddDefectModal(boxX, boxY, targetX, targetY, existingPin = null, areaRect = null, options = {}) {
        window._bsaNewMarkingKeepSelId = null; // 새 창마다 "방금 만든 마킹 유지" 표시 초기화
        clearDefectBulkEditState();
        syncDefectBulkEditChrome(false);
        if (typeof bindDefectHandwriteTabOrder === 'function') bindDefectHandwriteTabOrder();
        window._defectFormHydrating = true;
        window._jointGapKeepStructural = false; // 새로 연 창이면 접합부 이격 자동 전환을 다시 켠다
        // 2026-11-08 미장인데 구조체로 저장된 결함을 열면 그 선택을 존중(종류 칩을 더 눌러도 비구조체로 안 옮김)
        window._plasterKeepStructural = !!(existingPin && existingPin.category === '구조체' && window.bsaIsPlasterDefectType && window.bsaIsPlasterDefectType(existingPin.defectType));
        { const _oc = document.getElementById('defectOpeningCrackCheck'); if (_oc) delete _oc.dataset.openingManualOff; } // 새 창마다 「직접 끔」 기억 초기화
        // 사진이 다 내려왔는지는 폼을 다 채운 뒤에 판단한다. 그 전에 사진을 바꾸면 시각을 안 찍는다.
        window._defectPhotosComplete = false;
        // 이 창 열기의 번호. 사진을 기다리는 사이 다른 결함 창이 열리면, 옛 창의 마무리
        // (채우기 완료·기준값·사진 완전성)가 새 창에 덮이지 않게 번호로 가린다(2026-09-21 감사).
        const defectModalOpenSeq = (window._defectModalOpenSeq = (window._defectModalOpenSeq || 0) + 1);
        window._defectPhotoHydrateToken = (window._defectPhotoHydrateToken || 0) + 1;
        window.clearTimeout(window._defectAutoApplyTimer);
        window._defectAutoApplyTimer = null;
        resetDefectDrawerScroll();

        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const defects = getFloorDefectsForNumbering(key);

        const pinIdEl = document.getElementById('defectPinId');
        const noEl = document.getElementById('defectNo');
        const catEl = document.getElementById('defectCategory');
        const compEl = document.getElementById('defectComponent');
        const locEl = document.getElementById('defectLocation');
        const sizeEl = document.getElementById('defectSize');
        const progCheckEl = document.getElementById('defectProgressCheck');
        const leakCheckEl = document.getElementById('defectLeakCheck');
        const openingCrackCheckEl = document.getElementById('defectOpeningCrackCheck');
        const carriedOverEl = document.getElementById('defectCarriedOver');
        const bookmarkEl = document.getElementById('defectBookmark');
        const priorityManageEl = document.getElementById('defectPriorityManage');
        const forceArrowDirEl = document.getElementById('defectForceArrowDir');

        if (forceArrowDirEl) forceArrowDirEl.disabled = false;
        // 새로 연 창은 자동 원인 기록 없음
        window._defectAutoCauses = [];

        let photoHydratePromise = Promise.resolve();
        if (existingPin) {
            if (pinIdEl) pinIdEl.value = existingPin.id;
            if (noEl) {
                noEl.value = existingPin.no || 'NO.01';
                noEl.dataset.autoNo = '';
            }
            if (catEl) catEl.value = existingPin.category === '' ? '' : resolveDefectCategory(existingPin.category);
            const compCatExisting = existingPin.category === '' ? '' : resolveDefectCategory(existingPin.category);
            // 저장된 부재가 비어 있으면 공란 유지(과거처럼 기둥으로 채우지 않음)
            populateDefectComponentDropdown(compCatExisting, memberNameOut(existingPin.component) || '');
            updateDefectTypeDropdown(existingPin.category || '구조체', existingPin.defectType);
            updateDefectCauseDropdown(existingPin.defectType || '균열', existingPin.cause);
            if (carriedOverEl) carriedOverEl.checked = !!existingPin.isCarriedOver;
            if (locEl) locEl.value = extractDefectLocationDetail(existingPin.location || '');
            if (sizeEl) sizeEl.value = existingPin.size || '';
            setCrackMeasuresToUi(existingPin);
            if (sizeEl) {
                const composed = composeDefectSizeFromMeasures();
                // 저장된 규모가 측정값 표기뿐이면(조립 글자와 모양만 달라도) 폭·길이·개수를 고칠 때 같이 바뀐다
                sizeEl.dataset.autoSize = (composed && ((existingPin.size || '') === composed
                    || isMeasureOnlySizeText(existingPin.size))) ? '1' : '';
            }
            if (progCheckEl) progCheckEl.checked = !!existingPin.isProgress;
            if (leakCheckEl) leakCheckEl.checked = !!existingPin.isLeak;
            if (openingCrackCheckEl) openingCrackCheckEl.checked = !!existingPin.isOpeningCrack;
            setDefectOpeningPosUi(existingPin.openingPos || '');
            if (bookmarkEl) bookmarkEl.checked = !!existingPin.isBookmark;
            if (priorityManageEl) priorityManageEl.checked = !!existingPin.isPriorityManage;
            if (forceArrowDirEl) forceArrowDirEl.checked = !!existingPin.forceArrowDir;
            setDefectArrowOctant(existingPin.arrowOctant);
            syncDefectArrowDirUi();

            window._pendingPhotos = Array.isArray(existingPin.photos) ? existingPin.photos.filter(Boolean).slice() : [];
            window._pendingRepairPhotoIdx = getDefectRepairPhotoIndex(existingPin);
            window._pendingPrevRoundPhotos = Array.isArray(existingPin.prevRoundPhotos)
                ? existingPin.prevRoundPhotos.filter(Boolean).slice()
                : [];
            noteDefectFormShownPhotos(existingPin);
            if (typeof ensureDefectPhotosLoaded === 'function') {
                const needsPhotoHydrate = (
                    window._pendingPhotos.length === 0 && existingPin.photoIds && existingPin.photoIds.length > 0
                ) || (
                    window._pendingPrevRoundPhotos.length === 0 && existingPin.prevRoundPhotoIds && existingPin.prevRoundPhotoIds.length > 0
                );
                if (needsPhotoHydrate) renderDefectPhotoSection({ loading: true });
                const hydrateToken = ++window._defectPhotoHydrateToken;
                const hydratePinId = existingPin.id;
                photoHydratePromise = ensureDefectPhotosLoaded(existingPin).then(() => {
                    // 다른 결함으로 바뀌었거나, 사용자가 이미 사진을 지움/추가했으면 덮어쓰지 않음
                    if (hydrateToken !== window._defectPhotoHydrateToken) return;
                    const pinIdNow = document.getElementById('defectPinId')?.value;
                    if (hydratePinId && pinIdNow && pinIdNow !== hydratePinId) return;
                    if (window._defectPhotosDirty) {
                        renderDefectPhotoSection();
                        return;
                    }
                    if (!needsPhotoHydrate) {
                        renderDefectPhotoSection();
                        return;
                    }
                    const loadedCurr = Array.isArray(existingPin.photos) ? existingPin.photos.filter(Boolean).slice() : [];
                    const loadedPrev = Array.isArray(existingPin.prevRoundPhotos)
                        ? existingPin.prevRoundPhotos.filter(Boolean).slice()
                        : [];
                    const keepExtra = (loaded, pending) => (pending || []).filter(p => p && loaded.indexOf(p) < 0);
                    window._pendingPhotos = loadedCurr.concat(keepExtra(loadedCurr, window._pendingPhotos));
                    window._pendingPrevRoundPhotos = loadedPrev.concat(keepExtra(loadedPrev, window._pendingPrevRoundPhotos));
                    noteDefectFormShownPhotos(existingPin);
                    renderDefectPhotoSection();
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                }).catch(() => {});
            }
            if (existingPin.shapeType === 'area' && existingPin.areaX1 !== undefined) {
                ensureAreaPinPlacement(existingPin);
                window._pendingAreaRect = {
                    x1: existingPin.areaX1, y1: existingPin.areaY1,
                    x2: existingPin.areaX2, y2: existingPin.areaY2,
                    areaShape: existingPin.areaShape || 'rect',
                    areaAngle: existingPin.areaAngle || 0,
                    areaPoints: existingPin.areaPoints
                };
                window._pendingPinCoords = {
                    x: existingPin.x,
                    y: existingPin.y,
                    targetX: existingPin.targetX,
                    targetY: existingPin.targetY
                };
                const angEl = document.getElementById('defectAreaAngle');
                if (angEl) angEl.value = String(Math.round(Number(existingPin.areaAngle) || 0));
            } else {
                window._pendingAreaRect = null;
                window._pendingPinCoords = { x: existingPin.x, y: existingPin.y, targetX: existingPin.targetX, targetY: existingPin.targetY };
            }
        } else {
            const defectNoStr = getNextDefectNoStr(defects);

            // 커밋 전에 PAN으로 바뀌어도 groupId가 유지되도록 먼저 스냅샷 (빈 tmpl이면 기존 pending 유지)
            if (window._defectMarkingTemplate) {
                snapshotMarkingGroupForCommit(window._defectMarkingTemplate);
            }

            // "마킹 추가"로 이어서 등록하는 경우, 직전 결함의 부재/종류/원인/규모를 그대로 이어받는다
            const pendingGrp = getActiveMarkingGroup();
            const tmpl = window._defectMarkingTemplate
                || (pendingGrp && pendingGrp.groupId ? pendingGrp : null);

            if (pinIdEl) pinIdEl.value = '';
            if (noEl) {
                noEl.value = (tmpl && tmpl.groupId) ? (tmpl.groupNo || defectNoStr) : defectNoStr;
                // 외부 면을 서버에서 늦게 받아 오면 이 값 그대로일 때만 다시 매긴다(refreshNewDefectAutoNo)
                noEl.dataset.autoNo = (tmpl && tmpl.groupId) ? '' : defectNoStr;
                // 외부 면: 그사이 다른 사람이 다른 외부 면에 올린 번호까지 받아 다시 매긴다(두 사람이 동시에 찍을 때 겹침, 2026-11-09)
                if (noEl.dataset.autoNo && typeof window.pullExteriorPeersForNewDefect === 'function') {
                    try { window.pullExteriorPeersForNewDefect(); } catch (_e) { /* 번호는 지금 값 그대로 */ }
                }
            }
            const defaultCat = tmpl ? inheritDefectCategory(tmpl) : '';
            if (catEl) catEl.value = defaultCat;
            populateDefectComponentDropdown(defaultCat, tmpl ? (memberNameOut(tmpl.component) || '') : '');
            updateDefectTypeDropdown(defaultCat, tmpl ? (tmpl.defectType || '') : '');
            updateDefectCauseDropdown(tmpl ? (tmpl.defectType || '') : '', tmpl ? (tmpl.cause || '') : '');
            if (carriedOverEl) carriedOverEl.checked = false;
            if (locEl) locEl.value = tmpl ? extractDefectLocationDetail(tmpl.location || '') : '';
            if (sizeEl) sizeEl.value = (tmpl && tmpl.size) || '';
            setCrackMeasuresToUi(tmpl || null);
            if (sizeEl) {
                const composed = composeDefectSizeFromMeasures();
                sizeEl.dataset.autoSize = (composed && ((tmpl && tmpl.size) || '') === composed) ? '1' : (composed && !(tmpl && tmpl.size) ? '1' : '');
            }
            if (progCheckEl) progCheckEl.checked = false;
            if (leakCheckEl) leakCheckEl.checked = false;
            if (openingCrackCheckEl) openingCrackCheckEl.checked = false;
            setDefectOpeningPosUi('');
            if (bookmarkEl) bookmarkEl.checked = false;
            if (priorityManageEl) priorityManageEl.checked = false;
            if (tmpl && tmpl.groupId) {
                if (forceArrowDirEl) forceArrowDirEl.checked = false;
                setDefectArrowOctant(0);
            } else {
                if (forceArrowDirEl) forceArrowDirEl.checked = !!(tmpl && tmpl.forceArrowDir);
                setDefectArrowOctant(tmpl && tmpl.arrowOctant);
            }
            syncDefectArrowDirUi();
            window._pendingPhotos = [];
            window._defectFormShownPhotoIds = null;
        window._defectFormShownPhotoIds = null;
            window._pendingPrevRoundPhotos = [];
            window._pendingRepairPhotoIdx = -1;

            if (areaRect) {
                if (locEl && !tmpl) {
                    locEl.value = '';
                }
                const ax1 = Math.min(areaRect.x1, areaRect.x2);
                const ay1 = Math.min(areaRect.y1, areaRect.y2);
                const ax2 = Math.max(areaRect.x1, areaRect.x2);
                const ay2 = Math.max(areaRect.y1, areaRect.y2);
                const cx = (ax1 + ax2) / 2;
                const cy = (ay1 + ay2) / 2;
                const areaCat = tmpl ? inheritDefectCategory(tmpl) : readDefectCategoryUi();
                const areaNo = noEl?.value || 'NO.01';
                const areaStyleKey = getDefectStyleKey(areaCat, tmpl ? (tmpl.defectType || '') : '');
                const areaScale = getStyleSize(areaStyleKey).pin;
                const areaLabel = formatDefectPinLabel({ no: areaNo, defectType: tmpl ? tmpl.defectType : '' }, areaStyleKey);
                const boxPos = computePinBoxAboveTarget(cx, ay1, areaLabel, areaScale, state.ctx, 1);
                window._pendingAreaRect = {
                    x1: ax1, y1: ay1, x2: ax2, y2: ay2,
                    areaShape: areaRect.areaShape || 'rect',
                    areaAngle: areaRect.areaAngle || 0,
                    areaPoints: areaRect.areaPoints || null
                };
                const useGroupBox = !!(tmpl && tmpl.groupId && Number.isFinite(tmpl.boxX) && Number.isFinite(tmpl.boxY));
                const boxXUse = useGroupBox ? tmpl.boxX : boxPos.boxX;
                const boxYUse = useGroupBox ? tmpl.boxY : boxPos.boxY;
                const attach = getAreaCenterBorderAttachDefect(boxXUse, boxYUse, {
                    areaX1: ax1, areaY1: ay1, areaX2: ax2, areaY2: ay2,
                    areaShape: window._pendingAreaRect.areaShape,
                    areaAngle: window._pendingAreaRect.areaAngle,
                    areaPoints: window._pendingAreaRect.areaPoints
                });
                window._pendingPinCoords = { x: boxXUse, y: boxYUse, targetX: attach.x, targetY: attach.y };
                const angElNew = document.getElementById('defectAreaAngle');
                if (angElNew) angElNew.value = String(Math.round(Number(areaRect.areaAngle) || 0));
            } else {
                const tX = targetX !== undefined ? targetX : (boxX - 35);
                const tY = targetY !== undefined ? targetY : (boxY + 35);
                if (locEl) {
                    locEl.value = '';
                }
                window._pendingAreaRect = null;
                // 마킹 추가 체인이면 박스 위치는 그룹의 공유 위치로 고정하고, 클릭한 지점은 화살표 끝(target)으로만 사용
                const grp = getActiveMarkingGroup() || tmpl;
                const useGroupBox = !!(grp && grp.groupId && Number.isFinite(grp.boxX) && Number.isFinite(grp.boxY));
                window._pendingPinCoords = {
                    x: useGroupBox ? grp.boxX : boxX,
                    y: useGroupBox ? grp.boxY : boxY,
                    targetX: tX,
                    targetY: tY
                };
            }
        }

        try {
            if (typeof applyGridAutoLocationToModal === 'function') applyGridAutoLocationToModal(locEl, existingPin || null);
        } catch (gridErr) {
            console.warn('[grid-lines] modal', gridErr);
        }

        renderDefectMarkingTimeline(existingPin || null);

        // 결함 등록화면이 닫혀있는 동안 휴대폰에서 미리 찍어둔 사진(대기함)을 지금 여는 결함에 자동으로 붙임
        if (window._phoneRelayInbox && window._phoneRelayInbox.length) {
            window._pendingPhotos = (window._pendingPhotos || []).concat(window._phoneRelayInbox);
            window._phoneRelayInbox = [];
        }
        if (typeof updatePhoneRelayButtonLabel === 'function') updatePhoneRelayButtonLabel();
        renderDefectPhotoSection();

        const titleEl = document.getElementById('defectModalTitle');
        if (titleEl) {
            const isAreaTitle = !!(existingPin && existingPin.shapeType === 'area' && existingPin.areaX1 !== undefined);
            if (!existingPin) titleEl.textContent = '📍 결함 핀 등록';
            else titleEl.textContent = isAreaTitle ? '⬚ 결함 영역 수정' : '📍 결함 핀 수정';
        }
        if (typeof window.syncDefectRenumberButton === 'function') window.syncDefectRenumberButton(existingPin || null);
        if (typeof syncDefectShapeConvertButton === 'function') syncDefectShapeConvertButton(existingPin || null);

        const isAreaModal = !!(existingPin && existingPin.shapeType === 'area' && existingPin.areaX1 !== undefined) || !!areaRect || !!window._pendingAreaRect;
        const areaShapeHint = existingPin
            || (areaRect && { areaShape: areaRect.areaShape })
            || (window._pendingAreaRect && { areaShape: window._pendingAreaRect.areaShape })
            || 'rect';
        setDefectAreaStylePanelVisible(isAreaModal, areaShapeHint);
        if (isAreaModal) {
            const src = existingPin || window._defectMarkingTemplate || null;
            syncDefectAreaStyleUi(
                (src && src.areaFillStyle) || state.areaFillStyle || 'solid',
                (src && src.areaBorderStyle) || state.areaBorderStyle || 'solid'
            );
        }

        window._defectPhotosDirty = false;
        window._defectEditSessionHistoryPushed = !!existingPin ? false : true;

        if (elements.defectModal) {
            syncDefectDrawerToCanvasArea();
            elements.defectModal.style.display = 'flex';
            document.body.classList.add('defect-modal-open');
            if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
            window.requestAnimationFrame(async () => {
                // 그 사이 다른 결함 창이 열렸으면 이 창은 이미 바뀌었다 — 새 핀을 만들거나 마무리하지 않는다
                if (defectModalOpenSeq !== window._defectModalOpenSeq) return;
                syncDefectDrawerToCanvasArea();
                resetDefectDrawerScroll();
                if (elements.defectModal) elements.defectModal.classList.add('open');
                // 신규 마킹은 모달을 여는 순간 바로 저장해, 저장 버튼 없이 도면에 확정한다
                let createdPin = null;
                if (!existingPin) {
                    createdPin = await commitDefectFromForm({ pushHistory: true, uploadPhotos: false });
                    if (createdPin) {
                        const pinIdFresh = document.getElementById('defectPinId');
                        if (pinIdFresh) pinIdFresh.value = createdPin.id;
                        window._defectEditSessionHistoryPushed = true;
                        renderDefectMarkingTimeline(createdPin);
                    }
                }
                const targetPinEarly = existingPin || createdPin;
                const wantReveal = !(options && options.revealMarkingAboveDrawer === false);
                const isBottom = typeof isDefectDrawerBottomLayout === 'function' && isDefectDrawerBottomLayout();
                const isCompact = (typeof layoutIsCompactWidth === 'function' && layoutIsCompactWidth())
                    || (typeof layoutIsMobileWidth === 'function' && layoutIsMobileWidth())
                    || !layoutIsPcLike();
                // 모바일·하단 드로어: 수정창이 뜨면 해당 마킹이 보이게 도면 이동 (사진 hydrate 전에 먼저)
                if (targetPinEarly && wantReveal && !options.noCanvasReveal && (isCompact || isBottom || options.fromCanvas)) {
                    scheduleRevealMarkingAboveDrawer(targetPinEarly, { animate: true });
                }

                await photoHydratePromise;
                // 기다리는 사이 다른 결함 창이 열렸으면 그 창의 마무리가 따로 돈다 — 여기서 손대지 않는다.
                // (안 막으면 새 창이 아직 채워지는 중인데 "완료"로 바뀌어 덜 채운 값이 자동 저장될 수 있다)
                if (defectModalOpenSeq !== window._defectModalOpenSeq) return;
                // 폼이 보여준 값을 기준으로 기록 — 저장 때 이 값 그대로면 "안 건드린 칸"
                captureDefectFormBaseline(existingPin || null);
                // 사진이 다 내려왔는지. 덜 내려온 상태에서 사진을 바꾸면 못 받은 사진까지 "지운 것"이
                // 되므로, 그때는 사진 변경 시각(photosUpdatedAt)을 찍지 않는다(병합이 예전처럼 합침).
                window._defectPhotosComplete = !existingPin || (
                    (Array.isArray(window._pendingPhotos) ? window._pendingPhotos.filter(Boolean).length : 0)
                    >= (Array.isArray(existingPin.photoIds) ? existingPin.photoIds.length : 0)
                );
                window._defectFormHydrating = false;
                if (window._defectPhotosDirty) scheduleDefectAutoApply();
                drawCanvas();
                if (typeof renderDefectListPanel === 'function') {
                    renderDefectListPanel({ scrollToSelection: wantReveal });
                }
                if (wantReveal) scheduleRevealDefectListAboveDrawer();

                const targetPin = existingPin || createdPin || targetPinEarly;
                if (targetPin && wantReveal && !options.noCanvasReveal && (isCompact || isBottom || options.fromCanvas
                    || (typeof isDefectMarkingCoveredByDrawer === 'function' && isDefectMarkingCoveredByDrawer(targetPin)))) {
                    scheduleRevealMarkingAboveDrawer(targetPin, { animate: false });
                }
                resetDefectDrawerScroll();
            });
        }
    }

    function renderDefectPhotoSlot(kind, photos) {
        const isPrev = kind === 'prev';
        const frame = document.getElementById(isPrev ? 'defectPrevMainFrame' : 'defectCurrMainFrame');
        const extra = document.getElementById(isPrev ? 'defectPrevExtraRow' : 'defectCurrExtraRow');
        if (!frame) return;

        // 2026-10-15 중점관리 마킹은 전회차 사진도 직접 넣고 뺄 수 있다(그 밖에는 가져오기·차수 전환으로만)
        const prevEditable = isPrev && isPrevPhotoEditableNow();
        const openFn = isPrev ? 'previewPrevRoundPhoto' : 'viewPendingPhoto'; // 누르면 크게 보기(확대·축소) — 그리기는 보기 창의 「그리기」
        const removeFn = isPrev ? (prevEditable ? 'removePendingPrevPhoto' : null) : 'removePendingPhoto';
        const addKind = isPrev ? (prevEditable ? 'prev' : null) : 'curr';
        const label = isPrev ? '전차' : '현차';
        const list = (photos || []).filter(Boolean);

        syncPrevPhotoAddBar(isPrev, prevEditable, list.length);
        if (list.length === 0) {
            frame.classList.remove('has-photo');
            if (isPrev && !prevEditable) {
                frame.innerHTML = `
                    <div class="defect-photo-empty-readonly">
                        <i class="fa-solid fa-clock-rotate-left"></i>
                        전회차 사진 없음
                    </div>
                `;
            } else {
                frame.innerHTML = `
                    <button type="button" class="defect-photo-empty-add" data-photo-kind="${addKind}">
                        <i class="fa-solid fa-image"></i>
                        사진 추가
                    </button>
                `;
                const emptyBtn = frame.querySelector('.defect-photo-empty-add');
                if (emptyBtn) {
                    emptyBtn.addEventListener('click', () => {
                        if (typeof window.triggerDefectPhotoPick === 'function') {
                            window.triggerDefectPhotoPick('gallery', addKind);
                        }
                    });
                }
            }
            if (extra) {
                extra.innerHTML = '';
                extra.style.display = 'none';
            }
            return;
        }

        frame.classList.add('has-photo');
        const removeMainBtn = !removeFn ? '' : `<button type="button" class="defect-photo-frame-remove" onclick="window.${removeFn}(0)" title="${label} 대표 삭제">×</button>`;
        const rotateMainBtns = isPrev ? '' : buildPhotoRotateButtonsHtml('onclick="window.rotatePendingPhoto(0, -1)"', 'onclick="window.rotatePendingPhoto(0, 1)"');
        frame.innerHTML = `
            <button type="button" class="defect-photo-thumb-btn" onclick="window.${openFn}(0)" title="${label} 대표 — 탭하여 확대">
                <img src="${list[0]}" alt="${label} 대표">
            </button>
            <span class="defect-photo-rep-badge">대표</span>
            <button type="button" class="defect-photo-save-btn" onclick="window.bsaDownloadDefectPhoto(event, '${isPrev ? 'prev' : 'curr'}', 0)" title="${label} 사진 저장(갤러리·다운로드)"><i class="fa-solid fa-download"></i></button>
            ${removeMainBtn}
            ${rotateMainBtns}
        `;

        if (!extra) return;
        if (list.length < 2) {
            extra.innerHTML = '';
            extra.style.display = 'none';
            return;
        }
        extra.style.display = 'grid';
        extra.innerHTML = list.slice(1).map((src, i) => {
            const idx = i + 1;
            const removeExtraBtn = !removeFn ? '' : `<button type="button" class="defect-photo-frame-remove" onclick="window.${removeFn}(${idx})" title="${label} ${idx + 1} 삭제">×</button>`;
            return `
                <div class="defect-photo-extra-item">
                    <button type="button" class="defect-photo-extra-open" onclick="window.${openFn}(${idx})" title="${label} ${idx + 1}">
                        <img src="${src}" alt="${label} ${idx + 1}">
                    </button>
                    <button type="button" class="defect-photo-save-btn sm" onclick="window.bsaDownloadDefectPhoto(event, '${isPrev ? 'prev' : 'curr'}', ${idx})" title="${label} ${idx + 1} 저장"><i class="fa-solid fa-download"></i></button>
                    ${removeExtraBtn}
                    ${isPrev ? '' : buildPhotoRotateButtonsHtml(`onclick="window.rotatePendingPhoto(${idx}, -1)"`, `onclick="window.rotatePendingPhoto(${idx}, 1)"`, 'photo-rotate-group-sm')}
                </div>
            `;
        }).join('');
    }

    function isPrevPhotoEditableNow() {
        const cb = document.getElementById('defectPriorityManage');
        if (!cb || !cb.checked) return false;
        if (typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode()) return false;
        return true;
    }

    /** 중점관리일 때 전차 칸 아래 「사진 추가 · 촬영」 줄 */
    function syncPrevPhotoAddBar(isPrev, editable, count) {
        if (!isPrev) return;
        const frame = document.getElementById('defectPrevMainFrame');
        if (!frame || !frame.parentNode) return;
        let bar = document.getElementById('defectPrevAddBar');
        const hint = document.querySelector('.defect-photo-slot-prev .defect-photo-slot-readonly-hint');
        if (hint) hint.textContent = editable ? '중점관리 · 직접 추가' : '보기 전용';
        if (!editable) { if (bar) bar.hidden = true; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'defectPrevAddBar';
            bar.className = 'defect-prev-add-bar';
            bar.style.cssText = 'display:flex;gap:.35rem;margin-top:.35rem;';
            bar.innerHTML = '<button type="button" class="btn btn-sm btn-outline" data-prev-pick="gallery" style="flex:1"><i class="fa-solid fa-image"></i> 전회차 사진</button>'
                + '<button type="button" class="btn btn-sm btn-outline" data-prev-pick="camera" title="촬영"><i class="fa-solid fa-camera"></i></button>';
            bar.addEventListener('click', (e) => {
                const b = e.target.closest('[data-prev-pick]');
                if (!b) return;
                e.preventDefault();
                e.stopPropagation();
                triggerDefectPhotoPick(b.getAttribute('data-prev-pick'), 'prev');
            });
            const extra = document.getElementById('defectPrevExtraRow');
            (extra || frame).insertAdjacentElement('afterend', bar);
        }
        bar.hidden = false;
        void count;
    }

    window.removePendingPrevPhoto = async function(idx) {
        if (!isPrevPhotoEditableNow()) return;
        if (!await window.confirmDelete('이 전회차 사진을 뺄까요?')) return;
        if (Array.isArray(window._pendingPrevRoundPhotos)) {
            window._pendingPrevRoundPhotos.splice(idx, 1);
            window._defectPhotosDirty = true;
            renderDefectPhotoSection();
            void persistOpenDefectPhotosNow();
            scheduleDefectAutoApply();
        }
    };

    function renderDefectPhotoSection(opts) {
        const loading = !!(opts && opts.loading);
        const loadingHint = document.getElementById('defectPhotoLoadingHint');
        const prev = (window._pendingPrevRoundPhotos || []).filter(Boolean);
        const curr = (window._pendingPhotos || []).filter(Boolean);

        if (loadingHint) loadingHint.style.display = loading ? 'flex' : 'none';

        const prevFrame = document.getElementById('defectPrevMainFrame');
        if (!prevFrame) {
            renderPhotoPreviewList();
            renderPrevRoundPhotoPreviewList();
            return;
        }

        renderDefectPhotoSlot('prev', prev);
        renderDefectPhotoSlot('curr', curr);
        syncRepairPhotoUi(curr.length);
        syncDefectSaveAllPhotosButton(prev.length + curr.length);
    }

    /**
     * 2026-10-20 중점관리 마킹의 「보수완료 사진」 — 현차 사진 중 하나를 보수완료 사진으로 고른다
     * (새로 넣기: 「보수완료 사진 추가」, 이미 넣은 사진: 사진 위 「보수완료」 단추). 고른 사진은
     * 3종 중점관리 비교표(한글)·조사표 화면 비교 칸의 금회차 자리에 들어가고, 그 마킹은 검정으로 그린다.
     */
    function isRepairPhotoEditableNow() {
        const cb = document.getElementById('defectPriorityManage');
        if (!cb || !cb.checked) return false;
        if (typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode()) return false;
        return true;
    }
    function syncRepairPhotoUi(count) {
        const frame = document.getElementById('defectCurrMainFrame');
        if (!frame || !frame.parentNode) return;
        const editable = isRepairPhotoEditableNow();
        const rIdx = typeof window._pendingRepairPhotoIdx === 'number' ? window._pendingRepairPhotoIdx : -1;
        const extra = document.getElementById('defectCurrExtraRow');
        const holders = [frame].concat(extra ? Array.from(extra.querySelectorAll('.defect-photo-extra-item')) : []);
        holders.forEach((h, i) => {
            if (i >= count) return;
            let b = h.querySelector('.defect-repair-photo-toggle');
            if (!editable) { if (b) b.remove(); return; }
            if (!b) {
                b = document.createElement('button');
                b.type = 'button';
                b.className = 'defect-repair-photo-toggle';
                b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); window.toggleRepairPhoto(Number(b.dataset.idx)); });
                h.appendChild(b);
            }
            const on = i === rIdx;
            b.dataset.idx = String(i);
            b.title = on ? '보수완료 사진 지정 풀기' : '이 사진을 보수완료 사진으로';
            b.textContent = on ? '✔ 보수완료' : '보수완료';
            b.style.cssText = 'position:absolute;left:4px;bottom:4px;z-index:3;font-size:.68rem;font-weight:800;padding:1px 6px;border-radius:9px;'
                + (on ? 'background:#111;color:#fff;border:1px solid #111;' : 'background:rgba(255,255,255,.9);color:#111;border:1px solid #555;');
            if (getComputedStyle(h).position === 'static') h.style.position = 'relative';
        });
        let bar = document.getElementById('defectRepairPhotoBar');
        if (!editable) { if (bar) bar.hidden = true; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'defectRepairPhotoBar';
            bar.className = 'defect-repair-photo-bar';
            bar.style.cssText = 'display:flex;gap:.35rem;margin-top:.35rem;';
            bar.innerHTML = '<button type="button" class="btn btn-sm btn-outline" data-repair-pick="gallery" style="flex:1;border-color:#111;color:#111"><i class="fa-solid fa-screwdriver-wrench"></i> 보수완료 사진 추가</button>'
                + '<button type="button" class="btn btn-sm btn-outline" data-repair-pick="camera" title="보수완료 사진 촬영" style="border-color:#111;color:#111"><i class="fa-solid fa-camera"></i></button>';
            bar.addEventListener('click', (e) => {
                const b = e.target.closest('[data-repair-pick]');
                if (!b) return;
                e.preventDefault();
                e.stopPropagation();
                triggerDefectPhotoPick(b.getAttribute('data-repair-pick'), 'repair');
            });
            (extra || frame).insertAdjacentElement('afterend', bar);
        }
        bar.hidden = false;
    }
    window.toggleRepairPhoto = function(idx) {
        if (!isRepairPhotoEditableNow()) return;
        const i = Number(idx);
        if (!Number.isInteger(i) || i < 0) return;
        window._pendingRepairPhotoIdx = window._pendingRepairPhotoIdx === i ? -1 : i;
        window._defectPhotosDirty = true;
        renderDefectPhotoSection();
        void persistOpenDefectPhotosNow();
        scheduleDefectAutoApply();
    };
    /** 수정창에서 고른 보수완료 사진(_pendingRepairPhotoIdx)을 결함에 적는다 — 번호와 사진 ID 둘 다 */
    function applyPendingRepairPhotoToDefect(d) {
        if (!d) return;
        const idx = window._pendingRepairPhotoIdx;
        if (typeof idx !== 'number') return;
        const photos = Array.isArray(d.photos) ? d.photos : [];
        if (idx >= 0 && photos[idx]) {
            d.repairPhotoNo = idx + 1;
            const pid = Array.isArray(d.photoIds) ? d.photoIds[idx] : null;
            if (pid) d.repairPhotoId = pid; else delete d.repairPhotoId;
        } else {
            delete d.repairPhotoNo;
            delete d.repairPhotoId;
        }
    }

    /** 2026-10-16 사진이 있으면 사진 칸 아래 「사진 모두 갤러리에 저장」(웹: 내려받기) */
    function syncDefectSaveAllPhotosButton(count) {
        const pair = document.querySelector('#defectModal .defect-photo-pair') || document.querySelector('.defect-photo-pair');
        if (!pair) return;
        let btn = document.getElementById('btnSaveAllDefectPhotos');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnSaveAllDefectPhotos';
            btn.className = 'btn btn-sm btn-outline defect-save-all-photos-btn';
            btn.addEventListener('click', (e) => { void window.bsaSaveAllDefectPhotos(e); });
            pair.insertAdjacentElement('afterend', btn);
        }
        const native = !!(window.Capacitor?.isNativePlatform?.());
        btn.innerHTML = `<i class="fa-solid fa-download"></i> 사진 ${count}장 모두 ${native ? '갤러리에 저장' : '내려받기'}`;
        btn.style.display = count > 0 ? '' : 'none';
    }

    function renderPhotoPreviewList() {
        const previewList = document.getElementById('photoPreviewList');
        if (!previewList) return;
        const photos = window._pendingPhotos || [];
        if (photos.length === 0) {
            previewList.innerHTML = '';
            return;
        }
        previewList.innerHTML = photos.map((src, idx) => `
            <div style="display:inline-block; position:relative; margin-right:12px; margin-top:8px; text-align:center;">
                <div style="position:relative; display:inline-block;">
                    <img src="${src}" style="width:75px; height:75px; object-fit:cover; border-radius:6px; border:1px solid #6b6b6b; cursor:pointer;" title="탭하여 크게 보기(확대·축소)" onclick="window.viewPendingPhoto(${idx})">
                    <span style="position:absolute; top:-6px; right:-6px; background:#ef4444; color:#fff; border-radius:50%; width:20px; height:20px; text-align:center; font-size:13px; font-weight:bold; cursor:pointer; line-height:20px;" onclick="window.removePendingPhoto(${idx})">×</span>
                </div>
                <button type="button" class="btn btn-sm btn-outline" style="display:block; width:75px; margin-top:4px; font-size:0.7rem; padding:0.1rem 0.2rem; border-color:#f43f5e; color:#fb7185;" onclick="window.annotatePendingPhoto(${idx})">
                    <i class="fa-solid fa-paintbrush"></i> 마킹
                </button>
            </div>
        `).join('');
    }

    function renderPrevRoundPhotoPreviewList() {
        const block = document.getElementById('prevRoundPhotoBlock');
        const list = document.getElementById('prevRoundPhotoPreviewList');
        if (!block || !list) return;
        const photos = (window._pendingPrevRoundPhotos || []).filter(Boolean);
        if (photos.length === 0) {
            block.style.display = 'none';
            list.innerHTML = '';
            return;
        }
        block.style.display = 'block';
        list.innerHTML = photos.map((src, idx) => `
            <div class="prev-round-photo-thumb-wrap">
                <span class="prev-round-photo-badge">전차</span>
                <img class="prev-round-photo-thumb" src="${src}" alt="전차 사진 ${idx + 1}" title="전차 사진 ${idx + 1} — 탭하여 확대" onclick="window.previewPrevRoundPhoto(${idx})">
                <div class="prev-round-photo-caption">전차 ${idx + 1}</div>
            </div>
        `).join('');
    }

    // 2026-11-10 「찍은 사진 눌러보면 막 그리게 되어 있는데 그거 말고 확대 축소 해서 볼 수 있게」
    // 사진을 누르면 크게 보기(js/shared/photo-zoom-viewer.js). 그리기(마킹)는 보기 창의 「그리기」 단추로.
    function openPhotoZoomViewer(photos, idx, label, onDraw) {
        const list = (photos || []).filter(Boolean);
        if (!list.length) return false;
        const api = window.BSA && window.BSA.photoZoomViewer;
        if (!api || typeof api.open !== 'function') return false;
        return api.open({ photos: list, index: idx, label, onDraw });
    }
    window.bsaOpenPhotoZoomViewer = openPhotoZoomViewer;

    window.previewPrevRoundPhoto = function(idx) {
        const src = window._pendingPrevRoundPhotos && window._pendingPrevRoundPhotos[idx];
        if (!src) return;
        // 화면의 번호는 빈 칸을 뺀 목록 기준(renderDefectPhotoSlot) — 보기 창도 같은 목록으로
        const list = (window._pendingPrevRoundPhotos || []).filter(Boolean);
        if (openPhotoZoomViewer(list, Math.max(0, list.indexOf(src)), '전차', null)) return;
        if (typeof window.openPhotoAnnotationModal === 'function') {
            window.openPhotoAnnotationModal(src, null);
        }
    };

    window.viewPendingPhoto = function(idx) {
        const src = window._pendingPhotos && window._pendingPhotos[idx];
        if (!src) return;
        const list = (window._pendingPhotos || []).filter(Boolean);
        const opened = openPhotoZoomViewer(list, Math.max(0, list.indexOf(src)), '현차', (viewIdx) => {
            const i = (window._pendingPhotos || []).indexOf(list[viewIdx]);
            if (i >= 0) window.annotatePendingPhoto(i);
        });
        if (!opened) window.annotatePendingPhoto(idx); // 보기 창을 못 쓰면 예전처럼
    };

    window.annotatePendingPhoto = function(idx) {
        if (window._pendingPhotos && window._pendingPhotos[idx]) {
            window.openPhotoAnnotationModal(window._pendingPhotos[idx], (annotatedDataUrl) => {
                window._pendingPhotos[idx] = annotatedDataUrl;
                window._defectPhotosDirty = true;
                renderDefectPhotoSection();
                void persistOpenDefectPhotosNow();
                scheduleDefectAutoApply();
            });
        }
    };

    window.removePendingPhoto = async function(idx) {
        // 2026-10-16 사진을 다 받기 전엔 지움 기록을 남길 수 없다 → 지운 사진이 다른 기기 것으로 되살아남. 받은 뒤에 지우게.
        if (window._defectPhotosComplete === false) {
            window.showToast?.('사진을 아직 다 받지 못했습니다. 사진을 다 받은 뒤(온라인에서 잠시 후) 다시 지워 주세요.', 'warning', 4500);
            return;
        }
        if (!await window.confirmDelete('이 사진을 삭제할까요?')) return;
        if (window._pendingPhotos) {
            window._pendingPhotos.splice(idx, 1);
            const rIdx = window._pendingRepairPhotoIdx;
            if (typeof rIdx === 'number' && rIdx >= 0) {
                if (rIdx === idx) window._pendingRepairPhotoIdx = -1;
                else if (idx < rIdx) window._pendingRepairPhotoIdx = rIdx - 1;
            }
            window._defectPhotosDirty = true;
            renderDefectPhotoSection();
            void persistOpenDefectPhotosNow();
            scheduleDefectAutoApply();
            if (typeof window.updateMapSelectedDefectPopup === 'function') window.updateMapSelectedDefectPopup();
        }
    };

    // @@PHOTO_ROTATE_START
    // 2026-09-28 사진 90° 회전 (결함 현차 사진·균열 게이지/팁 비교 사진·전경사진).
    // 회전 값을 따로 저장하지 않고 **회전된 그림으로 다시 만들어** 기존 사진 교체 경로(그림 그려 넣기와 같은 길)로
    // 저장한다 → URL이 바뀌어 새 사진 ID를 받고, 로컬(IndexedDB)·클라우드 업로드·PDF/한글/사진첩 출력이
    // 모두 새 그림을 그대로 쓴다. 브라우저는 <img>/캔버스에 그릴 때 EXIF 방향을 이미 적용하므로(화면에
    // 보이는 그대로가 캔버스에 들어감) 그 위에서 90°만 돌리고, 새 JPEG에는 EXIF가 없어 두 번 돌지 않는다.
    // 크기는 줄이지 않는다(캔버스 한계 대비 장축 PHOTO_ROTATE_MAX_EDGE 넘는 사진만 맞춤). 화질은 사진 추가와 같은 JPEG 품질.
    const PHOTO_ROTATE_MAX_EDGE = 4096;
    let _photoRotateBusy = false;

    function normalizePhotoRotateDir(dir) {
        return Number(dir) < 0 ? -1 : 1;
    }

    /** 회전 후 캔버스 크기 — 가로·세로 교체, 너무 큰 사진만 장축을 maxEdge로 맞춤 */
    function computePhotoRotateCanvasSize(w, h, maxEdge) {
        const srcW = Math.max(1, Math.round(Number(w) || 0));
        const srcH = Math.max(1, Math.round(Number(h) || 0));
        const cap = Number(maxEdge) > 0 ? Number(maxEdge) : PHOTO_ROTATE_MAX_EDGE;
        const long = Math.max(srcW, srcH);
        const k = long > cap ? cap / long : 1;
        const drawW = Math.max(1, Math.round(srcW * k));
        const drawH = Math.max(1, Math.round(srcH * k));
        return { canvasW: drawH, canvasH: drawW, drawW, drawH };
    }

    function photoRotateOutputMime(src) {
        return /^data:image\/png[;,]/i.test(String(src || '')) ? 'image/png' : 'image/jpeg';
    }

    function photoRotateJpegQuality() {
        return (typeof window.getPhotoJpegQuality === 'function') ? window.getPhotoJpegQuality() : 0.85;
    }

    /** dataURL은 그대로, Storage https·blob 주소는 바이트로 받아(한글 출력과 같은 CORS/프록시 경로) 그림으로 연다 */
    async function loadImageForPhotoRotate(src) {
        const raw = String(src || '').trim();
        if (!raw) throw new Error('사진이 없습니다.');
        let url = raw;
        let objUrl = null;
        if (!/^data:/i.test(raw)) {
            const pack = await imageSrcToBytes(raw);
            if (!pack || !pack.bytes) throw new Error('사진을 불러오지 못했습니다.');
            objUrl = URL.createObjectURL(new Blob([pack.bytes], { type: pack.mime || 'image/jpeg' }));
            url = objUrl;
        }
        try {
            return await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('사진을 불러오지 못했습니다.'));
                img.src = url;
            });
        } finally {
            if (objUrl) {
                try { URL.revokeObjectURL(objUrl); } catch (_e) { /* ignore */ }
            }
        }
    }

    /** 사진을 90° 돌린 새 dataURL. dir: -1 = 왼쪽(반시계), 1 = 오른쪽(시계) */
    async function rotatePhotoSrc90(src, dir) {
        const d = normalizePhotoRotateDir(dir);
        const img = await loadImageForPhotoRotate(src);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) throw new Error('사진 크기를 알 수 없습니다.');
        const size = computePhotoRotateCanvasSize(w, h, PHOTO_ROTATE_MAX_EDGE);
        const canvas = document.createElement('canvas');
        canvas.width = size.canvasW;
        canvas.height = size.canvasH;
        const ctx = canvas.getContext('2d');
        const mime = photoRotateOutputMime(src);
        if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(d * Math.PI / 2);
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, -size.drawW / 2, -size.drawH / 2, size.drawW, size.drawH);
        ctx.restore();
        const out = mime === 'image/png'
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', photoRotateJpegQuality());
        if (!out || !/^data:image\//.test(out)) throw new Error('회전한 사진을 만들지 못했습니다.');
        return out;
    }

    /** 공용: 회전 한 번에 하나만(연타로 옛 그림 위에 돌리는 일 방지). 끝나고 여전히 같은 사진일 때만 교체 */
    async function runPhotoRotate(opts) {
        if (!opts || typeof opts.getSrc !== 'function' || typeof opts.apply !== 'function') return false;
        const src = opts.getSrc();
        if (!src) return false;
        if (_photoRotateBusy) {
            if (typeof window.showToast === 'function') window.showToast('사진을 돌리는 중입니다. 잠시만 기다려 주세요.', 'info', 1500);
            return false;
        }
        _photoRotateBusy = true;
        try {
            const rotated = await rotatePhotoSrc90(src, opts.dir);
            if (opts.getSrc() !== src || (typeof opts.stillValid === 'function' && !opts.stillValid())) {
                if (typeof window.showToast === 'function') window.showToast('그 사이 사진이 바뀌어 회전을 취소했습니다.', 'info');
                return false;
            }
            await opts.apply(rotated, src);
            return true;
        } catch (e) {
            console.warn('사진 회전 실패:', e);
            if (typeof window.showToast === 'function') window.showToast('사진 회전에 실패했습니다. 사진을 다시 불러온 뒤 시도해 주세요.', 'error');
            return false;
        } finally {
            _photoRotateBusy = false;
        }
    }

    /** 사진 위 ⟲ ⟳ 버튼 HTML — onLeft/onRight는 인라인 onclick 문자열 또는 data 속성 문자열 */
    function buildPhotoRotateButtonsHtml(attrLeft, attrRight, extraClass) {
        return `<div class="photo-rotate-group${extraClass ? ` ${extraClass}` : ''}">`
            + `<button type="button" class="photo-rotate-btn" ${attrLeft} title="왼쪽으로 90° 회전" aria-label="왼쪽으로 90° 회전"><i class="fa-solid fa-rotate-left"></i></button>`
            + `<button type="button" class="photo-rotate-btn" ${attrRight} title="오른쪽으로 90° 회전" aria-label="오른쪽으로 90° 회전"><i class="fa-solid fa-rotate-right"></i></button>`
            + '</div>';
    }

    /** 결함 현차 사진 회전 — 그림 그려 넣기(annotatePendingPhoto)와 같은 저장 경로 */
    window.rotatePendingPhoto = function(idx, dir) {
        const list = window._pendingPhotos;
        const i = Number(idx);
        if (!Array.isArray(list) || !list[i]) return Promise.resolve(false);
        const pinAtStart = document.getElementById('defectPinId')?.value || '';
        return runPhotoRotate({
            dir,
            getSrc: () => (window._pendingPhotos === list ? list[i] : null),
            stillValid: () => {
                if (typeof isDefectModalOpen === 'function' && !isDefectModalOpen()) return false;
                const pinNow = document.getElementById('defectPinId')?.value || '';
                return !pinAtStart || pinNow === pinAtStart;
            },
            apply: (rotated) => {
                list[i] = rotated;
                window._defectPhotosDirty = true;
                renderDefectPhotoSection();
                void persistOpenDefectPhotosNow();
                scheduleDefectAutoApply();
            }
        });
    };

    /** 균열 게이지/팁 비교 사진 회전 — 사진 고르기와 같은 저장 경로(scheduleNdtCrackMonitorSave) */
    function getCrackMonitorPhotoState(kind, slot) {
        if (kind === 'gauge') return slot === 'prev' ? (window._crackGaugePrevPhoto || '') : (window._crackGaugeCurrPhoto || '');
        return slot === 'prev' ? (window._crackTipPrevPhoto || '') : (window._crackTipCurrPhoto || '');
    }

    function rotateCrackMonitorPhoto(kind, slot, dir) {
        const recAtStart = window._ndtCrackMonitorDefectId || '';
        return runPhotoRotate({
            dir,
            getSrc: () => getCrackMonitorPhotoState(kind, slot),
            stillValid: () => (window._ndtCrackMonitorDefectId || '') === recAtStart,
            apply: (rotated) => {
                setCrackMonitorPhotoState(kind, slot, rotated);
                renderCrackMonitorPhotoFrames();
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            }
        });
    }

    /**
     * 전경사진 회전 — 같은 ID로 덮으면 이미 올라간 사진은 다시 안 올라가고(isPhotoMarkedOnStorage)
     * 다른 기기 캐시도 옛 그림이 남는다. 그래서 새 ID로 추가(사진 추가와 같은 길) + 옛 사진 삭제(삭제와 같은 길).
     * 자리·설명은 그대로 둔다.
     */
    function rotateOverviewPhoto(photoId, dir) {
        const bldgId = window._overviewPhotosBuildingId;
        const findLive = () => {
            const b = (window.state.buildings || []).find((x) => x.id === bldgId);
            if (!b) return null;
            const list = getBuildingOverviewPhotos(b);
            const idx = list.findIndex((x) => x && x.id === photoId);
            if (idx < 0) return null;
            return { bldg: b, list, idx, item: list[idx] };
        };
        const srcOf = () => {
            const hit = findLive();
            if (!hit) return null;
            return hit.item.dataUrl || (window._photoCache && window._photoCache[getOverviewPhotoDocId(bldgId, photoId)]) || null;
        };
        if (typeof flushOverviewCaptionsFromDom === 'function') flushOverviewCaptionsFromDom();
        return runPhotoRotate({
            dir,
            getSrc: srcOf,
            stillValid: () => window._overviewPhotosBuildingId === bldgId,
            apply: async (rotated) => {
                const hit = findLive();
                if (!hit) return;
                const newItem = { ...hit.item, id: createOverviewPhotoId(), dataUrl: rotated };
                hit.list[hit.idx] = newItem;
                const newKey = getOverviewPhotoDocId(hit.bldg.id, newItem.id);
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[newKey] = rotated;
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                await persistPhotoUrlToIdb(newKey, rotated);
                uploadOverviewPhotos(hit.bldg);
                renderOverviewPhotosList({ force: true });
                await deleteOverviewPhotoStorage(hit.bldg.id, photoId);
            }
        });
    }
    window.rotateOverviewPhoto = rotateOverviewPhoto;
    // @@PHOTO_ROTATE_END

    // 전회차 사진은 수동 추가·삭제 불가 (가져오기·차수 전환으로만 설정)

    function dataUrlToJpegFile(dataUrl, name) {
        if (!dataUrl || typeof dataUrl !== 'string') return null;
        try {
            const parts = dataUrl.split(',');
            const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/jpeg';
            const bin = atob(parts[1] || '');
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new File([arr], name || `photo_${Date.now()}.jpg`, { type: mime });
        } catch (e) {
            console.warn('dataUrlToJpegFile failed', e);
            return null;
        }
    }

    /** 갤러리/카메라 분리 — Android WebView에서 capture 속성이 섞이지 않게 매번 새 input 사용 */
    function pickImageFileViaInput(mode) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/*';
            input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
            if (mode === 'camera') {
                input.setAttribute('capture', 'environment');
            }
            let done = false;
            const finish = (file) => {
                if (done) return;
                done = true;
                try { input.remove(); } catch (_e) { /* ignore */ }
                resolve(file || null);
            };
            input.addEventListener('change', () => finish(input.files && input.files[0]), { once: true });
            document.body.appendChild(input);
            input.click();
        });
    }

    async function pickImageFromDevice(mode) {
        const wantCamera = mode === 'camera';
        const Camera = window.Capacitor?.Plugins?.Camera;
        // 2026-11-10 앱 전용 촬영 화면(줌·촬영 버튼 자리·확인 버튼). 없거나(옛 APK) 못 열면 아래 순정 카메라로.
        const BsaCamera = window.Capacitor?.Plugins?.BsaCamera;
        if (wantCamera && BsaCamera && window.Capacitor?.isNativePlatform?.()
            && window.Capacitor?.isPluginAvailable?.('BsaCamera')) {
            try {
                const shot = await BsaCamera.takePhoto({
                    quality: 90,
                    longEdge: (typeof window.getPhotoLongEdge === 'function') ? window.getPhotoLongEdge() : 2000
                });
                if (shot?.cancelled) return null;
                if (shot?.dataUrl) {
                    // 순정 카메라 경로(saveToGallery)와 같이 휴대폰 갤러리에도 남긴다. 실패해도 첨부는 된다.
                    try {
                        const saving = window.Capacitor?.Plugins?.BsaGallery?.saveImage?.({ data: shot.dataUrl, fileName: `photo_${Date.now()}.jpg` });
                        if (saving && typeof saving.catch === 'function') saving.catch(() => {});
                    } catch (_e) { /* ignore */ }
                    return dataUrlToJpegFile(shot.dataUrl, `photo_${Date.now()}.jpg`);
                }
            } catch (err) {
                console.warn('BsaCamera.takePhoto fallback to stock camera:', err);
            }
        }
        if (Camera && window.Capacitor?.isNativePlatform?.()) {
            try {
                const result = await Camera.getPhoto({
                    quality: 90,
                    width: (typeof window.getPhotoLongEdge === 'function') ? window.getPhotoLongEdge() : 2000,
                    allowEditing: false,
                    resultType: 'dataUrl',
                    source: wantCamera ? 'CAMERA' : 'PHOTOS',
                    correctOrientation: true,
                    // 2026-10-16 앱에서 「촬영」한 사진은 휴대폰 갤러리에도 남긴다(갤러리에서 고른 사진은 다시 저장 안 함).
                    // 갤러리 저장이 실패해도 플러그인은 사진을 그대로 돌려주므로 첨부는 된다.
                    saveToGallery: wantCamera
                });
                if (result?.dataUrl) {
                    return dataUrlToJpegFile(result.dataUrl, `photo_${Date.now()}.jpg`);
                }
                return null;
            } catch (err) {
                const msg = String(err?.message || err || '');
                if (/cancel|Cancel|USER_CANCEL|dismiss/i.test(msg)) return null;
                console.warn('Camera.getPhoto fallback to file input:', err);
            }
        }
        const picked = await pickImageFileViaInput(mode);
        // 웹·PWA에서 카메라(capture)로 찍은 사진: 휴대폰이면 파일로 내려받아 갤러리(다운로드 폴더)에도 남긴다
        if (picked && wantCamera && !(window.Capacitor?.isNativePlatform?.())
            && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')) {
            try { void window.bsaSaveImageToDevice(picked, bsaPhotoFileName('촬영')); } catch (_e) { /* 첨부는 그대로 */ }
        }
        return picked;
    }

    /** 2026-10-16 사진 파일명: 건물_층_위치_결함_번호_시각 (파일명에 못 쓰는 글자는 _) */
    function bsaPhotoFileName(kind, extra) {
        const v = (id) => String(document.getElementById(id)?.value || '').trim();
        let bName = '';
        let floor = '';
        try {
            const b = (state.buildings || []).find((x) => x && x.id === state.currentBuildingId);
            bName = b ? (b.name || '') : '';
            floor = String(state.currentFloor || '');
            if (typeof formatFloorDisplay === 'function') floor = formatFloorDisplay(floor) || floor;
        } catch (_e) { /* ignore */ }
        const d = new Date();
        const ts = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
            + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
        const parts = [bName, floor, v('defectLocation'), v('defectComponentInput'), v('defectTypeInput') || v('defectType'), v('defectNo'), kind, extra, ts]
            .map((x) => String(x || '').replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''))
            .filter(Boolean);
        return (parts.join('_') || ('사진_' + ts)).slice(0, 120) + '.jpg';
    }
    window.bsaPhotoFileName = bsaPhotoFileName;

    async function bsaBlobToDataUrl(blob) {
        return await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => res(String(fr.result || ''));
            fr.onerror = () => rej(fr.error);
            fr.readAsDataURL(blob);
        });
    }

    /** 사진 원본 가져오기: data URL → 그대로, 주소 → 네트워크 → 캐시(SW) → 화면에 떠 있는 그림(오프라인) 순 */
    async function bsaResolvePhotoBlob(src, imgEl) {
        if (src instanceof Blob) return src;
        const s = String(src || '');
        if (!s) return null;
        if (s.startsWith('data:') || s.startsWith('blob:')) return await (await fetch(s)).blob();
        // Storage 주소: 로그인 토큰·REST·프록시 순으로 받는 기존 로더(버킷 CORS가 없어도 됨)
        const SA = window.BSA && window.BSA.storageAssets;
        if (navigator.onLine !== false && SA && typeof SA.isFirebaseStorageHttpUrl === 'function'
            && SA.isFirebaseStorageHttpUrl(s) && typeof SA.fetchUrlAsDataUrl === 'function') {
            try {
                const du = await SA.fetchUrlAsDataUrl(s);
                if (du && String(du).startsWith('data:')) return await (await fetch(du)).blob();
            } catch (_e) { /* 아래로 */ }
        }
        if (navigator.onLine !== false) {
            try {
                const r = await fetch(s, { mode: 'cors', cache: 'force-cache' });
                if (r.ok) return await r.blob();
            } catch (_e) { /* 캐시로 */ }
        }
        try {
            if (window.caches) {
                const hit = await caches.match(s, { ignoreSearch: false });
                if (hit) return await hit.blob();
            }
        } catch (_e) { /* 그림으로 */ }
        try {
            const img = imgEl || Array.from(document.images).find((im) => im.currentSrc === s || im.src === s);
            if (img && img.naturalWidth) {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.95));
            }
        } catch (_e) { /* 교차 출처 그림 등 */ }
        return null;
    }

    /**
     * 2026-10-16 사진을 기기에 저장: Android 앱(1.3.12+) → 갤러리(Pictures/스마트안전점검, MediaStore),
     * 웹·PC → 파일 다운로드. 성공 여부를 돌려준다(실패해도 다른 동작에는 영향 없음).
     */
    window.bsaSaveImageToDevice = async function(src, fileName, opts) {
        const quiet = !!(opts && opts.quiet);
        const name = fileName || bsaPhotoFileName('사진');
        try {
            const blob = await bsaResolvePhotoBlob(src, opts && opts.img);
            if (!blob) throw new Error('사진을 읽지 못했습니다');
            const native = window.Capacitor?.isNativePlatform?.();
            const G = window.Capacitor?.Plugins?.BsaGallery;
            if (native && G && typeof G.saveImage === 'function') {
                await G.saveImage({ data: await bsaBlobToDataUrl(blob), fileName: name });
                if (!quiet) window.showToast('갤러리에 저장했습니다 (사진 › 스마트안전점검)', 'success', 2500);
                return true;
            }
            if (native) {
                if (!quiet) window.showToast('갤러리 저장은 앱을 최신 버전(1.3.12 이상)으로 업데이트하면 됩니다', 'warning', 5000);
                return false;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = name; a.style.display = 'none';
            document.body.appendChild(a); a.click();
            setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (_e) { /* ignore */ } }, 4000);
            if (!quiet) window.showToast('사진을 내려받았습니다', 'success', 2000);
            return true;
        } catch (e) {
            console.warn('[사진 저장] 실패:', e);
            if (!quiet) window.showToast('사진 저장 실패: ' + (e && e.message ? e.message : e), 'error', 4000);
            return false;
        }
    };

    /**
     * 2026-10-16 여러 장을 한 번에: 앱(1.3.12+)은 공유창 없이 갤러리 「스마트안전점검」 앨범에 바로, 웹·PC는 파일로.
     * items: [{ src, name }]. 하나씩 차례로 저장하고 끝에 한 번만 알린다. 반환 { ok, fail }
     */
    window.bsaSavePhotosToDevice = async function(items) {
        const list = (items || []).filter((x) => x && x.src);
        if (!list.length) { window.showToast('저장할 사진이 없습니다', 'info', 2000); return { ok: 0, fail: 0 }; }
        const native = !!(window.Capacitor?.isNativePlatform?.());
        if (native && !(window.Capacitor?.Plugins?.BsaGallery)) {
            window.showToast('갤러리 바로 저장은 앱을 최신 버전(1.3.12 이상)으로 업데이트하면 됩니다', 'warning', 5000);
            return { ok: 0, fail: list.length };
        }
        let ok = 0;
        let fail = 0;
        for (let i = 0; i < list.length; i++) {
            const r = await window.bsaSaveImageToDevice(list[i].src, list[i].name, { quiet: true });
            if (r) ok += 1; else fail += 1;
            if (!native && i < list.length - 1) await new Promise((res) => setTimeout(res, 350));   // 브라우저 연속 다운로드 차단 완화
        }
        const where = native ? '갤러리(스마트안전점검)에' : '파일로';
        window.showToast(fail ? `${ok}장 ${where} 저장, ${fail}장 실패` : `${ok}장 ${where} 저장했습니다`, fail ? 'warning' : 'success', 3500);
        return { ok, fail };
    };

    /** 결함 창의 전차·현차 사진 전부 */
    window.bsaSaveAllDefectPhotos = function(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const items = [];
        const add = (arr, kind) => {
            const a = (arr || []).filter(Boolean);
            a.forEach((src, i) => items.push({ src, name: bsaPhotoFileName(kind, a.length > 1 ? String(i + 1) : '') }));
        };
        add(window._pendingPrevRoundPhotos, '전차');
        add(window._pendingPhotos, '현차');
        return window.bsaSavePhotosToDevice(items);
    };

    /** 결함 창 전차/현차 사진의 저장 버튼 */
    window.bsaDownloadDefectPhoto = function(ev, which, idx) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const list = which === 'prev' ? window._pendingPrevRoundPhotos : window._pendingPhotos;
        const src = list && list[idx];
        if (!src) return;
        const n = (list.length > 1) ? String(idx + 1) : '';
        void window.bsaSaveImageToDevice(src, bsaPhotoFileName(which === 'prev' ? '전차' : '현차', n));
    };

    /**
     * 사진을 고르는 순간 열려 있던 결함 — 사진은 줄이는 작업(압축)이 끝나야 붙는데, 그 사이 창이 닫히거나
     * 다른 결함 창으로 바뀌면 사진이 갈 곳을 잃고 조용히 버려졌다(2026-10-07 광주교회: 금회 추가 결함의
     * 사진이 서버·백업 어디에도 없었고 오류 기록도 0건. 샘플건축물에서 재현).
     */
    function captureDefectPhotoTarget() {
        return {
            open: isDefectModalOpen(),
            pinId: document.getElementById('defectPinId')?.value || '',
            seq: window._defectModalOpenSeq || 0,
            floorKey: state.currentBuildingId ? `${state.currentBuildingId}_${state.currentFloor}` : ''
        };
    }

    /** 지금 열린 창이 사진을 고를 때의 그 결함 창인가 */
    function isDefectPhotoTargetStillOpen(target) {
        if (!target || !target.open || !isDefectModalOpen()) return false;
        const pinNow = document.getElementById('defectPinId')?.value || '';
        // 새 결함은 첫 저장 때 id가 생긴다 — 같은 창(seq)이면 같은 결함
        if (!target.pinId) return (window._defectModalOpenSeq || 0) === target.seq;
        return pinNow === target.pinId;
    }

    /** 창이 이미 닫혔거나 바뀐 뒤 — 고를 때의 그 결함에 사진을 바로 붙여 저장한다. 못 붙이면 false. */
    async function attachPhotoToDefectDirect(target, url) {
        if (!target || !target.pinId || !target.floorKey || !url) return false;
        const d = (state.defects[target.floorKey] || []).find((x) => x && x.id === target.pinId);
        if (!d) return false;
        const before = captureDefectPhotoIdsBefore(d);
        // 사진 배열과 ID 목록의 자리를 맞춘다(아직 안 내려온 사진은 빈 칸으로 두고 ID는 지킨다)
        const ids = Array.isArray(d.photoIds) ? d.photoIds.slice() : [];
        const photos = Array.isArray(d.photos) ? d.photos.slice() : [];
        while (photos.length < ids.length) photos.push(null);
        for (let i = ids.length; i < photos.length; i++) ids[i] = defectPhotoIdAt(d, i);
        // 새 사진 한 장만 새 ID(기존 사진은 위에서 ID를 그대로 지켰다)
        let newId = assignDefectPhotoIds(d.id, [url], null)[0];
        while (ids.indexOf(newId) !== -1) newId = assignDefectPhotoIds(d.id, [url], null)[0];
        photos.push(url);
        ids.push(newId);
        d.photos = photos;
        d.photoIds = ids;
        recordDefectPhotoState(d, before.cur.visibleIds, d.photoIds);
        if (!d.inspectorName) d.inspectorName = window.state.userName || '';
        touchDefectUpdatedAt(d);
        if (!window._photoCache) window._photoCache = {};
        window._photoCache[newId] = url;
        markFloorKeyDirty(target.floorKey);
        saveStateToLocalStorage();
        await persistPhotoUrlToIdb(newId, url);
        uploadDefectPhotos(d.id, [url], undefined, [newId]).catch((e) => console.warn('사진 업로드 실패:', e));
        scheduleSyncToFirebase({ skipMarkCurrent: true });
        if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
        return d;
    }

    function reportDefectPhotoLost(why, err) {
        console.warn('[사진] 결함 사진을 저장하지 못함:', why, err || '');
        window.showToast('사진을 저장하지 못했습니다. 결함을 다시 열어 사진을 넣어 주세요.', 'error', 8000);
        try {
            const log = window.BSA && window.BSA.errorLog;
            if (log && typeof log.record === 'function') {
                log.record({ kind: 'photo-lost', message: `결함 사진 저장 실패: ${why}`, stack: err && err.stack, source: 'handleSelectedPhotoFile' });
            }
        } catch (_e) { /* 기록 실패는 무시 */ }
    }

    async function triggerDefectPhotoPick(mode, target = 'curr', photoTargetOverride) {
        // 파일 창을 띄우기 전에 어느 결함용인지 잡아 둔다
        const photoTarget = photoTargetOverride || captureDefectPhotoTarget();
        const file = await pickImageFromDevice(mode);
        if (file) handleSelectedPhotoFile(file, target, photoTarget);
    }
    window.triggerDefectPhotoPick = triggerDefectPhotoPick;
    (function bindPriorityPrevPhoto() {
        const cb = document.getElementById('defectPriorityManage');
        if (cb) cb.addEventListener('change', () => { try { renderDefectPhotoSection(); } catch (_e) { /* ignore */ } });
    })();

    const btnTriggerCamera = document.getElementById('btnTriggerCamera');
    const btnTriggerGallery = document.getElementById('btnTriggerGallery');

    function handleSelectedPhotoFile(file, target = 'curr', photoTarget) {
        if (!file) return;
        if (target === 'prev' && !isPrevPhotoEditableNow()) return;
        const pickedFor = photoTarget || captureDefectPhotoTarget();
        // 저장이 끝날 때까지 "사진 저장 중"으로 표시 — 그동안은 자동 새로고침을 미룬다(isAutoReloadUnsafeNow)
        if (!window._defectPhotoSaves) window._defectPhotoSaves = new Set();
        const job = window.compressDefectPhoto43(file).then(async (compressedUrl) => {
            if (!compressedUrl) {
                reportDefectPhotoLost('사진을 읽지 못함');
                return;
            }
            if (target === 'prev') {
                if (!isDefectPhotoTargetStillOpen(pickedFor)) { reportDefectPhotoLost('전회차 사진: 창이 닫힘'); return; }
                if (!Array.isArray(window._pendingPrevRoundPhotos)) window._pendingPrevRoundPhotos = [];
                window._pendingPrevRoundPhotos.push(compressedUrl);
                window._defectPhotosDirty = true;
                renderDefectPhotoSection();
                void persistOpenDefectPhotosNow();
                scheduleDefectAutoApply();
                if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
                return;
            }
            if (isDefectPhotoTargetStillOpen(pickedFor)) {
                if (!window._pendingPhotos) window._pendingPhotos = [];
                window._pendingPhotos.push(compressedUrl);
                if (target === 'repair') window._pendingRepairPhotoIdx = window._pendingPhotos.length - 1;
                window._defectPhotosDirty = true;
                renderDefectPhotoSection();
                void persistOpenDefectPhotosNow();
                scheduleDefectAutoApply();
                if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
                return;
            }
            // 사진을 줄이는 사이 창이 닫혔거나 다른 결함으로 바뀌었다 — 고를 때의 그 결함에 붙인다
            const saved = await attachPhotoToDefectDirect(pickedFor, compressedUrl);
            if (saved) {
                window.showToast(`창이 닫힌 뒤 사진을 ${saved.no || '그 결함'}에 저장했습니다.`, 'info', 5000);
            } else {
                reportDefectPhotoLost(pickedFor.pinId ? '결함을 찾지 못함' : '저장 전인 새 결함의 창이 닫힘');
            }
        }).catch((err) => {
            reportDefectPhotoLost('사진 처리 중 오류', err);
        }).then(() => {
            window._defectPhotoSaves.delete(job);
        });
        window._defectPhotoSaves.add(job);
        return job;
    }

    if (btnTriggerCamera) {
        btnTriggerCamera.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerDefectPhotoPick('camera', 'curr');
        };
    }

    if (btnTriggerGallery) {
        btnTriggerGallery.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerDefectPhotoPick('gallery', 'curr');
        };
    }

    // 2026-10-19 결함 수정창 사진 칸에 끌어다 놓기 — PC 탐색기 그림 파일(여러 장)·앱 안 그림(끌면 data:/blob: 주소).
    // 처리는 「추가」 단추와 같은 handleSelectedPhotoFile(줄이기·IndexedDB·동기화). 놓은 순서대로 한 장씩.
    (function bindDefectPhotoDrop() {
        const zone = document.querySelector('#defectModal .defect-photo-block');
        const api = window.BSA && window.BSA.shared && window.BSA.shared.photoDrop;
        if (!zone || !api || zone.dataset.photoDropBound) return;
        zone.dataset.photoDropBound = '1';
        let depth = 0;
        const setHot = (on) => zone.classList.toggle('defect-photo-drop-hot', !!on);
        zone.addEventListener('dragenter', (e) => {
            if (!api.looksLikeImageDrag(e.dataTransfer)) return;
            e.preventDefault();
            depth++;
            setHot(true);
        });
        zone.addEventListener('dragover', (e) => {
            if (!api.looksLikeImageDrag(e.dataTransfer)) return;
            e.preventDefault();
            try { e.dataTransfer.dropEffect = 'copy'; } catch (_e) { /* ignore */ }
            setHot(true);
        });
        zone.addEventListener('dragleave', () => {
            depth = Math.max(0, depth - 1);
            if (!depth) setHot(false);
        });
        zone.addEventListener('drop', async (e) => {
            if (!api.looksLikeImageDrag(e.dataTransfer)) return;
            e.preventDefault();
            e.stopPropagation();
            depth = 0;
            setHot(false);
            const photoTarget = captureDefectPhotoTarget();
            const sources = api.pickImageFiles(e.dataTransfer);
            if (!sources.length) {
                const url = api.extractImageUrl(e.dataTransfer);
                if (url) {
                    try {
                        const blob = await (await fetch(url)).blob();
                        if (/^image\//i.test(blob.type || '')) sources.push(blob);
                    } catch (_e) { /* 못 읽은 주소 */ }
                }
            }
            if (!sources.length) {
                window.showToast('그림 파일만 넣을 수 있습니다.', 'warning');
                return;
            }
            window.showToast(`사진 ${sources.length}장을 넣는 중…`, 'info', 2200);
            for (const f of sources) {
                try { await handleSelectedPhotoFile(f, 'curr', photoTarget); } catch (_e) { /* 안에서 알림 */ }
            }
        });
    })();

    // --- 📱 휴대폰 카메라 연동 (QR 스캔 → 로그인 없이 촬영)
    // QR 창을 닫아도(「닫기 (연동 유지)」) 계속 받는다. 「연동 해제」를 누르거나 30분이 지나면 구독을 끊는다.
    let phoneRelayUnsubscribe = null;
    let phoneRelayTimeout = null;
    const PHONE_RELAY_MAX_MS = 30 * 60 * 1000;
    window._phoneRelayInbox = window._phoneRelayInbox || [];

    function isDefectModalOpen() {
        return !!(elements.defectModal && elements.defectModal.classList.contains('open'));
    }

    function updatePhoneRelayButtonLabel() {
        const waiting = (window._phoneRelayInbox || []).length;
        // 2026-10-19 앱의 「오프라인 직접 받기」가 켜져 있어도 연동 중으로 보여 준다
        const nativeReceiving = !!(window.BsaPhotoRelayUI && window.BsaPhotoRelayUI.isReceiving());
        const linked = !!phoneRelayUnsubscribe || nativeReceiving;
        const btn = document.getElementById('btnTriggerPhoneRelay');
        if (btn) {
            if (linked) {
                const label = phoneRelayUnsubscribe ? '휴대폰 연동됨' : '오프라인 직접 받는 중';
                btn.innerHTML = `<i class="fa-solid fa-mobile-screen-button"></i> 📱 ${label}${waiting ? ` (대기중 사진 ${waiting}장)` : ''}`;
            } else {
                btn.innerHTML = '<i class="fa-solid fa-mobile-screen-button"></i> 📱 휴대폰으로 촬영해서 바로 받기';
            }
        }

        // 결함 등록화면 안의 상태 배지: 연동 중일 때만 표시
        const badge = document.getElementById('phoneRelayStatusBadge');
        const badgeText = document.getElementById('phoneRelayStatusText');
        if (badge) {
            badge.style.display = linked ? 'flex' : 'none';
        }
        if (badgeText && linked) {
            badgeText.textContent = waiting
                ? `휴대폰 연동됨 — 대기중인 사진 ${waiting}장이 자동으로 추가됩니다`
                : '휴대폰 연동됨 — 휴대폰에서 촬영하면 자동으로 여기에 추가됩니다';
        }
    }

    function receivePhoneRelayPhoto(dataUrl) {
        if (typeof isOverviewPhotosModalOpen === 'function' && isOverviewPhotosModalOpen()) {
            const bldgId = window._overviewPhotosBuildingId || window.state.currentBuildingId;
            const bldg = (window.state.buildings || []).find((b) => b.id === bldgId);
            if (bldg && dataUrl) {
                const item = {
                    id: (typeof createOverviewPhotoId === 'function') ? createOverviewPhotoId() : `p${Date.now()}`,
                    caption: '',
                    dataUrl
                };
                if (typeof getBuildingOverviewPhotos === 'function') getBuildingOverviewPhotos(bldg).push(item);
                else {
                    if (!Array.isArray(bldg.overviewPhotos)) bldg.overviewPhotos = [];
                    bldg.overviewPhotos.push(item);
                }
                const ovKey = (typeof getOverviewPhotoDocId === 'function')
                    ? getOverviewPhotoDocId(bldg.id, item.id)
                    : null;
                if (ovKey) {
                    if (!window._photoCache) window._photoCache = {};
                    window._photoCache[ovKey] = dataUrl;
                    void persistPhotoUrlToIdb(ovKey, dataUrl);
                }
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                if (typeof uploadOverviewPhotos === 'function') uploadOverviewPhotos(bldg);
                if (typeof renderOverviewPhotosList === 'function') renderOverviewPhotosList({ force: true });
                window.showToast('휴대폰에서 사진을 받아 전경사진에 추가했습니다.', 'success');
                updatePhoneRelayButtonLabel();
                return;
            }
        }
        if (isDefectModalOpen()) {
            if (!window._pendingPhotos) window._pendingPhotos = [];
            window._pendingPhotos.push(dataUrl);
            window._defectPhotosDirty = true;
            renderDefectPhotoSection();
            void persistOpenDefectPhotosNow();
            scheduleDefectAutoApply();
            if (typeof window.updateMapSelectedDefectPopup === 'function') window.updateMapSelectedDefectPopup();
            window.showToast('휴대폰에서 사진을 받아 결함에 추가했습니다.', 'success');
        } else {
            window._phoneRelayInbox.push(dataUrl);
            window.showToast(`휴대폰에서 사진을 받았습니다. 다음 결함 등록 시 자동으로 추가됩니다. (대기 ${window._phoneRelayInbox.length}장)`, 'info');
        }
        updatePhoneRelayButtonLabel();
    }

    function stopPhoneRelayListener(opts) {
        if (phoneRelayTimeout) {
            clearTimeout(phoneRelayTimeout);
            phoneRelayTimeout = null;
        }
        if (phoneRelayUnsubscribe) {
            try { phoneRelayUnsubscribe(); } catch (_e) { /* ignore */ }
            phoneRelayUnsubscribe = null;
        }
        updatePhoneRelayButtonLabel();
        if (opts && opts.toast && typeof window.showToast === 'function') {
            window.showToast(opts.toast, 'info');
        }
    }

    function hidePhoneRelayModal() {
        if (elements.mobileQrModal) {
            elements.mobileQrModal.style.display = 'none';
            elements.mobileQrModal.classList.remove('open');
        }
        updatePhoneRelayButtonLabel();
    }

    function disconnectPhoneRelay() {
        stopPhoneRelayListener();
        window._phoneRelayInbox = [];
        updatePhoneRelayButtonLabel();
        window.showToast('휴대폰 연동이 해제되었습니다.', 'info');
    }

    function startPhoneRelaySession() {
        stopPhoneRelayListener();
        const sessionId = `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // 태블릿 앱(APK)이 앱 안 화면(https://localhost/…)을 열고 있으면 QR이 휴대폰에서 못 여는 주소가 된다.
        // 그때는 배포 주소로 만든다(photo-capture.html은 GitHub Pages에 있음).
        const loc = window.location;
        const servedFromPages = /^https?:$/.test(loc.protocol) && loc.hostname === 'dongil2010.github.io';
        const native = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
            && window.Capacitor.isNativePlatform());
        const captureUrl = (native && !servedFromPages)
            ? new URL('https://dongil2010.github.io/building-safety-app/photo-capture.html')
            : new URL('photo-capture.html', loc.href);
        captureUrl.searchParams.set('s', sessionId);

        const qrContainer = document.getElementById('mobileQrCanvas');
        const statusEl = document.getElementById('mobileQrStatus');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            new QRCode(qrContainer, { text: captureUrl.href, width: 200, height: 200 });
        }
        if (statusEl) {
            statusEl.textContent = '휴대폰으로 QR을 스캔해 주세요. 창을 닫아도 30분 동안 계속 받습니다.';
            statusEl.style.color = '';
        }

        phoneRelayUnsubscribe = db.collection('photoRelay').doc(sessionId).collection('photos')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data && data.dataUrl) {
                            receivePhoneRelayPhoto(data.dataUrl);
                            if (statusEl) {
                                statusEl.textContent = '휴대폰과 연결되어 있습니다. 창을 닫아도 계속 받습니다.';
                                statusEl.style.color = '#4ade80';
                            }
                        }
                    }
                });
            }, (err) => {
                console.error('휴대폰 연동 사진 수신 오류:', err);
            });
        phoneRelayTimeout = setTimeout(() => {
            stopPhoneRelayListener({ toast: '휴대폰 연동을 30분 후 자동 해제했습니다. 다시 받으려면 QR을 열어 주세요.' });
        }, PHONE_RELAY_MAX_MS);

        updatePhoneRelayButtonLabel();
    }

    function openPhoneRelayModal() {
        // 2026-10-19 앱(APK)이면 인터넷이 없어도 창을 열고 「오프라인 직접 받기」로 — 예전엔 경고만 뜨고 창이 안 열렸음
        const nativeRelayUi = (window.BsaPhotoRelayUI && window.BsaPhotoRelayUI.available()) ? window.BsaPhotoRelayUI : null;
        if (nativeRelayUi && (!db || typeof QRCode === 'undefined')) {
            if (elements.mobileQrModal) {
                elements.mobileQrModal.style.display = 'flex';
                elements.mobileQrModal.classList.add('open');
            }
            const offStatus = document.getElementById('mobileQrStatus');
            if (offStatus) {
                offStatus.textContent = '인터넷(서버)에 연결되지 않아 이 방식은 지금 쓸 수 없습니다. 「오프라인 직접 받기」를 쓰세요.';
                offStatus.style.color = '';
            }
            nativeRelayUi.onModalOpen({ onlineUnavailable: true });
            return;
        }
        if (!db) {
            window.showToast('네트워크(Firebase) 연결이 필요한 기능입니다. 오프라인 상태에서는 사용할 수 없습니다.', 'warning');
            return;
        }
        if (typeof QRCode === 'undefined') {
            window.showToast('QR 코드 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error');
            return;
        }

        if (elements.mobileQrModal) {
            elements.mobileQrModal.style.display = 'flex';
            elements.mobileQrModal.classList.add('open');
        }
        if (nativeRelayUi) nativeRelayUi.onModalOpen({ onlineUnavailable: false });

        if (phoneRelayUnsubscribe) {
            // 이미 연동되어 있으면 QR을 새로 만들지 않고 연결 상태만 보여줌
            const qrContainer = document.getElementById('mobileQrCanvas');
            const statusEl = document.getElementById('mobileQrStatus');
            if (qrContainer) qrContainer.innerHTML = '<div style="padding:2.5rem 1rem; color:#4ade80; font-weight:700;"><i class="fa-solid fa-circle-check"></i><br>이미 휴대폰과 연동되어 있습니다</div>';
            if (statusEl) {
                statusEl.textContent = '다른 휴대폰으로 다시 연결하려면 "연동 해제" 후 다시 열어주세요.';
                statusEl.style.color = '#4ade80';
            }
            return;
        }

        startPhoneRelaySession();
    }

    const btnTriggerPhoneRelay = document.getElementById('btnTriggerPhoneRelay');
    if (btnTriggerPhoneRelay) {
        btnTriggerPhoneRelay.onclick = (e) => {
            e.preventDefault();
            openPhoneRelayModal();
        };
    }

    // 2026-10-19 오프라인 직접 사진 전송(앱 전용, js/core/photo-relay-native.js): 받은 사진은 위 receivePhoneRelayPhoto 로
    if (window.BsaPhotoRelayUI && typeof window.BsaPhotoRelayUI.init === 'function') {
        window.BsaPhotoRelayUI.init({
            receive: (dataUrl) => receivePhoneRelayPhoto(dataUrl),
            toast: (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type || 'info'); },
            onReceiverChange: () => updatePhoneRelayButtonLabel()
        });
    }

    const btnCloseQrModal = document.getElementById('btnCloseQrModal');
    if (btnCloseQrModal) btnCloseQrModal.addEventListener('click', hidePhoneRelayModal);
    const btnCloseQrConfirm = document.getElementById('btnCloseQrConfirm');
    if (btnCloseQrConfirm) btnCloseQrConfirm.addEventListener('click', hidePhoneRelayModal);
    const btnDisconnectPhoneRelay = document.getElementById('btnDisconnectPhoneRelay');
    if (btnDisconnectPhoneRelay) {
        btnDisconnectPhoneRelay.addEventListener('click', () => {
            disconnectPhoneRelay();
            hidePhoneRelayModal();
        });
    }

    const btnCloseDefectModal = document.getElementById('btnCloseDefectModal');
    if (btnCloseDefectModal) {
        btnCloseDefectModal.addEventListener('click', closeDefectModal);
    }
    window.addEventListener('resize', () => {
        if (elements.defectModal && elements.defectModal.classList.contains('open')) {
            syncDefectDrawerToCanvasArea();
        }
        const ndtModalEl = document.getElementById('ndtModal');
        if (ndtModalEl && ndtModalEl.classList.contains('open')) {
            syncNdtDrawerToCanvasArea();
        }
    });
    window.addEventListener('orientationchange', () => {
        window.setTimeout(() => {
            if (elements.defectModal && elements.defectModal.classList.contains('open')) {
                syncDefectDrawerToCanvasArea();
            }
        }, 80);
    });
    const appContentEl = document.querySelector('.app-content');
    if (appContentEl) {
        appContentEl.addEventListener('scroll', () => {
            if (elements.defectModal && elements.defectModal.classList.contains('open')) {
                syncDefectDrawerToCanvasArea();
            }
            const ndtModalEl = document.getElementById('ndtModal');
            if (ndtModalEl && ndtModalEl.classList.contains('open')) {
                syncNdtDrawerToCanvasArea();
            }
        }, { passive: true });
    }

    const btnCancelDefect = document.getElementById('btnCancelDefect');
    if (btnCancelDefect) {
        btnCancelDefect.addEventListener('click', closeDefectModal);
    }

    const btnDeleteDefect = document.getElementById('btnDeleteDefect');
    if (btnDeleteDefect) {
        btnDeleteDefect.addEventListener('click', async () => {
            const pinId = document.getElementById('defectPinId')?.value;
            if (pinId) {
                if (await window.deleteDefectById(pinId)) {
                    closeDefectModal({ discardPending: true });
                }
            } else {
                closeDefectModal({ discardPending: true });
            }
        });
    }

    /**
     * 사진 변경 시각 — 병합이 사진 목록을 합집합 대신 "나중에 바꾼 쪽 통째로" 따르게 하는 근거.
     * 사진이 다 내려오지 않은 창에서는 찍지 않는다(못 받은 사진이 지워진 것으로 퍼지면 안 됨).
     */
    function stampDefectPhotosChangedIfSafe(defect) {
        if (!defect) return false;
        if (window._defectPhotosComplete === false) {
            console.warn('[사진] 사진을 다 받지 못한 상태라 사진 변경 시각을 찍지 않습니다(병합은 합집합 유지):', defect.id);
            return false;
        }
        defect.photosUpdatedAt = bsaStampAfter(defect.photosUpdatedAt);
        return true;
    }

    /**
     * 사진 ID별 지움/다시 넣음 기록 (사진 ID 단위 병합, 2026-09-29 — sync-merge.js mergePhotoIdLists).
     * photoState[ID] = +시각(그때 지움) / -시각(그때 다시 넣음, 되돌리기 등). 빈 {}라도 두면
     * "이 기기는 사진마다 기록한다"는 표시가 되어, 상대 목록에만 있는 사진을 새로 넣은 것으로 살린다.
     * 사진을 다 못 받은 창에서는 빠진 사진을 지운 것으로 적지 않는다(stampDefectPhotosChangedIfSafe와 같은 이유).
     */
    function recordDefectPhotoState(defect, beforeIds, afterIds) {
        if (!defect) return;
        const state = (defect.photoState && typeof defect.photoState === 'object') ? defect.photoState : {};
        let maxAbs = 0;
        Object.keys(state).forEach((k) => { maxAbs = Math.max(maxAbs, Math.abs(Number(state[k]) || 0)); });
        const now = bsaStampAfter(maxAbs);
        const after = new Set((Array.isArray(afterIds) ? afterIds : []).filter(Boolean));
        after.forEach((pid) => {
            if (Number(state[pid]) > 0) state[pid] = -now;   // 지웠던 사진을 다시 넣음
        });
        if (window._defectPhotosComplete !== false) {
            (Array.isArray(beforeIds) ? beforeIds : []).forEach((pid) => {
                if (pid && !after.has(pid)) state[pid] = now;
            });
        }
        // 2026-10-16 순서(대표 사진)가 바뀌었으면 순서 시각 — 병합에서 순서만 따로 고른다(sync-merge photoOrderAt)
        const bArr = (Array.isArray(beforeIds) ? beforeIds : []).filter((pid) => pid && after.has(pid));
        const bSet = new Set(bArr);
        const aArr = Array.from(after).filter((pid) => bSet.has(pid));
        if (bArr.length > 1 && bArr.join('|') !== aArr.join('|')) defect.photoOrderAt = bsaStampAfter(defect.photoOrderAt);
        // 2026-10-16 지움 기록 정리: 개수(60개)가 아니라 기간 — 90일 지난 것만 지움(오래 오프라인이던 기기의 옛 사진이
        // 기록이 잘려 되살아나지 않게). 아주 많이 쌓이면(1000개 넘게) 오래된 것부터.
        const cutoff = bsaSyncNow() - 90 * 24 * 3600 * 1000;
        const gone = Object.keys(state).filter((pid) => !after.has(pid))
            .sort((a, b) => Math.abs(Number(state[b])) - Math.abs(Number(state[a])));
        gone.forEach((pid, i) => {
            if (Math.abs(Number(state[pid]) || 0) < cutoff || i >= 1000) delete state[pid];
        });
        defect.photoState = state;
    }

    /** 2026-11-06 수정 창에 보인 사진 id 기록 — 보이지 않은 사진을 지운 것으로 만들지 않기 위해 */
    function noteDefectFormShownPhotos(defect) {
        const shownOf = (pairs, pending) => {
            const urls = new Set((pending || []).filter(Boolean));
            return new Set((pairs || []).filter((p) => p && p.id && p.url && urls.has(p.url)).map((p) => p.id));
        };
        window._defectFormShownPhotoIds = {
            cur: shownOf(captureDefectPhotoPairs(defect).pairs, window._pendingPhotos),
            prev: shownOf(captureDefectPhotoPairs(defect, 'prev').pairs, window._pendingPrevRoundPhotos)
        };
    }
    /** 창에 안 보인 사진은 목록에 그대로 둔다(아직 안 받은 칸은 빈 칸). 지움 기록·서버 삭제 대상에서도 자연히 빠진다. */
    function keepUnseenDefectPhotos(defect, idKey, photoKey, beforeSide, kind) {
        const shownAll = window._defectFormShownPhotoIds;
        const shown = shownAll && shownAll[kind];
        if (!shown) return;
        const ids = Array.isArray(defect[idKey]) ? defect[idKey] : [];
        const keep = beforeSide ? window.BSA.floorSyncGuard.unseenPhotoPairs(beforeSide.pairs, shown, ids) : [];
        ids.forEach((id) => shown.add(id));   // 이 창에서 넣은 사진은 이제 보인 사진(이 창에서 지울 수 있음)
        if (!keep.length) return;
        console.warn('[사진] 창에 안 보인 사진은 지우지 않고 남깁니다:', defect.id, keep.map((p) => p.id));
        const photos = (Array.isArray(defect[photoKey]) ? defect[photoKey] : []).filter(Boolean).slice(0, ids.length);
        while (photos.length < ids.length) photos.push(null);
        defect[idKey] = ids.concat(keep.map((p) => p.id));
        defect[photoKey] = photos.concat(keep.map((p) => p.url));
    }

    // before: 결함 사진을 바꾸기 전에 captureDefectPhotoIdsBefore로 받아 둔 것. 없으면(새 결함) 전부 새 ID.
    function syncDefectPhotoRefs(defect, photosVal, prevVal, before) {
        if (!defect) return;
        const photos = Array.isArray(photosVal) ? photosVal.filter(Boolean) : [];
        const prev = Array.isArray(prevVal) ? prevVal.filter(Boolean) : [];
        if (photos.length > 0) {
            defect.photoIds = assignDefectPhotoIds(defect.id, photos, before && before.cur);
        } else {
            delete defect.photoIds;
        }
        keepUnseenDefectPhotos(defect, 'photoIds', 'photos', before && before.cur, 'cur');
        recordDefectPhotoState(defect, before && before.cur && before.cur.visibleIds, defect.photoIds);
        if (prev.length > 0) {
            defect.prevRoundPhotoIds = assignDefectPhotoIds(defect.id, prev, before && before.prev, 'prev');
        } else if (prevVal !== undefined) {
            delete defect.prevRoundPhotoIds;
        }
        if (prevVal !== undefined) keepUnseenDefectPhotos(defect, 'prevRoundPhotoIds', 'prevRoundPhotos', before && before.prev, 'prev');
    }

    /** 목록에서 빠진 사진(IndexedDB/클라우드/캐시)만 지운다. 남은 사진은 ID가 그대로라 건드리지 않는다. */
    async function pruneRemovedDefectPhotos(oldIds, newIds) {
        const keep = new Set((Array.isArray(newIds) ? newIds : []).filter(Boolean));
        // 다른 결함(다른 점검의 같은 id 결함 등)이 아직 쓰는 사진은 남긴다(2026-09-30)
        if (typeof photoIdsUsedByOtherDefects === 'function' && (Array.isArray(oldIds) ? oldIds : []).some((pid) => pid && !keep.has(pid))) {
            photoIdsUsedByOtherDefects(null).forEach((pid) => keep.add(pid));
        }
        const jobs = [];
        for (const photoDocId of new Set((Array.isArray(oldIds) ? oldIds : []).filter(Boolean))) {
            if (keep.has(photoDocId)) continue;
            if (window._photoCache) delete window._photoCache[photoDocId];
            _idbPersistedPhotoKeys.delete(photoDocId);
            jobs.push(idbDelete('photos', photoDocId));
            jobs.push(deleteCloudPhoto(photoDocId).catch((e) => {
                console.warn(`지운 사진 정리 실패 (${photoDocId}):`, e);
            }));
        }
        await Promise.all(jobs);
    }

    // 결함 모달의 현재 입력값을 저장(신규 생성 또는 기존 결함 수정)하고 저장된 결함 객체를 반환
    async function commitBulkDefectFromForm(options = {}) {
        const opts = (typeof options === 'object' && options) ? options : {};
        const pushHistory = opts.pushHistory !== false;
        const changed = window._defectBulkChangedFields;
        if (!changed || !changed.size) return getDefectsForBulkEdit()[0] || null;

        const defects = getDefectsForBulkEdit();
        if (!defects.length) return null;
        const bulkFloorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        // ⚠️ 화면 값과 "바뀐 칸" 목록은 await 전에 전부 읽는다.
        // 2026-09-21 검토에서 재현: 백업을 기다린 뒤에 화면을 읽었더니, 그 사이 창을 닫고 다른
        // 결함 창이 열리면서 칸이 그 결함 값으로 바뀌어 **선택한 결함 전부에 엉뚱한 값**이 저장됐다.
        const changedFields = new Set(changed);
        if (pushHistory) pushDefectHistory();

        // 일괄 수정도 단건과 같은 방식으로 읽는다 — 칩 정리 중 버려지는 말이 없게.
        const uiFieldsBulk = readDefectGuardedFieldsFromUi();
        const compVal = uiFieldsBulk.component;
        let dTypeVal = uiFieldsBulk.defectType;
        let causeVal = uiFieldsBulk.cause;
        const locVal = uiFieldsBulk.location;
        const isProgress = document.getElementById('defectProgressCheck')?.checked || false;
        const isLeak = document.getElementById('defectLeakCheck')?.checked || false;
        const isOpeningCrack = document.getElementById('defectOpeningCrackCheck')?.checked || false;
        const isCarriedOver = document.getElementById('defectCarriedOver')?.checked || false;
        const isBookmark = document.getElementById('defectBookmark')?.checked || false;
        const isPriorityManage = document.getElementById('defectPriorityManage')?.checked || false;
        const isGoodType = isGoodDefectType(dTypeVal);
        syncHiddenCrackFieldsFromMeasures();
        const crackMeasuresVal = isGoodType ? [] : getCrackMeasuresFromUi();
        const crackWidthVal = isGoodType ? '' : (document.getElementById('defectCrackWidth')?.value || '');
        const crackLengthVal = isGoodType ? '' : (document.getElementById('defectCrackLength')?.value || '');
        const itemCountVal = isGoodType ? '' : (document.getElementById('defectItemCount')?.value || '');
        const sizeVal = isGoodType ? '' : (document.getElementById('defectSize')?.value || '');
        const causeSaveVal = isGoodType ? '' : causeVal;
        const areaFillVal = getSelectedAreaFillFromUi();
        const areaBorderVal = getSelectedAreaBorderFromUi();
        const categoryVal = uiFieldsBulk.category;

        // 백업은 **이 일괄 수정 창에서 처음 한 번만** 남긴다(바뀐 칸 목록 Set이 창마다 새로 생김).
        // 예전에는 입력할 때마다 남겨서 층당 5개 한도가 타이핑 중간 상태로 차고, 조사표 가져오기
        // 백업과 "일괄 수정 전 원래 상태"가 밀려나 사라졌다. 같은 창의 이어지는 저장은 같은
        // 백업(promise)을 기다린다 — 그래야 첫 저장이 끝나기 전 두 번째 저장이 끼어들어도 순서가 지켜진다.
        let bulkSnaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            let session = window._bulkEditSnapSession;
            if (!session || session.key !== changed || session.floorKey !== bulkFloorKey) {
                session = { key: changed, floorKey: bulkFloorKey, promise: snapshotBeforeBulkOp('일괄 수정', [bulkFloorKey]) };
                window._bulkEditSnapSession = session;
            }
            bulkSnaps = (await session.promise) || [];
        }

        defects.forEach((d) => {
            const prevSizeForReconcile = d.size;
            if (changedFields.has('category')) d.category = (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(categoryVal, d.defectType) : categoryVal);
            if (changedFields.has('component')) d.component = compVal;
            if (changedFields.has('defectType')) {
                d.category = (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(d.category, dTypeVal) : d.category);
                d.defectType = dTypeVal;
                if (isGoodType) {
                    d.cause = '';
                    d.size = '';
                    d.crackWidth = '';
                    d.crackLength = '';
                    d.crackMeasures = [];
                    d.itemCount = '';
                }
            }
            if (changedFields.has('cause') && !isGoodType) d.cause = causeSaveVal;
            if (changedFields.has('location')) d.location = locVal;
            if (changedFields.has('size') && !isGoodType) d.size = sizeVal;
            if (changedFields.has('crackMeasures') && !isGoodType) {
                d.crackMeasures = crackMeasuresVal;
                d.crackWidth = crackWidthVal;
                d.crackLength = crackLengthVal;
                d.itemCount = itemCountVal;
                d.size = sizeVal;
            }
            if (changedFields.has('size') && !changedFields.has('crackMeasures') && !isGoodType) {
                reconcileDefectMeasuresWithEditedSize(d, prevSizeForReconcile);
            }
            if (changedFields.has('isProgress')) d.isProgress = isProgress;
            if (changedFields.has('isLeak')) d.isLeak = isLeak;
            if (changedFields.has('isOpeningCrack')) d.isOpeningCrack = isOpeningCrack;
            if (changedFields.has('isCarriedOver')) d.isCarriedOver = isCarriedOver;
            if (changedFields.has('isBookmark')) d.isBookmark = isBookmark;
            if (changedFields.has('isPriorityManage')) d.isPriorityManage = isPriorityManage;
            if (d.shapeType === 'area') {
                if (changedFields.has('areaFillStyle')) d.areaFillStyle = areaFillVal;
                if (changedFields.has('areaBorderStyle')) d.areaBorderStyle = areaBorderVal;
            }
            touchDefectUpdatedAt(d);
            if (changedFields.has('component') && bulkFloorKey === `${state.currentBuildingId}_${state.currentFloor}` && typeof applyGridAutoLocationToDefect === 'function') {
                try { applyGridAutoLocationToDefect(d); } catch (gridErr) { console.warn('[grid-lines] bulk', gridErr); }
            }
        });

        saveStateToLocalStorage();
        // 작업 직후 상태를 백업에 붙인다(되살리기가 이 일괄 수정이 바꾼 행만 고르게). 복사는 즉시 한다.
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(bulkSnaps);
        return defects[0];
    }

    /**
     * 결함 폼의 글자 칸을 저장할 때와 똑같은 방식으로 읽는다.
     * 폼을 연 직후 이 값을 기준(baseline)으로 기록하고, 저장 때 같으면 "안 건드린 칸"으로 본다.
     * 저장(commitDefectFromForm)과 기준 기록이 반드시 같은 함수를 써야 비교가 맞는다.
     */
    /**
     * 화면의 조사내용. 균열 칩으로 정리할 수 있으면 정리하되, 그러다 **버려지는 말이 있으면**
     * 입력한 그대로 쓴다. 예전에는 칩 목록에 없는 조각('경사', '누수')을 조용히 버렸다.
     */
    function readDefectTypeFromUi() {
        const raw = getDefectComboValue(
            document.getElementById('defectType'),
            document.getElementById('defectTypeInput')
        ) || '';
        const kindsSelected = getSelectedCrackKindsFromUi();
        if (!kindsSelected.length) return raw;
        const rawParts = parseDefectTypeList(raw);
        return kindsSelected.length === rawParts.length ? joinDefectTypeList(kindsSelected) : raw;
    }

    function readDefectGuardedFieldsFromUi() {
        const causesSelected = getSelectedCausesFromUi();
        return {
            no: document.getElementById('defectNo')?.value || 'NO.01',
            category: readDefectCategoryUi(),
            component: getDefectComboValue(
                document.getElementById('defectComponent'),
                document.getElementById('defectComponentInput')
            ) || '',
            defectType: readDefectTypeFromUi(),
            cause: causesSelected.length
                ? joinCauseList(causesSelected)
                : (getDefectComboValue(
                    document.getElementById('defectCause'),
                    document.getElementById('defectCauseInput')
                ) || ''),
            location: composeDefectLocation(document.getElementById('defectLocation')?.value || '')
        };
    }

    /** 폼을 연 직후 화면이 보여준 값. pinId가 맞을 때만 쓴다. */
    function captureDefectFormBaseline(pin) {
        window._defectFormBaseline = (pin && pin.id)
            ? { pinId: pin.id, values: readDefectGuardedFieldsFromUi() }
            : null;
    }

    async function commitDefectFromForm(options = {}) {
        const opts = (typeof options === 'object' && options) ? options : {};
        if (isDefectBulkEditMode()) {
            return commitBulkDefectFromForm(opts);
        }
        const pushHistory = opts.pushHistory !== false;
        const uploadPhotos = opts.uploadPhotos !== false;
        if (!state.currentBuildingId) return null;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects[key]) state.defects[key] = [];
        if (pushHistory) pushDefectHistory();

        const pinId = document.getElementById('defectPinId').value;
        const coords = window._pendingPinCoords || { x: 200, y: 200, targetX: 165, targetY: 235 };

        let photoIdsBefore = null;
        if (pinId) {
            const existing = (state.defects[key] || []).find(d => d.id === pinId);
            if (existing) photoIdsBefore = captureDefectPhotoIdsBefore(existing);
        }

        // 사용자가 안 건드린 칸은 저장된 원래 값을 쓴다. 폼은 값 하나만 바꿔도(또는 창을 닫기만
        // 해도) 모든 칸을 다시 저장하는데, 조사내용·원인은 화면 칩에서 다시 조립되며 값이 샜다
        // ('경사,수직균열'→'수직균열', '부식·팽창'→'부식, 팽창'). 2026-09-21
        const uiFields = readDefectGuardedFieldsFromUi();
        const storedForGuard = pinId ? (state.defects[key] || []).find((d) => d.id === pinId) : null;
        const baseline = (storedForGuard && window._defectFormBaseline
            && window._defectFormBaseline.pinId === pinId) ? window._defectFormBaseline.values : null;
        const syncMergeApi = window.BSA && window.BSA.syncMerge;
        // 고치기 전 값을 찍어 둔다 — 아래에서 state.defects[key][idx]를 제자리에서 바꾸므로
        // storedForGuard는 같은 객체다. 지금 복사하지 않으면 "이전 값"이 남지 않는다.
        const editHistoryApi = window.BSA && window.BSA.editHistory;
        const historyBefore = (editHistoryApi && storedForGuard)
            ? editHistoryApi.TRACKED_FIELDS.reduce((acc, f) => {
                acc[f] = storedForGuard[f];
                return acc;
            }, {})
            : null;
        const crackSnapBefore = storedForGuard ? crackMeasureSig(storedForGuard) : null;
        const guardField = (field) => {
            const uiVal = uiFields[field];
            if (!baseline || !syncMergeApi || typeof syncMergeApi.keepStoredIfUntouched !== 'function') return uiVal;
            return syncMergeApi.keepStoredIfUntouched(uiVal, baseline[field], storedForGuard[field]);
        };
        const compVal = guardField('component');
        let dTypeVal = guardField('defectType');
        let causeVal = guardField('cause');
        const locVal = guardField('location');
        const noVal = guardField('no');
        const categoryGuardedVal = guardField('category');
        const isProgress = document.getElementById('defectProgressCheck')?.checked || false;
        const isLeak = document.getElementById('defectLeakCheck')?.checked || false;
        const isOpeningCrack = document.getElementById('defectOpeningCrackCheck')?.checked || false;
        const isCarriedOver = document.getElementById('defectCarriedOver')?.checked || false;
        const isBookmark = document.getElementById('defectBookmark')?.checked || false;
        const isPriorityManage = document.getElementById('defectPriorityManage')?.checked || false;
        const forceArrowDir = document.getElementById('defectForceArrowDir')?.checked || false;
        const arrowOctant = ((parseInt(document.getElementById('defectArrowOctant')?.value || '0', 10) % 8) + 8) % 8;
        const photosVal = window._pendingPhotos || [];
        const isGoodType = isGoodDefectType(dTypeVal);
        syncHiddenCrackFieldsFromMeasures();
        const crackMeasuresVal = isGoodType ? [] : getCrackMeasuresFromUi();
        const existingForCrack = pinId ? (state.defects[key] || []).find((d) => d.id === pinId) : null;
        const crackGaugeLogVal = isGoodType ? null : (existingForCrack ? existingForCrack.crackGaugeLog : null);
        const crackTipLogVal = isGoodType ? null : (existingForCrack ? existingForCrack.crackTipLog : null);
        const crackWidthVal = isGoodType ? '' : (document.getElementById('defectCrackWidth')?.value || '');
        const crackLengthVal = isGoodType ? '' : (document.getElementById('defectCrackLength')?.value || '');
        const itemCountVal = isGoodType ? '' : (document.getElementById('defectItemCount')?.value || '');
        const sizeVal = isGoodType ? '' : (document.getElementById('defectSize')?.value || '');
        const causeSaveVal = isGoodType ? '' : causeVal;
        const areaFillVal = getSelectedAreaFillFromUi();
        const areaBorderVal = getSelectedAreaBorderFromUi();

        let savedDefect = null;

        if (pinId) {
            // Update existing defect
            const idx = state.defects[key].findIndex(d => d.id === pinId);
            if (idx !== -1) {
                const prevSizeForReconcile = state.defects[key][idx].size;
                state.defects[key][idx].no = noVal;
                state.defects[key][idx].category = (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(categoryGuardedVal, dTypeVal) : categoryGuardedVal);
                state.defects[key][idx].component = compVal;
                state.defects[key][idx].location = locVal;
                state.defects[key][idx].defectType = dTypeVal;
                state.defects[key][idx].cause = causeSaveVal;
                state.defects[key][idx].size = sizeVal;
                state.defects[key][idx].crackWidth = crackWidthVal;
                state.defects[key][idx].crackLength = crackLengthVal;
                state.defects[key][idx].crackMeasures = crackMeasuresVal;
                state.defects[key][idx].crackGaugeLog = crackGaugeLogVal;
                state.defects[key][idx].crackTipLog = crackTipLogVal;
                state.defects[key][idx].itemCount = itemCountVal;
                state.defects[key][idx].isProgress = isProgress;
                state.defects[key][idx].isLeak = isLeak;
                state.defects[key][idx].isOpeningCrack = isOpeningCrack;
                { const op = readDefectOpeningPosUi(); if (op) state.defects[key][idx].openingPos = op; else delete state.defects[key][idx].openingPos; }
                state.defects[key][idx].isCarriedOver = isCarriedOver;
                state.defects[key][idx].isBookmark = isBookmark;
                state.defects[key][idx].isPriorityManage = isPriorityManage;
                state.defects[key][idx].forceArrowDir = forceArrowDir;
                state.defects[key][idx].arrowOctant = arrowOctant;
                if (!isGoodType) reconcileDefectMeasuresWithEditedSize(state.defects[key][idx], prevSizeForReconcile);
                if (state.defects[key][idx].shapeType === 'area') {
                    state.defects[key][idx].areaFillStyle = areaFillVal;
                    state.defects[key][idx].areaBorderStyle = areaBorderVal;
                    const angRaw = Number(document.getElementById('defectAreaAngle')?.value);
                    if (Number.isFinite(angRaw)) {
                        rotateAreaDefect(state.defects[key][idx], angRaw);
                    }
                    state.areaFillStyle = areaFillVal;
                    state.areaBorderStyle = areaBorderVal;
                }
                invalidatePersistedPhotoCacheForDefect(state.defects[key][idx].id);
                // 화면 배열(_pendingPhotos)을 그대로 넣으면 사진을 지울 때 결함 배열이 ID 목록보다 먼저
                // 줄어, 다음 저장이 남은 사진에 지운 사진의 ID를 물려준다(고유 ID 짝맞춤이 어긋남).
                state.defects[key][idx].photos = photosVal.filter(Boolean);
                const pendingPrev = Array.isArray(window._pendingPrevRoundPhotos)
                    ? window._pendingPrevRoundPhotos.filter(Boolean)
                    : [];
                const keepExistingPrev = !!(window._defectFormHydrating
                    && pendingPrev.length === 0
                    && Array.isArray(state.defects[key][idx].prevRoundPhotos)
                    && state.defects[key][idx].prevRoundPhotos.length > 0);
                if (!keepExistingPrev) {
                    state.defects[key][idx].prevRoundPhotos = pendingPrev;
                }
                syncDefectPhotoRefs(
                    state.defects[key][idx],
                    photosVal,
                    keepExistingPrev ? state.defects[key][idx].prevRoundPhotos : pendingPrev,
                    photoIdsBefore
                );
                // 이 창에서 사용자가 사진을 바꿨을 때만 시각을 찍는다. 다른 칸만 고친 저장은
                // 사진 목록을 "결정"한 게 아니다(덜 내려온 사진을 지운 것으로 만들면 안 됨).
                if (window._defectPhotosDirty) stampDefectPhotosChangedIfSafe(state.defects[key][idx]);
                if (!state.defects[key][idx].inspectorName) {
                    state.defects[key][idx].inspectorName = window.state.userName || '';
                }
                touchDefectUpdatedAt(state.defects[key][idx]);
                // 묶음 마킹(41-1·41-2…)은 조사표에 한 행이고 그 행은 첫 마킹 값을 보여 준다. 2026-10-06: 결함 수정창에서
                // 41-2의 균열폭을 고치면 41-2만 바뀌어 조사표·한글 출력은 옛 폭 그대로였다(조사표 크기 팝업은 묶음 전체를 고쳐서 됐다).
                // 이 저장에서 폭·길이·개수·규모가 바뀌었으면 조사표 칸과 같은 규칙으로 같은 행의 다른 마킹에도 쓴다.
                if (storedForGuard && storedForGuard.groupId) {
                    propagateMeasureEditToSurveyRow(state.defects[key], state.defects[key][idx], crackSnapBefore);
                }
                if (historyBefore) {
                    const changed = editHistoryApi.diffTracked(historyBefore, state.defects[key][idx]);
                    if (changed) {
                        state.defects[key][idx].editHistory = editHistoryApi.appendEntry(
                            editHistoryApi.readHistory(state.defects[key][idx]),
                            { at: Date.now(), by: window.state.userName || '', changes: changed }
                        );
                    }
                }
                savedDefect = state.defects[key][idx];
                if (typeof syncGridAutoFlagOnCommit === 'function') syncGridAutoFlagOnCommit(savedDefect);
            }
        } else {
            // Add new defect
            const newDefectSurveyRound = getCurrentSurveyRoundKey();
            // 새 결함을 등록한 회차는 정의상 "지금까지 중 가장 최신"이므로 최신 회차 기준점을 전진시킨다.
            advanceLatestSurveyRound(window.state.currentBuilding, newDefectSurveyRound);
            const newDefect = {
                id: generateDefectUniqueId(`${state.currentBuildingId}_${state.currentFloor}`),
                no: document.getElementById('defectNo')?.value || 'NO.01',
                category: (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(readDefectCategoryUi(), dTypeVal) : readDefectCategoryUi()),
                component: compVal,
                location: locVal,
                defectType: dTypeVal,
                cause: causeSaveVal,
                size: sizeVal,
                crackWidth: crackWidthVal,
                crackLength: crackLengthVal,
                crackMeasures: crackMeasuresVal,
                crackGaugeLog: crackGaugeLogVal,
                crackTipLog: crackTipLogVal,
                itemCount: itemCountVal,
                isProgress: isProgress,
                isLeak: isLeak,
                isOpeningCrack: isOpeningCrack,
                ...(readDefectOpeningPosUi() ? { openingPos: readDefectOpeningPosUi() } : {}),
                isCarriedOver: isCarriedOver,
                isBookmark: isBookmark,
                isPriorityManage: isPriorityManage,
                forceArrowDir: forceArrowDir,
                arrowOctant: arrowOctant,
                surveyRound: newDefectSurveyRound,
                mapMarkedAt: Date.now(),
                updatedAt: Date.now(),
                photos: photosVal.filter(Boolean),
                prevRoundPhotos: Array.isArray(window._pendingPrevRoundPhotos)
                    ? window._pendingPrevRoundPhotos.filter(Boolean)
                    : [],
                inspectorName: window.state.userName || '',
                x: coords.x,
                y: coords.y,
                targetX: coords.targetX,
                targetY: coords.targetY
            };
            if (window._pendingAreaRect) {
                newDefect.shapeType = 'area';
                newDefect.areaX1 = window._pendingAreaRect.x1;
                newDefect.areaY1 = window._pendingAreaRect.y1;
                newDefect.areaX2 = window._pendingAreaRect.x2;
                newDefect.areaY2 = window._pendingAreaRect.y2;
                newDefect.areaShape = normalizeAreaShape(window._pendingAreaRect.areaShape);
                newDefect.areaAngle = Number(window._pendingAreaRect.areaAngle) || 0;
                if (Array.isArray(window._pendingAreaRect.areaPoints)) {
                    newDefect.areaPoints = window._pendingAreaRect.areaPoints.map((p) => ({ x: p.x, y: p.y }));
                }
                newDefect.areaDrawings = [];
                newDefect.areaFillStyle = areaFillVal;
                newDefect.areaBorderStyle = areaBorderVal;
                state.areaFillStyle = areaFillVal;
                state.areaBorderStyle = areaBorderVal;
                const angRawNew = Number(document.getElementById('defectAreaAngle')?.value);
                if (Number.isFinite(angRawNew) && Math.abs(angRawNew) > 0.01) {
                    rotateAreaDefect(newDefect, angRawNew);
                }
            }
            const groupedNew = applyMarkingGroupToNewDefect(newDefect);
            state.defects[key].push(newDefect);
            if (newDefect.groupId) {
                normalizeDefectGroupNos(state.defects[key], newDefect.groupId);
            }
            if (groupedNew && shouldAddSurveyRowWithMarking()) {
                cloneDefectForSurveyTableRow(newDefect);
                window._markingAddAlsoSurveyRow = false;
                if (window._pendingMarkingGroup) window._pendingMarkingGroup.addAlsoSurveyRow = false;
            }
            if (groupedNew) finishMarkingGroupCommit();
            syncDefectPhotoRefs(newDefect, photosVal, window._pendingPrevRoundPhotos);
            savedDefect = newDefect;
            if (typeof syncGridAutoFlagOnCommit === 'function') syncGridAutoFlagOnCommit(savedDefect);
            if (!pinId) {
                const pinIdEl = document.getElementById('defectPinId');
                if (pinIdEl && !pinIdEl.value) pinIdEl.value = savedDefect.id;
            }
            // 새로 저장된 마킹은 바로 선택(강조·팝업) — 창을 닫아도 유지
            selectNewlyCreatedMarking(savedDefect, { keepAfterModalClose: isDefectModalOpen() });
        }

        if (savedDefect) applyPendingRepairPhotoToDefect(savedDefect);
        const prevPhotosVal = Array.isArray(window._pendingPrevRoundPhotos)
            ? window._pendingPrevRoundPhotos.filter(Boolean)
            : [];
        const photosWereDirty = !!window._defectPhotosDirty;
        const currPhotos = Array.isArray(photosVal) ? photosVal.filter(Boolean) : [];
        const prevPhotos = prevPhotosVal;
        if (savedDefect && photosWereDirty) {
            // 클라우드 업로드를 기다리면 모바일 새로고침 때 사진이 기기에 안 남는다.
            // photoIds는 localStorage에 먼저 남기고, 원본은 IndexedDB에 넣은 뒤 서버는 백그라운드.
            saveStateToLocalStorage();
            await persistDefectPhotosNow(savedDefect);
            if (photoIdsBefore) {
                await pruneRemovedDefectPhotos(photoIdsBefore.cur.visibleIds, savedDefect.photoIds);
                await pruneRemovedDefectPhotos(photoIdsBefore.prev.visibleIds, savedDefect.prevRoundPhotoIds);
            }
        } else {
            saveStateToLocalStorage();
        }
        if (uploadPhotos && savedDefect && photosWereDirty) {
            window._defectPhotosDirty = false;
            const defectId = savedDefect.id;
            if (currPhotos.length > 0) {
                uploadDefectPhotos(defectId, currPhotos, undefined, savedDefect.photoIds).catch((e) => console.warn('사진 업로드 실패:', e));
            }
            if (prevPhotos.length > 0) {
                uploadDefectPhotos(defectId, prevPhotos, 'prev', savedDefect.prevRoundPhotoIds).catch((e) => console.warn('전차 사진 업로드 실패:', e));
            }
        }
        return savedDefect;
    }

    function flashDefectAutosaveBadge(_mode) {
        // 헤더 '자동 적용' 뱃지는 제거됨 — 화살표 선택 UI가 그 자리를 씀
    }

    function scheduleDefectAutoApply() {
        if (window._defectFormHydrating) return;
        if (!isDefectModalOpen()) return;
        // 결함 내용에 창 상부·문 측면 등이 있으면 개구부 결함 자동 체크(저장 전에 체크박스를 먼저 맞춘다)
        try { autoDetectOpeningFromDefectContent(); } catch (_e) { /* ignore */ }
        window.clearTimeout(window._defectAutoApplyTimer);
        window._defectAutoApplyTimer = window.setTimeout(async () => {
            if (window._defectFormHydrating || !isDefectModalOpen()) return;
            flashDefectAutosaveBadge('saving');
            const needHistory = !window._defectEditSessionHistoryPushed;
            if (needHistory) window._defectEditSessionHistoryPushed = true;
            const saved = await commitDefectFromForm({
                pushHistory: needHistory,
                uploadPhotos: !!window._defectPhotosDirty
            });
            if (saved) {
                const pinIdEl = document.getElementById('defectPinId');
                if (pinIdEl && !pinIdEl.value && !isDefectBulkEditMode()) pinIdEl.value = saved.id;
                if (!isDefectBulkEditMode()) renderDefectMarkingTimeline(saved);
            }
            drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            // 2026-11-13 조사표는 보고 있을 때만 다시 그린다(탭에 들어가면 다시 그림) — 타이핑마다 표 전체를 새로 만들어 느렸다
            if (typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();
            flashDefectAutosaveBadge('done');
        }, 180);
    }

    function flushDefectAutoApply() {
        if (!window._defectAutoApplyTimer) return;
        window.clearTimeout(window._defectAutoApplyTimer);
        window._defectAutoApplyTimer = null;
        if (window._defectFormHydrating || !isDefectModalOpen()) return;
        // 탭 전환·닫기 직전: 대기 중인 자동 적용을 즉시 반영 (비동기 사진은 다음 저장에)
        const needHistory = !window._defectEditSessionHistoryPushed;
        if (needHistory) window._defectEditSessionHistoryPushed = true;
        Promise.resolve(commitDefectFromForm({
            pushHistory: needHistory,
            uploadPhotos: !!window._defectPhotosDirty
        })).then((saved) => {
            if (saved) {
                const pinIdEl = document.getElementById('defectPinId');
                if (pinIdEl && !pinIdEl.value) pinIdEl.value = saved.id;
            }
        }).catch(() => {});
    }

    function bindDefectFormAutoApply() {
        const form = document.getElementById('defectForm');
        if (!form || form.dataset.autoApplyBound) return;
        form.dataset.autoApplyBound = '1';
        form.addEventListener('input', (e) => {
            if (!e.target || e.target.closest?.('#defectArrowOctantGrid')) return;
            const bulkKey = defectFieldKeyFromTarget(e.target);
            if (bulkKey) markDefectBulkFieldChanged(bulkKey);
            scheduleDefectAutoApply();
        });
        form.addEventListener('change', (e) => {
            const bulkKey = defectFieldKeyFromTarget(e.target);
            if (bulkKey) {
                if (e.target && e.target.type === 'checkbox') {
                    e.target.indeterminate = false;
                    delete e.target.dataset.bulkMixed;
                }
                markDefectBulkFieldChanged(bulkKey);
            }
            scheduleDefectAutoApply();
        });
    }

    bindDefectFormAutoApply();

    const btnSaveDefect = document.getElementById('btnSaveDefect');
    if (btnSaveDefect) {
        btnSaveDefect.addEventListener('click', async () => {
            // 이미 자동 적용되므로 닫기만 수행 (대기 중인 디바운스 저장 먼저 flush)
            if (window._defectAutoApplyTimer) {
                window.clearTimeout(window._defectAutoApplyTimer);
                window._defectAutoApplyTimer = null;
                await commitDefectFromForm({
                    pushHistory: !window._defectEditSessionHistoryPushed,
                    uploadPhotos: !!window._defectPhotosDirty
                });
                window._defectEditSessionHistoryPushed = true;
            }
            closeDefectModal();
            drawCanvas();
        });
    }

    function cloneDefectForSurveyTableRow(src) {
        if (!src) return null;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.defects[key]) return null;
        ensureDefectMarkingGroup(src);
        const groupMembers = (state.defects[key] || []).filter((d) => d && d.groupId === src.groupId);
        const markingCount = groupMembers.filter((d) => !d.surveyExtra).length;
        const extraCount = groupMembers.filter((d) => d.surveyExtra).length;
        const nextSuffix = markingCount > 0 ? extraCount + 2 : extraCount + 1;
        const newId = generateDefectUniqueId(key);
        const copy = {
            id: newId,
            no: `${src.groupNo}-${nextSuffix}`,
            groupId: src.groupId,
            groupNo: src.groupNo,
            surveyExtra: true,
            category: src.category,
            component: src.component,
            location: src.location,
            defectType: src.defectType,
            cause: src.cause,
            size: src.size,
            crackWidth: src.crackWidth,
            crackLength: src.crackLength,
            crackMeasures: Array.isArray(src.crackMeasures)
                ? JSON.parse(JSON.stringify(src.crackMeasures))
                : [],
            itemCount: src.itemCount,
            isProgress: !!src.isProgress,
            isLeak: !!src.isLeak,
            isOpeningCrack: !!src.isOpeningCrack,
            isCarriedOver: !!src.isCarriedOver,
            isBookmark: !!src.isBookmark,
            isPriorityManage: !!src.isPriorityManage,
            forceArrowDir: !!src.forceArrowDir,
            arrowOctant: src.arrowOctant,
            surveyRound: src.surveyRound,
            updatedAt: Date.now(),
            photos: [],
            prevRoundPhotos: [],
            inspectorName: src.inspectorName || window.state.userName || '',
            x: src.x,
            y: src.y,
            targetX: src.targetX,
            targetY: src.targetY
        };
        if (src.shapeType === 'area') {
            copy.shapeType = 'area';
            copy.areaX1 = src.areaX1;
            copy.areaY1 = src.areaY1;
            copy.areaX2 = src.areaX2;
            copy.areaY2 = src.areaY2;
            copy.areaFillStyle = src.areaFillStyle;
            copy.areaBorderStyle = src.areaBorderStyle;
        }
        let lastIdx = -1;
        state.defects[key].forEach((d, i) => {
            if (d.groupId === src.groupId) lastIdx = i;
        });
        if (lastIdx >= 0) state.defects[key].splice(lastIdx + 1, 0, copy);
        else state.defects[key].push(copy);
        normalizeDefectGroupNos(state.defects[key], src.groupId);
        return copy;
    }

    // 같은 결함 정보(부재/종류/원인/규모)를 유지한 채 화살표/영역만 추가. 조사표 -1/-2 행은 「번호 부여」에서 만든다.
    async function handleAddAnotherMarking() {
        if (window._defectAutoApplyTimer) {
            window.clearTimeout(window._defectAutoApplyTimer);
            window._defectAutoApplyTimer = null;
        }
        const saved = await commitDefectFromForm({
            pushHistory: !window._defectEditSessionHistoryPushed,
            uploadPhotos: !!window._defectPhotosDirty
        });
        window._defectEditSessionHistoryPushed = true;
        let markingTmpl = null;
        let isAreaMode = false;
        if (saved) {
            // 핀·영역 공통: 같은 번호칸에 화살표/영역 연결을 추가할 수 있게 그룹화
            ensureDefectMarkingGroup(saved);
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            const chainGroupId = saved.groupId || saved.id;
            const chainGroupNo = stripDefectNoSuffix(saved.groupNo || saved.no || formatDefectNoSeq(1));
            saved.groupId = chainGroupId;
            saved.groupNo = chainGroupNo;
            if (!saved.surveyExtra) saved.no = chainGroupNo;
            const boxSource = saved.surveyExtra
                ? (getMarkingGroupRepresentative(chainGroupId) || saved)
                : saved;
            const memberCount = (state.defects[floorKey] || [])
                .filter((d) => d && d.groupId === chainGroupId && !d.surveyExtra).length;
            const nextChainIndex = Math.max(2, memberCount + 1);

            isAreaMode = boxSource.shapeType === 'area';
            markingTmpl = {
                category: boxSource.category || saved.category,
                component: boxSource.component || saved.component,
                defectType: boxSource.defectType || saved.defectType,
                cause: boxSource.cause || saved.cause,
                size: boxSource.size || saved.size,
                crackWidth: boxSource.crackWidth || saved.crackWidth,
                crackLength: boxSource.crackLength || saved.crackLength,
                forceArrowDir: !!boxSource.forceArrowDir,
                arrowOctant: ((parseInt(boxSource.arrowOctant, 10) || 0) % 8 + 8) % 8,
                areaFillStyle: boxSource.areaFillStyle || getAreaFillStyle(boxSource),
                areaBorderStyle: boxSource.areaBorderStyle || getAreaBorderStyle(boxSource),
                groupId: chainGroupId,
                groupNo: chainGroupNo,
                boxX: boxSource.x,
                boxY: boxSource.y,
                chainIndex: nextChainIndex,
                addAlsoSurveyRow: false
            };
            // closeDefectModal 전에 pending을 잡아 두면 싱글톤 groupId가 접히지 않음
            snapshotMarkingGroupForCommit(markingTmpl, { addAlsoSurveyRow: false });
            window._defectMarkingTemplate = markingTmpl;
            window._markingAddAlsoSurveyRow = false;
        }
        closeDefectModal();
        if (saved && markingTmpl) {
            window._defectMarkingTemplate = markingTmpl;
            window._markingAddAlsoSurveyRow = false;
            snapshotMarkingGroupForCommit(markingTmpl, { addAlsoSurveyRow: false });
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            normalizeDefectGroupNos(state.defects[floorKey], markingTmpl.groupId);
            saveStateToLocalStorage();
            drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            setDrawMode(isAreaMode ? 'AREA' : 'MARK');
            window.showToast(
                isAreaMode
                    ? '같은 번호칸에 영역만 추가합니다. 조사표 번호는 나중에 「번호 부여」로 줍니다.'
                    : '같은 번호칸에 화살표만 추가합니다. 도면에서 위치를 한 번 클릭해 주세요. 조사표 -1/-2는 「번호 부여」를 눌러야 생깁니다.',
                'info',
                4000
            );
        } else {
            drawCanvas();
        }
    }
    window.handleAddAnotherMarking = handleAddAnotherMarking;

    window.assignSurveyNumberToArrow = async function(defectId) {
        if (!state.currentBuildingId) return;
        if (typeof flushDefectAutoApply === 'function') {
            try { await flushDefectAutoApply(); } catch (_e) { /* ignore */ }
        }
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const pinId = defectId || document.getElementById('defectPinId')?.value;
        const target = (state.defects[key] || []).find((x) => x && x.id === pinId);
        if (!canAssignSurveyNumberToDefect(target)) {
            window.showToast?.('번호를 부여할 화살표가 아닙니다. 같은 번호칸에 화살표를 먼저 추가해 주세요.', 'info', 2800);
            return;
        }
        pushDefectHistory();
        target.surveyNumbered = true;
        touchDefectUpdatedAt(target);
        ensureDefectMarkingGroup(target);
        const extra = cloneDefectForSurveyTableRow(target);
        saveStateToLocalStorage();
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (extra && typeof window.selectDefectMarkingMember === 'function') {
            await window.selectDefectMarkingMember(extra.id, extra.no, target.id);
        } else {
            if (typeof renderDefectMarkingTimeline === 'function') renderDefectMarkingTimeline(target);
        }
        if (typeof syncMobileAddMarkingFab === 'function') syncMobileAddMarkingFab();
        if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
        const rowNo = String((extra && extra.no) || '').replace(/^NO\.?\s*/i, '').trim();
        const parentNo = String(target.groupNo || target.no || '').replace(/^NO\.?\s*/i, '').trim();
        window.showToast?.(
            rowNo
                ? `화살표에 번호 부여 · 조사표 ${parentNo}-1, ${rowNo} 행 생성`
                : '화살표에 조사표 번호를 부여했습니다',
            'success',
            3200
        );
    };

    function mergeNoLabel(n) {
        return formatDefectNoSeq(n).replace(/^NO\.?\s*/i, '');
    }

    function touchMergedDefect(d) {
        touchDefectUpdatedAt(d);
        touchDefectPositionUpdatedAt(d);
    }

    /** 결함 통합: 선택한 마킹들을 가장 작은 번호칸 하나로(나머지는 화살표 + 번호 부여 → X-2, X-3 …) */
    async function mergeSelectedDefects() {
        const api = defectMergeApi();
        if (!api || !state.currentBuildingId) return;
        if (typeof flushDefectAutoApply === 'function') {
            try { await flushDefectAutoApply(); } catch (_e) { /* ignore */ }
        }
        const st = getDefectMergeSelectionState();
        if (!st.list) {
            window.showToast?.('현재 도면(같은 층)의 마킹만 통합할 수 있습니다.', 'info', 3000);
            return;
        }
        const plan = st.plan || api.planMerge(st.list, [...selectedDefectIds]);
        if (!plan.ok) {
            window.showToast?.(plan.reason || '통합할 수 없습니다.', 'info', 4000);
            return;
        }
        const list = st.list;
        const baseLabel = mergeNoLabel(plan.baseMain);
        const existingExtras = plan.base.members.filter((m) => m && m.surveyExtra).length;
        const newRows = plan.others.map((u, i) => `${baseLabel}-${existingExtras + 2 + i}(원래 ${mergeNoLabel(u.main)})`);
        const msg = `선택한 마킹 ${plan.others.length + 1}개를 NO.${baseLabel} 번호칸 하나로 통합할까요?\n\n`
            + `· NO.${baseLabel} 번호칸 하나에서 화살표가 각 결함 자리를 가리킵니다.\n`
            + `· 조사표·한글·PDF·엑셀: ${baseLabel}-1, ${newRows.join(', ')}\n`
            + `· 내용·사진은 각 결함에 그대로 남습니다.\n`
            + `· 비는 번호(${plan.others.map((u) => mergeNoLabel(u.main)).join(', ')})는 당기지 않습니다(필요하면 「빈 칸 땡기기」).\n`
            + `· 되돌리기 또는 「통합 해제」로 되돌릴 수 있습니다.`;
        if (!await window.appConfirm(msg, { title: '결함 통합', okText: '통합', danger: false })) return;
        pushDefectHistory();
        const res = api.applyMerge(list, plan, {
            boxOf: (unit) => {
                const repM = pickDefectGroupRepresentative(unit.marking) || unit.defect;
                ensureDefectMarkingGroup(repM);
                return { x: repM.x, y: repM.y, groupId: repM.groupId, groupNo: repM.groupNo };
            },
            cloneExtra: (src) => cloneDefectForSurveyTableRow(src),
            areaAttach: (bx, by, d) => (typeof getAreaCenterBorderAttachDefect === 'function'
                ? getAreaCenterBorderAttachDefect(bx, by, d)
                : null),
            touch: touchMergedDefect
        });
        const gid = res.base && res.base.groupId;
        if (gid) normalizeDefectGroupNos(list, gid);
        selectedDefectIds.clear();
        if (gid) {
            list.forEach((d) => { if (d && d.groupId === gid && !d.surveyExtra) selectedDefectIds.add(d.id); });
        }
        saveStateToLocalStorage();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        drawCanvas();
        updateMapSelectionBar({ scrollToSelection: false });
        const rows = res.extras.map((e) => String(e.no || '').replace(/^NO\.?\s*/i, '')).filter(Boolean);
        window.showToast?.(
            `NO.${baseLabel}에 통합 · 조사표 ${baseLabel}-1${rows.length ? ', ' + rows.join(', ') : ''} 행`,
            'success',
            3600
        );
    }
    window.mergeSelectedDefects = mergeSelectedDefects;

    /** 통합 해제: 통합된 화살표를 원래 번호(비었으면)·위치로 되돌리고 X-k 결함표 행을 지운다 */
    async function unmergeSelectedDefects() {
        const api = defectMergeApi();
        if (!api || !state.currentBuildingId) return;
        if (typeof flushDefectAutoApply === 'function') {
            try { await flushDefectAutoApply(); } catch (_e) { /* ignore */ }
        }
        const st = getDefectMergeSelectionState();
        if (!st.list || !st.unmergeGroupId) {
            window.showToast?.('통합 해제할 번호칸(통합된 마킹) 하나를 선택하세요.', 'info', 3000);
            return;
        }
        const list = st.list;
        const key = st.key;
        const gid = st.unmergeGroupId;
        const plan = api.planUnmerge(list, gid);
        if (!plan.ok) {
            window.showToast?.(plan.reason || '통합 해제할 수 없습니다.', 'info', 4000);
            return;
        }
        const baseAny = list.find((d) => d && d.groupId === gid && !d.surveyExtra);
        const baseLabel = mergeNoLabel(api.mainNoOf(baseAny));
        const origs = plan.pairs.map((p) => mergeNoLabel(api.mainNoOf({ no: (p.arrow.mergedFrom || {}).no })));
        const msg = `NO.${baseLabel}에 통합된 마킹 ${plan.pairs.length}개(원래 ${origs.join(', ')})를 원래 번호·위치로 되돌릴까요?\n\n`
            + '· 원래 번호를 이미 다른 마킹이 쓰고 있으면 가장 작은 빈 번호를 씁니다.\n'
            + '· 되돌리기로 다시 통합 상태로 돌아갈 수 있습니다.';
        if (!await window.appConfirm(msg, { title: '통합 해제', okText: '해제', danger: false })) return;
        pushDefectHistory();
        const removeIds = new Set();
        const restored = api.applyUnmerge(list, plan, {
            formatNo: (n) => formatDefectNoSeq(n),
            removeExtra: (e) => {
                removeIds.add(e.id);
                trackDefectDeletion(key, e.id, e);
            },
            touch: touchMergedDefect
        });
        for (let i = list.length - 1; i >= 0; i--) {
            if (list[i] && removeIds.has(list[i].id)) list.splice(i, 1);
        }
        normalizeDefectGroupNos(list, gid);
        const baseIdsBefore = new Set(list.filter((d) => d && d.groupId === gid).map((d) => d.id));
        collapseSingletonDefectGroups(list);
        stampDefectsLeftGroup(list, gid, baseIdsBefore);
        selectedDefectIds.clear();
        restored.forEach((r) => selectedDefectIds.add(r.id));
        list.forEach((d) => { if (d && d.groupId === gid && !d.surveyExtra) selectedDefectIds.add(d.id); });
        if (baseAny && !baseAny.groupId) selectedDefectIds.add(baseAny.id);
        saveStateToLocalStorage();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        drawCanvas();
        updateMapSelectionBar({ scrollToSelection: false });
        window.showToast?.(
            `통합 해제 · ${restored.map((r) => String(r.no || '').replace(/^NO\.?\s*/i, '')).join(', ')} 복원`,
            'success',
            3200
        );
    }
    window.unmergeSelectedDefects = unmergeSelectedDefects;

    const btnAddAnotherMarking = document.getElementById('btnAddAnotherMarking');
    if (btnAddAnotherMarking) {
        btnAddAnotherMarking.addEventListener('click', () => { handleAddAnotherMarking(); });
    }
    const mobileBtnAddAnotherMarking = document.getElementById('mobileBtnAddAnotherMarking');
    if (mobileBtnAddAnotherMarking) {
        mobileBtnAddAnotherMarking.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (mobileBtnAddAnotherMarking.disabled || mobileBtnAddAnotherMarking.hidden) return;
            handleAddAnotherMarking();
        });
    }
    const btnAssignSurveyNo = document.getElementById('btnAssignSurveyNo');
    if (btnAssignSurveyNo) {
        btnAssignSurveyNo.addEventListener('click', () => { window.assignSurveyNumberToArrow(); });
    }
    const mobileBtnAssignSurveyNo = document.getElementById('mobileBtnAssignSurveyNo');
    if (mobileBtnAssignSurveyNo) {
        mobileBtnAssignSurveyNo.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (mobileBtnAssignSurveyNo.disabled || mobileBtnAssignSurveyNo.hidden) return;
            window.assignSurveyNumberToArrow();
        });
    }

