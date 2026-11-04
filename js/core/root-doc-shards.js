/**
 * 2026-11-04 회사 루트 문서(safety_app/{회사}) 1MB 한도 넘어도 올라가게 — 큰 칸 나눠 쓰기(범용 조각).
 * 건물 정보는 건물마다 문서(js/core/building-docs.js)로 옮기고, 여기 조각은 그 뒤에도 남는 큰 공통 칸(삭제 기록 등)·
 * 건물 하나가 ~900KB를 넘을 때의 대비(나누기·붙이기 함수 재사용)로 쓴다. opts.fields로 나눌 칸을 정한다.
 *
 * 사고: 루트 문서가 1,048,588 B로 한도(1,048,576 B)를 넘어 쓰기가 통째로 거부 → 건물 정보·작성 상태가 못 올라감.
 *
 * 방식(커지면만, 작으면 예전 그대로):
 *  - 커지는 칸(buildings, deletedBuildingIds)을 JSON 하나로 묶어 UTF-8 기준 조각(rootShards/{writeId}_{i})으로 먼저 쓰고,
 *    마지막에 루트 문서에 목차(rootShards: { v, writeId, n, fields, bytes, at, prev })를 쓰면서 루트의 옛 칸은 지운다.
 *    조각 문서는 writeId마다 새로 만들고 고치지 않는다 → 목차가 가리키는 조각은 늘 온전하다(반쯤 쓴 상태를 읽지 않음).
 *  - 한 번 나눠 쓰기 시작하면(서버에 목차가 있으면) 계속 나눠 쓴다(목차·옛 칸이 엇갈리지 않게).
 *  - 읽을 때: 목차가 있으면 조각을 읽어 붙이고, 루트에 남은 옛 칸(구버전 기기가 쓴 것)과 합친다.
 *      buildings: 건물 id로 합침, 둘 다 있으면 metaUpdatedAt 큰 쪽(같으면 조각). 삭제 기록(deletedBuildingIds): 합집합.
 *    → 어느 쪽에도 있던 건물이 빠지지 않는다. 조각을 못 읽으면 이전 목차(prev) → 그래도 안 되면 옛 칸만(엄격 모드면 실패).
 *  - 정리: 새 목차를 쓴 뒤, 그 전전 writeId 조각만 지운다(바로 전 것은 읽는 중인 기기를 위해 남긴다).
 * Firestore를 직접 부르지 않는다: docRef 비슷한 객체와 지우기 표시(deleteSentinel)를 받아 쓴다 — app.js·테스트 공용.
 */
