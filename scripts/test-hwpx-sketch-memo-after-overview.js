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

// 2026-10-20 층 구분 없이 건물 전체 · 계정(작성자)별 — 자세한 규칙은 test-sketch-memo-building-account.js
const S = (id, t, strokes, by, byUid) => Object.assign({ id, createdAt: t, w: 100, h: 50, strokes }, by ? { by } : {}, byUid ? { byUid } : {});
const ink = [{ c: '#111827', w: 3, e: 0, p: [1, 1, 50, 9, 9, 50] }];
const st = {
    sketchMemos: {
        B_2F: [S('c', 5, ink, '김', 'u1')],
        B_1F: [S('b', 9, ink, '이', 'u2'), S('a', 2, ink, '김', 'u1'), S('e', 1, [{ c: '#000', w: 3, e: 1, p: [1, 1, 50] }], '김', 'u1'), S('f', 3, [], '김', 'u1'), S('o', 4, ink)],
        BB_1F: [S('x', 1, ink, '김', 'u1')]
    }
};
sketch.migrateFloorMemosToRound(st, 'B');
sketch.migrateFloorMemosToRound(st, 'BB');
const bldg = { id: 'B' };
const got = JSON.parse(JSON.stringify(ctx.collect(st, bldg))).map((m) => `${m.label}:${m.rec.id}`);
assert.deepStrictEqual(got, ['김 메모-1:a', '김 메모-2:c', '이 메모-1:b', '이전 메모-1:o'], '층 없이 작성자별, 이전 메모는 맨 뒤, 다른 건물·빈 장·지우개만 뺌');
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
assert.ok(fn.includes('const { rec, label } = memos[i];') && fn.includes('const caption = `${label}${rec.title ? ` (${rec.title})` : \'\'}`;'), '층 이름 없이 작성자 이름표');
console.log('test-hwpx-sketch-memo-after-overview: ok');
