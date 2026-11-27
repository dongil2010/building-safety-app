#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'core', 'legend-layout.js'));

const DEFAULT_ITEMS = [
    { colorName: '적색', label: '결함발생', color: '#ef4444' },
    { colorName: '청색', label: '상태양호', color: '#3b82f6' }
];

function testApplyDoesNotWipeBoxWhenItemsMissing() {
    const bldg = { id: 'bldg-1' };
    const live = {
        items: null,
        box: { x: 120, y: 340, scale: 6 }
    };
    const result = api.applyFromBuilding(bldg, live, { defaultItems: DEFAULT_ITEMS });
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.box.x, 120);
    assert.strictEqual(result.box.scale, 6);
    assert.deepStrictEqual(result.writeBoxToBuilding, { x: 120, y: 340, scale: 6, ownerBldgId: 'bldg-1' });
    assert.strictEqual(result.writeItemsToBuilding, undefined);
}

function testApplyRestoresBuildingBox() {
    const bldg = {
        id: 'bldg-1',
        locationMapLegend: [{ label: '커스텀', color: '#111' }],
        locationMapLegendBox: { x: 10, y: 20, scale: 3, nx: 0.1, ny: 0.2 }
    };
    const result = api.applyFromBuilding(bldg, { items: null, box: { x: 1, y: 1, scale: 1 } }, {
        defaultItems: DEFAULT_ITEMS
    });
    assert.strictEqual(result.items[0].label, '커스텀');
    assert.strictEqual(result.box.x, 10);
    assert.strictEqual(result.box.scale, 3);
    assert.strictEqual(result.writeBoxToBuilding, undefined);
}

function testForceDefaultClearsBox() {
    const bldg = {
        locationMapLegend: [{ label: '커스텀', color: '#111' }],
        locationMapLegendBox: { x: 10, y: 20, scale: 3 }
    };
    const result = api.applyFromBuilding(bldg, { items: bldg.locationMapLegend, box: bldg.locationMapLegendBox }, {
        forceDefault: true,
        defaultItems: DEFAULT_ITEMS
    });
    assert.strictEqual(result.box, null);
    assert.strictEqual(result.writeBoxToBuilding, null);
    assert.strictEqual(result.items[0].label, '결함발생');
}

function testOverlayKeepsLocalBoxOverRemoteBase() {
    const remote = {
        id: 'bldg-1',
        name: '현장A',
        locationMapLegend: [{ label: '원격', color: '#000' }]
    };
    const local = {
        id: 'bldg-1',
        locationMapLegend: [{ label: '로컬', color: '#fff' }],
        locationMapLegendBox: { x: 80, y: 90, scale: 5 }
    };
    const merged = Object.assign({}, remote);
    api.overlayOnMerged(merged, local);
    assert.strictEqual(merged.locationMapLegend[0].label, '로컬');
    assert.strictEqual(merged.locationMapLegendBox.x, 80);
    assert.strictEqual(merged.locationMapLegendBox.scale, 5);
}

function testOverlayLeavesRemoteWhenLocalHasNoBox() {
    const remote = {
        id: 'bldg-1',
        locationMapLegendBox: { x: 1, y: 2, scale: 2 }
    };
    const local = { id: 'bldg-1' };
    const merged = Object.assign({}, remote);
    api.overlayOnMerged(merged, local);
    assert.strictEqual(merged.locationMapLegendBox.x, 1);
}

function testNormalizedOriginSurvivesResolutionChange() {
    const box = { x: 150, y: 600, scale: 4 };
    api.stampNormalized(box, 1500, 2000);
    assert.strictEqual(box.nx, 0.1);
    assert.strictEqual(box.ny, 0.3);

    const onOtherFloor = api.resolveOrigin(box, 3000, 4000, 16);
    assert.strictEqual(onOtherFloor.x, 300);
    assert.strictEqual(onOtherFloor.y, 1200);
}

function testLegacyPixelOriginWhenNormalizedMissing() {
    const origin = api.resolveOrigin({ x: 40, y: 80, scale: 2 }, 2000, 1000, 16);
    assert.strictEqual(origin.x, 40);
    assert.strictEqual(origin.y, 80);
}

function testDefaultOriginWhenBoxEmpty() {
    const origin = api.resolveOrigin({}, 2000, 1000, 24);
    assert.strictEqual(origin.x, 24);
    assert.strictEqual(origin.y, 24);
}

function testNxZeroIsValid() {
    const origin = api.resolveOrigin({ nx: 0, ny: 0.5, x: 99, y: 99 }, 800, 400, 16);
    assert.strictEqual(origin.x, 0);
    assert.strictEqual(origin.y, 200);
}

// 2026-11-27 범례 숨기기·핀 한 색·고정은 동별 — 설정 없는 다른 동을 열 때 위치·크기만 잇는다
function testPerBuildingOptionsDoNotLeak() {
    const a = { id: 'A', locationMapLegendBox: { x: 50, y: 60, scale: 4, hidden: true, monoPin: true, locked: true } };
    const ra = api.applyFromBuilding(a, { items: null, box: null }, { defaultItems: DEFAULT_ITEMS });
    assert.strictEqual(ra.box.hidden, true);
    assert.strictEqual(ra.box.ownerBldgId, 'A');
    // 범례 설정이 없는 B동으로
    const b = { id: 'B' };
    const rb = api.applyFromBuilding(b, { items: null, box: ra.box }, { defaultItems: DEFAULT_ITEMS });
    assert.strictEqual(rb.box.x, 50);
    assert.strictEqual(rb.box.scale, 4);
    ['hidden', 'monoPin', 'locked'].forEach((k) => {
        assert.ok(!(k in rb.box), 'B동 상태에 ' + k + ' 넘어옴');
        assert.ok(!(k in rb.writeBoxToBuilding), 'B동 저장에 ' + k + ' 넘어옴');
    });
    assert.strictEqual(rb.writeBoxToBuilding.ownerBldgId, 'B');
    assert.strictEqual(ra.box.hidden, true, 'A동 박스는 그대로');
    // 같은 동 박스가 동기화로 지워진 복구 — 설정 유지
    const a2 = { id: 'A' };
    const r2 = api.applyFromBuilding(a2, { items: null, box: ra.box }, { defaultItems: DEFAULT_ITEMS });
    assert.strictEqual(r2.box.hidden, true);
    assert.strictEqual(r2.writeBoxToBuilding.monoPin, true);
    // 주인을 모르는 예전 박스(복구 경로) — 그대로
    const r3 = api.applyFromBuilding({ id: 'C' }, { items: null, box: { x: 1, y: 2, hidden: true } }, { defaultItems: DEFAULT_ITEMS });
    assert.strictEqual(r3.box.hidden, true);
}

testApplyDoesNotWipeBoxWhenItemsMissing();
testApplyRestoresBuildingBox();
testForceDefaultClearsBox();
testOverlayKeepsLocalBoxOverRemoteBase();
testOverlayLeavesRemoteWhenLocalHasNoBox();
testNormalizedOriginSurvivesResolutionChange();
testLegacyPixelOriginWhenNormalizedMissing();
testDefaultOriginWhenBoxEmpty();
testNxZeroIsValid();
testPerBuildingOptionsDoNotLeak();

console.log('test-legend-layout: ok');
