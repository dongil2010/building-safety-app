'use strict';
// 2026-11-10 재현: 회차 손글씨 메모 자리(ROUND_SKETCH_MEMO)가 층 목록에 들어갔다가 「도면 없는 층」으로 빠지기를 반복했다.
// 동기화가 빈 도면 묶음을 합치며 floorDrawingTiers[ROUND_SKETCH_MEMO] = {} 를 만들고, 층 목록이 그 키를 층으로 읽었다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const FI = require(path.join(__dirname, '..', 'js', 'core', 'floor-identity.js'));
const CODE = 'ROUND_SKETCH_MEMO';
function take(name) {
    const start = app.indexOf(`    function ${name}(`);
    assert.ok(start >= 0, name);
    return app.slice(start, app.indexOf('\n    }\n', start) + 6);
}

// 빈 도면 묶음은 도면 칸을 만들지 않는다(진짜 층에도 해당)
const apply = new Function('isLightweightCloudPhotoRef', take('applyFloorDrawingPayload') + '; return applyFloorDrawingPayload;')((u) => /^https:/.test(String(u || '')));
const b1 = { id: 'B' };
apply(b1, '1F', { rasterUrl: '', pdfUrl: '', tiers: {} });
assert.ok(!b1.floorDrawingTiers || !('1F' in b1.floorDrawingTiers), '빈 묶음은 층 칸을 안 만든다');
apply(b1, '2F', { tiers: { 4000: 'https://x/y.jpg' } });
assert.strictEqual(b1.floorDrawingTiers['2F'][4000], 'https://x/y.jpg', '실제 도면은 그대로 받는다');

// 메모 자리 묶음은 도면으로 합치지 않는다
assert.ok(take('mergeFloorBundleIntoState').includes(`floorCode !== '${CODE}'`), '메모 자리에는 도면 묶음을 안 합친다');

// 어떤 경로로 들어와도 층 목록에는 안 나온다
const list = FI.assembleFloors([{ floorCode: '1F', floorLabel: '1층' }, { floorCode: CODE }], [{ floorCode: CODE }, { floorCode: '2F' }]);
assert.deepStrictEqual(list.map((f) => f.floorCode).sort(), ['1F', '2F']);

// 이미 들어간 기록(층 목록·도면 층·빈 칸·삭제 기록)은 지운다 — 메모 자체는 안 건드린다
const strip = new Function('_drawingFloorTombstone', '_sessionDeletedDrawingKeys', take('stripDeletedDrawingFloorsFromBuilding') + '; return stripDeletedDrawingFloorsFromBuilding;')({}, new Set());
const polluted = {
    id: 'B',
    floorsList: [{ floorCode: '1F' }, { floorCode: CODE }],
    drawingFloorCodes: ['1F', CODE],
    floorDrawingTiers: { [CODE]: {} },
    deletedDrawingFloorCodes: [CODE, '3F'],
    deletedDrawingFloorAt: { [CODE]: 5, '3F': 6 }
};
strip(polluted);
assert.deepStrictEqual(polluted.floorsList, [{ floorCode: '1F' }]);
assert.deepStrictEqual(polluted.drawingFloorCodes, ['1F']);
assert.ok(!(CODE in polluted.floorDrawingTiers));
assert.deepStrictEqual(polluted.deletedDrawingFloorCodes, ['3F'], '다른 층 삭제 기록은 그대로');
assert.deepStrictEqual(polluted.deletedDrawingFloorAt, { '3F': 6 });

assert.ok(take('collectKnownFloorCodesForBuilding').includes(`codes.delete('${CODE}')`));
assert.ok(take('mergeDiscoveredFloorsIntoBuilding').includes(`fc === '${CODE}'`));
assert.ok(take('hideDrawinglessFloorOnThisDevice').includes('delete bldg.floorDrawingTiers[floorCode]'), '숨길 때 빈 칸도 지워 바로 되살아나지 않게');
console.log('test-round-sketch-not-a-floor: ok');
