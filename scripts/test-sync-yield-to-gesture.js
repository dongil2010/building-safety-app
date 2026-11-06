#!/usr/bin/env node
'use strict';
/** 2026-11-06 업로드·받기가 도면 드래그를 막지 않게: 작업 사이마다 드래그에 양보 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const between = (a, b) => { const i = app.indexOf(a); const j = app.indexOf(b, i); assert.ok(i > 0 && j > i, a); return app.slice(i, j); };
assert.ok(extractFunction(app, 'async function runPhotoJobsInBatches(').includes('await yieldToUiGesture()'), '사진 올리기');
assert.ok(extractFunction(app, 'async function runPool(').includes('yieldToUiGesture'), '층 받기·도면');
assert.ok(between('const queue = jobs.slice();', "report('photos', 0, jobs.length)").includes('await yieldToUiGesture()'), '사진 받기');
assert.ok(between('for (const floorKey of floorsToSync) {\n                const floorBldg = findBuildingForFloorKey(floorKey);\n                const code = floorCodeFromFloorKey(floorKey, floorBldg);\n                if (!floorBldg || !code) continue;\n                if (floorsSkipWrite', 'await writeFloorSyncBundle(floorBldg, code);').includes('await yieldToUiGesture()'), '층 쓰기');
assert.ok(extractFunction(app, 'function renderSyncProgressUi(').includes('isRealtimeUiGestureBusy()'), '진행률 그리기');

(async () => {
    const order = [];
    let busy = true;
    const ctx = { order, isRealtimeUiGestureBusy: () => busy, Promise, setTimeout, Date };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(app, 'function sleepMs(') + extractFunction(app, 'async function waitForUiGestureIdle(').replace('maxMs = 60000', 'maxMs = 60000') + extractFunction(app, 'function yieldToUiGesture(') + extractFunction(app, 'async function runPhotoJobsInBatches(') + ';this.run = runPhotoJobsInBatches;', ctx);
    const p = ctx.run(['a'], async (x) => { order.push(x); }, 1);
    await new Promise((r) => setTimeout(r, 200));
    assert.deepStrictEqual(order, [], '드래그 중엔 시작 안 함');
    busy = false;
    await p;
    assert.deepStrictEqual(order, ['a'], '드래그 끝나면 진행');
    console.log('test-sync-yield-to-gesture: ok');
})().catch((e) => { console.error(e); process.exit(1); });
