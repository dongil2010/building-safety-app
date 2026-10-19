'use strict';
// 2026-10-19 「중점관리도 도면에 중요 표시 뜨는데 그거 지워주고 중요 골랐을 때만」
// 도면(화면 drawPin·보고서/PDF/한글/이미지 drawPinSafe)과 마킹 목록의 「중요」 = isBookmark 일 때만.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const groups = {
    gPri: [{ id: 'a', isPriorityManage: true }, { id: 'b' }],
    gBook: [{ id: 'c' }, { id: 'd', isBookmark: true }]
};
const ctx = { getDefectMarkingGroupMembers: (gid) => groups[gid] || [] };
vm.createContext(ctx);
vm.runInContext(extractFunction(app, 'function defectHasCornerMark(') + '\nthis.f = defectHasCornerMark;', ctx);

assert.strictEqual(ctx.f({ isPriorityManage: true }), false, '중점관리만 → 중요 없음');
assert.strictEqual(ctx.f({ isBookmark: true }), true, '중요 고름 → 중요');
assert.strictEqual(ctx.f({ isBookmark: true, isPriorityManage: true }), true, '둘 다 → 중요');
assert.strictEqual(ctx.f({}), false);
assert.strictEqual(ctx.f(null), false);
assert.strictEqual(ctx.f({ groupId: 'gPri' }), false, '묶음에 중점관리만 → 중요 없음');
assert.strictEqual(ctx.f({ groupId: 'gBook' }), true, '묶음에 중요 고른 마킹 → 중요');

// 화면·출력 그리기 둘 다 이 함수만 본다
assert.strictEqual((app.match(/if \(defectHasCornerMark\(defect\)\) drawBookmarkChrome\(ctx,/g) || []).length, 2);
assert.strictEqual((app.match(/(?<!function )drawBookmarkChrome\(ctx,/g) || []).length, 2, '다른 곳에서 따로 그리지 않는다');
// 목록 「중요」 표시도 같게
assert.ok(/if \(d\.isBookmark\) row\.classList\.add\('is-important'\);/.test(app));
assert.ok(!/isPriorityManage\) row\.classList\.add\('is-important'\)/.test(app));
// 중점관리 데이터·핀 색은 그대로
assert.ok(/if \(defect\.isPriorityManage\) return getStyleColor\('priorityManage'\);/.test(app), '중점관리 핀 색 유지');
console.log('test-important-badge-bookmark-only: ok');
