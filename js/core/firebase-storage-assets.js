/**
 * Firebase Storage helpers — 도면/PDF/티어/사진 파일 본문을 Firestore 대신 Storage에 둔다.
 * 경로: companies/{companyId}/{현장}/{회차}/{assetType}/{file}
 * Firestore 문서에는 URL/메타만 저장.
 */
(function (root) {
    'use strict';

    const USE_FIREBASE_STORAGE_FOR_DRAWINGS = true;
    const USE_FIREBASE_STORAGE_FOR_PHOTOS = true;
    const COMPANY_ASSET_TYPES = {
        floorDrawings: 'floorDrawings',
        floorDrawingPdfs: 'floorDrawingPdfs',
        floorDrawingTiers: 'floorDrawingTiers',
        photos: 'photos'
    };

    function sanitizeStoragePathSegment(value, fallback) {
        let s = String(value == null ? '' : value).trim();
        s = s.replace(/^🏢\s*/, '');
        s = s.replace(/[\\/]/g, '_');
        s = s.replace(/[#?[\]*]/g, '_');
        s = s.replace(/\s+/g, '_');
        s = s.replace(/\.\.+/g, '.');
        s = s.replace(/_+/g, '_');
        s = s.replace(/^_+|_+$/g, '');
        s = s.slice(0, 180);
        return s || fallback || 'unnamed';
    }

    function storageScopeSegments(scope) {
        const site = sanitizeStoragePathSegment(
            scope && (scope.site || scope.siteName),
            'unnamed-site'
        );
        const round = sanitizeStoragePathSegment(
            scope && (scope.round || scope.roundKey),
            'unnamed-round'
        );
        return site + '/' + round;
    }

    function companyScopedAssetPath(companyId, assetType, fileBase, ext, scope) {
        return 'companies/'
            + sanitizeStoragePathSegment(companyId)
            + '/' + storageScopeSegments(scope)
            + '/' + sanitizeStoragePathSegment(assetType, 'files')
            + '/' + withExt(fileBase, ext);
    }

    function guessExtFromContentType(contentType, fallback) {
        const t = String(contentType || '').toLowerCase();
        if (t.indexOf('pdf') !== -1) return 'pdf';
        if (t.indexOf('png') !== -1) return 'png';
        if (t.indexOf('webp') !== -1) return 'webp';
        if (t.indexOf('jpeg') !== -1 || t.indexOf('jpg') !== -1) return 'jpg';
        if (t.indexOf('heic') !== -1) return 'heic';
        if (t.indexOf('heif') !== -1) return 'heif';
        return fallback || 'bin';
    }

    function withExt(base, ext) {
        const e = String(ext || '').replace(/^\./, '');
        if (!e) return base;
        return base + '.' + e;
    }

    function isSiteRoundScopedStoragePath(storagePath) {
        const parts = String(storagePath || '').replace(/^\/+/, '').split('/').filter(Boolean);
        if (parts.length < 6) return false;
        if (parts[0] !== 'companies') return false;
        return parts[4] === 'floorDrawings'
            || parts[4] === 'floorDrawingPdfs'
            || parts[4] === 'floorDrawingTiers'
            || parts[4] === 'photos';
    }

    function storagePathFromSnapData(data) {
        if (!data || typeof data !== 'object') return null;
        if (typeof data.storagePath === 'string' && data.storagePath.length > 0) {
            return data.storagePath;
        }
        if (data.downloadURL) return storagePathFromDownloadURL(data.downloadURL);
        return null;
    }

    function snapNeedsSiteRoundMove(data) {
        const path = storagePathFromSnapData(data);
        if (path) return !isSiteRoundScopedStoragePath(path);
        return false;
    }

    function storagePathFloorDrawing(companyId, buildingId, floorCode, contentType, scope) {
        const ext = guessExtFromContentType(contentType, 'jpg');
        return companyScopedAssetPath(
            companyId,
            'floorDrawings',
            sanitizeStoragePathSegment(buildingId) + '_' + sanitizeStoragePathSegment(floorCode),
            ext,
            scope
        );
    }

    function storagePathFloorDrawingPdf(companyId, buildingId, floorCode, scope) {
        return companyScopedAssetPath(
            companyId,
            'floorDrawingPdfs',
            sanitizeStoragePathSegment(buildingId) + '_' + sanitizeStoragePathSegment(floorCode),
            'pdf',
            scope
        );
    }

    function storagePathFloorDrawingTier(companyId, buildingId, floorCode, dim, contentType, scope) {
        const ext = guessExtFromContentType(contentType, 'jpg');
        return companyScopedAssetPath(
            companyId,
            'floorDrawingTiers',
            sanitizeStoragePathSegment(buildingId)
                + '_' + sanitizeStoragePathSegment(floorCode)
                + '_' + sanitizeStoragePathSegment(dim, '4000'),
            ext,
            scope
        );
    }

    function storagePathPhoto(companyId, photoId, contentType, scope) {
        const ext = guessExtFromContentType(contentType, 'jpg');
        return companyScopedAssetPath(
            companyId,
            'photos',
            sanitizeStoragePathSegment(photoId),
            ext,
            scope
        );
    }

    function parseDataUrl(dataUrl) {
        if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return null;
        const comma = dataUrl.indexOf(',');
        if (comma < 5) return null;
        const header = dataUrl.slice(5, comma);
        const payload = dataUrl.slice(comma + 1);
        const headerParts = header.split(';');
        const contentType = (headerParts[0] || '').trim() || 'application/octet-stream';
        const isBase64 = headerParts.some(function (p) {
            return String(p).trim().toLowerCase() === 'base64';
        });
        let bytes;
        try {
            if (isBase64) {
                const bin = atob(payload);
                bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            } else {
                const decoded = decodeURIComponent(payload);
                bytes = new Uint8Array(decoded.length);
                for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
            }
        } catch (e) {
            return null;
        }
        const blob = new Blob([bytes], { type: contentType });
        return { contentType: blob.type || contentType, blob: blob, size: blob.size, bytes: bytes };
    }

    function isFirebaseStorageHttpUrl(url) {
        if (typeof url !== 'string' || url.length < 12) return false;
        return /firebasestorage\.googleapis\.com/i.test(url)
            || /\.firebasestorage\.app/i.test(url);
    }

    function storagePathFromDownloadURL(url) {
        if (!isFirebaseStorageHttpUrl(url)) return null;
        try {
            const u = new URL(url);
            const marker = '/o/';
            const idx = u.pathname.indexOf(marker);
            if (idx < 0) return null;
            const encoded = u.pathname.slice(idx + marker.length);
            if (!encoded) return null;
            return decodeURIComponent(encoded);
        } catch (e) {
            return null;
        }
    }

    function hasFirebaseStorageMeta(data) {
        if (!data || typeof data !== 'object') return false;
        if (data.backend === 'storage') return true;
        if (typeof data.storagePath === 'string' && data.storagePath.length > 0) return true;
        if (typeof data.downloadURL === 'string' && /^https?:\/\//i.test(data.downloadURL)) return true;
        return false;
    }

    function firestoreStorageMetaFields(uploaded) {
        const u = uploaded || {};
        return {
            backend: 'storage',
            storagePath: u.storagePath || null,
            downloadURL: u.downloadURL || u.url || null,
            contentType: u.contentType || null,
            size: (typeof u.size === 'number' && isFinite(u.size)) ? u.size : null,
            chunked: false,
            chunkCount: 0,
            writeId: null,
            chunkStatus: 'ready'
        };
    }

    function getFirebaseStorage() {
        try {
            if (typeof firebase === 'undefined' || !firebase.storage) return null;
            if (!firebase.apps || !firebase.apps.length) return null;
            return firebase.storage();
        } catch (e) {
            console.warn('getFirebaseStorage 실패:', e);
            return null;
        }
    }

    async function uploadBlobToFirebaseStorage(storagePath, blob, contentType) {
        const storage = getFirebaseStorage();
        if (!storage) throw new Error('Firebase Storage unavailable');
        if (!storagePath || !blob) throw new Error('missing storagePath or blob');
        const path = String(storagePath).replace(/^\/+/, '');
        const ref = storage.ref().child(path);
        const type = contentType || blob.type || 'application/octet-stream';
        const snap = await ref.put(blob, {
            contentType: type,
            cacheControl: 'public, max-age=31536000'
        });
        const downloadURL = await ref.getDownloadURL();
        const size = (typeof blob.size === 'number')
            ? blob.size
            : (snap && snap.totalBytes) || null;
        return {
            storagePath: path,
            downloadURL: downloadURL,
            contentType: (snap && snap.metadata && snap.metadata.contentType) || type,
            size: size
        };
    }

    async function deleteFirebaseStoragePath(storagePath) {
        if (!storagePath) return true;
        const storage = getFirebaseStorage();
        if (!storage) return false;
        try {
            await storage.ref().child(String(storagePath).replace(/^\/+/, '')).delete();
            return true;
        } catch (e) {
            const code = e && e.code;
            if (code === 'storage/object-not-found') return true;
            console.warn('Storage 객체 삭제 실패:', storagePath, e);
            return false;
        }
    }

    async function resolveCloudAssetUrlFromSnapData(snapData) {
        if (!snapData || typeof snapData !== 'object') return null;
        const direct = snapData.downloadURL || snapData.url;
        if (typeof direct === 'string' && /^https?:\/\//i.test(direct) && direct.length > 8) {
            return direct;
        }
        const path = snapData.storagePath;
        if (typeof path === 'string' && path.length > 0) {
            const storage = getFirebaseStorage();
            if (!storage) return null;
            try {
                return await storage.ref().child(String(path).replace(/^\/+/, '')).getDownloadURL();
            } catch (e) {
                console.warn('Storage getDownloadURL 실패:', path, e);
                return null;
            }
        }
        return null;
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('blobToDataUrl failed')); };
            reader.readAsDataURL(blob);
        });
    }

    async function fetchUrlAsDataUrl(url, fallbackType) {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('asset fetch HTTP ' + res.status);
        let blob = await res.blob();
        const type = blob.type || fallbackType || 'application/octet-stream';
        if (fallbackType && (!blob.type || blob.type === 'application/octet-stream')) {
            blob = new Blob([blob], { type: fallbackType });
        } else if (type && blob.type !== type) {
            blob = new Blob([blob], { type: type });
        }
        return blobToDataUrl(blob);
    }

    async function materializeCloudAssetPayload(url, snapData) {
        if (!url || typeof url !== 'string') return null;
        if (url.indexOf('data:') === 0) return url;
        const ctype = String((snapData && snapData.contentType) || '');
        try {
            return await fetchUrlAsDataUrl(url, ctype || undefined);
        } catch (e) {
            console.warn('클라우드 파일 본문 받기 실패, URL 유지:', url.slice(0, 80), e);
            return url;
        }
    }

    async function assetUrlToUploadBlob(url) {
        const parsed = parseDataUrl(url);
        if (parsed) return parsed;
        if (typeof url !== 'string') return null;
        if (url.indexOf('blob:') === 0 || /^https?:\/\//i.test(url)) {
            const res = await fetch(url);
            if (!res.ok) throw new Error('asset fetch HTTP ' + res.status);
            const blob = await res.blob();
            return {
                contentType: blob.type || 'application/octet-stream',
                blob: blob,
                size: blob.size
            };
        }
        return null;
    }

    const api = {
        USE_FIREBASE_STORAGE_FOR_DRAWINGS: USE_FIREBASE_STORAGE_FOR_DRAWINGS,
        USE_FIREBASE_STORAGE_FOR_PHOTOS: USE_FIREBASE_STORAGE_FOR_PHOTOS,
        COMPANY_ASSET_TYPES: COMPANY_ASSET_TYPES,
        sanitizeStoragePathSegment: sanitizeStoragePathSegment,
        storageScopeSegments: storageScopeSegments,
        companyScopedAssetPath: companyScopedAssetPath,
        guessExtFromContentType: guessExtFromContentType,
        storagePathFloorDrawing: storagePathFloorDrawing,
        storagePathFloorDrawingPdf: storagePathFloorDrawingPdf,
        storagePathFloorDrawingTier: storagePathFloorDrawingTier,
        storagePathPhoto: storagePathPhoto,
        parseDataUrl: parseDataUrl,
        isFirebaseStorageHttpUrl: isFirebaseStorageHttpUrl,
        storagePathFromDownloadURL: storagePathFromDownloadURL,
        isSiteRoundScopedStoragePath: isSiteRoundScopedStoragePath,
        storagePathFromSnapData: storagePathFromSnapData,
        snapNeedsSiteRoundMove: snapNeedsSiteRoundMove,
        hasFirebaseStorageMeta: hasFirebaseStorageMeta,
        firestoreStorageMetaFields: firestoreStorageMetaFields,
        getFirebaseStorage: getFirebaseStorage,
        uploadBlobToFirebaseStorage: uploadBlobToFirebaseStorage,
        deleteFirebaseStoragePath: deleteFirebaseStoragePath,
        resolveCloudAssetUrlFromSnapData: resolveCloudAssetUrlFromSnapData,
        blobToDataUrl: blobToDataUrl,
        fetchUrlAsDataUrl: fetchUrlAsDataUrl,
        materializeCloudAssetPayload: materializeCloudAssetPayload,
        assetUrlToUploadBlob: assetUrlToUploadBlob
    };

    root.BSA = root.BSA || {};
    root.BSA.storageAssets = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
