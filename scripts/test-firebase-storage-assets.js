#!/usr/bin/env node
'use strict';

const path = require('path');
const assert = require('assert');
const api = require(path.join(__dirname, '..', 'js', 'core', 'firebase-storage-assets.js'));

function testParseDataUrlJpeg() {
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const parsed = api.parseDataUrl('data:image/jpeg;base64,' + payload);
    assert.ok(parsed, 'jpeg dataUrl should parse');
    assert.strictEqual(parsed.contentType, 'image/jpeg');
    assert.strictEqual(parsed.size, 4);
    assert.ok(parsed.blob instanceof Blob);
}

function testParseDataUrlPdf() {
    const payload = Buffer.from('%PDF-1.4 test').toString('base64');
    const parsed = api.parseDataUrl('data:application/pdf;base64,' + payload);
    assert.ok(parsed);
    assert.strictEqual(parsed.contentType, 'application/pdf');
    assert.ok(parsed.size > 0);
}

function testParseDataUrlRejectsHttp() {
    assert.strictEqual(api.parseDataUrl('https://example.com/a.jpg'), null);
    assert.strictEqual(api.parseDataUrl('not-a-data-url'), null);
    assert.strictEqual(api.parseDataUrl(''), null);
}

function testStoragePaths() {
    const company = 'co-1';
    const bldg = 'bldgA';
    const floor = '3F/옥상';
    const scope = { site: '신가 병원', round: '2026년_하반기' };
    const drawing = api.storagePathFloorDrawing(company, bldg, floor, 'image/jpeg', scope);
    assert.strictEqual(drawing, 'companies/co-1/신가_병원/2026년_하반기/floorDrawings/bldgA_3F_옥상.jpg');

    const pdf = api.storagePathFloorDrawingPdf(company, bldg, floor, scope);
    assert.strictEqual(pdf, 'companies/co-1/신가_병원/2026년_하반기/floorDrawingPdfs/bldgA_3F_옥상.pdf');

    const tier = api.storagePathFloorDrawingTier(company, bldg, floor, 8000, 'image/jpeg', scope);
    assert.strictEqual(tier, 'companies/co-1/신가_병원/2026년_하반기/floorDrawingTiers/bldgA_3F_옥상_8000.jpg');

    const photo = api.storagePathPhoto(company, 'def1_0', 'image/jpeg', scope);
    assert.strictEqual(photo, 'companies/co-1/신가_병원/2026년_하반기/photos/def1_0.jpg');

    const fallback = api.storagePathPhoto(company, 'def1_0', 'image/jpeg');
    assert.strictEqual(fallback, 'companies/co-1/unnamed-site/unnamed-round/photos/def1_0.jpg');
}

function testMetaFields() {
    const fields = api.firestoreStorageMetaFields({
        storagePath: 'companies/c/floorDrawings/a.jpg',
        downloadURL: 'https://firebasestorage.googleapis.com/v0/b/x/o/y',
        contentType: 'image/jpeg',
        size: 1234
    });
    assert.strictEqual(fields.backend, 'storage');
    assert.strictEqual(fields.chunked, false);
    assert.strictEqual(fields.chunkStatus, 'ready');
    assert.strictEqual(fields.chunkCount, 0);
    assert.strictEqual(fields.writeId, null);
    assert.ok(!('dataUrl' in fields));
    assert.strictEqual(fields.size, 1234);
}

function testHasStorageMeta() {
    assert.strictEqual(api.hasFirebaseStorageMeta({ backend: 'storage' }), true);
    assert.strictEqual(api.hasFirebaseStorageMeta({ storagePath: 'a/b' }), true);
    assert.strictEqual(api.hasFirebaseStorageMeta({ downloadURL: 'https://x.example/y' }), true);
    assert.strictEqual(api.hasFirebaseStorageMeta({ dataUrl: 'data:image/jpeg;base64,aaa' }), false);
    assert.strictEqual(api.hasFirebaseStorageMeta(null), false);
}

function testDownloadUrlPath() {
    const url = 'https://firebasestorage.googleapis.com/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fco%2FfloorDrawings%2Fa.jpg?alt=media&token=abc';
    assert.strictEqual(api.storagePathFromDownloadURL(url), 'companies/co/floorDrawings/a.jpg');
    assert.strictEqual(api.isFirebaseStorageHttpUrl(url), true);
    assert.strictEqual(api.isFirebaseStorageHttpUrl('https://example.com/x'), false);
    const appHost = 'https://building-safety-app-46821.firebasestorage.app/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fco%2Fa.jpg?alt=media';
    assert.strictEqual(api.isFirebaseStorageHttpUrl(appHost), true);
    assert.strictEqual(api.storagePathFromDownloadURL(appHost), 'companies/co/a.jpg');
}

function testFirebaseStorageAuthHeaders() {
    const h = api.firebaseStorageAuthHeaders('id-token-value');
    assert.strictEqual(h.Authorization, 'Firebase id-token-value');
    assert.ok(h.Authorization.indexOf('Bearer') === -1);
    assert.strictEqual(h['X-Firebase-Storage-Version'], 'webjs/9.22.0');
    const empty = api.firebaseStorageAuthHeaders('');
    assert.ok(!empty.Authorization);
}

