#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 한글 내화피복 두께 결과표 — 평균값(7번 열)은 부재 하나(플렌지·웨브 최대 6개소)의 평균이라
 * 플렌지·웨브 두 행에 같은 값이 따로 찍혔다. 설계치 칸처럼 두 행을 한 칸으로 세로 병합한다.
 * 채움 함수는 1·2종/3종 출력에 복사본이 2개 있어 둘 다 확인한다.
 * (실제 템플릿 표에 대한 DOM 검증은 브라우저에서 수행: 두 템플릿 모두 c7 rowSpan=2, 웨브 행 c7 제거,
 *  테두리는 같은 쌍의 설계치 병합 칸과 동일)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function fireproofFillBodies() {
    const out = [];
    let from = 0;
    const header = 'const fillFireproofTable = (tbl, items) => {';
    for (;;) {
        const at = app.indexOf(header, from);
        if (at < 0) break;
        let depth = 0;
        let end = -1;
        for (let i = app.indexOf('{', app.indexOf('=>', at)); i < app.length; i++) {
            if (app[i] === '{') depth++;
            else if (app[i] === '}') {
                depth--;
                if (depth === 0) { end = i + 1; break; }
            }
        }
        out.push(app.slice(at, end));
        from = end;
    }
    return out;
}

const bodies = fireproofFillBodies();
assert.strictEqual(bodies.length, 2, '내화피복 표 채움 함수는 1·2종/3종 두 곳');
assert.strictEqual(bodies[0], bodies[1], '두 복사본은 같아야 한다');

const body = bodies[0];
const iMerge = body.indexOf("avgSpanA.setAttribute('rowSpan', '2')");
const iRemove = body.indexOf('newB.removeChild(avgTcB)');
const iBorder = body.indexOf("avgTcA.setAttribute('borderFillIDRef', designTcA.getAttribute('borderFillIDRef'))");
const iHeight = body.indexOf('const mergedHeight = (heightA || 0) + (heightB || 0);');
const iFillB = body.indexOf('const heightB = fillRowCells(newB, [');
assert.ok(iMerge > 0, '평균값 칸(7번 열)을 두 행 병합');
assert.ok(iRemove > 0, '웨브 행의 평균값 칸은 지운다');
assert.ok(iBorder > 0, '병합 칸 테두리는 설계치 병합 칸을 따른다');
assert.ok(/tcAtCol\(newA, 7\)/.test(body) && /tcAtCol\(newB, 7\)/.test(body) && /tcAtCol\(newA, 3\)/.test(body));
assert.ok(iFillB < iMerge, '웨브 행을 채운 뒤 병합한다');
assert.ok(iMerge < iHeight, '병합 칸 높이(두 행 합)는 병합 뒤 한꺼번에 맞춘다');

console.log('test-fireproof-avg-merge: ok');
