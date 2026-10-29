#!/usr/bin/env node
'use strict';
/**
 * 2026-10-29: 점검 중 도면 층 선택(#floorSelect) 바텀시트는 옵션이 많아도 검색 칸을 띄우지 않고
 * 드래그(스크롤)로만 찾는다. 다른 select는 기존대로 10개 이상이면 검색 칸.
 * 열 때 현재 선택 층으로 자동 스크롤되는지도 확인.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function el(id) {
    return { id, hidden: false, value: '', innerHTML: '', textContent: '',
        classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
        setAttribute() {}, focusCalls: 0, focus() { this.focusCalls += 1; }, querySelector() { return null; } };
}
function run(selId, n) {
    const els = {};
    ['bsaSelectSheet', 'bsaSelectSheetTitle', 'bsaSelectSheetSearchWrap', 'bsaSelectSheetSearch', 'bsaSelectSheetList'].forEach((k) => { els[k] = el(k); });
    let scrolled = null;
    els.bsaSelectSheetList.querySelector = (q) => (/is-selected/.test(q) && /is-selected/.test(els.bsaSelectSheetList.innerHTML)
        ? { closest: () => ({ offsetTop: 1200, offsetHeight: 40 }) } : null);
    Object.defineProperty(els.bsaSelectSheetList, 'scrollTop', { set(v) { scrolled = { top: v }; }, get() { return scrolled ? scrolled.top : 0; } });
    els.bsaSelectSheetList.clientHeight = 580;
    const options = Array.from({ length: n }, (_, i) => ({ tagName: 'OPTION', value: 'F' + i, textContent: (i + 1) + '층' }));
    const sel = { id: selId, value: 'F' + (n - 2), options, children: options, getAttribute: () => '', title: '', closest: () => null };
    const timers = [];
    const ctx = vm.createContext({
        window: {}, Date, String, Array, requestAnimationFrame: (f) => f(), setTimeout: (f) => timers.push(f),
        document: { getElementById: (k) => els[k] || null, body: { classList: { add() {}, remove() {} } }, querySelector: () => null },
        escapeHtml: (s) => String(s)
    });
    const a = app.indexOf('function getBsaSelectSheetTitle(');
    const b = app.indexOf('function bindBsaSelectSheet(', a);
    assert.ok(a >= 0 && b > a, '선택 시트 함수 위치');
    vm.runInContext(app.slice(a, b), ctx);
    ctx.openBsaSelectSheet(sel);
    timers.forEach((f) => f());
    return { searchHidden: els.bsaSelectSheetSearchWrap.hidden, focus: els.bsaSelectSheetSearch.focusCalls, scrolled, open: els.bsaSelectSheet.classList.contains('open') };
}
const floor = run('floorSelect', 40);
assert.ok(floor.open, '층 선택 시트 열림');
assert.strictEqual(floor.searchHidden, true, '층 선택은 40개여도 검색 칸 없음');
assert.strictEqual(floor.focus, 0, '검색 칸 포커스(키보드) 없음');
assert.ok(floor.scrolled, '현재 선택 층으로 자동 스크롤');
assert.strictEqual(floor.scrolled.top, 1200 - 270, '선택 층이 목록 가운데 오게');
const other = run('defectType', 12);
assert.strictEqual(other.searchHidden, false, '다른 select는 10개 이상이면 검색 칸 유지');
assert.strictEqual(other.focus, 1);
assert.strictEqual(run('defectType', 5).searchHidden, true, '10개 미만은 검색 칸 없음');
console.log('test-floor-select-no-search: ok');
