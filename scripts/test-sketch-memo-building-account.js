'use strict';
// 2026-10-20 「메모는 층을 분류하지말고 그냥 통합이야 기본은 개인 계정별로 메모가 생기는거고 출력하면 각자 쓴것들이 나오는거지」
// - 건물 하나에 메모 한 묶음(층 구분 없음). 창에는 내 계정 메모(+작성자 모르는 이전 메모)만, 내 최근 메모부터.
// - 저장·동기화는 층 묶음 그대로(서버 형식·규칙 안 바뀜): 새 메모는 건물 첫 층, 고친 메모는 원래 층키. 계정 uid(byUid)도 실린다.
// - 옛 층별 메모: 작성자 이름이 있으면 그 사람 것(uid 없으면 이름으로 내 것 판단), 없으면 「이전 메모」. 옮기지 않으므로 잃는 것 없음.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sk = require(path.join(root, 'js', 'core', 'sketch-memo.js'));
const mergeFn = require(path.join(root, 'js', 'core', 'sync-merge.js')).mergeNdtDataMaps;
const line = (i) => ({ c: '#000', w: 3, p: [1, 1, 50, 5, 5, 50], i });
const KIM = { uid: 'u1', name: '김' };
const LEE = { uid: 'u2', name: '이' };

const st = {};
// 옛 층별 메모(작성자 이름만 / 작성자 없음)
sk.saveSheet(st, 'B_2F', { strokes: [line('old-kim')], by: '김' }, 100);
sk.saveSheet(st, 'B_3F', { strokes: [line('old-anon')] }, 200);
const k1 = sk.saveSheet(st, sk.homeFloorKey('B', ['1F', '2F'], '3F'), { strokes: [line('k1')], by: '김', byUid: 'u1' }, 300);
const l1 = sk.saveSheet(st, 'B_1F', { strokes: [line('l1')], by: '이', byUid: 'u2' }, 400);
sk.saveSheet(st, 'C_1F', { strokes: [line('other')], by: '김', byUid: 'u1' }, 500);
assert.strictEqual(sk.homeFloorKey('B', ['1F', '2F'], '3F'), 'B_1F');
assert.strictEqual(sk.homeFloorKey('B', [], '3F'), 'B_3F');
assert.strictEqual(k1.byUid, 'u1');
assert.ok(sk.packFor(st, 'B_1F').items.some((x) => x.byUid === 'u1'), '동기화 묶음에 계정 uid');

// 창 탭: 층 구분 없이 내 것 + 이전 메모
const tabs = sk.buildingTabs(st, 'B', KIM);
assert.deepStrictEqual(tabs.map((t) => t.label), ['메모-1', '이전 메모-1', '메모-2'], '김: 옛 이름 메모도 내 것, 남의 계정 메모는 안 보임');
assert.deepStrictEqual(sk.buildingTabs(st, 'B', LEE).map((t) => t.label), ['이전 메모-1', '메모-1']);
assert.strictEqual(sk.nextMineLabel(st, 'B', KIM), '메모-3');
assert.strictEqual(sk.pickInitialForBuilding(st, 'B', KIM).id, k1.id, '내 최근 메모');
assert.strictEqual(sk.pickInitialForBuilding(st, 'B', { uid: 'u9', name: '박' }), null, '내 메모가 없으면 새 종이');
assert.strictEqual(sk.floorKeyOf(st, 'B', l1.id), 'B_1F');
// 이름이 같아도 다른 계정이면 남
assert.strictEqual(sk.isMine(k1, { uid: 'u3', name: '김' }), false);
// 이전 메모를 이어 써도 작성자 그대로(app은 기존 메모에 by를 넘기지 않음)
const anonId = sk.listFor(st, 'B_3F')[0].id;
sk.saveSheet(st, 'B_3F', { id: anonId, strokes: [line('old-anon'), line('add')], by: '' }, 600);
assert.strictEqual(sk.listFor(st, 'B_3F')[0].by, '');

// 출력: 모든 계정, 작성자별, 이전 메모 맨 뒤
assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.label), ['김 메모-1', '김 메모-2', '이 메모-1', '이전 메모-1']);

// 두 계정이 동시에 써도 서로 덮지 않음(층 묶음 병합: 메모 id별·획 합집합)
const A = {}; const Bd = {};
sk.saveSheet(A, 'B_1F', { strokes: [line('a')], by: '김', byUid: 'u1' }, 1000);
sk.saveSheet(Bd, 'B_1F', { strokes: [line('b')], by: '이', byUid: 'u2' }, 1001);
sk.mergePackIntoState(A, 'B_1F', sk.packFor(Bd, 'B_1F'), mergeFn);
sk.mergePackIntoState(Bd, 'B_1F', sk.packFor(A, 'B_1F'), mergeFn);
assert.strictEqual(sk.listForBuilding(A, 'B').length, 2);
assert.strictEqual(sk.listForBuilding(Bd, 'B').length, 2);
assert.ok(sk.listForBuilding(A, 'B').some((x) => x.rec.byUid === 'u2'), '병합 후에도 계정 uid 유지');

// app.js 연결
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(app.includes('sketchUi.floorKey = sketchKeyFor(rec && rec.id);'), '고친 메모는 원래 층키, 새 메모는 기본 층');
assert.ok(app.includes("by: sketchUi.sheet.id ? '' : sketchMe().name, byUid: sketchUi.sheet.id ? '' : sketchMe().uid"), '작성자·계정은 새 메모에만');
assert.ok(app.includes('return api.outputGroups(st, bldg.id);'), '한글 출력은 작성자별');
console.log('test-sketch-memo-building-account: ok');
