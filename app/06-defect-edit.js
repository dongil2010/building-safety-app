// @@app-part 06-defect-edit.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 결함 회차 일괄 재지정 모달 ---
    // 건물 전체(또는 현재 층)가 잘못된 회차로 통째로 등록됐을 때, 결함들의 surveyRound를
    // 한번에 올바른 값으로 옮기는 관리자용 복구 기능. 결함 내용은 건드리지 않고 회차 값만 바꾼다.
    function getSurveyReassignScopeKeys(bldg, wholeBuilding) {
        if (!bldg) return [];
        const prefix = `${bldg.id}_`;
        const floorKey = `${bldg.id}_${state.currentFloor}`;
        return Object.keys(state.defects).filter(k => {
            if (!k.startsWith(prefix)) return false;
            return wholeBuilding ? true : k === floorKey;
        });
    }

    function countSurveyReassignMatches(bldg, fromKey, wholeBuilding) {
        const keys = getSurveyReassignScopeKeys(bldg, wholeBuilding);
        let count = 0;
        keys.forEach(k => {
            (state.defects[k] || []).forEach(d => {
                if (d.surveyRound === fromKey) count++;
            });
        });
        return count;
    }

    function updateSurveyReassignPreview() {
        const previewEl = document.getElementById('surveyReassignPreviewCount');
        if (!previewEl) return;
        const bldg = state.currentBuilding;
        if (!bldg) { previewEl.textContent = '건물을 먼저 선택해 주세요.'; return; }
        const fromKey = `${document.getElementById('surveyReassignFromYear').value}_${document.getElementById('surveyReassignFromPeriod').value}`;
        const toKey = `${document.getElementById('surveyReassignToYear').value}_${document.getElementById('surveyReassignToPeriod').value}`;
        const wholeBuilding = document.getElementById('surveyReassignScopeBuilding').checked;
        if (fromKey === toKey) {
            previewEl.textContent = '변경 전/후 회차가 같습니다. 다른 회차를 선택해 주세요.';
            return;
        }
        const count = countSurveyReassignMatches(bldg, fromKey, wholeBuilding);
        const fromLabel = fromKey.replace('_', ' ');
        const toLabel = toKey.replace('_', ' ');
        previewEl.textContent = count > 0
            ? `"${fromLabel}"로 등록된 결함 ${count}건을 "${toLabel}"(으)로 옮깁니다. (${wholeBuilding ? '건물 전체 층' : state.currentFloor + '만'})`
            : `"${fromLabel}"로 등록된 결함이 없습니다.`;
    }

    window.openSurveyRoundReassignModal = function() {
        const bldg = state.currentBuilding;
        if (!bldg) { window.showToast('먼저 건물을 선택해 주세요.', 'warning', 4000); return; }
        // "이렇게 등록된 결함을"은 상단 점검 설정의 현재 값으로 기본 설정
        const curYear = document.getElementById('selectInspectionYear')?.value || '2026년';
        const curPeriod = document.getElementById('selectInspectionPeriod')?.value || '하반기';
        const fromYearEl = document.getElementById('surveyReassignFromYear');
        const fromPeriodEl = document.getElementById('surveyReassignFromPeriod');
        if (fromYearEl) fromYearEl.value = curYear;
        if (fromPeriodEl) fromPeriodEl.value = curPeriod;
        updateSurveyReassignPreview();
        const modal = document.getElementById('surveyRoundReassignModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function closeSurveyRoundReassignModal() {
        const modal = document.getElementById('surveyRoundReassignModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

    async function executeSurveyRoundReassign() {
        const bldg = state.currentBuilding;
        if (!bldg) return;
        const fromKey = `${document.getElementById('surveyReassignFromYear').value}_${document.getElementById('surveyReassignFromPeriod').value}`;
        const toKey = `${document.getElementById('surveyReassignToYear').value}_${document.getElementById('surveyReassignToPeriod').value}`;
        const wholeBuilding = document.getElementById('surveyReassignScopeBuilding').checked;
        if (fromKey === toKey) {
            window.showToast('변경 전/후 회차가 같습니다.', 'warning', 4000);
            return;
        }
        const count = countSurveyReassignMatches(bldg, fromKey, wholeBuilding);
        if (count === 0) {
            window.showToast('해당 회차로 등록된 결함이 없습니다.', 'warning', 4000);
            return;
        }
        const fromLabel = fromKey.replace('_', ' ');
        const toLabel = toKey.replace('_', ' ');
        const scopeLabel = wholeBuilding ? '이 건물 전체 층' : `${state.currentFloor}만`;
        const ok = await window.appConfirm(`"${fromLabel}"로 등록된 결함 ${count}건을 "${toLabel}"(으)로 재지정합니다.\n대상: ${scopeLabel}\n\n이 작업은 되돌릴 수 없습니다. 계속할까요?`);
        if (!ok) return;

        const keys = getSurveyReassignScopeKeys(bldg, wholeBuilding);
        let changed = 0;
        keys.forEach(k => {
            (state.defects[k] || []).forEach(d => {
                if (d.surveyRound === fromKey) {
                    d.surveyRound = toKey;
                    d.isCarriedOver = false;
                    changed++;
                }
            });
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(k);
        });

        // 재지정 이후의 실제 데이터를 기준으로 "최신 회차" 기준점을 다시 계산한다
        // (관리자의 명시적 정정 작업이므로 예외적으로 전진뿐 아니라 재계산을 허용).
        bldg.latestSurveyRoundKey = getMaxSurveyRoundKeyForBuilding(bldg);
        const toRank = getSurveyRoundOrderRank(toKey);
        const latestRank = getSurveyRoundOrderRank(bldg.latestSurveyRoundKey);
        const keepPrevious = toRank !== null && latestRank !== null && toRank < latestRank;
        const droppedTwins = dropOverlappingRoundTwins(
            bldg,
            keepPrevious,
            wholeBuilding ? '' : state.currentFloor
        );

        saveStateToLocalStorage();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();

        const twinNote = droppedTwins > 0 ? ` · 겹친 마킹 ${droppedTwins}건 제거` : '';
        window.showToast(`결함 ${changed}건을 "${toLabel}"(으)로 재지정했습니다.${twinNote}`, 'success', 5000);
        updateSurveyReassignPreview();
    }

    async function cleanupOverlappingRoundMarks() {
        const bldg = state.currentBuilding;
        if (!bldg) {
            window.showToast('먼저 건물을 선택해 주세요.', 'warning', 4000);
            return;
        }
        const wholeBuilding = !!document.getElementById('surveyReassignScopeBuilding')?.checked;
        const scopeLabel = wholeBuilding ? '이 건물 전체 층' : `${state.currentFloor || '현재 층'}만`;
        const ok = await window.appConfirm(
            `같은 번호가 가까이 빨강(전회차)과 파랑(현회차)으로 겹친 마킹 중, 파랑만 지웁니다.\n대상: ${scopeLabel}\n\n회차 값은 바꾸지 않습니다.\n다시 조사해서 일부러 찍은 파랑 핀이 전회차와 120px 안이면 같이 지워질 수 있습니다. 해당 층 실행 취소로 되돌릴 수 있습니다.`
        );
        if (!ok) return;
        const dropped = dropOverlappingRoundTwins(
            bldg,
            true,
            wholeBuilding ? '' : state.currentFloor
        );
        saveStateToLocalStorage();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        window.showToast(
            dropped > 0 ? `겹친 현회차 마킹 ${dropped}건을 지웠습니다.` : '가까이 겹친 전·현회차 쌍이 없습니다.',
            dropped > 0 ? 'success' : 'warning',
            5000
        );
    }

    function setupSurveyRoundReassignModalEvents() {
        const btnOpen = document.getElementById('btnOpenSurveyRoundReassignModal');
        if (btnOpen) btnOpen.addEventListener('click', window.openSurveyRoundReassignModal);

        const btnNextRound = document.getElementById('btnStartNextSurveyRound');
        if (btnNextRound) btnNextRound.addEventListener('click', window.startNextSurveyRound);

        const btnClose1 = document.getElementById('btnCloseSurveyRoundReassignModal');
        if (btnClose1) btnClose1.addEventListener('click', closeSurveyRoundReassignModal);
        const btnClose2 = document.getElementById('btnCloseSurveyRoundReassignModal2');
        if (btnClose2) btnClose2.addEventListener('click', closeSurveyRoundReassignModal);

        ['surveyReassignFromYear', 'surveyReassignFromPeriod', 'surveyReassignToYear', 'surveyReassignToPeriod',
         'surveyReassignScopeBuilding', 'surveyReassignScopeFloor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', updateSurveyReassignPreview);
        });

        const btnExecute = document.getElementById('btnExecuteSurveyRoundReassign');
        if (btnExecute) btnExecute.addEventListener('click', executeSurveyRoundReassign);
        const btnCleanupTwins = document.getElementById('btnCleanupOverlappingRoundMarks');
        if (btnCleanupTwins) btnCleanupTwins.addEventListener('click', cleanupOverlappingRoundMarks);
    }

    // 엑셀 전차 가져오기 등으로 isCarriedOver(전회차 체크)가 켜진 결함을 PC에서 일괄 해제
    function countCarriedOverInKeys(keys) {
        let n = 0;
        (keys || []).forEach((k) => {
            (state.defects[k] || []).forEach((d) => {
                if (d && d.isCarriedOver) n++;
            });
        });
        return n;
    }

    function countPreviousRoundInKeys(keys) {
        let n = 0;
        (keys || []).forEach((k) => {
            (state.defects[k] || []).forEach((d) => {
                if (d && isPreviousRoundDefect(d)) n++;
            });
        });
        return n;
    }

    // 한글(HWPX)·도면 캔버스용 Storage 이미지 프록시 — OCR Worker와 동일 엔드포인트(action=proxyStorage).
    // 버킷 CORS 없거나 규칙이 인증을 요구하면 downloadURL 단독 fetch가 403/CORS로 실패한다.
    const STORAGE_IMAGE_PROXY_ENDPOINT =
        (typeof CLOUD_OCR_ENDPOINT === 'string' && CLOUD_OCR_ENDPOINT)
            ? CLOUD_OCR_ENDPOINT
            : 'https://frosty-king-12ef.dongilgujo2010.workers.dev';

    async function blobResponseToDataUrl(blob) {
        if (window.BSA && window.BSA.storageAssets && typeof window.BSA.storageAssets.blobToDataUrl === 'function') {
            return window.BSA.storageAssets.blobToDataUrl(blob);
        }
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('blobToDataUrl failed')); };
            reader.readAsDataURL(blob);
        });
    }

    async function fetchStorageImageViaProxy(url) {
        if (!STORAGE_IMAGE_PROXY_ENDPOINT || !url || !/^https?:\/\//i.test(url)) return null;
        let authToken = '';
        try {
            if (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) {
                authToken = await firebase.auth().currentUser.getIdToken();
            }
        } catch (_e) { /* 비로그인 시 토큰 URL만 시도 */ }
        const resp = await fetch(STORAGE_IMAGE_PROXY_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'proxyStorage',
                url: String(url),
                authToken: (/[?&]token=/.test(String(url)) ? undefined : (authToken || undefined))
            })
        });
        const ct = String(resp.headers.get('content-type') || '').toLowerCase();
        if (resp.ok && (ct.indexOf('image/') === 0 || ct.indexOf('application/pdf') === 0
            || ct.indexOf('application/octet-stream') === 0)) {
            const blob = await resp.blob();
            if (!blob || !blob.size) throw new Error('Storage 프록시 빈 응답');
            return blobResponseToDataUrl(blob);
        }
        let data = null;
        try {
            data = await resp.json();
        } catch (_e) {
            data = null;
        }
        if (!resp.ok) {
            const errText = (data && data.error) ? String(data.error) : ('Storage 프록시 HTTP ' + resp.status);
            if (/image 필드가 없거나|아직 배포되지/.test(errText)) {
                throw new Error(
                    'Storage 프록시가 Worker에 아직 배포되지 않았습니다. '
                    + 'cloudflare-worker/ 에서 wrangler deploy 하세요.'
                );
            }
            throw new Error(errText);
        }
        if (!data || typeof data.dataUrl !== 'string' || data.dataUrl.indexOf('data:') !== 0) {
            throw new Error((data && data.error) || 'Storage 프록시 응답 없음');
        }
        return data.dataUrl;
    }
    window.fetchStorageImageViaProxy = fetchStorageImageViaProxy;
    if (window.BSA && window.BSA.storageAssets && typeof window.BSA.storageAssets.setAssetProxy === 'function') {
        window.BSA.storageAssets.setAssetProxy(fetchStorageImageViaProxy);
    }

    /** 한글 임베드용: IDB에 dataURL이 남아 있으면 https보다 우선 */
    async function resolveSrcForHwpxEmbed(src, photoIdHint) {
        if (src && typeof src === 'string' && src.indexOf('data:') === 0) return src;
        if (photoIdHint && typeof idbGet === 'function') {
            try {
                const local = await idbGet('photos', photoIdHint);
                if (local && typeof local === 'string' && local.indexOf('data:') === 0) return local;
            } catch (_e) { /* ignore */ }
        }
        return src;
    }

    /** IDB에 https로 dataURL을 덮어쓰지 않음(한글 출력용 로컬 바이트 보존) */
    async function idbSetPhotoPreferDataUrl(pid, url) {
        if (!pid || !url || typeof idbSet !== 'function') return false;
        if (typeof url === 'string' && url.indexOf('data:') === 0) {
            return idbSet('photos', pid, url);
        }
        try {
            const existing = typeof idbGet === 'function' ? await idbGet('photos', pid) : null;
            if (existing && typeof existing === 'string' && existing.indexOf('data:') === 0) {
                return true;
            }
        } catch (_e) { /* ignore */ }
        return idbSet('photos', pid, url);
    }

    const HWPX_IMAGE_FETCH_MS = 8000;
    const _hwpxBytesByUrl = new Map();

    function withTimeout(promise, ms, label) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(label || '시간 초과')), ms);
            Promise.resolve(promise).then(
                (v) => { clearTimeout(t); resolve(v); },
                (e) => { clearTimeout(t); reject(e); }
            );
        });
    }

    async function mapLimit(items, limit, worker) {
        const list = Array.from(items || []);
        const out = new Array(list.length);
        let cursor = 0;
        async function workerLoop() {
            while (cursor < list.length) {
                const idx = cursor++;
                out[idx] = await worker(list[idx], idx);
            }
        }
        const n = Math.max(1, Math.min(limit || 4, list.length || 1));
        await Promise.all(Array.from({ length: Math.min(n, Math.max(list.length, 0)) }, () => workerLoop()));
        return out;
    }

    async function decodeDataUrlToBytes(raw) {
        const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(raw);
        if (!m) throw new Error('이미지 데이터 형식을 인식할 수 없습니다.');
        const mimeRaw = (m[1] || 'image/jpeg').toLowerCase();
        try {
            const resp = await fetch(raw);
            const bytes = new Uint8Array(await resp.arrayBuffer());
            if (mimeRaw === 'image/png') return { bytes, mime: 'image/png', ext: 'png' };
            return { bytes, mime: 'image/jpeg', ext: 'jpg' };
        } catch (_e) {
            const binary = atob(m[2]);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            if (mimeRaw === 'image/png') return { bytes, mime: 'image/png', ext: 'png' };
            return { bytes, mime: 'image/jpeg', ext: 'jpg' };
        }
    }

    /**
     * dataURL / https(Storage) / blob URL → HWPX BinData용 바이트.
     * Storage 이전 후 한글 출력 시 https URL이 들어오므로 fetch + Worker 프록시 필수.
     */
    async function imageSrcToBytes(src) {
        if (!src || typeof src !== 'string') {
            throw new Error('이미지 데이터 형식을 인식할 수 없습니다.');
        }
        const raw = src.trim();
        if (raw.startsWith('data:')) {
            return decodeDataUrlToBytes(raw);
        }
        if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:')) {
            if (_hwpxBytesByUrl.has(raw)) return _hwpxBytesByUrl.get(raw);
            const pending = (async () => {
            let bytes = null;
            let mime = 'image/jpeg';
            // Storage SDK(getBlob)/REST 우선
            try {
                if (typeof assetUrlToUploadBlob === 'function') {
                    const pack = await withTimeout(assetUrlToUploadBlob(raw), HWPX_IMAGE_FETCH_MS, 'Storage 이미지 수신 시간 초과');
                    if (pack && pack.blob) {
                        bytes = new Uint8Array(await pack.blob.arrayBuffer());
                        mime = String(pack.contentType || pack.blob.type || 'image/jpeg').toLowerCase();
                    }
                }
            } catch (_sdkErr) { /* fall through */ }
            if (!bytes) {
                try {
                    const resp = await withTimeout(
                        fetch(raw, { mode: 'cors', credentials: 'omit', cache: 'force-cache' }),
                        HWPX_IMAGE_FETCH_MS,
                        '이미지 fetch 시간 초과'
                    );
                    if (resp.ok) {
                        bytes = new Uint8Array(await resp.arrayBuffer());
                        mime = ((resp.headers.get('content-type') || '').split(';')[0] || '').trim().toLowerCase();
                    }
                } catch (_corsErr) { /* CORS — 프록시로 */ }
            }
            // 버킷 CORS 미설정 시 Worker가 서버에서 받아 dataURL로 돌려줌
            if (!bytes && /^https?:\/\//i.test(raw)) {
                try {
                    const proxied = await withTimeout(
                        fetchStorageImageViaProxy(raw),
                        HWPX_IMAGE_FETCH_MS,
                        'Storage 프록시 시간 초과'
                    );
                    if (proxied) return imageSrcToBytes(proxied);
                } catch (proxyErr) {
                    console.warn('Storage 이미지 프록시 실패:', proxyErr);
                }
            }
            if (!bytes) throw new Error('이미지 다운로드 실패 (CORS/Storage)');
            if (!mime.startsWith('image/')) {
                if (raw.toLowerCase().includes('.png')) mime = 'image/png';
                else mime = 'image/jpeg';
            }
            if (mime === 'image/jpg') mime = 'image/jpeg';
            // 한글은 webp/gif 임베드가 불안정 → JPEG로 변환
            if (mime === 'image/webp' || mime === 'image/gif' || mime === 'image/bmp') {
                const dataUrl = await new Promise((resolve, reject) => {
                    const blob = new Blob([bytes], { type: mime });
                    const objUrl = URL.createObjectURL(blob);
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth || img.width;
                            canvas.height = img.naturalHeight || img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/jpeg', 0.92));
                        } catch (e) { reject(e); }
                        finally { URL.revokeObjectURL(objUrl); }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(objUrl);
                        reject(new Error('이미지 변환에 실패했습니다.'));
                    };
                    img.src = objUrl;
                });
                return imageSrcToBytes(dataUrl);
            }
            if (mime === 'image/png') return { bytes, mime: 'image/png', ext: 'png' };
            return { bytes, mime: 'image/jpeg', ext: 'jpg' };
            })();
            _hwpxBytesByUrl.set(raw, pending);
            try {
                return await pending;
            } catch (e) {
                _hwpxBytesByUrl.delete(raw);
                throw e;
            }
        }
        throw new Error('이미지 데이터 형식을 인식할 수 없습니다.');
    }

    function loadImageNaturalSizeFromBytes(bytes, mime) {
        return new Promise((resolve, reject) => {
            if (!bytes || !bytes.length) {
                reject(new Error('이미지를 불러오지 못했습니다.'));
                return;
            }
            const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
            const objUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth || img.width;
                const h = img.naturalHeight || img.height;
                URL.revokeObjectURL(objUrl);
                if (!w || !h) reject(new Error('이미지를 불러오지 못했습니다.'));
                else resolve({ w, h });
            };
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                reject(new Error('이미지를 불러오지 못했습니다.'));
            };
            img.src = objUrl;
        });
    }

    function loadImageNaturalSize(src) {
        return new Promise(async (resolve, reject) => {
            if (!src) {
                reject(new Error('이미지를 불러오지 못했습니다.'));
                return;
            }
            // https Storage URL은 CORS로 Image() 로드가 자주 실패 → 바이트로 받아 object URL 사용
            if (/^https?:\/\//i.test(String(src))) {
                try {
                    const pack = await imageSrcToBytes(src);
                    const size = await loadImageNaturalSizeFromBytes(pack.bytes, pack.mime);
                    resolve(size);
                    return;
                } catch (e) {
                    reject(e);
                    return;
                }
            }
            const img = new Image();
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
            img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
            img.src = src;
        });
    }

    /**
     * 현회차 출력(사진첩·보고서·상태조사표 사진란)에 쓸 사진 — defect.photos(현차)만.
     * prevRoundPhotos(전차)는 제외. 전회차 결함도 현차에 새로 넣은 photos는 출력한다.
     */
    function getDefectOutputPhotos(defect) {
        if (!defect) return [];
        return (Array.isArray(defect.photos) ? defect.photos : []).filter(Boolean);
    }

    /**
     * 한글 사진첩용 — 조사표 한 줄에 딸린 현차 사진을 전부 { src, pid }로 모은다.
     * 묶음(한 번호에 마킹 여러 개) 줄은 대표만 보면 다른 마킹에 넣은 사진이 통째로 빠지므로
     * (2026-10-07 광주교회 지하층 NO.11: 사진 2장이 대표 아닌 마킹에 있어 출력 0장) 구성원 전체를 본다.
     * 사진은 서버에서 받아 온 뒤 읽어야 하므로 async. 같은 사진 ID는 한 번만 넣는다.
     */
    async function loadHwpxRowPhotoEntries(row) {
        if (!row) return [];
        const members = (Array.isArray(row._groupMembers) && row._groupMembers.length) ? row._groupMembers.slice() : [];
        const rep = row._representative || null;
        // 대표 사진이 먼저 오게. 묶음이 아니면 줄 자신(= 실제 결함)만 본다.
        const sources = members.length
            ? (rep && members.indexOf(rep) > 0 ? [rep].concat(members.filter((m) => m !== rep)) : members)
            : [row];
        await Promise.all(sources.map((m) => ensureDefectPhotosLoaded(m)));
        const seen = new Set();
        const out = [];
        sources.forEach((m) => {
            const photos = Array.isArray(m.photos) ? m.photos : [];
            const ids = Array.isArray(m.photoIds) ? m.photoIds : [];
            photos.forEach((src, i) => {
                if (!src) return;
                const pid = ids[i] || null;
                const key = pid || src;
                if (seen.has(key)) return;
                seen.add(key);
                out.push({ src, pid });
            });
        });
        return out;
    }

    /**
     * 조사표 비고 칸의 사진 번호: 1장 "사진5", 여러 장 "사진5~6".
     * "사진5, 사진6"으로 쓰면 좁은 비고 칸에서 두 줄로 꺾여 줄 높이가 달라진다 — 한 줄에 들어가는 범위 표기로.
     */
    function formatHwpxPhotoRemark(firstNo, count) {
        if (!count) return '';
        if (count === 1) return `사진${firstNo}`;
        return `사진${firstNo}~${firstNo + count - 1}`;
    }

    /** 한글·보고서 전·금회차 비교사진(전차) — defect.prevRoundPhotos만 */
    function getDefectPrevOutputPhotos(defect) {
        if (!defect) return [];
        return (Array.isArray(defect.prevRoundPhotos) ? defect.prevRoundPhotos : []).filter(Boolean);
    }

    // 사진 하나를 IDB → 메모리 캐시 → (그래도 없으면) 클라우드 순으로 찾는다. hydrateDefectPhotos의
    // loadIds와 같은 순서 — 여기 클라우드 폴백이 빠져 있었던 게 실제 버그였다: 건물 전환 직후처럼
    // 백그라운드 사진 로딩(hydrateDefectPhotos)이 아직 안 끝난 사이에 한글 내보내기를 누르면,
    // IDB·캐시 둘 다 아직 없어서(클라우드 재조회 없이) 사진이 "안 찍은 것처럼" 빠진 채로 나갔다
    // (사용자가 실제로 겪음).
    const _nonExistentPhotoIds = new Set();

    async function acquirePhotoFetchSlot() {
        if (typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused()) return false;
        const maxConc = (typeof PHOTO_FETCH_MAX_CONCURRENT === 'number') ? PHOTO_FETCH_MAX_CONCURRENT : 4;
        while (typeof _photoFetchInflight === 'number' && _photoFetchInflight >= maxConc) {
            await new Promise((r) => setTimeout(r, 40));
            if (typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused()) return false;
        }
        if (typeof _photoFetchInflight === 'number') _photoFetchInflight += 1;
        return true;
    }
    function releasePhotoFetchSlot() {
        if (typeof _photoFetchInflight === 'number' && _photoFetchInflight > 0) _photoFetchInflight -= 1;
    }
    async function fetchPhotosDocIfAllowed(pid) {
        if (!pid || !db || !window.state.companyId) return null;
        if (typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused()) return null;
        const ok = await acquirePhotoFetchSlot();
        if (!ok) return null;
        try {
            return await db.collection('safety_app').doc(getCompanyDocId()).collection('photos').doc(pid).get();
        } catch (e) {
            if (typeof isFirestoreQuotaError === 'function' && isFirestoreQuotaError(e)
                && typeof pauseFirestoreReads === 'function') {
                pauseFirestoreReads(typeof SYNC_QUOTA_COOLDOWN_MS === 'number' ? SYNC_QUOTA_COOLDOWN_MS : 120000);
            }
            throw e;
        } finally {
            releasePhotoFetchSlot();
        }
    }
    async function loadPhotoIdsWithCloudCap(ids) {
        const list = Array.isArray(ids) ? ids : [];
        if (!list.length) return [];
        const cap = (typeof PHOTO_FETCH_MAX_PER_HYDRATE === 'number') ? PHOTO_FETCH_MAX_PER_HYDRATE : 24;
        const out = new Array(list.length).fill(null);
        for (let start = 0; start < list.length; start += cap) {
            if (typeof isFirestoreReadPaused === 'function' && isFirestoreReadPaused()) break;
            const slice = list.slice(start, start + cap);
            const filled = await Promise.all(slice.map(loadPhotoByIdWithCloudFallback));
            filled.forEach((url, j) => { out[start + j] = url; });
        }
        return out;
    }

    async function loadPhotoByIdWithCloudFallback(pid) {
        if (!pid) return null;
        if (_nonExistentPhotoIds.has(pid)) return null;
        if (window._photoCache && window._photoCache[pid]) {
            return window._photoCache[pid];
        }
        const fromIdb = await idbGet('photos', pid);
        if (fromIdb) {
            if (!window._photoCache) window._photoCache = {};
            window._photoCache[pid] = fromIdb;
            return fromIdb;
        }
        if (!db || !window.state.companyId) return null;
        try {
            const snap = await fetchPhotosDocIfAllowed(pid);
            if (!snap) return null;
            if (!snap.exists) {
                _nonExistentPhotoIds.add(pid);
                return null;
            }
            const url = await photoUrlFromCloudSnap(snap, pid);
            if (url) {
                if (!window._photoCache) window._photoCache = {};
                window._photoCache[pid] = url;
                idbSetPhotoPreferDataUrl(pid, url).then(ok => { if (ok && _idbPersistedPhotoKeys) _idbPersistedPhotoKeys.add(pid); });
                return url;
            }
            _nonExistentPhotoIds.add(pid);
            return null;
        } catch (e) {
            if (typeof isFirestoreQuotaError === 'function' && isFirestoreQuotaError(e)
                && typeof pauseFirestoreReads === 'function') {
                pauseFirestoreReads(typeof SYNC_QUOTA_COOLDOWN_MS === 'number' ? SYNC_QUOTA_COOLDOWN_MS : 120000);
            }
            return null;
        }
    }

    async function ensureDefectPhotosLoaded(d) {
        if (!d) return;
        seedPhotoCacheFromDefect(d);
        // 한 장이라도 있으면 "다 있다"고 넘어가던 것을 빈 칸만 골라 채우게 고침 — 여러 장 중 일부만
        // 받아진 결함은 나머지가 끝까지 안 채워져 출력에서 빠졌다.
        const fillMissing = async (ids, cur) => {
            if (!ids || !ids.length) return null;
            const have = Array.isArray(cur) ? cur : [];
            const need = ids.map((pid, i) => (have[i] ? null : pid));
            if (!need.some(Boolean)) return null;
            const filled = await loadPhotoIdsWithCloudCap(need);
            if (!filled.some(Boolean)) return null;
            const n = Math.max(ids.length, have.length);
            // 옛 데이터는 photos가 빈 칸 없이 당겨져 있어 photoIds와 자리가 어긋날 수 있다 — 이미 있는 사진은 다시 넣지 않는다.
            const haveSet = new Set(have.filter(Boolean));
            return Array.from({ length: n }, (_, i) => have[i] || (haveSet.has(filled[i]) ? null : filled[i]) || null);
        };
        const cur = await fillMissing(d.photoIds, d.photos);
        if (cur) d.photos = cur;
        const prev = await fillMissing(d.prevRoundPhotoIds, d.prevRoundPhotos);
        if (prev) d.prevRoundPhotos = prev;
    }

    // 사진 문서 id는 `${결함id}_${순번}` 형식으로 정해져 있다(getPhotoDocId) — mergeDefectRecord의
    // 예전 버그로 photoIds 참조 자체가 지워진 결함이라도, 사진 원본은 클라우드(Firestore 'photos'
    // 컬렉션)에 그 id로 그대로 남아있을 가능성이 높다. photoIds가 비어있는 결함마다 0번부터 순서대로
    // 존재 여부를 확인해서, 실제로 남아있는 사진을 찾으면 photoIds를 복구해준다.
    async function probePhotoDocExists(pid) {
        if (!db || !window.state.companyId || !pid) return false;
        if (_nonExistentPhotoIds.has(pid)) return false;
        try {
            const snap = await fetchPhotosDocIfAllowed(pid);
            if (!snap) return false;
            const exists = !!(snap.exists && snap.data() && (
                hasFirebaseStorageMeta(snap.data())
                || snap.data().dataUrl
            ));
            if (!exists) _nonExistentPhotoIds.add(pid);
            return exists;
        } catch (e) {
            return false;
        }
    }

    window.repairMissingPhotoIds = async function (opts) {
        const options = opts || {};
        const maxProbe = options.maxProbe || 30;
        const buildingId = options.buildingId || window.state.currentBuildingId;
        if (!buildingId) { window.showToast('건물을 먼저 선택하세요.', 'warning'); return { checked: 0, recovered: 0 }; }
        const keys = Object.keys(window.state.defects || {}).filter((k) => k.startsWith(`${buildingId}_`));
        let checked = 0;
        let recovered = 0;
        for (const key of keys) {
            const arr = window.state.defects[key] || [];
            for (const d of arr) {
                if (!d || !d.id) continue;
                const needCur = (!d.photoIds || d.photoIds.length === 0) && (!d.photos || d.photos.length === 0);
                const needPrev = (!d.prevRoundPhotoIds || d.prevRoundPhotoIds.length === 0) && (!d.prevRoundPhotos || d.prevRoundPhotos.length === 0);
                if (!needCur && !needPrev) continue;
                checked++;
                if (needCur) {
                    const foundIds = [];
                    for (let i = 0; i < maxProbe; i++) {
                        const pid = getPhotoDocId(d.id, i);
                        if (await probePhotoDocExists(pid)) foundIds.push(pid);
                        else if (foundIds.length > 0 || i > 2) break; // 몇 번 연속 없으면 그만 찾음(사진 없는 결함일 뿐)
                    }
                    if (foundIds.length > 0) { d.photoIds = foundIds; recovered++; }
                }
                if (needPrev) {
                    const foundPrevIds = [];
                    for (let i = 0; i < maxProbe; i++) {
                        const pid = getPhotoDocId(d.id, i, 'prev');
                        if (await probePhotoDocExists(pid)) foundPrevIds.push(pid);
                        else if (foundPrevIds.length > 0 || i > 2) break;
                    }
                    if (foundPrevIds.length > 0) { d.prevRoundPhotoIds = foundPrevIds; recovered++; }
                }
            }
        }
        if (recovered > 0) {
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
            if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
            if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        }
        window.showToast(`사진 참조 없는 결함 ${checked}건 확인, ${recovered}건 복구됨.`, recovered > 0 ? 'success' : 'info', 5000);
        return { checked, recovered };
    };

    /** 현회차 photos를 prevRoundPhotos로 옮기고 현회차 사진 슬롯을 비운다. 보관 장수 반환. */
    async function archiveDefectPhotosToPrevRound(d) {
        if (!d) return 0;
        await ensureDefectPhotosLoaded(d);
        const current = (Array.isArray(d.photos) ? d.photos : []).filter(Boolean);
        const oldCount = current.length;
        if (oldCount > 0) {
            const archived = Array.isArray(d.prevRoundPhotos) ? d.prevRoundPhotos.slice() : [];
            // 전회차 목록도 같이 늘린다. 안 늘리면 옮긴 사진이 자리 번호(_prev_2 …)로 떨어져, 예전에 쓰던
            // 같은 이름의 옛 사진이 클라우드에 남아 있으면 그 사진이 대신 보인다.
            const archivedIds = defectPhotoIdList(d, archived.length, 'prev');
            d.prevRoundPhotos = archived.concat(current);
            d.prevRoundPhotoIds = archivedIds.concat(assignDefectPhotoIds(d.id, current, null, 'prev'));
        }
        const oldPhotoCount = (d.photoIds && d.photoIds.length) || oldCount;
        // 목록을 지우기 전에 옛 사진 ID를 받아 둔다
        const oldPhotoIds = defectPhotoIdList(d, oldPhotoCount);
        d.photos = [];
        delete d.photoIds;
        if (typeof invalidatePersistedPhotoCacheForDefect === 'function') {
            invalidatePersistedPhotoCacheForDefect(d.id);
        }
        // 예전 인덱스 키(defectId_0 …)는 현회차와 충돌하므로 IDB에서 제거
        oldPhotoIds.forEach((pid) => {
            _idbPersistedPhotoKeys.delete(pid);
            idbDelete('photos', pid);
        });
        return oldCount;
    }

    /**
     * 건물 모든 층의 전회차 조사항목을 현회차로 가져온다.
     * - isCarriedOver(전회차 체크) 해제
     * - surveyRound를 현회차(latestSurveyRoundKey / 현재 선택 회차)로 변경
     * - 기존 사진은 prevRoundPhotos로 보관하고 photos는 비움(현회차 신규 사진만 출력)
     * 결함 내용·도면 위치는 그대로 둔다.
     */
    async function promotePreviousRoundToCurrentBulk() {
        const bldg = state.currentBuilding;
        if (!bldg || !state.currentBuildingId) {
            window.showToast('건물을 먼저 선택하세요.', 'warning', 3500);
            return;
        }
        const keys = getSurveyReassignScopeKeys(bldg, true);
        const count = countPreviousRoundInKeys(keys);
        if (count === 0) {
            window.showToast('전회차 조사항목이 없습니다.', 'info', 3500);
            return;
        }
        const toKey = (bldg.latestSurveyRoundKey) || getCurrentSurveyRoundKey();
        const toLabel = toKey.replace('_', ' ');
        if (!await window.appConfirm(
            `모든 층의 전회차 조사항목 ${count}건을 현회차(${toLabel})로 가져올까요?\n\n` +
            `· 전회차 체크 해제\n` +
            `· 조사 회차를 현회차로 변경\n` +
            `· 기존 사진은 「전차 사진」으로 표시 (현장에서 확인 가능, 현차 출력 제외)\n` +
            `· 결함 내용·도면 위치는 유지`
        )) return;

        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        let changed = 0;
        let archivedPhotoCount = 0;

        for (const k of keys) {
            const arr = state.defects[k] || [];
            for (const d of arr) {
                if (!d || !isPreviousRoundDefect(d)) continue;
                archivedPhotoCount += await archiveDefectPhotosToPrevRound(d);
                d.isCarriedOver = false;
                d.surveyRound = toKey;
                if (d.prevRoundPhotos && d.prevRoundPhotos.length > 0) {
                    uploadDefectPhotos(d.id, d.prevRoundPhotos, 'prev', d.prevRoundPhotoIds);
                }
                changed++;
            }
        }

        saveStateToLocalStorage();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        const photoNote = archivedPhotoCount > 0
            ? ` · 전차 사진 ${archivedPhotoCount}장 보관(현장에서 확인 가능)`
            : '';
        window.showToast(`모든 층 전회차 ${changed}건 → 현회차(${toLabel}) 완료${photoNote}`, 'success', 5500);
    }
    window.promotePreviousRoundToCurrentBulk = promotePreviousRoundToCurrentBulk;

    // --- 전차 사진 가져오기 (2026-09-30) ---
    // 「전차 사진 → 현차로 옮기기」 (2026-09-30, 같은 날 고침: 기본은 현차 사진 칸)
    // 같은 현장의 이전 회차 점검(별도 점검)에 있던 결함 사진을, 이 점검에서 맞는 결함의 사진으로 복사한다.
    // 맞추기: js/core/prev-round-photo-match.js (같은 층 + 같은 번호, 없으면 마킹 위치). 미리보기 → 확인 뒤에만 바꾼다.
    // - 기본(mode 'cur'): 현차 사진(photos/photoIds — 출력되는 사진) 맨 뒤에 붙인다. 기존 사진은 그대로.
    //   옮긴 원본 사진 ID를 결함의 copiedPhotoSrcIds 에 적어 두어, 다시 눌러도 같은 사진을 또 넣지 않는다
    //   (옮긴 사진을 지운 뒤 다시 눌러도 되살리지 않음).
    // - 보조(mode 'prev'): 「전차 사진」 칸. 이미 전차 사진이 있는 결함은 덮어쓰지 않는다.
    // - 사진은 새 ID로 복사하고 Storage에도 새로 올린다(회차 추가하기와 같은 방식) — 전차 점검을 지워도 남는다.
    // - 서버 읽기: 두 점검의 층 문서(층마다 1회, 최근에 받았으면 생략) + 복사할 사진마다 사진 문서 1회(기기에 있으면 생략).
    //   미리보기는 사진 ID 개수만 세므로 사진을 읽지 않는다.
    const PREV_ROUND_PHOTO_TITLE = { cur: '전차 사진 → 현차로 옮기기', prev: '전차 사진 → 전차 사진 칸으로' };

    function prevRoundPhotoMatchApi() {
        return (window.BSA && window.BSA.prevRoundPhotoMatch) || null;
    }

    /**
     * 옮겨 올 수 있는 회차: 같은 현장·같은 동의 다른 점검 전부(현차 = 지금 연 점검 빼고).
     * 회차 순서 최신 → 옛날. 앞선 회차 중 가장 가까운 것을 기본으로 고른다(rank 모르면 앞선 것으로 본다).
     */
    function getPrevRoundPhotoSourceCandidates(bldg) {
        if (!bldg) return [];
        const site = getBuildingSiteName(bldg);
        const curRank = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(bldg));
        const dong = formatDongRowLabel(bldg);
        const rankOf = (b) => {
            const r = getSurveyRoundOrderRank(getBuildingSurveyRoundKey(b));
            return r === null || r === undefined ? -Infinity : r;
        };
        return getSiteBuildingsSorted(site)
            .filter((b) => b && b.id !== bldg.id && formatDongRowLabel(b) === dong)
            .map((b, order) => ({ b, order, rank: rankOf(b) }))
            .sort((x, y) => (y.rank - x.rank) || (x.order - y.order))
            .map((x) => {
                let rel = 'earlier';
                if (curRank !== null && curRank !== undefined && x.rank !== -Infinity) {
                    rel = x.rank < curRank ? 'earlier' : (x.rank > curRank ? 'later' : 'same');
                }
                return { bldg: x.b, rel };
            });
    }

    /** 이 기기에 있는 결함·사진 수(회차 고르기 창에 보여 줄 대략치 — 서버 읽기 없음) */
    function prevRoundPhotoLocalCounts(b) {
        const api = prevRoundPhotoMatchApi();
        let defects = 0;
        let photos = 0;
        let withPhoto = 0;
        buildingFloorCodesForBackup(b).forEach((code) => {
            (state.defects[`${b.id}_${code}`] || []).forEach((d) => {
                if (!d) return;
                defects++;
                const n = api ? api.photoCount(d) : 0;
                photos += n;
                if (n) withPhoto++;
            });
        });
        return { defects, photos, withPhoto };
    }

    function prevRoundPhotoFloorLabel(code, bldg) {
        try {
            return stripFloorCodeSuffix(window.getFloorLabelFromCode(code, bldg)) || code;
        } catch (_e) {
            return code;
        }
    }

    function prevRoundPhotoDefectLabel(d, floorCode, bldg) {
        const api = prevRoundPhotoMatchApi();
        const no = api ? api.noKey(d) : String(d && (d.groupNo || d.no) || '');
        const what = [d && d.component, d && d.defectType].filter(Boolean).join(' ');
        return `${prevRoundPhotoFloorLabel(floorCode, bldg)} NO.${no}${what ? ` (${what})` : ''}`;
    }

    /** 전차 점검 층 → 현차 층 (같은 층 코드, 없으면 같은 층 이름) */
    function mapPrevRoundFloorsToTarget(srcBldg, tgtBldg) {
        const tgtCodes = buildingFloorCodesForBackup(tgtBldg);
        const tgtSet = new Set(tgtCodes);
        const byLabel = new Map();
        tgtCodes.forEach((c) => {
            const label = prevRoundPhotoFloorLabel(c, tgtBldg);
            if (label && !byLabel.has(label)) byLabel.set(label, c);
        });
        const map = {};
        buildingFloorCodesForBackup(srcBldg).forEach((code) => {
            if (tgtSet.has(code)) { map[code] = code; return; }
            const viaLabel = byLabel.get(prevRoundPhotoFloorLabel(code, srcBldg));
            map[code] = viaLabel || code;
        });
        return map;
    }

    /** 전차 결함 사진 중 indexes 자리만 불러온다. keys: 성공한 사진의 원본 ID(옮김 기록용) */
    async function loadPrevRoundSourcePhotos(src, indexes) {
        const api = prevRoundPhotoMatchApi();
        const count = api ? api.photoCount(src) : 0;
        const inline = Array.isArray(src.photos) ? src.photos : [];
        const ids = defectPhotoIdList(src, count);
        const keys = api ? api.srcPhotoKeys(src) : ids;
        const want = Array.isArray(indexes) ? indexes : ids.map((_x, i) => i);
        const urls = [];
        const okKeys = [];
        let failed = 0;
        for (const i of want) {
            let url = inline[i] || null;
            if (!url && ids[i]) {
                try { url = await loadPhotoBlobForClone(ids[i]); } catch (_e) { url = null; }
            }
            if (url) { urls.push(url); okKeys.push(keys[i]); } else failed++;
        }
        return { urls, keys: okKeys, failed };
    }

    /**
     * 현차 결함 t의 사진(출력되는 사진) 맨 뒤에 붙인다. 기존 사진 ID·순서는 그대로.
     * 사진 ID 단위 병합(photoState)·사진 변경 시각을 결함 수정 창과 같은 방식으로 남긴다.
     */
    /** 기존 현차 사진이 모두 이미지로 있는가(인라인 또는 캐시) — 빈 칸이 있으면 붙이지 않는다 */
    function currentPhotosAllResolvable(t) {
        const api = prevRoundPhotoMatchApi();
        const n = api.photoCount(t);
        const ids = defectPhotoIdList(t, n);
        const inline = Array.isArray(t.photos) ? t.photos : [];
        const cache = window._photoCache || {};
        return ids.every((pid, i) => !!(inline[i] || cache[pid]));
    }

    function appendCurrentRoundPhotosToDefect(t, urls, srcKeys) {
        const api = prevRoundPhotoMatchApi();
        const n = api.photoCount(t);
        const beforeIds = defectPhotoIdList(t, n);
        const cache = window._photoCache || {};
        const inline = Array.isArray(t.photos) ? t.photos : [];
        const newIds = assignDefectPhotoIds(t.id, urls, null);
        const existingSrc = beforeIds.map((pid, i) => inline[i] || cache[pid] || null);
        if (existingSrc.some((u) => !u)) throw new Error('기존 사진을 불러오지 못함');   // currentPhotosAllResolvable 로 먼저 거름
        const photos = existingSrc.concat(urls);
        t.photoIds = beforeIds.concat(newIds);
        t.photos = photos;
        if (Array.isArray(t.photoUrls)) {
            const u = t.photoUrls.slice(0, n);
            while (u.length < n) u.push('');
            t.photoUrls = u.concat(urls.map(() => ''));
        }
        recordDefectPhotoState(t, beforeIds, t.photoIds);
        stampDefectPhotosChangedIfSafe(t);
        const done = Array.isArray(t.copiedPhotoSrcIds) ? t.copiedPhotoSrcIds.slice() : [];
        (srcKeys || []).forEach((k) => { if (k && !done.includes(k)) done.push(k); });
        t.copiedPhotoSrcIds = done;
        return newIds;
    }

    /**
     * 가져올 회차(전차) 결함을 **읽기 전용 복사본**으로 받는다. 서버 층 문서를 읽되 기기 데이터(state)에
     * 합치지 않고, 이 기기에만 있는 결함은 복사본으로 덧붙인다. 전차 쪽에는 아무것도 쓰지 않는다.
     * 사진 주소(urlsById)만 사진 캐시에 넣는다(읽기용).
     */
    async function readPrevRoundSourceFloorsReadOnly(src) {
        const byCode = {};
        const failed = [];
        const clone = (d) => JSON.parse(JSON.stringify(d));
        const canServer = !!(db && window.state.companyId) && !(typeof navigator !== 'undefined' && navigator.onLine === false);
        for (const code of buildingFloorCodesForBackup(src)) {
            const local = (state.defects[`${src.id}_${code}`] || []).filter((d) => d && d.id);
            let server = null;
            if (canServer) {
                try {
                    const bundle = await readFloorBundleStrict(src, code);
                    if (bundle) {
                        seedPhotoCacheFromUrlMap(bundle.photos && bundle.photos.urlsById);
                        const deleted = new Set(((bundle.markings && bundle.markings.deletedIds) || []).map(String));
                        server = ((bundle.markings && bundle.markings.items) || []).filter((d) => d && d.id && !deleted.has(String(d.id)));
                    }
                } catch (e) {
                    console.warn('[전차 사진 옮기기] 전차 층을 받지 못함(기기 자료로 맞춤):', code, e);
                    failed.push(code);
                }
            }
            if (server) {
                const seen = new Set(server.map((d) => d.id));
                byCode[code] = server.map(clone).concat(local.filter((d) => !seen.has(d.id)).map(clone));
            } else {
                byCode[code] = local.map(clone);
            }
        }
        const res = !canServer
            ? { ok: false, skipped: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'nologin', failed: [] }
            : { ok: !failed.length, skipped: null, failed };
        return { byCode, res };
    }

    window.openPrevRoundPhotoImport = async function(bldgId, modeArg) {
        const mode = modeArg === 'prev' ? 'prev' : 'cur';
        const TITLE = PREV_ROUND_PHOTO_TITLE[mode];
        const api = prevRoundPhotoMatchApi();
        const bldg = (window.state.buildings || []).find((b) => b && b.id === bldgId)
            || window.currentEditingBuilding || state.currentBuilding;
        if (!api || !bldg) {
            window.showToast('점검을 찾을 수 없습니다.', 'warning', 3500);
            return;
        }
        const curKey = getBuildingSurveyRoundKey(bldg);
        const candidates = getPrevRoundPhotoSourceCandidates(bldg);
        if (!candidates.length) {
            await window.appAlert(
                `같은 현장(${getBuildingSiteName(bldg)} · ${formatDongRowLabel(bldg)})에 다른 회차 점검이 없습니다.\n\n` +
                '가져올 회차 점검이 따로 등록되어 있어야 사진을 옮길 수 있습니다.',
                { title: TITLE }
            );
            return;
        }
        // 회차는 항상 고르게 한다(하나뿐이어도) — 사진을 넣는 쪽은 언제나 지금 연 점검
        const defaultIdx = Math.max(0, candidates.findIndex((c) => c.rel === 'earlier'));
        const choices = candidates.map((c, i) => {
            const b = c.bldg;
            const cnt = prevRoundPhotoLocalCounts(b);
            const tags = [];
            if (i === defaultIdx && c.rel === 'earlier') tags.push('바로 전 회차');
            if (c.rel === 'later') tags.push('이후 회차');
            if (c.rel === 'same') tags.push('같은 회차');
            return {
                label: `${formatSurveyRoundLabel(getBuildingSurveyRoundKey(b))} · ${b.inspectionType || '점검'}${tags.length ? ` (${tags.join(', ')})` : ''}`,
                detail: cnt.defects ? `결함 ${cnt.defects}건 · 사진 ${cnt.photos}장 (이 기기 기준)` : '이 기기에 받은 결함 없음 — 고르면 서버에서 받습니다'
            };
        });
        const picked = await window.appChoose(
            `어느 회차 사진을 옮길까요?\n넣는 곳: ${formatSurveyRoundLabel(curKey)} · ${bldg.inspectionType || '점검'} (지금 연 점검)`,
            choices,
            { title: `${TITLE} · 회차 선택`, okText: '다음', defaultIndex: defaultIdx }
        );
        if (picked == null || !candidates[picked]) return;
        const src = candidates[picked].bldg;
        const srcKey = getBuildingSurveyRoundKey(src);
        const srcLabel = formatSurveyRoundLabel(srcKey);
        const curLabel = formatSurveyRoundLabel(curKey);

        // 현차: 모든 층을 서버 최신으로(최근에 받았으면 생략) — 안 열어 본 층도 맞추려고.
        // 전차(가져올 회차)는 **읽기만** 한다 — 기기 데이터에 합치지도, 동기화 표시도 하지 않는다(2026-09-30).
        window.showLoading('전차·현차 결함 받는 중…');
        let freshNote = '';
        let srcView = null;
        try {
            const results = [];
            srcView = await readPrevRoundSourceFloorsReadOnly(src);
            results.push(srcView.res);
            let res;
            try { res = await refreshBuildingFloorsFromServer(bldg); } catch (_e) { res = { ok: false, skipped: null, failed: ['?'] }; }
            results.push(res);
            if (results.some((r) => r && r.skipped === 'offline')) {
                freshNote = '\n※ 인터넷이 끊겨 이 기기에 있는 자료로만 맞췄습니다.';
            } else if (results.some((r) => r && !r.ok && !r.skipped)) {
                freshNote = '\n※ 서버에서 받지 못한 층이 있어 이 기기 자료로 맞췄습니다(빠진 결함이 있을 수 있음).';
            }
        } finally {
            window.hideLoading();
        }

        const floorMap = mapPrevRoundFloorsToTarget(src, bldg);
        const srcByFloor = {};
        Object.keys(floorMap).forEach((code) => {
            const list = srcView.byCode[code] || [];
            const to = floorMap[code];
            srcByFloor[to] = (srcByFloor[to] || []).concat(list);
        });
        const tgtByFloor = {};
        buildingFloorCodesForBackup(bldg).forEach((code) => {
            tgtByFloor[code] = state.defects[`${bldg.id}_${code}`] || [];
        });
        const plan = api.plan(srcByFloor, tgtByFloor, { maxDist: 120, mode });
        const srcPhotoDefects = plan.matches.length + plan.skipped.length + plan.unmatched.length;
        if (!srcPhotoDefects) {
            await window.appAlert(`${srcLabel} 점검에 사진이 있는 결함이 없습니다.${freshNote}`, { title: TITLE });
            return;
        }
        const byNo = plan.matches.filter((m) => m.by === 'no').length;
        const byPos = plan.matches.length - byNo;
        const unmatchedPhotos = plan.unmatched.reduce((n, u) => n + u.photos, 0);
        const LIST_MAX = 30;
        const listLines = (arr, fmt) => {
            const lines = arr.slice(0, LIST_MAX).map(fmt);
            if (arr.length > LIST_MAX) lines.push(`  … 외 ${arr.length - LIST_MAX}건`);
            return lines.join('\n');
        };
        const slot = mode === 'prev' ? '「전차 사진」 칸' : '현차 사진(출력되는 사진)';
        let msg = `${srcLabel} → ${curLabel} (${formatDongRowLabel(bldg)})\n\n` +
            `· ${slot}에 넣을 결함 ${plan.matches.length}건 · 사진 ${plan.photoTotal}장` +
            (plan.matches.length ? ` (번호로 ${byNo}건${byPos ? `, 위치로 ${byPos}건` : ''})` : '') + '\n';
        if (mode === 'cur') {
            msg += `· 그중 현차 사진이 이미 있는 결함 ${plan.withExisting}건 — 기존 사진 뒤에 붙임\n` +
                `· 이미 옮긴 사진이라 건너뜀 ${plan.skipped.length}건\n`;
        } else {
            msg += `· 이미 전차 사진이 있어 건너뜀 ${plan.skipped.length}건\n`;
        }
        msg += `· 맞는 결함을 못 찾음 ${plan.unmatched.length}건 · 사진 ${unmatchedPhotos}장`;
        if (byPos) {
            msg += `\n\n[위치로 맞춘 결함 — 번호가 다름, 확인해 주세요]\n` + listLines(
                plan.matches.filter((m) => m.by === 'pos'),
                (m) => `  ${prevRoundPhotoDefectLabel(m.src, m.floor, bldg)} → 현차 NO.${api.noKey(m.tgt)}`
            );
        }
        if (mode === 'cur' && plan.withExisting) {
            msg += `\n\n[현차 사진이 있는 결함 — 뒤에 붙음]\n` + listLines(
                plan.matches.filter((m) => m.existing > 0),
                (m) => `  현차 NO.${api.noKey(m.tgt)} (${prevRoundPhotoFloorLabel(m.floor, bldg)}) · 기존 ${m.existing}장 + ${m.photos}장`
            );
        }
        if (plan.unmatched.length) {
            msg += `\n\n[못 찾음 — 옮기지 않음]\n` + listLines(
                plan.unmatched,
                (u) => `  ${prevRoundPhotoDefectLabel(u.src, u.floor, bldg)} · ${u.photos}장 — ${u.reason}`
            );
        }
        if (mode === 'cur') {
            msg += `\n\n사진은 현차 결함의 사진(보고서에 출력되는 사진) 맨 뒤에 복사됩니다. 기존 사진은 그대로 둡니다.` +
                `\n이미 옮긴 사진은 다시 넣지 않습니다(두 번 눌러도 겹치지 않음).`;
        } else {
            msg += `\n\n사진은 현차 결함의 「전차 사진」 칸에 복사됩니다(현차 출력에는 안 나옴, 전·금회차 비교사진에 쓰임).` +
                `\n기존 전차 사진은 덮어쓰지 않습니다.`;
        }
        msg += `\n사진을 새로 복사하므로 서버 저장공간을 씁니다.` +
            `\n되돌리기로는 취소되지 않습니다 — 잘못 들어간 사진은 결함 수정에서 지워 주세요.` + freshNote;
        if (!plan.matches.length) {
            await window.appAlert(msg, { title: `${TITLE} · 옮길 사진 없음` });
            return;
        }
        if (!await window.appConfirm(msg, { title: `${TITLE} · 미리보기`, okText: `${plan.photoTotal}장 옮기기`, danger: false })) return;

        window.showLoading('사진 복사 중…');
        let doneDefects = 0;
        let donePhotos = 0;
        let uploadFailed = 0;
        const loadFailed = [];
        const changedKeys = new Set();
        const lost = [];
        const written = [];
        const existingUnloaded = [];
        // ⚠️ 결함 객체는 기다리는 사이(사진 불러오기·올리기) 동기화·서버 받기가 state.defects 를 새 객체로
        // 바꿔 끼우면 목록에서 떨어져 나간다 — 옛 객체에 쓰면 사진이 사라지고 「넣었습니다」만 뜬다
        // (2026-09-30 실데이터 「금회차 조사항목에 사진이 없음」). 쓰기 직전에 id로 지금 목록의 결함을 다시 찾는다.
        const liveTarget = (m) => (state.defects[`${bldg.id}_${m.floor}`] || []).find((d) => d && d.id === m.tgt.id) || null;
        try {
            for (let i = 0; i < plan.matches.length; i++) {
                const m = plan.matches[i];
                let t = liveTarget(m);
                if (!t) { lost.push(m); continue; }
                if (typeof window.updateLoadingText === 'function') {
                    window.updateLoadingText(`사진 복사 ${i + 1}/${plan.matches.length}…`);
                }
                // 기다리는 사이 다른 창에서 바뀌었을 수 있어 복사 직전에 다시 본다
                let indexes = m.indexes;
                if (mode === 'prev') {
                    if (api.photoCount(t, 'prev') > 0) continue;
                } else {
                    indexes = api.pendingPhotoIndexes(m.src, t);
                    if (!indexes.length) continue;
                }
                const got = await loadPrevRoundSourcePhotos(m.src, indexes);
                if (got.failed) loadFailed.push({ m, failed: got.failed, total: indexes.length });
                if (!got.urls.length) continue;
                if (mode !== 'prev') {
                    // 기존 사진을 먼저 다 불러 둔다 — 빈 칸(null)이 남으면 결함 수정 창이 기존 사진을 못 보여 주고,
                    // 저장하면 그 사진이 지워진다(2026-09-30). 다 못 불러오면 이 결함은 건드리지 않는다.
                    const pre = liveTarget(m);
                    if (pre) {
                        const n0 = api.photoCount(pre);
                        const ids0 = defectPhotoIdList(pre, n0);
                        const inl0 = Array.isArray(pre.photos) ? pre.photos : [];
                        for (let k = 0; k < n0; k++) {
                            if (inl0[k] || (window._photoCache && window._photoCache[ids0[k]])) continue;
                            try { await loadPhotoByIdWithCloudFallback(ids0[k]); } catch (_e) { /* 아래에서 확인 */ }
                        }
                    }
                }
                t = liveTarget(m);   // 여기서부터 쓰기까지는 기다리지 않는다
                if (!t) { lost.push(m); continue; }
                if (mode !== 'prev' && !currentPhotosAllResolvable(t)) {
                    existingUnloaded.push(m);
                    continue;
                }
                let ids;
                if (mode === 'prev') {
                    if (api.photoCount(t, 'prev') > 0) continue;
                    ids = assignDefectPhotoIds(t.id, got.urls, null, 'prev');
                    t.prevRoundPhotos = got.urls.slice();
                    t.prevRoundPhotoIds = ids;
                    if (!t.prevSurveyRound) t.prevSurveyRound = srcKey;
                } else {
                    // 불러오는 사이 같은 사진이 들어왔으면 그 사진만 뺀다
                    const again = new Set(api.pendingPhotoIndexes(m.src, t).map((x) => api.srcPhotoKeys(m.src)[x]));
                    const urls = [];
                    const keys = [];
                    got.keys.forEach((k, gi) => { if (again.has(k)) { urls.push(got.urls[gi]); keys.push(k); } });
                    if (!urls.length) continue;
                    got.urls = urls;
                    ids = appendCurrentRoundPhotosToDefect(t, urls, keys);
                }
                if (!window._photoCache) window._photoCache = {};
                got.urls.forEach((url, pi) => {
                    window._photoCache[ids[pi]] = url;
                    idbSetPhotoPreferDataUrl(ids[pi], url);
                });
                touchDefectUpdatedAt(t);
                const key = `${bldg.id}_${m.floor}`;
                changedKeys.add(key);
                markFloorKeyDirty(key);
                doneDefects++;
                donePhotos += got.urls.length;
                written.push({ m, ids: ids.slice(), kind: mode });
                saveStateToLocalStorage();
                try {
                    await uploadDefectPhotos(t.id, got.urls, mode === 'prev' ? 'prev' : undefined, ids);
                } catch (e) {
                    uploadFailed += got.urls.length;
                    console.warn(`[${TITLE}] 업로드 실패(동기화 때 다시 올림):`, t.id, e);
                }
                if (doneDefects % 10 === 0) saveStateToLocalStorage();
            }
        } finally {
            saveStateToLocalStorage();
            window.hideLoading();
        }
        // 끝나고 지금 목록에 정말 들어 있는지 확인(떨어져 나간 객체에 쓴 경우를 찾는다)
        const notLanded = written.filter((w) => {
            const live = liveTarget(w.m);
            const have = new Set(((live && (w.kind === 'prev' ? live.prevRoundPhotoIds : live.photoIds)) || []).filter(Boolean));
            return !live || w.ids.some((pid) => !have.has(pid));
        });
        if (notLanded.length) {
            doneDefects -= notLanded.length;
            notLanded.forEach((w) => { donePhotos -= w.ids.length; lost.push(w.m); });
            console.warn(`[${TITLE}] 목록에 안 들어간 결함:`, notLanded.map((w) => w.m.tgt.id));
        }
        if (typeof renderDefectListPanel === 'function' && state.currentBuildingId === bldg.id) renderDefectListPanel();
        if (typeof renderSurveyTable === 'function' && state.currentBuildingId === bldg.id) renderSurveyTable();
        if (changedKeys.size && typeof syncStateToFirebase === 'function') {
            try { syncStateToFirebase(); } catch (_e) { /* 다음 동기화 때 */ }
        }
        const failedPhotos = loadFailed.reduce((n, f) => n + f.failed, 0);
        let result = `결함 ${doneDefects}건의 ${mode === 'prev' ? '전차 사진 칸' : '현차 사진'}에 사진 ${donePhotos}장을 넣었습니다.`;
        if (failedPhotos) {
            result += `\n\n[불러오지 못한 사진 ${failedPhotos}장 — 전차 점검에서 사진이 열리는지 확인해 주세요${mode === 'cur' ? '. 다시 누르면 이 사진만 다시 시도합니다' : ''}]\n` + listLines(
                loadFailed,
                (f) => `  ${prevRoundPhotoDefectLabel(f.m.src, f.m.floor, bldg)} · ${f.failed}/${f.total}장`
            );
        }
        if (existingUnloaded.length) {
            result += `\n\n[건너뛴 결함 ${existingUnloaded.length}건 — 기존 현차 사진을 불러오지 못해 건드리지 않음(기존 사진 보호). 인터넷 연결 뒤 다시 눌러 주세요]\n` + listLines(
                existingUnloaded,
                (m) => `  현차 NO.${api.noKey(m.tgt)} (${prevRoundPhotoFloorLabel(m.floor, bldg)})`
            );
        }
        if (lost.length) {
            result += `\n\n[넣지 못한 결함 ${lost.length}건 — 작업 중 결함 목록이 새로 받아져 찾지 못함. 다시 누르면 이 결함만 다시 넣습니다]\n` + listLines(
                lost,
                (m) => `  ${prevRoundPhotoDefectLabel(m.src, m.floor, bldg)} → 현차 NO.${api.noKey(m.tgt)}`
            );
        }
        if (uploadFailed) result += `\n\n※ 서버에 아직 못 올린 사진 ${uploadFailed}장 — 다음 동기화 때 다시 올립니다.`;
        await window.appAlert(result, { title: `${TITLE} 완료` });
    };

    /** 건물 수정 창(정보 모드)에 「전차 사진 → 현차로 옮기기」 칸 — index.html 은 그대로 두고 JS 로 만든다 */
    function ensurePrevRoundPhotoImportSection() {
        const modal = document.getElementById('editBuildingModal');
        if (!modal || document.getElementById('btnPrevRoundPhotoImport')) return;
        const anchorEl = modal.querySelector('.edit-next-round-section');
        if (!anchorEl || !anchorEl.parentNode) return;
        const box = document.createElement('div');
        box.className = 'edit-next-round-section edit-only-info edit-prev-photo-section';
        box.innerHTML = `
            <div class="edit-next-round-head">
                <div>
                    <h4 class="edit-next-round-title"><i class="fa-solid fa-images"></i> 전차 사진 → 현차로 옮기기</h4>
                    <p class="edit-next-round-desc">같은 현장에서 고른 회차 점검의 사진을, 지금 연 점검에서 같은 층·같은 번호(없으면 마킹 위치)인 결함의 사진(보고서에 출력되는 사진) 뒤에 복사합니다. 먼저 미리보기를 보여 주고, 이미 옮긴 사진은 다시 넣지 않습니다.</p>
                </div>
                <button type="button" class="btn btn-sm edit-next-round-btn btn-prev-photo" id="btnPrevRoundPhotoImport">
                    <i class="fa-solid fa-images"></i> 전차 사진 → 현차로 옮기기
                </button>
            </div>`;
        anchorEl.parentNode.insertBefore(box, anchorEl.nextSibling);
        const curId = () => document.getElementById('inputEditBuildingId')?.value
            || (window.currentEditingBuilding && window.currentEditingBuilding.id);
        box.querySelector('#btnPrevRoundPhotoImport').addEventListener('click', () => {
            window.openPrevRoundPhotoImport(curId(), 'cur');
        });
    }
    window.ensurePrevRoundPhotoImportSection = ensurePrevRoundPhotoImportSection;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensurePrevRoundPhotoImportSection);
    } else {
        ensurePrevRoundPhotoImportSection();
    }

    async function clearCarriedOverBulk() {
        const bldg = state.currentBuilding;
        if (!bldg || !state.currentBuildingId) {
            window.showToast('건물을 먼저 선택하세요.', 'warning', 3500);
            return;
        }
        const floorKeys = getSurveyReassignScopeKeys(bldg, false);
        const buildingKeys = getSurveyReassignScopeKeys(bldg, true);
        const floorCount = countCarriedOverInKeys(floorKeys);
        const buildingCount = countCarriedOverInKeys(buildingKeys);

        if (floorCount === 0 && buildingCount === 0) {
            window.showToast('전회차 체크가 켜진 결함이 없습니다.', 'info', 3500);
            return;
        }

        const mode = await window.appPrompt(
            `전회차(이월) 체크 일괄 해제\n\n· 현재 층(${state.currentFloor}): ${floorCount}건\n· 건물 전체: ${buildingCount}건\n\n1 = 현재 층만\n2 = 건물 전체\n(취소하려면 빈칸)`,
            '1'
        );
        if (mode == null) return;
        const trimmed = String(mode).trim();
        if (trimmed !== '1' && trimmed !== '2') {
            window.showToast('해제 취소됨', 'info', 2000);
            return;
        }
        const wholeBuilding = trimmed === '2';
        const keys = wholeBuilding ? buildingKeys : floorKeys;
        const count = wholeBuilding ? buildingCount : floorCount;
        if (count === 0) {
            window.showToast('선택한 범위에 전회차 체크 결함이 없습니다.', 'warning', 3500);
            return;
        }
        const scopeLabel = wholeBuilding ? '건물 전체 층' : `현재 층(${state.currentFloor})`;
        if (!await window.appConfirm(`${scopeLabel}에서 전회차 체크 ${count}건을 해제할까요?\n\n결함 내용·도면 위치는 그대로 두고,「전회차」표시만 끕니다.`)) {
            return;
        }

        if (typeof pushDefectHistory === 'function') pushDefectHistory();
        let changed = 0;
        keys.forEach((k) => {
            (state.defects[k] || []).forEach((d) => {
                if (d && d.isCarriedOver) {
                    d.isCarriedOver = false;
                    changed++;
                }
            });
        });

        saveStateToLocalStorage();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        window.showToast(`${scopeLabel} 전회차 체크 ${changed}건 해제 완료`, 'success', 4500);
    }
    window.clearCarriedOverBulk = clearCarriedOverBulk;

    function setupClearCarriedOverBulkEvents() {
        const btn = document.getElementById('btnClearCarriedOverBulk');
        if (btn) btn.addEventListener('click', clearCarriedOverBulk);
    }

    // 결함이 "전회차(과거 조사)" 항목인지 판정 — 수동 체크(isCarriedOver) 우선, 없으면
    // 등록 당시 회차와 건물의 "최신 회차"(latestSurveyRoundKey, 앞으로만 전진)를 비교한다.
    // 상단 드롭다운의 지금 이 순간 값과 비교하지 않으므로, 드롭다운을 잠깐 다른 회차로
    // 바꿔도(보고서 미리보기 등) 분류가 뒤집히지 않는다. "수시점검" 회차 결함은 순서
    // 비교 대상이 아니라 항상 금회차로 취급한다.
    function isPreviousRoundDefect(defect) {
        if (defect.isCarriedOver) return true;
        if (!defect.surveyRound) return false; // 회차 정보 없는 과거 데이터는 금회차로 취급
        const bldg = state.currentBuilding;
        const latestKey = (bldg && bldg.latestSurveyRoundKey) || getCurrentSurveyRoundKey();
        if (defect.surveyRound === latestKey) return false;
        const defectRank = getSurveyRoundOrderRank(defect.surveyRound);
        const latestRank = getSurveyRoundOrderRank(latestKey);
        if (defectRank === null || latestRank === null) return false; // 수시점검 등은 순서 비교 없이 금회차 취급
        return defectRank < latestRank;
    }

    // 전회차 양식 등록 시 도면 좌표가 아직 없는 결함 — 목록(전차 미등록)에만 보이고 캔버스에는 그리지 않음
    function isDefectMapUnregistered(defect) {
        return !!defect?.mapUnregistered;
    }

    /** 내부 층(1F/2F/B1F/옥상 등) 도면 코드 — 외부 미마킹 집계·가져오기에서 제외 */
    function isInteriorFloorDrawingCode(code) {
        const raw = String(code || '').trim();
        const c = raw.toUpperCase();
        if (!raw) return false;
        if (/^B?\d+F$/.test(c)) return true;
        if (c === 'ROOF' || c === 'PH' || c === 'PH_ROOF' || c === 'OT') return true;
        if (/^(지상|지하)?\s*\d+\s*층$/.test(raw) && !/외부|입면/.test(raw)) return true;
        return false;
    }

    /** 지금 보고 있는 외부 입면 묶음(같은 동·같은 이름)의 전차 미등록.
     *  같은 번호가 그 묶음의 다른 면에 이미 마킹돼 있으면 목록에 넣지 않는다.
     *  본관/신관처럼 이름이 다르거나 다른 동은 묶지 않는다. */
    function getExteriorMapUnregisteredDefects(bldgId, floorCode) {
        const id = bldgId || state.currentBuildingId;
        const focus = floorCode || state.currentFloor;
        if (!id || !focus) return [];
        const codes = elevationSiblingFloorCodes(id, focus);
        const placed = new Set();
        codes.forEach((fc) => {
            ((state.defects && state.defects[String(id) + '_' + fc]) || []).forEach((d) => {
                if (!d || d.mapUnregistered) return;
                if (d.x === undefined || d.y === undefined) return;
                const noKey = defectNoKey(d.cadNo || d.groupNo || d.no);
                if (noKey) placed.add(noKey);
            });
        });
        const out = [];
        const seen = new Set();
        codes.forEach((fc) => {
            if (isInteriorFloorDrawingCode(fc)) return;
            const key = String(id) + '_' + fc;
            const list = (state.defects && state.defects[key]) || [];
            const forList = (typeof getDefectsForListPanel === 'function')
                ? getDefectsForListPanel(list, list)
                : list;
            forList.forEach((d) => {
                if (!d || d.id == null) return;
                if (!isPreviousRoundDefect(d) || !isDefectMapUnregistered(d)) return;
                const srcFloor = d._importFloorCode || d.importFloorCode;
                if (srcFloor && isInteriorFloorDrawingCode(srcFloor)) return;
                const noKey = defectNoKey(d.cadNo || d.groupNo || d.no);
                if (noKey && placed.has(noKey)) return;
                if (seen.has(d.id)) return;
                seen.add(d.id);
                d._exteriorFloorCode = fc;
                out.push(d);
            });
        });
        return out;
    }

    function findDefectFloorKeyById(defectId) {
        if (!defectId || !state.currentBuildingId) return null;
        const id = state.currentBuildingId;
        const preferExt = typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor);
        const codes = preferExt && typeof listExteriorFloorCodesForBuilding === 'function'
            ? listExteriorFloorCodesForBuilding(id)
            : [state.currentFloor];
        for (let i = 0; i < codes.length; i++) {
            const fc = codes[i];
            if (!fc) continue;
            const key = String(id) + '_' + fc;
            const list = (state.defects && state.defects[key]) || [];
            if (list.some((d) => d && d.id === defectId)) return { floorKey: key, floorCode: fc };
        }
        // 외부 우선 검색 실패 시 건물 전체 키에서 한 번 더
        const prefix = String(id) + '_';
        for (const key of Object.keys(state.defects || {})) {
            if (!String(key).startsWith(prefix)) continue;
            const list = state.defects[key] || [];
            if (list.some((d) => d && d.id === defectId)) {
                return { floorKey: key, floorCode: String(key).slice(prefix.length) };
            }
        }
        return null;
    }

    /** 해당 층(외부면 외부 전체 공유 목록) 전차 미등록 일괄 삭제 — 목록과 동일 필터 */
    function collectMapUnregisteredTargetsForContext() {
        const out = [];
        if (!state.currentBuildingId) return out;
        const exterior = typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor);
        if (exterior) {
            (getExteriorMapUnregisteredDefects(state.currentBuildingId) || []).forEach((d) => {
                if (!d || !d.id) return;
                const fc = d._exteriorFloorCode;
                const floorKey = fc
                    ? `${state.currentBuildingId}_${fc}`
                    : (findDefectFloorKeyById(d.id) || {}).floorKey;
                if (!floorKey) return;
                out.push({ floorKey, id: d.id, no: d.no });
            });
        } else {
            const key = `${state.currentBuildingId}_${state.currentFloor}`;
            ((state.defects && state.defects[key]) || []).forEach((d) => {
                if (!d || !d.id) return;
                if (isPreviousRoundDefect(d) && isDefectMapUnregistered(d)) {
                    out.push({ floorKey: key, id: d.id, no: d.no });
                }
            });
        }
        return out;
    }

    window.clearMapUnregisteredDefects = async function() {
        if (!state.currentBuildingId) return;
        const targets = collectMapUnregisteredTargetsForContext();
        if (!targets.length) {
            window.showToast('지울 전차 미등록(미마킹)이 없습니다.', 'info');
            return;
        }
        const exterior = typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor);
        const scopeLabel = exterior
            ? '외부 전체 전차 미등록'
            : `현재 층(${state.currentFloor}) 전차 미등록`;
        if (!await window.confirmDelete(`${scopeLabel} ${targets.length}건을 모두 삭제할까요? (되돌리기로 복원 가능)`)) return;
        pushDefectHistory();
        const byKey = new Map();
        targets.forEach((t) => {
            if (!byKey.has(t.floorKey)) byKey.set(t.floorKey, []);
            byKey.get(t.floorKey).push(t.id);
        });
        byKey.forEach((idList, key) => {
            if (!state.defects[key]) return;
            idList.forEach((id) => removeSingleDefectRecord(key, id, { skipRenumber: true }));
            normalizeAllDefectGroupNos(state.defects[key]);
            collapseSingletonDefectGroups(state.defects[key]);
        });
        if (window._pendingMapRegisterDefectId) {
            const still = targets.some((t) => t.id === window._pendingMapRegisterDefectId);
            if (still) window._pendingMapRegisterDefectId = null;
        }
        if (typeof selectedDefectIds !== 'undefined') {
            targets.forEach((t) => selectedDefectIds.delete(t.id));
        }
        if (typeof discardStalePendingRemoteAfterLocalPinEdit === 'function') discardStalePendingRemoteAfterLocalPinEdit();
        saveStateToLocalStorage();
        renderSurveyTable();
        drawCanvas();
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
        else if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        window.showToast(`${scopeLabel} ${targets.length}건 삭제됨`, 'success');
    };

    function filterMapPlacedDefects(defects) {
        return (defects || []).filter(d => !isDefectMapUnregistered(d));
    }

    // 손상 유형·분류 필터가 적용된 현재 층 결함 중, 도면에 실제로 그릴 항목만 반환
    function getCurrentFloorMapPlacedDefects() {
        return filterMapPlacedDefects(getCurrentFloorFilteredDefects());
    }

    function isMapDefectListOpen() {
        return window.state.mapDefectListOpen !== false;
    }

    /** 목록 ON/OFF 모두 도면 마킹 선택 강조(테두리·핸들). OFF일 때 내용은 좌상단 팝업 */
    function shouldDrawMapSelectionChrome() {
        return true;
    }

    function getSelectedDefectForPopup() {
        const sel = (typeof window.getSelectedDefectIds === 'function')
            ? window.getSelectedDefectIds()
            : null;
        if (!sel || sel.size === 0) return null;
        const allDefects = getCurrentFloorDefects() || [];

        // 1. 단일 선택이거나 최근 클릭된 결함이 있는 경우 우선 탐색
        let directTarget = null;
        if (sel.size === 1) {
            directTarget = allDefects.find((d) => d && sel.has(d.id)) || null;
        } else if (window._groupBoxCycle && window._groupBoxCycle.lastId && sel.has(window._groupBoxCycle.lastId)) {
            directTarget = allDefects.find((d) => d && d.id === window._groupBoxCycle.lastId) || null;
        } else {
            directTarget = allDefects.find((d) => d && sel.has(d.id)) || null;
        }

        // 2. 그룹에 속한 결함이면 floatSlots 매핑으로 정확한 번호 및 조사 데이터 반환
        if (directTarget && directTarget.groupId) {
            const groupDefects = allDefects.filter(m => m && m.groupId === directTarget.groupId);
            const rep = (typeof pickDefectGroupRepresentative === 'function' ? pickDefectGroupRepresentative(groupDefects.filter(m => !m.surveyExtra)) : null)
                || groupDefects.find(m => !m.surveyExtra && (m.defectType || m.size))
                || groupDefects.find(m => !m.surveyExtra)
                || groupDefects[0]
                || directTarget;
            const donor = groupDefects.find(m => m && (m.defectType || m.size || m.crackWidth || (Array.isArray(m.crackMeasures) && m.crackMeasures.length))) || rep;

            const slots = buildDefectMarkingFloatSlots(directTarget.groupId);
            let matched = null;
            if (slots.length > 0) {
                matched = slots.find((s) =>
                    (s.dirMember && s.dirMember.id === directTarget.id) ||
                    (s.formMember && s.formMember.id === directTarget.id)
                ) || null;
            }

            const targetItem = (matched && matched.formMember) ? matched.formMember : directTarget;
            const displayNo = matched ? matched.label : (targetItem.displayNo || targetItem._slotLabel || formatDefectListBadgeNo(targetItem));

            return {
                ...rep,
                ...targetItem,
                displayNo,
                _slotLabel: matched ? matched.label : (targetItem._slotLabel || displayNo),
                component: targetItem.component || rep.component || donor.component || '',
                defectType: targetItem.defectType || rep.defectType || donor.defectType || '',
                cause: targetItem.cause || rep.cause || donor.cause || '',
                size: targetItem.size || rep.size || donor.size || '',
                crackWidth: targetItem.crackWidth || rep.crackWidth || donor.crackWidth || '',
                crackLength: targetItem.crackLength || rep.crackLength || donor.crackLength || '',
                crackMeasures: (Array.isArray(targetItem.crackMeasures) && targetItem.crackMeasures.length) ? targetItem.crackMeasures
                    : ((Array.isArray(rep.crackMeasures) && rep.crackMeasures.length) ? rep.crackMeasures
                    : (donor.crackMeasures || [])),
                category: targetItem.category || rep.category || donor.category || '구조체',
                _representative: (matched && matched.dirMember) || rep,
                _focusMemberId: (matched && matched.dirMember && matched.dirMember.id) || targetItem.id,
                _isSlotMember: !!matched
            };
        }
        if (directTarget) return directTarget;

        const consolidated = consolidateDefectGroups(allDefects);
        const hit = consolidated.find((d) => {
            if (!d) return false;
            if (d.id && sel.has(d.id)) return true;
            if (d._groupMemberIds && d._groupMemberIds.some((id) => sel.has(id))) return true;
            return false;
        });
        if (hit) return hit;
        return allDefects.find((d) => d && d.id && sel.has(d.id)) || null;
    }

    /** 현차 사진 칸 수 — photoIds·인라인 photos·photoUrls만 본다(원격 fetch 없음). 빈 칸은 세지 않음. */
    function countDefectLocalPhotoSlots(d, kind) {
        if (!d) return 0;
        const isPrev = kind === 'prev';
        const ids = isPrev ? d.prevRoundPhotoIds : d.photoIds;
        const photos = isPrev ? d.prevRoundPhotos : d.photos;
        const urls = isPrev ? d.prevRoundPhotoUrls : d.photoUrls;
        const n = Math.max(
            Array.isArray(ids) ? ids.length : 0,
            Array.isArray(photos) ? photos.length : 0,
            Array.isArray(urls) ? urls.length : 0
        );
        let count = 0;
        for (let i = 0; i < n; i++) {
            if ((Array.isArray(ids) && ids[i])
                || (Array.isArray(photos) && photos[i])
                || (Array.isArray(urls) && urls[i])) {
                count += 1;
            }
        }
        return count;
    }

    /** 선택 마킹 요약용. 그 결함 수정창이 열려 있으면 창의 현차(_pendingPhotos)가 최신. */
    function countSelectedMarkPhotos(d) {
        if (!d) return 0;
        try {
            if (typeof isDefectModalOpen === 'function' && isDefectModalOpen()) {
                const pinNow = document.getElementById('defectPinId')?.value || '';
                if (pinNow && pinNow === d.id && Array.isArray(window._pendingPhotos)) {
                    return window._pendingPhotos.filter(Boolean).length;
                }
            }
        } catch (_e) { /* ignore */ }
        return countDefectLocalPhotoSlots(d, 'curr');
    }

    function formatMapSelPopupPhotoStatus(count) {
        const n = Math.max(0, Number(count) || 0);
        return n > 0 ? (`사진 있음 (${n}장)`) : '사진 없음';
    }

    function capturePhotoTargetForSelectedDefect(d) {
        if (!d || !d.id) return null;
        const floorKey = state.currentBuildingId ? `${state.currentBuildingId}_${state.currentFloor}` : '';
        let modalTarget = null;
        try {
            if (typeof captureDefectPhotoTarget === 'function') modalTarget = captureDefectPhotoTarget();
        } catch (_e) { modalTarget = null; }
        if (modalTarget && modalTarget.open && modalTarget.pinId === d.id) return modalTarget;
        if (!floorKey) return null;
        return { open: false, pinId: d.id, seq: 0, floorKey };
    }

    function buildMapSelPopupPhotoRowHtml(d) {
        const id = d && d.id ? String(d.id) : '';
        if (!id) return '';
        const count = countSelectedMarkPhotos(d);
        const status = formatMapSelPopupPhotoStatus(count);
        const has = count > 0;
        // 2026-11-06 팝업에는 찍힌 사진만. 넣는 버튼은 툴바 위(updateMapSelPhotoBar). 기기에 있는 그림만 쓴다(서버 안 읽음)
        const ids = Array.isArray(d.photoIds) ? d.photoIds : [];
        const thumbs = [];
        for (let i = 0; i < Math.max(ids.length, (d.photos || []).length) && thumbs.length < 4; i++) {
            const u = (d.photos && d.photos[i]) || (ids[i] && window._photoCache && window._photoCache[ids[i]]) || (d.photoUrls && d.photoUrls[i]) || '';
            if (typeof u === 'string' && /^(data:image|https:|blob:)/.test(u)) thumbs.push(u);
        }
        return '<div class="map-sel-popup-photo" data-photo-defect-id="' + escapeHtml(id) + '">'
            + thumbs.map((u) => '<img class="map-sel-popup-thumb" alt="" src="' + escapeHtml(u) + '">').join('')
            + '<span class="map-sel-popup-photo-status' + (has ? ' has-photos' : ' no-photos') + '">'
            + escapeHtml(status) + '</span></div>';
    }

    /**
     * 2026-11-06 마킹을 한 번 누르면 툴바 바로 위 오른쪽에 「사진 추가」「사진 촬영」 — 오른손 엄지로만 점검.
     * 사진을 넣는 길은 예전 팝업 버튼과 같다(그 마킹에 붙임). 마킹 선택이 풀리거나 수정창이 열리면 숨긴다.
     */
    function mapSelPhotoBarTarget() {
        const sel = (typeof window.getSelectedDefectIds === 'function') ? window.getSelectedDefectIds() : null;
        if (!sel || sel.size === 0) return null;
        const all = (typeof getCurrentFloorDefects === 'function' ? getCurrentFloorDefects() : []) || [];
        const picked = all.filter((d) => d && sel.has(d.id));
        if (!picked.length) return null;
        const groups = new Set(picked.map((d) => d.groupId || d.id));
        if (groups.size !== 1) return null;   // 서로 다른 마킹을 여러 개 고른 때는 어디에 넣을지 모호하다
        const cycle = window._groupBoxCycle && window._groupBoxCycle.lastId;
        const direct = picked.find((d) => d.id === cycle) || picked[0];
        if (direct.groupId && typeof buildDefectMarkingFloatSlots === 'function') {
            const slot = buildDefectMarkingFloatSlots(direct.groupId).find((s) =>
                (s.dirMember && s.dirMember.id === direct.id) || (s.formMember && s.formMember.id === direct.id));
            if (slot) return slot.formMember || slot.dirMember || direct;
        }
        return direct;
    }

    function updateMapSelPhotoBar() {
        const anchor = document.getElementById('mapSelectedDefectPopup');
        if (!anchor || !anchor.parentElement) return;
        let bar = document.getElementById('mapSelPhotoBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'mapSelPhotoBar';
            bar.className = 'map-sel-photo-bar';
            bar.hidden = true;
            bar.innerHTML = '<button type="button" class="map-sel-photo-btn" data-photo-mode="gallery"><i class="fa-solid fa-images" aria-hidden="true"></i> 사진 추가</button>'
                + '<button type="button" class="map-sel-photo-btn primary" data-photo-mode="camera"><i class="fa-solid fa-camera" aria-hidden="true"></i> 사진 촬영</button>';
            // 도면 드래그·선택 해제로 넘어가지 않게 버튼 위 터치는 여기서 끝낸다
            ['pointerdown', 'pointerup', 'mousedown', 'touchstart', 'touchend', 'click'].forEach((t) => {
                bar.addEventListener(t, (e) => e.stopPropagation());
            });
            bar.querySelectorAll('[data-photo-mode]').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const d = mapSelPhotoBarTarget();
                    startMapPopupPhotoAdd(d && d.id, btn.getAttribute('data-photo-mode'));
                });
            });
            anchor.parentElement.appendChild(bar);
        }
        const modalOpen = typeof isDefectModalOpen === 'function' && isDefectModalOpen();
        const target = modalOpen ? null : mapSelPhotoBarTarget();
        bar.hidden = !target;
        if (!target) return;
        // 툴바가 아래쪽 가로줄이면 그 바로 위, 오른쪽 세로줄이면 맨 아래에서 그 왼쪽
        const rail = document.getElementById('mobileMapSideRail');
        const box = anchor.parentElement.getBoundingClientRect();
        const r = rail ? rail.getBoundingClientRect() : null;
        const railShown = !!(r && r.width > 0 && r.height > 0);
        const horizontal = railShown && r.width > r.height;
        bar.style.bottom = (horizontal ? Math.max(8, box.bottom - r.top + 6) : 10) + 'px';
        bar.style.right = ((railShown && !horizontal) ? Math.max(8, box.right - r.left + 6) : 8) + 'px';
    }

    function bindMapSelPopupPhotoControls(root) {
        if (!root) return;
        root.querySelectorAll('.map-sel-popup-photo').forEach((row) => {
            row.onclick = (e) => { e.stopPropagation(); };
        });
    }

    function startMapPopupPhotoAdd(defectId, mode) {
        if (!defectId) {
            window.showToast?.('사진을 넣을 마킹이 없습니다.', 'warning', 2500);
            return;
        }
        const all = (typeof getCurrentFloorDefects === 'function' ? getCurrentFloorDefects() : []) || [];
        const d = all.find((x) => x && x.id === defectId) || null;
        if (!d) {
            window.showToast?.('선택한 마킹을 찾을 수 없습니다.', 'warning', 2500);
            if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
            return;
        }
        const target = capturePhotoTargetForSelectedDefect(d);
        if (!target || !target.pinId) {
            window.showToast?.('사진을 넣을 마킹이 없습니다.', 'warning', 2500);
            return;
        }
        if (typeof window.triggerDefectPhotoPick === 'function') {
            window.triggerDefectPhotoPick(mode === 'camera' ? 'camera' : 'gallery', 'curr', target);
        }
    }
    window.startMapPopupPhotoAdd = startMapPopupPhotoAdd;
    window.countDefectLocalPhotoSlots = countDefectLocalPhotoSlots;
    window.countSelectedMarkPhotos = countSelectedMarkPhotos;
    window.formatMapSelPopupPhotoStatus = formatMapSelPopupPhotoStatus;

    function updateMapSelectedDefectPopup() {
        try { updateMapSelPhotoBar(); } catch (e) { console.warn('[사진 버튼] 표시 실패', e); }
        const popup = document.getElementById('mapSelectedDefectPopup');
        if (!popup) return;
        const show = !isMapDefectListOpen();
        if (!show) {
            popup.hidden = true;
            popup.innerHTML = '';
            return;
        }

        const sel = (typeof window.getSelectedDefectIds === 'function')
            ? window.getSelectedDefectIds()
            : null;
        if (!sel || sel.size === 0) {
            popup.hidden = true;
            popup.innerHTML = '';
            return;
        }
        const allDefects = getCurrentFloorDefects() || [];

        let directTarget = null;
        if (sel.size === 1) {
            directTarget = allDefects.find((d) => d && sel.has(d.id)) || null;
        } else if (window._groupBoxCycle && window._groupBoxCycle.lastId && sel.has(window._groupBoxCycle.lastId)) {
            directTarget = allDefects.find((d) => d && d.id === window._groupBoxCycle.lastId) || null;
        } else {
            directTarget = allDefects.find((d) => d && sel.has(d.id)) || null;
        }

        // 그룹 결함: 슬롯이 2개 이상이면 그룹 내 모든 항목(예: 45-1, 45-2)을 함께 표시!
        if (directTarget && directTarget.groupId) {
            const groupDefects = allDefects.filter(m => m && m.groupId === directTarget.groupId);
            const slots = buildDefectMarkingFloatSlots(directTarget.groupId);
            if (slots.length > 1) {
                const rep = (typeof pickDefectGroupRepresentative === 'function' ? pickDefectGroupRepresentative(groupDefects.filter(m => !m.surveyExtra)) : null)
                    || groupDefects.find(m => !m.surveyExtra && (m.defectType || m.size))
                    || groupDefects.find(m => !m.surveyExtra)
                    || groupDefects[0]
                    || directTarget;
                const donor = groupDefects.find(m => m && (m.defectType || m.size || m.crackWidth || (Array.isArray(m.crackMeasures) && m.crackMeasures.length))) || rep;

                const matchedSlot = slots.find((s) =>
                    (s.dirMember && s.dirMember.id === directTarget.id) ||
                    (s.formMember && s.formMember.id === directTarget.id)
                ) || null;
                const activeSlotNum = matchedSlot ? matchedSlot.slot : 1;

                let itemsHtml = '';
                slots.forEach((s) => {
                    const formMember = s.formMember || rep;
                    const dirMember = s.dirMember || formMember;
                    const isActive = s.slot === activeSlotNum;
                    const badgeNo = s.label;

                    const comp = ((formMember.shapeType === 'area' ? '🟧 ' : '') + (memberNameOut(formMember.component || rep.component || donor.component) || '')).trim();
                    const typeText = (formMember.defectType || formMember.cause || (s.slot === 1 ? (donor.defectType || donor.cause) : '') || '').trim();
                    const isGood = isGoodDefectType(typeText);
                    const measureText = typeof formatDefectListMeasure === 'function' ? formatDefectListMeasure(formMember) : '';
                    const sizeFallback = String(formMember.size || (s.slot === 1 ? donor.size : '') || '').trim();
                    const measureDisplay = measureText || ((sizeFallback && sizeFallback !== '-') ? sizeFallback : '');

                    let measureHtml = '';
                    if (!isGood && measureDisplay) {
                        measureHtml = '<span class="map-sel-popup-measure">'
                            + escapeHtml(measureDisplay).replace(/\n/g, '<br>')
                            + '</span>';
                    }

                    let typeHtml = '';
                    if (typeText) {
                        typeHtml = '<span class="map-sel-popup-type">' + escapeHtml(typeText) + '</span>';
                    } else {
                        typeHtml = '<span class="map-sel-popup-type map-sel-popup-type-empty">조사내용 미입력</span>';
                    }

                    const canAssign = (dirMember && canAssignSurveyNumberToDefect(dirMember))
                        || (formMember && canAssignSurveyNumberToDefect(formMember));
                    const assignId = (dirMember && canAssignSurveyNumberToDefect(dirMember))
                        ? dirMember.id
                        : (formMember ? formMember.id : null);

                    const cat = formMember.category || rep.category || donor.category || '구조체';
                    const catClass = cat === '비구조체' ? 'cat-nonstructural'
                        : (cat === '마감재' ? 'cat-finishing' : '');

                    const photoMember = formMember || dirMember || rep;
                    itemsHtml +=
                        `<div class="map-sel-popup-item ${isActive ? 'is-active' : ''} ${catClass}"`
                        + ` data-marking-member-id="${escapeHtml(formMember.id)}"`
                        + ` data-focus-member-id="${escapeHtml((dirMember || formMember).id)}"`
                        + ` data-display-label="${escapeHtml(badgeNo)}">`
                        + `<div class="map-sel-popup-head">`
                        + `<span class="map-sel-popup-badge">${escapeHtml(badgeNo)}</span>`
                        + `<div class="map-sel-popup-lines">`
                        + (comp ? `<span class="map-sel-popup-comp">${escapeHtml(comp)}</span>` : '')
                        + typeHtml
                        + measureHtml
                        + `</div>`
                        + (canAssign
                            ? `<button type="button" class="defect-marking-assign-no-btn map-sel-popup-assign-btn"`
                                + ` data-marking-member-id="${escapeHtml(assignId)}"`
                                + ` title="이 화살표에 조사표 번호 부여">번호 부여</button>`
                            : `<button type="button" class="map-sel-popup-edit" title="${escapeHtml(badgeNo)} 결함 수정">`
                                + `<i class="fa-solid fa-pen"></i>`
                                + `</button>`
                          )
                        + `</div>`
                        + buildMapSelPopupPhotoRowHtml(photoMember)
                        + `</div>`;
                });

                popup.className = 'map-selected-defect-popup is-group';
                popup.innerHTML = itemsHtml;
                popup.hidden = false;

                popup.querySelectorAll('.map-sel-popup-item').forEach((rowEl) => {
                    const mid = rowEl.getAttribute('data-marking-member-id');
                    const fid = rowEl.getAttribute('data-focus-member-id') || mid;
                    const dlabel = rowEl.getAttribute('data-display-label') || undefined;
                    const editBtn = rowEl.querySelector('.map-sel-popup-edit');
                    const assignBtn = rowEl.querySelector('.map-sel-popup-assign-btn');

                    if (assignBtn) {
                        assignBtn.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const assignMid = assignBtn.getAttribute('data-marking-member-id');
                            if (assignMid && typeof window.assignSurveyNumberToArrow === 'function') {
                                window.assignSurveyNumberToArrow(assignMid);
                            }
                        };
                    }

                    const openItemDetail = () => {
                        if (mid && typeof window.selectDefectMarkingMember === 'function') {
                            window.selectDefectMarkingMember(mid, dlabel, fid);
                        } else if (typeof openAddDefectModal === 'function') {
                            const targetDef = allDefects.find(x => x && x.id === mid) || rep;
                            openAddDefectModal(targetDef.x, targetDef.y, targetDef.targetX, targetDef.targetY, targetDef, null, { revealMarkingAboveDrawer: true });
                        }
                    };

                    if (editBtn) {
                        editBtn.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openItemDetail();
                        };
                    }
                    rowEl.onclick = (e) => {
                        e.stopPropagation(); // 팝업을 누른 것이 도면·다른 마킹으로 새지 않게
                        if (assignBtn && assignBtn.contains(e.target)) return;
                        if (editBtn && editBtn.contains(e.target)) return;
                        if (e.target.closest && e.target.closest('.map-sel-popup-photo')) return;
                        openItemDetail();
                    };
                });
                bindMapSelPopupPhotoControls(popup);
                return;
            }
        }

        const d = getSelectedDefectForPopup();
        if (!d) {
            popup.hidden = true;
            popup.innerHTML = '';
            return;
        }
        let badgeNo = d.displayNo || d._slotLabel;
        if (!badgeNo || badgeNo.startsWith('화살표')) {
            const baseNum = typeof formatDefectListBadgeNo === 'function'
                ? formatDefectListBadgeNo(d)
                : ((d.no || '').match(/\d+(?:-\d+)?/) ? (d.no || '').match(/\d+(?:-\d+)?/)[0] : '?');
            badgeNo = (badgeNo && badgeNo.startsWith('화살표')) ? `${baseNum} (${badgeNo})` : baseNum;
        }
        const shapeIcon = d.shapeType === 'area' ? '🟧 ' : '';
        const isGood = isGoodDefectType(d.defectType);
        const measureText = typeof formatDefectListMeasure === 'function' ? formatDefectListMeasure(d) : '';
        const sizeFallback = String(d.size || '').trim();
        const measureDisplay = measureText
            || ((sizeFallback && sizeFallback !== '-') ? sizeFallback : '');
        const catClass = d.category === '비구조체' ? 'cat-nonstructural'
            : (d.category === '마감재' ? 'cat-finishing' : '');
        let measureHtml = '';
        if (!isGood && measureDisplay) {
            measureHtml = '<span class="map-sel-popup-measure">'
                + escapeHtml(measureDisplay).replace(/\n/g, '<br>')
                + '</span>';
        }
        const comp = (shapeIcon + (memberNameOut(d.component) || '')).trim();
        const typeText = (d.defectType || d.cause || '').trim();
        let typeHtml = '';
        if (typeText) {
            typeHtml = '<span class="map-sel-popup-type">' + escapeHtml(typeText) + '</span>';
        } else {
            typeHtml = '<span class="map-sel-popup-type map-sel-popup-type-empty">조사내용 미입력</span>';
        }

        popup.className = ('map-selected-defect-popup ' + catClass).trim();
        popup.innerHTML =
            '<div class="map-sel-popup-head">' +
            '<span class="map-sel-popup-badge">' + escapeHtml(badgeNo) + '</span>' +
            '<div class="map-sel-popup-lines">' +
            (comp ? ('<span class="map-sel-popup-comp">' + escapeHtml(comp) + '</span>') : '') +
            typeHtml +
            measureHtml +
            '</div>' +
            '<button type="button" class="map-sel-popup-edit" title="결함 수정"><i class="fa-solid fa-pen"></i></button>' +
            '</div>' +
            buildMapSelPopupPhotoRowHtml(d);
        popup.hidden = false;
        const editBtn = popup.querySelector('.map-sel-popup-edit');
        const openDetail = () => {
            if (d.groupId && typeof window.selectDefectMarkingMember === 'function') {
                window.selectDefectMarkingMember(d.id, d.displayNo, d._focusMemberId || d.id);
                return;
            }
            const rep = d._representative || d;
            if (typeof openAddDefectModal === 'function') {
                openAddDefectModal(rep.x, rep.y, rep.targetX, rep.targetY, rep, null, { revealMarkingAboveDrawer: true });
            }
        };
        if (editBtn) {
            editBtn.onclick = (e) => { e.stopPropagation(); openDetail(); };
        }
        bindMapSelPopupPhotoControls(popup);
        popup.onclick = (e) => {
            e.stopPropagation(); // 팝업을 누른 것이 도면·다른 마킹으로 새지 않게
            if (editBtn && editBtn.contains(e.target)) return;
            if (e.target.closest && e.target.closest('.map-sel-popup-photo')) return;
            // 마킹 여러 개를 뽑아 둔 상태(통합 묶음이 아님)에서 팝업 몸통을 눌러도 선택이 한 개로 바뀌지 않게 — 연필 버튼으로만 연다
            if (sel.size > 1 && !d.groupId) return;
            openDetail();
        };
    }
    window.updateMapSelectedDefectPopup = updateMapSelectedDefectPopup;

    function applyMapDefectListChrome() {
        const open = isMapDefectListOpen();
        const tab = document.getElementById('tab-map');
        if (tab) tab.classList.toggle('is-defect-list-collapsed', !open);
        document.body.classList.toggle('map-defect-list-collapsed', !open);
        const syncBtn = (btn) => {
            if (!btn) return;
            btn.setAttribute('aria-pressed', open ? 'true' : 'false');
            btn.classList.toggle('active', open);
            const stateEl = btn.querySelector('.toolbar-toggle-state');
            if (stateEl) stateEl.textContent = open ? 'ON' : 'OFF';
            btn.title = open
                ? '좌측 조사항목 창 끄기 (끄면 선택 결함을 도면 좌상단 팝업으로 표시)'
                : '좌측 조사항목 창 켜기';
        };
        syncBtn(document.getElementById('btnToggleDefectList'));
        syncBtn(document.getElementById('mobileBtnToggleDefectList'));
        if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
    }

    window.setMapDefectListOpen = function(open) {
        window.state.mapDefectListOpen = !!open;
        try {
            localStorage.setItem('bsa_map_defect_list_open', open ? '1' : '0');
        } catch (_e) { /* ignore */ }
        applyMapDefectListChrome();
        if (typeof resizeCanvas === 'function') resizeCanvas();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof updateMapSelectedDefectPopup === 'function') updateMapSelectedDefectPopup();
    };

    window.toggleMapDefectList = function() {
        window.setMapDefectListOpen(!isMapDefectListOpen());
    };

    function startMapRegisterForDefect(defectId) {
        let defect = getCurrentFloorDefects().find(d => d.id === defectId);
        if (!defect) {
            const located = findDefectFloorKeyById(defectId);
            if (located) {
                defect = (state.defects[located.floorKey] || []).find((d) => d && d.id === defectId);
            }
        }
        if (!defect || !isDefectMapUnregistered(defect)) return;
        window._pendingMapRegisterDefectId = defectId;
        setDrawMode('MARK');
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        window.showToast(`「${defect.no || '결함'}」 — 도면에서 마킹할 위치를 클릭·드래그하세요`, 'info', 4500);
        drawCanvas();
    }

    function commitMapRegisterFromMarking(boxX, boxY, targetX, targetY) {
        const defectId = window._pendingMapRegisterDefectId;
        if (!defectId) return false;
        const destKey = getDefectHistoryKey();
        if (!destKey) return false;
        if (!state.defects[destKey]) state.defects[destKey] = [];

        let srcKey = destKey;
        let idx = state.defects[destKey].findIndex(d => d.id === defectId);
        if (idx === -1) {
            const located = findDefectFloorKeyById(defectId);
            if (!located) {
                window._pendingMapRegisterDefectId = null;
                return false;
            }
            srcKey = located.floorKey;
            idx = (state.defects[srcKey] || []).findIndex(d => d.id === defectId);
            if (idx === -1) {
                window._pendingMapRegisterDefectId = null;
                return false;
            }
        }

        pushDefectHistory();
        let defect = state.defects[srcKey][idx];
        // 다른 외부 도면에 있던 미등록을 지금 도면에 배치하면 그 도면 키로 옮긴다.
        if (srcKey !== destKey) {
            state.defects[srcKey].splice(idx, 1);
            state.defects[destKey].push(defect);
            if (defect) delete defect._exteriorFloorCode;
            // 옮긴 것은 "원래 층에서는 삭제"다. 묘비를 안 남기면 다음 동기화에서
            // sync-merge가 서버에 남아 있던 원본을 그대로 되살린다(서버에만 있고
            // 로컬에 없는 결함은 묘비가 없으면 복원하는 규칙). 그러면 같은 결함이
            // 두 층에 동시에 존재하고, 외부(EXT)는 도면이 여러 개라도 조사표를
            // 하나로 합치므로 같은 결함이 표에 두 번 나온다.
            // (2026-09-20: 외부 조사표가 다시 생기던 원인)
            // 옮김은 자리 치우기 — 원래 층 옛 사본을 고친 게 있어도 되살리면 두 층에 겹친다(지운 시각 규칙)
            trackDefectDeletion(srcKey, defect.id, defect, { wallClock: true });
            // 반대로 도착 층에 옛 묘비가 남아 있으면 되돌려 찍을 때 사라진다.
            // 사용자가 방금 여기에 찍었으므로 묘비를 풀고, 서버가 들고 있는
            // 묘비보다 나중임을 알 수 있게 내용 시각도 올린다.
            untrackDefectDeletion(destKey, defect.id);
            touchDefectUpdatedAt(defect);
            markFloorKeyDirty(srcKey);
            markFloorKeyDirty(destKey);
        }
        defect.x = boxX;
        defect.y = boxY;
        defect.targetX = targetX;
        defect.targetY = targetY;
        defect.mapUnregistered = false;
        defect.mapMarkedAt = Date.now();
        touchDefectPositionUpdatedAt(defect);
        window._pendingMapRegisterDefectId = null;
        saveStateToLocalStorage();
        renderSurveyTable();
        selectNewlyCreatedMarking(defect);
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        window.showToast(`${defect.no || '결함'} 도면 배치 완료`, 'success', 2500);
        return true;
    }

    // "마킹 추가"로 같은 결함을 여러 위치에 표시한 그룹(groupId 공유)을 목록/보고서용으로 한 행으로 합친다.
    // 위치는 지점별 위치를 ' / '로 이어붙이고, 진행/누수/전회차 여부는 멤버 중 하나라도 해당되면 true로 간주.
    // --- 결함 통합(여러 마킹 → 가장 작은 번호칸 하나, 기존 「화살표 추가 + 번호 부여」 모델) ---
    function defectMergeApi() {
        return (window.BSA && window.BSA.shared && window.BSA.shared.defectMerge) || null;
    }

    /** 그룹 X-1 행에 넣을 마킹: 자기 결함표 행(X-k)이 따로 있는 통합 화살표는 뺀다 */
    function markingMembersForGroupRow(list, members) {
        const api = defectMergeApi();
        if (!api || !Array.isArray(members)) return members;
        const kept = members.filter((m) => !api.hasLinkedMergeRow(list, m));
        return kept.length ? kept : members;
    }

    /** 통합으로 생긴 결함표 행(X-k) → 원래 마킹의 내용·사진으로 만든 보고서 행(행 id = 원래 마킹 id) */
    function surveyExtraRowFor(list, d) {
        const api = defectMergeApi();
        if (!api || !d || !d.surveyExtra || !d.mergeSourceId) return d;
        return api.mergedExtraReportRow(list, d) || d;
    }

    function getDefectMarkingGroupMembers(groupId) {
        if (!groupId || !state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        return (state.defects[key] || [])
            .filter((d) => d && d.groupId === groupId && !d.surveyExtra)
            .slice()
            .sort((a, b) => {
                const api = arrowSurveyNumberApi();
                if (api && typeof api.compareMarkingForRepresentative === 'function') {
                    const u = api.compareMarkingForRepresentative(a, b);
                    if (u !== 0) return u;
                }
                const na = parseDefectSortNoValue(a);
                const nb = parseDefectSortNoValue(b);
                if (na !== nb) return na - nb;
                return String(a.id || '').localeCompare(String(b.id || ''));
            });
    }

    /** 수정창 좌측 탭: 화살표 먼저, 결함표 다음 (41-1, 41-2 …) */
    function getDefectGroupMembersOrdered(groupId) {
        if (!groupId || !state.currentBuildingId) return [];
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        return (state.defects[key] || [])
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
    }

    function formatDefectMemberChipLabel(d, arrowIndexAmongMarking) {
        if (!d) return '-';
        const mainPart = parseDefectNoParts({ no: d.groupNo || stripDefectNoSuffix(d.no || '') });
        const main = mainPart.main === Number.MAX_SAFE_INTEGER ? '?' : String(mainPart.main);
        if (d.surveyExtra) {
            const p = parseDefectNoParts(d);
            if (p.suffix > 0) return `${main}-${p.suffix}`;
            return main;
        }
        if (arrowIndexAmongMarking != null && Number.isFinite(arrowIndexAmongMarking) && arrowIndexAmongMarking >= 0) {
            return `${main}-${arrowIndexAmongMarking + 1}`;
        }
        return main;
    }

    /**
     * 공유 NO.박스 클릭: 처음은 대표(41-1), 다시 누르면 41-2, 41-3 … 순환(화살표만 여러 개여도 1→2→…).
     * 결함표 행(번호 부여·결함 통합)이 있어도 순환한다 — 예전엔 늘 대표로 돌아가 통합 마킹의 -2로 못 넘어갔다.
     */
    function cycleMarkingGroupMemberOnBoxClick(defect) {
        if (!defect || !defect.groupId) return defect;
        // 숨긴 구성원은 차례에서 뺀다
        const visibleIds = new Set(getCurrentFloorMapPlacedDefects().map((d) => d && d.id));
        const members = getDefectMarkingGroupMembers(defect.groupId).filter((m) => m && visibleIds.has(m.id));
        if (!members.length) return defect;
        const asnApi = arrowSurveyNumberApi();
        if (asnApi && typeof asnApi.nextGroupMemberOnBoxClick === 'function') {
            const picked = asnApi.nextGroupMemberOnBoxClick(
                members,
                defect.groupId,
                window._groupBoxCycle,
                typeof selectedDefectIds !== 'undefined' ? selectedDefectIds : null
            ) || defect;
            window._groupBoxCycle = { groupId: defect.groupId, lastId: picked.id };
            return picked;
        }
        if (members.length <= 1) return defect;
        const st = window._groupBoxCycle || { groupId: null, lastId: null };
        let idx = 0;
        if (st.groupId === defect.groupId && st.lastId) {
            const cur = members.findIndex((m) => m.id === st.lastId);
            idx = cur >= 0 ? (cur + 1) % members.length : 0;
        } else {
            const sel = members.findIndex((m) => typeof selectedDefectIds !== 'undefined' && selectedDefectIds.has(m.id));
            idx = sel >= 0 ? (sel + 1) % members.length : 0;
        }
        const next = members[idx] || defect;
        window._groupBoxCycle = { groupId: defect.groupId, lastId: next.id };
        return next;
    }

    function consolidateDefectGroups(defects) {
        const seen = new Set();
        const result = [];
        defects.forEach(d => {
            if (d.groupId) {
                if (seen.has(d.groupId)) return;
                seen.add(d.groupId);
                const members = defects.filter(m => m.groupId === d.groupId);
                const locations = members.map(m => m.location).filter(Boolean);
                result.push({
                    ...d,
                    no: d.groupNo || d.no,
                    location: locations.length > 0 ? locations.join(' / ') : d.location,
                    isProgress: members.some(m => m.isProgress),
                    isLeak: members.some(m => m.isLeak),
                    isOpeningCrack: members.some(m => m.isOpeningCrack),
                    isCarriedOver: members.some(m => m.isCarriedOver),
                    mapUnregistered: members.some(m => m.mapUnregistered),
                    isPriorityManage: members.some(m => m.isPriorityManage),
                    isBookmark: members.some(m => m.isBookmark),
                    _groupMemberIds: members.map(m => m.id),
                    _representative: d
                });
            } else {
                result.push(d);
            }
        });
        // 결함번호(no) 기준 오름차순 정렬 — 좌측 결함목록/상태조사표/PDF/보고서 미리보기가 모두 이 함수를 거치므로 한 번에 정렬됨
        result.sort((a, b) => {
            const na = getDefectSortNo(a);
            const nb = getDefectSortNo(b);
            if (na !== nb) return na - nb;
            return (a.no || '').localeCompare(b.no || '');
        });
        return result;
    }

    // 손상 유형 필터링이 적용된 현재 층 결함 목록 반환
    function getCurrentFloorFilteredDefects(baseList) {
        let list = baseList || getCurrentFloorDefects();
        if (window.state.bookmarkOnlyFilter) {
            list = list.filter(d => !!d.isBookmark);
        }
        if (window.state.priorityManageOnlyFilter) {
            list = list.filter(d => !!d.isPriorityManage);
        }
        // 개구부 결함 목록/도면 표시 토글 (기본 ON)
        if (window.state.showOpeningCracks === false) {
            list = list.filter(d => !d.isOpeningCrack);
        }
        const catFilter = window.state.categoryFilter;
        if (catFilter) {
            list = list.filter(d => {
                const cat = (typeof resolveDefectCategory === 'function')
                    ? resolveDefectCategory(d.category)
                    : (d.category === '' ? '' : (d.category || '구조체'));
                // 대분류 미선택 새 마킹은 구조체 표시를 꺼도 남긴다(선택·터치 가능)
                if (cat === '') return true;
                if (cat === '비구조체') return catFilter.nonStructural !== false;
                if (cat === '마감재') return catFilter.finishing !== false;
                // 구조체: 부재 종류로 기둥·벽체 / 보·슬래브 두 그룹으로 세분화.
                // 부재 명칭은 "상부 보", "계단참 슬래브"처럼 자유 입력·접두어가 붙는 경우가 많아
                // 정확히 일치가 아니라 키워드 포함 여부로 판단한다. "기둥-보 접합부"처럼 두 그룹
                // 키워드가 다 들어있으면 둘 중 하나만 켜져 있어도 표시. 계단·기타처럼 두 키워드
                // 모두 없는 부재는 "전체 보기"(둘 다 켜짐) 상태일 때만 표시한다.
                const group = getStructuralComponentGroup(d.component);
                if (group === 'both') return catFilter.columnWall !== false || catFilter.beamSlab !== false;
                if (group === 'columnWall') return catFilter.columnWall !== false;
                if (group === 'beamSlab') return catFilter.beamSlab !== false;
                return catFilter.columnWall !== false && catFilter.beamSlab !== false;
            });
        }
        const periodFilter = window.state.periodFilter;
        if (periodFilter) {
            list = list.filter(d => {
                const round = d.surveyRound;
                if (!round || !(round in periodFilter)) return true; // 회차 정보 없거나 필터 목록 밖 회차는 항상 표시
                return periodFilter[round] !== false;
            });
        }
        const filter = window.state.damageTypeFilter || 'ALL';
        if (filter === 'ALL') return list;
        return list.filter(d => {
            const typeStr = (d.type || d.defectType || d.description || d.cause || '').toString();
            if (filter === '기타') {
                return !['균열', '누수', '백태', '철근노출', '박리/박락'].some(t => typeStr.includes(t));
            }
            return typeStr.includes(filter);
        });
    }

    function getStructuralComponentGroup(component) {
        const comp = component || '';
        const isColumnWall = comp.includes('기둥') || comp.includes('벽체') || comp.includes('기초');
        const isBeamSlab = comp.includes('보') || comp.includes('슬래브') || comp.includes('거더') || comp.includes('빔');
        if (comp.includes('접합부') || comp.includes('접합')) {
            if (isColumnWall && isBeamSlab) return 'both';
            if (isColumnWall) return 'columnWall';
            if (isBeamSlab) return 'beamSlab';
            return 'both';
        }
        if (isColumnWall && isBeamSlab) return 'both';
        if (isColumnWall) return 'columnWall';
        if (isBeamSlab) return 'beamSlab';
        return 'other';
    }

    /** 2026-10-16 지금 필터로 보이는(목록에 나오는) 마킹 id */
    function getVisibleDefectIdSet() {
        return new Set((getCurrentFloorFilteredDefects() || []).map((d) => d && d.id).filter(Boolean));
    }
    /** 필터를 바꿔 숨겨진 마킹은 선택에서 뺀다. 뺀 개수를 돌려준다 */
    function pruneHiddenDefectSelection() {
        if (typeof selectedDefectIds === 'undefined' || !selectedDefectIds || !selectedDefectIds.size) return 0;
        const vis = getVisibleDefectIdSet();
        let n = 0;
        [...selectedDefectIds].forEach((id) => { if (!vis.has(id)) { selectedDefectIds.delete(id); n += 1; } });
        if (n && typeof updateMapSelectionBar === 'function') {
            try { updateMapSelectionBar({ scrollToSelection: false }); } catch (_e) { /* ignore */ }
        }
        return n;
    }
    window.pruneHiddenDefectSelection = pruneHiddenDefectSelection;

    function isCategoryFilterOn(catKey) {
        const f = window.state.categoryFilter || {};
        if (catKey === 'columnWall') return f.columnWall !== false;
        if (catKey === 'beamSlab') return f.beamSlab !== false;
        if (catKey === 'nonStructural') return f.nonStructural !== false;
        if (catKey === 'finishing') return f.finishing !== false;
        return true;
    }

    function setCategoryFilterOn(catKey, on) {
        if (!window.state.categoryFilter) {
            window.state.categoryFilter = { columnWall: true, beamSlab: true, nonStructural: true, finishing: true };
        }
        window.state.categoryFilter[catKey] = !!on;
        if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
        const checkboxIdMap = {
            columnWall: 'filterCatColumnWall',
            beamSlab: 'filterCatBeamSlab',
            nonStructural: 'filterCatNonStructural',
            finishing: 'filterCatFinishing'
        };
        const el = document.getElementById(checkboxIdMap[catKey]);
        if (el) el.checked = !!on;
    }

    // --- 결함 되돌리기/다시실행 히스토리 엔진 ---
    // 새로고침 시 초기화되어도 무방한 세션 한정 상태라 state가 아닌 클로저 변수로 관리
    const defectHistory = {};

    function getDefectHistoryKey() {
        return `${state.currentBuildingId}_${state.currentFloor}`;
    }

    // 결함이 바뀌기 직전에 호출해서 현재 상태를 되돌리기 스택에 저장
    /** extraKeys: 한 번에 같이 바뀌는 다른 층(외부 입면 번호 공간 등) — 되돌리기 한 번에 모두 돌린다 */
    function snapshotDefectHistoryEntry(key, extraKeys) {
        const others = (extraKeys || []).filter((k) => k && k !== key);
        if (!others.length) return JSON.stringify(state.defects[key] || []);
        const multi = {};
        [key].concat(others).forEach((k) => { multi[k] = state.defects[k] || []; });
        return JSON.stringify({ __multi: multi });
    }

    function applyDefectHistoryEntry(key, entry) {
        const parsed = JSON.parse(entry);
        const multi = (parsed && !Array.isArray(parsed) && parsed.__multi) ? parsed.__multi : { [key]: parsed };
        const keys = Object.keys(multi);
        const back = snapshotDefectHistoryEntry(key, keys);
        keys.forEach((k) => {
            const before = state.defects[k] || [];
            state.defects[k] = Array.isArray(multi[k]) ? multi[k] : [];
            reconcileDefectHistoryJump(k, before, state.defects[k]);
        });
        return back;
    }

    function pushDefectHistory(extraKeys) {
        if (!state.currentBuildingId) return;
        const key = getDefectHistoryKey();
        if (!defectHistory[key]) defectHistory[key] = { undo: [], redo: [] };
        const h = defectHistory[key];
        h.undo.push(snapshotDefectHistoryEntry(key, Array.isArray(extraKeys) ? extraKeys : null));
        if (h.undo.length > 30) h.undo.shift();
        h.redo = [];
        updateUndoRedoButtons();
    }

    /**
     * 되돌리기·다시 실행으로 결함 목록이 바뀐 뒤, 동기화 기록(묘비·수정 시각)을 맞춘다.
     *
     * 2026-09-21 감사: 결함 삭제 확인창은 "되돌리기로 복원 가능"이라고 하지만, 되돌리기는
     * 목록만 돌리고 삭제 때 남긴 묘비를 그대로 뒀다. 그래서 되돌린 결함이 다음 동기화에서
     * 다시 지워졌다. 또 되돌린 내용은 수정 시각이 옛날이라 서버 값에 졌다.
     *  - 되살아난 결함 → 묘비를 풀고 시각을 지금으로(동기화에서 이기게)
     *  - 사라진 결함(삭제를 다시 실행) → 묘비를 남기고 사진도 지운다(처음 삭제와 같게)
     *  - 내용이 바뀐 결함 → 시각을 지금으로
     * 삭제 때 사진은 클라우드·기기에서 즉시 지워진다. 되살린 결함에 사진 데이터가 남아
     * 있으면(되돌리기 기록·메모리 캐시) 다시 올리고, 없으면 몇 장이 복원 안 됐는지 알린다.
     */
    /**
     * 되살린 결함의 사진(kind ''=이번 회차, 'prev'=이전 회차)을 기기·클라우드에 다시 저장한다.
     * 사진 데이터(data:)가 되돌리기 기록이나 메모리 캐시에 남은 것만 가능하다 — 클라우드 주소(https)는
     * 이미 지워진 파일을 가리키므로 쓰지 않는다. 삭제가 아직 진행 중이면 끝난 뒤에 올린다
     * (먼저 올리면 뒤이어 도는 삭제가 방금 올린 사진을 지운다). 반환: 복원하지 못한 장 수.
     */
    function restoreDefectPhotosAfterUndo(d, kind) {
        const ids = Array.isArray(kind ? d.prevRoundPhotoIds : d.photoIds) ? (kind ? d.prevRoundPhotoIds : d.photoIds) : [];
        const inline = Array.isArray(kind ? d.prevRoundPhotos : d.photos) ? (kind ? d.prevRoundPhotos : d.photos) : [];
        const count = Math.max(ids.length, inline.length);
        if (!count) return 0;
        const isData = (v) => typeof v === 'string' && v.indexOf('data:') === 0 && v.length > 32;
        const cache = window._photoCache || {};
        const srcs = [];
        const slotIds = defectPhotoIdList(d, count, kind);
        for (let i = 0; i < count; i++) {
            const cand = [inline[i], ids[i] && cache[ids[i]], cache[slotIds[i]]].find(isData);
            srcs.push(cand || null);
        }
        const usable = srcs.filter(Boolean).length;
        if (usable) {
            const pending = (window._defectPhotoDeleteJobs && window._defectPhotoDeleteJobs.get(d.id)) || Promise.resolve();
            Promise.resolve(pending).catch(() => {}).then(async () => {
                await Promise.all(srcs.map((src, i) => (src ? persistPhotoUrlToIdb(slotIds[i], src) : null)));
                await uploadDefectPhotos(d.id, srcs, kind || undefined, slotIds);
            }).catch((e) => console.warn('[되돌리기] 사진 다시 저장 실패:', d.id, kind, e));
        }
        return count - usable;
    }

    /** 되돌리기 전후 결함 한 건 — 어느 갈래(내용·위치·사진·소속)가 바뀌었나 */
    function defectHistoryBranchDiff(a, b) {
        const sm = window.BSA && window.BSA.syncMerge;
        const posFields = (sm && sm.DEFECT_POSITION_FIELDS) || ['x', 'y', 'targetX', 'targetY', 'vertices', 'points', 'areaX1', 'areaY1', 'areaX2', 'areaY2', 'areaAngle', 'width', 'height', 'rotation'];
        const groupFields = ['groupId', 'groupNo', 'mergedFrom', 'surveyNumbered'];
        const photoFields = ['photoIds', 'prevRoundPhotoIds', 'photos', 'prevRoundPhotos', 'photoUrls', 'prevRoundPhotoUrls'];
        const pick = (o, fs) => JSON.stringify(fs.map((f) => (o && o[f] !== undefined) ? o[f] : null));
        let content = false;
        if (sm && typeof sm.defectContentHashes === 'function') {
            const ha = sm.defectContentHashes(a || {});
            const hb = sm.defectContentHashes(b || {});
            const ks = new Set(Object.keys(ha).concat(Object.keys(hb)));
            ks.forEach((k) => { if (k !== 'gridLoc' && ha[k] !== hb[k]) content = true; });
        } else {
            content = true;
        }
        return {
            content,
            position: pick(a, posFields) !== pick(b, posFields) || (a && a.gridLoc) !== (b && b.gridLoc),
            photos: pick(a, photoFields) !== pick(b, photoFields),
            group: pick(a, groupFields) !== pick(b, groupFields)
        };
    }
    window.__bsaDefectHistoryBranchDiff = defectHistoryBranchDiff;

    function reconcileDefectHistoryJump(key, beforeList, afterList) {
        const beforeById = new Map((beforeList || []).filter((d) => d && d.id).map((d) => [d.id, d]));
        const afterById = new Map((afterList || []).filter((d) => d && d.id).map((d) => [d.id, d]));
        let photosNotRestored = 0;
        afterById.forEach((d, id) => {
            const prev = beforeById.get(id);
            if (!prev) {
                if (typeof untrackDefectDeletion === 'function') untrackDefectDeletion(key, id);
                touchDefectUpdatedAt(d);
                touchDefectPositionUpdatedAt(d);
                if (d.groupId) d.groupUpdatedAt = bsaStampAfter(d.groupUpdatedAt);
                photosNotRestored += restoreDefectPhotosAfterUndo(d, '');
                photosNotRestored += restoreDefectPhotosAfterUndo(d, 'prev');
            } else if (JSON.stringify(prev) !== JSON.stringify(d)) {
                // 2026-10-16 실제로 바뀐 갈래의 시각만 올린다 — 예전엔 내용만 되돌려도 위치 시각까지 찍혀
                // 다른 기기에서 그 사이 옮긴 위치를 덮었고, 이동만 되돌려도 내용 시각이 올라 삭제를 이겼다.
                const br = defectHistoryBranchDiff(prev, d);
                if (br.content) touchDefectUpdatedAt(d);
                if (br.position) touchDefectPositionUpdatedAt(d);
                if (br.photos) {
                    recordDefectPhotoState(d, prev.photoIds, d.photoIds);
                    stampDefectPhotosChangedIfSafe(d);
                }
                if (br.group) d.groupUpdatedAt = bsaStampAfter(Math.max(Number(d.groupUpdatedAt) || 0, Number(prev.groupUpdatedAt) || 0));
                // 2026-10-20 번호(no·cadNo)만 바뀐 되돌리기(빈칸 당기기 등)도 시각을 올린다 — 안 그러면 서버의 당겨진 번호가 다시 이긴다
                const numChanged = String(prev.no || '') !== String(d.no || '') || String(prev.cadNo || '') !== String(d.cadNo || '');
                if (numChanged) {
                    d.updatedAt = bsaStampAfter(Math.max(Number(d.updatedAt) || 0, Number(prev.updatedAt) || 0));
                    d.contentUpdatedAt = Math.max(d.updatedAt, (Number(d.contentUpdatedAt) || 0) + 1, (Number(prev.contentUpdatedAt) || 0) + 1);
                    if (d.groupId || d.groupNo) d.groupUpdatedAt = bsaStampAfter(Math.max(Number(d.groupUpdatedAt) || 0, Number(prev.groupUpdatedAt) || 0));
                }
                if (!br.content && !numChanged && (br.position || br.photos || br.group)) d.updatedAt = bsaStampAfter(d.updatedAt);
            }
        });
        beforeById.forEach((d, id) => {
            if (afterById.has(id)) return;
            trackDefectDeletion(key, id, d);
            deleteAllPhotosForDefect(d, { deferCloudFloorKey: key }).catch(() => {});
        });
        if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
        if (photosNotRestored > 0) {
            window.showToast(`결함은 되살렸지만 이미 지워진 사진 ${photosNotRestored}장은 복원하지 못했습니다.`, 'warning', 6000);
        }
    }

    function undoDefectChange() {
        const key = getDefectHistoryKey();
        const h = defectHistory[key];
        if (!h || h.undo.length === 0) return;
        const prevSnapshot = h.undo.pop();
        h.redo.push(applyDefectHistoryEntry(key, prevSnapshot));
        saveStateToLocalStorage();
        refreshAfterDefectNumberChange();
        window.showToast('되돌리기 완료', 'info', 1500);
    }

    function redoDefectChange() {
        const key = getDefectHistoryKey();
        const h = defectHistory[key];
        if (!h || h.redo.length === 0) return;
        const nextSnapshot = h.redo.pop();
        h.undo.push(applyDefectHistoryEntry(key, nextSnapshot));
        saveStateToLocalStorage();
        refreshAfterDefectNumberChange();
        window.showToast('다시 실행 완료', 'info', 1500);
    }

    /** 표·도면·목록을 한꺼번에 다시 그린다(번호가 바뀐 뒤 어느 한쪽만 옛 번호로 남지 않게) */
    function refreshAfterDefectNumberChange() {
        if (typeof renderSurveyTable === 'function') renderSurveyTable();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
        else if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
        if (typeof window.scheduleDefectNumberGapNotice === 'function') window.scheduleDefectNumberGapNotice();
    }
    window.refreshAfterDefectNumberChange = refreshAfterDefectNumberChange;

    function updateUndoRedoButtons() {
        const h = state.currentBuildingId ? defectHistory[getDefectHistoryKey()] : null;
        const canUndo = !!(h && h.undo.length > 0);
        const canRedo = !!(h && h.redo.length > 0);
        const btnUndoEl = document.getElementById('btnUndo');
        const btnRedoEl = document.getElementById('btnRedo');
        const mobileUndo = document.getElementById('mobileBtnUndo');
        if (btnUndoEl) btnUndoEl.disabled = !canUndo;
        if (btnRedoEl) btnRedoEl.disabled = !canRedo;
        if (mobileUndo) mobileUndo.disabled = !canUndo;
        const mobileRedo = document.getElementById('mobileBtnRedo');
        if (mobileRedo) mobileRedo.disabled = !canRedo;
    }

    // 결함목록 스크롤 위치 저장·복원 (DOM 재렌더 시 맨 위로 튀는 현상 방지)
    // 섹션 키는 제목 텍스트(건수 포함)가 아니라 data-section-key 사용 — 동기화 후 건수 변경에 깨지지 않게
    let _lastDefectListScrollSnapshot = null;
    let _defectListScrollGen = 0;

    function getDefectListSectionKey(sec) {
        if (!sec) return '';
        if (sec.dataset && sec.dataset.sectionKey) return String(sec.dataset.sectionKey);
        const titleEl = sec.querySelector('.defect-list-section-title');
        const raw = titleEl ? titleEl.textContent.trim() : '';
        return raw.replace(/\s*\(\d+\)\s*$/, '');
    }

    function captureDefectListScroll(panel) {
        if (!panel) return null;
        const sections = {};
        panel.querySelectorAll('.defect-list-section').forEach((sec) => {
            const key = getDefectListSectionKey(sec);
            const box = sec.querySelector('.defect-list-section-scroll');
            if (key && box) sections[key] = box.scrollTop;
        });
        const snap = { panelTop: panel.scrollTop, sections };
        _lastDefectListScrollSnapshot = snap;
        return snap;
    }

    function applyDefectListScrollSnapshot(panel, snapshot) {
        if (!panel || !snapshot) return;
        if (typeof snapshot.panelTop === 'number') panel.scrollTop = snapshot.panelTop;
        panel.querySelectorAll('.defect-list-section').forEach((sec) => {
            const key = getDefectListSectionKey(sec);
            const box = sec.querySelector('.defect-list-section-scroll');
            if (key && box && snapshot.sections && snapshot.sections[key] !== undefined) {
                box.scrollTop = snapshot.sections[key];
            }
        });
    }

    function restoreDefectListScroll(panel, snapshot) {
        const snap = snapshot || _lastDefectListScrollSnapshot;
        if (!panel || !snap) return;
        // 진행 중이던 "선택 행으로 스크롤" 예약 무효화 (동기화 재렌더와 경쟁하지 않게)
        _defectListScrollGen += 1;
        applyDefectListScrollSnapshot(panel, snap);
        requestAnimationFrame(() => {
            applyDefectListScrollSnapshot(panel, snap);
            requestAnimationFrame(() => applyDefectListScrollSnapshot(panel, snap));
        });
    }

    function scrollDefectListRowIntoView(row, behavior, align) {
        if (!row) return;
        // 마킹 드래그 중 center/nearest 스크롤이 반복되면 목록·뷰가 덜컥거림
        if (typeof isMapPinDragActive === 'function' && isMapPinDragActive()) return;
        const scrollBehavior = behavior || 'smooth';
        // 도면에서 마킹 선택 시 조사표 스크롤 영역 가운데에 오도록 (기본 center)
        const alignMode = align || 'center';
        const pad = 8;
        const panel = document.getElementById('defectListPanel');
        let node = row.parentElement;
        let anyScrolled = false;
        while (node) {
            const style = window.getComputedStyle(node);
            const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay')
                && node.scrollHeight > node.clientHeight + 1;
            if (canScrollY) {
                const rowRect = row.getBoundingClientRect();
                const nodeRect = node.getBoundingClientRect();
                if (alignMode === 'center') {
                    const rowMid = rowRect.top + (rowRect.height / 2);
                    const nodeMid = nodeRect.top + (nodeRect.height / 2);
                    node.scrollTop += rowMid - nodeMid;
                    anyScrolled = true;
                } else if (rowRect.top < nodeRect.top + pad) {
                    node.scrollTop += rowRect.top - nodeRect.top - pad;
                    anyScrolled = true;
                } else if (rowRect.bottom > nodeRect.bottom - pad) {
                    node.scrollTop += rowRect.bottom - nodeRect.bottom + pad;
                    anyScrolled = true;
                }
            }
            if (panel && node === panel) break;
            node = node.parentElement;
        }
        if (!anyScrolled) {
            row.scrollIntoView({
                behavior: scrollBehavior,
                block: alignMode === 'center' ? 'center' : 'nearest',
                inline: 'nearest'
            });
        }
        const livePanel = document.getElementById('defectListPanel');
        if (livePanel) captureDefectListScroll(livePanel);
    }

    function isMobilePortraitDefectDrawer() {
        return layoutMediaMobilePortrait();
    }

    function revealSelectedDefectListAboveDrawer() {
        // 선택됨은 #defectListSelectedSlot(스크롤 밖)에 고정 표시 — 아래 목록 scrollTop을 건드리지 않음
        if (typeof isMapPinDragActive === 'function' && isMapPinDragActive()) return;
        const slot = document.getElementById('defectListSelectedSlot');
        if (slot && !slot.hidden) return;
        // 슬롯이 비어 있을 때만(레거시) 하이라이트 행 nearest — center 정렬·맨위 점프 금지
        const panel = document.getElementById('defectListPanel');
        if (!panel) return;
        const row = panel.querySelector('.defect-list-item.is-map-selected');
        if (row) scrollDefectListRowIntoView(row, 'auto', 'nearest');
    }

    function scheduleRevealDefectListAboveDrawer() {
        if (typeof isMapPinDragActive === 'function' && isMapPinDragActive()) return;
        const need = (typeof isMobilePortraitDefectDrawer === 'function' && isMobilePortraitDefectDrawer())
            || (typeof isDefectDrawerBottomLayout === 'function' && isDefectDrawerBottomLayout())
            || (typeof layoutIsCompactWidth === 'function' && layoutIsCompactWidth());
        if (!need) return;
        const run = () => revealSelectedDefectListAboveDrawer();
        requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
        setTimeout(run, 80);
        setTimeout(run, 300);
        setTimeout(run, 520);
    }

    // 선택됨 칸: 스크롤 목록(#defectListPanel) 바깥에 고정 렌더 — 선택 변경이 목록 드래그 위치를 밀지 않음
    function renderDefectListSelectedSlot(selectedCluster) {
        const slot = document.getElementById('defectListSelectedSlot');
        if (!slot) return;
        slot.innerHTML = '';
        if (!selectedCluster || selectedCluster.length === 0) {
            slot.hidden = true;
            slot.setAttribute('aria-hidden', 'true');
            return;
        }
        const selTitle = selectedCluster.length === 1
            ? '✅ 선택됨'
            : `✅ 선택됨 (${selectedCluster.length})`;
        const selSection = renderDefectListSection(selTitle, selectedCluster, { mapSelected: true });
        if (!selSection) {
            slot.hidden = true;
            slot.setAttribute('aria-hidden', 'true');
            return;
        }
        selSection.classList.add('is-selected-cluster');
        slot.appendChild(selSection);
        slot.hidden = false;
        slot.removeAttribute('aria-hidden');
    }

    // 좌측 사이드바에 표시되는 "현재 층에 등록된 결함" 간단 목록 렌더링
    /** 외부 도면을 보는 중인가 — 조사항목에 도면 이름 표시·다른 외부 도면 마킹 포함 */
    function isExteriorListMode() {
        return !!(state.currentBuildingId && state.currentFloor
            && typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor));
    }

    /**
     * 외부 조사항목 목록: 지금 도면 행 + 다른 외부 도면의 행(번호순으로 섞음). 다른 도면 행에는 _listFloorCode를 붙인 사본을 쓴다
     * (원본 마킹은 건드리지 않는다). 번호는 그대로 — 빈 번호를 당기지 않는다.
     */
    function appendOtherExteriorListRows(rows) {
        if (!isExteriorListMode()) return rows;
        const id = state.currentBuildingId;
        const extra = [];
        listExteriorFloorCodesForBuilding(id).forEach((fc) => {
            if (fc === state.currentFloor) return;
            const list = (state.defects && state.defects[String(id) + '_' + fc]) || [];
            if (!list.length) return;
            getDefectsForListPanel(getCurrentFloorFilteredDefects(list), list).forEach((r) => {
                if (!r || isDefectMapUnregistered(r)) return;
                extra.push(Object.assign({}, r, { _listFloorCode: fc }));
            });
        });
        if (!extra.length) return rows;
        const seen = new Set((rows || []).map((r) => r && r.id).filter(Boolean));
        const merged = (rows || []).concat(extra.filter((r) => !r.id || !seen.has(r.id)));
        const withIdx = merged.map((r, i) => ({ r, i, p: parseDefectNoParts(r) }));
        withIdx.sort((a, b) => (a.p.main - b.p.main) || (a.p.suffix - b.p.suffix) || (a.i - b.i));
        return withIdx.map((x) => x.r);
    }

    function renderDefectListPanel(options = {}) {
        const panel = document.getElementById('defectListPanel');
        const summaryEl = document.getElementById('defectListSummary');
        if (!panel) return;

        const scrollSnapshot = captureDefectListScroll(panel);
        // options.scrollToSelection: 레거시 호환(선택됨 칸 분리 후 목록 점프에 미사용)
        void options.scrollToSelection;

        if (!state.currentBuildingId) {
            panel.innerHTML = '';
            if (summaryEl) summaryEl.innerHTML = '';
            if (typeof renderDefectListSelectedSlot === 'function') renderDefectListSelectedSlot([]);
            return;
        }

        const floorKey = `${state.currentBuildingId}_${state.currentFloor}`;
        if (state.defects[floorKey]) syncDefectGroupNosForFloor(floorKey);

        const allFloorDefects = getCurrentFloorDefects();
        const allForList = getDefectsForListPanel(allFloorDefects, allFloorDefects);
        const elevationSiblings = elevationSiblingFloorCodes(state.currentBuildingId, state.currentFloor);
        const elevationList = elevationSiblings.length > 1
            || (typeof isExteriorFloorCode === 'function' && isExteriorFloorCode(state.currentFloor));
        const unregisteredItems = elevationList
            ? getExteriorMapUnregisteredDefects(state.currentBuildingId, state.currentFloor)
            : allForList.filter(d => isPreviousRoundDefect(d) && isDefectMapUnregistered(d));
        let defects = getDefectsForListPanel(getCurrentFloorFilteredDefects(), allFloorDefects);
        // 2026-11-02 외부: 조사항목에 모든 외부 도면의 마킹번호를 보여 주고, 다른 도면의 것은 눌러서 그 도면으로 이동
        defects = appendOtherExteriorListRows(defects);

        if (summaryEl) {
            const counts = { columnWall: 0, beamSlab: 0, nonStructural: 0, finishing: 0 };
            allFloorDefects.forEach(d => {
                const cat = resolveDefectCategory(d.category);
                if (cat === '') return;
                if (cat === '비구조체') {
                    counts.nonStructural++;
                    return;
                }
                if (cat === '마감재') {
                    counts.finishing++;
                    return;
                }
                const group = getStructuralComponentGroup(d.component);
                if (group === 'both') {
                    counts.columnWall++;
                    counts.beamSlab++;
                } else if (group === 'columnWall') {
                    counts.columnWall++;
                } else if (group === 'beamSlab') {
                    counts.beamSlab++;
                }
                // 계단·기타 등은 양쪽이 켜져야 보이며, 건수 배지에는 넣지 않음
            });
            const openingCrackCount = allFloorDefects.filter(d => !!d.isOpeningCrack).length;
            // 목록 상단 공간 절약: 짧은 라벨 + "N건" 생략
            const catMeta = [
                { label: '기둥·벽', short: '기둥·벽', key: 'columnWall', className: 'cat-structural', count: counts.columnWall },
                { label: '보·슬래브', short: '보·슬', key: 'beamSlab', className: 'cat-structural-beam', count: counts.beamSlab },
                { label: '비구조체', short: '비구조', key: 'nonStructural', className: 'cat-nonstructural', count: counts.nonStructural },
                { label: '마감재', short: '마감', key: 'finishing', className: 'cat-finishing', count: counts.finishing }
            ];
            let html = `<span class="defect-summary-total">${allFloorDefects.length}</span>`;
            catMeta.forEach(meta => {
                const on = isCategoryFilterOn(meta.key);
                const offClass = on ? '' : ' is-off';
                html += `<button type="button" class="defect-summary-badge ${meta.className}${offClass}" data-cat-filter="${meta.key}" title="${meta.label} ${meta.count}건 · 도면 표시 ${on ? '끄기' : '켜기'}"><span class="defect-summary-label">${meta.short}</span><span class="defect-summary-count">${meta.count}</span></button>`;
            });
            {
                const openOn = window.state.showOpeningCracks !== false;
                const openOff = openOn ? '' : ' is-off';
                html += `<button type="button" class="defect-summary-badge cat-opening-crack${openOff}" data-opening-crack-filter="1" title="개구부 결함 ${openingCrackCount}건 · 표시 ${openOn ? '끄기' : '켜기'}"><span class="defect-summary-label">개구</span><span class="defect-summary-count">${openingCrackCount}</span></button>`;
            }
            summaryEl.innerHTML = html;
            summaryEl.querySelectorAll('[data-cat-filter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const key = btn.getAttribute('data-cat-filter');
                    setCategoryFilterOn(key, !isCategoryFilterOn(key));
                    if (typeof drawCanvas === 'function') drawCanvas();
                    renderDefectListPanel();
                });
            });
            summaryEl.querySelectorAll('[data-opening-crack-filter]').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.state.showOpeningCracks = !(window.state.showOpeningCracks !== false); if (typeof window.pruneHiddenDefectSelection === "function") window.pruneHiddenDefectSelection();
                    if (typeof drawCanvas === 'function') drawCanvas();
                    renderDefectListPanel();
                });
            });
        }

        // 전차(전회차) 미등록 마킹은 PC에서만 — 모바일은 현장 금회차 점검에 집중
        const showPrevRoundRegister = !layoutIsCompactWidth();

        if (defects.length === 0 && (!showPrevRoundRegister || unregisteredItems.length === 0)) {
            if (allFloorDefects.length > 0) {
                panel.innerHTML = '<div class="defect-list-empty">표시 중인 분류가 없습니다.<br>위 분류 버튼을 켜 주세요.</div>';
            } else {
                panel.innerHTML = '<div class="defect-list-empty">아직 등록된 결함이 없습니다.<br>도면에서 핀을 찍어보세요.</div>';
            }
            if (typeof renderDefectListSelectedSlot === 'function') renderDefectListSelectedSlot([]);
            return;
        }

        panel.innerHTML = '';
        const previousItemsRaw = defects.filter(d => isPreviousRoundDefect(d) && !isDefectMapUnregistered(d));
        const currentItemsRaw = defects.filter(d => !isPreviousRoundDefect(d));

        // 도면에서 선택된 결함 → 바깥 "선택됨" 칸 + 본 목록은 자리 유지(하이라이트만)
        const selectedCluster = [];
        const seenSelectedKey = new Set();
        const collectSelected = (list) => {
            list.forEach((d) => {
                if (!isDefectListItemSelected(d)) return;
                const key = d.id || d.groupId;
                if (seenSelectedKey.has(key)) return;
                seenSelectedKey.add(key);
                selectedCluster.push(d);
            });
        };
        collectSelected(unregisteredItems);
        collectSelected(previousItemsRaw);
        collectSelected(currentItemsRaw);

        // 선택 항목을 본 목록에서 빼지 않음 — 빼면 스크롤/드래그 위치가 위로 당겨짐
        const previousItems = previousItemsRaw;
        const currentItems = currentItemsRaw;
        const unregForList = unregisteredItems;

        if (typeof renderDefectListSelectedSlot === 'function') {
            renderDefectListSelectedSlot(selectedCluster);
        }

        if (showPrevRoundRegister) {
            const unregSection = renderDefectListSection('🟣 전차 미등록', unregForList, { unregistered: true });
            if (unregSection) panel.appendChild(unregSection);
        }
        const prevSection = renderDefectListSection('🕐 전회차 조사항목', previousItems);
        if (prevSection) panel.appendChild(prevSection);
        const curSection = renderDefectListSection('🆕 금회차 조사항목', currentItems);
        if (curSection) panel.appendChild(curSection);

        // 선택 변경 시 본 목록을 center/scrollIntoView 하지 않음 — 선택됨 칸이 대체 UI
        _defectListScrollGen += 1;
        restoreDefectListScroll(panel, scrollSnapshot || _lastDefectListScrollSnapshot);
        if (selectedCluster.length === 0) {
            window._defectListScrollSelectedId = null;
        } else {
            window._defectListScrollSelectedId = selectedCluster.length >= 2
                ? selectedCluster.map(d => d.id || d.groupId).join(',')
                : `single:${selectedCluster[0].id || selectedCluster[0].groupId}`;
        }

        updateUndoRedoButtons();
    }
    window.renderDefectListPanel = renderDefectListPanel;

    function isDefectListItemSelected(d) {
        const set = (typeof window.getSelectedDefectIds === 'function')
            ? window.getSelectedDefectIds()
            : null;
        if (!set || set.size === 0 || !d) return false;
        if (d.id && set.has(d.id)) return true;
        if (d._groupMemberIds && d._groupMemberIds.some(id => set.has(id))) return true;
        return false;
    }

    // 결함번호(d.no, 예: "NO.01", "NO.01-1")에서 정렬용 숫자를 추출. 번호가 없으면 맨 뒤로 보낸다
    function getDefectSortNo(d) {
        return parseDefectSortNoValue(d);
    }

    // 좌측 결함목록용: 균열폭·이격 등 정도를 한눈에 볼 수치 문자열
    // 여러 건이면 "값,\n값" 형태(콤마+다음 줄) — 3개면 3줄
    function formatDefectListMeasure(d) {
        const type = String(d.defectType || '');
        const isCrack = type.includes('균열');
        const isGap = type.includes('이격');
        if (!isCrack && !isGap) return '';

        const withMm = (raw) => {
            const n = normalizeCrackDecimalText(String(raw ?? '').trim().replace(/mm|㎜/ig, '').trim());
            if (!n || n === '-') return '';
            return `${n}mm`;
        };
        const joinMultiLine = (parts) => parts.filter(Boolean).join(',\n');

        if (isCrack) {
            if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
                const bits = d.crackMeasures.map(m => formatCrackMeasurePair({
                    width: m.width,
                    length: m.length,
                    count: m.count,
                    join: inferMeasureJoin(d, m)
                })).filter(Boolean);
                if (bits.length) return joinMultiLine(bits);
            }
            const cw = d.crackWidth;
            if (cw !== undefined && cw !== null && String(cw).trim() !== '') {
                const parts = String(cw).split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);
                if (parts.length > 1) return joinMultiLine(parts.map(withMm));
                return withMm(cw);
            }
        }

        const size = String(d.size || '').trim();
        if (!size || size === '-') return '';

        // 규모에 이미 ", "로 여러 건이 들어 있으면 목록에서도 줄바꿈
        if (size.includes(', ')) {
            return size.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean).join(',\n');
        }

        const patterns = [
            /(?:W\s*=\s*|폭\s*[:=]?\s*|이격\s*[:=]?\s*|틈\s*[:=]?\s*|Cw\s*[:=]\s*)(\d+(?:\.\d+)?)\s*(?:mm|㎜)?/i,
            /^(\d+(?:\.\d+)?)\s*(?:mm|㎜)\b/i,
            /^(\d+(?:\.\d+)?)\s*\/\s*\d+/
        ];
        for (const re of patterns) {
            const m = size.match(re);
            if (m) return withMm(m[1]);
        }

        // 짧은 규모 텍스트는 그대로 노출 (예: "약 5mm")
        if (size.length <= 16) return size;
        return `${size.slice(0, 14)}…`;
    }

    /** 균열폭 값만 추출 (여러 행·숨김 필드 `/` 구분 포함) */
    function getDefectCrackWidthParts(d) {
        if (!d) return [];
        if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
            return d.crackMeasures.map(m => String(m && m.width != null ? m.width : '').trim()).filter(Boolean);
        }
        const raw = String(d.crackWidth != null ? d.crackWidth : '').trim();
        if (!raw) return [];
        return raw.split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);
    }

    /** 보고서/한글용: 균열폭을 "0.15mm, 0.20mm" 처럼 콤마+공백으로 연결 */
    function formatDefectCrackWidthsForReport(d) {
        const parts = getDefectCrackWidthParts(d);
        if (!parts.length) return '';
        return parts.map((w) => {
            const n = normalizeCrackDecimalText(String(w).replace(/mm|㎜/ig, '').trim());
            if (!n) return '';
            return /mm|㎜/i.test(w) ? `${n}mm` : `${n}mm`;
        }).filter(Boolean).join(', ');
    }

    /** 규모(상태조사표 size) — crackMeasures는 ", "로 연결 (한글 출력 동일) */
    function formatDefectSizeMeasuresJoined(d, pairFn) {
        if (!d) return '';
        const fmt = typeof pairFn === 'function' ? pairFn : formatCrackMeasurePair;
        if (Array.isArray(d.crackMeasures) && d.crackMeasures.length) {
            const bits = d.crackMeasures.map(m => fmt({
                width: m.width,
                length: m.length,
                count: m.count,
                join: inferMeasureJoin(d, m)
            })).filter(Boolean);
            if (bits.length) return bits.join(', ');
        }
        return '';
    }

    // 좌측 결함목록: 화살표는 한 행(결함표 없으면 N, 있으면 N-1), 결함표는 N-2…
    function getDefectsForListPanel(defects, allDefects) {
        const list = defects || [];
        const full = allDefects || list;
        if (Array.isArray(full) && full.length) repairLegacyMarkingSuffixGroups(full);
        const seenMarkingGroups = new Set();
        const seenMainMarking = new Set();
        const rows = [];
        const sorted = list.slice().sort((a, b) => {
            const pa = parseDefectNoParts(a);
            const pb = parseDefectNoParts(b);
            if (pa.main !== pb.main) return pa.main - pb.main;
            const ae = a.surveyExtra ? 1 : 0;
            const be = b.surveyExtra ? 1 : 0;
            if (ae !== be) return ae - be;
            if (pa.suffix !== pb.suffix) return pa.suffix - pb.suffix;
            if (a.groupId && a.groupId === b.groupId) {
                return String(a.id || '').localeCompare(String(b.id || ''));
            }
            const na = parseDefectSortNoValue(a);
            const nb = parseDefectSortNoValue(b);
            if (na !== nb) return na - nb;
            return String(a.no || '').localeCompare(String(b.no || ''));
        });

        sorted.forEach((d) => {
            const skipApi = arrowSurveyNumberApi();
            if (skipApi && skipApi.shouldSkipOrphanUnnumberedInSurveyList(d)) return;
            if (d.surveyExtra) {
                rows.push(surveyExtraRowFor(full, d));
                return;
            }
            const parts = parseDefectNoParts(d);
            if (parts.suffix > 0 && !d.groupId) {
                if (seenMainMarking.has(parts.main)) return;
            } else if (!d.groupId && parts.main !== Number.MAX_SAFE_INTEGER) {
                seenMainMarking.add(parts.main);
            }
            if (d.groupId) {
                if (seenMarkingGroups.has(d.groupId)) return;
                seenMarkingGroups.add(d.groupId);
                if (parts.main !== Number.MAX_SAFE_INTEGER) seenMainMarking.add(parts.main);
                const markingMembers = markingMembersForGroupRow(full, full.filter((m) => m.groupId === d.groupId && !m.surveyExtra));
                if (!markingMembers.length) return;
                const extrasInGroup = full.filter((m) => m.groupId === d.groupId && m.surveyExtra);
                const rep = pickDefectGroupRepresentative(markingMembers) || d;
                const locations = markingMembers.map((m) => m.location).filter(Boolean);
                const uniqLoc = [];
                locations.forEach((loc) => {
                    if (uniqLoc.indexOf(loc) === -1) uniqLoc.push(loc);
                });
                const baseNo = rep.groupNo || stripDefectNoSuffix(rep.no) || rep.no;
                const listNo = extrasInGroup.length
                    ? `${getDefectGroupMainNo(rep)}-1`
                    : baseNo;
                rows.push({
                    ...rep,
                    no: listNo,
                    location: uniqLoc.length > 0 ? uniqLoc.join(' / ') : rep.location,
                    ...((typeof mergeGroupGridLocProp === 'function') ? mergeGroupGridLocProp(markingMembers) : {}),
                    isProgress: markingMembers.some((m) => m.isProgress),
                    isLeak: markingMembers.some((m) => m.isLeak),
                    isOpeningCrack: markingMembers.some((m) => m.isOpeningCrack),
                    isCarriedOver: markingMembers.some((m) => m.isCarriedOver),
                    mapUnregistered: markingMembers.some((m) => m.mapUnregistered),
                    isPriorityManage: markingMembers.some((m) => m.isPriorityManage),
                    isBookmark: markingMembers.some((m) => m.isBookmark),
                    _groupMemberIds: markingMembers.map((m) => m.id),
                    _groupHasSurveyExtras: extrasInGroup.length > 0,
                    _representative: rep
                });
                return;
            }
            rows.push(d);
        });
        return rows;
    }

    // 목록 원 번호: 결함표 없으면 마킹=N, 결함표 있으면 마킹=N-1 · 결함표=N-2…
    function formatDefectListBadgeNo(d) {
        const compactWithSuffix = (raw) => {
            const m = String(raw || '').replace(/^NO\.?\s*/i, '').trim().match(/(\d+)(?:-(\d+))?/);
            if (!m) return String(raw || '').replace(/^NO\.?\s*/i, '').trim() || '?';
            const main = String(parseInt(m[1], 10));
            return m[2] ? `${main}-${parseInt(m[2], 10)}` : main;
        };
        if (!d) return '?';
        if (d.surveyExtra) return compactWithSuffix(d.no || d.groupNo);
        if (d._groupMemberIds && d._groupMemberIds.length) {
            if (d._groupHasSurveyExtras) return compactWithSuffix(d.no || d.groupNo);
            const p = parseDefectNoParts({ no: d.groupNo || stripDefectNoSuffix(d.no) || d.no });
            if (p.main === Number.MAX_SAFE_INTEGER) return '?';
            return String(p.main);
        }
        return compactWithSuffix(d.no || d.groupNo);
    }

    /**
     * 목록 행 → 수정창에 넘길 실제 결함. 결함 통합 X-k 행은 보고서용 사본(surveyExtra·번호 X-k)이라
     * 그대로 넘기면 원래 마킹이 아닌 사본을 연다 → 같은 id의 실제 마킹(통합 화살표)을 연다.
     */
    function liveDefectForListRow(d) {
        if (!d || !d._mergeExtraId) return d;
        const live = (getCurrentFloorDefects() || []).find((x) => x && x.id === d.id);
        return live || d;
    }

    // 결함 1건의 목록 카드(DOM row) 생성 — renderDefectListSection에서 재사용
    function buildDefectRow(d, options = {}) {
        const isUnregistered = options.unregistered || isDefectMapUnregistered(d);
        const catClass = isUnregistered ? '' : (d.category === '비구조체' ? 'cat-nonstructural' : (d.category === '마감재' ? 'cat-finishing' : ''));
        const badgeNo = formatDefectListBadgeNo(d);
        const shapeIcon = d.shapeType === 'area' ? '🟧 ' : '';

        const row = document.createElement('div');
        row.className = `defect-list-item ${catClass}`.trim();
        if (d.id) row.dataset.defectId = d.id;
        if (isDefectListItemSelected(d) || options.mapSelected) {
            row.classList.add('is-map-selected');
        }
        if (isUnregistered) {
            row.classList.add('map-unregistered');
            if (window._pendingMapRegisterDefectId === d.id) row.classList.add('is-pending-map-register');
        }
        if (d.isBookmark) row.classList.add('is-important'); // 「중요」 고른 것만(중점관리만으로는 아님) — 도면과 같게
        const badge = document.createElement('span');
        badge.className = 'defect-badge-no';
        if (isUnregistered) badge.classList.add('badge-unregistered');
        else if (isGoodDefectType(d.defectType)) badge.classList.add('badge-good');
        badge.textContent = badgeNo;
        row.appendChild(badge);

        const lines = document.createElement('div');
        lines.className = 'defect-list-item-lines';

        const compText = `${shapeIcon}${memberNameOut(d.component) || ''}`.trim();
        const memberGbChoices = getAmbiguousMemberChoices(d.component);
        const typeText = d.defectType || '';
        const compLine = document.createElement('span');
        compLine.className = 'defect-list-item-component';
        compLine.textContent = compText || (d.location || '');
        lines.appendChild(compLine);

        const typeLine = document.createElement('span');
        typeLine.className = 'defect-list-item-type';
        typeLine.textContent = typeText;
        lines.appendChild(typeLine);

        // 상태양호 · 균열폭/이격폭(규모) 공란이면 3번째 줄 생략해 목록 칸을 아낀다
        const isGood = isGoodDefectType(d.defectType);
        const measureText = formatDefectListMeasure(d);
        const sizeFallback = String(d.size || '').trim();
        const measureDisplay = measureText
            || ((sizeFallback && sizeFallback !== '-') ? sizeFallback : '');
        if (!isGood && measureDisplay) {
            const measureEl = document.createElement('span');
            measureEl.className = 'defect-list-item-measure';
            measureEl.textContent = measureDisplay;
            measureEl.title = d.size ? `규모: ${d.size}` : '균열폭/이격폭';
            lines.appendChild(measureEl);
        } else {
            lines.classList.add('no-measure');
        }

        const summaryBits = [compText || d.location, typeText, !isGood ? measureDisplay : '']
            .map((s) => String(s || '').trim())
            .filter(Boolean);
        row.title = isUnregistered
            ? '클릭 후 도면에서 마킹 위치를 지정하세요'
            : (summaryBits.join(' ') || d.location || '');
        if (memberGbChoices) {
            const gbHint = `${memberGbChoices.join('/')} 지정 필요`;
            row.classList.add('bsa-member-gb-needed');
            compLine.classList.add('bsa-member-gb-needed-text');
            compLine.title = gbHint;
            row.title = `${gbHint} — ${row.title}`;
        }

        const prevPhotoCount = (Array.isArray(d.prevRoundPhotos) ? d.prevRoundPhotos.filter(Boolean).length : 0)
            || (Array.isArray(d.prevRoundPhotoIds) ? d.prevRoundPhotoIds.length : 0);
        if (prevPhotoCount > 0) {
            const prevBadge = document.createElement('span');
            prevBadge.className = 'defect-list-item-prev-photos';
            prevBadge.title = `전차 사진 ${prevPhotoCount}장 — 결함 수정에서 확인`;
            prevBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> 전차 사진 ${prevPhotoCount}`;
            lines.appendChild(prevBadge);
        }

        // 2026-11-02 외부: 어느 도면에 있는지 표시. 지금 도면이 아니면 눌러서 그 도면으로 이동
        const otherFloorCode = (d._listFloorCode && d._listFloorCode !== state.currentFloor) ? d._listFloorCode : '';
        if (isExteriorListMode()) {
            const fcCode = d._listFloorCode || state.currentFloor;
            const floorChip = document.createElement('span');
            floorChip.className = 'defect-list-item-floor' + (otherFloorCode ? ' is-other' : '');
            floorChip.textContent = (otherFloorCode ? '↗ ' : '') + (getDefectLocationFloorLabel(fcCode) || fcCode);
            lines.appendChild(floorChip);
            if (otherFloorCode) {
                row.classList.add('is-other-floor');
                row.title = `「${getDefectLocationFloorLabel(otherFloorCode) || otherFloorCode}」 도면에 있는 마킹 — 눌러서 그 도면으로 이동`;
            }
        }

        row.appendChild(lines);

        const actions = document.createElement('div');
        actions.className = 'defect-list-item-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'defect-list-item-edit';
        editBtn.title = '수정';
        editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'defect-list-item-delete';
        deleteBtn.title = '삭제';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        actions.appendChild(deleteBtn);

        if (!otherFloorCode) row.appendChild(actions); // 다른 도면 마킹은 이동만(수정·삭제는 그 도면에서)

        row.addEventListener('click', (e) => {
            if (actions.contains(e.target)) return;
            if (otherFloorCode) {
                if (typeof window.viewDefectOnMapFromSurvey === 'function') window.viewDefectOnMapFromSurvey(d.id);
                return;
            }
            if (isUnregistered) {
                startMapRegisterForDefect(d.id);
                return;
            }
            if (typeof window.getSelectedDefectIds === 'function') {
                const set = window.getSelectedDefectIds();
                if (set) {
                    set.clear();
                    if (d._groupMemberIds && d._groupMemberIds.length > 1) {
                        d._groupMemberIds.forEach((id) => set.add(id));
                    } else if (d.id) {
                        set.add(d.id);
                    }
                    if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: false });
                    else if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
                }
            }
            window.focusDefectOnCanvas(d.id, { uncovered: true });
            if (d.groupId) window._groupBoxCycle = { groupId: d.groupId, lastId: d.id };
            const modalOpen = document.body.classList.contains('defect-modal-open')
                || (typeof isDefectModalOpen === 'function' && isDefectModalOpen());
            const mobileField = layoutIsCompactWidth();
            if ((modalOpen || mobileField) && typeof openAddDefectModal === 'function') {
                const live = liveDefectForListRow(d);
                openAddDefectModal(live.x, live.y, live.targetX, live.targetY, live, null, { revealMarkingAboveDrawer: true });
            }
        });
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (d.id) window.focusDefectOnCanvas(d.id, { uncovered: true });
            const live = liveDefectForListRow(d);
            openAddDefectModal(live.x, live.y, live.targetX, live.targetY, live, null, { revealMarkingAboveDrawer: true });
        });
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.deleteDefectById(d.id);
        });

        return row;
    }

    // 전회차/금회차 구역 하나(제목 + 스크롤 가능한 카드 목록)를 만들어 반환 — 항목이 없으면 null
    function renderDefectListSection(title, items, options = {}) {
        if (items.length === 0) return null;
        const section = document.createElement('div');
        section.className = 'defect-list-section';
        section.dataset.sectionKey = String(title || '');
        if (options.unregistered) section.classList.add('map-unregistered-section');

        const header = document.createElement('div');
        header.className = 'defect-list-section-title';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '0.4rem';

        const titleSpan = document.createElement('span');
        titleSpan.textContent = `${title} (${items.length})`;
        header.appendChild(titleSpan);

        if (options.unregistered && typeof window.clearMapUnregisteredDefects === 'function') {
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'btn btn-sm btn-danger-outline';
            clearBtn.style.flexShrink = '0';
            clearBtn.style.fontSize = '0.72rem';
            clearBtn.style.padding = '0.15rem 0.45rem';
            clearBtn.title = '전차 미등록 일괄 삭제';
            clearBtn.textContent = '일괄 삭제';
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.clearMapUnregisteredDefects();
            });
            header.appendChild(clearBtn);
        }

        section.appendChild(header);

        const scrollBox = document.createElement('div');
        scrollBox.className = 'defect-list-section-scroll';
        items.forEach(d => scrollBox.appendChild(buildDefectRow(d, options)));
        section.appendChild(scrollBox);

        return section;
    }

    // 영역(면적) 형태 결함 렌더링 — 화면 캔버스와 보고서 캔버스(drawPinSafe) 양쪽에서 공용으로 사용
    // 번호 네모칸은 여기에 고정하지 않고, drawPin이 지시선으로 연결해 그린다.
    function normalizeAreaFillStyle(v) {
        return (v === 'hatch' || v === 'none') ? v : 'solid';
    }

    function normalizeAreaBorderStyle(v) {
        return v === 'dashed' ? 'dashed' : 'solid';
    }

    function getAreaFillStyle(defect) {
        if (defect && defect.areaFillStyle) return normalizeAreaFillStyle(defect.areaFillStyle);
        return normalizeAreaFillStyle(state && state.areaFillStyle);
    }

    function getAreaBorderStyle(defect) {
        if (defect && defect.areaBorderStyle) return normalizeAreaBorderStyle(defect.areaBorderStyle);
        return normalizeAreaBorderStyle(state && state.areaBorderStyle);
    }

    function getSelectedAreaFillFromUi() {
        if (document.getElementById('btnAreaFillHatch')?.classList.contains('active')) return 'hatch';
        if (document.getElementById('btnAreaFillNone')?.classList.contains('active')) return 'none';
        return 'solid';
    }

    function getSelectedAreaBorderFromUi() {
        if (document.getElementById('btnAreaBorderDashed')?.classList.contains('active')) return 'dashed';
        return 'solid';
    }

    function syncDefectAreaStyleUi(fillStyle, borderStyle) {
        const fill = normalizeAreaFillStyle(fillStyle);
        const border = normalizeAreaBorderStyle(borderStyle);
        ['solid', 'hatch', 'none'].forEach(k => {
            const btn = document.getElementById(k === 'solid' ? 'btnAreaFillSolid' : (k === 'hatch' ? 'btnAreaFillHatch' : 'btnAreaFillNone'));
            if (btn) btn.classList.toggle('active', k === fill);
        });
        ['solid', 'dashed'].forEach(k => {
            const btn = document.getElementById(k === 'solid' ? 'btnAreaBorderSolid' : 'btnAreaBorderDashed');
            if (btn) btn.classList.toggle('active', k === border);
        });
    }

    function syncDefectAreaAngleRowVisible(shapeHint) {
        const angEl = document.getElementById('defectAreaAngle');
        const row = angEl?.closest('.defect-area-style-row');
        if (!row) return;
        const shape = (shapeHint && typeof shapeHint === 'object')
            ? getAreaShape(shapeHint)
            : normalizeAreaShape(shapeHint || 'rect');
        row.style.display = isPolyPointAreaShape(shape) ? 'none' : '';
    }

    function setDefectAreaStylePanelVisible(isArea, shapeHint) {
        const block = document.getElementById('defectAreaStyleBlock');
        const arrowBlock = document.querySelector('#defectModal .defect-arrow-block');
        if (block) block.style.display = isArea ? '' : 'none';
        if (arrowBlock) arrowBlock.style.display = isArea ? 'none' : '';
        if (isArea) syncDefectAreaAngleRowVisible(shapeHint);
    }

    function normalizeAreaShape(v) {
        // 'polyline'(열린 선)을 모르는 옛 앱은 'rect'로 읽어 영역 박스로 그린다(깨지지 않음)
        return (v === 'ellipse' || v === 'polygon' || v === 'polyline') ? v : 'rect';
    }

    /** 점들로 이루어진 모양: 다각형(닫힘) · 선(열림, 채우기 없음) */
    function isPolyPointAreaShape(v) {
        return v === 'polygon' || v === 'polyline';
    }

    function areaPolyMinPoints(shape) {
        return shape === 'polyline' ? 2 : 3;
    }

    function getAreaShape(defect) {
        return normalizeAreaShape(defect && defect.areaShape);
    }

    function areaShapeSupportsRotation(defect) {
        return !isPolyPointAreaShape(getAreaShape(defect));
    }

    function getAreaAngleDeg(defect) {
        const n = Number(defect && defect.areaAngle);
        return Number.isFinite(n) ? n : 0;
    }

    function getAreaAabb(defect) {
        const x1 = Math.min(Number(defect.areaX1) || 0, Number(defect.areaX2) || 0);
        const y1 = Math.min(Number(defect.areaY1) || 0, Number(defect.areaY2) || 0);
        const x2 = Math.max(Number(defect.areaX1) || 0, Number(defect.areaX2) || 0);
        const y2 = Math.max(Number(defect.areaY1) || 0, Number(defect.areaY2) || 0);
        return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
    }

    function rotateImgPoint(x, y, cx, cy, deg) {
        const rad = (deg * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const dx = x - cx;
        const dy = y - cy;
        return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
    }

    function areaLocalToImg(defect, lx, ly) {
        const { cx, cy } = getAreaAabb(defect);
        return rotateImgPoint(cx + lx, cy + ly, cx, cy, getAreaAngleDeg(defect));
    }

    function areaImgToLocal(defect, x, y) {
        const { cx, cy } = getAreaAabb(defect);
        const rad = (getAreaAngleDeg(defect) * Math.PI) / 180;
        const c = Math.cos(rad);
        const s = Math.sin(rad);
        const dx = x - cx;
        const dy = y - cy;
        return { x: dx * c + dy * s, y: -dx * s + dy * c };
    }

    function getAreaWorldCorners(defect) {
        const { w, h } = getAreaAabb(defect);
        const hw = w / 2;
        const hh = h / 2;
        return [
            areaLocalToImg(defect, -hw, -hh),
            areaLocalToImg(defect, hw, -hh),
            areaLocalToImg(defect, hw, hh),
            areaLocalToImg(defect, -hw, hh)
        ];
    }

    function getAreaPolyPoints(defect) {
        const polyKind = getAreaShape(defect);
        if (isPolyPointAreaShape(polyKind) && Array.isArray(defect.areaPoints) && defect.areaPoints.length >= areaPolyMinPoints(polyKind)) {
            return defect.areaPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
        }
        return getAreaWorldCorners(defect);
    }

    function syncAreaBboxFromPoints(defect) {
        const pts = getAreaPolyPoints(defect);
        if (!pts.length) return;
        let x1 = pts[0].x, y1 = pts[0].y, x2 = pts[0].x, y2 = pts[0].y;
        pts.forEach((p) => {
            x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
            x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
        });
        defect.areaX1 = x1; defect.areaY1 = y1; defect.areaX2 = x2; defect.areaY2 = y2;
    }

    function pointInPolygonPts(pts, x, y) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
            const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function distPointToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy || 1e-12;
        let t = ((px - ax) * dx + (py - ay) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    function isPointInAreaMark(defect, x, y, pad) {
        if (!defect || defect.areaX1 === undefined) return false;
        const p = pad || 0;
        const shape = getAreaShape(defect);
        if (shape === 'polyline') {
            // 열린 선: 안쪽이 없고, 선분 가까이만 맞는다(마지막 점→첫 점은 잇지 않음)
            const linePts = getAreaPolyPoints(defect);
            const tol = Math.max(p, 0) + 8;
            for (let i = 0; i < linePts.length - 1; i++) {
                if (distPointToSegment(x, y, linePts[i].x, linePts[i].y, linePts[i + 1].x, linePts[i + 1].y) <= tol) return true;
            }
            return false;
        }
        if (shape === 'polygon') {
            const pts = getAreaPolyPoints(defect);
            if (pointInPolygonPts(pts, x, y)) return true;
            if (p > 0) {
                for (let i = 0; i < pts.length; i++) {
                    const a = pts[i];
                    const b = pts[(i + 1) % pts.length];
                    if (distPointToSegment(x, y, a.x, a.y, b.x, b.y) <= p) return true;
                }
            }
            return false;
        }
        const loc = areaImgToLocal(defect, x, y);
        const { w, h } = getAreaAabb(defect);
        const hw = w / 2 + p;
        const hh = h / 2 + p;
        if (shape === 'ellipse') {
            if (hw <= 0 || hh <= 0) return false;
            return (loc.x * loc.x) / (hw * hw) + (loc.y * loc.y) / (hh * hh) <= 1;
        }
        return loc.x >= -hw && loc.x <= hw && loc.y >= -hh && loc.y <= hh;
    }

    function getAreaRotateHandle(defect) {
        const { h } = getAreaAabb(defect);
        return areaLocalToImg(defect, 0, -h / 2 - 28);
    }

    function getAreaOrientedEdgeCenters(defect) {
        const { w, h } = getAreaAabb(defect);
        return [
            areaLocalToImg(defect, 0, -h / 2),
            areaLocalToImg(defect, w / 2, 0),
            areaLocalToImg(defect, 0, h / 2),
            areaLocalToImg(defect, -w / 2, 0)
        ];
    }

    function translateAreaDrawings(defect, dx, dy) {
        if (!defect || (!dx && !dy)) return;
        (defect.areaDrawings || []).forEach((st) => {
            (st.points || []).forEach((p) => {
                p.x += dx; p.y += dy;
            });
        });
        (defect.areaPoints || []).forEach((p) => {
            p.x += dx; p.y += dy;
        });
    }

    function rotateAreaDefect(defect, newAngleDeg) {
        if (!defect || !areaShapeSupportsRotation(defect)) return;
        const { cx, cy } = getAreaAabb(defect);
        const old = getAreaAngleDeg(defect);
        const delta = newAngleDeg - old;
        if (!delta) {
            if (getAreaShape(defect) !== 'polygon') defect.areaAngle = newAngleDeg;
            return;
        }
        const rot = (p) => rotateImgPoint(p.x, p.y, cx, cy, delta);
        if (getAreaShape(defect) === 'polygon' && Array.isArray(defect.areaPoints)) {
            defect.areaPoints = defect.areaPoints.map((p) => rot(p));
            syncAreaBboxFromPoints(defect);
            defect.areaAngle = 0;
        } else {
            defect.areaAngle = newAngleDeg;
        }
        if (typeof defect.targetX === 'number' && typeof defect.targetY === 'number') {
            const r = rot({ x: defect.targetX, y: defect.targetY });
            defect.targetX = r.x; defect.targetY = r.y;
        }
        (defect.areaDrawings || []).forEach((st) => {
            if (!st.points) return;
            st.points = st.points.map((p) => rot(p));
        });
    }

    /** 회전 드래그: 시작 스냅샷 기준으로 누적 각만 적용 (다각형 AABB 중심 드리프트 방지) */
    function beginAreaRotateSession(defect, imgX, imgY) {
        if (!defect) return;
        const { cx, cy } = getAreaAabb(defect);
        areaRotatePivot = { cx, cy };
        areaRotateStartMouse = Math.atan2(imgY - cy, imgX - cx);
        areaRotateBaseAngle = getAreaAngleDeg(defect);
        areaRotateSnapshot = {
            areaX1: defect.areaX1,
            areaY1: defect.areaY1,
            areaX2: defect.areaX2,
            areaY2: defect.areaY2,
            areaAngle: defect.areaAngle,
            areaPoints: Array.isArray(defect.areaPoints)
                ? defect.areaPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) }))
                : null,
            areaDrawings: Array.isArray(defect.areaDrawings)
                ? defect.areaDrawings.map((st) => ({
                    type: st.type,
                    points: (st.points || []).map((p) => ({ x: Number(p.x), y: Number(p.y) }))
                }))
                : [],
            targetX: defect.targetX,
            targetY: defect.targetY
        };
    }

    function applyAreaRotateSession(defect, imgX, imgY) {
        if (!defect || !areaRotatePivot || !areaRotateSnapshot) return;
        const mouse = Math.atan2(imgY - areaRotatePivot.cy, imgX - areaRotatePivot.cx);
        let deltaDeg = ((mouse - areaRotateStartMouse) * 180) / Math.PI;
        // -180~180 래핑 (드래그 중 점프 방지)
        while (deltaDeg > 180) deltaDeg -= 360;
        while (deltaDeg < -180) deltaDeg += 360;
        const { cx, cy } = areaRotatePivot;
        const rot = (p) => rotateImgPoint(p.x, p.y, cx, cy, deltaDeg);

        if (isPolyPointAreaShape(getAreaShape(defect)) && areaRotateSnapshot.areaPoints) {
            defect.areaPoints = areaRotateSnapshot.areaPoints.map((p) => rot(p));
            syncAreaBboxFromPoints(defect);
            defect.areaAngle = 0;
        } else {
            defect.areaX1 = areaRotateSnapshot.areaX1;
            defect.areaY1 = areaRotateSnapshot.areaY1;
            defect.areaX2 = areaRotateSnapshot.areaX2;
            defect.areaY2 = areaRotateSnapshot.areaY2;
            defect.areaAngle = areaRotateBaseAngle + deltaDeg;
        }

        defect.areaDrawings = (areaRotateSnapshot.areaDrawings || []).map((st) => ({
            type: st.type,
            points: (st.points || []).map((p) => rot(p))
        }));

        if (typeof areaRotateSnapshot.targetX === 'number' && typeof areaRotateSnapshot.targetY === 'number') {
            const t = rot({ x: areaRotateSnapshot.targetX, y: areaRotateSnapshot.targetY });
            defect.targetX = t.x;
            defect.targetY = t.y;
        }
    }

    function endAreaRotateSession() {
        areaRotatePivot = null;
        areaRotateSnapshot = null;
        areaRotateStartMouse = 0;
        areaRotateBaseAngle = 0;
    }

    function applyAreaVertexMove(defect, vertexIndex, imgX, imgY) {
        if (!defect || !Array.isArray(defect.areaPoints)) return;
        const i = Number(vertexIndex);
        if (!Number.isInteger(i) || i < 0 || i >= defect.areaPoints.length) return;
        defect.areaPoints[i] = { x: imgX, y: imgY };
        syncAreaBboxFromPoints(defect);
    }

    /** 영역 리사이즈. 반대편을 넘기면 잡은 핸들이 반대 점으로 넘어감. 반환: 다음 프레임용 필드 */
    function applyAreaResizeLocal(defect, imgX, imgY, xField, yField) {
        if (!defect) return { xField: xField || null, yField: yField || null };
        const aabb = getAreaAabb(defect);
        const loc = areaImgToLocal(defect, imgX, imgY);
        let lx1 = -aabb.w / 2;
        let ly1 = -aabb.h / 2;
        let lx2 = aabb.w / 2;
        let ly2 = aabb.h / 2;
        const minXF = defect.areaX1 <= defect.areaX2 ? 'areaX1' : 'areaX2';
        const maxXF = defect.areaX1 <= defect.areaX2 ? 'areaX2' : 'areaX1';
        const minYF = defect.areaY1 <= defect.areaY2 ? 'areaY1' : 'areaY2';
        const maxYF = defect.areaY1 <= defect.areaY2 ? 'areaY2' : 'areaY1';

        let dragMinX = xField === minXF;
        let dragMaxX = xField === maxXF;
        let dragMinY = yField === minYF;
        let dragMaxY = yField === maxYF;

        if (dragMinX) lx1 = loc.x;
        if (dragMaxX) lx2 = loc.x;
        if (dragMinY) ly1 = loc.y;
        if (dragMaxY) ly2 = loc.y;

        // 반대 변을 넘어가면 잡은 점을 반대쪽으로 넘김 (기존 UX)
        if (dragMinX && lx1 > lx2) {
            const t = lx1; lx1 = lx2; lx2 = t;
            dragMinX = false; dragMaxX = true;
        } else if (dragMaxX && lx2 < lx1) {
            const t = lx1; lx1 = lx2; lx2 = t;
            dragMaxX = false; dragMinX = true;
        }
        if (dragMinY && ly1 > ly2) {
            const t = ly1; ly1 = ly2; ly2 = t;
            dragMinY = false; dragMaxY = true;
        } else if (dragMaxY && ly2 < ly1) {
            const t = ly1; ly1 = ly2; ly2 = t;
            dragMaxY = false; dragMinY = true;
        }

        if (lx2 - lx1 < 12) {
            if (dragMinX) lx1 = lx2 - 12;
            else if (dragMaxX) lx2 = lx1 + 12;
            else {
                const m = (lx1 + lx2) / 2;
                lx1 = m - 6; lx2 = m + 6;
            }
        }
        if (ly2 - ly1 < 12) {
            if (dragMinY) ly1 = ly2 - 12;
            else if (dragMaxY) ly2 = ly1 + 12;
            else {
                const m = (ly1 + ly2) / 2;
                ly1 = m - 6; ly2 = m + 6;
            }
        }

        const mid = areaLocalToImg(defect, (lx1 + lx2) / 2, (ly1 + ly2) / 2);
        const nw = lx2 - lx1;
        const nh = ly2 - ly1;
        // 저장 AABB는 항상 areaX1≤areaX2, areaY1≤areaY2
        defect.areaX1 = mid.x - nw / 2;
        defect.areaY1 = mid.y - nh / 2;
        defect.areaX2 = mid.x + nw / 2;
        defect.areaY2 = mid.y + nh / 2;

        return {
            xField: dragMinX ? 'areaX1' : (dragMaxX ? 'areaX2' : null),
            yField: dragMinY ? 'areaY1' : (dragMaxY ? 'areaY2' : null)
        };
    }

    function beginAreaShapePath(ctx, defect) {
        const shape = getAreaShape(defect);
        ctx.beginPath();
        if (shape === 'ellipse') {
            const { cx, cy, w, h } = getAreaAabb(defect);
            ctx.ellipse(cx, cy, Math.max(w / 2, 0.5), Math.max(h / 2, 0.5), (getAreaAngleDeg(defect) * Math.PI) / 180, 0, Math.PI * 2);
            return;
        }
        const pts = isPolyPointAreaShape(shape) ? getAreaPolyPoints(defect) : getAreaWorldCorners(defect);
        pts.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        });
        if (shape !== 'polyline') ctx.closePath(); // 선은 열린 채로(닫지 않음)
    }

    function paintAreaShapeInterior(ctx, defect, color, fillStyle) {
        if (fillStyle === 'none' || getAreaShape(defect) === 'polyline') return; // 선은 채우지 않는다
        ctx.save();
        beginAreaShapePath(ctx, defect);
        ctx.clip();
        if (fillStyle === 'solid') {
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = color;
            beginAreaShapePath(ctx, defect);
            ctx.fill();
        } else {
            // 해치는 도형 로컬 좌표계에서 그림 (회전·리사이즈 후에도 클립 안을 빈틈없이 채움)
            const shape = getAreaShape(defect);
            const step = 9;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.7;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([]);
            if (shape === 'polygon') {
                const { x1, y1, x2, y2, w, h } = getAreaAabb(defect);
                for (let i = -h; i <= w + h; i += step) {
                    ctx.beginPath();
                    ctx.moveTo(x1 + i, y1);
                    ctx.lineTo(x1 + i + h, y2);
                    ctx.stroke();
                }
            } else {
                const { cx, cy, w, h } = getAreaAabb(defect);
                const hw = w / 2;
                const hh = h / 2;
                ctx.translate(cx, cy);
                ctx.rotate((getAreaAngleDeg(defect) * Math.PI) / 180);
                for (let i = -h; i <= w + h; i += step) {
                    ctx.beginPath();
                    ctx.moveTo(-hw + i, -hh);
                    ctx.lineTo(-hw + i + h, hh);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    function strokeAreaShape(ctx, defect) {
        beginAreaShapePath(ctx, defect);
        ctx.stroke();
    }

    function clipAreaShape(ctx, defect) {
        beginAreaShapePath(ctx, defect);
        ctx.clip();
    }

    function drawAreaInkStrokes(ctx, defect, color) {
        const strokes = defect.areaDrawings;
        if (!Array.isArray(strokes) || !strokes.length) return;
        ctx.save();
        if (getAreaShape(defect) !== 'polyline') clipAreaShape(ctx, defect);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        strokes.forEach((st) => {
            const pts = st.points || [];
            if (pts.length < 1) return;
            const type = st.type || 'path';
            ctx.beginPath();
            if (type === 'rect' && pts.length >= 2) {
                const x1 = Math.min(pts[0].x, pts[1].x);
                const y1 = Math.min(pts[0].y, pts[1].y);
                const x2 = Math.max(pts[0].x, pts[1].x);
                const y2 = Math.max(pts[0].y, pts[1].y);
                ctx.rect(x1, y1, x2 - x1, y2 - y1);
                ctx.stroke();
            } else if (type === 'ellipse' && pts.length >= 2) {
                const x1 = Math.min(pts[0].x, pts[1].x);
                const y1 = Math.min(pts[0].y, pts[1].y);
                const x2 = Math.max(pts[0].x, pts[1].x);
                const y2 = Math.max(pts[0].y, pts[1].y);
                ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.max((x2 - x1) / 2, 0.5), Math.max((y2 - y1) / 2, 0.5), 0, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                pts.forEach((p, i) => {
                    if (i === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                });
                if (type === 'polygon' && pts.length >= 3) ctx.closePath();
                ctx.stroke();
            }
        });
        ctx.restore();
    }

    function drawAreaRect(ctx, defect, isPreview, forReport) {
        if (!defect || defect.areaX1 === undefined) return;
        const isBeingDragged = (!isPreview && typeof activeDragPin !== 'undefined' && activeDragPin && activeDragPin.id === defect.id);
        const roundLineMul = 1.0;
        const mainColor = getDefectColor(defect);
        const activeColor = isBeingDragged ? '#facc15' : mainColor;
        const fillStyle = getAreaFillStyle(defect);
        const borderStyle = getAreaBorderStyle(defect);
        const areaPinScale = getStyleSize(getDefectStyleKey(defect.category, defect.defectType)).pin;

        ctx.save();
        paintAreaShapeInterior(ctx, defect, activeColor, fillStyle);
        drawAreaInkStrokes(ctx, defect, activeColor);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = getDefectLeaderLineWidth(areaPinScale, roundLineMul, false);
        if (isPreview || borderStyle === 'dashed') ctx.setLineDash([5, 4]);
        else ctx.setLineDash([]);
        strokeAreaShape(ctx, defect);

        const selected = !isPreview && !forReport && defect.id
            && typeof selectedDefectIds !== 'undefined' && selectedDefectIds.has(defect.id)
            && shouldDrawMapSelectionChrome();
        if (selected) {
            ctx.setLineDash([]);
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 1.4;
            const handlePts = isPolyPointAreaShape(getAreaShape(defect))
                ? getAreaPolyPoints(defect)
                : getAreaWorldCorners(defect);
            handlePts.forEach((c) => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
            if (areaShapeSupportsRotation(defect)) {
                const handle = getAreaRotateHandle(defect);
                const { cx, cy } = getAreaAabb(defect);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(handle.x, handle.y);
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(handle.x, handle.y, 7, 0, Math.PI * 2);
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    function getAreaEdgeMidpoints(defect) {
        if (getAreaShape(defect) === 'polyline') {
            const linePts = getAreaPolyPoints(defect);
            const mids = [];
            for (let i = 0; i < linePts.length - 1; i++) {
                mids.push({ x: (linePts[i].x + linePts[i + 1].x) / 2, y: (linePts[i].y + linePts[i + 1].y) / 2 });
            }
            return mids;
        }
        if (getAreaShape(defect) === 'polygon') {
            const pts = getAreaPolyPoints(defect);
            return pts.map((p, i) => {
                const n = pts[(i + 1) % pts.length];
                return { x: (p.x + n.x) / 2, y: (p.y + n.y) / 2 };
            });
        }
        return getAreaOrientedEdgeCenters(defect);
    }

    function getAreaCenterBorderAttachDefect(fromX, fromY, defect) {
        // 번호칸(from)에서 유클리드 거리가 가장 가까운 변 중앙에 꽂음 (방향 dot 아님)
        return projectPointToAreaEdgeCenterDefect(fromX, fromY, defect);
    }

    function projectPointToAreaEdgeCenter(px, py, areaX1, areaY1, areaX2, areaY2) {
        const x1 = Math.min(areaX1, areaX2);
        const y1 = Math.min(areaY1, areaY2);
        const x2 = Math.max(areaX1, areaX2);
        const y2 = Math.max(areaY1, areaY2);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const candidates = [
            { x: cx, y: y1 },
            { x: cx, y: y2 },
            { x: x1, y: cy },
            { x: x2, y: cy }
        ];
        let best = candidates[0];
        let bestD = Infinity;
        candidates.forEach(c => {
            const d = (c.x - px) ** 2 + (c.y - py) ** 2;
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        });
        return best;
    }

    function projectPointToAreaEdgeCenterDefect(px, py, defect) {
        const candidates = getAreaEdgeMidpoints(defect);
        if (!candidates.length) {
            return projectPointToAreaEdgeCenter(px, py, defect.areaX1, defect.areaY1, defect.areaX2, defect.areaY2);
        }
        let best = candidates[0];
        let bestD = Infinity;
        candidates.forEach((c) => {
            const d = (c.x - px) ** 2 + (c.y - py) ** 2;
            if (d < bestD) { bestD = d; best = c; }
        });
        return best;
    }

    // 구버전 영역 마킹(번호가 좌상단 고정, tip 없음)을 일반 핀처럼 지시선 연결 좌표로 보정
    /** 핀 → 영역: tip(또는 박스) 기준으로 기본 사각형 영역 생성 */
    function convertDefectPinToArea(defect, options) {
        if (!defect) return false;
        if (defect.shapeType === 'area' && defect.areaX1 !== undefined) return false;
        const tipX = Number(defect.targetX);
        const tipY = Number(defect.targetY);
        const boxX = Number(defect.x);
        const boxY = Number(defect.y);
        const cx = Number.isFinite(tipX) ? tipX : (Number.isFinite(boxX) ? boxX : 0);
        const cy = Number.isFinite(tipY) ? tipY : (Number.isFinite(boxY) ? boxY : 0);
        const half = Math.max(40, Number(options && options.halfSize) || 60);
        defect.shapeType = 'area';
        defect.areaX1 = Math.round(cx - half);
        defect.areaY1 = Math.round(cy - half);
        defect.areaX2 = Math.round(cx + half);
        defect.areaY2 = Math.round(cy + half);
        defect.areaShape = 'rect';
        defect.areaAngle = 0;
        defect.areaPoints = undefined;
        defect.areaDrawings = Array.isArray(defect.areaDrawings) ? defect.areaDrawings : [];
        defect.areaFillStyle = defect.areaFillStyle || state.areaFillStyle || 'solid';
        defect.areaBorderStyle = defect.areaBorderStyle || state.areaBorderStyle || 'solid';
        if (typeof ensureAreaPinPlacement === 'function') ensureAreaPinPlacement(defect);
        if (typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(defect);
        touchDefectUpdatedAt(defect);
        return true;
    }

    /** 영역 → 핀: 영역 중심을 tip으로, 번호 박스는 위쪽에 배치 */
    function convertDefectAreaToPin(defect) {
        if (!defect) return false;
        if (!(defect.shapeType === 'area' && defect.areaX1 !== undefined)) return false;
        const x1 = Math.min(Number(defect.areaX1) || 0, Number(defect.areaX2) || 0);
        const y1 = Math.min(Number(defect.areaY1) || 0, Number(defect.areaY2) || 0);
        const x2 = Math.max(Number(defect.areaX1) || 0, Number(defect.areaX2) || 0);
        const y2 = Math.max(Number(defect.areaY1) || 0, Number(defect.areaY2) || 0);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        defect.targetX = Math.round(cx);
        defect.targetY = Math.round(cy);
        const styleKey = (typeof getDefectStyleKey === 'function')
            ? getDefectStyleKey(defect.category, defect.defectType)
            : 'default';
        const label = (typeof formatDefectPinLabel === 'function')
            ? formatDefectPinLabel(defect, styleKey)
            : String(defect.no || '');
        const scale = (typeof getStyleSize === 'function') ? getStyleSize(styleKey).pin : 1;
        if (typeof computePinBoxAboveTarget === 'function' && state.ctx) {
            const pos = computePinBoxAboveTarget(defect.targetX, defect.targetY, label, scale, state.ctx, 1);
            defect.x = pos.boxX;
            defect.y = pos.boxY;
        } else {
            defect.x = Math.round(cx);
            defect.y = Math.round(cy - 40);
        }
        delete defect.shapeType;
        delete defect.areaX1;
        delete defect.areaY1;
        delete defect.areaX2;
        delete defect.areaY2;
        delete defect.areaShape;
        delete defect.areaAngle;
        delete defect.areaPoints;
        delete defect.areaDrawings;
        delete defect.areaFillStyle;
        delete defect.areaBorderStyle;
        if (typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(defect);
        touchDefectUpdatedAt(defect);
        return true;
    }

    window.convertDefectPinToArea = convertDefectPinToArea;
    window.convertDefectAreaToPin = convertDefectAreaToPin;

    function areaShapeLabelKo(shape) {
        const s = normalizeAreaShape(shape);
        if (s === 'ellipse') return '타원';
        if (s === 'polygon') return '다각형';
        if (s === 'polyline') return '선';
        return '네모';
    }

    function areaShapeConvertPhrase(shape) {
        const label = areaShapeLabelKo(shape);
        // 네모로 / 다각형으로 / 타원으로
        return label === '네모' ? `${label}로` : `${label}으로`;
    }

    /** 타원 → 다각형용: 회전 반영된 외곽 N점 근사 */
    function approxEllipseAreaPoints(defect, n) {
        const count = Math.max(8, Math.min(32, Number(n) || 12));
        const { w, h } = getAreaAabb(defect);
        const hw = w / 2;
        const hh = h / 2;
        const pts = [];
        for (let i = 0; i < count; i++) {
            const t = (Math.PI * 2 * i) / count;
            const p = areaLocalToImg(defect, hw * Math.cos(t), hh * Math.sin(t));
            pts.push({ x: Math.round(p.x), y: Math.round(p.y) });
        }
        return pts;
    }

    /** 선(polyline)이 낀 모양 변환 — 점 목록·bbox만 바꾸고 나머지(번호·사진·내용)는 그대로 */
    function applyPolylineShapeConversion(defect, cur, next) {
        const rnd = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
        if (next === 'polyline') {
            let pts;
            if (cur === 'ellipse') pts = approxEllipseAreaPoints(defect, 12);
            else if (cur === 'polygon') pts = getAreaPolyPoints(defect).map(rnd);
            else pts = getAreaWorldCorners(defect).map(rnd);
            // 닫힌 윤곽이 눈에 그대로 남도록 첫 점으로 되돌아오는 선분까지 넣는다
            pts = pts.concat([{ x: pts[0].x, y: pts[0].y }]);
            defect.areaShape = 'polyline';
            defect.areaPoints = pts;
            defect.areaAngle = 0;
            syncAreaBboxFromPoints(defect);
            return;
        }
        // 선 → 다각형/네모/타원
        const linePts = getAreaPolyPoints(defect).map(rnd);
        syncAreaBboxFromPoints(defect);
        const MIN_SIDE = 40;
        let x1 = Math.min(defect.areaX1, defect.areaX2);
        let x2 = Math.max(defect.areaX1, defect.areaX2);
        let y1 = Math.min(defect.areaY1, defect.areaY2);
        let y2 = Math.max(defect.areaY1, defect.areaY2);
        if (x2 - x1 < MIN_SIDE) { const c = (x1 + x2) / 2; x1 = c - MIN_SIDE / 2; x2 = c + MIN_SIDE / 2; }
        if (y2 - y1 < MIN_SIDE) { const c = (y1 + y2) / 2; y1 = c - MIN_SIDE / 2; y2 = c + MIN_SIDE / 2; }
        if (next === 'polygon') {
            const poly = linePts.slice();
            if (poly.length >= 2 && poly[0].x === poly[poly.length - 1].x && poly[0].y === poly[poly.length - 1].y) poly.pop();
            const flat = poly.length < 3 || (Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x)) < 1)
                || (Math.max(...poly.map((p) => p.y)) - Math.min(...poly.map((p) => p.y)) < 1);
            defect.areaShape = 'polygon';
            defect.areaPoints = flat
                ? [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }].map(rnd)
                : poly;
            defect.areaAngle = 0;
            syncAreaBboxFromPoints(defect);
        } else {
            defect.areaX1 = Math.round(x1); defect.areaY1 = Math.round(y1);
            defect.areaX2 = Math.round(x2); defect.areaY2 = Math.round(y2);
            defect.areaShape = next;
            defect.areaPoints = undefined;
            defect.areaAngle = 0;
        }
    }

    /**
     * 영역 모양 변환: 네모(rect) / 다각형(polygon) / 선(polyline) / 타원(ellipse)
     * 번호·사진·내용·층 키·동기화 필드는 유지. 기하만 합리적 범위에서 변환.
     */
    function convertDefectAreaShape(defect, targetShape) {
        if (!defect) return false;
        if (!(defect.shapeType === 'area' && defect.areaX1 !== undefined)) return false;
        const next = normalizeAreaShape(targetShape);
        const cur = getAreaShape(defect);
        if (next === cur) return false;

        if (next === 'polyline' || cur === 'polyline') {
            applyPolylineShapeConversion(defect, cur, next);
        } else if (next === 'polygon') {
            let pts;
            if (cur === 'ellipse') {
                pts = approxEllipseAreaPoints(defect, 12);
            } else {
                pts = getAreaWorldCorners(defect).map((p) => ({
                    x: Math.round(p.x),
                    y: Math.round(p.y)
                }));
            }
            defect.areaShape = 'polygon';
            defect.areaPoints = pts;
            defect.areaAngle = 0;
            syncAreaBboxFromPoints(defect);
        } else {
            // polygon → rect/ellipse: 점 AABB. rect↔ellipse: bbox·각도 유지
            if (cur === 'polygon') {
                syncAreaBboxFromPoints(defect);
                defect.areaAngle = 0;
            }
            defect.areaShape = next;
            defect.areaPoints = undefined;
        }

        if (typeof ensureAreaPinPlacement === 'function') ensureAreaPinPlacement(defect);
        if (typeof touchDefectPositionUpdatedAt === 'function') touchDefectPositionUpdatedAt(defect);
        touchDefectUpdatedAt(defect);
        return true;
    }

    window.convertDefectAreaShape = convertDefectAreaShape;

    function syncDefectShapeConvertButton(existingPin) {
        const btn = document.getElementById('btnConvertDefectShape');
        const shapeRow = document.getElementById('defectAreaShapeConvertRow');
        if (!btn) return;
        const redrawBtn = document.getElementById('btnRedrawDefectPolygon');
        if (!existingPin) {
            btn.hidden = true;
            if (shapeRow) shapeRow.hidden = true;
            if (redrawBtn) redrawBtn.hidden = true;
            return;
        }
        btn.hidden = false;
        const isArea = existingPin.shapeType === 'area' && existingPin.areaX1 !== undefined;
        btn.dataset.mode = isArea ? 'to-pin' : 'to-area';
        btn.innerHTML = isArea
            ? '<i class="fa-solid fa-location-dot"></i> 핀 마킹으로 변경'
            : '<i class="fa-solid fa-draw-polygon"></i> 영역 마킹으로 변경';
        btn.title = isArea ? '영역 마킹을 핀(화살표) 마킹으로 바꿉니다' : '핀 마킹을 영역(사각형) 마킹으로 바꿉니다';
        if (shapeRow) {
            const bulkNow = typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode();
            shapeRow.hidden = bulkNow;
            const labelEl = document.getElementById('defectAreaShapeConvertLabel');
            if (labelEl) labelEl.textContent = isArea ? '영역 모양 변경:' : '모양 바꾸기(번호·사진 유지):';
            if (!bulkNow) {
                const cur = isArea ? getAreaShape(existingPin) : '';
                shapeRow.querySelectorAll('[data-area-shape-convert]').forEach((b) => {
                    const t = normalizeAreaShape(b.getAttribute('data-area-shape-convert'));
                    const same = isArea && t === cur;
                    b.classList.toggle('active', same);
                    b.disabled = same;
                    b.setAttribute('aria-pressed', same ? 'true' : 'false');
                    if (same) b.title = `현재 모양: ${areaShapeLabelKo(t)}`;
                    else if (!isArea && isPolyPointAreaShape(t)) b.title = `${areaShapeConvertPhrase(t)} 변경 — 도면에 점을 찍어 그립니다`;
                    else b.title = `${areaShapeConvertPhrase(t)} 변경`;
                });
            }
        }
        if (redrawBtn) {
            const bulk = typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode();
            redrawBtn.hidden = !isArea || bulk;
            if (isArea && !bulk) {
                const cur = getAreaShape(existingPin);
                const isLine = cur === 'polyline';
                redrawBtn.innerHTML = isLine
                    ? '<i class="fa-solid fa-pen"></i> 선 다시그리기'
                    : '<i class="fa-solid fa-pen"></i> 다각형 다시그리기';
                redrawBtn.title = isLine
                    ? '선의 점을 새로 찍습니다. 번호·사진·내용은 유지됩니다.'
                    : (cur === 'polygon'
                        ? '외곽 꼭짓점을 새로 찍습니다. 번호·사진·내용은 유지됩니다.'
                        : '꼭짓점을 새로 찍어 다각형으로 바꿉니다. 번호·사진·내용은 유지됩니다.');
            }
        }
    }

    function ensureAreaPinPlacement(defect) {
        if (!defect || defect.shapeType !== 'area' || defect.areaX1 === undefined) return;
        const x1 = Math.min(defect.areaX1, defect.areaX2);
        const y1 = Math.min(defect.areaY1, defect.areaY2);
        const x2 = Math.max(defect.areaX1, defect.areaX2);
        const y2 = Math.max(defect.areaY1, defect.areaY2);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const styleKey = getDefectStyleKey(defect.category, defect.defectType);
        const label = formatDefectPinLabel(defect, styleKey);
        const scale = getStyleSize(styleKey).pin;

        const atLegacyCorner = Math.abs((defect.x ?? x1) - x1) < 2 && Math.abs((defect.y ?? y1) - y1) < 2;
        const atLegacyCenter = Math.abs((defect.targetX ?? 0) - cx) < 2
            && Math.abs((defect.targetY ?? 0) - cy) < 2;
        const needsTip = defect.targetX === undefined || defect.targetY === undefined
            || Number.isNaN(Number(defect.targetX)) || Number.isNaN(Number(defect.targetY));
        const needsBox = defect.x === undefined || defect.y === undefined
            || ((needsTip || atLegacyCenter) && atLegacyCorner);

        if (needsBox) {
            const attachProv = getAreaCenterBorderAttachDefect(defect.x ?? cx, defect.y ?? y1 - 40, defect);
            const pos = computePinBoxAboveTarget(attachProv.x, attachProv.y, label, scale, state.ctx, 1);
            defect.x = pos.boxX;
            defect.y = pos.boxY;
        }

        if (needsTip || atLegacyCenter || needsBox) {
            const attach = getAreaCenterBorderAttachDefect(defect.x, defect.y, defect);
            defect.targetX = attach.x;
            defect.targetY = attach.y;
        }
    }

    // defects를 groupId 기준으로 묶어서 그룹당 한 번만 drawFn(ctx, 대표결함, arrows)을 호출한다.
    // (drawPin/drawPinSafe 양쪽에서 재사용 — 화면 캔버스와 보고서 캔버스 모두 동일하게 "박스 하나 + 화살표 여러 개"로 그리기 위함)
    function pickDefectGroupRepresentative(members) {
        const list = (members || []).filter((m) => m && !m.surveyExtra);
        if (!list.length) return (members && members[0]) || null;
        const api = arrowSurveyNumberApi();
        const scored = list.slice().sort((a, b) => {
            if (api && typeof api.compareMarkingForRepresentative === 'function') {
                const u = api.compareMarkingForRepresentative(a, b);
                if (u !== 0) return u;
            }
            const pa = parseDefectNoParts(a);
            const pb = parseDefectNoParts(b);
            if (pa.main !== pb.main) return pa.main - pb.main;
            if (pa.suffix !== pb.suffix) return pa.suffix - pb.suffix;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });
        return scored[0];
    }

    function renderDefectsGrouped(ctx, defects, drawFn) {
        const renderedGroups = new Set();
        defects.forEach(defect => {
            if (defect.groupId) {
                if (renderedGroups.has(defect.groupId)) return;
                const groupMembers = defects.filter(d => d.groupId === defect.groupId);
                if (groupMembers.length > 1) {
                    renderedGroups.add(defect.groupId);
                    const representative = pickDefectGroupRepresentative(groupMembers) || defect;
                    const seenArrow = new Set();
                    const arrows = [];
                    const markingMembers = groupMembers
                        .filter((m) => m && !m.surveyExtra)
                        .slice()
                        .sort((a, b) => parseDefectSortNoValue(a) - parseDefectSortNoValue(b));
                    markingMembers.forEach((m, arrowIndex) => {
                        if (m.targetX === undefined || m.targetY === undefined) return;
                        const akey = `${Math.round(m.targetX)}|${Math.round(m.targetY)}|${m.arrowOctant || 0}|${m.id || ''}`;
                        if (seenArrow.has(akey)) return;
                        seenArrow.add(akey);
                        arrows.push({
                            targetX: m.targetX,
                            targetY: m.targetY,
                            forceArrowDir: !!m.forceArrowDir,
                            arrowOctant: (m.arrowOctant !== undefined ? m.arrowOctant : 0),
                            areaSource: (m.shapeType === 'area' && m.areaX1 !== undefined) ? m : null,
                            memberId: m.id || null,
                            arrowIndex: markingMembers.length > 1 ? arrowIndex : null
                        });
                    });
                    drawFn(ctx, representative, arrows);
                    return;
                }
            }
            drawFn(ctx, defect);
        });
    }

    // arrows: "마킹 추가"로 묶인 그룹을 하나의 박스+여러 화살표로 그릴 때 전달하는 {targetX,targetY}[] (없으면 defect 자신의 화살표 1개만 그림, 기존과 동일)
    // 2026-10-19 도면의 「중요」는 사용자가 「중요」를 고른 마킹(isBookmark)에만 — 중점관리만으로는 붙이지 않는다
    // (중점관리 표시는 핀 색(녹색)·중점관리 표·비교사진으로 그대로).
    function defectHasCornerMark(defect) {
        if (!defect) return false;
        if (defect.isBookmark) return true;
        if (!defect.groupId || typeof getDefectMarkingGroupMembers !== 'function') return false;
        return getDefectMarkingGroupMembers(defect.groupId).some((m) => m && m.isBookmark);
    }

    /**
     * 중요 마킹 — 번호 박스 색은 그대로 두고, 좌상단 모서리에 「중요」 글자를 붙인다.
     * 화면(drawPin)·보고서/PDF·한글·이미지(drawPinSafe) 공용.
     * 2026-09-29: 노란 원(예전의 1/3 크기) → 「중요」 글자. 글자 높이 ≈ 그 원의 지름, 자리도 원 자리(박스 좌상단 모서리 중심).
     *             노란 글자 + 얇은 진한 갈색 테두리(도면 위에서 읽히게).
     */
    const BOOKMARK_CHROME_SIZE_RATIO = 1 / 3;
    const BOOKMARK_CHROME_TEXT = '중요';
    function getBookmarkChromeGlyphHeight(scale) {
        const s = Math.max(0.85, Number(scale) || 1);
        return 2 * Math.max(8, 10 * s) * BOOKMARK_CHROME_SIZE_RATIO; // 예전 원 지름
    }
    function drawBookmarkChrome(ctx, w, h, scale) {
        const glyphH = getBookmarkChromeGlyphHeight(scale);
        const family = '"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        ctx.save();
        // 글꼴마다 한글 글자 높이가 달라 실제 글자 높이를 재서 맞춘다
        let fontPx = glyphH;
        ctx.font = `900 ${fontPx}px ${family}`;
        try {
            const m = ctx.measureText(BOOKMARK_CHROME_TEXT);
            const mh = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
            if (mh > 0) fontPx = fontPx * glyphH / mh;
        } catch (_e) { /* 옛 브라우저: 글꼴 크기 = 글자 높이 */ }
        ctx.font = `900 ${fontPx}px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = -w / 2;
        let cy = -h / 2;
        try {
            const m2 = ctx.measureText(BOOKMARK_CHROME_TEXT);
            if (m2.actualBoundingBoxAscent || m2.actualBoundingBoxDescent) {
                // middle 기준선과 실제 글자 가운데의 차이 보정 → 글자 가운데가 모서리에
                cy += (m2.actualBoundingBoxAscent - m2.actualBoundingBoxDescent) / 2;
            }
        } catch (_e) { /* ignore */ }
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.5, fontPx * 0.11);
        ctx.strokeStyle = '#713f12';
        ctx.strokeText(BOOKMARK_CHROME_TEXT, cx, cy);
        ctx.fillStyle = '#facc15';
        ctx.fillText(BOOKMARK_CHROME_TEXT, cx, cy);
        ctx.restore();
    }

    // 화면 전용 균열폭 배지 (t592u). 저장값·drawPinSafe(PDF/한글)는 건드리지 않는다.
    function crackWidthBadgeApi() {
        return (window.BSA && window.BSA.crackWidthBadge) || null;
    }
    function readCrackWidthBadgePref() {
        const api = crackWidthBadgeApi();
        return api ? api.readPref() : true;
    }
    function writeCrackWidthBadgePref(on) {
        const api = crackWidthBadgeApi();
        if (api) api.writePref(!!on);
    }
    function crackWidthBadgeTextFor(defect) {
        const api = crackWidthBadgeApi();
        if (!api || !readCrackWidthBadgePref()) return '';
        return api.formatBadgeText(defect) || '';
    }
    function syncCrackWidthBadgeUi() {
        const on = readCrackWidthBadgePref();
        document.querySelectorAll('[data-crack-width-badge]').forEach((el) => { el.checked = !!on; });
    }
    function setCrackWidthBadgeShow(on) {
        writeCrackWidthBadgePref(!!on);
        syncCrackWidthBadgeUi();
        if (typeof drawCanvas === 'function') drawCanvas();
    }
    function measureCrackWidthBadgeText(text, glyphH) {
        const family = '"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        const ctx = state && state.ctx;
        if (!ctx || !text) return 0;
        ctx.save();
        ctx.font = `900 ${glyphH}px ${family}`;
        let w = 0;
        try { w = ctx.measureText(text).width; } catch (_e) { w = 0; }
        ctx.restore();
        return w;
    }
    function drawCrackWidthChrome(ctx, w, h, scale, text, hasBookmark) {
        if (!ctx || !text) return;
        const api = crackWidthBadgeApi();
        const family = '"Pretendard", "Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        ctx.save();
        const glyphH = (typeof getBookmarkChromeGlyphHeight === 'function')
            ? getBookmarkChromeGlyphHeight(scale)
            : (2 * Math.max(8, 10 * Math.max(0.85, Number(scale) || 1)) / 3);
        let fontPx = glyphH;
        ctx.font = `900 ${fontPx}px ${family}`;
        try {
            const m = ctx.measureText(text);
            const mh = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
            if (mh > 0) fontPx = fontPx * glyphH / mh;
        } catch (_e) { /* 옛 브라우저 */ }
        ctx.font = `900 ${fontPx}px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let textW = 0;
        try { textW = ctx.measureText(text).width; } catch (_e) { textW = String(text).length * fontPx * 0.62; }
        const laid = api && typeof api.layout === 'function'
            ? api.layout(w, h, scale, text, !!hasBookmark, () => textW)
            : { cx: w / 2, cy: -h / 2 };
        let cx = laid.cx;
        let cy = laid.cy;
        try {
            const m2 = ctx.measureText(text);
            if (m2.actualBoundingBoxAscent || m2.actualBoundingBoxDescent) {
                cy += (m2.actualBoundingBoxAscent - m2.actualBoundingBoxDescent) / 2;
            }
        } catch (_e) { /* ignore */ }
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(0.5, fontPx * 0.11);
        ctx.strokeStyle = '#0c4a6e';
        ctx.strokeText(text, cx, cy);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(text, cx, cy);
        ctx.restore();
    }

    // 화면 전용 사진 표시 (2026-11-10 「마킹에 사진을 찍어 놨으면 네모마킹에도 보이게, 한글 출력에는 안 보이게」).
    // 번호칸 오른쪽 아래 모서리에 작은 카메라. 현차 사진만 본다(전차 사진 제외). 묶음은 구성원 중 하나라도 있으면.
    // 본 화면 도면 캔버스(state.ctx)에만 그린다 — drawPin을 쓰는 비파괴 위치도 출력·drawPinSafe(PDF/한글)에는 안 나온다.
    function defectHasCurrentPhoto(d) {
        if (!d) return false;
        return (Array.isArray(d.photos) && d.photos.some(Boolean))
            || (Array.isArray(d.photoIds) && d.photoIds.some(Boolean));
    }
    function defectHasPhotoMark(defect) {
        if (!defect) return false;
        if (defectHasCurrentPhoto(defect)) return true;
        if (!defect.groupId || typeof getDefectMarkingGroupMembers !== 'function') return false;
        return getDefectMarkingGroupMembers(defect.groupId).some(defectHasCurrentPhoto);
    }
    function drawPhotoChrome(ctx, w, h, scale) {
        const gh = getBookmarkChromeGlyphHeight(scale);
        const bw = gh * 1.35; // 카메라 몸통
        const bh = gh * 0.92;
        const r = gh * 0.18;
        const x = w / 2 - bw / 2; // 몸통 가운데 = 박스 오른쪽 아래 모서리
        const y = h / 2 - bh / 2;
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        // 위 돌기(뷰파인더)
        ctx.moveTo(x + bw * 0.30, y);
        ctx.lineTo(x + bw * 0.38, y - gh * 0.2);
        ctx.lineTo(x + bw * 0.62, y - gh * 0.2);
        ctx.lineTo(x + bw * 0.70, y);
        // 몸통(둥근 네모)
        ctx.lineTo(x + bw - r, y);
        ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
        ctx.lineTo(x + bw, y + bh - r);
        ctx.quadraticCurveTo(x + bw, y + bh, x + bw - r, y + bh);
        ctx.lineTo(x + r, y + bh);
        ctx.quadraticCurveTo(x, y + bh, x, y + bh - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.lineWidth = Math.max(0.6, gh * 0.16);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#7c3aed';
        ctx.fill();
        // 렌즈
        ctx.beginPath();
        ctx.arc(x + bw / 2, y + bh / 2, bh * 0.27, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
    }

    function drawPin(ctx, defect, arrows) {
        drawPinBody(ctx, defect, arrows);
    }

    function drawPinBody(ctx, defect, arrows) {
        const groupAreaSources = [];
        if (arrows && arrows.length) {
            arrows.forEach((a) => {
                if (a && a.areaSource && a.areaSource.areaX1 !== undefined) groupAreaSources.push(a.areaSource);
            });
        }
        if (groupAreaSources.length) {
            const seen = new Set();
            groupAreaSources.forEach((a) => {
                const key = a.id || a;
                if (seen.has(key)) return;
                seen.add(key);
                drawAreaRect(ctx, a, false);
            });
            ensureAreaPinPlacement(defect);
        } else if (defect.shapeType === 'area' && defect.areaX1 !== undefined) {
            drawAreaRect(ctx, defect, false);
            ensureAreaPinPlacement(defect);
            // 번호칸·지시선은 아래 일반 핀 로직으로 이어서 그림
        }
        const boxX = defect.x || 100;
        const boxY = defect.y || 100;
        const defectSize = getStyleSize(getDefectStyleKey(defect.category, defect.defectType));
        const scale = defectSize.pin;
        const arrowScale = defectSize.arrow;
        const isBeingDragged = (typeof activeDragPin !== 'undefined' && activeDragPin &&
            (activeDragPin.id === defect.id || (defect.groupId && activeDragPin.groupId === defect.groupId)));

        // Category Theme Color: 사용자 지정 색상(styleColors) 우선, 없으면 기본값
        const defectStyleKey = getDefectStyleKey(defect.category, defect.defectType);
        const mainColor = getDefectColor(defect);
        const shapeCfg = getDefectPinShapeCfg(defect, defectStyleKey);
        const useCircleTip = state.tipShape === 'circle';

        const roundLineMul = 1.0;
        const activeColor = isBeingDragged ? '#facc15' : mainColor;

        const targets = (arrows && arrows.length > 0)
            ? arrows
            : (defect.targetX !== undefined && defect.targetY !== undefined
                ? [{ targetX: defect.targetX, targetY: defect.targetY, memberId: defect.id || null }]
                : []);

        const pinLabel = formatDefectPinLabel(defect, defectStyleKey);
        const { w, h } = measurePinBoxDimensions(ctx, pinLabel, scale, roundLineMul);

        const groupMemberSelected = !!(defect.groupId
            && typeof selectedDefectIds !== 'undefined'
            && getDefectMarkingGroupMembers(defect.groupId).some((m) => selectedDefectIds.has(m.id)));
        const pinChromeSelected = !!(typeof selectedDefectIds !== 'undefined' && shouldDrawMapSelectionChrome()
            && ((defect.id && selectedDefectIds.has(defect.id)) || groupMemberSelected));

        // Leader Line & Arrow Tip Rendering — 실선, 마킹과 가장 가까운 박스 모서리에서 시작
        // 영역 마킹: 테두리에만 선이 꼽히고 내부/화살표 관통은 없음
        const isAreaDefect = defect.shapeType === 'area' && defect.areaX1 !== undefined;
        const leaderTips = collectLeaderTipPoints(targets);
        targets.forEach(t => {
            if (t.targetX === undefined || t.targetY === undefined) return;
            let targetX = t.targetX;
            let targetY = t.targetY;
            const areaSrc = (t.areaSource && t.areaSource.areaX1 !== undefined)
                ? t.areaSource
                : (isAreaDefect ? defect : null);
            const tipIsArea = !!areaSrc;
            if (areaSrc) {
                // 회전·타원·다각형: 실제 도형 변 중점에 꽂음 (AABB 고정점 금지)
                const attach = getAreaCenterBorderAttachDefect(boxX, boxY, areaSrc);
                targetX = attach.x;
                targetY = attach.y;
            }
            const lineColor = activeColor;
            const leaderAnchorOpts = { shape: shapeCfg.shape, scale };
            const anchor = getGroupLeaderBoxAnchor(boxX, boxY, targetX, targetY, leaderTips, w, h, state.rotationAngle || 0, leaderAnchorOpts);
            const headLen = 10 * arrowScale;
            const forcedDir = tipIsArea ? { enabled: false } : resolveForcedArrowDirection(t, defect, state.rotationAngle || 0);
            const tipCircle = useCircleTip && leaderTipIsCircle(forcedDir);
            const stemInset = tipCircle
                ? 4.5 * arrowScale
                : headLen * Math.cos(Math.PI / 6);
            const leader = forcedDir.enabled
                ? buildForcedLeaderRoute(
                    { x: targetX, y: targetY },
                    boxX,
                    boxY,
                    w,
                    h,
                    scale,
                    arrowScale,
                    forcedDir.octant,
                    stemInset,
                    headLen,
                    state.rotationAngle || 0,
                    leaderAnchorOpts
                )
                : (() => {
                    const ux = targetX - anchor.x;
                    const uy = targetY - anchor.y;
                    // 영역은 화살촉 inset 없이 테두리까지 직선으로 꽂음 (L자 꺾임 없음)
                    const tipBack = tipIsArea ? 0 : stemInset;
                    const stemEnd = tipBack > 0
                        ? getArrowStemEndPoint(targetX, targetY, ux, uy, tipBack)
                        : { x: targetX, y: targetY };
                    return { route: [anchor, stemEnd], ux, uy };
                })();

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(leader.route[0].x, leader.route[0].y);
            for (let i = 1; i < leader.route.length; i++) ctx.lineTo(leader.route[i].x, leader.route[i].y);
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = getDefectLeaderLineWidth(scale, roundLineMul, false);
            ctx.lineCap = 'butt';
            ctx.setLineDash([]);
            ctx.stroke();

            // 영역 마킹은 화살표 머리 없이 테두리에 선만 꽂음
            if (!tipIsArea) {
                ctx.fillStyle = lineColor;
                if (tipCircle) {
                    ctx.beginPath();
                    ctx.arc(targetX, targetY, 4.5 * arrowScale, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    const angle = Math.atan2(leader.uy, leader.ux);
                    const arrowLen = headLen;

                    ctx.beginPath();
                    ctx.moveTo(targetX, targetY);
                    ctx.lineTo(targetX - arrowLen * Math.cos(angle - Math.PI / 6), targetY - arrowLen * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(targetX - arrowLen * Math.cos(angle + Math.PI / 6), targetY - arrowLen * Math.sin(angle + Math.PI / 6));
                    ctx.closePath();
                    ctx.fill();
                }
                if (t.arrowIndex != null && t.arrowIndex >= 0) {
                    drawArrowMapIndexLabel(
                        ctx,
                        t.arrowIndex,
                        targetX,
                        targetY,
                        leader.ux,
                        leader.uy,
                        lineColor,
                        arrowScale,
                        isBeingDragged
                    );
                }
            }
            ctx.restore();
        });

        // Pin Box & Text Label Rendering (Transparent Background + Red/Blue/Orange Border & Text)
        // 도면 회전 상태와 무관하게 박스/글자는 항상 화면 기준 수평으로 보이도록 역회전
        ctx.save();
        ctx.translate(boxX, boxY);
        const boxRot = state.rotationAngle || 0;
        if (boxRot === 90) {
            ctx.rotate((-90 * Math.PI) / 180);
        } else if (boxRot === 180) {
            ctx.rotate((-180 * Math.PI) / 180);
        } else if (boxRot === 270) {
            ctx.rotate((-270 * Math.PI) / 180);
        }

        // fill=false: 투명 내부 + 마킹색 네모 테두리 / fill=true: 기존 채우기
        paintPinBox(ctx, w, h, shapeCfg, activeColor, scale, roundLineMul, isBeingDragged);

        // 마퀴/클릭 선택 강조 (목록 ON/OFF 공통) — 그룹이면 멤버 중 하나만 선택돼도 박스 강조
        if (pinChromeSelected) {
            ctx.save();
            ctx.strokeStyle = '#6b6b6b';
            ctx.lineWidth = Math.max(2, 2.4 * scale);
            ctx.setLineDash([]);
            ctx.strokeRect(-w / 2 - 3 * scale, -h / 2 - 3 * scale, w + 6 * scale, h + 6 * scale);
            ctx.restore();
        }

        drawPinBoxLabel(ctx, pinLabel, getPinBoxTextColor(activeColor, shapeCfg, isBeingDragged), scale, shapeCfg);
        if (defectHasCornerMark(defect)) drawBookmarkChrome(ctx, w, h, scale);
        const cwText = crackWidthBadgeTextFor(defect);
        if (cwText) drawCrackWidthChrome(ctx, w, h, scale, cwText, defectHasCornerMark(defect));
        if (ctx === state.ctx && defectHasPhotoMark(defect)) drawPhotoChrome(ctx, w, h, scale);

        ctx.restore();
    }

