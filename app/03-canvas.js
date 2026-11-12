// @@app-part 03-canvas.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 8. DRAWING CANVAS ENGINE (PAN/ZOOM/ROTATE & PINS) ---

    function setupCanvas() {
        state.canvas = elements.planCanvas;
        if (!state.canvas) return;
        state.ctx = state.canvas.getContext('2d');
        resizeCanvas();
    }

    /** 화면 선명도용 DPR — 업로드/서버 용량과 무관. GPU·메모리 한도 내로 캡 */
    function getSafeCanvasDpr(cssW, cssH) {
        const raw = window.devicePixelRatio || 1;
        const perfCap = (window.BSA && window.BSA.performance && typeof window.BSA.performance.getMaxCanvasDpr === 'function')
            ? window.BSA.performance.getMaxCanvasDpr()
            : 2.5;
        let dpr = Math.min(Math.max(raw, 1), perfCap);
        const maxSide = 4096; // 대부분 모바일 GPU 안전권
        const maxPixels = 8 * 1024 * 1024;
        let bw = cssW * dpr;
        let bh = cssH * dpr;
        if (bw > maxSide || bh > maxSide) {
            dpr *= maxSide / Math.max(bw, bh);
            bw = cssW * dpr;
            bh = cssH * dpr;
        }
        if (bw * bh > maxPixels) {
            dpr *= Math.sqrt(maxPixels / (bw * bh));
        }
        return Math.max(1, Math.min(dpr, perfCap));
    }

    function resizeCanvas() {
        const container = elements.canvasContainer || document.getElementById('canvasContainer');
        const canvas = state.canvas || document.getElementById('planCanvas');
        if (!canvas) return;

        const prevFit = getMapFitScale();
        const prevScale = state.view.scale || 1;
        const prevZoomVsFit = prevFit > 0 ? prevScale / prevFit : 1;
        const preserveZoom = !!(state.bgImage && prevZoomVsFit > 1.05);
        const oldScale = prevScale;
        const oldOffX = state.view.offsetX;
        const oldOffY = state.view.offsetY;
        const oldCw = state.canvasCssW || canvas.clientWidth || 800;
        const oldCh = state.canvasCssH || canvas.clientHeight || 600;
        const focalX = oldCw / 2;
        const focalY = oldCh / 2;
        const imgX = (focalX - oldOffX) / Math.max(oldScale, 0.001);
        const imgY = (focalY - oldOffY) / Math.max(oldScale, 0.001);

        let cssW = container ? (container.clientWidth || container.offsetWidth) : 0;
        let cssH = container ? (container.clientHeight || container.offsetHeight) : 0;

        if (cssW <= 50) cssW = Math.max(200, window.innerWidth - 24);
        if (cssH <= 50) {
            cssH = Math.max(280, Math.floor(window.innerHeight * 0.62));
        }

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
        state.canvasDpr = dpr;
        state.canvasCssW = cssW;
        state.canvasCssH = cssH;
        if (!state.ctx) state.ctx = canvas.getContext('2d');

        if (preserveZoom) {
            const lim = getMapViewScaleLimits();
            const fit = getMapFitScale();
            const newScale = Math.min(Math.max(fit * prevZoomVsFit, lim.min), lim.max);
            const newCw = cssW;
            const newCh = cssH;
            const newFocalX = newCw / 2;
            const newFocalY = newCh / 2;
            state.view.scale = newScale;
            state.view.offsetX = newFocalX - imgX * newScale;
            state.view.offsetY = newFocalY - imgY * newScale;
            if (elements.zoomScaleText) {
                elements.zoomScaleText.textContent = formatMapZoomLabel();
            }
            scheduleFloorDrawingTierSync();
        }

        drawCanvas();
    }

    function getMapZoomVsFitPercent() {
        const fit = getMapFitScale();
        const scale = Math.max(state.view.scale || 1, 0.001);
        return Math.round((scale / Math.max(fit, 0.001)) * 100);
    }

    function getMapZoomVsFit() {
        const fit = Math.max(getMapFitScale(), 0.05);
        return Math.max(state.view.scale || 1, 0.001) / fit;
    }

    function pickFloorDrawingTierDimForCurrentView() {
        const zoomVsFit = getMapZoomVsFit();
        const mobile = isMobileDrawingContext();
        let dim = 4000;
        if (typeof window.getFloorDrawingTierDimForZoomVsFit === 'function') {
            dim = window.getFloorDrawingTierDimForZoomVsFit(zoomVsFit, {
                currentTier: floorDrawingActiveTierDim,
                mobile
            });
        }
        return Math.min(Number(dim) || 4000, getMaxDisplayDrawingTierDim());
    }

    /** 모바일·PC 공통 — 확대 구간 3단 → 4000/8000/16000px */
    function getMobileZoomTierDim(activeTier) {
        return pickFloorDrawingTierDimForCurrentView();
    }

    function updateMapZoomOverlay() {
        const el = elements.mapZoomOverlay || document.getElementById('mapZoomOverlay');
        if (!el) return;
        const onMap = (state.currentTab === 'tab-map');
        const mobile = isMobileDrawingContext();
        if (!onMap || !mobile) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'block';
        const pct = getMapZoomVsFitPercent();
        const bldg = state.currentBuilding;
        const fc = state.currentFloor;
        const tierDim = pickFloorDrawingTierDimForCurrentView();
        const active = Number(floorDrawingActiveTierDim) || 4000;
        const label = (typeof window.getFloorDrawingTierLabel === 'function')
            ? window.getFloorDrawingTierLabel(tierDim)
            : `${tierDim}px`;
        const fetchingKey = (bldg && fc) ? `${bldg.id}_${fc}_${tierDim}` : '';
        const fetching = fetchingKey && _floorTierCloudFetchInFlight.has(fetchingKey);
        const pendingUpgrade = Number(tierDim) > active && !fetching;
        let text = `${pct}% · ${label}`;
        if (fetching) text = `${pct}% · ${label} 받는중`;
        else if (pendingUpgrade) text = `${pct}% · ${label} 적용중`;
        el.textContent = text;
        if (Number(tierDim) > 4000 || fetching) el.classList.add('is-hd');
        else el.classList.remove('is-hd');
    }

    function fitToScreen() {
        if (!state.canvas) return;
        const cw = state.canvasCssW || state.canvas.width;
        const ch = state.canvasCssH || state.canvas.height;

        const dims = getFloorPlanDisplayDims();
        const isRotated = (state.rotationAngle === 90 || state.rotationAngle === 270);
        const drawW = isRotated ? dims.h : dims.w;
        const drawH = isRotated ? dims.w : dims.h;

        state.view.scale = getMapFitScale();
        state.view.offsetX = Math.max(20, (cw - drawW * state.view.scale) / 2);
        state.view.offsetY = Math.max(20, (ch - drawH * state.view.scale) / 2);
        
        if (elements.zoomScaleText) {
            elements.zoomScaleText.textContent = formatMapZoomLabel();
        }
        scheduleFloorDrawingTierSync();
    }

    function applyFocalZoom(view, focalX, focalY, zoomFactor, minScale, maxScale, fitScaleFn) {
        if (minScale === undefined || maxScale === undefined) {
            const lim = getViewScaleLimits(fitScaleFn || getMapFitScale);
            if (minScale === undefined) minScale = lim.min;
            if (maxScale === undefined) maxScale = lim.max;
        }
        const oldScale = view.scale;
        const newScale = Math.min(Math.max(minScale, oldScale * zoomFactor), maxScale);
        if (Math.abs(newScale - oldScale) < 1e-6) return newScale;

        const imgX = (focalX - view.offsetX) / oldScale;
        const imgY = (focalY - view.offsetY) / oldScale;
        view.scale = newScale;
        view.offsetX = focalX - imgX * newScale;
        view.offsetY = focalY - imgY * newScale;
        return newScale;
    }

    function cacheFloorDrawingTierToDevice(bldg, floorCode, tierDim, dataUrl) {
        if (!bldg || !floorCode || !dataUrl || !tierDim) return;
        if (typeof dataUrl === 'string' && /^https?:\/\//i.test(dataUrl)) return;
        if (isDrawingReplaceGuarded(bldg, floorCode)) {
            // 교체 직후: 메모리에 이미 새 티어가 있으면 클라우드/옛 IDB 값으로 덮지 않음
            const dimKeyEarly = String(tierDim);
            const existing = bldg.floorDrawingTiers
                && bldg.floorDrawingTiers[floorCode]
                && bldg.floorDrawingTiers[floorCode][dimKeyEarly];
            if (isUsableRasterDrawingUrl(existing) || isUsableRasterDrawingUrl(bldg.floorDrawings && bldg.floorDrawings[floorCode])) {
                return;
            }
        }
        const dimKey = String(tierDim);
        if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
        if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
        bldg.floorDrawingTiers[floorCode][dimKey] = dataUrl;
        const idbKey = `${bldg.id}_${floorCode}`;
        const baseTier = (typeof window.getFloorDrawingBaseTierDim === 'function')
            ? window.getFloorDrawingBaseTierDim()
            : 2000;
        if (Number(tierDim) <= baseTier) {
            if (!bldg.floorDrawings) bldg.floorDrawings = {};
            const curRaster = bldg.floorDrawings[floorCode];
            // 로컬 dataURL 새 도면을 옛 티어로 덮지 않음
            if (!(isUsableRasterDrawingUrl(curRaster)
                && String(curRaster).startsWith('data:')
                && String(dataUrl) !== String(curRaster)
                && isDrawingReplaceGuarded(bldg, floorCode))) {
                bldg.floorDrawings[floorCode] = dataUrl;
            }
            if (!_idbPersistedDrawingKeys.has(idbKey) && !_idbPendingDrawingKeys.has(idbKey)) {
                _idbPendingDrawingKeys.add(idbKey);
                idbSet('floorDrawings', idbKey, dataUrl).then((ok) => {
                    _idbPendingDrawingKeys.delete(idbKey);
                    if (ok) _idbPersistedDrawingKeys.add(idbKey);
                });
            }
        }
        _idbPersistedTierKeys.delete(`${bldg.id}_${floorCode}`);
        const tierKey = floorDrawingTierIdbKey(bldg.id, floorCode, dimKey);
        if (!_idbPersistedTierKeys.has(tierKey) && !_idbPendingTierKeys.has(tierKey)) {
            _idbPendingTierKeys.add(tierKey);
            idbSet('floorDrawingTiers', tierKey, dataUrl).then((ok) => {
                _idbPendingTierKeys.delete(tierKey);
                if (ok) _idbPersistedTierKeys.add(tierKey);
            });
        }
        // 다른 티어(8000/16000)는 RAM에 유지 — 병행 hydrate·줌 LOD가 서로 지우면 모바일에서 고해상도 전환이 실패함
    }

    function cacheFloorDrawingSourceToDevice(bldg, floorCode, sourceDataUrl) {
        if (!bldg || !floorCode || !sourceDataUrl) return;
        if (!bldg.floorDrawingSources) bldg.floorDrawingSources = {};
        bldg.floorDrawingSources[floorCode] = sourceDataUrl;
        const idbKey = `${bldg.id}_${floorCode}`;
        _idbPersistedSourceKeys.delete(idbKey);
        idbSet('floorDrawingSources', idbKey, sourceDataUrl).then((ok) => {
            if (ok) _idbPersistedSourceKeys.add(idbKey);
        });
    }

    async function getFloorDrawingSourceDataUrl(bldg, floorCode) {
        if (!bldg || !floorCode) return null;
        if (bldg.floorDrawingSources && bldg.floorDrawingSources[floorCode]) {
            return bldg.floorDrawingSources[floorCode];
        }
        const cached = await idbGet('floorDrawingSources', `${bldg.id}_${floorCode}`);
        if (cached) {
            if (!bldg.floorDrawingSources) bldg.floorDrawingSources = {};
            bldg.floorDrawingSources[floorCode] = cached;
            _idbPersistedSourceKeys.add(`${bldg.id}_${floorCode}`);
            return cached;
        }
        return null;
    }

    /** PNG/JPEG 고해상도 LOD — source → 티어 → floorDrawings 순으로 가장 큰 원본 선택 */
    async function getBestRasterSourceDataUrl(bldg, floorCode) {
        const direct = await getFloorDrawingSourceDataUrl(bldg, floorCode);
        if (direct) return direct;
        const memTiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (memTiers && typeof memTiers === 'object') {
            for (const d of [16000, 8000, 4000, 2000]) {
                if (memTiers[String(d)]) return memTiers[String(d)];
            }
        }
        const t4000 = await idbGetFloorDrawingTier(bldg.id, floorCode, 4000);
        if (t4000) return t4000;
        return (bldg.floorDrawings && bldg.floorDrawings[floorCode]) || null;
    }

    function getImageLongSide(img) {
        if (!img) return 0;
        return Math.max(img.naturalWidth || img.width || 0, img.naturalHeight || img.height || 0);
    }

    function applyTierImageIfSharper(img, wantDim, fc, bldg, loadToken) {
        if (!img || loadToken !== floorDrawingTierLoadToken) return false;
        if (state.currentFloor !== fc || state.currentBuildingId !== bldg.id) return false;
        const baseTier = (typeof window.getFloorDrawingBaseTierDim === 'function')
            ? window.getFloorDrawingBaseTierDim()
            : 4000;
        const newLong = getImageLongSide(img);
        const curLong = getImageLongSide(state.bgImage);
        // 2026-10-31 확대용 티어는 지금 도면을 키운 같은 그림이라 가로세로 비율이 같아야 한다.
        // 비율이 다르면 옛 도면(같은 이름 파일의 캐시·옛 티어)이라 화면에 붙이지 않는다 — 확대·축소할 때마다
        // 새 도면과 옛 도면이 번갈아 나오고 비율이 틀어지던 문제.
        if (wantDim > baseTier && state.bgImage) {
            const nw = img.naturalWidth || img.width || 0;
            const nh = img.naturalHeight || img.height || 0;
            const cw = state.bgImage.naturalWidth || state.bgImage.width || 0;
            const ch = state.bgImage.naturalHeight || state.bgImage.height || 0;
            if (nw > 0 && nh > 0 && cw > 0 && ch > 0) {
                const ratioGap = Math.abs((nw / nh) / (cw / ch) - 1);
                if (ratioGap > 0.04) {
                    console.warn('도면 티어 비율이 현재 도면과 달라 적용하지 않음(옛 도면 캐시 의심):', fc, wantDim, `${nw}x${nh}`, `${cw}x${ch}`);
                    return false;
                }
            }
        }
        // 요청 티어보다 확연히 작으면(잘못된 fallback) 적용하지 않음
        if (wantDim > baseTier && newLong > 0 && newLong < wantDim * 0.72) {
            return false;
        }
        if (wantDim > baseTier && newLong > 0 && curLong > 0 && newLong <= curLong * 1.04) {
            // 이미 동급 이상이면 active만 맞추고 재시도 루프 종료
            floorDrawingActiveTierDim = wantDim;
            updateMapZoomOverlay();
            return true;
        }
        if (!state.floorDrawingTierImageCache) state.floorDrawingTierImageCache = {};
        state.floorDrawingTierImageCache[`${bldg.id}_${fc}_${wantDim}`] = img;
        const useImmediate = isMobileDrawingContext();
        applyFloorDrawingTarget(img, undefined, { immediate: useImmediate });
        floorDrawingActiveTierDim = wantDim;
        updateMapZoomOverlay();
        pruneFloorDrawingDecodedCache(bldg.id, fc, wantDim);
        // 현재+하위기(4000)만 RAM 유지 — 상위 티어는 IDB/클라우드에서 다시 읽음
        releaseHeavyDrawingMemory(bldg, { keepFloor: fc, keepDim: wantDim });
        const ndtKey = `${state.currentBuildingId}_${fc}`;
        if (ndtBgImage && !currentNdtCustomDrawingSrc(ndtKey)) {
            ndtBgImage = img;
            drawNdtCanvas();
        }
        return true;
    }

    async function clearFloorDrawingTierCacheForFloor(bldgId, floorCode, includeSource = false) {
        if (!bldgId || !floorCode) return;
        const prefix = `${bldgId}_${floorCode}_`;
        if (typeof window.invalidatePdfPageCache === 'function') {
            window.invalidatePdfPageCache(`${bldgId}_${floorCode}`);
        }
        if (state.floorDrawingTierImageCache) {
            Object.keys(state.floorDrawingTierImageCache).forEach((k) => {
                if (k.startsWith(prefix)) delete state.floorDrawingTierImageCache[k];
            });
        }
        if (state.floorImageCache) {
            delete state.floorImageCache[`${bldgId}_${floorCode}`];
        }
        _idbPersistedTierKeys.delete(`${bldgId}_${floorCode}`);
        const deletes = [];
        (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
            const tierKey = floorDrawingTierIdbKey(bldgId, floorCode, d);
            _idbPersistedTierKeys.delete(tierKey);
            deletes.push(Promise.resolve(idbDelete('floorDrawingTiers', tierKey)));
        });
        deletes.push(Promise.resolve(idbDelete('floorDrawingTiers', `${bldgId}_${floorCode}`)));
        if (includeSource) {
            _idbPersistedSourceKeys.delete(`${bldgId}_${floorCode}`);
            deletes.push(Promise.resolve(idbDelete('floorDrawingSources', `${bldgId}_${floorCode}`)));
        }
        await Promise.all(deletes.map((p) => p.catch(() => {})));
    }

    /** 도면 교체 직전: 메모리·IDB·클라우드 옛 티어/레스터를 비워 새 파일이 보이게 한다. */
    const FLOOR_DRAWING_APPLIED_KEY = 'bsa_floor_drawing_applied_at';

    function readFloorDrawingAppliedMap() {
        try {
            const raw = localStorage.getItem(FLOOR_DRAWING_APPLIED_KEY);
            const obj = raw ? JSON.parse(raw) : {};
            return obj && typeof obj === 'object' ? obj : {};
        } catch (_e) {
            return {};
        }
    }

    function floorDrawingAppliedAt(bldgId, floorCode) {
        if (!bldgId || !floorCode) return 0;
        return Number(readFloorDrawingAppliedMap()[`${bldgId}_${floorCode}`]) || 0;
    }

    function markFloorDrawingApplied(bldgId, floorCode, ts) {
        if (!bldgId || !floorCode) return;
        const map = readFloorDrawingAppliedMap();
        map[`${bldgId}_${floorCode}`] = Number(ts) || Date.now();
        try { localStorage.setItem(FLOOR_DRAWING_APPLIED_KEY, JSON.stringify(map)); } catch (_e) { /* ignore */ }
    }

    function floorPdfUpdatedAtOf(bldg, floorCode) {
        return Number(bldg && bldg.floorPdfUpdatedAt && bldg.floorPdfUpdatedAt[floorCode]) || 0;
    }

    /** 서버에 더 나중에 올린 도면이 있으면 이 기기의 옛 PDF·그림은 쓰지 않는다. */
    function floorDrawingRefreshDue(bldg, floorCode) {
        if (!bldg || !bldg.id || !floorCode) return false;
        const stamp = floorPdfUpdatedAtOf(bldg, floorCode);
        if (!stamp) return false;
        return stamp > floorDrawingAppliedAt(bldg.id, floorCode);
    }

    /** 이 기기에서 도면을 다시 넣었다. 다른 기기는 이 시각을 보고 옛 PDF를 버린다. */
    function stampFloorDrawingUpdated(bldg, floorCode) {
        if (!bldg || !floorCode) return 0;
        const now = Date.now();
        // 2026-10-20 고흥군립남부도서관 외부: 건물 수정창 저장은 시작할 때 잡은 건물 객체(bldg)를 들고 도면을 차례로 올리는데,
        // 그 사이 동기화가 state.buildings를 새 병합 객체로 바꾸면 시각이 버려진 옛 객체에만 찍혔다 →
        // 클라우드 시각이 그대로라 다른 기기(폰)가 옛 도면을 계속 썼다. 지금 살아 있는 같은 건물 객체에도 찍는다.
        const targets = new Set([bldg]);
        const live = (window.state.buildings || []).find((b) => b && b.id === bldg.id);
        if (live) targets.add(live);
        if (state.currentBuilding && state.currentBuilding.id === bldg.id) targets.add(state.currentBuilding);
        targets.forEach((b) => {
            b.floorPdfUpdatedAt = Object.assign({}, b.floorPdfUpdatedAt, { [floorCode]: now });
            markBuildingMetaDirty(b);
        });
        markFloorDrawingApplied(bldg.id, floorCode, now);
        return now;
    }

    async function invalidateFloorDrawingBeforeReplace(bldg, floorCode) {
        if (!bldg || !bldg.id || !floorCode) return;
        const bldgId = bldg.id;
        const floorKey = `${bldgId}_${floorCode}`;
        // 교체 세대: 진행 중이던 클라우드/IDB 티어 fetch가 새 도면을 덮지 못하게 함
        if (!bldg._drawingEpoch) bldg._drawingEpoch = {};
        bldg._drawingEpoch[floorCode] = (bldg._drawingEpoch[floorCode] || 0) + 1;
        bldg._drawingReplaceGuard = bldg._drawingReplaceGuard || {};
        bldg._drawingReplaceGuard[floorCode] = Date.now() + 120000;
        (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
            const ck = `${bldgId}_${floorCode}_${d}`;
            if (typeof _floorTierCloudFetchPromises !== 'undefined' && _floorTierCloudFetchPromises) {
                _floorTierCloudFetchPromises.delete(ck);
            }
            if (typeof _floorTierCloudFetchInFlight !== 'undefined' && _floorTierCloudFetchInFlight) {
                _floorTierCloudFetchInFlight.delete(ck);
            }
            if (typeof _floorTierPrefetchInFlight !== 'undefined' && _floorTierPrefetchInFlight) {
                _floorTierPrefetchInFlight.delete(ck);
            }
        });
        if (bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode]) {
            delete bldg.floorDrawingTiers[floorCode];
        }
        if (bldg.floorDrawings && Object.prototype.hasOwnProperty.call(bldg.floorDrawings, floorCode)) {
            delete bldg.floorDrawings[floorCode];
        }
        if (bldg.floorDrawingSources && bldg.floorDrawingSources[floorCode]) {
            delete bldg.floorDrawingSources[floorCode];
        }
        clearLocalDrawingPersistFlags(bldgId, floorCode);
        if (window._cloudSyncedDrawingKeys) window._cloudSyncedDrawingKeys.delete(floorKey);
        if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.delete(floorKey);
        if (window._cloudSyncedTierKeys) {
            (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
                window._cloudSyncedTierKeys.delete(`${bldgId}_${floorCode}_${d}`);
            });
        }
        if (state.currentBuildingId === bldgId && state.currentFloor === floorCode) {
            if (typeof cancelFloorDrawingBlend === 'function') cancelFloorDrawingBlend();
            state.bgImage = null;
            state.floorDrawingHiPatch = null;
            if (typeof clearFloorDrawingHiPatch === 'function') clearFloorDrawingHiPatch(true);
        }
        await clearFloorDrawingTierCacheForFloor(bldgId, floorCode, true);
        await Promise.all([
            Promise.resolve(idbDelete('floorDrawings', floorKey)).catch(() => {}),
            Promise.resolve(idbDelete('floorDrawingPdfs', floorKey)).catch(() => {}),
            (typeof deleteFloorDrawingTiersFromCloud === 'function'
                ? deleteFloorDrawingTiersFromCloud(bldgId, floorCode)
                : Promise.resolve()).catch(() => {})
        ]);
    }
    window.invalidateFloorDrawingBeforeReplace = invalidateFloorDrawingBeforeReplace;

    /**
     * 층 도면을 PDF 없는 그림(JPG 등)으로 바꾸면 옛 PDF를 모든 곳에서 버린다 (감사 O-05, 2026-09-28).
     * 옛 PDF가 남으면 핀 좌표 기준(floorPlanRef)을 옛 PDF 크기로 잡아 그 층 핀이 전부 어긋났다.
     * 다른 기기에도 옛 PDF가 남아 있으므로 건물 정보에 층별 "PDF 뺀 시각"(floorPdfRemovedAt)을 남겨
     * 동기화하고, 각 기기는 그 표시를 보면 자기 PDF를 버린다(pdf-vector-bridge isFloorPdfRemoved).
     */
    function isFloorPdfRemovedHere(bldg, floorCode) {
        return typeof window.isFloorPdfRemoved === 'function' && window.isFloorPdfRemoved(bldg, floorCode);
    }

    function forgetLocalFloorPdf(bldg, floorCode) {
        const key = `${bldg.id}_${floorCode}`;
        if (bldg.floorDrawingPdfs) delete bldg.floorDrawingPdfs[floorCode];
        _idbPersistedPdfKeys.delete(key);
        if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.delete(key);
        return Promise.resolve(idbDelete('floorDrawingPdfs', key)).catch(() => {});
    }

    /** 표시가 있는 층이면 이 기기의 옛 PDF를 (세션당 한 번) 버리고 true */
    function dropRemovedFloorPdf(bldg, floorCode) {
        if (!bldg || !floorCode || !isFloorPdfRemovedHere(bldg, floorCode)) return false;
        const key = `${bldg.id}_${floorCode}`;
        if (!_droppedRemovedPdfKeys.has(key) || (bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[floorCode])) {
            _droppedRemovedPdfKeys.add(key);
            forgetLocalFloorPdf(bldg, floorCode);
        }
        return true;
    }

    async function markFloorPdfRemoved(bldg, floorCode) {
        await forgetLocalFloorPdf(bldg, floorCode);
        bldg.floorPdfRemovedAt = Object.assign({}, bldg.floorPdfRemovedAt, { [floorCode]: Date.now() });
        markBuildingMetaDirty(bldg);
        await deleteFloorDrawingPdfFromCloud(bldg.id, floorCode);
    }

    /** 그 층에 다시 PDF를 넣으면 표시를 푼다 (0으로 — 빈 값은 병합에서 원격 값에 밀린다) */
    function clearFloorPdfRemoved(bldg, floorCode) {
        if (!isFloorPdfRemovedHere(bldg, floorCode)) return;
        bldg.floorPdfRemovedAt = Object.assign({}, bldg.floorPdfRemovedAt, { [floorCode]: 0 });
        _droppedRemovedPdfKeys.delete(`${bldg.id}_${floorCode}`);
        markBuildingMetaDirty(bldg);
    }

    function isDrawingReplaceGuarded(bldg, floorCode) {
        if (!bldg || !floorCode) return false;
        const until = bldg._drawingReplaceGuard && bldg._drawingReplaceGuard[floorCode];
        return !!(until && Date.now() < until);
    }

    function bumpDrawingEpoch(bldg, floorCode) {
        if (!bldg || !floorCode) return 0;
        if (!bldg._drawingEpoch) bldg._drawingEpoch = {};
        bldg._drawingEpoch[floorCode] = (bldg._drawingEpoch[floorCode] || 0) + 1;
        return bldg._drawingEpoch[floorCode];
    }


    function prefetchFloorDrawingTiersForFloor(bldg, floorCode, dims) {
        if (!bldg || !floorCode || !Array.isArray(dims)) return;
        dims.forEach((dim) => {
            const prefetchKey = `${bldg.id}_${floorCode}_${dim}`;
            if (_floorTierPrefetchInFlight.has(prefetchKey)) return;
            const tiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
            if (tiers && tiers[String(dim)]) return;
            _floorTierPrefetchInFlight.add(prefetchKey);
            resolveFloorDrawingTierDataUrl(bldg, floorCode, dim).finally(() => {
                _floorTierPrefetchInFlight.delete(prefetchKey);
            });
        });
    }

    function scheduleFloorDrawingTierPrefetch(bldg, floorCode) {
        if (!bldg || !floorCode) return;
        const dims = [8000];
        try {
            const mobile = isMobileDrawingContext();
            const hiPrefetchThreshold = mobile ? 10.0 : 1.6;
            if (getMapZoomVsFit() >= hiPrefetchThreshold) dims.push(16000);
        } catch (_) { /* zoom optional */ }
        prefetchFloorDrawingTiersForFloor(bldg, floorCode, dims);
    }

    /** 모바일 WebView는 큰 data: URL Image 로드가 자주 실패 → Blob URL로 우회 */
    function dataUrlToObjectUrl(dataUrl) {
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
        const comma = dataUrl.indexOf(',');
        if (comma < 0) return null;
        const header = dataUrl.slice(0, comma);
        const body = dataUrl.slice(comma + 1);
        const mimeMatch = /^data:([^;,]+)/i.exec(header);
        const mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
        try {
            let bytes;
            if (/;base64/i.test(header)) {
                const bin = atob(body);
                bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            } else {
                bytes = new TextEncoder().encode(decodeURIComponent(body));
            }
            return URL.createObjectURL(new Blob([bytes], { type: mime }));
        } catch (e) {
            console.warn('도면 dataURL→Blob 변환 실패:', e);
            return null;
        }
    }

    function loadRasterImageElement(dataUrl) {
        return new Promise((resolve, reject) => {
            if (!dataUrl) {
                reject(new Error('empty-image'));
                return;
            }
            const img = new Image();
            if (typeof dataUrl === 'string' && /^https?:\/\//i.test(dataUrl)) {
                img.crossOrigin = 'anonymous';
            }
            const preferBlob = isMobileDrawingContext();
            let objectUrl = null;
            const cleanup = () => {
                if (objectUrl) {
                    try { URL.revokeObjectURL(objectUrl); } catch (_) { /* ignore */ }
                    objectUrl = null;
                }
            };
            img.onload = () => {
                // 디코드 완료 후 Blob URL 해제 (즉시 revoke 시 일부 WebView에서 깨짐)
                if (objectUrl) {
                    const toRevoke = objectUrl;
                    objectUrl = null;
                    setTimeout(() => {
                        try { URL.revokeObjectURL(toRevoke); } catch (_) { /* ignore */ }
                    }, 60000);
                }
                resolve(img);
            };
            img.onerror = () => {
                cleanup();
                reject(new Error('image-load-failed'));
            };
            if (preferBlob && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                objectUrl = dataUrlToObjectUrl(dataUrl);
                if (objectUrl) {
                    img.src = objectUrl;
                    return;
                }
            }
            img.src = dataUrl;
        });
    }

    async function resolveFloorDrawingTierDataUrl(bldg, floorCode, tierDim) {
        if (!bldg || !floorCode || !tierDim) return null;
        const dimKey = String(tierDim);
        const baseTier = (typeof window.getFloorDrawingBaseTierDim === 'function')
            ? window.getFloorDrawingBaseTierDim()
            : 2000;
        // PC·모바일 공통: 화면 LOD는 서버/로컬 레스터만. PDF 렌더는 최초 등록·벡터 출력만.
        const tiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (tiers && tiers[dimKey]) return tiers[dimKey];

        const idbOne = await idbGetFloorDrawingTier(bldg.id, floorCode, tierDim);
        if (idbOne) {
            if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
            if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
            bldg.floorDrawingTiers[floorCode][dimKey] = idbOne;
            _idbPersistedTierKeys.add(floorDrawingTierIdbKey(bldg.id, floorCode, tierDim));
            return idbOne;
        }

        if (Number(tierDim) <= baseTier && bldg.floorDrawings && bldg.floorDrawings[floorCode]
            && isUsableRasterDrawingUrl(bldg.floorDrawings[floorCode])) {
            return bldg.floorDrawings[floorCode];
        }

        if (typeof fetchAndCacheCloudFloorDrawingTier === 'function' && navigator.onLine !== false) {
            const cloudTier = await fetchAndCacheCloudFloorDrawingTier(bldg, floorCode, tierDim);
            if (cloudTier) return cloudTier;
        }

        // 오프라인·서버 미스: IDB에만 있는 고해상도 티어 재조회
        if (Number(tierDim) > baseTier) {
            const idbRetry = await idbGetFloorDrawingTier(bldg.id, floorCode, tierDim);
            if (idbRetry) {
                if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
                if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
                bldg.floorDrawingTiers[floorCode][dimKey] = idbRetry;
                _idbPersistedTierKeys.add(floorDrawingTierIdbKey(bldg.id, floorCode, tierDim));
                return idbRetry;
            }
        }

        const sourceUrl = await getBestRasterSourceDataUrl(bldg, floorCode);
        if (sourceUrl && typeof window.resizeDataUrlToMaxDim === 'function') {
            try {
                const resized = await window.resizeDataUrlToMaxDim(sourceUrl, tierDim);
                if (resized && resized !== sourceUrl) {
                    cacheFloorDrawingTierToDevice(bldg, floorCode, tierDim, resized);
                    return resized;
                }
                if (resized && Number(tierDim) <= baseTier) {
                    cacheFloorDrawingTierToDevice(bldg, floorCode, tierDim, resized);
                    return resized;
                }
            } catch (e) {
                console.warn('도면 LOD 이미지 리사이즈 실패:', e);
            }
        }

        // 고해상도 요청에 저해상도를 넣으면 applyTierImageIfSharper가 조용히 실패함 (모바일에서 LOD 멈춤)
        if (Number(tierDim) > baseTier) return null;

        const fallbackDims = [4000, 2000];
        const liveTiers = (bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode]) || tiers;
        for (const d of fallbackDims) {
            if (d <= tierDim && liveTiers && liveTiers[String(d)]) return liveTiers[String(d)];
        }
        return (bldg.floorDrawings && bldg.floorDrawings[floorCode]) || null;
    }

    function scheduleFloorDrawingTierSync() {
        if (floorDrawingTierSyncTimer) clearTimeout(floorDrawingTierSyncTimer);
        // 2026-11-12 DXF 층은 화면을 선으로 직접 그리므로 확대용 큰 그림(8000/16000)을 받지 않는다
        if (typeof getDxfViewModelForCurrentFloor === 'function' && getDxfViewModelForCurrentFloor()) {
            floorDrawingTierSyncTimer = null;
            return;
        }
        try {
            const bldg = state.currentBuilding;
            const fc = state.currentFloor;
            if (bldg && fc) {
                const want = pickFloorDrawingTierDimForCurrentView();
                const active = Number(floorDrawingActiveTierDim) || 4000;
                if (want > active) prefetchFloorDrawingTiersForFloor(bldg, fc, [want]);
            }
        } catch (_) { /* prefetch optional */ }
        floorDrawingTierSyncTimer = setTimeout(() => {
            floorDrawingTierSyncTimer = null;
            syncFloorDrawingTierForView();
        }, 120);
    }

    async function syncFloorDrawingTierForView() {
        const bldg = refreshCurrentBuildingFromState() || state.currentBuilding;
        const fc = state.currentFloor;
        if (!bldg || !fc || (state.currentTab !== 'tab-map') || !state.bgImage) return;

        if (hasActiveFloorHiPatch()) {
            applyFloorDrawingTarget(undefined, null, { immediate: true });
            resetViewportPatchState();
        }

        const wantDim = pickFloorDrawingTierDimForCurrentView();
        if (wantDim === floorDrawingActiveTierDim) return;

        const loadToken = ++floorDrawingTierLoadToken;
        updateMapZoomOverlay();
        const dataUrl = await resolveFloorDrawingTierDataUrl(bldg, fc, wantDim);
        if (loadToken !== floorDrawingTierLoadToken) return;
        if (!dataUrl) {
            updateMapZoomOverlay();
            return;
        }
        if (state.currentFloor !== fc || state.currentBuildingId !== bldg.id) return;

        const cacheKey = `${bldg.id}_${fc}_${wantDim}`;
        const cached = state.floorDrawingTierImageCache && state.floorDrawingTierImageCache[cacheKey];
        if (cached && cached.complete && getImageLongSide(cached) > 0) {
            applyTierImageIfSharper(cached, wantDim, fc, bldg, loadToken);
            return;
        }

        try {
            const img = await loadRasterImageElement(dataUrl);
            applyTierImageIfSharper(img, wantDim, fc, bldg, loadToken);
        } catch (e) {
            if (loadToken === floorDrawingTierLoadToken) {
                console.warn('도면 LOD 이미지 로드 실패:', fc, wantDim, e);
                updateMapZoomOverlay();
            }
        }
    }

    function finishRegisteredFloorDrawingLoadFailed(floorCode) {
        if (state.currentFloor !== floorCode) return;
        const offlineHint = (typeof navigator !== 'undefined' && navigator.onLine === false)
            ? '오프라인 — 로컬에 도면이 없습니다. 온라인에서 점검을 다시 시작해 주세요.'
            : '클라우드에서 도면을 받지 못했습니다. 네트워크 확인 후 점검을 다시 시작해 주세요.';
        showFloorDrawingEmptyState(floorCode, offlineHint);
        if (typeof window.showToast === 'function') {
            window.showToast(offlineHint, 'warning', 4500);
        }
    }

    function pickFirstTierUrl(tiers, preferredKeys) {
        if (!tiers || typeof tiers !== 'object') return null;
        for (const k of (preferredKeys || [])) {
            if (tiers[k]) return tiers[k];
        }
        const vals = Object.values(tiers).filter(Boolean);
        return vals.length ? vals[0] : null;
    }

    /**
     * 층을 바꾸기 전에 비파괴 창을 저장하며 닫는다 (감사 R-10, 2026-09-28).
     * 열린 채 바꾸면 이어지는 자동 저장이 새 층 기준으로 돌아, 고치던 항목은 새 층에서 못 찾아 수정이
     * 사라지고 새 항목은 엉뚱한 층에 생겼다. 반드시 state.currentFloor를 바꾸기 **전에** 부른다.
     */
    function closeNdtDrawersBeforeFloorChange() {
        if (typeof isNdtModalOpen === 'function' && isNdtModalOpen()) closeNdtModal();
        if (typeof isNdtCrackMonitorModalOpen === 'function' && isNdtCrackMonitorModalOpen()) closeNdtCrackMonitorModal();
        if (typeof isNdtDisplacementModalOpen === 'function' && isNdtDisplacementModalOpen()) closeNdtDisplacementModal();
        if (typeof isNdtDisplacementGroupEditOpen === 'function' && isNdtDisplacementGroupEditOpen()) {
            closeNdtDisplacementGroupEditModal();
        }
    }

    function loadFloorDrawing(floorCode, options) {
        if (state.currentFloor && floorCode !== state.currentFloor) closeNdtDrawersBeforeFloorChange();
        resetFloorPdfKnownState(state.currentBuildingId, floorCode);
        viewportHiPatchToken++;
        resetViewportPatchState();
        const opts = options || {};
        const prevBuildingId = state.currentBuildingId;
        const prevFloor = state.currentFloor;
        state.currentFloor = floorCode;
        recordLastLocation();
        if ((prevBuildingId !== state.currentBuildingId || prevFloor !== floorCode)
            && typeof subscribeCurrentFloorSync === 'function') {
            if (prevFloor && prevBuildingId) {
                markFloorKeyDirty(`${prevBuildingId}_${prevFloor}`);
            }
            subscribeCurrentFloorSync();
        }
        if (state.floorPlanRef && state.floorPlanRef.floorCode !== floorCode) {
            state.floorPlanRef = null;
        }
        // 건물·층이 바뀌면 이전 도면을 지우고 새 층을 그린다
        if (opts.forceClear || prevBuildingId !== state.currentBuildingId || prevFloor !== floorCode) {
            cancelFloorDrawingBlend();
            state.bgImage = null;
            state.floorDrawingHiPatch = null;
            const rotBldgId = state.currentBuildingId;
            const savedRot = rotBldgId ? getSavedFloorDrawingRotation(rotBldgId, floorCode) : null;
            state.rotationAngle = savedRot !== null ? savedRot : 0;
        }
        const preserveView = !!opts.preserveView
            || (!opts.forceFit && prevFloor === floorCode && !!state.bgImage
                && state.floorPlanRef && state.floorPlanRef.floorCode === floorCode);
        clearFloorDrawingHiPatch(true);
        floorDrawingActiveTierDim = null;
        const loadToken = ++floorDrawingTierLoadToken;

        const bldg = refreshCurrentBuildingFromState() || state.currentBuilding;
        const baseTier = (typeof window.getFloorDrawingBaseTierDim === 'function')
            ? window.getFloorDrawingBaseTierDim()
            : 4000;
        const baseTierKey = String(baseTier);
        const tierLookupKeys = [baseTierKey, '4000', '2000', '8000', '16000'];
        const rawDrawing = bldg && bldg.floorDrawings && bldg.floorDrawings[floorCode];
        let dataUrl = null;
        if (isDrawingReplaceGuarded(bldg, floorCode) && rawDrawing && isUsableRasterDrawingUrl(rawDrawing)) {
            // 교체 직후엔 옛 고해상도 티어보다 방금 넣은 래스터를 우선
            dataUrl = rawDrawing;
        } else {
            dataUrl = pickFirstTierUrl(bldg && bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode], tierLookupKeys);
            if (!dataUrl && rawDrawing && isRasterDrawingUrl(rawDrawing)) {
                dataUrl = rawDrawing;
            }
        }

        const shouldLoadDrawing = shouldAttemptFloorDrawingLoad(bldg, floorCode);
        const canUseDataUrl = isUsableRasterDrawingUrl(dataUrl);

        const tryLoadCloudRasterThenFinish = async () => {
            if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return false;
            if (typeof fetchAndCacheCloudFloorDrawingTier === 'function' && navigator.onLine !== false) {
                const cloud4000 = await fetchAndCacheCloudFloorDrawingTier(bldg, floorCode, 4000);
                if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return false;
                if (isUsableRasterDrawingUrl(cloud4000)) {
                    tryLoadImage(cloud4000);
                    return true;
                }
            }
            if (typeof fetchCloudFloorDrawingDataUrl === 'function' && navigator.onLine !== false) {
                const cloudRaster = await fetchCloudFloorDrawingDataUrl(bldg.id, floorCode);
                if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return false;
                if (isUsableRasterDrawingUrl(cloudRaster) && !isPdfDrawingUrl(cloudRaster)) {
                    if (!bldg.floorDrawings) bldg.floorDrawings = {};
                    bldg.floorDrawings[floorCode] = cloudRaster;
                    tryLoadImage(cloudRaster);
                    return true;
                }
            }
            return false;
        };

        const tryLoadImage = (srcUrl) => {
            if (!isRasterDrawingUrl(srcUrl)) {
                if (shouldLoadDrawing) {
                    tryLoadCloudRasterThenFinish().then((ok) => {
                        if (!ok && loadToken === floorDrawingTierLoadToken && state.currentFloor === floorCode) {
                            finishRegisteredFloorDrawingLoadFailed(floorCode);
                        }
                    });
                } else {
                    showFloorDrawingEmptyState(floorCode);
                }
                return;
            }
            const img = new Image();
            if (typeof srcUrl === 'string' && /^https?:\/\//i.test(srcUrl)) {
                img.crossOrigin = 'anonymous';
            }
            img.onload = async () => {
                applyFloorDrawingTarget(img, null, { immediate: !state.bgImage });
                updateFloorDrawingEmptyOverlay(null);
                floorDrawingActiveTierDim = baseTier;
                if (bldg && bldg.id) {
                    // 이 기기에 PDF가 없어도 서버에서 받아 스냅 선을 만든다.
                    // 크롬·엣지는 예전에 받은 PDF가 기기에 남아 스냅이 되고, 프로그램은 그림만 있어 안 붙었다.
                    if (state.snapToCad !== false || floorMayHavePdfSource(bldg, floorCode)) {
                        await ensureFloorPlanRefForPdf(bldg, floorCode);
                    }
                    const refNow = state.floorPlanRef;
                    const refOk = refNow && refNow.bldgId === bldg.id && refNow.floorCode === floorCode && refNow.w > 0;
                    if (!refOk) updateFloorPlanRefFromImage(img, bldg.id, floorCode);
                    // 좌표 기준이 정해졌으니 비파괴 도면도 그 크기로 다시 맞춘다
                    syncNdtBackgroundWithMapDrawing();
                }
                if (!state.floorDrawingTierImageCache) state.floorDrawingTierImageCache = {};
                if (bldg && bldg.id) {
                    state.floorDrawingTierImageCache[`${bldg.id}_${floorCode}_${baseTier}`] = img;
                }
                // Auto-detect Portrait drawing and auto-rotate 90° to Landscape for optimal architectural inspection
                if (bldg && bldg.id) {
                    resolveFloorDrawingRotation(bldg.id, floorCode, img);
                }
                resizeCanvas();
                if (preserveView) {
                    if (elements.zoomScaleText) {
                        elements.zoomScaleText.textContent = formatMapZoomLabel();
                    }
                    drawCanvas();
                    scheduleFloorDrawingTierSync();
                } else {
                    fitToScreen();
                    drawCanvas();
                }
                scheduleFloorDrawingTierPrefetch(bldg, floorCode);
            };
            img.onerror = () => {
                if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return;
                clearBrokenRasterDrawingCache(bldg, floorCode);
                (async () => {
                    if (typeof srcUrl === 'string' && /^https?:\/\//i.test(srcUrl)
                        && typeof fetchStorageImageViaProxy === 'function') {
                        try {
                            const proxied = await fetchStorageImageViaProxy(srcUrl);
                            if (proxied && loadToken === floorDrawingTierLoadToken && state.currentFloor === floorCode) {
                                tryLoadImage(proxied);
                                return;
                            }
                        } catch (proxyErr) {
                            console.warn('도면 https→프록시 실패:', floorCode, proxyErr);
                        }
                    }
                    if (shouldLoadDrawing) {
                        const ok = await tryLoadCloudRasterThenFinish();
                        if (!ok && loadToken === floorDrawingTierLoadToken && state.currentFloor === floorCode) {
                            finishRegisteredFloorDrawingLoadFailed(floorCode);
                        }
                        return;
                    }
                    if (loadToken === floorDrawingTierLoadToken && state.currentFloor === floorCode) {
                        showFloorDrawingEmptyState(floorCode);
                    }
                })();
            };
            img.src = srcUrl;
        };

        if (canUseDataUrl) {
            tryLoadImage(dataUrl);
        } else if (shouldLoadDrawing) {
            (async () => {
                if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return;
                const idbKey = `${bldg.id}_${floorCode}`;
                const [t4000, cachedUrl] = await Promise.all([
                    idbGetFloorDrawingTier(bldg.id, floorCode, 4000),
                    idbGet('floorDrawings', idbKey)
                ]);

                if (loadToken !== floorDrawingTierLoadToken || state.currentFloor !== floorCode) return;

                if (isUsableRasterDrawingUrl(t4000)) {
                    if (!bldg.floorDrawingTiers) bldg.floorDrawingTiers = {};
                    if (!bldg.floorDrawingTiers[floorCode]) bldg.floorDrawingTiers[floorCode] = {};
                    bldg.floorDrawingTiers[floorCode]['4000'] = t4000;
                    tryLoadImage(t4000);
                    return;
                }

                const memRaster = bldg.floorDrawings && bldg.floorDrawings[floorCode];
                if (isUsableRasterDrawingUrl(memRaster)) {
                    tryLoadImage(memRaster);
                    return;
                }
                if (isUsableRasterDrawingUrl(cachedUrl)) {
                    if (!bldg.floorDrawings) bldg.floorDrawings = {};
                    bldg.floorDrawings[floorCode] = cachedUrl;
                    tryLoadImage(cachedUrl);
                    return;
                } else if (cachedUrl) {
                    clearBrokenRasterDrawingCache(bldg, floorCode);
                }

                // PDF 폴백 없음 — 클라우드 레스터만 시도 (PDF는 등록·벡터 출력 전용)
                if (await tryLoadCloudRasterThenFinish()) return;

                if (loadToken === floorDrawingTierLoadToken && state.currentFloor === floorCode) {
                    const offlineHint = (typeof navigator !== 'undefined' && navigator.onLine === false)
                        ? '오프라인 — 로컬에 도면이 없습니다. 온라인에서 점검을 다시 시작해 주세요.'
                        : '클라우드에서 도면을 받지 못했습니다. 네트워크 확인 후 점검을 다시 시작해 주세요.';
                    showFloorDrawingEmptyState(floorCode, offlineHint);
                    if (typeof window.showToast === 'function') {
                        window.showToast(offlineHint, 'warning', 4500);
                    }
                }
            })();
        } else {
            showFloorDrawingEmptyState(floorCode);
        }
    }
    window.loadFloorDrawing = loadFloorDrawing;

    function viewToImgCoords(vx, vy) {
        const angle = state.rotationAngle || 0;
        const dims = getFloorPlanDisplayDims();
        const imgW = dims.w;
        const imgH = dims.h;

        if (angle === 90) {
            return { x: vy, y: imgH - vx };
        } else if (angle === 180) {
            return { x: imgW - vx, y: imgH - vy };
        } else if (angle === 270) {
            return { x: imgW - vy, y: vx };
        }
        return { x: vx, y: vy };
    }

    // viewToImgCoords()의 역변환: 이미지 좌표 -> 회전 반영된 view 좌표
    function imgToViewCoords(imgX, imgY) {
        const angle = state.rotationAngle || 0;
        const dims = getFloorPlanDisplayDims();
        const imgW = dims.w;
        const imgH = dims.h;

        if (angle === 90) {
            return { x: imgH - imgY, y: imgX };
        } else if (angle === 180) {
            return { x: imgW - imgX, y: imgH - imgY };
        } else if (angle === 270) {
            return { x: imgY, y: imgW - imgX };
        }
        return { x: imgX, y: imgY };
    }

    function getDefectMarkingImgCenter(defect) {
        if (!defect) return null;
        if (defect.shapeType === 'area' && defect.areaX1 !== undefined && defect.areaX2 !== undefined) {
            return {
                x: (Number(defect.areaX1) + Number(defect.areaX2)) / 2,
                y: (Number(defect.areaY1) + Number(defect.areaY2)) / 2
            };
        }
        const x = Number(defect.x);
        const y = Number(defect.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const tx = Number(defect.targetX);
        const ty = Number(defect.targetY);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
            return { x: (x + tx) / 2, y: (y + ty) / 2 };
        }
        return { x, y };
    }

    let _panAnimRafId = 0;
    let _panAnimTarget = null;

    function cancelCanvasPanAnimation() {
        if (_panAnimRafId) {
            cancelAnimationFrame(_panAnimRafId);
            _panAnimRafId = 0;
        }
        _panAnimTarget = null;
    }

    function prefersReducedMotion() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_e) { return false; }
    }

    // 사용자가 도면을 조작하면 진행 중인 이동 애니메이션·예약된 보정 즉시 중단
    function stopMapAutoPanOnUserInput() {
        if (!_panAnimRafId) return;
        if (typeof cancelScheduledRevealMarkingAboveDrawer === 'function') cancelScheduledRevealMarkingAboveDrawer();
        else cancelCanvasPanAnimation();
    }

    // 결함 수정창이 하단 바텀시트로 올라오는 레이아웃인지 판별 (모바일 세로, 태블릿 세로 등)
    function isDefectDrawerBottomLayout() {
        if (layoutIsPcLike()) return false;
        if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) return true;
        if ((window.innerHeight || 0) > (window.innerWidth || 0)) return true;
        if (layoutIsMobileWidth() && !(window.matchMedia && window.matchMedia('(orientation: landscape)').matches)) return true;
        const card = document.querySelector('#defectModal .defect-drawer-card');
        if (card) {
            const r = card.getBoundingClientRect();
            if (r.width >= (window.innerWidth || 1) * 0.75) return true;
        }
        return false;
    }

    // 결함 마킹이 드로어에 가려지는지 또는 화면 가시 영역 밖인지 판별
    function isDefectMarkingCoveredByDrawer(defect) {
        if (!defect || !state.canvas) return false;
        const center = getDefectMarkingImgCenter(defect);
        if (!center) return false;
        const v = imgToViewCoords(center.x, center.y);
        const scale = state.view.scale || 1;
        const canvas = (typeof elements !== 'undefined' && elements.planCanvas) || state.canvas;
        const cRect = canvas.getBoundingClientRect();
        const ptX = cRect.left + (v.x * scale + state.view.offsetX);
        const ptY = cRect.top + (v.y * scale + state.view.offsetY);

        if (isDefectDrawerBottomLayout()) {
            let drawerHeight = 0;
            const card = document.querySelector('#defectModal .defect-drawer-card');
            if (card && card.offsetHeight > 80) {
                drawerHeight = card.offsetHeight;
            } else if (document.documentElement.classList.contains('layout-tablet')) {
                drawerHeight = window.innerHeight * 0.56;
            } else {
                drawerHeight = window.innerHeight * 0.60;
            }
            const drawerTop = Math.max(window.innerHeight * 0.35, window.innerHeight - drawerHeight);
            if (ptY + 36 >= drawerTop || ptY - 36 <= cRect.top) return true;
            if (ptX - 30 <= cRect.left || ptX + 30 >= cRect.right) return true;
            return false;
        }

        if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches && !layoutIsPcLike()) {
            let drawerW = window.innerWidth * 0.333;
            if (document.documentElement.classList.contains('layout-tablet')) {
                drawerW = Math.min(420, window.innerWidth * 0.38);
            }
            const card = document.querySelector('#defectModal .defect-drawer-card');
            if (card && card.offsetWidth > 100) drawerW = card.offsetWidth;
            const drawerLeft = window.innerWidth - drawerW;
            if (ptX + 44 >= drawerLeft || ptX - 36 <= cRect.left) return true;
            if (ptY - 30 <= cRect.top || ptY + 30 >= cRect.bottom) return true;
            return false;
        }

        const card = document.querySelector('#defectModal .defect-drawer-card');
        if (card) {
            const dRect = card.getBoundingClientRect();
            if (dRect.width > 40 && ptX + 36 >= dRect.left && ptX - 36 <= dRect.right && ptY >= dRect.top && ptY <= dRect.bottom) {
                return true;
            }
        }
        return false;
    }

    // 결함 수정 창이 가리는 영역을 피한 캔버스 포커스 지점
    // 세로 모바일/태블릿: 하단 바텀시트(56~60vh) 위 상단 가시 영역 중앙
    // 가로 모바일/태블릿: 우측 드로어(33~38vw) 좌측 가시 영역 중앙
    function getUncoveredCanvasFocusPoint() {
        const cssW = state.canvasCssW || 0;
        const cssH = state.canvasCssH || 0;
        const fallback = { x: cssW / 2, y: cssH / 2 };
        const canvas = (typeof elements !== 'undefined' && elements.planCanvas) || state.canvas;
        if (!canvas || cssW < 8 || cssH < 8) return fallback;
        const cRect = canvas.getBoundingClientRect();
        let visL = 0;
        let visT = 0;
        let visR = cssW;
        let visB = cssH;

        if (isDefectDrawerBottomLayout()) {
            let drawerHeight = 0;
            const card = document.querySelector('#defectModal .defect-drawer-card');
            if (card && card.offsetHeight > 80) {
                drawerHeight = card.offsetHeight;
            } else if (document.documentElement.classList.contains('layout-tablet')) {
                drawerHeight = window.innerHeight * 0.56;
            } else {
                drawerHeight = window.innerHeight * 0.60;
            }
            const drawerTop = Math.max(window.innerHeight * 0.35, window.innerHeight - drawerHeight);
            visT = Math.max(0, -cRect.top);
            visB = Math.max(visT + 64, Math.min(cssH, drawerTop - cRect.top - 12));
            const centerY = (visT + visB) / 2;
            const focusY = Math.max(visT + 28, Math.min(visB - 28, centerY));
            return { x: (visL + visR) / 2, y: focusY };
        }

        if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches && !layoutIsPcLike()) {
            let drawerW = window.innerWidth * 0.333;
            if (document.documentElement.classList.contains('layout-tablet')) {
                drawerW = Math.min(420, window.innerWidth * 0.38);
            }
            const card = document.querySelector('#defectModal .defect-drawer-card');
            if (card && card.offsetWidth > 100) drawerW = card.offsetWidth;
            const drawerLeft = window.innerWidth - drawerW;
            visR = Math.max(64, Math.min(cssW, drawerLeft - cRect.left - 12));
            return { x: (visL + visR) / 2, y: (visT + visB) / 2 };
        } else {
            const card = document.querySelector('#defectModal .defect-drawer-card');
            if (card) {
                const dRect = card.getBoundingClientRect();
                if (dRect.width > 40 && dRect.left < cRect.right && dRect.top < cRect.bottom) {
                    visR = Math.max(64, Math.min(cssW, dRect.left - cRect.left - 12));
                }
            }
        }
        if (visR - visL < 48 || visB - visT < 48) return fallback;
        return { x: (visL + visR) / 2, y: (visT + visB) / 2 };
    }

    function panCanvasToDefectMarking(defect, options = {}) {
        // 드래그 중 선택 팬/센터 고정이 반복되면 도면이 덜컥거림 — 드래그 중 차단.
        // 드래그 종료 후 재팬은 handleDragEnd에서 호출하지 않음(조사표 선택만 카메라 이동).
        if (typeof isMapPinDragActive === 'function' && isMapPinDragActive() && !options.forceDuringDrag) {
            return false;
        }
        if (!defect || !state.canvas) return false;
        const center = getDefectMarkingImgCenter(defect);
        if (!center) return false;
        const useUncovered = options.uncovered === true;
        const cur = state.view.scale || 1;
        const targetScale = options.keepScale
            ? cur
            : Math.min(0.52, Math.max(0.35, Math.min(cur * 1.04, 0.52)));
        const v = imgToViewCoords(center.x, center.y);
        const cssW = state.canvasCssW || state.canvas.width;
        const cssH = state.canvasCssH || state.canvas.height;
        const focus = useUncovered
            ? getUncoveredCanvasFocusPoint()
            : { x: cssW / 2, y: cssH / 2 };
        const targetOffsetX = focus.x - v.x * targetScale;
        const targetOffsetY = focus.y - v.y * targetScale;

        // 2026-10-16 순간이동 대신 부드러운 이동(easeOut, rAF). 애니메이션 진행 중 후속 보정 호출은 목표만 갱신.
        if (_panAnimRafId && !options.forceJump) {
            _panAnimTarget = { x: targetOffsetX, y: targetOffsetY, s: targetScale };
            return true;
        }
        if (options.animate && typeof requestAnimationFrame === 'function' && !prefersReducedMotion()) {
            cancelCanvasPanAnimation();
            const startX = state.view.offsetX;
            const startY = state.view.offsetY;
            const startScale = state.view.scale || 1;
            if (Math.hypot(targetOffsetX - startX, targetOffsetY - startY) < 3 && Math.abs(targetScale - startScale) < 0.005) {
                state.view.scale = targetScale;
                state.view.offsetX = targetOffsetX;
                state.view.offsetY = targetOffsetY;
                if (elements.zoomScaleText) elements.zoomScaleText.textContent = `${Math.round(targetScale * 100)}%`;
                if (typeof drawCanvas === 'function') drawCanvas({ immediate: true });
                return true;
            }
            _panAnimTarget = { x: targetOffsetX, y: targetOffsetY, s: targetScale };
            const duration = Number.isFinite(options.duration) ? options.duration : 320;
            const startTime = performance.now();
            function step(now) {
                const t = _panAnimTarget;
                const progress = Math.min(1, (now - startTime) / duration);
                const ease = 1 - Math.pow(1 - progress, 3);
                state.view.offsetX = startX + (t.x - startX) * ease;
                state.view.offsetY = startY + (t.y - startY) * ease;
                state.view.scale = startScale + (t.s - startScale) * ease;
                if (elements.zoomScaleText) elements.zoomScaleText.textContent = `${Math.round(state.view.scale * 100)}%`;
                drawCanvas({ immediate: true });
                if (progress < 1) {
                    _panAnimRafId = requestAnimationFrame(step);
                } else {
                    _panAnimRafId = 0;
                    _panAnimTarget = null;
                }
            }
            _panAnimRafId = requestAnimationFrame(step);
            return true;
        }

        cancelCanvasPanAnimation();
        state.view.scale = targetScale;
        state.view.offsetX = targetOffsetX;
        state.view.offsetY = targetOffsetY;
        if (elements.zoomScaleText) elements.zoomScaleText.textContent = `${Math.round(targetScale * 100)}%`;
        if (typeof drawCanvas === 'function') drawCanvas({ immediate: true });
        return true;
    }

    let _revealMarkingGen = 0;

    function scheduleRevealMarkingAboveDrawer(defect, options = {}) {
        if (!defect) return;
        // 드래그 중에는 반복 pan이 센터 고정처럼 뷰를 흔듦 — 드래그 중 차단.
        // 핀 드래그 종료 경로에서는 호출하지 않음(조사표 선택·명시적 reveal만).
        if (typeof isMapPinDragActive === 'function' && isMapPinDragActive() && !options.forceDuringDrag) {
            return;
        }
        const animate = options.animate !== false;
        const gen = ++_revealMarkingGen;
        const run = (doAnimate) => {
            if (gen !== _revealMarkingGen) return;
            if (typeof isMapPinDragActive === 'function' && isMapPinDragActive() && !options.forceDuringDrag) return;
            panCanvasToDefectMarking(defect, {
                uncovered: true,
                keepScale: options.keepScale !== false,
                animate: !!doAnimate
            });
            if (typeof drawCanvas === 'function') drawCanvas({ immediate: !doAnimate });
        };
        // 드로어 높이 미확정 / 트랜지션 중 / 완료 후를 모두 맞춤
        run(animate);
        requestAnimationFrame(() => {
            run(false);
            requestAnimationFrame(() => run(false));
        });
        setTimeout(() => run(false), 180);
        setTimeout(() => run(false), 360);
        setTimeout(() => run(false), 520);
    }
    function cancelScheduledRevealMarkingAboveDrawer() {
        _revealMarkingGen += 1;
        if (typeof cancelCanvasPanAnimation === 'function') cancelCanvasPanAnimation();
    }
    window.scheduleRevealMarkingAboveDrawer = scheduleRevealMarkingAboveDrawer;
    window.getUncoveredCanvasFocusPoint = getUncoveredCanvasFocusPoint;
    window.isDefectDrawerBottomLayout = isDefectDrawerBottomLayout;
    window.isDefectMarkingCoveredByDrawer = isDefectMarkingCoveredByDrawer;

    // 좌측 결함 목록에서 특정 결함을 클릭했을 때 캔버스를 그 위치로 이동·표시 (과도한 확대는 피함)
    window.focusDefectOnCanvas = function(defectId, options = {}) {
        const defects = getCurrentFloorDefects();
        const defect = defects.find(d => d.id === defectId);
        if (!defect || !state.canvas) return;
        if (isDefectMapUnregistered(defect)) {
            startMapRegisterForDefect(defectId);
            return;
        }

        panCanvasToDefectMarking(defect, Object.assign({ animate: true }, options));

        activeDragPin = defect;
        drawCanvas();
        setTimeout(() => {
            if (activeDragPin === defect) activeDragPin = null;
            drawCanvas();
        }, 900);
    };

    let _mapDrawRafId = 0;
    let _floorSnapshotTimer = 0;

    function captureFloorSnapshotNow() {
        if (!state.canvas || !state.currentFloor) return;
        try {
            if (!state.floorSnapshots) state.floorSnapshots = {};
            const snapW = state.canvasCssW || state.canvas.width;
            const snapH = state.canvasCssH || state.canvas.height;
            if ((state.canvasDpr || 1) > 1.05) {
                const off = document.createElement('canvas');
                off.width = snapW;
                off.height = snapH;
                off.getContext('2d').drawImage(state.canvas, 0, 0, snapW, snapH);
                state.floorSnapshots[state.currentFloor] = off.toDataURL('image/jpeg', 0.82);
            } else {
                state.floorSnapshots[state.currentFloor] = state.canvas.toDataURL('image/jpeg', 0.82);
            }
        } catch (_e) { /* ignore */ }
    }

    function scheduleFloorSnapshotCapture() {
        if (_floorSnapshotTimer) clearTimeout(_floorSnapshotTimer);
        const delay = window.BSA?.performance?.getFloorSnapshotDelayMs?.() ?? 500;
        _floorSnapshotTimer = setTimeout(() => {
            _floorSnapshotTimer = 0;
            captureFloorSnapshotNow();
        }, delay);
    }

    function drawCanvas(opts) {
        opts = opts || {};
        requestDrawingCrosshairUpdate();
        if (opts.immediate) {
            if (_mapDrawRafId) {
                cancelAnimationFrame(_mapDrawRafId);
                _mapDrawRafId = 0;
            }
            paintMapCanvas(opts);
            return;
        }
        if (_mapDrawRafId) return;
        _mapDrawRafId = requestAnimationFrame(() => {
            _mapDrawRafId = 0;
            paintMapCanvas(opts);
        });
    }

    function paintMapCanvas(_opts) {
        if (!state.ctx || !state.canvas) return;
            ensureMapStyleMatchesCurrentFloor();
        const ctx = state.ctx;
        const dpr = state.canvasDpr || 1;
        const cw = state.canvasCssW || Math.round(state.canvas.width / dpr);
        const ch = state.canvasCssH || Math.round(state.canvas.height / dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        ctx.translate(state.view.offsetX, state.view.offsetY);
        ctx.scale(state.view.scale, state.view.scale);

        const angle = state.rotationAngle || 0;
        const dims = getFloorPlanDisplayDims();
        const imgW = dims.w;
        const imgH = dims.h;

        ctx.save();
        if (angle === 90) {
            ctx.translate(imgH, 0);
            ctx.rotate((90 * Math.PI) / 180);
        } else if (angle === 180) {
            ctx.translate(imgW, imgH);
            ctx.rotate((180 * Math.PI) / 180);
        } else if (angle === 270) {
            ctx.translate(0, imgW);
            ctx.rotate((270 * Math.PI) / 180);
        }

        if (state.bgImage) {
            drawFloorPlanLayers(ctx, imgW, imgH);
            // 행·열(통심) 선 — 도면 바로 위, 마킹보다 아래 (화면 전용)
            try {
                if (typeof drawFloorGridOverlay === 'function') drawFloorGridOverlay(ctx, imgW, imgH);
            } catch (gridErr) {
                console.warn('[grid-lines] draw', gridErr);
            }

            const currentDefects = getCurrentFloorMapPlacedDefects();
            renderDefectsGrouped(ctx, currentDefects, drawPin);
            drawMemberGbNeededMarkers(ctx, currentDefects);

            if (typeof drawLocationMapLegend === 'function') {
                drawLocationMapLegend(ctx, imgW, imgH, true, state.rotationAngle || 0);
            }

            // Draw Live Marking Drag Preview (드래그 중 — 클릭만 해도 위치 표시)
            if (isMarkingDrag) {
            const previewMeta = getLiveMarkPinPreviewMeta();
            const pendingDefect = previewMeta.defect;
            const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
            const liveNoStr = previewMeta.fromGroup
                ? previewMeta.label
                : (pendingDefect ? (pendingDefect.groupNo || pendingDefect.no || previewMeta.label) : (document.getElementById('defectNo')?.value || getNextDefectNoStr(getFloorDefectsForNumbering(floorKey))));
            drawPin(ctx, {
                no: liveNoStr,
                groupNo: previewMeta.fromGroup ? previewMeta.label : (pendingDefect?.groupNo || liveNoStr),
                category: pendingDefect ? inheritDefectCategory(pendingDefect) : readDefectCategoryUi(),
                defectType: pendingDefect?.defectType || getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput')) || '',
                x: liveBoxImgX,
                y: liveBoxImgY,
                targetX: markPreviewTargetX,
                targetY: markPreviewTargetY
            });
            }

            drawPendingDefectPreview(ctx, currentDefects);

            if (isAreaDrag) {
            drawAreaRect(ctx, {
                areaX1: areaStartImgX,
                areaY1: areaStartImgY,
                areaX2: areaCurImgX,
                areaY2: areaCurImgY,
                areaShape: (state.areaCreateShape === 'ellipse') ? 'ellipse' : 'rect',
                areaAngle: 0,
                category: readDefectCategoryUi(),
                no: ''
            }, true);
            }
            if (pendingAreaPoly && pendingAreaPoly.length) {
                const pvLine = getPendingPolyShape() === 'polyline';
                const pvScale = Math.max(state.view.scale || 1, 0.01);
                ctx.save();
                ctx.strokeStyle = '#ea580c';
                ctx.fillStyle = 'rgba(234,88,12,0.15)';
                ctx.lineWidth = 2 / pvScale;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                pendingAreaPoly.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                if (!pvLine && pendingAreaPoly.length >= 3) {
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.stroke();
                pendingAreaPoly.forEach((p, i) => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 4 / pvScale, 0, Math.PI * 2);
                    ctx.fillStyle = '#ea580c';
                    ctx.fill();
                    if (pvLine) {
                        // 선: 1번, 2번, 3번… 점 순서를 번호로 보여 준다
                        ctx.font = `700 ${Math.round(12 / pvScale)}px sans-serif`;
                        ctx.textBaseline = 'bottom';
                        ctx.fillStyle = '#7c2d12';
                        ctx.fillText(String(i + 1), p.x + 6 / pvScale, p.y - 5 / pvScale);
                    }
                });
                ctx.restore();
            }
            if (areaInkStroke && areaInkStroke.points && areaInkStroke.points.length) {
                // preview stroke without clip — draw raw
                ctx.save();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2.2 / Math.max(state.view.scale || 1, 0.01);
                ctx.beginPath();
                const pts = areaInkStroke.points;
                if ((areaInkStroke.type === 'rect' || areaInkStroke.type === 'ellipse') && pts.length >= 2) {
                    const x1 = Math.min(pts[0].x, pts[1].x);
                    const y1 = Math.min(pts[0].y, pts[1].y);
                    const x2 = Math.max(pts[0].x, pts[1].x);
                    const y2 = Math.max(pts[0].y, pts[1].y);
                    if (areaInkStroke.type === 'ellipse') {
                        ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max((x2 - x1) / 2, 0.5), Math.max((y2 - y1) / 2, 0.5), 0, 0, Math.PI * 2);
                    } else ctx.rect(x1, y1, x2 - x1, y2 - y1);
                } else {
                    pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
                }
                ctx.stroke();
                ctx.restore();
            }
            if (pendingInkPoly && pendingInkPoly.points && pendingInkPoly.points.length) {
                ctx.save();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2 / Math.max(state.view.scale || 1, 0.01);
                ctx.beginPath();
                pendingInkPoly.points.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                ctx.stroke();
                ctx.restore();
            }

            if (isMarqueeSelecting) {
                const x1 = Math.min(marqueeStartImgX, marqueeCurImgX);
                const y1 = Math.min(marqueeStartImgY, marqueeCurImgY);
                const x2 = Math.max(marqueeStartImgX, marqueeCurImgX);
                const y2 = Math.max(marqueeStartImgY, marqueeCurImgY);
                ctx.save();
                ctx.fillStyle = 'rgba(37, 99, 235, 0.14)';
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 1.5 / Math.max(state.view.scale || 1, 0.01);
                ctx.setLineDash([6 / Math.max(state.view.scale || 1, 0.01), 4 / Math.max(state.view.scale || 1, 0.01)]);
                ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.restore();
            }

            // 2026-10-31 자동으로 찾은 테두리 모서리 제안(확인 전)
            if (window.cadCalibrationState && Array.isArray(window.cadCalibrationState.proposal)) {
                const sc = Math.max(state.view.scale || 1, 0.01);
                window.cadCalibrationState.proposal.forEach((p, i) => {
                    ctx.save();
                    ctx.strokeStyle = '#f97316';
                    ctx.fillStyle = 'rgba(249, 115, 22, 0.22)';
                    ctx.lineWidth = 3 / sc;
                    const r = 22 / sc;
                    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(p.x - r * 1.6, p.y); ctx.lineTo(p.x + r * 1.6, p.y);
                    ctx.moveTo(p.x, p.y - r * 1.6); ctx.lineTo(p.x, p.y + r * 1.6);
                    ctx.stroke();
                    ctx.font = `bold ${Math.round(16 / sc)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                    ctx.fillStyle = '#ea580c';
                    ctx.fillText(`기준점 ${i + 1}(자동)`, p.x + r + 4, p.y - 4);
                    ctx.restore();
                });
            }
            if (window.cadCalibrationState && window.cadCalibrationState.pt1) {
                const p1 = window.cadCalibrationState.pt1;
                ctx.save();
                ctx.strokeStyle = '#ef4444';
                ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
                ctx.lineWidth = 3 / Math.max(state.view.scale || 1, 0.01);
                const r = 24 / Math.max(state.view.scale || 1, 0.01);
                ctx.beginPath();
                ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(p1.x - r * 1.5, p1.y);
                ctx.lineTo(p1.x + r * 1.5, p1.y);
                ctx.moveTo(p1.x, p1.y - r * 1.5);
                ctx.lineTo(p1.x, p1.y + r * 1.5);
                ctx.stroke();
                ctx.font = `bold ${Math.round(16 / Math.max(state.view.scale || 1, 0.01))}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                ctx.fillStyle = '#ef4444';
                ctx.fillText('📍 기준점 1', p1.x + r + 4, p1.y - 4);
                ctx.restore();
            }
        }

        ctx.restore(); // Restore drawing rotation matrix

        ctx.restore(); // Restore view offset & scale

        scheduleFloorSnapshotCapture();
        syncMemberGbOverlay(window._bsaMemberGbEntries || []);
        window._bsaMemberGbEntries = null;
        syncDrawingMemoOverlay();
        syncGuideOverlay();
        syncStructLayer();

        // 결함 목록 DOM은 drawCanvas마다 재생성하지 않음 (선택 스크롤·하이라이트가 즉시 undo됨).
        // 목록 갱신은 updateMapSelectionBar / 필터 / 저장 등 명시적 호출에서만.
        updateMapZoomOverlay();
        updateFloorDrawingEmptyOverlay();
    }

    // --- 8-B. NON-DESTRUCTIVE TESTING (NDT) FIELD SURVEY ENGINE (v60.0) ---
    if (!state.ndtData) state.ndtData = {};
    if (!state.ndtImages) state.ndtImages = {};
    if (!state.ndtDisplacementGroups) state.ndtDisplacementGroups = {};
    let ndtMode = 'PAN';
    let currentNdtCategory = '실측';
    // 부재 실측(단면 규격)의 마감상태 기본 목록 — 사용자가 직접 추가한 항목은
    // state.customNdtFinishStates에 저장되어 이후 계속 노출된다.
    const NDT_FINISH_STATE_PRESET = ['노출', '몰탈마감', '석재마감', '타일마감', '기타'];
    // 부재 구분 기본 목록 — 직접 입력·추가 항목은 state.customNdtComponents에 저장
    const NDT_COMPONENT_PRESET = [
        // 2026-09-28 큰보→보(G), 작은보→보(B), 철골거더→철골보(G), 철골빔→철골보(B)
        '기둥', '원형기둥', '철골기둥', 'SRC기둥', '보(G)',
        '보(B)', '철골보(G)', '철골보(B)', '캔틸레버보',
        '슬래브', '데크슬래브', 'RC벽체', '조적벽체'
    ];
    let ndtView = { offsetX: 0, offsetY: 0, scale: 1.0 };
    let ndtRotationAngle = 0;
    let ndtBgImage = null;
    let isNdtDragging = false;
    let ndtTouchMayPageScroll = false; // 레거시 플래그(도면 팬으로 통일, 페이지 스크롤 위임 안 함)
    let ndtTouchStartedOnCanvas = false; // 도면에서 시작한 터치만 스크롤 잠금(preventDefault)
    let isNdtMarkingDrag = false;
    let isDraggingNdtDisplacement = false;
    let activeDragNdtDisplacementGroup = null;
    let activeDragNdtDisplacementPoint = null;
    let pendingNdtDispHit = null;
    let pendingNdtDispArmed = false;
    let pendingNdtDispIsTouch = false;
    let isNdtDisplacementMarking = false;
    let ndtGestureCancelledByPinch = false;
    let ndtDispMarkUndoStack = []; // 부동침하·부재변위 마킹 한 개씩 되돌리기
    let isNdtPinching = false;
    let ndtPinchDist = 0;
    let ndtPinchScale = 1.0;
    let ndtPinchMidX = 0;
    let ndtPinchMidY = 0;
    let ndtPinchOffsetX = 0;
    let ndtPinchOffsetY = 0;
    let ndtStartMouseX = 0;
    let ndtStartMouseY = 0;
    let ndtInitialOffsetX = 0;
    let ndtInitialOffsetY = 0;

    let isDraggingNdtPin = false;
    let activeDragNdtPin = null;
    let dragNdtPart = 'box';
    let ndtPinDragOffsetX = 0;
    let ndtPinDragOffsetY = 0;
    let ndtTiltRotatePivot = null;
    let ndtTiltRotateStartMouse = 0;
    let ndtTiltRotateBaseAngle = 0;
    let ndtDispDragOffsetX = 0;
    let ndtDispDragOffsetY = 0;
    let pendingNdtPinHit = null; // 클릭=수정창 / 드래그=이동 구분
    let pendingNdtCrackDefectHit = null; // 균열모니터: 결함 핀 클릭 → 작성 팝업
    let pendingNdtPinArmed = false;
    let pendingNdtPinIsTouch = false;
    let pendingNdtLongPressTimer = null;
    let ndtActivePointerIsTouch = false;
    let ndtMarqueeSelectEnabled = false;
    let ndtAddSelectEnabled = false;
    // 2026-10-20 결함위치도와 같게: 0.3초 꾹 누른 뒤 끌면 이동(예전 0.5초). PC 마우스는 그대로.
    const NDT_TOUCH_LONG_PRESS_MS = 300;
    let isDraggingNdtPinGroup = false;
    let ndtGroupDragLastX = 0;
    let ndtGroupDragLastY = 0;
    let isNdtMarqueeSelecting = false;
    let ndtMarqueeAdditive = false;
    let ndtMarqueeStartX = 0;
    let ndtMarqueeStartY = 0;
    let ndtMarqueeCurX = 0;
    let ndtMarqueeCurY = 0;
    let ndtMarqueeStartClientX = 0;
    let ndtMarqueeStartClientY = 0;
    let ndtSuppressMouseUntil = 0; // 터치 후 합성 mouse 이벤트로 마퀴/오선택 방지
    let selectedNdtIds = new Set(); // pin id 또는 disp_<groupId>
    window.getSelectedNdtIds = () => selectedNdtIds;

    function ndtDispSelKey(groupId) {
        return `disp_${groupId}`;
    }

    /**
     * 2026-10-20 비파괴 도면 터치 탭 — 결함위치도와 같은 규칙.
     * 'open' = 이미 선택된 것을 다시 탭 → 수정창 / 'select' = 처음 탭 → 선택만 / 'toggle' = 추가 선택 모드 /
     * 'none' = 0.3초 이상 꾹 눌렀다 그냥 뗌(이동 준비만, 탭 아님)
     */
    function ndtTouchTapAction(pend, armed, addMode) {
        if (!pend) return 'none';
        if (armed) return 'none';
        if (addMode) return 'toggle';
        return pend.wasSelected ? 'open' : 'select';
    }
    window.__bsaNdtTouchTapAction = ndtTouchTapAction;

    function applyNdtTouchTapSelection(act, key) {
        if (!key) return;
        if (act === 'toggle') {
            if (selectedNdtIds.has(key)) selectedNdtIds.delete(key);
            else selectedNdtIds.add(key);
        } else if (act === 'select' || act === 'open') {
            if (!selectedNdtIds.has(key) || selectedNdtIds.size > 1) selectedNdtIds = new Set([key]);
        } else {
            return;
        }
        updateNdtSelectionBar();
        drawNdtCanvas();
    }

    function clearPendingNdtLongPress() {
        if (pendingNdtLongPressTimer) {
            clearTimeout(pendingNdtLongPressTimer);
            pendingNdtLongPressTimer = null;
        }
        pendingNdtPinArmed = false;
        pendingNdtDispArmed = false;
    }

    /** 두 손가락 핀치가 시작되면 진행 중이던 마킹·드래그 예약을 모두 무효화 */
    function cancelNdtGestureForPinch() {
        ndtGestureCancelledByPinch = true;
        isNdtDisplacementMarking = false;
        window._ndtDispMarkCoords = null;
        isNdtMarkingDrag = false;
        window._ndtMarkStartCoords = null;
        window._ndtMarkCurrentCoords = null;
        clearPendingNdtLongPress();
        pendingNdtPinHit = null;
        pendingNdtCrackDefectHit = null;
        pendingNdtDispHit = null;
        pendingNdtDispIsTouch = false;
        isDraggingNdtDisplacement = false;
        activeDragNdtDisplacementGroup = null;
        activeDragNdtDisplacementPoint = null;
        if (activeDragNdtPin) touchMovedNdtItems(activeDragNdtPin);   // 끌어 옮긴 위치가 다른 기기의 옛 위치에 지지 않게
        isDraggingNdtPin = false;
        activeDragNdtPin = null;
        dragNdtPart = 'box';
        endNdtTiltRotateSession();
        isDraggingNdtPinGroup = false;
        isNdtMarqueeSelecting = false;
        isNdtDragging = false;
        hideTouchLoupe(NDT_LOUPE_ID);
    }

    function syncNdtDispUndoButton() {
        const show = (currentNdtCategory === '변위' || currentNdtCategory === '부재변위')
            && ndtDispMarkUndoStack.length > 0;
        ['btnNdtUndoDispMark', 'mobileNdtBtnUndoDisp'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.hidden = !show;
            el.disabled = !show;
        });
        const fab = document.getElementById('mobileNdtFabBar');
        if (fab) fab.classList.toggle('has-disp-undo', show);
    }

    function recordNdtDispMarkUndo(entry) {
        if (!entry || !entry.key || !entry.groupId || !entry.pointId) return;
        ndtDispMarkUndoStack.push(entry);
        if (ndtDispMarkUndoStack.length > 40) ndtDispMarkUndoStack.shift();
        syncNdtDispUndoButton();
    }

    function undoLastNdtDisplacementMark() {
        const entry = ndtDispMarkUndoStack.pop();
        syncNdtDispUndoButton();
        if (!entry) {
            window.showToast('되돌릴 마킹이 없습니다.', 'info', 2000);
            return false;
        }
        if (!state.ndtDisplacementGroups) state.ndtDisplacementGroups = {};
        const groups = state.ndtDisplacementGroups[entry.key] || [];
        const gi = groups.findIndex((g) => g && g.id === entry.groupId);
        if (gi < 0) {
            window.showToast('되돌릴 마킹을 찾지 못했습니다.', 'warning', 2200);
            return false;
        }
        const group = groups[gi];
        // 이미 동기화된 구역일 수 있다 — 지우면 묘비, 지점만 빼면 시각을 올려야 서버의 옛 구역이 이기지 않는다
        const removeGroup = () => {
            groups.splice(gi, 1);
            trackNdtDeletion(entry.key, entry.groupId, group);
            if (getActiveNdtDispGroup() && getActiveNdtDispGroup().id === entry.groupId) {
                setActiveNdtDispGroup(null);
            }
        };
        if (entry.createdGroup) {
            removeGroup();
        } else {
            group.points = (group.points || []).filter((p) => p && p.id !== entry.pointId);
            if (!group.points.length) removeGroup();
            else group.updatedAt = Date.now();
        }
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(entry.key);
        const selKey = ndtDispSelKey(entry.groupId);
        if (selectedNdtIds.has(selKey) && !groups.some((g) => g && g.id === entry.groupId)) {
            selectedNdtIds.delete(selKey);
            updateNdtSelectionBar();
        }
        saveStateToLocalStorage();
        drawNdtCanvas();
        renderNdtSummaryTable();
        window.showToast('마지막 마킹을 되돌렸습니다.', 'success', 2000);
        return true;
    }
    window.undoLastNdtDisplacementMark = undoLastNdtDisplacementMark;

    function pruneSelectedNdtIds() {
        if (!selectedNdtIds.size) return 0;
        const pinIds = new Set(getCurrentFloorNdtData().map(x => x && x.id).filter(Boolean));
        const key = state.currentBuildingId ? `${state.currentBuildingId}_${state.currentFloor}` : '';
        const groups = (key && state.ndtDisplacementGroups && state.ndtDisplacementGroups[key]) || [];
        const dispKeys = new Set(groups.map(g => g && g.id).filter(Boolean).map(id => `disp_${id}`));
        const next = new Set();
        selectedNdtIds.forEach((id) => {
            const s = String(id);
            if (s.startsWith('disp_')) {
                if (dispKeys.has(s)) next.add(s);
            } else if (pinIds.has(id)) {
                next.add(id);
            }
        });
        selectedNdtIds = next;
        return selectedNdtIds.size;
    }

    function isNdtDrawingTouchTarget(target) {
        if (!target || typeof target.closest !== 'function') return false;
        return !!target.closest('#ndtCanvasContainer, #ndtCanvas');
    }

    function releaseNdtScrollLockFromOutsideTouch() {
        ndtTouchStartedOnCanvas = false;
        ndtTouchMayPageScroll = false;
        isNdtDragging = false;
        isNdtPinching = false;
        isNdtMarkingDrag = false;
        isNdtDisplacementMarking = false;
        isNdtMarqueeSelecting = false;
        // 진행 중 핀 드래그는 유지하지 않음 — 도면 밖 터치면 페이지 스크롤 우선
        if (!isDraggingNdtPin && !isDraggingNdtPinGroup && !isDraggingNdtDisplacement) {
            pendingNdtPinHit = null;
            pendingNdtDispHit = null;
            clearPendingNdtLongPress();
        }
        document.body.classList.remove('dragging-pin');
        document.body.style.touchAction = '';
    }

    function ndtClientToImg(clientX, clientY) {
        const canvas = document.getElementById('ndtCanvas');
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const rawVx = (mouseX - ndtView.offsetX) / ndtView.scale;
        const rawVy = (mouseY - ndtView.offsetY) / ndtView.scale;
        return viewToNdtImgCoords(rawVx, rawVy);
    }

    function updateNdtSelectionBar() {
        const bar = document.getElementById('ndtSelectionBar');
        const countEl = document.getElementById('ndtSelectionCount');
        if (!bar) return;
        const n = pruneSelectedNdtIds();
        if (n === 0) {
            bar.hidden = true;
        } else {
            bar.hidden = false;
            if (countEl) countEl.textContent = `${n}개 선택`;
        }
        syncNdtTiltRotateButtons();
    }

    function syncNdtTiltRotateButtons() {
        // 90° 버튼 대신 선택 박스 위 회전 핸들(드래그) 사용
        ['btnRotateSelectedNdtTilt', 'mobileNdtBtnRotateTilt'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.hidden = true;
        });
        const fab = document.getElementById('mobileNdtFabBar');
        if (fab) fab.classList.remove('has-tilt-rotate');
    }

    function getVisibleNdtPinsForSelect() {
        let items = getCurrentFloorNdtData();
        const currentCat = currentNdtCategory || '실측';
        if (currentCat === '기울기') return items.filter(item => item.category === currentCat);
        if (currentCat === '변위' || currentCat === '부재변위') return [];
        if (currentCat === '실측') return items.filter(item => item.category === '실측');
        if (currentCat === '내화피복') return items.filter(item => item.category === '내화피복');
        if (currentCat === '균열모니터') return items.filter(isCrackGaugeNdtItem);
        return items.filter(item => ['강도', '탄산화'].includes(item.category));
    }

    function collectNdtMarqueeHits(x1, y1, x2, y2) {
        const hits = [];
        getVisibleNdtPinsForSelect().forEach((item) => {
            if (!item || !item.id) return;
            const bx = item.boxX !== undefined ? item.boxX : (item.x || 0);
            const by = item.boxY !== undefined ? item.boxY : (item.y || 0);
            const tx = item.targetX !== undefined ? item.targetX : (item.x || bx);
            const ty = item.targetY !== undefined ? item.targetY : (item.y || by);
            if ((bx >= x1 && bx <= x2 && by >= y1 && by <= y2)
                || (tx >= x1 && tx <= x2 && ty >= y1 && ty <= y2)) {
                hits.push(item.id);
            }
        });
        if (currentNdtCategory === '변위' || currentNdtCategory === '부재변위') {
            getCurrentFloorDisplacementGroups(currentNdtCategory).forEach((g) => {
                if (!g || !g.id) return;
                const bx = g.boxX !== undefined ? g.boxX : (g.points?.[0]?.x || 0);
                const by = g.boxY !== undefined ? g.boxY : (g.points?.[0]?.y || 0);
                let hit = (bx >= x1 && bx <= x2 && by >= y1 && by <= y2);
                if (!hit && Array.isArray(g.points)) {
                    hit = g.points.some(p => p && p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2);
                }
                if (hit) hits.push(ndtDispSelKey(g.id));
            });
        }
        return hits;
    }

    function translateNdtPinBy(item, dx, dy) {
        if (!item || (!dx && !dy)) return;
        if (typeof item.x === 'number') item.x += dx;
        if (typeof item.y === 'number') item.y += dy;
        if (item.boxX !== undefined) item.boxX = Number(item.boxX) + dx;
        if (item.boxY !== undefined) item.boxY = Number(item.boxY) + dy;
        if (item.targetX !== undefined) item.targetX = Number(item.targetX) + dx;
        if (item.targetY !== undefined) item.targetY = Number(item.targetY) + dy;
    }

    function translateNdtDispGroupBy(group, dx, dy) {
        if (!group || (!dx && !dy)) return;
        if (typeof group.boxX === 'number') group.boxX += dx;
        if (typeof group.boxY === 'number') group.boxY += dy;
        (group.points || []).forEach((p) => {
            if (!p) return;
            if (typeof p.x === 'number') p.x += dx;
            if (typeof p.y === 'number') p.y += dy;
        });
    }

    async function deleteSelectedNdtMarks() {
        pruneSelectedNdtIds();
        const ids = [...selectedNdtIds];
        if (!ids.length || !state.currentBuildingId) {
            updateNdtSelectionBar();
            if (typeof window.showToast === 'function') {
                window.showToast('삭제할 마킹이 선택되지 않았습니다.', 'info');
            }
            return;
        }
        if (!await window.confirmDelete(`선택한 비파괴 마킹 ${ids.length}건을 삭제할까요?`)) return;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const pinIds = ids.filter(id => !String(id).startsWith('disp_'));
        const dispIds = ids.filter(id => String(id).startsWith('disp_')).map(id => id.slice(5));

        // 지운 항목·구역의 사진(측정지·현장) 클라우드 정리 — 한 건씩 지울 때와 같게, 이 기기 사본은 남긴다
        const removedRecs = [];
        if (pinIds.length) {
            if (!state.ndtData[key]) state.ndtData[key] = [];
            pinIds.forEach((id) => trackNdtDeletion(key, id));
            state.ndtData[key].forEach((x) => { if (pinIds.includes(x.id)) removedRecs.push(x); });
            state.ndtData[key] = state.ndtData[key].filter(x => !pinIds.includes(x.id));
        }
        if (dispIds.length) {
            if (!state.ndtDisplacementGroups[key]) state.ndtDisplacementGroups[key] = [];
            dispIds.forEach((id) => trackNdtDeletion(key, id));
            state.ndtDisplacementGroups[key].forEach((g) => { if (dispIds.includes(g.id)) removedRecs.push(g); });
            state.ndtDisplacementGroups[key] = state.ndtDisplacementGroups[key].filter(g => !dispIds.includes(g.id));
            if (window._activeNdtDispGroupId && dispIds.includes(window._activeNdtDispGroupId)) {
                setActiveNdtDispGroup(null);
            }
        }
        releaseStrengthPhotosOfItems(state.currentBuildingId, removedRecs, { keepLocal: true, deferCloudFloorKey: key });
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        selectedNdtIds.clear();
        updateNdtSelectionBar();
        saveStateToLocalStorage();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        drawNdtCanvas();
        if (typeof window.showToast === 'function') window.showToast(`${ids.length}건 삭제됨`, 'success');
    }
    window.deleteSelectedNdtMarks = deleteSelectedNdtMarks;

    function formatHeightValue(val) {
        if (val == null) return '';
        const strVal = String(val).trim();
        if (!strVal) return '';
        const digits = strVal.replace(/[^0-9.]/g, '');
        if (digits) {
            let num = parseFloat(digits);
            // "42.5m"처럼 단위를 m로 적었으면 mm로 환산한다(mm는 그대로). 단위 없는 숫자는 mm로 본다.
            if (!isNaN(num) && /\d\s*m(?![a-z])/i.test(strVal)) num = Math.round(num * 1000 * 1000) / 1000;
            if (!isNaN(num)) {
                const prefix = /L\s*=/i.test(strVal) ? 'L' : 'H';
                return `${prefix} = ${num.toLocaleString()}mm`;
            }
        }
        return strVal;
    }

    /** 터치 화살표(TIP) 히트 반경 — 그려진 화살표 크기(arrowScale)와 동일 비율 */
    function getArrowVisualTipRadius(arrowScale, dragged) {
        const s = Math.max(Number(arrowScale) || 1, 0.2);
        if (state.tipShape === 'circle') {
            return (dragged ? 6 : 4.5) * s;
        }
        const headLen = (dragged ? 13 : 10) * s;
        return headLen * 0.42;
    }

    /** 화살표 한 변/지름 기준 크기(도면 좌표 px) — 터치 박스 지름 = 2 × 이 값 */
    function getArrowTouchCharacteristicSize(arrowScale) {
        const s = Math.max(Number(arrowScale) || 1, 0.2);
        if (state.tipShape === 'circle') {
            return (4.5 * 2) * s;
        }
        return 10 * s;
    }

    function getMapCanvasViewScale() {
        const raw = (state.currentTab === 'tab-ndt')
            ? (typeof ndtView !== 'undefined' && ndtView ? ndtView.scale : 1)
            : (state.view ? state.view.scale : 1);
        return Math.max(Number(raw) || 1, 0.05);
    }

    /** 터치·조작 UI: 화면(CSS) px 기준 최소 지름 — 줌 배율과 무관하게 손가락 크기 확보 */
    const MAP_TIP_MIN_TOUCH_DIAMETER_CSS = 52;

    /** 스타일러스(펜) 최소 지름 — 마우스(눈에 보이는 화살촉 크기)보다 크고 손가락(52px)보다 작게 */
    const MAP_TIP_MIN_PEN_DIAMETER_CSS = 40;

    /**
     * 화살촉 판정 반경(이미지 좌표). pointerKind: 'mouse' | 'pen' | 'touch' (생략하면 isTouch로 추정)
     * 크기 순서: 마우스(화살촉 실제 반경+1) ≤ 펜(화면 지름 40px) ≤ 손가락(화면 지름 52px)
     */
    function getMapTipHitRadius(arrowScale, isTouch, pointerKind) {
        const kind = pointerKind || (isTouch ? 'touch' : 'mouse');
        const visualR = getArrowVisualTipRadius(arrowScale, false);
        const coarse = isTouch || kind === 'pen' || kind === 'touch'
            || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        if (!coarse) return visualR + 1;
        const arrowR = getArrowTouchCharacteristicSize(arrowScale);
        const viewScale = getMapCanvasViewScale();
        const fingerR = Math.max(arrowR, (MAP_TIP_MIN_TOUCH_DIAMETER_CSS / 2) / viewScale);
        if (kind === 'pen') {
            const penR = Math.max(visualR + 1, (MAP_TIP_MIN_PEN_DIAMETER_CSS / 2) / viewScale);
            return Math.min(fingerR, penR);
        }
        return fingerR;
    }

    /** 삼각 화살촉: 세모 무게중심. 원형 화살촉: target(측정점) 그대로 */
    function getMapArrowTipHitCenter(targetX, targetY, fromX, fromY, arrowScale) {
        if (state.tipShape === 'circle') {
            return { x: targetX, y: targetY };
        }
        const s = Math.max(Number(arrowScale) || 1, 0.2);
        const headLen = 10 * s;
        const dx = targetX - fromX;
        const dy = targetY - fromY;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-6) return { x: targetX, y: targetY };
        const back = headLen / Math.sqrt(3);
        return {
            x: targetX - (dx / dist) * back,
            y: targetY - (dy / dist) * back
        };
    }

    function findNdtPinAt(vx, vy) {
        const currentCat = currentNdtCategory || '실측';
        // 수직변위 및 부재변위는 별도 전용 데이터(ndtDisplacementGroups)를 사용하므로 findNdtDisplacementHit에서 전담
        if (currentCat === '변위' || currentCat === '부재변위') {
            return null;
        }

        const items = getCurrentFloorNdtData();
        let filtered = [];
        if (currentCat === '기울기') {
            filtered = items.filter(item => item.category === '기울기');
        } else if (currentCat === '실측') {
            filtered = items.filter(item => item.category === '실측');
        } else if (currentCat === '내화피복') {
            filtered = items.filter(item => item.category === '내화피복');
        } else if (currentCat === '균열모니터') {
            // 도면에 직접 찍은 균열 게이지 마킹만 (기존 균열 결함 연결분은 결함 핀 히트로 따로 처리)
            filtered = items.filter(isCrackGaugeNdtItem);
        } else {
            // 강도 / 탄산화 탭: 같은 도면에 함께 표시되는 항목만 히트테스트 (타 카테고리 간섭 배제)
            filtered = items.filter(item => item.category === '강도' || item.category === '탄산화');
        }

        const measureCtx = state.ctx || null;
        // 2026-10-21 점·박스 후보를 모두 모은 뒤 pickBoxFirst로 고름(박스 먼저, 고른 마킹 먼저)
        const ndtHitCands = [];

        for (let i = filtered.length - 1; i >= 0; i--) {
            const item = filtered[i];
            const cat = item.category || '강도';
            const ndtStyleKey = getNdtStyleKey(cat);
            const itemSize = getStyleSize(ndtStyleKey);
            const pinScale = itemSize.pin;
            const arrowScale = itemSize.arrow;
            const baseBoxX = item.boxX !== undefined ? item.boxX : (item.x || 100);
            const baseBoxY = item.boxY !== undefined ? item.boxY : (item.y || 100);
            let targetX = item.targetX !== undefined ? item.targetX : (item.x || baseBoxX);
            let targetY = item.targetY !== undefined ? item.targetY : (item.y || baseBoxY);
            if (cat === '기울기') {
                const geom = getNdtTiltArrowGeometry(item, cat);
                targetX = geom.tip.x;
                targetY = geom.tip.y;
            }

            if (cat === '기울기' && item.id && selectedNdtIds.has(item.id) && isNearNdtTiltRotateHandle(item, cat, vx, vy)) {
                return { item, part: 'rotate' };
            }

            let noStr = item.no || 'NO.01';
            if (noStr.startsWith('기울기-') || noStr.startsWith('NDT-') || noStr.startsWith('변위-')) {
                const numPart = noStr.replace(/^[^\d]+/, '');
                noStr = `NO.${numPart.length === 1 ? '0' + numPart : numPart}`;
            }
            noStr = formatPinNumberLabel(noStr, ndtStyleKey);

            // NDT 측정점(원 또는 화살표) 히트 판정
            // 강도·탄산화·내화피복은 원(circle) 끝점을 사용하거나 tipShape 설정에 따름
            const isCircleTip = (cat === '강도' || cat === '탄산화' || cat === '내화피복' || state.tipShape === 'circle');
            const viewScale = getMapCanvasViewScale();
            const minMouseRadiusImg = 18 / viewScale; // 마우스 조작 시 화면상 최소 18px 반경 (지름 36px 클릭 영역 확보)

            let distTarget = Infinity;
            let tipHitRadius = 0;

            if (isCircleTip) {
                // 원형 측정점: 도면에 실제 그려진 원의 중심(targetX, targetY)을 정확히 기준점으로 판정
                const circleR = (cat === '강도' || cat === '탄산화' ? 4 : 4.5) * arrowScale;
                distTarget = Math.hypot(vx - targetX, vy - targetY);
                tipHitRadius = ndtActivePointerIsTouch
                    ? getMapTipHitRadius(arrowScale, true)
                    : Math.max(circleR * 2.5, minMouseRadiusImg);
            } else {
                // 화살표 측정점(기울기, 실측 화살표 등):
                // 화살촉 꼭짓점(targetX, targetY)과 화살촉 중심부(tipHit) 모두 커버하여 화살표 끝/머리 어디를 잡아도 자연스럽게 드래그
                const headLen = (cat === '기울기' ? 15 : 10) * arrowScale;
                const tipHit = getMapArrowTipHitCenter(targetX, targetY, baseBoxX, baseBoxY, arrowScale);
                const distToTip = Math.hypot(vx - targetX, vy - targetY);
                const distToBody = Math.hypot(vx - tipHit.x, vy - tipHit.y);
                distTarget = Math.min(distToTip, distToBody);

                const visualArrowR = headLen * 0.5;
                tipHitRadius = ndtActivePointerIsTouch
                    ? getMapTipHitRadius(arrowScale, true)
                    : Math.max(visualArrowR + 3, minMouseRadiusImg);
            }

            const ndtCand = { key: item.id, item, box: false, tipDist: distTarget <= tipHitRadius ? distTarget : Infinity };

            let boxW;
            let boxH;
            let boxX = baseBoxX;
            let boxY = baseBoxY;
            let hitRotation = ndtRotationAngle || 0;
            if (cat === '기울기') {
                boxW = 168 * pinScale;
                boxH = 44 * pinScale;
                hitRotation -= getNdtTiltItemRotation(item, cat);
            } else if (cat === '강도' || cat === '탄산화') {
                const typeLabel = getNdtStrengthCarbTypeLabel(cat);
                const dims = measureNdtTypeCalloutDimensions(measureCtx, noStr, typeLabel, pinScale);
                boxW = dims.boxW;
                boxH = dims.boxH;
            } else {
                const boxDim = measurePinBoxDimensions(measureCtx, noStr, pinScale, 1, itemSize.font);
                boxW = boxDim.w;
                boxH = boxDim.h;
            }

            ndtCand.box = isPointInsideMarkBox(vx, vy, boxX, boxY, boxW, boxH, hitRotation);
            if (ndtCand.box || Number.isFinite(ndtCand.tipDist)) ndtHitCands.push(ndtCand);
        }
        // 2026-10-21 비파괴도: 점과 박스가 겹치면 PC·터치 모두 박스 먼저(점은 그대로, 박스만 끌림).
        //  박스 밖에서 점을 누르면 점을 잡는다. 고른 마킹이 먼저(그 안에서도 박스 먼저).
        const pick = pickNdtBoxFirst(ndtHitCands);
        if (!pick) return null;
        const pc = ndtHitCands[pick.index];
        return pick.part === 'box' ? { item: pc.item, part: 'box' } : { item: pc.item, part: 'target' };
    }

    function pickNdtBoxFirst(cands) {
        const SH = window.BSA && window.BSA.selectedHit;
        const isSel = (k) => !!(k && selectedNdtIds && selectedNdtIds.has(k));
        if (SH && typeof SH.pickBoxFirst === 'function') return SH.pickBoxFirst(cands, isSel);
        const bi = cands.findIndex((c) => c.box);
        if (bi >= 0) return { index: bi, part: 'box' };
        const ti = cands.findIndex((c) => Number.isFinite(c.tipDist));
        return ti >= 0 ? { index: ti, part: 'tip' } : null;
    }

    function getCurrentFloorNdtData() {
        if (!state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtData) state.ndtData = {};
        if (!state.ndtData[key]) state.ndtData[key] = [];
        return state.ndtData[key];
    }

    function floorHasNdtPayload(buildingId, floorCode) {
        if (!buildingId || !floorCode) return false;
        const key = `${buildingId}_${floorCode}`;
        if (state.ndtData && Array.isArray(state.ndtData[key]) && state.ndtData[key].length) return true;
        if (state.ndtDisplacementGroups && Array.isArray(state.ndtDisplacementGroups[key]) && state.ndtDisplacementGroups[key].length) return true;
        if (state.ndtImages && state.ndtImages[key]) return true;
        const ref = ndtDrawingRefFor(key);
        if (ref && ref.id) return true;
        return false;
    }

    // 점검층 드롭다운(getBuildingAvailableFloors)과 같이, floorsList에 없는 추가 도면 층
    // (캣워크 등)과 ndtData/변위 맵에만 있는 층도 포함한다. floorsList만 보면 지상1층만 나온다.
    // 도면을 지운 층이어도 부재실측 등 비파괴 데이터가 있으면 보고서에서 빼지 않는다.
    function listNdtFloorCodesForBuilding(buildingId) {
        const bldg = (state.buildings || []).find((b) => b && b.id === buildingId) || null;
        const seen = new Set();
        const out = [];
        const fi = window.BSA && window.BSA.floorIdentity;
        const refsWithDrawing = {};
        Object.keys(state.ndtDrawingRefs || {}).forEach((k) => {
            if (state.ndtDrawingRefs[k] && state.ndtDrawingRefs[k].id) refsWithDrawing[k] = true;
        });
        const extraMaps = [state.ndtData, state.ndtDisplacementGroups, state.ndtImages, refsWithDrawing];
        const add = (fc) => {
            if (!fc) return;
            const code = String(fc);
            if (seen.has(code)) return;
            const deleted = !!(bldg && typeof isDeletedDrawingFloor === 'function' && isDeletedDrawingFloor(bldg, code));
            const hasNdt = floorHasNdtPayload(buildingId, code);
            const keep = (fi && typeof fi.keepNdtFloorCode === 'function')
                ? fi.keepNdtFloorCode(code, deleted, hasNdt)
                : (hasNdt || !deleted);
            if (!keep) return;
            seen.add(code);
            out.push(code);
        };
        if (bldg && typeof window.getBuildingAvailableFloors === 'function') {
            (window.getBuildingAvailableFloors(bldg) || []).forEach((f) => add(f && (f.floorCode || f)));
        } else if (bldg && Array.isArray(bldg.floorsList)) {
            bldg.floorsList.forEach((f) => add(f && f.floorCode));
        }
        if (fi && typeof fi.listFloorCodesForNdtReport === 'function') {
            fi.listFloorCodesForNdtReport(bldg || { id: buildingId }, extraMaps).forEach(add);
        } else {
            const prefix = `${buildingId}_`;
            extraMaps.forEach((map) => {
                Object.keys(map || {}).forEach((k) => {
                    if (k.startsWith(prefix)) add(k.slice(prefix.length));
                });
            });
        }
        if (fi && typeof fi.listNdtPayloadFloorCodes === 'function') {
            fi.listNdtPayloadFloorCodes(buildingId, extraMaps).forEach(add);
        }
        return out;
    }
    window.listNdtFloorCodesForBuilding = listNdtFloorCodesForBuilding;

    // 비파괴조사 NO.는 층별이 아니라 건물 전체(카테고리별)로 이어지게 한다 — 1층에서
    // NO.06까지 썼으면 5층은 NO.07부터 시작해야 해서, 번호 매길 땐 현재 층뿐 아니라
    // 이 건물의 모든 층 항목을 모아서 세야 한다. floorsList 순서대로 모아서, 결과표를
    // 합칠 때도(건물 전체 결과표) 같은 순서를 쓸 수 있게 한다.
    function getAllFloorsNdtData(buildingId) {
        if (!buildingId || !state.ndtData) return [];
        const floorCodes = listNdtFloorCodesForBuilding(buildingId);
        const seen = new Set();
        const out = [];
        floorCodes.forEach(fc => {
            if (seen.has(fc)) return;
            seen.add(fc);
            const arr = state.ndtData[`${buildingId}_${fc}`];
            if (Array.isArray(arr)) out.push(...arr);
        });
        return out;
    }

    // 비파괴조사 결과표(보고서/HWPX)를 건물 전체로 합칠 때 쓰는 공용 헬퍼. 항목을 복제해서
    // 위치(location) 앞에 층 이름을 붙인다 — 여러 층이 한 표에 섞이면 어느 층 건지 구분이
    // 안 되기 때문(결함위치도의 buildCombinedExteriorSurveyDefects와 같은 패턴). 위치도(도면
    // 이미지)는 이 함수가 건드리지 않는다 — 표(데이터 목록)만 합치고, 위치도는 호출부에서
    // 기존 방식(현재 보고 있는 층 등) 그대로 쓴다.
    function buildCombinedNdtDataForReport(buildingId, bldgForLabel) {
        if (!buildingId) return { allItems: [], allDispGroups: [] };
        const floorCodes = listNdtFloorCodesForBuilding(buildingId);
        const allItems = [];
        const allDispGroups = [];
        // 같은 번호(id)는 보고서에 한 번만 넣는다. 층 섞임 사고로 같은 항목이 두 층에
        // 들어가 있으면(2026-09-21 지상1층 비파괴가 「지하1층 주차장-2」에 복사된 건)
        // 결과표에 같은 측정이 두 번 나온다. 데이터를 고치는 게 먼저지만(cleanDuplicateNdt),
        // 보고서가 조용히 두 배로 나가는 것은 막는다.
        const health = (window.BSA && window.BSA.dataHealth) || null;
        const pick = (map) => (health && typeof health.collectFirstByIdAcrossFloors === 'function')
            ? health.collectFirstByIdAcrossFloors(map, buildingId, floorCodes)
            : { kept: [], duplicates: [] };
        const labelCache = new Map();
        const labelOf = (fc) => {
            if (!labelCache.has(fc)) {
                labelCache.set(fc, stripFloorCodeSuffix(window.getFloorLabelFromCode(fc, bldgForLabel)));
            }
            return labelCache.get(fc);
        };

        const itemsPicked = pick(state.ndtData);
        itemsPicked.kept.forEach(({ floorCode, record }) => {
            const floorLabel = labelOf(floorCode);
            allItems.push(Object.assign({}, record, {
                location: record.location ? `${floorLabel} ${record.location}` : floorLabel,
                _ndtFloorCode: floorCode,
                _ndtFloorLabel: floorLabel
            }));
        });

        const groupsPicked = pick(state.ndtDisplacementGroups);
        groupsPicked.kept.forEach(({ floorCode, record }) => {
            allDispGroups.push(Object.assign({}, record, {
                _ndtFloorCode: floorCode,
                _ndtFloorLabel: labelOf(floorCode)
            }));
        });

        const dupes = itemsPicked.duplicates.concat(groupsPicked.duplicates);
        if (dupes.length) {
            console.warn('[비파괴] 같은 번호가 여러 층에 있어 보고서에는 한 번만 넣었습니다 ('
                + dupes.length + '건). cleanDuplicateNdt()로 정리하세요.\n'
                + dupes.map((d) => `${d.id}: ${d.firstFloorCode} / ${d.floorCode}`).join('\n'));
        }
        return { allItems, allDispGroups };
    }

    // --- 카테고리별 핀/박스 색상 커스터마이징 ---
    // 기본은 채널 0/255 순색. 예전에 저장해 둔 진한 기본값(#b30000 등)도 새 기본으로 본다.
    const DEFAULT_STYLE_COLORS = {
        defectStructural: '#ff0000',
        defectNonStructural: '#0000ff',
        defectFinish: '#ffff00',
        defectStructuralGood: '#00ff00',
        defectNonStructuralGood: '#00ff00',
        defectFinishGood: '#00ff00',
        defectBad: '#ff0000',
        defectGood: '#0000ff',
        defectNewGrade3: '#0000ff',
        defectExistingGrade3: '#ff0000',
        defectGoodGrade3: '#000000',
        priorityManage: '#00ff00',
        drawingMemo: '#000000',
        guideColumn: '#e11d48',
        guideGirder: '#7c3aed',
        guideBeam: '#0d9488',
        ndtMeasure: '#000000',
        ndtStrength: '#ff0000',
        ndtCarbonation: '#0000ff',
        ndtTilt: '#ff0000',
        ndtSettlement: '#ff00ff',
        ndtMemberDisp: '#00ff00',
        ndtFireproof: '#ffff00',
        ndtCrackGauge: '#ff6600'
    };
    const LEGACY_DEFAULT_STYLE_COLORS = {
        defectStructural: '#b30000',
        defectNonStructural: '#0040c0',
        defectFinish: '#c2410c',
        defectStructuralGood: '#15803d',
        defectNonStructuralGood: '#15803d',
        defectFinishGood: '#15803d',
        defectBad: '#b30000',
        defectGood: '#0040c0',
        defectNewGrade3: '#0040c0',
        defectExistingGrade3: '#b30000',
        defectGoodGrade3: '#000000',
        priorityManage: '#15803d',
        ndtMeasure: '#1f1f1f',
        ndtStrength: '#b30000',
        ndtCarbonation: '#0040c0',
        ndtTilt: '#b30000',
        ndtSettlement: '#7e22ce',
        ndtMemberDisp: '#15803d',
        ndtFireproof: '#c2410c'
    };

    function hexColorKey(c) {
        return String(c || '').trim().toLowerCase();
    }

    /** 순색(0/255) 기본 팔레트 버전 */
    const STYLE_COLORS_PALETTE_VERSION = 3;

    // 2026-09-18: 예전엔 여기서 state.styleColors를 통째로 비웠다. 구 탁한 기본값(#b30000 등)을
    // 순색으로 갈아끼우려던 일회성 조치였는데, 사용자가 직접 고른 색까지 같이 날아갔다.
    // 게다가 styleColorsPaletteVersion이 Firestore에 안 올라가서 다른 기기에서 받을 때마다
    // 버전 0으로 보여 이 함수가 계속 재발동했다 → "색을 바꿔도 자꾸 원래대로 돌아감".
    // 구 기본값 처리는 getStyleColor()가 읽는 시점에 이미 하고 있으므로(legacy → new 매핑)
    // 비우는 동작은 불필요하고 해롭기만 하다. 버전 도장만 찍는다.
    function migrateStyleColorsToPureDefaults() {
        if (state.styleColorsPaletteVersion === STYLE_COLORS_PALETTE_VERSION) return;
        state.styleColorsPaletteVersion = STYLE_COLORS_PALETTE_VERSION;
        if (typeof saveStateToLocalStorage === 'function') {
            try { saveStateToLocalStorage(); } catch (_e) { /* ignore */ }
        }
    }

    function getStyleColor(key) {
        migrateStyleColorsToPureDefaults();
        const next = DEFAULT_STYLE_COLORS[key];
        const custom = state.styleColors && state.styleColors[key];
        if (!custom) return next;
        const legacy = LEGACY_DEFAULT_STYLE_COLORS[key];
        if (legacy && hexColorKey(custom) === hexColorKey(legacy)) return next;
        return custom;
    }

    // 결함 종류 텍스트에 "상태양호"가 들어있으면 양호로 인식한다
    // (예: "접합부 상태양호", "단열재 상태양호"처럼 부재명과 붙여 쓴 경우도 포함)
    function isGoodDefectType(defectType) {
        // 2026-10-16 보수완료·보수됨·보수함 등도 상태양호와 똑같이(core/good-type.js)
        return (window.BsaGoodType ? window.BsaGoodType.isGoodDefectText(defectType) : String(defectType || '').includes('상태양호'));
    }

    // 결함(구조체/비구조체/마감재) 카테고리 → 스타일 설정 키 매핑 (색상/크기 공용)
    var DEFECT_CATEGORY_KNOWN = ['구조체', '비구조체', '마감재'];

    /** 화면 대분류. 알려진 값만, 아니면 미선택('') — `|| '구조체'`로 덮지 않는다 */
    function readDefectCategoryUi(raw) {
        const v = raw !== undefined ? raw : (document.getElementById('defectCategory')?.value);
        return DEFECT_CATEGORY_KNOWN.indexOf(v) >= 0 ? v : '';
    }

    /**
     * 저장된 결함 대분류.
     * 명시적 '' = 새 마킹 미선택(필터·출력에서 구조체로 취급하지 않음).
     * 필드 없음(옛 데이터) = 구조체. 기존 저장분을 다시 쓰지 않는다.
     */
    function resolveDefectCategory(cat) {
        if (cat === '') return '';
        if (DEFECT_CATEGORY_KNOWN.indexOf(cat) >= 0) return cat;
        return '구조체';
    }

    /** 그룹/템플릿 이어받기. 명시적 미선택은 유지, 없는 옛 마킹은 구조체 */
    function inheritDefectCategory(src) {
        if (!src) return '';
        if (src.category === '') return '';
        return resolveDefectCategory(src.category);
    }

    window.readDefectCategoryUi = readDefectCategoryUi;
    window.resolveDefectCategory = resolveDefectCategory;
    window.inheritDefectCategory = inheritDefectCategory;

    function getDefectStyleKey(category, defectType) {
        const isGood = isGoodDefectType(defectType);
        if (category === '비구조체') return isGood ? 'defectNonStructuralGood' : 'defectNonStructural';
        if (category === '마감재') return isGood ? 'defectFinishGood' : 'defectFinish';
        // 미선택·구조체·기타: 그리는 색만 구조체 스타일(분류를 저장하지는 않음)
        return isGood ? 'defectStructuralGood' : 'defectStructural';
    }

    // 결함 핀 색상 — 카테고리(구조체/비구조체/마감재)가 아니라 등급·상태 기준.
    // 중점관리(체크)=녹색 (등급 무관 최우선)
    // 1,2종: 결함=빨강, 상태양호=파랑
    // 3종: 상태양호=검정, 기존조사(전회차)=빨강, 신규조사=파랑
    // 2026-10-20 「중점관리 항목 체크 되어 있어도 보수 했으면 검정으로」
    // 보수됨 = 결함 종류가 보수완료·상태양호 같은 양호 글자이거나, 수정창에서 「보수완료 사진」을 고른 마킹.
    function getDefectRepairPhotoIndex(defect) {
        if (!defect) return -1;
        const photos = Array.isArray(defect.photos) ? defect.photos : [];
        if (defect.repairPhotoId && Array.isArray(defect.photoIds)) {
            const i = defect.photoIds.indexOf(defect.repairPhotoId);
            if (i >= 0 && (photos[i] || !photos.length)) return i;
        }
        const n = Number(defect.repairPhotoNo);
        if (Number.isInteger(n) && n >= 1 && (!photos.length || photos[n - 1])) return n - 1;
        return -1;
    }
    function getDefectRepairPhotoSrc(defect) {
        const i = getDefectRepairPhotoIndex(defect);
        if (i < 0) return '';
        return (Array.isArray(defect.photos) && defect.photos[i]) || '';
    }
    function isDefectRepaired(defect) {
        if (!defect) return false;
        if (isGoodDefectType(defect.defectType)) return true;
        return getDefectRepairPhotoIndex(defect) >= 0;
    }
    /** 중점관리인데 보수까지 끝난 마킹 — 녹색 대신 검정 */
    function isPriorityRepairedDefect(defect) {
        return !!(defect && defect.isPriorityManage && isDefectRepaired(defect));
    }
    const PRIORITY_REPAIRED_COLOR = '#000000';
    window.BSA = window.BSA || {};
    window.BSA.priorityRepair = { getDefectRepairPhotoIndex, getDefectRepairPhotoSrc, isDefectRepaired, isPriorityRepairedDefect };

    function getDefectColor(defect) {
        if (defect.isPriorityManage) return isDefectRepaired(defect) ? PRIORITY_REPAIRED_COLOR : getStyleColor('priorityManage');
        const isGood = isGoodDefectType(defect.defectType);
        if (isGrade3Building()) {
            if (isGood) return getStyleColor('defectGoodGrade3');
            return isPreviousRoundDefect(defect) ? getStyleColor('defectExistingGrade3') : getStyleColor('defectNewGrade3');
        }
        return isGood ? getStyleColor('defectGood') : getStyleColor('defectBad');
    }

    // --- 카테고리별 핀/화살표 크기 커스터마이징 ---
    const DEFAULT_STYLE_SIZES = {
        defectStructural: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        defectNonStructural: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        defectFinish: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        defectStructuralGood: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        defectNonStructuralGood: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        defectFinishGood: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtMeasure: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtStrength: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtCarbonation: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtTilt: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtSettlement: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtMemberDisp: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        ndtFireproof: { pin: 1.0, arrow: 1.0, leader: 1.0 },
        // 균열 게이지만 번호 글자 크기(font)를 따로 조절 — 다른 항목은 핀 크기에 따라감(font 1.0)
        ndtCrackGauge: { pin: 1.0, arrow: 1.0, leader: 1.0, font: 1.0 }
    };

    // 보고서 등 다른 층 렌더 시 해당 층 스타일을 쓰기 위한 임시 컨텍스트
    let _mapStyleRenderContext = null;

    function getFloorMapStyleKey(buildingId, floorCode) {
        const bId = buildingId || state.currentBuildingId || 'default';
        const fCode = floorCode || state.currentFloor || '1F';
        return `${bId}_${fCode}`;
    }

    function getFloorDrawingRotationKey(buildingId, floorCode) {
        return getFloorMapStyleKey(buildingId, floorCode);
    }

    function normalizeDrawingRotation(angle) {
        const n = Number(angle) || 0;
        return ((n % 360) + 360) % 360;
    }

    function getSavedFloorDrawingRotation(buildingId, floorCode) {
        const key = getFloorDrawingRotationKey(buildingId, floorCode);
        const map = state.floorDrawingRotations;
        if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return null;
        return normalizeDrawingRotation(map[key]);
    }

    function saveFloorDrawingRotation(buildingId, floorCode, angle, opts) {
        if (!buildingId || !floorCode) return;
        const norm = normalizeDrawingRotation(angle);
        if (!state.floorDrawingRotations) state.floorDrawingRotations = {};
        state.floorDrawingRotations[getFloorDrawingRotationKey(buildingId, floorCode)] = norm;
        state.rotationAngle = norm;
        if (!opts || opts.persist !== false) {
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        }
    }

    function clearFloorDrawingRotation(buildingId, floorCode) {
        if (!buildingId || !floorCode || !state.floorDrawingRotations) return;
        delete state.floorDrawingRotations[getFloorDrawingRotationKey(buildingId, floorCode)];
    }

    function resolveFloorDrawingRotation(buildingId, floorCode, img) {
        if (!buildingId || !floorCode) {
            state.rotationAngle = 0;
            return 0;
        }
        const saved = getSavedFloorDrawingRotation(buildingId, floorCode);
        if (saved !== null) {
            state.rotationAngle = saved;
            return saved;
        }
        let angle = 0;
        if (img && img.naturalHeight > img.naturalWidth * 1.15) angle = 90;
        if (!state.floorDrawingRotations) state.floorDrawingRotations = {};
        state.floorDrawingRotations[getFloorDrawingRotationKey(buildingId, floorCode)] = angle;
        state.rotationAngle = angle;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        return angle;
    }

    function cloneStyleSizesMap(src) {
        if (!src) return null;
        const out = {};
        Object.keys(src).forEach(k => {
            out[k] = { ...(src[k] || {}) };
        });
        return out;
    }

    // 결함위치도 / NDT 크기 키 분리 (일괄 슬라이더·층별 저장용)
    const DEFECT_STYLE_SIZE_KEYS = [
        'defectStructural', 'defectNonStructural', 'defectFinish',
        'defectStructuralGood', 'defectNonStructuralGood', 'defectFinishGood'
    ];
    const NDT_STYLE_SIZE_KEYS = [
        'ndtMeasure', 'ndtStrength', 'ndtCarbonation',
        'ndtTilt', 'ndtSettlement', 'ndtMemberDisp', 'ndtFireproof', 'ndtCrackGauge'
    ];

    function cloneStyleSizesSubset(src, keys) {
        if (!src) return null;
        const out = {};
        (keys || []).forEach(k => {
            if (src[k]) out[k] = { ...src[k] };
        });
        return out;
    }

    function mergeStyleSizesSubset(target, subset) {
        if (!subset) return target || null;
        const out = target ? { ...target } : {};
        Object.keys(subset).forEach(k => {
            out[k] = { ...(subset[k] || {}) };
        });
        return out;
    }

    function snapshotMapStyleSettings() {
        return {
            // 층별 스타일은 결함위치도만 — NDT 크기/굵기는 전역으로 별도 유지
            styleSizes: cloneStyleSizesSubset(state.styleSizes, DEFECT_STYLE_SIZE_KEYS),
            defectLeaderLineScale: state.defectLeaderLineScale !== undefined ? state.defectLeaderLineScale : 1.0
        };
    }

    function getActiveStyleSizesSource() {
        if (_mapStyleRenderContext) {
            const saved = state.floorMapStyleSettings?.[getFloorMapStyleKey(
                _mapStyleRenderContext.buildingId,
                _mapStyleRenderContext.floorCode
            )];
            if (saved && saved.styleSizes) return saved.styleSizes;
        }
        return state.styleSizes;
    }

    function getActiveLeaderLineScale() {
        if (_mapStyleRenderContext) {
            const saved = state.floorMapStyleSettings?.[getFloorMapStyleKey(
                _mapStyleRenderContext.buildingId,
                _mapStyleRenderContext.floorCode
            )];
            if (saved && saved.defectLeaderLineScale !== undefined) return saved.defectLeaderLineScale;
        }
        return state.defectLeaderLineScale;
    }

    function getStyleSize(key) {
        // 강도·탄산화 핀/화살표/선 굵기는 항상 동일 (강도 설정을 공유)
        const sizeKey = (key === 'ndtCarbonation') ? 'ndtStrength' : key;
        const sizesSource = getActiveStyleSizesSource();
        const custom = sizesSource && sizesSource[sizeKey];
        const def = DEFAULT_STYLE_SIZES[sizeKey] || DEFAULT_STYLE_SIZES[key] || { pin: 1.0, arrow: 1.0, leader: 1.0 };
        let leader = def.leader !== undefined ? def.leader : 1.0;
        if (custom && custom.leader !== undefined && custom.leader !== null) {
            leader = custom.leader;
        } else if (NDT_STYLE_SIZE_KEYS.includes(sizeKey) && state.ndtLeaderLineScale !== undefined) {
            // 구버전 전역 선 굵기 → 항목별 미설정 시 호환
            leader = state.ndtLeaderLineScale;
        }
        return {
            pin: (custom && custom.pin != null) ? custom.pin : def.pin,
            arrow: (custom && custom.arrow != null) ? custom.arrow : def.arrow,
            leader,
            font: (custom && custom.font != null && Number(custom.font) > 0)
                ? Number(custom.font)
                : (def.font != null ? def.font : 1.0)
        };
    }

    /** 스타일 크기 저장 — 강도/탄산화는 서로 동기화 */
    function setStyleSizeFields(key, patch) {
        if (!state.styleSizes) state.styleSizes = {};
        const keys = (key === 'ndtStrength' || key === 'ndtCarbonation')
            ? ['ndtStrength', 'ndtCarbonation']
            : [key];
        keys.forEach((k) => {
            if (!state.styleSizes[k]) state.styleSizes[k] = {};
            Object.keys(patch || {}).forEach((field) => {
                state.styleSizes[k][field] = patch[field];
            });
        });
        return keys;
    }

    function syncNdtStrengthCarbSizeControlsUi() {
        ['NdtStrength', 'NdtCarbonation'].forEach((suffix) => {
            const sz = getStyleSize(suffix === 'NdtStrength' ? 'ndtStrength' : 'ndtCarbonation');
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
    }

    // --- 카테고리별 박스 모양(직사각형/둥근사각형/원형) · 채우기 유무 · 번호 표시형식(NO.접두어 유무) ---
    const DEFAULT_STYLE_SHAPES = {
        defectStructural: { shape: 'rect', fill: false, numberFormat: 'no' },
        defectNonStructural: { shape: 'rect', fill: false, numberFormat: 'no' },
        defectFinish: { shape: 'rect', fill: false, numberFormat: 'no' },
        defectStructuralGood: { shape: 'rect', fill: false, numberFormat: 'no' },
        defectNonStructuralGood: { shape: 'rect', fill: false, numberFormat: 'no' },
        defectFinishGood: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtMeasure: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtStrength: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtCarbonation: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtTilt: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtSettlement: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtMemberDisp: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtFireproof: { shape: 'rect', fill: false, numberFormat: 'no' },
        ndtCrackGauge: { shape: 'rect', fill: false, numberFormat: 'no' }
    };

    function getStyleShape(key) {
        const custom = state.styleShapes && state.styleShapes[key];
        const def = DEFAULT_STYLE_SHAPES[key] || { shape: 'rect', fill: false, numberFormat: 'no' };
        return {
            shape: (custom && custom.shape) || def.shape,
            fill: (custom && custom.fill !== undefined) ? custom.fill : def.fill,
            numberFormat: (custom && custom.numberFormat) || def.numberFormat
        };
    }

    // 박스 테두리 경로 생성(직사각형/둥근사각형/원형 공용) — fill()/stroke() 호출 전에 사용
    function traceStyledBoxPath(ctx, w, h, shape, cornerRadius) {
        ctx.beginPath();
        if (shape === 'circle') {
            ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        } else if (shape === 'rounded') {
            ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(cornerRadius, w / 2, h / 2));
        } else {
            ctx.rect(-w / 2, -h / 2, w, h);
        }
    }

    // 핀 박스: fill=false면 투명 내부+색상 테두리, fill=true면 기존 채우기 방식
    function paintPinBox(ctx, w, h, shapeCfg, activeColor, scale, roundLineMul, isBeingDragged, leaderScaleOverride) {
        const borderColor = isBeingDragged ? '#facc15' : activeColor;
        const cornerR = getPinBoxCornerRadius(w, h, scale);
        traceStyledBoxPath(ctx, w, h, shapeCfg.shape, cornerR);
        if (shapeCfg.fill) {
            ctx.fillStyle = borderColor;
            ctx.fill();
        }
        ctx.strokeStyle = borderColor;
        // 드래그 중에도 테두리 두께는 그대로 — 노란색 강조만 (2026-09-28)
        ctx.lineWidth = getPinBoxBorderWidth(scale, roundLineMul, false, leaderScaleOverride);
        ctx.stroke();
    }

    function getPinBoxTextColor(activeColor, shapeCfg, isBeingDragged) {
        if (isBeingDragged) return activeColor;
        return shapeCfg.fill ? '#ffffff' : activeColor;
    }

    /** 번호 박스 글자 — 흰 외곽선으로 도면 위 가독성 확보 */
    function drawOutlinedPinText(ctx, text, x, y, fillColor, fontCss, outlineColor, opts) {
        opts = opts || {};
        const label = String(text || '');
        if (!label) return;
        const fontStr = String(fontCss || '');
        ctx.font = fontStr.includes('Pretendard') ? fontStr : (fontStr.includes('Malgun Gothic') ? fontStr.replace(/"Malgun Gothic"/g, '"Pretendard", "Malgun Gothic"') : fontStr.replace(/sans-serif/g, '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif'));
        ctx.textAlign = opts.textAlign || 'center';
        ctx.textBaseline = opts.textBaseline || 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        const fontSizeMatch = String(fontCss).match(/(\d+(?:\.\d+)?)px/);
        const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 11;
        const outlineW = opts.outlineWidth !== undefined
            ? opts.outlineWidth
            : Math.max(1.1, Math.min(2.8, fontSize * 0.2));
        if (outlineW > 0) {
            ctx.strokeStyle = outlineColor || '#ffffff';
            ctx.lineWidth = outlineW;
            ctx.strokeText(label, x, y);
        }
        ctx.fillStyle = fillColor;
        ctx.fillText(label, x, y);
    }

    function drawPinBoxLabel(ctx, text, fillColor, scale, shapeCfg, fontMul) {
        const lightText = String(fillColor).toLowerCase() === '#ffffff' || String(fillColor).toLowerCase() === '#fff';
        const outline = (shapeCfg && shapeCfg.fill && lightText) ? 'rgba(0,0,0,0.45)' : '#ffffff';
        drawOutlinedPinText(
            ctx,
            text,
            0,
            0,
            fillColor,
            `bold ${getPinBoxFontSizeWithMul(scale, fontMul)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`,
            outline
        );
    }

    /** 화면 전용 — PDF/HWPX·drawPinSafe 미사용. 같은 번호의 화살표가 여러 개일 때 1·2… 구분 */
    function drawArrowMapIndexLabel(ctx, arrowIndex, targetX, targetY, ux, uy, lineColor, arrowScale, isBeingDragged) {
        if (arrowIndex == null || arrowIndex < 0) return;
        const label = String(arrowIndex + 1);
        const len = Math.hypot(ux, uy) || 1;
        const nx = ux / len;
        const ny = uy / len;
        const along = 11 * arrowScale;
        const perp = 9 * arrowScale;
        const px = -ny;
        const py = nx;
        const x = targetX - nx * along + px * perp;
        const y = targetY - ny * along + py * perp;
        const fontSize = Math.max(9, Math.round(11 * arrowScale));
        drawOutlinedPinText(
            ctx,
            label,
            x,
            y,
            lineColor,
            `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`,
            '#ffffff',
            { outlineWidth: 2 }
        );
    }

    // 결함 핀 번호 박스 — 글자 실측 기준, 테두리가 글자에 거의 닿도록 최소 여백
    const PIN_BOX_PAD_X = 1.5;
    const PIN_BOX_PAD_Y = 0.75;
    const PIN_BOX_MIN_W = 12;
    const PIN_BOX_MIN_H = 10;

    function getPinBoxFontSize(scale) {
        return Math.max(9, Math.round(11 * scale));
    }

    const LEADER_LINE_SCALE_MIN = 0.1;
    const LEADER_LINE_SCALE_MAX_MAP = 5.0;
    const LEADER_LINE_SCALE_MAX_NDT = 3.0;
    // 동일 슬라이더 %에서 구버전보다 얇게: factor = 슬라이더 × 0.5 (구버전 50% ≈ 신버전 100%)
    const LEADER_LINE_RENDER_MUL = 0.5;
    const LEADER_LINE_CORE_MUL = 1.0;
    const PIN_BOX_BORDER_CORE_MUL = 1.1;

    function clampLeaderLineScale(raw, max = LEADER_LINE_SCALE_MAX_MAP) {
        return Math.min(Math.max(parseFloat(raw || 1), LEADER_LINE_SCALE_MIN), max);
    }

    function getLeaderLineRenderFactor(raw, max = LEADER_LINE_SCALE_MAX_MAP) {
        return clampLeaderLineScale(raw, max) * LEADER_LINE_RENDER_MUL;
    }

    function getLeaderLineStrokeWidth(scale, roundLineMul, isBeingDragged, leaderScaleOverride) {
        const raw = leaderScaleOverride !== undefined && leaderScaleOverride !== null
            ? leaderScaleOverride
            : getActiveLeaderLineScale();
        const max = leaderScaleOverride !== undefined && leaderScaleOverride !== null
            ? LEADER_LINE_SCALE_MAX_NDT
            : LEADER_LINE_SCALE_MAX_MAP;
        const factor = getLeaderLineRenderFactor(raw, max);
        const dragMul = isBeingDragged ? 1.5 : LEADER_LINE_CORE_MUL;
        return dragMul * (scale || 1) * (roundLineMul || 1) * factor;
    }

    function scaleLeaderLineStoredValue(v, mul, max) {
        if (v === undefined || v === null) return v;
        const n = parseFloat(v);
        if (!Number.isFinite(n)) return v;
        const cap = max || LEADER_LINE_SCALE_MAX_MAP;
        return Math.min(cap, Math.max(LEADER_LINE_SCALE_MIN, Math.round(n * mul * 10) / 10));
    }

    function migrateLeaderLineScalesIfNeeded() {
        if (window.state._leaderLineScaleV3Migrated) return;
        let changed = false;
        const undoV2Halving = (obj, key, max) => {
            if (!window.state._leaderLineScaleV2Migrated) return;
            if (!obj || obj[key] === undefined || obj[key] === null) return;
            const next = scaleLeaderLineStoredValue(obj[key], 2, max);
            if (next !== obj[key]) {
                obj[key] = next;
                changed = true;
            }
        };
        undoV2Halving(window.state, 'defectLeaderLineScale', LEADER_LINE_SCALE_MAX_MAP);
        undoV2Halving(window.state, 'ndtLeaderLineScale', LEADER_LINE_SCALE_MAX_NDT);
        if (window.state.styleSizes) {
            Object.values(window.state.styleSizes).forEach((sz) => undoV2Halving(sz, 'leader', LEADER_LINE_SCALE_MAX_NDT));
        }
        if (window.state.floorMapStyleSettings) {
            Object.values(window.state.floorMapStyleSettings).forEach((saved) => {
                undoV2Halving(saved, 'defectLeaderLineScale', LEADER_LINE_SCALE_MAX_MAP);
                if (saved && saved.styleSizes) {
                    Object.values(saved.styleSizes).forEach((sz) => undoV2Halving(sz, 'leader', LEADER_LINE_SCALE_MAX_NDT));
                }
            });
        }
        window.state._leaderLineScaleV3Migrated = true;
        if (changed && typeof saveStateToLocalStorage === 'function') {
            saveStateToLocalStorage();
        }
    }

    function getPinBoxBorderWidth(scale, roundLineMul, isBeingDragged, leaderScaleOverride) {
        // 번호칸 테두리 — 연결선과 동일 슬라이더 배율, 기본 두께만 약간 더 두껍게
        const raw = leaderScaleOverride !== undefined && leaderScaleOverride !== null
            ? leaderScaleOverride
            : getActiveLeaderLineScale();
        const max = leaderScaleOverride !== undefined && leaderScaleOverride !== null
            ? LEADER_LINE_SCALE_MAX_NDT
            : LEADER_LINE_SCALE_MAX_MAP;
        const factor = getLeaderLineRenderFactor(raw, max);
        const dragMul = isBeingDragged ? 1.5 : PIN_BOX_BORDER_CORE_MUL;
        return dragMul * (scale || 1) * (roundLineMul || 1) * factor;
    }

    function getDefectLeaderLineWidth(scale, roundLineMul, isBeingDragged) {
        return getLeaderLineStrokeWidth(scale, roundLineMul, isBeingDragged);
    }

    function getNdtLeaderLineScale(styleKey) {
        if (styleKey) return getStyleSize(styleKey).leader;
        return state.ndtLeaderLineScale !== undefined ? state.ndtLeaderLineScale : 1.0;
    }

    function getNdtLeaderLineWidth(scale, isBeingDragged, styleKey) {
        return getLeaderLineStrokeWidth(scale || 1, 1, isBeingDragged, getNdtLeaderLineScale(styleKey));
    }

    function getCurrentNdtStyleKey() {
        return getNdtStyleKey(currentNdtCategory || '실측');
    }

    function getNdtCategoryLabel(cat) {
        const map = {
            '실측': '부재 실측',
            '강도': '콘크리트 강도',
            '탄산화': '콘크리트 탄산화',
            '기울기': '외벽 기울기',
            '변위': '부동침하 기울기',
            '부재변위': '부재변위',
            '내화피복': '내화피복 두께',
            '균열모니터': '균열 게이지·팁'
        };
        return map[cat] || cat || '비파괴';
    }

    /** 번호 글자 배율(균열 게이지 스타일의 '글자') — 없거나 이상하면 1 */
    function normalizePinFontMul(fontMul) {
        const n = Number(fontMul);
        if (!(n > 0) || !Number.isFinite(n)) return 1;
        return Math.min(4, Math.max(0.3, n));
    }

    function getPinBoxFontSizeWithMul(scale, fontMul) {
        const base = getPinBoxFontSize(scale);
        const m = normalizePinFontMul(fontMul);
        return m === 1 ? base : Math.round(base * m * 10) / 10;
    }

    function measurePinBoxDimensions(ctx, labelText, scale, roundLineMul, fontMul) {
        const fontSize = getPinBoxFontSizeWithMul(scale, fontMul);
        const text = String(labelText || 'NO.01');
        const borderW = getPinBoxBorderWidth(scale, roundLineMul, false);
        let textWidth = text.length * fontSize * 0.58;
        if (ctx) {
            ctx.save();
            ctx.font = `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
            textWidth = ctx.measureText(text).width;
            ctx.restore();
        }
        const padX = PIN_BOX_PAD_X * scale + borderW * 0.5;
        const padY = PIN_BOX_PAD_Y * scale + borderW * 0.5;
        return {
            w: Math.max(PIN_BOX_MIN_W * scale, textWidth + padX * 2),
            h: Math.max(PIN_BOX_MIN_H * scale, fontSize + padY * 2),
            fontSize
        };
    }

    function getPinBoxDimensions(scale, labelText, ctx) {
        const measureCtx = ctx || state.ctx || null;
        return measurePinBoxDimensions(measureCtx, labelText || 'NO.01', scale || 1, 1);
    }

    /** 화면과 같이 역회전된 번호/콜아웃 박스 — 내부일 때만 드래그 히트 */
    function isPointInsideMarkBox(px, py, cx, cy, boxW, boxH, rotationDeg) {
        if (!(boxW > 0) || !(boxH > 0)) return false;
        const dx = px - cx;
        const dy = py - cy;
        const rad = ((rotationDeg || 0) * Math.PI) / 180;
        // 그릴 때 rotate(-θ) → 히트는 rotate(+θ)로 로컬 복원
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        return Math.abs(lx) <= boxW / 2 && Math.abs(ly) <= boxH / 2;
    }

    // 마킹(화살표 끝) 바로 위에 번호 박스 중심 배치 — 박스 하단과 마킹 사이 간격 = 글자 크기
    function computePinBoxAboveTarget(targetX, targetY, labelText, scale, ctx, roundLineMul) {
        const dims = measurePinBoxDimensions(ctx, labelText, scale || 1, roundLineMul || 1);
        const gap = dims.fontSize;
        return {
            boxX: targetX,
            boxY: targetY - gap - dims.h / 2,
            w: dims.w,
            h: dims.h,
            fontSize: dims.fontSize
        };
    }

    function getPinBoxCornerRadius(w, h, scale) {
        return Math.min(3 * (scale || 1), w / 4, h / 4);
    }

    function intersectRayWithRect(lx, ly, hw, hh) {
        const len = Math.hypot(lx, ly);
        if (len < 1e-6) return { x: 0, y: -hh };
        const dx = lx / len;
        const dy = ly / len;
        let bestT = Infinity;
        if (dx > 1e-9) bestT = Math.min(bestT, hw / dx);
        if (dx < -1e-9) bestT = Math.min(bestT, -hw / dx);
        if (dy > 1e-9) bestT = Math.min(bestT, hh / dy);
        if (dy < -1e-9) bestT = Math.min(bestT, -hh / dy);
        return { x: bestT * dx, y: bestT * dy };
    }

    /** 직사각형 핀: 마킹(ref)과 가장 가까운 꼭짓점 (로컬 좌표) */
    function getRectCornerAnchorLocal(lx, ly, hw, hh) {
        const corners = [
            { x: hw, y: -hh },
            { x: -hw, y: -hh },
            { x: hw, y: hh },
            { x: -hw, y: hh }
        ];
        if (Math.hypot(lx, ly) < 1e-6) return corners[0];
        let best = corners[0];
        let bestDist = Infinity;
        corners.forEach((c) => {
            const d = Math.hypot(lx - c.x, ly - c.y);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        });
        return best;
    }

    function intersectRayWithEllipse(lx, ly, rx, ry) {
        const len = Math.hypot(lx, ly);
        if (len < 1e-6) return { x: 0, y: -ry };
        const dx = lx / len;
        const dy = ly / len;
        const denom = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
        const t = 1 / Math.max(denom, 1e-9);
        return { x: t * dx, y: t * dy };
    }

    /** 박스 중심→ref 방향 광선과 둥근사각형 테두리 교차점 (로컬 좌표) */
    function intersectRayWithRoundedRect(lx, ly, hw, hh, r) {
        r = Math.max(0, Math.min(r, hw, hh));
        if (r < 1e-6) return intersectRayWithRect(lx, ly, hw, hh);

        const len = Math.hypot(lx, ly);
        if (len < 1e-6) return { x: 0, y: -hh };
        const dx = lx / len;
        const dy = ly / len;
        let bestT = Infinity;

        const tryEdge = (t, onEdge) => {
            if (t > 1e-6 && onEdge) bestT = Math.min(bestT, t);
        };

        if (Math.abs(dx) > 1e-9) {
            const tR = hw / dx;
            tryEdge(tR, Math.abs(tR * dy) <= hh - r + 1e-6);
            const tL = -hw / dx;
            tryEdge(tL, Math.abs(tL * dy) <= hh - r + 1e-6);
        }
        if (Math.abs(dy) > 1e-9) {
            const tB = hh / dy;
            tryEdge(tB, Math.abs(tB * dx) <= hw - r + 1e-6);
            const tT = -hh / dy;
            tryEdge(tT, Math.abs(tT * dx) <= hw - r + 1e-6);
        }

        const corners = [
            { cx: hw - r, cy: -hh + r, inArc: (px, py) => px >= hw - r - 1e-6 && py <= -hh + r + 1e-6 },
            { cx: hw - r, cy: hh - r, inArc: (px, py) => px >= hw - r - 1e-6 && py >= hh - r - 1e-6 },
            { cx: -hw + r, cy: hh - r, inArc: (px, py) => px <= -hw + r + 1e-6 && py >= hh - r - 1e-6 },
            { cx: -hw + r, cy: -hh + r, inArc: (px, py) => px <= -hw + r + 1e-6 && py <= -hh + r + 1e-6 },
        ];

        corners.forEach(({ cx, cy, inArc }) => {
            const b = -(dx * cx + dy * cy);
            const c = cx * cx + cy * cy - r * r;
            const disc = b * b - c;
            if (disc < 0) return;
            const sqrtD = Math.sqrt(disc);
            [b - sqrtD, b + sqrtD].forEach((t) => {
                if (t <= 1e-6) return;
                const px = t * dx;
                const py = t * dy;
                if (inArc(px, py) && Math.abs(Math.hypot(px - cx, py - cy) - r) < 0.08) {
                    bestT = Math.min(bestT, t);
                }
            });
        });

        if (!Number.isFinite(bestT)) return intersectRayWithRect(lx, ly, hw, hh);
        return { x: bestT * dx, y: bestT * dy };
    }

    // 지시선이 ref 지점과 가장 가까운 박스 **테두리**에서 시작 (둥근/원형 포함)
    function getPinLeaderBoxAnchorFromPoint(boxX, boxY, refX, refY, boxW, boxH, rotationDeg, shapeOpts) {
        const hw = boxW / 2;
        const hh = boxH / 2;
        const rad = ((rotationDeg || 0) * Math.PI) / 180;
        const dx = refX - boxX;
        const dy = refY - boxY;
        if (Math.hypot(dx, dy) < 1e-6) return { x: boxX, y: boxY };

        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        const shape = (shapeOpts && shapeOpts.shape) || 'rect';
        const scale = (shapeOpts && shapeOpts.scale) || 1;
        let localPt;
        if (shape === 'circle') {
            localPt = intersectRayWithEllipse(lx, ly, hw, hh);
        } else if (shape === 'rounded') {
            localPt = intersectRayWithRoundedRect(lx, ly, hw, hh, getPinBoxCornerRadius(boxW, boxH, scale));
        } else {
            localPt = getRectCornerAnchorLocal(lx, ly, hw, hh);
        }

        return {
            x: boxX + localPt.x * cos + localPt.y * sin,
            y: boxY - localPt.x * sin + localPt.y * cos
        };
    }

    /** 지시선이 상·하·좌·우 **변의 중앙**에서 나가도록 (외벽 기울기 콜아웃용) */
    function getPinLeaderBoxEdgeCenterAnchor(boxX, boxY, refX, refY, boxW, boxH, rotationDeg) {
        const hw = boxW / 2;
        const hh = boxH / 2;
        const rad = ((rotationDeg || 0) * Math.PI) / 180;
        const dx = refX - boxX;
        const dy = refY - boxY;
        if (Math.hypot(dx, dy) < 1e-6) return { x: boxX, y: boxY + hh };

        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        const edgeMids = [
            { x: 0, y: -hh },  // top
            { x: hw, y: 0 },   // right
            { x: 0, y: hh },   // bottom
            { x: -hw, y: 0 }   // left
        ];

        let best = edgeMids[0];
        let bestDist = Infinity;
        edgeMids.forEach(c => {
            const d = Math.hypot(lx - c.x, ly - c.y);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        });

        return {
            x: boxX + best.x * cos + best.y * sin,
            y: boxY - best.x * sin + best.y * cos
        };
    }

    function getPinLeaderBoxAnchor(boxX, boxY, targetX, targetY, boxW, boxH, rotationDeg, shapeOpts) {
        return getPinLeaderBoxAnchorFromPoint(boxX, boxY, targetX, targetY, boxW, boxH, rotationDeg, shapeOpts);
    }

    /** 마킹 점 목록(targets) → 좌표만 */
    function collectLeaderTipPoints(targets) {
        return (targets || [])
            .filter((t) => t && Number.isFinite(Number(t.targetX)) && Number.isFinite(Number(t.targetY)))
            .map((t) => ({ x: Number(t.targetX), y: Number(t.targetY) }));
    }

    /**
     * 2026-10-30 지시선 2~3개(화살표 추가): 마킹 점들의 중심에 가장 가까운 박스 모서리 한 곳에서 모두 나감.
     * 예외: 그 모서리→점 선이 박스를 가로지르거나 다른 마킹 점을 지나가면 그 점만 자기와 가까운 모서리로.
     * 점이 1개이거나 사각형이 아닌 핀(동그라미·둥근 박스)은 예전 그대로. 화면·PDF·한글·벡터 PDF 공용.
     */
    function getGroupLeaderBoxAnchor(boxX, boxY, targetX, targetY, tips, boxW, boxH, rotationDeg, shapeOpts) {
        const own = getPinLeaderBoxAnchorFromPoint(boxX, boxY, targetX, targetY, boxW, boxH, rotationDeg, shapeOpts);
        const shape = (shapeOpts && shapeOpts.shape) || 'rect';
        if (shape !== 'rect' || !Array.isArray(tips) || tips.length < 2) return own;
        const cx = tips.reduce((s, p) => s + p.x, 0) / tips.length;
        const cy = tips.reduce((s, p) => s + p.y, 0) / tips.length;
        const shared = getPinLeaderBoxAnchorFromPoint(boxX, boxY, cx, cy, boxW, boxH, rotationDeg, shapeOpts);
        if (Math.hypot(shared.x - own.x, shared.y - own.y) < 1e-6) return own;
        const rad = ((rotationDeg || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const toLocal = (x, y) => ({ x: (x - boxX) * cos - (y - boxY) * sin, y: (x - boxX) * sin + (y - boxY) * cos });
        const hw = boxW / 2;
        const hh = boxH / 2;
        const eps = Math.max(0.5, Math.min(hw, hh) * 0.05);
        // 1) 모서리→점 선이 박스 안을 지나가거나 박스 변에 바짝 붙어 지나가면(박스를 가로지름) 제외
        const pad = Math.min(hw, hh) * 0.6;
        const cl = toLocal(shared.x, shared.y);
        // 모서리→점 방향이 모서리→중심 방향과 90° 넘게 다르면(박스 반대편으로 돌아 감) 제외
        if ((targetX - shared.x) * (cx - shared.x) + (targetY - shared.y) * (cy - shared.y) < 0) return own;
        for (let i = 1; i < 40; i++) {
            const k = i / 40;
            const p = toLocal(shared.x + (targetX - shared.x) * k, shared.y + (targetY - shared.y) * k);
            if (Math.abs(p.x) < hw - eps && Math.abs(p.y) < hh - eps) return own;
            if (Math.hypot(p.x - cl.x, p.y - cl.y) > pad * 1.5
                && Math.abs(p.x) < hw + pad && Math.abs(p.y) < hh + pad) return own;
        }
        // 2) 다른 마킹 점 바로 위를 지나가면 제외
        const near = Math.max(6, Math.min(boxW, boxH) * 0.35);
        const sx = targetX - shared.x;
        const sy = targetY - shared.y;
        const len2 = sx * sx + sy * sy;
        if (len2 > 1e-9) {
            for (const q of tips) {
                if (Math.hypot(q.x - targetX, q.y - targetY) < 1e-6) continue;
                const t = ((q.x - shared.x) * sx + (q.y - shared.y) * sy) / len2;
                if (t <= 0.02 || t >= 0.98) continue;
                const d = Math.hypot(q.x - (shared.x + sx * t), q.y - (shared.y + sy * t));
                if (d < near) return own;
            }
        }
        return shared;
    }

    function rotateVec2Deg(x, y, deg) {
        const rad = ((deg || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return { x: x * cos - y * sin, y: x * sin + y * cos };
    }

    function getArrowOctantScreenUnitVector(octant) {
        const o = ((parseInt(octant, 10) % 8) + 8) % 8;
        const rad = (o * Math.PI) / 4;
        return { x: Math.cos(rad), y: Math.sin(rad), octant: o };
    }

    /** UI(화면) 기준 팔방향 → 도면 이미지 좌표 단위벡터 */
    function getArrowOctantImageUnitVector(octant, rotationDeg) {
        const screen = getArrowOctantScreenUnitVector(octant);
        const img = rotateVec2Deg(screen.x, screen.y, -(rotationDeg || 0));
        return { x: img.x, y: img.y, octant: screen.octant };
    }

    /**
     * 2026-10-19 지시선 끝: 기본(동그라미)이어도 그 지시선에 「화살표 방향 지정」을 했으면 화살표로.
     * 화살표를 고른 기기(state.tipShape === 'arrow')는 원래대로 모두 화살표. 화면·PDF·한글·벡터 PDF 공용.
     */
    function leaderTipIsCircle(forcedDir) {
        if (state.tipShape !== 'circle') return false;
        return !(forcedDir && forcedDir.enabled);
    }

    function resolveForcedArrowDirection(arrowItem, defect, rotationDeg) {
        const forceFlag = (arrowItem && arrowItem.forceArrowDir !== undefined)
            ? !!arrowItem.forceArrowDir
            : !!(defect && defect.forceArrowDir);
        const octantRaw = (arrowItem && arrowItem.arrowOctant !== undefined)
            ? arrowItem.arrowOctant
            : (defect && defect.arrowOctant !== undefined ? defect.arrowOctant : 0);
        const unit = getArrowOctantImageUnitVector(octantRaw, rotationDeg);
        return { enabled: forceFlag, octant: unit.octant, ux: unit.x, uy: unit.y };
    }

    function compactRoutePoints(points) {
        if (!points || !points.length) return [];
        const out = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const prev = out[out.length - 1];
            const cur = points[i];
            if (Math.hypot(cur.x - prev.x, cur.y - prev.y) > 0.5) out.push(cur);
        }
        return out;
    }

    function getArrowStemEndPoint(targetX, targetY, dirX, dirY, headLen) {
        const len = Math.hypot(dirX, dirY);
        if (len < 1e-6) return { x: targetX, y: targetY };
        return {
            x: targetX - (dirX / len) * headLen,
            y: targetY - (dirY / len) * headLen
        };
    }

    function buildForcedLeaderRoute(target, boxX, boxY, boxW, boxH, pinScale, arrowScale, octant, stemInset, headLen, rotationDeg, shapeOpts) {
        const unit = getArrowOctantImageUnitVector(octant, rotationDeg);
        const pullBack = Math.max(3 * (arrowScale || 1), headLen * 0.45);
        const stemEnd = getArrowStemEndPoint(target.x, target.y, unit.x, unit.y, stemInset);
        const tail = {
            x: stemEnd.x - unit.x * pullBack,
            y: stemEnd.y - unit.y * pullBack
        };
        const dotToBox = (boxX - target.x) * unit.x + (boxY - target.y) * unit.y;

        // 화살표 반대편: tail(튀어나온 선)에서 가장 가까운 박스 테두리로 직결
        if (dotToBox <= 0) {
            const anchor = getPinLeaderBoxAnchorFromPoint(boxX, boxY, tail.x, tail.y, boxW, boxH, rotationDeg, shapeOpts);
            return { route: compactRoutePoints([anchor, tail, stemEnd]), ux: unit.x, uy: unit.y };
        }

        // 화살표 진행 방향 쪽: 90° 꺾임을 항상 네모박스 쪽으로 뺌
        const detourLen = Math.max(10 * (pinScale || 1), 12 * (arrowScale || 1));
        const perp = { x: -unit.y, y: unit.x };
        const toBoxX = boxX - tail.x;
        const toBoxY = boxY - tail.y;
        const side = (toBoxX * perp.x + toBoxY * perp.y) >= 0 ? 1 : -1;
        const bend = {
            x: tail.x + perp.x * detourLen * side,
            y: tail.y + perp.y * detourLen * side
        };
        const anchor = getPinLeaderBoxAnchorFromPoint(boxX, boxY, bend.x, bend.y, boxW, boxH, rotationDeg, shapeOpts);
        return { route: compactRoutePoints([anchor, bend, tail, stemEnd]), ux: unit.x, uy: unit.y };
    }

    // 카테고리 설정에 따라 "NO.01" ↔ "01" 형식으로 번호 라벨 텍스트 변환
    function formatPinNumberLabel(rawText, styleKey, keepSubNo) {
        if (getStyleShape(styleKey).numberFormat !== 'plain') return rawText;
        // 2026-11-11 결함 마킹의 직접 준 하위번호(NO.74-2)는 숫자만 모양에서도 74-2(keepSubNo). 비파괴는 그대로
        const m = String(rawText || '').match(keepSubNo ? /(\d+(?:-\d+)?)/ : /(\d+)/);
        return m ? m[1] : (rawText || '');
    }

    function getDefectPinShapeCfg(defect, styleKey) {
        return getStyleShape(styleKey);
    }

    function formatDefectPinLabel(defect, styleKey) {
        return formatPinNumberLabel(defect.groupNo || defect.no || 'NO.01', styleKey, true);
    }

    // NDT 카테고리 → 스타일 설정 키 매핑 (색상/크기 공용)
    function getNdtStyleKey(cat) {
        if (cat === '부재변위') return 'ndtMemberDisp';
        if (cat === '변위') return 'ndtSettlement';
        if (cat === '기울기') return 'ndtTilt';
        if (cat === '실측') return 'ndtMeasure';
        if (cat === '탄산화') return 'ndtCarbonation';
        if (cat === '내화피복') return 'ndtFireproof';
        if (cat === '균열모니터') return 'ndtCrackGauge';
        return 'ndtStrength';
    }

