#!/usr/bin/env node
'use strict';

/**
 * 2026-10-14 도면 진하게 — 연하게 올라온 층 도면을 화면·출력(한글·PDF 위치도, 비파괴 위치도)에서 진하게.
 * 층마다 0~3단계를 저장하고, 도면 그림을 곱하기로 덧그린다(핀·범례는 그대로).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const ctx = { state: { currentBuildingId: 'b1', currentFloor: '1F' }, saved: 0, synced: 0 };
vm.createContext(ctx);
vm.runInContext([
    /const FLOOR_DRAWING_DARKEN_LABELS = \[[^\]]*\];/.exec(app)[0],
    /const FLOOR_DRAWING_DARKEN_PASSES = \[[^\]]*\];/.exec(app)[0],
    'function saveStateToLocalStorage() { saved++; }',
    'function scheduleSyncToFirebase() { synced++; }',
    extractFunction('function getFloorMapStyleKey('),
    extractFunction('function getFloorDrawingDarken('),
    extractFunction('function setFloorDrawingDarken('),
    extractFunction('function applyFloorDrawingDarken('),
    extractFunction('function drawFloorDrawingImage('),
    'this.api = { get: getFloorDrawingDarken, set: setFloorDrawingDarken, draw: drawFloorDrawingImage, labels: FLOOR_DRAWING_DARKEN_LABELS, passes: FLOOR_DRAWING_DARKEN_PASSES };'
].join('\n'), ctx);
const api = ctx.api;

// 정한 적 없는 층은 0(예전 그대로), 층마다 따로 저장
assert.strictEqual(api.get('b1', '1F'), 0);
api.set('b1', '1F', 2);
assert.strictEqual(api.get('b1', '1F'), 2);
assert.strictEqual(api.get('b1', '2F'), 0, '다른 층은 그대로');
assert.strictEqual(api.get('b2', '1F'), 0, '다른 건물은 그대로');
assert.ok(ctx.saved === 1 && ctx.synced === 1, '기기 저장 + 동기화 예약');
// 이상한 값은 범위 안으로
ctx.state.floorDrawingDarken.b1_1F = 99;
assert.strictEqual(api.get('b1', '1F'), api.labels.length - 1);
ctx.state.floorDrawingDarken.b1_1F = 'x';
assert.strictEqual(api.get('b1', '1F'), 0);
assert.strictEqual(api.labels.length, api.passes.length, '단계 이름과 덧그리기 횟수 짝');
assert.strictEqual(api.passes[0], 0, '보통은 덧그리지 않는다');

// 그리기: 0단계는 한 번만, 단계가 있으면 곱하기로 덧그리고 합성 모드를 되돌린다
function fakeCtx() {
    const log = [];
    const c = {
        globalCompositeOperation: 'source-over',
        stack: [],
        save() { this.stack.push(this.globalCompositeOperation); },
        restore() { this.globalCompositeOperation = this.stack.pop(); },
        drawImage() { log.push(this.globalCompositeOperation); }
    };
    return { c, log };
}
let f = fakeCtx();
api.draw(f.c, {}, 100, 50, 0);
assert.deepStrictEqual(f.log, ['source-over']);
f = fakeCtx();
api.draw(f.c, {}, 100, 50, 3);
assert.deepStrictEqual(f.log, ['source-over'].concat(Array(api.passes[3]).fill('multiply')));
assert.strictEqual(f.c.globalCompositeOperation, 'source-over', '핀·범례는 원래 모드로 그려야 한다');

// 버튼, 저장·불러오기·동기화 네 곳(출력 범위와 같은 방식)
assert.ok(/id="btnFloorDrawingDarken"/.test(index), '도구 패널 버튼');
assert.ok(/floorDrawingDarken: window\.state\.floorDrawingDarken \|\| null,/.test(app), '기기 저장');
assert.ok(/if \(parsed\.floorDrawingDarken\)/.test(app), '기기에서 불러오기');
assert.ok(/if \(data\.floorDrawingDarken\)/.test(app), '서버에서 받기');
assert.ok(/\.\.\.\(window\.state\.floorDrawingDarken \? \{ floorDrawingDarken: window\.state\.floorDrawingDarken \} : \{\}\)/.test(app),
    '서버에 올릴 때는 있을 때만');
assert.ok(!/delete state\.floorDrawingDarken\[/.test(app), '되돌릴 때는 0 을 넣는다');

// 출력 그림 네 군데(위치도 전체·출력 범위·미리보기·비파괴 위치도 2) 모두 진하게를 거친다
assert.strictEqual((app.match(/drawFloorDrawingImage\(ctx, imgObj, imgW, imgH, /g) || []).length, 5);
assert.ok(/const ndtDarken = customSrc \? 0 : getFloorDrawingDarken\(currentBldgId, floorCode\);/.test(app), '비파괴 전용 도면은 그대로');

console.log('test-floor-drawing-darken: ok');
