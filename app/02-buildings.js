// @@app-part 02-buildings.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 5. TAB MANAGER (진입 로직은 js/tabs/*.js) ---
    // ---- 마지막 작업 위치 기억·복원 (js/core/last-location.js, 2026-10-28) ----
    // 로그인 직후 복원 시도가 끝나기 전에는 기록·삭제를 하지 않는다(부팅 중 switchTab('tab-home')이 기록을 지우지 않게).
    let _lastLocTracking = false;
    function lastLocApi() { return window.BSA && window.BSA.lastLocation; }
    function recordLastLocation() {
        const LL = lastLocApi();
        const s = window.state;
        if (!LL || !_lastLocTracking || !s || !s.uid || !s.companyId) return;
        try {
            LL.save(localStorage, {
                uid: s.uid, companyId: s.companyId,
                buildingId: s.currentBuildingId, floor: s.currentFloor, tab: s.currentTab
            });
        } catch (_e) { /* 기록 실패가 작업을 막으면 안 된다 */ }
    }
    function clearLastLocation(uid, companyId) {
        const LL = lastLocApi();
        if (!LL) return;
        try { LL.clear(localStorage, uid || (window.state && window.state.uid), companyId || (window.state && window.state.companyId)); } catch (_e) { /* ignore */ }
    }
    const SILENT_RESUME_KEY = 'bsa_silent_resume_view';
    function saveSilentResumeView() {
        try {
            const v = window.state && window.state.view;
            sessionStorage.setItem(SILENT_RESUME_KEY, JSON.stringify({
                buildingId: window.state.currentBuildingId || '',
                floor: window.state.currentFloor || '',
                view: v ? { scale: v.scale, offsetX: v.offsetX, offsetY: v.offsetY } : null
            }));
        } catch (_e) { /* 위치 복원은 부가 기능 */ }
    }
    /** 업데이트로 다시 열린 경우면 true. 도면이 뜨면 보던 확대·위치로 되돌린다 */
    function restoreSilentResumeView(buildingId) {
        let saved = null;
        try {
            saved = JSON.parse(sessionStorage.getItem(SILENT_RESUME_KEY) || 'null');
            sessionStorage.removeItem(SILENT_RESUME_KEY);
        } catch (_e) { saved = null; }
        if (!saved) return false;
        const v = saved.view;
        if (saved.buildingId === buildingId && v && Number(v.scale) > 0 && saved.floor === window.state.currentFloor) {
            let tries = 0;
            const timer = setInterval(() => {
                tries += 1;
                if (window.state.bgImage && window.state.view && window.state.currentFloor === saved.floor) {
                    clearInterval(timer);
                    // 도면이 뜬 직후 맞춤 계산이 끝난 뒤에 넣는다
                    setTimeout(() => {
                        Object.assign(window.state.view, { scale: v.scale, offsetX: v.offsetX, offsetY: v.offsetY });
                        if (typeof drawCanvas === 'function') drawCanvas();
                    }, 150);
                } else if (tries > 40) {
                    clearInterval(timer);
                }
            }, 250);
        }
        return true;
    }
    /** 로그인 직후 1회: 저장된 위치로 들어간다. 들어갔으면 true, 아니면 false(홈 유지) */
    async function tryRestoreLastLocation(profile) {
        const LL = lastLocApi();
        if (!LL || !profile || window._lastLocRestoreDone) return false;
        window._lastLocRestoreDone = true;
        try {
            const loc = LL.load(localStorage, profile.uid, profile.companyId);
            if (!loc) return false;
            const r = LL.resolve(loc, window.state.buildings, {
                isTrashed: isBuildingTrashed,
                getFloorCodes: (b) => ((typeof window.getBuildingAvailableFloors === 'function' ? window.getBuildingAvailableFloors(b) : (b.floorsList || [])) || [])
                    .map((f) => f && f.floorCode).filter(Boolean)
            });
            if (!r.ok) {
                // 건물이 사라졌거나 휴지통이면 기록을 비우고 홈. (층만 사라진 경우는 resolve가 건물 첫 층으로 안내)
                LL.clear(localStorage, profile.uid, profile.companyId);
                return false;
            }
            window.state.currentFloor = r.floor || null;
            await window.selectBuildingAndInspect(r.buildingId);
            if (window.state.currentBuildingId !== r.buildingId) return false;
            if (r.tab && r.tab !== 'tab-map') window.switchTab(r.tab);
            const bldg = (window.state.buildings || []).find((b) => b && b.id === r.buildingId);
            // 2026-11-06 스르륵 업데이트로 다시 열린 것이면 도면 위치까지 되돌리고 안내도 안 띄운다
            if (restoreSilentResumeView(r.buildingId)) return true;
            if (typeof window.showToast === 'function') {
                window.showToast('마지막 작업 위치로 이동했습니다' + (bldg && bldg.name ? ' · ' + String(bldg.name).replace(/^🏢\s*/, '') : '')
                    + (window.state.currentFloor ? ' · ' + window.state.currentFloor : ''), 'info', 2600);
            }
            return true;
        } catch (e) {
            console.warn('마지막 작업 위치 복원 실패(홈으로):', e);
            return false;
        }
    }
    window.BSA = window.BSA || {};
    window.BSA.lastLocUi = {
        record: recordLastLocation,
        clear: clearLastLocation,
        tryRestore: tryRestoreLastLocation,
        enableTracking: function () { _lastLocTracking = true; },
        disableTracking: function () { _lastLocTracking = false; }
    };

    window.switchTab = function(targetTabId = 'tab-home') {
        // 탭 전환 시 결함/NDT 드로어·관련 모달이 다른 도면 위에 남지 않도록 닫기
        try {
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen() && typeof closeDefectModal === 'function') {
                closeDefectModal();
            }
            if (typeof isOverviewPhotosModalOpen === 'function' && isOverviewPhotosModalOpen()
                && typeof closeOverviewPhotosModal === 'function') {
                closeOverviewPhotosModal();
            }
            if (window.bsaPrevSummary && window.bsaPrevSummary.isOpen()) window.bsaPrevSummary.close();
            if (typeof isNdtModalOpen === 'function' && isNdtModalOpen() && typeof closeNdtModal === 'function') {
                closeNdtModal();
            }
            if (typeof isNdtCrackMonitorModalOpen === 'function' && isNdtCrackMonitorModalOpen()
                && typeof closeNdtCrackMonitorModal === 'function') {
                closeNdtCrackMonitorModal();
            }
            const dispModal = document.getElementById('ndtDisplacementModal');
            if (dispModal && (dispModal.classList.contains('open') || dispModal.style.display === 'flex')
                && typeof closeNdtDisplacementModal === 'function') {
                closeNdtDisplacementModal();
            }
            const dispEditModal = document.getElementById('ndtDisplacementGroupEditModal');
            if (dispEditModal && (dispEditModal.classList.contains('open') || dispEditModal.style.display === 'flex')
                && typeof closeNdtDisplacementGroupEditModal === 'function') {
                closeNdtDisplacementGroupEditModal();
            }
            const dispChartModal = document.getElementById('ndtDisplacementChartModal');
            if (dispChartModal && (dispChartModal.classList.contains('open') || dispChartModal.style.display === 'flex')
                && typeof closeNdtDisplacementChartModal === 'function') {
                closeNdtDisplacementChartModal();
            }
            if (typeof window.closeAllMobileCanvasSheets === 'function') {
                window.closeAllMobileCanvasSheets();
            }
        } catch (_e) { /* ignore */ }

        window.state.currentTab = targetTabId;

        document.querySelectorAll('.tab-content').forEach(content => {
            if (content.id === targetTabId) {
                content.classList.add('active');
                content.style.display = 'flex';
            } else {
                content.classList.remove('active');
                content.style.display = 'none';
            }
        });

        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === targetTabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (window.BSA && typeof window.BSA.applyTabChrome === 'function') {
            window.BSA.applyTabChrome(targetTabId);
        }
        // 탭 전환 시 도면 제스처 잔여값으로 전역 touchmove preventDefault가 스크롤을 막지 않게
        try {
            if (typeof window.resetCanvasTouchGestures === 'function') {
                window.resetCanvasTouchGestures();
            }
            document.body.classList.remove('dragging-pin');
            document.body.style.touchAction = '';
            document.body.style.overflow = '';
        } catch (_e) { /* ignore */ }
        if (window.BSA && typeof window.BSA.enterTab === 'function') {
            window.BSA.enterTab(targetTabId);
        } else if (targetTabId === 'tab-home' && typeof window.renderDashboard === 'function') {
            window.renderDashboard();
        }
        if (typeof subscribeCurrentFloorSync === 'function') {
            if (targetTabId === 'tab-home') {
                markCurrentFloorDirty();
                if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
            }
            subscribeCurrentFloorSync();
        }
        if (typeof syncMobileBackHistoryGuard === 'function') syncMobileBackHistoryGuard();
        // 홈으로 직접 나가면 위치 기록을 지운다(새로고침해도 홈 유지). 작업 탭이면 현재 위치를 기록
        if (_lastLocTracking) {
            if (targetTabId === 'tab-home') clearLastLocation();
            else recordLastLocation();
        }
    };

    /** 모바일·Android 앱 뒤로가기 인터셉트 대상 */
    function shouldHandleAppBack() {
        try {
            if (typeof isNativeAndroidApp === 'function' && isNativeAndroidApp()) return true;
        } catch (_) { /* ignore */ }
        if (typeof layoutIsCompactWidth === 'function' && layoutIsCompactWidth()) return true;
        if (typeof layoutIsMobileWidth === 'function' && layoutIsMobileWidth()) return true;
        return false;
    }

    function isModalElOpen(el) {
        if (!el) return false;
        if (el.classList.contains('open')) return true;
        const d = el.style && el.style.display;
        return d === 'flex' || d === 'block';
    }

    /** 뒤로가기: 열린 창/시트만 닫고 홈으로 나가지 않음 */
    function tryCloseTopOverlayForBack() {
        try {
            // 직접 입력 자식 팝업이 떠 있으면 그것만 닫고 부모 수정창은 유지
            if (window.BsaTypingPopup && typeof window.BsaTypingPopup.isOpen === 'function' && window.BsaTypingPopup.isOpen()) {
                window.BsaTypingPopup.close('cancel');
                return true;
            }
            if (window.BsaFinishMemberChooser && typeof window.BsaFinishMemberChooser.isOpen === 'function'
                && window.BsaFinishMemberChooser.isOpen()) {
                window.BsaFinishMemberChooser.close('cancel');
                return true;
            }
            // 선택 목록 시트·숫자 키패드·변위 그래프도 수정창(비파괴 포함) 위에 뜬다 — 그것만 닫고 아래 창은 유지
            const selectSheetEl = document.getElementById('bsaSelectSheet');
            if (selectSheetEl && selectSheetEl.classList.contains('open') && typeof closeBsaSelectSheet === 'function') {
                closeBsaSelectSheet();
                return true;
            }
            if (window.BsaMeasureKeypad && window.BsaMeasureKeypad.isOpen()) {
                window.BsaMeasureKeypad.close();
                return true;
            }
            const dispChartEl = document.getElementById('ndtDisplacementChartModal');
            if (isModalElOpen(dispChartEl)) {
                dispChartEl.classList.remove('open');
                dispChartEl.style.display = 'none';
                return true;
            }
            // 톱니바퀴 프리셋 세팅 창은 수정창 위에 뜬다 — 그것만 닫고 수정창은 유지
            const optionManagerEl = document.getElementById('optionManagerModal');
            if (isModalElOpen(optionManagerEl)) {
                optionManagerEl.classList.remove('open');
                optionManagerEl.style.display = 'none';
                return true;
            }
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen() && typeof closeDefectModal === 'function') {
                closeDefectModal();
                return true;
            }
            if (window.bsaPrevSummary && window.bsaPrevSummary.closeTop()) return true;
            if (typeof isOverviewPhotosModalOpen === 'function' && isOverviewPhotosModalOpen()
                && typeof closeOverviewPhotosModal === 'function') {
                closeOverviewPhotosModal();
                return true;
            }
            if (typeof isNdtModalOpen === 'function' && isNdtModalOpen() && typeof closeNdtModal === 'function') {
                closeNdtModal();
                return true;
            }
            if (typeof isNdtCrackMonitorModalOpen === 'function' && isNdtCrackMonitorModalOpen()
                && typeof closeNdtCrackMonitorModal === 'function') {
                closeNdtCrackMonitorModal();
                return true;
            }
            const named = [
                ['ndtDisplacementModal', 'closeNdtDisplacementModal'],
                ['ndtDisplacementGroupEditModal', 'closeNdtDisplacementGroupEditModal']
            ];
            for (let i = 0; i < named.length; i++) {
                const el = document.getElementById(named[i][0]);
                if (isModalElOpen(el) && typeof window[named[i][1]] === 'function') {
                    window[named[i][1]]();
                    return true;
                }
            }
            if (typeof window.closeEditBuildingModalFunc === 'function' && isModalElOpen(document.getElementById('editBuildingModal'))) {
                window.closeEditBuildingModalFunc();
                return true;
            }
            if (typeof window.closeAddBuildingModalFunc === 'function' && isModalElOpen(document.getElementById('addBuildingModal'))) {
                window.closeAddBuildingModalFunc();
                return true;
            }
            if (isModalElOpen(document.getElementById('surveySizeModal')) && typeof window.closeSurveySizeEditor === 'function') {
                window.closeSurveySizeEditor();
                return true;
            }
            const plainIds = ['reportPreviewModal', 'mobileQrModal', 'buildingTrashModal', 'errorLogModal'];
            for (let j = 0; j < plainIds.length; j++) {
                const m = document.getElementById(plainIds[j]);
                if (isModalElOpen(m)) {
                    m.classList.remove('open');
                    m.style.display = 'none';
                    return true;
                }
            }
            if (typeof window.closeAllMobileCanvasSheets === 'function'
                && document.querySelector('.is-mobile-sheet-open, .is-pc-size-panel-open')) {
                window.closeAllMobileCanvasSheets();
                document.querySelectorAll('.is-pc-size-panel-open').forEach((n) => n.classList.remove('is-pc-size-panel-open'));
                return true;
            }
        } catch (_e) { /* ignore */ }
        return false;
    }

    /**
     * @returns {boolean} true면 시스템이 앱 종료/이전 페이지로 가지 않음
     */
    function handleAppBackPress() {
        // 앱 확인·알림 창이 떠 있으면 뒤로가기 = 취소
        if (window.appDialog && window.appDialog.isOpen()) {
            window.appDialog.cancel();
            return true;
        }
        if (!shouldHandleAppBack()) return false;
        if (tryCloseTopOverlayForBack()) return true;
        const tab = (window.state && window.state.currentTab) || 'tab-home';
        if (tab !== 'tab-home') {
            // 뒤로가기 처리는 바로 true(앱 종료 안 함), 홈 이동은 확인 뒤에
            window.appConfirm('홈으로 나가시겠습니까?', { title: '홈으로', okText: '나가기', danger: false }).then((ok) => {
                if (ok && typeof window.switchTab === 'function') window.switchTab('tab-home');
            });
            return true;
        }
        return false;
    }

    function syncMobileBackHistoryGuard() {
        if (!shouldHandleAppBack()) return;
        const onHome = ((window.state && window.state.currentTab) || 'tab-home') === 'tab-home';
        if (onHome) return;
        try {
            if (!history.state || !history.state.bsaBackGuard) {
                history.pushState({ bsaBackGuard: 1 }, '');
            }
        } catch (_e) { /* ignore */ }
    }

    function initMobileBackButton() {
        if (window._bsaBackButtonInited) return;
        window._bsaBackButtonInited = true;

        window.addEventListener('popstate', () => {
            if (!shouldHandleAppBack()) return;
            const tab = (window.state && window.state.currentTab) || 'tab-home';
            if (tab === 'tab-home') return;
            try { history.pushState({ bsaBackGuard: 1 }, ''); } catch (_e) { /* ignore */ }
            handleAppBackPress();
        });

        syncMobileBackHistoryGuard();

        try {
            const CapApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
            if (CapApp && typeof CapApp.addListener === 'function') {
                CapApp.addListener('backButton', () => {
                    if (handleAppBackPress()) return;
                    if (typeof CapApp.exitApp === 'function') CapApp.exitApp();
                });
            }
        } catch (_e) { /* ignore */ }
    }

    // --- 6. BUILDING MANAGEMENT ENGINE ---

    const INSPECTION_TYPE_OPTIONS = ['정밀안전점검', '정기안전점검', '정밀안전진단'];
    const INSPECTION_TYPE_SHORT_LABELS = {
        '정기안전점검': '정기',
        '정밀안전점검': '정밀',
        '정밀안전진단': '진단'
    };

    function formatInspectionTypeOptionLabel(type, preferShort) {
        if (preferShort && INSPECTION_TYPE_SHORT_LABELS[type]) return INSPECTION_TYPE_SHORT_LABELS[type];
        return type || '';
    }

    function shouldUseShortInspectionTypeLabels() {
        return window.matchMedia('(max-width: 1024px)').matches;
    }

    function buildInspectionTypeOptionsHtml(selectedType, options = {}) {
        const preferShort = options.short !== false;
        return INSPECTION_TYPE_OPTIONS.map((t) => {
            const label = formatInspectionTypeOptionLabel(t, preferShort);
            return `<option value="${escapeHtml(t)}"${t === selectedType ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        }).join('');
    }

    /** 모바일 등 좁은 화면에서 점검 종류 셀렉트 글자 잘림 방지 */
    function syncInspectionTypeSelectOptionLabels(root) {
        const useShort = shouldUseShortInspectionTypeLabels();
        (root || document).querySelectorAll(
            '#selectInspectionType, #inputBuildingInspectionType, #inputEditBuildingInspectionType, select.round-type-select'
        ).forEach((sel) => {
            [...sel.options].forEach((opt) => {
                const val = opt.value;
                if (!INSPECTION_TYPE_OPTIONS.includes(val)) return;
                if (!opt.dataset.fullLabel) opt.dataset.fullLabel = val;
                opt.textContent = formatInspectionTypeOptionLabel(val, useShort);
            });
        });
    }

    /**
     * 현장의 특정 회차(연도_기간)에 속한 모든 동의 점검 종류를 한꺼번에 바꾼다.
     * 회차마다 정밀/정기가 달라질 수 있어 회차 목록에서 바로 조정할 수 있게 한 것.
     * 현재 열려 있는 건물이 그 회차에 속하면 상단 「점검 설정」 드롭다운도 맞춰 준다.
     */
    /** 2026-10-21 현장명 옆 「작성완료」 배지 HTML — 종류마다 체크된 최신 회차 하나만 */
    function buildRoundDoneBadgesHtml(buildings) {
        const rd = window.BSA && window.BSA.roundDone;
        if (!rd) return '';
        const list = rd.latestBadges(buildings || [], getBuildingSurveyRoundKey);
        return list.map((x) => {
            const when = x.doneAt ? new Date(x.doneAt).toLocaleString('ko-KR') : '';
            const isWip = x.kind === 'reportWip';
            const tip = `${formatSurveyRoundLabel(x.roundKey)} · ${x.kind === 'defectMap' ? '결함위치도' : '보고서'} ${isWip ? '작성 중' : '작성완료'}${when ? ' · ' + when : ''}${x.by ? ' · ' + x.by : ''}`;
            const cls = x.kind === 'report' ? 'report' : (isWip ? 'wip' : 'map');
            return `<span class="round-done-badge round-done-badge-${cls}" title="${escapeHtml(tip)}">${isWip ? '✎' : '✔'} ${escapeHtml(x.text)}</span>`;
        }).join('');
    }
    window.buildRoundDoneBadgesHtml = buildRoundDoneBadgesHtml;

    /** 현장 정보 수정 창 맨 아래 — 이 건물(현재 회차)의 보고서/결함위치도 작성완료 체크 */
    window.renderEditRoundDoneChecks = function(bldg) {
        const host = document.getElementById('editRoundDoneSection');
        const rd = window.BSA && window.BSA.roundDone;
        if (!host || !rd) return;
        const rk = bldg ? getBuildingSurveyRoundKey(bldg) : '';
        if (!bldg || !rk) { host.hidden = true; return; }
        host.hidden = false;
        const site = getBuildingSiteName(bldg);
        const row = (kind, label) => {
            const e = rd.getEntry(bldg, kind);
            const info = e && e.done ? `<small class="round-done-meta">${e.doneAt ? escapeHtml(new Date(e.doneAt).toLocaleString('ko-KR')) : ''}${e.by ? ' · ' + escapeHtml(e.by) : ''}</small>` : '';
            return `<label class="round-done-check round-done-check-edit">
                <input type="checkbox" data-kind="${kind}" ${e && e.done ? 'checked' : ''}>
                <span>${escapeHtml(label)}</span>${info}
            </label>`;
        };
        const list = host.querySelector('.round-done-edit-list');
        list.innerHTML = row('reportWip', rd.badgeText('reportWip', rk)) + row('report', rd.badgeText('report', rk)) + row('defectMap', '결함위치도 작성완료');
        list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.addEventListener('change', () => {
                window.setSurveyRoundDone(site, rk, cb.getAttribute('data-kind'), cb.checked);
                window.renderEditRoundDoneChecks(bldg);
            });
        });
    };

    /** 회차(같은 회차의 모든 동) 작성완료 체크/해제 — 건물 칸(roundDone)으로 저장·동기화 */
    window.setSurveyRoundDone = function(siteKey, roundKey, kind, done) {
        const rd = window.BSA && window.BSA.roundDone;
        if (!rd || !siteKey || !roundKey) return 0;
        const all = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds);
        const targets = all.filter((b) => getBuildingSiteName(b) === siteKey && getBuildingSurveyRoundKey(b) === roundKey);
        const user = window.state.userName || '';
        const now = Date.now();
        let changed = 0;
        // 보고서 「작성 중」과 「작성완료」는 동시에 체크되지 않는다 — 한쪽을 체크하면 다른 쪽은 해제
        const opposite = done ? ({ report: 'reportWip', reportWip: 'report' })[kind] : null;
        targets.forEach((b) => {
            let hit = false;
            if (rd.setDone(b, kind, done, user, now)) hit = true;
            if (opposite && rd.setDone(b, opposite, false, user, now)) hit = true;
            if (hit) { markBuildingMetaDirty(b); changed += 1; }
        });
        if (!changed) return 0;
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof window.showToast === 'function') {
            window.showToast(`${formatSurveyRoundLabel(roundKey)} ${kind === 'defectMap' ? '결함위치도 작성완료' : (kind === 'reportWip' ? '보고서 작성 중' : '보고서 작성완료')} ${done ? '체크' : '해제'}`, 'success', 2500);
        }
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        if (typeof window.refreshNavRoundDoneBadges === 'function') window.refreshNavRoundDoneBadges();
        return changed;
    };

    /** 상단 건물명 옆 배지(현장 전체 기준 최신) */
    window.refreshNavRoundDoneBadges = function() {
        const el = document.getElementById('navBuildingName');
        const b = window.state && window.state.currentBuilding;
        if (!el || !b) return;
        let holder = document.getElementById('navRoundDoneBadges');
        if (!holder) {
            holder = document.createElement('span');
            holder.id = 'navRoundDoneBadges';
            holder.className = 'round-done-badges round-done-badges-nav';
            el.insertAdjacentElement('afterend', holder);
        }
        const site = getBuildingSiteName(b);
        const members = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter((x) => getBuildingSiteName(x) === site);
        holder.innerHTML = buildRoundDoneBadgesHtml(members);
        holder.style.display = el.style.display === 'none' ? 'none' : '';
    };

    window.setSurveyRoundInspectionType = function(siteKey, roundKey, inspectionType) {
        if (!siteKey || !roundKey || !INSPECTION_TYPE_OPTIONS.includes(inspectionType)) return;
        const all = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds);
        const targets = all.filter((b) => getBuildingSiteName(b) === siteKey && getBuildingSurveyRoundKey(b) === roundKey);
        if (!targets.length) return;
        let changed = 0;
        targets.forEach((b) => {
            if (b.inspectionType === inspectionType) return;
            b.inspectionType = inspectionType;
            markBuildingMetaDirty(b);
            changed += 1;
        });
        if (!changed) return;
        const cur = window.state.currentBuilding;
        if (cur && targets.some((b) => b.id === cur.id)) {
            cur.inspectionType = inspectionType;
            const sel = document.getElementById('selectInspectionType');
            if (sel) sel.value = inspectionType;
        }
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        window.showToast(
            `${formatSurveyRoundLabel(roundKey)} 회차 → ${inspectionType}` + (targets.length > 1 ? ` (동 ${targets.length}개)` : ''),
            'success',
            3500
        );
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
    };

    /** 2026-10-20 회차 점검일 — 회차 목록·점검 설정에서 바로 정한다(같은 회차의 모든 동에 함께) */
    window.setSurveyRoundInspectionDate = function(siteKey, roundKey, date) {
        const mm = window.BSA && window.BSA.buildingMetaMerge;
        if (!siteKey || !roundKey || !mm || typeof mm.setRoundDate !== 'function') return 0;
        const all = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds);
        const targets = all.filter((b) => getBuildingSiteName(b) === siteKey && getBuildingSurveyRoundKey(b) === roundKey);
        const cur = window.state.currentBuilding;
        if (cur && !targets.some((b) => b.id === cur.id) && getBuildingSiteName(cur) === siteKey && getBuildingSurveyRoundKey(cur) === roundKey) targets.push(cur);
        let changed = 0;
        targets.forEach((b) => { if (mm.setRoundDate(b, roundKey, date)) { markBuildingMetaDirty(b); changed += 1; } });
        if (cur && cur !== targets.find((b) => b.id === cur.id) && targets.some((b) => b.id === cur.id)) {
            const src = targets.find((b) => b.id === cur.id);
            cur.roundDates = JSON.parse(JSON.stringify(src.roundDates || {}));
            markBuildingMetaDirty(cur);
        }
        if (!changed) return 0;
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        window.showToast(`${formatSurveyRoundLabel(roundKey)} 점검일 → ${date || '건물 공통 점검일'}`, 'success', 3000);
        if (typeof window.syncInspectionRoundDateInput === 'function') window.syncInspectionRoundDateInput();
        // 2026-11-04 건축물 목록의 「📅 점검 날짜」 줄·회차 날짜 칸도 바로 새로 그린다 — 예전엔 서버 동기화가 돌려주는 스냅샷이
        // 목록을 다시 그려 줬는데, 건물마다 문서로 나눈 뒤로는 내 쓰기 스냅샷이 일찍 끝나 목록이 옛 날짜로 남았다
        if (typeof window.renderDashboard === 'function') window.renderDashboard();
        return changed;
    };

    /** 점검 설정(고급 필터)의 점검일 칸을 지금 회차 날짜로 맞춘다 */
    window.syncInspectionRoundDateInput = function() {
        const el = document.getElementById('inputInspectionRoundDate');
        const b = window.state && window.state.currentBuilding;
        if (!el) return;
        el.disabled = !b;
        el.value = b && typeof getBuildingInspectionDate === 'function' ? (getBuildingInspectionDate(b, getCurrentSurveyRoundKey()) || '') : '';
    };
    document.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !t.id) return;
        if (t.id === 'selectInspectionYear' || t.id === 'selectInspectionPeriod') {
            setTimeout(() => window.syncInspectionRoundDateInput(), 0);
        } else if (t.id === 'inputInspectionRoundDate') {
            const b = window.state && window.state.currentBuilding;
            if (b) window.setSurveyRoundInspectionDate(getBuildingSiteName(b), getCurrentSurveyRoundKey(), t.value || '');
        }
    });

    window.renderDashboard = function() {
        const grid = elements.buildingListGrid || document.getElementById('buildingListGrid');
        if (!grid) return;

        if (!window.state.buildings || !Array.isArray(window.state.buildings)) {
            window.state.buildings = [];
        }

        if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();

        const allBldgs = filterActiveBuildings(window.state.buildings, window.state.deletedBuildingIds);
        allBldgs.forEach(ensureBuildingSiteFields);
        const term = (window.state.buildingSearchTerm || '').trim().toLowerCase();
        const siteNav = document.getElementById('dashboardSiteNav');
        const siteNavTitle = document.getElementById('dashboardSiteNavTitle');
        const heroTitle = document.querySelector('#tab-home .hero-title');

        const filterBldgByTerm = (b) => {
            if (!term) return true;
            const name = (b.name || '').toLowerCase();
            const addr = (b.address || '').toLowerCase();
            const site = getBuildingSiteName(b).toLowerCase();
            const dong = getBuildingDongLabel(b).toLowerCase();
            const round = formatSurveyRoundLabel(getBuildingSurveyRoundKey(b)).toLowerCase();
            const inspector = (b.inspector || '').toLowerCase();
            const phone = (b.contactPhone || '').toLowerCase();
            return name.includes(term) || addr.includes(term) || site.includes(term)
                || dong.includes(term) || round.includes(term)
                || inspector.includes(term) || phone.includes(term);
        };

        const filtered = term ? allBldgs.filter(filterBldgByTerm) : allBldgs;

        const groupBuildingsBySite = (list) => {
            const map = new Map();
            list.forEach((b) => {
                const key = getBuildingSiteName(b);
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(b);
            });
            return map;
        };

        const selectedSiteKey = window.state.dashboardSiteKey || null;
        const selectedRoundKey = window.state.dashboardRoundKey || null;
        if (selectedSiteKey && selectedRoundKey) {
            const stillExists = filtered.some((b) =>
                getBuildingSiteName(b) === selectedSiteKey
                && getBuildingSurveyRoundKey(b) === selectedRoundKey
            );
            if (!stillExists) window.state.dashboardRoundKey = null;
        }
        if (typeof window.updateHomeFabForDashboardMode === 'function') {
            window.updateHomeFabForDashboardMode();
        }

        const bindBuildingRowActions = () => {
            const blockGhostClick = () => window._postAuthClickGuardUntil && Date.now() < window._postAuthClickGuardUntil;
            grid.querySelectorAll('[data-action="open-site"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (blockGhostClick()) { e.preventDefault(); e.stopPropagation(); return; }
                    e.stopPropagation();
                    const key = el.getAttribute('data-site-key');
                    if (key) window.openDashboardSiteRounds(key);
                });
            });
            grid.querySelectorAll('[data-action="open-round"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const site = el.getAttribute('data-site-key');
                    const round = el.getAttribute('data-round-key');
                    if (site && round) window.openDashboardRoundDongs(site, round);
                });
            });
            grid.querySelectorAll('[data-action="round-date"]').forEach((el) => {
                ['click', 'pointerdown', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
                el.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const site = el.getAttribute('data-site-key');
                    const round = el.getAttribute('data-round-key');
                    if (site && round) window.setSurveyRoundInspectionDate(site, round, el.value || '');
                });
            });
            grid.querySelectorAll('[data-action="round-done"]').forEach((el) => {
                ['click', 'pointerdown', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
                el.parentElement && el.parentElement.addEventListener('click', (e) => e.stopPropagation());
                el.addEventListener('change', (e) => {
                    e.stopPropagation();
                    window.setSurveyRoundDone(el.getAttribute('data-site-key'), el.getAttribute('data-round-key'), el.getAttribute('data-kind'), el.checked);
                });
            });
            grid.querySelectorAll('[data-action="round-type"]').forEach((el) => {
                // 셀렉트 클릭이 행 클릭(점검 시작/동 선택)으로 번지지 않게 막는다
                ['click', 'pointerdown', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
                el.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const site = el.getAttribute('data-site-key');
                    const round = el.getAttribute('data-round-key');
                    if (site && round) window.setSurveyRoundInspectionType(site, round, el.value);
                });
            });
            grid.querySelectorAll('[data-action="inspect"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id) window.selectBuildingAndInspect(id);
                });
            });
            grid.querySelectorAll('[data-action="edit"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (blockGhostClick()) { e.preventDefault(); e.stopPropagation(); return; }
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id) window.openEditBuildingModalFunc(id, 'info');
                });
            });
            grid.querySelectorAll('[data-action="drawing"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id) window.openEditBuildingModalFunc(id, 'drawing');
                });
            });
            grid.querySelectorAll('[data-action="overview"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id && typeof window.openOverviewPhotosModal === 'function') window.openOverviewPhotosModal(id);
                });
            });
            grid.querySelectorAll('[data-action="offline-prep"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    const b = id && (window.state.buildings || []).find((x) => x && x.id === id);
                    if (b && typeof window.openOfflinePrepModal === 'function') window.openOfflinePrepModal(b);
                });
            });
            grid.querySelectorAll('[data-action="delete-round"]').forEach((el) => {
                ['click', 'pointerdown', 'touchstart'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const site = el.getAttribute('data-site-key');
                    const round = el.getAttribute('data-round-key');
                    if (site && round && typeof window.deleteSurveyRound === 'function') {
                        window.deleteSurveyRound(site, round);
                    }
                });
            });
            grid.querySelectorAll('[data-action="dong-move"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (blockGhostClick()) { e.preventDefault(); e.stopPropagation(); return; }
                    e.stopPropagation();
                    if (el.disabled) return;
                    window.moveSiteDong(el.getAttribute('data-site-key'), el.getAttribute('data-dong-label'), el.getAttribute('data-other-label'));
                });
            });
            grid.querySelectorAll('[data-action="dong-rename"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (blockGhostClick()) { e.preventDefault(); e.stopPropagation(); return; }
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id) window.renameDongOfBuilding(id);
                });
            });
            grid.querySelectorAll('[data-action="dong-delete"]').forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (blockGhostClick()) { e.preventDefault(); e.stopPropagation(); return; }
                    e.stopPropagation();
                    const id = el.getAttribute('data-bldg-id');
                    if (id) window.deleteDongOfBuilding(id);
                });
            });
            syncInspectionTypeSelectOptionLabels(grid);
        };

        const renderBuildingActionRow = (bldg, titleHtml, metaHtml, rowClass, extraBtnsHtml) => {
            const safeId = escapeHtml(bldg.id);
            return `
                <div class="building-row ${rowClass || ''}" data-id="${safeId}">
                    <div class="building-row-info" data-action="inspect" data-bldg-id="${safeId}">
                        <span class="building-row-name">${titleHtml}</span>
                        <span class="building-row-meta">${metaHtml}</span>
                    </div>
                    <div class="building-row-actions building-row-actions-compact">
                        <button type="button" class="icon-btn icon-btn-start" title="점검 시작" data-action="inspect" data-bldg-id="${safeId}" aria-label="점검">
                            <i class="fa-solid fa-map-location-dot"></i>
                            <span class="icon-btn-label">점검</span>
                        </button>
                        <button type="button" class="icon-btn icon-btn-drawing" title="도면 추가/교체" data-action="drawing" data-bldg-id="${safeId}" aria-label="도면">
                            <i class="fa-solid fa-images"></i>
                            <span class="icon-btn-label">도면</span>
                        </button>
                        <button type="button" class="icon-btn icon-btn-offline" title="오프라인 준비 — 모든 층·도면·사진을 이 기기에 받기" data-action="offline-prep" data-bldg-id="${safeId}" aria-label="오프라인 준비">
                            <i class="fa-solid fa-cloud-arrow-down"></i>
                            <span class="icon-btn-label">오프라인</span>
                        </button>${extraBtnsHtml || ''}
                    </div>
                </div>
            `;
        };

        // ── 3단: 현장 → 회차 → (여러 동만) 동 ──
        // 요약·탭은 현장 목록 첫 화면에서만 (현장 안으로 들어가면 숨김)
        // 회차선택(현장 진입)에는 기존 inspector/contactPhone 을 현장 목록과 같은 문구로 보여 준다.
        {
            const sumEl = document.getElementById('dashboardSummary');
            const tabEl = document.getElementById('dashboardTabs');
            const contactEl = document.getElementById('dashboardSiteContact');
            const HS = window.BSA && window.BSA.homeSites;
            if (selectedSiteKey) {
                if (sumEl) sumEl.hidden = true;
                if (tabEl) tabEl.hidden = true;
            }
            const onRoundSelect = !!(selectedSiteKey && !window.state.dashboardRoundKey);
            if (contactEl && onRoundSelect) {
                const siteMembers = allBldgs.filter((b) => getBuildingSiteName(b) === selectedSiteKey);
                const line = HS && typeof HS.formatSiteContactLine === 'function'
                    ? HS.formatSiteContactLine(siteMembers)
                    : '현장 담당자·연락처 미등록';
                contactEl.hidden = false;
                contactEl.textContent = line;
                contactEl.classList.toggle('is-empty', line === ((HS && HS.SITE_CONTACT_EMPTY) || '현장 담당자·연락처 미등록'));
            } else if (contactEl) {
                contactEl.hidden = true;
                contactEl.textContent = '';
                contactEl.classList.remove('is-empty');
            }
        }
        if (selectedSiteKey && window.state.dashboardRoundKey) {
            const roundKey = window.state.dashboardRoundKey;
            const dongs = filtered.filter((b) =>
                getBuildingSiteName(b) === selectedSiteKey
                && getBuildingSurveyRoundKey(b) === roundKey
            ).sort(makeDongComparator(selectedSiteKey));

            if (siteNav) siteNav.hidden = false;
            if (siteNavTitle) {
                siteNavTitle.innerHTML = `${escapeHtml(selectedSiteKey)} · ${escapeHtml(formatSurveyRoundLabel(roundKey))} <span class="round-done-badges">${buildRoundDoneBadgesHtml(filtered.filter((b) => getBuildingSiteName(b) === selectedSiteKey))}</span>`;
            }
            if (heroTitle) heroTitle.textContent = '🏢 동 선택';

            if (dongs.length === 0) {
                grid.innerHTML = `<div class="building-list-empty">${term ? '🔍 검색 결과가 없습니다.' : '이 회차에 등록된 동이 없습니다.'} <button type="button" class="btn btn-sm btn-outline dashboard-back-rounds-inline" style="margin-top:0.6rem;">회차 목록으로</button></div>`;
                grid.querySelector('.dashboard-back-rounds-inline')?.addEventListener('click', () => window.closeDashboardRoundDongs());
                return;
            }

            // 여러 동: 동별 점검·도면·전경 (동마다 도면이 다름)
            grid.innerHTML = dongs.map((bldg, i) => {
                const floorCount = (bldg.floorsList && bldg.floorsList.length > 0)
                    ? `도면 ${bldg.floorsList.length}개 층`
                    : '도면 미등록';
                const sid = escapeHtml(bldg.id);
                const myLabel = escapeHtml(formatDongRowLabel(bldg));
                const upLabel = i > 0 ? escapeHtml(formatDongRowLabel(dongs[i - 1])) : '';
                const downLabel = i < dongs.length - 1 ? escapeHtml(formatDongRowLabel(dongs[i + 1])) : '';
                const dongBtns = `
                        <button type="button" class="icon-btn" title="한글 출력·목록에서 이 동을 위로" data-action="dong-move" data-site-key="${escapeHtml(selectedSiteKey)}" data-dong-label="${myLabel}" data-other-label="${upLabel}" aria-label="동 위로" ${i === 0 ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-up"></i>
                            <span class="icon-btn-label">위로</span>
                        </button>
                        <button type="button" class="icon-btn" title="한글 출력·목록에서 이 동을 아래로" data-action="dong-move" data-site-key="${escapeHtml(selectedSiteKey)}" data-dong-label="${myLabel}" data-other-label="${downLabel}" aria-label="동 아래로" ${i === dongs.length - 1 ? 'disabled' : ''}>
                            <i class="fa-solid fa-arrow-down"></i>
                            <span class="icon-btn-label">아래로</span>
                        </button>
                        <button type="button" class="icon-btn icon-btn-edit" title="동 이름 지정/변경" data-action="dong-rename" data-bldg-id="${sid}" aria-label="동 이름 변경">
                            <i class="fa-solid fa-pen"></i>
                            <span class="icon-btn-label">이름 수정</span>
                        </button>
                        <button type="button" class="icon-btn icon-btn-danger" title="이 동 삭제(휴지통)" data-action="dong-delete" data-bldg-id="${sid}" aria-label="동 삭제">
                            <i class="fa-solid fa-trash-can"></i>
                            <span class="icon-btn-label">삭제</span>
                        </button>`;
                return renderBuildingActionRow(
                    bldg,
                    `<i class="fa-solid fa-door-open flag-icon-muted"></i> ${escapeHtml(formatDongRowLabel(bldg))}`,
                    `${escapeHtml(bldg.inspectionType || '점검')} · ${escapeHtml(floorCount)}`,
                    'building-row-dong',
                    dongBtns
                );
            }).join('');
            bindBuildingRowActions();
            if (typeof window.updateHomeFabForDashboardMode === 'function') window.updateHomeFabForDashboardMode();
            return;
        }

        if (selectedSiteKey) {
            const siteBuildings = filtered.filter((b) => getBuildingSiteName(b) === selectedSiteKey);
            if (siteNav) siteNav.hidden = false;
            if (siteNavTitle) siteNavTitle.innerHTML = `${escapeHtml(selectedSiteKey)} <span class="round-done-badges">${buildRoundDoneBadgesHtml(siteBuildings)}</span>`;
            if (heroTitle) heroTitle.textContent = '📅 점검 회차 선택';

            if (siteBuildings.length === 0) {
                grid.innerHTML = `<div class="building-list-empty">${term ? '🔍 검색 결과가 없습니다.' : '이 현장에 등록된 회차가 없습니다.'} <button type="button" class="btn btn-sm btn-outline dashboard-back-sites-inline" style="margin-top:0.6rem;">현장 목록으로</button></div>`;
                grid.querySelector('.dashboard-back-sites-inline')?.addEventListener('click', () => window.closeDashboardSiteRounds());
                return;
            }

            const byRound = new Map();
            siteBuildings.forEach((b) => {
                const rk = getBuildingSurveyRoundKey(b) || '_none';
                if (!byRound.has(rk)) byRound.set(rk, []);
                byRound.get(rk).push(b);
            });
            const roundKeys = [...byRound.keys()].sort((a, b) => {
                const ra = getSurveyRoundOrderRank(a);
                const rb = getSurveyRoundOrderRank(b);
                if (ra != null && rb != null && ra !== rb) return rb - ra;
                if (ra != null && rb == null) return -1;
                if (ra == null && rb != null) return 1;
                return String(b).localeCompare(String(a), 'ko');
            });

            const multiDong = isSiteMultiDong(selectedSiteKey);
            // 2026-10-29 폰·태블릿 회차 화면: 점검 종류 고르기·회차 삭제는 숨기고(PC에서만),
            // 남는 자리에 점검/도면 수정/오프라인 버튼을 글자와 함께 크게. 저장된 점검 종류는 그대로.
            const roundMobile = !!(window.BSA && typeof window.BSA.prefersMobileLayout === 'function' && window.BSA.prefersMobileLayout());
            const roundRowMobileCls = roundMobile ? ' round-row-mobile' : ' round-row-pc';
            grid.innerHTML = roundKeys.map((rk) => {
                const members = byRound.get(rk) || [];
                const roundLabel = rk === '_none' ? '회차 미지정' : formatSurveyRoundLabel(rk);
                const typeLabel = members[0]?.inspectionType || '점검';
                let metaHint;
                if (multiDong) {
                    const dongNames = members.map(formatDongRowLabel);
                    metaHint = members.length > 1
                        ? `동 ${members.length}개 · ${dongNames.join(', ')}`
                        : formatDongRowLabel(members[0]);
                } else {
                    const b0 = members[0];
                    const floorCount = (b0?.floorsList && b0.floorsList.length)
                        ? `도면 ${b0.floorsList.length}개 층`
                        : '도면 미등록';
                    metaHint = `${b0?.address || '주소 미등록'} · ${floorCount}`;
                }
                const safeSite = escapeHtml(selectedSiteKey);
                const safeRound = escapeHtml(rk);
                // 회차별 점검 종류(정밀/정기/진단) 선택. 같은 회차의 모든 동에 함께 적용된다.
                const typeSelect = roundMobile ? '' : `
                    <select class="round-type-select" data-action="round-type" data-site-key="${safeSite}" data-round-key="${safeRound}"
                        title="이 회차의 점검 종류" aria-label="${escapeHtml(roundLabel)} 점검 종류">
                        ${buildInspectionTypeOptionsHtml(typeLabel, { short: true })}
                    </select>`;
                // 2026-10-20 회차 점검일(비우면 건물 공통 점검일)
                const roundDate = rk === '_none' ? '' : (getBuildingInspectionDate(members[0], rk) || '');
                const dateInput = rk === '_none' ? '' : `
                    <label class="round-date-wrap" title="이 회차 점검일 (재령일 계산·출력에 사용)" style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.75rem;">
                        <span>점검일</span>
                        <input type="date" class="round-date-input" data-action="round-date" data-site-key="${safeSite}" data-round-key="${safeRound}"
                            value="${escapeHtml(roundDate)}" aria-label="${escapeHtml(roundLabel)} 점검일" style="height:28px;font-size:0.78rem;padding:0 0.25rem;max-width:9.5rem;">
                    </label>`;
                if (roundDate) metaHint = `점검일 ${roundDate} · ${metaHint}`;
                // 단일: 회차 = 점검 시작 + 도면·전경. 여러 동: 회차 = 동 선택으로 진입
                if (multiDong) {
                    return `
                        <div class="building-row building-row-round${roundRowMobileCls}" data-round-key="${safeRound}">
                            <div class="building-row-info" data-action="open-round" data-site-key="${safeSite}" data-round-key="${safeRound}">
                                <span class="building-row-name">${escapeHtml(roundLabel)}</span>
                                <span class="building-row-meta">${escapeHtml(metaHint)} · 동 선택</span>
                            </div>
                            <div class="building-row-actions building-row-actions-compact">
                                ${dateInput}
                                ${typeSelect}
${roundMobile ? '' : `<button type="button" class="icon-btn icon-btn-trash" title="이 회차 삭제(휴지통)" data-action="delete-round" data-site-key="${safeSite}" data-round-key="${safeRound}" aria-label="회차 삭제">
                                    <i class="fa-solid fa-trash"></i>
                                    <span class="icon-btn-label">삭제</span>
                                </button>`}
                            </div>
                        </div>
                    `;
                }
                const b0 = members[0];
                if (!b0) return '';
                const safeId = escapeHtml(b0.id);
                return `
                    <div class="building-row building-row-round building-row-round-single${roundRowMobileCls}" data-round-key="${safeRound}" data-id="${safeId}">
                        <div class="building-row-info" data-action="inspect" data-bldg-id="${safeId}">
                            <span class="building-row-name">${escapeHtml(roundLabel)}</span>
                            <span class="building-row-meta">${escapeHtml(metaHint)}</span>
                        </div>
                        <div class="building-row-actions building-row-actions-compact">
                            ${dateInput}
                            ${typeSelect}
                            <button type="button" class="icon-btn icon-btn-start" title="점검 시작" data-action="inspect" data-bldg-id="${safeId}" aria-label="점검">
                                <i class="fa-solid fa-map-location-dot"></i>
                                <span class="icon-btn-label">점검</span>
                            </button>
                            <button type="button" class="icon-btn icon-btn-drawing" title="도면 추가/교체" data-action="drawing" data-bldg-id="${safeId}" aria-label="도면">
                                <i class="fa-solid fa-images"></i>
                                <span class="icon-btn-label">도면 수정</span>
                            </button>
                            <button type="button" class="icon-btn icon-btn-offline" title="오프라인 준비 — 모든 층·도면·사진을 이 기기에 받기" data-action="offline-prep" data-bldg-id="${safeId}" aria-label="오프라인 준비">
                                <i class="fa-solid fa-cloud-arrow-down"></i>
                                <span class="icon-btn-label">${roundMobile ? '오프라인' : '오프라인 저장'}</span>
                            </button>
                            ${roundMobile ? '' : `<button type="button" class="icon-btn icon-btn-trash" title="이 회차 삭제(휴지통)" data-action="delete-round" data-site-key="${safeSite}" data-round-key="${safeRound}" aria-label="회차 삭제">
                                <i class="fa-solid fa-trash"></i>
                                <span class="icon-btn-label">삭제</span>
                            </button>`}
                        </div>
                    </div>
                `;
            }).join('');
            bindBuildingRowActions();
            if (typeof window.updateHomeFabForDashboardMode === 'function') window.updateHomeFabForDashboardMode();
            return;
        }

        if (siteNav) siteNav.hidden = true;
        if (heroTitle) heroTitle.textContent = '🏢 점검 대상 건축물 목록';

        const siteMap = groupBuildingsBySite(filtered);

        // ── 요약·정렬·진행/완료 탭 (js/core/home-sites.js) — 이미 불러온 건물만 쓴다 ──
        const HS = window.BSA && window.BSA.homeSites;
        const RD = window.BSA && window.BSA.roundDone;
        const todayStr = HS ? HS.todayLocal() : '';
        const statusDeps = {
            roundKeyOf: getBuildingSurveyRoundKey,
            roundRank: getSurveyRoundOrderRank,
            inspectionDate: (b, rk) => getBuildingInspectionDate(b, rk),
            isReportDone: (b) => !!(RD && RD.isDone(b, 'report')),
            isMapDone: (b) => !!(RD && RD.isDone(b, 'defectMap'))
        };
        const statusBySite = new Map();
        groupBuildingsBySite(allBldgs).forEach((members, key) => {
            statusBySite.set(key, HS ? HS.siteStatus(members, statusDeps, todayStr) : null);
        });
        const summary = HS ? HS.summarize([...statusBySite.values()]) : null;
        const isSiteDone = (key) => !!(statusBySite.get(key) && statusBySite.get(key).done);
        const termKeys = [...siteMap.keys()];
        const termDoneCount = termKeys.filter(isSiteDone).length;
        const termActiveCount = termKeys.length - termDoneCount;
        const dashTab = window.state.dashboardTab === 'done' ? 'done' : 'active';
        {
            const sumEl = document.getElementById('dashboardSummary');
            const tabEl = document.getElementById('dashboardTabs');
            if (sumEl && summary) {
                sumEl.hidden = false;
                sumEl.innerHTML = `
                    <div class="dashboard-summary-stats">
                        <span class="ds-chip ds-chip-total" title="삭제·휴지통 제외 전체 현장">전체 현장 <b>${summary.total}</b></span>
                        <span class="ds-chip ds-chip-done" title="최종 회차 보고서가 작성완료로 체크된 현장">보고서 작성완료 <b>${summary.done}</b></span>
                        <span class="ds-chip ds-chip-unwritten ds-chip-map" title="다녀왔는데(점검일이 오늘 이전) 최종 회차 보고서가 아직 작성완료로 체크되지 않은 현장">보고서 작성 필요 <b>${summary.remaining}</b></span>
                    </div>
                    <div class="dashboard-summary-remain" title="다녀왔는데(점검일이 오늘 이전) 최종 회차 보고서가 아직 작성완료로 체크되지 않은 현장 수">남은 보고서 <b>${summary.remaining}</b></div>`;
            }
            if (tabEl) {
                tabEl.hidden = false;
                tabEl.innerHTML = `
                    <button type="button" role="tab" class="dashboard-tab${dashTab === 'active' ? ' active' : ''}" data-dash-tab="active" aria-selected="${dashTab === 'active'}">진행 중 <span class="dashboard-tab-count">${termActiveCount}</span></button>
                    <button type="button" role="tab" class="dashboard-tab${dashTab === 'done' ? ' active' : ''}" data-dash-tab="done" aria-selected="${dashTab === 'done'}">작성 완료 <span class="dashboard-tab-count">${termDoneCount}</span></button>`;
                if (!tabEl._bsaBound) {
                    tabEl._bsaBound = true;
                    tabEl.addEventListener('click', (e) => {
                        const btn = e.target.closest('[data-dash-tab]');
                        if (!btn) return;
                        window.state.dashboardTab = btn.getAttribute('data-dash-tab') === 'done' ? 'done' : 'active';
                        window.renderDashboard();
                    });
                }
            }
        }
        const siteKeys = termKeys
            .filter((k) => (dashTab === 'done') === isSiteDone(k))
            .sort((a, b) => {
                const sa = statusBySite.get(a);
                const sb = statusBySite.get(b);
                const cmp = HS
                    ? HS.compareSites({ name: a, date: sa && sa.date }, { name: b, date: sb && sb.date })
                    : a.localeCompare(b, 'ko');
                return cmp;
            });

        if (siteKeys.length === 0) {
            let emptyMsg;
            if (term) {
                const other = dashTab === 'done' ? termActiveCount : termDoneCount;
                emptyMsg = '🔍 검색 결과가 없습니다.' + (other ? ` (${dashTab === 'done' ? '진행 중' : '작성 완료'} 탭에 ${other}곳 있음)` : '');
            } else if (allBldgs.length === 0) {
                emptyMsg = '등록된 건축물이 없습니다. 하단 + 버튼으로 현장을 추가하세요.';
            } else if (dashTab === 'done') {
                emptyMsg = '최종 회차 보고서가 작성 완료된 현장이 아직 없습니다.';
            } else {
                emptyMsg = '진행 중인 현장이 없습니다. 모든 현장의 최종 회차 보고서가 작성 완료 상태입니다.';
            }
            grid.innerHTML = `<div class="building-list-empty">${emptyMsg}</div>`;
            return;
        }

        grid.innerHTML = siteKeys.map((siteKey) => {
            const members = siteMap.get(siteKey) || [];
            const roundSet = new Set(members.map((b) => formatSurveyRoundLabel(getBuildingSurveyRoundKey(b))).filter(Boolean));
            const roundHint = roundSet.size
                ? [...roundSet].join(' · ')
                : '등록된 회차 없음';
            let layoutHint = '';
            if (isSiteMultiDong(siteKey)) {
                const dongSet = new Set(members.map(formatDongRowLabel).filter((d) => d && d !== '동 미지정'));
                layoutHint = dongSet.size > 1 ? ` · 동 ${dongSet.size}개` : (dongSet.size === 1 ? ` · ${[...dongSet][0]}` : ' · 여러 동');
            } else {
                layoutHint = ' · 단일 건물';
            }
            const pickField = (fn) => {
                for (const b of members) {
                    const v = String(fn(b) || '').trim();
                    if (v) return v;
                }
                return '';
            };
            const addr = pickField((b) => b.address);
            const contactLine = HS && typeof HS.formatSiteContactLine === 'function'
                ? HS.formatSiteContactLine(members)
                : '현장 담당자·연락처 미등록';
            const addrLine = addr || '주소 미등록';
            const safeSite = escapeHtml(siteKey);
            // 점검(다녀온) 날짜 — 현장명을 고르는 이 줄에 보여 준다(모바일은 회차 줄의 별도 날짜 입력을 숨김)
            const st = statusBySite.get(siteKey);
            let visitLine = '';
            if (st) {
                const bits = [];
                if (st.date) bits.push(`📅 점검 ${st.date}`);
                else bits.push('📅 점검일 미정');
                if (st.latestRound) bits.push(formatSurveyRoundLabel(st.latestRound));
                if (!st.done && st.visited) bits.push('보고서 작성 필요');
                visitLine = `<span class="building-row-meta building-row-site-visit${(!st.done && st.visited) ? ' need-report' : ''}">${escapeHtml(bits.join(' · '))}</span>`;
            }
            // 최신 회차 건물(목록 정렬 기준) — 현장 목록에서 바로 수정 가능
            const editTarget = members.slice().sort((a, b) => {
                const ra = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(a));
                const rb = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(b));
                if (ra != null && rb != null && ra !== rb) return rb - ra;
                return 0;
            })[0];
            const editId = editTarget ? escapeHtml(editTarget.id) : '';
            const editBtn = editId
                ? `<div class="building-row-actions building-row-actions-compact">
                        <button type="button" class="icon-btn icon-btn-edit" title="현장 정보 수정" data-action="edit" data-bldg-id="${editId}" aria-label="현장 정보 수정">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                   </div>`
                : '';
            return `
                <div class="building-row building-row-site" data-site-key="${safeSite}">
                    <div class="building-row-info" data-action="open-site" data-site-key="${safeSite}">
                        <span class="building-row-name"><i class="fa-solid fa-building flag-icon-muted"></i> ${safeSite}<span class="round-done-badges">${buildRoundDoneBadgesHtml(members)}</span></span>
                        ${visitLine}
                        <span class="building-row-meta building-row-rounds">${escapeHtml(roundHint)}${escapeHtml(layoutHint)}</span>
                        <span class="building-row-meta building-row-site-addr">${escapeHtml(addrLine)}</span>
                        <span class="building-row-meta building-row-site-contact">${escapeHtml(contactLine)}</span>
                    </div>
                    ${editBtn}
                </div>
            `;
        }).join('');
        bindBuildingRowActions();
        if (typeof window.updateHomeFabForDashboardMode === 'function') {
            window.updateHomeFabForDashboardMode();
        }
    };

    window.openDashboardSiteRounds = function(siteKey) {
        if (!siteKey) return;
        window.state.dashboardSiteKey = siteKey;
        window.state.dashboardRoundKey = null;
        window.renderDashboard();
    };

    window.closeDashboardSiteRounds = function() {
        window.state.dashboardSiteKey = null;
        window.state.dashboardRoundKey = null;
        window.renderDashboard();
    };

    window.openDashboardRoundDongs = function(siteKey, roundKey) {
        if (!siteKey || !roundKey) return;
        window.state.dashboardSiteKey = siteKey;
        // 단일 건물은 회차 행에서 바로 점검하므로 여기로 오지 않음.
        // 여러 동만 동 선택 화면으로 진입.
        if (!isSiteMultiDong(siteKey)) {
            window.state.dashboardRoundKey = null;
            const active = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds);
            const bldg = active.find((b) =>
                getBuildingSiteName(b) === siteKey
                && getBuildingSurveyRoundKey(b) === roundKey
            );
            if (bldg) {
                window.selectBuildingAndInspect(bldg.id);
                return;
            }
        }
        window.state.dashboardRoundKey = roundKey;
        window.renderDashboard();
    };

    window.closeDashboardRoundDongs = function() {
        window.state.dashboardRoundKey = null;
        window.renderDashboard();
    };

    const buildingSearchInput = document.getElementById('buildingSearchInput');
    if (buildingSearchInput) {
        armBuildingSearchAntiAutofill(buildingSearchInput);
        buildingSearchInput.addEventListener('input', (e) => {
            if (isBuildingSearchAutofillSpam(e.target.value)) {
                e.target.value = '';
                window.state.buildingSearchTerm = '';
                return;
            }
            window.state.buildingSearchTerm = e.target.value;
            window.renderDashboard();
        });
        // 크롬이 input 이벤트 없이 value만 바꾸는 경우
        buildingSearchInput.addEventListener('change', () => clearBuildingSearchAutofill());
    }

    const btnDashboardBackSites = document.getElementById('btnDashboardBackSites');
    if (btnDashboardBackSites) {
        btnDashboardBackSites.addEventListener('click', () => {
            if (window.state.dashboardRoundKey) window.closeDashboardRoundDongs();
            else window.closeDashboardSiteRounds();
        });
    }

    (function bindHomeSettingsPanel() {
        const btn = document.getElementById('btnHomeSettings');
        const panel = document.getElementById('homeSettingsPanel');
        if (!btn || !panel) return;
        const setOpen = (open) => {
            panel.hidden = !open;
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            const icon = btn.querySelector('i');
            if (icon) icon.className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-gear';
        };
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setOpen(!!panel.hidden);
        });
        document.addEventListener('click', (e) => {
            if (panel.hidden) return;
            if (panel.contains(e.target) || btn.contains(e.target)) return;
            setOpen(false);
        });
    })();

    window.selectBuildingAndInspect = async function(bldgOrId) {
        if (!window.state.buildings) window.state.buildings = [];

        let bldg = null;
        if (typeof bldgOrId === 'string') {
            bldg = window.state.buildings.find(b => b.id === bldgOrId || b.name === bldgOrId || (b.name && b.name.includes(bldgOrId)));
        } else if (bldgOrId && typeof bldgOrId === 'object') {
            bldg = bldgOrId;
            if (bldg.id) {
                const fresh = window.state.buildings.find((b) => b && b.id === bldg.id);
                if (fresh) bldg = fresh;
            }
        }

        if (!bldg && window.state.buildings.length > 0) {
            bldg = window.state.buildings[0];
        }

        if (!bldg) return;

        if (isBuildingTrashed(bldg)) {
            window.showToast('휴지통에 있는 건물입니다. 설정 → 휴지통에서 복원한 뒤 열어 주세요.', 'warning', 5000);
            if (typeof window.openBuildingTrashModal === 'function') window.openBuildingTrashModal();
            return;
        }

        if (window.state.currentBuildingId && window.state.currentFloor) {
            saveFloorMapStyleSettings(window.state.currentFloor, window.state.currentBuildingId);
        }
        const prevBldgId = window.state.currentBuildingId;
        if (prevBldgId && prevBldgId !== bldg.id) {
            const prevBldg = window.state.buildings.find((item) => item.id === prevBldgId);
            if (prevBldg) saveBuildingLocationMapLegend(prevBldg);
        }

        window.state.currentBuilding = bldg;
        window.state.currentBuildingId = bldg.id;
        applyBuildingLocationMapLegend(bldg);
        if (typeof touchBuildingAccess === 'function') touchBuildingAccess(bldg.id);

        // 홈 복귀 시: 단일은 회차 목록, 여러 동은 동 선택 화면 유지
        try {
            if (typeof ensureBuildingSiteFields === 'function') ensureBuildingSiteFields(bldg);
            const siteName = typeof getBuildingSiteName === 'function' ? getBuildingSiteName(bldg) : (bldg.siteName || bldg.name);
            if (siteName) window.state.dashboardSiteKey = siteName;
            if (typeof isSiteMultiDong === 'function' && isSiteMultiDong(siteName)) {
                const rk = typeof getBuildingSurveyRoundKey === 'function' ? getBuildingSurveyRoundKey(bldg) : null;
                window.state.dashboardRoundKey = rk || window.state.dashboardRoundKey || null;
            } else {
                window.state.dashboardRoundKey = null;
            }
        } catch (_e) { /* ignore */ }

        // Nav 건물명 표시 업데이트
        const cleanName = bldg.name ? bldg.name.replace(/^🏢\s*/, '') : '건축물';
        if (elements.appTitle) elements.appTitle.textContent = cleanName;
        try { window.refreshNavRoundDoneBadges(); } catch (_e) { /* ignore */ }

        applyInspectionSelectsFromBuilding(bldg);
        if (!bldg.latestSurveyRoundKey) {
            const maxDefectRoundKey = getMaxSurveyRoundKeyForBuilding(bldg);
            advanceLatestSurveyRound(bldg, maxDefectRoundKey || `${bldg.inspectionYear || '2026년'}_${bldg.inspectionPeriod || '하반기'}`);
        }

        // home→재진입 레이스: sync merge가 false tombstone을 다시 합치기 전에
        // IDB·서버 meta·클라우드 도면 증거로 tombstone을 먼저 해제한다. (의도 삭제는 IDB·클라우드도 비움)
        let enrichedOnEnter = false;
        try {
            if (typeof enrichFloorsListFromIndexedDb === 'function') {
                enrichedOnEnter = !!(await enrichFloorsListFromIndexedDb(bldg));
            }
            // 서버 floorsList에 있는데 로컬 tombstone만 남은 경우(폰 오프라인 캐시) 즉시 해제
            if (typeof _drawingFloorTombstone.forgetTombstonesClearedByRemoteMeta === 'function') {
                // 세 번째 인자가 bldg 자신이다 — 내 meta 시각은 "남이 다시 올렸다"는
                // 증거가 못 되므로 selfCheck로 명시한다. 이걸 빼면 내가 저장할 때마다
                // metaUpdatedAt이 삭제 시각을 넘어서서, 재진입할 때마다 지운 층이 되살아난다.
                const n = _drawingFloorTombstone.forgetTombstonesClearedByRemoteMeta(
                    bldg, _sessionDeletedDrawingKeys, bldg, { selfCheck: true }
                );
                // bldg 자신 meta만으로는 이미 strip된 floorsList가 증거 없음 → 클라우드 조회
                if (n > 0) {
                    enrichedOnEnter = true;
                    bldg._pendingCloudSync = true;
                }
            }
            const stillTombstoned = (typeof buildingHasDrawingFloorTombstones === 'function')
                ? buildingHasDrawingFloorTombstones(bldg)
                : ((bldg.deletedDrawingFloorCodes || []).length > 0);
            const canCloud = typeof navigator === 'undefined' || navigator.onLine !== false;
            if (stillTombstoned && canCloud && typeof discoverCloudDrawingFloorCodes === 'function') {
                const discovered = await discoverCloudDrawingFloorCodes(bldg);
                if (discovered && discovered.size) {
                    discovered.forEach((fc) => {
                        if (!fc) return;
                        if (isDeletedDrawingFloor(bldg, fc)) forgetDeletedDrawingFloor(bldg, fc);
                    });
                    mergeDiscoveredFloorsIntoBuilding(bldg, discovered);
                    if (!bldg.drawingFloorCodes) bldg.drawingFloorCodes = [];
                    const codeSet = new Set(bldg.drawingFloorCodes);
                    discovered.forEach((c) => { if (c) codeSet.add(c); });
                    bldg.drawingFloorCodes = Array.from(codeSet).filter((c) => !isDeletedDrawingFloor(bldg, c));
                    if (typeof window.getBuildingAvailableFloors === 'function') {
                        bldg.floorsList = window.getBuildingAvailableFloors(bldg);
                    }
                    stripDeletedDrawingFloorsFromBuilding(bldg);
                    enrichedOnEnter = true;
                    if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                }
            }
        } catch (e) {
            console.warn('진입 전 층·tombstone 보강 실패:', e);
        }

        // 도면 없는 층(다른 건물에서 새어 들어온 층 포함)은 기본 층으로 고르기 전에 뺀다
        try { await autoRemoveDrawinglessFloors(bldg); } catch (e) { console.warn('도면 없는 층 정리 실패:', e); }

        populateFloorSelectDropdown(bldg);
        warnIfBuildingDataLooksHollow(bldg);

        const availableOnEnter = (typeof window.getBuildingAvailableFloors === 'function')
            ? window.getBuildingAvailableFloors(bldg)
            : (bldg.floorsList || []);
        const targetFloor = (window.state.currentFloor && availableOnEnter.some((f) => f && f.floorCode === window.state.currentFloor))
            ? window.state.currentFloor
            : ((availableOnEnter[0] && availableOnEnter[0].floorCode) || '');
        window.state.currentFloor = targetFloor;
        if (targetFloor) applyFloorMapStyleSettings(targetFloor, bldg.id);

        const canFetchDrawings = typeof navigator === 'undefined' || navigator.onLine !== false;
        const entryBuildingId = bldg.id;
        const prevBuildingIdForEntry = window.state.currentBuildingId;
        const enteringFromHome = window.state.currentTab === 'tab-home';
        const reentrySameBuilding = enteringFromHome && prevBuildingIdForEntry === entryBuildingId;

        // 맵 진입을 동기화보다 먼저 — reconnect 시 전체 업로드·사진 hydrate가 진입을 막지 않게
        if (targetFloor) loadFloorDrawing(targetFloor);
        else if (typeof showFloorDrawingEmptyState === 'function') showFloorDrawingEmptyState('', '이 건축물에 등록된 도면이 없습니다.');
        window.switchTab('tab-map');

        if (canFetchDrawings && window.state.companyId && enteringFromHome) {
            if (reentrySameBuilding) {
                window.showToast('최신 점검 데이터 받는 중…', 'info', 2200);
            }
            if (typeof listenToRealtimeUpdates === 'function') listenToRealtimeUpdates();
        }

        if (canFetchDrawings && typeof pruneStaleIndexedDbInspectionData === 'function') {
            pruneStaleIndexedDbInspectionData().catch(() => {});
        }

        (async () => {
            try {
                // 진입 전 enrich가 실패했거나 추가 키가 생긴 경우를 대비해 한 번 더
                const enriched = enrichedOnEnter
                    || (typeof enrichFloorsListFromIndexedDb === 'function'
                        ? !!(await enrichFloorsListFromIndexedDb(bldg))
                        : false);
                // 반대로 로컬·클라우드 어디에도 실제 도면이 없는 유령 층은 정리
                const pruned = await pruneGhostFloorEntries(bldg);
                if (enriched || pruned) populateFloorSelectDropdown(bldg);

                // 도면(현재 층)과 사진(현재 층)을 동시에 불러온다 — 예전엔 도면을 다 기다린
                // 뒤에야 사진 로딩을 시작해서(그것도 건물 전체 층을 층마다 순서대로) 사진이
                // 뜨기까지 오래 걸렸다(사용자가 실제로 겪음: 최대 1분 가까이 빈 채로 있다가,
                // 결함을 새로 등록하는 등 다른 이유로 화면이 다시 그려질 때만 나타남). 지금 층
                // 사진만 도면과 나란히 기다리고, 나머지 층 사진은 백그라운드로 미룬다.
                if (typeof hydrateDefectPhotos === 'function') {
                    persistLocalImagesToIndexedDb(window.state.buildings, window.state.defects);
                    Object.entries(window.state.defects || {}).forEach(([key, arr]) => {
                        if (key.startsWith(bldg.id + '_')) return;
                        (arr || []).forEach((d) => {
                            if (d.photos) delete d.photos;
                            if (d.prevRoundPhotos) delete d.prevRoundPhotos;
                        });
                    });
                    // RAM의 인라인 photos만 비운다. _photoCache를 통째로 지우면
                    // IDB 미스 시 같은 사진을 Firestore에서 다시 읽게 된다.
                }
                const photoSubset = {};
                Object.entries(window.state.defects || {}).forEach(([key, arr]) => {
                    if (key.startsWith(bldg.id + '_')) photoSubset[key] = arr;
                });
                const currentFloorPhotoKey = `${bldg.id}_${targetFloor}`;
                const currentFloorPhotoSubset = {};
                const restPhotoSubset = {};
                Object.entries(photoSubset).forEach(([key, arr]) => {
                    if (key === currentFloorPhotoKey) currentFloorPhotoSubset[key] = arr;
                    else restPhotoSubset[key] = arr;
                });

                // 도면 로딩(hydrateSingleBuildingDrawings)은 클라우드 문제(예: Firestore 권한
                // 오류)가 있으면 자체 재시도·타임아웃(최대 35초)까지 기다린 뒤에야 끝난다 —
                // 사진 로딩을 여기 Promise.all로 묶어 "같이 기다리게" 했더니, 도면이 오래
                // 걸리는 상황에서 사진도 덩달아 그만큼 늦게(최대 35초~1분) 나타났다(사용자가
                // 실제로 겪음). 도면과 사진을 서로 기다리지 않는 완전히 독립된 작업으로
                // 분리한다 — 사진이 먼저 끝나면 도면과 무관하게 바로 화면에 반영한다.
                const drawingsPromise = (typeof hydrateSingleBuildingDrawings === 'function')
                    ? hydrateSingleBuildingDrawings(bldg, {
                        localOnly: !canFetchDrawings,
                        priorityFloor: targetFloor,
                        priorityOnly: true,
                        skipHiTiers: true,
                        needPdf: false
                    }).catch((e) => console.warn('현재 층 도면 로드 실패:', e))
                    : Promise.resolve();

                const photosPromise = (async () => {
                    if (typeof hydrateDefectPhotos !== 'function') return;
                    if (Object.keys(currentFloorPhotoSubset).length) {
                        // 현재 층만 클라우드 photos get 허용 — 전 층/전 현장 일괄 get은 하지 않음
                        const allowCloudPhotos = !!canFetchDrawings
                            && !(typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused());
                        const loaded = await hydrateDefectPhotos(currentFloorPhotoSubset, {
                            buildingId: bldg.id,
                            allowCloudPhotoFetch: allowCloudPhotos
                        });
                        if (window.state.currentBuildingId !== entryBuildingId) return;
                        Object.assign(window.state.defects, loaded);
                    }
                    if (window.state.currentBuildingId !== entryBuildingId) return;
                    if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();

                    // 나머지 층: IDB/캐시만 백그라운드 복원(클라우드 get 없음). 층 전환 때 클라우드 보강.
                    if (Object.keys(restPhotoSubset).length) {
                        hydrateDefectPhotos(restPhotoSubset, {
                            buildingId: bldg.id,
                            allowCloudPhotoFetch: false
                        }).then((loaded) => {
                            if (window.state.currentBuildingId !== entryBuildingId) return;
                            Object.assign(window.state.defects, loaded);
                            if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
                            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                        }).catch((e) => console.warn('나머지 층 사진 IDB 복원 실패:', e));
                    }
                })().catch((e) => console.warn('현재 층 사진 로드 실패:', e));

                await Promise.all([drawingsPromise, photosPromise]);
                if (window.state.currentBuildingId !== entryBuildingId) return;

                populateFloorSelectDropdown(bldg);
                const curFloor = window.state.currentFloor;
                const refMismatch = window.state.floorPlanRef
                    && window.state.floorPlanRef.floorCode !== curFloor;
                if (window.state.currentBuildingId === entryBuildingId
                    && curFloor
                    && (!window.state.bgImage || refMismatch)
                    && typeof loadFloorDrawing === 'function') {
                    loadFloorDrawing(curFloor);
                } else if (typeof renderDefectListPanel === 'function') {
                    renderDefectListPanel();
                }
            } catch (e) {
                console.warn('점검 진입 후 도면 동기화 실패:', e);
            }
        })();
    };

    window.getFloorLabelFromCode = function(code, bldg) {
        const building = bldg
            || (window.state && window.state.currentBuilding)
            || window.currentEditingBuilding
            || null;
        const fi = window.BSA && window.BSA.floorIdentity;
        if (fi && typeof fi.lookupFloorLabel === 'function') {
            return fi.lookupFloorLabel(code, building);
        }
        if (!code) return '1F';
        const c = String(code).toUpperCase().trim();
        const serial = c.match(/^EXT_(\d+)$/);
        if (serial) return '외부' + serial[1] + ' (EXT_' + serial[1] + ')';
        const extNum = String(code).trim().match(/^외부\s*(\d+)$/);
        if (extNum) return '외부' + extNum[1] + ' (EXT_' + extNum[1] + ')';
        const dirDef = (window.EXT_DIRECTION_DEFS || []).find(d => d.code === c);
        if (dirDef) return dirDef.label;
        if (c === 'EXT' || String(code).trim() === '외부') return '건축물 외부 (EXT)';
        if (String(code).includes('외부')) return String(code).trim();
        const roofInfo = typeof window.resolveRoofFloorFromText === 'function' ? window.resolveRoofFloorFromText(code) : null;
        if (roofInfo) {
            // 2026-10-16 옥탑1층·PH2처럼 번호가 있으면 번호를 살린 이름(둘 다 「옥탑층 (PH)」로 보이지 않게)
            const ri = roofInfo.code === 'PH' && typeof window.parseRooftopIndex === 'function' ? window.parseRooftopIndex(code) : null;
            if (ri) return String(code).includes('옥탑') ? String(code).trim() : `옥탑${ri}층 (${String(code).trim()})`;
            return roofInfo.label;
        }
        const bMatch = c.match(/^B\s*([0-9]+)\s*F?$/);
        if (bMatch) return `지하 ${bMatch[1]}층 (${c})`;
        const fMatch = c.match(/^([0-9]+)\s*F$/);
        if (fMatch) return `지상 ${fMatch[1]}층 (${c})`;
        return String(code).trim();
    };

    /**
     * 층 표시 이름 바꾸기 — floorCode(내부 키)는 그대로, floorsList 이름만 바꾼다.
     * 도면 삭제 묘비·다시 넣기 로직을 부르지 않는다. 동기화는 floorLabelAt 시각으로 병합.
     */
    window.renameFloorDisplayName = async function(bldgOrId, floorCode, newLabel) {
        const bldg = typeof bldgOrId === 'string'
            ? (window.state.buildings || []).find((b) => b && b.id === bldgOrId)
            : bldgOrId;
        const fr = window.BSA && window.BSA.floorRename;
        if (!bldg || !floorCode || !fr) return false;
        const codes = (window.getBuildingAvailableFloors(bldg) || []).map((f) => f.floorCode);
        const curLabel = window.getFloorLabelFromCode(floorCode, bldg);
        let label = newLabel;
        if (label == null) {
            label = await window.appPrompt(`새 층 이름을 입력하세요.\n(도면·결함·사진 등은 그대로 이 층에 남습니다)`, curLabel, { title: '층 이름 바꾸기' });
            if (label == null) return false;
        }
        const res = fr.rename(bldg, floorCode, label, { codes, lookup: (c, b) => window.getFloorLabelFromCode(c, b) });
        if (!res.ok) { window.showToast(res.reason, 'warning', 4000); return false; }
        if (!res.changed) return false;
        // 이름이 「외부…」로 바뀌었거나 외부가 아니게 되면(코드는 그대로) 자동 순서일 때 외부 자리로 다시 정렬 — 데이터는 그대로
        try {
            const wasExt = window.isExteriorFloorCode(floorCode, curLabel);
            const nowExt = window.isExteriorFloorCode(floorCode, res.label);
            if (wasExt !== nowExt && !bldg.floorsOrderManual && typeof window.sortFloorsLowToHigh === 'function') {
                bldg.floorsList = window.sortFloorsLowToHigh(bldg.floorsList || []);
            }
        } catch (_e) { /* 정렬은 보조 */ }
        // 같은 건물 객체가 여러 곳에 있으면 맞춘다(state.buildings / currentBuilding / currentEditingBuilding)
        [ (window.state.buildings || []).find((b) => b && b.id === bldg.id), window.state.currentBuilding, window.currentEditingBuilding ]
            .forEach((o) => {
                if (!o || o === bldg || o.id !== bldg.id) return;
                o.floorsList = bldg.floorsList;
                o.floorLabelAt = bldg.floorLabelAt;
            });
        bldg._pendingCloudSync = true;
        if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(bldg);
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (window.state.currentBuildingId === bldg.id) {
            populateFloorSelectDropdown(window.state.currentBuilding || bldg);
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        }
        window.showToast(`층 이름을 "${res.label}"(으)로 바꿨습니다.`, 'success');
        return true;
    };
    (function wireFloorRenameButton() {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const btn = document.getElementById('btnRenameFloor');
        if (!btn || typeof btn.addEventListener !== 'function') return;
        btn.addEventListener('click', () => {
            const b = window.state.currentBuilding;
            const code = window.state.currentFloor;
            if (!b || !code) { window.showToast('층을 먼저 선택해 주세요.', 'warning'); return; }
            window.renameFloorDisplayName(b, code);
        });
    })();

    window.getBuildingAvailableFloors = function(bldg) {
        if (!bldg) return [];
        const extras = [];
        const addExtra = (code, label) => {
            if (!code) return;
            extras.push({ floorCode: String(code), floorLabel: label || '' });
        };

        (bldg.drawingFloorCodes || []).forEach((c) => addExtra(c));
        Object.keys(bldg.floorDrawings || {}).forEach((c) => addExtra(c));
        Object.keys(bldg.floorDrawingPdfs || {}).forEach((c) => addExtra(c));
        Object.keys(bldg.floorDrawingSources || {}).forEach((c) => addExtra(c));
        Object.keys(bldg.floorDrawingTiers || {}).forEach((c) => addExtra(c));

        if (bldg.id) {
            const prefix = `${bldg.id}_`;
            const addFromPersistedKey = (key) => {
                if (!key || !String(key).startsWith(prefix)) return;
                const rest = String(key).slice(prefix.length);
                if (!rest) return;
                const tierSuffix = rest.match(/^(.*)_(4000|8000|16000)$/);
                addExtra(tierSuffix ? tierSuffix[1] : rest);
            };
            if (_idbPersistedDrawingKeys) _idbPersistedDrawingKeys.forEach(addFromPersistedKey);
            if (_idbPersistedPdfKeys) _idbPersistedPdfKeys.forEach(addFromPersistedKey);
            if (_idbPersistedSourceKeys) _idbPersistedSourceKeys.forEach(addFromPersistedKey);
            if (_idbPersistedTierKeys) _idbPersistedTierKeys.forEach(addFromPersistedKey);
        }

        const fi = window.BSA && window.BSA.floorIdentity;
        let list;
        if (fi && typeof fi.assembleFloors === 'function') {
            list = fi.assembleFloors(bldg.floorsList || [], extras);
        } else {
            const floorMap = {};
            const addFloor = (code, label) => {
                if (!code) return;
                const c = String(code);
                if (!floorMap[c]) floorMap[c] = label || window.getFloorLabelFromCode(c);
            };
            (bldg.floorsList || []).forEach((f) => {
                if (f && f.floorCode) addFloor(f.floorCode, f.floorLabel);
            });
            extras.forEach((f) => addFloor(f.floorCode, f.floorLabel));
            list = Object.entries(floorMap).map(([code, label]) => ({ floorCode: code, floorLabel: label }));
        }

        return list.filter((f) => f && f.floorCode && !isDeletedDrawingFloor(bldg, f.floorCode));
    };

    /** 도면 저장/메모리 해제 전에 층 코드를 meta에 고정 — 점검층 드롭다운이 비지 않게 */
    function syncBuildingDrawingFloorCodes(bldg) {
        if (!bldg || !bldg.id) return;
        const codes = collectKnownFloorCodesForBuilding(bldg);
        // floorsList에 이미 있는 코드도 포함
        (bldg.floorsList || []).forEach((f) => { if (f && f.floorCode) codes.add(f.floorCode); });
        (bldg.drawingFloorCodes || []).forEach((c) => { if (c) codes.add(c); });
        const orderedCodes = (bldg.floorsList || [])
            .map((f) => f && f.floorCode)
            .filter((c) => c && codes.has(c) && !isDeletedDrawingFloor(bldg, c));
        const extraCodes = Array.from(codes).filter((c) => c && !orderedCodes.includes(c) && !isDeletedDrawingFloor(bldg, c));
        bldg.drawingFloorCodes = orderedCodes.concat(extraCodes);
        mergeDiscoveredFloorsIntoBuilding(bldg, new Set(bldg.drawingFloorCodes));
        stripDeletedDrawingFloorsFromBuilding(bldg);
        // floorsList를 최신 집합으로 정렬 유지
        if (typeof window.getBuildingAvailableFloors === 'function') {
            bldg.floorsList = window.getBuildingAvailableFloors(bldg);
        }
        stripDeletedDrawingFloorsFromBuilding(bldg);
    }

    /** IDB에 남아 있는 이 건물 도면 키로 층 목록 보강 (새로고침 후 복구) */
    async function enrichFloorsListFromIndexedDb(bldg) {
        if (!bldg || !bldg.id || typeof idbGetAllKeys !== 'function') return false;
        const prefix = `${bldg.id}_`;
        const found = new Set();
        let healedTombstones = 0;
        const takeKeys = (keys) => {
            (keys || []).forEach((key) => {
                if (!key || !String(key).startsWith(prefix)) return;
                const rest = String(key).slice(prefix.length);
                if (!rest) return;
                const tierSuffix = rest.match(/^(.*)_(4000|8000|16000)$/);
                const fc = tierSuffix ? tierSuffix[1] : rest;
                if (!fc) return;
                // IDB에 도면이 남아 있으면 오탐 tombstone — 의도 삭제는 IDB도 지운다
                if (isDeletedDrawingFloor(bldg, fc)) {
                    forgetDeletedDrawingFloor(bldg, fc);
                    healedTombstones += 1;
                }
                found.add(fc);
            });
        };
        try {
            const [drawKeys, pdfKeys, srcKeys, tierKeys] = await Promise.all([
                idbGetAllKeys('floorDrawings'),
                idbGetAllKeys('floorDrawingPdfs'),
                idbGetAllKeys('floorDrawingSources'),
                idbGetAllKeys('floorDrawingTiers')
            ]);
            takeKeys(drawKeys);
            takeKeys(pdfKeys);
            takeKeys(srcKeys);
            takeKeys(tierKeys);
        } catch (e) {
            console.warn('IDB 층 목록 보강 실패:', bldg.id, e);
            return false;
        }
        if (found.size === 0) return false;
        const before = (bldg.floorsList || []).length;
        mergeDiscoveredFloorsIntoBuilding(bldg, found);
        if (!bldg.drawingFloorCodes) bldg.drawingFloorCodes = [];
        const codeSet = new Set(bldg.drawingFloorCodes);
        found.forEach((c) => codeSet.add(c));
        bldg.drawingFloorCodes = Array.from(codeSet).filter((c) => !isDeletedDrawingFloor(bldg, c));
        bldg.floorsList = window.getBuildingAvailableFloors(bldg);
        stripDeletedDrawingFloorsFromBuilding(bldg);
        if (healedTombstones > 0) {
            console.info('[tombstone] IDB 도면 증거로 false tombstone 해제:', bldg.id, healedTombstones);
            bldg._pendingCloudSync = true;
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        }
        return (bldg.floorsList || []).length > before || healedTombstones > 0;
    }

    /** 예전 삭제 버그 등으로 floorsList/drawingFloorCodes에만 남고 실제 도면은
     * 로컬(RAM·IDB)에도 클라우드에도 전혀 없는 "유령 층"을 목록에서 제거한다.
     * (점검층 드롭다운·도면 추가/교체 목록 둘 다 이 floorsList를 기준으로 그려짐) */
    async function pruneGhostFloorEntries(bldg) {
        if (!bldg || !bldg.id) return false;
        const beforeList = (bldg.floorsList || []).length;
        stripDeletedDrawingFloorsFromBuilding(bldg);
        const tombstoneRemoved = (bldg.floorsList || []).length !== beforeList;

        const candidates = new Set();
        (bldg.floorsList || []).forEach((f) => { if (f && f.floorCode) candidates.add(f.floorCode); });
        (bldg.drawingFloorCodes || []).forEach((c) => { if (c) candidates.add(c); });
        if (candidates.size === 0) return tombstoneRemoved;

        const hasRamTrace = (fc) =>
            !!((bldg.floorDrawings && bldg.floorDrawings[fc]) ||
               (bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[fc]) ||
               (bldg.floorDrawingTiers && bldg.floorDrawingTiers[fc]) ||
               (bldg.floorDrawingSources && bldg.floorDrawingSources[fc]));

        // 방금 저장·업로드 중인 층은 RAM을 비운 직후에도 유령으로 보지 않는다.
        const hasSessionAssetTrace = (fc) => {
            if (!fc || !bldg.id) return false;
            const key = `${bldg.id}_${fc}`;
            if (_idbPersistedDrawingKeys && _idbPersistedDrawingKeys.has(key)) return true;
            if (_idbPendingDrawingKeys && _idbPendingDrawingKeys.has(key)) return true;
            if (_idbPersistedPdfKeys && _idbPersistedPdfKeys.has(key)) return true;
            if (_idbPendingPdfKeys && _idbPendingPdfKeys.has(key)) return true;
            if (_idbPersistedSourceKeys && _idbPersistedSourceKeys.has(key)) return true;
            if (_idbPendingSourceKeys && _idbPendingSourceKeys.has(key)) return true;
            if (window._cloudSyncedDrawingKeys && window._cloudSyncedDrawingKeys.has(key)) return true;
            if (window._cloudSyncedPdfKeys && window._cloudSyncedPdfKeys.has(key)) return true;
            const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
            for (let i = 0; i < dims.length; i++) {
                const tierKey = (typeof floorDrawingTierIdbKey === 'function')
                    ? floorDrawingTierIdbKey(bldg.id, fc, dims[i])
                    : `${key}_${dims[i]}`;
                if (_idbPersistedTierKeys && _idbPersistedTierKeys.has(tierKey)) return true;
                if (_idbPendingTierKeys && _idbPendingTierKeys.has(tierKey)) return true;
                if (window._cloudSyncedTierKeys && window._cloudSyncedTierKeys.has(`${key}_${dims[i]}`)) return true;
            }
            return false;
        };

        const suspects = Array.from(candidates).filter((fc) => !hasRamTrace(fc) && !hasSessionAssetTrace(fc));
        if (suspects.length === 0) return tombstoneRemoved;

        let idbFound;
        try {
            const prefix = `${bldg.id}_`;
            idbFound = new Set();
            const takeKeys = (keys) => {
                (keys || []).forEach((key) => {
                    if (!key || !String(key).startsWith(prefix)) return;
                    const rest = String(key).slice(prefix.length);
                    if (!rest) return;
                    const tierSuffix = rest.match(/^(.*)_(4000|8000|16000)$/);
                    idbFound.add(tierSuffix ? tierSuffix[1] : rest);
                });
            };
            const [drawKeys, pdfKeys, srcKeys, tierKeys] = await Promise.all([
                idbGetAllKeys('floorDrawings'),
                idbGetAllKeys('floorDrawingPdfs'),
                idbGetAllKeys('floorDrawingSources'),
                idbGetAllKeys('floorDrawingTiers')
            ]);
            [drawKeys, pdfKeys, srcKeys, tierKeys].forEach(takeKeys);
        } catch (e) {
            return tombstoneRemoved; // IDB 조회 실패 시 안전하게 유령만 추가로 지우지 않음
        }

        const stillSuspect = suspects.filter((fc) => !idbFound.has(fc) && !hasSessionAssetTrace(fc));
        if (stillSuspect.length === 0) return tombstoneRemoved;

        // 오프라인이거나 클라우드 조회가 안 되면, 아직 이 기기에 안 내려받았을 뿐일 수 있으니 보류
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return tombstoneRemoved;

        const registeredCodes = new Set(
            (bldg.drawingFloorCodes || []).map((c) => String(c || '').trim()).filter(Boolean)
        );
        const ghosts = stillSuspect.filter((fc) => {
            if (isDeletedDrawingFloor(bldg, fc)) return true;
            if (registeredCodes.has(String(fc))) return false;
            if (hasSessionAssetTrace(fc)) return false;
            return true;
        });
        if (ghosts.length === 0) return tombstoneRemoved;

        bldg.floorsList = (bldg.floorsList || []).filter((f) => !ghosts.includes(f.floorCode));
        if (Array.isArray(bldg.drawingFloorCodes)) {
            bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter((c) => !ghosts.includes(c));
        }
        stripDeletedDrawingFloorsFromBuilding(bldg);
        console.info('유령 층 정리:', bldg.id, ghosts);
        return true;
    }

    function populateFloorSelectDropdown(bldg) {
        if (!elements.floorSelect) return;
        
        let availableFloors = window.getBuildingAvailableFloors(bldg);
        let recoveredFromCodes = false;

        // available이 비어도 drawingFloorCodes에 등록된 층이 있으면 복구 (유령정리 레이스 대비)
        if ((!availableFloors || availableFloors.length === 0) && bldg && Array.isArray(bldg.drawingFloorCodes) && bldg.drawingFloorCodes.length) {
            recoveredFromCodes = true;
            const fi = window.BSA && window.BSA.floorIdentity;
            availableFloors = bldg.drawingFloorCodes
                .filter((c) => c && !isDeletedDrawingFloor(bldg, c))
                .map((c) => ({
                    floorCode: c,
                    floorLabel: (fi && typeof fi.labelFromCode === 'function')
                        ? fi.labelFromCode(c)
                        : (window.getFloorLabelFromCode ? window.getFloorLabelFromCode(c) : c)
                }));
        }
        
        if (bldg && availableFloors && availableFloors.length > 0) {
            // 복구 경로로 만든 목록은 사용자가 정한 순서가 아니므로,
            // 기존 floorsList가 살아 있으면 덮어쓰지 않는다
            if (!recoveredFromCodes || !(bldg.floorsList && bldg.floorsList.length)) {
                bldg.floorsList = availableFloors;
            }
        }

        if (availableFloors && availableFloors.length > 0) {
            elements.floorSelect.innerHTML = availableFloors.map(f =>
                `<option value="${f.floorCode}">${f.floorLabel}</option>`
            ).join('');

            const hasCurrent = availableFloors.some(f => f.floorCode === window.state.currentFloor);
            if (!hasCurrent) {
                window.state.currentFloor = availableFloors[0].floorCode;
            }
            elements.floorSelect.value = window.state.currentFloor;
        } else {
            elements.floorSelect.innerHTML = `<option value="">등록된 도면 층 없음</option>`;
            window.state.currentFloor = '';
        }
    }

    // --- 7. BUILDING REGISTRATION MODAL HANDLERS ---

    function initAddBuildingScrollHost() {
        const overlay = elements.addBuildingModal;
        const host = document.getElementById('addBuildingScrollHost');
        if (!overlay || !host || overlay._bsaAddBuildingScrollBound) return;
        overlay._bsaAddBuildingScrollBound = true;

        const syncAddBuildingScrollHint = () => {
            if (!overlay.classList.contains('open')) return;
            const maxScroll = host.scrollHeight - host.clientHeight;
            host.classList.toggle('has-scroll', maxScroll > 4);
            host.classList.toggle('at-scroll-end', maxScroll <= 4 || host.scrollTop >= maxScroll - 4);
        };

        host.addEventListener('scroll', syncAddBuildingScrollHint, { passive: true });
        window.addEventListener('resize', syncAddBuildingScrollHint, { passive: true });
        overlay._bsaSyncAddBuildingScrollHint = syncAddBuildingScrollHint;
    }

    window.openAddBuildingModalFunc = function() {
        if (elements.addBuildingModal) {
            window._addBuildingMode = 'new';
            setAddBuildingMode('new');

            const siteInput = document.getElementById('inputBuildingSiteName');
            const dongInput = document.getElementById('inputBuildingDong');
            const nameInput = document.getElementById('inputBuildingName');
            if (siteInput) siteInput.value = window.state.dashboardSiteKey || '';
            if (dongInput) dongInput.value = '';
            if (nameInput) nameInput.value = '';
            resetAddBuildingDongRows();
            const inheritMulti = window.state.dashboardSiteKey
                ? isSiteMultiDong(window.state.dashboardSiteKey)
                : false;
            setSiteLayoutRadio('addBuildingSiteLayout', inheritMulti);
            syncAddBuildingDongFieldVisibility();
            const addrInput = document.getElementById('inputBuildingAddress');
            if (addrInput) addrInput.value = '';
            const inspectorInput = document.getElementById('inputBuildingInspector');
            if (inspectorInput) inspectorInput.value = window.state.userName || '';
            const contactInput = document.getElementById('inputBuildingContactPhone');
            if (contactInput) contactInput.value = '';
            const floorsInput = document.getElementById('inputBuildingFloors');
            if (floorsInput) floorsInput.value = '';
            const structureInput = document.getElementById('inputBuildingStructureType');
            if (structureInput) structureInput.value = '';
            const facilityInput = document.getElementById('inputBuildingFacilityGrade');
            if (facilityInput) facilityInput.value = '';
            const completionInput = document.getElementById('inputBuildingCompletionDate');
            if (completionInput) completionInput.value = '';
            const notesInput = document.getElementById('inputBuildingNotes');
            if (notesInput) notesInput.value = '';
            const dateInput = document.getElementById('inputBuildingDate');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            const typeInput = document.getElementById('inputBuildingInspectionType');
            if (typeInput) typeInput.value = '정밀안전점검';
            const yearInput = document.getElementById('inputBuildingInspectionYear');
            if (yearInput) yearInput.value = '2026년';
            const periodInput = document.getElementById('inputBuildingInspectionPeriod');
            if (periodInput) periodInput.value = '하반기';
            // 회차 화면에서 현장 추가가 아니라, 현장 목록에서 열릴 때 회차 기본값
            if (window.state.dashboardRoundKey) {
                const parts = String(window.state.dashboardRoundKey).split('_');
                if (yearInput && parts[0]) yearInput.value = parts[0];
                if (periodInput && parts.length > 1) periodInput.value = parts.slice(1).join('_');
            }

            const preview = document.getElementById('drawingSortPreview');
            if (preview) preview.innerHTML = '';
            window.selectedUploadedDrawings = [];
            window.drawingPreviewManualOrder = false;

            populateAddBuildingImportSources();
            setImportSourcePickerValue('selectImportSourceBuilding', '', { silent: true });
            updateImportSourceSummary(null);

            elements.addBuildingModal.style.display = 'flex';
            elements.addBuildingModal.classList.add('open');
            document.body.classList.add('add-building-modal-open');
            initAddBuildingScrollHost();
            const addScrollHost = document.getElementById('addBuildingScrollHost');
            if (addScrollHost) addScrollHost.scrollTop = 0;
            if (elements.addBuildingModal?._bsaSyncAddBuildingScrollHint) {
                requestAnimationFrame(() => elements.addBuildingModal._bsaSyncAddBuildingScrollHint());
            }
            if (window.BSA && window.BSA.resetMobileKeyboard) window.BSA.resetMobileKeyboard();
            // 터치(모바일/태블릿): 자동 포커스로 키보드가 뜨면 기본정보가 가려지므로 PC만 포커스
            const isTouchUi = (navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
            const focusEl = siteInput || nameInput;
            if (focusEl && !isTouchUi) setTimeout(() => focusEl.focus(), 80);
        }
    };

    window.closeAddBuildingModalFunc = function() {
        if (elements.addBuildingModal) {
            elements.addBuildingModal.style.display = 'none';
            elements.addBuildingModal.classList.remove('open');
        }
        document.body.classList.remove('add-building-modal-open');
        if (window.BSA && window.BSA.resetMobileKeyboard) window.BSA.resetMobileKeyboard();
    };

    function setAddBuildingMode(mode) {
        window._addBuildingMode = mode === 'import' ? 'import' : 'new';
        const isImport = window._addBuildingMode === 'import';
        const panel = document.getElementById('addBuildingImportPanel');
        if (panel) panel.hidden = !isImport;
        document.getElementById('btnAddModeNew')?.classList.toggle('active', !isImport);
        document.getElementById('btnAddModeImport')?.classList.toggle('active', isImport);
        document.getElementById('btnAddModeNew')?.setAttribute('aria-selected', !isImport ? 'true' : 'false');
        document.getElementById('btnAddModeImport')?.setAttribute('aria-selected', isImport ? 'true' : 'false');
        const basicDetails = document.getElementById('addBuildingBasicDetails');
        const inspectionDetails = document.getElementById('addBuildingInspectionDetails');
        if (isImport) {
            if (basicDetails) basicDetails.hidden = true;
            if (inspectionDetails) inspectionDetails.hidden = true;
            populateAddBuildingImportSources();
            setTimeout(() => document.getElementById('inputImportSourceBuildingSearch')?.focus(), 80);
        } else {
            if (basicDetails) basicDetails.hidden = false;
            if (inspectionDetails) inspectionDetails.hidden = false;
        }
    }

    function formatImportSourceBuildingLabel(b) {
        const meta = [b.inspectionYear, b.inspectionPeriod, b.inspectionType].filter(Boolean).join(' · ');
        return `${(b.name || '').replace(/^🏢\s*/, '')}${meta ? ` (${meta})` : ''}`;
    }

    function getImportSourceBuildingSearchText(b) {
        return [
            (b.name || '').replace(/^🏢\s*/, ''),
            b.address,
            b.inspectionYear,
            b.inspectionPeriod,
            b.inspectionType,
            b.notes
        ].filter(Boolean).join(' ').toLowerCase();
    }

    const _importSourcePickerCache = {};

    function getImportSourcePickerEls(hiddenId) {
        const hidden = document.getElementById(hiddenId);
        const wrap = hidden?.closest('.import-source-picker');
        if (!hidden || !wrap) return null;
        return {
            hidden,
            wrap,
            input: wrap.querySelector('.import-source-picker-input'),
            list: wrap.querySelector('.import-source-picker-list')
        };
    }

    function filterImportSourcePickerEntries(entries, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return entries;
        const tokens = q.split(/\s+/).filter(Boolean);
        return entries.filter(e => tokens.every(t => e.searchText.includes(t)));
    }

    function renderImportSourcePickerList(hiddenId, query) {
        const els = getImportSourcePickerEls(hiddenId);
        if (!els?.list) return;
        const cache = _importSourcePickerCache[hiddenId] || { entries: [] };
        const filtered = filterImportSourcePickerEntries(cache.entries, query);
        if (!filtered.length) {
            els.list.innerHTML = `<li class="import-source-picker-empty">${query.trim() ? '검색 결과 없음' : '가져올 점검이 없습니다'}</li>`;
            els.list.hidden = false;
            return;
        }
        els.list.innerHTML = filtered.map(e => (
            `<li><button type="button" class="import-source-picker-item" role="option" data-id="${escapeHtml(e.id)}">` +
            `<strong>${escapeHtml(e.label)}</strong>` +
            `<small>${escapeHtml(e.sub)}</small>` +
            `</button></li>`
        )).join('');
        els.list.hidden = false;
    }

    function closeImportSourcePickerList(hiddenId) {
        const els = getImportSourcePickerEls(hiddenId);
        if (els?.list) els.list.hidden = true;
    }

    function setImportSourcePickerValue(hiddenId, buildingId, options = {}) {
        const els = getImportSourcePickerEls(hiddenId);
        if (!els) return;
        const { silent = false } = options;
        const bldg = buildingId
            ? (window.state.buildings || []).find(b => b.id === buildingId)
            : null;
        els.hidden.value = bldg ? bldg.id : '';
        if (els.input) {
            els.input.value = bldg ? formatImportSourceBuildingLabel(bldg) : '';
        }
        closeImportSourcePickerList(hiddenId);
        if (!silent) {
            els.hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    function refreshImportSourcePickerEntries(hiddenId, excludeId) {
        const entries = (window.state.buildings || [])
            .filter(b => b.id !== excludeId)
            .map(b => ({
                id: b.id,
                label: formatImportSourceBuildingLabel(b),
                sub: b.address || '주소 미등록',
                searchText: getImportSourceBuildingSearchText(b)
            }));
        _importSourcePickerCache[hiddenId] = { entries, excludeId };
        const els = getImportSourcePickerEls(hiddenId);
        if (els?.hidden?.value && els.hidden.value === excludeId) {
            setImportSourcePickerValue(hiddenId, '', { silent: true });
        }
    }

    function initImportSourceSearchPicker(hiddenId) {
        const els = getImportSourcePickerEls(hiddenId);
        if (!els?.input || els.input.dataset.pickerInit) return;
        els.input.dataset.pickerInit = '1';

        const pickById = (id) => setImportSourcePickerValue(hiddenId, id);

        els.input.addEventListener('focus', () => {
            renderImportSourcePickerList(hiddenId, els.input.value);
        });

        els.input.addEventListener('input', () => {
            const typed = els.input.value;
            if (els.hidden.value) {
                const selected = (window.state.buildings || []).find(b => b.id === els.hidden.value);
                const selectedLabel = selected ? formatImportSourceBuildingLabel(selected) : '';
                if (typed !== selectedLabel) {
                    els.hidden.value = '';
                }
            }
            renderImportSourcePickerList(hiddenId, typed);
        });

        els.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeImportSourcePickerList(hiddenId);
                els.input.blur();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                const first = els.list?.querySelector('.import-source-picker-item[data-id]');
                if (first) pickById(first.getAttribute('data-id'));
            }
        });

        els.list?.addEventListener('mousedown', (e) => {
            const btn = e.target.closest('.import-source-picker-item[data-id]');
            if (!btn) return;
            e.preventDefault();
            pickById(btn.getAttribute('data-id'));
        });

        els.input.addEventListener('blur', () => {
            setTimeout(() => closeImportSourcePickerList(hiddenId), 140);
        });
    }

    function populateImportSourceSelect(selectId, excludeId) {
        initImportSourceSearchPicker(selectId);
        refreshImportSourcePickerEntries(selectId, excludeId);
    }

    function initAllImportSourceSearchPickers() {
        initImportSourceSearchPicker('selectImportSourceBuilding');
        initImportSourceSearchPicker('selectEditImportSource');
    }

    function populateAddBuildingImportSources() {
        populateImportSourceSelect('selectImportSourceBuilding');
    }

    function populateEditBuildingImportSources(excludeId) {
        populateImportSourceSelect('selectEditImportSource', excludeId);
    }

    function getAddBuildingImportOptions() {
        return {
            basicInfo: !!document.getElementById('chkImportBasicInfo')?.checked,
            floorsDrawings: !!document.getElementById('chkImportFloorsDrawings')?.checked,
            defects: !!document.getElementById('chkImportDefects')?.checked,
            ndt: !!document.getElementById('chkImportNdt')?.checked,
            mapStyles: !!document.getElementById('chkImportMapStyles')?.checked,
            defectRoundMode: getImportDefectRoundMode('importDefectRoundMode'),
            merge: false
        };
    }

    function getEditBuildingImportOptions() {
        const floorsDrawings = !!document.getElementById('chkEditImportFloorsDrawings')?.checked;
        const defects = !!document.getElementById('chkEditImportDefects')?.checked;
        const ndt = !!document.getElementById('chkEditImportNdt')?.checked;
        const mapStyles = !!document.getElementById('chkEditImportMapStyles')?.checked;
        return {
            basicInfo: false,
            floorsDrawings,
            defects,
            ndt,
            mapStyles,
            defectRoundMode: getImportDefectRoundMode('editImportDefectRoundMode'),
            merge: true,
            // 수정 화면에서 도면만 가져올 때는 같은 층의 기존 도면도 덮어쓴다
            overwriteDrawings: floorsDrawings && !defects && !ndt && !mapStyles
        };
    }

    function applyImportPresetDrawingsOnly(prefix) {
        const isEdit = prefix === 'edit';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
        if (isEdit) {
            set('chkEditImportFloorsDrawings', true);
            set('chkEditImportDefects', false);
            set('chkEditImportNdt', false);
            set('chkEditImportMapStyles', false);
        } else {
            set('chkImportBasicInfo', false);
            set('chkImportFloorsDrawings', true);
            set('chkImportDefects', false);
            set('chkImportNdt', false);
            set('chkImportMapStyles', false);
        }
    }

    function updateImportSourceSummary(sourceBldg, optsOverride) {
        const box = document.getElementById('importSourceSummary');
        const opts = optsOverride || getAddBuildingImportOptions();
        updateImportPreviewPanels(sourceBldg, sourceBldg ? opts : null, 'importPreviewDetail', 'importDefectRoundRow');
        if (!box) return;
        if (!sourceBldg) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }
        const floorCount = countImportSourceFloorCodes(sourceBldg);
        const defectCount = countBuildingDefects(sourceBldg);
        const ndtCount = countBuildingNdtFloors(sourceBldg);
        box.hidden = false;
        box.innerHTML =
            `<strong>${escapeHtml((sourceBldg.name || '').replace(/^🏢\s*/, ''))}</strong> · ` +
            `${escapeHtml(sourceBldg.address || '주소 미등록')}<br>` +
            `원본: 층 ${floorCount} · 결함 ${defectCount} · NDT ${ndtCount}`;
    }

    function updateEditImportPreview(sourceBldg) {
        const opts = sourceBldg ? getEditBuildingImportOptions() : null;
        updateImportPreviewPanels(sourceBldg, opts, 'editImportPreviewDetail', 'editImportDefectRoundRow');
    }

    function applyImportSourceToForm(sourceId) {
        const bldg = (window.state.buildings || []).find(b => b.id === sourceId);
        updateImportSourceSummary(bldg || null);
        if (!bldg) return;
        const opts = getAddBuildingImportOptions();
        if (!opts.basicInfo) return;

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val != null) el.value = val;
        };
        setVal('inputBuildingSiteName', getBuildingSiteName(bldg));
        setVal('inputBuildingDong', getBuildingDongLabel(bldg));
        setVal('inputBuildingName', composeBuildingDisplayName(getBuildingSiteName(bldg), getBuildingDongLabel(bldg)));
        setVal('inputBuildingAddress', bldg.address || '');
        setVal('inputBuildingInspector', bldg.inspector || window.state.userName || '');
        setVal('inputBuildingContactPhone', bldg.contactPhone || '');
        setVal('inputBuildingFloors', bldg.floors || '');
        setVal('inputBuildingStructureType', bldg.structureType || '');
        setVal('inputBuildingFacilityGrade', bldg.facilityGrade || '');
        setVal('inputBuildingCompletionDate', bldg.completionDate || '');
        setVal('inputBuildingNotes', bldg.notes || '');
        setVal('inputBuildingInspectionType', bldg.inspectionType || '정밀안전점검');
        setVal('inputBuildingInspectionYear', bldg.inspectionYear || '2026년');
        setVal('inputBuildingInspectionPeriod', bldg.inspectionPeriod || '하반기');
    }

    async function loadPhotoBlobForClone(pid) {
        if (!pid) return null;
        if (window._photoCache && window._photoCache[pid]) {
            maybeScheduleMigrateFromLocal(pid, window._photoCache[pid]);
            return window._photoCache[pid];
        }
        const fromIdb = await idbGet('photos', pid);
        if (fromIdb) {
            if (!window._photoCache) window._photoCache = {};
            window._photoCache[pid] = fromIdb;
            maybeScheduleMigrateFromLocal(pid, fromIdb);
            return fromIdb;
        }
        if (db && window.state.companyId) {
            try {
                const snap = await fetchPhotosDocIfAllowed(pid);
                if (!snap) return null;
                const url = await photoUrlFromCloudSnap(snap, pid);
                if (url) {
                    if (!window._photoCache) window._photoCache = {};
                    window._photoCache[pid] = url;
                    idbSetPhotoPreferDataUrl(pid, url);
                }
                return url;
            } catch (_e) {
                return null;
            }
        }
        return null;
    }

    async function cloneDefectPhotosForNewId(defect, newDefectId, onPhotoProgress) {
        const cloned = {};
        const curPhotos = (defect.photos && defect.photos.length)
            ? defect.photos.slice()
            : await Promise.all((defect.photoIds || []).map(loadPhotoBlobForClone));
        const prevPhotos = (defect.prevRoundPhotos && defect.prevRoundPhotos.length)
            ? defect.prevRoundPhotos.slice()
            : await Promise.all((defect.prevRoundPhotoIds || []).map(loadPhotoBlobForClone));

        const validCur = curPhotos.filter(Boolean);
        const validPrev = prevPhotos.filter(Boolean);
        const totalPhotos = validCur.length + validPrev.length;
        let photoIdx = 0;

        if (validCur.length > 0) {
            cloned.photos = validCur;
            cloned.photoIds = assignDefectPhotoIds(newDefectId, validCur, null);
            validCur.forEach((url, i) => {
                photoIdx++;
                onPhotoProgress?.(photoIdx, totalPhotos);
                const pid = cloned.photoIds[i];
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[pid] = url;
                idbSetPhotoPreferDataUrl(pid, url);
            });
        }
        if (validPrev.length > 0) {
            cloned.prevRoundPhotos = validPrev;
            cloned.prevRoundPhotoIds = assignDefectPhotoIds(newDefectId, validPrev, null, 'prev');
            validPrev.forEach((url, i) => {
                photoIdx++;
                onPhotoProgress?.(photoIdx, totalPhotos);
                const pid = cloned.prevRoundPhotoIds[i];
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[pid] = url;
                idbSetPhotoPreferDataUrl(pid, url);
            });
        }
        return cloned;
    }

    function countImportSourceFloorCodes(bldg) {
        if (!bldg) return 0;
        const codes = collectKnownFloorCodesForBuilding(bldg);
        if (codes.size > 0) return codes.size;
        return (bldg.floorsList && bldg.floorsList.length) || 0;
    }

    /** 다른 점검 가져오기: 원본 층 도면을 IDB·클라우드·현장 보관함에서 먼저 채운다. */
    async function ensureSourceFloorDrawingHydratedForClone(sourceBldg, floorCode) {
        if (!sourceBldg?.id || !floorCode) return;
        await hydrateFloorDrawingFromCloud(sourceBldg, floorCode, { localOnly: true });
        if (!floorHasDrawingData(sourceBldg, floorCode) && !sourceBldg.floorDrawingPdfs?.[floorCode]) {
            await hydrateFloorDrawingFromCloud(sourceBldg, floorCode, {});
        }
        if (!sourceBldg.floorDrawingPdfs?.[floorCode] && typeof resolveBuildingFloorPdf === 'function') {
            let pdf = await resolveBuildingFloorPdf(sourceBldg, floorCode, { localOnly: true });
            if (!pdf && navigator.onLine !== false) {
                pdf = await resolveBuildingFloorPdf(sourceBldg, floorCode, { forceCloud: true });
            }
            if (pdf) await applyResolvedPdfToBuilding(sourceBldg, floorCode, pdf);
        }
        await hydrateFloorDrawingTiersForFloor(sourceBldg, floorCode, { localOnly: true });
        if (navigator.onLine !== false) {
            await hydrateFloorDrawingTiersForFloor(sourceBldg, floorCode, {});
        }
    }

    async function collectSourceFloorTiersForClone(sourceBldg, floorCode) {
        const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
        const out = {};
        const mem = sourceBldg.floorDrawingTiers && sourceBldg.floorDrawingTiers[floorCode];
        if (mem && typeof mem === 'object') {
            Object.entries(mem).forEach(([dim, url]) => {
                if (isUsableRasterDrawingUrl(url)) out[String(dim)] = url;
            });
        }
        for (const dim of dims) {
            const dimKey = String(dim);
            if (isUsableRasterDrawingUrl(out[dimKey])) continue;
            let url = await idbGetFloorDrawingTier(sourceBldg.id, floorCode, dim);
            if (!isUsableRasterDrawingUrl(url) && navigator.onLine !== false
                && typeof fetchAndCacheCloudFloorDrawingTier === 'function') {
                url = await fetchAndCacheCloudFloorDrawingTier(sourceBldg, floorCode, dim);
            }
            if (isUsableRasterDrawingUrl(url)) out[dimKey] = url;
        }
        return Object.keys(out).length ? out : null;
    }

    async function copyFloorDrawingTierAssetsToTarget(targetBldg, newBuildingId, floorCode, tiers) {
        if (!tiers || !targetBldg || !newBuildingId || !floorCode) return;
        if (!targetBldg.floorDrawingTiers) targetBldg.floorDrawingTiers = {};
        targetBldg.floorDrawingTiers[floorCode] = { ...tiers };
        for (const [dim, url] of Object.entries(tiers)) {
            if (!isUsableRasterDrawingUrl(url)) continue;
            const tierKey = floorDrawingTierIdbKey(newBuildingId, floorCode, dim);
            await idbSet('floorDrawingTiers', tierKey, url);
            _idbPersistedTierKeys.add(tierKey);
        }
        await uploadFloorDrawingTiers(newBuildingId, floorCode, targetBldg.floorDrawingTiers[floorCode]);
        const base = tiers['4000'] || tiers[4000];
        if (!isUsableRasterDrawingUrl(base)) return;
        if (!targetBldg.floorDrawings) targetBldg.floorDrawings = {};
        targetBldg.floorDrawings[floorCode] = base;
        const newKey = `${newBuildingId}_${floorCode}`;
        await idbSet('floorDrawings', newKey, base);
        _idbPersistedDrawingKeys.add(newKey);
        await uploadFloorDrawing(newBuildingId, floorCode, base);
    }

    async function cloneFloorDrawingsFromSource(sourceBldg, newBuildingId, targetBldg, options, onProgress) {
        if (!sourceBldg || !newBuildingId || !targetBldg) return;
        options = options || {};
        const overwrite = !!options.overwriteDrawings;
        const merge = !!options.merge;

        const floorCodes = collectKnownFloorCodesForBuilding(sourceBldg);
        if (!floorCodes.size && sourceBldg.floorsList?.length) {
            sourceBldg.floorsList.forEach((f) => { if (f?.floorCode) floorCodes.add(f.floorCode); });
        }
        // 2026-10-20 층 옮기기: 고른 층만 복사(options.floorCodes)
        const onlyCodes = Array.isArray(options.floorCodes) ? new Set(options.floorCodes.map(String)) : null;

        if (!targetBldg.floorDrawings) targetBldg.floorDrawings = {};
        if (!targetBldg.floorDrawingPdfs) targetBldg.floorDrawingPdfs = {};
        if (!targetBldg.floorDrawingTiers) targetBldg.floorDrawingTiers = {};
        if (!targetBldg.floorDrawingSources) targetBldg.floorDrawingSources = {};

        const list = [...floorCodes].filter((fc) => !onlyCodes || onlyCodes.has(String(fc)));
        let done = 0;
        for (const fc of list) {
            done += 1;
            onProgress?.(`도면 복사 ${done}/${list.length || done} (${fc})…`);

            await ensureSourceFloorDrawingHydratedForClone(sourceBldg, fc);

            const hasTarget = floorHasDrawingData(targetBldg, fc)
                || !!(targetBldg.floorDrawingPdfs && targetBldg.floorDrawingPdfs[fc]);
            if (merge && hasTarget && !overwrite) continue;

            const oldKey = `${sourceBldg.id}_${fc}`;
            const newKey = `${newBuildingId}_${fc}`;

            const tiers = await collectSourceFloorTiersForClone(sourceBldg, fc);
            if (tiers) {
                await copyFloorDrawingTierAssetsToTarget(targetBldg, newBuildingId, fc, tiers);
            } else if (overwrite || !isUsableRasterDrawingUrl(targetBldg.floorDrawings?.[fc])) {
                let raster = sourceBldg.floorDrawings?.[fc];
                if (!isUsableRasterDrawingUrl(raster)) raster = await idbGet('floorDrawings', oldKey);
                if (!isUsableRasterDrawingUrl(raster)) {
                    raster = await idbGetFloorDrawingTier(sourceBldg.id, fc, 4000);
                }
                if (!isUsableRasterDrawingUrl(raster) && navigator.onLine !== false
                    && typeof fetchCloudFloorDrawingDataUrl === 'function') {
                    raster = await fetchCloudFloorDrawingDataUrl(sourceBldg.id, fc);
                }
                if (isUsableRasterDrawingUrl(raster)) {
                    targetBldg.floorDrawings[fc] = raster;
                    await idbSet('floorDrawings', newKey, raster);
                    _idbPersistedDrawingKeys.add(newKey);
                    await uploadFloorDrawing(newBuildingId, fc, raster);
                }
            }

            if (overwrite || !targetBldg.floorDrawingPdfs?.[fc]) {
                let pdf = sourceBldg.floorDrawingPdfs?.[fc];
                if (!pdf) pdf = await idbGet('floorDrawingPdfs', oldKey);
                if (!pdf && typeof resolveBuildingFloorPdf === 'function') {
                    pdf = await resolveBuildingFloorPdf(sourceBldg, fc, { localOnly: true });
                    if (!pdf && navigator.onLine !== false) {
                        pdf = await resolveBuildingFloorPdf(sourceBldg, fc, { forceCloud: true });
                    }
                }
                if (pdf) {
                    await applyResolvedPdfToBuilding(targetBldg, fc, pdf);
                    await uploadFloorDrawingPdf(newBuildingId, fc, pdf);
                }
            }

            if (overwrite || !targetBldg.floorDrawingSources?.[fc]) {
                let srcUrl = sourceBldg.floorDrawingSources?.[fc];
                if (!srcUrl) srcUrl = await idbGet('floorDrawingSources', oldKey);
                if (srcUrl) {
                    targetBldg.floorDrawingSources[fc] = srcUrl;
                    await idbSet('floorDrawingSources', newKey, srcUrl);
                    _idbPersistedSourceKeys.add(newKey);
                }
            }
        }

        const srcFloorsList = (sourceBldg.floorsList || []).filter((f) => !onlyCodes || (f && onlyCodes.has(String(f.floorCode))));
        if (!targetBldg.floorsList?.length && srcFloorsList.length) {
            targetBldg.floorsList = JSON.parse(JSON.stringify(srcFloorsList));
        } else if (srcFloorsList.length) {
            const existing = new Set((targetBldg.floorsList || []).map((f) => f.floorCode));
            srcFloorsList.forEach((f) => {
                if (!f?.floorCode || existing.has(f.floorCode)) return;
                if (!targetBldg.floorsList) targetBldg.floorsList = [];
                targetBldg.floorsList.push(JSON.parse(JSON.stringify(f)));
                existing.add(f.floorCode);
            });
            if (typeof window.sortFloorsLowToHigh === 'function' && !targetBldg.floorsOrderManual) {
                targetBldg.floorsList = window.sortFloorsLowToHigh(targetBldg.floorsList);
            }
        }
        if (!targetBldg.floors && sourceBldg.floors) {
            targetBldg.floors = sourceBldg.floors;
        }
        if (typeof syncBuildingDrawingFloorCodes === 'function') {
            syncBuildingDrawingFloorCodes(targetBldg);
        }
    }

    async function cloneBuildingDataFromSource(sourceBldg, targetBldg, options, onProgress) {
        if (!sourceBldg || !targetBldg || !options) return;
        const srcPrefix = `${sourceBldg.id}_`;
        const newId = targetBldg.id;
        const merge = !!options.merge;
        const roundMode = options.defectRoundMode || 'keep';

        if (options.floorsDrawings) {
            onProgress?.('도면 복사 중…');
            await cloneFloorDrawingsFromSource(sourceBldg, newId, targetBldg, options, onProgress);
            if (merge && sourceBldg.floorsList?.length) {
                const existing = new Set((targetBldg.floorsList || []).map(f => f.floorCode));
                sourceBldg.floorsList.forEach((f) => {
                    if (!existing.has(f.floorCode)) {
                        if (!targetBldg.floorsList) targetBldg.floorsList = [];
                        targetBldg.floorsList.push(JSON.parse(JSON.stringify(f)));
                        existing.add(f.floorCode);
                    }
                });
                if (!targetBldg.floorsOrderManual && !sourceBldg.floorsOrderManual) {
                    targetBldg.floorsList = window.sortFloorsLowToHigh(targetBldg.floorsList);
                }
            }
        }

        if (options.defects) {
            if (!window.state.defects) window.state.defects = {};
            const srcKeys = Object.keys(window.state.defects).filter(k => k.startsWith(srcPrefix));
            let defectDone = 0;
            let defectTotal = 0;
            srcKeys.forEach((k) => {
                defectTotal += (window.state.defects[k] || []).length;
            });

            for (const srcKey of srcKeys) {
                const floorCode = srcKey.slice(srcPrefix.length);
                const newKey = `${newId}_${floorCode}`;
                const srcDefects = window.state.defects[srcKey] || [];
                const clonedList = [];
                for (const d of srcDefects) {
                    if (!d) continue;
                    defectDone++;
                    onProgress?.(`결함 복사 ${defectDone}/${defectTotal || defectDone}…`);
                    const copy = JSON.parse(JSON.stringify(d));
                    copy.id = generateDefectUniqueId(newKey);
                    delete copy.photos;
                    delete copy.prevRoundPhotos;
                    delete copy.photoIds;
                    delete copy.prevRoundPhotoIds;
                    if (roundMode === 'carryOver') {
                        const srcRound = getBuildingSurveyRoundKey(sourceBldg);
                        const dstRound = getBuildingSurveyRoundKey(targetBldg);
                        if (srcRound && (!copy.surveyRound || copy.surveyRound === dstRound)) {
                            copy.surveyRound = srcRound;
                        }
                    }
                    applyDefectRoundModeToClone(copy, roundMode, targetBldg);
                    const photoFields = await cloneDefectPhotosForNewId(d, copy.id, (pi, pt) => {
                        onProgress?.(`사진 ${pi}/${pt} (결함 ${defectDone}/${defectTotal})…`);
                    });
                    Object.assign(copy, photoFields);
                    if (roundMode === 'carryOver') applyImportedCarryOverPhotos(copy);
                    clonedList.push(copy);
                }
                if (clonedList.length > 0) {
                    if (merge && window.state.defects[newKey]?.length) {
                        window.state.defects[newKey] = window.state.defects[newKey].concat(clonedList);
                    } else {
                        window.state.defects[newKey] = clonedList;
                    }
                }
            }
            if (typeof uploadInlineDefectPhotosForSync === 'function') {
                onProgress?.('사진 동기화 준비…');
                const subset = {};
                Object.keys(window.state.defects).filter(k => k.startsWith(`${newId}_`)).forEach(k => {
                    subset[k] = window.state.defects[k];
                });
                await uploadInlineDefectPhotosForSync(subset);
            }
        }

        if (options.ndt) {
            if (!window.state.ndtData) window.state.ndtData = {};
            Object.keys(window.state.ndtData).forEach((k) => {
                if (!k.startsWith(srcPrefix)) return;
                const floorCode = k.slice(srcPrefix.length);
                const destKey = `${newId}_${floorCode}`;
                const cloned = JSON.parse(JSON.stringify(window.state.ndtData[k]));
                if (merge && window.state.ndtData[destKey]) {
                    // 객체 스프레드를 쓰면 배열이 {0:…,1:…} 객체로 바뀌고 같은 인덱스가 덮어써진다
                    window.state.ndtData[destKey] =
                        (window.state.ndtData[destKey] || []).concat(cloned);
                } else {
                    window.state.ndtData[destKey] = cloned;
                }
            });
            if (!window.state.ndtDisplacementGroups) window.state.ndtDisplacementGroups = {};
            Object.keys(window.state.ndtDisplacementGroups).forEach((k) => {
                if (!k.startsWith(srcPrefix)) return;
                const floorCode = k.slice(srcPrefix.length);
                const destKey = `${newId}_${floorCode}`;
                const cloned = JSON.parse(JSON.stringify(window.state.ndtDisplacementGroups[k]));
                if (merge && window.state.ndtDisplacementGroups[destKey]) {
                    window.state.ndtDisplacementGroups[destKey] =
                        (window.state.ndtDisplacementGroups[destKey] || []).concat(cloned);
                } else {
                    window.state.ndtDisplacementGroups[destKey] = cloned;
                }
            });
        }

        if (options.mapStyles && window.state.floorMapStyleSettings) {
            if (!window.state.floorMapStyleSettings) window.state.floorMapStyleSettings = {};
            Object.keys(window.state.floorMapStyleSettings).forEach((k) => {
                if (!k.startsWith(srcPrefix)) return;
                const floorCode = k.slice(srcPrefix.length);
                const destKey = `${newId}_${floorCode}`;
                if (merge && window.state.floorMapStyleSettings[destKey]) return;
                const saved = window.state.floorMapStyleSettings[k];
                if (!saved) return;
                window.state.floorMapStyleSettings[destKey] = {
                    styleSizes: cloneStyleSizesMap(saved.styleSizes)
                };
            });
        }

        if (options.mapStyles && window.state.floorDrawingRotations) {
            if (!window.state.floorDrawingRotations) window.state.floorDrawingRotations = {};
            Object.keys(window.state.floorDrawingRotations).forEach((k) => {
                if (!k.startsWith(srcPrefix)) return;
                const floorCode = k.slice(srcPrefix.length);
                const destKey = `${newId}_${floorCode}`;
                if (merge && Object.prototype.hasOwnProperty.call(window.state.floorDrawingRotations, destKey)) return;
                const angle = window.state.floorDrawingRotations[k];
                if (angle === undefined || angle === null) return;
                window.state.floorDrawingRotations[destKey] = angle;
            });
        }
    }

    async function runBuildingImport(sourceBldg, targetBldg, importOpts, label) {
        window.showLoading(`${label || '데이터'} 복사 중…`);
        try {
            await cloneBuildingDataFromSource(sourceBldg, targetBldg, importOpts, (msg) => {
                if (typeof window.updateLoadingText === 'function') window.updateLoadingText(msg);
            });
            if (importOpts.floorsDrawings && typeof persistBuildingDrawingAssetsNow === 'function') {
                await persistBuildingDrawingAssetsNow(targetBldg);
            }
            saveStateToLocalStorage();
            await syncAfterImportWithRetry(label || '가져오기');
        } catch (err) {
            console.error('점검 데이터 복사 오류:', err);
            window.showToast('일부 데이터 복사에 실패했습니다. 내용을 확인해 주세요.', 'warning', 5500);
            throw err;
        } finally {
            window.hideLoading();
        }
    }

    // "지상 3층 (3F)" 같은 라벨에서 뒤에 붙은 층 코드 괄호만 떼어낸다.
    // "필로티층"처럼 사용자가 직접 입력해 괄호/공백이 없는 라벨도 그대로 안전하게 통과시키기 위함
    function stripFloorCodeSuffix(label) {
        const cleaned = (label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        return cleaned || label || '';
    }

    // Listening for Add Modal Multi-Drawing Uploads
    function updateNewBuildingFloorsSummary() {
        const floorsInput = document.getElementById('inputBuildingFloors');
        const items = window.selectedUploadedDrawings || [];
        if (floorsInput && items.length > 0) {
            const sorted = [...items].sort((a, b) => a.rank - b.rank);
            const lowest = sorted[0];
            const highest = sorted[sorted.length - 1];
            floorsInput.value = `${stripFloorCodeSuffix(highest.floorLabel)} ~ ${stripFloorCodeSuffix(lowest.floorLabel)}`;
        }
    }

    // 도면 파일에 지정할 층을 드롭다운에서 고를 때 호출. "➕ 직접 입력"을 고르면 사용자가 입력한
    // 이름을 그대로 floorCode/floorLabel로 써서, 필로티·기계실·중2층처럼 정해진 목록에 없는
    // 층 이름도 자유롭게 등록할 수 있게 한다. 취소/빈 입력이면 이전 값 그대로 둔다.
    async function applyFloorSelectValue(item, code) {
        if (code === '__CUSTOM_FLOOR__') {
            const typed = await window.appPrompt('층 이름을 직접 입력하세요 (예: 필로티층, 기계실, 중2층):', item.floorLabel || '');
            if (!typed || !typed.trim()) return false;
            const trimmed = typed.trim();
            item.floorCode = trimmed;
            item.floorLabel = trimmed;
            item.rank = window.getFloorRankFromCode(trimmed);
            item.matched = true;
            const editing = window.currentEditingBuilding;
            if (editing) markFloorOrderManual(editing, true);
            window.drawingPreviewManualOrder = true;
            window.editDrawingPreviewManualOrder = true;
            return true;
        }
        if (code === window.EXT_NEXT_OPTION) {
            // 「외부 (자동 번호)」: 이 건물에 이미 있는 외부·이번에 고른 외부와 겹치지 않는 다음 번호(외부1, 외부2…)
            const fi = window.BSA && window.BSA.floorIdentity;
            const used = [];
            (window.selectedUploadedDrawings || []).concat(window.selectedEditUploadedDrawings || [])
                .forEach((it) => { if (it && it !== item && it.floorCode) used.push(it.floorCode); });
            const editing = window.currentEditingBuilding;
            if (editing && typeof window.getBuildingAvailableFloors === 'function') {
                (window.getBuildingAvailableFloors(editing) || []).forEach((f) => { if (f && f.floorCode) used.push(f.floorCode); });
            }
            const next = (fi && typeof fi.allocateNextExteriorSerial === 'function')
                ? fi.allocateNextExteriorSerial(used)
                : { floorCode: 'EXT_' + Date.now(), floorLabel: '외부', rank: 10000 };
            item.floorCode = next.floorCode;
            item.floorLabel = next.floorLabel;
            item.rank = next.rank;
            item.matched = true;
            return true;
        }
        item.floorCode = code;
        item.floorLabel = window.getFloorLabelFromCode(code);
        item.rank = window.getFloorRankFromCode(code);
        item.matched = true; // 사용자가 직접 지정했으므로 신뢰 가능
        return true;
    }

    // 도면 불러오기 목록은 위→아래 지붕층·옥상 → 지상 높은 층 → 낮은 층 → 지하(외부는 맨 끝). 저장 순서(저층→고층)는 그대로.
    // 직접 끌어 바꾼 뒤(수동 순서)에는 목록을 그대로 뒤집어 보여 주고, 끌어 놓은 결과도 다시 뒤집어 저장한다.
    function drawingPreviewDisplayGroups(groups, manual) {
        const fi = window.BSA && window.BSA.floorIdentity;
        if (!manual && fi && typeof fi.displayOrderFromAscending === 'function') {
            const tagged = groups.map((g) => ({
                floorCode: g.floorCode,
                floorLabel: (g.entries[0] && g.entries[0].item && g.entries[0].item.floorLabel) || '',
                g
            }));
            return fi.displayOrderFromAscending(tagged).map((x) => x.g);
        }
        return groups.slice().reverse();
    }

    // 업로드된 파일들을 인식된 층(floorCode)별로 묶어서 [{floorCode, entries:[{item, idx}]}] 형태로 반환.
    // 같은 층으로 인식된 파일이 여러 개면 미리보기에서 "따로따로 놓인 층"이 아니라 "한 층 안에 묶인 후보 파일들"로 보이게 하기 위함
    function groupDrawingItemsByFloor(items) {
        const order = [];
        const map = {};
        items.forEach((item, idx) => {
            if (!map[item.floorCode]) {
                map[item.floorCode] = [];
                order.push(item.floorCode);
            }
            map[item.floorCode].push({ item, idx });
        });
        return order.map(code => ({ floorCode: code, entries: map[code] }));
    }

    function reorderDrawingItemsByFloorOrder(items, floorCodesInOrder) {
        const byFloor = {};
        items.forEach((item) => {
            if (!byFloor[item.floorCode]) byFloor[item.floorCode] = [];
            byFloor[item.floorCode].push(item);
        });
        const result = [];
        floorCodesInOrder.forEach((code) => {
            (byFloor[code] || []).forEach((item) => result.push(item));
        });
        Object.keys(byFloor).forEach((code) => {
            if (!floorCodesInOrder.includes(code)) {
                byFloor[code].forEach((item) => result.push(item));
            }
        });
        return result;
    }

    function bindDrawingPreviewListDrag(listEl, rowSelector, onCommitOrder) {
        if (!listEl || typeof onCommitOrder !== 'function') return;
        const handles = listEl.querySelectorAll('.add-drawing-drag-handle');
        handles.forEach((handle) => {
            handle.addEventListener('pointerdown', (e) => {
                if (e.button != null && e.button !== 0) return;
                const row = handle.closest(rowSelector);
                if (!row || !listEl.contains(row)) return;
                e.preventDefault();
                e.stopPropagation();

                const rowRect = row.getBoundingClientRect();
                let listRect = listEl.getBoundingClientRect();
                const offsetY = e.clientY - rowRect.top;
                // 2026-10-14 목록이 길어 창이 스크롤되면 위·아래 끝 근처에서 자동으로 스크롤
                const findScroller = (el) => {
                    for (let n = el; n && n !== document.body; n = n.parentElement) {
                        const oy = getComputedStyle(n).overflowY;
                        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
                    }
                    return document.scrollingElement || document.documentElement;
                };
                const scroller = findScroller(listEl.parentElement);
                let lastY = e.clientY;
                let scrollRaf = 0;
                const placeholder = document.createElement('div');
                placeholder.className = 'add-drawing-preview-placeholder';
                placeholder.style.height = `${rowRect.height}px`;
                listEl.insertBefore(placeholder, row.nextSibling);

                row.classList.add('is-dragging');
                listEl.classList.add('is-reordering');
                row.style.width = `${rowRect.width}px`;
                row.style.left = `${rowRect.left}px`;
                row.style.top = `${rowRect.top}px`;
                row.style.position = 'fixed';
                row.style.zIndex = '10050';
                row.style.pointerEvents = 'none';
                row.style.margin = '0';
                document.body.appendChild(row);

                handle.setPointerCapture(e.pointerId);

                const moveRowToY = (clientY) => {
                    listRect = listEl.getBoundingClientRect();
                    const top = clientY - offsetY;
                    const minTop = listRect.top - rowRect.height * 0.35;
                    const maxTop = listRect.bottom - rowRect.height * 0.65;
                    row.style.top = `${Math.max(minTop, Math.min(maxTop, top))}px`;

                    const probeY = clientY;
                    const rows = Array.from(listEl.querySelectorAll(`${rowSelector}:not(.is-dragging)`));
                    rows.forEach((other) => other.classList.remove('is-drop-target'));
                    let inserted = false;
                    for (const other of rows) {
                        const r = other.getBoundingClientRect();
                        const mid = r.top + r.height / 2;
                        if (probeY < mid) {
                            listEl.insertBefore(placeholder, other);
                            other.classList.add('is-drop-target');
                            inserted = true;
                            break;
                        }
                    }
                    if (!inserted) listEl.appendChild(placeholder);
                };
                moveRowToY(e.clientY);

                const autoScrollTick = () => {
                    scrollRaf = 0;
                    const isDoc = scroller === document.scrollingElement || scroller === document.documentElement;
                    const r = isDoc ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
                    const edge = 56;
                    let dy = 0;
                    if (lastY < r.top + edge) dy = -Math.ceil((r.top + edge - lastY) / 4);
                    else if (lastY > r.bottom - edge) dy = Math.ceil((lastY - (r.bottom - edge)) / 4);
                    if (!dy) return;
                    const before = scroller.scrollTop;
                    scroller.scrollTop = before + dy;
                    if (scroller.scrollTop !== before) moveRowToY(lastY);
                    scrollRaf = requestAnimationFrame(autoScrollTick);
                };
                const onMove = (ev) => {
                    lastY = ev.clientY;
                    moveRowToY(ev.clientY);
                    if (!scrollRaf) scrollRaf = requestAnimationFrame(autoScrollTick);
                };
                const onUp = () => {
                    if (scrollRaf) { cancelAnimationFrame(scrollRaf); scrollRaf = 0; }
                    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                    handle.removeEventListener('pointercancel', onUp);

                    listEl.insertBefore(row, placeholder);
                    placeholder.remove();
                    row.classList.remove('is-dragging');
                    listEl.classList.remove('is-reordering');
                    row.style.cssText = '';
                    listEl.querySelectorAll(`${rowSelector}.is-drop-target`).forEach((r) => r.classList.remove('is-drop-target'));

                    const floorCodes = Array.from(listEl.querySelectorAll(rowSelector))
                        .map((r) => r.dataset.floorCode)
                        .filter(Boolean);
                    onCommitOrder(floorCodes);
                };
                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
                handle.addEventListener('pointercancel', onUp);
            });
        });
    }

    function drawingPreviewDragHandleHtml(floorCode, floorLabel) {
        const label = floorLabel
            || (typeof window.getFloorLabelFromCode === 'function'
                ? window.getFloorLabelFromCode(floorCode)
                : floorCode);
        return `<button type="button" class="add-drawing-drag-handle" aria-label="드래그하여 ${escapeHtml(label)} 순서 변경" title="드래그하여 순서 변경">
            <i class="fa-solid fa-grip-vertical"></i>
        </button>
        <span class="add-drawing-preview-floor">${escapeHtml(label)}</span>`;
    }

    function renderNewBuildingDrawingPreview() {
        const preview = document.getElementById('drawingSortPreview');
        if (!preview) return;
        const items = window.selectedUploadedDrawings || [];

        const hasUnmatched = items.some(it => it.matched === false);
        const groups = groupDrawingItemsByFloor(items);
        const hasDuplicate = groups.some(g => g.entries.length > 1);

        let warningHtml = '';
        if (hasUnmatched || hasDuplicate) {
            warningHtml = `<div class="add-drawing-preview-warning">
                ${hasUnmatched ? '⚠️ 파일명에서 층을 못 찾은 파일이 있습니다. 아래 목록에서 층을 고르기 전에는 저장되지 않습니다.' : ''}
                ${hasDuplicate ? '<br>같은 층으로 묶인 파일은 "이 파일 저장" 버튼으로 고른 파일 하나만 실제로 저장됩니다.' : ''}
            </div>`;
        }

        const singleRowHtml = (item, idx, floorCode) => `
            <div class="add-drawing-preview-row is-draggable${item.matched === false ? ' is-warning' : ''}" data-floor-code="${escapeHtml(floorCode)}">
                ${drawingPreviewDragHandleHtml(floorCode, item.floorLabel)}
                <span class="add-drawing-preview-name" title="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</span>
                <select class="form-control drawing-floor-select" data-idx="${idx}" style="width:auto; font-size:0.78rem; padding:0.2rem 0.4rem;">
                    ${window.buildFloorCodeOptionsHtml(item.floorCode, null, item.floorLabel)}
                </select>
            </div>`;

        const groupHtml = (g) => {
            if (g.entries.length === 1) return singleRowHtml(g.entries[0].item, g.entries[0].idx, g.floorCode);
            const floorLabel = (g.entries[0] && g.entries[0].item && g.entries[0].item.floorLabel)
                || window.getFloorLabelFromCode(g.floorCode);
            return `
                <div class="add-drawing-preview-row is-duplicate-group is-draggable" data-floor-code="${escapeHtml(g.floorCode)}">
                    ${drawingPreviewDragHandleHtml(g.floorCode, floorLabel)}
                    <div style="width:100%; min-width:0;">
                        <div class="add-drawing-preview-title">${floorLabel} — 파일 ${g.entries.length}개 · 저장할 파일 하나를 선택</div>
                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                        ${g.entries.map(({ item, idx }, i) => {
                            const isFinal = i === g.entries.length - 1;
                            return `
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem; padding:0.2rem 0;">
                                <span class="add-drawing-preview-name" style="color:${isFinal ? '#16a34a' : '#64748b'};" title="${escapeHtml(item.fileName)}">
                                    ${isFinal ? '✅' : '⬜'} ${escapeHtml(item.fileName)}${isFinal ? ' (저장됨)' : ''}
                                </span>
                                ${!isFinal ? `<button type="button" class="btn btn-sm btn-outline pick-final-drawing" data-idx="${idx}" style="font-size:0.68rem; padding:0.1rem 0.5rem; flex-shrink:0;">이 파일 저장</button>` : ''}
                                <select class="form-control drawing-floor-select" data-idx="${idx}" style="width:auto; font-size:0.72rem; padding:0.15rem 0.3rem; flex-shrink:0;">
                                    ${window.buildFloorCodeOptionsHtml(item.floorCode, null, item.floorLabel)}
                                </select>
                            </div>`;
                        }).join('')}
                        </div>
                    </div>
                </div>`;
        };

        preview.innerHTML = `
            <div class="add-drawing-preview-title">총 ${items.length}개 도면 파일 · 층을 확인해 주세요${groups.length > 1 ? ' · <span class="add-drawing-preview-drag-hint">⠿ 드래그로 순서 변경</span>' : ''}</div>
            ${warningHtml}
            <div class="add-drawing-preview-list">
                ${drawingPreviewDisplayGroups(groups, !!window.drawingPreviewManualOrder).map(groupHtml).join('')}
            </div>
        `;

        if (groups.length > 1) {
            const listEl = preview.querySelector('.add-drawing-preview-list');
            bindDrawingPreviewListDrag(listEl, '.add-drawing-preview-row.is-draggable', (floorCodes) => {
                window.selectedUploadedDrawings = reorderDrawingItemsByFloorOrder(
                    window.selectedUploadedDrawings || [],
                    floorCodes.slice().reverse()
                );
                window.drawingPreviewManualOrder = true;
                updateNewBuildingFloorsSummary();
                renderNewBuildingDrawingPreview();
            });
        }

        preview.querySelectorAll('.drawing-floor-select').forEach(sel => {
            sel.addEventListener('change', async (ev) => {
                const idx = parseInt(ev.target.dataset.idx, 10);
                const item = (window.selectedUploadedDrawings || [])[idx];
                if (!item) return;
                await applyFloorSelectValue(item, ev.target.value);
                updateNewBuildingFloorsSummary();
                renderNewBuildingDrawingPreview();
            });
        });
        preview.querySelectorAll('.pick-final-drawing').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const idx = parseInt(ev.currentTarget.dataset.idx, 10);
                const arr = window.selectedUploadedDrawings || [];
                const item = arr[idx];
                if (!item) return;
                arr.splice(idx, 1);
                arr.push(item); // 배열 맨 뒤로 보내면 저장 루프에서 이 파일이 마지막으로 처리되어 실제로 저장됨
                renderNewBuildingDrawingPreview();
            });
        });
    }

    // 업로드 파일 → 층 코드. 인식 실패는 1F로 몰지 않고 파일 이름 그대로 새 층(중복이면 -2, -3).
    /**
     * 2026-11-02 도면 파일 이름에서 층을 못 찾은 파일(matched === false)은 파일 이름이 그대로 층 이름·코드가 되어
     * 상태조사표 번호가 「파일이름-1」로 나왔다. 층을 직접 고르기 전에는 저장하지 않는다.
     * 막았으면 true(저장 중단). 층을 고르면(applyFloorSelectValue가 matched = true) 풀린다.
     */
    async function blockSaveForUnassignedDrawingFloors(items) {
        const bad = (items || []).filter((it) => it && it.matched === false);
        if (!bad.length) return false;
        const lines = bad.slice(0, 6).map((it) => `· ${it.fileName}`).join('\n') + (bad.length > 6 ? `\n· 외 ${bad.length - 6}개` : '');
        const msg = `층을 못 찾은 도면이 ${bad.length}개 있습니다.\n\n${lines}\n\n`
            + `파일 이름은 층 이름·번호가 될 수 없습니다. 각 도면 오른쪽의 층 목록에서 층을 골라 주세요.\n`
            + `(목록에 없는 층은 「➕ 층 이름 직접 입력」)`;
        if (typeof window.appAlert === 'function') await window.appAlert(msg, { title: '층을 먼저 고르세요' });
        else window.showToast?.('층을 못 찾은 도면이 있습니다. 층을 골라 주세요.', 'warning', 5000);
        return true;
    }

    function assignDrawingUploadItems(files, usedCodes) {
        const used = (usedCodes || []).slice();
        const fi = window.BSA && window.BSA.floorIdentity;
        const items = Array.from(files || []).map((file) => {
            const info = window.parseFloorInfoFromFilename(file.name);
            const assigned = (fi && typeof fi.assignParsedFloorForUpload === 'function')
                ? fi.assignParsedFloorForUpload(info, used)
                : info;
            if (assigned && assigned.floorCode) used.push(assigned.floorCode);
            return {
                file: file,
                fileName: file.name,
                rank: assigned.rank,
                floorCode: assigned.floorCode,
                floorLabel: assigned.floorLabel,
                matched: assigned.matched
            };
        });
        applySoleExteriorFileLabel(items, usedCodes);
        return items;
    }

    /**
     * 외부 도면을 등록할 때 층 이름 정하기(코드는 EXT_1·EXT_2… 그대로, 이름만).
     *
     * 2026-11-08 파일 이름에 번호가 없는 외부 도면(「건축물 외부.pdf」「본관동 외부 입면도.pdf」)은
     * 파일 이름을 버리고 무조건 「외부1」로 잡혀, 한글 위치도 캡션도 「외부1 상태조사위치도」로 나왔다.
     * 이제 파일 이름(확장자 뺀 것)을 층 이름으로 쓴다. 다만
     *  - 파일 이름에 번호가 있으면(외부2.pdf·EXT_3.pdf) 예전처럼 외부2·외부3
     *  - 이름이 다른 층·같이 넣은 도면과 겹치거나, 40자를 넘으면 외부N 그대로
     *  - 파일 이름이 딱 「외부」: 한 장만이면 「외부」(2026-11-06), 외부 도면이 여럿이면 외부1·외부2
     * 이미 등록된 층의 이름은 건드리지 않는다(바꾸려면 「층 이름 바꾸기」).
     */
    function applySoleExteriorFileLabel(items, usedCodes) {
        const fi = window.BSA && window.BSA.floorIdentity;
        const isExt = (c) => !!(fi && fi.isExteriorLikeCode && fi.isExteriorLikeCode(c));
        const isSerial = (it) => /^EXT_\d+$/i.test(String((it && it.floorCode) || ''));
        const newExt = (items || []).filter((it) => isExt(it.floorCode));
        if (!newExt.length) return;
        const stemOf = (it) => String((it && it.fileName) || '').replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
        const squash = (t) => String(t || '').replace(/[\s\-_·.\/]/g, '').toLowerCase();
        const nameHasSerial = (s) => ((fi && typeof fi.parseExteriorSerialNumber === 'function')
            ? fi.parseExteriorSerialNumber(s) != null
            : /외부\s*[_\-]?\s*\d|EXT[_\s\-]*\d/i.test(s));
        const pending = [].concat(window.selectedUploadedDrawings || [], window.selectedEditUploadedDrawings || []);
        // 이미 쓰인 이름: 넘겨받은 층 코드, 그 코드의 건물 층 이름, 저장 전 목록, 이번에 넣은 다른 도면
        const usedSet = new Set((usedCodes || []).map(String));
        const taken = new Set();
        usedSet.forEach((c) => taken.add(squash(c)));
        const bldg = window.currentEditingBuilding;
        ((bldg && bldg.floorsList) || []).forEach((f) => {
            if (f && usedSet.has(String(f.floorCode)) && f.floorLabel) taken.add(squash(f.floorLabel));
        });
        pending.forEach((it) => { if (it && it.floorLabel) taken.add(squash(it.floorLabel)); });
        const named = newExt.filter((it) => {
            const s = stemOf(it);
            return isSerial(it) && s && s.length <= 40 && squash(s) !== '외부' && !nameHasSerial(s);
        });
        (items || []).forEach((it) => { if (it && named.indexOf(it) < 0 && it.floorLabel) taken.add(squash(it.floorLabel)); });
        named.forEach((it) => {
            const s = stemOf(it);
            if (taken.has(squash(s))) return;
            it.floorLabel = s;
            taken.add(squash(s));
        });
        const stem = stemOf(newExt[0]);
        if (newExt.length === 1 && !(usedCodes || []).some(isExt) && isSerial(newExt[0]) && stem === '외부') {
            newExt[0].floorLabel = '외부';
            return;
        }
        [].concat(window.selectedUploadedDrawings || [], window.selectedEditUploadedDrawings || []).forEach((it) => {
            if (it && isSerial(it) && it.floorLabel === '외부') it.floorLabel = `외부${parseInt(it.floorCode.split('_')[1], 10)}`;
        });
    }

    function usedFloorCodesFromItems(items) {
        return (items || []).map((it) => it && it.floorCode).filter(Boolean);
    }

    // 이미지 입력과 PDF 입력, 두 개의 <input type=file>에서 선택한 파일을 같은 목록에 누적
    function handleNewBuildingFilesSelected(files) {
        if (files.length === 0) return;

        const newItems = assignDrawingUploadItems(
            files,
            usedFloorCodesFromItems(window.selectedUploadedDrawings)
        );

        window.selectedUploadedDrawings = (window.selectedUploadedDrawings || [])
            .concat(newItems);
        const hasUnmatched = newItems.some((it) => it.matched === false);
        if (hasUnmatched) {
            window.drawingPreviewManualOrder = true;
        } else if (!window.drawingPreviewManualOrder) {
            window.selectedUploadedDrawings = window.sortFloorsLowToHigh(window.selectedUploadedDrawings);
        }

        renderNewBuildingDrawingPreview();
        updateNewBuildingFloorsSummary();

        const unmatchedCount = newItems.filter(it => it.matched === false).length;
        if (unmatchedCount > 0) {
            window.showToast(`${unmatchedCount}개 파일은 층을 파일명에서 못 찾았습니다. 목록에서 층을 고르기 전에는 저장되지 않습니다.`, 'warning', 5500);
        }
    }

    const inputDrawings = document.getElementById('inputBuildingDrawings');
    if (inputDrawings) {
        inputDrawings.addEventListener('change', (e) => {
            handleNewBuildingFilesSelected(Array.from(e.target.files || []));
            e.target.value = ''; // 같은 파일 재선택도 인식되도록 초기화
        });
    }

    const inputDrawingsPdf = document.getElementById('inputBuildingDrawingsPdf');
    if (inputDrawingsPdf) {
        inputDrawingsPdf.addEventListener('change', (e) => {
            handleNewBuildingFilesSelected(Array.from(e.target.files || []));
            e.target.value = '';
        });
    }

    const btnAddModeNew = document.getElementById('btnAddModeNew');
    const btnAddModeImport = document.getElementById('btnAddModeImport');
    if (btnAddModeNew) btnAddModeNew.addEventListener('click', () => setAddBuildingMode('new'));
    if (btnAddModeImport) btnAddModeImport.addEventListener('click', () => setAddBuildingMode('import'));

    document.getElementById('btnImportPresetDrawingsOnly')?.addEventListener('click', () => {
        applyImportPresetDrawingsOnly('add');
        const sourceId = document.getElementById('selectImportSourceBuilding')?.value;
        if (sourceId) {
            const bldg = (window.state.buildings || []).find(b => b.id === sourceId);
            updateImportSourceSummary(bldg || null);
        }
    });
    document.getElementById('btnEditImportPresetDrawingsOnly')?.addEventListener('click', () => {
        applyImportPresetDrawingsOnly('edit');
        const sourceId = document.getElementById('selectEditImportSource')?.value;
        if (sourceId) {
            const bldg = (window.state.buildings || []).find(b => b.id === sourceId);
            updateEditImportPreview(bldg || null);
        }
    });

    const btnMobileFabAddBuilding = document.getElementById('btnMobileFabAddBuilding');
    if (btnMobileFabAddBuilding) {
        btnMobileFabAddBuilding.addEventListener('click', () => {
            if (window.state.dashboardSiteKey && window.state.dashboardRoundKey
                && isSiteMultiDong(window.state.dashboardSiteKey)) {
                if (typeof window.openAddDongModal === 'function') window.openAddDongModal();
            } else if (window.state.dashboardSiteKey) {
                if (typeof window.openAddSurveyRoundModal === 'function') window.openAddSurveyRoundModal();
            } else if (typeof window.openAddBuildingModalFunc === 'function') {
                window.openAddBuildingModalFunc();
            }
        });
    }

    document.querySelectorAll('input[name="addBuildingSiteLayout"]').forEach((el) => {
        el.addEventListener('change', () => syncAddBuildingDongFieldVisibility());
    });
    document.querySelectorAll('input[name="editBuildingSiteLayout"]').forEach((el) => {
        el.addEventListener('change', () => syncEditBuildingDongFieldVisibility());
    });
    syncAddBuildingDongFieldVisibility();
    syncEditBuildingDongFieldVisibility();

    ['btnCloseAddSurveyRoundModal', 'btnCancelAddSurveyRound'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => window.closeAddSurveyRoundModal());
    });
    const btnConfirmAddSurveyRound = document.getElementById('btnConfirmAddSurveyRound');
    if (btnConfirmAddSurveyRound) {
        btnConfirmAddSurveyRound.addEventListener('click', () => window.confirmAddSurveyRoundFromHome());
    }
    const addSurveyRoundModal = document.getElementById('addSurveyRoundModal');
    if (addSurveyRoundModal) {
        addSurveyRoundModal.addEventListener('click', (e) => {
            if (e.target === addSurveyRoundModal) window.closeAddSurveyRoundModal();
        });
    }

    ['btnCloseAddDongModal', 'btnCancelAddDong'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', () => window.closeAddDongModal());
    });
    document.getElementById('btnConfirmAddDong')?.addEventListener('click', () => window.confirmAddDongFromHome());
    window.syncAddDongCloneSourceVisibility = function() {
        const on = !!document.getElementById('addDongCloneDrawings')?.checked;
        const wrap = document.getElementById('addDongCloneSourceWrap');
        if (wrap) wrap.hidden = !on;
    };
    document.getElementById('addDongCloneDrawings')?.addEventListener('change', () => {
        window.syncAddDongCloneSourceVisibility();
    });
    const addDongModal = document.getElementById('addDongModal');
    if (addDongModal) {
        addDongModal.addEventListener('click', (e) => {
            if (e.target === addDongModal) window.closeAddDongModal();
        });
    }

    initAllImportSourceSearchPickers();

    const selectImportSourceBuilding = document.getElementById('selectImportSourceBuilding');
    if (selectImportSourceBuilding) {
        selectImportSourceBuilding.addEventListener('change', (e) => {
            applyImportSourceToForm(e.target.value);
        });
    }
    const selectEditImportSource = document.getElementById('selectEditImportSource');
    if (selectEditImportSource) {
        selectEditImportSource.addEventListener('change', (e) => {
            const bldg = (window.state.buildings || []).find(b => b.id === e.target.value);
            updateEditImportPreview(bldg || null);
        });
    }
    ['chkImportBasicInfo', 'chkImportFloorsDrawings', 'chkImportDefects', 'chkImportNdt', 'chkImportMapStyles'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            const sourceId = document.getElementById('selectImportSourceBuilding')?.value;
            if (sourceId && id === 'chkImportBasicInfo' && el.checked) {
                applyImportSourceToForm(sourceId);
            } else if (sourceId) {
                const bldg = (window.state.buildings || []).find(b => b.id === sourceId);
                updateImportSourceSummary(bldg || null);
            }
        });
    });
    ['chkEditImportFloorsDrawings', 'chkEditImportDefects', 'chkEditImportNdt', 'chkEditImportMapStyles'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            const sourceId = document.getElementById('selectEditImportSource')?.value;
            if (sourceId) {
                const bldg = (window.state.buildings || []).find(b => b.id === sourceId);
                updateEditImportPreview(bldg || null);
            }
        });
    });
    document.querySelectorAll('input[name="importDefectRoundMode"], input[name="editImportDefectRoundMode"]').forEach((el) => {
        el.addEventListener('change', () => {
            const addId = document.getElementById('selectImportSourceBuilding')?.value;
            if (addId && el.name === 'importDefectRoundMode') {
                updateImportSourceSummary((window.state.buildings || []).find(b => b.id === addId));
            }
            const editId = document.getElementById('selectEditImportSource')?.value;
            if (editId && el.name === 'editImportDefectRoundMode') {
                updateEditImportPreview((window.state.buildings || []).find(b => b.id === editId));
            }
        });
    });

    const btnEditImportApply = document.getElementById('btnEditImportApply');
    if (btnEditImportApply) {
        btnEditImportApply.addEventListener('click', async () => {
            const targetBldg = window.currentEditingBuilding;
            if (!targetBldg) return;
            const sourceId = document.getElementById('selectEditImportSource')?.value || '';
            const sourceBldg = (window.state.buildings || []).find(b => b.id === sourceId);
            if (!sourceId || !sourceBldg) {
                window.showToast('가져올 점검을 선택해 주세요.', 'warning');
                return;
            }
            if (sourceId === targetBldg.id) {
                window.showToast('같은 점검은 가져올 수 없습니다.', 'warning');
                return;
            }
            const importOpts = getEditBuildingImportOptions();
            const anyCopy = importOpts.floorsDrawings || importOpts.defects || importOpts.ndt || importOpts.mapStyles;
            if (!anyCopy) {
                window.showToast('가져올 항목을 하나 이상 선택해 주세요.', 'warning');
                return;
            }
            if (!await window.appConfirm(`「${(sourceBldg.name || '').replace(/^🏢\s*/, '')}」에서 선택 항목을 이 건물에 병합할까요?`)) return;
            try {
                await runBuildingImport(sourceBldg, targetBldg, importOpts, '가져오기');
                targetBldg.floorsList = window.getBuildingAvailableFloors(targetBldg);
                renderEditDrawingPreview();
                if (window.state.currentBuildingId === targetBldg.id) {
                    populateFloorSelectDropdown(targetBldg);
                    if (typeof drawCanvas === 'function') drawCanvas();
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                }
                window.showToast('선택한 데이터를 가져왔습니다.', 'success');
            } catch (_e) { /* toast inside runBuildingImport */ }
        });
    }

    // Save New Building Action
    const btnSaveBuilding = document.getElementById('btnSaveBuilding');
    if (btnSaveBuilding) {
        btnSaveBuilding.addEventListener('click', async () => {
            if (await blockSaveForUnassignedDrawingFloors(window.selectedUploadedDrawings)) return;
            const siteNameInput = document.getElementById('inputBuildingSiteName');
            const dongInput = document.getElementById('inputBuildingDong');
            const siteName = (siteNameInput ? siteNameInput.value : '').trim();
            const multiDong = readSiteLayoutRadio('addBuildingSiteLayout', false)
                || (window.state.dashboardSiteKey ? isSiteMultiDong(window.state.dashboardSiteKey) : false);
            const isImportForDongs = window._addBuildingMode === 'import';
            let extraDongNames = [];
            if (multiDong && !isImportForDongs) {
                const collected = collectAddBuildingDongNames();
                if (!collected.ok) return;
                if (dongInput) dongInput.value = collected.names[0] || '';
                extraDongNames = collected.names.slice(1);
            }
            const dong = multiDong ? normalizeDongLabel(dongInput ? dongInput.value : '') : '';
            if (multiDong && siteName) {
                const roundKeyChk = `${document.getElementById('inputBuildingInspectionYear')?.value || '2026년'}_${document.getElementById('inputBuildingInspectionPeriod')?.value || '하반기'}`;
                const clash = [dong].concat(extraDongNames).filter((d) => d && siteRoundAlreadyHasDong(siteName, roundKeyChk, d));
                if (clash.length) {
                    window.showToast(`이 현장·회차에 이미 있는 동입니다: ${clash.join(', ')}`, 'warning', 4500);
                    return;
                }
            }
            if (!siteName) {
                window.showToast('현장명을 입력해 주세요.', 'warning');
                if (siteNameInput) siteNameInput.focus();
                return;
            }
            const name = composeBuildingDisplayName(siteName, dong);
            const nameInput = document.getElementById('inputBuildingName');
            if (nameInput) nameInput.value = name;

            const isImportMode = window._addBuildingMode === 'import';
            const sourceId = document.getElementById('selectImportSourceBuilding')?.value || '';
            const sourceBldg = isImportMode
                ? (window.state.buildings || []).find(b => b.id === sourceId)
                : null;
            const importOpts = isImportMode ? getAddBuildingImportOptions() : null;

            const address = (document.getElementById('inputBuildingAddress')?.value || '').trim() || '서울특별시 강남구 테헤란로 123';
            const inspector = (document.getElementById('inputBuildingInspector')?.value || '').trim()
                || window.state.userName || '점검자';
            const contactPhone = (document.getElementById('inputBuildingContactPhone')?.value || '').trim();

            if (isImportMode) {
                if (!sourceId || !sourceBldg) {
                    window.showToast('가져올 점검을 선택해 주세요.', 'warning');
                    return;
                }
                const anyCopy = importOpts.basicInfo || importOpts.floorsDrawings || importOpts.defects || importOpts.ndt || importOpts.mapStyles;
                if (!anyCopy) {
                    window.showToast('가져올 항목을 하나 이상 선택해 주세요.', 'warning');
                    return;
                }
            }

            const similar = findSimilarBuildings(name, address);
            if (similar.length > 0) {
                const names = similar.map(b => (b.name || '').replace(/^🏢\s*/, '')).join(', ');
                if (!await window.appConfirm(`비슷한 건축물이 이미 있습니다 (${names}).\n그래도 새로 등록하시겠습니까?`)) return;
            }

            const date = document.getElementById('inputBuildingDate')?.value || new Date().toISOString().split('T')[0];
            const floors = document.getElementById('inputBuildingFloors')?.value || '지상 10층 ~ 지하 2층';
            const inspectionType = document.getElementById('inputBuildingInspectionType')?.value || '정밀안전점검';
            const inspectionYear = document.getElementById('inputBuildingInspectionYear')?.value || '2026년';
            const inspectionPeriod = document.getElementById('inputBuildingInspectionPeriod')?.value || '하반기';
            const structureType = (document.getElementById('inputBuildingStructureType')?.value || '').trim();
            const facilityGrade = document.getElementById('inputBuildingFacilityGrade')?.value || '';
            const completionDate = document.getElementById('inputBuildingCompletionDate')?.value || '';
            const notes = document.getElementById('inputBuildingNotes')?.value || '';

            const newBuildingId = 'bldg-' + Date.now();
            const safeUploadedDrawings = Array.isArray(window.selectedUploadedDrawings) ? window.selectedUploadedDrawings : [];

            // 같은 층으로 지정된 파일이 여러 개면 저장 시 마지막 파일만 남고 나머지는 사라지므로 사전 확인
            const dupCounts = {};
            safeUploadedDrawings.forEach(it => { dupCounts[it.floorCode] = (dupCounts[it.floorCode] || 0) + 1; });
            const dupCodes = Object.keys(dupCounts).filter(c => dupCounts[c] > 1);
            if (dupCodes.length > 0) {
                const proceed = await window.appConfirm(`⚠️ 같은 층으로 지정된 도면이 있습니다 (${dupCodes.join(', ')}).\n계속 저장하면 같은 층끼리는 마지막 파일만 남고 나머지는 사라집니다.\n계속하시겠습니까?`);
                if (!proceed) return;
            }

            const floorDrawingsMap = {};
            const floorDrawingPdfsMap = {};
            const floorDrawingTiersMap = {};
            const floorDrawingSourcesMap = {};
            const floorsList = [];

            if (safeUploadedDrawings.length > 0) {
                window.showLoading(`도면 ${safeUploadedDrawings.length}개 변환 중...`);
                try {
                    for (let i = 0; i < safeUploadedDrawings.length; i++) {
                        const item = safeUploadedDrawings[i];
                        if (!floorsList.some(f => f.floorCode === item.floorCode)) {
                            floorsList.push({
                                floorCode: item.floorCode,
                                floorLabel: item.floorLabel
                            });
                        }
                        if (item.file) {
                            try {
                                window.updateLoadingText(`도면 ${i + 1}/${safeUploadedDrawings.length} 변환 중... (${item.floorCode || ''})`);
                                const preparePromise = (typeof window.prepareFloorDrawingUpload === 'function')
                                    ? window.prepareFloorDrawingUpload(item.file)
                                    : window.compressDrawingImage(item.file).then((rasterDataUrl) => ({ rasterDataUrl, pdfDataUrl: null }));
                                const prepared = await withTimeout(preparePromise, 120000, 'prepare-drawing');
                                if (prepared && prepared.rasterDataUrl) {
                                    floorDrawingsMap[item.floorCode] = prepared.rasterDataUrl;
                                    await uploadFloorDrawing(newBuildingId, item.floorCode, prepared.rasterDataUrl);
                                }
                                if (prepared && prepared.tiers) {
                                    floorDrawingTiersMap[item.floorCode] = prepared.tiers;
                                    await uploadFloorDrawingTiers(newBuildingId, item.floorCode, prepared.tiers);
                                }
                                if (prepared && prepared.sourceDataUrl) {
                                    floorDrawingSourcesMap[item.floorCode] = prepared.sourceDataUrl;
                                }
                                if (prepared && prepared.pdfDataUrl) {
                                    floorDrawingPdfsMap[item.floorCode] = prepared.pdfDataUrl;
                                    await uploadFloorDrawingPdf(newBuildingId, item.floorCode, prepared.pdfDataUrl);
                                }
                            } catch (err) {
                                console.error('Drawing compression error:', err);
                                window.showToast(`도면 ${item.floorCode || (i + 1)} 변환 실패 — 다음 도면으로 진행합니다`, 'warning');
                            }
                        }
                    }
                } finally {
                    window.hideLoading();
                }
            }

            const fiAdd = window.BSA && window.BSA.floorIdentity;
            if (fiAdd && typeof fiAdd.normalizeUserLabel === 'function') {
                floorsList.forEach((f) => {
                    if (!f) return;
                    f.floorLabel = fiAdd.normalizeUserLabel(f.floorCode, f.floorLabel);
                });
            }
            const newBldgHasCustom = floorsList.some((f) =>
                f && f.floorCode && fiAdd && typeof fiAdd.isStandardFloorCode === 'function'
                    && !fiAdd.isStandardFloorCode(f.floorCode)
            );

            const newBldg = {
                id: newBuildingId,
                _pendingCloudSync: true,
                siteName,
                dong,
                multiDong: !!multiDong,
                name: composeBuildingStorageName(siteName, dong),
                address: address,
                inspector: inspector,
                contactPhone: contactPhone,
                date: date,
                floors: floors,
                inspectionType: inspectionType,
                inspectionYear: inspectionYear,
                inspectionPeriod: inspectionPeriod,
                structureType: structureType,
                facilityGrade: facilityGrade,
                completionDate: completionDate,
                floorsList: floorsList.length > 0 ? floorsList : null,
                drawingFloorCodes: floorsList.map((f) => f.floorCode).filter(Boolean),
                floorsOrderManual: !!(window.drawingPreviewManualOrder || newBldgHasCustom),
                floorsOrderUpdatedAt: Date.now(),
                floorDrawings: floorDrawingsMap,
                floorDrawingPdfs: floorDrawingPdfsMap,
                floorDrawingTiers: floorDrawingTiersMap,
                floorDrawingSources: floorDrawingSourcesMap,
                siteVaultKey: siteVaultDocId(siteName),
                notes: notes
            };

            window.state.buildings.unshift(newBldg);
            // 여러 동 동시 등록: 나머지 동은 홈 「동 추가」와 같은 구조(같은 회차·도면 없음)로 생성
            const extraDongBldgs = [];
            if (multiDong && extraDongNames.length) {
                const usedIds = new Set((window.state.buildings || []).map((b) => b.id));
                let seq = Date.now();
                extraDongNames.forEach((d) => {
                    let id;
                    do { seq += 1; id = 'bldg-' + seq; } while (usedIds.has(id));
                    usedIds.add(id);
                    extraDongBldgs.push({
                        id,
                        _pendingCloudSync: true,
                        siteName,
                        dong: d,
                        multiDong: true,
                        name: composeBuildingStorageName(siteName, d),
                        address,
                        inspector,
                        contactPhone,
                        date,
                        floors: '',
                        inspectionType,
                        inspectionYear,
                        inspectionPeriod,
                        latestSurveyRoundKey: `${inspectionYear}_${inspectionPeriod}`,
                        siteVaultKey: siteVaultDocId(siteName),
                        structureType,
                        facilityGrade,
                        completionDate,
                        notes,
                        floorsList: [],
                        floorDrawings: {},
                        floorDrawingPdfs: {},
                        floorDrawingTiers: {},
                        floorDrawingSources: {}
                    });
                });
                // 등록 순서대로 보이도록 첫 동 뒤에 끼움
                window.state.buildings.splice(1, 0, ...extraDongBldgs);
            }
            if (multiDong) setSiteMultiDongFlag(siteName, true);
            else setSiteMultiDongFlag(siteName, false);

            window.showLoading('도면 저장 중...');
            try {
                await persistBuildingDrawingAssetsNow(newBldg);
                // 신규 등록에서는 현장 보관함 PDF를 붙이지 않는다.
                // (같은 현장명의 다른 점검 1F 등이 새 건물에 섞이던 문제)
                // 다른 점검 가져오기·다음 회차 복제 경로에서만 hydrateBuildingPdfsFromSiteVault 사용.
            } finally {
                window.resetLoadingOverlay();
            }

            if (isImportMode && sourceBldg && importOpts) {
                try {
                    await runBuildingImport(sourceBldg, newBldg, importOpts, '등록');
                } catch (_e) { /* handled in runBuildingImport */ }
            } else {
                saveStateToLocalStorage();
                if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
            }

            window.closeAddBuildingModalFunc();

            renderDashboard();
            window.selectBuildingAndInspect(newBldg);

            const importNote = (isImportMode && sourceBldg)
                ? ' · 다른 점검 데이터 반영'
                : '';
            const extraNote = extraDongBldgs.length ? ` · 동 ${extraDongBldgs.length + 1}개 등록` : '';
            const notOnServer = floorsNotYetOnServer(newBldg, safeUploadedDrawings);
            if (notOnServer.length) showDrawingsNotOnServerWarning(name, notOnServer);
            else window.showToast(`'${name}' 건축물이 등록되었습니다${importNote}${extraNote}.`, 'success');
        });
    }

    // --- 7-B. BUILDING EDIT & ADDITIONAL DRAWING INSERTION ENGINE (저층->고층 자동 정렬) ---

    // Low-to-High Floor Sort Helper (B3F -> B2F -> B1F -> 1F -> 2F -> 3F -> ROOF -> PH -> PH_ROOF)
    window.sortFloorsLowToHigh = function(floorsList) {
        const fi = window.BSA && window.BSA.floorIdentity;
        if (fi && typeof fi.sortFloorsLowToHigh === 'function') {
            return fi.sortFloorsLowToHigh(floorsList);
        }
        if (!Array.isArray(floorsList)) return [];
        const getRank = (code) => {
            if (typeof window.getFloorRankFromCode === 'function') return window.getFloorRankFromCode(code);
            return 0;
        };
        return [...floorsList].sort((a, b) => getRank(a.floorCode) - getRank(b.floorCode));
    };

    window.openEditBuildingModalFunc = function(bldgId, focusSection = 'info') {
        const modal = document.getElementById('editBuildingModal');
        if (!modal) return;
        if (typeof ensurePrevRoundPhotoImportSection === 'function') ensurePrevRoundPhotoImportSection();
        if (document.body?.classList.contains('auth-gate-active')) return;

        const bldgs = window.state.buildings || [];
        const bldg = bldgs.find(b => b.id === bldgId);
        if (!bldg) {
            window.showToast('해당 건축물 정보를 찾을 수 없습니다.', 'error');
            return;
        }

        const mode = focusSection === 'drawing' ? 'drawing' : 'info';
        window.currentEditingBuilding = bldg;
        window.selectedEditUploadedDrawings = [];
        window.editDrawingPreviewManualOrder = false;
        window._editBuildingMode = mode;
        // 수정창 층 목록도 점검 층 목록과 같은 기준 — 도면 없는 층은 열 때 정리하고 다시 그린다
        autoRemoveDrawinglessFloors(bldg).then((removed) => {
            if (!removed.length) return;
            if (window.currentEditingBuilding === bldg) renderEditDrawingPreview();
            if (state.currentBuildingId === bldg.id) {
                populateFloorSelectDropdown(bldg);
                if (state.currentFloor && typeof loadFloorDrawing === 'function') loadFloorDrawing(state.currentFloor);
            }
        }).catch(() => {});

        try { window.renderEditRoundDoneChecks(bldg); } catch (_e) { /* ignore */ }
        modal.dataset.editMode = mode;
        modal.classList.remove('edit-mode-drawing', 'edit-mode-info');
        modal.classList.add(mode === 'drawing' ? 'edit-mode-drawing' : 'edit-mode-info');
        // CSS만으로 빠질 때 대비 — 섹션 자체를 숨김
        modal.querySelectorAll('.edit-only-info').forEach((el) => {
            el.hidden = mode === 'drawing';
            el.style.display = mode === 'drawing' ? 'none' : '';
        });
        modal.querySelectorAll('.edit-only-drawing').forEach((el) => {
            el.hidden = mode === 'info';
            el.style.display = mode === 'info' ? 'none' : '';
        });

        const titleText = document.getElementById('editBuildingModalTitleText');
        if (titleText) {
            titleText.textContent = mode === 'drawing' ? '층별 도면 추가/교체' : '현장 정보 수정';
        }
        const titleIcon = document.querySelector('#editBuildingModalTitle i');
        if (titleIcon) {
            titleIcon.className = mode === 'drawing' ? 'fa-solid fa-images' : 'fa-solid fa-pen-to-square';
        }
        const saveLabel = document.getElementById('btnSaveEditBuildingLabel');
        if (saveLabel) {
            saveLabel.textContent = mode === 'drawing' ? '도면 저장' : '수정사항 저장';
        }

        // Bind building info to edit modal form inputs
        document.getElementById('inputEditBuildingId').value = bldg.id;
        ensureBuildingSiteFields(bldg);
        const siteEl = document.getElementById('inputEditBuildingSiteName');
        const dongEl = document.getElementById('inputEditBuildingDong');
        const nameEl = document.getElementById('inputEditBuildingName');
        if (siteEl) siteEl.value = getBuildingSiteName(bldg);
        if (dongEl) dongEl.value = getBuildingDongLabel(bldg);
        if (nameEl) nameEl.value = composeBuildingDisplayName(getBuildingSiteName(bldg), getBuildingDongLabel(bldg));
        setSiteLayoutRadio('editBuildingSiteLayout', isSiteMultiDong(getBuildingSiteName(bldg)));
        syncEditBuildingDongFieldVisibility();
        document.getElementById('inputEditBuildingAddress').value = bldg.address || '';
        const editInspector = document.getElementById('inputEditBuildingInspector');
        if (editInspector) editInspector.value = bldg.inspector || window.state.userName || '';
        const editContact = document.getElementById('inputEditBuildingContactPhone');
        if (editContact) editContact.value = bldg.contactPhone || '';
        document.getElementById('inputEditBuildingFloors').value = bldg.floors || '';
        document.getElementById('inputEditBuildingDate').value = getBuildingInspectionDate(bldg) || new Date().toISOString().split('T')[0];
        
        if (document.getElementById('inputEditBuildingInspectionType')) document.getElementById('inputEditBuildingInspectionType').value = bldg.inspectionType || '정밀안전점검';
        if (document.getElementById('inputEditBuildingInspectionYear')) document.getElementById('inputEditBuildingInspectionYear').value = bldg.inspectionYear || '2026년';
        if (document.getElementById('inputEditBuildingInspectionPeriod')) document.getElementById('inputEditBuildingInspectionPeriod').value = bldg.inspectionPeriod || '하반기';
        if (document.getElementById('inputEditBuildingStructureType')) document.getElementById('inputEditBuildingStructureType').value = bldg.structureType || '';
        if (document.getElementById('inputEditBuildingFacilityGrade')) document.getElementById('inputEditBuildingFacilityGrade').value = bldg.facilityGrade || '';
        if (document.getElementById('inputEditBuildingCompletionDate')) document.getElementById('inputEditBuildingCompletionDate').value = bldg.completionDate || '';
        if (document.getElementById('inputEditBuildingNotes')) document.getElementById('inputEditBuildingNotes').value = bldg.notes || '';
        initEditRoundDates(bldg);
        if (typeof window.syncInspectionRoundDateInput === 'function') window.syncInspectionRoundDateInput();

        populateEditBuildingImportSources(bldg.id);
        setImportSourcePickerValue('selectEditImportSource', '', { silent: true });
        updateEditImportPreview(null);

        const fileInput = document.getElementById('inputEditBuildingDrawings');
        if (fileInput) fileInput.value = '';
        const pdfInput = document.getElementById('inputEditBuildingDrawingsPdf');
        if (pdfInput) pdfInput.value = '';

        // 도면 모드일 때만 목록 렌더 (수정 모드는 도면 섹션 숨김)
        if (mode === 'drawing') {
            renderEditDrawingPreview();
        } else {
            const preview = document.getElementById('editDrawingSortPreview');
            if (preview) preview.innerHTML = '';
        }

        modal.style.display = 'flex';
        modal.classList.add('open');

        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) modalBody.scrollTop = 0;
    };

    window.closeEditBuildingModalFunc = function() {
        const modal = document.getElementById('editBuildingModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open', 'edit-mode-info', 'edit-mode-drawing');
            modal.dataset.editMode = 'info';
        }
        if (window.BSA?.mobileKeyboard?.reset) window.BSA.mobileKeyboard.reset();
        if (typeof window.closeDrawingPreviewLightbox === 'function') {
            window.closeDrawingPreviewLightbox();
        }
    };

    window.closeDrawingPreviewLightbox = function() {
        const box = document.getElementById('drawingPreviewLightbox');
        if (!box) return;
        box.hidden = true;
        box.classList.remove('open');
        box.setAttribute('aria-hidden', 'true');
        const img = document.getElementById('drawingPreviewLightboxImg');
        if (img) {
            img.removeAttribute('src');
            img.hidden = true;
        }
        const empty = document.getElementById('drawingPreviewLightboxEmpty');
        if (empty) empty.hidden = true;
    };

    window.openDrawingPreviewLightbox = function(src, title) {
        const box = document.getElementById('drawingPreviewLightbox');
        if (!box) return;
        const img = document.getElementById('drawingPreviewLightboxImg');
        const empty = document.getElementById('drawingPreviewLightboxEmpty');
        const titleEl = document.getElementById('drawingPreviewLightboxTitle');
        if (titleEl) titleEl.textContent = title || '도면 미리보기';
        const usable = typeof isUsableRasterDrawingUrl === 'function'
            ? isUsableRasterDrawingUrl(src)
            : !!(src && String(src).length > 8);
        if (usable && img) {
            img.hidden = false;
            img.src = src;
            if (empty) empty.hidden = true;
        } else {
            if (img) {
                img.hidden = true;
                img.removeAttribute('src');
            }
            if (empty) empty.hidden = false;
        }
        box.hidden = false;
        box.classList.add('open');
        box.setAttribute('aria-hidden', 'false');
        box.style.display = 'flex';
    };

    window.previewEditFloorDrawing = async function(floorCode) {
        const bldg = window.currentEditingBuilding;
        if (!bldg || !floorCode) return;
        const label = (typeof window.getFloorLabelFromCode === 'function')
            ? window.getFloorLabelFromCode(floorCode)
            : floorCode;
        window.showToast?.(`${label} 도면 불러오는 중…`, 'info', 1800);
        try {
            if (typeof hydrateFloorDrawingFromCloud === 'function') {
                await hydrateFloorDrawingFromCloud(bldg, floorCode, {});
            } else if (typeof ensureOfflineRasterForFloor === 'function') {
                await ensureOfflineRasterForFloor(bldg, floorCode);
            }
        } catch (_e) { /* ignore */ }
        let src = bldg.floorDrawings && bldg.floorDrawings[floorCode];
        if (!isUsableRasterDrawingUrl(src) && bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode]) {
            const tiers = bldg.floorDrawingTiers[floorCode];
            src = tiers['4000'] || tiers['8000'] || tiers['16000'] || Object.values(tiers).find((u) => isUsableRasterDrawingUrl(u));
        }
        if (!isUsableRasterDrawingUrl(src)) {
            window.showToast?.('이 층에 표시할 도면 이미지가 없습니다.', 'warning', 2800);
            window.openDrawingPreviewLightbox(null, `${label} 도면`);
            return;
        }
        window.openDrawingPreviewLightbox(src, `${label} (${floorCode}) 도면`);
    };

    function renderEditDrawingPreview() {
        const preview = document.getElementById('editDrawingSortPreview');
        if (!preview) return;

        const bldg = window.currentEditingBuilding;
        if (!bldg) return;

        let existingFloors = [];
        if (typeof window.getBuildingAvailableFloors === 'function') {
            existingFloors = window.getBuildingAvailableFloors(bldg) || [];
        }
        if ((!existingFloors || existingFloors.length === 0) && bldg.floorsList && bldg.floorsList.length > 0) {
            existingFloors = bldg.floorsList.slice();
        }
        if ((!existingFloors || existingFloors.length === 0) && Array.isArray(bldg.drawingFloorCodes) && bldg.drawingFloorCodes.length) {
            const fi = window.BSA && window.BSA.floorIdentity;
            existingFloors = bldg.drawingFloorCodes.map((code) => ({
                floorCode: code,
                floorLabel: (fi && typeof fi.labelFromCode === 'function')
                    ? fi.labelFromCode(code)
                    : code
            }));
        }
        if ((!existingFloors || existingFloors.length === 0) && bldg.floorDrawings) {
            existingFloors = Object.keys(bldg.floorDrawings).map(code => ({ floorCode: code, floorLabel: code }));
        }

        existingFloors = existingFloors.filter((f) => f && f.floorCode && !isDeletedDrawingFloor(bldg, f.floorCode));

        const newFiles = Array.isArray(window.selectedEditUploadedDrawings) ? window.selectedEditUploadedDrawings : [];
        const editGroups = groupDrawingItemsByFloor(newFiles);
        const existingCodeSet = new Set(existingFloors.map((f) => f && f.floorCode).filter(Boolean));
        const replacingCodes = [...new Set(newFiles.map((it) => it && it.floorCode).filter((c) => c && existingCodeSet.has(c)))];

        let html = `
            <div style="font-size:0.85rem; font-weight:800; color:#2a2a2a; margin-bottom:0.4rem; display:flex; justify-content:space-between; align-items:center;">
                <span>🖼️ 층별 도면 목록 (저장한 이름·순서 유지, ⠿ 드래그로 변경):</span>
                <span style="font-size:0.78rem; color:#64748b;">(기존 ${existingFloors.length}개 + 신규추가 ${newFiles.length}개)</span>
            </div>
        `;

        if (existingFloors.length === 0 && newFiles.length === 0) {
            html += `<div style="font-size:0.8rem; color:#a3a3a3; padding:0.6rem; text-align:center; border:1px dashed #cbd5e1; border-radius:6px;">등록된 층별 도면이 없습니다. 아래에서 파일들을 선택하여 추가해 주세요.</div>`;
        } else {
            html += `<div style="display:flex; flex-direction:column; gap:0.4rem; padding-right:4px;">`;

            // 신규추가 파일 중 같은 층으로 지정된 파일 검사 (저장 시 나중 파일이 이전 파일을 덮어씀)
            const hasUnmatched = newFiles.some(it => it.matched === false);
            const hasDuplicate = editGroups.some(g => g.entries.length > 1);
            if (hasUnmatched || hasDuplicate || replacingCodes.length > 0) {
                const warnParts = [];
                if (hasUnmatched) {
                    warnParts.push('⚠️ 파일명에서 층을 못 찾은 파일이 있습니다. 아래 목록에서 <b>층을 고르기 전에는 저장되지 않습니다</b>(파일 이름은 층 이름·번호가 될 수 없음).');
                }
                if (hasDuplicate) {
                    warnParts.push('같은 층으로 묶인 파일은 "이 파일 저장" 버튼으로 고른 파일 하나만 실제로 저장됩니다.');
                }
                if (replacingCodes.length > 0) {
                    warnParts.push('⚠️ 저장하면 기존 도면이 교체됩니다: ' + replacingCodes.map((c) => escapeHtml(c)).join(', '));
                }
                html += `<div style="font-size:0.78rem; color:#d97706; background:rgba(217,119,6,0.12); border:1px solid #d97706; border-radius:6px; padding:0.5rem 0.7rem; margin-bottom:0.4rem;">${warnParts.join('<br>')}</div>`;
            }

            if (editGroups.length > 0) {
                html += `<div class="add-drawing-preview-title">신규 도면 ${newFiles.length}개 · 저장해야 반영됩니다${editGroups.length > 1 ? ' · <span class="add-drawing-preview-drag-hint">⠿ 드래그로 순서 변경</span>' : ''}</div>`;
                html += `<div class="add-drawing-preview-list edit-drawing-new-list">`;
            }

            // Render Newly Added Drawings — 같은 층으로 인식된 파일은 한 그룹으로 묶어서 표시
            editGroups.forEach(g => {
                const willReplace = existingCodeSet.has(g.floorCode);
                if (g.entries.length === 1) {
                    const { item, idx } = g.entries[0];
                    const flagged = item.matched === false;
                    html += `
                        <div class="add-drawing-preview-row is-draggable${flagged ? ' is-warning' : ''}" data-floor-code="${escapeHtml(g.floorCode)}" style="background:${flagged ? '#fffbeb' : '#e0f2fe'}; border-color:${flagged ? '#f59e0b' : '#2a2a2a'};">
                            ${drawingPreviewDragHandleHtml(g.floorCode, item.floorLabel)}
                            <span class="add-drawing-preview-name" title="${escapeHtml(item.fileName)}">
                                <strong style="color:#1f1f1f;">[신규]</strong> ${escapeHtml(item.fileName)}
                                ${willReplace ? '<span class="edit-floor-drawing-badge" style="color:#b45309;">기존 도면 교체</span>' : '<span class="edit-floor-drawing-badge">새 층</span>'}
                            </span>
                            <select class="form-control edit-drawing-floor-select" data-idx="${idx}" style="width:auto; max-width:11rem; font-size:0.78rem; padding:0.2rem 0.4rem; flex-shrink:0;">
                                ${window.buildFloorCodeOptionsHtml(item.floorCode, existingFloors, item.floorLabel)}
                            </select>
                        </div>
                    `;
                } else {
                    const floorLabel = (g.entries[0] && g.entries[0].item && g.entries[0].item.floorLabel)
                        || window.getFloorLabelFromCode(g.floorCode);
                    html += `
                        <div class="add-drawing-preview-row is-duplicate-group is-draggable" data-floor-code="${escapeHtml(g.floorCode)}">
                            ${drawingPreviewDragHandleHtml(g.floorCode, floorLabel)}
                            <div style="width:100%; min-width:0;">
                                <div class="add-drawing-preview-title">[신규] ${escapeHtml(floorLabel)} — 파일 ${g.entries.length}개 · 저장할 파일 하나를 선택</div>
                                <div style="display:flex; flex-direction:column; gap:0.25rem;">
                                ${g.entries.map(({ item, idx }, i) => {
                                    const isFinal = i === g.entries.length - 1;
                                    return `
                                    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem; padding:0.2rem 0;">
                                        <span class="add-drawing-preview-name" style="color:${isFinal ? '#16a34a' : '#64748b'};" title="${escapeHtml(item.fileName)}">
                                            ${isFinal ? '✅' : '⬜'} ${escapeHtml(item.fileName)}${isFinal ? ' (저장됨)' : ''}
                                        </span>
                                        ${!isFinal ? `<button type="button" class="btn btn-sm btn-outline pick-final-edit-drawing" data-idx="${idx}" style="font-size:0.68rem; padding:0.1rem 0.5rem; flex-shrink:0;">이 파일 저장</button>` : ''}
                                        <select class="form-control edit-drawing-floor-select" data-idx="${idx}" style="width:auto; max-width:11rem; font-size:0.72rem; padding:0.15rem 0.3rem; flex-shrink:0;">
                                            ${window.buildFloorCodeOptionsHtml(item.floorCode, existingFloors, item.floorLabel)}
                                        </select>
                                    </div>`;
                                }).join('')}
                                </div>
                            </div>
                        </div>`;
                }
            });

            if (editGroups.length > 0) {
                html += `</div>`;
            }

            if (existingFloors.length > 0) {
                html += `<div class="add-drawing-preview-title" style="margin-top:0.35rem;">기존 도면 ${existingFloors.length}개</div>`;
                html += `<div class="add-drawing-preview-list edit-drawing-existing-list">`;
                existingFloors.forEach((f, idx) => {
                    const hasImg = bldg.floorDrawings && bldg.floorDrawings[f.floorCode];
                    const safeCode = escapeHtml(f.floorCode);
                    html += `
                    <div class="edit-floor-drawing-row is-viewable is-draggable" data-floor-code="${safeCode}" role="button" tabindex="0" title="클릭하여 도면 보기">
                        ${drawingPreviewDragHandleHtml(f.floorCode, f.floorLabel)}
                        <span class="edit-floor-drawing-meta">
                            <strong style="color:#2a2a2a;">[기존 ${idx + 1}]</strong> 🏢 ${escapeHtml(f.floorLabel || f.floorCode)}
                            ${hasImg
                                ? '<span class="edit-floor-drawing-badge">✓ 도면 · 눌러서 보기</span>'
                                : '<span class="edit-floor-drawing-badge">눌러서 도면 불러오기</span>'}
                        </span>
                        <span class="edit-floor-drawing-actions">
                        <button type="button" class="btn btn-sm btn-outline edit-floor-drawing-replace" data-floor-code="${safeCode}" title="이 층 도면을 새 파일로 바꾸기 — 파일 이름은 상관없음, 층 이름·결함은 그대로 (도면 저장을 눌러야 반영)">
                            <i class="fa-solid fa-arrow-right-arrow-left"></i> 파일로 교체
                        </button>
                        <button type="button" class="btn btn-sm btn-outline edit-floor-drawing-rename" data-floor-code="${safeCode}" title="층 이름 바꾸기 (도면·결함은 그대로)">
                            <i class="fa-solid fa-pen"></i> 이름
                        </button>
                        <button type="button" class="btn btn-sm btn-outline edit-floor-drawing-delete" style="border-color:#ef4444; color:#ef4444;" data-floor-code="${safeCode}">
                            <i class="fa-solid fa-trash"></i> 도면 삭제
                        </button>
                        </span>
                    </div>
                `;
                });
                html += `</div>`;
            }

            html += `</div>`;
        }

        preview.innerHTML = html;

        preview.querySelectorAll('.edit-floor-drawing-row').forEach((row) => {
            const openView = () => {
                const code = row.getAttribute('data-floor-code');
                if (code && typeof window.previewEditFloorDrawing === 'function') {
                    window.previewEditFloorDrawing(code);
                }
            };
            row.addEventListener('click', (e) => {
                if (e.target.closest('.edit-floor-drawing-delete') || e.target.closest('.edit-floor-drawing-rename') || e.target.closest('.edit-floor-drawing-replace')) return;
                if (e.target.closest('.add-drawing-drag-handle')) return;
                openView();
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openView();
                }
            });
        });
        if (existingFloors.length) markDrawinglessFloorsInEditPreview(bldg, existingFloors);
        // 2026-11-02 기존 층 1:1 교체: 파일 이름과 상관없이 이 층에 새 파일을 짝지운다(같은 층의 대기 파일은 이것 하나로 바뀜)
        preview.querySelectorAll('.edit-floor-drawing-replace').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.getAttribute('data-floor-code');
                const target = existingFloors.find((f) => f && f.floorCode === code);
                if (!code || !target) return;
                const picker = document.createElement('input');
                picker.type = 'file';
                picker.accept = 'image/*,application/pdf,.pdf';
                picker.addEventListener('change', () => {
                    const file = (picker.files || [])[0];
                    if (!file) return;
                    const item = assignDrawingUploadItems([file], [])[0];
                    item.floorCode = code;
                    item.floorLabel = target.floorLabel || window.getFloorLabelFromCode(code);
                    item.rank = window.getFloorRankFromCode(code);
                    item.matched = true;
                    window.selectedEditUploadedDrawings = (window.selectedEditUploadedDrawings || [])
                        .filter((it) => !it || it.floorCode !== code).concat([item]);
                    window.editDrawingPreviewManualOrder = true;
                    renderEditDrawingPreview();
                    window.showToast?.(`${item.floorLabel}에 "${file.name}"을(를) 짝지었습니다. 아래 「도면 저장」을 눌러야 교체됩니다.`, 'info', 4200);
                });
                picker.click();
            });
        });
        preview.querySelectorAll('.edit-floor-drawing-rename').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const code = btn.getAttribute('data-floor-code');
                if (code && await window.renameFloorDisplayName(window.currentEditingBuilding, code)) renderEditDrawingPreview();
            });
        });
        preview.querySelectorAll('.edit-floor-drawing-delete').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.getAttribute('data-floor-code');
                if (code && typeof window.deleteExistingFloorDrawing === 'function') {
                    window.deleteExistingFloorDrawing(code);
                }
            });
        });

        const editExistingList = preview.querySelector('.edit-drawing-existing-list');
        if (editExistingList && existingFloors.length > 1) {
            bindDrawingPreviewListDrag(editExistingList, '.edit-floor-drawing-row.is-draggable', (floorCodes) => {
                const b = window.currentEditingBuilding;
                if (!b || !Array.isArray(b.floorsList)) return;
                const byCode = {};
                b.floorsList.forEach((f) => { if (f && f.floorCode) byCode[f.floorCode] = f; });
                const next = [];
                floorCodes.forEach((code) => {
                    if (byCode[code]) next.push(byCode[code]);
                });
                b.floorsList.forEach((f) => {
                    if (f && f.floorCode && !floorCodes.includes(f.floorCode)) next.push(f);
                });
                b.floorsList = next;
                markFloorOrderManual(b, true);
                b.drawingFloorCodes = next.map((f) => f.floorCode).filter(Boolean);
                if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(b);
                renderEditDrawingPreview();
            });
        }

        const editNewList = preview.querySelector('.edit-drawing-new-list');
        if (editNewList && editGroups.length > 1) {
            bindDrawingPreviewListDrag(editNewList, '.add-drawing-preview-row.is-draggable', (floorCodes) => {
                window.selectedEditUploadedDrawings = reorderDrawingItemsByFloorOrder(
                    window.selectedEditUploadedDrawings || [],
                    floorCodes
                );
                window.editDrawingPreviewManualOrder = true;
                renderEditDrawingPreview();
            });
        }

        preview.querySelectorAll('.edit-drawing-floor-select').forEach(sel => {
            sel.addEventListener('change', async (ev) => {
                const idx = parseInt(ev.target.dataset.idx, 10);
                const item = (window.selectedEditUploadedDrawings || [])[idx];
                if (!item) return;
                await applyFloorSelectValue(item, ev.target.value);
                // 기존 층에 짝지었으면 그 층의 현재 이름(바꿔 둔 이름·외부 이름)을 그대로 쓴다
                const hit = existingFloors.find((f) => f && f.floorCode === item.floorCode);
                if (hit && hit.floorLabel) item.floorLabel = hit.floorLabel;
                renderEditDrawingPreview();
            });
        });
        preview.querySelectorAll('.pick-final-edit-drawing').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const idx = parseInt(ev.currentTarget.dataset.idx, 10);
                const arr = window.selectedEditUploadedDrawings || [];
                const item = arr[idx];
                if (!item) return;
                arr.splice(idx, 1);
                arr.push(item); // 배열 맨 뒤로 보내면 저장 루프에서 이 파일이 마지막으로 처리되어 실제로 저장됨
                renderEditDrawingPreview();
            });
        });
    }

    /** 도면도 마킹도 없는 층을 건물 층 목록에서 뺀다(묘비 남김 — 동기화로 되살아나지 않게) */
    function removeDrawinglessFloorFromBuilding(bldg, floorCode) {
        if (!bldg || !floorCode) return;
        rememberDeletedDrawingFloor(bldg, floorCode);
        if (bldg.floorsList) bldg.floorsList = bldg.floorsList.filter((f) => f && f.floorCode !== floorCode);
        if (Array.isArray(bldg.drawingFloorCodes)) bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter((c) => c !== floorCode);
        const fk = `${bldg.id}_${floorCode}`;
        ['defects', 'ndtData', 'ndtDisplacementGroups'].forEach((m) => {
            const map = window.state[m];
            if (map && Array.isArray(map[fk]) && map[fk].length === 0) delete map[fk];
        });
        stripDeletedDrawingFloorsFromBuilding(bldg);
        bldg._pendingCloudSync = true;
        if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(bldg);
    }

    /**
     * 2026-11-09 자동 정리 전용: 이 기기의 층 목록에서만 뺀다. 묘비를 남기지 않고 서버에도 안 올린다.
     * 「지금 서버에 도면이 없다」는 건 다른 기기가 아직 올리는 중(약한 신호·업로드 실패 재시도)일 수도 있다.
     * 예전엔 여기서 묘비를 남겨 동기화로 퍼졌고, 도면을 넣은 기기까지 그 층을 지워 「저장했는데 다 사라짐」이 됐다.
     * 도면이 나중에 올라오면 서버 층 목록과 합쳐져 다시 보인다. 진짜로 지우는 건 사용자가 누르는 「빈 층 정리」뿐.
     */
    function hideDrawinglessFloorOnThisDevice(bldg, floorCode) {
        if (!bldg || !floorCode) return;
        if (bldg.floorsList) bldg.floorsList = bldg.floorsList.filter((f) => f && f.floorCode !== floorCode);
        if (Array.isArray(bldg.drawingFloorCodes)) bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter((c) => c !== floorCode);
        const tiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (tiers && !Object.values(tiers).some(Boolean)) delete bldg.floorDrawingTiers[floorCode]; // 빈 칸이 남으면 층 목록이 바로 다시 읽는다
    }

    /** 방금 넣은 도면 중 서버에 못 올라간 층 이름 목록 */
    function floorsNotYetOnServer(bldg, items) {
        const synced = ensureCloudSyncedDrawingKeys();
        const seen = new Set();
        const out = [];
        (items || []).forEach((it) => {
            if (!it || !it.file || !it.floorCode || seen.has(it.floorCode)) return;
            seen.add(it.floorCode);
            if (!synced.has(`${bldg.id}_${it.floorCode}`)) out.push(it.floorLabel || it.floorCode);
        });
        return out;
    }

    function showDrawingsNotOnServerWarning(name, floors) {
        window.showToast(`'${name}' 도면 ${floors.length}개 층이 서버에 아직 안 올라갔습니다: ${floors.join(', ')}\n이 기기에 보관 중이며 인터넷이 되면 자동으로 다시 올립니다.`, 'warning', 9000);
    }

    /** 클라우드 도면 확인: true(있음) / false(확실히 없음) / null(모름 — 오프라인·오류). 모르면 지우지 않는다 */
    async function probeFloorDrawingOnCloud(bldg, floorCode) {
        if (!db || !window.state.companyId || !bldg || !bldg.id) return null;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
        const docId = `${bldg.id}_${floorCode}`;
        try {
            const company = db.collection('safety_app').doc(getCompanyDocId());
            const [r, p, t] = await Promise.all([
                company.collection('floorDrawings').doc(docId).get(),
                company.collection('floorDrawingPdfs').doc(docId).get(),
                company.collection('floorDrawingTiers').doc(floorDrawingTierCloudDocId(bldg.id, floorCode, 4000)).get()
            ]);
            return !!(r.exists || p.exists || t.exists);
        } catch (e) {
            console.warn('도면 없는 층 확인 실패:', docId, e);
            return null;
        }
    }

    /** 수정창 기존 층 중 도면이 확실히 없는 층 → [{floorCode, label, defects, ndt}] */
    async function findDrawinglessFloors(bldg, floors) {
        const out = [];
        for (const f of (floors || [])) {
            if (!f || !f.floorCode || floorHasDrawingData(bldg, f.floorCode)) continue;
            const idbKey = `${bldg.id}_${f.floorCode}`;
            let local = null;
            try {
                const [t4000, raster] = await Promise.all([
                    idbGetFloorDrawingTier(bldg.id, f.floorCode, 4000),
                    idbGet('floorDrawings', idbKey)
                ]);
                local = isUsableRasterDrawingUrl(t4000) || isUsableRasterDrawingUrl(raster);
            } catch (_e) { local = null; }
            if (local) continue;
            const cloud = await probeFloorDrawingOnCloud(bldg, f.floorCode);
            if (cloud !== false) continue;
            const mk = countFloorMarkings(bldg.id, f.floorCode);
            out.push({ floorCode: f.floorCode, label: f.floorLabel || f.floorCode, defects: mk.defects, ndt: mk.ndt });
        }
        return out;
    }
    window.findDrawinglessFloors = findDrawinglessFloors;

    /**
     * 2026-10-14 도면 없는 층 자동 정리(건물 진입·수정창 열 때). 「도면 없으면 층도 없다」.
     * 지우는 층 = 이 기기(메모리·IDB)에도 클라우드(그림·PDF·4000 티어)에도 도면이 확실히 없고 마킹·비파괴도 없는 층.
     * 오프라인·조회 실패·시간 초과면 아무것도 안 지운다. 마킹 있는 층은 수정창에 「도면 없음」으로만 보인다.
     */
    async function autoRemoveDrawinglessFloors(bldg, opts) {
        const o = opts || {};
        if (!bldg || !bldg.id) return [];
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];
        if (!db || !window.state.companyId) return [];
        const floors = window.getBuildingAvailableFloors(bldg) || [];
        if (!floors.length) return [];
        let empty = null;
        try {
            empty = await Promise.race([
                findDrawinglessFloors(bldg, floors),
                new Promise((res) => setTimeout(() => res(null), o.timeoutMs || 8000))
            ]);
        } catch (_e) { empty = null; }
        if (!Array.isArray(empty)) return [];
        const removable = empty.filter((e) => !e.defects && !e.ndt);
        if (!removable.length) return [];
        removable.forEach((e) => hideDrawinglessFloorOnThisDevice(bldg, e.floorCode));
        if (state.currentBuildingId === bldg.id && removable.some((e) => e.floorCode === state.currentFloor)) {
            state.currentFloor = '';
        }
        console.info('[floor] 도면 없는 층 자동 정리:', bldg.id, removable.map((e) => e.floorCode));
        if (!o.silent && typeof window.showToast === 'function') {
            window.showToast(`도면 없는 층을 목록에서 뺐습니다: ${removable.map((e) => e.label).join(', ')}`, 'info', 4000);
        }
        return removable.map((e) => e.floorCode);
    }
    window.autoRemoveDrawinglessFloors = autoRemoveDrawinglessFloors;

    let _drawinglessCheckToken = 0;
    async function markDrawinglessFloorsInEditPreview(bldg, floors) {
        const token = ++_drawinglessCheckToken;
        const empty = await findDrawinglessFloors(bldg, floors);
        if (token !== _drawinglessCheckToken || window.currentEditingBuilding !== bldg) return;
        const preview = document.getElementById('editDrawingSortPreview');
        if (!preview) return;
        empty.forEach((e) => {
            const row = preview.querySelector(`.edit-floor-drawing-row[data-floor-code="${CSS.escape(e.floorCode)}"] .edit-floor-drawing-badge`);
            if (row) {
                row.textContent = (e.defects || e.ndt) ? `⚠️ 도면 없음 · 마킹 ${e.defects + e.ndt}건 — 도면을 다시 넣거나 삭제` : '⚠️ 도면 없음';
                row.style.color = '#dc2626';
            }
        });
        const removable = empty.filter((e) => !e.defects && !e.ndt);
        let bar = preview.querySelector('.edit-drawingless-floor-bar');
        if (!empty.length) { if (bar) bar.remove(); return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'edit-drawingless-floor-bar';
            bar.style.cssText = 'font-size:0.78rem; color:#b91c1c; background:rgba(220,38,38,0.08); border:1px solid #ef4444; border-radius:6px; padding:0.45rem 0.6rem; margin:0.35rem 0; display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;';
            const list = preview.querySelector('.edit-drawing-existing-list');
            if (list) list.parentElement.insertBefore(bar, list); else preview.appendChild(bar);
        }
        const withMarks = empty.length - removable.length;
        bar.innerHTML = `<span>도면 없는 층 ${empty.length}개${withMarks ? ` (마킹 있는 ${withMarks}개는 자동으로 안 지움)` : ''}</span>`
            + (removable.length ? `<button type="button" class="btn btn-sm btn-outline" style="border-color:#ef4444; color:#ef4444; font-size:0.72rem; padding:0.1rem 0.5rem;">빈 층 ${removable.length}개 정리</button>` : '');
        const btn = bar.querySelector('button');
        if (btn) btn.addEventListener('click', async () => {
            const names = removable.map((e) => e.label).join(', ');
            if (!await window.appConfirm(`도면도 마킹도 없는 층을 목록에서 뺄까요?\n${names}`)) return;
            removable.forEach((e) => removeDrawinglessFloorFromBuilding(bldg, e.floorCode));
            if (state.currentBuildingId === bldg.id && removable.some((e) => e.floorCode === state.currentFloor)) {
                const avail = window.getBuildingAvailableFloors(bldg);
                if (avail[0] && typeof loadFloorDrawing === 'function') loadFloorDrawing(avail[0].floorCode);
            }
            if (typeof populateFloorSelectDropdown === 'function') populateFloorSelectDropdown(bldg);
            saveStateToLocalStorage();
            if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
            renderEditDrawingPreview();
            window.showToast?.(`빈 층 ${removable.length}개를 정리했습니다.`, 'success', 2600);
        });
    }

    window.deleteExistingFloorDrawing = async function(floorCode) {
        const bldg = window.currentEditingBuilding;
        if (!bldg || !floorCode) return;

        const floorKey = `${bldg.id}_${floorCode}`;
        const defectCount = ((window.state.defects && window.state.defects[floorKey]) || []).length;
        const ndtCount = ((window.state.ndtData && window.state.ndtData[floorKey]) || []).length;
        const label = (typeof window.getFloorLabelFromCode === 'function')
            ? window.getFloorLabelFromCode(floorCode)
            : floorCode;
        let msg = `정말 ${label} (${floorCode}) 도면을 삭제할까요?`;
        if (defectCount > 0 || ndtCount > 0) {
            msg += `\n\n이 층의 마킹 ${defectCount}건`;
            if (ndtCount > 0) msg += `, 비파괴 ${ndtCount}건`;
            msg += '도 함께 삭제됩니다.';
        }
        if (!await window.confirmDelete(msg)) return;

        // 마킹·비파괴를 지우기 전에 이 층을 기기에 남긴다. 실패해도 삭제는 막지 않는다.
        let drawingDeleteSnaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            drawingDeleteSnaps = await snapshotBeforeBulkOp('층 도면 삭제', [floorKey]);
        }

        // 동기화·hydrate가 클라우드/IDB에서 되살리기 전에 tombstone을 먼저 남긴다
        rememberDeletedDrawingFloor(bldg, floorCode);
        // 클라우드·IDB 정리가 끝날 때까지는 남아 있는 도면이 "증거"가 되면 안 된다.
        // (b924940이 이 가드를 만들었지만 넣는 곳이 없어 동작하지 않았다)
        _sessionDeletingDrawingFloors.add(floorKey);
        bldg._pendingCloudSync = true;

        if (bldg.floorDrawings && bldg.floorDrawings[floorCode]) {
            delete bldg.floorDrawings[floorCode];
        }
        if (bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[floorCode]) {
            delete bldg.floorDrawingPdfs[floorCode];
        }
        if (bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode]) {
            delete bldg.floorDrawingTiers[floorCode];
        }
        if (bldg.floorDrawingSources && bldg.floorDrawingSources[floorCode]) {
            delete bldg.floorDrawingSources[floorCode];
        }
        clearLocalDrawingPersistFlags(bldg.id, floorCode);
        await clearFloorDrawingTierCacheForFloor(bldg.id, floorCode, true);
        clearFloorDrawingRotation(bldg.id, floorCode);
        if (typeof invalidateCloudDrawingFloorCodesCache === 'function') {
            invalidateCloudDrawingFloorCodesCache(bldg);
        }

        const defects = (window.state.defects && window.state.defects[floorKey]) || [];
        if (defects.length) {
            defects.slice().forEach((d) => {
                if (!d || !d.id) return;
                if (typeof trackDefectDeletion === 'function') trackDefectDeletion(floorKey, d.id, d, { wallClock: true });
                if (typeof deleteAllPhotosForDefect === 'function') {
                    try { deleteAllPhotosForDefect(d, { deferCloudFloorKey: floorKey }); } catch (_e) { /* ignore */ }
                }
            });
            delete window.state.defects[floorKey];
        }

        const ndtItems = (window.state.ndtData && window.state.ndtData[floorKey]) || [];
        if (ndtItems.length) {
            ndtItems.slice().forEach((item) => {
                if (!item || !item.id) return;
                if (typeof trackNdtDeletion === 'function') trackNdtDeletion(floorKey, item.id, item, { wallClock: true });
            });
            delete window.state.ndtData[floorKey];
            // 층 삭제 전 자동 백업으로 되살릴 수 있으니 이 기기 사본은 남기고 클라우드만 정리
            releaseStrengthPhotosOfItems(bldg.id, ndtItems.slice(), { keepLocal: true, deferCloudFloorKey: floorKey });
        }
        if (window.state.ndtDisplacementGroups && window.state.ndtDisplacementGroups[floorKey]) {
            // 부동침하·부재처짐 구역도 묘비를 남긴다 — 안 남기면 서버에 있던 구역이 다음 동기화에서
            // 되살아난다(2026-09-21 감사). 구역 묘비는 비파괴 핀과 같은 deletedNdtIds를 쓴다.
            const removedGroups = (window.state.ndtDisplacementGroups[floorKey] || []).slice();
            removedGroups.forEach((g) => {
                if (g && g.id && typeof trackNdtDeletion === 'function') trackNdtDeletion(floorKey, g.id, g, { wallClock: true });
            });
            delete window.state.ndtDisplacementGroups[floorKey];
            // 구역 현장 사진 — 비파괴 항목과 같이 이 기기 사본은 남기고 클라우드만 정리
            releaseStrengthPhotosOfItems(bldg.id, removedGroups, { keepLocal: true, deferCloudFloorKey: floorKey });
        }

        // 가이드·개수 점·메모·부재·평가 구역도 묘비와 함께 지운다 — 같은 층에 새 도면을 넣으면
        // 옛 표시가 새 도면 위에 엉뚱하게 되살아났다(2026-10-13)
        try {
            window.BSA?.drawingResize?.purgeFloorMarkings?.(window.state, floorKey, window.BSA, Date.now());
        } catch (e) { console.warn('층 표시 정리 실패:', floorKey, e); }

        if (bldg.floorsList) {
            bldg.floorsList = bldg.floorsList.filter((f) => f.floorCode !== floorCode);
        }
        if (Array.isArray(bldg.drawingFloorCodes)) {
            bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter((c) => c !== floorCode);
        }
        stripDeletedDrawingFloorsFromBuilding(bldg);

        if (window.state.currentBuildingId === bldg.id && window.state.currentFloor === floorCode) {
            const avail = (typeof window.getBuildingAvailableFloors === 'function')
                ? window.getBuildingAvailableFloors(bldg) : (bldg.floorsList || []);
            const next = (avail[0] && avail[0].floorCode) || '1F';
            window.state.currentFloor = next;
            if (typeof loadFloorDrawing === 'function' && next !== floorCode) {
                try { loadFloorDrawing(next); } catch (_e) { /* ignore */ }
            }
        }

        if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
            discardStalePendingRemoteAfterLocalPinEdit();
        }
        if (typeof populateFloorSelectDropdown === 'function') populateFloorSelectDropdown(bldg);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        // 작업 직후 상태 — 되살리기가 "이 삭제가 지운 것"만 골라내는 기준
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(drawingDeleteSnaps);
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        renderEditDrawingPreview();

        window.showLoading?.(`${label} 도면 삭제 중...`);
        try {
            await Promise.all([
                idbDelete('floorDrawings', floorKey),
                idbDelete('floorDrawingPdfs', floorKey),
                idbDelete('floorDrawingSources', floorKey),
                deleteFloorDrawingRasterFromCloud(bldg.id, floorCode),
                deleteFloorDrawingPdfFromCloud(bldg.id, floorCode),
                deleteFloorDrawingTiersFromCloud(bldg.id, floorCode)
            ]);
        } catch (e) {
            console.warn('도면 삭제 정리 실패:', floorKey, e);
        } finally {
            // 클라우드·IDB 정리 끝 — 이후부터는 증거가 다시 생기면(재업로드) heal 가능
            _sessionDeletingDrawingFloors.delete(floorKey);
            clearPendingDrawingUpload(floorKey);
            if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.delete(floorKey);
            if (window._cloudSyncedDrawingKeys) window._cloudSyncedDrawingKeys.delete(floorKey);
            if (window._cloudSyncedTierKeys) {
                (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
                    window._cloudSyncedTierKeys.delete(`${bldg.id}_${floorCode}_${d}`);
                });
            }
            if (typeof window.resetLoadingOverlay === 'function') window.resetLoadingOverlay();
            else if (typeof window.hideLoading === 'function') window.hideLoading();
        }

        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        else if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        window.showToast?.(`${label} 도면·마킹을 삭제했습니다.`, 'success', 3200);
    };

    // Handling Additional Drawing File Selection
    // 이미지 입력과 PDF 입력, 두 개의 <input type=file>에서 선택한 파일을 같은 목록에 누적
    function handleEditBuildingFilesSelected(files) {
        if (files.length === 0) return;

        const bldg = window.currentEditingBuilding;
        const used = [];
        ((bldg && bldg.floorsList) || []).forEach((f) => {
            if (f && f.floorCode && !isDeletedDrawingFloor(bldg, f.floorCode)) used.push(f.floorCode);
        });
        usedFloorCodesFromItems(window.selectedEditUploadedDrawings).forEach((c) => used.push(c));

        const parsedItems = assignDrawingUploadItems(files, used);

        window.selectedEditUploadedDrawings = (window.selectedEditUploadedDrawings || []).concat(parsedItems);
        const hasUnmatched = parsedItems.some((it) => it.matched === false);
        if (hasUnmatched) {
            window.editDrawingPreviewManualOrder = true;
            if (bldg) markFloorOrderManual(bldg, true);
        } else if (!window.editDrawingPreviewManualOrder) {
            window.selectedEditUploadedDrawings = window.sortFloorsLowToHigh(window.selectedEditUploadedDrawings);
        }
        renderEditDrawingPreview();

        const unmatchedCount = parsedItems.filter(it => it.matched === false).length;
        if (unmatchedCount > 0) {
            window.showToast(`${unmatchedCount}개 파일은 층을 파일명에서 못 찾았습니다. 목록에서 층을 고르기 전에는 저장되지 않습니다.`, 'warning', 5500);
        }
    }

    const inputEditDrawings = document.getElementById('inputEditBuildingDrawings');
    if (inputEditDrawings) {
        inputEditDrawings.addEventListener('change', (e) => {
            handleEditBuildingFilesSelected(Array.from(e.target.files || []));
            e.target.value = '';
        });
    }

    const inputEditDrawingsPdf = document.getElementById('inputEditBuildingDrawingsPdf');
    if (inputEditDrawingsPdf) {
        inputEditDrawingsPdf.addEventListener('change', (e) => {
            handleEditBuildingFilesSelected(Array.from(e.target.files || []));
            e.target.value = '';
        });
    }

    // Save Edit Building & Merge New Drawings Action
    const btnSaveEditBuilding = document.getElementById('btnSaveEditBuilding');
    if (btnSaveEditBuilding) {
        btnSaveEditBuilding.addEventListener('click', async () => {
            const bldg = window.currentEditingBuilding;
            if (!bldg) return;
            if (await blockSaveForUnassignedDrawingFloors(window.selectedEditUploadedDrawings)) return;

            const siteNameInput = document.getElementById('inputEditBuildingSiteName');
            const dongInput = document.getElementById('inputEditBuildingDong');
            const siteName = (siteNameInput ? siteNameInput.value : '').trim();
            const multiDong = readSiteLayoutRadio('editBuildingSiteLayout', false);
            const dong = multiDong ? normalizeDongLabel(dongInput ? dongInput.value : '') : '';
            if (!siteName) {
                window.showToast('현장명을 입력해 주세요.', 'warning');
                if (siteNameInput) siteNameInput.focus();
                return;
            }
            if (multiDong && dong) {
                const rkChk = `${document.getElementById('inputEditBuildingInspectionYear')?.value || bldg.inspectionYear || '2026년'}_${document.getElementById('inputEditBuildingInspectionPeriod')?.value || bldg.inspectionPeriod || '하반기'}`;
                if (dongNameTakenInSiteRound(siteName, rkChk, dong, bldg.id)) {
                    window.showToast(`이 현장·회차에 "${dong}"이(가) 이미 있습니다.`, 'warning', 4000);
                    dongInput?.focus();
                    return;
                }
            }
            const name = composeBuildingDisplayName(siteName, dong);
            const nameInput = document.getElementById('inputEditBuildingName');
            if (nameInput) nameInput.value = name;

            const address = (document.getElementById('inputEditBuildingAddress')?.value || '').trim() || bldg.address;
            const inspector = (document.getElementById('inputEditBuildingInspector')?.value || '').trim()
                || bldg.inspector || window.state.userName || '';
            const contactPhone = (document.getElementById('inputEditBuildingContactPhone')?.value || '').trim();
            const floors = (document.getElementById('inputEditBuildingFloors')?.value || '').trim() || bldg.floors;
            const date = document.getElementById('inputEditBuildingDate')?.value || bldg.date;
            const prevRoundKey = (typeof getBuildingSurveyRoundKey === 'function')
                ? getBuildingSurveyRoundKey(bldg)
                : `${bldg.inspectionYear || '2026년'}_${bldg.inspectionPeriod || '하반기'}`;
            const inspectionType = document.getElementById('inputEditBuildingInspectionType')?.value || bldg.inspectionType || '정밀안전점검';
            const inspectionYear = document.getElementById('inputEditBuildingInspectionYear')?.value || bldg.inspectionYear || '2026년';
            const inspectionPeriod = document.getElementById('inputEditBuildingInspectionPeriod')?.value || bldg.inspectionPeriod || '하반기';
            const structureType = (document.getElementById('inputEditBuildingStructureType')?.value || '').trim();
            const facilityGrade = document.getElementById('inputEditBuildingFacilityGrade')?.value || '';
            const completionDate = document.getElementById('inputEditBuildingCompletionDate')?.value || '';
            const notes = document.getElementById('inputEditBuildingNotes')?.value || '';

            // Process newly added drawings and merge into existing bldg
            if (!bldg.floorDrawings) bldg.floorDrawings = {};
            if (!bldg.floorsList) bldg.floorsList = [];

            const newFiles = Array.isArray(window.selectedEditUploadedDrawings) ? window.selectedEditUploadedDrawings : [];

            // 신규추가 파일 중 같은 층으로 지정된 것이 있으면 저장 전 확인 (마지막 파일만 남고 나머지는 사라짐)
            if (newFiles.length > 0) {
                const dupCounts = {};
                newFiles.forEach(it => { dupCounts[it.floorCode] = (dupCounts[it.floorCode] || 0) + 1; });
                const dupCodes = Object.keys(dupCounts).filter(c => dupCounts[c] > 1);
                if (dupCodes.length > 0) {
                    const proceed = await window.appConfirm(`⚠️ 같은 층으로 지정된 도면이 있습니다 (${dupCodes.join(', ')}).\n계속 저장하면 같은 층끼리는 마지막 파일만 남고 나머지는 사라집니다.\n계속하시겠습니까?`);
                    if (!proceed) return;
                }
            }

            if (newFiles.length > 0) {
                window.showLoading(`도면 ${newFiles.length}개 변환 중...`);
                try {
                    for (let i = 0; i < newFiles.length; i++) {
                        const item = newFiles[i];
                        // 사용자가 이 층 도면을 직접 다시 올렸다 — 확실한 재등록이므로 묘비를 푼다
                        forgetDeletedDrawingFloor(bldg, item.floorCode, { force: true });
                        // Check if floor already exists in floorsList, if not add it
                        const existingIdx = bldg.floorsList.findIndex(f => f.floorCode === item.floorCode);
                        const floorAddedNow = existingIdx < 0 && !floorHasDrawingData(bldg, item.floorCode);
                        if (existingIdx < 0) {
                            bldg.floorsList.push({
                                floorCode: item.floorCode,
                                floorLabel: item.floorLabel || window.getFloorLabelFromCode(item.floorCode)
                            });
                        }
                        // 변환 전에 층 목록부터 고정·저장 — 중간에 새로고침해도 점검층이 안 사라지게
                        syncBuildingDrawingFloorCodes(bldg);
                        saveStateToLocalStorage();

                        if (item.file) {
                            try {
                                window.updateLoadingText(`도면 ${i + 1}/${newFiles.length} 변환 중... (${item.floorCode || ''})`);
                                const preparePromise = (typeof window.prepareFloorDrawingUpload === 'function')
                                    ? window.prepareFloorDrawingUpload(item.file)
                                    : window.compressDrawingImage(item.file).then((rasterDataUrl) => ({ rasterDataUrl, pdfDataUrl: null }));
                                const prepared = await withTimeout(preparePromise, 120000, 'prepare-drawing');
                                await invalidateFloorDrawingBeforeReplace(bldg, item.floorCode);
                                clearFloorDrawingRotation(bldg.id, item.floorCode);
                                if (prepared && prepared.pdfDataUrl && bldg.floorDrawingPdfs) {
                                    delete bldg.floorDrawingPdfs[item.floorCode];
                                }
                                let rasterUploaded = false;
                                if (prepared && prepared.rasterDataUrl) {
                                    bldg.floorDrawings[item.floorCode] = prepared.rasterDataUrl;
                                    rasterUploaded = await uploadFloorDrawing(bldg.id, item.floorCode, prepared.rasterDataUrl);
                                }
                                if (prepared && prepared.tiers) {
                                    if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
                                    bldg.floorDrawingTiers[item.floorCode] = prepared.tiers;
                                    clearFloorTierPersistedFlags(bldg.id, item.floorCode);
                                    await uploadFloorDrawingTiers(bldg.id, item.floorCode, prepared.tiers);
                                } else if (prepared && prepared.rasterDataUrl) {
                                    // 티어 없이 압축만 된 경우에도 옛 티어가 남지 않게 4000만 심는다
                                    if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
                                    bldg.floorDrawingTiers[item.floorCode] = { '4000': prepared.rasterDataUrl };
                                    clearFloorTierPersistedFlags(bldg.id, item.floorCode);
                                    await uploadFloorDrawingTiers(bldg.id, item.floorCode, bldg.floorDrawingTiers[item.floorCode]);
                                }
                                if (prepared && prepared.sourceDataUrl) {
                                    cacheFloorDrawingSourceToDevice(bldg, item.floorCode, prepared.sourceDataUrl);
                                }
                                if (prepared && prepared.pdfDataUrl) {
                                    clearFloorPdfRemoved(bldg, item.floorCode);
                                    if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
                                    bldg.floorDrawingPdfs[item.floorCode] = prepared.pdfDataUrl;
                                    _idbPersistedPdfKeys.delete(`${bldg.id}_${item.floorCode}`);
                                    if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.delete(`${bldg.id}_${item.floorCode}`);
                                    const pdfUploaded = await uploadFloorDrawingPdf(bldg.id, item.floorCode, prepared.pdfDataUrl);
                                    if (pdfUploaded) stampFloorDrawingUpdated(bldg, item.floorCode);
                                } else if (prepared && prepared.rasterDataUrl) {
                                    // PDF 없는 그림으로 바꿈 — 옛 PDF가 남으면 그 층 핀이 옛 PDF 비율로 어긋난다
                                    await markFloorPdfRemoved(bldg, item.floorCode);
                                    // 2026-10-20 그림(PNG·JPG) 도면으로 바꿔도 「다시 넣은 시각」을 찍는다 — 예전엔 PDF일 때만 찍어서
                                    // 다른 기기가 기기에 받아 둔 옛 그림(IndexedDB)을 계속 보여 줬다(지우고 새 도면 넣어도 옛 도면이 보임)
                                    if (rasterUploaded) stampFloorDrawingUpdated(bldg, item.floorCode);
                                }
                                
                                bumpDrawingEpoch(bldg, item.floorCode);
                                bldg._drawingReplaceGuard = bldg._drawingReplaceGuard || {};
                                bldg._drawingReplaceGuard[item.floorCode] = Date.now() + 120000;
await persistFloorDrawingAssetsForFloor(bldg, item.floorCode);
                                syncBuildingDrawingFloorCodes(bldg);
                                saveStateToLocalStorage();
                            } catch (err) {
                                console.error('Edit drawing compression error:', err);
                                // 2026-10-14 도면 없는 층을 남기지 않는다: 이번에 새로 만든 층이고 도면·마킹이 없으면 뺀다
                                const mk = countFloorMarkings(bldg.id, item.floorCode);
                                if (floorAddedNow && !floorHasDrawingData(bldg, item.floorCode) && !mk.defects && !mk.ndt) {
                                    removeDrawinglessFloorFromBuilding(bldg, item.floorCode);
                                    saveStateToLocalStorage();
                                }
                                window.showToast(`도면 ${item.floorCode || (i + 1)} 변환 실패 — 다음 도면으로 진행합니다`, 'warning');
                            }
                        }
                    }
                } finally {
                    window.hideLoading();
                }
                if (typeof invalidateCloudDrawingFloorCodesCache === 'function') {
                    invalidateCloudDrawingFloorCodesCache(bldg);
                }
            }

            // 사용자가 지정한 층 이름·순서를 유지한 채 도면 층 목록을 고정
            syncBuildingDrawingFloorCodes(bldg);
            const fi = window.BSA && window.BSA.floorIdentity;
            if (fi && typeof fi.normalizeUserLabel === 'function') {
                bldg.floorsList = (bldg.floorsList || []).map((f) => ({
                    floorCode: f.floorCode,
                    floorLabel: fi.normalizeUserLabel(f.floorCode, f.floorLabel)
                }));
            }
            const hasCustomFloor = (bldg.floorsList || []).some((f) =>
                f && f.floorCode && fi && typeof fi.isStandardFloorCode === 'function'
                    ? !fi.isStandardFloorCode(f.floorCode)
                    : false
            );
            if (hasCustomFloor || window.editDrawingPreviewManualOrder) {
                // 순서를 실제로 만졌을 때만 시각을 갱신 — 점검자·현장명만 고친 저장이
                // 다른 기기의 새 순서를 이기지 않게 한다
                markFloorOrderManual(bldg, !!window.editDrawingPreviewManualOrder);
            }

            // Update building metadata
            const prevSiteName = getBuildingSiteName(bldg);
            bldg.siteName = siteName;
            bldg.dong = dong;
            bldg.multiDong = !!multiDong;
            bldg.name = composeBuildingStorageName(siteName, dong);
            bldg.siteVaultKey = siteVaultDocId(siteName);
            bldg.address = address;
            bldg.inspector = inspector;
            bldg.contactPhone = contactPhone;
            bldg.floors = floors;
            // 2026-10-20 회차별 점검일 — 이 칸은 고른 회차의 점검일. 다른 회차 날짜는 아래 목록에서 따로 저장.
            const editRoundDateKey = `${inspectionYear}_${inspectionPeriod}`;
            const editRoundDatePrev = (typeof getBuildingInspectionDate === 'function') ? (getBuildingInspectionDate(bldg, editRoundDateKey) || '') : '';
            applyEditRoundDates(bldg, editRoundDateKey, date);
            bldg.date = date;
            bldg.inspectionType = inspectionType;
            bldg.inspectionYear = inspectionYear;
            bldg.inspectionPeriod = inspectionPeriod;
            const inArr = (window.state.buildings || []).find((item) => item && item.id === bldg.id);
            if (inArr && inArr !== bldg) {
                inArr.inspectionType = inspectionType;
                inArr.inspectionYear = inspectionYear;
                inArr.inspectionPeriod = inspectionPeriod;
                markBuildingMetaDirty(inArr);
            }
            markBuildingMetaDirty(bldg);
            applyInspectionSelectsFromBuilding(bldg);
            const siteKey = getBuildingSiteName(bldg);
            const newRoundKey = (typeof getBuildingSurveyRoundKey === 'function')
                ? getBuildingSurveyRoundKey(bldg)
                : `${inspectionYear}_${inspectionPeriod}`;
            if (!bldg.latestSurveyRoundKey || bldg.latestSurveyRoundKey === prevRoundKey) {
                bldg.latestSurveyRoundKey = newRoundKey;
            }
            if (inArr && inArr !== bldg) {
                inArr.latestSurveyRoundKey = bldg.latestSurveyRoundKey;
                // 점검 날짜도 목록의 건물에 같이(수정 창 복사본이 따로일 때 목록이 옛 날짜로 남지 않게)
                inArr.date = bldg.date;
                inArr.roundDates = JSON.parse(JSON.stringify(bldg.roundDates || {}));
            }
            if (siteKey && prevRoundKey) {
                filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds).forEach((sib) => {
                    if (!sib || sib.id === bldg.id) return;
                    if (getBuildingSiteName(sib) !== siteKey) return;
                    if (getBuildingSurveyRoundKey(sib) !== prevRoundKey) return;
                    sib.inspectionType = inspectionType;
                    sib.inspectionYear = inspectionYear;
                    sib.inspectionPeriod = inspectionPeriod;
                    if (!sib.latestSurveyRoundKey || sib.latestSurveyRoundKey === prevRoundKey) {
                        sib.latestSurveyRoundKey = newRoundKey;
                    }
                    markBuildingMetaDirty(sib);
                });
            }
            // 2026-11-04 이 창에서 점검 날짜를 바꿨으면 같은 현장·같은 회차의 다른 동에도 같이 적용한다(회차 목록 점검일과 같은 규칙).
            // 건축물 목록의 「📅 점검 날짜」는 최종 회차 동들 중 가장 이른 날짜라, 이 동만 바꾸면 다른 동의 옛 날짜가 그대로 보였다.
            if (siteKey && date && date !== editRoundDatePrev && window.BSA && window.BSA.buildingMetaMerge) {
                const mmEdit = window.BSA.buildingMetaMerge;
                filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds).forEach((sib) => {
                    if (!sib || sib.id === bldg.id || (inArr && sib.id === inArr.id)) return;
                    if (getBuildingSiteName(sib) !== siteKey) return;
                    if (getBuildingSurveyRoundKey(sib) !== newRoundKey) return;
                    // 이 동에 원래 날짜가 없었으면(창이 오늘 날짜를 기본으로 채움) 이미 날짜가 있는 동은 건드리지 않는다
                    if (!editRoundDatePrev && (getBuildingInspectionDate(sib, newRoundKey) || '')) return;
                    if (mmEdit.setRoundDate(sib, newRoundKey, date)) markBuildingMetaDirty(sib);
                });
            }
            if (siteKey && window.state.dashboardSiteKey === siteKey) {
                window.state.dashboardRoundKey = newRoundKey;
            }
            bldg.structureType = structureType;
            const prevFacilityGrade = bldg.facilityGrade || '';
            bldg.facilityGrade = facilityGrade;
            if (facilityGrade !== prevFacilityGrade) {
                applyBuildingLocationMapLegend(bldg, { forceDefault: true });
            }
            bldg.completionDate = completionDate;
            bldg.notes = notes;
            setSiteMultiDongFlag(siteName, multiDong);
            if (prevSiteName && prevSiteName !== siteName) {
                // 현장명을 바꾼 경우 이전 키에 남은 형제 동은 건드리지 않음
            }

            // Save state & sync
            syncBuildingDrawingFloorCodes(bldg);
            // 방금 저장한 층은 서버 tombstone에 남아 있어도 로컬에서 삭제목록을 비운다
            // (사용자가 직접 저장한 결과라 force)
            (bldg.drawingFloorCodes || []).forEach((code) => {
                if (code && typeof forgetDeletedDrawingFloor === 'function') {
                    forgetDeletedDrawingFloor(bldg, code, { force: true });
                }
            });
            (bldg.floorsList || []).forEach((f) => {
                if (f && f.floorCode && typeof forgetDeletedDrawingFloor === 'function') {
                    forgetDeletedDrawingFloor(bldg, f.floorCode, { force: true });
                }
            });
            const floorsForKeep = (bldg.floorsList && bldg.floorsList.length)
                ? bldg.floorsList
                : (bldg.drawingFloorCodes || []).map((c) => ({ floorCode: c }));
            if (floorsForKeep.length) {
                const preferNew = (window.selectedEditUploadedDrawings || [])
                    .map((it) => it && it.floorCode)
                    .filter(Boolean)
                    .pop();
                const keepCode = (preferNew && floorsForKeep.some((f) => f.floorCode === preferNew))
                    ? preferNew
                    : floorsForKeep[0].floorCode;
                window.state.currentFloor = keepCode;
                window.state.currentBuildingId = bldg.id;
            }
            window.showLoading('도면 저장 중...');
            try {
                await persistBuildingDrawingAssetsNow(bldg);
            } finally {
                window.resetLoadingOverlay();
            }
            window.selectedEditUploadedDrawings = [];
            if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') {
                discardStalePendingRemoteAfterLocalPinEdit();
            }
            saveStateToLocalStorage();
            if (typeof refreshCurrentBuildingFromState === 'function') refreshCurrentBuildingFromState();
            // 2026-10-19 준공일을 고친 뒤 열려 있는 비파괴 입력창의 재령·α·수명 안내도 바로 다시 계산
            try {
                if (typeof recalcAllStrengthSlots === 'function') recalcAllStrengthSlots();
                if (typeof recalcNdtCarbonation === 'function') recalcNdtCarbonation();
            } catch (_e) { /* 입력창이 없으면 무시 */ }
            applyInspectionSelectsFromBuilding(
                (window.state.buildings || []).find((item) => item && item.id === bldg.id) || bldg
            );
            if (typeof syncStateToFirebase === 'function') syncStateToFirebase();

            window.closeEditBuildingModalFunc();

            renderDashboard();
            populateFloorSelectDropdown(bldg);

            if (window.state.currentBuildingId === bldg.id) {
                await window.selectBuildingAndInspect(bldg);
                const replacedCodes = (Array.isArray(newFiles) ? newFiles : [])
                    .map((it) => it && it.floorCode)
                    .filter(Boolean);
                const cur = window.state.currentFloor;
                if (cur && replacedCodes.includes(cur) && typeof loadFloorDrawing === 'function') {
                    loadFloorDrawing(cur, { forceClear: true });
                }
            }

            const floorCount = (bldg.floorsList && bldg.floorsList.length)
                || (bldg.drawingFloorCodes && bldg.drawingFloorCodes.length)
                || 0;
            const notOnServer = floorsNotYetOnServer(bldg, newFiles);
            if (notOnServer.length) showDrawingsNotOnServerWarning(bldg.name, notOnServer);
            else window.showToast(`'${bldg.name}' 명칭 및 도면 저장이 완료되었습니다. (총 ${floorCount}개 층)`, 'success');
        });
    }

    // Delete Building Action → 휴지통(약 30일) 후 영구 삭제
    const btnDeleteBuilding = document.getElementById('btnDeleteBuilding');
    if (btnDeleteBuilding) {
        btnDeleteBuilding.addEventListener('click', async () => {
            const bldg = window.currentEditingBuilding;
            if (!bldg) return;

            if (!await window.confirmDelete(
                `건축물 '${bldg.name}'을(를) 휴지통으로 보낼까요?\n\n` +
                `· 약 30일간 보관되며 그 안에 복원할 수 있습니다.\n` +
                `· 30일이 지나면 도면·결함과 함께 영구 삭제됩니다.`
            )) return;

            if (window.moveBuildingToTrash(bldg)) {
                window.showToast(`'${bldg.name}'을(를) 휴지통으로 옮겼습니다. 30일 내 복원 가능`, 'success', 5000);
            }
        });
    }

    const btnOpenBuildingBackup = document.getElementById('btnOpenBuildingBackup');
    if (btnOpenBuildingBackup) {
        btnOpenBuildingBackup.addEventListener('click', () => {
            if (window.currentEditingBuilding) window.openBuildingBackupModal(window.currentEditingBuilding);
        });
    }

    const btnOpenOfflinePrep = document.getElementById('btnOpenOfflinePrep');
    if (btnOpenOfflinePrep) {
        btnOpenOfflinePrep.addEventListener('click', () => {
            if (window.currentEditingBuilding) window.openOfflinePrepModal(window.currentEditingBuilding);
        });
    }

    const btnStartNextInspectionRound = document.getElementById('btnStartNextInspectionRound');
    if (btnStartNextInspectionRound) {
        btnStartNextInspectionRound.addEventListener('click', () => {
            if (typeof window.startNextInspectionRoundFromEdit === 'function') {
                window.startNextInspectionRoundFromEdit();
            }
        });
    }

    const btnCloseEditBuildingModal = document.getElementById('btnCloseEditBuildingModal');
    if (btnCloseEditBuildingModal) {
        btnCloseEditBuildingModal.addEventListener('click', window.closeEditBuildingModalFunc);
    }

    const btnCancelEditBuilding = document.getElementById('btnCancelEditBuilding');
    if (btnCancelEditBuilding) {
        btnCancelEditBuilding.addEventListener('click', window.closeEditBuildingModalFunc);
    }

    const btnCloseDrawingPreviewLightbox = document.getElementById('btnCloseDrawingPreviewLightbox');
    if (btnCloseDrawingPreviewLightbox) {
        btnCloseDrawingPreviewLightbox.addEventListener('click', () => window.closeDrawingPreviewLightbox());
    }
    const drawingPreviewLightbox = document.getElementById('drawingPreviewLightbox');
    if (drawingPreviewLightbox) {
        drawingPreviewLightbox.addEventListener('click', (e) => {
            if (e.target === drawingPreviewLightbox) window.closeDrawingPreviewLightbox();
        });
    }

