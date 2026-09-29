#!/usr/bin/env node
'use strict';

/**
 * 조사표 입력 중 동기화가 표를 다시 그리면 칸이 사라져 키보드가 내려간다 (2026-09-29).
 * 칸에 포커스가 있으면 renderSurveyTable이 미루고, 칸을 떠난 뒤에 그린다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const start = app.indexOf('function surveyTableEditFocused()');
assert.ok(start >= 0, 'surveyTableEditFocused가 없다');
const renderAt = app.indexOf('function renderSurveyTable()', start);
assert.ok(renderAt > start, 'renderSurveyTable이 포커스 가드 뒤에 없다');
const body = app.slice(renderAt, renderAt + 500);
assert.ok(/surveyTableEditFocused\(\)/.test(body), 'renderSurveyTable이 입력 중인지 보지 않는다');
assert.ok(/_surveyTableRenderDeferred = true/.test(body), '입력 중 다시 그리기를 미루지 않는다');
assert.ok(app.indexOf("closest('#surveyTableBody')") >= 0, '조사표 칸만 대상으로 해야 한다');
assert.ok(/focusout/.test(app.slice(start, renderAt)), '칸을 떠난 뒤 미룬 그리기를 하지 않는다');

console.log('test-survey-sync-keyboard: ok');
