#!/usr/bin/env node
'use strict';

/**
 * Regression (2026-09-28): "발생원인에 엔터쳐서 입력하면 발생원인이 추가가 되버리던데"
 * - 발생 원인 입력칸 Enter → 이번 결함 선택에만 반영, 원인 목록(customDefectCauses)에는 저장 안 함
 * - '추가' 버튼(btnAddCustomCause) → 명시적으로 목록에 저장 (유지)
 * - 셀렉트에서 기존 원인 고르기 → 목록 저장 안 함
 * - 비파괴 부재 구분/마감상태 입력칸 Enter → 목록 저장 안 함, '추가' 버튼만 저장
 * app.js는 단일 번들이라 필요한 함수만 잘라 스텁과 함께 실행한다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractFunction(name) {
    const re = new RegExp('\\n\\s*function ' + name + '\\s*\\(');
    const m = re.exec(src);
    assert.ok(m, 'missing function ' + name);
    const start = m.index + 1;
    let i = src.indexOf('{', start);
    let depth = 0;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return src.slice(start, i + 1);
        }
    }
    throw new Error('unterminated function ' + name);
}

function makeEnv() {
    const listeners = {};
    const input = {
        value: '',
        dataset: {},
        addEventListener(type, fn) { (listeners['input:' + type] = listeners['input:' + type] || []).push(fn); }
    };
    const btn = {
        dataset: {},
        addEventListener(type, fn) { (listeners['btn:' + type] = listeners['btn:' + type] || []).push(fn); }
    };
    const env = {
        state: { customDefectCauses: {}, defectCauseOrder: {} },
        selected: [],
        lastDropdown: null,
        saved: 0,
        toasts: [],
        input,
        btn,
        fire(target, type, ev) { (listeners[target + ':' + type] || []).forEach(fn => fn(ev)); }
    };
    const document = {
        getElementById(id) {
            if (id === 'defectCauseInput') return input;
            if (id === 'btnAddCustomCause') return btn;
            return { id, value: '' };
        }
    };
    const window = { state: env.state, showToast: (m) => env.toasts.push(m) };
    const deps = {
        document,
        window,
        getDefectComboValue: () => '균열',
        getCauseDisplayGroups: () => [{ key: '균열' }],
        getCauseKey: () => '균열',
        ensureOptionOrderEntry: (k, key) => {
            env.state[k][key] = env.state[k][key] || [];
            return env.state[k][key];
        },
        saveStateToLocalStorage: () => { env.saved++; },
        getSelectedCausesFromUi: () => env.selected.slice(),
        joinCauseList: (l) => l.join(', '),
        parseCauseList: (raw) => String(raw || '').split(/[,，/·•|]+/).map(s => s.trim()).filter(Boolean),
        updateDefectCauseDropdown: (t, joined) => {
            env.lastDropdown = joined;
            env.selected = joined ? joined.split(', ') : [];
        },
        scheduleDefectAutoApply: () => {}
    };
    const body = [
        extractFunction('selectDefectCauseForCurrentDefect'),
        extractFunction('addCustomDefectCause'),
        extractFunction('commitDefectCauseDirectInput'),
        extractFunction('bindDefectCauseDirectInput'),
        'return { selectDefectCauseForCurrentDefect, addCustomDefectCause, commitDefectCauseDirectInput, bindDefectCauseDirectInput };'
    ].join('\n');
    const names = Object.keys(deps);
    // eslint-disable-next-line no-new-func
    env.api = new Function(...names, body)(...names.map(n => deps[n]));
    env.api.bindDefectCauseDirectInput();
    return env;
}

function testEnterSelectsWithoutSavingPreset() {
    const env = makeEnv();
    env.state.customDefectCauses['균열'] = ['기존 커스텀'];
    env.selected = ['건조수축'];
    env.input.value = '배관 누수';
    let prevented = false;
    env.fire('input', 'keydown', { key: 'Enter', preventDefault() { prevented = true; } });
    assert.ok(prevented, 'Enter should be handled');
    assert.deepStrictEqual(env.state.customDefectCauses['균열'], ['기존 커스텀'], 'Enter must not add a cause preset');
    assert.strictEqual(env.saved, 0, 'Enter must not persist cause list');
    assert.strictEqual(env.lastDropdown, '건조수축, 배관 누수', 'Enter selects typed cause for this defect');
    assert.strictEqual(env.input.value, '', 'input cleared after commit');
}

function testAddButtonStillSavesPreset() {
    const env = makeEnv();
    env.input.value = '배관 누수';
    env.fire('btn', 'click', { preventDefault() {} });
    assert.deepStrictEqual(env.state.customDefectCauses['균열'], ['배관 누수'], '추가 button saves to list');
    assert.deepStrictEqual(env.state.defectCauseOrder['균열'], ['배관 누수']);
    assert.strictEqual(env.saved, 1);
    assert.strictEqual(env.lastDropdown, '배관 누수');
}

function testPromptAddStillSaves() {
    const env = makeEnv();
    env.api.addCustomDefectCause('지하수 유입');
    assert.deepStrictEqual(env.state.customDefectCauses['균열'], ['지하수 유입']);
}

function testSourceGates() {
    assert.ok(/selectDefectCauseForCurrentDefect\(picked, false\)/.test(src),
        'select pick of an existing cause must not persist it');
    assert.ok(!/addCustomDefectCause\(picked\)/.test(src), 'select pick must not call addCustomDefectCause');
    const ndtKeydown = /if \(e\.key !== 'Enter'\) return;[\s\S]{0,200}?applyTypedValue\(spec, ([^)]+)\)/.exec(src);
    assert.ok(ndtKeydown, 'NDT pick keydown handler not found');
    assert.strictEqual(ndtKeydown[1], "'enter'", 'NDT Enter must not persist custom picks');
    assert.ok(/addBtn\.addEventListener\('click'[\s\S]{0,120}?applyTypedValue\(spec, true\)/.test(src),
        'NDT 추가 button keeps saving');
}

testEnterSelectsWithoutSavingPreset();
testAddButtonStillSavesPreset();
testPromptAddStillSaves();
testSourceGates();
console.log('test-defect-cause-enter-no-preset: ok');
