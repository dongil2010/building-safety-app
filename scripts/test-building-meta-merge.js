#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'building-meta-merge.js'));

function merge(remote, local) {
    const merged = Object.assign({}, remote);
    return api.overlay(merged, local, remote);
}

function testPendingLocalWinsOverRemoteDefaults() {
    const remote = {
        id: 'bldg-1',
        inspectionType: '정밀안전점검',
        inspectionYear: '2026년',
        inspectionPeriod: '하반기'
    };
    const local = {
        id: 'bldg-1',
        inspectionType: '정기안전점검',
        inspectionYear: '2026년',
        inspectionPeriod: '상반기',
        _pendingCloudSync: true,
        metaUpdatedAt: 1000
    };
    const merged = merge(remote, local);
    assert.strictEqual(merged.inspectionType, '정기안전점검');
    assert.strictEqual(merged.inspectionPeriod, '상반기');
    assert.strictEqual(merged._pendingCloudSync, true);
}

function testNewerOrEqualLocalTimestampWinsAfterPendingCleared() {
    const remote = {
        id: 'bldg-1',
        inspectionType: '정밀안전점검',
        inspectionPeriod: '하반기',
        metaUpdatedAt: 1000
    };
    const local = {
        id: 'bldg-1',
        inspectionType: '정기안전점검',
        inspectionPeriod: '상반기',
        metaUpdatedAt: 1000
    };
    const merged = merge(remote, local);
    assert.strictEqual(merged.inspectionType, '정기안전점검');
    assert.strictEqual(merged.inspectionPeriod, '상반기');
}

function testStaleRemoteWithoutTimestampDoesNotRevertLocal() {
    const remote = {
        id: 'bldg-1',
        inspectionType: '정밀안전점검',
        inspectionPeriod: '하반기'
    };
    const local = {
        id: 'bldg-1',
        inspectionType: '정기안전점검',
        inspectionPeriod: '상반기',
        metaUpdatedAt: 5000
    };
    const merged = merge(remote, local);
    assert.strictEqual(merged.inspectionType, '정기안전점검');
    assert.strictEqual(merged.inspectionPeriod, '상반기');
}

function testRemoteNewerWins() {
    const remote = {
        id: 'bldg-1',
        inspectionType: '정밀안전점검',
        inspectionPeriod: '하반기',
        metaUpdatedAt: 9000
    };
    const local = {
        id: 'bldg-1',
        inspectionType: '정기안전점검',
        inspectionPeriod: '상반기',
        metaUpdatedAt: 1000
    };
    const merged = merge(remote, local);
    assert.strictEqual(merged.inspectionType, '정밀안전점검');
    assert.strictEqual(merged.inspectionPeriod, '하반기');
}

function testMarkDirtySetsPendingAndTimestamp() {
    const bldg = { inspectionType: '정밀안전점검' };
    api.markDirty(bldg, 12345);
    assert.strictEqual(bldg.metaUpdatedAt, 12345);
    assert.strictEqual(bldg._pendingCloudSync, true);
    assert.strictEqual(api.shouldKeepLocal(bldg, { inspectionType: '정밀안전점검' }), true);
}

testPendingLocalWinsOverRemoteDefaults();
testNewerOrEqualLocalTimestampWinsAfterPendingCleared();
testStaleRemoteWithoutTimestampDoesNotRevertLocal();
testRemoteNewerWins();
testMarkDirtySetsPendingAndTimestamp();
console.log('test-building-meta-merge: ok');
