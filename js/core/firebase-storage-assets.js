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
            || /\.firebasestorage\.app/i.test(url)
            || /\/\/storage\.googleapis\.com\//i.test(url);
    }

    /** Worker 프록시에 보낼 URL — cloudflare-worker/storage-url-allowlist.js 와 동기화 */
    function isAllowedFirebaseStorageProxyUrl(url) {
        try {
            const u = new URL(url);
            if (u.protocol !== 'https:') return false;
            const h = u.hostname.toLowerCase();
            const path = u.pathname || '';
            if (h === 'firebasestorage.googleapis.com') {
                return path.indexOf('/v0/b/') === 0 && path.indexOf('/o/') !== -1;
            }
            if (h === 'storage.googleapis.com') {
                return path.indexOf('/download/storage/') === 0
                    || path.indexOf('/storage/v1/b/') === 0
                    || /^\/[^/]+\//.test(path);
            }
            if (h.endsWith('.firebasestorage.app') || h === 'firebasestorage.app') {
                return path.indexOf('/o/') !== -1 || path.indexOf('/v0/b/') === 0;
            }
            return false;
        } catch (e) {
            return false;
        }
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
            return decodeURIComponent(encoded.split('?')[0]);
        } catch (e) {
            return null;
        }
    }

    /** Firebase JS SDK와 동일. Bearer 가 아님 — Storage REST는 `Firebase <idToken>`. */
    function firebaseStorageAuthHeaders(idToken) {
        const headers = {
            'X-Firebase-Storage-Version': 'webjs/9.22.0'
        };
        const token = String(idToken || '').trim();
        if (token) headers.Authorization = 'Firebase ' + token;
        return headers;
    }

    function firebaseStorageRestMediaUrl(bucket, path) {
        return 'https://firebasestorage.googleapis.com/v0/b/'
            + encodeURIComponent(String(bucket || '').replace(/^\/+/, ''))
            + '/o/'
            + encodeURIComponent(String(path || '').replace(/^\/+/, ''))
            + '?alt=media';
    }

    function getConfiguredStorageBucket() {
        try {
            const storage = getFirebaseStorage();
            if (storage && storage.app && storage.app.options && storage.app.options.storageBucket) {
                return String(storage.app.options.storageBucket);
            }
            if (typeof firebase !== 'undefined' && firebase.app) {
                const opts = firebase.app().options || {};
                if (opts.storageBucket) return String(opts.storageBucket);
            }
        } catch (_e) { /* ignore */ }
        return '';
    }

    async function getFirebaseAuthIdToken() {
        try {
            if (typeof firebase === 'undefined' || !firebase.auth) return '';
            const user = firebase.auth().currentUser;
            if (!user || typeof user.getIdToken !== 'function') return '';
            const token = await user.getIdToken();
            return (typeof token === 'string' && token.length > 20) ? token : '';
        } catch (_e) {
            return '';
        }
    }

    function coerceBlobType(blob, fallbackType) {
        if (!blob) return blob;
        if (fallbackType && (!blob.type || blob.type === 'application/octet-stream')) {
            return new Blob([blob], { type: fallbackType });
        }
        return blob;
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
        const headers = {};
        if (isFirebaseStorageHttpUrl(url)) {
            const token = await getFirebaseAuthIdToken();
            if (token) Object.assign(headers, firebaseStorageAuthHeaders(token));
        }
        const res = await fetch(url, { mode: 'cors', headers: headers });
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

    async function fetchStorageRestWithAuth(path, fallbackType) {
        const token = await getFirebaseAuthIdToken();
        if (!token) throw new Error('Storage REST: 로그인 토큰 없음');
        const bucket = getConfiguredStorageBucket();
        if (!bucket) throw new Error('Storage REST: bucket 없음');
        const restUrl = firebaseStorageRestMediaUrl(bucket, path);
        const res = await fetch(restUrl, {
            mode: 'cors',
            headers: firebaseStorageAuthHeaders(token)
        });
        if (!res.ok) throw new Error('Storage REST HTTP ' + res.status);
        return coerceBlobType(await res.blob(), fallbackType);
    }

    /** Storage SDK/REST로 본문 받기. compat SDK는 getBlob이 없어 REST(Firebase 헤더)를 씀. */
    async function downloadStoragePathAsBlob(storagePath, fallbackType) {
        const storage = getFirebaseStorage();
        if (!storagePath) throw new Error('Storage path 없음');
        const path = String(storagePath).replace(/^\/+/, '');
        if (storage) {
            const ref = storage.ref().child(path);
            if (typeof ref.getBlob === 'function') {
                try {
                    return coerceBlobType(await ref.getBlob(), fallbackType);
                } catch (e) {
                    console.warn('Storage getBlob 실패, REST 시도:', path, e);
                }
            }
            if (typeof ref.getBytes === 'function') {
                try {
                    const bytes = await ref.getBytes();
                    return new Blob([bytes], { type: fallbackType || 'application/octet-stream' });
                } catch (e) {
                    console.warn('Storage getBytes 실패, REST 시도:', path, e);
                }
            }
        }
        try {
            return await fetchStorageRestWithAuth(path, fallbackType);
        } catch (restErr) {
            console.warn('Storage REST 다운로드 실패, getDownloadURL+auth fetch 시도:', path, restErr);
        }
        if (!storage) throw new Error('Firebase Storage unavailable');
        const ref = storage.ref().child(path);
        const url = await ref.getDownloadURL();
        const token = await getFirebaseAuthIdToken();
        const headers = token ? firebaseStorageAuthHeaders(token) : {};
        const res = await fetch(url, { mode: 'cors', headers: headers });
        if (!res.ok) throw new Error('asset fetch HTTP ' + res.status);
        return coerceBlobType(await res.blob(), fallbackType);
    }

    async function tryProxyFetchDataUrl(url) {
        if (typeof api.proxyFetch !== 'function') return null;
        try {
            const proxied = await api.proxyFetch(url);
            if (proxied && String(proxied).indexOf('data:') === 0 && String(proxied).length > 32) {
                return proxied;
            }
        } catch (e) {
            console.warn('Storage proxyFetch 실패:', e);
        }
        return null;
    }

    async function materializeCloudAssetPayload(url, snapData) {
        if (!url || typeof url !== 'string') return null;
        if (url.indexOf('data:') === 0) return url;
        const ctype = String((snapData && snapData.contentType) || '');
        try {
            const local = await fetchUrlAsDataUrl(url, ctype || undefined);
            if (local && String(local).indexOf('data:') === 0) return local;
        } catch (e) {
            const path = (snapData && snapData.storagePath)
                || storagePathFromDownloadURL(url);
            if (path) {
                try {
                    const blob = await downloadStoragePathAsBlob(path, ctype || 'image/jpeg');
                    return await blobToDataUrl(blob);
                } catch (e2) {
                    console.warn('Storage SDK 본문 받기 실패:', path, e2);
                }
            }
            const proxied = await tryProxyFetchDataUrl(url);
            if (proxied) return proxied;
            console.warn('클라우드 파일 본문 받기 실패:', url.slice(0, 80), e);
            return null;
        }
        const proxied = await tryProxyFetchDataUrl(url);
        if (proxied) return proxied;
        return null;
    }

    function setAssetProxy(fn) {
        api.proxyFetch = (typeof fn === 'function') ? fn : null;
    }

    async function assetUrlToUploadBlob(url) {
        const parsed = parseDataUrl(url);
        if (parsed) return parsed;
        if (typeof url !== 'string') return null;
        if (url.indexOf('blob:') === 0) {
            const res = await fetch(url);
            if (!res.ok) throw new Error('asset fetch HTTP ' + res.status);
            const blob = await res.blob();
            return {
                contentType: blob.type || 'application/octet-stream',
                blob: blob,
                size: blob.size
            };
        }
        if (/^https?:\/\//i.test(url)) {
            const path = storagePathFromDownloadURL(url);
            if (path) {
                try {
                    const blob = await downloadStoragePathAsBlob(path, 'image/jpeg');
                    return {
                        contentType: blob.type || 'image/jpeg',
                        blob: blob,
                        size: blob.size
                    };
                } catch (_e) { /* fall through to fetch */ }
            }
            const token = isFirebaseStorageHttpUrl(url) ? await getFirebaseAuthIdToken() : '';
            const headers = token ? firebaseStorageAuthHeaders(token) : {};
            const res = await fetch(url, { mode: 'cors', headers: headers });
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
        isAllowedFirebaseStorageProxyUrl: isAllowedFirebaseStorageProxyUrl,
        storagePathFromDownloadURL: storagePathFromDownloadURL,
        firebaseStorageAuthHeaders: firebaseStorageAuthHeaders,
        firebaseStorageRestMediaUrl: firebaseStorageRestMediaUrl,
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
        downloadStoragePathAsBlob: downloadStoragePathAsBlob,
        materializeCloudAssetPayload: materializeCloudAssetPayload,
        assetUrlToUploadBlob: assetUrlToUploadBlob,
        proxyFetch: null,
        setAssetProxy: setAssetProxy
    };

    root.BSA = root.BSA || {};
    root.BSA.storageAssets = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
