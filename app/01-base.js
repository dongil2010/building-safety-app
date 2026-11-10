// @@app-part 01-base.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
/* ==========================================================================
   스마트 건축물 안전점검 현장점검 시스템 — UI 부트스트랩
   전역 상태·IndexedDB·이미지 헬퍼: js/core/state.js
   탭 진입점: js/tabs/*.js
   ========================================================================== */

// --- 3. DOM CONTENT LOADED MAIN MODULE ---
document.addEventListener('DOMContentLoaded', () => {
    
    // UI Elements Map
    const elements = {
        appTitle: document.getElementById('navBuildingName'),
        headerSelectorGroup: document.getElementById('headerSelectorGroup'),
        headerReportActions: document.getElementById('headerReportActions'),
        mainNavTabs: document.getElementById('mainNavTabs'),
        navBuildingTabs: document.getElementById('navBuildingTabs'),
        floorSelect: document.getElementById('floorSelect'),
        buildingListGrid: document.getElementById('buildingListGrid'),
        
        // Modals
        addBuildingModal: document.getElementById('addBuildingModal'),
        editBuildingModal: document.getElementById('editBuildingModal'),
        defectModal: document.getElementById('defectModal'),
        reportPreviewModal: document.getElementById('reportPreviewModal'),
        mobileQrModal: document.getElementById('mobileQrModal'),
        modalReportPreviewBody: document.getElementById('modalReportPreviewBody'),
        
        // Canvas & Viewport
        canvasContainer: document.getElementById('canvasContainer'),
        planCanvas: document.getElementById('planCanvas'),
        mapZoomOverlay: document.getElementById('mapZoomOverlay'),
        mapDrawingEmpty: document.getElementById('mapDrawingEmpty'),
        zoomScaleText: document.getElementById('zoomScaleText'),

        // Tables & Albums
        surveyTableBody: document.getElementById('surveyTableBody'),
        photoAlbumGrid: document.getElementById('photoAlbumGrid'),
        surveyPriorityCompareSection: document.getElementById('surveyPriorityCompareSection'),
        surveyPriorityCompareGrid: document.getElementById('surveyPriorityCompareGrid'),
        surveyFloorTitle: document.getElementById('surveyFloorTitle'),
        albumFloorTitle: document.getElementById('albumFloorTitle')
    };

    /** 데스크톱 사이트 · 태블릿 — PC와 동일 레이아웃·LOD */
    function layoutIsPcLike() {
        return !!(window.BSA && typeof window.BSA.isPcLikeLayout === 'function' && window.BSA.isPcLikeLayout());
    }
    function layoutIsMobileWidth() {
        if (layoutIsPcLike()) return false;
        return (window.innerWidth || document.documentElement.clientWidth || 0) <= 768;
    }
    function layoutIsCompactWidth() {
        if (layoutIsPcLike()) return false;
        return (window.innerWidth || document.documentElement.clientWidth || 0) <= 1024;
    }
    function layoutMediaMobilePortrait() {
        if (layoutIsPcLike()) return false;
        return !!(window.matchMedia && window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches);
    }
    function layoutMediaMobileDefectDrawer() {
        if (layoutIsPcLike()) return false;
        return !!(window.matchMedia && window.matchMedia('(max-width: 768px), (orientation: landscape) and (max-width: 1024px)').matches);
    }

    /** 모바일·터치: 네이티브 select 대신 앱 톤 바텀시트 */
    function shouldUseBsaSelectSheet() {
        if (typeof layoutIsPcLike === 'function' && layoutIsPcLike()) return false;
        const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const narrow = (window.innerWidth || 0) <= 1024;
        return coarse || narrow || layoutIsCompactWidth();
    }

    function getBsaSelectSheetTitle(selectEl) {
        if (!selectEl) return '선택';
        if (selectEl.getAttribute('aria-label')) return selectEl.getAttribute('aria-label');
        if (selectEl.title) return selectEl.title;
        const id = selectEl.id;
        if (id) {
            const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : String(id).replace(/"/g, '\\"');
            const lab = document.querySelector(`label[for="${safeId}"]`);
            if (lab) return (lab.textContent || '').replace(/\s+/g, ' ').trim() || '선택';
        }
        const wrapLab = selectEl.closest('.form-group, .selector-group')?.querySelector('.form-label, label');
        if (wrapLab) return (wrapLab.textContent || '').replace(/\s+/g, ' ').trim() || '선택';
        return '선택';
    }

    function closeBsaSelectSheet() {
        const sheet = document.getElementById('bsaSelectSheet');
        if (!sheet) return;
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('bsa-select-sheet-open');
        window._bsaSelectTarget = null;
        window._bsaSelectIgnoreUntil = 0;
        const search = document.getElementById('bsaSelectSheetSearch');
        if (search) search.value = '';
    }

    function renderBsaSelectSheetList(filterText) {
        const list = document.getElementById('bsaSelectSheetList');
        const selectEl = window._bsaSelectTarget;
        if (!list || !selectEl) return;
        const q = String(filterText || '').trim().toLowerCase();
        const cur = selectEl.value;
        const parts = [];
        let shown = 0;
        let lastGroup = null;
        const pushOption = (opt, groupLabel) => {
            if (!opt || opt.hidden) return;
            const label = (opt.textContent || opt.label || opt.value || '').trim();
            const val = opt.value;
            if (q && !label.toLowerCase().includes(q) && !String(val).toLowerCase().includes(q)) return;
            if (groupLabel && groupLabel !== lastGroup) {
                parts.push({ type: 'group', label: groupLabel });
                lastGroup = groupLabel;
            }
            parts.push({
                type: 'option',
                label,
                value: val,
                disabled: !!opt.disabled,
                selected: val === cur
            });
            shown += 1;
        };
        Array.from(selectEl.children).forEach((node) => {
            if (node.tagName === 'OPTGROUP') {
                Array.from(node.children).forEach((opt) => {
                    if (opt.tagName === 'OPTION') pushOption(opt, node.label || '');
                });
            } else if (node.tagName === 'OPTION') {
                pushOption(node, '');
            }
        });
        if (!shown) {
            list.innerHTML = '<li class="bsa-select-sheet-empty">검색 결과가 없습니다</li>';
            return;
        }
        list.innerHTML = parts.map((p) => {
            if (p.type === 'group') {
                return `<li class="bsa-select-sheet-group">${escapeHtml(p.label)}</li>`;
            }
            return `<li>` +
                `<button type="button" class="bsa-select-sheet-item${p.selected ? ' is-selected' : ''}${p.disabled ? ' is-disabled' : ''}"` +
                ` role="option" data-value="${escapeHtml(p.value)}" ${p.disabled ? 'disabled' : ''} aria-selected="${p.selected ? 'true' : 'false'}">` +
                `<span>${escapeHtml(p.label || '(빈 값)')}</span>` +
                `<i class="fa-solid fa-check bsa-select-check" aria-hidden="true"></i>` +
                `</button></li>`;
        }).join('');
        const selectedBtn = list.querySelector('.bsa-select-sheet-item.is-selected');
        if (selectedBtn) {
            // 현재 선택 항목을 목록 가운데로 — 끝에 걸쳐 보이지 않게(드래그로 위아래 바로 찾기)
            requestAnimationFrame(() => {
                const li = selectedBtn.closest('li') || selectedBtn;
                const top = li.offsetTop - Math.max(0, (list.clientHeight - li.offsetHeight) / 2);
                list.scrollTop = Math.max(0, top);
            });
        }
    }

    function openBsaSelectSheet(selectEl) {
        if (!selectEl || selectEl.disabled || selectEl.multiple) return;
        const sheet = document.getElementById('bsaSelectSheet');
        const titleEl = document.getElementById('bsaSelectSheetTitle');
        const searchWrap = document.getElementById('bsaSelectSheetSearchWrap');
        const search = document.getElementById('bsaSelectSheetSearch');
        if (!sheet) return;
        // 같은 select로 이미 열려 있으면 중복 오픈 스킵
        if (sheet.classList.contains('open') && window._bsaSelectTarget === selectEl) return;
        window._bsaSelectTarget = selectEl;
        window._bsaSelectIgnoreUntil = Date.now() + 320;
        if (titleEl) titleEl.textContent = getBsaSelectSheetTitle(selectEl);
        // 2026-11-05 모든 선택 시트는 검색 칸 없이 드래그(스크롤)로만 고른다 — 키보드가 강제로 올라와 목록을 가리지 않게
        if (searchWrap) searchWrap.hidden = true;
        if (search) search.value = '';
        renderBsaSelectSheetList('');
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
        document.body.classList.add('bsa-select-sheet-open');
        if (!searchWrap?.hidden && search) {
            setTimeout(() => {
                try { search.focus(); } catch (_err) { /* ignore */ }
            }, 180);
        }
    }

    function bindBsaSelectSheet() {
        const sheet = document.getElementById('bsaSelectSheet');
        if (!sheet || sheet.dataset.bound === '1') return;
        sheet.dataset.bound = '1';

        const sheetSelectFor = (target) => {
            const sel = target && target.closest ? target.closest('select') : null;
            if (!sel || sel.disabled || sel.multiple) return null;
            if (sel.dataset.nativeSelect === '1') return null;
            if (sel.closest('#bsaSelectSheet')) return null;
            return sel;
        };
        const intercept = (e) => {
            if (!shouldUseBsaSelectSheet()) return;
            const sel = sheetSelectFor(e.target);
            if (!sel) return;
            e.preventDefault();
            e.stopPropagation();
            try { sel.blur(); } catch (_err) { /* ignore */ }
            openBsaSelectSheet(sel);
        };

        // 2026-09-29: 손가락이 닿는 순간(touchstart)에 열던 것을 「제자리 탭」이 끝날 때(touchend)로.
        // 표를 스크롤·드래그하다 구조체/비구조체/마감재 칸을 스치기만 해도 시트가 떠서 값이 바뀌던 문제.
        // touchstart는 막지 않으므로(passive) 그 위에서 시작한 스크롤도 된다.
        // touchend에서 preventDefault → 합성 mousedown/click·네이티브 피커가 안 뜬다.
        const SELECT_TAP_SLOP_PX = 10;
        const SELECT_TAP_MAX_MS = 800;
        let selectTouch = null;
        document.addEventListener('touchstart', (e) => {
            selectTouch = null;
            if (!shouldUseBsaSelectSheet()) return;
            const t = e.touches && e.touches[0];
            if (!t || e.touches.length !== 1) return;
            const sel = sheetSelectFor(e.target);
            if (!sel) return;
            selectTouch = { sel, x: t.clientX, y: t.clientY, at: Date.now(), moved: false };
        }, { capture: true, passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!selectTouch || selectTouch.moved) return;
            const t = e.touches && e.touches[0];
            if (!t || e.touches.length !== 1
                || Math.abs(t.clientX - selectTouch.x) > SELECT_TAP_SLOP_PX
                || Math.abs(t.clientY - selectTouch.y) > SELECT_TAP_SLOP_PX) {
                selectTouch.moved = true;
            }
        }, { capture: true, passive: true });
        document.addEventListener('touchcancel', () => { selectTouch = null; }, true);
        document.addEventListener('touchend', (e) => {
            const st = selectTouch;
            selectTouch = null;
            if (!st) return;
            const t = e.changedTouches && e.changedTouches[0];
            const far = !t || Math.abs(t.clientX - st.x) > SELECT_TAP_SLOP_PX || Math.abs(t.clientY - st.y) > SELECT_TAP_SLOP_PX;
            if (st.moved || far || (Date.now() - st.at) > SELECT_TAP_MAX_MS) {
                // 스크롤·드래그·길게 누름: 아무것도 열지 않음(합성 클릭도 막아 네이티브 피커도 안 뜨게)
                if (e.cancelable) e.preventDefault();
                return;
            }
            if (!st.sel.isConnected || !shouldUseBsaSelectSheet()) return;
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
            try { st.sel.blur(); } catch (_err) { /* ignore */ }
            openBsaSelectSheet(st.sel);
        }, { capture: true, passive: false });
        document.addEventListener('mousedown', intercept, true);
        document.addEventListener('click', intercept, true);
        document.addEventListener('focusin', (e) => {
            if (!shouldUseBsaSelectSheet()) return;
            const sel = e.target && e.target.tagName === 'SELECT' ? e.target : null;
            if (!sel || sel.disabled || sel.multiple || sel.dataset.nativeSelect === '1') return;
            e.preventDefault();
            try { sel.blur(); } catch (_err) { /* ignore */ }
            openBsaSelectSheet(sel);
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const openSheet = document.getElementById('bsaSelectSheet');
            if (openSheet && openSheet.classList.contains('open')) closeBsaSelectSheet();
        });

        document.getElementById('btnCloseBsaSelectSheet')?.addEventListener('click', closeBsaSelectSheet);
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) closeBsaSelectSheet();
        });

        const list = document.getElementById('bsaSelectSheetList');
        list?.addEventListener('click', (e) => {
            if (Date.now() < (window._bsaSelectIgnoreUntil || 0)) return;
            const btn = e.target.closest('.bsa-select-sheet-item');
            if (!btn || btn.disabled || btn.classList.contains('is-disabled')) return;
            const selectEl = window._bsaSelectTarget;
            if (!selectEl) return;
            const val = btn.getAttribute('data-value');
            selectEl.value = val;
            selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            closeBsaSelectSheet();
        });

        document.getElementById('bsaSelectSheetSearch')?.addEventListener('input', (e) => {
            renderBsaSelectSheetList(e.target.value);
        });
    }

    bindBsaSelectSheet();

    // --- 3.5 UI 알림 / 로딩 유틸 (토스트 & 전역 로딩 오버레이) ---
    function ensureToastContainer() {
        let box = document.getElementById('toastContainer');
        if (!box) {
            box = document.createElement('div');
            box.id = 'toastContainer';
            box.className = 'toast-container';
            document.body.appendChild(box);
        }
        return box;
    }

    // type: 'success' | 'error' | 'warning' | 'info'
    window.showToast = function(message, type = 'info', duration = 3500) {
        const box = ensureToastContainer();
        const icons = {
            success: 'fa-circle-check',
            error: 'fa-circle-exclamation',
            warning: 'fa-triangle-exclamation',
            info: 'fa-circle-info'
        };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = document.createElement('i');
        icon.className = `fa-solid ${icons[type] || icons.info}`;
        const text = document.createElement('span');
        text.textContent = message; // XSS 방지: innerHTML 대신 textContent로 삽입
        toast.appendChild(icon);
        toast.appendChild(text);
        box.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, duration);
        return toast;
    };

    /**
     * 삭제 전 확인 팝업 — 작업창 전역에서 동일하게 사용.
     * 2026-09-29: 기본 confirm 창 대신 앱 창(js/shared/app-dialog.js). Promise<boolean> — 반드시 await 로 쓴다.
     */
    window.confirmDelete = function(message) {
        const msg = (message && String(message).trim()) || '정말 삭제하시겠습니까?';
        if (window.appDialog && typeof window.appDialog.confirm === 'function') {
            return window.appDialog.confirm(msg, { title: '삭제 확인', okText: '삭제', danger: true });
        }
        return Promise.resolve(window.confirm(msg));
    };

    let _loadingDepth = 0;
    window.showLoading = function(text = '처리 중입니다...') {
        let overlay = document.getElementById('globalLoadingOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'globalLoadingOverlay';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = '<div class="loading-box"><div class="loading-spinner"></div><div class="loading-text"></div></div>';
            document.body.appendChild(overlay);
        }
        const alreadyVisible = overlay.style.display === 'flex';
        // 진행 문구마다 showLoading을 다시 부르면 depth가 쌓여 hideLoading 한 번으로는
        // 오버레이가 영영 안 닫힌다(도면 추가 저장 버그). 이미 보이면 텍스트만 갱신.
        if (!alreadyVisible) _loadingDepth++;
        if (_loadingDepth < 1) _loadingDepth = 1;
        overlay.querySelector('.loading-text').textContent = text;
        overlay.style.display = 'flex';
    };
    window.hideLoading = function() {
        _loadingDepth = Math.max(0, _loadingDepth - 1);
        if (_loadingDepth > 0) return;
        const overlay = document.getElementById('globalLoadingOverlay');
        if (overlay) overlay.style.display = 'none';
    };
    window.resetLoadingOverlay = function() {
        _loadingDepth = 0;
        const overlay = document.getElementById('globalLoadingOverlay');
        if (overlay) overlay.style.display = 'none';
    };
    window.updateLoadingText = function(text) {
        const overlay = document.getElementById('globalLoadingOverlay');
        const el = overlay?.querySelector('.loading-text');
        if (el && text) el.textContent = text;
    };

    function yieldToUi() {
        return new Promise((resolve) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    // 2026-11-02 부재 명칭·결함 내용·발생 원인 세팅(직접 추가·숨김·순서·★·원인 자동 체크)은 회사 공통 —
    // 회사 문서에 칸별로 저장(js/core/company-settings-merge.js SPEC). 계정(users/{uid}.defectPinPresets)에는 사용 빈도만 남긴다.
    function getUserDefectPinPresetsPayload() {
        return {
            defectPickUsage: window.state.defectPickUsage || {}
        };
    }

    const DEFECT_PIN_PRESET_FIELDS = ['defectPickUsage'];

    function applyDefectPinPresets(presets) {
        if (!presets || typeof presets !== 'object') return false;
        let changed = false;
        DEFECT_PIN_PRESET_FIELDS.forEach((f) => {
            if (presets[f] != null) {
                window.state[f] = presets[f];
                changed = true;
            }
        });
        return changed;
    }

    function userDefectPinLocalKey(uid) {
        return `building_safety_user_defect_pin_v1_${uid || 'anon'}`;
    }

    function persistUserDefectPinPresetsLocal(uid) {
        const id = uid || window.state.uid;
        if (!id) return;
        try {
            localStorage.setItem(userDefectPinLocalKey(id), JSON.stringify({
                updatedAt: Date.now(),
                presets: getUserDefectPinPresetsPayload()
            }));
        } catch (e) {
            console.warn('계정 결함 핀 설정 로컬 저장 실패:', e);
        }
    }

    let _userDefectPinSyncTimer = null;
    let _lastSyncedUserDefectPinJson = '';
    function scheduleSyncUserDefectPinPresets() {
        if (!window.state.uid) return;
        persistUserDefectPinPresetsLocal(window.state.uid);
        if (_userDefectPinSyncTimer) clearTimeout(_userDefectPinSyncTimer);
        _userDefectPinSyncTimer = setTimeout(() => {
            _userDefectPinSyncTimer = null;
            syncUserDefectPinPresetsToCloud().catch((e) => {
                console.warn('계정 결함 핀 설정 동기화 실패:', e);
            });
        }, 700);
    }

    async function syncUserDefectPinPresetsToCloud() {
        const uid = window.state.uid;
        if (!uid || !db || navigator.onLine === false) return;
        const payload = getUserDefectPinPresetsPayload();
        const json = JSON.stringify(payload);
        if (json === _lastSyncedUserDefectPinJson) return;
        await db.collection('users').doc(uid).set({
            defectPinPresets: payload,
            defectPinPresetsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        _lastSyncedUserDefectPinJson = json;
    }

    async function loadAndApplyUserDefectPinPresets(uid, userDocData) {
        if (!uid) return;
        let localWrap = null;
        try {
            const raw = localStorage.getItem(userDefectPinLocalKey(uid));
            if (raw) localWrap = JSON.parse(raw);
        } catch (_) { /* ignore */ }

        let cloudPresets = null;
        let cloudUpdatedAt = 0;
        const applyFromUserData = (d) => {
            if (!d || typeof d !== 'object') return;
            if (d.defectPinPresets && typeof d.defectPinPresets === 'object') {
                cloudPresets = d.defectPinPresets;
            }
            const ts = d.defectPinPresetsUpdatedAt;
            if (ts && typeof ts.toMillis === 'function') cloudUpdatedAt = ts.toMillis();
            else if (typeof ts === 'number') cloudUpdatedAt = ts;
        };
        if (userDocData && typeof userDocData === 'object') {
            applyFromUserData(userDocData);
        } else if (db && navigator.onLine !== false) {
            try {
                const snap = await db.collection('users').doc(uid).get();
                if (snap.exists) applyFromUserData(snap.data() || {});
            } catch (e) {
                console.warn('계정 결함 핀 설정 조회 실패:', e);
            }
        }

        const localUpdatedAt = Number(localWrap && localWrap.updatedAt) || 0;
        const localPresets = localWrap && localWrap.presets;
        if (cloudPresets && cloudUpdatedAt >= localUpdatedAt) {
            applyDefectPinPresets(cloudPresets);
        } else if (localPresets) {
            applyDefectPinPresets(localPresets);
        }
        // 둘 다 없으면 loadStateFromLocalStorage로 이미 올라온 값(또는 기본값)을 이 계정 소유로 이전
        persistUserDefectPinPresetsLocal(uid);
        if (cloudPresets && cloudUpdatedAt >= localUpdatedAt) {
            _lastSyncedUserDefectPinJson = JSON.stringify(getUserDefectPinPresetsPayload());
        } else if (navigator.onLine !== false) {
            _lastSyncedUserDefectPinJson = ''; // 로컬만 있으면 클라우드에 1회 반영
            scheduleSyncUserDefectPinPresets();
        }
        if (typeof migrateDefectComponentStateShape === 'function') migrateDefectComponentStateShape();
        // 2026-09-28 부재 이름 변경(큰보→보(G) 등)으로 계정 목록이 바뀌었으면 한 번 올림
        if (window._bsaMemberNamePresetsDirty && window.state.uid === uid) {
            window._bsaMemberNamePresetsDirty = false;
            scheduleSyncUserDefectPinPresets();
        }
    }

    function resetDefectPinPresetsToDefaults() {
        // 로그아웃 시 메모리만 비움 — 실제 “앱 기본 세팅” 복원은 resetOptionManagerAll / applyBuiltInDefectPinDefaults
        // 2026-11-02 회사 공통 세팅(직접 추가·숨김·순서·★)은 비우지 않는다 — 비우면 다음 동기화가 빈 값을 회사 문서에 올릴 수 있음
        window.state.defectPickUsage = {};
    }

    async function syncAfterImportWithRetry(label) {
        if (typeof syncStateToFirebase !== 'function') return;
        try {
            await syncStateToFirebase();
        } catch (e) {
            console.warn('Import sync failed, retrying:', e);
            window.showToast(`${label || '가져오기'} 후 동기화 재시도 중…`, 'warning', 3500);
            try {
                await syncStateToFirebase();
            } catch (e2) {
                console.warn('Import sync retry failed:', e2);
                window.showToast('동기화에 실패했습니다. 네트워크 확인 후 새로고침해 주세요.', 'warning', 5500);
            }
        }
    }

    function findSimilarBuildings(name, address, excludeId) {
        const norm = (s) => String(s || '').trim().toLowerCase().replace(/^🏢\s*/, '');
        const n = norm(name);
        const a = norm(address);
        return (window.state.buildings || []).filter((b) => {
            if (excludeId && b.id === excludeId) return false;
            const bn = norm(b.name);
            const ba = norm(b.address);
            if (n && bn && n === bn) return true;
            if (a && ba && a.length > 6 && a === ba) return true;
            return false;
        });
    }

    function getImportDefectRoundMode(radioName) {
        const name = radioName || 'importDefectRoundMode';
        const sel = document.querySelector(`input[name="${name}"]:checked`);
        const val = sel?.value || 'keep';
        return ['keep', 'carryOver', 'newRound'].includes(val) ? val : 'keep';
    }

    function applyDefectRoundModeToClone(copy, mode, targetBldg) {
        if (!copy || mode === 'keep') return;
        if (mode === 'carryOver') {
            copy.isCarriedOver = true;
            return;
        }
        if (mode === 'newRound' && targetBldg) {
            const year = targetBldg.inspectionYear || '2026년';
            const period = targetBldg.inspectionPeriod || '하반기';
            copy.surveyRound = `${year}_${period}`;
            copy.isCarriedOver = false;
        }
    }

    /** 가져오기「전회차 표시」: 현회차(photos) 사진으로 전차(prevRoundPhotos)를 교체하고 현차 슬롯 비움 (기존 전차 사진에 추가하지 않음) */
    function applyImportedCarryOverPhotos(d) {
        if (!d?.id) return;
        const current = (Array.isArray(d.photos) ? d.photos : []).filter(Boolean);
        const prev = (Array.isArray(d.prevRoundPhotos) ? d.prevRoundPhotos : []).filter(Boolean);
        const oldCurIdCount = (d.photoIds && d.photoIds.length) || current.length;
        const oldPrevIdCount = (d.prevRoundPhotoIds && d.prevRoundPhotoIds.length) || prev.length;
        // 목록을 지우기 전에 옛 사진 ID를 받아 둔다
        const oldCurIds = defectPhotoIdList(d, oldCurIdCount);
        const oldPrevIds = defectPhotoIdList(d, oldPrevIdCount, 'prev');
        const prevBefore = captureDefectPhotoPairs(d, 'prev');

        // 새 목록을 먼저 매긴다 — 그대로 남는 전회차 사진은 ID를 유지해서 아래에서 지우지 않는다
        let newPrevIds = [];
        if (current.length > 0) newPrevIds = assignDefectPhotoIds(d.id, current, null, 'prev');
        else if (prev.length > 0) newPrevIds = assignDefectPhotoIds(d.id, prev, prevBefore, 'prev');
        const keepIds = new Set(newPrevIds);

        d.photos = [];
        delete d.photoIds;

        oldPrevIds.concat(oldCurIds).forEach((pid) => {
            if (keepIds.has(pid)) return;
            _idbPersistedPhotoKeys.delete(pid);
            idbDelete('photos', pid);
        });

        if (current.length > 0) {
            d.prevRoundPhotos = current.slice();
            d.prevRoundPhotoIds = newPrevIds;
            d.prevRoundPhotos.forEach((url, i) => {
                const pid = d.prevRoundPhotoIds[i];
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[pid] = url;
                idbSetPhotoPreferDataUrl(pid, url);
            });
        } else if (prev.length > 0) {
            d.prevRoundPhotos = prev;
            d.prevRoundPhotoIds = newPrevIds;
            prev.forEach((url, i) => {
                const pid = d.prevRoundPhotoIds[i];
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[pid] = url;
                idbSetPhotoPreferDataUrl(pid, url);
            });
        } else {
            delete d.prevRoundPhotos;
            delete d.prevRoundPhotoIds;
        }

        if (oldCurIdCount > 0 || oldPrevIdCount > 0) {
            invalidatePersistedPhotoCacheForDefect(d.id);
        }
    }

    function countBuildingNdtFloors(bldg) {
        if (!bldg?.id) return 0;
        const prefix = `${bldg.id}_`;
        return Object.keys(window.state.ndtData || {}).filter(k => k.startsWith(prefix)).length;
    }

    function countBuildingMapStyleFloors(bldg) {
        if (!bldg?.id || !window.state.floorMapStyleSettings) return 0;
        const prefix = `${bldg.id}_`;
        return Object.keys(window.state.floorMapStyleSettings).filter(k => k.startsWith(prefix)).length;
    }

    function buildImportPreviewHtml(sourceBldg, opts) {
        if (!sourceBldg || !opts) return '';
        const floorCount = countImportSourceFloorCodes(sourceBldg);
        const defectCount = countBuildingDefects(sourceBldg);
        const ndtCount = countBuildingNdtFloors(sourceBldg);
        const styleCount = countBuildingMapStyleFloors(sourceBldg);
        const items = [];
        if (opts.basicInfo) items.push(`<li>기본 정보 — 1건</li>`);
        if (opts.floorsDrawings) items.push(`<li>층 · 도면 — ${floorCount}개 층</li>`);
        if (opts.defects) items.push(`<li>결함 · 사진 — ${defectCount}건</li>`);
        if (opts.ndt) items.push(`<li>비파괴 — ${ndtCount}개 층</li>`);
        if (opts.mapStyles) items.push(`<li>표시 스타일 — ${styleCount}개 층</li>`);
        if (!items.length) return '<strong>선택된 항목 없음</strong>';
        return `<strong>복사 예상</strong><ul>${items.join('')}</ul>`;
    }

    function updateImportPreviewPanels(sourceBldg, opts, detailId, roundRowId) {
        const detail = document.getElementById(detailId);
        const roundRow = document.getElementById(roundRowId);
        if (detail) {
            if (sourceBldg && opts) {
                detail.hidden = false;
                detail.innerHTML = buildImportPreviewHtml(sourceBldg, opts);
            } else {
                detail.hidden = true;
                detail.innerHTML = '';
            }
        }
        if (roundRow) roundRow.hidden = !(sourceBldg && opts && opts.defects);
    }

    // --- 3.5b 떠 있는 상태 표시(오프라인 배지·올리는 중 알약·알림) 위치 ---
    // 2026-10-20 「업로드중 표시가 버튼을 가림」: 위쪽 오른편(헤더 버튼 자리)·아래 도구막대 위에 떠서 가렸다.
    // 이제 모두 화면 아래 왼쪽(알림은 아래 가운데)에 작게 두고, 아래에 붙은 도구막대·하단 결함창이 보이면
    // 그 위로 올린다(--bsa-float-bottom). 화면 대부분을 덮는 창(전체 모달·오른쪽 서랍)은 피하지 않는다.
    const FLOAT_AVOID_SELECTOR = [
        '.mobile-canvas-dock', '#mobileMapDock', '#ndtStyleSizeToolbar', '.home-fab-add-building',
        '#defectModal.active .modal-content', '#ndtModal.active .modal-content', '#ndtCrackMonitorModal.active .modal-content',
        '#ndtDisplacementGroupEditModal.active .modal-content', '#cadPinAdjustBar',
        '[class*="toolbar"]', '[class*="dock"]', '[class*="zoom-control"]', 'nav', 'footer'
    ].join(',');
    let _floatSafeRaf = 0;
    function updateFloatingIndicatorSafeArea() {
        _floatSafeRaf = 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        if (!vh) return;
        let lift = 0;
        let nodes = [];
        try { nodes = document.querySelectorAll(FLOAT_AVOID_SELECTOR); } catch (_e) { nodes = []; }
        nodes.forEach((el) => {
            if (!el || el.closest('.offline-badge, .sync-progress-pill, .toast-container, .defect-gap-notice')) return;
            const r = el.getBoundingClientRect();
            if (r.width < 8 || r.height < 8) return;
            if (r.bottom < vh - 48 || r.top >= vh) return;          // 화면 아래에 붙은 것만
            if (r.height > vh * 0.72) return;                        // 화면 대부분을 덮는 창은 제외
            if (r.left > vw * 0.55 && r.width < vw * 0.45) return;   // 오른쪽 끝 작은 버튼(FAB)은 왼쪽 표시와 안 겹침
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return;
            lift = Math.max(lift, vh - r.top);
        });
        const root = document.documentElement;
        const px = Math.round(lift > 0 ? lift + 6 : 0);
        if (root.style.getPropertyValue('--bsa-float-bottom') !== px + 'px') root.style.setProperty('--bsa-float-bottom', px + 'px');
        const badge = document.getElementById('offlineBadge');
        const badgeShown = !!(badge && badge.style.display !== 'none' && badge.offsetHeight);
        const stack = badgeShown ? Math.round(badge.offsetHeight + 6) : 0;
        if (root.style.getPropertyValue('--bsa-float-stack') !== stack + 'px') root.style.setProperty('--bsa-float-stack', stack + 'px');
        const pill = document.querySelector('.sync-progress-pill.show');
        const stack2 = stack + (pill && pill.offsetHeight ? Math.round(pill.offsetHeight + 6) : 0);
        if (root.style.getPropertyValue('--bsa-float-stack2') !== stack2 + 'px') root.style.setProperty('--bsa-float-stack2', stack2 + 'px');
    }
    function scheduleFloatingIndicatorSafeArea() {
        if (_floatSafeRaf) return;
        _floatSafeRaf = requestAnimationFrame(updateFloatingIndicatorSafeArea);
    }
    window.scheduleFloatingIndicatorSafeArea = scheduleFloatingIndicatorSafeArea;
    window.addEventListener('resize', scheduleFloatingIndicatorSafeArea);
    window.addEventListener('orientationchange', scheduleFloatingIndicatorSafeArea);
    document.addEventListener('click', () => setTimeout(scheduleFloatingIndicatorSafeArea, 60), true);
    setInterval(scheduleFloatingIndicatorSafeArea, 1200);

    // --- 3.5c 빈 마킹 번호 알림 (2026-10-20) ---
    // 온라인이고 결함위치도 탭이 보일 때, 이 층(외부는 외부 전체) 마킹 번호에 빈 칸이 있으면 아래 왼쪽에 작게 알린다.
    // 같은 층·같은 빈 번호 조합은 한 번만(닫으면 번호가 바뀔 때까지 다시 안 뜸).
    const _gapNoticeDismissed = new Set();
    let _gapNoticeTimer = 0;
    function ensureGapNotice() {
        let el = document.getElementById('defectGapNotice');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'defectGapNotice';
        el.className = 'defect-gap-notice';
        el.setAttribute('role', 'status');
        el.innerHTML = '<i class="fa-solid fa-hashtag"></i> <span data-gap-text></span>'
            + '<button type="button" data-gap-run>빈칸 당기기</button>'
            + '<button type="button" data-gap-close aria-label="닫기" title="닫기">×</button>';
        el.querySelector('[data-gap-run]').addEventListener('click', () => {
            el.classList.remove('show');
            if (el.dataset.sig) _gapNoticeDismissed.add(el.dataset.sig);
            const b = document.getElementById('btnCompactMarkingGaps');
            if (b) b.click();
        });
        el.querySelector('[data-gap-close]').addEventListener('click', () => {
            el.classList.remove('show');
            if (el.dataset.sig) _gapNoticeDismissed.add(el.dataset.sig);
        });
        document.body.appendChild(el);
        return el;
    }
    function updateDefectNumberGapNotice() {
        _gapNoticeTimer = 0;
        const el = document.getElementById('defectGapNotice');
        const hide = () => { if (el) el.classList.remove('show'); };
        if (!navigator.onLine || !state.currentBuildingId || !state.currentFloor) return hide();
        const mapTab = document.getElementById('tab-map');
        if (!mapTab || mapTab.offsetParent === null) return hide();
        if (document.body.classList.contains('defect-modal-open')) return hide();
        // 2026-11-02 외부는 번호가 모든 외부 도면에 걸쳐 있어 한 도면만 보면 늘 빈 번호처럼 보인다 — 알리지 않고 당기자고도 하지 않는다
        if (typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor)) return hide();
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        let gaps = [];
        try { gaps = findDefectMarkingNumberGaps(getFloorDefectsForNumbering(key)); } catch (_e) { gaps = []; }
        if (!gaps.length) return hide();
        const sig = key + '|' + gaps.join(',');
        if (_gapNoticeDismissed.has(sig)) return hide();
        const box = ensureGapNotice();
        const shown = gaps.slice(0, 8).join(', ') + (gaps.length > 8 ? ` 외 ${gaps.length - 8}개` : '');
        box.querySelector('[data-gap-text]').textContent = `빈 번호 있음: ${shown}`;
        box.dataset.sig = sig;
        box.classList.add('show');
        if (typeof scheduleFloatingIndicatorSafeArea === 'function') scheduleFloatingIndicatorSafeArea();
    }
    function scheduleDefectNumberGapNotice() {
        if (_gapNoticeTimer) return;
        _gapNoticeTimer = setTimeout(updateDefectNumberGapNotice, 400);
    }
    window.scheduleDefectNumberGapNotice = scheduleDefectNumberGapNotice;
    setInterval(scheduleDefectNumberGapNotice, 2500);
    window.addEventListener('online', scheduleDefectNumberGapNotice);
    window.addEventListener('offline', scheduleDefectNumberGapNotice);

    // --- 3.6 오프라인 상태 배지 ---
    function ensureOfflineBadge() {
        let badge = document.getElementById('offlineBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'offlineBadge';
            badge.className = 'offline-badge bsp-clickable';
            badge.setAttribute('role', 'button');
            badge.title = '눌러서 아직 서버에 안 올라간 변경 보기';
            badge.innerHTML = '<i class="fa-solid fa-wifi-slash"></i> <span>오프라인 상태 · 기기에 저장 중</span>';
            badge.addEventListener('click', () => openSyncProgressPanel());
            document.body.appendChild(badge);
        }
        return badge;
    }

    function updateOfflineBadge() {
        const badge = ensureOfflineBadge();
        badge.style.display = navigator.onLine ? 'none' : 'flex';
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    }

    // ---- 2026-10-19 동기화 진행률(js/core/sync-progress.js) ----
    // 「오프라인 작업에서 사진넣고 마킹 움직이고 결함내용 고치고 했던거 얼마나 서버에 올라갔는지」.
    // 이 기기에서 한 변경만 일지에 적고(기기 저장소), 서버가 저장을 확인했을 때만 「올라감」으로 센다
    //  - 층 변경: writeFloorSyncBundle의 층 묶음 쓰기가 끝난 뒤 / 사진: markPhotoOnStorage(서버 Storage 확인)
    // 서버 데이터·규칙은 건드리지 않는다. 여러 기기 합치기는 기존 칸별 병합·묘비·syncRev·floor-sync-guard 그대로.
    let _syncJournal = null;
    function syncJournal() {
        if (_syncJournal) return _syncJournal;
        const sp = window.BSA && window.BSA.syncProgress;
        if (!sp) return null;
        _syncJournal = sp.createTracker({
            storage: (typeof localStorage !== 'undefined') ? localStorage : null,
            storageKey: () => {
                const cid = (window.state && window.state.companyId) || '';
                return cid ? `bsa_sync_journal_v1_${cid}` : 'bsa_sync_journal_v1';
            }
        });
        _syncJournal.onChange(() => scheduleSyncProgressRender());
        return _syncJournal;
    }
    window.bsaSyncJournal = syncJournal;
    /** 층마다 서버에 있다고 확인된 마킹 id — 「새 마킹」과 「수정」을 가른다(서버에서 읽거나 올린 뒤에만 앎) */
    const _serverDefectIdsByFloor = new Map();
    function noteServerDefectIds(floorKey, items) {
        if (!floorKey) return;
        _serverDefectIdsByFloor.set(floorKey, new Set((items || []).filter((d) => d && d.id).map((d) => String(d.id))));
    }
    /** 서버에 있다고 확인된 이 층 마킹 id(Set). 아직 서버에서 읽거나 올린 적이 없으면 null — 모를 때는 「새 것」으로 치지 않는다 */
    function serverDefectIdsOfFloor(floorKey) {
        return _serverDefectIdsByFloor.get(floorKey) || null;
    }
    let _jFkCache = new Map();
    let _jFkCacheAt = 0;
    function journalFloorKeyOfDefect(id) {
        const st = window.state || {};
        const defs = st.defects || {};
        const cur = (st.currentBuildingId && st.currentFloor) ? `${st.currentBuildingId}_${st.currentFloor}` : '';
        if (cur && (defs[cur] || []).some((d) => d && d.id === id)) return cur;
        const hit = _jFkCache.get(id);
        if (hit && (defs[hit] || []).some((d) => d && d.id === id)) return hit;
        if (Date.now() - _jFkCacheAt > 1500) {
            _jFkCache = new Map();
            Object.keys(defs).forEach((k) => (defs[k] || []).forEach((d) => { if (d && d.id) _jFkCache.set(d.id, k); }));
            _jFkCacheAt = Date.now();
            return _jFkCache.get(id) || '';
        }
        return '';
    }
    function journalDefectChange(kind, defect, fk) {
        try {
            const j = syncJournal();
            if (!j || !defect || !defect.id) return;
            const floorKey = fk || journalFloorKeyOfDefect(defect.id);
            let k = kind;
            if ((k === 'edit' || k === 'move') && floorKey && _serverDefectIdsByFloor.has(floorKey)
                && !_serverDefectIdsByFloor.get(floorKey).has(String(defect.id))) k = 'add';
            j.record(k, defect.id, floorKey);
        } catch (_e) { /* 진행률 기록 실패는 작업에 영향 없음 */ }
    }
    function journalRecord(kind, id, fk) {
        try { const j = syncJournal(); if (j && id) j.record(kind, id, fk || ''); } catch (_e) { /* ignore */ }
    }
    function journalCurrentFloorKey() {
        const st = window.state || {};
        return (st.currentBuildingId && st.currentFloor) ? `${st.currentBuildingId}_${st.currentFloor}` : '';
    }

    let _syncProgressRenderTimer = null;
    /** 2026-11-06 이번 회차에 층 잠금을 잡고 올리는 층 — 「어느 현장 것을 올리는지」 표시용 */
    let _syncActiveFloorKeys = new Set();
    let _syncPillSeenSession = false;
    let _syncPillDoneUntil = 0;
    let _syncPillDoneFor = 0;
    function scheduleSyncProgressRender() {
        if (_syncProgressRenderTimer) return;
        _syncProgressRenderTimer = setTimeout(() => {
            _syncProgressRenderTimer = null;
            try { renderSyncProgressUi(); } catch (e) { console.warn('[진행률] 표시 실패', e); }
        }, 250);
    }
    window.scheduleSyncProgressRender = scheduleSyncProgressRender;
    function syncProgressBegin() {
        try {
            const j = syncJournal();
            let dirty = [];
            try { dirty = Array.from(_dirtyFloorKeys); } catch (_e) { /* 아직 준비 전 */ }
            if (j && (dirty.length || j.pendingEntries().length)) j.startSession(dirty);
        } catch (_e) { /* ignore */ }
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    }
    function syncProgressFail(where, reason) {
        try { const j = syncJournal(); if (j) j.noteFailure(where, reason); } catch (_e) { /* ignore */ }
    }
    function syncProgressSummary() {
        const j = syncJournal();
        if (!j) return null;
        return j.summary(syncProgressCtx());
    }
    /** 2026-10-19 건물 하나만의 진행률(오프라인 준비 창) */
    function syncProgressSummaryForBuilding(bldgId) {
        const j = syncJournal();
        if (!j || !bldgId || typeof j.summaryFor !== 'function') return null;
        let keys = null;
        const ctx = Object.assign(syncProgressCtx(), {
            photoInBuilding: (pid) => {
                if (!keys) { try { keys = offlinePrepPhotoKeysOfBuilding(bldgId); } catch (_e) { keys = new Set(); } }
                return keys.has(pid);
            }
        });
        return j.summaryFor(ctx, `${bldgId}_`);
    }
    function syncProgressCtx() {
        let dirty = [];
        let syncing = false;
        try { dirty = Array.from(_dirtyFloorKeys); } catch (_e) { /* 아직 준비 전 */ }
        try { syncing = !!(_syncInFlight || _offlineReturnRunning); } catch (_e) { /* ignore */ }
        let used = null;
        const usedPhotoIds = () => {
            if (used) return used;
            used = new Set();
            const defs = (window.state && window.state.defects) || {};
            Object.keys(defs).forEach((k) => (defs[k] || []).forEach((d) => {
                if (!d) return;
                (d.photoIds || []).forEach((x) => used.add(x));
                (d.prevRoundPhotoIds || []).forEach((x) => used.add(x));
            }));
            return used;
        };
        // 2026-11-04 건물 정보(점검날짜 등) ? 서버 쓰기 성공 뒤에만 지워지는 표시(_pendingCloudSync)가 있는 건물
        let pendingBuildingIds = [];
        try {
            pendingBuildingIds = ((window.state && window.state.buildings) || [])
                .filter((b) => b && b.id && b._pendingCloudSync).map((b) => String(b.id));
        } catch (_e) { /* ignore */ }
        return ({
            dirtyFloorKeys: dirty,
            pendingBuildingIds,
            online: navigator.onLine !== false,
            syncing,
            photoState: (id) => {
                if (isPhotoMarkedOnStorage(id)) return 'uploaded';
                const c = window._photoCache && window._photoCache[id];
                if (typeof c === 'string' && /^https?:/i.test(c)) return 'uploaded';   // 서버 주소로 받은 사진
                return usedPhotoIds().has(id) ? 'pending' : 'gone';
            }
        });
    }
    window.bsaSyncProgressSummary = syncProgressSummary;
    /** 2026-11-06 멈춘 사진을 어느 현장·층·번호 것인지로 보여 준다(사진 id는 사람이 못 찾는다) */
    function syncProgressPhotoLabel(photoId) {
        try {
            const defs = (window.state && window.state.defects) || {};
            for (const fk of Object.keys(defs)) {
                const d = (defs[fk] || []).find((x) => x && ((x.photoIds || []).includes(photoId) || (x.prevRoundPhotoIds || []).includes(photoId)));
                if (d) {
                    const s = syncProgressSiteOfFloor(fk);
                    return `${s ? `${s.site} ${s.floor}` : fk}${d.no ? ` ${d.no}` : ''}`;
                }
            }
        } catch (_e) { /* id 그대로 */ }
        return String(photoId);
    }
    /** 2026-11-06 층 키 → 현장(회차)·동+층 이름. 진행률 창 「현장별 남은 변경」 */
    function syncProgressSiteOfFloor(fk) {
        const b = findBuildingForFloorKey(fk);
        if (!b) return null;
        const code = floorCodeFromFloorKey(fk, b);
        let fl = code;
        try { fl = stripFloorCodeSuffix(window.getFloorLabelFromCode(code)) || code; } catch (_e) { /* 코드 그대로 */ }
        const dong = getBuildingDongLabel(b);
        return { site: syncProgressSiteName(b), floor: `${dong ? dong + ' ' : ''}${fl}` };
    }
    function syncProgressSiteName(b) {
        const site = getBuildingSiteName(b);
        let round = '';
        try { round = formatSurveyRoundLabelShort(getBuildingSurveyRoundKey(b)) || ''; } catch (_e) { /* 현장 이름만 */ }
        return round ? `${site} (${round})` : site;
    }
    function syncProgressSiteRows(sp, ctx) {
        const j = syncJournal();
        if (!j || !sp || typeof j.pendingByFloor !== 'function') return [];
        let photoFloor = null;
        const by = j.pendingByFloor(Object.assign({}, ctx, {
            photoFloorKey: (id) => {
                if (!photoFloor) {
                    photoFloor = new Map();
                    const defs = (window.state && window.state.defects) || {};
                    Object.keys(defs).forEach((k) => (defs[k] || []).forEach((d) => {
                        if (!d) return;
                        (d.photoIds || []).forEach((x) => photoFloor.set(x, k));
                        (d.prevRoundPhotoIds || []).forEach((x) => photoFloor.set(x, k));
                    }));
                }
                return photoFloor.get(id) || '';
            }
        }));
        const pendingBuildingSites = (ctx.pendingBuildingIds || []).map((id) => {
            const b = ((window.state && window.state.buildings) || []).find((x) => x && String(x.id) === String(id));
            return b ? syncProgressSiteName(b) : '';
        });
        return sp.buildSiteRows(by, {
            resolve: (fk) => { try { return syncProgressSiteOfFloor(fk); } catch (_e) { return null; } },
            activeFloorKeys: Array.from(_syncActiveFloorKeys),
            pendingBuildingSites
        });
    }
    function syncProgressFloorLabel(fk) {
        if (fk === 'sync') return '건물 정보·회사 동기화';
        try {
            const b = findBuildingForFloorKey(fk);
            const code = floorCodeFromFloorKey(fk, b);
            let fl = code;
            try { fl = stripFloorCodeSuffix(window.getFloorLabelFromCode(code)) || code; } catch (_e) { /* 코드 그대로 */ }
            return `${b && b.name ? b.name + ' ' : ''}${fl || fk}`;
        } catch (_e) {
            return fk;
        }
    }
    function ensureSyncProgressPill() {
        let pill = document.getElementById('bsaSyncPill');
        if (!pill) {
            pill = document.createElement('button');
            pill.type = 'button';
            pill.id = 'bsaSyncPill';
            pill.className = 'sync-progress-pill';
            pill.title = '눌러서 동기화 진행률 보기';
            pill.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" data-bsp-ic></i><span class="bsp-txt-long" data-bsp-txt></span><span class="bsp-txt-short" data-bsp-short></span><span class="bsp-pill-bar"><span data-bsp-bar></span></span>';
            pill.addEventListener('click', () => openSyncProgressPanel());
        }
        placeSyncProgressPill(pill);
        return pill;
    }
    /**
     * 2026-10-20 알약 자리 — PC(넓은 화면, 헤더 「온라인」 배지가 보일 때): 배지 바로 옆.
     * 태블릿·폰: 도면 안 오른쪽 아래 빈 곳(버튼과 겹치면 그 위로 올림, 안전 영역 포함).
     * 도면이 안 보이는 화면(홈·목록 등): 헤더 탭 묶음 옆(목록을 가리지 않음).
     */
    function placeSyncProgressPill(pill) {
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const badge = document.getElementById('onlineStatusBadge');
        const badgeShown = !!(badge && badge.offsetParent !== null);
        const canvas = document.getElementById('canvasContainer');
        const canvasShown = !!(canvas && canvas.offsetParent !== null && canvas.clientWidth > 0 && canvas.clientHeight > 0);
        let where = 'nav';
        if (badgeShown && vw > 1180) where = 'badge';
        else if (canvasShown) where = 'canvas';
        if (where === 'badge') {
            if (badge.nextElementSibling !== pill) badge.insertAdjacentElement('afterend', pill);
        } else if (where === 'canvas') {
            if (pill.parentNode !== canvas) canvas.appendChild(pill);
        } else {
            // 탭 묶음 앞(맨 왼쪽) — 좁은 화면에서 탭 묶음이 가로로 밀려 겹치지 않게
            const cluster = document.getElementById('navTabsCluster');
            if (cluster && cluster.parentNode) {
                if (cluster.previousElementSibling !== pill) cluster.insertAdjacentElement('beforebegin', pill);
            } else if (pill.parentNode !== document.body) {
                document.body.appendChild(pill);
            }
        }
        pill.classList.toggle('in-header', where !== 'canvas');
        pill.classList.toggle('in-canvas', where === 'canvas');
        pill.classList.toggle('beside-badge', where === 'badge');
        if (where === 'canvas') avoidCanvasControls(pill, canvas);
        else pill.style.removeProperty('--bsp-lift');
    }
    /** 도면 안 알약이 버튼·툴바·키패드와 겹치면 겹친 것 위로 올린다 */
    function avoidCanvasControls(pill, canvas) {
        if (!pill.classList.contains('show')) return;
        pill.style.setProperty('--bsp-lift', '0px');
        const sel = 'button, a, input, select, textarea, [role="button"], [class*="toolbar"], [class*="keypad"], [class*="zoom"], [class*="rail"], [class*="sheet"], [class*="count-bar"], .floating-indicator, .offline-badge';
        const cands = Array.from(document.querySelectorAll(sel)).filter((el) => {
            if (el === pill || pill.contains(el) || el.contains(pill) || el === canvas) return false;
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.width < (window.innerWidth * 0.95) ;
        });
        const cRect = canvas.getBoundingClientRect();
        for (let pass = 0; pass < 6; pass++) {
            const p = pill.getBoundingClientRect();
            const hit = cands.map((el) => el.getBoundingClientRect())
                .filter((r) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 4 && r.bottom > p.top - 4);
            if (!hit.length) break;
            const top = Math.min.apply(null, hit.map((r) => r.top));
            const lift = Math.max(0, cRect.bottom - top + 8 - 10);
            if (lift > cRect.height - 60) break;   // 올릴 곳이 없으면 그대로
            pill.style.setProperty('--bsp-lift', `${Math.round(lift)}px`);
        }
    }
    /** 화면 확인용(개발자 도구): 알약을 그 상태로 띄워 자리 보기 — 동기화는 건드리지 않음 */
    window.bsaPreviewSyncPill = function (mode, longText, shortText) {
        const pill = ensureSyncProgressPill();
        pill.classList.add('show');
        pill.classList.toggle('fail', mode === 'fail');
        pill.classList.toggle('done', mode === 'done');
        const t = pill.querySelector('[data-bsp-txt]'); if (t) t.textContent = longText || '';
        const sh = pill.querySelector('[data-bsp-short]'); if (sh) sh.textContent = shortText || '';
        placeSyncProgressPill(pill);
        const r = pill.getBoundingClientRect();
        return { parent: pill.parentNode && (pill.parentNode.id || pill.parentNode.className), rect: [r.left, r.top, r.width, r.height] };
    };
    window.addEventListener('resize', () => scheduleSyncProgressRender());
    document.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('.tab-btn')) setTimeout(scheduleSyncProgressRender, 300);
    }, true);
    function renderSyncProgressUi() {
        const sp = window.BSA && window.BSA.syncProgress;
        const sum = syncProgressSummary();
        if (!sp || !sum || !document.body) return;
        // 2026-11-06 드래그 중엔 진행률 숫자를 다시 그리지 않는다(끝나면 곧 그림)
        if (typeof isRealtimeUiGestureBusy === 'function' && isRealtimeUiGestureBusy()) {
            setTimeout(scheduleSyncProgressRender, 500);
            return;
        }
        try { sum.sites = syncProgressSiteRows(sp, syncProgressCtx()); } catch (e) { sum.sites = []; console.warn('[진행률] 현장별 표시 실패', e); }
        const now = Date.now();
        // 오프라인 배지: 안 올라간 수
        const ob = document.getElementById('offlineBadge');
        if (ob) {
            const span = ob.querySelector('span');
            if (span) span.textContent = sum.pending ? `오프라인 · 안 올라간 변경 ${sum.pending}건` : '오프라인 상태 · 기기에 저장 중';
        }
        // 위쪽 「온라인」 배지도 누르면 진행률(남은 수를 옆에)
        const hb = document.getElementById('onlineStatusBadge');
        if (hb) {
            if (hb.dataset.bspBound !== '1') {
                hb.dataset.bspBound = '1';
                hb.classList.add('bsp-clickable');
                hb.setAttribute('role', 'button');
                hb.title = '눌러서 동기화 진행률 보기';
                hb.addEventListener('click', () => openSyncProgressPanel());
            }
            let c = hb.querySelector('.bsp-badge-count');
            if (sum.pending) {
                if (!c) { c = document.createElement('span'); c.className = 'bsp-badge-count'; hb.appendChild(c); }
                c.textContent = ` · 안 올라간 ${sum.pending}`;
            } else if (c) {
                c.remove();
            }
        }
        // 온라인 알약: 평소 한두 건은 몇 초 안에 올라가므로 띄우지 않는다.
        // 띄우는 때 — 많이 올리는 중(3건 이상) · 8초 넘게 안 올라간 것 · 실패 / 끝나면 「모두 서버에 올라감」 6초
        const pill = ensureSyncProgressPill();
        let mode = '';
        if (sum.online && sum.pending) {
            const stale = sum.oldestAt && now - sum.oldestAt > 8000;
            if (sum.failures.length || stale || sum.total >= 3 || _syncPillSeenSession) mode = sum.failures.length && !sum.syncing ? 'fail' : 'run';
        } else if (sum.online && !sum.pending && sum.finishedAt) {
            if (_syncPillSeenSession && _syncPillDoneFor !== sum.finishedAt) {
                _syncPillDoneFor = sum.finishedAt;
                _syncPillDoneUntil = now + 6000;
                setTimeout(scheduleSyncProgressRender, 6100);
            }
            _syncPillSeenSession = false;
            if (now < _syncPillDoneUntil) mode = 'done';
        }
        // 2026-10-20 자동 올리기 멈춤 — 눌러서 「지금 다시 올리기」
        let parkedInfo = null;
        try { parkedInfo = typeof window.bsaSyncParkedState === 'function' ? window.bsaSyncParkedState() : null; } catch (_e) { parkedInfo = null; }
        const parkedGate = !!(parkedInfo && parkedInfo.gate && parkedInfo.gate.parked);
        const parkedPhotos = (parkedInfo && parkedInfo.parkedPhotos) || [];
        if (parkedGate || parkedPhotos.length) mode = 'fail';
        if (mode === 'run' || mode === 'fail') _syncPillSeenSession = true;
        pill.classList.toggle('show', !!mode);
        pill.classList.toggle('done', mode === 'done');
        pill.classList.toggle('fail', mode === 'fail');
        if (mode) {
            const txt = pill.querySelector('[data-bsp-txt]');
            const bar = pill.querySelector('[data-bsp-bar]');
            const ic = pill.querySelector('[data-bsp-ic]');
            const shortEl = pill.querySelector('[data-bsp-short]');
            if (shortEl) {
                shortEl.textContent = (parkedGate || parkedPhotos.length) ? '멈춤'
                    : mode === 'done' ? '올라감'
                        : mode === 'fail' ? `실패 ${sum.pending}`
                            : (sum.total ? `${sum.done}/${sum.total}` : '올리는 중');
            }
            pill.title = (txt && txt.textContent) ? `${txt.textContent} — 눌러서 동기화 진행률 보기` : '눌러서 동기화 진행률 보기';
            if (txt) {
                txt.textContent = (parkedGate || parkedPhotos.length)
                    ? `자동 올리기 멈춤${parkedPhotos.length ? ` · 사진 ${parkedPhotos.length}장` : ''} · 눌러서 다시 시도`
                    : (mode === 'fail' ? `올리기 실패 · 남음 ${sum.pending}건` : sp.pillText(sum));
                const nowSite = mode === 'run' ? sp.activeSiteText(sum.sites) : '';
                if (nowSite && !parkedGate && !parkedPhotos.length) txt.textContent += ` · ${nowSite}`;
            }
            if (bar) bar.style.width = sum.percent + '%';
            if (ic) ic.className = 'fa-solid ' + (mode === 'done' ? 'fa-circle-check' : (mode === 'fail' ? 'fa-triangle-exclamation' : (sum.syncing ? 'fa-arrows-rotate fa-spin' : 'fa-cloud-arrow-up')));
        }
        // 열려 있는 창
        const sheet = document.getElementById('bsaSyncProgressSheet');
        if (sheet && !sheet.hidden) {
            const body = sheet.querySelector('[data-bsp-body]');
            if (body) {
                let parkedHtml = '';
                if (parkedGate || parkedPhotos.length) {
                    const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                    const g = parkedInfo.gate || {};
                    parkedHtml = `<div class="bsp-parked" style="border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:0.85rem;">`
                        + `<strong><i class="fa-solid fa-circle-pause"></i> 자동 올리기를 멈췄습니다</strong> — 같은 실패를 반복하며 서버 사용량을 쓰지 않도록 멈춘 것이고, 이 기기의 데이터는 지우지 않았습니다.`
                        + (parkedGate ? `<br>원인: ${esc(g.kind === 'permanent' ? '서버가 거부(권한·없음·잘못된 값 등)' : `${g.fails || 0}번 연속 실패`)} · ${esc(g.reason || '')}` : '')
                        + (parkedPhotos.length ? `<br>못 올린 사진 ${parkedPhotos.length}장: ${esc(parkedPhotos.slice(0, 5).map((x) => `${syncProgressPhotoLabel(x.id)} (${x.reason || x.kind})`).join(', '))}${parkedPhotos.length > 5 ? ' …' : ''}` : '')
                        + `<br>원인을 해결한 뒤 아래 「지금 다시 올리기」를 눌러 주세요.</div>`;
                }
                body.innerHTML = parkedHtml + syncMissingPhotosHtml() + sp.renderPanelHtml(sum, syncProgressFloorLabel);
            }
            const retry = sheet.querySelector('[data-bsp="retry"]');
            if (retry) retry.disabled = !sum.online || !(sum.pending || parkedGate || parkedPhotos.length);
        }
        // 2026-10-19 오프라인 준비 창(건물마다 진행률·다시 받기)
        const opModal = document.getElementById('offlinePrepModal');
        const opOpen = !!(opModal && opModal.classList.contains('open'));
        if (opOpen && typeof renderOfflinePrepSyncSection === 'function') renderOfflinePrepSyncSection(opModal).catch(() => {});
        // 올리는 중에는 자주 다시 그린다(사진 표시·실패 등 일지 밖 변화)
        if ((sum.syncing || opOpen || (sheet && !sheet.hidden)) && !_syncProgressRenderTimer) setTimeout(scheduleSyncProgressRender, 1500);
    }
    /** 진행률을 보여 줄 건물: 지금 건물 → 안 올라간 변경이 있는 건물 */
    function syncProgressTargetBuilding() {
        const list = (window.state && window.state.buildings) || [];
        const cur = window.state && window.state.currentBuildingId;
        const byId = (id) => list.find((b) => b && b.id === id) || null;
        if (cur && byId(cur)) return byId(cur);
        const keys = [];
        try { Array.from(_dirtyFloorKeys).forEach((k) => keys.push(String(k))); } catch (_e) { /* 준비 전 */ }
        try { const j = syncJournal(); if (j) j.pendingEntries().forEach((e) => { if (e.fk) keys.push(String(e.fk)); }); } catch (_e) { /* ignore */ }
        for (const k of keys) {
            const b = list.find((x) => x && x.id && k.indexOf(`${x.id}_`) === 0);
            if (b) return b;
        }
        return null;
    }
    function openSyncProgressPanel() {
        // 2026-10-19 「오프라인 준비탭에서 보이게」: 진행률은 오프라인 준비 창에서 건물마다 본다. 배지·알약은 그 칸으로 바로 간다.
        const target = syncProgressTargetBuilding();
        if (target && typeof window.openOfflinePrepModal === 'function') {
            window.openOfflinePrepModal(target, { focusSync: true });
            return;
        }
        let el = document.getElementById('bsaSyncProgressSheet');
        if (!el) {
            el = document.createElement('div');
            el.id = 'bsaSyncProgressSheet';
            el.className = 'bsp-overlay';
            el.hidden = true;
            el.innerHTML = `<div class="bsp-card" role="dialog" aria-modal="true" aria-label="서버 동기화 진행률">
                <div class="bsp-head"><strong><i class="fa-solid fa-cloud-arrow-up"></i> 서버 동기화 진행률</strong>
                    <button type="button" class="bsp-x" data-bsp="close" aria-label="닫기">✕</button></div>
                <div class="bsp-body" data-bsp-body></div>
                <div class="bsp-foot">
                    <button type="button" class="btn btn-outline btn-sm" data-bsp="retry"><i class="fa-solid fa-arrows-rotate"></i> 지금 다시 올리기</button>
                    <button type="button" class="btn btn-primary btn-sm" data-bsp="close">닫기</button>
                </div></div>`;
            el.addEventListener('click', (e) => {
                if (e.target === el) { el.hidden = true; return; }
                const b = e.target.closest('[data-bsp]');
                if (!b) return;
                if (b.dataset.bsp === 'close') el.hidden = true;
                else if (b.dataset.bsp === 'retry') retrySyncProgress();
            });
            document.addEventListener('keydown', (e) => {
                if (!el.hidden && String(e.key || '') === 'Escape') { e.preventDefault(); el.hidden = true; }
            });
            document.body.appendChild(el);
        }
        el.hidden = false;
        try { renderSyncProgressUi(); } catch (e) { console.warn('[진행률] 표시 실패', e); }
    }
    window.openSyncProgressPanel = openSyncProgressPanel;
    function retrySyncProgress() {
        if (navigator.onLine === false) {
            window.showToast('오프라인입니다. 인터넷이 연결되면 자동으로 올립니다.', 'warning', 3000);
            return;
        }
        // 2026-10-20 멈춘 올리기·사진을 풀고 다시(기기 데이터는 지운 적 없음)
        if (typeof window.bsaUnparkSync === 'function') window.bsaUnparkSync();
        syncProgressBegin();
        // 올리기 → 서버 확인 → (오프라인 준비한 동이면) 「비울까요?」 — 기존 흐름 그대로
        if (typeof window.runOfflineReturnSync === 'function') window.runOfflineReturnSync('manual');
        else if (typeof syncStateToFirebase === 'function') syncStateToFirebase().catch(() => {});
        window.showToast('서버에 다시 올리는 중입니다…', 'info', 2000);
    }

    updateOfflineBadge();
    window.addEventListener('online', () => {
        updateOfflineBadge();
        if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);
        window.showToast('온라인 상태로 전환되었습니다. 서버 데이터와 병합 후 동기화합니다.', 'success');
        if (typeof reconnectFirestoreSync === 'function') reconnectFirestoreSync('online');
        // 2026-10-16 오프라인 작업 자동 올리기 + 확인 + 비울지 묻기
        // 2026-10-19 오래된 캐시 정리는 여기서 하지 않는다 — 연결 순간 정리가 올리기보다 먼저 돌아 안 올라간 사진 사본을 지울 수 있었다.
        // 올리기·서버 확인이 끝난 뒤 runOfflineReturnSync가 정리한다(정리 쪽에도 보호 규칙: js/core/cache-purge-guard.js).
        setTimeout(() => { if (typeof window.runOfflineReturnSync === 'function') window.runOfflineReturnSync('online'); }, 4000);
        setTimeout(() => { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.run('online'); }, 60000);
    });
    // 2026-10-16 오프라인을 겪었다는 표시 — 인터넷 복귀 후 올리기·확인·「비울까요?」를 이때만 한다
    const markOfflineWorked = () => {
        try { localStorage.setItem('bsa_offline_worked_v1', '1'); } catch (_e) { /* ignore */ }
        // 2026-11-02 새 오프라인 작업이 생기면 「2일 뒤 삭제」 카운트다운을 멈춘다(다시 올리고 확인한 뒤 새로 시작)
        try { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.clearAll(); } catch (_e) { /* ignore */ }
    };
    if (navigator.onLine === false) markOfflineWorked();
    else setTimeout(() => { if (typeof window.runOfflineReturnSync === 'function') window.runOfflineReturnSync('boot'); }, 20000);
    if (navigator.onLine !== false) setTimeout(() => { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.run('boot'); }, 90000);
    setInterval(() => { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.run('timer'); }, 6 * 60 * 60 * 1000);
    window.addEventListener('offline', () => {
        markOfflineWorked();
        updateOfflineBadge();
        if (typeof updateOnlineBadge === 'function') updateOnlineBadge(false);
        window.showToast('오프라인 상태입니다. 변경사항은 이 기기에 저장되며, 인터넷 연결 시 자동 동기화됩니다.', 'warning', 5000);
    });
    // 앱/탭 복귀: 오프라인 복구 폴백. 이미 붙어 있는 onSnapshot을 뜯어 재구독하지 않는다.
    // (재구독·전체 sync는 문서 전체를 다시 읽어 Spark 읽기 할당량을 급증시킨다)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (navigator.onLine && typeof reconnectFirestoreSync === 'function') {
            reconnectFirestoreSync('visible');
        }
    });
    window.addEventListener('focus', () => {
        if (navigator.onLine && typeof reconnectFirestoreSync === 'function') {
            reconnectFirestoreSync('focus');
        }
    });

    // --- 4. PERSISTENCE ENGINE (LOCAL STORAGE + INDEXEDDB) ---
    let _localStorageSaveFailedNotified = false;
    let _localStorageSaveFailedAt = 0;
    let _suppressSyncOnSave = false;
    const LOCAL_STATE_KEY_LEGACY = 'building_safety_app_state_v2';
    const LOCAL_STATE_KEY_COMPANY_PREFIX = 'building_safety_app_state_v2_c_';
    let _activeLocalStateCompanyId = null;

    function getLocalStorageStateKey(companyId) {
        if (companyId) return `${LOCAL_STATE_KEY_COMPANY_PREFIX}${companyId}`;
        return LOCAL_STATE_KEY_LEGACY;
    }

    /** 이 기기에 회사별 캐시가 하나라도 이미 있는지 (있다면 다른 회사 것일 수 있어 레거시 이관을 막는다) */
    function hasAnyCompanyScopedLocalState() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(LOCAL_STATE_KEY_COMPANY_PREFIX) === 0) return true;
            }
        } catch (_e) { /* ignore */ }
        return false;
    }

    function clearInspectionStateInMemory() {
        window.state.buildings = [];
        window.state.defects = {};
        window.state.ndtData = {};
        window.state.ndtDisplacementGroups = {};
        window.state.deletedDefectIds = {};
        window.state.deletedDefectAt = {};
        window.state.deletedNdtIds = {};
        window.state.deletedNdtAt = {};
        window.state.drawingMemos = {};
        window.state.deletedMemoIds = {};
        window.state.deletedMemoAt = {};
        window.state.sketchMemos = {};
        window.state.deletedSketchIds = {};
        window.state.deletedSketchAt = {};
        window.state.guideShapes = {};
        window.state.deletedGuideShapeIds = {};
        window.state.deletedGuideShapeAt = {};
        window.state.structMembers = {};
        window.state.deletedStructMemberIds = {};
        window.state.deletedStructMemberAt = {};
        window.state.structOverlays = {};
        window.state.deletedBuildingIds = [];
        window.state.confirmedDeletedIds = {};
        window.state.currentBuildingId = null;
        window.state.currentBuilding = null;
        window.state.currentFloor = null;
    }

    /** 회사 전환 시 메모리·로컬 캐시를 회사 단위로 분리 (다른 회사/가입 전 데이터와 섞이지 않게) */
    async function switchCompanyLocalDataContext(companyId, uid) {
        const prevCompanyId = _activeLocalStateCompanyId;
        if (prevCompanyId && prevCompanyId !== companyId && typeof saveStateToLocalStorage === 'function') {
            const prevSuppress = _suppressSyncOnSave;
            _suppressSyncOnSave = true;
            try { saveStateToLocalStorage(); } catch (e) { /* ignore */ }
            _suppressSyncOnSave = prevSuppress;
        }
        _activeLocalStateCompanyId = companyId || null;
        clearInspectionStateInMemory();
        // 2026-10-20 기기 저장 공간이 차서 IndexedDB 예비 저장본에 남긴 것이 더 새 것이면 그걸 읽는다
        const raw = (companyId || uid) ? await readIdbStateFallbackIfNewer(getLocalStorageStateKey(companyId || null)) : null;
        if (companyId && typeof loadStateFromLocalStorage === 'function') {
            loadStateFromLocalStorage({ companyId, raw });
        } else if (!companyId && uid && typeof loadStateFromLocalStorage === 'function') {
            loadStateFromLocalStorage({ companyId: null, raw });
        }
        // 큰 데이터(SAFETY357 그림·다른 회사 저장본)를 IndexedDB로 옮겨 자리를 만든다(확인 뒤에만 지움)
        setTimeout(() => { try { window.bsaFreeLocalStorage && window.bsaFreeLocalStorage(); } catch (_e) { /* ignore */ } }, 8000);
    }

    async function readIdbStateFallbackIfNewer(key) {
        try {
            const LQ = window.BSA && window.BSA.lsQuota;
            if (!LQ) return null;
            const fb = await localBackupGet('state:' + key);
            if (!fb || typeof fb.raw !== 'string' || !fb.raw) return null;
            const lsRaw = localStorage.getItem(key);
            if (lsRaw && LQ.savedAtOf(lsRaw) >= LQ.savedAtOf(fb.raw)) return null;
            _idbStateFallbackKeys.add(key);
            console.info('[저장 공간] IndexedDB 예비 저장본에서 읽습니다:', key);
            return fb.raw;
        } catch (_e) {
            return null;
        }
    }

    // 이미 IndexedDB에 저장해둔 이미지는 매번 다시 쓰지 않도록 키를 기억해둔다
    // (saveStateToLocalStorage는 아주 자주 호출되므로, 안 그러면 같은 이미지를 계속 다시 쓰게 된다)
    const _idbPersistedDrawingKeys = new Set();
    const _idbPersistedPhotoKeys = new Set();
    const _idbPersistedPdfKeys = new Set();
    // PDF를 뺀 층(floorPdfRemovedAt) — 이 세션에서 옛 PDF를 버린 층 / 클라우드에서 지워진 걸 확인한 층
    const _droppedRemovedPdfKeys = new Set();
    const _confirmedGoneCloudPdfKeys = new Set();
    const _idbPersistedTierKeys = new Set();
    const _idbPersistedSourceKeys = new Set();
    // 저장이 아직 끝나지 않은 키(진행 중). 실제 저장이 성공하기 전까지는 "저장됨"으로
    // 표시하지 않아서, 실패 시 다음 saveStateToLocalStorage 호출 때 재시도되게 한다.
    const _idbPendingDrawingKeys = new Set();
    const _idbPendingPhotoKeys = new Set();
    const _idbPhotoWriteGen = new Map();
    const _idbPendingPdfKeys = new Set();
    const _idbPendingTierKeys = new Set();
    const _idbPendingSourceKeys = new Set();
    const _sessionDeletedDrawingKeys = new Set();
    const _sessionDeletingDrawingFloors = new Set();
    const _drawingFloorTombstone = (window.BSA && window.BSA.drawingFloorTombstone) || {};
    let _idbSaveFailedNotified = false;
    let floorDrawingActiveTierDim = (typeof window.getFloorDrawingBaseTierDim === 'function')
        ? window.getFloorDrawingBaseTierDim()
        : 2000;
    let floorDrawingTierLoadToken = 0;
    let floorDrawingTierSyncTimer = null;
    const _floorTierPrefetchInFlight = new Set();
    const _floorTierCloudFetchInFlight = new Set();
    const _floorTierCloudFetchPromises = new Map();

    function floorDrawingTierIdbKey(bldgId, floorCode, dim) {
        return `${bldgId}_${floorCode}_${dim}`;
    }

    function getMaxDisplayDrawingTierDim() {
        const zoomVsFit = getMapZoomVsFit();
        const mobile = isMobileDrawingContext();
        const z = window.FLOOR_DRAWING_TIER_ZOOM || {};
        const toHi = mobile ? (z.TO_HI_MOBILE || 20.0) : (z.TO_HI || 12.0);
        return zoomVsFit >= toHi ? 16000 : 8000;
    }

    async function idbGetFloorDrawingTier(bldgId, floorCode, dim) {
        if (!bldgId || !floorCode || !dim) return null;
        const perDim = await idbGet('floorDrawingTiers', floorDrawingTierIdbKey(bldgId, floorCode, dim));
        if (typeof perDim === 'string' && perDim.length > 32) return perDim;
        const bundled = await idbGet('floorDrawingTiers', `${bldgId}_${floorCode}`);
        if (bundled && typeof bundled === 'object') {
            const url = bundled[String(dim)] || bundled[dim];
            if (typeof url === 'string' && url.length > 32) {
                idbSet('floorDrawingTiers', floorDrawingTierIdbKey(bldgId, floorCode, dim), url);
                idbDelete('floorDrawingTiers', `${bldgId}_${floorCode}`);
                return url;
            }
        }
        return null;
    }

    /** 지금 안 쓰는 도면·PDF·원본은 RAM에서 내린다. IndexedDB에는 persist 후 그대로 둔다. */
    function releaseHeavyDrawingMemory(bldg, opts) {
        if (!bldg) return;
        const keepFloor = opts && opts.keepFloor;
        const keepDim = opts && opts.keepDim != null ? String(opts.keepDim) : null;
        // 2026-11-09 기기(IndexedDB)에도 서버에도 없는 도면은 비우지 않는다. 예전엔 기기 저장이 실패해도(저장 공간 부족 등)
        // 무조건 비워서, 서버 업로드까지 실패하면 도면이 어디에도 안 남고 「저장 완료」 뒤 통째로 사라졌다.
        const safe = (persisted, cloud, key) => !!((persisted && persisted.has(key)) || (cloud && cloud.has(key)));
        const floorKey = (fc) => `${bldg.id}_${fc}`;
        Object.keys(bldg.floorDrawingPdfs || {}).forEach((fc) => {
            if (safe(_idbPersistedPdfKeys, window._cloudSyncedPdfKeys, floorKey(fc))) delete bldg.floorDrawingPdfs[fc];
        });
        Object.keys(bldg.floorDrawingSources || {}).forEach((fc) => {
            if (safe(_idbPersistedSourceKeys, null, floorKey(fc))) delete bldg.floorDrawingSources[fc];
        });
        Object.keys(bldg.floorDrawings || {}).forEach((fc) => {
            if (keepFloor && fc === keepFloor) return;
            if (safe(_idbPersistedDrawingKeys, window._cloudSyncedDrawingKeys, floorKey(fc))) delete bldg.floorDrawings[fc];
        });
        Object.keys(bldg.floorDrawingTiers || {}).forEach((fc) => {
            const tiers = bldg.floorDrawingTiers[fc];
            if (!tiers) return;
            const tierSafe = (d) => safe(_idbPersistedTierKeys, window._cloudSyncedTierKeys, `${bldg.id}_${fc}_${d}`);
            if (keepFloor && fc === keepFloor) {
                Object.keys(tiers).forEach((d) => {
                    if (keepDim && d !== keepDim && d !== '4000' && tierSafe(d)) delete tiers[d];
                });
            } else {
                Object.keys(tiers).forEach((d) => { if (tierSafe(d)) delete tiers[d]; });
                if (!Object.keys(tiers).length) delete bldg.floorDrawingTiers[fc];
            }
        });
    }

    function pruneFloorDrawingDecodedCache(bldgId, floorCode, keepDim) {
        if (!state.floorDrawingTierImageCache || !bldgId || !floorCode) return;
        const prefix = `${bldgId}_${floorCode}_`;
        const keep = keepDim != null ? String(keepDim) : '';
        Object.keys(state.floorDrawingTierImageCache).forEach((k) => {
            if (!k.startsWith(prefix)) return;
            if (keep && (k.endsWith('_' + keep) || k.endsWith('_4000'))) return;
            delete state.floorDrawingTierImageCache[k];
        });
    }
    let viewportHiPatchTimer = null;
    let viewportHiPatchToken = 0;
    let viewportHiPatchInFlight = 0;
    /** PDF 뷰포트 패치 해상도 단계 (0=끔, 1~3 기본, 4=큰 도면) */
    let viewportPatchActiveLevel = 0;
    let lastViewportPatchMeta = null;

    function resetViewportPatchState() {
        viewportPatchActiveLevel = 0;
        lastViewportPatchMeta = null;
    }

    function getViewportPatchStepCount(refLong) {
        return (refLong >= 5500) ? 4 : 3;
    }

    /**
     * 확대 배율을 3~4단계로 양자화 (히스테리시스 — 조금 움직일 때마다 재렌더 방지)
     * @returns {number} 0=패치 없음, 1~maxLevel
     */
    function pickViewportPatchLevel(zoomDemand, maxLevel, currentLevel) {
        const cur = currentLevel || 0;
        const d = zoomDemand || 1;
        const top = maxLevel >= 4 ? 4 : 3;
        const entry = isMobileMapViewport() ? 0.78 : 1.05;
        const exitLow = isMobileMapViewport() ? 0.68 : 1.02;

        if (top >= 4) {
            if (cur >= 4) {
                if (d < 4.4) return 3;
                return 4;
            }
            if (cur === 3) {
                if (d >= 5.2) return 4;
                if (d < 2.65) return 2;
                return 3;
            }
            if (cur === 2) {
                if (d >= 3.35) return 3;
                if (d < 1.5) return 1;
                return 2;
            }
            if (cur === 1) {
                if (d >= 2.05) return 2;
                if (d < exitLow) return 0;
                return 1;
            }
            if (d >= entry) return 1;
            return 0;
        }

        // 3단계 (level 3 = 최고)
        if (cur >= 3) {
            if (d < 2.75) return 2;
            return 3;
        }
        if (cur === 2) {
            if (d >= 3.3) return 3;
            if (d < 1.5) return 1;
            return 2;
        }
        if (cur === 1) {
            if (d >= 2.05) return 2;
            if (d < (isMobileMapViewport() ? 0.55 : 0.88)) return 0;
            return 1;
        }
        if (d >= entry) return 1;
        return 0;
    }

    /** PC·모바일 공통 — 실제 선명도는 zoomDemand로 outLong 계산, levelMul은 단계 히스테리시스용 */
    function getViewportPatchLevelMultiplier(level) {
        if (level <= 0) return 0;
        const table = [0, 1.45, 2.25, 3.55, 5.2];
        return table[Math.min(level, table.length - 1)] || table[table.length - 1];
    }

    function getViewportPatchPixelBudget(mobile) {
        if (!mobile) return 8000;
        return getMobileZoomTierDim(floorDrawingActiveTierDim);
    }

    /** 모바일 GPU 캔버스 한 변 상한 */
    function getViewportPatchMaxSide(mobile) {
        if (!mobile) return 16384;
        return Math.max(4096, getMobileZoomTierDim(floorDrawingActiveTierDim));
    }

    function clampPatchOutputDims(outW, outH, maxLong, maxSide) {
        let w = Math.max(1, Math.round(outW));
        let h = Math.max(1, Math.round(outH));
        const long0 = Math.max(w, h);
        if (long0 > maxLong) {
            const s = maxLong / long0;
            w = Math.max(1, Math.round(w * s));
            h = Math.max(1, Math.round(h * s));
        }
        const side = Math.max(w, h);
        if (side > maxSide) {
            const s = maxSide / side;
            w = Math.max(1, Math.round(w * s));
            h = Math.max(1, Math.round(h * s));
        }
        return { w, h };
    }

    async function ensureFloorPlanRefForPdf(bldg, floorCode) {
        if (!bldg || !floorCode) return;
        // PDF를 뺀 층 — 옛 PDF 크기로 좌표 기준을 잡지 않는다(그림 크기 기준 updateFloorPlanRefFromImage)
        if (dropRemovedFloorPdf(bldg, floorCode)) return;
        let pdfUrl = (typeof window.getFloorPdfDataUrl === 'function')
            ? window.getFloorPdfDataUrl(bldg, floorCode)
            : null;
        if (!pdfUrl && typeof window.resolveFloorPdfDataUrlAsync === 'function') {
            pdfUrl = await window.resolveFloorPdfDataUrlAsync(bldg, floorCode);
        }
        if (!pdfUrl || typeof window.getPdfRefPixelSize !== 'function') return;
        try {
            const refDim = window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000;
            const ref = await window.getPdfRefPixelSize(pdfUrl, refDim, `${bldg.id}_${floorCode}`);
            state.floorPlanRef = { w: ref.w, h: ref.h, bldgId: bldg.id, floorCode };
        } catch (e) {
            console.warn('PDF ref 좌표계 설정 실패:', e);
        }
        // 캐드 벡터 스냅용 선분. 그림만 있고 PDF 원본이 없으면 여기까지 오지 않는다.
        if (window.BSA_PDF_SNAP && typeof window.BSA_PDF_SNAP.ensureGeometry === 'function') {
            await window.BSA_PDF_SNAP.ensureGeometry(pdfUrl, bldg.id, floorCode, window.FLOOR_DRAWING_PDF_PREVIEW_DIM || 4000);
        }
    }

    function shouldUpdateViewportPatchRegion(region, meta) {
        if (!meta || meta.cx == null) return true;
        const cx = region.x + region.w / 2;
        const cy = region.y + region.h / 2;
        const thresh = Math.min(region.w, region.h) * 0.38;
        return Math.abs(cx - meta.cx) > thresh || Math.abs(cy - meta.cy) > thresh;
    }

    function updateFloorPlanRefFromImage(img, bldgId, floorCode) {
        if (!img || !bldgId || !floorCode) return;
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        if (w <= 0 || h <= 0) return;
        state.floorPlanRef = { w, h, bldgId, floorCode };
    }

    /** 핀·줌·패치 공통 좌표계 — bgImage LOD 교체와 무관하게 4000px 기준 유지 */
    function getFloorPlanDisplayDims() {
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        if (typeof window.getFloorPlanRefDimensions === 'function' && bldg && fc) {
            const ref = window.getFloorPlanRefDimensions(bldg, fc);
            if (ref.w > 0 && ref.h > 0) return ref;
        }
        const img = state.bgImage;
        return {
            w: img ? (img.naturalWidth || img.width || 1200) : 1200,
            h: img ? (img.naturalHeight || img.height || 700) : 700,
        };
    }

    function getMapFitScale() {
        const cw = state.canvasCssW || (state.canvas ? Math.round(state.canvas.width / (state.canvasDpr || 1)) : 800);
        const ch = state.canvasCssH || (state.canvas ? Math.round(state.canvas.height / (state.canvasDpr || 1)) : 600);
        const dims = getFloorPlanDisplayDims();
        const isRotated = (state.rotationAngle === 90 || state.rotationAngle === 270);
        const drawW = isRotated ? dims.h : dims.w;
        const drawH = isRotated ? dims.w : dims.h;
        if (drawW <= 0 || drawH <= 0) return 1;
        return Math.min((cw - 40) / drawW, (ch - 40) / drawH, 1.2);
    }

    /** 절대 scale 하한(레거시). 상·하한은 fit 대비 비율로 통일 */
    const VIEW_MIN_SCALE = 0.1;
    const VIEW_MAX_ZOOM_VS_FIT = 50;
    const VIEW_MIN_ZOOM_VS_FIT = 0.08;

    function getViewScaleLimits(getFitFn) {
        const fit = Math.max(getFitFn() || 0.05, 0.05);
        return {
            min: Math.max(VIEW_MIN_SCALE, fit * VIEW_MIN_ZOOM_VS_FIT),
            max: Math.max(fit * VIEW_MAX_ZOOM_VS_FIT, fit * 1.02),
        };
    }

    function getMapViewScaleLimits() {
        return getViewScaleLimits(getMapFitScale);
    }

    function formatMapZoomLabel() {
        return `${getMapZoomVsFitPercent()}%`;
    }

    function shouldAutoFitMapView() {
        if (!state.bgImage) return true;
        const fitScale = getMapFitScale();
        return (state.view.scale || 1) <= fitScale * 1.08;
    }

    function clearFloorDrawingHiPatch(immediate = true) {
        viewportHiPatchToken++;
        resetViewportPatchState();
        if (!state.floorDrawingHiPatch && !_floorBlend) return;
        if (immediate) {
            cancelFloorDrawingBlend();
            state.floorDrawingHiPatch = null;
            return;
        }
        applyFloorDrawingTarget(undefined, null);
    }

    const FLOOR_DRAWING_BLEND_MS = 320;
    let _floorBlendRaf = null;
    /** @type {{ start:number, duration:number, fromBg:Image|null, toBg:Image|null, fromPatch:object|null, toPatch:object|null, progress:number }|null} */
    let _floorBlend = null;

    function easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function cancelFloorDrawingBlend() {
        if (_floorBlendRaf) {
            cancelAnimationFrame(_floorBlendRaf);
            _floorBlendRaf = null;
        }
        _floorBlend = null;
    }

    function commitFloorBlendNow() {
        if (!_floorBlend) return;
        if (_floorBlend.toBg) state.bgImage = _floorBlend.toBg;
        state.floorDrawingHiPatch = _floorBlend.toPatch;
        cancelFloorDrawingBlend();
    }

    function floorImagesEquivalent(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        if (a.src && b.src) return a.src === b.src;
        return false;
    }

    function floorPatchesEquivalent(a, b) {
        if (a === b) return true;
        if (!a || !b) return false;
        return a.canvas === b.canvas
            && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    }

    function tickFloorDrawingBlend() {
        if (!_floorBlend) return;
        const elapsed = performance.now() - _floorBlend.start;
        const t = easeInOutCubic(Math.min(1, elapsed / _floorBlend.duration));
        _floorBlend.progress = t;
        drawCanvas();
        if (t >= 1) {
            if (_floorBlend.toBg) state.bgImage = _floorBlend.toBg;
            state.floorDrawingHiPatch = _floorBlend.toPatch;
            cancelFloorDrawingBlend();
            drawCanvas();
            return;
        }
        _floorBlendRaf = requestAnimationFrame(tickFloorDrawingBlend);
    }

    function startFloorDrawingBlend(fromBg, toBg, fromPatch, toPatch) {
        if (window.BSA?.performance?.skipFloorCrossfade?.()) {
            if (toBg) state.bgImage = toBg;
            state.floorDrawingHiPatch = toPatch;
            drawCanvas({ immediate: true });
            return;
        }
        if (_floorBlend) commitFloorBlendNow();
        _floorBlend = {
            start: performance.now(),
            duration: FLOOR_DRAWING_BLEND_MS,
            fromBg,
            toBg,
            fromPatch,
            toPatch,
            progress: 0
        };
        tickFloorDrawingBlend();
    }

    function hasActiveFloorHiPatch() {
        if (state.floorDrawingHiPatch) return true;
        if (_floorBlend && (_floorBlend.toPatch || _floorBlend.fromPatch)) return true;
        return false;
    }

    function getViewportZoomDemand() {
        const cw = state.canvasCssW || 800;
        const ch = state.canvasCssH || 600;
        const dpr = state.canvasDpr || 1;
        const scale = Math.max(state.view.scale || 1, 0.05);
        const region = getVisibleImageRect();
        const screenLong = Math.max(cw, ch) * dpr;
        const regionLong = Math.max(region.w, region.h, 1);
        const fitScale = getMapFitScale();
        const zoomVsFit = scale / Math.max(fitScale, 0.05);
        // 화면맞춤(zoomVsFit≈1)에서는 패치 끔 — fit 상태에서 흰 패치가 도면 전체를 덮는 문제 방지
        const beyondFit = Math.max(0, zoomVsFit - 1.08);
        const mobileBoost = isMobileMapViewport() ? 2.9 : 2.4;
        return Math.max(screenLong / regionLong, scale * dpr, beyondFit * dpr * mobileBoost);
    }

    function isViewportPatchCanvasUsable(canvas) {
        return !!(canvas && canvas.width >= 8 && canvas.height >= 8);
    }

    /**
     * 도면 배경·고해상도 패치 교체 — 즉시 점프 대신 크로스페이드
     * @param {Image|null|undefined} nextBg undefined면 배경 유지
     * @param {object|null|undefined} nextPatch undefined면 패치 유지, null이면 제거
     */
    function applyFloorDrawingTarget(nextBg, nextPatch, opts) {
        const options = opts || {};
        const immediate = !!options.immediate;
        const toBg = nextBg === undefined ? state.bgImage : nextBg;
        const toPatch = nextPatch === undefined ? state.floorDrawingHiPatch : nextPatch;

        if (immediate || !state.bgImage) {
            cancelFloorDrawingBlend();
            if (toBg) state.bgImage = toBg;
            state.floorDrawingHiPatch = toPatch;
            drawCanvas();
            syncNdtBackgroundWithMapDrawing();
            return;
        }

        const fromBg = state.bgImage;
        const fromPatch = state.floorDrawingHiPatch;
        if (floorImagesEquivalent(fromBg, toBg) && floorPatchesEquivalent(fromPatch, toPatch)) return;
        const bgChanged = !floorImagesEquivalent(fromBg, toBg);

        // 동기화 로직(줌 패치 재요청 방지)용으로는 즉시 반영, 화면만 크로스페이드
        if (toBg) state.bgImage = toBg;
        state.floorDrawingHiPatch = toPatch;
        startFloorDrawingBlend(fromBg, toBg, fromPatch, toPatch);
        if (bgChanged) syncNdtBackgroundWithMapDrawing();
    }

    // 결함위치도(state.bgImage)가 실제로 바뀔 때(층 변경 등) 비파괴조사 탭의 도면(ndtBgImage)도
    // 같이 갱신한다. 예전엔 층 선택 드롭다운 change 핸들러가 loadFloorDrawing()만 부르고
    // 비파괴조사 쪽은 안 건드려서, 비파괴조사 탭에 머문 채로 점검층을 바꾸면 도면이 그대로
    // 안 바뀌는 버그가 있었다(탭을 나갔다 다시 들어와야만 새로고침됨). 패치(줌 HD 조각)만
    // 바뀐 경우는 배경 자체는 그대로라 다시 부르지 않는다(bgChanged로 걸러냄).
    function syncNdtBackgroundWithMapDrawing() {
        if (typeof loadFloorNdtDrawing === 'function' && document.getElementById('ndtCanvas')) {
            loadFloorNdtDrawing();
        }
    }

    // --- 도면 진하게 (2026-10-14) ---
    // 연한 회색 선으로 올라온 도면은 화면·출력(한글·PDF 위치도)에서 잘 안 보인다. 층마다 단계를 정해 두면
    // 도면 그림을 "곱하기"로 덧그려 선만 진하게 한다 — 흰 바탕은 그대로 희고, 핀·범례 색은 건드리지 않는다.
    // 저장: state.floorDrawingDarken[건물_층] = 0~3. 되돌릴 때도 키를 지우지 않고 0 을 넣는다(루트 문서는 merge 로 올린다).
    const FLOOR_DRAWING_DARKEN_LABELS = ['보통', '진하게', '더 진하게', '가장 진하게'];
    const FLOOR_DRAWING_DARKEN_PASSES = [0, 1, 2, 4];

    function getFloorDrawingDarken(buildingId, floorCode) {
        const map = state.floorDrawingDarken;
        if (!map || typeof map !== 'object') return 0;
        const v = parseInt(map[getFloorMapStyleKey(buildingId, floorCode)], 10);
        return Number.isFinite(v) ? Math.min(Math.max(v, 0), FLOOR_DRAWING_DARKEN_LABELS.length - 1) : 0;
    }

    function setFloorDrawingDarken(buildingId, floorCode, level) {
        if (!state.floorDrawingDarken || typeof state.floorDrawingDarken !== 'object') state.floorDrawingDarken = {};
        state.floorDrawingDarken[getFloorMapStyleKey(buildingId, floorCode)] = level;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
    }

    /** 방금 그린 도면 위에 같은 그림을 곱하기로 덧그린다. draw()는 도면을 한 번 그리는 함수. */
    function applyFloorDrawingDarken(ctx, level, draw) {
        const passes = FLOOR_DRAWING_DARKEN_PASSES[level] || 0;
        if (!passes) return;
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        for (let i = 0; i < passes; i++) draw();
        ctx.restore();
    }

    /** 도면을 (0,0)에 w×h 로 그리고 진하게 단계를 입힌다 — 출력용 그림들이 쓴다. */
    function drawFloorDrawingImage(ctx, img, w, h, level) {
        ctx.drawImage(img, 0, 0, w, h);
        applyFloorDrawingDarken(ctx, level, () => ctx.drawImage(img, 0, 0, w, h));
    }

    function syncFloorDrawingDarkenButton(level) {
        const btn = document.getElementById('btnFloorDrawingDarken');
        if (!btn || btn.dataset.level === String(level)) return;
        btn.dataset.level = String(level);
        btn.classList.toggle('active', level > 0);
        btn.innerHTML = `<i class="fa-solid fa-circle-half-stroke"></i> 도면 ${FLOOR_DRAWING_DARKEN_LABELS[level]}`;
    }

    (function bindFloorDrawingDarkenButton() {
        const btn = document.getElementById('btnFloorDrawingDarken');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!state.currentBuildingId || !state.currentFloor) return;
            const next = (getFloorDrawingDarken(state.currentBuildingId, state.currentFloor) + 1) % FLOOR_DRAWING_DARKEN_LABELS.length;
            setFloorDrawingDarken(state.currentBuildingId, state.currentFloor, next);
            drawCanvas();
            syncNdtBackgroundWithMapDrawing();
            window.showToast?.(`이 층 도면: ${FLOOR_DRAWING_DARKEN_LABELS[next]} — 한글·PDF 위치도에도 적용됩니다.`, 'info', 2500);
        });
    })();

    function drawFloorPlanLayers(ctx, imgW, imgH) {
        const darken = getFloorDrawingDarken(state.currentBuildingId, state.currentFloor);
        syncFloorDrawingDarkenButton(darken);
        const drawBg = (img, alpha) => {
            if (!img || alpha <= 0.001) return;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, 0, 0, imgW, imgH);
            applyFloorDrawingDarken(ctx, darken, () => ctx.drawImage(img, 0, 0, imgW, imgH));
            ctx.restore();
        };
        const drawPatch = (patch, alpha) => {
            if (!patch || !patch.canvas || patch.w <= 0 || patch.h <= 0 || alpha <= 0.001) return;
            ctx.save();
            ctx.imageSmoothingEnabled = false;
            ctx.globalAlpha = alpha;
            ctx.drawImage(patch.canvas, patch.x, patch.y, patch.w, patch.h);
            applyFloorDrawingDarken(ctx, darken, () => ctx.drawImage(patch.canvas, patch.x, patch.y, patch.w, patch.h));
            ctx.restore();
        };

        if (!_floorBlend) {
            if (state.bgImage) {
                drawBg(state.bgImage, 1);
                drawPatch(state.floorDrawingHiPatch, 1);
            }
            return;
        }

        const t = _floorBlend.progress || 0;
        const { fromBg, toBg, fromPatch, toPatch } = _floorBlend;
        const bgSame = floorImagesEquivalent(fromBg, toBg);
        const patchSame = floorPatchesEquivalent(fromPatch, toPatch);

        // 1) 배경만 (티어 교차페이드) — 패치는 항상 그 다음에 그림
        const baseBg = fromBg || toBg;
        if (baseBg) drawBg(baseBg, 1);
        if (!bgSame && toBg) drawBg(toBg, t);

        // 2) HD 패치는 항상 최상단 — bg 티어(4000 PNG)가 선명 패치를 덮지 않게
        if (toPatch && !patchSame && fromPatch) {
            drawPatch(fromPatch, 1 - t);
            drawPatch(toPatch, t);
        } else {
            const topPatch = toPatch || fromPatch;
            if (topPatch) drawPatch(topPatch, 1);
        }
    }

    /** @type {Map<string, boolean>} 층별 PDF 유무 (모바일 async 조회 결과) */
    const _floorPdfKnown = new Map();
    /** @type {Set<string>} 서버/IDB PDF 조회 진행 중인 층 */
    const _pdfFetchInFlight = new Set();
    const _pdfPatchWarnedFloors = new Set();

    function floorPdfCacheKey(bldgId, floorCode) {
        return `${bldgId}_${floorCode}`;
    }

    function resetFloorPdfKnownState(bldgId, floorCode) {
        if (!bldgId || !floorCode) return;
        _floorPdfKnown.delete(floorPdfCacheKey(bldgId, floorCode));
    }

    function clearAllFloorPdfKnownState() {
        _floorPdfKnown.clear();
    }

    function markFloorPdfKnown(bldgId, floorCode, hasPdf) {
        if (!bldgId || !floorCode) return;
        _floorPdfKnown.set(`${bldgId}_${floorCode}`, !!hasPdf);
    }

    window.preloadCurrentFloorPdfSource = async function preloadCurrentFloorPdfSource() {
        return;
    };

    function floorHasPdfSourceSync(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        if (typeof window.getFloorPdfDataUrl === 'function' && window.getFloorPdfDataUrl(bldg, floorCode)) {
            return true;
        }
        const idbKey = `${bldg.id}_${floorCode}`;
        return !!(_idbPersistedPdfKeys && _idbPersistedPdfKeys.has(idbKey));
    }

    function isPdfDrawingUrl(url) {
        return typeof url === 'string' && (
            url.startsWith('data:application/pdf')
            || (typeof window.isPdfDrawingDataUrl === 'function' && window.isPdfDrawingDataUrl(url))
        );
    }

    function isRasterDrawingUrl(url) {
        if (!url || typeof url !== 'string' || url.length < 33) return false;
        if (isPdfDrawingUrl(url)) return false;
        if (url.startsWith('file:///') && window.location.protocol !== 'file:') return false;
        return url.startsWith('data:image/')
            || url.startsWith('blob:')
            || url.startsWith('http://')
            || url.startsWith('https://')
            || url.startsWith('file:///');
    }

    /** data URL 헤더만 있고 본문이 잘린 등 실제로 img 로드 불가능한 경우 제외.
     *  https Storage URL은 캔버스 crossOrigin 때문에 CORS/규칙에 막히므로 usable이 아님.
     *  클라우드 경로는 data: 로 materialize 한 뒤에만 쓴다. */
    function isUsableRasterDrawingUrl(url) {
        if (!isRasterDrawingUrl(url)) return false;
        if (url.startsWith('data:image/')) return url.length >= 2000;
        if (url.startsWith('http://') || url.startsWith('https://')) return false;
        return true;
    }

    function clearBrokenRasterDrawingCache(bldg, floorCode) {
        if (!bldg || !floorCode) return;
        const idbKey = `${bldg.id}_${floorCode}`;
        if (bldg.floorDrawings && bldg.floorDrawings[floorCode]) {
            delete bldg.floorDrawings[floorCode];
        }
        _idbPersistedDrawingKeys.delete(idbKey);
        idbDelete('floorDrawings', idbKey);
    }

    function isDeletedDrawingFloor(bldg, floorCode) {
        if (typeof _drawingFloorTombstone.isDeletedDrawingFloor === 'function') {
            return _drawingFloorTombstone.isDeletedDrawingFloor(bldg, floorCode, _sessionDeletedDrawingKeys);
        }
        return false;
    }

    function rememberDeletedDrawingFloor(bldg, floorCode) {
        if (typeof _drawingFloorTombstone.rememberDeletedDrawingFloor === 'function') {
            // 삭제 시각을 같이 남긴다 — 이게 있어야 "내가 방금 지운 것"과
            // "남이 나중에 다시 올린 것"을 구분할 수 있다.
            _drawingFloorTombstone.rememberDeletedDrawingFloor(
                bldg, floorCode, _sessionDeletedDrawingKeys, Date.now()
            );
        }
        if (typeof _drawingFloorTombstone.stripDeletedDrawingFloorsFromBuilding === 'function') {
            _drawingFloorTombstone.stripDeletedDrawingFloorsFromBuilding(bldg, _sessionDeletedDrawingKeys);
        }
        return bldg;
    }

    /**
     * 묘비 해제. 기본적으로 "삭제 시각이 찍힌 묘비"는 풀지 않는다.
     *
     * 해제 호출이 앱 곳곳(클라우드 조회·IDB 증거·병합)에 흩어져 있는데, 그 대부분은
     * "도면이 아직 어딘가 남아 있다"는 추측이다. 그게 바로 묘비가 막으려던 상황이라
     * 추측으로 풀면 지운 도면이 되살아난다.
     *
     * 사용자가 직접 도면을 다시 올린 경우처럼 확실한 행동만 { force: true }로 푼다.
     * remoteMetaAt을 주면, 원격이 내 삭제보다 나중에 갱신됐을 때만 풀어준다.
     *
     * @returns {boolean} 실제로 해제했으면 true
     */
    function forgetDeletedDrawingFloor(bldg, floorCode, opts) {
        const options = opts || {};
        const code = floorCode == null ? '' : String(floorCode).trim();
        const inflightKey = (bldg && bldg.id && code) ? `${bldg.id}_${code}` : '';
        if (!options.force) {
            if (inflightKey && _sessionDeletingDrawingFloors.has(inflightKey)) {
                return false;
            }
            if (!options.fromEvidence
                && typeof _drawingFloorTombstone.isConfirmedDeletion === 'function'
                && _drawingFloorTombstone.isConfirmedDeletion(bldg, floorCode, options.remoteMetaAt || 0)) {
                return false;
            }
        }
        const wasDeleted = options.force && isDeletedDrawingFloor(bldg, floorCode);
        if (typeof _drawingFloorTombstone.forgetDeletedDrawingFloor === 'function') {
            // 2026-10-13 사용자가 직접 다시 넣은 것(force)은 「다시 넣은 시각」을 남긴다 — 서버·다른 기기의 옛 묘비가
            // 합집합 병합으로 돌아와 새 도면을 다시 지우던 문제(삭제 → 같은 층 새 도면 → 동기화하면 사라짐)
            _drawingFloorTombstone.forgetDeletedDrawingFloor(bldg, floorCode, _sessionDeletedDrawingKeys,
                options.force ? Date.now() : 0);
        }
        if (inflightKey) _sessionDeletingDrawingFloors.delete(inflightKey);
        // 다시 넣은 층은 층 묶음을 바로 올려 옛 표시 묘비가 서버·다른 기기에 닿게 한다
        // (지운 층은 올릴 목록에서 빠져 묘비가 안 올라가 다른 기기에 옛 결함·가이드가 남았다)
        if (wasDeleted && inflightKey && typeof markFloorKeyDirty === 'function') {
            try { markFloorKeyDirty(inflightKey); } catch (_e) { /* ignore */ }
        }
        return true;
    }

    /** 여러 맵·IDB 플래그에서 도면 증거 층 코드를 모은다 */
    function collectDrawingPayloadEvidenceCodes(bldg, extraMaps) {
        const out = new Set();
        const takeMap = (map) => {
            Object.keys(map || {}).forEach((code) => {
                const c = String(code || '').trim();
                if (c) out.add(c);
            });
        };
        if (bldg) {
            takeMap(bldg.floorDrawings);
            takeMap(bldg.floorDrawingPdfs);
            takeMap(bldg.floorDrawingTiers);
            takeMap(bldg.floorDrawingSources);
        }
        (extraMaps || []).forEach(takeMap);
        if (bldg && bldg.id) {
            const pref = String(bldg.id) + '_';
            const scanSet = (set) => {
                if (!set || typeof set.forEach !== 'function') return;
                set.forEach((key) => {
                    if (!key || String(key).indexOf(pref) !== 0) return;
                    let rest = String(key).slice(pref.length);
                    const m = rest.match(/^(.*)_(4000|8000|16000)$/);
                    if (m) rest = m[1];
                    if (rest) out.add(rest);
                });
            };
            scanSet(_idbPersistedDrawingKeys);
            scanSet(_idbPersistedPdfKeys);
            scanSet(_idbPersistedSourceKeys);
            scanSet(_idbPersistedTierKeys);
        }
        return out;
    }

    function stripDeletedDrawingFloorsFromBuilding(bldg) {
        if (bldg) {
            // 2026-11-10 회차 손글씨 메모 자리가 층으로 잘못 기록된 흔적 정리(층 정보만 — 메모는 sketchMemos에 따로 있어 안 건드림)
            const memoCode = 'ROUND_SKETCH_MEMO';
            if (Array.isArray(bldg.floorsList)) bldg.floorsList = bldg.floorsList.filter((f) => !f || f.floorCode !== memoCode);
            if (Array.isArray(bldg.drawingFloorCodes)) bldg.drawingFloorCodes = bldg.drawingFloorCodes.filter((c) => c !== memoCode);
            if (Array.isArray(bldg.deletedDrawingFloorCodes)) bldg.deletedDrawingFloorCodes = bldg.deletedDrawingFloorCodes.filter((c) => c !== memoCode);
            if (bldg.deletedDrawingFloorAt) delete bldg.deletedDrawingFloorAt[memoCode];
            [bldg.floorDrawings, bldg.floorDrawingPdfs, bldg.floorDrawingTiers, bldg.floorDrawingSources].forEach((m) => { if (m) delete m[memoCode]; });
            if (bldg.id && _sessionDeletedDrawingKeys) _sessionDeletedDrawingKeys.delete(`${bldg.id}_${memoCode}`);
        }
        if (typeof _drawingFloorTombstone.stripDeletedDrawingFloorsFromBuilding === 'function') {
            _drawingFloorTombstone.stripDeletedDrawingFloorsFromBuilding(bldg, _sessionDeletedDrawingKeys);
        }
        return bldg;
    }

    function isSessionDeletedDrawingKey(key) {
        return !!(key && _sessionDeletedDrawingKeys.has(key));
    }

    function clearLocalDrawingPersistFlags(bldgId, floorCode) {
        if (!bldgId || !floorCode) return;
        const floorKey = `${bldgId}_${floorCode}`;
        _idbPersistedDrawingKeys.delete(floorKey);
        _idbPersistedPdfKeys.delete(floorKey);
        _idbPersistedSourceKeys.delete(floorKey);
        _idbPendingDrawingKeys.delete(floorKey);
        _idbPendingPdfKeys.delete(floorKey);
        _idbPendingSourceKeys.delete(floorKey);
        _idbPersistedTierKeys.delete(floorKey);
        _idbPendingTierKeys.delete(floorKey);
        (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
            const tierKey = (typeof floorDrawingTierIdbKey === 'function')
                ? floorDrawingTierIdbKey(bldgId, floorCode, d)
                : `${bldgId}_${floorCode}_${d}`;
            _idbPersistedTierKeys.delete(tierKey);
            _idbPendingTierKeys.delete(tierKey);
        });
    }

    /** 층 목록 등록과 별도 — 실제 도면·PDF·소스·IDB 캐시가 있는지 */
    function floorHasDrawingData(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        const tiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (tiers && Object.values(tiers).some(Boolean)) return true;
        if (bldg.floorDrawings && bldg.floorDrawings[floorCode]) return true;
        if (floorHasPdfSourceSync(bldg, floorCode)) return true;
        const src = bldg.floorDrawingSources && bldg.floorDrawingSources[floorCode];
        if (src) return true;
        const key = `${bldg.id}_${floorCode}`;
        if (_idbPersistedTierKeys && (
            _idbPersistedTierKeys.has(key)
            || _idbPersistedTierKeys.has(`${key}_4000`)
            || _idbPersistedTierKeys.has(`${key}_8000`)
            || _idbPersistedTierKeys.has(`${key}_16000`)
        )) return true;
        if (_idbPersistedPdfKeys && _idbPersistedPdfKeys.has(key)) return true;
        if (_idbPersistedSourceKeys && _idbPersistedSourceKeys.has(key)) return true;
        if (_idbPersistedDrawingKeys && _idbPersistedDrawingKeys.has(key)) return true;
        return false;
    }

    /** 로컬 캐시는 없지만 Firestore·현장 보관함에 도면이 있을 수 있는 경우 */
    function collectKnownFloorCodesForBuilding(bldg) {
        const codes = new Set();
        if (!bldg || !bldg.id) return codes;
        (bldg.floorsList || []).forEach((f) => { if (f && f.floorCode) codes.add(f.floorCode); });
        (bldg.drawingFloorCodes || []).forEach((c) => { if (c) codes.add(c); });
        Object.keys(bldg.floorDrawings || {}).forEach((c) => codes.add(c));
        Object.keys(bldg.floorDrawingPdfs || {}).forEach((c) => codes.add(c));
        Object.keys(bldg.floorDrawingSources || {}).forEach((c) => codes.add(c));
        Object.keys(bldg.floorDrawingTiers || {}).forEach((c) => codes.add(c));
        const prefix = `${bldg.id}_`;
        // 2026-10-14: 층을 한 번 열기만 해도 defects[층] = [] 가 생겨 도면 없는 층이 계속 되살아났다 → 실제 항목이 있을 때만
        const takeNonEmpty = (map) => Object.keys(map || {}).forEach((k) => {
            if (k.startsWith(prefix) && floorMarkingValueHasContent(map[k])) codes.add(k.slice(prefix.length));
        });
        takeNonEmpty(window.state.defects);
        takeNonEmpty(window.state.ndtData);
        takeNonEmpty(window.state.ndtDisplacementGroups);
        takeNonEmpty(window.state.ndtImages);
        Object.keys(window.state.ndtDrawingRefs || {}).forEach((k) => {
            const ref = window.state.ndtDrawingRefs[k];
            if (k.startsWith(prefix) && ref && ref.id) codes.add(k.slice(prefix.length));
        });
        // 2026-10-14: 「지금 보는 층」은 층 증거가 아니다. 건물을 바꾼 직후 state.currentFloor는 이전 건물의 층이라
        // 도면을 넣은 적 없는 건물에 다른 건물의 층(예: 본관 지하 1층)이 생겨 저장·동기화됐다 → 넣지 않는다.
        Array.from(codes).forEach((fc) => {
            if (isDeletedDrawingFloor(bldg, fc)) codes.delete(fc);
        });
        codes.delete('ROUND_SKETCH_MEMO'); // 회차 손글씨 메모 자리는 층이 아님
        return codes;
    }

    function floorMarkingValueHasContent(v) {
        if (Array.isArray(v)) return v.length > 0;
        if (v && typeof v === 'object') return Object.keys(v).length > 0;
        return !!v;
    }

    /** 이 층 마킹·비파괴 수 — 도면 없는 층 정리 때 마킹 있는 층은 지우지 않는다 */
    function countFloorMarkings(bldgId, floorCode) {
        const key = `${bldgId}_${floorCode}`;
        const st = window.state || {};
        const n = (m) => (Array.isArray(m && m[key]) ? m[key].length : 0);
        return { defects: n(st.defects), ndt: n(st.ndtData) + n(st.ndtDisplacementGroups) };
    }
    window.countFloorMarkings = countFloorMarkings;

    function mergeDiscoveredFloorsIntoBuilding(bldg, floorCodes) {
        if (!bldg || !floorCodes || floorCodes.size === 0) return;
        if (!bldg.floorsList) bldg.floorsList = [];
        const existing = new Set(bldg.floorsList.map((f) => f.floorCode));
        floorCodes.forEach((fc) => {
            if (!fc || fc === 'ROUND_SKETCH_MEMO' || isDeletedDrawingFloor(bldg, fc) || existing.has(fc)) return;
            existing.add(fc);
            const fi = window.BSA && window.BSA.floorIdentity;
            bldg.floorsList.push({
                floorCode: fc,
                floorLabel: (fi && typeof fi.labelFromCode === 'function')
                    ? fi.labelFromCode(fc)
                    : window.getFloorLabelFromCode(fc)
            });
        });
        if (bldg.floorsOrderManual) return;
        if (window.BSA && window.BSA.floorIdentity && typeof window.BSA.floorIdentity.assembleFloors === 'function') {
            bldg.floorsList = window.BSA.floorIdentity.assembleFloors(bldg.floorsList, []);
            return;
        }
    }

    function floorMayExistOnCloud(bldg, floorCode) {
        if (!bldg || !floorCode || !db || !window.state.companyId) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        // 이 건물에 실제로 등록·발견된 층만 클라우드에 있을 수 있다고 본다.
        // (id만 있다고 true면 신규 빈 건물도 1F·현장보관함 도면을 조회해 엉뚱한 도면이 붙음)
        return collectKnownFloorCodesForBuilding(bldg).has(floorCode);
    }

    /** 층 목록에 있거나 서버에 있을 수 있으면 IDB·클라우드 조회 시도 */
    function shouldAttemptFloorDrawingLoad(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        if (floorHasDrawingData(bldg, floorCode) || floorMayHavePdfSource(bldg, floorCode)) return true;
        if ((bldg.floorsList || []).some((f) => f && f.floorCode === floorCode)) return true;
        if ((bldg.drawingFloorCodes || []).includes(floorCode)) return true;
        return floorMayExistOnCloud(bldg, floorCode);
    }

    function updateFloorDrawingEmptyOverlay(message) {
        const el = elements.mapDrawingEmpty || document.getElementById('mapDrawingEmpty');
        if (!el) return;
        const onMap = (state.currentTab === 'tab-map');
        const show = onMap && !!state.currentBuilding && !!state.currentFloor && !state.bgImage;
        if (!show) {
            el.style.display = 'none';
            return;
        }
        const msgEl = el.querySelector('.map-drawing-empty-msg');
        if (msgEl && message) msgEl.textContent = message;
        el.style.display = 'flex';
    }

    function showFloorDrawingEmptyState(floorCode, message) {
        if (state.currentFloor !== floorCode) return;
        cancelFloorDrawingBlend();
        state.bgImage = null;
        state.floorDrawingHiPatch = null;
        state.floorPlanRef = null;
        if (elements.zoomScaleText) elements.zoomScaleText.textContent = '—';
        resizeCanvas();
        drawCanvas();
        updateFloorDrawingEmptyOverlay(message || '이 층에 등록된 도면이 없습니다.');
    }

    /** PDF 원본이 있거나 곧 IDB/소스에서 복원될 가능성 (모바일 초기 로드 포함) */
    function floorMayHavePdfSource(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        if (floorHasPdfSourceSync(bldg, floorCode)) return true;
        const src = bldg.floorDrawingSources && bldg.floorDrawingSources[floorCode];
        if (src && typeof window.isPdfDrawingDataUrl === 'function' && window.isPdfDrawingDataUrl(src)) {
            return true;
        }
        const key = `${bldg.id}_${floorCode}`;
        if (_idbPersistedSourceKeys && _idbPersistedSourceKeys.has(key)) return true;
        if (_idbPersistedPdfKeys && _idbPersistedPdfKeys.has(key)) return true;
        return false;
    }

    function shouldUseViewportTilesForCurrentFloor() {
        // 티어 LOD(4000/8000/16000)만 사용 — 뷰포트 패치는 확대마다 영역 재렌더·선 얇아짐 유발
        return false;
    }

    function forceViewportPatchLevel(zoomDemand, maxLevel, zoomVsFit, picked) {
        let level = picked || 0;
        if (zoomVsFit >= 1.08 && level <= 0) level = 1;
        if (zoomVsFit >= 2.2 && level < 2) level = Math.min(2, maxLevel);
        if (zoomVsFit >= 5 && level < 3) level = Math.min(3, maxLevel);
        if (zoomVsFit >= 12 && level < maxLevel) level = maxLevel;
        if (zoomDemand >= 6 && level < 2) level = Math.min(2, maxLevel);
        if (zoomDemand >= 14 && level < maxLevel) level = maxLevel;
        return level;
    }

    function isMobileMapViewport() {
        if (layoutIsPcLike()) return false;
        const cw = state.canvasCssW || 0;
        const ch = state.canvasCssH || 0;
        return Math.min(cw, ch) <= 520 || layoutIsMobileWidth();
    }

    /** 폰·소형 현장앱만 모바일 LOD·미리보기 — 태블릿은 PC(1200% 초고해상도) */
    function isMobileDrawingContext() {
        if (layoutIsPcLike()) return false;
        return isMobileMapViewport()
            || (typeof isNativeAndroidApp === 'function' && isNativeAndroidApp());
    }

    function canvasCssToImgCoords(cx, cy) {
        const vx = (cx - state.view.offsetX) / state.view.scale;
        const vy = (cy - state.view.offsetY) / state.view.scale;
        return viewToImgCoords(vx, vy);
    }

    function getVisibleImageRect() {
        const cw = state.canvasCssW || 800;
        const ch = state.canvasCssH || 600;
        const corners = [
            canvasCssToImgCoords(0, 0),
            canvasCssToImgCoords(cw, 0),
            canvasCssToImgCoords(0, ch),
            canvasCssToImgCoords(cw, ch),
        ];
        const dims = (typeof window.getFloorPlanRefDimensions === 'function')
            ? window.getFloorPlanRefDimensions(state.currentBuilding, state.currentFloor)
            : { w: state.bgImage?.naturalWidth || 1, h: state.bgImage?.naturalHeight || 1 };
        const pad = 48;
        let x1 = Math.min(...corners.map((c) => c.x));
        let y1 = Math.min(...corners.map((c) => c.y));
        let x2 = Math.max(...corners.map((c) => c.x));
        let y2 = Math.max(...corners.map((c) => c.y));
        x1 = Math.max(0, x1 - pad);
        y1 = Math.max(0, y1 - pad);
        x2 = Math.min(dims.w, x2 + pad);
        y2 = Math.min(dims.h, y2 + pad);
        return {
            x: x1,
            y: y1,
            w: Math.max(1, x2 - x1),
            h: Math.max(1, y2 - y1),
        };
    }

    function scheduleViewportHiPatchSync() {
        if (!shouldUseViewportTilesForCurrentFloor()) return;
        if (viewportHiPatchTimer) clearTimeout(viewportHiPatchTimer);
        viewportHiPatchTimer = setTimeout(() => {
            viewportHiPatchTimer = null;
            syncViewportHiPatch();
        }, 180);
    }

    function flushViewportHiPatchSync() {
        if (!shouldUseViewportTilesForCurrentFloor()) return;
        if (viewportHiPatchTimer) {
            clearTimeout(viewportHiPatchTimer);
            viewportHiPatchTimer = null;
        }
        syncViewportHiPatch();
    }

    async function syncViewportHiPatch() {
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        if (!bldg || !fc || (state.currentTab !== 'tab-map') || !state.bgImage) return;

        const token = ++viewportHiPatchToken;
        viewportHiPatchInFlight = token;
        try {
        const region = getVisibleImageRect();
        let ref = (typeof window.getFloorPlanRefDimensions === 'function')
            ? window.getFloorPlanRefDimensions(bldg, fc)
            : { w: region.w, h: region.h };

        const cw = state.canvasCssW || 800;
        const ch = state.canvasCssH || 600;
        const dpr = state.canvasDpr || 1;
        const scale = Math.max(state.view.scale || 1, 0.05);
        const screenLong = Math.max(cw, ch) * dpr;
        const regionLong = Math.max(region.w, region.h, 1);
        const zoomDemand = getViewportZoomDemand();
        const refLong = Math.max(ref.w || 4000, ref.h || 4000, 4000);
        const maxSteps = getViewportPatchStepCount(refLong);
        const fitScale = getMapFitScale();
        const zoomVsFit = scale / Math.max(fitScale, 0.05);
        let wantLevel = pickViewportPatchLevel(zoomDemand, maxSteps, viewportPatchActiveLevel);
        wantLevel = forceViewportPatchLevel(zoomDemand, maxSteps, zoomVsFit, wantLevel);

        const refArea = Math.max((ref.w || 1) * (ref.h || 1), 1);
        const regionArea = region.w * region.h;
        if (zoomVsFit < 1.12 && regionArea > refArea * 0.85) {
            viewportPatchActiveLevel = 0;
            lastViewportPatchMeta = null;
            if (state.floorDrawingHiPatch || (_floorBlend && _floorBlend.toPatch)) {
                applyFloorDrawingTarget(undefined, null, { immediate: true });
            }
            return;
        }

        if (wantLevel <= 0) {
            viewportPatchActiveLevel = 0;
            lastViewportPatchMeta = null;
            if (state.floorDrawingHiPatch || (_floorBlend && _floorBlend.toPatch)) {
                applyFloorDrawingTarget(undefined, null, { immediate: true });
            }
            return;
        }

        const sameLevel = wantLevel === viewportPatchActiveLevel;
        const regionMoved = shouldUpdateViewportPatchRegion(region, lastViewportPatchMeta);
        if (sameLevel && !regionMoved && hasActiveFloorHiPatch()) {
            return;
        }

        let pdfUrl = (typeof window.getFloorPdfDataUrl === 'function')
            ? window.getFloorPdfDataUrl(bldg, fc)
            : null;
        if (!pdfUrl) {
            viewportPatchActiveLevel = 0;
            lastViewportPatchMeta = null;
            if (state.floorDrawingHiPatch || (_floorBlend && _floorBlend.toPatch)) {
                applyFloorDrawingTarget(undefined, null, { immediate: true });
            }
            return;
        }
        if (token !== viewportHiPatchToken) return;
        if (state.currentFloor !== fc || state.currentBuildingId !== bldg.id) return;

        await ensureFloorPlanRefForPdf(bldg, fc);
        if (token !== viewportHiPatchToken) return;
        ref = (typeof window.getFloorPlanRefDimensions === 'function')
            ? window.getFloorPlanRefDimensions(bldg, fc)
            : ref;

        const mobile = isMobileMapViewport();
        const maxPatchLong = getViewportPatchPixelBudget(mobile);
        const maxPatchSide = getViewportPatchMaxSide(mobile);
        const minPatchLong = 512;
        const screenNeedLong = Math.ceil(Math.max(region.w, region.h, 1) * scale * dpr * 1.18);
        const zoomMargin = mobile ? 1.24 : 1.1;
        const demandLong = Math.ceil(regionLong * Math.max(zoomDemand, getViewportPatchLevelMultiplier(wantLevel)) * zoomMargin);
        let outLong = Math.min(maxPatchLong, Math.max(minPatchLong, screenNeedLong, demandLong));

        const aspect = region.w / region.h;
        const patchDimsFromLong = (longSide) => {
            let w;
            let h;
            if (aspect >= 1) {
                w = longSide;
                h = Math.max(1, Math.round(longSide / aspect));
            } else {
                w = Math.max(1, Math.round(longSide * aspect));
                h = longSide;
            }
            return clampPatchOutputDims(w, h, maxPatchLong, maxPatchSide);
        };
        let { w: outW, h: outH } = patchDimsFromLong(outLong);
        outLong = Math.max(outW, outH);

        if (typeof window.renderPdfDataUrlRegion !== 'function') return;

        const applyPatch = (canvas) => {
            if (!canvas || token !== viewportHiPatchToken) return false;
            if (state.currentFloor !== fc || state.currentBuildingId !== bldg.id) return false;
            if (!isViewportPatchCanvasUsable(canvas)) return false;
            applyFloorDrawingTarget(undefined, {
                canvas,
                x: region.x,
                y: region.y,
                w: region.w,
                h: region.h,
            }, { immediate: mobile });
            viewportPatchActiveLevel = wantLevel;
            lastViewportPatchMeta = {
                level: wantLevel,
                cx: region.x + region.w / 2,
                cy: region.y + region.h / 2,
            };
            return true;
        };

        const pdfCacheKey = `${bldg.id}_${fc}`;
        const renderAtLong = async (longSide) => {
            const dims = patchDimsFromLong(longSide);
            return window.renderPdfDataUrlRegion(pdfUrl, ref.w, ref.h, region, dims.w, dims.h, pdfCacheKey);
        };

        try {
            const canvas = await renderAtLong(outLong);
            if (applyPatch(canvas)) return;
            if (token !== viewportHiPatchToken) return;
            if (!canvas) throw new Error('뷰포트 패치 캔버스 생성 실패');
        } catch (e) {
            console.warn('뷰포트 고해상도 패치 실패:', e);
            const fallbacks = mobile
                ? [8000, 6000, 4096, 3072, 2048]
                : [6000, 4096, 3072];
            for (let fi = 0; fi < fallbacks.length; fi++) {
                const cap = fallbacks[fi];
                if (cap >= outLong) continue;
                if (token !== viewportHiPatchToken) return;
                try {
                    const canvas = await renderAtLong(cap);
                    if (applyPatch(canvas)) return;
                    return;
                } catch (e2) {
                    if (fi === fallbacks.length - 1) {
                        console.warn('뷰포트 고해상도 패치(축소) 실패:', e2);
                    }
                }
            }
        }
        } finally {
            if (viewportHiPatchInFlight === token) viewportHiPatchInFlight = 0;
        }
    }

    function notifyIndexedDbSaveFailure() {
        if (_idbSaveFailedNotified) return;
        _idbSaveFailedNotified = true;
        if (typeof window.showToast === 'function') {
            window.showToast('사진/도면을 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.', 'error', 6000);
        }
    }

    // 결함 사진은 편집 시 배열 전체가 통째로 교체되는데(같은 인덱스라도 실제 사진이
    // 바뀔 수 있음), "이미 저장했다"는 기록을 그대로 두면 바뀐 사진이 IndexedDB에
    // 다시 안 쓰여서 예전 사진이 그대로 남는다. 편집 직전에 이 결함의 기록을 지워서
    // 새 사진들이 다시 저장되게 한다.
    function invalidatePersistedPhotoCacheForDefect(defectId) {
        if (!defectId) return;
        const prefix = `${defectId}_`;
        const bump = (k) => {
            _idbPersistedPhotoKeys.delete(k);
            _idbPhotoWriteGen.set(k, (_idbPhotoWriteGen.get(k) || 0) + 1);
        };
        Array.from(_idbPersistedPhotoKeys).forEach((k) => {
            if (k.startsWith(prefix)) bump(k);
        });
        Array.from(_idbPendingPhotoKeys).forEach((k) => {
            if (k.startsWith(prefix)) bump(k);
        });
    }

    function isPersistableImageUrl(url) {
        return typeof url === 'string' && url.length > 32 && !url.startsWith('blob:');
    }

    // 같은 키에 이전 쓰기가 끝나기 전에 새 사진이 오면, 세대(generation)로 옛 결과가
    // 새 사진을 덮어쓰지 않게 한다. pending 중이라고 건너뛰면 모바일에서 새로고침 시
    // 최신 사진이 IndexedDB에 안 남는 경우가 있었다.
    function persistPhotoUrlToIdb(key, url) {
        if (!key || !isPersistableImageUrl(url)) return Promise.resolve(false);
        const gen = (_idbPhotoWriteGen.get(key) || 0) + 1;
        _idbPhotoWriteGen.set(key, gen);
        _idbPendingPhotoKeys.add(key);
        return idbSetPhotoPreferDataUrl(key, url).then((ok) => {
            if (_idbPhotoWriteGen.get(key) !== gen) return false;
            _idbPendingPhotoKeys.delete(key);
            if (ok) {
                _idbPersistedPhotoKeys.add(key);
                _idbSaveFailedNotified = false;
                if (!window._photoCache) window._photoCache = {};
                // dataURL이면 캐시도 data 유지. https면 표시용으로만 캐시(IDB data는 보존).
                if (typeof url === 'string' && url.indexOf('data:') === 0) {
                    window._photoCache[key] = url;
                } else if (!window._photoCache[key] || String(window._photoCache[key]).indexOf('data:') !== 0) {
                    window._photoCache[key] = url;
                }
                return true;
            }
            notifyIndexedDbSaveFailure();
            return false;
        });
    }

    async function persistDefectPhotosNow(defect) {
        if (!defect || !defect.id) return;
        const jobs = [];
        (Array.isArray(defect.photos) ? defect.photos : []).forEach((url, i) => {
            if (!url) return;
            jobs.push(persistPhotoUrlToIdb(defectPhotoIdAt(defect, i), url));
        });
        (Array.isArray(defect.prevRoundPhotos) ? defect.prevRoundPhotos : []).forEach((url, i) => {
            if (!url) return;
            jobs.push(persistPhotoUrlToIdb(defectPhotoIdAt(defect, i, 'prev'), url));
        });
        if (jobs.length) await Promise.all(jobs);
    }

    async function persistOpenDefectPhotosNow() {
        try {
            if (window._defectFormHydrating) return;
            if (typeof isDefectModalOpen === 'function' && !isDefectModalOpen()) return;
            if (!state.currentBuildingId) return;
            const pinId = document.getElementById('defectPinId')?.value;
            if (!pinId) {
                if (typeof commitDefectFromForm === 'function') {
                    await commitDefectFromForm({
                        pushHistory: !window._defectEditSessionHistoryPushed,
                        uploadPhotos: false
                    });
                    window._defectEditSessionHistoryPushed = true;
                }
                return;
            }
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            const d = (state.defects[key] || []).find((x) => x.id === pinId);
            if (!d) return;
            const photosVal = Array.isArray(window._pendingPhotos) ? window._pendingPhotos.filter(Boolean) : [];
            const prevVal = Array.isArray(window._pendingPrevRoundPhotos)
                ? window._pendingPrevRoundPhotos.filter(Boolean)
                : [];
            const before = captureDefectPhotoIdsBefore(d);
            invalidatePersistedPhotoCacheForDefect(d.id);
            d.photos = photosVal.slice();
            d.prevRoundPhotos = prevVal.slice();
            syncDefectPhotoRefs(d, d.photos, d.prevRoundPhotos, before);
            applyPendingRepairPhotoToDefect(d);
            // 사용자가 사진을 바꿨다 — 병합이 이 목록을 통째로 따르게 시각을 찍는다(합집합이면 지운 사진이 돌아옴)
            stampDefectPhotosChangedIfSafe(d);
            if (typeof touchDefectUpdatedAt === 'function') touchDefectUpdatedAt(d);
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            await persistDefectPhotosNow(d);
            await pruneRemovedDefectPhotos(before.cur.visibleIds, d.photoIds);
            await pruneRemovedDefectPhotos(before.prev.visibleIds, d.prevRoundPhotoIds);
        } catch (e) {
            console.warn('사진 즉시 저장 실패:', e);
        }
    }

    async function flushLocalPhotoPersistBeforeUnload() {
        try {
            if (window._defectAutoApplyTimer) {
                window.clearTimeout(window._defectAutoApplyTimer);
                window._defectAutoApplyTimer = null;
            }
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen()
                && typeof commitDefectFromForm === 'function') {
                await commitDefectFromForm({ pushHistory: false, uploadPhotos: false });
            } else {
                await persistOpenDefectPhotosNow();
            }
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        } catch (e) {
            console.warn('새로고침 전 사진 저장 실패:', e);
        }
    }
    window.flushLocalPhotoPersistBeforeUnload = flushLocalPhotoPersistBeforeUnload;

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return;
        if (window._defectPhotosDirty || window._defectAutoApplyTimer) {
            void flushLocalPhotoPersistBeforeUnload();
        }
    });
    window.addEventListener('pagehide', () => {
        try {
            if (typeof flushDefectAutoApply === 'function') flushDefectAutoApply();
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        } catch (_e) { /* ignore */ }
    });

    // 도면/사진처럼 무거운 base64 이미지는 localStorage가 아니라 IndexedDB에 저장한다.
    // (localStorage는 5~10MB로 작아서 이미지를 계속 쌓으면 금방 꽉 차지만, IndexedDB는
    // 훨씬 여유롭다.) 새로 생긴 이미지만 골라서 저장하므로 매 호출마다 부담이 크지 않다.
    function persistLocalImagesToIndexedDb(buildings, defectsMap) {
        (buildings || []).forEach(b => {
            const drawings = b.floorDrawings || {};
            Object.entries(drawings).forEach(([floorCode, dataUrl]) => {
                if (!dataUrl) return;
                if (isDeletedDrawingFloor(b, floorCode)) return;
                const key = `${b.id}_${floorCode}`;
                if (isSessionDeletedDrawingKey(key)) return;
                if (_idbPersistedDrawingKeys.has(key) || _idbPendingDrawingKeys.has(key)) return;
                _idbPendingDrawingKeys.add(key);
                idbSet('floorDrawings', key, dataUrl).then(ok => {
                    _idbPendingDrawingKeys.delete(key);
                    if (isDeletedDrawingFloor(b, floorCode) || isSessionDeletedDrawingKey(key)) {
                        idbDelete('floorDrawings', key);
                        return;
                    }
                    if (ok) {
                        _idbPersistedDrawingKeys.add(key);
                        _idbSaveFailedNotified = false;
                    } else {
                        notifyIndexedDbSaveFailure();
                    }
                });
            });

            const tierMaps = b.floorDrawingTiers || {};
            Object.entries(tierMaps).forEach(([floorCode, tiersObj]) => {
                if (!tiersObj || typeof tiersObj !== 'object') return;
                if (isDeletedDrawingFloor(b, floorCode)) return;
                Object.entries(tiersObj).forEach(([dim, url]) => {
                    if (typeof url !== 'string' || url.length < 32) return;
                    const key = floorDrawingTierIdbKey(b.id, floorCode, dim);
                    if (_idbPersistedTierKeys.has(key) || _idbPendingTierKeys.has(key)) return;
                    _idbPendingTierKeys.add(key);
                    idbSet('floorDrawingTiers', key, url).then(ok => {
                        _idbPendingTierKeys.delete(key);
                        if (isDeletedDrawingFloor(b, floorCode) || isSessionDeletedDrawingKey(`${b.id}_${floorCode}`)) {
                            idbDelete('floorDrawingTiers', key);
                            return;
                        }
                        if (ok) {
                            _idbPersistedTierKeys.add(key);
                            _idbSaveFailedNotified = false;
                        } else {
                            notifyIndexedDbSaveFailure();
                        }
                    });
                });
            });

            const sourceMaps = b.floorDrawingSources || {};
            Object.entries(sourceMaps).forEach(([floorCode, sourceUrl]) => {
                if (!sourceUrl) return;
                if (isDeletedDrawingFloor(b, floorCode)) return;
                const key = `${b.id}_${floorCode}`;
                if (isSessionDeletedDrawingKey(key)) return;
                if (_idbPersistedSourceKeys.has(key) || _idbPendingSourceKeys.has(key)) return;
                _idbPendingSourceKeys.add(key);
                idbSet('floorDrawingSources', key, sourceUrl).then(ok => {
                    _idbPendingSourceKeys.delete(key);
                    if (isDeletedDrawingFloor(b, floorCode) || isSessionDeletedDrawingKey(key)) {
                        idbDelete('floorDrawingSources', key);
                        return;
                    }
                    if (ok) {
                        _idbPersistedSourceKeys.add(key);
                        _idbSaveFailedNotified = false;
                    } else {
                        notifyIndexedDbSaveFailure();
                    }
                });
            });

            // PDF 원본도 IndexedDB에 보관 (새로고침 후에도 벡터 출력 가능)
            const pdfs = b.floorDrawingPdfs || {};
            Object.entries(pdfs).forEach(([floorCode, pdfDataUrl]) => {
                if (!pdfDataUrl) return;
                if (isDeletedDrawingFloor(b, floorCode)) return;
                const key = `${b.id}_${floorCode}`;
                if (isSessionDeletedDrawingKey(key)) return;
                if (_idbPersistedPdfKeys.has(key) || _idbPendingPdfKeys.has(key)) return;
                _idbPendingPdfKeys.add(key);
                idbSet('floorDrawingPdfs', key, pdfDataUrl).then(ok => {
                    _idbPendingPdfKeys.delete(key);
                    if (isDeletedDrawingFloor(b, floorCode) || isSessionDeletedDrawingKey(key)) {
                        idbDelete('floorDrawingPdfs', key);
                        return;
                    }
                    if (ok) {
                        _idbPersistedPdfKeys.add(key);
                        _idbSaveFailedNotified = false;
                    } else {
                        notifyIndexedDbSaveFailure();
                    }
                });
            });
        });
        Object.values(defectsMap || {}).forEach(arr => {
            (arr || []).forEach(d => {
                if (d.photos && d.photos.length > 0) {
                    d.photos.forEach((url, i) => {
                        if (!url) return;
                        const key = defectPhotoIdAt(d, i);
                        if (_idbPersistedPhotoKeys.has(key)) return;
                        persistPhotoUrlToIdb(key, url);
                    });
                }
                if (d.prevRoundPhotos && d.prevRoundPhotos.length > 0) {
                    d.prevRoundPhotos.forEach((url, i) => {
                        if (!url) return;
                        const key = defectPhotoIdAt(d, i, 'prev');
                        if (_idbPersistedPhotoKeys.has(key)) return;
                        persistPhotoUrlToIdb(key, url);
                    });
                }
            });
        });
        (buildings || []).forEach((b) => {
            if (!b || !b.id || !Array.isArray(b.overviewPhotos)) return;
            b.overviewPhotos.forEach((p) => {
                if (!p || !p.id || !p.dataUrl) return;
                const key = getOverviewPhotoDocId(b.id, p.id);
                if (_idbPersistedPhotoKeys.has(key)) return;
                persistPhotoUrlToIdb(key, p.dataUrl);
            });
        });
        (buildings || []).forEach((b) => {
            if (!b || !b.id || !Array.isArray(b.prevSummaryImages) || !window.BSA || !window.BSA.prevSummary) return;
            b.prevSummaryImages.forEach((p) => {
                if (!p || !p.id || !p.dataUrl) return;
                const key = window.BSA.prevSummary.docId(b.id, p.id);
                if (_idbPersistedPhotoKeys.has(key)) return;
                persistPhotoUrlToIdb(key, p.dataUrl);
            });
        });
    }

    // ── 기기 저장 공간 가득 참 처리(2026-10-20) ─────────────────────────────
    const _idbStateFallbackKeys = new Set();
    let _quotaSavePending = null;   // { key, json } — 가장 최근 것만
    let _quotaSaveRunning = false;
    function localBackupIo() {
        return {
            put: (k, v) => localBackupPut(k, v),
            get: (k) => localBackupGet(k),
            del: (k) => localBackupDelete(k)
        };
    }
    function dropIdbStateFallback(key) {
        _idbStateFallbackKeys.delete(key);
        localBackupIo().del('state:' + key).catch(() => {});
    }
    function queueQuotaStateSave(key, json) {
        _quotaSavePending = { key, json };
        if (_quotaSaveRunning) return;
        _quotaSaveRunning = true;
        (async () => {
            while (_quotaSavePending) {
                const job = _quotaSavePending;
                _quotaSavePending = null;
                let ok = false;
                try { ok = await saveStateUnderQuota(job.key, job.json); } catch (e) { console.warn('[저장 공간] 처리 실패:', e); }
                if (!ok) notifyLocalSaveFailed(true);
            }
        })().finally(() => { _quotaSaveRunning = false; });
    }
    /** true = 기기(localStorage 또는 IndexedDB 예비)에 확실히 남김 */
    async function saveStateUnderQuota(key, json) {
        const LQ = window.BSA.lsQuota;
        const io = localBackupIo();
        const r = await LQ.setWithRetry(localStorage, key, json, io, { currentStateKey: key });
        if (r.freed && (r.freed.moved.length || r.freed.removed.length)) {
            console.info('[저장 공간] 정리:', r.freed);
        }
        if (r.ok) { if (_idbStateFallbackKeys.has(key)) dropIdbStateFallback(key); return true; }
        // localStorage에 못 쓰면 IndexedDB 예비 저장본(쓰고 → 다시 읽어 확인)
        const entry = { raw: json, savedAt: LQ.savedAtOf(json) || Date.now(), storageKey: key };
        await io.put('state:' + key, entry);
        const back = await io.get('state:' + key);
        if (!back || back.raw !== json) return false;
        _idbStateFallbackKeys.add(key);
        // 확인된 예비 저장본이 있으니 기기의 옛 저장본은 비워 자리를 만들고 한 번 더(되면 예비본 정리)
        try {
            localStorage.removeItem(key);
            localStorage.setItem(key, json);
            dropIdbStateFallback(key);
        } catch (_e) { /* 예비 저장본으로 계속 — 다시 열 때 거기서 읽는다 */ }
        console.info('[저장 공간] 기기 저장본을 IndexedDB 예비 저장소에 남겼습니다:', key, Math.round(json.length / 1024) + 'K자');
        return true;
    }
    function notifyLocalSaveFailed(isQuotaError) {
        const nowMs = Date.now();
        if (_localStorageSaveFailedNotified && (nowMs - (_localStorageSaveFailedAt || 0)) <= 120000) return;
        _localStorageSaveFailedNotified = true;
        _localStorageSaveFailedAt = nowMs;
        const cloudQueued = !!(db && window.state.companyId && navigator.onLine !== false);
        if (!_suppressSyncOnSave && typeof scheduleSyncToFirebase === 'function') {
            try { scheduleSyncToFirebase(); } catch (_e) { /* ignore */ }
        }
        const tail = cloudQueued
            ? ' 변경사항은 서버에 올리는 중입니다 — 동기화가 끝나기 전에 새로고침하거나 앱을 닫지 마세요.'
            : ' 지금 오프라인이라 서버에도 못 올렸습니다 — 인터넷에 연결될 때까지 새로고침하거나 앱을 닫지 마세요.';
        try { console.info(window.bsaStorageReport ? window.bsaStorageReport(true) : ''); } catch (_e) { /* ignore */ }
        window.showToast(
            (isQuotaError ? '이 기기 저장 공간이 가득 차서 기기에는 저장하지 못했습니다.' : '변경사항을 기기에 저장하지 못했습니다.') + tail,
            'error', 10000
        );
    }
    /** 콘솔 진단: bsaStorageReport() — 기기 저장 공간을 많이 쓰는 키 */
    window.bsaStorageReport = function (asText) {
        const LQ = window.BSA && window.BSA.lsQuota;
        if (!LQ) return null;
        const rep = LQ.report(localStorage);
        const text = LQ.formatReport(rep, 25);
        if (!asText) { console.log(text); try { console.table(rep.rows.slice(0, 25).map((r) => ({ key: r.key, 'K자': +(r.chars / 1024).toFixed(1) }))); } catch (_e) { /* ignore */ } }
        return asText ? text : rep;
    };
    /** 콘솔/설정: 큰 데이터를 IndexedDB로 옮겨 자리 만들기 */
    window.bsaFreeLocalStorage = async function () {
        const LQ = window.BSA && window.BSA.lsQuota;
        if (!LQ) return null;
        const r = await LQ.freeSpace(localStorage, localBackupIo(), { currentStateKey: getLocalStorageStateKey(window.state.companyId) });
        console.info('[저장 공간] 정리 결과:', r);
        return r;
    };
    if (typeof window.saveStateToLocalStorage !== 'function') window.saveStateToLocalStorage = saveStateToLocalStorage;

    function saveStateToLocalStorage() {
        try {
            if ((state.currentTab === 'tab-map') && typeof captureFloorSnapshotNow === 'function') {
                captureFloorSnapshotNow();
            }
            const rawBuildings = window.state.buildings || [];
            const rawDefects = window.state.defects || {};

            // 현재 점검 중이면 접근 시각 갱신 → 오프라인 장시간 작업도 24시간 TTL에 안 걸림
            if (window.state.currentBuildingId && typeof touchBuildingAccess === 'function') {
                touchBuildingAccess(window.state.currentBuildingId);
            }

            // 무거운 이미지(도면/사진)는 IndexedDB로 옮겨서 저장하고,
            // localStorage에는 가벼운 참조(photoIds)와 텍스트 데이터만 남긴다.
            persistLocalImagesToIndexedDb(rawBuildings, rawDefects);

            const sanitizedBuildings = rawBuildings.map(b => {
                const { floorDrawings, floorDrawingPdfs, floorDrawingTiers, floorDrawingSources, ...rest } = b;
                if (Array.isArray(rest.overviewPhotos)) {
                    rest.overviewPhotos = rest.overviewPhotos.map((p) => ({
                        id: p.id,
                        caption: (p && p.caption != null) ? String(p.caption) : ''
                    })).filter((p) => p.id);
                }
                // 전차 종합결론 그림 본문은 IndexedDB·클라우드에만(목록에는 ID·이름만)
                if (Array.isArray(rest.prevSummaryImages) && window.BSA && window.BSA.prevSummary) {
                    rest.prevSummaryImages = window.BSA.prevSummary.sanitize(rest.prevSummaryImages);
                }
                return rest;
            });
            // 균열게이지·팁 비교사진: IndexedDB에 확인된 것만 빼고, 남은 data URL은 저장 뒤 옮긴다
            const gaugeSaveStats = { stripped: 0, inlineLeft: 0 };
            const sanitizedNdt = {};
            Object.entries(window.state.ndtData || {}).forEach(([key, arr]) => {
                sanitizedNdt[key] = Array.isArray(arr) ? arr.map((it) => gaugeStripForLocal(it, gaugeSaveStats)) : arr;
            });
            const sanitizedDefects = {};
            Object.entries(rawDefects).forEach(([key, arr]) => {
                sanitizedDefects[key] = (arr || []).map(d => {
                    const { photos, prevRoundPhotos, photoIds, prevRoundPhotoIds, ...rest } = d;
                    const out = { ...rest };
                    const curIds = (photos && photos.length > 0)
                        ? photos.map((_, i) => defectPhotoIdAt(d, i))
                        : (photoIds && photoIds.length ? photoIds.slice() : null);
                    const prevIds = (prevRoundPhotos && prevRoundPhotos.length > 0)
                        ? prevRoundPhotos.map((_, i) => defectPhotoIdAt(d, i, 'prev'))
                        : (prevRoundPhotoIds && prevRoundPhotoIds.length ? prevRoundPhotoIds.slice() : null);
                    if (curIds && curIds.length) out.photoIds = curIds;
                    if (prevIds && prevIds.length) out.prevRoundPhotoIds = prevIds;
                    return gaugeStripForLocal(out, gaugeSaveStats);
                });
            });

            const dataToSave = {
                // 저장 시각(맨 앞) — IndexedDB 예비 저장본과 어느 쪽이 새 것인지 비교한다(2026-10-20)
                __savedAt: Date.now(),
                defects: sanitizedDefects,
                ndtData: sanitizedNdt,
                ndtDisplacementGroups: window.state.ndtDisplacementGroups || {},
                // 층별 NDT 전용 도면 참조 { id, at } — 그림 자체는 사진처럼 IndexedDB·클라우드에 있다
                ndtDrawingRefs: window.state.ndtDrawingRefs || {},
                deletedDefectIds: window.state.deletedDefectIds || {},
                deletedDefectAt: window.state.deletedDefectAt || {},
                confirmedDeletedIds: window.state.confirmedDeletedIds || {},
                deletedNdtIds: window.state.deletedNdtIds || {},
                deletedNdtAt: window.state.deletedNdtAt || {},
                // 도면 메모(결함 아님) + 지운 메모 묘비
                drawingMemos: window.state.drawingMemos || {},
                deletedMemoIds: window.state.deletedMemoIds || {},
                deletedMemoAt: window.state.deletedMemoAt || {},
                sketchMemos: window.state.sketchMemos || {},
                deletedSketchIds: window.state.deletedSketchIds || {},
                deletedSketchAt: window.state.deletedSketchAt || {},
                guideShapes: window.state.guideShapes || {},
                deletedGuideShapeIds: window.state.deletedGuideShapeIds || {},
                deletedGuideShapeAt: window.state.deletedGuideShapeAt || {},
                structMembers: window.state.structMembers || {},
                deletedStructMemberIds: window.state.deletedStructMemberIds || {},
                deletedStructMemberAt: window.state.deletedStructMemberAt || {},
                structOverlays: window.state.structOverlays || {},
                deletedBuildingIds: window.state.deletedBuildingIds || [],
                buildings: sanitizedBuildings,
                lastUsedBuildingId: window.state.currentBuildingId || null,
                customDefectTypes: window.state.customDefectTypes || {},
                customDefectCauses: window.state.customDefectCauses || {},
                customDefectComponents: window.state.customDefectComponents || [],
                hiddenDefectComponents: window.state.hiddenDefectComponents || [],
                hiddenDefectTypes: window.state.hiddenDefectTypes || {},
                hiddenDefectCauses: window.state.hiddenDefectCauses || {},
                defectComponentOrder: window.state.defectComponentOrder || {},
                defectTypeOrder: window.state.defectTypeOrder || {},
                defectCauseOrder: window.state.defectCauseOrder || {},
                favoriteDefectComponents: window.state.favoriteDefectComponents || {},
                favoriteDefectTypes: window.state.favoriteDefectTypes || {},
                favoriteDefectCauses: window.state.favoriteDefectCauses || {},
                defectPickUsage: window.state.defectPickUsage || {},
                defectCauseAutoCheck: window.state.defectCauseAutoCheck !== false,
                styleColors: window.state.styleColors || null,
            styleColorsPaletteVersion: window.state.styleColorsPaletteVersion || 0,
                styleSizes: window.state.styleSizes || null,
                defectLeaderLineScale: (window.state.defectLeaderLineScale !== undefined ? window.state.defectLeaderLineScale : 1.0),
                ndtLeaderLineScale: (window.state.ndtLeaderLineScale !== undefined ? window.state.ndtLeaderLineScale : 1.0),
                styleSizeBarLockedMap: window.state.styleSizeBarLockedMap !== false,
                styleSizeBarLockedNdt: window.state.styleSizeBarLockedNdt !== false,
                floorMapStyleSettings: window.state.floorMapStyleSettings || null,
                floorDrawingRotations: window.state.floorDrawingRotations || null,
                floorGridLines: window.state.floorGridLines || null,
                floorPrintCrops: window.state.floorPrintCrops || null,
                floorDrawingDarken: window.state.floorDrawingDarken || null,
                styleShapes: window.state.styleShapes || null,
                surveyColumns: window.state.surveyColumns || null,
                surveyColumnsGrade3: window.state.surveyColumnsGrade3 || null,
                locationMapLegend: window.state.locationMapLegend || null,
                locationMapLegendBox: window.state.locationMapLegendBox || null,
                defectSizeMode: window.state.defectSizeMode || 'combined',
                // 2026-10-19 지시선 끝 기본 = 동그라미. 직접 고른 기기만 tipShapeChosen 으로 그 값을 지킨다
            tipShape: window.state.tipShape || 'circle',
            tipShapeChosen: !!window.state.tipShapeChosen,
                areaFillStyle: window.state.areaFillStyle || 'solid',
                areaBorderStyle: window.state.areaBorderStyle || 'solid',
                snapToCad: window.state.snapToCad !== false
            };
            const stateKeyForSave = getLocalStorageStateKey(window.state.companyId);
            const stateJson = JSON.stringify(dataToSave);
            try {
                localStorage.setItem(stateKeyForSave, stateJson);
                if (_idbStateFallbackKeys.has(stateKeyForSave)) dropIdbStateFallback(stateKeyForSave);
            } catch (lsErr) {
                const LQ = window.BSA && window.BSA.lsQuota;
                if (!LQ || !LQ.isQuotaError(lsErr)) throw lsErr;
                // 2026-10-20 가득 참: 바로 오류를 띄우지 않고 공간을 만든 뒤 다시 쓰고, 그래도 안 되면
                // IndexedDB 예비 저장본에 쓴다(다시 읽어 확인). 둘 다 실패할 때만 알린다.
                queueQuotaStateSave(stateKeyForSave, stateJson);
            }
            if (window.state.companyId) {
                try { localStorage.setItem('bsa_last_active_company_id', window.state.companyId); } catch (_e) { /* ignore */ }
            }
            try { if (typeof recordLastLocation === 'function') recordLastLocation(); } catch (_e) { /* ignore */ }
            // 2026-10-19 회사 공통 설정: 이 기기에서 바뀐 칸만 「올릴 칸」으로(js/core/company-settings-merge.js)
            try { if (typeof trackCompanySettingsLocal === 'function') trackCompanySettingsLocal(); } catch (_e) { /* ignore */ }
            _localStorageSaveFailedNotified = false;
            if (gaugeSaveStats.inlineLeft > 0 && typeof scheduleGaugePhotoMigrate === 'function') scheduleGaugePhotoMigrate();
            if (window.state.uid) persistUserDefectPinPresetsLocal(window.state.uid);
            if (!_suppressSyncOnSave && typeof scheduleSyncToFirebase === 'function') {
                scheduleSyncToFirebase();
            }
            if (!_suppressSyncOnSave && window.state.uid) scheduleSyncUserDefectPinPresets();
        } catch (e) {
            console.warn('LocalStorage save warning:', e);
            const isQuotaError = !!(e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014));
            // 2026-09-30 사고: 기기 저장 공간(localStorage 약 5백만 자)이 차면 setItem이 실패하는데, 서버 올리기
            // 예약이 setItem 뒤에 있어 **같이 건너뛰었다** → CAD 핀·엑셀 가져오기처럼 한 번에 많이 늘어나는 저장이
            // 기기에도 서버에도 안 남고, 새로고침하면 사라졌다. 기기 저장이 실패해도 메모리의 최신 상태는
            // 서버로 올린다(층 dirty 표시 + 예약). 서버에 올라가면 다시 들어올 때 병합으로 돌아온다.
            let cloudQueued = false;
            // 저장 공간이 찼으면 비교사진을 IndexedDB로 옮겨 자리를 만든다(옮긴 뒤 다시 저장)
            if (typeof scheduleGaugePhotoMigrate === 'function') scheduleGaugePhotoMigrate();
            if (!_suppressSyncOnSave && typeof scheduleSyncToFirebase === 'function') {
                try {
                    scheduleSyncToFirebase();
                    cloudQueued = !!(db && window.state.companyId && navigator.onLine !== false);
                } catch (syncErr) {
                    console.warn('기기 저장 실패 뒤 서버 올리기 예약도 실패:', syncErr);
                }
            }
            const nowMs = Date.now();
            // 한 번만 알리면 계속 실패하는 줄 모른다 — 2분마다 다시 알린다
            if (!_localStorageSaveFailedNotified || (nowMs - (_localStorageSaveFailedAt || 0)) > 120000) {
                _localStorageSaveFailedNotified = true;
                _localStorageSaveFailedAt = nowMs;
                const tail = cloudQueued
                    ? ' 변경사항은 서버에 올리는 중입니다 — 동기화가 끝나기 전에 새로고침하거나 앱을 닫지 마세요.'
                    : ' 지금 오프라인이라 서버에도 못 올렸습니다 — 인터넷에 연결될 때까지 새로고침하거나 앱을 닫지 마세요.';
                window.showToast(
                    (isQuotaError
                        ? '이 기기 저장 공간이 가득 차서 기기에는 저장하지 못했습니다.'
                        : '변경사항을 기기에 저장하지 못했습니다.') + tail,
                    'error',
                    10000
                );
            }
        }
    }

    function getDefaultBuildings() {
        return [
            {
                id: 'bldg-cheomdan-hospital',
                name: '🏢 첨단병원',
                address: '광주광역시 광산구 첨단중앙로 123 (첨단병원)',
                inspector: '홍길동 수석점검자',
                date: '2026-07-29',
                floors: '지상 5층 ~ 지하 1층',
                floorsList: [
                    { floorCode: '1F', floorLabel: '지상 1층 (1F)' },
                    { floorCode: '2F', floorLabel: '지상 2층 (2F)' },
                    { floorCode: '3F', floorLabel: '지상 3층 (3F)' },
                    { floorCode: '4F', floorLabel: '지상 4층 (4F)' },
                    { floorCode: '5F', floorLabel: '지상 5층 (5F)' }
                ],
                floorDrawings: {},
                notes: '첨단병원 정밀 안전점검 현장점검 도면 세트'
            }
        ];
    }

    function loadStateFromLocalStorage(options) {
        options = options || {};
        const companyId = options.companyId !== undefined ? options.companyId : window.state.companyId;
        try {
            let saved = (typeof options.raw === 'string' && options.raw) ? options.raw : localStorage.getItem(getLocalStorageStateKey(companyId));
            // 회사 로그인 시 전역(가입 전) 로컬 blob은 읽지 않음 — 클라우드·회사별 캐시만 사용
            if (!saved && !companyId) {
                saved = localStorage.getItem(LOCAL_STATE_KEY_LEGACY);
            }
            // 회사별 캐시 도입 전(레거시 단일 키) 데이터 1회 이관: 이 기기에 회사별 캐시가
            // 하나도 없어 다른 회사 데이터와 섞일 위험이 없을 때만, 레거시 blob(미동기화 데이터
            // 포함 가능)을 현재 회사 슬롯으로 옮겨써서 유실을 막는다.
            if (!saved && companyId && !hasAnyCompanyScopedLocalState()) {
                const legacy = localStorage.getItem(LOCAL_STATE_KEY_LEGACY);
                if (legacy) {
                    saved = legacy;
                    try { localStorage.setItem(getLocalStorageStateKey(companyId), legacy); } catch (_e) { /* ignore */ }
                }
            }
            let defectGroupRepairPending = false;
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.buildings && Array.isArray(parsed.buildings)) {
                    window.state.buildings = parsed.buildings.map(bldg => {
                        stripDeletedDrawingFloorsFromBuilding(bldg);
                        (bldg.deletedDrawingFloorCodes || []).forEach((code) => {
                            if (bldg && bldg.id && code) {
                                _sessionDeletedDrawingKeys.add(`${bldg.id}_${code}`);
                            }
                        });
                        if (typeof window.getBuildingAvailableFloors === 'function') {
                            bldg.floorsList = window.getBuildingAvailableFloors(bldg);
                        }
                        return bldg;
                    });
                } else {
                    window.state.buildings = [];
                }
                if (parsed.defects) {
                    window.state.defects = parsed.defects;
                    Object.keys(window.state.defects).forEach((floorKey) => {
                        if (normalizeFloorDefectGroupsInPlace(window.state.defects[floorKey])) {
                            defectGroupRepairPending = true;
                        }
                    });
                    // 칸 단위 병합: 다음 수정 때 무엇이 바뀌었는지 비교할 기준
                    seedDefectContentSnaps(window.state.defects);
                }
                if (parsed.ndtData) {
                    window.state.ndtData = parsed.ndtData;
                }
                if (parsed.ndtDisplacementGroups) {
                    window.state.ndtDisplacementGroups = parsed.ndtDisplacementGroups;
                }
                if (parsed.ndtDrawingRefs && typeof parsed.ndtDrawingRefs === 'object') {
                    window.state.ndtDrawingRefs = parsed.ndtDrawingRefs;
                }
                if (parsed.deletedDefectIds) {
                    window.state.deletedDefectIds = parsed.deletedDefectIds;
                }
                if (parsed.deletedDefectAt) {
                    window.state.deletedDefectAt = parsed.deletedDefectAt;
                }
                if (parsed.confirmedDeletedIds) {
                    window.state.confirmedDeletedIds = parsed.confirmedDeletedIds;
                }
                if (parsed.deletedNdtIds) {
                    window.state.deletedNdtIds = parsed.deletedNdtIds;
                }
                if (parsed.drawingMemos && typeof parsed.drawingMemos === 'object') window.state.drawingMemos = parsed.drawingMemos;
                if (parsed.deletedMemoIds && typeof parsed.deletedMemoIds === 'object') window.state.deletedMemoIds = parsed.deletedMemoIds;
                if (parsed.deletedMemoAt && typeof parsed.deletedMemoAt === 'object') window.state.deletedMemoAt = parsed.deletedMemoAt;
                if (parsed.sketchMemos && typeof parsed.sketchMemos === 'object') window.state.sketchMemos = parsed.sketchMemos;
                if (parsed.deletedSketchIds && typeof parsed.deletedSketchIds === 'object') window.state.deletedSketchIds = parsed.deletedSketchIds;
                if (parsed.deletedSketchAt && typeof parsed.deletedSketchAt === 'object') window.state.deletedSketchAt = parsed.deletedSketchAt;
                if (parsed.guideShapes && typeof parsed.guideShapes === 'object') window.state.guideShapes = parsed.guideShapes;
                if (parsed.deletedGuideShapeIds && typeof parsed.deletedGuideShapeIds === 'object') window.state.deletedGuideShapeIds = parsed.deletedGuideShapeIds;
                if (parsed.deletedGuideShapeAt && typeof parsed.deletedGuideShapeAt === 'object') window.state.deletedGuideShapeAt = parsed.deletedGuideShapeAt;
                if (parsed.structMembers && typeof parsed.structMembers === 'object') window.state.structMembers = parsed.structMembers;
                if (parsed.deletedStructMemberIds && typeof parsed.deletedStructMemberIds === 'object') window.state.deletedStructMemberIds = parsed.deletedStructMemberIds;
                if (parsed.deletedStructMemberAt && typeof parsed.deletedStructMemberAt === 'object') window.state.deletedStructMemberAt = parsed.deletedStructMemberAt;
                if (parsed.structOverlays && typeof parsed.structOverlays === 'object') window.state.structOverlays = parsed.structOverlays;
                if (parsed.deletedNdtAt) {
                    window.state.deletedNdtAt = parsed.deletedNdtAt;
                }
                if (parsed.deletedBuildingIds) {
                    window.state.deletedBuildingIds = parsed.deletedBuildingIds;
                }
                if (parsed.customDefectTypes) {
                    window.state.customDefectTypes = parsed.customDefectTypes;
                }
                if (parsed.customDefectCauses) {
                    window.state.customDefectCauses = parsed.customDefectCauses;
                }
                if (parsed.customDefectComponents) {
                    window.state.customDefectComponents = parsed.customDefectComponents;
                }
                if (parsed.hiddenDefectComponents) {
                    window.state.hiddenDefectComponents = parsed.hiddenDefectComponents;
                }
                if (parsed.hiddenDefectTypes) {
                    window.state.hiddenDefectTypes = parsed.hiddenDefectTypes;
                }
                if (parsed.hiddenDefectCauses) {
                    window.state.hiddenDefectCauses = parsed.hiddenDefectCauses;
                }
                if (parsed.defectComponentOrder) {
                    window.state.defectComponentOrder = parsed.defectComponentOrder;
                }
                if (parsed.defectTypeOrder) {
                    window.state.defectTypeOrder = parsed.defectTypeOrder;
                }
                if (parsed.defectCauseOrder) {
                    window.state.defectCauseOrder = parsed.defectCauseOrder;
                }
                ['favoriteDefectComponents', 'favoriteDefectTypes', 'favoriteDefectCauses', 'defectPickUsage'].forEach((f) => {
                    if (parsed[f] && typeof parsed[f] === 'object') window.state[f] = parsed[f];
                });
                if (parsed.defectCauseAutoCheck === false) window.state.defectCauseAutoCheck = false;
                if (parsed.styleColors) {
            window.state.styleColors = parsed.styleColors;
        }
        if (parsed.styleColorsPaletteVersion != null) {
            window.state.styleColorsPaletteVersion = parsed.styleColorsPaletteVersion;
        }
                if (parsed.styleSizes) {
                    window.state.styleSizes = parsed.styleSizes;
                    window.state._globalStyleSizesFallback = parsed.styleSizes;
                }
                if (parsed.defectLeaderLineScale !== undefined) {
                    window.state.defectLeaderLineScale = parsed.defectLeaderLineScale;
                    window.state._globalDefectLeaderLineScaleFallback = parsed.defectLeaderLineScale;
                }
                if (parsed.ndtLeaderLineScale !== undefined) {
                    window.state.ndtLeaderLineScale = parsed.ndtLeaderLineScale;
                }
                if (parsed.styleSizeBarLockedMap !== undefined) {
                    window.state.styleSizeBarLockedMap = !!parsed.styleSizeBarLockedMap;
                }
                if (parsed.styleSizeBarLockedNdt !== undefined) {
                    window.state.styleSizeBarLockedNdt = !!parsed.styleSizeBarLockedNdt;
                }
                if (parsed.floorMapStyleSettings) {
                    window.state.floorMapStyleSettings = parsed.floorMapStyleSettings;
                }
                if (parsed.floorDrawingRotations) {
                    window.state.floorDrawingRotations = parsed.floorDrawingRotations;
                }
                if (parsed.floorGridLines) {
                    window.state.floorGridLines = parsed.floorGridLines;
                }
                if (parsed.floorPrintCrops) {
                    window.state.floorPrintCrops = parsed.floorPrintCrops;
                }
                if (parsed.floorDrawingDarken) {
                    window.state.floorDrawingDarken = parsed.floorDrawingDarken;
                }
                if (parsed.styleShapes) {
                    window.state.styleShapes = parsed.styleShapes;
                }
                if (parsed.surveyColumns) {
                    window.state.surveyColumns = parsed.surveyColumns;
                }
                if (parsed.surveyColumnsGrade3) {
                    window.state.surveyColumnsGrade3 = parsed.surveyColumnsGrade3;
                }
                if (parsed.locationMapLegend) {
                    window.state.locationMapLegend = parsed.locationMapLegend;
                }
                if (parsed.locationMapLegendBox) {
                    window.state.locationMapLegendBox = parsed.locationMapLegendBox;
                }
                if (parsed.defectSizeMode) {
                    window.state.defectSizeMode = parsed.defectSizeMode;
                }
                // 2026-10-19 예전에는 고르지 않아도 'arrow'가 저장됐다 — 직접 고른 표시(tipShapeChosen)가 있을 때만 저장값,
                // 아니면 새 기본 동그라미
                if (parsed.tipShape && parsed.tipShapeChosen) {
                    window.state.tipShape = parsed.tipShape === 'arrow' ? 'arrow' : 'circle';
                    window.state.tipShapeChosen = true;
                } else {
                    window.state.tipShape = 'circle';
                }
                if (parsed.areaFillStyle) {
                    window.state.areaFillStyle = parsed.areaFillStyle;
                }
                if (parsed.areaBorderStyle) {
                    window.state.areaBorderStyle = parsed.areaBorderStyle;
                }
                if (parsed.snapToCad !== undefined) {
                    window.state.snapToCad = parsed.snapToCad !== false;
                }
            } else {
                window.state.buildings = getDefaultBuildings();
            }

            ensureSyncMetaState();
            window.state.buildings = filterDeletedBuildings(
                window.state.buildings || [],
                window.state.deletedBuildingIds
            );

            if (!window.state.buildings) window.state.buildings = [];

            const compInput = document.getElementById('inputHomeCompanyName');
            if (compInput && window.state.companyName) compInput.value = window.state.companyName;

            // 도면/사진은 localStorage가 아니라 IndexedDB에서 비동기로 복원한다(위 저장 로직과 짝).
            // 화면은 먼저 그리고, 이미지는 도착하는 대로 다시 그려서 채워넣는다.
            hydrateLocalImagesFromIndexedDb();
            // 균열게이지·팁 비교사진: 번호만 남은 사진은 IndexedDB에서 채우고, 저장본에 남은 data URL은 옮긴다
            if (typeof scheduleGaugePhotoStartup === 'function') scheduleGaugePhotoStartup();
            if (typeof restoreDirtyFloorKeys === 'function') restoreDirtyFloorKeys();
            if (typeof window.purgeExpiredBuildingTrash === 'function') {
                window.purgeExpiredBuildingTrash().catch(() => {});
            }
            if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
            if (typeof migrateLeaderLineScalesIfNeeded === 'function') migrateLeaderLineScalesIfNeeded();
            if (defectGroupRepairPending) saveStateToLocalStorage();
        } catch (e) {
            console.error('LocalStorage load failed:', e);
            window.state.buildings = getDefaultBuildings();
        }
    }

    // --- 다기기 동기화: 고유코드(id) 기준 병합 + 표시번호(NO.) 당김 + 삭제코드 재사용 ---
    // 원칙: 서버 문서를 먼저 기준으로 두고, 로컬(오프라인)에서만 생긴 항목·사진을 얹는다.
    // 삭제 tombstone은 deletedAt보다 늦은 updatedAt(수정/사진추가)이 있으면 부활시킨다.
    function ensureSyncMetaState() {
        if (!window.state.deletedDefectIds) window.state.deletedDefectIds = {};
        if (!window.state.deletedDefectAt) window.state.deletedDefectAt = {};
        if (!window.state.confirmedDeletedIds) window.state.confirmedDeletedIds = {};
        if (!window.state.deletedNdtIds) window.state.deletedNdtIds = {};
        if (!window.state.deletedNdtAt) window.state.deletedNdtAt = {};
        if (!window.state.deletedBuildingIds) window.state.deletedBuildingIds = [];
    }

    function mergeDeletedBuildingIds(serverList, localList) {
        const set = new Set([...(serverList || []), ...(localList || [])].filter(Boolean));
        return Array.from(set);
    }

    function filterDeletedBuildings(buildings, deletedIds) {
        const del = new Set(deletedIds || []);
        if (!del.size) return buildings || [];
        return (buildings || []).filter(b => b?.id && !del.has(b.id));
    }

    /** 건물 휴지통 보관 기간 (약 30일) */
    const BUILDING_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

    function isBuildingTrashed(bldg) {
        return !!(bldg && bldg.trashedAt);
    }

    function filterActiveBuildings(buildings, deletedIds) {
        return filterDeletedBuildings(buildings || [], deletedIds).filter((b) => !isBuildingTrashed(b));
    }

    function listTrashedBuildings() {
        return filterDeletedBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter(isBuildingTrashed)
            .sort((a, b) => Date.parse(String(b.trashedAt)) - Date.parse(String(a.trashedAt)));
    }

    function getBuildingTrashRemainingMs(bldg) {
        const t = Date.parse(String(bldg && bldg.trashedAt));
        // 2026-11-10 휴지통에 넣은 날짜를 못 읽으면 「만료」가 아니라 「아직 남음」으로 본다(영구 삭제는 되돌릴 수 없다)
        if (!Number.isFinite(t)) return BUILDING_TRASH_RETENTION_MS;
        // 서버 시계 보정값 기준(기기 시계가 조금 틀려도 만료 계산이 같게)
        const now = (typeof bsaSyncNow === 'function') ? bsaSyncNow() : Date.now();
        return (t + BUILDING_TRASH_RETENTION_MS) - now;
    }

    function formatBuildingTrashRemaining(bldg) {
        const ms = getBuildingTrashRemainingMs(bldg);
        if (ms <= 0) return '만료(곧 삭제)';
        const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
        if (days >= 1) return `${days}일 남음`;
        const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
        return `${hours}시간 남음`;
    }

    function mergeBuildingTrashState(merged, localMatch, remoteB) {
        if (!merged) return;
        const trashApi = window.BSA && window.BSA.syncMerge;
        if (trashApi && typeof trashApi.resolveBuildingTrashState === 'function') {
            // 복원 시각도 서버에 올려 다른 기기가 휴지통으로 되돌리지 않게 한다(2026-09-21)
            const resolved = trashApi.resolveBuildingTrashState(localMatch, remoteB);
            if (resolved.trashedAt) merged.trashedAt = resolved.trashedAt;
            else delete merged.trashedAt;
            if (resolved.trashRestoredAt) merged.trashRestoredAt = resolved.trashRestoredAt;
            else delete merged.trashRestoredAt;
            delete merged._trashRestoredAt;
            return;
        }
        const localTrashed = localMatch && localMatch.trashedAt ? String(localMatch.trashedAt) : '';
        const remoteTrashed = remoteB && remoteB.trashedAt ? String(remoteB.trashedAt) : '';
        const localRestoredAt = localMatch && localMatch._trashRestoredAt
            ? Date.parse(String(localMatch._trashRestoredAt))
            : 0;
        const remoteTrashAt = remoteTrashed ? Date.parse(remoteTrashed) : 0;
        if (localRestoredAt && (!remoteTrashAt || localRestoredAt >= remoteTrashAt)) {
            delete merged.trashedAt;
            delete merged._trashRestoredAt;
            return;
        }
        if (localTrashed || remoteTrashed) {
            const times = [localTrashed, remoteTrashed].filter(Boolean).sort();
            merged.trashedAt = times[times.length - 1];
        } else {
            delete merged.trashedAt;
        }
        delete merged._trashRestoredAt;
    }

    /** 현장(정규화 명칭) 기준 남은 활성 점검(동×회차) 수 */
    function countActiveBuildingsForSiteKey(siteKey, buildings, deletedIds) {
        const key = String(siteKey || '').trim();
        if (!key) return 0;
        return filterActiveBuildings(buildings || [], deletedIds)
            .filter((b) => getBuildingSiteName(b) === key).length;
    }

    /**
     * 서버·로컬 건물 목록 병합 — 서버에 없는 로컬-only는 업로드 대기(_pendingCloudSync)일 때만 유지.
     * (다른 기기에서 삭제된 고아 레코드가 모바일에 4개·PC 2개처럼 남는 현상 방지)
     */
    /**
     * 층 순서를 더 최근에 바꾼 쪽을 따른다.
     * (예전엔 로컬 순서가 무조건 이겨서, 다른 기기에서 바꾼 순서가 영영 안 넘어오고
     *  오히려 서버에 있던 새 순서를 옛 순서로 되덮었다.)
     * 양쪽 다 기록이 없으면 기존처럼 로컬 우선.
     */
    function preferLocalFloorOrder(localMatch, remote) {
        if (!localMatch) return false;
        const localAt = Number(localMatch.floorsOrderUpdatedAt) || 0;
        const remoteAt = Number(remote && remote.floorsOrderUpdatedAt) || 0;
        if (localAt || remoteAt) return localAt >= remoteAt;
        return true;
    }

    /** 층 순서를 사용자가 직접 정했다고 표시. touched=true면 순서를 실제로 만진 경우. */
    function markFloorOrderManual(bldg, touched) {
        if (!bldg) return;
        const first = !bldg.floorsOrderManual;
        bldg.floorsOrderManual = true;
        if (touched || first) bldg.floorsOrderUpdatedAt = Date.now();
    }

    function mergeFloorMetaLists(localList, remoteList, localOrderWins) {
        const fi = window.BSA && window.BSA.floorIdentity;
        const map = {};
        const add = (f, overwriteLabel) => {
            if (!f || !f.floorCode) return;
            const code = String(f.floorCode);
            const label = (fi && typeof fi.normalizeUserLabel === 'function')
                ? fi.normalizeUserLabel(code, f.floorLabel)
                : (f.floorLabel || (typeof window.getFloorLabelFromCode === 'function'
                    ? window.getFloorLabelFromCode(code)
                    : code));
            if (!map[code]) {
                map[code] = { floorCode: code, floorLabel: label };
            } else if (overwriteLabel && f.floorLabel) {
                map[code].floorLabel = label;
            }
        };
        (remoteList || []).forEach((f) => add(f, false));
        (localList || []).forEach((f) => add(f, true));
        // 순서 기준이 되는 쪽(preferred)만 바뀌고, 층 자체는 어느 쪽에 있든 다 살아남는다.
        const preferred = (localOrderWins === false)
            ? ((remoteList && remoteList.length) ? remoteList : localList)
            : ((localList && localList.length) ? localList : remoteList);
        if (fi && typeof fi.assembleFloors === 'function') {
            return fi.assembleFloors(preferred, Object.values(map));
        }
        const list = Object.values(map);
        return (typeof window.sortFloorsLowToHigh === 'function')
            ? window.sortFloorsLowToHigh(list)
            : list;
    }

    function mergeDrawingFloorCodeLists(localCodes, remoteCodes, floorsList, assetMaps) {
        const set = new Set();
        // 병합이 끝난 floorsList가 확정된 층 순서이므로 이걸 먼저 넣는다.
        // (원격 코드를 먼저 넣으면 드롭다운 복구 경로에서 원격 순서가 floorsList에 박제됐다)
        (floorsList || []).forEach((f) => { if (f && f.floorCode) set.add(String(f.floorCode)); });
        (localCodes || []).forEach((c) => { if (c) set.add(String(c)); });
        (remoteCodes || []).forEach((c) => { if (c) set.add(String(c)); });
        (assetMaps || []).forEach((m) => {
            Object.keys(m || {}).forEach((c) => { if (c) set.add(String(c)); });
        });
        return Array.from(set);
    }

    const _buildingMetaMerge = (window.BSA && window.BSA.buildingMetaMerge) || null;
    const _legendLayout = (window.BSA && window.BSA.legendLayout) || null;
    const BUILDING_LOCAL_META_KEYS = (_buildingMetaMerge && _buildingMetaMerge.KEYS) || [
        'inspectionType', 'inspectionYear', 'inspectionPeriod', 'latestSurveyRoundKey',
        'floorsOrderManual',
        'siteName', 'dong', 'multiDong', 'dongOrder', 'name', 'address', 'inspector', 'contactPhone',
        'floors', 'date', 'structureType', 'facilityGrade', 'completionDate', 'notes',
        'enabledStrengthFormulas', 'strengthAnvilAvg', 'strengthAgeOverride', 'floorPdfRemovedAt', 'floorPdfUpdatedAt', 'roundDone'
    ];

    function buildingMetaUpdatedAt(bldg) {
        if (_buildingMetaMerge && typeof _buildingMetaMerge.metaUpdatedAt === 'function') {
            return _buildingMetaMerge.metaUpdatedAt(bldg);
        }
        const n = Number(bldg && bldg.metaUpdatedAt);
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function markBuildingMetaDirty(bldg) {
        if (_buildingMetaMerge && typeof _buildingMetaMerge.markDirty === 'function') {
            _buildingMetaMerge.markDirty(bldg);
            return;
        }
        if (!bldg) return;
        bldg.metaUpdatedAt = Date.now();
        bldg._pendingCloudSync = true;
    }

    function shouldKeepLocalBuildingMeta(localMatch, remote) {
        if (_buildingMetaMerge && typeof _buildingMetaMerge.shouldKeepLocal === 'function') {
            return _buildingMetaMerge.shouldKeepLocal(localMatch, remote);
        }
        if (!localMatch) return false;
        if (localMatch._pendingCloudSync) return true;
        const localAt = buildingMetaUpdatedAt(localMatch);
        if (!localAt) return false;
        return localAt >= buildingMetaUpdatedAt(remote);
    }

    function applyLocalBuildingMeta(merged, localMatch) {
        if (_buildingMetaMerge && typeof _buildingMetaMerge.applyLocal === 'function') {
            return _buildingMetaMerge.applyLocal(merged, localMatch);
        }
        if (!merged || !localMatch) return merged;
        BUILDING_LOCAL_META_KEYS.forEach((key) => {
            if (localMatch[key] == null || localMatch[key] === '') return;
            merged[key] = localMatch[key];
        });
        if (buildingMetaUpdatedAt(localMatch)) merged.metaUpdatedAt = localMatch.metaUpdatedAt;
        return merged;
    }

    function applyInspectionSelectsFromBuilding(bldg) {
        if (!bldg) return;
        const setSel = (id, value) => {
            if (!value) return;
            const el = document.getElementById(id);
            if (!el) return;
            if (typeof ensureSurveyRoundSelectOption === 'function') {
                ensureSurveyRoundSelectOption(id, value);
            } else {
                el.value = value;
            }
        };
        setSel('selectInspectionType', bldg.inspectionType);
        setSel('selectInspectionYear', bldg.inspectionYear);
        setSel('selectInspectionPeriod', bldg.inspectionPeriod);
        const editing = window.currentEditingBuilding;
        if (editing && editing.id === bldg.id) {
            setSel('inputEditBuildingInspectionType', bldg.inspectionType);
            setSel('inputEditBuildingInspectionYear', bldg.inspectionYear);
            setSel('inputEditBuildingInspectionPeriod', bldg.inspectionPeriod);
        }
        if (typeof window.syncInspectionRoundDateInput === 'function') setTimeout(() => window.syncInspectionRoundDateInput(), 0);
    }

    function mergeBuildingsForSync(serverBuildings, localBuildings, deletedIds, prevAssetsById) {
        const remoteFiltered = filterDeletedBuildings(serverBuildings || [], deletedIds);
        const remoteIds = new Set(remoteFiltered.map((b) => b.id));
        // 2026-10-21 서버 목록에 없어도 삭제 기록(tombstone)이 없는 건물은 절대 빼지 않는다 — 건물 id로 합친다.
        // (사고: 옛 31개 목록이 서버를 덮어써 경신여고 등 9개 건물이 삭제 기록 없이 목록에서 사라짐)
        // 다시 올리도록 _pendingCloudSync 표시를 붙인다.
        const localOnly = filterDeletedBuildings(
            (localBuildings || []).filter((b) => b?.id && !remoteIds.has(b.id)),
            deletedIds
        );
        localOnly.forEach((b) => {
            if (b._pendingCloudSync !== true) {
                console.warn('[건물 병합] 서버 목록에 없지만 삭제 기록이 없어 유지:', b.id, b.name || '');
                b._pendingCloudSync = true;
            }
        });
        const assets = prevAssetsById || captureBuildingDrawingAssetsById(localBuildings);
        const mergedRemote = remoteFiltered.map((b) => {
            const localMatch = (localBuildings || []).find((lb) => lb.id === b.id);
            const bundle = {
                floorDrawings: mergeDrawingAssetMaps(
                    mergeDrawingAssetMaps(assets[b.id]?.floorDrawings, localMatch?.floorDrawings),
                    b.floorDrawings
                ),
                floorDrawingPdfs: mergeDrawingAssetMaps(
                    mergeDrawingAssetMaps(assets[b.id]?.floorDrawingPdfs, localMatch?.floorDrawingPdfs),
                    b.floorDrawingPdfs
                ),
                floorDrawingTiers: mergeDrawingAssetMaps(
                    mergeDrawingAssetMaps(assets[b.id]?.floorDrawingTiers, localMatch?.floorDrawingTiers),
                    b.floorDrawingTiers
                ),
                floorDrawingSources: mergeDrawingAssetMaps(
                    mergeDrawingAssetMaps(assets[b.id]?.floorDrawingSources, localMatch?.floorDrawingSources),
                    b.floorDrawingSources
                )
            };
            const merged = attachPreservedDrawingAssets(b, bundle);
            merged.deletedDrawingFloorCodes = (typeof _drawingFloorTombstone.mergeDeletedDrawingFloorCodes === 'function')
                ? _drawingFloorTombstone.mergeDeletedDrawingFloorCodes(
                    localMatch?.deletedDrawingFloorCodes,
                    b.deletedDrawingFloorCodes
                )
                : Array.from(new Set([
                    ...(localMatch?.deletedDrawingFloorCodes || []),
                    ...(b.deletedDrawingFloorCodes || [])
                ]));
            // 로컬에서 다시 등록한 층은 원격 tombstone보다 우선한다.
            // (전부 지운 뒤 1F만 넣고 2F를 추가하면, 서버에 남은 2F 삭제기록이
            //  union merge로 되살아나 추가 층을 즉시 지워 버리던 버그)
            const locallyResurrected = new Set();
            const markPresent = (code) => {
                const c = code == null ? '' : String(code).trim();
                if (c) locallyResurrected.add(c);
            };
            (localMatch?.drawingFloorCodes || []).forEach(markPresent);
            (localMatch?.floorsList || []).forEach((f) => { if (f) markPresent(f.floorCode); });
            Object.keys(localMatch?.floorDrawings || {}).forEach(markPresent);
            Object.keys(localMatch?.floorDrawingPdfs || {}).forEach(markPresent);
            Object.keys(localMatch?.floorDrawingTiers || {}).forEach(markPresent);
            Object.keys(localMatch?.floorDrawingSources || {}).forEach(markPresent);
            Object.keys(assets[b.id]?.floorDrawings || {}).forEach(markPresent);
            Object.keys(assets[b.id]?.floorDrawingPdfs || {}).forEach(markPresent);
            Object.keys(assets[b.id]?.floorDrawingTiers || {}).forEach(markPresent);
            Object.keys(assets[b.id]?.floorDrawingSources || {}).forEach(markPresent);
            // 로컬 deleted 목록에 없는(= forgetDeleted 한) 층만 부활
            const localDeleted = new Set(
                (localMatch?.deletedDrawingFloorCodes || []).map((c) => String(c || '').trim()).filter(Boolean)
            );
            // 서버 floorsList/drawingFloorCodes에 있고 remote.deleted에는 없는 층은
            // 로컬·세션 false tombstone보다 우선한다. (폰이 옛 tombstone을 들고 있어도
            // 서버 복구 meta가 있으면 점검층·도면 목록에 다시 보이게)
            const remotelyAlive = new Set();
            if (typeof _drawingFloorTombstone.collectRemotelyAliveFloorCodes === 'function') {
                _drawingFloorTombstone.collectRemotelyAliveFloorCodes(b).forEach((c) => remotelyAlive.add(c));
            } else {
                const remoteDeletedSet = new Set(
                    (b.deletedDrawingFloorCodes || []).map((c) => String(c || '').trim()).filter(Boolean)
                );
                const markRemoteAlive = (code) => {
                    const c = code == null ? '' : String(code).trim();
                    if (c && !remoteDeletedSet.has(c)) remotelyAlive.add(c);
                };
                (b.drawingFloorCodes || []).forEach(markRemoteAlive);
                (b.floorsList || []).forEach((f) => { if (f) markRemoteAlive(f.floorCode); });
            }
            // 로컬/prevAssets/IDB 도면 페이로드가 남아 있으면 tombstone보다 우선한다.
            // 원격 건물 문서의 도면 맵(blob)만으로는 해제하지 않는다 — 의도 삭제 직후
            // 클라우드 문서 삭제 전에 merge가 오면 삭제가 풀릴 수 있음.
            // (클라우드 컬렉션 증거는 discoverCloudDrawingFloorCodes / IDB enrich 경로)
            const payloadEvidence = (typeof collectDrawingPayloadEvidenceCodes === 'function')
                ? collectDrawingPayloadEvidenceCodes(
                    {
                        id: b.id,
                        floorDrawings: localMatch?.floorDrawings,
                        floorDrawingPdfs: localMatch?.floorDrawingPdfs,
                        floorDrawingTiers: localMatch?.floorDrawingTiers,
                        floorDrawingSources: localMatch?.floorDrawingSources
                    },
                    [
                        assets[b.id]?.floorDrawings,
                        assets[b.id]?.floorDrawingPdfs,
                        assets[b.id]?.floorDrawingTiers,
                        assets[b.id]?.floorDrawingSources
                    ]
                )
                : new Set();
            // 층별 삭제 시각은 양쪽 중 더 나중 것을 남긴다(없으면 옛 묘비 = 예전 동작).
            merged.deletedDrawingFloorAt = (typeof _drawingFloorTombstone.mergeDeletedDrawingFloorAt === 'function')
                ? _drawingFloorTombstone.mergeDeletedDrawingFloorAt(
                    localMatch?.deletedDrawingFloorAt,
                    b?.deletedDrawingFloorAt
                )
                : Object.assign({}, b?.deletedDrawingFloorAt, localMatch?.deletedDrawingFloorAt);
            // 2026-10-20 다시 넣은 시각도 양쪽 중 나중 것 → 삭제보다 나중에 다시 넣은 층은 묘비를 푼다(어느 기기에서 합쳐도 같은 결과)
            if (typeof _drawingFloorTombstone.mergeDrawingFloorRevivedAt === 'function') {
                const rv = _drawingFloorTombstone.mergeDrawingFloorRevivedAt(localMatch?.drawingFloorRevivedAt, b?.drawingFloorRevivedAt);
                if (Object.keys(rv).length) merged.drawingFloorRevivedAt = rv;
                else delete merged.drawingFloorRevivedAt;
                const revivedCodes = _drawingFloorTombstone.applyDrawingFloorRevivals(merged, null);
                if (revivedCodes.length) {
                    // 세션 묘비(이 기기에서 지운 기록)도 다시 넣은 것이 이기면 푼다
                    revivedCodes.forEach((c) => _sessionDeletedDrawingKeys.delete(`${merged.id}_${c}`));
                }
            }
            // 병합의 증거(payloadEvidence·locallyResurrected)는 전부 내 기기 로컬에서 나온 것이다.
            // 원격이 그 층 묘비를 들고 있으면 0 → 삭제 시각이 있는 묘비는 로컬 증거로 풀지 않는다.
            // (옛 데이터를 든 기기가 접속하면 지운 층을 다시 올리던 문제, 2026-09-21 지하1층 주차장-2)
            // 서버 도면 문서가 남은 오탐 묘비(옥상 등)는 클라우드 조회 경로가 fromEvidence로 푼다.
            const remoteMetaAtForMerge = (code) => (
                typeof _drawingFloorTombstone.remoteMetaAtForRelease === 'function'
                    ? _drawingFloorTombstone.remoteMetaAtForRelease(b, code)
                    : 0
            );
            let clearedFalseTombstones = 0;
            if (payloadEvidence.size || locallyResurrected.size || remotelyAlive.size) {
                merged.deletedDrawingFloorCodes = (merged.deletedDrawingFloorCodes || []).filter((c) => {
                    const code = String(c || '').trim();
                    if (!code) return false;
                    // 로컬 도면 증거·원격 생존 모두 remoteMetaAtForMerge(code)로 판단한다.
                    // 원격 floorsList 생존만으로는 At가 더 나중이면 묘비 유지.
                    if (payloadEvidence.has(code)) {
                        if (typeof forgetDeletedDrawingFloor === 'function'
                            && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                            return true;
                        }
                        clearedFalseTombstones += 1;
                        return false;
                    }
                    if (remotelyAlive.has(code)) {
                        if (typeof forgetDeletedDrawingFloor === 'function'
                            && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                            return true;
                        }
                        clearedFalseTombstones += 1;
                        return false;
                    }
                    if (locallyResurrected.has(code) && !localDeleted.has(code)) {
                        if (typeof forgetDeletedDrawingFloor === 'function'
                            && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                            return true;
                        }
                        clearedFalseTombstones += 1;
                        return false;
                    }
                    return true;
                });
            }
            if (clearedFalseTombstones > 0) {
                merged._pendingCloudSync = true;
            }
            stripDeletedDrawingFloorsFromBuilding(merged);
            // 원격이 옛 floorsList(1층만)를 갖고 와도, 로컬에서 추가한 층이 사라지지 않게 합친다
            const localFloorOrderWins = preferLocalFloorOrder(localMatch, b);
            merged.floorsList = mergeFloorMetaLists(localMatch?.floorsList, b.floorsList, localFloorOrderWins);
            // 2026-10-20 층 이름 바꾸기: 이름 바꾼 시각(floorLabelAt)이 더 늦은 쪽 이름을 따른다(층 구성·묘비는 그대로)
            if (window.BSA && window.BSA.floorRename) window.BSA.floorRename.applyLabelMerge(merged, localMatch, b);
            // 순서를 가져온 쪽의 "직접 정한 순서" 표시·시각도 같이 따라가야 한다
            const floorOrderSource = localFloorOrderWins ? localMatch : b;
            if (floorOrderSource) {
                if (floorOrderSource.floorsOrderManual) merged.floorsOrderManual = true;
                const srcAt = Number(floorOrderSource.floorsOrderUpdatedAt) || 0;
                if (srcAt > 0) merged.floorsOrderUpdatedAt = srcAt;
            }
            merged.drawingFloorCodes = mergeDrawingFloorCodeLists(
                localMatch?.drawingFloorCodes,
                b.drawingFloorCodes,
                merged.floorsList,
                [merged.floorDrawings, merged.floorDrawingPdfs, merged.floorDrawingTiers, merged.floorDrawingSources]
            );
            // 합친 뒤에도 도면 증거·서버 생존 meta·로컬 재등록 층은 tombstone에서 한 번 더 제거
            if (payloadEvidence.size || locallyResurrected.size || remotelyAlive.size) {
                merged.deletedDrawingFloorCodes = (merged.deletedDrawingFloorCodes || []).filter((c) => {
                    const code = String(c || '').trim();
                    if (!code) return false;
                    if (payloadEvidence.has(code)) {
                        if (typeof forgetDeletedDrawingFloor === 'function'
                            && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                            return true;
                        }
                        return false;
                    }
                    if (remotelyAlive.has(code)) {
                        if (typeof forgetDeletedDrawingFloor === 'function'
                            && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                            return true;
                        }
                        return false;
                    }
                    if (!(locallyResurrected.has(code) && !localDeleted.has(code))) return true;
                    if (typeof forgetDeletedDrawingFloor === 'function'
                        && !forgetDeletedDrawingFloor(merged, code, { remoteMetaAt: remoteMetaAtForMerge(code) })) {
                        return true;
                    }
                    return false;
                });
            }
            stripDeletedDrawingFloorsFromBuilding(merged);
            if (merged.drawingFloorCodes.length) {
                mergeDiscoveredFloorsIntoBuilding(merged, new Set(merged.drawingFloorCodes));
            }
            if (typeof window.getBuildingAvailableFloors === 'function') {
                merged.floorsList = window.getBuildingAvailableFloors(merged);
            }
            stripDeletedDrawingFloorsFromBuilding(merged);
            merged.overviewPhotos = mergeOverviewPhotoLists(localMatch?.overviewPhotos, b.overviewPhotos);
            // 전차 종합결론: 합집합 + 지운 표시(다른 기기의 옛 목록이 지운 그림을 되살리지 않게)
            if (window.BSA && window.BSA.prevSummary && (localMatch?.prevSummaryImages || b.prevSummaryImages
                || localMatch?.prevSummaryDeleted || b.prevSummaryDeleted)) {
                const pvs = window.BSA.prevSummary.merge(localMatch, b);
                merged.prevSummaryImages = pvs.images;
                merged.prevSummaryDeleted = pvs.deleted;
            }
            mergeBuildingTrashState(merged, localMatch, b);
            if (_buildingMetaMerge && typeof _buildingMetaMerge.overlay === 'function') {
                _buildingMetaMerge.overlay(merged, localMatch, b);
            } else {
                if (shouldKeepLocalBuildingMeta(localMatch, b)) {
                    applyLocalBuildingMeta(merged, localMatch);
                }
                if (localMatch && localMatch._pendingCloudSync) merged._pendingCloudSync = true;
            }
            if (_buildingMetaMerge && typeof _buildingMetaMerge.mergeFloorStampMaps === 'function') {
                // 도면을 다시 넣은 시각만 층마다 더 나중 것을 남긴다.
                // (PDF를 뺀 시각은 0으로 푸는 값이 있어서 최대값으로 합치면 안 된다)
                merged.floorPdfUpdatedAt = _buildingMetaMerge.mergeFloorStampMaps(
                    localMatch && localMatch.floorPdfUpdatedAt,
                    b.floorPdfUpdatedAt
                );
            }
            if (_legendLayout && typeof _legendLayout.overlayOnMerged === 'function') {
                _legendLayout.overlayOnMerged(merged, localMatch);
            } else if (localMatch) {
                if (Array.isArray(localMatch.locationMapLegend) && localMatch.locationMapLegend.length) {
                    merged.locationMapLegend = JSON.parse(JSON.stringify(localMatch.locationMapLegend));
                }
                if (localMatch.locationMapLegendBox) {
                    merged.locationMapLegendBox = { ...localMatch.locationMapLegendBox };
                }
            }
            return merged;
        });
        return [...localOnly, ...mergedRemote];
    }

    function mergeOverviewPhotoLists(localList, remoteList) {
        const byId = new Map();
        (remoteList || []).forEach((p) => {
            if (!p || !p.id) return;
            byId.set(p.id, {
                id: p.id,
                caption: p.caption != null ? String(p.caption) : '',
                ...(p.dataUrl ? { dataUrl: p.dataUrl } : {})
            });
        });
        (localList || []).forEach((p) => {
            if (!p || !p.id) return;
            const prev = byId.get(p.id) || { id: p.id, caption: '' };
            byId.set(p.id, {
                id: p.id,
                caption: (p.caption != null && String(p.caption).trim() !== '')
                    ? String(p.caption)
                    : (prev.caption || ''),
                dataUrl: p.dataUrl || prev.dataUrl || undefined
            });
        });
        const ordered = [];
        const seen = new Set();
        (localList || []).forEach((p) => {
            if (!p?.id || seen.has(p.id) || !byId.has(p.id)) return;
            ordered.push(byId.get(p.id));
            seen.add(p.id);
        });
        (remoteList || []).forEach((p) => {
            if (!p?.id || seen.has(p.id) || !byId.has(p.id)) return;
            ordered.push(byId.get(p.id));
            seen.add(p.id);
        });
        return ordered.map((p) => {
            const out = { id: p.id, caption: p.caption || '' };
            if (p.dataUrl) out.dataUrl = p.dataUrl;
            return out;
        });
    }

    function sanitizeBuildingMetaForFirestore(b) {
        if (!b) return b;
        const {
            floorDrawings, floorDrawingPdfs, floorDrawingTiers, floorDrawingSources,
            _pendingCloudSync, _trashRestoredAt, _metaFieldHash, ...rest
        } = b;
        if (Array.isArray(rest.overviewPhotos)) {
            rest.overviewPhotos = rest.overviewPhotos.map((p) => ({
                id: p.id,
                caption: (p && p.caption != null) ? String(p.caption) : ''
            })).filter((p) => p.id);
        }
        if (Array.isArray(rest.prevSummaryImages) && window.BSA && window.BSA.prevSummary) {
            rest.prevSummaryImages = window.BSA.prevSummary.sanitize(rest.prevSummaryImages);
        }
        if (!rest.trashedAt) delete rest.trashedAt;
        return rest;
    }

    /** state.buildings 병합 후 currentBuilding 참조·도면 메모리 갱신 */
    function refreshCurrentBuildingFromState() {
        if (window.currentEditingBuilding && window.currentEditingBuilding.id) {
            const editing = (window.state.buildings || []).find((b) => b.id === window.currentEditingBuilding.id);
            if (editing) window.currentEditingBuilding = editing;
        }
        if (!state.currentBuildingId) return null;
        const fresh = (window.state.buildings || []).find((b) => b.id === state.currentBuildingId);
        if (fresh) state.currentBuilding = fresh;
        return fresh || null;
    }

    function isFloorKeyForDeletedBuilding(floorKey, deletedBuildingIds) {
        if (!floorKey || !deletedBuildingIds?.length) return false;
        return deletedBuildingIds.some(id => id && floorKey.startsWith(`${id}_`));
    }

    function filterMapKeysByDeletedBuildings(obj, deletedBuildingIds) {
        if (!obj || !deletedBuildingIds?.length) return obj || {};
        const out = {};
        Object.entries(obj).forEach(([key, val]) => {
            if (!isFloorKeyForDeletedBuilding(key, deletedBuildingIds)) out[key] = val;
        });
        return out;
    }

    function recordBuildingDeleted(buildingId) {
        ensureSyncMetaState();
        if (!buildingId) return;
        const set = new Set(window.state.deletedBuildingIds || []);
        set.add(buildingId);
        window.state.deletedBuildingIds = Array.from(set);
    }

    function unrecordBuildingDeleted(buildingId) {
        ensureSyncMetaState();
        if (!buildingId) return;
        window.state.deletedBuildingIds = (window.state.deletedBuildingIds || []).filter((id) => id !== buildingId);
    }

    /** 건물을 휴지통으로 이동 (약 30일 보관 후 자동 영구 삭제)
     * opts.skipUi: 회차 일괄 삭제 등에서 UI·동기화를 한 번만 하도록 중간 갱신을 생략 */
    window.moveBuildingToTrash = function(bldg, opts) {
        opts = opts || {};
        if (!bldg || !bldg.id) return false;
        bldg.trashedAt = new Date().toISOString();
        delete bldg._trashRestoredAt;
        bldg._pendingCloudSync = true;

        if (!opts.skipUi) {
            if (window.currentEditingBuilding && window.currentEditingBuilding.id === bldg.id) {
                if (typeof window.closeEditBuildingModalFunc === 'function') window.closeEditBuildingModalFunc();
            }
            if (window.state.currentBuildingId === bldg.id) {
                window.state.currentBuilding = null;
                window.state.currentBuildingId = null;
                if (typeof window.switchTab === 'function') window.switchTab('tab-home');
            }

            saveStateToLocalStorage();
            if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
        }
        return true;
    };

    /** 휴지통에서 건물 복원 */
    window.restoreBuildingFromTrash = function(buildingId) {
        const bldg = (window.state.buildings || []).find((b) => b && b.id === buildingId);
        if (!bldg || !isBuildingTrashed(bldg)) {
            window.showToast('복원할 건물을 찾을 수 없습니다.', 'warning');
            return false;
        }
        delete bldg.trashedAt;
        bldg._trashRestoredAt = new Date().toISOString();
        bldg.trashRestoredAt = bldg._trashRestoredAt;
        bldg._pendingCloudSync = true;
        unrecordBuildingDeleted(bldg.id);

        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof window.renderBuildingTrashModal === 'function') window.renderBuildingTrashModal();
        if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
        window.showToast(`'${bldg.name || '건물'}'을(를) 복원했습니다.`, 'success');
        return true;
    };

    /**
     * 건물 영구 삭제 — 휴지통 만료·수동 비우기용.
     * 도면·결함·클라우드 첨부를 제거하고 deletedBuildingIds에 기록한다.
     */
    window.permanentlyDeleteBuilding = async function(bldg, opts) {
        opts = opts || {};
        if (!bldg || !bldg.id) return false;
        // 백업을 먼저 지운다 — 남아 있으면 아래 사진 삭제가 "백업이 쓰는 사진"으로 보고 지우지 않는다
        try {
            await deleteAllBuildingBackups(bldg.id);
        } catch (e) {
            console.warn('[건물 백업] 영구 삭제 전 백업 정리 실패 — 백업이 쓰던 사진은 클라우드에 남습니다:', bldg.id, e);
        }
        const siteKey = siteVaultKeyForBuilding(bldg);
        recordBuildingDeleted(bldg.id);
        window.state.buildings = (window.state.buildings || []).filter((b) => b.id !== bldg.id);
        const purgeSiteDrawingsFromCloud = countActiveBuildingsForSiteKey(
            siteKey,
            window.state.buildings,
            window.state.deletedBuildingIds
        ) === 0;

        const photoDeleteJobs = [];
        Object.keys(window.state.defects || {}).forEach((k) => {
            if (k.startsWith(bldg.id + '_')) {
                (window.state.defects[k] || []).forEach((d) => {
                    photoDeleteJobs.push(deleteAllPhotosForDefect(d));
                });
                delete window.state.defects[k];
            }
        });
        const removedNdtItems = [];
        Object.keys(window.state.ndtData || {}).forEach((k) => {
            if (!k.startsWith(bldg.id + '_')) return;
            (window.state.ndtData[k] || []).forEach((it) => removedNdtItems.push(it));
            delete window.state.ndtData[k];
        });
        // 부동침하 구역의 현장 사진도 같이 — 구역을 state에서 먼저 빼야 "아직 쓰는 사진"으로 안 잡힌다
        Object.keys(window.state.ndtDisplacementGroups || {}).forEach((k) => {
            if (!k.startsWith(bldg.id + '_')) return;
            (window.state.ndtDisplacementGroups[k] || []).forEach((g) => removedNdtItems.push(g));
            delete window.state.ndtDisplacementGroups[k];
        });
        // 영구 삭제는 되돌릴 수 없다 — 측정지·현장 사진도 이 기기 사본까지 지운다
        releaseStrengthPhotosOfItems(bldg.id, removedNdtItems, { keepLocal: false });
        (bldg.overviewPhotos || []).forEach((p) => {
            if (p && p.id) photoDeleteJobs.push(deleteOverviewPhotoStorage(bldg.id, p.id));
        });
        (bldg.prevSummaryImages || []).forEach((p) => {
            if (p && p.id && window.BSA && window.BSA.prevSummary) {
                photoDeleteJobs.push(deletePrevSummaryStorage(window.BSA.prevSummary.docId(bldg.id, p.id)));
            }
        });
        purgeLocalStateForDeletedBuilding(bldg.id);

        if (window.currentEditingBuilding && window.currentEditingBuilding.id === bldg.id) {
            if (typeof window.closeEditBuildingModalFunc === 'function') window.closeEditBuildingModalFunc();
        }
        if (window.state.currentBuildingId === bldg.id) {
            window.state.currentBuilding = null;
            window.state.currentBuildingId = null;
            if (typeof window.switchTab === 'function') window.switchTab('tab-home');
        }

        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
        if (!opts.silent) {
            window.showToast(`'${bldg.name || '건물'}'을(를) 영구 삭제했습니다.`, 'success');
        }

        Promise.all([
            archiveBuildingPdfsToSiteVault(bldg).then(() => deleteFloorDrawingsForBuilding(bldg, { purgeCloud: purgeSiteDrawingsFromCloud })),
            purgeSiteDrawingsFromCloud ? deleteSiteVaultCompletely(siteKey) : Promise.resolve(0),
            ...photoDeleteJobs
        ]).then((results) => {
            const totalFail = results.reduce((sum, n) => sum + (n || 0), 0);
            if (totalFail > 0 && !opts.silent) {
                window.showToast(`클라우드에서 일부 첨부파일(${totalFail}건) 삭제에 실패했습니다. 네트워크 상태를 확인해 주세요.`, 'warning', 5000);
            }
        });
        return true;
    };

    /** 보관 기간이 지난 휴지통 건물 영구 삭제 */
    window.purgeExpiredBuildingTrash = async function() {
        const listExpired = () => listTrashedBuildings().filter((b) => getBuildingTrashRemainingMs(b) <= 0);
        let expired = listExpired();
        if (!expired.length) return 0;
        // 2026-11-10 자동 영구 삭제는 되돌릴 수 없다 — 지우기 직전에 서버 시계로 이 기기 날짜를 다시 확인한다.
        // 날짜가 크게 틀렸거나(bad) 이번에 확인하지 못했으면(fail·unknown) 지우지 않고 다음으로 미룬다. 직접 누르는 「영구 삭제」는 그대로.
        const clock = await checkClockBeforePurge();
        if (!clock.ok) {
            console.warn('[휴지통] 기기 날짜를 확인하지 못해 만료 건물 자동 영구 삭제를 미룹니다:', clock.status);
            return 0;
        }
        expired = listExpired();   // 보정값이 바뀌었을 수 있다
        if (!expired.length) return 0;
        for (const b of expired) {
            await window.permanentlyDeleteBuilding(b, { silent: true });
        }
        if (expired.length) {
            window.showToast(`휴지통 만료 건물 ${expired.length}건을 영구 삭제했습니다.`, 'info', 4500);
            if (typeof window.renderBuildingTrashModal === 'function') window.renderBuildingTrashModal();
        }
        return expired.length;
    };

    window.updateBuildingTrashBadge = function() {
        const badge = document.getElementById('buildingTrashBadge');
        const n = listTrashedBuildings().length;
        if (!badge) return;
        if (n > 0) {
            badge.textContent = String(n);
            badge.hidden = false;
        } else {
            badge.textContent = '';
            badge.hidden = true;
        }
    };

    window.renderBuildingTrashModal = function() {
        const listEl = document.getElementById('buildingTrashList');
        const emptyEl = document.getElementById('buildingTrashEmpty');
        if (!listEl) return;
        const items = listTrashedBuildings();
        if (typeof window.updateBuildingTrashBadge === 'function') window.updateBuildingTrashBadge();
        if (!items.length) {
            listEl.innerHTML = '';
            if (emptyEl) emptyEl.hidden = false;
            return;
        }
        if (emptyEl) emptyEl.hidden = true;
        listEl.innerHTML = items.map((b) => {
            const name = escapeHtml((b.name || '건물').replace(/^🏢\s*/, ''));
            const site = escapeHtml(getBuildingSiteName(b));
            const round = escapeHtml(formatSurveyRoundLabel(getBuildingSurveyRoundKey(b)));
            const when = escapeHtml(String(b.trashedAt || '').slice(0, 10));
            const remain = escapeHtml(formatBuildingTrashRemaining(b));
            const id = escapeHtml(b.id);
            return `<div class="building-trash-item" data-id="${id}">
                <div class="building-trash-item-main">
                    <div class="building-trash-item-title">${name}</div>
                    <div class="building-trash-item-meta">${site} · ${round} · 삭제 ${when} · ${remain}</div>
                </div>
                <div class="building-trash-item-actions">
                    <button type="button" class="btn btn-sm btn-primary" data-trash-action="restore" data-id="${id}">
                        <i class="fa-solid fa-rotate-left"></i> 복원
                    </button>
                    <button type="button" class="btn btn-sm btn-danger-outline" data-trash-action="purge" data-id="${id}">
                        <i class="fa-solid fa-trash"></i> 영구 삭제
                    </button>
                </div>
            </div>`;
        }).join('');
        listEl.querySelectorAll('[data-trash-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const action = btn.getAttribute('data-trash-action');
                const bldg = (window.state.buildings || []).find((b) => b && b.id === id);
                if (!bldg) return;
                if (action === 'restore') {
                    window.restoreBuildingFromTrash(id);
                    return;
                }
                if (action === 'purge') {
                    if (!await window.confirmDelete(`'${bldg.name}'을(를) 영구 삭제할까요?\n도면·결함·첨부파일이 삭제되며 복구할 수 없습니다.`)) return;
                    await window.permanentlyDeleteBuilding(bldg);
                    window.renderBuildingTrashModal();
                }
            });
        });
    };

    window.openBuildingTrashModal = function() {
        if (typeof window.purgeExpiredBuildingTrash === 'function') {
            window.purgeExpiredBuildingTrash().finally(() => {
                window.renderBuildingTrashModal();
                const modal = document.getElementById('buildingTrashModal');
                if (modal) modal.classList.add('open');
            });
            return;
        }
        window.renderBuildingTrashModal();
        const modal = document.getElementById('buildingTrashModal');
        if (modal) modal.classList.add('open');
    };

    window.closeBuildingTrashModal = function() {
        const modal = document.getElementById('buildingTrashModal');
        if (modal) modal.classList.remove('open');
    };

    function purgeLocalStateForDeletedBuilding(buildingId) {
        if (!buildingId) return;
        Object.keys(window.state.defects || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.defects[k];
        });
        Object.keys(window.state.deletedDefectIds || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.deletedDefectIds[k];
        });
        Object.keys(window.state.deletedDefectAt || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.deletedDefectAt[k];
        });
        Object.keys(window.state.ndtData || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.ndtData[k];
        });
        Object.keys(window.state.deletedNdtIds || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.deletedNdtIds[k];
        });
        Object.keys(window.state.deletedNdtAt || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.deletedNdtAt[k];
        });
        Object.keys(window.state.ndtDisplacementGroups || {}).forEach(k => {
            if (k.startsWith(`${buildingId}_`)) delete window.state.ndtDisplacementGroups[k];
        });
    }

    function formatDefectNoSeq(n) {
        return `NO.${String(Math.max(1, Number(n) || 1)).padStart(2, '0')}`;
    }

    function arrowSurveyNumberApi() {
        return (window.BSA && window.BSA.shared && window.BSA.shared.arrowSurveyNumber) || null;
    }

    function isUnnumberedArrowMarking(d) {
        const api = arrowSurveyNumberApi();
        return !!(api && api.isUnnumberedArrowMarking(d));
    }

    function canAssignSurveyNumberToDefect(d) {
        const api = arrowSurveyNumberApi();
        if (!api || !d) return false;
        const members = d.groupId ? getDefectMarkingGroupMembers(d.groupId) : [d];
        return api.canAssignSurveyNumber(d, members);
    }

        /** 본번호(N) 슬롯: 그룹·화살표 여러 개는 1칸, 결함표 추가(-1)는 본번호에 포함.
     * 삭제 후 빈 번호가 있으면 가장 작은 빈 칸을 재사용(max+1만 쓰지 않음). */
    function getNextDefectMainNumber(defects) {
        if (!Array.isArray(defects) || !defects.length) return 1;
        const seenGroup = new Set();
        const used = new Set();
        defects.forEach((d) => {
            if (!d || d.surveyExtra) return;
            if (d.groupId) {
                if (seenGroup.has(d.groupId)) return;
                seenGroup.add(d.groupId);
            }
            const raw = stripDefectNoSuffix(d.groupNo || d.no || '');
            const m = String(raw).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)/);
            const main = m ? parseInt(m[1], 10) : 0;
            if (main > 0) used.add(main);
        });
        let n = 1;
        while (used.has(n)) n += 1;
        return n;
    }

    function getNextDefectNoStr(defects) {
        return formatDefectNoSeq(getNextDefectMainNumber(defects));
    }

    /** 마킹 번호 풀: 일반 층은 해당 층만. 외부(EXT / EXT_1·EXT_2·입면)는 표가 하나이므로
     * 모든 외부 도면 마킹을 한 번호 공간으로 본다(한 도면의 빈 번호 = 다른 외부 도면에 있음). */
    function getFloorDefectsForNumbering(floorKey) {
        const bldgId = state.currentBuildingId;
        let floorCode = state.currentFloor || '';
        if (bldgId && String(floorKey || '').startsWith(String(bldgId) + '_')) {
            floorCode = String(floorKey).slice(String(bldgId).length + 1) || floorCode;
        }
        const exterior = (typeof isExteriorFloorCode === 'function')
            ? isExteriorFloorCode(floorCode)
            : (typeof window !== 'undefined' && typeof window.isExteriorFloorCode === 'function' && window.isExteriorFloorCode(floorCode));
        if (bldgId && exterior) {
            const codes = new Set();
            const floors = (state.currentBuilding && state.currentBuilding.floorsList) || [];
            floors.forEach((f) => {
                if (!f || !f.floorCode) return;
                const ok = (typeof isExteriorFloorCode === 'function')
                    ? isExteriorFloorCode(f.floorCode)
                    : (typeof window !== 'undefined' && typeof window.isExteriorFloorCode === 'function' && window.isExteriorFloorCode(f.floorCode));
                if (ok) codes.add(f.floorCode);
            });
            Object.keys(state.defects || {}).forEach((k) => {
                if (!String(k).startsWith(String(bldgId) + '_')) return;
                const fc = String(k).slice(String(bldgId).length + 1);
                const ok = (typeof isExteriorFloorCode === 'function')
                    ? isExteriorFloorCode(fc)
                    : (typeof window !== 'undefined' && typeof window.isExteriorFloorCode === 'function' && window.isExteriorFloorCode(fc));
                if (ok) codes.add(fc);
            });
            const combined = [];
            const seen = new Set();
            codes.forEach((fc) => {
                const key = bldgId + '_' + fc;
                const arr = (state.defects && state.defects[key]) || [];
                if (!isDefectMarkingGroupPending()) {
                    normalizeFloorDefectGroupsInPlace(arr);
                }
                arr.forEach((d) => {
                    if (!d) return;
                    if (d.id != null) {
                        if (seen.has(d.id)) return;
                        seen.add(d.id);
                    }
                    combined.push(d);
                });
            });
            return combined;
        }
        const list = (state.defects && state.defects[floorKey]) || [];
        if (!isDefectMarkingGroupPending()) {
            normalizeFloorDefectGroupsInPlace(list);
        }
        return list;
    }

    function parseDefectNoParts(d) {
        const raw = String((d && d.no) || '').replace(/^NO\.?\s*/i, '').trim();
        const m = raw.match(/(\d+)(?:-(\d+))?/);
        return {
            main: m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER,
            suffix: m && m[2] ? parseInt(m[2], 10) : 0
        };
    }

    function parseDefectSortNoValue(d) {
        const p = parseDefectNoParts(d);
        if (p.main === Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
        return p.main * 1000 + p.suffix;
    }

    function stripDefectNoSuffix(no) {
        return String(no || '').replace(/-\d+$/, '');
    }

    function ensureDefectMarkingGroup(defect) {
        if (!defect) return defect;
        if (!defect.groupId) {
            defect.groupId = defect.id;
            defect.groupNo = stripDefectNoSuffix(defect.no || formatDefectNoSeq(1));
            // 동기화: 묶기·풀기는 groupUpdatedAt이 나중인 쪽을 따른다(sync-merge DEFECT_GROUP_FIELDS)
            defect.groupUpdatedAt = bsaStampAfter(defect.groupUpdatedAt);
            // 멤버가 1개일 때는 접미사 없음. 2개 이상일 때만 -1,-2 (normalizeDefectGroupNos)
            defect.no = defect.groupNo;
        } else if (!defect.groupNo) {
            defect.groupNo = stripDefectNoSuffix(defect.no || '');
        }
        return defect;
    }

    /** 화살표=본번호 N. 결함표 있으면 N-2,N-3… (목록·탭의 41-1은 마킹 대표 슬롯) */
    function applyDefectGroupNumbering(members, base, assignNo) {
        const marking = (members || []).filter((m) => m && !m.surveyExtra);
        const extras = (members || []).filter((m) => m && m.surveyExtra);
        const total = marking.length + extras.length;
        if (total <= 1) {
            const only = marking[0] || extras[0];
            if (only) assignNo(only, only.surveyExtra ? `${base}-1` : base);
            return;
        }
        marking.forEach((m) => assignNo(m, base));
        extras.forEach((m, idx) => {
            assignNo(m, `${base}-${marking.length > 0 ? idx + 2 : idx + 1}`);
        });
    }

    /** 그룹 멤버 번호: 화살표=본번호 N, 결함표=N-2… (표시 41-1은 마킹 대표 슬롯) */
    function normalizeDefectGroupNos(defects, groupId) {
        if (!Array.isArray(defects) || !groupId) return;
        const members = defects
            .filter((d) => d && d.groupId === groupId)
            .slice()
            .sort((a, b) => {
                const ae = a.surveyExtra ? 1 : 0;
                const be = b.surveyExtra ? 1 : 0;
                if (ae !== be) return ae - be;
                const na = parseDefectSortNoValue(a);
                const nb = parseDefectSortNoValue(b);
                if (na !== nb) return na - nb;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
        if (!members.length) return;
        const base = stripDefectNoSuffix(members[0].groupNo || members[0].no || formatDefectNoSeq(1));
        const assignNo = (m, nextNo) => {
            const prev = String(m.no || '');
            m.groupNo = base;
            m.no = nextNo;
            // 번호만 당겨도 동기화에 반영되도록 updatedAt 갱신 (내용 변경 시각은 건드리지 않음)
            if (prev !== String(nextNo || '')) {
                m.updatedAt = Date.now();
            }
        };
        applyDefectGroupNumbering(members, base, assignNo);
    }

    function normalizeAllDefectGroupNos(defects) {
        if (!Array.isArray(defects)) return;
        const gids = new Set();
        defects.forEach((d) => {
            if (d && d.groupId) gids.add(d.groupId);
        });
        gids.forEach((gid) => normalizeDefectGroupNos(defects, gid));
        // 그룹 없이 no만 N-1 인 고아 싱글톤도 접미사 제거
        const byMain = new Map();
        defects.forEach((d) => {
            if (!d || d.groupId) return;
            const p = parseDefectNoParts(d);
            if (p.main === Number.MAX_SAFE_INTEGER) return;
            if (!byMain.has(p.main)) byMain.set(p.main, []);
            byMain.get(p.main).push(d);
        });
        byMain.forEach((list) => {
            if (list.length !== 1) return;
            const d = list[0];
            if (parseDefectNoParts(d).suffix === 1) {
                d.no = stripDefectNoSuffix(d.no);
            }
        });
    }

    /** 예전 데이터: 본번호 38 + 38-2·38-3 화살표가 groupId 없이 쪼개진 경우 한 그룹으로 복구 */
    function repairLegacyMarkingSuffixGroups(defects) {
        if (!Array.isArray(defects)) return false;
        let changed = false;
        const byMain = new Map();
        defects.forEach((d) => {
            if (!d || d.surveyExtra || d.groupId) return;
            const p = parseDefectNoParts(d);
            if (p.main === Number.MAX_SAFE_INTEGER) return;
            const key = String(p.main);
            if (!byMain.has(key)) byMain.set(key, []);
            byMain.get(key).push(d);
        });
        byMain.forEach((list) => {
            if (list.length <= 1) return;
            const hasSuffix = list.some((d) => parseDefectNoParts(d).suffix > 0);
            if (!hasSuffix) return;
            const baseDef = list.find((d) => !parseDefectNoParts(d).suffix)
                || list.slice().sort((a, b) => parseDefectSortNoValue(a) - parseDefectSortNoValue(b))[0];
            if (!baseDef) return;
            const gid = baseDef.id;
            const gno = stripDefectNoSuffix(baseDef.groupNo || baseDef.no || formatDefectNoSeq(parseDefectNoParts(baseDef).main));
            list.forEach((d) => {
                if (d.groupId === gid && d.groupNo === gno && d.no === gno) return;
                d.groupId = gid;
                d.groupNo = gno;
                d.no = gno;
                changed = true;
            });
        });
        return changed;
    }

    function normalizeFloorDefectGroupsInPlace(defects) {
        if (!Array.isArray(defects)) return false;
        // 고치기 전 판에서 통합 해제한 마킹이 동기화로 다시 묶인 것 복구(defect-merge.js)
        const mergeApiRepair = (window.BSA && window.BSA.shared && window.BSA.shared.defectMerge) || null;
        const remergeFixed = mergeApiRepair && typeof mergeApiRepair.repairStaleRemergedArrows === 'function'
            ? mergeApiRepair.repairStaleRemergedArrows(defects, { formatNo: formatDefectNoSeq }).length > 0
            : false;
        const repaired = repairLegacyMarkingSuffixGroups(defects) || remergeFixed;
        const snap = defects.map((d) => (d ? `${d.id}|${d.groupId || ''}|${d.no || ''}|${d.surveyExtra ? 1 : 0}` : '')).join(';');
        normalizeAllDefectGroupNos(defects);
        const snap2 = defects.map((d) => (d ? `${d.id}|${d.groupId || ''}|${d.no || ''}|${d.surveyExtra ? 1 : 0}` : '')).join(';');
        return repaired || snap !== snap2;
    }

    /** 사용자 작업으로 묶음이 풀린 결함에 소속 변경 시각(동기화에서 서버의 옛 groupId가 되살아나지 않게) */
    function stampDefectsLeftGroup(defects, groupId, idsBefore) {
        if (!Array.isArray(defects) || !groupId || !idsBefore) return;
        const now = bsaSyncNow();
        defects.forEach((d) => {
            if (d && idsBefore.has(d.id) && d.groupId !== groupId) {
                d.groupUpdatedAt = Math.max(now, (Number(d.groupUpdatedAt) || 0) + 1);
                d.updatedAt = Math.max(Number(d.updatedAt) || 0, now);
            }
        });
    }

    function collapseSingletonDefectGroups(defects) {
        if (!Array.isArray(defects)) return;
        if (isDefectMarkingGroupPending()) return;
        const byG = new Map();
        defects.forEach((d) => {
            if (!d || !d.groupId) return;
            if (!byG.has(d.groupId)) byG.set(d.groupId, []);
            byG.get(d.groupId).push(d);
        });
        byG.forEach((members) => {
            if (members.length !== 1) return;
            const d = members[0];
            d.no = stripDefectNoSuffix(d.groupNo || d.no);
            delete d.groupId;
            delete d.groupNo;
            delete d.surveyExtra;
            if (d.surveyNumbered === false) delete d.surveyNumbered;
        });
        normalizeAllDefectGroupNos(defects);
    }

    /** 위치추가 체인 중에는 멤버 1개 그룹을 접지 않는다 */
    function isDefectMarkingGroupPending() {
        return !!(window._defectMarkingTemplate || window._pendingMarkingGroup);
    }

    function syncDefectGroupNosForFloor(floorKey) {
        if (!floorKey || !state.defects?.[floorKey]) return;
        if (isDefectMarkingGroupPending()) {
            normalizeAllDefectGroupNos(state.defects[floorKey]);
        } else {
            if (normalizeFloorDefectGroupsInPlace(state.defects[floorKey])) {
                saveStateToLocalStorage();
            }
            collapseSingletonDefectGroups(state.defects[floorKey]);
        }
    }

    /** 7자리 hex 고유 코드. 활성·삭제 tombstone 코드는 재사용하지 않음 */
    function generateDefectUniqueId(floorKey) {
        ensureSyncMetaState();
        const used = new Set();
        (window.state.defects?.[floorKey] || []).forEach((d) => {
            if (d?.id) used.add(String(d.id));
        });
        (window.state.deletedDefectIds?.[floorKey] || []).forEach((id) => used.add(String(id)));
        for (let attempt = 0; attempt < 80; attempt++) {
            const bytes = new Uint8Array(4);
            (window.crypto || crypto).getRandomValues(bytes);
            const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 7);
            if (hex && !used.has(hex)) return hex;
        }
        return `x${Date.now().toString(36).slice(-6)}`;
    }

    /**
     * 층 결함 표시번호 연속 재부여.
     * preserveOrder=true 이면 배열 순서 유지(동기화: 서버 순서 + 로컬 신규 뒤).
     * false 이면 기존 no 기준 정렬 후 당김(로컬 삭제 직후).
     */
    function renumberFloorDefects(defects, options) {
        const preserveOrder = !!(options && options.preserveOrder);
        if (!Array.isArray(defects)) return defects;
        const ordered = preserveOrder
            ? defects.slice()
            : defects.slice().sort((a, b) => {
                const na = parseDefectSortNoValue(a);
                const nb = parseDefectSortNoValue(b);
                if (na !== nb) return na - nb;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });

        // 동기화 병합(preserveOrder): 번호는 절대 다시 매기지 않는다.
        // (빈칸 땡기기·CAD 원본·수동 번호가 서버 스냅샷/재부여에 덮이지 않게)
        if (preserveOrder) {
            defects.length = 0;
            ordered.forEach((d) => { if (d) defects.push(d); });
            return defects;
        }
        // CAD 원본 번호는 보존하되, 수동 추가 결함은 CAD 최대 본번호 다음부터 이어간다.
        // (예전: seq=0부터라 CAD 100개 뒤 신규가 잠깐 NO.101이었다가 재부여 때 NO.01로 덮임)
        let seq = 0;
        ordered.forEach((d) => {
            if (!d || !d.isCadImported || d.surveyExtra) return;
            const raw = stripDefectNoSuffix(d.groupNo || d.cadNo || d.no || '');
            const m = String(raw).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)/);
            const main = m ? parseInt(m[1], 10) : 0;
            if (main > seq) seq = main;
        });
        const groupBase = new Map();
        const seenGroup = new Set();

        ordered.forEach((d) => {
            if (!d) return;
            // 캐드에서 가져온 결함(isCadImported)은 원본 번호를 그대로 보존한다.
            // 여기서 건드리면(동기화 병합 때마다 이 함수가 호출됨) NO.20 같은 원본 번호가
            // 병합 순서 기준 NO.01, NO.02...로 매번 덮어써져 버린다.
            if (d.isCadImported) return;
            const gid = d.groupId || null;
            if (gid) {
                if (seenGroup.has(gid)) return;
                seenGroup.add(gid);
                seq += 1;
                groupBase.set(gid, seq);
                const baseStr = formatDefectNoSeq(seq);
                const members = ordered
                    .filter((m) => m && m.groupId === gid)
                    .slice()
                    .sort((a, b) => {
                        const na = parseDefectSortNoValue(a);
                        const nb = parseDefectSortNoValue(b);
                        if (na !== nb) return na - nb;
                        return String(a.id || '').localeCompare(String(b.id || ''));
                    });
                members.forEach((m) => { m.groupNo = baseStr; });
                applyDefectGroupNumbering(members, baseStr, (m, nextNo) => { m.no = nextNo; });
            } else {
                seq += 1;
                d.no = formatDefectNoSeq(seq);
                if (d.groupNo) delete d.groupNo;
            }
        });

        defects.length = 0;
        ordered.forEach((d) => { if (d) defects.push(d); });
        return defects;
    }

    
    /**
     * 마킹번호 빈 칸 땡기기: 1..max 중 가장 작은 빈 번호로
     * 가장 큰 메인 번호를 옮기며 1부터 연속이 될 때까지 반복.
     * (1번을 지워 2,3,4만 남은 경우 → 끝번호가 1로 당겨짐)
     * CAD 가져오기 번호(isCadImported)도 포함. 그룹은 메인 1개로 취급.
     * @returns {{ moved: number, before: string, after: string }|null}
     */
    /**
     * 2026-10-20 「빈칸 당기기 후 도면 번호가 옛 번호」: 번호(no)는 updatedAt으로, 박스 번호(groupNo)는
     * 소속 시각(groupUpdatedAt)으로 병합되는데 예전엔 groupUpdatedAt을 안 올려 동기화 때 서버의 옛 groupNo가 이겼다.
     * 도면 라벨은 groupNo를, 표는 no를 써서 표만 새 번호·도면은 옛 번호가 됐다.
     */
    function stampDefectNumberChanged(d, groupNoChanged) {
        if (!d) return;
        const stamp = (typeof bsaStampAfter === 'function') ? bsaStampAfter : ((p) => Math.max(Date.now(), (Number(p) || 0) + 1));
        d.updatedAt = stamp(Math.max(Number(d.updatedAt) || 0, Number(d.fieldAtThrough) || 0));
        d.contentUpdatedAt = Math.max(d.updatedAt, (Number(d.contentUpdatedAt) || 0) + 1);
        if (groupNoChanged || d.groupId || d.groupNo) d.groupUpdatedAt = stamp(d.groupUpdatedAt);
        d._numberChanged = true;
    }

    /** 묶음의 박스 번호(groupNo)가 마킹 번호(no)와 어긋난 것(예전 동기화로 옛 groupNo가 남음)을 no 기준으로 맞춘다 */
    function healStaleDefectGroupNos(defects) {
        let healed = 0;
        const byGroup = new Map();
        (defects || []).forEach((d) => {
            if (!d) return;
            if (!d.groupId) {
                if (d.groupNo && d.no && !d.surveyExtra && stripDefectNoSuffix(d.no) !== d.groupNo) {
                    d.groupNo = stripDefectNoSuffix(d.no);
                    stampDefectNumberChanged(d, true);
                    healed++;
                }
                return;
            }
            if (!byGroup.has(d.groupId)) byGroup.set(d.groupId, []);
            byGroup.get(d.groupId).push(d);
        });
        byGroup.forEach((members) => {
            const marking = members.filter((m) => !m.surveyExtra && m.no);
            if (!marking.length) return;
            const bases = new Set(marking.map((m) => stripDefectNoSuffix(m.no)));
            if (bases.size !== 1) return;
            const base = Array.from(bases)[0];
            if (!base || members.every((m) => m.groupNo === base)) return;
            members.forEach((m) => {
                if (m.groupNo !== base) { m.groupNo = base; stampDefectNumberChanged(m, true); healed++; }
            });
        });
        return healed;
    }
    window.healStaleDefectGroupNos = healStaleDefectGroupNos;

    /** 빈 마킹 번호(1..최대 중 없는 메인 번호) */
    function findDefectMarkingNumberGaps(defects) {
        const mains = new Set();
        const seenGroup = new Set();
        (defects || []).forEach((d) => {
            if (!d || d.surveyExtra) return;
            if (d.groupId) { if (seenGroup.has(d.groupId)) return; seenGroup.add(d.groupId); }
            const raw = stripDefectNoSuffix(d.groupNo || d.no || '');
            const m = String(raw).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)/);
            const n = m ? parseInt(m[1], 10) : 0;
            if (n > 0) mains.add(n);
        });
        if (!mains.size) return [];
        const max = Math.max.apply(null, Array.from(mains));
        const gaps = [];
        for (let n = 1; n <= max && gaps.length < 200; n++) if (!mains.has(n)) gaps.push(n);
        return gaps;
    }
    window.findDefectMarkingNumberGaps = findDefectMarkingNumberGaps;

    function compactDefectMarkingNumberGaps(defects) {
        if (!Array.isArray(defects) || !defects.length) return null;
        const healedGroupNos = healStaleDefectGroupNos(defects);

        const getMain = (d) => {
            const raw = stripDefectNoSuffix(d.groupNo || d.no || '');
            const m = String(raw).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
        };

        const buildUnits = () => {
            const units = [];
            const seenGroup = new Set();
            defects.forEach((d) => {
                if (!d || d.surveyExtra) return;
                const gid = d.groupId || null;
                if (gid) {
                    if (seenGroup.has(gid)) return;
                    seenGroup.add(gid);
                    const members = defects.filter((m) => m && m.groupId === gid);
                    units.push({ kind: 'group', groupId: gid, main: getMain(d), members });
                } else {
                    units.push({ kind: 'single', id: d.id, main: getMain(d), defect: d });
                }
            });
            return units.filter((u) => u.main > 0);
        };

        let units = buildUnits();
        if (!units.length) return null;

        const mainsBefore = units.map((u) => u.main).sort((a, b) => a - b);
        const beforeStr = mainsBefore.join(', ');

        // 2026-10-23 끝(가장 큰) 번호를 가장 작은 빈 번호로 옮기기를 빈 칸이 없어질 때까지 한 번에 반복한다
        // (묶음은 -2·-3 하위 번호와 함께 이동). 직후 동기화로 빈 칸이 되살아나면 scheduleCompactGapsRecheck가 다시 당긴다.
        let moved = 0;
        const maxSteps = units.length * 4 + 40;
        for (let step = 0; step < maxSteps; step++) {
            units = buildUnits();
            if (!units.length) break;
            const mains = [...new Set(units.map((u) => u.main))].sort((a, b) => a - b);
            const maxM = mains[mains.length - 1];
            let gap = null;
            for (let n = 1; n <= maxM; n++) {
                if (!mains.includes(n)) { gap = n; break; }
            }
            if (gap == null) break;
            const topMain = maxM;
            const candidates = units.filter((u) => u.main === topMain);
            if (!candidates.length || topMain <= gap) break;
            candidates.sort((a, b) => {
                const ka = a.groupId || a.id || '';
                const kb = b.groupId || b.id || '';
                return String(kb).localeCompare(String(ka));
            });
            const victim = candidates[0];
            const baseStr = formatDefectNoSeq(gap);
            if (victim.kind === 'group') {
                victim.members.forEach((m) => {
                    const prevG = String(m.groupNo || '');
                    m.groupNo = baseStr;
                    if (prevG !== baseStr) stampDefectNumberChanged(m, true);
                });
                applyDefectGroupNumbering(victim.members, baseStr, (m, nextNo) => {
                    const prev = String(m.no || '');
                    m.no = nextNo;
                    if (m.isCadImported) m.cadNo = nextNo;
                    if (prev !== String(nextNo || '')) stampDefectNumberChanged(m, false);
                });
            } else if (victim.defect) {
                const prev = String(victim.defect.no || '');
                const prevG = String(victim.defect.groupNo || '');
                victim.defect.no = baseStr;
                if (victim.defect.groupNo) victim.defect.groupNo = baseStr;
                if (victim.defect.isCadImported) victim.defect.cadNo = baseStr;
                if (prev !== baseStr || (prevG && prevG !== baseStr)) stampDefectNumberChanged(victim.defect, !!(prevG && prevG !== baseStr));
            }
            moved += 1;
        }

        units = buildUnits();
        const afterStr = units.map((u) => u.main).sort((a, b) => a - b).join(', ');
        if (!moved) return { moved: 0, before: beforeStr, after: afterStr, healed: healedGroupNos };
        return { moved, before: beforeStr, after: afterStr, healed: healedGroupNos };
    }

    window.compactDefectMarkingNumberGaps = compactDefectMarkingNumberGaps;

    /**
     * 결함 내용 칸의 직전 값(해시) — touchDefectUpdatedAt이 비교해 **바뀐 칸만** fieldAt에 시각을 찍는다
     * (칸 단위 병합, 2026-09-29, sync-merge.js). 기기 메모리에만 두고 서버에 안 올린다.
     * 앱을 켤 때·동기화로 결함이 바뀔 때 채운다(seedDefectContentSnaps). 없으면(새 결함 등) 무엇이 바뀌었는지
     * 모르므로 모든 칸이 지금 바뀐 것으로 본다(contentBaseAt = 지금).
     */
    function defectContentSnap() {
        if (!window.__bsaDefectContentSnap) window.__bsaDefectContentSnap = new Map();
        return window.__bsaDefectContentSnap;
    }

    function seedDefectContentSnaps(defectsMap, onlyKeys) {
        const sm = window.BSA && window.BSA.syncMerge;
        if (!sm || typeof sm.defectContentHashes !== 'function') return;
        const keys = onlyKeys ? Array.from(onlyKeys) : Object.keys(defectsMap || {});
        keys.forEach((k) => {
            ((defectsMap || {})[k] || []).forEach((d) => {
                if (d && d.id) defectContentSnap().set(d.id, sm.defectContentHashes(d));
            });
        });
    }

    // ---- 2026-10-16 동기화 시각: 서버 시계 보정(offset) + 늘 앞으로만(Math.max(지금, 이전+1)) ----
    // 시계가 늦은 기기가 나중에 고쳐도 시각이 작게 찍혀 병합에서 지던 문제(위치·칸·사진·소속 시각).
    try { window.__bsaClockOffsetMs = Number(localStorage.getItem('bsaClockOffsetMs')) || 0; } catch (_e) { window.__bsaClockOffsetMs = 0; }
    function bsaSyncNow() {
        return Date.now() + (Number(window.__bsaClockOffsetMs) || 0);
    }
    function bsaStampAfter(prev) {
        return Math.max(bsaSyncNow(), (Number(prev) || 0) + 1);
    }
    window.bsaSyncNow = bsaSyncNow;
    window.bsaStampAfter = bsaStampAfter;
    let _bsaClockMeasuredAt = 0;
    // 2026-11-10 기기 날짜가 서버와 1일 넘게 다르면(보정 범위 밖) 예전엔 그냥 무시하고 그대로 동기화했다 — 그 기기의 수정·삭제 시각이
    // 「가장 나중」으로 찍혀 다른 사람 수정을 계속 이기고(늦은 날짜면 계속 밀리고), 휴지통 30일 만료도 틀리게 계산된다.
    // 이제 그 차이를 기억해 두고(__bsaClockBadMs) 동기화 쓰기·휴지통 자동 삭제를 멈춘 뒤 날짜를 맞추라고 안내한다. 맞추면 저절로 풀린다.
    const BSA_CLOCK_MAX_OFFSET_MS = 24 * 3600 * 1000;   // 처음엔 7일(옛 보정 한계)이었다가 같은 날 1일로 좁힘 — 하루 넘게 틀리면 자동 시간이 꺼진 기기
    window.__bsaClockBadMs = 0;
    // 'unknown' 아직 안 잼 · 'ok' · 'bad' 1일 넘게 다름 · 'fail' 이번에 못 잼(다음에 다시) · 'na' 잴 수 없는 환경(파일로 연 개발 화면 등)
    let _bsaClockStatus = 'unknown';
    let _bsaClockBadLogged = false;
    let _bsaClockRecheckAt = 0;
    function bsaClockStatus() { return _bsaClockStatus; }
    window.bsaClockStatus = bsaClockStatus;
    /** 잰 차이(ms, 서버 − 기기) 분류. slow: 응답이 느려 정밀 보정엔 못 쓰는 값(그래도 1일 넘는 차이는 판정한다) */
    function classifyClockOffset(off, slow) {
        const n = Number(off);
        if (!Number.isFinite(n)) return { status: 'fail', offset: 0, badMs: 0 };
        if (Math.abs(n) > BSA_CLOCK_MAX_OFFSET_MS) return { status: 'bad', offset: 0, badMs: Math.round(n) };
        if (slow) return { status: 'fail', offset: 0, badMs: 0 };
        return { status: 'ok', offset: Math.abs(n) < 2000 ? 0 : Math.round(n), badMs: 0 };   // 2초 안쪽은 보정 안 함(흔들림)
    }
    /** 못 쟀을 때: 이미 「틀림」으로 판정된 기기는 다시 재서 맞다고 나올 때까지 그대로 둔다 */
    function noteClockMeasureFailed(status) {
        if (_bsaClockStatus !== 'bad') _bsaClockStatus = status || 'fail';
    }
    function renderClockBadBanner(show) {
        if (typeof document === 'undefined' || !document.body) return;
        let bar = document.getElementById('bsaClockBadBanner');
        if (!show) { if (bar) bar.remove(); return; }
        const badMs = Number(window.__bsaClockBadMs) || 0;
        const days = Math.max(1, Math.round(Math.abs(badMs) / (24 * 3600 * 1000)));
        const text = '이 기기 날짜가 실제보다 약 ' + days + '일 ' + (badMs < 0 ? '앞서' : '늦어') + ' 있습니다. '
            + '<b>기기 설정에서 날짜·시간을 맞춰 주세요 — 맞출 때까지 클라우드 동기화를 멈춥니다.</b> '
            + '작업한 내용은 이 기기에 저장돼 있어요.';
        if (bar) { const span = bar.querySelector('.bsa-outdated-banner-text'); if (span) span.innerHTML = text; return; }
        bar = document.createElement('div');
        bar.id = 'bsaClockBadBanner';
        bar.className = 'bsa-outdated-banner bsa-clock-bad-banner';
        bar.setAttribute('role', 'alert');
        bar.innerHTML = '<span class="bsa-outdated-banner-text">' + text + '</span>'
            + '<button type="button" class="btn btn-sm bsa-outdated-banner-btn">날짜 맞췄어요</button>';
        bar.querySelector('button').addEventListener('click', async () => {
            try { await measureServerClockOffset(true); } catch (_e) { /* ignore */ }
            if (_bsaClockStatus === 'bad') {
                if (typeof window.showToast === 'function') window.showToast('아직 날짜가 맞지 않습니다. 기기 설정의 날짜·시간을 확인해 주세요.', 'warning', 5000);
                return;
            }
            if (typeof window.showToast === 'function') window.showToast('날짜가 확인됐습니다. 동기화를 다시 시작합니다.', 'success', 3500);
            try { if (typeof syncStateToFirebase === 'function') syncStateToFirebase(); } catch (_e) { /* ignore */ }
        });
        document.body.appendChild(bar);
    }
    /** 서버(배포 호스트) 응답 Date 머리말로 이 기기 시계 차이를 잰다. 10분에 한 번, 실패·느린 응답은 무시 */
    async function measureServerClockOffset(force) {
        // Math.abs: 기기 날짜를 뒤로 고치면 「지난 시간」이 음수가 된다 — 그래도 다시 재게
        if (!force && Math.abs(Date.now() - _bsaClockMeasuredAt) < 10 * 60 * 1000) return null;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
        if (typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) { noteClockMeasureFailed('na'); return null; }
        _bsaClockMeasuredAt = Date.now();
        try {
            const t0 = Date.now();
            const r = await fetch('web-version.json?clock=' + t0, { method: 'HEAD', cache: 'no-store' });
            const t1 = Date.now();
            const hd = r && r.headers && r.headers.get('Date');
            // 응답은 왔는데 Date 머리말이 없는 호스트는 잴 수 없는 환경, 응답 자체가 실패면 다음에 다시
            if (!hd) { noteClockMeasureFailed(r && r.ok ? 'na' : 'fail'); return null; }
            const srv = Date.parse(hd);
            if (!Number.isFinite(srv)) { noteClockMeasureFailed('fail'); return null; }
            const c = classifyClockOffset((srv + 500) - (t0 + t1) / 2, t1 - t0 > 3000);   // Date 머리말은 초 단위 → 가운데 값
            if (c.status === 'bad') {
                _bsaClockStatus = 'bad';
                window.__bsaClockBadMs = c.badMs;
                console.warn('[시계] 기기 날짜가 서버와 1일 넘게 다릅니다 — 클라우드 동기화를 멈춥니다', c.badMs, 'ms');
                renderClockBadBanner(true);
                if (!_bsaClockBadLogged) {
                    _bsaClockBadLogged = true;
                    try {
                        const el = window.BSA && window.BSA.errorLog;
                        if (el && typeof el.record === 'function') el.record({ kind: 'clock-bad', message: '기기 날짜가 서버와 ' + Math.round(c.badMs / 86400000) + '일 다름(서버−기기) — 동기화·휴지통 자동 삭제 멈춤', source: 'measureServerClockOffset' });
                    } catch (_e) { /* ignore */ }
                }
                return null;
            }
            if (c.status !== 'ok') { noteClockMeasureFailed('fail'); return null; }
            const wasBad = _bsaClockStatus === 'bad';
            _bsaClockStatus = 'ok';
            window.__bsaClockBadMs = 0;
            if (wasBad) renderClockBadBanner(false);
            const off = c.offset;
            window.__bsaClockOffsetMs = off;
            try { localStorage.setItem('bsaClockOffsetMs', String(window.__bsaClockOffsetMs)); } catch (_e) { /* ignore */ }
            if (off) console.info('[시계] 서버와 차이 보정', off, 'ms');
            return off;
        } catch (_e) {
            noteClockMeasureFailed('fail');
            return null;
        }
    }
    window.measureServerClockOffset = measureServerClockOffset;

    /**
     * 동기화 쓰기 전: 이 기기 날짜가 크게 틀렸는가. 이번 실행에서 아직 한 번도 못 쟀으면 한 번 재고(최대 4초),
     * 「틀림」이던 기기는 30초에 한 번 다시 잰다(날짜를 맞추면 저절로 풀리게). 못 재면 막지 않는다(예전과 같음).
     */
    async function isDeviceClockBadForSync() {
        const due = _bsaClockStatus === 'unknown'
            || (_bsaClockStatus === 'bad' && Math.abs(Date.now() - _bsaClockRecheckAt) > 30 * 1000);
        if (due) {
            _bsaClockRecheckAt = Date.now();
            try {
                await Promise.race([measureServerClockOffset(true), new Promise((res) => setTimeout(res, 4000))]);
            } catch (_e) { /* ignore */ }
            if (_bsaClockStatus === 'unknown') _bsaClockStatus = 'fail';   // 느린 망에서 동기화마다 4초씩 기다리지 않게
        }
        if (_bsaClockStatus === 'bad') renderClockBadBanner(true);
        return _bsaClockStatus === 'bad';
    }
    window.isDeviceClockBadForSync = isDeviceClockBadForSync;

    /** 휴지통 자동 영구 삭제 직전: 지금 서버 시계로 다시 확인. 확인됐거나(ok) 잴 수 없는 환경(na)일 때만 진행 */
    async function checkClockBeforePurge() {
        try {
            await Promise.race([measureServerClockOffset(true), new Promise((res) => setTimeout(res, 5000))]);
        } catch (_e) { /* ignore */ }
        const status = _bsaClockStatus;
        return { ok: status === 'ok' || status === 'na', status: status };
    }

    function isEditingOffline() {
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
            if (typeof isSyncParked === 'function' && isSyncParked()) return true;
        } catch (_e) { /* ignore */ }
        return false;
    }

    function touchDefectUpdatedAt(defect) {
        if (!defect) return;
        const now = bsaStampAfter(Math.max(Number(defect.updatedAt) || 0, Number(defect.fieldAtThrough) || 0));
        // 2026-10-19 진행률: 내용 칸이 실제로 바뀐 것만 「결함 내용 수정」(사진만 넣은 것은 사진으로 따로 셈)
        let journalContentChanged = true;
        const sm = window.BSA && window.BSA.syncMerge;
        if (sm && typeof sm.changedContentFields === 'function' && defect.id) {
            const prevContentTs = Number(defect.contentUpdatedAt) || Number(defect.updatedAt) || 0;
            const snap = defectContentSnap().get(defect.id);
            const diff = sm.changedContentFields(snap || {}, defect);
            journalContentChanged = !snap || diff.changed.length > 0;
            if (snap) {
                if (diff.changed.length) {
                    if (!defect.fieldAt || typeof defect.fieldAt !== 'object') {
                        defect.fieldAt = {};
                        // 칸별 기록 시작 전 모든 칸의 시각 = 지금까지의 내용 수정 시각
                        if (defect.contentBaseAt == null) defect.contentBaseAt = prevContentTs;
                    }
                    diff.changed.forEach((k) => { defect.fieldAt[k] = Math.max(now, (Number(defect.fieldAt[k]) || 0) + 1); });
                }
            } else {
                // 무엇이 바뀌었는지 모름 — 모든 칸을 지금 바뀐 것으로(예전 통째 병합과 같은 결과)
                defect.fieldAt = {};
                defect.contentBaseAt = now;
            }
            defectContentSnap().set(defect.id, diff.hashes);
            if (defect.fieldAt && typeof defect.fieldAt === 'object') defect.fieldAtThrough = now;
        }
        defect.updatedAt = now;
        // 내용·사진 변경 시각 — 삭제 부활 판정에 사용 (위치만 옮긴 경우는 제외).
        // 늘 앞으로만 간다: 시계가 빠른 기기가 찍은 값보다 작으면, 이 수정을 본 뒤 지운 것으로 오판된다.
        defect.contentUpdatedAt = Math.max(now, (Number(defect.contentUpdatedAt) || 0) + 1);
        if (journalContentChanged && typeof journalDefectChange === 'function') journalDefectChange('edit', defect);
        // 2026-10-21 오프라인(또는 서버에 닿지 않는 동안)에 고친 내용 — 올리기 전 다른 기기가 지웠어도 이 결함을 살린다.
        // 위치·배치만 옮긴 것은 여기 안 온다(touchDefectPositionUpdatedAt). 온라인 수정은 지금처럼 나중 삭제가 이긴다.
        if (journalContentChanged && typeof isEditingOffline === 'function' && isEditingOffline()) defect.offlineEditAt = defect.contentUpdatedAt;
    }

    /** 도면 위 마킹 위치/꼭짓점만 옮김 — 삭제보다 늦어도 부활시키지 않음 */
    function touchDefectPositionUpdatedAt(defect) {
        if (!defect) return;
        defect.positionUpdatedAt = bsaStampAfter(defect.positionUpdatedAt);
        if (typeof journalDefectChange === 'function') journalDefectChange('move', defect);
    }

    /**
     * 2026-10-16 행·열 칸 이름(gridLoc)을 「자동으로」 바꿨을 때 — 위치 갈래처럼 다룬다.
     * 칸 시각(fieldAt.gridLoc)만 찍고 내용 시각(contentUpdatedAt)은 그대로: 옮기기만 한 마킹이
     * 「수정」으로 잡혀 다른 기기에서 지운 마킹을 되살리던 문제. 손으로 고친 gridLoc은 touchDefectUpdatedAt(내용).
     */
    function touchDefectGridLocAuto(defect) {
        if (!defect) return;
        const prevContent = Number(defect.contentUpdatedAt) || Number(defect.updatedAt) || 0;
        if (!defect.fieldAt || typeof defect.fieldAt !== 'object') {
            defect.fieldAt = {};
            if (defect.contentBaseAt == null) defect.contentBaseAt = prevContent;
        }
        defect.fieldAt.gridLoc = bsaStampAfter(Math.max(Number(defect.fieldAt.gridLoc) || 0, prevContent));
        // 칸 기록이 이 시각까지 맞다(다른 칸은 contentBaseAt/fieldAt 그대로)
        defect.fieldAtThrough = Math.max(Number(defect.fieldAtThrough) || 0, prevContent);
        const sm = window.BSA && window.BSA.syncMerge;
        if (sm && typeof sm.defectContentHashes === 'function' && defect.id) {
            const snap = defectContentSnap().get(defect.id);
            if (snap) snap.gridLoc = sm.defectContentHashes({ gridLoc: defect.gridLoc }).gridLoc;
            else defectContentSnap().set(defect.id, sm.defectContentHashes(defect));
        }
    }

    // 늘 앞으로만 — touchDefectUpdatedAt의 contentUpdatedAt과 같은 이유(삭제 vs 수정 판정)
    function nextRecordStamp(rec) {
        return bsaStampAfter(rec && rec.updatedAt);
    }

    function touchNdtUpdatedAt(item) {
        if (item) item.updatedAt = nextRecordStamp(item);
        if (item && item.id && typeof journalRecord === 'function') journalRecord('ndt', item.id, journalCurrentFloorKey());
    }

    /**
     * 부동침하·부재처짐 측정 구역을 바꿨다 — 수정 시각을 올리고 이 층을 동기화 대상에 넣는다.
     *
     * 2026-09-21 감사: 지점 레벨 수정·기존 구역에 지점 추가·구역 정보 저장·측기 이동 보정·
     * 지점 끌어 옮기기가 updatedAt을 안 올렸다. 병합(mergeNdtRecord)은 시각이 같으면 기기 쪽이
     * 이겨서, 수정한 기기에서는 괜찮아도 **다른 기기가 동기화할 때 그 기기의 옛 값이 이겨**
     * 수정이 되돌아갈 수 있었다.
     */
    /**
     * 비파괴 핀을 도면에서 끌어 옮겼다 — 시각을 올리고 층을 동기화 대상에 넣는다.
     * (폼 저장만 touchNdtUpdatedAt을 불러서, 끌어 옮긴 위치는 다른 기기의 옛 위치에 질 수 있었다)
     * 여러 개를 함께 옮기면 선택된 항목·구역을 모두 올린다.
     */
    function touchMovedNdtItems(single) {
        const key = (state.currentBuildingId && state.currentFloor)
            ? `${state.currentBuildingId}_${state.currentFloor}`
            : '';
        if (single) {
            touchNdtUpdatedAt(single);
        } else if (key && typeof selectedNdtIds !== 'undefined' && selectedNdtIds && selectedNdtIds.size) {
            ((state.ndtData && state.ndtData[key]) || []).forEach((it) => {
                if (it && selectedNdtIds.has(it.id)) touchNdtUpdatedAt(it);
            });
            ((state.ndtDisplacementGroups && state.ndtDisplacementGroups[key]) || []).forEach((g) => {
                if (g && selectedNdtIds.has(g.id)) g.updatedAt = Date.now();
            });
        }
        if (key && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
    }

    function touchNdtDispGroup(group) {
        if (!group) return;
        group.updatedAt = nextRecordStamp(group);
        if (group.id && typeof journalRecord === 'function') journalRecord('ndt', group.id, journalCurrentFloorKey());
        const key = (state.currentBuildingId && state.currentFloor)
            ? `${state.currentBuildingId}_${state.currentFloor}`
            : '';
        if (key && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
    }

    function getRecordUpdatedAt(rec, kind) {
        return window.BSA.syncMerge.getRecordUpdatedAt(rec, kind);
    }

    function getDefectContentUpdatedAt(rec) {
        return window.BSA.syncMerge.getDefectContentUpdatedAt(rec);
    }

    function getDefectPositionUpdatedAt(rec) {
        return window.BSA.syncMerge.getDefectPositionUpdatedAt(rec);
    }

    /**
     * 묘비 값 — 지울 때 본 기록의 마지막 수정 시각(sync-merge tombstoneStampFor). 다른 사람이 그 뒤에
     * 고친 사본은 병합에서 살아난다(삭제 vs 수정 = 수정 우선, 2026-09-30).
     * rec: 지운 기록. 목록에서 이미 뺀 뒤 부르는 곳은 넘겨야 한다(안 넘기면 층에서 찾는다).
     * opts.wallClock: 지운 시각을 쓴다(예전 규칙 — 그 뒤 수정만 살림). 층 삭제·다른 층으로 옮김처럼
     *   "기록이 틀려서"가 아니라 자리를 치우는 삭제에 쓴다. 기록을 못 찾아도 이 규칙으로 떨어진다.
     */
    function tombstoneValue(rec, kind, opts) {
        if (!rec || (opts && opts.wallClock)) return Date.now();
        return window.BSA.syncMerge.tombstoneStampFor(rec, kind);
    }

    function trackDefectDeletion(floorKey, defectId, rec, opts) {
        if (!floorKey || !defectId) return;
        ensureSyncMetaState();
        if (!rec) rec = ((window.state.defects || {})[floorKey] || []).find((d) => d && d.id === defectId) || null;
        const set = new Set(window.state.deletedDefectIds[floorKey] || []);
        set.add(defectId);
        window.state.deletedDefectIds[floorKey] = Array.from(set);
        if (!window.state.deletedDefectAt[floorKey]) window.state.deletedDefectAt[floorKey] = {};
        window.state.deletedDefectAt[floorKey][defectId] = tombstoneValue(rec, 'pin', opts);
        if (typeof journalRecord === 'function') journalRecord('del', defectId, floorKey);
    }

    /**
     * 결함 삭제 묘비를 푼다. 결함을 다른 층으로 옮겼다가 되돌려 찍는 경우,
     * 예전에 남긴 묘비가 그대로면 병합이 그 결함을 다시 지워버린다.
     */
    function untrackDefectDeletion(floorKey, defectId) {
        if (!floorKey || !defectId) return;
        ensureSyncMetaState();
        const arr = window.state.deletedDefectIds[floorKey];
        if (Array.isArray(arr)) {
            const next = arr.filter((id) => id !== defectId);
            if (next.length) window.state.deletedDefectIds[floorKey] = next;
            else delete window.state.deletedDefectIds[floorKey];
        }
        const atMap = window.state.deletedDefectAt && window.state.deletedDefectAt[floorKey];
        if (atMap) {
            delete atMap[defectId];
            if (!Object.keys(atMap).length) delete window.state.deletedDefectAt[floorKey];
        }
    }

    // 비파괴 항목·부동침하/부재처짐 구역 공용 (묘비 값은 trackDefectDeletion 설명 참고)
    function trackNdtDeletion(floorKey, itemId, rec, opts) {
        if (!floorKey || !itemId) return;
        ensureSyncMetaState();
        if (!rec) {
            const find = (map) => ((map || {})[floorKey] || []).find((x) => x && x.id === itemId);
            rec = find(window.state.ndtData) || find(window.state.ndtDisplacementGroups) || null;
        }
        const set = new Set(window.state.deletedNdtIds[floorKey] || []);
        set.add(itemId);
        window.state.deletedNdtIds[floorKey] = Array.from(set);
        if (!window.state.deletedNdtAt[floorKey]) window.state.deletedNdtAt[floorKey] = {};
        window.state.deletedNdtAt[floorKey][itemId] = tombstoneValue(rec, 'ndt', opts);
        if (typeof journalRecord === 'function') journalRecord('ndt', itemId, floorKey);
    }

    /**
     * 비파괴 삭제 묘비를 푼다. 스냅샷에서 되살린 항목이 다음 동기화에서
     * 다시 지워지지 않게 한다. (결함 쪽 untrackDefectDeletion과 같은 역할)
     */
    function untrackNdtDeletion(floorKey, itemId) {
        if (!floorKey || !itemId) return;
        ensureSyncMetaState();
        const arr = window.state.deletedNdtIds[floorKey];
        if (Array.isArray(arr)) {
            const next = arr.filter((id) => id !== itemId);
            if (next.length) window.state.deletedNdtIds[floorKey] = next;
            else delete window.state.deletedNdtIds[floorKey];
        }
        const atMap = window.state.deletedNdtAt && window.state.deletedNdtAt[floorKey];
        if (atMap) {
            delete atMap[itemId];
            if (!Object.keys(atMap).length) delete window.state.deletedNdtAt[floorKey];
        }
    }

    function mergeDeletedIdsMaps(serverMap, localMap) {
        return window.BSA.syncMerge.mergeDeletedIdsMaps(serverMap, localMap);
    }

    function mergeDeletedAtMaps(serverMap, localMap) {
        return window.BSA.syncMerge.mergeDeletedAtMaps(serverMap, localMap);
    }

    function recordSurvivesDelete(rec, deletedAt, kind) {
        return window.BSA.syncMerge.recordSurvivesDelete(rec, deletedAt, kind);
    }

    function mergePhotoArrays(primaryArr, secondaryArr) {
        return window.BSA.syncMerge.mergePhotoArrays(primaryArr, secondaryArr);
    }

    function collectPhotoSrcById(ids, photos, urls) {
        return window.BSA.syncMerge.collectPhotoSrcById(ids, photos, urls, window._photoCache);
    }

    function alignPhotoSrcArrayToIds(ids, srcById) {
        return window.BSA.syncMerge.alignPhotoSrcArrayToIds(ids, srcById);
    }

    function isLightweightCloudPhotoRef(src) {
        return window.BSA.syncMerge.isLightweightCloudPhotoRef(src);
    }

    function collectPackedPhotoUrlMap(ids, urls, photos) {
        return window.BSA.syncMerge.collectPackedPhotoUrlMap(ids, urls, photos, window._photoCache);
    }

    function collectPackedPhotoUrlsFrom(ids, photos, existingUrls) {
        if (!ids || !ids.length) return null;
        const map = collectPackedPhotoUrlMap(ids, existingUrls, photos);
        const out = ids.map((pid) => (pid && map[String(pid)]) || '');
        return out.some(Boolean) ? out : null;
    }

    function seedPhotoCacheFromDefect(d) {
        if (!d) return;
        const seed = (ids, photos, urls) => {
            if (!ids || !ids.length) return;
            if (!window._photoCache) window._photoCache = {};
            ids.forEach((pid, i) => {
                if (!pid || window._photoCache[pid]) return;
                const src = (photos && photos[i]) || (urls && urls[i]);
                if (src) window._photoCache[pid] = src;
            });
        };
        seed(d.photoIds, d.photos, d.photoUrls);
        seed(d.prevRoundPhotoIds, d.prevRoundPhotos, d.prevRoundPhotoUrls);
    }

    function extractInlinePhotos(defect, kind) {
        return window.BSA.syncMerge.extractInlinePhotos(defect, kind);
    }

    function mergeDefectRecord(serverRec, localRec) {
        return window.BSA.syncMerge.mergeDefectRecord(serverRec, localRec, window._photoCache);
    }

    function mergeNdtRecord(serverRec, localRec) {
        return window.BSA.syncMerge.mergeNdtRecord(serverRec, localRec);
    }

    function mergeIdRecordArrays(serverArr, localArr, deletedIds, kind, deletedAtById) {
        return window.BSA.syncMerge.mergeIdRecordArrays(
            serverArr, localArr, deletedIds, kind, deletedAtById, window._photoCache
        );
    }

    /**
     * 사진은 기기에 자리 번호(결함id_0, _1 …)로 캐시된다. 다른 기기가 가운데 사진을 지워 뒤 사진이
     * 한 칸씩 당겨지면, 이 기기 캐시의 같은 번호에는 예전 사진이 남아 엉뚱한 자리에 보였다
     * (GPT 감사 6번, 2026-09-22). 병합에서 서버 쪽 사진 목록이 이기는 결함 — 서버가 더 나중에 사진을
     * 바꿈(photosUpdatedAt) — 은 병합 전에 이 기기의 그 결함 사진 캐시(메모리·IndexedDB)를 비워,
     * 새 목록 기준으로 클라우드에서 다시 받게 한다. 병합도 그쪽 목록만 쓰므로 잃는 사진은 없다.
     * 이 기기가 더 나중에 바꿨거나(내 쪽이 이김) 시각이 없는 옛 데이터는 건드리지 않는다.
     */
    function dropStaleDefectPhotoSlotCache(serverMap, localMap) {
        const pick = window.BSA && window.BSA.syncMerge && window.BSA.syncMerge.pickPhotoListSide;
        if (typeof pick !== 'function') return 0;
        let dropped = 0;
        Object.keys(serverMap || {}).forEach((floorKey) => {
            const localArr = (localMap && localMap[floorKey]) || [];
            if (!Array.isArray(localArr) || !localArr.length) return;
            const localById = new Map(localArr.filter((d) => d && d.id).map((d) => [d.id, d]));
            (serverMap[floorKey] || []).forEach((s) => {
                const l = s && s.id ? localById.get(s.id) : null;
                if (!l) return;
                const sp = Number(s.photosUpdatedAt) || 0;
                const lp = Number(l.photosUpdatedAt) || 0;
                if (!(sp > lp) || pick(s, l) !== 'server') return;
                const pids = new Set([].concat(s.photoIds || [], l.photoIds || []).filter(Boolean));
                const slotCount = Math.max(
                    (s.photoIds || []).length, (l.photoIds || []).length, (Array.isArray(l.photos) ? l.photos.length : 0)
                );
                for (let i = 0; i < slotCount; i++) pids.add(getPhotoDocId(s.id, i));
                pids.forEach((pid) => {
                    if (window._photoCache) delete window._photoCache[pid];
                    // 진행 중이던 IndexedDB 쓰기가 끝나며 옛 사진을 캐시에 다시 넣지 않게 세대를 올린다
                    _idbPhotoWriteGen.set(pid, (_idbPhotoWriteGen.get(pid) || 0) + 1);
                    _idbPendingPhotoKeys.delete(pid);
                    _idbPersistedPhotoKeys.delete(pid);
                    idbDelete('photos', pid);
                    // 이번 실행에서 이미 한 번 받았거나 "없음"으로 본 번호도 새 사진으로 다시 받게 한다
                    _cloudPhotoFetchAttempted.delete(pid);
                    _nonExistentPhotoIds.delete(pid);
                });
                dropped++;
            });
        });
        if (dropped) console.info('[사진] 다른 기기가 사진을 바꾼 결함 ' + dropped + '건 — 이 기기의 자리 번호 캐시를 비우고 다시 받습니다.');
        return dropped;
    }

    function mergeDefectsMaps(serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt) {
        ensureSyncMetaState();
        dropStaleDefectPhotoSlotCache(serverMap, localMap);
        const result = window.BSA.syncMerge.mergeDefectsMaps(
            serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt,
            { photoCache: window._photoCache, renumberFloorDefects: renumberFloorDefects }
        );
        // 합친 층의 결함은 새 객체 — 칸 비교 기준을 합친 값으로 다시 잡는다(서버에서 온 값을 내 수정으로 오인하지 않게)
        seedDefectContentSnaps(result.defects, Object.keys(serverMap || {}));
        handleRevivedRecords(result.revived, 'pin', result.defects);
        return result;
    }

    /** 동기화 병합용 — photoIds·인라인 사진만으로 병합(클라우드 사진 fetch 없음) */

    /**
     * 삭제 고유코드 재사용: 반드시 전원 동기화 확인 후 수동으로만 실행.
     * tombstone(deletedDefectIds) 중 활성 결함에 없는 코드를 비운다.
     */
    window.purgeDeletedDefectCodes = function () {
        ensureSyncMetaState();
        let purged = 0;
        const deleted = window.state.deletedDefectIds || {};
        Object.keys(deleted).forEach((key) => {
            const active = new Set((window.state.defects?.[key] || []).map((d) => d?.id).filter(Boolean));
            const next = [];
            (deleted[key] || []).forEach((id) => {
                if (active.has(id)) {
                    next.push(id);
                    return;
                }
                purged += 1;
            });
            if (next.length) deleted[key] = next;
            else delete deleted[key];
        });
        window.state.deletedDefectIds = deleted;
        // 구버전 자동확정 맵은 더 이상 쓰지 않음
        window.state.confirmedDeletedIds = {};
        if (window.state.deletedDefectAt) {
            Object.keys(window.state.deletedDefectAt).forEach((key) => {
                if (!deleted[key]) {
                    delete window.state.deletedDefectAt[key];
                    return;
                }
                const keep = new Set(deleted[key]);
                Object.keys(window.state.deletedDefectAt[key] || {}).forEach((id) => {
                    if (!keep.has(id)) delete window.state.deletedDefectAt[key][id];
                });
            });
        }
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        return purged;
    };
    // 하위 호환 별칭
    window.purgeConfirmedDeletedDefectCodes = function () {
        return window.purgeDeletedDefectCodes();
    };

    // 비파괴 항목과 부동침하·부재처짐 구역 둘 다 이걸로 합친다(묘비 공용)
    function mergeNdtDataMaps(serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt) {
        const result = window.BSA.syncMerge.mergeNdtDataMaps(
            serverMap, localMap, serverDeleted, localDeleted, serverDeletedAt, localDeletedAt
        );
        handleRevivedRecords(result.revived, 'ndt', result.ndtData);
        return result;
    }

    // saveStateToLocalStorage에서 IndexedDB로 옮겨 저장한 도면/사진을 다시 불러와
    // state.buildings[].floorDrawings / state.defects[].photos를 채운다.
    // (구버전 데이터가 이미 photos/floorDrawings를 그대로 갖고 있으면 건드리지 않고 그대로 둔다 —
    // 다음 저장 때 자연스럽게 IndexedDB로 옮겨진다.)
    async function ensureOfflineRasterForFloor(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        const idbKey = `${bldg.id}_${floorCode}`;
        if (isUsableRasterDrawingUrl(bldg.floorDrawings && bldg.floorDrawings[floorCode])) {
            return true;
        }
        const idbRaster = await idbGet('floorDrawings', idbKey);
        if (isUsableRasterDrawingUrl(idbRaster)) {
            if (!bldg.floorDrawings) bldg.floorDrawings = {};
            bldg.floorDrawings[floorCode] = idbRaster;
            _idbPersistedDrawingKeys.add(idbKey);
            return true;
        }
        // 화면 표시는 레스터만 사용. PDF→JPEG 변환은 최초 등록·동기화(ensureRasterTiersForSync)에서만.
        return false;
    }

    /** 층별 8000·16000 티어 — 온라인: 서버→IDB, 오프라인: IDB만 (확대 3티어 오프라인 대비) */
    async function hydrateFloorDrawingTiersForFloor(bldg, floorCode, opts) {
        const options = opts || {};
        if (!bldg || !bldg.id || !floorCode) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        // 점검 진입·유휴 시 고해상도(8000/16000)까지 미리 받으면 층마다 청크 get 폭주.
        // 기본은 4000만; 줌 LOD(prefetchFloorDrawingTiersForFloor)가 필요할 때 올린다.
        if (options.skipHiTiers || options.baseTierOnly) return false;
        const extraDims = (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).filter((d) => d > 4000);
        if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
        if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
        let gotAny = false;

        // 8000 먼저 → 16000 (병렬 시 캐시가 서로를 덮어 모바일 LOD가 비는 경우 방지)
        const replaceGuarded = isDrawingReplaceGuarded(bldg, floorCode);
        for (const dim of extraDims) {
            const dimKey = String(dim);
            if (isUsableRasterDrawingUrl(bldg.floorDrawingTiers[floorCode][dimKey])) {
                gotAny = true;
                continue;
            }
            // 교체 직후에는 옛 8000/16000 티어를 IDB·클라우드에서 다시 붙이지 않음
            if (replaceGuarded) continue;
            const cached = await idbGetFloorDrawingTier(bldg.id, floorCode, dim);
            if (isUsableRasterDrawingUrl(cached)) {
                bldg.floorDrawingTiers[floorCode][dimKey] = cached;
                _idbPersistedTierKeys.add(floorDrawingTierIdbKey(bldg.id, floorCode, dim));
                gotAny = true;
                continue;
            }
            if (!options.localOnly && typeof navigator !== 'undefined' && navigator.onLine !== false) {
                const cloud = await fetchAndCacheCloudFloorDrawingTier(bldg, floorCode, dim);
                if (isUsableRasterDrawingUrl(cloud)) {
                    bldg.floorDrawingTiers[floorCode][dimKey] = cloud;
                    gotAny = true;
                }
            }
        }
        return gotAny;
    }

    /** 점검 진입 시 서버→로컬(IDB) 일괄 내려받기 — 층 전환·오프라인은 IDB 3티어 사용 */
    async function hydrateFloorDrawingFromCloud(bldg, floorCode, opts) {
        const options = opts || {};
        if (!bldg || !bldg.id || !floorCode) return false;
        if (isDeletedDrawingFloor(bldg, floorCode)) return false;
        if (!bldg.floorDrawings) bldg.floorDrawings = {};
        if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
        if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
        if (!bldg.floorDrawingSources) bldg.floorDrawingSources = {};
        const idbKey = `${bldg.id}_${floorCode}`;
        let hydrated = false;
        // 다른 기기가 이 층 도면을 다시 넣었으면 받아 둔 옛 그림·PDF는 건너뛴다
        const refreshDue = !options.localOnly && floorDrawingRefreshDue(bldg, floorCode);
        if (refreshDue) {
            delete bldg.floorDrawings[floorCode];
            delete bldg.floorDrawingTiers[floorCode];
            delete bldg.floorDrawingPdfs[floorCode];
            if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.delete(idbKey);
            if (window._cloudSyncedDrawingKeys) window._cloudSyncedDrawingKeys.delete(idbKey);
            clearFloorTierPersistedFlags(bldg.id, floorCode);
        }

        // 1) 로컬 레스터 먼저 (네트워크 전에 IDB 티어·미리보기)
        if (!refreshDue && !isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode])) {
            if (bldg.floorDrawings[floorCode]) delete bldg.floorDrawings[floorCode];
            const cached = await idbGet('floorDrawings', idbKey);
            if (isUsableRasterDrawingUrl(cached)) {
                bldg.floorDrawings[floorCode] = cached;
                _idbPersistedDrawingKeys.add(idbKey);
                hydrated = true;
            } else if (cached) {
                _idbPersistedDrawingKeys.delete(idbKey);
                idbDelete('floorDrawings', idbKey);
            }
        }

        if (!refreshDue && !isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode])) {
            const t4000 = await idbGetFloorDrawingTier(bldg.id, floorCode, 4000);
            if (isUsableRasterDrawingUrl(t4000)) {
                if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
                if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
                bldg.floorDrawingTiers[floorCode]['4000'] = t4000;
                bldg.floorDrawings[floorCode] = t4000;
                _idbPersistedTierKeys.add(floorDrawingTierIdbKey(bldg.id, floorCode, 4000));
                hydrated = true;
            }
        }

        // 2) 로컬에 없을 때만 클라우드 일반(4000) 티어 1장
        if (!isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode]) && !options.localOnly) {
            const cloud4000 = await fetchAndCacheCloudFloorDrawingTier(bldg, floorCode, 4000);
            if (isUsableRasterDrawingUrl(cloud4000)) {
                bldg.floorDrawings[floorCode] = cloud4000;
                hydrated = true;
                if (refreshDue) {
                    idbSet('floorDrawings', idbKey, cloud4000);
                    _idbPersistedDrawingKeys.add(idbKey);
                    [8000, 16000].forEach((d) => {
                        idbDelete('floorDrawingTiers', floorDrawingTierIdbKey(bldg.id, floorCode, d));
                    });
                }
            } else if (typeof fetchCloudFloorDrawingDataUrl === 'function') {
                const cloudRaster = await fetchCloudFloorDrawingDataUrl(bldg.id, floorCode);
                if (cloudRaster && isUsableRasterDrawingUrl(cloudRaster) && !isPdfDrawingUrl(cloudRaster)) {
                    bldg.floorDrawings[floorCode] = cloudRaster;
                    idbSet('floorDrawings', idbKey, cloudRaster);
                    _idbPersistedDrawingKeys.add(idbKey);
                    hydrated = true;
                } else if (cloudRaster && isPdfDrawingUrl(cloudRaster)) {
                    // 표시용 아님 — 벡터/재등록용으로만 보관
                    await applyResolvedPdfToBuilding(bldg, floorCode, cloudRaster);
                }
            }
        }

        if (refreshDue && !isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode])) {
            const cached = await idbGet('floorDrawings', idbKey);
            if (isUsableRasterDrawingUrl(cached)) bldg.floorDrawings[floorCode] = cached;
        }

        const hasRaster = isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode]);
        if (refreshDue && !options.localOnly) {
            const refreshedPdf = await resolveBuildingFloorPdf(bldg, floorCode, { forceCloud: true });
            if (refreshedPdf) hydrated = true;
            if (bldg._pdfRefreshFromCloud && bldg._pdfRefreshFromCloud[floorCode]) {
                markFloorDrawingApplied(bldg.id, floorCode, floorPdfUpdatedAtOf(bldg, floorCode));
                delete bldg._pdfRefreshFromCloud[floorCode];
            }
        }
        // PDF 원본은 벡터 내보내기 등 needPdf일 때만
        if (!hasRaster && !bldg.floorDrawingPdfs[floorCode] && options.needPdf) {
            const resolvedPdf = await resolveBuildingFloorPdf(
                bldg,
                floorCode,
                options.localOnly ? { localOnly: true } : { forceCloud: true }
            );
            if (resolvedPdf) {
                await applyResolvedPdfToBuilding(bldg, floorCode, resolvedPdf);
                hydrated = true;
            }
        }

        if (await hydrateFloorDrawingTiersForFloor(bldg, floorCode, options)) {
            hydrated = true;
        }
        if (isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode])
            && bldg.floorDrawingTiers[floorCode]
            && !bldg.floorDrawingTiers[floorCode]['4000']) {
            bldg.floorDrawingTiers[floorCode]['4000'] = bldg.floorDrawings[floorCode];
        }
        return hydrated;
    }
    window.hydrateFloorDrawingFromCloud = hydrateFloorDrawingFromCloud;
    window.forgetDeletedDrawingFloor = forgetDeletedDrawingFloor;

    function withTimeout(promise, ms, label) {
        let timer = 0;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(label || 'timeout')), ms);
        });
        return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
    }
    /** 탭/브릿지 모듈에서도 쓰는 공개 타임아웃 */
    window.withTimeoutMs = withTimeout;

    async function runPool(items, limit, worker) {
        const queue = (items || []).slice();
        if (queue.length === 0) return;
        const n = Math.max(1, Math.min(limit || 2, queue.length));
        await Promise.all(Array.from({ length: n }, async () => {
            while (queue.length) {
                const item = queue.shift();
                try {
                    if (typeof yieldToUiGesture === 'function') await yieldToUiGesture();
                    await worker(item);
                } catch (e) {
                    console.warn('도면 처리 실패:', item, e);
                }
            }
        }));
    }

    async function hydrateSingleBuildingDrawings(bldg, opts) {
        if (!bldg || !bldg.id) return false;
        const options = opts || {};
        if (!bldg.floorDrawings) bldg.floorDrawings = {};
        if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
        const floors = collectKnownFloorCodesForBuilding(bldg);
        // floorsList·도면 키가 있을 때만 그 층을 받는다.
        // 비어 있을 때 현장 보관함/기본 1F를 붙이면 신규 건축물에 엉뚱한 도면이 생긴다.
        // false tombstone이 남아 있으면(EXT만 보이는 상태) 클라우드 floorDrawings로 층을 찾는다.
        const hasDrawingTombstones = (typeof buildingHasDrawingFloorTombstones === 'function')
            ? buildingHasDrawingFloorTombstones(bldg)
            : ((bldg.deletedDrawingFloorCodes || []).some((c) => !!String(c || '').trim()));
        if (!options.localOnly && (floors.size === 0 || hasDrawingTombstones) && typeof discoverCloudDrawingFloorCodes === 'function') {
            try {
                const discovered = await withTimeout(discoverCloudDrawingFloorCodes(bldg), 8000, '도면 층 탐색 시간 초과');
                discovered.forEach((fc) => {
                    if (!fc) return;
                    // discoverCloud가 클라우드 문서 증거로 tombstone을 이미 해제했을 수 있음
                    if (isDeletedDrawingFloor(bldg, fc)) {
                        forgetDeletedDrawingFloor(bldg, fc);
                    }
                    floors.add(fc);
                });
            } catch (e) {
                console.warn('서버 도면 층 탐색 실패:', bldg.id, e);
            }
        }
        Array.from(floors).forEach((fc) => {
            if (isDeletedDrawingFloor(bldg, fc)) floors.delete(fc);
        });
        if (floors.size === 0) {
            return false;
        }
        mergeDiscoveredFloorsIntoBuilding(bldg, floors);
        const priority = options.priorityFloor && floors.has(options.priorityFloor)
            ? options.priorityFloor
            : null;
        const floorList = priority
            ? [priority, ...[...floors].filter((fc) => fc !== priority)]
            : [...floors];
        let done = 0;
        const reportProgress = (floorCode) => {
            if (!options.onProgress || floorList.length === 0) return;
            options.onProgress(done, floorList.length, floorCode || '');
        };
        reportProgress(floorList[0] || '');

        const hydrateOne = async (floorCode, extra) => {
            const floorOpts = extra ? { ...options, ...extra } : options;
            await withTimeout(hydrateFloorDrawingFromCloud(bldg, floorCode, floorOpts), 55000, '도면 내려받기 시간 초과');
            await withTimeout(ensureOfflineRasterForFloor(bldg, floorCode), 5000, '도면 미리보기 생성 시간 초과');
            await persistFloorDrawingAssetsForFloor(bldg, floorCode);
            const keepFloor = options.priorityFloor || window.state.currentFloor;
            if (floorCode !== keepFloor) {
                releaseHeavyDrawingMemory(bldg, { keepFloor, keepDim: 4000 });
            }
            done += 1;
            reportProgress(floorCode);
            if (window.state.currentBuildingId === bldg.id
                && window.state.currentFloor === floorCode
                && (window.state.currentTab === 'tab-map')
                && !window.state.bgImage
                && typeof loadFloorDrawing === 'function') {
                loadFloorDrawing(floorCode);
            }
        };

        if (priority) {
            try {
                await withTimeout(hydrateOne(priority, { needPdf: false }), 35000, '현재 층 도면 시간 초과');
            } catch (e) {
                console.warn('현재 층 도면 로드 실패:', priority, e);
            }
        } else if (options.backgroundRest && floorList[0]) {
            try {
                await withTimeout(hydrateOne(floorList[0], { needPdf: false }), 35000, '현재 층 도면 시간 초과');
            } catch (e) {
                console.warn('첫 층 도면 로드 실패:', floorList[0], e);
            }
        }

        const skipFirst = (!priority && options.backgroundRest && floorList[0]) ? floorList[0] : priority;
        // priorityOnly: 지금 보는 층만. 다른 층 floorDrawings/tiers/pdf get은 층 전환 때 한다.
        // (예전 backgroundRest는 나머지 층을 백그라운드로 전부 받아 Spark 읽기 한도를 낭비)
        if (options.priorityOnly || options.currentFloorOnly) {
            await persistBuildingDrawingAssetsNow(bldg);
            return floorList.length > 0;
        }
        const rest = skipFirst ? floorList.filter((fc) => fc !== skipFirst) : floorList;
        const restWork = (async () => {
            // 현재 층 표시·네트워크를 먼저 쓰게 잠깐 양보
            if (options.backgroundRest && rest.length) {
                await new Promise((r) => setTimeout(r, 400));
            }
            await runPool(rest, 1, (floorCode) => hydrateOne(floorCode, { needPdf: false }));
            await persistBuildingDrawingAssetsNow(bldg);
        })();

        if (options.backgroundRest) {
            restWork.catch((e) => console.warn('나머지 층 도면 백그라운드 로드 실패:', bldg.id, e));
            return floorList.length > 0;
        }
        await restWork;
        return floorList.length > 0;
    }
    window.hydrateSingleBuildingDrawings = hydrateSingleBuildingDrawings;

    async function hydrateLocalImagesFromIndexedDb() {
        try {
            // 도면·PDF·전 건물 사진은 올리지 않는다. 점검 중인 건물 사진만 복원.
            const currentId = window.state.currentBuildingId;
            if (!currentId) return;
            const defectsMap = window.state.defects || {};
            const subset = {};
            Object.entries(defectsMap).forEach(([key, arr]) => {
                if (key.startsWith(currentId + '_')) subset[key] = arr;
            });
            const curBldgEarly = (window.state.buildings || []).find((b) => b.id === currentId);
            if (curBldgEarly && typeof hydrateBuildingOverviewPhotos === 'function') {
                hydrateBuildingOverviewPhotos(curBldgEarly).catch((e) => console.warn('전경사진 복원 실패:', e));
            }
            if (!Object.keys(subset).length) return;

            // 도면 로드(hydrateSingleBuildingDrawings)와 같은 이유로 현재 층만 먼저 기다린다 —
            // 예전엔 건물의 모든 층 사진을 한 번에(층마다 순차) 복원하고 나서야 상태조사표를
            // 그려서, 층이 많은 건물에서 사진이 "한참 늦게" 뜨는 원인이었다(사용자가 실제로
            // 겪음). 지금 보고 있는 층만 먼저 복원해 즉시 그리고, 나머지 층은 백그라운드로.
            const currentFloorKey = `${currentId}_${window.state.currentFloor}`;
            const currentFloorSubset = {};
            const restSubset = {};
            Object.entries(subset).forEach(([key, arr]) => {
                if (key === currentFloorKey) currentFloorSubset[key] = arr;
                else restSubset[key] = arr;
            });

            if (Object.keys(currentFloorSubset).length) {
                const loaded = await hydrateDefectPhotos(currentFloorSubset, { buildingId: currentId });
                Object.assign(window.state.defects, loaded);
            }
            if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();

            if (Object.keys(restSubset).length) {
                hydrateDefectPhotos(restSubset, { buildingId: currentId }).then((loaded) => {
                    Object.assign(window.state.defects, loaded);
                    if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                }).catch((e) => console.warn('나머지 층 사진 백그라운드 복원 실패:', e));
            }
        } catch (e) {
            console.warn('IndexedDB 이미지 복원 실패:', e);
        }
    }

