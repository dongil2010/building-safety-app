'use strict';
// 2026-10-19 「여러대 동시에 해도 안꼬이게」 — 두 기기가 오프라인에서 같은/다른 마킹·사진을 고친 뒤 함께 다시 연결.
// 실제 병합(sync-merge 칸별 병합·묘비)과 floor-sync-guard(syncRev 확인)로 서버 층 하나에 번갈아 올린다.
// 확인: ① 서로의 변경을 덮지 않음 ② 진행률은 기기마다 자기 변경만 셈 ③ 서버 확인 뒤에만 「올라감」
const assert = require('assert');
const path = require('path');
const root = path.join(__dirname, '..');
const SM = require(path.join(root, 'js', 'core', 'sync-merge.js'));
const guard = require(path.join(root, 'js', 'core', 'floor-sync-guard.js'));
const SP = require(path.join(root, 'js', 'core', 'sync-progress.js'));

const FK = 'b1_1F';
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---- 가짜 서버 층 문서(쓰면 syncRev +1, 기기 쓰기와 같은 모양) ----
const server = {
    rev: 0,
    pack: { items: [], deletedIds: [], deletedAt: {} },
    storage: new Set(),   // 사진 Storage
    writes: 0
};
function serverRead() { return { rev: server.rev, pack: clone(server.pack) }; }
function serverWrite(pack) { server.pack = clone(pack); server.rev += 1; server.writes += 1; }

function memStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
}

function makeDevice(name) {
    const dev = {
        name,
        defects: { [FK]: [] },
        deletedDefectIds: {},
        deletedDefectAt: {},
        dirty: new Set(),
        localPhotos: new Map(),
        journal: SP.createTracker({ storage: memStorage(), storageKey: () => 'bsa_sync_journal_v1_c1' }),
        readRev: null
    };
    const find = (id) => dev.defects[FK].find((d) => d.id === id);
    dev.find = find;
    dev.editContent = (id, field, value, t) => {
        const d = find(id);
        d[field] = value;
        if (!d.fieldAt) { d.fieldAt = {}; d.contentBaseAt = d.contentUpdatedAt || 0; }
        d.fieldAt[field] = t;
        d.fieldAtThrough = t;
        d.contentUpdatedAt = t;
        d.updatedAt = t;
        dev.dirty.add(FK);
        dev.journal.record('edit', id, FK);
    };
    dev.move = (id, x, y, t) => {
        const d = find(id);
        d.x = x; d.y = y; d.positionUpdatedAt = t; d.updatedAt = Math.max(d.updatedAt || 0, t);
        dev.dirty.add(FK);
        dev.journal.record('move', id, FK);
    };
    dev.addPhoto = (id, pid, t) => {
        const d = find(id);
        d.photoIds = (d.photoIds || []).concat([pid]);
        d.photos = (d.photos || []).concat(['data:image/jpeg;base64,' + pid]);
        d.photoState = Object.assign({}, d.photoState || {}, { [pid]: -t });
        d.photosUpdatedAt = t;
        dev.localPhotos.set(pid, 'data:' + pid);
        dev.dirty.add(FK);
        dev.journal.record('photo', pid, FK);
    };
    dev.addMarking = (rec) => {
        dev.defects[FK].push(Object.assign({ updatedAt: rec.t, contentUpdatedAt: rec.t, positionUpdatedAt: rec.t }, rec));
        dev.dirty.add(FK);
        dev.journal.record('add', rec.id, FK);
    };
    dev.remove = (id, t) => {
        dev.defects[FK] = dev.defects[FK].filter((d) => d.id !== id);
        dev.deletedDefectIds[FK] = (dev.deletedDefectIds[FK] || []).concat([id]);
        dev.deletedDefectAt[FK] = Object.assign({}, dev.deletedDefectAt[FK] || {}, { [id]: t });
        dev.dirty.add(FK);
        dev.journal.record('del', id, FK);
    };
    dev.mergeFrom = (pack) => {
        const r = SM.mergeDefectsMaps(
            { [FK]: pack.items }, dev.defects,
            { [FK]: pack.deletedIds }, dev.deletedDefectIds,
            { [FK]: pack.deletedAt }, dev.deletedDefectAt
        );
        dev.defects = r.defects;
        dev.deletedDefectIds = r.deletedDefectIds;
        dev.deletedDefectAt = r.deletedDefectAt || {};
        if (!dev.defects[FK]) dev.defects[FK] = [];
    };
    // 동기화 1단계: 사진 Storage 올리기 + 서버 층 읽어 합치기 (app.js syncStateToFirebase 순서)
    dev.syncRead = () => {
        dev.journal.startSession(Array.from(dev.dirty));
        dev.localPhotos.forEach((_v, pid) => {
            if (!server.storage.has(pid)) server.storage.add(pid);
            dev.journal.confirmPhoto(pid);   // markPhotoOnStorage 자리
        });
        const r = serverRead();
        dev.readRev = r.rev;
        dev.mergeFrom(r.pack);
    };
    // 2단계: 쓰기 직전 syncRev 확인(바뀌었으면 다시 읽어 합침) → 층 묶음 쓰기 → 서버 확인 뒤 일지 정리
    dev.syncWrite = async (opts) => {
        if (!(opts && opts.skipGuard)) {
            const conf = await guard.confirmRevBeforeWrite(
                dev.readRev,
                async () => ({ rev: server.rev, busy: false }),
                async () => { const again = serverRead(); dev.mergeFrom(again.pack); return again.rev; },
                3
            );
            assert.ok(conf.ok, 'rev 확인 통과');
        }
        const seq = dev.journal.mark();
        const items = clone(dev.defects[FK]);
        const lost = guard.lostServerIds(server.pack.items, items, dev.deletedDefectIds[FK] || []);
        serverWrite({ items, deletedIds: dev.deletedDefectIds[FK] || [], deletedAt: dev.deletedDefectAt[FK] || {} });
        const res = dev.journal.confirmFloor(FK, seq, items.map((d) => d.id).concat(dev.deletedDefectIds[FK] || []));
        if (!res.remaining) dev.dirty.delete(FK);
        return { lost, res };
    };
    dev.summary = () => dev.journal.summary({ dirtyFloorKeys: Array.from(dev.dirty), online: true, syncing: false });
    return dev;
}

