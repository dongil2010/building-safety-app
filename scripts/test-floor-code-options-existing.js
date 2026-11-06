// 도면 수정창 「층 지정」 목록: 이 건물에 이미 있는 층(외부 도면 포함)을 「기존 도면 교체」로 맨 위에 보여 줘서
// 파일 이름을 기존 층 이름과 같게 맞추지 않아도 1:1로 짝지을 수 있게 한다 (2026-11-02)
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'state.js'), 'utf8');
const start = src.indexOf('window.EXT_NEXT_OPTION = ');
const listEnd = src.indexOf('window.getFloorRankFromCode');
const fnStart = src.indexOf('window.buildFloorCodeOptionsHtml = function');
const fnEnd = src.indexOf('window.selectedUploadedDrawings = []', fnStart);
assert.ok(start > 0 && listEnd > start && fnStart > listEnd && fnEnd > fnStart, 'state.js 구조');

const window = {
    getFloorLabelFromCode: (c) => (/^EXT_/.test(c) ? '외부' + c.slice(4) : c),
    isExteriorFloorCode: (c) => /^EXT_|^외부/.test(c)
};
new Function('window', src.slice(start, listEnd) + '\n' + src.slice(fnStart, fnEnd))(window);

// 1) 기존 층을 안 넘기면 예전과 같다 (새 건물 등록 화면)
const plain = window.buildFloorCodeOptionsHtml('2F');
assert.ok(!plain.includes('optgroup'), '기존 층 없으면 묶음 없음');
assert.ok(plain.includes('value="2F" selected'));
assert.ok(plain.includes('__CUSTOM_FLOOR__'));

// 2) 기존 층(외부 포함)은 「기존 도면 교체」 묶음 맨 위, 새 층 목록에는 같은 층이 두 번 나오지 않는다
const existing = [
    { floorCode: '1F', floorLabel: '지상 1층 (1F)' },
    { floorCode: 'EXT_1', floorLabel: '정면도' },
    { floorCode: 'EXT_2', floorLabel: '배면도' }
];
const html = window.buildFloorCodeOptionsHtml('EXT_2', existing);
assert.ok(html.indexOf('기존 도면 교체') < html.indexOf('새 층으로 추가'));
assert.ok(html.includes('value="EXT_1" >정면도 ← 교체') || html.includes('value="EXT_1" >정면도 ← 교체'.replace('" >', '" >')), '외부1');
assert.ok(/value="EXT_2" selected>배면도 ← 교체/.test(html), '고른 외부 도면은 선택된 상태');
assert.strictEqual((html.match(/value="1F"/g) || []).length, 1, '1F는 한 번만');
assert.strictEqual((html.match(/<optgroup/g) || []).length, 2);
assert.strictEqual((html.match(/<\/optgroup>/g) || []).length, 2);
assert.ok(html.includes('__EXT_NEXT__'), '새 외부 추가도 그대로');
assert.ok(html.trim().endsWith('</optgroup>'));
assert.strictEqual((html.match(/ selected/g) || []).length, 1, '선택은 하나');

// 3) 이름에 특수문자가 있어도 깨지지 않는다
const weird = window.buildFloorCodeOptionsHtml('A"B', [{ floorCode: 'A"B', floorLabel: '<b>"도면"</b>' }]);
assert.ok(!weird.includes('<b>'));
assert.ok(weird.includes('&lt;b&gt;'));

// 4) 도면 수정창은 기존 층 목록을 넘기고, 기존 층마다 「파일로 교체」 단추가 있다
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.ok(/buildFloorCodeOptionsHtml\(item\.floorCode, existingFloors, item\.floorLabel\)/.test(app));
assert.ok(app.includes('edit-floor-drawing-replace'));

console.log('test-floor-code-options-existing: ok');
