// @@app-part 16-backup-auth-init.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // ==========================================================================
    // 건물 백업(체크포인트) — 2026-09-27
    // safety_app/{회사}/buildingCheckpoints/{id}          요약 + 이 백업이 쓰는 사진 id(photoIds)
    // safety_app/{회사}/buildingCheckpoints/{id}/data/payload  층별 스냅샷 JSON (크면 parts 조각)
    // 백업은 서버에서 모든 층을 읽어 만든다. 기기 state는 지금 층·고친 층만 서버와 맞춰져
    // 안 연 층은 옛 데이터일 수 있다(2026-09-27 겨자씨 사고가 그 옛 데이터였다).
    // ==========================================================================
    function buildingBackupsCollection() {
        if (!db || !window.state.companyId) return null;
        return db.collection('safety_app').doc(getCompanyDocId()).collection('buildingCheckpoints');
    }

    function buildingBackupPayloadRef(backupId) {
        const coll = buildingBackupsCollection();
        return coll ? coll.doc(backupId).collection('data').doc('payload') : null;
    }

    /**
     * 백업이 쓰는 사진이면 클라우드 사본을 지우지 않는다 — 되살리기로 다시 필요해진다.
     * 서버에 직접 묻는다(다른 기기가 만든 백업도 봐야 한다). 확인을 못 하면 지우지 않는다.
     */
    async function isPhotoKeptByBuildingBackup(photoId) {
        const coll = buildingBackupsCollection();
        if (!coll || !photoId) return false;
        try {
            const snap = await coll.where('photoIds', 'array-contains', String(photoId)).limit(1).get({ source: 'server' });
            return !snap.empty;
        } catch (e) {
            console.warn('[건물 백업] 사진 보존 여부를 확인하지 못해 지우지 않고 둡니다:', photoId, e);
            return true;
        }
    }

    function buildingFloorCodesForBackup(bldg) {
        const codes = new Set(((bldg && bldg.floorsList) || []).map((f) => f && f.floorCode).filter(Boolean));
        const prefix = `${bldg.id}_`;
        [window.state.defects, window.state.ndtData, window.state.ndtDisplacementGroups].forEach((map) => {
            Object.keys(map || {}).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                const code = floorCodeFromFloorKey(k, bldg);
                if (code) codes.add(code);
            });
        });
        codes.delete('ROUND_SKETCH_MEMO');   // 회차 손글씨 메모 자리는 층이 아님
        return Array.from(codes);
    }

    /** 서버의 층 묶음을 읽는다. 읽기 실패·저장 중인 층은 조용히 빈 층으로 두지 않고 멈춘다. */
    /** 2026-11-06 오프라인 복귀 때 서버 확인에서 읽은 층을 곧바로 이어지는 다시 받기에서 또 읽지 않게(2분) */
    let _floorBundleMemo = null;
    const FLOOR_BUNDLE_MEMO_MS = 2 * 60 * 1000;
    /** 층을 동시에 받는 수. 한 층씩 받으면 층이 많은 건물에서 기다리는 시간이 그대로 쌓인다 */
    const FLOOR_READ_CONCURRENCY = 4;

    async function readFloorBundleStrict(bldg, floorCode) {
        const memoKey = `${bldg && bldg.id}_${floorCode}`;
        const memo = _floorBundleMemo && _floorBundleMemo.get(memoKey);
        if (memo && Date.now() - memo.at < FLOOR_BUNDLE_MEMO_MS) return memo.bundle;
        const ref = getFloorScopeRef(bldg, floorCode);
        if (!ref) throw new Error('로그인 상태를 확인해 주세요.');
        const snap = await ref.get({ source: 'server' });
        let bundle;
        if (!snap.exists) {
            bundle = await readFloorSyncBundle(bldg, floorCode);   // 옛 저장 방식 층
        } else {
            const json = await decodeChunkedPayloadFromData(snap.data() || {}, ref);
            if (!json) throw new Error(`${floorCode} 층을 다른 기기가 저장하는 중입니다. 잠시 뒤 다시 시도해 주세요.`);
            bundle = bundleFromPackObject(JSON.parse(json));
        }
        if (_floorBundleMemo) _floorBundleMemo.set(memoKey, { at: Date.now(), bundle });
        return bundle;
    }

    /** 이 건물의 안 올라간 수정을 먼저 서버에 올린다. 못 올리면 백업·되살리기를 하지 않는다. */
    async function flushBuildingEditsToServer(bldg) {
        const prefix = `${bldg.id}_`;
        const dirty = () => Array.from(_dirtyFloorKeys).some((k) => String(k).startsWith(prefix));
        for (let i = 0; i < 12 && dirty(); i++) {
            if (_syncInFlight || isRemoteSyncing) {
                await new Promise((r) => setTimeout(r, 700));
                continue;
            }
            await syncStateToFirebase();
        }
        if (dirty()) {
            throw new Error('이 건물에 아직 서버로 올라가지 않은 수정이 있습니다. 인터넷 연결을 확인하고 새로고침한 뒤 다시 시도해 주세요.');
        }
    }

    async function readBuildingBundlesFromServer(bldg) {
        const out = [];
        for (const code of buildingFloorCodesForBackup(bldg).concat(['ROUND_SKETCH_MEMO'])) {
            out.push({ floorCode: code, bundle: await readFloorBundleStrict(bldg, code) });
        }
        return out;
    }

    /**
     * 이 건물의 **모든 층**을 서버에서 받아 기기 데이터에 합친다 (2026-09-29).
     *
     * 동기화는 "지금 보는 층 + 이 기기에서 고친 층"만 서버에서 읽는다. 그래서 태블릿에서 안 열어 본 층은
     * 결함이 0개이거나 옛 숫자로 남아, 통계·한글·PDF 보고서가 그 층을 빼먹거나 옛 값으로 냈다
     * (사용자 제보: 태블릿 통계에서 가끔 층이 빠짐). 합치기는 동기화와 같은 mergeFloorBundleIntoState라
     * 이 기기의 안 올라간 수정은 그대로 남는다(나중 것이 이김).
     * 반환: { ok, skipped: 'offline'|'nologin'|'recent'|null, failed: [층코드] }
     */
    const _buildingFloorsFreshAt = new Map();
    const BUILDING_FLOORS_FRESH_MS = 2 * 60 * 1000;
    async function refreshBuildingFloorsFromServer(bldg, opts) {
        const o = opts || {};
        if (!bldg || !bldg.id) return { ok: false, skipped: 'nobuilding', failed: [] };
        if (!db || !window.state.companyId) return { ok: false, skipped: 'nologin', failed: [] };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, skipped: 'offline', failed: [] };
        if (!o.force && Date.now() - (_buildingFloorsFreshAt.get(bldg.id) || 0) < BUILDING_FLOORS_FRESH_MS) {
            return { ok: true, skipped: 'recent', failed: [] };
        }
        // 동기화가 도는 중이면 잠깐 기다린다 — 같은 층을 동시에 합치지 않게
        for (let i = 0; i < 10 && (_syncInFlight || isRemoteSyncing); i++) {
            await new Promise((r) => setTimeout(r, 500));
        }
        const failed = [];
        let merged = 0;
        const codesAll = buildingFloorCodesForBackup(bldg);
        // 2026-10-20 회차 손글씨 메모 자리도 같이 받는다(층 목록에는 안 넣음)
        if (typeof pullRoundSketchMemos === 'function') { try { await pullRoundSketchMemos(bldg); } catch (_e) { /* 메모만 실패 */ } }
        let codeDone = 0;
        const tellProgress = (n) => { if (typeof o.onProgress === 'function') { try { o.onProgress(n, codesAll.length); } catch (_e) { /* ignore */ } } };
        await runPool(codesAll, FLOOR_READ_CONCURRENCY, async (code) => {
            try {
                const bundle = await readFloorBundleStrict(bldg, code);
                if (bundle) {
                    mergeFloorBundleIntoState(bldg, code, bundle);   // 합치기는 동기라 층끼리 안 섞인다
                    merged++;
                }
            } catch (e) {
                console.warn(`[전 층 받기] ${code} 층을 받지 못함:`, e);
                failed.push(code);
            }
            tellProgress(++codeDone);
        });
        tellProgress(codesAll.length);
        if (merged && typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (!failed.length) _buildingFloorsFreshAt.set(bldg.id, Date.now());
        return { ok: !failed.length, skipped: null, failed };
    }
    window.refreshBuildingFloorsFromServer = refreshBuildingFloorsFromServer;

    /**
     * 2026-11-09 외부 면(정면·배면·좌측·우측…)은 상태조사표가 하나라 결함 번호도 한 공간이다
     * (getFloorDefectsForNumbering). 그런데 동기화는 지금 보는 층만 서버에서 받아서, 이 기기에서
     * 안 열어 본(또는 다른 사람이 찍은) 배면의 NO.01을 몰라 정면 새 결함이 또 NO.01이 됐다(영광군청 본관).
     * 외부 면을 열면 나머지 외부 면을 서버에서 받아 합친다. 읽기만 하고, 이 기기의 안 올라간 수정은
     * 동기화와 같은 합치기라 그대로 남는다.
     * 2026-11-09 저녁: 면을 열 때 한 번만 받으면 두 사람이 동시에 다른 면을 찍을 때 또 겹쳤다 → 새 결함 창을 열 때도 받는다
     * (opts.force, 15-firebase-sync pullExteriorPeersForNewDefect). 번호 공간만 채우면 되므로 **결함만** 합친다
     * (도면·비파괴·메모까지 합치면 이 기기에서 바꾸고 아직 못 올린 다른 면 도면 주소를 서버의 옛 주소로 덮을 수 있다).
     * 받은 뒤 이 기기가 새로 만들어 아직 서버에 없는 결함이 다른 면 번호와 겹치면 옮긴다(먼저 올린 사람 번호는 그대로).
     * 반환: { ok, merged, skipped, failed, changes }
     */
    const _exteriorPeersFreshAt = new Map();
    const _exteriorPeersInFlight = new Map();
    const EXTERIOR_PEERS_FRESH_MS = 60 * 1000;
    function refreshExteriorPeerFloorsFromServer(bldg, currentCode, opts) {
        const id = bldg && bldg.id;
        const key = `${id}|${currentCode}`;
        if (id && _exteriorPeersInFlight.has(key)) return _exteriorPeersInFlight.get(key);
        const p = refreshExteriorPeerFloorsOnce(bldg, currentCode, opts)
            .finally(() => { if (_exteriorPeersInFlight.get(key) === p) _exteriorPeersInFlight.delete(key); });
        if (id) _exteriorPeersInFlight.set(key, p);
        return p;
    }
    async function refreshExteriorPeerFloorsOnce(bldg, currentCode, opts) {
        const o = opts || {};
        if (!bldg || !bldg.id) return { ok: false, merged: 0, skipped: 'nobuilding', failed: [] };
        if (!db || !window.state.companyId) return { ok: false, merged: 0, skipped: 'nologin', failed: [] };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, merged: 0, skipped: 'offline', failed: [] };
        const labelOf = (code) => {
            const f = (bldg.floorsList || []).find((x) => x && String(x.floorCode) === String(code));
            return f ? (f.floorLabel || '') : undefined;
        };
        const isExt = (code) => typeof window.isExteriorFloorCode === 'function'
            && !!window.isExteriorFloorCode(code, labelOf(code));
        if (!isExt(currentCode)) return { ok: true, merged: 0, skipped: 'notexterior', failed: [] };
        const codes = buildingFloorCodesForBackup(bldg).filter((c) => c !== currentCode && isExt(c));
        if (!codes.length) return { ok: true, merged: 0, skipped: 'nopeers', failed: [] };
        if (!o.force && Date.now() - (_exteriorPeersFreshAt.get(bldg.id) || 0) < EXTERIOR_PEERS_FRESH_MS) {
            return { ok: true, merged: 0, skipped: 'recent', failed: [] };
        }
        for (let i = 0; i < 10 && (_syncInFlight || isRemoteSyncing); i++) {
            await new Promise((r) => setTimeout(r, 500));
        }
        const failed = [];
        let merged = 0;
        await runPool(codes, FLOOR_READ_CONCURRENCY, async (code) => {
            try {
                const bundle = await readFloorBundleStrict(bldg, code);
                if (bundle && mergeFloorDefectsOnlyIntoState(bldg, code, bundle)) merged++;
            } catch (e) {
                console.warn(`[외부 번호] ${code} 면을 받지 못함:`, e);
                failed.push(code);
            }
        });
        let changes = [];
        if (merged && typeof resolveExteriorDefectNoConflicts === 'function') {
            changes = resolveExteriorDefectNoConflicts(bldg, [currentCode].concat(codes), isExt);
        }
        if ((merged || changes.length) && typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (!failed.length) _exteriorPeersFreshAt.set(bldg.id, Date.now());
        return { ok: !failed.length, merged, skipped: null, failed, changes };
    }
    window.refreshExteriorPeerFloorsFromServer = refreshExteriorPeerFloorsFromServer;

    /**
     * 오프라인 준비(2026-10-07) — 이 건물의 모든 층을 미리 받아 IndexedDB에 둔다.
     * 인터넷이 끊겨도 층 전환·도면·사진이 열리게. 서버에는 아무것도 쓰지 않는다(읽기만).
     *  1) 층 데이터: 층마다 묶음 1회 읽기 → 동기화와 같은 합치기(안 올라간 내 수정은 그대로)
     *  2) 도면: 기본 해상도(4000) — 기기에 있으면 안 읽음. 옵션으로 확대용 8000
     *  3) 사진: Storage 주소에서 받기(Firestore 읽기 아님). 주소를 모르는 사진만 사진 문서 1회 읽기
     * opts: { hiRes, onProgress({phase, done, total, bytes, label}), isCancelled() }
     */
    let _offlinePrepRunning = false;
    async function runOfflinePrep(bldg, opts) {
        const o = opts || {};
        const prep = window.BSA && window.BSA.offlinePrep;
        if (!prep) throw new Error('오프라인 준비 모듈을 불러오지 못했습니다.');
        if (!bldg || !bldg.id) throw new Error('건물을 먼저 골라 주세요.');
        if (!db || !window.state.companyId) throw new Error('로그인한 뒤에 쓸 수 있습니다.');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('인터넷에 연결된 상태에서 준비해 주세요.');
        if (_offlinePrepRunning) throw new Error('이미 준비 중입니다.');
        _offlinePrepRunning = true;
        const cancelled = () => (typeof o.isCancelled === 'function' && o.isCancelled());
        let bytes = 0;
        const report = (phase, done, total, label) => {
            if (typeof o.onProgress === 'function') {
                try { o.onProgress({ phase, done, total, bytes, label: label || '' }); } catch (_e) { /* ignore */ }
            }
        };
        const prevRec = await prep.getStatus(bldg.id);
        const ownPrevPhotoKeys = (prevRec && prevRec.downloadedPhotoKeys) || [];
        const downloadedPhotoKeys = new Set(ownPrevPhotoKeys);
        // 다른 회차가 받아 둔 같은 사진(회차 복사로 ID 공유)도 이 회차 몫으로 기록 — 그래야 나중에 이 회차만 남았을 때 비울 수 있다
        (await prep.listStatuses()).forEach((r) => {
            if (r && r.buildingId !== bldg.id) (r.downloadedPhotoKeys || []).forEach((k) => downloadedPhotoKeys.add(k));
        });
        const rec = {
            buildingId: bldg.id,
            name: bldg.name || '',
            at: Date.now(),
            complete: false,
            hiRes: !!o.hiRes,
            floors: { ok: 0, total: 0, failed: [] },
            drawings: { ok: 0, total: 0, failed: [] },
            photos: { ok: 0, total: 0, failed: 0, reads: 0 },
            bytes: 0,
            downloadedPhotoKeys: []
        };
        try {
            if (navigator.storage && typeof navigator.storage.persist === 'function') {
                try { await navigator.storage.persist(); } catch (_e) { /* 브라우저가 거절해도 계속 */ }
            }
            // 동기화가 도는 중이면 잠깐 기다린다 — 같은 층을 동시에 합치지 않게
            for (let i = 0; i < 10 && (_syncInFlight || isRemoteSyncing); i++) {
                await new Promise((r) => setTimeout(r, 500));
            }
            // 1) 층 데이터
            const floorCodes = prep.uniqueFloorCodes(
                buildingFloorCodesForBackup(bldg).concat(((bldg.floorsList) || []).map((f) => f && f.floorCode), ['ROUND_SKETCH_MEMO'])
            );
            rec.floors.total = floorCodes.length;
            const urlsById = {};
            let merged = 0;
            let floorsDone = 0;
            await runPool(floorCodes, FLOOR_READ_CONCURRENCY, async (code) => {
                if (cancelled()) return;
                try {
                    const bundle = await readFloorBundleStrict(bldg, code);
                    if (bundle) {
                        mergeFloorBundleIntoState(bldg, code, bundle);
                        merged++;
                        const map = bundle.photos && bundle.photos.urlsById;
                        if (map && typeof map === 'object') Object.assign(urlsById, map);
                    }
                    rec.floors.ok++;
                } catch (e) {
                    console.warn('[오프라인 준비] 층 받기 실패:', code, e);
                    rec.floors.failed.push(code);
                }
                report('floors', ++floorsDone, floorCodes.length, code);
            });
            if (cancelled()) throw new Error('취소했습니다.');
            report('floors', floorCodes.length, floorCodes.length);
            if (merged && typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            // 방금 전 층을 받았으니 보고서 직전 전 층 받기가 같은 문서를 또 읽지 않게
            if (!rec.floors.failed.length) _buildingFloorsFreshAt.set(bldg.id, Date.now());

            // 2) 도면
            // 도면이 있다고 알려진 층 + 서버에 있을 수 있는 층. 시도해 보고 원래 도면이 없던 층은 실패로 세지 않는다.
            const drawFloors = floorCodes.filter((fc) => !isDeletedDrawingFloor(bldg, fc)
                && (floorHasDrawingData(bldg, fc) || floorMayExistOnCloud(bldg, fc)));
            for (let i = 0; i < drawFloors.length; i++) {
                if (cancelled()) throw new Error('취소했습니다.');
                const fc = drawFloors[i];
                const knownDrawing = floorHasDrawingData(bldg, fc);
                report('drawings', i, drawFloors.length, fc);
                try {
                    await withTimeout(hydrateFloorDrawingFromCloud(bldg, fc, { skipHiTiers: true, needPdf: false }), 90000, '도면 받기 시간 초과');
                    let base = bldg.floorDrawings && bldg.floorDrawings[fc];
                    if (!isUsableRasterDrawingUrl(base)) base = await idbGetFloorDrawingTier(bldg.id, fc, 4000);
                    if (!isUsableRasterDrawingUrl(base)) base = await idbGet('floorDrawings', `${bldg.id}_${fc}`);
                    if (isUsableRasterDrawingUrl(base) && String(base).indexOf('data:') === 0) {
                        // 기기 저장소에 확실히 남긴다(메모리에만 있던 경우)
                        const idbKey = `${bldg.id}_${fc}`;
                        const stored = await idbGet('floorDrawings', idbKey);
                        if (!isUsableRasterDrawingUrl(stored)) {
                            await idbSet('floorDrawings', idbKey, base);
                            _idbPersistedDrawingKeys.add(idbKey);
                        }
                        bytes += prep.dataUrlBytes(base);
                        rec.drawings.ok++;
                        rec.drawings.total++;
                    } else if (knownDrawing) {
                        rec.drawings.failed.push(fc);
                        rec.drawings.total++;
                    }
                    if (o.hiRes) {
                        let hi = await idbGetFloorDrawingTier(bldg.id, fc, 8000);
                        if (!isUsableRasterDrawingUrl(hi)) hi = await fetchAndCacheCloudFloorDrawingTier(bldg, fc, 8000);
                        if (isUsableRasterDrawingUrl(hi)) bytes += prep.dataUrlBytes(hi);
                    }
                } catch (e) {
                    console.warn('[오프라인 준비] 도면 받기 실패:', fc, e);
                    rec.drawings.failed.push(fc);
                    rec.drawings.total++;
                }
            }
            report('drawings', drawFloors.length, drawFloors.length);

            // 3) 사진(결함 현재·이전 회차 + 비파괴 측정지·비교사진)
            const refs = prep.collectDefectPhotoRefs(window.state.defects, bldg.id, urlsById, window._photoCache);
            const strengthKeys = Array.from(collectStrengthPhotoIdsInBuilding(bldg.id) || [])
                .map((pid) => ({ key: getStrengthPhotoDocId(bldg.id, pid), url: null, kind: 'ndt' }));
            const jobs = refs.concat(strengthKeys);
            rec.photos.total = jobs.length;
            rec.photoKeys = jobs.map((j) => j.key);
            let doneCount = 0;
            const companyReady = !!(db && window.state.companyId);
            // 2026-11-06 지난번에 다 받은 사진은 있는지만 본다. 다시 받기마다 전 사진을 통째로 읽어(장당 수 MB) 아주 느렸다
            const prevPhotoOk = new Set((prevRec && prevRec.complete && prevRec.photoKeys) || []);
            const prevPhotoAvg = (prevRec && prevRec.complete && prevRec.photos && prevRec.photos.total)
                ? Math.round((Number(prevRec.photosBytes) || 0) / prevRec.photos.total) : 0;
            const fetchOne = async (job) => {
                if (cancelled()) return;
                if (!window._photoCache) window._photoCache = {};
                if (prevPhotoOk.has(job.key) && await idbHas('photos', job.key)) {
                    bytes += prevPhotoAvg;
                    rec.photos.ok++;
                    if (downloadedPhotoKeys.has(job.key)) rec.downloadedPhotoKeys.push(job.key);
                    return;
                }
                const local = await idbGet('photos', job.key);
                if (prep.isDataUrl(local)) {
                    bytes += prep.dataUrlBytes(local);
                    rec.photos.ok++;
                    if (downloadedPhotoKeys.has(job.key)) rec.downloadedPhotoKeys.push(job.key);
                    return;
                }
                const mem = window._photoCache[job.key];
                if (prep.isDataUrl(mem)) {
                    await idbSet('photos', job.key, mem);
                    bytes += prep.dataUrlBytes(mem);
                    rec.photos.ok++;
                    return;
                }
                let dataUrl = null;
                let url = job.url || (prep.isHttpUrl(local) ? local : null) || (prep.isHttpUrl(mem) ? mem : null);
                if (!url && companyReady && !_nonExistentPhotoIds.has(job.key) && !isFirestoreReadPaused()) {
                    const snap = await fetchPhotosDocIfAllowed(job.key);
                    rec.photos.reads++;
                    if (snap && snap.exists) {
                        const data = snap.data() || {};
                        if (hasFirebaseStorageMeta(data)) markPhotoOnStorage(job.key);
                        const resolved = await resolvePhotoUrlFromSnapData(data);
                        if (prep.isDataUrl(resolved)) dataUrl = resolved;
                        else if (prep.isHttpUrl(resolved)) url = resolved;
                    } else if (snap && !snap.exists) {
                        _nonExistentPhotoIds.add(job.key);
                    }
                }
                if (!dataUrl && url) {
                    const sa = window.BSA && window.BSA.storageAssets;
                    try {
                        if (sa && typeof sa.materializeCloudAssetPayload === 'function') {
                            dataUrl = await sa.materializeCloudAssetPayload(url, {});
                        }
                    } catch (_e) { dataUrl = null; }
                    if (!prep.isDataUrl(dataUrl)) {
                        try { dataUrl = await fetchStorageImageViaProxy(url); } catch (_e) { dataUrl = null; }
                    }
                }
                if (prep.isDataUrl(dataUrl)) {
                    await idbSet('photos', job.key, dataUrl);
                    window._photoCache[job.key] = dataUrl;
                    bytes += prep.dataUrlBytes(dataUrl);
                    rec.photos.ok++;
                    rec.downloadedPhotoKeys.push(job.key);
                    markPhotoOnStorage(job.key);   // 서버(Storage)에서 받은 사진 — 다시 올릴 필요 없음
                } else {
                    rec.photos.failed++;
                }
            };
            const queue = jobs.slice();
            const worker = async () => {
                while (queue.length && !cancelled()) {
                    const job = queue.shift();
                    await yieldToUiGesture();
                    try { await fetchOne(job); } catch (e) {
                        rec.photos.failed++;
                        console.warn('[오프라인 준비] 사진 받기 실패:', job && job.key, e);
                    }
                    doneCount++;
                    report('photos', doneCount, jobs.length);
                }
            };
            report('photos', 0, jobs.length);
            const bytesBeforePhotos = bytes;
            await Promise.all([0, 1, 2, 3, 4, 5].map(() => worker()));
            rec.photosBytes = bytes - bytesBeforePhotos;
            if (cancelled()) throw new Error('취소했습니다.');
            // 이번 화면 층 사진도 기기 사본으로 다시 붙인다
            try { await hydrateCurrentBuildingDefectPhotosIntoState(); } catch (_e) { /* ignore */ }

            rec.bytes = bytes;
            rec.complete = !rec.floors.failed.length && !rec.drawings.failed.length && !rec.photos.failed;
            rec.at = Date.now();
            await prep.putStatus(rec);
            report('done', 1, 1);
            return rec;
        } catch (e) {
            rec.bytes = bytes;
            rec.complete = false;
            rec.error = String((e && e.message) || e);
            rec.at = Date.now();
            // 받은 사진 기록은 남겨 비우기 때 지울 수 있게
            rec.downloadedPhotoKeys = Array.from(new Set(rec.downloadedPhotoKeys.concat(ownPrevPhotoKeys)));
            await prep.putStatus(rec);
            throw e;
        } finally {
            _offlinePrepRunning = false;
        }
    }
    window.runOfflinePrep = runOfflinePrep;

    /**
     * 오프라인 준비 비우기 — 이 기능이 서버에서 받아 온 사진 사본과 확대용 8000 도면만 지운다.
     * 이 기기에서 찍었거나 아직 안 올라간 사진은 기록에 없으므로 건드리지 않는다. 기본 도면은 점검에 꼭 필요해 둔다.
     */
    /** 이 건물(동)의 데이터가 쓰는 사진 키 전부 — 결함 현재·이전 회차 + 비파괴 측정지·비교사진 */
    function offlinePrepPhotoKeysOfBuilding(bldgId) {
        const prep = window.BSA && window.BSA.offlinePrep;
        const keys = new Set();
        if (!prep || !bldgId) return keys;
        prep.collectDefectPhotoRefs(window.state.defects, bldgId, null, null).forEach((r) => keys.add(r.key));
        Array.from(collectStrengthPhotoIdsInBuilding(bldgId) || []).forEach((pid) => keys.add(getStrengthPhotoDocId(bldgId, pid)));
        return keys;
    }

    /**
     * 오프라인 준비 비우기(2026-10-09 회차별) — bldgs: 비울 회차의 동 목록(건물 하나만 넘겨도 됨).
     * 이 기능이 서버에서 받아 온 사진 사본만 지우고, **다른 회차(동)가 쓰거나 받아 둔 사진은 남긴다**
     * (회차를 복사하면 사진 ID가 이어져 같은 사진을 함께 쓴다). 기기에서 찍은 사진·기본 도면·결함 데이터는 그대로.
     */
    async function clearOfflinePrep(bldgsArg) {
        const prep = window.BSA && window.BSA.offlinePrep;
        const bldgs = (Array.isArray(bldgsArg) ? bldgsArg : [bldgsArg]).filter((b) => b && b.id);
        if (!prep || !bldgs.length) return { removed: 0, kept: 0 };
        const clearIds = new Set(bldgs.map((b) => b.id));
        const all = await prep.listStatuses();
        const mine = all.filter((r) => r && clearIds.has(r.buildingId));
        const candidates = [];
        // 2026-10-16 비우기 고침: 예전에는 「준비 때 서버에서 새로 받은 사진」만 지울 후보였다. 이미 이 기기에 있던 사진,
        // 현장에서 찍어 나중에 올라간 사진은 후보가 아니었고, 여러 회차를 준비하면 겹치는 사진 ID가 서로를 보호해
        // 실제로는 거의 아무것도 안 지워졌다(「사진 0장」). 이제는 그 회차(동)의 사진 전부가 후보이고,
        // 서버(Storage)에 있는 것이 확인된 사본만 지운다.
        mine.forEach((r) => {
            (r.downloadedPhotoKeys || []).forEach((k) => candidates.push(k));
            (r.photoKeys || []).forEach((k) => candidates.push(k));
        });
        bldgs.forEach((b) => offlinePrepPhotoKeysOfBuilding(b.id).forEach((k) => candidates.push(k)));
        // 남기는 사진: 오프라인 준비해 둔 다른 회차(동)가 쓰는 사진(지금 기기 데이터 + 준비 기록) + 지금 열어 둔 건물 사진.
        // 준비하지 않은 회차는 어차피 인터넷으로 다시 받으므로 막지 않는다(서버 사본이 있는 사진만 지움).
        const protectedKeys = new Set();
        const keepBldgIds = new Set(all.filter((r) => r && !clearIds.has(r.buildingId)).map((r) => r.buildingId));
        if (window.state.currentBuildingId && !clearIds.has(window.state.currentBuildingId)) keepBldgIds.add(window.state.currentBuildingId);
        keepBldgIds.forEach((id) => offlinePrepPhotoKeysOfBuilding(id).forEach((k) => protectedKeys.add(k)));
        all.forEach((r) => {
            if (!r || clearIds.has(r.buildingId)) return;
            (r.photoKeys || []).forEach((k) => protectedKeys.add(k));
        });
        const safe = prep.photoKeysSafeToDelete(candidates, protectedKeys);
        let removed = 0;
        for (const key of safe) {
            if (!isPhotoMarkedOnStorage(key)) continue;   // 서버 사본이 확인된 사진만
            try {
                await idbDelete('photos', key);
                if (window._photoCache && prep.isDataUrl(window._photoCache[key])) delete window._photoCache[key];
                _idbPersistedPhotoKeys.delete(key);
                removed++;
            } catch (_e) { /* ignore */ }
        }
        let notOnServer = 0;
        for (const key of safe) if (!isPhotoMarkedOnStorage(key)) notOnServer++;
        const kept = new Set(candidates).size - safe.length;
        for (const b of bldgs) {
            const rec = mine.find((r) => r.buildingId === b.id);
            if (rec) {
                for (const fc of buildingFloorCodesForBackup(b)) {
                    try { await idbDelete('floorDrawingTiers', floorDrawingTierIdbKey(b.id, fc, 8000)); } catch (_e) { /* ignore */ }
                }
            }
            await prep.deleteStatus(b.id);
        }
        return { removed, kept, notOnServer };
    }
    window.clearOfflinePrep = clearOfflinePrep;

    // ---- 2026-10-16 인터넷이 돌아오면: 오프라인 작업 자동 올리기 → 서버에서 다시 읽어 확인 → 「오프라인 데이터 비울까요?」 ----
    // 올리기 자체는 평소 동기화(syncStateToFirebase: 층 묶음 + 사진 Storage 업로드)를 그대로 쓴다. 여기서는
    //  ① 남은 것이 없을 때까지 동기화를 돌리고 ② 오프라인 준비한 동마다 서버 층 묶음을 다시 읽어 이 기기의 마킹이 다 있는지,
    //  이 기기에 있는 사진이 서버에 올라간 것으로 표시됐는지 확인한 뒤 ③ 전부 맞을 때만 비울지 묻는다.
    //  하나라도 안 맞으면 묻지 않고 무엇이 안 올라갔는지 보여 준다(아무것도 지우지 않음).
    let _offlineReturnRunning = false;
    function collectMarkingIdsDeep(v, out, depth) {
        if (!v || depth > 4) return;
        if (Array.isArray(v)) { v.forEach((x) => collectMarkingIdsDeep(x, out, depth + 1)); return; }
        if (typeof v === 'object') {
            if (typeof v.id === 'string' && (v.defectType !== undefined || v.no !== undefined || v.x !== undefined)) out.add(v.id);
            Object.keys(v).forEach((k) => { const c = v[k]; if (c && typeof c === 'object') collectMarkingIdsDeep(c, out, depth + 1); });
        }
    }
    async function verifyBuildingOnServer(bldg) {
        const problems = [];
        const prefix = `${bldg.id}_`;
        if (Array.from(_dirtyFloorKeys).some((k) => String(k).startsWith(prefix))) problems.push('아직 안 올라간 층 변경');
        // 2026-10-19 진행률 일지: 서버 확인이 안 된 이 기기 변경이 남았으면 비우지 않는다
        try {
            const j = typeof syncJournal === 'function' ? syncJournal() : null;
            const n = j ? j.pendingEntries().filter((e) => e.fk && String(e.fk).startsWith(prefix)).length : 0;
            if (n) problems.push(`이 기기 변경 ${n}건 서버 확인 안 됨`);
        } catch (_e) { /* ignore */ }
        const verifyFloors = buildingFloorCodesForBackup(bldg);
        const verifyRead = new Map();
        await runPool(verifyFloors.filter((fc) => ((window.state.defects && window.state.defects[`${bldg.id}_${fc}`]) || []).length), FLOOR_READ_CONCURRENCY, async (fc) => {
            try { verifyRead.set(fc, { bundle: await readFloorBundleStrict(bldg, fc) }); } catch (e) { verifyRead.set(fc, { failed: true }); }
        });
        for (const fc of verifyFloors) {
            const local = (window.state.defects && window.state.defects[`${bldg.id}_${fc}`]) || [];
            if (!local.length) continue;
            const readRes = verifyRead.get(fc);
            if (!readRes || readRes.failed) { problems.push(`${fc} 서버 읽기 실패`); continue; }
            const bundle = readRes.bundle;
            const ids = new Set();
            collectMarkingIdsDeep(bundle && bundle.markings, ids, 0);
            // 2026-11-06 서버에 삭제 기록이 있는 마킹은 못 올린 것이 아니라 다른 기기가 지운 것 — 평소 동기화와 같은 규칙으로
            // 이 기기에도 반영한다(이 기기의 오프라인 수정이 지운 시각보다 뒤면 합치기가 살려 두고, 그건 올릴 것으로 표시).
            const guard = window.BSA.floorSyncGuard;
            const serverMarkings = (bundle && bundle.markings) || {};
            let split = guard.splitMissingMarkings(local, ids, serverMarkings.deletedIds);
            if (split.deletedElsewhere.length) {
                const floorKey = `${bldg.id}_${fc}`;
                await waitForUiGestureIdle();
                const merged = mergeDefectsMaps(
                    { [floorKey]: serverMarkings.items || [] },
                    { [floorKey]: window.state.defects[floorKey] || [] },
                    { [floorKey]: serverMarkings.deletedIds || [] },
                    { [floorKey]: (window.state.deletedDefectIds || {})[floorKey] || [] },
                    { [floorKey]: serverMarkings.deletedAt || {} },
                    { [floorKey]: (window.state.deletedDefectAt || {})[floorKey] || {} }
                );
                window.state.defects[floorKey] = merged.defects[floorKey] || [];
                if (!window.state.deletedDefectIds) window.state.deletedDefectIds = {};
                if (!window.state.deletedDefectAt) window.state.deletedDefectAt = {};
                window.state.deletedDefectIds[floorKey] = (merged.deletedDefectIds || {})[floorKey] || [];
                window.state.deletedDefectAt[floorKey] = (merged.deletedDefectAt || {})[floorKey] || {};
                _suppressSyncOnSave = true;
                try { if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage(); } finally { _suppressSyncOnSave = false; }
                if (floorKey === currentInspectionFloorKey()) {
                    if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                    if (typeof drawCanvas === 'function') drawCanvas();
                }
                const survived = guard.splitMissingMarkings(window.state.defects[floorKey], ids, serverMarkings.deletedIds);
                if (survived.deletedElsewhere.length) {
                    markFloorKeyDirty(floorKey);
                    problems.push(`${fc} 마킹 ${survived.deletedElsewhere.length}개 아직 안 올라감`);
                }
                split = survived;
            }
            if (split.missing.length) problems.push(`${fc} 마킹 ${split.missing.length}개 서버에 없음`);
        }
        let photoMissing = 0;
        for (const key of offlinePrepPhotoKeysOfBuilding(bldg.id)) {
            if (isPhotoMarkedOnStorage(key)) continue;
            let local = null;
            try { local = await idbGet('photos', key); } catch (_e) { local = null; }
            const prep = window.BSA && window.BSA.offlinePrep;
            if (local && prep && prep.isDataUrl(local)) photoMissing++;   // 이 기기에만 있는 사진
        }
        if (photoMissing) problems.push(`사진 ${photoMissing}장 아직 안 올라감`);
        return problems;
    }
    async function runOfflineReturnSync(reason) {
        if (_offlineReturnRunning) return;
        if (!db || !window.state.companyId || navigator.onLine === false) return;
        const prep = window.BSA && window.BSA.offlinePrep;
        if (!prep) return;
        // 2026-10-20 자동(시작·온라인·포커스)은 멈춘 올리기나 백오프 중이면 돌리지 않는다 — 매번 전 층을 서버에서 다시 읽던 것 방지
        const manual = reason === 'manual';
        try { unparkFixedSyncErrors(); } catch (_e) { /* ignore */ }
        if (!manual) {
            const g = syncGate();
            if (g && !g.autoAllowed()) return;
        }
        _offlineReturnRunning = true;
        try {
            let offlineWorked = false;
            try { offlineWorked = localStorage.getItem('bsa_offline_worked_v1') === '1'; } catch (_e) { /* ignore */ }
            // 오프라인을 겪은 적이 없으면(준비만 해 둔 상태) 비울지 묻지 않는다 — 현장 가기 전 준비가 지워지면 안 된다
            const statuses = offlineWorked ? (await prep.listStatuses()).filter(Boolean) : [];
            // 2026-11-06 올릴 층이 없어도 일지에 남은 사진은 올린다(동기화가 안 돌면 영영 안 올라감)
            // 2026-11-07 밀린 사진이 많아도 아래 층 올리기를 막지 않는다(길어지면 뒤에서 계속)
            try {
                await runPhotoPhaseWithinBudget([], async () => { await uploadPendingJournalPhotos(); return new Set(); });
            } catch (e) { console.warn('[오프라인 복귀] 남은 사진 올리기 실패', e); }
            const hadPending = _dirtyFloorKeys.size > 0 || ((window._defectPhotoSaves && window._defectPhotoSaves.size) || 0) > 0;
            if (!statuses.length && !hadPending) return;
            if (typeof syncProgressBegin === 'function') syncProgressBegin();
            // ① 올리기
            for (let i = 0; i < 15; i++) {
                if (navigator.onLine === false) return;
                const saves = Array.from(window._defectPhotoSaves || []);
                if (saves.length) await Promise.all(saves.map((p) => Promise.resolve(p).catch(() => {})));
                if (!_dirtyFloorKeys.size) break;
                if (_syncInFlight || isRemoteSyncing) { await new Promise((r) => setTimeout(r, 800)); continue; }
                const before = _dirtyFloorKeys.size;
                try { await syncStateToFirebase(); } catch (e) { console.warn('[오프라인 복귀] 올리기 실패', e); }
                // 실패해서 백오프·멈춤이면 여기서 15번 몰아 돌리지 않는다(백오프 타이머가 다시 한다)
                if (_syncRetryTimer || isSyncParked() || _dirtyFloorKeys.size >= before) break;
                await new Promise((r) => setTimeout(r, 400));
            }
            // 2026-11-04 층은 올라갔어도 회사 문서(건물 목록) 쓰기가 실패해 멈춤·재시도 중이면 「올렸습니다」를 띄우지 않는다
            if (hadPending && !_dirtyFloorKeys.size && !isSyncParked() && !_syncRetryTimer) window.showToast('오프라인에서 작업한 내용을 서버에 올렸습니다.', 'success', 3500);
            if (!statuses.length) {
                if (_dirtyFloorKeys.size) window.showToast(`아직 서버에 못 올린 층이 ${_dirtyFloorKeys.size}개 있습니다. 인터넷을 확인해 주세요.`, 'warning', 6000);
                // 2026-10-19 다 올렸으면 최근 연 건물의 모든 층을 서버 최신으로(읽기만) — 안 연 층도 다음 오프라인 때 최신에서 시작
                else if (hadPending) await refreshRecentBuildingsAfterReturn(new Set());
                return;
            }
            // ② 서버에서 다시 읽어 확인(오프라인 준비한 동만)
            const bldgs = statuses.map((r) => (window.state.buildings || []).find((b) => b && b.id === r.buildingId)).filter(Boolean);
            const failed = [];
            // 2026-10-20 서버 확인(층마다 서버 읽기)은 실패가 이어지면 백오프·멈춤 — 자동으로 매번 전 층을 다시 읽지 않게
            const vg = offlineVerifyGate();
            if (!manual && vg && !vg.autoAllowed()) return;
            if (_dirtyFloorKeys.size) {
                if (vg) vg.fail({ code: 'pending', message: '아직 안 올라간 층' });
                return;
            }
            _floorBundleMemo = new Map();
            for (const b of bldgs) {
                const probs = await verifyBuildingOnServer(b);
                if (probs.length) failed.push(`${b.name || b.id}: ${probs.join(', ')}`);
            }
            if (failed.length) {
                if (vg) vg.fail({ code: 'verify', message: failed.join('; ') });
                window.showToast('서버에 아직 다 올라가지 않아 오프라인 데이터를 그대로 둡니다.', 'warning', 6000);
                await window.appAlert(`서버 확인 결과 아직 안 올라간 것이 있습니다. 오프라인 데이터는 지우지 않았습니다.\n\n${failed.join('\n')}\n\n인터넷이 다시 연결되거나 앱을 다시 열면 자동으로 다시 확인합니다.`, { title: '오프라인 데이터' });
                return;
            }
            // ③ 2026-10-19 다 올라간 것을 확인했다 → 서버의 최신(다른 사람이 고친 층 포함)으로 모든 층·도면·새 사진을 다시 받아
            //    오프라인 준비 상태로 둔다(읽기만). 진행: 오프라인 준비 창 「다시 받는 중 n/m층」 → 「오프라인 준비 완료 (시각)」.
            //    (예전에는 여기서 「오프라인 데이터 비울까요?」를 물었다 — 비우기는 오프라인 준비 창의 「비우기」 버튼으로 한다)
            if (vg) vg.ok();
            try { localStorage.removeItem('bsa_offline_worked_v1'); } catch (_e) { /* ignore */ }
            window.showToast('모두 서버에 올라간 것을 확인했습니다. 최신 데이터를 다시 받아 오프라인 준비를 새로 합니다…', 'info', 4000);
            const rr = await refreshOfflineBuildingsAfterReturn(bldgs);
            // 2026-11-02 전부 올라간 것을 확인했다 → 2일 유예 뒤 기기의 오프라인 데이터를 지운다(서버에만 남김). 새 오프라인 작업·손으로 새로 받기를 하면 멈춤.
            try { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.stamp(bldgs.map((b) => b.id)); } catch (_e) { /* ignore */ }
            if (rr.failed.length) {
                window.showToast(`최신으로 다시 받기가 일부 실패했습니다 (${rr.failed.map((b) => b.name || b.id).join(', ')}). 오프라인 준비 창에서 「최신으로 다시 받기」를 눌러 주세요.`, 'warning', 7000);
            } else {
                window.showToast(`오프라인 준비 완료 — 서버 최신으로 다시 받았습니다 (${bldgs.map((b) => b.name || b.id).join(', ')})`, 'success', 5000);
            }
        } catch (e) {
            console.warn('[오프라인 복귀] 실패', e);
        } finally {
            _floorBundleMemo = null;
            _offlineReturnRunning = false;
            // 2026-10-19 올리기·확인·다시 받기가 끝난 뒤에만 오래된 캐시 정리(보호 규칙은 정리 함수 안에서 다시 확인)
            setTimeout(() => {
                if (typeof pruneStaleIndexedDbInspectionData === 'function') pruneStaleIndexedDbInspectionData().catch(() => {});
            }, 1500);
        }
    }

    // ---- 2026-11-02 오프라인 데이터 2일 유예 삭제 ----
    // 「오프라인 데이터 서버에 다 올렸으면 2일 유예를 주고 오프라인 데이터를 삭제해서 서버에만 남겨」
    // 올리고 서버 확인(runOfflineReturnSync ③)이 끝난 시각을 건물마다 적어 두고, 2일이 지나면
    //  ① 다시 한 번 서버에 다 올라가 있는지 확인(안 올라간 게 있으면 지우지 않음)한 뒤
    //  ② 오프라인 준비 기록·받아 둔 사진·8000 도면 → 기기의 도면·사진 사본을 지운다.
    // 지우지 않는 것: 아직 서버에 안 올라간 사진·변경(진행률 일지·올릴 층)이 있는 건물, 지금 열어 둔 건물(다음에 다시 본다).
    // 새 오프라인 작업(오프라인 전환)·손으로 오프라인 준비를 다시 하면 표시를 지워 카운트다운이 멈춘다.
    const OFFLINE_EXPIRY_GRACE_MS = 2 * 24 * 60 * 60 * 1000;
    const OFFLINE_EXPIRY_RETRY_MS = 6 * 60 * 60 * 1000;
    let _offlineExpiryRunning = false;
    function offlineExpiryKey(kind) { return `bsa_offline_expiry_${kind}_v1_${(window.state && window.state.companyId) || ''}`; }
    function readOfflineExpiry(kind) {
        try { return JSON.parse(localStorage.getItem(offlineExpiryKey(kind)) || '{}') || {}; } catch (_e) { return {}; }
    }
    function writeOfflineExpiry(kind, obj) {
        try { localStorage.setItem(offlineExpiryKey(kind), JSON.stringify(obj || {})); } catch (_e) { /* ignore */ }
    }
    window.bsaOfflineExpiry = {
        GRACE_MS: OFFLINE_EXPIRY_GRACE_MS,
        stamp(ids) {
            const m = readOfflineExpiry('at');
            const now = Date.now();
            (ids || []).forEach((id) => { if (id) m[id] = now; });
            writeOfflineExpiry('at', m);
        },
        clear(id) {
            const m = readOfflineExpiry('at');
            if (id && m[id] != null) { delete m[id]; writeOfflineExpiry('at', m); }
        },
        clearAll() {
            if (Object.keys(readOfflineExpiry('at')).length) writeOfflineExpiry('at', {});
        },
        pending() { return readOfflineExpiry('at'); },
        async run(reason) {
            if (_offlineExpiryRunning) return { skipped: 'running' };
            if (!db || !window.state || !window.state.companyId || navigator.onLine === false) return { skipped: 'offline' };
            const guard = window.BSA && window.BSA.cachePurgeGuard;
            if (!guard || typeof guard.offlineExpiryDue !== 'function') return { skipped: 'noguard' };
            const stamps = readOfflineExpiry('at');
            if (!Object.keys(stamps).length) return { skipped: 'none' };
            let why = '';
            try {
                why = guard.pruneBlockReason({
                    offlineReturnPending: localStorage.getItem('bsa_offline_worked_v1') === '1',
                    offlineReturnRunning: !!_offlineReturnRunning,
                    syncing: !!_syncInFlight,
                    dirtyCount: _dirtyFloorKeys.size,
                    photoSavesPending: (window._defectPhotoSaves && window._defectPhotoSaves.size) || 0
                });
            } catch (_e) { why = 'unknown'; }
            if (why) return { skipped: why };
            const lastTry = readOfflineExpiry('try');
            const due = guard.offlineExpiryDue(stamps, Date.now(), OFFLINE_EXPIRY_GRACE_MS, lastTry, OFFLINE_EXPIRY_RETRY_MS, window.state.currentBuildingId || null);
            if (!due.length) return { skipped: 'notdue' };
            _offlineExpiryRunning = true;
            const cleared = [];
            try {
                for (const id of due) {
                    if (navigator.onLine === false) break;
                    const b = (window.state.buildings || []).find((x) => x && x.id === id);
                    lastTry[id] = Date.now();
                    writeOfflineExpiry('try', lastTry);
                    if (!b) { this.clear(id); continue; } // 이미 없는 건물
                    // ① 지우기 직전에 서버에 다 올라가 있는지 다시 확인 — 하나라도 안 올라갔으면 지우지 않는다
                    let problems = [];
                    try { problems = await verifyBuildingOnServer(b); } catch (e) { problems = ['서버 확인 실패']; }
                    if (problems.length) { console.info('[오프라인 2일 삭제] 보류:', b.name || id, problems); continue; }
                    // ② 오프라인 준비 사본(받아 둔 사진·8000 도면·준비 기록) → 도면·사진 사본(서버에 안 올라간 사진은 남김)
                    try { await clearOfflinePrep([b]); } catch (e) { console.warn('[오프라인 2일 삭제] 준비 비우기 실패', e); continue; }
                    try { await purgeBuildingIndexedDbAssets(id, { keepUnuploaded: true }); } catch (e) { console.warn('[오프라인 2일 삭제] 기기 사본 삭제 실패', e); continue; }
                    this.clear(id);
                    delete lastTry[id];
                    cleared.push(b.name || id);
                }
                writeOfflineExpiry('try', lastTry);
            } finally {
                _offlineExpiryRunning = false;
            }
            if (cleared.length && typeof window.showToast === 'function') {
                window.showToast(`서버에 모두 올라간 지 2일이 지나 기기의 오프라인 데이터를 지웠습니다 (${cleared.join(', ')}). 서버에는 그대로 있습니다.`, 'info', 6000);
            }
            return { cleared };
        }
    };

    // ---- 2026-10-19 최신으로 다시 받기(오프라인 준비 상태 새로) ----
    // 「온라인 연결될 때마다 오프라인 상태에서 업데이트되어서 그게 다시 오프라인이 되어야」 — 올리고 확인한 뒤 서버의 합쳐진 최신을
    // 모든 층(안 연 층·다른 사람이 고친 층 포함) 다시 받아 기기(IndexedDB·localStorage)에 저장한다. 서버에는 쓰지 않는다(읽기만).
    let _offlineRefreshState = null;
    let _offlineRefreshStateKey = '';
    function offlineRefreshStorageKey() {
        return `bsa_offline_refresh_v1_${(window.state && window.state.companyId) || ''}`;
    }
    function offlineRefreshState() {
        const key = offlineRefreshStorageKey();
        if (_offlineRefreshState && _offlineRefreshStateKey === key) return _offlineRefreshState;
        let o = {};
        try { o = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (_e) { o = {}; }
        Object.keys(o).forEach((id) => { if (o[id]) o[id].running = false; });
        _offlineRefreshState = o;
        _offlineRefreshStateKey = key;
        return o;
    }
    function saveOfflineRefreshState() {
        const st = offlineRefreshState();
        const out = {};
        Object.keys(st).forEach((id) => {
            const v = st[id];
            if (v) out[id] = { at: v.at || 0, ok: v.ok, failed: (v.failed || []).slice(0, 50), error: v.error || '', kind: v.kind || '' };
        });
        try { localStorage.setItem(_offlineRefreshStateKey || offlineRefreshStorageKey(), JSON.stringify(out)); } catch (_e) { /* 용량 부족 무시 */ }
    }
    window.bsaOfflineRefreshState = (id) => (offlineRefreshState()[id] || null);

    /**
     * 건물 하나를 서버 최신으로 다시 받는다. opts.prepared: 오프라인 준비한 건물(층+도면+새 사진, runOfflinePrep)
     *  / 아니면 층 데이터만(refreshBuildingFloorsFromServer). opts.manual: 버튼 — 이 건물에 안 올린 수정이 있으면 먼저 올린다.
     * 합치기는 동기화와 같은 합치기라 아직 안 올라간 이 기기 수정은 그대로 남는다.
     */
    async function refreshOfflineBuildingNow(bldg, opts) {
        const o = opts || {};
        if (!bldg || !bldg.id) return { ok: false, skipped: 'nobuilding' };
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, skipped: 'offline' };
        const st = offlineRefreshState();
        const id = bldg.id;
        const prev = st[id] || {};
        if (prev.running) return { ok: false, skipped: 'running' };
        const kind = o.prepared ? 'prep' : 'floors';
        st[id] = Object.assign({}, prev, { running: true, phase: o.manual ? 'upload' : 'floors', done: 0, total: 0, error: '', kind });
        scheduleSyncProgressRender();
        try {
            if (o.manual && Array.from(_dirtyFloorKeys).some((k) => String(k).startsWith(`${id}_`))) {
                await flushBuildingEditsToServer(bldg);
            }
            st[id].phase = 'floors';
            const onProgress = (p) => {
                const cur = st[id];
                if (!cur || !cur.running) return;
                cur.phase = p.phase;
                cur.done = p.done;
                cur.total = p.total;
                scheduleSyncProgressRender();
            };
            let ok = false;
            let failed = [];
            if (o.prepared) {
                // 손으로 받는 중이면 끝날 때까지 기다린다(같은 층을 동시에 합치지 않게)
                for (let i = 0; i < 240 && _offlinePrepRunning; i++) await new Promise((r) => setTimeout(r, 500));
                const prep = window.BSA && window.BSA.offlinePrep;
                const prevRec = prep ? await prep.getStatus(id) : null;
                const rec = await runOfflinePrep(bldg, { hiRes: !!(prevRec && prevRec.hiRes), onProgress });
                ok = !!(rec && rec.complete);
                failed = (rec && rec.floors && rec.floors.failed) || [];
            } else {
                const res = await refreshBuildingFloorsFromServer(bldg, {
                    force: true,
                    onProgress: (done, total) => onProgress({ phase: 'floors', done, total })
                });
                ok = !!res.ok;
                failed = res.failed || [];
            }
            st[id] = { running: false, at: Date.now(), ok, failed, error: '', kind };
            return { ok, failed };
        } catch (e) {
            st[id] = { running: false, at: prev.at || 0, ok: prev.ok, failed: prev.failed || [], error: String((e && e.message) || e).slice(0, 140), kind };
            return { ok: false, error: e };
        } finally {
            saveOfflineRefreshState();
            scheduleSyncProgressRender();
        }
    }
    window.refreshOfflineBuildingNow = refreshOfflineBuildingNow;

    /** 최근 연 건물(오프라인 준비 안 한 것) — 최대 3개 */
    function recentlyOpenedBuildingsForRefresh(excludeIds) {
        let map = {};
        try { map = readBuildingAccessMap() || {}; } catch (_e) { map = {}; }
        const now = Date.now();
        const list = (window.state && window.state.buildings) || [];
        return Object.keys(map)
            .filter((id) => !(excludeIds && excludeIds.has(id)) && now - (Number(map[id]) || 0) < BUILDING_ACCESS_TTL_MS)
            .sort((a, b) => (Number(map[b]) || 0) - (Number(map[a]) || 0))
            .map((id) => list.find((b) => b && b.id === id))
            .filter((b) => b && !b.deletedAt && !b.trashedAt)
            .slice(0, 3);
    }
    async function refreshRecentBuildingsAfterReturn(excludeIds) {
        for (const b of recentlyOpenedBuildingsForRefresh(excludeIds)) {
            if (navigator.onLine === false) return;
            await refreshOfflineBuildingNow(b, { prepared: false });
        }
    }
    /** 복귀 뒤: 오프라인 준비한 건물은 모두(층·도면·새 사진) → 최근 연 다른 건물은 층 데이터만 */
    async function refreshOfflineBuildingsAfterReturn(preparedBldgs) {
        const done = [];
        const failed = [];
        for (const b of (preparedBldgs || [])) {
            if (navigator.onLine === false) { failed.push(b); continue; }
            const r = await refreshOfflineBuildingNow(b, { prepared: true });
            (r.ok ? done : failed).push(b);
        }
        await refreshRecentBuildingsAfterReturn(new Set((preparedBldgs || []).map((b) => b.id)));
        return { done, failed };
    }
    window.runOfflineReturnSync = runOfflineReturnSync;

    /** 이 건물과 같은 현장의 회차 목록(최근 회차 먼저). 회차마다 동 여러 개일 수 있다. */
    function offlinePrepRoundsOfSite(bldg) {
        const site = getBuildingSiteName(bldg);
        const byRound = new Map();
        (window.state.buildings || []).forEach((b) => {
            if (!b || !b.id || getBuildingSiteName(b) !== site) return;
            if (b.deletedAt || b.trashedAt) return;
            const rk = getBuildingSurveyRoundKey(b) || '_none';
            if (!byRound.has(rk)) byRound.set(rk, []);
            byRound.get(rk).push(b);
        });
        const keys = Array.from(byRound.keys()).sort((a, b) => {
            const ra = getSurveyRoundOrderRank(a);
            const rb = getSurveyRoundOrderRank(b);
            if (ra != null && rb != null && ra !== rb) return rb - ra;
            if (ra != null && rb == null) return -1;
            if (ra == null && rb != null) return 1;
            return String(b).localeCompare(String(a), 'ko');
        });
        return {
            site,
            rounds: keys.map((rk) => ({
                key: rk,
                label: rk === '_none' ? '회차 미지정' : formatSurveyRoundLabel(rk),
                buildings: byRound.get(rk)
            }))
        };
    }

    function ensureOfflinePrepModal() {
        let wrap = document.getElementById('offlinePrepModal');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.id = 'offlinePrepModal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-card bulk-restore-card offline-prep-card">
                <div class="modal-header">
                    <h3 id="offlinePrepTitle">오프라인 준비</h3>
                    <button type="button" class="modal-close" data-op-close title="닫기">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="offline-prep-sync" id="offlinePrepSync" aria-live="polite"></div>
                    <p class="bulk-restore-meta">받을 회차를 고르세요. 고른 회차의 모든 층(결함·비파괴), 도면, 사진을 이 기기에 받아 둡니다. 인터넷이 끊겨도 그 회차는 층을 바꾸고 도면·사진을 볼 수 있습니다. 서버 데이터는 바꾸지 않습니다. 전차 비교사진은 이번 회차를 받을 때 함께 받습니다.</p>
                    <div class="offline-prep-rounds" id="offlinePrepRounds"></div>
                    <label class="offline-prep-opt"><input type="checkbox" id="offlinePrepHiRes"> 확대용 고해상도 도면도 받기 (용량 큼)</label>
                    <div class="offline-prep-progress" id="offlinePrepProgressWrap" hidden>
                        <div class="offline-prep-bar"><div class="offline-prep-bar-fill" id="offlinePrepBar"></div></div>
                        <p class="bulk-restore-meta" id="offlinePrepProgressText"></p>
                    </div>
                    <p class="bulk-restore-meta" id="offlinePrepStorage"></p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" id="btnOfflinePrepCancel" style="display:none">멈추기</button>
                    <button type="button" class="btn btn-outline" data-op-close>닫기</button>
                    <button type="button" class="btn btn-primary" id="btnOfflinePrepStart"><i class="fa-solid fa-download"></i> 고른 회차 받기</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        // 2026-10-19 건물마다: 지금 다시 올리기 / 최신으로 다시 받기
        wrap.querySelector('#offlinePrepSync').addEventListener('click', async (e) => {
            const retry = e.target.closest('[data-op-sync-retry]');
            if (retry) { retrySyncProgress(); return; }
            const again = e.target.closest('[data-op-sync-refresh]');
            if (!again) return;
            const id = again.getAttribute('data-op-sync-refresh');
            const b = (window.state.buildings || []).find((x) => x && x.id === id);
            if (!b) return;
            if (navigator.onLine === false) { window.showToast('오프라인입니다. 인터넷이 연결되면 다시 받을 수 있습니다.', 'warning', 3000); return; }
            const prep = window.BSA && window.BSA.offlinePrep;
            let prepared = false;
            try { prepared = !!(prep && await prep.getStatus(id)); } catch (_e) { prepared = false; }
            again.disabled = true;
            const r = await refreshOfflineBuildingNow(b, { prepared, manual: true });
            if (r && r.skipped === 'running') return;
            window.showToast(r && r.ok ? (prepared ? '오프라인 준비 완료 — 서버 최신으로 다시 받았습니다.' : '서버 최신 층 데이터를 받았습니다.')
                : `다시 받기가 끝나지 않았습니다${r && r.error ? ` (${(r.error && r.error.message) || r.error})` : ''}.`, r && r.ok ? 'success' : 'warning', 5000);
            if (wrap._opRefreshRounds) wrap._opRefreshRounds();
            if ((state.currentTab === 'tab-map') && typeof drawCanvas === 'function') drawCanvas();
        });
        wrap.addEventListener('click', (e) => {
            if (_offlinePrepRunning) return;   // 받는 중엔 닫지 않음(멈추기 버튼 사용)
            if (e.target === wrap || e.target.closest('[data-op-close]')) wrap.classList.remove('open');
        });
        return wrap;
    }

    /** 2026-10-19 오프라인 준비 창 맨 위: 건물(회차·동)마다 서버 동기화 진행률 + 다시 받기 상태 + 버튼 */
    async function renderOfflinePrepSyncSection(wrap) {
        const box = wrap && wrap.querySelector('#offlinePrepSync');
        const info = wrap && wrap._opInfo;
        const sp = window.BSA && window.BSA.syncProgress;
        if (!box || !info || !sp) return;
        const prep = window.BSA && window.BSA.offlinePrep;
        if (!wrap._opPrepRecs || Date.now() - (wrap._opPrepRecsAt || 0) > 4000) {
            let recs = new Map();
            try { (prep ? await prep.listStatuses() : []).forEach((r) => { if (r && r.buildingId) recs.set(r.buildingId, r); }); } catch (_e) { recs = new Map(); }
            wrap._opPrepRecs = recs;
            wrap._opPrepRecsAt = Date.now();
        }
        const recs = wrap._opPrepRecs;
        const fmt = (ts) => { try { return formatBulkSnapTime(ts); } catch (_e) { return new Date(ts).toLocaleString(); } };
        const st = offlineRefreshState();
        const online = navigator.onLine !== false;
        const blocks = [];
        info.rounds.forEach((r) => r.buildings.forEach((b) => {
            const rec = recs.get(b.id) || null;
            const bsum = syncProgressSummaryForBuilding(b.id);
            const rs = st[b.id] || null;
            const isCurrent = b.id === window.state.currentBuildingId;
            if (!rec && !(bsum && bsum.total) && !rs && !isCurrent) return;
            const who = r.buildings.length > 1 ? `${r.label} ${formatDongRowLabel(b)}` : r.label;
            const line = sp.refreshStatusText(rs, rec, fmt);
            const running = !!(rs && rs.running);
            const pct = running && rs.total ? Math.round((rs.done / rs.total) * 100) : 0;
            const tone = running ? 'run' : ((rs && (rs.error || rs.ok === false)) || (!rs && rec && !rec.complete) ? 'warn' : ((rs && rs.at) || (rec && rec.complete) ? 'ok' : 'none'));
            const idq = escapeHtml(b.id);
            blocks.push(`<section class="op-sync-bldg tone-${tone}" data-op-sync-b="${idq}">
                    <div class="op-sync-head"><strong>${escapeHtml(who)}</strong><span class="op-sync-line">${running ? '<i class="fa-solid fa-arrows-rotate fa-spin"></i> ' : ''}${escapeHtml(line)}</span></div>
                    ${running ? `<div class="bsp-bar op-sync-dl" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>` : ''}
                    <div class="op-sync-body">${syncMissingPhotosHtml(b.id)}${bsum ? sp.renderPanelHtml(bsum, syncProgressFloorLabel) : ''}</div>
                    <div class="op-sync-actions">
                        <button type="button" class="btn btn-outline btn-sm" data-op-sync-retry="${idq}"${(bsum && bsum.pending && online) ? '' : ' disabled'}><i class="fa-solid fa-cloud-arrow-up"></i> 지금 다시 올리기</button>
                        <button type="button" class="btn btn-primary btn-sm" data-op-sync-refresh="${idq}"${(!running && online) ? '' : ' disabled'}><i class="fa-solid fa-cloud-arrow-down"></i> 최신으로 다시 받기</button>
                    </div>
                </section>`);
        }));
        const html = `<div class="op-sync-title"><i class="fa-solid fa-cloud-arrow-up"></i> 서버 동기화 · 최신 상태</div>`
            + (blocks.join('') || '<p class="bulk-restore-meta">이 현장에 올릴 변경이나 오프라인 준비한 회차가 없습니다.</p>');
        // 바뀐 것이 있을 때만 다시 그린다(누르는 중인 버튼이 사라지지 않게)
        if (box._opHtml !== html) {
            box._opHtml = html;
            box.innerHTML = html;
        }
    }

    async function renderOfflinePrepRounds(wrap, info, checked) {
        const prep = window.BSA && window.BSA.offlinePrep;
        const all = prep ? await prep.listStatuses() : [];
        const byId = new Map(all.map((r) => [r.buildingId, r]));
        const fmt = (ts) => { try { return formatBulkSnapTime(ts); } catch (_e) { return new Date(ts).toLocaleString(); } };
        const box = wrap.querySelector('#offlinePrepRounds');
        box.innerHTML = info.rounds.map((r) => {
            const agg = prep.aggregateRoundStatus(r.buildings.map((b) => byId.get(b.id)), r.buildings.length);
            let line = prep.describeStatus(agg, fmt);
            if (agg && !agg.complete) {
                const miss = [];
                if (agg.floors.failed.length) miss.push(`층 ${agg.floors.failed.length}개`);
                if (agg.drawings.failed.length) miss.push(`도면 ${agg.drawings.failed.length}개`);
                if (agg.photos.failed) miss.push(`사진 ${agg.photos.failed}장`);
                if (miss.length) line += ` — 못 받음: ${miss.join(', ')}`;
                else if (agg.error) line += ` (${agg.error})`;
            }
            const dongs = r.buildings.length > 1 ? ` · 동 ${r.buildings.length}개` : '';
            const k = escapeHtml(r.key);
            return `<div class="offline-prep-round${agg && agg.complete ? ' is-done' : ''}" data-op-round="${k}">
                    <label class="offline-prep-round-name"><input type="checkbox" data-op-check="${k}"${checked.has(r.key) ? ' checked' : ''}> ${escapeHtml(r.label)}${dongs}</label>
                    <div class="offline-prep-round-status">${escapeHtml(line)}</div>
                    <div class="offline-prep-round-actions">
                        <button type="button" class="btn btn-outline btn-sm" data-op-get="${k}">${agg ? '새로 받기' : '받기'}</button>
                        <button type="button" class="btn btn-outline btn-sm" data-op-clear="${k}"${agg ? '' : ' disabled'}>비우기</button>
                    </div>
                </div>`;
        }).join('') || '<p class="bulk-restore-meta">이 현장에 회차가 없습니다.</p>';
        const stor = wrap.querySelector('#offlinePrepStorage');
        stor.textContent = '';
        if (navigator.storage && typeof navigator.storage.estimate === 'function') {
            try {
                const est = await navigator.storage.estimate();
                let persisted = false;
                try { persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (_e) { /* ignore */ }
                stor.textContent = `이 기기 앱 저장 공간: ${prep.formatBytes(est.usage)} 사용 / 약 ${prep.formatBytes(est.quota)} 가능`
                    + (persisted ? ' · 자동 삭제 방지 켜짐' : '');
            } catch (_e) { /* ignore */ }
        }
    }

    window.openOfflinePrepModal = function (bldgArg, openOpts) {
        const bldg = bldgArg || window.state.currentBuilding
            || (window.state.buildings || []).find((b) => b && b.id === window.state.currentBuildingId);
        if (!bldg || !bldg.id) {
            window.showToast('건물을 먼저 골라 주세요.', 'warning');
            return;
        }
        const wrap = ensureOfflinePrepModal();
        const info = offlinePrepRoundsOfSite(bldg);
        // 기본: 이 건물의 회차
        const checked = new Set([getBuildingSurveyRoundKey(bldg) || '_none']);
        wrap.querySelector('#offlinePrepTitle').textContent = `오프라인 준비 · ${info.site || bldg.name || ''}`;
        wrap.querySelector('#offlinePrepProgressWrap').hidden = true;
        wrap.classList.add('open');
        wrap._opInfo = info;
        wrap._opPrepRecs = null;
        const refresh = () => {
            wrap._opPrepRecs = null;
            renderOfflinePrepSyncSection(wrap).catch(() => {});
            return renderOfflinePrepRounds(wrap, info, checked);
        };
        wrap._opRefreshRounds = refresh;
        refresh();
        if (openOpts && openOpts.focusSync) {
            setTimeout(() => {
                const sec = wrap.querySelector('#offlinePrepSync');
                if (!sec) return;
                try { sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_e) { sec.scrollIntoView(); }
                sec.classList.remove('op-sync-flash');
                void sec.offsetWidth;
                sec.classList.add('op-sync-flash');
            }, 80);
        }
        const startBtn = wrap.querySelector('#btnOfflinePrepStart');
        const cancelBtn = wrap.querySelector('#btnOfflinePrepCancel');
        let cancelFlag = false;
        const phaseLabel = { floors: '층 데이터', drawings: '도면', photos: '사진', done: '마무리' };
        const setBusy = (busy) => {
            startBtn.disabled = busy;
            cancelBtn.style.display = busy ? '' : 'none';
            wrap.querySelectorAll('[data-op-get],[data-op-clear],[data-op-check]').forEach((el) => { el.disabled = busy; });
        };
        const runRounds = async (roundKeys) => {
            if (_offlinePrepRunning) return;
            const rounds = info.rounds.filter((r) => roundKeys.includes(r.key));
            if (!rounds.length) {
                window.showToast('받을 회차를 골라 주세요.', 'warning');
                return;
            }
            cancelFlag = false;
            const prep = window.BSA.offlinePrep;
            const pw = wrap.querySelector('#offlinePrepProgressWrap');
            const bar = wrap.querySelector('#offlinePrepBar');
            const txt = wrap.querySelector('#offlinePrepProgressText');
            pw.hidden = false;
            setBusy(true);
            const jobs = [];
            rounds.forEach((r) => r.buildings.forEach((b) => jobs.push({ round: r, bldg: b })));
            let allOk = true;
            let errMsg = '';
            try {
                for (let j = 0; j < jobs.length; j++) {
                    if (cancelFlag) { errMsg = '취소했습니다.'; allOk = false; break; }
                    const { round, bldg: b } = jobs[j];
                    const who = round.buildings.length > 1 ? `${round.label} ${formatDongRowLabel(b)}` : round.label;
                    try {
                        // 2026-11-02 손으로 새로 받으면(현장 준비) 「2일 뒤 삭제」는 취소
                        try { if (window.bsaOfflineExpiry) window.bsaOfflineExpiry.clear(b.id); } catch (_e) { /* ignore */ }
                        const rec = await runOfflinePrep(b, {
                            hiRes: !!wrap.querySelector('#offlinePrepHiRes').checked,
                            isCancelled: () => cancelFlag,
                            onProgress: (p) => {
                                const pct = p.total ? (p.done / p.total) : 0;
                                const overall = Math.round(((j + (p.phase === 'done' ? 1 : pct * 0.99)) / jobs.length) * 100);
                                bar.style.width = `${overall}%`;
                                txt.textContent = `${who} (${j + 1}/${jobs.length}) · ${phaseLabel[p.phase] || ''} ${p.done}/${p.total}`
                                    + `${p.label ? ' · ' + p.label : ''} · ${prep.formatBytes(p.bytes)}`;
                            }
                        });
                        if (!rec.complete) allOk = false;
                    } catch (e) {
                        allOk = false;
                        errMsg = (e && e.message) || String(e);
                        if (cancelFlag || /인터넷|로그인|이미 준비/.test(errMsg)) break;
                    }
                }
                window.showToast(allOk ? '오프라인 준비 완료'
                    : `일부만 받았습니다${errMsg ? ` (${errMsg})` : ''}. 인터넷 확인 후 새로 받기를 눌러 주세요.`,
                allOk ? 'success' : 'warning', 5000);
                if ((state.currentTab === 'tab-map') && typeof drawCanvas === 'function') drawCanvas();
            } finally {
                setBusy(false);
                refresh();
            }
        };
        startBtn.onclick = () => {
            const keys = Array.from(wrap.querySelectorAll('[data-op-check]:checked')).map((el) => el.getAttribute('data-op-check'));
            runRounds(keys);
        };
        cancelBtn.onclick = () => { cancelFlag = true; };
        wrap.querySelector('#offlinePrepRounds').onclick = async (e) => {
            const chk = e.target.closest('[data-op-check]');
            if (chk) {
                const k = chk.getAttribute('data-op-check');
                if (chk.checked) checked.add(k); else checked.delete(k);
                return;
            }
            const get = e.target.closest('[data-op-get]');
            if (get) { runRounds([get.getAttribute('data-op-get')]); return; }
            const clr = e.target.closest('[data-op-clear]');
            if (clr && !_offlinePrepRunning) {
                const r = info.rounds.find((x) => x.key === clr.getAttribute('data-op-clear'));
                if (!r) return;
                const ok = await window.appConfirm(`${r.label} 회차를 위해 받아 둔 사진 사본을 이 기기에서 지울까요?\n(다른 회차와 함께 쓰는 사진, 이 기기에서 찍은 사진, 서버 데이터는 그대로입니다. 도면과 결함 데이터는 남겨 둡니다.)`);
                if (!ok) return;
                const res = await clearOfflinePrep(r.buildings);
                window.showToast(`${r.label} 오프라인 준비를 비웠습니다 (사진 ${res.removed}장${res.kept ? `, 다른 회차와 함께 쓰는 ${res.kept}장은 남김` : ''}${res.notOnServer ? `, 아직 서버에 없는 ${res.notOnServer}장은 지키려고 남김` : ''})`, res.notOnServer ? 'warning' : 'success', 6000);
                refresh();
            }
        };
    };

    /**
     * 보고서(한글·PDF)를 만들기 전에 모든 층을 최신으로. 못 받으면 이 기기 데이터로 만들지 묻는다.
     * 반환: true = 계속, false = 사용자가 취소
     */
    async function ensureBuildingFloorsFreshForReport(bldg, reportLabel) {
        if (typeof window.updateLoadingText === 'function') window.updateLoadingText('모든 층 최신 데이터 받는 중…');
        let res;
        try {
            res = await refreshBuildingFloorsFromServer(bldg);
        } catch (e) {
            res = { ok: false, skipped: null, failed: ['?'] };
        }
        if (res.ok || res.skipped === 'nologin' || res.skipped === 'nobuilding') return true;
        const label = (code) => {
            try { return stripFloorCodeSuffix(window.getFloorLabelFromCode(code, bldg)) || code; } catch (_e) { return code; }
        };
        const why = res.skipped === 'offline'
            ? '인터넷이 연결되지 않아 다른 기기가 올린 최신 데이터를 받지 못했습니다.'
            : `다음 층을 서버에서 받지 못했습니다: ${res.failed.map(label).join(', ')}`;
        return await window.appConfirm(`${why}\n\n이 기기에 있는 데이터로 ${reportLabel}를 만들까요?\n(안 열어 본 층은 빠지거나 예전 값일 수 있습니다)`);
    }

    async function listBuildingBackups(bldgId) {
        const coll = buildingBackupsCollection();
        if (!coll) return [];
        const snap = await coll.where('buildingId', '==', String(bldgId)).get({ source: 'server' });
        return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()))
            .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    }

    async function createBuildingBackup(bldg, memo) {
        const health = bulkSnapshotApi();
        const coll = buildingBackupsCollection();
        if (!health || !coll) throw new Error('로그인 상태를 확인해 주세요.');
        if (!navigator.onLine) throw new Error('인터넷에 연결된 상태에서만 백업할 수 있습니다.');
        await flushBuildingEditsToServer(bldg);
        const now = Date.now();
        const built = health.buildBuildingBackup(bldg.id, await readBuildingBundlesFromServer(bldg), now);
        const ref = coll.doc();
        // 본문을 먼저 쓰고 요약을 나중에 쓴다 — 목록에 보이는 백업은 항상 본문이 있다
        await writeChunkedPdfToDocRef(buildingBackupPayloadRef(ref.id), JSON.stringify(built.payload), {});
        await ref.set({
            buildingId: String(bldg.id),
            buildingName: String(bldg.name || ''),
            createdAt: now,
            createdBy: window.state.userName || '',
            memo: String(memo || '').slice(0, 200),
            floorCodes: built.floorCodes,
            defectCount: built.defectCount,
            ndtCount: built.ndtCount,
            photoCount: built.photoIds.length,
            photoIds: built.photoIds
        });
        return Object.assign({ id: ref.id }, built);
    }

    async function readBuildingBackupPayload(backupId) {
        const json = await readChunkedPdfFromDocRef(buildingBackupPayloadRef(backupId));
        if (!json) throw new Error('백업 본문을 읽지 못했습니다.');
        return JSON.parse(json);
    }

    async function deleteBuildingBackupDocs(backupId) {
        const coll = buildingBackupsCollection();
        const payloadRef = buildingBackupPayloadRef(backupId);
        const parts = await payloadRef.collection('parts').get({ source: 'server' });
        for (let i = 0; i < parts.docs.length; i += 400) {
            const batch = db.batch();
            parts.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
            await batch.commit();
        }
        await payloadRef.delete();
        await coll.doc(backupId).delete();
    }

    /** 이 건물이 지금 쓰는 사진 id — 서버의 모든 층 + 이 기기의 아직 안 올라간 것 */
    async function collectBuildingPhotoIdsInUse(bldg) {
        const health = bulkSnapshotApi();
        const inUse = new Set(health.buildBuildingBackup(bldg.id, await readBuildingBundlesFromServer(bldg)).photoIds);
        const local = buildingFloorCodesForBackup(bldg).map((code) => {
            const key = `${bldg.id}_${code}`;
            return {
                floorCode: code,
                bundle: {
                    markings: { items: window.state.defects[key] || [] },
                    ndt: {
                        items: (window.state.ndtData || {})[key] || [],
                        displacementGroups: (window.state.ndtDisplacementGroups || {})[key] || []
                    }
                }
            };
        });
        health.buildBuildingBackup(bldg.id, local).photoIds.forEach((p) => inUse.add(p));
        return inUse;
    }

    /**
     * 백업을 지운다. 그 백업만 붙잡고 있던 사진(지금 건물도, 다른 백업도 안 쓰는 사진)은 클라우드에서 정리한다.
     * bldg가 없으면(건물 영구 삭제) 백업이 쓰던 사진을 모두 정리한다.
     */
    async function deleteBuildingBackup(backup, bldg) {
        await deleteBuildingBackupDocs(backup.id);
        const ids = Array.isArray(backup.photoIds) ? backup.photoIds : [];
        if (!ids.length) return 0;
        let keep = new Set();
        if (bldg) {
            keep = await collectBuildingPhotoIdsInUse(bldg);
            (await listBuildingBackups(backup.buildingId)).forEach((b) => (b.photoIds || []).forEach((p) => keep.add(p)));
        }
        let removed = 0;
        for (const pid of ids) {
            if (keep.has(pid)) continue;
            try {
                await deleteCloudPhoto(pid);
                removed++;
            } catch (e) {
                console.warn('[건물 백업] 사진 정리 실패:', pid, e);
            }
        }
        return removed;
    }

    /** 건물 영구 삭제 — 사진을 지우기 전에 백업부터 지워야 사진 보존에 걸리지 않는다 */
    async function deleteAllBuildingBackups(bldgId) {
        const list = await listBuildingBackups(bldgId);
        for (const b of list) await deleteBuildingBackup(b, null);
        return list.length;
    }

    function clearNegativePhotoCaches(photoIds) {
        (photoIds || []).forEach((pid) => {
            _cloudPhotoFetchAttempted.delete(pid);
            _nonExistentPhotoIds.delete(pid);
        });
    }

    /**
     * 고른 결함·비파괴를 백업 값으로 되돌린다. 되돌리기 직전 상태를 먼저 자동 백업한다.
     * selections: [{ floorCode, defectIds: [], ndtIds: [] }]
     */
    async function restoreBuildingBackup(bldg, payload, selections) {
        const health = bulkSnapshotApi();
        await createBuildingBackup(bldg, '되살리기 직전 자동 백업');
        const floorsByCode = {};
        (payload.floors || []).forEach((f) => { floorsByCode[f.floorCode] = f; });
        const now = Date.now();
        let defectN = 0;
        let ndtN = 0;
        (selections || []).forEach((sel) => {
            const snap = floorsByCode[sel.floorCode];
            if (!snap || (!sel.defectIds.length && !sel.ndtIds.length)) return;
            const key = `${bldg.id}_${sel.floorCode}`;
            const slice = readBulkFloorSlice(key);
            const result = health.applyRestoreToFloor(slice, snap, { ids: sel.defectIds, ndtIds: sel.ndtIds, now });
            writeBulkFloorSlice(key, slice);
            (result.restoredIds || []).forEach((id) => untrackDefectDeletion(key, id));
            (result.restoredNdtIds || []).forEach((id) => untrackNdtDeletion(key, id));
            (result.restored || []).forEach((d) => clearNegativePhotoCaches(health.defectPhotoDocIds(d)));
            markFloorKeyDirty(key);
            defectN += (result.restoredIds || []).length;
            ndtN += (result.restoredNdtIds || []).length;
        });
        saveStateToLocalStorage();
        syncStateToFirebase();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        return { defectN, ndtN };
    }

    function ensureBuildingBackupModal() {
        let wrap = document.getElementById('buildingBackupModal');
        if (wrap) return wrap;
        wrap = document.createElement('div');
        wrap.id = 'buildingBackupModal';
        wrap.className = 'modal-overlay';
        wrap.innerHTML = `
            <div class="modal-card bulk-restore-card building-backup-card">
                <div class="modal-header">
                    <h3 id="buildingBackupTitle">건물 백업</h3>
                    <button type="button" class="modal-close" data-bb-close title="닫기">&times;</button>
                </div>
                <div class="modal-body" id="buildingBackupBody"></div>
                <div class="modal-footer" id="buildingBackupFooter"></div>
            </div>`;
        document.body.appendChild(wrap);
        wrap.addEventListener('click', (e) => {
            if (e.target === wrap || e.target.closest('[data-bb-close]')) wrap.classList.remove('open');
        });
        return wrap;
    }

    async function renderBuildingBackupList(bldg) {
        const wrap = ensureBuildingBackupModal();
        const body = wrap.querySelector('#buildingBackupBody');
        const footer = wrap.querySelector('#buildingBackupFooter');
        wrap.querySelector('#buildingBackupTitle').textContent = `건물 백업 · ${bldg.name || ''}`;
        footer.innerHTML = '<button type="button" class="btn btn-outline" data-bb-close>닫기</button>';
        body.innerHTML = '<p class="bulk-restore-meta">백업 목록을 불러오는 중…</p>';
        let list = [];
        try {
            list = await listBuildingBackups(bldg.id);
        } catch (e) {
            body.innerHTML = `<p class="bulk-restore-meta">백업 목록을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요. (${escapeBulkRestoreHtml(e.message)})</p>`;
            return;
        }
        const rows = list.map((b) => `<tr>
                <td>${escapeBulkRestoreHtml(formatBulkSnapTime(b.createdAt))}</td>
                <td>${escapeBulkRestoreHtml(b.createdBy || '')}</td>
                <td>${escapeBulkRestoreHtml(b.memo || '')}</td>
                <td>결함 ${Number(b.defectCount) || 0} · 비파괴 ${Number(b.ndtCount) || 0} · 사진 ${Number(b.photoCount) || 0}</td>
                <td style="white-space:nowrap;">
                    <button type="button" class="btn btn-outline btn-sm" data-bb-open="${escapeBulkRestoreHtml(b.id)}">비교·되살리기</button>
                    <button type="button" class="btn btn-outline btn-sm" data-bb-delete="${escapeBulkRestoreHtml(b.id)}">삭제</button>
                </td>
            </tr>`).join('');
        body.innerHTML = `
            <p class="bulk-restore-meta">지금 이 건물의 모든 층(결함·비파괴·사진 목록)을 서버에 저장해 두고, 나중에 그 시점으로 골라서 되돌릴 수 있습니다. 백업이 쓰는 사진은 지워도 클라우드에 남아 되살릴 수 있습니다.</p>
            <div style="display:flex;gap:0.5rem;margin:0.6rem 0 0.9rem;">
                <input type="text" id="buildingBackupMemo" class="form-control" maxlength="200" placeholder="메모 (예: 2층 조사 끝, 보고서 작성 전)">
                <button type="button" class="btn btn-primary" id="btnCreateBuildingBackup" style="white-space:nowrap;"><i class="fa-solid fa-floppy-disk"></i> 지금 상태 백업</button>
            </div>
            <div class="bulk-restore-table-wrap">
                <table class="bulk-restore-table">
                    <thead><tr><th>시각</th><th>만든 사람</th><th>메모</th><th>내용</th><th></th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" style="text-align:center;padding:1.2rem;color:#64748b;">아직 백업이 없습니다.</td></tr>'}</tbody>
                </table>
            </div>`;
        body.querySelector('#btnCreateBuildingBackup').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            window.showLoading('건물 전체를 백업하는 중입니다...');
            try {
                const made = await createBuildingBackup(bldg, body.querySelector('#buildingBackupMemo').value);
                window.showToast(`백업했습니다. (결함 ${made.defectCount} · 비파괴 ${made.ndtCount} · 사진 ${made.photoIds.length})`, 'success', 5000);
                await renderBuildingBackupList(bldg);
            } catch (err) {
                window.showToast('백업하지 못했습니다: ' + err.message, 'error', 7000);
                btn.disabled = false;
            } finally {
                window.hideLoading();
            }
        });
        body.querySelectorAll('[data-bb-open]').forEach((btn) => btn.addEventListener('click', () => {
            const b = list.find((x) => x.id === btn.getAttribute('data-bb-open'));
            if (b) renderBuildingBackupCompare(bldg, b);
        }));
        body.querySelectorAll('[data-bb-delete]').forEach((btn) => btn.addEventListener('click', async () => {
            const b = list.find((x) => x.id === btn.getAttribute('data-bb-delete'));
            if (!b || !await window.confirmDelete(`${formatBulkSnapTime(b.createdAt)} 백업을 지울까요?\n\n이 백업만 붙잡고 있던 사진(지금 건물에도 다른 백업에도 없는 사진)은 클라우드에서 정리됩니다.`)) return;
            window.showLoading('백업을 지우는 중입니다...');
            try {
                const removed = await deleteBuildingBackup(b, bldg);
                window.showToast(`백업을 지웠습니다.${removed ? ` (정리한 사진 ${removed}장)` : ''}`, 'success', 4500);
            } catch (err) {
                window.showToast('백업을 지우지 못했습니다: ' + err.message, 'error', 7000);
            } finally {
                window.hideLoading();
                await renderBuildingBackupList(bldg);
            }
        }));
    }

    async function renderBuildingBackupCompare(bldg, backup) {
        const health = bulkSnapshotApi();
        const wrap = ensureBuildingBackupModal();
        const body = wrap.querySelector('#buildingBackupBody');
        const footer = wrap.querySelector('#buildingBackupFooter');
        body.innerHTML = '<p class="bulk-restore-meta">백업과 지금 서버 데이터를 비교하는 중…</p>';
        footer.innerHTML = '';
        let payload;
        let plans;
        window.showLoading('백업과 지금을 비교하는 중입니다...');
        try {
            await flushBuildingEditsToServer(bldg);
            payload = await readBuildingBackupPayload(backup.id);
            const current = {};
            for (const fb of await readBuildingBundlesFromServer(bldg)) current[fb.floorCode] = fb.bundle;
            plans = (payload.floors || []).map((f) => health.planFloorRestore(f, current[f.floorCode] || {}));
        } catch (err) {
            body.innerHTML = `<p class="bulk-restore-meta">비교하지 못했습니다: ${escapeBulkRestoreHtml(err.message)}</p>`;
            footer.innerHTML = '<button type="button" class="btn btn-outline" id="btnBuildingBackupBack">목록으로</button>';
            footer.querySelector('#btnBuildingBackupBack').addEventListener('click', () => renderBuildingBackupList(bldg));
            return;
        } finally {
            window.hideLoading();
        }
        const floorLabel = (code) => (typeof window.getFloorLabelFromCode === 'function' ? window.getFloorLabelFromCode(code) : code) || code;
        const changedPlans = plans.filter((p) => p.defectIds.length || p.ndtIds.length || (p.diff.addedAfter || []).length);
        const sections = changedPlans.map((p) => {
            const rows = (p.diff.changed || []).concat(p.diff.deletedAfter || []).map((r) => `<tr>
                    <td><input type="checkbox" class="bb-defect-check" data-floor="${escapeBulkRestoreHtml(p.floorCode)}" value="${escapeBulkRestoreHtml(r.id)}" checked></td>
                    <td>${escapeBulkRestoreHtml((r.snapshot && r.snapshot.no) || (r.current && r.current.no) || r.id)}</td>
                    <td>${r.kind === 'deleted' ? '이후 삭제됨' : '바뀜'}</td>
                    <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.current))}${r.current ? ` · 사진 ${health.defectPhotoDocIds(r.current).length}` : ''}</td>
                    <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.snapshot))} · 사진 ${health.defectPhotoDocIds(r.snapshot).length}</td>
                </tr>`).join('');
            const added = (p.diff.addedAfter || []).map((r) => `<tr class="bulk-restore-added">
                    <td></td><td>${escapeBulkRestoreHtml((r.current && r.current.no) || r.id)}</td><td>이후 추가(유지)</td>
                    <td>${escapeBulkRestoreHtml(summarizeDefectForRestore(r.current))}</td><td>—</td>
                </tr>`).join('');
            const ndtRow = p.ndtIds.length
                ? `<tr><td><input type="checkbox" class="bb-ndt-check" data-floor="${escapeBulkRestoreHtml(p.floorCode)}" checked></td>
                    <td colspan="4">비파괴 측정값·구역 ${p.ndtIds.length}건을 백업 값으로 되돌리기</td></tr>`
                : '';
            return `<tr><th colspan="5" style="text-align:left;background:#f1f5f9;">${escapeBulkRestoreHtml(floorLabel(p.floorCode))}</th></tr>${rows}${ndtRow}${added}`;
        }).join('');
        body.innerHTML = `
            <p class="bulk-restore-meta">${escapeBulkRestoreHtml(formatBulkSnapTime(backup.createdAt))} 백업${backup.memo ? ` (${escapeBulkRestoreHtml(backup.memo)})` : ''} ↔ 지금 서버 데이터.
                체크한 항목만 백업 값(사진 목록 포함)으로 되돌립니다. 백업 이후 새로 생긴 결함은 지우지 않습니다.</p>
            <div class="bulk-restore-table-wrap">
                <table class="bulk-restore-table">
                    <thead><tr><th></th><th>번호</th><th>구분</th><th>지금</th><th>백업</th></tr></thead>
                    <tbody>${sections || '<tr><td colspan="5" style="text-align:center;padding:1.2rem;color:#64748b;">백업과 지금이 같습니다. 되돌릴 것이 없습니다.</td></tr>'}</tbody>
                </table>
            </div>
            <p class="bulk-restore-note">되돌리기 직전 상태를 자동으로 한 번 더 백업하므로, 되돌린 뒤에도 다시 원래대로 돌아올 수 있습니다.</p>`;
        footer.innerHTML = `<button type="button" class="btn btn-outline" id="btnBuildingBackupBack">목록으로</button>
            ${sections ? '<button type="button" class="btn btn-primary" id="btnBuildingBackupApply">체크한 항목 되돌리기</button>' : ''}`;
        footer.querySelector('#btnBuildingBackupBack').addEventListener('click', () => renderBuildingBackupList(bldg));
        const applyBtn = footer.querySelector('#btnBuildingBackupApply');
        if (!applyBtn) return;
        applyBtn.addEventListener('click', async () => {
            const selections = plans.map((p) => ({
                floorCode: p.floorCode,
                defectIds: Array.from(body.querySelectorAll('.bb-defect-check:checked'))
                    .filter((cb) => cb.getAttribute('data-floor') === p.floorCode).map((cb) => cb.value),
                ndtIds: body.querySelector(`.bb-ndt-check[data-floor="${CSS.escape(p.floorCode)}"]:checked`) ? p.ndtIds : []
            }));
            const nDef = selections.reduce((s, x) => s + x.defectIds.length, 0);
            const nNdt = selections.reduce((s, x) => s + x.ndtIds.length, 0);
            if (!nDef && !nNdt) {
                window.showToast('되돌릴 항목을 체크해 주세요.', 'warning');
                return;
            }
            if (!await window.appConfirm(`결함 ${nDef}건, 비파괴 ${nNdt}건을 백업 값으로 되돌립니다. 계속할까요?`)) return;
            applyBtn.disabled = true;
            window.showLoading('백업 값으로 되돌리는 중입니다...');
            try {
                const r = await restoreBuildingBackup(bldg, payload, selections);
                window.showToast(`결함 ${r.defectN}건, 비파괴 ${r.ndtN}건을 되돌렸습니다. 다른 기기에도 동기화됩니다.`, 'success', 6000);
                wrap.classList.remove('open');
            } catch (err) {
                window.showToast('되돌리지 못했습니다: ' + err.message, 'error', 7000);
                applyBtn.disabled = false;
            } finally {
                window.hideLoading();
            }
        });
    }

    window.openBuildingBackupModal = function (bldg) {
        if (!bldg || !bldg.id) return;
        if (!buildingBackupsCollection()) {
            window.showToast('로그인한 뒤에 쓸 수 있습니다.', 'warning');
            return;
        }
        const wrap = ensureBuildingBackupModal();
        wrap.classList.add('open');
        renderBuildingBackupList(bldg);
    };

    /**
     * 층별 결함 데이터가 껍데기인지 점검한다.
     *
     * 2026-09-20: 「지하1층 주차장-2」 결함 15개가 전부 기둥/균열에 크기·폭이 없는
     * 상태로 남아 있었는데, 복구 때 개수만 맞는지 보고 넘어가서 하루 넘게 아무도
     * 몰랐다. 데이터가 망가지는 것보다 망가진 걸 모르는 게 더 나쁘다.
     *
     * 사용법(F12 콘솔): checkDataHealth()          — 지금 열어둔 건물
     *                  checkDataHealth('bldg-…')  — 특정 건물
     * 읽기만 하고 아무것도 바꾸지 않는다.
     */
    window.checkDataHealth = function (buildingId) {
        const health = window.BSA && window.BSA.dataHealth;
        if (!health) {
            console.warn('데이터 점검 모듈을 불러오지 못했습니다.');
            return [];
        }
        const id = buildingId || window.state.currentBuildingId;
        if (!id) {
            console.warn('건물을 먼저 열어 주세요.');
            return [];
        }
        const rows = health.analyzeBuilding(window.state.defects, id);
        console.table(rows.map((r) => ({
            층: r.floorCode,
            결함수: r.count,
            부재종류: r.components.length,
            결함종류: r.defectTypes.length,
            실측있음: r.withMeasure,
            의심: r.suspicious ? r.reason : ''
        })));
        const bad = rows.filter((r) => r.suspicious);
        if (bad.length) {
            console.warn('확인이 필요한 층 ' + bad.length + '개: '
                + bad.map((r) => r.floorCode).join(', '));
        } else {
            console.log('이상 없음 — 층 ' + rows.length + '개 확인');
        }
        const ndtDup = (typeof health.crossFloorDuplicateIds === 'function')
            ? health.crossFloorDuplicateIds(window.state.ndtData, id)
                .concat(health.crossFloorDuplicateIds(window.state.ndtDisplacementGroups, id))
            : [];
        if (ndtDup.length) {
            console.warn('[비파괴] 같은 번호가 여러 층에 있는 항목 ' + ndtDup.length + '건 — '
                + '한글 보고서에 같은 측정이 두 번 나옵니다. cleanDuplicateNdt(\'<층코드>\')로 확인하세요.');
            console.table(ndtDup.map((d) => ({ 번호: d.id, 층들: d.floorCodes.join(' + ') })));
        }
        return bad;
    };

    /**
     * 층 섞임으로 다른 층에 복사된 비파괴 항목을 그 층에서만 지운다.
     *
     * 2026-09-21: 지상1층(1F) 비파괴 20건이 「지하1층 주차장-2」에 같은 id로 복사돼
     * 있었다. 앱은 한 번에 한 층만 보여줘 눈에 안 띄고, 모든 층을 합치는 한글
     * 보고서에서 같은 측정이 두 번 나왔다.
     *
     * **다른 층에도 있는 항목만** 지운다. 그 층에만 있는 항목은 진짜 데이터이므로
     * 건드리지 않는다. 삭제 기록은 층별로 남으므로(deletedNdtIds[floorKey]) 원본
     * 층의 같은 번호는 영향을 받지 않는다.
     *
     * 사용법(F12 콘솔):
     *   cleanDuplicateNdt('지하1층 주차장-2')                 — 무엇을 지울지 보기만 함
     *   cleanDuplicateNdt('지하1층 주차장-2', { apply: true }) — 실제로 지움
     */
    window.cleanDuplicateNdt = async function (floorCode, opts) {
        const options = opts || {};
        const health = window.BSA && window.BSA.dataHealth;
        if (!health || typeof health.duplicatedRecordsOnFloor !== 'function') {
            console.warn('데이터 점검 모듈을 불러오지 못했습니다.');
            return [];
        }
        const id = options.buildingId || window.state.currentBuildingId;
        if (!id) {
            console.warn('건물을 먼저 열어 주세요.');
            return [];
        }
        const code = String(floorCode || '').trim();
        if (!code) {
            const dup = health.crossFloorDuplicateIds(window.state.ndtData, id);
            console.warn('층코드를 주세요. 예: cleanDuplicateNdt(\'지하1층 주차장-2\')');
            console.table(dup.map((d) => ({ 번호: d.id, 층들: d.floorCodes.join(' + ') })));
            return [];
        }
        const floorKey = `${id}_${code}`;
        // 부동침하·부재변위 측정 구역(ndtDisplacementGroups)도 같이 본다.
        // 구역 묘비는 NDT 핀과 같은 deletedNdtIds를 쓴다(id 접두가 달라 서로 안 겹침).
        const itemTargets = health.duplicatedRecordsOnFloor(window.state.ndtData, id, code);
        const groupTargets = health.duplicatedRecordsOnFloor(window.state.ndtDisplacementGroups, id, code);
        const targets = itemTargets.concat(groupTargets);
        if (!targets.length) {
            console.log(`${code}: 다른 층과 겹치는 비파괴 항목이 없습니다.`);
            return [];
        }
        console.table(itemTargets.map((t) => ({ 번호: t.id, 분류: t.category, 위치: t.location })));
        if (groupTargets.length) {
            console.table(groupTargets.map((g) => ({ 번호: g.id, 분류: g.category || '변위', 이름: g.name || '' })));
        }
        if (!options.apply) {
            console.warn(`${code}에서 지울 후보 ${targets.length}건입니다`
                + (groupTargets.length ? ` (측정 구역 ${groupTargets.length}건 포함)` : '')
                + `. 실제로 지우려면 cleanDuplicateNdt('${code}', { apply: true })`);
            return targets;
        }
        let ndtCleanSnaps = [];
        if (typeof snapshotBeforeBulkOp === 'function') {
            ndtCleanSnaps = await snapshotBeforeBulkOp('비파괴 중복 정리', [floorKey]);
        }
        const purge = (map, list) => {
            if (!map || !list.length) return 0;
            const ids = new Set(list.map((t) => t.id));
            // 중복 정리는 자리 치우기 — 되살리면 중복이 다시 생긴다(지운 시각 규칙)
            ids.forEach((recId) => trackNdtDeletion(floorKey, recId, null, { wallClock: true }));
            const rest = (map[floorKey] || []).filter((it) => !(it && ids.has(it.id)));
            if (rest.length) {
                map[floorKey] = rest;
            } else {
                delete map[floorKey];
            }
            return ids.size;
        };
        const nItems = purge(window.state.ndtData, itemTargets);
        const nGroups = purge(window.state.ndtDisplacementGroups, groupTargets);
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof recordAfterBulkOp === 'function') recordAfterBulkOp(ndtCleanSnaps);
        console.log(`${code}에서 비파괴 ${nItems}건`
            + (nGroups ? `, 측정 구역 ${nGroups}건` : '')
            + '을 지웠습니다. 동기화하면 다른 기기에도 반영됩니다.');
        return targets;
    };

    /** 건물에 들어갈 때 조용히 한 번 확인해서 콘솔에 남긴다 (화면은 건드리지 않음) */
    const _dataHealthWarned = new Set();
    function warnIfBuildingDataLooksHollow(bldg) {
        try {
            const health = window.BSA && window.BSA.dataHealth;
            if (!health || !bldg || !bldg.id || _dataHealthWarned.has(bldg.id)) return;
            const bad = health.suspiciousFloors(window.state.defects, bldg.id);
            if (!bad.length) return;
            _dataHealthWarned.add(bldg.id);
            console.warn('[데이터 점검] ' + (bldg.name || bldg.id)
                + ' — 내용이 비어 보이는 층이 있습니다: '
                + bad.map((r) => r.floorCode + '(' + r.reason + ')').join(' / ')
                + '\n자세히 보려면 콘솔에 checkDataHealth() 를 입력하세요.');
        } catch (e) {
            /* 점검이 앱을 막으면 안 된다 */
        }
    }

    async function fetchBulkSyncDataReliable(maxAttempts = 4) {
        let last = null;
        for (let i = 0; i < maxAttempts; i++) {
            last = await fetchBulkSyncData();
            if (last) return last;
            await new Promise((r) => setTimeout(r, 400 * (i + 1)));
        }
        return last || {};
    }

    async function fetchBulkSyncData() {
        if (!db || !window.state.companyId) return null;
        try {
            const json = await readChunkedPdfFromDocRef(getBulkSyncDocRef());
            if (json == null) return null;
            if (!json) return {};
            return JSON.parse(json);
        } catch (e) {
            console.warn('결함/NDT 데이터(bulkData) 조회 실패:', e);
            return null;
        }
    }

    async function uploadSiteVaultPdf(siteKey, floorCode, pdfDataUrl) {
        if (!db || !window.state.companyId || !siteKey || !floorCode || !pdfDataUrl) return false;
        const siteId = siteVaultDocId(siteKey);
        const rootRef = db.collection('safety_app').doc(getCompanyDocId())
            .collection('siteDrawingVault').doc(siteId);
        const floorRef = rootRef.collection('floors').doc(floorCode);
        try {
            await rootRef.set({
                siteName: siteKey,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            await writeChunkedPdfToDocRef(floorRef, pdfDataUrl);
            const vaultIdbKey = `vault_${siteId}_${floorCode}`;
            await idbSet('floorDrawingPdfs', vaultIdbKey, pdfDataUrl);
            return true;
        } catch (e) {
            console.warn('현장명 PDF 보관함 저장 실패:', e);
            return false;
        }
    }

    async function fetchSiteVaultPdf(siteKey, floorCode) {
        if (!siteKey || !floorCode) return null;
        const siteId = siteVaultDocId(siteKey);
        const vaultIdbKey = `vault_${siteId}_${floorCode}`;
        const cached = await idbGet('floorDrawingPdfs', vaultIdbKey);
        if (cached) return cached;
        if (!db || !window.state.companyId) return null;
        try {
            const floorRef = db.collection('safety_app').doc(getCompanyDocId())
                .collection('siteDrawingVault').doc(siteId).collection('floors').doc(floorCode);
            const pdf = await readChunkedPdfFromDocRef(floorRef);
            if (pdf) await idbSet('floorDrawingPdfs', vaultIdbKey, pdf);
            return pdf;
        } catch (e) {
            console.warn('현장명 PDF 보관함 조회 실패:', e);
            return null;
        }
    }
    window.fetchSiteVaultPdf = fetchSiteVaultPdf;

    /** 현장 전체(모든 회차) 삭제 시 siteDrawingVault·로컬 vault 캐시 제거 */
    async function deleteSiteVaultCompletely(siteKey) {
        if (!siteKey) return 0;
        const siteId = siteVaultDocId(siteKey);
        let fail = 0;
        try {
            if (db && window.state.companyId) {
                const rootRef = db.collection('safety_app').doc(getCompanyDocId())
                    .collection('siteDrawingVault').doc(siteId);
                const floorsSnap = await rootRef.collection('floors').get();
                if (!floorsSnap.empty) {
                    const batch = db.batch();
                    floorsSnap.forEach((d) => {
                        batch.delete(d.ref);
                    });
                    batch.delete(rootRef);
                    await batch.commit();
                } else {
                    await rootRef.delete().catch(() => { fail++; });
                }
            }
        } catch (e) {
            fail++;
            console.warn('현장명 PDF 보관함 삭제 실패:', siteKey, e);
        }
        try {
            const prefix = `vault_${siteId}_`;
            const keys = (typeof idbGetAllKeys === 'function')
                ? await idbGetAllKeys('floorDrawingPdfs')
                : [];
            for (const key of keys) {
                if (String(key).startsWith(prefix)) await idbDelete('floorDrawingPdfs', key);
            }
        } catch (e) {
            console.warn('vault IDB 캐시 삭제 실패:', e);
        }
        return fail;
    }

    async function archiveBuildingPdfsToSiteVault(bldg) {
        if (!bldg || !bldg.id) return;
        const siteKey = siteVaultKeyForBuilding(bldg);
        bldg.siteVaultKey = siteVaultDocId(siteKey);
        const floors = (bldg.floorsList && bldg.floorsList.length > 0)
            ? bldg.floorsList.map(f => f.floorCode)
            : Object.keys(bldg.floorDrawingPdfs || bldg.floorDrawings || {});
        for (const fc of floors) {
            let pdf = (bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[fc]) || null;
            if (!pdf) pdf = await idbGet('floorDrawingPdfs', `${bldg.id}_${fc}`);
            if (!pdf && db && window.state.companyId) {
                pdf = await fetchFloorDrawingPdfFromCloud(bldg.id, fc);
            }
            if (pdf) await uploadSiteVaultPdf(siteKey, fc, pdf);
        }
    }

    async function applyResolvedPdfToBuilding(bldg, floorCode, pdf) {
        if (!bldg || !floorCode || !pdf) return false;
        const idbKey = `${bldg.id}_${floorCode}`;
        if (typeof window.ensureFloorDrawingPdfs === 'function') window.ensureFloorDrawingPdfs(bldg);
        else if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
        bldg.floorDrawingPdfs[floorCode] = pdf;
        await idbSet('floorDrawingPdfs', idbKey, pdf);
        _idbPersistedPdfKeys.add(idbKey);
        markFloorPdfKnown(bldg.id, floorCode, true);
        if (!window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys = initCloudSyncedKeySet('pdfs');
        window._cloudSyncedPdfKeys.add(idbKey);
        scheduleSaveCloudSyncedKeys();
        return true;
    }
    window.applyResolvedPdfToBuilding = applyResolvedPdfToBuilding;

    async function resolveBuildingFloorPdf(bldg, floorCode, opts) {
        if (!bldg || !floorCode) return null;
        if (dropRemovedFloorPdf(bldg, floorCode)) return null;
        const options = opts || {};
        const idbKey = `${bldg.id}_${floorCode}`;
        const isPdfUrl = (url) => (
            typeof url === 'string' && (
                url.startsWith('data:application/pdf')
                || (typeof window.isPdfDrawingDataUrl === 'function' && window.isPdfDrawingDataUrl(url))
            )
        );
        const refreshDue = !options.localOnly && floorDrawingRefreshDue(bldg, floorCode);
        if (refreshDue && bldg.floorDrawingPdfs) delete bldg.floorDrawingPdfs[floorCode];

        if (!refreshDue && bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[floorCode]) {
            return bldg.floorDrawingPdfs[floorCode];
        }

        if (!refreshDue && typeof window.getFloorPdfDataUrl === 'function') {
            const mem = window.getFloorPdfDataUrl(bldg, floorCode);
            if (mem) return mem;
        }

        let cached = refreshDue ? null : await idbGet('floorDrawingPdfs', idbKey);
        if (cached) {
            if (typeof window.ensureFloorDrawingPdfs === 'function') window.ensureFloorDrawingPdfs(bldg);
            else if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
            bldg.floorDrawingPdfs[floorCode] = cached;
            _idbPersistedPdfKeys.add(idbKey);
            return cached;
        }

        if (!refreshDue) {
            const src = await getFloorDrawingSourceDataUrl(bldg, floorCode);
            if (isPdfUrl(src)) {
                await applyResolvedPdfToBuilding(bldg, floorCode, src);
                return src;
            }

            const drawing = bldg.floorDrawings && bldg.floorDrawings[floorCode];
            if (isPdfUrl(drawing)) {
                await applyResolvedPdfToBuilding(bldg, floorCode, drawing);
                return drawing;
            }
        }

        // 자동 경로는 레스터만 쓴다. PDF 원본은 forceCloud, 또는 더 나중에 올린 도면이 있을 때만 서버에서 받는다.
        if (db && window.state.companyId && (options.forceCloud || refreshDue) && !options.localOnly) {
            const siteKey = siteVaultKeyForBuilding(bldg);
            const [cloudPdf, vaultPdf] = await Promise.all([
                fetchFloorDrawingPdfFromCloud(bldg.id, floorCode),
                // 새로 넣은 도면(refreshDue)이면 보관함의 옛 PDF로 덮지 않는다 — 지운 도면이 되살아났다
                refreshDue ? Promise.resolve(null) : fetchSiteVaultPdf(siteKey, floorCode),
            ]);
            const remotePdf = cloudPdf || vaultPdf;
            if (remotePdf) {
                await applyResolvedPdfToBuilding(bldg, floorCode, remotePdf);
                markFloorPdfKnown(bldg.id, floorCode, true);
                if (refreshDue) {
                    if (!bldg._pdfRefreshFromCloud) bldg._pdfRefreshFromCloud = {};
                    bldg._pdfRefreshFromCloud[floorCode] = true;
                }
                return remotePdf;
            }
            if (options.forceCloud || refreshDue) {
                console.warn('[PDF] 서버 조회 결과 없음:', idbKey, 'company=', window.state.companyId);
            }
        }

        if (refreshDue) {
            cached = await idbGet('floorDrawingPdfs', idbKey);
            if (cached) {
                if (!bldg.floorDrawingPdfs) bldg.floorDrawingPdfs = {};
                bldg.floorDrawingPdfs[floorCode] = cached;
                return cached;
            }
        }

        return null;
    }
    window.resolveBuildingFloorPdf = resolveBuildingFloorPdf;

    async function hydrateAllBuildingPdfsFromCloud() {
        return;
    }
    window.hydrateAllBuildingPdfsFromCloud = hydrateAllBuildingPdfsFromCloud;

    /** 기기 IndexedDB·메모리의 PDF 원본 캐시만 삭제 (Firestore·화면용 4000px 도면은 유지) */
    async function clearLocalFloorPdfCache() {
        const keys = (typeof idbGetAllKeys === 'function')
            ? await idbGetAllKeys('floorDrawingPdfs')
            : [];
        let removed = 0;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (await idbDelete('floorDrawingPdfs', key)) removed++;
        }
        (window.state.buildings || []).forEach((b) => {
            if (b && b.floorDrawingPdfs) b.floorDrawingPdfs = {};
        });
        if (window.state.currentBuilding && window.state.currentBuilding.floorDrawingPdfs) {
            window.state.currentBuilding.floorDrawingPdfs = {};
        }
        _idbPersistedPdfKeys.clear();
        if (window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys.clear();
        clearAllFloorPdfKnownState();
        _pdfPatchWarnedFloors.clear();
        _pdfFetchInFlight.clear();
        if (typeof window.invalidatePdfPageCache === 'function') {
            window.invalidatePdfPageCache();
        }
        state.floorDrawingHiPatch = null;
        return removed;
    }
    window.clearLocalFloorPdfCache = clearLocalFloorPdfCache;

    /**
     * 2026-10-31 도면 이미지 캐시 지우기 — 이 기기에 받아 둔 도면 그림(기본·확대용 티어·원본 이미지)을 비우고 서버에서 다시 받는다.
     * 도면을 바꿨는데 이미 받아 둔 옛 그림이 계속 남아 확대·축소할 때마다 옛 도면과 새 도면이 번갈아 보이던 문제.
     * 서버에 올라간 것이 확인된 층만 지운다 — 아직 서버에 못 올린 도면(업로드 대기 표시)·서버 확인이 안 된 층은 이 기기가 유일한 사본이라 남긴다.
     * @returns {{cleared:number, keptPending:number, keptUnverified:number}}
     */
    async function clearLocalFloorImageCache() {
        const pending = readPendingDrawingUploads();
        const synced = ensureCloudSyncedDrawingKeys();
        const result = { cleared: 0, keptPending: 0, keptUnverified: 0 };
        for (const bldg of (window.state.buildings || [])) {
            if (!bldg || !bldg.id) continue;
            const codes = new Set();
            (bldg.floorsList || []).forEach((f) => { if (f && f.floorCode) codes.add(f.floorCode); });
            (bldg.drawingFloorCodes || []).forEach((c) => { if (c) codes.add(c); });
            ['floorDrawings', 'floorDrawingTiers', 'floorDrawingSources'].forEach((m) => {
                Object.keys(bldg[m] || {}).forEach((c) => codes.add(c));
            });
            for (const code of codes) {
                const floorKey = `${bldg.id}_${code}`;
                if (Object.prototype.hasOwnProperty.call(pending, floorKey)) { result.keptPending++; continue; }
                if (!synced.has(floorKey)) { result.keptUnverified++; continue; }
                await clearFloorDrawingTierCacheForFloor(bldg.id, code, true);
                await Promise.resolve(idbDelete('floorDrawings', floorKey)).catch(() => {});
                _idbPersistedDrawingKeys.delete(floorKey);
                _idbPersistedSourceKeys.delete(floorKey);
                if (bldg.floorDrawings) delete bldg.floorDrawings[code];
                if (bldg.floorDrawingTiers) delete bldg.floorDrawingTiers[code];
                if (bldg.floorDrawingSources) delete bldg.floorDrawingSources[code];
                result.cleared++;
            }
        }
        const cur = state.currentBuilding;
        if (cur && cur.id) {
            const live = (window.state.buildings || []).find((b) => b && b.id === cur.id);
            if (live && live !== cur) {
                ['floorDrawings', 'floorDrawingTiers', 'floorDrawingSources'].forEach((m) => { cur[m] = live[m] || {}; });
            }
        }
        state.floorDrawingTierImageCache = {};
        state.floorImageCache = {};
        state.floorDrawingHiPatch = null;
        floorDrawingActiveTierDim = 0;
        return result;
    }
    window.clearLocalFloorImageCache = clearLocalFloorImageCache;

    /** 점검(건물) 마지막 진입 시각 — IndexedDB 대용량 자산 TTL (24시간) */
    const BUILDING_ACCESS_LS_KEY = 'bsa_building_access_v1';
    const BUILDING_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;
    let _idbInspectionPruneInFlight = null;

    function readBuildingAccessMap() {
        try {
            const raw = localStorage.getItem(BUILDING_ACCESS_LS_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function writeBuildingAccessMap(map) {
        try {
            localStorage.setItem(BUILDING_ACCESS_LS_KEY, JSON.stringify(map || {}));
        } catch (e) {
            console.warn('점검 접근 시각 저장 실패:', e);
        }
    }

    function touchBuildingAccess(buildingId) {
        if (!buildingId) return;
        const map = readBuildingAccessMap();
        map[buildingId] = Date.now();
        writeBuildingAccessMap(map);
    }

    /** 기존 설치분은 즉시 삭제되지 않도록 현재 시각으로 시드 */
    function ensureBuildingAccessSeeded() {
        const map = readBuildingAccessMap();
        const now = Date.now();
        let changed = false;
        (window.state.buildings || []).forEach((b) => {
            if (b && b.id && map[b.id] == null) {
                map[b.id] = now;
                changed = true;
            }
        });
        if (window.state.currentBuildingId && map[window.state.currentBuildingId] == null) {
            map[window.state.currentBuildingId] = now;
            changed = true;
        }
        if (changed) writeBuildingAccessMap(map);
        return map;
    }

    function clearPersistedKeyPrefix(set, prefix) {
        if (!set || !prefix) return;
        Array.from(set).forEach((k) => {
            if (String(k).startsWith(prefix)) set.delete(k);
        });
    }

    async function deleteIdbKeysWithBuildingPrefix(storeName, buildingId) {
        if (!buildingId || typeof idbGetAllKeys !== 'function') return 0;
        const prefix = `${buildingId}_`;
        const keys = await idbGetAllKeys(storeName);
        let removed = 0;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!String(key).startsWith(prefix)) continue;
            if (await idbDelete(storeName, key)) removed++;
        }
        return removed;
    }

    async function purgeBuildingIndexedDbAssets(buildingId, purgeOpts) {
        if (!buildingId) return 0;
        const keepUnuploaded = !!(purgeOpts && purgeOpts.keepUnuploaded);
        const prefix = `${buildingId}_`;
        let removed = 0;
        removed += await deleteIdbKeysWithBuildingPrefix('floorDrawings', buildingId);
        removed += await deleteIdbKeysWithBuildingPrefix('floorDrawingTiers', buildingId);
        removed += await deleteIdbKeysWithBuildingPrefix('floorDrawingPdfs', buildingId);
        removed += await deleteIdbKeysWithBuildingPrefix('floorDrawingSources', buildingId);

        const photoKeysToDelete = new Set();
        Object.entries(window.state.defects || {}).forEach(([mapKey, arr]) => {
            if (!String(mapKey).startsWith(prefix)) return;
            (arr || []).forEach((d) => {
                if (!d) return;
                (d.photoIds || []).forEach((pid) => { if (pid) photoKeysToDelete.add(pid); });
                (d.prevRoundPhotoIds || []).forEach((pid) => { if (pid) photoKeysToDelete.add(pid); });
                if (d.id) {
                    const photoLen = Math.max(
                        (d.photos && d.photos.length) || 0,
                        (d.photoIds && d.photoIds.length) || 0,
                        24
                    );
                    const prevLen = Math.max(
                        (d.prevRoundPhotos && d.prevRoundPhotos.length) || 0,
                        (d.prevRoundPhotoIds && d.prevRoundPhotoIds.length) || 0,
                        24
                    );
                    for (let i = 0; i < photoLen; i++) photoKeysToDelete.add(getPhotoDocId(d.id, i));
                    for (let i = 0; i < prevLen; i++) photoKeysToDelete.add(getPhotoDocId(d.id, i, 'prev'));
                }
                if (d.photos) delete d.photos;
                if (d.prevRoundPhotos) delete d.prevRoundPhotos;
            });
        });
        for (const pid of photoKeysToDelete) {
            // 2026-10-19 오래된 캐시 정리에서는 서버에 안 올라간 이 기기 사진(data URL)은 절대 지우지 않는다
            if (keepUnuploaded && !isPhotoMarkedOnStorage(pid)) {
                let localPhoto = null;
                try { localPhoto = await idbGet('photos', pid); } catch (_e) { localPhoto = 'data:'; }
                if (typeof localPhoto === 'string' && localPhoto.indexOf('data:') === 0) continue;
            }
            if (await idbDelete('photos', pid)) removed++;
            if (_idbPersistedPhotoKeys) _idbPersistedPhotoKeys.delete(pid);
            if (window._photoCache && window._photoCache[pid]) delete window._photoCache[pid];
        }

        clearPersistedKeyPrefix(_idbPersistedDrawingKeys, prefix);
        clearPersistedKeyPrefix(_idbPersistedTierKeys, prefix);
        clearPersistedKeyPrefix(_idbPersistedPdfKeys, prefix);
        clearPersistedKeyPrefix(_idbPersistedSourceKeys, prefix);
        if (window._cloudSyncedDrawingKeys) clearPersistedKeyPrefix(window._cloudSyncedDrawingKeys, prefix);
        if (window._cloudSyncedTierKeys) clearPersistedKeyPrefix(window._cloudSyncedTierKeys, prefix);
        if (window._cloudSyncedPdfKeys) clearPersistedKeyPrefix(window._cloudSyncedPdfKeys, prefix);

        if (state.floorDrawingTierImageCache) {
            Object.keys(state.floorDrawingTierImageCache).forEach((k) => {
                if (String(k).startsWith(prefix)) delete state.floorDrawingTierImageCache[k];
            });
        }
        if (state.floorImageCache) {
            Object.keys(state.floorImageCache).forEach((k) => {
                if (String(k).startsWith(prefix)) delete state.floorImageCache[k];
            });
        }

        const bldg = (window.state.buildings || []).find((b) => b && b.id === buildingId);
        if (bldg) {
            bldg.floorDrawings = {};
            bldg.floorDrawingTiers = {};
            bldg.floorDrawingPdfs = {};
            bldg.floorDrawingSources = {};
        }
        return removed;
    }

    /**
     * 24시간 이상 들어가지 않은 점검의 IndexedDB 대용량(도면 3티어·사진·PDF)만 정리.
     * - 오프라인이면 절대 삭제하지 않음 (현장 오프라인 점검 보호)
     * - 지금 들어가 있는 점검은 유지
     * - 저장/진입할 때마다 접근 시각이 갱신되므로 장시간 오프라인 작업도 안전
     */
    /** 2026-10-19 이 건물에 서버에 안 올라간 이 기기 사진(data URL)이 있나 */
    async function buildingHasUnuploadedPhotos(bldgId) {
        const guard = window.BSA && window.BSA.cachePurgeGuard;
        let keys = new Set();
        try { keys = new Set(offlinePrepPhotoKeysOfBuilding(bldgId)); } catch (_e) { keys = new Set(); }
        Object.entries(window.state.defects || {}).forEach(([k, arr]) => {
            if (!String(k).startsWith(`${bldgId}_`)) return;
            (arr || []).forEach((d) => {
                if (!d) return;
                (d.photoIds || []).forEach((p) => { if (p) keys.add(p); });
                (d.prevRoundPhotoIds || []).forEach((p) => { if (p) keys.add(p); });
            });
        });
        for (const key of keys) {
            if (isPhotoMarkedOnStorage(key)) continue;
            let local = window._photoCache && window._photoCache[key];
            if (!(typeof local === 'string' && local.indexOf('data:') === 0)) {
                try { local = await idbGet('photos', key); } catch (_e) { return true; }   // 못 읽으면 지킨다
            }
            if (guard ? guard.isUnuploadedLocalPhoto(false, local) : (typeof local === 'string' && local.indexOf('data:') === 0)) return true;
        }
        return false;
    }
    /** 정리 후보마다 지킬 이유 모으기 — 못 읽으면 지키는 쪽으로 */
    async function collectPurgeProtection(ids) {
        const prep = window.BSA && window.BSA.offlinePrep;
        const out = { dirtyFloorKeys: Array.from(_dirtyFloorKeys), preparedIds: [], unuploadedPhotoBuildingIds: [], pendingJournalBuildingIds: [] };
        try {
            if (prep) out.preparedIds = (await prep.listStatuses()).filter(Boolean).map((r) => String(r.buildingId));
        } catch (_e) { out.preparedIds = ids.slice(); }
        try {
            const j = syncJournal();
            if (j) j.pendingEntries().forEach((e) => {
                const fk = String(e.fk || '');
                ids.forEach((id) => { if (fk.indexOf(`${id}_`) === 0) out.pendingJournalBuildingIds.push(id); });
            });
        } catch (_e) { /* ignore */ }
        for (const id of ids) {
            try { if (await buildingHasUnuploadedPhotos(id)) out.unuploadedPhotoBuildingIds.push(id); } catch (_e) { out.unuploadedPhotoBuildingIds.push(id); }
        }
        return out;
    }

    async function pruneStaleIndexedDbInspectionData(opts) {
        const options = opts || {};
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return { skipped: 'offline', removedBuildings: 0 };
        }
        // 2026-10-19 다시 연결된 뒤 올리기·서버 확인이 끝나기 전에는 정리하지 않는다(js/core/cache-purge-guard.js)
        const purgeGuard = window.BSA && window.BSA.cachePurgeGuard;
        if (purgeGuard) {
            let why = '';
            try {
                why = purgeGuard.pruneBlockReason({
                    offlineReturnPending: localStorage.getItem('bsa_offline_worked_v1') === '1',
                    offlineReturnRunning: !!_offlineReturnRunning,
                    syncing: !!_syncInFlight,
                    dirtyCount: _dirtyFloorKeys.size,
                    photoSavesPending: (window._defectPhotoSaves && window._defectPhotoSaves.size) || 0
                });
            } catch (_e) { why = 'unknown'; }
            if (why) return { skipped: why, removedBuildings: 0 };
        }
        if (_idbInspectionPruneInFlight) return _idbInspectionPruneInFlight;
        _idbInspectionPruneInFlight = (async () => {
            const map = ensureBuildingAccessSeeded();
            const now = Date.now();
            const keepId = window.state.currentBuildingId || null;
            if (keepId) {
                map[keepId] = now;
                writeBuildingAccessMap(map);
            }
            const staleIds = Object.keys(map).filter((id) => {
                if (!id || id === keepId) return false;
                const ts = Number(map[id] || 0);
                return !ts || (now - ts) >= BUILDING_ACCESS_TTL_MS;
            });
            let removedBuildings = 0;
            let removedKeys = 0;
            // 2026-10-19 올릴 층·안 올라간 사진·서버 확인 안 된 변경·오프라인 준비한 건물은 빼고 남긴다(다음에 다시 본다)
            let targets = staleIds;
            if (purgeGuard && staleIds.length) {
                const sel = purgeGuard.selectPurgeable(staleIds, await collectPurgeProtection(staleIds));
                targets = sel.purge;
                if (sel.kept.length) console.info('[캐시 정리] 지키려고 남긴 건물:', sel.kept);
            }
            for (let i = 0; i < targets.length; i++) {
                const id = targets[i];
                removedKeys += await purgeBuildingIndexedDbAssets(id, { keepUnuploaded: true });
                delete map[id];
                removedBuildings++;
            }
            writeBuildingAccessMap(map);
            if (removedBuildings > 0 && options.notify && typeof window.showToast === 'function') {
                window.showToast(`오래된 점검 캐시 ${removedBuildings}건을 기기에서 정리했습니다.`, 'info', 3500);
            }
            return { removedBuildings, removedKeys };
        })().catch((e) => {
            console.warn('IndexedDB 점검 캐시 정리 실패:', e);
            return { removedBuildings: 0, error: e };
        }).finally(() => {
            _idbInspectionPruneInFlight = null;
        });
        return _idbInspectionPruneInFlight;
    }
    window.pruneStaleIndexedDbInspectionData = pruneStaleIndexedDbInspectionData;
    window.touchBuildingAccess = touchBuildingAccess;

    async function hydrateBuildingPdfsFromSiteVault(bldg) {
        if (!bldg) return;
        const siteKey = siteVaultKeyForBuilding(bldg);
        bldg.siteVaultKey = siteVaultDocId(siteKey);
        const floors = (bldg.floorsList && bldg.floorsList.length > 0)
            ? bldg.floorsList.map(f => f.floorCode)
            : Object.keys(bldg.floorDrawings || bldg.floorDrawingPdfs || {});
        for (const fc of floors) {
            if (bldg.floorDrawingPdfs && bldg.floorDrawingPdfs[fc]) continue;
            const pdf = await resolveBuildingFloorPdf(bldg, fc);
            if (pdf) {
                await applyResolvedPdfToBuilding(bldg, fc, pdf);
                if (db && window.state.companyId) {
                    await uploadFloorDrawingPdf(bldg.id, fc, pdf);
                }
            }
        }
    }

    async function uploadFloorDrawingPdf(buildingId, floorCode, pdfDataUrl) {
        if (!db || !window.state.companyId || !pdfDataUrl) return false;
        const docId = `${buildingId}_${floorCode}`;
        const docRef = db.collection('safety_app').doc(getCompanyDocId()).collection('floorDrawingPdfs').doc(docId);
        try {
            if (USE_FIREBASE_STORAGE_FOR_DRAWINGS && getFirebaseStorage()) {
                const scope = storageScopeForBuildingId(buildingId);
                const path = storagePathFloorDrawingPdf(getCompanyDocId(), buildingId, floorCode, scope);
                let previousStoragePath = null;
                try {
                    const prevSnap = await docRef.get();
                    if (prevSnap.exists) previousStoragePath = storagePathFromSnapData(prevSnap.data() || {});
                } catch (_e) { /* ignore */ }
                await uploadAssetToFirebaseStorageAndMeta(docRef, path, pdfDataUrl, {
                    freshName: true,
                    buildingId,
                    floorCode,
                    site: scope.site,
                    round: scope.round,
                    previousStoragePath
                });
            } else {
                await writeChunkedPdfToDocRef(docRef, pdfDataUrl);
            }
            if (!window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys = new Set();
            window._cloudSyncedPdfKeys.add(docId);
            const bldg = (window.state.buildings || []).find(b => b.id === buildingId);
            if (bldg) {
                const siteKey = siteVaultKeyForBuilding(bldg);
                bldg.siteVaultKey = siteVaultDocId(siteKey);
                await uploadSiteVaultPdf(siteKey, floorCode, pdfDataUrl);
            }
            return true;
        } catch (e) {
            console.warn('PDF 원본 서버 업로드 실패:', e);
            return false;
        }
    }

    async function fetchFloorDrawingPdfFromCloud(buildingId, floorCode) {
        if (!db || !window.state.companyId) return null;
        const docId = `${buildingId}_${floorCode}`;
        try {
            const docRef = db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawingPdfs').doc(docId);
            return await readChunkedPdfFromDocRef(docRef);
        } catch (e) {
            console.warn('PDF 원본 서버 조회 실패:', e);
            return null;
        }
    }

    async function cloudFloorDrawingPdfExists(buildingId, floorCode) {
        if (!db || !window.state.companyId || !buildingId || !floorCode) return false;
        const docId = `${buildingId}_${floorCode}`;
        if (!window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys = initCloudSyncedKeySet('pdfs');
        if (window._cloudSyncedPdfKeys.has(docId)) return true;
        try {
            const snap = await db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawingPdfs').doc(docId).get();
            if (!snap.exists) {
                window._cloudSyncedPdfKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            const data = snap.data() || {};
            if (snapNeedsSiteRoundMove(data)) {
                window._cloudSyncedPdfKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
                return false;
            }
            const ok = hasFirebaseStorageMeta(data)
                || (data.dataUrl && String(data.dataUrl).length > 32)
                || (data.chunkStatus === 'ready' && data.chunked && Number(data.chunkCount) > 0);
            if (ok) {
                window._cloudSyncedPdfKeys.add(docId);
                scheduleSaveCloudSyncedKeys();
                return true;
            }
            window._cloudSyncedPdfKeys.delete(docId);
            scheduleSaveCloudSyncedKeys();
            return false;
        } catch (e) {
            console.warn('PDF 원본 존재 확인 실패:', docId, e);
            return false;
        }
    }

    async function deleteFloorDrawingPdfFromCloud(buildingId, floorCode) {
        if (!db || !window.state.companyId) return;
        const docId = `${buildingId}_${floorCode}`;
        try {
            const docRef = db.collection('safety_app').doc(getCompanyDocId())
                .collection('floorDrawingPdfs').doc(docId);
            const fallback = storagePathFloorDrawingPdf(
                getCompanyDocId(), buildingId, floorCode, storageScopeForBuildingId(buildingId)
            );
            await deleteCloudAssetDoc(docRef, fallback);
            if (window._cloudSyncedPdfKeys) {
                window._cloudSyncedPdfKeys.delete(docId);
                scheduleSaveCloudSyncedKeys();
            }
        } catch (e) {
            console.warn(`PDF 원본 서버 삭제 실패 (${docId}):`, e);
        }
    }

    /** 동기화 시 로컬 래스터 미리보기를 Firestore에 올려 PC↔모바일 도면 표시 동기화 */
    /**
     * 동기화 때 기기의 레스터 도면을 클라우드에 올린다. 올리는 경우는 둘뿐이다.
     *  1) 이 기기에서 새로 넣었는데 아직 못 올린 도면("올려야 함" 표시) — 단, 클라우드 도면이
     *     그보다 나중에 올라간 것이면 이 기기 것이 옛 도면이므로 올리지 않는다.
     *  2) 클라우드에 도면이 아예 없거나 옛 경로라 옮겨야 하는 층.
     * 클라우드 상태를 모르면(조회 실패) 올리지 않는다 — 옛 도면으로 새 도면을 덮는 것보다 낫다.
     */
    async function uploadFloorDrawingsForSync(buildings) {
        if (!db || !window.state.companyId) return;
        const synced = ensureCloudSyncedDrawingKeys();
        const pending = readPendingDrawingUploads();
        for (const b of (buildings || [])) {
            if (!b || !b.id) continue;
            const floorCodes = collectKnownFloorCodesForBuilding(b);
            for (const floorCode of floorCodes) {
                const docId = `${b.id}_${floorCode}`;
                if (isDeletedDrawingFloor(b, floorCode)) {
                    clearPendingDrawingUpload(docId);
                    continue;
                }
                const pendingAt = Number(pending[docId]) || 0;
                if (!pendingAt && synced.has(docId)) continue;
                let raster = b.floorDrawings && b.floorDrawings[floorCode];
                if ((!raster || !isUsableRasterDrawingUrl(raster) || isPdfDrawingUrl(raster)) && typeof idbGet === 'function') {
                    raster = await idbGet('floorDrawings', docId);
                }
                if (!raster || isPdfDrawingUrl(raster) || !isUsableRasterDrawingUrl(raster)) continue;
                const cloud = await readCloudFloorDrawingState(b.id, floorCode);
                if (cloud.error) continue;
                if (pendingAt) {
                    if (cloud.exists && cloud.usable && cloud.updatedAtMs > pendingAt) {
                        // 다른 기기가 이 기기보다 나중에 도면을 올렸다 — 이 기기 것은 옛 도면
                        clearPendingDrawingUpload(docId, pendingAt);
                        synced.add(docId);
                        scheduleSaveCloudSyncedKeys();
                        continue;
                    }
                    await uploadFloorDrawing(b.id, floorCode, raster, { fromSync: true, pendingAt });
                    continue;
                }
                if (cloud.exists && cloud.usable && !cloud.needsMove) {
                    synced.add(docId);
                    scheduleSaveCloudSyncedKeys();
                    continue;
                }
                await uploadFloorDrawing(b.id, floorCode, raster, { fromSync: true });
            }
        }
    }

    /** PDF만 있는 층 — PC에서 일반·고해상도·초고해상도 JPEG를 만들어 Firestore에 올림 (현장은 이 레스터만 받음) */
    async function ensureRasterTiersForSync(buildings) {
        if (!db || !window.state.companyId) return;
        if (typeof isNativeAndroidApp === 'function' && isNativeAndroidApp() && !layoutIsPcLike()) return;
        const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
        for (const b of (buildings || [])) {
            if (!b || !b.id) continue;
            const floorCodes = collectKnownFloorCodesForBuilding(b);
            for (const floorCode of floorCodes) {
                if (isDeletedDrawingFloor(b, floorCode)) continue;
                const docId = `${b.id}_${floorCode}`;
                let tiers = (b.floorDrawingTiers && b.floorDrawingTiers[floorCode]) || null;
                if (!tiers && typeof idbGet === 'function') {
                    tiers = await idbGet('floorDrawingTiers', docId);
                }
                const missing = dims.filter((d) => !(tiers && (tiers[String(d)] || tiers[d])));
                if (missing.length) {
                    let pdfUrl = (b.floorDrawingPdfs && b.floorDrawingPdfs[floorCode]) || null;
                    if (!pdfUrl && typeof idbGet === 'function') {
                        pdfUrl = await idbGet('floorDrawingPdfs', docId);
                    }
                    if (pdfUrl && typeof window.buildFloorDrawingTiersFromPdf === 'function') {
                        try {
                            const built = await window.buildFloorDrawingTiersFromPdf(pdfUrl, docId);
                            tiers = { ...(tiers || {}), ...built };
                        } catch (e) {
                            console.warn('동기화용 도면 티어 생성 실패:', b.id, floorCode, e);
                        }
                    } else {
                        const source = (b.floorDrawingSources && b.floorDrawingSources[floorCode])
                            || (b.floorDrawings && b.floorDrawings[floorCode])
                            || (typeof idbGet === 'function' ? await idbGet('floorDrawingSources', docId) : null)
                            || (typeof idbGet === 'function' ? await idbGet('floorDrawings', docId) : null);
                        if (source && isUsableRasterDrawingUrl(source) && typeof window.buildFloorDrawingTiersFromDataUrl === 'function') {
                            try {
                                const built = await window.buildFloorDrawingTiersFromDataUrl(source);
                                tiers = { ...(tiers || {}), ...built };
                            } catch (e) {
                                console.warn('동기화용 이미지 티어 생성 실패:', b.id, floorCode, e);
                            }
                        }
                    }
                    if (tiers && Object.keys(tiers).length) {
                        if (!b.floorDrawingTiers) b.floorDrawingTiers = {};
                        b.floorDrawingTiers[floorCode] = tiers;
                        _idbPersistedTierKeys.delete(docId);
                        if (typeof idbSet === 'function') await idbSet('floorDrawingTiers', docId, tiers);
                    }
                }
                if (!tiers) continue;
                const needUpload = [];
                for (const dim of dims) {
                    const url = tiers[String(dim)] || tiers[dim];
                    if (!url || !isUsableRasterDrawingUrl(url)) continue;
                    const tierDocId = floorDrawingTierCloudDocId(b.id, floorCode, dim);
                    if (window._cloudSyncedTierKeys && window._cloudSyncedTierKeys.has(tierDocId)) continue;
                    if (!(await cloudFloorDrawingTierExists(b.id, floorCode, dim))) {
                        needUpload.push(dim);
                    }
                }
                if (needUpload.length) {
                    await uploadFloorDrawingTiers(b.id, floorCode, tiers);
                }
                const raster4000 = tiers['4000'] || tiers[4000];
                if (isUsableRasterDrawingUrl(raster4000)) {
                    if (!b.floorDrawings) b.floorDrawings = {};
                    if (!isUsableRasterDrawingUrl(b.floorDrawings[floorCode])) {
                        b.floorDrawings[floorCode] = raster4000;
                    }
                    const rasterDocId = `${b.id}_${floorCode}`;
                    if (window._cloudSyncedDrawingKeys && window._cloudSyncedDrawingKeys.has(rasterDocId)) {
                        /* already uploaded this session */
                    } else if (!(await cloudFloorDrawingExists(b.id, floorCode))) {
                        await uploadFloorDrawing(b.id, floorCode, b.floorDrawings[floorCode] || raster4000, { fromSync: true });
                    } else {
                        ensureCloudSyncedDrawingKeys();
                        window._cloudSyncedDrawingKeys.add(rasterDocId);
                    }
                }
            }
        }
    }

    /** 동기화 시 로컬 PDF 원본을 Firestore에 올려 기기 간 벡터 출력·고해상도 줌 유지 */
    async function uploadFloorDrawingPdfsForSync(buildings) {
        if (!db || !window.state.companyId) return;
        if (!window._cloudSyncedPdfKeys) window._cloudSyncedPdfKeys = new Set();
        for (const b of (buildings || [])) {
            if (!b || !b.id) continue;
            const pdfs = b.floorDrawingPdfs || {};
            const floorCodes = collectKnownFloorCodesForBuilding(b);
            for (const floorCode of floorCodes) {
                const docId = `${b.id}_${floorCode}`;
                if (dropRemovedFloorPdf(b, floorCode)) {
                    // 뺄 때 클라우드 삭제가 실패했으면(오프라인 등) 여기서 다시 지운다 — 절대 다시 올리지 않는다.
                    // 지워진 걸 한 번 확인하면 이 세션에선 다시 묻지 않는다(동기화마다 읽기 1회를 아끼려고).
                    if (!_confirmedGoneCloudPdfKeys.has(docId)) {
                        if (await cloudFloorDrawingPdfExists(b.id, floorCode)) await deleteFloorDrawingPdfFromCloud(b.id, floorCode);
                        else _confirmedGoneCloudPdfKeys.add(docId);
                    }
                    continue;
                }
                if (window._cloudSyncedPdfKeys.has(docId)) continue;
                if (await cloudFloorDrawingPdfExists(b.id, floorCode)) continue;
                let pdfDataUrl = pdfs[floorCode];
                if (!pdfDataUrl) pdfDataUrl = await idbGet('floorDrawingPdfs', docId);
                if (!pdfDataUrl) continue;
                if (!b.floorDrawingPdfs) b.floorDrawingPdfs = {};
                b.floorDrawingPdfs[floorCode] = pdfDataUrl;
                await uploadFloorDrawingPdf(b.id, floorCode, pdfDataUrl);
            }
        }
    }

    // ids: 결함의 사진 ID 목록(photoIds / prevRoundPhotoIds). 없으면 옛 자리 번호로 만든다.
    async function uploadDefectPhotos(defectId, photosArray, kind, ids) {
        if (!Array.isArray(photosArray) || photosArray.length === 0) return [];
        if (!window._photoCache) window._photoCache = {};
        if (!window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds = new Set();
        const photoIds = photosArray.map((_, i) => (Array.isArray(ids) && ids[i]) || getPhotoDocId(defectId, i, kind));
        photosArray.forEach((url, i) => { window._photoCache[photoIds[i]] = url; });
        if (db && window.state.companyId) {
            await Promise.all(photosArray.map((url, i) => {
                const pid = photoIds[i];
                if (!url) return Promise.resolve();
                return persistPhotoToCloud(pid, url);
            }));
        }
        return photoIds;
    }

    /** 동기화 시 로컬·레거시 Firestore dataUrl 사진을 Storage로 올려 웹↔폰 표시가 맞도록 함 */
    const PHOTO_SYNC_UPLOAD_MAX_RETRY = 5;
    const _photoSyncUploadFailCount = new Map();

    /**
     * 반환: 사진을 못 올린 층 키 Set. 동기화는 층 문서를 쓴 뒤 이 층들을 다시 "올릴 것 있음"으로 둔다
     * (감사 R-03, 2026-09-28 — 예전엔 실패를 안 보고 층 표시를 지워, 그 층을 떠나면 다시 안 올라갔다).
     */
    async function uploadInlineDefectPhotosForSync(defectsMap) {
        const failedFloors = new Set();
        if (!db || !window.state.companyId) return failedFloors;
        const jobs = [];
        const pushJob = (photoId, inlineUrl, floorKey) => {
            if (!photoId) return;
            jobs.push({ photoId, inlineUrl, floorKey });
        };
        for (const [floorKey, arr] of Object.entries(defectsMap || {})) {
            for (const d of (arr || [])) {
                if (!d || !d.id) continue;
                const pushList = (photos, ids, kind) => {
                    const count = Math.max(
                        (Array.isArray(photos) ? photos.length : 0),
                        (Array.isArray(ids) ? ids.length : 0)
                    );
                    for (let i = 0; i < count; i++) {
                        const pid = (ids && ids[i]) || getPhotoDocId(d.id, i, kind);
                        pushJob(pid, photos && photos[i], floorKey);
                    }
                };
                pushList(d.photos, d.photoIds);
                pushList(d.prevRoundPhotos, d.prevRoundPhotoIds, 'prev');
            }
        }
        for (const b of (window.state.buildings || [])) {
            if (!b || !b.id) continue;
            const overview = Array.isArray(b.overviewPhotos) ? b.overviewPhotos : [];
            overview.forEach((p) => {
                if (!p || !p.id) return;
                pushJob(getOverviewPhotoDocId(b.id, p.id), p.dataUrl);
            });
            if (Array.isArray(b.prevSummaryImages) && window.BSA && window.BSA.prevSummary) {
                b.prevSummaryImages.forEach((p) => {
                    if (!p || !p.id) return;
                    pushJob(window.BSA.prevSummary.docId(b.id, p.id), p.dataUrl);
                });
            }
            const prefix = b.id + '_';
            const ndt = window.state.ndtData || {};
            Object.keys(ndt).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (ndt[k] || []).forEach((item) => {
                    const slots = (item && Array.isArray(item.strengthSlots)) ? item.strengthSlots : [];
                    slots.forEach((s) => {
                        if (!s || !s.photoId) return;
                        pushJob(getStrengthPhotoDocId(b.id, s.photoId), null, k);
                    });
                });
            });
            // 비파괴 장비조사 현장 사진 — 항목과 부동침하·부재변위 구역(2026-09-28)
            [ndt, window.state.ndtDisplacementGroups || {}].forEach((map) => {
                Object.keys(map).forEach((k) => {
                    if (!k.startsWith(prefix)) return;
                    (map[k] || []).forEach((rec) => {
                        ((rec && Array.isArray(rec.photoIds)) ? rec.photoIds : []).forEach((pid) => {
                            if (pid) pushJob(getStrengthPhotoDocId(b.id, pid), null, k);
                        });
                    });
                });
            });
            // NDT 전용 도면 — 넣을 때 올리기가 실패하면(오프라인 등) 참조만 동기화되고 그림은 영영 안 올라가
            // 다른 기기가 층 도면으로 조용히 대신 그렸다(2026-09-28 점검). 기기에 남은 그림을 여기서 다시 올린다.
            const refs = window.state.ndtDrawingRefs || {};
            Object.keys(refs).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                const ref = refs[k];
                if (ref && ref.id) pushJob(ref.id, null, k);
            });
        }
        const seen = new Set();
        const unique = [];
        jobs.forEach((job) => {
            if (seen.has(job.photoId)) return;
            seen.add(job.photoId);
            unique.push(job);
        });
        const tracker = (typeof photoRetryTracker === 'function') ? photoRetryTracker() : null;
        await runPhotoJobsInBatches(unique, async (job) => {
            // 2026-10-20 멈춘 사진(영구 오류·5번 연속 실패)은 자동으로 다시 올리지 않는다 — 기기 사본은 그대로, 「지금 다시 올리기」로만
            if (tracker && !tracker.shouldTry(job.photoId)) return;
            let ok = false;
            let err = null;
            const lastErrMap = (typeof _photoLastError !== 'undefined') ? _photoLastError : null;
            if (lastErrMap) lastErrMap.delete(job.photoId);
            try {
                ok = (await ensurePhotoPersistedToStorage(job.photoId, job.inlineUrl)) !== false;
            } catch (e) {
                err = e;
                console.warn('[사진] 동기화 업로드 실패:', job.photoId, e);
            }
            if (ok) {
                _photoSyncUploadFailCount.delete(job.photoId);
                if (tracker) tracker.ok(job.photoId);
                return;
            }
            if (tracker) {
                const r = tracker.fail(job.photoId, err || (lastErrMap && lastErrMap.get(job.photoId)) || { code: 'upload-failed', message: '사진 업로드 실패' });
                if (r.parked) {
                    console.warn(`[사진] ${job.photoId} 자동 올리기 멈춤(${r.kind}, ${r.n}번) — 기기 사본은 그대로 둡니다.`);
                    return;
                }
                if (job.floorKey) failedFloors.add(job.floorKey);
                return;
            }
            // 같은 사진이 계속 실패하면(권한·손상 등) 그 층을 끝없이 다시 쓰지 않게 5번에서 멈춘다
            const n = (_photoSyncUploadFailCount.get(job.photoId) || 0) + 1;
            _photoSyncUploadFailCount.set(job.photoId, n);
            if (n <= PHOTO_SYNC_UPLOAD_MAX_RETRY && job.floorKey) failedFloors.add(job.floorKey);
            else if (n === PHOTO_SYNC_UPLOAD_MAX_RETRY + 1) {
                console.warn(`[사진] ${job.photoId} 업로드가 ${PHOTO_SYNC_UPLOAD_MAX_RETRY}번 연속 실패 — 이번 실행에선 더 재시도하지 않습니다.`);
            }
        });
        return failedFloors;
    }

    /** 회사 문서 저장 후 사진·도면 업로드(메타데이터 업로드와 분리) */

    // 반환값: 삭제 실패 건수. 실패해도 예외를 던지지 않지만, 호출부에서 사용자에게 알릴 수 있도록 건수를 반환한다.
    // ids: 결함의 사진 ID 목록. 옛 자리 번호 0..count도 같이 지운다 — 목록이 덜 내려온 기기에서도
    // 남는 사진이 없게.
    // opts.deferCloudFloorKey: 클라우드 사본은 지우지 않고 대기열에 넣는다(enqueueDeferredPhotoDelete).
    async function deletePhotosForDefect(defectId, count, kind, ids, keepIds, opts) {
        if (!count) return 0;
        const deferFloorKey = opts && opts.deferCloudFloorKey;
        const companyPhotos = (db && window.state.companyId)
            ? db.collection('safety_app').doc(getCompanyDocId()).collection('photos')
            : null;
        let failCount = 0;
        const localJobs = [];
        const cloudIds = [];
        const targets = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
        for (let i = 0; i < count; i++) targets.add(getPhotoDocId(defectId, i, kind));
        // 다른 결함이 아직 쓰는 사진은 지우지 않는다(2026-09-30 영일연립: 두 점검에 같은 id 결함이 있어,
        // 금회차 쪽 복제 행을 지우자 같은 사진 번호(결함id_0)를 쓰던 전차 사진이 서버에서 지워짐)
        if (keepIds && keepIds.size) {
            for (const pid of Array.from(targets)) {
                if (keepIds.has(pid)) {
                    targets.delete(pid);
                    console.warn('[사진] 다른 결함이 쓰는 사진이라 지우지 않음:', pid);
                }
            }
        }
        for (const photoDocId of targets) {
            _idbPersistedPhotoKeys.delete(photoDocId);
            // 미룬 삭제는 클라우드에 그대로 있다 — "올라가 있음" 표시를 남겨야 되살렸을 때 다시 올리지 않는다
            if (!deferFloorKey && window._cloudSyncedPhotoIds) window._cloudSyncedPhotoIds.delete(photoDocId);
            localJobs.push(idbDelete('photos', photoDocId));
            if (companyPhotos || deferFloorKey) cloudIds.push(photoDocId);
        }
        await Promise.all(localJobs);
        if (deferFloorKey) {
            enqueueDeferredPhotoDelete({ kind: 'pin', floorKey: deferFloorKey, recIds: [defectId], photoDocIds: cloudIds });
            return 0;
        }
        // 클라우드 삭제는 직렬 소배치 — Write stream exhausted 방지
        for (let i = 0; i < cloudIds.length; i++) {
            const photoDocId = cloudIds[i];
            try {
                await deleteCloudPhoto(photoDocId);
            } catch (e) {
                failCount++;
                console.warn(`사진 클라우드 삭제 실패 (${photoDocId}):`, e);
                if (typeof isFirestoreQuotaError === 'function' && isFirestoreQuotaError(e)) {
                    pauseFirestoreWrites(SYNC_QUOTA_COOLDOWN_MS);
                    // 나머지는 나중에 — 로컬은 이미 지워짐
                    break;
                }
            }
            if (i > 0 && i % 5 === 0) await new Promise((r) => setTimeout(r, 50));
        }
        return failCount;
    }

    // 진행 중인 결함 사진 삭제 — 되돌리기로 되살린 사진은 삭제가 끝난 뒤 다시 올린다(restoreDefectPhotosAfterUndo)
    // opts.deferCloudFloorKey: 되살아날 수 있는 삭제(결함 삭제·층 삭제·되돌리기) — 이 기기 사본만 바로 지우고
    // 클라우드 사본은 대기열로(processDeferredPhotoDeletes). 건물 영구 삭제는 옵션 없이 바로 지운다.
    function deleteAllPhotosForDefect(d, opts) {
        if (!d) return Promise.resolve(0);
        const jobs = window._defectPhotoDeleteJobs || (window._defectPhotoDeleteJobs = new Map());
        const prevJob = jobs.get(d.id) || Promise.resolve();
        const job = Promise.resolve(prevJob).catch(() => {}).then(() => runDeleteAllPhotosForDefect(d, opts));
        jobs.set(d.id, job);
        const clear = () => { if (jobs.get(d.id) === job) jobs.delete(d.id); };
        job.then(clear, clear);
        return job;
    }

    /** 이 기기에 있는 결함 중 d(같은 객체) 말고 다른 결함이 쓰는 사진 ID — 모든 점검·층 */
    function photoIdsUsedByOtherDefects(d) {
        const used = new Set();
        const defects = (window.state && window.state.defects) || {};
        Object.keys(defects).forEach((k) => {
            (defects[k] || []).forEach((e) => {
                if (!e || e === d) return;
                const nCur = Math.max((e.photoIds || []).length, (e.photos || []).length);
                const nPrev = Math.max((e.prevRoundPhotoIds || []).length, (e.prevRoundPhotos || []).length);
                defectPhotoIdList(e, nCur).forEach((pid) => { if (pid) used.add(pid); });
                defectPhotoIdList(e, nPrev, 'prev').forEach((pid) => { if (pid) used.add(pid); });
            });
        });
        return used;
    }

    async function runDeleteAllPhotosForDefect(d, opts) {
        let fail = 0;
        const keepIds = photoIdsUsedByOtherDefects(d);
        const curCount = (d.photos && d.photos.length) || (d.photoIds && d.photoIds.length) || 0;
        const prevCount = (d.prevRoundPhotos && d.prevRoundPhotos.length) || (d.prevRoundPhotoIds && d.prevRoundPhotoIds.length) || 0;
        if (curCount > 0) fail += await deletePhotosForDefect(d.id, curCount, undefined, d.photoIds, keepIds, opts);
        if (prevCount > 0) fail += await deletePhotosForDefect(d.id, prevCount, 'prev', d.prevRoundPhotoIds, keepIds, opts);
        return fail;
    }

    /**
     * 미룬 클라우드 사진 삭제 (2026-09-30 — 삭제 vs 수정 = 수정 우선).
     * 지운 결함·비파괴 기록은 며칠 뒤 다른 사람의 오프라인 수정으로 되살아날 수 있다. 그때 사진이 이미
     * 클라우드에서 지워졌으면 되살아난 기록의 사진이 다른 기기에서 깨진다. 또 오프라인에서 지우면 클라우드
     * 삭제가 실패하고 다시 시도하지 않아 고아 사진이 남았다. 그래서 지울 때는 이 기기 사본만 지우고, 클라우드
     * 사본은 이 대기열에 넣었다가 HOLD가 지난 뒤 **서버 층 문서에도 그 기록이 없을 때만** 지운다.
     * 실패하면 대기열에 남아 다음 동기화가 다시 시도한다.
     * 항목: { kind: 'pin'|'ndt', floorKey, recIds, photoDocIds(pin) | pids(ndt, 건물별 측정지·현장 사진 번호), at }
     */
    const DEFERRED_PHOTO_DELETE_HOLD_MS = 7 * 24 * 60 * 60 * 1000;
    const DEFERRED_PHOTO_DELETE_MIN_INTERVAL_MS = 30 * 60 * 1000;
    let _deferredPhotoDeleteRunning = false;
    let _deferredPhotoDeleteLastRun = 0;

    function deferredPhotoDeleteKey() {
        const cid = (typeof getCompanyDocId === 'function' && getCompanyDocId()) || window.state.companyId || '';
        return 'bsaDeferredPhotoDeletes:' + cid;
    }

    function loadDeferredPhotoDeletes() {
        try {
            const arr = JSON.parse(localStorage.getItem(deferredPhotoDeleteKey()) || '[]');
            return Array.isArray(arr) ? arr.filter((e) => e && e.floorKey) : [];
        } catch (_e) {
            return [];
        }
    }

    function saveDeferredPhotoDeletes(list) {
        try {
            if (list.length) localStorage.setItem(deferredPhotoDeleteKey(), JSON.stringify(list));
            else localStorage.removeItem(deferredPhotoDeleteKey());
        } catch (e) {
            console.warn('[사진] 미룬 삭제 목록 저장 실패:', e);
        }
    }

    function enqueueDeferredPhotoDelete(entry) {
        if (!entry || !entry.floorKey) return;
        const photos = entry.kind === 'ndt' ? entry.pids : entry.photoDocIds;
        if (!Array.isArray(photos) || !photos.length) return;
        const list = loadDeferredPhotoDeletes();
        list.push(Object.assign({ at: Date.now() }, entry));
        saveDeferredPhotoDeletes(list);
    }

    function findBuildingOfFloorKey(floorKey) {
        const list = window.state.buildings || [];
        let best = null;
        list.forEach((b) => {
            if (!b || !b.id || !String(floorKey).startsWith(b.id + '_')) return;
            if (!best || b.id.length > best.id.length) best = b;
        });
        return best;
    }

    function recordIdsOfFloorBundle(bundle) {
        const ids = new Set();
        const add = (arr) => (arr || []).forEach((r) => { if (r && r.id) ids.add(r.id); });
        if (bundle) {
            add(bundle.markings && bundle.markings.items);
            add(bundle.ndt && bundle.ndt.items);
            add(bundle.ndt && bundle.ndt.displacementGroups);
        }
        return ids;
    }

    // 결함 목록이 쓰는 사진 ID 전부(photoIdsUsedByOtherDefects와 같은 셈법) — 미룬 삭제가 지우기 직전 다시 확인
    function defectPhotoIdsOfList(list, into) {
        (list || []).forEach((e) => {
            if (!e) return;
            const nCur = Math.max((e.photoIds || []).length, (e.photos || []).length);
            const nPrev = Math.max((e.prevRoundPhotoIds || []).length, (e.prevRoundPhotos || []).length);
            defectPhotoIdList(e, nCur).forEach((pid) => { if (pid) into.add(pid); });
            defectPhotoIdList(e, nPrev, 'prev').forEach((pid) => { if (pid) into.add(pid); });
        });
        return into;
    }

    function strengthPhotoIdsOfFloorBundle(bundle) {
        const used = new Set();
        if (!bundle || !bundle.ndt) return used;
        [bundle.ndt.items, bundle.ndt.displacementGroups].forEach((arr) => {
            (arr || []).forEach((it) => strengthPhotoIdsOfItem(it).forEach((p) => used.add(p)));
        });
        return used;
    }

    async function processDeferredPhotoDeletes(options) {
        const force = !!(options && options.force);
        if (_deferredPhotoDeleteRunning) return;
        if (!force && Date.now() - _deferredPhotoDeleteLastRun < DEFERRED_PHOTO_DELETE_MIN_INTERVAL_MS) return;
        if (!db || !window.state.companyId || navigator.onLine === false) return;
        const queue = loadDeferredPhotoDeletes();
        if (!queue.length) return;
        const now = Date.now();
        const due = queue.filter((e) => now - (Number(e.at) || 0) >= DEFERRED_PHOTO_DELETE_HOLD_MS);
        if (!due.length) return;
        if (await isCloudPhotoWriteBlocked()) return;
        _deferredPhotoDeleteRunning = true;
        _deferredPhotoDeleteLastRun = now;
        const done = new Set();
        let deleted = 0;
        let keptRevived = 0;
        try {
            const byFloor = new Map();
            due.forEach((e) => {
                if (!byFloor.has(e.floorKey)) byFloor.set(e.floorKey, []);
                byFloor.get(e.floorKey).push(e);
            });
            for (const [floorKey, entries] of byFloor) {
                const bldg = findBuildingOfFloorKey(floorKey);
                // 건물 목록에 없으면 영구 삭제된 건물 — 서버 확인 없이 지운다
                let serverIds = new Set();
                let serverStrength = new Set();
                // 다른 결함이 같은 사진 번호를 쓰면 지우지 않는다(photoIdsUsedByOtherDefects — 영일연립 사고).
                // 7일 사이에 복제·가져오기로 새로 생긴 사용처도 있으니 지우기 직전에 다시 센다.
                const usedPinPhotos = photoIdsUsedByOtherDefects(null);
                if (bldg) {
                    let bundle = null;
                    try {
                        bundle = await readFloorSyncBundle(bldg, floorKey.slice(bldg.id.length + 1));
                    } catch (e) {
                        console.warn('[사진] 미룬 삭제: 층 문서 조회 실패 — 다음에 다시:', floorKey, e);
                        continue;
                    }
                    serverIds = recordIdsOfFloorBundle(bundle);
                    serverStrength = strengthPhotoIdsOfFloorBundle(bundle);
                    defectPhotoIdsOfList(bundle && bundle.markings && bundle.markings.items, usedPinPhotos);
                }
                const localIds = new Set();
                [window.state.defects, window.state.ndtData, window.state.ndtDisplacementGroups].forEach((map) => {
                    Object.keys(map || {}).forEach((k) => {
                        if (bldg && !k.startsWith(bldg.id + '_')) return;
                        (map[k] || []).forEach((r) => { if (r && r.id) localIds.add(r.id); });
                    });
                });
                const localStrength = bldg ? collectStrengthPhotoIdsInBuilding(bldg.id) : new Set();
                for (const e of entries) {
                    const recIds = Array.isArray(e.recIds) ? e.recIds : [];
                    let docIds;
                    if (e.kind === 'ndt') {
                        const bid = e.bldgId || (bldg && bldg.id);
                        docIds = (e.pids || [])
                            .filter((p) => !serverStrength.has(p) && !localStrength.has(p))
                            .map((p) => getStrengthPhotoDocId(bid, p));
                    } else {
                        // 되살아난 결함(서버나 이 기기에 다시 있음)의 사진은 지우지 않는다
                        docIds = recIds.some((id) => serverIds.has(id) || localIds.has(id))
                            ? []
                            : (e.photoDocIds || []).filter((pid) => {
                                if (!usedPinPhotos.has(pid)) return true;
                                console.warn('[사진] 미룬 삭제: 다른 결함이 쓰는 사진이라 지우지 않음:', pid);
                                return false;
                            });
                    }
                    if (!docIds.length) {
                        keptRevived++;
                        done.add(e);
                        continue;
                    }
                    let failed = false;
                    for (const docId of docIds) {
                        try {
                            await deleteCloudPhoto(docId);
                            deleted++;
                        } catch (err) {
                            failed = true;
                            console.warn('[사진] 미룬 삭제 실패 — 다음 동기화에 다시:', docId, err);
                        }
                    }
                    if (!failed) done.add(e);
                }
            }
        } finally {
            _deferredPhotoDeleteRunning = false;
            // 도는 동안 새로 들어온 항목을 잃지 않게 다시 읽어서 끝난 것만 뺀다
            const doneKeys = new Set(Array.from(done).map((e) => JSON.stringify(e)));
            saveDeferredPhotoDeletes(loadDeferredPhotoDeletes().filter((e) => !doneKeys.has(JSON.stringify(e))));
        }
        if (deleted || keptRevived) {
            console.info(`[사진] 미룬 클라우드 삭제: ${deleted}장 지움, 되살아난 기록 ${keptRevived}건은 사진 유지`);
        }
    }

    /**
     * 병합에서 묘비를 이기고 되살아난 기록 처리(sync-merge collectRevived).
     * - 이 기기의 수정이 살렸으면: 사진이 그새 클라우드에서 지워졌을 수 있어 이 기기 사본으로 다시 올린다
     *   (클라우드에 있으면 문서만 읽고 끝).
     * - 이 기기가 지운 게 다른 사람 수정으로 돌아왔으면: 알린다.
     */
    const _revivalHandled = new Set();
    const _revivalNotice = { pin: [], ndt: [], timer: null };

    function handleRevivedRecords(revived, kind, stateMap) {
        if (!revived) return;
        Object.keys(revived).forEach((floorKey) => {
            (revived[floorKey] || []).forEach((r) => {
                const tag = `${kind}:${floorKey}:${r.id}`;
                if (_revivalHandled.has(tag)) return;
                _revivalHandled.add(tag);
                const rec = ((stateMap || {})[floorKey] || []).find((x) => x && x.id === r.id);
                if (!rec) return;
                if (r.keptLocal) {
                    reuploadRevivedRecordPhotos(floorKey, rec, kind).catch((e) => {
                        console.warn('[사진] 되살아난 기록 사진 다시 올리기 실패:', r.id, e);
                    });
                } else if (r.deletedHere) {
                    _revivalNotice[kind].push(rec);
                }
            });
        });
        if ((_revivalNotice.pin.length || _revivalNotice.ndt.length) && !_revivalNotice.timer) {
            _revivalNotice.timer = setTimeout(showRevivalNotice, 400);
        }
    }

    function showRevivalNotice() {
        const pins = _revivalNotice.pin.splice(0);
        const ndts = _revivalNotice.ndt.splice(0);
        _revivalNotice.timer = null;
        const parts = [];
        if (pins.length) {
            const nos = pins.map((d) => String(d.groupNo || d.no || '').trim()).filter(Boolean);
            const shown = nos.slice(0, 5).join(', ') + (nos.length > 5 ? ` 외 ${nos.length - 5}건` : '');
            parts.push(`결함 ${pins.length}건${shown ? ` (${shown})` : ''}`);
        }
        if (ndts.length) parts.push(`비파괴 항목 ${ndts.length}건`);
        if (!parts.length) return;
        const msg = `삭제한 ${parts.join(', ')}이 다른 사람의 수정으로 복원되었습니다. 필요 없으면 다시 삭제하세요.`;
        console.info('[동기화] ' + msg);
        if (typeof window.showToast === 'function') window.showToast(msg, 'warning', 7000);
    }

    async function reuploadRevivedRecordPhotos(floorKey, rec, kind) {
        if (!db || !window.state.companyId || navigator.onLine === false) return;
        let docIds = [];
        if (kind === 'ndt') {
            const bldg = findBuildingOfFloorKey(floorKey);
            if (!bldg) return;
            docIds = strengthPhotoIdsOfItem(rec).map((p) => getStrengthPhotoDocId(bldg.id, p));
        } else {
            docIds = [].concat(rec.photoIds || [], rec.prevRoundPhotoIds || []).filter(Boolean);
        }
        for (const docId of docIds) {
            const url = await resolveLocalPhotoUrl(docId);
            if (typeof url !== 'string' || url.indexOf('data:') !== 0) continue; // 이 기기에 바이트가 없으면 할 수 있는 게 없다
            const snap = await fetchPhotosDocIfAllowed(docId).catch(() => null);
            if (!snap) continue; // 읽기 일시정지 등 — 모르면 건드리지 않는다
            const data = snap.exists ? (snap.data() || {}) : {};
            if (hasFirebaseStorageMeta(data)) continue; // 클라우드에 그대로 있다
            unmarkPhotoOnStorage(docId);
            await persistPhotoToCloud(docId, url, data);
        }
    }

    async function deleteFloorDrawingsForBuilding(bldg, opts) {
        if (!bldg) return 0;
        const options = opts || {};
        const purgeCloud = options.purgeCloud !== false;
        const floors = (bldg.floorsList && bldg.floorsList.length > 0)
            ? bldg.floorsList.map(f => f.floorCode)
            : Object.keys(bldg.floorDrawings || {});
        let failCount = 0;
        await Promise.all(floors.map(fc => {
            const drawingDocId = `${bldg.id}_${fc}`;
            _idbPersistedDrawingKeys.delete(drawingDocId);
            _idbPersistedPdfKeys.delete(drawingDocId);
            _idbPersistedTierKeys.delete(drawingDocId);
            _idbPersistedSourceKeys.delete(drawingDocId);
            const jobs = [
                idbDelete('floorDrawings', drawingDocId),
                idbDelete('floorDrawingPdfs', drawingDocId),
                idbDelete('floorDrawingTiers', drawingDocId),
                idbDelete('floorDrawingSources', drawingDocId)
            ];
            if (purgeCloud) {
                jobs.push(deleteFloorDrawingRasterFromCloud(bldg.id, fc).catch(e => {
                    failCount++;
                    console.warn(`도면 삭제 실패 (${drawingDocId}):`, e);
                }));
                jobs.push(deleteFloorDrawingPdfFromCloud(bldg.id, fc).catch(() => {}));
                jobs.push(deleteFloorDrawingTiersFromCloud(bldg.id, fc).catch(() => {}));
            }
            return Promise.all(jobs);
        }));
        return failCount;
    }

    async function hydrateDefectPhotos(defectsMap, opts) {
        if (!window._photoCache) window._photoCache = {};
        const options = opts || {};
        const buildingId = options.buildingId || window.state.currentBuildingId || null;
        const companyPhotos = (db && window.state.companyId)
            ? db.collection('safety_app').doc(getCompanyDocId()).collection('photos')
            : null;
        // 층(키)마다 순서대로(sequential) 기다리면 층이 많은 건물에서 사진 복원이 아주 오래
        // 걸렸다(사용자가 실제로 겪음 — 상태조사표 사진 앨범이 1분 가까이 비어 있다가 뜸).
        // 층 사이엔 서로 의존 관계가 없으니 전부 한꺼번에(Promise.all) 돌린다.
        const entries = Object.entries(defectsMap || {});
        const resultEntries = await Promise.all(entries.map(async ([key, arr]) => {
            const loadThis = !!options.loadAll || (!!buildingId && key.startsWith(`${buildingId}_`));
            if (!loadThis) return [key, arr || []];
            const hydratedArr = await Promise.all((arr || []).map(async d => {
                seedPhotoCacheFromDefect(d);
                const loadIds = async (ids) => {
                    if (!ids || ids.length === 0) return [];
                    const allowCloud = options.allowCloudPhotoFetch === true;
                    // 1) 캐시·IDB 먼저 (읽기 과금 없음)
                    const localResolved = await Promise.all(ids.map(async pid => {
                        if (!pid) return { pid, url: null, needCloud: false };
                        const memUrl = window._photoCache[pid];
                        if (memUrl && !/^https?:\/\//i.test(String(memUrl))) {
                            return { pid, url: memUrl, needCloud: false };
                        }
                        // 메모리에 Storage 주소(https)만 있으면 기기 사본(오프라인 준비 등)을 먼저 본다 — 끊겨도 보이게
                        const fromIdb = await idbGet('photos', pid);
                        if (!fromIdb && memUrl) {
                            return { pid, url: memUrl, needCloud: false };
                        }
                        if (fromIdb) {
                            window._photoCache[pid] = fromIdb;
                            return { pid, url: fromIdb, needCloud: false };
                        }
                        const needCloud = !!(allowCloud && companyPhotos
                            && !_nonExistentPhotoIds.has(pid)
                            && !_cloudPhotoFetchAttempted.has(pid)
                            && !isFirestoreReadPaused());
                        return { pid, url: null, needCloud };
                    }));
                    // 2) 이 hydrate 호출에서 클라우드 get할 ID를 상한만큼만 고름 (병렬 레이스 없음)
                    let cloudBudget = allowCloud ? PHOTO_FETCH_MAX_PER_HYDRATE : 0;
                    const cloudPidSet = new Set();
                    localResolved.forEach((row) => {
                        if (!row.needCloud || cloudBudget <= 0) return;
                        cloudBudget -= 1;
                        cloudPidSet.add(row.pid);
                        _cloudPhotoFetchAttempted.add(row.pid);
                    });
                    const photos = await Promise.all(localResolved.map(async (row) => {
                        if (row.url) return row.url;
                        if (!cloudPidSet.has(row.pid) || !companyPhotos) return null;
                        try {
                            const snap = await fetchPhotosDocIfAllowed(row.pid);
                            if (!snap) return null;
                            if (!snap.exists) {
                                _nonExistentPhotoIds.add(row.pid);
                                return null;
                            }
                            const url = await photoUrlFromCloudSnap(snap, row.pid);
                            if (url) {
                                window._photoCache[row.pid] = url;
                                try { idbSetPhotoPreferDataUrl(row.pid, url); } catch (_ie) { /* ignore */ }
                            } else {
                                _nonExistentPhotoIds.add(row.pid);
                            }
                            return url;
                        } catch (e) {
                            if (isFirestoreQuotaError(e)) {
                                pauseFirestoreReads(SYNC_QUOTA_COOLDOWN_MS);
                            }
                            return null;
                        }
                    }));
                    // photoIds와 같은 길이·순서를 유지한다(빈 칸은 null). filter하면 인덱스가 밀린다.
                    return photos;
                };
                const loadedPhotos = await loadIds(d.photoIds);
                const loadedPrev = await loadIds(d.prevRoundPhotoIds);
                const curSrc = Object.assign(
                    {},
                    collectPhotoSrcById(d.photoIds, d.photos, d.photoUrls),
                    collectPhotoSrcById(d.photoIds, loadedPhotos, null)
                );
                const prevSrc = Object.assign(
                    {},
                    collectPhotoSrcById(d.prevRoundPhotoIds, d.prevRoundPhotos, d.prevRoundPhotoUrls),
                    collectPhotoSrcById(d.prevRoundPhotoIds, loadedPrev, null)
                );
                // photoIds 정렬 결과가 전부 null이면 기존 인라인 photos를 지우지 않는다
                // (업로드 직후·클라우드 미완료 시 빈 칸으로 덮어쓰는 회귀 방지).
                let photos;
                if (d.photoIds && d.photoIds.length) {
                    const aligned = alignPhotoSrcArrayToIds(d.photoIds, curSrc).map((v) => v || null);
                    if (aligned.some(Boolean)) {
                        photos = aligned.map((v, i) => v || (Array.isArray(d.photos) && d.photos[i]) || null);
                    } else if (Array.isArray(d.photos) && d.photos.some(Boolean)) {
                        photos = d.photos.slice();
                    } else {
                        photos = aligned;
                    }
                } else {
                    photos = mergePhotoArrays(loadedPhotos.filter(Boolean), extractInlinePhotos(d));
                }
                let prevRoundPhotos;
                if (d.prevRoundPhotoIds && d.prevRoundPhotoIds.length) {
                    const alignedPrev = alignPhotoSrcArrayToIds(d.prevRoundPhotoIds, prevSrc).map((v) => v || null);
                    if (alignedPrev.some(Boolean)) {
                        prevRoundPhotos = alignedPrev.map((v, i) => v || (Array.isArray(d.prevRoundPhotos) && d.prevRoundPhotos[i]) || null);
                    } else if (Array.isArray(d.prevRoundPhotos) && d.prevRoundPhotos.some(Boolean)) {
                        prevRoundPhotos = d.prevRoundPhotos.slice();
                    } else {
                        prevRoundPhotos = alignedPrev;
                    }
                } else {
                    prevRoundPhotos = mergePhotoArrays(loadedPrev.filter(Boolean), extractInlinePhotos(d, 'prev'));
                }
                return { ...d, photos, prevRoundPhotos };
            }));
            return [key, hydratedArr];
        }));
        const result = {};
        resultEntries.forEach(([key, arr]) => { result[key] = arr; });
        return result;
    }

    /** 현재 건물 결함 사진만 hydrate — 동기화 후 UI 갱신용(전체 건물 fetch 방지) */
    async function hydrateCurrentBuildingDefectPhotosIntoState() {
        const currentId = window.state.currentBuildingId;
        if (!currentId) return;
        const floorCode = window.state.currentFloor;
        const subset = {};
        Object.entries(window.state.defects || {}).forEach(([key, arr]) => {
            // 현재 층만 — 건물 전체 층 키를 매번 훑으면 동기화 스냅샷마다 불필요 작업
            if (floorCode) {
                if (key === `${currentId}_${floorCode}`) subset[key] = arr;
            } else if (key.startsWith(`${currentId}_`)) {
                subset[key] = arr;
            }
        });
        if (!Object.keys(subset).length) return;
        Object.values(subset).forEach((arr) => {
            (arr || []).forEach(seedPhotoCacheFromDefect);
        });
        // 스냅샷/동기화 후 경로: IDB·메모리만. 클라우드 per-photo get은 진입/층전환에서만.
        const loaded = await hydrateDefectPhotos(subset, {
            buildingId: currentId,
            allowCloudPhotoFetch: false
        });
        Object.assign(window.state.defects, loaded);
    }

    function sanitizeDefectsForFirestore(defectsMap) {
        const sanitizedDefects = {};
        Object.entries(defectsMap || {}).forEach(([key, arr]) => {
            sanitizedDefects[key] = (arr || []).map(d => {
                const { photos, prevRoundPhotos, photoIds, prevRoundPhotoIds, photoUrls, prevRoundPhotoUrls, ...rest } = d;
                const out = { ...rest };
                // photos가 아직 hydrate 전(빈 배열)이어도 기존 photoIds는 유지 — 다른 기기 사진 참조가 끊기지 않게
                const curIds = (photos && photos.length > 0)
                    ? photos.map((_, i) => defectPhotoIdAt(d, i))
                    : (photoIds && photoIds.length ? photoIds.slice() : null);
                const prevIds = (prevRoundPhotos && prevRoundPhotos.length > 0)
                    ? prevRoundPhotos.map((_, i) => defectPhotoIdAt(d, i, 'prev'))
                    : (prevRoundPhotoIds && prevRoundPhotoIds.length ? prevRoundPhotoIds.slice() : null);
                if (curIds && curIds.length) out.photoIds = curIds;
                if (prevIds && prevIds.length) out.prevRoundPhotoIds = prevIds;
                const packedUrls = collectPackedPhotoUrlsFrom(curIds || photoIds, photos, photoUrls);
                const packedPrev = collectPackedPhotoUrlsFrom(prevIds || prevRoundPhotoIds, prevRoundPhotos, prevRoundPhotoUrls);
                if (packedUrls && packedUrls.length) out.photoUrls = packedUrls;
                if (packedPrev && packedPrev.length) out.prevRoundPhotoUrls = packedPrev;
                // 균열 게이지/팁 비교사진 dataURL은 Firestore에 올리지 않음(로컬/IndexedDB 상태만)
                if (out.crackGaugeLog && typeof out.crackGaugeLog === 'object') {
                    const { prevPhoto, currPhoto, ...gRest } = out.crackGaugeLog;
                    out.crackGaugeLog = {
                        ...gRest,
                        hasPrevPhoto: !!(prevPhoto && String(prevPhoto).trim()),
                        hasCurrPhoto: !!(currPhoto && String(currPhoto).trim())
                    };
                }
                if (out.crackTipLog && typeof out.crackTipLog === 'object') {
                    const { prevPhoto, currPhoto, ...tRest } = out.crackTipLog;
                    out.crackTipLog = {
                        ...tRest,
                        hasPrevPhoto: !!(prevPhoto && String(prevPhoto).trim()),
                        hasCurrPhoto: !!(currPhoto && String(currPhoto).trim())
                    };
                }
                return out;
            });
        });
        return sanitizedDefects;
    }


    function scheduleSyncToFirebase(opts) {
        if (!db || !window.state.companyId) return;
        const options = opts || {};
        // 오프라인이어도 dirty 표시는 반드시 — 온라인 복귀 때 유실 없이 flush
        // (reconnect가 이미 dirty만 들고 온 경우 skipMarkCurrent로 현재 층을 억지로 더럽히지 않음)
        if (!options.skipMarkCurrent) {
            markCurrentFloorDirty();
        }
        if (!navigator.onLine) {
            markOfflinePendingFlush();
            return;
        }
        if (isFirestoreReadPaused() && _dirtyFloorKeys.size === 0) return;
        // 원격 적용/업로드 중이면 버리지 말고 끝나면 한 번 더 돌린다
        if (isRemoteSyncing || _syncInFlight) {
            _syncPending = true;
            return;
        }
        if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
        const debounceMs = window.BSA?.performance?.getSyncDebounceMs?.() ?? 3000;
        _syncDebounceTimer = setTimeout(() => {
            _syncDebounceTimer = null;
            syncStateToFirebase();
        }, debounceMs);
    }

    /** 온라인 복귀·앱 포그라운드: 실시간 리스너 재구독 (업로드는 저장 시 debounce) */
    let _reconnectSyncTimer = null;
    function reconnectFirestoreSync(reason) {
        if (!db || !window.state.companyId) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const listenersLive = typeof hasLiveFirestoreListeners === 'function' && hasLiveFirestoreListeners();
        if (!listenersLive && typeof listenToRealtimeUpdates === 'function') {
            listenToRealtimeUpdates();
        }
        if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);

        // 탭 포커스/가시성만으로는 리스너를 뜯거나 전체 업로드-병합을 돌리지 않는다.
        // onSnapshot이 이미 원격 변경을 밀어 주고, 재구독은 문서 전체를 다시 과금한다.
        // 비행기모드 해제 폴백은 `online` 이벤트에서 처리한다.
        if (reason === 'focus' || reason === 'visible') return;

        const delay = (reason === 'online') ? 700 : 120;
        if (_reconnectSyncTimer) clearTimeout(_reconnectSyncTimer);
        _reconnectSyncTimer = setTimeout(() => {
            _reconnectSyncTimer = null;
            if (!navigator.onLine) return;
            if (Date.now() < _photoFetchQuotaPausedUntil) return;
            if (reason === 'online') {
                restoreDirtyFloorKeys();
                // pending 플래그만 있고 dirty가 비면 "전 층 dirty"로 확장하지 않음(읽기 폭주 원인).
                // 실제 오프라인 편집은 persistDirtyFloorKeys로 남아 있어야 한다.
                if (hasOfflinePendingFlush() && _dirtyFloorKeys.size === 0) {
                    clearOfflinePendingFlush();
                }
                if (_dirtyFloorKeys.size > 0) {
                    // 원격 스냅샷이 로컬 pending보다 먼저 적용되지 않게 — flush 끝날 때까지 차단
                    _blockRemoteApplyUntilLocalFlush = true;
                    scheduleSyncToFirebase({ skipMarkCurrent: true });
                    return;
                }
                // dirty 없음: 전 현장/전 층 pull·업로드 하지 않음
                // 2026-10-19 오프라인에서 바꾼 회사 설정 칸만 남았으면 그것만 올린다(칸별 — 남의 설정은 안 덮음)
                try {
                    if (typeof window.bsaCompanySettingsPending === 'function' && window.bsaCompanySettingsPending().length) {
                        scheduleSyncToFirebase({ skipMarkCurrent: true });
                    }
                } catch (_e) { /* ignore */ }
                return;
            }
            if (isFirestoreReadPaused()) return;
            scheduleSyncToFirebase({ skipMarkCurrent: reason === 'listener-error' });
        }, delay);
    }
    window.reconnectFirestoreSync = reconnectFirestoreSync;

    function captureBuildingDrawingAssetsById(buildings) {
        const map = {};
        (buildings || []).forEach((b) => {
            if (!b || !b.id) return;
            map[b.id] = {
                floorDrawings: b.floorDrawings || {},
                floorDrawingPdfs: b.floorDrawingPdfs || {},
                floorDrawingTiers: b.floorDrawingTiers || {},
                floorDrawingSources: b.floorDrawingSources || {}
            };
        });
        return map;
    }

    function mergeDrawingAssetMaps(localMap, remoteMap) {
        return { ...(remoteMap || {}), ...(localMap || {}) };
    }

    function attachPreservedDrawingAssets(building, assets) {
        if (!building) return building;
        const prev = assets || {};
        return {
            ...building,
            floorDrawings: mergeDrawingAssetMaps(prev.floorDrawings, building.floorDrawings),
            floorDrawingPdfs: mergeDrawingAssetMaps(prev.floorDrawingPdfs, building.floorDrawingPdfs),
            floorDrawingTiers: mergeDrawingAssetMaps(prev.floorDrawingTiers, building.floorDrawingTiers),
            floorDrawingSources: mergeDrawingAssetMaps(prev.floorDrawingSources, building.floorDrawingSources)
        };
    }

    async function persistFloorDrawingAssetsForFloor(bldg, floorCode) {
        if (!bldg || !bldg.id || !floorCode) return;
        if (isDeletedDrawingFloor(bldg, floorCode)) return;
        const tasks = [];
        const key = `${bldg.id}_${floorCode}`;
        const raster = bldg.floorDrawings && bldg.floorDrawings[floorCode];
        if (isUsableRasterDrawingUrl(raster) && !_idbPersistedDrawingKeys.has(key)) {
            tasks.push(idbSet('floorDrawings', key, raster).then((ok) => {
                if (ok) _idbPersistedDrawingKeys.add(key);
            }));
        }
        const tiers = bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (tiers && typeof tiers === 'object') {
            Object.entries(tiers).forEach(([dim, url]) => {
                if (typeof url !== 'string' || url.length < 32) return;
                const tierKey = floorDrawingTierIdbKey(bldg.id, floorCode, dim);
                if (_idbPersistedTierKeys.has(tierKey)) return;
                tasks.push(idbSet('floorDrawingTiers', tierKey, url).then((ok) => {
                    if (ok) _idbPersistedTierKeys.add(tierKey);
                }));
            });
        }
        await Promise.all(tasks);
    }

    function clearFloorTierPersistedFlags(bldgId, floorCode) {
        if (!bldgId || !floorCode) return;
        _idbPersistedTierKeys.delete(`${bldgId}_${floorCode}`);
        _idbPendingTierKeys.delete(`${bldgId}_${floorCode}`);
        (window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000]).forEach((d) => {
            const k = floorDrawingTierIdbKey(bldgId, floorCode, d);
            _idbPersistedTierKeys.delete(k);
            _idbPendingTierKeys.delete(k);
        });
    }

    async function persistBuildingDrawingAssetsNow(bldg) {
        if (!bldg || !bldg.id) return;
        // RAM 비우기 전에 층 목록을 drawingFloorCodes/floorsList에 고정
        syncBuildingDrawingFloorCodes(bldg);
        const tasks = [];
        const persistEntries = (storeName, map, persistedSet, pendingSet) => {
            Object.entries(map || {}).forEach(([floorCode, val]) => {
                if (!val) return;
                if (isDeletedDrawingFloor(bldg, floorCode)) return;
                const key = `${bldg.id}_${floorCode}`;
                if (isSessionDeletedDrawingKey(key) || persistedSet.has(key)) return;
                pendingSet.add(key);
                tasks.push(idbSet(storeName, key, val).then((ok) => {
                    pendingSet.delete(key);
                    if (isDeletedDrawingFloor(bldg, floorCode) || isSessionDeletedDrawingKey(key)) {
                        idbDelete(storeName, key);
                        return;
                    }
                    if (ok) persistedSet.add(key);
                }));
            });
        };
        persistEntries('floorDrawings', bldg.floorDrawings, _idbPersistedDrawingKeys, _idbPendingDrawingKeys);
        persistEntries('floorDrawingPdfs', bldg.floorDrawingPdfs, _idbPersistedPdfKeys, _idbPendingPdfKeys);
        persistEntries('floorDrawingSources', bldg.floorDrawingSources, _idbPersistedSourceKeys, _idbPendingSourceKeys);
        Object.entries(bldg.floorDrawingTiers || {}).forEach(([floorCode, tiersObj]) => {
            if (!tiersObj || typeof tiersObj !== 'object') return;
            if (isDeletedDrawingFloor(bldg, floorCode)) return;
            Object.entries(tiersObj).forEach(([dim, url]) => {
                if (typeof url !== 'string' || url.length < 32) return;
                const key = floorDrawingTierIdbKey(bldg.id, floorCode, dim);
                if (_idbPersistedTierKeys.has(key) || _idbPendingTierKeys.has(key)) return;
                _idbPendingTierKeys.add(key);
                tasks.push(idbSet('floorDrawingTiers', key, url).then((ok) => {
                    _idbPendingTierKeys.delete(key);
                    if (isDeletedDrawingFloor(bldg, floorCode)) {
                        idbDelete('floorDrawingTiers', key);
                        return;
                    }
                    if (ok) _idbPersistedTierKeys.add(key);
                }));
            });
        });
        await Promise.all(tasks);
        const keepFloor = (window.state.currentBuildingId === bldg.id) ? window.state.currentFloor : null;
        releaseHeavyDrawingMemory(bldg, { keepFloor, keepDim: 4000 });
    }

    // ---- 2026-10-19 회사 공통 설정 칸별 병합(js/core/company-settings-merge.js) ----
    // 예전: 설정 맵을 통째로 쓰고(나중에 쓴 기기가 이김) 받을 때도 통째로 바꿈 → 오프라인 기기가 다시 연결되면 남의 새 설정을 옛 값으로 덮었다.
    // 지금: 바뀐 칸만 시각과 함께 적어 두고(기기 저장), 그 칸만 경로 지정으로 쓰고, 받을 때는 안 올린 칸만 내 값을 남긴다.
    let _companySettingsStore = null;
    let _companySettingsStoreKey = '';
    function companySettingsApi() {
        return (window.BSA && window.BSA.companySettingsMerge) || null;
    }
    function companySettingsStore() {
        const api = companySettingsApi();
        const cid = (window.state && window.state.companyId) || '';
        if (!api || !cid) return null;
        const key = `bsa_settings_sync_v1_${cid}`;
        if (_companySettingsStore && _companySettingsStoreKey === key) return _companySettingsStore;
        let s = null;
        try { s = api.normalizeStore(JSON.parse(localStorage.getItem(key) || 'null')); } catch (_e) { s = null; }
        // 처음: 지금 기기 값을 기준으로(바뀐 칸 없음) — 서버를 받으면 서버 값을 따른다
        if (!s) s = api.initStore(api.flatten(window.state));
        _companySettingsStore = s;
        _companySettingsStoreKey = key;
        saveCompanySettingsStore();
        return s;
    }
    function saveCompanySettingsStore() {
        if (!_companySettingsStore || !_companySettingsStoreKey) return;
        try { localStorage.setItem(_companySettingsStoreKey, JSON.stringify(_companySettingsStore)); } catch (_e) { /* 용량 부족 무시 */ }
    }
    function trackCompanySettingsLocal() {
        const api = companySettingsApi();
        const s = companySettingsStore();
        if (!api || !s) return false;
        const changed = api.trackLocal(s, api.flatten(window.state), bsaSyncNow());
        if (changed) saveCompanySettingsStore();
        return changed;
    }
    window.bsaCompanySettingsPending = () => {
        const s = companySettingsStore();
        return s ? Object.keys(s.dirty) : [];
    };
    /** 쓰기: 이 기기에서 바뀐 칸만. serverData = 쓰기 직전에 서버에서 읽은 루트 문서(칸 시각 비교용) */
    async function writeCompanySettingsPerKey(docRef, serverData) {
        const api = companySettingsApi();
        const store = companySettingsStore();
        if (!api || !store || !docRef) return { writes: 0, adopted: 0 };
        trackCompanySettingsLocal();
        const plan = api.planWrite(store, api.flatten(window.state), serverData || {});
        // 2026-11-09 층별 설정(행·열 등)을 한 번에 여러 층 지우는 쓰기는 사고로 보고 올리지 않는다 — 서버 값으로 기기를 되돌림
        // (11-06 53개 건물 행·열 일괄 소실). js/core/company-settings-merge.js holdMassDeletes
        if (typeof api.holdMassDeletes === 'function') {
            const guard = api.holdMassDeletes(plan, serverData || {});
            if (guard.held.length) {
                plan.writes = guard.writes;
                guard.held.forEach((h) => api.setPath(window.state, h.key, h.sub, h.value));
                api.afterHold(store, guard.held);
                saveCompanySettingsStore();
                const paths = guard.held.map((h) => h.path);
                console.error('[설정 병합] 층별 설정 대량 삭제를 막고 서버 값으로 되돌림:', paths);
                try {
                    if (window.BSA && window.BSA.errorLog && typeof window.BSA.errorLog.record === 'function') {
                        window.BSA.errorLog.record({
                            message: `[설정 병합] 층별 설정 대량 삭제 차단 ${paths.length}칸`,
                            stack: paths.slice(0, 40).join('\n'),
                            source: 'company-settings-mass-delete'
                        });
                    }
                } catch (_e) { /* 기록 실패는 무시 */ }
                if (typeof window.showToast === 'function') {
                    window.showToast(`이 기기에서 행·열 등 층 설정 ${paths.length}칸이 한꺼번에 비어 서버에 올리지 않고 서버 값으로 되돌렸습니다.`, 'warning', 9000);
                }
                _suppressSyncOnSave = true;
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                _suppressSyncOnSave = false;
            }
        }
        if (plan.adopt.length) {
            // 다른 기기가 같은 칸을 더 나중에 바꿨다 — 내 값은 버리고 서버 값을 따른다
            plan.adopt.forEach((a) => api.setPath(window.state, a.key, a.sub, a.value));
            api.afterAdopt(store, plan.adopt);
            saveCompanySettingsStore();
            console.info('[설정 병합] 다른 기기가 더 나중에 바꾼 칸은 서버 값을 따름:', plan.adopt.map((a) => a.path));
            _suppressSyncOnSave = true;
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            _suppressSyncOnSave = false;
        }
        if (!plan.writes.length) return { writes: 0, adopted: plan.adopt.length };
        const FP = firebase.firestore.FieldPath;
        // 2026-11-04 건물마다 문서로 나눈 회사: 「건물id_층」 칸은 그 건물 문서로, 나머지는 루트로
        let rootWrites = plan.writes;
        const bdApi = buildingDocsApi();
        if (bdApi && rootSplitActive()) {
            const ids = (window.state.buildings || []).map((b) => b && b.id).filter(Boolean).concat(Object.keys(_bldgDocs));
            const routed = bdApi.routeSettingsWrites(plan.writes, ids);
            rootWrites = routed.root;
            for (const id of Object.keys(routed.byBuilding)) {
                const patch = bdApi.settingsDocPatch(routed.byBuilding[id], () => firebase.firestore.FieldValue.delete());
                await buildingMetaCol(docRef).doc(id).set(patch, { merge: true });
            }
        }
        if (rootWrites.length) {
        const args = api.buildUpdateArgs(
            rootWrites,
            (a, b) => (b === undefined ? new FP(a) : new FP(a, b)),
            () => firebase.firestore.FieldValue.delete()
        );
        await docRef.update(...args);
        }
        api.afterWrite(store, plan.writes);
        saveCompanySettingsStore();
        return { writes: plan.writes.length, adopted: plan.adopt.length };
    }

    async function applyMergedRemoteData(data) {
        if (!data) return false;
        if (typeof flushOverviewCaptionsFromDom === 'function') flushOverviewCaptionsFromDom();
        ensureSyncMetaState();
        let isChanged = false;

        const mergedDeletedBuildings = mergeDeletedBuildingIds(
            data.deletedBuildingIds,
            window.state.deletedBuildingIds
        );
        window.state.deletedBuildingIds = mergedDeletedBuildings;
        mergedDeletedBuildings.forEach(purgeLocalStateForDeletedBuilding);

        if (data.buildings && Array.isArray(data.buildings)) {
            if (typeof persistCurrentBuildingLocationMapLegend === 'function') {
                persistCurrentBuildingLocationMapLegend();
            }
            const prevAssets = captureBuildingDrawingAssetsById(window.state.buildings);
            window.state.buildings = mergeBuildingsForSync(
                data.buildings,
                window.state.buildings,
                mergedDeletedBuildings,
                prevAssets
            );
            isChanged = true;
            await hydrateLocalImagesFromIndexedDb();
            if (typeof hydrateAllBuildingPdfsFromCloud === 'function') {
                hydrateAllBuildingPdfsFromCloud().catch((e) => console.warn('동기화 후 PDF 조회 실패:', e));
            }
        }

        if (data.defects) {
            const defectMerge = mergeDefectsMaps(
                filterMapKeysByDeletedBuildings(data.defects, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.defects, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedDefectIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedDefectIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedDefectAt || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedDefectAt || {}, mergedDeletedBuildings)
            );
            window.state.defects = defectMerge.defects;
            window.state.deletedDefectIds = defectMerge.deletedDefectIds;
            window.state.deletedDefectAt = defectMerge.deletedDefectAt || {};
            await hydrateCurrentBuildingDefectPhotosIntoState();
            isChanged = true;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'ndtData')
            || Object.prototype.hasOwnProperty.call(data, 'deletedNdtIds')
            || Object.prototype.hasOwnProperty.call(data, 'deletedNdtAt')) {
            const ndtMerge = mergeNdtDataMaps(
                filterMapKeysByDeletedBuildings(data.ndtData || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.ndtData || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedNdtIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedNdtIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedNdtAt || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedNdtAt || {}, mergedDeletedBuildings)
            );
            window.state.ndtData = carryLocalCrackMonitorPhotos(window.state.ndtData || {}, ndtMerge.ndtData);
            window.state.deletedNdtIds = ndtMerge.deletedNdtIds;
            window.state.deletedNdtAt = ndtMerge.deletedNdtAt || {};
            isChanged = true;
        }

        // 구버전 자동확정 맵은 사용하지 않음 (수동 정리만)
        if (window.state.confirmedDeletedIds && Object.keys(window.state.confirmedDeletedIds).length) {
            window.state.confirmedDeletedIds = {};
            isChanged = true;
        }

        if (Object.prototype.hasOwnProperty.call(data, 'ndtDisplacementGroups')
            || Object.prototype.hasOwnProperty.call(data, 'deletedNdtIds')
            || Object.prototype.hasOwnProperty.call(data, 'deletedNdtAt')) {
            const dispMerge = mergeNdtDataMaps(
                filterMapKeysByDeletedBuildings(data.ndtDisplacementGroups || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.ndtDisplacementGroups || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedNdtIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedNdtIds || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(data.deletedNdtAt || {}, mergedDeletedBuildings),
                filterMapKeysByDeletedBuildings(window.state.deletedNdtAt || {}, mergedDeletedBuildings)
            );
            window.state.ndtDisplacementGroups = dispMerge.ndtData;
            isChanged = true;
        }
        const csApi = companySettingsApi();
        const csStore = csApi ? companySettingsStore() : null;
        if (csApi && csStore) {
            // 2026-10-19 칸별: 아직 안 올린 이 기기 칸만 남기고 나머지는 서버 값
            const inc = csApi.applyIncoming(csStore, window.state, data, bsaSyncNow());
            Object.keys(inc.values).forEach((k) => {
                if (inc.values[k] === undefined) delete window.state[k];
                else window.state[k] = inc.values[k];
            });
            if (Object.prototype.hasOwnProperty.call(inc.values, 'defectLeaderLineScale') && inc.values.defectLeaderLineScale !== undefined) {
                window.state._globalDefectLeaderLineScaleFallback = inc.values.defectLeaderLineScale;
            }
            if (Object.prototype.hasOwnProperty.call(inc.values, 'styleSizeBarLockedMap')) window.state.styleSizeBarLockedMap = !!window.state.styleSizeBarLockedMap;
            if (Object.prototype.hasOwnProperty.call(inc.values, 'styleSizeBarLockedNdt')) window.state.styleSizeBarLockedNdt = !!window.state.styleSizeBarLockedNdt;
            saveCompanySettingsStore();
            if (Object.keys(inc.values).length) isChanged = true;
        } else {
        // (예전 방식 — 모듈을 못 불렀을 때만) 서버 값으로 통째로
        if (data.grids) {
            window.state.grids = data.grids;
            isChanged = true;
        }
        if (data.styleColors) {
            window.state.styleColors = data.styleColors;
            isChanged = true;
        }
        // styleColors와 반드시 함께 받아야 한다. 이 값이 빠지면 다른 기기에서 받은 순간
        // 팔레트 버전이 0으로 보여 migrateStyleColorsToPureDefaults()가 재발동하고,
        // 사용자가 지정한 색이 통째로 지워진 뒤 그 빈 값이 다시 올라가 모든 기기의 색을 날린다.
        if (data.styleColorsPaletteVersion != null) {
            window.state.styleColorsPaletteVersion = data.styleColorsPaletteVersion;
            isChanged = true;
        }
        if (data.styleSizes) {
            window.state.styleSizes = data.styleSizes;
            isChanged = true;
        }
        if (data.defectLeaderLineScale !== undefined) {
            window.state.defectLeaderLineScale = data.defectLeaderLineScale;
            window.state._globalDefectLeaderLineScaleFallback = data.defectLeaderLineScale;
            isChanged = true;
        }
        if (data.ndtLeaderLineScale !== undefined) {
            window.state.ndtLeaderLineScale = data.ndtLeaderLineScale;
            isChanged = true;
        }
        if (data.styleSizeBarLockedMap !== undefined) {
            window.state.styleSizeBarLockedMap = !!data.styleSizeBarLockedMap;
            isChanged = true;
        }
        if (data.styleSizeBarLockedNdt !== undefined) {
            window.state.styleSizeBarLockedNdt = !!data.styleSizeBarLockedNdt;
            isChanged = true;
        }
        if (data.floorMapStyleSettings) {
            window.state.floorMapStyleSettings = data.floorMapStyleSettings;
            isChanged = true;
        }
        if (data.floorDrawingRotations) {
            window.state.floorDrawingRotations = data.floorDrawingRotations;
            isChanged = true;
        }
        if (data.floorGridLines) {
            window.state.floorGridLines = data.floorGridLines;
            isChanged = true;
        }
        if (data.floorPrintCrops) {
            window.state.floorPrintCrops = data.floorPrintCrops;
            isChanged = true;
        }
        if (data.floorDrawingDarken) {
            window.state.floorDrawingDarken = data.floorDrawingDarken;
            isChanged = true;
        }
        if (data.styleShapes) {
            window.state.styleShapes = data.styleShapes;
            isChanged = true;
        }
        if (data.locationMapLegend) {
            window.state.locationMapLegend = data.locationMapLegend;
            isChanged = true;
        }
        if (data.locationMapLegendBox) {
            window.state.locationMapLegendBox = data.locationMapLegendBox;
            isChanged = true;
        }
        }
        // 회사 문서의 공용 범례 박스가 건물별 배치를 덮지 않게, 현재 건물 값을 다시 적용
        if (typeof refreshCurrentBuildingFromState === 'function') refreshCurrentBuildingFromState();
        if (typeof applyBuildingLocationMapLegend === 'function' && window.state.currentBuilding) {
            applyBuildingLocationMapLegend(window.state.currentBuilding);
        }
        // companyDefectPresets는 더 이상 회사 공용이 아님 — 계정당 users/{uid}.defectPinPresets 사용

        return isChanged;
    }


    // --- 회사 문서 동기화 잠금(lease): 다른 기기가 올리는 동안만 짧게 기다림 ---
    // 같은 계정/같은 기기 잠금은 즉시 회수 (크래시·해제 실패·연속 동기화 시 "계속 대기" 방지)
    const SYNC_LEASE_STALE_MS = 60000;  // heartbeat 2회 정도 없으면 만료
    const SYNC_LEASE_WAIT_MS = 45000;   // 타인 업로드 최대 대기 (초과 시 강제 점유)
    const SYNC_LEASE_POLL_MS = 600;
    const SYNC_LEASE_HEARTBEAT_MS = 20000;
    /** 남은 층이 전부 다른 기기가 올리는 중일 때 다시 볼 간격 (2026-11-05 층별 잠금) */
    const SYNC_FLOOR_BUSY_RETRY_MS = 8000;
    let _floorBusyRetryTimer = null;
    let _syncLeaseWaitToastAt = 0;

    function sleepMs(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * 핀/영역/NDT 드래그·핀치 중이면 끝날 때까지 대기.
     * 업로드 동기화가 state.defects/ndtData를 통째로 교체하고 도면을 다시 그리면
     * 잡고 있던 핀 객체가 옛 객체가 되어 드래그가 풀리므로, 제스처가 끝난 뒤 진행한다.
     */
    /**
     * 2026-11-06 업로드·받기 작업 사이사이에 부른다: 도면을 끄는 동안엔 다음 사진·층을 시작하지 않는다.
     * 업로드는 대부분 인터넷을 기다리는 시간인데, 사진 변환·층 합치기·저장은 화면과 같은 스레드에서 돌아 드래그가 끊겼다.
     * 드래그가 아주 길어도 멈추지 않게 최대 15초만 기다린다.
     */
    function yieldToUiGesture() {
        return (typeof isRealtimeUiGestureBusy === 'function' && isRealtimeUiGestureBusy()) ? waitForUiGestureIdle(15000) : Promise.resolve();
    }

    async function waitForUiGestureIdle(maxMs = 60000) {
        if (typeof isRealtimeUiGestureBusy !== 'function') return;
        const deadline = Date.now() + maxMs;
        while (isRealtimeUiGestureBusy() && Date.now() < deadline) {
            await sleepMs(120);
        }
    }

    function getSyncLeaseDeviceId() {
        try {
            let id = localStorage.getItem('bsa_sync_device_id');
            if (!id) {
                id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
                localStorage.setItem('bsa_sync_device_id', id);
            }
            return id;
        } catch (_e) {
            return `d_${Date.now().toString(36)}`;
        }
    }

    function getSyncLeaseOwnerId() {
        return window.state.uid || (`anon_${getSyncLeaseDeviceId()}`);
    }

    /**
     * heartbeat가 회사 루트·층 묶음 문서를 고치면 구독 중인 모든 기기가 큰 문서를 다시 과금한다.
     * 잠금은 작은 syncLeases/{id}에만 쓴다. id는 회사 전체면 company, 층이면 상대 경로.
     */
    function getSyncLeaseDocRef(scopeRef) {
        if (!db || !window.state.companyId) return null;
        const companyRef = db.collection('safety_app').doc(getCompanyDocId());
        if (!scopeRef || scopeRef.path === companyRef.path) {
            return companyRef.collection('syncLeases').doc('company');
        }
        const prefix = companyRef.path + '/';
        let rel = String(scopeRef.path || '');
        if (rel.indexOf(prefix) === 0) rel = rel.slice(prefix.length);
        const id = String(rel || 'company').replace(/\//g, '__').slice(0, 700) || 'company';
        return companyRef.collection('syncLeases').doc(id);
    }

    function isSyncLeaseFresh(lease, now) {
        if (!lease || !lease.token) return false;
        const beat = Number(lease.heartbeatAt || lease.startedAt) || 0;
        if (!beat) return false;
        const age = now - beat;
        // 시계가 많이 틀어진 기기가 미래 시각으로 heartbeat를 써두면 이 잠금은 영원히
        // "살아있음"이 돼서 모두의 동기화를 막는다. 현장 태블릿은 시계가 틀어지는 일이
        // 실제로 있으므로, 말이 안 되게 미래면 만료된 것으로 본다.
        if (age < -SYNC_LEASE_STALE_MS) return false;
        return age < SYNC_LEASE_STALE_MS;
    }

    /** 다른 기기가 실제로 동기화 중이라 이번 회차를 양보한 경우 (오류가 아니다) */
    function isSyncLeaseBusyError(err) {
        return !!(err && err.syncLeaseBusy);
    }

    /** 진짜 다른 기기의 유효 잠금만 대기로 본다. 내 계정/기기·만료 잠금은 즉시 회수. */
    function isForeignSyncLease(lease, myToken, myOwnerId, myDeviceId, now) {
        if (!isSyncLeaseFresh(lease, now)) return false;
        if (String(lease.token) === String(myToken)) return false;
        if (myDeviceId && lease.deviceId && String(lease.deviceId) === String(myDeviceId)) return false;
        if (myOwnerId && lease.ownerId && String(lease.ownerId) === String(myOwnerId)) return false;
        return true;
    }

    async function acquireCompanySyncLease(docRef) {
        if (!docRef) return null;
        const ownerId = getSyncLeaseOwnerId();
        const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const deviceId = getSyncLeaseDeviceId();
        const waitDeadline = Date.now() + SYNC_LEASE_WAIT_MS;
        let warned = false;

        while (true) {
            let acquired = false;
            let sawForeign = false;
            let holderName = '';
            try {
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(docRef);
                    const data = snap.exists ? (snap.data() || {}) : {};
                    const lease = data.syncLease || null;
                    const now = Date.now();
                    if (isForeignSyncLease(lease, token, ownerId, deviceId, now)) {
                        sawForeign = true;
                        holderName = (lease && (lease.ownerName || lease.ownerId)) || '다른 작업자';
                        return;
                    }
                    tx.set(docRef, {
                        syncLease: {
                            ownerId,
                            ownerName: window.state.userName || '',
                            deviceId,
                            token,
                            startedAt: now,
                            heartbeatAt: now
                        }
                    }, { merge: true });
                    acquired = true;
                });
            } catch (e) {
                // 2026-09-04: 429(resource-exhausted, 할당량/속도 초과)까지 "일시적 네트워크 문제"로
                // 보고 0.4초마다 최대 45초(SYNC_LEASE_WAIT_MS)씩 계속 재시도하고 있었다 — 재시도할수록
                // 같은 문서를 더 두드려서 오히려 제한이 안 풀리는 악순환이었다. 429는 여기서 계속
                // 돌지 않고 바로 던져서, 호출부(syncStateToFirebase)의 지수 백오프가 처리하게 한다.
                if (e && e.code === 'resource-exhausted') throw e;
                // 2026-09-17: 보안 규칙에 막힌 경우(대개 규칙 미게시)도 여기서 계속 돌고 있었다 —
                // 0.4초마다 45초(SYNC_LEASE_WAIT_MS)면 한 번 동기화할 때마다 실패 트랜잭션
                // 100여 회. 규칙을 고치기 전엔 절대 성공하지 않는 오류라 재시도가 무의미하고,
                // 콘솔 로그와 읽기 쿼터만 태운다. 바로 던져서 호출부가 길게 쉬게 한다.
                if (isFirestorePermissionError(e)) throw e;
                // 그 외 네트워크/경합 실패는 "다른 작업자 대기"가 아님 — 조용히 재시도
                console.warn('동기화 잠금 획득 실패, 재시도:', e);
            }
            if (acquired) return { ownerId, token, deviceId };

            if (Date.now() >= waitDeadline) {
                // 예전에는 여기서 잠금을 **다시 읽지도 않고** 덮어썼다. 그런데 죽은 기기의
                // 잠금은 heartbeat가 끊겨 SYNC_LEASE_STALE_MS(60초)면 저절로 만료되므로,
                // 45초를 버틴 보유자는 대개 '살아서 실제로 업로드 중'이다. 하필 그때
                // 뺏으면 두 기기가 동시에 쓰게 된다 — 2026-09-19에 층끼리 결함이 섞인
                // 사고와 같은 종류의 경합이다.
                //
                // 그래서 마지막으로 한 번 더 확인한다. 그 사이 풀렸거나 만료됐으면
                // 정상적으로 가져가고, 아직 살아 있으면 이번 회차는 양보한다.
                let taken = false;
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(docRef);
                    const data = snap.exists ? (snap.data() || {}) : {};
                    const lease = data.syncLease || null;
                    const now = Date.now();
                    if (isForeignSyncLease(lease, token, ownerId, deviceId, now)) {
                        holderName = (lease && (lease.ownerName || lease.ownerId)) || '다른 작업자';
                        return;
                    }
                    tx.set(docRef, {
                        syncLease: {
                            ownerId,
                            ownerName: window.state.userName || '',
                            deviceId,
                            token,
                            startedAt: now,
                            heartbeatAt: now
                        }
                    }, { merge: true });
                    taken = true;
                });
                if (taken) return { ownerId, token, deviceId };

                console.info('동기화 잠금 양보 — 다른 기기가 계속 올리는 중:', holderName);
                const busy = new Error('다른 기기(' + (holderName || '다른 작업자') + ')가 동기화 중입니다.');
                busy.syncLeaseBusy = true;
                throw busy;
            }

            // 토스트는 실제로 타인 잠금을 본 경우에만, 자주 울리지 않게 (드래그 중엔 띄우지 않음)
            const gestureBusy = typeof isRealtimeUiGestureBusy === 'function' && isRealtimeUiGestureBusy();
            if (sawForeign && !gestureBusy && (!warned || (Date.now() - _syncLeaseWaitToastAt) > 20000)) {
                warned = true;
                _syncLeaseWaitToastAt = Date.now();
                if (typeof window.showToast === 'function') {
                    window.showToast(
                        `${holderName || '다른 작업자'}가 올리는 중입니다. 잠시만 기다려 주세요.`,
                        'info',
                        3500
                    );
                }
            }
            await sleepMs(sawForeign ? SYNC_LEASE_POLL_MS : 400);
        }
    }

    async function heartbeatCompanySyncLease(docRef, leaseInfo) {
        if (!docRef || !leaseInfo || !leaseInfo.token) return;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(docRef);
                const lease = snap.exists ? ((snap.data() || {}).syncLease || null) : null;
                if (!lease || String(lease.token) !== String(leaseInfo.token)) return;
                tx.set(docRef, {
                    syncLease: Object.assign({}, lease, { heartbeatAt: Date.now() })
                }, { merge: true });
            });
        } catch (e) {
            console.warn('동기화 잠금 heartbeat 실패:', e);
        }
    }

    async function releaseCompanySyncLease(docRef, leaseInfo) {
        if (!docRef || !leaseInfo || !leaseInfo.token) return;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(docRef);
                const lease = snap.exists ? ((snap.data() || {}).syncLease || null) : null;
                if (!lease || String(lease.token) !== String(leaseInfo.token)) return;
                tx.set(docRef, {
                    syncLease: firebase.firestore.FieldValue.delete()
                }, { merge: true });
            });
        } catch (e) {
            console.warn('동기화 잠금 해제 실패:', e);
            try {
                await docRef.set({ syncLease: firebase.firestore.FieldValue.delete() }, { merge: true });
            } catch (_e2) { /* ignore */ }
        }
    }

    /**
     * 2026-11-05 층별 잠금 — 기다리지 않고 한 번만 잡아 본다.
     * 다른 기기가 그 층(현장·회차·동·층)을 올리는 중이면 null → 이번엔 그 층만 건너뛰고 다른 층을 올린다.
     * (예전엔 홈 화면 기기들이 회사 잠금 하나를 같이 써서 회사 전체가 한 기기씩 줄을 섰다)
     */
    async function tryAcquireSyncLease(docRef) {
        if (!docRef) return null;
        const ownerId = getSyncLeaseOwnerId();
        const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const deviceId = getSyncLeaseDeviceId();
        let acquired = false;
        try {
            await db.runTransaction(async (tx) => {
                const snap = await tx.get(docRef);
                const data = snap.exists ? (snap.data() || {}) : {};
                const lease = data.syncLease || null;
                if (isForeignSyncLease(lease, token, ownerId, deviceId, Date.now())) return;
                const now = Date.now();
                tx.set(docRef, {
                    syncLease: { ownerId, ownerName: window.state.userName || '', deviceId, token, startedAt: now, heartbeatAt: now }
                }, { merge: true });
                acquired = true;
            });
        } catch (e) {
            if (e && e.code === 'resource-exhausted') throw e;
            if (isFirestorePermissionError(e)) throw e;
            console.warn('층 잠금 확인 실패 — 이번엔 이 층을 건너뜀:', docRef.path, e && e.message);
            return null;
        }
        return acquired ? { ownerId, token, deviceId } : null;
    }

    async function fetchCompanyDocSnap(docRef) {
        // 온라인일 때는 캐시가 아닌 서버 문서를 읽어, 다른 기기 작업을 덮어쓰지 않게 한다
        if (typeof navigator === 'undefined' || navigator.onLine !== false) {
            try {
                return await docRef.get({ source: 'server' });
            } catch (e) {
                if (isFirestoreQuotaError(e)) {
                    pauseFirestoreReads(SYNC_QUOTA_COOLDOWN_MS);
                    throw e;
                }
                console.warn('서버 문서 조회 실패, 캐시/기본 조회로 재시도:', e);
            }
        }
        return await docRef.get();
    }

    /**
     * 동기화 쓰기 전용(2026-10-16 사고 방지): 반드시 서버에서 읽는다. 서버를 못 읽으면 기기 캐시로 넘어가지 않고 실패한다
     * — 빈·옛 캐시를 서버 자료로 알고 합친 뒤 회사 문서를 통째로 덮어쓰는 일을 막는다(그때는 이번에 쓰지 않고 다음에 다시).
     */
    async function fetchCompanyDocSnapForWrite(docRef) {
        try {
            return await docRef.get({ source: 'server' });
        } catch (e) {
            if (isFirestoreQuotaError(e)) pauseFirestoreReads(SYNC_QUOTA_COOLDOWN_MS);
            throw new Error('SERVER_READ_FOR_WRITE: 서버 문서를 읽지 못해 이번에는 쓰지 않습니다(다음에 다시) — ' + (e && e.message ? e.message : e));
        }
    }
    /** 동기화 쓰기에 쓸 서버 기준 루트 문서: 리스너가 서버에서 받은 것이 있으면 그것, 없으면 서버에서 직접 */
    async function serverRootDataForWrite(docRef) {
        // 2026-11-04 건물마다 문서로 나눈 회사: 건물 문서를 서버에서 아직 못 받았으면 캐시 말고 서버에서
        const splitNotReady = _lastRootRaw && _lastRootRaw.rootSplit && !_bldgDocsFromServer;
        if (!splitNotReady && _lastRootSnapshotFromServer && _lastRootSnapshotData && Object.keys(_lastRootSnapshotData).length) {
            return Object.assign({}, _lastRootSnapshotData);
        }
        const snap = await fetchCompanyDocSnapForWrite(docRef);
        return snap.exists ? await expandRootDocData(docRef, snap.data(), { strict: true }) : {};
    }

    // ---- 2026-11-04 회사 루트 문서 1MB 초과 대책: 건물마다 문서(buildingMeta/{id}) — js/core/building-docs.js ----
    // 루트가 커지면(또는 1MB 초과 오류가 나면) 건물 정보와 그 건물의 층 설정을 건물 문서로 옮기고 루트엔 rootSplit 표시·공통 칸만.
    // 읽는 곳(리스너·처음 받기·쓰기 전 확인)은 모두 「펼친 보기」(예전 루트 모양)를 받아 기존 병합 코드를 그대로 쓴다.
    // var: 초기화 순서와 무관하게(먼저 불려도 TDZ 오류 없게)
    var _bldgDocs = {};                 // 건물 id → 서버 문서(조각이면 _b 붙임)
    var _bldgDocsFromServer = false;
    var _bldgMetaUnsub = null;
    var _lastRootRaw = {};
    var _rootForceSplit = false;
    var _rootSnapSeq = 0;
    var _bldgChunkCache = {};
    function buildingDocsApi() { return (window.BSA && window.BSA.buildingDocs) || null; }
    function rootDocShardsApi() { return (window.BSA && window.BSA.rootDocShards) || null; }
    function rootSplitActive() { return !!(_lastRootRaw && _lastRootRaw.rootSplit) || Object.keys(_bldgDocs).length > 0; }
    function buildingMetaCol(docRef) { const api = buildingDocsApi(); return docRef.collection((api && api.COLLECTION) || 'buildingMeta'); }
    function buildingDocsCtx() {
        return {
            docs: _bldgDocs, chunkCache: _bldgChunkCache,
            del: () => firebase.firestore.FieldValue.delete(),
            fieldPath: (x, y) => (y === undefined ? new firebase.firestore.FieldPath(x) : new firebase.firestore.FieldPath(x, y))
        };
    }
    async function resolveBuildingDoc(col, id, d) {
        const api = buildingDocsApi();
        return api ? api.resolveDoc(col, id, d, buildingDocsCtx()) : d;
    }
    async function fetchAllBuildingDocs(docRef, getOpts) {
        const r = await buildingDocsApi().loadAll(docRef, getOpts, buildingDocsCtx());
        _bldgDocs = r.docs;
        _bldgDocsFromServer = r.fromServer;
    }
    /**
     * 루트 데이터 → 펼친 보기(건물 문서·조각 칸 붙임). opts.strict: 못 읽으면 예외(쓰기 전 — 모르고 덮어쓰지 않게)
     */
    async function expandRootDocData(docRef, raw, opts) {
        const o = opts || {};
        let data = raw || {};
        const api = buildingDocsApi();
        try {
            const S = rootDocShardsApi();
            if (S && data.rootShards) data = await S.expandRootData(docRef, data, o.strict ? {
                strict: true, getOpts: { source: 'server' },
                onDangling: (man, hadPrev, rec) => {
                    const el = window.BSA && window.BSA.errorLog;
                    const recNote = rec ? ', 남은 조각 ' + rec.sets + '묶음에서 삭제 기록 ' + rec.deletedBuildingIds.length + '건 되찾음' : ', 남은 조각 목록 못 읽음';
                    if (el && typeof el.record === 'function') el.record({ kind: 'root-shards-dangling', message: '목차 ' + (man && man.writeId) + ' 조각 없음 — ' + (hadPrev ? '이전 목차로' : '루트 칸만으로') + ' 이어 감' + recNote, source: 'expandRootDocData' });
                }
            } : {});
            if (!api) return data;
            if (data.rootSplit && (!Object.keys(_bldgDocs).length || (o.strict && !_bldgDocsFromServer))) {
                await fetchAllBuildingDocs(docRef, o.strict ? { source: 'server' } : undefined);
            }
            if (!data.rootSplit && !Object.keys(_bldgDocs).length) return data;
            return api.expandView(data, _bldgDocs);
        } catch (e) {
            if (o.strict) throw e;
            console.warn('[건물 문서] 펼치기 실패 — 루트 칸만 씀', e);
            return data;
        }
    }
    /** 건물 문서 리스너(나눈 회사만 문서가 있다 — 없으면 빈 목록) */
    function listenBuildingMetaDocs(docId) {
        if (!buildingDocsApi()) return;
        const rootRef = db.collection('safety_app').doc(docId);
        const col = buildingMetaCol(rootRef);
        _bldgMetaUnsub = col.onSnapshot(async (qs) => {
            const changes = qs.docChanges ? qs.docChanges() : [];
            for (const ch of changes) {
                if (ch.type === 'removed') { delete _bldgDocs[ch.doc.id]; continue; }
                try {
                    const d = await resolveBuildingDoc(col, ch.doc.id, ch.doc.data() || {});
                    if (d) _bldgDocs[ch.doc.id] = d;
                } catch (e) { console.warn('[건물 문서] 조각 읽기 실패', ch.doc.id, e); }
            }
            _bldgDocsFromServer = !(qs.metadata && qs.metadata.fromCache);
            if (qs.metadata && qs.metadata.hasPendingWrites) return;   // 내가 방금 쓴 것 — 이미 기기에 있음
            if (!changes.length) return;
            const seq = ++_rootSnapSeq;
            const next = await expandRootDocData(rootRef, _lastRootRaw);
            if (seq !== _rootSnapSeq) return;
            _lastRootSnapshotData = next;
            await applyCombinedSnapshot();
        }, (err) => console.warn('[건물 문서] 리스너 경고', err));
    }
    /** 나눠 쓰기(js/core/building-docs.js writeSplit) — 건물 문서 먼저, 루트는 부르는 쪽이 마지막에 */
    async function writeBuildingDocsForSync(docRef, dataToSync, deletedIds, serverRaw) {
        return buildingDocsApi().writeSplit(docRef, dataToSync, deletedIds, serverRaw, buildingDocsCtx());
    }

    // --- 옛 버전 앱의 동기화 차단 (2026-09-21) ---
    // 지운 층이 되살아나고 옛 데이터가 새 데이터를 덮은 사고는 모두 업데이트 안 된 기기가
    // 옛 코드로 동기화하면서 생겼다. 지금 돌고 있는 코드가 배포된 최신본과 다르면 클라우드에
    // 쓰지 않고 새로고침을 안내한다. 작업 중이던 내용은 기기에 남아 있고(dirty 층 목록도
    // localStorage에 유지), 새로고침 후 새 코드가 올린다.
    const APP_VERSION_GATE_TTL_MS = 60 * 1000;
    let _appOutdatedForSync = false;
    let _appVersionGateCheckedAt = 0;
    let _appVersionGateInflight = null;

    // 사진 ID 방식 번호. 1 = 자리 번호(결함id_0 …), 2 = 고유 ID(3단계, 2026-09-27, createDefectPhotoId).
    // 배포할 때 scripts/prepare-pages.py가 이 값을 web-version.json의 photoIdScheme에 적는다.
    // 배포본 번호가 이 코드보다 크면 이 코드는 옛 방식이라 클라우드 사진을 쓰거나 지우면 안 된다 —
    // 옛 앱은 가운데 사진을 지울 때 뒤 사진을 앞 번호로 이사시키는데, 새 방식에서는 옛 번호도
    // 계속 쓰이는 사진 이름이라 멀쩡한 사진을 덮어쓰거나 지운다.
    const PHOTO_ID_SCHEME = 2;
    let _deployedPhotoIdScheme = PHOTO_ID_SCHEME;

    function renderOutdatedAppBanner(show) {
        let bar = document.getElementById('bsaOutdatedBanner');
        if (!show) {
            if (bar) bar.remove();
            document.body && document.body.classList.remove('bsa-outdated-app');
            return;
        }
        if (bar) return;
        bar = document.createElement('div');
        bar.id = 'bsaOutdatedBanner';
        bar.className = 'bsa-outdated-banner';
        bar.setAttribute('role', 'alert');
        bar.innerHTML = '<span class="bsa-outdated-banner-text">'
            + '새 버전이 배포됐습니다. <b>새로고침해야 클라우드 동기화가 다시 됩니다.</b> '
            + '지금까지 작업한 내용은 이 기기에 저장돼 있어요.'
            + '</span>'
            + '<button type="button" class="btn btn-sm bsa-outdated-banner-btn">새로고침</button>';
        bar.querySelector('button').addEventListener('click', () => {
            if (typeof window.reloadWebAppFromServer === 'function') window.reloadWebAppFromServer();
            else window.location.reload();
        });
        document.body.appendChild(bar);
        document.body.classList.add('bsa-outdated-app');
    }

    /** 배포된 버전과 지금 코드를 비교해 차단 여부를 갱신한다. 모르면 이전 판단을 유지한다. */
    async function refreshAppVersionGate(force) {
        // 동시에 여러 곳이 물으면 한 번만 받아서 다 같이 기다린다. 안 그러면 첫 확인이 끝나기 전에
        // 들어온 호출(사진 여러 장 동시 업로드 등)이 "막지 않음"이라는 옛 판단을 받아 그대로 써 버린다.
        if (_appVersionGateInflight) return _appVersionGateInflight;
        if (!force && (Date.now() - _appVersionGateCheckedAt) < APP_VERSION_GATE_TTL_MS) {
            return _appOutdatedForSync;
        }
        _appVersionGateInflight = checkAppVersionGateNow();
        try {
            return await _appVersionGateInflight;
        } finally {
            _appVersionGateInflight = null;
        }
    }

    async function checkAppVersionGateNow() {
        _appVersionGateCheckedAt = Date.now();
        const api = window.BSA && window.BSA.syncMerge;
        if (!api || typeof api.isOutdatedBuild !== 'function') return _appOutdatedForSync;
        try {
            const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
            const timer = ctrl ? window.setTimeout(() => ctrl.abort(), 4000) : null;
            const r = await fetch('web-version.json?t=' + Date.now(), {
                cache: 'no-store',
                signal: ctrl ? ctrl.signal : undefined
            });
            if (timer) window.clearTimeout(timer);
            if (!r.ok) return _appOutdatedForSync;
            const text = (await r.text()).replace(/^﻿/, '').trim();
            const meta = text ? JSON.parse(text) : null;
            // 적혀 있지 않으면(2단계 전 배포본) 1 — 옛 방식
            _deployedPhotoIdScheme = Number(meta && meta.photoIdScheme) || 1;
            const outdated = !!api.isOutdatedBuild(window.BSA_APP_VERSION, meta, window.location.hostname);
            if (outdated !== _appOutdatedForSync) {
                _appOutdatedForSync = outdated;
                if (outdated) {
                    console.warn('[sync] 옛 버전 앱이라 클라우드 동기화를 멈춥니다:',
                        window.BSA_APP_VERSION, '→ 배포본', meta && (meta.short || meta.sha));
                }
            }
            renderOutdatedAppBanner(_appOutdatedForSync);
            if (window.BSA && window.BSA.appUpdateButton) window.BSA.appUpdateButton.setBadge('web', outdated);
        } catch (_e) { /* 오프라인·시간 초과 — 이전 판단 유지 */ }
        return _appOutdatedForSync;
    }
    window.refreshAppVersionGate = refreshAppVersionGate;

    /**
     * 배포본이 더 새로운 사진 ID 방식이면, 이 코드로는 클라우드 사진을 올리거나 지우지 않는다.
     * 사진은 이 기기에 그대로 남고, 새로고침해서 새 코드가 되면 그때 올라간다.
     */
    async function isCloudPhotoWriteBlocked() {
        await refreshAppVersionGate(false);
        return _deployedPhotoIdScheme > PHOTO_ID_SCHEME;
    }

    /**
     * 2026-11-06 빈 칸 이름 오류로 멈춘 기기는 코드가 고쳐졌으니 알아서 푼다. 이 오류는 데이터 문제가 아니고,
     * 안 풀면 사람이 「지금 다시 올리기」를 누를 때까지 그 기기의 층·사진 올리기가 조용히 멈춰 있다.
     */
    function unparkFixedSyncErrors() {
        const g = syncGate();
        if (!g || !g.isParked()) return;
        if (/Field names must not be empty/.test(String((g.state() || {}).reason || ''))) {
            console.info('[동기화] 고쳐진 오류로 멈춰 있던 자동 올리기를 다시 시작합니다.');
            g.unpark();
        }
    }

    async function syncStateToFirebase() {
        try { unparkFixedSyncErrors(); } catch (_e) { /* ignore */ }
        // 2026-10-16 서버 시계 차이 측정(10분에 한 번, 기다리지 않음) — 이후 찍는 동기화 시각에 반영
        try { void measureServerClockOffset(false); } catch (_e) { /* ignore */ }
        if (!db || !window.state.companyId || !navigator.onLine) return;
        // 옛 버전 코드로는 클라우드에 쓰지 않는다. (확인은 await 뒤에 하고, 아래 in-flight
        // 확인·설정은 동기로 붙여 둬야 동시 호출이 둘 다 통과하지 않는다)
        if (await refreshAppVersionGate(false)) {
            renderOutdatedAppBanner(true);
            return;
        }
        // 2026-11-10 기기 날짜가 서버와 1일 넘게 다르면 쓰지 않는다 — 수정·삭제 시각이 틀리게 찍혀 남의 수정을 계속 이기거나 밀린다.
        // 안내 띠가 뜨고, 날짜를 맞추면 다음 동기화부터 저절로 풀린다. 변경은 기기에 남는다.
        if (await isDeviceClockBadForSync()) return;
        if (isRemoteSyncing || _syncInFlight) {
            _syncPending = true;
            return;
        }
        // 2026-10-20 멈춘 올리기는 자동으로 다시 돌리지 않는다(「지금 다시 올리기」가 풀어 준다). 변경은 기기에 남는다.
        if (isSyncParked()) {
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            return;
        }
        if (typeof flushOverviewCaptionsFromDom === 'function') flushOverviewCaptionsFromDom();
        _syncInFlight = true;
        // 2026-10-20 탭 여러 개가 같은 기기에서 동시에 올리지 않게(탭 사이 잠금) — 다른 탭이 올리는 중이면 잠시 뒤 한 번만
        const _tabLockRelease = syncRetryApi()
            ? await syncRetryApi().tryCrossTabLock(`bsa-sync-${window.state.companyId}`)
            : () => {};
        if (!_tabLockRelease) {
            _syncInFlight = false;
            scheduleSyncAfterOtherTab();
            return;
        }
        let cycleFailReason = '';
        if (typeof syncProgressBegin === 'function') syncProgressBegin();
        ensureSyncMetaState();
        // 2026-11-05 잠금을 둘로 나눔:
        //  ① 층 잠금(현장·회차·동·층) — 층을 읽고·사진 올리고·층 문서를 쓰는 동안. 다른 층을 올리는 기기와는 동시에 진행.
        //  ② 회사 잠금(syncLeases/company) — 건물 목록·회사 설정(루트 문서)을 다시 읽고 쓰는 짧은 순간에만.
        // 예전엔 홈 화면 기기들이 ②를 사진 업로드까지 통째로 쥐어서 회사 전체가 한 기기씩 줄을 섰다.
        let leaseInfo = null;            // ② 회사 잠금
        const floorLeases = new Map();   // ① floorKey → { ref, info }
        const busyFloorKeys = new Set(); // 다른 기기가 올리는 중이라 이번에 건너뛴 층
        let leaseHeartbeatTimer = null;
        const docId = getCompanyDocId();
        const docRef = db.collection('safety_app').doc(docId);
        const leaseRef = getSyncLeaseDocRef(docRef);
        try {
            // 드래그 중이면 먼저 기다림 (잠금을 오래 쥐고 있지 않게)
            await waitForUiGestureIdle();

            leaseHeartbeatTimer = setInterval(() => {
                floorLeases.forEach((fl) => { heartbeatCompanySyncLease(fl.ref, fl.info); });
                if (leaseInfo) heartbeatCompanySyncLease(leaseRef, leaseInfo);
            }, SYNC_LEASE_HEARTBEAT_MS);

            // 잠금 문서는 더 이상 회사/층 페이로드가 아니다. 서버에서 받은 리스너 문서 → 없으면 서버에서 직접(캐시로 넘어가지 않음)
            let serverData = await serverRootDataForWrite(docRef);

            let mergedDeletedBuildings = mergeDeletedBuildingIds(
                serverData.deletedBuildingIds,
                window.state.deletedBuildingIds
            );
            window.state.deletedBuildingIds = mergedDeletedBuildings;
            if (typeof persistCurrentBuildingLocationMapLegend === 'function') {
                persistCurrentBuildingLocationMapLegend();
            }
            let prevAssets = captureBuildingDrawingAssetsById(window.state.buildings);
            window.state.buildings = mergeBuildingsForSync(
                serverData.buildings,
                window.state.buildings,
                mergedDeletedBuildings,
                prevAssets
            );
            mergedDeletedBuildings.forEach(purgeLocalStateForDeletedBuilding);
            // 2026-10-20 건물이 없는(서버 목록에도 업로드 대기에도 없음·삭제됨) 층의 「올릴 것」 표시 정리.
            // 그대로 두면 매번 건너뛰기만 해서 「서버에 올리는 중 172/176」이 영원히 안 끝났다(현장명 없는 유령 건물 B1F).
            // 서버 건물 목록을 실제로 받았을 때만(첫 로드 전·오프라인이면 새 건물이 아직 목록에 없을 수 있다).
            // 2026-11-12 floor-sync-guard.js가 이 기기에서 못 불러와졌으면(망 끊김·캐시) 정리만 건너뛴다 —
            // 예전엔 여기서 「Cannot read properties of undefined (reading 'orphanDirtyFloorKeys')」로 동기화 전체가 멈췄다.
            const orphanGuard = window.BSA && window.BSA.floorSyncGuard;
            if (!orphanGuard || typeof orphanGuard.orphanDirtyFloorKeys !== 'function') {
                console.warn('[동기화] floor-sync-guard.js가 없어 건물 없는 층 정리를 건너뜁니다');
            } else if (Array.isArray(serverData.buildings) && serverData.buildings.length) {
                const orphanKeys = orphanGuard.orphanDirtyFloorKeys(
                    Array.from(_dirtyFloorKeys), window.state.buildings, mergedDeletedBuildings
                );
                if (orphanKeys.length) {
                    orphanKeys.forEach((k) => _dirtyFloorKeys.delete(k));
                    persistDirtyFloorKeys();
                    console.warn('[동기화] 건물이 없는 층의 「올릴 것」 표시를 지웠습니다:', orphanKeys);
                }
            }

            isRemoteSyncing = true;
            window.state.confirmedDeletedIds = {};

            // 배치 상한: 한 번에 전 dirty를 읽지 않되, 미선택 층은 dirty에 남겨 원격 적용을 계속 차단
            // 2026-11-05 후보를 넉넉히 뽑고, 층 잠금을 잡은 층만 이번에 올린다(다른 기기가 올리는 층은 건너뜀)
            const floorCandidates = Array.from(pickDirtyFloorsForSyncBatch(SYNC_DIRTY_FLOOR_BATCH_MAX * 4));
            const floorsSkipWrite = new Set();
            const floorReadRev = new Map();
            const floorServerItems = new Map();
            const currentKey = currentInspectionFloorKey();
            if (currentKey && !floorCandidates.includes(currentKey)) floorCandidates.unshift(currentKey);
            const floorsToSync = new Set();
            for (const floorKey of floorCandidates) {
                if (floorsToSync.size >= SYNC_DIRTY_FLOOR_BATCH_MAX && floorKey !== currentKey) continue;
                const fb = findBuildingForFloorKey(floorKey);
                const fc = floorCodeFromFloorKey(floorKey, fb);
                const fRef = (fb && fc) ? getFloorScopeRef(fb, fc) : null;
                const fLeaseRef = fRef ? getSyncLeaseDocRef(fRef) : null;
                if (!fLeaseRef) continue;
                const info = await tryAcquireSyncLease(fLeaseRef);
                if (!info) {
                    busyFloorKeys.add(floorKey);
                    continue;
                }
                floorLeases.set(floorKey, { ref: fLeaseRef, info });
                floorsToSync.add(floorKey);
            }
            // 2026-11-06 진행률 창에 「지금 올리는 현장」으로 보인다. 남은 변경이 없는 층(보고 있는 층)은 현장별 줄에 안 잡힌다
            _syncActiveFloorKeys = new Set(floorsToSync);
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            if (busyFloorKeys.size) {
                console.info('[동기화] 다른 기기가 올리는 중인 층은 이번에 건너뜀(잠시 뒤 다시):', Array.from(busyFloorKeys));
            }
            for (const floorKey of floorsToSync) {
                const floorBldg = findBuildingForFloorKey(floorKey);
                const code = floorCodeFromFloorKey(floorKey, floorBldg);
                if (!floorBldg || !code) continue;
                // _lastFloorSnapData는 층 리스너가 마지막으로 받은 문서다. 층을 바꾸면
                // window.state.currentFloor(=currentKey)는 즉시 바뀌지만 리스너 재구독
                // (subscribeCurrentFloorSync)은 비동기라, 그 사이 이 캐시는 아직 "이전 층"
                // 것이다. 그대로 preloaded로 넘기면 readFloorSyncBundle이 이전 층 내용을
                // 새 층 묶음으로 돌려주고, mergeFloorBundleIntoState가 그걸 새 층 키에
                // 병합한 뒤 새 층 문서로 업로드한다 — 층끼리 결함이 섞인다.
                // 주인 판단은 _lastFloorSnapPath로 한다. _listeningFloorPath를 쓰면 안 된다 —
                // 스냅샷 콜백 중간에 await가 있어서 이전 층 콜백이 뒤늦게 캐시를 덮어쓸 때는
                // _listeningFloorPath가 이미 새 층을 가리키고, 그러면 이 가드가 통과해 버린다.
                // _lastFloorSnapPath는 데이터를 넣은 그 자리에서 같이 적히므로 항상 맞다.
                const floorRefForKey = getFloorScopeRef(floorBldg, code);
                const cacheBelongsToThisFloor = !!(floorRefForKey
                    && _lastFloorSnapPath === floorRefForKey.path
                    && _lastFloorSnapData && Object.keys(_lastFloorSnapData).length);
                const preloaded = (floorKey === currentKey && cacheBelongsToThisFloor)
                    ? _lastFloorSnapData
                    : null;
                // 2026-10-16 읽기 실패·쓰는 중이면 빈 층으로 보지 않는다 — 이 층은 이번에 쓰지 않고 다음에 다시
                let readRes;
                try {
                    readRes = await readFloorBundleForSync(floorBldg, code, preloaded);
                } catch (e) {
                    console.warn('[동기화] 층을 서버에서 읽지 못해 이번에는 쓰지 않습니다(다음에 다시):', floorKey, e && e.message);
                    floorsSkipWrite.add(floorKey);
                    if (syncRetryApi() && syncRetryApi().classify(e) === 'permanent') throw e;
                    // 2026-11-06 보고 있을 뿐 올릴 것이 없는 층의 읽기 실패는 올리기 실패가 아니다
                    if (_dirtyFloorKeys.has(floorKey)) {
                        if (!cycleFailReason) cycleFailReason = `층 읽기 실패(${floorKey}): ${(e && e.message) || e}`;
                        if (typeof syncProgressFail === 'function') syncProgressFail(floorKey, '서버에서 층을 읽지 못함 — 다음 동기화에서 다시');
                    }
                    continue;
                }
                // 서버 층 칸을 다른 동이 쓰고 있으면 덮어쓰지 않는다(이 기기에 그 동 정보가 아직 없을 때 칸이 겹침)
                if (readRes && readRes.bundle && readRes.bundle.buildingId && readRes.bundle.buildingId !== floorBldg.id) {
                    console.warn('[동기화] 이 층 칸은 다른 동 것이라 쓰지 않습니다:', floorKey, '←', readRes.bundle.buildingId);
                    floorsSkipWrite.add(floorKey);
                    continue;
                }
                floorReadRev.set(floorKey, readRes.rev);
                floorServerItems.set(floorKey, ((readRes.bundle && readRes.bundle.markings && readRes.bundle.markings.items) || []).slice());
                mergeFloorBundleIntoState(floorBldg, code, readRes.bundle);
            }

            // 사진/도면 업로드 (잠금 유지 + heartbeat)
            const photoFailedFloors = await runPhotoPhaseWithinBudget(Array.from(floorsToSync), async () => {
                const failed = await uploadInlineDefectPhotosForSync(subsetDefectsMap(window.state.defects, Array.from(floorsToSync)));
                await uploadPendingJournalPhotos();
                return failed;
            });
            const fieldRasterOnly = typeof isNativeAndroidApp === 'function' && isNativeAndroidApp() && !layoutIsPcLike();
            if (!fieldRasterOnly) {
                await uploadFloorDrawingPdfsForSync(window.state.buildings);
                await ensureRasterTiersForSync(window.state.buildings);
            }
            await uploadFloorDrawingsForSync(window.state.buildings);
            // 지운 기록의 클라우드 사진 — 보류 기간이 지났고 서버에서도 안 되살아난 것만(읽기만 하므로 기다리지 않는다)
            processDeferredPhotoDeletes().catch((e) => console.warn('[사진] 미룬 삭제 처리 실패:', e));
            await hydrateLocalImagesFromIndexedDb();
            refreshCurrentBuildingFromState();

            // 사진/도면 업로드 동안 드래그가 시작됐으면 재병합·다시 그리기 전에 대기
            await waitForUiGestureIdle();

            // 2026-11-05 회사 잠금은 여기서부터(건물 목록 다시 읽기 → 층 문서·루트 문서 쓰기)만 쥔다.
            // 사진 올리는 동안엔 회사 잠금이 없었으니 다른 기기가 건물 정보를 바꿨을 수 있다 → 서버 것을 다시 읽어 합친다.
            leaseInfo = await acquireCompanySyncLease(leaseRef);
            await waitForUiGestureIdle();
            {
                serverData = await serverRootDataForWrite(docRef);
                mergedDeletedBuildings = mergeDeletedBuildingIds(
                    serverData.deletedBuildingIds,
                    window.state.deletedBuildingIds
                );
                window.state.deletedBuildingIds = mergedDeletedBuildings;
                prevAssets = captureBuildingDrawingAssetsById(window.state.buildings);
                window.state.buildings = mergeBuildingsForSync(
                    serverData.buildings,
                    window.state.buildings,
                    mergedDeletedBuildings,
                    prevAssets
                );
                mergedDeletedBuildings.forEach(purgeLocalStateForDeletedBuilding);
            }

            _suppressSyncOnSave = true;
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            _suppressSyncOnSave = false;

            const sanitizedBuildings = filterDeletedBuildings(window.state.buildings || [], mergedDeletedBuildings)
                .map((b) => {
                    const meta = sanitizeBuildingMetaForFirestore(b);
                    meta.drawingFloorCodes = Array.from(collectKnownFloorCodesForBuilding(b));
                    return meta;
                });

            for (const floorKey of floorsToSync) {
                const floorBldg = findBuildingForFloorKey(floorKey);
                const code = floorCodeFromFloorKey(floorKey, floorBldg);
                if (!floorBldg || !code) continue;
                if (floorsSkipWrite.has(floorKey) || !floorReadRev.has(floorKey)) continue;   // 못 읽은 층은 쓰지 않음(올릴 것 표시 유지)
                await yieldToUiGesture();
                // 2026-10-16 쓰기 직전 서버 버전 재확인 — 읽은 뒤 다른 기기가 썼으면 다시 읽어 합친 뒤 쓴다(최대 3회)
                const guard = window.BSA && window.BSA.floorSyncGuard;
                const conf = await guard.confirmRevBeforeWrite(
                    floorReadRev.get(floorKey),
                    () => checkFloorRevOnServer(floorBldg, code),
                    async () => {
                        await new Promise((r) => setTimeout(r, 700));
                        const again = await readFloorBundleForSync(floorBldg, code, null);
                        floorServerItems.set(floorKey, ((again.bundle && again.bundle.markings && again.bundle.markings.items) || []).slice());
                        mergeFloorBundleIntoState(floorBldg, code, again.bundle);
                        return again.rev;
                    },
                    3
                );
                if (!conf.ok) {
                    console.warn('[동기화] 서버 층이 계속 바뀌거나 확인되지 않아 이번에는 쓰지 않습니다(다음에 다시):', floorKey, conf.reason);
                    // 2026-11-06 올릴 것이 없는 층(보고 있는 층)은 다른 사람이 쓰는 중이어도 실패가 아니다
                    if (_dirtyFloorKeys.has(floorKey)) {
                        if (!cycleFailReason) cycleFailReason = `층 버전 확인 실패(${floorKey}): ${conf.reason || ''}`;
                        if (typeof syncProgressFail === 'function') syncProgressFail(floorKey, '다른 기기가 같은 층을 올리는 중 — 합친 뒤 다시');
                    }
                    continue;
                }
                const lost = guard.lostServerIds(
                    floorServerItems.get(floorKey),
                    window.state.defects[floorKey] || [],
                    (window.state.deletedDefectIds || {})[floorKey] || []
                );
                await writeFloorSyncBundle(floorBldg, code);
                if (lost.length) {
                    console.warn('[동기화] 서버에 있던 마킹이 삭제 기록 없이 빠졌습니다:', floorKey, lost);
                    window.showToast(`주의: ${floorKey.split('_').slice(1).join('_')} 층에서 서버에 있던 마킹 ${lost.length}개가 빠졌습니다. 다른 기기 작업을 확인해 주세요.`, 'warning', 9000);
                }
            }
            // 층 쓰기가 "올릴 것 있음"을 지웠다 — 사진을 못 올린 층은 다시 남겨 다음 동기화가 재시도하게 한다
            if (photoFailedFloors && photoFailedFloors.size) {
                if (!cycleFailReason) cycleFailReason = `사진 업로드 실패(${photoFailedFloors.size}개 층)`;
                photoFailedFloors.forEach((k) => markFloorKeyDirty(k));
                if (typeof syncProgressFail === 'function') photoFailedFloors.forEach((k) => syncProgressFail(k, '사진 업로드 실패 — 다시 시도'));
                console.warn('[사진] 업로드 실패가 있어 다음 동기화에서 다시 올립니다:', Array.from(photoFailedFloors));
            }
            let rootGuardData = null;
            let rootGuardRaw = null;
            const dataToSync = {
                // 예전 버전에서 루트 문서에 직접 쓰던 필드들 — bulkData로 이전했으니 루트에서는 제거
                // (merge:true는 필드를 지우지 않으므로 FieldValue.delete()로 명시적으로 삭제해야
                //  루트 문서 크기가 실제로 줄어든다)
                defects: firebase.firestore.FieldValue.delete(),
                deletedDefectIds: firebase.firestore.FieldValue.delete(),
                deletedDefectAt: firebase.firestore.FieldValue.delete(),
                ndtData: firebase.firestore.FieldValue.delete(),
                deletedNdtIds: firebase.firestore.FieldValue.delete(),
                deletedNdtAt: firebase.firestore.FieldValue.delete(),
                ndtDisplacementGroups: firebase.firestore.FieldValue.delete(),
                confirmedDeletedIds: {},
                deletedBuildingIds: mergedDeletedBuildings,
                grids: window.state.grids || {},
                buildings: sanitizedBuildings,
                lastUsedBuildingId: window.state.currentBuildingId || null,
                styleColors: window.state.styleColors || null,
                styleColorsPaletteVersion: (window.state.styleColorsPaletteVersion || 0),
                styleSizes: window.state.styleSizes || null,
                defectLeaderLineScale: (window.state.defectLeaderLineScale !== undefined ? window.state.defectLeaderLineScale : 1.0),
                ndtLeaderLineScale: (window.state.ndtLeaderLineScale !== undefined ? window.state.ndtLeaderLineScale : 1.0),
                styleSizeBarLockedMap: window.state.styleSizeBarLockedMap !== false,
                styleSizeBarLockedNdt: window.state.styleSizeBarLockedNdt !== false,
                floorMapStyleSettings: window.state.floorMapStyleSettings || null,
                floorDrawingRotations: window.state.floorDrawingRotations || null,
                floorGridLines: window.state.floorGridLines || null,
                // 아직 못 받은 기기가 null 로 덮어 다른 기기가 정한 출력 범위를 지우지 않게 — 있을 때만 올린다
                ...(window.state.floorPrintCrops ? { floorPrintCrops: window.state.floorPrintCrops } : {}),
                ...(window.state.floorDrawingDarken ? { floorDrawingDarken: window.state.floorDrawingDarken } : {}),
                styleShapes: window.state.styleShapes || null,
                locationMapLegend: window.state.locationMapLegend || null,
                locationMapLegendBox: window.state.locationMapLegendBox || null,
                companyName: window.state.companyName || localStorage.getItem('building_company_name'),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (serverData && serverData.syncLease) {
                dataToSync.syncLease = firebase.firestore.FieldValue.delete();
            }
            // 2026-10-19 회사 공통 설정은 통째로 쓰지 않는다 — 이 기기에서 바뀐 칸만 아래 writeCompanySettingsPerKey가 경로 지정으로 쓴다
            const csPerKey = !!(companySettingsApi() && companySettingsStore());
            if (csPerKey) companySettingsApi().KEYS.forEach((k) => { delete dataToSync[k]; });
            // 2026-10-16 사고 방지: 쓰기 직전에 서버를 다시(캐시 말고 서버에서) 읽어, 서버에 있던 건물이
            // 이번 쓰기에서 하나라도 빠지면 쓰지 않는다. 빈(기본) 상태 기기가 건물 목록·회사 설정을 통째로 덮어쓴 사고 재발 막기.
            // 서버를 못 읽으면(오프라인 등) 이번에는 쓰지 않는다 — 다음 동기화가 다시 한다.
            {
                const guardApi = window.BSA && window.BSA.floorSyncGuard;
                const guardSnap = await docRef.get({ source: 'server' });
                rootGuardRaw = (guardSnap && guardSnap.exists && guardSnap.data()) || {};
                _lastRootRaw = rootGuardRaw;
                // 2026-11-04 건물 문서로 나눈 회사도 「펼친 보기」로 확인(못 읽으면 이번엔 쓰지 않음 — 남의 건물을 모르고 덮지 않게)
                const guardData = await expandRootDocData(docRef, rootGuardRaw, { strict: true });
                rootGuardData = guardData;
                const lostBldgs = guardApi && typeof guardApi.lostServerBuildings === 'function'
                    ? guardApi.lostServerBuildings(guardData.buildings, sanitizedBuildings, mergedDeletedBuildings)
                    : [];
                if (lostBldgs.length) {
                    // 2026-10-21 쓰기 전에 서버본과 건물 id로 합친다 — 이 기기 목록에 없는 서버 건물(삭제 기록 없음)은
                    // 서버 항목 그대로 이번 쓰기에 넣어, 오래된 목록이 배열을 통째로 덮어써 건물을 지우지 못하게 한다.
                    const lostIds = new Set(lostBldgs.map((x) => x.id));
                    const keepServer = (guardData.buildings || []).filter((b) => b && lostIds.has(b.id));
                    dataToSync.buildings = sanitizedBuildings.concat(keepServer);
                    console.warn('[동기화] 이 기기 목록에 없는 서버 건물을 지우지 않고 합쳐서 씁니다:', lostBldgs);
                    try {
                        const have = new Set((window.state.buildings || []).map((b) => b && b.id));
                        keepServer.forEach((b) => { if (!have.has(b.id)) window.state.buildings.push(Object.assign({}, b)); });
                        _suppressSyncOnSave = true;
                        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
                        _suppressSyncOnSave = false;
                    } catch (e) { console.warn('[동기화] 서버 건물 로컬 반영 실패:', e); }
                }
            }
            {
                // 2026-11-04 루트가 1MB에 가까우면(또는 이미 나눴으면) 건물마다 문서로 나눠 쓴다(작으면 예전과 똑같이 한 번에)
                const bdApi = buildingDocsApi();
                if (bdApi && bdApi.shouldSplit(rootGuardRaw || {}, dataToSync, { force: _rootForceSplit })) {
                    const r = await writeBuildingDocsForSync(docRef, dataToSync, mergedDeletedBuildings, rootGuardRaw || {});
                    if (r.wrote || r.migrated) console.info('[건물 문서] 나눠 씀:', r);
                    const S = rootDocShardsApi();
                    // 남은 공통 칸(삭제 기록 등)이 그래도 크면 조각으로
                    if (S) {
                        await S.writeRootDoc(docRef, dataToSync, {
                            fields: ['deletedBuildingIds'], serverRaw: rootGuardRaw || {},
                            deleteSentinel: () => firebase.firestore.FieldValue.delete(),
                            // 2026-11-10 목차 쓰기는 트랜잭션으로 — 기기 대기열에 남았다가 며칠 뒤 옛 목차가 올라가 최신 목차를 덮지 않게
                            commitRoot: (typeof db.runTransaction === 'function')
                                ? (data) => db.runTransaction(async (tx) => { tx.set(docRef, data, { merge: true }); })
                                : null
                        });
                    } else {
                        await docRef.set(dataToSync, { merge: true });
                    }
                    _rootForceSplit = false;
                } else {
                    await docRef.set(dataToSync, { merge: true });
                }
            }
            if (csPerKey) await writeCompanySettingsPerKey(docRef, rootGuardData);
            clearSyncErrorRetryTimer();
            // 2026-10-20 일부가 실패한 회차는 성공으로 치지 않는다 — 예전엔 여기서 실패 수를 0으로 돌리고
            // 남은 층 때문에 곧바로(~3.5초) 전체 동기화를 다시 돌려, 같은 실패를 끝없이 반복하며 읽기·쓰기를 태웠다.
            if (!cycleFailReason) {
                _syncRetryFailCount = 0;
                const g = syncGate(); if (g) g.ok();
            }
            let clearedPendingCloudSync = false;
            (window.state.buildings || []).forEach((b) => {
                if (b && b._pendingCloudSync) {
                    delete b._pendingCloudSync;
                    clearedPendingCloudSync = true;
                }
            });
            // 해제를 로컬에도 반영한다. 직전 저장(업로드 전)은 플래그가 true인 상태로 기록돼
            // 있어서, 여기서 다시 쓰지 않으면 다음 실행 때 shouldKeepLocal()이 무조건 로컬을
            // 이기게 해 다른 기기의 더 최신 건물 메타 수정을 되돌린다.
            if (clearedPendingCloudSync && typeof saveStateToLocalStorage === 'function') {
                _suppressSyncOnSave = true;
                saveStateToLocalStorage();
                _suppressSyncOnSave = false;
            }
            if ((state.currentTab === 'tab-map') && state.currentBuildingId && state.currentFloor) {
                refreshCurrentBuildingFromState();
                if (typeof applyBuildingLocationMapLegend === 'function' && state.currentBuilding) {
                    applyBuildingLocationMapLegend(state.currentBuilding);
                }
                if (state.bgImage && typeof syncFloorDrawingTierForView === 'function') {
                    syncFloorDrawingTierForView();
                } else if (typeof loadFloorDrawing === 'function') {
                    loadFloorDrawing(state.currentFloor, { preserveView: true });
                }
            }
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            if (typeof renderSurveyTable === 'function') renderSurveyTable();
            if (typeof renderDashboard === 'function') renderDashboard();
            if (typeof window.purgeExpiredBuildingTrash === 'function') {
                window.purgeExpiredBuildingTrash().catch(() => {});
            }
            try { const j = typeof syncJournal === 'function' ? syncJournal() : null; if (j) j.clearFailure('sync'); } catch (_e) { /* ignore */ }
        } catch (e) {
            // 다른 기기가 올리는 중이라 양보한 것은 실패가 아니다. 경고 토스트를 띄우거나
            // 지수 백오프를 키우면 안 된다 — finally가 다음 회차를 예약한다.
            if (isSyncLeaseBusyError(e)) {
                console.info('동기화 양보:', e.message);
                _syncPending = true;
                return;   // finally는 그대로 실행된다 — 잠금 해제·다음 회차 예약
            }
            console.warn('Firebase Sync Error:', e);
            // 2026-11-04 문서 1MB 초과: 멈추지 않고 다음 시도에서 건물마다 문서로 나눠 쓴다
            if (rootDocShardsApi() && rootDocShardsApi().isDocTooLargeError(e)) {
                _rootForceSplit = true;
                try { e.__kind = 'transient'; } catch (_e2) { /* ignore */ }
            }
            // 2026-11-10 실패 원인을 화면·오류 기록에 남긴다 — 예전엔 콘솔에만 찍혀 현장 폰에서는 왜 안 올라가는지 알 수 없었다
            let syncFailDetail = '';
            try {
                const code = e && e.code ? String(e.code) : '';
                const msg = String((e && e.message) || e || '').replace(/\s+/g, ' ').trim();
                syncFailDetail = (code && !msg.includes(code) ? code + ' ' : '') + msg;
                if (syncFailDetail.length > 90) syncFailDetail = syncFailDetail.slice(0, 90) + '…';
                const el = window.BSA && window.BSA.errorLog;
                if (el && typeof el.record === 'function') el.record({ kind: 'sync-fail', message: syncFailDetail, stack: e && e.stack, source: 'syncToFirebase' });
            } catch (_e3) { /* ignore */ }
            const syncFailTail = syncFailDetail ? ' (' + syncFailDetail + ')' : '';
            if (typeof syncProgressFail === 'function') syncProgressFail('sync', isFirestorePermissionError(e) ? '서버 접근 권한 없음 — 관리자 확인 필요'
                : (isFirestoreQuotaError(e) ? '서버 사용 한도 — 잠시 뒤 자동 재시도' : '서버 동기화 실패 — 잠시 뒤 자동 재시도' + syncFailTail));
            _syncPending = false;
            if (isFirestoreQuotaError(e)) pauseFirestoreWrites(SYNC_QUOTA_COOLDOWN_MS);
            const now = Date.now();
            const isPermErr = isFirestorePermissionError(e);
            // 권한 오류는 원인이 늘 같다(규칙 미게시) — 무슨 일인지·누가 뭘 해야 하는지
            // 바로 알 수 있게 따로 안내하고, 10초가 아니라 재시도 주기에 맞춰 드물게 띄운다.
            const toastCooldown = isPermErr ? SYNC_PERMISSION_COOLDOWN_MS : SYNC_ERROR_TOAST_COOLDOWN_MS;
            if (now - _syncErrorToastAt >= toastCooldown) {
                _syncErrorToastAt = now;
                if (isPermErr) {
                    console.error(
                        '서버 접근 권한 없음 — Firestore 보안 규칙이 최신이 아닐 수 있습니다.\n'
                        + '레포의 firestore.rules 내용을 Firebase 콘솔 → Firestore Database → 규칙 탭에 '
                        + '붙여넣고 게시(Publish)하세요. (CLI: firebase deploy --only firestore:rules)',
                        e
                    );
                }
                if (typeof window.showToast === 'function') {
                    window.showToast(
                        isPermErr
                            ? '서버 접근 권한이 없어 동기화를 멈췄습니다(기기 데이터는 그대로). 관리자에게 Firebase 보안 규칙 게시를 요청한 뒤 「지금 다시 올리기」를 눌러 주세요.'
                            : isFirestoreQuotaError(e)
                                ? 'Firebase 읽기/쓰기 한도(429)에 걸렸습니다. 2분 후 자동 재시도합니다.'
                                : '서버 동기화에 실패했습니다. 잠시 후 자동으로 재시도합니다.',
                        'warning',
                        isPermErr ? 8000 : (isFirestoreQuotaError(e) ? 6000 : 4500)
                    );
                }
            }
            scheduleSyncRetryAfterError(e);
        } finally {
            if (leaseHeartbeatTimer) {
                clearInterval(leaseHeartbeatTimer);
                leaseHeartbeatTimer = null;
            }
            if (leaseInfo) {
                await releaseCompanySyncLease(leaseRef, leaseInfo);
                leaseInfo = null;
            }
            for (const fl of floorLeases.values()) {
                await releaseCompanySyncLease(fl.ref, fl.info);
            }
            floorLeases.clear();
            _syncActiveFloorKeys = new Set();
            setTimeout(() => { isRemoteSyncing = false; }, 400);
            _syncInFlight = false;
            try { _tabLockRelease(); } catch (_e) { /* ignore */ }
            // 일부 실패: 곧바로 다시 돌리지 않고 백오프(연속이면 멈춤)
            if (cycleFailReason && !_syncRetryTimer && !isSyncParked()) {
                _syncPending = false;
                scheduleSyncRetryAfterError({ code: 'partial-failure', message: cycleFailReason });
            }
            if (typeof scheduleSyncProgressRender === 'function') scheduleSyncProgressRender();
            // 온라인 복귀 flush 시도가 끝나면 원격 적용 재개 (실패해도 무한 차단하지 않음.
            // dirty 층은 applyFloorBundleToState 가드가 계속 보호)
            if (_blockRemoteApplyUntilLocalFlush) {
                _blockRemoteApplyUntilLocalFlush = false;
            }
            const onlyBusyFloorsLeft = busyFloorKeys.size > 0 && _dirtyFloorKeys.size > 0
                && Array.from(_dirtyFloorKeys).every((k) => busyFloorKeys.has(k));
            if (_dirtyFloorKeys.size === 0) {
                clearOfflinePendingFlush();
            } else if (onlyBusyFloorsLeft) {
                // 남은 층이 전부 다른 기기가 올리는 중 — 바로 다시 돌면 잠금만 두드리므로 잠시 뒤 한 번
                if (!_floorBusyRetryTimer && navigator.onLine !== false && !isSyncParked()) {
                    _floorBusyRetryTimer = setTimeout(() => {
                        _floorBusyRetryTimer = null;
                        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase({ skipMarkCurrent: true });
                    }, SYNC_FLOOR_BUSY_RETRY_MS);
                }
            } else if (!_syncPending && !_syncRetryTimer && navigator.onLine !== false && !isSyncParked()) {
                // 배치에 못 들어간 overflow dirty를 이어서 flush
                _syncPending = true;
            }
            persistDirtyFloorKeys();
            if (_syncPending && (_syncRetryTimer || isSyncParked())) _syncPending = false;
            if (_syncPending && !_syncRetryTimer) {
                _syncPending = false;
                if (typeof _fsWritePausedUntil === 'number' && Date.now() < _fsWritePausedUntil) {
                    // 쓰기 쉬는 중 — 실패로 세지 않고 남은 시간 뒤 한 번
                    _syncRetryTimer = setTimeout(() => { _syncRetryTimer = null; if (!isSyncParked()) syncStateToFirebase(); },
                        Math.max(1000, _fsWritePausedUntil - Date.now()));
                } else {
                    // isRemoteSyncing이 400ms 뒤에 풀리므로, 즉시 재호출하지 않고 디바운스로 이어간다.
                    setTimeout(() => {
                        if (typeof scheduleSyncToFirebase === 'function') {
                            scheduleSyncToFirebase({ skipMarkCurrent: true });
                        }
                    }, 450);
                }
            } else if (!_syncPending && !_syncRetryTimer && typeof scheduleFlushPendingRemoteSync === 'function') {
                scheduleFlushPendingRemoteSync();
            }
        }
    }


    let currentUnsubscribe = null;
    let currentBulkUnsubscribe = null;
    let _listenerNeedsResubscribe = false;
    let _listeningCompanyId = null;
    let _lastRootSnapshotData = {};
    // 2026-10-16 사고 방지: 위 루트 문서가 서버에서 온 것인지(기기 캐시·내 미전송 쓰기가 아님). 동기화 쓰기는 서버 것만 믿는다
    let _lastRootSnapshotFromServer = false;
    let _lastBulkSnapshotData = {};
    let _bulkHydratedOnce = false;

    function hasLiveFirestoreListeners() {
        return !!currentUnsubscribe
            && _listeningCompanyId === getCompanyDocId()
            && !_listenerNeedsResubscribe;
    }

    function stopRealtimeListeners(opts) {
        if (currentUnsubscribe) {
            try { currentUnsubscribe(); } catch (e) { /* ignore */ }
            currentUnsubscribe = null;
        }
        if (currentBulkUnsubscribe) {
            try { currentBulkUnsubscribe(); } catch (e) { /* ignore */ }
            currentBulkUnsubscribe = null;
        }
        if (_bldgMetaUnsub) {
            try { _bldgMetaUnsub(); } catch (e) { /* ignore */ }
            _bldgMetaUnsub = null;
        }
        stopFloorRealtimeListeners();
        if (typeof stopPhoneRelayListener === 'function') stopPhoneRelayListener();
        _listeningCompanyId = null;
        if (opts && opts.clearCache) {
            _lastRootSnapshotData = {};
            _lastRootSnapshotFromServer = false;
            _lastBulkSnapshotData = {};
            _bulkHydratedOnce = false;
            _lastBulkPayloadIdentity = '';
            _legacyBulkCache = null;
            _legacyBulkCacheTried = false;
            _floorsCheckedMigration.clear();
            _bldgDocs = {};
            _bldgDocsFromServer = false;
            _lastRootRaw = {};
            _bldgChunkCache = {};
        }
    }

    function isOnlySyncLeaseChange(prev, next) {
        if (!prev || !next || !Object.keys(prev).length) return false;
        const keys = new Set(Object.keys(prev).concat(Object.keys(next)));
        for (const k of keys) {
            if (k === 'syncLease') continue;
            if (prev[k] === next[k]) continue;
            const a = prev[k];
            const b = next[k];
            if (a && b && typeof a.toMillis === 'function' && typeof b.toMillis === 'function') {
                if (a.toMillis() === b.toMillis()) continue;
                return false;
            }
            try {
                if (JSON.stringify(a) !== JSON.stringify(b)) return false;
            } catch (_e) {
                return false;
            }
        }
        return true;
    }

    function combineListenerSnapshotData() {
        const data = Object.assign({}, _lastRootSnapshotData);
        ['defects', 'deletedDefectIds', 'deletedDefectAt',
            'ndtData', 'deletedNdtIds', 'deletedNdtAt',
            'ndtDisplacementGroups'].forEach((k) => { delete data[k]; });
        return data;
    }

    async function applyCombinedSnapshot() {
        if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);
        const data = combineListenerSnapshotData();
        if (!Object.keys(data).length) return;
        if (_blockRemoteApplyUntilLocalFlush || _syncInFlight) {
            _pendingRemoteData = data;
            return;
        }
        if (isRealtimeUiGestureBusy()) {
            _pendingRemoteData = data;
            return;
        }
        await applyRemoteSnapshotFromListener(data);
    }

    /** 로그인 직후: 이미 붙은 리스너 스냅샷을 기다리고, 없을 때만 추가 get() */
    async function pullCompanySnapshotOnce() {
        if (!db || !window.state.companyId || navigator.onLine === false) return;
        try {
            const deadline = Date.now() + 2000;
            while (Date.now() < deadline) {
                if (Object.keys(_lastRootSnapshotData).length) break;
                await sleepMs(50);
            }
            if (Object.keys(_lastRootSnapshotData).length) {
                await applyCombinedSnapshot();
                return;
            }
            const docRef = db.collection('safety_app').doc(getCompanyDocId());
            const snap = await fetchCompanyDocSnap(docRef);
            if (snap.exists) _lastRootRaw = snap.data() || {};
            const rootData = snap.exists ? await expandRootDocData(docRef, snap.data()) : {};
            await applyRemoteSnapshotFromListener(rootData);
        } catch (e) {
            console.warn('회사 데이터 초기 조회 실패:', e);
        }
    }

    function listenToRealtimeUpdates() {
        if (!db || !window.state.companyId) return;
        const docId = getCompanyDocId();
        if (hasLiveFirestoreListeners() && _listeningCompanyId === docId) return;

        const companyChanged = _listeningCompanyId && _listeningCompanyId !== docId;
        stopRealtimeListeners();
        _listenerNeedsResubscribe = false;
        _listeningCompanyId = docId;
        if (companyChanged) {
            _lastRootSnapshotData = {};
            _lastRootSnapshotFromServer = false;
            _bldgDocs = {};
            _bldgDocsFromServer = false;
            _lastRootRaw = {};
            _lastBulkSnapshotData = {};
            _bulkHydratedOnce = false;
            _lastBulkPayloadIdentity = '';
        }

        const onListenerErr = (err) => {
            console.warn('Realtime listener warning:', err);
            _listenerNeedsResubscribe = true;
            if (typeof updateOnlineBadge === 'function') updateOnlineBadge(false);
            if (!navigator.onLine) return;
            const quota = typeof isFirestoreQuotaError === 'function' && isFirestoreQuotaError(err);
            if (quota && typeof pauseFirestoreReads === 'function') {
                pauseFirestoreReads(SYNC_QUOTA_COOLDOWN_MS);
            }
            // 할당량 오류면 1.5초 재구독 루프 금지 — 쿨다운 후에만 한 번
            const delay = quota ? SYNC_QUOTA_COOLDOWN_MS : 1500;
            setTimeout(() => {
                if (!_listenerNeedsResubscribe) return;
                if (typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused()) return;
                if (typeof reconnectFirestoreSync === 'function') {
                    reconnectFirestoreSync('listener-error');
                }
            }, delay);
        };

        // 회사 루트는 건물 목록·설정만. 마킹/NDT는 지금 층 문서만 구독한다.
        currentUnsubscribe = db.collection('safety_app').doc(docId).onSnapshot(async (doc) => {
            const rawNext = (doc && doc.exists && doc.data()) || {};
            // 2026-11-04 건물 문서·조각을 붙인 「펼친 보기」로 — 늦게 끝난 옛 스냅샷이 새 것을 덮지 않게 순번 확인
            _lastRootRaw = rawNext;
            const seq = ++_rootSnapSeq;
            const next = (rawNext.rootSplit || rawNext.rootShards || Object.keys(_bldgDocs).length)
                ? await expandRootDocData(db.collection('safety_app').doc(docId), rawNext)
                : rawNext;
            if (seq !== _rootSnapSeq) return;
            if (doc && doc.metadata && doc.metadata.hasPendingWrites) {
                _lastRootSnapshotData = next;
                _lastRootSnapshotFromServer = false;   // 내 미전송 쓰기가 섞인 모습 — 서버 기준 아님
                return;
            }
            const leaseOnly = isOnlySyncLeaseChange(_lastRootSnapshotData, next);
            _lastRootSnapshotData = next;
            _lastRootSnapshotFromServer = !(doc && doc.metadata && doc.metadata.fromCache);
            if (leaseOnly) return;
            await applyCombinedSnapshot();
        }, onListenerErr);

        listenBuildingMetaDocs(docId);
        subscribeCurrentFloorSync();
    }

    // ==========================================================================
    // 🔐 COMPANY AUTH & APPROVAL ENGINE (대표 승인제 회사별 로그인)
    // ==========================================================================

    function getCompanyDocId() {
        return window.state.companyId;
    }

    function generateJoinCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I 등 혼동되는 문자 제외
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    async function generateUniqueJoinCode() {
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = generateJoinCode();
            const doc = await db.collection('joinCodes').doc(code).get();
            if (!doc.exists) return code;
        }
        return generateJoinCode() + Date.now().toString(36).slice(-2).toUpperCase();
    }

    let _joinCodesDirectoryCache = null;
    let _joinCodesDirectoryCacheAt = 0;
    let _joinCodesDirectoryComplete = false;
    const JOIN_CODES_DIRECTORY_CACHE_MS = 5 * 60 * 1000;
    let _selectedJoinCompany = null;
    let _companyJoinSearchTimer = null;

    function escapeCompanyJoinHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatCompanyJoinLabel(company) {
        if (!company) return '';
        const name = escapeCompanyJoinHtml(company.companyName || '회사');
        const code = escapeCompanyJoinHtml(company.joinCode || '');
        return `${name} <span class="company-join-search-code">${code}</span>`;
    }

    // joinCodes 전체 list 는 회사가 늘수록 검색 1회당 읽기가 비례해서 커진다.
    //
    // 다만 회사가 적을 때는 "5분 캐시된 전체 목록"이 오히려 가장 싸다.
    // (키를 칠 때마다 서버 prefix 쿼리를 던지면 20건 × 글자수가 되어 더 비싸다)
    // 그래서 목록을 상한까지만 받고, 상한에 걸리지 않았으면(= 목록이 완전하면)
    // 예전처럼 캐시로 부분일치하고, 상한에 걸렸을 때만 서버 prefix 쿼리로 넘어간다.
    // 6자리 식별코드는 어느 경우에도 문서 1건만 읽는다.
    const JOIN_CODES_DIRECTORY_MAX = 50;
    const JOIN_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/; // generateJoinCode 와 같은 문자셋

    function joinCodeRowFromSnap(docSnap) {
        const data = docSnap.data() || {};
        return {
            joinCode: docSnap.id,
            companyId: data.companyId || '',
            companyName: data.companyName || '',
            disabled: data.disabled === true
        };
    }

    /** 검색에 내보일 회사인지 — 지운(비활성) 회사·이름 없는 코드는 숨긴다 */
    function isJoinableCompanyRow(row) {
        return !!(row && row.companyId && row.companyName && !row.disabled);
    }

    /** 검색용 소문자 이름(영문 대소문자 무시). 가입 코드 문서에 companyNameLower로 같이 둔다 */
    function companyNameSearchKey(name) {
        return String(name || '').trim().toLowerCase();
    }

    function sortCompanyRowsByName(rows) {
        return (rows || [])
            .sort((a, b) => String(a.companyName || '').localeCompare(String(b.companyName || ''), 'ko'))
            .slice(0, 20);
    }

    function isJoinDirectoryReadable() {
        // 규칙상 joinCodes 컬렉션 list 는 로그인 사용자만 — 미로그인 호출은
        // permission-denied 가 되므로 아예 시도하지 않는다.
        return !!(db && auth && auth.currentUser);
    }

    async function fetchJoinCodesDirectory(forceRefresh) {
        if (!isJoinDirectoryReadable()) return [];
        const stale = !_joinCodesDirectoryCache || (Date.now() - _joinCodesDirectoryCacheAt) > JOIN_CODES_DIRECTORY_CACHE_MS;
        if (!forceRefresh && !stale) return _joinCodesDirectoryCache;
        const snap = await db.collection('joinCodes').limit(JOIN_CODES_DIRECTORY_MAX).get();
        _joinCodesDirectoryCache = snap.docs
            .map(joinCodeRowFromSnap)
            .filter(isJoinableCompanyRow);
        // 상한만큼 꽉 찼다면 뒤에 더 있을 수 있다 = 이 목록만으로 검색하면 누락된다
        _joinCodesDirectoryComplete = snap.size < JOIN_CODES_DIRECTORY_MAX;
        _joinCodesDirectoryCacheAt = Date.now();
        return _joinCodesDirectoryCache;
    }

    function searchCompaniesInDirectory(query, directory) {
        const q = String(query || '').trim().toLowerCase();
        if (!q || q.length < 1) return [];
        return sortCompanyRowsByName((directory || [])
            .filter((row) => {
                const name = String(row.companyName || '').toLowerCase();
                const code = String(row.joinCode || '').toLowerCase();
                return name.includes(q) || code.includes(q);
            }));
    }

    /** 식별코드 1건만 읽는다 (컬렉션 list 없음 — 미로그인도 규칙상 허용). */
    async function lookupCompanyByJoinCode(code) {
        if (!db) return [];
        const snap = await db.collection('joinCodes').doc(code).get();
        if (!snap.exists) return [];
        const row = joinCodeRowFromSnap(snap);
        return isJoinableCompanyRow(row) ? [row] : [];
    }

    /** 회사명 앞부분 일치 — 서버에서 20건씩만 받는다(단일 필드 자동 색인, 복합 색인 불필요).
     *  ① companyNameLower(소문자) — 대소문자 무시 ② companyName 원문 — 소문자 칸이 없는 예전 코드
     *  ③ 식별코드 앞부분 — 문서 id(대문자) 범위 */
    async function searchCompaniesByNamePrefix(query) {
        if (!isJoinDirectoryReadable()) return [];
        const col = db.collection('joinCodes');
        const lower = companyNameSearchKey(query);
        const upper = String(query || '').trim().toUpperCase();
        const runs = [
            col.orderBy('companyNameLower').startAt(lower).endAt(lower + '\uf8ff').limit(20).get(),
            col.orderBy('companyName').startAt(query).endAt(query + '\uf8ff').limit(20).get()
        ];
        if (/^[A-Z0-9]{1,8}$/.test(upper)) {
            const docId = firebase.firestore.FieldPath.documentId();
            runs.push(col.orderBy(docId).startAt(upper).endAt(upper + '\uf8ff').limit(20).get());
        }
        const snaps = await Promise.allSettled(runs);
        const seen = new Set();
        const out = [];
        snaps.forEach((r) => {
            if (r.status !== 'fulfilled') return;
            r.value.docs.forEach((d) => {
                const row = joinCodeRowFromSnap(d);
                if (!isJoinableCompanyRow(row) || seen.has(row.joinCode)) return;
                seen.add(row.joinCode);
                out.push(row);
            });
        });
        return out;
    }

    async function searchCompaniesForJoin(query) {
        const raw = String(query || '').trim();
        if (!raw || !db) return [];

        // 식별코드: 대소문자·띄어쓰기·하이픈 무시(abc-23x → ABC23X). 6자리 외 예전 긴 코드도 문서 1건으로 먼저 본다.
        const upper = raw.toUpperCase().replace(/[\s-]+/g, '');
        if (JOIN_CODE_PATTERN.test(upper) || /^[A-Z0-9]{6,10}$/.test(upper)) {
            try {
                const hit = await lookupCompanyByJoinCode(upper);
                if (hit.length) return hit;
            } catch (e) {
                console.warn('식별코드 조회 실패:', e);
            }
        }

        // 5분 캐시된 목록. 회사가 상한보다 적으면 이것만으로 부분일치가 완전하다.
        const directory = await fetchJoinCodesDirectory(false);
        const local = searchCompaniesInDirectory(raw, directory);
        if (upper && upper !== raw.toUpperCase()) {
            const seenLocal = new Set(local.map((row) => row.joinCode));
            searchCompaniesInDirectory(upper, directory).forEach((row) => { if (!seenLocal.has(row.joinCode)) local.push(row); });
        }
        if (_joinCodesDirectoryComplete) return local;

        // 목록이 잘렸다 = 회사가 많다. 이때만 서버 prefix 쿼리를 더 던진다.
        try {
            const prefix = await searchCompaniesByNamePrefix(raw);
            if (prefix.length) {
                const seen = new Set(local.map((row) => row.joinCode));
                return sortCompanyRowsByName(
                    local.concat(prefix.filter((row) => !seen.has(row.joinCode)))
                );
            }
        } catch (e) {
            console.warn('회사명 prefix 검색 실패:', e);
        }
        return local;
    }

    function getSelectedJoinCompany() {
        return _selectedJoinCompany;
    }

    function setSelectedJoinCompany(company) {
        _selectedJoinCompany = company || null;
        const selectedBox = document.getElementById('companyJoinSelected');
        const selectedLabel = document.getElementById('companyJoinSelectedLabel');
        const searchInput = document.getElementById('companyJoinSearchInput');
        const resultsBox = document.getElementById('companyJoinSearchResults');
        if (selectedLabel) {
            selectedLabel.innerHTML = _selectedJoinCompany ? formatCompanyJoinLabel(_selectedJoinCompany) : '';
        }
        if (selectedBox) selectedBox.hidden = !_selectedJoinCompany;
        if (searchInput) {
            searchInput.style.display = _selectedJoinCompany ? 'none' : '';
            if (!_selectedJoinCompany) searchInput.value = '';
        }
        if (resultsBox) {
            resultsBox.hidden = true;
            resultsBox.innerHTML = '';
        }
    }

    function clearSelectedJoinCompany() {
        setSelectedJoinCompany(null);
        const searchInput = document.getElementById('companyJoinSearchInput');
        if (searchInput) {
            searchInput.style.display = '';
            searchInput.focus();
        }
    }

    async function renderCompanyJoinSearchResults(query) {
        const resultsBox = document.getElementById('companyJoinSearchResults');
        if (!resultsBox || _selectedJoinCompany) return;
        const q = String(query || '').trim();
        if (!q) {
            resultsBox.hidden = true;
            resultsBox.innerHTML = '';
            return;
        }
        resultsBox.hidden = false;
        resultsBox.innerHTML = '<div class="company-join-search-empty">검색 중...</div>';
        try {
            const matches = await searchCompaniesForJoin(q);
            if (!matches.length) {
                resultsBox.innerHTML = '<div class="company-join-search-empty">일치하는 회사가 없습니다. 이름을 다시 확인해 주세요.</div>';
                return;
            }
            resultsBox.innerHTML = matches.map((row) => `
                <button type="button" class="company-join-search-item" data-company-id="${escapeCompanyJoinHtml(row.companyId)}" data-company-name="${escapeCompanyJoinHtml(row.companyName)}" data-join-code="${escapeCompanyJoinHtml(row.joinCode)}">
                    <span class="company-join-search-name">${escapeCompanyJoinHtml(row.companyName)}</span>
                    <span class="company-join-search-code">${escapeCompanyJoinHtml(row.joinCode)}</span>
                </button>
            `).join('');
            resultsBox.querySelectorAll('.company-join-search-item').forEach((btn) => {
                btn.addEventListener('click', () => {
                    setSelectedJoinCompany({
                        companyId: btn.dataset.companyId,
                        companyName: btn.dataset.companyName,
                        joinCode: btn.dataset.joinCode
                    });
                    clearCompanyJoinError();
                });
            });
        } catch (err) {
            console.warn('회사 검색 실패:', err);
            resultsBox.innerHTML = '<div class="company-join-search-empty">회사 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>';
        }
    }

    function scheduleCompanyJoinSearch(query) {
        if (_companyJoinSearchTimer) clearTimeout(_companyJoinSearchTimer);
        _companyJoinSearchTimer = setTimeout(() => {
            renderCompanyJoinSearchResults(query).catch(() => {});
        }, 220);
    }

    function resetCompanyJoinSearchUi() {
        clearSelectedJoinCompany();
        const searchInput = document.getElementById('companyJoinSearchInput');
        const resultsBox = document.getElementById('companyJoinSearchResults');
        if (searchInput) {
            searchInput.value = '';
            searchInput.style.display = '';
        }
        if (resultsBox) {
            resultsBox.hidden = true;
            resultsBox.innerHTML = '';
        }
    }

    /* 2026-10-14 아이디 가입(이메일 없이): 아이디 → 가짜 주소 <아이디>@bsa-id.local 로 Firebase 계정을 만든다.
     * '@'가 있으면 예전처럼 이메일 계정(기존 계정은 그대로). 가짜 주소로는 메일이 가지 않는다(.local = 배달 안 되는 주소). */
    const BSA_ID_EMAIL_DOMAIN = 'bsa-id.local';
    const BSA_LOGIN_ID_RE = /^[a-z][a-z0-9]{3,19}$/;
    function bsaLoginIdFromEmail(email) {
        const e = String(email || '').trim().toLowerCase();
        const suf = '@' + BSA_ID_EMAIL_DOMAIN;
        return e.endsWith(suf) ? e.slice(0, -suf.length) : '';
    }
    /** 로그인·가입 칸 → { email, loginId } 또는 { error } */
    function bsaParseLoginInput(raw) {
        const v = String(raw || '').trim();
        if (!v) return { error: '아이디(또는 이메일)를 입력해 주세요.' };
        if (v.includes('@')) return { email: v, loginId: bsaLoginIdFromEmail(v) };
        const id = v.toLowerCase();
        if (!BSA_LOGIN_ID_RE.test(id)) return { error: '아이디는 영문으로 시작하는 영문·숫자 4~20자로 입력해 주세요. (예: hong1234)' };
        return { email: id + '@' + BSA_ID_EMAIL_DOMAIN, loginId: id };
    }
    /** 화면 표시용: 아이디 계정은 아이디, 이메일 계정은 이메일 그대로 */
    function bsaAccountLabel(email, loginId) {
        return loginId || bsaLoginIdFromEmail(email) || email || '';
    }
    window.BSA_ID_EMAIL_DOMAIN = BSA_ID_EMAIL_DOMAIN;
    window.bsaParseLoginInput = bsaParseLoginInput;
    window.bsaAccountLabel = bsaAccountLabel;
    let _bsaAuthAttemptIsId = false;

    function showAuthError(err) {
        const box = document.getElementById('authErrorMsg');
        if (!box) return;
        const map = {
            'auth/email-already-in-use': _bsaAuthAttemptIsId ? '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.' : '이미 가입된 이메일입니다. 로그인을 이용해 주세요.',
            'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
            'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
            'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
            'auth/user-not-found': _bsaAuthAttemptIsId ? '가입되지 않은 아이디입니다.' : '가입되지 않은 이메일입니다.',
            'auth/invalid-credential': _bsaAuthAttemptIsId ? '아이디 또는 비밀번호가 올바르지 않습니다.' : '이메일 또는 비밀번호가 올바르지 않습니다.',
            'auth/invalid-login-credentials': '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.',
            'auth/too-many-requests': '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.'
        };
        const code = err && err.code;
        box.textContent = (code && map[code]) ? map[code] : ((err && err.message) || '오류가 발생했습니다. 다시 시도해 주세요.');
        box.style.display = 'block';
    }

    function setHeroAccountBarVisible(visible) {
        const bar = document.getElementById('heroAccountBar');
        if (bar) bar.hidden = !visible;
    }

    function clearAuthError() {
        const box = document.getElementById('authErrorMsg');
        if (box) { box.style.display = 'none'; box.textContent = ''; }
    }

    function showLoginOverlay() {
        setAuthGateActive(true);
        const overlay = document.getElementById('loginOverlay');
        const loginCard = overlay ? overlay.querySelector('.modal-card') : null;
        const pendingCard = document.getElementById('pendingApprovalCard');
        const companyJoinCard = document.getElementById('companyJoinCard');
        if (overlay) overlay.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; visibility: visible !important; z-index: 9999;';
        if (loginCard) loginCard.style.display = 'flex';
        if (pendingCard) pendingCard.style.display = 'none';
        if (companyJoinCard) companyJoinCard.style.display = 'none';
        const headerProfile = document.getElementById('headerUserProfileGroup');
        if (headerProfile) headerProfile.style.display = 'none';
        setHeroAccountBarVisible(false);
        clearAuthError();
        clearCompanyJoinError();
        syncAutoLoginButtons();
    }

    function clearCompanyJoinError() {
        const box = document.getElementById('companyJoinErrorMsg');
        if (box) { box.style.display = 'none'; box.textContent = ''; }
    }

    function showCompanyJoinError(message) {
        const box = document.getElementById('companyJoinErrorMsg');
        if (!box) return;
        box.textContent = message || '오류가 발생했습니다.';
        box.style.display = 'block';
    }

    function showCompanyJoinOverlay(hintMessage) {
        setAuthGateActive(true);
        const overlay = document.getElementById('loginOverlay');
        const loginCard = overlay ? overlay.querySelector('.modal-card') : null;
        const pendingCard = document.getElementById('pendingApprovalCard');
        const companyJoinCard = document.getElementById('companyJoinCard');
        if (overlay) overlay.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; visibility: visible !important; z-index: 9999;';
        if (loginCard) loginCard.style.display = 'none';
        if (pendingCard) pendingCard.style.display = 'none';
        if (companyJoinCard) companyJoinCard.style.display = 'block';
        const hint = document.getElementById('companyJoinHint');
        if (hint) {
            hint.innerHTML = hintMessage || (
                '소속할 <strong>회사명을 검색</strong>해 선택한 뒤 가입을 신청하세요.<br>'
                + '이름이 같은 회사는 <strong>식별코드</strong>로 구분합니다. 승인 전까지는 점검 기능을 사용할 수 없습니다.'
            );
        }
        resetCompanyJoinSearchUi();
        clearCompanyJoinError();
        const headerProfile = document.getElementById('headerUserProfileGroup');
        if (headerProfile) headerProfile.style.display = 'none';
        setHeroAccountBarVisible(false);
    }

    function showPendingApproval(companyName) {
        setAuthGateActive(true);
        const overlay = document.getElementById('loginOverlay');
        const loginCard = overlay ? overlay.querySelector('.modal-card') : null;
        const pendingCard = document.getElementById('pendingApprovalCard');
        const companyJoinCard = document.getElementById('companyJoinCard');
        if (overlay) overlay.style.cssText = 'display: flex !important; opacity: 1 !important; pointer-events: auto !important; visibility: visible !important; z-index: 9999;';
        if (loginCard) loginCard.style.display = 'none';
        if (pendingCard) pendingCard.style.display = 'block';
        if (companyJoinCard) companyJoinCard.style.display = 'none';
        const lbl = document.getElementById('pendingCompanyName');
        if (lbl) lbl.textContent = companyName || '회사';
        const headerProfile = document.getElementById('headerUserProfileGroup');
        if (headerProfile) headerProfile.style.display = 'none';
        setHeroAccountBarVisible(false);
    }

    function hideAuthOverlay() {
        setAuthGateActive(false);
        const overlay = document.getElementById('loginOverlay');
        if (overlay) {
            overlay.style.cssText = 'display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important;';
            overlay.classList.remove('open');
        }
        try { document.activeElement?.blur?.(); } catch (_e) { /* ignore */ }
        if (window.BSA?.mobileKeyboard?.reset) window.BSA.mobileKeyboard.reset();
        if (typeof window.resetLoadingOverlay === 'function') window.resetLoadingOverlay();
        else if (typeof window.hideLoading === 'function') window.hideLoading();
        clearBuildingSearchAutofill();
        scheduleBuildingSearchAutofillCleanup();
    }

    /** 로그인 이메일이 현장 검색칸에 박히는지 판별 (@ 포함 또는 저장된 이메일과 동일). */
    function isBuildingSearchAutofillSpam(value) {
        const v = (value || '').trim();
        if (!v) return false;
        if (v.includes('@')) return true;
        const loginEmail = (document.getElementById('authEmail')?.value || '').trim().toLowerCase();
        if (loginEmail && v.toLowerCase() === loginEmail) return true;
        const sessionEmail = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser?.email || '').toLowerCase();
        if (sessionEmail && v.toLowerCase() === sessionEmail) return true;
        return false;
    }

    /** readonly → 첫 포커스 시 해제: 페이지 로드·로그인 직후 자동완성 주입을 막는다. */
    function armBuildingSearchAntiAutofill(el) {
        if (!el || el.dataset.bsaSearchArmed === '1') return;
        el.dataset.bsaSearchArmed = '1';
        const unlock = () => {
            if (el.readOnly) el.readOnly = false;
        };
        el.readOnly = true;
        el.addEventListener('focus', unlock, { once: false });
        el.addEventListener('pointerdown', unlock, { once: false });
        el.addEventListener('touchstart', unlock, { once: false, passive: true });
    }

    /** 브라우저 자동완성이 로그인 이메일을 현장 검색칸에 채우는 경우를 지운다. */
    function clearBuildingSearchAutofill() {
        const el = document.getElementById('buildingSearchInput');
        if (!el) return;
        if (!isBuildingSearchAutofillSpam(el.value)) return;
        el.value = '';
        window.state.buildingSearchTerm = '';
        armBuildingSearchAntiAutofill(el);
    }

    /** WebView는 로그인 직후 늦게 자동완성을 넣는 경우가 있어 여러 시점에 재확인한다. */
    function scheduleBuildingSearchAutofillCleanup() {
        [0, 120, 400, 1000, 2500].forEach((ms) => {
            setTimeout(clearBuildingSearchAutofill, ms);
        });
    }

    // ------------------------------------------------------------------
    // Auth custom claims (회사 소속) — 규칙 exists() 과금 제거용
    //
    // firestore.rules / storage.rules 는 token.companyId 를 먼저 보고, 맞으면
    // members 문서 exists() 를 타지 않는다. 클레임이 없으면 예전처럼 exists()로
    // 폴백하므로 아래가 실패해도 앱은 그대로 동작한다(읽기만 안 줄어듦).
    //
    // 클레임을 심는 쪽은 functions/index.js (Admin SDK). 새 승인·탈퇴는
    // members 문서 트리거가 자동 처리하고, 이미 멤버인 기존 계정만 여기서 한 번
    // 맞춰준다.
    // ------------------------------------------------------------------
    // ⚠️ 6번(클레임)은 보류 중이라 꺼져 있다.
    // functions/ 를 `firebase deploy --only functions` 로 올린 뒤 이 값을 true 로 바꾸면
    // 그때부터 규칙이 exists() 대신 토큰을 보게 되어 읽기가 줄어든다.
    // 켜기 전에 확인할 것: 멤버를 추방해도 그 사람 토큰이 만료될 때까지(최대 1시간)
    // 접근이 남는다. 즉시 차단이 필요하면 6번을 아예 쓰지 않는 게 맞다.
    // 규칙(firestore.rules/storage.rules)은 이미 게시됐지만 클레임 없는 토큰은
    // exists() 폴백으로 흐르므로, 꺼져 있어도 동작에 문제가 없다.
    const ENABLE_COMPANY_AUTH_CLAIMS = false;
    const CLAIMS_FUNCTION_REGION = 'us-central1';
    const CLAIMS_SYNC_TIMEOUT_MS = 6000;
    let _claimsSyncAttempted = null; // `${uid}:${companyId}` — 세션당 1회만 시도

    function companyClaimsAlreadyMatch(claims, companyId, role) {
        if (!claims || !companyId) return false;
        if (claims.companyId !== companyId) return false;
        // role 은 admin 판정에만 쓰이므로 member/admin 이 정확히 일치해야 한다
        return (claims.role || 'member') === (role || 'member');
    }

    async function ensureCompanyAuthClaims(uid, companyId, role) {
        if (!ENABLE_COMPANY_AUTH_CLAIMS) return;
        if (!auth || !auth.currentUser || !companyId) return;

        let claims = null;
        try {
            const tokenResult = await auth.currentUser.getIdTokenResult();
            claims = (tokenResult && tokenResult.claims) || null;
        } catch (e) {
            return; // 토큰을 못 읽으면 폴백 규칙으로 계속 간다
        }
        // 이미 맞으면 네트워크 호출 0회
        if (companyClaimsAlreadyMatch(claims, companyId, role)) return;

        // 함수가 아직 배포되지 않았을 수 있다. 로그인이 매번 6초씩 늦어지지 않게
        // 같은 계정·회사 조합은 세션당 한 번만 시도한다.
        const attemptKey = `${uid}:${companyId}`;
        if (_claimsSyncAttempted === attemptKey) return;
        _claimsSyncAttempted = attemptKey;

        const projectId = (firebase.app().options || {}).projectId;
        if (!projectId) return;

        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), CLAIMS_SYNC_TIMEOUT_MS) : null;
        try {
            const idToken = await auth.currentUser.getIdToken();
            const url = `https://${CLAIMS_FUNCTION_REGION}-${projectId}.cloudfunctions.net/syncCompanyClaims`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
                signal: controller ? controller.signal : undefined
            });
            if (!resp.ok) return;
            const body = await resp.json();
            if (!body || !body.ok) return;
            // 여기까지 왔다는 건 현재 토큰에 클레임이 없거나 달랐다는 뜻이므로,
            // 서버가 새로 심었든(changed) 이미 있었든(오래된 토큰) 재발급이 필요하다.
            await auth.currentUser.getIdToken(true);
        } catch (e) {
            // 미배포·오프라인·타임아웃 — exists() 폴백으로 정상 동작한다
            console.warn('회사 클레임 동기화 생략:', e && e.name ? e.name : e);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** 화면·상태에 회사 이름을 반영한다(상단 표시, 점검 수행회사명 칸, 보고서용 값). */
    function applyCompanyNameLocally(name) {
        const next = String(name == null ? '' : name).trim();
        if (!next) return;
        window.state.companyName = next;
        try { localStorage.setItem('building_company_name', next); } catch (_e) { /* ignore */ }
        const lblCompany = document.getElementById('lblUserCompany');
        if (lblCompany) lblCompany.textContent = next;
        const inputHomeCompany = document.getElementById('inputHomeCompanyName');
        if (inputHomeCompany) inputHomeCompany.value = next;
    }

    /**
     * 회사 정보의 이름을 기준으로 화면을 맞추고, 본인 사용자 정보가 옛 이름이면 고쳐 둔다.
     * 본인 문서의 companyName은 보안 규칙상 본인이 고칠 수 있다(membershipFieldsOnly).
     */
    function applyCompanyNameFromCompanyDoc(profile, companyDocName) {
        const next = String(companyDocName == null ? '' : companyDocName).trim();
        if (!next || !profile) return;
        // 읽는 사이 회사를 나갔거나 바꿨으면 손대지 않는다
        if (window.state.companyId !== profile.companyId || window.state.uid !== profile.uid) return;
        if (next !== String(window.state.companyName || '').trim()) applyCompanyNameLocally(next);
        const stored = String(profile.companyName == null ? '' : profile.companyName).trim();
        if (stored !== next && db && auth && auth.currentUser && auth.currentUser.uid === profile.uid) {
            db.collection('users').doc(profile.uid).update({ companyName: next })
                .catch((e) => console.warn('사용자 정보의 회사 이름 갱신 실패(다음 로그인 때 다시 시도):', e));
        }
    }

    /** 관리자 전용 「회사 이름」 버튼 — index.html은 건드리지 않고 가입 승인 버튼 옆에 만든다. */
    function setCompanyRenameButtonVisible(show) {
        let btn = document.getElementById('btnRenameCompany');
        if (!btn) {
            const approval = document.getElementById('btnOpenMemberApproval');
            const host = approval && approval.parentNode;
            if (!host) return;
            btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btnRenameCompany';
            btn.className = 'btn btn-sm btn-outline hero-btn-rename-company';
            btn.title = '회사 이름 바꾸기 (관리자)';
            btn.innerHTML = '<i class="fa-solid fa-pen"></i> 회사 이름';
            btn.addEventListener('click', () => { window.renameCompanyAsAdmin(); });
            host.insertBefore(btn, approval.nextSibling);
        }
        btn.style.display = show ? 'inline-flex' : 'none';
        // 관리자 전용 「사진 되살리기」 — 누르기 전에는 아무것도 안 한다(2026-09-30)
        let rbtn = document.getElementById('btnAdminPhotoRestore');
        if (!rbtn && btn.parentNode) {
            rbtn = document.createElement('button');
            rbtn.type = 'button';
            rbtn.id = 'btnAdminPhotoRestore';
            rbtn.className = 'btn btn-sm btn-outline hero-btn-photo-restore';
            rbtn.title = '복구 묶음으로 지워진 사진 되살리기 (관리자)';
            rbtn.innerHTML = '<i class="fa-solid fa-images"></i> 사진 되살리기';
            rbtn.addEventListener('click', () => { window.openAdminPhotoRestore(); });
            btn.parentNode.insertBefore(rbtn, btn.nextSibling);
        }
        if (rbtn) rbtn.style.display = show ? 'inline-flex' : 'none';
        // 관리자 전용 「회사 삭제」(비활성) / 비활성일 때 「회사 복구」
        let dbtn = document.getElementById('btnDisableCompany');
        if (!dbtn && btn.parentNode) {
            dbtn = document.createElement('button');
            dbtn.type = 'button';
            dbtn.id = 'btnDisableCompany';
            dbtn.className = 'btn btn-sm btn-outline hero-btn-disable-company';
            dbtn.addEventListener('click', () => {
                if (window.state.companyDisabled) window.restoreCompanyAsAdmin(); else window.disableCompanyAsAdmin();
            });
            btn.parentNode.insertBefore(dbtn, btn.nextSibling);
        }
        if (dbtn) {
            const off = !!window.state.companyDisabled;
            dbtn.innerHTML = off ? '<i class="fa-solid fa-rotate-left"></i> 회사 복구' : '<i class="fa-solid fa-trash"></i> 회사 삭제';
            dbtn.title = off ? '삭제(비활성)한 회사를 되살리기 (관리자)' : '회사 삭제 — 가입 검색에서 숨김, 데이터는 보존 (관리자)';
            dbtn.style.borderColor = off ? '#059669' : '#ef4444';
            dbtn.style.color = off ? '#059669' : '#ef4444';
            dbtn.style.display = show ? 'inline-flex' : 'none';
        }
    }

    /**
     * 관리자가 회사 이름을 바꾼다. 점검 데이터는 회사 고유 번호(companyId)로 연결돼 있어
     * 이름을 바꿔도 끊기지 않는다. 회사 정보(companies)의 이름을 바꾸면 다른 직원은 다음
     * 로그인 때 applyCompanyNameFromCompanyDoc가 새 이름으로 맞춘다.
     * 가입 코드(joinCodes)의 이름은 보안 규칙상 앱에서 못 바꾼다(Firebase 콘솔에서 수정).
     */
    /**
     * 관리자 전용 1회용 「사진 되살리기」 (2026-09-30 영일연립 전차 사진 복구)
     * 복구 묶음(zip, 사진 이름 = {층}_NO{번호}_{사진번호}.jpg)을 고르면 먼저 미리보기만 한다
     * (서버는 읽기만). 「되살리기 시작」을 누르고 확인해야 올린다.
     * 올리는 것: 이 기기의 결함이 아직 가리키는데 서버에 사진이 없는 사진번호만 — 같은 번호로 다시 올린다.
     * 결함 기록은 바꾸지 않는다. 서버에 이미 있는 사진은 건드리지 않는다.
     */
    function findDefectRefsForPhotoId(photoId) {
        const refs = [];
        const defects = (window.state && window.state.defects) || {};
        const buildings = (window.state && window.state.buildings) || [];
        Object.keys(defects).forEach((k) => {
            (defects[k] || []).forEach((e) => {
                if (!e) return;
                const nCur = Math.max((e.photoIds || []).length, (e.photos || []).length);
                const nPrev = Math.max((e.prevRoundPhotoIds || []).length, (e.prevRoundPhotos || []).length);
                const hit = defectPhotoIdList(e, nCur).indexOf(photoId) >= 0 || defectPhotoIdList(e, nPrev, 'prev').indexOf(photoId) >= 0;
                if (!hit) return;
                const b = buildings.find((x) => x && x.id && k.startsWith(x.id + '_')) || null;
                refs.push({
                    floorKey: k,
                    bldg: b,
                    round: b ? getBuildingSurveyRoundKey(b) : '',
                    floor: b ? k.slice(b.id.length + 1) : k
                });
            });
        });
        // 가장 이른 회차(원래 주인)를 앞에
        refs.sort((a, b) => String(a.round).localeCompare(String(b.round)));
        return refs;
    }

    var _photoRestoreScopeOverride = new Map(); // var: 위쪽 storageScopeForPhotoId가 먼저 불려도 안전

    function parseRestorePhotoName(name) {
        const base = String(name || '').split('/').pop();
        const m = base.match(/^(.+?)_NO(\d+)_(.+)\.jpe?g$/i);
        if (!m) return null;
        return { floor: m[1], no: m[2], photoId: m[3] };
    }

    async function readRestorePhotoFiles(files) {
        const out = [];
        const toDataUrl = (b64) => 'data:image/jpeg;base64,' + b64;
        for (const f of files) {
            if (/\.zip$/i.test(f.name)) {
                if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리를 불러오지 못했습니다.');
                const zip = await JSZip.loadAsync(f);
                const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && parseRestorePhotoName(n));
                for (const n of names) {
                    const info = parseRestorePhotoName(n);
                    info.dataUrl = toDataUrl(await zip.files[n].async('base64'));
                    out.push(info);
                }
            } else {
                const info = parseRestorePhotoName(f.name);
                if (!info) continue;
                info.dataUrl = await new Promise((res, rej) => {
                    const r = new FileReader();
                    r.onload = () => res(String(r.result || ''));
                    r.onerror = () => rej(r.error);
                    r.readAsDataURL(f);
                });
                out.push(info);
            }
        }
        const seen = new Set();
        return out.filter((x) => (x.dataUrl.length > 1000 && !seen.has(x.photoId) && seen.add(x.photoId)));
    }

    /** 미리보기: 서버는 읽기만 */
    async function buildPhotoRestorePreview(items) {
        const companyPhotos = getCompanyPhotosCollection();
        const rows = [];
        for (const it of items) {
            const refs = findDefectRefsForPhotoId(it.photoId);
            const row = Object.assign({}, it, { refs, action: 'skip', reason: '' });
            if (!refs.length) {
                row.reason = '이 기기의 결함이 이 사진을 안 씀';
            } else if (!companyPhotos) {
                row.reason = '로그인·회사 연결 안 됨';
            } else {
                try {
                    const snap = await companyPhotos.doc(it.photoId).get({ source: 'server' });
                    const data = snap.exists ? (snap.data() || {}) : null;
                    if (data && (hasFirebaseStorageMeta(data) || data.dataUrl)) row.reason = '서버에 이미 있음';
                    else { row.action = 'restore'; row.reason = '서버에 없음 → 되살림'; }
                } catch (e) {
                    row.reason = '서버 확인 실패(건너뜀)';
                }
            }
            rows.push(row);
        }
        return rows;
    }

    async function runPhotoRestore(rows, onProgress) {
        let ok = 0; let fail = 0;
        const targets = rows.filter((r) => r.action === 'restore');
        for (let i = 0; i < targets.length; i++) {
            const r = targets[i];
            const owner = r.refs[0] && r.refs[0].bldg;
            if (owner) _photoRestoreScopeOverride.set(r.photoId, storageScopeFromBuilding(owner));
            try {
                unmarkPhotoOnStorage(r.photoId);
                const done = await persistPhotoToCloud(r.photoId, r.dataUrl, {});
                if (done) {
                    ok++;
                    r.result = '되살림';
                    try { await persistPhotoUrlToIdb(r.photoId, r.dataUrl); } catch (_e) { /* 서버엔 올라감 */ }
                } else { fail++; r.result = '실패'; }
            } catch (e) {
                fail++; r.result = '실패';
                console.warn('[사진 되살리기] 실패:', r.photoId, e);
            } finally {
                _photoRestoreScopeOverride.delete(r.photoId);
            }
            if (onProgress) onProgress(i + 1, targets.length);
        }
        return { ok, fail, total: targets.length };
    }

    window.openAdminPhotoRestore = function () {
        if (window.state.role !== 'admin' || !db || !window.state.companyId) {
            window.showToast('사진 되살리기는 관리자만 쓸 수 있습니다.', 'warning');
            return;
        }
        const old = document.getElementById('adminPhotoRestoreOverlay');
        if (old) old.remove();
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const ov = document.createElement('div');
        ov.id = 'adminPhotoRestoreOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:12px;';
        ov.innerHTML = '<div style="background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.3);">'
            + '<div style="padding:14px 16px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:16px;">사진 되살리기 (관리자·1회용)</div>'
            + '<div style="padding:12px 16px;font-size:13px;color:#334155;line-height:1.55;">복구 묶음(zip)이나 사진 파일을 고르세요. 먼저 <b>미리보기만</b> 합니다(서버는 읽기만).<br>'
            + '결함이 아직 가리키는데 <b>서버에 없는 사진만</b> 같은 사진번호로 다시 올립니다. 결함 기록·서버에 있는 사진은 바꾸지 않습니다.</div>'
            + '<div style="padding:0 16px 10px;"><input type="file" id="adminPhotoRestoreFile" accept=".zip,.jpg,.jpeg" multiple></div>'
            + '<div id="adminPhotoRestoreSummary" style="padding:0 16px 8px;font-size:13px;font-weight:600;"></div>'
            + '<div id="adminPhotoRestoreList" style="flex:1;overflow:auto;padding:0 16px;font-size:12px;"></div>'
            + '<div style="padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;">'
            + '<button type="button" class="btn btn-outline" id="adminPhotoRestoreClose">닫기</button>'
            + '<button type="button" class="btn btn-primary" id="adminPhotoRestoreGo" disabled>되살리기 시작</button></div></div>';
        document.body.appendChild(ov);
        const $ = (id) => document.getElementById(id);
        let rows = [];
        let busy = false;
        const render = () => {
            const n = rows.filter((r) => r.action === 'restore').length;
            $('adminPhotoRestoreSummary').textContent = rows.length
                ? `사진 ${rows.length}장 중 되살릴 사진 ${n}장 · 건너뜀 ${rows.length - n}장` : '';
            $('adminPhotoRestoreList').innerHTML = rows.length ? ('<table style="width:100%;border-collapse:collapse;">'
                + '<tr style="background:#f1f5f9;"><th style="text-align:left;padding:4px;">층·NO</th><th style="text-align:left;padding:4px;">사진번호</th><th style="text-align:left;padding:4px;">쓰는 점검</th><th style="text-align:left;padding:4px;">할 일</th></tr>'
                + rows.map((r) => {
                    const where = r.refs.map((x) => esc((x.bldg && x.bldg.name) || '') + ' ' + esc(x.round) + ' ' + esc(x.floor)).join('<br>') || '-';
                    const color = r.result === '실패' ? '#dc2626' : (r.action === 'restore' ? '#15803d' : '#64748b');
                    return `<tr style="border-top:1px solid #e2e8f0;"><td style="padding:4px;">${esc(r.floor)} NO.${esc(r.no)}</td><td style="padding:4px;">${esc(r.photoId)}</td><td style="padding:4px;">${where}</td><td style="padding:4px;color:${color};">${esc(r.result || r.reason)}</td></tr>`;
                }).join('') + '</table>') : '';
            $('adminPhotoRestoreGo').disabled = busy || !n;
        };
        $('adminPhotoRestoreClose').onclick = () => { if (!busy) ov.remove(); };
        $('adminPhotoRestoreFile').onchange = async (ev) => {
            const files = Array.from((ev.target && ev.target.files) || []);
            if (!files.length) return;
            busy = true; rows = []; render();
            $('adminPhotoRestoreSummary').textContent = '미리보기 만드는 중… (서버는 읽기만)';
            try {
                const items = await readRestorePhotoFiles(files);
                rows = await buildPhotoRestorePreview(items);
                if (!rows.length) $('adminPhotoRestoreSummary').textContent = '알맞은 사진 파일이 없습니다({층}_NO{번호}_{사진번호}.jpg).';
            } catch (e) {
                console.warn('[사진 되살리기] 미리보기 실패:', e);
                window.showToast('미리보기 실패: ' + (e && e.message ? e.message : e), 'error');
            }
            busy = false;
            if (rows.length) render();
        };
        $('adminPhotoRestoreGo').onclick = async () => {
            const n = rows.filter((r) => r.action === 'restore').length;
            if (!n || busy) return;
            const yes = await window.appConfirm(`서버에 없는 사진 ${n}장을 원래 사진번호로 다시 올립니다.\n결함 기록은 바꾸지 않습니다. 진행할까요?`, { title: '사진 되살리기', okText: '되살리기' });
            if (!yes) return;
            busy = true; render();
            const res = await runPhotoRestore(rows, (i, t) => { $('adminPhotoRestoreSummary').textContent = `올리는 중… ${i}/${t}`; });
            busy = false;
            rows.forEach((r) => { if (r.result === '되살림') r.action = 'done'; });
            render();
            $('adminPhotoRestoreSummary').textContent = `끝: 되살림 ${res.ok}장 · 실패 ${res.fail}장`;
            window.showToast(`사진 되살리기: ${res.ok}장 완료${res.fail ? `, ${res.fail}장 실패` : ''}`, res.fail ? 'warning' : 'success', 6000);
        };
    };

    /**
     * 회사 이름 바꾸기 — 고유 번호(companyId)·식별코드는 그대로, 이름이 복사된 곳을 모두 고친다.
     *  companies/{id}.name · joinCodes/{code}.companyName(+Lower, 가입 검색) · 직원 users.companyName ·
     *  가입 대기자 users.pendingCompanyName · 내 users.companyName
     * 가입 코드 고치기는 firestore.rules(2026-10-14) 배포가 필요 — 안 됐으면 알려 준다.
     */
    async function renameCompanyEverywhere(companyId, next) {
        const companyRef = db.collection('companies').doc(companyId);
        const companyDoc = await companyRef.get();
        const joinCode = (companyDoc.exists && companyDoc.data().joinCode) || window.state.companyJoinCode || '';
        let joinCodeFailed = false;
        await companyRef.update({ name: next, nameLower: companyNameSearchKey(next), renamedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await db.collection('users').doc(window.state.uid).update({ companyName: next });
        if (joinCode) {
            try {
                await db.collection('joinCodes').doc(joinCode).update({ companyName: next, companyNameLower: companyNameSearchKey(next) });
            } catch (e) {
                // 보안 규칙(2026-10-14 joinCodes 수정 허용)이 아직 게시 안 됐으면 여기서 막힌다 — 회사 이름은 이미 바뀜
                console.error('가입 코드 이름 변경 실패:', e);
                joinCodeFailed = true;
            }
        }
        _joinCodesDirectoryCache = null;
        _joinCodesDirectoryComplete = false;
        let failed = 0;
        const myUid = window.state.uid;
        const [members, pending] = await Promise.all([
            companyRef.collection('members').get().catch(() => null),
            companyRef.collection('pendingRequests').get().catch(() => null)
        ]);
        const jobs = [];
        (members ? members.docs : []).forEach((d) => {
            if (d.id === myUid) return;
            jobs.push(db.collection('users').doc(d.id).update({ companyName: next }).catch(() => { failed++; }));
        });
        (pending ? pending.docs : []).forEach((d) => {
            jobs.push(db.collection('users').doc(d.id).update({ pendingCompanyName: next }).catch(() => { failed++; }));
        });
        await Promise.all(jobs);
        return { failed, joinCodeFailed };
    }

    /**
     * 회사 지우기(관리자) — 되돌릴 수 있는 「비활성」으로 처리한다. 점검 데이터(safety_app)·직원 정보는 지우지 않는다.
     * 가입 검색에서 숨기고 새 가입 신청을 막는다(규칙). 직원 로그인은 막지 않고 안내만 띄운다.
     * 확인: 회사 이름을 그대로 쳐야 한다.
     */
    window.disableCompanyAsAdmin = async function () {
        if (window.state.role !== 'admin' || !db || !window.state.companyId) {
            window.showToast('회사 삭제는 관리자만 할 수 있습니다.', 'warning');
            return;
        }
        const cur = String(window.state.companyName || '').trim();
        const typed = await window.appPrompt(`회사를 삭제(비활성)합니다.\n\n· 가입 검색에서 사라지고 새 가입 신청을 받지 않습니다.\n· 점검 데이터와 직원은 지우지 않습니다(관리자가 「회사 복구」로 되돌릴 수 있음).\n\n확인을 위해 회사 이름「${cur}」을 똑같이 입력하세요.`, '');
        if (typed == null) return;
        if (typed.trim() !== cur || !cur) {
            window.showToast('회사 이름이 맞지 않아 삭제하지 않았습니다.', 'warning');
            return;
        }
        if (!await window.appConfirm(`정말「${cur}」을(를) 삭제(비활성)할까요?`, { title: '회사 삭제', okText: '삭제' })) return;
        window.showLoading('회사를 비활성으로 바꾸는 중입니다...');
        try {
            await setCompanyDisabled(window.state.companyId, true);
            window.state.companyDisabled = true;
            setCompanyRenameButtonVisible(true);
            window.showToast(`「${cur}」을(를) 삭제(비활성)했습니다. 가입 검색에서 보이지 않습니다.`, 'success', 7000);
        } catch (e) {
            console.error('회사 비활성 실패:', e);
            window.showToast('회사를 삭제하지 못했습니다: ' + (e && e.message ? e.message : e), 'error', 7000);
        } finally {
            window.hideLoading();
        }
    };

    window.restoreCompanyAsAdmin = async function () {
        if (window.state.role !== 'admin' || !db || !window.state.companyId) return;
        if (!await window.appConfirm('회사를 다시 살립니다. 가입 검색에 다시 보이고 가입 신청을 받습니다.', { title: '회사 복구', okText: '복구' })) return;
        try {
            await setCompanyDisabled(window.state.companyId, false);
            window.state.companyDisabled = false;
            setCompanyRenameButtonVisible(true);
            window.showToast('회사를 복구했습니다.', 'success');
        } catch (e) {
            window.showToast('복구하지 못했습니다: ' + (e && e.message ? e.message : e), 'error', 7000);
        }
    };

    async function setCompanyDisabled(companyId, disabled) {
        const companyRef = db.collection('companies').doc(companyId);
        const doc = await companyRef.get();
        const joinCode = (doc.exists && doc.data().joinCode) || window.state.companyJoinCode || '';
        const stamp = disabled ? firebase.firestore.FieldValue.serverTimestamp() : null;
        // 가입 코드부터 — 규칙이 아직 옛것이라 여기서 막히면 회사 문서도 안 바꾼다(반쯤 지워진 상태 방지)
        if (joinCode) {
            try { await db.collection('joinCodes').doc(joinCode).update({ disabled: !!disabled, disabledAt: stamp }); }
            catch (e) {
                console.error('가입 코드 비활성 표시 실패:', e);
                throw new Error('가입 검색에서 숨기지 못해 아무것도 바꾸지 않았습니다(서버 보안 규칙 게시 필요).');
            }
        }
        await companyRef.update({ disabled: !!disabled, disabledAt: stamp, disabledBy: disabled ? window.state.uid : null });
        _joinCodesDirectoryCache = null;
        _joinCodesDirectoryComplete = false;
    }

    /** 관리자 지정/해제. 마지막 관리자는 해제 못 함(앱 + 규칙: 본인 해제 금지). */
    window.setMemberRole = async function (uid, role) {
        if (!db || !window.state.companyId || window.state.role !== 'admin') return;
        if (role !== 'admin' && role !== 'member') return;
        try {
            const companyRef = db.collection('companies').doc(window.state.companyId);
            const membersSnap = await companyRef.collection('members').get();
            const target = membersSnap.docs.find((d) => d.id === uid);
            if (!target) { window.showToast('이미 나간 팀원입니다.', 'warning'); await renderMemberApprovalLists(); return; }
            const d = target.data() || {};
            if ((d.role || 'member') === role) { await renderMemberApprovalLists(); return; }
            if (role === 'member') {
                const admins = membersSnap.docs.filter((x) => (x.data() || {}).role === 'admin');
                if (admins.length <= 1) { window.showToast('마지막 관리자는 해제할 수 없습니다. 먼저 다른 관리자를 지정하세요.', 'warning', 6000); return; }
                if (uid === window.state.uid) { window.showToast('내 관리자 권한은 다른 관리자가 해제해야 합니다.', 'warning', 6000); return; }
            }
            const nm = d.name || '팀원';
            const ok = await window.appConfirm(role === 'admin'
                ? `'${nm}'님을 관리자로 지정할까요?\n관리자는 가입 승인·팀원 관리·회사 이름/삭제를 할 수 있습니다.`
                : `'${nm}'님의 관리자 권한을 해제할까요?`, { title: role === 'admin' ? '관리자 지정' : '관리자 해제', okText: role === 'admin' ? '지정' : '해제' });
            if (!ok) return;
            await companyRef.collection('members').doc(uid).update({ role, roleChangedAt: firebase.firestore.FieldValue.serverTimestamp(), roleChangedBy: window.state.uid });
            // 사용자 정보의 role도 맞춘다(권한 토큰은 members 쓰기 트리거가 바꾼다)
            await db.collection('users').doc(uid).update({ role }).catch((e) => console.warn('사용자 정보 role 갱신 실패(다음 로그인 때 맞춰짐):', e));
            await renderMemberApprovalLists();
            window.showToast(role === 'admin' ? `'${nm}'님을 관리자로 지정했습니다.` : `'${nm}'님의 관리자 권한을 해제했습니다.`, 'success');
        } catch (e) {
            console.error('관리자 지정/해제 오류:', e);
            window.showToast('처리 중 오류가 발생했습니다: ' + (e && e.message ? e.message : e), 'error', 6000);
        }
    };

    window.renameCompanyAsAdmin = async function () {
        if (window.state.role !== 'admin' || !db || !window.state.companyId || !window.state.uid) {
            window.showToast('회사 이름은 관리자만 바꿀 수 있습니다.', 'warning');
            return;
        }
        const cur = String(window.state.companyName || '').trim();
        const input = await window.appPrompt('새 회사 이름을 입력하세요.\n(점검 데이터는 그대로 연결됩니다)', cur);
        if (input == null) return;
        const next = input.trim();
        if (!next) {
            window.showToast('회사 이름을 비울 수 없습니다.', 'warning');
            return;
        }
        if (next.length > 60) {
            window.showToast('회사 이름이 너무 깁니다(60자 이내).', 'warning');
            return;
        }
        if (next === cur) return;
        if (!await window.appConfirm(`회사 이름을 바꿉니다.\n\n${cur || '(없음)'}  →  ${next}\n\n다른 직원은 다음 로그인 때 새 이름으로 보입니다. 계속할까요?`)) return;
        window.showLoading('회사 이름을 바꾸는 중입니다...');
        try {
            const res = await renameCompanyEverywhere(window.state.companyId, next);
            applyCompanyNameLocally(next);
            window.showToast(res.joinCodeFailed
                ? `회사 이름을 '${next}'(으)로 바꿨지만 가입 검색용 이름은 못 바꿨습니다(서버 보안 규칙 게시 필요). 검색은 당분간 옛 이름·식별코드로 됩니다.`
                : `회사 이름을 '${next}'(으)로 바꿨습니다. 가입 검색에서도 새 이름으로 찾습니다.`
                + (res.failed ? ` (직원 ${res.failed}명은 다음 로그인 때 맞춰집니다)` : ''), res.joinCodeFailed ? 'warning' : 'success', 9000);
        } catch (e) {
            console.error('회사 이름 변경 실패:', e);
            window.showToast('회사 이름을 바꾸지 못했습니다: ' + (e && e.message ? e.message : e), 'error', 6000);
        } finally {
            window.hideLoading();
        }
    };

    async function enterAppAsUser(profile) {
        window.state.uid = profile.uid;
        window.state.userName = profile.name;
        window.state.companyId = profile.companyId;
        window.state.companyName = profile.companyName;
        window.state.role = profile.role;

        hideAuthOverlay();
        if (typeof window.closeEditBuildingModalFunc === 'function') window.closeEditBuildingModalFunc();
        if (typeof window.closeAddBuildingModalFunc === 'function') window.closeAddBuildingModalFunc();
        window._postAuthClickGuardUntil = Date.now() + 700;

        const headerProfile = document.getElementById('headerUserProfileGroup');
        if (headerProfile) headerProfile.style.display = 'flex';
        setHeroAccountBarVisible(true);
        const lblCompany = document.getElementById('lblUserCompany');
        const lblUser = document.getElementById('lblUserName');
        const lblEmail = document.getElementById('lblUserEmail');
        if (lblCompany) lblCompany.textContent = profile.companyName || '';
        if (lblUser) lblUser.textContent = profile.name || '';
        if (lblEmail) {
            const email = bsaAccountLabel((auth && auth.currentUser && auth.currentUser.email) || '', '');
            lblEmail.textContent = email ? email : '';
            lblEmail.style.display = email ? 'block' : 'none';
        }
        const inputHomeCompany = document.getElementById('inputHomeCompanyName');
        if (inputHomeCompany) inputHomeCompany.value = profile.companyName || '';

        const btnApproval = document.getElementById('btnOpenMemberApproval');
        if (btnApproval) btnApproval.style.display = (profile.role === 'admin') ? 'inline-flex' : 'none';
        const btnLeaveCompany = document.getElementById('btnLeaveCompany');
        if (btnLeaveCompany) btnLeaveCompany.style.display = (profile.role === 'admin' || profile.role === 'member') ? 'inline-flex' : 'none';
        setCompanyRenameButtonVisible(profile.role === 'admin');

        // 회사 이름은 회사 정보(companies/{id}.name)가 기준이다. 사용자 정보(users/{uid}.companyName)는
        // 가입 당시 이름을 복사해 둔 것이라, 관리자가 이름을 바꿔도 직원마다 옛 이름이 남았다.
        // 로그인 때 회사 정보의 이름으로 화면을 맞추고 본인 사용자 정보도 고쳐 둔다(2026-09-21).
        let companyDocData = null;
        if (profile.role === 'admin' && db) {
            try {
                const companyDoc = await db.collection('companies').doc(profile.companyId).get();
                if (companyDoc.exists) {
                    companyDocData = companyDoc.data() || {};
                    window.state.companyJoinCode = companyDocData.joinCode || null;
                    window.state.companyDisabled = companyDocData.disabled === true;
                    setCompanyRenameButtonVisible(true);
                }
            } catch (e) { console.warn('회사 코드 조회 실패:', e); }
        }
        if (companyDocData) {
            applyCompanyNameFromCompanyDoc(profile, companyDocData.name);
        } else if (db && profile.companyId) {
            // 직원은 로그인을 늦추지 않게 뒤에서 읽는다(못 읽으면 사용자 정보의 이름을 그대로 씀)
            db.collection('companies').doc(profile.companyId).get()
                .then((doc) => {
                    if (!doc.exists) return;
                    applyCompanyNameFromCompanyDoc(profile, (doc.data() || {}).name);
                    if ((doc.data() || {}).disabled === true) window.showToast('이 회사는 관리자가 삭제(비활성)했습니다. 데이터는 남아 있습니다 — 관리자에게 문의하세요.', 'warning', 8000);
                })
                .catch((e) => console.warn('회사 이름 조회 실패(사용자 정보의 이름을 씁니다):', e));
        }

        // 리스너를 붙이기 전에 토큰에 회사 클레임을 넣어야, 이후 스냅샷마다
        // 규칙이 members 문서를 다시 읽지 않는다.
        await ensureCompanyAuthClaims(profile.uid, profile.companyId, profile.role);

        await switchCompanyLocalDataContext(profile.companyId, profile.uid);
        if (typeof loadAndApplyUserDefectPinPresets === 'function') {
            await loadAndApplyUserDefectPinPresets(profile.uid, profile.userDocData);
        }
        if (typeof listenToRealtimeUpdates === 'function') listenToRealtimeUpdates();
        if (typeof pullCompanySnapshotOnce === 'function') {
            await pullCompanySnapshotOnce();
        }
        if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);
        if (typeof ensureBuildingAccessSeeded === 'function') ensureBuildingAccessSeeded();
        else if (typeof touchBuildingAccess === 'function' && window.state.currentBuildingId) {
            touchBuildingAccess(window.state.currentBuildingId);
        }
        if (typeof pruneStaleIndexedDbInspectionData === 'function' && navigator.onLine !== false) {
            pruneStaleIndexedDbInspectionData().catch(() => {});
        }
        if (typeof hydrateAllBuildingPdfsFromCloud === 'function') {
            hydrateAllBuildingPdfsFromCloud().catch((e) => console.warn('서버 PDF 일괄 조회 실패:', e));
        }
        // 로그인 탭 직후 고스트 클릭이 홈 수정 버튼을 누르지 않도록 한 틱 지연
        setTimeout(() => {
            clearBuildingSearchAutofill();
            scheduleBuildingSearchAutofillCleanup();
            if (typeof renderDashboard === 'function') renderDashboard();
            // 새로고침·새 버전 로드·재실행 뒤 로그인이 유지되면 마지막 작업 위치(현장·동·회차·층·탭)로 바로 들어간다.
            // 못 들어가면(건물 삭제·휴지통·오류) 홈. 복원은 페이지 로드당 한 번만 하고, 끝난 뒤부터 위치를 기록한다.
            window.switchTab('tab-home');
            (async () => {
                try {
                    if (window.BSA && window.BSA.lastLocUi) await window.BSA.lastLocUi.tryRestore(profile);
                } catch (_e) { /* 홈 유지 */ }
                if (window.BSA && window.BSA.lastLocUi) {
                    window.BSA.lastLocUi.enableTracking();
                    if (window.state.currentTab && window.state.currentTab !== 'tab-home') window.BSA.lastLocUi.record();
                }
            })();
        }, 50);
    }

    async function handleAuthStateChange(user) {
        if (!user) {
            if (window._deletingAccount) return;
            // 로그아웃: 이 계정의 마지막 위치를 지우고 기록을 멈춘다(다른 계정이 이어받지 않게)
            if (window.BSA && window.BSA.lastLocUi) {
                if (window.state.uid && window.state.companyId) window.BSA.lastLocUi.clear(window.state.uid, window.state.companyId);
                window.BSA.lastLocUi.disableTracking();
            }
            window._explicitAuth = false;
            if (typeof stopRealtimeListeners === 'function') stopRealtimeListeners({ clearCache: true });
            window.state.uid = null;
            window.state.userName = null;
            window.state.companyId = null;
            window.state.companyName = null;
            window.state.role = null;
            if (typeof resetDefectPinPresetsToDefaults === 'function') resetDefectPinPresetsToDefaults();
            switchCompanyLocalDataContext(null, null).catch(() => {});
            if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);
            showLoginOverlay();
            return;
        }

        if (window._justRegistering) return; // 가입 절차가 직접 화면 전환을 처리함

        if (!isAutoLoginOn() && !window._explicitAuth) {
            if (window._droppingRestoredSession) return;
            window._droppingRestoredSession = true;
            try { await auth.signOut(); } catch (_e) { /* ignore */ }
            window._droppingRestoredSession = false;
            return;
        }

        try {
            const ctx = await getUserMembershipContext(user.uid);
            if (!ctx) {
                showAuthError({ message: '계정 정보를 찾을 수 없습니다. 다시 가입해 주세요.' });
                await auth.signOut();
                return;
            }
            const { data, companyId, pendingCompanyId, activeCompanyId, status } = ctx;

            if (!activeCompanyId || status === 'unaffiliated') {
                window.state.uid = user.uid;
                window.state.userName = data.name;
                window.state.companyId = null;
                window.state.companyName = null;
                window.state.role = 'none';
                showCompanyJoinOverlay();
                return;
            }

            if (status === 'pending') {
                window.state.uid = user.uid;
                window.state.userName = data.name;
                window.state.companyId = pendingCompanyId || companyId;
                window.state.companyName = data.pendingCompanyName || data.companyName || '';
                window.state.role = 'pending';
                showPendingApproval(data.pendingCompanyName || data.companyName);
                if (typeof updateOnlineBadge === 'function') updateOnlineBadge(true);
            } else if (status === 'rejected') {
                await clearUserCompanyLinks(user.uid, activeCompanyId, { removeMember: false });
                window.state.uid = user.uid;
                window.state.userName = data.name;
                window.state.companyId = null;
                window.state.companyName = null;
                window.state.role = 'none';
                showCompanyJoinOverlay('가입 신청이 <strong>거절</strong>되었습니다. 다른 회사를 검색해 다시 신청할 수 있습니다.');
            } else if (status === 'admin' || status === 'member') {
                await enterAppAsUser({
                    uid: user.uid,
                    name: data.name,
                    companyId: companyId || activeCompanyId,
                    companyName: data.companyName,
                    role: status,
                    userDocData: data
                });
            } else {
                window.state.uid = user.uid;
                window.state.userName = data.name;
                window.state.role = 'none';
                showCompanyJoinOverlay('회사 소속 정보를 확인할 수 없습니다. 회사명을 검색해 다시 신청해 주세요.');
            }
        } catch (e) {
            console.error('로그인 상태 확인 오류:', e);
            showAuthError({ message: '로그인 처리 중 오류가 발생했습니다. 인터넷 연결을 확인해 주세요.' });
        }
    }

    // 회사 하위 members/pendingRequests/rejectedRequests 컬렉션만으로 상태를 판단
    // (users/{uid} 문서는 본인만 쓸 수 있어야 하므로, 대표가 팀원 상태를 바꿀 때도
    //  companies/{companyId} 하위 문서만 건드리도록 설계)
    async function resolveMembershipStatus(uid, companyId) {
        if (!companyId) return 'unaffiliated';
        const companyRef = db.collection('companies').doc(companyId);
        const memberDoc = await companyRef.collection('members').doc(uid).get();
        if (memberDoc.exists) return memberDoc.data().role || 'member';
        const pendingDoc = await companyRef.collection('pendingRequests').doc(uid).get();
        if (pendingDoc.exists) return 'pending';
        const rejectedDoc = await companyRef.collection('rejectedRequests').doc(uid).get();
        if (rejectedDoc.exists) return 'rejected';
        return 'unknown';
    }

    async function getUserMembershipContext(uid) {
        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) return null;
        const data = userDoc.data() || {};
        const companyId = data.companyId || null;
        const pendingCompanyId = data.pendingCompanyId || null;
        const activeCompanyId = companyId || pendingCompanyId;
        let status = 'unaffiliated';
        if (activeCompanyId) status = await resolveMembershipStatus(uid, activeCompanyId);
        return { data, companyId, pendingCompanyId, activeCompanyId, status };
    }

    async function clearUserCompanyLinks(uid, companyId, options) {
        if (!uid || !companyId || !db) return;
        options = options || {};
        const companyRef = db.collection('companies').doc(companyId);
        const batch = db.batch();
        batch.delete(companyRef.collection('pendingRequests').doc(uid));
        batch.delete(companyRef.collection('rejectedRequests').doc(uid));
        if (options.removeMember !== false) {
            batch.delete(companyRef.collection('members').doc(uid));
        }
        const userUpdate = {
            companyId: null,
            companyName: null,
            pendingCompanyId: null,
            pendingCompanyName: null,
            role: 'none'
        };
        batch.set(db.collection('users').doc(uid), userUpdate, { merge: true });
        await batch.commit();
    }

    async function assertCanLeaveCompany(uid, companyId) {
        if (!uid || !companyId || !db) return;
        const companyRef = db.collection('companies').doc(companyId);
        const memberDoc = await companyRef.collection('members').doc(uid).get();
        if (!memberDoc.exists || memberDoc.data().role !== 'admin') return;
        const membersSnap = await companyRef.collection('members').get();
        const otherMembers = membersSnap.docs.filter((d) => d.id !== uid);
        const otherAdmins = otherMembers.filter((d) => d.data().role === 'admin');
        if (otherMembers.length > 0 && otherAdmins.length === 0) {
            throw new Error('다른 팀원이 있는 회사의 유일한 관리자는 나갈 수 없습니다. 다른 관리자를 지정한 뒤 다시 시도해 주세요.');
        }
    }

    function ensureFirebaseAuthReady() {
        if (auth) return auth;
        try {
            initFirebaseSync();
        } catch (e) {
            console.error('Firebase 재초기화 오류:', e);
        }
        return auth;
    }

    window.submitLogin = async function() {
        clearAuthError();
        const rawLogin = (document.getElementById('authEmail')?.value || '').trim();
        const password = document.getElementById('authPassword')?.value || '';
        if (!rawLogin || !password) { showAuthError({ message: '아이디(또는 이메일)와 비밀번호를 입력해 주세요.' }); return; }
        const parsedLogin = bsaParseLoginInput(rawLogin);
        if (parsedLogin.error) { showAuthError({ message: parsedLogin.error }); return; }
        const email = parsedLogin.email;
        _bsaAuthAttemptIsId = !!parsedLogin.loginId;
        const authClient = ensureFirebaseAuthReady();
        if (!authClient) {
            showAuthError({ message: '인증 서버에 연결할 수 없습니다. 인터넷 연결 후 새로고침해 주세요.' });
            return;
        }
        window._explicitAuth = true;
        window._authSubmitInFlight = true;
        window.showLoading('로그인 중입니다...');
        try {
            await applyAuthPersistence();
            await authClient.signInWithEmailAndPassword(email, password);
        } catch (err) {
            window._explicitAuth = false;
            showAuthError(err);
        } finally {
            window._authSubmitInFlight = false;
            window.hideLoading();
        }
    };

    window.submitRegisterAdmin = async function() {
        clearAuthError();
        const name = (document.getElementById('authUserName')?.value || '').trim();
        const companyName = (document.getElementById('authCompanyName')?.value || '').trim();
        const rawLogin = (document.getElementById('authEmail')?.value || '').trim();
        const password = document.getElementById('authPassword')?.value || '';
        if (!name || !companyName || !rawLogin || !password) {
            showAuthError({ message: '이름, 회사명, 아이디, 비밀번호를 모두 입력해 주세요.' });
            return;
        }
        const parsedReg = bsaParseLoginInput(rawLogin);
        if (parsedReg.error) { showAuthError({ message: parsedReg.error }); return; }
        if (password.length < 6) { showAuthError({ message: '비밀번호는 6자 이상이어야 합니다.' }); return; }
        const email = parsedReg.email;
        const loginId = parsedReg.loginId || '';
        const idField = loginId ? { loginId } : {};
        _bsaAuthAttemptIsId = !!loginId;
        window._explicitAuth = true;
        window._justRegistering = true;
        window.showLoading('회사 계정을 생성하는 중입니다...');
        let cred = null;
        try {
            await applyAuthPersistence();
            cred = await auth.createUserWithEmailAndPassword(email, password);
            const uid = cred.user.uid;
            const joinCode = await generateUniqueJoinCode();
            const companyRef = db.collection('companies').doc();
            await companyRef.set({
                name: companyName,
                adminUid: uid,
                joinCode: joinCode,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('joinCodes').doc(joinCode).set({
                companyId: companyRef.id, companyName, companyNameLower: companyNameSearchKey(companyName)
            });
            _joinCodesDirectoryCache = null;
            _joinCodesDirectoryComplete = false;
            // members 문서가 생기면 onCompanyMemberWrite 트리거가 admin 클레임을 심는다.
            // 아래 enterAppAsUser 안의 ensureCompanyAuthClaims 가 토큰을 새로 받아간다.
            await companyRef.collection('members').doc(uid).set({
                name, email, ...idField, role: 'admin',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('users').doc(uid).set({
                name, email, ...idField, companyId: companyRef.id, companyName, role: 'admin'
            });
            await enterAppAsUser({
                uid, name, companyId: companyRef.id, companyName, role: 'admin',
                userDocData: { name, email, ...idField, companyId: companyRef.id, companyName, role: 'admin' }
            });
        } catch (err) {
            showAuthError(err);
            if (cred && cred.user) { try { await cred.user.delete(); } catch (e) {} }
        } finally {
            window._justRegistering = false;
            window.hideLoading();
        }
    };

    window.submitRegisterMember = async function() {
        clearAuthError();
        const name = (document.getElementById('authUserName')?.value || '').trim();
        const rawLogin = (document.getElementById('authEmail')?.value || '').trim();
        const password = document.getElementById('authPassword')?.value || '';
        if (!name || !rawLogin || !password) {
            showAuthError({ message: '이름, 아이디, 비밀번호를 모두 입력해 주세요.' });
            return;
        }
        const parsedReg = bsaParseLoginInput(rawLogin);
        if (parsedReg.error) { showAuthError({ message: parsedReg.error }); return; }
        if (password.length < 6) { showAuthError({ message: '비밀번호는 6자 이상이어야 합니다.' }); return; }
        const email = parsedReg.email;
        const loginId = parsedReg.loginId || '';
        const idField = loginId ? { loginId } : {};
        _bsaAuthAttemptIsId = !!loginId;
        window._explicitAuth = true;
        window._justRegistering = true;
        window.showLoading('계정을 생성하는 중입니다...');
        let cred = null;
        try {
            await applyAuthPersistence();
            cred = await auth.createUserWithEmailAndPassword(email, password);
            const uid = cred.user.uid;

            await db.collection('users').doc(uid).set({
                name, email, ...idField, role: 'none'
            });
            window.state.uid = uid;
            window.state.userName = name;
            window.state.companyId = null;
            window.state.companyName = null;
            window.state.role = 'none';
            showCompanyJoinOverlay('계정이 생성되었습니다.<br>회사명을 검색해 소속을 신청해 주세요.');
        } catch (err) {
            showAuthError(err);
            if (cred && cred.user) { try { await cred.user.delete(); } catch (e) {} }
        } finally {
            window._justRegistering = false;
            window.hideLoading();
        }
    };

    window.applyToCompany = async function() {
        clearCompanyJoinError();
        const user = auth && auth.currentUser;
        if (!user || !db) {
            showCompanyJoinError('로그인이 필요합니다.');
            return;
        }

        const selected = getSelectedJoinCompany();
        if (!selected || !selected.companyId) {
            showCompanyJoinError('가입할 회사를 검색해 선택해 주세요.');
            return;
        }
        const companyId = selected.companyId;
        let companyName = selected.companyName || '';

        window.showLoading('회사 가입을 신청하는 중입니다...');
        try {
            const uid = user.uid;
            const ctx = await getUserMembershipContext(uid);
            if (!ctx) throw new Error('계정 정보를 찾을 수 없습니다.');

            if (ctx.companyId && (ctx.status === 'admin' || ctx.status === 'member')) {
                showCompanyJoinError('이미 회사에 소속되어 있습니다. 회사를 나간 뒤 다시 신청해 주세요.');
                return;
            }

            if (!companyName) {
                const companyDoc = await db.collection('companies').doc(companyId).get();
                if (companyDoc.exists) companyName = companyDoc.data().name || companyName;
            }

            if (ctx.pendingCompanyId && ctx.pendingCompanyId !== companyId) {
                await clearUserCompanyLinks(uid, ctx.pendingCompanyId, { removeMember: false });
            }
            if (ctx.companyId && ctx.companyId !== companyId) {
                await clearUserCompanyLinks(uid, ctx.companyId, { removeMember: true });
            }

            const userDoc = await db.collection('users').doc(uid).get();
            const name = (userDoc.exists && userDoc.data().name) || window.state.userName || '';
            const email = user.email || (userDoc.exists ? userDoc.data().email : '');
            const loginId = (userDoc.exists && userDoc.data().loginId) || bsaLoginIdFromEmail(email);

            await db.collection('companies').doc(companyId).collection('pendingRequests').doc(uid).set({
                name, email, ...(loginId ? { loginId } : {}), requestedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await db.collection('users').doc(uid).update({
                pendingCompanyId: companyId,
                pendingCompanyName: companyName,
                companyId: null,
                companyName: null,
                role: 'pending'
            });

            window.state.uid = uid;
            window.state.userName = name;
            window.state.companyId = companyId;
            window.state.companyName = companyName;
            window.state.role = 'pending';
            showPendingApproval(companyName);
            window.showToast(`'${companyName}'에 가입 신청했습니다. 관리자 승인을 기다려 주세요.`, 'success', 4500);
        } catch (err) {
            console.error('회사 가입 신청 오류:', err);
            showCompanyJoinError(err.message || '가입 신청 중 오류가 발생했습니다.');
        } finally {
            window.hideLoading();
        }
    };

    window.cancelCompanyApplication = async function() {
        const user = auth && auth.currentUser;
        if (!user || !db) return;
        if (!await window.appConfirm('가입 신청을 취소하고 다른 회사로 다시 신청하시겠습니까?')) return;
        window.showLoading('신청을 취소하는 중입니다...');
        try {
            const ctx = await getUserMembershipContext(user.uid);
            const companyId = ctx && (ctx.pendingCompanyId || ctx.companyId);
            if (!companyId) {
                showCompanyJoinOverlay();
                return;
            }
            await clearUserCompanyLinks(user.uid, companyId, { removeMember: false });
            window.state.companyId = null;
            window.state.companyName = null;
            window.state.role = 'none';
            showCompanyJoinOverlay('가입 신청을 취소했습니다. 다른 회사를 검색해 다시 신청할 수 있습니다.');
        } catch (err) {
            console.error('가입 신청 취소 오류:', err);
            window.showToast('신청 취소 중 오류가 발생했습니다.', 'error');
        } finally {
            window.hideLoading();
        }
    };

    window.leaveCompany = async function() {
        const uid = window.state.uid;
        const companyId = window.state.companyId;
        if (!uid || !companyId || !db) return;
        if (!await window.appConfirm('회사에서 나가시겠습니까?\n\n나간 뒤에는 점검 데이터에 접근할 수 없습니다.')) return;
        window.showLoading('회사에서 나가는 중입니다...');
        try {
            await assertCanLeaveCompany(uid, companyId);
            if (typeof stopRealtimeListeners === 'function') stopRealtimeListeners({ clearCache: true });
            await clearUserCompanyLinks(uid, companyId, { removeMember: true });
            window.state.companyId = null;
            window.state.companyName = null;
            window.state.companyJoinCode = null;
            window.state.role = 'none';
            await switchCompanyLocalDataContext(null, uid);
            const btnApproval = document.getElementById('btnOpenMemberApproval');
            if (btnApproval) btnApproval.style.display = 'none';
            const btnLeaveCompany = document.getElementById('btnLeaveCompany');
            if (btnLeaveCompany) btnLeaveCompany.style.display = 'none';
            setCompanyRenameButtonVisible(false);
            window.showToast('회사에서 나왔습니다.', 'info', 4000);
            showCompanyJoinOverlay('다른 회사를 검색해 다시 소속을 신청할 수 있습니다.');
        } catch (err) {
            console.error('회사 나가기 오류:', err);
            window.showToast(err.message || '회사 나가기 중 오류가 발생했습니다.', 'error', 5000);
        } finally {
            window.hideLoading();
        }
    };

    window.logout = async function() {
        if (!await window.appConfirm('🔒 정말 로그아웃 하시겠습니까?')) return;
        window._explicitAuth = false;
        try { if (auth) await auth.signOut(); } catch (e) {}
        showLoginOverlay();
    };

    function clearDeleteAccountError() {
        const box = document.getElementById('deleteAccountErrorMsg');
        if (!box) return;
        box.style.display = 'none';
        box.textContent = '';
    }

    function showDeleteAccountError(err) {
        const box = document.getElementById('deleteAccountErrorMsg');
        if (!box) return;
        const map = {
            'auth/wrong-password': '비밀번호가 올바르지 않습니다.',
            'auth/invalid-credential': '비밀번호가 올바르지 않습니다.',
            'auth/too-many-requests': '시도 횟수가 많습니다. 잠시 후 다시 시도해 주세요.',
            'auth/requires-recent-login': '보안을 위해 비밀번호를 다시 입력해 주세요.'
        };
        const code = err && err.code;
        box.textContent = (code && map[code]) ? map[code] : ((err && err.message) || '계정 삭제 중 오류가 발생했습니다.');
        box.style.display = 'block';
    }

    function openDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        const pwdInput = document.getElementById('deleteAccountPassword');
        clearDeleteAccountError();
        if (pwdInput) pwdInput.value = '';
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
            setTimeout(() => pwdInput?.focus(), 50);
        }
    }

    function closeDeleteAccountModal() {
        const modal = document.getElementById('deleteAccountModal');
        clearDeleteAccountError();
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
        const pwdInput = document.getElementById('deleteAccountPassword');
        if (pwdInput) pwdInput.value = '';
    }

    async function assertCanDeleteAccount(uid, companyId) {
        if (!uid || !companyId || !db) return;
        const companyRef = db.collection('companies').doc(companyId);
        const memberDoc = await companyRef.collection('members').doc(uid).get();
        if (!memberDoc.exists || memberDoc.data().role !== 'admin') return;
        const membersSnap = await companyRef.collection('members').get();
        const otherMembers = membersSnap.docs.filter((d) => d.id !== uid);
        const otherAdmins = otherMembers.filter((d) => d.data().role === 'admin');
        if (otherMembers.length > 0 && otherAdmins.length === 0) {
            throw new Error('다른 팀원이 있는 회사의 유일한 관리자는 계정을 삭제할 수 없습니다. 다른 관리자를 지정한 뒤 다시 시도해 주세요.');
        }
    }

    async function cleanupUserFirestoreBeforeDelete(uid, companyId, pendingCompanyId) {
        if (!uid || !db) return;
        const batch = db.batch();
        const companyIds = [...new Set([companyId, pendingCompanyId].filter(Boolean))];
        companyIds.forEach((cid) => {
            const companyRef = db.collection('companies').doc(cid);
            batch.delete(companyRef.collection('pendingRequests').doc(uid));
            batch.delete(companyRef.collection('rejectedRequests').doc(uid));
            batch.delete(companyRef.collection('members').doc(uid));
        });
        batch.delete(db.collection('users').doc(uid));
        await batch.commit();
    }

    function clearLocalUserDataOnDelete(uid) {
        if (!uid) return;
        try {
            localStorage.removeItem(userDefectPinLocalKey(uid));
            localStorage.removeItem('building_user_name');
        } catch (e) {
            console.warn('계정 삭제 후 로컬 데이터 정리 실패:', e);
        }
    }

    window.deleteAccount = async function(password) {
        const user = auth && auth.currentUser;
        if (!user) {
            window.showToast('로그인이 필요합니다.', 'warning');
            return;
        }
        const pwd = (password || '').trim();
        if (!pwd) {
            showDeleteAccountError({ message: '비밀번호를 입력해 주세요.' });
            return;
        }
        if (!await window.appConfirm('정말 계정을 삭제하시겠습니까?\n\n삭제 후에는 복구할 수 없습니다.')) return;

        window._deletingAccount = true;
        window.showLoading('계정을 삭제하는 중입니다...');
        try {
            const uid = user.uid;
            let companyId = window.state.companyId || null;
            let pendingCompanyId = null;
            const userDoc = await db.collection('users').doc(uid).get();
            if (userDoc.exists) {
                const d = userDoc.data();
                if (!companyId) companyId = d.companyId || null;
                pendingCompanyId = d.pendingCompanyId || null;
            }
            await assertCanDeleteAccount(uid, companyId);

            const cred = firebase.auth.EmailAuthProvider.credential(user.email, pwd);
            await user.reauthenticateWithCredential(cred);

            if (typeof stopRealtimeListeners === 'function') stopRealtimeListeners({ clearCache: true });
            await cleanupUserFirestoreBeforeDelete(uid, companyId, pendingCompanyId);
            clearLocalUserDataOnDelete(uid);

            await user.delete();

            window.state.uid = null;
            window.state.userName = null;
            window.state.companyId = null;
            window.state.companyName = null;
            window.state.role = null;
            if (typeof resetDefectPinPresetsToDefaults === 'function') resetDefectPinPresetsToDefaults();

            closeDeleteAccountModal();
            window.showToast('계정이 삭제되었습니다.', 'success', 4500);
            showLoginOverlay();
        } catch (err) {
            console.error('계정 삭제 오류:', err);
            showDeleteAccountError(err);
        } finally {
            window._deletingAccount = false;
            window.hideLoading();
        }
    };

    // --- 관리자 가입 승인 관리 패널 ---
    window.openMemberApprovalModal = async function() {
        const modal = document.getElementById('memberApprovalModal');
        if (!modal || window.state.role !== 'admin') return;
        const lblCode = document.getElementById('lblCompanyJoinCode');
        if (lblCode) lblCode.textContent = window.state.companyJoinCode || '------';
        modal.style.display = 'flex';
        modal.classList.add('open');
        await renderMemberApprovalLists();
    };

    async function renderMemberApprovalLists() {
        const pendingBox = document.getElementById('pendingRequestsList');
        const membersBox = document.getElementById('approvedMembersList');
        if (!db || !window.state.companyId) return;
        const companyRef = db.collection('companies').doc(window.state.companyId);

        try {
            const pendingSnap = await companyRef.collection('pendingRequests').orderBy('requestedAt', 'desc').limit(50).get();
            if (pendingBox) {
                if (pendingSnap.empty) {
                    pendingBox.innerHTML = '<div style="font-size:0.82rem; color:#a3a3a3; padding:0.6rem; text-align:center; border:1px dashed #cbd5e1; border-radius:6px;">대기중인 신청이 없습니다.</div>';
                } else {
                    pendingBox.innerHTML = pendingSnap.docs.map(docSnap => {
                        const d = docSnap.data();
                        return `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #cbd5e1; padding:0.6rem 0.9rem; border-radius:8px; gap:0.6rem; flex-wrap:wrap;">
                                <span style="font-size:0.85rem;"><strong>${d.name || '이름없음'}</strong> <span style="color:#64748b; font-size:0.78rem;">(${bsaAccountLabel(d.email, d.loginId)})</span></span>
                                <div style="display:flex; gap:0.4rem;">
                                    <button type="button" class="btn btn-sm btn-outline" style="border-color:#059669; color:#059669;" onclick="window.approveMember('${docSnap.id}')"><i class="fa-solid fa-check"></i> 승인</button>
                                    <button type="button" class="btn btn-sm btn-outline" style="border-color:#ef4444; color:#ef4444;" onclick="window.rejectMember('${docSnap.id}')"><i class="fa-solid fa-xmark"></i> 거절</button>
                                </div>
                            </div>`;
                    }).join('');
                    if (pendingSnap.size >= 50) {
                        pendingBox.innerHTML += '<div style="font-size:0.75rem; color:#94a3b8; text-align:center; padding:0.35rem;">대기 신청은 최근 50건까지 표시합니다.</div>';
                    }
                }
            }
        } catch (e) {
            console.error('대기 목록 로드 오류:', e);
            if (pendingBox) pendingBox.innerHTML = '<div style="color:#f87171; font-size:0.82rem;">목록을 불러오지 못했습니다.</div>';
        }

        try {
            const membersSnap = await companyRef.collection('members').limit(100).get();
            if (membersBox) {
                const myUid = window.state.uid;
                membersBox.innerHTML = membersSnap.docs.map(docSnap => {
                    const d = docSnap.data();
                    const roleLabel = d.role === 'admin' ? '대표' : '팀원';
                    const isSelf = docSnap.id === myUid;
                    const canRemove = !isSelf && (d.role !== 'admin' || membersSnap.docs.filter(x => x.data().role === 'admin').length > 1);
                    const removeBtn = canRemove
                        ? `<button type="button" class="btn btn-sm btn-outline" style="border-color:#ef4444; color:#ef4444;" onclick="window.removeMember('${docSnap.id}')"><i class="fa-solid fa-user-minus"></i>보내기</button>`
                        : '';
                    const adminCount = membersSnap.docs.filter(x => x.data().role === 'admin').length;
                    const roleBtn = d.role === 'admin'
                        ? ((!isSelf && adminCount > 1)
                            ? `<button type="button" class="btn btn-sm btn-outline member-role-btn" data-role-action="revoke" onclick="window.setMemberRole('${docSnap.id}','member')" title="관리자 권한 해제"><i class="fa-solid fa-user-shield"></i> 관리자 해제</button>`
                            : '')
                        : `<button type="button" class="btn btn-sm btn-outline member-role-btn" data-role-action="grant" style="border-color:#2563eb; color:#2563eb;" onclick="window.setMemberRole('${docSnap.id}','admin')" title="관리자로 지정"><i class="fa-solid fa-user-shield"></i> 관리자 지정</button>`;
                    return `
                        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border:1px solid #e2e8f0; padding:0.5rem 0.9rem; border-radius:8px; gap:0.6rem; flex-wrap:wrap;">
                            <span style="font-size:0.85rem;"><strong>${d.name || '이름없음'}</strong> <span style="color:#64748b; font-size:0.78rem;">(${bsaAccountLabel(d.email, d.loginId)})</span>${isSelf ? ' <span style="color:#94a3b8; font-size:0.75rem;">(나)</span>' : ''}</span>
                            <div style="display:flex; gap:0.4rem; align-items:center;">
                                <span class="badge badge-info">${roleLabel}</span>
                                ${roleBtn}
                                ${removeBtn}
                            </div>
                        </div>`;
                }).join('');
                if (membersSnap.size >= 100) {
                    membersBox.innerHTML += '<div style="font-size:0.75rem; color:#94a3b8; text-align:center; padding:0.35rem;">멤버는 100명까지 표시합니다.</div>';
                }
            }
        } catch (e) {
            console.error('멤버 목록 로드 오류:', e);
        }
    }

    window.approveMember = async function(uid) {
        if (!db || !window.state.companyId) return;
        try {
            const companyRef = db.collection('companies').doc(window.state.companyId);
            const pendingDoc = await companyRef.collection('pendingRequests').doc(uid).get();
            if (!pendingDoc.exists) { window.showToast('이미 처리된 신청입니다.', 'warning'); await renderMemberApprovalLists(); return; }
            const d = pendingDoc.data();
            await companyRef.collection('members').doc(uid).set({
                name: d.name, email: d.email, ...(d.loginId ? { loginId: d.loginId } : {}), role: 'member',
                approvedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await companyRef.collection('pendingRequests').doc(uid).delete();
            const companyDoc = await companyRef.get();
            const companyName = companyDoc.exists ? (companyDoc.data().name || '') : (window.state.companyName || '');
            await db.collection('users').doc(uid).update({
                companyId: window.state.companyId,
                companyName,
                role: 'member',
                pendingCompanyId: null,
                pendingCompanyName: null
            });
            await renderMemberApprovalLists();
            window.showToast(`'${d.name || '팀원'}'님의 가입을 승인했습니다.`, 'success');
        } catch (e) {
            console.error('승인 처리 오류:', e);
            window.showToast('승인 처리 중 오류가 발생했습니다.', 'error');
        }
    };

    window.rejectMember = async function(uid) {
        if (!db || !window.state.companyId) return;
        if (!await window.appConfirm('정말 이 가입 신청을 거절하시겠습니까?')) return;
        try {
            const companyRef = db.collection('companies').doc(window.state.companyId);
            const pendingDoc = await companyRef.collection('pendingRequests').doc(uid).get();
            const d = pendingDoc.exists ? pendingDoc.data() : { name: '', email: '' };
            await companyRef.collection('rejectedRequests').doc(uid).set({
                name: d.name || '', email: d.email || '',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await companyRef.collection('pendingRequests').doc(uid).delete();
            await db.collection('users').doc(uid).update({
                pendingCompanyId: null,
                pendingCompanyName: null,
                companyId: null,
                companyName: null,
                role: 'none'
            });
            await renderMemberApprovalLists();
            window.showToast('가입 신청을 거절했습니다.', 'info');
        } catch (e) {
            console.error('거절 처리 오류:', e);
            window.showToast('거절 처리 중 오류가 발생했습니다.', 'error');
        }
    };

    window.removeMember = async function(uid) {
        if (!db || !window.state.companyId || window.state.role !== 'admin') return;
        if (uid === window.state.uid) {
            await window.leaveCompany();
            return;
        }
        if (!await window.appConfirm('이 팀원을 회사에서 보내시겠습니까?')) return;
        try {
            const companyRef = db.collection('companies').doc(window.state.companyId);
            const memberDoc = await companyRef.collection('members').doc(uid).get();
            if (!memberDoc.exists) {
                window.showToast('이미 나간 팀원입니다.', 'warning');
                await renderMemberApprovalLists();
                return;
            }
            if (memberDoc.data().role === 'admin') {
                const admins = (await companyRef.collection('members').get()).docs.filter((d) => d.data().role === 'admin');
                if (admins.length <= 1) {
                    window.showToast('유일한 관리자는 보낼 수 없습니다.', 'warning');
                    return;
                }
            }
            await clearUserCompanyLinks(uid, window.state.companyId, { removeMember: true });
            await renderMemberApprovalLists();
            window.showToast('팀원을 회사에서 보냈습니다.', 'info');
        } catch (e) {
            console.error('팀원보내기 오류:', e);
            window.showToast('처리 중 오류가 발생했습니다.', 'error');
        }
    };

    function initAuthEvents() {
        const formLogin = document.getElementById('formLogin');
        const btnLogout = document.getElementById('btnLogout');
        const tabLogin = document.getElementById('tabAuthLogin');
        const tabRegister = document.getElementById('tabAuthRegister');
        const btnSubmit = document.getElementById('btnSubmitAuth');
        const regModeGroup = document.getElementById('regModeGroup');
        const regModeAdminBtn = document.getElementById('regModeAdminBtn');
        const regModeMemberBtn = document.getElementById('regModeMemberBtn');
        const groupRegUserName = document.getElementById('groupRegUserName');
        const groupRegCompanyName = document.getElementById('groupRegCompanyName');
        const groupRegJoinCode = document.getElementById('groupRegJoinCode');

        let currentAuthTab = 'login';
        let currentRegMode = 'admin';

        function applyRegModeUI() {
            if (regModeAdminBtn) regModeAdminBtn.classList.toggle('active', currentRegMode === 'admin');
            if (regModeMemberBtn) regModeMemberBtn.classList.toggle('active', currentRegMode === 'member');
            if (groupRegCompanyName) groupRegCompanyName.style.display = (currentRegMode === 'admin') ? 'block' : 'none';
            if (groupRegJoinCode) groupRegJoinCode.style.display = (currentRegMode === 'member') ? 'block' : 'none';
        }

        function applyAuthTabUI() {
            clearAuthError();
            if (currentAuthTab === 'login') {
                if (regModeGroup) regModeGroup.style.display = 'none';
                if (groupRegUserName) groupRegUserName.style.display = 'none';
                if (groupRegCompanyName) groupRegCompanyName.style.display = 'none';
                if (groupRegJoinCode) groupRegJoinCode.style.display = 'none';
                if (btnSubmit) btnSubmit.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> 🚀 로그인 및 점검 시작';
            } else {
                if (regModeGroup) regModeGroup.style.display = 'flex';
                if (groupRegUserName) groupRegUserName.style.display = 'block';
                applyRegModeUI();
                if (btnSubmit) btnSubmit.innerHTML = currentRegMode === 'admin'
                    ? '<i class="fa-solid fa-user-plus"></i> 🏢 회사 등록 및 시작'
                    : '<i class="fa-solid fa-user-plus"></i> 👤 계정 만들기';
            }
        }

        if (tabLogin && tabRegister) {
            tabLogin.addEventListener('click', () => {
                currentAuthTab = 'login';
                tabLogin.classList.add('active');
                tabLogin.style.background = '#2a2a2a';
                tabLogin.style.color = '#ffffff';
                tabRegister.classList.remove('active');
                tabRegister.style.background = 'transparent';
                tabRegister.style.color = '#a3a3a3';
                applyAuthTabUI();
            });

            tabRegister.addEventListener('click', () => {
                currentAuthTab = 'register';
                tabRegister.classList.add('active');
                tabRegister.style.background = '#2a2a2a';
                tabRegister.style.color = '#ffffff';
                tabLogin.classList.remove('active');
                tabLogin.style.background = 'transparent';
                tabLogin.style.color = '#a3a3a3';
                applyAuthTabUI();
            });
        }

        if (regModeAdminBtn && regModeMemberBtn) {
            regModeAdminBtn.addEventListener('click', () => { currentRegMode = 'admin'; applyRegModeUI(); });
            regModeMemberBtn.addEventListener('click', () => { currentRegMode = 'member'; applyRegModeUI(); });
        }

        applyAuthTabUI();

        async function handleSubmit(e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (currentAuthTab === 'login') {
                await window.submitLogin();
            } else if (currentRegMode === 'admin') {
                await window.submitRegisterAdmin();
            } else {
                await window.submitRegisterMember();
            }
            return false;
        }

        if (formLogin) {
            formLogin.addEventListener('submit', handleSubmit);
            formLogin.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target && e.target.closest('#formLogin')) {
                    e.preventDefault();
                    handleSubmit(e);
                }
            });
        }
        if (btnSubmit) btnSubmit.addEventListener('click', (e) => handleSubmit(e));

        document.querySelectorAll('.auto-login-toggle').forEach((btn) => {
            btn.addEventListener('click', () => { setAutoLoginOn(!isAutoLoginOn()); });
        });
        syncAutoLoginButtons();

        if (btnLogout) btnLogout.addEventListener('click', window.logout);

        const btnLeaveCompany = document.getElementById('btnLeaveCompany');
        if (btnLeaveCompany) btnLeaveCompany.addEventListener('click', window.leaveCompany);

        const btnDeleteAccount = document.getElementById('btnDeleteAccount');
        const btnPendingDeleteAccount = document.getElementById('btnPendingDeleteAccount');
        const deleteAccountModal = document.getElementById('deleteAccountModal');
        const btnCloseDeleteAccount = document.getElementById('btnCloseDeleteAccountModal');
        const btnCancelDeleteAccount = document.getElementById('btnCancelDeleteAccount');
        const btnConfirmDeleteAccount = document.getElementById('btnConfirmDeleteAccount');
        const deleteAccountPassword = document.getElementById('deleteAccountPassword');
        if (btnDeleteAccount) btnDeleteAccount.addEventListener('click', openDeleteAccountModal);
        if (btnPendingDeleteAccount) btnPendingDeleteAccount.addEventListener('click', openDeleteAccountModal);
        if (btnCloseDeleteAccount) btnCloseDeleteAccount.addEventListener('click', closeDeleteAccountModal);
        if (btnCancelDeleteAccount) btnCancelDeleteAccount.addEventListener('click', closeDeleteAccountModal);
        if (btnConfirmDeleteAccount) {
            btnConfirmDeleteAccount.addEventListener('click', () => {
                window.deleteAccount(deleteAccountPassword ? deleteAccountPassword.value : '');
            });
        }
        if (deleteAccountPassword) {
            deleteAccountPassword.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    window.deleteAccount(deleteAccountPassword.value);
                }
            });
        }
        if (deleteAccountModal) {
            deleteAccountModal.addEventListener('click', (e) => {
                if (e.target === deleteAccountModal) closeDeleteAccountModal();
            });
        }

        const btnOpenApproval = document.getElementById('btnOpenMemberApproval');
        const approvalModal = document.getElementById('memberApprovalModal');
        const btnCloseApproval1 = document.getElementById('btnCloseMemberApprovalModal');
        const btnCloseApproval2 = document.getElementById('btnCloseMemberApprovalModal2');
        const closeApprovalModal = () => {
            if (approvalModal) { approvalModal.style.display = 'none'; approvalModal.classList.remove('open'); }
        };
        if (btnOpenApproval) btnOpenApproval.addEventListener('click', window.openMemberApprovalModal);
        if (btnCloseApproval1) btnCloseApproval1.addEventListener('click', closeApprovalModal);
        if (btnCloseApproval2) btnCloseApproval2.addEventListener('click', closeApprovalModal);

        const btnPendingRecheck = document.getElementById('btnPendingRecheck');
        const btnPendingLogout = document.getElementById('btnPendingLogout');
        const btnPendingCancelApplication = document.getElementById('btnPendingCancelApplication');
        if (btnPendingRecheck) {
            btnPendingRecheck.addEventListener('click', async () => {
                if (!auth || !auth.currentUser) return;
                await handleAuthStateChange(auth.currentUser);
                if (window.state.role === 'pending') {
                    window.showToast('아직 승인되지 않았습니다. 잠시 후 다시 확인해 주세요.', 'info');
                }
            });
        }
        if (btnPendingLogout) btnPendingLogout.addEventListener('click', window.logout);
        if (btnPendingCancelApplication) btnPendingCancelApplication.addEventListener('click', window.cancelCompanyApplication);

        const btnApplyCompanyJoin = document.getElementById('btnApplyCompanyJoin');
        const btnCompanyJoinLogout = document.getElementById('btnCompanyJoinLogout');
        const btnCompanyJoinDeleteAccount = document.getElementById('btnCompanyJoinDeleteAccount');
        const companyJoinSearchInput = document.getElementById('companyJoinSearchInput');
        const btnCompanyJoinClearSelection = document.getElementById('btnCompanyJoinClearSelection');
        if (btnApplyCompanyJoin) {
            btnApplyCompanyJoin.addEventListener('click', () => {
                window.applyToCompany();
            });
        }
        if (companyJoinSearchInput) {
            companyJoinSearchInput.addEventListener('input', () => {
                scheduleCompanyJoinSearch(companyJoinSearchInput.value);
            });
            companyJoinSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = document.querySelector('#companyJoinSearchResults .company-join-search-item');
                    if (first) first.click();
                    else window.applyToCompany();
                }
            });
        }
        if (btnCompanyJoinClearSelection) {
            btnCompanyJoinClearSelection.addEventListener('click', clearSelectedJoinCompany);
        }
        if (btnCompanyJoinLogout) btnCompanyJoinLogout.addEventListener('click', window.logout);
        if (btnCompanyJoinDeleteAccount) btnCompanyJoinDeleteAccount.addEventListener('click', openDeleteAccountModal);

        // 비밀번호 찾기 모달 오픈/닫기/발송 핸들러
        const btnOpenForgot = document.getElementById('btnOpenForgotPassword');
        const resetModal = document.getElementById('resetPasswordModal');
        const btnCloseReset = document.getElementById('btnCloseResetPasswordModal');
        const btnCancelReset = document.getElementById('btnCancelResetPassword');
        const btnSendReset = document.getElementById('btnSendPasswordReset');

        const closeResetModal = () => {
            if (resetModal) {
                resetModal.style.display = 'none';
                resetModal.classList.remove('open');
            }
        };

        if (btnOpenForgot && resetModal) {
            btnOpenForgot.addEventListener('click', () => {
                resetModal.style.display = 'flex';
                resetModal.classList.add('open');
                const emailInput = document.getElementById('resetUserEmail');
                const loginEmail = document.getElementById('authEmail')?.value;
                if (emailInput && loginEmail && loginEmail.includes('@')) {
                    emailInput.value = loginEmail;
                }
            });
        }

        if (btnCloseReset) btnCloseReset.addEventListener('click', closeResetModal);
        if (btnCancelReset) btnCancelReset.addEventListener('click', closeResetModal);

        if (btnSendReset) {
            btnSendReset.addEventListener('click', () => {
                const email = (document.getElementById('resetUserEmail')?.value || '').trim();
                if (!email) {
                    window.showToast('이메일 주소를 입력해 주세요.', 'warning');
                    return;
                }
                if (!email.includes('@') || bsaLoginIdFromEmail(email)) {
                    window.showToast('아이디로 가입한 계정은 메일로 비밀번호를 찾을 수 없습니다. 회사 관리자에게 비밀번호 초기화를 요청해 주세요.', 'warning', 6000);
                    return;
                }

                if (typeof firebase !== 'undefined' && firebase.auth) {
                    firebase.auth().sendPasswordResetEmail(email)
                        .then(() => {
                            window.showToast(`'${email}' 주소로 비밀번호 재설정 이메일이 발송되었습니다. 메일함을 확인해 주세요.`, 'success', 4500);
                            closeResetModal();
                        })
                        .catch((err) => {
                            window.showToast(`메일 발송에 실패했습니다: ${err.message || err.code || '알 수 없는 오류'}`, 'error', 5000);
                        });
                } else {
                    window.showToast('인증 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.', 'error');
                }
            });
        }
    }

    // --- 11. INITIALIZATION ---
    window.resetCanvasTouchGestures = function() {
        try {
            if (typeof clearPendingNdtLongPress === 'function') clearPendingNdtLongPress();
            if (typeof clearPendingDragLongPress === 'function') clearPendingDragLongPress();
        } catch (_e) { /* ignore */ }
        isNdtDragging = false;
        ndtTouchMayPageScroll = false;
        ndtTouchStartedOnCanvas = false;
        isNdtMarkingDrag = false;
        isNdtPinching = false;
        isDraggingNdtPin = false;
        isDraggingNdtPinGroup = false;
        isDraggingNdtDisplacement = false;
        isNdtDisplacementMarking = false;
        pendingNdtPinHit = null;
        pendingNdtDispHit = null;
        activeDragNdtPin = null;
        isDragging = false;
        isMarkingDrag = false;
        isAreaDrag = false;
        isDraggingPin = false;
        isDraggingPinGroup = false;
        isPinching = false;
        pendingDragHit = null;
        isDraggingLegend = false;
        isResizingLegend = false;
        isMarqueeSelecting = false;
        activePointerIsTouch = false;
        mapTouchStartedOnCanvas = false;
        ndtActivePointerIsTouch = false;
        document.body.classList.remove('dragging-pin');
    };

    function init() {
        window.setupCanvas = setupCanvas;
        window.resizeCanvas = resizeCanvas;
        window.fitToScreen = fitToScreen;
        window.shouldAutoFitMapView = shouldAutoFitMapView;
        window.drawCanvas = drawCanvas;
        window.setupNdtCanvas = setupNdtCanvas;
        window.resizeNdtCanvas = resizeNdtCanvas;
        window.renderNdtSummaryTable = renderNdtSummaryTable;
        window.renderNdtCrackMonitorSection = renderNdtCrackMonitorSection;
        window.bindNdtCrackMonitorInputs = bindNdtCrackMonitorInputs;
        window.openNdtCrackMonitorModal = openNdtCrackMonitorModal;
        window.closeNdtCrackMonitorModal = closeNdtCrackMonitorModal;
        window.isNdtCrackMonitorModalOpen = isNdtCrackMonitorModalOpen;
        window.getSurveyRowsForReport = getSurveyRowsForReport;
        window.isPreviousRoundDefect = isPreviousRoundDefect;
        window.isGrade3Building = isGrade3Building;
        window.getCurrentSurveyRoundKey = getCurrentSurveyRoundKey;
        window.renderSurveyTable = renderSurveyTable;

        initFirebaseSync();
        initAuthEvents();

        try {
            // 로그인 전에는 전역 로컬 점검 데이터를 올리지 않음 (회사 가입 후 클라우드·회사별 캐시 사용)
            setupCanvas();
            renderDashboard();
            window.switchTab('tab-home');
        } catch (bootErr) {
            console.error('앱 UI 초기화 오류:', bootErr);
            try { renderDashboard(); } catch (_e) { /* ignore */ }
        }
        if (typeof setupNdtModalEvents === 'function') setupNdtModalEvents();
        if (typeof setupNdtDisplacementModalEvents === 'function') setupNdtDisplacementModalEvents();
        if (typeof setupStyleColorModalEvents === 'function') setupStyleColorModalEvents();
        if (typeof setupSurveyColumnModalEvents === 'function') setupSurveyColumnModalEvents();
        if (typeof setupLocationMapLegendModalEvents === 'function') setupLocationMapLegendModalEvents();
        if (typeof setupSurveyRoundReassignModalEvents === 'function') setupSurveyRoundReassignModalEvents();
        if (typeof setupClearCarriedOverBulkEvents === 'function') setupClearCarriedOverBulkEvents();
        if (typeof setupTipShapeEvents === 'function') setupTipShapeEvents();
        if (typeof setupAreaMarkStyleEvents === 'function') setupAreaMarkStyleEvents();
        // 로그인 오버레이는 onAuthStateChanged → handleAuthStateChange 가 전담
    }

    init();
    // 도면창이 레이아웃으로 커진 뒤에도 캔버스 해상도를 컨테이너에 맞춤
    if (typeof ResizeObserver !== 'undefined') {
        const mapBox = document.getElementById('canvasContainer');
        if (mapBox) {
            const ro = new ResizeObserver(() => {
                if (window.state && (window.state.currentTab === 'tab-map')) resizeCanvas();
            });
            ro.observe(mapBox);
        }
        const ndtBox = document.getElementById('ndtCanvasContainer');
        if (ndtBox) {
            const ndtRo = new ResizeObserver(() => {
                if (window.state && window.state.currentTab === 'tab-ndt' && typeof resizeNdtCanvas === 'function') {
                    resizeNdtCanvas();
                }
            });
            ndtRo.observe(ndtBox);
        }
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        if (typeof resizeNdtCanvas === 'function') resizeNdtCanvas();
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (typeof window.closeAllMobileCanvasSheets === 'function') window.closeAllMobileCanvasSheets();
            resizeCanvas();
            if (typeof resizeNdtCanvas === 'function') resizeNdtCanvas();
            if ((window.state.currentTab === 'tab-map') && typeof shouldAutoFitMapView === 'function' && shouldAutoFitMapView()) {
                fitToScreen();
            } else if (window.state.currentTab === 'tab-ndt' && typeof shouldAutoFitNdtView === 'function' && shouldAutoFitNdtView()) {
                window.fitNdtCanvas();
            }
        }, 280);
    });
});

/* 고급 필터 떠 있는 창 — 옆 패널 아래에서 잘리거나 가려지던 문제. 열면 body로 옮겨 띄우고, 머리(summary)를 마우스·터치로 끌어 옮김.
   위치는 이번 세션 동안 기억(sessionStorage). 닫으면 원래 자리로 돌려놓아 기존 DOM·id·이벤트는 그대로. */
(function () {
    'use strict';
    var KEY = 'bsa.advFilterPos';
    function init() {
        var d = document.querySelector('.advanced-filter-panel');
        if (!d || d.__advFloat) return;
        d.__advFloat = true;
        var sum = d.querySelector('summary');
        var ph = document.createElement('span');
        ph.className = 'adv-filter-placeholder';
        d.parentNode.insertBefore(ph, d);
        var origin = null;
        function readPos() { try { var v = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return v && isFinite(v.x) && isFinite(v.y) ? v : null; } catch (e) { return null; } }
        function savePos(x, y) { try { sessionStorage.setItem(KEY, JSON.stringify({ x: Math.round(x), y: Math.round(y) })); } catch (e) { /* 무시 */ } }
        function clamp(x, y) {
            var w = d.offsetWidth || 300, h = d.offsetHeight || 200, m = 8;
            var vw = window.innerWidth, vh = window.innerHeight;
            x = Math.min(Math.max(m, x), Math.max(m, vw - w - m));
            y = Math.min(Math.max(m, y), Math.max(m, vh - Math.min(h, vh - 2 * m) - m));
            return { x: x, y: y };
        }
        function place(x, y) { var c = clamp(x, y); d.style.left = c.x + 'px'; d.style.top = c.y + 'px'; return c; }
        function float() {
            if (d.classList.contains('adv-floating')) return;
            var r = d.getBoundingClientRect();
            var visible = r.width > 0 && r.height > 0;
            origin = visible ? { x: r.left, y: r.top } : null;
            document.body.appendChild(d);
            d.classList.add('adv-floating');
            var p = readPos() || origin || { x: window.innerWidth - (d.offsetWidth || 300) - 12, y: 72 };
            place(p.x, p.y);
        }
        function dock() {
            if (!d.classList.contains('adv-floating')) return;
            d.classList.remove('adv-floating', 'adv-dragging');
            d.style.left = ''; d.style.top = '';
            if (ph.parentNode) ph.parentNode.insertBefore(d, ph);
        }
        d.addEventListener('toggle', function () { if (d.open) float(); else dock(); });
        var closeBtn = d.querySelector('.adv-filter-close');
        if (closeBtn) closeBtn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); d.open = false; });
        // 끌기
        var drag = null, suppressClick = false;
        sum.addEventListener('pointerdown', function (e) {
            if (!d.classList.contains('adv-floating') || e.button > 0) return;
            if (e.target.closest && e.target.closest('.adv-filter-close')) return;
            var r = d.getBoundingClientRect();
            drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
        });
        window.addEventListener('pointermove', function (e) {
            if (!drag || e.pointerId !== drag.id) return;
            var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
            if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            if (!drag.moved) { drag.moved = true; d.classList.add('adv-dragging'); try { sum.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } }
            e.preventDefault();
            place(drag.ox + dx, drag.oy + dy);
        });
        function end(e) {
            if (!drag || (e && e.pointerId !== drag.id)) return;
            if (drag.moved) { suppressClick = true; setTimeout(function () { suppressClick = false; }, 350); var r = d.getBoundingClientRect(); savePos(r.left, r.top); }
            d.classList.remove('adv-dragging');
            drag = null;
        }
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        sum.addEventListener('click', function (e) { if (suppressClick) { e.preventDefault(); suppressClick = false; } }, true);
        window.addEventListener('resize', function () { if (d.classList.contains('adv-floating')) { var r = d.getBoundingClientRect(); place(r.left, r.top); } });
        // 다른 탭으로 가면 접어서 원래 자리로
        document.addEventListener('click', function (e) {
            var t = e.target && e.target.closest && e.target.closest('[data-tab], .tab-btn, .nav-tab');
            if (t && d.open && !d.contains(t)) d.open = false;
        }, true);
        if (d.open) float();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
