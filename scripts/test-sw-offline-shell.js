#!/usr/bin/env node
'use strict';

/**
 * sw.js 오프라인 부팅 검증.
 *
 * 2026-09-20 이전에는 오프라인에서 새로고침하면 앱이 백지였다. index.html을
 * 캐시에 넣는 경로가 아예 없어서 fallback(caches.match('./index.html'))이 항상
 * 빈손이었기 때문이다. 지하 점검 중이면 그날 작업이 막힌다.
 *
 * 이 테스트는 sw.js를 가짜 Cache/fetch 위에서 **실제로 실행**해서
 *   1) 온라인일 때 여전히 매번 네트워크 최신본을 주는지 (구버전 고착 방지 유지)
 *   2) 오프라인일 때 앱 셸을 돌려주는지
 *   3) Storage/Firestore 같은 외부 요청은 건드리지 않는지 (CORS 503 재발 방지)
 * 를 확인한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SW_SRC = fs.readFileSync(path.join(REPO_ROOT, 'sw.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');

const SCOPE = 'https://dongil2010.github.io/building-safety-app/';
const SW_URL = SCOPE + 'sw.js';

/* ------------------------------------------------------------------ */
/* 최소 브라우저 흉내                                                   */
/* ------------------------------------------------------------------ */

class FakeResponse {
    constructor(body, init) {
        const opts = init || {};
        this._body = body == null ? '' : String(body);
        this.status = opts.status == null ? 200 : opts.status;
        this.ok = this.status >= 200 && this.status < 300;
        this.type = opts.type || 'basic';
        this.headers = opts.headers || {};
    }
    clone() {
        return new FakeResponse(this._body, {
            status: this.status, type: this.type, headers: this.headers
        });
    }
    async text() { return this._body; }
}

function urlOf(key) {
    const href = typeof key === 'string' ? key : key.url;
    return new URL(href, SW_URL).href;
}

class FakeCache {
    constructor() { this.map = new Map(); }
    async put(key, res) { this.map.set(urlOf(key), res); }
    async keys() { return Array.from(this.map.keys()).map((u) => ({ url: u })); }
    async delete(key) { return this.map.delete(urlOf(key)); }
    async match(key, opts) {
        const want = urlOf(key);
        if (this.map.has(want)) return this.map.get(want);
        if (opts && opts.ignoreSearch) {
            const wantPath = new URL(want).pathname;
            for (const [u, res] of this.map) {
                if (new URL(u).pathname === wantPath) return res;
            }
        }
        return undefined;
    }
}

class FakeCacheStorage {
    constructor() { this.caches = new Map(); }
    async open(name) {
        if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
        return this.caches.get(name);
    }
    async keys() { return Array.from(this.caches.keys()); }
    async delete(name) { return this.caches.delete(name); }
    async match(key, opts) {
        for (const cache of this.caches.values()) {
            const hit = await cache.match(key, opts);
            if (hit) return hit;
        }
        return undefined;
    }
}

function request(url, extra) {
    return Object.assign({ url: url, method: 'GET', mode: 'no-cors', destination: '' }, extra || {});
}

/** sw.js를 새 가짜 환경에서 실행하고 등록된 리스너를 돌려준다 */
function loadServiceWorker(fetchImpl) {
    const listeners = {};
    const cacheStorage = new FakeCacheStorage();
    const calls = [];

    const self = {
        location: { href: SW_URL, origin: 'https://dongil2010.github.io' },
        addEventListener(type, fn) { listeners[type] = fn; },
        skipWaiting: async () => {},
        clients: { claim: async () => {} }
    };

    const fetchSpy = async (req, init) => {
        calls.push({ url: typeof req === 'string' ? req : req.url, init: init || null });
        return fetchImpl(typeof req === 'string' ? req : req.url, init);
    };

    const factory = new Function(
        'self', 'caches', 'fetch', 'Response', 'URL', 'console',
        SW_SRC
    );
    factory(self, cacheStorage, fetchSpy, FakeResponse, URL, {
        warn() {}, log() {}, error() {}
    });

    return { listeners: listeners, caches: cacheStorage, calls: calls };
}

