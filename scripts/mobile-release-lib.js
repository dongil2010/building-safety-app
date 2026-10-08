'use strict';

/** 앱 번호(app.js)와 Storage releases/ 매니페스트를 맞추는 순수 함수. */

const APK_OBJECT = 'releases/building-safety.apk';
const MANIFEST_OBJECT = 'releases/latest.json';
const BUILD_RE = /window\.BSA_APP_BUILD\s*=\s*\{\s*versionCode:\s*(\d+)\s*,\s*versionName:\s*'([^']+)'\s*\}/;

function readWebBuild(text) {
    const m = String(text || '').match(BUILD_RE);
    if (!m) return null;
    return { versionCode: Number(m[1]), versionName: m[2] };
}

function formatWebBuild(build) {
    return "window.BSA_APP_BUILD = { versionCode: " + build.versionCode + ", versionName: '" + build.versionName + "' }";
}

function nextBuild(versionCode, versionName) {
    const code = (Number(versionCode) || 0) + 1;
    const parts = String(versionName || '').split('.').map((n) => parseInt(n, 10));
    if (!parts.length || parts.some((n) => !isFinite(n))) {
        return { versionCode: code, versionName: String(versionName || '') };
    }
    while (parts.length < 3) parts.push(0);
    parts[parts.length - 1] += 1;
    return { versionCode: code, versionName: parts.join('.') };
}

function manifestFor(build, notes) {
    return {
        versionCode: build.versionCode,
        versionName: build.versionName,
        apkPath: APK_OBJECT,
        notes: notes == null ? '' : String(notes)
    };
}

module.exports = {
    APK_OBJECT,
    MANIFEST_OBJECT,
    BUILD_RE,
    readWebBuild,
    formatWebBuild,
    nextBuild,
    manifestFor
};
