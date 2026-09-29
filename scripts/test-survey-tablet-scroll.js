#!/usr/bin/env node
'use strict';

/**
 * 태블릿 조사표 세로 스크롤.
 *
 * 2026-09-29 신고: 태블릿에서 조사표 탭을 세로로 밀어도 안 움직인다(폰은 괜찮음).
 * 원인 셋:
 *  1) .table-container 기본값 touch-action: pan-x(비파괴 표용)가 조사표에도 남았다.
 *     폰(≤768)은 모바일 규칙이 pan-x pan-y로 덮었지만 태블릿(769+)은 그대로 → 세로 제스처 차단.
 *  2) PC split용 overscroll-behavior: contain 때문에 표·앨범 끝에서 세로 제스처가 페이지로 안 넘어갔다
 *     (태블릿 세로는 표가 늘어나고 페이지가 스크롤하는 모양이라 곧 먹통).
 *  3) 태블릿 가로 1025~1200px는 .app-content가 overflow:hidden인데 표·앨범이 화면에 안 맞춰져
 *     아래쪽에 닿을 수 없었다.
 * 헤드리스 크롬 터치 흉내(Input.dispatchTouchEvent)로 폰·iPad·안드로이드 탭 세로/가로와 PC 휠을 확인했고,
 * 여기서는 그 CSS 규칙이 남아 있는지만 본다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector, from) {
    const i = css.indexOf(selector + ' {', from || 0);
    assert.ok(i >= 0, 'styles.css에 "' + selector + '" 규칙이 없다');
    return { body: css.slice(i, css.indexOf('}', i)), at: i };
}

// 태블릿(layout-tablet): 표 두 축 스크롤 + 세로는 페이지로 넘김
const t = block('html.layout-tablet #tab-survey .table-container');
assert.ok(/touch-action:\s*pan-x pan-y/.test(t.body), '태블릿 조사표 표가 세로 제스처를 막는다');
assert.ok(/overscroll-behavior-y:\s*auto/.test(t.body), '태블릿 조사표 표 끝에서 페이지로 안 넘어간다');
assert.ok(/overscroll-behavior-y:\s*auto/.test(block('html.layout-tablet #tab-survey .survey-album-grid').body), '태블릿 앨범 끝에서 페이지로 안 넘어간다');
assert.ok(/overflow-y:\s*auto !important/.test(block('html.layout-tablet body.bsa-tab-survey .app-content').body), '태블릿 조사표 페이지가 세로 스크롤을 못 한다');

// layout-tablet이 안 붙는 터치 기기(769px 이상 손가락 포인터)도 같은 처리, 폰(가로 포함)은 건드리지 않는다
const mq = css.indexOf('@media (hover: none) and (pointer: coarse) and (min-width: 769px) and (min-height: 600px) {');
assert.ok(mq >= 0, '터치 포인터(태블릿 크기) 규칙이 없다');
const inMq = block('html #tab-survey .table-container', mq);
assert.ok(/touch-action:\s*pan-x pan-y/.test(inMq.body));

// 이 규칙들이 PC split 규칙(overscroll-behavior: contain)보다 우선해야 한다 — 특이도로 이긴다(html 포함)
assert.ok(!/@media \(hover: none\) and \(pointer: coarse\) \{\s*#tab-survey \.table-container/.test(css), '터치 규칙 특이도가 PC split 규칙과 같아 진다');

console.log('survey tablet scroll css ok');
