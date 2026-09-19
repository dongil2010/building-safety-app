#!/usr/bin/env node
'use strict';

/**
 * Regression: finishing a canvas pin drag must NOT recenter the viewport onto the marking.
 * Camera/view pan-to-mark is reserved for 조사표 row click/touch
 * (viewDefectOnMapFromSurvey → focusDefectOnCanvas).
 *
 * Source-level gate — app.js is a single browser bundle without extractable map modules.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
const src = fs.readFileSync(appPath, 'utf8');

function sliceBetween(hay, startNeedle, endNeedle) {
    const start = hay.indexOf(startNeedle);
    assert.ok(start >= 0, `missing start: ${startNeedle}`);
    const from = start + startNeedle.length;
    const end = hay.indexOf(endNeedle, from);
    assert.ok(end >= 0, `missing end after ${startNeedle}: ${endNeedle}`);
    return hay.slice(from, end);
}

function testPinDragEndDoesNotScheduleReveal() {
    const block = sliceBetween(
        src,
        'if (isDraggingPin || isDraggingPinGroup) {',
        'if (isMarkingDrag) {'
    );
    assert.ok(
        !/scheduleRevealMarkingAboveDrawer\s*\(/.test(block),
        'pin drag-end must not call scheduleRevealMarkingAboveDrawer (camera snap)'
    );
    assert.ok(
        !/focusDefectOnCanvas\s*\(/.test(block),
        'pin drag-end must not call focusDefectOnCanvas'
    );
    assert.ok(
        !/panCanvasToDefectMarking\s*\(/.test(block),
        'pin drag-end must not call panCanvasToDefectMarking'
    );
    assert.ok(
        /updateMapSelectionBar\(\s*\{\s*scrollToSelection:\s*false\s*\}\s*\)/.test(block),
        'pin drag-end should refresh selection UI without list center-scroll'
    );
    assert.ok(
        /마킹 드래그 종료 후 뷰포트/.test(block),
        'pin drag-end gate comment should document survey-only camera move'
    );
}

function testSurveySelectionStillFocusesCanvas() {
    assert.ok(
        /window\.viewDefectOnMapFromSurvey\s*=\s*function/.test(src),
        '조사표 → 도면 entry must exist'
    );
    const surveyFn = sliceBetween(
        src,
        'window.viewDefectOnMapFromSurvey = function(defectId) {',
        'function translateDefectBy(d, dx, dy) {'
    );
    assert.ok(
        /focusDefectOnCanvas/.test(surveyFn),
        '조사표 selection must still call focusDefectOnCanvas'
    );
}

function testFocusDefectPansCanvas() {
    const focusFn = sliceBetween(
        src,
        'window.focusDefectOnCanvas = function(defectId, options = {}) {',
        'let _mapDrawRafId = 0;'
    );
    assert.ok(
        /panCanvasToDefectMarking\s*\(\s*defect/.test(focusFn),
        'focusDefectOnCanvas must pan to the marking'
    );
}

testPinDragEndDoesNotScheduleReveal();
testSurveySelectionStillFocusesCanvas();
testFocusDefectPansCanvas();
console.log('ok: mark drag-end does not camera-pan; survey selection still focuses');
