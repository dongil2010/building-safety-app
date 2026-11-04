/**
 * 2026-11-04 회사 루트 문서 1MB 초과 대책 — 건물마다 문서 하나(safety_app/{회사}/buildingMeta/{건물id}).
 *
 * 문서 모양: { v:1, at: metaUpdatedAt, h: 내용 해시, b: 건물 정보(도면 그림 뺀 것),
 *             settings: { floorGridLines: { '건물id_층': 값 }, ... },   ← 그 건물 층 설정(키가 「건물id_」로 시작하는 칸)
 *             settingsAt: { 'floorGridLines/건물id_층': 시각 },        ← 칸별 병합(company-settings-merge)과 같은 시각
 *             deleted?: true }                                         ← 삭제 표시(삭제 기록은 루트 deletedBuildingIds에도 남긴다)
 *   건물 하나가 ~900KB를 넘으면 b 대신 chunk:{writeId,n} + parts/{writeId_i} 조각(js/core/root-doc-shards.js 나누기 재사용).
 * 루트 문서: 회사 공통 작은 칸 + rootSplit:{v,at} 표시만. buildings는 지운다(남은 공통 칸이 커지면 rootShards 조각).
 *
 * 읽기(펼친 보기): 루트 + 건물 문서들 → 예전 루트 모양(buildings 배열, 설정 맵, settingsAt) 그대로 만들어 기존 병합 코드에 넘긴다.
 *   buildings: 건물 문서 + 루트에 남은 옛 buildings(구버전 기기가 쓴 것)를 id로 합침, metaUpdatedAt 큰 쪽(같으면 문서).
 *   층 설정: 칸마다 settingsAt 큰 쪽(루트 칸 vs 건물 문서 칸). 삭제 표시 문서는 목록에서 빼고 삭제 기록에 넣는다.
 * 쓰기: 바뀐 건물 문서만(해시가 다르고, 서버 문서가 더 최근이 아닐 때). 처음 나눌 때는 전부 쓴 뒤에 루트 buildings를 지운다.
 * Firestore를 직접 부르지 않는다(app.js·테스트 공용).
 */
