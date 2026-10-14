'use strict';
// 도면 가이드(사각형·직선, 2026-10-14): 층별 저장·동기화 합치기·묘비, 화면 전용(출력 경로에 없음)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const G = require(path.join(root, 'js', 'core', 'guide-shapes.js'));
const SM = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const merge = SM.mergeNdtDataMaps;
const FK = 'B1_1F';

// 추가·고치기·지우기
const a = { };
const r = G.add(a, FK, 'rect', 10, 20, 110, 220, { now: 1000 });
const l = G.add(a, FK, 'line', 0, 0, 50, 50, { now: 1001 });
assert.strictEqual(G.listFor(a, FK).length, 2);
assert.strictEqual(G.add(a, FK, 'tri', 0, 0, 1, 1), null, '원·직선·(예전)사각형만');
{ const c0 = {}; const c = G.add(c0, FK, 'circle', 100, 100, 110, 100); assert.ok(c && c.type === 'column' && G.radiusOf(c) === 10, '원 = 기둥, 반지름'); const id = (p) => ({ sx: p.x, sy: p.y }); assert.ok(G.hitTest(G.listFor(c0, FK), 103, 100, id, 9), '원 안쪽 고르기'); assert.strictEqual(G.hitTest(G.listFor(c0, FK), 140, 100, id, 9), null, '원 밖'); }
G.update(a, FK, r.id, { x1: 15 }, 900); // 시계가 뒤로 가도 updatedAt은 늘어난다
assert.ok(r.updatedAt > 1000 && r.x1 === 15);

// 화면 고르기: 꼭짓점 / 테두리 / 안쪽
const id = (p) => ({ sx: p.x, sy: p.y });
assert.strictEqual(G.hitTest(G.listFor(a, FK), 15, 20, id, 8, r.id).part, 'h0');
assert.strictEqual(G.hitTest(G.listFor(a, FK), 60, 21, id, 8).shape.id, r.id);
assert.strictEqual(G.hitTest(G.listFor(a, FK), 25, 25, id, 8).shape.id, l.id, '직선 근처는 직선');
assert.strictEqual(G.hitTest(G.listFor(a, FK), 80, 150, id, 8).shape.id, r.id, '사각형 안쪽');
assert.strictEqual(G.hitTest(G.listFor(a, FK), 500, 500, id, 8), null);

// 두 기기 합치기: 늦게 고친 쪽이 이긴다
const b = JSON.parse(JSON.stringify(a));
G.update(b, FK, r.id, { x2: 300 }, 5000);
G.mergePackIntoState(a, FK, G.packFor(b, FK), merge);
assert.strictEqual(G.listFor(a, FK).find((d) => d.id === r.id).x2, 300);
// 지우기(묘비) → 다른 기기에도 사라짐
G.remove(b, FK, l.id);
G.mergePackIntoState(a, FK, G.packFor(b, FK), merge);
assert.ok(!G.listFor(a, FK).some((d) => d.id === l.id), '지운 직선은 합친 뒤에도 없음');
// 되돌리기로 되살리기 → 묘비보다 늦은 시각이라 살아남음
const back = G.add(b, FK, 'line', 0, 0, 50, 50, { id: l.id, now: 6000 });
assert.ok(back.updatedAt > 1001);
G.mergePackIntoState(a, FK, G.packFor(b, FK), merge);
assert.ok(G.listFor(a, FK).some((d) => d.id === l.id), '되살린 직선이 돌아옴');
assert.ok(G.packHasContent(G.packFor(a, FK)) && !G.packHasContent(G.packFor({}, FK)));
// 결함·NDT와 섞이지 않음
assert.ok(!a.defects && !a.ndtData);

