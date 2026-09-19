/* ==========================================================================
   스마트 건축물 안전점검 현장점검 시스템 (Clean Architecture Engine v60.0)
   ========================================================================== */

// --- 1. GLOBAL UNIFIED STATE ENGINE ---
if (!window.state) {
    window.state = {
        buildings: [],
        currentBuilding: null,
        currentBuildingId: null,
        currentTab: 'tab-home',
        currentFloor: '1F',
        defects: {}, // { 'bldg-id_1F': [ ...defects ] }
        grids: {},   // { 'bldg-id_1F': { enabled: true, xPrefix: 'X', xCount: 6, yPrefix: 'Y', yCount: 4, xStart: 0.08, xEnd: 0.92, yStart: 0.08, yEnd: 0.92 } } (구버전 백업 호환용, 더 이상 사용 안 함)
        view: { offsetX: 0, offsetY: 0, scale: 1.0 },
        mode: 'PAN', // 'PAN' | 'MARK' | 'AREA'
        rotationAngle: 0,
        tipShape: 'arrow',  // 'arrow' | 'circle'
        areaFillStyle: 'solid',   // 'solid' | 'hatch' | 'none' — 영역 마킹 채우기
        areaBorderStyle: 'solid', // 'solid' | 'dashed' — 영역 마킹 테두리
        areaCreateShape: 'rect',  // 'rect' | 'ellipse' | 'polygon'
        areaInkTool: null,        // null | 'line' | 'rect' | 'polygon' | 'ellipse' | 'path'
        styleColors: null, // 카테고리별 사용자 지정 색상 (미지정 시 DEFAULT_STYLE_COLORS 사용)
        styleSizes: null,  // 카테고리별 사용자 지정 핀/화살표 크기 (미지정 시 DEFAULT_STYLE_SIZES 사용)
        defectLeaderLineScale: 1.0, // 결함위치도: 박스↔화살표 연결선 두께 배율 (박스 테두리 기준)
        floorMapStyleSettings: null, // { 'bldgId_1F': { styleSizes, defectLeaderLineScale } } 층별 핀/화살표/연결선
        floorDrawingRotations: null, // { 'bldgId_1F': 0|90|180|270 } 층별 도면 회전(사용자 지정 포함)
        styleShapes: null, // 카테고리별 사용자 지정 박스 모양/채우기/번호형식 (미지정 시 DEFAULT_STYLE_SHAPES 사용)
        surveyColumns: null, // 상태조사표 컬럼 순서/이름 커스터마이징 (미지정 시 DEFAULT_SURVEY_COLUMNS 사용)
        surveyColumnsGrade3: null, // 제3종시설물용 상태조사표 컬럼 커스터마이징 (미지정 시 GRADE3_SURVEY_COLUMNS 사용)
        locationMapLegend: null, // 결함위치도 범례 항목 커스터마이징 (미지정 시 스타일 설정 색상 기반 기본 범례 사용)
        locationMapLegendBox: null, // {x,y,scale,nx,ny,locked} x/y=도면픽셀, nx/ny=0..1 상대좌표(층·해상도 달라도 위치 유지)
        defectSizeMode: 'combined', // 'combined' | 'split' - 결함크기(균열폭/균열길이) 표시 방식
        bgImage: null,
        /** PDF 도면 4000px 미리보기 좌표계 — 핀·벡터 PDF 출력 기준 (표시 타일과 분리) */
        floorPlanRef: null,
        /** PDF 뷰포트 고해상도 패치 { canvas, x, y, w, h } */
        floorDrawingHiPatch: null,
        canvas: null,
        ctx: null,
        floorSnapshots: {},
        // --- Auth / Company (승인제 로그인) ---
        uid: null,
        userName: null,
        companyId: null,
        companyName: null,
        companyJoinCode: null,
        role: null // 'admin' | 'member' | 'pending' | null
    };
}
window.appState = window.state;

// --- 1B. LOCAL IMAGE STORE (IndexedDB) ---
// localStorage는 브라우저당 보통 5~10MB로 용량이 작아서, 도면 사진·결함 사진(base64)을
// 계속 쌓다 보면 압축을 해도 금방 꽉 찬다 ("저장 공간이 가득 찼습니다" 에러의 원인).
// IndexedDB는 보통 수백MB~수GB까지 쓸 수 있으므로, 무거운 이미지 데이터는 여기로 옮기고
// localStorage에는 가벼운 텍스트 데이터만 남긴다.
const LOCAL_IMAGE_DB_NAME = 'building_safety_local_images';
const LOCAL_IMAGE_DB_VERSION = 5; // v5: ndtImages (NDT 전용 도면)
let _localImageDbPromise = null;

