#!/usr/bin/env node
'use strict';
/**
 * 2026-10-27 「손글씨 메모도 서버에 올리면 다른 기기·계정에서 동기화돼 보이고, 먼저 동기화한 것이 1번, 나중 것은 2번…」
 * 합성 데이터만 쓴다(실제 데이터 접근 없음). 두 기기 · 오프라인 뒤 동기화 · 삭제 · 같은 번호 중복 없음 · 스케치 id/내용 보존.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunction } = require('./lib-extract-fn');

const root = path.join(__dirname, '..');
const sk = require(path.join(root, 'js', 'core', 'sketch-memo.js'));
const ma = require(path.join(root, 'js', 'core', 'memo-author-sync.js'));
const mergeFn = require(path.join(root, 'js', 'core', 'sync-merge.js')).mergeNdtDataMaps;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const line = (i) => ({ c: '#000', w: 3, e: 0, p: [1, 1, 50, 5, 5, 50], i });
const RK = sk.roundKeyFor('B');
const U1 = { uid: 'u1', name: '김' };
const U2 = { uid: 'u2', name: '이' };
const labels = (st, b) => sk.buildingTabs(st, b, U1).map((t) => t.label + ':' + t.id);

// ---- 1) assignSeq 규칙 ----
{
    let r = ma.assignSeq({}, [{ id: 'a1', createdAt: 5 }]);
    assert.deepStrictEqual(r.map, { a1: 1 }); assert.strictEqual(r.added, 1);
    r = ma.assignSeq(r.map, [{ id: 'a1', createdAt: 5 }, { id: 'b1', createdAt: 9 }]);
    assert.deepStrictEqual(r.map, { a1: 1, b1: 2 }, '이미 있는 번호는 그대로, 새 것은 다음 번호');
    r = ma.assignSeq(r.map, [{ id: 'a1' }, { id: 'b1' }, { id: 'a2', createdAt: 50 }, { id: 'a3', createdAt: 40 }]);
    assert.deepStrictEqual(r.map, { a1: 1, b1: 2, a3: 3, a2: 4 }, '한 번에 여러 장이면 만든 순서로 연속 번호');
    assert.strictEqual(ma.assignSeq(r.map, [{ id: 'a1' }]).added, 0, '번호 있는 것만 있으면 변화 없음');
    // 지운 장이 번호표에 남아 있어도 번호를 다시 쓰지 않는다
    assert.strictEqual(ma.assignSeq({ x: 7 }, [{ id: 'n', createdAt: 1 }]).map.n, 8);
    // 깨진 문서·이상한 값은 무시
    assert.deepStrictEqual(ma.parseSeqDoc({ payload: '{bad' }), {});
    assert.deepStrictEqual(ma.parseSeqDoc({ payload: JSON.stringify({ v: 1, seq: { a: 2, b: 'x', c: -1, d: 3.9 } }) }), { a: 2, d: 3 });
    assert.deepStrictEqual(ma.mergeSeq({ a: 1, z: 9 }, { a: 2, b: 3 }), { a: 2, z: 9, b: 3 }, '합칠 때 서버 번호 우선');
}

// ---- 2) 화면 번호: 번호표 순 → 번호 없는 것은 뒤 (스케치 id/내용 보존) ----
{
    const st = {};
    const s1 = sk.saveSheet(st, RK, { strokes: [line('s1')], by: '김', byUid: 'u1' }, 300);
    const s2 = sk.saveSheet(st, RK, { strokes: [line('s2')], by: '이', byUid: 'u2' }, 100);
    const s3 = sk.saveSheet(st, RK, { strokes: [line('s3')], by: '김', byUid: 'u1' }, 200);
    // 번호표 없음: 만든 순서(임시)
    let t = sk.buildingTabs(st, 'B', U1);
    assert.deepStrictEqual(t.map((x) => x.id), [s2.id, s3.id, s1.id]);
    assert.ok(t.every((x) => x.provisional), '번호표 없으면 모두 번호 미확정');
    // 번호표: s1=1(먼저 서버에 올라감), s2=2 → s3 은 미확정이라 맨 뒤(3)
    st.sketchSeq = { B: { [s1.id]: 1, [s2.id]: 2 } };
    t = sk.buildingTabs(st, 'B', U1);
    assert.deepStrictEqual(t.map((x) => x.label), ['메모-1', '메모-2', '메모-3']);
    assert.deepStrictEqual(t.map((x) => x.id), [s1.id, s2.id, s3.id]);
    assert.deepStrictEqual(t.map((x) => x.provisional), [false, false, true]);
    assert.deepStrictEqual(t.map((x) => x.mine), [true, false, true], '남의 계정 메모도 목록에 보이고, 내 것 표시');
    assert.strictEqual(sk.nextMineLabel(st, 'B', U1), '메모-4');
    // 내용·id 그대로
    assert.deepStrictEqual(sk.listForBuilding(st, 'B').find((x) => x.rec.id === s2.id).rec.strokes, [line('s2')]);
    // 출력: 같은 번호, 이름 없음, 번호는 창과 동일
    assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.label), ['메모-1', '메모-2', '메모-3']);
    // 빈 종이는 출력에서 뺀다(번호는 창과 같게 유지)
    const e = sk.saveSheet(st, RK, { strokes: [], by: '김', byUid: 'u1', title: '빈' }, 400); st.sketchSeq.B[e.id] = 4;
    // (빈 종이 e는 번호 4 → 번호 미확정 s3는 그 뒤. 출력은 빈 종이를 빼고 1부터 빠짐없이 이어 붙임, 창 번호는 no에)
    assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.label), ['메모-1', '메모-2', '메모-3']);
    assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.no), [1, 2, 4]);
    assert.deepStrictEqual(sk.outputGroups(st, 'B').map((x) => x.rec.id), [s1.id, s2.id, s3.id]);
    // 삭제 → 번호는 빈틈없이, 번호표는 안 건드림(번호 재사용 없음)
    sk.deleteSheet(st, RK, s1.id);
    assert.deepStrictEqual(sk.buildingTabs(st, 'B', U1).map((x) => x.label), ['메모-1', '메모-2', '메모-3']);
    assert.deepStrictEqual(sk.buildingTabs(st, 'B', U1).map((x) => x.id), [s2.id, e.id, s3.id]);
    assert.strictEqual(st.sketchSeq.B[s1.id], 1);
    // 삭제 권한
    assert.strictEqual(sk.canDelete(s2, U1), false, '남의 계정 메모는 지울 수 없음');
    assert.strictEqual(sk.canDelete(s3, U1), true);
    assert.strictEqual(sk.canDelete({ id: 'old' }, U1), true, '작성자 모르는 이전 메모는 지울 수 있음');
    assert.strictEqual(sk.canDelete({ id: 'x', byUid: 'u1' }, { uid: 'u3', name: '김' }), false, '이름이 같아도 다른 계정이면 남');
}

// ---- 3) 두 기기(두 계정) 시나리오: 계정별 문서로 올리고 받아서 같은 번호 ----
function device(me) { return { me, st: { sketchSeq: {} }, server: null }; }
const server = { docs: {}, seq: {} };
function push(dev) {   // pushMemosForBuilding 와 같은 순서(내 문서 병합→서버) + 번호표(트랜잭션)
    const local = ma.collectMine(dev.st, 'B', dev.me, 'ROUND_SKETCH_MEMO');
    const merged = ma.mergeDocs(server.docs[dev.me.uid] || null, local, ma.collectTombs(dev.st, 'B'));
    server.docs[dev.me.uid] = merged;
    applyPayload(dev, merged);
    pullSeq(dev, ensure(dev));
}
function ensure(dev) {
    const r = ma.assignSeq(server.seq, ma.sketchItems(dev.st, 'B', 'ROUND_SKETCH_MEMO'));
    if (r.added) server.seq = r.map;
    return server.seq;
}
function pullSeq(dev, map) { dev.st.sketchSeq.B = ma.mergeSeq(dev.st.sketchSeq.B, map); }
function applyPayload(dev, payload) {
    const P = ma.toPacks(payload, 'B', 'ROUND_SKETCH_MEMO', []);
    if (P.sketchPack.items.length || P.sketchPack.deletedIds.length) sk.mergePackIntoState(dev.st, P.sketchKey, P.sketchPack, mergeFn);
}
function pull(dev) {   // pullMemosForBuilding: 모든 계정 문서 + 번호표
    Object.keys(server.docs).forEach((uid) => applyPayload(dev, JSON.parse(JSON.stringify(server.docs[uid]))));
    pullSeq(dev, server.seq);
}
{
    const A = device(U1); const Bd = device(U2);
    // 기기 B가 먼저 올림(작성은 A가 더 일찍): 먼저 동기화한 B가 1번
    const a1 = sk.saveSheet(A.st, RK, { strokes: [line('a1')], by: '김', byUid: 'u1' }, 1000);        // A: 오프라인 작성(시각 1000)
    const b1 = sk.saveSheet(Bd.st, RK, { strokes: [line('b1')], by: '이', byUid: 'u2' }, 2000);
    push(Bd);                                                                                          // B 먼저 서버에
    assert.deepStrictEqual(Bd.st.sketchSeq.B, { [b1.id]: 1 });
    // A는 온라인 복귀: 올리기 전에 B의 메모를 받아 본다 → 아직 번호 미확정인 자기 것은 뒤
    pull(A);
    assert.deepStrictEqual(labels(A.st, 'B'), ['메모-1:' + b1.id, '메모-2:' + a1.id], 'A 화면에도 B 메모가 1번, 내 것은 번호 미확정 2');
    assert.strictEqual(sk.buildingTabs(A.st, 'B', U1)[1].provisional, true);
    push(A);                                                                                           // A 올림 → 2번
    assert.deepStrictEqual(server.seq, { [b1.id]: 1, [a1.id]: 2 }, '먼저 동기화한 B=1, 나중 A=2 (작성 시각과 무관)');
    // A가 한 장 더(1번 계정이 두 장) → 3번
    const a2 = sk.saveSheet(A.st, RK, { strokes: [line('a2')], by: '김', byUid: 'u1' }, 3000);
    push(A);
    assert.strictEqual(server.seq[a2.id], 3);
    // B 기기: 받으면 같은 번호·같은 순서
    pull(Bd);
    assert.deepStrictEqual(labels(Bd.st, 'B'), labels(A.st, 'B'), '두 기기 번호·순서가 같다');
    assert.deepStrictEqual(labels(A.st, 'B').map((x) => x.split(':')[0]), ['메모-1', '메모-2', '메모-3']);
    // 내용 보존
    [A, Bd].forEach((d) => {
        const m = {}; sk.listForBuilding(d.st, 'B').forEach((x) => { m[x.rec.id] = x.rec; });
        assert.deepStrictEqual(Object.keys(m).sort(), [a1.id, a2.id, b1.id].sort());
        assert.deepStrictEqual(m[b1.id].strokes, [line('b1')]); assert.deepStrictEqual(m[a1.id].strokes, [line('a1')]);
    });
    // 같은 번호 중복 없음
    assert.strictEqual(new Set(Object.values(server.seq)).size, Object.keys(server.seq).length);
    // 삭제(내 것): A가 a1 삭제 → 올리기 → B가 받으면 사라지고 번호는 빈틈없이
    sk.deleteSheet(A.st, RK, a1.id);
    push(A);
    pull(Bd);
    assert.deepStrictEqual(labels(Bd.st, 'B'), ['메모-1:' + b1.id, '메모-2:' + a2.id], '삭제 뒤에도 1부터 연속');
    assert.deepStrictEqual(labels(A.st, 'B'), labels(Bd.st, 'B'));
    // 삭제 뒤 새 메모는 번호표 최대값 다음(지운 번호 재사용 안 함)
    const b2 = sk.saveSheet(Bd.st, RK, { strokes: [line('b2')], by: '이', byUid: 'u2' }, 4000);
    push(Bd);
    assert.strictEqual(server.seq[b2.id], 4);
    pull(A);
    assert.deepStrictEqual(labels(A.st, 'B').map((x) => x.split(':')[0]), ['메모-1', '메모-2', '메모-3']);
}

// ---- 4) app.js: ensureSketchSeq 트랜잭션 (동시에 올려도 중복 번호 없음 · 건너뛰는 조건) ----
(async () => {
    const store = {};
    const refs = {};
    const lock = { p: Promise.resolve() };
    const db = {
        runTransaction(fn) {   // 직렬 트랜잭션(경합은 줄 세움)
            const run = lock.p.then(async () => {
                const writes = [];
                const tx = {
                    get: async (ref) => ({ exists: store[ref.id] !== undefined, data: () => store[ref.id] }),
                    set: (ref, data) => writes.push([ref.id, data])
                };
                await fn(tx);
                writes.forEach(([id, d]) => { store[id] = d; });
            });
            lock.p = run.catch(() => {});
            return run;
        }
    };
    const lsMem = {};
    function mkDevice(items, pendingIds) {
        const ctx = {
            console, JSON, Object, Array, Math, Number, String, Set, Promise, Date,
            navigator: { onLine: true },
            localStorage: { getItem: (k) => (k in lsMem ? lsMem[k] : null), setItem: (k, v) => { lsMem[k] = String(v); } },
            window: { state: { companyId: 'c', sketchMemos: { B_ROUND_SKETCH_MEMO: items } }, BSA: { memoAuthorSync: ma } },
            db, firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' } } },
            MEMO_ROUND_CODE: 'ROUND_SKETCH_MEMO',
            memoAuthorApi: () => ma,
            memoPendingRead: () => new Set(pendingIds || []),
            getFloorScopeRef: (_b, docId) => { refs[docId] = refs[docId] || { id: docId }; return refs[docId]; }
        };
        vm.createContext(ctx);
        vm.runInContext([
            'let _sketchSeqStore = null;',
            'const SKETCH_SEQ_LS = "bsa_sketch_seq_v1";',
            extractFunction(app, 'function sketchSeqStore('),
            extractFunction(app, 'function sketchSeqApply('),
            extractFunction(app, 'async function ensureSketchSeq('),
            'this.ensure = ensureSketchSeq; this.store = sketchSeqStore;'
        ].join('\n'), ctx);
        return ctx;
    }
    const bldg = { id: 'B' };
    const mk = (id, t) => ({ id, createdAt: t, strokes: [line(id)] });
    // 두 기기가 동시에 번호를 요청 — 중복 없이 1,2,3,4
    const d1 = mkDevice([mk('x1', 10), mk('x2', 20)]);
    const d2 = mkDevice([mk('y1', 5), mk('y2', 6)]);
    const [r1, r2] = await Promise.all([d1.ensure(bldg), d2.ensure(bldg)]);
    assert.strictEqual(r1 + r2, 4);
    const m = ma.parseSeqDoc(store.MEMOS_SEQ);
    assert.deepStrictEqual(Object.keys(m).sort(), ['x1', 'x2', 'y1', 'y2']);
    assert.deepStrictEqual(Object.values(m).sort(), [1, 2, 3, 4], '중복 번호 없음');
    assert.strictEqual(store.MEMOS_SEQ.kind, 'memoSeq');
    // 이미 번호 있는 것은 쓰기 없음(번호 안 바뀜)
    const before = JSON.stringify(store.MEMOS_SEQ);
    assert.strictEqual(await d1.ensure(bldg), 0);
    // 새 장은 다음 번호
    d1.window.state.sketchMemos.B_ROUND_SKETCH_MEMO.push(mk('x3', 30));
    assert.strictEqual(await d1.ensure(bldg), 1);
    assert.strictEqual(ma.parseSeqDoc(store.MEMOS_SEQ).x3, 5);
    assert.strictEqual(d1.store().B.x3, 5, '이 기기에도 번호 보관(오프라인에서도 같은 번호)');
    assert.ok(lsMem.bsa_sketch_seq_v1.includes('x3'), 'localStorage에 보관');
    // 올릴 것이 남은 건물은 건너뜀(먼저 올린 뒤 번호)
    const d3 = mkDevice([mk('z1', 1)], ['B']);
    assert.strictEqual(await d3.ensure(bldg), 0); assert.strictEqual(ma.parseSeqDoc(store.MEMOS_SEQ).z1, undefined);
    // 오프라인이면 건너뜀(에러 아님)
    const d4 = mkDevice([mk('w1', 1)]); d4.navigator.onLine = false;
    assert.strictEqual(await d4.ensure(bldg), 0);
    // 번호 문서가 이전에 다른 기기에서 쓰였으면 그 번호를 지킨다
    const d5 = mkDevice([mk('x1', 10), mk('v1', 99)]);
    assert.strictEqual(await d5.ensure(bldg), 1);
    assert.strictEqual(ma.parseSeqDoc(store.MEMOS_SEQ).x1, m.x1, '서버에 있던 번호 유지');
    assert.ok(before.length > 0);

    // ---- 연결 지점(app.js) ----
    assert.ok(/where\('kind', 'in', \[api\.KIND, api\.SEQ_KIND\]\)/.test(app), '받을 때 번호표 문서도 함께(읽기 1회)');
    assert.ok(/await memoWithTimeout\(pushMemosForBuilding\(bldg\), 45000, bldg\.id\);[\s\S]{0,400}ensureSketchSeq\(bldg\)/.test(app), '올린 뒤 번호표');
    assert.ok(/async function pullRoundSketchMemos\(bldg\) \{[\s\S]{0,900}pullMemosForBuilding\(bldg\)[\s\S]{0,300}ensureSketchSeq\(bldg\)/.test(app), '메모 창 열기·한글 출력·백업 전 받기(pullRoundSketchMemos)에 계정 문서+번호');
    assert.ok(app.includes('api.canDelete(cur, sketchMe())'), '남의 계정 메모 삭제 막기');
    assert.ok(app.includes('await pullRoundSketchMemos(owner.b);'), '한글 출력 전 받기(위 함수가 계정 문서+번호까지)');
    assert.ok(/sketchMemo\.seqStore = _sketchSeqStore/.test(app), '출력도 같은 번호표(손글씨 모듈 기본 번호표)');
    // 번호표를 기본값으로 꽂으면 st.sketchSeq 없이도 같은 순서
    const st2 = {}; const q1 = sk.saveSheet(st2, RK, { strokes: [line('q1')] }, 10); const q2 = sk.saveSheet(st2, RK, { strokes: [line('q2')] }, 20);
    sk.seqStore = { B: { [q2.id]: 1, [q1.id]: 2 } };
    assert.deepStrictEqual(sk.outputGroups(st2, 'B').map((x) => x.rec.id), [q2.id, q1.id], '기본 번호표 순서');
    sk.seqStore = null;
    console.log('test-sketch-seq-sync OK');
})().catch((e) => { console.error(e); process.exit(1); });
