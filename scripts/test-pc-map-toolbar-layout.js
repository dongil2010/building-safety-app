#!/usr/bin/env node
'use strict';
/**
 * 2026-11-28 PC 결함위치도(#tab-map) 상단 툴바 1줄 최적화 검증:
 * - 기존 버튼 id 유지 + 3개 드롭다운(도면·정리·출력) 배치 + 인라인 그라데이션 제거
 * - 중복 이모지(📍·🟧·📝) 제거(PC #tab-map만, 모바일 레일/NDT 유지) + 짧은 라벨
 * - 줌 순서(-, %, +, 맞춤) + 우측 고정
 * - 드롭다운 JS 동작(토글·다른 드롭다운 전환·항목 클릭 후 닫힘·바깥 클릭 capture·Esc·blur)
 * - 마킹 맞추기 대기 표시(도면 ▾ 배지 + 조건부 빠른 버튼) + 탭 전환 시 닫기
 * - CSS: 모바일/태블릿 숨김·레이아웃 보존, 드롭다운 position:absolute(툴바 높이 유지)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

const mapStart = html.indexOf('id="mapCanvasTopToolbar"');
assert.ok(mapStart > 0, 'mapCanvasTopToolbar 존재');
const mapEnd = html.indexOf('id="mapStyleSizeToolbar"', mapStart);
assert.ok(mapEnd > mapStart, 'mapStyleSizeToolbar 경계');
const pcToolbar = html.slice(mapStart, mapEnd);

// 1) 기존 버튼 ID 모두 유지 + 인라인 linear-gradient 제거
const requiredIds = [
    'btnModePan', 'btnModeMark', 'btnModeArea', 'btnModeMemo', 'btnMeasureDistance',
    'btnSnapToCad', 'btnToggleCrosshair', 'btnGridLines',
    'btnToggleDefectList', 'btnToggleMapStyleSize', 'btnDetailLocPopup', 'btnBoxAutoLayout',
    'btnEditFloorDrawing', 'btnRotateDrawing', 'btnImportCadPins', 'btnAlignMarkingsToDrawing',
    'btnAlignMarkingsPendingQuick',
    'btnCompactMarkingGaps', 'btnClearDefectContents',
    'btnExportFloorDrawing', 'btnExportFloorSvg',
    'inputImportCadPins',
    'btnZoomOut', 'zoomScaleText', 'btnZoomIn', 'btnZoomFit',
    'areaToolPanel'
];
requiredIds.forEach((id) => {
    assert.ok(pcToolbar.includes(`id="${id}"`), `PC 툴바에 id="${id}" 유지`);
});
assert.ok(!/linear-gradient/i.test(pcToolbar), 'PC 툴바 안 인라인 linear-gradient 없음');
assert.ok(!/style="background:/i.test(pcToolbar), 'PC 툴바 안 인라인 배경색 없음');

// 2) 성격별 그룹 + 드롭다운 3개 + areaToolPanel 마지막 배치
const modeGroupIdx = pcToolbar.indexOf('class="toolbar-mode-group"');
const assistGroupIdx = pcToolbar.indexOf('class="toolbar-assist-group"');
const actionGroupIdx = pcToolbar.indexOf('class="toolbar-action-group"');
const drawMenuIdx = pcToolbar.indexOf('id="toolbarMenuDrawing"');
const cleanMenuIdx = pcToolbar.indexOf('id="toolbarMenuCleanup"');
const exportMenuIdx = pcToolbar.indexOf('id="toolbarMenuExport"');
const areaPanelIdx = pcToolbar.indexOf('id="areaToolPanel"');
assert.ok(modeGroupIdx > 0 && assistGroupIdx > modeGroupIdx && actionGroupIdx > assistGroupIdx, '모드 → 보조 → 작업 순서');
assert.ok(drawMenuIdx > actionGroupIdx && cleanMenuIdx > drawMenuIdx && exportMenuIdx > cleanMenuIdx, '도면 → 정리 → 출력 드롭다운');
assert.ok(areaPanelIdx > exportMenuIdx, 'areaToolPanel은 툴바 끝(숨김 시 1줄 공간 차지 안 함)');

const sliceMenu = (id) => {
    const s = pcToolbar.indexOf(`id="${id}"`);
    const e = pcToolbar.indexOf('</div>\n                                </div>', s);
    assert.ok(s > 0 && e > s, `${id} 블록`);
    return pcToolbar.slice(s, e);
};
const drawMenu = sliceMenu('toolbarMenuDrawing');
['btnEditFloorDrawing', 'btnRotateDrawing', 'btnImportCadPins', 'btnAlignMarkingsToDrawing'].forEach((id) => {
    assert.ok(drawMenu.includes(`id="${id}"`), `도면 메뉴 안에 ${id}`);
});
const cleanMenu = sliceMenu('toolbarMenuCleanup');
['btnCompactMarkingGaps', 'btnClearDefectContents'].forEach((id) => {
    assert.ok(cleanMenu.includes(`id="${id}"`), `정리 메뉴 안에 ${id}`);
});
const exportMenu = sliceMenu('toolbarMenuExport');
['btnExportFloorDrawing', 'btnExportFloorSvg'].forEach((id) => {
    assert.ok(exportMenu.includes(`id="${id}"`), `출력 메뉴 안에 ${id}`);
});

// 3) 중복 이모지 제거 & 라벨 단축 (모바일 레일·NDT는 손대지 않음)
const modeSlice = pcToolbar.slice(modeGroupIdx, assistGroupIdx);
assert.ok(!/[📍🟧📝]/.test(modeSlice), 'PC 모드 버튼 중복 이모지 없음');
assert.ok(/fa-vector-square/.test(modeSlice) && !/fa-draw-square/.test(modeSlice), '유효한 FontAwesome 영역 아이콘');
assert.ok(/id="btnModeMark"[\s\S]*?>\s*<i[^>]*><\/i>\s*핀\s*<span/.test(modeSlice), '핀 라벨 단축');
assert.ok(/id="btnModeArea"[\s\S]*?>\s*<i[^>]*><\/i>\s*영역\s*<span/.test(modeSlice), '영역 라벨 단축');
assert.ok(/id="btnBoxAutoLayout"[^>]*>\s*박스 정리\s*<\/button>/.test(pcToolbar), '박스 정리 라벨 단축');
assert.ok(/id="btnAlignMarkingsPendingQuick"[^>]*hidden/.test(pcToolbar), '대기 중 빠른 버튼 기본 hidden');
assert.ok(html.includes('id="mobileMapSideRail"') && html.includes('<span>핀</span>'), '모바일 레일 유지');
assert.ok(html.includes('id="btnNdtModeMark"') && html.includes('[NDT 위치 마킹]'), 'NDT 툴바 유지');

// 4) 줌 순서: 축소(-) → 배율 → 확대(+) → 맞춤
const zOut = pcToolbar.indexOf('id="btnZoomOut"');
const zPct = pcToolbar.indexOf('id="zoomScaleText"');
const zIn = pcToolbar.indexOf('id="btnZoomIn"');
const zFit = pcToolbar.indexOf('id="btnZoomFit"');
assert.ok(zOut > 0 && zOut < zPct && zPct < zIn && zIn < zFit, '줌 순서: - 100% + 맞춤');

// 5) app.js 연결 + 실제 드롭다운 동작 시험
assert.ok(/function initPcMapToolbarDropdowns\(\)/.test(app), 'initPcMapToolbarDropdowns 존재');
assert.ok(/addEventListener\('pointerdown',[\s\S]{0,500}closeAllPcMapToolbarDropdowns[\s\S]{0,60},\s*true\)/.test(app), '바깥 클릭 capture로 닫기');
assert.ok(/e\.key !== 'Escape'[\s\S]{0,260}closeAllPcMapToolbarDropdowns/.test(app), 'Esc로 닫기');
assert.ok(/MAP_FLOATING_OVERLAY_SELECTOR[\s\S]{0,400}'\.toolbar-dropdown-menu'/.test(app), '드롭다운 메뉴 터치·클릭 도면 격리');
assert.ok(/btnToolbarMenuDrawing[\s\S]{0,120}has-align-pending/.test(app), '도면 ▾ 배지 동기화');
assert.ok(/btnAlignMarkingsPendingQuick[\s\S]{0,120}quickBtn\.hidden = !pending/.test(app), '마킹 맞추기 대기 시 빠른 버튼 표시');
assert.ok(/window\.switchTab[\s\S]{0,260}closePcMapToolbarDropdowns/.test(app), '탭 전환 시 드롭다운 닫기');

// 모의 DOM으로 드롭다운 열기·전환·항목클릭·바깥클릭·Esc·blur 검증
{
    function makeClassList() {
        const set = new Set();
        return {
            add: (...xs) => xs.forEach((x) => set.add(x)),
            remove: (...xs) => xs.forEach((x) => set.delete(x)),
            contains: (x) => set.has(x),
            toggle: (x, force) => {
                const on = force === undefined ? !set.has(x) : !!force;
                if (on) set.add(x); else set.delete(x);
                return on;
            }
        };
    }
    function makeNode(tag, opts) {
        const listeners = { bubble: {}, capture: {} };
        const n = Object.assign({
            tagName: tag,
            dataset: {},
            attrs: {},
            hidden: false,
            focused: false,
            classList: makeClassList(),
            setAttribute(k, v) { this.attrs[k] = String(v); },
            getAttribute(k) { return this.attrs[k]; },
            focus() { this.focused = true; },
            addEventListener(type, fn, cap) {
                const bucket = cap ? listeners.capture : listeners.bubble;
                (bucket[type] = bucket[type] || []).push(fn);
            },
            dispatch(type, ev, phase) {
                const list = (phase === 'capture' ? listeners.capture[type] : listeners.bubble[type]) || [];
                for (const fn of list) fn(ev);
            },
            closest(sel) {
                if (sel === 'button' && this.tagName === 'BUTTON') return this;
                if (sel === '#tab-map .canvas-top-toolbar .toolbar-dropdown' && this._dropdown) return this._dropdown;
                return null;
            }
        }, opts || {});
        return n;
    }
    function makeDropdown(name) {
        const dd = makeNode('DIV');
        const trigger = makeNode('BUTTON', { _dropdown: dd });
        const menu = makeNode('DIV', { hidden: true, _dropdown: dd });
        const item = makeNode('BUTTON', { _dropdown: dd });
        dd._dropdown = dd;
        dd.querySelector = (s) => {
            if (s === '.toolbar-dropdown-trigger') return trigger;
            if (s === '.toolbar-dropdown-menu') return menu;
            return null;
        };
        return { name, dd, trigger, menu, item };
    }

    const dDraw = makeDropdown('drawing');
    const dClean = makeDropdown('cleanup');
    const toolbar = makeNode('DIV');
    toolbar.querySelector = (s) => (s === '.toolbar-dropdown.is-open' ? [dDraw.dd, dClean.dd].find((d) => d.classList.contains('is-open')) || null : null);
    toolbar.querySelectorAll = (s) => (s === '.toolbar-dropdown' ? [dDraw.dd, dClean.dd] : []);

    const docNode = makeNode('DOCUMENT');
    docNode.querySelector = (s) => (s === '#tab-map .canvas-top-toolbar' ? toolbar : null);
    const winNode = makeNode('WINDOW');

    const closeSrc = extractFunction(app, 'function closeAllPcMapToolbarDropdowns(');
    const initSrc = extractFunction(app, 'function initPcMapToolbarDropdowns(');
    const ctx = { document: docNode, window: winNode };
    vm.createContext(ctx);
    vm.runInContext(`${closeSrc}\n${initSrc}\ninitPcMapToolbarDropdowns();`, ctx);

    const makeEv = (target, extra) => Object.assign({
        target,
        defaultPrevented: false,
        stopped: false,
        stoppedImmediate: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stoppedImmediate = true; }
    }, extra || {});

    // 열기
    dDraw.trigger.dispatch('click', makeEv(dDraw.trigger), 'bubble');
    assert.strictEqual(dDraw.menu.hidden, false);
    assert.strictEqual(dDraw.trigger.getAttribute('aria-expanded'), 'true');
    assert.ok(toolbar.classList.contains('has-open-dropdown'));

    // 다른 드롭다운 열면 이전 드롭다운 닫힘
    dClean.trigger.dispatch('click', makeEv(dClean.trigger), 'bubble');
    assert.strictEqual(dDraw.menu.hidden, true);
    assert.strictEqual(dClean.menu.hidden, false);

    // 메뉴 항목 클릭 시 자체 핸들러 뒤 버블 단계에서 닫힘
    let itemActionRan = false;
    dClean.item.addEventListener('click', () => { itemActionRan = true; });
    const itemEv = makeEv(dClean.item);
    dClean.item.dispatch('click', itemEv, 'bubble');
    dClean.menu.dispatch('click', itemEv, 'bubble');
    assert.ok(itemActionRan, '메뉴 항목 자체 click 동작');
    assert.strictEqual(dClean.menu.hidden, true);
    assert.ok(!toolbar.classList.contains('has-open-dropdown'));

    // 바깥 클릭(capture) 닫힘
    dDraw.trigger.dispatch('click', makeEv(dDraw.trigger), 'bubble');
    assert.strictEqual(dDraw.menu.hidden, false);
    const outsideNode = makeNode('CANVAS');
    docNode.dispatch('pointerdown', makeEv(outsideNode), 'capture');
    assert.strictEqual(dDraw.menu.hidden, true);

    // Esc(capture) 닫힘 + 포커스 복원 + stopImmediatePropagation
    dDraw.trigger.dispatch('click', makeEv(dDraw.trigger), 'bubble');
    const escEv = makeEv(outsideNode, { key: 'Escape' });
    docNode.dispatch('keydown', escEv, 'capture');
    assert.strictEqual(dDraw.menu.hidden, true);
    assert.ok(escEv.defaultPrevented && escEv.stoppedImmediate);
    assert.ok(dDraw.trigger.focused, 'Esc로 닫으면 트리거로 포커스 복원');

    // blur 닫힘
    dClean.trigger.dispatch('click', makeEv(dClean.trigger), 'bubble');
    assert.strictEqual(dClean.menu.hidden, false);
    winNode.dispatch('blur', {}, 'bubble');
    assert.strictEqual(dClean.menu.hidden, true);
}

// 6) CSS 스코프 및 높이 고정(position: absolute) 확인
const cssBlockStart = css.indexOf('2026-11-28 PC 결함위치도(#tab-map) 상단 툴바 1줄 통합');
assert.ok(cssBlockStart > 0, 'PC 툴바 CSS 섹션 존재');
const cssBlock = css.slice(cssBlockStart);
assert.ok(/@media \(min-width: 1025px\)/.test(cssBlock), '1025px 이상 PC 미디어 쿼리 스코프');
assert.ok(!/\n\s*#tab-map \.canvas-top-toolbar\s*\{/.test(cssBlock), '비-태블릿/PC 스코프 없는 맨몸 셀렉터 금지');
assert.ok(/\.toolbar-dropdown-menu\s*\{[\s\S]*?position:\s*absolute;/.test(cssBlock), '드롭다운 position: absolute로 툴바 높이 유지');
assert.ok(/\.zoom-pill-group\s*\{[\s\S]*?margin-left:\s*auto;/.test(cssBlock), '줌 그룹 우측 고정');
assert.ok(/html\.bsa-touch-ui:not\(\.layout-tablet\) #tab-map \.canvas-top-toolbar \.toolbar-assist-group/.test(cssBlock), '터치 UI 보조 그룹 숨김 시 구분선 정리');

console.log('test-pc-map-toolbar-layout: ok');
