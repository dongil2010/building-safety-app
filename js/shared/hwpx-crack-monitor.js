/**
 * 한글(HWPX) 균열게이지·균열팁 측정 표 규칙.
 *
 * 2026-09-29 (1) "입력 안 한 측정값이 튀어나온다" — 양식(templates/hwpx_crack_monitor.hwpx)에
 * 다른 건물 예시값이 있었고 앱은 입력한 칸만 덮어썼다. 그래서 모든 칸을 앱이 정한다.
 * 입력 안 한 칸은 빈칸.
 * 2026-09-29 (2) 새 양식 + 요청:
 *  - 측정일은 날짜까지 입력하지만 표에는 **년·월**(2026. 09)만. 같은 달 측정은 한 줄,
 *    한 게이지가 같은 달에 여러 번 쟀으면 그 달의 **가장 늦은** 측정.
 *  - 측정 횟수·게이지 수에 제한 없음. 줄·열을 늘리고 많으면 글자를 줄인다.
 *    게이지가 MAX_SLOTS_PER_TABLE개를 넘으면 표를 나눈다(같은 머리글).
 *  - 변화량 = 초기값 − 금회 측정값 (사용자 지정). Y(↓)·X(→) 성분별, 값이 없으면 빈칸.
 *
 * 표 모양: 0~2줄 머리글(측정일 / 위치·측정값 / 비고, 게이지 이름, 종류), 3줄 초기값,
 * 4줄부터 달마다 한 줄, 마지막 줄 변화량. 0열 측정일, 1..n열 게이지, n+1열 비고.
 * DOM을 쓰지 않는 순수 함수라 Node 테스트와 브라우저에서 같은 코드가 돈다.
 */
