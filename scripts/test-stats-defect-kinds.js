#!/usr/bin/env node
'use strict';

/**
 * 2026-10-08 — 통계 부재별 표의 결함 종류별 건수(누수·백태 / 박리·박락·들뜸 / 철근노출) 분류 테스트.
 * classifyDefectKinds(d)를 stats.js에서 잘라 vm으로 실행해 검사한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const statsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'tabs', 'stats.js'), 'utf8');

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

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractFunction(statsSrc, 'function classifyDefectKinds(')
    + '\nthis.kindsJson = function (d) { return JSON.stringify(classifyDefectKinds(d)); };', sandbox);
const kinds = (component, defectType) => {
    const k = JSON.parse(sandbox.kindsJson({ component: component, defectType: defectType }));
    return Object.keys(k).filter((key) => k[key]).join(',');
};

// 누수·백태
assert.strictEqual(kinds('보(G)', '누수 및 백태 (우천시 누수)'), 'leak');
assert.strictEqual(kinds('슬래브', '누수흔적'), 'leak');
assert.strictEqual(kinds('기둥', '상부 백태'), 'leak');
assert.strictEqual(kinds('슬래브', '균열 및 백태'), 'leak', '균열과 함께 적힌 백태도 센다');
assert.strictEqual(kinds('슬래브', '균열 및 누수 흔적'), 'leak', '띄어 쓴 누수 흔적');

// 콘크리트 박리·박락·들뜸·층분리
assert.strictEqual(kinds('보', '콘크리트 박락'), 'spall');
assert.strictEqual(kinds('슬래브', '박리'), 'spall');
assert.strictEqual(kinds('기둥', '미장 망상균열 및 들뜸'), 'spall');
assert.strictEqual(kinds('슬래브', '층분리'), 'spall');
assert.strictEqual(kinds('철골 보', '뿜칠 박락'), '', '철골 뿜칠이 떨어진 것은 콘크리트 박락이 아니다');
assert.strictEqual(kinds('철골보', '내화피복 박락'), '');
assert.strictEqual(kinds('보 뿜칠', '박락 및 들뜸'), '', '부재 칸에 뿜칠이 적힌 경우');

// 철근노출
assert.strictEqual(kinds('보', '하부 철근노출'), 'rebar');
assert.strictEqual(kinds('슬래브', '철근 노출'), 'rebar', '띄어 쓴 철근 노출');
assert.strictEqual(kinds('RC벽체', '재료분리 및 철근노출'), 'rebar');

// 여러 종류에 걸치는 결함
assert.strictEqual(kinds('슬래브', '철근노출 및 공극, 콘크리트 들뜸'), 'spall,rebar');
assert.strictEqual(kinds('슬래브', '박락 및 철근노출, 누수'), 'leak,spall,rebar');

// 해당 없음
assert.strictEqual(kinds('슬래브', '균열'), '');
assert.strictEqual(kinds('보', '상태양호'), '');
assert.strictEqual(kinds('', ''), '');

console.log('test-stats-defect-kinds: ok');
