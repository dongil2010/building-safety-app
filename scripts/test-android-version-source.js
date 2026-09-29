#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 안드로이드 앱 번호는 웹 앱(app.js window.BSA_APP_BUILD)을 따른다.
 * android/app/build.gradle 이 빌드 때 그 한 줄을 읽으므로 모양이 바뀌면 빌드가 깨진다 — 여기서 미리 잡는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const gradle = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');

// build.gradle 의 정규식과 같은 모양
const m = /window\.BSA_APP_BUILD\s*=\s*\{\s*versionCode:\s*(\d+)\s*,\s*versionName:\s*'([^']+)'/.exec(app);
assert.ok(m, 'app.js 에 window.BSA_APP_BUILD = { versionCode: N, versionName: \'x.y.z\' } 한 줄');
assert.ok(Number(m[1]) >= 9, 'versionCode 는 예전 APK(8)보다 커야 설치 업데이트됨');
assert.ok(/^\d+\.\d+\.\d+$/.test(m[2]), 'versionName x.y.z');
assert.ok(gradle.indexOf("rootProject.file('../app.js')") >= 0, 'gradle 이 app.js 를 읽음');
assert.ok(/versionCode webAppBuild\.code/.test(gradle) && /versionName webAppBuild\.name/.test(gradle), 'gradle 번호는 웹에서');
assert.ok(!/versionCode\s+\d+/.test(gradle) && !/versionName\s+"/.test(gradle), 'gradle 에 숫자 직접 적지 않음');
console.log('test-android-version-source: ok (' + m[2] + ' / ' + m[1] + ')');
