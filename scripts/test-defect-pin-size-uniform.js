#!/usr/bin/env node
/* 2026-11-24 「마킹 크기가 지맘대로 제각각」: 결함 핀 크기는 분류(구조체·비구조체·마감재 × 결함·양호)와 상관없이 하나.
 * 층별 저장에 빠진 키가 있어도 출력 위치도가 화면처럼 전체 기본값을 이어받는다. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const constBlock = (name) => {
    const i = src.indexOf(`const ${name} = `);
    assert.ok(i >= 0, name);
    const end = src.indexOf(';\n', i);
    return src.slice(i, end + 1);
};
const code = [
    constBlock('DEFAULT_STYLE_SIZES'),
    constBlock('DEFECT_STYLE_SIZE_KEYS'),
    constBlock('NDT_STYLE_SIZE_KEYS'),
    constBlock('DEFECT_STYLE_SIZE_CANON_KEY'),
    'let _mapStyleRenderContext = null;',
    extractFunction(src, 'function getFloorMapStyleKey('),
    extractFunction(src, 'function cloneStyleSizesMap('),
    extractFunction(src, 'function mergeStyleSizesSubset('),
    extractFunction(src, 'function getActiveStyleSizesSource('),
    extractFunction(src, 'function resolveStyleSizeKey('),
    extractFunction(src, 'function getStyleSize('),
    extractFunction(src, 'function setStyleSizeFields('),
    'return { getStyleSize, setStyleSizeFields, setCtx: (c) => { _mapStyleRenderContext = c; } };'
].join('\n');
const state = {};
const api = new Function('state', code)(state);

const DEFECT_KEYS = ['defectStructural', 'defectNonStructural', 'defectFinish',
    'defectStructuralGood', 'defectNonStructuralGood', 'defectFinishGood'];

// 1) 예전 자료처럼 칸마다 값이 어긋나 있어도 결함 핀은 모두 같은 크기(구조체 칸 = 일괄 슬라이더 값)
state.styleSizes = {
    defectStructural: { pin: 1.4, arrow: 1.2 },
    defectNonStructural: { pin: 0.6, arrow: 2.0 },
    defectFinish: { pin: 3.0 },
    defectFinishGood: { pin: 0.5, arrow: 0.5 },
    ndtMeasure: { pin: 2.2 }
};
DEFECT_KEYS.forEach((k) => {
    const sz = api.getStyleSize(k);
    assert.strictEqual(sz.pin, 1.4, k + ' pin');
    assert.strictEqual(sz.arrow, 1.2, k + ' arrow');
});
// 비파괴 마킹은 종류별 크기 그대로
assert.strictEqual(api.getStyleSize('ndtMeasure').pin, 2.2);
assert.strictEqual(api.getStyleSize('ndtTilt').pin, 1.0);

// 2) 한 칸을 바꾸면 결함 6칸이 같이 바뀜(NDT는 그대로)
api.setStyleSizeFields('defectFinish', { pin: 2.5 });
DEFECT_KEYS.forEach((k) => assert.strictEqual(state.styleSizes[k].pin, 2.5, k + ' synced'));
assert.strictEqual(state.styleSizes.ndtMeasure.pin, 2.2);
DEFECT_KEYS.forEach((k) => assert.strictEqual(api.getStyleSize(k).pin, 2.5));

// 3) 출력 위치도(다른 층 그리기): 층 저장에 키가 빠져도 기본 100%가 아니라 전체 기본값을 이어받음
state._globalStyleSizesFallback = { defectStructural: { pin: 1.8, arrow: 1.6 } };
state.floorMapStyleSettings = { B1_2F: { styleSizes: { defectNonStructural: { pin: 0.7 } } } };
api.setCtx({ buildingId: 'B1', floorCode: '2F' });
DEFECT_KEYS.forEach((k) => {
    assert.strictEqual(api.getStyleSize(k).pin, 1.8, k + ' report inherits global');
    assert.strictEqual(api.getStyleSize(k).arrow, 1.6);
});
// 층에 구조체 값이 저장돼 있으면 그 층 값
state.floorMapStyleSettings.B1_2F.styleSizes.defectStructural = { pin: 0.9 };
DEFECT_KEYS.forEach((k) => assert.strictEqual(api.getStyleSize(k).pin, 0.9, k + ' floor value'));
api.setCtx(null);

console.log('test-defect-pin-size-uniform: OK');