function fireInstall(sw) {
    let waited = null;
    sw.listeners.install({ waitUntil(p) { waited = p; } });
    return waited;
}

function fireFetch(sw, req) {
    let responded;
    let called = false;
    const pending = [];
    sw.listeners.fetch({
        request: req,
        respondWith(p) { called = true; responded = p; },
        waitUntil(p) { pending.push(p); }
    });
    return {
        called: called,
        promise: responded,
        pending: pending,
        /** 응답 후 캐시 저장(waitUntil)까지 끝날 때까지 기다린다 */
        settled: async function () {
            const res = await responded;
            await Promise.all(pending);
            return res;
        }
    };
}

/** 온라인 서버 흉내: 알고 있는 경로면 200, 아니면 404 */
function onlineServer(version) {
    return async (url) => {
        const u = new URL(url, SW_URL);
        if (u.origin !== 'https://dongil2010.github.io') {
            return new FakeResponse('CDN:' + u.href, { type: 'cors' });
        }
        const rel = u.pathname.replace('/building-safety-app/', '');
        if (rel === 'index.html' || rel === '') {
            return new FakeResponse(INDEX_HTML.replace(/20260919_231710/g, version), { type: 'basic' });
        }
        if (fs.existsSync(path.join(REPO_ROOT, rel))) {
            return new FakeResponse(rel + '@' + version, { type: 'basic' });
        }
        return new FakeResponse('not found', { status: 404, type: 'basic' });
    };
}

const OFFLINE = async () => { throw new TypeError('Failed to fetch'); };

/* ------------------------------------------------------------------ */
/* 1. 목록 정합성 — index.html의 외부 리소스가 전부 선캐시 대상인가       */
/* ------------------------------------------------------------------ */

