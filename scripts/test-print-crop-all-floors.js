/**
 * 2026-11-24 위치도 「출력 범위」 → 「전체 층에 적용」: 지금 범위를 이 동의 모든 층에 같은 비율로 넣는다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', '12-survey-table.js'), 'utf8');
function fnSrc(name) {
    const s = src.indexOf(`    function ${name}(`);
    assert.ok(s > 0, name + ' 없음');
    const e = src.indexOf('\n    }\n', s);
    return src.slice(s, e + 6);
}

const sb = {
    state: { floorPrintCrops: { 'b1_2F': { nx: 0.5, ny: 0.5, nw: 0.1, nh: 0.1 }, 'b2_1F': { nx: 0.3, ny: 0.3, nw: 0.3, nh: 0.3 } } },
    window: {},
    getFloorMapStyleKey: (b, f) => `${b}_${f}`,
    getBuildingFloorCodesForStyle: (bldg) => bldg.codes.slice(),
    printCropApi: () => ({ toStored: (c, w, h) => ({ nx: c.x / w, ny: c.y / h, nw: c.w / w, nh: c.h / h }) }),
    ndtPrintCropKey: (b, f) => `${b}_${f}#ndt`
};
vm.createContext(sb);
vm.runInContext(['printCropAllFloorCodes', 'applyPrintCropToFloors'].map(fnSrc).join('\n')
    + '\n;this.__f = { printCropAllFloorCodes, applyPrintCropToFloors };', sb);
const f = sb.__f;
const eq = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));

// 층 목록: 이 동 층 + 지금 층, 회차 메모 자리는 빼고
const codes = f.printCropAllFloorCodes({ codes: ['1F', '2F', 'ROUND_SKETCH_MEMO'] }, '3F');
eq(codes.sort(), ['1F', '2F', '3F']);

// 같은 비율로 모든 층에, 다른 동은 그대로, 층마다 다른 객체
f.applyPrintCropToFloors('b1', codes, { x: 100, y: 50, w: 800, h: 400 }, 1000, 500, false);
['1F', '2F', '3F'].forEach((fc) => eq(sb.state.floorPrintCrops['b1_' + fc], { nx: 0.1, ny: 0.1, nw: 0.8, nh: 0.8 }));
assert.notStrictEqual(sb.state.floorPrintCrops.b1_1F, sb.state.floorPrintCrops.b1_2F);
eq(sb.state.floorPrintCrops.b2_1F, { nx: 0.3, ny: 0.3, nw: 0.3, nh: 0.3 });

// 비파괴는 #ndt 키에만
f.applyPrintCropToFloors('b1', ['1F'], { x: 0, y: 0, w: 500, h: 250 }, 1000, 500, true);
eq(sb.state.floorPrintCrops['b1_1F#ndt'], { nx: 0, ny: 0, nw: 0.5, nh: 0.5 });
eq(sb.state.floorPrintCrops.b1_1F, { nx: 0.1, ny: 0.1, nw: 0.8, nh: 0.8 });

// 도면 전체(기본)로 되돌리기 = null(지운 키도 서버에 남게 delete 아님)
f.applyPrintCropToFloors('b1', ['1F', '2F'], null, 1000, 500, false);
assert.strictEqual(sb.state.floorPrintCrops.b1_1F, null);
assert.ok('b1_2F' in sb.state.floorPrintCrops);

// 모달에 단추와 처리기가 있다
assert.ok(src.includes('data-role="all"') && src.includes("querySelector('[data-role=\"all\"]')"));

console.log('test-print-crop-all-floors: ok');
