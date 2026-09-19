#!/usr/bin/env node
'use strict';

/**
 * Regression: 조사표(좌측 결함목록) 선택 시
 * - 선택됨 UI는 #defectListSelectedSlot (스크롤 패널 밖)
 * - 본 목록(#defectListPanel)은 선택 항목을 빼지 않음
 * - scrollToSelection / scrollIntoView / scrollTop=0 으로 목록이 점프하지 않음
 * Map focus from 조사표 (viewDefectOnMapFromSurvey) still works.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cssSrc = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function sliceBetween(hay, startNeedle, endNeedle) {
    const start = hay.indexOf(startNeedle);
    assert.ok(start >= 0, `missing start: ${startNeedle}`);
    const from = start + startNeedle.length;
    const end = hay.indexOf(endNeedle, from);
    assert.ok(end >= 0, `missing end after ${startNeedle}: ${endNeedle}`);
    return hay.slice(from, end);
}

function testHtmlHasSelectedSlot() {
    assert.ok(
        /id="defectListSelectedSlot"/.test(htmlSrc),
        'index.html must include #defectListSelectedSlot'
    );
    const aside = sliceBetween(
        htmlSrc,
        'class="inspect-sidebar-left"',
        '</aside>'
    );
    const slotIdx = aside.indexOf('defectListSelectedSlot');
    const panelIdx = aside.indexOf('defectListPanel');
    assert.ok(slotIdx >= 0 && panelIdx >= 0, 'slot and panel must be in sidebar');
    assert.ok(slotIdx < panelIdx, 'selected slot must be above defectListPanel');
}

function testCssHasSelectedSlot() {
    assert.ok(/\.defect-list-selected-slot\s*\{/.test(cssSrc), 'styles for selected slot');
}

function testRenderUsesExternalSlotAndKeepsItems() {
    const block = sliceBetween(
        appSrc,
        'function renderDefectListPanel(options = {}) {',
        'window.renderDefectListPanel = renderDefectListPanel;'
    );
    assert.ok(
        /renderDefectListSelectedSlot\s*\(\s*selectedCluster\s*\)/.test(block),
        'must render selected items into external slot'
    );
    assert.ok(
        !/pinSelectedToTop/.test(block),
        'must not pin/extract selected items out of main list sections'
    );
    assert.ok(
        /const previousItems = previousItemsRaw/.test(block),
        'main list must keep previousItemsRaw (no filter-out of selection)'
    );
    assert.ok(
        /restoreDefectListScroll\s*\(/.test(block),
        'must restore list scroll after re-render'
    );
    assert.ok(
        !/scrollDefectListRowIntoView\s*\(/.test(block),
        'renderDefectListPanel must not center-scroll to selection'
    );
    assert.ok(
        !/scrollIntoView\s*\(/.test(block),
        'renderDefectListPanel must not call scrollIntoView'
    );
}

function testRevealDoesNotResetScrollTop() {
    const block = sliceBetween(
        appSrc,
        'function revealSelectedDefectListAboveDrawer() {',
        'function scheduleRevealDefectListAboveDrawer() {'
    );
    assert.ok(
        !/panel\.scrollTop\s*=\s*0/.test(block),
        'reveal must not set panel.scrollTop = 0'
    );
    assert.ok(
        /defectListSelectedSlot/.test(block),
        'reveal should prefer external selected slot'
    );
}

function testHelperExists() {
    assert.ok(
        /function renderDefectListSelectedSlot\s*\(/.test(appSrc),
        'renderDefectListSelectedSlot helper required'
    );
}

function testSurveyMapFocusIntact() {
    assert.ok(/window\.viewDefectOnMapFromSurvey\s*=\s*function/.test(appSrc));
    const surveyFn = sliceBetween(
        appSrc,
        'window.viewDefectOnMapFromSurvey = function(defectId) {',
        'function translateDefectBy(d, dx, dy) {'
    );
    assert.ok(/focusDefectOnCanvas/.test(surveyFn), '조사표 → map focus must remain');
}

function testUpdateMapSelectionBarNoListJump() {
    const block = sliceBetween(
        appSrc,
        'function updateMapSelectionBar(options = {}) {',
        'function syncMobileAddMarkingFab() {'
    );
    assert.ok(
        /renderDefectListPanel\(\s*\{\s*scrollToSelection:\s*false\s*\}\s*\)/.test(block),
        'updateMapSelectionBar must not request list center-scroll'
    );
}

testHtmlHasSelectedSlot();
testCssHasSelectedSlot();
testHelperExists();
testRenderUsesExternalSlotAndKeepsItems();
testRevealDoesNotResetScrollTop();
testSurveyMapFocusIntact();
testUpdateMapSelectionBarNoListJump();
console.log('OK: survey selected-slot keeps main list scroll position');
