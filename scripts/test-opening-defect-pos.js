#!/usr/bin/env node
'use strict';

/**
 * 2026-10-27 개구부 결함: 창 상부·창 하부·창 측면·문 상부·문 측면 인식 / 한글 표기("창 상부 벽체 ...") / 폼 자동 체크 / 라벨 이름
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function extractFunction(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, header + ' 를 찾지 못했다');
    const m = /\)\s*\{/.exec(src.slice(at));
    const open = at + m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error(header + ' 끝을 찾지 못했다');
}

// ---- 라벨 ----
assert.ok(/id="defectOpeningCrackCheck"> 개구부 결함<\/label>/.test(html), '체크박스 이름이 개구부 결함');
assert.ok(!/id="defectOpeningCrackCheck"> 개구부 균열/.test(html), '개구부 균열 이름이 남아 있으면 안 됨');
['창 상부', '창 하부', '창 측면', '문 상부', '문 측면', '개구부 상부', '개구부 하부'].forEach((n) => {
    assert.ok(html.includes('data-opening-pos="' + n + '"'), n + ' 버튼 유지');
});

// ---- 함수 ----
const code = [
    "const OPENING_POS_NAMES = ['창 상부', '창 하부', '창 측면', '문 상부', '문 측면', '개구부 상부', '개구부 하부'];",
    extractFunction(app, 'function findOpeningPosListInText('),
    extractFunction(app, 'function parseOpeningPosValue('),
    extractFunction(app, 'function normalizeOpeningPosValue('),
    extractFunction(app, 'function formatOpeningPosLabel('),
    extractFunction(app, 'function findOpeningPosInText('),
    extractFunction(app, 'function stripOpeningPosPrefix('),
    extractFunction(app, 'function parseDefectTypeList('),
    extractFunction(app, 'function joinDefectTypeList('),
    extractFunction(app, 'function formatOpeningAwareDefectType('),
    extractFunction(app, 'function detectImportOpeningCrack('),
    'this.find = findOpeningPosInText; this.fmt = formatOpeningAwareDefectType; this.det = detectImportOpeningCrack;',
    'this.list = findOpeningPosListInText; this.parse = parseOpeningPosValue; this.norm = normalizeOpeningPosValue; this.label = formatOpeningPosLabel;'
].join('\n');
const sb = { window: {}, isGoodDefectType: (t) => t === '상태양호' };
vm.createContext(sb);
vm.runInContext(code, sb);

// 인식 (띄어쓰기 무관)
['창상부', '창 상부', '창  상부', '창\u3000상부', '창상 부 균열'.replace('상 부', '상부')].forEach((s) => assert.strictEqual(sb.find('수직 ' + s + ' 균열'), '창 상부', s));
assert.strictEqual(sb.find('창하부 수직균열'), '창 하부');
assert.strictEqual(sb.find('창  측면'), '창 측면');
assert.strictEqual(sb.find('문상부'), '문 상부');
assert.strictEqual(sb.find('문 측면 균열'), '문 측면');
assert.strictEqual(sb.find('문측면'), '문 측면');
assert.strictEqual(sb.find('문 하부'), '', '목록에 없는 조합은 무시');
assert.strictEqual(sb.find('창고 상부'), '');
assert.strictEqual(sb.find('수직균열'), '');
assert.strictEqual(sb.find('문 하부 균열, 문 상부 균열'), '문 상부');

// 한글 표기
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '창 상부', isOpeningCrack: true }), '창 상부 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '문 측면', isOpeningCrack: true }), '문 측면 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '창 하부 사선균열', openingPos: '창 하부' }), '창 하부 벽체 사선균열');
assert.strictEqual(sb.fmt({ defectType: '개구부 주위 수직균열', openingPos: '창 측면' }), '창 측면 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '', openingPos: '문 상부' }), '문 상부 벽체 균열');
assert.strictEqual(sb.fmt({ defectType: '수직균열, 누수', openingPos: '창 상부' }), '창 상부 벽체 수직균열, 창 상부 벽체 누수');
// 위치 미선택 + 글에 이름 있음 → 글에서 찾아 표기(띄어쓰기 정리)
assert.strictEqual(sb.fmt({ defectType: '창상부 수직균열' }), '창 상부 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '문측면  사선균열', isOpeningCrack: true }), '문 측면 벽체 사선균열');
assert.strictEqual(sb.fmt({ defectType: '창 상부 벽체 수직균열' }), '창 상부 벽체 수직균열');
// 둘 다 없으면 예전 표기
assert.strictEqual(sb.fmt({ defectType: '수직균열', isOpeningCrack: true }), '개구부 주위 수직균열');
assert.strictEqual(sb.fmt({ defectType: '', isOpeningCrack: true }), '개구부 주위 균열');
assert.strictEqual(sb.fmt({ defectType: '수직균열' }), '수직균열');
assert.strictEqual(sb.fmt({ defectType: '상태양호', openingPos: '창 상부' }), '상태양호');

// 가져오기 인식
assert.strictEqual(sb.det({ location: '', defectType: '문 상부 수직균열', component: '벽체', size: '' }), true);
assert.strictEqual(sb.det({ location: '', defectType: '창 하부', component: '', size: '' }), true);
assert.strictEqual(sb.det({ location: '', defectType: '수직균열', component: '벽체', size: '' }), false);
assert.strictEqual(sb.det({ location: '창측면', defectType: '', component: '', size: '', isGood: true }), false);

// ---- 폼 자동 체크 (스텁 DOM) ----
function makeForm(textVal, opts) {
    opts = opts || {};
    const listeners = [];
    const chk = {
        checked: !!opts.checked, dataset: {},
        dispatchEvent(ev) { listeners.push(ev.type); return true; }
    };
    let pos = opts.pos || '';
    const ctx = {
        window: { _defectFormHydrating: !!opts.hydrating },
        document: { getElementById: (id) => (id === 'defectOpeningCrackCheck' ? chk : { value: textVal }) },
        Event: function (type) { this.type = type; },
        getDefectComboValue: () => textVal,
        isDefectBulkEditMode: () => !!opts.bulk,
        readDefectOpeningPosUi: () => pos,
        setDefectOpeningPosUi: (v) => { pos = v; },
        refreshDefectOpeningPosRow: () => {}
    };
    ctx.OPENING_POS_NAMES = null;
    vm.createContext(ctx);
    vm.runInContext("const OPENING_POS_NAMES = ['창 상부', '창 하부', '창 측면', '문 상부', '문 측면', '개구부 상부', '개구부 하부'];\n"
        + extractFunction(app, 'function findOpeningPosListInText(') + '\n' + extractFunction(app, 'function parseOpeningPosValue(') + '\n' + extractFunction(app, 'function normalizeOpeningPosValue(') + '\n' + extractFunction(app, 'function formatOpeningPosLabel(') + '\n' + extractFunction(app, 'function findOpeningPosInText(') + '\n'
        + extractFunction(app, 'function autoDetectOpeningFromDefectContent(') + '\nthis.run = autoDetectOpeningFromDefectContent;', ctx);
    return { chk, ctx, getPos: () => pos, listeners };
}
let f = makeForm('창상부 수직균열');
f.ctx.run();
assert.strictEqual(f.chk.checked, true); assert.strictEqual(f.getPos(), '창 상부'); assert.deepStrictEqual(f.listeners, ['change']);
f = makeForm('수직균열', { checked: true, pos: '창 하부' });
f.ctx.run(); assert.strictEqual(f.chk.checked, true, '이름이 없어도 체크는 끄지 않는다'); assert.strictEqual(f.getPos(), '창 하부');
f = makeForm('문측면 균열', { checked: true, pos: '' });
f.ctx.run(); assert.strictEqual(f.getPos(), '', '이미 체크된 건 위치 버튼 건드리지 않음');
f = makeForm('문 상부 균열', { hydrating: true });
f.ctx.run(); assert.strictEqual(f.chk.checked, false, '창 열 때 채우는 중에는 건드리지 않음');
f = makeForm('문 상부 균열', { bulk: true });
f.ctx.run(); assert.strictEqual(f.chk.checked, false, '일괄수정은 건드리지 않음');
f = makeForm('문 상부 균열'); f.chk.dataset.openingManualOff = '1';
f.ctx.run(); assert.strictEqual(f.chk.checked, false, '사용자가 끈 건 다시 켜지 않음');
f = makeForm('수직균열'); f.chk.dataset.openingManualOff = '1';
f.ctx.run(); assert.strictEqual(f.chk.dataset.openingManualOff, undefined, '이름이 지워지면 「직접 끔」 기억 해제');

// ---- 2026-11-10 「창 상부·하부 중복으로 고를 수 있게 해주고 개구부 상부 개구부 하부도 추가」 ----
const J = (v) => JSON.stringify(v);
// 개구부 상부·하부 인식 (개구부 측면은 목록에 없음)
assert.strictEqual(sb.find('개구부 상부 수직균열'), '개구부 상부');
assert.strictEqual(sb.find('개구부하부'), '개구부 하부');
assert.strictEqual(sb.find('개구부 측면'), '');
assert.strictEqual(sb.find('개구부 주위 수직균열'), '', '개구부 주위는 위치가 아니다');
// 줄여 쓴 묶음: 창 상부·하부
assert.strictEqual(J(sb.list('창 상부·하부 수직균열')), J(['창 상부', '창 하부']));
assert.strictEqual(J(sb.list('창상부/하부')), J(['창 상부', '창 하부']));
assert.strictEqual(J(sb.list('문 상부·하부')), J(['문 상부']), '문 하부는 목록에 없다');
// 결함 내용 글: 처음 나온 한 묶음만(예전과 같게) / 골라 둔 값: 전부
assert.strictEqual(J(sb.list('창 상부 균열, 창 하부 누수')), J(['창 상부']));
assert.strictEqual(J(sb.parse('창 상부, 창 하부')), J(['창 상부', '창 하부']));
assert.strictEqual(J(sb.parse('개구부 하부, 창 측면')), J(['개구부 하부', '창 측면']));
assert.strictEqual(J(sb.parse('')), J([]));
// 저장 값: 버튼 순서대로, 겹치면 한 번, 모르는 옛 값은 그대로
assert.strictEqual(sb.norm('창 하부, 창 상부'), '창 상부, 창 하부');
assert.strictEqual(sb.norm('창 상부, 창상부'), '창 상부');
assert.strictEqual(sb.norm('창 상부'), '창 상부', '하나만 고른 예전 값 그대로');
assert.strictEqual(sb.norm(''), '');
assert.strictEqual(sb.norm('옥상 난간'), '옥상 난간');
// 표기: 같은 종류는 묶는다
assert.strictEqual(sb.label(['창 상부', '창 하부']), '창 상부·하부');
assert.strictEqual(sb.label(['창 상부', '창 하부', '창 측면']), '창 상부·하부·측면');
assert.strictEqual(sb.label(['창 상부', '문 상부']), '창 상부·문 상부');
assert.strictEqual(sb.label(['개구부 상부', '개구부 하부']), '개구부 상부·하부');
assert.strictEqual(sb.label(['창 상부']), '창 상부');
// 조사내용
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '창 상부, 창 하부', isOpeningCrack: true }), '창 상부·하부 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '수직균열, 누수', openingPos: '창 상부, 창 하부' }), '창 상부·하부 벽체 수직균열, 창 상부·하부 벽체 누수');
assert.strictEqual(sb.fmt({ defectType: '수직균열', openingPos: '개구부 상부', isOpeningCrack: true }), '개구부 상부 벽체 수직균열');
assert.strictEqual(sb.fmt({ defectType: '', openingPos: '개구부 상부, 개구부 하부' }), '개구부 상부·하부 벽체 균열');
assert.strictEqual(sb.fmt({ defectType: '창 상부·하부 벽체 수직균열', openingPos: '창 상부, 창 하부' }), '창 상부·하부 벽체 수직균열', '이미 붙은 표기는 한 번만');
assert.strictEqual(sb.fmt({ defectType: '창 상부·하부 수직균열' }), '창 상부·하부 벽체 수직균열', '글에 줄여 쓴 것');
assert.strictEqual(sb.fmt({ defectType: '개구부하부 사선균열' }), '개구부 하부 벽체 사선균열');
assert.strictEqual(sb.fmt({ defectType: '창 상부 수직균열, 창 하부 누수' }), '창 상부 벽체 수직균열, 창 상부 벽체 누수', '위치를 안 고른 예전 글은 예전 표기 그대로');
assert.strictEqual(sb.det({ location: '', defectType: '개구부 상부 균열', component: '벽체', size: '' }), true);
// 버튼: 누를 때마다 그 위치만 켜고 끈다(다른 위치는 그대로)
assert.ok(/if \(at >= 0\) list\.splice\(at, 1\); else list\.push\(v\);\s*setDefectOpeningPosUi\(list\.join\(', '\)\);/.test(app));
assert.ok(/const on = curList\.indexOf\(b\.getAttribute\('data-opening-pos'\)\) >= 0;/.test(app), '고른 것 모두 켜진 표시');
// 결함 내용에 「창 상부·하부」를 쓰면 둘 다 자동으로
f = makeForm('창 상부·하부 수직균열');
f.ctx.run(); assert.strictEqual(f.chk.checked, true); assert.strictEqual(f.getPos(), '창 상부, 창 하부');
f = makeForm('개구부 상부 균열');
f.ctx.run(); assert.strictEqual(f.chk.checked, true); assert.strictEqual(f.getPos(), '개구부 상부');

// scheduleDefectAutoApply 가 자동 체크를 먼저 부른다
assert.ok(/function scheduleDefectAutoApply\(\) \{[\s\S]{0,300}autoDetectOpeningFromDefectContent\(\)/.test(app));

console.log('test-opening-defect-pos OK');