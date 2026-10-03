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

    async function fetchManifest() {
        var res = await fetch(storageMediaUrl(MANIFEST_PATH) + '&t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        return parseManifest(await res.text());
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
