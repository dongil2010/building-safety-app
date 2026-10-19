/* 2026-10-19 사진 앨범 썸네일 찌그러짐(PC) · 통계 표 잘림/찌그러짐 · PC 휠 클릭 끌기 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pan = require(path.join(root, 'js', 'core', 'middle-drag-pan.js'));

const css = read('styles.css');
const html = read('index.html');

// 1) 앨범: 행은 카드 본래 높이, PC split에서는 앨범 칸 전체가 스크롤(그리드가 눌리지 않음)
assert.ok(/\.survey-album-grid \{\s*grid-auto-rows: max-content;/.test(css), '앨범 행 높이 = 카드 높이');
const tail = css.slice(css.indexOf('2026-10-19 「pc에서 이따구임」'));
assert.ok(tail.length > 100, '앨범 수정 블록');
assert.ok(/#tab-survey \.survey-album-panel \{[^}]*overflow-y: auto;/.test(tail), 'PC: 앨범 칸이 스크롤');
assert.ok(/#tab-survey \.survey-album-grid \{[^}]*flex: 0 0 auto;[^}]*overflow: visible;/.test(tail), 'PC: 그리드는 눌리지 않음');
assert.ok(/#tab-survey \.survey-album-panel \.table-container \{[^}]*flex: 0 0 auto;/.test(tail), '앨범 안 균열 게이지 표가 본문 표 높이 규칙을 안 받음');
assert.ok(/\.survey-album-photo-wrap \{\s*aspect-ratio: 4 \/ 3;/.test(css), '사진칸 4:3 유지');

// 2) 통계: 표는 본래 크기(찌그러뜨리지 않음), 넘치면 상자 안에서 끌기
assert.ok(/#tab-stats \.stats-table-wrap > table \{\s*width: max-content;\s*min-width: 100%;/.test(tail), '표 본래 폭');
assert.ok(/#tab-stats \.stats-table-wrap th,[\s\S]{0,200}white-space: nowrap;/.test(tail), '칸 줄바꿈으로 찌그러뜨리지 않음');
assert.ok(/#tab-stats \.stats-table-wrap \{[^}]*overflow: auto;[^}]*touch-action: pan-x pan-y;/.test(tail), '가로·세로 손가락 끌기');
assert.ok(/@media \(max-width: 768px\) \{[\s\S]{0,200}#tab-stats \.stats-table-wrap \{\s*max-height: none;/.test(tail), '폰: 표 안 세로 상자 없음');
assert.ok(/<script src="js\/core\/middle-drag-pan\.js\?v=[^"]+"><\/script>[\s\S]*<script src="app\.js\?v=/.test(html), 'middle-drag-pan.js 읽음');

// 3) 휠 클릭 끌기 helper
assert.strictEqual(pan.nextScroll(100, 30, 500), 70);
assert.strictEqual(pan.nextScroll(10, 30, 500), 0);
assert.strictEqual(pan.nextScroll(480, -50, 500), 500);
function el(o) { return Object.assign({ nodeType: 1, scrollWidth: 100, clientWidth: 100, scrollHeight: 100, clientHeight: 100, scrollLeft: 0, scrollTop: 0, parentElement: null, style: { overflowX: 'visible', overflowY: 'visible' } }, o); }
const page = el({ style: { overflowX: 'hidden', overflowY: 'auto' }, scrollHeight: 3000, clientHeight: 800 });
const wrap = el({ style: { overflowX: 'auto', overflowY: 'auto' }, scrollWidth: 900, clientWidth: 300, parentElement: page });
const cell = el({ parentElement: wrap });
const gs = (e) => e.style;
let s = pan.findScrollers(cell, gs, null);
assert.strictEqual(s.x, wrap, '가로는 표 상자');
assert.strictEqual(s.y, page, '세로는 표 상자가 안 넘치면 페이지');
const hiddenBox = el({ style: { overflowX: 'hidden', overflowY: 'hidden' }, scrollWidth: 900, clientWidth: 300, parentElement: page });
s = pan.findScrollers(el({ parentElement: hiddenBox }), gs, null);
assert.strictEqual(s.x, null, 'overflow:hidden 상자는 끌지 않음');

// 4) 이벤트: 왼쪽 클릭은 손대지 않고, 휠 클릭(1)만 끌기
{
    const L = {};
    const docEl = { classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); } } };
    const target = Object.assign(el({ parentElement: wrap }), { closest: (sel) => (sel === pan.TARGETS ? wrap : null) });
    const doc = {
        addEventListener(t, f) { L[t] = f; }, documentElement: docEl, scrollingElement: page,
        defaultView: { getComputedStyle: gs, addEventListener() {} }
    };
    pan.install(doc);
    let prevented = 0;
    const ev = (o) => Object.assign({ target, preventDefault() { prevented++; } }, o);
    L.mousedown(ev({ button: 0, clientX: 100, clientY: 100 }));
    L.mousemove(ev({ buttons: 1, clientX: 20, clientY: 20 }));
    assert.strictEqual(prevented, 0, '왼쪽 클릭·끌기는 그대로(선택)');
    assert.strictEqual(wrap.scrollLeft, 0);
    L.mousedown(ev({ button: 1, clientX: 100, clientY: 100 }));
    assert.strictEqual(prevented, 1, '휠 클릭: 자동 스크롤 화살표 대신 끌기');
    assert.ok(docEl.classList.s.has('bsa-middle-panning'));
    L.mousemove(ev({ buttons: 4, clientX: 40, clientY: 60 }));
    assert.strictEqual(wrap.scrollLeft, 60, '왼쪽으로 끌면 오른쪽 내용');
    assert.strictEqual(page.scrollTop, 40);
    L.mouseup(ev({ button: 1 }));
    assert.ok(!docEl.classList.s.has('bsa-middle-panning'));
    const outside = Object.assign(el({}), { closest: () => null });
    const before = prevented;
    L.mousedown({ button: 1, target: outside, clientX: 0, clientY: 0, preventDefault() { prevented++; } });
    assert.strictEqual(prevented, before, '도면 등 다른 곳의 휠 클릭은 기존 동작 그대로');
}

console.log('test-album-stats-overflow: ok');
