'use strict';
// 2026-10-20 「손글씨 메모 했던거 한글 출력할때 전경사진 뒤에 오게」
// 건물의 손글씨 메모(층마다 여러 장) → 한글 문서 전경사진 바로 뒤(균열게이지 앞)에 「손글씨 메모」 제목 + 한 장씩.
// 1·2종(exportHwpxSurveyTable12)·3종 두 출력 다. 층 순서·만든 순서, 지우개만 있는 장·빈 장은 뺀다. 메모 없으면 아무것도 안 넣음.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const sketch = require('../js/core/sketch-memo.js');
const ctx = { window: { BSA: { sketchMemo: sketch } } };
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function collectBuildingSketchMemos(') + '\nthis.collect = collectBuildingSketchMemos;', ctx);

const S = (id, t, strokes) => ({ id, createdAt: t, w: 100, h: 50, strokes });
const ink = [{ c: '#111827', w: 3, e: 0, p: [1, 1, 50, 9, 9, 50] }];
const st = {
    sketchMemos: {
        B_2F: [S('c', 5, ink)],
        B_1F: [S('b', 9, ink), S('a', 2, ink), S('e', 1, [{ c: '#000', w: 3, e: 1, p: [1, 1, 50] }]), S('f', 3, [])],
        BB_1F: [S('x', 1, ink)]
    }
};
const bldg = { id: 'B', floorsList: [{ floorCode: '1F' }, { floorCode: '2F' }] };
const got = JSON.parse(JSON.stringify(ctx.collect(st, bldg))).map((m) => `${m.floorCode}:${m.rec.id}`);
assert.deepStrictEqual(got, ['1F:a', '1F:b', '2F:c'], '층 순서·만든 순서, 다른 건물·빈 장·지우개만 뺌');
assert.strictEqual(ctx.collect({}, bldg).length, 0);
assert.strictEqual(ctx.collect(st, null).length, 0);

// 두 출력 모두 전경사진 블록 바로 뒤, 균열게이지 앞
const OV_END = "console.error('전경사진 HWPX 삽입 실패(나머지는 유지):', ovErr);";
const parts = app.split(OV_END);
assert.strictEqual(parts.length, 3, '전경사진 블록 2곳');
for (const tail of parts.slice(1)) {
    const sk = tail.indexOf('imgCounter = await appendHwpxSketchMemoSection({');
    const gauge = tail.indexOf('// ---- 균열게이지·균열팁');
    assert.ok(sk > 0 && sk < 400, '전경사진 바로 뒤');
    assert.ok(gauge > sk, '균열게이지 앞');
}
const fn = extractFunction(app, 'async function appendHwpxSketchMemoSection(');
assert.ok(/if \(!memos\.length\) return imgCounter;/.test(fn), '메모 없으면 안 넣음');
assert.ok(/o\.setPicImage\(pic, imgId, png\.w, png\.h, MAX_W, MAX_H\)/.test(fn), '쪽 폭에 맞추고 비율 유지(setPicImage)');
assert.ok(fn.includes('손글씨 메모-${perFloor[floorCode]}'));
console.log('test-hwpx-sketch-memo-after-overview: ok');
