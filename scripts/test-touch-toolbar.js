#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 폰·태블릿(터치) 도면 오른쪽 도구줄 정리.
 * - CAD 스냅·십자선·행·열 버튼 숨김(PC는 그대로), 십자선 늘 켬, 스냅 기본(켬), 행·열 편집 PC 전용
 * - 「박스」 → 「범위선택」(빈 곳을 끌어 네모 안 결함 다중 선택) + 설명 툴팁
 * 판정: js/core/mobile-keyboard.js isTouchToolbarUi (손가락 포인터·layout-tablet, PC 마우스·좁은 PC 창 제외)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/core/mobile-keyboard.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function run(env) {
    const cls = new Set(env.classes || []);
    const doc = {
        readyState: 'loading',
        documentElement: {
            classList: {
                contains: (c) => cls.has(c),
                toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }
            },
            style: { setProperty() {} }
        },
        body: { classList: { toggle() {} }, contains: () => true },
        addEventListener() {},
        getElementById: () => null,
        querySelectorAll: () => []
    };
    const win = {
        BSA: { isPcLikeLayout: () => !!env.pcLike },
        matchMedia: (q) => ({ matches: !!(env.mq || {})[q] }),
        innerWidth: env.width || 1280,
        innerHeight: env.height || 800,
        addEventListener() {},
        visualViewport: null
    };
    const ctx = { window: win, document: doc, navigator: { maxTouchPoints: env.touch || 0 }, requestAnimationFrame: () => 0, setTimeout, clearTimeout };
    vm.runInNewContext(src, ctx);
    return { fn: win.BSA.isTouchToolbarUi(), cls: cls.has('bsa-touch-ui') };
}
const ON = { fn: true, cls: true };
const OFF = { fn: false, cls: false };
// 폰
assert.deepStrictEqual(run({ width: 390, height: 844, touch: 5, mq: { '(pointer: coarse)': true } }), ON);
// iPad 가로(layout-tablet)
assert.deepStrictEqual(run({ width: 1180, height: 820, touch: 5, classes: ['layout-tablet'], mq: { '(pointer: coarse)': true } }), ON);
// 큰 안드로이드 탭 「데스크톱 사이트」(PC형 판정) + 손가락
assert.deepStrictEqual(run({ width: 1280, height: 800, touch: 10, pcLike: true, mq: { '(pointer: coarse)': true, '(hover: none)': true } }), ON);
// PC 마우스
assert.deepStrictEqual(run({ width: 1920, height: 1080, mq: { '(pointer: fine)': true } }), OFF);
// 좁은 PC 창(≤1024) — 키보드 판정의 폭 대체 규칙은 여기선 안 씀
assert.deepStrictEqual(run({ width: 900, height: 800, mq: { '(pointer: fine)': true, '(hover: hover)': true } }), OFF);
// 터치스크린 노트북(주 포인터 마우스)
assert.deepStrictEqual(run({ width: 1920, height: 1080, touch: 10, pcLike: true, mq: { '(pointer: fine)': true, '(hover: hover)': true } }), OFF);

// CSS: 터치에서 숨길 버튼(도면·NDT, PC·모바일 id)
const at = css.indexOf('html.bsa-touch-ui button#btnSnapToCad#btnSnapToCad');
assert.ok(at >= 0, '터치 숨김 규칙');
const block = css.slice(at, css.indexOf('}', at));
['btnSnapToCad', 'mobileBtnSnapToCad', 'btnToggleCrosshair', 'mobileBtnCrosshair', 'btnToggleCrosshairNdt', 'mobileNdtBtnCrosshair', 'btnGridLines', 'mobileBtnGridLines']
    .forEach((id) => {
        assert.ok(block.indexOf('button#' + id + '#' + id) >= 0, id);
        assert.ok(html.indexOf('<button type="button"') >= 0 && new RegExp('<button[^>]*id="' + id + '"').test(html), id + ' 은 button');
    });
assert.ok(/display:\s*none !important/.test(css.slice(at, at + 1200)));
// 박스 → 범위선택
['mobileBtnQuickDrag', 'mobileNdtBtnQuickDrag'].forEach((id) => {
    const i = html.indexOf('id="' + id + '"');
    assert.ok(i >= 0, id);
    const seg = html.slice(i, i + 600);
    assert.ok(/title="범위 선택 — 켜면 도면 빈 곳을 손가락으로 끌어/.test(seg), id + ' 툴팁');
    assert.ok(seg.indexOf('<span>범위선택</span>') >= 0, id + ' 이름');
    assert.ok(seg.indexOf('<span>박스</span>') < 0);
});
// app.js: 십자선 늘 켬·스냅 기본·행·열 PC 전용
assert.ok(/function readDrawingCrosshairPref\(\) \{\s*if \(isTouchToolbarUi\(\)\) return true;/.test(app));
assert.ok(/function setDrawingCrosshairEnabled\(on\) \{\s*if \(isTouchToolbarUi\(\)\) on = true;/.test(app));
assert.ok(app.indexOf('if (isTouchToolbarUi()) state.snapToCad = true;') >= 0);
assert.ok(app.indexOf('if (state.snapToCad === false && !isTouchToolbarUi()) return { x, y, snapped: false };') >= 0);
assert.ok(app.indexOf('if (on && isTouchToolbarUi()) return;') >= 0);
assert.ok(app.indexOf("'범위 선택 켜짐: 빈 곳을 끌어 네모 안 결함 선택") >= 0);

console.log('test-touch-toolbar: ok');
