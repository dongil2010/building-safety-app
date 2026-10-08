/**
 * 보고서 본문 요약 → 한글(HWPX) 파일 (report-summary.html 전용)
 *
 * templates/hwpx_report_summary.hwpx 는 실제 보고서에서 필요한 표만 뽑아 둔 한글 파일이다
 * (scripts/dev/build-report-summary-template.js 로 만든다). 여기서는 그 표들을 머리글 글자로
 * 알아보고 칸을 채운다. 표 서식(글꼴·테두리·칸 너비)은 템플릿 것을 그대로 쓴다.
 *
 * XML은 문자열로만 다룬다(DOM·재직렬화 없음). 문서 전체를 다시 쓰면 서식이 깨진 전력이 있어,
 * 바꾸는 칸의 문단만 새로 짜 넣고 나머지 글자는 원문 그대로 둔다. 덕분에 node 테스트에서도 돈다.
 *
 * 한글은 파일을 열 때 줄바꿈 위치와 칸 높이를 다시 계산하지 않고 파일에 적힌 값(줄 배치 정보
 * linesegarray, 칸 높이 cellSz)을 그대로 쓴다. 값이 내용과 안 맞으면 글자가 겹친다(2026-10-08
 * 첫 시험 파일에서 확인: 줄 배치를 빼도, 한 줄짜리로 남겨도 겹쳤다). 그래서 글자 폭을 어림해
 * 줄을 나누고, 그 줄 수로 칸·행·표 높이를 맞춰 적는다.
 *
 * 2026-10-08: 1·2종 정기안전점검 보고서 서식.
 */
