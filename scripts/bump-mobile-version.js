#!/usr/bin/env node
'use strict';

/** app.js 앱 번호를 1 올린다. APK를 만들기 직전에 호출한다. */
const fs = require('fs');
const path = require('path');
const lib = require('./mobile-release-lib');

const appPath = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');
const current = lib.readWebBuild(src);
if (!current) {
    console.error('app.js 에서 window.BSA_APP_BUILD 를 찾지 못했습니다.');
    process.exit(1);
}
const next = lib.nextBuild(current.versionCode, current.versionName);
const updated = src.replace(lib.BUILD_RE, lib.formatWebBuild(next));
if (updated === src) {
    console.error('앱 번호를 바꾸지 못했습니다.');
    process.exit(1);
}
fs.writeFileSync(appPath, updated);
console.log('앱 번호 ' + current.versionCode + ' (' + current.versionName + ') -> ' + next.versionCode + ' (' + next.versionName + ')');
