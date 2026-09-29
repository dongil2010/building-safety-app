/**
 * 한글(HWPX) 균열게이지·균열팁 측정 표 채우기 규칙.
 *
 * 2026-09-29 "입력 안 한 측정값이 튀어나온다"는 신고. 원인은 양식
 * (templates/hwpx_crack_monitor.hwpx)에 다른 건물의 예시 측정값이 그대로 들어 있고,
 * 앱은 입력한 칸만 덮어써서 나머지 칸에 예시값이 남았던 것이다.
 *  - 2014~2020년 예시값이 든 17줄 표는 아예 채우지 않고 그대로 나갔다.
 *  - 16줄 "현재" 표도 게이지가 3개보다 적으면 빈 열에 예시 머리글·측정값이 남았다.
 *  - 요약 사진표 원본 셋 중 하나를 빈 문단으로 잘못 골라서, 채우지 않은 예시 표가 따로 붙었다.
 *
 * 그래서 이제 표의 **모든 칸을 먼저 비우고** 입력한 값만 넣는다. 입력 안 한 칸은 빈칸.
 * DOM을 쓰지 않는 순수 함수라 Node 테스트와 브라우저에서 같은 코드가 돈다.
 */
(function (root) {
    'use strict';

    var FIRST_DATA_ROW = 4;
    var LAST_DATA_ROW = 14;
    var CHANGE_ROW = 15;
    var SLOT_COLS = [1, 2, 3];
    var NOTE_COL = 4;
    var INITIAL_LABEL = '초기 부착 data';
    var CHANGE_LABEL = '변화량(금회측정-초기값)';

    function isBlank(v) {
        return v == null || String(v).trim() === '';
    }

    /** 포맷 함수가 "값 없음"으로 돌려준 '-'도 빈칸으로 */
    function clean(t) {
        if (t == null) return '';
        var s = String(t).trim();
        return s === '-' ? '' : s;
    }

    function slotLog(slot) {
        return slot && (slot.kind === 'tip' ? slot.tip : slot.gauge);
    }

    function readingHasValue(slot, r) {
        if (!r) return false;
        if (slot.kind === 'tip') return !isBlank(r.lengthMm);
        return !isBlank(r.xMm) || !isBlank(r.yMm);
    }

    /** 값을 하나라도 입력한 측정 행만 (날짜만 있고 값이 빈 행은 버림) */
    function valuedReadings(slot) {
        var log = slotLog(slot);
        var list = (log && log.readings) || [];
        return list.filter(function (r) { return readingHasValue(slot, r); });
    }

    /** 값 있는 측정 행만 남긴 사본 — 변화량 계산이 빈 마지막 행을 보지 않게 */
    function slotWithValued(slot) {
        var copy = {};
        Object.keys(slot).forEach(function (k) { copy[k] = slot[k]; });
        var key = slot.kind === 'tip' ? 'tip' : 'gauge';
        var log = {};
        Object.keys(slot[key] || {}).forEach(function (k) { log[k] = slot[key][k]; });
        log.readings = valuedReadings(slot);
        copy[key] = log;
        return copy;
    }

    function gaugeText(fmt, y, x, prevY, prevX, opts) {
        var parts = [];
        if (!isBlank(y)) parts.push(clean(fmt.gaugeAxis('y', y, prevY, opts)));
        if (!isBlank(x)) parts.push(clean(fmt.gaugeAxis('x', x, prevX, opts)));
        return parts.filter(Boolean).join(' / ');
    }

    /**
     * 16줄 현재 측정표의 칸 값 전부. 키는 "행,열", 값은 넣을 글자.
     * fmt: { header(slot), typeLabel(slot), gaugeAxis(axis, val, prevVal, opts),
     *        tipLength(val, opts), change(slot), date(reading) }
     */
    function buildCurrentTableCells(slots, fmt) {
        var cells = {};
        function set(r, c, t) { cells[r + ',' + c] = t == null ? '' : String(t); }

        // 1) 모든 값 칸을 비운다 — 양식 속 예시 머리글·측정값이 남지 않게
        SLOT_COLS.forEach(function (c) { set(1, c, ''); set(2, c, ''); });
        for (var r = 3; r <= CHANGE_ROW; r += 1) {
            set(r, 0, '');
            SLOT_COLS.forEach(function (c) { set(r, c, ''); });
            set(r, NOTE_COL, '');
        }
        set(3, 0, INITIAL_LABEL);
        set(CHANGE_ROW, 0, CHANGE_LABEL);

        var used = (slots || []).filter(function (s) { return s && SLOT_COLS.indexOf(s.col) >= 0; });

        // 2) 머리글·초기값
        used.forEach(function (slot) {
            set(1, slot.col, fmt.header(slot) || '');
            set(2, slot.col, fmt.typeLabel(slot) || '');
            var log = slotLog(slot) || {};
            if (slot.kind === 'tip') {
                set(3, slot.col, isBlank(log.initialLengthMm) ? '' : clean(fmt.tipLength(log.initialLengthMm, { isInitial: true })));
            } else {
                set(3, slot.col, gaugeText(fmt, log.initialY, log.initialX, null, null, { isInitial: true }));
            }
        });
        if (used.some(function (s) { return cells['3,' + s.col]; })) set(3, NOTE_COL, '-');

        // 3) 측정일별 값 (같은 날짜는 한 줄로), 줄이 모자라면 최근 것을 남긴다
        var dateKeys = [];
        var dateMap = {};
        used.forEach(function (slot) {
            var list = valuedReadings(slot);
            list.forEach(function (reading, idx) {
                var key = fmt.date(reading) || '';
                if (!key) return;
                if (!dateMap[key]) { dateMap[key] = {}; dateKeys.push(key); }
                dateMap[key][slot.col] = { slot: slot, reading: reading, prev: idx > 0 ? list[idx - 1] : null };
            });
        });
        var maxRows = LAST_DATA_ROW - FIRST_DATA_ROW + 1;
        if (dateKeys.length > maxRows) dateKeys = dateKeys.slice(dateKeys.length - maxRows);
        dateKeys.forEach(function (dk, i) {
            var row = FIRST_DATA_ROW + i;
            set(row, 0, dk);
            used.forEach(function (slot) {
                var hit = dateMap[dk][slot.col];
                if (!hit) return;
                var rd = hit.reading;
                var pv = hit.prev;
                if (slot.kind === 'tip') set(row, slot.col, clean(fmt.tipLength(rd.lengthMm, {})));
                else set(row, slot.col, gaugeText(fmt, rd.yMm, rd.xMm, pv && pv.yMm, pv && pv.xMm, {}));
            });
            set(row, NOTE_COL, '-');
        });

        // 4) 변화량 — 측정값이 있어야만
        var anyChange = false;
        used.forEach(function (slot) {
            var t = valuedReadings(slot).length ? clean(fmt.change(slotWithValued(slot))) : '';
            set(CHANGE_ROW, slot.col, t);
            if (t) anyChange = true;
        });
        if (anyChange) set(CHANGE_ROW, NOTE_COL, '-');
        return cells;
    }

    /** 요약 사진표(4줄) 글자 칸 전부. 사진 칸은 따로. */
    function buildSummaryCells(item, photoNo, fmt) {
        var hasReading = valuedReadings(item).length > 0;
        var labels = fmt.roundLabels(item) || {};
        return {
            '1,0': String(photoNo),
            '1,1': fmt.member(item) || '',
            '1,2': fmt.location(item) || '',
            '1,4': hasReading ? clean(fmt.summaryChange(slotWithValued(item))) : '',
            '1,5': '-',
            '3,0': labels.prev || '전회 측정',
            '3,3': labels.curr || '금회 측정'
        };
    }

    /**
     * 양식의 맨 위 문단들을 보고 어떤 문단을 쓸지 정한다.
     * infos[i] = { tables: [{ rows, pics }], text }
     * 돌려줌: { title, data, currentRows, summaryProto, tail[] } — 못 찾으면 null
     *  - data: 16줄 현재표가 든 문단 (같은 문단의 다른 표 = 예시 이력표, 지운다)
     *  - summaryProto: 사진 2장짜리 4줄 요약표가 든 문단 (모든 게이지에 같은 원본)
     *  - tail: 마지막 요약표 뒤의 표 없는 문단(맺음말)만, 예시 위치도("측정위치도") 전까지
     */
    function planStampParas(infos) {
        if (!infos || !infos.length) return null;
        var has = function (info, rows) {
            return (info.tables || []).some(function (t) { return t.rows === rows; });
        };
        var data = -1;
        for (var i = 0; i < infos.length; i += 1) { if (has(infos[i], 16)) { data = i; break; } }
        if (data < 0) return null;
        var summaries = [];
        infos.forEach(function (info, idx) { if (idx > data && has(info, 4)) summaries.push(idx); });
        if (!summaries.length) return null;
        var bestPics = -1;
        var summaryProto = summaries[0];
        summaries.forEach(function (idx) {
            var pics = Math.max.apply(null, infos[idx].tables.filter(function (t) { return t.rows === 4; }).map(function (t) { return t.pics || 0; }));
            if (pics > bestPics) { bestPics = pics; summaryProto = idx; }
        });
        var tail = [];
        for (var k = summaries[summaries.length - 1] + 1; k < infos.length; k += 1) {
            if (String(infos[k].text || '').indexOf('측정위치도') >= 0) break;
            if ((infos[k].tables || []).length) continue;
            tail.push(k);
        }
        return { title: 0, data: data, currentRows: 16, summaryProto: summaryProto, tail: tail };
    }

    var api = {
        FIRST_DATA_ROW: FIRST_DATA_ROW,
        LAST_DATA_ROW: LAST_DATA_ROW,
        CHANGE_ROW: CHANGE_ROW,
        buildCurrentTableCells: buildCurrentTableCells,
        buildSummaryCells: buildSummaryCells,
        planStampParas: planStampParas,
        valuedReadings: valuedReadings
    };

    root.BSA = root.BSA || {};
    root.BSA.hwpxCrackMonitor = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
