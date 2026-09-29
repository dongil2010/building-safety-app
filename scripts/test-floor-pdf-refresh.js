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
// 2026-09-29: 중요 마킹 표시 = 「중요」 글자(노란 원 대신). 글자 높이 ≈ 1/3로 줄인 원의 지름 — 화면·보고서 공용 함수 한 곳
assert.ok(app.includes('const BOOKMARK_CHROME_SIZE_RATIO = 1 / 3;'));
assert.ok(app.includes("const BOOKMARK_CHROME_TEXT = '중요';"));
{
    const at = app.indexOf('function getBookmarkChromeGlyphHeight(');
    const body = app.slice(at, app.indexOf('ctx.restore();', at));
    assert.ok(body.includes('return 2 * Math.max(8, 10 * s) * BOOKMARK_CHROME_SIZE_RATIO;'), '글자 높이 = 예전 1/3 원 지름');
    assert.ok(body.includes('fontPx = fontPx * glyphH / mh'), '실제 글자 높이로 맞춤');
    assert.ok(body.includes('const cx = -w / 2;') && body.includes('let cy = -h / 2;'), '원 자리(좌상단 모서리)');
    assert.ok(body.includes('ctx.strokeText(BOOKMARK_CHROME_TEXT') && body.includes('ctx.fillText(BOOKMARK_CHROME_TEXT'), '테두리 + 글자');
    assert.ok(!body.includes('ctx.arc('), '원은 더 안 그림');
    assert.strictEqual((app.match(/defectHasCornerMark\(defect\)\) drawBookmarkChrome\(ctx,/g) || []).length, 2, '화면(drawPin)·보고서(drawPinSafe) 두 곳이 같은 함수');
}
assert.ok(app.includes("row.classList.add('is-important')"));
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(css.includes('.defect-list-item.is-important'));
// 2026-09-29: 결함표 목록의 노란 원(번호를 가림) → 번호칸 위 작은 「중요」 배지
{
    const at = css.indexOf('.defect-list-item.is-important .defect-badge-no::before {');
    const rule = css.slice(at, css.indexOf('}', at));
    assert.ok(at > 0 && rule.includes("content: '중요';"), '결함표: 중요 글자');
    assert.ok(rule.includes('bottom: calc(100% + 1px);'), '번호칸 위(번호를 가리지 않음)');
    assert.ok(!rule.includes('border-radius: 50%'), '원 아님');
    // 2026-09-30: 배지 자리는 중요 줄 위 안쪽 여백으로(윗줄과 안 겹침), 줄 간격은 약 1/4
    assert.ok(css.includes('html #tab-map .defect-list-section-scroll > .defect-list-item.is-important {\n    padding-top: 11px !important;'), '중요 줄 위 여백 = 배지 자리');
    assert.ok(css.includes('html #tab-map .defect-list-section-scroll,') && css.includes('    gap: 1px !important;'), '줄 사이 1px');
    assert.ok(css.includes('    padding-top: 1px !important;\n    padding-bottom: 1px !important;'), '줄 위아래 여백 1px');
}

console.log('test-floor-pdf-refresh: ok');
