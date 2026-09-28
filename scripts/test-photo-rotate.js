#!/usr/bin/env node
/* 2026-09-28 사진 90° 회전: 캔버스 크기 계산·방향·연타/사진 바뀜 방지·버튼 배치 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\r\n/g, '\n');

const s = app.indexOf('// @@PHOTO_ROTATE_START');
const e = app.indexOf('// @@PHOTO_ROTATE_END');
assert.ok(s > 0 && e > s, 'rotate region present');
const region = app.slice(s, e);

const toasts = [];
let rotateCalls = 0;
const sandbox = {
    console,
    window: { showToast: (m) => toasts.push(m) },
    document: {
        createElement: () => ({
            width: 0,
            height: 0,
            getContext: () => ({
                save() {}, restore() {}, translate() {}, rotate() { rotateCalls++; },
                drawImage() {}, fillRect() {}, set fillStyle(_v) {}
            }),
            toDataURL: (mime) => `data:${mime};base64,ROTATED`
        })
    },
    Image: class {
        constructor() { this.naturalWidth = 400; this.naturalHeight = 300; }
        set src(_v) { setTimeout(() => this.onload && this.onload(), 0); }
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {},
    imageSrcToBytes: async () => ({ bytes: new Uint8Array([1]), mime: 'image/jpeg' }),
    setTimeout
};
vm.createContext(sandbox);
vm.runInContext(region + '\n;this.__t = { computePhotoRotateCanvasSize, normalizePhotoRotateDir, runPhotoRotate, buildPhotoRotateButtonsHtml, photoRotateOutputMime };', sandbox);
const t = sandbox.__t;

(async () => {
    // 가로·세로 교체, 크기 유지
    assert.deepStrictEqual({ ...t.computePhotoRotateCanvasSize(4000, 3000, 4096) }, { canvasW: 3000, canvasH: 4000, drawW: 4000, drawH: 3000 });
    // 캔버스 한계보다 큰 사진만 장축 맞춤
    const big = t.computePhotoRotateCanvasSize(8192, 6144, 4096);
    assert.strictEqual(big.drawW, 4096);
    assert.strictEqual(big.drawH, 3072);
    assert.strictEqual(big.canvasW, 3072);
    assert.strictEqual(t.normalizePhotoRotateDir(-1), -1);
    assert.strictEqual(t.normalizePhotoRotateDir('1'), 1);
    assert.strictEqual(t.normalizePhotoRotateDir(undefined), 1);
    assert.strictEqual(t.photoRotateOutputMime('data:image/png;base64,AA'), 'image/png');
    assert.strictEqual(t.photoRotateOutputMime('https://x/y.jpg'), 'image/jpeg');

    // 정상 회전 → apply 호출
    let applied = null;
    const ok = await t.runPhotoRotate({ dir: 1, getSrc: () => 'data:image/jpeg;base64,AA', apply: (n) => { applied = n; } });
    assert.strictEqual(ok, true);
    assert.ok(/ROTATED/.test(applied));
    assert.ok(rotateCalls >= 1);

    // 도는 중에 사진이 바뀌면 교체하지 않음
    let cur = 'data:image/jpeg;base64,A1';
    let applied2 = false;
    const p = t.runPhotoRotate({ dir: -1, getSrc: () => cur, apply: () => { applied2 = true; } });
    // 연타: 두 번째 호출은 바로 거절
    const second = await t.runPhotoRotate({ dir: 1, getSrc: () => 'data:image/jpeg;base64,B', apply: () => {} });
    assert.strictEqual(second, false, 'busy lock');
    cur = 'data:image/jpeg;base64,CHANGED';
    assert.strictEqual(await p, false);
    assert.strictEqual(applied2, false, 'src changed → no apply');

    // 버튼 HTML
    const btns = t.buildPhotoRotateButtonsHtml('data-a="1"', 'data-b="1"', 'photo-rotate-group-sm');
    assert.ok(btns.includes('photo-rotate-group photo-rotate-group-sm'));
    assert.ok(btns.includes('fa-rotate-left') && btns.includes('fa-rotate-right'));

    // 결함 사진 회전은 그림 넣기와 같은 저장 경로
    const rp = region.slice(region.indexOf('window.rotatePendingPhoto'));
    ['_defectPhotosDirty', 'renderDefectPhotoSection', 'persistOpenDefectPhotosNow', 'scheduleDefectAutoApply'].forEach((k) => {
        assert.ok(rp.includes(k), 'rotatePendingPhoto uses ' + k);
    });
    // 전경사진: 새 id로 교체 후 옛 저장본 삭제
    assert.ok(/rotateOverviewPhoto[\s\S]*deleteOverviewPhotoStorage/.test(region));
    assert.ok(app.includes('data-action="rotate-overview"') || app.includes("data-action=\"rotate-overview\""), 'overview rotate buttons');

    // 균열 게이지/팁 전차·현차 4칸 모두 회전 버튼
    ['gauge:prev', 'gauge:curr', 'tip:prev', 'tip:curr'].forEach((k) => {
        assert.ok(html.includes(`data-cm-photo-rotate="${k}:-1"`) && html.includes(`data-cm-photo-rotate="${k}:1"`), 'crack rotate ' + k);
    });
    assert.ok(app.includes('data-cm-photo-rotate'), 'crack rotate click handler');
    assert.ok(/\.photo-rotate-btn/.test(css) && /object-fit:\s*contain/.test(css), 'rotate css');
    console.log('test-photo-rotate: OK');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
