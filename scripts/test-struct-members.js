#!/usr/bin/env node
'use strict';

/**
 * 2026-10-14 구조 부재 레이어 — 구조도에서 찾은 부재 기호를 층 도면 위에 반투명하게 겹쳐 보고 옮기기·지우기·추가.
 * 부재 수 점·가이드와는 따로 둔 자료(state.structMembers, pack.structMembers). 화면 전용(출력 제외).
 * 화면 코드(js/tabs/struct-layer.js)는 쓸 때만 불러온다.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const S = require(path.join(root, 'js', 'core', 'struct-members.js'));
const syncMerge = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const mergeFn = syncMerge.mergeNdtDataMaps || (syncMerge.default && syncMerge.default.mergeNdtDataMaps);
assert.strictEqual(typeof mergeFn, 'function', 'sync-merge.mergeNdtDataMaps');

// ---- 넣기·고치기·지우기 ----
const st = {};
const FK = 'b1_1F';
const a = S.add(st, FK, { type: '거더', label: 'fG1', x: 100.04, y: 50, w: 40, h: 12 }, { now: 1000 });
assert.ok(a && a.id && a.x === 100 && a.updatedAt === 1000);
assert.strictEqual(S.add(st, FK, { type: '모름', x: 1, y: 1, w: 1, h: 1 }), null, '모르는 종류는 안 넣는다');
assert.strictEqual(S.add(st, FK, { type: '빔', x: 1, y: 1, w: 0, h: 1 }), null, '크기 없는 것은 안 넣는다');
const b = S.add(st, FK, { type: '기둥', label: 'C1', x: 10, y: 10, w: 12, h: 12 }, { now: 1000 });
assert.notStrictEqual(a.id, b.id, '같은 시각에 넣어도 id가 다르다');
assert.strictEqual(S.listFor(st, FK).length, 2);
assert.strictEqual(S.listFor(st, 'b1_2F').length, 0, '층마다 따로');
assert.ok(S.hasAny(st, FK) && !S.hasAny(st, 'b1_2F'));

const moved = S.update(st, FK, a.id, { x: 120, y: 60 }, 1000);
assert.ok(moved.x === 120 && moved.y === 60 && moved.updatedAt === 1001, '고칠 때마다 시각이 앞으로 간다');
assert.strictEqual(S.update(st, FK, a.id, { type: '빔' }, 2000).type, '빔');
assert.strictEqual(S.update(st, FK, a.id, { type: '엉뚱' }, 2001).type, '빔', '모르는 종류로는 안 바뀐다');
assert.deepStrictEqual(Object.assign({}, S.countsByType(S.listFor(st, FK))), { '기둥': 1, '벽': 0, '거더': 0, '빔': 1, '슬래브': 0 });

// 고르기: 겹치면 작은 것
assert.strictEqual(S.hitTest(S.listFor(st, FK), 10, 10, 0).id, b.id);
assert.strictEqual(S.hitTest(S.listFor(st, FK), 500, 500, 2), null);

const gone = S.remove(st, FK, b.id);
assert.ok(gone && gone.id === b.id);
assert.strictEqual(S.listFor(st, FK).length, 1);
assert.ok(st.deletedStructMemberIds[FK].includes(b.id) && st.deletedStructMemberAt[FK][b.id] === 1000, '묘비 = 마지막 수정 시각');
// 되살리기(같은 id로 다시 넣기)는 묘비를 걷고 더 늦은 시각을 받는다
const back = S.add(st, FK, gone, { id: gone.id, now: 500 });
assert.ok(back.updatedAt > 1000 && !st.deletedStructMemberIds[FK].includes(b.id));

// ---- 기준점 2개 맞춤 ----
// 구조도 (0,0)-(100,0) 을 도면 (1000,2000)-(1200,2000) 에: 2배, 회전 없음
let fit = S.fitTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 1000, y: 2000 }, { x: 1200, y: 2000 });
assert.ok(Math.abs(fit.scale - 2) < 1e-9 && Math.abs(fit.angle) < 1e-9);
let p = S.applyFit(fit, { x: 50, y: 10, w: 20, h: 6 });
assert.ok(Math.abs(p.x - 1100) < 1e-6 && Math.abs(p.y - 2020) < 1e-6 && Math.abs(p.w - 40) < 1e-6 && Math.abs(p.h - 12) < 1e-6);
// 90° 돌아간 도면: 가로·세로 크기가 바뀐다
fit = S.fitTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 500, y: 500 }, { x: 500, y: 600 });
assert.ok(Math.abs(fit.scale - 1) < 1e-9 && Math.abs(fit.angle - 90) < 1e-9);
p = S.applyFit(fit, { x: 100, y: 0, w: 20, h: 6 });
assert.ok(Math.abs(p.x - 500) < 1e-6 && Math.abs(p.y - 600) < 1e-6 && Math.abs(p.w - 6) < 1e-6 && Math.abs(p.h - 20) < 1e-6);
// 기준점 두 개가 같은 곳이면 맞출 수 없다
assert.strictEqual(S.fitTwoPoints({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 9, y: 9 }), null);
assert.strictEqual(S.fitTwoPoints({ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 5, y: 5 }, { x: 5, y: 5 }), null);

// ---- 가져오기: 있던 부재는 지우고(묘비) 새로 넣는다 ----
fit = S.fitTwoPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 1000, y: 2000 }, { x: 1200, y: 2000 });
const before = S.listFor(st, FK).map((d) => d.id);
const n = S.importMembers(st, FK, [
    { type: '기둥', label: 'C1', x: 0, y: 0, w: 6, h: 6 },
    { type: '거더', label: '1G1', x: 50, y: 0, w: 12, h: 5 },
    { type: '엉뚱', label: '?', x: 1, y: 1, w: 1, h: 1 }
], fit, 5000);
assert.strictEqual(n, 2, '모르는 종류는 건너뛴다');
const now = S.listFor(st, FK);
assert.deepStrictEqual(now.map((d) => d.label).sort(), ['1G1', 'C1']);
assert.ok(now.every((d) => !before.includes(d.id)), '새 id');
assert.ok(before.every((id) => st.deletedStructMemberIds[FK].includes(id)), '있던 부재는 묘비로');
assert.ok(now.find((d) => d.label === '1G1').x === 1100 && now.find((d) => d.label === '1G1').w === 24);
assert.strictEqual(S.importMembers(st, FK, [{ type: '기둥', x: 0, y: 0, w: 1, h: 1 }], null), 0, '맞춤이 없으면 아무것도 안 한다');
assert.strictEqual(S.listFor(st, FK).length, 2, '맞춤 없이 부르면 있던 것도 그대로');

// ---- 층 묶음으로 다른 기기와 합치기 ----
const other = {};
S.mergePackIntoState(other, FK, S.packFor(st, FK), mergeFn);
assert.deepStrictEqual(S.listFor(other, FK).map((d) => d.label).sort(), ['1G1', 'C1'], '받은 기기에 그대로');
// 다른 기기가 하나를 옮기고 하나를 지움 → 이 기기에 반영
const g1 = S.listFor(other, FK).find((d) => d.label === '1G1');
const c1 = S.listFor(other, FK).find((d) => d.label === 'C1');
S.update(other, FK, g1.id, { x: 1500 }, 9000);
S.remove(other, FK, c1.id);
S.mergePackIntoState(st, FK, S.packFor(other, FK), mergeFn);
assert.deepStrictEqual(S.listFor(st, FK).map((d) => d.label), ['1G1']);
assert.strictEqual(S.listFor(st, FK)[0].x, 1500, '늦게 고친 쪽이 이긴다');
assert.ok(S.packHasContent(S.packFor(st, FK)) && !S.packHasContent(S.packFor({}, FK)));
// 깨진 항목은 받지 않는다
S.mergePackIntoState(st, FK, { items: [{ id: 'bad', type: '거더', x: 'x', y: 1, w: 1, h: 1 }], deletedIds: [], deletedAt: {} }, mergeFn);
assert.ok(!S.listFor(st, FK).some((d) => d.id === 'bad'));

// ---- 앱 배선 ----
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(app.includes('structMembers: (window.BSA && window.BSA.structMembers) ? window.BSA.structMembers.packFor(window.state, floorKey)'), '층 묶음에 싣기');
assert.ok(app.includes('window.BSA.structMembers.mergePackIntoState(window.state, floorKey, bundle.structMembers'), '층 묶음에서 받기');
assert.ok(app.includes('window.BSA.structMembers.packHasContent(bundle.structMembers)'), '부재만 있는 층도 올린다');
assert.ok(app.includes('structMembers: window.state.structMembers || {}'), '기기 저장');
assert.ok(app.includes("if (parsed.structMembers && typeof parsed.structMembers === 'object') window.state.structMembers = parsed.structMembers;"), '기기에서 불러오기');
assert.ok(app.includes('window.state.structMembers = {};'), '건물 바꿀 때 비우기');
assert.ok(html.indexOf('js/core/struct-members.js') > 0 && html.indexOf('js/core/struct-members.js') < html.indexOf('src="app.js'), '자료 모듈은 app.js 앞에');
assert.ok(/id="btnStructLayer"/.test(html), '도구 패널 단추');
// 화면 코드는 쓸 때만 불러온다(index.html에 스크립트 태그가 없다)
assert.ok(!/struct-layer\.js/.test(html), '화면 코드는 index.html에 싣지 않는다');
assert.ok(app.includes("s.src = 'js/tabs/struct-layer.js?v=' + encodeURIComponent(window.BSA_APP_VERSION || '');"), '쓸 때 불러오기');
assert.ok(fs.existsSync(path.join(root, 'js', 'tabs', 'struct-layer.js')));
// 화면 전용: 캔버스 그리기·출력 함수에서 structMembers를 읽지 않는다
const uses = app.split('\n').filter((ln) => /structMembers/.test(ln) && /ctx\.|hwp|Hwp|pdf|Pdf|xlsx|Excel/.test(ln));
assert.deepStrictEqual(uses, [], '출력·캔버스에서 구조 부재를 읽지 않는다');
// 화면 코드는 DOM(SVG)으로만 그린다
const layer = fs.readFileSync(path.join(root, 'js', 'tabs', 'struct-layer.js'), 'utf8');
assert.ok(!/getContext\(/.test(layer) && /data-html2canvas-ignore/.test(layer), 'SVG로만 그리고 화면 캡처에서도 뺀다');
// 구조도 페이지 → 앱 넘기기 열쇠가 양쪽에서 같다
const pageJs = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
// 구조도 그림이 커서 localStorage가 아니라 IndexedDB로 넘긴다(같은 모듈의 saveHandoff/loadHandoff)
assert.ok(pageJs.includes('window.BSA.structMembers.saveHandoff(data)') && layer.includes('api.loadHandoff()'));
assert.ok(!/localStorage\.setItem\('bsa_struct_handoff'/.test(pageJs), '그림을 localStorage에 넣지 않는다');
assert.ok(/js\/core\/struct-members\.js/.test(fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8')), '구조도 페이지도 넘기기 모듈을 싣는다');
// 구조도 그림은 이 건물 회차 폴더의 floorDrawings 로 올린다(저장소 규칙을 바꾸지 않는다)
assert.ok(app.includes("SA.companyScopedAssetPath(companyId, 'floorDrawings', `struct_${bId}_${fc}_${Date.now()}`, 'png', storageScopeForBuildingId(bId))"));
assert.ok(app.includes('structOverlays: window.state.structOverlays || {}') && app.includes('window.state.structOverlays = {};'));

// ---- 구조도 그림 ----
const so = {};
const FIT = { a: 2, b: 0, tx: 10, ty: 20 };
assert.strictEqual(S.overlayFor(so, FK), null);
assert.strictEqual(S.setOverlay(so, FK, { url: '', x0: 0, y0: 0, x1: 10, y1: 10, fit: FIT }), null, '주소 없으면 안 둔다');
assert.strictEqual(S.setOverlay(so, FK, { url: 'https://x/a.png', x0: 5, y0: 0, x1: 5, y1: 10, fit: FIT }), null, '넓이 없으면 안 둔다');
const o1 = S.setOverlay(so, FK, { url: 'https://x/a.png', storagePath: 'p/a.png', x0: 0, y0: 0, x1: 300, y1: 200, fit: FIT, color: '#2563eb' }, 100);
assert.ok(o1 && S.overlayFor(so, FK).url === 'https://x/a.png' && o1.updatedAt === 100);
const o2 = S.setOverlay(so, FK, { url: 'https://x/b.png', x0: 0, y0: 0, x1: 300, y1: 200, fit: FIT }, 50);
assert.strictEqual(o2.updatedAt, 101, '시각은 앞으로만 간다');
// 층 묶음: 그림만 있는 층도 올린다
const opack = S.packFor(so, FK);
assert.ok(S.packHasContent(opack) && opack.overlay.url === 'https://x/b.png');
const so2 = {};
S.mergePackIntoState(so2, FK, opack, mergeFn);
assert.strictEqual(S.overlayFor(so2, FK).url, 'https://x/b.png', '다른 기기에 그림 주소가 간다');
// 늦게 바꾼 쪽이 이긴다 · 뺀 것도 다른 기기에 간다
S.mergePackIntoState(so2, FK, { items: [], deletedIds: [], deletedAt: {}, overlay: Object.assign({}, opack.overlay, { url: 'https://x/old.png', updatedAt: 1 }) }, mergeFn);
assert.strictEqual(S.overlayFor(so2, FK).url, 'https://x/b.png', '옛 그림이 새 그림을 덮지 않는다');
assert.ok(S.removeOverlay(so, FK, 200));
assert.strictEqual(S.overlayFor(so, FK), null);
S.mergePackIntoState(so2, FK, S.packFor(so, FK), mergeFn);
assert.strictEqual(S.overlayFor(so2, FK), null, '뺀 그림은 다른 기기에서도 빠진다');
// 깨진 그림 정보는 받지 않는다
S.mergePackIntoState(so2, 'b1_9F', { items: [], deletedIds: [], deletedAt: {}, overlay: { url: 'u', x0: 'a', updatedAt: 9 } }, mergeFn);
assert.strictEqual(S.overlayFor(so2, 'b1_9F'), null);
// 그림 레이어: 번호표는 그림이 있으면 기본으로 숨기고, 그림은 기준점 맞춤 행렬로 얹는다
// 기둥·거더·빔 도형은 늘 그리고(그림이 있어도), 「이름」 단추는 이름표 글자만 켜고 끈다(기본 숨김)
assert.ok(layer.includes("function marksOn() { return pref(MARKS_KEY, '') === '1'; }"));
assert.ok(layer.includes('            items.forEach(function (d) {') && layer.includes('if (showLabels && d.label) {'));
assert.ok(!layer.includes('if (showMarks) items.forEach'), '그림이 있다고 도형을 숨기지 않는다');
// 도형만 가져오면 예전 그림은 뺀다
assert.ok(layer.includes('if (hadOverlay && api.removeOverlay(state(), floorKey) && hadOverlay.storagePath) B.deleteStoragePath(hadOverlay.storagePath);'));
assert.ok(layer.includes("'matrix(' + [over.fit.a, over.fit.b, -over.fit.b, over.fit.a, over.fit.tx, over.fit.ty].join(' ') + ')'"));

// ---- 되돌리기·다시 하기(applyRecord): 바뀐 부재만 기록한 모습으로 맞춘다 ----
{
    const su = {};
    const su2 = {};
    const p = S.add(su, FK, { type: '기둥', label: 'C1', x: 10, y: 10, w: 12, h: 12 }, { now: 100 });
    const before = Object.assign({}, p);
    S.update(su, FK, p.id, { x: 50, type: '벽' }, 200);
    const after = Object.assign({}, S.listFor(su, FK)[0]);
    // 옮기기·종류 바꾸기 되돌리기 → 다시 하기
    assert.ok(S.applyRecord(su, FK, p.id, before, 300));
    let cur = S.listFor(su, FK)[0];
    assert.ok(cur.x === 10 && cur.type === '기둥' && cur.label === 'C1' && cur.updatedAt === 300, '되돌린 것도 새 시각(다른 기기에 퍼진다)');
    assert.ok(S.applyRecord(su, FK, p.id, after, 400));
    assert.ok(S.listFor(su, FK)[0].x === 50 && S.listFor(su, FK)[0].type === '벽');
    // 지우기 되돌리기: 같은 id로 되살아나고 묘비가 걷힌다 → 합쳐도 살아 있다
    const rm = S.remove(su, FK, p.id);
    assert.strictEqual(S.listFor(su, FK).length, 0);
    S.mergePackIntoState(su2, FK, S.packFor(su, FK), mergeFn);
    assert.ok(S.applyRecord(su, FK, p.id, rm, 500));
    cur = S.listFor(su, FK);
    assert.ok(cur.length === 1 && cur[0].id === p.id && cur[0].createdAt === 100, '같은 id·처음 만든 시각으로 되살린다');
    assert.ok(!(su.deletedStructMemberIds[FK] || []).includes(p.id), '묘비가 걷힌다');
    S.mergePackIntoState(su2, FK, S.packFor(su, FK), mergeFn);
    assert.strictEqual(S.listFor(su2, FK).length, 1, '되살린 부재가 지운 것을 받은 기기에서도 살아난다');
    // 추가 되돌리기(rec=null) = 지우기, 없는 것을 지우면 false
    assert.ok(S.applyRecord(su, FK, p.id, null, 600));
    assert.strictEqual(S.listFor(su, FK).length, 0);
    assert.strictEqual(S.applyRecord(su, FK, p.id, null, 700), false);
    // 그 사이 다른 기기에서 들어온 부재는 건드리지 않는다
    const other = S.add(su, FK, { type: '빔', x: 1, y: 1, w: 4, h: 2 }, { now: 800 });
    S.applyRecord(su, FK, p.id, before, 900);
    assert.ok(S.listFor(su, FK).some((d) => d.id === other.id), '다른 부재는 그대로');
}
// 화면: 편집 중 Ctrl+Z/Y는 구조 부재가 받고(결함 되돌리기로 안 넘김), 가져오기는 그 층 기록을 버린다
assert.ok(layer.includes("if (isZ && !e.shiftKey) undo(); else redo();"));
assert.ok(layer.includes("e.code === 'KeyZ'"), '한글 입력 상태에서도 Ctrl+Z');
assert.ok(layer.includes('if (ui.hist) delete ui.hist[floorKey];'));

// ---- 지금은 기둥·거더·빔만(벽·슬래브는 우선 뺌), 색: 기둥 빨강 · 거더 파랑 · 빔 황토 ----
assert.deepStrictEqual(S.ACTIVE_TYPES, ['기둥', '거더', '빔']);
assert.ok(S.TYPES.includes('벽') && S.TYPES.includes('슬래브'), '예전 벽·슬래브 자료도 깨지지 않게 저장 종류는 그대로');
assert.strictEqual(S.COLORS['기둥'], '#dc2626');
assert.strictEqual(S.COLORS['거더'], '#2563eb');
assert.strictEqual(S.COLORS['빔'], '#b7791f');
assert.ok(layer.includes('function list() { return api.listFor(state(), B.floorKey()).filter(active); }'), '화면은 세 종류만');
assert.ok(layer.includes('(d.members || []).filter(active)'), '가져올 때도 세 종류만');
{
    const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
    const html = fs.readFileSync(path.join(root, 'struct-plan.html'), 'utf8');
    assert.ok(page.includes("var USE_TYPES = ['기둥', '거더', '빔'];"));
    assert.ok(page.includes("'빔': '#b7791f'"), '페이지와 앱 색이 같다');
    assert.ok(!/<option value="(벽|슬래브)">/.test(html), '종류 바꾸기에 벽·슬래브 없음');
}

// ---- 거더·빔 두께 통일: 종류마다 중간값 두께, 길이·중심·방향은 그대로, 기둥은 그대로 ----
{
    const ms = [
        { type: '거더', x: 50, y: 10, w: 100, h: 2.9 }, { type: '거더', x: 50, y: 60, w: 100, h: 3.6 }, { type: '거더', x: 10, y: 50, w: 2.9, h: 80 },
        { type: '빔', x: 30, y: 30, w: 60, h: 1.4 }, { type: '빔', x: 70, y: 40, w: 2.2, h: 50 }, { type: '빔', x: 80, y: 40, w: 1.4, h: 50 },
        { type: '기둥', x: 0, y: 0, w: 4, h: 3.5 }
    ];
    assert.deepStrictEqual(Object.assign({}, S.beamThickness(ms)), { '거더': 2.9, '빔': 1.4 });
    const u = S.unifyThickness(ms);
    assert.ok(u.filter((d) => d.type === '거더').every((d) => Math.min(d.w, d.h) === 2.9), '거더는 모두 2.9');
    assert.ok(u.filter((d) => d.type === '빔').every((d) => Math.min(d.w, d.h) === 1.4), '빔은 모두 1.4');
    assert.ok(u[1].w === 100 && u[1].x === 50 && u[1].y === 60, '길이·중심 그대로(가로)');
    assert.ok(u[4].h === 50 && u[4].w === 1.4, '세로 보는 폭만 바뀐다');
    assert.deepStrictEqual(u[6], ms[6], '기둥은 그대로');
    assert.strictEqual(ms[1].h, 3.6, '원본은 안 바꾼다(사본)');
}
// 화면: 종류 바꾸면 그 종류 두께, 새로 넣는 보는 가로 막대(통일 두께)
assert.ok(layer.includes('api.update(state(), B.floorKey(), ui.selId, patchForType(cur, t))'));
assert.ok(layer.includes('return { w: Math.max(len, thick * 3), h: thick };'));
{
    const page = fs.readFileSync(path.join(root, 'js', 'struct-plan-page.js'), 'utf8');
    assert.ok(page.includes('st.members = unifyBeams(clone(st.shapes.members));'), '페이지: 읽은 보 두께 통일');
    assert.strictEqual((page.match(/st\.members = unifyBeams\(st\.members\);/g) || []).length, 2, '페이지: 종류 바꾸면 다시 통일');
}

// ---- 거더·빔은 시작→끝 두 번 눌러 추가(기둥에 붙어 면에서 면까지), 추가 중엔 기둥을 눌러도 고르지 않음 ----
assert.ok(layer.includes('if (isLineType(ui.addType)) { addLinePoint(p, pad); return; }'));
assert.ok(layer.includes("if (hit.type === '기둥') return { id: hit.id, x: hit.x, y: hit.y, hx: hit.w / 2, hy: hit.h / 2, on: '기둥' };"), '기둥 중심에 붙는다');
assert.ok(layer.includes('var from = horiz ? lo.x + lo.hx : lo.y + lo.hy, to = horiz ? hi.x - hi.hx : hi.y - hi.hy;'), '기둥 면에서 면까지');
assert.ok(layer.includes("if (ui.pend) { ui.pend = null; ui.builtSig = ''; sync(); }"), 'Esc로 시작 점 취소');
// ---- 고른 거더·빔은 끝 손잡이를 끌어 늘이고 줄인다(반대 끝 고정, 기둥·거더 면에 붙음, 뒤집히지 않음) ----
assert.ok(layer.includes('var endGrab = grabEnd(p, pad);'));
assert.ok(layer.includes("if (dr.mode === 'end') Object.assign(d, stretchTo(dr, dr.horiz ? p.x : p.y));"));
assert.ok(layer.includes("var sp = snapPoint(pe, padE, d.type, d.id);"), '놓을 때 기둥·거더 면에 붙임(자기 자신 빼고)');
assert.ok(layer.includes("var lo = dr.which === 'e' ? dr.fixed : Math.min(at, dr.fixed - dr.minLen);"), '반대 끝을 넘어가도 뒤집히지 않음');

console.log('test-struct-members: ok');
