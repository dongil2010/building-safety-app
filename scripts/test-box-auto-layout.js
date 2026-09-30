/**
 * NO. 박스 자동 정리(2026-09-30): 마킹 점은 그대로, 박스만 겹치지 않는 자리로. 같은 입력 = 같은 결과.
 * 겹친 박스만 모드(움직일 수 없는 박스 존중)·통합 묶음(화살표 여럿)·「중요」 크기·회전·앱 연결 확인.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require(path.join(__dirname, '..', 'js', 'shared', 'box-auto-layout.js'));
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

const ext = { l: 30, t: 12, r: 30, b: 12 };
const mk = (id, tx, ty, extra) => Object.assign({ id, cx: tx + 5, cy: ty - 35, ext, targets: [{ x: tx, y: ty }], movable: true }, extra || {});

// 1) 두 박스가 겹침 → 겹침 없어짐, 마킹 점 입력은 그대로
const two = [mk('a', 500, 500), mk('b', 520, 505)];
const snapshot = JSON.stringify(two);
const r1 = L.layoutBoxes(two, { bounds: { w: 2000, h: 1500 } });
assert.ok(r1.before > 0 && r1.after === 0, `겹침 없앰 ${r1.before}→${r1.after}`);
assert.strictEqual(JSON.stringify(two), snapshot, '입력(마킹 점) 안 바꿈');
assert.ok(Object.keys(r1.moves).length >= 1);

// 2) 겹침 없는 박스는 안 움직임
const lone = [mk('x', 300, 300), mk('y', 1200, 900)];
assert.deepStrictEqual(L.layoutBoxes(lone, { bounds: { w: 2000, h: 1500 } }).moves, {});

// 3) 움직일 수 없는 박스(직접 옮김)는 제자리, 다른 박스가 비켜 감
const fixed = [mk('m', 500, 500, { movable: false }), mk('n', 510, 500)];
const r3 = L.layoutBoxes(fixed, { bounds: { w: 2000, h: 1500 } });
assert.ok(!r3.moves.m && r3.moves.n && r3.after === 0);

// 4) 박스가 다른 마킹 점을 가리면 비킴
const cover = [mk('p', 500, 500), { id: 'q', cx: 800, cy: 800, ext, targets: [{ x: 505, y: 466 }], movable: false }];
const conf = L.conflictsAtCurrent(cover, {});
assert.ok(conf.p > 0);
const r4 = L.layoutBoxes(cover, {});
assert.ok(r4.moves.p && r4.after < r4.before);

// 5) 통합 묶음: 화살표 둘 → 박스 하나(결과도 하나)
const grp = [{ id: 'g', cx: 600, cy: 600, ext, targets: [{ x: 560, y: 640 }, { x: 640, y: 640 }], movable: true }, mk('h', 600, 620)];
const r5 = L.layoutBoxes(grp, { bounds: { w: 2000, h: 1500 } });
assert.strictEqual(r5.after, 0);

// 6) 같은 입력이면 같은 결과, 수백 개도 빠르게
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const many = [];
for (let i = 0; i < 400; i++) { const tx = 100 + rnd() * 3800; const ty = 100 + rnd() * 2800; many.push(mk('d' + i, tx, ty)); }
const t0 = Date.now();
const ra = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 } });
const ms = Date.now() - t0;
const rb = L.layoutBoxes(many, { bounds: { w: 4000, h: 3000 } });
assert.strictEqual(JSON.stringify(ra.moves), JSON.stringify(rb.moves), '결정적');
assert.ok(ra.after < ra.before / 4, `많이 줄어듦 ${ra.before}→${ra.after}`);
assert.ok(ms < 3000, `빠름 ${ms}ms`);

// 7) 범례 등 가림막·도면 밖 피함
const ob = [mk('o', 100, 100)];
const r7 = L.layoutBoxes(ob, { bounds: { w: 2000, h: 1500 }, obstacles: [{ x1: 0, y1: 0, x2: 200, y2: 90 }] });
assert.ok(r7.moves.o && r7.after === 0);

// 8) 「중요」 글자·회전 반영한 박스 크기
assert.deepStrictEqual(L.boxExtent(60, 24, 0, null), { l: 30, t: 12, r: 30, b: 12 });
const eb = L.boxExtent(60, 24, 0, { w: 20, h: 8 });
assert.ok(eb.l === 40 && eb.t === 16 && eb.r === 30 && eb.b === 12, JSON.stringify(eb));
const e90 = L.boxExtent(60, 24, 90, null);
assert.ok(Math.abs(e90.l - 12) < 1e-9 && Math.abs(e90.t - 30) < 1e-9, '90° 회전은 가로·세로 바뀜');
// 기하
assert.ok(L.segCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }));
assert.ok(!L.segCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }), '같은 끝점은 교차 아님');
assert.ok(L.segHitsRect({ x: 0, y: 5 }, { x: 20, y: 5 }, { x1: 5, y1: 0, x2: 15, y2: 10 }));

// 앱 연결
const app = read('app.js');
const idx = read('index.html');
assert.ok(idx.includes('id="btnBoxAutoLayout"') && idx.includes('id="mobileBtnBoxAutoLayout"'), 'PC·터치 버튼');
assert.ok(idx.indexOf('js/shared/box-auto-layout.js') > 0 && idx.indexOf('js/shared/box-auto-layout.js') < idx.indexOf('src="app.js'));
const blk = app.slice(app.indexOf('function buildBoxAutoLayoutItems('), app.indexOf("window.runMarkingBoxAutoLayout = runMarkingBoxAutoLayout;"));
assert.ok(blk.includes('pickDefectGroupRepresentative(gm)'), '통합 묶음 = 박스 하나');
assert.ok(blk.includes('getBookmarkChromeGlyphHeight(scale)'), '「중요」 글자 크기');
assert.ok(blk.includes("movable: mode === 'all' ? true : !manual"), '직접 옮긴 박스 제외(모든 박스면 포함)');
assert.ok(blk.includes('if (typeof pushDefectHistory === \'function\') pushDefectHistory();'), '되돌리기 한 번');
const apply = blk.slice(blk.indexOf('function applyMarkingBoxAutoLayout('));
assert.ok(apply.includes('m.x = mv.x;') && apply.includes('m.y = mv.y;') && !/m\.targetX\s*=|m\.targetY\s*=|m\.area[XY][12]\s*=/.test(apply), '박스 x·y만 바꿈');
assert.ok(apply.includes('touchDefectPositionUpdatedAt(m)'), '동기화 위치 시각');
const dragEnd = app.slice(app.indexOf('박스를 직접 끌어 옮김'), app.indexOf('박스를 직접 끌어 옮김') + 600);
assert.ok(dragEnd.includes('activeDragPin.boxManual = true;'), '직접 옮기면 표시');
assert.ok(/'boxManual'/.test(read('js/core/sync-merge.js')), '표시도 위치와 함께 동기화');
console.log('test-box-auto-layout: ok');
