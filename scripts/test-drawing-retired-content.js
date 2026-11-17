#!/usr/bin/env node
'use strict';

/**
 * 2026-11-17 도면을 다시 넣은 뒤 옛 도면이 기기 저장소(IndexedDB)에 다시 써지거나 읽혀 화면에 나오던 문제.
 * js/core/state.js의 옛 도면 지문(retireDrawingContent)과 idbSet/idbGet 막기,
 * app.js의 PersistedContentKeySet(내용까지 보는 「저장됨」 표시)를 시험한다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

// --- 가짜 IndexedDB(키-값) ---
function makeFakeIndexedDb() {
    const stores = {};
    const db = {
        objectStoreNames: { contains: (n) => !!stores[n] },
        createObjectStore: (n) => { stores[n] = new Map(); },
        transaction(storeName) {
            if (!stores[storeName]) stores[storeName] = new Map();
            const tx = { oncomplete: null, onerror: null };
            const store = stores[storeName];
            tx.objectStore = () => ({
                put(v, k) { store.set(k, v); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); },
                delete(k) { store.delete(k); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); },
                get(k) {
                    const req = { result: undefined, onsuccess: null };
                    setTimeout(() => { req.result = store.get(k); req.onsuccess && req.onsuccess(); }, 0);
                    return req;
                }
            });
            return tx;
        }
    };
    return {
        stores,
        open() {
            const req = { result: db, onsuccess: null, onupgradeneeded: null };
            setTimeout(() => { req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess(); }, 0);
            return req;
        }
    };
}

function makeLocalStorage() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k)
    };
}

const fakeIdb = makeFakeIndexedDb();
const sandbox = {
    console: { log() {}, warn() {}, error: console.error },
    setTimeout,
    localStorage: makeLocalStorage(),
    indexedDB: fakeIdb,
    Date,
    JSON,
    Math,
    Promise,
    Map,
    Set,
    Object,
    Array,
    Number,
    String
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'js', 'core', 'state.js'), 'utf8'), sandbox, { filename: 'state.js' });

function fakeJpeg(seed, len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let x = seed >>> 0;
    let s = 'data:image/jpeg;base64,/9j/';
    while (s.length < len) {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        s += chars[(x >>> 16) & 63];
    }
    return s;
}

(async () => {
    const { drawingContentSig, retireDrawingContent, unretireDrawingContent, isRetiredDrawingContent, idbSet, idbGet } = sandbox;
    const oldA = fakeJpeg(1, 200000);
    const newA = fakeJpeg(2, 200000); // 같은 길이, 다른 그림
    const floorKey = 'bldg-1_1F';
    const tierKey = 'bldg-1_1F_8000';

    // 지문: 같은 길이라도 다른 그림이면 다르다
    assert.notStrictEqual(drawingContentSig(oldA), drawingContentSig(newA));
    assert.strictEqual(drawingContentSig(oldA), drawingContentSig(String(oldA)));

    // 옛 도면이 기기에 있다가 교체 → 지문 기록
    await idbSet('floorDrawings', floorKey, oldA);
    retireDrawingContent([floorKey, tierKey], [oldA, 'https://example.invalid/x.jpg']);
    assert.ok(isRetiredDrawingContent(floorKey, oldA));
    assert.ok(isRetiredDrawingContent(tierKey, oldA));
    assert.ok(!isRetiredDrawingContent(floorKey, newA));
    assert.ok(!isRetiredDrawingContent('bldg-1_2F', oldA), '다른 층에는 같은 그림을 넣을 수 있어야 한다');
    assert.ok(!isRetiredDrawingContent(floorKey, 'https://example.invalid/x.jpg'), '서버 주소는 막지 않는다');

    // 기기에 남아 있던 옛 도면은 읽히지 않고 지워진다
    assert.strictEqual(await idbGet('floorDrawings', floorKey), null);
    await new Promise((r) => setTimeout(r, 10)); // 지우기는 기다리지 않고 보낸다
    assert.ok(!fakeIdb.stores.floorDrawings.has(floorKey));

    // 늦게 온 옛 도면 저장은 무시(성공처럼 true), 새 도면은 저장된다
    assert.strictEqual(await idbSet('floorDrawings', floorKey, oldA), true);
    assert.ok(!fakeIdb.stores.floorDrawings.has(floorKey));
    assert.strictEqual(await idbSet('floorDrawings', floorKey, newA), true);
    assert.strictEqual(await idbGet('floorDrawings', floorKey), newA);
    // 옛 저장이 새 도면을 덮지 못한다
    await idbSet('floorDrawingTiers', tierKey, oldA);
    assert.strictEqual(await idbGet('floorDrawingTiers', tierKey), null);

    // 사진 저장소는 상관없다
    await idbSet('photos', floorKey, oldA);
    assert.strictEqual(await idbGet('photos', floorKey), oldA);

    // 옛 파일을 그대로 다시 넣으면 풀어 준다
    unretireDrawingContent([floorKey, tierKey], [oldA]);
    assert.ok(!isRetiredDrawingContent(floorKey, oldA));
    await idbSet('floorDrawings', floorKey, oldA);
    assert.strictEqual(await idbGet('floorDrawings', floorKey), oldA);

    // 새로고침 뒤에도 지문이 남는다(localStorage)
    retireDrawingContent([floorKey], [newA]);
    const raw = JSON.parse(sandbox.localStorage.getItem('bsa_retired_drawing_content_v1'));
    assert.ok(raw[floorKey] && raw[floorKey][drawingContentSig(newA)]);

    // --- app/01-base.js의 PersistedContentKeySet ---
    const base = fs.readFileSync(path.join(root, 'app', '01-base.js'), 'utf8');
    const start = base.indexOf('    class PersistedContentKeySet extends Set {');
    assert.ok(start > 0, 'PersistedContentKeySet 없음');
    const end = base.indexOf('    const _idbPersistedDrawingKeys = new PersistedContentKeySet();', start);
    const classSrc = base.slice(start, end);
    const Klass = vm.runInContext(`(function(){ ${classSrc}; return PersistedContentKeySet; })()`, sandbox);
    const set = new Klass();
    set.add('k', oldA);
    assert.ok(set.has('k'));
    assert.ok(set.hasSame('k', oldA));
    assert.ok(!set.hasSame('k', newA), '다른 내용이면 「저장됨」이 아니다 → 새 도면을 다시 저장');
    set.add('k');
    assert.ok(set.hasSame('k', newA), '지문 없이 찍은 표시는 예전처럼 키만 본다');
    set.add('k', newA);
    set.delete('k');
    assert.ok(!set.hasSame('k', newA));
    set.add('j', newA);
    set.clear();
    assert.ok(!set.has('j'));

    console.log('test-drawing-retired-content: ok');
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
