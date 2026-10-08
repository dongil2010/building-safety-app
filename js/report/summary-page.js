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
        cellEdit: {},
        loadLines: '',
        repairNote: '',
        prev: null,
        markBlue: true,
        meta: { buildingName: '', roundLabel: '' },
        // 작성안: A = 우리 보고서 문구·조사표 원인 그대로 / B = 중요도·원인·보수방안을 따로 판단한 제안
        // sel·text·custom·opinion·cellEdit는 지금 보고 있는 작성안의 것이고, 안마다 따로 보관한다.
        variant: 'A',
        vars: { A: null, B: null }
    };

    const VARIANT_KEYS = ['sel', 'text', 'custom', 'opinion', 'cellEdit'];
    const isB = () => state.variant === 'B';

    /** 지금 화면의 고르기·문구를 그 작성안 보관함에 옮겨 둔다 */
    function stashVariant() {
        const o = {};
        VARIANT_KEYS.forEach((k) => { o[k] = state[k]; });
        state.vars[state.variant] = o;
    }

    /** 작성안을 화면에 올린다. 처음 여는 안이면 그 안의 추천으로 채운다. */
    function bindVariant(v) {
        state.variant = v;
        const o = state.vars[v] || {};
        state.sel = o.sel || (v === 'B' ? alt.pickDefaults(state.defects) : core.pickDefaults(state.defects));
        state.text = o.text || {};
        state.custom = o.custom || {};
        state.opinion = o.opinion || {};
        state.cellEdit = o.cellEdit || {};
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
        const photoUrl = {};
        for (const fl of withRows) {
            for (const no of Object.keys(fl.photos)) {
                const id = fl.photos[no];
                if (photoUrl[id] || !hrefById[id] || !zip.file(hrefById[id])) continue;
                const blob = await zip.file(hrefById[id]).async('blob');
                photoUrl[id] = URL.createObjectURL(blob);
            }
        }
        return { floors: withRows, photoUrl: photoUrl };
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
                repairNote: state.repairNote, prev: state.prev, markBlue: state.markBlue, meta: state.meta
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
        return picked.concat(custom);
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
        return core.buildGroups(state.defects, selectedIds());
    }

    function opinionOf(catKey, groups) {
        if (state.opinion[catKey] != null) return state.opinion[catKey];
        if (catKey === 'load') return '';
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
            caption: e.text.replace(/\s*\(균열폭:[^)]*\)\s*$/, '')
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
    }

    function renderVariantTabs() {
        ['A', 'B'].forEach((v) => $('tab' + v).classList.toggle('on', state.variant === v));
        $('variantNote').textContent = isB()
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
        state.vars = (saved && saved.vars) || { A: null, B: null };
        // 작성안을 나누기 전(2026-10-08 오전)에 저장한 내용은 A안으로 잇는다
        if (saved && !saved.vars && saved.sel) {
            state.vars.A = { sel: saved.sel, text: saved.text, custom: saved.custom, opinion: saved.opinion, cellEdit: saved.cellEdit };
        }
        bindVariant((saved && saved.variant) || 'A');

        $('metaName').value = state.meta.buildingName;
        $('metaRound').value = state.meta.roundLabel;
        ['pickCard', 'outCard'].forEach((id) => $(id).classList.remove('hidden'));
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

    ['A', 'B'].forEach((v) => {
        $('tab' + v).addEventListener('click', () => {
            if (state.variant === v || !state.defects.length) return;
            stashVariant();
            bindVariant(v);
            save();
            renderAll();
        });
    });

    $('markBlue').addEventListener('change', (ev) => {
        state.markBlue = ev.target.checked;
        save();
        renderOut();
    });

    $('btnReset').addEventListener('click', () => {
        if (!window.confirm('지금 보고 있는 ' + state.variant + '안에서 고른 항목과 고친 문구를 지우고 추천 상태로 되돌릴까요?\n(다른 작성안과 읽어 둔 전회차 보고서는 그대로 둡니다)')) return;
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

    window.BSA.reportSummaryPage = { loadBuffer: loadBuffer, loadPrevBuffer: loadPrevBuffer, alignToPrev: alignToPrev, state: state };
})();