(function (root) {
    'use strict';

    var HEADER_ROWS = 3;          // 0~2
    var INITIAL_ROW = 3;
    var FIRST_DATA_ROW = 4;
    var TEMPLATE_SLOTS = 3;       // 양식에 그려진 게이지 열 수
    var TEMPLATE_DATA_ROWS = 11;  // 양식에 그려진 측정 줄 수 (이만큼은 글자 그대로)
    var MAX_SLOTS_PER_TABLE = 6;
    var MIN_SCALE = 0.6;
    var INITIAL_LABEL = '초기 부착 data';
    var CHANGE_LABEL = '변화량(초기값-금회측정)';

    function isBlank(v) {
        return v == null || String(v).trim() === '';
    }

    function clean(t) {
        if (t == null) return '';
        var s = String(t).trim();
        return s === '-' ? '' : s;
    }

    function num(v) {
        if (isBlank(v)) return null;
        var n = Number(String(v).trim().replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    function fmtNum(n) {
        var r = Math.round(n * 100) / 100;
        if (Object.is(r, -0)) r = 0;
        return String(r);
    }

    function slotLog(slot) {
        return (slot && (slot.kind === 'tip' ? slot.tip : slot.gauge)) || {};
    }

    function readingHasValue(slot, r) {
        if (!r) return false;
        if (slot.kind === 'tip') return !isBlank(r.lengthMm);
        return !isBlank(r.xMm) || !isBlank(r.yMm);
    }

    /** 측정 한 건의 달: 날짜가 있으면 "2026. 09"(정렬 "2026-09"), 없으면 회차 키 그대로 */
    function monthOf(reading) {
        if (!reading) return null;
        var d = String(reading.date || '').trim();
        var m = d.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})/);
        if (m) {
            var mm = ('0' + m[2]).slice(-2);
            return { key: m[1] + '. ' + mm, sort: m[1] + '-' + mm, day: dayOf(d) };
        }
        var rk = String(reading.roundKey || '').trim();
        if (rk) return { key: rk, sort: rk, day: '' };
        return null;
    }

    function dayOf(d) {
        var m = String(d || '').match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
        if (!m) return '';
        return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    }

    /**
     * 값 있는 측정만 달별로 하나씩(그 달 가장 늦은 날짜, 같은 날이면 나중에 입력한 것), 달 순서대로.
     * [{ key, sort, reading }]
     */
    function monthlyReadings(slot) {
        var list = (slotLog(slot).readings) || [];
        var byMonth = {};
        var order = [];
        list.forEach(function (r, idx) {
            if (!readingHasValue(slot, r)) return;
            var mo = monthOf(r);
            if (!mo) return;
            var cur = byMonth[mo.sort];
            if (!cur) { order.push(mo.sort); byMonth[mo.sort] = { key: mo.key, sort: mo.sort, day: mo.day, idx: idx, reading: r }; return; }
            if (mo.day > cur.day || (mo.day === cur.day && idx > cur.idx)) {
                byMonth[mo.sort] = { key: mo.key, sort: mo.sort, day: mo.day, idx: idx, reading: r };
            }
        });
        return order.slice().sort().map(function (k) {
            var e = byMonth[k];
            return { key: e.key, sort: e.sort, reading: e.reading };
        });
    }

    /** 변화량 = 초기값 − 금회(가장 늦은 달) 측정값. 성분별, 둘 중 하나라도 없으면 그 성분은 뺀다. */
    function changeOf(slot) {
        var log = slotLog(slot);
        var months = monthlyReadings(slot);
        var last = months.length ? months[months.length - 1].reading : null;
        var parts = [];
        if (last) {
            if (slot.kind === 'tip') {
                var i0 = num(log.initialLengthMm); var c0 = num(last.lengthMm);
                if (i0 != null && c0 != null) parts.push({ axis: 'len', value: i0 - c0 });
            } else {
                var iy = num(log.initialY); var cy = num(last.yMm);
                var ix = num(log.initialX); var cx = num(last.xMm);
                if (iy != null && cy != null) parts.push({ axis: 'y', value: iy - cy });
                if (ix != null && cx != null) parts.push({ axis: 'x', value: ix - cx });
            }
        }
        var text = parts.map(function (p) {
            var v = fmtNum(p.value) + 'mm';
            if (p.axis === 'y') return '↓ ' + v;
            if (p.axis === 'x') return '→ ' + v;
            return v;
        }).join(' / ');
        return {
            parts: parts,
            text: text,
            allZero: parts.length > 0 && parts.every(function (p) { return Math.round(p.value * 100) === 0; })
        };
    }

    function gaugeText(fmt, y, x, prevY, prevX, opts) {
        var parts = [];
        if (!isBlank(y)) parts.push(clean(fmt.gaugeAxis('y', y, prevY, opts)));
        if (!isBlank(x)) parts.push(clean(fmt.gaugeAxis('x', x, prevX, opts)));
        return parts.filter(Boolean).join(' / ');
    }

    function readingText(slot, fmt, reading, prev) {
        if (!reading) return '';
        if (slot.kind === 'tip') return clean(fmt.tipLength(reading.lengthMm, {}));
        return gaugeText(fmt, reading.yMm, reading.xMm, prev && prev.yMm, prev && prev.xMm, {});
    }

    /** 게이지를 표 하나에 들어갈 만큼씩 나눈다 */
    function groupSlots(slots, maxPer) {
        var list = slots || [];
        var max = maxPer || MAX_SLOTS_PER_TABLE;
        // 고르게 나눈다: 7개면 6+1이 아니라 4+3
        var tables = Math.max(1, Math.ceil(list.length / max));
        var per = Math.ceil(list.length / tables) || 1;
        var out = [];
        list.forEach(function (s, i) {
            if (i % per === 0) out.push([]);
            out[out.length - 1].push(s);
        });
        return out;
    }

    /** 글자 배율: 양식(게이지 3열·측정 11줄)보다 많으면 비례해서 줄인다, MIN_SCALE까지 */
    function fontScale(nSlots, nDataRows) {
        var c = nSlots <= TEMPLATE_SLOTS ? 1 : TEMPLATE_SLOTS / nSlots;
        var r = nDataRows <= TEMPLATE_DATA_ROWS ? 1 : TEMPLATE_DATA_ROWS / nDataRows;
        var s = Math.min(c, r);
        s = Math.floor(s * 20) / 20; // 0.05 단위
        return Math.max(MIN_SCALE, Math.min(1, s));
    }

    /**
     * 표 하나(게이지 묶음)의 모양과 칸 값.
     * fmt: { header(slot), typeLabel(slot), gaugeAxis(axis, val, prevVal, opts), tipLength(val, opts) }
     * 돌려줌: { nSlots, months[], dataRows, rowCnt, colCnt, changeRow, noteCol, scale, cells{"행,열": 글자} }
     */
    function buildTableLayout(groupSlotList, fmt) {
        var slots = groupSlotList || [];
        var n = Math.max(1, slots.length);
        var perSlot = slots.map(function (s) { return monthlyReadings(s); });
        var monthSet = {};
        perSlot.forEach(function (list) {
            list.forEach(function (e) { if (!monthSet[e.sort]) monthSet[e.sort] = e.key; });
        });
        var monthSorts = Object.keys(monthSet).sort();
        var dataRows = Math.max(1, monthSorts.length);
        var changeRow = FIRST_DATA_ROW + dataRows;
        var noteCol = n + 1;
        var cells = {};
        function set(r, c, t) { cells[r + ',' + c] = t == null ? '' : String(t); }

        // 모든 칸을 먼저 비운다 (양식 예시값이 남지 않게)
        set(0, 0, '측정일'); set(0, 1, '위치/측정값(㎜)'); set(0, noteCol, '비고');
        for (var c = 1; c <= n; c += 1) { set(1, c, ''); set(2, c, ''); }
        for (var r = INITIAL_ROW; r <= changeRow; r += 1) {
            for (var cc = 0; cc <= noteCol; cc += 1) set(r, cc, '');
        }
        set(INITIAL_ROW, 0, INITIAL_LABEL);
        set(changeRow, 0, CHANGE_LABEL);

        slots.forEach(function (slot, i) {
            var col = i + 1;
            var log = slotLog(slot);
            set(1, col, fmt.header(slot) || '');
            set(2, col, fmt.typeLabel(slot) || '');
            if (slot.kind === 'tip') {
                set(INITIAL_ROW, col, isBlank(log.initialLengthMm) ? '' : clean(fmt.tipLength(log.initialLengthMm, { isInitial: true })));
            } else {
                set(INITIAL_ROW, col, gaugeText(fmt, log.initialY, log.initialX, null, null, { isInitial: true }));
            }
            var list = perSlot[i];
            list.forEach(function (e, k) {
                var row = FIRST_DATA_ROW + monthSorts.indexOf(e.sort);
                set(row, col, readingText(slot, fmt, e.reading, k > 0 ? list[k - 1].reading : null));
            });
            set(changeRow, col, changeOf(slot).text);
        });
        monthSorts.forEach(function (ms, k) {
            var row = FIRST_DATA_ROW + k;
            set(row, 0, monthSet[ms]);
            set(row, noteCol, '-');
        });
        var rowHasValue = function (row) {
            for (var c2 = 1; c2 <= n; c2 += 1) if (cells[row + ',' + c2]) return true;
            return false;
        };
        if (rowHasValue(INITIAL_ROW)) set(INITIAL_ROW, noteCol, '-');
        if (rowHasValue(changeRow)) set(changeRow, noteCol, '-');

        return {
            nSlots: n,
            months: monthSorts.map(function (k) { return monthSet[k]; }),
            dataRows: dataRows,
            rowCnt: changeRow + 1,
            colCnt: n + 2,
            changeRow: changeRow,
            noteCol: noteCol,
            scale: fontScale(n, dataRows),
            cells: cells
        };
    }

    /** 요약 사진표(4줄): 사진NO / 부재 / 부위 / 측정값(가장 늦은 달) / 변화량 */
    function buildSummaryCells(item, photoNo, fmt) {
        var months = monthlyReadings(item);
        var last = months.length ? months[months.length - 1].reading : null;
        var ch = changeOf(item);
        var labels = (fmt.roundLabels && fmt.roundLabels(item)) || {};
        return {
            '1,0': String(photoNo),
            '1,1': fmt.member(item) || '',
            '1,2': fmt.location(item) || '',
            '1,4': last ? readingText(item, fmt, last, null) : '',
            '1,5': ch.allZero ? '변화無' : ch.text,
            '3,0': labels.prev || '전회 측정',
            '3,3': labels.curr || '금회 측정'
        };
    }

    /**
     * 양식 맨 위 문단 고르기. infos[i] = { tables: [{ rows, pics }], text }
     *  - data: 측정표(머리글+초기+측정+변화량, 5줄 이상이고 요약표가 아닌 첫 표)가 든 문단
     *  - summaryProto: 사진이 가장 많은 4줄 요약표 문단(같으면 앞의 것)
     *  - tail: 마지막 요약표 뒤 표 없는 문단(맺음말)만, 예시 위치도("측정위치도") 전까지
     */
    function planStampParas(infos) {
        if (!infos || !infos.length) return null;
        var data = -1;
        for (var i = 1; i < infos.length; i += 1) {
            if ((infos[i].tables || []).some(function (t) { return t.rows >= 5; })) { data = i; break; }
        }
        if (data < 0) return null;
        var summaries = [];
        infos.forEach(function (info, idx) {
            if (idx > data && (info.tables || []).some(function (t) { return t.rows === 4; })) summaries.push(idx);
        });
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
        return { title: 0, data: data, summaryProto: summaryProto, tail: tail };
    }

    var api = {
        HEADER_ROWS: HEADER_ROWS,
        INITIAL_ROW: INITIAL_ROW,
        FIRST_DATA_ROW: FIRST_DATA_ROW,
        MAX_SLOTS_PER_TABLE: MAX_SLOTS_PER_TABLE,
        CHANGE_LABEL: CHANGE_LABEL,
        monthOf: monthOf,
        monthlyReadings: monthlyReadings,
        changeOf: changeOf,
        groupSlots: groupSlots,
        fontScale: fontScale,
        buildTableLayout: buildTableLayout,
        buildSummaryCells: buildSummaryCells,
        planStampParas: planStampParas
    };

    root.BSA = root.BSA || {};
    root.BSA.hwpxCrackMonitor = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
