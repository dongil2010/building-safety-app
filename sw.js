/* ==========================================================================
   건축물 안전점검 — Service Worker (PWA)
   앱 JS/CSS는 네트워크 전용(캐시 fallback 없음) — 모바일 웹 구버전 고착 방지
   ========================================================================== */

const CACHE_NAME = 'building-safety-v20260904_200558';

/** 오프라인 셸·한글 템플릿만 선캐시 (app.js / js/* 는 제외) */
const STATIC_ASSETS = [
    './manifest.json',
    './web-version.json',
    './templates/hwpx_survey_template.hwpx',
    './templates/hwpx_survey_template_regular.hwpx',
    './templates/hwpx_survey_template_grade3.hwpx',
    './templates/hwpx_survey_template_grade3_regular.hwpx',
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
    if (url.includes('firestore.googleapis.com') || url.includes('google.com/recaptcha')) {
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
                    return caches.match('./index.html').then((r) => r || new Response('오프라인', { status: 503 }));
                }
                return new Response('오프라인 — 네트워크 연결 후 새로고침해 주세요.', {
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
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return new Response('오프라인', { status: 503 });
            }))
    );
});