// 앱 연결: 층 묶음에 싣고, 출력 경로(캔버스/한글/PDF/엑셀)에는 안 들어간다
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(app.includes("guideShapes: (window.BSA && window.BSA.guideShapes) ? window.BSA.guideShapes.packFor(window.state, floorKey)"));
assert.ok(app.includes('window.BSA.guideShapes.mergePackIntoState(window.state, floorKey, bundle.guideShapes'));
assert.ok(app.includes('guideShapes: window.state.guideShapes || {}'), '로컬 저장');
assert.ok(html.indexOf('js/core/guide-shapes.js') > 0 && html.indexOf('js/core/guide-shapes.js') < html.indexOf('src="app.js'));
assert.ok(html.includes('id="btnModeGuide"') && html.includes('id="mobileBtnModeGuide"'));
// guideShapes를 읽는 곳은 가이드 코드·저장·동기화뿐(캔버스 drawCanvas·출력 함수에서 안 읽음)
const uses = app.split('\n').filter((ln) => /guideShapes|gsApi\(\)\.listFor|api\.listFor\(state, currentMemoFloorKey\(\)\)\.length/.test(ln) && /ctx\.|hwp|Hwp|pdf|Pdf|xlsx|Excel/.test(ln));
assert.deepStrictEqual(uses, [], '출력 코드에서 가이드를 쓰면 안 된다');
// 2026-10-14 종류(기둥·거더·빔): 기본값·지정·고치기·되돌리기·예전 가이드 호환
const t = {};
assert.strictEqual(G.add(t, FK, 'rect', 0, 0, 10, 10).type, 'column', '사각형 기본 = 기둥');
assert.strictEqual(G.add(t, FK, 'line', 0, 0, 10, 10).type, 'beam', '직선 기본 = 빔');
const gd = G.add(t, FK, 'line', 0, 0, 10, 10, { type: 'girder' });
assert.strictEqual(gd.type, 'girder');
assert.strictEqual(G.add(t, FK, 'rect', 0, 0, 1, 1, { type: 'slab' }).type, 'column', '모르는 종류는 기본값');
G.update(t, FK, gd.id, { type: 'column' });
assert.strictEqual(gd.type, 'column');
G.update(t, FK, gd.id, { type: 'nope' });
assert.strictEqual(gd.type, 'column', '잘못된 종류로는 안 바뀜');
assert.strictEqual(G.typeOf({ kind: 'rect' }), 'column', '예전 사각형 = 기둥');
assert.strictEqual(G.typeOf({ kind: 'line' }), 'beam', '예전 직선 = 빔');
assert.deepStrictEqual(G.TYPES, ['column', 'girder', 'beam']);
// 종류는 층 묶음에 실려 다른 기기로 간다
const t2 = {};
G.mergePackIntoState(t2, FK, G.packFor(t, FK), merge);
assert.strictEqual(G.listFor(t2, FK).find((d) => d.id === gd.id).type, 'column');

// 스타일 설정: 종류별 색 + 진하기, 화면 SVG에만 적용
assert.ok(app.includes("guideColumn: '#e11d48'") && app.includes("guideGirder: '#7c3aed'") && app.includes("guideBeam: '#0d9488'"), '기본 색');
['GuideColumn', 'GuideGirder', 'GuideBeam'].forEach((k) => {
    assert.ok(app.includes(`['styleColor${k}', '`), `${k} 색 필드`);
    assert.ok(html.includes(`id="styleColor${k}"`), `${k} 색 입력`);
});
assert.ok(html.includes('id="styleGuideOpacity"') && app.includes('const GUIDE_OPACITY_DEFAULT = 0.55;'), '진하기 설정');
assert.ok(app.includes('state.styleColors.guideOpacity = String(clampGuideOpacity('), '진하기는 styleColors에 저장(동기화)');
assert.ok(app.includes('{ type: drag.type }') && app.includes('type: last.rec.type'), '그릴 때·되돌릴 때 종류 유지');
assert.ok(html.includes('가이드 (화면 전용, 출력 안 됨)'));
// 출력 경로 재확인: 가이드 색 함수는 SVG 가이드 코드에서만 쓴다
const colorUses = app.split('\n').filter((ln) => /getGuideTypeColor|getGuideOpacity\(\)/.test(ln) && /ctx\.|hwp|Hwp|pdf|Pdf|xlsx|Excel/.test(ln));
assert.deepStrictEqual(colorUses, [], '출력 코드에서 가이드 색을 쓰면 안 된다');
console.log('test-guide-shapes: ok');
