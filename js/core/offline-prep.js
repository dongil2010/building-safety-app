/**
 * 오프라인 준비(2026-10-07) — 한 건물(현장)의 모든 층을 미리 받아 두는 기능의 순수 도우미.
 *
 * 실제 내려받기는 app.js(runOfflinePrep)가 기존 경로를 그대로 쓴다:
 *  - 층 데이터(결함·비파괴): readFloorBundleStrict → mergeFloorBundleIntoState (동기화와 같은 합치기, 읽기만)
 *  - 도면: hydrateFloorDrawingFromCloud → IndexedDB floorDrawings/floorDrawingTiers
 *  - 사진: Storage 주소 → dataURL → IndexedDB photos
 * 여기는 "무엇을 받을지" 고르기·크기 계산·완료 기록(별도 IndexedDB)만 맡는다. 서버에는 아무것도 쓰지 않는다.
 */
(function (root) {
    'use strict';

    const DB_NAME = 'bsa-offline-prep';
    const STORE = 'sites';

    function isHttpUrl(s) {
        return typeof s === 'string' && /^https?:\/\//i.test(s);
    }
    function isDataUrl(s) {
        return typeof s === 'string' && s.indexOf('data:') === 0 && s.length > 32;
    }

    /** dataURL 문자열이 실제로 차지하는 대략의 바이트(base64 → 3/4) */
    function dataUrlBytes(s) {
        if (typeof s !== 'string' || !s) return 0;
        const comma = s.indexOf(',');
        const body = comma >= 0 ? s.length - comma - 1 : s.length;
        return Math.round(body * 0.75);
    }

    function formatBytes(n) {
        const v = Number(n) || 0;
        if (v < 1024) return v + ' B';
        if (v < 1024 * 1024) return (v / 1024).toFixed(0) + ' KB';
        if (v < 1024 * 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB';
        return (v / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    }

    /**
     * 이 건물 결함이 쓰는 사진(현재·이전 회차) 목록. 같은 사진 ID는 한 번만.
     * url: 받을 수 있는 Storage 주소(없으면 null → 사진 문서를 1회 읽어야 함)
     */
    function collectDefectPhotoRefs(defectsMap, bldgId, urlsById, photoCache) {
        const out = new Map();
        const prefix = String(bldgId || '') + '_';
        const urls = urlsById || {};
        const cache = photoCache || {};
        const add = (pid, cand) => {
            if (!pid) return;
            const key = String(pid);
            const prev = out.get(key);
            const pick = [cand, urls[key], cache[key]].find(isHttpUrl) || null;
            if (prev) {
                if (!prev.url && pick) prev.url = pick;
                return;
            }
            out.set(key, { key: key, url: pick, kind: 'defect' });
        };
        Object.keys(defectsMap || {}).forEach((k) => {
            if (!bldgId || k.indexOf(prefix) !== 0) return;
            (defectsMap[k] || []).forEach((d) => {
                if (!d) return;
                (d.photoIds || []).forEach((pid, i) => add(pid, (d.photoUrls || [])[i] || (d.photos || [])[i]));
                (d.prevRoundPhotoIds || []).forEach((pid, i) => add(pid, (d.prevRoundPhotoUrls || [])[i] || (d.prevRoundPhotos || [])[i]));
            });
        });
        return Array.from(out.values());
    }

    /** 층 목록을 합쳐 중복 없이 */
    function uniqueFloorCodes(list) {
        const seen = new Set();
        const out = [];
        (list || []).forEach((c) => {
            if (!c || seen.has(c)) return;
            seen.add(c);
            out.push(c);
        });
        return out;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 없음')); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'buildingId' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function tx(mode, fn) {
        const db = await openDb();
        try {
            return await new Promise((resolve, reject) => {
                const t = db.transaction(STORE, mode);
                const store = t.objectStore(STORE);
                let result;
                const r = fn(store);
                if (r) r.onsuccess = () => { result = r.result; };
                t.oncomplete = () => resolve(result);
                t.onerror = () => reject(t.error);
                t.onabort = () => reject(t.error);
            });
        } finally {
            try { db.close(); } catch (_e) { /* ignore */ }
        }
    }
    function getStatus(buildingId) {
        if (!buildingId) return Promise.resolve(null);
        return tx('readonly', (s) => s.get(String(buildingId))).then((v) => v || null).catch(() => null);
    }
    function putStatus(rec) {
        if (!rec || !rec.buildingId) return Promise.resolve(false);
        return tx('readwrite', (s) => s.put(rec)).then(() => true).catch(() => false);
    }
    function deleteStatus(buildingId) {
        return tx('readwrite', (s) => s.delete(String(buildingId))).then(() => true).catch(() => false);
    }

    /** 완료 기록 요약 한 줄 */
    function describeStatus(rec, fmtTime) {
        if (!rec) return '아직 준비하지 않았습니다.';
        const t = typeof fmtTime === 'function' ? fmtTime(rec.at) : new Date(rec.at).toLocaleString();
        const d = rec.drawings || {};
        const p = rec.photos || {};
        const f = rec.floors || {};
        const done = rec.complete ? '완료' : '일부만 받음';
        return `${done} · ${t} · 층 ${f.ok || 0}/${f.total || 0} · 도면 ${d.ok || 0}/${d.total || 0} · 사진 ${p.ok || 0}/${p.total || 0} · ${formatBytes(rec.bytes)}`;
    }

    const api = {
        DB_NAME: DB_NAME,
        isHttpUrl: isHttpUrl,
        isDataUrl: isDataUrl,
        dataUrlBytes: dataUrlBytes,
        formatBytes: formatBytes,
        collectDefectPhotoRefs: collectDefectPhotoRefs,
        uniqueFloorCodes: uniqueFloorCodes,
        getStatus: getStatus,
        putStatus: putStatus,
        deleteStatus: deleteStatus,
        describeStatus: describeStatus
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.offlinePrep = api;
    }
})(typeof window !== 'undefined' ? window : null);