function openLocalImageDb() {
    if (_localImageDbPromise) return _localImageDbPromise;
    _localImageDbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.')); return; }
        const req = indexedDB.open(LOCAL_IMAGE_DB_NAME, LOCAL_IMAGE_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('floorDrawings')) db.createObjectStore('floorDrawings');
            if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
            if (!db.objectStoreNames.contains('floorDrawingPdfs')) db.createObjectStore('floorDrawingPdfs');
            if (!db.objectStoreNames.contains('floorDrawingTiers')) db.createObjectStore('floorDrawingTiers');
            if (!db.objectStoreNames.contains('floorDrawingSources')) db.createObjectStore('floorDrawingSources');
            if (!db.objectStoreNames.contains('ndtImages')) db.createObjectStore('ndtImages');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _localImageDbPromise;
}

async function idbSet(storeName, key, value) {
    try {
        const db = await openLocalImageDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn(`IndexedDB 저장 실패 (${storeName}/${key}):`, e);
        return false;
    }
}

async function idbGet(storeName, key) {
    try {
        const db = await openLocalImageDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn(`IndexedDB 조회 실패 (${storeName}/${key}):`, e);
        return null;
    }
}

async function idbDelete(storeName, key) {
    try {
        const db = await openLocalImageDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn(`IndexedDB 삭제 실패 (${storeName}/${key}):`, e);
        return false;
    }
}

async function idbGetAllKeys(storeName) {
    try {
        const db = await openLocalImageDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAllKeys();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        console.warn(`IndexedDB 키 목록 조회 실패 (${storeName}):`, e);
        return [];
    }
}
window.idbGetAllKeys = idbGetAllKeys;

// --- 2. IMAGE COMPRESSION & FLOOR PARSER HELPERS ---

// 사용자/외부 파일에서 온 문자열을 innerHTML에 넣기 전에 이스케이프 (HTML 인젝션 방지)
function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// pdf.js 워커 경로 설정 (CDN 스크립트가 로드된 경우에만)
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function isPdfFile(file) {
    return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
}

/** 브라우저가 멈추지 않도록 캔버스 픽셀 상한 (~9800²). 초과 시 scale 자동 축소 */
const PDF_RENDER_MAX_PIXELS = 96e6;

