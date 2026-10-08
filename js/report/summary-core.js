/**
 * 보고서 본문 요약 (report-summary.html 전용)
 *
 * 앱이 내보낸 상태조사표(부록)에서 보고서 본문에 반복해서 들어가는 요약을 뽑는다.
 *  - 주요 점검결과(8개 분류, 분류마다 대표 결함)
 *  - 실시결과 요약표 / 부분별 점검결과 / 주요 결함사항 원인 및 보수방안
 *  - 분류별 결함원인 및 책임기술자 의견 초안
 *
 * 화면·파일 입출력은 summary-page.js가 맡고, 여기는 계산만 한다(node 테스트 대상).
 * 본 앱(index.html)은 이 파일을 부르지 않는다.
 *
 * 2026-10-08: 1·2종 10열 조사표만 다룬다.
 */
(function (root) {
    'use strict';

    const CATEGORIES = [
        { key: 'structure', label: '구조체', short: '구조체' },
        { key: 'nonStructure', label: '비구조체', short: '비구조체' },
        { key: 'public', label: '공중이용부위', short: '공중이용부위' },
        { key: 'interior', label: '기타시설(내장재 및 천장재)', short: '내부마감재' },
        { key: 'exterior', label: '기타시설(외장재)', short: '외벽마감재' },
        { key: 'attachment', label: '기타시설(부착물)', short: '기타시설(부착물)' },
        { key: 'aux', label: '부대시설', short: '부대시설' },
        { key: 'load', label: '하중조사', short: '구조변경 및 하중조사' }
    ];

    /** 분류마다 주요 점검결과에 싣는 최대 개수 */
    const MAX_ITEMS = 4;

    /** 구조체 균열은 이 폭(mm) 이상이면 주요 점검결과에 반드시 넣는다 */
    const STRUCT_CRACK_FORCE_MM = 0.5;

    /** 이 폭(mm) 이상은 입력 실수일 수 있어 자동 규칙에 쓰지 않고 확인 목록에 올린다 */
    const WIDTH_SUSPICIOUS_MM = 5;

    function isMarkOn(v) {
        const t = String(v || '').trim();
        return t === '○' || t === 'O' || t === 'o';
    }

    function isFlagOn(v, word) {
        if (isMarkOn(v)) return true;
        const t = String(v || '').replace(/\s+/g, '');
        return t === word + '中' || t === word + '중';
    }

    function isGoodContent(text) {
        return /상태\s*양호/.test(String(text || ''));
    }

    function fmtNum(n) {
        return String(Math.round(n * 100) / 100);
    }

    /**
     * 크기 칸에서 균열폭(mm)을 읽는다.
     *  - "0.3/1.6", "0.3~0.45/6.0" : 폭/길이 → 폭(범위면 큰 값)
     *  - "Cw:0.2~0.32"             : 폭
     *  - "0.2x0.5", "1.0*0.4"      : 면적 → 폭 아님
     */
    function parseSize(raw) {
        const text = String(raw == null ? '' : raw).trim();
        const widths = [];
        if (!text || text === '-') return { maxWidth: null, widths: widths };
        text.split(',').forEach(function (tok) {
            const t = tok.replace(/\(.*?\)/g, '').trim();
            let m = t.match(/^Cw\s*[:：]\s*(\d+(?:\.\d+)?)(?:\s*~\s*(\d+(?:\.\d+)?))?/i);
            if (!m) m = t.match(/^(\d+(?:\.\d+)?)(?:\s*~\s*(\d+(?:\.\d+)?))?\s*\/\s*\d/);
            if (!m) return;
            widths.push(parseFloat(m[1]));
            if (m[2] != null) widths.push(parseFloat(m[2]));
        });
        return { maxWidth: widths.length ? Math.max.apply(null, widths) : null, widths: widths };
    }

    const TYPE_RULES = [
        [/철근\s*노출/, '철근노출'],
        [/재료분리|공극/, '재료분리'],
        [/단면결손/, '단면결손'],
        [/배부름/, '배부름'],
        [/녹|부식/, '녹 발생'],
        [/(뿜칠|내화).*(박락|들뜸)/, '내화피복 박락'],
        [/누수(?!\s*흔적)/, '누수'],
        [/백태/, '백태'],
        [/균열|이격/, '균열'],
        [/누수\s*흔적/, '누수흔적'],
        [/오염/, '오염'],
        [/파손/, '파손'],
        [/들뜸|박락|어긋남/, '들뜸'],
        [/열화/, '열화'],
        [/미시공|미흡|누락|불량/, '시공 미흡']
    ];

    function typeKeyOf(content) {
        const t = String(content || '');
        if (isGoodContent(t)) return '양호';
        for (let i = 0; i < TYPE_RULES.length; i++) {
            if (TYPE_RULES[i][0].test(t)) return TYPE_RULES[i][1];
        }
        return '기타';
    }

    function isOutsideFloor(floor) {
        return /외부/.test(String(floor || ''));
    }

    /**
     * 조사내용 낱말로 8개 분류를 추정한다. 조사표에는 구조/비구조 표시만 있어서 나머지는
     * 낱말로 가른다. 틀릴 수 있으므로 화면에서 항목마다 고칠 수 있게 한다.
     */
    function classify(d) {
        const t = String(d.content || '');
        const outside = isOutsideFloor(d.floor) || /옥상/.test(String(d.floor || ''));
        if (/사면|옹벽|축대|석축|비탈/.test(t)) return 'aux';
        if (/간판|앵커|비가림|캐노피|볼트\s*누락|나사산|실외기|안테나/.test(t)) return 'attachment';
        if (/점검로|난간|환기구|덮개|포장|D\.A|신축이음|추락/.test(t)) return 'public';
        if (/외벽|패널|실링|파라펫/.test(t)) return 'exterior';
        if (outside && /마감재|석재|도장|타일/.test(t)) return 'exterior';
        if (/타일|천장\s*마감|마감재|도배|몰딩/.test(t)) return 'interior';
        return d.structural ? 'structure' : 'nonStructure';
    }

    /**
     * @param {Array<{floorLabel: string, rows: string[][], photos?: Object}>} floors
     *   rows: 조사표 데이터 행(머리글 제외), 칸 순서는 번호/위치/조사내용/크기/구조/비구조/진행/누수/원인/비고
     *   photos: { 사진번호: 그림 식별자 }
     */
    function buildDefects(floors) {
        const out = [];
        (floors || []).forEach(function (fl, floorIdx) {
            (fl.rows || []).forEach(function (cells) {
                const no = String(cells[0] || '').trim();
                if (!/^\d/.test(no)) return;
                const content = String(cells[2] || '').replace(/\s+/g, ' ').replace(/\s*·\s*/g, '·').trim();
                if (!content || content === '-') return;
                const good = isGoodContent(content);
                const size = String(cells[3] || '').trim();
                const remark = String(cells[9] || '').trim();
                const photoNos = [];
                remark.replace(/사진\s*(\d+)/g, function (m, n) { photoNos.push(parseInt(n, 10)); return m; });
                const d = {
                    id: floorIdx + ':' + no,
                    floor: String(fl.floorLabel || '').trim(),
                    floorIdx: floorIdx,
                    no: no,
                    location: String(cells[1] || '').replace(/\s+/g, ' ').trim(),
                    content: content,
                    size: size === '-' ? '' : size,
                    structural: isMarkOn(cells[4]) || !isMarkOn(cells[5]),
                    progress: !good && isFlagOn(cells[6], '진행'),
                    leak: !good && isFlagOn(cells[7], '누수'),
                    cause: (function (c) { c = String(c || '').trim(); return c === '-' ? '' : c; })(cells[8]),
                    remark: remark,
                    photoNos: photoNos,
                    photoIds: photoNos.map(function (n) { return fl.photos ? fl.photos[n] : null; }).filter(Boolean),
                    good: good,
                    width: null,
                    widthSuspicious: false
                };
                d.typeKey = typeKeyOf(content);
                if (!good && /균열|이격/.test(content)) {
                    const w = parseSize(size).maxWidth;
                    if (w != null) {
                        d.width = w;
                        d.widthSuspicious = w >= WIDTH_SUSPICIOUS_MM;
                    }
                }
                d.category = classify(d);
                out.push(d);
            });
        });
        return out;
    }

    function isForced(d) {
        return d.category === 'structure' && !d.good && d.width != null && !d.widthSuspicious
            && d.width >= STRUCT_CRACK_FORCE_MM;
    }

    function scoreOf(d) {
        let s = 0;
        if (d.photoNos.length) s += 3;
        if (d.leak) s += 3;
        if (d.progress) s += 3;
        if (d.category === 'structure' && d.width != null && !d.widthSuspicious) s += Math.min(d.width, 2) * 4;
        // 비구조체는 샘플 보고서가 균열 위주라 균열을 조금 앞세운다
        if (d.category === 'nonStructure' && d.typeKey === '균열') s += 1;
        if (isForced(d)) s += 100;
        return s;
    }

    function byScore(list) {
        return list.map(function (d, i) { return { d: d, i: i, s: scoreOf(d) }; })
            .sort(function (a, b) { return b.s - a.s || a.i - b.i; })
            .map(function (x) { return x.d; });
    }

    /**
     * 분류별 추천 항목. 결함 유형이 겹치지 않게 먼저 고르고 남는 자리는 점수순으로 채운다.
     * 유형을 넓히는 단계는 사진·누수·진행처럼 내세울 근거가 있는 것만 본다(근거 없는 유형이
     * 사진 있는 균열을 밀어내지 않게).
     */
    function pickDefaults(defects) {
        const sel = {};
        CATEGORIES.forEach(function (cat) {
            if (cat.key === 'load') { sel[cat.key] = []; return; }
            const inCat = defects.filter(function (d) { return d.category === cat.key; });
            const bad = byScore(inCat.filter(function (d) { return !d.good; }));
            const good = byScore(inCat.filter(function (d) { return d.good; }));
            const picked = bad.filter(isForced);
            const seenType = {};
            picked.forEach(function (d) { seenType[d.typeKey] = true; });
            bad.forEach(function (d) {
                if (picked.length >= MAX_ITEMS || picked.indexOf(d) >= 0 || seenType[d.typeKey]) return;
                if (scoreOf(d) <= 0) return;
                seenType[d.typeKey] = true;
                picked.push(d);
            });
            bad.forEach(function (d) {
                if (picked.length >= MAX_ITEMS || picked.indexOf(d) >= 0) return;
                picked.push(d);
            });
            // 결함이 적은 분류는 샘플 보고서처럼 '상태양호' 항목으로 채운다
            let goodQuota = 0;
            if (cat.key === 'public') goodQuota = MAX_ITEMS - picked.length;
            else if (cat.key === 'exterior' || cat.key === 'attachment') goodQuota = picked.length < MAX_ITEMS ? 1 : 0;
            else if (!picked.length) goodQuota = 1;
            const seenText = {};
            good.forEach(function (d) {
                if (goodQuota <= 0 || seenText[d.content]) return;
                if (cat.key === 'public' && !d.photoNos.length && picked.length) return;
                seenText[d.content] = true;
                picked.push(d);
                goodQuota--;
            });
            sel[cat.key] = picked.map(function (d) { return d.id; });
        });
        return sel;
    }

    function floorText(floor) {
        const f = String(floor || '').trim();
        return /외부/.test(f) ? '외부' : f;
    }

    /** 주요 점검결과 한 줄. 구조체 균열은 균열폭을 붙인다. */
    function itemText(d) {
        const f = floorText(d.floor);
        let t = d.content;
        if (f && t.indexOf(f) !== 0) t = f + ' ' + t;
        if (d.category === 'structure' && !d.good && d.width != null && !d.widthSuspicious) {
            t += ' (균열폭:' + fmtNum(d.width) + 'mm)';
        }
        return t;
    }

    /** 보수방안 문구(샘플 보고서의 짝). 짝이 없는 유형은 빈칸으로 두어 사람이 적게 한다. */
    function repairOf(category, typeKey) {
        const R = function (s, l) { return { short: s, long: l || s }; };
        if (typeKey === '철근노출' || typeKey === '재료분리') return R('철근 녹 제거 후 방청처리 / 단면복구');
        if (typeKey === '녹 발생') {
            if (category === 'attachment') return R('결함부위 녹 제거 후 방청처리 / 볼트 재시공');
            return R('철골 녹 제거 후 방청페인트 도포 / 내화피복 재시공');
        }
        if (typeKey === '내화피복 박락') return R('내화피복 재시공');
        if (category === 'structure') {
            if (typeKey === '균열') return R('표면처리 및 주입공법', '균열폭에 따라 표면처리공법 또는 주입공법에 의한 균열보수');
            if (typeKey === '누수' || typeKey === '백태' || typeKey === '누수흔적') {
                return R('주입공법 또는 방수층 재시공', '발포 우레탄 주입보수 또는 습식 에폭시 주입보수');
            }
            return R('');
        }
        if (category === 'nonStructure') {
            if (typeKey === '균열') return R('표면처리 외', '균열폭에 따라 표면처리 및 컷팅 후 우레탄 코킹 충진 및 탄성아크릴 실런트 표면처리');
            return R('');
        }
        if (category === 'interior') return R('철거 후 재시공', '결함부위 철거 후 재시공');
        if (category === 'exterior') return typeKey === '열화' ? R('실링재 재시공') : R('철거 후 재시공', '결함부위 철거 후 재시공');
        if (category === 'attachment' && typeKey === '시공 미흡') return R('볼트 재시공');
        return R('');
    }

    function partLabelOf(category, typeKey) {
        if (category === 'structure') return (typeKey === '녹 발생' || typeKey === '내화피복 박락') ? '철골 구조체' : '구조체';
        if (category === 'nonStructure') return '비구조체';
        if (category === 'interior' || category === 'exterior') return '마감재';
        if (category === 'attachment') return '부착물';
        if (category === 'public') return '공중이용부위';
        return '부대시설';
    }

    function mostCommon(list) {
        const cnt = {};
        let best = '';
        list.forEach(function (v) {
            if (!v) return;
            cnt[v] = (cnt[v] || 0) + 1;
            if (!best || cnt[v] > cnt[best]) best = v;
        });
        return best;
    }

    function locationLabel(group) {
        const floors = [];
        group.forEach(function (d) {
            const f = floorText(d.floor);
            if (floors.indexOf(f) < 0) floors.push(f);
        });
        if (floors.length >= 5) return '각 층';
        return floors.length > 1 ? floors[0] + ' 외' : (floors[0] || '');
    }

    /**
     * 분류 + 결함유형으로 묶는다. 대표 항목은 고른 것 우선, 없으면 점수 높은 것.
     * typeOf를 주면 묶는 기준을 바꿀 수 있다(작성안 B는 구조체 균열을 부재별로 나눈다).
     */
    function buildGroups(defects, selectedIds, typeOf) {
        const picked = {};
        (selectedIds || []).forEach(function (id) { picked[id] = true; });
        const groups = [];
        const index = {};
        defects.forEach(function (d) {
            if (d.good) return;
            const type = typeOf ? typeOf(d) : d.typeKey;
            const key = d.category + '|' + type;
            if (index[key] == null) {
                index[key] = groups.length;
                groups.push({ key: key, category: d.category, typeKey: type, baseType: d.typeKey, items: [] });
            }
            groups[index[key]].items.push(d);
        });
        groups.forEach(function (g) {
            const chosen = g.items.filter(function (d) { return picked[d.id]; });
            g.rep = chosen[0] || byScore(g.items)[0];
            g.selected = chosen.length > 0;
            g.location = locationLabel(g.items);
            g.cause = mostCommon(g.items.map(function (d) { return d.cause; }));
            g.repair = repairOf(g.category, g.baseType);
            g.part = partLabelOf(g.category, g.baseType);
        });
        const order = CATEGORIES.map(function (c) { return c.key; });
        return groups.sort(function (a, b) { return order.indexOf(a.category) - order.indexOf(b.category); });
    }

    /** 실시결과 요약표: 같은 분류·같은 조치끼리 한 줄로 합친다. */
    function buildSummaryRows(groups) {
        const rows = [];
        const index = {};
        groups.forEach(function (g) {
            if (!g.repair.long) return;
            const key = g.part + '|' + g.repair.long;
            if (index[key] == null) {
                index[key] = rows.length;
                rows.push({ key: 'sum|' + key, items: [], part: g.part, types: [], repair: g.repair.long });
            }
            const r = rows[index[key]];
            r.items = r.items.concat(g.items);
            if (r.types.indexOf(g.typeKey) < 0) r.types.push(g.typeKey);
        });
        return rows.map(function (r) {
            return {
                key: r.key,
                cells: [locationLabel(r.items), r.part, r.types.join(', '), '․ 보수실시\n(' + r.repair + ')']
            };
        });
    }

    function categoryLabel(key) {
        for (let i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].key === key) return CATEGORIES[i].label;
        return key;
    }

    /** 부분별 점검결과: 구분 / 손상유형 / 점검부위 / 점검결과 / 발생원인 / 비고 */
    function buildPartRows(groups) {
        return groups.map(function (g) {
            return {
                key: 'part|' + g.key,
                cells: [categoryLabel(g.category), g.typeKey, g.location, g.rep.content, g.cause || '-', '-']
            };
        });
    }

    /** 주요 결함사항 원인 및 보수방안: 구분 / 조사내용 / 원인 / 보수방안 / 비고 */
    function buildCauseRows(groups) {
        return groups.map(function (g) {
            return {
                key: 'cause|' + g.key,
                cells: [categoryLabel(g.category), g.rep.content, g.cause || '-', g.repair.short, '-']
            };
        });
    }

    function hasFinalConsonant(word) {
        const m = String(word || '').match(/[가-힣](?=[^가-힣]*$)/);
        if (!m) return false;
        return (m[0].charCodeAt(0) - 0xac00) % 28 !== 0;
    }

    function josaEunNeun(word) {
        return hasFinalConsonant(word) ? '은' : '는';
    }

    /** 분류별 결함원인 및 책임기술자 의견 초안(고른 결함의 원인추정을 문장으로 잇는다) */
    function buildOpinion(catKey, groups, meta) {
        const cat = CATEGORIES.filter(function (c) { return c.key === catKey; })[0];
        const name = (meta && meta.buildingName) || '대상 건축물';
        const round = (meta && meta.roundLabel) ? meta.roundLabel + ' ' : '';
        const lines = ['․ ' + name + '에 대하여 실시한 ' + round + '점검 중 ' + cat.short + '에 대한 점검 결과는 다음과 같다.'];
        const mine = groups.filter(function (g) { return g.category === catKey && g.selected; });
        if (!mine.length) {
            lines.push('- ' + cat.short + ' 상태는 전반적으로 양호한 것으로 조사됨.');
            return lines.join('\n');
        }
        mine.forEach(function (g) {
            const subject = g.rep.content;
            if (g.cause) {
                lines.push('- ' + subject + josaEunNeun(subject) + ' ' + g.cause + ' 등에 의한 결함으로 판단됨.');
            } else {
                lines.push('- ' + subject + josaEunNeun(subject) + ' ');
            }
        });
        return lines.join('\n');
    }

    /** 구조체 균열·이격 가운데 폭 값이 이상해 자동 규칙에서 뺀 것 */
    function listWidthChecks(defects) {
        return defects.filter(function (d) { return d.structural && d.widthSuspicious; });
    }

    /* ───────── 전회차 보고서와 견주기 ───────── */

    /** 전회차 보고서 표의 구분 칸 글자 → 분류. 'repair'는 「기존 결함발생 부위 보수상태」 줄. */
    function prevCategoryOf(label) {
        const t = String(label || '').replace(/\s+/g, '');
        if (/보수상태/.test(t)) return 'repair';
        if (/비구조/.test(t)) return 'nonStructure';
        if (/하중/.test(t)) return 'load';
        if (/구조체/.test(t)) return 'structure';
        if (/공중/.test(t)) return 'public';
        if (/내장|천장/.test(t)) return 'interior';
        if (/외장|외벽/.test(t)) return 'exterior';
        if (/부착/.test(t)) return 'attachment';
        if (/부대/.test(t)) return 'aux';
        return null;
    }

    function stripItemNo(line) {
        return String(line || '').replace(/^\s*\d+\s*[.)]\s*/, '').trim();
    }

    /**
     * 전회차 보고서의 표에서 분류별 주요 점검결과와 책임기술자 의견을 꺼낸다.
     *  - 「구분 | 주요 점검결과」 표(결과표)            → 항목
     *  - 「구분 | 주요 상태조사 결과 | 의견」 표(3.3)  → 의견 (항목은 결과표에 없을 때만)
     * 같은 표가 보고서에 여러 번 실려 있으므로 분류마다 처음 나온 것을 쓴다.
     * @param {Array<{cells: Array<{row: number, col: number, lines: string[]}>}>} tables
     */
    function extractPrev(tables) {
        const out = { items: {}, opinion: {}, repairNote: '' };
        const analysisItems = {};
        const squash = function (lines) { return (lines || []).join('').replace(/\s+/g, ''); };
        (tables || []).forEach(function (tb) {
            const at = function (r, c) {
                for (let i = 0; i < tb.cells.length; i++) if (tb.cells[i].row === r && tb.cells[i].col === c) return tb.cells[i];
                return null;
            };
            const h0 = at(0, 0);
            const h1 = at(0, 1);
            if (!h0 || !h1 || squash(h0.lines) !== '구분') return;
            const kind = squash(h1.lines) === '주요점검결과' ? 'result' : (squash(h1.lines) === '주요상태조사결과' ? 'analysis' : null);
            if (!kind) return;
            tb.cells.forEach(function (c) {
                if (c.row === 0 || c.col !== 0) return;
                const cat = prevCategoryOf(c.lines.join(''));
                if (!cat) return;
                const body = at(c.row, 1);
                const lines = ((body && body.lines) || []).map(stripItemNo).filter(function (l) { return l && l !== '-'; });
                if (cat === 'repair') {
                    if (kind === 'result' && !out.repairNote) out.repairNote = lines.join('\n');
                    return;
                }
                if (kind === 'result') {
                    if (!out.items[cat]) out.items[cat] = lines;
                } else {
                    if (!analysisItems[cat]) analysisItems[cat] = lines;
                    const op = at(c.row, 2);
                    if (op && !out.opinion[cat]) out.opinion[cat] = op.lines.join('\n');
                }
            });
        });
        Object.keys(analysisItems).forEach(function (cat) {
            if (!out.items[cat]) out.items[cat] = analysisItems[cat];
        });
        return out;
    }

    function normExact(s) {
        return String(s || '').replace(/\s+/g, '');
    }

    /** 표기 차이(괄호 안 덧말, 「상부」, 띄어쓰기, 가운뎃점)를 걷어 낸 견주기용 글자 */
    function normLoose(s) {
        return String(s || '').replace(/\([^)]*\)/g, '').replace(/상부|하부/g, '').replace(/및/g, '')
            .replace(/[\s·.,:~\-]/g, '');
    }

    /** 문구 앞의 층(지상3층 → F3, 지하1층 → B1). 「지하층 식당」처럼 번호가 없으면 null. */
    function floorKeyOf(s) {
        const m = String(s || '').match(/^\s*(지상|지하)\s*(\d+)\s*층/);
        return m ? (m[1] === '지하' ? 'B' : 'F') + m[2] : null;
    }

    /**
     * 두 문구가 얼마나 비슷한가 (0~1, 글자 두 개씩 묶어 겹치는 비율).
     * 둘 다 층이 적혀 있는데 층이 다르면 다른 결함이다(「지상1층 슬래브 균열」≠「지상3층 슬래브 균열」).
     */
    function similarity(a, b) {
        const fa = floorKeyOf(a);
        const fb = floorKeyOf(b);
        if (fa && fb && fa !== fb) return 0;
        const x = normLoose(a);
        const y = normLoose(b);
        if (!x || !y) return 0;
        if (x === y) return 1;
        const grams = function (t) {
            const m = {};
            for (let i = 0; i + 2 <= t.length; i++) { const g = t.substr(i, 2); m[g] = (m[g] || 0) + 1; }
            return m;
        };
        const gx = grams(x);
        const gy = grams(y);
        let common = 0;
        Object.keys(gx).forEach(function (g) { if (gy[g]) common += Math.min(gx[g], gy[g]); });
        const total = Math.max(0, x.length - 1) + Math.max(0, y.length - 1);
        return total ? (2 * common) / total : 0;
    }

    /** 이 값 이상이면 같은 결함을 가리키는 문구로 본다 */
    const SAME_ITEM_SIMILARITY = 0.55;

    /**
     * 전회 항목과 금회 항목을 짝짓는다.
     *  cur[i].kind : 'same'(글자까지 같음) | 'changed'(같은 결함인데 문구가 다름) | 'new'(전회에 없음)
     *  prev[i].kind: 'same' | 'changed' | 'missing'(금회에 없음)
     */
    function compareLines(prevLines, curLines) {
        const prev = (prevLines || []).map(function () { return { kind: 'missing', curIdx: -1 }; });
        const cur = (curLines || []).map(function () { return { kind: 'new', prevIdx: -1 }; });
        (curLines || []).forEach(function (c, i) {
            for (let j = 0; j < prev.length; j++) {
                if (prev[j].curIdx < 0 && normExact(prevLines[j]) === normExact(c)) {
                    prev[j] = { kind: 'same', curIdx: i };
                    cur[i] = { kind: 'same', prevIdx: j };
                    return;
                }
            }
        });
        (curLines || []).forEach(function (c, i) {
            if (cur[i].prevIdx >= 0) return;
            let best = -1;
            let bestSim = SAME_ITEM_SIMILARITY;
            for (let j = 0; j < prev.length; j++) {
                if (prev[j].curIdx >= 0) continue;
                const sim = similarity(prevLines[j], c);
                if (sim >= bestSim) { bestSim = sim; best = j; }
            }
            if (best >= 0) {
                prev[best] = { kind: 'changed', curIdx: i };
                cur[i] = { kind: 'changed', prevIdx: best };
            }
        });
        return { prev: prev, cur: cur };
    }

    /** 전회 항목과 같은 결함으로 보이는 금회 조사 항목(없으면 null). 같은 분류·점수 높은 것을 앞세운다. */
    function findDefectForPrev(prevText, defects, catKey, excludeIds) {
        const skip = {};
        (excludeIds || []).forEach(function (id) { skip[id] = true; });
        let best = null;
        let bestVal = -1;
        (defects || []).forEach(function (d) {
            if (skip[d.id]) return;
            const sim = similarity(prevText, itemText(d));
            if (sim < SAME_ITEM_SIMILARITY) return;
            const val = sim + (d.category === catKey ? 0.05 : 0) + scoreOf(d) / 1000;
            if (val > bestVal) { bestVal = val; best = d; }
        });
        return best;
    }

    const api = {
        prevCategoryOf: prevCategoryOf,
        extractPrev: extractPrev,
        similarity: similarity,
        compareLines: compareLines,
        findDefectForPrev: findDefectForPrev,
        CATEGORIES: CATEGORIES,
        MAX_ITEMS: MAX_ITEMS,
        STRUCT_CRACK_FORCE_MM: STRUCT_CRACK_FORCE_MM,
        parseSize: parseSize,
        typeKeyOf: typeKeyOf,
        classify: classify,
        buildDefects: buildDefects,
        isForced: isForced,
        scoreOf: scoreOf,
        byScore: byScore,
        pickDefaults: pickDefaults,
        itemText: itemText,
        repairOf: repairOf,
        buildGroups: buildGroups,
        buildSummaryRows: buildSummaryRows,
        buildPartRows: buildPartRows,
        buildCauseRows: buildCauseRows,
        buildOpinion: buildOpinion,
        listWidthChecks: listWidthChecks,
        categoryLabel: categoryLabel
    };

    root.BSA = root.BSA || {};
    root.BSA.reportSummary = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
