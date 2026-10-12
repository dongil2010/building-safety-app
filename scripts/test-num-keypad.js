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
console.log('test-num-keypad: OK');
