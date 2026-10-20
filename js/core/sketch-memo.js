/**
 * 2026-10-16 손글씨 메모(도면 메모 버튼 → 흰 종이 팝업). 층(회차별 건물 id + 층)마다 여러 장.
 *
 * - 결함 아님: state.sketchMemos[층키] = [{ id, title, w, h, strokes, by, createdAt, updatedAt }]
 * - 선(stroke): { c: 색, w: 기본 굵기, e: 지우개면 1, p: [x, y, 필압(0~100), x, y, 필압, …] } — 좌표는 정수(w×h 종이 기준)
 * - 동기화: 층 묶음(pack.sketches = { items, deletedIds, deletedAt })에 실려 텍스트 메모와 같은 규칙으로 합친다
 *   (updatedAt 더 나중 장이 이김, 지운 장은 묘비). 그림은 벡터(선 좌표)라 이미지 파일을 따로 올리지 않는다.
 * - 브라우저(window.BSA.sketchMemo)·node(require) 둘 다.
 */
(function (root) {
    'use strict';

    var MAX_POINTS = 60000;       // 한 장 전체 점 수 한도(약 수백 KB) — 넘으면 저장 시 알려준다
    var COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#f59e0b'];

    function newId(now) { return 'sketch_' + (Number(now) || Date.now()) + '_' + Math.random().toString(36).slice(2, 8); }

    function ensureMaps(st) {
        if (!st.sketchMemos || typeof st.sketchMemos !== 'object') st.sketchMemos = {};
        if (!st.deletedSketchIds || typeof st.deletedSketchIds !== 'object') st.deletedSketchIds = {};
        if (!st.deletedSketchAt || typeof st.deletedSketchAt !== 'object') st.deletedSketchAt = {};
        return st;
    }

    function cleanStroke(s) {
        if (!s || !Array.isArray(s.p) || s.p.length < 3) return null;
        var p = [];
        for (var i = 0; i + 2 < s.p.length; i += 3) {
            var x = Math.round(Number(s.p[i]) || 0);
            var y = Math.round(Number(s.p[i + 1]) || 0);
            var pr = Math.max(0, Math.min(100, Math.round(Number(s.p[i + 2]) || 0)));
            p.push(x, y, pr);
        }
        if (!p.length) return null;
        var out = { c: String(s.c || COLORS[0]).slice(0, 16), w: Math.max(1, Math.min(60, Math.round(Number(s.w) || 3))), e: s.e ? 1 : 0, p: p };
        if (s.i) out.i = String(s.i).slice(0, 40);   // 2026-10-16 획 ID — 여러 사람이 같은 메모에 이어 쓴 획을 합칠 때 씀
        return out;
    }

    function pointCount(strokes) {
        return (strokes || []).reduce(function (n, s) { return n + ((s && s.p) ? s.p.length / 3 : 0); }, 0);
    }

    function listFor(st, floorKey) {
        if (!st || !floorKey) return [];
        return ((st.sketchMemos || {})[floorKey] || []).filter(function (m) { return m && m.id; })
            .slice().sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    }

    /** 새 장 또는 같은 id 장을 통째로 바꾼다. 반환: 저장된 장 */
    function saveSheet(st, floorKey, sheet, now) {
        if (!st || !floorKey || !sheet) return null;
        ensureMaps(st);
        var t = Number(now) || Date.now();
        var list = st.sketchMemos[floorKey] || (st.sketchMemos[floorKey] = []);
        var strokes = (sheet.strokes || []).map(cleanStroke).filter(Boolean);
        var cur = sheet.id ? list.find(function (r) { return r && r.id === sheet.id; }) : null;
        var rec = {
            id: (cur && cur.id) || sheet.id || newId(t),
            title: String(sheet.title || (cur && cur.title) || '').slice(0, 60),
            w: Math.max(100, Math.round(Number(sheet.w) || (cur && cur.w) || 1200)),
            h: Math.max(100, Math.round(Number(sheet.h) || (cur && cur.h) || 1600)),
            strokes: strokes,
            // 2026-10-16 도면 메모 목록 항목: 도면 위 자리(원본 픽셀). 없으면 화면에서 차례대로 자리를 정해 보여 준다
            x: pickNum(sheet.x, cur && cur.x),
            y: pickNum(sheet.y, cur && cur.y),
            by: sheet.by || (cur && cur.by) || '',
            // 2026-10-20 개인 계정별 메모 — 계정 uid(이름이 같아도 다른 계정이면 다른 사람)
            byUid: String(sheet.byUid || (cur && cur.byUid) || '').slice(0, 128),
            createdAt: (cur && cur.createdAt) || Number(sheet.createdAt) || t,
            updatedAt: Math.max(t, ((cur && cur.updatedAt) || 0) + 1)
        };
        if (!rec.byUid) delete rec.byUid;
        if (rec.x == null) delete rec.x;
        if (rec.y == null) delete rec.y;
        if (cur) list[list.indexOf(cur)] = rec; else list.push(rec);
        // 같은 id 묘비가 있으면(지운 뒤 되돌리기 등) 새 저장이 더 나중이라 병합에서 살아남는다
        return rec;
    }

    function pickNum(a, b) {
        if (a != null && isFinite(Number(a))) return Math.round(Number(a));
        if (b != null && isFinite(Number(b))) return Math.round(Number(b));
        return null;
    }

    /**
     * 2026-10-16 메모 이름: 작성자(개인)별 「메모-1, 메모-2 …」(그 사람이 만든 순서). 다른 사람 이름이면 앞에 이름.
     * me: 지금 사용자 이름(같으면 이름 생략). 메모는 고치거나 지우지 않고 늘 새 항목으로 쌓인다.
     */
    function authorKey(rec) { return String((rec && rec.by) || '').trim(); }
    function labelFor(st, floorKey, id, me) {
        var list = listFor(st, floorKey);
        var rec = list.find(function (r) { return r.id === id; });
        var who = rec ? authorKey(rec) : String(me || '').trim();
        var mine = list.filter(function (r) { return authorKey(r) === who; });
        var i = rec ? mine.indexOf(rec) : -1;
        var n = i >= 0 ? i + 1 : mine.length + 1;
        var meKey = String(me || '').trim();
        return (who && who !== meKey ? who + ' ' : '') + '메모-' + n;
    }

    /**
     * 2026-10-19 「손글씨 기능에서 기존에 작성한거 부터 보여줘야지 계속 새 손글씨 보이면 안됨」:
     * 메모 버튼으로 열 때 처음 보일 장 — 내가 마지막으로 고친 메모, 내 것이 없으면 이 층에서 마지막으로 고친 메모.
     * 메모가 하나도 없을 때만 null(새 종이). 새 메모는 「＋ 새 메모」로만 만든다.
     */
    function pickInitialSheet(st, floorKey, me) {
        var list = listFor(st, floorKey);
        if (!list.length) return null;
        var meKey = String(me || '').trim();
        var newest = function (arr) {
            return arr.slice().sort(function (a, b) {
                return ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)) || ((b.createdAt || 0) - (a.createdAt || 0));
            })[0] || null;
        };
        var mine = meKey ? list.filter(function (r) { return authorKey(r) === meKey; }) : [];
        return newest(mine.length ? mine : list);
    }

    /** 창 위 메모 탭(만든 순서) — { id, label, by, mine, updatedAt, strokes } */
    function sheetTabs(st, floorKey, me) {
        var meKey = String(me || '').trim();
        return listFor(st, floorKey).map(function (r) {
            return {
                id: r.id,
                label: labelFor(st, floorKey, r.id, me),
                title: r.title || '',
                by: authorKey(r),
                mine: !!meKey && authorKey(r) === meKey,
                updatedAt: r.updatedAt || r.createdAt || 0,
                strokes: (r.strokes || []).length
            };
        });
    }

    /**
     * 저장할 획 = 창의 획 + 저장소에만 있는 획(창을 연 뒤 다른 기기·사람이 같은 메모에 이어 쓴 것).
     * 이번에 창에서 그렸다가 되돌리기·전체 지우기로 뺀 획(sessionKeys)만 되살리지 않는다. 획 ID로 합친다(덮어쓰기 없음).
     */
    function mergeEditorStrokes(editorStrokes, storedStrokes, sessionKeys) {
        var drop = sessionKeys instanceof Set ? sessionKeys : new Set(sessionKeys || []);
        var keepStored = (storedStrokes || []).filter(function (x) { return x && !drop.has(strokeKey(x)); });
        return unionStrokes(editorStrokes || [], keepStored);
    }

    /** 자리가 없는 옛 장(팝업 전용 시절) → 도면 왼쪽 위부터 차례로(모든 기기에서 같은 자리, 저장은 안 함) */
    function placedPoint(st, floorKey, rec, imgW, imgH) {
        if (rec && rec.x != null && rec.y != null) return { x: Number(rec.x), y: Number(rec.y), legacy: false };
        var list = listFor(st, floorKey).filter(function (r) { return r.x == null || r.y == null; });
        var i = Math.max(0, list.findIndex(function (r) { return r.id === (rec && rec.id); }));
        var W = Number(imgW) || 1200, H = Number(imgH) || 800;
        return { x: Math.round(W * 0.04), y: Math.round(H * 0.06 + i * H * 0.06), legacy: true };
    }

    function deleteSheet(st, floorKey, id) {
        if (!st || !floorKey || !id) return false;
        ensureMaps(st);
        var list = st.sketchMemos[floorKey] || [];
        var rec = list.find(function (r) { return r && r.id === id; });
        if (!rec) return false;
        st.sketchMemos[floorKey] = list.filter(function (r) { return r && r.id !== id; });
        var ids = new Set(st.deletedSketchIds[floorKey] || []);
        ids.add(id);
        st.deletedSketchIds[floorKey] = Array.from(ids);
        if (!st.deletedSketchAt[floorKey]) st.deletedSketchAt[floorKey] = {};
        st.deletedSketchAt[floorKey][id] = Math.max(1, Number(rec.updatedAt) || 0);
        return true;
    }

    function packFor(st, floorKey) {
        return {
            items: listFor(st, floorKey).map(function (m) {
                var o = { id: m.id, title: m.title || '', w: m.w, h: m.h, strokes: m.strokes || [], by: m.by || '', createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0 };
                if (m.byUid) o.byUid = m.byUid;
                if (m.x != null && m.y != null) { o.x = m.x; o.y = m.y; }
                return o;
            }),
            deletedIds: ((st && st.deletedSketchIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedSketchAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        if (!pack) return false;
        return !!((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length));
    }

    /** 획 하나의 같음 판정 키: 획 ID, 없으면(옛 획) 내용 그대로 */
    function strokeKey(s) {
        if (!s) return '';
        if (s.i) return 'i:' + s.i;
        return 'h:' + s.c + '|' + s.w + '|' + (s.e ? 1 : 0) + '|' + (s.p || []).join(',');
    }

    /**
     * 2026-10-16 같은 메모(같은 id)를 여러 사람·기기가 이어 쓰면 획을 합친다(합집합) — 나중 저장이 통째로 이겨
     * 남의 획이 사라지지 않게. 순서: 한쪽(a) 순서 + 다른 쪽에만 있는 획을 뒤에. 지우는 기능이 없으므로 묘비 없음.
     */
    function unionStrokes(a, b) {
        var seen = new Set();
        var out = [];
        (a || []).concat(b || []).forEach(function (s) {
            var k = strokeKey(s);
            if (!k || seen.has(k)) return;
            seen.add(k);
            out.push(s);
        });
        return out;
    }

    /** 서버 층 묶음의 손글씨를 이 기기 것과 합친다. 같은 메모는 획 합집합, 나머지는 mergeNdtDataMaps 그대로. pack이 없으면 아무것도 안 한다. */
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var localList = st.sketchMemos[floorKey] || [];
        var localById = {};
        localList.forEach(function (r) { if (r && r.id) localById[r.id] = r; });
        var serverItems = (pack.items || []).map(function (sv) {
            var lc = sv && sv.id ? localById[sv.id] : null;
            if (!lc) return sv;
            var merged = unionStrokes(sv.strokes, lc.strokes);
            var at = Math.max(Number(sv.updatedAt) || 0, Number(lc.updatedAt) || 0);
            lc.strokes = merged;
            lc.updatedAt = at;
            return Object.assign({}, sv, { strokes: merged, updatedAt: at });
        });
        var o1 = {}; o1[floorKey] = serverItems;
        var o2 = {}; o2[floorKey] = pack.deletedIds || [];
        var o3 = {}; o3[floorKey] = pack.deletedAt || {};
        var r = mergeFn(o1, st.sketchMemos, o2, st.deletedSketchIds, o3, st.deletedSketchAt);
        st.sketchMemos = r.ndtData;
        st.deletedSketchIds = r.deletedNdtIds;
        st.deletedSketchAt = r.deletedNdtAt || {};
        return true;
    }

    /** 선 하나 그리기(필압 → 굵기). ctx 좌표계 = 종이 좌표 × scale */
    function drawStroke(ctx, s, scale) {
        var p = s.p;
        var k = Number(scale) || 1;
        ctx.save();
        ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
        ctx.strokeStyle = s.e ? '#000' : s.c;
        ctx.fillStyle = s.e ? '#000' : s.c;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        var base = s.w * (s.e ? 3 : 1);
        var widthAt = function (pr) { return Math.max(0.6, base * (s.e ? 1 : (0.3 + 0.9 * (pr / 100)))) * k; };
        if (p.length === 3) {
            ctx.beginPath();
            ctx.arc(p[0] * k, p[1] * k, widthAt(p[2]) / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            for (var i = 3; i + 2 < p.length; i += 3) {
                ctx.beginPath();
                ctx.lineWidth = widthAt((p[i - 1] + p[i + 2]) / 2);
                ctx.moveTo(p[i - 3] * k, p[i - 2] * k);
                ctx.lineTo(p[i] * k, p[i + 1] * k);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // ---- 2026-10-20 「메모는 층을 분류하지 말고 그냥 통합 · 기본은 개인 계정별 · 출력하면 각자 쓴 것들」 ----
    // 저장·동기화는 그대로 층 묶음(층키)에 실린다(획 합집합·묘비 병합 그대로, 서버 형식 안 바뀜). 보이는 것·출력은 건물 전체를
    // 한데 모아 계정(작성자)별로 본다. 새 메모는 건물의 기본 층(homeFloorKey)에 저장, 고친 메모는 원래 있던 층키에 그대로.
    // 옛 층별 메모: 작성자(by)가 있으면 그 사람 것, 없으면 「이전 메모」.
    var LEGACY_LABEL = '이전 메모';
    function normMe(me) {
        if (me && typeof me === 'object') return { uid: String(me.uid || '').trim(), name: String(me.name || '').trim() };
        return { uid: '', name: String(me || '').trim() };
    }
    /** 작성자 묶음 키: 계정 uid → 없으면 이름 → 둘 다 없으면 '' (이전 메모) */
    function ownerKey(rec) {
        if (!rec) return '';
        if (rec.byUid) return 'u:' + String(rec.byUid);
        var n = authorKey(rec);
        return n ? 'n:' + n : '';
    }
    function isMine(rec, me) {
        var m = normMe(me);
        if (!rec) return false;
        if (rec.byUid) return !!m.uid && rec.byUid === m.uid;
        var n = authorKey(rec);
        return !!n && !!m.name && n === m.name;
    }
    /** 건물의 모든 메모 [{ floorKey, rec }] — 만든 순서 */
    function listForBuilding(st, bldgId) {
        if (!st || !bldgId || !st.sketchMemos) return [];
        var prefix = String(bldgId) + '_';
        var out = [];
        Object.keys(st.sketchMemos).forEach(function (k) {
            if (k.indexOf(prefix) !== 0) return;
            (st.sketchMemos[k] || []).forEach(function (r) { if (r && r.id) out.push({ floorKey: k, rec: r }); });
        });
        out.sort(function (a, b) { return ((a.rec.createdAt || 0) - (b.rec.createdAt || 0)) || (a.rec.id < b.rec.id ? -1 : a.rec.id > b.rec.id ? 1 : 0); });
        return out;
    }
    function floorKeyOf(st, bldgId, id) {
        var hit = listForBuilding(st, bldgId).find(function (x) { return x.rec.id === id; });
        return hit ? hit.floorKey : '';
    }
    function findInBuilding(st, bldgId, id) {
        var hit = listForBuilding(st, bldgId).find(function (x) { return x.rec.id === id; });
        return hit ? hit.rec : null;
    }
    /** 창에 보이는 메모 — 내 것 + 이전 메모(작성자 모름). 남의 계정 메모는 출력에만 */
    function visibleForMe(st, bldgId, me) {
        return listForBuilding(st, bldgId).filter(function (x) { return isMine(x.rec, me) || !ownerKey(x.rec); });
    }
    function buildingTabs(st, bldgId, me) {
        var mineN = 0, oldN = 0;
        return visibleForMe(st, bldgId, me).map(function (x) {
            var r = x.rec;
            var mine = isMine(r, me);
            return {
                id: r.id, title: r.title || '', by: authorKey(r), mine: mine,
                label: mine ? '메모-' + (++mineN) : LEGACY_LABEL + '-' + (++oldN),
                updatedAt: r.updatedAt || r.createdAt || 0, strokes: (r.strokes || []).length
            };
        });
    }
    function nextMineLabel(st, bldgId, me) {
        return '메모-' + (listForBuilding(st, bldgId).filter(function (x) { return isMine(x.rec, me); }).length + 1);
    }
    /** 처음 보일 장 — 내가 마지막으로 고친 메모. 내 것이 없으면 null(새 종이) */
    function pickInitialForBuilding(st, bldgId, me) {
        var mine = listForBuilding(st, bldgId).filter(function (x) { return isMine(x.rec, me); }).map(function (x) { return x.rec; });
        if (!mine.length) return null;
        return mine.slice().sort(function (a, b) {
            return ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)) || ((b.createdAt || 0) - (a.createdAt || 0));
        })[0];
    }
    /** 한글 출력 — 모든 계정 메모를 작성자별로(처음 쓴 순서), 「홍길동 메모-1」, 작성자 모름은 「이전 메모-1」(맨 뒤) */
    function outputGroups(st, bldgId) {
        var groups = [];
        var byKey = {};
        var all = listForBuilding(st, bldgId);
        // 옛 메모(이름만)는 같은 이름 계정 메모와 한 묶음
        var nameToUid = {};
        all.forEach(function (x) { var n = authorKey(x.rec); if (x.rec.byUid && n && !nameToUid[n]) nameToUid[n] = x.rec.byUid; });
        all.forEach(function (x) {
            var r = x.rec;
            if (!Array.isArray(r.strokes) || !r.strokes.some(function (s) { return s && !s.e; })) return;
            var k = ownerKey(r);
            if (k.indexOf('n:') === 0 && nameToUid[authorKey(r)]) k = 'u:' + nameToUid[authorKey(r)];
            if (!byKey[k]) { byKey[k] = { key: k, name: k ? (authorKey(r) || '작성자') : LEGACY_LABEL, items: [] }; groups.push(byKey[k]); }
            byKey[k].items.push(r);
        });
        groups.sort(function (a, b) { return (a.key ? 0 : 1) - (b.key ? 0 : 1); });
        var out = [];
        groups.forEach(function (g) {
            g.items.forEach(function (r, i) {
                out.push({ rec: r, author: g.name, label: (g.key ? g.name + ' 메모-' : LEGACY_LABEL + '-') + (i + 1) });
            });
        });
        return out;
    }
    /** 새 메모를 저장할 층키 — 건물 층 목록의 첫 층(늘 동기화되는 층), 없으면 지금 층 */
    function homeFloorKey(bldgId, floorCodes, currentFloor) {
        var codes = (floorCodes || []).filter(Boolean);
        var code = codes.length ? codes[0] : currentFloor;
        return (bldgId && code) ? String(bldgId) + '_' + code : '';
    }

    var api = {
        MAX_POINTS: MAX_POINTS,
        COLORS: COLORS,
        ensureMaps: ensureMaps,
        cleanStroke: cleanStroke,
        pointCount: pointCount,
        listFor: listFor,
        saveSheet: saveSheet,
        deleteSheet: deleteSheet,
        labelFor: labelFor,
        pickInitialSheet: pickInitialSheet,
        sheetTabs: sheetTabs,
        mergeEditorStrokes: mergeEditorStrokes,
        unionStrokes: unionStrokes,
        strokeKey: strokeKey,
        placedPoint: placedPoint,
        packFor: packFor,
        packHasContent: packHasContent,
        mergePackIntoState: mergePackIntoState,
        drawStroke: drawStroke,
        LEGACY_LABEL: LEGACY_LABEL,
        ownerKey: ownerKey,
        isMine: isMine,
        listForBuilding: listForBuilding,
        floorKeyOf: floorKeyOf,
        findInBuilding: findInBuilding,
        visibleForMe: visibleForMe,
        buildingTabs: buildingTabs,
        nextMineLabel: nextMineLabel,
        pickInitialForBuilding: pickInitialForBuilding,
        outputGroups: outputGroups,
        homeFloorKey: homeFloorKey
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.sketchMemo = api;
    }
})(typeof window !== 'undefined' ? window : null);
