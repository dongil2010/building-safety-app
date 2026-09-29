#!/usr/bin/env node
'use strict';

/**
 * 같은 층에 새 PDF를 넣으면 다른 기기의 옛 PDF를 버리고 새 파일을 받는다.
 * 중요(isBookmark) 마킹은 도면 박스와 목록에 별이 보인다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const meta = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

assert.ok(meta.KEYS.includes('floorPdfUpdatedAt'));
assert.deepStrictEqual(
    meta.mergeFloorStampMaps({ '1F': 10, '2F': 50 }, { '1F': 40, '3F': 5 }),
    { '1F': 40, '2F': 50, '3F': 5 }
);

assert.ok(app.includes('function stampFloorDrawingUpdated('));
assert.ok(app.includes('function floorDrawingRefreshDue('));
const editSave = app.indexOf('await uploadFloorDrawingPdf(bldg.id, item.floorCode, prepared.pdfDataUrl)');
assert.ok(editSave > 0);
assert.ok(app.indexOf('if (pdfUploaded) stampFloorDrawingUpdated(bldg, item.floorCode)', editSave) > editSave);

const resolveAt = app.indexOf('async function resolveBuildingFloorPdf(');
const resolveBody = app.slice(resolveAt, resolveAt + 2500);
assert.ok(resolveBody.includes('floorDrawingRefreshDue(bldg, floorCode)'));
assert.ok(resolveBody.includes('if (!refreshDue && bldg.floorDrawingPdfs'));

assert.ok(app.includes('function drawBookmarkChrome('));
assert.ok(app.includes("row.classList.add('is-important')"));
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(css.includes('.defect-list-item.is-important'));

console.log('test-floor-pdf-refresh: ok');
