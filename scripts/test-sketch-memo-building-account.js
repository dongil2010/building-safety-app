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
// 2026-10-20 회차 자리로 옮기기(원본 층 메모는 그대로 남김), 두 번 해도 같다
assert.strictEqual(sk.migrateFloorMemosToRound(st, 'B'), 4);
assert.strictEqual(sk.migrateFloorMemosToRound(st, 'B'), 0, '다시 해도 늘지 않음');
assert.strictEqual(sk.listFor(st, 'B_2F').length, 1, '원본 유지');
assert.strictEqual(sk.listFor(st, sk.roundKeyFor('B')).length, 4);
// 층을 지워도(층 자리 비움) 회차 메모는 그대로
delete st.sketchMemos.B_2F;
assert.strictEqual(sk.listForBuilding(st, 'B').length, 4, '층 삭제와 무관');
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
assert.strictEqual(sk.floorKeyOf(st, 'B', l1.id), 'B_ROUND_SKETCH_MEMO');
// 이름이 같아도 다른 계정이면 남
assert.strictEqual(sk.isMine(k1, { uid: 'u3', name: '김' }), false);
// 이전 메모를 이어 써도 작성자 그대로(app은 기존 메모에 by를 넘기지 않음)
const RK = sk.roundKeyFor('B');
const anonId = sk.listForBuilding(st, 'B').find((x) => !x.rec.by).rec.id;
sk.saveSheet(st, RK, { id: anonId, strokes: [line('old-anon'), line('add')], by: '' }, 600);
assert.strictEqual(sk.listFor(st, RK).find((r) => r.id === anonId).by, '');
// 옛 층 메모를 옛 앱이 나중에 이어 써도 회차 자리로 획이 합쳐진다, 회차에서 지운 메모는 되살리지 않는다
sk.saveSheet(st, 'B_1F', { id: l1.id, strokes: [line('l1'), line('late')], by: '이' }, 700);
assert.strictEqual(sk.migrateFloorMemosToRound(st, 'B'), 1);
assert.ok(sk.listFor(st, RK).find((r) => r.id === l1.id).strokes.some((x) => x.i === 'late'));
sk.deleteSheet(st, RK, l1.id);
assert.strictEqual(sk.migrateFloorMemosToRound(st, 'B'), 0, '묘비 존중');
sk.saveSheet(st, RK, { id: l1.id, strokes: [line('l1')], by: '이', byUid: 'u2' }, 800);

// 출력: 모든 계정, 작성자별, 이전 메모 맨 뒤
assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.label), ['김 메모-1', '김 메모-2', '이 메모-1', '이전 메모-1']);

// 두 계정이 동시에 써도 서로 덮지 않음(층 묶음 병합: 메모 id별·획 합집합)
const A = {}; const Bd = {};
sk.saveSheet(A, RK, { strokes: [line('a')], by: '김', byUid: 'u1' }, 1000);
sk.saveSheet(Bd, RK, { strokes: [line('b')], by: '이', byUid: 'u2' }, 1001);
sk.mergePackIntoState(A, RK, sk.packFor(Bd, RK), mergeFn);
sk.mergePackIntoState(Bd, RK, sk.packFor(A, RK), mergeFn);
assert.strictEqual(sk.listForBuilding(A, 'B').length, 2);
assert.strictEqual(sk.listForBuilding(Bd, 'B').length, 2);
assert.ok(sk.listForBuilding(A, 'B').some((x) => x.rec.byUid === 'u2'), '병합 후에도 계정 uid 유지');

// app.js 연결
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');
assert.ok(app.includes('sketchUi.floorKey = sketchKeyFor(rec && rec.id);') && app.includes('return api ? api.roundKeyFor(b) : \'\';'), '메모는 늘 회차 자리');
assert.ok(app.includes("codes.delete('ROUND_SKETCH_MEMO');"), '회차 메모 자리는 층 목록·회차 복제에 안 들어감');
assert.ok(app.includes('migrateSketchMemosForBuilding(sketchUi.bldgId);') && app.includes('await pullRoundSketchMemos(o.bldg);'), '열 때 옮기기, 출력 전 서버 받기');
assert.ok(app.includes("by: sketchUi.sheet.id ? '' : sketchMe().name, byUid: sketchUi.sheet.id ? '' : sketchMe().uid"), '작성자·계정은 새 메모에만');
assert.ok(app.includes('return api.outputGroups(st, bldg.id);'), '한글 출력은 작성자별');
console.log('test-sketch-memo-building-account: ok');
