#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 결함 수정창이 열릴 때
 *  (1) 좌측 목록창 하단이 수정창(바닥 시트)·올려진 하단 툴바에 가려지지 않게 목록창이 줄어든다 (폰·태블릿)
 *      - styles.css: 마지막에 더 강한 선택자 + !important 로 padding-bottom: var(--bsa-list-obstruct)
 *        (예전 60dvh/56dvh 규칙이 뒤의 `padding: … !important` 일괄 지정에 덮여 죽었던 회귀)
 *      - app.js computeDefectListObstruction: 가려지는 높이를 실제 위치로 계산 (합성 DOM)
 *  (2) 태블릿 하단 툴바는 6칸 고정 그리드 때문에 두 줄로 꺾이던 것을 한 줄(보이는 버튼 수만큼 균등)로
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

/* ---------- CSS ---------- */
const OBS_SEL = 'html.bsa-list-obstructed:not(.layout-desktop) body.defect-modal-open #tab-map .inspect-sidebar-left';
const obsAt = css.lastIndexOf(OBS_SEL);
assert.ok(obsAt > 0, '목록창 여백 규칙(' + OBS_SEL + ')이 없다');
const obsBlock = css.slice(obsAt, css.indexOf('}', obsAt));
assert.ok(/padding-bottom:\s*var\(--bsa-list-obstruct\)\s*!important/.test(obsBlock), '여백은 var(--bsa-list-obstruct) !important');

// 이 규칙은 .inspect-sidebar-left 에 걸린 다른 `padding … !important` 규칙들보다 뒤에 있어야 이긴다
let mm;
const laterPad = [];
const re2 = /([^{}]*\.inspect-sidebar-left[^{}]*)\{([^{}]*padding[^{}]*!important[^{}]*)\}/g;
while ((mm = re2.exec(css))) { if (mm.index > obsAt) laterPad.push(mm[1].trim()); }
assert.deepStrictEqual(laterPad, [], '목록창 padding !important 규칙이 우리 규칙 뒤에 있다: ' + laterPad.join(' | '));

