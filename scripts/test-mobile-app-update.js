#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const api = require(path.join(root, 'js', 'core', 'mobile-app-update.js'));

assert.strictEqual(api.MANIFEST_PATH, 'releases/latest.json');
assert.ok(api.storageMediaUrl('releases/latest.json').indexOf('releases%2Flatest.json') > 0);
assert.ok(api.storageMediaUrl('releases/latest.json').indexOf('alt=media') > 0);

const older = { versionCode: 11, versionName: '1.4.0', apkUrl: 'https://example.com/a.apk' };
assert.strictEqual(api.shouldOffer(10, older), true);
assert.strictEqual(api.shouldOffer(11, older), false);
assert.strictEqual(api.shouldOffer(12, older), false);
assert.strictEqual(api.shouldOffer(10, { versionCode: 99, apkUrl: '' }), false);

const parsed = api.parseManifest(JSON.stringify({
    versionCode: 12,
    versionName: '1.4.1',
    apkPath: 'releases/building-safety.apk',
    notes: '사진 수정'
}));
assert.strictEqual(parsed.versionCode, 12);
assert.ok(parsed.apkUrl.indexOf('releases%2Fbuilding-safety.apk') > 0);
assert.strictEqual(parsed.notes, '사진 수정');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(html.includes('js/core/mobile-app-update.js'));
const electron = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
assert.ok(electron.includes('BrowserWindow'));
assert.ok(electron.includes('dongil2010.github.io/building-safety-app'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.strictEqual(pkg.scripts.electron, 'electron electron/main.js');

console.log('test-mobile-app-update: ok');
