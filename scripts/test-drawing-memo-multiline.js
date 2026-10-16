// 2026-10-16 「주석 ...으로 자르지 말고 다 보여주라 줄바꿈 해서 저장하면 두줄 세줄로 보여주고」
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const memoLib = require(path.join(root, 'js', 'core', 'drawing-memo.js'));

// 화면(PC·모바일 공통 DOM 겹층): 자르지 않고 전체, CSS로 줄바꿈 유지
const sync = app.slice(app.indexOf('function syncDrawingMemoOverlay('), app.indexOf('window.syncDrawingMemoOverlay = syncDrawingMemoOverlay;'));
assert.ok(sync.length > 100);
assert.ok(!/shortLabel/.test(sync), '화면 주석은 자르지 않음');
const chipCss = css.slice(css.indexOf('.map-memo-chip {'), css.indexOf('}', css.indexOf('.map-memo-chip {')));
assert.ok(/white-space:\s*pre;/.test(chipCss), '저장된 줄바꿈 그대로 여러 줄');
assert.ok(/line-height:\s*1\.15;/.test(chipCss));

// 출력물(한글·PDF 위치도 공통 drawMemosForReport): 전체 + 줄마다 아래로
const repSrc = app.slice(app.indexOf('const DRAWING_MEMO_LINE_HEIGHT'), app.indexOf('window.drawMemosForReport = drawMemosForReport;'));
assert.ok(!/shortLabel/.test(repSrc), '출력물도 자르지 않음');
const calls = [];
const drawMemosForReport = new Function('readMemoPrintPref', 'memoApi', 'getDrawingMemoFontSizeImg', 'getDrawingMemoTextColor', 'drawOutlinedPinText', 'DRAWING_MEMO_FONT_FAMILY', 'window',
    repSrc + '\nreturn drawMemosForReport;')(
    () => true, () => memoLib, () => 20, () => '#000', (ctx, t, x, y) => calls.push({ t, x, y }), 'sans', { state: {} });
const st = {};
const long = '천장 점검구 열림 — 다음 방문 때 반드시 다시 확인할 것(누수 흔적 있음)';
memoLib.addMemo(st, 'B_1F', memoLib.createMemo({ text: long + '\n둘째 줄\r\n셋째 줄', x: 100, y: 50, now: 1 }));
const ctx = { save() {}, restore() {} };
// window.state를 쓰도록 다시 묶기
const fn2 = new Function('readMemoPrintPref', 'memoApi', 'getDrawingMemoFontSizeImg', 'getDrawingMemoTextColor', 'drawOutlinedPinText', 'DRAWING_MEMO_FONT_FAMILY', 'window',
    repSrc + '\nreturn drawMemosForReport;')(
    () => true, () => memoLib, () => 20, () => '#000', (c, t, x, y) => calls.push({ t, x, y }), 'sans', { state: st });
assert.strictEqual(fn2(ctx, 'B', '1F', 1000, 1000), 1);
assert.deepStrictEqual(calls.map((c) => c.t), [long, '둘째 줄', '셋째 줄'], '전체 내용, 세 줄');
assert.ok(!calls.some((c) => c.t.includes('…')), '말줄임 없음');
assert.deepStrictEqual(calls.map((c) => c.x), [100, 100, 100]);
assert.deepStrictEqual(calls.map((c) => Math.round(c.y * 100) / 100), [50, 73, 96], '줄 간격 = 글자 크기 × 1.15');
void drawMemosForReport;
// 출력 두 곳 모두 이 함수를 씀
assert.ok((app.match(/drawMemosForReport\(ctx, /g) || []).length >= 2, '한글·PDF 출력 경로 모두');

// 새 주석 입력: 여러 줄 입력칸(Enter = 줄바꿈), 한 줄 appPrompt 안 씀
const create = app.slice(app.indexOf('async function createDrawingMemoAt('), app.indexOf('window.createDrawingMemoAt = createDrawingMemoAt;'));
assert.ok(/promptDrawingMemoText\(\)/.test(create) && !/appPrompt/.test(create), '새 주석 = 여러 줄 입력');
const prompt = app.slice(app.indexOf('function promptDrawingMemoText('), app.indexOf('window.promptDrawingMemoText = promptDrawingMemoText;'));
assert.ok(/<textarea data-mn-text/.test(prompt), 'textarea');
assert.ok(/e\.key === 'Enter' && \(e\.ctrlKey \|\| e\.metaKey\)/.test(prompt), '그냥 Enter는 줄바꿈, Ctrl+Enter 저장');
// 저장 형식 그대로: 줄바꿈 보존
assert.strictEqual(memoLib.cleanText('가\r\n나\n다'), '가\n나\n다');
// 2026-10-16 모바일 디자인: 입력·보기 창 같은 카드(.dm-card/.dm-foot), 키보드 대응(visualViewport), 큰 버튼, 2줄 바
assert.ok(/class="dm-card"/.test(prompt) && /class="dm-foot"/.test(prompt), '새 주석 창 카드');
const view = app.slice(app.indexOf('function openDrawingMemoMenu('), app.indexOf('window.openDrawingMemoMenu = openDrawingMemoMenu;'));
assert.ok(/class="dm-card"/.test(view) && /class="dm-foot"/.test(view), '보기·수정 창과 같은 카드');
assert.ok(/bindMemoDialogToVisualViewport\(ov\)/.test(prompt) && /bindMemoDialogToVisualViewport\(ov\)/.test(view), '두 창 모두 키보드 대응');
assert.ok(/vv\.addEventListener\('resize', fit\)/.test(app) && /unbindVv\(\)/.test(prompt), 'visualViewport 따라가고 닫으면 해제');
assert.ok(/html\.layout-mobile \.drawing-memo-view-overlay \.dm-foot \.btn[\s\S]{0,120}min-height: 48px/.test(css), '터치 큰 버튼');
assert.ok(/html\.layout-mobile \.drawing-memo-bar \.drawing-memo-bar-text-short/.test(css), '모바일 바 짧은 안내');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(/class="drawing-memo-bar-text-short"/.test(idx));
console.log('test-drawing-memo-multiline OK');
