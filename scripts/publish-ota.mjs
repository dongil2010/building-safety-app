#!/usr/bin/env node
/**
 * APK를 Firebase Storage에 올리고 Firestore app_meta/android_release 를 갱신한다.
 * firebase-tools 로그인(refresh token)을 사용한다.
 *
 * 사용: node scripts/publish-ota.mjs
 *       node scripts/publish-ota.mjs --apk path\to\app-debug.apk --notes "변경 요약"
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT_ID = 'building-safety-app-46821';
const BUCKETS = [
    'building-safety-app-46821.firebasestorage.app',
    'building-safety-app-46821.appspot.com'
];
const FIREBASE_OAUTH_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5k2qlo1uycec.apps.googleusercontent.com';
const FIREBASE_OAUTH_CLIENT_SECRET = 'jEQC9Oh5ZT4s4kYhA6zBEqP9';

function argValue(flag) {
    const i = process.argv.indexOf(flag);
    if (i < 0) return null;
    return process.argv[i + 1] || null;
}

function readVersion() {
    const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
    const code = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1] || 0);
    const name = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || String(code);
    return { versionCode: code, versionName: name };
}

function findApk(explicit) {
    if (explicit) {
        const abs = path.resolve(explicit);
        if (!fs.existsSync(abs)) throw new Error('APK 없음: ' + abs);
        return abs;
    }
    const def = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    if (!fs.existsSync(def)) throw new Error('APK가 없습니다. 먼저 npm run android:build:debug 를 실행하세요.');
    return def;
}

function loadFirebaseRefreshToken() {
    const envToken = process.env.FIREBASE_TOKEN || process.env.FIREBASE_REFRESH_TOKEN;
    if (envToken) return envToken.trim();

    const tokenFile = path.join(ROOT, '.firebase-ci-token');
    if (fs.existsSync(tokenFile)) {
        const t = fs.readFileSync(tokenFile, 'utf8').trim();
        if (t) return t;
    }

    const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(p)) {
        throw new Error(loginHelp());
    }
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const token =
        cfg?.tokens?.refresh_token ||
        cfg?.tokens?.tokens?.refresh_token ||
        cfg?.refresh_token;
    if (!token) throw new Error(loginHelp());
    return token;
}

function loginHelp() {
    return [
        'Firebase 로그인이 필요합니다. 로컬 터미널에서 한 번만 실행하세요:',
        '  npx firebase-tools login',
        '또는 CI 토큰:',
        '  npx firebase-tools login:ci',
        '토큰을 프로젝트 루트 .firebase-ci-token 파일에 저장하거나 FIREBASE_TOKEN 환경변수로 넣으면 이후 git-sync OTA가 자동 배포됩니다.'
    ].join('\n');
}

async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: FIREBASE_OAUTH_CLIENT_ID,
        client_secret: FIREBASE_OAUTH_CLIENT_SECRET
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const json = await res.json();
    if (!res.ok || !json.access_token) {
        throw new Error('OAuth 토큰 갱신 실패: ' + JSON.stringify({ status: res.status, error: json.error }));
    }
    return json.access_token;
}

async function uploadApk(accessToken, apkPath, objectName) {
    const buf = fs.readFileSync(apkPath);
    const downloadToken = crypto.randomUUID();
    let lastErr = null;
    for (const bucket of BUCKETS) {
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(objectName)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/vnd.android.package-archive',
                'x-goog-meta-firebaseStorageDownloadTokens': downloadToken
            },
            body: buf
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
            const token = json.downloadTokens || downloadToken;
            const apkUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media&token=${token}`;
            return { bucket, apkUrl, token };
        }
        lastErr = `bucket ${bucket} HTTP ${res.status} ${JSON.stringify(json)}`;
    }
    throw new Error('APK 업로드 실패: ' + lastErr);
}

async function writeReleaseMeta(accessToken, meta) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/app_meta/android_release`;
    const body = {
        fields: {
            versionCode: { integerValue: String(meta.versionCode) },
            versionName: { stringValue: String(meta.versionName) },
            apkUrl: { stringValue: String(meta.apkUrl) },
            notes: { stringValue: String(meta.notes || '') },
            mandatory: { booleanValue: false },
            publishedAt: { timestampValue: new Date().toISOString() },
            publishedBy: { stringValue: 'git-sync-ota' }
        }
    };
    const res = await fetch(url + '?currentDocument.exists=false', {
        method: 'PATCH',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (res.status === 409 || res.ok === false) {
        const retry = await fetch(url, {
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const json = await retry.json().catch(() => ({}));
        if (!retry.ok) throw new Error('Firestore 메타 기록 실패: ' + JSON.stringify(json));
        return json;
    }
    return res.json();
}

async function createRuleset(accessToken, fileName, content) {
    const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/rulesets`, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            source: { files: [{ name: fileName, content }] }
        })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(fileName + ' ruleset 생성 실패: ' + JSON.stringify(json));
    return json.name;
}

async function setRelease(accessToken, releaseName, rulesetName) {
    const url = `https://firebaserules.googleapis.com/v1/${releaseName}?updateMask=rulesetName`;
    const payload = { name: releaseName, rulesetName };
    let res = await fetch(url, {
        method: 'PATCH',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (res.status === 404) {
        res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT_ID}/releases`, {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: releaseName, rulesetName })
        });
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('rules release 실패 (' + releaseName + '): ' + JSON.stringify(json));
}

async function deployRules(accessToken, bucket) {
    const firestoreRules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const storageRules = fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8');
    const fsName = await createRuleset(accessToken, 'firestore.rules', firestoreRules);
    await setRelease(accessToken, `projects/${PROJECT_ID}/releases/cloud.firestore`, fsName);
    const stName = await createRuleset(accessToken, 'storage.rules', storageRules);
    await setRelease(accessToken, `projects/${PROJECT_ID}/releases/firebase.storage/${bucket}`, stName);
}

async function main() {
    const { versionCode, versionName } = readVersion();
    if (!versionCode) throw new Error('android/app/build.gradle 에서 versionCode를 읽지 못했습니다.');
    const apkPath = findApk(argValue('--apk'));
    const notes = argValue('--notes') || `v${versionName} (code ${versionCode}) git-sync OTA`;
    const skipRules = process.argv.includes('--skip-rules');

    console.log(`[OTA] APK: ${apkPath}`);
    console.log(`[OTA] versionName=${versionName} versionCode=${versionCode}`);

    const accessToken = await refreshAccessToken(loadFirebaseRefreshToken());
    const objectName = `releases/android-${versionCode}.apk`;
    const uploaded = await uploadApk(accessToken, apkPath, objectName);
    console.log(`[OTA] uploaded → ${uploaded.bucket}/${objectName}`);

    await writeReleaseMeta(accessToken, {
        versionCode,
        versionName,
        apkUrl: uploaded.apkUrl,
        notes
    });
    console.log('[OTA] Firestore app_meta/android_release 갱신 완료');

    if (!skipRules) {
        try {
            await deployRules(accessToken, uploaded.bucket);
            console.log('[OTA] Firestore/Storage 규칙 게시 완료');
        } catch (err) {
            console.warn('[OTA] 규칙 게시 실패(APK 메타는 반영됨):', err.message || err);
        }
    }

    console.log('[OTA] 현장 앱이 로그인하면 v' + versionName + ' 을 자동 감지합니다.');
}

main().catch((err) => {
    console.error('[OTA] 실패:', err.message || err);
    process.exit(1);
});
