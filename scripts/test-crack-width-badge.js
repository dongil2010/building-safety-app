'use strict';
// 2026-11-06 t592u 도면 마킹 균열폭 배지: 경계 0.29/0.3/0.31, 무효·단위, 토글, 중요 공존, 화면만(출력 미포함)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const api = require(path.join(root, 'js', 'shared', 'crack-width-badge.js'));
const boxLayout = require(path.join(root, 'js', 'shared', 'box-auto-layout.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mapJs = fs.readFileSync(path.join(root, 'js', 'tabs', 'map.js'), 'utf8');

function crack(extra) {
    return Object.assign({ defectType: '수직균열' }, extra || {});
}

function testParseAndBoundary() {
    assert.strictEqual(api.parseCrackWidthMm('0.29'), 0.29);
    assert.strictEqual(api.parseCrackWidthMm('0.3'), 0.3);
    assert.strictEqual(api.parseCrackWidthMm('0.31'), 0.31);
    assert.strictEqual(api.parseCrackWidthMm('0.3mm'), 0.3);
    assert.strictEqual(api.parseCrackWidthMm('0.5㎜'), 0.5);
    assert.strictEqual(api.parseCrackWidthMm('Cw:0.3'), 0.3);
    assert.strictEqual(api.parseCrackWidthMm('Cw=0.4'), 0.4);
    assert.strictEqual(api.parseCrackWidthMm('0,3'), 0.3);
    assert.strictEqual(api.parseCrackWidthMm('폭:0.5'), 0.5);
    assert.strictEqual(api.parseCrackWidthMm(''), null);
    assert.strictEqual(api.parseCrackWidthMm('   '), null);
    assert.strictEqual(api.parseCrackWidthMm('-'), null);
    assert.strictEqual(api.parseCrackWidthMm('abc'), null);
    assert.strictEqual(api.parseCrackWidthMm('mm'), null);
    assert.strictEqual(api.parseCrackWidthMm(null), null);
    assert.strictEqual(api.parseCrackWidthMm(undefined), null);
    assert.strictEqual(api.parseCrackWidthMm('-1'), null);
    assert.ok(!api.meetsMinWidth(api.parseCrackWidthMm('0.29')));
    assert.ok(api.meetsMinWidth(api.parseCrackWidthMm('0.3')));
    assert.ok(api.meetsMinWidth(api.parseCrackWidthMm('0.31')));
    assert.ok(!api.meetsMinWidth(api.parseCrackWidthMm('0.299')));
    assert.ok(!api.meetsMinWidth(null));
}

function testFormatUnits() {
    assert.strictEqual(api.formatWidthMm(0.3), '0.3mm');
    assert.strictEqual(api.formatWidthMm(0.5), '0.5mm');
    assert.strictEqual(api.formatWidthMm(0.31), '0.31mm');
    assert.strictEqual(api.formatWidthMm(1), '1mm');
    assert.strictEqual(api.formatWidthMm(0.30000000000000004), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.29' })), '');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.3' })), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.31' })), '0.31mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.3mm' })), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.3 / 0.5' })), '0.3mm / 0.5mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.2 / 0.5' })), '0.5mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.29, 0.3' })), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({
        crackMeasures: [{ width: '0.3' }, { width: '0.5' }]
    })), '0.3mm / 0.5mm');
    assert.strictEqual(api.formatBadgeText(crack({ size: 'Cw:0.3' })), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({ size: '0.5mm' })), '0.5mm');
    assert.strictEqual(api.formatBadgeText(crack({ size: '0.3/1.5' })), '0.3mm');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '' })), '');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: 'abc' })), '');
    assert.strictEqual(api.formatBadgeText({ defectType: '박리/박락', crackWidth: '0.5' }), '');
    assert.strictEqual(api.formatBadgeText({ defectType: '누수', crackWidth: '0.3' }), '');
    assert.strictEqual(api.formatBadgeText(crack({ crackWidth: '0.5' })), '0.5mm');
}

function testTogglePref() {
    const mem = {
        store: {},
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.store, k) ? this.store[k] : null; },
        setItem: function (k, v) { this.store[k] = String(v); }
    };
    assert.strictEqual(api.readPref(mem), true, '미저장 = 기본 ON');
    api.writePref(false, mem);
    assert.strictEqual(mem.store[api.PREF_KEY], '0');
    assert.strictEqual(api.readPref(mem), false);
    api.writePref(true, mem);
    assert.strictEqual(mem.store[api.PREF_KEY], '1');
    assert.strictEqual(api.readPref(mem), true);
    assert.strictEqual(api.shouldShow(crack({ crackWidth: '0.3' }), { toggleOn: true }), true);
    assert.strictEqual(api.shouldShow(crack({ crackWidth: '0.3' }), { toggleOn: false }), false);
    assert.strictEqual(api.shouldShow(crack({ crackWidth: '0.29' }), { toggleOn: true }), false);
    assert.ok(html.includes('data-crack-width-badge'), '토글 체크박스');
    assert.ok(/data-crack-width-badge[^>]*checked|checked[^>]*data-crack-width-badge/.test(html), 'HTML 기본 ON');
    assert.ok(html.includes('균열폭 표시'), '토글 문구');
    const memoGroup = html.slice(html.indexOf('도면 주석:'), html.indexOf('도면 주석:') + 900);
    assert.ok(memoGroup.includes('균열폭 표시') && memoGroup.includes('data-memo-show'), '도면 주석 그룹에 균열폭 표시');
}