// PDF 페이지를 지정 스케일로 캔버스에 렌더링 후 dataURL로 변환
async function renderPdfPageToDataUrl(page, scale, mime = 'image/png', quality = 0.9) {
    let safeScale = Math.max(0.1, Number(scale) || 1);
    let viewport = page.getViewport({ scale: safeScale });
    let w = Math.max(1, Math.round(viewport.width));
    let h = Math.max(1, Math.round(viewport.height));
    const pixels = w * h;
    if (pixels > PDF_RENDER_MAX_PIXELS) {
        safeScale *= Math.sqrt(PDF_RENDER_MAX_PIXELS / pixels);
        viewport = page.getViewport({ scale: safeScale });
        w = Math.max(1, Math.round(viewport.width));
        h = Math.max(1, Math.round(viewport.height));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    if (mime === 'image/jpeg') return canvas.toDataURL('image/jpeg', quality);
    return canvas.toDataURL('image/png');
}

/** PNG/JPEG 등 래스터 도면 빠른 미리보기 (긴 변) */
window.FLOOR_DRAWING_PREVIEW_DIM = 1600;
/** PDF 벡터 도면 기본 좌표계·미리보기 (긴 변) — 핀/패치와 동일 4000px 기준 */
window.FLOOR_DRAWING_PDF_PREVIEW_DIM = 4000;

const _pdfPageCache = new Map();
const _pdfRenderInflight = new Map();
const PDF_PAGE_CACHE_MAX = 8;

function pdfBytesFromDataUrl(pdfDataUrl) {
    if (typeof window.dataUrlToUint8Array === 'function') {
        return window.dataUrlToUint8Array(pdfDataUrl);
    }
    const base64 = String(pdfDataUrl || '').split(',')[1];
    if (!base64) return null;
    const bin = atob(base64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
}

async function acquirePdfPageFromDataUrl(pdfDataUrl, cacheKey) {
    if (cacheKey && _pdfPageCache.has(cacheKey)) {
        return _pdfPageCache.get(cacheKey);
    }
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF 렌더링 라이브러리를 불러오지 못했습니다.');
    }
    const bytes = pdfBytesFromDataUrl(pdfDataUrl);
    if (!bytes) throw new Error('PDF dataURL 변환 실패');
    const pdf = await pdfjsLib.getDocument({ data: bytes, verbosity: 0 }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const entry = { pdf, page, baseViewport };
    if (cacheKey) {
        if (_pdfPageCache.size >= PDF_PAGE_CACHE_MAX) {
            const oldest = _pdfPageCache.keys().next().value;
            _pdfPageCache.delete(oldest);
        }
        _pdfPageCache.set(cacheKey, entry);
    }
    return entry;
}

window.invalidatePdfPageCache = function(cacheKey) {
    if (cacheKey) _pdfPageCache.delete(cacheKey);
    else _pdfPageCache.clear();
};

function withPdfRenderDedupe(key, fn) {
    if (_pdfRenderInflight.has(key)) return _pdfRenderInflight.get(key);
    const job = Promise.resolve().then(fn).finally(() => {
        _pdfRenderInflight.delete(key);
    });
    _pdfRenderInflight.set(key, job);
    return job;
}

/**
 * 캐드(CAD)에서 내보낸 PDF 도면을 pdf.js로 첫 페이지 고해상도 렌더링 (벡터 원본 기반이라 글씨/선이 뭉개지지 않음)
 * Firestore 문서 용량(1MB) 여유를 위해 결과가 너무 크면 스케일을 낮춰 재시도
 */
/** 도면 LOD 해상도 단계 (긴 변 기준 픽셀) — 표시용 3구간 */
window.FLOOR_DRAWING_TIER_DIMS = [4000, 8000, 16000];
window.FLOOR_DRAWING_TIER_LABELS = {
    4000: '일반',
    8000: '고해상도',
    16000: '초고해상도'
};
/** 맞춤 대비 확대 배율 구간 — 일반 / 고해상도 / 초고해상도 */
window.FLOOR_DRAWING_TIER_ZOOM = {
    TO_MID: 2.0,
    TO_HI: 12.0,
    TO_HI_MOBILE: 20.0,
    BACK_LO: 1.6,
    BACK_MID: 10.0,
    BACK_MID_MOBILE: 18.0
};

window.getFloorDrawingBaseTierDim = function() {
    return (window.FLOOR_DRAWING_TIER_DIMS && window.FLOOR_DRAWING_TIER_DIMS[0]) || 4000;
};

window.getFloorDrawingTierLabel = function(dim) {
    const labels = window.FLOOR_DRAWING_TIER_LABELS || {};
    const n = Number(dim);
    return labels[n] || labels[String(dim)] || (n ? `${n}px` : '');
};

/**
 * 확대 구간별 고정 해상도 — 일반(<200%) / 고해상도(200%~) / 초고해상도(PC 1200%+·모바일 2000%+)
 * @param {number} zoomVsFit scale / fitScale (1 = 100%)
 * @param {{ currentTier?: number, mobile?: boolean }} [opts]
 */
window.getFloorDrawingTierDimForZoomVsFit = function(zoomVsFit, opts) {
    const options = opts || {};
    const z = Math.max(Number(zoomVsFit) || 1, 0.05);
    const dims = window.FLOOR_DRAWING_TIER_DIMS || [4000, 8000, 16000];
    const cur = Number(options.currentTier) || dims[0];
    const zoom = window.FLOOR_DRAWING_TIER_ZOOM || {};
    const mobile = !!options.mobile;
    const TO_MID = zoom.TO_MID || 2.0;
    const TO_HI = mobile ? (zoom.TO_HI_MOBILE || 20.0) : (zoom.TO_HI || 12.0);
    const BACK_LO = zoom.BACK_LO || 1.6;
    const BACK_MID = mobile ? (zoom.BACK_MID_MOBILE || 18.0) : (zoom.BACK_MID || 10.0);

    const maxTier = (window.BSA && window.BSA.performance && typeof window.BSA.performance.getMaxFloorTierDim === 'function')
        ? window.BSA.performance.getMaxFloorTierDim()
        : dims[2];
    const capTier = function (dim) {
        const n = Number(dim) || dims[0];
        return n > maxTier ? maxTier : n;
    };

    if (cur >= dims[2]) {
        if (z < BACK_MID) return capTier(dims[1]);
        return capTier(dims[2]);
    }
    if (cur >= dims[1]) {
        if (z >= TO_HI && maxTier >= dims[2]) return capTier(dims[2]);
        if (z < BACK_LO) return capTier(dims[0]);
        return capTier(dims[1]);
    }
    if (z >= TO_MID) return capTier(dims[1]);
    return capTier(dims[0]);
};

/**
 * dataURL 이미지를 긴 변 maxDim 이하로 축소 (이미 작으면 원본 유지)
 */
window.resizeDataUrlToMaxDim = function(dataUrl, maxDim, quality = 0.88) {
    return new Promise((resolve) => {
        if (!dataUrl || !maxDim) return resolve(dataUrl || null);
        const img = new Image();
        img.onload = () => {
            let w = img.width;
            let h = img.height;
            const long = Math.max(w, h);
            if (long <= maxDim) {
                resolve(dataUrl);
                return;
            }
            if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
            } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
};

/**
 * 원본 dataURL에서 4000/8000/16000 티어 세트 생성
 */
window.buildFloorDrawingTiersFromDataUrl = async function(sourceDataUrl) {
    const tiers = {};
    if (!sourceDataUrl) return tiers;
    const quality = { 4000: 0.85, 8000: 0.82, 16000: 0.78 };
    for (const dim of window.FLOOR_DRAWING_TIER_DIMS) {
        tiers[String(dim)] = await window.resizeDataUrlToMaxDim(sourceDataUrl, dim, quality[dim] || 0.85);
    }
    return tiers;
};

function withPdfTierTimeout(promise, ms, label) {
    if (typeof window.withTimeoutMs === 'function') {
        return window.withTimeoutMs(promise, ms, label || 'pdf-tier');
    }
    let timer = 0;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label || 'pdf-tier-timeout')), ms);
    });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * PDF 벡터 → 일반(4000)·고해상도(8000)·초고해상도(16000) JPEG.
 * 8000을 먼저 만들어 UI가 멈추지 않게 하고, 16000은 제한 시간 안에만 시도한다.
 */