(function (root) {
    'use strict';

    const core = (root.BSA && root.BSA.reportSummary) || (typeof require === 'function' ? require('./summary-core.js') : null);

    const BLUE = '#0000FF';
    /** 표가 「글자처럼 취급」이라 쪽을 넘어 나뉘지 않는다. 한 쪽에 들어갈 높이를 넘으면 표를 나눈다. */
    const PAGE_BODY_HEIGHT = 60000;
    /**
     * 외관조사 표는 한 쪽을 꽉 채우는 표라 내용이 늘면 쪽을 넘친다. 넘치면 사진을 줄여 맞춘다.
     * 쪽 본문 높이는 약 64,900(A4, 샘플 보고서 여백). 첫 표는 위에 제목 한 줄이 있다.
     */
    const SURVEY_MAX_HEIGHT = 64400;
    const SURVEY_MAX_HEIGHT_WITH_HEADING = 62000;
    /** 사진은 원래 칸 높이의 이 비율 아래로는 줄이지 않는다 */
    const PHOTO_MIN_RATIO = 0.55;
    /** 줄을 나눌 때 칸 안쪽 폭에서 남겨 두는 여유(글자 폭은 어림값이라 꽉 채우지 않는다) */
    const WRAP_SAFETY = 0.95;
    /** 문단의 둘째 줄부터 붙는 줄 표시값(샘플 보고서의 여러 줄 문단에서 가져옴) */
    const SEG_FLAGS_NEXT_LINE = '1441792';

    function escXml(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function unescXml(s) {
        return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    }

    const squash = (s) => String(s || '').replace(/\s+/g, '');

    /**
     * xml 조각에서 tag 요소를 찾는다. 같은 이름이 안에 또 있으면(표 안의 표) 바깥 것만 돌려준다.
     * @returns {Array<{start: number, end: number}>} end는 닫는 태그 뒤
     */
    function topElements(xml, tag) {
        const re = new RegExp('<(/?)' + tag + '(?=[\\s>/])((?:[^>"\']|"[^"]*"|\'[^\']*\')*?)(/?)>', 'g');
        const out = [];
        let depth = 0;
        let start = -1;
        let m;
        while ((m = re.exec(xml)) !== null) {
            if (m[3] === '/') {
                if (depth === 0) out.push({ start: m.index, end: m.index + m[0].length });
                continue;
            }
            if (m[1] !== '/') {
                if (depth === 0) start = m.index;
                depth += 1;
            } else {
                depth -= 1;
                if (depth === 0) out.push({ start: start, end: m.index + m[0].length });
            }
        }
        return out;
    }

    function openTagEnd(xml) {
        const m = /^<[^\s>/]+(?:[^>"']|"[^"]*"|'[^']*')*>/.exec(xml);
        return m ? m[0].length : xml.indexOf('>') + 1;
    }

    function attr(tagText, name) {
        const m = new RegExp('\\b' + name + '="([^"]*)"').exec(tagText);
        return m ? m[1] : null;
    }

    function setAttr(tagText, name, value) {
        return tagText.replace(new RegExp('(\\b' + name + '=")[^"]*(")'), '$1' + value + '$2');
    }

    const intAttr = (tagText, name) => parseInt(attr(tagText, name), 10) || 0;

    /* ───────── 글자 폭 어림 · 줄 나누기 ───────── */

    /** 글자 한 자의 폭(글자 크기 = 1). 한글·기호는 1, 영문·숫자는 약 절반. */
    function charUnits(ch) {
        if (ch === ' ') return 0.5;
        return /[!-~]/.test(ch) ? 0.55 : 1;
    }

    /**
     * 한 문단을 칸 폭에 맞춰 줄로 나눈다. 낱말(띄어쓰기) 단위로 넘기고, 낱말 하나가 줄보다 길면 글자 단위.
     * @returns {number[]} 각 줄이 시작하는 글자 위치
     */
    function wrapStarts(text, maxUnits) {
        const starts = [0];
        if (!(maxUnits > 0)) return starts;
        let lineW = 0;
        let i = 0;
        const s = String(text || '');
        while (i < s.length) {
            let j = i;
            let w = 0;
            if (s[i] === ' ') {
                w = charUnits(' ');
                j = i + 1;
            } else {
                while (j < s.length && s[j] !== ' ') { w += charUnits(s[j]); j += 1; }
            }
            if (lineW > 0 && lineW + w > maxUnits && s[i] !== ' ') {
                starts.push(i);
                lineW = 0;
            }
            if (w > maxUnits) {
                // 줄보다 긴 낱말: 글자 단위로 끊는다
                for (let k = i; k < j; k++) {
                    const cw = charUnits(s[k]);
                    if (lineW > 0 && lineW + cw > maxUnits) { starts.push(k); lineW = 0; }
                    lineW += cw;
                }
            } else {
                lineW += w;
            }
            i = j;
        }
        return starts;
    }

    /* ───────── 칸 ───────── */

    /** 칸의 내용(subList) 안쪽 범위 */
    function subListRange(cellXml) {
        const a = cellXml.indexOf('<hp:subList');
        if (a < 0) return null;
        const innerStart = a + openTagEnd(cellXml.slice(a));
        const innerEnd = cellXml.lastIndexOf('</hp:subList>');
        return innerEnd > innerStart ? { innerStart: innerStart, innerEnd: innerEnd } : null;
    }

    /** 칸의 문단별 글자 (칸 안에 든 표의 글자는 뺀다) */
    function cellLines(cellXml) {
        const r = subListRange(cellXml);
        if (!r) return [];
        const inner = cellXml.slice(r.innerStart, r.innerEnd);
        return topElements(inner, 'hp:p').map(function (p) {
            let px = inner.slice(p.start, p.end);
            topElements(px, 'hp:tbl').reverse().forEach(function (t) { px = px.slice(0, t.start) + px.slice(t.end); });
            let text = '';
            px.replace(/<hp:t(?:\s[^>]*)?>([\s\S]*?)<\/hp:t>/g, function (m, body) {
                text += unescXml(body.replace(/<hp:lineBreak\s*\/>/g, ' ').replace(/<[^>]+>/g, ''));
                return m;
            });
            return text;
        });
    }

    function cellText(cellXml) {
        return cellLines(cellXml).join(' ').replace(/\s+/g, ' ').trim();
    }

    function cellMeta(cellXml) {
        const tail = cellXml.slice(cellXml.lastIndexOf('</hp:subList>'));
        const num = function (tag, name) {
            const m = new RegExp('<hp:' + tag + '\\b[^>]*\\b' + name + '="(\\d+)"').exec(tail);
            return m ? parseInt(m[1], 10) : 0;
        };
        return {
            col: num('cellAddr', 'colAddr'), row: num('cellAddr', 'rowAddr'),
            colSpan: num('cellSpan', 'colSpan') || 1, rowSpan: num('cellSpan', 'rowSpan') || 1,
            width: num('cellSz', 'width'), height: num('cellSz', 'height'),
            hasMargin: attr(cellXml.slice(0, openTagEnd(cellXml)), 'hasMargin') === '1',
            marginLeft: num('cellMargin', 'left'), marginRight: num('cellMargin', 'right'),
            marginTop: num('cellMargin', 'top'), marginBottom: num('cellMargin', 'bottom')
        };
    }

    /** 칸 안쪽 여백: 칸에 따로 정한 여백이 있으면 그것, 없으면 표의 안쪽 여백 */
    function cellPadding(meta, ctx) {
        const im = (!meta.hasMargin && ctx && ctx.inMargin) || null;
        return im || { left: meta.marginLeft, right: meta.marginRight, top: meta.marginTop, bottom: meta.marginBottom };
    }

    /** 칸 꼬리의 주소·병합·높이, 여는 태그의 테두리를 바꾼다 */
    function setCellMeta(cellXml, meta) {
        const cut = cellXml.lastIndexOf('</hp:subList>');
        let head = cellXml.slice(0, cut);
        let tail = cellXml.slice(cut);
        const put = function (tag, name, value) {
            tail = tail.replace(new RegExp('(<hp:' + tag + '\\b[^>]*\\b' + name + '=")\\d+(")'), '$1' + value + '$2');
        };
        if (meta.row != null) put('cellAddr', 'rowAddr', meta.row);
        if (meta.rowSpan != null) put('cellSpan', 'rowSpan', meta.rowSpan);
        if (meta.height != null) put('cellSz', 'height', meta.height);
        if (meta.borderFill != null) {
            const end = openTagEnd(head);
            head = setAttr(head.slice(0, end), 'borderFillIDRef', meta.borderFill) + head.slice(end);
        }
        return head + tail;
    }

    /** 칸의 첫 문단에서 새 문단을 찍어 낼 틀을 뽑는다 */
    function paraStamp(cellXml) {
        const r = subListRange(cellXml);
        const inner = cellXml.slice(r.innerStart, r.innerEnd);
        const first = topElements(inner, 'hp:p')[0];
        const px = first ? inner.slice(first.start, first.end) : '';
        const open = px ? px.slice(0, openTagEnd(px)) : '<hp:p id="2147483648" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">';
        const cp = /<hp:run\b[^>]*\bcharPrIDRef="(\d+)"/.exec(px);
        const seg = /<hp:lineseg\b[^>]*\/>/.exec(px);
        return { range: r, open: open.replace(/\/>$/, '>'), charPr: cp ? cp[1] : '0', seg: seg ? seg[0] : '' };
    }

    /**
     * 칸 글자를 바꾼다. 줄마다 문단 하나(원래 보고서도 항목마다 문단 하나다). 칸 폭을 넘는 문단은
     * 여러 줄로 나눠 줄 배치 정보를 줄마다 적는다.
     * @param {Array<string|{text: string, blue?: boolean}>} lines
     * @param {{blueCharPr?: function, fontHeight?: function, inMargin?: object}} ctx
     */
    function setCellLines(cellXml, lines, ctx) {
        const st = paraStamp(cellXml);
        const meta = cellMeta(cellXml);
        const pad = cellPadding(meta, ctx);
        const innerW = Math.max(0, meta.width - pad.left - pad.right);
        const fontH = (ctx && ctx.fontHeight && ctx.fontHeight(st.charPr)) || intAttr(st.seg, 'textheight') || 1000;
        const maxUnits = (innerW / fontH) * WRAP_SAFETY;
        const step = intAttr(st.seg, 'vertsize') + intAttr(st.seg, 'spacing');
        const list = (lines && lines.length ? lines : ['']).map(function (ln) {
            return typeof ln === 'string' ? { text: ln } : ln;
        });
        let lineNo = 0;
        const paras = list.map(function (ln) {
            const cp = ln.blue && ctx && ctx.blueCharPr ? ctx.blueCharPr(st.charPr) : st.charPr;
            const t = ln.text ? '<hp:t>' + escXml(ln.text) + '</hp:t>' : '<hp:t/>';
            let segs = '';
            if (st.seg) {
                segs = '<hp:linesegarray>' + wrapStarts(ln.text, maxUnits).map(function (pos, k) {
                    let s = setAttr(setAttr(st.seg, 'textpos', pos), 'vertpos', lineNo * step);
                    if (innerW) s = setAttr(s, 'horzsize', innerW);
                    if (k > 0) s = setAttr(s, 'flags', SEG_FLAGS_NEXT_LINE);
                    lineNo += 1;
                    return s;
                }).join('') + '</hp:linesegarray>';
            }
            return st.open + '<hp:run charPrIDRef="' + cp + '">' + t + '</hp:run>' + segs + '</hp:p>';
        }).join('');
        return cellXml.slice(0, st.range.innerStart) + paras + cellXml.slice(st.range.innerEnd);
    }

    /** 칸에 그림 하나를 넣는다(그림은 글자처럼 취급) */
    function setCellPicture(cellXml, picXml, height, width) {
        const st = paraStamp(cellXml);
        const seg = st.seg
            ? '<hp:linesegarray>' + ['vertsize', 'textheight'].reduce(function (s, k) { return setAttr(s, k, height); },
                setAttr(setAttr(setAttr(setAttr(st.seg, 'textpos', 0), 'vertpos', 0), 'baseline', Math.round(height * 0.85)), 'horzsize', width)) + '</hp:linesegarray>'
            : '';
        const para = st.open + '<hp:run charPrIDRef="' + st.charPr + '">' + picXml + '<hp:t/></hp:run>' + seg + '</hp:p>';
        return cellXml.slice(0, st.range.innerStart) + para + cellXml.slice(st.range.innerEnd);
    }

    /** 칸의 내용이 차지하는 높이: 줄 높이의 합 + 줄 사이 간격 + 위아래 여백 */
    function cellNeed(cellXml, ctx) {
        const r = subListRange(cellXml);
        if (!r) return 0;
        let inner = cellXml.slice(r.innerStart, r.innerEnd);
        topElements(inner, 'hp:tbl').reverse().forEach(function (t) { inner = inner.slice(0, t.start) + inner.slice(t.end); });
        const segs = inner.match(/<hp:lineseg\b[^>]*\/>/g) || [];
        if (!segs.length) return 0;
        let h = 0;
        segs.forEach(function (s, i) {
            h += intAttr(s, 'vertsize');
            if (i < segs.length - 1) h += intAttr(s, 'spacing');
        });
        const pad = cellPadding(cellMeta(cellXml), ctx);
        return h + pad.top + pad.bottom;
    }

    /* ───────── 표 ───────── */

    /** 표를 머리 / 행(칸) / 꼬리로 나눈다 */
    function parseTable(tblXml) {
        const openEnd = openTagEnd(tblXml);
        const closeStart = tblXml.lastIndexOf('</hp:tbl>');
        const inner = tblXml.slice(openEnd, closeStart);
        const trs = topElements(inner, 'hp:tr');
        const rows = trs.map(function (tr) {
            const trXml = inner.slice(tr.start, tr.end);
            const trOpenEnd = openTagEnd(trXml);
            const trInner = trXml.slice(trOpenEnd, trXml.lastIndexOf('</hp:tr>'));
            const cells = topElements(trInner, 'hp:tc').map(function (tc) {
                const xml = trInner.slice(tc.start, tc.end);
                const meta = cellMeta(xml);
                meta.xml = xml;
                return meta;
            });
            return { open: trXml.slice(0, trOpenEnd), cells: cells };
        });
        return {
            open: tblXml.slice(0, openEnd),
            head: trs.length ? inner.slice(0, trs[0].start) : inner,
            rows: rows
        };
    }

    function buildTable(t) {
        return t.open + t.head + t.rows.map(function (r) {
            return r.open + r.cells.map(function (c) { return c.xml; }).join('') + '</hp:tr>';
        }).join('') + '</hp:tbl>';
    }

    function cellAt(t, row, col) {
        for (let i = 0; i < t.rows.length; i++) {
            const cells = t.rows[i].cells;
            for (let j = 0; j < cells.length; j++) if (cells[j].row === row && cells[j].col === col) return cells[j];
        }
        return null;
    }

    function tableInMargin(t) {
        const m = /<hp:inMargin\b[^>]*\/>/.exec(t.head);
        return m ? { left: intAttr(m[0], 'left'), right: intAttr(m[0], 'right'), top: intAttr(m[0], 'top'), bottom: intAttr(m[0], 'bottom') } : null;
    }

    /** 표 종류를 머리글 글자로 알아본다(한글에서 다시 저장해 표 순서·id가 바뀌어도 찾을 수 있게) */
    function tableKind(t) {
        if (!t.rows.length) return null;
        const head = squash(t.rows[0].cells.map(function (c) { return cellText(c.xml); }).join('|'));
        const any = function (re) {
            return t.rows.some(function (r) { return r.cells.some(function (c) { return re.test(squash(cellText(c.xml))); }); });
        };
        if (any(/^중대결함발생유무$/)) return 'survey';
        if (/조치필요사항/.test(head)) return 'summary';
        if (/손상유형/.test(head) && /점검부위/.test(head)) return 'part';
        if (/보수방안/.test(head)) return 'cause';
        if (/^구분\|주요점검결과$/.test(head)) return 'main';
        if (/^구분\|주요상태조사결과/.test(head)) return 'analysis';
        return null;
    }

    /** 그 행의 높이를 내용에 맡긴다(칸 높이를 0으로 적어 두면 fitTableHeights가 필요한 만큼 잡는다) */
    function loosenRow(t, rowAddr) {
        t.rows.forEach(function (r) {
            r.cells.forEach(function (c) {
                if (c.row === rowAddr && c.rowSpan === 1) { c.xml = setCellMeta(c.xml, { height: 0 }); c.height = 0; }
            });
        });
    }

    /**
     * 채운 내용에 맞게 행 높이를 맞춘다. 행 높이 = 그 행 칸들의 (적힌 높이, 내용이 차지하는 높이) 중 가장 큰 값.
     * 내용을 채운 행은 loosenRow로 적힌 높이를 지워 두므로 내용만큼만 잡히고, 손대지 않은 행(머리글·사진
     * 설명 등)은 원래 높이를 지킨다. 여러 행을 합친 칸이 더 높으면 모자란 만큼 마지막 행을 늘린다.
     * @returns {{xml: string, height: number, rowHeights: number[]}}
     */
    function fitTableHeights(tblXml, ctx) {
        const t = parseTable(tblXml);
        const c2 = { inMargin: tableInMargin(t) };
        const cells = [];
        let rowCount = 0;
        t.rows.forEach(function (r) {
            r.cells.forEach(function (c) {
                c.need = cellNeed(c.xml, c2);
                cells.push(c);
                rowCount = Math.max(rowCount, c.row + c.rowSpan);
            });
        });
        const rowH = new Array(rowCount).fill(0);
        cells.forEach(function (c) {
            if (c.rowSpan === 1) rowH[c.row] = Math.max(rowH[c.row], c.height, c.need);
        });
        cells.filter(function (c) { return c.rowSpan > 1; }).forEach(function (c) {
            let sum = 0;
            for (let r = c.row; r < c.row + c.rowSpan; r++) sum += rowH[r];
            const want = Math.max(c.need, sum ? 0 : c.height);
            if (want > sum) rowH[c.row + c.rowSpan - 1] += want - sum;
        });
        cells.forEach(function (c) {
            let sum = 0;
            for (let r = c.row; r < c.row + c.rowSpan; r++) sum += rowH[r];
            if (sum !== c.height) c.xml = setCellMeta(c.xml, { height: sum });
        });
        const height = rowH.reduce(function (a, b) { return a + b; }, 0);
        t.head = t.head.replace(/(<hp:sz\b[^>]*\bheight=")\d+(")/, '$1' + height + '$2');
        void ctx;
        return { xml: buildTable(t), height: height, rowHeights: rowH };
    }

    function numbered(lines) {
        if (!lines || !lines.length) return [{ text: '-' }];
        return lines.map(function (ln, i) { return { text: (i + 1) + '. ' + ln.text, blue: ln.blue }; });
    }

    function withTable(ctx, t) {
        const c = {};
        Object.keys(ctx || {}).forEach(function (k) { c[k] = ctx[k]; });
        c.inMargin = tableInMargin(t);
        return c;
    }

    /* ───────── ① 점검 주요결과 · ⑤ 현장조사 결과분석 ───────── */

    /** 구분 칸의 글자로 분류를 알아보고 그 줄의 칸을 채운다 */
    function fillLabelTable(tblXml, model, ctx0, withOpinion) {
        const t = parseTable(tblXml);
        const ctx = withTable(ctx0, t);
        t.rows.forEach(function (r, idx) {
            if (idx === 0) return;
            const label = r.cells.filter(function (c) { return c.col === 0; })[0];
            if (!label) return;
            const cat = core.prevCategoryOf(cellText(label.xml));
            if (!cat) return;
            r.cells.forEach(function (c) {
                if (c.col === 1) {
                    const lines = cat === 'repair'
                        ? (model.repair && model.repair.text ? [{ text: '1. ' + model.repair.text, blue: model.repair.blue }] : [{ text: '-' }])
                        : numbered((model.cats[cat] || {}).lines);
                    c.xml = setCellLines(c.xml, lines, ctx);
                } else if (c.col === 2 && withOpinion) {
                    const body = cat === 'repair' ? '' : ((model.cats[cat] || {}).body || '');
                    c.xml = setCellLines(c.xml, body ? body.split('\n') : [''], ctx);
                }
            });
            loosenRow(t, label.row);
        });
        return buildTable(t);
    }

    /* ───────── ③ 주요 외관조사 결과 ───────── */

    // 분류 표 안에 조사 항목이 여럿인 경우(공중이용부위·외벽·부착물) 어느 항목 칸에 적을지 가르는 낱말
    const SUB_RULES = [
        [/추락/, /점검로|난간|추락|시건|D\.A/],
        [/도로포장/, /포장/],
        [/신축이음/, /신축이음/],
        [/환기구/, /환기구|덮개/],
        [/모르타르/, /모르타르/],
        [/연결철물/, /연결철물/],
        [/균열방지/, /줄눈|조절/],
        [/기울기|배부름/, /기울|배부름/],
        [/정착부/, /앵커|브라켓|정착|비가림|간판/],
        [/연결부/, /볼트|용접|이음|철골/],
        [/와이어/, /와이어/]
    ];

    function pickSub(subs, text) {
        for (let i = 0; i < subs.length; i++) {
            const label = squash(subs[i].label);
            for (let k = 0; k < SUB_RULES.length; k++) {
                if (SUB_RULES[k][0].test(label) && SUB_RULES[k][1].test(text)) return i;
            }
        }
        return 0;
    }

    /** 외관조사 표의 분류(「점검 항목」 옆 칸) */
    function surveyCategory(t) {
        const c = cellAt(t, 1, 1);
        return c ? core.prevCategoryOf(cellText(c.xml)) : null;
    }

    /** @param {number} photoShrink 사진 줄마다 줄일 높이(쪽을 넘칠 때) */
    function fillSurveyTable(tblXml, cat, ctx0, photoShrink) {
        const t = parseTable(tblXml);
        const shrink = photoShrink || 0;
        const ctx = withTable(ctx0, t);
        const m = cat || {};
        const all = [];
        t.rows.forEach(function (r) { r.cells.forEach(function (c) { all.push(c); }); });

        const major = cellAt(t, 1, 3);
        if (major) major.xml = setCellLines(major.xml, [m.major || '해당사항 없음'], ctx);

        // 조사 항목(왼쪽 두 칸을 합친 제목 칸, 두 줄 높이): 아랫줄 오른쪽 칸에 결과를 적는다
        const subs = all.filter(function (c) {
            return c.col === 0 && c.colSpan === 2 && c.rowSpan === 2 && !/관련사진/.test(squash(cellText(c.xml)));
        }).map(function (c) { return { label: cellText(c.xml), row: c.row, lines: [] }; });
        (m.lines || []).forEach(function (ln) {
            if (subs.length) subs[subs.length > 1 ? pickSub(subs, ln.text) : 0].lines.push(ln);
        });
        subs.forEach(function (s) {
            const target = cellAt(t, s.row + 1, 2);
            if (target) {
                target.xml = setCellLines(target.xml, numbered(s.lines), ctx);
                loosenRow(t, s.row + 1);
            }
        });

        // 관련사진: 사진 줄과 설명 줄이 번갈아 있다
        const photoLabel = all.filter(function (c) { return c.col === 0 && /관련사진/.test(squash(cellText(c.xml))); })[0];
        if (photoLabel) {
            const photos = (m.photos || []).slice();
            for (let k = 0; k < photoLabel.rowSpan / 2; k++) {
                const picRow = photoLabel.row + k * 2;
                all.filter(function (c) { return c.row === picRow && c.col >= 2; })
                    .sort(function (a, b) { return a.col - b.col; })
                    .forEach(function (pc) {
                        const cap = cellAt(t, picRow + 1, pc.col);
                        const ph = photos.shift();
                        if (shrink) {
                            pc.height = Math.max(Math.round(pc.height * PHOTO_MIN_RATIO), pc.height - shrink);
                            pc.xml = setCellMeta(pc.xml, { height: pc.height });
                        }
                        const fitted = ph && ctx.photo ? ctx.photo(ph.key, pc, cellPadding(pc, ctx)) : null;
                        pc.xml = fitted ? setCellPicture(pc.xml, fitted.xml, fitted.height, fitted.width) : setCellLines(pc.xml, ['-'], ctx);
                        if (cap) cap.xml = setCellLines(cap.xml, [ph ? ph.caption : '-'], ctx);
                    });
            }
        }

        const opLabel = all.filter(function (c) { return c.col === 0 && /책임기술자의견/.test(squash(cellText(c.xml))); })[0];
        if (opLabel) {
            const target = cellAt(t, opLabel.row, 2);
            if (target) {
                target.xml = setCellLines(target.xml, String(m.opinion || '').split('\n'), ctx);
                loosenRow(t, opLabel.row);
            }
        }
        return buildTable(t);
    }

    function surveyPhotoRows(t) {
        let n = 0;
        t.rows.forEach(function (r) {
            r.cells.forEach(function (c) { if (c.col === 0 && /관련사진/.test(squash(cellText(c.xml)))) n = c.rowSpan / 2; });
        });
        return n;
    }

    /** 외관조사 표를 채우고, 한 쪽을 넘치면 사진 줄을 줄여 다시 채운다 */
    function fillSurveyFitted(tblXml, cat, ctx, maxHeight) {
        const dry = {};
        Object.keys(ctx).forEach(function (k) { dry[k] = ctx[k]; });
        dry.photo = function (key, cell, pad) { return ctx.photo ? ctx.photo(key, cell, pad, true) : null; };
        const first = fitTableHeights(fillSurveyTable(tblXml, cat, dry, 0), ctx);
        const rows = surveyPhotoRows(parseTable(tblXml));
        const shrink = first.height > maxHeight && rows ? Math.ceil((first.height - maxHeight) / rows) : 0;
        return fitTableHeights(fillSurveyTable(tblXml, cat, ctx, shrink), ctx);
    }

    /* ───────── ②④⑥ 줄 수가 바뀌는 표 ───────── */

    // 구분 칸에 적는 글자(원래 보고서의 줄 나눔 그대로)
    const PART_LABELS = {
        structure: ['구', '조', '체'], nonStructure: ['비', '구', '조', '체'], public: ['공중', '이용', '부위'],
        interior: ['기타시설', '(내장재 및 천장재)'], exterior: ['기타시설', '(외장재)'], attachment: ['기타시설', '(부착물)'],
        aux: ['부대시설'], load: ['구조변경 및 하중조사']
    };
    const CAUSE_LABELS = {
        structure: ['구조체'], nonStructure: ['비구조체'], public: ['공중이용부위'],
        interior: ['기타', '(내장재 및 천장재)'], exterior: ['기타', '(외장재)'], attachment: ['기타', '(부착물)'],
        aux: ['부대시설'], load: ['구조변경 및 하중조사']
    };

    /**
     * 본문 줄을 새로 찍어 낸다. 첫 열은 같은 글자가 이어지면 한 칸으로 합친다.
     * 표가 한 쪽 높이를 넘으면 머리글을 되풀이해 여러 표로 나눈다.
     * @param {Array<{label: string[], cells: string[]}>} rows label = 첫 열, cells = 둘째 열부터
     * @returns {Array<{xml: string, height: number}>}
     */
    function fillRowsTable(tblXml, rows, ctx0, opts) {
        const src = parseTable(tblXml);
        const ctx = withTable(ctx0, src);
        const headerRows = 1;
        const body = src.rows.slice(headerRows);
        if (!body.length) return [fitTableHeights(tblXml, ctx)];
        const fullCount = Math.max.apply(null, body.map(function (r) { return r.cells.length; }));
        const stampRow = body.filter(function (r) { return r.cells.length === fullCount; })[0];
        const stamps = {};
        stampRow.cells.forEach(function (c) { stamps[c.col] = c; });
        const cols = Object.keys(stamps).map(Number).sort(function (a, b) { return a - b; });
        const single = stampRow.cells.filter(function (c) { return c.rowSpan === 1; });
        const rowH = single.length ? Math.min.apply(null, single.map(function (c) { return c.height; })) : stampRow.cells[0].height;

        // 마지막 줄의 테두리(아래 굵은 선)는 따로 있다
        const lastRowAddr = Math.max.apply(null, body.map(function (r) {
            return Math.max.apply(null, r.cells.map(function (c) { return c.row + c.rowSpan - 1; }));
        }));
        const bfLast = {};
        body.forEach(function (r) {
            r.cells.forEach(function (c) {
                if (c.row + c.rowSpan - 1 === lastRowAddr) bfLast[c.col] = attr(c.xml.slice(0, openTagEnd(c.xml)), 'borderFillIDRef');
            });
        });

        const make = function (chunk) {
            const t = { open: src.open, head: src.head, rows: src.rows.slice(0, headerRows) };
            const n = chunk.length;
            let i = 0;
            const out = chunk.map(function () { return []; });
            while (i < n) {
                let span = 1;
                if (!(opts && opts.noMerge)) {
                    while (i + span < n && chunk[i + span].label.join('\n') === chunk[i].label.join('\n')) span += 1;
                }
                const endsTable = i + span === n;
                let c0 = setCellLines(stamps[cols[0]].xml, chunk[i].label, ctx);
                c0 = setCellMeta(c0, {
                    row: headerRows + i, rowSpan: span, height: span > 1 ? rowH * span : 0,
                    borderFill: endsTable && bfLast[cols[0]] ? bfLast[cols[0]] : null
                });
                out[i].push(c0);
                for (let k = 0; k < span; k++) {
                    const row = chunk[i + k];
                    const isLast = i + k === n - 1;
                    cols.slice(1).forEach(function (col, ci) {
                        const text = row.cells[ci] == null || row.cells[ci] === '' ? '-' : String(row.cells[ci]);
                        let cx = setCellLines(stamps[col].xml, text.split('\n'), ctx);
                        // 높이는 0으로 두어 내용이 차지하는 만큼만 잡히게 한다
                        cx = setCellMeta(cx, {
                            row: headerRows + i + k, rowSpan: 1, height: 0,
                            borderFill: isLast && bfLast[col] ? bfLast[col] : null
                        });
                        out[i + k].push(cx);
                    });
                }
                i += span;
            }
            out.forEach(function (cells) {
                t.rows.push({ open: stampRow.open, cells: cells.map(function (xml) { return { xml: xml }; }) });
            });
            t.open = setAttr(t.open, 'rowCnt', headerRows + n);
            return fitTableHeights(buildTable(t), ctx);
        };

        const list = rows.length ? rows : [{ label: ['-'], cells: [] }];
        // 한 번 통째로 만들어 줄마다 높이를 잰 뒤, 한 쪽에 들어가는 만큼씩 끊는다
        const whole = make(list);
        const heights = whole.rowHeights;
        const chunks = [];
        let cur = [];
        let acc = heights[0];
        list.forEach(function (row, i) {
            const h = heights[headerRows + i];
            if (cur.length && acc + h > PAGE_BODY_HEIGHT) {
                chunks.push(cur);
                cur = [];
                acc = heights[0];
            }
            cur.push(row);
            acc += h;
        });
        chunks.push(cur);
        return chunks.length === 1 ? [whole] : chunks.map(make);
    }

    /* ───────── 그림 ───────── */

    /** 상태조사표 파일에서 가져온 그림 XML을 칸 크기에 맞춘다(비율 유지) */
    function fitPicture(picXml, maxW, maxH, ids) {
        const num = function (re) { const m = re.exec(picXml); return m ? parseFloat(m[1]) : 0; };
        const orgW = num(/<hp:orgSz\b[^>]*\bwidth="(\d+)"/);
        const orgH = num(/<hp:orgSz\b[^>]*\bheight="(\d+)"/);
        const curW = num(/<hp:curSz\b[^>]*\bwidth="(\d+)"/) || orgW;
        const curH = num(/<hp:curSz\b[^>]*\bheight="(\d+)"/) || orgH;
        if (!orgW || !orgH || !curW || !curH) return null;
        const scale = Math.min(maxW / curW, maxH / curH);
        const w = Math.round(curW * scale);
        const h = Math.round(curH * scale);
        let x = picXml.replace(/<hp:shapeComment>[\s\S]*?<\/hp:shapeComment>|<hp:shapeComment\s*\/>/g, '');
        const openEnd = openTagEnd(x);
        x = setAttr(setAttr(x.slice(0, openEnd), 'id', ids.id), 'instid', ids.instId) + x.slice(openEnd);
        x = x.replace(/(<hp:curSz\b[^>]*\bwidth=")\d+("[^>]*\bheight=")\d+(")/, '$1' + w + '$2' + h + '$3');
        x = x.replace(/(<hp:rotationInfo\b[^>]*\bcenterX=")\d+("[^>]*\bcenterY=")\d+(")/, '$1' + Math.round(w / 2) + '$2' + Math.round(h / 2) + '$3');
        x = x.replace(/(<hc:scaMatrix\b[^>]*\be1=")[^"]*("[^>]*\be5=")[^"]*(")/, '$1' + (w / orgW).toFixed(6) + '$2' + (h / orgH).toFixed(6) + '$3');
        x = x.replace(/(<hp:sz\b[^>]*\bwidth=")\d+("[^>]*\bheight=")\d+(")/, '$1' + w + '$2' + h + '$3');
        x = x.replace(/(\bbinaryItemIDRef=")[^"]*(")/, '$1' + ids.binId + '$2');
        return { xml: x, width: w, height: h };
    }

    /* ───────── 문서 조립 ───────── */

    function setParaTableHeight(paraXml, tableH) {
        // 표를 담은 문단의 줄 높이(표 높이 + 바깥 여백)를 맞춘다
        const cut = paraXml.lastIndexOf('</hp:tbl>');
        const h = tableH + 282;
        const tail = paraXml.slice(cut).replace(/<hp:lineseg\b[^>]*\/>/, function (seg) {
            return setAttr(setAttr(setAttr(seg, 'vertsize', h), 'textheight', h), 'baseline', Math.round(h * 0.85));
        });
        return paraXml.slice(0, cut) + tail;
    }

    function setPageBreak(paraXml, on) {
        const end = openTagEnd(paraXml);
        return setAttr(paraXml.slice(0, end), 'pageBreak', on ? 1 : 0) + paraXml.slice(end);
    }

    function rowsFor(kind, model) {
        if (kind === 'summary') {
            return (model.summaryRows || []).map(function (r) { return { label: String(r.cells[0] || '-').split('\n'), cells: r.cells.slice(1) }; });
        }
        const labels = kind === 'part' ? PART_LABELS : CAUSE_LABELS;
        return ((kind === 'part' ? model.partRows : model.causeRows) || []).map(function (r) {
            return { label: labels[r.cat] || String(r.cells[0] || '-').split('\n'), cells: r.cells.slice(1) };
        });
    }

    /**
     * 구역 XML의 표를 채운다.
     * @param {string} sectionXml 템플릿의 Contents/section0.xml
     * @param {object} model 화면에서 만든 내용 (cats / repair / summaryRows / partRows / causeRows / title)
     * @param {object} ctx { blueCharPr(id), fontHeight(id), photo(key, cell, padding) }
     */
    function fillSection(sectionXml, model, ctx, opts) {
        const rootEnd = sectionXml.indexOf('<hp:p');
        const closeStart = sectionXml.lastIndexOf('</hs:sec>');
        const bodyXml = sectionXml.slice(rootEnd, closeStart);
        const paras = topElements(bodyXml, 'hp:p');
        let titleDone = false;
        let surveySeen = 0;
        const out = paras.map(function (p) {
            let px = bodyXml.slice(p.start, p.end);
            const tbls = topElements(px, 'hp:tbl');
            if (!tbls.length) {
                if (!titleDone && model.title && /<hp:t>[^<]*<\/hp:t>/.test(px)) {
                    titleDone = true;
                    px = px.replace(/<hp:t>[^<]*<\/hp:t>/, '<hp:t>' + escXml(model.title) + '</hp:t>');
                }
                return px;
            }
            const tb = tbls[0];
            const tblXml = px.slice(tb.start, tb.end);
            const parsed = parseTable(tblXml);
            const kind = tableKind(parsed);
            if (!kind) return px;
            const wrap = function (fit) { return setParaTableHeight(px.slice(0, tb.start) + fit.xml + px.slice(tb.end), fit.height); };
            if (kind === 'main') return wrap(fitTableHeights(fillLabelTable(tblXml, model, ctx, false), ctx));
            if (kind === 'analysis') return wrap(fitTableHeights(fillLabelTable(tblXml, model, ctx, true), ctx));
            if (kind === 'survey') {
                surveySeen += 1;
                return wrap(fillSurveyFitted(tblXml, model.cats[surveyCategory(parsed)], ctx,
                    surveySeen === 1 ? SURVEY_MAX_HEIGHT_WITH_HEADING : SURVEY_MAX_HEIGHT));
            }
            return fillRowsTable(tblXml, rowsFor(kind, model), ctx, opts).map(function (chunk, i) {
                return i === 0 ? wrap(chunk) : setPageBreak(wrap(chunk), true);
            }).join('');
        });
        return sectionXml.slice(0, rootEnd) + out.join('') + sectionXml.slice(closeStart);
    }

    /** header.xml의 글자모양: 글자 크기를 읽고, 파란색 복제본을 만들어 더한다 */
    function makeCharRegistry(headerXml) {
        const cntM = /<hh:charProperties\b[^>]*\bitemCnt="(\d+)"/.exec(headerXml);
        let next = cntM ? parseInt(cntM[1], 10) : 0;
        const map = {};
        const heights = {};
        const added = [];
        const find = function (id) {
            return new RegExp('<hh:charPr\\b[^>]*\\bid="' + id + '"[\\s\\S]*?</hh:charPr>').exec(headerXml);
        };
        return {
            fontHeight: function (id) {
                if (heights[id] == null) {
                    const m = find(id);
                    heights[id] = m ? intAttr(m[0].slice(0, openTagEnd(m[0])), 'height') : 0;
                }
                return heights[id];
            },
            blueCharPr: function (id) {
                if (map[id]) return map[id];
                const m = find(id);
                if (!m || !cntM) return id;
                const newId = String(next++);
                const openEnd = openTagEnd(m[0]);
                added.push(setAttr(setAttr(m[0].slice(0, openEnd), 'id', newId), 'textColor', BLUE) + m[0].slice(openEnd));
                map[id] = newId;
                heights[newId] = this.fontHeight(id);
                return newId;
            },
            apply: function () {
                if (!added.length) return headerXml;
                return headerXml
                    .replace(/(<hh:charProperties\b[^>]*\bitemCnt=")\d+(")/, '$1' + next + '$2')
                    .replace('</hh:charProperties>', added.join('') + '</hh:charProperties>');
            }
        };
    }

    /**
     * 템플릿 파일 묶음에 내용을 채워 새 파일 묶음을 만든다.
     * @param {Object<string, string|Uint8Array>} templateFiles 경로 → 내용 (xml은 문자열)
     * @param {object} model
     * @param {Object<string, {picXml: string, bytes: Uint8Array, ext: string}>} photos 사진 키 → 원본
     * @returns {Object<string, string|Uint8Array>}
     */
    function buildFiles(templateFiles, model, photos, opts) {
        const files = {};
        Object.keys(templateFiles).forEach(function (k) { files[k] = templateFiles[k]; });
        const chars = makeCharRegistry(String(files['Contents/header.xml']));
        const items = [];
        let seq = 0;
        const ctx = {
            blueCharPr: function (id) { return chars.blueCharPr(id); },
            fontHeight: function (id) { return chars.fontHeight(id); },
            photo: function (key, cell, pad, dryRun) {
                const src = photos && photos[key];
                if (!src || !src.picXml || !src.bytes) return null;
                const n = seq + 1;
                const binId = 'rsphoto' + n;
                // 칸 안쪽 크기: 칸 너비·높이에서 여백을 뺀 만큼
                const fitted = fitPicture(src.picXml, cell.width - pad.left - pad.right, cell.height - pad.top - pad.bottom, {
                    id: 1800000000 + n, instId: 1900000000 + n, binId: binId
                });
                // 높이만 재 보는 단계에서는 그림 파일을 더하지 않는다
                if (!fitted || dryRun) return fitted;
                seq = n;
                const ext = (src.ext || 'jpg').toLowerCase();
                files['BinData/' + binId + '.' + ext] = src.bytes;
                items.push('<opf:item id="' + binId + '" href="BinData/' + binId + '.' + ext + '" media-type="image/' + (ext === 'jpeg' ? 'jpg' : ext) + '" isEmbeded="1"/>');
                return fitted;
            }
        };
        files['Contents/section0.xml'] = fillSection(String(files['Contents/section0.xml']), model, ctx, opts);
        files['Contents/header.xml'] = chars.apply();
        if (items.length) {
            files['Contents/content.hpf'] = String(files['Contents/content.hpf']).replace('</opf:manifest>', items.join('') + '</opf:manifest>');
        }
        return files;
    }

    const api = {
        topElements: topElements,
        parseTable: parseTable,
        buildTable: buildTable,
        tableKind: tableKind,
        cellText: cellText,
        cellLines: cellLines,
        cellAt: cellAt,
        cellNeed: cellNeed,
        wrapStarts: wrapStarts,
        setCellLines: setCellLines,
        setCellMeta: setCellMeta,
        fitTableHeights: fitTableHeights,
        fillLabelTable: fillLabelTable,
        fillSurveyTable: fillSurveyTable,
        fillRowsTable: fillRowsTable,
        fitPicture: fitPicture,
        fillSection: fillSection,
        makeCharRegistry: makeCharRegistry,
        buildFiles: buildFiles,
        escXml: escXml,
        openTagEnd: openTagEnd,
        setAttr: setAttr
    };

    root.BSA = root.BSA || {};
    root.BSA.reportSummaryHwpx = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
