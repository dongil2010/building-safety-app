'use strict';
// 2026-10-16 층 동기화 덮어쓰기 방지: 상태 가리기·버전 재확인·사라짐 감지 + 실제 병합(sync-merge)과 함께
const assert = require('assert');
const path = require('path');
const G = require(path.join(__dirname, '..', 'js', 'core', 'floor-sync-guard.js'));
const SM = require(path.join(__dirname, '..', 'js', 'core', 'sync-merge.js'));

(async () => {
    // 1) 문서 상태
    assert.strictEqual(G.classifyFloorSnap(false, null), 'missing');
    assert.strictEqual(G.classifyFloorSnap(true, { chunkStatus: 'uploading' }), 'busy');
    assert.strictEqual(G.classifyFloorSnap(true, { chunkStatus: 'failed' }), 'busy');
    assert.strictEqual(G.classifyFloorSnap(true, { chunkStatus: 'ready' }), 'ready');
    assert.strictEqual(G.classifyFloorSnap(true, { dataUrl: 'x' }), 'ready');
    assert.strictEqual(G.revOf({}), 0);                 // 옛 문서 호환
    assert.strictEqual(G.revOf({ syncRev: 7 }), 7);

    // 2) 실데이터에 가까운 병합: 오프라인 기기(A)가 B1/B2를 들고 있고, 그동안 다른 기기가 B3 추가·B2 수정·B4 삭제
    const T0 = 1760500000000;
    const serverItems = [
        { id: 'B1', no: 'NO.01', defectType: '균열', updatedAt: T0, contentUpdatedAt: T0 },
        { id: 'B2', no: 'NO.02', defectType: '누수', size: '0.3x2.0', updatedAt: T0 + 5000, contentUpdatedAt: T0 + 5000 },
        { id: 'B3', no: 'NO.03', defectType: '백태', updatedAt: T0 + 6000, contentUpdatedAt: T0 + 6000 }
    ];
    const serverDeleted = ['B4'];
    const serverDeletedAt = { B4: T0 + 100 };
    const localItems = [
        { id: 'B1', no: 'NO.01', defectType: '균열', size: '0.2x1.0', updatedAt: T0 + 9000, contentUpdatedAt: T0 + 9000 }, // 오프라인 수정
        { id: 'B2', no: 'NO.02', defectType: '누수', updatedAt: T0, contentUpdatedAt: T0 },
        { id: 'B4', no: 'NO.04', defectType: '파손', updatedAt: T0, contentUpdatedAt: T0 },   // 서버에서 지워진 것
        { id: 'A9', no: 'NO.05', defectType: '균열', updatedAt: T0 + 9500, contentUpdatedAt: T0 + 9500 } // 오프라인 신규
    ];
    const K = 'b1_1F';
    const m = SM.mergeDefectsMaps({ [K]: serverItems }, { [K]: localItems }, { [K]: serverDeleted }, {}, { [K]: serverDeletedAt }, {});
    const ids = m.defects[K].map((d) => d.id).sort();
    assert.deepStrictEqual(ids, ['A9', 'B1', 'B2', 'B3']);          // B3(남의 추가) 유지, B4(서버 삭제) 안 살아남
    const b1 = m.defects[K].find((d) => d.id === 'B1');
    const b2 = m.defects[K].find((d) => d.id === 'B2');
    assert.strictEqual(b1.size, '0.2x1.0');                            // 내 오프라인 수정(더 나중)
    assert.strictEqual(b2.size, '0.3x2.0');                            // 남의 수정(더 나중) 유지
    assert.deepStrictEqual(G.lostServerIds(serverItems, m.defects[K], m.deletedDefectIds[K]), []);

    // 3) 위험 A 재현: 서버를 못 읽었는데 빈 층으로 보고 합쳤다면 B3가 묘비 없이 사라진다 → 감지됨
    const bad = SM.mergeDefectsMaps({ [K]: [] }, { [K]: localItems }, {}, {}, {}, {});
    assert.deepStrictEqual(G.lostServerIds(serverItems, bad.defects[K], []), ['B3']);

    // 4) 버전 재확인 시나리오(모킹)
    let server = { rev: 3, busy: false };
    let rereads = 0;
    let r = await G.confirmRevBeforeWrite(3, async () => server, async () => { rereads++; return server.rev; }, 3);
    assert.deepStrictEqual(r, { ok: true, rev: 3 }); assert.strictEqual(rereads, 0);
    // 읽은 뒤 다른 기기가 씀 → 한 번 다시 읽고 통과
    server = { rev: 4, busy: false }; rereads = 0;
    r = await G.confirmRevBeforeWrite(3, async () => server, async () => { rereads++; return 4; }, 3);
    assert.deepStrictEqual(r, { ok: true, rev: 4 }); assert.strictEqual(rereads, 1);
    // 계속 바뀜 → 이번엔 안 씀
    let n = 10;
    r = await G.confirmRevBeforeWrite(3, async () => ({ rev: ++n }), async () => n, 3);
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'changed-repeatedly');
    // 다른 기기가 쓰는 중(busy) → 기다렸다 다시 읽음, 끝나면 통과
    let calls = 0;
    r = await G.confirmRevBeforeWrite(5, async () => (++calls === 1 ? { rev: 6, busy: true } : { rev: 6, busy: false }), async () => 6, 3);
    assert.deepStrictEqual(r, { ok: true, rev: 6 });
    // 다시 읽기 실패(서버 못 읽음) → 안 씀
    r = await G.confirmRevBeforeWrite(1, async () => ({ rev: 2 }), async () => { throw new Error('offline'); }, 3);
    assert.deepStrictEqual(r, { ok: false, reason: 'reread-failed' });
    // 확인 자체 실패 → 안 씀
    r = await G.confirmRevBeforeWrite(1, async () => { throw new Error('net'); }, async () => 1, 3);
    assert.deepStrictEqual(r, { ok: false, reason: 'check-failed' });
    console.log('test-floor-sync-guard: ok');
})().catch((e) => { console.error(e); process.exit(1); });
