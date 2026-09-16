#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const api = require(path.join(__dirname, '..', 'js', 'shared', 'arrow-survey-number.js'));

function testLegacyIsNumbered() {
    assert.strictEqual(api.isUnnumberedArrowMarking({ id: 'a', no: 'NO.01' }), false);
    assert.strictEqual(api.isSurveyNumberedMarking({ id: 'a', no: 'NO.01' }), true);
    assert.strictEqual(api.isUnnumberedArrowMarking({ id: 'e', surveyExtra: true, surveyNumbered: false }), false);
}

function testNewExtraArrowIsUnnumbered() {
    const extra = { id: 'b', groupId: 'a', no: 'NO.01', ...api.extraArrowCreateFields() };
    assert.strictEqual(extra.surveyNumbered, false);
    assert.strictEqual(api.isUnnumberedArrowMarking(extra), true);
    assert.strictEqual(api.isSurveyNumberedMarking(extra), false);
}

function testAssignOnlyOnExtraUnnumbered() {
    const parent = { id: 'a', groupId: 'g', no: 'NO.07' };
    const extra = { id: 'b', groupId: 'g', no: 'NO.07', surveyNumbered: false };
    const numberedExtra = { id: 'c', groupId: 'g', no: 'NO.07', surveyNumbered: true };
    const members = [parent, extra, numberedExtra];
    assert.strictEqual(api.canAssignSurveyNumber(parent, members), false);
    assert.strictEqual(api.canAssignSurveyNumber(extra, members), true);
    assert.strictEqual(api.canAssignSurveyNumber(numberedExtra, members), false);
    assert.strictEqual(api.canAssignSurveyNumber(extra, [extra]), false);
    assert.strictEqual(api.canAssignSurveyNumber({ id: 'x', surveyExtra: true, surveyNumbered: false }, members), false);
}

function testPreferNumberedRepresentative() {
    const unnumbered = { id: 'aaa', groupId: 'g', no: 'NO.07', surveyNumbered: false };
    const parent = { id: 'zzz', groupId: 'g', no: 'NO.07' };
    const rep = api.preferNumberedMarkingRepresentative([unnumbered, parent]);
    assert.strictEqual(rep.id, 'zzz');
}

function testFloatLabels() {
    const unnumbered = { id: 'b', surveyNumbered: false };
    const parent = { id: 'a' };
    const extraRow = { id: 'e', surveyExtra: true };
    assert.strictEqual(api.floatSlotLabel('7', 1, parent, 0), '7');
    assert.strictEqual(api.floatSlotLabel('7', 2, unnumbered, 0), '화살표 2');
    assert.strictEqual(api.floatSlotLabel('7', 1, parent, 1), '7-1');
    assert.strictEqual(api.floatSlotLabel('7', 2, extraRow, 1), '7-2');
}

function testSkipOrphanUnnumbered() {
    assert.strictEqual(api.shouldSkipOrphanUnnumberedInSurveyList({
        id: 'x', surveyNumbered: false
    }), true);
    assert.strictEqual(api.shouldSkipOrphanUnnumberedInSurveyList({
        id: 'x', groupId: 'g', surveyNumbered: false
    }), false);
    assert.strictEqual(api.shouldSkipOrphanUnnumberedInSurveyList({
        id: 'x', no: 'NO.01'
    }), false);
}

function countSurveyTableRows(defects) {
    const seen = new Set();
    let n = 0;
    (defects || []).forEach((d) => {
        if (!d) return;
        if (api.shouldSkipOrphanUnnumberedInSurveyList(d)) return;
        if (d.surveyExtra) {
            n += 1;
            return;
        }
        if (d.groupId) {
            if (seen.has(d.groupId)) return;
            seen.add(d.groupId);
        }
        n += 1;
    });
    return n;
}

function testAddingArrowDoesNotAddSuffixRows() {
    const parent = { id: 'p', groupId: 'g', no: 'NO.07', groupNo: 'NO.07' };
    const extraArrow = { id: 'a2', groupId: 'g', no: 'NO.07', groupNo: 'NO.07', ...api.extraArrowCreateFields() };
    assert.strictEqual(countSurveyTableRows([parent]), 1);
    assert.strictEqual(countSurveyTableRows([parent, extraArrow]), 1);
    const numberedExtra = { id: 'e2', groupId: 'g', no: 'NO.07-2', groupNo: 'NO.07', surveyExtra: true };
    const numberedArrow = { ...extraArrow, surveyNumbered: true };
    assert.strictEqual(countSurveyTableRows([parent, numberedArrow, numberedExtra]), 2);
}

testLegacyIsNumbered();
testNewExtraArrowIsUnnumbered();
testAssignOnlyOnExtraUnnumbered();
testPreferNumberedRepresentative();
testFloatLabels();
testSkipOrphanUnnumbered();
testAddingArrowDoesNotAddSuffixRows();
console.log('test-arrow-survey-number: ok');