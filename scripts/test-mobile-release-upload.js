#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const lib = require('./mobile-release-lib');
const updateApi = require('../js/core/mobile-app-update.js');

const next = lib.nextBuild(10, '1.3.2');
assert.strictEqual(next.versionCode, 11);
assert.strictEqual(next.versionName, '1.3.3');

const sample = "window.BSA_APP_BUILD = { versionCode: 10, versionName: '1.3.2' };";
const read = lib.readWebBuild(sample);
assert.strictEqual(read.versionCode, 10);
assert.strictEqual(read.versionName, '1.3.2');
assert.strictEqual(lib.formatWebBuild(next), "window.BSA_APP_BUILD = { versionCode: 11, versionName: '1.3.3' }");

const manifest = lib.manifestFor(next, '현장 반영');
assert.strictEqual(manifest.apkPath, 'releases/building-safety.apk');
const parsed = updateApi.parseManifest(JSON.stringify(manifest));
assert.strictEqual(parsed.versionCode, 11);
assert.ok(parsed.apkUrl.indexOf('releases%2Fbuilding-safety.apk') > 0);
assert.strictEqual(updateApi.shouldOffer(10, parsed), true);
assert.strictEqual(updateApi.shouldOffer(11, parsed), false);

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.ok(pkg.scripts['android:build:debug'].indexOf('bump-mobile-version.js') > 0);
assert.ok(pkg.scripts['android:build:debug'].indexOf('upload-mobile-release.js') > 0);
assert.strictEqual(pkg.scripts['android:upload'], 'node scripts/upload-mobile-release.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(lib.readWebBuild(app), 'app.js 에 앱 번호가 있다');

console.log('test-mobile-release-upload: ok');
