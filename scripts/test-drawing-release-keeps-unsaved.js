'use strict';
// 2026-11-09 재현: 기기 저장 실패 + 서버 업로드 실패인 도면을 메모리에서 비워 「저장 완료」 뒤 도면이 사라졌다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const start = app.indexOf('    function releaseHeavyDrawingMemory(');
assert.ok(start >= 0);
const src = app.slice(start, app.indexOf('\n    }\n', start) + 6);

function run(persisted, cloud) {
    const window = { _cloudSyncedDrawingKeys: new Set(cloud), _cloudSyncedPdfKeys: new Set(cloud), _cloudSyncedTierKeys: new Set(cloud) };
    const p = new Set(persisted);
    const release = new Function('window', '_idbPersistedPdfKeys', '_idbPersistedSourceKeys', '_idbPersistedDrawingKeys', '_idbPersistedTierKeys',
        src + '; return releaseHeavyDrawingMemory;')(window, p, p, p, p);
    const bldg = {
        id: 'b',
        floorDrawings: { '1F': 'r' },
        floorDrawingPdfs: { '1F': 'p' },
        floorDrawingSources: { '1F': 's' },
        floorDrawingTiers: { '1F': { 4000: 't' } }
    };
    release(bldg, { keepFloor: '2F', keepDim: 4000 });
    return bldg;
}

let b = run([], []);
assert.strictEqual(b.floorDrawings['1F'], 'r', '어디에도 없으면 그림을 남긴다');
assert.strictEqual(b.floorDrawingPdfs['1F'], 'p', '어디에도 없으면 PDF를 남긴다');
assert.strictEqual(b.floorDrawingSources['1F'], 's', '어디에도 없으면 원본을 남긴다');
assert.strictEqual(b.floorDrawingTiers['1F'][4000], 't', '어디에도 없으면 티어를 남긴다');

b = run(['b_1F', 'b_1F_4000'], []);
assert.deepStrictEqual([b.floorDrawings, b.floorDrawingPdfs, b.floorDrawingSources, b.floorDrawingTiers], [{}, {}, {}, {}], '기기에 저장됐으면 비운다');

b = run([], ['b_1F', 'b_1F_4000']);
assert.ok(!b.floorDrawings['1F'] && !b.floorDrawingPdfs['1F'] && !b.floorDrawingTiers['1F'], '서버에 있으면 비운다');
console.log('test-drawing-release-keeps-unsaved: ok');
