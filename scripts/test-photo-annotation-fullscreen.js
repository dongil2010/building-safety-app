'use strict';
// 2026-11-10 「찍은 사진 눌러보면 그리기 기능 있는데 화면 제일 큰 상태에서 그리기 실행되게 해줘」
// 사진 위에 그리기 창은 화면 가득. 캔버스는 사진 원래 크기(긴 변 2000까지)로 그리고,
// 보이는 크기는 남은 자리에 맞춘다 — 좌표는 「캔버스 크기 ÷ 보이는 크기」로 환산해 어긋나지 않는다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn.js');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-6);

/* ------------------------------------------------------------------ 계산 함수 */
const pure = new Function(
    'const PHOTO_ANNOT_OLD_MAX_W = 860, PHOTO_ANNOT_OLD_MAX_H = 550;\n'
    + extractFunction(app, 'function photoAnnotCanvasSize(') + '\n'
    + extractFunction(app, 'function photoAnnotFitSize(') + '\n'
    + extractFunction(app, 'function photoAnnotStrokeScale(') + '\n'
    + extractFunction(app, 'function photoAnnotPoint(') + '\n'
    + 'return { photoAnnotCanvasSize, photoAnnotFitSize, photoAnnotStrokeScale, photoAnnotPoint };')();

// 캔버스 = 사진 원래 크기. 현장 사진 규격(2000×1500)은 줄이지 않는다(예전엔 733×550으로 줄였다)
assert.deepStrictEqual(pure.photoAnnotCanvasSize(2000, 1500, 2000), { w: 2000, h: 1500 });
assert.deepStrictEqual(pure.photoAnnotCanvasSize(4000, 3000, 2000), { w: 2000, h: 1500 }, '규격보다 크면 긴 변 2000으로');
assert.deepStrictEqual(pure.photoAnnotCanvasSize(1500, 3000, 2000), { w: 1000, h: 2000 }, '세로 사진도 긴 변 기준');
assert.deepStrictEqual(pure.photoAnnotCanvasSize(733, 550, 2000), { w: 733, h: 550 }, '작은 사진은 억지로 키우지 않는다');
assert.deepStrictEqual(pure.photoAnnotCanvasSize(0, 0, 2000), { w: 1, h: 1 });

// 보이는 크기 = 남은 자리에 가장 크게, 비율 유지, 자리 밖으로 안 나감
assert.deepStrictEqual(pure.photoAnnotFitSize(2000, 1500, 360, 500), { w: 360, h: 270 }, '세로 폰: 폭에 맞춤');
assert.deepStrictEqual(pure.photoAnnotFitSize(2000, 1500, 800, 360), { w: 480, h: 360 }, '눕힌 폰: 높이에 맞춤');
assert.deepStrictEqual(pure.photoAnnotFitSize(733, 550, 1900, 950), { w: 1266, h: 950 }, '작은 사진도 화면 가득 키운다');
assert.strictEqual(pure.photoAnnotFitSize(2000, 1500, 0, 500), null, '자리 크기를 모르면 건드리지 않는다');
[[360, 500], [800, 360], [1024, 700], [1900, 950], [333, 777]].forEach(([W, H]) => {
    const f = pure.photoAnnotFitSize(2000, 1500, W, H);
    assert.ok(f.w <= W && f.h <= H, '자리 밖으로 안 나감');
    assert.ok(f.w >= W - 2 || f.h >= H - 2, '한쪽은 꽉 찬다');
    assert.ok(near(f.w / f.h, 4 / 3, 0.01), '비율 유지');
});

// 굵기: 예전(860×550으로 줄인 캔버스)과 사진 대비 같은 굵기
assert.strictEqual(pure.photoAnnotStrokeScale(733, 550), 1);
assert.strictEqual(pure.photoAnnotStrokeScale(400, 300), 1, '작은 사진은 1');
assert.ok(near(pure.photoAnnotStrokeScale(2000, 1500), 1500 / 550));
assert.ok(near(4 * pure.photoAnnotStrokeScale(2000, 1500) / 2000, 4 / (2000 * 550 / 1500), 1e-9), '사진 폭 대비 굵기 = 예전과 같다');
assert.ok(near(pure.photoAnnotStrokeScale(3000, 1000), 3000 / 860), '가로로 긴 사진은 폭 기준');