function baseServer() {
    server.rev = 3;
    server.pack = {
        items: [
            { id: 'D1', no: 1, defectType: '균열', memo: '', cause: '', x: 10, y: 10, updatedAt: 1, contentUpdatedAt: 1, positionUpdatedAt: 1 },
            { id: 'D2', no: 2, defectType: '박리', memo: '', cause: '', x: 20, y: 20, updatedAt: 1, contentUpdatedAt: 1, positionUpdatedAt: 1 },
            { id: 'D3', no: 3, defectType: '누수', memo: '', cause: '', x: 30, y: 30, updatedAt: 1, contentUpdatedAt: 1, positionUpdatedAt: 1 }
        ],
        deletedIds: [],
        deletedAt: {}
    };
    server.storage = new Set();
    server.writes = 0;
}

(async () => {
    // ===== 시나리오 1: 같은 마킹·다른 칸 + 다른 마킹 + 사진 + 새 마킹 + 삭제, 동시에 다시 연결 =====
    baseServer();
    const A = makeDevice('A');
    const B = makeDevice('B');
    A.mergeFrom(serverRead().pack);
    B.mergeFrom(serverRead().pack);

    // 오프라인 작업
    A.addPhoto('D1', 'D1_uA1', 100);
    A.editContent('D1', 'memo', 'A 메모', 110);         // 같은 마킹 D1 — A는 memo
    A.move('D2', 21, 22, 120);                            // D2 이동(먼저)
    A.addMarking({ id: 'NA', no: 4, defectType: '균열', x: 1, y: 1, t: 130 });
    A.remove('D3', 140);
    B.editContent('D1', 'cause', 'B 원인', 115);         // 같은 마킹 D1 — B는 cause
    B.move('D2', 25, 26, 200);                            // D2 이동(나중) → 이게 이김
    B.addPhoto('D2', 'D2_uB1', 210);
    B.addMarking({ id: 'NB', no: 4, defectType: '박리', x: 2, y: 2, t: 220 });

    // 진행률은 자기 것만
    let sa = A.summary();
    let sb = B.summary();
    const rowOf = (s, k) => s.rows.find((r) => r.kind === k) || { total: 0, done: 0, pending: 0 };
    assert.strictEqual(sa.pending, 5, 'A: 사진1·수정1·이동1·새마킹1·삭제1');
    assert.strictEqual(rowOf(sa, 'photo').pending, 1);
    assert.strictEqual(rowOf(sa, 'del').pending, 1);
    assert.strictEqual(sb.pending, 4, 'B: 수정1·이동1·사진1·새마킹1');

    // 동시에 연결: A 읽기 → B 읽기 → A 쓰기 → B 쓰기(서버가 바뀐 것을 알아채고 다시 읽어 합침)
    A.syncRead();
    B.syncRead();
    sa = A.summary();
    assert.strictEqual(rowOf(sa, 'photo').done, 1, '사진은 Storage 확인 뒤 올라감');
    assert.strictEqual(rowOf(sa, 'edit').done, 0, '층 쓰기 전에는 올라감 아님');
    const wa = await A.syncWrite();
    assert.deepStrictEqual(wa.lost, []);
    const revAfterA = server.rev;
    const wb = await B.syncWrite();
    assert.deepStrictEqual(wb.lost, [], 'B가 A 것을 묘비 없이 빼지 않음');
    assert.strictEqual(server.rev, revAfterA + 1);

    const final = server.pack;
    const byId = (id) => final.items.find((d) => d.id === id);
    assert.strictEqual(byId('D1').memo, 'A 메모', 'A의 D1 메모 유지');
    assert.strictEqual(byId('D1').cause, 'B 원인', 'B의 D1 원인 유지(칸별 병합)');
    assert.ok((byId('D1').photoIds || []).includes('D1_uA1'), 'A가 넣은 사진 유지');
    assert.deepStrictEqual([byId('D2').x, byId('D2').y], [25, 26], 'D2는 나중에 옮긴 B 위치');
    assert.ok((byId('D2').photoIds || []).includes('D2_uB1'), 'B가 넣은 사진 유지');
    assert.ok(byId('NA') && byId('NB'), '두 기기의 새 마킹 둘 다');
    assert.ok(!byId('D3') && final.deletedIds.includes('D3'), 'A가 지운 D3는 묘비로 지워짐(되살아나지 않음)');
    assert.ok(server.storage.has('D1_uA1') && server.storage.has('D2_uB1'));

    sa = A.summary();
    sb = B.summary();
    assert.strictEqual(sa.pending, 0);
    assert.strictEqual(sa.done, 5, 'A는 자기 변경 5건만 올라감으로 셈');
    assert.strictEqual(sb.pending, 0);
    assert.strictEqual(sb.done, 4, 'B는 자기 변경 4건만');
    assert.ok(sa.finishedAt > 0 && sb.finishedAt > 0, '모두 서버에 올라감');
    assert.strictEqual(SP.pillText(sa), '모두 서버에 올라감');

    // A가 다시 받아도 B 변경이 A 기기에 들어오고, A 진행률에는 안 잡힌다
    A.mergeFrom(serverRead().pack);
    assert.strictEqual(A.find('D2').x, 25);
    assert.strictEqual(A.summary().pending, 0, '다른 기기 변경을 받아도 내 「안 올라감」이 아님');

    // ===== 시나리오 2: rev 확인 없이 옛 읽기로 쓰면 덮어쓰기가 난다 — 확인이 실제로 막고 있는지 =====
    baseServer();
    const C = makeDevice('C');
    const D = makeDevice('D');
    C.mergeFrom(serverRead().pack);
    D.mergeFrom(serverRead().pack);
    C.addPhoto('D1', 'D1_uC1', 100);
    D.editContent('D3', 'memo', 'D 메모', 105);
    C.syncRead();
    D.syncRead();
    await C.syncWrite();
    await D.syncWrite({ skipGuard: true });
    assert.ok(!(server.pack.items.find((d) => d.id === 'D1').photoIds || []).includes('D1_uC1'),
        '대조군: 확인 없이 쓰면 C 사진이 사라짐(그래서 syncRev 확인이 필요)');

    // ===== 시나리오 3: 같은 칸을 둘 다 고침 → 나중 값, 업로드 중 또 고친 것은 남김 =====
    baseServer();
    const E = makeDevice('E');
    const F = makeDevice('F');
    E.mergeFrom(serverRead().pack);
    F.mergeFrom(serverRead().pack);
    E.editContent('D1', 'memo', 'E 먼저', 100);
    F.editContent('D1', 'memo', 'F 나중', 300);
    E.syncRead();
    F.syncRead();
    await F.syncWrite();
    // E: 층 묶음을 만든 뒤(=mark 뒤) 또 고침 → 이번 확인에서 빠지고 다시 올릴 대상
    const conf = await guard.confirmRevBeforeWrite(E.readRev, async () => ({ rev: server.rev }), async () => { const a = serverRead(); E.mergeFrom(a.pack); return a.rev; }, 3);
    assert.ok(conf.ok);
    const seqE = E.journal.mark();
    const packE = clone(E.defects[FK]);
    E.move('D1', 99, 99, 400);   // 업로드 중 이동
    serverWrite({ items: packE, deletedIds: [], deletedAt: {} });
    const rE = E.journal.confirmFloor(FK, seqE, packE.map((d) => d.id));
    assert.strictEqual(server.pack.items.find((d) => d.id === 'D1').memo, 'F 나중', '같은 칸은 나중 수정');
    assert.strictEqual(rE.confirmed, 1, 'E의 메모 수정은 올라감');
    assert.strictEqual(rE.remaining, 1, '업로드 중 이동은 아직 안 올라감 → 층을 다시 올림');
    assert.strictEqual(E.summary().pending, 1);
    assert.strictEqual(rowOf(E.summary(), 'move').pending, 1);

    console.log('test-sync-progress-multi-device: ok');
})().catch((e) => { console.error(e); process.exit(1); });
