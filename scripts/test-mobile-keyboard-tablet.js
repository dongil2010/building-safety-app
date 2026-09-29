#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 태블릿도 폰과 같은 키보드 들어올림(입력란이 키보드에 가리지 않게).
 * 폭(≤1024)이 아니라 손가락 포인터·layout-tablet으로 켠다. PC 마우스는 그대로 끔.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/core/mobile-keyboard.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function run(env) {
    const listeners = [];
    const doc = {
        readyState: 'complete',
        documentElement: { classList: { contains: (c) => (env.classes || []).indexOf(c) >= 0, toggle() {} }, style: { setProperty() {} } },
        body: { classList: { toggle() {} }, contains: () => true },
        addEventListener: (t) => listeners.push(t),
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
    return { active: win.BSA.mobileKeyboard.isActive(), focusBound: listeners.indexOf('focusin') >= 0 };
}

// 폰
assert.deepStrictEqual(run({ width: 390, height: 844, touch: 5, mq: { '(pointer: coarse)': true } }), { active: true, focusBound: true });
// iPad 가로 1180(폭 1024 초과)
assert.deepStrictEqual(run({ width: 1180, height: 820, touch: 5, classes: ['layout-tablet'], mq: { '(pointer: coarse)': true } }), { active: true, focusBound: true });
// 큰 안드로이드 탭이 「데스크톱 사이트」라 PC형으로 판정돼도 손가락이면 켠다
assert.deepStrictEqual(run({ width: 1280, height: 800, touch: 10, pcLike: true, mq: { '(pointer: coarse)': true, '(hover: none)': true } }), { active: true, focusBound: true });
// PC 마우스: 끔
assert.deepStrictEqual(run({ width: 1920, height: 1080, touch: 0, mq: { '(pointer: fine)': true } }), { active: false, focusBound: false });
// PC형 판정 + 마우스(터치스크린 노트북 데스크톱 사이트): 끔
assert.deepStrictEqual(run({ width: 1920, height: 1080, touch: 10, pcLike: true, mq: { '(pointer: fine)': true, '(hover: hover)': true } }), { active: false, focusBound: false });

// CSS: 1025px 이상 손가락 기기에도 같은 들어올림 규칙
const at = css.indexOf('@media (hover: none) and (pointer: coarse) and (min-width: 1025px) {');
assert.ok(at >= 0, '폭 1025 이상 터치 기기 규칙');
const tail = css.slice(at, at + 6000);
['.modal-card.bsa-kb-lifted', '#defectModal.open .defect-drawer-card.bsa-kb-lifted', 'body.bsa-keyboard-open.bsa-kb-page-lift .app-content', '.bsa-kb-drag-handle.is-active']
    .forEach((sel) => assert.ok(tail.indexOf(sel) >= 0, sel));
// 기존 폰(≤1024)·layout-tablet 규칙은 그대로
assert.ok(css.indexOf('/* ── 모바일 소프트 키보드: 입력란 들어올림 + 드래그 조정 (PC 미적용) ── */\n@media (max-width: 1024px) {') >= 0);
assert.ok(/html\.layout-tablet #defectModal\.open \.defect-drawer-card\.bsa-kb-lifted/.test(css));

console.log('test-mobile-keyboard-tablet: ok');
