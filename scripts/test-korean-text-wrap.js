/**
 * korean-text-wrap smoke tests (node)
 */
const assert = require('assert');
const api = require('../js/shared/korean-text-wrap.js');

const m = (s) => api.measureByUnits(s);

const lines = api.idealKoreanWrap('기둥 하부 균열, 그리고 누수.', { maxWidth: 10, measureWidth: m });
assert.ok(lines.length >= 2, '어절 줄바꿈');
assert.ok(lines.some((l) => l.includes('균열,')), '쉼표는 행두로 안 밀림');

const nl = api.wrapHwpxCellText('진행\n中', 16);
assert.strictEqual(nl, '진행\n中', '명시적 개행 보존');

const long = api.wrapHwpxCellText('철근콘크리트보하부균열및누수', 8);
assert.ok(long.includes('\n'), '긴 어절 Fallback');

const ea = api.idealKoreanWrap('0.3/1.2 -12EA', { maxWidth: 20, measureWidth: m });
assert.ok(ea.join(' ').includes('-12EA'), 'EA 접미사 유지');

console.log('korean-text-wrap ok');
