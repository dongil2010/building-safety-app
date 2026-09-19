/* ==========================================================================
   ê±´ì¶•ë¬??ˆì „?ê? ??Service Worker (PWA)
   ??JS/CSS???¤íŠ¸?Œí¬ ?„ìš©(ìºì‹œ fallback ?†ìŒ) ??ëª¨ë°”????êµ¬ë²„??ê³ ì°© ë°©ì?
   ========================================================================== */

const CACHE_NAME = 'building-safety-v20260919_210319';

/** ?¤í”„?¼ì¸ ?¸Â·í•œê¸€ ?œí”Œë¦¿ë§Œ ? ìº??(app.js / js/* ???œì™¸) */
const STATIC_ASSETS = [
    './manifest.json',
    './web-version.json',
    './templates/hwpx_survey_template.hwpx',
    './templates/hwpx_survey_template_regular.hwpx',
    './templates/hwpx_survey_template_grade3.hwpx',
    './templates/hwpx_survey_template_grade3_regular.hwpx',
    './templates/hwpx_crack_monitor.hwpx',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

function isMutableAppAsset(url) {
    try {
        const path = new URL(url).pathname;
        return /\/(app\.js|styles\.css|sw\.js)$/.test(path) || /\/js\//.test(path);
    } catch (e) {
        return false;
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('[ServiceWorker] precache partial fail:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cache) => {
                if (cache !== CACHE_NAME) return caches.delete(cache);
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;
    // ?¤ë¥¸ ì¶œì²˜(StorageÂ·FirestoreÂ·WorkerÂ·CDN)??ê°€ë¡œì±„ì§€ ?ŠëŠ”??
    // firebasestorage GET ?‘ë‹µ??CORS ?¤ë”ê°€ ?†ìœ¼ë©?SW fetchê°€ ?¤íŒ¨?˜ê³ 
    // ?„ë˜ catchê°€ status 503?Œì˜¤?„ë¼?¸ã€ì„ ë§Œë“¤???ŒStorage REST 503?ì²˜??ë³´ì¸??
    try {
        if (new URL(url).origin !== self.location.origin) return;
    } catch (_e) {
        return;
    }
    if (url.includes('firestore.googleapis.com') || url.includes('google.com/recaptcha')) {
        return;
    }
    // ë¸Œë¼?°ì? ?•ì¥(chrome-extension:) ??http(s)ê°€ ?„ë‹Œ ?”ì²­?€ Cache API??ëª??£ëŠ”??
    // ê·¸ëƒ¥ ?ë©´ cache.put??ê±°ë???"Uncaught (in promise) TypeError"ê°€ ì½˜ì†”???¨ëŠ”??
    if (!url.startsWith('http:') && !url.startsWith('https:')) {
        return;
    }

    const isVersionCheck = url.includes('web-version.json');
    const isHtml = event.request.destination === 'document'
        || event.request.mode === 'navigate'
        || /(?:\/|\.html)(?:\?|$)/.test(url.split('?')[0]);
    const isAppCode = isMutableAppAsset(url);

    if (isAppCode || isVersionCheck || isHtml) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(() => {
                if (isHtml) {
                    return caches.match('./index.html').then((r) => r || new Response('?¤í”„?¼ì¸', { status: 503 }));
                }
                return new Response('?¤í”„?¼ì¸ ???¤íŠ¸?Œí¬ ?°ê²° ???ˆë¡œê³ ì¹¨??ì£¼ì„¸??', {
                    status: 503,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const clone = networkResponse.clone();
                    // ìºì‹œ ?€???¤íŒ¨(?©ëŸ‰ ì´ˆê³¼Â·?€??ë¶ˆê? ?¤í‚´ ?????‘ë‹µ ?ì²´?€ ë¬´ê??˜ë?ë¡??¼í‚¨??
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(event.request, clone))
                        .catch(() => {});
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return new Response('?¤í”„?¼ì¸', { status: 503 });
            }))
    );
});
