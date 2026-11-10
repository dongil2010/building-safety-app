/* 숫자만 적는 칸 → 앱 숫자 키패드(2026-10-12)
 * 부동침하 레벨·이동 보정 Va/Vb·측정 길이와 비파괴(NDT) 창 숫자 칸. 키: 0-9 . ± ⌫ C 다음 완료
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const kp = require(path.join(root, 'js', 'shared', 'measure-keypad.js'));

assert.deepStrictEqual(kp.LAYOUT_NUM, [
    ['7', '8', '9', 'BS'], ['4', '5', '6', '-'], ['1', '2', '3', 'NEXT'], ['C', '0', '.', 'OK']
]);
assert.deepStrictEqual(kp.toggleSign('12.5'), { value: '-12.5', caret: 5 });
assert.deepStrictEqual(kp.toggleSign('-3'), { value: '3', caret: 1 });
assert.deepStrictEqual(kp.toggleSign(''), { value: '-', caret: 1 });
assert.ok(kp.numAccepts('12', '.') && !kp.numAccepts('1.2', '.'), '점은 하나만');
assert.ok(kp.numAccepts('', '7') && !kp.numAccepts('', '~') && !kp.numAccepts('', ' '));

// 대상 칸: 네 개 비파괴 창 + data-num-keypad
['#ndtModal', '#ndtCrackMonitorModal', '#ndtDisplacementModal', '#ndtDisplacementGroupEditModal'].forEach((d) => {
    assert.ok(kp.NUM_SELECTOR.includes(d + ' input[type="number"]'), d);
    assert.ok(kp.NUM_SELECTOR.includes(d + ' input[inputmode="decimal"]'), d);
});
assert.ok(kp.NUM_SELECTOR.includes('input[data-num-keypad]'));

// 레벨·Va/Vb·길이 칸이 실제로 그 창 안에 있다
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const inModal = (modalId, inputId) => {
    const a = html.indexOf(`id="${modalId}"`);
    const i = html.indexOf(`id="${inputId}"`);
    return a > 0 && i > a;
};
assert.ok(inModal('ndtDisplacementModal', 'ndtDispLevel'));
assert.ok(inModal('ndtDisplacementGroupEditModal', 'ndtDispEditMeasureLength'));
assert.ok(inModal('ndtDisplacementGroupEditModal', 'ndtDispEditPointList'));
assert.ok(/<input type="number" class="form-control \$\{cls\}-va"/.test(app), 'Va 숫자 칸');
assert.ok(/<input type="number" class="form-control ndt-disp-edit-level-input"/.test(app), '목록 레벨 숫자 칸');

// 브라우저 쪽: type=number는 키패드 동안 text(쓰다 만 '-'·'1.' 보존), PC에서는 되돌림, 다음 칸 이동
const src = fs.readFileSync(path.join(root, 'js', 'shared', 'measure-keypad.js'), 'utf8');
assert.ok(/data-mkp-orig-type', 'number'\);\s*el\.setAttribute\('type', 'text'\)/.test(src));
assert.ok(/el\.setAttribute\('type', 'number'\)/.test(src), 'unprep 복원');
assert.ok(/function focusNextNum/.test(src) && /k === 'NEXT'/.test(src));
assert.ok(/prepAll[\s\S]*NUM_SELECTOR/.test(src), '새로 그린 칸도 준비');

// 2026-11-10 「게이지, 균열팁 수치 입력할 때 팝업키보드」: type=text + inputmode=decimal 칸은 준비 때 inputmode가
// none으로 바뀌어 대상에서 빠졌다(키패드도 OS 키보드도 안 뜸) → 원래 inputmode(data-mkp-orig-inputmode)로도 대상
['#ndtModal', '#ndtCrackMonitorModal', '#ndtDisplacementModal', '#ndtDisplacementGroupEditModal'].forEach((d) => {
    assert.ok(kp.NUM_SELECTOR.includes(d + ' input[data-mkp-orig-inputmode="decimal"]'), d);
    assert.ok(kp.NUM_SELECTOR.includes(d + ' input[data-mkp-orig-inputmode="numeric"]'), d);
});
assert.ok(/el\.dataset\.mkpOrigInputmode = [^;]+;\s*el\.setAttribute\('inputmode', 'none'\)/.test(src), '원래 inputmode를 먼저 적어 둔다');
(function fakeDom() {
    // 준비 전·후 모두 숫자 칸으로 본다
    const mk = (attrs) => ({
        nodeType: 1, tagName: 'INPUT', disabled: false, readOnly: false,
        getAttribute: (k) => (k in attrs ? attrs[k] : null),
        matches(sel) {
            return sel.split(', ').some((one) => {
                const m = one.match(/^(#\w+) input\[([\w-]+)="([^"]+)"\]$/);
                if (m) return m[1] === '#ndtCrackMonitorModal' && attrs[m[2]] === m[3];
                const m2 = one.match(/^(?:input)?\[([\w-]+)\]$/);
                return !!(m2 && m2[1] in attrs);
            });
        }
    });
    assert.ok(kp.isNumTarget(mk({ type: 'text', inputmode: 'decimal', 'data-gauge-x': '' })), '준비 전');
    assert.ok(kp.isNumTarget(mk({ type: 'text', inputmode: 'none', 'data-mkp-orig-inputmode': 'decimal', 'data-tip-length': '' })), '준비 후에도');
    assert.ok(!kp.isNumTarget(mk({ type: 'text', 'data-gauge-note': '' })), '비고 칸은 일반 키보드');
})();
['crackGaugeInitialX', 'crackGaugeInitialY', 'crackTipInitialLength'].forEach((id) => {
    assert.ok(inModal('ndtCrackMonitorModal', id), id);
    assert.ok(new RegExp('id="' + id + '"[^>]*inputmode="decimal"').test(html), id + ' 숫자 칸');
});
['data-gauge-x', 'data-gauge-y', 'data-tip-length', 'data-tip-inc'].forEach((attr) => {
    assert.ok(app.includes('<input type="text" ' + attr + ' inputmode="decimal"'), attr + ' 숫자 칸');
});

// 2026-11-10 「그놈들은 방향키도」: 균열 게이지·균열팁 창 숫자 칸은 키패드 맨 위에 ◀▲▼▶ 한 줄
assert.deepStrictEqual(kp.LAYOUT_NUM_ARROWS[0], ['LEFT', 'UP', 'DOWN', 'RIGHT']);
assert.deepStrictEqual(kp.LAYOUT_NUM_ARROWS.slice(1), kp.LAYOUT_NUM, '숫자 키 자리는 그대로');
assert.ok(kp.ARROW_SELECTOR.includes('#ndtCrackMonitorModal input') && kp.ARROW_SELECTOR.includes('input[data-num-keypad-arrows]'));
assert.ok(!/#ndtModal|#ndtDisplacement/.test(kp.ARROW_SELECTOR), '다른 비파괴 창은 예전 16키 그대로');
(function arrowPick() {
    const box = (col, rowY) => ({ left: col * 80, right: col * 80 + 70, top: rowY, bottom: rowY + 30 });
    // 0,1 = 초기 X/Y(위쪽 줄), 2..7 = 표 3줄 × (X, Y)
    const cells = [box(1, 0), box(2, 0), box(1, 50), box(2, 50), box(1, 90), box(2, 90), box(1, 130), box(2, 130)];
    const go = (from, dir) => {
        const others = cells.map((c, i) => (i === from ? null : c));
        return kp.pickArrowTarget(cells[from], others, dir);
    };
    assert.strictEqual(go(2, 'RIGHT'), 3, '같은 줄 오른쪽');
    assert.strictEqual(go(3, 'LEFT'), 2, '같은 줄 왼쪽');
    assert.strictEqual(go(3, 'RIGHT'), -1, '줄 끝에서는 그대로');
    assert.strictEqual(go(2, 'LEFT'), -1);
    assert.strictEqual(go(2, 'DOWN'), 4, '아랫줄 같은 열');
    assert.strictEqual(go(5, 'DOWN'), 7);
    assert.strictEqual(go(7, 'DOWN'), -1, '마지막 줄');
    assert.strictEqual(go(5, 'UP'), 3, '바로 윗줄(더 먼 줄 아님)');
    assert.strictEqual(go(2, 'UP'), 0, '표 첫 줄에서 위 = 초기값 칸');
    assert.strictEqual(go(0, 'UP'), -1);
    assert.strictEqual(kp.pickArrowTarget(null, cells, 'UP'), -1);
    assert.strictEqual(kp.pickArrowTarget(cells[0], [], 'DOWN'), -1);
})();
assert.ok(/ARROW_KEYS\.indexOf\(k\) >= 0\) \{ focusArrowNum\(el, k\); return; \}/.test(src), '방향키 → 칸 이동');
// 키패드 키로 칸을 옮기면 키패드가 따라 움직여 그 누르기의 click이 밖에 떨어진다 → 버린다(닫힘·엉뚱한 버튼 방지)
assert.ok(/state\.downInPad = !!\(state\.pad && t && state\.pad\.contains\(t\)\)/.test(src));
assert.ok(/if \(fromPad && !\(state\.pad && state\.pad\.contains\(t\)\)\) \{\s*if \(e\.cancelable\) e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*return;/.test(src));
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(/\.bsa-mkp-key\.bsa-mkp-arrow \{ height: 34px;/.test(css), '방향키 줄은 숫자 키보다 낮게');
console.log('test-num-keypad: OK');
