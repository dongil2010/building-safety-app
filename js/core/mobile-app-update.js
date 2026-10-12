/**
 * 폰·태블릿 앱 업데이트 — Firebase Storage releases/latest.json
 *
 * 네이티브 앱이 켜질 때 매니페스트를 읽고, 설치된 versionCode보다 크면
 * APK를 받아 설치 화면을 연다. 웹(브라우저)과 PC(Electron)는 이 경로를 타지 않는다.
 *
 * Storage 경로 (읽기는 로그인 없이 가능, storage.rules releases/):
 *   releases/latest.json
 *   { versionCode, versionName, apkUrl, notes }
 *   apkUrl 은 같은 버킷의 APK 주소 (releases/….apk)
 */
(function (root) {
    'use strict';

    var BUCKET = 'building-safety-app-46821.firebasestorage.app';
    var MANIFEST_PATH = 'releases/latest.json';

    function storageMediaUrl(objectPath) {
        return 'https://firebasestorage.googleapis.com/v0/b/'
            + encodeURIComponent(BUCKET)
            + '/o/'
            + encodeURIComponent(objectPath)
            + '?alt=media';
    }

    function isNativeAndroid() {
        try {
            return !!(root.Capacitor
                && typeof root.Capacitor.isNativePlatform === 'function'
                && root.Capacitor.isNativePlatform()
                && String((root.Capacitor.getPlatform && root.Capacitor.getPlatform()) || '').toLowerCase() === 'android');
        } catch (_e) {
            return false;
        }
    }

    function updatePlugin() {
        var cap = root.Capacitor;
        var plugins = cap && cap.Plugins;
        return plugins && plugins.AppUpdate ? plugins.AppUpdate : null;
    }

    function parseManifest(text) {
        var obj = JSON.parse(String(text || '').replace(/^\uFEFF/, '').trim() || '{}');
        var code = Number(obj.versionCode);
        var name = obj.versionName == null ? '' : String(obj.versionName).trim();
        var apkUrl = obj.apkUrl == null ? '' : String(obj.apkUrl).trim();
        if (!apkUrl && obj.apkPath) apkUrl = storageMediaUrl(String(obj.apkPath).replace(/^\/+/, ''));
        return {
            versionCode: isFinite(code) ? code : 0,
            versionName: name,
            apkUrl: apkUrl,
            notes: obj.notes == null ? '' : String(obj.notes).trim()
        };
    }

    function shouldOffer(installedCode, manifest) {
        var have = Number(installedCode) || 0;
        var next = Number(manifest && manifest.versionCode) || 0;
        if (!manifest || !manifest.apkUrl) return false;
        return next > have;
    }

    // Storage 버킷에 CORS 설정이 없어 웹 페이지(github.io)에서 바로 읽으면 막힌다 → 막히면 사진과 같은 Worker 프록시로 읽는다
    var PROXY_ENDPOINT = 'https://frosty-king-12ef.dongilgujo2010.workers.dev';

    async function fetchManifest() {
        var url = storageMediaUrl(MANIFEST_PATH);
        try {
            var res = await fetch(url + '&t=' + Date.now(), { cache: 'no-store' });
            if (res.ok) return parseManifest(await res.text());
            if (res.status === 404) return null;
        } catch (_e) { /* CORS·네트워크 — 프록시로 */ }
        var px = await fetch(PROXY_ENDPOINT, {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'proxyStorage', url: url })
        });
        if (!px.ok) return null;
        return parseManifest(await px.text());
    }

    async function installedVersion(plugin) {
        if (plugin && typeof plugin.getVersion === 'function') {
            try {
                var info = await plugin.getVersion();
                if (info && info.versionCode != null) return Number(info.versionCode) || 0;
            } catch (_e) { /* 껍데기 번호로 폴백 */ }
        }
        var build = root.BSA_APP_BUILD;
        return Number(build && build.versionCode) || 0;
    }

    /** 안드로이드 기기인가(앱 웹뷰 또는 안드로이드 브라우저) — APK 받기는 여기서만 보인다 */
    function isAndroidDevice() {
        if (isNativeAndroid()) return true;
        try { return /Android/i.test(String((root.navigator && root.navigator.userAgent) || '')); } catch (_e) { return false; }
    }

    /** 버튼용: 설치본·최신본 번호와 더 새 것이 있는지. 오프라인·매니페스트 없음이면 error */
    async function checkStatus() {
        if (!isAndroidDevice()) return { android: false };
        var plugin = updatePlugin();
        var manifest;
        try { manifest = await fetchManifest(); } catch (_e) { return { android: true, error: 'offline' }; }
        if (!manifest) return { android: true, error: 'no-manifest' };
        var installed = await installedVersion(plugin);
        return { android: true, installed: installed, manifest: manifest, newer: shouldOffer(installed, manifest) };
    }

    /** APK 받기 — 앱이면 내장 설치 도구, 아니면(브라우저·옛 앱) 다운로드 주소를 바깥 창으로 연다 */
    async function downloadApk(manifest) {
        if (!manifest || !manifest.apkUrl) return { ok: false, error: 'no-url' };
        var plugin = updatePlugin();
        if (isNativeAndroid() && plugin && typeof plugin.downloadAndInstall === 'function') {
            try {
                await plugin.downloadAndInstall({ url: manifest.apkUrl });
                return { ok: true, via: 'plugin' };
            } catch (e) {
                var msg = (e && (e.message || e.errorMessage)) || String(e || '');
                if (/NEED_INSTALL_PERMISSION/.test(msg) && typeof plugin.openUnknownSourcesSettings === 'function') {
                    await ask('이 앱을 설치하려면 설정에서 “알 수 없는 앱 설치”를 허용해야 합니다. 설정 화면을 열까요?');
                    try { await plugin.openUnknownSourcesSettings(); } catch (_e2) { /* ignore */ }
                }
                return { ok: false, error: msg };
            }
        }
        var w = null;
        try { w = root.open(manifest.apkUrl, '_system'); } catch (_e) { w = null; }
        if (!w) {
            try { root.location.href = manifest.apkUrl; } catch (_e) { return { ok: false, error: 'open-failed' }; }
        }
        return { ok: true, via: 'browser' };
    }

    async function ask(message) {
        if (typeof root.appConfirm === 'function') {
            return !!(await root.appConfirm(message, { title: '앱 업데이트', okText: '받기', cancelText: '나중에' }));
        }
        return root.confirm(message);
    }

    async function checkAndOffer() {
        if (!isNativeAndroid()) return { skipped: 'not-android' };
        var plugin = updatePlugin();
        if (!plugin || typeof plugin.downloadAndInstall !== 'function') return { skipped: 'no-plugin' };
        var manifest;
        try {
            manifest = await fetchManifest();
        } catch (_e) {
            return { skipped: 'offline' };
        }
        if (!manifest) return { skipped: 'no-manifest' };
        var installed = await installedVersion(plugin);
        if (!shouldOffer(installed, manifest)) return { skipped: 'current', installed: installed, manifest: manifest };
        var lines = '새 앱 버전 ' + (manifest.versionName || manifest.versionCode) + ' 이 있습니다.';
        if (manifest.notes) lines += '\n\n' + manifest.notes;
        lines += '\n\n지금 받을까요? 받은 뒤 설치 화면이 열립니다.';
        var yes = await ask(lines);
        if (!yes) return { skipped: 'declined', manifest: manifest };
        try {
            await plugin.downloadAndInstall({ url: manifest.apkUrl });
            return { ok: true, manifest: manifest };
        } catch (e) {
            var msg = (e && (e.message || e.errorMessage)) || String(e || '');
            if (/NEED_INSTALL_PERMISSION/.test(msg) && typeof plugin.openUnknownSourcesSettings === 'function') {
                await ask('이 앱을 설치하려면 설정에서 “알 수 없는 앱 설치”를 허용해야 합니다. 설정 화면을 열까요?');
                try { await plugin.openUnknownSourcesSettings(); } catch (_e2) { /* ignore */ }
            } else if (typeof root.showToast === 'function') {
                root.showToast('앱을 받지 못했습니다. 인터넷을 확인하고 다시 열어 주세요.', 'error', 5000);
            }
            return { ok: false, error: msg };
        }
    }

    var api = {
        BUCKET: BUCKET,
        MANIFEST_PATH: MANIFEST_PATH,
        storageMediaUrl: storageMediaUrl,
        parseManifest: parseManifest,
        shouldOffer: shouldOffer,
        isAndroidDevice: isAndroidDevice,
        checkStatus: checkStatus,
        downloadApk: downloadApk,
        checkAndOffer: checkAndOffer
    };

    root.BSA = root.BSA || {};
    root.BSA.mobileAppUpdate = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    if (typeof document !== 'undefined') {
        var start = function () {
            setTimeout(function () { checkAndOffer(); }, 2500);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    }
})(typeof window !== 'undefined' ? window : globalThis);