function testFirebaseStorageRestMediaUrl() {
    const u = api.firebaseStorageRestMediaUrl(
        'building-safety-app-46821.firebasestorage.app',
        'companies/co/floorDrawings/a.jpg'
    );
    assert.ok(u.indexOf('https://firebasestorage.googleapis.com/v0/b/') === 0);
    assert.ok(u.indexOf('alt=media') !== -1);
    assert.ok(u.indexOf(encodeURIComponent('companies/co/floorDrawings/a.jpg')) !== -1);
}

function testProxyUrlAllowlist() {
    const allow = api.isAllowedFirebaseStorageProxyUrl;
    assert.strictEqual(allow(
        'https://firebasestorage.googleapis.com/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fx.jpg?alt=media&token=abc'
    ), true);
    assert.strictEqual(allow(
        'https://building-safety-app-46821.firebasestorage.app/v0/b/x/o/companies%2Fx.jpg'
    ), true);
    assert.strictEqual(allow('https://vision.googleapis.com/v1/images:annotate'), false);
    assert.strictEqual(allow('https://example.com/o/x.jpg'), false);
    assert.strictEqual(allow('http://firebasestorage.googleapis.com/v0/b/x/o/y'), false);
}

function testSiteRoundPathDetection() {
    assert.strictEqual(
        api.isSiteRoundScopedStoragePath('companies/co-1/칠산타워/2026년_하반기/floorDrawings/bldgA_1F.jpg'),
        true
    );
    assert.strictEqual(
        api.isSiteRoundScopedStoragePath('companies/co-1/floorDrawings/bldgA_1F.jpg'),
        false
    );
    assert.strictEqual(
        api.snapNeedsSiteRoundMove({ storagePath: 'companies/co-1/floorDrawings/bldgA_1F.jpg' }),
        true
    );
    assert.strictEqual(
        api.snapNeedsSiteRoundMove({
            storagePath: 'companies/co-1/칠산타워/2026년_하반기/floorDrawings/bldgA_1F.jpg'
        }),
        false
    );
}

function testFlag() {
    assert.strictEqual(api.USE_FIREBASE_STORAGE_FOR_DRAWINGS, true);
    assert.strictEqual(api.USE_FIREBASE_STORAGE_FOR_PHOTOS, true);
}

async function testMaterializeKeepsDataUrl() {
    const d = 'data:image/jpeg;base64,' + 'A'.repeat(40);
    const out = await api.materializeCloudAssetPayload(d, {});
    assert.strictEqual(out, d);
}

async function testMaterializeFallsThroughWhenProxyEmpty() {
    const remote = 'https://firebasestorage.googleapis.com/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fx.jpg?alt=media';
    let n = 0;
    api.setAssetProxy(async function () {
        n += 1;
        return null;
    });
    const warn = console.warn;
    console.warn = function () {};
    try {
        const out = await api.materializeCloudAssetPayload(remote, { storagePath: 'companies/x.jpg' });
        assert.strictEqual(out, null);
        assert.ok(n >= 2, 'empty proxy must fall through to direct/SDK then retry proxy, not return on first miss');
    } finally {
        console.warn = warn;
        api.setAssetProxy(null);
    }
}

async function testMaterializeUsesProxyNotRawHttps() {
    const remote = 'https://firebasestorage.googleapis.com/v0/b/building-safety-app-46821.firebasestorage.app/o/companies%2Fx.jpg?alt=media';
    api.setAssetProxy(async function () {
        return 'data:image/jpeg;base64,' + 'C'.repeat(40);
    });
    const warn = console.warn;
    console.warn = function () {};
    try {
        const out = await api.materializeCloudAssetPayload(remote, { storagePath: 'companies/x.jpg' });
        assert.ok(out && out.indexOf('data:image/jpeg') === 0, 'proxy should yield data URL');
        assert.ok(out.indexOf('https:') === -1);
    } finally {
        console.warn = warn;
        api.setAssetProxy(null);
    }
}

const tests = [
    testParseDataUrlJpeg,
    testParseDataUrlPdf,
    testParseDataUrlRejectsHttp,
    testStoragePaths,
    testMetaFields,
    testHasStorageMeta,
    testDownloadUrlPath,
    testFirebaseStorageAuthHeaders,
    testFirebaseStorageRestMediaUrl,
    testProxyUrlAllowlist,
    testSiteRoundPathDetection,
    testFlag,
    testMaterializeKeepsDataUrl,
    testMaterializeFallsThroughWhenProxyEmpty,
    testMaterializeUsesProxyNotRawHttps
];

async function run() {
    let failed = 0;
    for (const fn of tests) {
        try {
            await fn();
            console.log('ok', fn.name);
        } catch (e) {
            failed += 1;
            console.error('FAIL', fn.name, e && e.message);
        }
    }
    if (failed) {
        console.error(failed + ' failed');
        process.exit(1);
    }
    console.log('all ' + tests.length + ' tests passed');
}

run();
