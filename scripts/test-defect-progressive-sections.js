'use strict';
/**
 * t594u–t597u 수정창 단계 선택:
 * 대분류 미선택 → 부재/결함내용/원인 숨김
 * 대분류만 → 부재만
 * 실제 부재 후 → 결함내용. 마감재 바탕 단추만으로는 부재 완료 아님(재료 팝업 확정 후).
 * 숨겨도 값 유지. 기존 저장 결함 열기는 그대로.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const chooser = require(path.join(root, 'js/shared/finish-member-chooser.js'));

function extractNamed(name) {
    return extractFunction(app, 'function ' + name + '(');
}

(function staticMarkup() {
    assert.ok(html.includes('id="quickCategoryGroup"') && html.includes('id="quickComponentGroup"')
        && html.includes('id="quickTypeGroup"') && html.includes('id="quickCauseGroup"'),
        '단계 그룹 id');
    assert.ok(html.includes('id="defectTypedPresetMode"') && html.includes('id="quickMeasureGroup"'));
    const orderIds = ['quickCategoryGroup', 'quickComponentGroup', 'quickTypeGroup', 'quickMeasureGroup', 'quickCauseGroup']
        .map((id) => html.indexOf('id="' + id + '"'));
    assert.ok(orderIds.every((i) => i > 0) && orderIds.slice(1).every((i, n) => i > orderIds[n]),
        '분류 → 부재 → 결함내용 → 치수 → 원인 순서');
    assert.ok(/\.defect-quick-group\[hidden\]/.test(css) && /#defectTypedPresetMode\[hidden\]/.test(css));
    assert.ok(app.includes('function isCompletedDefectMember(') && app.includes('function syncDefectProgressiveSections('));
    assert.ok(/onConfirm: \(label\) => onComponentPick\(label\)/.test(app));
    assert.ok(/onCancel: \(\) => \{\s*\}/.test(app), '마감 재료 팝업 취소는 값 유지');
    assert.ok(/existingPin\.category === '' \? '' : resolveDefectCategory\(existingPin\.category\)/.test(app),
        '기존 결함 열기: 명시적 미선택 vs 옛 데이터');
    assert.ok(/const defaultCat = tmpl \? inheritDefectCategory\(tmpl\) : ''/.test(app), '새 마킹 대분류 미선택');
    assert.ok(!/populateDefectComponentDropdown\(category \|\|[\s\S]{0,40}\|\| '구조체'\)/.test(app)
        || /knownDefectCategoryOrEmpty\(category != null \? category/.test(app),
        '부재 목록이 미선택에서 구조체로 폴백하지 않음');
})();

(function memberCompleteRules() {
    const src = [
        'var DEFECT_CATEGORY_KNOWN = ["구조체","비구조체","마감재"];',
        extractNamed('readDefectCategoryUi'),
        'function isFinishMemberBaseName(name) { return ["기둥","벽체","보","슬래브"].indexOf(String(name||"").trim()) >= 0; }',
        'function isFinishCombinedMemberName(name) { return /^(기둥|벽체|보|슬래브)\\s+(타일|도장|마감재)$/.test(String(name||"").trim()); }',
        extractNamed('isCompletedDefectMember'),
        'return { isCompletedDefectMember, readDefectCategoryUi };'
    ].join('\n');
    const api = new Function(src)();

    assert.strictEqual(api.isCompletedDefectMember('', '구조체'), false, '부재 없음');
    assert.strictEqual(api.isCompletedDefectMember('   ', '비구조체'), false);
    assert.strictEqual(api.isCompletedDefectMember('기둥', '구조체'), true, '구조체 기둥은 완료');
    assert.strictEqual(api.isCompletedDefectMember('난간', '비구조체'), true);
    assert.strictEqual(api.isCompletedDefectMember('기둥', '마감재'), false, '마감재 바탕만은 미완료');
    assert.strictEqual(api.isCompletedDefectMember('벽체', '마감재'), false);
    assert.strictEqual(api.isCompletedDefectMember('보', '마감재'), false);
    assert.strictEqual(api.isCompletedDefectMember('슬래브', '마감재'), false);
    assert.strictEqual(api.isCompletedDefectMember('기둥 타일', '마감재'), true, '재료 확정 후 완료');
    assert.strictEqual(api.isCompletedDefectMember('벽체 도장', '마감재'), true);
    assert.strictEqual(api.isCompletedDefectMember('천장마감', '마감재'), true, '합친 바탕이 아닌 마감 부재');
    assert.ok(chooser.isBase('기둥') && !chooser.isCombined('기둥'));
    assert.ok(chooser.isCombined('기둥 타일'));
    assert.strictEqual(chooser.combine('기둥', '타일'), '기둥 타일');
})();

(function progressiveVisibility() {
    function makeEl(id, value) {
        return {
            id,
            value: value || '',
            hidden: false,
            style: { display: '' },
            attrs: {},
            setAttribute(k, v) { this.attrs[k] = v; },
            getAttribute(k) { return this.attrs[k]; },
            removeAttribute(k) { delete this.attrs[k]; }
        };
    }
    const els = {};
    ['defectCategory', 'defectComponent', 'defectComponentInput', 'defectType', 'defectTypeInput',
        'defectTypedPresetMode', 'quickComponentGroup', 'quickTypeGroup', 'quickCauseGroup'].forEach((id) => {
        els[id] = makeEl(id);
    });
    els.defectTypedPresetMode.hidden = true;   // 2026-11-06 직접 입력 중에만 보임 — 단계 표시와 무관
    function setState(cat, comp, type) {
        els.defectCategory.value = cat;
        els.defectComponent.value = comp;
        els.defectComponentInput.value = comp;
        els.defectType.value = type;
        els.defectTypeInput.value = type;
    }
    const src = [
        'var document = { getElementById: function (id) { return els[id] || null; } };',
        'var DEFECT_CATEGORY_KNOWN = ["구조체","비구조체","마감재"];',
        extractNamed('readDefectCategoryUi'),
        'function getDefectComboValue(select, input) { return String((input && input.value) || (select && select.value) || "").trim(); }',
        'function isGoodDefectType(t) { return String(t||"").indexOf("상태양호") >= 0; }',
        'function parseDefectTypeList(raw) { return String(raw||"").split(/[,，]+/).map(function(s){return s.trim();}).filter(Boolean); }',
        extractNamed('hasActionableDefectType'),
        'function isFinishMemberBaseName(name) { return ["기둥","벽체","보","슬래브"].indexOf(String(name||"").trim()) >= 0; }',
        'function isFinishCombinedMemberName(name) { return /^(기둥|벽체|보|슬래브)\\s+(타일|도장|마감재)$/.test(String(name||"").trim()); }',
        extractNamed('isCompletedDefectMember'),
        extractNamed('setDefectProgressiveGroupOpen'),
        extractNamed('syncDefectProgressiveSections'),
        'return { syncDefectProgressiveSections };'
    ].join('\n');
    const api = new Function('els', src)(els);

    function vis() {
        return {
            typed: !els.defectTypedPresetMode.hidden,
            comp: !els.quickComponentGroup.hidden,
            type: !els.quickTypeGroup.hidden,
            cause: !els.quickCauseGroup.hidden
        };
    }

    setState('', '', '');
    api.syncDefectProgressiveSections();
    assert.deepStrictEqual(vis(), { typed: false, comp: false, type: false, cause: false }, '대분류 미선택: 부재·결함·원인 숨김');
    assert.strictEqual(els.defectComponentInput.value, '', '숨겨도 값은 그대로(빈 값)');

    setState('구조체', '', '수직균열');
    api.syncDefectProgressiveSections();
    let v = vis();
    assert.strictEqual(v.comp, true, '대분류만: 부재 보임');
    assert.strictEqual(v.type, false, '부재 없으면 결함내용 숨김');
    assert.strictEqual(v.cause, false, '결함 맥락 없으면 원인 숨김');
    assert.strictEqual(els.defectTypeInput.value, '수직균열', '숨겨도 결함내용 값 유지');

    setState('구조체', '기둥', '수직균열');
    api.syncDefectProgressiveSections();
    v = vis();
    assert.strictEqual(v.comp && v.type && v.cause, true, '부재+결함 있으면 원인까지');

    setState('마감재', '기둥', '균열');
    api.syncDefectProgressiveSections();
    v = vis();
    assert.strictEqual(v.comp, true);
    assert.strictEqual(v.type, false, '마감재 바탕만: 결함내용 숨김');
    assert.strictEqual(els.defectComponentInput.value, '기둥', '바탕 이름 유지(팝업 취소와 같음)');

    setState('마감재', '기둥 타일', '균열');
    api.syncDefectProgressiveSections();
    v = vis();
    assert.strictEqual(v.type, true, '재료 확정 후 결함내용');
    assert.strictEqual(v.cause, true);

    setState('비구조체', '난간', '상태양호');
    api.syncDefectProgressiveSections();
    v = vis();
    assert.strictEqual(v.type, true);
    assert.strictEqual(v.cause, false, '상태양호는 원인 숨김(기존)');
})();

(function noAutoSelectAndLegacyOpen() {
    const populate = extractNamed('populateDefectComponentDropdown');
    assert.ok(/knownDefectCategoryOrEmpty/.test(populate), '미선택 분류는 구조체 프리셋 안 씀');
    assert.ok(/if \(!cat\)/.test(populate) && /keep/.test(populate), '미선택에서 기존 부재값 유지');
    const openBlk = app.slice(app.indexOf('if (existingPin) {'), app.indexOf('if (existingPin) {') + 2500);
    assert.ok(/populateDefectComponentDropdown\(compCatExisting/.test(openBlk));
    assert.ok(/updateDefectTypeDropdown\(existingPin\.category \|\| '구조체'/.test(openBlk)
        || /updateDefectTypeDropdown\(/.test(openBlk), '기존 기록 열기');
    const listener = app.slice(app.indexOf('defectCategorySelect.addEventListener(\'change\''), app.indexOf('defectCategorySelect.addEventListener(\'change\'') + 1800);
    assert.ok(/keepComp/.test(listener) && /지우지 않는다/.test(listener), '분류 바꿔도 값 유지');
    const presetFn = extractNamed('getDefectComponentPresetForCategory');
    assert.ok(/return \[\];/.test(presetFn), '미선택 프리셋 빈 목록');
})();

(function finishChooserCancelConfirm() {
    const blk = app.slice(app.indexOf('if (showFinishBases)'), app.indexOf('if (showFinishBases)') + 1600);
    assert.ok(/chooser\.open\(/.test(blk));
    assert.ok(/onConfirm: \(label\) => onComponentPick\(label\)/.test(blk));
    assert.ok(/onCancel: \(\) => \{\s*\}/.test(blk));
    assert.ok(!/onCancel:[\s\S]{0,80}onComponentPick/.test(blk), '취소는 부재를 바꾸지 않음');
})();

console.log('test-defect-progressive-sections: ok');
