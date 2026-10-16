'use strict';
// 2026-10-16 사진 여러 장 갤러리 바로 저장(BsaGallery) — 차례 저장·파일명·실패해도 계속·옛 앱 안내
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function block(start) {
    const i = src.indexOf(start); assert.ok(i >= 0, start);
    let j = src.indexOf('{', i + start.length - 1), d = 0;
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
}
(async () => {
    const calls = [];
    const toasts = [];
    const window = {
        Capacitor: { isNativePlatform: () => true, Plugins: { BsaGallery: { saveImage: async (o) => { calls.push(o.fileName); if (o.fileName.includes('BAD')) throw new Error('x'); } } } },
        showToast: (m) => toasts.push(m)
    };
    window.bsaSaveImageToDevice = async (s, name) => {
        try { await window.Capacitor.Plugins.BsaGallery.saveImage({ data: s, fileName: name }); return true; } catch (_e) { return false; }
    };
    const f = new Function('window', block('window.bsaSavePhotosToDevice = async function(items) {') + '; return window.bsaSavePhotosToDevice;')(window);
    let r = await f([{ src: 'data:a', name: '본관_1F_C1_균열_NO.01_현차_1_20261016_120000.jpg' }, { src: 'data:b', name: 'BAD.jpg' }, { src: 'data:c', name: 'c.jpg' }, null]);
    assert.deepStrictEqual(r, { ok: 2, fail: 1 });
    assert.deepStrictEqual(calls, ['본관_1F_C1_균열_NO.01_현차_1_20261016_120000.jpg', 'BAD.jpg', 'c.jpg']);
    assert.ok(/2장 갤러리\(스마트안전점검\)에 저장, 1장 실패/.test(toasts.pop()));
    // 옛 앱(플러그인 없음): 저장 시도 안 하고 안내
    delete window.Capacitor.Plugins.BsaGallery; calls.length = 0;
    r = await f([{ src: 'data:a', name: 'a.jpg' }]);
    assert.deepStrictEqual(r, { ok: 0, fail: 1 }); assert.strictEqual(calls.length, 0);
    assert.ok(/1\.3\.12/.test(toasts.pop()));
    // 사진 없음
    r = await f([]); assert.deepStrictEqual(r, { ok: 0, fail: 0 });
    // 촬영 사진만 갤러리 저장(추가는 안 함)
    assert.ok(/saveToGallery: wantCamera/.test(src));
    console.log('test-photo-save-batch: ok');
})().catch((e) => { console.error(e); process.exit(1); });
