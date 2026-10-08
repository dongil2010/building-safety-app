#!/usr/bin/env node
'use strict';

/**
 * 만든 APK와 releases/latest.json 을 Firebase Storage에 올린다.
 * 로그인 토큰은 이 PC에만 둔다 (.firebase-ci-token 또는 firebase login).
 * 프로젝트 소유 계정으로 Google Cloud Storage API를 쓰므로 보안 규칙의 파일 종류 제한을 타지 않는다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const lib = require('./mobile-release-lib');
const updateApi = require('../js/core/mobile-app-update.js');

const ROOT = path.join(__dirname, '..');
const APK_PATH = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const BUCKET = updateApi.BUCKET;

// Firebase CLI가 공개로 쓰는 설치형 앱 OAuth 클라이언트. 사용자 비밀이 아니다.
const FIREBASE_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function fail(message) {
    console.error(message);
    process.exit(1);
}

function readRefreshToken() {
    if (process.env.FIREBASE_TOKEN && process.env.FIREBASE_TOKEN.trim()) {
        return process.env.FIREBASE_TOKEN.trim();
    }
    const tokenFile = path.join(ROOT, '.firebase-ci-token');
    if (fs.existsSync(tokenFile)) {
        const text = fs.readFileSync(tokenFile, 'utf8').trim();
        if (text) return text;
    }
    const storePath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(storePath)) return '';
    try {
        const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
        const tokens = store.tokens || (store.user && store.user.tokens) || null;
        if (tokens && tokens.refresh_token) return String(tokens.refresh_token);
    } catch (_e) { /* 빈 설정 */ }
    return '';
}

async function tokenFromRefresh(refreshToken) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: FIREBASE_CLIENT_ID,
        client_secret: FIREBASE_CLIENT_SECRET
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
        fail('로그인 토큰이 오래되었습니다. 이 PC에서 다시 실행하세요: npx firebase-tools login');
    }
    return json.access_token;
}

async function tokenFromServiceAccount(keyPath) {
    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    if (!key.client_email || !key.private_key) return '';
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const claim = Buffer.from(JSON.stringify({
        iss: key.client_email,
        scope: 'https://www.googleapis.com/auth/devstorage.read_write',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    })).toString('base64url');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(header + '.' + claim);
    const jwt = header + '.' + claim + '.' + signer.sign(key.private_key).toString('base64url');
    const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
        fail('서비스 계정으로 Storage 토큰을 받지 못했습니다.');
    }
    return json.access_token;
}

async function accessToken() {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        || path.join(ROOT, 'scripts', 'ota-publisher.json');
    if (fs.existsSync(keyPath)) {
        try {
            const raw = fs.readFileSync(keyPath, 'utf8');
            if (raw.indexOf('private_key') > 0) return await tokenFromServiceAccount(keyPath);
        } catch (_e) { /* 다른 종류의 인증 파일 */ }
    }
    const refresh = readRefreshToken();
    if (!refresh) {
        fail([
            'Storage에 올리려면 이 PC에서 한 번 로그인해야 합니다.',
            'npx firebase-tools login',
            '로그인한 뒤 npm run android:upload'
        ].join('\n'));
    }
    return tokenFromRefresh(refresh);
}

async function uploadObject(token, objectName, body, contentType) {
    const url = 'https://storage.googleapis.com/upload/storage/v1/b/'
        + encodeURIComponent(BUCKET)
        + '/o?uploadType=media&name=' + encodeURIComponent(objectName);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': contentType
        },
        body
    });
    if (!res.ok) {
        const text = await res.text();
        fail(objectName + ' 올리기 실패 (' + res.status + ')\n' + text.slice(0, 500));
    }
}

async function main() {
    if (!fs.existsSync(APK_PATH)) {
        fail('APK가 없습니다. 먼저 npm run android:build:debug 를 실행하세요.\n' + APK_PATH);
    }
    const build = lib.readWebBuild(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));
    if (!build) fail('app.js 에서 앱 번호를 읽지 못했습니다.');
    const notes = process.env.BSA_RELEASE_NOTES || '';
    const manifest = lib.manifestFor(build, notes);
    const token = await accessToken();
    console.log('Storage에 올리는 중: ' + lib.APK_OBJECT + ' (앱 번호 ' + build.versionCode + ')');
    await uploadObject(token, lib.APK_OBJECT, fs.readFileSync(APK_PATH), 'application/vnd.android.package-archive');
    await uploadObject(token, lib.MANIFEST_OBJECT, Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'), 'application/json');
    console.log('올렸습니다. 폰 앱을 다시 열면 번호 ' + build.versionCode + ' (' + build.versionName + ') 를 받습니다.');
}

if (require.main === module) {
    main().catch((err) => fail(err && err.message ? err.message : String(err)));
}
