#!/usr/bin/env node
'use strict';
/**
 * t599u: 모바일·태블릿 컴팩트 도면 더보기 정리
 * - 숨김은 그리기·범위선택·추가·출력범위만 (박스 정리는 유지)
 * - 「도면 확대·축소」 런처 + 기존 btnZoomIn/Out 경로
 * - 데스크톱 레일·핀치·맞춤 유지, NDT 범위선택/추가는 이 규칙 밖
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function sliceBetween(src, startNeedle, endNeedle) {
    const s = src.indexOf(startNeedle);
    assert.ok(s >= 0, 'missing: ' + startNeedle);
    const e = src.indexOf(endNeedle, s + startNeedle.length);
    assert.ok(e > s, 'missing end after ' + startNeedle);
    return src.slice(s, e);
}

const hideBlock = sliceBetween(
    css,
    '/* t599u compact More: hide ONLY',
    '/* ==========================================================================\n   조사표 「결함 크기」'
);

['mobileBtnAreaInk', 'mobileBtnQuickDrag', 'mobileBtnAddSelect', 'mobileBtnPrintCrop'].forEach((id) => {
    assert.ok(hideBlock.includes('button#' + id + '#' + id), id + ' compact-hidden');
});
assert.ok(!hideBlock.includes('mobileBtnBoxAutoLayout'), '박스 정리 must stay visible');
assert.ok(!hideBlock.includes('mobileNdtBtnQuickDrag'), 'NDT 범위선택 not in map hide');
assert.ok(!hideBlock.includes('mobileNdtBtnAddSelect'), 'NDT 추가 not in map hide');
assert.ok(!hideBlock.includes('mobileBtnZoomFit'), '맞춤 not hidden');
assert.ok(!hideBlock.includes('#btnZoomIn'), 'PC zoom-in not hidden');
assert.ok(hideBlock.includes('html.bsa-touch-ui:not(.layout-desktop)'), 'compact touch scope');
assert.ok(hideBlock.includes('html.layout-tablet:not(.layout-desktop)'), 'tablet compact scope');
assert.ok(/html\.layout-desktop #mobileBtnMapZoom/.test(hideBlock), 'desktop hides zoom launcher');

const desktopSecondary = sliceBetween(
    css,
    '/* Desktop / desktop-site: keep secondary tools visible; hide only the 더보기 toggle */',
    '/* ============================================================\n   Lock system font scale'
);
['mobileBtnAreaInk', 'mobileBtnQuickDrag', 'mobileBtnAddSelect', 'mobileBtnPrintCrop'].forEach((id) => {
    assert.ok(!desktopSecondary.includes(id), 'desktop secondary must not hide ' + id);
});
assert.ok(desktopSecondary.includes('html.layout-desktop .mobile-rail-more-toggle'), 'desktop still hides only 더보기');

const secondary = sliceBetween(html, 'id="mobileMapRailSecondary"', 'id="mobileMapDock"');
assert.ok(secondary.includes('id="mobileBtnAreaInk"') && secondary.includes('<span>그리기</span>'));
assert.ok(secondary.includes('id="mobileBtnQuickDrag"') && secondary.includes('<span>범위선택</span>'));
assert.ok(secondary.includes('id="mobileBtnAddSelect"') && secondary.includes('<span>추가</span>'));
assert.ok(secondary.includes('id="mobileBtnPrintCrop"') && secondary.includes('<span>출력범위</span>'));
assert.ok(secondary.includes('id="mobileBtnBoxAutoLayout"') && secondary.includes('<span>박스 정리</span>'));
assert.ok(secondary.includes('id="mobileBtnMapZoom"'));
assert.ok(secondary.includes('title="도면 확대·축소"') || secondary.includes('aria-label="도면 확대·축소"'));
assert.ok(html.includes('id="mobileMapZoomPad"'));
assert.ok(html.includes('id="mobileMapZoomIn"') && html.includes('id="mobileMapZoomOut"'));
assert.ok(html.includes('id="mobileBtnZoomFit"') && /<span>맞춤<\/span>/.test(html));
assert.ok(html.includes('id="btnZoomIn"') && html.includes('id="btnZoomOut"') && html.includes('id="btnZoomFit"'));
assert.ok(html.includes('id="mobileNdtBtnQuickDrag"') && html.includes('id="mobileNdtBtnAddSelect"'));

assert.ok(/function applyMobileMapZoomStep\(direction\) \{[\s\S]*btnZoomOut[\s\S]*btnZoomIn/.test(app),
    'compact +/- reuse existing zoom buttons');
assert.ok(app.includes("document.getElementById(id)?.click()"), 'zoom step clicks existing control');
assert.ok(app.includes("if (!open && railId === 'mobileMapSideRail') closeMobileMapZoomPad()"),
    'More collapse dismisses zoom pad');
assert.ok(/e\.stopPropagation\(\);\s*if \(e\.cancelable/.test(app), 'outside tap does not fall through to canvas');
assert.ok(app.includes("e.key === 'Escape'") && app.includes('closeMobileMapZoomPad'), 'Esc dismisses pad');
assert.ok(app.includes("'#mobileMapZoomPad'") || app.includes("'.mobile-map-zoom-pad'"),
    'zoom pad is a floating overlay');
assert.ok(app.includes('isPinching = true') && app.includes('getMapViewScaleLimits()'), 'pinch zoom kept');
assert.ok(/mobileBtnZoomFit[\s\S]{0,400}btnZoomFit/.test(app), '맞춤 still uses fit control');

console.log('test-mobile-map-more-cleanup: ok');
