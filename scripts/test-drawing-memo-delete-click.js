#!/usr/bin/env node
'use strict';
/**
 * 2026-10-16 「주석은 지우는 기능이 사라짐」: 주석 보기·고치기 창에서 실제로 눌러서 지워지는지(클릭 경로).
 * jsdom이 있으면 진짜 DOM에서 창을 띄워 「지우기」를 두 번 누르고 묘비(동기화)까지 확인. 없으면 구조만 검사.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const memoLib = require(path.join(__dirname, '..', 'js', 'core', 'drawing-memo.js'));
const start = app.indexOf('function openDrawingMemoMenu(');
const src = app.slice(start, app.indexOf('window.openDrawingMemoMenu = openDrawingMemoMenu;'));
assert.ok(start > 0);
// 지우기 버튼은 맨 위(✕ 옆)에 있고, 창 위에 다른 확인창(appConfirm)을 또 띄우지 않는다
const head = src.slice(src.indexOf('📝 도면 주석'), src.indexOf('data-mv-text'));
assert.ok(/data-mv="del"/.test(head), '지우기 버튼이 위쪽 머리에 있음(키보드에 안 가림)');
assert.ok(!/appConfirm\(/.test(src), '창 위에 확인창을 겹쳐 띄우지 않음');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (_e) { /* 없음 */ }
if (!JSDOM) {
    console.log('test-drawing-memo-delete-click OK (jsdom 없음 — 구조만 검사)');
    process.exit(0);
}
(async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false });
    const state = {};
    const m = memoLib.createMemo({ text: '천장 점검구\n열림', x: 5, y: 6, now: 1000 });
    memoLib.addMemo(state, 'B_1F', m);
    let commits = 0;
    const toasts = [];
    w.showToast = (t) => toasts.push(t);
    w.state = state;
    const fn = new w.Function('memoApi', 'currentMemoFloorKey', 'commitMemoChange', 'window', 'document', 'requestAnimationFrame',
        src + '\nreturn openDrawingMemoMenu;')(
        () => memoLib, () => 'B_1F', () => { commits += 1; }, w, w.document, (f) => setTimeout(f, 0));
    // 1) 고치기 → 저장(줄바꿈 유지)
    let p = fn(m.id);
    let ov = w.document.getElementById('drawingMemoViewOverlay');
    assert.ok(ov, '창이 열림');
    const ta = ov.querySelector('[data-mv-text]');
    assert.strictEqual(ta.value, '천장 점검구\n열림', '전체 내용 보임');
    ta.value = '천장 점검구\n닫힘';
    ov.querySelector('[data-mv="save"]').click();
    assert.strictEqual(await p, 'saved');
    assert.strictEqual(memoLib.listFor(state, 'B_1F')[0].text, '천장 점검구\n닫힘');
    assert.strictEqual(commits, 1);
    // 2) 지우기: 한 번 누르면 확인 상태, 두 번째에 지움 + 묘비
    p = fn(m.id);
    ov = w.document.getElementById('drawingMemoViewOverlay');
    const del = ov.querySelector('[data-mv="del"]');
    del.click();
    assert.ok(w.document.getElementById('drawingMemoViewOverlay'), '첫 번째는 확인만');
    assert.strictEqual(memoLib.listFor(state, 'B_1F').length, 1);
    del.click();
    assert.strictEqual(await p, 'deleted');
    assert.strictEqual(memoLib.listFor(state, 'B_1F').length, 0, '지워짐');
    assert.ok((state.deletedMemoIds.B_1F || []).includes(m.id), '묘비(다른 기기에서도 지워짐)');
    assert.ok(Number(state.deletedMemoAt.B_1F[m.id]) > 0);
    assert.strictEqual(commits, 2, '동기화 예약');
    assert.ok(!w.document.getElementById('drawingMemoViewOverlay'), '창 닫힘');
    // 3) 묘비가 서버 옛 사본을 이김
    const sm = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));
    memoLib.mergePackIntoState(state, 'B_1F', { items: [Object.assign({}, m, { text: '천장 점검구\n닫힘', updatedAt: state.deletedMemoAt.B_1F[m.id] })], deletedIds: [], deletedAt: {} }, sm.mergeNdtDataMaps);
    assert.strictEqual(memoLib.listFor(state, 'B_1F').length, 0, '옛 사본이 되살아나지 않음');
    console.log('test-drawing-memo-delete-click OK (jsdom 클릭 경로)');
})().catch((e) => { console.error(e); process.exit(1); });
