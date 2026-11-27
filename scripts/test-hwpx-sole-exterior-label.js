/**
 * 2026-11-24 한글 출력: 외부 도면이 한 장뿐인 동은 자동 이름 「외부1」 → 「외부」(표 구분 칸),
 * 위치도 캡션은 「건축물 외부 상태조사 위치도」. 외부가 여러 장이거나 사람이 지은 이름은 그대로.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractFunction } = require('./lib-extract-fn');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', '13-report-export.js'), 'utf8');
const f = new Function(extractFunction(src, 'function soleExteriorHwpxLabel(') + '\n'
    + extractFunction(src, 'function hwpxMapCaptionFloor(')
    + '\nreturn { soleExteriorHwpxLabel, hwpxMapCaptionFloor };')();
const isExt = (fc) => /^EXT/.test(fc);

const one = { floorsList: [{ floorCode: '1F', floorLabel: '지상1층' }, { floorCode: 'EXT_1', floorLabel: '외부1' }] };
assert.strictEqual(f.soleExteriorHwpxLabel(one, 'EXT_1', '외부1', isExt), '외부');
assert.strictEqual(f.soleExteriorHwpxLabel(one, '1F', '지상1층', isExt), '지상1층');

// 외부 두 장이면 번호 유지
const two = { floorsList: one.floorsList.concat([{ floorCode: 'EXT_2', floorLabel: '외부2' }]) };
assert.strictEqual(f.soleExteriorHwpxLabel(two, 'EXT_1', '외부1', isExt), '외부1');
// 도면만 있는 외부도 센다
assert.strictEqual(f.soleExteriorHwpxLabel({ floorsList: one.floorsList, floorDrawings: { EXT_2: {} } }, 'EXT_1', '외부1', isExt), '외부1');
// 부대시설(코드가 EXT 여도)은 외부로 세지 않는다
const fac = { floorsList: one.floorsList.concat([{ floorCode: 'EXT_3', floorLabel: '부대시설' }]) };
assert.strictEqual(f.soleExteriorHwpxLabel(fac, 'EXT_1', '외부1', isExt), '외부');
// 사람이 지은 이름은 그대로
assert.strictEqual(f.soleExteriorHwpxLabel(one, 'EXT_1', '정면', isExt), '정면');

// 캡션
assert.strictEqual(f.hwpxMapCaptionFloor('외부'), '건축물 외부');
assert.strictEqual(f.hwpxMapCaptionFloor('본관동 외부'), '본관동 건축물 외부');
assert.strictEqual(f.hwpxMapCaptionFloor('본관동 외부1'), '본관동 외부1');
assert.strictEqual(f.hwpxMapCaptionFloor('지상1층'), '지상1층');

console.log('test-hwpx-sole-exterior-label: ok');
