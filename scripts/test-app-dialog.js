#!/usr/bin/env node
'use strict';
/**
 * 2026-09-29: 기본 confirm/alert/prompt 창 → 앱 창(js/shared/app-dialog.js).
 * - app.js 에 기다리지 않는(await 없는) 확인 호출이 남으면 안 된다: Promise 는 늘 참이라
 *   `if (!confirmDelete(...)) return;` 이 확인 없이 지워 버린다.
 * - 옵션 정리(위험 표시 자동), 뒤로가기 = 취소, 결함 창 바깥 누르기 예외, 로드 순서
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const dlg = require(path.join(ROOT, 'js/shared/app-dialog.js'));

// ---- 기다리지 않는 확인·입력 호출 금지 (주석 줄 제외)
const bad = [];
app.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;
    const re = /(?<![\w.])(window\.)?(confirm|confirmDelete|appConfirm|prompt|appPrompt)\(/g;
    let m;
    while ((m = re.exec(line))) {
        const pre = line.slice(0, m.index);
        const post = line.slice(m.index);
        if (/(await|return)\s*$/.test(pre)) continue;
        if (/^window\.confirm\(msg\)\)/.test(post)) continue; // confirmDelete 안의 대체(앱 창 없을 때)
        if (/^window\.appConfirm\([^)]*\)[\s\S]*\.then\(/.test(post) || /\.then\(\(ok\)/.test(line)) continue;
        bad.push(`${i + 1}: ${t.slice(0, 120)}`);
    }
});
assert.deepStrictEqual(bad, [], '기다리지 않는 확인 호출:\n' + bad.join('\n'));
assert.ok(!/(?<![\w.])window\.confirm\(/.test(app.replace('return Promise.resolve(window.confirm(msg));', '')), '기본 confirm 직접 호출 없음');
assert.ok(!/(?<![\w.])(window\.)?prompt\(/.test(app), '기본 prompt 직접 호출 없음');

// confirmDelete = Promise, 위험 표시
assert.ok(/window\.confirmDelete = function\(message\) \{[\s\S]{0,300}appDialog\.confirm\(msg, \{ title: '삭제 확인', okText: '삭제', danger: true \}\)/.test(app));
// 뒤로가기 = 창 취소
assert.ok(/function handleAppBackPress\(\) \{\s*\/\/[^\n]*\n\s*if \(window\.appDialog && window\.appDialog\.isOpen\(\)\) \{\s*window\.appDialog\.cancel\(\);\s*return true;/.test(app));
// 결함 창: 확인 창 누르기로 닫히지 않음
assert.ok(/if \(target\.closest\('#bsaAppDialog'\)\) return true;/.test(app));
// 통합·통합 해제도 앱 창
assert.ok(/async function mergeSelectedDefects\(\)[\s\S]{0,2500}if \(!await window\.appConfirm\(msg, \{ title: /.test(app));
assert.ok(/async function unmergeSelectedDefects\(\)[\s\S]{0,2500}if \(!await window\.appConfirm\(msg, \{ title: /.test(app));

// ---- 옵션
let o = dlg.normalizeOptions('confirm', '선택한 결함 3건을 삭제할까요?');
assert.strictEqual(o.danger, true); assert.strictEqual(o.title, '주의');
o = dlg.normalizeOptions('confirm', '선택한 2건을 결함 1건으로 통합할까요?');
assert.strictEqual(o.danger, false); assert.strictEqual(o.title, '확인'); assert.strictEqual(o.okText, '확인'); assert.strictEqual(o.cancelText, '취소');
o = dlg.normalizeOptions('confirm', '홈으로 나가시겠습니까?');
assert.strictEqual(o.danger, false);
o = dlg.normalizeOptions('confirm', 'x', { danger: false, okText: '나가기', title: '홈으로' });
assert.deepStrictEqual([o.danger, o.okText, o.title], [false, '나가기', '홈으로']);
o = dlg.normalizeOptions('alert', '오류');
assert.strictEqual(o.title, '알림');
o = dlg.normalizeOptions('prompt', '이름', { defaultValue: 'A' });
assert.deepStrictEqual([o.title, o.defaultValue], ['입력', 'A']);

// ---- 로드 순서·스타일
const iDlg = html.indexOf('js/shared/app-dialog.js?v=');
const iApp = html.indexOf('src="app.js?v=');
assert.ok(iDlg > 0 && iApp > 0 && iDlg < iApp, 'app-dialog.js 가 app.js 보다 먼저');
assert.ok(/\.bsa-dialog-overlay \{[\s\S]*?z-index: 2147483200/.test(css), '키패드(2147483000)·모든 창보다 위');
assert.ok(/\.bsa-dialog-message \{[\s\S]*?white-space: pre-line/.test(css), '줄바꿈 유지');
const src = fs.readFileSync(path.join(ROOT, 'js/shared/app-dialog.js'), 'utf8');
assert.ok(/window\.alert = function \(message\) \{ window\.appDialog\.alert\(message\); \};/.test(src));
assert.ok(/e\.key === 'Escape'[\s\S]*?finish\(current\.o\.kind === 'alert'\)/.test(src), 'Esc = 취소');
assert.ok(/e\.key === 'Enter'/.test(src), 'Enter = 확인');
console.log('test-app-dialog: ok');
