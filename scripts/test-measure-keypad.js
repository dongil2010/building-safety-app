#!/usr/bin/env node
'use strict';
/**
 * 폭·길이·개수 전용 키패드 (js/shared/measure-keypad.js)
 * - 커서 자리 삽입/지우기, 위치(칸 안 가림), 터치 판정(폭 무관), 키 배열
 * - 연결: 마킹 편집창·모바일 시트(data-crack-w/l/n), 조사표 인라인 폭/길이(data-measure-keypad)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const kp = require(path.join(ROOT, 'js/shared/measure-keypad.js'));

// ---- 키 구성
const keys = kp.allKeys().slice().sort();
const want = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '~', ',', ' ', 'BS', 'OK'].sort();
assert.deepStrictEqual(keys, want, '세로 배열 키 구성');
const land = [].concat(...kp.LAYOUT_LANDSCAPE).sort();
assert.deepStrictEqual(land, want, '가로 배열 키 구성');
assert.ok(kp.LAYOUT_LANDSCAPE.length === 2, '가로(태블릿·폰 가로)는 2줄로 납작하게');

// ---- 커서 자리 삽입
assert.deepStrictEqual(kp.insertAtCaret('', 0, 0, '3'), { value: '3', caret: 1 });
assert.deepStrictEqual(kp.insertAtCaret('0.3', 3, 3, '~'), { value: '0.3~', caret: 4 });
assert.deepStrictEqual(kp.insertAtCaret('0.5', 1, 1, '1'), { value: '01.5', caret: 2 }, '가운데 커서');
assert.deepStrictEqual(kp.insertAtCaret('0.35', 2, 4, '7'), { value: '0.7', caret: 3 }, '선택 영역 교체');
assert.deepStrictEqual(kp.insertAtCaret('12', null, null, ','), { value: '12,', caret: 3 }, '선택 정보 없으면 끝에');
assert.deepStrictEqual(kp.insertAtCaret('12', 5, 9, ' '), { value: '12 ', caret: 3 }, '범위 밖 커서는 끝으로');
assert.deepStrictEqual(kp.insertAtCaret('12', 2, 0, '.'), { value: '.', caret: 1 }, '뒤집힌 선택도 정상화');

// ---- 지우기
assert.deepStrictEqual(kp.backspaceAtCaret('0.3', 3, 3), { value: '0.', caret: 2 });
assert.deepStrictEqual(kp.backspaceAtCaret('0.3', 1, 1), { value: '.3', caret: 0 });
assert.deepStrictEqual(kp.backspaceAtCaret('0.3', 0, 0), { value: '0.3', caret: 0 }, '맨 앞에서는 그대로');
assert.deepStrictEqual(kp.backspaceAtCaret('0.35', 1, 3), { value: '05', caret: 1 }, '선택 영역 삭제');
assert.deepStrictEqual(kp.backspaceAtCaret('', null, null), { value: '', caret: 0 });

// ---- 위치: 칸을 절대 가리지 않는다
function overlaps(field, top, h) { return top < field.bottom && top + h > field.top; }
const pad = { width: 248, height: 206 };
const vpPhone = { width: 390, height: 800 };
let f = { top: 100, bottom: 130, left: 200, right: 280 };
let p = kp.computePosition(f, pad, vpPhone);
assert.strictEqual(p.place, 'below');
assert.ok(!overlaps(f, p.top, pad.height));
assert.ok(p.left + pad.width <= vpPhone.width - 4 && p.left >= 4, '가로로 화면 안');

f = { top: 700, bottom: 730, left: 10, right: 90 };
p = kp.computePosition(f, pad, vpPhone);
assert.strictEqual(p.place, 'above', '아래 자리가 없으면 위로');
assert.ok(!overlaps(f, p.top, pad.height));
assert.ok(p.top >= 0);

// 가로 폰: 높이 360, 칸이 가운데 → 위/아래 다 모자라면 화면 아래에 붙이고 칸을 올린다
const landPad = { width: 460, height: 96 };
const vpLand = { width: 800, height: 360 };
f = { top: 150, bottom: 180, left: 600, right: 700 };
p = kp.computePosition(f, landPad, vpLand);
assert.strictEqual(p.place, 'below', '가로 배열(2줄)은 가로 폰에서도 칸 아래에 들어감');
assert.ok(!overlaps(f, p.top, landPad.height));
assert.ok(p.left + landPad.width <= vpLand.width - 4);

const tallPad = { width: 248, height: 206 };
f = { top: 150, bottom: 180, left: 20, right: 90 };
p = kp.computePosition(f, tallPad, vpLand);
assert.strictEqual(p.place, 'dock');
assert.ok(p.scrollBy > 0, '칸을 위로 올릴 양');
const fAfter = { top: f.top - p.scrollBy, bottom: f.bottom - p.scrollBy };
assert.ok(!overlaps(fAfter, p.top, tallPad.height), '스크롤 뒤엔 안 가림');

// 태블릿 가로 (1180×820): 세로 배열도 칸 아래
f = { top: 400, bottom: 432, left: 1100, right: 1170 };
p = kp.computePosition(f, pad, { width: 1180, height: 820 });
assert.strictEqual(p.place, 'below');
assert.ok(p.left + pad.width <= 1180 - 4, '오른쪽 끝 칸이면 왼쪽으로 당김');

// visualViewport 오프셋(핀치 줌·스크롤) 반영
p = kp.computePosition({ top: 520, bottom: 550, left: 50, right: 90 }, pad, { top: 500, left: 0, width: 390, height: 400 });
assert.strictEqual(p.place, 'below');
assert.ok(p.top >= 550);

// ---- 터치 판정: 폭이 아니라 포인터로
function fakeWin(opts) {
    return {
        matchMedia: (q) => ({ matches: !!(opts.mq && opts.mq[q]) }),
        navigator: { maxTouchPoints: opts.touch || 0 },
        innerWidth: opts.width || 1920,
        localStorage: { getItem: (k) => (opts.pref && k === 'bsaMeasureKeypad' ? opts.pref : null) }
    };
}
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(pointer: coarse)': true }, touch: 5, width: 390 }) }), true, '폰');
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(pointer: coarse)': true }, touch: 5, width: 1366 }) }), true, '큰 태블릿(폭 넓어도)');
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(hover: none)': true }, touch: 5, width: 1024 }) }), true, 'hover none + 터치');
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(pointer: fine)': true }, width: 600 }) }), false, '좁은 PC 창도 마우스면 키보드');
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(pointer: fine)': true, '(hover: hover)': true }, touch: 10 }) }), false, '터치 겸용 노트북(주 포인터 마우스)');
assert.strictEqual(kp.isCoarseDevice({ window: fakeWin({ mq: { '(pointer: coarse)': true }, pref: 'off' }) }), false, '끄기 설정');

// ---- 연결 (정적 검사)
const js = fs.readFileSync(path.join(ROOT, 'js/shared/measure-keypad.js'), 'utf8');
assert.ok(/input\[data-crack-w\]/.test(kp.TARGET_SELECTOR) && /data-crack-l/.test(kp.TARGET_SELECTOR) && /data-crack-n/.test(kp.TARGET_SELECTOR) && /data-measure-keypad/.test(kp.TARGET_SELECTOR));
assert.ok(/setAttribute\('inputmode', 'none'\)/.test(js), 'OS 키보드 억제');
assert.ok(/fire\(el, 'input'\)/.test(js) && /fire\(el, 'change'\)/.test(js), 'input/change 이벤트 발송');
assert.ok(/bubbles: true/.test(js), '이벤트 버블 (위임 핸들러도 받음)');
assert.ok(/setSelectionRange/.test(js), '커서 위치 유지');
assert.ok(/'click', onDocClick, true/.test(js), '바깥 누르면 닫힘');
assert.ok(/state\.lastPointerType === 'mouse'\) return false/.test(js), '마우스로 누르면 키패드 안 띄움');
assert.ok(/data-bsa-kb-skip/.test(js), 'mobile-keyboard 들어올림과 충돌 방지');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const iKp = html.indexOf('js/shared/measure-keypad.js?v=');
const iMk = html.indexOf('js/core/mobile-keyboard.js?v=');
assert.ok(iKp > 0, 'index.html에 ?v= 붙여 로드');
assert.ok(iKp < iMk, 'mobile-keyboard.js보다 먼저 로드 (focusin 순서)');
const vKp = /measure-keypad\.js\?v=([0-9_]+)/.exec(html)[1];
const vApp = /app\.js\?v=([0-9_]+)/.exec(html)[1];
assert.strictEqual(vKp, vApp, 'app.js와 같은 버전');

const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const rowTpl = app.slice(app.indexOf('function renderCrackMeasureRows'), app.indexOf('function setCrackMeasuresToUi'));
assert.ok(/<input type="text" data-crack-w /.test(rowTpl), '폭 칸 type=text (커서 위치 지원)');
assert.ok(/<input type="text" data-crack-l /.test(rowTpl), '길이 칸');
assert.ok(/<input type="text" data-crack-n /.test(rowTpl), '개수 칸');
assert.ok(/inp\.addEventListener\('input'/.test(rowTpl), '기존 input 저장 경로 그대로');
assert.ok(/textInput\('crackWidth'[^\n]*data-measure-keypad="crackWidth"/.test(app), '조사표 인라인 폭');
assert.ok(/textInput\('crackLength'[^\n]*data-measure-keypad="crackLength"/.test(app), '조사표 인라인 길이');
assert.ok(/onchange="window\.updateSurveyInlineField\(/.test(app), '인라인 저장은 change 이벤트');

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
assert.ok(/\.bsa-mkp\s*\{[^}]*position:\s*fixed/.test(css));
assert.ok(/\.bsa-mkp\[hidden\]\s*\{\s*display:\s*none/.test(css));
assert.ok(/\.bsa-mkp-landscape/.test(css));

console.log('test-measure-keypad: ok');