window.buildFloorDrawingTiersFromPdf = async function(pdfDataUrl, cacheKey) {
    const tiers = {};
    if (!pdfDataUrl || typeof window.renderPdfDataUrlToImage !== 'function') return tiers;
    const maxBytes = { 4000: 950000, 8000: 2200000, 16000: 3800000 };
    const quality = { 4000: 0.85, 8000: 0.82, 16000: 0.78 };
    const renderAt = async (dim) => window.renderPdfDataUrlToImage(
        pdfDataUrl,
        dim,
        maxBytes[dim] || 2500000,
        cacheKey,
        { forceJpeg: true, quality: quality[dim] || 0.82 }
    );

    let mid = null;
    try {
        mid = await withPdfTierTimeout(renderAt(8000), 45000, 'pdf-render-8000');
    } catch (e) {
        console.warn('PDF 고해상도(8000) 렌더 실패/타임아웃:', e);
        mid = null;
    }
    if (!mid) {
        try {
            mid = await withPdfTierTimeout(renderAt(4000), 30000, 'pdf-render-4000');
        } catch (e) {
            console.warn('PDF 일반(4000) 렌더 실패/타임아웃:', e);
            return tiers;
        }
    }
    if (!mid) return tiers;

    if (typeof window.resizeDataUrlToMaxDim === 'function') {
        tiers['8000'] = await window.resizeDataUrlToMaxDim(mid, 8000, quality[8000]);
        tiers['4000'] = await window.resizeDataUrlToMaxDim(mid, 4000, quality[4000]);
    } else {
        tiers['8000'] = mid;
        tiers['4000'] = mid;
    }

    let hi = null;
    try {
        hi = await withPdfTierTimeout(renderAt(16000), 35000, 'pdf-render-16000');
    } catch (e) {
        console.warn('PDF 초고해상도(16000) 렌더 스킵(타임아웃/실패):', e);
    }
    if (hi && typeof window.resizeDataUrlToMaxDim === 'function') {
        tiers['16000'] = await window.resizeDataUrlToMaxDim(hi, 16000, quality[16000]);
    } else if (hi) {
        tiers['16000'] = hi;
    } else {
        // 초고해상도 실패 시에도 LOD 키가 비지 않게 고해상도로 채움 (추후 재생성 가능)
        tiers['16000'] = tiers['8000'];
    }
    return tiers;
};

/** PDF dataURL → 지정 해상도 PNG/JPEG (업로드 후 줌 LOD용). cacheKey = bldgId_floorCode */
/** PDF dataURL → 4000px 기준 ref 좌표 크기 (뷰포트 패치·핀 좌표계) */
window.getPdfRefPixelSize = async function(pdfDataUrl, targetLongSide = 4000, cacheKey) {
    const { baseViewport } = await acquirePdfPageFromDataUrl(pdfDataUrl, cacheKey);
    const long = Math.max(baseViewport.width, baseViewport.height, 1);
    const scale = targetLongSide / long;
    return {
        w: Math.max(1, Math.round(baseViewport.width * scale)),
        h: Math.max(1, Math.round(baseViewport.height * scale)),
    };
};

window.renderPdfDataUrlToImage = function(pdfDataUrl, targetLongSide = 16000, maxDataUrlBytes = 2500000, cacheKey, opts) {
    const options = opts || {};
    const quality = Number(options.quality) > 0 ? Number(options.quality) : 0.85;
    const mime = (options.forceJpeg === false) ? 'image/png' : 'image/jpeg';
    const dedupeKey = `img|${cacheKey || 'anon'}|${targetLongSide}|${mime}`;
    return withPdfRenderDedupe(dedupeKey, async () => {
        const { page, baseViewport } = await acquirePdfPageFromDataUrl(pdfDataUrl, cacheKey);
        let scale = targetLongSide / Math.max(baseViewport.width, baseViewport.height);
        scale = Math.min(Math.max(scale, 1), 16);
        let dataUrl = await renderPdfPageToDataUrl(page, scale, mime, quality);
        let attempts = 0;
        while (dataUrl && dataUrl.length > maxDataUrlBytes && attempts < 4) {
            scale *= 0.75;
            dataUrl = await renderPdfPageToDataUrl(page, scale, mime, Math.max(0.7, quality - 0.05));
            attempts++;
        }
        return dataUrl;
    });
};

/**
 * PDF dataURL → ref 좌표계(region)만 고해상도로 렌더 (뷰포트 타일용)
 * @param {{x:number,y:number,w:number,h:number}} region ref 이미지 픽셀 영역
 * @returns {Promise<HTMLCanvasElement|null>}
 */