function testImportanceCoexistence() {
    const d = crack({ crackWidth: '0.3', isBookmark: true });
    assert.strictEqual(api.formatBadgeText(d), '0.3mm', '중요여부와 무관하게 폭 텍스트');
    const wide = api.layout(80, 24, 1, '0.3mm', true);
    const narrow = api.layout(18, 24, 1, '0.3mm / 0.5mm', true);
    const widthOnly = api.layout(18, 24, 1, '0.3mm', false);
    assert.ok(wide.cx > 0, '중요+폭: 폭은 우측');
    assert.ok(narrow.outsideRight, '좁은 박스에서 폭을 오른쪽 바깥으로');
    assert.ok(!widthOnly.outsideRight, '중요 없으면 우측 모서리(중요 자리 유지)');
    const extra = api.badgeExtentExtra(18, 1, '0.3mm / 0.5mm', true);
    assert.ok(extra.w > 0 && extra.right > extra.w / 4, '둘 다 있으면 왼쪽 중요 폭 + 오른쪽 균열폭 여유');
    const ext = boxLayout.boxExtent(60, 24, 0, extra);
    const bookmarkOnly = boxLayout.boxExtent(60, 24, 0, { w: 20, h: 8 });
    assert.ok(bookmarkOnly.l === 40 && bookmarkOnly.t === 16 && bookmarkOnly.r === 30 && bookmarkOnly.b === 12, '중요만이면 기존 여백');
    assert.ok(ext.r > bookmarkOnly.r, '균열폭이 있으면 오른쪽 여백 증가');
}

function testScreenOnlyWiring() {
    assert.ok(html.includes('js/shared/crack-width-badge.js'), '스크립트 로드');
    assert.ok(html.indexOf('js/shared/crack-width-badge.js') < html.indexOf('src="app.js'), 'app.js 앞에 로드');
    assert.ok(app.includes('function drawCrackWidthChrome('), '화면 배지 그리기');
    const pinBody = app.slice(app.indexOf('function drawPinBody('), app.indexOf('// --- Dynamic Defect Component'));
    assert.ok(pinBody.includes('drawBookmarkChrome(ctx, w, h, scale)'), '중요는 그대로');
    assert.ok(pinBody.includes('if (cwText) drawCrackWidthChrome('), '화면 drawPinBody에서 균열폭');
    const safeStart = app.indexOf('function drawPinSafe(');
    const safeEnd = app.indexOf('window.buildVectorPinDrawPlan');
    const safe = app.slice(safeStart, safeEnd);
    assert.ok(safe.includes('drawBookmarkChrome('), '출력은 중요 유지');
    assert.ok(!safe.includes('drawCrackWidthChrome'), 'PDF/한글 drawPinSafe에는 균열폭 없음');
    const plan = app.slice(app.indexOf('window.buildVectorPinDrawPlan'), app.indexOf('window.buildVectorPinDrawPlan') + 3500);
    assert.ok(!plan.includes('drawCrackWidthChrome') && !plan.includes('crackWidthBadge'), '벡터 플랜에 균열폭 없음');
    assert.strictEqual((app.match(/if \(defectHasCornerMark\(defect\)\) drawBookmarkChrome\(ctx,/g) || []).length, 2);
    assert.ok(app.includes("const CRACK_WIDTH_BADGE_PREF_KEY") || app.includes('crackWidthBadgeApi()') || app.includes('BSA.crackWidthBadge'), '토글 선호값 연결');
    assert.ok(app.includes('getCurrentFloorFilteredDefects'), '필터된 마킹만 그림');
    const auto = app.slice(app.indexOf('function buildBoxAutoLayoutItems('), app.indexOf('window.runMarkingBoxAutoLayout'));
    assert.ok(auto.includes('crackWidthBadge') || auto.includes('formatBadgeText') || auto.includes('badgeExtentExtra'), '박스 정리가 균열폭 크기 반영');
    assert.ok(mapJs.includes('균열폭'), 'map 탭 기능 목록');
}

function testNoSavedMutation() {
    const d = crack({ crackWidth: '0.30mm', size: 'Cw:0.30' });
    const before = JSON.stringify(d);
    api.formatBadgeText(d);
    api.shouldShow(d, { toggleOn: true });
    assert.strictEqual(JSON.stringify(d), before, '결함 저장값 변경 없음');
}

testParseAndBoundary();
testFormatUnits();
testTogglePref();
testImportanceCoexistence();
testScreenOnlyWiring();
testNoSavedMutation();
console.log('test-crack-width-badge: ok');
