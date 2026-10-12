/* 부동침하 측기 이동 보정 회귀(2026-10-12)
 * 1) 구역 편집 목록에 적어 둔(저장 전) 레벨이 보정 계산에 들어가고 지워지지 않는다
 * 2) 터치: 칸에서 손을 떼고 「적용」을 누르는 동안 키보드 들어올림이 풀려 버튼이 튀지 않는다
 * 3) 이동 보정 칸·「적용」이 밝은 창에서 보이고 넘치지 않게 스타일이 있다
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function extract(name) {
    const start = app.indexOf(`    function ${name}(`);
    assert.ok(start >= 0, name);
    let i = app.indexOf('{', start), depth = 0;
    for (; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') { depth--; if (depth === 0) break; }
    }
    return app.slice(start, i + 1);
}

const src = [extract('isNdtDispLevelFilled'), extract('computeNdtDispStationDelta'),
    extract('applyNdtDispStationTransfer'), extract('syncNdtDispEditListInputsToGroup')].join('\n');

function run(inputs) {
    const group = { id: 'g', points: [1, 2, 3, 4].map((n) => ({ id: 'p' + n, level: null })) };
    const els = inputs.map((v, i) => ({ value: v, dataset: { pointId: 'p' + (i + 1) } }));
    const document = { querySelectorAll: () => els };
    const window = { BSA: { ndtGrade: { isLevelFilled: (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) } } };
    const f = new Function('document', 'window', src + '; return { applyNdtDispStationTransfer, syncNdtDispEditListInputsToGroup };')(document, window);
    return { group, f };
}

// 목록에 10,12,20,23을 적고 (03)에서 Va=14, Vb=20 → Δ=6, (03)=14, (04)=17, 앞 지점 그대로
{
    const { group, f } = run(['10', '12', '20', '23']);
    assert.strictEqual(f.syncNdtDispEditListInputsToGroup(group), 4);
    group.points[2].level = 20; // 행 「적용」이 Vb를 그 지점에 넣는 것과 같다
    const r = f.applyNdtDispStationTransfer(group, 2, '14', '20');
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(group.points.map((p) => p.level), [10, 12, 14, 17]);
    assert.strictEqual(r.adjustedCount, 2);
}
// 형식이 틀린 칸은 건드리지 않고, 빈 칸은 비운다
{
    const { group, f } = run(['10', 'abc', '', '5']);
    group.points[1].level = 7;
    group.points[2].level = 9;
    f.syncNdtDispEditListInputsToGroup(group);
    assert.deepStrictEqual(group.points.map((p) => p.level), [10, 7, null, 5]);
}
// 행 「적용」이 보정 전에 목록 값을 옮긴다
const rowSrc = extract('toggleNdtDispEditRowTransferForm');
assert.ok(rowSrc.indexOf('syncNdtDispEditListInputsToGroup(group)') > 0
    && rowSrc.indexOf('syncNdtDispEditListInputsToGroup(group)') < rowSrc.indexOf('runNdtDispStationTransferApply('),
'적용 전에 목록 값 반영');
assert.ok(/ndt-disp-xfer-apply/.test(rowSrc) && /revealNdtDispTransferApply/.test(rowSrc), '적용 버튼 줄바꿈·보이게');

// 2) 터치 키보드: 손가락이 닿아 있으면 들어올림을 풀지 않고, 뗀 뒤 정리
const kb = fs.readFileSync(path.join(root, 'js/core/mobile-keyboard.js'), 'utf8');
assert.ok(/if \(state\.pointerDown\) \{ state\.clearAfterTap = true; return; \}/.test(kb), '누르는 중엔 미룸');
assert.ok(/addEventListener\('pointerdown', onPointerDownCapture, true\)/.test(kb));
assert.ok(/addEventListener\('pointerup', onPointerUpCapture, true\)/.test(kb));
{
    // 실제 함수로 순서 확인: focusout → (손가락 닿음) 140ms 뒤에도 안 풀림 → 손 떼고 350ms 뒤 풀림
    const timers = [];
    let cleared = 0;
    const body = kb.slice(kb.indexOf('    function clearIfNoField'), kb.indexOf('    function bindBodyScrollDrag'));
    const fn = new Function('state', 'setTimeout', 'clearTimeout', 'document', 'isTextField', 'clearLift', 'CLEAR_AFTER_TAP_MS',
        body + '; return { onFocusOut, onPointerDownCapture, onPointerUpCapture };');
    const st = { blurTimer: null, pointerDown: false, clearAfterTap: false, activeField: {} };
    const api = fn(st, (cb, ms) => { timers.push({ cb, ms }); return timers.length; }, () => {}, { activeElement: null },
        () => false, () => { cleared++; }, 350);
    api.onPointerDownCapture({ pointerType: 'touch' });
    api.onFocusOut();
    timers.shift().cb();
    assert.strictEqual(cleared, 0, '손가락이 닿아 있으면 화면을 안 움직임');
    api.onPointerUpCapture({ pointerType: 'touch' });
    const t = timers.shift();
    assert.strictEqual(t.ms, 350);
    t.cb();
    assert.strictEqual(cleared, 1, '뗀 뒤(클릭 뒤) 정리');
}

// 3) 스타일
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert.ok(/\.ndt-disp-xfer-box \{[^}]*background: #fffbeb/.test(css), '밝은 바탕');
assert.ok(/grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/.test(css), '칸이 창 밖으로 안 넘침');
assert.ok(/\.ndt-disp-xfer-apply \{[^}]*width: 100%/.test(css), '적용 버튼 한 줄 전체');
assert.ok(!/rgba\(15,23,42,0\.55\)/.test(rowSrc), '어두운 옛 스타일 제거');

console.log('test-ndt-disp-transfer-ui: OK');