// 태블릿 세로 769px~: 툴바를 시트 높이로 올리지 않는다(도면 오른쪽 위 플로팅 창이라서)
assert.ok(/@media \(orientation: portrait\) and \(min-width: 769px\)\s*\{\s*html\.layout-tablet body\.defect-modal-open #tab-map #mobileMapDock\.mobile-canvas-dock\s*\{[^}]*position:\s*absolute !important;[^}]*bottom:\s*max\(0\.14rem/.test(css),
    '태블릿 세로(769+) 툴바 위치 규칙 없음');

// 태블릿 툴바 한 줄
const ONE_ROW_SELS = [
    'html.layout-tablet #tab-map #mobileMapFabBar.mobile-map-fab',
    'html.layout-tablet body.defect-modal-open #tab-map #mobileMapFabBar.mobile-map-fab',
    'html.layout-tablet body.defect-modal-open #tab-map #mobileMapFabBar.has-add-marking',
    'html.layout-tablet body.defect-modal-open #tab-map #mobileMapFabBar.has-add-marking.has-assign-no'
];
const rowAt = css.lastIndexOf(ONE_ROW_SELS[0] + ',');
assert.ok(rowAt > 0, '한 줄 툴바 규칙 없음');
const rowHead = css.slice(rowAt, css.indexOf('{', rowAt));
ONE_ROW_SELS.forEach((s) => assert.ok(rowHead.includes(s), '한 줄 규칙 선택자 누락: ' + s));
const rowBlock = css.slice(css.indexOf('{', rowAt), css.indexOf('}', rowAt));
assert.ok(/grid-template-columns:\s*none\s*!important/.test(rowBlock));
assert.ok(/grid-auto-flow:\s*column\s*!important/.test(rowBlock));
assert.ok(/grid-auto-columns:\s*minmax\(0,\s*1fr\)\s*!important/.test(rowBlock));
// 기존 고정 열 수 규칙(repeat(6)/(7)/(8))보다 뒤
['repeat(6, 1fr) !important', 'repeat(7, minmax(0, 1fr)) !important', 'repeat(8, minmax(0, 1fr)) !important'].forEach((t) => {
    assert.ok(css.lastIndexOf(t) < rowAt, t + ' 규칙이 한 줄 규칙보다 뒤에 있다');
});
// 폰(layout-tablet 아님)은 건드리지 않는다: 새 툴바 규칙은 모두 html.layout-tablet 로 시작
const tail = css.slice(css.indexOf('/* ==== 목록창 가림 방지'));
tail.split('\n').filter((l) => /mobileMapFabBar|mobile-fab-btn/.test(l) && /\{|,$/.test(l)).forEach((l) => {
    assert.ok(/^\s*html\.layout-tablet/.test(l), '태블릿 전용이어야 한다: ' + l.trim());
});

/* ---------- JS: 가려지는 높이 계산 ---------- */
const fn = extractFunction(app, 'function computeDefectListObstruction()');
function run({ open = true, side = { left: 0, top: 100, right: 250, bottom: 1000 }, card, dock }) {
    const rect = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top });
    const els = {
        side: { r: side },
        card: card && { r: card.r, d: card.d || 'flex' },
        dock: dock && { r: dock.r, d: dock.d || 'block' }
    };
    const wrap = (e) => e && { getBoundingClientRect: () => rect(e.r), _d: e.d };
    const ctx = {
        document: {
            body: { classList: { contains: (c) => c === 'defect-modal-open' && open } },
            querySelector: (sel) => sel.includes('inspect-sidebar-left') ? wrap(els.side) : sel.includes('defect-drawer-card') ? wrap(els.card) : null,
            getElementById: (id) => id === 'mobileMapDock' ? wrap(els.dock) : null
        },
        window: { getComputedStyle: (el) => ({ display: el._d || 'block', visibility: 'visible' }) },
        Math
    };
    vm.createContext(ctx);
    return vm.runInContext('(' + fn.replace('function computeDefectListObstruction', 'function') + ')()', ctx);
}
// 폰 세로: 바닥 시트(위 500) + 시트 위로 올라온 툴바(위 458) → 목록 아래 542만큼 가려짐
assert.strictEqual(run({ card: { r: { left: 0, top: 500, right: 390, bottom: 1000 } }, dock: { r: { left: 4, top: 458, right: 386, bottom: 500 } } }), 542);
// 시트만
assert.strictEqual(run({ card: { r: { left: 0, top: 600, right: 390, bottom: 1000 } } }), 400);
// 태블릿 가로/세로 769+: 우측 플로팅 창은 목록과 가로로 안 겹침, 툴바도 목록 오른쪽 → 0
assert.strictEqual(run({ card: { r: { left: 386, top: 53, right: 786, bottom: 770 } }, dock: { r: { left: 269, top: 1232, right: 792, bottom: 1274 } }, side: { left: 7, top: 141, right: 256, bottom: 1273 } }), 0);
// 숨겨진 툴바는 무시
assert.strictEqual(run({ card: { r: { left: 386, top: 53, right: 786, bottom: 770 } }, dock: { r: { left: 4, top: 300, right: 700, bottom: 340 }, d: 'none' } }), 0);
// 창이 닫혀 있으면 0
assert.strictEqual(run({ open: false, card: { r: { left: 0, top: 500, right: 390, bottom: 1000 } } }), 0);
// 목록창 위쪽까지 가리면 목록 전체 높이를 넘지 않는다
assert.strictEqual(run({ card: { r: { left: 0, top: 10, right: 390, bottom: 1000 } } }), 900);

/* ---------- JS 연결 ---------- */
assert.ok(/new MutationObserver\([\s\S]{0,400}defect-modal-open[\s\S]{0,400}scheduleDefectListObstructionSync/.test(app), 'body.defect-modal-open 변화에 연결되어야 한다');
assert.ok(/classList\.add\('bsa-list-obstructed'\)/.test(app) && /classList\.remove\('bsa-list-obstructed'\)/.test(app), '열림/닫힘에 클래스 토글');
assert.ok(/removeProperty\('--bsa-list-obstruct'\)/.test(app), '닫으면 변수 제거 → 원래 크기');

console.log('test-list-panel-obstruct: OK');
