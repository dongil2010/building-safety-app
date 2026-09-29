#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29 조사표(폰·태블릿):
 *  (1) 맨 왼쪽 번호(NO.) 칸 고정 — 가로로 밀어도 번호가 보인다(머리칸 포함). 가로·세로 스와이프는 그대로.
 *  (2) 행 빈 곳을 누르면 도면으로 튀던 것 제거 — 도면 이동은 행 끝 「도면」 버튼만(PC도 같은 코드).
 *  (+) 폰 가로(844×390 등)에서 표 위 세로 스와이프가 먹지 않던 것(touch-action pan-x + contain).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

function block(selector, from) {
    const i = css.indexOf('}\n' + selector + ' {', from || 0);
    assert.ok(i >= 0, 'styles.css에 "' + selector + '" 규칙이 없다');
    return { at: i, body: css.slice(i + 1, css.indexOf('}', i + 1)) };
}

// (1) 번호 칸 고정
const both = css.indexOf('#tab-survey .survey-table th[data-col="no"]:first-child,\n#tab-survey .survey-table td[data-col="no"]:first-child {');
assert.ok(both >= 0, '번호 칸(머리·본문) sticky 규칙');
const bothBody = css.slice(both, css.indexOf('}', both));
assert.ok(/position:\s*sticky/.test(bothBody) && /left:\s*0/.test(bothBody));
assert.ok(!/top:/.test(bothBody), '세로 고정(top)은 기존 thead 규칙에 맡긴다(레이아웃마다 다름)');
const td = block('#tab-survey .survey-table td[data-col="no"]:first-child');
assert.ok(/background:\s*#ffffff/.test(td.body), '고정 칸은 불투명 배경(밑으로 지나가는 칸이 비치지 않게)');
assert.ok(/z-index:\s*1/.test(td.body));
const th = block('#tab-survey .survey-table th[data-col="no"]:first-child');
assert.ok(/z-index:\s*3/.test(th.body), '모서리 칸은 머리줄(z 2) 위');
assert.ok(/tr:nth-child\(even\) > td\[data-col="no"\]:first-child/.test(css), '짝수 줄 배경 맞춤');
assert.ok(/tr\.survey-row-blank > td\[data-col="no"\]:first-child/.test(css), '내용 빠진 행 배경 맞춤');
// sticky가 동작하려면 표가 separate 경계여야 한다
assert.ok(/#tab-survey \.survey-table \{[^}]*border-collapse:\s*separate/.test(css));
// 머리줄: 번호 머리칸도 th 기본 배경(불투명)
assert.ok(/\.survey-table th \{[^}]*background:\s*#f8fafc !important/.test(css));

// 스와이프 회귀 금지: 태블릿 pan-x pan-y 그대로 + 폰 가로 추가
assert.ok(/html\.layout-tablet #tab-survey \.table-container \{[^}]*touch-action:\s*pan-x pan-y/.test(css), '태블릿 수정 유지');
const land = css.indexOf('@media (hover: none) and (pointer: coarse) and (max-height: 599px) {');
assert.ok(land >= 0, '폰 가로 규칙');
const landBody = css.slice(land, css.indexOf('}\n}', land));
assert.ok(/html #tab-survey \.table-container \{[^}]*touch-action:\s*pan-x pan-y/.test(landBody));
assert.ok(/overscroll-behavior-y:\s*auto/.test(landBody), '폰 가로: 세로는 페이지로');

// (2) 행 누르기로 도면 이동 없음 — 「도면」 버튼만
const rs = app.indexOf('elements.surveyTableBody.innerHTML = defects.map((d, dIdx) => {');
assert.ok(rs > 0);
const rowTpl = app.slice(rs, app.indexOf("}).join('');", rs));
const trTag = /<tr [^>]*>/.exec(rowTpl)[0];
assert.ok(!/onclick/.test(trTag), '행(tr)에 onclick 없음: ' + trTag);
assert.ok(!/cursor:pointer/.test(trTag), '행 전체가 눌리는 것처럼 보이지 않게');
assert.ok(/survey-btn-map-view" onclick="event\.stopPropagation\(\); window\.viewDefectOnMapFromSurvey\('\$\{safeId\}'\)"/.test(rowTpl), '「도면」 버튼은 그대로 이동');
assert.ok(/window\.openSurveyRowEditModal\('\$\{safeId\}'\)/.test(rowTpl), '「상세」 버튼 그대로');
const tdCells = /\$\{columns\.map\(c => `<td [^`]*`\)\.join\(''\)\}/.exec(rowTpl);
assert.ok(tdCells && !/viewDefectOnMapFromSurvey/.test(tdCells[0]), '칸(td)은 도면 이동 안 함');
// 칸 편집(인라인 입력)은 그대로 — change로 저장
assert.ok(/onchange="window\.updateSurveyInlineField\(/.test(app));
// 조사표 → 도면 이동 함수 자체는 남아 있다(버튼·통계·중점관리 카드에서 씀)
assert.ok(/window\.viewDefectOnMapFromSurvey = function\(defectId\)/.test(app));

console.log('test-survey-sticky-no-and-map-button: ok');
