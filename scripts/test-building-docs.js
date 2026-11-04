#!/usr/bin/env node
'use strict';
/**
 * 2026-11-04 회사 루트 문서 1MB 초과 → 건물마다 문서(buildingMeta/{id}) + 그 건물 층 설정.
 * 가짜 Firestore(문서 1MB 한도·merge·FieldPath·지우기 흉내)로 실제 모듈 코드(writeSplit·loadAll·expandView)를 돌린다.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('../js/core/root-doc-shards.js');
const B = require('../js/core/building-docs.js');
const ROOT = path.join(__dirname, '..');
const LIMIT = 1048576;
const DEL = { __delete: true };
class FP { constructor(...p) { this.p = p; } }
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function fsize(v) {
    if (v === null || v === undefined) return 1;
    if (typeof v === 'string') return S.utf8Bytes(v) + 1;
    if (typeof v === 'number') return 8;
    if (typeof v === 'boolean') return 1;
    if (Array.isArray(v)) return v.reduce((n, x) => n + fsize(x), 0);
    return Object.keys(v).reduce((n, k) => n + S.utf8Bytes(k) + 1 + fsize(v[k]), 0);
}
function deepMerge(dst, src) {
    Object.keys(src).forEach((k) => {
        const v = src[k];
        if (v === DEL) { delete dst[k]; return; }
        if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object' && !Array.isArray(dst[k])) { deepMerge(dst[k], v); return; }
        if (v && typeof v === 'object' && !Array.isArray(v)) { dst[k] = {}; deepMerge(dst[k], v); return; }
        dst[k] = clone(v);
    });
}
function makeDb() {
    const docs = new Map();
    const stats = { sets: 0, gets: 0, updates: 0, setPaths: [] };
    function check(p, next) { const sz = fsize(next) + S.utf8Bytes(p); if (sz > LIMIT) throw new Error(`Document '${p}' cannot be written because its size (${sz} bytes) exceeds the maximum allowed size of 1,048,576 bytes.`); }
    function ref(p) {
        return {
            path: p, id: p.split('/').pop(),
            collection: (c) => col(p + '/' + c),
            async get() { stats.gets++; return { exists: docs.has(p), id: p.split('/').pop(), data: () => clone(docs.get(p)) }; },
            async set(data, opt) {
                const next = (opt && opt.merge && docs.has(p)) ? clone(docs.get(p)) : {};
                deepMerge(next, data); check(p, next); docs.set(p, next); stats.sets++; stats.setPaths.push(p);
            },
            async update(...args) {
                if (!docs.has(p)) throw new Error('No document to update');
                const next = clone(docs.get(p));
                for (let i = 0; i < args.length; i += 2) {
                    const fp = args[i].p; const v = args[i + 1];
                    let o = next; for (let k = 0; k < fp.length - 1; k++) { o[fp[k]] = o[fp[k]] || {}; o = o[fp[k]]; }
                    if (v === DEL) delete o[fp[fp.length - 1]]; else o[fp[fp.length - 1]] = clone(v);
                }
                check(p, next); docs.set(p, next); stats.updates++;
            },
            async delete() { docs.delete(p); }
        };
    }
    function col(cp) {
        return {
            doc: (id) => ref(cp + '/' + id),
            async get() {
                const list = [...docs.keys()].filter((k) => k.startsWith(cp + '/') && !k.slice(cp.length + 1).includes('/'))
                    .map((k) => ({ id: k.split('/').pop(), data: () => clone(docs.get(k)) }));
                stats.gets += list.length || 1;
                return { forEach: (f) => list.forEach(f), metadata: { fromCache: false } };
            }
        };
    }
    return { docs, stats, ref };
}
function bld(i, extra) {
    return Object.assign({ id: 'b' + i, name: '건물 ' + i, siteName: '현장 ' + (i % 40), metaUpdatedAt: 1000 + i,
        floors: Array.from({ length: 12 }, (_, k) => ({ code: (k + 1) + 'F', name: (k + 1) + '층 평면도 주차장 기계실' })),
        notes: '비고 메모 '.repeat(20), roundDone: { report: { done: true, at: 5, by: '정병수', doneAt: 5 } } }, extra || {});
}
const ctxOf = (docs) => ({ docs, chunkCache: {}, del: () => DEL, fieldPath: (a, b) => (b === undefined ? new FP(a) : new FP(a, b)), now: 5000 });
async function syncOnce(root, buildings, deletedIds, docs, extra) {
    // app.js 루트 쓰기 흐름과 같은 순서: 서버 루트 읽기 → 펼친 보기 → 건물 문서 → 루트(남은 공통 칸은 조각)
    const raw = (await root.get()).data() || {};
    const dataToSync = Object.assign({ buildings: clone(buildings), deletedBuildingIds: deletedIds.slice(), companyName: '동일', updatedAt: { __ts: 1 } }, extra || {});
    if (!B.shouldSplit(raw, dataToSync, {})) { await root.set(dataToSync, { merge: true }); return { split: false, raw }; }
    const r = await B.writeSplit(root, dataToSync, deletedIds, raw, ctxOf(docs));
    await S.writeRootDoc(root, dataToSync, { fields: ['deletedBuildingIds'], serverRaw: raw, deleteSentinel: () => DEL });
    return Object.assign({ split: true }, r);
}
async function readView(db, root) {
    const raw = (await root.get()).data() || {};
    const exp = raw.rootShards ? await S.expandRootData(root, raw, { strict: true }) : raw;
    const r = await B.loadAll(root, { source: 'server' }, { chunkCache: {} });
    return B.expandView(exp, r.docs);
}

(async () => {
    const big = Array.from({ length: 1500 }, (_, i) => bld(i));
    const grid = {}; const gridAt = {};
    big.forEach((b, i) => { grid[b.id + '_1F'] = { xs: [1, 2, 3], ys: [4, 5] }; gridAt['floorGridLines/' + b.id + '_1F'] = 10 + i; });
    // 1) 사고 재현: 1MB 넘는 루트를 예전 방식으로 쓰면 실패
    const db = makeDb(); const root = db.ref('safety_app/cX');
    await root.set({ buildings: big.slice(0, 600), floorGridLines: grid, settingsAt: gridAt, styleColors: { a: '#000' }, deletedBuildingIds: ['gone'] }, { merge: true });
    await assert.rejects(root.set({ buildings: big }, { merge: true }), (e) => S.isDocTooLargeError(e), '예전 방식 실패');

    // 2) 나눠 쓰기: 성공, 루트엔 buildings 없음·rootSplit·층 설정 옮김, 회사 공통 칸 유지
    const docsA = {};
    const r1 = await syncOnce(root, big, ['gone'], docsA);
    assert.strictEqual(r1.split, true);
    assert.strictEqual(r1.wrote, 1500, '처음엔 건물 전부');
    const raw1 = (await root.get()).data();
    assert.ok(!raw1.buildings && raw1.rootSplit, '루트엔 표시만');
    assert.ok(!raw1.floorGridLines || !Object.keys(raw1.floorGridLines).length, '건물 층 설정은 루트에서 빠짐');
    assert.deepStrictEqual(raw1.styleColors, { a: '#000' }, '회사 공통 설정은 루트에 그대로');
    assert.ok(fsize(raw1) < 100 * 1024, '루트가 작아짐 ' + fsize(raw1));
    assert.ok(db.docs.has('safety_app/cX/buildingMeta/b0'));
    // 건물 문서를 루트보다 먼저 썼다
    const firstRootSet = db.stats.setPaths.lastIndexOf('safety_app/cX');
    assert.ok(db.stats.setPaths.indexOf('safety_app/cX/buildingMeta/b1499') < firstRootSet);

    // 3) 다른 기기(캐시 없음)가 읽으면 왕복 동일 — 건물·층 설정·시각
    const v1 = await readView(db, root);
    const byId = (arr) => Object.fromEntries(arr.map((b) => [b.id, b]));
    assert.deepStrictEqual(byId(v1.buildings), byId(clone(big)), '건물 왕복 동일');
    assert.deepStrictEqual(v1.floorGridLines, grid, '층 설정 왕복 동일');
    big.forEach((b) => { const p = 'floorGridLines/' + b.id + '_1F'; assert.strictEqual(v1.settingsAt[p], gridAt[p]); });
    assert.deepStrictEqual(v1.deletedBuildingIds, ['gone']);

    // 4) 한 건물만 고치면 그 문서만
    const big2 = clone(big); big2[7].name = '고친 이름'; big2[7].metaUpdatedAt = 9000;
    db.stats.setPaths.length = 0;
    const r2 = await syncOnce(root, big2, ['gone'], docsA);
    assert.strictEqual(r2.wrote, 1, '바뀐 건물 하나만');
    assert.ok(db.stats.setPaths.includes('safety_app/cX/buildingMeta/b7'));

    // 5) 다른 기기가 더 최근에 고친 건물은 덮지 않음
    await db.ref('safety_app/cX/buildingMeta/b9').set({ v: 1, at: 99999, h: 'other', b: bld(9, { name: '다른 기기', metaUpdatedAt: 99999 }) }, { merge: true });
    const big3 = clone(big2); big3[9].name = '옛 값으로 덮기 시도'; big3[9].metaUpdatedAt = 2000;
    const r3 = await syncOnce(root, big3, ['gone'], docsA);
    assert.strictEqual(r3.skipped, 1);
    assert.strictEqual((await readView(db, root)).buildings.find((b) => b.id === 'b9').name, '다른 기기', '더 최근 것이 남음');

    // 6) 구버전 기기가 루트에 옛 buildings를 다시 써도: 합쳐 읽고, 다음 새 쓰기가 건물 문서로 옮김(건물 안 빠짐)
    await root.set({ buildings: [bld(7, { name: '구버전 수정', metaUpdatedAt: 99998 }), bld(77777)] }, { merge: true });
    const v6 = await readView(db, root);
    assert.strictEqual(v6.buildings.length, 1501, '옛 칸 새 건물도 보임');
    assert.strictEqual(v6.buildings.find((b) => b.id === 'b7').name, '구버전 수정', 'metaUpdatedAt 큰 쪽');
    await syncOnce(root, v6.buildings, v6.deletedBuildingIds, docsA);
    const raw6 = (await root.get()).data();
    assert.ok(!raw6.buildings, '옛 칸은 다시 지움');
    assert.ok(db.docs.has('safety_app/cX/buildingMeta/b77777'), '구버전이 만든 건물도 문서로');

    // 7) 삭제: 삭제 표시 문서 + 삭제 기록, 옛 칸에 남아 있어도 안 보임
    const v7in = (await readView(db, root)).buildings.filter((b) => b.id !== 'b2');
    await syncOnce(root, v7in, ['gone', 'b2'], docsA);
    await root.set({ buildings: [bld(2)] }, { merge: true });   // 구버전이 되살리려 해도
    const v7 = await readView(db, root);
    assert.ok(!v7.buildings.some((b) => b.id === 'b2'), '삭제 존중');
    assert.ok(v7.deletedBuildingIds.includes('b2') && v7.deletedBuildingIds.includes('gone'));

    // 8) 건물 하나가 ~900KB 넘으면 parts 조각, 다른 기기가 붙여 읽음
    const huge = bld(3, { notes: '아주 긴 비고 '.repeat(90000), metaUpdatedAt: 50000 });
    const list8 = (await readView(db, root)).buildings.map((b) => (b.id === 'b3' ? huge : b));
    await syncOnce(root, list8, ['gone', 'b2'], docsA);
    const doc3 = db.docs.get('safety_app/cX/buildingMeta/b3');
    assert.ok(doc3.chunk && !doc3.b, '조각 문서');
    assert.deepStrictEqual((await readView(db, root)).buildings.find((b) => b.id === 'b3'), clone(huge), '큰 건물 왕복 동일');

    // 9) 층 설정 칸 라우팅·병합(칸마다 settingsAt 큰 쪽)
    const routed = B.routeSettingsWrites([
        { path: 'floorGridLines/b12_2F', key: 'floorGridLines', sub: 'b12_2F', value: 1, at: 5 },
        { path: 'styleColors/a', key: 'styleColors', sub: 'a', value: '#f00', at: 5 },
        { path: 'floorGridLines/b1_x', key: 'floorGridLines', sub: 'b1_x', value: 2, at: 5 }
    ], ['b1', 'b12']);
    assert.deepStrictEqual(Object.keys(routed.byBuilding).sort(), ['b1', 'b12'], '가장 긴 id 접두어(b12 ≠ b1)');
    assert.strictEqual(routed.root.length, 1);
    const ev = B.expandView({ rootSplit: { v: 1 }, floorGridLines: { b1_1F: 'root', b1_2F: 'rootOld' }, settingsAt: { 'floorGridLines/b1_1F': 50, 'floorGridLines/b1_2F': 1 } },
        { b1: { v: 1, at: 1, h: 'x', b: bld(1), settings: { floorGridLines: { b1_1F: 'doc', b1_2F: 'docNew' } }, settingsAt: { 'floorGridLines/b1_1F': 10, 'floorGridLines/b1_2F': 20, 'floorGridLines/b1_3F': 30 } } });
    assert.strictEqual(ev.floorGridLines.b1_1F, 'root', '루트가 더 최근');
    assert.strictEqual(ev.floorGridLines.b1_2F, 'docNew', '문서가 더 최근');
    assert.ok(!('b1_3F' in ev.floorGridLines), '문서에서 지운 칸');
    // 작은 회사도 항상 건물마다(첫 동기화 = 예전 루트에서 옮기기)
    const small = makeDb(); const sroot = small.ref('safety_app/s');
    await sroot.set({ buildings: [bld(1), bld(2)], floorGridLines: { b1_1F: 'g1', b2_3F: 'g2' }, settingsAt: { 'floorGridLines/b1_1F': 3, 'floorGridLines/b2_3F': 4 }, styleColors: { a: 1 } });
    const legacyView = await readView(small, sroot);   // 새 버전이 예전 루트 읽기
    assert.strictEqual(legacyView.buildings.length, 2, '예전 루트 그대로 읽음');
    const rs = await syncOnce(sroot, legacyView.buildings, [], {});
    assert.strictEqual(rs.split, true, '작아도 나눔');
    assert.strictEqual(rs.wrote, 2);
    const sraw = (await sroot.get()).data();
    assert.ok(!sraw.buildings && sraw.rootSplit && !Object.keys(sraw.floorGridLines || {}).length, '루트엔 표시·공통 칸만');
    assert.deepStrictEqual(sraw.styleColors, { a: 1 });
    const sv = await readView(small, sroot);
    assert.deepStrictEqual(byId(sv.buildings), byId(clone([bld(1), bld(2)])), '옮긴 뒤 왕복 동일');
    assert.deepStrictEqual(sv.floorGridLines, { b1_1F: 'g1', b2_3F: 'g2' });
    assert.strictEqual(sv.settingsAt['floorGridLines/b2_3F'], 4);
    // 건물 없는 새 회사도 문제 없음
    const empty = makeDb(); const eroot = empty.ref('safety_app/e');
    assert.strictEqual((await syncOnce(eroot, [], [], {})).split, true);
    assert.deepStrictEqual((await readView(empty, eroot)).buildings, []);
    assert.strictEqual(B.shouldSplit({}, {}, {}), true, '크기 문턱 없음');
    assert.strictEqual(B.shouldSplit({}, {}, { legacyOnly: true }), false);
    assert.strictEqual(B.expandView({ buildings: [1] }, {}).buildings[0], 1, '문서 없음 → 그대로');

    // 10) 앱 연결
    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(/bdApi\.shouldSplit\(rootGuardRaw \|\| \{\}, dataToSync, \{ force: _rootForceSplit \}\)/.test(app), '루트 쓰기 분기');
    assert.ok(/writeBuildingDocsForSync\(docRef, dataToSync, mergedDeletedBuildings, rootGuardRaw \|\| \{\}\)/.test(app));
    assert.ok(/buildingDocsApi\(\)\.writeSplit\(docRef, dataToSync, deletedIds, serverRaw, buildingDocsCtx\(\)\)/.test(app));
    assert.ok(/fields: \['deletedBuildingIds'\]/.test(app), '남은 큰 공통 칸은 조각');
    assert.ok(/const guardData = await expandRootDocData\(docRef, rootGuardRaw, \{ strict: true \}\);/.test(app), '쓰기 전 확인 = 펼친 보기(엄격)');
    assert.ok(/listenBuildingMetaDocs\(docId\);/.test(app) && /_bldgMetaUnsub\(\);/.test(app), '건물 문서 리스너·해제');
    assert.ok(/const rootData = snap\.exists \? await expandRootDocData\(docRef, snap\.data\(\)\) : \{\};/.test(app), '처음 받기');
    assert.ok(/bdApi\.routeSettingsWrites\(plan\.writes, ids\)/.test(app), '층 설정 칸은 건물 문서로');
    assert.ok(/isDocTooLargeError\(e\)\) \{\s*_rootForceSplit = true;\s*try \{ e\.__kind = 'transient'/.test(app), '1MB 오류는 멈추지 않고 다음에 나눠 쓰기');
    assert.ok(/hadPending && !_dirtyFloorKeys\.size && !isSyncParked\(\) && !_syncRetryTimer\) window\.showToast\(/.test(app), '실패 중엔 「올렸습니다」 안 띄움');
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(idx.indexOf('js/core/root-doc-shards.js') > 0 && idx.indexOf('js/core/root-doc-shards.js') < idx.indexOf('js/core/building-docs.js') && idx.indexOf('js/core/building-docs.js') < idx.indexOf('src="app.js'));
    const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    assert.ok(/match \/buildingMeta\/\{buildingId\} \{\s*allow read, write: if isCompanyMember\(companyId\);\s*match \/parts\/\{partId\} \{\s*allow read, write: if isCompanyMember\(companyId\);/.test(rules), '규칙');
    console.log('test-building-docs: ok');
})().catch((e) => { console.error(e); process.exit(1); });
