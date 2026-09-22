#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 한글 출력 두 가지 회귀 테스트 (1·2종 / 3종 출력 두 경로 모두)
 *  1) 내화피복 두께 결과표 데이터 행 높이가 템플릿 6559(약 2.3cm)라 표가 한 쪽을 넘었다
 *     → 다른 결과표와 같은 2776으로 먼저 줄이고, 글자가 넘칠 때만 늘린다.
 *     (브라우저에서 실제 템플릿 2종에 적용 확인: 행 2776, 병합 칸 5552)
 *  2) 부동침하·부재처짐 그래프 제목의 층이 "지금 화면에 연 층"이라 지상1층 조사가 지하1층으로 찍혔다
 *     → 그룹이 조사된 층(_ndtFloorCode)을 넘긴다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

// 1) 내화피복 행 높이
assert.strictEqual((app.match(/const FIREPROOF_DATA_ROW_H = 2776;/g) || []).length, 2, '두 출력 경로 모두 2776');
let from = 0;
let checked = 0;
for (;;) {
    const iBorder = app.indexOf('applyBorder(newB, styleMapsB[which]);', from);
    if (iBorder < 0) break;
    const iShrink = app.indexOf("sz.setAttribute('height', String(FIREPROOF_DATA_ROW_H))", iBorder);
    const iFillA = app.indexOf('const heightA = fillRowCells(newA', iBorder);
    const iMerged = app.indexOf('const mergedHeight = (heightA || 0) + (heightB || 0);', iBorder);
    assert.ok(iShrink > iBorder && iShrink < iFillA, '행을 채우기(높이 계산) 전에 먼저 줄여 둔다');
    assert.ok(iFillA < iMerged, '병합 칸 높이는 채운 뒤 두 행 합으로');
    checked++;
    from = iMerged;
}
assert.strictEqual(checked, 2, '내화피복 채움 함수 두 곳');

// 2) 변위 그래프 층
const calls = app.match(/combinedUrl = renderNdtDisplacementCombinedCanvas\(group, [^;]*;/g) || [];
assert.strictEqual(calls.length, 2, '그래프 호출 두 곳');
calls.forEach((c) => assert.ok(c.includes('group._ndtFloorCode'), '그래프 층은 그룹이 조사된 층이어야 한다: ' + c));
assert.ok(/allDispGroups\.push\(Object\.assign\(\{\}, record, \{\n\s*_ndtFloorCode: floorCode/.test(app),
    '보고서용 변위 그룹에 조사 층이 붙어 있어야 한다');

console.log('test-hwpx-fireproof-height-and-disp-floor: ok');
