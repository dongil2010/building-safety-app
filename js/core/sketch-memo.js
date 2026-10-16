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
        return { c: String(s.c || COLORS[0]).slice(0, 16), w: Math.max(1, Math.min(60, Math.round(Number(s.w) || 3))), e: s.e ? 1 : 0, p: p };
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
            by: sheet.by || (cur && cur.by) || '',
            createdAt: (cur && cur.createdAt) || Number(sheet.createdAt) || t,
            updatedAt: Math.max(t, ((cur && cur.updatedAt) || 0) + 1)
        };
        if (cur) list[list.indexOf(cur)] = rec; else list.push(rec);
        // 같은 id 묘비가 있으면(지운 뒤 되돌리기 등) 새 저장이 더 나중이라 병합에서 살아남는다
        return rec;
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
                return { id: m.id, title: m.title || '', w: m.w, h: m.h, strokes: m.strokes || [], by: m.by || '', createdAt: m.createdAt || 0, updatedAt: m.updatedAt || 0 };
            }),
            deletedIds: ((st && st.deletedSketchIds) || {})[floorKey] || [],
            deletedAt: ((st && st.deletedSketchAt) || {})[floorKey] || {}
        };
    }

    function packHasContent(pack) {
        if (!pack) return false;
        return !!((pack.items && pack.items.length) || (pack.deletedIds && pack.deletedIds.length));
    }

    /** 서버 층 묶음의 손글씨를 이 기기 것과 합친다(mergeNdtDataMaps 그대로). pack이 없으면 아무것도 안 한다. */
    function mergePackIntoState(st, floorKey, pack, mergeFn) {
        if (!st || !floorKey || !pack || typeof mergeFn !== 'function') return false;
        ensureMaps(st);
        var o1 = {}; o1[floorKey] = pack.items || [];
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

    var api = {
        MAX_POINTS: MAX_POINTS,
        COLORS: COLORS,
        ensureMaps: ensureMaps,
        cleanStroke: cleanStroke,
        pointCount: pointCount,
        listFor: listFor,
        saveSheet: saveSheet,
        deleteSheet: deleteSheet,
        packFor: packFor,
        packHasContent: packHasContent,
        mergePackIntoState: mergePackIntoState,
        drawStroke: drawStroke
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        root.BSA = root.BSA || {};
        root.BSA.sketchMemo = api;
    }
})(typeof window !== 'undefined' ? window : null);
