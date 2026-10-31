'use strict';
// 2026-10-31 1·2종 한글 상태조사표: 행·열이 위치 칸에 한 줄로 들어가게 위치 칸을 넓히고 조사내용 칸을 줄임(3종·양식 파일은 그대로)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
global.window = global.window || {};
const G = (() => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'window', 'self', fs.readFileSync(path.join(root, 'js/shared/grid-lines.js'), 'utf8'))(mod, mod.exports, global.window, global.window);
    return (global.window.BSA && global.window.BSA.gridLines) || mod.exports;
})();

const W = parseInt((app.match(/HWPX_G12_LOCATION_COL_WIDTH = (\d+);/) || [])[1], 10);
assert.ok(W > 4695, '양식(4695)보다 넓다');
const units = G.cellTextUnits({ cellWidth: W, marginLeft: 141, marginRight: 141, fontHeight: 800 });
assert.deepStrictEqual(G.splitGridLocLines('X4~X5/Y1~Y2', units), ['X4~X5/Y1~Y2'], '한 줄');

// 1·2종 출력에서만 호출, 표 나누기 전에 호출
assert.strictEqual((app.match(/slot\.statusTbls\.forEach\(widenGrade12SurveyLocationCol\);/g) || []).length, 1, '호출 한 곳');
const at = app.indexOf('slot.statusTbls.forEach(widenGrade12SurveyLocationCol);');
assert.ok(at > app.indexOf('exportHwpxSurveyTable12'), '1·2종 쪽');
console.log('test-hwpx-grade12-location-width: ok');
