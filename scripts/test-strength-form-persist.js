#!/usr/bin/env node
'use strict';

/**
 * 2026-09-22 반발경도(강도) 입력창 — 측정 각도·추정식이 "자꾸 초기화"되던 문제의 회귀 테스트.
 *  - 추정식 선택(bldg.enabledStrengthFormulas)이 건물 병합의 로컬 우선 키에 없고 수정 표시도 안 찍혀
 *    동기화 때마다 서버의 옛 값(없음=3개 전부)으로 되돌아갔다
 *  - 추정식 기본값은 일본재료학회식·일본건축학회 제안식 2개(사용자 요청)
 *  - 새 항목은 각도를 빈칸으로 비웠고, 예전에 0°로 저장한 항목은 null이라 다시 열면 빈칸이었다
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const metaMerge = require(path.join(root, 'js', 'core', 'building-meta-merge.js'));

function extractFunction(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(app.slice(at));
    const open = at + m.index + m[0].length - 1;
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

function extractStatement(header) {
    const at = app.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const end = app.indexOf('];', at);
    return app.slice(at, end + 2);
}

function testFormulaSelectionSurvivesSync() {
    assert.ok(metaMerge.KEYS.includes('enabledStrengthFormulas'), '추정식 선택은 건물 병합에서 로컬 값을 지켜야 한다');
    assert.ok(/'notes',\s*'enabledStrengthFormulas'\s*\]/.test(extractStatement('const BUILDING_LOCAL_META_KEYS =')),
        'app.js 예비 키 목록에도 있어야 한다');

    // 이 기기에서 추정식을 바꿈 → 서버 건물(옛 값)과 병합해도 내 선택이 남는다
    const local = { id: 'b1', name: '창평', enabledStrengthFormulas: ['과학기술부식'] };
    metaMerge.markDirty(local, 2000);
    const remote = { id: 'b1', name: '창평', metaUpdatedAt: 1000 };
    const merged = metaMerge.overlay(Object.assign({}, remote), local, remote);
    assert.deepStrictEqual(merged.enabledStrengthFormulas, ['과학기술부식']);

    // 업로드가 끝난 뒤 다른 기기가 더 나중에 바꿨다면 그쪽을 따른다
    const staleLocal = { id: 'b1', enabledStrengthFormulas: ['과학기술부식'], metaUpdatedAt: 1000 };
    const newerRemote = { id: 'b1', enabledStrengthFormulas: ['일본재료학회식'], metaUpdatedAt: 3000 };
    const merged2 = metaMerge.overlay(Object.assign({}, newerRemote), staleLocal, newerRemote);
    assert.deepStrictEqual(merged2.enabledStrengthFormulas, ['일본재료학회식']);

    const toggle = extractFunction('window.toggleStrengthFormula = function(');
    const dirtyAt = toggle.indexOf('markBuildingMetaDirty(bldg)');
    assert.ok(dirtyAt > toggle.indexOf('bldg.enabledStrengthFormulas = next'), '추정식을 바꾸면 수정 표시를 찍어야 한다');
    assert.ok(dirtyAt < toggle.lastIndexOf('saveStateToLocalStorage()'), '수정 표시는 저장 전에 찍어야 한다');
}

function testDefaultFormulas() {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext([
        extractStatement('const CONCRETE_STRENGTH_FORMULAS = ['),
        "const DEFAULT_STRENGTH_FORMULA_NAMES = " + /const DEFAULT_STRENGTH_FORMULA_NAMES = (\[[^\]]*\]);/.exec(app)[1] + ';',
        extractFunction('function getEnabledStrengthFormulaNames('),
        'this.getRaw = getEnabledStrengthFormulaNames;'
    ].join('\n'), ctx);
    // vm 안 배열은 다른 realm이라 바깥 배열로 바꿔 비교한다
    ctx.get = (b) => Array.from(ctx.getRaw(b));
    assert.deepStrictEqual(ctx.get({}), ['일본재료학회식', '일본건축학회 제안식'], '고른 적 없는 건물은 2개가 기본');
    assert.deepStrictEqual(ctx.get(null), ['일본재료학회식', '일본건축학회 제안식']);
    assert.deepStrictEqual(ctx.get({ enabledStrengthFormulas: ['과학기술부식'] }), ['과학기술부식'], '고른 값은 그대로');
    assert.deepStrictEqual(ctx.get({ enabledStrengthFormulas: ['일본재료학회식', '일본건축학회 제안식', '과학기술부식'] }).length, 3);
    assert.strictEqual(ctx.get({ enabledStrengthFormulas: [] }).length, 3, '빈 선택이면 평균이 안 나오니 전부');
}

function testAngleKeptAndDefaulted() {
    const store = {};
    const ctx = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }
    };
    vm.createContext(ctx);
    vm.runInContext([
        extractStatement('const STRENGTH_ANGLE_OPTIONS = ['),
        "const LAST_STRENGTH_ANGLE_KEY = 'bsa_ndt_last_strength_angle';",
        extractFunction('function normalizeStrengthAngleValue('),
        extractFunction('function readLastStrengthAngle('),
        extractFunction('function rememberLastStrengthAngle('),
        'this.norm = normalizeStrengthAngleValue; this.read = readLastStrengthAngle; this.remember = rememberLastStrengthAngle;'
    ].join('\n'), ctx);
    assert.strictEqual(ctx.norm(null), '0', '예전에 0°가 null로 저장된 항목은 0°로 보여야 한다');
    assert.strictEqual(ctx.norm(undefined), '0');
    assert.strictEqual(ctx.norm(''), '0');
    assert.strictEqual(ctx.norm(0), '0');
    assert.strictEqual(ctx.norm(-45), '-45');
    assert.strictEqual(ctx.norm('90'), '90');
    assert.strictEqual(ctx.norm(30), '0', '선택지에 없는 값은 0°');
    assert.strictEqual(ctx.norm(ctx.read()), '0', '처음에는 0°');
    ctx.remember('-90');
    assert.strictEqual(ctx.norm(ctx.read()), '-90', '마지막에 쓴 각도를 기억한다');

    // 선택지가 index.html과 맞아야 빈칸이 안 된다
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const sel = html.slice(html.indexOf('<select id="ndtAngle"'), html.indexOf('</select>', html.indexOf('<select id="ndtAngle"')));
    const values = Array.from(sel.matchAll(/value="([^"]*)"/g)).map((m) => m[1]).sort();
    assert.deepStrictEqual(values, ['-45', '-90', '0', '45', '90'].sort());

    assert.ok(/angleElNew\.value = normalizeStrengthAngleValue\(readLastStrengthAngle\(\)\)/.test(app), '새 항목은 마지막 각도로 시작');
    assert.ok(/angleElExisting\.value = normalizeStrengthAngleValue\(existingItem\.strengthAngle\)/.test(app), '기존 항목은 저장값(없으면 0°)');
    assert.ok(/if \(cat === '강도'\) rememberLastStrengthAngle\(strengthAngle\);/.test(app), '강도 저장 때 각도를 기억');
}

[testFormulaSelectionSurvivesSync, testDefaultFormulas, testAngleKeptAndDefaulted].forEach((t) => {
    t();
    console.log('ok -', t.name);
});
console.log('test-strength-form-persist: ok');
