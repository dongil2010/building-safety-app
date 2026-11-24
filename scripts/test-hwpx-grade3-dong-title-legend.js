/**
 * 2026-11-24 3종 한글 상태조사표
 *  - 여러 동 한 파일: 동 첫 층에만 「N) 동 상태조사표」, 나머지 층은 제목 글자 없음
 *  - 동(건물)마다 마지막 표 밑에 「※ 범례 : B1-지하1층 / 1-지상1층 / … / R-옥상층 / O-외부」
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', '13-report-export.js'), 'utf8');
const s = src.indexOf('            const FLOOR_LEGEND_RESERVE_H');
const e = src.indexOf("return items.length ? `※ 범례 : ${items.join(' / ')}` : '';", s);
assert.ok(s > 0 && e > s, '범례 코드를 찾지 못함');
const block = src.slice(s, src.indexOf('};', e) + 2);

const prefixOf = (fc) => ({ B1F: 'B1', '1F': '1', '2F': '2', '3F': '3', '4F': '4', ROOF: 'R', EXT_1: 'O', 부대시설: 'A' }[fc]);
const raw = { B1F: '지하1층', '1F': '지상1층', '2F': '지상2층', '3F': '지상3층', '4F': '지상4층', ROOF: '옥상층 (ROOF)', EXT_1: '외부1', 부대시설: '부대시설' };
const mk = new Function('floorsData', 'getGrade3FloorPrefix', 'getFloorLabel',
    block + '\nreturn { isDongLastSurveySlot, buildDongFloorLegendText };');

// 여러 동: A동(지하1층~4층·옥상·외부), B동(1~2층·외부)
const A = { rawLabel: (fc) => raw[fc] };
const B = { rawLabel: (fc) => raw[fc] };
const fd = ['B1F', '1F', '2F', '3F', '4F', 'ROOF'].map((fc) => ({ floorCode: fc, dongPart: A }))
    .concat([{ floorCode: 'EXT_1', dongPart: A, exteriorCombined: true }])
    .concat(['1F', '2F'].map((fc) => ({ floorCode: fc, dongPart: B })))
    .concat([{ floorCode: 'EXT_1', dongPart: B, exteriorCombined: true }]);
let f = mk(fd, prefixOf, (fc) => raw[fc]);
assert.deepStrictEqual(fd.map((_, i) => f.isDongLastSurveySlot(i)), [false, false, false, false, false, false, true, false, false, true]);
assert.strictEqual(f.buildDongFloorLegendText(6), '※ 범례 : B1-지하1층 / 1-지상1층 / 2-지상2층 / 3-지상3층 / 4-지상4층 / R-옥상층 / O-외부');
assert.strictEqual(f.buildDongFloorLegendText(9), '※ 범례 : 1-지상1층 / 2-지상2층 / O-외부');

// 한 동(동 정보 없음): 마지막 층 밑에만, 외부 없으면 외부도 없음
const one = ['1F', '2F'].map((fc) => ({ floorCode: fc }));
f = mk(one, prefixOf, (fc) => raw[fc]);
assert.deepStrictEqual(one.map((_, i) => f.isDongLastSurveySlot(i)), [false, true]);
assert.strictEqual(f.buildDongFloorLegendText(1), '※ 범례 : 1-지상1층 / 2-지상2층');

// 제목: 여러 동이면 동 첫 층에만 「N) 동 상태조사표」
assert.ok(src.includes('t.textContent = `${surveyDongTitleNo}) ${curDongPart.dongLabel} 상태조사표 `;'));
// 범례 자리만큼 동 마지막 쪽 표를 줄인다
assert.ok(src.includes('fitSurveyPageRows(destTbl, fitRows, legendReserve)'));

console.log('test-hwpx-grade3-dong-title-legend: ok');
