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
    const _missingStoragePaths = new Set();
    let _proxyStorageUnavailable = false;
    // GitHub Pages에서 Storage GET 본문에는 ACAO가 없고, SW가 그 fetch를 가로채면 503이 난다.
    // 한 번이라도 CORS/503이면 이번 세션은 Worker 프록시만 쓴다.
    let _directStorageBlocked = false;
    let _assetDownloadInflight = 0;
    const _assetDownloadWaiters = [];
    const ASSET_DOWNLOAD_MAX = 3;

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
        const parsed = parseFirebaseStorageHttpUrl(url);
        return parsed && parsed.path ? parsed.path : null;
    }

    function parseFirebaseStorageHttpUrl(url) {
        if (!isFirebaseStorageHttpUrl(url)) return null;
        try {
            const u = new URL(url);
            const marker = '/o/';
            const idx = u.pathname.indexOf(marker);
            if (idx < 0) return null;
            const encoded = u.pathname.slice(idx + marker.length);
            if (!encoded) return null;
            const bMarker = '/b/';
            const bIdx = u.pathname.indexOf(bMarker);
            let bucket = '';
            if (bIdx >= 0 && bIdx < idx) {
                bucket = decodeURIComponent(u.pathname.slice(bIdx + bMarker.length, idx));
            }
            return {
                bucket: bucket,
                path: decodeURIComponent(encoded.split('?')[0])
            };
        } catch (e) {
            return null;
        }
    }

    function storageBucketAliases(bucket) {
        const b = String(bucket || '').replace(/^\/+/, '');
        if (!b) return [];
        const out = [b];
        if (/\.firebasestorage\.app$/i.test(b)) {
            out.push(b.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
        } else if (/\.appspot\.com$/i.test(b)) {
            out.push(b.replace(/\.appspot\.com$/i, '.firebasestorage.app'));
        }
        return out.filter(function (name, i, arr) { return arr.indexOf(name) === i; });
    }

    function isStorageNotFoundError(err) {
        const code = String((err && err.code) || '');
        const msg = String((err && err.message) || err || '');
        return code === 'storage/object-not-found'
            || /HTTP 404/i.test(msg)
            || /object-not-found/i.test(msg);
    }

    function isBrowserStorageBlockedError(err) {
        const msg = String((err && err.message) || err || '');
        const name = String((err && err.name) || '');
        return /HTTP 503/i.test(msg)
            || /Failed to fetch/i.test(msg)
            || /NetworkError/i.test(msg)
            || /Load failed/i.test(msg)
            || /CORS/i.test(msg)
            || name === 'TypeError';
    }

    function withAssetDownloadLock(fn) {
        return new Promise(function (resolve, reject) {
            const run = function () {
                _assetDownloadInflight += 1;
                Promise.resolve()
                    .then(fn)
                    .then(resolve, reject)
                    .then(function () {
                        _assetDownloadInflight -= 1;
                        const next = _assetDownloadWaiters.shift();
                        if (next) next();
                    });
            };
            if (_assetDownloadInflight >= ASSET_DOWNLOAD_MAX) {
                _assetDownloadWaiters.push(run);
            } else {
                run();
            }
        });
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
        _missingStoragePaths.delete(path);
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
                if (!isStorageNotFoundError(e)) {
                    console.warn('Storage getDownloadURL 실패:', path, e);
                }
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
        async function readOk(res) {
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
        // downloadURL 은 token 쿼리만으로 충분하다. Authorization 을 붙이면 preflight만
        // 늘고, GET 본문에는 버킷 CORS가 없어 브라우저가 읽지 못한다.
        return await readOk(await fetch(url, { mode: 'cors' }));
    }

    async function fetchStorageRestWithAuth(path, fallbackType, bucketHint) {
        const token = await getFirebaseAuthIdToken();
        if (!token) throw new Error('Storage REST: 로그인 토큰 없음');
        const buckets = storageBucketAliases(bucketHint || getConfiguredStorageBucket());
        if (!buckets.length) throw new Error('Storage REST: bucket 없음');
        let lastErr = null;
        for (let i = 0; i < buckets.length; i++) {
            const bucket = buckets[i];
            const restUrl = firebaseStorageRestMediaUrl(bucket, path);
            try {
                const res = await fetch(restUrl, {
                    mode: 'cors',
                    headers: firebaseStorageAuthHeaders(token)
                });
                if (res.ok) return coerceBlobType(await res.blob(), fallbackType);
                lastErr = new Error('Storage REST HTTP ' + res.status);
                if (res.status !== 404) break;
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('Storage REST 실패');
    }

    /** SDK getBlob이 있으면 쓰고, 없으면 getDownloadURL 후 헤더 없는 GET. 브라우저 REST+Auth는 쓰지 않음. */
    async function downloadStoragePathAsBlob(storagePath, fallbackType, opts) {
        const storage = getFirebaseStorage();
        if (!storagePath) throw new Error('Storage path 없음');
        const path = String(storagePath).replace(/^\/+/, '');
        if (_missingStoragePaths.has(path)) {
            const miss = new Error('Storage REST HTTP 404');
            miss.code = 'storage/object-not-found';
            throw miss;
        }
        if (storage) {
            const ref = storage.ref().child(path);
            if (typeof ref.getBlob === 'function') {
                try {
                    return coerceBlobType(await ref.getBlob(), fallbackType);
                } catch (e) {
                    if (isStorageNotFoundError(e)) {
                        _missingStoragePaths.add(path);
                        throw e;
                    }
                    if (isBrowserStorageBlockedError(e)) _directStorageBlocked = true;
                }
            }
            if (typeof ref.getBytes === 'function') {
                try {
                    const bytes = await ref.getBytes();
                    return new Blob([bytes], { type: fallbackType || 'application/octet-stream' });
                } catch (e) {
                    if (isStorageNotFoundError(e)) {
                        _missingStoragePaths.add(path);
                        throw e;
                    }
                    if (isBrowserStorageBlockedError(e)) _directStorageBlocked = true;
                }
            }
        }
        if (_directStorageBlocked) {
            throw new Error('asset fetch HTTP 503');
        }
        if (!storage) throw new Error('Firebase Storage unavailable');
        const ref = storage.ref().child(path);
        const url = await ref.getDownloadURL();
        try {
            const res = await fetch(url, { mode: 'cors' });
            if (!res.ok) throw new Error('asset fetch HTTP ' + res.status);
            return coerceBlobType(await res.blob(), fallbackType);
        } catch (e) {
            if (isStorageNotFoundError(e)) {
                _missingStoragePaths.add(path);
            } else if (isBrowserStorageBlockedError(e)) {
                _directStorageBlocked = true;
            }
            throw e;
        }
    }

    async function tryProxyFetchDataUrl(url) {
        if (_proxyStorageUnavailable) return null;
        const fn = (typeof api.proxyFetch === 'function')
            ? api.proxyFetch
            : (typeof root.fetchStorageImageViaProxy === 'function' ? root.fetchStorageImageViaProxy : null);
        if (typeof fn !== 'function') return null;
        try {
            const proxied = await fn(url);
            if (proxied && String(proxied).indexOf('data:') === 0 && String(proxied).length > 32) {
                return proxied;
            }
        } catch (e) {
            const msg = String((e && e.message) || e || '');
            if (/image 필드가 없거나|아직 배포되지/.test(msg)) {
                _proxyStorageUnavailable = true;
            } else {
                console.warn('Storage proxyFetch 실패:', e);
            }
        }
        return null;
    }

    async function materializeCloudAssetPayload(url, snapData) {
        if (!url || typeof url !== 'string') return null;
        if (url.indexOf('data:') === 0) return url;
        return withAssetDownloadLock(async function () {
            const ctype = String((snapData && snapData.contentType) || '');
            const parsed = parseFirebaseStorageHttpUrl(url);
            const path = (snapData && snapData.storagePath)
                || (parsed && parsed.path)
                || storagePathFromDownloadURL(url);

            // Pages 출처는 Storage GET 본문을 못 읽는다. Worker(POST)가 CORS를 붙인다.
            const proxiedFirst = await tryProxyFetchDataUrl(url);
            if (proxiedFirst) return proxiedFirst;
            if (typeof api.proxyFetch === 'function' && !_proxyStorageUnavailable) {
                return null;
            }

            if (!_directStorageBlocked) {
                try {
                    const local = await fetchUrlAsDataUrl(url, ctype || undefined);
                    if (local && String(local).indexOf('data:') === 0) return local;
                } catch (e1) {
                    if (isStorageNotFoundError(e1) && path) {
                        _missingStoragePaths.add(String(path).replace(/^\/+/, ''));
                        return null;
                    }
                    if (isBrowserStorageBlockedError(e1)) _directStorageBlocked = true;
                }
            }

            if (path && !_missingStoragePaths.has(String(path).replace(/^\/+/, '')) && !_directStorageBlocked) {
                try {
                    const blob = await downloadStoragePathAsBlob(path, ctype || 'image/jpeg', {
                        bucket: (parsed && parsed.bucket) || ''
                    });
                    const local = await blobToDataUrl(blob);
                    if (local && String(local).indexOf('data:') === 0) return local;
                } catch (e2) {
                    if (isStorageNotFoundError(e2)) return null;
                }
            }

            return tryProxyFetchDataUrl(url);
        });
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
            const proxied = await tryProxyFetchDataUrl(url);
            if (proxied) {
                const parsedProxied = parseDataUrl(proxied);
                if (parsedProxied) return parsedProxied;
            }
            const path = storagePathFromDownloadURL(url);
            if (path && !_directStorageBlocked) {
                try {
                    const blob = await downloadStoragePathAsBlob(path, 'image/jpeg');
                    return {
                        contentType: blob.type || 'image/jpeg',
                        blob: blob,
                        size: blob.size
                    };
                } catch (_e) { /* fall through to fetch */ }
            }
            const res = await fetch(url, { mode: 'cors' });
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
