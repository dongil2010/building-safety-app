#!/usr/bin/env node
'use strict';

/**
 * 2026-10-21 — 통계 「개구부 결함 제외」 토글과 균열폭 분류 칸 결함 번호 팝업 테스트.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const statsSrc = fs.readFileSync(path.join(ROOT, 'js', 'tabs', 'stats.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(at, i + 1);
        }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext([
    'function parseDefectTypeList(', 'function isOpeningDefect(', 'function stripDefectNoPrefix(', 'function formatDefectNo(', 'function sortDefectNos(', 'function shouldIncludeDefect('
].map((h) => extractFunction(statsSrc, h)).join('\n')
    + '\nthis.inc = function (d, o) { return shouldIncludeDefect(d, o); };'
    + '\nthis.sortJson = function (a) { return JSON.stringify(sortDefectNos(a)); };', sandbox);

const opening = { defectType: '수직균열', isOpeningCrack: true };
const plain = { defectType: '수직균열' };
assert.strictEqual(sandbox.inc(opening, {}), true, '토글이 꺼져 있으면 개구부 결함도 센다');
assert.strictEqual(sandbox.inc(opening, { excludeOpening: true }), false, '토글을 켜면 개구부 결함을 뺀다');
assert.strictEqual(sandbox.inc(plain, { excludeOpening: true }), true, '개구부가 아닌 결함은 그대로');
assert.strictEqual(sandbox.inc({ defectType: '균열', isOpeningCrack: '○' }, { excludeOpening: true }), false, '가져온 ○ 표기도 개구부');
assert.strictEqual(sandbox.inc({ defectType: '균열', isOpeningCrack: false }, { excludeOpening: true }), true);

assert.deepStrictEqual(JSON.parse(sandbox.sortJson(['12', '3', '', '3', '101', '7-1', 'A'])), ['3', '7-1', '12', '101', 'A'],
    '번호는 숫자 순서, 중복·빈 값 제거');

// 2026-10-21 「NO.NO.88」 버그: 이미 붙은 NO 접두어는 떼고 한 번만 붙인다
vm.runInContext('this.fmt = function (x) { return formatDefectNo(x); };', sandbox);
['NO.88', 'No.88', 'no88', 'NO 88', 'no. 88', ' N0.88'.replace('0', 'O'), '88'].forEach((x) => {
    assert.strictEqual(sandbox.fmt(x), 'NO.88', JSON.stringify(x) + ' → NO.88');
});
assert.strictEqual(sandbox.fmt('외부1-3'), 'NO.외부1-3', '숫자가 아닌 이름은 그대로');
assert.strictEqual(sandbox.fmt('NO.외부1-3'), 'NO.외부1-3');
assert.strictEqual(sandbox.fmt('North-2'), 'NO.North-2', '영문 이름은 NO를 떼지 않는다');
assert.strictEqual(sandbox.fmt('NO.'), 'NO.NO.', '접두어만 있으면 남긴다(빈 번호 방지)');
assert.deepStrictEqual(JSON.parse(sandbox.sortJson(['NO.12', 'no 3', 'No.101', '7', 'NO.7', '외부1-3'])), ['3', '7', '12', '101', '외부1-3'],
    'NO 접두어가 섞여도 숫자 순서, 같은 번호는 하나');
assert.ok(!/'NO\.' \+ esc\(n\)/.test(statsSrc), '팝업에서 NO.를 무조건 붙이지 않는다');

// 팝업 위치: 화면 안에 들어온다
const api = require(path.join(ROOT, 'js', 'tabs', 'stats.js'));
assert.strictEqual(typeof api.placeBinPopup, 'function');
const vw = 400, vh = 300;
let p = api.placeBinPopup({ left: 380, right: 400, top: 10, bottom: 30, width: 20, height: 20 }, 200, 100, vw, vh);
assert.ok(p.left >= 0 && p.left + 200 <= vw, '오른쪽 끝 칸: 왼쪽으로 밀어 넣는다');
assert.strictEqual(p.top, 36, '공간이 있으면 칸 아래');
p = api.placeBinPopup({ left: 0, right: 20, top: 260, bottom: 280, width: 20, height: 20 }, 200, 100, vw, vh);
assert.ok(p.left >= 0, '왼쪽 끝 칸');
assert.ok(p.top + 100 <= vh && p.top < 260, '아래 공간이 없으면 칸 위');

// 화면 연결
assert.ok(/id="statsExcludeOpening"[^>]*>\s*개구부 결함 제외/.test(html), '「개구부 결함 제외」 체크박스');
assert.ok(/excludeOpening:\s*!!document\.getElementById\('statsExcludeOpening'\)/.test(statsSrc), '옵션으로 넘긴다');
assert.ok(/bsa_stats_exclude_opening_v1/.test(statsSrc), '건물별로 기억한다');
assert.ok(/componentCrackBinNos/.test(statsSrc) && /data-bin-nos/.test(statsSrc), '균열폭 분류 칸에 결함 번호를 싣는다');
assert.ok(/pointerenter/.test(statsSrc) && /binPopupPinned/.test(statsSrc), 'PC 호버 + 터치 탭');
assert.ok(/\.stats-bin-popup\{position:fixed/.test(css), '팝업 스타일');

console.log('test-stats-opening-exclude: ok');
