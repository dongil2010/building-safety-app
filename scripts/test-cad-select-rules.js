#!/usr/bin/env node
'use strict';
/**
 * 2026-11-17 CAD식 마킹 선택 (결함위치도·비파괴 공통)
 * - 클릭·드래그 = 새로 고름 / Ctrl(⌘)+클릭·드래그 = 더함 / Shift+클릭·드래그 = 뺌
 * - 폰·태블릿: 우측 레일 「추가」 단추가 끔 → 더하기 → 빼기 → 끔
 * - PC 마우스로 Ctrl·Shift를 누른 채 누르면 마킹 위에서도 고르기 네모(끌지 않고 떼면 그 마킹 하나만)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const fn = (name) => extractFunction(app, 'function ' + name + '(');

const R = new Function(`
${fn('resolveCadSelectMode')}
${fn('applyCadSelection')}
${fn('nextTouchSelectAddMode')}
${fn('cadMarqueeColors')}
${fn('ndtTouchTapAction')}
return { resolveCadSelectMode, applyCadSelection, nextTouchSelectAddMode, cadMarqueeColors, ndtTouchTapAction };
`)();

// ── 1) 수정키·레일 단추 → 고르기 방식 ──
const mode = R.resolveCadSelectMode;
assert.strictEqual(mode({}, ''), 'replace', '그냥 = 새로 고름');
assert.strictEqual(mode(null, undefined), 'replace');
assert.strictEqual(mode({ ctrlKey: true }, ''), 'add', 'Ctrl = 더함');
assert.strictEqual(mode({ metaKey: true }, ''), 'add', '⌘ = 더함');
assert.strictEqual(mode({ shiftKey: true }, ''), 'remove', 'Shift = 뺌');
assert.strictEqual(mode({ ctrlKey: true, shiftKey: true }, ''), 'remove', 'Ctrl+Shift = 뺌(Shift 우선)');
assert.strictEqual(mode({}, 'add'), 'add', '레일 더하기');
assert.strictEqual(mode({}, 'remove'), 'remove', '레일 빼기');
assert.strictEqual(mode({ shiftKey: true }, 'add'), 'remove', '수정키가 레일보다 우선');
assert.strictEqual(mode({}, 'junk'), 'replace');

// ── 2) 선택 묶음 바꾸기 ──
const apply = (start, ids, m) => [...R.applyCadSelection(new Set(start), ids, m)].sort();
assert.deepStrictEqual(apply(['A', 'B'], ['C', 'D'], 'replace'), ['C', 'D'], '새로 고름 = 네모 안 것만');
assert.deepStrictEqual(apply(['A', 'B'], [], 'replace'), [], '빈 곳 클릭(네모 없음) = 해제');
assert.deepStrictEqual(apply(['A', 'B'], ['B', 'C'], 'add'), ['A', 'B', 'C'], '더함: 이미 고른 B는 그대로(빼지 않음)');
assert.deepStrictEqual(apply(['A', 'B', 'C'], ['B', 'Z'], 'remove'), ['A', 'C'], '뺌: 없는 Z는 무시');
assert.deepStrictEqual(apply(['A'], [], 'add'), ['A'], '더함인데 아무것도 안 잡힘 = 그대로');
assert.deepStrictEqual(apply(['A'], [], 'remove'), ['A'], '뺌인데 아무것도 안 잡힘 = 그대로');
assert.deepStrictEqual(apply([], ['', null, 'A'], 'add'), ['A'], '빈 id는 건너뜀');
assert.deepStrictEqual(apply(['A'], new Set(['B']), 'add'), ['A', 'B'], 'Set도 받음');
const same = new Set(['A']);
assert.strictEqual(R.applyCadSelection(same, ['B'], 'add'), same, '제자리에서 바꿈(window.getSelectedDefectIds가 같은 Set을 봄)');

// ── 3) 레일 「추가」 단추 순환 ──
assert.strictEqual(R.nextTouchSelectAddMode(''), 'add');
assert.strictEqual(R.nextTouchSelectAddMode('add'), 'remove');
assert.strictEqual(R.nextTouchSelectAddMode('remove'), '');
assert.notStrictEqual(R.cadMarqueeColors('remove').stroke, R.cadMarqueeColors('add').stroke, '네모 색: 더함·뺌이 다름');
assert.notStrictEqual(R.cadMarqueeColors('replace').stroke, R.cadMarqueeColors('add').stroke);

// ── 4) 비파괴 터치 탭 ──
assert.strictEqual(R.ndtTouchTapAction({ wasSelected: true }, false, 'remove'), 'remove');
assert.strictEqual(R.ndtTouchTapAction({ wasSelected: false }, false, 'add'), 'add');
assert.strictEqual(R.ndtTouchTapAction({ wasSelected: true }, false, ''), 'open');

// ── 5) 비파괴 고르기 네모 끝: 실제 함수를 흉내 환경에서 돌림 ──
const N = new Function(`
let isNdtMarqueeSelecting = true, ndtMarqueeMode = 'replace', ndtMode = 'PAN';
let ndtMarqueeStartX = 0, ndtMarqueeStartY = 0, ndtMarqueeCurX = 0, ndtMarqueeCurY = 0;
let selectedNdtIds = new Set();
let netHits = [], keyAt = '';
function collectNdtMarqueeHits() { return netHits.slice(); }
function ndtSelKeyAt() { return keyAt; }
function updateNdtSelectionBar() {} function drawNdtCanvas() {}
const document = { getElementById: () => null };
${fn('applyCadSelection')}
${fn('finishNdtMarqueeSelection')}
return {
    run(start, m, hits, key, dist) {
        selectedNdtIds = new Set(start); ndtMarqueeMode = m; netHits = hits; keyAt = key;
        ndtMarqueeStartX = 0; ndtMarqueeStartY = 0; ndtMarqueeCurX = 50; ndtMarqueeCurY = 50;
        isNdtMarqueeSelecting = true;
        finishNdtMarqueeSelection(dist);
        return { sel: [...selectedNdtIds].sort(), mode: ndtMarqueeMode, on: isNdtMarqueeSelecting };
    }
};
`)();
let r = N.run(['A'], 'replace', ['B', 'C'], '', 40);
assert.deepStrictEqual(r.sel, ['B', 'C'], '그냥 드래그 = 새로 고름');
assert.strictEqual(r.mode, 'replace', '끝나면 방식 원래대로');
assert.strictEqual(r.on, false);
assert.deepStrictEqual(N.run(['A'], 'replace', ['B'], 'A', 3).sel, [], '그냥 클릭(빈 곳) = 해제');
assert.deepStrictEqual(N.run(['A'], 'add', ['B', 'C'], '', 40).sel, ['A', 'B', 'C'], 'Ctrl+드래그 = 더함');
assert.deepStrictEqual(N.run(['A', 'B', 'C'], 'remove', ['B', 'C'], '', 40).sel, ['A'], 'Shift+드래그 = 뺌');
assert.deepStrictEqual(N.run(['A'], 'add', ['X'], 'B', 3).sel, ['A', 'B'], 'Ctrl+클릭 = 누른 마킹 하나 더함');
assert.deepStrictEqual(N.run(['A', 'B'], 'remove', ['X'], 'B', 3).sel, ['A'], 'Shift+클릭 = 누른 마킹 하나 뺌');
assert.deepStrictEqual(N.run(['A', 'B'], 'remove', ['X'], '', 3).sel, ['A', 'B'], 'Shift+빈 곳 클릭 = 그대로');

// ── 6) 결함위치도 코드가 이 규칙을 쓰는지 ──
const start = fn('handleDragStart');
assert.ok(start.includes('const selMode = resolveCadSelectMode(mods, mobileSelectAddMode);'), '수정키·레일 → 방식');
const modIdx = start.indexOf("if (!isTouch && selMode !== 'replace' && state.mode === 'PAN'");
const hitIdx = start.indexOf('const hitInfoRaw = findHitPinPart(imgX, imgY);');
assert.ok(modIdx > 0 && hitIdx > modIdx, 'Ctrl·Shift 마우스는 마킹 잡기보다 먼저 고르기 네모');
assert.ok(/beginMapMarquee\(imgX, imgY, selMode\);\s*return;/.test(start.slice(modIdx, hitIdx)));
assert.ok(!/selectedDefectIds\.clear\(\);\s*updateMapSelectionBar\(\);\s*drawCanvas\(\);\s*if \(!isTouch\)/.test(start),
    '마우스 빈 곳 누르는 순간 해제(네모 막던 것) 없음');
assert.ok(start.includes("const clearOnTap = state.mode === 'PAN' && selMode === 'replace'"), '더하기·빼기 중 빈 곳 탭은 해제 안 함');
assert.ok(start.includes("pendingDragHit = { hitInfo, imgX, imgY, additive: selMode !== 'replace', selMode };"));

const end = fn('handleDragEnd');
assert.ok(end.includes("applyCadSelection(selectedDefectIds, [d.id], tapHit.selMode === 'remove' ? 'remove' : 'add');"),
    '터치 「추가」 탭: 더하기·빼기 (토글 아님)');
const mq = end.slice(end.indexOf('if (isMarqueeSelecting) {'));
assert.ok(mq.includes('applyCadSelection(selectedDefectIds, mqIds, mqMode);'), '네모 끝 = 같은 규칙');
assert.ok(mq.includes('const pick = findHitPinPart(marqueeStartImgX, marqueeStartImgY);'), 'Ctrl·Shift+클릭 = 누른 자리 마킹');
assert.ok(mq.includes("mqMode === 'replace' && selectedDefectIds.size === 1"), '네모로 하나 고르면 수정창은 새로 고를 때만');
assert.ok(!/marqueeAdditive|mobileAddSelectEnabled|ndtAddSelectEnabled|ndtMarqueeAdditive/.test(app), '예전 토글 변수 없음');

// 마우스 이벤트가 Shift를 넘겨줌(도면·메모 덮개)
assert.ok(/handleDragStart\(e\.clientX, e\.clientY, false, false, \{\s*ctrlKey: e\.ctrlKey,\s*metaKey: e\.metaKey,\s*shiftKey: e\.shiftKey/.test(app), '도면 mousedown → Shift');
assert.ok(app.includes('{ ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey }'), '메모 덮개 → Shift');

// ── 7) 비파괴 마우스도 같은 규칙 ──
assert.ok(app.includes('const selMode = resolveCadSelectMode(e, ndtSelectAddMode);'), '비파괴 mousedown');
assert.ok(/if \(additive && ndtMode === 'PAN'\) \{\s*beginNdtMarquee\(vx, vy, e\.clientX, e\.clientY, selMode\);/.test(app), '비파괴 Ctrl·Shift = 고르기 네모');
assert.ok(app.includes("resolveCadSelectMode(null, ndtSelectAddMode)"), '비파괴 터치 범위선택도 레일 방식');
assert.ok(app.includes('&& !ndtSelectAddMode;'), '비파괴 더하기·빼기 중 빈 곳 탭은 해제 안 함');

// ── 8) 화면 글 ──
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/id="btnModePan"[^>]*Shift\+클릭·드래그: 선택에서 뺌/.test(html), '선택 단추 안내');
assert.ok(/id="btnNdtModePan"[^>]*Shift\+클릭·드래그=선택에서 뺌/.test(html), '비파괴 선택 단추 안내');
assert.ok(/id="mobileBtnAddSelect"[^>]*더하기[^>]*빼기/.test(html) && /id="mobileNdtBtnAddSelect"[^>]*더하기[^>]*빼기/.test(html));
assert.ok(fn('syncTouchSelectAddBtn').includes("'빼기'") && fn('syncTouchSelectAddBtn').includes("'더하기'"));

console.log('test-cad-select-rules: ok');
