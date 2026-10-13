/**
 * 보고서 본문 요약 화면 (report-summary.html 전용)
 *
 * 앱이 내보낸 상태조사표 HWPX를 이 컴퓨터 안에서 읽어, 주요 점검결과를 고르고
 * 보고서에 붙여넣을 표를 만든다. 전회차 보고서(.hwp)를 함께 읽으면 분류마다
 * 전회·금회를 나란히 놓고 달라진 항목을 파란색으로 표시한다.
 * 계산은 summary-core.js, 여기는 파일 읽기와 화면. 앱 데이터(Firestore)에는 접속하지 않는다.
 */
(function () {
    'use strict';

    const core = window.BSA.reportSummary;
    const alt = window.BSA.reportSummaryAlt;
    const ai = window.BSA.reportSummaryAi;
    const hwpxOut = window.BSA.reportSummaryHwpx;
    const TEMPLATE_PATH = 'templates/hwpx_report_summary.hwpx';
    const hwpRead = window.BSA.hwpRead;
    const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
    const STORE_PREFIX = 'bsaReportSummary.v1:';
    /** 전회차와 달라진 항목 글자색 (한글에 붙여넣어도 그대로 가도록 표준 파랑) */
    const BLUE = '#0000ff';

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const state = {
        fileName: '',
        defects: [],
        byId: {},
        photoUrl: {},
        sel: {},
        text: {},
        custom: {},
        catOverride: {},
        opinion: {},
        opLine: {},
        repLine: {},
        order: {},
        cellEdit: {},
        loadLines: '',
        repairNote: '',
        prev: null,
        markBlue: true,
        meta: { buildingName: '', roundLabel: '' },
        // 작성안: A = 우리 보고서 문구·조사표 원인 그대로 / B = 중요도·원인·보수방안을 따로 판단한 제안
        //         F = 최종안(비교표에서 사람이 담은 항목만. 표 만드는 방식은 A안과 같다)
        // sel·text·custom·opinion·cellEdit는 지금 보고 있는 작성안의 것이고, 안마다 따로 보관한다.
        variant: 'A',
        vars: { A: null, B: null },
        // AI안: { sel: 분류별 고른 결함 id, why: 결함 id별 고른 이유, opinion: 분류별 의견 본문, odd: 의견의 낯선 숫자 }
        // A·B안과 따로 두고 비교표에서 골라 쓴다.
        ai: null
    };

    // opLine·repLine: 결함 id별 의견 한 줄·보수방안(최종안에 담을 때 B안·AI안에서 따라온 것)
    // order: 분류별 항목 순서(끌어서 바꾼 것). 'd:결함id' 또는 'c:직접 적은 글'의 목록
    const VARIANT_KEYS = ['sel', 'text', 'custom', 'opinion', 'cellEdit', 'opLine', 'repLine', 'order'];
    const VARIANTS = ['A', 'B', 'F'];
    const isB = () => state.variant === 'B';
    const isFinal = () => state.variant === 'F';
    /** 화면·파일 이름에 적는 작성안 이름 */
    const variantLabel = (v) => (v === 'F' ? '최종안' : v + '안');

    /** 지금 화면의 고르기·문구를 그 작성안 보관함에 옮겨 둔다 */
    function stashVariant() {
        const o = {};
        VARIANT_KEYS.forEach((k) => { o[k] = state[k]; });
        state.vars[state.variant] = o;
    }

    /** 작성안을 화면에 올린다. 처음 여는 안이면 그 안의 추천으로 채운다(최종안은 비워 두고 사람이 담는다). */
    function bindVariant(v) {
        state.variant = v;
        const o = state.vars[v] || {};
        state.sel = o.sel || (v === 'F' ? {} : (v === 'B' ? alt.pickDefaults(state.defects) : core.pickDefaults(state.defects)));
        state.text = o.text || {};
        state.custom = o.custom || {};
        state.opinion = o.opinion || {};
        state.cellEdit = o.cellEdit || {};
        state.opLine = o.opLine || {};
        state.repLine = o.repLine || {};
        state.order = o.order || {};
        core.CATEGORIES.forEach((c) => {
            state.sel[c.key] = (state.sel[c.key] || []).filter((id) => state.byId[id]);
        });
        stashVariant();
    }

    function baseText(d) {
        return isB() ? alt.itemText(d) : core.itemText(d);
    }

    /* ───────── 금회차 상태조사표(HWPX) 읽기 ───────── */

    function nodeText(n) {
        if (n.nodeType === 3) return n.nodeValue || '';
        if (n.localName === 'lineBreak') return ' ';
        return Array.from(n.childNodes).map(nodeText).join('');
    }

    /**
     * 칸 글자. 앱은 칸 너비에 맞춰 줄을 나눠 내보내는데(문단 나눔·줄바꿈), 나뉜 자리는 원래
     * 띄어쓰기였으므로 빈칸으로 잇는다. 그냥 붙이면 「뿜칠박락」「볼트상태양호」가 된다.
     */
    function cellText(tc) {
        return Array.from(tc.getElementsByTagNameNS(HP_NS, 'p')).map((para) => (
            Array.from(para.getElementsByTagNameNS(HP_NS, 't')).map(nodeText).join('')
        )).join(' ').replace(/\s+/g, ' ').trim();
    }

    /** 문단에서 표 안의 글자를 뺀 글자 */
    function ownText(p) {
        return Array.from(p.getElementsByTagNameNS(HP_NS, 't')).filter((t) => {
            for (let n = t.parentNode; n && n !== p; n = n.parentNode) {
                if (n.localName === 'tbl') return false;
            }
            return true;
        }).map((t) => t.textContent || '').join('').trim();
    }

    function ownRows(tbl) {
        return Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tr')).filter((tr) => tr.parentNode === tbl);
    }

    function cellAddr(tc) {
        const a = tc.getElementsByTagNameNS(HP_NS, 'cellAddr')[0];
        return {
            col: a ? parseInt(a.getAttribute('colAddr') || '0', 10) : 0,
            row: a ? parseInt(a.getAttribute('rowAddr') || '0', 10) : 0
        };
    }

    /** 칸을 colAddr 순서로 놓은 글자 배열 (XML 안의 칸 순서는 믿지 않는다) */
    function tableRows(tbl) {
        return ownRows(tbl).map((tr) => {
            const byCol = {};
            Array.from(tr.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => { byCol[cellAddr(tc).col] = cellText(tc); });
            const maxCol = Math.max(-1, ...Object.keys(byCol).map(Number));
            const arr = [];
            for (let c = 0; c <= maxCol; c++) arr.push(byCol[c] || '');
            return arr;
        });
    }

    function headerKind(row) {
        const joined = (row || []).join('').replace(/\s+/g, '');
        if (joined.includes('점검내용') && joined.includes('발생원인')) return 'grade3';
        if (joined.includes('조사내용') && joined.includes('원인추정')) return 'grade12';
        return null;
    }

    /**
     * 사진첩 표: 윗줄 그림, 아랫줄 「사진N」. 같은 쪽(왼쪽 0열 / 오른쪽 4열)끼리 짝.
     * 두 장짜리는 3행 7열, 홀수로 남은 마지막 한 장은 3행 3열이다.
     */
    function readPhotoTable(tbl, photos) {
        const picByCol = {};
        const noByCol = {};
        Array.from(tbl.getElementsByTagNameNS(HP_NS, 'tc')).forEach((tc) => {
            const addr = cellAddr(tc);
            const side = addr.col < 4 ? 0 : 4;
            if (addr.row === 0) {
                const img = tc.getElementsByTagNameNS('*', 'img')[0];
                const ref = img && img.getAttribute('binaryItemIDRef');
                if (ref) picByCol[side] = ref;
            } else {
                const m = cellText(tc).match(/^사진\s*(\d+)$/);
                if (m) noByCol[side] = parseInt(m[1], 10);
            }
        });
        [0, 4].forEach((side) => {
            if (picByCol[side] && noByCol[side] != null) photos[noByCol[side]] = picByCol[side];
        });
    }

    async function parseSurveyHwpx(buffer) {
        if (typeof JSZip === 'undefined') throw new Error('JSZip 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
        const zip = await JSZip.loadAsync(buffer);
        const secPaths = Object.keys(zip.files)
            .filter((p) => /^Contents\/section\d+\.xml$/.test(p))
            .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
        if (!secPaths.length) throw new Error('한글 본문(section)을 찾지 못했습니다. 앱에서 내보낸 .hwpx 파일인지 확인해 주세요.');

        const floors = [];
        let sawGrade3 = false;
        for (const secPath of secPaths) {
            const xml = await zip.file(secPath).async('string');
            const doc = new DOMParser().parseFromString(xml, 'text/xml');
            const ps = Array.from(doc.documentElement.childNodes).filter((n) => n.nodeType === 1 && n.localName === 'p');
            let cur = null;
            ps.forEach((p) => {
                const tbls = Array.from(p.getElementsByTagNameNS(HP_NS, 'tbl'));
                // 층 제목(「1) 지하1층」)은 첫 조사표와 같은 문단에 들어 있다 — 표 밖의 글자만 본다
                const m = ownText(p).match(/^\d+\)\s*(.+)$/);
                if (m) {
                    cur = { floorLabel: m[1].trim(), rows: [], photos: {} };
                    floors.push(cur);
                }
                if (!cur) return;
                tbls.forEach((tbl) => {
                    const rows = tableRows(tbl);
                    const kind = headerKind(rows[0]);
                    if (kind === 'grade3') { sawGrade3 = true; return; }
                    if (kind === 'grade12') {
                        const start = rows[1] && /구조/.test(rows[1].join('')) && /비구조/.test(rows[1].join('')) ? 2 : 1;
                        for (let r = start; r < rows.length; r++) cur.rows.push(rows[r]);
                        return;
                    }
                    const cols = tbl.getAttribute('colCnt');
                    if (tbl.getAttribute('rowCnt') === '3' && (cols === '7' || cols === '3')) readPhotoTable(tbl, cur.photos);
                });
            });
        }
        const withRows = floors.filter((f) => f.rows.length);
        if (!withRows.length) {
            if (sawGrade3) throw new Error('3종 서식 상태조사표입니다. 지금은 1·2종 서식(10칸 조사표)만 읽을 수 있습니다.');
            throw new Error('상태조사표를 찾지 못했습니다. 앱의 「상태조사표 한글 출력」으로 받은 파일인지 확인해 주세요.');
        }

        // 그림 식별자 → 파일
        const hrefById = {};
        const hpf = zip.file('Contents/content.hpf');
        if (hpf) {
            const text = await hpf.async('string');
            text.replace(/<opf:item\b[^>]*>/g, (tag) => {
                const id = (tag.match(/\bid="([^"]*)"/) || [])[1];
                const href = (tag.match(/\bhref="([^"]*)"/) || [])[1];
                if (id && href) hrefById[id] = href;
                return tag;
            });
        }
        // 한글 파일로 내보낼 때 쓸 그림 원본: 그림 XML(이미 한글에서 잘 열리는 모양)과 파일 위치
        const picXmlById = {};
        const used = new Set();
        withRows.forEach((fl) => Object.keys(fl.photos).forEach((no) => used.add(fl.photos[no])));
        for (const secPath of secPaths) {
            const xml = await zip.file(secPath).async('string');
            used.forEach((id) => {
                if (picXmlById[id]) return;
                const at = xml.indexOf('binaryItemIDRef="' + id + '"');
                if (at < 0) return;
                const a = xml.lastIndexOf('<hp:pic ', at);
                const b = xml.indexOf('</hp:pic>', at);
                if (a >= 0 && b > a) picXmlById[id] = xml.slice(a, b + 9);
            });
        }
        const photoUrl = {};
        for (const fl of withRows) {
            for (const no of Object.keys(fl.photos)) {
                const id = fl.photos[no];
                if (photoUrl[id] || !hrefById[id] || !zip.file(hrefById[id])) continue;
                const blob = await zip.file(hrefById[id]).async('blob');
                photoUrl[id] = URL.createObjectURL(blob);
            }
        }
        return { floors: withRows, photoUrl: photoUrl, photoSrc: { zip: zip, hrefById: hrefById, picXmlById: picXmlById } };
    }

    /* ───────── 전회차 보고서(.hwp) 읽기 ───────── */

    /** raw deflate 풀기. 압축 뒤에 군더더기가 붙은 스트림도 있어, 오류가 나도 그때까지 나온 것을 쓴다. */
    async function inflateRaw(bytes) {
        if (typeof DecompressionStream === 'undefined') {
            throw new Error('이 브라우저는 한글(.hwp) 압축을 풀지 못합니다. 크롬이나 엣지 최신판에서 열어 주세요.');
        }
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks = [];
        let total = 0;
        try {
            for (;;) {
                const r = await reader.read();
                if (r.done) break;
                chunks.push(r.value);
                total += r.value.length;
            }
        } catch (e) {
            if (!total) throw e;
        }
        const out = new Uint8Array(total);
        let o = 0;
        chunks.forEach((c) => { out.set(c, o); o += c.length; });
        return out;
    }

    async function loadPrevBuffer(buffer, fileName) {
        setPrevStatus('전회차 보고서를 읽는 중...', 'muted');
        const tables = await hwpRead.readHwpTables(buffer, inflateRaw);
        const prev = core.extractPrev(tables);
        const count = Object.keys(prev.items).reduce((n, k) => n + prev.items[k].length, 0);
        if (!count) throw new Error('전회차 보고서에서 「주요 점검결과」 표를 찾지 못했습니다.');
        prev.fileName = fileName || '';
        state.prev = prev;
        save();
        showPrevStatus();
        if (state.defects.length) renderAll();
    }

    function showPrevStatus() {
        if (!state.prev) { setPrevStatus('', 'muted'); return; }
        const count = Object.keys(state.prev.items).reduce((n, k) => n + state.prev.items[k].length, 0);
        setPrevStatus('전회차: ' + (state.prev.fileName || '보고서') + ' — 주요 점검결과 ' + count + '건을 읽었습니다', 'ok');
    }

    /* ───────── 저장 ───────── */

    function storeKey() {
        return STORE_PREFIX + (state.meta.buildingName || state.fileName || 'unknown');
    }

    function save() {
        if (!state.defects.length) return;
        stashVariant();
        try {
            localStorage.setItem(storeKey(), JSON.stringify({
                variant: state.variant, vars: state.vars, catOverride: state.catOverride, loadLines: state.loadLines,
                repairNote: state.repairNote, prev: state.prev, markBlue: state.markBlue, meta: state.meta, ai: state.ai
            }));
        } catch (e) {
            /* 저장 실패는 화면 동작과 무관하다 */
        }
    }

    function loadSaved(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    /* ───────── 상태 계산 ───────── */

    function guessMeta(fileName) {
        const base = String(fileName || '').replace(/\.hwpx$/i, '');
        const name = (base.match(/^(.+?)_상태조사표/) || [null, base])[1].replace(/_/g, ' ').trim();
        const dm = base.match(/(20\d{2})(\d{2})\d{2}/);
        const round = dm ? dm[1] + '년 ' + (parseInt(dm[2], 10) >= 7 ? '하반기' : '상반기') : '';
        return { buildingName: name, roundLabel: round };
    }

    function applyOverrides() {
        state.defects.forEach((d) => {
            if (state.catOverride[d.id]) d.category = state.catOverride[d.id];
        });
    }

    function selectedIds() {
        return [].concat.apply([], core.CATEGORIES.map((c) => state.sel[c.key] || []));
    }

    function textOf(d) {
        return state.text[d.id] != null ? state.text[d.id] : baseText(d);
    }

    function loadLineList() {
        return String(state.loadLines || '').split('\n').map((s) => s.trim()).filter(Boolean);
    }

    /**
     * 분류에 실리는 항목: 고른 조사 항목 → 직접 적은 항목 순서. 하중조사는 적은 줄 그대로.
     * @returns {Array<{text: string, d?: object, customIdx?: number, lineIdx?: number}>}
     */
    function entriesOf(catKey) {
        if (catKey === 'load') return loadLineList().map((t, i) => ({ text: t, lineIdx: i }));
        const picked = (state.sel[catKey] || []).map((id) => state.byId[id]).filter(Boolean)
            .map((d) => ({ text: textOf(d), d: d }));
        const custom = (state.custom[catKey] || [])
            .map((t, i) => ({ text: String(t || '').trim(), customIdx: i }))
            .filter((e) => e.text);
        const list = picked.concat(custom);
        // 끌어서 순서를 바꿔 둔 분류는 그 순서대로, 그 뒤에 담은 것은 끝에 둔다
        const ord = state.order[catKey];
        if (!ord || !ord.length) return list;
        const pos = (e) => { const i = ord.indexOf(orderToken(e)); return i < 0 ? ord.length : i; };
        return list.map((e, i) => ({ e: e, i: i, p: pos(e) })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.e);
    }

    function orderToken(e) {
        return e.d ? 'd:' + e.d.id : 'c:' + e.text;
    }

    /** 분류 안에서 from번째 항목을 to번째 자리로 옮긴다 */
    function moveEntry(catKey, from, to) {
        const entries = entriesOf(catKey);
        if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return false;
        if (catKey === 'load') {
            const lines = loadLineList();
            lines.splice(to, 0, lines.splice(from, 1)[0]);
            state.loadLines = lines.join('\n');
            return true;
        }
        const tokens = entries.map(orderToken);
        tokens.splice(to, 0, tokens.splice(from, 1)[0]);
        state.order[catKey] = tokens;
        return true;
    }

    function prevLines(catKey) {
        return (state.prev && state.prev.items[catKey]) || [];
    }

    /** 전회차를 읽었으면 분류의 전회·금회 짝, 아니면 null */
    function compareOf(catKey, entries) {
        if (!state.prev) return null;
        return core.compareLines(prevLines(catKey), entries.map((e) => e.text));
    }

    function groupsNow() {
        if (isB()) return alt.applyToGroups(core.buildGroups(state.defects, selectedIds(), alt.typeOf));
        const groups = core.buildGroups(state.defects, selectedIds());
        if (isFinal()) {
            // 최종안: 담을 때 B안·AI안에서 따라온 보수방안이 있으면 그 묶음의 보수방안으로 쓴다
            const picked = selectedIds();
            groups.forEach((g) => {
                const d = g.items.filter((x) => picked.indexOf(x.id) >= 0 && state.repLine[x.id])[0];
                if (d) g.repair = { short: state.repLine[d.id], long: state.repLine[d.id] };
            });
        }
        return groups;
    }

    function opinionOf(catKey, groups) {
        if (state.opinion[catKey] != null) return state.opinion[catKey];
        if (catKey === 'load') return '';
        if (isFinal()) return finalOpinion(catKey);
        return isB() ? alt.buildOpinion(catKey, groups, state.meta) : core.buildOpinion(catKey, groups, state.meta);
    }

    /** 고르기 목록의 정렬: A는 사진·누수 위주 점수, B는 중요도 */
    function ranked(list) {
        return isB() ? alt.byImportance(list) : core.byScore(list);
    }

    /* ───────── 화면: 고르기 ───────── */

    function badgesOf(d) {
        const b = [];
        if (isB() && !d.good) {
            const im = alt.importanceOf(d);
            b.push('<span class="badge imp-' + (im.grade === '상' ? 'hi' : (im.grade === '중' ? 'mid' : 'lo')) + '" title="' + esc(im.reason) + '">중요도 ' + im.grade + '</span>');
        }
        if (core.isForced(d)) b.push('<span class="badge must">0.5mm 이상</span>');
        if (d.width != null && !d.widthSuspicious) b.push('<span class="badge">폭 ' + esc(d.width) + '</span>');
        if (d.widthSuspicious) b.push('<span class="badge warn">폭 확인</span>');
        if (d.leak) b.push('<span class="badge warn">누수</span>');
        if (d.progress) b.push('<span class="badge warn">진행</span>');
        if (d.photoNos.length) b.push('<span class="badge photo">사진' + d.photoNos.join('·') + '</span>');
        return b.join('');
    }

    /** kind: 전회차와 견준 결과('same' | 'changed' | 'new'), 전회차를 안 읽었으면 없음 */
    function itemRowHtml(d, checked, kind) {
        const url = d.photoIds.length ? state.photoUrl[d.photoIds[0]] : '';
        const thumb = url ? '<img class="thumb" src="' + esc(url) + '" alt="">' : '<span class="nothumb"></span>';
        const options = core.CATEGORIES.filter((c) => c.key !== 'load').map((c) => (
            '<option value="' + c.key + '"' + (c.key === d.category ? ' selected' : '') + '>' + esc(c.label) + '</option>'
        )).join('');
        return '<div class="item">'
            + '<input type="checkbox" data-act="pick" data-id="' + esc(d.id) + '"' + (checked ? ' checked' : '') + '>'
            + thumb
            + '<span class="src">' + esc(d.floor) + ' #' + esc(d.no) + '</span>'
            + '<input type="text" data-act="text" data-id="' + esc(d.id) + '" value="' + esc(textOf(d)) + '"'
            + (kind && kind !== 'same' ? ' class="chg"' : '') + (checked ? '' : ' disabled') + '>'
            + badgesOf(d)
            + '<select data-act="cat" data-id="' + esc(d.id) + '" title="분류 옮기기">' + options + '</select>'
            + '</div>';
    }

    function customRowHtml(catKey, idx, text, kind) {
        return '<div class="item">'
            + '<input type="checkbox" data-act="customOff" data-cat="' + catKey + '" data-idx="' + idx + '" checked title="체크를 풀면 지웁니다">'
            + '<span class="nothumb"></span><span class="src">직접 입력</span>'
            + '<input type="text" data-act="customText" data-cat="' + catKey + '" data-idx="' + idx + '" value="' + esc(text) + '"'
            + (kind && kind !== 'same' ? ' class="chg"' : '') + ' placeholder="주요 점검결과 문구">'
            + '</div>';
    }

    const PREV_TAG = {
        same: '<span class="badge">유지</span>',
        changed: '<span class="badge chg">문구 다름</span>',
        missing: '<span class="badge miss">금회 없음</span>'
    };

    /** 왼쪽 칸: 전회차 항목과 금회 반영 상태 */
    function prevBoxHtml(catKey, cmp) {
        const lines = prevLines(catKey);
        let h = '<div class="prevbox"><div class="colhead">전회차</div>';
        if (!lines.length) h += '<p class="muted">전회차 보고서에 이 분류의 항목이 없습니다.</p>';
        lines.forEach((t, i) => {
            const kind = cmp.prev[i].kind;
            let btn = '';
            if (kind === 'missing') btn = '<button type="button" class="btn ghost small" data-act="usePrev" data-cat="' + catKey + '" data-idx="' + i + '">금회에 넣기</button>';
            if (kind === 'changed') btn = '<button type="button" class="btn ghost small" data-act="prevText" data-cat="' + catKey + '" data-idx="' + i + '">전회 문구로</button>';
            h += '<div class="previtem ' + kind + '"><span class="ptext">' + (i + 1) + '. ' + esc(t) + '</span>' + PREV_TAG[kind] + btn + '</div>';
        });
        const op = state.prev.opinion[catKey];
        if (op) {
            h += '<details><summary>전회차 책임기술자 의견</summary><div class="prevop">' + esc(op) + '</div>'
                + '<button type="button" class="btn ghost small" data-act="prevOpinion" data-cat="' + catKey + '">이 의견을 금회 의견으로 가져오기</button></details>';
        }
        return h + '</div>';
    }

    function curBoxHtml(cat, entries, cmp) {
        const catKey = cat.key;
        if (catKey === 'load') {
            return '<div class="curbox">' + (state.prev ? '<div class="colhead">금회차</div>' : '')
                + '<textarea id="loadLines" rows="3" placeholder="예: 옥상층 : 추가 중량물 없음">' + esc(state.loadLines) + '</textarea>'
                + '<p class="muted">조사표에 없는 항목이라 직접 적습니다. 한 줄에 한 항목.</p></div>';
        }
        const inCat = state.defects.filter((d) => d.category === catKey);
        const pickedSet = new Set(entries.filter((e) => e.d).map((e) => e.d.id));
        const bad = ranked(inCat.filter((d) => !d.good && !pickedSet.has(d.id)));
        const good = core.byScore(inCat.filter((d) => d.good && !pickedSet.has(d.id)));
        let h = '<div class="curbox">' + (state.prev ? '<div class="colhead">금회차</div>' : '');
        entries.forEach((e, i) => {
            const kind = cmp ? cmp.cur[i].kind : null;
            h += e.d ? itemRowHtml(e.d, true, kind) : customRowHtml(catKey, e.customIdx, e.text, kind);
        });
        // 방금 「직접 추가」로 만든 빈 줄
        (state.custom[catKey] || []).forEach((t, i) => {
            if (!String(t || '').trim()) h += customRowHtml(catKey, i, '', null);
        });
        if (!entries.length) h += '<p class="muted">고른 항목이 없습니다. 표에는 「-」로 들어갑니다.</p>';
        h += '<button type="button" class="btn ghost small" data-act="addCustom" data-cat="' + catKey + '">+ 직접 추가</button>';
        if (bad.length) {
            h += '<details><summary>다른 결함 ' + bad.length + '건</summary>' + bad.map((d) => itemRowHtml(d, false, null)).join('') + '</details>';
        }
        if (good.length) {
            h += '<details><summary>상태양호 ' + good.length + '건</summary>' + good.map((d) => itemRowHtml(d, false, null)).join('') + '</details>';
        }
        return h + '</div>';
    }

    function renderPick() {
        const html = core.CATEGORIES.map((cat) => {
            const entries = entriesOf(cat.key);
            const cmp = compareOf(cat.key, entries);
            const badCount = state.defects.filter((d) => d.category === cat.key && !d.good).length;
            const over = entries.length > core.MAX_ITEMS;
            let head = '<h3>' + esc(cat.label);
            if (cat.key !== 'load') {
                head += ' <small>결함 ' + badCount + '건</small> <small class="' + (over ? 'over' : '') + '">고름 '
                    + entries.length + ' / ' + core.MAX_ITEMS + '</small>';
            }
            head += '</h3>';
            const body = cmp
                ? '<div class="cmp">' + prevBoxHtml(cat.key, cmp) + curBoxHtml(cat, entries, cmp) + '</div>'
                : curBoxHtml(cat, entries, null);
            return '<div class="cat">' + head + body + '</div>';
        }).join('');

        // 기존 결함 보수상태: 조사표에 없어 직접 적는다
        const prevRepair = state.prev ? state.prev.repairNote : '';
        const repairChanged = state.prev && core.compareLines([prevRepair], [state.repairNote]).cur[0].kind !== 'same';
        let repair = '<div class="cat"><h3>기존 결함발생 부위 보수상태 조사 결과</h3>';
        const input = '<div class="curbox">' + (state.prev ? '<div class="colhead">금회차</div>' : '')
            + '<textarea id="repairNote" rows="2"' + (repairChanged ? ' class="chg"' : '')
            + ' placeholder="예: D.A 진입구 안전난간 시건장치, 외부 패널 실링재 보수 실시">' + esc(state.repairNote) + '</textarea></div>';
        if (state.prev) {
            repair += '<div class="cmp"><div class="prevbox"><div class="colhead">전회차</div><div class="previtem">'
                + '<span class="ptext">' + esc(prevRepair || '-') + '</span></div></div>' + input + '</div>';
        } else {
            repair += input;
        }
        $('pickBody').innerHTML = html + repair + '</div>';
    }

    function renderChecks() {
        const list = core.listWidthChecks(state.defects);
        $('checkCard').classList.toggle('hidden', !list.length);
        $('checkList').innerHTML = list.map((d) => (
            '<li>' + esc(d.floor) + ' #' + esc(d.no) + ' ' + esc(d.content) + ' — 크기 칸: <b>' + esc(d.size) + '</b></li>'
        )).join('');
    }

    /* ───────── 화면: 표 ───────── */

    function blueIf(on, html) {
        return on && state.markBlue ? '<span style="color:' + BLUE + '">' + html + '</span>' : html;
    }

    /** 번호 붙인 항목 줄(HTML). 전회차와 달라진 줄은 파란색. */
    function linesHtml(catKey) {
        const entries = entriesOf(catKey);
        if (!entries.length) return '-';
        const cmp = compareOf(catKey, entries);
        return entries.map((e, i) => blueIf(cmp && cmp.cur[i].kind !== 'same', esc((i + 1) + '. ' + e.text))).join('\n');
    }

    function editCell(key, auto, cls) {
        const val = state.cellEdit[key] != null ? state.cellEdit[key] : auto;
        const classes = [cls || '', val ? '' : 'empty'].join(' ').trim();
        return '<td contenteditable="true" data-edit="' + esc(key) + '"' + (classes ? ' class="' + classes + '"' : '') + '>' + esc(val) + '</td>';
    }

    function rowsTable(head, rows, centerCols) {
        let h = '<table class="rep"><tr>' + head.map((t) => '<th>' + esc(t) + '</th>').join('') + '</tr>';
        rows.forEach((r) => {
            h += '<tr>' + r.cells.map((c, i) => editCell(r.key + '|' + i, c, centerCols.indexOf(i) >= 0 ? 'c' : '')).join('') + '</tr>';
        });
        if (!rows.length) h += '<tr><td class="c" colspan="' + head.length + '">-</td></tr>';
        return h + '</table>';
    }

    function outBlock(id, title, bodyHtml) {
        return '<div class="out" id="out-' + id + '"><div class="out-head"><h3>' + esc(title) + '</h3>'
            + '<button type="button" class="btn ghost small" data-copy="' + id + '">복사</button>'
            + '<span class="copied" data-copied="' + id + '"></span></div>'
            + '<div class="out-body">' + bodyHtml + '</div></div>';
    }

    function mainResultsHtml() {
        let h = '<table class="rep"><tr><th style="width:24%">구  분</th><th>주요 점검결과</th></tr>';
        core.CATEGORIES.forEach((cat) => {
            h += '<tr><td class="c">' + esc(cat.label) + '</td><td>' + linesHtml(cat.key) + '</td></tr>';
        });
        const repairChanged = state.prev && core.compareLines([state.prev.repairNote], [state.repairNote]).cur[0].kind !== 'same';
        h += '<tr><td class="c">기존 결함발생 부위 보수상태 조사 결과</td><td' + (state.repairNote ? '' : ' class="empty"') + '>'
            + blueIf(repairChanged, esc(state.repairNote)) + '</td></tr>';
        return h + '</table>';
    }

    function photoPairs(catKey) {
        return entriesOf(catKey).filter((e) => e.d).map((e) => ({
            url: e.d.photoIds.length ? state.photoUrl[e.d.photoIds[0]] : '',
            ref: e.d.photoNos.length ? e.d.floor + ' 사진' + e.d.photoNos[0] : '',
            caption: e.text.replace(/\s*\((?:최대 )?균열폭:[^)]*\)\s*$/, '')
        }));
    }

    function surveyTablesHtml(groups) {
        return core.CATEGORIES.map((cat) => {
            const pairs = photoPairs(cat.key);
            let h = '<table class="rep" style="margin-bottom:0.8rem;">'
                + '<tr><th colspan="2">구  분</th><th colspan="2">점  검  내  용</th></tr>'
                + '<tr><td class="c" style="width:13%">점검 항목</td><td class="c" style="width:13%">' + esc(cat.label) + '</td>'
                + '<td class="c">중대결함 발생 유무</td>' + editCell('major|' + cat.key, '해당사항 없음', 'c') + '</tr>'
                + '<tr><td class="c" colspan="2" rowspan="2">조사결과</td><td colspan="2">&lt;주요 점검결과&gt;</td></tr>'
                + '<tr><td colspan="2">' + linesHtml(cat.key) + '</td></tr>';
            const photoRows = Math.max(1, Math.ceil(pairs.length / 2));
            for (let r = 0; r < photoRows; r++) {
                const a = pairs[r * 2];
                const b = pairs[r * 2 + 1];
                const picCell = (p) => '<td class="photo">' + (p && p.url
                    ? '<img src="' + esc(p.url) + '" alt="' + esc(p.ref) + '" data-ref="' + esc(p.ref) + '">'
                    : (p ? '(사진 없음)' : '-')) + '</td>';
                const capCell = (p) => '<td class="c">' + esc(p ? p.caption : '-') + '</td>';
                h += '<tr>' + (r === 0 ? '<td class="c" colspan="2" rowspan="' + (photoRows * 2) + '">관련사진</td>' : '')
                    + picCell(a) + picCell(b) + '</tr><tr>' + capCell(a) + capCell(b) + '</tr>';
            }
            h += '<tr><td class="c" colspan="2">결함원인 및 책임기술자 의견</td>'
                + '<td colspan="2" contenteditable="true" data-opinion="' + cat.key + '"' + (opinionOf(cat.key, groups) ? '' : ' class="empty"') + '>'
                + esc(opinionOf(cat.key, groups)) + '</td></tr>'
                + '<tr><td class="c" colspan="2">비    고</td><td colspan="2">※ 상태조사 결과표, 위치도, 사진첩은 부록 참고</td></tr>'
                + '</table>';
            return h;
        }).join('');
    }

    function analysisHtml(groups) {
        let h = '<table class="rep"><tr><th style="width:16%">구  분</th><th style="width:38%">주요 상태조사 결과</th><th>책임기술자 의견, 분석 및 평가</th></tr>';
        core.CATEGORIES.forEach((cat) => {
            // 외관조사 결과의 의견에서 첫 줄(머리말)을 뺀 나머지를 그대로 쓴다
            const body = opinionOf(cat.key, groups).split('\n').filter((l) => !/^․/.test(l.trim())).join('\n');
            h += '<tr><td class="c">' + esc(cat.label) + '</td><td>' + linesHtml(cat.key) + '</td>'
                + '<td' + (body ? '' : ' class="empty"') + '>' + esc(body) + '</td></tr>';
        });
        return h + '</table>';
    }

    /** B안은 표의 비고 칸에 중요도를 적는다(보고서 표의 칸 구성은 A안과 같게 둔다) */
    function withImportance(rows, groups) {
        if (!isB()) return rows;
        rows.forEach((r, i) => { r.cells[r.cells.length - 1] = '중요도 ' + groups[i].importance.grade; });
        return rows;
    }

    function causeReviewHtml() {
        const list = alt.listCauseReviews(state.defects);
        let h = '<table class="rep"><tr><th style="width:14%">위치</th><th style="width:24%">조사내용</th><th style="width:24%">조사표의 원인추정</th><th>다시 볼 이유</th></tr>';
        list.forEach((x) => {
            h += '<tr><td class="c">' + esc(x.d.floor + ' #' + x.d.no) + '</td><td>' + esc(x.d.content) + '</td><td>' + esc(x.d.cause) + '</td><td>' + esc(x.why) + '</td></tr>';
        });
        if (!list.length) h += '<tr><td class="c" colspan="4">결함 유형과 어긋나 보이는 원인추정이 없습니다.</td></tr>';
        return h + '</table>';
    }

    function renderOut() {
        const groups = groupsNow();
        $('blueWrap').classList.toggle('hidden', !state.prev);
        $('btnAlignPrev').classList.toggle('hidden', !state.prev);
        $('markBlue').checked = state.markBlue;
        const blocks = [
            outBlock('main', '① 점검 주요결과 (결과표 · 5.1 현장조사 결과)', mainResultsHtml()),
            outBlock('summary', '② 실시결과 요약표', rowsTable(['위치', '부재', '점검결과', '조치 필요사항'], core.buildSummaryRows(groups), [0, 1, 2])),
            outBlock('survey', '③ 주요 외관조사 결과 (3.3)', surveyTablesHtml(groups)),
            outBlock('part', '④ 부분별 점검결과 (3.3)', rowsTable(['구분', '손상유형', '점검부위', '점검결과', '발생원인', '비고'], withImportance(core.buildPartRows(groups), groups), [0, 1, 2, 5])),
            outBlock('analysis', '⑤ 현장조사 결과분석 (3.3)', analysisHtml(groups)),
            outBlock('cause', '⑥ 주요 결함사항 원인 및 보수방안 (종합결론 4)', rowsTable(['구분', '조사내용', '원 인', '보수방안', '비 고'], withImportance(core.buildCauseRows(groups), groups), [0, 4]))
        ];
        if (isB()) {
            blocks.push(outBlock('prio', '⑦ 보수 우선순위 제안 (B안 전용, 보고서 표에는 없는 참고 자료)',
                rowsTable(['순위', '중요도', '구분', '대표 결함', '위치(건수)', '판단 근거', '권고 조치'], alt.buildPriorityRows(groups), [0, 1, 2])));
            blocks.push(outBlock('review', '⑧ 조사표 원인추정 재검토 (B안 전용, A안을 쓸 때도 확인 권장)', causeReviewHtml()));
        }
        $('outBody').innerHTML = blocks.join('');
        renderCompare();
    }

    function renderVariantTabs() {
        VARIANTS.forEach((v) => $('tab' + v).classList.toggle('on', state.variant === v));
        $('variantNote').textContent = isFinal()
            ? '최종안: 위 비교표에서 +로 담은 항목만 들어갑니다. 의견은 담은 항목 순서대로 한 줄씩 자동으로 써지고(B안·AI안에서 담으면 그 안의 줄, 그 밖에는 A안 말투), 아래에서 항목을 더 고르거나 문구를 고칠 수 있습니다. 보수방안 등 나머지 표는 A안 방식입니다.'
            : isB()
            ? 'B안: 결함 유형·부재·균열폭으로 중요도를 매겨 중요한 것부터 고르고, 원인과 보수방안도 조사표와 별개로 판단해 적습니다. 현장을 보지 않고 조사표 글자만으로 만든 초안이므로 책임기술자 검토가 필요합니다.'
            : 'A안: 우리 보고서의 문구를 따릅니다. 원인은 조사표의 원인추정 그대로, 보수방안은 기존 보고서의 짝을 씁니다.';
    }

    function renderAll() {
        renderVariantTabs();
        renderChecks();
        renderPick();
        renderOut();
    }

    /* ───────── 전회차 항목을 금회에 반영 ───────── */

    /** 전회 항목을 금회에 넣는다: 금회 조사표에서 같은 결함을 찾으면 그것을 고르고, 없으면 문구만 넣는다. */
    function usePrevItem(catKey, idx) {
        const text = prevLines(catKey)[idx];
        if (!text) return '';
        if (catKey === 'load') {
            state.loadLines = loadLineList().concat([text]).join('\n');
            return '전회 문구를 넣었습니다.';
        }
        const d = core.findDefectForPrev(text, state.defects, catKey, selectedIds());
        if (d) {
            if (d.category !== catKey) {
                d.category = catKey;
                state.catOverride[d.id] = catKey;
            }
            (state.sel[catKey] || (state.sel[catKey] = [])).push(d.id);
            return '금회 조사표의 ' + d.floor + ' #' + d.no + ' 항목을 골랐습니다.';
        }
        (state.custom[catKey] || (state.custom[catKey] = [])).push(text);
        return '금회 조사표에 같은 항목이 없어 전회 문구만 넣었습니다. 보수되었거나 삭제된 결함인지 확인해 주세요.';
    }

    /**
     * 전회차 항목을 기준으로 다시 고른다. 전회 항목마다 금회 조사표에서 같은 결함을 찾아 전회 순서대로
     * 고르고, 금회 조사표에 없는 것(보수·삭제)은 넣지 않고 「금회 없음」으로 남긴다.
     * 구조체 0.5mm 이상 균열은 전회에 없었어도 넣는다.
     */
    function alignToPrev() {
        const used = [];
        core.CATEGORIES.forEach((cat) => {
            if (cat.key === 'load') {
                if (!loadLineList().length) state.loadLines = prevLines('load').join('\n');
                return;
            }
            const ids = [];
            prevLines(cat.key).forEach((text) => {
                const d = core.findDefectForPrev(text, state.defects, cat.key, used);
                if (!d) return;
                if (d.category !== cat.key) {
                    d.category = cat.key;
                    state.catOverride[d.id] = cat.key;
                }
                ids.push(d.id);
                used.push(d.id);
            });
            state.sel[cat.key] = ids;
            state.custom[cat.key] = [];
        });
        state.defects.forEach((d) => {
            if (core.isForced(d) && used.indexOf(d.id) < 0) {
                (state.sel[d.category] || (state.sel[d.category] = [])).push(d.id);
                used.push(d.id);
            }
        });
    }

    /** 금회 문구를 전회 문구 그대로 맞춘다(같은 결함인데 표기만 다른 경우) */
    function usePrevText(catKey, idx) {
        const text = prevLines(catKey)[idx];
        const entries = entriesOf(catKey);
        const cmp = compareOf(catKey, entries);
        const e = cmp && entries[cmp.prev[idx].curIdx];
        if (!text || !e) return;
        if (e.d) state.text[e.d.id] = text;
        else if (e.customIdx != null) state.custom[catKey][e.customIdx] = text;
        else if (e.lineIdx != null) {
            const lines = loadLineList();
            lines[e.lineIdx] = text;
            state.loadLines = lines.join('\n');
        }
    }

    function usePrevOpinion(catKey) {
        const op = state.prev && state.prev.opinion[catKey];
        if (!op) return;
        // 외관조사 결과 표의 첫 줄(머리말)은 금회 것으로 두고 본문만 전회 의견으로 바꾼다
        const head = catKey === 'load' ? '' : core.buildOpinion(catKey, [], state.meta).split('\n')[0];
        state.opinion[catKey] = (head ? head + '\n' : '') + op;
    }

    /* ───────── AI 의견 초안 (Gemini) ───────── */

    function setAiNote(msg, cls) {
        const el = $('aiNote');
        el.textContent = msg;
        el.className = cls || 'muted';
    }

    /** AI안이 분류에 고른 결함(분류를 옮겼거나 조사표에서 사라진 것은 뺀다) */
    function aiDefects(catKey) {
        return ((state.ai && state.ai.sel && state.ai.sel[catKey]) || [])
            .map((id) => state.byId[id]).filter((d) => d && d.category === catKey);
    }

    /** 1단계에 보낼 내용: 분류별 결함 전체. 번호(n)로 답을 받아 byN으로 결함을 되찾는다. */
    function aiPickInput() {
        const cats = [];
        const byN = {};
        let n = 0;
        core.CATEGORIES.forEach((cat) => {
            if (cat.key === 'load') return;
            const bad = state.defects.filter((d) => d.category === cat.key && !d.good);
            if (!bad.length) return;
            cats.push({
                key: cat.key,
                label: cat.label,
                defects: bad.map((d) => {
                    n += 1;
                    byN[n] = d;
                    return {
                        n: n, floor: d.floor, location: d.location, content: d.content, size: d.size, cause: d.cause,
                        progress: d.progress, leak: d.leak, photo: d.photoNos.length > 0, forced: core.isForced(d)
                    };
                })
            });
        });
        return { input: { buildingName: state.meta.buildingName, roundLabel: state.meta.roundLabel, maxItems: core.MAX_ITEMS, cats: cats }, byN: byN, count: n };
    }

    /**
     * AI가 고른 번호를 분류별 결함 id로 옮긴다. 구조체 균열 0.5mm 이상은 AI가 빠뜨려도 넣고,
     * 결함이 없는 분류는 A안처럼 상태양호 항목 하나로 채운다.
     */
    function aiSelFromPicks(picks, byN) {
        const sel = {};
        const why = {};
        core.CATEGORIES.forEach((cat) => {
            if (cat.key === 'load') { sel[cat.key] = []; return; }
            const inCat = state.defects.filter((d) => d.category === cat.key);
            const forced = core.byScore(inCat.filter(core.isForced));
            const list = forced.slice();
            (picks[cat.key] || []).forEach((p) => {
                const d = byN[p.n];
                if (!d) return;
                if (p.why) why[d.id] = p.why;
                if (list.indexOf(d) < 0 && list.length < Math.max(core.MAX_ITEMS, forced.length)) list.push(d);
            });
            if (!list.length) {
                const good = core.byScore(inCat.filter((d) => d.good))[0];
                if (good) list.push(good);
            }
            sel[cat.key] = list.map((d) => d.id);
        });
        return { sel: sel, why: why };
    }

    /** 2단계에 보낼 내용: AI안이 고른 항목과 그 근거(위치·크기·원인추정) */
    function aiOpinionInput() {
        const cats = [];
        core.CATEGORIES.forEach((cat) => {
            const list = aiDefects(cat.key);
            if (!list.length) return;
            cats.push({
                key: cat.key,
                label: cat.label,
                items: list.map((d) => ({
                    text: core.itemText(d), location: d.location, size: d.size, cause: d.cause,
                    progress: d.progress, leak: d.leak, good: d.good,
                    sameTypeCount: d.good ? 0 : state.defects.filter((x) => !x.good && x.category === d.category && x.typeKey === d.typeKey).length
                }))
            });
        });
        return { buildingName: state.meta.buildingName, roundLabel: state.meta.roundLabel, cats: cats };
    }

    /** AI안 만들기: ① 결함 전체에서 주요 점검결과를 고르게 하고 ② 고른 항목으로 의견을 쓰게 한다 */
    async function runAi() {
        const key = window.GEMINI_DIRECT_API_KEY || '';
        if (!key) {
            setAiNote('이 화면에는 AI 키가 없습니다. 배포된 사이트(GitHub Pages)에서 열어야 쓸 수 있습니다.', 'err');
            return;
        }
        const pick = aiPickInput();
        if (!pick.count) {
            setAiNote('조사표에 결함이 없습니다.', 'err');
            return;
        }
        if (!window.confirm('조사표의 결함 ' + pick.count + '건의 글자(건물명·층·위치·결함 내용·크기·원인추정)를 Google Gemini로 보내 '
            + 'AI안(주요 점검결과 고르기 + 의견)을 받습니다. 사진은 보내지 않습니다.\n받은 내용은 비교표의 AI안 칸에만 들어가고, A안·B안은 바뀌지 않습니다. 계속할까요?')) return;
        const btn = $('btnAiOpinion');
        btn.disabled = true;
        try {
            setAiNote('AI가 주요 점검결과를 고르는 중... (1/2)', 'muted');
            const chosen = aiSelFromPicks(await ai.requestPicks(key, pick.input), pick.byN);
            state.ai = { sel: chosen.sel, why: chosen.why, opinion: {}, note: {}, repair: {}, odd: {} };
            save();
            renderCompare();
            setAiNote('AI가 의견을 쓰는 중... (2/2)', 'muted');
            const input = aiOpinionInput();
            let got;
            try {
                got = await ai.requestOpinions(key, input);
            } catch (e) {
                throw new Error('주요 점검결과는 골랐지만 의견을 받지 못했습니다. 다시 눌러 주세요. (' + (e.message || e) + ')');
            }
            const odd = {};
            input.cats.forEach((c) => {
                const nums = got.opinion[c.key] ? ai.unknownNumbers(got.opinion[c.key], ai.sourceTextOf(c)) : [];
                if (nums.length) odd[c.key] = nums;
            });
            state.ai.opinion = got.opinion;
            state.ai.note = got.note;
            state.ai.repair = got.repair;
            state.ai.odd = odd;
            save();
            renderCompare();
            const nOdd = Object.keys(odd).length;
            if (!Object.keys(got.opinion).length) throw new Error('주요 점검결과는 골랐지만 AI가 쓴 의견이 없습니다. 다시 눌러 주세요.');
            if (nOdd) setAiNote('AI안을 받았습니다. ' + nOdd + '개 분류의 의견에 조사표에 없는 숫자가 있어 비교표에 표시했습니다(AI가 든 기준값일 수 있으니 층·치수만 확인하세요).', 'ok');
            else setAiNote('AI안을 받았습니다. 비교표에서 읽어 보고 쓸 항목과 의견을 고르세요.', 'ok');
        } catch (e) {
            setAiNote(e.message || String(e), 'err');
        } finally {
            btn.disabled = false;
        }
    }
    /* ───────── 한눈에 비교: 전회차 · A안 · B안 · AI안 → 최종안 ───────── */

    /** 의견에서 첫 줄(머리말)을 뺀 본문 */
    function opinionBody(op) {
        return String(op || '').split('\n').filter((l) => !/^․/.test(l.trim())).join('\n');
    }

    /** 작성안 v의 분류별 항목과 의견. 보고 있지 않은 안은 잠깐 올려서 읽고 되돌린다. */
    function snapshotOf(v) {
        const cur = state.variant;
        if (v !== cur) { stashVariant(); bindVariant(v); }
        const groups = groupsNow();
        const out = {};
        core.CATEGORIES.forEach((cat) => {
            const entries = entriesOf(cat.key);
            out[cat.key] = {
                entries: entries.map((e) => ({
                    text: e.text, id: e.d ? e.d.id : null,
                    op: e.d ? opLineTextOf(e.d) : '', rep: e.d ? repairTextOf(e.d) : ''
                })),
                // 의견을 손으로 고친 분류는 항목별 줄이 실제 의견과 다르므로 비교표에 고친 글 그대로 보여 준다
                edited: state.opinion[cat.key] != null,
                opinion: opinionBody(opinionOf(cat.key, groups))
            };
        });
        if (v !== cur) { stashVariant(); bindVariant(cur); }
        return out;
    }

    /** AI안 의견에서 i번째 항목의 줄. 줄 수가 항목 수와 다르면 짝을 알 수 없어 쓰지 않는다. */
    function aiLineOf(catKey, i) {
        const lines = String((state.ai && state.ai.opinion && state.ai.opinion[catKey]) || '').split('\n').filter(Boolean);
        return lines.length === aiDefects(catKey).length ? lines[i] : '';
    }

    /** AI안이 i번째 항목에 적은 보수방안. 줄 수가 항목 수와 다르면 짝을 알 수 없어 쓰지 않는다. */
    function aiRepairOf(catKey, i) {
        const list = (state.ai && state.ai.repair && state.ai.repair[catKey]) || [];
        return list.length === aiDefects(catKey).length ? (list[i] || '') : '';
    }

    /** 지금 보는 작성안이 결함 한 건에 적는 보수방안(A안은 우리 보고서의 짝 문구, 짝이 없으면 빈칸) */
    function repairTextOf(d) {
        if (d.good) return '';
        if (isB()) return alt.repairOf(d);
        return (isFinal() && state.repLine[d.id]) || core.repairOf(d.category, d.typeKey).long;
    }

    /** B안 말투의 의견 한 줄(결함 한 건 기준) */
    function bLineOf(d) {
        return '- [중요도 ' + alt.importanceOf(d).grade + '] ' + d.content + ' (' + d.floor + '): ' + alt.causeOf(d) + '. → ' + alt.repairOf(d) + '.';
    }

    /** 지금 보는 작성안이 결함 한 건에 적는 의견 한 줄(A안 말투가 기본, 최종안은 따라온 줄이 있으면 그것) */
    function opLineTextOf(d) {
        if (isFinal() && state.opLine[d.id]) return state.opLine[d.id];
        if (d.good) return '';
        return isB() ? bLineOf(d) : core.opinionLine(d.content, d.cause);
    }

    /** 최종안 의견: 담은 항목 순서대로 한 줄씩. 담을 때 따라온 줄(B안·AI안)이 있으면 그것, 없으면 A안 말투. */
    function finalOpinion(catKey) {
        const lines = entriesOf(catKey).map((e) => (e.d ? opLineTextOf(e.d) : '')).filter(Boolean);
        const empty = core.buildOpinion(catKey, [], state.meta);
        return lines.length ? empty.split('\n')[0] + '\n' + lines.join('\n') : empty;
    }

    /** 비교표의 한 줄이 가리키는 항목: { text, d(없으면 글자만), line(따라갈 의견 줄) } */
    function sourceItem(src, catKey, idx, snaps) {
        if (src === 'AI') {
            const d = aiDefects(catKey)[idx];
            return d ? { text: core.itemText(d), d: d, line: aiLineOf(catKey, idx), repair: aiRepairOf(catKey, idx) } : null;
        }
        if (src === 'prev') {
            const text = prevLines(catKey)[idx];
            if (!text) return null;
            if (catKey === 'load') return { text: text, d: null, line: '' };
            // 금회 조사표에서 같은 결함을 찾으면 그것을(문구·균열폭은 금회 값), 없으면 전회 문구만 담는다
            const d = core.findDefectForPrev(text, state.defects, catKey, []);
            return d && d.category === catKey ? { text: core.itemText(d), d: d, line: '' } : { text: text, d: null, line: '' };
        }
        const e = (snaps || { [src]: snapshotOf(src) })[src][catKey].entries[idx];
        if (!e) return null;
        const d = e.id ? state.byId[e.id] : null;
        const fromB = d && src === 'B' && !d.good;
        return { text: e.text, d: d, line: fromB ? bLineOf(d) : '', repair: fromB ? alt.repairOf(d) : '' };
    }

    /** 최종안을 화면에 올린다(담기·빼기는 최종안을 보면서 한다. 아래 표와 한글 파일도 최종안으로 바뀐다) */
    function showFinal() {
        if (state.variant === 'F') return;
        stashVariant();
        bindVariant('F');
    }

    /** 항목을 최종안에 담는다. 이미 담긴 결함이면 따라온 의견 줄만 그 안의 것으로 바꾼다. */
    function addToFinal(item, catKey) {
        if (!item) return;
        if (catKey === 'load') {
            if (loadLineList().indexOf(item.text) < 0) state.loadLines = loadLineList().concat([item.text]).join('\n');
            return;
        }
        if (!item.d) {
            const list = state.custom[catKey] || (state.custom[catKey] = []);
            if (list.indexOf(item.text) < 0) list.push(item.text);
            return;
        }
        const id = item.d.id;
        const sel = state.sel[catKey] || (state.sel[catKey] = []);
        const isNew = sel.indexOf(id) < 0;
        if (isNew) sel.push(id);
        if (item.text && item.text !== baseText(item.d)) state.text[id] = item.text; else delete state.text[id];
        if (item.line) state.opLine[id] = item.line; else delete state.opLine[id];
        if (item.repair) state.repLine[id] = item.repair; else delete state.repLine[id];
        // 의견을 손으로 고쳐 둔 분류는 자동으로 다시 쓰지 않으므로, 새 항목의 줄만 끝에 붙인다
        if (isNew && state.opinion[catKey] != null) {
            const line = item.line || (item.d.good ? '' : core.opinionLine(item.d.content, item.d.cause));
            if (line) state.opinion[catKey] = state.opinion[catKey].replace(/\s+$/, '') + '\n' + line;
        }
    }

    /**
     * 의견 줄만(part 'op') 또는 보수방안만(part 'rep') 그 안의 것으로 바꾼다. 항목이 아직 최종안에 없으면
     * 항목을 담되 고른 쪽만 그 안의 것으로 하고 나머지는 기본(A안)으로 둔다.
     */
    function applyPart(item, catKey, part) {
        if (!item || !item.d) return;
        const d = item.d;
        if ((state.sel[catKey] || []).indexOf(d.id) < 0) {
            addToFinal({ text: item.text, d: d, line: part === 'op' ? item.line : '', repair: part === 'rep' ? item.repair : '' }, catKey);
            return;
        }
        if (part === 'rep') {
            if (item.repair) state.repLine[d.id] = item.repair; else delete state.repLine[d.id];
            return;
        }
        const before = opLineTextOf(d);
        if (item.line) state.opLine[d.id] = item.line; else delete state.opLine[d.id];
        const after = opLineTextOf(d);
        // 의견을 손으로 고쳐 둔 분류는 자동으로 다시 쓰지 않으므로, 그 글 안에서 이 항목의 줄만 바꾼다(못 찾으면 끝에 붙인다)
        if (state.opinion[catKey] != null && after && after !== before) {
            const cur = state.opinion[catKey];
            state.opinion[catKey] = before && cur.indexOf(before) >= 0 ? cur.replace(before, after) : cur.replace(/\s+$/, '') + '\n' + after;
        }
    }

    function removeFromFinal(catKey, idx) {
        const e = entriesOf(catKey)[idx];
        if (!e) return;
        if (e.d) {
            state.sel[catKey] = (state.sel[catKey] || []).filter((id) => id !== e.d.id);
            delete state.opLine[e.d.id];
            delete state.repLine[e.d.id];
            delete state.text[e.d.id];
        } else if (e.customIdx != null) {
            state.custom[catKey].splice(e.customIdx, 1);
        } else if (e.lineIdx != null) {
            const lines = loadLineList();
            lines.splice(e.lineIdx, 1);
            state.loadLines = lines.join('\n');
        }
    }

    /** 분류마다 보여 줄 묶어 쓰기 후보 수(건수 많은 순) */
    const MAX_AGG_PER_CAT = 5;

    function aggregatesNow() {
        return core.buildAggregates(state.defects);
    }

    function compareHtml() {
        const cur = state.variant;
        const snaps = { A: snapshotOf('A'), B: snapshotOf('B'), F: snapshotOf('F') };
        const aiOp = (state.ai && state.ai.opinion) || {};
        const aiWhy = (state.ai && state.ai.why) || {};
        const aiNote = (state.ai && state.ai.note) || {};
        const hasAi = !!(state.ai && state.ai.sel);
        const aggs = aggregatesNow();
        const th = (v, label) => '<th' + (v === cur ? ' class="cur"' : '') + '>' + label + (v === cur ? ' <small>아래 표에 나오는 안</small>' : '') + '</th>';
        const plus = (src, k, i, inFinal) => '<button type="button" class="plus' + (inFinal ? ' in' : '') + '" data-add="' + src + '" data-cat="' + k + '" data-idx="' + i + '" title="'
            + (inFinal ? '최종안에 담겨 있음 — 누르면 문구·의견·보수방안을 모두 이 안의 것으로 바꿉니다' : '최종안에 담기 (의견·보수방안도 이 안의 것으로)') + '">' + (inFinal ? '✓' : '+') + '</button>';
        // 의견 줄·보수방안 줄만 따로 고르는 버튼
        const partBtn = (part, src, k, i, on) => '<button type="button" class="plus' + (on ? ' in' : '') + '" data-part="' + part + '" data-add="' + src + '" data-cat="' + k + '" data-idx="' + i + '" title="'
            + (on ? '최종안이 지금 쓰고 있는 ' : '최종안의 이 항목 ') + (part === 'op' ? '의견' : '보수방안') + (on ? '' : '만 이것으로 바꾸기 (항목이 없으면 담습니다)') + '">' + (on ? '✓' : '+') + '</button>';
        const partList = (part, src, k, rows) => {
            const list = rows.filter((x) => x.text);
            if (!list.length) return '-';
            const fin = snaps.F[k].entries;
            return list.map((x) => {
                const f = fin.filter((e) => e.id && e.id === x.id)[0];
                return '<div class="it">' + partBtn(part, src, k, x.i, !!f && (part === 'op' ? f.op : f.rep) === x.text)
                    + '<span>' + esc((x.i + 1) + '. ' + x.text.replace(/^-\s*/, '')) + '</span></div>';
            }).join('');
        };
        const allBtn = (src, k, n) => (n > 1 ? '<div><button type="button" class="btn ghost small" data-add-all="' + src + '" data-cat="' + k + '">모두 담기</button></div>' : '');
        const opBtn = (src, k, has) => (has
            ? '<div><button type="button" class="btn ghost small" data-use="' + src + '" data-cat="' + k + '">이 의견을 최종안에 쓰기</button></div>' : '');

        let h = '<table class="cmp4"><tr><th style="width:8%">구분</th><th style="width:4%"></th>'
            + '<th>전회차 보고서</th>' + th('A', 'A안 · 우리 보고서 스타일') + th('B', 'B안 · 중요도 중심')
            + '<th>AI안 (Gemini)</th>' + th('F', '최종안') + '</tr>';
        core.CATEGORIES.forEach((cat) => {
            const k = cat.key;
            const finalIds = snaps.F[k].entries.map((e) => e.id).filter(Boolean);
            const finalTexts = snaps.F[k].entries.map((e) => e.text);
            const prevOp = (state.prev && state.prev.opinion[k]) || '';
            const prevList = prevLines(k);

            const lineCell = (v) => {
                const entries = snaps[v][k].entries;
                const cmp = state.prev ? core.compareLines(prevList, entries.map((e) => e.text)) : null;
                return '<td class="items' + (v === cur ? ' cur' : '') + '">' + (entries.length ? entries.map((e, i) => '<div class="it">'
                    + plus(v, k, i, e.id ? finalIds.indexOf(e.id) >= 0 : finalTexts.indexOf(e.text) >= 0)
                    + '<span>' + blueIf(cmp && cmp.cur[i].kind !== 'same', esc((i + 1) + '. ' + e.text)) + '</span></div>').join('') + allBtn(v, k, entries.length) : '-')
                    + (v === 'A' ? aggBlock : '') + '</td>';
            };
            // 묶어 쓰기 후보(A안 칸 아래): 같은 부재·유형이 여러 건일 때 한 줄로 쓰는 문구. 쓸지는 사람이 정한다.
            const aggList = aggs.filter((a) => a.category === k).slice(0, MAX_AGG_PER_CAT);
            const aggBlock = aggList.length ? '<div class="agg"><div class="agghead">묶어 쓰기 <small>같은 결함이 많을 때</small></div>'
                + aggList.map((a) => {
                    const on = snaps.F[k].entries.some((e) => e.id === a.rep.id && e.text === a.text);
                    return '<div class="it"><button type="button" class="plus' + (on ? ' in' : '') + '" data-agg="' + esc(a.key) + '" data-cat="' + k + '" title="'
                        + (on ? '최종안에 담겨 있음' : '이 문구로 최종안에 담기 (대표 사진·의견은 ' + esc(a.rep.floor) + ' #' + esc(a.rep.no) + ' 결함 기준)') + '">' + (on ? '✓' : '+') + '</button>'
                        + '<span>' + esc(a.text) + '<span class="why">' + a.count + '건 · ' + (a.floorCount ? a.floorCount + '/' + a.floorTotal + '개 층' : '외부') + '</span></span></div>';
                }).join('') + '</div>' : '';
            const opCell = (v) => {
                const s = snaps[v][k];
                if (s.edited) {
                    return '<td' + (v === cur ? ' class="cur"' : '') + '>' + (esc(s.opinion) || '-')
                        + '<div class="muted">(직접 고친 의견이라 줄별로 고를 수 없습니다)</div>' + opBtn(v, k, !!s.opinion) + '</td>';
                }
                return '<td class="items' + (v === cur ? ' cur' : '') + '">'
                    + partList('op', v, k, s.entries.map((e, i) => ({ i: i, id: e.id, text: e.op }))) + '</td>';
            };

            // AI안 항목: A안·B안 어디에도 없는 것은 「AI만」, 고른 이유는 줄 아래에 작게
            const aiList = aiDefects(k);
            const aiLines = aiList.map((d) => core.itemText(d));
            const aiCmp = state.prev ? core.compareLines(prevList, aiLines) : null;
            const inAB = (id) => ['A', 'B'].some((v) => snaps[v][k].entries.some((e) => e.id === id));
            const aiEmpty = k === 'load' || hasAi ? '-' : '<span class="muted">위 「AI안 만들기」를 누르면 나옵니다</span>';
            const aiCell = aiList.length ? aiList.map((d, i) => '<div class="it">' + plus('AI', k, i, finalIds.indexOf(d.id) >= 0) + '<span>'
                + blueIf(aiCmp && aiCmp.cur[i].kind !== 'same', esc((i + 1) + '. ' + aiLines[i]))
                + (inAB(d.id) ? '' : ' <span class="badge chg">AI만</span>')
                + (core.isForced(d) ? ' <span class="badge must">0.5mm 이상</span>' : '')
                + (aiWhy[d.id] ? '<span class="why">' + esc(aiWhy[d.id]) + '</span>' : '') + '</span></div>').join('') + allBtn('AI', k, aiList.length) : aiEmpty;
            const odd = (state.ai && state.ai.odd && state.ai.odd[k]) || [];

            const prevCell = !state.prev ? '<span class="muted">전회차 보고서(.hwp)를 읽으면 나옵니다</span>'
                : (prevList.length ? prevList.map((t, i) => '<div class="it">' + plus('prev', k, i, finalTexts.indexOf(t) >= 0)
                    + '<span>' + esc((i + 1) + '. ' + t) + '</span></div>').join('') + allBtn('prev', k, prevList.length) : '-');

            const finalEntries = snaps.F[k].entries;
            const finalCell = finalEntries.length ? finalEntries.map((e, i) => '<div class="it drag" draggable="true" data-fidx="' + i + '" data-cat="' + k + '" title="끌어서 순서 바꾸기">'
                + '<span class="grip" aria-hidden="true">⠿</span>'
                + '<button type="button" class="plus minus" data-fdel="' + i + '" data-cat="' + k + '" title="최종안에서 빼기">−</button>'
                + '<span>' + esc((i + 1) + '. ' + e.text) + '</span></div>').join('')
                : '<span class="muted">' + (k === 'load' ? '-' : '왼쪽 항목의 +를 눌러 담으세요') + '</span>';

            const repList = (list) => {
                const rows = list.filter((x) => x.rep);
                return rows.length ? esc(rows.map((x) => x.no + '. ' + x.rep).join('\n')) : '-';
            };
            const repCell = (v) => '<td class="items' + (v === cur ? ' cur' : '') + '">'
                + partList('rep', v, k, snaps[v][k].entries.map((e, i) => ({ i: i, id: e.id, text: e.rep }))) + '</td>';
            const aiRepCell = partList('rep', 'AI', k, aiList.map((d, i) => ({ i: i, id: d.id, text: aiRepairOf(k, i) })));
            // AI 의견: 줄 수가 항목 수와 맞으면 줄별로 고르게 하고, 안 맞으면 통째로만 쓸 수 있다
            const aiOpRows = aiList.map((d, i) => ({ i: i, id: d.id, text: aiLineOf(k, i) }));
            const aiOpByLine = aiOpRows.some((x) => x.text);
            const aiOpCell = !aiOp[k] ? aiEmpty : (aiOpByLine ? partList('op', 'AI', k, aiOpRows) : esc(aiOp[k]) + opBtn('AI', k, true));

            h += '<tr><td class="c" rowspan="3">' + esc(cat.label) + '</td><td class="c">주요<br>결과</td>'
                + '<td class="items">' + prevCell + '</td>' + lineCell('A') + lineCell('B')
                + '<td class="items">' + aiCell + '</td>'
                + '<td class="items final">' + finalCell + '</td></tr>'
                + '<tr><td class="c">의견</td>'
                + '<td>' + (esc(prevOp) || '-') + opBtn('prev', k, !!prevOp) + '</td>'
                + opCell('A') + opCell('B')
                + '<td class="items">' + aiOpCell
                + (odd.length ? '<div><span class="badge must" title="AI가 든 기준값(예: 0.3mm)일 수 있습니다. 층·치수가 조사표와 맞는지만 확인하세요.">조사표에 없는 숫자: ' + esc(odd.join(', ')) + '</span></div>' : '')
                + (aiNote[k] ? '<div class="ainote"><b>AI 검토 메모</b> ' + esc(aiNote[k]) + '</div>' : '') + '</td>'
                + '<td class="final">' + (esc(snaps.F[k].opinion) || '-') + '</td></tr>'
                + '<tr><td class="c">보수<br>방안</td><td>-</td>' + repCell('A') + repCell('B')
                + '<td class="items">' + (aiList.length ? aiRepCell : aiEmpty) + '</td>'
                + '<td class="final">' + repList(snaps.F[k].entries.map((e, i) => ({ no: i + 1, rep: e.rep }))) + '</td></tr>';
        });
        return h + '</table>';
    }

    function renderCompare() {
        $('compareBody').innerHTML = compareHtml();
    }

    /** 비교표의 의견 하나를 최종안의 그 분류 의견으로 쓴다(통째로 바꾼다). 첫 줄(머리말)은 금회 것으로 둔다. */
    function useOpinion(src, catKey) {
        const body = src === 'prev' ? ((state.prev && state.prev.opinion[catKey]) || '')
            : (src === 'AI' ? ((state.ai && state.ai.opinion[catKey]) || '') : snapshotOf(src)[catKey].opinion);
        if (!body) return;
        showFinal();
        const head = catKey === 'load' ? '' : core.buildOpinion(catKey, [], state.meta).split('\n')[0];
        state.opinion[catKey] = (head ? head + '\n' : '') + body;
    }
    /* ───────── 한글 파일로 저장 ───────── */

    let photoSrc = null;

    /** 화면에 보이는 내용 그대로(고친 칸·파란색 포함) 한글 출력용 내용으로 옮긴다 */
    function hwpxModel() {
        const groups = groupsNow();
        const edited = (r) => r.cells.map((c, i) => (state.cellEdit[r.key + '|' + i] != null ? state.cellEdit[r.key + '|' + i] : c));
        const cats = {};
        core.CATEGORIES.forEach((cat) => {
            const entries = entriesOf(cat.key);
            const cmp = compareOf(cat.key, entries);
            const opinion = opinionOf(cat.key, groups);
            const majorKey = 'major|' + cat.key;
            cats[cat.key] = {
                lines: entries.map((e, i) => ({ text: e.text, blue: !!(cmp && state.markBlue && cmp.cur[i].kind !== 'same') })),
                opinion: opinion,
                body: opinion.split('\n').filter((l) => !/^․/.test(l.trim())).join('\n'),
                major: state.cellEdit[majorKey] != null ? state.cellEdit[majorKey] : '해당사항 없음',
                photos: entries.filter((e) => e.d && e.d.photoIds.length).map((e) => ({
                    key: e.d.photoIds[0],
                    caption: e.text.replace(/\s*\((?:최대 )?균열폭:[^)]*\)\s*$/, '')
                }))
            };
        });
        const repairBlue = !!(state.prev && state.markBlue
            && core.compareLines([state.prev.repairNote], [state.repairNote]).cur[0].kind !== 'same');
        return {
            title: [state.meta.buildingName, state.meta.roundLabel].filter(Boolean).join(' ') + ' (' + (isFinal() ? '최종안' : '작성안 ' + state.variant) + ')',
            cats: cats,
            repair: { text: state.repairNote, blue: repairBlue },
            summaryRows: core.buildSummaryRows(groups).map((r) => ({ cells: edited(r) })),
            partRows: withImportance(core.buildPartRows(groups), groups).map((r, i) => ({ cat: groups[i].category, cells: edited(r) })),
            causeRows: withImportance(core.buildCauseRows(groups), groups).map((r, i) => ({ cat: groups[i].category, cells: edited(r) }))
        };
    }

    /** 템플릿을 채워 한글 파일(blob)을 만든다 */
    async function buildHwpxBlob() {
        const res = await fetch(TEMPLATE_PATH, { cache: 'no-store' });
        if (!res.ok) throw new Error('한글 템플릿을 불러오지 못했습니다 (' + res.status + ')');
        const tplZip = await JSZip.loadAsync(await res.arrayBuffer());
        const tplFiles = {};
        for (const name of Object.keys(tplZip.files)) {
            if (tplZip.files[name].dir) continue;
            tplFiles[name] = await tplZip.file(name).async(/\.(xml|hpf|rdf|txt)$/.test(name) || name === 'mimetype' ? 'string' : 'uint8array');
        }
        const model = hwpxModel();
        const photos = {};
        for (const key of Object.keys(model.cats)) {
            for (const ph of model.cats[key].photos) {
                const href = photoSrc && photoSrc.hrefById[ph.key];
                if (photos[ph.key] || !href || !photoSrc.picXmlById[ph.key] || !photoSrc.zip.file(href)) continue;
                photos[ph.key] = {
                    picXml: photoSrc.picXmlById[ph.key],
                    bytes: await photoSrc.zip.file(href).async('uint8array'),
                    ext: (href.match(/\.([A-Za-z0-9]+)$/) || [null, 'jpg'])[1]
                };
            }
        }
        const files = hwpxOut.buildFiles(tplFiles, model, photos);

        // 내보내기 전에 구조를 한 번 본다(태그 짝, 표 칸 주소, 목록에 적힌 파일)
        const V = window.BSA && window.BSA.hwpxValidate;
        if (V && typeof V.validateSection === 'function') {
            const rep = V.validateSection(String(files['Contents/section0.xml']));
            const missing = V.checkManifest(String(files['Contents/content.hpf']), Object.keys(files));
            if (!rep.ok || missing.length) {
                throw new Error('만든 한글 파일의 구조가 맞지 않아 저장하지 않았습니다: '
                    + (rep.problems || []).slice(0, 3).map((p) => p.message || p.code).join(' / ') + (missing.length ? ' / 빠진 파일 ' + missing.join(', ') : ''));
            }
        }

        const zip = new JSZip();
        // 한글 파일은 mimetype·version.xml을 맨 앞에 무압축으로 둔다
        ['mimetype', 'version.xml'].forEach((name) => zip.file(name, files[name], { compression: 'STORE' }));
        Object.keys(files).forEach((name) => {
            if (name !== 'mimetype' && name !== 'version.xml') zip.file(name, files[name]);
        });
        Object.keys(zip.files).forEach((name) => { if (zip.files[name].dir) delete zip.files[name]; });
        return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 }, mimeType: 'application/hwp+zip' });
    }

    async function exportHwpx() {
        const note = $('hwpxNote');
        note.className = 'muted';
        note.textContent = '한글 파일을 만드는 중...';
        try {
            const blob = await buildHwpxBlob();
            const name = (state.meta.buildingName || '건축물').replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
                + '_보고서본문요약_' + variantLabel(state.variant) + '_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.hwpx';
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            note.className = 'ok';
            note.textContent = '저장했습니다: ' + name;
        } catch (e) {
            note.className = 'err';
            note.textContent = e.message || String(e);
        }
    }

    /* ───────── 복사 ───────── */

    function copyBlock(id) {
        const body = document.querySelector('#out-' + id + ' .out-body');
        if (!body) return;
        const clone = body.cloneNode(true);
        clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
        // 그림은 클립보드로 넘어가지 않으므로 어느 사진인지 글자로 남긴다
        clone.querySelectorAll('img').forEach((img) => {
            img.replaceWith(document.createTextNode('(' + (img.getAttribute('data-ref') || '사진') + ')'));
        });
        clone.querySelectorAll('table').forEach((t) => {
            t.setAttribute('border', '1');
            t.setAttribute('cellspacing', '0');
            t.setAttribute('cellpadding', '4');
            t.setAttribute('style', 'border-collapse:collapse;');
        });
        clone.querySelectorAll('td,th').forEach((c) => {
            c.removeAttribute('class');
            c.innerHTML = c.innerHTML.replace(/\n/g, '<br>');
        });
        const html = clone.innerHTML;
        const text = body.innerText;
        const done = () => {
            const el = document.querySelector('[data-copied="' + id + '"]');
            if (el) { el.textContent = '복사했습니다'; setTimeout(() => { el.textContent = ''; }, 1800); }
        };
        if (navigator.clipboard && window.ClipboardItem) {
            navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' })
            })]).then(done).catch(() => fallbackCopy(body, done));
        } else {
            fallbackCopy(body, done);
        }
    }

    function fallbackCopy(node, done) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { document.execCommand('copy'); done(); } catch (e) { /* 직접 선택해 복사 */ }
        sel.removeAllRanges();
    }

    /* ───────── 이벤트 ───────── */

    function setStatus(msg, cls) {
        const el = $('status');
        el.textContent = msg;
        el.className = cls || 'muted';
    }

    function setPrevStatus(msg, cls) {
        const el = $('prevStatus');
        el.textContent = msg;
        el.className = cls || 'muted';
    }

    async function loadBuffer(buffer, fileName) {
        setStatus('읽는 중...', 'muted');
        const parsed = await parseSurveyHwpx(buffer);
        Object.keys(state.photoUrl).forEach((k) => URL.revokeObjectURL(state.photoUrl[k]));
        state.fileName = fileName || '';
        state.photoUrl = parsed.photoUrl;
        photoSrc = parsed.photoSrc;
        state.defects = core.buildDefects(parsed.floors);
        state.byId = {};
        state.defects.forEach((d) => { state.byId[d.id] = d; });

        const guess = guessMeta(fileName);
        const saved = loadSaved(STORE_PREFIX + guess.buildingName);
        const prevLoadedNow = state.prev;
        state.meta = (saved && saved.meta) || guess;
        state.catOverride = (saved && saved.catOverride) || {};
        state.loadLines = (saved && saved.loadLines) || '';
        state.repairNote = (saved && saved.repairNote) || '';
        state.markBlue = saved && saved.markBlue != null ? !!saved.markBlue : true;
        // 이번에 전회차 파일을 먼저 골랐으면 그것을, 아니면 지난번에 읽어 둔 것을 쓴다
        state.prev = prevLoadedNow || (saved && saved.prev) || null;
        applyOverrides();
        // 항목을 고르기 전(의견만 받던 때)의 AI안은 잇지 않는다
        state.ai = (saved && saved.ai && saved.ai.sel) ? saved.ai : null;
        state.vars = (saved && saved.vars) || { A: null, B: null };
        // 작성안을 나누기 전(2026-10-08 오전)에 저장한 내용은 A안으로 잇는다
        if (saved && !saved.vars && saved.sel) {
            state.vars.A = { sel: saved.sel, text: saved.text, custom: saved.custom, opinion: saved.opinion, cellEdit: saved.cellEdit };
        }
        bindVariant((saved && saved.variant) || 'A');

        $('metaName').value = state.meta.buildingName;
        $('metaRound').value = state.meta.roundLabel;
        ['compareCard', 'pickCard', 'outCard'].forEach((id) => $(id).classList.remove('hidden'));
        showPrevStatus();
        renderAll();
        save();
        const bad = state.defects.filter((d) => !d.good).length;
        const floors = new Set(state.defects.map((d) => d.floor)).size;
        setStatus('읽었습니다: ' + floors + '개 층, 조사 ' + state.defects.length + '건 (결함 ' + bad + '건), 사진 '
            + Object.keys(state.photoUrl).length + '장' + (saved ? ' · 이전에 고른 내용을 불러왔습니다' : ''), 'ok');
    }

    $('fileInput').addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        f.arrayBuffer().then((buf) => loadBuffer(buf, f.name)).catch((e) => setStatus(e.message || String(e), 'err'));
    });

    $('prevInput').addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0];
        if (!f) return;
        f.arrayBuffer().then((buf) => loadPrevBuffer(buf, f.name)).catch((e) => setPrevStatus(e.message || String(e), 'err'));
    });

    ['metaName', 'metaRound'].forEach((id) => {
        $(id).addEventListener('change', () => {
            state.meta = { buildingName: $('metaName').value.trim(), roundLabel: $('metaRound').value.trim() };
            save();
            if (state.defects.length) renderOut();
        });
    });

    VARIANTS.forEach((v) => {
        $('tab' + v).addEventListener('click', () => {
            if (state.variant === v || !state.defects.length) return;
            stashVariant();
            bindVariant(v);
            save();
            renderAll();
        });
    });

    $('btnExportHwpx').addEventListener('click', () => { if (state.defects.length) exportHwpx(); });
    $('btnAiOpinion').addEventListener('click', () => { if (state.defects.length) runAi(); });
    // 최종안 항목을 끌어서 위아래 순서 바꾸기(같은 분류 안에서만)
    let dragFrom = null;
    const dragRow = (ev) => {
        const row = ev.target && ev.target.closest ? ev.target.closest('#compareBody .it.drag') : null;
        return row && dragFrom && row.getAttribute('data-cat') === dragFrom.cat ? row : null;
    };
    const clearDropMarks = () => {
        $('compareBody').querySelectorAll('.drop-before, .drop-after, .dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
    };
    $('compareBody').addEventListener('dragstart', (ev) => {
        const row = ev.target && ev.target.closest ? ev.target.closest('.it.drag') : null;
        if (!row) return;
        dragFrom = { cat: row.getAttribute('data-cat'), idx: parseInt(row.getAttribute('data-fidx'), 10) };
        row.classList.add('dragging');
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', String(dragFrom.idx));
    });
    $('compareBody').addEventListener('dragover', (ev) => {
        const row = dragRow(ev);
        if (!row) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        const r = row.getBoundingClientRect();
        const after = ev.clientY > r.top + r.height / 2;
        $('compareBody').querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        row.classList.add(after ? 'drop-after' : 'drop-before');
    });
    $('compareBody').addEventListener('drop', (ev) => {
        const row = dragRow(ev);
        if (!row) return;
        ev.preventDefault();
        const from = dragFrom;
        const target = parseInt(row.getAttribute('data-fidx'), 10);
        const after = row.classList.contains('drop-after');
        dragFrom = null;
        // 끌어온 줄을 빼고 난 뒤의 자리로 바꾼다
        let to = after ? target + 1 : target;
        if (from.idx < to) to -= 1;
        showFinal();
        if (!moveEntry(from.cat, from.idx, to)) { clearDropMarks(); return; }
        save();
        renderAll();
        setAiNote('최종안의 순서를 바꿨습니다. 의견·보수방안과 아래 표도 같은 순서로 바뀝니다.', 'ok');
    });
    $('compareBody').addEventListener('dragend', () => { dragFrom = null; clearDropMarks(); });

    // 비교표: + 담기 / 모두 담기 / − 빼기 / 의견 쓰기. 모두 최종안에 하는 일이라 최종안을 화면에 올린다.
    $('compareBody').addEventListener('click', (ev) => {
        const t = ev.target;
        if (!t.getAttribute || t.tagName !== 'BUTTON') return;
        const catKey = t.getAttribute('data-cat');
        const src = t.getAttribute('data-add') || t.getAttribute('data-add-all');
        const wasFinal = state.variant === 'F';
        let note = '';
        if (t.getAttribute('data-add-all')) {
            const n = src === 'AI' ? aiDefects(catKey).length : (src === 'prev' ? prevLines(catKey).length : snapshotOf(src)[catKey].entries.length);
            const items = [];
            for (let i = 0; i < n; i++) items.push(sourceItem(src, catKey, i));
            showFinal();
            items.forEach((it) => addToFinal(it, catKey));
            note = '최종안에 ' + items.filter(Boolean).length + '건을 담았습니다.';
        } else if (t.getAttribute('data-agg')) {
            const agg = aggregatesNow().filter((a) => a.key === t.getAttribute('data-agg'))[0];
            if (!agg) return;
            showFinal();
            addToFinal({ text: agg.text, d: agg.rep, line: '', repair: '' }, catKey);
            note = '묶은 문구로 최종안에 담았습니다(' + agg.count + '건, 대표 ' + agg.rep.floor + ' #' + agg.rep.no + '). 같은 결함을 낱개로도 담아 두었다면 −로 빼 주세요.';
        } else if (src && t.getAttribute('data-part')) {
            const part = t.getAttribute('data-part');
            const item = sourceItem(src, catKey, parseInt(t.getAttribute('data-idx'), 10));
            showFinal();
            applyPart(item, catKey, part);
            note = '최종안의 ' + (part === 'op' ? '의견 줄' : '보수방안') + '을 바꿨습니다.';
        } else if (src) {
            const item = sourceItem(src, catKey, parseInt(t.getAttribute('data-idx'), 10));
            showFinal();
            addToFinal(item, catKey);
            note = '최종안에 담았습니다.' + (item && !item.d && src === 'prev' && catKey !== 'load' ? ' 금회 조사표에 같은 항목이 없어 전회 문구만 넣었습니다.' : '');
        } else if (t.getAttribute('data-fdel') != null) {
            showFinal();
            removeFromFinal(catKey, parseInt(t.getAttribute('data-fdel'), 10));
            note = '최종안에서 뺐습니다.';
        } else if (t.getAttribute('data-use')) {
            useOpinion(t.getAttribute('data-use'), catKey);
            note = '최종안의 의견을 바꿨습니다.';
        } else {
            return;
        }
        save();
        renderAll();
        setAiNote(note + (wasFinal ? '' : ' 아래 표와 한글 파일도 최종안으로 바뀌었습니다.'), 'ok');
    });
    $('markBlue').addEventListener('change', (ev) => {
        state.markBlue = ev.target.checked;
        save();
        renderOut();
    });

    $('btnReset').addEventListener('click', () => {
        if (!window.confirm('지금 보고 있는 ' + variantLabel(state.variant) + '에서 고른 항목과 고친 문구를 지우고 ' + (isFinal() ? '빈 상태로' : '추천 상태로') + ' 되돌릴까요?\n(다른 작성안과 읽어 둔 전회차 보고서는 그대로 둡니다)')) return;
        state.catOverride = {};
        state.defects.forEach((d) => { d.category = core.classify(d); });
        state.vars[state.variant] = null;
        bindVariant(state.variant);
        save();
        renderAll();
    });

    $('btnAlignPrev').addEventListener('click', () => {
        if (!state.prev) return;
        if (!window.confirm('지금 고른 항목을 지우고, 전회차 보고서의 항목을 기준으로 다시 고를까요?\n(금회 조사표에 없는 전회 항목은 넣지 않습니다)')) return;
        alignToPrev();
        save();
        renderAll();
    });

    $('pickBody').addEventListener('change', (ev) => {
        const t = ev.target;
        if (t.id === 'loadLines') {
            state.loadLines = t.value;
        } else if (t.id === 'repairNote') {
            state.repairNote = t.value.trim();
        } else {
            const act = t.getAttribute('data-act');
            const catKey = t.getAttribute('data-cat');
            const idx = parseInt(t.getAttribute('data-idx') || '-1', 10);
            if (act === 'customText') {
                state.custom[catKey][idx] = t.value.trim();
            } else if (act === 'customOff') {
                state.custom[catKey].splice(idx, 1);
            } else {
                const id = t.getAttribute('data-id');
                const d = id && state.byId[id];
                if (!d) return;
                if (act === 'pick') {
                    const list = state.sel[d.category] || (state.sel[d.category] = []);
                    const at = list.indexOf(id);
                    if (t.checked && at < 0) list.push(id);
                    if (!t.checked && at >= 0) list.splice(at, 1);
                } else if (act === 'text') {
                    const v = t.value.trim();
                    if (!v || v === baseText(d)) delete state.text[id]; else state.text[id] = v;
                } else if (act === 'cat') {
                    const from = state.sel[d.category] || [];
                    const at = from.indexOf(id);
                    if (at >= 0) from.splice(at, 1);
                    d.category = t.value;
                    state.catOverride[id] = t.value;
                    if (at >= 0) (state.sel[d.category] || (state.sel[d.category] = [])).push(id);
                }
            }
        }
        save();
        renderAll();
    });

    $('pickBody').addEventListener('click', (ev) => {
        const t = ev.target;
        const act = t.getAttribute && t.getAttribute('data-act');
        if (t.tagName !== 'BUTTON' || !act) return;
        const catKey = t.getAttribute('data-cat');
        const idx = parseInt(t.getAttribute('data-idx') || '-1', 10);
        let note = '';
        if (act === 'usePrev') note = usePrevItem(catKey, idx);
        else if (act === 'prevText') usePrevText(catKey, idx);
        else if (act === 'prevOpinion') { usePrevOpinion(catKey); note = '전회 의견을 가져왔습니다. 아래 ③ 표에서 확인해 주세요.'; }
        else if (act === 'addCustom') (state.custom[catKey] || (state.custom[catKey] = [])).push('');
        else return;
        save();
        renderAll();
        if (note) setPrevStatus(note, 'ok');
    });

    $('outBody').addEventListener('click', (ev) => {
        const id = ev.target.getAttribute && ev.target.getAttribute('data-copy');
        if (id) copyBlock(id);
    });

    const cellValue = (el) => el.innerText.replace(/ /g, ' ').trim();
    let outDirty = false;

    $('outBody').addEventListener('focusin', (ev) => {
        const t = ev.target;
        if (t.getAttribute && (t.getAttribute('data-edit') || t.getAttribute('data-opinion'))) t._before = cellValue(t);
    });

    // 표 안에서 고친 글자는 칸을 벗어날 때 저장한다. 손대지 않은 칸은 자동 문구로 남겨 둔다.
    // 다른 칸으로 옮겨 가는 중에는 다시 그리지 않는다(옮겨 간 칸이 사라져 입력이 끊긴다).
    $('outBody').addEventListener('focusout', (ev) => {
        const t = ev.target;
        if (!t.getAttribute) return;
        const key = t.getAttribute('data-edit');
        const op = t.getAttribute('data-opinion');
        if (key || op) {
            const val = cellValue(t);
            if (val !== t._before) {
                if (key) state.cellEdit[key] = val;
                else state.opinion[op] = val;
                t.classList.toggle('empty', !val);
                save();
                outDirty = true;
            }
        }
        const next = ev.relatedTarget;
        if (outDirty && !(next && $('outBody').contains(next))) {
            outDirty = false;
            renderOut();
        }
    });

    window.BSA.reportSummaryPage = {
        loadBuffer: loadBuffer, loadPrevBuffer: loadPrevBuffer, alignToPrev: alignToPrev,
        hwpxModel: hwpxModel, buildHwpxBlob: buildHwpxBlob, state: state
    };
})();