(function (root) {
    'use strict';

    var SHARD_FIELDS = ['buildings', 'deletedBuildingIds'];
    var THRESHOLD_BYTES = 800 * 1024;   // Firestore 크기 셈(숫자 8B 등)과 JSON 차이 여유
    var PART_BYTES = 700 * 1024;
    var SUBCOLLECTION = 'rootShards';

    function utf8Bytes(str) {
        var s = String(str), n = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) n += 1;
            else if (c < 0x800) n += 2;
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { n += 4; i++; }
            else n += 3;
        }
        return n;
    }

    function jsonBytes(v) {
        try { return utf8Bytes(JSON.stringify(v === undefined ? null : v)); } catch (_e) { return 0; }
    }

    /** UTF-8 maxBytes 이하 조각들로(서로게이트 쌍은 자르지 않음) */
    function splitUtf8(str, maxBytes) {
        var s = String(str), out = [], start = 0, bytes = 0;
        var max = Math.max(4, maxBytes | 0);
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i), w, len = 1;
            if (c < 0x80) w = 1;
            else if (c < 0x800) w = 2;
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) { w = 4; len = 2; }
            else w = 3;
            if (bytes + w > max && i > start) { out.push(s.slice(start, i)); start = i; bytes = 0; }
            bytes += w;
            i += len - 1;
        }
        if (start < s.length || !out.length) out.push(s.slice(start));
        return out;
    }

    function isPlainValue(v) {
        // FieldValue(지우기·서버 시각 등) 같은 표시 객체는 크기 셈·조각에서 뺀다
        if (v === null || typeof v !== 'object') return true;
        if (Array.isArray(v)) return true;
        var p = Object.getPrototypeOf(v);
        return p === Object.prototype || p === null;
    }

    function plainPart(obj, skip) {
        var out = {};
        Object.keys(obj || {}).forEach(function (k) {
            if (skip && skip[k]) return;
            var v = obj[k];
            if (v === undefined || !isPlainValue(v)) return;
            out[k] = v;
        });
        return out;
    }

    function shardDocId(writeId, i) { return String(writeId) + '_' + i; }

    function newWriteId(now, rnd) {
        var t = Number(now) || Date.now();
        var r = Math.floor((typeof rnd === 'function' ? rnd() : Math.random()) * 1e9).toString(36);
        return 'w' + t.toString(36) + r;
    }

    /**
     * 쓰기 계획.
     * opts: { serverRaw(루트 문서 그대로), force, thresholdBytes, partBytes, writeId, now }
     * → { sharded:false, bytes } | { sharded:true, bytes, manifest, parts:[{id, data}], fields, deleteIds:[] }
     */
    function planRootWrite(dataToSync, opts) {
        var o = opts || {};
        var server = o.serverRaw || {};
        var prev = server.rootShards && server.rootShards.writeId ? server.rootShards : null;
        var fieldsList = Array.isArray(o.fields) && o.fields.length ? o.fields : SHARD_FIELDS;
        var shardSkip = {};
        fieldsList.forEach(function (k) { shardSkip[k] = true; });
        // 루트에 남을 다른 칸(서버에 있던 설정 + 이번에 쓰는 일반 칸)까지 더해 루트 크기를 어림
        var mainRest = Object.assign(plainPart(server, Object.assign({ rootShards: true }, shardSkip)), plainPart(dataToSync, shardSkip));
        var shardObj = {};
        var fields = [];
        fieldsList.forEach(function (k) {
            if (dataToSync && Array.isArray(dataToSync[k])) { shardObj[k] = dataToSync[k]; fields.push(k); }
        });
        var bytes = jsonBytes(mainRest) + jsonBytes(shardObj);
        var threshold = o.thresholdBytes || THRESHOLD_BYTES;
        var want = !!o.force || !!prev || bytes > threshold;
        if (!want || !fields.length) return { sharded: false, bytes: bytes };
        var writeId = o.writeId || newWriteId(o.now);
        var json = JSON.stringify(shardObj);
        var chunks = splitUtf8(json, o.partBytes || PART_BYTES);
        var at = Number(o.now) || Date.now();
        var parts = chunks.map(function (p, i) {
            return { id: shardDocId(writeId, i), data: { writeId: writeId, i: i, n: chunks.length, p: p, at: at } };
        });
        var manifest = {
            v: 1, writeId: writeId, n: chunks.length, fields: fields, bytes: utf8Bytes(json), at: at,
            prev: prev ? { writeId: String(prev.writeId), n: Number(prev.n) || 0 } : null
        };
        // 전전 조각만 지운다(바로 전 목차의 조각은 아직 읽는 기기가 있을 수 있음)
        var deleteIds = [];
        if (prev && prev.prev && prev.prev.writeId && String(prev.prev.writeId) !== writeId) {
            for (var i = 0; i < (Number(prev.prev.n) || 0); i++) deleteIds.push(shardDocId(prev.prev.writeId, i));
        }
        return { sharded: true, bytes: bytes, manifest: manifest, parts: parts, fields: fields, deleteIds: deleteIds, shardObj: shardObj };
    }

    /** 조각 문서 데이터 배열 → 원래 객체. 하나라도 빠지거나 writeId가 다르면 null */
    function assembleShards(manifest, docsData) {
        if (!manifest || !manifest.writeId) return null;
        var n = Number(manifest.n) || 0;
        if (!n || !docsData || docsData.length < n) return null;
        var strs = [];
        for (var i = 0; i < n; i++) {
            var d = docsData[i];
            if (!d || String(d.writeId) !== String(manifest.writeId) || Number(d.i) !== i || typeof d.p !== 'string') return null;
            strs.push(d.p);
        }
        try {
            var obj = JSON.parse(strs.join(''));
            return obj && typeof obj === 'object' ? obj : null;
        } catch (_e) { return null; }
    }

    function metaAt(b) {
        var n = Number(b && b.metaUpdatedAt);
        return isFinite(n) ? n : 0;
    }

    /** 루트 옛 칸 + 조각 내용 합치기 — 어느 쪽 건물도 빠지지 않게 */
    function mergeExpanded(raw, shardObj) {
        var out = Object.assign({}, raw || {});
        if (!shardObj) return out;
        var legacyB = Array.isArray(out.buildings) ? out.buildings : [];
        var shardB = Array.isArray(shardObj.buildings) ? shardObj.buildings : null;
        if (shardB) {
            var byId = {}, order = [];
            shardB.forEach(function (b) { if (b && b.id) { if (!byId[b.id]) order.push(b.id); byId[b.id] = b; } });
            legacyB.forEach(function (b) {
                if (!b || !b.id) return;
                if (!byId[b.id]) { byId[b.id] = b; order.push(b.id); return; }
                if (metaAt(b) > metaAt(byId[b.id])) byId[b.id] = b;
            });
            out.buildings = order.map(function (id) { return byId[id]; });
        }
        if (Array.isArray(shardObj.deletedBuildingIds) || Array.isArray(out.deletedBuildingIds)) {
            var seen = {}, del = [];
            (shardObj.deletedBuildingIds || []).concat(Array.isArray(out.deletedBuildingIds) ? out.deletedBuildingIds : [])
                .forEach(function (id) { if (id && !seen[id]) { seen[id] = true; del.push(id); } });
            out.deletedBuildingIds = del;
        }
        return out;
    }

    // ---- Firestore 비슷한 docRef로 쓰고 읽기 ----
    var _cache = {};          // writeId → 붙인 객체(조각은 바뀌지 않아 캐시해도 된다)
    var _cacheOrder = [];
    function cachePut(writeId, obj) {
        if (!writeId || !obj) return;
        if (!_cache[writeId]) _cacheOrder.push(writeId);
        _cache[writeId] = obj;
        while (_cacheOrder.length > 4) delete _cache[_cacheOrder.shift()];
    }
    function cacheClear() { _cache = {}; _cacheOrder = []; }

    async function readManifest(docRef, man, getOpts) {
        if (!man || !man.writeId) return null;
        if (_cache[man.writeId]) return _cache[man.writeId];
        var n = Number(man.n) || 0;
        if (!n) return null;
        var col = docRef.collection(SUBCOLLECTION);
        var snaps = await Promise.all(Array.from({ length: n }, function (_, i) {
            return col.doc(shardDocId(man.writeId, i)).get(getOpts);
        }));
        var obj = assembleShards(man, snaps.map(function (s) { return s && s.exists ? s.data() : null; }));
        if (obj) cachePut(man.writeId, obj);
        return obj;
    }

    /**
     * 루트 문서 데이터(raw)를 조각까지 붙여 펼친다. 목차가 없으면 raw 그대로.
     * opts.strict: 조각을 못 읽으면 예외(쓰기 전 확인용 — 남의 건물을 모르고 덮어쓰지 않게)
     */
    async function expandRootData(docRef, raw, opts) {
        var o = opts || {};
        var data = raw || {};
        var man = data.rootShards;
        if (!man || !man.writeId || !docRef) return data;
        var obj = null, err = null;
        try { obj = await readManifest(docRef, man, o.getOpts); } catch (e) { err = e; }
        if (!obj && man.prev && man.prev.writeId) {
            try { obj = await readManifest(docRef, man.prev, o.getOpts); } catch (e2) { err = err || e2; }
            if (obj && o.strict) obj = null;   // 쓰기 전에는 최신 목차만 믿는다
        }
        if (!obj) {
            if (o.strict) {
                var x = new Error('ROOT_SHARDS_UNREADABLE: 건물 목록 조각을 읽지 못해 이번에는 쓰지 않습니다(다음에 다시)' + (err && err.message ? ' — ' + err.message : ''));
                x.code = 'unavailable';
                throw x;
            }
            if (typeof console !== 'undefined') console.warn('[루트 조각] 읽기 실패 — 루트 문서 칸만 씀', man.writeId, err);
            return data;
        }
        return mergeExpanded(data, obj);
    }

    /**
     * 루트 문서 쓰기(커지면 나눠서). dataToSync는 고쳐서 쓴다.
     * ctx: { deleteSentinel(): FieldValue.delete(), serverRaw, force, now, writeId, thresholdBytes, partBytes }
     * → plan
     */
    async function writeRootDoc(docRef, dataToSync, ctx) {
        var c = ctx || {};
        var plan = planRootWrite(dataToSync, c);
        if (plan.sharded) {
            var col = docRef.collection(SUBCOLLECTION);
            for (var i = 0; i < plan.parts.length; i++) {
                await col.doc(plan.parts[i].id).set(plan.parts[i].data);
            }
            plan.fields.forEach(function (k) { dataToSync[k] = c.deleteSentinel(); });
            dataToSync.rootShards = plan.manifest;
            cachePut(plan.manifest.writeId, plan.shardObj);
        }
        await docRef.set(dataToSync, { merge: true });
        if (plan.sharded && plan.deleteIds.length) {
            for (var j = 0; j < plan.deleteIds.length; j++) {
                try { await docRef.collection(SUBCOLLECTION).doc(plan.deleteIds[j]).delete(); } catch (_e) { /* 정리는 다음에 */ }
            }
        }
        return plan;
    }

    function isDocTooLargeError(err) {
        var msg = String((err && err.message) || err || '');
        return /exceeds the maximum allowed size|cannot be written because its size|maximum allowed size of 1,?048,?576/i.test(msg);
    }

    var api = {
        SHARD_FIELDS: SHARD_FIELDS, THRESHOLD_BYTES: THRESHOLD_BYTES, PART_BYTES: PART_BYTES, SUBCOLLECTION: SUBCOLLECTION,
        utf8Bytes: utf8Bytes, jsonBytes: jsonBytes, splitUtf8: splitUtf8, planRootWrite: planRootWrite,
        assembleShards: assembleShards, mergeExpanded: mergeExpanded, expandRootData: expandRootData,
        writeRootDoc: writeRootDoc, isDocTooLargeError: isDocTooLargeError, shardDocId: shardDocId, _cacheClear: cacheClear
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) { root.BSA = root.BSA || {}; root.BSA.rootDocShards = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
