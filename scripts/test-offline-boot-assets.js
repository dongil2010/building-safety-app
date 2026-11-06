#!/usr/bin/env node
'use strict';
/** 2026-11-06 인터넷 없이 앱이 켜지는 조건: 필수 외부 라이브러리가 APK 묶음 대상이고, 저장 사본이 없으면 그걸 쓴다 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { listCdnUrls, HOSTS } = require('./bundle-cdn-assets.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const java = fs.readFileSync(path.join(root, 'android/app/src/main/java/kr/buildingsafety/inspection/OfflineAwareWebViewClient.java'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const urls = listCdnUrls(html);
['firebase-app-compat.js', 'firebase-firestore-compat.js', 'firebase-auth-compat.js', 'firebase-storage-compat.js', 'jszip.min.js', 'font-awesome/6.4.0/css/all.min.css', 'fa-solid-900.woff2']
    .forEach((n) => assert.ok(urls.some((u) => u.includes(n)), '묶음에 포함: ' + n));
assert.ok(!urls.some((u) => /[?#]/.test(u)), '주소에 쿼리 없음(앱이 쿼리를 빼고 찾는다)');

// index.html이 부르는 외부 주소는 묶거나, 앱이 사본을 만들 수 있는 곳이어야 한다
const external = [];
const re = /<(?:script|link)\b[^>]*\b(?:src|href)=["'](https:\/\/[^"']+)["']/gi;
let m;
while ((m = re.exec(html))) external.push(new URL(m[1]));
external.filter((u) => !HOSTS.has(u.hostname)).forEach((u) => {
    assert.ok(java.includes(`host.equals("${u.hostname}")`), '오프라인 사본 대상이 아닌 외부 주소: ' + u.href);
});
HOSTS.forEach((h) => assert.ok(java.includes(`host.equals("${h}")`), '앱이 가로채는 주소: ' + h));

assert.ok(java.includes('"public/_cdn/"'), '저장 사본이 없으면 APK 안 외부 라이브러리를 쓴다');
assert.ok(pkg.scripts['cap:sync'].includes('bundle-cdn-assets.js'), 'APK 빌드 때 함께 묶는다');
assert.ok(java.indexOf('hasCopy ? FAST_CONNECT_MS') > 0, '사본이 있으면 약한 신호에서 오래 기다리지 않는다');
console.log('test-offline-boot-assets: ok');
