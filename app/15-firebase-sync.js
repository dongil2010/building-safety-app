// @@app-part 15-firebase-sync.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // ==========================================================================
    // 🌐 FIREBASE REALTIME SYNC ENGINE (구글 파이어베이스 실시간 1초 동기화)
    // ==========================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyACD8js2jI40ypk_2y7Ewm9G7a0KKOQ1uQ",
        authDomain: "building-safety-app-46821.firebaseapp.com",
        projectId: "building-safety-app-46821",
        storageBucket: "building-safety-app-46821.firebasestorage.app",
        messagingSenderId: "552684445343",
        appId: "1:552684445343:web:ee6d32378296996f200caa",
        measurementId: "G-NF80EL460D"
    };

    // 도면/PDF/티어/사진 파일 본문 → Firebase Storage (Firestore는 URL/메타만)
    const SA = (window.BSA && window.BSA.storageAssets) || {};
    const USE_FIREBASE_STORAGE_FOR_DRAWINGS = SA.USE_FIREBASE_STORAGE_FOR_DRAWINGS !== false;
    const USE_FIREBASE_STORAGE_FOR_PHOTOS = SA.USE_FIREBASE_STORAGE_FOR_PHOTOS !== false;
    window.USE_FIREBASE_STORAGE_FOR_DRAWINGS = USE_FIREBASE_STORAGE_FOR_DRAWINGS;
    window.USE_FIREBASE_STORAGE_FOR_PHOTOS = USE_FIREBASE_STORAGE_FOR_PHOTOS;
    function getFirebaseStorage() {
        return typeof SA.getFirebaseStorage === 'function' ? SA.getFirebaseStorage() : null;
    }
    function uploadBlobToFirebaseStorage(storagePath, blob, contentType) {
        if (typeof SA.uploadBlobToFirebaseStorage !== 'function') {
            return Promise.reject(new Error('Firebase Storage helpers missing'));
        }
        return SA.uploadBlobToFirebaseStorage(storagePath, blob, contentType);
    }
    function deleteFirebaseStoragePath(storagePath) {
        if (typeof SA.deleteFirebaseStoragePath !== 'function') return Promise.resolve(false);
        return SA.deleteFirebaseStoragePath(storagePath);
    }
    function parseDataUrl(dataUrl) {
        return typeof SA.parseDataUrl === 'function' ? SA.parseDataUrl(dataUrl) : null;
    }
    function storagePathFloorDrawing(companyId, buildingId, floorCode, contentType, scope) {
        return typeof SA.storagePathFloorDrawing === 'function'
            ? SA.storagePathFloorDrawing(companyId, buildingId, floorCode, contentType, scope)
            : '';
    }
    function storagePathFloorDrawingPdf(companyId, buildingId, floorCode, scope) {
        return typeof SA.storagePathFloorDrawingPdf === 'function'
            ? SA.storagePathFloorDrawingPdf(companyId, buildingId, floorCode, scope)
            : '';
    }
    function storagePathFloorDrawingTier(companyId, buildingId, floorCode, dim, contentType, scope) {
        return typeof SA.storagePathFloorDrawingTier === 'function'
            ? SA.storagePathFloorDrawingTier(companyId, buildingId, floorCode, dim, contentType, scope)
            : '';
    }
    function storagePathPhoto(companyId, photoId, contentType, scope) {
        return typeof SA.storagePathPhoto === 'function'
            ? SA.storagePathPhoto(companyId, photoId, contentType, scope)
            : '';
    }
    function firestoreStorageMetaFields(uploaded) {
        return typeof SA.firestoreStorageMetaFields === 'function'
            ? SA.firestoreStorageMetaFields(uploaded)
            : { backend: 'storage', chunked: false, chunkStatus: 'ready' };
    }
    function resolveCloudAssetUrlFromSnapData(snapData) {
        if (typeof SA.resolveCloudAssetUrlFromSnapData === 'function') {
            return SA.resolveCloudAssetUrlFromSnapData(snapData);
        }
        return Promise.resolve(null);
    }
    function hasFirebaseStorageMeta(data) {
        return typeof SA.hasFirebaseStorageMeta === 'function' ? SA.hasFirebaseStorageMeta(data) : false;
    }
    function materializeCloudAssetPayload(url, snapData) {
        if (typeof SA.materializeCloudAssetPayload === 'function') {
            return SA.materializeCloudAssetPayload(url, snapData);
        }
        return Promise.resolve(url || null);
    }
    function assetUrlToUploadBlob(url) {
        if (typeof SA.assetUrlToUploadBlob === 'function') return SA.assetUrlToUploadBlob(url);
        return Promise.resolve(null);
    }
    function isFirebaseStorageHttpUrl(url) {
        return typeof SA.isFirebaseStorageHttpUrl === 'function' ? SA.isFirebaseStorageHttpUrl(url) : false;
    }
    function storagePathFromDownloadURL(url) {
        return typeof SA.storagePathFromDownloadURL === 'function' ? SA.storagePathFromDownloadURL(url) : null;
    }
    function storagePathFromSnapData(data) {
        return typeof SA.storagePathFromSnapData === 'function' ? SA.storagePathFromSnapData(data) : null;
    }
    function snapNeedsSiteRoundMove(data) {
        return typeof SA.snapNeedsSiteRoundMove === 'function' ? SA.snapNeedsSiteRoundMove(data) : false;
    }

    let db = null;
    let isRemoteSyncing = false;
    let _syncInFlight = false;
    let _syncPending = false;
    let _syncDebounceTimer = null;
    let _pendingRemoteData = null;
    let _flushRemoteTimer = null;
    let _syncRetryTimer = null;
    let _syncRetryFailCount = 0;
    let _syncErrorToastAt = 0;
    const SYNC_RETRY_BASE_MS = 3500;
    const SYNC_RETRY_MAX_MS = 60000;
    const SYNC_ERROR_TOAST_COOLDOWN_MS = 10000;
    const SYNC_QUOTA_COOLDOWN_MS = 120000;
    // 권한 오류는 규칙을 다시 게시해야 풀린다 — 짧게 재시도해봐야 소용없으니 길게 쉰다.
    // (0으로 두고 완전히 멈추지는 않는다. 관리자가 규칙을 올리면 새로고침 없이 스스로 회복)
    const SYNC_PERMISSION_COOLDOWN_MS = 300000;
    // 2026-10-20 끝없는 재시도 방지(js/core/sync-retry.js): 연속 실패를 기기에 남기고(새로고침해도 이어서 셈),
    // 영구 오류(권한·없음·잘못된 값·너무 큼)나 6번 연속 실패면 자동 올리기를 멈춘다(지우지 않음). 「지금 다시 올리기」로만 다시.
    let _syncGate = null;
    let _syncGateCid = null;
    let _photoRetryTracker = null;
    let _offlineVerifyGate = null;
    let _offlineVerifyGateCid = null;
    const _photoLastError = new Map();
    function syncRetryApi() { return (window.BSA && window.BSA.syncRetry) || null; }
    function syncCid() { return (window.state && window.state.companyId) || ''; }
    function syncGate() {
        const R = syncRetryApi();
        if (!R) return null;
        if (!_syncGate || _syncGateCid !== syncCid()) {
            _syncGateCid = syncCid();
            _syncGate = R.createGate({
                storage: (typeof localStorage !== 'undefined') ? localStorage : null,
                storageKey: `bsa_sync_gate_v1_${_syncGateCid}`,
                maxAttempts: 6, baseMs: SYNC_RETRY_BASE_MS, capMs: 10 * 60 * 1000, quotaMinMs: SYNC_QUOTA_COOLDOWN_MS
            });
        }
        return _syncGate;
    }
    function photoRetryTracker() {
        const R = syncRetryApi();
        if (!R) return null;
        if (!_photoRetryTracker) {
            _photoRetryTracker = R.createItemTracker({
                storage: (typeof localStorage !== 'undefined') ? localStorage : null,
                storageKey: () => `bsa_photo_retry_v1_${syncCid()}`,
                maxAttempts: 5, baseMs: 0
            });
        }
        return _photoRetryTracker;
    }
    function offlineVerifyGate() {
        const R = syncRetryApi();
        if (!R) return null;
        if (!_offlineVerifyGate || _offlineVerifyGateCid !== syncCid()) {
            _offlineVerifyGateCid = syncCid();
            _offlineVerifyGate = R.createGate({
                storage: (typeof localStorage !== 'undefined') ? localStorage : null,
                storageKey: `bsa_offline_verify_gate_v1_${_offlineVerifyGateCid}`,
                maxAttempts: 8, baseMs: 60000, capMs: 6 * 60 * 60 * 1000
            });
        }
        return _offlineVerifyGate;
    }
    function isSyncParked() {
        const g = syncGate();
        if (!(g && g.isParked())) return false;
        // 2026-11-04 예전 버전이 「문서 1MB 초과」로 멈춰 둔 것은 이제 나눠 쓰면 되므로 한 번 풀어 준다(기기 데이터 그대로)
        try {
            const st = g.state();
            const api = rootDocShardsApi();
            // 2026-11-04 v20261104_175106~183221의 「collection() … empty path」(건물 문서 경로 상수 누락 버그)로 멈춘 것도 한 번 풀어 준다
            if (api && st && (api.isDocTooLargeError(st.reason || '') || /DocumentReference\.collection\(\) cannot be called with an empty path/i.test(st.reason || ''))) {
                g.unpark();
                _rootForceSplit = true;
                console.info('[건물 문서] 1MB 초과로 멈췄던 자동 올리기를 다시 켭니다');
                return false;
            }
        } catch (_e) { /* ignore */ }
        return true;
    }
    window.bsaSyncParkedState = () => {
        const g = syncGate();
        const t = photoRetryTracker();
        return { gate: g ? g.state() : null, parkedPhotos: t ? t.parked() : [] };
    };
    /** 「지금 다시 올리기」 — 멈춘 올리기·멈춘 사진을 풀고 한 번 돌린다(지운 것 없음: 기기 사본 그대로) */
    window.bsaUnparkSync = function () {
        const g = syncGate(); if (g) g.unpark();
        const t = photoRetryTracker(); if (t) t.unparkAll();
        const v = offlineVerifyGate(); if (v) v.unpark();
        _photoSyncUploadFailCount.clear();
        clearSyncErrorRetryTimer();
        // 손글씨·주석 메모(계정별 문서)도 같이 다시 올린다
        try { if (typeof window.bsaQueueAndFlushMemos === 'function') window.bsaQueueAndFlushMemos('manual'); } catch (_e) { /* ignore */ }
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    };
    function onSyncParked(r) {
        console.warn('[동기화] 자동 올리기를 멈춤:', r);
        if (typeof window.showToast === 'function') {
            window.showToast(r && r.kind === 'permanent'
                ? '서버가 거부한 오류라 자동 올리기를 멈췄습니다(기기 데이터는 그대로). 원인을 해결한 뒤 「지금 다시 올리기」를 눌러 주세요.'
                : '올리기가 계속 실패해 자동 재시도를 멈췄습니다(기기 데이터는 그대로). 「지금 다시 올리기」로 다시 시도할 수 있습니다.', 'warning', 9000);
        }
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    }
    // 다른 탭이 올리는 중이면 이 탭은 쉬었다가 한 번만 다시(실패로 세지 않음)
    let _otherTabRetryTimer = null;
    function scheduleSyncAfterOtherTab() {
        if (_otherTabRetryTimer) return;
        const R = syncRetryApi();
        const delay = R ? R.backoffMs(2, { baseMs: 5000, capMs: 60000 }) : 20000;
        _otherTabRetryTimer = setTimeout(() => {
            _otherTabRetryTimer = null;
            if (_dirtyFloorKeys.size && navigator.onLine !== false && !isSyncParked()) syncStateToFirebase();
        }, delay);
    }
    let _photoFetchQuotaPausedUntil = 0;
    let _photoFetchInflight = 0;
    const PHOTO_FETCH_MAX_CONCURRENT = 4;
    /** 한 hydrateDefectPhotos 호출당 클라우드 photos.doc.get 상한 (층에 사진 많을 때 폭주 방지) */
    const PHOTO_FETCH_MAX_PER_HYDRATE = 24;
    /** 세션 중 이미 클라우드 get을 시도한 photoId — 층전환/스냅샷마다 재조회 금지 */
    const _cloudPhotoFetchAttempted = new Set();
    /** 읽기 할당량 초과 시 모든 클라우드 사진/재구독 get을 잠시 중단 */
    let _firestoreReadPausedUntil = 0;

    function pauseFirestoreReads(ms) {
        const until = Date.now() + Math.max(0, ms || 0);
        _firestoreReadPausedUntil = Math.max(_firestoreReadPausedUntil, until);
        _photoFetchQuotaPausedUntil = Math.max(_photoFetchQuotaPausedUntil, until);
    }
    function isFirestoreReadPaused() {
        return Date.now() < _firestoreReadPausedUntil || Date.now() < _photoFetchQuotaPausedUntil;
    }

    function isFirestoreQuotaError(err) {
        const msg = String((err && err.message) || err || '');
        const code = String((err && err.code) || '');
        return /\b429\b/.test(msg)
            || /resource-exhausted|RESOURCE_EXHAUSTED|quota/i.test(msg + code)
            || /Write stream exhausted|maximum allowed queued writes|using maximum backoff/i.test(msg);
    }

    // 보안 규칙에 막힌 오류 판별은 isFirestorePermissionError(아래 도면 티어 쪽에 정의)를 쓴다.
    // 할당량 초과와 달리 "기다리면 풀리는" 오류가 아니라, 규칙을 고치기 전까지 몇 번을 다시
    // 시도해도 똑같이 실패한다. 그래서 재시도 루프에서 반드시 걸러내야 한다.

    function clearSyncErrorRetryTimer() {
        if (_syncRetryTimer) {
            clearTimeout(_syncRetryTimer);
            _syncRetryTimer = null;
        }
    }

    /**
     * 통신·할당량 오류 후 지수 백오프로 재시도
     * (429는 최소 2분, 권한 오류는 최소 5분 쉬고 한 번만 예약)
     */
    function scheduleSyncRetryAfterError(err) {
        if (_syncRetryTimer) return;
        const isQuota = isFirestoreQuotaError(err);
        let delay = Math.min(
            SYNC_RETRY_BASE_MS * Math.pow(2, _syncRetryFailCount),
            SYNC_RETRY_MAX_MS
        );
        const gate = syncGate();
        if (gate) {
            // 2026-10-20 영구 오류·연속 실패 상한 → 멈춤(자동 재시도 없음). 아니면 지수 백오프+지터(상한 10분)
            const r = gate.fail(err, (err && err.message) || '');
            if (r.parked) { _syncRetryFailCount = Math.min(_syncRetryFailCount + 1, 8); onSyncParked(r); return; }
            delay = r.delayMs;
        }
        if (isQuota) {
            delay = Math.max(delay, SYNC_QUOTA_COOLDOWN_MS);
            pauseFirestoreWrites(delay);
        }
        if (isFirestorePermissionError(err)) {
            delay = Math.max(delay, SYNC_PERMISSION_COOLDOWN_MS);
        }
        _syncRetryFailCount = Math.min(_syncRetryFailCount + 1, 8);
        _syncRetryTimer = setTimeout(() => {
            _syncRetryTimer = null;
            if (!db || !window.state.companyId || !navigator.onLine) return;
            if (isSyncParked()) return;
            if (Date.now() < _photoFetchQuotaPausedUntil) {
                // 읽기 쉬는 중 — 실패로 세지 않고 남은 시간만큼 다시 기다린다
                _syncRetryTimer = setTimeout(() => { _syncRetryTimer = null; if (!isSyncParked()) syncStateToFirebase(); },
                    Math.max(1000, _photoFetchQuotaPausedUntil - Date.now()));
                return;
            }
            syncStateToFirebase();
        }, delay);
    }

    function discardStalePendingRemoteAfterLocalPinEdit() {
        _pendingRemoteData = null;
    }


    /** 핀/영역/NDT 드래그·핀치 등 UI 제스처 중이면 원격 스냅샷 적용을 미룸 (저장 업로드는 그대로) */
    function isRealtimeUiGestureBusy() {
        return !!(
            (typeof isDragging !== 'undefined' && isDragging)
            || (typeof isMarkingDrag !== 'undefined' && isMarkingDrag)
            || (typeof isAreaDrag !== 'undefined' && isAreaDrag)
            || (typeof isDraggingPin !== 'undefined' && isDraggingPin)
            || (typeof isDraggingPinGroup !== 'undefined' && isDraggingPinGroup)
            || (typeof isDraggingLegend !== 'undefined' && isDraggingLegend)
            || (typeof isResizingLegend !== 'undefined' && isResizingLegend)
            || (typeof isMarqueeSelecting !== 'undefined' && isMarqueeSelecting)
            || (typeof isPinching !== 'undefined' && isPinching)
            || (typeof pendingDragHit !== 'undefined' && pendingDragHit)
            || (typeof isDraggingNdtPin !== 'undefined' && isDraggingNdtPin)
            || (typeof isDraggingNdtPinGroup !== 'undefined' && isDraggingNdtPinGroup)
            || (typeof isDraggingNdtDisplacement !== 'undefined' && isDraggingNdtDisplacement)
            || (typeof isNdtMarqueeSelecting !== 'undefined' && isNdtMarqueeSelecting)
            || (typeof isNdtMarkingDrag !== 'undefined' && isNdtMarkingDrag)
            || (typeof isNdtPinching !== 'undefined' && isNdtPinching)
        );
    }

    function scheduleFlushPendingRemoteSync() {
        if (_flushRemoteTimer) clearTimeout(_flushRemoteTimer);
        _flushRemoteTimer = setTimeout(() => {
            _flushRemoteTimer = null;
            flushPendingRemoteSync();
        }, 40);
    }

    async function flushPendingRemoteSync() {
        if (!_pendingRemoteData) return;
        if (isRealtimeUiGestureBusy() || _syncInFlight) {
            scheduleFlushPendingRemoteSync();
            return;
        }
        const data = _pendingRemoteData;
        _pendingRemoteData = null;
        await applyRemoteSnapshotFromListener(data);
    }

    async function applyRemoteSnapshotFromListener(data) {
        if (!data) return;
        isRemoteSyncing = true;
        try {
            const isChanged = await applyMergedRemoteData(data);

            if (isChanged) {
                _suppressSyncOnSave = true;
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                _suppressSyncOnSave = false;
                refreshCurrentBuildingFromState();

                if (state.currentBuildingId) {
                    const activeBldg = (window.state.buildings || []).find(b => b.id === state.currentBuildingId);
                    if (activeBldg) {
                        state.currentBuilding = activeBldg;
                        applyInspectionSelectsFromBuilding(activeBldg);
                        if (state.currentFloor) {
                            applyFloorMapStyleSettings(state.currentFloor, state.currentBuildingId);
                            loadFloorDrawing(state.currentFloor, { preserveView: true });
                        }
                    } else {
                        state.currentBuilding = null;
                        state.currentBuildingId = null;
                    }
                }

                const activeTab = state.currentTab || 'tab-home';
                if (typeof renderBuildingSelector === 'function') renderBuildingSelector();
                if (activeTab === 'tab-home' && typeof renderDashboard === 'function') renderDashboard();
                if (activeTab === 'tab-map') {
                    if (typeof drawCanvas === 'function') drawCanvas();
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                } else if (activeTab === 'tab-survey') {
                    if (typeof renderSurveyTable === 'function') renderSurveyTable();
                } else if (activeTab === 'tab-stats') {
                    if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
                } else if (activeTab === 'tab-ndt') {
                    if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
                    if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
                }
            }
        } catch (e) {
            console.error('Remote sync apply error:', e);
        } finally {
            setTimeout(() => {
                isRemoteSyncing = false;
                if (_syncPending) {
                    _syncPending = false;
                    if (typeof scheduleSyncToFirebase === 'function') {
                        scheduleSyncToFirebase({ skipMarkCurrent: true });
                    }
                } else if (typeof scheduleFlushPendingRemoteSync === 'function') {
                    scheduleFlushPendingRemoteSync();
                }
            }, 300);
        }
    }

    let auth = null;
    window._justRegistering = false;

    // 앱 번호. 포팅하면 이 번호가 1 오르고, 같은 번호가 Storage releases/latest.json 에 올라간다.
    window.BSA_APP_BUILD = { versionCode: 46, versionName: '1.3.38' };

    function isNativeAndroidApp() {
        try {
            return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
                && window.Capacitor.isNativePlatform()
                && String(window.Capacitor.getPlatform?.() || '').toLowerCase() === 'android');
        } catch (_) {
            return false;
        }
    }

    function applyWebViewBadge() {
        const badge = document.getElementById('appVersionBadge');
        if (!badge) return;
        const name = (window.BSA_APP_BUILD && window.BSA_APP_BUILD.versionName) || '1.3.0';
        const label = isNativeAndroidApp() ? '웹뷰 (GitHub Pages)' : '웹';
        // 실제 코드 버전(배포 때 커밋 해시가 박힌다)도 같이 — v1.3.2는 앱 껍데기 번호라 배포해도 안 바뀌어서
        // 태블릿이 최신 코드인지 화면으로 확인할 방법이 없었다(2026-09-29). web-version.json의 short와 비교하면 된다.
        const code = String(window.BSA_APP_VERSION || '').trim();
        const codeHtml = code ? ` · <span class="app-code-version" title="코드 버전 — 설정의 새로고침으로 최신이 됩니다">${code.replace(/[^0-9A-Za-z_.-]/g, '')}</span>` : '';
        badge.innerHTML = `<i class="fa-solid fa-globe"></i> v${name} · ${label}${codeHtml}`;
    }
    applyWebViewBadge();

    window.reloadWebAppFromServer = function () {
        if (window._authSubmitInFlight || window._justRegistering) return;
        // 2026-10-16 오프라인·불안정 망에서 새로고침하면 앱이 안 열린다 — 서버에 닿는 게 확인될 때만 새로고침
        if (navigator.onLine === false) return;
        const go = async () => {
            try {
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                const tm = ctl ? setTimeout(() => ctl.abort(), 6000) : null;
                const r = await fetch('index.html?ping=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
                if (tm) clearTimeout(tm);
                if (!r || !r.ok) return;
            } catch (_) { return; }
            if (navigator.onLine === false) return;
            try { sessionStorage.removeItem('bsa_web_sha'); } catch (_) { /* ignore */ }
            const url = new URL(window.location.href);
            url.searchParams.set('_r', String(Date.now()));
            window.location.replace(url.toString());
        };
        // 고른 사진이 아직 줄여지는 중이면 그것부터 끝낸 뒤 저장한다(안 기다리면 그 사진은 새로고침과 함께 사라진다)
        const pendingPhotoSaves = Array.from(window._defectPhotoSaves || []);
        const flush = Promise.all(pendingPhotoSaves.map((p) => Promise.resolve(p).catch(() => {}))).then(() => (
            (typeof flushLocalPhotoPersistBeforeUnload === 'function')
                ? flushLocalPhotoPersistBeforeUnload()
                : null
        ));
        Promise.race([
            flush,
            new Promise((resolve) => window.setTimeout(resolve, pendingPhotoSaves.length ? 6000 : 2500))
        ]).then(go, go);
    };

    /**
     * 지금 자동 새로고침을 하면 입력 중인 것이 날아가는 상태인가.
     * 2026-10-07: 다른 직원이 배포한 직후, 사진 파일 창을 닫고 앱 창으로 돌아오는 순간(focus)에 자동 새로고침이
     * 걸려 방금 고른 사진이 줄여지기도 전에 화면이 다시 떴다(광주교회 B1F NO.44 — 17:14 배포, 17:15~17:17 작성).
     * 입력 창이 열려 있거나 사진을 저장하는 중이면 자동으로는 새로고침하지 않는다. 안내 띠는 그대로 뜬다.
     */
    function isAutoReloadUnsafeNow() {
        if (window._defectPhotoSaves && window._defectPhotoSaves.size > 0) return true;
        if (typeof isDefectModalOpen === 'function' && isDefectModalOpen()) return true;
        if (typeof isOverviewPhotosModalOpen === 'function' && isOverviewPhotosModalOpen()) return true;
        if (window.bsaPrevSummary && window.bsaPrevSummary.isBusy()) return true;
        const ndtModalEl = document.getElementById('ndtModal');
        if (ndtModalEl && ndtModalEl.classList.contains('open')) return true;
        return false;
    }

    function isLoginOverlayOpen() {
        if (document.body && document.body.classList.contains('auth-gate-active')) return true;
        const overlay = document.getElementById('loginOverlay');
        if (!overlay) return false;
        const css = overlay.style.cssText || '';
        if (/display:\s*none/i.test(css)) return false;
        if (overlay.style.display === 'none') return false;
        const computed = window.getComputedStyle ? window.getComputedStyle(overlay).display : '';
        return computed !== 'none';
    }

    function setAuthGateActive(on) {
        if (!document.body) return;
        document.body.classList.toggle('auth-gate-active', !!on);
    }

    (function bindRemoteWebRefresh() {
        const KEY = 'bsa_web_sha';
        async function fetchWebVersionMeta() {
            const r = await fetch('web-version.json?t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return null;
            const text = await r.text();
            const cleaned = text.replace(/^\uFEFF/, '').trim();
            if (!cleaned) return null;
            return JSON.parse(cleaned);
        }
        async function checkRemoteWebVersion() {
            if (window._authSubmitInFlight || window._justRegistering || isLoginOverlayOpen()) return;
            if (navigator.onLine === false) return;
            // 창에 돌아올 때 옛 버전인지 먼저 판단해 안내 띠를 띄운다(동기화 차단과 같은 기준)
            if (typeof window.refreshAppVersionGate === 'function') {
                try { await window.refreshAppVersionGate(true); } catch (_e) { /* ignore */ }
            }
            try {
                const meta = await fetchWebVersionMeta();
                const sha = meta && (meta.sha || meta.short);
                if (!sha || sha === 'local') return;
                const prev = sessionStorage.getItem(KEY);
                if (prev && prev !== sha) {
                    // 2026-11-06 스르륵 업데이트: 쓰는 화면을 새로고침하지 않는다. 뒤에서 받아 두고 앱을 내릴 때 바꾼다.
                    if (silentUpdate) await silentUpdate.noteNewVersion(sha);
                    else if (!isSilentUpdateBusy() && document.visibilityState === 'hidden') window.reloadWebAppFromServer();
                    return;
                }
                if (!prev) sessionStorage.setItem(KEY, sha);
            } catch (_) { /* offline */ }
        }
        /** 입력 중이면 미룬다 + 올리기·받기 중에도 끊지 않는다 */
        function isSilentUpdateBusy() {
            if (isAutoReloadUnsafeNow()) return true;
            if (window.BsaTypingPopup && window.BsaTypingPopup.isOpen()) return true;
            return !!(_syncInFlight || _offlineReturnRunning || _offlinePrepRunning);
        }
        const silentApi = window.BSA && window.BSA.silentUpdate;
        const silentUpdate = silentApi ? silentApi.createController({
            prefetch: () => {
                const P = window.BsaOfflinePrecache;
                return P ? P.prefetchApp() : true;
            },
            isBusy: isSilentUpdateBusy,
            isOnline: () => navigator.onLine !== false,
            apply: () => {
                saveSilentResumeView();
                window.reloadWebAppFromServer();
            }
        }) : null;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (silentUpdate) silentUpdate.onVisible();
                checkRemoteWebVersion();
            } else if (silentUpdate) {
                silentUpdate.onHidden();
            }
        });
        window.addEventListener('focus', checkRemoteWebVersion);
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) checkRemoteWebVersion();
        });
        // 첫 로드 직후 자동 reload는 로그인·초기화와 겹치므로 생략 (탭 복귀·포커스 시만 확인)
        if (isNativeAndroidApp()) {
            setInterval(checkRemoteWebVersion, 45000);
        }
        if (typeof initMobileBackButton === 'function') initMobileBackButton();
    })();

    function startSingleTabHeartbeat() {
        if (window._bsaSingleTabHeartbeatStarted) return;
        window._bsaSingleTabHeartbeatStarted = true;
        const KEY = 'bsa_live_tab_beats';
        const tabId = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const beat = () => {
            try {
                const now = Date.now();
                const prev = JSON.parse(localStorage.getItem(KEY) || '{}');
                let otherLive = 0;
                Object.keys(prev).forEach((id) => {
                    if (now - Number(prev[id] || 0) > 12000) delete prev[id];
                    else if (id !== tabId) otherLive += 1;
                });
                prev[tabId] = now;
                localStorage.setItem(KEY, JSON.stringify(prev));
                if (otherLive > 0 && !window._bsaMultiTabWarned) {
                    window._bsaMultiTabWarned = true;
                    if (typeof window.showToast === 'function') {
                        window.showToast('같은 앱이 다른 탭에서도 열려 있습니다. 읽기 할당량을 아끼려면 탭을 하나만 남겨 주세요.', 'warning', 8000);
                    }
                }
            } catch (_e) { /* ignore */ }
        };
        beat();
        setInterval(beat, 4000);
        window.addEventListener('beforeunload', () => {
            try {
                const prev = JSON.parse(localStorage.getItem(KEY) || '{}');
                delete prev[tabId];
                localStorage.setItem(KEY, JSON.stringify(prev));
            } catch (_e) { /* ignore */ }
        });
    }

    const AUTO_LOGIN_KEY = 'bsa_auto_login';

    function isAutoLoginOn() {
        try { return localStorage.getItem(AUTO_LOGIN_KEY) === '1'; } catch (_e) { return false; }
    }

    function syncAutoLoginButtons() {
        const on = isAutoLoginOn();
        document.querySelectorAll('.auto-login-toggle').forEach((btn) => {
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-toggle-on', on);
                icon.classList.toggle('fa-toggle-off', !on);
            }
        });
    }

    async function applyAuthPersistence() {
        if (!auth || !firebase.auth || !firebase.auth.Auth || !firebase.auth.Auth.Persistence) return;
        const mode = isAutoLoginOn()
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.NONE;
        try { await auth.setPersistence(mode); } catch (err) {
            console.warn('로그인 유지 설정 실패:', err);
        }
    }

    async function setAutoLoginOn(on) {
        try { localStorage.setItem(AUTO_LOGIN_KEY, on ? '1' : '0'); } catch (_e) { /* ignore */ }
        syncAutoLoginButtons();
        await applyAuthPersistence();
        if (typeof window.showToast === 'function') {
            window.showToast(
                on ? '자동 로그인을 켰습니다. 다음에 이 계정으로 들어갑니다.' : '자동 로그인을 껐습니다. 다음에 열면 로그인 화면이 나옵니다.',
                'info',
                3500
            );
        }
    }

    function initFirebaseSync() {
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                db = firebase.firestore();
                if (typeof db.enablePersistence === 'function') {
                    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
                        if (err && err.code === 'failed-precondition') {
                            if (typeof window.showToast === 'function') {
                                window.showToast('다른 탭에서 이미 앱이 열려 있습니다. Firestore 읽기가 탭마다 나가니 하나만 남겨 주세요.', 'warning', 8000);
                            }
                        } else if (err && err.code !== 'unimplemented') {
                            console.warn('Firestore 오프라인 지속성 경고:', err);
                        }
                    });
                }
                startSingleTabHeartbeat();
                if (firebase.auth) {
                    auth = firebase.auth();
                    applyAuthPersistence().finally(() => {
                        auth.onAuthStateChanged(handleAuthStateChange);
                    });
                } else {
                    console.warn('Firebase Auth SDK가 로드되지 않았습니다.');
                }
                updateOnlineBadge(true);
            } else {
                console.warn('Firebase SDK가 로드되지 않았습니다. 오프라인 로컬 모드로 동작합니다.');
                updateOnlineBadge(false);
            }
        } catch (err) {
            console.error('Firebase 초기화 오류:', err);
            updateOnlineBadge(false);
        }
    }

    function updateOnlineBadge(isOnline) {
        const badge = document.getElementById('onlineStatusBadge');
        if (badge) {
            if (isOnline) {
                badge.style.background = 'rgba(34, 197, 94, 0.15)';
                badge.style.color = '#4ade80';
                badge.style.borderColor = 'rgba(34, 197, 94, 0.3)';
                badge.innerHTML = '<i class="fa-solid fa-wifi"></i> 온라인 (실시간 동기화중)';
            } else {
                badge.style.background = 'rgba(239, 68, 68, 0.15)';
                badge.style.color = '#f87171';
                badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                badge.innerHTML = '<i class="fa-solid fa-wifi"></i> 오프라인 (로컬 보관중)';
            }
        }
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    }

    // --- 무거운 이미지(도면/사진) 개별 문서 저장 헬퍼 ---
    // Firestore 문서 1개 1MB 한도 대응: 도면/사진은 각자 별도 문서에 저장하고,
    // 회사 메타데이터 문서(safety_app/{companyId})에는 참조(ID)만 남긴다.

    // 옛 자리 번호 ID. 목록 없는 옛 데이터를 읽거나 쓸어낼 때만 쓴다 — 새 사진은 createDefectPhotoId.
    function getPhotoDocId(defectId, index, kind) {
        if (kind === 'prev') return `${defectId}_prev_${index}`;
        return `${defectId}_${index}`;
    }

    /**
     * 새 사진 고유 ID (사진 고유 ID 전환 3단계, 2026-09-27). 한 번 받으면 사진이 지워질 때까지 안 바뀐다.
     * `결함id_` 접두어는 지킨다 — 캐시 무효화·건물 찾기가 접두어로 사진을 찾는다.
     * 꼬리는 u로 시작해 옛 자리 번호(_0, _prev_0)와 절대 겹치지 않는다.
     */
    function createDefectPhotoId(defectId, kind) {
        const tail = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const photoId = kind === 'prev' ? `${defectId}_prev_${tail}` : `${defectId}_${tail}`;
        // 2026-10-19 진행률: 이 기기에서 새로 넣은 사진 — 서버(Storage) 확인 때 「올라감」
        if (typeof journalRecord === 'function') journalRecord('photo', photoId, journalFloorKeyOfDefect(defectId));
        return photoId;
    }

    /** 저장 전 결함의 사진 목록을 [{ id, url }]로 받아 둔다. visibleIds는 지울 후보(예전과 같은 개수 규칙). */
    function captureDefectPhotoPairs(d, kind) {
        const photos = kind === 'prev' ? (d && d.prevRoundPhotos) : (d && d.photos);
        const ids = kind === 'prev' ? (d && d.prevRoundPhotoIds) : (d && d.photoIds);
        const photoLen = Array.isArray(photos) ? photos.length : 0;
        const idLen = Array.isArray(ids) ? ids.length : 0;
        const pairs = [];
        for (let i = 0; i < Math.max(photoLen, idLen); i++) {
            const id = defectPhotoIdAt(d, i, kind);
            const url = (Array.isArray(photos) && photos[i]) || (window._photoCache && window._photoCache[id]) || null;
            pairs.push({ id, url });
        }
        const visibleCount = photoLen || idLen;
        return { pairs, visibleIds: pairs.slice(0, visibleCount).map((p) => p.id) };
    }

    function captureDefectPhotoIdsBefore(d) {
        return { cur: captureDefectPhotoPairs(d), prev: captureDefectPhotoPairs(d, 'prev') };
    }

    /**
     * 사진 목록에 ID를 매긴다. 저장 전에 있던 사진(같은 URL)은 원래 ID를 그대로 쓰고, 새 사진만 새 ID.
     * 가운데 사진을 지워도 뒤 사진 ID가 안 바뀌어서 네 저장소가 따라 바뀔 일이 없다.
     * 그림을 그려 넣은 사진은 URL이 바뀌므로 새 ID — 다른 기기의 옛 그림 캐시가 남을 수 없다.
     */
    function assignDefectPhotoIds(defectId, photos, before, kind) {
        const pool = new Map();
        ((before && before.pairs) || []).forEach((p) => {
            if (!p || !p.id || !p.url) return;
            if (!pool.has(p.url)) pool.set(p.url, []);
            pool.get(p.url).push(p.id);
        });
        const used = new Set();
        return photos.map((url) => {
            const candidates = pool.get(url);
            while (candidates && candidates.length) {
                const id = candidates.shift();
                if (!used.has(id)) { used.add(id); return id; }
            }
            let id = createDefectPhotoId(defectId, kind);
            while (used.has(id)) id = createDefectPhotoId(defectId, kind);
            used.add(id);
            return id;
        });
    }

    /**
     * 결함의 i번째 사진 ID — 저장된 목록(photoIds / prevRoundPhotoIds)을 먼저 본다.
     * 목록에 없으면(옛 데이터) 예전처럼 자리 번호로 만든다.
     *
     * 사진 고유 ID 전환 1단계(2026-09-23). 지금은 목록 자체가 자리 번호로 매겨져서 결과가
     * 똑같다. 3단계에서 새 사진이 고유 ID를 받으면 이 함수를 거치는 곳은 손대지 않아도
     * 그 ID를 따라간다. 자리 번호가 사진 ID면 가운데 사진을 지울 때 뒤 사진이 ID를 물려받아
     * 네 저장소(IndexedDB·Firestore·Storage·캐시)가 다 따라 바뀌어야 했다 — 09-21·22 사고.
     */
    function defectPhotoIdAt(d, i, kind) {
        const ids = kind === 'prev' ? (d && d.prevRoundPhotoIds) : (d && d.photoIds);
        return (Array.isArray(ids) && ids[i]) || getPhotoDocId(d && d.id, i, kind);
    }

    function defectPhotoIdList(d, count, kind) {
        const out = [];
        for (let i = 0; i < count; i++) out.push(defectPhotoIdAt(d, i, kind));
        return out;
    }

    function getOverviewPhotoDocId(buildingId, photoId) {
        return `ov_${buildingId}_${photoId}`;
    }

    function createOverviewPhotoId() {
        return `p${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function getBuildingOverviewPhotos(bldg) {
        if (!bldg) return [];
        if (!Array.isArray(bldg.overviewPhotos)) bldg.overviewPhotos = [];
        return bldg.overviewPhotos;
    }

    function isOverviewPhotosModalOpen() {
        const modal = document.getElementById('overviewPhotosModal');
        return !!(modal && (modal.classList.contains('open') || modal.style.display === 'flex'));
    }

    function closeOverviewPhotosModal() {
        const modal = document.getElementById('overviewPhotosModal');
        if (!modal) return;
        modal.classList.remove('open');
        modal.style.display = 'none';
        window._overviewPhotosBuildingId = null;
    }

    async function loadOverviewPhotoDataUrl(bldgId, photoId) {
        if (!bldgId || !photoId) return null;
        const key = getOverviewPhotoDocId(bldgId, photoId);
        if (window._photoCache && window._photoCache[key]) {
            maybeScheduleMigrateFromLocal(key, window._photoCache[key]);
            return window._photoCache[key];
        }
        try {
            const local = await idbGet('photos', key);
            if (typeof local === 'string' && local.length > 32) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[key] = local;
                maybeScheduleMigrateFromLocal(key, local);
                return local;
            }
        } catch (_) { /* ignore */ }
        if (db && window.state.companyId) {
            try {
                const snap = await fetchPhotosDocIfAllowed(key);
                if (!snap) return null;
                const url = await photoUrlFromCloudSnap(snap, key);
                if (typeof url === 'string' && url.length > 32) {
                    if (!window._photoCache) window._photoCache = {};
                    window._photoCache[key] = url;
                    idbSetPhotoPreferDataUrl(key, url).then((ok) => {
                        if (ok) _idbPersistedPhotoKeys.add(key);
                    });
                    return url;
                }
            } catch (e) {
                console.warn('전경사진 클라우드 조회 실패:', key, e);
            }
        }
        return null;
    }

    // --- 균열게이지·팁 비교사진: localStorage 저장본 밖으로(IndexedDB + 클라우드), 2026-09-30 ---
    // 순수 규칙은 js/core/gauge-photo-store.js. 사진은 측정지 사진과 같은 저장(str_건물_번호)을 쓴다.
    // 상태 변수는 window에 둔다 — 앱 초기화 중(TDZ) 저장·불러오기에서 불려도 안전하게.
    function gaugePhotoApi() {
        return (window.BSA && window.BSA.gaugePhotos) || null;
    }

    function gaugeVerifiedSet() {
        if (!window.__bsaGaugeVerified) window.__bsaGaugeVerified = new Set();
        return window.__bsaGaugeVerified;
    }

    /** 기기 저장용 — IndexedDB에 확인된 비교사진만 빼고 번호만 남긴다(확인 전 사진은 그대로) */
    function gaugeStripForLocal(rec, stats) {
        const gp = gaugePhotoApi();
        if (!gp || !rec || (!rec.crackGaugeLog && !rec.crackTipLog)) return rec;
        const verified = gaugeVerifiedSet();
        const r = gp.stripForLocalSave(rec, (pid) => verified.has(pid));
        if (stats) {
            stats.stripped += r.stripped;
            stats.inlineLeft += r.inlineLeft;
        }
        if (gp.hydrateTasksOf(rec).length) scheduleGaugePhotoHydrate();
        return r.rec;
    }

    /** 게이지 기록이 있는 모든 결함·비파괴 항목 — cb(rec, floorKey, bldgId, kind) */
    function forEachGaugePhotoRecord(cb, onlyBldgId) {
        const visit = (map, kind) => {
            Object.keys(map || {}).forEach((key) => {
                if (onlyBldgId && !key.startsWith(onlyBldgId + '_')) return;
                const bldg = findBuildingOfFloorKey(key);
                const bldgId = bldg ? bldg.id : (onlyBldgId || String(key).split('_')[0]);
                (map[key] || []).forEach((rec) => {
                    if (rec && (rec.crackGaugeLog || rec.crackTipLog)) cb(rec, key, bldgId, kind);
                });
            });
        };
        visit(window.state.ndtData, 'ndt');
        visit(window.state.defects, 'pin');
    }

    // 이름은 문자열 그대로 쓴다(const는 초기화 전에 불리면 TDZ 오류)
    function openLocalBackupDb() {
        if (window.__bsaLocalBackupDb) return window.__bsaLocalBackupDb;
        window.__bsaLocalBackupDb = new Promise((resolve, reject) => {
            if (!window.indexedDB) { reject(new Error('IndexedDB 없음')); return; }
            const req = indexedDB.open('bsa-local-backups', 1);
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        window.__bsaLocalBackupDb.catch(() => { window.__bsaLocalBackupDb = null; });
        return window.__bsaLocalBackupDb;
    }
    async function localBackupGet(key) {
        const d = await openLocalBackupDb();
        return new Promise((resolve, reject) => {
            const req = d.transaction('blobs', 'readonly').objectStore('blobs').get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }
    async function localBackupDelete(key) {
        const d = await openLocalBackupDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }
    async function localBackupPut(key, value) {
        const d = await openLocalBackupDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    /**
     * 옮기기 전 기기 저장본 1회 백업(IndexedDB bsa-local-backups/blobs, 'pre-gauge-photo-migration:회사').
     * 이미 있으면 그대로. 쓰고 다시 읽어 같아야 true — 아니면 옮기지 않는다.
     * 되살리기(콘솔): window.restorePreGaugePhotoMigrationBackup()
     */
    async function ensurePreGaugeMigrationBackup() {
        const cid = window.state.companyId || '';
        const key = 'pre-gauge-photo-migration:' + (cid || 'local');
        try {
            const have = await localBackupGet(key);
            if (have && typeof have.raw === 'string') return true;
            const raw = localStorage.getItem(getLocalStorageStateKey(cid));
            if (typeof raw !== 'string' || !raw) return true; // 저장본이 없으면 백업할 것도 없다
            const entry = { raw, savedAt: Date.now(), companyId: cid, storageKey: getLocalStorageStateKey(cid) };
            await localBackupPut(key, entry);
            const back = await localBackupGet(key);
            const ok = !!(back && back.raw === raw);
            if (ok) console.info('[비교사진] 옮기기 전 기기 저장본을 백업했습니다:', key, raw.length + '자');
            return ok;
        } catch (e) {
            console.warn('[비교사진] 옮기기 전 백업 실패 — 옮기지 않습니다:', e);
            return false;
        }
    }

    window.restorePreGaugePhotoMigrationBackup = async function () {
        const cid = window.state.companyId || '';
        const entry = await localBackupGet('pre-gauge-photo-migration:' + (cid || 'local'));
        if (!entry || typeof entry.raw !== 'string') { console.warn('백업 없음'); return false; }
        localStorage.setItem(entry.storageKey || getLocalStorageStateKey(cid), entry.raw);
        console.info('옮기기 전 저장본을 되돌렸습니다. 새로고침하세요.');
        return true;
    };

    function gaugePhotoKeyOf(bldgId, pid) {
        return getStrengthPhotoDocId(bldgId, pid);
    }

    function uploadGaugePhotoToCloud(bldgId, pid, url) {
        if (typeof persistPhotoToCloud !== 'function' || !pid || !gaugePhotoApi().isInlineImage(url)) return;
        try {
            if (!db || !window.state.companyId) return;
        } catch (_e) { return; }
        persistPhotoToCloud(gaugePhotoKeyOf(bldgId, pid), url).catch((e) => {
            console.warn('[비교사진] 클라우드 올리기 실패(다음 실행 때 다시):', pid, e);
        });
    }

    /**
     * 저장본의 data URL 비교사진을 IndexedDB로 옮긴다. 쓰고 → 다시 읽어 같으면 → 번호를 붙이고 확인 표시.
     * 확인이 안 되면 data URL을 그대로 둔다(저장본에 남음). 옮긴 게 있으면 다시 저장해 자리를 비운다.
     */
    async function migrateInlineGaugePhotos() {
        const gp = gaugePhotoApi();
        if (!gp || typeof idbSet !== 'function' || typeof idbGet !== 'function') return 0;
        if (window.__bsaGaugeMigrating) { window.__bsaGaugeMigrateAgain = true; return 0; }
        window.__bsaGaugeMigrating = true;
        let moved = 0;
        try {
            const verified = gaugeVerifiedSet();
            const tasks = [];
            forEachGaugePhotoRecord((rec, key, bldgId, kind) => {
                gp.migrationTasksOf(rec, (pid) => verified.has(pid)).forEach((slot) => tasks.push({ rec, key, bldgId, kind, slot }));
            });
            if (!tasks.length) return 0;
            if (!(await ensurePreGaugeMigrationBackup())) return 0;
            const touched = new Map();
            for (const t of tasks) {
                const log = t.rec[t.slot.log];
                const url = t.slot.url;
                if (!log || log[t.slot.slot] !== url) continue;
                const pid = log[t.slot.idField] || gp.newPhotoId();
                const docKey = gaugePhotoKeyOf(t.bldgId, pid);
                const wrote = await idbSet('photos', docKey, url);
                const back = wrote ? await idbGet('photos', docKey) : null;
                if (back !== url) {
                    console.warn('[비교사진] IndexedDB 확인 실패 — 저장본에 그대로 둡니다:', docKey);
                    continue;
                }
                if (log[t.slot.slot] !== url) continue; // 쓰는 사이 사용자가 사진을 바꿈
                if (log[t.slot.idField] !== pid) {
                    log[t.slot.idField] = pid;
                    touched.set(t.rec, t);
                }
                verified.add(pid);
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[docKey] = url;
                try { _idbPersistedPhotoKeys.add(docKey); } catch (_e) { /* 초기화 전 */ }
                uploadGaugePhotoToCloud(t.bldgId, pid, url);
                moved += 1;
            }
            touched.forEach((t) => {
                // 번호가 다른 기기로 가도록 수정 시각을 올리고 층을 올린다
                if (t.kind === 'ndt') touchNdtUpdatedAt(t.rec);
                else touchDefectUpdatedAt(t.rec);
                if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(t.key);
            });
            if (moved) {
                console.info('[비교사진] 사진 ' + moved + '장을 IndexedDB로 옮겼습니다(기기 저장본에서 뺌).');
                saveStateToLocalStorage();
            }
            return moved;
        } catch (e) {
            console.warn('[비교사진] 옮기기 실패(저장본은 그대로):', e);
            return moved;
        } finally {
            window.__bsaGaugeMigrating = false;
            if (window.__bsaGaugeMigrateAgain) {
                window.__bsaGaugeMigrateAgain = false;
                scheduleGaugePhotoMigrate();
            }
        }
    }
    window.migrateInlineGaugePhotos = migrateInlineGaugePhotos;

    function scheduleGaugePhotoMigrate() {
        if (window.__bsaGaugeMigrateTimer) return;
        window.__bsaGaugeMigrateTimer = setTimeout(() => {
            window.__bsaGaugeMigrateTimer = null;
            migrateInlineGaugePhotos();
        }, 400);
    }

    /** 번호만 있고 메모리에 없는 비교사진을 IndexedDB(없으면 클라우드)에서 채운다. 채운 장수 반환 */
    async function ensureGaugePhotosLoadedFor(rec, bldgIdHint) {
        const gp = gaugePhotoApi();
        if (!gp || !rec) return 0;
        const tasks = gp.hydrateTasksOf(rec);
        if (!tasks.length) return 0;
        let bldgId = bldgIdHint || '';
        if (!bldgId) {
            forEachGaugePhotoRecord((r, key, bid) => { if (r === rec) bldgId = bid; });
        }
        if (!bldgId) return 0;
        const verified = gaugeVerifiedSet();
        let filled = 0;
        for (const t of tasks) {
            const docKey = gaugePhotoKeyOf(bldgId, t.pid);
            let url = null;
            let fromIdb = false;
            try {
                const local = await idbGet('photos', docKey);
                if (typeof local === 'string' && local.length > 32) { url = local; fromIdb = true; }
            } catch (_e) { /* 아래 클라우드 */ }
            if (!url) url = await loadStrengthPhotoDataUrl(bldgId, t.pid);
            if (!url) continue;
            const log = rec[t.log];
            if (!log || log[t.idField] !== t.pid || log[t.slot]) continue;
            log[t.slot] = url;
            filled += 1;
            if (fromIdb) {
                verified.add(t.pid);
                uploadGaugePhotoToCloud(bldgId, t.pid, url);
            } else if (gp.isInlineImage(url)) {
                const ok = await idbSet('photos', docKey, url);
                if (ok && (await idbGet('photos', docKey)) === url) verified.add(t.pid);
            }
        }
        return filled;
    }

    /** 한 건물(없으면 전부)의 비교사진을 메모리로 — 한글·PDF 내보내기 전에 기다린다 */
    async function ensureGaugePhotosLoaded(bldgId) {
        const list = [];
        forEachGaugePhotoRecord((rec, key, bid) => list.push([rec, bid]), bldgId || null);
        let filled = 0;
        for (const [rec, bid] of list) {
            try { filled += await ensureGaugePhotosLoadedFor(rec, bid); } catch (e) {
                console.warn('[비교사진] 불러오기 실패:', e);
            }
        }
        return filled;
    }
    window.ensureGaugePhotosLoaded = ensureGaugePhotosLoaded;

    function scheduleGaugePhotoHydrate() {
        if (window.__bsaGaugeHydrateTimer) return;
        window.__bsaGaugeHydrateTimer = setTimeout(async () => {
            window.__bsaGaugeHydrateTimer = null;
            const n = await ensureGaugePhotosLoaded(null).catch(() => 0);
            if (!n) return;
            try {
                if (typeof renderCrackMonitorPhotoFrames === 'function' && typeof isNdtCrackMonitorModalOpen === 'function'
                    && isNdtCrackMonitorModalOpen()) renderCrackMonitorPhotoFrames();
                if (state.currentTab === 'tab-ndt' && typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
            } catch (_e) { /* 화면 갱신만 */ }
        }, 300);
    }

    /** 앱 시작: 번호만 남은 사진 채우기 → 저장본 data URL 옮기기 → 아직 안 올라간 사진 클라우드로 */
    function scheduleGaugePhotoStartup() {
        setTimeout(async () => {
            try {
                await ensureGaugePhotosLoaded(null);
                await migrateInlineGaugePhotos();
                const verified = gaugeVerifiedSet();
                forEachGaugePhotoRecord((rec, key, bid) => {
                    gaugePhotoApi().slotsOf(rec).forEach((sl) => {
                        if (sl.pid && verified.has(sl.pid)) uploadGaugePhotoToCloud(bid, sl.pid, sl.url);
                    });
                });
            } catch (e) {
                console.warn('[비교사진] 시작 정리 실패:', e);
            }
        }, 1500);
    }

    // --- 콘크리트 반발경도 R값 측정지 사진 저장(전경사진과 동일한 패턴: IndexedDB + 클라우드) ---
    // 위치 슬롯(strengthSlots[i])마다 photoId 하나만 들고, 실제 사진 데이터는 여기 저장한다.
    function getStrengthPhotoDocId(bldgId, photoId) {
        return `str_${bldgId}_${photoId}`;
    }

    async function loadStrengthPhotoDataUrl(bldgId, photoId) {
        if (!bldgId || !photoId) return null;
        const key = getStrengthPhotoDocId(bldgId, photoId);
        if (window._photoCache && window._photoCache[key]) {
            maybeScheduleMigrateFromLocal(key, window._photoCache[key]);
            return window._photoCache[key];
        }
        try {
            const local = await idbGet('photos', key);
            if (typeof local === 'string' && local.length > 32) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[key] = local;
                maybeScheduleMigrateFromLocal(key, local);
                return local;
            }
        } catch (_) { /* ignore */ }
        if (db && window.state.companyId) {
            try {
                const snap = await fetchPhotosDocIfAllowed(key);
                if (!snap) return null;
                const url = await photoUrlFromCloudSnap(snap, key);
                if (typeof url === 'string' && url.length > 32) {
                    if (!window._photoCache) window._photoCache = {};
                    window._photoCache[key] = url;
                    idbSetPhotoPreferDataUrl(key, url).then((ok) => {
                        if (ok) _idbPersistedPhotoKeys.add(key);
                    });
                    return url;
                }
            } catch (e) {
                console.warn('반발경도 측정지 사진 클라우드 조회 실패:', key, e);
            }
        }
        return null;
    }

    async function saveStrengthPhotoDataUrl(bldgId, photoId, dataUrl) {
        if (!bldgId || !photoId || !dataUrl) return;
        const key = getStrengthPhotoDocId(bldgId, photoId);
        if (!window._photoCache) window._photoCache = {};
        window._photoCache[key] = dataUrl;
        // 로컬(IndexedDB) 저장까지만 기다린다 — 클라우드 업로드(네트워크)까지 기다리면 사용자가
        // 스캔 직후 바로 NDT 항목을 저장할 때 photoId가 아직 안 붙은 채로 저장돼버릴 수 있다.
        // 클라우드 업로드(다른 기기 동기화용)는 실패해도 로컬엔 이미 남아있으니 백그라운드로 진행.
        await persistPhotoUrlToIdb(key, dataUrl);
        persistPhotoToCloud(key, dataUrl).catch((e) => {
            console.warn('반발경도 측정지 사진 업로드 실패:', key, e);
        });
    }

    // opts.keepLocal: 클라우드 사본만 지우고 이 기기 사본(메모리·IndexedDB)은 남긴다 — 되살릴 수 있는 삭제용.
    // 항목이 되살아나면 동기화(ensurePhotoPersistedToStorage)가 이 사본을 다시 올린다(클라우드 표시는 deleteCloudPhoto가 지움).
    async function deleteStrengthPhotoStorage(bldgId, photoId, opts) {
        if (!bldgId || !photoId) return;
        const key = getStrengthPhotoDocId(bldgId, photoId);
        if (!(opts && opts.keepLocal)) {
            if (window._photoCache) delete window._photoCache[key];
            await idbDelete('photos', key);
        }
        try {
            await deleteCloudPhoto(key);
        } catch (e) {
            console.warn('반발경도 측정지 사진 클라우드 삭제 실패:', key, e);
        }
    }

    // 비파괴 장비조사 현장 사진(2026-09-28) — 항목(item.photoIds)과 부동침하·부재변위 구역(group.photoIds)에
    // 여러 장씩 든다. 측정지 사진과 같은 저장(str_건물_id)·동기화 재업로드·정리·백업 보호 길을 탄다.
    function ndtFieldPhotoIdsOf(rec) {
        return (rec && Array.isArray(rec.photoIds)) ? rec.photoIds.filter(Boolean) : [];
    }

    /** 비파괴 항목·구역이 쓰는 사진 id 전부 — 측정지 사진 + 현장 사진 */
    function strengthPhotoIdsOfItem(item) {
        const slots = (item && Array.isArray(item.strengthSlots)) ? item.strengthSlots : [];
        const gp = window.BSA && window.BSA.gaugePhotos;
        // 균열게이지·팁 비교사진도 같은 저장(str_건물_번호) — 삭제 보류·되살리기 재업로드·백업 보호를 같이 탄다
        const gauge = gp ? gp.photoIdsOf(item) : [];
        return slots.map((s) => s && s.photoId).filter(Boolean).concat(ndtFieldPhotoIdsOf(item), gauge);
    }

    function collectStrengthPhotoIdsInBuilding(bldgId) {
        const used = new Set();
        const prefix = `${bldgId}_`;
        [window.state.ndtData || {}, window.state.ndtDisplacementGroups || {}].forEach((map) => {
            Object.keys(map).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (map[k] || []).forEach((item) => strengthPhotoIdsOfItem(item).forEach((p) => used.add(p)));
            });
        });
        // 예전 방식(균열 결함에 붙은 게이지 기록)의 비교사진도 쓰는 중으로 센다
        const gp = window.BSA && window.BSA.gaugePhotos;
        if (gp) {
            Object.keys(window.state.defects || {}).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (window.state.defects[k] || []).forEach((d) => gp.photoIdsOf(d).forEach((p) => used.add(p)));
            });
        }
        return used;
    }

    /**
     * 비파괴 항목이 사라질 때 반발경도 측정지 사진의 클라우드 사본을 지운다(2026-09-22 — 예전엔 항목·건물을
     * 지워도 클라우드에 고아로 남아 용량만 차지했다). 반드시 state에서 항목을 뺀 **뒤에** 부른다.
     * - opts.keepLocal: 되살릴 수 있는 삭제(항목·층 삭제 → 되돌리기·일괄 복원)는 이 기기 사본을 남겨,
     *   항목이 살아나면 동기화가 다시 올린다. 건물 영구 삭제는 사본까지 지운다.
     * - 남은 다른 항목(층 섞임으로 복제된 항목 등)이 같은 사진을 쓰면 지우지 않는다.
     * - opts.deferCloudFloorKey: 클라우드 사본을 바로 지우지 않고 미룬 삭제 대기열에 넣는다(2026-09-30,
     *   다른 사람 수정으로 항목이 되살아날 수 있어서 — processDeferredPhotoDeletes).
     * 실수로 지워도 Storage 삭제 파일 보관(30일)으로 콘솔에서 되살릴 수 있다.
     */
    function releaseStrengthPhotosOfItems(bldgId, removedItems, opts) {
        if (!bldgId || !Array.isArray(removedItems) || !removedItems.length) return 0;
        const pids = new Set();
        removedItems.forEach((it) => strengthPhotoIdsOfItem(it).forEach((p) => pids.add(p)));
        if (!pids.size) return 0;
        const stillUsed = collectStrengthPhotoIdsInBuilding(bldgId);
        const deferFloorKey = opts && opts.deferCloudFloorKey;
        if (deferFloorKey) {
            // 되살아날 수 있는 삭제 — 클라우드 사본은 미룬 삭제 대기열로(deletePhotosForDefect와 같은 이유)
            const free = Array.from(pids).filter((pid) => !stillUsed.has(pid));
            if (!(opts && opts.keepLocal)) {
                free.forEach((pid) => {
                    const key = getStrengthPhotoDocId(bldgId, pid);
                    if (window._photoCache) delete window._photoCache[key];
                    idbDelete('photos', key).catch(() => {});
                });
            }
            enqueueDeferredPhotoDelete({
                kind: 'ndt',
                floorKey: deferFloorKey,
                bldgId,
                recIds: removedItems.map((it) => it && it.id).filter(Boolean),
                pids: free
            });
            return free.length;
        }
        let released = 0;
        pids.forEach((pid) => {
            if (stillUsed.has(pid)) return;
            released++;
            deleteStrengthPhotoStorage(bldgId, pid, { keepLocal: !!(opts && opts.keepLocal) }).catch((e) => {
                console.warn('반발경도 측정지 사진 정리 실패:', pid, e);
            });
        });
        return released;
    }

    async function hydrateBuildingOverviewPhotos(bldg) {
        if (!bldg || !bldg.id) return [];
        const list = getBuildingOverviewPhotos(bldg);
        await Promise.all(list.map(async (p) => {
            if (!p || !p.id) return;
            if (p.dataUrl) {
                const key = getOverviewPhotoDocId(bldg.id, p.id);
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[key] = p.dataUrl;
                maybeScheduleMigrateFromLocal(key, p.dataUrl);
                return;
            }
            const url = await loadOverviewPhotoDataUrl(bldg.id, p.id);
            if (url) p.dataUrl = url;
        }));
        return list;
    }

    async function uploadOverviewPhotos(bldg) {
        if (!bldg || !bldg.id || !Array.isArray(bldg.overviewPhotos)) return;
        if (!window._photoCache) window._photoCache = {};
        if (!window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds = new Set();
        await Promise.all(bldg.overviewPhotos.map(async (p) => {
            if (!p || !p.id || !p.dataUrl) return;
            const key = getOverviewPhotoDocId(bldg.id, p.id);
            window._photoCache[key] = p.dataUrl;
            await persistPhotoToCloud(key, p.dataUrl);
        }));
    }

    async function deleteOverviewPhotoStorage(bldgId, photoId) {
        if (!bldgId || !photoId) return;
        const key = getOverviewPhotoDocId(bldgId, photoId);
        _idbPersistedPhotoKeys.delete(key);
        if (window._photoCache) delete window._photoCache[key];
        if (window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds.delete(key);
        await idbDelete('photos', key);
        try {
            await deleteCloudPhoto(key);
        } catch (e) {
            console.warn('전경사진 클라우드 삭제 실패:', key, e);
        }
    }

    // ---------------------------------------------------------------------------
    // NDT 전용 도면 (감사 O-20-C, 2026-09-28)
    // 예전엔 state.ndtImages(메모리)에만 있어 새로고침하면 사라지고 다른 기기에도 안 갔다.
    // 그림은 사진과 같은 길(IndexedDB + 클라우드)로 저장하고, 층별 참조 { id, at }는 기기 저장과
    // 층 문서(ndt.customDrawing)로 동기화한다. id는 넣을 때마다 새로 — 다른 기기에 옛 그림 캐시가 남지 않게.
    // 참조 id가 ''이면 "전용 도면을 뺐음"(원본 도면 연동)이다.
    // ---------------------------------------------------------------------------
    const _ndtImageLoadedId = {};

    function ndtDrawingRefFor(floorKey) {
        const ref = window.state.ndtDrawingRefs && window.state.ndtDrawingRefs[floorKey];
        return (ref && typeof ref === 'object') ? ref : null;
    }

    function releaseNdtDrawingImage(id) {
        if (!id) return;
        if (window._photoCache) delete window._photoCache[id];
        _idbPersistedPhotoKeys.delete(id);
        idbDelete('photos', id);
        deleteCloudPhoto(id).catch((e) => console.warn('NDT 전용 도면 클라우드 정리 실패:', id, e));
    }

    /** dataUrl이 없으면 전용 도면을 뺀다(층 도면을 쓴다) */
    async function setNdtCustomDrawing(floorKey, dataUrl) {
        if (!floorKey) return;
        if (!window.state.ndtDrawingRefs) window.state.ndtDrawingRefs = {};
        const oldRef = ndtDrawingRefFor(floorKey);
        const id = dataUrl ? `ndtimg_${floorKey}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` : '';
        if (!state.ndtImages) state.ndtImages = {};
        if (dataUrl) {
            state.ndtImages[floorKey] = dataUrl;
            _ndtImageLoadedId[floorKey] = id;
        } else {
            delete state.ndtImages[floorKey];
            delete _ndtImageLoadedId[floorKey];
        }
        window.state.ndtDrawingRefs[floorKey] = { id, at: Date.now() };
        markFloorKeyDirty(floorKey);
        saveStateToLocalStorage();
        if (dataUrl) {
            if (!window._photoCache) window._photoCache = {};
            window._photoCache[id] = dataUrl;
            await persistPhotoUrlToIdb(id, dataUrl);
            persistPhotoToCloud(id, dataUrl).catch((e) => console.warn('NDT 전용 도면 업로드 실패:', id, e));
        }
        if (oldRef && oldRef.id && oldRef.id !== id) releaseNdtDrawingImage(oldRef.id);
    }

    async function loadNdtDrawingDataUrl(id) {
        if (!id) return null;
        if (window._photoCache && window._photoCache[id]) return window._photoCache[id];
        try {
            const local = await idbGet('photos', id);
            if (typeof local === 'string' && local.length > 32) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[id] = local;
                return local;
            }
        } catch (_) { /* ignore */ }
        if (!db || !window.state.companyId) return null;
        try {
            const snap = await fetchPhotosDocIfAllowed(id);
            if (!snap) return null;
            const url = await photoUrlFromCloudSnap(snap, id);
            if (typeof url === 'string' && url.length > 32) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[id] = url;
                idbSetPhotoPreferDataUrl(id, url).then((ok) => { if (ok) _idbPersistedPhotoKeys.add(id); });
                return url;
            }
        } catch (e) {
            console.warn('NDT 전용 도면 클라우드 조회 실패:', id, e);
        }
        return null;
    }

    /** 참조가 가리키는 그림을 state.ndtImages에 올린다. 참조가 없는 옛 데이터는 메모리 것을 그대로 쓴다. */
    async function ensureNdtCustomDrawingLoaded(floorKey) {
        const ref = ndtDrawingRefFor(floorKey);
        if (!ref) return (state.ndtImages && state.ndtImages[floorKey]) || null;
        if (!ref.id) {
            if (state.ndtImages) delete state.ndtImages[floorKey];
            delete _ndtImageLoadedId[floorKey];
            return null;
        }
        if (state.ndtImages && state.ndtImages[floorKey] && _ndtImageLoadedId[floorKey] === ref.id) {
            return state.ndtImages[floorKey];
        }
        const url = await loadNdtDrawingDataUrl(ref.id);
        const now = ndtDrawingRefFor(floorKey);
        if (!url || !now || now.id !== ref.id) return null;   // 그 사이 다른 도면으로 바뀜
        if (!state.ndtImages) state.ndtImages = {};
        state.ndtImages[floorKey] = url;
        _ndtImageLoadedId[floorKey] = ref.id;
        return url;
    }

    /** 이 기기에서 지금 쓸 수 있는 전용 도면인가 — 참조가 바뀌었는데 아직 옛 그림이면 쓰지 않는다 */
    function currentNdtCustomDrawingSrc(floorKey) {
        const img = state.ndtImages && state.ndtImages[floorKey];
        if (!img) return null;
        const ref = ndtDrawingRefFor(floorKey);
        if (!ref) return img;
        return (ref.id && _ndtImageLoadedId[floorKey] === ref.id) ? img : null;
    }

    /** 층 문서의 참조와 합친다 — 나중에 바꾼 쪽(at), 같으면 서버(결함·비파괴 병합과 같은 규칙) */
    function mergeNdtDrawingRef(floorKey, remote) {
        if (!remote || typeof remote !== 'object') return;
        const local = ndtDrawingRefFor(floorKey);
        if (local && (Number(local.at) || 0) > (Number(remote.at) || 0)) return;
        if (!window.state.ndtDrawingRefs) window.state.ndtDrawingRefs = {};
        const changed = !local || local.id !== String(remote.id || '');
        window.state.ndtDrawingRefs[floorKey] = { id: String(remote.id || ''), at: Number(remote.at) || 0 };
        if (!changed) return;
        if (state.ndtImages) delete state.ndtImages[floorKey];
        delete _ndtImageLoadedId[floorKey];
        const curKey = `${state.currentBuildingId}_${state.currentFloor}`;
        if (curKey === floorKey && window.state.currentTab === 'tab-ndt' && typeof loadFloorNdtDrawing === 'function') {
            setTimeout(() => loadFloorNdtDrawing(), 0);
        }
    }

    function flushOverviewCaptionsFromDom() {
        if (!isOverviewPhotosModalOpen()) return;
        const bldgId = window._overviewPhotosBuildingId;
        const bldg = (window.state.buildings || []).find((b) => b.id === bldgId);
        if (!bldg) return;
        const list = getBuildingOverviewPhotos(bldg);
        document.querySelectorAll('#overviewPhotosList .overview-photo-caption').forEach((input) => {
            const id = input.getAttribute('data-overview-id');
            const item = list.find((x) => x.id === id);
            if (item) item.caption = input.value;
        });
    }

    function renderOverviewPhotosList(options = {}) {
        const listEl = document.getElementById('overviewPhotosList');
        if (!listEl) return;
        const force = !!(options && options.force);
        const active = document.activeElement;
        // 캡션 입력 중 전체 리렌더하면 한글 IME·타이핑 내용이 날아감
        if (!force && active && active.classList && active.classList.contains('overview-photo-caption')
            && listEl.contains(active)) {
            return;
        }
        const bldgId = window._overviewPhotosBuildingId;
        const bldg = (window.state.buildings || []).find((b) => b.id === bldgId);
        const titleEl = document.getElementById('overviewPhotosModalTitle');
        if (titleEl) {
            const name = bldg && bldg.name ? String(bldg.name).replace(/^🏢\s*/, '') : '';
            titleEl.innerHTML = `<i class="fa-solid fa-panorama"></i> 전경사진${name ? ` · ${escapeHtml(name)}` : ''}`;
        }
        const list = bldg ? getBuildingOverviewPhotos(bldg) : [];
        if (!list.length) {
            listEl.innerHTML = '<div class="overview-photos-empty"><i class="fa-solid fa-camera" style="display:block;font-size:1.8rem;margin-bottom:0.5rem;color:#cbd5e1;"></i>등록된 전경사진이 없습니다.<br>촬영 또는 갤러리에서 추가하세요.</div>';
            return;
        }
        listEl.innerHTML = list.map((p, idx) => {
            const src = p.dataUrl || (window._photoCache && window._photoCache[getOverviewPhotoDocId(bldgId, p.id)]) || '';
            const cap = escapeHtml(p.caption || '');
            return `
                <div class="overview-photo-item" data-overview-id="${escapeHtml(p.id)}">
                    <div class="overview-photo-thumb-wrap">
                        ${src ? `<img src="${src}" alt="전경사진 ${idx + 1}">` : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">불러오는 중…</div>'}
                        <button type="button" class="overview-photo-delete" data-action="delete-overview" data-overview-id="${escapeHtml(p.id)}" title="삭제"><i class="fa-solid fa-trash"></i></button>
                        ${src ? buildPhotoRotateButtonsHtml(`data-action="rotate-overview" data-overview-id="${escapeHtml(p.id)}" data-rotate-dir="-1"`, `data-action="rotate-overview" data-overview-id="${escapeHtml(p.id)}" data-rotate-dir="1"`) : ''}
                    </div>
                    <input type="text" class="overview-photo-caption" maxlength="120" placeholder="무슨 전경인지 한 줄로 입력 (예: 건물 정면, 옥상 전경)" value="${cap}" data-overview-id="${escapeHtml(p.id)}">
                </div>
            `;
        }).join('');

        const findLiveOverviewItem = (photoId) => {
            const liveBldg = (window.state.buildings || []).find((b) => b.id === window._overviewPhotosBuildingId);
            if (!liveBldg || !photoId) return null;
            return getBuildingOverviewPhotos(liveBldg).find((x) => x.id === photoId) || null;
        };
            const persistOverviewCaptionNow = (syncCloud) => {
                if (typeof saveStateToLocalStorage !== 'function') return;
                if (syncCloud) {
                    saveStateToLocalStorage();
                    const liveBldg = (window.state.buildings || []).find((b) => b.id === window._overviewPhotosBuildingId);
                    if (liveBldg) uploadOverviewPhotos(liveBldg);
                } else {
                    const prev = _suppressSyncOnSave;
                    try {
                        _suppressSyncOnSave = true;
                        saveStateToLocalStorage();
                    } finally {
                        _suppressSyncOnSave = prev;
                    }
                }
            };
        let captionSaveTimer = null;
        const scheduleCaptionLocalSave = () => {
            if (captionSaveTimer) clearTimeout(captionSaveTimer);
            captionSaveTimer = setTimeout(() => persistOverviewCaptionNow(false), 450);
        };

        listEl.querySelectorAll('.overview-photo-caption').forEach((input) => {
            const applyCaptionFromInput = () => {
                const id = input.getAttribute('data-overview-id');
                const item = findLiveOverviewItem(id);
                if (!item) return;
                item.caption = input.value;
            };
            input.addEventListener('input', () => {
                applyCaptionFromInput();
                // 조합 중(한글 IME)에는 저장/동기화로 DOM을 건드리지 않음
                if (input.isComposing || input.composing) return;
                scheduleCaptionLocalSave();
            });
            input.addEventListener('compositionend', () => {
                applyCaptionFromInput();
                scheduleCaptionLocalSave();
            });
            input.addEventListener('change', () => {
                applyCaptionFromInput();
                if (captionSaveTimer) {
                    clearTimeout(captionSaveTimer);
                    captionSaveTimer = null;
                }
                persistOverviewCaptionNow(true);
            });
            input.addEventListener('blur', () => {
                applyCaptionFromInput();
                if (captionSaveTimer) {
                    clearTimeout(captionSaveTimer);
                    captionSaveTimer = null;
                }
                persistOverviewCaptionNow(true);
            });
        });
        listEl.querySelectorAll('[data-action="delete-overview"]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-overview-id');
                const liveBldg = (window.state.buildings || []).find((b) => b.id === window._overviewPhotosBuildingId);
                if (!id || !liveBldg) return;
                if (!await window.confirmDelete('이 전경사진을 삭제할까요?')) return;
                liveBldg.overviewPhotos = getBuildingOverviewPhotos(liveBldg).filter((p) => p.id !== id);
                await deleteOverviewPhotoStorage(liveBldg.id, id);
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                renderOverviewPhotosList({ force: true });
                if (typeof window.showToast === 'function') window.showToast('전경사진을 삭제했습니다.', 'info');
            });
        });
        listEl.querySelectorAll('[data-action="rotate-overview"]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.getAttribute('data-overview-id');
                if (id) rotateOverviewPhoto(id, Number(btn.getAttribute('data-rotate-dir')) < 0 ? -1 : 1);
            });
        });
    }

    async function openOverviewPhotosModal(bldgOrId) {
        let bldg = null;
        if (typeof bldgOrId === 'string') {
            bldg = (window.state.buildings || []).find((b) => b.id === bldgOrId);
        } else if (bldgOrId && typeof bldgOrId === 'object') {
            bldg = bldgOrId;
        } else if (window.state.currentBuildingId) {
            bldg = (window.state.buildings || []).find((b) => b.id === window.state.currentBuildingId)
                || window.state.currentBuilding;
        }
        if (!bldg || !bldg.id) {
            if (typeof window.showToast === 'function') window.showToast('먼저 건축물을 선택하세요.', 'info');
            return;
        }
        window._overviewPhotosBuildingId = bldg.id;
        const modal = document.getElementById('overviewPhotosModal');
        if (!modal) return;
        modal.style.display = 'flex';
        modal.classList.add('open');
        renderOverviewPhotosList({ force: true });
        await hydrateBuildingOverviewPhotos(bldg);
        renderOverviewPhotosList({ force: true });
    }
    window.openOverviewPhotosModal = openOverviewPhotosModal;
    window.closeOverviewPhotosModal = closeOverviewPhotosModal;

    async function addOverviewPhotoFromFile(file) {
        if (!file) return;
        const bldgId = window._overviewPhotosBuildingId || window.state.currentBuildingId;
        const bldg = (window.state.buildings || []).find((b) => b.id === bldgId);
        if (!bldg) {
            if (typeof window.showToast === 'function') window.showToast('건축물을 찾을 수 없습니다.', 'error');
            return;
        }
        const compress = (typeof window.compressDefectPhoto43 === 'function')
            ? window.compressDefectPhoto43
            : null;
        const dataUrl = compress
            ? await compress(file)
            : await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        if (!dataUrl) return;
        const item = { id: createOverviewPhotoId(), caption: '', dataUrl };
        getBuildingOverviewPhotos(bldg).push(item);
        const key = getOverviewPhotoDocId(bldg.id, item.id);
        if (!window._photoCache) window._photoCache = {};
        window._photoCache[key] = dataUrl;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        await persistPhotoUrlToIdb(key, dataUrl);
        uploadOverviewPhotos(bldg);
        renderOverviewPhotosList({ force: true });
        if (typeof window.showToast === 'function') window.showToast('전경사진을 추가했습니다. 아래에 설명을 입력하세요.', 'success');
    }

    async function triggerOverviewPhotoPick(mode) {
        const file = await pickImageFromDevice(mode);
        if (file) await addOverviewPhotoFromFile(file);
    }

    (function bindOverviewPhotosUi() {
        const btnOpen = document.getElementById('btnOpenOverviewPhotos');
        if (btnOpen) btnOpen.addEventListener('click', () => openOverviewPhotosModal());
        const btnClose = document.getElementById('btnCloseOverviewPhotosModal');
        const btnClose2 = document.getElementById('btnCloseOverviewPhotosModal2');
        if (btnClose) btnClose.addEventListener('click', closeOverviewPhotosModal);
        if (btnClose2) btnClose2.addEventListener('click', closeOverviewPhotosModal);
        const modal = document.getElementById('overviewPhotosModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeOverviewPhotosModal();
            });
        }
        const btnCam = document.getElementById('btnOverviewCamera');
        const btnGal = document.getElementById('btnOverviewGallery');
        if (btnCam) btnCam.addEventListener('click', () => triggerOverviewPhotoPick('camera'));
        if (btnGal) btnGal.addEventListener('click', () => triggerOverviewPhotoPick('gallery'));
    })();

    // ---------------------------------------------------------------------------
    // 전차 종합결론 (2026-11-04 사용자 요청)
    // 「회차별로 작업 들어가기 전에 기존 보고서 종합결과표만 삽입해서 확인할 수 있는 창」.
    // 태블릿·모바일은 층 이름 바꾸기 버튼 자리(층 선택 바로 오른쪽)에 이 버튼, PC는 층 이름 바꾸기 → 전차 종합결론 → 전경사진 → 메모.
    // 자료: 건물(=그 회차의 동) prevSummaryImages + 그림 본문은 사진 저장소 pvs_<건물ID>_<그림ID> (js/core/prev-summary.js).
    // ---------------------------------------------------------------------------
    const _pvsUi = { bldgId: null, busy: 0, viewIdx: -1, zoom: 1 };
    function pvsApi() { return window.BSA && window.BSA.prevSummary; }
    function pvsModal() { return document.getElementById('prevSummaryModal'); }
    function pvsBldg() {
        return (window.state.buildings || []).find((b) => b && b.id === _pvsUi.bldgId) || null;
    }
    function isPrevSummaryModalOpen() {
        const m = pvsModal();
        return !!(m && (m.classList.contains('open') || m.style.display === 'flex'));
    }
    function isPrevSummaryViewerOpen() {
        const v = document.getElementById('prevSummaryViewer');
        return !!(v && !v.hidden);
    }

    async function loadPrevSummaryDataUrl(key) {
        if (!key) return null;
        if (window._photoCache && window._photoCache[key]) return window._photoCache[key];
        try {
            const local = await idbGet('photos', key);
            if (typeof local === 'string' && local.length > 32) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[key] = local;
                maybeScheduleMigrateFromLocal(key, local);
                return local;
            }
        } catch (_) { /* ignore */ }
        if (db && window.state.companyId) {
            try {
                const snap = await fetchPhotosDocIfAllowed(key);
                if (!snap) return null;
                const url = await photoUrlFromCloudSnap(snap, key);
                if (typeof url === 'string' && url.length > 32) {
                    if (!window._photoCache) window._photoCache = {};
                    window._photoCache[key] = url;
                    idbSetPhotoPreferDataUrl(key, url).then((ok) => { if (ok) _idbPersistedPhotoKeys.add(key); });
                    return url;
                }
            } catch (e) {
                console.warn('전차 종합결론 클라우드 조회 실패:', key, e);
            }
        }
        return null;
    }

    async function deletePrevSummaryStorage(key) {
        if (!key) return;
        _idbPersistedPhotoKeys.delete(key);
        if (window._photoCache) delete window._photoCache[key];
        if (window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds.delete(key);
        try { await idbDelete('photos', key); } catch (_) { /* ignore */ }
        try { await deleteCloudPhoto(key); } catch (e) { console.warn('전차 종합결론 클라우드 삭제 실패:', key, e); }
    }

    function pvsSrcOf(bldg, p) {
        const api = pvsApi();
        if (!p) return '';
        return p.dataUrl || (api && window._photoCache && window._photoCache[api.docId(bldg.id, p.id)]) || '';
    }

    async function hydratePrevSummary(bldg) {
        const api = pvsApi();
        if (!api || !bldg) return;
        await Promise.all(api.list(bldg).map(async (p) => {
            if (!p || !p.id) return;
            const key = api.docId(bldg.id, p.id);
            if (p.dataUrl) {
                // 넣을 때 인터넷이 끊겨 못 올라간 그림은 창을 열 때마다 다시 올린다(이미 올라갔으면 건너뜀)
                maybeScheduleMigrateFromLocal(key, p.dataUrl);
                return;
            }
            const url = await loadPrevSummaryDataUrl(key);
            if (url) p.dataUrl = url;
        }));
    }

    function persistPrevSummaryMeta(bldg) {
        if (!bldg) return;
        if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(bldg);
        else bldg._pendingCloudSync = true;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
    }

    function renderPrevSummaryList() {
        const listEl = document.getElementById('prevSummaryList');
        const api = pvsApi();
        if (!listEl || !api) return;
        const bldg = pvsBldg();
        const titleEl = document.getElementById('prevSummaryModalTitle');
        if (titleEl) {
            const name = bldg && bldg.name ? String(bldg.name).replace(/^🏢\s*/, '') : '';
            titleEl.innerHTML = `<i class="fa-solid fa-clipboard-list"></i> 전차 종합결론${name ? ` · ${escapeHtml(name)}` : ''}`;
        }
        const list = bldg ? api.list(bldg) : [];
        if (!list.length) {
            listEl.innerHTML = '<div class="prev-summary-empty"><i class="fa-solid fa-clipboard-list" style="display:block;font-size:1.8rem;margin-bottom:0.5rem;color:#cbd5e1;"></i>'
                + '넣어 둔 종합결과표가 없습니다.<br>지난 보고서의 종합결과표를 캡처·사진·PDF로 넣어 주세요.</div>';
            return;
        }
        listEl.innerHTML = list.map((p, idx) => {
            const src = pvsSrcOf(bldg, p);
            const id = escapeHtml(p.id);
            const name = escapeHtml(p.name || `종합결과표 ${idx + 1}`);
            return `
                <div class="prev-summary-item" data-pvs-id="${id}">
                    <div class="prev-summary-item-head">
                        <span class="prev-summary-item-name" title="${name}">${idx + 1}. ${name}</span>
                        <button type="button" data-pvs-act="up" data-pvs-id="${id}" title="위로" ${idx === 0 ? 'disabled' : ''}><i class="fa-solid fa-arrow-up"></i></button>
                        <button type="button" data-pvs-act="down" data-pvs-id="${id}" title="아래로" ${idx === list.length - 1 ? 'disabled' : ''}><i class="fa-solid fa-arrow-down"></i></button>
                        <button type="button" class="danger" data-pvs-act="delete" data-pvs-id="${id}" title="삭제"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    ${src
                        ? `<button type="button" class="prev-summary-img-btn" data-pvs-act="view" data-pvs-idx="${idx}" title="크게 보기"><img src="${src}" alt="${name}"></button>`
                        : '<div class="prev-summary-loading">불러오는 중… (인터넷 연결이 없으면 보이지 않을 수 있습니다)</div>'}
                </div>`;
        }).join('');
    }

    function openPrevSummaryModal(bldgOrId) {
        let bldg = null;
        if (typeof bldgOrId === 'string') bldg = (window.state.buildings || []).find((b) => b && b.id === bldgOrId);
        else if (bldgOrId && typeof bldgOrId === 'object') bldg = bldgOrId;
        else if (window.state.currentBuildingId) {
            bldg = (window.state.buildings || []).find((b) => b && b.id === window.state.currentBuildingId)
                || window.state.currentBuilding;
        }
        if (!bldg || !bldg.id) {
            if (typeof window.showToast === 'function') window.showToast('먼저 건축물을 선택하세요.', 'info');
            return;
        }
        const modal = pvsModal();
        if (!modal || !pvsApi()) return;
        _pvsUi.bldgId = bldg.id;
        modal.style.display = 'flex';
        modal.classList.add('open');
        renderPrevSummaryList();
        hydratePrevSummary(bldg).then(() => { if (isPrevSummaryModalOpen() && _pvsUi.bldgId === bldg.id) renderPrevSummaryList(); });
    }

    function closePrevSummaryModal() {
        closePrevSummaryViewer();
        const modal = pvsModal();
        if (!modal) return;
        modal.classList.remove('open');
        modal.style.display = 'none';
        _pvsUi.bldgId = null;
    }

    /** 그림 파일을 긴 변 2400px JPEG로 — 표 글씨가 읽히게 자르지 않고 비율 그대로 */
    function pvsImageToDataUrl(blobOrUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let objUrl = null;
            img.onload = () => {
                try {
                    const maxEdge = 2400;
                    const w0 = img.naturalWidth || img.width;
                    const h0 = img.naturalHeight || img.height;
                    const k = Math.min(1, maxEdge / Math.max(w0, h0));
                    const c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(w0 * k));
                    c.height = Math.max(1, Math.round(h0 * k));
                    const ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    resolve(c.toDataURL('image/jpeg', 0.9));
                } catch (e) { reject(e); } finally { if (objUrl) URL.revokeObjectURL(objUrl); }
            };
            img.onerror = () => { if (objUrl) URL.revokeObjectURL(objUrl); reject(new Error('그림을 읽지 못했습니다.')); };
            if (typeof blobOrUrl === 'string') img.src = blobOrUrl;
            else { objUrl = URL.createObjectURL(blobOrUrl); img.src = objUrl; }
        });
    }

    /** 「3-4, 6」 → [3,4,6] (1부터, total 안쪽만). 빈칸이면 전체 */
    function pvsParsePages(text, total) {
        const t = String(text || '').trim();
        if (!t) return Array.from({ length: total }, (_, i) => i + 1);
        const out = new Set();
        t.split(/[,\s]+/).forEach((part) => {
            const m = part.match(/^(\d+)(?:\s*[-~]\s*(\d+))?$/);
            if (!m) return;
            let a = Number(m[1]);
            let b = m[2] ? Number(m[2]) : a;
            if (a > b) [a, b] = [b, a];
            for (let i = Math.max(1, a); i <= Math.min(total, b); i++) out.add(i);
        });
        return Array.from(out).sort((x, y) => x - y);
    }

    async function pvsPdfToImages(file) {
        if (typeof pdfjsLib === 'undefined') throw new Error('PDF를 읽는 기능을 불러오지 못했습니다(인터넷 연결 확인).');
        const buf = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: buf, verbosity: 0 }).promise;
        let pages = [1];
        if (pdf.numPages > 1) {
            const ans = await window.appPrompt(
                `이 PDF는 ${pdf.numPages}쪽입니다. 종합결과표가 있는 쪽 번호를 적어 주세요.\n(예: 3 또는 3-4, 빈칸이면 전체)`,
                '', { title: '넣을 쪽 고르기' });
            if (ans == null) return [];
            pages = pvsParsePages(ans, pdf.numPages);
            if (!pages.length) {
                if (typeof window.showToast === 'function') window.showToast('쪽 번호를 읽지 못했습니다.', 'warning');
                return [];
            }
            if (pages.length > 20) pages = pages.slice(0, 20);
        }
        const out = [];
        const base = String(file.name || 'PDF').replace(/\.pdf$/i, '');
        for (const n of pages) {
            const page = await pdf.getPage(n);
            const vp1 = page.getViewport({ scale: 1 });
            const scale = Math.min(4, 2200 / Math.max(vp1.width, vp1.height));
            const vp = page.getViewport({ scale });
            const c = document.createElement('canvas');
            c.width = Math.round(vp.width);
            c.height = Math.round(vp.height);
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            out.push({ dataUrl: c.toDataURL('image/jpeg', 0.9), name: pages.length > 1 || pdf.numPages > 1 ? `${base} ${n}쪽` : base });
        }
        try { pdf.destroy(); } catch (_) { /* ignore */ }
        return out;
    }

    async function addPrevSummaryEntries(entries) {
        const api = pvsApi();
        const bldg = pvsBldg();
        if (!api || !bldg || !entries || !entries.length) return 0;
        const list = api.list(bldg);
        if (!window._photoCache) window._photoCache = {};
        const keys = [];
        entries.forEach((e) => {
            if (!e || !e.dataUrl) return;
            const item = { id: api.createId(), name: String(e.name || '').slice(0, 120), addedAt: Date.now(), dataUrl: e.dataUrl };
            list.push(item);
            const key = api.docId(bldg.id, item.id);
            window._photoCache[key] = e.dataUrl;
            keys.push([key, e.dataUrl]);
        });
        if (!keys.length) return 0;
        renderPrevSummaryList();
        for (const [key, url] of keys) await persistPhotoUrlToIdb(key, url);
        persistPrevSummaryMeta(bldg);
        keys.forEach(([key, url]) => {
            persistPhotoToCloud(key, url).catch((e) => console.warn('전차 종합결론 업로드 실패(다음 동기화 때 다시):', key, e));
        });
        return keys.length;
    }

    async function addPrevSummaryFiles(files) {
        const arr = Array.from(files || []).filter(Boolean);
        if (!arr.length) return;
        if (!pvsBldg()) return;
        _pvsUi.busy += 1;
        const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); };
        try {
            const entries = [];
            for (const f of arr) {
                const isPdf = /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
                try {
                    if (isPdf) {
                        toast('PDF를 그림으로 바꾸는 중…');
                        entries.push(...await pvsPdfToImages(f));
                    } else if (/^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f.name || '')) {
                        const name = String(f.name || '').replace(/\.[^.]+$/, '');
                        entries.push({ dataUrl: await pvsImageToDataUrl(f), name: /^(image|photo_\d+|blob)$/i.test(name) ? '' : name });
                    } else {
                        toast(`그림이나 PDF만 넣을 수 있습니다: ${f.name || ''}`, 'warning');
                    }
                } catch (e) {
                    console.warn('전차 종합결론 파일 처리 실패:', f && f.name, e);
                    toast(`넣지 못했습니다: ${(f && f.name) || ''} (${(e && e.message) || e})`, 'error');
                }
            }
            const n = await addPrevSummaryEntries(entries);
            if (n) toast(`종합결과표 ${n}장을 넣었습니다.`, 'success');
        } finally {
            _pvsUi.busy -= 1;
        }
    }

    function pickPrevSummaryFiles() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf,.pdf';
        input.multiple = true;
        input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
        input.addEventListener('change', () => {
            const files = Array.from(input.files || []);
            try { input.remove(); } catch (_) { /* ignore */ }
            addPrevSummaryFiles(files);
        }, { once: true });
        document.body.appendChild(input);
        input.click();
    }

    async function pastePrevSummaryFromClipboard() {
        const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); };
        if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
            toast('표를 캡처한 뒤 이 창에서 Ctrl+V를 눌러 붙여 넣어 주세요.', 'info');
            return;
        }
        try {
            const items = await navigator.clipboard.read();
            const files = [];
            for (const it of items) {
                const type = (it.types || []).find((t) => /^image\//i.test(t));
                if (!type) continue;
                const blob = await it.getType(type);
                files.push(new File([blob], 'image', { type }));
            }
            if (!files.length) { toast('클립보드에 그림이 없습니다. 표를 캡처(Win+Shift+S)한 뒤 다시 눌러 주세요.', 'warning'); return; }
            await addPrevSummaryFiles(files);
        } catch (e) {
            console.warn('클립보드 읽기 실패:', e);
            toast('클립보드를 읽지 못했습니다. 이 창에서 Ctrl+V로 붙여 넣어 주세요.', 'warning');
        }
    }

    // ---- 크게 보기 ----
    function pvsViewerApplyZoom(keepCenter) {
        const sc = document.getElementById('prevSummaryViewerScroll');
        const img = document.getElementById('prevSummaryViewerImg');
        if (!sc || !img) return;
        const cx = keepCenter ? (sc.scrollLeft + sc.clientWidth / 2) / Math.max(1, sc.scrollWidth) : 0;
        const cy = keepCenter ? (sc.scrollTop + sc.clientHeight / 2) / Math.max(1, sc.scrollHeight) : 0;
        img.style.width = Math.round(Math.max(1, sc.clientWidth) * _pvsUi.zoom) + 'px';
        img.style.height = 'auto';
        if (keepCenter) {
            sc.scrollLeft = cx * sc.scrollWidth - sc.clientWidth / 2;
            sc.scrollTop = cy * sc.scrollHeight - sc.clientHeight / 2;
        }
    }
    function pvsViewerSetZoom(z, keepCenter) {
        _pvsUi.zoom = Math.min(6, Math.max(0.5, z));
        pvsViewerApplyZoom(keepCenter !== false);
    }
    function showPrevSummaryAt(idx) {
        const api = pvsApi();
        const bldg = pvsBldg();
        if (!api || !bldg) return;
        const list = api.list(bldg);
        if (!list.length) return;
        const i = Math.max(0, Math.min(list.length - 1, idx));
        const p = list[i];
        const src = pvsSrcOf(bldg, p);
        if (!src) return;
        _pvsUi.viewIdx = i;
        const v = document.getElementById('prevSummaryViewer');
        const img = document.getElementById('prevSummaryViewerImg');
        const title = document.getElementById('prevSummaryViewerTitle');
        if (!v || !img) return;
        if (title) title.textContent = `${i + 1}/${list.length} · ${p.name || '종합결과표 ' + (i + 1)}`;
        const prev = document.getElementById('btnPrevSummaryViewerPrev');
        const next = document.getElementById('btnPrevSummaryViewerNext');
        if (prev) prev.disabled = i <= 0;
        if (next) next.disabled = i >= list.length - 1;
        img.src = src;
        v.hidden = false;
        v.setAttribute('aria-hidden', 'false');
        _pvsUi.zoom = 1;
        pvsViewerApplyZoom(false);
        const sc = document.getElementById('prevSummaryViewerScroll');
        if (sc) { sc.scrollTop = 0; sc.scrollLeft = 0; }
    }
    function closePrevSummaryViewer() {
        const v = document.getElementById('prevSummaryViewer');
        if (!v || v.hidden) return;
        v.hidden = true;
        v.setAttribute('aria-hidden', 'true');
        const img = document.getElementById('prevSummaryViewerImg');
        if (img) img.removeAttribute('src');
        _pvsUi.viewIdx = -1;
    }

    window.bsaPrevSummary = {
        open: openPrevSummaryModal,
        close: closePrevSummaryModal,
        isOpen: isPrevSummaryModalOpen,
        isBusy: () => _pvsUi.busy > 0 || isPrevSummaryModalOpen(),
        /** 뒤로 가기: 크게 보기 → 창 순서로 닫는다. 닫았으면 true */
        closeTop: () => {
            if (isPrevSummaryViewerOpen()) { closePrevSummaryViewer(); return true; }
            if (isPrevSummaryModalOpen()) { closePrevSummaryModal(); return true; }
            return false;
        }
    };

    (function bindPrevSummaryUi() {
        const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
        on('btnOpenPrevSummary', (e) => { e.preventDefault(); openPrevSummaryModal(); });
        on('btnClosePrevSummaryModal', closePrevSummaryModal);
        on('btnClosePrevSummaryModal2', closePrevSummaryModal);
        on('btnPrevSummaryFile', pickPrevSummaryFiles);
        on('btnPrevSummaryCamera', async () => {
            const f = await pickImageFromDevice('camera');
            if (f) await addPrevSummaryFiles([f]);
        });
        on('btnPrevSummaryPaste', pastePrevSummaryFromClipboard);
        const modal = pvsModal();
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closePrevSummaryModal(); });
        const listEl = document.getElementById('prevSummaryList');
        if (listEl) {
            listEl.addEventListener('click', async (e) => {
                const btn = e.target.closest('[data-pvs-act]');
                if (!btn || !listEl.contains(btn)) return;
                const api = pvsApi();
                const bldg = pvsBldg();
                if (!api || !bldg) return;
                const act = btn.getAttribute('data-pvs-act');
                const id = btn.getAttribute('data-pvs-id');
                if (act === 'view') { showPrevSummaryAt(Number(btn.getAttribute('data-pvs-idx')) || 0); return; }
                if (act === 'up' || act === 'down') {
                    if (api.move(bldg, id, act === 'up' ? -1 : 1)) { renderPrevSummaryList(); persistPrevSummaryMeta(bldg); }
                    return;
                }
                if (act === 'delete') {
                    if (!await window.confirmDelete('이 종합결과표 그림을 삭제할까요?')) return;
                    const live = pvsBldg();
                    if (!live || !api.remove(live, id)) return;
                    renderPrevSummaryList();
                    persistPrevSummaryMeta(live);
                    await deletePrevSummaryStorage(api.docId(live.id, id));
                    if (typeof window.showToast === 'function') window.showToast('종합결과표 그림을 삭제했습니다.', 'info');
                }
            });
        }
        // PC: 창이 열려 있을 때 Ctrl+V로 캡처 그림 붙여넣기(입력칸에 붙여넣는 건 건드리지 않음)
        document.addEventListener('paste', (e) => {
            if (!isPrevSummaryModalOpen()) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            const files = [];
            Array.from((e.clipboardData && e.clipboardData.items) || []).forEach((it) => {
                if (it.kind === 'file') {
                    const f = it.getAsFile();
                    if (f && (/^image\//i.test(f.type) || /pdf/i.test(f.type))) files.push(f);
                }
            });
            if (!files.length) return;
            e.preventDefault();
            addPrevSummaryFiles(files);
        });
        // 크게 보기
        on('btnPrevSummaryViewerClose', closePrevSummaryViewer);
        on('btnPrevSummaryViewerPrev', () => showPrevSummaryAt(_pvsUi.viewIdx - 1));
        on('btnPrevSummaryViewerNext', () => showPrevSummaryAt(_pvsUi.viewIdx + 1));
        on('btnPrevSummaryViewerZoomIn', () => pvsViewerSetZoom(_pvsUi.zoom * 1.4));
        on('btnPrevSummaryViewerZoomOut', () => pvsViewerSetZoom(_pvsUi.zoom / 1.4));
        on('btnPrevSummaryViewerFit', () => pvsViewerSetZoom(1, false));
        on('prevSummaryViewerImg', () => pvsViewerSetZoom(_pvsUi.zoom > 1.05 ? 1 : 2.2));
        const sc = document.getElementById('prevSummaryViewerScroll');
        if (sc) {
            // 두 손가락으로 벌리면 그림만 확대(화면 전체 확대 대신)
            let pinch = null;
            const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
            sc.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) pinch = { d: dist(e.touches), z: _pvsUi.zoom };
            }, { passive: true });
            sc.addEventListener('touchmove', (e) => {
                if (!pinch || e.touches.length !== 2) return;
                e.preventDefault();
                pvsViewerSetZoom(pinch.z * (dist(e.touches) / Math.max(1, pinch.d)));
            }, { passive: false });
            sc.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });
            // PC: Ctrl+휠로 확대
            sc.addEventListener('wheel', (e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                pvsViewerSetZoom(_pvsUi.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
            }, { passive: false });
        }
        window.addEventListener('resize', () => { if (isPrevSummaryViewerOpen()) pvsViewerApplyZoom(true); });
        document.addEventListener('keydown', (e) => {
            if (!isPrevSummaryViewerOpen()) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePrevSummaryViewer(); }
            else if (e.key === 'ArrowLeft') showPrevSummaryAt(_pvsUi.viewIdx - 1);
            else if (e.key === 'ArrowRight') showPrevSummaryAt(_pvsUi.viewIdx + 1);
        }, true);
    })();

    async function writeFirestoreStorageMeta(docRef, uploaded, extraFields) {
        if (!docRef) return;
        const payload = {
            ...(extraFields || {}),
            ...firestoreStorageMetaFields(uploaded),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await enqueueFirestoreWrite(() => docRef.set(payload));
        scheduleChunkPartsCleanup(docRef, null);
    }

    /** 「…/건물_1F.jpg」→「…/건물_1F_vmh3k2x.jpg」 — 올릴 때마다 다른 파일 이름 */
    function withUploadVersionSuffix(path) {
        const tag = '_v' + Date.now().toString(36);
        const m = /^(.*)(\.[A-Za-z0-9]+)$/.exec(String(path || ''));
        return m ? m[1] + tag + m[2] : String(path || '') + tag;
    }

    async function uploadAssetToFirebaseStorageAndMeta(docRef, storagePath, sourceUrl, extraFields) {
        const extra = Object.assign({}, extraFields || {});
        let previousPath = extra.previousStoragePath || null;
        delete extra.previousStoragePath;
        if (!previousPath && isFirebaseStorageHttpUrl(sourceUrl)) {
            previousPath = storagePathFromDownloadURL(sourceUrl);
        }
        let targetPath = String(storagePath || '').replace(/^\/+/, '');
        const freshName = !!extra.freshName;
        delete extra.freshName;
        // 같은 객체 = 이미 Storage에 있는 그 파일(https 주소)을 다시 적을 때만. 2026-10-14: 예전엔 경로만 같으면
        // (층 도면 교체처럼 경로가 층마다 고정) 새 data: 파일을 올리지 않고 옛 파일을 그대로 두었다
        // → 다른 층 갔다 오거나 다른 기기에서 옛 도면/깨진 주소를 받아 「도면이 다시 사라짐」.
        const sameObject = !!(previousPath && targetPath && previousPath === targetPath
            && isFirebaseStorageHttpUrl(sourceUrl));
        let uploaded;
        if (sameObject) {
            uploaded = {
                storagePath: previousPath,
                downloadURL: sourceUrl,
                contentType: extra.contentType || null,
                size: null
            };
        } else {
            // 2026-10-31 층 도면은 같은 층을 다시 올려도 파일 이름이 늘 같고 파일에는 1년 캐시(max-age=31536000)가 걸려 있어,
            // 지웠다 다시 넣거나 바꿔 넣은 뒤 확대하면 브라우저·서버 캐시에서 옛 도면이 나왔다.
            // 새로 올릴 때마다 이름 뒤에 올린 시각을 붙인다 — 문서에 저장 경로가 같이 적히고, 옛 파일은 아래에서 지운다.
            if (freshName) targetPath = withUploadVersionSuffix(targetPath);
            const parsed = await assetUrlToUploadBlob(sourceUrl);
            if (!parsed || !parsed.blob) throw new Error('asset parse failed');
            uploaded = await uploadBlobToFirebaseStorage(targetPath, parsed.blob, parsed.contentType);
        }
        await writeFirestoreStorageMeta(docRef, uploaded, extra);
        if (previousPath && uploaded.storagePath && previousPath !== uploaded.storagePath) {
            await deleteFirebaseStoragePath(previousPath);
        }
        return uploaded;
    }

    async function deleteCloudAssetDoc(docRef, fallbackStoragePath) {
        if (!docRef) return;
        let storagePath = fallbackStoragePath || null;
        const snap = await docRef.get();
        if (snap.exists) {
            const data = snap.data() || {};
            if (typeof data.storagePath === 'string' && data.storagePath) {
                storagePath = data.storagePath;
            } else if (!storagePath && data.downloadURL) {
                storagePath = storagePathFromDownloadURL(data.downloadURL) || storagePath;
            }
        }
        if (storagePath) await deleteFirebaseStoragePath(storagePath);
        const data = snap.exists ? (snap.data() || {}) : {};
        const writeId = data.writeId ? String(data.writeId) : '';
        const chunkCount = Math.min(Math.max(Number(data.chunkCount) || 0, 0), 16);
        if (writeId && chunkCount > 0) {
            const batch = db.batch();
            for (let i = 0; i < chunkCount; i++) {
                batch.delete(docRef.collection('parts').doc(writeId + '_' + i));
            }
            batch.delete(docRef);
            await batch.commit();
        } else if (snap.exists) {
            await docRef.delete();
        }
    }

    async function resolvePhotoUrlFromSnapData(data) {
        if (!data) return null;
        const remote = await resolveCloudAssetUrlFromSnapData(data);
        if (remote) {
            const local = await materializeCloudAssetPayload(remote, data);
            if (local && String(local).indexOf('data:') === 0 && String(local).length > 32) {
                return local;
            }
            // 버킷 CORS 없으면 materialize가 https만 돌려줌 → Worker 프록시로 dataURL 확보
            if (/^https?:\/\//i.test(String(remote))) {
                try {
                    const proxied = await fetchStorageImageViaProxy(remote);
                    if (proxied && proxied.indexOf('data:') === 0) return proxied;
                } catch (proxyErr) {
                    console.warn('사진 materialize 프록시 실패:', proxyErr);
                }
            }
            if (local && String(local).length > 32) return local;
            return remote;
        }
        if (typeof data.dataUrl === 'string' && data.dataUrl.length > 32) return data.dataUrl;
        return null;
    }

    const PHOTO_STORAGE_UPLOAD_MAX = 4;
    let _photoStorageUploadInflight = 0;
    const _photoStorageUploadWaiters = [];
    function runPhotoStorageUpload(task) {
        return new Promise((resolve, reject) => {
            const start = async () => {
                _photoStorageUploadInflight += 1;
                try {
                    resolve(await task());
                } catch (e) {
                    reject(e);
                } finally {
                    _photoStorageUploadInflight -= 1;
                    const next = _photoStorageUploadWaiters.shift();
                    if (next) next();
                }
            };
            if (_photoStorageUploadInflight < PHOTO_STORAGE_UPLOAD_MAX) start();
            else _photoStorageUploadWaiters.push(start);
        });
    }

    function photoStorageMarkKey() {
        const cid = (typeof getCompanyDocId === 'function' && getCompanyDocId()) || window.state.companyId || '';
        return 'bsaCloudPhotoStorage:' + cid;
    }
    function isPhotoMarkedOnStorage(photoId) {
        if (!photoId) return false;
        if (window._cloudSyncedPhotoIds && window._cloudSyncedPhotoIds.has(photoId)) return true;
        try {
            const raw = localStorage.getItem(photoStorageMarkKey());
            if (!raw) return false;
            const arr = JSON.parse(raw);
            return Array.isArray(arr) && arr.indexOf(photoId) >= 0;
        } catch (_e) {
            return false;
        }
    }
    function markPhotoOnStorage(photoId) {
        if (!photoId) return;
        if (!window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds = new Set();
        window._cloudSyncedPhotoIds.add(photoId);
        try {
            const key = photoStorageMarkKey();
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            const set = new Set(Array.isArray(arr) ? arr : []);
            set.add(photoId);
            localStorage.setItem(key, JSON.stringify(Array.from(set)));
        } catch (_e) { /* quota / private mode */ }
        try { const j = typeof syncJournal === 'function' ? syncJournal() : null; if (j) j.confirmPhoto(photoId); } catch (_e) { /* ignore */ }
    }
    function unmarkPhotoOnStorage(photoId) {
        if (!photoId) return;
        if (window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds.delete(photoId);
        try {
            const key = photoStorageMarkKey();
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            const next = (Array.isArray(arr) ? arr : []).filter((id) => id !== photoId);
            localStorage.setItem(key, JSON.stringify(next));
        } catch (_e) { /* ignore */ }
    }

    function findBuildingById(buildingId) {
        if (!buildingId) return null;
        return (window.state.buildings || []).find((b) => b && b.id === buildingId) || null;
    }

    function storageScopeFromBuilding(bldg) {
        if (!bldg) return { site: 'unnamed-site', round: 'unnamed-round' };
        const site = (typeof getBuildingSiteName === 'function')
            ? getBuildingSiteName(bldg)
            : (bldg.siteName || bldg.name || 'unnamed-site');
        const round = (typeof getBuildingSurveyRoundKey === 'function')
            ? getBuildingSurveyRoundKey(bldg)
            : `${bldg.inspectionYear || '2026년'}_${bldg.inspectionPeriod || '하반기'}`;
        return { site: site || 'unnamed-site', round: round || 'unnamed-round' };
    }

    function storageScopeForBuildingId(buildingId) {
        return storageScopeFromBuilding(findBuildingById(buildingId));
    }

    function findBuildingIdForDefectId(defectId) {
        if (!defectId) return null;
        const defects = window.state.defects || {};
        const buildings = window.state.buildings || [];
        for (const key of Object.keys(defects)) {
            const arr = defects[key] || [];
            if (!arr.some((d) => d && d.id === defectId)) continue;
            const match = buildings.find((b) => b && b.id && key.startsWith(b.id + '_'));
            if (match) return match.id;
        }
        return null;
    }

    function resolveBuildingIdFromPhotoId(photoId) {
        if (!photoId) return null;
        const buildings = window.state.buildings || [];
        if (photoId.indexOf('ov_') === 0 || photoId.indexOf('pvs_') === 0 || photoId.indexOf('str_') === 0 || photoId.indexOf('ndtimg_') === 0) {
            const rest = photoId.slice(photoId.indexOf('_') + 1);
            const match = buildings.find((b) => b && b.id && rest.startsWith(b.id + '_'));
            if (match) return match.id;
        }
        let defectId = photoId;
        // 꼬리: 옛 자리 번호(숫자) 또는 고유 ID(u…, createDefectPhotoId). 못 읽으면 Storage 폴더가 틀어진다.
        const prev = photoId.match(/^(.*)_prev_(?:\d+|u[0-9a-z]+)$/);
        if (prev) defectId = prev[1];
        else {
            const cur = photoId.match(/^(.*)_(?:\d+|u[0-9a-z]+)$/);
            if (cur) defectId = cur[1];
        }
        return findBuildingIdForDefectId(defectId);
    }

    function storageScopeForPhotoId(photoId) {
        // 관리자 사진 되살리기: 같은 번호를 두 점검이 쓸 때 원래 점검 폴더로
        if (typeof _photoRestoreScopeOverride !== 'undefined' && _photoRestoreScopeOverride.has(photoId)) {
            return _photoRestoreScopeOverride.get(photoId);
        }
        return storageScopeForBuildingId(resolveBuildingIdFromPhotoId(photoId));
    }

    function getCompanyPhotosCollection() {
        if (!db || !window.state.companyId) return null;
        return db.collection('safety_app').doc(getCompanyDocId()).collection('photos');
    }

    async function photoUrlFromCloudSnap(snap, photoId) {
        if (!snap || !snap.exists) return null;
        const data = snap.data() || {};
        if (hasFirebaseStorageMeta(data)) markPhotoOnStorage(photoId);
        const url = await resolvePhotoUrlFromSnapData(data);
        if (url && data.dataUrl && !hasFirebaseStorageMeta(data)) {
            scheduleLegacyPhotoMigrate(photoId, data.dataUrl);
        }
        return url;
    }

    const _photoPersistInflight = {};

    async function persistPhotoToCloud(photoId, sourceUrl, existingData) {
        if (!photoId || !sourceUrl) return false;
        const companyPhotos = getCompanyPhotosCollection();
        if (!companyPhotos) return false;
        if (isPhotoMarkedOnStorage(photoId)) return true;
        if (await isCloudPhotoWriteBlocked()) return false;
        if (_photoPersistInflight[photoId]) return _photoPersistInflight[photoId];
        const job = (async () => {
            if (isPhotoMarkedOnStorage(photoId)) return true;
            const docRef = companyPhotos.doc(photoId);
            try {
                let data = existingData;
                if (data == null) data = {};
                if (hasFirebaseStorageMeta(data) && !snapNeedsSiteRoundMove(data)) {
                    markPhotoOnStorage(photoId);
                    return true;
                }
                if (USE_FIREBASE_STORAGE_FOR_PHOTOS && getFirebaseStorage()) {
                    await runPhotoStorageUpload(async () => {
                        const parsedHint = parseDataUrl(sourceUrl);
                        const contentType = (parsedHint && parsedHint.contentType) || 'image/jpeg';
                        const scope = storageScopeForPhotoId(photoId);
                        const path = storagePathPhoto(getCompanyDocId(), photoId, contentType, scope);
                        await uploadAssetToFirebaseStorageAndMeta(docRef, path, sourceUrl, {
                            kind: 'photo',
                            site: scope.site,
                            round: scope.round,
                            previousStoragePath: storagePathFromSnapData(data)
                        });
                    });
                    markPhotoOnStorage(photoId);
                    return true;
                }
                await enqueueFirestoreWrite(() => docRef.set({ dataUrl: sourceUrl }));
                return true;
            } catch (e) {
                console.warn('사진 클라우드 업로드 실패:', photoId, e);
                if (typeof _photoLastError !== 'undefined') _photoLastError.set(photoId, e);
                return false;
            }
        })();
        _photoPersistInflight[photoId] = job;
        try {
            return await job;
        } finally {
            if (_photoPersistInflight[photoId] === job) delete _photoPersistInflight[photoId];
        }
    }

    async function migrateLegacyCloudPhoto(photoId) {
        if (!photoId || isPhotoMarkedOnStorage(photoId)) return true;
        const companyPhotos = getCompanyPhotosCollection();
        if (!companyPhotos) return false;
        try {
            const snap = await fetchPhotosDocIfAllowed(photoId);
            if (!snap) return false;
            if (!snap.exists) return false;
            const data = snap.data() || {};
            if (hasFirebaseStorageMeta(data)) {
                markPhotoOnStorage(photoId);
                return true;
            }
            if (typeof data.dataUrl === 'string' && data.dataUrl.length > 32) {
                return persistPhotoToCloud(photoId, data.dataUrl, data);
            }
            return false;
        } catch (e) {
            console.warn('레거시 사진 Storage 이관 조회 실패:', photoId, e);
            return false;
        }
    }

    function scheduleLegacyPhotoMigrate(photoId, sourceUrl) {
        if (!photoId || !sourceUrl) return;
        if (isPhotoMarkedOnStorage(photoId)) return;
        if (isFirebaseStorageHttpUrl(sourceUrl)) {
            markPhotoOnStorage(photoId);
            return;
        }
        if (typeof sourceUrl !== 'string' || sourceUrl.indexOf('data:') !== 0) return;
        setTimeout(() => {
            persistPhotoToCloud(photoId, sourceUrl).catch((e) => {
                console.warn('레거시 사진 Storage 이관 실패:', photoId, e);
            });
        }, 0);
    }

    async function deleteCloudPhoto(photoId) {
        if (!photoId) return;
        // 막힌 옛 코드는 클라우드 사진을 그대로 둔다(표시도 안 바꾼다) — 새 방식에서 아직 쓰는 사진일 수 있다
        if (await isCloudPhotoWriteBlocked()) return;
        // 건물 백업이 쓰는 사진은 클라우드에 남긴다 — 되살리기로 다시 필요해진다(이 기기 사본은 호출한 쪽이 지운다)
        if (await isPhotoKeptByBuildingBackup(photoId)) return;
        unmarkPhotoOnStorage(photoId);
        const companyPhotos = getCompanyPhotosCollection();
        if (!companyPhotos) return;
        const fallback = storagePathPhoto(
            getCompanyDocId(), photoId, 'image/jpeg', storageScopeForPhotoId(photoId)
        );
        await deleteCloudAssetDoc(companyPhotos.doc(photoId), fallback);
    }

    function maybeScheduleMigrateFromLocal(photoId, url) {
        if (!photoId || typeof url !== 'string' || url.length < 32) return;
        if (isPhotoMarkedOnStorage(photoId)) return;
        if (url.indexOf('data:') === 0) scheduleLegacyPhotoMigrate(photoId, url);
    }

    async function resolveLocalPhotoUrl(photoId) {
        if (!photoId) return null;
        if (window._photoCache && window._photoCache[photoId]) return window._photoCache[photoId];
        try {
            const fromIdb = await idbGet('photos', photoId);
            if (typeof fromIdb === 'string' && fromIdb.length > 32) return fromIdb;
        } catch (_e) { /* ignore */ }
        return null;
    }

    async function ensurePhotoPersistedToStorage(photoId, inlineUrl) {
        if (!photoId || isPhotoMarkedOnStorage(photoId)) return true;
        let url = (typeof inlineUrl === 'string' && inlineUrl.length > 32) ? inlineUrl : null;
        if (!url) url = await resolveLocalPhotoUrl(photoId);
        if (typeof url === 'string' && isFirebaseStorageHttpUrl(url)) {
            markPhotoOnStorage(photoId);
            if (!window._photoCache) window._photoCache = {};
            window._photoCache[photoId] = url;
            return true;
        }
        if (typeof url === 'string' && url.length > 32 && url.indexOf('data:') === 0) {
            return persistPhotoToCloud(photoId, url);
        }
        // 로컬 바이트가 없으면 Firestore photos.get()으로 이관하지 않는다.
        // (동기화마다 전 사진 문서를 다시 읽어 할당량을 태움)
        return true;
    }

    /**
     * 2026-11-06 일지에 「안 올라감」으로 남은 사진을 층과 상관없이 직접 올린다.
     * 층 묶음이 먼저 올라가 「올릴 층」에서 빠지면 그 층 사진 작업이 다시 돌지 않아, 남은 사진이 영영 안 올라가고
     * 진행률은 「남음 2」에서 멈춘 채 계속 올리는 것처럼 보였다(새희망교회 1F, 영광군청사 B1F·EXT_1).
     * 기기에 원본이 없으면 서버를 한 번만 본다: 서버에 있으면 올라간 것으로, 없으면 멈춤 목록에 남겨 다시 촬영하게 한다.
     * 일지에 남은 사진만 보므로 전 사진 문서를 읽지 않는다. 아무것도 지우지 않는다.
     */
    const MISSING_PHOTO_REASON = '이 기기에 원본 없음';

    /**
     * 2026-11-06 원본이 어디에도 없는 사진 번호를 마킹 목록에서 뺀다(사람이 버튼으로만).
     * 지운 사진 번호가 목록에 되살아나면 그 칸은 영원히 못 받으므로 「사진을 다 받기 전엔 못 지움」에 막혀 창에서 지울 수 없다.
     * 누르는 순간 서버·기기를 다시 확인하고, 지움 기록을 남겨 다른 기기에서도 되살아나지 않게 한다.
     */
    function findDefectByPhotoId(photoId) {
        const defs = (window.state && window.state.defects) || {};
        for (const fk of Object.keys(defs)) {
            for (const d of (defs[fk] || [])) {
                if (!d) continue;
                if ((d.photoIds || []).includes(photoId)) return { fk, d, kind: 'cur' };
                if ((d.prevRoundPhotoIds || []).includes(photoId)) return { fk, d, kind: 'prev' };
            }
        }
        return null;
    }
    async function dropMissingPhotoFromDefect(photoId) {
        const found = findDefectByPhotoId(photoId);
        const tracker = photoRetryTracker();
        if (!found) {
            if (tracker) tracker.ok(photoId);
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            return false;
        }
        if (navigator.onLine === false) {
            window.showToast('인터넷이 연결된 뒤에 다시 눌러 주세요. 서버에 사진이 있는지 먼저 확인합니다.', 'warning', 3500);
            return false;
        }
        const local = await resolveLocalPhotoUrl(photoId);
        const snap = await getCompanyPhotosCollection().doc(photoId).get({ source: 'server' });
        if (local || snap.exists) {
            if (tracker) tracker.ok(photoId);
            window.showToast('이 사진은 원본이 있습니다. 목록에서 빼지 않고 다시 올립니다.', 'info', 3500);
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            return false;
        }
        const { fk, d, kind } = found;
        if (!await window.confirmDelete(`${syncProgressPhotoLabel(photoId)}의 없는 사진을 목록에서 뺄까요?\n원본이 이 기기에도 서버에도 없습니다. 다른 사람이 찍은 사진일 수 있으니, 찍은 사람 기기에 원본이 없는지 먼저 확인하세요.`)) return false;
        const idKey = kind === 'prev' ? 'prevRoundPhotoIds' : 'photoIds';
        const photoKey = kind === 'prev' ? 'prevRoundPhotos' : 'photos';
        const urlKey = kind === 'prev' ? 'prevRoundPhotoUrls' : 'photoUrls';
        const before = d[idKey].slice();
        const i = before.indexOf(photoId);
        if (i < 0) return false;   // 확인하는 사이 동기화로 이미 빠짐
        [idKey, photoKey, urlKey].forEach((k) => {
            if (!Array.isArray(d[k])) return;
            if (k === idKey || d[k].length === before.length) d[k].splice(i, 1);
        });
        if (!d[idKey].length) { delete d[idKey]; delete d[photoKey]; delete d[urlKey]; }
        if (d.repairPhotoId === photoId) delete d.repairPhotoId;
        // 지움 기록은 다른 칸의 사진 받기 상태와 무관하다 — 이 번호 하나만 뺀 것이 확실하다
        const savedComplete = window._defectPhotosComplete;
        window._defectPhotosComplete = true;
        try {
            if (kind === 'cur') recordDefectPhotoState(d, before, d.photoIds || []);
            stampDefectPhotosChangedIfSafe(d);
        } finally {
            window._defectPhotosComplete = savedComplete;
        }
        touchDefectUpdatedAt(d);
        markFloorKeyDirty(fk);
        if (tracker) tracker.ok(photoId);
        saveStateToLocalStorage();
        scheduleSyncToFirebase({ skipMarkCurrent: true });
        window.showToast('없는 사진을 목록에서 뺐습니다.', 'success', 2500);
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
        return true;
    }
    /** 진행률 창·오프라인 준비 창 공통: 원본 없는 사진 목록 + 「목록에서 빼기」 (buildingId를 주면 그 건물 것만) */
    function syncMissingPhotosHtml(buildingId) {
        const tracker = photoRetryTracker();
        if (!tracker) return '';
        const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const rows = tracker.parked().filter((x) => String(x.reason || '').indexOf(MISSING_PHOTO_REASON) === 0).filter((x) => {
            const f = findDefectByPhotoId(x.id);
            return !!f && (!buildingId || String(f.fk).indexOf(`${buildingId}_`) === 0);
        });
        if (!rows.length) return '';
        return '<div class="bsp-missing"><div class="bsp-missing-title"><i class="fa-solid fa-image"></i> 원본을 찾을 수 없는 사진 ' + rows.length + '장</div>'
            + '<p>다른 사람이 찍은 사진일 수 있습니다. 찍은 사람에게 확인한 뒤, 원본이 없을 때만 목록에서 빼세요.</p><ul>'
            + rows.map((x) => '<li><span>' + esc(syncProgressPhotoLabel(x.id)) + '</span><button type="button" class="btn btn-outline btn-sm" data-bsp-drop-photo="' + esc(x.id) + '">목록에서 빼기</button></li>').join('')
            + '</ul></div>';
    }
    document.addEventListener('click', (e) => {
        const b = e.target && e.target.closest && e.target.closest('[data-bsp-drop-photo]');
        if (!b) return;
        b.disabled = true;
        dropMissingPhotoFromDefect(b.getAttribute('data-bsp-drop-photo')).catch((err) => {
            console.warn('[사진] 목록에서 빼기 실패', err);
            window.showToast('서버를 확인하지 못해 그대로 두었습니다. 잠시 뒤 다시 눌러 주세요.', 'warning', 3500);
            b.disabled = false;
        });
    });
    async function uploadPendingJournalPhotos() {
        const j = typeof syncJournal === 'function' ? syncJournal() : null;
        const collection = getCompanyPhotosCollection();
        if (!j || !collection || navigator.onLine === false) return;
        j.summary(syncProgressCtx());   // 결함에서 빠진 사진을 먼저 정리
        const ids = j.pendingEntries().filter((e) => e.k === 'photo' && !isPhotoMarkedOnStorage(e.id)).map((e) => e.id);
        const tracker = photoRetryTracker();
        // 원본 없는 사진을 결함에서 지웠으면(중복 촬영 정리 등) 일지에서 빠졌으니 멈춤 표시도 푼다
        if (tracker) {
            tracker.parked().filter((x) => String(x.reason || '').indexOf(MISSING_PHOTO_REASON) === 0 && !ids.includes(x.id))
                .forEach((x) => tracker.ok(x.id));
        }
        if (!ids.length) {
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            return;
        }
        await runPhotoJobsInBatches(ids, async (id) => {
            if (tracker && !tracker.shouldTry(id)) return;
            let failure = null;
            try {
                const url = await resolveLocalPhotoUrl(id);
                if (typeof url === 'string' && url.indexOf('data:') === 0) {
                    if (_photoLastError) _photoLastError.delete(id);
                    if (!(await persistPhotoToCloud(id, url))) {
                        failure = _photoLastError.get(id) || { code: 'upload-failed', message: '사진 업로드 실패' };
                    }
                } else if (typeof url === 'string' && isFirebaseStorageHttpUrl(url)) {
                    markPhotoOnStorage(id);
                } else {
                    const snap = await collection.doc(id).get({ source: 'server' });
                    const data = snap.exists ? (snap.data() || {}) : null;
                    if (data && (hasFirebaseStorageMeta(data) || (typeof data.dataUrl === 'string' && data.dataUrl.length > 32))) {
                        markPhotoOnStorage(id);
                    } else {
                        failure = { code: 'missing-local-blob', message: `${MISSING_PHOTO_REASON}·서버에도 없음 — 찍은 기기에서 올리거나, 중복이면 지우고, 필요하면 다시 촬영` };
                    }
                }
            } catch (e) {
                failure = e;
            }
            if (!tracker) return;
            if (failure) {
                const r = tracker.fail(id, failure);
                console.warn('[사진] 일지에 남은 사진 올리기 실패:', id, r.kind, r.n);
            } else {
                tracker.ok(id);
            }
        });
        if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
    }

    async function runPhotoJobsInBatches(items, worker, batchSize) {
        // 2026-11-07 묶음이 다 끝나길 기다리지 않는다 — 느린 사진 한 장이 나머지 칸을 놀리지 않게 끝나는 대로 다음 사진을 시작
        const size = batchSize || PHOTO_STORAGE_UPLOAD_MAX;
        const queue = Array.isArray(items) ? items.slice() : [];
        await Promise.all(Array.from({ length: Math.min(size, queue.length) }, async () => {
            while (queue.length) {
                const item = queue.shift();
                await yieldToUiGesture();
                await worker(item);
            }
        }));
    }

    // 2026-11-07 ① 동기화가 사진을 기다리는 최대 시간. 넘으면 사진은 뒤에서 계속 올리고 마킹·건물 정보부터 올린다.
    // 예전엔 밀린 사진이 다 올라갈 때까지 글자 데이터가 못 올라가고 층 잠금도 그동안 계속 잡혀 있었다.
    const PHOTO_SYNC_WAIT_MS = 15000;
    let _photoDrain = null;

    /**
     * uploadPhotos를 돌리되 PHOTO_SYNC_WAIT_MS까지만 기다린다. 반환: 사진을 못 올린 층 Set.
     * 시간 안에 끝나면 예전과 같다. 넘으면 빈 Set을 돌려주고, 사진이 끝난 뒤 finishDetachedPhotoDrain이 층을 다시 올린다.
     * 뒤에서 돌고 있으면 새로 시작하지 않고 층만 맡긴다 — 새 사진은 그 층을 다시 올리는 다음 회차가 올린다.
     */
    async function runPhotoPhaseWithinBudget(floorKeys, uploadPhotos) {
        if (_photoDrain) {
            (floorKeys || []).forEach((k) => _photoDrain.floors.add(k));
            return new Set();
        }
        const drain = { floors: new Set(floorKeys || []), failedFloors: new Set(), error: null, done: false, detached: false };
        _photoDrain = drain;
        const finished = (async () => {
            try {
                const failed = await uploadPhotos();
                if (failed) failed.forEach((k) => drain.failedFloors.add(k));
            } catch (e) {
                drain.error = e;
            }
            drain.done = true;
            _photoDrain = null;
            if (drain.detached) finishDetachedPhotoDrain(drain);
        })();
        await Promise.race([finished, sleepMs(PHOTO_SYNC_WAIT_MS)]);
        if (drain.done) {
            if (drain.error) throw drain.error;
            return drain.failedFloors;
        }
        drain.detached = true;
        console.info('[사진] 업로드가 길어져 뒤에서 계속 올리고, 층 데이터부터 올립니다.');
        return new Set();
    }

    /** 뒤에서 돌던 사진이 끝났다 — 맡은 층을 한 번 더 올려 사진 주소를 싣는다. 실패가 있으면 평소처럼 백오프로 재시도. */
    function finishDetachedPhotoDrain(drain) {
        // 층 쓰기가 끝나면 「올릴 것」 표시를 지우므로, 동기화 중에 표시하면 사라진다 — 끝난 뒤에 표시
        if (_syncInFlight) {
            setTimeout(() => finishDetachedPhotoDrain(drain), 1000);
            return;
        }
        try {
            const floors = new Set(drain.floors);
            drain.failedFloors.forEach((k) => floors.add(k));
            floors.forEach((k) => markFloorKeyDirty(k));
            if (typeof syncProgressFail === 'function') drain.failedFloors.forEach((k) => syncProgressFail(k, '사진 업로드 실패 — 다시 시도'));
            if (isSyncParked()) return;
            if (drain.error || drain.failedFloors.size) {
                scheduleSyncRetryAfterError(drain.error || { code: 'partial-failure', message: `사진 업로드 실패(${drain.failedFloors.size}개 층)` });
            } else if (floors.size) {
                scheduleSyncToFirebase({ skipMarkCurrent: true });
            }
        } catch (e) {
            console.warn('[사진] 뒤에서 올린 뒤 처리 실패:', e);
        }
    }

    /**
     * opts.fromSync: 동기화가 대신 올리는 것(새로 넣은 도면이 아님) — "올려야 함" 표시를 새로 찍지 않는다.
     * 그 외 호출(도면 등록·교체·복사·백업 불러오기)은 사용자가 넣은 새 도면이므로 먼저 표시를 찍고,
     * 올리기에 성공하면 지운다. 실패하면 표시가 남아 다음 동기화가 다시 올린다.
     */
    async function uploadFloorDrawing(buildingId, floorCode, dataUrl, opts) {
        if (!dataUrl || isPdfDrawingUrl(dataUrl)) return false;
        const docId = `${buildingId}_${floorCode}`;
        const fromSync = !!(opts && opts.fromSync);
        let pendingAt = 0;
        if (!fromSync) {
            pendingAt = Date.now();
            markPendingDrawingUpload(docId, pendingAt);
        }
        const ok = await uploadFloorDrawingNow(buildingId, floorCode, dataUrl);
        // 동기화가 표시 없이 올린 것(클라우드에 없던 층)은 표시를 건드리지 않는다 — 그 사이 새로 넣은 도면 표시를 지우면 안 됨
        const clearAt = fromSync ? (Number(opts.pendingAt) || 0) : pendingAt;
        if (ok && clearAt) clearPendingDrawingUpload(docId, clearAt);
        return ok;
    }

    async function uploadFloorDrawingNow(buildingId, floorCode, dataUrl) {
        if (!db || !window.state.companyId || !dataUrl) return false;
        const docId = `${buildingId}_${floorCode}`;
        const docRef = db.collection('safety_app').doc(getCompanyDocId())
            .collection('floorDrawings').doc(docId);

        if (USE_FIREBASE_STORAGE_FOR_DRAWINGS && getFirebaseStorage()) {
            try {
                const parsedHint = parseDataUrl(dataUrl);
                const contentType = (parsedHint && parsedHint.contentType) || 'image/jpeg';
                const scope = storageScopeForBuildingId(buildingId);
                const path = storagePathFloorDrawing(getCompanyDocId(), buildingId, floorCode, contentType, scope);
                let previousStoragePath = null;
                try {
                    const prevSnap = await docRef.get();
                    if (prevSnap.exists) previousStoragePath = storagePathFromSnapData(prevSnap.data() || {});
                } catch (_e) { /* ignore */ }
                await uploadAssetToFirebaseStorageAndMeta(docRef, path, dataUrl, {
                    freshName: true,
                    buildingId,
                    floorCode,
                    site: scope.site,
                    round: scope.round,
                    previousStoragePath
                });
                ensureCloudSyncedDrawingKeys();
                window._cloudSyncedDrawingKeys.add(docId);
                scheduleSaveCloudSyncedKeys();
                return true;
            } catch (e) {
                console.warn('도면 Storage 업로드 실패:', buildingId, floorCode, e);
                return false;
            }
        }

        let payload = dataUrl;
        const maxChars = 950000;
        try {
            if (payload.length > maxChars && typeof window.resizeDataUrlToMaxDim === 'function') {
                payload = await window.resizeDataUrlToMaxDim(payload, 3200, 0.85);
            }
            if (payload.length > maxChars && typeof window.resizeDataUrlToMaxDim === 'function') {
                payload = await window.resizeDataUrlToMaxDim(payload, 2400, 0.8);
            }
            await docRef.set({ dataUrl: payload, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
            ensureCloudSyncedDrawingKeys();
            window._cloudSyncedDrawingKeys.add(docId);
            scheduleSaveCloudSyncedKeys();
            return true;
        } catch (e) {
            console.warn('도면 업로드 실패:', buildingId, floorCode, e);
            return false;
        }
    }

    function floorDrawingTierCloudDocId(buildingId, floorCode, dim) {
        return `${buildingId}_${floorCode}_${dim}`;
    }

    function getFloorDrawingTiersCollection() {
        if (!db || !window.state.companyId) return null;
        return db.collection('safety_app').doc(getCompanyDocId()).collection('floorDrawingTiers');
    }

    function isFirestorePermissionError(err) {
        if (!err) return false;
        const code = String(err.code || '');
        const msg = String(err.message || '');
        return code === 'permission-denied'
            || msg.includes('Missing or insufficient permissions');
    }

    async function fetchCloudFloorDrawingTier(buildingId, floorCode, dim) {
        if (!buildingId || !floorCode || !dim) return null;
        const col = getFloorDrawingTiersCollection();
        if (!col) return null;
        try {
            const url = await readChunkedPdfFromDocRef(col.doc(floorDrawingTierCloudDocId(buildingId, floorCode, dim)));
            return (typeof url === 'string' && url.length > 32) ? url : null;
        } catch (e) {
            if (isFirestorePermissionError(e)) {
                if (!window._floorTierPermissionWarned) {
                    window._floorTierPermissionWarned = true;
                    console.warn(
                        '도면 티어(Firestore floorDrawingTiers) 조회 권한 없음 — '
                        + 'Firebase 콘솔에 firestore.rules(floorDrawingTiers·parts)를 배포했는지 확인하세요.',
                        e
                    );
                }
            } else {
                console.warn('도면 티어 조회 실패:', buildingId, floorCode, dim, e);
            }
            return null;
        }
    }

    async function fetchAndCacheCloudFloorDrawingTier(bldg, floorCode, dim) {
        if (!bldg || !bldg.id || !floorCode || !dim) return null;
        const cloudKey = `${bldg.id}_${floorCode}_${dim}`;
        if (_floorTierCloudFetchPromises.has(cloudKey)) {
            return _floorTierCloudFetchPromises.get(cloudKey);
        }
        const epochAtStart = (bldg._drawingEpoch && bldg._drawingEpoch[floorCode]) || 0;
        const job = (async () => {
            _floorTierCloudFetchInFlight.add(cloudKey);
            try {
                if (typeof updateMapZoomOverlay === 'function') updateMapZoomOverlay();
            } catch (_) { /* overlay optional */ }
            try {
                if (isDrawingReplaceGuarded(bldg, floorCode)) return null;
                const cloudTier = await fetchCloudFloorDrawingTier(bldg.id, floorCode, dim);
                if (((bldg._drawingEpoch && bldg._drawingEpoch[floorCode]) || 0) !== epochAtStart) {
                    return null;
                }
                if (isDrawingReplaceGuarded(bldg, floorCode)) return null;
                if (cloudTier && isUsableRasterDrawingUrl(cloudTier)) {
                    cacheFloorDrawingTierToDevice(bldg, floorCode, dim, cloudTier);
                    return cloudTier;
                }
                return null;
            } catch (e) {
                console.warn('도면 티어 서버 받기 실패:', cloudKey, e);
                return null;
            } finally {
                _floorTierCloudFetchInFlight.delete(cloudKey);
                _floorTierCloudFetchPromises.delete(cloudKey);
                try {
                    if (typeof updateMapZoomOverlay === 'function') updateMapZoomOverlay();
                } catch (_) { /* overlay optional */ }
            }
        })();
        _floorTierCloudFetchPromises.set(cloudKey, job);
        return job;
    }

    async function uploadFloorDrawingTiers(buildingId, floorCode, tiers) {
        if (!buildingId || !floorCode || !tiers) return false;
        const col = getFloorDrawingTiersCollection();
        if (!col) return false;
        const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
        let ok = true;
        if (!window._cloudSyncedTierKeys) window._cloudSyncedTierKeys = new Set();
        for (const dim of dims) {
            const url = tiers[String(dim)] || tiers[dim];
            if (!url || !isUsableRasterDrawingUrl(url)) continue;
            const docId = floorDrawingTierCloudDocId(buildingId, floorCode, dim);
            try {
                const docRef = col.doc(docId);
                if (USE_FIREBASE_STORAGE_FOR_DRAWINGS && getFirebaseStorage()) {
                    const parsedHint = parseDataUrl(url);
                    const contentType = (parsedHint && parsedHint.contentType) || 'image/jpeg';
                    const scope = storageScopeForBuildingId(buildingId);
                    const path = storagePathFloorDrawingTier(
                        getCompanyDocId(), buildingId, floorCode, dim, contentType, scope
                    );
                    let previousStoragePath = null;
                    try {
                        const prevSnap = await docRef.get();
                        if (prevSnap.exists) previousStoragePath = storagePathFromSnapData(prevSnap.data() || {});
                    } catch (_e) { /* ignore */ }
                    await withTimeout(
                        uploadAssetToFirebaseStorageAndMeta(docRef, path, url, {
                            freshName: true,
                            dim,
                            floorCode,
                            buildingId,
                            site: scope.site,
                            round: scope.round,
                            previousStoragePath
                        }),
                        dim >= 16000 ? 90000 : 60000,
                        `tier-upload-${dim}`
                    );
                } else {
                    await withTimeout(
                        writeChunkedPdfToDocRef(docRef, url, {
                            dim,
                            floorCode,
                            buildingId
                        }),
                        dim >= 16000 ? 90000 : 60000,
                        `tier-upload-${dim}`
                    );
                }
                window._cloudSyncedTierKeys.add(docId);
            } catch (e) {
                console.warn('도면 티어 업로드 실패:', docId, e);
                if (window._cloudSyncedTierKeys) window._cloudSyncedTierKeys.delete(docId);
                ok = false;
            }
        }
        return ok;
    }

    function getCloudSyncedStorageKey(kind) {
        const cid = (typeof getCompanyDocId === 'function' ? getCompanyDocId() : (window.state && window.state.companyId)) || 'default';
        return `bsa_cloud_synced_${kind}_${cid}`;
    }

    function initCloudSyncedKeySet(kind) {
        const set = new Set();
        try {
            const raw = localStorage.getItem(getCloudSyncedStorageKey(kind));
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) arr.forEach((k) => set.add(k));
            }
        } catch (_) {}
        return set;
    }

    let _saveCloudSyncedDebounceTimer = null;
    function scheduleSaveCloudSyncedKeys() {
        if (_saveCloudSyncedDebounceTimer) return;
        _saveCloudSyncedDebounceTimer = setTimeout(() => {
            _saveCloudSyncedDebounceTimer = null;
            try {
                if (window._cloudSyncedDrawingKeys) {
                    localStorage.setItem(getCloudSyncedStorageKey('drawings'), JSON.stringify(Array.from(window._cloudSyncedDrawingKeys)));
                }
                if (window._cloudSyncedTierKeys) {
                    localStorage.setItem(getCloudSyncedStorageKey('tiers'), JSON.stringify(Array.from(window._cloudSyncedTierKeys)));
                }
                if (window._cloudSyncedPdfKeys) {
                    localStorage.setItem(getCloudSyncedStorageKey('pdfs'), JSON.stringify(Array.from(window._cloudSyncedPdfKeys)));
                }
            } catch (_) {}
        }, 800);
    }

    function ensureCloudSyncedDrawingKeys() {
        if (!window._cloudSyncedDrawingKeys) window._cloudSyncedDrawingKeys = initCloudSyncedKeySet('drawings');
        return window._cloudSyncedDrawingKeys;
    }

    // 사용자가 도면을 새로 넣었는데 아직 클라우드에 못 올린 층 { floorKey: 넣은 시각(ms) }.
    // 동기화는 이 표시가 있는 층과 클라우드에 도면이 아예 없는 층만 올린다.
    // (예전에는 "이번 실행에서 올렸나"만 봐서, 현장 앱이 켤 때마다 기기의 옛 도면으로
    //  클라우드의 새 도면을 덮었다 — 2026-09-22 GPT 감사 2번)
    function readPendingDrawingUploads() {
        try {
            const raw = localStorage.getItem(getCloudSyncedStorageKey('drawing_upload_pending'));
            const obj = raw ? JSON.parse(raw) : null;
            return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
        } catch (_) {
            return {};
        }
    }

    function writePendingDrawingUploads(map) {
        try {
            localStorage.setItem(getCloudSyncedStorageKey('drawing_upload_pending'), JSON.stringify(map || {}));
        } catch (_) {}
    }

    function markPendingDrawingUpload(floorKey, atMs) {
        if (!floorKey) return;
        const map = readPendingDrawingUploads();
        map[floorKey] = atMs || Date.now();
        writePendingDrawingUploads(map);
    }

    function clearPendingDrawingUpload(floorKey, onlyIfAtMs) {
        if (!floorKey) return;
        const map = readPendingDrawingUploads();
        if (!Object.prototype.hasOwnProperty.call(map, floorKey)) return;
        // 올리는 사이 같은 층 도면을 또 바꿨으면 새 표시는 남긴다
        if (onlyIfAtMs && map[floorKey] !== onlyIfAtMs) return;
        delete map[floorKey];
        writePendingDrawingUploads(map);
    }

    /** 클라우드 도면 문서 상태. 조회 실패는 error:true — 모르면 올리지 않는다. */
    async function readCloudFloorDrawingState(buildingId, floorCode) {
        if (!db || !window.state.companyId || !buildingId || !floorCode) return { error: true };
        const docId = `${buildingId}_${floorCode}`;
        try {
            const snap = await db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawings').doc(docId).get();
            if (!snap.exists) return { exists: false, usable: false, needsMove: false, updatedAtMs: 0 };
            const data = snap.data() || {};
            const ts = data.updatedAt;
            const updatedAtMs = (ts && typeof ts.toMillis === 'function') ? ts.toMillis() : 0;
            return {
                exists: true,
                usable: hasFirebaseStorageMeta(data) || isUsableRasterDrawingUrl(data.dataUrl),
                needsMove: snapNeedsSiteRoundMove(data),
                updatedAtMs
            };
        } catch (e) {
            console.warn('도면 상태 확인 실패:', docId, e);
            return { error: true };
        }
    }

    async function cloudFloorDrawingTierExists(buildingId, floorCode, dim) {
        const docId = floorDrawingTierCloudDocId(buildingId, floorCode, dim);
        if (!window._cloudSyncedTierKeys) window._cloudSyncedTierKeys = initCloudSyncedKeySet('tiers');
        if (window._cloudSyncedTierKeys.has(docId)) return true;
        const col = getFloorDrawingTiersCollection();
        if (!col) return false;
        try {
            const snap = await col.doc(docId).get();
            if (!snap.exists) {
                window._cloudSyncedTierKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            const data = snap.data() || {};
            if (snapNeedsSiteRoundMove(data)) {
                window._cloudSyncedTierKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            if (hasFirebaseStorageMeta(data)
                || (data.dataUrl && String(data.dataUrl).length > 32)) {
                window._cloudSyncedTierKeys.add(docId);
                scheduleSaveCloudSyncedKeys();
                return true;
            }
            // ready 청크는 parts 전체를 list하지 않는다 (존재 확인만 필요, 읽기 폭증 방지)
            if (data.chunkStatus === 'ready' && data.chunked && Number(data.chunkCount) > 0) {
                window._cloudSyncedTierKeys.add(docId);
                scheduleSaveCloudSyncedKeys();
                return true;
            }
            if (data.chunked && Number(data.chunkCount) > 0 && !data.chunkStatus) {
                const url = await decodeChunkedPayloadFromData(data, col.doc(docId));
                if (url && String(url).length > 32) {
                    window._cloudSyncedTierKeys.add(docId);
                    scheduleSaveCloudSyncedKeys();
                    return true;
                }
            }
            window._cloudSyncedTierKeys.delete(docId);
            scheduleSaveCloudSyncedKeys();
            return false;
        } catch (e) {
            console.warn('도면 티어 존재 확인 실패:', docId, e);
        }
        return false;
    }

    async function deleteFloorDrawingTiersFromCloud(buildingId, floorCode) {
        const col = getFloorDrawingTiersCollection();
        if (!col || !buildingId || !floorCode) return;
        const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
        for (const dim of dims) {
            const docId = floorDrawingTierCloudDocId(buildingId, floorCode, dim);
            try {
                const fallback = storagePathFloorDrawingTier(
                    getCompanyDocId(), buildingId, floorCode, dim, 'image/jpeg',
                    storageScopeForBuildingId(buildingId)
                );
                await deleteCloudAssetDoc(col.doc(docId), fallback);
                if (window._cloudSyncedTierKeys) {
                    window._cloudSyncedTierKeys.delete(docId);
                    scheduleSaveCloudSyncedKeys();
                }
            } catch (e) {
                console.warn('도면 티어 서버 삭제 실패:', docId, e);
            }
        }
    }

    async function deleteFloorDrawingRasterFromCloud(buildingId, floorCode) {
        if (!db || !window.state.companyId || !buildingId || !floorCode) return;
        const docId = `${buildingId}_${floorCode}`;
        try {
            const docRef = db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawings').doc(docId);
            const fallback = storagePathFloorDrawing(
                getCompanyDocId(), buildingId, floorCode, 'image/jpeg',
                storageScopeForBuildingId(buildingId)
            );
            await deleteCloudAssetDoc(docRef, fallback);
            if (window._cloudSyncedDrawingKeys) {
                window._cloudSyncedDrawingKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
            }
        } catch (e) {
            console.warn('도면 원본 서버 삭제 실패:', docId, e);
        }
    }

    async function fetchCloudFloorDrawingDataUrl(buildingId, floorCode) {
        if (!db || !window.state.companyId || !buildingId || !floorCode) return null;
        try {
            const docRef = db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawings').doc(`${buildingId}_${floorCode}`);
            const snap = await docRef.get();
            if (!snap.exists) return null;
            const url = await decodeChunkedPayloadFromData(snap.data() || {}, docRef);
            return (typeof url === 'string' && url.length > 32) ? url : null;
        } catch (e) {
            console.warn('Firestore 도면 조회 실패:', buildingId, floorCode, e);
            return null;
        }
    }

    async function cloudFloorDrawingExists(buildingId, floorCode) {
        if (!db || !window.state.companyId || !buildingId || !floorCode) return false;
        const docId = `${buildingId}_${floorCode}`;
        if (!window._cloudSyncedDrawingKeys) window._cloudSyncedDrawingKeys = initCloudSyncedKeySet('drawings');
        if (window._cloudSyncedDrawingKeys.has(docId)) return true;
        try {
            const snap = await db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawings').doc(docId).get();
            if (!snap.exists) {
                window._cloudSyncedDrawingKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            const data = snap.data() || {};
            if (snapNeedsSiteRoundMove(data)) {
                window._cloudSyncedDrawingKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            const ok = hasFirebaseStorageMeta(data) || isUsableRasterDrawingUrl(data.dataUrl);
            if (ok) {
                window._cloudSyncedDrawingKeys.add(docId);
                scheduleSaveCloudSyncedKeys();
                return true;
            }
            window._cloudSyncedDrawingKeys.delete(docId);
            scheduleSaveCloudSyncedKeys();
            return false;
        } catch (e) {
            console.warn('도면 존재 확인 실패:', docId, e);
            return false;
        }
    }

    /** Firestore·현장 보관함에 실제로 올라간 층 코드 목록 (floorsList 없을 때 사용) */
    const _cloudDrawingFloorCodesCache = new Map();
    const CLOUD_DRAWING_FLOOR_CODES_TTL_MS = 5 * 60 * 1000;

    function invalidateCloudDrawingFloorCodesCache(bldg) {
        try {
            if (bldg && bldg.id) {
                _cloudDrawingFloorCodesCache.delete(`${getCompanyDocId()}::${bldg.id}`);
            } else {
                _cloudDrawingFloorCodesCache.clear();
            }
        } catch (_e) { /* ignore */ }
    }

    function buildingHasDrawingFloorTombstones(bldg) {
        if (!bldg) return false;
        if ((bldg.deletedDrawingFloorCodes || []).some((c) => !!String(c || '').trim())) return true;
        if (!bldg.id || !_sessionDeletedDrawingKeys || typeof _sessionDeletedDrawingKeys.forEach !== 'function') {
            return false;
        }
        let hit = false;
        const pref = String(bldg.id) + '_';
        _sessionDeletedDrawingKeys.forEach((k) => {
            if (k && String(k).indexOf(pref) === 0) hit = true;
        });
        return hit;
    }

    /** 지운 층을 서버 문서 증거로 되살려도 되나: 삭제 시각이 없는 옛 묘비(오탐)는 예전처럼 살리고,
     *  사용자가 지운 층은 그 뒤에 올라온 문서(docAt > 삭제 시각)일 때만 */
    function evidenceCanReviveDeletedFloor(bldg, floorCode, docAt) {
        const fn = _drawingFloorTombstone && _drawingFloorTombstone.getDeletedDrawingFloorAt;
        const deletedAt = typeof fn === 'function' ? fn(bldg, floorCode) : 0;
        if (!deletedAt) return true;
        return Number(docAt) > deletedAt;
    }

    async function discoverCloudDrawingFloorCodes(bldg) {
        const codes = new Set();
        if (!bldg || !bldg.id) return codes;
        (bldg.drawingFloorCodes || []).forEach((fc) => {
            if (fc && !isDeletedDrawingFloor(bldg, fc)) codes.add(fc);
        });
        (bldg.floorsList || []).forEach((f) => {
            if (f && f.floorCode && !isDeletedDrawingFloor(bldg, f.floorCode)) codes.add(f.floorCode);
        });
        // EXT·부대시설만 남아 있어도 false tombstone이 있으면 클라우드 조회를 건너뛰면 안 된다.
        // (예전 early-return 때문에 폰이 1F/2F/3F 클라우드 도면을 영구히 못 찾음)
        const needCloudForTombstones = buildingHasDrawingFloorTombstones(bldg);
        if (codes.size > 0 && !needCloudForTombstones) return codes;
        if (!db || !window.state.companyId) return codes;
        const cacheKey = `${getCompanyDocId()}::${bldg.id}`;
        const cached = _cloudDrawingFloorCodesCache.get(cacheKey);
        if (cached && (Date.now() - cached.at) < CLOUD_DRAWING_FLOOR_CODES_TTL_MS) {
            cached.codes.forEach((fc) => {
                if (!fc) return;
                codes.add(fc);
            });
            // 캐시 히트여도 tombstone 해제는 수행 (해제가 실제로 됐을 때만 counted)
            let cachedHealed = 0;
            Array.from(codes).forEach((fc) => {
                if (!fc) return;
                if (!isDeletedDrawingFloor(bldg, fc)) return;
                if (!evidenceCanReviveDeletedFloor(bldg, fc, 0)) { codes.delete(fc); return; }
                if (forgetDeletedDrawingFloor(bldg, fc, { fromEvidence: true })) {
                    cachedHealed += 1;
                }
            });
            if (cachedHealed > 0) {
                console.info('[tombstone] 클라우드 캐시 도면 증거로 false tombstone 해제:', bldg.id, cachedHealed);
                bldg._pendingCloudSync = true;
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            }
            // tombstone 해제가 필요했는데 캐시에 증거가 없거나 해제가 막혔으면 live 조회
            if (!needCloudForTombstones || cachedHealed > 0 || !buildingHasDrawingFloorTombstones(bldg)) {
                return codes;
            }
        }
        const companyRef = db.collection('safety_app').doc(getCompanyDocId());
        const docPrefix = `${bldg.id}_`;
        // 층별 서버 문서의 마지막 수정 시각 — 사용자가 지운 뒤에 다시 올린 문서만 묘비를 푼다(2026-10-14)
        const docAtByCode = new Map();
        const noteDocAt = (fc, doc) => {
            let at = 0;
            try {
                const d = doc.data ? (doc.data() || {}) : {};
                const u = d.updatedAt;
                at = u && typeof u.toMillis === 'function' ? u.toMillis() : (Number(u) || Number(d.uploadedAt) || 0);
            } catch (_e) { at = 0; }
            docAtByCode.set(fc, Math.max(docAtByCode.get(fc) || 0, at));
        };
        const parseDocFloors = (snap) => {
            if (!snap) return;
            snap.forEach((doc) => {
                if (!doc.id.startsWith(docPrefix)) return;
                const fc = doc.id.slice(docPrefix.length);
                if (fc) { codes.add(fc); noteDocAt(fc, doc); }
            });
        };
        const parseTierDocFloors = (snap) => {
            if (!snap) return;
            const prefix = `${bldg.id}_`;
            snap.forEach((doc) => {
                if (!doc.id.startsWith(prefix)) return;
                const rest = doc.id.slice(prefix.length);
                const m = rest.match(/^(.+)_(\d+)$/);
                if (m && m[1]) { codes.add(m[1]); noteDocAt(m[1], doc); }
            });
        };
        try {
            const docIdField = firebase.firestore.FieldPath.documentId();
            const tierPrefix = `${bldg.id}_`;
            const [rasterSnap, pdfSnap, tierSnap] = await Promise.all([
                companyRef.collection('floorDrawings')
                    .orderBy(docIdField).startAt(docPrefix).endAt(docPrefix + '\uf8ff')
                    .get().catch(() => null),
                companyRef.collection('floorDrawingPdfs')
                    .orderBy(docIdField).startAt(docPrefix).endAt(docPrefix + '\uf8ff')
                    .get().catch(() => null),
                companyRef.collection('floorDrawingTiers')
                    .orderBy(docIdField).startAt(tierPrefix).endAt(tierPrefix + '\uf8ff')
                    .get().catch(() => null),
            ]);
            parseDocFloors(rasterSnap);
            parseDocFloors(pdfSnap);
            parseTierDocFloors(tierSnap);
        } catch (e) {
            console.warn('Firestore 도면 층 목록 조회 실패:', bldg.id, e);
        }
        // 현장 보관함(siteDrawingVault) 층은 "같은 현장의 다른 회차 PDF 공유"용이다.
        // 여기서 층 목록에 합치면 신규·다른 동 건축물에도 엉뚱한 1F 등이 붙으므로 탐색에서 제외.
        // PDF가 필요할 때는 resolveBuildingFloorPdf / hydrateBuildingPdfsFromSiteVault가
        // 이미 등록된 층 코드에 한해 보관함을 조회한다.
        _cloudDrawingFloorCodesCache.set(cacheKey, { at: Date.now(), codes: Array.from(codes) });
        // 클라우드 floorDrawings/pdfs/tiers 문서가 있으면 오탐 tombstone 해제
        // (의도 삭제는 해당 문서를 지우므로 discover에 안 잡힌다)
        // ROOF 등 서버 deleted에만 남은 층도 동일 — 특별 취급 없음
        let healed = 0;
        Array.from(codes).forEach((fc) => {
            if (!fc) return;
            if (!isDeletedDrawingFloor(bldg, fc)) {
                return;
            }
            // 사용자가 지운 층(삭제 시각 있음)은 그보다 나중에 올라온 서버 문서가 있을 때만 되살린다.
            // 2026-10-14: 지워도 남은 서버 문서(파일은 없는 옛 기록) 때문에 「도면 없음」 층이 다시 생겨 지울 수 없었다.
            if (!evidenceCanReviveDeletedFloor(bldg, fc, docAtByCode.get(fc) || 0)) {
                codes.delete(fc);
                return;
            }
            if (forgetDeletedDrawingFloor(bldg, fc, { fromEvidence: true })) {
                healed += 1;
            }
        });
        if (healed > 0) {
            console.info('[tombstone] 클라우드 도면 문서로 false tombstone 해제:', bldg.id, healed);
            bldg._pendingCloudSync = true;
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        }
        return codes;
    }
    window.discoverCloudDrawingFloorCodes = discoverCloudDrawingFloorCodes;

    /** Firestore 1MB 한도 — 큰 PDF는 parts 서브컬렉션으로 분할 저장 */
    const PDF_CLOUD_CHUNK_CHARS = 850000;

    /** 현장명(건물명에서 연도·반기 접미사 제거) — 같은 현장의 반기별 점검에서 PDF 도면 공유 */
    function normalizeSiteVaultKey(buildingName) {
        let s = String(buildingName || '').replace(/^🏢\s*/, '').trim();
        s = s.replace(/\s+/g, ' ');
        s = s.replace(/\s*20\d{2}\s*년?\s*(상반기|하반기|수시점검)?\s*$/i, '').trim();
        return s || 'unnamed';
    }

    /**
     * 현장 보관함 키 — 여러 동 현장은 동까지 넣는다(2026-10-20).
     * 예전엔 현장명+층만 써서 101동 3F PDF가 102동 3F에 붙었다(옆 동 도면이 보이는 문제).
     * 단동 현장은 예전 키 그대로라 기존 보관함을 그대로 읽는다.
     */
    function siteVaultKeyForBuilding(bldg) {
        const base = normalizeSiteVaultKey(bldg && bldg.name);
        const dong = bldg ? getBuildingDongLabel(bldg) : '';
        if (!dong) return base;
        return base.endsWith(dong) ? base : `${base} ${dong}`;
    }

    function normalizeDongLabel(dong) {
        return String(dong || '').replace(/\s+/g, ' ').trim();
    }

    /** 명칭에서 현장명·동 추정 (레거시: "○○아파트 101동") */
    function inferSiteAndDongFromName(buildingName) {
        const stripped = normalizeSiteVaultKey(buildingName);
        const m = stripped.match(/^(.+?)\s+((?:\d+|[A-Za-z]|[가-힣]+)동)$/u);
        if (m) {
            return { siteName: m[1].trim() || 'unnamed', dong: m[2].trim() };
        }
        return { siteName: stripped || 'unnamed', dong: '' };
    }

    function getBuildingSiteName(bldg) {
        if (!bldg) return 'unnamed';
        const explicit = String(bldg.siteName || '').replace(/^🏢\s*/, '').trim();
        if (explicit) return explicit;
        return inferSiteAndDongFromName(bldg.name).siteName;
    }

    function getBuildingDongLabel(bldg) {
        if (!bldg) return '';
        if (bldg.dong != null && String(bldg.dong).trim() !== '') {
            return normalizeDongLabel(bldg.dong);
        }
        return inferSiteAndDongFromName(bldg.name).dong;
    }

    function composeBuildingDisplayName(siteName, dong) {
        const site = String(siteName || '').replace(/^🏢\s*/, '').trim() || 'unnamed';
        const d = normalizeDongLabel(dong);
        return d ? `${site} ${d}` : site;
    }

    function composeBuildingStorageName(siteName, dong) {
        const body = composeBuildingDisplayName(siteName, dong);
        return body.startsWith('🏢') ? body : `🏢 ${body}`;
    }

    function ensureBuildingSiteFields(bldg) {
        if (!bldg) return bldg;
        if (!bldg.siteName) bldg.siteName = getBuildingSiteName(bldg);
        if (bldg.dong == null) bldg.dong = getBuildingDongLabel(bldg);
        return bldg;
    }

    function formatDongRowLabel(bldg) {
        const dong = getBuildingDongLabel(bldg);
        if (dong) return dong;
        return '동 미지정';
    }

    /** 현장 구성: multiDong=true 이면 동 단계 사용. 미지정 레거시는 회차에 동이 2개 이상이면 여러 동으로 간주 */
    function isSiteMultiDong(siteKey) {
        const key = String(siteKey || '').trim();
        if (!key) return false;
        const list = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter((b) => getBuildingSiteName(b) === key);
        if (!list.length) return false;
        if (list.some((b) => b.multiDong === true)) return true;
        if (list.every((b) => b.multiDong === false)) return false;
        const byRound = new Map();
        list.forEach((b) => {
            const rk = getBuildingSurveyRoundKey(b) || '_none';
            if (!byRound.has(rk)) byRound.set(rk, []);
            byRound.get(rk).push(b);
        });
        for (const members of byRound.values()) {
            if (members.length > 1) return true;
            const labels = new Set(members.map((b) => normalizeDongLabel(getBuildingDongLabel(b))).filter(Boolean));
            if (labels.size > 1) return true;
        }
        return false;
    }

    /**
     * 현장의 동 순서(위에서부터) — 동 이름별로 건물의 dongOrder 중 가장 작은 값, 없으면 가나다 순으로 뒤에.
     * 홈 동 목록과 한글 「동 선택」→ 출력 순서(층 번호·도면 번호가 이어지는 순서)가 이 순서를 따른다.
     */
    function getSiteDongLabelsOrdered(siteKey) {
        const rank = new Map();
        filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter((b) => getBuildingSiteName(b) === siteKey)
            .forEach((b) => {
                const k = formatDongRowLabel(b);
                const n = b.dongOrder == null ? NaN : Number(b.dongOrder);
                const v = Number.isFinite(n) ? n : Infinity;
                if (!rank.has(k) || v < rank.get(k)) rank.set(k, v);
            });
        return [...rank.keys()].sort((a, b) => {
            const ra = rank.get(a);
            const rb = rank.get(b);
            if (ra !== rb) return ra < rb ? -1 : 1;
            return a.localeCompare(b, 'ko');
        });
    }

    function makeDongComparator(siteKey) {
        const idx = new Map(getSiteDongLabelsOrdered(siteKey).map((l, i) => [l, i]));
        return (a, b) => {
            const ia = idx.has(formatDongRowLabel(a)) ? idx.get(formatDongRowLabel(a)) : 1e9;
            const ib = idx.has(formatDongRowLabel(b)) ? idx.get(formatDongRowLabel(b)) : 1e9;
            return ia - ib;
        };
    }

    /** 동 두 개의 순서를 맞바꾼다(모든 회차의 같은 이름 동에 적용) */
    window.moveSiteDong = function(siteKey, dongLabel, otherLabel) {
        const labels = getSiteDongLabelsOrdered(siteKey);
        const i = labels.indexOf(dongLabel);
        const j = labels.indexOf(otherLabel);
        if (i < 0 || j < 0 || i === j) return false;
        [labels[i], labels[j]] = [labels[j], labels[i]];
        filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter((b) => getBuildingSiteName(b) === siteKey)
            .forEach((b) => {
                const n = labels.indexOf(formatDongRowLabel(b));
                if (n < 0 || b.dongOrder === n) return;
                b.dongOrder = n;
                b._pendingCloudSync = true;
                if (typeof markBuildingMetaDirty === 'function') markBuildingMetaDirty(b);
                if (window.state.currentBuildingId === b.id && window.state.currentBuilding) window.state.currentBuilding.dongOrder = n;
            });
        saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderDashboard === 'function') renderDashboard();
        return true;
    };

    function setSiteMultiDongFlag(siteKey, multiDong) {
        const key = String(siteKey || '').trim();
        if (!key) return;
        filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
            .filter((b) => getBuildingSiteName(b) === key)
            .forEach((b) => {
                b.multiDong = !!multiDong;
                if (!multiDong) b.dong = '';
            });
    }

    function readSiteLayoutRadio(name, fallbackMulti) {
        const el = document.querySelector(`input[name="${name}"]:checked`);
        if (!el) return !!fallbackMulti;
        return el.value === 'multi';
    }

    function setSiteLayoutRadio(name, multiDong) {
        const val = multiDong ? 'multi' : 'single';
        document.querySelectorAll(`input[name="${name}"]`).forEach((el) => {
            el.checked = el.value === val;
        });
    }

    function syncAddBuildingDongFieldVisibility() {
        const multi = readSiteLayoutRadio('addBuildingSiteLayout', false);
        const group = document.getElementById('addBuildingDongGroup');
        if (group) group.hidden = !multi;
        if (!multi) {
            const dongInput = document.getElementById('inputBuildingDong');
            if (dongInput) dongInput.value = '';
            resetAddBuildingDongRows();
        }
    }

    /** 건축물 등록 「여러 동」: 동 명칭 입력 행(첫 행 = #inputBuildingDong) */
    function getAddBuildingDongInputs() {
        const first = document.getElementById('inputBuildingDong');
        const extra = Array.from(document.querySelectorAll('#addBuildingExtraDongs input.dong-name-input'));
        return (first ? [first] : []).concat(extra);
    }
    function refreshAddBuildingDongRowButtons() {
        const inputs = getAddBuildingDongInputs();
        const firstDel = document.getElementById('btnDelFirstDongRow');
        if (firstDel) firstDel.hidden = inputs.length <= 1;
    }
    function addAddBuildingDongRow(value) {
        const host = document.getElementById('addBuildingExtraDongs');
        if (!host) return null;
        const row = document.createElement('div');
        row.className = 'dong-name-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control dong-name-input';
        input.placeholder = '예: 102동, B동';
        input.value = value || '';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'dong-name-row-del';
        del.title = '이 동 삭제';
        del.setAttribute('aria-label', '이 동 삭제');
        del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        del.addEventListener('click', () => { row.remove(); refreshAddBuildingDongRowButtons(); });
        row.appendChild(input);
        row.appendChild(del);
        host.appendChild(row);
        refreshAddBuildingDongRowButtons();
        return input;
    }
    function resetAddBuildingDongRows() {
        const host = document.getElementById('addBuildingExtraDongs');
        if (host) host.innerHTML = '';
        getAddBuildingDongInputs().forEach((el) => el.classList.remove('is-invalid'));
        refreshAddBuildingDongRowButtons();
    }
    (function wireAddBuildingDongRows() {
        if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
        const addBtn = document.getElementById('btnAddDongNameRow');
        if (addBtn) addBtn.addEventListener('click', () => {
            const input = addAddBuildingDongRow('');
            if (input) input.focus();
        });
        const firstDel = document.getElementById('btnDelFirstDongRow');
        if (firstDel) firstDel.addEventListener('click', () => {
            // 첫 행 삭제 = 두 번째 행 값을 첫 행으로 당기고 두 번째 행 제거 (최소 1행 유지)
            const extraRows = document.querySelectorAll('#addBuildingExtraDongs .dong-name-row');
            if (!extraRows.length) return;
            const first = document.getElementById('inputBuildingDong');
            const nextInput = extraRows[0].querySelector('input');
            if (first) first.value = nextInput ? nextInput.value : '';
            extraRows[0].remove();
            refreshAddBuildingDongRowButtons();
        });
    })();
    /** 입력된 동 명칭 검증 → { ok, names } (trim·빈칸·중복 거부). 행이 1개면 기존처럼 빈 값 허용 */
    function collectAddBuildingDongNames() {
        const inputs = getAddBuildingDongInputs();
        inputs.forEach((el) => el.classList.remove('is-invalid'));
        const names = [];
        const seen = new Set();
        for (const el of inputs) {
            const v = normalizeDongLabel(el.value);
            el.value = v;
            if (!v) {
                if (inputs.length === 1) return { ok: true, names: [''] };
                el.classList.add('is-invalid');
                window.showToast('비어 있는 동 명칭이 있습니다. 입력하거나 행을 삭제해 주세요.', 'warning');
                el.focus();
                return { ok: false };
            }
            const key = v.toLowerCase();
            if (seen.has(key)) {
                el.classList.add('is-invalid');
                window.showToast(`동 명칭 "${v}"이(가) 중복되었습니다.`, 'warning');
                el.focus();
                return { ok: false };
            }
            seen.add(key);
            names.push(v);
        }
        return { ok: true, names };
    }

    function syncEditBuildingDongFieldVisibility() {
        const multi = readSiteLayoutRadio('editBuildingSiteLayout', false);
        const group = document.getElementById('editBuildingDongGroup');
        if (group) group.hidden = !multi;
        if (!multi) {
            const dongInput = document.getElementById('inputEditBuildingDong');
            if (dongInput) dongInput.value = '';
        }
    }

    function siteVaultDocId(siteKey) {
        const id = String(siteKey || 'unnamed')
            .replace(/[\\/:*?"<>|#\s]+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 120);
        return id || 'unnamed';
    }

    /** 회사 작업자(users/members)와 별개 — 점검 칸은 현장/회차/동/층이 전부 다른 문서 */
    function getFirestoreSiteKey(bldg) {
        return siteVaultDocId(getBuildingSiteName(bldg));
    }

    function getFirestoreRoundKey(bldg) {
        const raw = (typeof getBuildingSurveyRoundKey === 'function')
            ? getBuildingSurveyRoundKey(bldg)
            : '';
        return siteVaultDocId(raw || 'unknown');
    }

    function getFirestoreDongKey(bldg) {
        const siteName = getBuildingSiteName(bldg);
        const multi = typeof isSiteMultiDong === 'function' && isSiteMultiDong(siteName);
        if (!multi) return '';
        const dong = getBuildingDongLabel(bldg);
        return dong ? siteVaultDocId(dong) : '';
    }

    /** 회사 → 현장 → 회차 → (동 있으면) → 층. 단동은 동 칸을 만들지 않는다. */
    function getFloorScopeRef(bldg, floorCode) {
        if (!db || !window.state.companyId || !bldg || !floorCode) return null;
        let ref = db.collection('safety_app').doc(getCompanyDocId())
            .collection('sites').doc(getFirestoreSiteKey(bldg))
            .collection('rounds').doc(getFirestoreRoundKey(bldg));
        let dongKey = getFirestoreDongKey(bldg);
        // 같은 현장·회차에서 동 칸이 겹치는(동 이름 없음·같은 이름) 다른 건물이 있으면, 가장 먼저 만든 건물만
        // 예전 칸을 쓰고 나머지는 건물 id 칸을 쓴다 — 두 동이 한 층 문서를 같이 써서 옆 동 도면이 보였다(2026-10-20)
        const owner = floorScopeOwnerId(bldg, dongKey);
        if (owner && owner !== bldg.id) dongKey = siteVaultDocId(`b_${bldg.id}`);
        if (dongKey) ref = ref.collection('dongs').doc(dongKey);
        return ref.collection('floors').doc(String(floorCode));
    }

    /** 같은 층 칸(현장·회차·동 키)을 쓰는 건물 중 id가 가장 앞선 건물 */
    function floorScopeOwnerId(bldg, dongKey) {
        try {
            const site = getFirestoreSiteKey(bldg);
            const round = getFirestoreRoundKey(bldg);
            const ids = filterActiveBuildings(window.state.buildings || [], window.state.deletedBuildingIds)
                .filter((b) => b && b.id && getFirestoreSiteKey(b) === site && getFirestoreRoundKey(b) === round
                    && getFirestoreDongKey(b) === dongKey)
                .map((b) => String(b.id))
                .sort();
            if (ids.length < 2) return '';
            return ids.indexOf(String(bldg.id)) >= 0 ? ids[0] : '';
        } catch (_e) {
            return '';
        }
    }
    window.getFloorScopeRef = getFloorScopeRef;
    window.getFirestoreSiteKey = getFirestoreSiteKey;
    window.getFirestoreRoundKey = getFirestoreRoundKey;
    window.siteVaultDocId = siteVaultDocId;

    function getFloorKindDocRef(bldg, floorCode, kind) {
        const floorRef = getFloorScopeRef(bldg, floorCode);
        if (!floorRef || !kind) return null;
        return floorRef.collection('docs').doc(String(kind));
    }

    function currentInspectionFloorKey() {
        const id = window.state.currentBuildingId;
        const fl = window.state.currentFloor;
        if (!id || !fl) return null;
        return `${id}_${fl}`;
    }

    function findBuildingForFloorKey(floorKey) {
        const key = String(floorKey || '');
        let best = null;
        (window.state.buildings || []).forEach((b) => {
            if (!b || !b.id) return;
            const prefix = String(b.id) + '_';
            if (key.indexOf(prefix) === 0) {
                if (!best || String(b.id).length > String(best.id).length) best = b;
            }
        });
        return best;
    }

    function floorCodeFromFloorKey(floorKey, bldg) {
        if (!bldg || !bldg.id || !floorKey) return '';
        const prefix = String(bldg.id) + '_';
        if (String(floorKey).indexOf(prefix) !== 0) return '';
        return String(floorKey).slice(prefix.length);
    }

    /** Firestore client write stream overload guard */
    let _fsWriteChain = Promise.resolve();
    let _fsWritePausedUntil = 0;
    function pauseFirestoreWrites(ms) {
        _fsWritePausedUntil = Math.max(_fsWritePausedUntil, Date.now() + Math.max(0, ms || 0));
    }
    // 2026-11-07 서버 응답 없이 멈춘 쓰기 하나가 뒤의 쓰기를 전부 막지 않게 기다리는 시간을 제한한다.
    // SDK는 끊겨도 쓰기를 실패시키지 않고 붙들고 있다. 시간이 지나도 그 쓰기는 SDK 대기열에 남아 연결되면 순서대로 올라간다.
    const FS_WRITE_TIMEOUT_MS = 120000;
    const FS_WRITE_PARTS_TIMEOUT_MS = 300000;
    function withFirestoreWriteTimeout(task, timeoutMs) {
        let timer = null;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                const e = new Error('서버 쓰기 응답 없음 — 다음 동기화에서 다시');
                e.code = 'write-timeout';
                reject(e);
            }, timeoutMs);
        });
        return Promise.race([Promise.resolve().then(task), timeout]).finally(() => clearTimeout(timer));
    }
    function enqueueFirestoreWrite(task, timeoutMs) {
        const run = async () => {
            while (Date.now() < _fsWritePausedUntil) {
                await new Promise((r) => setTimeout(r, Math.min(1000, Math.max(50, _fsWritePausedUntil - Date.now()))));
            }
            return withFirestoreWriteTimeout(task, timeoutMs || FS_WRITE_TIMEOUT_MS);
        };
        const p = _fsWriteChain.then(run, run);
        _fsWriteChain = p.then(() => undefined, () => undefined);
        return p;
    }

    const _lastChunkWriteMeta = new Map();

    async function writeChunkedPdfToDocRef(docRef, pdfDataUrl, extraFields) {
        const payload = String(pdfDataUrl);
        const base = { ...(extraFields || {}), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        if (payload.length <= PDF_CLOUD_CHUNK_CHARS) {
            await enqueueFirestoreWrite(() =>
                docRef.set({
                    ...base,
                    dataUrl: payload,
                    chunked: false,
                    chunkCount: 0,
                    writeId: null,
                    chunkStatus: 'ready'
                }, { merge: true })
            );
            rememberDecodedChunkPayload(docRef, { writeId: null, dataUrl: payload }, payload);
            const prevMeta = _lastChunkWriteMeta.get(chunkDocCacheKey(docRef)) || null;
            _lastChunkWriteMeta.set(chunkDocCacheKey(docRef), { writeId: null, chunkCount: 0 });
            scheduleChunkPartsCleanup(docRef, null, prevMeta);
            return { writeId: null, dataUrl: payload, chunked: false, chunkCount: 0 };
        }

        const parts = [];
        for (let i = 0; i < payload.length; i += PDF_CLOUD_CHUNK_CHARS) {
            parts.push(payload.slice(i, i + PDF_CLOUD_CHUNK_CHARS));
        }
        const writeId = 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

        // 기존 ready 문서는 읽기 유지. 신규/깨진 문서만 uploading 마킹.
        let hadReady = false;
        let prevWriteId = null;
        let prevChunkCount = 0;
        try {
            const prevSnap = await docRef.get();
            const prev = prevSnap.exists ? (prevSnap.data() || {}) : {};
            prevWriteId = prev.writeId ? String(prev.writeId) : null;
            prevChunkCount = Number(prev.chunkCount) || 0;
            hadReady = prev.chunkStatus === 'ready'
                || (!!prev.dataUrl && String(prev.dataUrl).length > 32)
                || (prev.chunked === true && prev.chunkStatus !== 'failed' && prev.chunkStatus !== 'uploading' && prevChunkCount > 0 && !!prevWriteId);
            if (!hadReady) {
                await enqueueFirestoreWrite(() =>
                    docRef.set({
                        ...base,
                        chunked: true,
                        chunkCount: parts.length,
                        writeId,
                        chunkStatus: 'uploading',
                        dataUrl: firebase.firestore.FieldValue.delete()
                    }, { merge: true })
                );
            }
        } catch (e) {
            console.warn('청크 업로드 상태 마킹 실패:', docRef.path, e);
        }

        try {
            const PARTS_PER_BATCH = 20;
            for (let start = 0; start < parts.length; start += PARTS_PER_BATCH) {
                const end = Math.min(start + PARTS_PER_BATCH, parts.length);
                await enqueueFirestoreWrite(async () => {
                    const batch = db.batch();
                    for (let i = start; i < end; i++) {
                        batch.set(docRef.collection('parts').doc(writeId + '_' + i), {
                            data: parts[i],
                            writeId,
                            index: i
                        });
                    }
                    await batch.commit();
                }, FS_WRITE_PARTS_TIMEOUT_MS);
                if (end < parts.length) await sleep(80);
            }

            await enqueueFirestoreWrite(() =>
                docRef.set({
                    ...base,
                    chunked: true,
                    chunkCount: parts.length,
                    writeId,
                    chunkStatus: 'ready',
                    dataUrl: firebase.firestore.FieldValue.delete()
                }, { merge: true })
            );
            rememberDecodedChunkPayload(docRef, { writeId, chunked: true, chunkCount: parts.length }, payload);
            _lastChunkWriteMeta.set(chunkDocCacheKey(docRef), { writeId, chunkCount: parts.length });
            scheduleChunkPartsCleanup(docRef, writeId, { writeId: prevWriteId, chunkCount: prevChunkCount });
            return { writeId, chunked: true, chunkCount: parts.length };
        } catch (e) {
            // 응답만 늦은 쓰기를 「실패」로 적으면 멀쩡한 층을 다른 기기가 못 읽는다(failed는 읽기 오류로 처리됨)
            if (e && e.code === 'write-timeout') throw e;
            try {
                await enqueueFirestoreWrite(() =>
                    docRef.set({
                        chunkStatus: 'failed',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true })
                );
            } catch (_) { /* ignore */ }
            throw e;
        }
    }

    const _chunkCleanupTimers = new Map();
    function scheduleChunkPartsCleanup(docRef, keepWriteId, prevMeta) {
        const key = (docRef && docRef.path) ? String(docRef.path) : String(docRef);
        const prev = _chunkCleanupTimers.get(key);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(() => {
            _chunkCleanupTimers.delete(key);
            cleanupChunkPartsDeferred(docRef, keepWriteId, prevMeta).catch((e) =>
                console.warn('청크 parts 정리 경고:', docRef.path, e)
            );
        }, 8000);
        _chunkCleanupTimers.set(key, timer);
    }

    async function cleanupChunkPartsDeferred(docRef, keepWriteId, prevMeta) {
        if (!db || !docRef) return;
        if (Date.now() < _fsWritePausedUntil) {
            scheduleChunkPartsCleanup(docRef, keepWriteId, prevMeta);
            return;
        }
        const prevWriteId = prevMeta && prevMeta.writeId ? String(prevMeta.writeId) : '';
        if (!prevWriteId || (keepWriteId && prevWriteId === String(keepWriteId))) return;
        const prevCount = Math.min(Math.max(Number(prevMeta && prevMeta.chunkCount) || 0, 0), 16);
        if (prevCount <= 0) return;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const toDelete = [];
        for (let i = 0; i < prevCount; i++) {
            toDelete.push(docRef.collection('parts').doc(prevWriteId + '_' + i));
        }
        for (let i = 0; i < toDelete.length; i += 40) {
            if (Date.now() < _fsWritePausedUntil) {
                scheduleChunkPartsCleanup(docRef, keepWriteId, {
                    writeId: prevWriteId,
                    chunkCount: prevCount - i
                });
                return;
            }
            const slice = toDelete.slice(i, i + 40);
            await enqueueFirestoreWrite(async () => {
                const batch = db.batch();
                slice.forEach((ref) => batch.delete(ref));
                await batch.commit();
            });
            if (i + 40 < toDelete.length) await sleep(120);
        }
    }

    /** bulk JSON 등 텍스트 청크만 RAM 캐시. 도면 dataURL은 넣지 않는다. */
    const _decodedChunkPayloadCache = new Map();
    let _lastBulkPayloadIdentity = '';
    const _dirtyFloorKeys = new Set();
    /** 오프라인 편집 후 새로고침해도 dirty 층이 살아남도록 회사별로 유지 */
    let _blockRemoteApplyUntilLocalFlush = false;
    function dirtyFloorsStorageKey() {
        const cid = (window.state && window.state.companyId) || '';
        return cid ? (`bsa_dirty_floors_v1_${cid}`) : 'bsa_dirty_floors_v1';
    }
    function offlinePendingFlushKey() {
        const cid = (window.state && window.state.companyId) || '';
        return cid ? (`bsa_offline_pending_flush_v1_${cid}`) : 'bsa_offline_pending_flush_v1';
    }
    // 「업데이트 받기」(js/shared/app-update-button.js)가 새로고침 전에 부른다 — 기기 저장 마무리·못 올린 변경 수
    window.BSA_appUpdateHooks = {
        pendingCount() {
            return _dirtyFloorKeys.size + ((window._defectPhotoSaves && window._defectPhotoSaves.size) || 0) + (_photoDrain ? 1 : 0);
        },
        async flushLocal() {
            const saves = Array.from(window._defectPhotoSaves || []);
            await Promise.all(saves.map((p) => Promise.resolve(p).catch(() => {})));
            if (typeof flushLocalPhotoPersistBeforeUnload === 'function') {
                try { await flushLocalPhotoPersistBeforeUnload(); } catch (_e) { /* ignore */ }
            }
            try { if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage(); } catch (_e) { /* ignore */ }
            try { persistDirtyFloorKeys(); } catch (_e) { /* ignore */ }
        }
    };
    function persistDirtyFloorKeys() {
        try {
            localStorage.setItem(dirtyFloorsStorageKey(), JSON.stringify(Array.from(_dirtyFloorKeys)));
        } catch (_e) { /* ignore quota */ }
    }
    function restoreDirtyFloorKeys() {
        try {
            const raw = localStorage.getItem(dirtyFloorsStorageKey());
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return;
            arr.forEach((k) => { if (k) _dirtyFloorKeys.add(String(k)); });
            // NOTE: 여기서 dirty 집합을 잘라 LS에 다시 쓰지 않는다.
            // (과거 MAX_DIRTY=8 상한이 overflow 층을 dirty에서 영구 제거 → 원격 팩이
            //  로컬 마킹을 덮을 수 있었음). 읽기 폭주 방지는 pickDirtyFloorsForSyncBatch.
        } catch (_e) { /* ignore */ }
    }
    /** 한 번의 sync에서 올릴 층 수. 나머지는 dirty에 남겨 원격 덮어쓰기를 막고 다음 디바운스에서 이어서 올린다. */
    // 2026-11-05 3 → 5: 층별 잠금으로 기기끼리 동시에 올리게 되면서 한 번에 조금 더 올린다
    const SYNC_DIRTY_FLOOR_BATCH_MAX = 5;
    function pickDirtyFloorsForSyncBatch(maxN) {
        const MAX = Math.max(1, maxN || SYNC_DIRTY_FLOOR_BATCH_MAX);
        const keep = new Set();
        const curB = window.state && window.state.currentBuildingId;
        const curF = window.state && window.state.currentFloor;
        if (curB && curF) keep.add(`${curB}_${curF}`);
        if (curB) {
            Array.from(_dirtyFloorKeys).forEach((k) => {
                if (String(k).startsWith(curB + '_') && keep.size < MAX) keep.add(k);
            });
        }
        Array.from(_dirtyFloorKeys).forEach((k) => {
            if (keep.size < MAX) keep.add(k);
        });
        if (_dirtyFloorKeys.size > keep.size) {
            console.info('[sync] dirty batch', keep.size, 'of', _dirtyFloorKeys.size, '(overflow stays protected)');
        }
        return keep;
    }
    function markOfflinePendingFlush() {
        try { localStorage.setItem(offlinePendingFlushKey(), '1'); } catch (_e) { /* ignore */ }
    }
    function clearOfflinePendingFlush() {
        try { localStorage.removeItem(offlinePendingFlushKey()); } catch (_e) { /* ignore */ }
    }
    function hasOfflinePendingFlush() {
        try { return localStorage.getItem(offlinePendingFlushKey()) === '1'; } catch (_e) { return false; }
    }
    function markFloorKeyDirty(key) {
        if (!key) return;
        _dirtyFloorKeys.add(String(key));
        persistDirtyFloorKeys();
    }

    let _legacyBulkCache = null;
    let _legacyBulkCacheTried = false;
    const _floorsCheckedMigration = new Set();
    let currentFloorUnsubs = [];
    let _listeningFloorPath = '';
    let _lastFloorPackIdentity = '';
    let _lastFloorSnapData = {};
    /**
     * _lastFloorSnapData를 실제로 채워 넣은 층의 경로.
     *
     * _listeningFloorPath로 주인을 판단하면 안 된다. 스냅샷 콜백 중간에 await가 있어서,
     * 이전 층의 콜백이 뒤늦게 깨어나 이 캐시를 덮어쓸 때는 _listeningFloorPath가 이미
     * 새 층을 가리킨다. 그러면 "캐시 주인이 맞다"고 잘못 판정해 이전 층 데이터를 새 층에
     * 쓰게 된다 — 2026-09-19 층끼리 결함이 섞인 사고와 같은 결과다.
     * 그래서 데이터와 같은 자리에서 그 데이터의 출처 경로를 같이 적어둔다.
     */
    let _lastFloorSnapPath = '';
    let _lastFloorBundle = { markings: null, photos: null, ndt: null, drawing: null };
    let _floorPackFallbackTried = false;

    function chunkDocCacheKey(docRef) {
        return (docRef && docRef.path) ? String(docRef.path) : '';
    }

    function fingerprintBulkString(s) {
        const str = String(s || '');
        const len = str.length;
        if (!len) return '0';
        // 앞·중간(1/4·1/2·3/4)·뒤 샘플 + 성긴 롤링 해시로 중간만 바뀐 변경도 잡는다.
        const sliceAt = (ratio, half) => {
            const i = Math.min(len - 1, Math.max(0, Math.floor(len * ratio)));
            const a = Math.max(0, i - half);
            const b = Math.min(len, i + half);
            return str.slice(a, b);
        };
        let h = 2166136261;
        const step = Math.max(1, Math.floor(len / 512));
        for (let i = 0; i < len; i += step) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        // 끝 구간도 한 번 더
        for (let i = Math.max(0, len - 64); i < len; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return [
            String(len),
            str.slice(0, 24),
            sliceAt(0.25, 12),
            sliceAt(0.5, 12),
            sliceAt(0.75, 12),
            str.slice(-24),
            (h >>> 0).toString(36)
        ].join(':');
    }

    function bulkPayloadIdentity(data) {
        if (!data) return '';
        if (data.writeId) return 'w:' + String(data.writeId);
        const u = data.dataUrl;
        if (typeof u === 'string' && u.length > 32) {
            return 'u:' + fingerprintBulkString(u);
        }
        const n = Number(data.chunkCount) || 0;
        if (data.chunked && n > 0) {
            // writeId 없이 chunked만 있으면 내용 지문이 없으므로 status+count만으로는 약함.
            // 캐시 히트 방지용으로 약한 키를 쓰되, 스킵 판단에는 writeId/dataUrl을 우선한다.
            return 'c:' + n + ':' + String(data.chunkStatus || '') + ':' + String(data.updatedAt || data.contentUpdatedAt || '');
        }
        return '';
    }

    function rememberDecodedChunkPayload(docRef, data, payload) {
        const key = chunkDocCacheKey(docRef);
        if (!key || payload == null) return;
        const s = String(payload);
        if (s.indexOf('data:') === 0) return;
        _decodedChunkPayloadCache.set(key, {
            writeId: data && data.writeId ? String(data.writeId) : null,
            identity: bulkPayloadIdentity(data),
            payload: s
        });
        while (_decodedChunkPayloadCache.size > 8) {
            const first = _decodedChunkPayloadCache.keys().next().value;
            if (!first || first === key) break;
            _decodedChunkPayloadCache.delete(first);
        }
    }

    function readCachedChunkPayload(docRef, data) {
        const key = chunkDocCacheKey(docRef);
        if (!key) return null;
        const hit = _decodedChunkPayloadCache.get(key);
        if (!hit || !hit.payload) return null;
        const ident = bulkPayloadIdentity(data);
        if (ident && hit.identity === ident) return hit.payload;
        if (data && data.writeId && hit.writeId && String(data.writeId) === hit.writeId) {
            return hit.payload;
        }
        return null;
    }

    async function joinChunkPartsByWriteId(docRef, writeId, chunkCount) {
        if (!docRef || !writeId || !(chunkCount > 0)) return null;
        const snaps = await Promise.all(
            Array.from({ length: chunkCount }, (_, i) =>
                docRef.collection('parts').doc(String(writeId) + '_' + i).get()
            )
        );
        if (snaps.some((s) => !s.exists)) return null;
        const joined = snaps.map((s) => (s.data() && s.data().data) || '').join('');
        return joined.length > 32 ? joined : null;
    }

    /** onSnapshot이 이미 준 문서 본문에서 청크 payload를 복원한다. 부모 get()을 한 번 더 치지 않는다. */
    async function decodeChunkedPayloadFromData(data, docRef, _retried) {
        if (!data) return null;

        const cachedPayload = readCachedChunkPayload(docRef, data);
        if (cachedPayload) return cachedPayload;

        const storageUrl = await resolveCloudAssetUrlFromSnapData(data);
        if (storageUrl) {
            const local = await materializeCloudAssetPayload(storageUrl, data);
            if (local && String(local).indexOf('data:') === 0 && String(local).length > 32) {
                return local;
            }
            // 버킷 CORS 없으면 materialize가 https만 돌려줌 → Worker로 바이트 확보
            // (https를 그대로 img+crossOrigin에 넣으면 도면이 영원히 안 뜸)
            if (/^https?:\/\//i.test(String(storageUrl)) && typeof fetchStorageImageViaProxy === 'function') {
                try {
                    const proxied = await fetchStorageImageViaProxy(storageUrl);
                    if (proxied && String(proxied).indexOf('data:') === 0 && String(proxied).length > 32) {
                        return proxied;
                    }
                } catch (proxyErr) {
                    console.warn('도면/에셋 Storage 프록시 실패:', docRef && docRef.path, proxyErr);
                }
            }
            // data:가 아니면 포기 — 깨진 https를 usable로 취급하지 않음
        }

        if (data.dataUrl && typeof data.dataUrl === 'string' && data.dataUrl.length > 32) {
            rememberDecodedChunkPayload(docRef, data, data.dataUrl);
            return data.dataUrl;
        }

        const status = data.chunkStatus || null;
        if (status === 'uploading' || status === 'failed') {
            return null;
        }

        const chunkCount = Number(data.chunkCount) || 0;
        if (data.chunked && chunkCount > 0) {
            const writeId = data.writeId ? String(data.writeId) : null;
            if (writeId) {
                try {
                    // writeId 지정 get은 필요한 N개만 읽는다. 실패해도 parts 전체 목록/재시도로
                    // 같은 N개를 한 번 더 치지 않는다(상위 fetchBulkSyncDataReliable가 재시도).
                    const targeted = await joinChunkPartsByWriteId(docRef, writeId, chunkCount);
                    if (targeted) {
                        rememberDecodedChunkPayload(docRef, data, targeted);
                        return targeted;
                    }
                } catch (targetedErr) {
                    console.warn('[PDF] writeId 지정 읽기 실패:', docRef && docRef.path, targetedErr);
                }
                if (status !== 'ready') {
                    // 업로드 중이면 불완전한 parts를 재조회하지 않고 상위에 맡긴다.
                    return null;
                }
                console.warn('[PDF] parts 지정 읽기 실패:', docRef.path, writeId, chunkCount);
                return null;
            }
            console.warn('[PDF] chunked 문서에 writeId 없음 — parts 전체 목록은 읽지 않음:', docRef.path);
            return null;
        }
        return null;
    }

    async function readChunkedPdfFromDocRef(docRef, _retried) {
        const snap = await docRef.get();
        if (!snap.exists) return null;
        return decodeChunkedPayloadFromData(snap.data() || {}, docRef, _retried);
    }

    function getBulkSyncDocRef() {
        return db.collection('safety_app').doc(getCompanyDocId()).collection('bulkData').doc('defectsAndNdt');
    }

    function markCurrentFloorDirty() {
        markFloorKeyDirty(currentInspectionFloorKey());
    }

    function collectFloorPhotoUrlMap(defectsArr) {
        const map = {};
        (defectsArr || []).forEach((d) => {
            if (!d) return;
            Object.assign(map, collectPackedPhotoUrlMap(d.photoIds, d.photoUrls, d.photos));
            Object.assign(map, collectPackedPhotoUrlMap(d.prevRoundPhotoIds, d.prevRoundPhotoUrls, d.prevRoundPhotos));
        });
        return map;
    }

    function subsetDefectsMap(defectsMap, keys) {
        const out = {};
        (keys || []).forEach((k) => {
            if (defectsMap && defectsMap[k]) out[k] = defectsMap[k];
        });
        return out;
    }

    async function readFloorKindPayload(bldg, floorCode, kind) {
        const ref = getFloorKindDocRef(bldg, floorCode, kind);
        if (!ref) return null;
        try {
            const json = await readChunkedPdfFromDocRef(ref);
            if (json == null) return null;
            if (!json) return {};
            return JSON.parse(json);
        } catch (e) {
            console.warn('층 문서 조회 실패:', kind, e);
            return null;
        }
    }

    function sliceLegacyBulkForFloor(bulk, floorKey) {
        if (!bulk || !floorKey) return null;
        const defects = bulk.defects && bulk.defects[floorKey];
        const ndt = bulk.ndtData && bulk.ndtData[floorKey];
        const disp = bulk.ndtDisplacementGroups && bulk.ndtDisplacementGroups[floorKey];
        const delDef = bulk.deletedDefectIds && bulk.deletedDefectIds[floorKey];
        const delNdt = bulk.deletedNdtIds && bulk.deletedNdtIds[floorKey];
        if (!defects && !ndt && !disp && !delDef && !delNdt) return null;
        const urlsById = collectFloorPhotoUrlMap(defects || []);
        return {
            markings: {
                items: Array.isArray(defects) ? defects : [],
                deletedIds: Array.isArray(delDef) ? delDef : [],
                deletedAt: (bulk.deletedDefectAt && bulk.deletedDefectAt[floorKey]) || {}
            },
            photos: { urlsById },
            ndt: {
                items: Array.isArray(ndt) ? ndt : [],
                deletedIds: Array.isArray(delNdt) ? delNdt : [],
                deletedAt: (bulk.deletedNdtAt && bulk.deletedNdtAt[floorKey]) || {},
                displacementGroups: Array.isArray(disp) ? disp : []
            }
        };
    }

    async function loadLegacyBulkCacheOnce() {
        if (_legacyBulkCacheTried) return _legacyBulkCache;
        try {
            const json = await readChunkedPdfFromDocRef(getBulkSyncDocRef());
            if (!json) {
                _legacyBulkCacheTried = true;
                _legacyBulkCache = null;
                return null;
            }
            _legacyBulkCache = JSON.parse(json);
            _legacyBulkCacheTried = true;
            return _legacyBulkCache;
        } catch (e) {
            console.warn('구버전 bulk 폴백 조회 실패:', e);
            return undefined;
        }
    }

    function emptyFloorDrawingPayload() {
        return { rasterUrl: '', pdfUrl: '', tiers: {} };
    }

    function collectFloorDrawingUrlPayload(bldg, floorCode) {
        const out = emptyFloorDrawingPayload();
        if (!bldg || !floorCode) return out;
        const raster = bldg.floorDrawings && bldg.floorDrawings[floorCode];
        const pdf = bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[floorCode];
        if (isLightweightCloudPhotoRef(raster)) out.rasterUrl = String(raster).trim();
        if (isLightweightCloudPhotoRef(pdf)) out.pdfUrl = String(pdf).trim();
        const tmap = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (tmap && typeof tmap === 'object') {
            Object.keys(tmap).forEach((dim) => {
                const u = tmap[dim];
                if (isLightweightCloudPhotoRef(u)) out.tiers[String(dim)] = String(u).trim();
            });
        }
        return out;
    }

    function applyFloorDrawingPayload(bldg, floorCode, drawing) {
        if (!bldg || !floorCode || !drawing) return;
        const keepLocal = (cur) => typeof cur === 'string' && cur.indexOf('data:') === 0 && cur.length > 32;
        if (isLightweightCloudPhotoRef(drawing.rasterUrl)) {
            if (!bldg.floorDrawings) bldg.floorDrawings = {};
            if (!keepLocal(bldg.floorDrawings[floorCode])) {
                bldg.floorDrawings[floorCode] = String(drawing.rasterUrl).trim();
            }
        }
        if (isLightweightCloudPhotoRef(drawing.pdfUrl)) {
            if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
            if (!keepLocal(bldg.floorDrawingPdfs[floorCode])) {
                bldg.floorDrawingPdfs[floorCode] = String(drawing.pdfUrl).trim();
            }
        }
        const tiers = drawing.tiers;
        // 2026-11-10 받을 도면이 하나도 없으면 칸을 만들지 않는다. 빈 칸 {}도 층 목록에는 「이 층이 있다」로 읽혀
        // 회차 손글씨 메모 자리(ROUND_SKETCH_MEMO)가 층으로 들어갔다가 「도면 없는 층」으로 빠지기를 반복했다.
        if (tiers && typeof tiers === 'object' && Object.keys(tiers).some((dim) => isLightweightCloudPhotoRef(tiers[dim]))) {
            if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
            if (!bldg.floorDrawingTiers[floorCode] || typeof bldg.floorDrawingTiers[floorCode] !== 'object') {
                bldg.floorDrawingTiers[floorCode] = {};
            }
            Object.keys(tiers).forEach((dim) => {
                const u = tiers[dim];
                if (!isLightweightCloudPhotoRef(u)) return;
                const cur = bldg.floorDrawingTiers[floorCode][dim];
                if (!keepLocal(cur)) bldg.floorDrawingTiers[floorCode][dim] = String(u).trim();
            });
        }
    }

    function emptyFloorBundle() {
        return {
            markings: { items: [], deletedIds: [], deletedAt: {} },
            photos: { urlsById: {} },
            ndt: { items: [], deletedIds: [], deletedAt: {}, displacementGroups: [] },
            drawing: emptyFloorDrawingPayload(),
            memos: null,   // 도면 메모 — 옛 버전이 쓴 층엔 없다(없으면 기기 메모를 그대로 둠)
            sketches: null
        };
    }

    function floorBundleHasContent(bundle) {
        if (!bundle || typeof bundle !== 'object') return false;
        const markings = bundle.markings || {};
        const ndt = bundle.ndt || {};
        const photos = bundle.photos || {};
        const drawing = bundle.drawing || {};
        if (Array.isArray(markings.items) && markings.items.length) return true;
        if (Array.isArray(markings.deletedIds) && markings.deletedIds.length) return true;
        if (Array.isArray(ndt.items) && ndt.items.length) return true;
        if (Array.isArray(ndt.deletedIds) && ndt.deletedIds.length) return true;
        if (Array.isArray(ndt.displacementGroups) && ndt.displacementGroups.length) return true;
        if (ndt.customDrawing && ndt.customDrawing.at) return true;
        if (photos.urlsById && typeof photos.urlsById === 'object'
            && Object.keys(photos.urlsById).some((k) => photos.urlsById[k])) return true;
        if (drawing.rasterUrl || drawing.pdfUrl) return true;
        if (window.BSA && window.BSA.drawingMemo && window.BSA.drawingMemo.packHasContent(bundle.memos)) return true;
        if (window.BSA && window.BSA.sketchMemo && window.BSA.sketchMemo.packHasContent(bundle.sketches)) return true;
        if (window.BSA && window.BSA.guideShapes && window.BSA.guideShapes.packHasContent(bundle.guideShapes)) return true;
        if (window.BSA && window.BSA.structMembers && window.BSA.structMembers.packHasContent(bundle.structMembers)) return true;
        if (drawing.tiers && typeof drawing.tiers === 'object'
            && Object.keys(drawing.tiers).some((k) => drawing.tiers[k])) return true;
        return false;
    }

    function bundleFromPackObject(obj) {
        const empty = emptyFloorBundle();
        if (!obj || typeof obj !== 'object') return empty;
        return {
            markings: obj.markings || empty.markings,
            photos: obj.photos || empty.photos,
            ndt: obj.ndt || empty.ndt,
            drawing: obj.drawing || empty.drawing,
            memos: (obj.memos && typeof obj.memos === 'object') ? obj.memos : null,
            // 2026-10-16 손글씨 메모 + (예전엔 여기서 빠져 서버 값이 병합되지 않던) 평가단위·부재 수·가이드·구조 부재도 넘긴다
            sketches: (obj.sketches && typeof obj.sketches === 'object') ? obj.sketches : null,
            guideShapes: (obj.guideShapes && typeof obj.guideShapes === 'object') ? obj.guideShapes : undefined,
            structMembers: (obj.structMembers && typeof obj.structMembers === 'object') ? obj.structMembers : undefined
        };
    }

    function packHasFloorData(obj) {
        return floorBundleHasContent(bundleFromPackObject(obj));
    }

    async function decodeFloorPackFromSnap(floorRef, snapData) {
        if (!floorRef || !snapData) return null;
        try {
            const json = await decodeChunkedPayloadFromData(snapData, floorRef);
            if (!json) return null;
            const parsed = JSON.parse(json);
            return packHasFloorData(parsed) ? parsed : null;
        } catch (e) {
            console.warn('층 묶음 파싱 실패:', e);
            return null;
        }
    }

    async function readSplitFloorKindDocs(bldg, floorCode, knownMissing) {
        knownMissing = knownMissing || {};
        const [markings, photos, ndt, drawing] = await Promise.all([
            knownMissing.markings ? Promise.resolve(null) : readFloorKindPayload(bldg, floorCode, 'markings'),
            knownMissing.photos ? Promise.resolve(null) : readFloorKindPayload(bldg, floorCode, 'photos'),
            knownMissing.ndt ? Promise.resolve(null) : readFloorKindPayload(bldg, floorCode, 'ndt'),
            knownMissing.drawing ? Promise.resolve(null) : readFloorKindPayload(bldg, floorCode, 'drawing')
        ]);
        if (markings == null && photos == null && ndt == null && drawing == null) return null;
        const empty = emptyFloorBundle();
        const split = {
            fromLegacy: true,
            markings: markings || empty.markings,
            photos: photos || empty.photos,
            ndt: ndt || empty.ndt,
            drawing: drawing || empty.drawing
        };
        return floorBundleHasContent(split) ? split : null;
    }

    async function readFloorSyncBundle(bldg, floorCode, preloadedOrOptions) {
        let preloadedSnapData = null;
        let knownMissing = {};
        if (preloadedOrOptions && typeof preloadedOrOptions === 'object') {
            if (Object.prototype.hasOwnProperty.call(preloadedOrOptions, 'knownMissing')
                || Object.prototype.hasOwnProperty.call(preloadedOrOptions, 'preloadedSnapData')) {
                knownMissing = preloadedOrOptions.knownMissing || {};
                preloadedSnapData = preloadedOrOptions.preloadedSnapData || null;
            } else {
                preloadedSnapData = preloadedOrOptions;
            }
        }
        const floorRef = getFloorScopeRef(bldg, floorCode);
        let parsed = null;
        if (preloadedSnapData) {
            parsed = await decodeFloorPackFromSnap(floorRef, preloadedSnapData);
        } else if (floorRef) {
            try {
                const json = await readChunkedPdfFromDocRef(floorRef);
                if (json) {
                    const obj = JSON.parse(json);
                    if (packHasFloorData(obj)) parsed = obj;
                }
            } catch (e) {
                console.warn('층 묶음 조회 실패:', e);
            }
        }
        if (parsed) return Object.assign({ fromLegacy: false }, bundleFromPackObject(parsed));

        const floorKey = `${bldg && bldg.id}_${floorCode}`;
        if (_floorsCheckedMigration.has(floorKey)) {
            return Object.assign({ fromLegacy: false }, emptyFloorBundle());
        }

        const split = await readSplitFloorKindDocs(bldg, floorCode, knownMissing);
        if (split) {
            _floorsCheckedMigration.add(floorKey);
            return split;
        }

        // 층 묶음·분리 문서가 모두 비었을 때만 구버전 회사 bulk를 1회 연다(세션 캐시).
        // 빈 JSON 묶음을 “데이터 있음”으로 보면 이 폴백이 영구히 막혀 점검이 지워진다.
        const bulk = await loadLegacyBulkCacheOnce();
        if (bulk === undefined) {
            return Object.assign({ fromLegacy: false }, emptyFloorBundle());
        }
        _floorsCheckedMigration.add(floorKey);
        const sliced = sliceLegacyBulkForFloor(bulk, floorKey);
        if (sliced && floorBundleHasContent(sliced)) {
            sliced.drawing = emptyFloorDrawingPayload();
            return Object.assign({ fromLegacy: true }, sliced);
        }
        return Object.assign({ fromLegacy: false }, emptyFloorBundle());
    }

    /**
     * 2026-10-16 동기화용 층 읽기(덮어쓰기 방지). 서버에서만 읽는다(Firestore 캐시의 옛 사본 금지).
     * 읽기 실패·다른 기기가 쓰는 중(chunkStatus uploading/failed)·조각 해독 실패는 **빈 층이 아니라 오류**로 던진다.
     * 호출부는 그 층을 이번에 쓰지 않고 '올릴 것'으로 남겨 다음 동기화에서 다시 한다.
     * 문서가 아예 없을 때만 예전 경로(분할 문서·옛 bulk 이전)를 탄다.
     * 반환: { bundle, rev, exists }
     */
    async function readFloorBundleForSync(bldg, floorCode, preloadedData) {
        const guard = window.BSA && window.BSA.floorSyncGuard;
        const ref = getFloorScopeRef(bldg, floorCode);
        if (!ref || !guard) throw new Error('floor-read: no ref');
        let exists;
        let data;
        if (preloadedData && Object.keys(preloadedData).length) {
            exists = true;
            data = preloadedData;
        } else {
            const snap = await ref.get({ source: 'server' });
            exists = !!snap.exists;
            data = exists ? (snap.data() || {}) : null;
        }
        const kind = guard.classifyFloorSnap(exists, data);
        if (kind === 'missing') {
            const b = await readFloorSyncBundle(bldg, floorCode, { knownMissing: {} });
            return { bundle: b, rev: 0, exists: false };
        }
        if (kind === 'busy') throw new Error('floor-read: busy (' + data.chunkStatus + ')');
        const json = await decodeChunkedPayloadFromData(data, ref);
        if (!json) throw new Error('floor-read: decode failed');
        const obj = JSON.parse(json);
        if (!packHasFloorData(obj)) {
            const b = await readFloorSyncBundle(bldg, floorCode, { knownMissing: {} });
            return { bundle: b, rev: guard.revOf(data), exists: true };
        }
        return { bundle: Object.assign({ fromLegacy: false }, bundleFromPackObject(obj)), rev: guard.revOf(data), exists: true };
    }

    /** 쓰기 직전 서버 층 버전만 확인(서버에서만) */
    async function checkFloorRevOnServer(bldg, floorCode) {
        const guard = window.BSA && window.BSA.floorSyncGuard;
        const ref = getFloorScopeRef(bldg, floorCode);
        const snap = await ref.get({ source: 'server' });
        if (!snap.exists) return { rev: 0, busy: false };
        const data = snap.data() || {};
        return { rev: guard.revOf(data), busy: guard.classifyFloorSnap(true, data) === 'busy' };
    }

    /** 층마다 「일지에 남은 변경 때문에 다시 올림」 횟수(1분 창) — 자동 기록이 만드는 끝없는 다시 올리기 차단 */
    const _journalRedirty = new Map();
    async function writeFloorSyncBundle(bldg, floorCode) {
        if (!bldg || !bldg.id || !floorCode) return;
        const floorRef = getFloorScopeRef(bldg, floorCode);
        if (!floorRef) return;
        const floorKey = `${bldg.id}_${floorCode}`;
        // 2026-10-19 진행률: 이 순번까지의 변경이 이번 묶음에 실린다(이후 고친 것은 다음에)
        const journalSeq = (typeof syncJournal === 'function' && syncJournal()) ? syncJournal().mark() : 0;
        const sanitizedMap = sanitizeDefectsForFirestore({
            [floorKey]: window.state.defects[floorKey] || []
        });
        // 2026-10-21 오프라인 수정 표시는 이 기기 것 — 서버 사본에는 싣지 않는다(올라간 뒤엔 지운 쪽도 본 수정)
        const offlineSent = new Map();
        const items = (sanitizedMap[floorKey] || []).map((d) => {
            if (!d || !(Number(d.offlineEditAt) > 0)) return d;
            offlineSent.set(d.id, Number(d.offlineEditAt));
            const { offlineEditAt, ...rest } = d;
            return rest;
        });
        const pack = {
            markings: {
                items,
                deletedIds: (window.state.deletedDefectIds || {})[floorKey] || [],
                deletedAt: (window.state.deletedDefectAt || {})[floorKey] || {}
            },
            photos: { urlsById: collectFloorPhotoUrlMap(window.state.defects[floorKey] || []) },
            ndt: {
                items: stripCrackMonitorPhotosForCloud(window.state.ndtData[floorKey] || []),
                deletedIds: (window.state.deletedNdtIds || {})[floorKey] || [],
                deletedAt: (window.state.deletedNdtAt || {})[floorKey] || {},
                displacementGroups: (window.state.ndtDisplacementGroups || {})[floorKey] || [],
                // NDT 전용 도면 참조 { id, at } — 그림은 photos(클라우드)에 있다
                customDrawing: ndtDrawingRefFor(floorKey)
            },
            // 이 묶음이 어느 동(건물) 것인지 — 같은 층 칸을 두 동이 나눠 쓰면 읽는 쪽이 남의 것을 버린다(2026-10-20)
            buildingId: bldg.id,
            drawing: collectFloorDrawingUrlPayload(bldg, floorCode),
            // 도면 메모(결함 아님) — 결함처럼 updatedAt·묘비로 합친다
            memos: (window.BSA && window.BSA.drawingMemo) ? window.BSA.drawingMemo.packFor(window.state, floorKey) : undefined,
            // 손글씨 메모(벡터 선) — 텍스트 메모와 같은 규칙
            sketches: (window.BSA && window.BSA.sketchMemo) ? window.BSA.sketchMemo.packFor(window.state, floorKey) : undefined,
            // 도면 가이드(사각형·직선, 화면 전용)
            guideShapes: (window.BSA && window.BSA.guideShapes) ? window.BSA.guideShapes.packFor(window.state, floorKey) : undefined,
            // 구조 부재 레이어(구조도에서 가져온 부재 기호, 화면 전용)
            structMembers: (window.BSA && window.BSA.structMembers) ? window.BSA.structMembers.packFor(window.state, floorKey) : undefined
        };
        if (!floorBundleHasContent(pack)) {
            console.warn('빈 층 묶음은 클라우드에 올리지 않음:', floorKey);
            _dirtyFloorKeys.delete(floorKey);
            return;
        }
        await writeChunkedPdfToDocRef(floorRef, JSON.stringify(pack), {
            syncLease: firebase.firestore.FieldValue.delete(),
            // 2026-10-16 층 버전 — 쓸 때마다 서버가 1 올림(읽은 뒤 바뀌었는지 비교용). updatedAt은 서버 시각으로 이미 기록됨
            syncRev: firebase.firestore.FieldValue.increment(1)
        });
        // 올라갔다 — 이번에 실은 오프라인 수정 표시만 지운다(쓰는 동안 또 고친 것은 남김)
        if (offlineSent.size) {
            (window.state.defects[floorKey] || []).forEach((d) => {
                if (d && offlineSent.has(d.id) && Number(d.offlineEditAt) <= offlineSent.get(d.id)) delete d.offlineEditAt;
            });
        }
        _dirtyFloorKeys.delete(floorKey);
        persistDirtyFloorKeys();
        // 2026-10-19 서버가 층 묶음 저장을 확인했다 → 실린 변경만 「올라감」. 묶음을 만든 뒤 또 고친 것은 남겨 다시 올린다
        if (typeof noteServerDefectIds === 'function') noteServerDefectIds(floorKey, items);
        try {
            const j = typeof syncJournal === 'function' ? syncJournal() : null;
            if (j) {
                const ids = items.map((d) => d && d.id).filter(Boolean)
                    .concat(pack.markings.deletedIds || [])
                    .concat(((pack.ndt && pack.ndt.items) || []).map((x) => x && x.id).filter(Boolean))
                    .concat((pack.ndt && pack.ndt.deletedIds) || []);
                const res = j.confirmFloor(floorKey, journalSeq, ids);
                // 2026-10-20 끝없는 올리기 원인(진행률 표시 50dd772에서 생김): 묶음을 만든 뒤 일지에 새 변경이 남으면 층을 다시
                // 「올릴 것」으로 표시하는데, 동기화·적용 중에 자동으로 기록을 남기는 코드(이전 방식 옮김·자동 위치 등)가 있으면
                // 매 회차 새 기록 → 다시 표시 → 곧바로 전체 동기화(서버 읽기·쓰기)를 끝없이 반복했다.
                // 같은 층을 일지 때문에만 다시 올리는 것은 1분에 2번까지 — 넘으면 다시 표시하지 않고(일지는 그대로 남음 →
                // 다음 사용자 수정·「지금 다시 올리기」 때 함께 올라감) 무엇이 남았는지 기록만 한다.
                if (res && res.remaining) {
                    const now = Date.now();
                    const prev = _journalRedirty.get(floorKey);
                    const n = (prev && now - prev.at < 60000) ? prev.n + 1 : 1;
                    _journalRedirty.set(floorKey, { n, at: prev && now - prev.at < 60000 ? prev.at : now });
                    if (n <= 2) markFloorKeyDirty(floorKey);
                    else if (n === 3) console.warn('[동기화] 올린 뒤에도 일지에 새 변경이 계속 생겨 다시 올리기를 멈춤(1분):', floorKey, res.remainingKeys);
                }
            }
        } catch (_e) { /* 진행률 실패는 동기화에 영향 없음 */ }
    }

    function seedPhotoCacheFromUrlMap(urlsById) {
        if (!urlsById || typeof urlsById !== 'object') return;
        if (!window._photoCache) window._photoCache = {};
        Object.keys(urlsById).forEach((pid) => {
            if (!pid || window._photoCache[pid]) return;
            const url = urlsById[pid];
            if (url) window._photoCache[pid] = url;
        });
    }

    function mergeFloorBundleIntoState(bldg, floorCode, bundle) {
        if (!bldg || !bldg.id || !floorCode || !bundle) return;
        // 다른 동이 쓴 층 묶음이면 손대지 않는다 — 옆 동 도면·마킹이 이 동에 붙던 문제(2026-10-20)
        if (bundle.buildingId && bundle.buildingId !== bldg.id) {
            console.warn('[floor] 다른 동의 층 묶음이라 건너뜀:', bldg.id, floorCode, '←', bundle.buildingId);
            return;
        }
        const floorKey = `${bldg.id}_${floorCode}`;
        const empty = emptyFloorBundle();
        const markings = bundle.markings || empty.markings;
        const ndt = bundle.ndt || empty.ndt;
        if (typeof noteServerDefectIds === 'function') noteServerDefectIds(floorKey, markings.items || []);
        seedPhotoCacheFromUrlMap(bundle.photos && bundle.photos.urlsById);
        if (floorCode !== 'ROUND_SKETCH_MEMO') applyFloorDrawingPayload(bldg, floorCode, bundle.drawing || empty.drawing); // 메모 자리는 층이 아님
        const defectMerge = mergeDefectsMaps(
            { [floorKey]: markings.items || [] },
            window.state.defects || {},
            { [floorKey]: markings.deletedIds || [] },
            window.state.deletedDefectIds || {},
            { [floorKey]: markings.deletedAt || {} },
            window.state.deletedDefectAt || {}
        );
        window.state.defects = defectMerge.defects;
        window.state.deletedDefectIds = defectMerge.deletedDefectIds;
        window.state.deletedDefectAt = defectMerge.deletedDefectAt || {};
        const ndtPrevForPhotos = window.state.ndtData || {};
        const ndtMerge = mergeNdtDataMaps(
            { [floorKey]: ndt.items || [] },
            window.state.ndtData || {},
            { [floorKey]: ndt.deletedIds || [] },
            window.state.deletedNdtIds || {},
            { [floorKey]: ndt.deletedAt || {} },
            window.state.deletedNdtAt || {}
        );
        window.state.ndtData = carryLocalCrackMonitorPhotos(ndtPrevForPhotos, ndtMerge.ndtData);
        window.state.deletedNdtIds = ndtMerge.deletedNdtIds;
        window.state.deletedNdtAt = ndtMerge.deletedNdtAt || {};
        // 삭제 목록을 빈 객체로 넘기면 지운 측정 구역이 서버본으로 되살아난다.
        // 구역 묘비는 NDT 핀과 같은 deletedNdtIds를 쓴다(id 접두가 달라 서로 안 겹침).
        const dispMerge = mergeNdtDataMaps(
            { [floorKey]: ndt.displacementGroups || [] },
            window.state.ndtDisplacementGroups || {},
            { [floorKey]: ndt.deletedIds || [] },
            window.state.deletedNdtIds || {},
            { [floorKey]: ndt.deletedAt || {} },
            window.state.deletedNdtAt || {}
        );
        window.state.ndtDisplacementGroups = dispMerge.ndtData;
        mergeNdtDrawingRef(floorKey, ndt.customDrawing);
        if (bundle.memos && window.BSA && window.BSA.drawingMemo) {
            window.BSA.drawingMemo.mergePackIntoState(window.state, floorKey, bundle.memos, window.BSA.syncMerge.mergeNdtDataMaps);
        }
        if (bundle.sketches && window.BSA && window.BSA.sketchMemo) {
            window.BSA.sketchMemo.mergePackIntoState(window.state, floorKey, bundle.sketches, window.BSA.syncMerge.mergeNdtDataMaps);
        }
        if (bundle.guideShapes && window.BSA && window.BSA.guideShapes) {
            window.BSA.guideShapes.mergePackIntoState(window.state, floorKey, bundle.guideShapes, window.BSA.syncMerge.mergeNdtDataMaps);
            if (floorKey === currentMemoFloorKey()) { syncGuideOverlay(); syncGuideBar(); }
        }
        if (bundle.structMembers && window.BSA && window.BSA.structMembers) {
            window.BSA.structMembers.mergePackIntoState(window.state, floorKey, bundle.structMembers, window.BSA.syncMerge.mergeNdtDataMaps);
            if (floorKey === currentMemoFloorKey()) syncStructLayer();
        }
        resolveOfflineNoConflicts(bldg, floorCode, markings, ndt);
    }

    /**
     * 오프라인 동시 작업으로 겹친 번호를 자동으로 옮기고 알린다 (2026-09-29, js/core/no-conflict.js).
     * 서버 층 문서에 아직 없는 것(이 기기가 오프라인에서 새로 만든 것)만 바꾼다 — 먼저 올린 사람 번호는 그대로.
     */
    function resolveOfflineNoConflicts(bldg, floorCode, markings, ndt) {
        const api = window.BSA && window.BSA.noConflict;
        if (!api || !bldg || !bldg.id) return [];
        const floorKey = `${bldg.id}_${floorCode}`;
        const prefix = `${bldg.id}_`;
        const idsOf = (arr) => new Set((arr || []).filter((r) => r && r.id).map((r) => r.id));
        const othersOf = (map, samePool) => {
            const out = [];
            Object.keys(map || {}).forEach((k) => {
                if (k === floorKey || !k.startsWith(prefix)) return;
                if (samePool && !samePool(k.slice(prefix.length))) return;
                (map[k] || []).forEach((r) => out.push(r));
            });
            return out;
        };
        const now = Date.now();
        const changes = [];
        try {
            // 결함: 번호 공간은 층 하나. 외부(EXT·입면)는 외부 도면 전체가 한 공간(getFloorDefectsForNumbering)
            const isExt = (code) => (typeof isExteriorFloorCode === 'function') && isExteriorFloorCode(code);
            const floorDefects = (window.state.defects || {})[floorKey];
            if (Array.isArray(floorDefects)) {
                const pool = isExt(floorCode) ? othersOf(window.state.defects, isExt) : [];
                api.resolveDefectNoConflicts(floorDefects, pool, idsOf(markings && markings.items), now)
                    .forEach((c) => changes.push(c));
            }
            // 비파괴 항목·구역: 번호 공간은 건물 전체, 분류별
            const floorNdt = (window.state.ndtData || {})[floorKey];
            if (Array.isArray(floorNdt)) {
                api.resolveRecordNoConflicts(floorNdt, othersOf(window.state.ndtData), idsOf(ndt && ndt.items), {
                    field: 'no', kind: 'ndt', now
                }).forEach((c) => changes.push(c));
            }
            const floorGroups = (window.state.ndtDisplacementGroups || {})[floorKey];
            if (Array.isArray(floorGroups)) {
                api.resolveRecordNoConflicts(floorGroups, othersOf(window.state.ndtDisplacementGroups), idsOf(ndt && ndt.displacementGroups), {
                    field: 'groupNo', kind: 'group', now,
                    categoryOf: (g) => (g.category === '부재변위' ? '부재변위' : '변위')
                }).forEach((c) => changes.push(c));
            }
        } catch (e) {
            console.warn('[번호 겹침] 정리 실패(번호는 그대로 둠):', e);
            return [];
        }
        if (!changes.length) return changes;
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        let floorLabel = floorCode;
        try { floorLabel = stripFloorCodeSuffix(window.getFloorLabelFromCode(floorCode)) || floorCode; } catch (_e) { /* 코드 그대로 */ }
        const text = api.describeChanges(changes);
        console.info(`[번호 겹침] ${bldg.name || bldg.id} ${floorLabel}: 다른 기기가 먼저 올린 번호와 겹쳐 옮김 — ${text}`, changes);
        if (typeof window.showToast === 'function') {
            window.showToast(`${floorLabel}: 다른 기기와 번호가 겹쳐 바꿨습니다 — ${text}`, 'warning', 12000);
        }
        return changes;
    }

    async function applyFloorBundleToState(bldg, floorCode, bundle) {
        if (!bldg || !bldg.id || !floorCode || !bundle) return;
        const floorKeyForGuard = `${bldg.id}_${floorCode}`;
        // 오프라인 편집이 아직 서버에 안 올라간 층: 원격 스냅샷이 더 신선한 로컬을 덮지 않게 스킵
        // (flush 경로의 mergeFloorBundleIntoState는 이 함수를 거치지 않음)
        if (_blockRemoteApplyUntilLocalFlush || _dirtyFloorKeys.has(floorKeyForGuard)) {
            return;
        }
        mergeFloorBundleIntoState(bldg, floorCode, bundle);
        await hydrateCurrentBuildingDefectPhotosIntoState();
        if (_syncInFlight) return;
        _suppressSyncOnSave = true;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        _suppressSyncOnSave = false;
        refreshCurrentBuildingFromState();
        if (typeof renderBuildingSelector === 'function') renderBuildingSelector();
        const activeTab = (window.state && window.state.currentTab) || 'tab-home';
        if (activeTab === 'tab-map') {
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        } else if (activeTab === 'tab-survey') {
            if (typeof renderSurveyTable === 'function') renderSurveyTable();
        } else if (activeTab === 'tab-stats') {
            if (typeof window.renderDefectStatsTab === 'function') window.renderDefectStatsTab();
        } else if (activeTab === 'tab-ndt') {
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        }
    }

    async function mergeRemoteFloorBundle(bldg, floorCode, bundle) {
        if (!bldg || !bundle) return;
        await applyFloorBundleToState(bldg, floorCode, bundle);
        if (bundle.fromLegacy && floorBundleHasContent(bundle)) {
            try { await writeFloorSyncBundle(bldg, floorCode); } catch (e) {
                console.warn('구버전 층 이관 쓰기 실패:', e);
            }
        }
    }

    function stopFloorRealtimeListeners() {
        (currentFloorUnsubs || []).forEach((u) => {
            try { u(); } catch (_e) { /* ignore */ }
        });
        currentFloorUnsubs = [];
        _listeningFloorPath = '';
        _lastFloorPackIdentity = '';
        _lastFloorSnapData = {};
        _lastFloorSnapPath = '';
        _lastFloorBundle = { markings: null, photos: null, ndt: null, drawing: null };
        _floorPackFallbackTried = false;
    }

    async function subscribeCurrentFloorSync() {
        if (!db || !window.state.companyId) {
            stopFloorRealtimeListeners();
            return;
        }
        if (window.state.currentTab === 'tab-home') {
            stopFloorRealtimeListeners();
            return;
        }
        const bldg = window.state.currentBuilding
            || (window.state.buildings || []).find((b) => b && b.id === window.state.currentBuildingId);
        const floorCode = window.state.currentFloor;
        const floorRef = getFloorScopeRef(bldg, floorCode);
        if (!floorRef) {
            stopFloorRealtimeListeners();
            return;
        }
        const path = floorRef.path;
        if (_listeningFloorPath === path && currentFloorUnsubs.length) return;

        stopFloorRealtimeListeners();
        _listeningFloorPath = path;

        const onFloorErr = (err) => {
            console.warn('층 실시간 리스너 경고:', err);
            _listenerNeedsResubscribe = true;
        };

        const applyMigratedPack = async (migrated) => {
            if (!migrated || !floorBundleHasContent(migrated)) return;
            _lastFloorBundle = migrated;
            await mergeRemoteFloorBundle(bldg, floorCode, migrated);
        };

        /** 이 구독이 아직 현재 층인가. await 뒤에는 층이 바뀌었을 수 있다. */
        const isStillCurrent = () => _listeningFloorPath === path;

        const unsub = floorRef.onSnapshot(async (doc) => {
            // unsubscribe 직전에 들어와 처리 중이던 콜백은 층을 바꾼 뒤에 깨어날 수 있다.
            // 그 상태로 전역 캐시를 건드리면 새 층이 이전 층 데이터를 자기 것으로 쓴다.
            if (!isStillCurrent()) return;
            if (doc && doc.metadata && doc.metadata.hasPendingWrites) return;
            if (!doc || !doc.exists) {
                if (_floorPackFallbackTried) return;
                _floorPackFallbackTried = true;
                try {
                    await applyMigratedPack(await readFloorSyncBundle(bldg, floorCode));
                } catch (e) {
                    console.warn('층 묶음 폴백 이관 실패:', e);
                }
                return;
            }
            const snapData = doc.data() || {};
            if (isOnlySyncLeaseChange(_lastFloorSnapData, snapData)) {
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                return;
            }
            const status = snapData.chunkStatus || null;
            if (status === 'uploading' || status === 'failed') {
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                return;
            }
            const ident = bulkPayloadIdentity(snapData);
            if (ident && ident === _lastFloorPackIdentity) {
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                return;
            }
            const parsed = await decodeFloorPackFromSnap(floorRef, snapData);
            // 위 await 동안 사용자가 층을 바꿨을 수 있다. 그러면 이 결과는 이전 층 것이다.
            if (!isStillCurrent()) return;
            if (parsed && floorBundleHasContent(parsed)) {
                _lastFloorPackIdentity = ident;
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                const bundle = Object.assign({ fromLegacy: false }, bundleFromPackObject(parsed));
                _lastFloorBundle = bundle;
                await applyFloorBundleToState(bldg, floorCode, bundle);
                return;
            }
            if (_floorPackFallbackTried) {
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                return;
            }
            _floorPackFallbackTried = true;
            try {
                const migrated = await readFloorSyncBundle(bldg, floorCode, snapData);
                _lastFloorSnapData = snapData;
            _lastFloorSnapPath = path;
                if (ident) _lastFloorPackIdentity = ident;
                await applyMigratedPack(migrated);
            } catch (e) {
                console.warn('층 묶음 폴백 이관 실패:', e);
            }
        }, onFloorErr);
        currentFloorUnsubs.push(unsub);
        pullExteriorPeerFloorsInBackground(bldg, floorCode);
    }
    window.subscribeCurrentFloorSync = subscribeCurrentFloorSync;

    /**
     * 다른 외부 면 층 묶음에서 **결함만** 합친다(refreshExteriorPeerFloorsFromServer 전용, 2026-11-09).
     * 번호 공간만 채우면 된다 — 도면·비파괴·메모는 그 면을 열 때 실시간 동기화가 받는다.
     * 반환: 합쳤으면 true
     */
    function mergeFloorDefectsOnlyIntoState(bldg, floorCode, bundle) {
        if (!bldg || !bldg.id || !floorCode || !bundle) return false;
        if (bundle.buildingId && bundle.buildingId !== bldg.id) return false;   // 다른 동이 쓴 층 묶음
        const floorKey = `${bldg.id}_${floorCode}`;
        const markings = bundle.markings || emptyFloorBundle().markings;
        if (typeof noteServerDefectIds === 'function') noteServerDefectIds(floorKey, markings.items || []);
        seedPhotoCacheFromUrlMap(bundle.photos && bundle.photos.urlsById);
        const defectMerge = mergeDefectsMaps(
            { [floorKey]: markings.items || [] },
            window.state.defects || {},
            { [floorKey]: markings.deletedIds || [] },
            window.state.deletedDefectIds || {},
            { [floorKey]: markings.deletedAt || {} },
            window.state.deletedDefectAt || {}
        );
        window.state.defects = defectMerge.defects;
        window.state.deletedDefectIds = defectMerge.deletedDefectIds;
        window.state.deletedDefectAt = defectMerge.deletedDefectAt || {};
        return true;
    }

    /**
     * 외부 면들을 받은 뒤: 이 기기가 새로 만들어 아직 서버에 없는 결함이 다른 외부 면 번호와 겹치면 옮긴다.
     * 서버에 있다고 확인된 결함(먼저 올린 사람 것)은 그대로. 서버 확인을 아직 못 한 면은 건너뛴다(전부 새 것으로 보면 안 됨).
     * codes: 지금 면 + 다른 외부 면. 반환: 바뀐 목록(js/core/no-conflict.js 모양)
     */
    function resolveExteriorDefectNoConflicts(bldg, codes, isExt) {
        const api = window.BSA && window.BSA.noConflict;
        if (!api || !bldg || !bldg.id || typeof serverDefectIdsOfFloor !== 'function') return [];
        const prefix = `${bldg.id}_`;
        const now = Date.now();
        const all = [];
        try {
            (codes || []).forEach((code) => {
                const floorKey = prefix + code;
                const serverIds = serverDefectIdsOfFloor(floorKey);
                const floorDefects = (window.state.defects || {})[floorKey];
                if (!serverIds || !Array.isArray(floorDefects) || !floorDefects.length) return;
                const pool = [];
                Object.keys(window.state.defects || {}).forEach((k) => {
                    if (k === floorKey || !k.startsWith(prefix) || !isExt(k.slice(prefix.length))) return;
                    (window.state.defects[k] || []).forEach((d) => pool.push(d));
                });
                // 수정창에 열려 있는 결함은 옮기지 않는다(창의 옛 번호로 다시 저장된다) — 번호만 「쓰는 중」으로 친다
                const openId = (elements && elements.defectModal && elements.defectModal.classList.contains('open'))
                    ? (document.getElementById('defectPinId')?.value || '') : '';
                const movable = floorDefects.filter((d) => {
                    if (!openId || !d || String(d.id) !== String(openId)) return true;
                    pool.push(d);
                    return false;
                });
                const changes = api.resolveDefectNoConflicts(movable, pool, serverIds, now);
                if (!changes.length) return;
                if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
                changes.forEach((c) => all.push(Object.assign({ floorCode: code }, c)));
            });
        } catch (e) {
            console.warn('[외부 번호] 겹침 정리 실패(번호는 그대로 둠):', e);
            return [];
        }
        if (all.length) {
            const text = api.describeChanges(all);
            console.info(`[외부 번호] ${bldg.name || bldg.id}: 다른 외부 면에 먼저 올라온 번호와 겹쳐 옮김 — ${text}`, all);
            if (typeof window.showToast === 'function') {
                window.showToast(`외부: 다른 면에 먼저 올라온 번호와 겹쳐 바꿨습니다 — ${text}`, 'warning', 12000);
            }
        }
        return all;
    }

    /** 외부 면에서 새 결함 창을 열 때 — 그사이 다른 사람이 다른 외부 면에 올린 번호까지 보고 매긴다(5초에 한 번) */
    const EXTERIOR_PEERS_ON_NEW_MS = 5000;
    let _exteriorPeersOnNewAt = 0;
    function pullExteriorPeersForNewDefect() {
        const floorCode = window.state.currentFloor;
        const bldg = window.state.currentBuilding
            || (window.state.buildings || []).find((b) => b && b.id === window.state.currentBuildingId);
        if (!bldg || !floorCode || typeof isExteriorFloorCode !== 'function' || !isExteriorFloorCode(floorCode)) return;
        const now = Date.now();
        if (now - _exteriorPeersOnNewAt < EXTERIOR_PEERS_ON_NEW_MS) return;
        _exteriorPeersOnNewAt = now;
        pullExteriorPeerFloorsInBackground(bldg, floorCode, { force: true });
    }
    window.pullExteriorPeersForNewDefect = pullExteriorPeersForNewDefect;

    /** 외부 면을 열면 나머지 외부 면을 받아 번호 공간을 채운다(refreshExteriorPeerFloorsFromServer, 2026-11-09). */
    function pullExteriorPeerFloorsInBackground(bldg, floorCode, opts) {
        if (typeof refreshExteriorPeerFloorsFromServer !== 'function' || !bldg || !floorCode) return;
        const bldgId = bldg.id;
        refreshExteriorPeerFloorsFromServer(bldg, floorCode, opts).then((res) => {
            if (!res || !res.merged) return;
            if (window.state.currentBuildingId !== bldgId) return;
            refreshNewDefectAutoNo();
            const activeTab = (window.state && window.state.currentTab) || '';
            if (activeTab === 'tab-map') {
                if (typeof drawCanvas === 'function') drawCanvas();
                if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            } else if (activeTab === 'tab-survey') {
                if (typeof renderSurveyTable === 'function') renderSurveyTable();
            }
        }).catch((e) => console.warn('[외부 번호] 다른 외부 면 받기 실패:', e));
    }

    /** 새 결함 창이 열려 있고 번호를 자동으로 채운 그대로면, 받아 온 외부 면까지 보고 다시 매긴다. */
    function refreshNewDefectAutoNo() {
        const noEl = document.getElementById('defectNo');
        if (!noEl || !noEl.dataset.autoNo || noEl.value !== noEl.dataset.autoNo) return;
        if (!(elements && elements.defectModal && elements.defectModal.classList.contains('open'))) return;
        if (document.getElementById('defectPinId')?.value) return;
        if (typeof getActiveMarkingGroup === 'function') {
            const grp = getActiveMarkingGroup();
            if (grp && grp.groupId) return;
        }
        const key = `${window.state.currentBuildingId}_${window.state.currentFloor}`;
        const next = getNextDefectNoStr(getFloorDefectsForNumbering(key));
        if (next === noEl.value) return;
        noEl.value = next;
        noEl.dataset.autoNo = next;
        if (typeof drawCanvas === 'function') drawCanvas();
    }

    /* ------------------------------------------------------------------
     * 일괄 작업 전 자동 백업 (1단계: 조사표 가져오기)
     * 순수 비교·복원 규칙은 js/core/data-health.js. 여기선 IndexedDB 저장과
     * 조사표 화면·콘솔 API만 연결한다.
     * ------------------------------------------------------------------ */
    function bulkSnapshotApi() {
        return (window.BSA && window.BSA.dataHealth) || null;
    }

    let _bulkSnapStore = null;
    function getBulkSnapshotStore() {
        const health = bulkSnapshotApi();
        if (!health || typeof health.createIdbSnapshotStore !== 'function') return null;
        if (!_bulkSnapStore) {
            try { _bulkSnapStore = health.createIdbSnapshotStore(); }
            catch (e) {
                console.warn('[일괄 백업] 저장소를 열지 못했습니다.', e);
                return null;
            }
        }
        return _bulkSnapStore;
    }

    function currentBulkFloorKey() {
        if (!state.currentBuildingId || !state.currentFloor) return '';
        return `${state.currentBuildingId}_${state.currentFloor}`;
    }

    function cloneAtMapLocal(map) {
        const out = {};
        if (!map || typeof map !== 'object') return out;
        Object.keys(map).forEach((k) => { out[k] = map[k]; });
        return out;
    }

    function readBulkFloorSlice(floorKey) {
        if (typeof ensureSyncMetaState === 'function') ensureSyncMetaState();
        return {
            defects: (state.defects[floorKey] || []).slice(),
            ndtData: ((state.ndtData && state.ndtData[floorKey]) || []).slice(),
            ndtDisplacementGroups: ((state.ndtDisplacementGroups && state.ndtDisplacementGroups[floorKey]) || []).slice(),
            deletedDefectIds: ((state.deletedDefectIds && state.deletedDefectIds[floorKey]) || []).slice(),
            deletedDefectAt: cloneAtMapLocal(state.deletedDefectAt && state.deletedDefectAt[floorKey]),
            deletedNdtIds: ((state.deletedNdtIds && state.deletedNdtIds[floorKey]) || []).slice(),
            deletedNdtAt: cloneAtMapLocal(state.deletedNdtAt && state.deletedNdtAt[floorKey])
        };
    }

    function writeBulkFloorSlice(floorKey, slice) {
        if (typeof ensureSyncMetaState === 'function') ensureSyncMetaState();
        state.defects[floorKey] = slice.defects || [];
        if (!state.ndtData) state.ndtData = {};
        state.ndtData[floorKey] = slice.ndtData || [];
        if (!state.ndtDisplacementGroups) state.ndtDisplacementGroups = {};
        state.ndtDisplacementGroups[floorKey] = slice.ndtDisplacementGroups || [];
        if (slice.deletedDefectIds && slice.deletedDefectIds.length) {
            state.deletedDefectIds[floorKey] = slice.deletedDefectIds;
        } else if (state.deletedDefectIds) {
            delete state.deletedDefectIds[floorKey];
        }
        if (slice.deletedDefectAt && Object.keys(slice.deletedDefectAt).length) {
            state.deletedDefectAt[floorKey] = slice.deletedDefectAt;
        } else if (state.deletedDefectAt) {
            delete state.deletedDefectAt[floorKey];
        }
        if (slice.deletedNdtIds && slice.deletedNdtIds.length) {
            state.deletedNdtIds[floorKey] = slice.deletedNdtIds;
        } else if (state.deletedNdtIds) {
            delete state.deletedNdtIds[floorKey];
        }
        if (slice.deletedNdtAt && Object.keys(slice.deletedNdtAt).length) {
            state.deletedNdtAt[floorKey] = slice.deletedNdtAt;
        } else if (state.deletedNdtAt) {
            delete state.deletedNdtAt[floorKey];
        }
    }

    function escapeBulkRestoreHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function summarizeDefectForRestore(d) {
        if (!d) return '(없음)';
        const bits = [d.no || d.id, d.component, d.defectType, d.cause, d.size, d.crackWidth, d.crackLength]
            .map((v) => String(v || '').trim())
            .filter(Boolean);
        return bits.join(' / ') || '(내용 없음)';
    }

    function formatBulkSnapTime(ts) {
        try {
            return new Date(ts).toLocaleString('ko-KR');
        } catch (_e) {
            return String(ts || '');
        }
    }

    /**
     * 작업 이름 + 층 키 목록만 넘기면 그 층 데이터를 기기에 저장한다.
     * 실패해도 본 작업은 막지 않는다. 함수 선언이라 이 콜백 안의 앞선 코드에서도 호출된다.
     */
    async function snapshotBeforeBulkOp(opName, floorKeys) {
        if (typeof window.captureBulkSnapshots !== 'function') return [];
        try {
            return await window.captureBulkSnapshots(opName, floorKeys);
        } catch (e) {
            console.warn('[일괄 백업] ' + (opName || '일괄 작업') + ' 전 저장 실패 — 작업은 계속합니다.', e);
            if (typeof window.showToast === 'function') {
                window.showToast('작업 전 자동 백업에 실패했습니다. 작업은 그대로 진행합니다.', 'warning', 6000);
            }
            return [];
        }
    }

    /**
     * 작업 직후 상태를 그 작업의 백업에 붙인다. 되살리기가 "이 작업이 바꾼 행"만 고르는 기준이다.
     * 상태 복사는 **호출 즉시**(동기) 하고, 저장만 뒤에서 한다 — 호출한 쪽이 기다리지 않아도
     * 그 순간의 상태가 기록된다. 실패해도 본 작업에는 영향 없음.
     */
    function recordAfterBulkOp(savedSnaps) {
        const list = Array.isArray(savedSnaps) ? savedSnaps.filter((s) => s && s.floorKey) : [];
        if (!list.length) return Promise.resolve();
        const health = bulkSnapshotApi();
        const store = getBulkSnapshotStore();
        if (!health || !store || typeof health.buildAfterState !== 'function') return Promise.resolve();
        const now = Date.now();
        list.forEach((snap) => { snap.after = health.buildAfterState(window.state, snap.floorKey, now); });
        let chain = Promise.resolve();
        list.forEach((snap) => { chain = chain.then(() => store.put(snap)); });
        return chain.catch((e) => {
            console.warn('[일괄 백업] 작업 직후 기록 실패 — 되살리기 자동 선택이 꺼집니다.', e);
        });
    }

    /**
     * 작업 이름 + 층 키 목록만 넘기면 그 층 데이터를 기기에 저장한다.
     * 조사표 가져오기·층 도면 삭제·일괄 수정·CAD 가져오기·비파괴 중복 정리가 이걸 탄다.
     */
    window.captureBulkSnapshots = async function (opName, floorKeys) {
        const health = bulkSnapshotApi();
        const store = getBulkSnapshotStore();
        if (!health || !store || typeof health.saveSnapshotsWithStore !== 'function') {
            console.warn('[일괄 백업] 모듈을 불러오지 못해 저장하지 않았습니다.');
            return [];
        }
        const keys = Array.isArray(floorKeys) ? floorKeys.filter(Boolean) : [];
        if (!keys.length) return [];
        const saved = await health.saveSnapshotsWithStore(window.state, opName, keys, store, Date.now());
        console.log('[일괄 백업] ' + (opName || '일괄 작업') + ' — '
            + saved.map((s) => (s.floorCode || s.floorKey) + ' ' + s.defectCount + '건').join(', '));
        if (typeof window.refreshSurveyBulkRestoreButton === 'function') {
            window.refreshSurveyBulkRestoreButton();
        }
        return saved;
    };

    window.listBulkSnapshots = async function (floorCode) {
        const store = getBulkSnapshotStore();
        if (!store) {
            console.warn('일괄 백업 저장소를 열지 못했습니다.');
            return [];
        }
        let rows = await store.getAll();
        const code = String(floorCode || '').trim();
        if (code) {
            const id = window.state.currentBuildingId;
            const key = id ? `${id}_${code}` : '';
            rows = rows.filter((s) => s && (s.floorCode === code || s.floorKey === key));
        }
        rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        console.table(rows.map((s) => ({
            id: s.id,
            작업: s.opName,
            층: s.floorCode,
            시각: formatBulkSnapTime(s.createdAt),
            결함: s.defectCount,
            비파괴: s.ndtCount
        })));
        if (!rows.length) console.log('저장된 백업이 없습니다.');
        return rows;
    };

    function previewBulkSnapshotDiff(snap) {
        const health = bulkSnapshotApi();
        if (!health || !snap) return null;
        const cur = (window.state.defects && window.state.defects[snap.floorKey]) || [];
        return health.compareDefects(snap.defects, cur);
    }

    window.previewBulkSnapshot = async function (snapshotId) {
        const store = getBulkSnapshotStore();
        const health = bulkSnapshotApi();
        if (!store || !health) {
            console.warn('일괄 백업 모듈을 불러오지 못했습니다.');
            return null;
        }
        const snap = await store.get(snapshotId);
        if (!snap) {
            console.warn('백업을 찾지 못했습니다: ' + snapshotId);
            return null;
        }
        const diff = previewBulkSnapshotDiff(snap);
        const sel = bulkRestoreSelectionFor(snap);
        const selected = sel.selected;
        console.log('[일괄 백업 미리보기] ' + snap.opName + ' / ' + snap.floorCode
            + ' (' + formatBulkSnapTime(snap.createdAt) + ')'
            + (sel.hasAfter ? '' : ' — 작업 직후 기록이 없는 옛 백업이라 자동 선택을 하지 않습니다.'));
        console.table((diff.changed || []).concat(diff.deletedAfter || []).map((r) => ({
            id: r.id,
            번호: (r.snapshot && r.snapshot.no) || (r.current && r.current.no) || '',
            구분: bulkRestoreRowLabel(r, sel),
            기본선택: selected.indexOf(r.id) >= 0 ? '예' : '',
            지금: summarizeDefectForRestore(r.current),
            백업: summarizeDefectForRestore(r.snapshot)
        })));
        if (diff.addedAfter && diff.addedAfter.length) {
            console.log('스냅샷 이후 새로 생긴 결함 ' + diff.addedAfter.length
                + '건은 되살리기에서 지우지 않습니다: '
                + diff.addedAfter.map((r) => r.current && (r.current.no || r.id)).join(', '));
        }
        return { snapshot: snap, diff: diff, ids: selected };
    };

    window.restoreBulkSnapshot = async function (snapshotId, opts) {
        const options = opts || {};
        const store = getBulkSnapshotStore();
        const health = bulkSnapshotApi();
        if (!store || !health) {
            console.warn('일괄 백업 모듈을 불러오지 못했습니다.');
            return null;
        }
        const snap = await store.get(snapshotId);
        if (!snap) {
            console.warn('백업을 찾지 못했습니다: ' + snapshotId);
            return null;
        }
        const diff = previewBulkSnapshotDiff(snap);
        const ids = Array.isArray(options.ids) ? options.ids.filter(Boolean) : bulkRestoreSelectionFor(snap).selected;
        if (!options.apply) {
            console.log('[일괄 백업] 미리보기 — 대상 ' + ids.length + '건. 적용하려면 { apply: true }');
            return { preview: true, snapshot: snap, diff: diff, ids: ids };
        }
        if (!ids.length) {
            window.showToast('되살릴 행이 없습니다.', 'warning');
            return { preview: false, restoredIds: [] };
        }
        // 되살리기 중복 실행 방지(백업을 기다리는 사이 버튼을 또 누르면 두 번 돌 수 있음)
        if (_bulkRestoreInFlight) {
            window.showToast('되살리기를 진행하고 있습니다. 잠시만 기다려 주세요.', 'info', 2500);
            return null;
        }
        _bulkRestoreInFlight = true;
        try {
        let restoreSnaps = [];
        try {
            restoreSnaps = await window.captureBulkSnapshots('되살리기', [snap.floorKey]);
        } catch (e) {
            console.warn('[일괄 백업] 되살리기 전 저장 실패 — 되살리기는 계속합니다.', e);
        }
        const slice = readBulkFloorSlice(snap.floorKey);
        const result = health.applyRestoreToFloor(slice, snap, {
            ids: ids,
            now: Date.now(),
            restoreNdt: options.restoreNdt === true,
            ndtIds: options.ndtIds
        });
        writeBulkFloorSlice(snap.floorKey, slice);
        (result.restored || []).forEach((d) => {
            if (typeof touchDefectUpdatedAt === 'function') touchDefectUpdatedAt(d);
            if (typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(d);
        });
        (result.restoredIds || []).forEach((id) => untrackDefectDeletion(snap.floorKey, id));
        (result.restoredNdtIds || []).forEach((id) => untrackNdtDeletion(snap.floorKey, id));
        markFloorKeyDirty(snap.floorKey);
        saveStateToLocalStorage();
        // 되살리기도 일괄 작업 — 직후 상태를 붙여야 "되살리기를 되돌릴 때" 이 되살리기가 바꾼 행만 고른다
        recordAfterBulkOp(restoreSnaps);
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof window.refreshSurveyBulkRestoreButton === 'function') {
            window.refreshSurveyBulkRestoreButton();
        }
        const n = (result.restoredIds || []).length;
        window.showToast(snap.floorCode + '에서 ' + n + '건을 백업 내용으로 되살렸습니다. 동기화 대상에 넣었습니다.', 'success', 6000);
        console.log('[일괄 백업] 되살리기 적용 ' + n + '건', result.restoredIds);
        return result;
        } finally {
            _bulkRestoreInFlight = false;
        }
    };

    let _bulkRestoreInFlight = false;

    /** 되살리기 기본 선택 — 그 작업이 바꾼 행 중 이후 아무도 안 건드린 행만 (data-health 규칙) */
    function bulkRestoreSelectionFor(snap) {
        const health = bulkSnapshotApi();
        const cur = (window.state.defects && snap && window.state.defects[snap.floorKey]) || [];
        if (!health || typeof health.restoreSelection !== 'function' || !snap) {
            return { hasAfter: false, selected: [], opTouched: [], editedAfterOp: [], unrelated: [] };
        }
        return health.restoreSelection(snap, cur);
    }

    function bulkRestoreRowLabel(r, sel) {
        const id = r && r.id;
        const deleted = r && r.kind === 'deleted';
        if (sel && sel.selected.indexOf(id) >= 0) return deleted ? '작업이 지움' : '작업이 바꿈';
        if (sel && sel.editedAfterOp.indexOf(id) >= 0) return '작업 뒤 다시 고침(확인)';
        return deleted ? '작업과 무관하게 이후 삭제' : '작업과 무관하게 이후 변경';
    }

    function ensureBulkRestoreModal() {
        if (document.getElementById('bulkRestoreModal')) return;
        const wrap = document.createElement('div');
        wrap.id = 'bulkRestoreModal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-card bulk-restore-card">
                <div class="modal-header">
                    <h3>일괄 작업 전으로 되살리기</h3>
                    <button type="button" class="modal-close" id="btnCloseBulkRestoreModal" title="닫기">&times;</button>
                </div>
                <div class="modal-body">
                    <p id="bulkRestoreMeta" class="bulk-restore-meta"></p>
                    <div class="bulk-restore-table-wrap">
                        <table class="bulk-restore-table">
                            <thead>
                                <tr>
                                    <th><input type="checkbox" id="bulkRestoreCheckAll" title="바뀐 행·삭제된 행 모두 선택"></th>
                                    <th>번호</th>
                                    <th>구분</th>
                                    <th>지금</th>
                                    <th>백업</th>
                                </tr>
                            </thead>
                            <tbody id="bulkRestoreTableBody"></tbody>
                        </table>
                    </div>
                    <p class="bulk-restore-note">스냅샷 이후 새로 생긴 결함은 지우지 않습니다. 고른 행만 백업 내용으로 덮습니다.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" id="btnBulkRestoreCancel">취소</button>
                    <button type="button" class="btn btn-primary" id="btnBulkRestoreApply">선택한 행 되살리기</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const close = () => wrap.classList.remove('open');
        document.getElementById('btnCloseBulkRestoreModal').addEventListener('click', close);
        document.getElementById('btnBulkRestoreCancel').addEventListener('click', close);
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        document.getElementById('bulkRestoreCheckAll').addEventListener('change', (e) => {
            wrap.querySelectorAll('.bulk-restore-row-check').forEach((cb) => {
                cb.checked = e.target.checked;
            });
        });
        document.getElementById('btnBulkRestoreApply').addEventListener('click', async () => {
            const snapId = wrap.getAttribute('data-snapshot-id');
            const ids = Array.from(wrap.querySelectorAll('.bulk-restore-row-check:checked'))
                .map((cb) => cb.value)
                .filter(Boolean);
            if (!ids.length) {
                window.showToast('되살릴 행을 선택해 주세요.', 'warning');
                return;
            }
            const ok = await window.appConfirm('선택한 ' + ids.length + '건을 백업 내용으로 되돌립니다. 계속할까요?');
            if (!ok) return;
            close();
            await window.restoreBulkSnapshot(snapId, { ids: ids, apply: true });
        });
    }

    async function openBulkRestorePreviewForCurrentFloor() {
        const health = bulkSnapshotApi();
        const store = getBulkSnapshotStore();
        const floorKey = currentBulkFloorKey();
        if (!health || !store || !floorKey) {
            window.showToast('이 층의 백업을 열 수 없습니다.', 'warning');
            return;
        }
        const snaps = (await store.listByFloor(floorKey)).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        if (!snaps.length) {
            window.showToast('이 층에 저장된 가져오기 전 백업이 없습니다.', 'warning');
            return;
        }
        const snap = snaps[0];
        const diff = health.compareDefects(snap.defects, (state.defects[floorKey] || []));
        // 기본 선택은 "그 작업이 바꾼 행 중 이후 아무도 안 건드린 행"만.
        // 작업 뒤 정상적으로 고치거나 지운 행까지 되돌리지 않게 한다(2026-09-21 검토).
        const sel = bulkRestoreSelectionFor(snap);
        const selected = new Set(sel.selected);
        ensureBulkRestoreModal();
        const modal = document.getElementById('bulkRestoreModal');
        modal.setAttribute('data-snapshot-id', snap.id);
        const meta = document.getElementById('bulkRestoreMeta');
        meta.textContent = snap.opName + ' · ' + snap.floorCode + ' · ' + formatBulkSnapTime(snap.createdAt)
            + (snaps.length > 1 ? ' (이 층 백업 ' + snaps.length + '개 중 가장 최근)' : '')
            + (sel.hasAfter
                ? ''
                : ' — 작업 직후 기록이 없는 옛 백업이라 자동으로 고르지 않았습니다. 되살릴 행을 직접 골라 주세요.');
        const rows = (diff.changed || []).concat(diff.deletedAfter || []);
        const added = diff.addedAfter || [];
        const body = document.getElementById('bulkRestoreTableBody');
        const rowHtml = rows.map((r) => {
            const no = (r.snapshot && r.snapshot.no) || (r.current && r.current.no) || r.id;
            const kind = bulkRestoreRowLabel(r, sel);
            const checked = selected.has(r.id) ? ' checked' : '';
            return `<tr>
                <td><input type="checkbox" class="bulk-restore-row-check" value="${escapeBulkRestoreHtml(r.id)}"${checked}></td>
                <td>${escapeBulkRestoreHtml(no)}</td>
                <td>${kind}</td>
                <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.current))}</td>
                <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.snapshot))}</td>
            </tr>`;
        }).join('');
        const addedHtml = added.map((r) => {
            const no = (r.current && r.current.no) || r.id;
            return `<tr class="bulk-restore-added">
                <td></td>
                <td>${escapeBulkRestoreHtml(no)}</td>
                <td>이후 추가(유지)</td>
                <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.current))}</td>
                <td>—</td>
            </tr>`;
        }).join('');
        body.innerHTML = rowHtml || addedHtml
            ? (rowHtml + addedHtml)
            : '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:#64748b;">백업과 지금이 같습니다. 되살릴 변경이 없습니다.</td></tr>';
        const checkAll = document.getElementById('bulkRestoreCheckAll');
        const boxes = modal.querySelectorAll('.bulk-restore-row-check');
        checkAll.checked = boxes.length > 0 && Array.from(boxes).every((cb) => cb.checked);
        modal.classList.add('open');
    }

    function ensureSurveyRestoreButton() {
        const actions = document.querySelector('#tab-survey .section-header .actions');
        if (!actions) return null;
        let btn = document.getElementById('btnRestoreBulkSnapshot');
        if (btn) return btn;
        btn = document.createElement('button');
        btn.id = 'btnRestoreBulkSnapshot';
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-sm';
        btn.style.cssText = 'border-color:#b45309;color:#b45309;display:none;';
        btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> 일괄 작업 전으로 되살리기';
        btn.title = '이 층의 최근 일괄 작업 직전 백업과 비교해 고른 행만 되살립니다';
        btn.addEventListener('click', () => { openBulkRestorePreviewForCurrentFloor(); });
        const importBtn = document.getElementById('btnImportDefectExcel');
        if (importBtn && importBtn.parentNode === actions) {
            actions.insertBefore(btn, importBtn);
        } else {
            actions.appendChild(btn);
        }
        return btn;
    }

    window.refreshSurveyBulkRestoreButton = async function () {
        const btn = ensureSurveyRestoreButton();
        if (!btn) return;
        const floorKey = currentBulkFloorKey();
        const store = getBulkSnapshotStore();
        if (!floorKey || !store) {
            btn.style.display = 'none';
            return;
        }
        try {
            const snaps = await store.listByFloor(floorKey);
            if (snaps && snaps.length) {
                btn.style.display = '';
                const latest = snaps.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
                const op = (latest && latest.opName) ? String(latest.opName) : '일괄 작업';
                btn.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> ' + op + ' 전으로 되살리기';
                btn.title = '이 층 백업 ' + snaps.length + '개 · 가장 최근(' + op + ')과 비교합니다';
            } else {
                btn.style.display = 'none';
            }
        } catch (e) {
            btn.style.display = 'none';
        }
    };

