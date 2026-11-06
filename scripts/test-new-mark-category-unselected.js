#!/usr/bin/env node
'use strict';
/**
 * 2026-11-06: 새로 찍은 마킹의 대분류는 구조체가 아니라 미선택.
 * 구조체 표시를 꺼도 미선택 마킹은 보이고 선택할 수 있다.
 * 저장된 기존 마킹(필드 없음 → 구조체, 명시적 구조체)은 그대로.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const lint = require(path.join(ROOT, 'js/core/defect-lint.js'));

function fn(name) {
    const i = app.indexOf('function ' + name + '(');
    assert.ok(i >= 0, 'missing ' + name);
    let j = app.indexOf('{', i), d = 0;
    for (let k = j; k < app.length; k++) {
        if (app[k] === '{') d++;
        else if (app[k] === '}') { d--; if (d === 0) return app.slice(i, k + 1); }
    }
    throw new Error('unterminated ' + name);
}

// ── 정적: 새 마킹 생성·폼이 구조체로 덮지 않음 ──
assert.ok(/option value="">대분류 미선택<\/option>/.test(html), '선택칸에 미선택');
assert.ok(/const defaultCat = tmpl \? inheritDefectCategory\(tmpl\) : ''/.test(app), '단독 새 마킹 미선택');
assert.ok(/category: readDefectCategoryUi\(\)/.test(app), '가드 필드가 UI 미선택을 유지');
assert.ok(/bsaPlasterNonStructCategory\(readDefectCategoryUi\(\), dTypeVal\)/.test(app), '신규 저장이 || 구조체로 덮지 않음');
assert.ok(/cadItem\.category \|\| '구조체'/.test(app), 'CAD 가져오기는 기존 기본값 유지');
assert.ok(/function inheritDefectCategory\(/.test(app) && /src\.category === ''/.test(fn('inheritDefectCategory')),
    '그룹 추가 마킹은 명시적 미선택을 이어받음');

// ── 헬퍼 동작 ──
const helpers = new Function(`
var DEFECT_CATEGORY_KNOWN = ['구조체', '비구조체', '마감재'];
var document = { getElementById: function () { return { value: '' }; } };
${fn('readDefectCategoryUi')}
${fn('resolveDefectCategory')}
${fn('inheritDefectCategory')}
return { readDefectCategoryUi, resolveDefectCategory, inheritDefectCategory };
`)();

assert.strictEqual(helpers.readDefectCategoryUi('구조체'), '구조체');
assert.strictEqual(helpers.readDefectCategoryUi('비구조체'), '비구조체');
assert.strictEqual(helpers.readDefectCategoryUi('마감재'), '마감재');
assert.strictEqual(helpers.readDefectCategoryUi(''), '');
assert.strictEqual(helpers.readDefectCategoryUi('기타'), '');
assert.strictEqual(helpers.resolveDefectCategory(''), '', '명시적 미선택');
assert.strictEqual(helpers.resolveDefectCategory(undefined), '구조체', '옛 데이터 없음 = 구조체');
assert.strictEqual(helpers.resolveDefectCategory(null), '구조체');
assert.strictEqual(helpers.resolveDefectCategory('구조체'), '구조체');
assert.strictEqual(helpers.resolveDefectCategory('비구조체'), '비구조체');
assert.strictEqual(helpers.inheritDefectCategory(null), '');
assert.strictEqual(helpers.inheritDefectCategory({ category: '' }), '');
assert.strictEqual(helpers.inheritDefectCategory({ category: '마감재' }), '마감재');
assert.strictEqual(helpers.inheritDefectCategory({}), '구조체', '그룹 원본이 옛 마킹이면 구조체');

// ── 필터: 구조체 꺼도 미선택은 남고, 옛 구조체는 숨김 ──
const harness = `
const window = { state: {} }; const state = window.state;
function resolveDefectCategory(cat) {
    if (cat === '') return '';
    if (cat === '구조체' || cat === '비구조체' || cat === '마감재') return cat;
    return '구조체';
}
function getCurrentFloorDefects() { return state.list || []; }
function getStructuralComponentGroup(component) {
    const comp = component || '';
    if (comp.includes('기둥') || comp.includes('벽체')) return 'columnWall';
    if (comp.includes('보') || comp.includes('슬래브')) return 'beamSlab';
    return 'other';
}
${fn('getCurrentFloorFilteredDefects')}
return { state, getCurrentFloorFilteredDefects };
`;
const H = new Function(harness)();
H.state.list = [
    { id: 'old-struct', category: '구조체', component: '기둥' },
    { id: 'legacy-missing', component: '기둥' },
    { id: 'new-unset', category: '', component: '' },
    { id: 'non', category: '비구조체', component: '난간' },
    { id: 'fin', category: '마감재', component: '타일' }
];
H.state.categoryFilter = { columnWall: false, beamSlab: false, nonStructural: true, finishing: true };
const visible = H.getCurrentFloorFilteredDefects().map((d) => d.id).sort();
assert.deepStrictEqual(visible, ['fin', 'new-unset', 'non'], '구조체 꺼도 미선택·비구조·마감은 보임');
assert.ok(!visible.includes('old-struct') && !visible.includes('legacy-missing'), '옛 구조체·필드없음은 숨김');

H.state.categoryFilter = { columnWall: true, beamSlab: true, nonStructural: false, finishing: false };
const vis2 = H.getCurrentFloorFilteredDefects().map((d) => d.id).sort();
assert.ok(vis2.includes('new-unset') && vis2.includes('old-struct') && vis2.includes('legacy-missing'),
    '비구조·마감 꺼도 미선택·구조체는 보임');
assert.ok(!vis2.includes('non') && !vis2.includes('fin'));

// ── 입력 확인: 미선택은 구조체 오분류로 보지 않음, 필드 없는 옛 데이터는 그대로 ──
assert.deepStrictEqual(lint.lintDefect({ component: '블록벽체', defectType: '수직균열', category: '' }).map((i) => i.code),
    [], '미선택 새 마킹은 구조체 오분류로 안 봄');
assert.deepStrictEqual(lint.lintDefect({ component: '블록벽체', defectType: '수직균열' }).map((i) => i.code),
    ['masonry-structural'], '구분 없는 옛 마킹은 기존과 같음');
assert.deepStrictEqual(lint.lintDefect({ component: '블록벽체', defectType: '수직균열', category: '구조체' }).map((i) => i.code),
    ['masonry-structural'], '사용자가 구조체를 고른 기존 마킹은 그대로');

// ── 사용자가 고른 분류는 저장 경로가 UI 값을 그대로 씀 ──
const guarded = app.slice(app.indexOf('function readDefectGuardedFieldsFromUi('), app.indexOf('function captureDefectFormBaseline('));
assert.ok(/category: readDefectCategoryUi\(\)/.test(guarded), '가드 필드');
assert.ok(!/\|\| '구조체'/.test(guarded), '가드 필드가 미선택을 구조체로 덮지 않음');

console.log('test-new-mark-category-unselected: ok');
