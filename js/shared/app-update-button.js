/**
 * 「업데이트 받기」 버튼 (2026-10-12)
 *
 * - 웹 코드: web-version.json(캐시 안 씀)과 window.BSA_APP_VERSION 비교 → 새 것이면
 *   기기 저장을 마치고(못 올린 변경은 기기에 남는다고 알림) 서비스 워커 갱신·옛 코드 캐시 삭제·새로고침.
 *   IndexedDB·localStorage(작업·오프라인 준비 데이터)는 건드리지 않는다. 지우는 건 Cache Storage의 코드 캐시뿐.
 * - 안드로이드(앱 웹뷰·안드로이드 브라우저): Storage releases/latest.json 의 versionCode가
 *   설치본보다 크면 APK 받기(js/core/mobile-app-update.js).
 * - 새 버전이 자동으로 확인되면 버튼에 점(배지)을 띄운다.
 */
(function (root) {
    'use strict';

    var CODE_CACHE_PREFIX = 'building-safety-v';   // sw.js CACHE_NAME — 배포마다 바뀌는 코드 캐시
    var state = { web: false, apk: false };

    function syncMerge() { return root.BSA && root.BSA.syncMerge; }
    function apkApi() { return root.BSA && root.BSA.mobileAppUpdate; }
    function hooks() { return root.BSA_appUpdateHooks || {}; }

    /** 배포본이 지금 코드보다 새로운가(동기화 차단과 같은 기준). 판단 못 하면 false */
    function isWebNewer(running, meta, host) {
        var api = syncMerge();
        if (api && typeof api.isOutdatedBuild === 'function') return !!api.isOutdatedBuild(running, meta, host);
        return false;
    }

    function shortOf(meta) {
        if (!meta) return '';
        return String(meta.short || (meta.sha ? String(meta.sha).slice(0, 7) : '') || meta.label || '').trim();
    }

    /** 지울 캐시: 지금 쓰는 것 빼고 옛 코드 캐시만(셸·다른 캐시는 둔다) */
    function cachesToDelete(keys, keepName) {
        return (keys || []).filter(function (k) {
            return typeof k === 'string' && k.indexOf(CODE_CACHE_PREFIX) === 0 && k !== keepName;
        });
    }

    function setBadge(kind, on) {
        state[kind] = !!on;
        var any = state.web || state.apk;
        var list = root.document ? root.document.querySelectorAll('[data-app-update-btn]') : [];
        Array.prototype.forEach.call(list, function (btn) {
            btn.classList.toggle('has-update', any);
            var dot = btn.querySelector('.app-update-dot');
            if (dot) dot.hidden = !any;
            btn.title = any
                ? (state.apk ? '새 앱 버전이 있습니다 — 눌러서 받기' : '새 버전이 배포됐습니다 — 눌러서 업데이트')
                : '최신 버전 확인·업데이트 받기';
        });
    }

    async function fetchWebMeta(fetchFn) {
        var f = fetchFn || root.fetch;
        var r = await f('web-version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!r || !r.ok) return null;
        var text = String(await r.text()).replace(/^\uFEFF/, '').trim();
        return text ? JSON.parse(text) : null;
    }

    function alertMsg(msg) {
        if (typeof root.appAlert === 'function') return root.appAlert(msg, { title: '업데이트' });
        root.alert(msg);
        return Promise.resolve();
    }
    function confirmMsg(msg, okText) {
        if (typeof root.appConfirm === 'function') return root.appConfirm(msg, { title: '업데이트', okText: okText || '업데이트', cancelText: '나중에' });
        return Promise.resolve(root.confirm(msg));
    }

    function withTimeout(p, ms) {
        return Promise.race([Promise.resolve(p).catch(function () { return null; }), new Promise(function (res) { setTimeout(res, ms); })]);
    }

    /** 서비스 워커 갱신 + 옛 코드 캐시 삭제. 실패해도 새로고침은 한다 */
    async function refreshServiceWorkerAndCaches() {
        var nav = root.navigator;
        if (nav && nav.serviceWorker && typeof nav.serviceWorker.getRegistration === 'function') {
            try {
                var reg = await nav.serviceWorker.getRegistration();
                if (reg) {
                    await withTimeout(reg.update(), 8000);
                    var w = reg.waiting || reg.installing;
                    if (w && reg.installing && !reg.waiting) {
                        await withTimeout(new Promise(function (res) {
                            reg.installing.addEventListener('statechange', function () {
                                if (reg.waiting || (reg.installing == null)) res();
                            });
                        }), 8000);
                    }
                    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            } catch (_e) { /* 그냥 새로고침 */ }
        }
        if (root.caches && typeof root.caches.keys === 'function') {
            try {
                var keys = await root.caches.keys();
                await Promise.all(cachesToDelete(keys, null).map(function (k) { return root.caches.delete(k); }));
            } catch (_e) { /* ignore */ }
        }
    }

    async function runWebUpdate(meta) {
        var h = hooks();
        // 1) 기기 저장부터(사진 줄이기·저장 중인 것 마무리)
        if (typeof h.flushLocal === 'function') { try { await withTimeout(h.flushLocal(), 8000); } catch (_e) { /* ignore */ } }
        // 2) 서버에 아직 못 올린 것 — 옛 코드는 업로드가 막혀 있으므로 기기에 그대로 두고 새 버전이 올린다
        var pending = typeof h.pendingCount === 'function' ? (Number(h.pendingCount()) || 0) : 0;
        if (pending > 0) {
            var go = await confirmMsg('아직 서버에 올라가지 않은 변경이 ' + pending + '곳 있습니다.\n'
                + '이 기기에 그대로 저장돼 있고, 업데이트 후 자동으로 올라갑니다.\n\n지금 업데이트할까요?', '업데이트');
            if (!go) return { ok: false, reason: 'pending-declined' };
        }
        await refreshServiceWorkerAndCaches();
        if (typeof root.reloadWebAppFromServer === 'function') root.reloadWebAppFromServer();
        else root.location.reload();
        return { ok: true, to: shortOf(meta) };
    }

    var _busy = false;
    async function onUpdateButton() {
        if (_busy) return { busy: true };
        _busy = true;
        try {
            if (root.navigator && root.navigator.onLine === false) {
                await alertMsg('인터넷에 연결되지 않아 새 버전을 확인할 수 없습니다. 연결한 뒤 다시 눌러 주세요.');
                return { offline: true };
            }
            var running = String(root.BSA_APP_VERSION || '').trim();
            var host = root.location ? root.location.hostname : '';
            var apk = apkApi();
            var results = await Promise.all([
                fetchWebMeta().catch(function () { return undefined; }),
                (apk && apk.isAndroidDevice && apk.isAndroidDevice()) ? apk.checkStatus().catch(function () { return { android: true, error: 'offline' }; }) : Promise.resolve({ android: false })
            ]);
            var meta = results[0];
            var apkStatus = results[1] || { android: false };
            if (meta === undefined && (!apkStatus.android || apkStatus.error)) {
                await alertMsg('서버에 연결하지 못해 확인할 수 없습니다. 인터넷을 확인하고 다시 눌러 주세요.');
                return { offline: true };
            }
            var webNewer = !!meta && isWebNewer(running, meta, host);
            setBadge('web', webNewer);
            setBadge('apk', !!apkStatus.newer);
            var build = root.BSA_APP_BUILD || {};
            var lines = '화면(웹) 버전: 지금 ' + (running || '—') + ' / 최신 ' + (shortOf(meta) || '—');
            if (apkStatus.android && !apkStatus.error) {
                lines += '\n앱(APK) 버전: 지금 ' + (apkStatus.installed || build.versionCode || '—')
                    + ' / 최신 ' + (apkStatus.manifest.versionCode || '—')
                    + (apkStatus.manifest.versionName ? ' (' + apkStatus.manifest.versionName + ')' : '');
            }
            if (apkStatus.newer) {
                var msg = '새 앱 버전이 있습니다.\n\n' + lines
                    + (apkStatus.manifest.notes ? '\n\n' + apkStatus.manifest.notes : '')
                    + '\n\nAPK를 받을까요? 받은 뒤 설치 화면이 열립니다. 작업 데이터는 그대로 남습니다.';
                if (await confirmMsg(msg, 'APK 받기')) {
                    var r = await apk.downloadApk(apkStatus.manifest);
                    if (!r.ok && typeof root.showToast === 'function') root.showToast('앱을 받지 못했습니다. 인터넷을 확인하고 다시 눌러 주세요.', 'error', 5000);
                    return { apk: r };
                }
                if (!webNewer) return { apk: { declined: true } };
            }
            if (webNewer) {
                if (!(await confirmMsg('새 버전이 배포됐습니다.\n\n' + lines + '\n\n지금 업데이트할까요? 작업 데이터·오프라인 준비 자료는 그대로 남습니다.', '업데이트'))) {
                    return { web: { declined: true } };
                }
                return { web: await runWebUpdate(meta) };
            }
            await alertMsg('이미 최신 버전입니다.\n\n' + lines);
            return { latest: true };
        } finally {
            _busy = false;
        }
    }

    /** 켜질 때·창으로 돌아올 때 조용히 확인해 배지만 갱신 */
    async function quietCheck() {
        if (root.navigator && root.navigator.onLine === false) return;
        try {
            var meta = await fetchWebMeta();
            if (meta) setBadge('web', isWebNewer(String(root.BSA_APP_VERSION || ''), meta, root.location.hostname));
        } catch (_e) { /* ignore */ }
        var apk = apkApi();
        if (apk && apk.isAndroidDevice && apk.isAndroidDevice()) {
            try { var s = await apk.checkStatus(); if (s && !s.error) setBadge('apk', !!s.newer); } catch (_e) { /* ignore */ }
        }
    }

    var api = {
        CODE_CACHE_PREFIX: CODE_CACHE_PREFIX,
        isWebNewer: isWebNewer,
        cachesToDelete: cachesToDelete,
        shortOf: shortOf,
        setBadge: setBadge,
        onUpdateButton: onUpdateButton,
        runWebUpdate: runWebUpdate,
        quietCheck: quietCheck,
        _state: state
    };
    root.BSA = root.BSA || {};
    root.BSA.appUpdateButton = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined' && document.addEventListener) {
        var bind = function () {
            Array.prototype.forEach.call(document.querySelectorAll('[data-app-update-btn]'), function (btn) {
                btn.addEventListener('click', function () { onUpdateButton(); });
            });
            setTimeout(quietCheck, 6000);
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'visible') quietCheck();
            });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    }
})(typeof window !== 'undefined' ? window : globalThis);