(function (root) {
    'use strict';

    var COLLECTION = 'buildingMeta';
    var FLOOR_SETTING_KEYS = ['grids', 'floorGridLines', 'floorPrintCrops', 'floorDrawingRotations',
        'floorDrawingDarken', 'floorMapStyleSettings', 'styleShapes'];
    // 2026-11-04 건물 정보(b)+그 건물 층 설정(settings)을 합쳐 1MB 아래로 — b만 재면 큰 건물+설정이 넘었다
    var DOC_MAX_BYTES = 700 * 1024;

    function shardsApi() {
        if (root && root.BSA && root.BSA.rootDocShards) return root.BSA.rootDocShards;
        try { return require('./root-doc-shards.js'); } catch (_e) { return null; }
    }

    function hashOf(v) {
        var s;
        try { s = JSON.stringify(v); } catch (_e) { s = String(v); }
        s = s === undefined ? 'u' : s;
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return s.length.toString(36) + ':' + (h >>> 0).toString(36);
    }
    function metaAt(b) { var n = Number(b && b.metaUpdatedAt); return isFinite(n) && n > 0 ? n : 0; }
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

    /** 설정 칸 키(예 'b12_3F') → 건물 id(가장 긴 「id_」 접두어), 없으면 null */
    function buildingIdForSub(sub, ids) {
        var s = String(sub || ''), best = null;
        (ids || []).forEach(function (id) {
            if (id && s.indexOf(id + '_') === 0 && (!best || id.length > best.length)) best = id;
        });
        return best;
    }

    /** 문서 데이터의 건물 정보(조각이면 따로 붙여 둔 _b) */
    function docBuilding(d) { return d ? (d.b || d._b || null) : null; }

    /**
     * 펼친 보기: raw(루트) + docs({id: 문서 데이터}) → 예전 루트 모양.
     */
    function expandView(raw, docs) {
        var out = Object.assign({}, raw || {});
        var map = docs || {};
        var ids = Object.keys(map);
        if (!ids.length && !(raw && raw.rootSplit)) return out;
        var byId = {}, order = [];
        var delSeen = {}, del = [];
        function addDel(id) { if (id && !delSeen[id]) { delSeen[id] = true; del.push(id); } }
        (Array.isArray(out.deletedBuildingIds) ? out.deletedBuildingIds : []).forEach(addDel);
        ids.forEach(function (id) {
            var d = map[id];
            if (!d) return;
            if (d.deleted) { addDel(id); return; }
            var b = docBuilding(d);
            if (b && b.id) { byId[b.id] = b; order.push(b.id); }
        });
        (Array.isArray(out.buildings) ? out.buildings : []).forEach(function (b) {
            if (!b || !b.id) return;
            if (!byId[b.id]) { byId[b.id] = b; order.push(b.id); return; }
            if (metaAt(b) > metaAt(byId[b.id])) byId[b.id] = b;
        });
        out.buildings = order.filter(function (id) { return !delSeen[id]; }).map(function (id) { return byId[id]; });
        out.deletedBuildingIds = del;
        // 층 설정: 칸마다 settingsAt 큰 쪽
        var at = Object.assign({}, isObj(out.settingsAt) ? out.settingsAt : {});
        FLOOR_SETTING_KEYS.forEach(function (key) {
            var merged = isObj(out[key]) ? Object.assign({}, out[key]) : null;
            ids.forEach(function (id) {
                var d = map[id];
                if (!d || d.deleted) return;
                var s = isObj(d.settings) && isObj(d.settings[key]) ? d.settings[key] : {};
                var sa = isObj(d.settingsAt) ? d.settingsAt : {};
                var subs = {};
                Object.keys(s).forEach(function (k) { subs[k] = 1; });
                Object.keys(sa).forEach(function (p) { if (p.indexOf(key + '/') === 0) subs[p.slice(key.length + 1)] = 1; });
                Object.keys(subs).forEach(function (sub) {
                    var p = key + '/' + sub;
                    var docAt = Number(sa[p]) || 0;
                    var rootAt = Number(at[p]) || 0;
                    var inDoc = Object.prototype.hasOwnProperty.call(s, sub);
                    if (rootAt > docAt && merged && Object.prototype.hasOwnProperty.call(merged, sub)) return;
                    if (inDoc) { if (!merged) merged = {}; merged[sub] = s[sub]; }
                    else if (merged && docAt >= rootAt) delete merged[sub];
                    if (docAt > rootAt) at[p] = docAt;
                });
            });
            if (merged) out[key] = merged;
        });
        out.settingsAt = at;
        return out;
    }

    /**
     * 이번에 나눠 쓸지 — 2026-11-04 「아예 건물 별로 찢어」: 새 버전은 회사 크기와 상관없이 항상 건물마다 문서.
     * (첫 동기화 때 예전 루트의 buildings·건물 층 설정을 건물 문서로 옮긴다. 읽기는 예전 루트도 계속 펼쳐 읽음)
     * opts.legacyOnly === true 일 때만 예전 방식(테스트·비상용).
     */
    function shouldSplit(serverRaw, dataToSync, opts) {
        return !(opts && opts.legacyOnly === true);
    }

    /**
     * 쓸 건물 문서 계획.
     * buildings: 이번에 쓸 건물 정보 배열(정리된 것) · deletedIds · serverDocs: {id: 서버 문서(리스너·읽기로 아는 것)}
     * → [{ id, kind:'put'|'delete', data, parts?:[{id,data}], h, at }]
     */
    function planBuildingWrites(buildings, deletedIds, serverDocs, opts) {
        var o = opts || {};
        var S = shardsApi();
        var sd = serverDocs || {};
        var out = [];
        var del = {};
        (deletedIds || []).forEach(function (id) { if (id) del[id] = true; });
        (buildings || []).forEach(function (b) {
            if (!b || !b.id || del[b.id]) return;
            var h = hashOf(b);
            var cur = sd[b.id];
            var extra = o.extraBytesFor ? (Number(o.extraBytesFor(b.id)) || 0) : 0;
            var needChunk = !!S && S.jsonBytes({ v: 1, at: metaAt(b), h: h, b: b, deleted: false }) + extra > (o.docMaxBytes || DOC_MAX_BYTES);
            // 같음 — 단, 예전에 통째로 쓴 문서가 이제 설정까지 합쳐 크면 조각으로 다시 쓴다
            if (cur && !cur.deleted && cur.h === h && !(needChunk && !cur.chunk)) return;
            if (cur && !cur.deleted && (Number(cur.at) || 0) > metaAt(b)) return; // 서버가 더 최근 — 받아서 합친다
            var data = { v: 1, at: metaAt(b), h: h, b: b, deleted: false };
            var item = { id: b.id, kind: 'put', data: data, h: h, at: metaAt(b) };
            if (needChunk) {
                var writeId = (o.writeIdFor ? o.writeIdFor(b.id) : ('w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)));
                var chunks = S.splitUtf8(JSON.stringify(b), o.partBytes || S.PART_BYTES);
                item.parts = chunks.map(function (p, i) { return { id: S.shardDocId(writeId, i), data: { writeId: writeId, i: i, n: chunks.length, p: p } }; });
                item.data = { v: 1, at: metaAt(b), h: h, chunk: { writeId: writeId, n: chunks.length }, deleted: false };
                item.prevChunk = cur && cur.chunk ? cur.chunk : null;
            }
            out.push(item);
        });
        Object.keys(del).forEach(function (id) {
            var cur = sd[id];
            if (cur && !cur.deleted) out.push({ id: id, kind: 'delete', data: { v: 1, deleted: true, at: Number(o.now) || Date.now() } });
        });
        return out;
    }

    /** 칸별 설정 쓰기 → 루트용 / 건물 문서용으로 나눔 */
    function routeSettingsWrites(writes, buildingIds) {
        var rootW = [], byB = {};
        (writes || []).forEach(function (w) {
            var id = (FLOOR_SETTING_KEYS.indexOf(w.key) >= 0 && w.sub != null) ? buildingIdForSub(w.sub, buildingIds) : null;
            if (!id) { rootW.push(w); return; }
            (byB[id] = byB[id] || []).push(w);
        });
        return { root: rootW, byBuilding: byB };
    }

    /** 건물 문서용 set(merge) 데이터 — settings.{key}.{sub}, settingsAt.{path} */
    function settingsDocPatch(writes, del) {
        var patch = { settings: {}, settingsAt: {} };
        (writes || []).forEach(function (w) {
            patch.settings[w.key] = patch.settings[w.key] || {};
            patch.settings[w.key][w.sub] = w.value === undefined ? del() : w.value;
            patch.settingsAt[w.path] = w.at || 1;
        });
        return patch;
    }

    /** 루트에 남은 「건물 층 설정」 칸 → 건물 문서로 옮길 목록 { byBuilding:{id:[{key,sub,value,at,path}]}, rootDeletes:[{key,sub,path}] } */
    function planRootSettingsMigration(serverRaw, buildingIds) {
        var byB = {}, rootDeletes = [];
        var at = isObj(serverRaw && serverRaw.settingsAt) ? serverRaw.settingsAt : {};
        FLOOR_SETTING_KEYS.forEach(function (key) {
            var m = serverRaw && serverRaw[key];
            if (!isObj(m)) return;
            Object.keys(m).forEach(function (sub) {
                var id = buildingIdForSub(sub, buildingIds);
                if (!id) return;
                var path = key + '/' + sub;
                (byB[id] = byB[id] || []).push({ key: key, sub: sub, value: m[sub], at: Number(at[path]) || 1, path: path });
                rootDeletes.push({ key: key, sub: sub, path: path });
            });
        });
        return { byBuilding: byB, rootDeletes: rootDeletes };
    }

    /** 조각 건물 문서 붙이기: d.chunk + parts 데이터 배열 → d에 _b */
    function attachChunk(d, partsData) {
        var S = shardsApi();
        if (!d || !d.chunk || !S) return d;
        var obj = S.assembleShards(d.chunk, partsData);
        if (!obj) return null;
        return Object.assign({}, d, { _b: obj });
    }

    // ---- Firestore 비슷한 ref로 읽고 쓰기(app.js·테스트 공용) ----
    // ctx: { docs: {id: 문서}(고쳐 씀), chunkCache: {}, del(): 지우기 표시, fieldPath(a,b), concurrency }

    async function resolveDoc(col, id, d, ctx) {
        var S = shardsApi();
        if (!d || !d.chunk || !S) return d;
        var cache = (ctx && ctx.chunkCache) || {};
        var wid = d.chunk.writeId;
        if (cache[id] && cache[id].writeId === wid) return Object.assign({}, d, { _b: cache[id].b });
        var n = Number(d.chunk.n) || 0;
        var snaps = await Promise.all(Array.from({ length: n }, function (_, i) {
            return col.doc(id).collection('parts').doc(S.shardDocId(wid, i)).get();
        }));
        var full = attachChunk(d, snaps.map(function (s) { return s && s.exists ? s.data() : null; }));
        if (full) cache[id] = { writeId: wid, b: full._b };
        return full;
    }

    /** 건물 문서 전부 읽기 → { docs, fromServer }. 조각을 못 붙이면 예외 */
    async function loadAll(rootRef, getOpts, ctx) {
        var col = rootRef.collection(COLLECTION);
        var qs = await col.get(getOpts);
        var list = [];
        qs.forEach(function (doc) { list.push(doc); });
        var docs = {};
        for (var i = 0; i < list.length; i++) {
            var d = await resolveDoc(col, list[i].id, list[i].data() || {}, ctx);
            if (!d) throw new Error('BUILDING_DOC_UNREADABLE: 건물 문서 조각을 읽지 못함 ' + list[i].id);
            docs[list[i].id] = d;
        }
        return { docs: docs, fromServer: !(qs.metadata && qs.metadata.fromCache) };
    }

    async function runPool(items, limit, fn) {
        var i = 0;
        var n = Math.max(1, limit | 0);
        async function worker() { while (i < items.length) { var k = i++; await fn(items[k]); } }
        var ws = [];
        for (var w = 0; w < Math.min(n, items.length); w++) ws.push(worker());
        await Promise.all(ws);
    }

    /**
     * 나눠 쓰기 한 번: 바뀐 건물 문서만(쓰기 직전 그 문서만 서버에서 다시 읽어 더 최근이면 건너뜀) →
     * 루트에 남은 「건물 층 설정」을 건물 문서로 옮기고 루트에서 지움 → dataToSync를 루트용으로 바꿈(buildings 지우기 + rootSplit).
     * 루트 쓰기 자체는 부르는 쪽이 한다(문서들을 먼저 쓰고 루트를 마지막에).
     */
    async function writeSplit(rootRef, dataToSync, deletedIds, serverRaw, ctx) {
        var c = ctx || {};
        var S = shardsApi();
        var docs = c.docs || {};
        var col = rootRef.collection(COLLECTION);
        var buildings = Array.isArray(dataToSync.buildings) ? dataToSync.buildings : [];
        // 루트에서 옮길 층 설정을 먼저 계산해, 건물 문서 크기(b + 설정)를 미리 잰다
        var ids0 = buildings.map(function (b) { return b && b.id; }).filter(Boolean).concat(Object.keys(docs));
        var mig0 = planRootSettingsMigration(serverRaw || {}, ids0);
        function extraBytesFor(id) {
            var d = docs[id] || {};
            var n = S ? S.jsonBytes(d.settings || {}) + S.jsonBytes(d.settingsAt || {}) : 0;
            (mig0.byBuilding[id] || []).forEach(function (w) { n += S ? S.jsonBytes(w.value) + S.utf8Bytes(String(w.path || '')) * 2 + 16 : 0; });
            return n;
        }
        var plan = planBuildingWrites(buildings, deletedIds, docs, { now: c.now, writeIdFor: c.writeIdFor, docMaxBytes: c.docMaxBytes, partBytes: c.partBytes, extraBytesFor: extraBytesFor });
        var wrote = 0, skipped = 0;
        await runPool(plan, c.concurrency || 6, async function (item) {
            var ref = col.doc(item.id);
            var s = await ref.get({ source: 'server' });
            var cur = s.exists ? (s.data() || {}) : null;
            if (item.kind === 'put' && cur && !cur.deleted && (Number(cur.at) || 0) > item.at && cur.h !== item.h) {
                var r = await resolveDoc(col, item.id, cur, c);
                if (r) docs[item.id] = r;
                skipped++;
                return;
            }
            if (item.parts) {
                for (var i = 0; i < item.parts.length; i++) await ref.collection('parts').doc(item.parts[i].id).set(item.parts[i].data);
            }
            var body = Object.assign({}, item.data);
            if (item.kind === 'delete') { body.b = c.del(); body.chunk = c.del(); }
            else if (item.parts) body.b = c.del();
            else body.chunk = c.del();
            await ref.set(body, { merge: true });
            wrote++;
            var prevChunk = cur && cur.chunk;
            if (prevChunk && S && (!item.data.chunk || prevChunk.writeId !== item.data.chunk.writeId)) {
                for (var j = 0; j < (Number(prevChunk.n) || 0); j++) {
                    try { await ref.collection('parts').doc(S.shardDocId(prevChunk.writeId, j)).delete(); } catch (_e) { /* 다음에 */ }
                }
            }
            var known = Object.assign({}, cur || {}, item.data);
            if (item.parts) known._b = buildings.filter(function (b) { return b && b.id === item.id; })[0];
            if (item.kind === 'delete') { delete known.b; delete known._b; }
            docs[item.id] = known;
        });
        // 루트에 남은 건물 층 설정 → 건물 문서(시각 그대로)
        var ids = buildings.map(function (b) { return b && b.id; }).filter(Boolean).concat(Object.keys(docs));
        var mig = planRootSettingsMigration(serverRaw || {}, ids);
        var migIds = Object.keys(mig.byBuilding);
        await runPool(migIds, c.concurrency || 6, async function (id) {
            var patch = settingsDocPatch(mig.byBuilding[id], c.del);
            await col.doc(id).set(patch, { merge: true });
            var d = Object.assign({}, docs[id] || {});
            d.settings = Object.assign({}, d.settings || {});
            Object.keys(patch.settings).forEach(function (k) { d.settings[k] = Object.assign({}, d.settings[k] || {}, patch.settings[k]); });
            d.settingsAt = Object.assign({}, d.settingsAt || {}, patch.settingsAt);
            docs[id] = d;
        });
        for (var k = 0; k < mig.rootDeletes.length; k += 200) {
            var args = [];
            mig.rootDeletes.slice(k, k + 200).forEach(function (x) {
                args.push(c.fieldPath(x.key, x.sub), c.del(), c.fieldPath('settingsAt', x.path), c.del());
            });
            await rootRef.update.apply(rootRef, args);
        }
        dataToSync.buildings = c.del();
        dataToSync.rootSplit = { v: 1, at: Number(c.now) || Date.now() };
        return { wrote: wrote, skipped: skipped, planned: plan.length, migrated: mig.rootDeletes.length };
    }

    var api = {
        hashOf: hashOf, buildingIdForSub: buildingIdForSub, expandView: expandView, shouldSplit: shouldSplit,
        planBuildingWrites: planBuildingWrites, routeSettingsWrites: routeSettingsWrites, settingsDocPatch: settingsDocPatch,
        planRootSettingsMigration: planRootSettingsMigration, attachChunk: attachChunk, docBuilding: docBuilding,
        resolveDoc: resolveDoc, loadAll: loadAll, writeSplit: writeSplit
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.buildingDocs = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
