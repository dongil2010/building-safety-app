#!/usr/bin/env node
'use strict';
/**
 * 2026-11-04 회사 루트 문서 1MB 초과 사고: 건물 목록을 조각(rootShards)으로 나눠 쓰고 붙여 읽는다.
 * 가짜 Firestore(문서 1MB 한도 흉내)로: 큰 목록 쓰기 성공·왕복 동일, 작은 문서는 예전 그대로,
 * 옛 칸 읽기 폴백, 구버전 기기가 쓴 칸과 합치기(건물 안 빠짐), 삭제 기록 합치기, 조각 못 읽을 때 엄격 모드 실패, 정리.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/core/root-doc-shards.js');
const ROOT = path.join(__dirname, '..');

const LIMIT = 1048576;
const DEL = { __delete: true };
function fsize(v) { // Firestore 크기 어림(문자열 UTF-8+1, 숫자 8, 필드명 포함)
    if (v === null || v === undefined) return 1;
    if (typeof v === 'string') return S.utf8Bytes(v) + 1;
    if (typeof v === 'number') return 8;
    if (typeof v === 'boolean') return 1;
    if (Array.isArray(v)) return v.reduce((n, x) => n + fsize(x), 0);
    return Object.keys(v).reduce((n, k) => n + S.utf8Bytes(k) + 1 + fsize(v[k]), 0);
}
function makeDb() {
    const docs = new Map();
    const ops = [];
    function ref(p) {
        return {
            path: p,
            collection: (c) => ({ doc: (id) => ref(p + '/' + c + '/' + id) }),
            async get() { return { exists: docs.has(p), data: () => JSON.parse(JSON.stringify(docs.get(p))) }; },
            async set(data, opt) {
                const prev = (opt && opt.merge && docs.get(p)) || {};
                const next = Object.assign({}, prev);
                Object.keys(data).forEach((k) => { if (data[k] === DEL) delete next[k]; else next[k] = JSON.parse(JSON.stringify(data[k])); });
                const sz = fsize(next) + S.utf8Bytes(p);
                if (sz > LIMIT) throw new Error(`Document '${p}' cannot be written because its size (${sz} bytes) exceeds the maximum allowed size of 1,048,576 bytes.`);
                docs.set(p, next); ops.push(['set', p]);
            },
            async delete() { docs.delete(p); ops.push(['delete', p]); }
        };
    }
    return { docs, ops, ref };
}
function building(i, extra) {
    return Object.assign({ id: 'b' + i, name: '건물 ' + i + ' 동', siteName: '현장 가나다 ' + (i % 30), metaUpdatedAt: 1000 + i,
        floors: Array.from({ length: 12 }, (_, k) => ({ code: (k + 1) + 'F', name: (k + 1) + '층 평면도 주차장 기계실' })),
        notes: '비고 메모 '.repeat(20), roundDone: { report: { done: true, at: 5, by: '정병수', doneAt: 5 } } }, extra || {});
}
const settings = { styleColors: { a: '#fff' }, floorGridLines: { k1: { xs: [1, 2, 3] } } };

(async () => {
    // 1) 작으면 예전 그대로(목차 없음)
    {
        S._cacheClear();
        const db = makeDb(); const root = db.ref('safety_app/c1');
        const data = { buildings: [building(1), building(2)], deletedBuildingIds: ['x'], grids: {} };
        const plan = await S.writeRootDoc(root, data, { serverRaw: {}, deleteSentinel: () => DEL });
        assert.strictEqual(plan.sharded, false);
        const raw = (await root.get()).data();
        assert.ok(Array.isArray(raw.buildings) && !raw.rootShards, '작은 문서는 예전 칸');
        const exp = await S.expandRootData(root, raw);
        assert.strictEqual(exp.buildings.length, 2);
    }
    // 2) 1MB 넘는 목록: 예전 방식은 실패, 나눠 쓰기는 성공 + 왕복 동일
    const big = Array.from({ length: 1500 }, (_, i) => building(i));
    assert.ok(S.jsonBytes(big) > LIMIT, '테스트 목록이 1MB 초과 ' + S.jsonBytes(big));
    {
        const db = makeDb(); const root = db.ref('safety_app/c2');
        await root.set(settings, { merge: true });
        await assert.rejects(root.set({ buildings: big }, { merge: true }), (e) => S.isDocTooLargeError(e), '예전 방식은 1MB 초과로 실패');
        S._cacheClear();
        const data = { buildings: big, deletedBuildingIds: ['gone1'], grids: { g: 1 }, updatedAt: { __serverTs: 1 } };
        const plan = await S.writeRootDoc(root, data, { serverRaw: (await root.get()).data(), deleteSentinel: () => DEL, now: 111, writeId: 'wA' });
        assert.strictEqual(plan.sharded, true);
        assert.ok(plan.parts.length >= 2, '여러 조각 ' + plan.parts.length);
        plan.parts.forEach((p) => assert.ok(S.utf8Bytes(p.data.p) <= S.PART_BYTES));
        const raw = (await root.get()).data();
        assert.ok(!raw.buildings && raw.rootShards && raw.rootShards.writeId === 'wA', '루트엔 목차만');
        assert.deepStrictEqual(raw.styleColors, settings.styleColors, '설정 칸은 그대로');
        // 조각을 쓴 뒤 목차를 마지막에
        const lastSet = db.ops.filter((o) => o[0] === 'set').pop();
        assert.strictEqual(lastSet[1], 'safety_app/c2');
        S._cacheClear();   // 다른 기기처럼 캐시 없이
        const exp = await S.expandRootData(root, raw, { strict: true });
        assert.deepStrictEqual(exp.buildings, JSON.parse(JSON.stringify(big)), '왕복 동일');
        assert.deepStrictEqual(exp.deletedBuildingIds, ['gone1']);

        // 3) 한 번 나눴으면 작아져도 계속 나눔 + 전전 조각 정리
        const p2 = await S.writeRootDoc(root, { buildings: big.slice(0, 3), deletedBuildingIds: ['gone1'] }, { serverRaw: (await root.get()).data(), deleteSentinel: () => DEL, writeId: 'wB' });
        assert.strictEqual(p2.sharded, true, '목차 있으면 계속');
        assert.deepStrictEqual(p2.deleteIds, [], '바로 전(wA) 조각은 남김');
        const p3 = await S.writeRootDoc(root, { buildings: big.slice(0, 2), deletedBuildingIds: [] }, { serverRaw: (await root.get()).data(), deleteSentinel: () => DEL, writeId: 'wC' });
        assert.ok(p3.deleteIds.length && p3.deleteIds.every((id) => id.startsWith('wA_')), '전전(wA) 조각 정리');
        assert.ok(!db.docs.has('safety_app/c2/rootShards/wA_0') && db.docs.has('safety_app/c2/rootShards/wB_0'));

        // 4) 구버전 기기가 루트에 옛 칸(buildings)을 다시 써도: 합쳐서 어느 건물도 빠지지 않음, 더 최근 수정이 이김
        await root.set({ buildings: [building(1, { name: '구버전이 고친 이름', metaUpdatedAt: 99999 }), building(5000)], deletedBuildingIds: ['old9'] }, { merge: true });
        S._cacheClear();
        const raw4 = (await root.get()).data();
        const exp4 = await S.expandRootData(root, raw4, { strict: true });
        const ids = exp4.buildings.map((b) => b.id);
        assert.ok(ids.includes('b0') && ids.includes('b1') && ids.includes('b5000'), '조각+옛 칸 합침');
        assert.strictEqual(exp4.buildings.find((b) => b.id === 'b1').name, '구버전이 고친 이름', 'metaUpdatedAt 큰 쪽');
        assert.deepStrictEqual(exp4.deletedBuildingIds.slice().sort(), ['old9'], '삭제 기록 합집합(조각 [] + 옛 칸)');
        // 다음 새 버전 쓰기는 합친 목록을 조각으로 쓰고 옛 칸을 지운다
        const merged = { buildings: exp4.buildings, deletedBuildingIds: exp4.deletedBuildingIds };
        await S.writeRootDoc(root, merged, { serverRaw: raw4, deleteSentinel: () => DEL, writeId: 'wD' });
        S._cacheClear();
        const raw5 = (await root.get()).data();
        assert.ok(!raw5.buildings && !raw5.deletedBuildingIds);
        const exp5 = await S.expandRootData(root, raw5, { strict: true });
        assert.ok(exp5.buildings.some((b) => b.id === 'b5000') && exp5.deletedBuildingIds.includes('old9'));

        // 5) 조각이 없어지면: 보통 읽기는 이전 목차 → 그것도 없으면 루트 칸만, 엄격(쓰기 전)은 실패
        S._cacheClear();
        await db.ref('safety_app/c2/rootShards/wD_0').delete();
        const soft = await S.expandRootData(root, raw5);
        assert.ok(Array.isArray(soft.buildings) && soft.buildings.length === 2, '이전 목차(wC)로');
        S._cacheClear();
        // 2026-11-10 서버가 답했는데 조각이 없으면(기다려도 안 생김) 엄격도 이전 목차로 이어 간다 — 영영 못 올리는 막힘 방지
        let dangling = 0;
        const healed = await S.expandRootData(root, raw5, { strict: true, onDangling: () => { dangling++; } });
        assert.ok(Array.isArray(healed.buildings) && healed.buildings.length === 2 && dangling === 1, '조각 없음 → 이전 목차(wC)로 이어 감');
        // 이어서 쓰면 새 목차·조각이 생겨 다음부터 정상
        await S.writeRootDoc(root, { buildings: healed.buildings, deletedBuildingIds: healed.deletedBuildingIds || [] }, { serverRaw: raw5, deleteSentinel: () => DEL, writeId: 'wE' });
        S._cacheClear();
        const raw6 = (await root.get()).data();
        const exp6 = await S.expandRootData(root, raw6, { strict: true });
        assert.strictEqual(exp6.buildings.length, 2, '다시 정상');
        // 읽기 자체가 실패(인터넷 등)하면 엄격은 그대로 실패
        S._cacheClear();
        const badRoot = { collection: () => ({ doc: () => ({ get: async () => { throw new Error('Failed to get document from server'); } }) }) };
        await assert.rejects(S.expandRootData(badRoot, raw6, { strict: true }), /ROOT_SHARDS_UNREADABLE/, '읽기 실패는 쓰지 않음');
    }
    // 6) 목차 없는 예전 데이터: 그대로
    {
        const raw = { buildings: [building(1)], deletedBuildingIds: ['z'] };
        assert.strictEqual(await S.expandRootData(makeDb().ref('x'), raw), raw);
    }
    // 7) 조각 나누기: 한글·이모지(서로게이트)도 바이트 한도 안에서, 이어 붙이면 원래대로
    {
        const s = ('가나다🙂abc').repeat(5000);
        const parts = S.splitUtf8(s, 1000);
        assert.strictEqual(parts.join(''), s);
        parts.forEach((p) => assert.ok(S.utf8Bytes(p) <= 1000));
        assert.ok(!parts.some((p) => /^[\uDC00-\uDFFF]/.test(p)), '서로게이트 안 자름');
    }
    // 8) 크기 오류 판별
    assert.ok(S.isDocTooLargeError({ message: "Document 'projects/p/databases/(default)/documents/safety_app/lv5' cannot be written because its size (1,048,588 bytes) exceeds the maximum allowed size of 1,048,576 bytes." }));
    assert.ok(!S.isDocTooLargeError({ code: 'permission-denied', message: 'Missing or insufficient permissions' }));

    // 9) 앱 연결
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(app.includes('.writeRootDoc(docRef, dataToSync'), '남은 공통 칸은 조각 경유'); // 나머지 앱 연결은 test-building-docs.js
    assert.ok(/js\/core\/root-doc-shards\.js\?v=/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
    assert.ok(/match \/rootShards\/\{shardId\} \{\s*allow read, write: if isCompanyMember\(companyId\);/.test(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8')), '규칙');
    console.log('test-root-doc-shards: ok');
})().catch((e) => { console.error(e); process.exit(1); });
