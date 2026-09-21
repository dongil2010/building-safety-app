/* ==========================================================================
   건축물 안전점검 — Service Worker (PWA)

   원칙: **온라인이면 언제나 네트워크 최신본**, 네트워크가 죽었을 때만 캐시.
   앱 JS/CSS는 예전부터 네트워크 전용이었다(모바일 웹 구버전 고착 방지). 그건
   그대로 두되, "네트워크 실패 시 되돌려줄 마지막 정상본"을 따로 보관한다.
   온라인 동작은 전과 똑같고, 오프라인에서만 달라진다.

   (2026-09-20 이전에는 오프라인에서 새로고침하면 앱이 아예 안 떴다. index.html을
    캐시에 넣는 경로가 없어서 fallback이 항상 빈손이었고, firebase-auth 같은
    부팅 필수 외부 스크립트도 선캐시 목록에 빠져 있었다. 지하 점검 중에 새로고침
    하면 그날 작업이 막히는 문제라 고쳤다.)
   ========================================================================== */

const CACHE_NAME = 'building-safety-v20260921_171003';

/**
 * 오프라인 부팅용 앱 셸 캐시.
 *
 * CACHE_NAME은 배포마다 바뀌고 activate에서 옛 캐시를 통째로 지운다. 셸을 거기
 * 두면 "새 버전 활성화 직후 오프라인" 순간에 다시 백지가 되므로, 셸만 버전과
 * 무관한 고정 이름을 쓰고 activate에서 살려둔다. 내용은 온라인 요청이 성공할
 * 때마다 최신본으로 덮어쓰므로 오래된 코드가 눌러앉지 않는다.
 */
const SHELL_CACHE = 'building-safety-shell';

/** 오프라인에서 HTML을 돌려줄 때 쓰는 고정 키 (주소에 ?나 / 변형이 있어도 하나로 모은다) */
const SHELL_HTML_KEY = './index.html';

/**
 * index.html이 부르는 외부 CDN 파일.
 * 주소에 버전이 박혀 있어 내용이 바뀌지 않으므로 캐시 우선으로 준다.
 *
 * **이 목록에 없는 외부 요청은 가로채지 않는다.** Storage/Firestore/Worker 응답에
 * CORS 헤더가 없으면 SW fetch가 실패해서 「Storage REST 503」처럼 보이기 때문이다.
 */
const CDN_ASSETS = [
    'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
];

const CDN_ASSET_SET = new Set(CDN_ASSETS);

/** 오프라인 셸·한글 템플릿 선캐시 (app.js / js/* 는 아래 warmShell이 따로 받는다) */
const STATIC_ASSETS = [
    './manifest.json',
    './web-version.json',
    './templates/hwpx_survey_template.hwpx',
    './templates/hwpx_survey_template_regular.hwpx',
    './templates/hwpx_survey_template_grade3.hwpx',
    './templates/hwpx_survey_template_grade3_regular.hwpx',
    './templates/hwpx_crack_monitor.hwpx'
].concat(CDN_ASSETS);

function isMutableAppAsset(url) {
    try {
        const path = new URL(url).pathname;
        return /\/(app\.js|styles\.css|sw\.js)$/.test(path) || /\/js\//.test(path);
    } catch (e) {
        return false;
    }
}

function offlineResponse(message) {
    return new Response(message || '오프라인 — 네트워크 연결 후 새로고침해 주세요.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
}

/**
 * 응답을 돌려준 뒤에도 캐시 저장이 끝날 때까지 SW를 살려둔다.
 * waitUntil 없이 그냥 던져두면, 브라우저가 응답 직후 SW를 재워버릴 때 저장이
 * 중간에 끊긴다. 그러면 오프라인에 대비해 넣어둔 줄 알았던 셸이 비어 있다.
 */
function keepAlive(event, promise) {
    if (event && typeof event.waitUntil === 'function') {
        try {
            event.waitUntil(promise);
            return promise;
        } catch (e) {
            /* 이미 응답이 끝난 이벤트면 그냥 진행한다 */
        }
    }
    return promise;
}

/**
 * 하나씩 담는다. cache.addAll은 한 개만 실패해도 전부 취소되는데, CDN 하나가
 * 잠깐 흔들렸다고 템플릿까지 선캐시를 못 하면 손해다.
 */
async function precacheEach(cache, urls) {
    await Promise.all(urls.map(async (url) => {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
        } catch (e) {
            console.warn('[ServiceWorker] precache skip:', url);
        }
    }));
}

/**
 * 셸 캐시에 넣는다. 같은 경로의 옛 ?v= 항목은 지워서 파일당 한 벌만 남긴다
 * (app.js가 2.6MB라 배포마다 쌓이면 기기 저장소를 먹는다).
 */
async function putShell(key, response) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const href = typeof key === 'string' ? key : key.url;
        const target = new URL(href, self.location.href);
        const keys = await cache.keys();
        await Promise.all(keys.map((old) => {
            let oldUrl;
            try {
                oldUrl = new URL(old.url);
            } catch (e) {
                return null;
            }
            if (oldUrl.pathname === target.pathname && oldUrl.search !== target.search) {
                return cache.delete(old);
            }
            return null;
        }));
    } catch (e) {
        /* 정리는 실패해도 저장 자체는 진행한다 */
    }
    await cache.put(key, response);
}

