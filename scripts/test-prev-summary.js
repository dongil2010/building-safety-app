/* 전차 종합결론 (2026-11-04): 자료 합치기·지우기 표시, 버튼 자리(모바일·태블릿은 층 이름 바꾸기 자리), 저장 경로 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const P = require(path.join(root, 'js', 'core', 'prev-summary.js'));

// 문서 키·ID
assert.strictEqual(P.docId('b1', 's1'), 'pvs_b1_s1');
assert.ok(/^s[0-9a-z]+_[0-9a-z]+$/.test(P.createId()));

// 저장용: dataUrl 빠짐
const clean = P.sanitize([{ id: 'a', name: 'x', addedAt: 5, dataUrl: 'data:image/jpeg;base64,AAAA' }, { name: 'no id' }]);
assert.deepStrictEqual(clean, [{ id: 'a', name: 'x', addedAt: 5 }]);

// 합치기: 합집합, 로컬 순서 먼저, dataUrl은 있는 쪽 것
let m = P.merge(
    { prevSummaryImages: [{ id: 'b', name: 'B', dataUrl: 'data:x' }, { id: 'a', name: 'A' }] },
    { prevSummaryImages: [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }] }
);
assert.deepStrictEqual(m.images.map((x) => x.id), ['b', 'a', 'c']);
assert.strictEqual(m.images[0].dataUrl, 'data:x');

// 다른 기기에서 지웠으면 이 기기 옛 목록이 되살리지 않는다
const local = { prevSummaryImages: [{ id: 'a' }, { id: 'b' }] };
const remote = { prevSummaryImages: [{ id: 'a' }], prevSummaryDeleted: { b: 100 } };
m = P.merge(local, remote);
assert.deepStrictEqual(m.images.map((x) => x.id), ['a']);
assert.deepStrictEqual(m.deleted, { b: 100 });

// 이 기기에서 지움 → 원격 옛 목록에 있어도 빠짐
const me = { prevSummaryImages: [{ id: 'a' }, { id: 'b' }] };
assert.strictEqual(P.remove(me, 'a', 50), true);
m = P.merge(me, { prevSummaryImages: [{ id: 'a' }, { id: 'b' }] });
assert.deepStrictEqual(m.images.map((x) => x.id), ['b']);
assert.strictEqual(m.deleted.a, 50);

// 순서 옮기기
const mv = { prevSummaryImages: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
assert.strictEqual(P.move(mv, 'c', -1), true);
assert.deepStrictEqual(mv.prevSummaryImages.map((x) => x.id), ['a', 'c', 'b']);
assert.strictEqual(P.move(mv, 'a', -1), false);

// 화면: PC는 층 이름 바꾸기 → 전차 종합결론 → 전경사진 → 메모, 층 이름 바꾸기는 PC 전용(.pc-only-chrome)
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const iRename = html.indexOf('id="btnRenameFloor"');
const iPvs = html.indexOf('id="btnOpenPrevSummary"');
const iOv = html.indexOf('id="btnOpenOverviewPhotos"');
const iMemo = html.indexOf('id="btnOpenSketchMemo"');
assert.ok(iRename > 0 && iRename < iPvs && iPvs < iOv && iOv < iMemo, '버튼 순서');
const renameTag = html.slice(html.lastIndexOf('<button', iRename), html.indexOf('>', iRename));
assert.ok(/pc-only-chrome/.test(renameTag), '층 이름 바꾸기는 모바일·태블릿에서 숨김');
const pvsTag = html.slice(html.lastIndexOf('<button', iPvs), html.indexOf('>', iPvs));
assert.ok(!/pc-only-chrome/.test(pvsTag), '전차 종합결론은 모든 화면에서 보임');
assert.ok(html.includes('id="prevSummaryModal"') && html.includes('id="prevSummaryViewer"'));
assert.ok(html.indexOf('js/core/prev-summary.js') > 0 && html.indexOf('js/core/prev-summary.js') < html.indexOf('src="app.js'));

// app.js: 저장 때 dataUrl 빼기, 병합, 저장 폴더, 오프라인 준비, 건물 삭제
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.strictEqual((app.match(/window\.BSA\.prevSummary\.sanitize\(rest\.prevSummaryImages\)/g) || []).length, 2, '로컬·클라우드 저장 둘 다 가볍게');
assert.ok(/window\.BSA\.prevSummary\.merge\(localMatch, b\)/.test(app), '동기화 병합');
assert.ok(/photoId\.indexOf\('pvs_'\) === 0/.test(app), '사진 저장 폴더를 건물로');
assert.ok(/deletePrevSummaryStorage\(window\.BSA\.prevSummary\.docId\(bldg\.id, p\.id\)\)/.test(app), '건물 영구 삭제 때 같이 지움');
assert.ok(/btnOpenPrevSummary/.test(app));
console.log('test-prev-summary OK');