// 좌표: 화면에 어떤 크기로 보이든 사진의 같은 자리
[[360, 270, 0, 115], [480, 360, 160, 0], [1266, 950, 317, 60]].forEach(([w, h, left, top]) => {
    const rect = { left, top, width: w, height: h };
    const mid = pure.photoAnnotPoint(left + w / 2, top + h / 2, rect, 2000, 1500);
    assert.ok(near(mid.x, 1000) && near(mid.y, 750), '가운데 → 가운데');
    const end = pure.photoAnnotPoint(left + w, top + h, rect, 2000, 1500);
    assert.ok(near(end.x, 2000) && near(end.y, 1500), '오른쪽 아래 끝 → 끝');
    const q = pure.photoAnnotPoint(left + w * 0.25, top + h * 0.8, rect, 2000, 1500);
    assert.ok(near(q.x, 500) && near(q.y, 1200));
});

/* ------------------------------------------------------------------ 창 전체 흐름(가짜 화면) */
function makeCtx(canvas) {
    const calls = [];
    const ctx = { calls, canvas };
    ['save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'rect', 'clip', 'clearRect', 'drawImage', 'strokeText', 'fillText']
        .forEach((name) => { ctx[name] = (...args) => { calls.push([name, ...args.map((a) => (typeof a === 'number' ? a : (a && a.tag) || String(a)))]); }; });
    let lw = 1;
    Object.defineProperty(ctx, 'lineWidth', { get: () => lw, set: (v) => { lw = v; calls.push(['lineWidth', v]); } });
    let gco = 'source-over';
    Object.defineProperty(ctx, 'globalCompositeOperation', { get: () => gco, set: (v) => { gco = v; calls.push(['gco', v]); } });
    return ctx;
}
function makeEl(id) {
    const handlers = {};
    const classes = new Set();
    return {
        id, tag: id, style: {}, dataset: {}, value: '',
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
        addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
        fire: (type, e) => (handlers[type] || []).map((fn) => fn(e)),
        blur() {}
    };
}
function makeCanvas(id) {
    const el = makeEl(id);
    el.width = 300; el.height = 150;
    el.rect = { left: 0, top: 0, width: 300, height: 150 };
    el.getContext = () => (el._ctx = el._ctx || makeCtx(el));
    el.getBoundingClientRect = () => el.rect;
    el.setPointerCapture = () => {};
    el.releasePointerCapture = () => {};
    el.toDataURL = (mime, q) => 'data:' + mime + ';q=' + q + ';size=' + el.width + 'x' + el.height;
    return el;
}

const els = {
    photoAnnotationModal: makeEl('photoAnnotationModal'),
    annotationCanvas: makeCanvas('annotationCanvas'),
    photoAnnotationStage: Object.assign(makeEl('photoAnnotationStage'), { clientWidth: 360, clientHeight: 500 }),
    annotationColorPicker: Object.assign(makeEl('annotationColorPicker'), { value: '#ef4444' }),
    annotationLineWidth: Object.assign(makeEl('annotationLineWidth'), { value: '4' }),
    btnUndoAnnotation: makeEl('btnUndoAnnotation'),
    btnClearAnnotation: makeEl('btnClearAnnotation'),
    btnCancelPhotoAnnotation: makeEl('btnCancelPhotoAnnotation'),
    btnSavePhotoAnnotation: makeEl('btnSavePhotoAnnotation')
};
const toolBtns = ['pen', 'arrow', 'circle', 'text', 'eraser'].map((t) => Object.assign(makeEl('tool-' + t), { dataset: { tool: t } }));
const offscreen = [];
const fakeDocument = {
    activeElement: null,
    getElementById: (id) => els[id] || null,
    querySelectorAll: (sel) => (sel === '.annotation-tool-btn' ? toolBtns : []),
    createElement: (tag) => { assert.strictEqual(tag, 'canvas'); const c = makeCanvas('offscreen'); offscreen.push(c); return c; }
};
const winHandlers = {};
let promptAnswer = '균열 0.3mm';
const fakeWindow = {
    addEventListener: (type, fn) => { (winHandlers[type] = winHandlers[type] || []).push(fn); },
    getPhotoLongEdge: () => 2000,
    getPhotoJpegQuality: () => 0.85,
    appPrompt: async () => promptAnswer,
    confirmDelete: async () => true,
    showToast: () => {}
};
let nextImageSize = { w: 2000, h: 1500 };
class FakeImage {
    constructor() { this.tag = 'photo'; }
    set src(v) { this._src = v; this.naturalWidth = nextImageSize.w; this.naturalHeight = nextImageSize.h; if (this.onload) this.onload(); }
}

const a = app.indexOf('    // --- 3. 현장 사진 2차 주석(드로잉) 모달 엔진 ---');
const b = app.indexOf('    // --- 5. 현장 음성 인식 (Speech-to-Text) 이벤트 핸들러 ---');
assert.ok(a > 0 && b > a, '그리기 엔진 구간');
const engineSrc = app.slice(a, b);
const engine = new Function('window', 'document', 'Image', 'setTimeout',
    engineSrc + '\nreturn { ops: () => annotationOps, base: () => annotationBase, ink: () => annotationInk };')(fakeWindow, fakeDocument, FakeImage, (fn) => fn());

const modal = els.photoAnnotationModal;
const canvas = els.annotationCanvas;
const ptr = (x, y, id, extra) => Object.assign({ clientX: x, clientY: y, pointerId: id || 1, pointerType: 'touch', button: 0, preventDefault() {} }, extra || {});
const baseCalls = () => engine.base().getContext('2d').calls;
const inkCalls = () => engine.ink().getContext('2d').calls;

// 열기: 화면에 뜨고, 캔버스는 사진 원래 크기, 보이는 크기는 남은 자리(360×500)에 맞춤
let saved = [];
fakeWindow.openPhotoAnnotationModal('data:photo', (url) => saved.push(url));
assert.ok(modal.classList.contains('open') && modal.style.display === 'flex');
assert.ok(fakeWindow.isPhotoAnnotationModalOpen());
assert.deepStrictEqual([canvas.width, canvas.height], [2000, 1500], '860×550으로 줄이지 않는다');
assert.deepStrictEqual([canvas.style.width, canvas.style.height], ['360px', '270px']);
assert.deepStrictEqual([engine.base().width, engine.base().height], [2000, 1500]);

// 자유선: 화면 가운데(180,250)에서 오른쪽으로 → 사진 가운데(1000,750)에서 (1500,750)
canvas.rect = { left: 0, top: 115, width: 360, height: 270 };
canvas.fire('pointerdown', ptr(180, 250));
canvas.fire('pointerdown', ptr(10, 120, 2)); // 그리는 중 다른 손가락은 무시
canvas.fire('pointermove', ptr(270, 250));
canvas.fire('pointermove', ptr(10, 120, 2));
canvas.fire('pointerup', ptr(10, 120, 2));
assert.strictEqual(engine.ops().length, 0, '다른 손가락을 떼도 선이 끝나지 않는다');
canvas.fire('pointerup', ptr(270, 250));
assert.strictEqual(engine.ops().length, 1);
let op = engine.ops()[0];
assert.strictEqual(op.tool, 'pen');
assert.deepStrictEqual(op.pts.map((p) => [Math.round(p.x), Math.round(p.y)]), [[1000, 750], [1500, 750]]);
assert.ok(near(op.width, 4 * 1500 / 550), '굵기는 캔버스가 커진 만큼');
assert.ok(inkCalls().some((c) => c[0] === 'lineTo' && near(c[1], 1500) && near(c[2], 750)), '확정된 선은 그림 층에');
assert.deepStrictEqual(baseCalls().slice(-2).map((c) => c[0] + ':' + c[1]), ['drawImage:photo', 'drawImage:offscreen'], '저장용 캔버스 = 사진 + 그림 층');

// 화면을 눕힘 → 다시 맞춤(480×360). 그린 것은 캔버스 좌표라 그대로, 새 좌표도 사진의 같은 자리
els.photoAnnotationStage.clientWidth = 800;
els.photoAnnotationStage.clientHeight = 360;
winHandlers.resize.forEach((fn) => fn());
assert.deepStrictEqual([canvas.style.width, canvas.style.height], ['480px', '360px']);
assert.deepStrictEqual([canvas.width, canvas.height], [2000, 1500], '해상도는 그대로');
canvas.rect = { left: 160, top: 0, width: 480, height: 360 };
toolBtns[1].fire('click', {});
assert.ok(toolBtns[1].classList.contains('active') && !toolBtns[0].classList.contains('active'));
canvas.fire('pointerdown', ptr(160, 0));
canvas.fire('pointermove', ptr(640, 360));
canvas.fire('pointerup', ptr(640, 360));
op = engine.ops()[1];
assert.strictEqual(op.tool, 'arrow');
assert.deepStrictEqual([op.x1, op.y1, Math.round(op.x2), Math.round(op.y2)], [0, 0, 2000, 1500], '모서리 → 모서리');

// 누르기만 한 화살표·동그라미는 넣지 않는다
canvas.fire('pointerdown', ptr(300, 100));
canvas.fire('pointerup', ptr(300, 100));
assert.strictEqual(engine.ops().length, 2);

(async () => {
    // 글자: 손을 뗀 자리에, 크기도 캔버스에 맞춰
    toolBtns[3].fire('click', {});
    canvas.fire('pointerdown', ptr(400, 180));
    await Promise.all(canvas.fire('pointerup', ptr(400, 180)));
    await new Promise((r) => setImmediate(r));
    op = engine.ops()[2];
    assert.strictEqual(op.tool, 'text');
    assert.strictEqual(op.text, '균열 0.3mm');
    assert.deepStrictEqual([Math.round(op.x), Math.round(op.y)], [1000, 750]);
    assert.strictEqual(op.size, Math.round((4 * 3 + 12) * 1500 / 550));

    // 되돌리기: 마지막 것만 빠지고 사진부터 다시 그린다
    els.btnUndoAnnotation.fire('click', {});
    assert.strictEqual(engine.ops().length, 2);
    const lastInkClear = inkCalls().map((c) => c[0]).lastIndexOf('clearRect');
    assert.ok(lastInkClear > 0 && !inkCalls().slice(lastInkClear).some((c) => c[0] === 'fillText'), '되돌린 글자는 다시 안 그린다');
    assert.deepStrictEqual(baseCalls().slice(-2).map((c) => c[0] + ':' + c[1]), ['drawImage:photo', 'drawImage:offscreen'], '사진부터 다시');

    // 지우개: 그림 층만 지우고(destination-out) 사진(저장용 캔버스)은 지우지 않는다. 되돌리기로 살아난다
    toolBtns[4].fire('click', {});
    const baseBefore = baseCalls().length;
    canvas.fire('pointerdown', ptr(400, 180));
    canvas.fire('pointermove', ptr(450, 200));
    canvas.fire('pointerup', ptr(450, 200));
    assert.strictEqual(engine.ops().length, 3);
    op = engine.ops()[2];
    assert.strictEqual(op.tool, 'eraser');
    assert.ok(near(op.width, 4 * 3 * 1500 / 550), '지우개는 펜보다 3배 넓게');
    assert.ok(inkCalls().some((c) => c[0] === 'gco' && c[1] === 'destination-out'), '그림 층을 지운다');
    assert.ok(!baseCalls().some((c) => c[0] === 'gco'), '사진 층은 지우지 않는다');
    assert.deepStrictEqual(baseCalls().slice(baseBefore).filter((c) => c[0] === 'drawImage').map((c) => c[1]), ['photo', 'offscreen'], '사진 + 지운 그림 층');
    assert.ok(canvas.getContext('2d').calls.some((c) => c[0] === 'clip'), '화면은 지운 자리만 다시 그린다');
    els.btnUndoAnnotation.fire('click', {});
    assert.strictEqual(engine.ops().length, 2, '지우개도 되돌리기로 취소');
    const lastClear = inkCalls().map((c) => c[0]).lastIndexOf('clearRect');
    assert.ok(!inkCalls().slice(lastClear).some((c) => c[0] === 'gco' && c[1] === 'destination-out'), '되돌린 지우개는 다시 안 지운다');

    // 저장: 저장용 캔버스(사진 원래 크기)를 현장 사진 품질로, 그리고 창을 닫는다
    els.btnSavePhotoAnnotation.fire('click', {});
    assert.deepStrictEqual(saved, ['data:image/jpeg;q=0.85;size=2000x1500']);
    assert.ok(!modal.classList.contains('open') && modal.style.display === 'none');
    assert.ok(!fakeWindow.isPhotoAnnotationModalOpen());

    // 아무것도 안 그리고 저장 → 사진을 바꾸지 않는다(다시 압축해 화질만 떨어뜨리지 않게)
    saved = [];
    fakeWindow.openPhotoAnnotationModal('data:photo2', (url) => saved.push(url));
    assert.strictEqual(engine.ops().length, 0, '새로 열면 앞 사진의 그림이 남지 않는다');
    canvas.fire('pointerdown', ptr(200, 100));
    canvas.fire('pointermove', ptr(300, 200));
    canvas.fire('pointerup', ptr(300, 200));
    assert.strictEqual(engine.ops().length, 0, '지울 그림이 없으면 지우개 획은 안 남긴다');
    els.btnSavePhotoAnnotation.fire('click', {});
    assert.deepStrictEqual(saved, []);

    // 취소·Esc·뒤로가기: 저장하지 않고 닫는다
    fakeWindow.openPhotoAnnotationModal('data:photo3', (url) => saved.push(url));
    toolBtns[0].fire('click', {});
    canvas.fire('pointerdown', ptr(200, 100));
    canvas.fire('pointermove', ptr(300, 200));
    canvas.fire('pointerup', ptr(300, 200));
    assert.strictEqual(engine.ops().length, 1);
    let stopped = false;
    winHandlers.keydown.forEach((fn) => fn({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } }));
    assert.ok(!fakeWindow.isPhotoAnnotationModalOpen() && stopped, 'Esc는 그리기 창만 닫는다(아래 수정창까지 안 내려감)');
    assert.deepStrictEqual(saved, []);
    fakeWindow.openPhotoAnnotationModal('data:photo4', null);
    fakeWindow.closePhotoAnnotationModal();
    assert.ok(!fakeWindow.isPhotoAnnotationModalOpen());

    // 규격보다 큰 사진은 긴 변 2000으로
    nextImageSize = { w: 4000, h: 3000 };
    fakeWindow.openPhotoAnnotationModal('data:big', null);
    assert.deepStrictEqual([canvas.width, canvas.height], [2000, 1500]);
    fakeWindow.closePhotoAnnotationModal();

    /* -------------------------------------------------------------- 연결·화면 */
    // 화면 가득: 예전의 작은 카드(920px·52vh)는 없고, 겹침 순서는 수정창 위·보기 창 아래
    const block = html.slice(html.indexOf('<!-- MODAL: Photo Annotation Drawing Modal -->'),html.indexOf('<!-- MODAL: Premium Light Mode'));
    assert.ok(block.includes('class="modal-overlay photo-annot-overlay"'));
    assert.ok(!/max-width:\s*920px|max-height:\s*5\dvh/.test(block), '작게 묶던 크기 제한이 없다');
    ['annotationCanvas', 'photoAnnotationStage', 'annotationColorPicker', 'annotationLineWidth', 'btnUndoAnnotation', 'btnClearAnnotation',
        'btnCancelPhotoAnnotation', 'btnSavePhotoAnnotation'].forEach((id) => assert.ok(block.includes('id="' + id + '"'), id));
    assert.strictEqual((block.match(/annotation-tool-btn/g) || []).length, 5, '도구 5개(지우개 포함)');
    const overlayCss = (css.match(/#photoAnnotationModal\.photo-annot-overlay \{[^}]*\}/) || [''])[0];
    assert.ok(/inset: 0;/.test(overlayCss) && /padding: 0;/.test(overlayCss) && /align-items: stretch;/.test(overlayCss), '화면 가득');
    assert.ok(/#photoAnnotationModal\.photo-annot-overlay\.open \{ z-index: 2147481900 !important; \}/.test(css));
    assert.ok(2147481900 < 2147482000, '사진 크게 보기·확인 창보다는 아래');
    assert.ok(/\.photo-annot-stage \{[^}]*flex: 1 1 0;[^}]*touch-action: none;/.test(css), '사진 자리가 남은 화면을 다 쓴다');
    const canvasCss = (css.match(/#annotationCanvas \{[^}]*\}/) || [''])[0];
    assert.ok(/border: 0;/.test(canvasCss) && /padding: 0;/.test(canvasCss) && /touch-action: none;/.test(canvasCss), '테두리·여백이 있으면 좌표가 어긋난다');
    assert.ok(/@media \(orientation: landscape\) and \(max-height: 520px\) \{\s*\.photo-annot-card \{ flex-direction: row; \}/.test(css), '눕힌 폰은 도구를 옆으로');

    // 크게 보기 → 「그리기」 → 이 창. 그리기 창을 만져도 아래 수정창은 안 닫히고, 뒤로가기는 그리기 창만 닫는다
    assert.ok(extractFunction(app, 'window.annotatePendingPhoto = function(').includes('window.openPhotoAnnotationModal('));
    assert.ok(extractFunction(app, 'function shouldKeepDefectModalForTarget(').includes("target.closest('#photoAnnotationModal')"));
    const back = extractFunction(app, 'function tryCloseTopOverlayForBack(');
    assert.ok(back.includes('window.closePhotoAnnotationModal()'));
    assert.ok(back.indexOf('closePhotoAnnotationModal') < back.indexOf('closeDefectModal'), '뒤로가기: 그리기 창이 수정창보다 먼저');
    assert.ok(!/maxW = 860|getImageData|annotationHistory/.test(engineSrc), '작게 줄이기·통째 복사 방식은 없다');

    console.log('test-photo-annotation-fullscreen: ok');
})().catch((e) => { console.error(e); process.exit(1); });
