#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'performance.js'), 'utf8');

function loadPerf(mode) {
    const classList = { toggle() {} };
    const sandbox = {
        window: { BSA: {}, innerWidth: 1920 },
        navigator: { deviceMemory: 16, hardwareConcurrency: 8, maxTouchPoints: 0 },
        document: {
            documentElement: { classList: classList },
            readyState: 'complete',
            getElementById: () => null,
            addEventListener: () => {}
        },
        localStorage: {
            getItem: () => mode,
            setItem() {},
            removeItem() {}
        }
    };
    sandbox.window.navigator = sandbox.navigator;
    sandbox.window.document = sandbox.document;
    sandbox.window.innerWidth = 1920;
    sandbox.window.localStorage = sandbox.localStorage;
    sandbox.window.requestIdleCallback = undefined;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.window.BSA.performance;
}

function testNormalDebounceIsThreeSeconds() {
    const perf = loadPerf('normal');
    assert.strictEqual(perf.getSyncDebounceMs(), 3000);
}

function testLowEndDebounceIsFiveSeconds() {
    const perf = loadPerf('low');
    assert.strictEqual(perf.getSyncDebounceMs(), 5000);
}

testNormalDebounceIsThreeSeconds();
testLowEndDebounceIsFiveSeconds();
console.log('test-sync-debounce: ok');
