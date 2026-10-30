#!/usr/bin/env node
'use strict';
/** 2026-10-30 3종 여러 동 한글: 사진첩·위치도를 동마다 소제목+새 쪽으로 나눔 (1·2종·한 동 출력은 그대로) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const s = app.indexOf('async function exportHwpxSurveyTable3(');
const e = app.indexOf('async function exportHwpxSurveyTable12(');
assert.ok(s > 0 && e > s);
const g3 = app.slice(s, e);
const g12 = app.slice(e, e + 200000);
// 사진 항목·디코드 결과에 동 정보가 따라간다
assert.ok(/globalPhotoEntries\.push\(\{[\s\S]{0,120}dongPart: preDongPart \|\| null/.test(g3), 'photo entry dongPart');
assert.ok(/return \{ d, floorCode, dongPart: entry\.dongPart \|\| null/.test(g3), 'decoded dongPart');
// 동이 둘 이상일 때만 나눔
assert.ok(/const splitAlbumByDong = !!\(dongParts && dongParts\.length > 1\)/.test(g3));
assert.ok(/const splitMapsByDong = !!\(dongParts && dongParts\.length > 1\)/.test(g3));
// 한 표에 두 동 사진이 섞이지 않음
assert.ok(/const slot2 = \(decoded\[i \+ 1\] && \(!splitAlbumByDong \|\| decoded\[i \+ 1\]\.dongPart === slot1\.dongPart\)\)/.test(g3));
// 소제목
assert.ok(g3.includes('`${dl} 결함사진`') && g3.includes('`${dl} 상태조사위치도`'), 'dong headings');
// 1·2종 출력은 손대지 않음
assert.ok(!g12.includes('splitAlbumByDong'), '1·2종 unchanged');

// 짝 맞추기 동작(실제 for 문 증가식과 같은 규칙)
function pairs(list, split) {
    const out = [];
    for (let i = 0; i < list.length; i += (list[i + 1] && (!split || list[i + 1].dongPart === list[i].dongPart)) ? 2 : 1) {
        const a = list[i];
        const b = (list[i + 1] && (!split || list[i + 1].dongPart === a.dongPart)) ? list[i + 1] : null;
        out.push([a.n, b ? b.n : null]);
    }
    return out;
}
const A = {}, B = {};
const ph = [1, 2, 3].map((n) => ({ n, dongPart: A })).concat([4, 5].map((n) => ({ n, dongPart: B })));
assert.deepStrictEqual(pairs(ph, true), [[1, 2], [3, null], [4, 5]]);
assert.deepStrictEqual(pairs(ph, false), [[1, 2], [3, 4], [5, null]]); // 한 동이면 예전 그대로
assert.ok(g3.includes('i += (decoded[i + 1] && (!splitAlbumByDong || decoded[i + 1].dongPart === decoded[i].dongPart)) ? 2 : 1'), 'loop rule same as test');
console.log('test-hwpx-grade3-dong-split: ok');