function testCdnListMatchesIndex() {
    const inIndex = new Set();
    const re = /(?:src|href)="(https:\/\/[^"]+)"/g;
    let m;
    while ((m = re.exec(INDEX_HTML)) !== null) inIndex.add(m[1]);

    const inSw = new Set((SW_SRC.match(/'https:\/\/[^']+'/g) || []).map((s) => s.slice(1, -1)));

    const missing = Array.from(inIndex).filter((u) => !inSw.has(u));
    assert.deepStrictEqual(missing, [],
        'index.html이 부르는 외부 스크립트가 sw.js 선캐시 목록에 빠졌다. '
        + '오프라인에서 이 파일이 없으면 앱이 안 뜬다: ' + missing.join(', '));

    const stale = Array.from(inSw).filter((u) => !inIndex.has(u));
    assert.deepStrictEqual(stale, [],
        'sw.js에만 있고 index.html은 더 이상 안 쓰는 주소다. 지워라: ' + stale.join(', '));

    assert.ok(inIndex.size >= 10, 'index.html 외부 리소스를 못 읽었다 (' + inIndex.size + '개)');
    console.log('  목록 정합성: 외부 리소스 ' + inIndex.size + '개 양방향 일치');
}

/* ------------------------------------------------------------------ */
/* 2. install: 셸이 실제로 채워지는가                                    */
/* ------------------------------------------------------------------ */

async function testInstallWarmsShell() {
    const sw = loadServiceWorker(onlineServer('V1'));
    await fireInstall(sw);

    const shell = sw.caches.caches.get('building-safety-shell');
    assert.ok(shell, 'building-safety-shell 캐시가 만들어지지 않았다');

    const html = await shell.match('./index.html');
    assert.ok(html, 'index.html이 셸에 안 들어갔다 — 오프라인에서 백지가 된다');

    const keys = Array.from(shell.map.keys());
    const appJs = keys.filter((k) => /\/app\.js/.test(k));
    const jsMods = keys.filter((k) => /\/js\//.test(k));
    const css = keys.filter((k) => /styles\.css/.test(k));

    assert.strictEqual(appJs.length, 1, 'app.js가 셸에 한 벌 있어야 한다');
    assert.strictEqual(css.length, 1, 'styles.css가 셸에 한 벌 있어야 한다');
    assert.ok(jsMods.length >= 20,
        'js/* 모듈이 ' + jsMods.length + '개뿐이다. index.html이 부르는 만큼 다 받아야 한다');

    console.log('  install: 셸에 ' + keys.length + '개 저장 (js 모듈 ' + jsMods.length + '개)');
}

/* ------------------------------------------------------------------ */
/* 3. 오프라인 부팅                                                     */
/* ------------------------------------------------------------------ */

async function testOfflineBoot() {
    const sw = loadServiceWorker(onlineServer('V1'));
    await fireInstall(sw);

    // 이제 네트워크가 죽었다고 하고 새로고침
    sw.offline = true;
    const swOffline = sw;
    swOffline.listeners = sw.listeners;

    // fetch 구현을 오프라인으로 갈아끼우기 위해 같은 캐시를 쓰는 새 인스턴스를 만든다
    const sw2 = loadServiceWorker(OFFLINE);
    sw2.caches.caches = sw.caches.caches;

    const nav = fireFetch(sw2, request(SCOPE, { mode: 'navigate', destination: 'document' }));
    assert.ok(nav.called, 'HTML 요청을 SW가 처리하지 않았다');
    const htmlRes = await nav.promise;
    assert.strictEqual(htmlRes.status, 200, '오프라인 새로고침이 ' + htmlRes.status + '로 실패했다 (백지 화면)');
    const body = await htmlRes.text();
    assert.ok(body.indexOf('app.js') >= 0, '돌려준 HTML이 앱 문서가 아니다');

    // app.js도 캐시에서 나와야 앱이 실제로 돈다
    const appReq = fireFetch(sw2, request(SCOPE + 'app.js?v=V1'));
    const appRes = await appReq.promise;
    assert.strictEqual(appRes.status, 200, '오프라인에서 app.js를 못 받았다 (' + appRes.status + ')');

    // 외부 CDN(firebase-auth)도 캐시에서 나와야 로그인 세션이 복구된다
    const authReq = fireFetch(sw2, request('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js'));
    assert.ok(authReq.called, 'CDN 요청을 SW가 처리하지 않았다');
    const authRes = await authReq.promise;
    assert.strictEqual(authRes.status, 200, '오프라인에서 firebase-auth를 못 받았다');

    console.log('  오프라인: index.html + app.js + firebase-auth 모두 캐시에서 복구됨');
}

/* ------------------------------------------------------------------ */
/* 4. 온라인에서는 여전히 네트워크 최신본 (구버전 고착 방지 유지)         */
/* ------------------------------------------------------------------ */

async function testOnlineAlwaysFresh() {
    const sw = loadServiceWorker(onlineServer('V1'));
    await fireInstall(sw);

    // 새 배포가 나갔다고 치고, 같은 캐시를 쓰는 채로 서버만 V2로 바꾼다
    const sw2 = loadServiceWorker(onlineServer('V2'));
    sw2.caches.caches = sw.caches.caches;

    const hit = fireFetch(sw2, request(SCOPE + 'app.js?v=V2'));
    const res = await hit.settled();
    assert.ok(hit.pending.length > 0,
        '캐시 저장을 event.waitUntil로 묶지 않았다. 브라우저가 응답 직후 SW를 재우면 '
        + '저장이 끊겨 오프라인 셸이 비어 있게 된다');
    const body = await res.text();
    assert.ok(body.indexOf('V2') >= 0,
        '온라인인데 캐시(구버전)를 돌려줬다. 모바일 구버전 고착이 재발한다: ' + body);

    const appCall = sw2.calls.find((c) => /app\.js/.test(c.url));
    assert.ok(appCall, 'app.js를 네트워크로 받지 않았다');
    assert.ok(appCall.init && appCall.init.cache === 'no-store',
        "앱 코드는 cache:'no-store'로 받아야 한다 (브라우저 HTTP 캐시 고착 방지)");

    // 셸도 최신본으로 갱신되고, 옛 ?v= 항목은 한 벌만 남아야 한다
    const shell = sw2.caches.caches.get('building-safety-shell');
    const appKeys = Array.from(shell.map.keys()).filter((k) => /\/app\.js/.test(k));
    assert.strictEqual(appKeys.length, 1,
        'app.js가 배포마다 쌓이고 있다 (' + appKeys.length + '벌). 2.6MB짜리라 기기 저장소를 먹는다');
    assert.ok(/V2/.test(appKeys[0]), '셸이 최신 버전으로 안 바뀌었다: ' + appKeys[0]);

    console.log('  온라인: 항상 네트워크 최신본, 셸은 한 벌만 유지');
}

/* ------------------------------------------------------------------ */
/* 5. 버전 확인은 캐시로 답하지 않는다                                   */
/* ------------------------------------------------------------------ */

async function testVersionCheckNeverCached() {
    const sw = loadServiceWorker(OFFLINE);
    const res = await fireFetch(sw, request(SCOPE + 'web-version.json')).promise;
    assert.strictEqual(res.status, 503,
        'web-version.json을 캐시로 답하면 앱이 구버전을 최신이라고 착각한다');
    console.log('  버전 확인: 오프라인에서 503 (최신인 척하지 않음)');
}

/* ------------------------------------------------------------------ */
/* 6. 외부 요청은 건드리지 않는다 (Storage CORS 503 재발 방지)            */
/* ------------------------------------------------------------------ */

function testForeignRequestsUntouched() {
    const sw = loadServiceWorker(onlineServer('V1'));

    const foreign = [
        'https://firebasestorage.googleapis.com/v0/b/x/o/y.png?alt=media',
        'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen',
        'https://ocr-proxy.example.workers.dev/ocr'
    ];
    foreign.forEach((url) => {
        const r = fireFetch(sw, request(url));
        assert.strictEqual(r.called, false,
            'SW가 외부 요청을 가로챘다. CORS 헤더 없는 응답에서 fetch가 실패해 '
            + '「Storage REST 503」처럼 보이는 문제가 재발한다: ' + url);
    });

    // POST는 어떤 경우에도 가로채지 않는다
    const post = fireFetch(sw, request(SCOPE + 'index.html', { method: 'POST' }));
    assert.strictEqual(post.called, false, 'POST 요청을 가로챘다');

    console.log('  외부 요청 ' + foreign.length + '건 + POST: 손대지 않음');
}

/* ------------------------------------------------------------------ */
/* 7. 셸 캐시는 배포로 지워지지 않는다                                   */
/* ------------------------------------------------------------------ */

async function testShellSurvivesActivate() {
    const sw = loadServiceWorker(onlineServer('V1'));
    await fireInstall(sw);
    await sw.caches.open('building-safety-v_OLD_');

    let waited = null;
    sw.listeners.activate({ waitUntil(p) { waited = p; } });
    await waited;

    const names = await sw.caches.keys();
    assert.ok(names.indexOf('building-safety-shell') >= 0,
        '배포 때 셸 캐시가 지워졌다. 새 버전 활성화 직후 오프라인이면 다시 백지가 된다');
    assert.ok(names.indexOf('building-safety-v_OLD_') < 0, '옛 버전 캐시는 지워야 한다');

    console.log('  activate: 옛 캐시는 정리하고 셸은 유지');
}

/* ------------------------------------------------------------------ */
/* 8. 배포 도구가 CACHE_NAME을 계속 바꿀 수 있는가                       */
/* ------------------------------------------------------------------ */

function testCacheNameStillRewritable() {
    // scripts/prepare-pages.py / git-sync.ps1 이 쓰는 정규식과 같은 모양
    const hits = SW_SRC.match(/const CACHE_NAME = '[^']*'/g) || [];
    assert.strictEqual(hits.length, 1,
        'CACHE_NAME 선언이 ' + hits.length + '개다. 배포 스크립트가 버전을 못 바꾸거나 엉뚱한 걸 바꾼다');
    assert.ok(/building-safety-v/.test(hits[0]), 'CACHE_NAME 형식이 바뀌었다: ' + hits[0]);
    console.log('  배포 도구: CACHE_NAME 치환 형식 유지');
}

/* ------------------------------------------------------------------ */

(async function main() {
    testCdnListMatchesIndex();
    await testInstallWarmsShell();
    await testOfflineBoot();
    await testOnlineAlwaysFresh();
    await testVersionCheckNeverCached();
    testForeignRequestsUntouched();
    await testShellSurvivesActivate();
    testCacheNameStillRewritable();
    console.log('test-sw-offline-shell: ok');
})().catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
});
