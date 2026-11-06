#!/usr/bin/env node
'use strict';

/**
 * 직접 입력 「프리셋에 저장」/「이번만 사용」토글.
 * 기본(선호 없음)은 예전처럼 이번만. 저장 모드는 회사 공통 목록에 중복 없이 넣고,
 * 이번만은 이 결함 값만 남긴다. 기존 프리셋·옛 기록은 지우지 않는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const TPM = require(path.join(root, 'js', 'shared', 'typed-preset-mode.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'js', 'shared', 'typing-popup.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

function extractFunction(name) {
    const re = new RegExp('\\n\\s*function ' + name + '\\s*\\(');
    const m = re.exec(app);
    assert.ok(m, 'missing ' + name);
    const start = m.index + 1;
    let i = app.indexOf('{', start);
    let depth = 0;
    for (; i < app.length; i++) {
        const ch = app[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return app.slice(start, i + 1);
        }
    }
    throw new Error('unterminated ' + name);
}

(function moduleDefaults() {
    const mem = {};
    const prev = global.localStorage;
    global.localStorage = {
        getItem: (k) => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); }
    };
    const fresh = require(path.join(root, 'js', 'shared', 'typed-preset-mode.js'));
    assert.strictEqual(fresh.getMode(), 'once', '선호 없으면 이번만 사용');
    assert.strictEqual(fresh.shouldPersist(), false);
    assert.strictEqual(fresh.hasStoredPreference(), false);
    fresh.setMode('save');
    assert.strictEqual(fresh.getMode(), 'save');
    assert.strictEqual(fresh.shouldPersist(), true);
    assert.strictEqual(mem[fresh.KEY], 'save');
    fresh.setMode('once');
    assert.strictEqual(fresh.shouldPersist(), false);
    assert.strictEqual(mem[fresh.KEY], 'once');
    global.localStorage = prev;
})();

(function wiring() {
    assert.ok(html.includes('id="defectTypedPresetMode"'));
    assert.ok(html.includes('data-typed-preset-mode="save"') && html.includes('data-typed-preset-mode="once"'));
    assert.ok(html.includes('js/shared/typed-preset-mode.js?v='));
    assert.ok(html.indexOf('js/shared/typed-preset-mode.js') < html.indexOf('src="app.js'));
    assert.ok(app.includes('persistTypedDefectType') && app.includes('persistTypedDefectComponent'));
    assert.ok(app.includes('shouldPersistTypedPreset()'));
    assert.ok(app.includes('bindTypedPresetModeToggle'));
    assert.ok(popup.includes('presetMode: true') && popup.includes('프리셋에 저장'));
    assert.ok(css.includes('.defect-typed-preset-mode') && css.includes('.bsa-typing-preset-mode'));
    const combo = extractFunction('bindDefectComboInputs');
    assert.ok(/shouldPersistTypedPreset\(\)/.test(combo), '부재·결함내용 확정이 토글을 본다');
    const cause = extractFunction('bindDefectCauseDirectInput');
    assert.ok(/typedPresetMode\.shouldPersist/.test(cause), '원인 Enter가 토글을 본다');
    assert.ok(/commitDefectCauseDirectInput\(true\)/.test(cause), '추가 버튼은 항상 목록 저장');
    const joint = extractFunction('applyJointComponentFromComposer');
    assert.ok(!/persistTypedDefectComponent/.test(joint), '접합부 조합은 목록에 안 넣음');
})();

(function persistHelpers() {
    const env = {
        state: {
            customDefectTypes: { '구조체': ['기존종류'], '비구조체': [], '마감재': [] },
            customDefectComponents: { '구조체': ['기존부재'], '비구조체': [], '마감재': [] },
            defectTypeOrder: { '구조체': ['기존종류'] },
            defectComponentOrder: { '구조체': ['기존부재'] }
        },
        saved: 0,
        category: '구조체'
    };
    const document = {
        getElementById(id) {
            if (id === 'defectCategory') return { value: env.category };
            if (id === 'defectComponent' || id === 'defectComponentInput') return { value: '벽체' };
            return { value: '' };
        }
    };
    const window = { state: env.state };
    const fns = [
        extractFunction('knownDefectCategoryOrEmpty'),
        extractFunction('persistTypedDefectComponent'),
        extractFunction('persistTypedDefectType'),
        'return { knownDefectCategoryOrEmpty, persistTypedDefectComponent, persistTypedDefectType };'
    ].join('\n');
    const presetMap = { '구조체': ['벽체'], '비구조체': [], '마감재': [] };
    const api = new Function(
        'document', 'window', 'migrateDefectComponentStateShape', 'DEFECT_COMPONENT_PRESET',
        'ensureOptionOrderEntry', 'saveStateToLocalStorage', 'isTransientDefectTypeValue',
        'getDefectComboValue', 'getDefectTypePresetFor', 'getDefectComponentPresetForCategory',
        fns
    )(
        document, window, () => {},
        presetMap,
        (bucket, key) => {
            if (!env.state[bucket]) env.state[bucket] = {};
            if (!Array.isArray(env.state[bucket][key])) env.state[bucket][key] = [];
            return env.state[bucket][key];
        },
        () => { env.saved++; },
        (v) => /[,]/.test(v),
        () => '벽체',
        (cat) => (cat === '구조체' ? ['균열'] : []),
        (cat) => (presetMap[cat] || []).slice()
    );

    assert.strictEqual(api.knownDefectCategoryOrEmpty(''), '');
    assert.strictEqual(api.knownDefectCategoryOrEmpty('기타'), '');
    assert.strictEqual(api.persistTypedDefectType('균열'), false, '기본 프리셋은 다시 안 넣음');
    assert.ok(api.persistTypedDefectType('배관 이격'));
    assert.deepStrictEqual(env.state.customDefectTypes['구조체'], ['기존종류', '배관 이격']);
    assert.strictEqual(api.persistTypedDefectType('배관 이격'), false, '중복 안 넣음');
    assert.deepStrictEqual(env.state.customDefectTypes['구조체'], ['기존종류', '배관 이격']);
    env.category = '마감재';
    assert.ok(api.persistTypedDefectType('배관 이격'));
    assert.deepStrictEqual(env.state.customDefectTypes['구조체'], ['기존종류', '배관 이격'], '다른 분류에 넣어도 기존 분류는 유지');
    assert.deepStrictEqual(env.state.customDefectTypes['마감재'], ['배관 이격']);
    env.category = '';
    assert.strictEqual(api.persistTypedDefectType('새종류'), false, '대분류 미선택은 목록에 안 넣음');
    env.category = '구조체';
    assert.ok(api.persistTypedDefectComponent('파라펫'));
    assert.deepStrictEqual(env.state.customDefectComponents['구조체'], ['기존부재', '파라펫']);
    assert.strictEqual(api.persistTypedDefectComponent('벽체'), false, '기본 부재는 다시 안 넣음');
    assert.ok(env.saved >= 2);
})();

(function causeEnterRespectsToggle() {
    const src = extractFunction('bindDefectCauseDirectInput');
    assert.ok(/commitDefectCauseDirectInput\(persistTyped\)/.test(src)
        || /commitDefectCauseDirectInput\(persist/.test(src));
    assert.ok(/commitDefectCauseDirectInput\(true\)/.test(src));
})();

console.log('test-typed-preset-mode: ok');
