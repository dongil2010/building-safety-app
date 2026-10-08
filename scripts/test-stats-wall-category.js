#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 — 상태조사 통계의 부재별 집계에서 카테고리가 '비구조체'/'마감재'인
 * 그냥 '벽체'가 'RC벽체'로 잘못 잡히던 문제의 회귀 테스트.
 * classifyComponentGroup(component, category)를 stats.js에서 잘라 vm으로 실행해 검사한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const statsSrc = fs.readFileSync(path.join(root, 'js', 'tabs', 'stats.js'), 'utf8');

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

function loadClassify() {
    const fnSrc = extractFunction(statsSrc, 'function classifyComponentGroup(');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(fnSrc + '\nthis.classifyComponentGroup = classifyComponentGroup;', sandbox);
    return sandbox.classifyComponentGroup;
}

function testWallCategoryRules() {
    const classify = loadClassify();
    assert.strictEqual(classify('벽체', '구조체'), 'rcWall', '구조체 벽체는 RC벽체');
    assert.strictEqual(classify('벽체', undefined), 'rcWall', '카테고리 미기재는 구조체로 간주');
    assert.strictEqual(classify('벽체', '비구조체'), 'other', '비구조체 벽체는 기타 부재');
    assert.strictEqual(classify('벽체', '마감재'), 'other', '마감재 벽체는 기타 부재');
    assert.strictEqual(classify('RC벽체', '비구조체'), 'rcWall', 'RC벽체 표기는 카테고리와 무관하게 RC벽체');
    assert.strictEqual(classify('내력벽', '비구조체'), 'rcWall', '내력벽 표기는 카테고리와 무관하게 RC벽체');
    assert.strictEqual(classify('조적벽체', '비구조체'), 'masonryWall', '조적벽체는 카테고리와 무관하게 조적벽체');

    // 2026-10-08: ALC·블록·벽돌 벽체도 조적벽체로 집계한다
    ['ALC벽체', 'ALC 블록', 'alc블록벽체', '블록벽체', '블럭벽체', '시멘트벽돌', '벽돌벽체', '문 상부 조적벽체'].forEach((name) => {
        assert.strictEqual(classify(name, '비구조체'), 'masonryWall', name + ' 은(는) 조적벽체');
    });
    assert.strictEqual(classify('블록벽체', '구조체'), 'masonryWall', '카테고리가 구조체로 적혀 있어도 조적벽체');
    ['보도블록', '점자블록', '경계블록', '바닥 블록포장'].forEach((name) => {
        assert.strictEqual(classify(name, '마감재'), 'other', name + ' 은(는) 벽체가 아니다');
    });

    // 2026-10-08: 골조와 벽체가 만나는 접합부(이격 등)는 조적벽체로 집계한다
    ['기둥-벽체 접합부', '보-벽체 접합부', '슬래브-벽체 접합부', '천장 상부 벽체 접합부', '조적벽체 접합부', 'ALC블록 접합부'].forEach((name) => {
        assert.strictEqual(classify(name, '비구조체'), 'masonryWall', name + ' 은(는) 조적벽체');
        assert.strictEqual(classify(name, '구조체'), 'masonryWall', name + ' 은(는) 카테고리와 무관하게 조적벽체');
    });
    ['기둥-보 접합부', '보 접합부', '철골 보 볼트 접합부', 'RC벽체 접합부', '내력벽 접합부', '기둥-RC벽체 접합부'].forEach((name) => {
        assert.strictEqual(classify(name, '구조체'), 'other', name + ' 은(는) 그대로 기타 부재');
    });
    assert.strictEqual(classify('기둥', '구조체'), 'column', '기둥 분류는 그대로');
}

function testCallSitePassesCategory() {
    assert.ok(
        statsSrc.indexOf('classifyComponentGroup(d.component, cat)') >= 0,
        '호출처가 classifyComponentGroup(d.component, cat) 형태가 아니다'
    );
}

function main() {
    testWallCategoryRules();
    testCallSitePassesCategory();
    console.log('OK test-stats-wall-category.js');
}

main();