window.renderPdfDataUrlRegion = function(pdfDataUrl, refW, refH, region, outW, outH, cacheKey) {
    const rx = Math.max(0, Number(region?.x) || 0);
    const ry = Math.max(0, Number(region?.y) || 0);
    const rw = Math.max(1, Number(region?.w) || 1);
    const rh = Math.max(1, Number(region?.h) || 1);
    const targetW = Math.max(1, Math.round(outW || rw));
    const targetH = Math.max(1, Math.round(outH || rh));
    const dedupeKey = `reg|${cacheKey || 'anon'}|${targetW}x${targetH}|${Math.round(rx)}_${Math.round(ry)}`;
    return withPdfRenderDedupe(dedupeKey, async () => {
        const { page, baseViewport } = await acquirePdfPageFromDataUrl(pdfDataUrl, cacheKey);
        const sx = Math.max(Number(refW) || 1, 1) / Math.max(baseViewport.width, 1);
        const sy = Math.max(Number(refH) || 1, 1) / Math.max(baseViewport.height, 1);
        const pdfX = rx / sx;
        const pdfY = ry / sy;
        const pdfW = rw / sx;
        const renderScale = targetW / Math.max(pdfW, 0.001);
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        await page.render({
            canvasContext: ctx,
            viewport,
            transform: [1, 0, 0, 1, -pdfX * renderScale, -pdfY * renderScale]
        }).promise;
        return canvas;
    });
};

/**
 * 줌·뷰포트 기준 필요한 도면 티어 선택 — 최소~최대 확대 구간 3등분
 */
window.pickFloorDrawingTierDim = function(viewScale, cssW, cssH, dpr, currentTier, refLongSide, fitScale, zoomRange) {
    const fit = Math.max(Number(fitScale) || 0.05, 0.05);
    const zoomVsFit = Math.max(Number(viewScale) || 1, 0.001) / fit;
    if (typeof window.getFloorDrawingTierDimForZoomVsFit === 'function') {
        return window.getFloorDrawingTierDimForZoomVsFit(zoomVsFit, {
            currentTier: currentTier
        });
    }
    return window.FLOOR_DRAWING_TIER_DIMS[0] || 4000;
};

