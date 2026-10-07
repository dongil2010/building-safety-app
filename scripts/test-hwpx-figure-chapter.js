#!/usr/bin/env node
'use strict';

/**
 * 한글 출력 위치도 캡션의 도면 번호 앞자리 (2026-10-07 사용자 지정)
 *   정기안전점검 → [도면 6-N], 정밀안전점검(그 밖의 점검 포함) → [도면 7-N]
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

const makeDoc = () => {
    const nodes = [
        { textContent: `${MARK}지하1층 결함위치도` },
        { textContent: '표 제목(표시 없음)' },
        { textContent: `${MARK}지상1층 결함위치도` }
    ];
    return { nodes, getElementsByTagNameNS: () => nodes };
};

{
    const doc = makeDoc();
    assert.strictEqual(ctx.number(doc, '정기안전점검'), 2);
    assert.deepStrictEqual(doc.nodes.map((n) => n.textContent),
        ['[도면 6-1] 지하1층 결함위치도', '표 제목(표시 없음)', '[도면 6-2] 지상1층 결함위치도']);
}
{
    const doc = makeDoc();
    ctx.number(doc, '정밀안전점검');
    assert.deepStrictEqual(doc.nodes.map((n) => n.textContent),
        ['[도면 7-1] 지하1층 결함위치도', '표 제목(표시 없음)', '[도면 7-2] 지상1층 결함위치도']);
}

// 두 출력 함수(1·2종, 3종) 모두 건물의 점검 종류를 넘겨야 한다
assert.strictEqual((app.match(/numberHwpxFigureCaptions\(xmlDoc, bldg\.inspectionType\)/g) || []).length, 2);
assert.ok(!/numberHwpxFigureCaptions\(xmlDoc\)/.test(app), '점검 종류 없이 부르면 정기점검도 7로 나간다');

console.log('test-hwpx-figure-chapter: ok');