/**
 * index.html을 읽어 거기 적힌 app.js / styles.css / js/* 를 그대로 셸에 채운다.
 *
 * 목록을 여기에 손으로 적지 않는 이유: 스크립트가 30개가 넘고 앞으로도 늘어난다.
 * 적어두면 반드시 index.html과 어긋나고, 어긋난 순간 오프라인에서 그 파일만
 * 빠져서 앱이 안 뜬다. index.html에서 뽑으면 항상 맞는다.
 */
async function warmShell() {
    const res = await fetch(SHELL_HTML_KEY, { cache: 'no-store' });
    if (!res || !res.ok) return;
    const html = await res.clone().text();
    await putShell(SHELL_HTML_KEY, res);

    const urls = new Set();
    const re = /(?:src|href)="((?:\.\/)?(?:app\.js|styles\.css|js\/[^"?]+)(?:\?[^"]*)?)"/g;
    let m;
    while ((m = re.exec(html)) !== null) urls.add(m[1]);

    for (const url of urls) {
        try {
            // 버전이 붙은 주소라 내용이 고정이다. no-store를 안 걸어 HTTP 캐시를
            // 재사용하게 두면 방금 페이지가 받은 걸 그대로 쓰므로 중복 다운로드가 없다.
            const r = await fetch(url);
            if (r && r.ok) await putShell(new URL(url, self.location.href).href, r);
        } catch (e) {
            /* 한 파일 실패가 나머지를 막지 않게 한다 */
        }
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(CACHE_NAME);
            await precacheEach(cache, STATIC_ASSETS);
        } catch (err) {
            console.warn('[ServiceWorker] precache fail:', err);
        }
        await self.skipWaiting();
        try {
            await warmShell();
        } catch (err) {
            console.warn('[ServiceWorker] shell warm fail:', err);
        }
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames.map((cache) => {
                // 셸 캐시는 버전이 올라가도 지우지 않는다. 지우면 새 버전 활성화
                // 직후 오프라인이 된 기기가 다시 백지가 된다.
                if (cache !== CACHE_NAME && cache !== SHELL_CACHE) return caches.delete(cache);
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/** 외부 CDN: 캐시에 있으면 바로 주고, 없으면 받아서 넣는다 (주소에 버전이 박혀 있어 안전) */
async function cdnCacheFirst(request, event) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const res = await fetch(request);
        if (res && (res.ok || res.type === 'opaque')) {
            const clone = res.clone();
            keepAlive(event, caches.open(CACHE_NAME).then((c) => c.put(request, clone)).catch(() => {}));
        }
        return res;
    } catch (e) {
        return offlineResponse();
    }
}

/**
 * 앱 셸(HTML·app.js·styles.css·js/*): 항상 네트워크를 먼저 친다.
 * 성공하면 그 응답을 셸에 보관하고, 네트워크가 죽었을 때만 보관본을 돌려준다.
 * → 온라인 사용자는 전과 똑같이 매번 최신 코드를 받는다.
 */
async function shellNetworkFirst(request, isHtml, event) {
    try {
        const res = await fetch(request, { cache: 'no-store' });
        if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            keepAlive(event, putShell(isHtml ? SHELL_HTML_KEY : request, clone).catch(() => {}));
        }
        return res;
    } catch (e) {
        if (isHtml) {
            const cachedHtml = await caches.match(SHELL_HTML_KEY);
            if (cachedHtml) return cachedHtml;
            return offlineResponse('오프라인 — 앱을 한 번도 온라인으로 연 적이 없어 띄울 수 없습니다.');
        }
        const exact = await caches.match(request);
        if (exact) return exact;
        // ?v= 가 어긋난 경우(배포 도중 연결이 끊긴 기기)를 위한 마지막 보루.
        // 버전이 조금 안 맞아도 앱이 뜨는 편이 백지보다 낫다.
        const loose = await caches.match(request, { ignoreSearch: true });
        if (loose) return loose;
        return offlineResponse();
    }
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = event.request.url;
    let sameOrigin = false;
    try {
        sameOrigin = new URL(url).origin === self.location.origin;
    } catch (e) {
        return;
    }

    if (!sameOrigin) {
        // 목록에 있는 CDN만 다룬다. 나머지(Storage·Firestore·Worker)는 손대지 않는다.
        if (CDN_ASSET_SET.has(url.split('#')[0])) {
            event.respondWith(cdnCacheFirst(event.request, event));
        }
        return;
    }

    // 브라우저 확장(chrome-extension:) 등 http(s)가 아닌 요청은 Cache API에 못 넣는다.
    if (!url.startsWith('http:') && !url.startsWith('https:')) {
        return;
    }

    const isHtml = event.request.destination === 'document'
        || event.request.mode === 'navigate'
        || /(?:\/|\.html)(?:\?|$)/.test(url.split('?')[0]);

    if (isHtml || isMutableAppAsset(url)) {
        event.respondWith(shellNetworkFirst(event.request, isHtml, event));
        return;
    }

    if (url.includes('web-version.json')) {
        // 버전 확인은 캐시로 답하면 안 된다. 오프라인이면 실패해야 앱이
        // "업데이트 확인 못 함"으로 처리하고 최신인 척하지 않는다.
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(() => offlineResponse())
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const clone = networkResponse.clone();
                    // 캐시 저장 실패(용량 초과·저장 불가 스킴 등)는 응답 자체와 무관하므로 삼킨다
                    caches.open(CACHE_NAME)
                        .then((cache) => cache.put(event.request, clone))
                        .catch(() => {});
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return offlineResponse('오프라인');
            }))
    );
});
