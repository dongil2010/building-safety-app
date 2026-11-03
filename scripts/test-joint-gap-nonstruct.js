'use strict';
// 2026-11-03 구조체로 적은 「접합부 + 이격」 결함은 대부분 비구조체 → 고르는 순간 비구조체로 옮긴다.
// 미장(항상 비구조체)과 달리 강제가 아니다: 사용자가 구조체를 다시 누르면 그대로 둔다. 저장된 결함을 열 때·일괄 수정은 건드리지 않는다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function build(state) {
    const els = {
        defectCategory: { value: state.cat, events: [], dispatchEvent(e) { this.events.push(e.type); return true; } },
        defectComponent: { value: state.comp },
        defectComponentInput: { value: '' },
        defectType: { value: state.type },
        defectTypeInput: { value: '' }
    };
    const toasts = [];
    const win = { _defectFormHydrating: !!state.hydrating, _jointGapKeepStructural: !!state.keep, showToast: (m) => toasts.push(m) };
    const src = [
        extractFunction(app, 'function parseDefectTypeList('),
        extractFunction(app, 'function isJointGapDefect('),
        extractFunction(app, 'function maybeReclassifyJointGapToNonStructural('),
        'return { isJointGapDefect, maybeReclassifyJointGapToNonStructural };'
    ].join('\n');
    const helpers = 'const getDefectComboValue = (a, b) => (a && a.value) || (b && b.value) || "";\n'
        + 'const isDefectBulkEditMode = () => !!bulk;\n'
        + 'const splitDefectTypeText = (t) => String(t || "").split(/[,，]/).map((x) => x.trim()).filter(Boolean);\n';
    let api;
    try {
        api = new Function('document', 'window', 'bulk', 'Event', helpers + src)(
            { getElementById: (id) => els[id] || null }, win, !!state.bulk, function (type) { this.type = type; }
        );
    } catch (e) {
        throw new Error('함수 추출 실패: ' + e.message);
    }
    return { api, els, win, toasts };
}

// 1) 판정: 접합부 + 이격 종류
{
    const { api } = build({ cat: '구조체', comp: '', type: '' });
    assert.strictEqual(api.isJointGapDefect('기둥-벽체 접합부', '수직이격'), true);
    assert.strictEqual(api.isJointGapDefect('기둥-보 접합부', '이격'), true);
    assert.strictEqual(api.isJointGapDefect('벽체 접합부', '수직균열, 이격'), true, '여러 종류 중 하나만 이격이어도');
    assert.strictEqual(api.isJointGapDefect('기둥-보 접합부', '수직균열'), false, '접합부 균열은 그대로');
    assert.strictEqual(api.isJointGapDefect('기둥', '수직이격'), false, '접합부가 아니면 그대로');
    assert.strictEqual(api.isJointGapDefect('', '이격'), false);
}

// 2) 구조체 + 접합부 + 이격 → 비구조체로 옮김(부재·종류 유지, 알림)
{
    const t = build({ cat: '구조체', comp: '기둥-벽체 접합부', type: '수직이격' });
    assert.strictEqual(t.api.maybeReclassifyJointGapToNonStructural(), true);
    assert.strictEqual(t.els.defectCategory.value, '비구조체');
    assert.deepStrictEqual(t.els.defectCategory.events, ['change']);
    assert.strictEqual(t.win._preserveDefectTypeOnCategoryChange, '수직이격');
    assert.strictEqual(t.win._preserveDefectComponentOnCategoryChange, '기둥-벽체 접합부');
    assert.strictEqual(t.toasts.length, 1);
    assert.strictEqual(t.win._jointGapAutoSwitching, false, '자동 전환 표시는 끝나면 꺼진다');
}

// 3) 옮기지 않는 경우
[
    ['접합부 균열', { cat: '구조체', comp: '기둥-보 접합부', type: '수직균열' }],
    ['접합부 아님', { cat: '구조체', comp: '기둥', type: '이격' }],
    ['이미 비구조체', { cat: '비구조체', comp: '벽체 접합부', type: '이격' }],
    ['마감재', { cat: '마감재', comp: '벽체 접합부', type: '이격' }],
    ['저장된 결함 열기', { cat: '구조체', comp: '벽체 접합부', type: '이격', hydrating: true }],
    ['일괄 수정', { cat: '구조체', comp: '벽체 접합부', type: '이격', bulk: true }]
].forEach(([name, st]) => {
    const t = build(st);
    assert.strictEqual(t.api.maybeReclassifyJointGapToNonStructural(), false, name);
    assert.strictEqual(t.els.defectCategory.value, st.cat, name + ': 분류 그대로');
    assert.strictEqual(t.els.defectCategory.events.length, 0, name + ': 이벤트 없음');
});

// 4) 사용자가 구조체를 다시 눌렀으면(같은 부재·종류인 동안) 존중, 다른 부재·종류가 되면 기억을 지운다
{
    const t = build({ cat: '구조체', comp: '벽체 접합부', type: '이격', keep: true });
    assert.strictEqual(t.api.maybeReclassifyJointGapToNonStructural(), false);
    assert.strictEqual(t.els.defectCategory.value, '구조체');
    t.els.defectType.value = '수직균열'; // 이격이 아니게 됨 → 기억 해제
    assert.strictEqual(t.api.maybeReclassifyJointGapToNonStructural(), false);
    assert.strictEqual(t.win._jointGapKeepStructural, false);
    t.els.defectType.value = '이격';
    assert.strictEqual(t.api.maybeReclassifyJointGapToNonStructural(), true, '다시 이격을 고르면 또 옮김');
}

// 5) 연결: 부재 칩·종류 칩·종류/부재 선택·타이핑 확정에서 부른다. 분류 핸들러는 사용자가 구조체를 누르면 기억한다. 폼을 열 때 초기화.
assert.ok(/refreshDefectTypeAfterComponentChange\(currentCategory\);\s*if \(maybeReclassifyJointGapToNonStructural\(\)\) return;/.test(app), '부재 칩');
assert.ok(/if \(maybeReclassifyPlasterCrackToNonStructural\(\)\) return;\s*if \(maybeReclassifyJointGapToNonStructural\(\)\) return;/.test(app), '종류 칩·선택');
assert.ok(/refreshDefectTypeAfterComponentChange\(cat\);\s*maybeReclassifyJointGapToNonStructural\(\);/.test(app), '부재 선택');
assert.ok(/typeof maybeReclassifyJointGapToNonStructural === 'function' && maybeReclassifyJointGapToNonStructural\(\)/.test(app), '타이핑 확정');
assert.ok(/cat === '구조체' && !window\._jointGapAutoSwitching && !window\._defectFormHydrating/.test(app), '사용자가 구조체를 누르면 기억');
assert.strictEqual((app.match(/window\._jointGapKeepStructural = false; \/\/ 새로 연 창/g) || []).length, 2, '폼을 열 때 초기화');
// 저장 경로는 강제하지 않는다(미장과 다름)
assert.ok(!/isJointGapDefect/.test(app.slice(app.indexOf('function bsaPlasterNonStructCategory('), app.indexOf('window.bsaPlasterNonStructCategory'))), '저장 때 강제 안 함');

console.log('test-joint-gap-nonstruct: ok');
