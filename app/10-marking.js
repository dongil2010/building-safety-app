// @@app-part 10-marking.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 9. BUTTON CONTROLS & LISTENERS ---

    // Main Navigation Tabs Click Listener
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.dataset.tab;
            if (targetTab) {
                window.switchTab(targetTab);
            }
        });
    });

    // Open Add Building Modal CTA
    const btnOpenAddBuildingModal = document.getElementById('btnOpenAddBuildingModal');
    if (btnOpenAddBuildingModal) btnOpenAddBuildingModal.addEventListener('click', () => window.openAddBuildingModalFunc());

    const btnCloseAddBuildingModal = document.getElementById('btnCloseAddBuildingModal');
    if (btnCloseAddBuildingModal) btnCloseAddBuildingModal.addEventListener('click', () => window.closeAddBuildingModalFunc());

    const btnCancelAddBuilding = document.getElementById('btnCancelAddBuilding');
    if (btnCancelAddBuilding) btnCancelAddBuilding.addEventListener('click', () => window.closeAddBuildingModalFunc());

    // Floor Select Change
    function refreshFloorDependentUi() {
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof renderPhotoAlbum === 'function') renderPhotoAlbum();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
        const ndtFloorTitle = document.getElementById('ndtFloorTitle');
        if (ndtFloorTitle && window.state.currentFloor) {
            ndtFloorTitle.textContent = window.state.currentFloor;
        }
    }

    if (elements.floorSelect) {
        elements.floorSelect.addEventListener('change', (e) => {
            // 층을 바꾸기 전에 — 아래에서 currentFloor를 먼저 바꾼 뒤 loadFloorDrawing을 부르므로 거기선 늦다
            closeNdtDrawersBeforeFloorChange();
            const prevFloor = window.state.currentFloor;
            if (prevFloor && state.currentBuildingId) {
                saveFloorMapStyleSettings(prevFloor, state.currentBuildingId);
                saveFloorDrawingRotation(state.currentBuildingId, prevFloor, state.rotationAngle || 0);
                persistCurrentBuildingLocationMapLegend();
            }
            window.state.currentFloor = e.target.value;
            applyFloorMapStyleSettings(e.target.value, state.currentBuildingId);
            loadFloorDrawing(e.target.value);
            refreshFloorDependentUi();
            // 진입 시 전 층 prefetch를 끊었으므로, 층 전환 때 해당 층만 필요 시 클라우드에서 보강
            const bldgNow = state.currentBuilding
                || (window.state.buildings || []).find((b) => b && b.id === state.currentBuildingId);
            const fcNow = e.target.value;
            if (bldgNow && fcNow && typeof hydrateFloorDrawingFromCloud === 'function'
                && navigator.onLine !== false) {
                const hasRaster = bldgNow.floorDrawings && isUsableRasterDrawingUrl(bldgNow.floorDrawings[fcNow]);
                if (!hasRaster) {
                    hydrateFloorDrawingFromCloud(bldgNow, fcNow, { skipHiTiers: true, needPdf: false })
                        .then((ok) => {
                            if (!ok || state.currentFloor !== fcNow) return;
                            if (typeof loadFloorDrawing === 'function') {
                                loadFloorDrawing(fcNow, { preserveView: true });
                            }
                        })
                        .catch((err) => console.warn('층 전환 도면 보강 실패:', fcNow, err));
                }
            }
            const photoKey = (state.currentBuildingId && fcNow) ? `${state.currentBuildingId}_${fcNow}` : '';
            if (photoKey && window.state.defects && window.state.defects[photoKey]
                && typeof hydrateDefectPhotos === 'function') {
                const canCloudPhoto = navigator.onLine !== false
                    && typeof isFirestoreReadPaused === 'function'
                    && !isFirestoreReadPaused();
                hydrateDefectPhotos({ [photoKey]: window.state.defects[photoKey] }, {
                    buildingId: state.currentBuildingId,
                    allowCloudPhotoFetch: canCloudPhoto
                })
                    .then((loaded) => {
                        if (state.currentFloor !== fcNow) return;
                        Object.assign(window.state.defects, loaded);
                        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                    })
                    .catch(() => {});
            }
        });
    }

    // Mode Toggle (PAN=선택 vs MARK vs AREA)
    function setDrawMode(mode) {
        if (mode === 'PAN' && window._pendingMapRegisterDefectId) {
            window._pendingMapRegisterDefectId = null;
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        }
        // 마킹 추가 중 MARK/AREA를 벗어나면 싱글톤에 남은 -1 그룹을 정리
        // 다만 방금 찍은 다음 위치의 커밋이 남아 있으면 groupId를 유지한다
        if (window._defectMarkingTemplate && mode !== 'MARK' && mode !== 'AREA') {
            if (window._pendingMarkingGroup) {
                window._defectMarkingTemplate = null;
            } else {
                clearDefectMarkingTemplate();
                saveStateToLocalStorage();
            }
        }
        // 영역 모드를 벗어날 때: 그리던 다각형이 있으면 그 모양으로 저장 (점 취소 없음)
        // 다시그리기는 점 3개 미만이면 원본 기하를 유지한 채 취소
        if (mode !== 'AREA' && !(mode === 'MARK' && getMarkPolyShape() && !isAreaPolygonRedrawActive())) {
            if (canFinishPendingPoly()) {
                finishPendingAreaPolygon({ skipModeSwitch: true });
            } else if (isAreaPolygonRedrawActive()) {
                cancelAreaPolygonRedraw({ silent: false, keepMode: true });
            } else if (pendingAreaPoly && pendingAreaPoly.length) {
                discardIncompleteAreaPolygon();
            }
        }
        if (mode === 'MARK' || mode === 'AREA') {
            state.areaInkTool = null;
            pendingInkPoly = null;
            isAreaInkDrag = false;
            areaInkStroke = null;
        }
        state.mode = mode;
        const pan = document.getElementById('btnModePan');
        const mark = document.getElementById('btnModeMark');
        const area = document.getElementById('btnModeArea');
        if (pan) pan.classList.toggle('active', mode === 'PAN');
        if (mark) mark.classList.toggle('active', mode === 'MARK');
        if (area) area.classList.toggle('active', mode === 'AREA');
        const memoBtn = document.getElementById('btnModeMemo');
        if (memoBtn) memoBtn.classList.toggle('active', mode === 'MEMO');
        if (mode === 'MEMO' && !readMemoShowPref()) setMemoShow(true);
        if (mode !== 'MEMO') memoTap = null;
        ['btnModeGuide', 'mobileBtnModeGuide'].forEach((id) => { const b = document.getElementById(id); if (b) b.classList.toggle('active', mode === 'GUIDE'); });
        if (mode !== 'GUIDE') gsDrag = null;
        syncGuideBar();
        syncGuideOverlay();
        syncDrawingMemoBar();
        document.querySelectorAll('#mobileMapSideRail .mobile-rail-btn[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
        if (elements.planCanvas) {
            elements.planCanvas.style.cursor = getMapCanvasCursor();
        }
        syncAreaToolPanelUi();
    }

    function getSelectedAreaForInk() {
        const ids = [...selectedDefectIds];
        if (!ids.length) return null;
        return getCurrentFloorDefects().find((d) => ids.includes(d.id) && d.shapeType === 'area' && d.areaX1 !== undefined) || null;
    }

    function isAreaPolygonRedrawActive() {
        return !!(pendingAreaPolyRedraw && pendingAreaPolyRedraw.defectId);
    }

    // --- 다각형·선(열린 꺾인선) 찍기 공통 (2026-10-26) ---
    // 마킹 모드의 모양(state.markCreateShape): 'pin' | 'polygon' | 'polyline'. 핀이면 null.
    function getMarkPolyShape() {
        const s = state.markCreateShape;
        if (s !== 'polygon' && s !== 'polyline') return null;
        // 통합(그룹) 마킹 추가 중에는 기존 핀 흐름 유지
        try {
            if (typeof getActiveMarkingGroup === 'function' && getActiveMarkingGroup() && getActiveMarkingGroup().groupId) return null;
        } catch (_e) { /* ignore */ }
        return s;
    }

    /** 지금 도면을 눌렀을 때 점을 찍는 모양: 'polygon' | 'polyline' | null(점 찍기 모드 아님) */
    function getActivePolyCreateShape() {
        if (state.mode === 'AREA') {
            const s = state.areaCreateShape;
            return isPolyPointAreaShape(s) ? s : null;
        }
        if (state.mode === 'MARK') return getMarkPolyShape();
        return null;
    }

    /** 찍고 있는(또는 다시 그리는) 모양 */
    function getPendingPolyShape() {
        if (pendingAreaPolyRedraw && pendingAreaPolyRedraw.shape) {
            return pendingAreaPolyRedraw.shape === 'polyline' ? 'polyline' : 'polygon';
        }
        const s = getActivePolyCreateShape();
        if (s) return s;
        return state.areaCreateShape === 'polyline' ? 'polyline' : 'polygon';
    }

    function canFinishPendingPoly() {
        return !!(pendingAreaPoly && pendingAreaPoly.length >= areaPolyMinPoints(getPendingPolyShape()));
    }

    /** 점 추가. 같은 자리(화면 3px 안)를 더블클릭·연타로 또 찍어도 점이 겹치지 않는다 */
    function addPendingPolyPoint(x, y) {
        if (!pendingAreaPoly) pendingAreaPoly = [];
        const last = pendingAreaPoly[pendingAreaPoly.length - 1];
        const scale = Math.max(0.0001, Number(state.view && state.view.scale) || 1);
        if (last && Math.hypot(x - last.x, y - last.y) * scale < 3) return false;
        pendingAreaPoly.push({ x, y });
        syncAreaPolygonRedrawBanner();
        drawCanvas();
        return true;
    }

    function syncAreaPolygonRedrawBanner() {
        const banner = document.getElementById('areaPolygonRedrawBanner');
        const finishBtn = document.getElementById('btnFinishAreaPolygonRedraw');
        const textEl = document.getElementById('areaPolygonRedrawText');
        const active = isAreaPolygonRedrawActive();
        if (banner) banner.hidden = !active;
        const n = (pendingAreaPoly && pendingAreaPoly.length) || 0;
        const shape = getPendingPolyShape();
        const min = areaPolyMinPoints(shape);
        if (finishBtn) finishBtn.disabled = !active || n < min;
        if (textEl && active) {
            if (shape === 'polyline') {
                textEl.textContent = n >= min
                    ? `점 ${n}개 · 완료: 더블클릭 · Enter · 되돌리기: Backspace · 취소: Esc`
                    : '선의 점을 차례로 클릭하세요. 완료: 더블클릭 · Enter · 취소: Esc';
            } else {
                textEl.textContent = n >= 3
                    ? `점 ${n}개 · 완료: 첫 점 근처 클릭 · 더블클릭 · Enter`
                    : '다각형 꼭짓점을 찍으세요. 완료: 첫 점 근처 클릭 · 더블클릭 · Enter';
            }
        }
        syncAreaPolyTouchBar();
    }

    // --- 폰·태블릿 영역 마킹: 모양 고르기(다각형·선·타원·사각형) + 터치 다각형/선 (2026-10-03) ---
    // 그리기·저장은 PC와 같은 길(handleDragStart/End → openAddDefectModal, areaShape·areaPoints 그대로).
    function readAreaShapePref() {
        try {
            const v = localStorage.getItem('bsa_area_create_shape_v1');
            return (v === 'rect' || v === 'ellipse' || v === 'polygon' || v === 'polyline') ? v : null;
        } catch (_e) { return null; }
    }
    function writeAreaShapePref(shape) {
        try { localStorage.setItem('bsa_area_create_shape_v1', shape); } catch (_e) { /* 기기 저장 실패해도 그리기는 됨 */ }
    }

    /** 터치 다각형·선 탭 — 다각형은 첫 점 근처(화면 28px)를 다시 탭하면 닫는다. 선은 닫지 않고 점만 잇는다 */
    function commitTouchPolygonTap(tap) {
        const shape = getActivePolyCreateShape();
        if (!tap || !shape) return;
        if (!pendingAreaPoly) pendingAreaPoly = [];
        if (shape === 'polygon' && pendingAreaPoly.length >= 3) {
            const first = pendingAreaPoly[0];
            const scale = Math.max(0.0001, Number(state.view && state.view.scale) || 1);
            const screenDist = Math.hypot(tap.x - first.x, tap.y - first.y) * scale;
            if (screenDist < 28) {
                finishPendingAreaPolygon();
                return;
            }
        }
        addPendingPolyPoint(tap.x, tap.y);
    }

    function undoTouchPolygonPoint() {
        if (!pendingAreaPoly || !pendingAreaPoly.length) return;
        pendingAreaPoly.pop();
        syncAreaPolygonRedrawBanner();
        drawCanvas();
    }

    /** 선 그리기 취소(Esc·취소 버튼): 찍은 점을 버린다 */
    function cancelPendingPolyline() {
        if (isAreaPolygonRedrawActive()) {
            cancelAreaPolygonRedraw();
            return;
        }
        pendingAreaPoly = null;
        syncAreaPolygonRedrawBanner();
        drawCanvas();
        window.showToast?.('선 그리기를 취소했습니다.', 'info', 2200);
    }

    /** 다각형·선을 새로 그리는 중이면 아래 막대(점 수 · 되돌리기 · 완료 · 취소). PC·터치 공통 */
    function syncAreaPolyTouchBar() {
        const bar = document.getElementById('areaPolyTouchBar');
        if (!bar) return;
        const shape = getActivePolyCreateShape();
        const on = !!shape && !isAreaPolygonRedrawActive();
        bar.hidden = !on;
        if (!on) return;
        const n = (pendingAreaPoly && pendingAreaPoly.length) || 0;
        const min = areaPolyMinPoints(shape);
        const text = document.getElementById('areaPolyTouchText');
        if (text) {
            if (shape === 'polyline') {
                text.textContent = n === 0
                    ? '선: 위치를 차례로 클릭·탭하세요'
                    : (n < min ? `점 ${n}개 · ${min - n}개 더` : `점 ${n}개 · 완료(더블클릭·Enter) · 되돌리기(Backspace)`);
            } else {
                text.textContent = n === 0
                    ? '다각형: 꼭짓점을 클릭·탭하세요'
                    : (n < 3 ? `점 ${n}개 · ${3 - n}개 더` : `점 ${n}개 · 완료 또는 첫 점 탭`);
            }
        }
        const done = document.getElementById('btnAreaPolyTouchDone');
        if (done) done.disabled = n < min;
        const undo = document.getElementById('btnAreaPolyTouchUndo');
        if (undo) undo.disabled = n === 0;
    }

    // 함수로 둔다 — 초기화 중 syncAreaToolPanelUi가 먼저 불려도 TDZ 오류가 안 나게
    function areaShapeChoices() { return [
        { shape: 'polygon', label: '다각형', hint: '꼭짓점을 차례로 탭 → 완료', icon: 'fa-draw-polygon' },
        { shape: 'polyline', label: '선', hint: '점을 차례로 탭해 이어 긋기 → 완료 (닫지 않음)', icon: 'fa-chart-line' },
        { shape: 'ellipse', label: '타원', hint: '도면을 끌어서 그리기', icon: 'fa-circle' },
        { shape: 'rect', label: '사각형', hint: '도면을 끌어서 그리기 (PC 「박스」)', icon: 'fa-vector-square' }
    ]; }

    function syncMobileAreaRailIcon() {
        const btn = document.getElementById('mobileBtnModeArea');
        if (!btn) return;
        const shape = state.areaCreateShape || 'rect';
        const c = areaShapeChoices().find((x) => x.shape === shape) || areaShapeChoices().find((x) => x.shape === 'rect');
        const icon = btn.querySelector('i');
        if (icon) icon.className = (c.shape === 'ellipse' ? 'fa-regular ' : 'fa-solid ') + c.icon;
        btn.setAttribute('title', `영역 마킹 — ${c.label} (눌러서 모양 바꾸기)`);
    }

    function closeAreaShapePicker() {
        const el = document.getElementById('areaShapePicker');
        if (el) el.remove();
        document.removeEventListener('pointerdown', onAreaShapePickerOutside, true);
    }
    function onAreaShapePickerOutside(e) {
        const el = document.getElementById('areaShapePicker');
        if (!el) return;
        if (el.contains(e.target)) return;
        const btn = document.getElementById('mobileBtnModeArea');
        if (btn && btn.contains(e.target)) return; // 버튼 클릭이 닫고 다시 연다
        closeAreaShapePicker();
    }

    /** 폰·태블릿: 영역 버튼을 누르면 모양 고르기. 고르면 그 모양으로 영역 모드, 다음에도 기억 */
    function openAreaShapePicker(anchor) {
        if (document.getElementById('areaShapePicker')) { closeAreaShapePicker(); return; }
        const cur = state.areaCreateShape || readAreaShapePref() || 'rect';
        const el = document.createElement('div');
        el.id = 'areaShapePicker';
        el.className = 'area-shape-picker';
        el.setAttribute('role', 'menu');
        el.innerHTML = '<div class="area-shape-picker-title">영역 모양</div>'
            + areaShapeChoices().map((c) => `
                <button type="button" class="area-shape-picker-item${c.shape === cur ? ' active' : ''}" role="menuitemradio"
                    aria-checked="${c.shape === cur}" data-area-shape-pick="${c.shape}">
                    <i class="${c.shape === 'ellipse' ? 'fa-regular' : 'fa-solid'} ${c.icon}" aria-hidden="true"></i>
                    <span class="area-shape-picker-text"><b>${c.label}</b><small>${c.hint}</small></span>
                </button>`).join('');
        document.body.appendChild(el);
        // 버튼 옆(오른쪽 레일이면 왼쪽으로) — 화면 안에 들어오게
        const r = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth - 60, right: window.innerWidth - 10, top: 120, bottom: 160 };
        const w = el.offsetWidth || 220;
        const h = el.offsetHeight || 180;
        let left = r.left - w - 8;
        if (left < 8) left = Math.min(window.innerWidth - w - 8, r.right + 8);
        let top = Math.max(8, Math.min(window.innerHeight - h - 8, r.top + (r.bottom - r.top) / 2 - h / 2));
        el.style.left = Math.round(left) + 'px';
        el.style.top = Math.round(top) + 'px';
        el.querySelectorAll('[data-area-shape-pick]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const shape = b.getAttribute('data-area-shape-pick');
                closeAreaShapePicker();
                pickAreaShapeFromTouch(shape);
            });
        });
        setTimeout(() => document.addEventListener('pointerdown', onAreaShapePickerOutside, true), 0);
    }

    function pickAreaShapeFromTouch(shape) {
        const next = (shape === 'ellipse' || shape === 'polygon' || shape === 'polyline') ? shape : 'rect';
        writeAreaShapePref(next);
        setAreaCreateShape(next);
        syncMobileAreaRailIcon();
        const c = areaShapeChoices().find((x) => x.shape === next);
        window.showToast?.(next === 'polygon'
            ? '다각형: 꼭짓점을 차례로 탭하고 「완료」 또는 첫 점을 다시 탭하세요. 끌면 도면 이동'
            : (next === 'polyline'
                ? '선: 점을 차례로 탭해 이어 긋고 「완료」를 누르세요(「되돌리기」로 마지막 점 취소). 끌면 도면 이동'
                : `${c ? c.label : '영역'}: 도면을 손가락으로 끌어서 그리세요`), 'info', 3200);
    }
    window.openAreaShapePicker = openAreaShapePicker;

    function discardIncompleteAreaPolygon(options) {
        const silent = !!(options && options.silent);
        const wasRedraw = isAreaPolygonRedrawActive();
        const shape = getPendingPolyShape();
        const hadPts = !!(pendingAreaPoly && pendingAreaPoly.length);
        pendingAreaPoly = null;
        pendingAreaPolyRedraw = null;
        syncAreaPolygonRedrawBanner();
        if (silent || !hadPts) return;
        const label = shape === 'polyline' ? '선' : '다각형';
        if (wasRedraw) window.showToast?.(`${label} 다시그리기를 취소했습니다.`, 'info');
        else window.showToast?.(`${label}은 점 ${areaPolyMinPoints(shape)}개 이상일 때 저장됩니다.`, 'info', 2500);
    }

    function cancelAreaPolygonRedraw(options) {
        const silent = !!(options && options.silent);
        const keepMode = !!(options && options.keepMode);
        const had = isAreaPolygonRedrawActive();
        const rd = pendingAreaPolyRedraw;
        pendingAreaPoly = null;
        pendingAreaPolyRedraw = null;
        syncAreaPolygonRedrawBanner();
        if (!keepMode && state.mode !== 'PAN') setDrawMode('PAN');
        else drawCanvas();
        if (had && !silent) {
            const label = rd && rd.shape === 'polyline' ? '선' : '다각형';
            window.showToast?.(rd && rd.fromPin
                ? `${label}으로 바꾸기를 취소했습니다. (핀 마킹 그대로)`
                : `${label} 다시그리기를 취소했습니다.`, 'info');
        }
    }

    /** 점 목록을 마킹에 적용. 핀(일반) 마킹이면 영역으로 바꾸면서 같은 번호·사진·내용을 그대로 쓴다 */
    function applyAreaPolygonRedraw(defectId, pts, shape, fromPin) {
        const want = shape === 'polyline' ? 'polyline' : 'polygon';
        if (!defectId || !Array.isArray(pts) || pts.length < areaPolyMinPoints(want)) return false;
        const defect = getCurrentFloorDefects().find((d) => d && d.id === defectId);
        const isAreaDef = !!(defect && defect.shapeType === 'area' && defect.areaX1 !== undefined);
        if (!defect || (!isAreaDef && !fromPin)) {
            window.showToast?.('마킹을 찾을 수 없습니다.', 'warning');
            return false;
        }
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        const prevShape = isAreaDef ? getAreaShape(defect) : null;
        if (!isAreaDef) convertDefectPinToArea(defect); // 번호·사진·내용·층 키는 그대로, 영역 필드만 붙음
        defect.areaShape = want;
        defect.areaPoints = pts.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
        defect.areaAngle = 0;
        if (typeof syncAreaBboxFromPoints === 'function') syncAreaBboxFromPoints(defect);
        if (typeof ensureAreaPinPlacement === 'function') ensureAreaPinPlacement(defect);
        if (!isAreaDef || prevShape !== want) {
            // 모양이 바뀌면 화살표 끝을 번호 박스에서 가까운 새 모양 위 지점에 다시 붙인다
            const attach = getAreaCenterBorderAttachDefect(defect.x, defect.y, defect);
            defect.targetX = attach.x;
            defect.targetY = attach.y;
        }
        if (typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(defect);
        defect.updatedAt = Date.now();
        if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
            discardStalePendingRemoteAfterLocalPinEdit();
        }
        saveStateToLocalStorage();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof updateMapSelectionBar === 'function') {
            updateMapSelectionBar({ scrollToSelection: false });
        }
        const label = want === 'polyline' ? '선' : '다각형';
        window.showToast?.(!isAreaDef
            ? `${label}으로 변경했습니다. (번호·사진·내용 그대로)`
            : `${label}을 다시 그렸습니다.`, 'success');
        return true;
    }

    /**
     * 점 찍어 그리기 시작(기존 영역 다시그리기 · 핀 마킹을 다각형/선으로 바꾸기 공용)
     * shape: 'polygon' | 'polyline', opts.fromPin: 일반(핀) 마킹에서 시작 — 완료해야 영역으로 바뀌고, 취소하면 핀 그대로
     */
    function startAreaPolygonRedraw(defect, shape, opts) {
        const want = shape === 'polyline' ? 'polyline' : 'polygon';
        const isAreaDef = !!(defect && defect.shapeType === 'area' && defect.areaX1 !== undefined);
        const fromPin = !!(opts && opts.fromPin) && !isAreaDef;
        if (!defect || !defect.id || (!isAreaDef && !fromPin)) {
            window.showToast?.('저장된 마킹만 다시 그릴 수 있습니다.', 'warning');
            return false;
        }
        if (canFinishPendingPoly() && !isAreaPolygonRedrawActive()) {
            finishPendingAreaPolygon({ skipModeSwitch: true });
        } else if (pendingAreaPoly && pendingAreaPoly.length && !isAreaPolygonRedrawActive()) {
            pendingAreaPoly = null;
        }
        pendingAreaPolyRedraw = { defectId: defect.id, shape: want, fromPin };
        pendingAreaPoly = [];
        state.areaInkTool = null;
        pendingInkPoly = null;
        isAreaInkDrag = false;
        areaInkStroke = null;
        state.areaCreateShape = want;
        selectedDefectIds = new Set([defect.id]);
        if (typeof updateMapSelectionBar === 'function') {
            updateMapSelectionBar({ scrollToSelection: false });
        }
        if (state.mode !== 'AREA') setDrawMode('AREA');
        else syncAreaToolPanelUi();
        syncAreaPolygonRedrawBanner();
        drawCanvas();
        const alreadySame = isAreaDef && getAreaShape(defect) === want;
        window.showToast?.(
            want === 'polyline'
                ? (fromPin
                    ? '선의 점을 차례로 찍으세요. 완료: 더블클릭 · Enter / 취소: Esc (취소하면 핀 그대로)'
                    : '선의 점을 다시 찍으세요. 완료: 더블클릭 · Enter / 취소: Esc')
                : (fromPin
                    ? '꼭짓점을 찍어 다각형으로 바꿉니다. 완료: 첫 점 근처 클릭 · 더블클릭 · Enter (취소하면 핀 그대로)'
                    : (alreadySame
                        ? '다각형 꼭짓점을 다시 찍으세요. 완료: 첫 점 근처 클릭 · 더블클릭 · Enter'
                        : '꼭짓점을 찍어 다각형으로 바꿉니다. 완료: 첫 점 근처 클릭 · 더블클릭 · Enter')),
            'info',
            4200
        );
        return true;
    }

    function finishPendingAreaPolygon(options) {
        const skipModeSwitch = !!(options && options.skipModeSwitch);
        const shape = getPendingPolyShape();
        const min = areaPolyMinPoints(shape);
        if (!pendingAreaPoly || pendingAreaPoly.length < min) {
            if (isAreaPolygonRedrawActive()) {
                // 완료 제스처가 점 부족일 때는 세션 유지 (취소 버튼/Esc 미만만 종료)
                window.showToast?.(`${shape === 'polyline' ? '선' : '다각형'}은 점 ${min}개 이상일 때 저장됩니다. 점을 더 찍어 주세요.`, 'info', 2800);
                drawCanvas();
                return false;
            }
            pendingAreaPoly = null;
            drawCanvas();
            return false;
        }
        const pts = pendingAreaPoly.map((p) => ({ x: p.x, y: p.y }));
        pendingAreaPoly = null;
        const redraw = pendingAreaPolyRedraw;
        pendingAreaPolyRedraw = null;
        syncAreaPolygonRedrawBanner();
        if (redraw && redraw.defectId) {
            applyAreaPolygonRedraw(redraw.defectId, pts, redraw.shape || shape, !!redraw.fromPin);
            if (!skipModeSwitch) setDrawMode('PAN');
            drawCanvas();
            return true;
        }
        let x1 = pts[0].x, y1 = pts[0].y, x2 = pts[0].x, y2 = pts[0].y;
        pts.forEach((p) => {
            x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
            x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
        });
        openAddDefectModal(x1, y1, undefined, undefined, null, {
            x1, y1, x2, y2,
            areaShape: shape,
            areaAngle: 0,
            areaPoints: pts
        }, { revealMarkingAboveDrawer: true, fromCanvas: true });
        if (!skipModeSwitch) setDrawMode('PAN');
        drawCanvas();
        return true;
    }

    function syncAreaToolPanelUi() {
        const panel = document.getElementById('areaToolPanel');
        if (panel) {
            const show = state.mode === 'AREA' || !!state.areaInkTool || !!getSelectedAreaForInk();
            panel.hidden = !show;
        }
        const create = state.areaCreateShape || 'rect';
        document.querySelectorAll('[data-area-create]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-area-create') === create);
        });
        const ink = state.areaInkTool || '';
        document.querySelectorAll('[data-area-ink]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-area-ink') === ink);
        });
        const mobInk = document.getElementById('mobileBtnAreaInk');
        if (mobInk) mobInk.classList.toggle('active', !!state.areaInkTool);
        syncMarkShapeBar();
        syncAreaPolyTouchBar();
        syncMobileAreaRailIcon();
    }

    function setAreaCreateShape(shape) {
        const next = normalizeAreaShape(shape === 'ellipse' || shape === 'polygon' || shape === 'polyline' ? shape : 'rect');
        // 다른 도형 버튼으로 바꾸면 그리던 다각형·선은 그 모양으로 저장(점 모자라면 버림)
        if (pendingAreaPoly && pendingAreaPoly.length && next !== getPendingPolyShape()) {
            if (canFinishPendingPoly()) finishPendingAreaPolygon({ skipModeSwitch: true });
            else discardIncompleteAreaPolygon();
        }
        state.areaCreateShape = next;
        state.areaInkTool = null;
        pendingInkPoly = null;
        if (state.mode !== 'AREA') setDrawMode('AREA');
        else syncAreaToolPanelUi();
    }

    /** 마킹(핀) 모드의 모양 고르기: 핀 / 다각형 / 선 — 다각형·선이면 영역 마킹과 같은 길로 번호와 함께 생성 */
    function setMarkCreateShape(shape) {
        const next = (shape === 'polygon' || shape === 'polyline') ? shape : 'pin';
        if (pendingAreaPoly && pendingAreaPoly.length && !isAreaPolygonRedrawActive()) {
            const keep = (next === 'polygon' || next === 'polyline') && next === getPendingPolyShape();
            if (!keep) {
                if (canFinishPendingPoly()) finishPendingAreaPolygon({ skipModeSwitch: true });
                else discardIncompleteAreaPolygon({ silent: true });
            }
        }
        state.markCreateShape = next;
        state.areaInkTool = null;
        pendingInkPoly = null;
        if (state.mode !== 'MARK') setDrawMode('MARK');
        else syncAreaToolPanelUi();
        if (state.mode === 'MARK') {
            window.showToast?.(next === 'polygon'
                ? '다각형 마킹: 꼭짓점을 차례로 찍고 완료하면 번호·핀과 함께 만들어집니다'
                : (next === 'polyline'
                    ? '선 마킹: 점을 차례로 찍어 이어 긋고 완료(더블클릭·Enter·완료 버튼)하면 번호와 함께 만들어집니다'
                    : '핀 마킹: 위치를 눌러 찍으세요'), 'info', 2800);
        }
    }

    function syncMarkShapeBar() {
        const bar = document.getElementById('markShapeBar');
        if (!bar) return;
        bar.hidden = state.mode !== 'MARK';
        const cur = (state.markCreateShape === 'polygon' || state.markCreateShape === 'polyline') ? state.markCreateShape : 'pin';
        bar.querySelectorAll('[data-mark-create]').forEach((b) => {
            const on = b.getAttribute('data-mark-create') === cur;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function setAreaInkTool(tool) {
        const next = (tool === 'line' || tool === 'rect' || tool === 'polygon' || tool === 'ellipse' || tool === 'path') ? tool : null;
        if (next && !getSelectedAreaForInk()) {
            window.showToast?.('내부 그리기 전에 영역을 선택하세요.', 'info', 2500);
            return;
        }
        if (next && pendingAreaPoly && pendingAreaPoly.length) {
            if (canFinishPendingPoly()) finishPendingAreaPolygon({ skipModeSwitch: true });
            else discardIncompleteAreaPolygon();
        }
        state.areaInkTool = next;
        pendingInkPoly = null;
        if (next) state.mode = 'PAN';
        syncAreaToolPanelUi();
        if (elements.planCanvas) elements.planCanvas.style.cursor = next ? 'crosshair' : getMapCanvasCursor();
    }

    function undoLastAreaInk() {
        const target = getSelectedAreaForInk();
        if (!target || !Array.isArray(target.areaDrawings) || !target.areaDrawings.length) {
            window.showToast?.('지울 내부 그리기가 없습니다.', 'info');
            return;
        }
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        target.areaDrawings.pop();
        saveStateToLocalStorage();
        drawCanvas();
    }

    function setupAreaToolPanelEvents() {
        document.querySelectorAll('[data-area-create]').forEach((btn) => {
            btn.addEventListener('click', () => setAreaCreateShape(btn.getAttribute('data-area-create')));
        });
        document.querySelectorAll('[data-mark-create]').forEach((btn) => {
            btn.addEventListener('click', () => setMarkCreateShape(btn.getAttribute('data-mark-create')));
        });
        document.querySelectorAll('[data-area-ink]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const t = btn.getAttribute('data-area-ink');
                setAreaInkTool(state.areaInkTool === t ? null : t);
            });
        });
        const undoBtn = document.getElementById('btnAreaInkUndo');
        if (undoBtn) undoBtn.addEventListener('click', undoLastAreaInk);
        const finishRedrawBtn = document.getElementById('btnFinishAreaPolygonRedraw');
        if (finishRedrawBtn) {
            finishRedrawBtn.addEventListener('click', () => {
                if (!isAreaPolygonRedrawActive()) return;
                if (!canFinishPendingPoly()) {
                    const need = areaPolyMinPoints(getPendingPolyShape());
                    window.showToast?.(`${getPendingPolyShape() === 'polyline' ? '선' : '다각형'}은 점 ${need}개 이상일 때 저장됩니다. 점을 더 찍어 주세요.`, 'info', 2800);
                    return;
                }
                finishPendingAreaPolygon();
            });
        }
        const cancelRedrawBtn = document.getElementById('btnCancelAreaPolygonRedraw');
        if (cancelRedrawBtn) {
            cancelRedrawBtn.addEventListener('click', () => cancelAreaPolygonRedraw());
        }
        const mobInk = document.getElementById('mobileBtnAreaInk');
        if (mobInk) {
            mobInk.addEventListener('click', () => {
                if (state.areaInkTool) setAreaInkTool(null);
                else setAreaInkTool('path');
            });
        }
        const angEl = document.getElementById('defectAreaAngle');
        if (angEl) {
            angEl.addEventListener('change', () => {
                if (isDefectBulkEditMode()) markDefectBulkFieldChanged('areaAngle');
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
        }
        syncAreaToolPanelUi();
    }

    const btnModePan = document.getElementById('btnModePan');
    const btnModeMark = document.getElementById('btnModeMark');
    const btnModeArea = document.getElementById('btnModeArea');
    if (btnModePan && btnModeMark) {
        btnModePan.addEventListener('click', () => setDrawMode('PAN'));
        btnModeMark.addEventListener('click', () => setDrawMode('MARK'));
        if (btnModeArea) btnModeArea.addEventListener('click', () => setDrawMode('AREA'));
    }
    // 도면 메모 도구·보이기·출력 설정
    const btnModeMemo = document.getElementById('btnModeMemo');
    if (btnModeMemo) btnModeMemo.addEventListener('click', () => setDrawMode(state.mode === 'MEMO' ? 'PAN' : 'MEMO'));
    const mobileBtnModeMemo = document.getElementById('mobileBtnModeMemo');
    // 2026-10-16 폰·태블릿 오른쪽 메모 버튼: 손글씨 팝업(팝업 안 「텍스트 메모」로 예전 메모 모드). 메모 모드 중이면 예전처럼 끈다.
    // 2026-10-16 사용자 요청: 손글씨도 메모 모드(메모 목록)에서 추가 — 버튼은 예전처럼 메모 모드 켜기/끄기
    if (mobileBtnModeMemo) mobileBtnModeMemo.addEventListener('click', () => setDrawMode(state.mode === 'MEMO' ? 'PAN' : 'MEMO'));
    ['btnModeGuide', 'mobileBtnModeGuide'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', (e) => { e.preventDefault(); setDrawMode(state.mode === 'GUIDE' ? 'PAN' : 'GUIDE'); });
    });
    const btnMemoBarDone = document.getElementById('btnMemoBarDone');
    if (btnMemoBarDone) btnMemoBarDone.addEventListener('click', () => setDrawMode('PAN'));
    document.querySelectorAll('[data-memo-show]').forEach((el) => el.addEventListener('change', () => setMemoShow(el.checked)));
    document.querySelectorAll('[data-memo-print]').forEach((el) => el.addEventListener('change', () => setMemoPrint(el.checked)));
    document.querySelectorAll('[data-crack-width-badge]').forEach((el) => el.addEventListener('change', () => setCrackWidthBadgeShow(el.checked)));
    syncDrawingMemoBar();
    syncCrackWidthBadgeUi();
    setupAreaToolPanelEvents();

    const btnSnapToCad = document.getElementById('btnSnapToCad');
    const mobileBtnSnapToCad = document.getElementById('mobileBtnSnapToCad');
    if (state.snapToCad === undefined) state.snapToCad = true;
    // 터치 기기는 스냅 버튼이 없다 — 예전에 꺼 둔 채로 숨어 버리지 않게 기본값(켬)으로
    if (isTouchToolbarUi()) state.snapToCad = true;
    function syncSnapToCadButtons() {
        const on = state.snapToCad !== false;
        if (btnSnapToCad) btnSnapToCad.classList.toggle('active', on);
        if (mobileBtnSnapToCad) mobileBtnSnapToCad.classList.toggle('active', on);
    }
    function toggleSnapToCad() {
        state.snapToCad = state.snapToCad === false ? true : false;
        syncSnapToCadButtons();
        saveStateToLocalStorage();
        window.showToast?.(state.snapToCad ? 'CAD 스냅 켜짐' : 'CAD 스냅 꺼짐', 'info', 1500);
        if (state.snapToCad !== false && state.currentBuilding && state.currentFloor) {
            ensureFloorPlanRefForPdf(state.currentBuilding, state.currentFloor).catch(() => {});
        }
    }
    syncSnapToCadButtons();
    if (btnSnapToCad) btnSnapToCad.addEventListener('click', toggleSnapToCad);
    if (mobileBtnSnapToCad) mobileBtnSnapToCad.addEventListener('click', toggleSnapToCad);
    setupDrawingCrosshairToggleButtons();

    // @@GRID_LINES_START — 도면 행·열(통심) 선 (실험 exp/grid-lines, 2026-09-28)
    // 계산은 js/shared/grid-lines.js(window.BSA.gridLines). 여기서는 저장·그리기·편집 화면·위치 자동 입력만.
    function gridLib() {
        return (window.BSA && window.BSA.gridLines) || null;
    }

    function gridEsc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function getGridFloorKey() {
        if (!state.currentBuildingId || !state.currentFloor) return '';
        return getFloorMapStyleKey(state.currentBuildingId, state.currentFloor);
    }

    function getGridCtx() {
        const dims = getFloorPlanDisplayDims();
        return { rot: state.rotationAngle || 0, w: dims.w, h: dims.h };
    }

    /** 지금 층의 행·열 선 데이터(없으면 create일 때만 새로 만듦). 저장 형식은 한 번 정리해서 제자리에 둔다 */
    function getCurrentFloorGrid(create) {
        const G = gridLib();
        const key = getGridFloorKey();
        if (!G || !key) return null;
        let raw = state.floorGridLines && state.floorGridLines[key];
        if (!raw && !create) return null;
        if (raw && raw.__gridNorm) return raw;
        const norm = G.normalizeGrid(raw || {});
        Object.defineProperty(norm, '__gridNorm', { value: true, enumerable: false });
        if (!state.floorGridLines || typeof state.floorGridLines !== 'object') state.floorGridLines = {};
        state.floorGridLines[key] = norm;
        return norm;
    }

    function gridHasLines(grid) {
        return !!(grid && (grid.groups || []).some((g) => (g.lines || []).length));
    }

    function gridEditState() {
        if (!window.BSA_gridEdit) {
            window.BSA_gridEdit = {
                active: false,
                tool: 'col',
                sel: null,
                activeGroup: { col: null, row: null },
                editGroupId: null,
                zoneId: null, // 고른 구역(null = 구역 밖)
                zoneRedrawId: null, // 「범위 다시 그리기」 중인 구역
                polyDraft: null, // 찍고 있는 다각형 구역의 꼭짓점들
                drag: null,
                bendArmed: false,
                lastAddAt: 0,
                renderedKey: '',
                collapsed: false,
                onPointerDown: gridPointerDown,
                onDblClick: gridDblClick,
                cancelDrag: gridCancelDrag
            };
        }
        return window.BSA_gridEdit;
    }

    function gridSnap(p) {
        if ((state.snapToCad === false && !isTouchToolbarUi()) || !window.BSA_PDF_SNAP) return p;
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        if (!bldg || !fc) return p;
        try {
            const hit = window.BSA_PDF_SNAP.snap(bldg.id, fc, p.x, p.y, SNAP_SCREEN_RADIUS_PX / (state.view.scale || 1));
            return hit ? { x: hit.x, y: hit.y } : p;
        } catch (e) {
            return p;
        }
    }

    function gridChanged(opts) {
        drawCanvas();
        if (!opts || opts.panel !== false) renderGridPanel();
        clearTimeout(window._bsaGridSaveTimer);
        window._bsaGridSaveTimer = setTimeout(() => {
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        }, 500);
    }

    // ---- 그리기(화면 전용 — 내보내기에는 안 들어감) ----
    function drawFloorGridOverlay(ctx, imgW, imgH) {
        const G = gridLib();
        if (!G) return;
        resolvePendingGridScaleForCurrentFloor(); // 다른 층에서 복사해 온 선 → 이 층 도면 크기에 맞춤(한 번)
        checkFloorDrawingSizeChange();
        scheduleGridLocFreshness();
        const ge = window.BSA_gridEdit;
        const editing = !!(ge && ge.active);
        const key = getGridFloorKey();
        if (editing && ge.renderedKey !== key) {
            ge.renderedKey = key;
            ge.sel = null;
            ge.bendArmed = false;
            ge.zoneId = null;
            ge.zoneRedrawId = null;
            ge.polyDraft = null;
            setTimeout(renderGridPanel, 0);
        }
        const grid = getCurrentFloorGrid(false);
        // 2026-09-28: 행·열 설정 중에만 보임 — 설정이 끝나면 선·이름·폭 모두 숨김(저장된 visible 값은 무시).
        // 위치 자동 입력은 숨겨져 있어도 계속 동작한다.
        if (!editing) return;
        // 구역 사각형(설정 중에만) — 선보다 먼저(아래)
        const zoneDraft = (ge.drag && ge.drag.kind === 'zoneNew' && ge.drag.moved && ge.drag.cur) ? ge.drag : null;
        const polyDrafting = !!(ge.polyDraft && ge.polyDraft.length);
        if (zoneDraft || polyDrafting || (grid && (grid.zones || []).length)) drawGridZones(ctx, grid, zoneDraft);
        drawGridAutoPreview(ctx);
        if (!grid || !gridHasLines(grid)) return;
        const gctx = { rot: state.rotationAngle || 0, w: imgW, h: imgH };
        const s = state.view.scale || 1;
        const rotRad = (gctx.rot * Math.PI) / 180;
        const sel = editing ? ge.sel : null;
        const tracePath = (pts) => {
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        };
        ctx.save();
        grid.groups.forEach((g) => {
            const od = G.orderedLines(g, gctx);
            od.items.forEach((it) => {
                const ln = it.line;
                const pts = ln.pts;
                const isSel = !!(sel && sel.lineId === ln.id);
                if (editing) {
                    const band = G.lineBand(ln, g, gctx);
                    if (band > 0) {
                        ctx.setLineDash([]);
                        ctx.lineCap = 'butt';
                        ctx.lineJoin = 'miter';
                        ctx.strokeStyle = isSel ? 'rgba(249, 115, 22, 0.16)' : 'rgba(14, 116, 144, 0.12)';
                        ctx.lineWidth = band;
                        tracePath(pts);
                        ctx.stroke();
                    }
                }
                ctx.setLineDash([10 / s, 4 / s, 2 / s, 4 / s]);
                ctx.lineCap = 'round';
                ctx.strokeStyle = isSel ? '#f97316' : (editing ? 'rgba(14, 116, 144, 0.9)' : 'rgba(14, 116, 144, 0.55)');
                ctx.lineWidth = (isSel ? 2 : 1.2) / s;
                tracePath(pts);
                ctx.stroke();
                ctx.setLineDash([]);
                if (editing) {
                    const hs = (isSel ? 5 : 3.5) / s;
                    pts.forEach((p, vi) => {
                        const vSel = isSel && sel.vertexIndex === vi;
                        ctx.fillStyle = vSel ? '#f97316' : '#ffffff';
                        ctx.strokeStyle = isSel ? '#f97316' : 'rgba(14, 116, 144, 0.9)';
                        ctx.lineWidth = 1.2 / s;
                        ctx.fillRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
                        ctx.strokeRect(p.x - hs, p.y - hs, hs * 2, hs * 2);
                    });
                }
                // 이름 풍선 — 양 끝(도면 안쪽), 글자는 화면 기준으로 똑바로
                const fontPx = 11 / s;
                ctx.font = `700 ${fontPx}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                const tw = ctx.measureText(it.name).width;
                const r = Math.max(10 / s, tw / 2 + 4 / s);
                const ends = [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]];
                ends.forEach(([endP, nextP]) => {
                    const dx = nextP.x - endP.x;
                    const dy = nextP.y - endP.y;
                    const L = Math.hypot(dx, dy) || 1;
                    const cx = endP.x + (dx / L) * (r + 2 / s);
                    const cy = endP.y + (dy / L) * (r + 2 / s);
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.fill();
                    ctx.lineWidth = 1.2 / s;
                    ctx.strokeStyle = isSel ? '#f97316' : '#0e7490';
                    ctx.stroke();
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(-rotRad);
                    ctx.fillStyle = isSel ? '#c2410c' : '#0e7490';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(it.name, 0, 0);
                    ctx.restore();
                });
            });
        });
        ctx.restore();
    }

    // ---- 2026-11-02 자동 잡기 ----
    const GRID_AUTO_SENS = { normal: 0.30, short: 0.18, long: 0.50 };

    /** 후보 → 화면 방향 기준 { col: [{pts,label}], row: [...] } (화면이 90·270° 돌아 있으면 수직선은 행, 수평선은 열) */
    function gridAutoCandidatesByAxis(ap) {
        const rot = ((Number(ap.rot) || 0) % 360 + 360) % 360;
        const swap = rot === 90 || rot === 270;
        const vert = ap.res.cols.map((l) => ({ pts: [{ x: l.x, y: l.y1 }, { x: l.x, y: l.y2 }], label: l.label || '', series: l.series || 0 }));
        const horz = ap.res.rows.map((l) => ({ pts: [{ x: l.x1, y: l.y }, { x: l.x2, y: l.y }], label: l.label || '', series: l.series || 0 }));
        const labelled = ap.res.labelled || {};
        const out = swap
            ? { col: horz, row: vert, labelled: { col: !!labelled.rows, row: !!labelled.cols } }
            : { col: vert, row: horz, labelled: { col: !!labelled.cols, row: !!labelled.rows } };
        // 2026-11-02 찾을 방향: 입면도처럼 열(X)만 필요한 도면은 행 후보를 뺀다
        if (ap.axes === 'cols') out.row = [];
        if (ap.axes === 'rows') out.col = [];
        return out;
    }

    function drawGridAutoPreview(ctx) {
        const ge = window.BSA_gridEdit;
        const ap = ge && ge.autoPreview;
        if (!ap || ap.key !== getGridFloorKey()) return;
        const s = state.view.scale || 1;
        const rotRad = ((state.rotationAngle || 0) * Math.PI) / 180;
        const by = gridAutoCandidatesByAxis(ap);
        ctx.save();
        ['col', 'row'].forEach((axis) => {
            by[axis].forEach((c, i) => {
                const a = c.pts[0];
                const b = c.pts[1];
                ctx.setLineDash([12 / s, 6 / s]);
                ctx.lineCap = 'butt';
                ctx.strokeStyle = '#ea580c';
                ctx.lineWidth = 2.2 / s;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.setLineDash([]);
                const text = c.label || '';
                if (!text) return;
                const fontPx = 12 / s;
                ctx.font = `700 ${fontPx}px "Pretendard", "Malgun Gothic", sans-serif`;
                const r = Math.max(10 / s, ctx.measureText(text).width / 2 + 4 / s);
                [a, b].forEach((p) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(255, 247, 237, 0.95)';
                    ctx.fill();
                    ctx.strokeStyle = '#ea580c';
                    ctx.lineWidth = 1.4 / s;
                    ctx.stroke();
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(-rotRad);
                    ctx.fillStyle = '#c2410c';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, 0, 0);
                    ctx.restore();
                });
            });
        });
        ctx.restore();
    }

    async function gridAutoDetect() {
        const ge = gridEditState();
        const D = window.BSA && window.BSA.gridAutoDetect;
        const snapApi = window.BSA_PDF_SNAP;
        if (!D || !snapApi || typeof snapApi.getDetectionData !== 'function') {
            window.showToast?.('자동 잡기 모듈을 불러오지 못했습니다. Ctrl+F5로 새로고침해 주세요.', 'error', 3000);
            return;
        }
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        if (!bldg || !fc || !state.bgImage) {
            window.showToast?.('도면이 있는 층에서 쓸 수 있습니다.', 'info', 2000);
            return;
        }
        window.showToast?.('도면에서 통심선을 찾는 중입니다…', 'info', 1500);
        try { await ensureFloorPlanRefForPdf(bldg, fc); } catch (_e) { /* 아래에서 자료가 없으면 안내 */ }
        const data = snapApi.getDetectionData(bldg.id, fc);
        if (!data) {
            window.showToast?.('이 층은 캐드 PDF 원본이 없어 자동으로 못 잡습니다(그림 도면). 직접 그어 주세요.', 'warning', 4500);
            return;
        }
        const dims = getGridReliableDims() || { w: data.w, h: data.h };
        const res = D.detect(
            { segments: data.segments, small: data.small, texts: data.texts },
            dims,
            { minSpanFrac: GRID_AUTO_SENS[ge.autoSens || 'normal'] || GRID_AUTO_SENS.normal, outerOnly: ge.autoOuter !== 'all' }
        );
        if (!res.cols.length && !res.rows.length) {
            ge.autoPreview = null;
            renderGridPanel();
            drawCanvas();
            window.showToast?.('번호 풍선·글자를 못 찾았습니다(글자가 그림으로 된 PDF일 수 있음). 민감도를 「짧은 선도」로 바꿔 다시 눌러 보거나 직접 그어 주세요.', 'warning', 5000);
            return;
        }
        ge.autoPreview = { key: getGridFloorKey(), res, dims, rot: state.rotationAngle || 0, axes: ge.autoAxes || 'both' };
        renderGridPanel();
        drawCanvas();
        const shown = gridAutoCandidatesByAxis(ge.autoPreview);
        window.showToast?.(`열 ${shown.col.length}개 · 행 ${shown.row.length}개 후보를 찾았습니다. 주황 점선이 맞으면 「적용」을 누르세요.`, 'success', 4500);
    }

    async function gridAutoApply() {
        const ge = gridEditState();
        const G = gridLib();
        const ap = ge.autoPreview;
        if (!G || !ap || ap.key !== getGridFloorKey()) return;
        const grid = getCurrentFloorGrid(true);
        const gctx = getGridCtx();
        const by = gridAutoCandidatesByAxis(ap);
        // 이미 그은 선이 있는 축은 지우지 않고 새 그룹으로 붙인다(겹치면 「그룹 삭제」로 지움)
        const existing = ['col', 'row'].reduce((n, ax) => n + grid.groups.filter((g) => g.axis === ax && !g.zoneId).reduce((m, g) => m + (g.lines || []).length, 0), 0);
        if (existing > 0 && !await window.appConfirm(`이 층에 이미 행·열 선 ${existing}개가 있습니다.\n기존 선은 그대로 두고 자동으로 잡은 선을 새 그룹으로 추가할까요?\n(겹치면 그룹을 골라 「그룹 삭제」로 지울 수 있습니다)`)) return;
        let added = 0;
        ['col', 'row'].forEach((axis) => {
            const items = by[axis];
            if (!items.length) return;
            const labelled = !!by.labelled[axis];
            const base = G.DEFAULT_PREFIX[axis];
            // 2026-11-02 증축으로 번호 계열이 바뀌는 도면(A~D 다음 1~4 · X1~ 다음 A1~): 계열마다 그룹을 따로 둔다(도면 글자를 쓸 때만)
            const seriesKeys = labelled ? Array.from(new Set(items.map((c) => c.series || 0))).sort((a, b) => a - b) : [0];
            seriesKeys.forEach((sk) => {
                const part = labelled ? items.filter((c) => (c.series || 0) === sk) : items;
                if (!part.length) return;
                const same = grid.groups.filter((g) => g.axis === axis && !g.zoneId).length;
                const g = G.createGroup(axis, {
                    // 도면 축 번호를 이름으로 쓰면 머리글 없이(도면 표기 그대로), 아니면 X·Y(둘째 그룹부터 AX·BX…)
                    prefix: labelled ? '' : (same ? `${String.fromCharCode(65 + same)}${base}` : base),
                    band: G.defaultBand(gctx.w, gctx.h)
                });
                part.forEach((c) => {
                    const ln = { id: `gl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, pts: c.pts.map((p) => ({ x: p.x, y: p.y })) };
                    if (labelled && c.label) ln.label = c.label;
                    G.addLineToGroup(g, ln);
                    added++;
                });
                G.renumberBySpatialOrder(g, gctx); // 화면 기준 왼→오른 / 위→아래 번호
                grid.groups.push(g);
                ge.activeGroup[axis] = g.id;
                ge.editGroupId = g.id;
            });
        });
        ge.autoPreview = null;
        ge.zoneId = null;
        // 2026-11-02 「자동으로 잡고 좀 옮길 수 있게」 — 적용하면 바로 「선택·이동」 도구로 바꿔 선을 끌거나 ◀▶ 버튼으로 옮길 수 있게 한다
        ge.tool = 'select';
        ge.bendArmed = false;
        const firstGroup = grid.groups.find((g) => g.id === ge.editGroupId) || grid.groups[grid.groups.length - 1];
        const firstLine = firstGroup && G.orderedLines(firstGroup, gctx).items[0];
        if (firstLine) gridSelectLine(grid, firstLine.line.id, null); else ge.sel = null;
        gridChanged();
        window.showToast?.(`행·열 선 ${added}개를 적용했습니다. 선을 끌어서 옮기거나 아래 「이 선 옮기기」·「그룹 전체」 ◀▶ 버튼으로 맞추세요. 틀린 선은 「선 삭제」. 이미 넣은 마킹 위치는 「이 층 마킹에 위치 채우기」로 맞춥니다.`, 'success', 7000);
    }

    // ---- 편집: 누르기 · 끌기 ----
    function gridFindGroup(grid, id) {
        return (grid.groups || []).find((g) => g.id === id) || null;
    }

    function gridSelectLine(grid, lineId, vertexIndex) {
        const ge = gridEditState();
        const G = gridLib();
        const f = G.findLine(grid, lineId);
        if (!f) {
            ge.sel = null;
            return null;
        }
        ge.sel = { groupId: f.group.id, lineId, vertexIndex: vertexIndex == null ? null : vertexIndex };
        ge.activeGroup[f.group.axis] = f.group.id;
        ge.editGroupId = f.group.id;
        ge.zoneId = f.group.zoneId || null;
        return f;
    }

    /** 돌린 구역에 새로 만드는 그룹의 선 각도 */
    function gridZoneLineAngle(grid, zoneId) {
        const G = gridLib();
        const z = zoneId ? G.findZone(grid, zoneId) : null;
        return (z && z.angle) ? G.lineAngleFromZoneAngle(z.angle) : 0;
    }

    /** 이 축·이 구역(zoneId, null = 구역 밖)의 그룹 — 없으면 새로(구역마다 번호 따로: 머리글 기본값·시작 1) */
    function gridEnsureGroup(grid, axis, zoneId) {
        const G = gridLib();
        const ge = gridEditState();
        const zid = zoneId || null;
        const inZone = (x) => (x.zoneId || null) === zid;
        let g = gridFindGroup(grid, ge.activeGroup[axis]);
        if (!g || g.axis !== axis || !inZone(g)) {
            const eg = gridFindGroup(grid, ge.editGroupId);
            g = (eg && eg.axis === axis && inZone(eg)) ? eg : ((grid.groups || []).find((x) => x.axis === axis && inZone(x)) || null);
        }
        if (!g) {
            const c = getGridCtx();
            // 새 구역: 번호는 1부터 따로. 같은 축 다른 그룹이 글자 번호(a, b …)면 번호 방식·머리글을 이어받음
            const tpl = (grid.groups || []).find((x) => x.axis === axis && x.numbering);
            g = G.createGroup(axis, tpl
                ? { band: G.defaultBand(c.w, c.h), zoneId: zid, numbering: tpl.numbering, prefix: tpl.prefix, angle: gridZoneLineAngle(grid, zid) }
                : { band: G.defaultBand(c.w, c.h), zoneId: zid, angle: gridZoneLineAngle(grid, zid) });
            grid.groups.push(g);
        }
        ge.activeGroup[axis] = g.id;
        ge.editGroupId = g.id;
        return g;
    }

    function gridAddLineAt(axis, p) {
        const G = gridLib();
        const grid = getCurrentFloorGrid(true);
        // 선은 누른 자리의 구역에 속함(구역 경계까지만 그음). 구역 밖이면 구역 없는 선
        const zone = G.zoneAt(grid, p);
        gridEditState().zoneId = zone ? zone.id : null;
        const g = gridEnsureGroup(grid, axis, zone ? zone.id : null);
        const ln = G.makeLineThrough(p, axis, g.angle, getGridCtx(), zone ? Object.assign({}, zone.rect, { angle: zone.angle || 0, poly: zone.poly || null }) : null);
        G.addLineToGroup(g, ln); // 번호 = 그은 순서(먼저 그은 선이 작은 번호)
        gridSelectLine(grid, ln.id, null);
        gridEditState().lastAddAt = Date.now();
        gridChanged();
    }

    function gridPointerDown(clientX, clientY, isTouch) {
        const G = gridLib();
        const ge = gridEditState();
        if (!G || !state.bgImage) return;
        const p = clientToImgCoords(clientX, clientY);
        const tol = (isTouch ? 18 : 8) / (state.view.scale || 1);
        const grid = getCurrentFloorGrid(true);
        if (ge.bendArmed && ge.sel) {
            const f = G.findLine(grid, ge.sel.lineId);
            ge.bendArmed = false;
            if (f) {
                const hitLine = G.hitTest({ groups: [{ id: f.group.id, lines: [f.line] }] }, p, tol * 2);
                if (hitLine) {
                    const vi = G.insertVertex(f.line, p);
                    gridSelectLine(grid, f.line.id, vi);
                    gridStartDrag({ kind: 'vertex', lineId: f.line.id, vi, start: p, clientX, clientY, isTouch });
                    gridChanged();
                    return;
                }
            }
            renderGridPanel();
        }
        if (ge.tool === 'zonePoly') {
            gridStartDrag({ kind: 'empty', start: p, clientX, clientY, isTouch, offX: state.view.offsetX, offY: state.view.offsetY });
            return;
        }
        // 고른 구역의 회전 손잡이가 선·테두리보다 먼저
        if ((ge.tool === 'select' || ge.tool === 'zone') && ge.zoneId) {
            const rz = G.findZone(grid, ge.zoneId);
            if (rz) {
                const hp = G.zoneRotateHandle(rz, GRID_ZONE_HANDLE_PX / (state.view.scale || 1));
                if (Math.hypot(p.x - hp.x, p.y - hp.y) <= tol * 1.5) {
                    const c = G.rectCenter(rz.rect);
                    ge.sel = null;
                    gridStartDrag({
                        kind: 'zoneRotate',
                        zoneId: rz.id,
                        center: c,
                        startAngle: rz.angle || 0,
                        startPointer: Math.atan2(p.y - c.y, p.x - c.x),
                        clientX,
                        clientY,
                        isTouch
                    });
                    renderGridPanel();
                    drawCanvas();
                    return;
                }
            }
        }
        const hit = G.hitTest(grid, p, tol);
        // 구역: 「선택·이동」·「구역」 도구에서만 모서리(크기)·테두리(옮기기)를 끔. 선 꼭짓점이 먼저
        const zh = (ge.tool === 'select' || ge.tool === 'zone') ? G.hitZone(grid, p, tol) : null;
        if (zh && (zh.corner != null ? !(hit && hit.vertexIndex != null) : !hit)) {
            const z = G.findZone(grid, zh.zoneId);
            if (z) {
                ge.zoneId = z.id;
                ge.sel = null;
                gridStartDrag({
                    kind: zh.corner != null ? 'zoneCorner' : 'zoneMove',
                    zoneId: z.id,
                    corner: zh.corner,
                    orig: { x1: z.rect.x1, y1: z.rect.y1, x2: z.rect.x2, y2: z.rect.y2 },
                    origPoly: z.poly ? z.poly.map((q) => ({ x: q.x, y: q.y })) : null,
                    start: p,
                    clientX,
                    clientY,
                    isTouch
                });
                renderGridPanel();
                drawCanvas();
                return;
            }
        }
        if (hit) {
            const f = gridSelectLine(grid, hit.lineId, hit.vertexIndex);
            gridStartDrag({
                kind: hit.vertexIndex != null ? 'vertex' : 'line',
                lineId: hit.lineId,
                vi: hit.vertexIndex,
                start: p,
                orig: f ? f.line.pts.map((q) => ({ x: q.x, y: q.y })) : [],
                clientX,
                clientY,
                isTouch
            });
            renderGridPanel();
            drawCanvas();
            return;
        }
        if (ge.tool === 'zone') {
            gridStartDrag({ kind: 'zoneNew', start: gridSnap(p), cur: null, clientX, clientY, isTouch });
            return;
        }
        gridStartDrag({ kind: 'empty', start: p, clientX, clientY, isTouch, offX: state.view.offsetX, offY: state.view.offsetY });
    }

    function gridOnMove(clientX, clientY) {
        const ge = gridEditState();
        const d = ge.drag;
        if (!d) return;
        const G = gridLib();
        const thr = d.isTouch ? 8 : 4;
        if (!d.moved && Math.hypot(clientX - d.clientX, clientY - d.clientY) < thr) return;
        d.moved = true;
        if (d.kind === 'empty') {
            state.view.offsetX = d.offX + (clientX - d.clientX);
            state.view.offsetY = d.offY + (clientY - d.clientY);
            drawCanvas();
            if (typeof updateMapZoomOverlay === 'function') updateMapZoomOverlay();
            return;
        }
        if (d.kind === 'zoneRotate') {
            const rg = getCurrentFloorGrid(true);
            const rz = G.findZone(rg, d.zoneId);
            if (rz) {
                const q = clientToImgCoords(clientX, clientY);
                const deg = d.startAngle + (Math.atan2(q.y - d.center.y, q.x - d.center.x) - d.startPointer) * 180 / Math.PI;
                G.rotateZone(rg, rz, Math.round(deg * 2) / 2); // 0.5° 단위
            }
            drawCanvas();
            return;
        }
        if (d.kind === 'zoneNew' || d.kind === 'zoneCorner' || d.kind === 'zoneMove') {
            const zp = gridSnap(clientToImgCoords(clientX, clientY));
            if (d.kind === 'zoneNew') {
                d.cur = zp;
            } else {
                const z = G.findZone(getCurrentFloorGrid(true), d.zoneId);
                if (z && d.kind === 'zoneMove') G.moveZone(z, d.orig, d.origPoly, zp.x - d.start.x, zp.y - d.start.y);
                else if (z && z.poly) G.zoneSetVertex(z, d.corner, zp);
                else if (z) z.rect = G.resizeZoneCorner(d.orig, z.angle || 0, d.corner, zp);
            }
            drawCanvas();
            return;
        }
        const grid = getCurrentFloorGrid(true);
        const f = G.findLine(grid, d.lineId);
        if (!f) return;
        const p = clientToImgCoords(clientX, clientY);
        if (d.kind === 'vertex') {
            const sp = gridSnap(p);
            if (f.line.pts[d.vi]) f.line.pts[d.vi] = { x: sp.x, y: sp.y };
        } else if (d.kind === 'line') {
            const grab = { x: d.start.x + (p.x - d.start.x), y: d.start.y + (p.y - d.start.y) };
            const sp = gridSnap(grab);
            const dx = sp.x - d.start.x;
            const dy = sp.y - d.start.y;
            f.line.pts = d.orig.map((q) => ({ x: q.x + dx, y: q.y + dy }));
        }
        drawCanvas();
    }

    function gridOnEnd() {
        const ge = gridEditState();
        const d = ge.drag;
        gridDetachDragListeners();
        ge.drag = null;
        if (!d) return;
        if (d.kind === 'empty') {
            if (d.moved) {
                if (typeof scheduleFloorDrawingTierSync === 'function') scheduleFloorDrawingTierSync();
                if (typeof shouldUseViewportTilesForCurrentFloor === 'function' && shouldUseViewportTilesForCurrentFloor() && typeof scheduleViewportHiPatchSync === 'function') scheduleViewportHiPatchSync();
                return;
            }
            if (ge.tool === 'zonePoly') {
                gridPolyAddPoint(gridSnap(d.start), d.isTouch);
            } else if (ge.tool === 'col' || ge.tool === 'row') {
                gridAddLineAt(ge.tool, gridSnap(d.start));
            } else {
                ge.sel = null;
                if (ge.tool === 'select') {
                    const zz = gridLib().zoneAt(getCurrentFloorGrid(true), d.start);
                    ge.zoneId = zz ? zz.id : null; // 빈 곳 누름 = 그 자리 구역 고르기
                }
                renderGridPanel();
                drawCanvas();
            }
            return;
        }
        if (d.kind === 'zoneNew') {
            finishGridZoneDraw(d);
            return;
        }
        if ((d.kind === 'zoneCorner' || d.kind === 'zoneMove') && !d.moved) {
            ge.zoneId = d.zoneId;
            renderGridPanel();
            drawCanvas();
            return;
        }
        if (d.moved) gridChanged();
    }

    function gridMouseMove(e) { gridOnMove(e.clientX, e.clientY); }
    function gridMouseUp() { gridOnEnd(); }
    function gridTouchMove(e) {
        if (!e.touches || e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        gridOnMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    function gridTouchEnd(e) {
        if (e.touches && e.touches.length) return;
        gridOnEnd();
    }

    function gridStartDrag(d) {
        const ge = gridEditState();
        gridDetachDragListeners();
        ge.drag = Object.assign({ moved: false }, d);
        window.addEventListener('mousemove', gridMouseMove);
        window.addEventListener('mouseup', gridMouseUp);
        window.addEventListener('touchmove', gridTouchMove, { passive: false });
        window.addEventListener('touchend', gridTouchEnd);
        window.addEventListener('touchcancel', gridTouchEnd);
    }

    function gridDetachDragListeners() {
        window.removeEventListener('mousemove', gridMouseMove);
        window.removeEventListener('mouseup', gridMouseUp);
        window.removeEventListener('touchmove', gridTouchMove);
        window.removeEventListener('touchend', gridTouchEnd);
        window.removeEventListener('touchcancel', gridTouchEnd);
    }

    /** 두 손가락(확대) 시작 등 — 끌던 것을 그 자리에서 멈춤(빈 곳 누름은 선 추가 안 함) */
    function gridCancelDrag() {
        const ge = gridEditState();
        const d = ge.drag;
        gridDetachDragListeners();
        ge.drag = null;
        if (d && d.moved && d.kind !== 'empty') gridChanged();
    }

    function gridDblClick(clientX, clientY) {
        const G = gridLib();
        const ge = gridEditState();
        if (G && ge.tool === 'zonePoly') {
            gridPolyFinish();
            return;
        }
        if (!G || Date.now() - ge.lastAddAt < 700) return;
        const p = clientToImgCoords(clientX, clientY);
        const grid = getCurrentFloorGrid(true);
        // 고른 다각형 구역: 꼭짓점 더블클릭 = 삭제, 변 더블클릭 = 꼭짓점 추가
        const polyZone = ge.zoneId ? G.findZone(grid, ge.zoneId) : null;
        if (polyZone && polyZone.poly && (ge.tool === 'select' || ge.tool === 'zone')) {
            const zh = G.hitZone({ zones: [polyZone] }, p, 8 / (state.view.scale || 1));
            if (zh) {
                if (zh.corner != null) {
                    if (G.zoneRemoveVertex(polyZone, zh.corner)) gridChanged();
                    else window.showToast?.('다각형 구역은 꼭짓점이 3개 이상이어야 합니다.', 'info', 2000);
                } else {
                    G.zoneInsertVertex(polyZone, p);
                    gridChanged();
                }
                return;
            }
        }
        const hit = G.hitTest(grid, p, 8 / (state.view.scale || 1));
        if (!hit) return;
        const f = G.findLine(grid, hit.lineId);
        if (!f) return;
        if (hit.vertexIndex != null) {
            if (G.removeVertex(f.line, hit.vertexIndex)) {
                gridSelectLine(grid, f.line.id, null);
                gridChanged();
            }
            return;
        }
        const vi = G.insertVertex(f.line, p);
        gridSelectLine(grid, f.line.id, vi);
        gridChanged();
    }

    function gridDeleteSelected() {
        const ge = gridEditState();
        const grid = getCurrentFloorGrid(false);
        if (!grid || !ge.sel) return false;
        const G = gridLib();
        const f = G.findLine(grid, ge.sel.lineId);
        if (!f) return false;
        const vi = ge.sel.vertexIndex;
        if (vi != null && vi > 0 && vi < f.line.pts.length - 1) {
            G.removeVertex(f.line, vi);
            ge.sel.vertexIndex = null;
        } else {
            f.group.lines = f.group.lines.filter((l) => l.id !== f.line.id);
            ge.sel = null;
        }
        gridChanged();
        return true;
    }

    // ---- 편집 창 ----
    function ensureGridPanel() {
        let panel = document.getElementById('gridLinesPanel');
        if (panel) return panel;
        const host = elements.planCanvas && elements.planCanvas.parentElement;
        if (!host) return null;
        panel = document.createElement('div');
        panel.id = 'gridLinesPanel';
        panel.className = 'grid-lines-panel';
        panel.hidden = true;
        host.appendChild(panel);
        ['mousedown', 'touchstart', 'wheel', 'dblclick'].forEach((ev) => panel.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
        panel.addEventListener('click', onGridPanelClick);
        panel.addEventListener('change', onGridPanelChange);
        panel.addEventListener('toggle', (e) => {
            const d = e.target;
            const key = d && d.getAttribute && d.getAttribute('data-sec');
            if (!key) return;
            const ge = gridEditState();
            ge.sections = Object.assign({}, ge.sections || {}, { [key]: !!d.open });
        }, true);
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
                e.preventDefault();
                e.target.blur();
            }
        });
        return panel;
    }

    function renderGridPanel() {
        const ge = gridEditState();
        const panel = ensureGridPanel();
        if (!panel) return;
        panel.hidden = !ge.active;
        if (!ge.active) return;
        const G = gridLib();
        if (!G) {
            panel.innerHTML = '<div class="grid-panel-hint">행·열 모듈을 불러오지 못했습니다. Ctrl+F5로 새로고침해 주세요.</div>';
            return;
        }
        ge.renderedKey = getGridFloorKey();
        const grid = getCurrentFloorGrid(false) || G.normalizeGrid({});
        const gctx = getGridCtx();
        const groups = grid.groups || [];
        const zones = grid.zones || [];
        if (ge.zoneId && !zones.some((z) => z.id === ge.zoneId)) ge.zoneId = null;
        const ez = ge.zoneId ? zones.find((z) => z.id === ge.zoneId) : null;
        const zoneName = (z) => `${z.name}${z.floorLabel ? ` · ${z.floorLabel}` : ''}`;
        const zoneTag = (g) => {
            const z = g.zoneId ? zones.find((x) => x.id === g.zoneId) : null;
            return z ? `[${z.name}] ` : (zones.length ? '[구역 밖] ' : '');
        };
        const zoneOpts = `<option value="">구역 밖 (구역 없는 선)</option>` + zones.map((z) => {
            const n = groups.filter((g) => g.zoneId === z.id).reduce((s, g) => s + (g.lines || []).length, 0);
            return `<option value="${gridEsc(z.id)}"${ez && ez.id === z.id ? ' selected' : ''}>${gridEsc(zoneName(z))} (선 ${n}개)</option>`;
        }).join('');
        let eg = gridFindGroup(grid, ge.editGroupId) || groups[0] || null;
        if (eg) ge.editGroupId = eg.id;
        const selF = ge.sel ? G.findLine(grid, ge.sel.lineId) : null;
        if (ge.sel && !selF) ge.sel = null;
        let selName = '';
        let selAuto = '';
        if (selF) {
            const it = G.orderedLines(selF.group, gctx).items.find((x) => x.line.id === selF.line.id);
            selName = it ? it.name : '';
            selAuto = it ? it.autoName : '';
        }
        const axisKo = (ax) => (ax === 'row' ? '행' : '열');
        const groupOpts = groups.map((g) => {
            const od = G.orderedLines(g, gctx);
            const names = od.items.length > 1 ? `${G.groupSeqLabel(g, G.groupNumberAt(g, 0))}…${G.groupSeqLabel(g, G.groupNumberAt(g, od.items.length - 1))}` : G.groupSeqLabel(g, G.groupNumberAt(g, 0));
            const ang = Math.abs(g.angle) > 0.01 ? ` · ${g.angle}°` : '';
            return `<option value="${gridEsc(g.id)}"${eg && g.id === eg.id ? ' selected' : ''}>${gridEsc(zoneTag(g))}${axisKo(g.axis)} ${gridEsc(names)} (${od.items.length}개${ang})</option>`;
        }).join('');
        const hint = ge.tool === 'zonePoly'
            ? `도면을 눌러 꼭짓점을 찍으세요${(ge.polyDraft || []).length ? ` (${ge.polyDraft.length}개)` : ''}. 첫 점을 다시 누르거나 더블클릭·Enter로 완성, Backspace는 한 점 취소, Esc는 그만두기. 빈 곳을 끌면 화면 이동.`
            : ge.tool === 'zone'
            ? (ge.zoneRedrawId
                ? '구역의 새 범위를 도면에서 사각형으로 끌어 그리세요.'
                : '도면에서 사각형을 끌어 구역을 만드세요(예: 한 장에 그린 1층·2층). 구역마다 선 번호가 따로 매겨집니다. 구역 모서리를 끌면 크기, 테두리를 끌면 이동.')
            : ge.bendArmed
            ? '꺾을 자리를 선 위에서 누르세요. 생긴 점을 끌어 모양을 맞춥니다.'
            : (ge.tool === 'select'
                ? '선을 눌러 고르고 끌어서 옮기세요. 끝점을 끌면 기울어집니다. 빈 곳을 끌면 화면 이동.'
                : `도면을 누르면 ${ge.tool === 'row' ? '가로 행(Y)' : '세로 열(X)'} 선이 생깁니다(먼저 그은 선이 작은 번호). 있는 선·끝점은 끌어서 옮기고, 빈 곳을 끌면 화면 이동.`);
        const lineBandDefault = selF ? G.lineBand({}, selF.group, gctx) : 0;
        // 2026-11-02 자동 잡기: 캐드 PDF의 통심선·축 번호를 찾아 후보를 보여 주고, 맞으면 적용
        const autoPrev = (ge.autoPreview && ge.autoPreview.key === getGridFloorKey()) ? ge.autoPreview : null;
        const autoSens = ge.autoSens || 'normal';
        const autoAxes = ge.autoAxes || 'both';
        const autoSummary = autoPrev ? (() => {
            const r = autoPrev.res;
            const byAx = gridAutoCandidatesByAxis(autoPrev);
            const named = (r.labelled && (r.labelled.cols || r.labelled.rows)) ? ' · 도면 축 번호를 이름으로' : ' · 이름은 자동 번호';
            const sc = r.seriesCount || {};
            const seriesNote = ((sc.cols || 0) > 1 || (sc.rows || 0) > 1) ? ` · 번호 계열이 바뀜(열 ${sc.cols || 1}묶음 · 행 ${sc.rows || 1}묶음) → 묶음마다 그룹으로 나눔` : '';
            const how = r.source === 'markers' ? ' · 번호 풍선·글자 기준' : ' · <b style="color:#b45309">번호 풍선·글자를 못 찾아 선 기준으로 찾음</b>';
            return `열 ${byAx.col.length}개 · 행 ${byAx.row.length}개 후보${how}${named}${seriesNote}${r.weak ? ' · <b style="color:#b45309">확실하지 않음(긴 실선만 찾음)</b>' : ''}`;
        })() : '';
        const vi = ge.sel ? ge.sel.vertexIndex : null;
        const canDelVertex = !!(selF && vi != null && vi > 0 && vi < selF.line.pts.length - 1);
        // 접었다 폈다 하는 묶음 — 패널을 다시 그려도 열림 상태를 기억한다(자동 잡기 후보가 있으면 항상 열림)
        const secOpen = Object.assign({ group: true, space: true, loc: true, zone: !!zones.length, auto: false, danger: false }, ge.sections || {});
        if (autoPrev) secOpen.auto = true;
        const sec = (key, title, body, note) => `
                <details class="grid-sec" data-sec="${key}"${secOpen[key] ? ' open' : ''}>
                    <summary>${title}${note ? ` <small class="grid-panel-muted">${note}</small>` : ''}</summary>
                    <div class="grid-sec-body">${body}</div>
                </details>`;
        const nudgeBtns = (act, axis) => [-50, -10, -1, 1, 10, 50].map((d) => `<button type="button" data-act="${act}" data-d="${d}">${axis === 'row' ? (d < 0 ? '▲' : '▼') : (d < 0 ? '◀' : '▶')}${Math.abs(d)}</button>`).join('');
        // ---- 선택한 선: 항상 맨 위. 폭은 선마다 하나씩 조절(− / + 단추, 이전·다음 선으로 차례로) ----
        let selOrder = [];
        let selIdx = -1;
        if (selF) {
            selOrder = G.orderedLines(selF.group, gctx).items;
            selIdx = selOrder.findIndex((x) => x.line.id === selF.line.id);
        }
        const selBandNow = selF ? G.lineBand(selF.line, selF.group, gctx) : 0;
        const selBandOwn = !!(selF && selF.line.band != null && selF.line.band !== '' && Number.isFinite(Number(selF.line.band)));
        const bandStep = (d) => `<button type="button" data-act="bandStep" data-d="${d}">${d < 0 ? '−' : '+'}${Math.abs(d)}</button>`;
        const selHtml = selF ? `
                <div class="grid-sel-card">
                    <div class="grid-sel-head">
                        <button type="button" data-act="selPrev" title="${selF.group.axis === 'row' ? '위쪽' : '왼쪽'} 이웃 선 고르기"${selIdx <= 0 ? ' disabled' : ''}>◀</button>
                        <b class="grid-sel-title">${axisKo(selF.group.axis)} ${gridEsc(selName)} <small class="grid-panel-muted">${selIdx + 1}/${selOrder.length}</small></b>
                        <button type="button" data-act="selNext" title="${selF.group.axis === 'row' ? '아래쪽' : '오른쪽'} 이웃 선 고르기"${selIdx >= selOrder.length - 1 ? ' disabled' : ''}>▶</button>
                    </div>
                    <div class="grid-panel-row grid-band-row">
                        <b>폭</b>
                        ${bandStep(-10)}${bandStep(-1)}
                        <input type="number" data-f="lband" value="${selBandOwn ? selF.line.band : ''}" placeholder="${Math.round(selBandNow)}" min="0" step="1" title="이 선의 폭(도면 px). 비우면 그룹 기본 폭 ${Math.round(lineBandDefault)}">
                        ${bandStep(1)}${bandStep(10)}
                    </div>
                    <div class="grid-panel-row grid-band-sub">
                        <small class="grid-panel-muted">${selBandOwn ? '이 선만 직접 지정' : `그룹 기본 폭 ${Math.round(lineBandDefault)} 사용 중`}</small>
                        ${selBandOwn ? '<button type="button" data-act="bandReset" title="이 선의 폭을 지우고 그룹 기본 폭으로">기본으로</button>' : ''}
                        <button type="button" data-act="bandAll" title="이 선의 폭을 이 그룹의 모든 선과 기본 폭으로 맞춥니다(선마다 따로 준 폭은 지워짐)">그룹 전체에 이 폭</button>
                    </div>
                    <div class="grid-panel-row">
                        <label>이름 <input type="text" data-f="label" value="${gridEsc(selF.line.label || '')}" placeholder="자동 ${gridEsc(selAuto)}" maxlength="10" style="width:64px"></label>
                        <label title="이 선의 번호만 직접 정합니다(예: 5 → ${gridEsc(selF.group.prefix || '')}5). 비우면 자동 번호. 이름 칸에 글자를 쓰면 그 이름이 우선">번호 <input type="text" data-f="lnum" value="${Number.isInteger(selF.line.num) ? gridEsc(G.normalizeNumbering(selF.group.numbering) === 'upper' && selF.line.num >= 1 ? G.seqToLetters(selF.line.num, false) : String(selF.line.num)) : ''}" placeholder="자동" maxlength="6" style="width:48px"></label>
                        <label>각도 <input type="number" data-f="langle" value="${G.lineAngle(selF.line, selF.group.axis, gctx)}" step="0.5" style="width:52px">°</label>
                    </div>
                    <div class="grid-panel-row grid-nudge-row" title="화면 기준으로 ${selF.group.axis === 'row' ? '위·아래' : '왼쪽·오른쪽'}으로 옮깁니다(도면 px). 선을 끌어서 옮겨도 됩니다">
                        <b>이 선 옮기기</b>${nudgeBtns('nudge', selF.group.axis)}
                    </div>
                    <div class="grid-panel-row grid-nudge-row" title="이 그룹의 모든 선을 같이 옮깁니다 — 자동으로 잡은 선이 통째로 조금 어긋났을 때">
                        <b>그룹 전체 (${(selF.group.lines || []).length}개)</b>${nudgeBtns('nudgeGroup', selF.group.axis)}
                    </div>
                    <div class="grid-panel-row">
                        <button type="button" data-act="bend" class="${ge.bendArmed ? 'active' : ''}" title="선을 누른 뒤 꺾을 점을 찍습니다 (단축키 F)">꺾기 추가 (F)</button>
                        ${canDelVertex ? '<button type="button" data-act="delVertex">꺾인 점 삭제</button>' : ''}
                        <button type="button" data-act="splitGroup" title="증축 등으로 번호 체계가 바뀔 때(A~D 다음 1~4, X1~ 다음 A1~): 이 선과 그 뒤쪽 선(열은 오른쪽, 행은 아래쪽)을 새 그룹으로 나눕니다. 새 그룹은 머리글·시작 번호·번호 방식을 따로 정할 수 있습니다">여기부터 새 그룹</button>
                        <button type="button" data-act="delLine" class="danger">선 삭제</button>
                    </div>
                </div>` : '<div class="grid-panel-row grid-panel-muted grid-sel-empty">선을 누르면 폭·이름·각도·위치를 바꿀 수 있습니다. 폭은 선마다 하나씩 조절합니다.</div>';
        // ---- 간격 비율(2026-11-04): 선 사이 간격을 전체 비율로 늘리거나 줄임 ----
        const spaceAxis = (selF ? selF.group.axis : (eg ? eg.axis : 'col'));
        const spacePct = Number.isFinite(Number(ge.spacePct)) && Number(ge.spacePct) > 0 ? Number(ge.spacePct) : 100;
        const spaceAnchor = ge.spaceAnchor || (selF ? 'selected' : 'first');
        const spaceScope = ge.spaceScope === 'axis' ? 'axis' : 'group';
        const spaceBody = `
                    <div class="grid-panel-row">
                        <label title="100% = 그대로, 110% = 간격 10% 넓게, 90% = 10% 좁게. 선은 통째로 평행하게 옮겨지고 폭·각도·꺾임은 그대로입니다">비율 <input type="number" data-f="spacePct" value="${spacePct}" min="10" max="500" step="1" style="width:64px">%</label>
                        <button type="button" data-act="spaceApply" class="grid-primary">적용</button>
                        ${ge.spacingUndo ? '<button type="button" data-act="undoSpace" title="방금 바꾼 간격을 되돌림 (Ctrl+Z)">↶ 되돌리기</button>' : ''}
                    </div>
                    <div class="grid-panel-row grid-space-quick">
                        <small class="grid-panel-muted">바로 적용</small>
                        ${[90, 95, 105, 110].map((v) => `<button type="button" data-act="spaceQuick" data-pct="${v}">${v}%</button>`).join('')}
                    </div>
                    <div class="grid-panel-row">
                        <label title="이 선(위치)은 그대로 두고 나머지가 벌어지거나 모입니다">기준 <select data-f="spaceAnchor">
                            <option value="selected"${spaceAnchor === 'selected' ? ' selected' : ''}${selF ? '' : ' disabled'}>선택한 선</option>
                            <option value="first"${spaceAnchor === 'first' ? ' selected' : ''}>${spaceAxis === 'row' ? '맨 위 선' : '맨 왼쪽 선'}</option>
                            <option value="last"${spaceAnchor === 'last' ? ' selected' : ''}>${spaceAxis === 'row' ? '맨 아래 선' : '맨 오른쪽 선'}</option>
                            <option value="center"${spaceAnchor === 'center' ? ' selected' : ''}>가운데(양쪽으로)</option>
                        </select></label>
                    </div>
                    <div class="grid-panel-row">
                        <label>대상 <select data-f="spaceScope">
                            <option value="group"${spaceScope === 'group' ? ' selected' : ''}>이 그룹만</option>
                            <option value="axis"${spaceScope === 'axis' ? ' selected' : ''}>이 층 ${axisKo(spaceAxis)} 전체 그룹</option>
                        </select></label>
                    </div>`;
        // ---- 그룹 설정 ----
        const groupBody = `
                    <div class="grid-panel-row">
                        <select data-f="group" ${groups.length ? '' : 'disabled'}>${groupOpts || '<option>그룹 없음 — 선을 그으면 생깁니다</option>'}</select>
                    </div>
                    <div class="grid-panel-row">
                        <button type="button" data-act="addGroup-col" title="날개동 등 번호를 따로 매길 열 묶음">+ 열 그룹</button>
                        <button type="button" data-act="addGroup-row" title="날개동 등 번호를 따로 매길 행 묶음">+ 행 그룹</button>
                        ${eg ? '<button type="button" data-act="delGroup" class="danger">그룹 삭제</button>' : ''}
                    </div>
                    ${eg ? `
                    <div class="grid-panel-row">
                        <label>머리글 <input type="text" data-f="prefix" value="${gridEsc(eg.prefix)}" maxlength="6" style="width:52px"></label>
                        <label>시작 번호 <input type="number" data-f="start" value="${eg.start}" step="1" style="width:56px" title="글자 번호면 1 = A, 2 = B"></label>
                    </div>
                    <div class="grid-panel-row">
                        <label>번호 <select data-f="numbering" title="선 이름 번호 방식 — 글자는 Z 다음 AA, AB …">
                            <option value="num"${G.normalizeNumbering(eg.numbering) === 'num' ? ' selected' : ''}>숫자 1, 2, 3</option>
                            <option value="upper"${G.normalizeNumbering(eg.numbering) === 'upper' ? ' selected' : ''}>대문자 A, B, C</option>
                        </select></label>
                        <label title="오름차순 1, 2, 3 ⇄ 내림차순 3, 2, 1 (${eg.axis === 'row' ? '행' : '열'}마다 따로)">순서 <select data-f="gorder">
                            <option value="asc"${eg.reverse ? '' : ' selected'}>오름차순</option>
                            <option value="desc"${eg.reverse ? ' selected' : ''}>내림차순</option>
                        </select></label>
                    </div>
                    <div class="grid-panel-row">
                        <label title="도면에 없는 번호를 건너뜁니다. 예: 3, 7 → 1, 2, 4, 5, 6, 8 … (글자 번호면 C, G). 이미 그은 선 이름도 바로 바뀝니다">건너뛸 번호 <input type="text" data-f="gskip" value="${gridEsc(G.formatSkipText(eg))}" placeholder="예: 3, 7" maxlength="40" style="width:96px"></label>
                    </div>
                    <div class="grid-panel-row">
                        <button type="button" data-act="reverseOrder" title="선 위치는 그대로 두고 이 그룹의 번호 순서만 거꾸로(1,2,3 → 3,2,1 / A,B,C → C,B,A). 개별 이름을 준 선은 그대로">⇅ 순서 뒤집기</button>
                        ${ge.orderUndo && ge.orderUndo.groupId === eg.id ? '<button type="button" data-act="undoOrder" title="방금 바꾼 순서를 되돌림 (Ctrl+Z)">↶ 되돌리기</button>' : ''}
                        <button type="button" data-act="renumber" title="지금 보이는 위치 순서(열: 왼→오른, 행: 위→아래)로 번호를 한 번만 다시 매김. 그 뒤로 새로 긋는 선은 다시 맨 끝 번호">위치 순서로 다시 매기기</button>
                    </div>
                    <div class="grid-panel-row" title="글자가 선으로 그려져 못 읽은 도면용 — 이 그룹의 선 이름을 위치 순서(열: 왼→오른, 행: 위→아래)대로 한꺼번에 붙입니다. 빈칸이나 쉼표로 구분. 「-」는 자동 번호로 되돌림">
                        <label>이름 한꺼번에 <input type="text" data-f="bulkNames" placeholder="예: Y'1 Y'2 Y'3 Y1 Y2 Y3" style="width:150px"></label>
                        <button type="button" data-act="bulkNames">적용</button>
                    </div>
                    <div class="grid-panel-row">
                        <label>새 선 각도 <input type="number" data-f="gangle" value="${eg.angle}" step="0.5" style="width:56px">°</label>
                        <button type="button" data-act="angleAll" title="이 그룹의 모든 선을 이 각도로">모든 선에 적용</button>
                    </div>
                    <div class="grid-panel-row">
                        <label title="새로 긋는 선, 그리고 폭을 따로 안 준 선의 폭. 선마다 다른 폭은 위 「선택한 선」에서 하나씩 조절합니다">기본 폭 <input type="number" data-f="gband" value="${Math.round(G.lineBand({}, eg, gctx) * 10) / 10}" min="0" step="1" style="width:60px"> <small>도면 px</small></label>
                    </div>` : ''}`;
        const zoneBody = `
                    <div class="grid-panel-row">
                        <select data-f="zone" title="선을 그으면 누른 자리의 구역에 들어갑니다">${zoneOpts}</select>
                    </div>
                    <div class="grid-panel-row">
                        <button type="button" data-act="zoneAdd">+ 구역 추가</button>
                        <button type="button" data-act="zonePolyAdd" title="꼭짓점을 찍어 ㄱ자·ㄷ자 같은 모양의 구역을 만듭니다">+ 다각형 구역</button>
                        ${ez && !ez.poly ? '<button type="button" data-act="zoneToPoly" title="이 구역을 꼭짓점 4개 다각형으로 바꿉니다. 변을 더블클릭하면 꼭짓점이 늘어납니다">다각형으로 바꾸기</button>' : ''}
                        ${ez ? '<button type="button" data-act="zoneRedraw">범위 다시 그리기</button><button type="button" data-act="zoneDel" class="danger">구역 삭제</button>' : ''}
                    </div>
                    ${ez ? `
                    <div class="grid-panel-row">
                        <label>이름 <input type="text" data-f="zname" value="${gridEsc(ez.name)}" maxlength="20" style="width:80px"></label>
                        <label>층 <input type="text" data-f="zfloor" value="${gridEsc(ez.floorLabel || '')}" placeholder="예: 2F" maxlength="12" style="width:56px" title="이 구역이 어느 층인지(저장만 — 위치 글자는 아직 안 바뀜)"></label>
                    </div>
                    <div class="grid-panel-row">
                        <label title="구역과 구역 안의 선이 같이 돕니다. 도면의 구역 위 동그란 손잡이를 끌어도 됩니다">각도 <input type="number" data-f="zangle" value="${ez.angle || 0}" min="-180" max="180" step="0.5" style="width:60px">°</label>
                    </div>` : ''}`;
        const autoBody = `
                    <div class="grid-panel-row">
                        <label>민감도 <select data-f="autoSens" title="짧은 선도 후보에 넣으려면 「짧은 선도」, 벽선이 섞이면 「긴 선만」">
                            <option value="normal"${autoSens === 'normal' ? ' selected' : ''}>보통</option>
                            <option value="short"${autoSens === 'short' ? ' selected' : ''}>짧은 선도</option>
                            <option value="long"${autoSens === 'long' ? ' selected' : ''}>긴 선만</option>
                        </select></label>
                        <label>번호 위치 <select data-f="autoOuter" title="기본은 건물 바깥(외곽)에 있는 번호만 — 주차칸·방 번호 같은 안쪽 번호는 무시합니다. 축 번호가 건물 안쪽에 있는 도면만 「안쪽도」">
                            <option value="outer"${(ge.autoOuter || 'outer') === 'outer' ? ' selected' : ''}>외곽만</option>
                            <option value="all"${ge.autoOuter === 'all' ? ' selected' : ''}>안쪽도</option>
                        </select></label>
                    </div>
                    <div class="grid-panel-row">
                        <label>찾을 방향 <select data-f="autoAxes" title="입면도처럼 위쪽 번호(열)만 필요한 도면은 「열만」">
                            <option value="both"${autoAxes === 'both' ? ' selected' : ''}>열 + 행</option>
                            <option value="cols"${autoAxes === 'cols' ? ' selected' : ''}>열만 (입면도)</option>
                            <option value="rows"${autoAxes === 'rows' ? ' selected' : ''}>행만</option>
                        </select></label>
                        <button type="button" data-act="autoDetect" class="grid-primary">✨ 자동 잡기</button>
                    </div>
                    ${autoPrev ? `
                    <div class="grid-panel-row">${autoSummary}</div>
                    <div class="grid-panel-row">
                        <button type="button" data-act="autoApply" class="active">적용</button>
                        <button type="button" data-act="autoCancel">취소</button>
                    </div>` : ''}`;
        const locBody = `
                    <label class="grid-panel-row"><input type="checkbox" data-f="auto" ${grid.autoLocation ? 'checked' : ''}> 마킹에 행·열 위치 자동 입력</label>
                    <div class="grid-panel-row">
                        <button type="button" data-act="fillExisting" title="행·열 위치가 없는 마킹만 채움(상세 위치·실 이름은 그대로)">이 층 마킹에 위치 채우기</button>
                        <button type="button" data-act="recalcGrid" title="이 층 마킹 전부의 행·열 위치를 지금 선 기준으로 다시 계산. 상세 위치·실 이름은 그대로. 되돌리기 한 번으로 취소">실 이름 두고 행·열만 다시 계산</button>
                    </div>
`;
        const dangerBody = `
                    <div class="grid-panel-row">
                        <button type="button" data-act="clearDetail" class="danger" title="이 층 마킹의 상세 위치 글자에서 행·열 표기(X4~X5/Y1~Y2 등)만 지움. 실 이름·위치 글과 행·열 위치 칸은 그대로. 되돌리기 한 번으로 취소">상세위치 행·열 지우기</button>
                        <button type="button" data-act="wipeDetail" class="danger" title="이 층 마킹의 상세 위치 글자를 모두 지움(실 이름·위치 글·행·열 표기 전부). 행·열 위치 칸, 마킹 위치·번호·사진은 그대로. 3종은 층 이름만 남음. 되돌리기 한 번으로 취소">상세위치 전부 지우기</button>
                        <button type="button" data-act="clearAll" class="danger">이 층 선 모두 지우기</button>
                    </div>
                    <div class="grid-panel-row grid-panel-allfloors">
                        <button type="button" data-act="clearDetailAll" class="danger-all" title="이 건물 모든 층 마킹의 상세 위치 글자에서 행·열 표기만 지움(외부 입면 도면 포함). 실 이름·위치 글, 행·열 위치 칸, 마킹 위치·번호·사진은 그대로. 확인창에서 층·결함 수를 보여 주고, 이 층 화면에서 되돌리기 한 번으로 전체 취소">전체층 상세위치 행·열 지우기</button>
                        <button type="button" data-act="wipeDetailAll" class="danger-all" title="이 건물 모든 층 마킹의 상세 위치 글자를 모두 지움(외부 입면 도면 포함, 실 이름·위치 글·행·열 표기 전부). 행·열 위치 칸, 마킹 위치·번호·사진은 그대로. 확인창에서 층·결함 수를 보여 주고, 이 층 화면에서 되돌리기 한 번으로 전체 취소">전체층 상세위치 전부 지우기</button>
                        <span class="grid-panel-muted grid-panel-allnote">이 건물 모든 층 · 행·열 위치 칸은 그대로</span>
                    </div>`;
        panel.classList.toggle('collapsed', !!ge.collapsed);
        panel.innerHTML = `
            <div class="grid-panel-head">
                <b>행·열(통심) 선</b>
                <span class="grid-panel-head-btns">
                    <button type="button" data-act="collapse" title="접기/펴기">${ge.collapsed ? '▾' : '▴'}</button>
                    <button type="button" data-act="close" title="행·열 편집 끝내기">✕</button>
                </span>
            </div>
            <div class="grid-panel-body">
                <div class="grid-panel-tools">
                    <button type="button" data-tool="col" class="${ge.tool === 'col' ? 'active' : ''}">│ 열 추가</button>
                    <button type="button" data-tool="row" class="${ge.tool === 'row' ? 'active' : ''}">─ 행 추가</button>
                    <button type="button" data-tool="select" class="${ge.tool === 'select' ? 'active' : ''}">✥ 선택·이동</button>
                    <button type="button" data-tool="zone" class="${ge.tool === 'zone' ? 'active' : ''}" title="한 도면에 여러 층이 있을 때 — 사각형 구역마다 번호를 따로">▭ 구역</button>
                </div>
                <div class="grid-panel-row grid-copyfloors-row">
                    <button type="button" data-act="copyFloors" title="이 층의 행·열 선·그룹·머리글·시작 번호·이름·폭·자동 입력 설정을 같은 건물의 다른 층에 복사(이미 선이 있으면 덮어쓰기)">다른 층으로 복사</button>
                </div>
                <div class="grid-panel-hint">${hint}</div>
                ${selHtml}
                ${sec('space', '간격 비율', spaceBody, '선 사이 간격을 전체 비율로')}
                ${sec('group', '그룹 설정', groupBody, eg ? `${axisKo(eg.axis)} ${eg.lines.length}개` : '')}
                ${sec('zone', '구역', zoneBody, '한 도면에 여러 층 — 구역마다 번호 따로')}
                ${sec('auto', '자동 잡기', autoBody, '캐드 PDF 번호 풍선·글자로 후보')}
                ${sec('loc', '마킹 위치', locBody)}
                ${sec('danger', '지우기', dangerBody)}
            </div>`;
    }

    async function onGridPanelClick(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const ge = gridEditState();
        const G = gridLib();
        if (!G) return;
        const tool = btn.getAttribute('data-tool');
        if (tool) {
            ge.tool = tool;
            ge.polyDraft = null;
            ge.bendArmed = false;
            ge.zoneRedrawId = null;
            if (tool === 'col' || tool === 'row') {
                const grid = getCurrentFloorGrid(false);
                const g = grid && gridFindGroup(grid, ge.activeGroup[tool]);
                if (g) ge.editGroupId = g.id;
            }
            renderGridPanel();
            return;
        }
        const act = btn.getAttribute('data-act');
        if (!act) return;
        if (act === 'close') { setGridEditActive(false); return; }
        if (act === 'collapse') { ge.collapsed = !ge.collapsed; renderGridPanel(); return; }
        if (act === 'copyFloors') { openGridCopyModal(); return; }
        if (act === 'autoDetect') { gridAutoDetect().catch((err) => { console.warn('[행열 자동 잡기]', err); window.showToast?.('자동 잡기에 실패했습니다.', 'error', 3000); }); return; }
        if (act === 'autoApply') { await gridAutoApply(); return; }
        if (act === 'autoCancel') { ge.autoPreview = null; renderGridPanel(); drawCanvas(); return; }
        if (act === 'zonePolyAdd') {
            ge.tool = 'zonePoly';
            ge.polyDraft = [];
            ge.zoneRedrawId = null;
            ge.bendArmed = false;
            ge.sel = null;
            renderGridPanel();
            window.showToast?.('도면을 눌러 구역의 꼭짓점을 차례로 찍으세요.', 'info', 2200);
            return;
        }
        if (act === 'zoneAdd') {
            ge.polyDraft = null;
            ge.tool = 'zone';
            ge.zoneRedrawId = null;
            ge.bendArmed = false;
            renderGridPanel();
            window.showToast?.('도면에서 구역 사각형을 끌어 그리세요.', 'info', 2200);
            return;
        }
        const grid = getCurrentFloorGrid(true);
        const gctx = getGridCtx();
        const eg = gridFindGroup(grid, ge.editGroupId);
        const selF = ge.sel ? G.findLine(grid, ge.sel.lineId) : null;
        const ez = ge.zoneId ? G.findZone(grid, ge.zoneId) : null;
        if (act === 'zoneToPoly' && ez) {
            G.zoneToPolygon(ez);
            ge.tool = 'select';
            gridChanged();
            window.showToast?.('다각형으로 바꿨습니다. 꼭짓점을 끌어 모양을 맞추고, 변을 더블클릭하면 점이 늘어납니다(점 더블클릭은 삭제).', 'success', 3500);
            return;
        }
        if (act === 'zoneRedraw' && ez) {
            ge.tool = 'zone';
            ge.zoneRedrawId = ez.id;
            ge.bendArmed = false;
            renderGridPanel();
            window.showToast?.(`구역 「${ez.name}」의 새 범위를 끌어 그리세요.`, 'info', 2200);
            return;
        }
        if (act === 'zoneDel' && ez) {
            deleteGridZone(grid, ez);
            return;
        }
        if (act === 'addGroup-col' || act === 'addGroup-row') {
            const axis = act === 'addGroup-row' ? 'row' : 'col';
            const zid = ez ? ez.id : null; // 고른 구역에 그룹 추가(구역마다 번호 따로)
            const same = grid.groups.filter((g) => g.axis === axis && (g.zoneId || null) === zid).length;
            const base = G.DEFAULT_PREFIX[axis];
            const g = G.createGroup(axis, { prefix: same ? `${String.fromCharCode(65 + same)}${base}` : base, band: G.defaultBand(gctx.w, gctx.h), zoneId: zid, angle: gridZoneLineAngle(grid, zid) });
            grid.groups.push(g);
            ge.activeGroup[axis] = g.id;
            ge.editGroupId = g.id;
            ge.tool = axis;
            ge.sel = null;
            gridChanged();
            window.showToast?.(`${axis === 'row' ? '행' : '열'} 그룹을 만들었습니다. 머리글을 바꾸고 도면을 눌러 선을 그으세요.`, 'info', 2500);
            return;
        }
        if (act === 'delGroup' && eg) {
            if (eg.lines.length && !await window.appConfirm(`이 그룹의 선 ${eg.lines.length}개를 모두 지울까요?`)) return;
            grid.groups = grid.groups.filter((g) => g.id !== eg.id);
            ge.editGroupId = null;
            if (ge.sel && ge.sel.groupId === eg.id) ge.sel = null;
            gridChanged();
            return;
        }
        if (act === 'renumber' && eg) {
            if (eg.lines.length < 2) return;
            if (!await window.appConfirm(`이 그룹 선 ${eg.lines.length}개의 번호를 지금 보이는 위치 순서(${eg.axis === 'row' ? '위→아래' : '왼→오른'})로 다시 매길까요?\n개별 이름을 준 선은 이름 그대로입니다. 이미 넣은 마킹 위치는 「이 층 마킹에 위치 채우기」로 다시 맞춥니다.`)) return;
            G.renumberBySpatialOrder(eg, gctx);
            gridChanged();
            window.showToast?.('위치 순서로 번호를 다시 매겼습니다.', 'success', 2000);
            return;
        }
        if (act === 'splitGroup' && selF) {
            const src = selF.group;
            const items = G.orderedLines(src, gctx).items; // 화면 위치 순서
            const at = items.findIndex((it) => it.line.id === selF.line.id);
            if (at < 0) return;
            if (at === 0) { window.showToast?.('맨 앞 선은 나눌 수 없습니다. 새 번호 체계가 시작되는 선을 골라 주세요.', 'info', 3000); return; }
            const moving = items.slice(at).map((it) => it.line);
            const same = grid.groups.filter((g) => g.axis === src.axis && (g.zoneId || null) === (src.zoneId || null)).length;
            const ng = G.createGroup(src.axis, {
                prefix: `${String.fromCharCode(65 + same)}${G.DEFAULT_PREFIX[src.axis]}`, // 예: AX — 머리글에서 바꿔 쓰세요
                start: 1, angle: src.angle, band: src.band, zoneId: src.zoneId || ''
            });
            const ids = new Set(moving.map((l) => l.id));
            src.lines = src.lines.filter((l) => !ids.has(l.id));
            // 옮긴 선은 그은 순서(번호)를 위치 순서로 새로 매김 — 직접 준 이름(label)은 그대로 가져감
            moving.forEach((l) => { delete l.seq; G.addLineToGroup(ng, l); });
            G.renumberBySpatialOrder(ng, gctx);
            grid.groups.push(ng);
            ge.activeGroup[src.axis] = ng.id;
            ge.editGroupId = ng.id;
            gridChanged();
            window.showToast?.(`선 ${moving.length}개를 새 그룹으로 나눴습니다. 위 「머리글」·「시작 번호」·「번호」에서 새 번호 체계를 정하세요(예: A, 시작 1, 숫자 → A1, A2…).`, 'success', 6500);
            return;
        }
        if (act === 'bulkNames' && eg) {
            const row = btn.closest('.grid-panel-row');
            const inp = row && row.querySelector('[data-f="bulkNames"]');
            const names = String(inp ? inp.value : '').split(/[\s,;]+/).filter(Boolean);
            if (!names.length) { window.showToast?.("이름을 빈칸으로 구분해 적어 주세요. 예: Y'1 Y'2 Y1 Y2", 'info', 3000); return; }
            const items = G.orderedLines(eg, gctx).items; // 화면 위치 순서
            let n = 0;
            items.forEach((it, i) => {
                if (i >= names.length) return;
                const v = names[i].slice(0, 10);
                if (v === '-' || v === '_') delete it.line.label; else it.line.label = v;
                n++;
            });
            gridChanged();
            window.showToast?.(names.length === items.length
                ? `선 ${n}개의 이름을 붙였습니다.`
                : `선 ${items.length}개 중 ${n}개에 이름을 붙였습니다(적은 이름 ${names.length}개).`, names.length === items.length ? 'success' : 'warning', 4000);
            return;
        }
        if (act === 'reverseOrder' && eg) {
            if (eg.lines.length < 2) { window.showToast?.('선이 2개 이상일 때 뒤집을 수 있습니다.', 'info', 2000); return; }
            ge.orderUndo = { groupId: eg.id, seqs: G.reverseLineOrder(eg) };
            ge.spacingUndo = null;
            gridChanged();
            window.showToast?.('번호 순서를 뒤집었습니다. (되돌리기: ↶ 버튼 또는 Ctrl+Z) 이미 넣은 마킹 위치는 「이 층 마킹에 위치 채우기」로 맞춥니다.', 'success', 3500);
            return;
        }
        if (act === 'undoOrder') {
            undoGridOrderChange();
            return;
        }
        if (act === 'angleAll' && eg) {
            eg.lines.forEach((ln) => G.setLineAngle(ln, eg.axis, eg.angle, gctx));
            gridChanged();
            return;
        }
        if ((act === 'selPrev' || act === 'selNext') && selF) {
            // 같은 그룹의 위치 순서(열: 왼→오른, 행: 위→아래)로 이웃 선을 고른다 — 폭을 선마다 차례로 맞출 때
            const items = G.orderedLines(selF.group, gctx).items;
            const i = items.findIndex((x) => x.line.id === selF.line.id);
            const next = items[i + (act === 'selNext' ? 1 : -1)];
            if (next) { gridSelectLine(grid, next.line.id, null); renderGridPanel(); drawCanvas(); }
            return;
        }
        if (act === 'spaceApply' || act === 'spaceQuick') {
            const pct = act === 'spaceQuick' ? Number(btn.getAttribute('data-pct')) : Number(ge.spacePct || 100);
            applyGridSpacingPercent(pct);
            return;
        }
        if (act === 'undoSpace') { undoGridSpacingChange(); return; }
        if (act === 'bandStep' && selF) {
            const d = Number(btn.getAttribute('data-d')) || 0;
            if (!d) return;
            selF.line.band = Math.max(0, Math.round(G.lineBand(selF.line, selF.group, gctx) + d));
            gridChanged();
            return;
        }
        if (act === 'bandReset' && selF) {
            delete selF.line.band;
            gridChanged();
            return;
        }
        if (act === 'bandAll' && selF) {
            // 이 선의 폭을 그룹 기본 폭으로 올리고, 선마다 따로 준 폭은 지운다
            selF.group.band = Math.max(0, Math.round(G.lineBand(selF.line, selF.group, gctx)));
            (selF.group.lines || []).forEach((ln) => { delete ln.band; });
            gridChanged();
            window.showToast?.(`이 그룹의 모든 선 폭을 ${selF.group.band}로 맞췄습니다.`, 'success', 2000);
            return;
        }
        if ((act === 'nudge' || act === 'nudgeGroup') && selF) {
            const d = Number(btn.getAttribute('data-d')) || 0;
            if (!d) return;
            const targets = act === 'nudgeGroup' ? (selF.group.lines || []) : [selF.line];
            targets.forEach((ln) => {
                ln.pts = ln.pts.map((q) => {
                    const v = G.toDisplay(q, gctx.rot, gctx.w, gctx.h); // 화면 기준으로 옮긴 뒤 이미지 좌표로 되돌림(화면이 돌아 있어도 방향이 맞음)
                    if (selF.group.axis === 'row') v.y += d; else v.x += d;
                    return G.toImage(v, gctx.rot, gctx.w, gctx.h);
                });
            });
            gridChanged();
            return;
        }
        if (act === 'bend' && selF) {
            ge.bendArmed = !ge.bendArmed;
            renderGridPanel();
            return;
        }
        if (act === 'delVertex' || act === 'delLine') {
            if (act === 'delLine' && ge.sel) ge.sel.vertexIndex = null;
            gridDeleteSelected();
            return;
        }
        if (act === 'clearAll') {
            const n = grid.groups.reduce((s, g) => s + g.lines.length, 0);
            if (!n || !await window.appConfirm(`이 층의 행·열 선 ${n}개를 모두 지울까요?`)) return;
            grid.groups = [];
            ge.sel = null;
            ge.editGroupId = null;
            gridChanged();
            return;
        }
        if (act === 'fillExisting') {
            fillGridLocationForCurrentFloor();
        }
        if (act === 'recalcGrid') {
            recalcGridLocationForCurrentFloor();
        }
        if (act === 'clearDetail') {
            clearDetailLocationForCurrentFloor();
        }
        if (act === 'clearDetailAll') {
            clearDetailLocationForAllFloors();
        }
        if (act === 'wipeDetail') {
            wipeDetailLocationForCurrentFloor();
        }
        if (act === 'wipeDetailAll') {
            wipeDetailLocationForAllFloors();
        }
    }

    /**
     * 2026-11-04 행·열 간격을 전체 비율(%)로 늘리거나 줄임 — 기준 선은 그대로, 나머지는 평행 이동(폭·각도·꺾임 그대로).
     * 대상: 이 그룹만 / 이 층 같은 방향 전체 그룹. 한 단계 되돌리기(↶ 또는 Ctrl+Z).
     */
    function applyGridSpacingPercent(pct) {
        const ge = gridEditState();
        const G = gridLib();
        if (!G) return false;
        const grid = getCurrentFloorGrid(true);
        const gctx = getGridCtx();
        const selF = ge.sel ? G.findLine(grid, ge.sel.lineId) : null;
        const eg = (selF && selF.group) || gridFindGroup(grid, ge.editGroupId);
        const p = Number(pct);
        if (!eg || !Number.isFinite(p) || p <= 0) { window.showToast?.('비율을 확인해 주세요(10~500%).', 'warning', 2200); return false; }
        if (Math.abs(p - 100) < 1e-9) { window.showToast?.('100%는 그대로입니다. 110%(넓게)나 90%(좁게)처럼 입력하세요.', 'info', 2200); return false; }
        const factor = Math.max(10, Math.min(500, p)) / 100;
        const groups = ge.spaceScope === 'axis' ? grid.groups.filter((g) => g.axis === eg.axis) : [eg];
        const mode = ge.spaceAnchor || (selF ? 'selected' : 'first');
        const snaps = [];
        groups.forEach((g) => {
            const anchor = (mode === 'selected' && selF && selF.group.id === g.id) ? { lineId: selF.line.id } : (mode === 'selected' ? 'first' : mode);
            const prev = G.scaleSpacing(g, factor, gctx, anchor);
            if (prev.length) snaps.push({ groupId: g.id, prev });
        });
        if (!snaps.length) { window.showToast?.('간격을 바꾸려면 선이 2개 이상 필요합니다.', 'info', 2200); return false; }
        ge.spacingUndo = { snaps };
        ge.orderUndo = null;
        gridChanged();
        window.showToast?.(`${eg.axis === 'row' ? '행' : '열'} 간격을 ${Math.round(p * 10) / 10}%로 ${factor > 1 ? '넓혔' : '좁혔'}습니다. (되돌리기: ↶ 버튼 또는 Ctrl+Z)`, 'success', 3200);
        return true;
    }

    function undoGridSpacingChange() {
        const ge = gridEditState();
        const G = gridLib();
        const u = ge && ge.spacingUndo;
        if (!u || !G) return false;
        const grid = getCurrentFloorGrid(false);
        ge.spacingUndo = null;
        if (!grid) { renderGridPanel(); return false; }
        u.snaps.forEach((s) => {
            const g = gridFindGroup(grid, s.groupId);
            if (g) G.restoreLinePts(g, s.prev);
        });
        gridChanged();
        window.showToast?.('간격을 되돌렸습니다.', 'info', 1800);
        return true;
    }
    window.undoGridSpacingChange = undoGridSpacingChange;

    /** 2026-10-21 행·열 번호 순서(뒤집기·오름/내림) 되돌리기 — 한 단계. 되돌렸으면 true */
    function undoGridOrderChange() {
        const ge = gridEditState();
        const G = gridLib();
        const u = ge && ge.orderUndo;
        if (!u || !G) return false;
        const grid = getCurrentFloorGrid(false);
        const g = grid && gridFindGroup(grid, u.groupId);
        ge.orderUndo = null;
        if (!g) { renderGridPanel(); return false; }
        if (u.seqs) G.restoreLineSeqs(g, u.seqs);
        if (u.reverse !== undefined) { if (u.reverse) g.reverse = true; else delete g.reverse; }
        gridChanged();
        window.showToast?.('번호 순서를 되돌렸습니다.', 'info', 1800);
        return true;
    }
    window.undoGridOrderChange = undoGridOrderChange;

    function onGridPanelChange(e) {
        const el = e.target;
        const f = el && el.getAttribute('data-f');
        if (!f) return;
        const ge = gridEditState();
        const G = gridLib();
        if (!G) return;
        const grid = getCurrentFloorGrid(true);
        const gctx = getGridCtx();
        const eg = gridFindGroup(grid, ge.editGroupId);
        const selF = ge.sel ? G.findLine(grid, ge.sel.lineId) : null;
        const numOr = (v, d) => (v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
        switch (f) {
            case 'group': {
                const g = gridFindGroup(grid, el.value);
                if (g) {
                    ge.editGroupId = g.id;
                    ge.zoneId = g.zoneId || null;
                    ge.activeGroup[g.axis] = g.id;
                    if (ge.tool !== 'select') ge.tool = g.axis;
                }
                renderGridPanel();
                return;
            }
            case 'zone': {
                ge.zoneId = el.value || null;
                const zg = (grid.groups || []).find((g) => (g.zoneId || null) === ge.zoneId);
                if (zg) ge.editGroupId = zg.id;
                ge.sel = null;
                renderGridPanel();
                drawCanvas();
                return;
            }
            case 'zangle': {
                const z = G.findZone(grid, ge.zoneId);
                if (z) G.rotateZone(grid, z, numOr(el.value, z.angle || 0));
                break;
            }
            case 'zname': {
                const z = G.findZone(grid, ge.zoneId);
                const v = String(el.value || '').trim();
                if (z && v) z.name = v;
                break;
            }
            case 'zfloor': {
                const z = G.findZone(grid, ge.zoneId);
                const v = String(el.value || '').trim();
                if (z) {
                    if (v) z.floorLabel = v; else delete z.floorLabel;
                }
                break;
            }
            case 'prefix': if (eg) eg.prefix = String(el.value || '').trim(); break;
            case 'start': if (eg) eg.start = Math.round(numOr(el.value, eg.start)); break;
            case 'numbering': {
                if (!eg) break;
                const nb = G.normalizeNumbering(el.value);
                const dflt = G.DEFAULT_PREFIX[eg.axis];
                if (nb === 'num') {
                    delete eg.numbering;
                    if (!eg.prefix) eg.prefix = dflt; // 머리글 없는 숫자(1, 2)로 남지 않게 기본 X/Y로
                } else {
                    eg.numbering = nb;
                    if (eg.prefix === dflt) eg.prefix = ''; // 도면 표기 그대로 a, b, c(머리글이 필요하면 다시 입력)
                }
                if (eg.start < 1) eg.start = 1;
                break;
            }
            case 'gorder': {
                if (!eg) break;
                const wasRev = eg.reverse === true;
                const toRev = el.value === 'desc';
                if (wasRev === toRev) return;
                ge.orderUndo = { groupId: eg.id, reverse: wasRev }; ge.spacingUndo = null;
                if (toRev) eg.reverse = true; else delete eg.reverse;
                break;
            }
            case 'gangle': if (eg) eg.angle = Math.max(-89, Math.min(89, numOr(el.value, eg.angle))); break;
            case 'gband': if (eg) eg.band = Math.max(0, numOr(el.value, eg.band)); break;
            case 'label':
                if (selF) {
                    const v = String(el.value || '').trim();
                    if (v) selF.line.label = v; else delete selF.line.label;
                }
                break;
            case 'gskip':
                if (eg) {
                    const sk = G.parseSkipText(el.value, eg.numbering);
                    if (sk.length) eg.skip = sk; else delete eg.skip;
                }
                break;
            case 'lnum':
                if (selF) {
                    const n = G.parseNumberToken(el.value, selF.group.numbering);
                    if (n != null) selF.line.num = n; else delete selF.line.num; // 비우거나 읽을 수 없으면 자동 번호
                }
                break;
            case 'spacePct': {
                const v = Number(el.value);
                ge.spacePct = Number.isFinite(v) && v > 0 ? Math.max(10, Math.min(500, v)) : 100;
                if (String(ge.spacePct) !== String(el.value)) el.value = ge.spacePct;
                return;
            }
            case 'spaceAnchor':
                ge.spaceAnchor = ['selected', 'first', 'last', 'center'].includes(el.value) ? el.value : 'first';
                return;
            case 'spaceScope':
                ge.spaceScope = el.value === 'axis' ? 'axis' : 'group';
                renderGridPanel();
                return;
            case 'autoOuter':
                ge.autoOuter = el.value === 'all' ? 'all' : 'outer';
                return;
            case 'autoAxes':
                ge.autoAxes = (el.value === 'cols' || el.value === 'rows') ? el.value : 'both';
                if (ge.autoPreview) { ge.autoPreview.axes = ge.autoAxes; renderGridPanel(); drawCanvas(); }
                return;
            case 'autoSens':
                ge.autoSens = (el.value === 'short' || el.value === 'long') ? el.value : 'normal';
                return;
            case 'langle': if (selF) G.setLineAngle(selF.line, selF.group.axis, Math.max(-89, Math.min(89, numOr(el.value, 0))), gctx); break;
            case 'lband':
                if (selF) {
                    if (el.value === '' || !Number.isFinite(Number(el.value))) delete selF.line.band;
                    else selF.line.band = Math.max(0, Number(el.value));
                }
                break;
            case 'auto': grid.autoLocation = !!el.checked; break;
            default: return;
        }
        gridChanged();
    }

    function syncGridButtons() {
        const on = !!(window.BSA_gridEdit && window.BSA_gridEdit.active);
        ['btnGridLines', 'mobileBtnGridLines'].forEach((id) => {
            const b = document.getElementById(id);
            if (!b) return;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function setGridEditActive(on) {
        const ge = gridEditState();
        // 행·열 선 편집은 PC 전용(터치 기기엔 버튼 없음). 이미 그어 둔 선·위치 자동 입력은 그대로 동작
        if (on && isTouchToolbarUi()) return;
        if (on && !gridLib()) {
            window.showToast?.('행·열 모듈을 불러오지 못했습니다. Ctrl+F5로 새로고침해 주세요.', 'error', 3000);
            return;
        }
        if (on && (!state.bgImage || !state.currentBuildingId)) {
            window.showToast?.('도면이 있는 층에서 쓸 수 있습니다.', 'info', 2000);
            return;
        }
        gridCancelDrag();
        ge.polyDraft = null;
        if (ge.tool === 'zonePoly') ge.tool = 'select';
        ge.active = !!on;
        ge.bendArmed = false;
        if (!on) ge.sel = null;
        syncGridButtons();
        renderGridPanel();
        drawCanvas();
    }
    window.setGridEditActive = setGridEditActive;

    ['btnGridLines', 'mobileBtnGridLines'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => setGridEditActive(!gridEditState().active));
    });

    // ---- NO. 박스 자동 정리 (2026-09-30) ----
    // 계산은 js/shared/box-auto-layout.js(window.BSA.boxAutoLayout). 마킹 점·영역은 그대로, 박스 x·y만 바꾼다.
    // 한글·PDF·이미지 출력은 저장된 박스 자리를 그대로 쓰므로 따로 손댈 것 없음.
    function boxAutoLayoutLib() {
        return (window.BSA && window.BSA.boxAutoLayout) || null;
    }

    function defectAreaAabb(d) {
        if (!d || d.shapeType !== 'area' || d.areaX1 === undefined) return null;
        let x1 = Math.min(d.areaX1, d.areaX2); let x2 = Math.max(d.areaX1, d.areaX2);
        let y1 = Math.min(d.areaY1, d.areaY2); let y2 = Math.max(d.areaY1, d.areaY2);
        if (Array.isArray(d.areaPoints) && d.areaPoints.length >= 3) {
            const xs = d.areaPoints.map((p) => Number(p && p.x)).filter(Number.isFinite);
            const ys = d.areaPoints.map((p) => Number(p && p.y)).filter(Number.isFinite);
            if (xs.length && ys.length) { x1 = Math.min(...xs); x2 = Math.max(...xs); y1 = Math.min(...ys); y2 = Math.max(...ys); }
        }
        return [x1, y1, x2, y2].every(Number.isFinite) ? { x1, y1, x2, y2 } : null;
    }

    /** 도면에 그리는 것과 같은 묶음(통합 X-1/X-2는 박스 하나)으로 계산 입력을 만든다 */
    function buildBoxAutoLayoutItems(defects, mode) {
        const L = boxAutoLayoutLib();
        const rot = state.rotationAngle || 0;
        const items = [];
        const membersById = {};
        const seenGroup = new Set();
        (defects || []).forEach((d) => {
            if (!d || !d.id) return;
            let members = [d];
            let rep = d;
            if (d.groupId) {
                if (seenGroup.has(d.groupId)) return;
                const gm = defects.filter((x) => x && x.groupId === d.groupId);
                if (gm.length > 1) {
                    seenGroup.add(d.groupId);
                    members = gm;
                    rep = pickDefectGroupRepresentative(gm) || d;
                }
            }
            const bx = Number(rep.x); const by = Number(rep.y);
            if (!Number.isFinite(bx) || !Number.isFinite(by)) return;
            const styleKey = getDefectStyleKey(rep.category, rep.defectType);
            const scale = getStyleSize(styleKey).pin;
            const label = formatDefectPinLabel(rep, styleKey);
            const dims = measurePinBoxDimensions(state.ctx, label, scale, 1.0);
            let badge = null;
            const hasBm = defectHasCornerMark(rep);
            const cwApi = crackWidthBadgeApi();
            const cwText = (cwApi && readCrackWidthBadgePref()) ? (cwApi.formatBadgeText(rep) || '') : '';
            if (hasBm || cwText) {
                const gh = getBookmarkChromeGlyphHeight(scale);
                if (cwApi && cwText && typeof cwApi.badgeExtentExtra === 'function') {
                    badge = cwApi.badgeExtentExtra(dims.w, scale, cwText, hasBm, measureCrackWidthBadgeText);
                } else if (hasBm) {
                    badge = { w: gh * 2.2, h: gh };
                }
            }
            const targets = [];
            members.filter((m) => m && !m.surveyExtra).forEach((m) => {
                const area = defectAreaAabb(m);
                if (area) targets.push({ rect: area });
                else if (m.targetX !== undefined && m.targetY !== undefined
                    && Number.isFinite(Number(m.targetX)) && Number.isFinite(Number(m.targetY))) {
                    targets.push({ x: Number(m.targetX), y: Number(m.targetY) });
                }
            });
            const manual = members.some((m) => m && m.boxManual === true);
            items.push({
                id: rep.id,
                cx: bx,
                cy: by,
                ext: L.boxExtent(dims.w, dims.h, rot, badge),
                targets,
                movable: mode === 'all' ? true : !manual,
                manual
            });
            membersById[rep.id] = members;
        });
        return { items, membersById };
    }

    /** 범례 박스(이미지 좌표 AABB) — 박스가 범례를 가리지 않게 */
    function boxAutoLayoutObstacles() {
        const out = [];
        try {
            const b = (typeof lastLegendBoxBounds !== 'undefined') ? lastLegendBoxBounds : null;
            if (b && [b.x, b.y, b.w, b.h].every((v) => Number.isFinite(Number(v)))) {
                const rad = -((state.rotationAngle || 0) * Math.PI) / 180;
                const c = Math.cos(rad); const s = Math.sin(rad);
                const pts = [[0, 0], [b.w, 0], [b.w, b.h], [0, b.h]].map(([x, y]) => ({ x: b.x + x * c - y * s, y: b.y + x * s + y * c }));
                out.push({
                    x1: Math.min(...pts.map((p) => p.x)), y1: Math.min(...pts.map((p) => p.y)),
                    x2: Math.max(...pts.map((p) => p.x)), y2: Math.max(...pts.map((p) => p.y))
                });
            }
        } catch (_e) { /* 범례 없음 */ }
        return out;
    }

    /**
     * 이 층 박스 계산(저장 안 함). mode: 'overlap'(겹친 박스만, 직접 옮긴 박스 제외) | 'all'
     * 결과: { moves: { 대표id: {x,y} }, membersById, before, after, movableCount }
     */
    function planMarkingBoxAutoLayout(mode) {
        const L = boxAutoLayoutLib();
        if (!L) return null;
        const defects = filterMapPlacedDefects(getCurrentFloorDefects());
        const { items, membersById } = buildBoxAutoLayoutItems(defects, mode);
        const dims = getFloorPlanDisplayDims();
        const opts = { bounds: { w: dims.w, h: dims.h }, obstacles: boxAutoLayoutObstacles() };
        if (mode !== 'all') {
            const conf = L.conflictsAtCurrent(items, opts);
            items.forEach((it) => { if (!conf[it.id]) it.movable = false; });
        }
        const movableCount = items.filter((it) => it.movable).length;
        const manualSkipped = mode !== 'all' ? items.filter((it) => it.manual).length : 0;
        const res = movableCount ? L.layoutBoxes(items, opts) : { moves: {}, before: 0, after: 0 };
        return Object.assign({ membersById, movableCount, manualSkipped, total: items.length }, res);
    }

    function applyMarkingBoxAutoLayout(plan, mode) {
        const ids = Object.keys((plan && plan.moves) || {});
        if (!ids.length) return 0;
        if (typeof pushDefectHistory === 'function') pushDefectHistory(); // 되돌리기 한 번으로 전체 취소
        ids.forEach((id) => {
            const mv = plan.moves[id];
            (plan.membersById[id] || []).forEach((m) => {
                m.x = mv.x;
                m.y = mv.y;
                if (mode === 'all' && m.boxManual) m.boxManual = false; // 다시 자동 자리
                touchDefectPositionUpdatedAt(m);
            });
        });
        saveStateToLocalStorage();
        drawCanvas();
        return ids.length;
    }

    async function runMarkingBoxAutoLayout() {
        if (!boxAutoLayoutLib()) {
            window.showToast?.('박스 정리 모듈을 불러오지 못했습니다. 새로고침해 주세요.', 'error', 3000);
            return;
        }
        if (!state.currentBuildingId || !state.currentFloor || !state.bgImage) {
            window.showToast?.('도면이 있는 층에서 쓸 수 있습니다.', 'info', 2000);
            return;
        }
        if (!filterMapPlacedDefects(getCurrentFloorDefects()).length) {
            window.showToast?.('이 층에 마킹이 없습니다.', 'info', 2000);
            return;
        }
        const pick = await window.appChoose('NO. 박스를 마킹 점·다른 박스·지시선과 겹치지 않는 자리로 옮깁니다.\n마킹 점(화살표 끝)·영역은 움직이지 않습니다.', [
            { label: '겹친 박스만', detail: '직접 끌어 옮긴 박스는 그대로 둡니다' },
            { label: '모든 박스', detail: '직접 옮긴 박스도 포함해 이 층 박스를 모두 다시 놓습니다' }
        ], { title: '박스 자동 정리', okText: '정리', defaultIndex: 0 });
        if (pick == null) return;
        const mode = pick === 1 ? 'all' : 'overlap';
        const plan = planMarkingBoxAutoLayout(mode);
        if (!plan) return;
        if (!plan.movableCount) {
            window.showToast?.(plan.manualSkipped
                ? `겹친 박스가 없습니다(직접 옮긴 박스 ${plan.manualSkipped}개는 건너뜀 — 「모든 박스」로 포함).`
                : '겹친 박스가 없습니다.', 'info', 3500);
            return;
        }
        const n = applyMarkingBoxAutoLayout(plan, mode);
        if (!n) {
            window.showToast?.('더 나은 자리를 찾지 못했습니다.', 'info', 2500);
            return;
        }
        window.showToast?.(`박스 ${n}개를 옮겼습니다(겹침 ${plan.before} → ${plan.after}). 되돌리기로 한 번에 취소할 수 있습니다.`, 'success', 5000);
    }
    window.runMarkingBoxAutoLayout = runMarkingBoxAutoLayout;
    window.planMarkingBoxAutoLayout = planMarkingBoxAutoLayout;

    ['btnBoxAutoLayout', 'mobileBtnBoxAutoLayout'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => { runMarkingBoxAutoLayout(); });
    });

    // 행·열 편집 중: Delete=선택한 선(꺾인 점) 삭제, Esc=꺾기 취소 → 선택 해제 → 편집 끝 (다른 단축키보다 먼저)
    window.addEventListener('keydown', (e) => {
        const ge = window.BSA_gridEdit;
        if (!ge || !ge.active) return;
        const t = e.target;
        const tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        if (document.querySelector('.modal-overlay.open')) return;
        if (ge.tool === 'zonePoly' && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === 'Enter') gridPolyFinish();
            else if (e.key === 'Escape') gridPolyCancel();
            else {
                if (ge.polyDraft && ge.polyDraft.length) ge.polyDraft.pop();
                renderGridPanel();
                drawCanvas();
            }
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && (ge.orderUndo || ge.spacingUndo)) {
            // 행·열 번호 순서(뒤집기·오름/내림) 또는 간격 비율 되돌리기 — 가장 최근 것 하나
            e.preventDefault();
            e.stopImmediatePropagation();
            if (ge.spacingUndo) undoGridSpacingChange(); else undoGridOrderChange();
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && ge.sel) {
            e.preventDefault();
            e.stopImmediatePropagation();
            gridDeleteSelected();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (ge.bendArmed) ge.bendArmed = false;
            else if (ge.sel) ge.sel = null;
            else { setGridEditActive(false); return; }
            renderGridPanel();
            drawCanvas();
        } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && ge.sel) {
            // F = 꺾기 추가 토글 (선을 선택한 상태에서만, 버튼 「꺾기 추가」와 같은 동작)
            const gridF = getCurrentFloorGrid(false);
            if (!gridF || !gridLib().findLine(gridF, ge.sel.lineId)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            ge.bendArmed = !ge.bendArmed;
            renderGridPanel();
            drawCanvas();
        }
    }, true);

    // ---- 마킹 위치 자동 입력 ----
    // 2026-09-28 구조 변경: 행·열 칸 이름은 결함의 **gridLoc** 칸에 따로 저장(시스템이 계산해 채움).
    // location(= 층 + 상세 위치)은 실 이름 등 사람이 쓰는 칸으로 두고 절대 건드리지 않는다.
    // 예전 실험 데이터(상세 위치 앞에 칸 이름을 붙이고 gridLocAuto로 표시)는 만날 때 gridLoc으로 옮기고 상세 위치에는 실 이름만 남긴다.
    function currentGridHasLines() {
        return gridHasLines(getCurrentFloorGrid(false));
    }

    /** 부재 명칭(예전 이름은 새 이름으로 — 작은보→보(B) 등) */
    function gridMemberName(v) {
        try {
            return String(memberNameOut(v) || '');
        } catch (e) {
            return String(v || '');
        }
    }

    /**
     * 행·열 선이 있고 자동 입력이 켜져 있으면 칸 이름, 아니면 null(아무것도 안 건드림).
     * member: 부재 명칭 — 거더 규칙은 grid-lines.js(슬래브·보(B) 등은 보통 폭 규칙)
     */
    function computeGridAutoLocationForPoints(pts, member) {
        const G = gridLib();
        const grid = getCurrentFloorGrid(false);
        if (!G || !grid || grid.autoLocation === false || !gridHasLines(grid)) return null;
        const clean = (pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        if (!clean.length) return null;
        return G.computeGridLocation(grid, clean, getGridCtx(), { member: gridMemberName(member) });
    }

    function gridNum(v) {
        return (v === null || v === undefined || v === '') ? NaN : Number(v);
    }

    /** 영역은 네 모서리, 핀은 화살표 끝(없으면 박스 위치) */
    function getDefectGridPoints(d) {
        if (!d) return [];
        const ax1 = gridNum(d.areaX1);
        const ay1 = gridNum(d.areaY1);
        const ax2 = gridNum(d.areaX2);
        const ay2 = gridNum(d.areaY2);
        if (d.shapeType === 'area' && [ax1, ay1, ax2, ay2].every(Number.isFinite)) {
            return [{ x: ax1, y: ay1 }, { x: ax2, y: ay1 }, { x: ax1, y: ay2 }, { x: ax2, y: ay2 }];
        }
        const tx = gridNum(d.targetX);
        const ty = gridNum(d.targetY);
        if (Number.isFinite(tx) && Number.isFinite(ty)) return [{ x: tx, y: ty }];
        const x = gridNum(d.x);
        const y = gridNum(d.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
    }

    // 2026-10-28 「화살표 추가」(같은 groupId로 한 결함에 위치가 여러 개)면 행·열은 위치마다 하나씩 나열하지 않고
    // 모든 화살표 끝(영역은 네 모서리)을 한 번에 감싸는 큰 범위 하나로 넣는다 — 예: X1~X3/Y1~Y2 (기존 범위 표기 그대로).
    // 같은 층 같은 그룹의 멤버 모두에게 같은 값이 들어가므로 표·보고서의 묶음 행은 값 하나만 보인다.
    // 위치가 하나뿐이거나 그룹이 아니면 예전과 똑같다.
    function getGridGroupMembers(d) {
        if (!d) return [];
        if (!d.groupId || d.surveyExtra) return [d];
        let list = [];
        try {
            list = filterMapPlacedDefects(getCurrentFloorDefects()) || [];
        } catch (_e) {
            list = [];
        }
        let members = list.filter((m) => m && m.groupId === d.groupId && !m.surveyExtra);
        if (typeof markingMembersForGroupRow === 'function' && members.length) members = markingMembersForGroupRow(list, members);
        const out = members.map((m) => (m.id === d.id ? d : m));
        return out.indexOf(d) === -1 ? [d] : out;
    }

    /** 행·열 계산에 쓸 점: 그룹이면 멤버 전체의 점, 아니면 자기 점 */
    function getDefectGridPointsForLoc(d) {
        const ms = getGridGroupMembers(d);
        if (ms.length <= 1) return getDefectGridPoints(d);
        const pts = [];
        ms.forEach((m) => getDefectGridPoints(m).forEach((p) => pts.push(p)));
        return pts.length ? pts : getDefectGridPoints(d);
    }

    /** 부재 규칙: 그룹이면 대표 마킹 기준(멤버 모두 같은 값이 나오게) */
    function getDefectGridMemberForLoc(d) {
        const ms = getGridGroupMembers(d);
        if (ms.length > 1 && typeof pickDefectGroupRepresentative === 'function') {
            const rep = pickDefectGroupRepresentative(ms);
            if (rep && rep.component) return rep.component;
        }
        return d && d.component;
    }

    /** 결함과 같은 그룹 형제들까지 행·열 위치를 맞춤. 하나라도 바뀌면 true */
    function applyGridAutoLocationToGroup(d, floorCode, opts) {
        let changed = !!applyGridAutoLocationToDefect(d, floorCode, opts);
        getGridGroupMembers(d).forEach((m) => {
            if (m === d || !m) return;
            if (applyGridAutoLocationToDefect(m, floorCode, opts)) changed = true;
        });
        return changed;
    }

    /** 묶음 마킹(한 행으로 합침): 멤버 행·열 위치를 모아 ', '로(한 쌍 안의 열/행은 '/') */
    function mergeGroupGridLocProp(members) {
        const uniq = [];
        (members || []).forEach((m) => {
            const g = String((m && m.gridLoc) || '').trim();
            if (g && uniq.indexOf(g) === -1) uniq.push(g);
        });
        return uniq.length ? { gridLoc: uniq.join(', ') } : {};
    }

    /** 결함의 행·열 칸 이름(없으면 '') — 화면 표시용 */
    function getDefectGridLocText(d) {
        const t = String((d && d.gridLoc) || '').trim();
        const G = gridLib();
        return (G && G.compactGridLoc) ? G.compactGridLoc(t) : t;
    }
    window.getDefectGridLocText = getDefectGridLocText;

    /**
     * 한글/PDF 상태조사표 위치 칸: 행·열이 있으면 「행·열\n실 이름(상세 위치)」, 행·열이 없으면 ''(→ 예전 출력 그대로)
     * 예전 실험 데이터(상세 위치 앞에 칸 이름)도 나눠서 출력
     */
    function getDefectGridRoomForReport(d, floorCode, maxUnits, opts) {
        const G = gridLib();
        if (!G || !d) return '';
        return G.reportLocationCell({
            gridLoc: d.gridLoc,
            legacyAuto: d.gridLocAuto,
            detail: extractDefectLocationDetail(d.location || '', floorCode),
            // 한글 칸 폭(em) — 주면 행·열이 넘칠 때만 '/' 뒤에서 줄바꿈
            maxUnits,
            // 1·2종 한글(HWPX) 출력만: 실 이름 먼저, 다음 줄 행·열
            roomFirst: !!(opts && opts.roomFirst)
        });
    }

    /** 예전 실험 데이터 → gridLoc + 실 이름만 남긴 상세 위치. 바뀌면 true */
    function migrateLegacyGridLocation(d, floorCode) {
        const G = gridLib();
        if (!G || !d || !d.gridLocAuto) return false;
        const fc = floorCode || state.currentFloor;
        const detail = extractDefectLocationDetail(d.location || '', fc);
        const sp = G.splitLegacyGridLocation(detail, d.gridLocAuto);
        if (sp.grid) {
            d.location = composeDefectLocation(sp.room, fc);
            if (!d.gridLoc) d.gridLoc = sp.grid;
        }
        delete d.gridLocAuto;
        return true;
    }

    function refreshGridLocHintInModal(text) {
        const locEl = document.getElementById('defectLocation');
        if (!locEl) return;
        let hint = document.getElementById('defectGridLocHint');
        if (!hint) {
            hint = document.createElement('div');
            hint.id = 'defectGridLocHint';
            hint.className = 'defect-grid-loc-hint';
            locEl.insertAdjacentElement('afterend', hint);
        }
        const G = gridLib();
        const t = (G && G.compactGridLoc) ? G.compactGridLoc(String(text || '').trim()) : String(text || '').trim();
        hint.textContent = t ? `행·열: ${t}` : '';
        hint.hidden = !t;
    }

    // ---- 오래된 행·열 위치 자동 갱신 ----
    // 부재를 조사표·일괄 수정·다른 기기에서 바꾸거나, 선을 옮기거나, 계산 규칙이 바뀌면 저장된 gridLoc가 옛값으로 남는다.
    // 결함마다 「계산 입력 지문(규칙+선+부재+점)」을 메모리에 두고, 도면을 그릴 때 지문이 다른 것만 다시 계산한다.
    const gridLocStampMap = new WeakMap();

    function gridLocStampOf(d, sig) {
        const G = gridLib();
        return G.gridLocStamp(sig, getDefectGridPointsForLoc(d), gridMemberName(getDefectGridMemberForLoc(d)));
    }

    function scheduleGridLocFreshness() {
        if (window._bsaGridFreshTimer) return;
        window._bsaGridFreshTimer = setTimeout(() => {
            window._bsaGridFreshTimer = null;
            try {
                refreshStaleGridLocForCurrentFloor();
            } catch (e) {
                console.warn('[grid-lines] fresh', e);
            }
        }, 600);
    }

    /** 지금 층 마킹 중 지문이 바뀐 것만 행·열 위치 다시 계산. 바뀐 개수 */
    function refreshStaleGridLocForCurrentFloor() {
        const G = gridLib();
        if (!G) return 0;
        let dragging = false;
        try { dragging = !!(isDraggingPin || isDraggingPinGroup); } catch (_e) { dragging = false; }
        if (dragging) {
            scheduleGridLocFreshness();
            return 0;
        }
        const grid = getCurrentFloorGrid(false);
        if (!grid) return 0;
        if (grid.pendingScale && !resolvePendingGridScaleForCurrentFloor()) {
            // 복사해 온 선을 이 층 도면 크기에 맞추기 전 — 도면 크기를 알게 되면 그때 계산
            if (state.bgImage) scheduleGridLocFreshness();
            return 0;
        }
        if (gridHasLines(grid) && grid.autoLocation === false) return 0;
        const list = filterMapPlacedDefects(getCurrentFloorDefects());
        const sig = G.gridSignature(grid);
        const modalOpen = !!(elements.defectModal && elements.defectModal.classList.contains('open'));
        const openId = modalOpen ? (document.getElementById('defectPinId')?.value || '') : '';
        let n = 0;
        list.forEach((d) => {
            if (!d || (openId && d.id === openId)) return; // 수정 중인 결함은 저장 때 맞춤
            const st = gridLocStampOf(d, sig);
            if (gridLocStampMap.get(d) === st) return;
            if (applyGridAutoLocationToDefect(d)) n += 1;
            gridLocStampMap.set(d, st);
        });
        if (n) {
            saveStateToLocalStorage();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            if (typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();
        }
        return n;
    }
    window.refreshStaleGridLocForCurrentFloor = refreshStaleGridLocForCurrentFloor;

    /** 결함 하나의 행·열 칸 이름(gridLoc)을 지금 선·부재 기준으로 맞춤. 상세 위치는 안 건드림. 바뀌면 true */
    function applyGridAutoLocationToDefect(d, floorCode, opts) {
        const G = gridLib();
        if (!G || !d) return false;
        const fc = floorCode || state.currentFloor;
        const locBefore = d.location;
        let changed = migrateLegacyGridLocation(d, fc);
        const next = computeGridAutoLocationForPoints(getDefectGridPointsForLoc(d), getDefectGridMemberForLoc(d));
        if (next == null) {
            // 선을 모두 지웠으면 칸 이름도 지움(자동 입력만 꺼 둔 경우는 그대로)
            if (!currentGridHasLines() && d.gridLoc) {
                delete d.gridLoc;
                changed = true;
            }
        } else if (next && d.gridLoc !== next) {
            if (!(opts && opts.onlyIfEmpty && d.gridLoc)) {
                d.gridLoc = next;
                changed = true;
            }
        } else if (!next && d.gridLoc) {
            delete d.gridLoc;
            changed = true;
        }
        if (changed) {
            // 위치칸(내용)까지 바뀐 옛 데이터 정리는 내용 수정, 칸 이름만 바뀐 건 위치 갈래(2026-10-16)
            if (d.location !== locBefore) touchDefectUpdatedAt(d);
            else touchDefectGridLocAuto(d);
            const openId = document.getElementById('defectPinId')?.value;
            if (openId && openId === d.id && elements.defectModal && elements.defectModal.classList.contains('open')) {
                refreshGridLocHintInModal(d.gridLoc || '');
            }
        }
        return changed;
    }

    function applyGridAutoLocationAfterDrag(defects) {
        let n = 0;
        (defects || []).forEach((d) => {
            try {
                // 화살표 추가 묶음이면 같은 그룹 형제도 같은 큰 범위로(2026-10-28)
                if (applyGridAutoLocationToGroup(d)) n += 1;
            } catch (e) {
                console.warn('[grid-lines] auto location', e);
            }
        });
        if (n && typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();
        return n;
    }

    function afterGridBulkChange(msg) {
        if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') discardStalePendingRemoteAfterLocalPinEdit();
        if (state.currentBuildingId && state.currentFloor && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(`${state.currentBuildingId}_${state.currentFloor}`);
        saveStateToLocalStorage();
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function' && state.currentTab === 'tab-survey') renderSurveyTable();
        drawCanvas();
        window.showToast?.(msg, 'success', 2500);
    }

    function countGridBulkChanges(opts) {
        const list = filterMapPlacedDefects(getCurrentFloorDefects());
        const n = list.filter((d) => {
            const copy = { ...d };
            return applyGridAutoLocationToDefect(copy, null, opts);
        }).length;
        return { list, n };
    }

    /** 「이 층 마킹에 위치 채우기」 — 행·열 칸 이름이 없는 마킹만 채움(상세 위치 그대로) */
    async function fillGridLocationForCurrentFloor() {
        if (!currentGridHasLines()) {
            window.showToast?.('먼저 행·열 선을 그어 주세요.', 'info', 2000);
            return;
        }
        if (getCurrentFloorGrid(false).autoLocation === false) {
            window.showToast?.('「마킹 위치에 칸 이름 자동 입력」을 켜 주세요.', 'info', 2500);
            return;
        }
        const { list, n } = countGridBulkChanges({ onlyIfEmpty: true });
        if (!n) {
            window.showToast?.('채울 마킹이 없습니다. (이미 행·열 위치가 있습니다)', 'info', 2500);
            return;
        }
        if (!await window.appConfirm(`이 층 마킹 ${n}개에 행·열 위치를 채웁니다.\n행·열 위치가 없는 마킹만 채우고, 상세 위치(실 이름)는 그대로 둡니다.\n(되돌리기로 취소할 수 있습니다)`)) return;
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        // 2026-10-23 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼우면, 확인 전에 잡아 둔 목록을 고쳐도
        // 화면·저장에 안 남아 두세 번 눌러야 됐다 — 확인 뒤 목록을 다시 읽는다.
        const listNow = filterMapPlacedDefects(getCurrentFloorDefects());
        let done = 0;
        listNow.forEach((d) => { if (applyGridAutoLocationToDefect(d, null, { onlyIfEmpty: true })) done += 1; });
        afterGridBulkChange(`마킹 ${done}개에 행·열 위치를 채웠습니다.`);
    }

    /**
     * 2026-10-31 「실 이름 두고 행·열만 다시 계산」 — 이 층 마킹 전부의 행·열 위치(gridLoc)를 지금 선 기준으로 다시 쓴다.
     * 상세 위치(location: 실 이름·층 이름)는 그대로. 예전 「위치칸 비우고 행·열 다시 채우기」는 실 이름까지 지워서 이 버튼으로 바꿨다(사용자).
     * 선 밖은 보통 규칙(~X1 / X7~). 되돌리기 한 번으로 전체 취소.
     */
    async function recalcGridLocationForCurrentFloor() {
        if (!currentGridHasLines()) {
            window.showToast?.('먼저 행·열 선을 그어 주세요.', 'info', 2000);
            return;
        }
        const list = filterMapPlacedDefects(getCurrentFloorDefects());
        if (!list.length) {
            window.showToast?.('이 층에 마킹이 없습니다.', 'info', 2000);
            return;
        }
        if (!await window.appConfirm(`이 층 마킹 ${list.length}개의 행·열 위치를 지금 선 기준으로 다시 계산합니다.\n`
            + `상세 위치·실 이름은 그대로 둡니다.\n(되돌리기로 한 번에 취소할 수 있습니다)`)) return;
        const grid = getCurrentFloorGrid(false);
        const wasAuto = grid.autoLocation !== false;
        const fc = state.currentFloor;
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        let done = 0;
        grid.autoLocation = true; // 직접 누른 명령 — 자동 입력 체크와 무관하게 계산
        // 2026-10-23 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼우면, 확인 전에 잡아 둔 목록을 고쳐도
        // 화면·저장에 안 남아 두세 번 눌러야 됐다 — 확인 뒤 목록을 다시 읽는다.
        const listNow = filterMapPlacedDefects(getCurrentFloorDefects());
        try {
            listNow.forEach((d) => { if (applyGridAutoLocationToDefect(d, fc)) done += 1; });
        } finally {
            grid.autoLocation = wasAuto;
        }
        afterGridBulkChange(done ? `마킹 ${done}개의 행·열 위치를 다시 계산했습니다.` : '바뀐 행·열 위치가 없습니다.');
    }

    /** 결함 창 열 때: 행·열 위치를 입력칸 아래에 보여 줌(상세 위치 입력칸은 실 이름용 — 건드리지 않음) */
    function applyGridAutoLocationToModal(locEl, existingPin) {
        window._gridModalPts = null;
        if (!locEl) return;
        const G = gridLib();
        if (existingPin) {
            window._gridModalPts = getDefectGridPointsForLoc(existingPin);
            let grid = existingPin.gridLoc || '';
            if (G && existingPin.gridLocAuto) {
                // 예전 실험 데이터: 입력칸에는 실 이름만, 칸 이름은 아래 표시(저장하면 옮겨짐)
                const sp = G.splitLegacyGridLocation(locEl.value, existingPin.gridLocAuto);
                if (sp.grid) {
                    locEl.value = sp.room;
                    grid = grid || sp.grid;
                }
            }
            const live = computeGridAutoLocationForPoints(window._gridModalPts, gridModalMember() || getDefectGridMemberForLoc(existingPin));
            refreshGridLocHintInModal(live != null ? live : grid);
            return;
        }
        let pts = [];
        const ar = window._pendingAreaRect;
        if (ar && [ar.x1, ar.y1, ar.x2, ar.y2].every((v) => Number.isFinite(Number(v)))) {
            pts = [{ x: ar.x1, y: ar.y1 }, { x: ar.x2, y: ar.y1 }, { x: ar.x1, y: ar.y2 }, { x: ar.x2, y: ar.y2 }];
        } else if (window._pendingPinCoords) {
            pts = getDefectGridPoints(window._pendingPinCoords);
        }
        window._gridModalPts = pts;
        refreshGridLocHintInModal(computeGridAutoLocationForPoints(pts, gridModalMember()) || '');
    }

    function gridModalMember() {
        const inp = document.getElementById('defectComponentInput');
        const sel = document.getElementById('defectComponent');
        return (inp && String(inp.value || '').trim()) || (sel && sel.value) || '';
    }

    /** 수정창에서 부재를 바꿨을 때(거더 ↔ 그 밖) — 행·열 위치 표시만 다시 계산(저장 때 결함에 반영) */
    function refreshGridAutoLocationInModal() {
        const pts = window._gridModalPts;
        if (!pts || !pts.length) return;
        if (!elements.defectModal || !elements.defectModal.classList.contains('open')) return;
        const next = computeGridAutoLocationForPoints(pts, gridModalMember());
        if (next == null) return;
        refreshGridLocHintInModal(next);
    }
    [['defectComponent', 'change'], ['defectComponentInput', 'change'], ['defectComponentInput', 'input']].forEach(([id, ev]) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev, () => setTimeout(refreshGridAutoLocationInModal, 0));
    });

    /** 결함 저장 때: 행·열 위치(gridLoc)를 지금 위치·부재로 맞춤. 상세 위치(실 이름)는 입력한 그대로 */
    function syncGridAutoFlagOnCommit(defect) {
        if (!defect) return;
        try {
            applyGridAutoLocationToGroup(defect);
        } catch (e) {
            console.warn('[grid-lines] commit', e);
        }
    }
    /**
     * 2026-10-19 「상세위치 전부 지우기」 → 2026-10-31 「상세위치 행·열 지우기」: 상세 위치(location) 글자 안의 행·열 표기만 지운다.
     * 실 이름·위치 글은 그대로 둔다(규칙은 grid-lines.js stripGridTextFromDetail).
     * 대상은 「실 이름 두고 행·열만 다시 계산」과 같은 목록(이 층 도면에 놓인 마킹, filterMapPlacedDefects).
     * 행·열 위치(gridLoc)는 그대로 둔다. 3종은 층 이름을 앞에 유지(composeDefectLocation).
     * 예전 실험 데이터(gridLocAuto)는 먼저 gridLoc으로 옮겨 행·열 위치를 잃지 않게 한다.
     * 칸 시각은 touchDefectUpdatedAt이 location 칸에 찍는다 → 다른 기기의 옛 상세 위치보다 이 지우기가 이긴다.
     * 되돌리기 한 번으로 전체 취소.
     */
    /** 상세 위치에서 행·열 표기를 뺀 위치 글자. 뺄 것이 없으면 지금 글자 그대로 */
    function locationWithoutGridText(d, fc) {
        const G = gridLib();
        const cur = String((d && d.location) || '');
        if (!G) return cur;
        const raw = state.floorGridLines && state.floorGridLines[getFloorMapStyleKey(state.currentBuildingId, fc)];
        const prefixes = ((raw && raw.groups) || []).map((g) => g && g.prefix);
        // 층·도면 이름을 떼지 않고 글자 전체에서 행·열만 뺀다(「정면 X1/Y2」→「정면」, 적힌 층 이름도 그대로)
        const next = G.stripGridTextFromDetail(cur, { known: [d.gridLoc, d.gridLocAuto], prefixes });
        if (next === cur.trim()) return cur;
        return next || composeDefectLocation('', fc);
    }

    function defectHasGridTextInDetail(d, fc) {
        return !!d && (!!d.gridLocAuto || locationWithoutGridText(d, fc) !== String(d.location || ''));
    }

    function clearDefectDetailLocation(d, fc) {
        if (!d) return false;
        let changed = false;
        if (d.gridLocAuto && migrateLegacyGridLocation(d, fc)) changed = true;
        const next = locationWithoutGridText(d, fc);
        if (String(d.location || '') !== next) {
            d.location = next;
            changed = true;
        }
        return changed;
    }

    async function clearDetailLocationForCurrentFloor() {
        const fc = state.currentFloor;
        const list = filterMapPlacedDefects(getCurrentFloorDefects());
        if (!list.length) {
            window.showToast?.('이 층에 마킹이 없습니다.', 'info', 2000);
            return;
        }
        const targets = list.filter((d) => defectHasGridTextInDetail(d, fc));
        if (!targets.length) {
            window.showToast?.('상세 위치에 지울 행·열이 없습니다.', 'info', 2000);
            return;
        }
        if (!await window.appConfirm(`이 층 마킹 ${list.length}개 중 상세 위치에 행·열이 적힌 ${targets.length}개에서 행·열 글자만 지웁니다.\n`
            + `실 이름·위치 글과 행·열 위치 칸은 그대로 둡니다.\n(되돌리기로 한 번에 취소할 수 있습니다)`)) return;
        // 2026-10-23 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼우면, 확인 전에 잡아 둔 목록을 고쳐도
        // 화면·저장에 안 남아 두세 번 눌러야 됐다 — 확인 뒤 목록을 다시 읽는다.
        const targetsNow = filterMapPlacedDefects(getCurrentFloorDefects()).filter((d) => defectHasGridTextInDetail(d, fc));
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        let done = 0;
        targetsNow.forEach((d) => {
            if (clearDefectDetailLocation(d, fc)) {
                touchDefectUpdatedAt(d);
                done += 1;
            }
        });
        afterGridBulkChange(`마킹 ${done}개의 상세 위치에서 행·열을 지웠습니다.`);
    }

    // ---- 2026-10-27 「전체층 상세위치 지우기」 → 2026-10-31 「전체층 상세위치 행·열 지우기」(행·열 툴바) ----
    // 이 건물(이 회차·이 동)의 모든 층 상세 위치에서 행·열 글자만 지운다(실 이름·위치 글은 그대로).
    // 층 목록 = 건물 층 목록 ∪ 기기 메모리(state.defects)에 있는 이 건물 키(외부 입면 층 포함). 서버를 따로 읽지 않는다(읽기 폭주 방지) —
    // 결함 데이터는 이미 기기에 있고, 바뀐 층은 markFloorKeyDirty → 보통 저장·동기화 길로 층마다 올라간다(오프라인이면 나중에).
    /** 읽기만 하는 계획: 층마다 { fc, key, label, total, skippedUnplaced, targets } */
    function planClearDetailForAllFloors(bldgId, hasTarget) {
        // hasTarget: 대상 판정(기본 = 상세 위치에 행·열 글자가 있나). 「상세위치 전부 지우기」는 상세 위치가 적힌 결함을 대상으로 넘긴다
        const isTarget = typeof hasTarget === 'function' ? hasTarget : defectHasGridTextInDetail;
        const id = bldgId || state.currentBuildingId;
        const out = { bldgId: id, floors: [], floorCount: 0, targetFloors: 0, targetCount: 0, skippedUnplaced: 0 };
        if (!id) return out;
        const bldg = (state.buildings || []).find((b) => b && b.id === id) || state.currentBuilding;
        const prefix = `${id}_`;
        const order = [];
        const labelOf = new Map();
        const add = (code, label) => {
            const fc = String(code || '');
            if (!fc || fc === 'ROUND_SKETCH_MEMO') return;
            if (!labelOf.has(fc)) { labelOf.set(fc, String(label || fc)); order.push(fc); }
            else if (label && labelOf.get(fc) === fc) labelOf.set(fc, String(label));
        };
        const avail = (typeof window.getBuildingAvailableFloors === 'function' && bldg)
            ? (window.getBuildingAvailableFloors(bldg) || [])
            : ((bldg && bldg.floorsList) || []);
        avail.forEach((f) => { if (f && f.floorCode) add(f.floorCode, f.floorLabel); });
        Object.keys(state.defects || {}).forEach((k) => {
            if (k.indexOf(prefix) !== 0) return;
            const owner = (typeof findBuildingForFloorKey === 'function') ? findBuildingForFloorKey(k) : null;
            if (owner && owner.id !== id) return; // 다른 건물 키(이름이 겹치는 경우)
            add(k.slice(prefix.length), null);
        });
        order.forEach((fc) => {
            const key = `${id}_${fc}`;
            const list = Array.isArray(state.defects && state.defects[key]) ? state.defects[key] : [];
            const placed = filterMapPlacedDefects(list); // 「이 층」 버튼과 같은 대상(도면에 놓인 마킹)
            const targets = placed.filter((d) => isTarget(d, fc));
            out.floors.push({ fc, key, label: labelOf.get(fc) || fc, total: list.length, skippedUnplaced: list.length - placed.length, targets });
            out.skippedUnplaced += list.length - placed.length;
            if (targets.length) { out.targetFloors += 1; out.targetCount += targets.length; }
        });
        out.floorCount = out.floors.length;
        return out;
    }

    async function clearDetailLocationForAllFloors() {
        const bId = state.currentBuildingId;
        if (!bId) { window.showToast?.('먼저 건축물을 선택하세요.', 'info', 2000); return; }
        const plan0 = planClearDetailForAllFloors(bId);
        if (!plan0.targetCount) {
            window.showToast?.(`상세 위치에 지울 행·열이 없습니다. (${plan0.floorCount}개 층 확인${plan0.skippedUnplaced ? ` · 도면에 안 놓인 결함 ${plan0.skippedUnplaced}개는 대상 아님` : ''})`, 'info', 3500);
            return;
        }
        const bldg = state.currentBuilding || (state.buildings || []).find((b) => b && b.id === bId);
        const dong = (bldg && typeof getBuildingDongLabel === 'function') ? String(getBuildingDongLabel(bldg) || '').trim() : '';
        const bName = `${(bldg && bldg.name) || '이 건물'}${dong ? ` ${dong}` : ''}`;
        const shown = plan0.floors.filter((f) => f.targets.length);
        const lines = shown.slice(0, 8).map((f) => `  · ${f.label}: ${f.targets.length}개`).join('\n') + (shown.length > 8 ? `\n  · 외 ${shown.length - 8}개 층` : '');
        if (!await window.appConfirm(`「${bName}」 건물의 모든 층(${plan0.floorCount}개 층 확인) 상세 위치에서 행·열 글자만 지웁니다.\n`
            + `바뀌는 결함 ${plan0.targetCount}개 · ${plan0.targetFloors}개 층\n${lines}\n\n`
            + `실 이름·위치 글, 행·열 위치 칸, 마킹 위치·번호·사진은 그대로입니다.\n`
            + `${plan0.skippedUnplaced ? `도면에 아직 놓지 않은 결함 ${plan0.skippedUnplaced}개는 건드리지 않습니다.\n` : ''}`
            + `(이 층 화면에서 되돌리기 한 번으로 전체 층을 취소할 수 있습니다)`)) return;
        // 2026-10-23 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼울 수 있다 — 확인 뒤 목록을 다시 읽는다
        if (state.currentBuildingId !== bId) {
            window.showToast?.('건물이 바뀌어 지우지 않았습니다. 다시 시도하세요.', 'warning', 3000);
            return;
        }
        const plan = planClearDetailForAllFloors(bId);
        if (!plan.targetCount) {
            window.showToast?.('상세 위치에 지울 행·열이 이미 없습니다.', 'info', 2500);
            return;
        }
        const curKey = `${bId}_${state.currentFloor}`;
        // 되돌리기 한 번에 모든 층이 돌아가도록 바뀌는 다른 층도 같은 기록에 담는다
        if (typeof pushDefectHistory === 'function') pushDefectHistory(plan.floors.filter((f) => f.targets.length && f.key !== curKey).map((f) => f.key));
        let done = 0;
        let floorsDone = 0;
        const dirtyKeys = [];
        plan.floors.forEach((f) => {
            let n = 0;
            f.targets.forEach((d) => {
                if (clearDefectDetailLocation(d, f.fc)) {
                    touchDefectUpdatedAt(d); // 내용 시각(contentUpdatedAt·칸 시각) → 동기화에서 이김
                    n += 1;
                }
            });
            if (n) { done += n; floorsDone += 1; dirtyKeys.push(f.key); }
        });
        if (typeof markFloorKeyDirty === 'function') dirtyKeys.forEach((k) => markFloorKeyDirty(k));
        afterGridBulkChange(`전체 ${floorsDone}개 층 마킹 ${done}개의 상세 위치에서 행·열을 지웠습니다.${plan.skippedUnplaced ? ` (도면에 안 놓인 ${plan.skippedUnplaced}개 제외)` : ''}`);
    }

    // ---- 2026-11-02 「상세위치 전부 지우기」(이 층 / 전체층) — 행·열만 지우는 위 버튼과 따로 ----
    // 상세 위치(location) 글자를 통째로 비운다(실 이름·행·열 글자 모두). 행·열 위치 칸(gridLoc)·실 이름 칸·마킹 위치·번호·사진은 그대로.
    // 3종은 비우면 층 이름이 저장되므로 층 이름만 남는다(composeDefectLocation). 대상은 「행·열 지우기」와 같은 목록(도면에 놓인 마킹).
    function defectHasDetailLocationText(d, fc) {
        return !!d && String(d.location || '').trim() !== String(composeDefectLocation('', fc) || '').trim();
    }

    function wipeDefectDetailLocation(d, fc) {
        if (!d) return false;
        // 예전 실험 데이터(gridLocAuto)는 먼저 gridLoc으로 옮겨 행·열 위치를 잃지 않게 한다(행·열 지우기와 같은 규칙)
        if (d.gridLocAuto) migrateLegacyGridLocation(d, fc);
        const next = composeDefectLocation('', fc);
        if (String(d.location || '') === String(next || '')) return false;
        d.location = next;
        return true;
    }

    async function wipeDetailLocationForCurrentFloor() {
        const fc = state.currentFloor;
        const list = filterMapPlacedDefects(getCurrentFloorDefects());
        if (!list.length) {
            window.showToast?.('이 층에 마킹이 없습니다.', 'info', 2000);
            return;
        }
        const targets = list.filter((d) => defectHasDetailLocationText(d, fc));
        if (!targets.length) {
            window.showToast?.('지울 상세 위치가 없습니다.', 'info', 2000);
            return;
        }
        if (!await window.appConfirm(`이 층 마킹 ${list.length}개 중 상세 위치가 적힌 ${targets.length}개의 상세 위치를 모두 지웁니다.\n`
            + `행·열 위치 칸, 마킹 위치·번호·사진은 그대로 둡니다.\n(되돌리기로 한 번에 취소할 수 있습니다)`)) return;
        // 확인창을 기다리는 사이 동기화가 층 결함을 새 객체로 바꿔 끼울 수 있다 — 확인 뒤 목록을 다시 읽는다
        const targetsNow = filterMapPlacedDefects(getCurrentFloorDefects()).filter((d) => defectHasDetailLocationText(d, fc));
        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        let done = 0;
        targetsNow.forEach((d) => {
            if (wipeDefectDetailLocation(d, fc)) {
                touchDefectUpdatedAt(d);
                done += 1;
            }
        });
        afterGridBulkChange(`마킹 ${done}개의 상세 위치를 모두 지웠습니다.`);
    }

    async function wipeDetailLocationForAllFloors() {
        const bId = state.currentBuildingId;
        if (!bId) { window.showToast?.('먼저 건축물을 선택하세요.', 'info', 2000); return; }
        const plan0 = planClearDetailForAllFloors(bId, defectHasDetailLocationText);
        if (!plan0.targetCount) {
            window.showToast?.(`지울 상세 위치가 없습니다. (${plan0.floorCount}개 층 확인${plan0.skippedUnplaced ? ` · 도면에 안 놓인 결함 ${plan0.skippedUnplaced}개는 대상 아님` : ''})`, 'info', 3200);
            return;
        }
        const bldg = state.currentBuilding || (state.buildings || []).find((b) => b && b.id === bId);
        const dong = (bldg && typeof getBuildingDongLabel === 'function') ? String(getBuildingDongLabel(bldg) || '').trim() : '';
        const bName = `${(bldg && bldg.name) || '이 건물'}${dong ? ` ${dong}` : ''}`;
        const shown = plan0.floors.filter((f) => f.targets.length);
        const lines = shown.slice(0, 8).map((f) => `  · ${f.label}: ${f.targets.length}개`).join('\n') + (shown.length > 8 ? `\n  · 외 ${shown.length - 8}개 층` : '');
        if (!await window.appConfirm(`「${bName}」 건물의 모든 층(${plan0.floorCount}개 층 확인) 상세 위치를 모두 지웁니다.\n`
            + `바뀌는 결함 ${plan0.targetCount}개 · ${plan0.targetFloors}개 층\n${lines}\n\n`
            + `행·열 위치 칸, 마킹 위치·번호·사진은 그대로입니다.\n`
            + `${plan0.skippedUnplaced ? `도면에 아직 놓지 않은 결함 ${plan0.skippedUnplaced}개는 건드리지 않습니다.\n` : ''}`
            + `(이 층 화면에서 되돌리기 한 번으로 전체 층을 취소할 수 있습니다)`)) return;
        if (state.currentBuildingId !== bId) {
            window.showToast?.('건물이 바뀌어 지우지 않았습니다. 다시 시도하세요.', 'warning', 3000);
            return;
        }
        const plan = planClearDetailForAllFloors(bId, defectHasDetailLocationText);
        if (!plan.targetCount) {
            window.showToast?.('지울 상세 위치가 이미 없습니다.', 'info', 2500);
            return;
        }
        const curKey = `${bId}_${state.currentFloor}`;
        // 되돌리기 한 번에 모든 층이 돌아가도록 바뀌는 다른 층도 같은 기록에 담는다
        if (typeof pushDefectHistory === 'function') pushDefectHistory(plan.floors.filter((f) => f.targets.length && f.key !== curKey).map((f) => f.key));
        let done = 0;
        let floorsDone = 0;
        const dirtyKeys = [];
        plan.floors.forEach((f) => {
            let n = 0;
            f.targets.forEach((d) => {
                if (wipeDefectDetailLocation(d, f.fc)) {
                    touchDefectUpdatedAt(d); // 내용 시각(contentUpdatedAt·칸 시각) → 동기화에서 이김
                    n += 1;
                }
            });
            if (n) { done += n; floorsDone += 1; dirtyKeys.push(f.key); }
        });
        if (typeof markFloorKeyDirty === 'function') dirtyKeys.forEach((k) => markFloorKeyDirty(k));
        afterGridBulkChange(`전체 ${floorsDone}개 층 마킹 ${done}개의 상세 위치를 모두 지웠습니다.${plan.skippedUnplaced ? ` (도면에 안 놓인 ${plan.skippedUnplaced}개 제외)` : ''}`);
    }

    // ---- 구역(한 도면에 여러 층, 2026-09-28) ----
    // 사각형 구역마다 그룹(zoneId)을 따로 두어 번호가 구역마다 새로 시작한다. 계산은 grid-lines.js(restrictGridToZone).
    function gridHasContent(grid) {
        return gridHasLines(grid) || !!(grid && (grid.zones || []).length);
    }

    const GRID_ZONE_HANDLE_PX = 26; // 회전 손잡이 — 윗변에서 화면 픽셀만큼 위

    /** 구역 사각형·이름(설정 중에만). draft: 끌어 그리는 중인 새 사각형 */
    function drawGridZones(ctx, grid, draft) {
        const G = gridLib();
        const ge = gridEditState();
        const s = state.view.scale || 1;
        const rotRad = ((state.rotationAngle || 0) * Math.PI) / 180;
        const drawRect = (r, sel, name, zoneAngle, poly) => {
            const w = r.x2 - r.x1;
            const h = r.y2 - r.y1;
            const zoneRad = ((zoneAngle || 0) * Math.PI) / 180;
            ctx.save();
            if (zoneRad) {
                const cx = (r.x1 + r.x2) / 2;
                const cy = (r.y1 + r.y2) / 2;
                ctx.translate(cx, cy);
                ctx.rotate(zoneRad);
                ctx.translate(-cx, -cy);
            }
            ctx.setLineDash([8 / s, 5 / s]);
            ctx.lineWidth = (sel ? 2.4 : 1.6) / s;
            ctx.strokeStyle = sel ? '#7c3aed' : 'rgba(124, 58, 237, 0.75)';
            ctx.fillStyle = sel ? 'rgba(124, 58, 237, 0.07)' : 'rgba(124, 58, 237, 0.03)';
            if (poly) {
                ctx.beginPath();
                poly.forEach((q, i) => { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillRect(r.x1, r.y1, w, h);
                ctx.strokeRect(r.x1, r.y1, w, h);
            }
            ctx.setLineDash([]);
            if (sel) {
                const hs = 5 / s;
                (poly ? poly.map((q) => [q.x, q.y]) : [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]]).forEach(([x, y]) => {
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#7c3aed';
                    ctx.lineWidth = 1.4 / s;
                    ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2);
                    ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2);
                });
                if (name) { // 회전 손잡이(그리는 중인 새 사각형에는 없음)
                    const mx = (r.x1 + r.x2) / 2;
                    const hy = r.y1 - GRID_ZONE_HANDLE_PX / s;
                    ctx.strokeStyle = '#7c3aed';
                    ctx.lineWidth = 1.4 / s;
                    ctx.beginPath();
                    ctx.moveTo(mx, r.y1);
                    ctx.lineTo(mx, hy);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(mx, hy, 6 / s, 0, Math.PI * 2);
                    ctx.fillStyle = '#7c3aed';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.stroke();
                }
            }
            if (name) {
                ctx.save();
                // 다각형은 감싼 사각형 모서리가 구역 밖일 수 있어 첫 꼭짓점에 이름을 붙인다
                ctx.translate(poly ? poly[0].x : r.x1, poly ? poly[0].y : r.y1);
                ctx.rotate(-rotRad - zoneRad); // 구역을 돌려도 이름은 똑바로
                const fontPx = 12 / s;
                ctx.font = `700 ${fontPx}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                const tw = ctx.measureText(name).width;
                const pad = 4 / s;
                ctx.fillStyle = sel ? '#7c3aed' : 'rgba(124, 58, 237, 0.85)';
                ctx.fillRect(pad, pad, tw + pad * 2, fontPx + pad * 2);
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(name, pad * 2, pad * 2);
                ctx.restore();
            }
            ctx.restore();
        };
        ctx.save();
        ((grid && grid.zones) || []).forEach((z) => {
            if (z && z.rect) drawRect(z.rect, z.id === ge.zoneId, `${z.name}${z.floorLabel ? ` (${z.floorLabel})` : ''}`, z.angle || 0, z.poly || null);
        });
        if (draft && G) drawRect(G.rectFromPoints(draft.start, draft.cur), true, '');
        if (ge.polyDraft && ge.polyDraft.length) {
            const pts = ge.polyDraft;
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2 / s;
            ctx.setLineDash([8 / s, 5 / s]);
            ctx.beginPath();
            pts.forEach((q, i) => { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
            ctx.stroke();
            ctx.setLineDash([]);
            pts.forEach((q, i) => {
                ctx.beginPath();
                ctx.arc(q.x, q.y, (i === 0 ? 7 : 5) / s, 0, Math.PI * 2);
                ctx.fillStyle = i === 0 ? '#7c3aed' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth = 1.4 / s;
                ctx.stroke();
            });
        }
        ctx.restore();
    }

    /** 다각형 구역 찍기 — 첫 점을 다시 누르면 완성, 바로 앞 점과 같은 자리(더블클릭의 두 번째 누름)는 무시 */
    function gridPolyAddPoint(p, isTouch) {
        const ge = gridEditState();
        const tol = (isTouch ? 18 : 8) / (state.view.scale || 1);
        if (!ge.polyDraft) ge.polyDraft = [];
        const pts = ge.polyDraft;
        if (pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) <= tol * 1.5) {
            gridPolyFinish();
            return;
        }
        const last = pts[pts.length - 1];
        if (last && Math.hypot(p.x - last.x, p.y - last.y) <= tol) return;
        pts.push({ x: p.x, y: p.y });
        renderGridPanel();
        drawCanvas();
    }

    function gridPolyCancel() {
        const ge = gridEditState();
        ge.polyDraft = null;
        ge.tool = 'select';
        renderGridPanel();
        drawCanvas();
    }

    function gridPolyFinish() {
        const G = gridLib();
        const ge = gridEditState();
        const pts = ge.polyDraft || [];
        const s = state.view.scale || 1;
        if (pts.length < 3) {
            window.showToast?.('꼭짓점을 3개 이상 찍어 주세요.', 'info', 2000);
            return;
        }
        if (G.polyArea(pts) < (12 / s) * (12 / s)) {
            window.showToast?.('구역이 너무 작습니다. 꼭짓점을 넓게 찍어 주세요.', 'info', 2000);
            return;
        }
        const grid = getCurrentFloorGrid(true);
        if (!Array.isArray(grid.zones)) grid.zones = [];
        const z = G.createZone({ name: `구역 ${grid.zones.length + 1}`, poly: pts });
        if (!z) return;
        grid.zones.push(z);
        ge.polyDraft = null;
        ge.zoneId = z.id;
        ge.tool = 'col';
        ge.sel = null;
        gridChanged();
        window.showToast?.(`「${z.name}」을 만들었습니다. 이름(예: 1F)을 바꾸고 구역 안에 선을 그으세요.`, 'success', 3500);
    }

    /** 끌어 그린 사각형 → 새 구역(또는 「범위 다시 그리기」 중인 구역의 새 범위) */
    function finishGridZoneDraw(d) {
        const G = gridLib();
        const ge = gridEditState();
        const s = state.view.scale || 1;
        if (!G || !d.moved || !d.cur) {
            drawCanvas();
            return;
        }
        const rect = G.rectFromPoints(d.start, d.cur);
        if (rect.x2 - rect.x1 < 12 / s || rect.y2 - rect.y1 < 12 / s) {
            window.showToast?.('구역이 너무 작습니다. 사각형을 크게 끌어 그리세요.', 'info', 2000);
            drawCanvas();
            return;
        }
        const grid = getCurrentFloorGrid(true);
        if (!Array.isArray(grid.zones)) grid.zones = [];
        let z = ge.zoneRedrawId ? G.findZone(grid, ge.zoneRedrawId) : null;
        if (z) {
            z.rect = rect;
            delete z.angle; // 새로 끌어 그린 범위는 돌리지 않은 사각형
            delete z.poly;
            window.showToast?.(`구역 「${z.name}」 범위를 다시 그렸습니다.`, 'success', 2000);
        } else {
            z = G.createZone({ name: `구역 ${grid.zones.length + 1}`, rect });
            grid.zones.push(z);
            window.showToast?.(`「${z.name}」을 만들었습니다. 이름(예: 1F)을 바꾸고 구역 안에 선을 그으세요 — 번호는 이 구역에서 새로 시작합니다.`, 'success', 3500);
        }
        ge.zoneRedrawId = null;
        ge.zoneId = z.id;
        ge.tool = 'col';
        ge.sel = null;
        const zg = (grid.groups || []).find((g) => g.zoneId === z.id);
        if (zg) ge.editGroupId = zg.id;
        gridChanged();
    }

    /** 구역 삭제 — 안의 선은 같이 지우거나(확인) 구역 밖 선으로 옮김(취소) */
    async function deleteGridZone(grid, z) {
        const G = gridLib();
        const ge = gridEditState();
        const zg = (grid.groups || []).filter((g) => g.zoneId === z.id);
        const n = zg.reduce((sum, g) => sum + (g.lines || []).length, 0);
        if (!await window.appConfirm(`구역 「${z.name}」을(를) 지울까요?`)) return;
        let delLines = false;
        if (n) {
            delLines = await window.appConfirm(`구역 「${z.name}」 안의 행·열 선 ${n}개도 같이 지울까요?\n\n선도 삭제: 선까지 지움\n선은 남기기: 구역 밖 선(구역 없음)으로 옮김`, { title: '구역 안 선', okText: '선도 삭제', cancelText: '선은 남기기', danger: true });
        }
        if (delLines) grid.groups = grid.groups.filter((g) => g.zoneId !== z.id);
        else zg.forEach((g) => { delete g.zoneId; });
        grid.zones = (grid.zones || []).filter((x) => x.id !== z.id);
        if (!grid.zones.length) delete grid.zones; // 구역 없는 도면과 같은 모양
        ge.zoneId = null;
        ge.zoneRedrawId = null;
        if (ge.sel && !G.findLine(grid, ge.sel.lineId)) ge.sel = null;
        if (ge.editGroupId && !gridFindGroup(grid, ge.editGroupId)) ge.editGroupId = null;
        gridChanged();
        window.showToast?.(delLines ? `구역과 선 ${n}개를 지웠습니다.` : (n ? `구역을 지우고 선 ${n}개는 구역 밖 선으로 옮겼습니다.` : '구역을 지웠습니다.'), 'success', 2500);
    }

    // ---- 다른 층으로 복사 (2026-09-28) ----
    // 선 좌표는 이미지 좌표(도면 px, 마킹 x/y와 같은 기준)로 저장된다. 복사할 때 대상 층 도면 크기를 알면(그 층 grid.refW/refH)
    // 가로·세로 비율대로 맞추고, 모르면 좌표를 그대로 두고 pendingScale(원본 도면 크기)을 남겨 그 층을 열어 도면 크기를 알 때 한 번 맞춘다.
    // 저장은 선을 고칠 때와 같은 길: state.floorGridLines → saveStateToLocalStorage → scheduleSyncToFirebase(루트 문서 floorGridLines).
    // 층 문서를 따로 읽거나 현장 전체를 불러오지 않는다.
    // 대상 층 마킹의 행·열 위치(gridLoc)는 그 층을 열어 도면을 그릴 때 refreshStaleGridLocForCurrentFloor가 다시 계산한다
    // (선 지문이 바뀌므로 반드시 감지 · 자동 입력 꺼진 층·수정 중인 마킹 제외 · 실 이름(location)은 안 건드림).
    const gridPendingSince = {};

    /** 지금 층 도면의 좌표 기준 크기 — 도면이 뜨고 좌표 기준(floorPlanRef)이 이 층 것일 때만 */
    function getGridReliableDims() {
        const bId = state.currentBuildingId;
        const fc = state.currentFloor;
        if (!state.bgImage || !bId || !fc) return null;
        const ref = state.floorPlanRef;
        if (ref && ref.bldgId === bId && ref.floorCode === fc && ref.w > 0 && ref.h > 0) return { w: ref.w, h: ref.h };
        return null;
    }

    /**
     * 지금 층 선에 도면 크기 기록(refW/refH — 다음에 이 층으로 복사해 올 때 비율 계산용)과,
     * 복사해 온 선(pendingScale)을 이 층 도면 크기에 맞춤. 맞출 것이 남아 있으면 false
     */
    /**
     * 2026-10-20 같은 층 도면을 크기가 다른 도면으로 바꿨는지(이 기기가 전에 본 크기와 비교) — 바뀌었고 마킹이 있으면
     * 「새 도면 비율에 맞춰 옮길까요?」를 한 번 묻는다. 지우지 않는다(그대로 두기도 가능).
     */
    const _drawingSizeAsked = new Set();
    function checkFloorDrawingSizeChange() {
        const R = window.BSA && window.BSA.drawingResize;
        const dims = getGridReliableDims();
        if (!R || !dims) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        // 같은 도면인데 기기·해상도 차이로 크기가 달라 보이는 것은 묻지 않는다 — 도면을 다시 넣은 표시가 바뀌었을 때만
        const bl = state.currentBuilding;
        const sig = `${floorPdfUpdatedAtOf(bl, state.currentFloor)}|${(bl && bl.drawingFloorRevivedAt && bl.drawingFloorRevivedAt[state.currentFloor]) || 0}`;
        const change = R.noteDims(typeof localStorage !== 'undefined' ? localStorage : null, 'bsa_floor_drawing_dims_v1', key, dims.w, dims.h, sig);
        if (!change || _drawingSizeAsked.has(key)) return;
        _drawingSizeAsked.add(key);
        const list = (state.defects && state.defects[key]) || [];
        if (!list.length) return;
        const sx = change.to.w / change.from.w;
        const sy = change.to.h / change.from.h;
        setTimeout(async () => {
            const ok = typeof window.appConfirm === 'function'
                ? await window.appConfirm(`이 층 도면이 크기가 다른 도면으로 바뀌었습니다 (${change.from.w}×${change.from.h} → ${change.to.w}×${change.to.h}).\n\n기존 마킹 ${list.length}개를 새 도면 비율에 맞춰 옮길까요?\n(취소하면 마킹 위치를 그대로 둡니다 — 필요 없으면 목록에서 선택해 지울 수 있습니다)`)
                : false;
            if (!ok) return;
            if (`${state.currentBuildingId}_${state.currentFloor}` !== key) return;
            if (typeof pushDefectHistory === 'function') pushDefectHistory([key]);
            (state.defects[key] || []).forEach((d) => {
                if (R.scaleDefect(d, sx, sy) && typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(d);
            });
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            if (typeof window.showToast === 'function') window.showToast('마킹을 새 도면 비율에 맞췄습니다. (되돌리기로 취소 가능)', 'success', 4000);
        }, 300);
    }

    function resolvePendingGridScaleForCurrentFloor() {
        const G = gridLib();
        const grid = getCurrentFloorGrid(false);
        if (!G || !grid) return true;
        let dims = getGridReliableDims();
        if (!grid.pendingScale) {
            if (dims && gridHasLines(grid) && (grid.refW !== dims.w || grid.refH !== dims.h)) {
                grid.refW = dims.w;
                grid.refH = dims.h;
            }
            return true;
        }
        const key = getGridFloorKey();
        if (!dims && state.bgImage) {
            // PDF 좌표 기준을 못 잡는 층 — 잠깐 기다렸다가 마킹과 같은 화면 좌표계 크기로
            const since = gridPendingSince[key] || (gridPendingSince[key] = Date.now());
            if (Date.now() - since > 4000) {
                const d = getFloorPlanDisplayDims();
                if (d && d.w > 1 && d.h > 1) dims = { w: d.w, h: d.h };
            }
        }
        if (!dims) return false;
        delete gridPendingSince[key];
        if (G.resolvePendingScale(grid, dims.w, dims.h)) gridChanged();
        return true;
    }

    /** 복사 원본(지금 층) 선 좌표의 기준 도면 크기 */
    function getGridSourceDims(grid) {
        if (grid && grid.pendingScale) return { w: grid.pendingScale.w, h: grid.pendingScale.h };
        const d = getGridReliableDims();
        if (d) return d;
        if (grid && grid.refW > 0 && grid.refH > 0) return { w: grid.refW, h: grid.refH };
        return state.bgImage ? getFloorPlanDisplayDims() : null;
    }

    /** 같은 건물의 다른 층(점검 층 목록과 같은 getBuildingAvailableFloors — 외부 도면도 목록에 있으면 포함) + 선 개수 */
    function listGridCopyTargetFloors() {
        const G = gridLib();
        const bId = state.currentBuildingId;
        const bldg = state.currentBuilding || (state.buildings || []).find((b) => b && b.id === bId);
        if (!G || !bId || !bldg) return [];
        const floors = (typeof window.getBuildingAvailableFloors === 'function')
            ? (window.getBuildingAvailableFloors(bldg) || [])
            : (bldg.floorsList || []);
        const seen = new Set();
        const out = [];
        floors.forEach((f) => {
            const code = f && f.floorCode ? String(f.floorCode) : '';
            if (!code || code === state.currentFloor || seen.has(code)) return;
            seen.add(code);
            const raw = state.floorGridLines && state.floorGridLines[getFloorMapStyleKey(bId, code)];
            out.push({ floorCode: code, floorLabel: String((f && f.floorLabel) || code), lineCount: raw ? G.countGridLines(raw) : 0 });
        });
        return out;
    }

    /** 지금 층 행·열 설정을 고른 층에 통째로 복사(덮어쓰기). → { n: 복사한 층 수, pending: 도면 크기를 나중에 맞출 층 수 } */
    function copyCurrentGridToFloors(codes) {
        const G = gridLib();
        const bId = state.currentBuildingId;
        const src = getCurrentFloorGrid(false);
        const res = { n: 0, pending: 0 };
        if (!G || !bId || !gridHasContent(src)) return res;
        const sd = getGridSourceDims(src);
        if (!state.floorGridLines || typeof state.floorGridLines !== 'object') state.floorGridLines = {};
        const done = new Set();
        (codes || []).forEach((fc) => {
            const code = String(fc || '');
            if (!code || code === state.currentFloor || done.has(code)) return;
            done.add(code);
            const key = getFloorMapStyleKey(bId, code);
            const prev = state.floorGridLines[key] ? G.normalizeGrid(state.floorGridLines[key]) : null;
            const dd = (prev && !prev.pendingScale && prev.refW > 0 && prev.refH > 0) ? { w: prev.refW, h: prev.refH } : null;
            const next = G.cloneGridForFloor(src, {
                srcW: sd ? sd.w : 0,
                srcH: sd ? sd.h : 0,
                dstW: dd ? dd.w : 0,
                dstH: dd ? dd.h : 0
            });
            state.floorGridLines[key] = next; // 덮어쓰기 — 그 층의 예전 선·그룹은 모두 바뀜
            res.n += 1;
            if (next.pendingScale) res.pending += 1;
        });
        if (res.n) saveStateToLocalStorage();
        return res;
    }

    function ensureGridCopyModal() {
        let wrap = document.getElementById('gridCopyModal');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.id = 'gridCopyModal';
        wrap.className = 'modal-overlay grid-copy-modal';
        wrap.innerHTML = `
            <div class="modal-card modal-sm grid-copy-card" role="dialog" aria-modal="true" aria-labelledby="gridCopyTitle">
                <div class="modal-header">
                    <h3 id="gridCopyTitle">행·열 선 다른 층으로 복사</h3>
                    <button type="button" class="modal-close" data-gc-close title="닫기">&times;</button>
                </div>
                <div class="modal-body" id="gridCopyBody"></div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" data-gc-close>취소</button>
                    <button type="button" class="btn btn-primary" id="gridCopyConfirm" disabled>복사</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const close = () => wrap.classList.remove('open');
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap || (e.target.closest && e.target.closest('[data-gc-close]'))) close();
        });
        wrap.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        });
        wrap.addEventListener('change', (e) => {
            const t = e.target;
            if (!t || t.type !== 'checkbox') return;
            if (t.hasAttribute('data-gc-all')) {
                wrap.querySelectorAll('input[data-gc-floor]').forEach((b) => { b.checked = t.checked; });
            }
            syncGridCopyModalState(wrap);
        });
        wrap.querySelector('#gridCopyConfirm').addEventListener('click', () => confirmGridCopyModal(wrap));
        return wrap;
    }

    function syncGridCopyModalState(wrap) {
        const boxes = Array.from(wrap.querySelectorAll('input[data-gc-floor]'));
        const sel = boxes.filter((b) => b.checked);
        const all = wrap.querySelector('input[data-gc-all]');
        if (all) {
            all.checked = boxes.length > 0 && sel.length === boxes.length;
            all.indeterminate = sel.length > 0 && sel.length < boxes.length;
        }
        const btn = wrap.querySelector('#gridCopyConfirm');
        if (btn) {
            btn.disabled = !sel.length;
            btn.textContent = sel.length ? `${sel.length}개 층에 복사` : '복사';
        }
    }

    /** 「다른 층으로 복사」 창 — 같은 건물 다른 층 목록(체크·전체 선택, 층마다 선 개수) */
    function openGridCopyModal() {
        const G = gridLib();
        const src = getCurrentFloorGrid(false);
        if (!G || !gridHasContent(src)) {
            window.showToast?.('먼저 이 층에 행·열 선을 그어 주세요.', 'info', 2000);
            return;
        }
        const floors = listGridCopyTargetFloors();
        if (!floors.length) {
            window.showToast?.('이 건물에 복사할 다른 층이 없습니다.', 'info', 2200);
            return;
        }
        const wrap = ensureGridCopyModal();
        const body = wrap.querySelector('#gridCopyBody');
        const bldg = state.currentBuilding;
        const all = (bldg && typeof window.getBuildingAvailableFloors === 'function') ? (window.getBuildingAvailableFloors(bldg) || []) : [];
        const cur = all.find((f) => f && f.floorCode === state.currentFloor);
        const curLabel = (cur && cur.floorLabel) || state.currentFloor;
        body.innerHTML = `
            <p class="grid-copy-lead">지금 층 <b>${gridEsc(curLabel)}</b>의 행·열 선 ${G.countGridLines(src)}개(그룹 ${(src.groups || []).length}개${(src.zones || []).length ? ` · 구역 ${src.zones.length}개` : ''})를 고른 층에 복사합니다. 머리글·시작 번호·선 이름·폭·번호 순서·자동 입력 설정도 같이 복사하며, 이미 선이 있는 층은 통째로 덮어씁니다.</p>
            <label class="grid-copy-all"><input type="checkbox" data-gc-all> 전체 선택 <small>(${floors.length}개 층)</small></label>
            <div class="grid-copy-list">${floors.map((f) => `
                <label class="grid-copy-row">
                    <input type="checkbox" data-gc-floor value="${gridEsc(f.floorCode)}">
                    <span class="grid-copy-name">${gridEsc(f.floorLabel)}</span>
                    <span class="grid-copy-badge${f.lineCount ? ' has' : ''}">${f.lineCount ? `선 ${f.lineCount}개 있음` : '선 없음'}</span>
                </label>`).join('')}
            </div>
            <p class="grid-copy-note">도면 크기가 다른 층은 선 위치를 도면 가로·세로 비율대로 맞춥니다(그 층 도면 크기를 아직 모르면 그 층을 열 때 맞춤). 대상 층 마킹의 행·열 위치는 그 층을 열 때 새 선 기준으로 다시 채워집니다(자동 입력이 켜진 경우 · 실 이름은 그대로).</p>`;
        syncGridCopyModalState(wrap);
        wrap.classList.add('open');
    }

    async function confirmGridCopyModal(wrap) {
        const floors = listGridCopyTargetFloors();
        const byCode = new Map(floors.map((f) => [f.floorCode, f]));
        const codes = Array.from(wrap.querySelectorAll('input[data-gc-floor]'))
            .filter((b) => b.checked)
            .map((b) => b.value)
            .filter((c) => byCode.has(c));
        if (!codes.length) return;
        const withLines = codes.map((c) => byCode.get(c)).filter((f) => f.lineCount > 0);
        if (withLines.length) {
            const names = withLines.slice(0, 6).map((f) => `${f.floorLabel}(선 ${f.lineCount}개)`).join(', ')
                + (withLines.length > 6 ? ` 외 ${withLines.length - 6}개 층` : '');
            if (!await window.appConfirm(`고른 층 중 ${withLines.length}개 층에 이미 행·열 선이 있습니다.\n${names}\n\n덮어쓰면 그 층의 선·그룹·이름·폭이 모두 지금 층 것으로 바뀝니다. 덮어쓸까요?`)) return;
        }
        const res = copyCurrentGridToFloors(codes);
        wrap.classList.remove('open');
        if (!res.n) {
            window.showToast?.('행·열 선을 복사하지 못했습니다.', 'error', 2500);
            return;
        }
        renderGridPanel();
        window.showToast?.(`${res.n}개 층에 행·열 복사 완료 (마킹 위치는 그 층을 열 때 다시 계산)`, 'success', 3500);
    }
    // @@GRID_LINES_END

    // 도면 탭 단축키: D=핀 마킹, A=영역 마킹, Esc=수정창 닫기+선택모드
    // 비파괴 탭: D=NDT 마킹, Esc=등록창 닫기+이동모드
    window.addEventListener('keydown', async (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
        const typing = (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable);
        const k = e.key ? e.key.toLowerCase() : '';

        if (window.state.currentTab === 'tab-ndt') {
            if (k === 'escape') {
                if (window.BsaTypingPopup && typeof window.BsaTypingPopup.isOpen === 'function' && window.BsaTypingPopup.isOpen()) return;
                if (window.BsaFinishMemberChooser && typeof window.BsaFinishMemberChooser.isOpen === 'function' && window.BsaFinishMemberChooser.isOpen()) return;
                e.preventDefault();
                if (isNdtModalOpen()) closeNdtModal();
                if (typeof isNdtCrackMonitorModalOpen === 'function' && isNdtCrackMonitorModalOpen()) {
                    closeNdtCrackMonitorModal();
                }
                const dispModal = document.getElementById('ndtDisplacementModal');
                if (dispModal && dispModal.classList.contains('open')) closeNdtDisplacementModal();
                const dispEditModal = document.getElementById('ndtDisplacementGroupEditModal');
                if (dispEditModal && dispEditModal.classList.contains('open')) closeNdtDisplacementGroupEditModal();
                if (window._activeNdtDispGroupId) {
                    setActiveNdtDispGroup(null);
                    if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
                    window.showToast('측정 구역 연결을 해제했습니다. 다음 마킹은 새 구역으로 시작합니다.', 'info', 2800);
                }
                if (selectedNdtIds.size > 0) {
                    selectedNdtIds.clear();
                    updateNdtSelectionBar();
                    if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
                }
                if (typeof window.setNdtMode === 'function') window.setNdtMode('PAN');
                return;
            }
            // Delete/Backspace: 수정창이 열려 있어도 현재 항목 삭제 (입력 중일 때만 무시)
            if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
                e.preventDefault();
                if (isNdtModalOpen()) {
                    const pinId = document.getElementById('ndtPinId')?.value;
                    if (pinId) {
                        window.clearTimeout(window._ndtAutoApplyTimer);
                        window._ndtAutoApplyTimer = null;
                        if (await window.deleteNdtItem(pinId)) {
                            selectedNdtIds.delete(pinId);
                            updateNdtSelectionBar();
                            closeNdtModal();
                        }
                    } else {
                        closeNdtModal();
                    }
                    return;
                }
                if (selectedNdtIds.size > 0) deleteSelectedNdtMarks();
                return;
            }
            if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
            if (k === 'd') {
                e.preventDefault();
                if (typeof window.setNdtMode === 'function') window.setNdtMode('MARK');
            }
            return;
        }
        if ((window.state.currentTab !== 'tab-map')) return;
        // 다각형·선을 찍는 중 Backspace: 마지막 점만 되돌린다(마킹 삭제 아님)
        if (e.key === 'Backspace' && !typing && pendingAreaPoly && pendingAreaPoly.length) {
            e.preventDefault();
            undoTouchPolygonPoint();
            return;
        }
        // Delete/Backspace: 핀 클릭→수정창이 열린 상태에서도 삭제 (기존엔 모달 열리면 무시됨)
        if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
            e.preventDefault();
            if (typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode() && selectedDefectIds.size > 0) {
                deleteSelectedDefects();
                return;
            }
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen()) {
                const pinId = document.getElementById('defectPinId')?.value;
                if (pinId) {
                    if (await window.deleteDefectById(pinId)) {
                        selectedDefectIds.delete(pinId);
                        updateMapSelectionBar();
                        closeDefectModal({ discardPending: true });
                    }
                } else {
                    closeDefectModal({ discardPending: true });
                }
                return;
            }
            if (selectedDefectIds.size > 0) deleteSelectedDefects();
            return;
        }
        if (k === 'escape') {
            if (window.BsaTypingPopup && typeof window.BsaTypingPopup.isOpen === 'function' && window.BsaTypingPopup.isOpen()) return;
            if (window.BsaFinishMemberChooser && typeof window.BsaFinishMemberChooser.isOpen === 'function' && window.BsaFinishMemberChooser.isOpen()) return;
            e.preventDefault();
            // 선 그리는 중: Esc = 그리기 취소(점 버림). 다각형은 아래처럼 지금까지 찍은 모양으로 저장
            if (pendingAreaPoly && pendingAreaPoly.length && getPendingPolyShape() === 'polyline') {
                cancelPendingPolyline();
                return;
            }
            // 다각형 그리는 중: 마지막 점 취소가 아니라, 지금까지 찍은 모양으로 저장
            if (pendingAreaPoly && pendingAreaPoly.length) {
                if (pendingAreaPoly.length >= 3) {
                    finishPendingAreaPolygon();
                } else if (isAreaPolygonRedrawActive()) {
                    cancelAreaPolygonRedraw();
                } else {
                    window.showToast?.('다각형은 점 3개 이상일 때 저장됩니다. 점을 더 찍어 주세요.', 'info', 2800);
                }
                return;
            }
            if (pendingInkPoly && pendingInkPoly.points && pendingInkPoly.points.length) {
                if (pendingInkPoly.points.length >= 3) {
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
                        return;
                    }
                }
                window.showToast?.('내부 다각형은 점 3개 이상일 때 저장됩니다.', 'info', 2500);
                return;
            }
            if (state.areaInkTool) {
                setAreaInkTool(null);
                return;
            }
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen()) {
                closeDefectModal();
            }
            setDrawMode('PAN');
            return;
        }
        if (typing) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (k === 'enter') {
            if (canFinishPendingPoly()) {
                e.preventDefault();
                finishPendingAreaPolygon();
                return;
            }
            if (pendingInkPoly && pendingInkPoly.points && pendingInkPoly.points.length >= 3) {
                e.preventDefault();
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
                return;
            }
        }
        if (k === 'd') {
            e.preventDefault();
            setDrawMode('MARK');
        } else if (k === 'a') {
            e.preventDefault();
            setDrawMode('AREA');
        }
    });

    // 모바일: 우측 레일(마킹) + 하단 액션 바
    function applyMobileMapZoomStep(direction) {
        const id = direction === 'out' ? 'btnZoomOut' : 'btnZoomIn';
        document.getElementById(id)?.click();
    }

    function closeMobileMapSheets() {
        document.getElementById('mapStyleSizeToolbar')?.classList.remove('is-mobile-sheet-open');
        const sizeToggle = document.getElementById('mobileBtnToggleSize');
        if (sizeToggle) {
            sizeToggle.classList.remove('active');
            sizeToggle.setAttribute('aria-expanded', 'false');
        }
    }

    function closeMobileNdtSheets() {
        document.getElementById('ndtStyleSizeToolbar')?.classList.remove('is-mobile-sheet-open');
        const sizeToggle = document.getElementById('mobileNdtBtnToggleSize');
        if (sizeToggle) {
            sizeToggle.classList.remove('active');
            sizeToggle.setAttribute('aria-expanded', 'false');
        }
    }

    window.closeAllMobileCanvasSheets = function () {
        closeMobileMapSheets();
        closeMobileNdtSheets();
    };

    function syncMobileToggleBtn(btn, on) {
        if (!btn) return;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }

    const btnToggleMapStyleSize = document.getElementById('btnToggleMapStyleSize');
    if (btnToggleMapStyleSize && !btnToggleMapStyleSize.dataset.pcToggleBound) {
        btnToggleMapStyleSize.dataset.pcToggleBound = '1';
        btnToggleMapStyleSize.addEventListener('click', () => {
            window.state.styleSizePanelOpenMap = !window.state.styleSizePanelOpenMap;
            if (typeof window.applyStyleSizePanelUi === 'function') window.applyStyleSizePanelUi();
            if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
            refreshCanvasAfterStylePanelToggle();
        });
    }

    const bindDefectListToggle = (btn) => {
        if (!btn || btn.dataset.defectListToggleBound) return;
        btn.dataset.defectListToggleBound = '1';
        btn.addEventListener('click', () => {
            if (typeof window.toggleMapDefectList === 'function') window.toggleMapDefectList();
        });
    };
    bindDefectListToggle(document.getElementById('btnToggleDefectList'));
    bindDefectListToggle(document.getElementById('mobileBtnToggleDefectList'));
    try {
        const savedList = localStorage.getItem('bsa_map_defect_list_open');
        if (savedList === '0') window.state.mapDefectListOpen = false;
        else if (savedList === '1') window.state.mapDefectListOpen = true;
    } catch (_e) { /* ignore */ }
    if (typeof applyMapDefectListChrome === 'function') applyMapDefectListChrome();

    const btnToggleNdtStyleSize = document.getElementById('btnToggleNdtStyleSize');
    if (btnToggleNdtStyleSize && !btnToggleNdtStyleSize.dataset.pcToggleBound) {
        btnToggleNdtStyleSize.dataset.pcToggleBound = '1';
        btnToggleNdtStyleSize.addEventListener('click', () => {
            window.state.styleSizePanelOpenNdt = !window.state.styleSizePanelOpenNdt;
            if (typeof window.applyStyleSizePanelUi === 'function') window.applyStyleSizePanelUi();
            if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
            refreshCanvasAfterStylePanelToggle();
        });
    }

    const mobileBtnToggleSize = document.getElementById('mobileBtnToggleSize');
    if (mobileBtnToggleSize) {
        mobileBtnToggleSize.addEventListener('click', () => {
            const bar = document.getElementById('mapStyleSizeToolbar');
            const willOpen = !bar || !bar.classList.contains('is-mobile-sheet-open');
            if (bar) bar.classList.toggle('is-mobile-sheet-open', willOpen);
            mobileBtnToggleSize.classList.toggle('active', willOpen);
            mobileBtnToggleSize.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
        });
    }

    function bindMobileRailMoreToggle(toggleId, railId, storageKey) {
        const btn = document.getElementById(toggleId);
        const rail = document.getElementById(railId);
        if (!btn || !rail || btn.dataset.railMoreBound) return;
        btn.dataset.railMoreBound = '1';
        const secondary = rail.querySelector('.mobile-rail-secondary') || document.getElementById(btn.getAttribute('aria-controls'));
        if (!secondary) return;
        const apply = (open) => {
            rail.classList.toggle('is-rail-expanded', open);
            secondary.hidden = !open;
            btn.classList.toggle('active', open);
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            const label = btn.querySelector('span');
            if (label) label.textContent = open ? '접기' : '더보기';
            try { localStorage.setItem(storageKey, open ? '1' : '0'); } catch (_e) { /* ignore */ }
        };
        let startOpen = false;
        try { startOpen = localStorage.getItem(storageKey) === '1'; } catch (_e) { startOpen = false; }
        apply(startOpen);
        btn.addEventListener('click', () => apply(!rail.classList.contains('is-rail-expanded')));
    }
    bindMobileRailMoreToggle('mobileBtnRailMore', 'mobileMapSideRail', 'bsa_map_rail_expanded');
    bindMobileRailMoreToggle('mobileNdtBtnRailMore', 'mobileNdtSideRail', 'bsa_ndt_rail_expanded');

    const mobileBtnQuickDrag = document.getElementById('mobileBtnQuickDrag');
    if (mobileBtnQuickDrag) {
        mobileBtnQuickDrag.addEventListener('click', () => {
            mobileMarqueeSelectEnabled = !mobileMarqueeSelectEnabled;
            syncMobileToggleBtn(mobileBtnQuickDrag, mobileMarqueeSelectEnabled);
            window.showToast(
                mobileMarqueeSelectEnabled
                    ? '범위 선택 켜짐: 빈 곳을 끌어 네모 안 결함 선택 (핀 이동은 0.3초 길게 누름)'
                    : '범위 선택 꺼짐 — 빈 곳 끌기는 도면 이동',
                'info',
                2600
            );
        });
    }
    const mobileBtnAddSelect = document.getElementById('mobileBtnAddSelect');
    if (mobileBtnAddSelect) {
        mobileBtnAddSelect.addEventListener('click', () => {
            mobileAddSelectEnabled = !mobileAddSelectEnabled;
            syncMobileToggleBtn(mobileBtnAddSelect, mobileAddSelectEnabled);
            window.showToast(
                mobileAddSelectEnabled ? '추가 선택 ON — 터치마다 선택 토글' : '추가 선택 OFF',
                'info',
                2200
            );
        });
    }

    const mobileBtnModePan = document.getElementById('mobileBtnModePan');
    const mobileBtnModeMark = document.getElementById('mobileBtnModeMark');
    const mobileBtnModeArea = document.getElementById('mobileBtnModeArea');
    if (mobileBtnModePan) mobileBtnModePan.addEventListener('click', () => setDrawMode('PAN'));
    if (mobileBtnModeMark) mobileBtnModeMark.addEventListener('click', () => setDrawMode('MARK'));
    if (mobileBtnModeArea) {
        // 폰·태블릿: 모양 고르기(다각형·타원·사각형). 마지막 고른 모양을 기억한다.
        const pref = readAreaShapePref();
        if (pref && isTouchToolbarUi()) state.areaCreateShape = pref;
        syncMobileAreaRailIcon();
        mobileBtnModeArea.addEventListener('click', () => openAreaShapePicker(mobileBtnModeArea));
    }
    const btnAreaPolyTouchDone = document.getElementById('btnAreaPolyTouchDone');
    if (btnAreaPolyTouchDone) btnAreaPolyTouchDone.addEventListener('click', () => {
        if (!canFinishPendingPoly()) {
            const need = areaPolyMinPoints(getPendingPolyShape());
            window.showToast?.(`${getPendingPolyShape() === 'polyline' ? '선' : '다각형'}은 점 ${need}개 이상일 때 저장됩니다. 점을 더 찍어 주세요.`, 'info', 2500);
            return;
        }
        finishPendingAreaPolygon();
    });
    const btnAreaPolyTouchUndo = document.getElementById('btnAreaPolyTouchUndo');
    if (btnAreaPolyTouchUndo) btnAreaPolyTouchUndo.addEventListener('click', undoTouchPolygonPoint);
    const btnAreaPolyTouchCancel = document.getElementById('btnAreaPolyTouchCancel');
    if (btnAreaPolyTouchCancel) btnAreaPolyTouchCancel.addEventListener('click', () => {
        pendingAreaPoly = null;
        setDrawMode('PAN');
        drawCanvas();
    });
    const mobileBtnZoomFit = document.getElementById('mobileBtnZoomFit');
    if (mobileBtnZoomFit) {
        mobileBtnZoomFit.addEventListener('click', () => {
            document.getElementById('btnZoomFit')?.click();
        });
    }
    const mobileBtnMapZoomIn = document.getElementById('mobileBtnMapZoomIn');
    if (mobileBtnMapZoomIn) {
        mobileBtnMapZoomIn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyMobileMapZoomStep('in');
        });
    }
    const mobileBtnMapZoomOut = document.getElementById('mobileBtnMapZoomOut');
    if (mobileBtnMapZoomOut) {
        mobileBtnMapZoomOut.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyMobileMapZoomStep('out');
        });
    }
    const mobileBtnUndo = document.getElementById('mobileBtnUndo');
    if (mobileBtnUndo) {
        mobileBtnUndo.addEventListener('click', () => undoDefectChange());
    }
    const mobileBtnRedo = document.getElementById('mobileBtnRedo');
    if (mobileBtnRedo) {
        mobileBtnRedo.addEventListener('click', () => redoDefectChange());
    }
    const mobileBtnDeleteSelected = document.getElementById('mobileBtnDeleteSelected');
    if (mobileBtnDeleteSelected) {
        mobileBtnDeleteSelected.addEventListener('click', () => {
            deleteSelectedDefects();
        });
    }

    const mobileNdtBtnToggleSize = document.getElementById('mobileNdtBtnToggleSize');
    if (mobileNdtBtnToggleSize) {
        mobileNdtBtnToggleSize.addEventListener('click', () => {
            const isDesktop = document.documentElement.classList.contains('layout-desktop');
            if (isDesktop) {
                document.getElementById('btnToggleNdtStyleSize')?.click();
                const pcToggle = document.getElementById('btnToggleNdtStyleSize');
                const isOn = pcToggle && pcToggle.classList.contains('is-on');
                mobileNdtBtnToggleSize.classList.toggle('active', !!isOn);
                mobileNdtBtnToggleSize.setAttribute('aria-expanded', isOn ? 'true' : 'false');
                return;
            }
            const bar = document.getElementById('ndtStyleSizeToolbar');
            const willOpen = !bar || !bar.classList.contains('is-mobile-sheet-open');
            if (bar) bar.classList.toggle('is-mobile-sheet-open', willOpen);
            mobileNdtBtnToggleSize.classList.toggle('active', willOpen);
            mobileNdtBtnToggleSize.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            if (typeof window.applyStyleSizeBarLockUi === 'function') window.applyStyleSizeBarLockUi();
        });
    }
    const mobileNdtBtnQuickDrag = document.getElementById('mobileNdtBtnQuickDrag');
    if (mobileNdtBtnQuickDrag) {
        mobileNdtBtnQuickDrag.addEventListener('click', () => {
            ndtMarqueeSelectEnabled = !ndtMarqueeSelectEnabled;
            syncMobileToggleBtn(mobileNdtBtnQuickDrag, ndtMarqueeSelectEnabled);
            window.showToast(
                ndtMarqueeSelectEnabled
                    ? '범위 선택 켜짐: 빈 곳을 끌어 네모 안 항목 선택 (핀 이동은 0.3초 길게 누름)'
                    : '범위 선택 꺼짐 — 빈 곳 끌기는 도면 이동',
                'info',
                2600
            );
        });
    }
    const mobileNdtBtnAddSelect = document.getElementById('mobileNdtBtnAddSelect');
    if (mobileNdtBtnAddSelect) {
        mobileNdtBtnAddSelect.addEventListener('click', () => {
            ndtAddSelectEnabled = !ndtAddSelectEnabled;
            syncMobileToggleBtn(mobileNdtBtnAddSelect, ndtAddSelectEnabled);
            window.showToast(
                ndtAddSelectEnabled ? '추가 선택 ON — 터치마다 선택 토글' : '추가 선택 OFF',
                'info',
                2200
            );
        });
    }
    const mobileNdtBtnModeMark = document.getElementById('mobileNdtBtnModeMark');
    if (mobileNdtBtnModeMark) {
        mobileNdtBtnModeMark.addEventListener('click', () => {
            if (typeof window.setNdtMode !== 'function') return;
            const markActive = mobileNdtBtnModeMark.classList.contains('active');
            window.setNdtMode(markActive ? 'PAN' : 'MARK');
        });
    }
    const mobileNdtBtnZoomFit = document.getElementById('mobileNdtBtnZoomFit');
    if (mobileNdtBtnZoomFit) {
        mobileNdtBtnZoomFit.addEventListener('click', () => {
            if (typeof window.fitNdtCanvas === 'function') window.fitNdtCanvas();
        });
    }
    const mobileNdtBtnDeleteSelected = document.getElementById('mobileNdtBtnDeleteSelected');
    if (mobileNdtBtnDeleteSelected) {
        mobileNdtBtnDeleteSelected.addEventListener('click', () => {
            document.getElementById('btnDeleteSelectedNdt')?.click();
        });
    }

    const ndtRailProxy = (fromId, toId) => {
        const from = document.getElementById(fromId);
        const to = document.getElementById(toId);
        if (from && to) from.addEventListener('click', () => to.click());
    };
    ndtRailProxy('ndtRailBtnZoomIn', 'btnNdtZoomIn');
    ndtRailProxy('ndtRailBtnZoomOut', 'btnNdtZoomOut');
    ndtRailProxy('ndtRailBtnStyle', 'btnOpenStyleColorModalNdt');
    ndtRailProxy('ndtRailBtnRotateDraw', 'btnRotateNdtDrawing');
    const ndtRailPdf = document.getElementById('ndtRailBtnVectorPdf');
    if (ndtRailPdf) {
        ndtRailPdf.addEventListener('click', () => {
            if (typeof window.exportCurrentFloorNdtVectorPdf === 'function') {
                window.exportCurrentFloorNdtVectorPdf();
            }
        });
    }

    // 결함 모달 모바일 액션 → 데스크톱 버튼과 동일 동작
    const proxyClick = (fromId, toId) => {
        const from = document.getElementById(fromId);
        const to = document.getElementById(toId);
        if (from && to) from.addEventListener('click', () => to.click());
    };
    // 되돌리기 / 다시실행 / 전체초기화 (하단 아이콘 툴바)
    const btnUndoEl = document.getElementById('btnUndo');
    if (btnUndoEl) btnUndoEl.addEventListener('click', () => undoDefectChange());

    const btnRedoEl = document.getElementById('btnRedo');
    if (btnRedoEl) btnRedoEl.addEventListener('click', () => redoDefectChange());

    const btnClearPinsEl = document.getElementById('btnClearPins');
    if (btnClearPinsEl) {
        btnClearPinsEl.addEventListener('click', async () => {
            if (!state.currentBuildingId) return;
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            const defects = state.defects[key] || [];
            if (defects.length === 0) {
                window.showToast('현재 층에 등록된 결함이 없습니다.', 'info');
                return;
            }
        if (!await window.confirmDelete(`현재 층의 결함 ${defects.length}건을 모두 삭제할까요? (되돌리기로 복원 가능)`)) return;

            closeDefectModal({ discardPending: true });
            pushDefectHistory();
            defects.forEach(d => {
                // deleteSelectedDefects/removeSingleDefectRecord와 동일하게 tombstone을 남겨야
                // 몇 초 뒤 동기화 merge 때 서버에 남아있던(아직 삭제 전파 안 된) 결함이 되살아나지
                // 않는다. 이게 빠져서 "전체 초기화"만 삭제 후 잠시 뒤 다시 나타나는 버그가 있었다.
                trackDefectDeletion(key, d.id, d);
                deleteAllPhotosForDefect(d, { deferCloudFloorKey: key });
            });
            state.defects[key] = [];
            selectedDefectIds.clear();
            updateMapSelectionBar();
            saveStateToLocalStorage();
            renderSurveyTable();
            drawCanvas();
            window.showToast('현재 층 결함을 모두 초기화했습니다.', 'success');
        });
    }

    const btnDeleteSelectedEl = document.getElementById('btnDeleteSelectedDefects');
    if (btnDeleteSelectedEl) {
        btnDeleteSelectedEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteSelectedDefects();
        });
    }
    const btnBulkEditSelectedEl = document.getElementById('btnBulkEditSelectedDefects');
    if (btnBulkEditSelectedEl) {
        btnBulkEditSelectedEl.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openBulkDefectEditModal();
        });
    }
    const mobileBtnBulkEditSelected = document.getElementById('mobileBtnBulkEditSelected');
    if (mobileBtnBulkEditSelected) {
        mobileBtnBulkEditSelected.addEventListener('click', () => {
            openBulkDefectEditModal();
        });
    }
    [
        ['btnMergeSelectedDefects', () => mergeSelectedDefects()],
        ['mobileBtnMergeSelected', () => mergeSelectedDefects()],
        ['btnUnmergeSelectedDefects', () => unmergeSelectedDefects()],
        ['mobileBtnUnmergeSelected', () => unmergeSelectedDefects()]
    ].forEach(([id, fn]) => {
        const b = document.getElementById(id);
        if (!b) return;
        b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (b.disabled || b.hidden) return;
            fn();
        });
    });

    // Ctrl+Z / Ctrl+Y 키보드 단축키 (입력 필드에 포커스가 있을 때는 무시)
    // Delete/Backspace 삭제는 위 도면·비파괴 단축키 핸들러에서 처리 (수정창 열린 상태 포함)
    window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
        if (!document.getElementById('tab-map')?.classList.contains('active')) return;
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            undoDefectChange();
        } else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
            e.preventDefault();
            redoDefectChange();
        }
    });

    // 2026-10-14 마우스 옆 단추: 뒤(3) = 되돌리기(Ctrl+Z), 앞(4) = 다시 실행(Ctrl+Y).
    // 지금 화면의 Ctrl+Z/Ctrl+Y 처리(가이드·결함 등)를 그대로 타도록 키 입력을 흉내 낸다.
    // 브라우저·앱의 뒤로/앞으로 가기는 막는다. 입력칸에 글을 쓰는 중이면 아무것도 안 한다.
    (function bindMouseSideButtonsUndoRedo() {
        if (typeof window === 'undefined' || window._bsaMouseSideBound) return;
        window._bsaMouseSideBound = true;
        const isSide = (e) => e && (e.button === 3 || e.button === 4);
        const block = (e) => { if (isSide(e)) { e.preventDefault(); e.stopPropagation(); } };
        window.addEventListener('mousedown', block, true);
        window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') block(e); }, true);
        window.addEventListener('auxclick', block, true);
        let lastAt = 0;
        window.addEventListener('mouseup', (e) => {
            if (!isSide(e)) return;
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now - lastAt < 120) return;   // pointerup·mouseup 겹침 방지
            lastAt = now;
            const ae = document.activeElement;
            const tag = (ae && ae.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (ae && ae.isContentEditable)) return;
            const redo = e.button === 4;
            const ev = new KeyboardEvent('keydown', {
                key: redo ? 'y' : 'z', code: redo ? 'KeyY' : 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true
            });
            (document.body || document.documentElement).dispatchEvent(ev);
        }, true);
    })();

    // Zoom Buttons
    const btnZoomIn = document.getElementById('btnZoomIn');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => {
        const cx = (state.canvasCssW || state.canvas?.width || 0) / 2;
        const cy = (state.canvasCssH || state.canvas?.height || 0) / 2;
        applyFocalZoom(state.view, cx, cy, 1.2, undefined, undefined, getMapFitScale);
        if (elements.zoomScaleText) elements.zoomScaleText.textContent = formatMapZoomLabel();
        drawCanvas();
        scheduleFloorDrawingTierSync();
    });

    const btnZoomOut = document.getElementById('btnZoomOut');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => {
        const cx = (state.canvasCssW || state.canvas?.width || 0) / 2;
        const cy = (state.canvasCssH || state.canvas?.height || 0) / 2;
        applyFocalZoom(state.view, cx, cy, 1 / 1.2, undefined, undefined, getMapFitScale);
        if (elements.zoomScaleText) elements.zoomScaleText.textContent = formatMapZoomLabel();
        drawCanvas();
        scheduleFloorDrawingTierSync();
    });

    const btnZoomFit = document.getElementById('btnZoomFit');
    if (btnZoomFit) btnZoomFit.addEventListener('click', () => {
        fitToScreen();
        drawCanvas();
    });

    // Drawing Rotate Button
    const btnRotateDrawing = document.getElementById('btnRotateDrawing');
    if (btnRotateDrawing) {
        btnRotateDrawing.addEventListener('click', () => {
            const next = normalizeDrawingRotation((state.rotationAngle || 0) + 90);
            if (state.currentBuildingId && state.currentFloor) {
                saveFloorDrawingRotation(state.currentBuildingId, state.currentFloor, next);
            } else {
                state.rotationAngle = next;
            }
            fitToScreen();
            drawCanvas();
        });
    }

