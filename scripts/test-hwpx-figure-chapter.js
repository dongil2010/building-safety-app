#!/usr/bin/env node
'use strict';

/**
 * 한글 출력 위치도 캡션의 도면 번호 앞자리 (2026-10-07 사용자 지정)
 *   1·2종: 정기안전점검 → [도면 6-N], 정밀안전점검(그 밖의 점검 포함) → [도면 7-N]
 *   3종: 점검 종류와 상관없이 [도면 5-N] (2026-10-19 「3종은 도면 번호가 5- 이렇게」)
 * 번호는 문서 순서대로 하나로 이어 매긴다(결함위치도 → 비파괴 장비조사 위치도).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const open = app.indexOf('{', app.indexOf(')', at));
    let depth = 0;
    for (let i = open; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const MARK = '␟';
const ctx = { HWPX_HP_NS: 'ns', HWPX_FIG_MARK: MARK };
vm.createContext(ctx);
vm.runInContext([
    extractFunction('function hwpxFigureChapterNo('),
    extractFunction('function numberHwpxFigureCaptions('),
    'this.chapter = hwpxFigureChapterNo; this.number = numberHwpxFigureCaptions;'
].join('\n'), ctx);

assert.strictEqual(ctx.chapter('정기안전점검'), 6);
assert.strictEqual(ctx.chapter('정밀안전점검'), 7);
assert.strictEqual(ctx.chapter('정밀안전진단'), 7);
assert.strictEqual(ctx.chapter(undefined), 7, '점검 종류가 비어 있으면 정밀안전점검으로 본다(앱 기본값)');
assert.strictEqual(ctx.chapter('정기안전점검', { grade3: true }), 5, '3종 정기');
assert.strictEqual(ctx.chapter('정밀안전점검', { grade3: true }), 5, '3종 정밀');
assert.strictEqual(ctx.chapter(undefined, { grade3: true }), 5);
assert.strictEqual(ctx.chapter('정기안전점검', { grade3: false }), 6, '1·2종은 그대로');

const makeDoc = () => {
    const nodes = [
        { textContent: `${MARK}지하1층 상태조사위치도` },
        { textContent: '표 제목(표시 없음)' },
        { textContent: `${MARK}지상1층 상태조사위치도` }
    ];
    return { nodes, getElementsByTagNameNS: () => nodes };
};

{
    const doc = makeDoc();
    assert.strictEqual(ctx.number(doc, '정기안전점검'), 2);
    assert.deepStrictEqual(doc.nodes.map((n) => n.textContent),
        ['[도면 6-1] 지하1층 상태조사위치도', '표 제목(표시 없음)', '[도면 6-2] 지상1층 상태조사위치도']);
}
{
    const doc = makeDoc();
    ctx.number(doc, '정밀안전점검');
    assert.deepStrictEqual(doc.nodes.map((n) => n.textContent),
        ['[도면 7-1] 지하1층 상태조사위치도', '표 제목(표시 없음)', '[도면 7-2] 지상1층 상태조사위치도']);
}

['정기안전점검', '정밀안전점검'].forEach((type) => {
    // 3종: 문서 순서(비파괴 위치도 → 층 순서대로 몰아 넣은 결함위치도) 그대로 5-1, 5-2 …
    const nodes = [
        { textContent: `${MARK}A동 지하1층 비파괴 장비조사 위치도` },
        { textContent: '표 제목(표시 없음)' },
        { textContent: `${MARK}지하1층 상태조사위치도` },
        { textContent: `${MARK}지상1층 상태조사위치도` },
        { textContent: `${MARK}지상2층 상태조사위치도` }
    ];
    const doc = { getElementsByTagNameNS: () => nodes };
    assert.strictEqual(ctx.number(doc, type, { grade3: true }), 4);
    assert.deepStrictEqual(nodes.map((n) => n.textContent), [
        '[도면 5-1] A동 지하1층 비파괴 장비조사 위치도', '표 제목(표시 없음)',
        '[도면 5-2] 지하1층 상태조사위치도', '[도면 5-3] 지상1층 상태조사위치도', '[도면 5-4] 지상2층 상태조사위치도'
    ], type);
});

// 두 출력 함수(1·2종, 3종) 모두 건물의 점검 종류를 넘기고, 3종 함수만 3종 표시를 넘긴다
const g3Start = app.indexOf('async function exportHwpxSurveyTable3(');
const g12Start = app.indexOf('async function exportHwpxSurveyTable12(');
assert.ok(g3Start >= 0 && g12Start > g3Start);
const g3Body = app.slice(g3Start, g12Start);
const g12Body = app.slice(g12Start);
assert.strictEqual((g3Body.match(/numberHwpxFigureCaptions\(xmlDoc, bldg\.inspectionType, \{ grade3: true \}\)/g) || []).length, 1, '3종 → 5-N');
assert.strictEqual((g3Body.match(/numberHwpxFigureCaptions\(/g) || []).length, 1);
assert.strictEqual((g12Body.match(/numberHwpxFigureCaptions\(xmlDoc, bldg\.inspectionType\);/g) || []).length, 1, '1·2종은 그대로 6/7');
assert.ok(!/grade3: true/.test(g12Body.slice(0, g12Body.indexOf('numberHwpxFigureCaptions(') + 80)));
assert.ok(!/numberHwpxFigureCaptions\(xmlDoc\)/.test(app), '점검 종류 없이 부르면 정기점검도 7로 나간다');
assert.strictEqual((app.match(/getFloorLabel\(floorCode\)\} 상태조사위치도/g) || []).length, 2);
assert.ok(!/getFloorLabel\(floorCode\)\} 결함위치도/.test(app), '한글 위치도 캡션은 상태조사위치도');

console.log('test-hwpx-figure-chapter: ok');
