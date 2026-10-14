/* 도면 메모: 저장·동기화(합치기)·지우기(묘비)·출력 설정 기본값 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const memo = require('../js/core/drawing-memo.js');
const syncMerge = require('../js/core/sync-merge.js');

const KEY = 'bldgA_r2_3F';
const OTHER = 'bldgA_r1_3F';
const clone = (o) => JSON.parse(JSON.stringify(o));
const merge = syncMerge.mergeNdtDataMaps;

// 1) 만들기·글 다듬기
assert.strictEqual(memo.createMemo({ text: '   ' }), null, '빈 글은 메모가 아니다');
const long = memo.createMemo({ text: 'x'.repeat(500), x: 10.6, y: 20.2, now: 1000 });
assert.strictEqual(long.text.length, memo.MAX_TEXT);
assert.strictEqual(long.x, 11);
assert.strictEqual(long.updatedAt, 1000);

// 2) 기기 A에서 저장 → 층 묶음 → 기기 B에 합치기
const A = {};
const m1 = memo.addMemo(A, KEY, memo.createMemo({ id: 'm1', text: '점검구 열림', x: 100, y: 200, now: 1000 }));
memo.addMemo(A, OTHER, memo.createMemo({ id: 'm9', text: '전차 메모', x: 1, y: 1, now: 900 }));
assert.ok(m1);
const packA = memo.packFor(A, KEY);
assert.ok(memo.packHasContent(packA));
assert.deepStrictEqual(packA.items.map((m) => m.id), ['m1'], '층 묶음엔 그 층(회차) 메모만');
const B = {};
memo.mergePackIntoState(B, KEY, clone(packA), merge);
assert.deepStrictEqual(memo.listFor(B, KEY).map((m) => m.text), ['점검구 열림']);
assert.deepStrictEqual(memo.listFor(B, OTHER), [], '다른 회차 메모는 안 따라온다');

// 3) B가 나중에 고침 → A에 합치면 B 것이 이긴다. B에만 있는 새 메모도 온다
memo.updateMemo(B, KEY, 'm1', { text: '점검구 닫음', x: 120 }, 2000);
memo.addMemo(B, KEY, memo.createMemo({ id: 'm2', text: '누수 흔적 확인', x: 5, y: 6, now: 2100 }));
memo.mergePackIntoState(A, KEY, clone(memo.packFor(B, KEY)), merge);
const a1 = memo.listFor(A, KEY).find((m) => m.id === 'm1');
assert.strictEqual(a1.text, '점검구 닫음');
assert.strictEqual(a1.x, 120);
assert.ok(memo.listFor(A, KEY).some((m) => m.id === 'm2'));
assert.strictEqual(memo.listFor(A, OTHER).length, 1, '합치기가 다른 층 메모를 지우지 않는다');

// 4) 옛 서버 묶음(내 기기에만 있는 새 메모) — 서버에 없다고 지워지지 않는다
memo.addMemo(A, KEY, memo.createMemo({ id: 'm3', text: '기기에서만', x: 0, y: 0, now: 2200 }));
memo.mergePackIntoState(A, KEY, clone(memo.packFor(B, KEY)), merge);
assert.ok(memo.listFor(A, KEY).some((m) => m.id === 'm3'), '아직 안 올린 메모는 남는다');
assert.strictEqual(memo.mergePackIntoState(A, KEY, null, merge), false, 'memos 없는 옛 층 묶음은 건드리지 않는다');

// 5) 지우기 → 묘비가 다른 기기에 퍼진다
assert.ok(memo.deleteMemo(A, KEY, 'm2'));
assert.ok(!memo.listFor(A, KEY).some((m) => m.id === 'm2'));
assert.ok(A.deletedMemoIds[KEY].includes('m2'));
assert.strictEqual(A.deletedMemoAt[KEY].m2, 2100);
memo.mergePackIntoState(B, KEY, clone(memo.packFor(A, KEY)), merge);
assert.ok(!memo.listFor(B, KEY).some((m) => m.id === 'm2'), 'B에서도 지워진다');
// B가 다시 A 묶음을 받으면 되살아나지 않는다(B가 예전 사본을 들고 있어도)
const stale = clone(memo.packFor(B, KEY));
stale.items.push({ id: 'm2', text: '누수 흔적 확인', x: 5, y: 6, createdAt: 2100, updatedAt: 2100 });
memo.mergePackIntoState(A, KEY, stale, merge);
assert.ok(!memo.listFor(A, KEY).some((m) => m.id === 'm2'), '예전 사본으로 되살아나지 않는다');

// 6) 지운 뒤 다른 기기가 더 나중에 고친 메모는 살아남는다
const C = clone(B);
memo.addMemo(C, KEY, { id: 'm4', text: '처음', x: 1, y: 1, createdAt: 3000, updatedAt: 3000 });
memo.mergePackIntoState(A, KEY, clone(memo.packFor(C, KEY)), merge);
memo.deleteMemo(A, KEY, 'm4');                  // A가 3000 판을 보고 지움
memo.updateMemo(C, KEY, 'm4', { text: '나중에 고침' }, 5000); // C는 그 뒤에 고침
memo.mergePackIntoState(C, KEY, clone(memo.packFor(A, KEY)), merge);
assert.ok(memo.listFor(C, KEY).some((m) => m.id === 'm4' && m.text === '나중에 고침'), '나중 수정이 이긴다');

// 7) 끌어 옮기기 — 같은 자리면 바뀐 것 없음
const cur = () => memo.listFor(A, KEY).find((m) => m.id === 'm1');
assert.strictEqual(memo.updateMemo(A, KEY, 'm1', { x: cur().x, y: cur().y }), null);
const before = cur().updatedAt;
memo.updateMemo(A, KEY, 'm1', { x: 300, y: 400 }, before); // 시계가 같아도 updatedAt은 오른다
assert.ok(cur().updatedAt > before && cur().x === 300);

// 8) 화면 맞히기·짧은 이름
assert.strictEqual(memo.hitTest([{ id: 'a', sx: 10, sy: 10 }, { id: 'b', sx: 40, sy: 40 }], 38, 37, 18).id, 'b');
assert.strictEqual(memo.hitTest([{ id: 'a', sx: 10, sy: 10 }], 100, 100, 18), null);
assert.strictEqual(memo.shortLabel('가나다라마바사', 5), '가나다라…');

// 9) app.js 연결 확인 — 결함과 따로, 층 묶음에 실림, 출력은 「메모 출력」 켰을 때만(기본 끔)
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.ok(/memos: \(window\.BSA && window\.BSA\.drawingMemo\) \? window\.BSA\.drawingMemo\.packFor\(window\.state, floorKey\)/.test(app), '층 묶음 쓰기에 메모');
assert.ok(app.includes('window.BSA.drawingMemo.mergePackIntoState(window.state, floorKey, bundle.memos'), '층 묶음 받기에 메모 합치기');
assert.ok(app.includes("drawingMemos: window.state.drawingMemos || {}"), '기기 저장');
assert.ok(app.includes("return localStorage.getItem(MEMO_PRINT_PREF_KEY) === '1'"), '출력 기본 끔');
assert.ok(app.includes("return localStorage.getItem(MEMO_SHOW_PREF_KEY) !== '0'"), '화면 표시 기본 켬');
assert.strictEqual((app.match(/ drawMemosForReport\(ctx, [a-zA-Z]+, floorCode, imgW, imgH\);/g) || []).length, 2, '한글·PDF 위치도 두 곳(전체·범위)에서 그린다');
assert.ok(!/defects\.push\([^)]*memo/i.test(app), '메모는 결함 목록에 안 들어간다');
assert.ok(html.includes('data-memo-print') && html.includes('data-memo-show'), '메모 표시·메모 출력 설정');
assert.ok(html.includes('id="btnModeMemo"') && html.includes('id="mobileBtnModeMemo"'), 'PC·모바일 메모 도구');
assert.ok(html.includes('js/core/drawing-memo.js'), '모듈 불러오기');

// 10) 출력 그리기: 끔이면 아무것도 안 그림, 켬이면 메모 수만큼
const fnSrc = app.slice(app.indexOf('    function drawMemosForReport('), app.indexOf('    window.drawMemosForReport'));
const calls = [];
const drawn = [];
const fakeCtx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? (...a) => { calls.push(k); return k === 'measureText' ? { width: 50 } : undefined; } : undefined)), set: (t, k, v) => { t[k] = v; return true; } });
const runDraw = (printOn) => {
    const st = { drawingMemos: { b1_2F: [{ id: 'x', x: 1, y: 2, text: '메모' }] } };
    const f = new Function('readMemoPrintPref', 'memoApi', 'window', 'getDrawingMemoFontSizeImg', 'getDrawingMemoTextColor', 'drawOutlinedPinText', 'DRAWING_MEMO_FONT_FAMILY',
        fnSrc + '; return drawMemosForReport;')(
        () => printOn, () => memo, { state: st }, () => 11, () => '#123456',
        (ctx, text, x, y, color, font) => { drawn.push({ text, x, y, color, font }); ctx.fillText(text, x, y); }, 'sans-serif');
    calls.length = 0;
    return f(fakeCtx, 'b1', '2F', 4000, 3000);
};
assert.strictEqual(runDraw(false), 0);
assert.ok(!calls.includes('fillText'), '「메모 출력」 끔이면 한글·PDF에 메모 없음');
assert.strictEqual(runDraw(true), 1);
assert.ok(calls.includes('fillText'), '켜면 메모 글을 그린다');
assert.strictEqual(drawn[drawn.length - 1].color, '#123456', '출력 글자색 = 스타일 설정 「도면 메모 글자」');
assert.ok(/^bold 11px /.test(drawn[drawn.length - 1].font), '출력 글자 = 마킹 번호 글자 크기·굵기');
assert.ok(!calls.includes('fillRect'), '출력에 노란 배경 박스 없음');

// 11) 2026-10-14 메모 글자: 마킹 네모박스 글자 크기·글꼴 따라감, 색은 스타일 설정
assert.ok(app.includes("drawingMemo: '#000000'"), '메모 글자색 기본값');
assert.ok(app.includes("['styleColorDrawingMemo', 'drawingMemo']"), '스타일 설정 색 필드');
assert.ok(html.includes('id="styleColorDrawingMemo"'), '스타일 설정 창에 메모 글자색');
assert.ok(/return getPinBoxFontSize\(\(sz && sz\.pin\) \|\| 1\);/.test(app), '메모 글자 = 번호 박스 글자 크기');
assert.ok(app.includes('getDrawingMemoFontSizeImg() * viewScale'), '화면 메모 글자가 도면 배율을 따라감');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const chipCss = css.slice(css.indexOf('.map-memo-chip {'), css.indexOf('}', css.indexOf('.map-memo-chip {')));
assert.ok(chipCss.includes('background: transparent') && !/font-size:\s*[\d.]+rem/.test(chipCss), '메모 칩: 배경 없음, rem 고정 크기 없음');
assert.ok(!/layout-(mobile|tablet) \.map-memo-chip/.test(css), '모바일 rem 크기 덮어쓰기 없음');

console.log('test-drawing-memo: OK');