window.renderPdfFileToImage = function(file, targetLongSide = 4200, maxDataUrlBytes = 950000) {
    return new Promise((resolve, reject) => {
        if (typeof pdfjsLib === 'undefined') {
            reject(new Error('PDF 렌더링 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
                const page = await pdf.getPage(1);
                const baseViewport = page.getViewport({ scale: 1 });
                let scale = targetLongSide / Math.max(baseViewport.width, baseViewport.height);
                scale = Math.min(Math.max(scale, 1), 8); // 너무 작은 PDF는 과도확대, 너무 큰 PDF는 과도축소 방지

                let dataUrl = await renderPdfPageToDataUrl(page, scale);
                let attempts = 0;
                while (dataUrl && dataUrl.length > maxDataUrlBytes && attempts < 4) {
                    scale *= 0.75;
                    dataUrl = await renderPdfPageToDataUrl(page, scale);
                    attempts++;
                }
                resolve(dataUrl);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('PDF 파일을 읽는 중 오류가 발생했습니다.'));
        reader.readAsArrayBuffer(file);
    });
};

/**
 * HTML5 Canvas Image Compressor
 * Reduces 4K/8K drawing photos (5~20MB) to lightweight JPEG (~150KB)
 * PDF 파일이 들어오면 pdf.js로 고해상도 렌더링 (renderPdfFileToImage) 후 PNG로 반환
 */
window.compressDrawingImage = function(file, maxDim = 2200, quality = 0.88) {
    return new Promise((resolve) => {
        if (!file || !(file instanceof Blob)) {
            return resolve(null);
        }
        if (isPdfFile(file)) {
            window.renderPdfFileToImage(file)
                .then(resolve)
                .catch((err) => {
                    console.error('PDF 도면 렌더링 오류:', err);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`'${file.name}' PDF 렌더링에 실패했습니다: ${err.message}`, 'error', 5000);
                    }
                    resolve(null);
                });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width;
                let h = img.height;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
};

/**
 * 현장 사진 저장 규격 — 4:3 크롭 후 장축(가로) 2000px
 */
window.BSA_PHOTO_LONG_EDGE = 2000;
window.BSA_PHOTO_JPEG_QUALITY = 0.85;
window.getPhotoLongEdge = function () {
    const n = Number(window.BSA_PHOTO_LONG_EDGE);
    return (n > 0) ? n : 2000;
};
window.getPhotoJpegQuality = function () {
    const n = Number(window.BSA_PHOTO_JPEG_QUALITY);
    return (n > 0 && n <= 1) ? n : 0.85;
};

/**
 * Defect Photo Compressor with 4:3 Aspect Ratio Crop
 * Crops and resizes defect photos to 4:3 (기본 2000x1500) without distortion
 */
window.compressDefectPhoto43 = function(file, targetW, quality) {
    const longEdge = (Number(targetW) > 0) ? Number(targetW) : window.getPhotoLongEdge();
    const q = (Number(quality) > 0 && Number(quality) <= 1) ? Number(quality) : window.getPhotoJpegQuality();
    return new Promise((resolve) => {
        if (!file || !(file instanceof Blob)) {
            return resolve(null);
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const imgW = img.width;
                const imgH = img.height;
                const outW = longEdge;
                const outH = Math.round((outW * 3) / 4);

                let cropX = 0;
                let cropY = 0;
                let cropW = imgW;
                let cropH = imgH;

                if (imgW / imgH > 4 / 3) {
                    cropW = Math.round(imgH * (4 / 3));
                    cropX = Math.round((imgW - cropW) / 2);
                } else {
                    cropH = Math.round(imgW * (3 / 4));
                    cropY = Math.round((imgH - cropH) / 2);
                }

                const canvas = document.createElement('canvas');
                canvas.width = outW;
                canvas.height = outH;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
                resolve(canvas.toDataURL('image/jpeg', q));
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
};

// 건축물 외부: 한 도면에 정·배 또는 좌·우가 같이 들어갈 수 있어 기본은 외부1·외부2(EXT_1·EXT_2)로 붙인다.
// 파일명에 방향이 하나만 뚜렷하면 EXT_FRONT 등도 인식한다(직접 선택도 가능).
// getFloorLabelFromCode/getFloorRankFromCode/parseFloorInfoFromFilename이 공통으로 사용.
window.EXT_DIRECTION_DEFS = [
    // 입면도 2·4·6장: 정면/배면/좌·우 + 방위. 상태조사표는 합치고 위치에 shortLabel 사용
    { code: 'EXT_FRONT', label: '건축물 외부-정면 (EXT_FRONT)', shortLabel: '정면', strongKeys: ['정면', 'FRONT'], soloChar: null },
    { code: 'EXT_BACK', label: '건축물 외부-배면 (EXT_BACK)', shortLabel: '배면', strongKeys: ['배면', '후면', 'BACK', 'REAR'], soloChar: null },
    { code: 'EXT_LEFT', label: '건축물 외부-좌측면 (EXT_LEFT)', shortLabel: '좌측면', strongKeys: ['좌측면', '좌측', 'LEFTSIDE', 'LEFT_ELEV', 'LEFT'], soloChar: null },
    { code: 'EXT_RIGHT', label: '건축물 외부-우측면 (EXT_RIGHT)', shortLabel: '우측면', strongKeys: ['우측면', '우측', 'RIGHTSIDE', 'RIGHT_ELEV', 'RIGHT'], soloChar: null },
    { code: 'EXT_N', label: '건축물 외부-북측 (EXT_N)', shortLabel: '북측', strongKeys: ['북측', '북면', '북쪽', 'NORTH'], soloChar: '북' },
    { code: 'EXT_E', label: '건축물 외부-동측 (EXT_E)', shortLabel: '동측', strongKeys: ['동측', '동면', '동쪽', 'EAST'], soloChar: '동' },
    { code: 'EXT_S', label: '건축물 외부-남측 (EXT_S)', shortLabel: '남측', strongKeys: ['남측', '남면', '남쪽', 'SOUTH'], soloChar: '남' },
    { code: 'EXT_W', label: '건축물 외부-서측 (EXT_W)', shortLabel: '서측', strongKeys: ['서측', '서면', '서쪽', 'WEST'], soloChar: '서' }
];

window.isExteriorFloorCode = function(code) {
    const c = String(code || '').toUpperCase().trim();
    const raw = String(code || '');
    return c === 'EXT' || c.startsWith('EXT_') || raw.includes('외부') || raw.includes('입면');
};

window.getExteriorElevationShortLabel = function(code) {
    const c = String(code || '').toUpperCase().trim();
    const defs = window.EXT_DIRECTION_DEFS || [];
    const hit = defs.find((d) => d.code === c);
    if (hit) return hit.shortLabel || String(hit.label || '').replace(/^건축물 외부-/, '').replace(/\s*\(.*\)$/, '');
    if (c === 'EXT') return '';
    return '';
};

// 옥상 / 옥탑 / 옥탑 지붕 — 파일명이 다르면 서로 다른 층으로 인식 (같은 ROOF로 합치지 않음)
window.ROOF_FLOOR_DEFS = [
    { code: 'PH_ROOF', label: '옥탑 지붕층 (PH_ROOF)', rank: 9992 },
    { code: 'PH', label: '옥탑층 (PH)', rank: 9991 },
    { code: 'ROOF', label: '옥상층 (ROOF)', rank: 9990 }
];

window.resolveRoofFloorFromText = function(rawText) {
    const raw = String(rawText || '');
    const c = raw.toUpperCase().trim();
    // 1) 가장 구체적: 옥탑 지붕층
    if (
        c === 'PH_ROOF' ||
        c.includes('PH_ROOF') ||
        (raw.includes('옥탑') && raw.includes('지붕')) ||
        raw.includes('옥탑지붕') ||
        /PH[\s_-]*ROOF|ROOF[\s_-]*PH/.test(c)
    ) {
        return window.ROOF_FLOOR_DEFS[0];
    }
    // 2) 옥탑층 (옥상과 분리)
    if (
        c === 'PH' ||
        raw.includes('옥탑') ||
        c.includes('PENTHOUSE') ||
        /(^|[^A-Z0-9])PH([^A-Z0-9]|$)/.test(c)
    ) {
        return window.ROOF_FLOOR_DEFS[1];
    }
    // 3) 옥상층
    if (c === 'ROOF' || raw.includes('옥상') || c.includes('ROOF')) {
        return window.ROOF_FLOOR_DEFS[2];
    }
    return null;
};

/**
 * Intelligent Floor Parser from File Names (e.g. B2.jpg -> 지하 2층)
 */
window.parseFloorInfoFromFilename = function(fileName) {
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    const cleanName = nameWithoutExt.toUpperCase();

    // 옥상층 / 옥탑층 / 옥탑 지붕층은 파일명에 따라 각각 다른 층으로 인식
    const roofInfo = window.resolveRoofFloorFromText(nameWithoutExt);
    if (roofInfo) {
        return { rank: roofInfo.rank, floorCode: roofInfo.code, floorLabel: roofInfo.label, matched: true };
    }

    if (cleanName.includes('외부') || cleanName.includes('외벽') || cleanName.includes('파사드') || cleanName.includes('입면') || cleanName.includes('FACADE') || cleanName.includes('ELEVATION') || cleanName.includes('EXTERIOR')) {
        // 외부1 / EXT_1 / 외부 2 등 번호가 있으면 그 번호로
        const fi = window.BSA && window.BSA.floorIdentity;
        const serialN = (fi && typeof fi.parseExteriorSerialNumber === 'function')
            ? fi.parseExteriorSerialNumber(nameWithoutExt)
            : (function () {
                const m = nameWithoutExt.match(/외부\s*[_\-]?\s*(\d{1,2})(?!\d)/)
                    || cleanName.match(/(?:^|[^A-Z0-9])EXT[_\s\-]*([0-9]{1,2})(?![A-Z0-9])/);
                return m ? parseInt(m[1], 10) : null;
            })();
        if (serialN >= 1 && serialN <= 99) {
            return {
                rank: 10000 + serialN,
                floorCode: 'EXT_' + serialN,
                floorLabel: '외부' + serialN,
                matched: true
            };
        }

        // 방향 키워드가 몇 개인지 센다. 정면+배면처럼 2개 이상이면 한 도면에 입면이 같이 들어간 것으로 보고
        // 정배좌우 전용 코드로 쪼개지 않고 외부1·2 일련번호로 넘긴다.
        const dirHits = [];
        for (let i = 0; i < window.EXT_DIRECTION_DEFS.length; i++) {
            const d = window.EXT_DIRECTION_DEFS[i];
            if (d.strongKeys.some(k => cleanName.includes(String(k).toUpperCase()) || nameWithoutExt.includes(k))) {
                dirHits.push(d);
            }
        }
        if (dirHits.length === 0) {
            for (let i = 0; i < window.EXT_DIRECTION_DEFS.length; i++) {
                const d = window.EXT_DIRECTION_DEFS[i];
                if (d.soloChar && cleanName.includes(d.soloChar)) dirHits.push(d);
            }
        }
        if (dirHits.length === 1) {
            const d = dirHits[0];
            return { rank: 1001 + window.EXT_DIRECTION_DEFS.indexOf(d), floorCode: d.code, floorLabel: d.label, matched: true };
        }
        // 방향 없음 또는 여러 방향(정·배 / 좌·우 한 장) → 업로드 쪽에서 EXT_1, EXT_2… 부여
        return { rank: 1000, floorCode: 'EXT_SERIAL', floorLabel: '외부', matched: false, exteriorSerial: true };
    }

    const parkingCustom = (window.BSA && window.BSA.floorIdentity
        && typeof window.BSA.floorIdentity.parseCustomStemFromFilename === 'function')
        ? window.BSA.floorIdentity.parseCustomStemFromFilename(nameWithoutExt)
        : null;
    if (parkingCustom && /주차/.test(nameWithoutExt)) {
        return parkingCustom;
    }

    const basementNum = (window.BSA && window.BSA.floorIdentity
        && typeof window.BSA.floorIdentity.parseBasementNumber === 'function')
        ? window.BSA.floorIdentity.parseBasementNumber(nameWithoutExt)
        : null;
    if (basementNum) {
        return { rank: -basementNum, floorCode: `B${basementNum}F`, floorLabel: `지하 ${basementNum}층 (B${basementNum}F)`, matched: true };
    }

    const bMatch = cleanName.match(/(?:^|[^A-Z0-9])B[\s_-]*([0-9]{1,2})\s*F?(?:[^0-9]|$)/);
    if (bMatch && !/주차/.test(nameWithoutExt)) {
        const num = parseInt(bMatch[1], 10);
        if (num > 0 && num <= 99) {
            return { rank: -num, floorCode: `B${num}F`, floorLabel: `지하 ${num}층 (B${num}F)`, matched: true };
        }
    }
    const basementLabel = nameWithoutExt.match(/지하\s*([0-9]{1,2})\s*층/);
    if (basementLabel && !/주차/.test(nameWithoutExt)) {
        const num = parseInt(basementLabel[1], 10);
        if (num > 0 && num <= 99) {
            return { rank: -num, floorCode: `B${num}F`, floorLabel: `지하 ${num}층 (B${num}F)`, matched: true };
        }
    }

    // F/층/지상 접두·접미가 붙은 명확한 패턴만 "신뢰 가능한 인식"으로 처리
    const strongFMatch = cleanName.match(/(?:F|층|지상)\s*([0-9]{1,2})(?![0-9])/i) ||
                          cleanName.match(/([0-9]{1,2})\s*(?:F|층)(?![0-9])/i);
    if (strongFMatch) {
        const num = parseInt(strongFMatch[1], 10);
        if (num > 0 && num <= 99) {
            return { rank: num, floorCode: `${num}F`, floorLabel: `지상 ${num}층 (${num}F)`, matched: true };
        }
    }

    // 숫자를 1F·2F로 추정하지 않는다. IMG_001 / 도면.jpg 가 기존 1F를 덮어쓰기 때문.
    // 인식 실패는 파일 이름 그대로 새 층(커스텀)으로 두고, 업로드 쪽에서 고유화한다.
    if (window.BSA && window.BSA.floorIdentity
        && typeof window.BSA.floorIdentity.unmatchedFloorFromFilename === 'function') {
        return window.BSA.floorIdentity.unmatchedFloorFromFilename(nameWithoutExt);
    }
    const stem = (nameWithoutExt || '').trim() || '도면';
    return { rank: 0, floorCode: stem, floorLabel: stem, matched: false };
};

// 층 코드 수동 선택용 옵션 목록 (지하10층 ~ 지상30층 + 옥상/옥탑 + 건축물 외부)
window.FLOOR_CODE_OPTION_LIST = (function() {
    const list = [];
    for (let i = 10; i >= 1; i--) list.push(`B${i}F`);
    for (let i = 1; i <= 30; i++) list.push(`${i}F`);
    list.push('ROOF');
    list.push('PH');
    list.push('PH_ROOF');
    list.push('EXT');
    for (let i = 1; i <= 12; i++) list.push('EXT_' + i);
    window.EXT_DIRECTION_DEFS.forEach(d => list.push(d.code));
    return list;
})();

window.getFloorRankFromCode = function(code) {
    if (window.BSA && window.BSA.floorIdentity && typeof window.BSA.floorIdentity.rankFromCode === 'function') {
        return window.BSA.floorIdentity.rankFromCode(code);
    }
    if (!code) return 0;
    const raw = String(code).trim();
    const c = raw.toUpperCase();
    const extSerialRank = c.match(/^EXT_(\d+)$/) || raw.match(/^외부\s*(\d+)$/);
    if (extSerialRank) return 10000 + parseInt(extSerialRank[1], 10);
    if (c.includes('EXT') || raw.includes('외부')) return 10000;
    const roofInfo = window.resolveRoofFloorFromText(raw);
    if (roofInfo) return roofInfo.rank;
    const bMatch = c.match(/^B[\s_-]*([0-9]+)\s*F?$/) || raw.match(/^지하\s*([0-9]+)\s*층?$/);
    if (bMatch) return -parseInt(bMatch[1], 10);
    const fMatch = c.match(/^([0-9]+)\s*F$/);
    if (fMatch) return parseInt(fMatch[1], 10);
    return 0;
};

window.buildFloorCodeOptionsHtml = function(selectedCode) {
    // 선택된 층이 정해진 목록(B10F~30F, ROOF, EXT)에 없는 사용자 직접입력 값이면,
    // 그 값도 목록에 끼워넣어 계속 선택된 상태로 보이게 한다 (필로티/기계실/중2층 등 자유 이름)
    const isCustomSelected = selectedCode && !window.FLOOR_CODE_OPTION_LIST.includes(selectedCode);
    let html = window.FLOOR_CODE_OPTION_LIST.map(code => {
        const label = (typeof window.getFloorLabelFromCode === 'function') ? window.getFloorLabelFromCode(code) : code;
        const sel = code === selectedCode ? 'selected' : '';
        return `<option value="${code}" ${sel}>${label}</option>`;
    }).join('');
    if (isCustomSelected) {
        html += `<option value="${selectedCode}" selected>✏️ ${selectedCode} (직접 입력함)</option>`;
    }
    html += `<option value="__CUSTOM_FLOOR__">➕ [층 이름 직접 입력...]</option>`;
    return html;
};

window.selectedUploadedDrawings = [];
window.selectedEditUploadedDrawings = [];

