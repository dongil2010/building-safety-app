'use strict';
// 2026-10-19 「도면 확대 축소하고 드래그 하려면 처음 드래그는 씹히고 다음 드래그 부터 이동함」 회귀 테스트
// 원인: 두 손가락(핀치) 뒤에는 모든 손가락을 떼고 250ms 지날 때까지 한 손가락 터치를 통째로 버렸고,
//       핀치 끝에 남은 손가락도 아무 동작이 없었다 → 확대 직후 첫 끌기가 무시됨.
// 고침: 그 동안에도 도면 이동(팬)만은 바로(점·선택·그리기는 여전히 막음), 핀치 끝 남은 손가락은 바로 팬.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const ts = src.indexOf("elements.planCanvas.addEventListener('touchstart', (e) => {");
assert.ok(ts > 0, 'touchstart handler');
const tsBody = src.slice(ts, src.indexOf('}, { passive: false });', ts));
// 1) 대기 중 한 손가락 → 팬 전용(forcePan=true)으로 시작, 그대로 return(마킹·탭 경로로 안 감)
const cool = tsBody.indexOf('if (touchMultiActive || Date.now() < touchCooldownUntil) {');
assert.ok(cool > 0, '대기 분기');
const coolBlock = tsBody.slice(cool, tsBody.indexOf('}', cool) + 1);
assert.ok(/handleDragStart\(e\.touches\[0\]\.clientX, e\.touches\[0\]\.clientY, true, true\);\s*return;/.test(coolBlock), '대기 중엔 팬만');
assert.ok(!/if \(touchMultiActive \|\| Date\.now\(\) < touchCooldownUntil\) return;/.test(tsBody), '예전처럼 통째로 버리지 않음');
// 대기 분기가 메모·부재수 탭(memoTapStart)과 일반 handleDragStart보다 먼저
assert.ok(cool < tsBody.indexOf('memoTapStart('), '메모 탭보다 먼저');

// 2) 핀치 끝에 한 손가락이 남으면 바로 팬
const te = src.indexOf("window.addEventListener('touchend', (e) => {");
const teBody = src.slice(te, src.indexOf('});', src.indexOf('if (memoTap && e.touches.length === 0) memoTapEnd();', te)));
assert.ok(/isPinching = false;\s*\/\/[^\n]*\n\s*if \(e\.touches\.length === 1\) handleDragStart\(e\.touches\[0\]\.clientX, e\.touches\[0\]\.clientY, true, true\);/.test(teBody), '남은 손가락 팬');

// 3) 팬 전용 시작(forcePan)은 현재 화면 위치에서 출발하고 점·선택 판정을 하지 않는다
function fn(name) {
    const i = src.indexOf('function ' + name + '(');
    let j = src.indexOf(') {', i) + 2, d = 0;
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
    }
    throw new Error(name);
}
const start = fn('handleDragStart');
const fp = start.slice(start.indexOf('if (forcePan) {'), start.indexOf('if (isEvalMarkingLock())'));
assert.ok(fp.includes('initialOffsetX = state.view.offsetX;') && fp.includes('isDragging = true;') && fp.includes('pendingDragHit = null;') && fp.includes('return;'));
assert.ok(!fp.includes('findHitPinPart'), '팬 전용은 마킹 판정 없음');

// 4) 깨끗한 탭 규칙(두 손가락 닿은 탭은 점 아님)은 그대로
const rule = src.slice(src.indexOf('function isCleanTouchTap('), src.indexOf('window.__bsaTouchTapRule'));
assert.ok(rule.includes('if (!tap || tap.multi) return false;'));

// 5) PC: 휠 확대는 끌기 상태·대기 시간을 건드리지 않음(가운데 단추 끌기 바로 됨)
const wh = src.indexOf("elements.planCanvas.addEventListener('wheel', (e) => {");
const whBody = src.slice(wh, src.indexOf('}, { passive: false });', wh));
assert.ok(!/isDragging|touchCooldownUntil|mapSuppressMouseUntil|activePointerIsTouch/.test(whBody), '휠 확대는 끌기 막지 않음');
const md = src.indexOf("elements.planCanvas.addEventListener('mousedown', (e) => {");
const mdBody = src.slice(md, src.indexOf("elements.planCanvas.addEventListener('auxclick'", md));
assert.ok(/if \(e\.button === 1\) \{\s*e\.preventDefault\(\);\s*handleDragStart\(e\.clientX, e\.clientY, false, true\);/.test(mdBody), '가운데 단추 = 바로 팬');

console.log('test-map-pan-after-zoom: ok');
