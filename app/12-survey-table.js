// @@app-part 12-survey-table.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- 10. SURVEY TABLE & ALBUM RENDERING ---

    // 상태조사표 컬럼 기본 정의 (화면/PDF/엑셀 공통). size와 crackWidth/crackLength는 상호 배타적으로
    // defectSizeMode에 따라 필터링되어 노출된다.
    const DEFAULT_SURVEY_COLUMNS = [
        { key: 'no', label: '번호' },
        { key: 'location', label: '위치' },
        { key: 'component', label: '부재종류' },
        { key: 'defectType', label: '조사내용' },
        { key: 'size', label: '결함크기' },
        { key: 'category', label: '구조체 여부' },
        { key: 'openingCrack', label: '개구부 결함유무' },
        { key: 'progress', label: '진행여부' },
        { key: 'leak', label: '누수여부' },
        { key: 'cause', label: '원인추정' },
        { key: 'priorityManage', label: '중점관리' },
        { key: 'remark', label: '비고' }
    ];

    // 제3종시설물 상태조사표 컬럼(실제 3종 점검보고서 서식 기준) — 부재종류/조사내용/결함크기를
    // "점검내용" 한 칸으로 합치고, 구조체 여부 하나로 구조/비구조 구분을 대신한다.
    // 진행中·누수中는 화면에서 토글하고, 한글/PDF는 점검내용 끝에 붙여 표기한다.
    const GRADE3_SURVEY_COLUMNS = [
        { key: 'no', label: '번호' },
        { key: 'floorGroup', label: '구분' },
        { key: 'category', label: '구조체 여부' },
        { key: 'inspectionContent', label: '점검내용' },
        { key: 'progress', label: '진행여부' },
        { key: 'leak', label: '누수여부' },
        { key: 'cause', label: '발생원인' },
        { key: 'priorityManage', label: '중점관리' },
        { key: 'remark', label: '비고' }
    ];

    function getSurveyProgressLabel(isGrade3) {
        return isGrade3 ? '진행中' : '진행중';
    }

    function getSurveyLeakLabel(isGrade3) {
        return isGrade3 ? '누수中' : '누수중';
    }

    function appendGrade3ProgressLeakToContent(content, d) {
        const flags = [];
        const base = String(content == null ? '' : content).trim();
        // 여부는 저장된 값(체크)만 따른다. 조사내용 글자에 같은 표기가 이미 있으면 두 번 붙이지 않음
        const hasMarker = (word) => new RegExp(`(^|\\s)${word}\\s*中(?=\\s|$)`).test(base);
        // 2026-11-05 점검내용 마지막 말이 「누수」면 「누수 누수中」이 아니라 「누수 中」(中만 붙임).
        //  가져오기(js/shared/hwpx-import.js)는 끝의 「누수 中」을 누수여부 켬 + 글자 「누수」는 남김으로 읽는다.
        const endsWithLeakWord = /(^|\s)누수$/.test(base);
        let leakTail = false;
        if (d && d.isProgress && !hasMarker('진행')) flags.push('진행中');
        if (d && d.isLeak && !hasMarker('누수')) {
            if (endsWithLeakWord) leakTail = true;
            else flags.push('누수中');
        }
        if (!flags.length && !leakTail) return content;
        const head = leakTail ? `${base} 中` : base;
        if (!head || head === '-') return flags.join(' ');
        return flags.length ? `${head} ${flags.join(' ')}` : head;
    }

    function isGrade3Building(bldg) {
        bldg = bldg || state.currentBuilding;
        if (!bldg) return false;
        const g = String(bldg.facilityGrade || '').replace(/\s+/g, '');
        return g === '제3종시설물' || g.includes('3종');
    }

    // 3종 상태조사표 번호(예: B1-1, 1-3, R-2, O-1)용 층코드→접두사 매핑.
    // 범례: B{n}F→B{n}(지하n층), {n}F→{n}(지상n층), ROOF→R(옥상/옥탑), EXT/EXT_*→O(외부), 부대시설→A
    // (hwpx_priority_compare_grade3.hwpx 범례: O-외부. 2026-11-06 부대시설 층은 외부와 따로 A-1, A-2 …)
    // 2026-10-20 지붕 쪽 층은 서로 다른 층 — 접두사도 겹치지 않게(예전엔 옥상층·옥상지붕층이 둘 다 R,
    // 옥탑층·옥탑1층·옥탑2층·옥탑 지붕층이 모두 RT라 번호(R-1 등)가 두 층에 겹쳤다):
    //   옥상층 R · 옥상지붕층 RR · 지붕층 RF · 옥탑층 PH · 옥탑N층 PH{N} · 옥탑 지붕층 PHR (옥탑N층은 N층이 아님)
    function getGrade3RoofPrefix(raw) {
        const t = String(raw || '').trim();
        if (!t) return '';
        const c = t.toUpperCase();
        if ((t.includes('옥탑') && t.includes('지붕')) || /PH[\s_-]*ROOF|ROOF[\s_-]*PH/.test(c)) return 'PHR';
        const rooftop = t.includes('옥탑') || c.includes('PENTHOUSE')
            || /(^|[^A-Z0-9])PH([^A-Z0-9]|$)/.test(c)
            || /(^|[^A-Z0-9])(?:PH|RF)[\s_-]*[0-9]{1,2}(?![0-9])/.test(c);
        if (rooftop) {
            const n = (typeof window.parseRooftopIndex === 'function') ? window.parseRooftopIndex(t) : null;
            return n ? `PH${n}` : 'PH';
        }
        if (t.includes('옥상') && t.includes('지붕')) return 'RR';
        if (/^지붕\s*층?(?:\s*\(.*\))?$/.test(t)) return 'RF';
        if (t.includes('옥상') || c === 'ROOF' || /(^|[^A-Z0-9])ROOF([^A-Z0-9]|$)/.test(c)) return 'R';
        return '';
    }

    function getGrade3FloorPrefix(floorCode) {
        const raw = String(floorCode || '');
        const c = raw.toUpperCase().trim();
        // 2026-11-06 부대시설 층은 A(외부 O와 따로). 코드가 EXT_… 여도 층 이름이 부대시설이면 A
        let facilityLabel = '';
        try { facilityLabel = (typeof window.getFloorLabelFromCode === 'function') ? String(window.getFloorLabelFromCode(raw) || '') : ''; } catch (_e) { facilityLabel = ''; }
        if (raw.includes('부대') || facilityLabel.includes('부대')) return 'A';
        // 옥상층/옥탑층/옥탑 지붕층은 코드(ROOF/PH/PH_ROOF)뿐 아니라 "옥상층"처럼 직접 입력된 이름도 인식.
        // 코드로 모르면 등록된 층 이름(예: 코드 PH + 이름 「옥탑2층」)으로 본다.
        const byCode = getGrade3RoofPrefix(raw);
        if (byCode) {
            if (byCode !== 'PH') return byCode;
            let label = '';
            try { label = (typeof window.getFloorLabelFromCode === 'function') ? String(window.getFloorLabelFromCode(raw) || '') : ''; } catch (_e) { label = ''; }
            const byLabel = getGrade3RoofPrefix(label.replace(/\s*\([^)]*\)\s*$/, ''));
            return (byLabel && byLabel.indexOf('PH') === 0) ? byLabel : byCode;
        }
        // 외부 판정은 하나로(코드 또는 표시 이름에 외부) — 이름만 「외부-정면」으로 바꾼 2F도 O
        const isExt = (typeof isExteriorFloorCode === 'function') ? isExteriorFloorCode(raw) : (c.startsWith('EXT') || raw.includes('외부'));
        if (isExt) return 'O';
        const bMatch = c.match(/^B(\d+)F$/);
        if (bMatch) return `B${bMatch[1]}`;
        const fMatch = c.match(/^(\d+)F$/);
        if (fMatch) return fMatch[1];
        // 2026-10-28 직접 입력한 층 이름(코드가 B1F·1F 형태가 아닌 것)도 접두사를 만든다 — 예전엔 이름 그대로
        // (「지하층-1」「피트-1」)로 나왔다. 이미 위에서 정해진 것(지상·B{n}F·옥상 계열·외부 O·부대시설 A)은 건드리지 않는다.
        //   지하층·지하(번호 없음) → B1 · 지하N층/지하NF/B N → BN · 피트 → P · 그리드아이언 → G
        // 지하주차장·반지하 같은 이름은 해당 없음(그대로). 코드로 모르면 등록된 층 이름(label)으로 한 번 더 본다.
        const namedPrefix = (text) => {
            const t = String(text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
            if (!t) return '';
            const q = t.replace(/[\s_-]+/g, '');
            const u = q.toUpperCase();
            if (/그리드아이언|GRIDIRON/.test(u)) return 'G';
            if (/피트/.test(q) || /^PIT(?![A-Z])/.test(u)) return 'P';
            if (/주차/.test(q)) return '';
            let m = u.match(/^B(\d{1,2})F?$/) || u.match(/^지하(\d{1,2})(?:층|F)?$/);
            if (m) return `B${parseInt(m[1], 10)}`;
            if (/^지하층?$/.test(q)) return 'B1';
            return '';
        };
        const byName = namedPrefix(raw);
        if (byName) return byName;
        let nameLabel = '';
        try { nameLabel = (typeof window.getFloorLabelFromCode === 'function') ? String(window.getFloorLabelFromCode(raw) || '') : ''; } catch (_e) { nameLabel = ''; }
        const byNameLabel = nameLabel && nameLabel !== raw.trim() ? namedPrefix(nameLabel) : '';
        if (byNameLabel) return byNameLabel;
        // 2026-11-02 층 이름이 「지상N층」·「N층」이면 N — 층 코드가 도면 파일 이름이어도(파일명에서 층을 못 찾아 파일 이름이 층 코드가 된 경우)
        // 번호가 「파일이름-1」이 아니라 「N-1」로 나오게. 층 이름만 바르게 바꿔 두면 된다.
        const groundNo = (text) => {
            const t = String(text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
            const gm = t.match(/^지상\s*(\d{1,3})\s*(?:층|F)?$/i) || t.match(/^(\d{1,3})\s*(?:층|F)$/i);
            return gm ? String(parseInt(gm[1], 10)) : '';
        };
        // 층 코드와 다른 층 이름이 있을 때만(코드 자체가 「지상2층」 같은 예전 방식은 그대로 둔다)
        const byGroundName = nameLabel && nameLabel !== raw.trim() ? groundNo(nameLabel) : '';
        if (byGroundName) return byGroundName;
        // 2026-10-28 어떤 규칙에도 안 걸린 특이한 층(필로티·중2층·직접 입력한 이름 …)은 층 이름 첫 글자의 초성(로마자)으로.
        //   ㄱG ㄴN ㄷD ㄹR ㅁM ㅂB ㅅS ㅈJ ㅊC ㅋK ㅌT ㅍP ㅎH (쌍자음은 평자음), ㅇ은 건너뛰고 다음 글자, 영문은 첫 글자 대문자.
        //   이름에 숫자가 있으면 초성+숫자(중2층 → J2). 지하주차장 → J.
        //   이미 정해진 접두사(숫자층·B·R·RR·RF·PH·PH{N}·PHR·P·G·O)와 겹치는 글자(R·P·G·O·A·B)는 접두사를 만들지 않고
        //   이름 그대로 둔다(예: 필로티·기계실·반지하 — 어떻게 구분할지 정해지기 전까지 보류). 숫자로 시작하는 이름(3층)과
        //   지상N층도 건드리지 않는다. 한 건물에 첫 글자가 같은 특이한 층이 둘 이상이면 접두사가 겹칠 수 있다.
        const oddInitialPrefix = (text) => {
            const t = String(text || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
            if (!t || /^(?:지상\s*)?\d+\s*(?:층|F)?$/i.test(t)) return '';
            const CHO = ['G', 'G', 'N', 'D', 'D', 'R', 'M', 'B', 'B', 'S', 'S', '', 'J', 'J', 'C', 'K', 'T', 'P', 'H'];
            let letter = '';
            for (const ch of t) {
                const cc = ch.charCodeAt(0);
                if (cc >= 0xAC00 && cc <= 0xD7A3) {
                    letter = CHO[Math.floor((cc - 0xAC00) / 588)];
                    if (letter) break;
                    continue;
                }
                if (/[A-Za-z]/.test(ch)) { letter = ch.toUpperCase(); break; }
                if (/[0-9]/.test(ch)) return '';
            }
            if (!letter || 'RPGOAB'.indexOf(letter) >= 0) return '';
            const dm = t.match(/[0-9]+/);
            return dm ? `${letter}${parseInt(dm[0], 10)}` : letter;
        };
        const byOdd = oddInitialPrefix(nameLabel || raw);
        if (byOdd) return byOdd;
        // 2026-11-02 도면 파일 이름 같은 긴 이름(공백·밑줄이 있고 12글자 넘음)은 번호 접두사로 쓰지 않는다 — 층을 알 수 없으니 「?」.
        // (예: 「2025년 하반기 빛고을국악전수관 결함위치도외_003」 → 번호 「?-1」. 도면 수정에서 층 이름을 「지상1층」으로 바꾸면 「1-1」)
        const rawName = String(floorCode || '').trim();
        if (rawName.length > 12 && /[\s_]/.test(rawName)) return '?';
        return floorCode || '';
    }

    /**
     * 2026-10-20 중점관리 비교사진 끝의 「※ 범례」 줄을 표에 실제로 찍힌 번호 접두사로 만든다.
     * 예전엔 양식(칠산타워 표본)의 글자 「B1-지하1층 / 2-지상1층 / 3-지상2층 / O-외부」를 그대로 붙여
     * 지상층 번호가 하나씩 밀려 보였고, 건물에 없는 층까지 나왔다(번호는 1F→1-, 2F→2- 로 찍힌다).
     * items: [{ prefix, label }] (나온 순서). 같은 접두사는 한 번만. 지하 → 지상 → 지붕쪽 → 외부 순.
     */
    function buildGrade3PrefixLegendText(items) {
        const seen = new Map();
        (items || []).forEach((it) => {
            const p = String((it && it.prefix) || '').trim();
            if (!p || seen.has(p)) return;
            let label;
            let m;
            if ((m = p.match(/^B(\d+)$/))) label = `지하${m[1]}층`;
            else if ((m = p.match(/^(\d+)$/))) label = `지상${m[1]}층`;
            else if (p === 'O') label = '외부';
            else if (p === 'A') label = '부대시설';
            else label = String((it && it.label) || p).replace(/\s*\([^)]*\)\s*$/, '').trim() || p;
            seen.set(p, label);
        });
        const rank = (p) => {
            let m;
            if ((m = p.match(/^B(\d+)$/))) return [0, -Number(m[1])];
            if ((m = p.match(/^(\d+)$/))) return [1, Number(m[1])];
            if (p === 'O') return [3, 0];
            if (p === 'A') return [3, 1];
            return [2, 0];
        };
        const keys = Array.from(seen.keys());
        const order = keys.map((p, i) => ({ p, i, r: rank(p) }))
            .sort((a, b) => (a.r[0] - b.r[0]) || (a.r[1] - b.r[1]) || (a.i - b.i));
        if (!order.length) return '';
        return '※ 범례 : ' + order.map((o) => `${o.p}-${seen.get(o.p)}`).join(' / ');
    }
    window.buildGrade3PrefixLegendText = buildGrade3PrefixLegendText;

    // 3종 상태조사표 "구분" 칸에 쓸 층 표시명 — 등록된 floorsList의 라벨을 우선 쓰고,
    // hwpx 내보내기와 동일하게 코드 접미사((B1F) 등)와 숫자 앞 띄어쓰기를 정리한다.
    function isExteriorFloorCode(code) {
        if (typeof window.isExteriorFloorCode === 'function') return window.isExteriorFloorCode(code);
        const c = String(code || '').toUpperCase().trim();
        return c === 'EXT' || c.startsWith('EXT_');
    }

    function getExteriorElevationShortLabel(code) {
        if (typeof window.getExteriorElevationShortLabel === 'function') {
            return window.getExteriorElevationShortLabel(code) || '';
        }
        return '';
    }

    function enrichExteriorLocationForReport(location, floorCode) {
        const dir = getExteriorElevationShortLabel(floorCode);
        const loc = String(location || '').trim();
        if (!dir) return loc;
        if (/(정면|배면|좌측면|우측면|북측|동측|남측|서측)/.test(loc)) return loc || dir;
        let full = '';
        try { full = stripFloorCodeSuffix(window.getFloorLabelFromCode(floorCode) || ''); } catch (_) {}
        if (full && loc.startsWith(full)) {
            const rest = loc.slice(full.length).trim();
            return rest ? (dir + ' ' + rest) : dir;
        }
        if (!loc) return dir;
        return (dir + ' ' + loc).trim();
    }

    function buildCombinedExteriorSurveyDefects(bldgId, exteriorFloorCodes) {
        const combined = [];
        (exteriorFloorCodes || []).forEach((fc) => {
            const key = bldgId + '_' + fc;
            const raw = (state.defects && state.defects[key]) || [];
            raw.forEach((d) => {
                if (!d) return;
                combined.push(Object.assign({}, d, {
                    location: enrichExteriorLocationForReport(d.location, fc),
                    _rawLocation: d.location || '',   // 3종 구분 칸: 적은 상세 위치 그대로 쓰기용
                    _exteriorFloorCode: fc
                }));
            });
        });
        return getSurveyRowsForReport(combined);
    }

    /**
     * 외부 도면 층 코드 목록. bldg(그 건물의 floorsList)를 주면 그 건물의 표시 이름으로 판정한다 —
     * 이름만 바꾼 외부 도면(2F → 「외부-정면」)이 지금 열어 둔 건물이 아닌 다른 동에서도 외부로 잡히게(2026-10-28).
     * bldg가 없으면 예전과 같다(코드 규칙 + 지금 건물의 이름).
     */
    function collectExteriorFloorCodes(availableFloors, bldg) {
        const labels = {};
        const fl = (bldg && Array.isArray(bldg.floorsList)) ? bldg.floorsList : [];
        fl.forEach((f) => { if (f && f.floorCode != null && f.floorLabel) labels[String(f.floorCode)] = String(f.floorLabel); });
        return (availableFloors || []).filter((fc) => {
            const lab = labels[String(fc)];
            if (lab !== undefined && typeof window.isExteriorFloorCode === 'function') return !!window.isExteriorFloorCode(fc, lab);
            return isExteriorFloorCode(fc);
        });
    }

    /**
     * 외부 도면 전체의 결함 사진 한 묶음(2026-10-28) — 상태조사표처럼 외부 도면(EXT·EXT_n·이름만 바꾼 외부)을 합친다.
     * 순서: 결함 번호(본번호·가지번호) 순, 같으면 도면 순서·도면 안 순서 그대로. 사진 번호(사진01…)는 이 순서로 하나씩 이어 붙인다.
     * 사진 데이터는 읽기만 한다. getFloorDefects(fc)는 그 도면의 결함 목록을 돌려준다.
     */
    function buildCombinedExteriorPhotoEntries(bldgId, exteriorFloorCodes, getFloorDefects) {
        const defs = [];
        (exteriorFloorCodes || []).forEach((fc, fIdx) => {
            const raw = (typeof getFloorDefects === 'function'
                ? getFloorDefects(fc)
                : (state.defects && state.defects[bldgId + '_' + fc])) || [];
            raw.forEach((d, dIdx) => {
                if (!d) return;
                const no = parseSurveyDefectNo(d);
                defs.push({ d, floorCode: fc, fIdx, dIdx, main: no.main, suffix: no.suffix });
            });
        });
        defs.sort((a, b) => (a.main - b.main) || (a.suffix - b.suffix) || (a.fIdx - b.fIdx) || (a.dIdx - b.dIdx));
        const out = [];
        defs.forEach((e) => {
            const defectKey = e.d.id || ('idx_' + e.floorCode + '_' + e.dIdx);
            getDefectOutputPhotos(e.d).forEach((src) => {
                out.push({ d: e.d, floorCode: e.floorCode, src, defectKey });
            });
        });
        out.forEach((e, i) => { const n = i + 1; e.label = '사진' + (n < 10 ? '0' + n : n); });
        return out;
    }

    function buildingFloorRecords(bldgId) {
        const id = bldgId || state.currentBuildingId;
        const map = {};
        const bldg = (state.buildings || []).find((b) => b && b.id === id) || state.currentBuilding;
        const floors = (typeof window.getBuildingAvailableFloors === 'function' && bldg)
            ? window.getBuildingAvailableFloors(bldg)
            : ((bldg && bldg.floorsList) || []);
        (floors || []).forEach((f) => {
            const code = f && (f.floorCode || f);
            if (!code) return;
            const label = (f && f.floorLabel) || (typeof window.getFloorLabelFromCode === 'function'
                ? window.getFloorLabelFromCode(code)
                : code);
            map[String(code)] = { floorCode: String(code), floorLabel: String(label || code) };
        });
        const prefix = String(id || '') + '_';
        Object.keys(state.defects || {}).forEach((k) => {
            if (!id || !String(k).startsWith(prefix)) return;
            const code = String(k).slice(prefix.length);
            if (!code || map[code]) return;
            const label = (typeof window.getFloorLabelFromCode === 'function')
                ? (window.getFloorLabelFromCode(code) || code)
                : code;
            map[code] = { floorCode: code, floorLabel: String(label) };
        });
        return Object.keys(map).map((code) => map[code]);
    }

    /** 같은 건물 안에서, 지금 외부 입면과 이름(본관/신관)이 같은 면만 */
    function elevationSiblingFloorCodes(bldgId, floorCode) {
        const fi = window.BSA && window.BSA.floorIdentity;
        const focus = String(floorCode || '');
        if (!fi || typeof fi.groupElevationFloors !== 'function' || !focus) return focus ? [focus] : [];
        return fi.groupElevationFloors(buildingFloorRecords(bldgId), focus);
    }

    function defectNoKey(no) {
        const api = window.BSA && window.BSA.shared && window.BSA.shared.cadUnmarkedPlace;
        if (api && typeof api.normalizeCadNoKey === 'function') return api.normalizeCadNoKey(no);
        return String(no || '').trim();
    }

    function findDefectByNoAcrossFloors(bldgId, floorCodes, noRaw) {
        const api = window.BSA && window.BSA.shared && window.BSA.shared.cadUnmarkedPlace;
        const pool = [];
        (floorCodes || []).forEach((fc) => {
            const list = (state.defects && state.defects[String(bldgId) + '_' + fc]) || [];
            list.forEach((d) => { if (d) pool.push(d); });
        });
        if (api && typeof api.findDefectByNormalizedNo === 'function') {
            return api.findDefectByNormalizedNo(pool, noRaw);
        }
        const raw = String(noRaw || '').trim();
        return pool.find((d) => d && String(d.no || '').trim() === raw) || null;
    }

    /** 같은 외부 묶음에 좌표 있는 핀이 있으면, 같은 번호의 전차 미등록은 지운다 */
    function pruneElevationUnregisteredTwins(bldgId, floorCode) {
        const id = bldgId || state.currentBuildingId;
        if (!id || !floorCode) return 0;
        const codes = elevationSiblingFloorCodes(id, floorCode);
        if (!codes || codes.length < 1) return 0;
        const placed = new Set();
        codes.forEach((fc) => {
            ((state.defects && state.defects[String(id) + '_' + fc]) || []).forEach((d) => {
                if (!d || d.mapUnregistered) return;
                if (d.x === undefined || d.y === undefined) return;
                const key = defectNoKey(d.cadNo || d.groupNo || d.no);
                if (key) placed.add(key);
            });
        });
        if (!placed.size) return 0;
        let removed = 0;
        codes.forEach((fc) => {
            const floorKey = String(id) + '_' + fc;
            const list = state.defects && state.defects[floorKey];
            if (!list) return;
            for (let i = list.length - 1; i >= 0; i--) {
                const d = list[i];
                if (!d || !d.mapUnregistered) continue;
                const key = defectNoKey(d.cadNo || d.groupNo || d.no);
                if (!key || !placed.has(key)) continue;
                if (typeof trackDefectDeletion === 'function') trackDefectDeletion(floorKey, d.id, d);
                list.splice(i, 1);
                removed += 1;
                if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
            }
        });
        return removed;
    }

    /** 현재 건물의 외부 도면 코드 목록(floorsList + defects 키 합집합) */
    function listExteriorFloorCodesForBuilding(bldgId) {
        const id = bldgId || state.currentBuildingId;
        if (!id) return [];
        const codes = new Set();
        const bldg = state.currentBuilding
            || ((state.buildings || []).find((b) => b && b.id === id));
        const floors = (typeof window.getBuildingAvailableFloors === 'function' && bldg)
            ? window.getBuildingAvailableFloors(bldg)
            : ((bldg && bldg.floorsList) || []);
        (floors || []).forEach((f) => {
            const fc = f && (f.floorCode || f);
            if (fc && isExteriorFloorCode(fc)) codes.add(String(fc));
        });
        Object.keys(state.defects || {}).forEach((k) => {
            if (!String(k).startsWith(String(id) + '_')) return;
            const fc = String(k).slice(String(id).length + 1);
            if (isExteriorFloorCode(fc)) codes.add(fc);
        });
        return Array.from(codes);
    }

    /** 외부 조사표용: 모든 외부 도면 마킹을 한 목록으로 (실객체 + _exteriorFloorCode) */
    function getCombinedExteriorDefectsLive(bldgId) {
        const id = bldgId || state.currentBuildingId;
        if (!id) return [];
        const out = [];
        const seen = new Set();
        listExteriorFloorCodesForBuilding(id).forEach((fc) => {
            const key = String(id) + '_' + fc;
            if (state.defects[key] && typeof syncDefectGroupNosForFloor === 'function') {
                try { syncDefectGroupNosForFloor(key); } catch (_e) { /* ignore */ }
            }
            ((state.defects && state.defects[key]) || []).forEach((d) => {
                if (!d || d.id == null) return;
                if (seen.has(d.id)) return;
                seen.add(d.id);
                d._exteriorFloorCode = fc;
                out.push(d);
            });
        });
        return out;
    }

    function getSurveyTableSourceDefects() {
        if (!state.currentBuildingId) return [];
        if (isExteriorFloorCode(state.currentFloor)) {
            return getCombinedExteriorDefectsLive(state.currentBuildingId);
        }
        return getCurrentFloorDefects();
    }

    function findDefectAcrossBuildingFloors(defectId) {
        if (!defectId || !state.currentBuildingId) return null;
        const id = state.currentBuildingId;
        const preferExt = isExteriorFloorCode(state.currentFloor);
        const tryFloor = (fc) => {
            const key = String(id) + '_' + fc;
            const list = (state.defects && state.defects[key]) || [];
            const consolidated = (typeof consolidateDefectGroups === 'function')
                ? consolidateDefectGroups(list)
                : list;
            const hit = consolidated.find((d) =>
                d && (d.id === defectId || (d._groupMemberIds && d._groupMemberIds.indexOf(defectId) !== -1))
            );
            if (hit) return { defect: hit, floorCode: fc, floorKey: key };
            const raw = list.find((d) => d && d.id === defectId);
            if (raw) return { defect: raw, floorCode: fc, floorKey: key };
            return null;
        };
        if (preferExt) {
            const codes = listExteriorFloorCodesForBuilding(id);
            for (let i = 0; i < codes.length; i++) {
                const found = tryFloor(codes[i]);
                if (found) return found;
            }
        }
        const cur = tryFloor(state.currentFloor);
        if (cur) return cur;
        const keys = Object.keys(state.defects || {}).filter((k) => String(k).startsWith(String(id) + '_'));
        for (let i = 0; i < keys.length; i++) {
            const fc = keys[i].slice(String(id).length + 1);
            const found = tryFloor(fc);
            if (found) return found;
        }
        return null;
    }

    function focusDefectAfterFloorReady(defectId, floorCode, attempt) {
        const n = attempt || 0;
        if (state.currentFloor !== floorCode) return;
        const ready = !!state.bgImage || n >= 45;
        if (ready) {
            if (typeof window.focusDefectOnCanvas === 'function') {
                window.focusDefectOnCanvas(defectId, { uncovered: true });
            }
            if (typeof drawCanvas === 'function') drawCanvas();
            if (typeof updateMapSelectionBar === 'function') updateMapSelectionBar({ scrollToSelection: true });
            return;
        }
        setTimeout(() => focusDefectAfterFloorReady(defectId, floorCode, n + 1), 100);
    }

    function getGrade3FloorDisplayLabel(floorCode, bldg) {
        bldg = bldg || state.currentBuilding;
        const f = bldg && (bldg.floorsList || []).find(fl => fl.floorCode === floorCode);
        const raw = f ? f.floorLabel : (typeof window.getFloorLabelFromCode === 'function' ? window.getFloorLabelFromCode(floorCode) : floorCode);
        return stripFloorCodeSuffix(raw).replace(/\s+(?=\d)/g, '');
    }

    // 결함 상세위치(3종): 공란이면 층수만, 입력 있으면 "지상1층 XXX"
    // 2026-09-28: 1·2종은 층을 자동으로 넣지 않음 — 공란, 실 이름을 쓰면 그 값만(행·열은 gridLoc 따로)
    function defectLocationUsesFloor(bldg) {
        return isGrade3Building(bldg);
    }

    function getDefectLocationFloorLabel(floorCode) {
        return getGrade3FloorDisplayLabel(floorCode || state.currentFloor, state.currentBuilding);
    }

    function composeDefectLocation(detailText, floorCode) {
        const detail = String(detailText || '').trim();
        if (!defectLocationUsesFloor()) return detail; // 1·2종: 적은 그대로(없으면 공란)
        const floor = getDefectLocationFloorLabel(floorCode);
        if (!detail) return floor;
        if (detail === floor) return floor;
        if (detail.startsWith(`${floor} `) || detail.startsWith(`${floor}(`)) return detail;
        return `${floor} ${detail}`;
    }

    function extractDefectLocationDetail(fullLocation, floorCode) {
        const floor = getDefectLocationFloorLabel(floorCode);
        const loc = String(fullLocation || '').trim();
        if (!loc) return '';
        // 3종은 비우면 층 이름이 저장되므로 빈칸으로 보여 준다. 1·2종은 층을 채우지 않으니 층(도면) 이름과 같아도
        // 사람이 적은 글이다(2026-10-31 외부 도면에 「건축물 외부」라고 적으면 수정창에서 안 보였다)
        if (loc === floor) return defectLocationUsesFloor() ? '' : loc;
        if (loc.startsWith(`${floor} `)) return loc.slice(floor.length).trim();
        return loc;
    }

    /**
     * 3종 「구분」 칸 (화면 표·한글·엑셀이 모두 getSurveyCellText('floorGroup')을 거친다)
     *  - 상세 위치가 비었으면: 층 이름(외부 입면 묶음이면 그 입면 도면 이름)
     *  - 외부(입면)·부대시설 도면: 상세 위치만(「정면」「좌측면」「배면」「부대시설 정화조」 …) — 2026-10-19 사용자 요청
     *  - 실내 층: 「지상1층 기둥 C1 하부」(층 + 상세 위치). 상세 위치에 이미 층이 적혀 있으면 상세 위치만
     */
    function isGrade3OutsideDrawing(floorCode) {
        if (!floorCode) return false;
        if (isExteriorFloorCode(floorCode)) return true;
        const prefix3 = getGrade3FloorPrefix(floorCode);
        if (prefix3 === 'O' || prefix3 === 'A') return true;
        const label = String(getDefectLocationFloorLabel(floorCode) || '');
        return /부대|외부|입면/.test(label);
    }

    /** 저장된 위치(「지상1층 XXX」)에서 층 이름을 뗀 상세 위치 */
    function grade3LocationDetailOnly(raw, floorCode, label) {
        const loc = String(raw || '').trim();
        if (!loc) return '';
        const prefixes = [getDefectLocationFloorLabel(floorCode), label]
            .map((s) => String(s || '').trim()).filter(Boolean)
            .sort((a, b) => b.length - a.length);
        for (const p of prefixes) {
            if (loc === p) return '';
            if (loc.startsWith(`${p} `)) return loc.slice(p.length).trim();
        }
        return loc;
    }

    function grade3DivisionText(d, ctx, floorLabel) {
        const label = String(floorLabel || '');
        const ownFc = (d && d._exteriorFloorCode) || (ctx && ctx.floorCode) || state.currentFloor;
        const raw = d ? (d._rawLocation !== undefined ? d._rawLocation : d.location) : '';
        const detail = grade3LocationDetailOnly(raw, ownFc, label);
        if (isGrade3OutsideDrawing(ownFc) || isGrade3OutsideDrawing(ctx && ctx.floorCode)) {
            if (detail) return detail;
            const own = (d && d._exteriorFloorCode) ? String(getDefectLocationFloorLabel(d._exteriorFloorCode) || '') : '';
            return own || label;
        }
        if (!detail || detail === label) return label;
        // 상세 위치에 이미 층이 적혀 있으면(「지하1층 기계실」 등) 층을 또 붙이지 않는다
        if (!label || /(지하|지상)\s*\d+\s*층|\d+\s*층|옥상|옥탑|(^|\s)B\d+F?(\s|$)|(^|\s)\d+F(\s|$)/i.test(detail)) return detail;
        return `${label} ${detail}`;
    }

    function getActiveSurveyColumns() {
        const grade3 = isGrade3Building();
        const defaults = grade3 ? GRADE3_SURVEY_COLUMNS : DEFAULT_SURVEY_COLUMNS;
        const cols = ensureSurveyColumnsInitialized();
        const source = (cols && cols.length) ? cols : defaults;
        const mode = state.defectSizeMode || 'combined';
        return source.filter(c => {
            if (c.visible === false) return false;
            if (mode === 'combined' && (c.key === 'crackWidth' || c.key === 'crackLength')) return false;
            if (mode === 'split' && c.key === 'size') return false;
            return true;
        });
    }

    function getSurveyColumnsForModal() {
        const cols = ensureSurveyColumnsInitialized();
        const mode = state.defectSizeMode || 'combined';
        return cols.filter(c => {
            if (mode === 'combined' && (c.key === 'crackWidth' || c.key === 'crackLength')) return false;
            if (mode === 'split' && c.key === 'size') return false;
            return true;
        });
    }

    // 컬럼 키별 표시 텍스트를 계산하는 단일 소스. 화면/PDF/엑셀 3곳이 모두 이 함수를 사용해 값을 동기화한다.
    /**
     * 조사내용(부재 + 결함 내용) 앞에 붙는 부재명. 결함 내용이 이미 「창 상부 벽체 수직균열」처럼 개구부 위치 + 벽체로 시작하면
     * 부재 「벽체」를 또 붙이지 않는다(「벽체 창 상부 벽체 수직균열」 방지). 다른 부재(기둥 등)는 그대로.
     */
    function surveyContentComponentText(d, ctx) {
        const comp = getSurveyCellText('component', d, ctx);
        const t = String(getSurveyCellText('defectType', d, ctx) || '').trim();
        if (String(comp || '').trim() === '벽체' && /^(?:창|문) (?:상부|하부|측면) 벽체(?:\s|,|$)/.test(t)) return '';
        return comp;
    }

    function getSurveyCellText(colKey, d, ctx) {
        ctx = ctx || {};
        const isCrack = d.defectType === '균열';
        const isGood = isGoodDefectType(d.defectType);
        switch (colKey) {
            case 'no': return ctx.gradeNo || ctx.surveyReportNo || (d.no || '').replace(/^NO\.?\s*/i, '');
            case 'floorGroup': return grade3DivisionText(d, ctx, ctx.floorDisplayLabel || ctx.floorCode || state.currentFloor || '');
            case 'inspectionContent': {
                // 부재 + 조사내용 + 크기를 한 줄로 출력 (화면/HWPX/엑셀 공통)
                const headParts = [surveyContentComponentText(d, ctx), getSurveyCellText('defectType', d, ctx)]
                    .map(s => (s || '').trim())
                    .filter(s => s && s !== '-');
                const head = headParts.join(' ');
                const sizeText = (getSurveyCellText('size', d, ctx) || '').trim();
                const hasSize = sizeText && sizeText !== '-';
                if (!head && !hasSize) return '-';
                if (!hasSize) return head;
                if (!head) return sizeText;
                return `${head} ${sizeText}`;
            }
            case 'location':
                if (d.location) return d.location;
                // 1·2종: 비어 있으면 공란(층을 끼워 넣지 않음). 3종은 층+부재(2026-10-30 부재가 비면 「기둥」 대신 층만)
                return defectLocationUsesFloor() ? `${ctx.floorCode || state.currentFloor} ${memberNameOut(d.component) || ''}`.trim() : '';
            // 2026-10-30 안 적은 칸은 빈칸 그대로(예전: 부재 「기둥」, 원인 「건조수축」을 채워 넣음)
            case 'component': return memberNameOut(d.component) || '';
            case 'defectType': return formatOpeningAwareDefectType(d) || '';
            case 'category': return d.category === '구조체' ? '○' : '-';
            case 'openingCrack': return d.isOpeningCrack ? '○' : '-';
            case 'size': {
                if (isGood) return '-';
                // 한글(HWPX) 출력만 단위 붙임(ctx.hwpxUnits) — 화면·PDF·엑셀은 예전 표기
                const pairFmt = ctx.hwpxUnits ? formatCrackMeasurePairHwpx : formatCrackMeasurePair;
                const joinedMeasures = formatDefectSizeMeasuresJoined(d, pairFmt);
                if (joinedMeasures) return joinedMeasures;
                const w = (d.crackWidth !== undefined && d.crackWidth !== null && String(d.crackWidth).trim() !== '') ? String(d.crackWidth).trim() : '';
                const l = (d.crackLength !== undefined && d.crackLength !== null && String(d.crackLength).trim() !== '') ? String(d.crackLength).trim() : '';
                const n = (d.itemCount !== undefined && d.itemCount !== null && String(d.itemCount).trim() !== '') ? String(d.itemCount).trim() : '';
                if (w || l || n) {
                    // 숨김 필드에 "0.15 / 0.20"처럼 여러 폭이 있으면 ", "로 풀어 출력
                    const wParts = String(w).split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);
                    const lParts = String(l).split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);
                    const nParts = String(n).split(/\s*[\/,]\s*/).map(s => s.trim()).filter(Boolean);
                    const maxN = Math.max(wParts.length, lParts.length, nParts.length, 1);
                    if (maxN > 1) {
                        const bits = [];
                        for (let i = 0; i < maxN; i++) {
                            const bit = pairFmt({
                                width: wParts[i] || '',
                                length: lParts[i] || '',
                                count: nParts[i] || '',
                                join: inferMeasureJoin(d, null)
                            });
                            if (bit) bits.push(bit);
                        }
                        if (bits.length) return bits.join(', ');
                    }
                    return pairFmt({ width: w, length: l, count: n, join: inferMeasureJoin(d, null) }) || '-';
                }
                const sizeVal = (d.size != null) ? String(d.size).trim() : '';
                return normalizeEaSpacingInText(sizeVal) || '-';
            }
            case 'crackWidth': {
                if (!isCrack) return '-';
                const widthsJoined = formatDefectCrackWidthsForReport(d);
                if (widthsJoined) return widthsJoined;
                // 균열폭/길이 분리 입력 이전에 자유텍스트(size)로 저장된 구버전 데이터: 값이 사라지지 않도록 그대로 표시
                return d.size || '-';
            }
            case 'crackLength': {
                if (isCrack) return (d.crackLength !== undefined && d.crackLength !== '') ? `${d.crackLength}m` : '-';
                return '-';
            }
            case 'progress': return d.isProgress ? getSurveyProgressLabel(isGrade3Building()) : '-';
            case 'leak': return d.isLeak ? getSurveyLeakLabel(isGrade3Building()) : '-';
            case 'cause': return isGood ? '-' : (d.cause || '');
            case 'priorityManage': return d.isPriorityManage ? '중점관리' : '-';
            case 'remark': return ctx.photoRemark || '-';
            default: return '';
        }
    }

    // 보고서(PDF/HWPX)·화면 상태조사표 행 구성:
    // - "화살표 추가"(같은 번호 박스 + 화살표만 늘림, surveyNumbered:false) → 그룹을 한 행으로 합침
    // - 「번호 부여」/결함표 추가(surveyExtra) → N-1, N-2 … 별도 행
    // 표는 기본 15행, 결함표 추가분이 있으면 최대 17행까지 담고, 가능하면
    // 본번호가 15·30·45…에서 끝나도록 다음 표로 넘긴다.
    const SURVEY_REPORT_ROWS_BASE = 15;
    const SURVEY_REPORT_ROWS_MAX = 17;

    function parseSurveyDefectNo(d) {
        const p = parseDefectNoParts(d);
        const main = p.main === Number.MAX_SAFE_INTEGER ? 0 : p.main;
        const suffix = p.suffix || 1;
        return { main, suffix, extra: suffix >= 2 };
    }

    function getSurveyRowsForReport(defects) {
        const list = defects || [];
        if (list.length) repairLegacyMarkingSuffixGroups(list);
        const result = [];
        const seenMarkingGroups = new Set();
        const seenMainMarking = new Set();

        const sorted = list.slice().sort((a, b) => {
            const pa = parseSurveyDefectNo(a);
            const pb = parseSurveyDefectNo(b);
            if (pa.main !== pb.main) return pa.main - pb.main;
            if (pa.suffix !== pb.suffix) return pa.suffix - pb.suffix;
            return String(a.no || '').localeCompare(String(b.no || ''));
        });

        sorted.forEach((d) => {
            const skipApi = arrowSurveyNumberApi();
            if (skipApi && skipApi.shouldSkipOrphanUnnumberedInSurveyList(d)) return;
            if (d.surveyExtra) {
                result.push(surveyExtraRowFor(list, d));
                return;
            }
            const parts = parseDefectNoParts(d);
            if (parts.suffix > 0 && !d.groupId) {
                if (seenMainMarking.has(parts.main)) return;
            } else if (!d.groupId && parts.main !== Number.MAX_SAFE_INTEGER) {
                seenMainMarking.add(parts.main);
            }
            if (d.groupId) {
                if (seenMarkingGroups.has(d.groupId)) return;
                seenMarkingGroups.add(d.groupId);
                if (parts.main !== Number.MAX_SAFE_INTEGER) seenMainMarking.add(parts.main);
                const members = markingMembersForGroupRow(list, list.filter((m) => m.groupId === d.groupId && !m.surveyExtra));
                if (!members.length) return;
                const extrasInGroup = list.filter((m) => m.groupId === d.groupId && m.surveyExtra);
                const rep = pickDefectGroupRepresentative(members) || members[0];
                const locations = members.map((m) => m.location).filter(Boolean);
                const uniqLoc = [];
                locations.forEach((loc) => {
                    if (uniqLoc.indexOf(loc) === -1) uniqLoc.push(loc);
                });
                const baseNo = rep.groupNo || stripDefectNoSuffix(rep.no) || rep.no;
                const listNo = extrasInGroup.length ? `${getDefectGroupMainNo(rep)}-1` : baseNo;
                result.push({
                    ...rep,
                    no: listNo,
                    location: uniqLoc.length > 0 ? uniqLoc.join(' / ') : rep.location,
                    ...((typeof mergeGroupGridLocProp === 'function') ? mergeGroupGridLocProp(members) : {}),
                    isProgress: members.some((m) => m.isProgress),
                    isLeak: members.some((m) => m.isLeak),
                    isOpeningCrack: members.some((m) => m.isOpeningCrack),
                    isCarriedOver: members.some((m) => m.isCarriedOver),
                    mapUnregistered: members.some((m) => m.mapUnregistered),
                    isPriorityManage: members.some((m) => m.isPriorityManage),
                    isBookmark: members.some((m) => m.isBookmark),
                    _groupMemberIds: members.map((m) => m.id),
                    _groupMembers: members,
                    _groupHasSurveyExtras: extrasInGroup.length > 0,
                    _representative: rep
                });
                return;
            }
            result.push(d);
        });

        return result.sort((a, b) => {
            const pa = parseSurveyDefectNo(a);
            const pb = parseSurveyDefectNo(b);
            if (pa.main !== pb.main) return pa.main - pb.main;
            const aExtra = a.surveyExtra ? 1 : 0;
            const bExtra = b.surveyExtra ? 1 : 0;
            if (aExtra !== bExtra) return aExtra - bExtra;
            if (pa.suffix !== pb.suffix) return pa.suffix - pb.suffix;
            return String(a.no || '').localeCompare(String(b.no || ''));
        });
    }

    function paginateSurveyDefects(list) {
        const BASE = SURVEY_REPORT_ROWS_BASE;
        const MAX = SURVEY_REPORT_ROWS_MAX;
        if (!list || !list.length) return [[]];
        // 마킹번호 순이 아니면 16~30 페이지가 1~15보다 앞에 나올 수 있다.
        list = list.slice().sort((a, b) => {
            const pa = parseSurveyDefectNo(a);
            const pb = parseSurveyDefectNo(b);
            if (pa.main !== pb.main) return pa.main - pb.main;
            if (pa.suffix !== pb.suffix) return pa.suffix - pb.suffix;
            return String(a.no || '').localeCompare(String(b.no || ''), 'ko');
        });
        const pages = [];
        let i = 0;
        let closedMultiple = 0;
        while (i < list.length) {
            const target = closedMultiple + BASE;
            let count = 0;
            for (let k = i; k < list.length; k++) {
                if (parseSurveyDefectNo(list[k]).main > target) break;
                count++;
            }
            if (count === 0) {
                closedMultiple = target;
                continue;
            }
            let take = Math.min(count, MAX);
            // 마지막에 1~2행만 남아 새 쪽으로 넘어가면 그 쪽에 붙인다(최대 17행). 예) 17 → 1쪽, 32 → 15+17
            const rest = list.length - (i + take);
            if (rest > 0 && rest <= MAX - BASE && take + rest <= MAX) take += rest;
            pages.push(list.slice(i, i + take));
            i += take;
            closedMultiple = target;
        }
        return pages;
    }

    const NDT_MEASURE_ROWS_PER_PAGE = 18;

    function paginateNdtReportItems(list, perPage) {
        const n = Math.max(1, perPage || NDT_MEASURE_ROWS_PER_PAGE);
        const src = Array.isArray(list) ? list : [];
        if (!src.length) return [[]];
        const pages = [];
        for (let i = 0; i < src.length; i += n) pages.push(src.slice(i, i + n));
        return pages;
    }

    function formatSurveyReportNo(d, isGrade3, floorCode) {
        let raw = String(d.no || '').replace(/^NO\.?\s*/i, '').trim();
        if (!d.surveyExtra && !d._groupHasSurveyExtras) {
            raw = String(stripDefectNoSuffix(raw)).replace(/^NO\.?\s*/i, '').trim();
        }
        const stripped = raw.replace(/^0+(\d)/, '$1');
        if (isGrade3) return `${getGrade3FloorPrefix(floorCode)}-${stripped || '0'}`;
        return stripped || '-';
    }

    function getSurveyStructMarks(d, isGrade3) {
        const on = isGrade3 ? 'O' : '○';
        // 2026-10-30 개구부 균열은 한글·PDF 상태조사표에서 비구조체로 표시(사용자 요청). 슬래브 개구부는 구조체 그대로
        const isOpeningNonStruct = !!d.isOpeningCrack && !/슬래브/.test(String(d.component || ''));
        const isStruct = d.category === '구조체' && !isOpeningNonStruct;
        return { struct: isStruct ? on : '-', nonstruct: isStruct ? '-' : on };
    }

    /**
     * 2026-11-02 1·2종 한글(HWPX): 부대시설 도면에 상세 위치를 안 적으면 위치 칸이 비어 나왔다 → 「외부」.
     * 적은 위치·행·열이 있으면 쓰지 않는다(호출하는 쪽이 비었을 때만 부름). 화면·PDF·엑셀은 그대로.
     */
    function hwpxAnnexEmptyLocationText(floorCode) {
        return /부대시설/.test(String(getDefectLocationFloorLabel(floorCode) || '')) ? '외부' : '';
    }

    function getReportSurveyRowValues(d, ctx, isGrade3, colCount) {
        ctx = ctx || {};
        const marks = getSurveyStructMarks(d, isGrade3);
        // 한글/PDF 상태조사표: 진행中 / 누수中 — 칸 안에서는 줄바꿈(진행\n中)
        const progress = d.isProgress ? '진행\n中' : '-';
        const leak = d.isLeak ? '누수\n中' : '-';
        const no = formatSurveyReportNo(d, isGrade3, ctx.floorCode);
        if (isGrade3) {
            const content = appendGrade3ProgressLeakToContent(
                getSurveyCellText('inspectionContent', d, ctx),
                d
            );
            if (colCount === 6) {
                return [
                    no,
                    getSurveyCellText('floorGroup', d, ctx),
                    getSurveyCellText('category', d, ctx),
                    content,
                    getSurveyCellText('cause', d, ctx),
                    getSurveyCellText('remark', d, ctx)
                ];
            }
            return [
                no,
                getSurveyCellText('floorGroup', d, ctx),
                marks.struct,
                marks.nonstruct,
                content,
                getSurveyCellText('cause', d, ctx),
                getSurveyCellText('remark', d, ctx)
            ];
        }
        // 행·열(통심) 위치가 있으면 「행·열\n실 이름(상세 위치)」 두 줄, 없으면 예전 그대로
        const gridLocCell = (typeof getDefectGridRoomForReport === 'function') ? getDefectGridRoomForReport(d, ctx.floorCode) : '';
        const loc = gridLocCell || extractDefectLocationDetail(d.location, ctx.floorCode)
            || getSurveyCellText('location', d, { floorCode: ctx.floorCode })
            || (ctx.hwpxUnits ? hwpxAnnexEmptyLocationText(ctx.floorCode) : '');
        const content = [surveyContentComponentText(d), getSurveyCellText('defectType', d)]
            .map(s => (s || '').trim()).filter(s => s && s !== '-').join(' ') || '-';
        return [
            no,
            loc,
            content,
            getSurveyCellText('size', d, ctx.hwpxUnits ? { hwpxUnits: true } : undefined),
            marks.struct,
            marks.nonstruct,
            progress,
            leak,
            getSurveyCellText('cause', d),
            getSurveyCellText('remark', d, ctx)
        ];
    }

    function escapeReportHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * 2026-10-20 PDF 미리보기를 한글(HWPX) 출력과 같게 — 값은 한글 양식(templates/hwpx_survey_template*.hwpx)에서
     * 읽어 온 그대로(HWPUNIT, 1/7200 inch). 한글 출력 코드는 이 값을 쓰지 않는다(한글 출력은 그대로).
     */
    const REPORT_HWPX_LAYOUT = Object.freeze({
        // 쪽: A4(59528×83340), 여백 위 5669·머리말 4331·아래 4252·꼬리말 4252·좌우 8504
        page: Object.freeze({ width: 59528, height: 83340, left: 8504, right: 8504, top: 5669, bottom: 4252, header: 4331, footer: 4252 }),
        titleH: 2640,          // 표 위 「N) 층」 제목 한 줄(12pt 1200 + 줄 간격 1440 — 한글 행 맞춤 STD_RESERVE_H와 같은 값)
        tableMarginV: 280,     // 표 바깥 여백 위·아래 140
        border: Object.freeze({ thin: 0.12, thick: 0.5 }),   // mm
        grade12: Object.freeze({
            cols: Object.freeze([2170, 4695, 8761, 3847, 2489, 2490, 1894, 1894, 10779, 3139]),
            headRows: Object.freeze([1409, 2541]), headH: 3950, rowH: 3809,
            fontPt: 8, lineHeight: 1.3, vertsize: 800
        }),
        grade3: Object.freeze({
            cols: Object.freeze([3169, 4779, 2939, 2939, 12556, 12923, 2813]),
            headRows: Object.freeze([2149, 2149]), headH: 4298, rowH: 3535,
            fontPt: 8, lineHeight: 1.3, vertsize: 850
        }),
        // 위치도 표: 그림 칸 41821×60813 + 캡션 칸 3274(10pt 굵게)
        map: Object.freeze({ width: 41821, imageH: 60813, captionH: 3274, captionPt: 10 })
    });
    const hwpxUnitToMm = (u) => Math.round((Number(u) || 0) * 25.4 / 7200 * 1000) / 1000;

    /** 한글 출력과 같은 층 이름(「지하 1층」→「지하1층」) — 한글 쪽 getFloorLabel과 같은 규칙 */
    function reportHwpxFloorLabel(bldg, floorCode) {
        const fromList = ((bldg && bldg.floorsList) || []).find(f => f.floorCode === floorCode);
        const raw = fromList
            ? fromList.floorLabel
            : (typeof window.getFloorLabelFromCode === 'function' ? window.getFloorLabelFromCode(floorCode, bldg) : floorCode);
        return stripFloorCodeSuffix(raw || floorCode).replace(/\s+(?=\d)/g, '');
    }

    /** 한글 본문 높이(쪽 − 위·아래·머리말·꼬리말) */
    function reportHwpxBodyHeight() {
        const p = REPORT_HWPX_LAYOUT.page;
        return p.height - p.top - p.bottom - p.header - p.footer;
    }

    /**
     * PDF 상태조사표 데이터 행 높이(HWPUNIT) — 한글과 같은 규칙.
     *  3종: 한글 행 맞춤(hwpx-survey-row-fit: 15행 + 1행 여유, 16·17행이면 그 쪽에 맞게 줄임)
     *  1·2종: 양식 행 높이 3809 그대로(한 쪽을 넘으면 PDF는 잘리므로 그 쪽에 맞게 줄임)
     */
    function reportHwpxSurveyRowHeight(isGrade3, rowCount, hasTitle) {
        const L = REPORT_HWPX_LAYOUT;
        const spec = isGrade3 ? L.grade3 : L.grade12;
        const n = Math.max(1, Number(rowCount) || 0);
        const reserveH = hasTitle ? L.titleH : 0;
        const fit = window.BSA && window.BSA.shared && window.BSA.shared.hwpxSurveyRowFit;
        // 2026-10-20 한글과 같게 1·2종도 행 맞춤(15행 + 1행 여유, 16·17행이면 그 쪽에 맞게 줄임, 모든 쪽 같은 기본 높이)
        if (fit && typeof fit.planRows === 'function') {
            return fit.planRows({
                bodyH: reportHwpxBodyHeight(), reserveH, headerH: spec.headH,
                tableMarginV: L.tableMarginV, stdReserveH: fit.STD_RESERVE_H, needs: new Array(n).fill(0)
            }).rowH;
        }
        const area = reportHwpxBodyHeight() - reserveH - spec.headH - L.tableMarginV - 400;
        return Math.min(spec.rowH, Math.floor(area / n));
    }

    /** 한글 칸과 같은 줄나눔(칸 폭 ÷ 글자 폭, 어절·금칙 — js/shared/korean-text-wrap.js) */
    function reportHwpxWrapCell(raw, cellW, vertsize) {
        const charW = Math.max(700, Math.round((vertsize || 800) * 0.95));
        const maxChars = Math.max(4, Math.floor(Math.max(charW, cellW) / charW));
        const prepared = insertHwpxEaCountLineBreaks(String(normalizeEaSpacingInText(raw == null ? '' : raw)).replace(/\r\n|\r/g, '\n'));
        const api = window.BSA && window.BSA.koreanTextWrap;
        if (api && typeof api.wrapHwpxCellText === 'function') {
            const cw = typeof api.defaultCharWidthUnits === 'function' ? api.defaultCharWidthUnits : undefined;
            return api.wrapHwpxCellText(prepared, maxChars, cw);
        }
        return prepared;
    }

    /** 한글 쪽과 같은 크기·여백의 PDF 쪽(머리말·본문·꼬리말) */
    function reportHwpxPageOpen(attrs, headerTitle) {
        const P = REPORT_HWPX_LAYOUT.page;
        const mm = hwpxUnitToMm;
        return `<div class="report-page-block report-page-hwpx"${attrs ? ' ' + attrs : ''} style="background:#ffffff; color:#000000; padding:${mm(P.top)}mm ${mm(P.right)}mm ${mm(P.bottom)}mm ${mm(P.left)}mm; margin-bottom: 2rem; font-family:'굴림', Gulim, 'Malgun Gothic', sans-serif; letter-spacing:0; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width:${mm(P.width)}mm; height:${mm(P.height)}mm; max-height:${mm(P.height)}mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">`
            + `<div class="report-hwpx-header" style="height:${mm(P.header)}mm; flex:0 0 auto; display:flex; align-items:flex-start; justify-content:center; font-size:8pt; color:#000;">${escapeReportHtml(headerTitle || '')}</div>`
            + `<div class="report-hwpx-body" style="height:${mm(reportHwpxBodyHeight())}mm; flex:0 0 auto; overflow:hidden; display:flex; flex-direction:column;">`;
    }
    function reportHwpxPageClose(compName) {
        const P = REPORT_HWPX_LAYOUT.page;
        return `</div><div class="report-hwpx-footer" style="height:${hwpxUnitToMm(P.footer)}mm; flex:0 0 auto; display:flex; align-items:flex-end; justify-content:space-between; font-size:8pt; color:#475569;"><span>점검수행기관: ${escapeReportHtml(compName || '')}</span><span>스마트 건축물 안전점검 시스템</span></div></div>`;
    }

    /** PDF 위치도 — 한글 위치도 표(그림 칸 + 캡션 칸, [도면 N-M])와 같은 크기 */
    function buildReportHwpxMapHtml(drawingDataUrl, captionText, emptyHtml) {
        const M = REPORT_HWPX_LAYOUT.map;
        const mm = hwpxUnitToMm;
        const b = `${REPORT_HWPX_LAYOUT.border.thin}mm solid #000`;
        const img = drawingDataUrl
            ? `<img src="${drawingDataUrl}" style="max-width:100%; max-height:100%; object-fit:contain; display:block; margin:0 auto;">`
            : (emptyHtml || '');
        return `<table class="report-hwpx-map" style="width:${mm(M.width)}mm; table-layout:fixed; border-collapse:collapse; margin:0 auto;"><tbody>`
            + `<tr><td style="height:${mm(M.imageH)}mm; border:${b}; padding:0.5mm; text-align:center; vertical-align:middle;"><div style="width:100%; height:${mm(M.imageH - 282)}mm; display:flex; align-items:center; justify-content:center; overflow:hidden;">${img}</div></td></tr>`
            + `<tr><td style="height:${mm(M.captionH)}mm; border:${b}; padding:0; text-align:center; vertical-align:middle; font-size:${M.captionPt}pt; font-weight:700; line-height:1.6;">${escapeReportHtml(captionText)}</td></tr>`
            + `</tbody></table>`;
    }

    function buildReportSurveyTableHtml(sDefects, cellCtxFactory, isGrade3, layoutOpts) {
        layoutOpts = layoutOpts || {};
        const L = REPORT_HWPX_LAYOUT;
        const spec = isGrade3 ? L.grade3 : L.grade12;
        const mm = hwpxUnitToMm;
        const thin = `${L.border.thin}mm solid #000`;
        const thick = `${L.border.thick}mm solid #000`;
        const dbl = `${L.border.thick * 3}px double #000`;
        const rowH = reportHwpxSurveyRowHeight(isGrade3, (sDefects || []).length, !!layoutOpts.hasTitle);
        const colN = spec.cols.length;
        // 한글 양식 선: 바깥 좌우 없음, 머리 위 굵게·머리 아래 이중선, 안쪽 0.12mm
        const sideCss = (ci, span) => `border-left:${ci === 0 ? 'none' : thin}; border-right:${ci + (span || 1) >= colN ? 'none' : thin};`;
        const cellBase = `padding:0 0.2mm; vertical-align:middle; text-align:center; overflow:hidden; word-break:keep-all; overflow-wrap:anywhere;`;
        const th = (text, ci, o) => {
            o = o || {};
            const span = o.colspan || 1;
            const attrs = `${o.rowspan ? ` rowspan="${o.rowspan}"` : ''}${o.colspan ? ` colspan="${o.colspan}"` : ''}`;
            const top = o.second ? `border-top:${thin};` : `border-top:${thick};`;
            const bottom = (o.rowspan || o.second) ? `border-bottom:${dbl};` : `border-bottom:${thin};`;
            return `<th${attrs} style="${cellBase} ${sideCss(ci, span)} ${top} ${bottom} font-weight:700; white-space:pre-line;">${text}</th>`;
        };
        const td = (text, ci) => `<td style="${cellBase} ${sideCss(ci)} border-top:${thin}; border-bottom:${thin}; white-space:pre-line;">${escapeReportHtml(text)}</td>`;
        const hr = spec.headRows;
        const head = isGrade3
            ? `<tr style="height:${mm(hr[0])}mm;">${th('No.', 0, { rowspan: 2 })}${th('구분', 1, { rowspan: 2 })}${th('부재 분류', 2, { colspan: 2 })}${th('점검내용', 4, { rowspan: 2 })}${th('발생원인', 5, { rowspan: 2 })}${th('비고', 6, { rowspan: 2 })}</tr><tr style="height:${mm(hr[1])}mm;">${th('구조\n부재', 2, { second: true })}${th('비구조부재', 3, { second: true })}</tr>`
            : `<tr style="height:${mm(hr[0])}mm;">${th('구분\n(NO.)', 0, { rowspan: 2 })}${th('위치', 1, { rowspan: 2 })}${th('조사내용', 2, { rowspan: 2 })}${th('크기\n(mm/m)\n(m*m)', 3, { rowspan: 2 })}${th('구조체 여부', 4, { colspan: 2 })}${th('진행\n여부', 6, { rowspan: 2 })}${th('누수\n여부', 7, { rowspan: 2 })}${th('원인추정', 8, { rowspan: 2 })}${th('비고', 9, { rowspan: 2 })}</tr><tr style="height:${mm(hr[1])}mm;">${th('구조\n부재', 4, { second: true })}${th('비구조부재', 5, { second: true })}</tr>`;
        const G = gridLib();
        const body = sDefects.length > 0
            ? sDefects.map((d, dSubIdx) => {
                const ctx = cellCtxFactory(d, dSubIdx);
                const gridCell = !isGrade3 && typeof getDefectGridRoomForReport === 'function'
                    ? getDefectGridRoomForReport(d, ctx.floorCode) : '';
                const vals = getReportSurveyRowValues(d, ctx, isGrade3, colN).map((v, ci) => {
                    const w = spec.cols[ci] || spec.cols[colN - 1];
                    // 1·2종 위치 칸(행·열): 한글과 같이 칸 폭에 맞춰 '/' 뒤에서 줄바꿈 → 다음 줄 실 이름
                    if (ci === 1 && gridCell && v === gridCell && G && typeof G.cellTextUnits === 'function') {
                        const units = G.cellTextUnits({ cellWidth: w, marginLeft: 0, marginRight: 0, fontHeight: spec.vertsize });
                        if (units > 0) return getDefectGridRoomForReport(d, ctx.floorCode, units) || v;
                    }
                    return reportHwpxWrapCell(v, w, spec.vertsize);
                });
                return `<tr style="height:${mm(rowH)}mm;">${vals.map((v, ci) => td(v, ci)).join('')}</tr>`;
            }).join('')
            : `<tr style="height:${mm(L.grade12.rowH)}mm;"><td colspan="${colN}" style="${cellBase} border-top:${thin}; border-bottom:${thin}; color:#a3a3a3;">등록된 결함이 없습니다.</td></tr>`;
        const tableW = spec.cols.reduce((s, w) => s + w, 0);
        const colgroup = `<colgroup>${spec.cols.map((w) => `<col style="width:${mm(w)}mm;">`).join('')}</colgroup>`;
        return `<table class="report-hwpx-survey" style="width:${mm(tableW)}mm; table-layout:fixed; border-collapse:collapse; font-family:'굴림', Gulim, 'Malgun Gothic', sans-serif; font-size:${spec.fontPt}pt; letter-spacing:0; line-height:${spec.lineHeight}; color:#000; text-align:center; margin:${mm(L.tableMarginV / 2)}mm auto; border-bottom:${thick};">${colgroup}<thead>${head}</thead><tbody>${body}</tbody></table>`;
    }

    // 화면(스크린) 상태조사표 한 셀의 스타일 있는 HTML을 만든다 (읽기 전용 표시용)
    function renderScreenSurveyCellHtml(colKey, d, ctx) {
        const text = getSurveyCellText(colKey, d, ctx);
        switch (colKey) {
            case 'no': return `<strong style="color:#2a2a2a; font-size:0.95rem;">${text}</strong>`;
            case 'location': {
                const gl = (typeof getDefectGridLocText === 'function') ? getDefectGridLocText(d) : '';
                return (gl ? `<div class="survey-grid-loc">${escapeSurveyAttr(gl)}</div>` : '') + `<span style="font-weight:700; color:#1e293b;">${text}</span>`;
            }
            case 'component': return `<span style="font-weight:700; color:#1e293b;">${text}</span>`;
            case 'defectType': return `<span style="font-weight:700; color:#1f1f1f;">${text}</span>`;
            case 'inspectionContent': return `<span style="font-weight:700; color:#1e293b; white-space:pre-line;">${text}</span>`;
            case 'category': return `<span style="font-weight:800; font-size:1.15rem; color:${text === '○' ? '#ef4444' : '#a3a3a3'};">${text}</span>`;
            case 'openingCrack': return `<span style="font-weight:800; font-size:1.15rem; color:${text === '○' ? '#0d9488' : '#a3a3a3'};">${text}</span>`;
            case 'size': case 'crackWidth': case 'crackLength': return text;
            case 'progress': return `<span style="font-weight:800; font-size:0.92rem; color:${(text === '진행중' || text === '진행中' || text === '진행 中') ? '#dc2626' : '#a3a3a3'};">${text}</span>`;
            case 'leak': return `<span style="font-weight:800; font-size:0.92rem; color:${(text === '누수중' || text === '누수中' || text === '누수 中') ? '#2a2a2a' : '#a3a3a3'};">${text}</span>`;
            case 'cause': return `<span style="font-weight:700; color:#334155;">🔍 ${text}</span>`;
            case 'priorityManage': return `<span style="font-weight:800; font-size:0.92rem; color:${text === '중점관리' ? (isDefectRepaired(d) ? PRIORITY_REPAIRED_COLOR : getStyleColor('priorityManage')) : '#a3a3a3'};">${text}</span>`;
            case 'remark': return `<span style="font-weight:700; color:${text !== '-' ? '#2563eb' : '#a3a3a3'};">${text}</span>`;
            default: return text;
        }
    }

    function escapeSurveyAttr(val) {
        return String(val == null ? '' : val)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function renderSurveyFlagToggle(defectId, field, isOn, onLabel, extraClass) {
        const cls = 'survey-toggle-btn' + (isOn ? ' is-on' : '') + (extraClass ? ' ' + extraClass : '');
        const text = isOn ? onLabel : '-';
        const safeId = escapeSurveyAttr(defectId);
        const safeField = escapeSurveyAttr(field);
        return `<button type="button" class="${cls}"` +
            ` onclick="event.stopPropagation(); window.toggleSurveyInlineFlag('${safeId}','${safeField}')"` +
            ` onmousedown="event.stopPropagation()">${text}</button>`;
    }

    // 상태조사표 인라인 편집 셀 (타이핑 / 선택)
    function renderInlineSurveyCellHtml(colKey, d, ctx, colMetricsOverride) {
        const id = d.id;
        const stop = 'onclick="event.stopPropagation()" onmousedown="event.stopPropagation()"';
        const colMetrics = (colMetricsOverride || window._surveyColMetrics || {})[colKey] || {};
        const colCh = colMetrics.widthCh || 6;
        const colWrap = !!colMetrics.wrap;

        const textInput = (field, value, placeholder, extraClass, extraAttrs) => {
            const raw = String(value == null ? '' : value);
            const useTextarea = colWrap;
            const displayVal = colWrap ? surveyWrapAtSpace(raw, colCh) : raw;
            const cls = `survey-inline-input${extraClass ? ' ' + extraClass : ''}${useTextarea ? ' survey-inline-textarea survey-inline-multiline' : ''}`;
            const rows = colWrap && surveyCharLen(raw) > colCh ? 2 : 1;
            const common = `${stop}` +
                (extraAttrs ? ` ${extraAttrs}` : '') +
                ` placeholder="${escapeSurveyAttr(placeholder || '')}"` +
                ` onchange="window.updateSurveyInlineField('${id}','${field}',this.value)"` +
                ` oninput="window.resizeSurveyInlineInput(this)"` +
                ` onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.blur();}"`;
            if (useTextarea) {
                return `<textarea rows="${rows}" class="${cls}" ${common}>${escapeSurveyAttr(displayVal)}</textarea>`;
            }
            return `<input type="text" class="${cls}" ${common}` +
                ` value="${escapeSurveyAttr(displayVal)}">`;
        };

        // 결함 크기 칸 = 버튼 → 폭·길이·개수 팝업 (결함 수정창과 같은 편집기, 터치는 키패드)
        const sizeOpenBtn = (display, placeholder, extraClass) =>
            `<button type="button" class="survey-inline-input survey-size-open${extraClass ? ' ' + extraClass : ''}"` +
            ` data-survey-size-open="${escapeSurveyAttr(id)}" data-placeholder="${escapeSurveyAttr(placeholder || '')}"` +
            ` title="눌러서 폭·길이·개수 편집"` +
            ` onclick="event.stopPropagation(); window.openSurveySizeEditor('${id}')" onmousedown="event.stopPropagation()">` +
            `${escapeSurveyAttr(display || '')}</button>`;

        switch (colKey) {
            case 'no':
            case 'floorGroup':
            case 'remark': {
                const roText = renderScreenSurveyCellHtml(colKey, d, ctx);
                const roDisplay = colWrap ? surveyWrapAtSpace(String(roText).replace(/<[^>]+>/g, ''), colCh) : roText;
                return `<span class="survey-cell-readonly${colWrap ? ' survey-inline-multiline' : ''}">${colWrap ? escapeSurveyAttr(roDisplay).replace(/\n/g, '<br>') : roText}</span>`;
            }
            case 'category': {
                const v = d.category || '구조체';
                return `<select class="survey-inline-select survey-inline-category" ${stop}` +
                    ` onchange="window.updateSurveyInlineField('${id}','category',this.value)">` +
                    `<option value="구조체"${v === '구조체' ? ' selected' : ''}>구조체</option>` +
                    `<option value="비구조체"${v === '비구조체' ? ' selected' : ''}>비구조체</option>` +
                    `<option value="마감재"${v === '마감재' ? ' selected' : ''}>마감재</option>` +
                    `</select>`;
            }
            case 'progress':
                return renderSurveyFlagToggle(id, 'progress', !!d.isProgress, getSurveyProgressLabel(isGrade3Building()));
            case 'openingCrack':
                return renderSurveyFlagToggle(id, 'openingCrack', !!d.isOpeningCrack, '개구부', 'survey-toggle-opening');
            case 'leak':
                return renderSurveyFlagToggle(id, 'leak', !!d.isLeak, getSurveyLeakLabel(isGrade3Building()));
            case 'priorityManage':
                return renderSurveyFlagToggle(id, 'priorityManage', !!d.isPriorityManage, '중점관리', 'survey-toggle-priority');
            case 'location': {
                const gl = (typeof getDefectGridLocText === 'function') ? getDefectGridLocText(d) : '';
                return (gl ? `<div class="survey-grid-loc" title="행·열(통심) 위치 — 도면 행·열 선 기준 자동">${escapeSurveyAttr(gl)}</div>` : '') + textInput('location', d.location || '', '위치');
            }
            case 'component':
                return withMemberGbHint(textInput('component', memberNameOut(d.component) || '', '부재종류', memberGbClass(d.component)), d.component);
            case 'defectType':
                return textInput('defectType', d.defectType || '', '조사내용');
            case 'cause':
                return textInput('cause', d.cause || '', '원인');
            case 'size': {
                const isGood = isGoodDefectType(d.defectType);
                if (isGood) return '<span style="color:#a3a3a3;">-</span>';
                const val = getSurveyCellText('size', d, {}) || '';
                const display = val === '-' ? '' : val;
                return sizeOpenBtn(display, '규모');
            }
            case 'crackWidth':
                return (d.defectType === '균열')
                    ? textInput('crackWidth', d.crackWidth != null ? d.crackWidth : '', 'mm', '', 'data-measure-keypad="crackWidth" inputmode="decimal" autocomplete="off"')
                    : '<span style="color:#a3a3a3;">-</span>';
            case 'crackLength':
                return (d.defectType === '균열')
                    ? textInput('crackLength', d.crackLength != null ? d.crackLength : '', 'm', '', 'data-measure-keypad="crackLength" inputmode="decimal" autocomplete="off"')
                    : '<span style="color:#a3a3a3;">-</span>';
            case 'inspectionContent': {
                // 한 줄: 부재 | 조사내용 | 크기
                const sizeDisp = (isGoodDefectType(d.defectType))
                    ? ''
                    : String(getSurveyCellText('size', d, {}) || '').replace(/^-$/, '');
                return `<div class="survey-inline-stack survey-inline-stack-one-line" ${stop}>` +
                    withMemberGbHint(textInput('component', memberNameOut(d.component) || '', '부재', `survey-inline-narrow${memberGbClass(d.component) ? ' ' + memberGbClass(d.component) : ''}`), d.component) +
                    textInput('defectType', d.defectType || '', '조사내용', 'survey-inline-narrow') +
                    sizeOpenBtn(sizeDisp, '크기', 'survey-inline-narrow') +
                    `</div>`;
            }
            default:
                return renderScreenSurveyCellHtml(colKey, d, ctx);
        }
    }

    // 상태조사표 인라인 수정 저장 — 그룹 결함은 동일 필드를 멤버 전체에 반영(위치는 대표만)
    window.toggleSurveyInlineFlag = function(defectId, field) {
        if (window.event) window.event.stopPropagation();
        const located = findDefectAcrossBuildingFloors(defectId);
        const key = located
            ? located.floorKey
            : `${state.currentBuildingId}_${state.currentFloor}`;
        const list = state.defects[key] || [];
        const defect = list.find(d => d.id === defectId);
        if (!defect) return;
        // 2026-09-28 그룹(마킹 추가) 줄은 멤버 중 하나라도 켜져 있으면 「진행중」으로 보인다.
        // 예전엔 누른 결함 하나의 값으로 다음 값을 정해서, 보이는 「진행중」을 눌러도 한 번에 안 꺼졌다.
        const shownRow = (typeof consolidateDefectGroups === 'function')
            ? consolidateDefectGroups(list).find((g) => g.id === defectId
                || (g._groupMemberIds && g._groupMemberIds.indexOf(defectId) !== -1))
            : null;
        const cur = shownRow || defect;
        let next = '0';
        switch (field) {
            case 'progress':
                next = cur.isProgress ? '0' : '1';
                break;
            case 'openingCrack':
                next = cur.isOpeningCrack ? '0' : '1';
                break;
            case 'leak':
                next = cur.isLeak ? '0' : '1';
                break;
            case 'priorityManage':
                next = cur.isPriorityManage ? '0' : '1';
                break;
            default:
                return;
        }
        window.updateSurveyInlineField(defectId, field, next);
    };

    /**
     * 조사표 한 행을 고칠 때 같이 바뀌는 결함 id 목록 (조사표 칸·크기 팝업·결함 수정창 공용).
     * 묶음 마킹(groupId)은 조사표에 한 행이라 모두 같이(위치만 자기만). 결함 통합: X-k 행(원래 마킹)은
     * 자기만 고치고, X-1 행 수정은 X-k 쪽(통합 화살표·결함표 행)에 번지지 않게.
     */
    function crackMeasureSig(d) {
        return JSON.stringify([d.crackMeasures || [], d.crackWidth || '', d.crackLength || '', d.itemCount || '', d.size || '']);
    }

    /** 결함 수정창 저장: 폭·길이·개수·규모가 바뀌었으면 같은 조사표 행(묶음 마킹)의 다른 마킹에도 같은 값 */
    function propagateMeasureEditToSurveyRow(list, defect, sigBefore) {
        if (!defect || !defect.groupId || !Array.isArray(list)) return 0;
        if (sigBefore == null || crackMeasureSig(defect) === sigBefore) return 0;
        const ids = surveyRowEditTargetIds(list, defect.id, 'crackMeasures').filter((id) => id !== defect.id);
        let n = 0;
        ids.forEach((id) => {
            const m = list.find((d) => d && d.id === id);
            if (!m) return;
            const before = crackMeasureSig(m);
            m.crackMeasures = JSON.parse(JSON.stringify(defect.crackMeasures || []));
            m.crackWidth = defect.crackWidth || '';
            m.crackLength = defect.crackLength || '';
            m.itemCount = defect.itemCount || '';
            m.size = defect.size || '';
            if (crackMeasureSig(m) !== before) {
                touchDefectUpdatedAt(m);
                n++;
            }
        });
        return n;
    }

    function surveyRowEditTargetIds(list, defectId, field) {
        const consolidated = consolidateDefectGroups(list).find(d =>
            d.id === defectId || (d._groupMemberIds && d._groupMemberIds.indexOf(defectId) !== -1)
        );
        const memberIds = (consolidated && consolidated._groupMemberIds && consolidated._groupMemberIds.length)
            ? consolidated._groupMemberIds.slice()
            : [defectId];
        const isGroup = memberIds.length > 1;
        let targetIds = (field === 'location' && isGroup) ? [defectId] : memberIds;
        const mergeApiInline = defectMergeApi();
        if (mergeApiInline) {
            const self = list.find((d) => d && d.id === defectId);
            if (self && ((self.surveyExtra && self.mergeSourceId) || mergeApiInline.hasLinkedMergeRow(list, self))) {
                targetIds = [defectId];
            } else {
                targetIds = targetIds.filter((id) => {
                    const m = list.find((d) => d && d.id === id);
                    if (!m) return false;
                    if (m.surveyExtra && m.mergeSourceId && mergeApiInline.findMergeSource(list, m)) return false;
                    return !mergeApiInline.hasLinkedMergeRow(list, m);
                });
                if (!targetIds.length) targetIds = [defectId];
            }
        }
        return targetIds;
    }

    window.updateSurveyInlineField = function(defectId, field, rawValue) {
        if (window.event) window.event.stopPropagation();
        const located = findDefectAcrossBuildingFloors(defectId);
        const key = located
            ? located.floorKey
            : `${state.currentBuildingId}_${state.currentFloor}`;
        const list = state.defects[key] || [];
        const targetIds = surveyRowEditTargetIds(list, defectId, field);
        const value = (rawValue == null) ? '' : String(rawValue).replace(/\s*\n+\s*/g, ' ').trim();

        // 조사표에서 고친 값도 수정 시각을 올려야 동기화에서 이긴다 — 병합은 시각이 같으면 서버를 따른다
        const inlineSig = (d) => JSON.stringify([
            d.category, d.isProgress, d.isOpeningCrack, d.isLeak, d.isPriorityManage, d.location, d.component,
            d.defectType, d.cause, d.size, d.crackWidth, d.crackLength, d.itemCount, d.crackMeasures
        ]);
        targetIds.forEach(id => {
            const defect = list.find(d => d.id === id);
            if (!defect) return;
            const sigBefore = inlineSig(defect);
            switch (field) {
                case 'category':
                    defect.category = value || '구조체';
                    break;
                case 'progress':
                    defect.isProgress = value === '1' || value === '진행중' || value === '진행中' || value === '진행 中' || value === '진행\n中';
                    break;
                case 'openingCrack':
                    defect.isOpeningCrack = value === '1' || value === '개구부' || value === '○';
                    break;
                case 'leak':
                    defect.isLeak = value === '1' || value === '누수중' || value === '누수中' || value === '누수 中' || value === '누수\n中';
                    break;
                case 'priorityManage':
                    defect.isPriorityManage = value === '1' || value === '중점관리';
                    break;
                case 'location':
                    defect.location = value;
                    break;
                case 'component':
                    defect.component = value;
                    break;
                case 'defectType':
                    defect.defectType = value;
                    if (isGoodDefectType(value)) {
                        defect.cause = '';
                        defect.size = '';
                        defect.crackWidth = '';
                        defect.crackLength = '';
                        defect.isProgress = false;
                        defect.isLeak = false;
                    }
                    break;
                case 'cause':
                    defect.cause = value;
                    break;
                case 'size': {
                    const parsed = parseSizeTextToCrackMeasures(value, { defectType: defect.defectType });
                    if (parsed.some((m) => m && m.width && m.length) || parsed.length > 1
                        || (parsed.length === 1 && (parsed[0].count || parsed[0].width))) {
                        applyParsedCrackMeasuresToDefect(defect, parsed, value);
                        break;
                    }
                    // Cw:0.15 / Cw:0.15 -2EA / 0.15/1.5 / 0.15/1.5 -2EA (단일·구형)
                    const cwEa = value.match(/^Cw\s*[:=]\s*([^/\-\s]+)\s*(?:-\s*(\d+)\s*EA)?$/i);
                    if (cwEa) {
                        defect.crackWidth = cwEa[1].trim().replace(/mm$/i, '');
                        defect.crackLength = '';
                        if (cwEa[2]) defect.itemCount = cwEa[2];
                        defect.size = value;
                        defect.crackMeasures = [{
                            width: defect.crackWidth,
                            length: '',
                            count: cwEa[2] || '',
                            join: '/'
                        }];
                        break;
                    }
                    const slashEa = value.match(/^([^/]+)\/([^\-\s]+)\s*(?:-\s*(\d+)\s*EA)?$/);
                    if (slashEa) {
                        defect.crackWidth = slashEa[1].trim().replace(/mm$/i, '');
                        defect.crackLength = slashEa[2].trim().replace(/m$/i, '');
                        if (slashEa[3]) defect.itemCount = slashEa[3];
                        defect.size = value;
                        defect.crackMeasures = [{
                            width: defect.crackWidth,
                            length: defect.crackLength,
                            count: slashEa[3] || '',
                            join: '/'
                        }];
                        break;
                    }
                    defect.size = value;
                    break;
                }
                case 'crackMeasures': {
                    // 조사표 크기 팝업(폭·길이·개수 행, JSON) — 결함 수정창 저장과 같은 모양으로 쓴다
                    let rows = null;
                    try { rows = JSON.parse(value || '[]'); } catch (_e) { rows = null; }
                    if (Array.isArray(rows)) applyCrackMeasuresEditToDefect(defect, rows);
                    break;
                }
                case 'crackWidth':
                    defect.crackWidth = value.replace(/mm$/i, '').trim();
                    break;
                case 'crackLength':
                    defect.crackLength = value.replace(/m$/i, '').trim();
                    break;
                default:
                    break;
            }
            // 2026-11-08 종류를 미장으로 바꿀 때만 구조체→비구조체(대부분 비구조체). 분류를 직접 구조체로 고른 것은 그대로 둔다.
            if (field === 'category' || field === 'defectType') defect.category = (window.bsaPlasterNonStructCategory ? window.bsaPlasterNonStructCategory(defect.category, defect.defectType, { force: field === 'defectType' }) : defect.category);
            if (inlineSig(defect) !== sigBefore) touchDefectUpdatedAt(defect);
            // 행·열: 부재가 바뀌면(거더 ↔ 그 밖) 위치 다시 계산 — 지금 보는 층만(선 데이터가 그 층 것)
            if (field === 'component' && key === `${state.currentBuildingId}_${state.currentFloor}` && typeof applyGridAutoLocationToDefect === 'function') {
                try { applyGridAutoLocationToDefect(defect); } catch (gridErr) { console.warn('[grid-lines] inline', gridErr); }
            }
        });

        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (['location', 'component', 'defectType', 'cause', 'size', 'crackWidth', 'crackLength'].indexOf(field) !== -1) {
            const prevWrap = !!(window._surveyColMetrics && window._surveyColMetrics[field] && window._surveyColMetrics[field].wrap);
            refreshSurveyColumnWidthsFromDom();
            const nextWrap = !!(window._surveyColMetrics && window._surveyColMetrics[field] && window._surveyColMetrics[field].wrap);
            if (prevWrap !== nextWrap) renderSurveyTable();
        }
        // 상태양호로 바꾼 뒤에는 크기/진행/누수 UI를 맞추기 위해 표만 다시 그림
        if (field === 'defectType' && isGoodDefectType(value)) {
            renderSurveyTable();
        } else if (field === 'progress' || field === 'leak' || field === 'priorityManage') {
            renderSurveyTable();
            if (field === 'priorityManage' && typeof renderPhotoAlbum === 'function') renderPhotoAlbum();
        } else if (field === 'crackMeasures') {
            // 크기 칸(버튼) 글자·폭·길이 칸을 새 값으로
            renderSurveyTable();
        }
    };

    // 상태조사표 컬럼·셀 폭: 열별 최소 rem + 내용 글자수. 가로 스크롤 허용.
    const SURVEY_INLINE_WRAP_THRESHOLD = 10;
    const SURVEY_COL_MIN_REM = {
        no: 2.8,
        floorGroup: 3.4,
        location: 9.5,
        component: 7.5,
        defectType: 10.5,
        category: 6.2,
        openingCrack: 5.8,
        size: 6,
        progress: 5.2,
        leak: 5.2,
        cause: 8,
        crackWidth: 5.2,
        crackLength: 5.2,
        priorityManage: 5.8,
        remark: 6.5,
        actions: 10,
        inspectionContent: 12
    };

    const SURVEY_DYNAMIC_COL_KEYS = new Set([
        'location', 'component', 'defectType', 'cause', 'size',
        'crackWidth', 'crackLength', 'inspectionContent'
    ]);

    function surveyCharLen(str) {
        return String(str == null ? '' : str).trim().length;
    }

    function surveyColumnWidthCh(maxLen) {
        const len = Math.max(maxLen, 2);
        if (len <= SURVEY_INLINE_WRAP_THRESHOLD) return len;
        return SURVEY_INLINE_WRAP_THRESHOLD;
    }

    function surveyColumnDisplayRem(colKey, maxLen) {
        const minRem = SURVEY_COL_MIN_REM[colKey] || 5.5;
        if (!SURVEY_DYNAMIC_COL_KEYS.has(colKey)) return minRem;
        const contentRem = maxLen * 0.72 + 2.8;
        return Math.max(minRem, Math.min(contentRem, 28));
    }

    function surveyWrapAtSpace(text, lineLen) {
        const s = String(text || '').trim();
        if (!s || s.length <= lineLen) return s;
        let idx = s.lastIndexOf(' ', lineLen);
        if (idx <= 0) idx = lineLen;
        const line1 = s.slice(0, idx).trimEnd();
        const line2 = s.slice(idx).trimStart();
        return line2 ? `${line1}\n${line2}` : line1;
    }

    function surveyInlineFieldLen(colKey, d, ctx) {
        switch (colKey) {
            case 'location': return surveyCharLen(d.location);
            case 'component': return surveyCharLen(d.component);
            case 'defectType': return surveyCharLen(d.defectType);
            case 'cause': return surveyCharLen(d.cause);
            case 'size': {
                if (isGoodDefectType(d.defectType)) return 0;
                return surveyCharLen(getSurveyCellText('size', d, ctx));
            }
            case 'crackWidth': return d.defectType === '균열' ? surveyCharLen(d.crackWidth) : 0;
            case 'crackLength': return d.defectType === '균열' ? surveyCharLen(d.crackLength) : 0;
            case 'inspectionContent':
                return surveyCharLen(getSurveyCellText('inspectionContent', d, ctx));
            default:
                return surveyCharLen(getSurveyCellText(colKey, d, ctx));
        }
    }

    function computeSurveyColumnMetrics(columns, defects, ctxForDefect) {
        const metrics = {};
        columns.forEach(col => {
            let maxLen = surveyCharLen(getSurveyColumnHeaderLabel(col));
            defects.forEach((d, dIdx) => {
                const ctx = ctxForDefect(d, dIdx);
                maxLen = Math.max(maxLen, surveyInlineFieldLen(col.key, d, ctx));
            });
            const widthCh = surveyColumnWidthCh(maxLen);
            const allowWrap = false;
            metrics[col.key] = {
                maxLen,
                widthCh,
                displayRem: surveyColumnDisplayRem(col.key, maxLen),
                wrap: allowWrap
            };
        });
        metrics.actions = { maxLen: 4, widthCh: 6, displayRem: SURVEY_COL_MIN_REM.actions, wrap: false };
        return metrics;
    }

    function syncSurveyTableColgroup(columns, metrics) {
        const table = document.querySelector('#tab-survey .survey-table');
        if (!table || !metrics) return;
        let cg = table.querySelector('#surveyTableColgroup');
        if (!cg) {
            cg = document.createElement('colgroup');
            cg.id = 'surveyTableColgroup';
            table.insertBefore(cg, table.firstChild);
        }
        const allKeys = columns.map(c => c.key).concat(['actions']);
        cg.innerHTML = allKeys.map(key => {
            const m = metrics[key] || { displayRem: SURVEY_COL_MIN_REM[key] || 5.5 };
            const wRem = m.displayRem || surveyColumnDisplayRem(key, m.maxLen || 4);
            return `<col data-col="${key}" style="width:${wRem}rem">`;
        }).join('');
        table.style.tableLayout = 'fixed';
    }

    function applySurveyColumnMetrics(columns, metrics) {
        const table = document.querySelector('#tab-survey .survey-table');
        if (!table || !metrics) return;
        window._surveyColMetrics = metrics;
        syncSurveyTableColgroup(columns, metrics);
        const allKeys = columns.map(c => c.key).concat(['actions']);
        allKeys.forEach(key => {
            const m = metrics[key];
            if (!m) return;
            const isDynamic = SURVEY_DYNAMIC_COL_KEYS.has(key);
            const displayRem = m.displayRem || surveyColumnDisplayRem(key, m.maxLen || m.widthCh || 4);
            const wStr = `${displayRem}rem`;
            table.querySelectorAll(`[data-col="${key}"]`).forEach(el => {
                el.style.setProperty('--survey-col-min', wStr);
                el.style.setProperty('min-width', wStr, 'important');
                el.style.setProperty('width', wStr, 'important');
                el.style.removeProperty('max-width');
                el.classList.toggle('survey-col-wrap', !!m.wrap);
                el.classList.toggle('survey-col-dynamic', isDynamic);
            });
        });
    }

    window.resizeSurveyInlineInput = function(el) {
        if (!el) return;
        const colKey = el.closest('[data-col]')?.getAttribute('data-col');
        const m = (window._surveyColMetrics || {})[colKey] || {};
        const len = surveyCharLen(el.value);
        const shouldWrap = m.wrap && len > (m.widthCh || SURVEY_INLINE_WRAP_THRESHOLD);
        el.classList.toggle('survey-inline-multiline', shouldWrap);
        if (shouldWrap && el.tagName !== 'TEXTAREA') {
            refreshSurveyColumnWidthsFromDom();
            return;
        }
        if (colKey) refreshSurveyColumnWidthsFromDom();
    };

    function refreshSurveyColumnWidthsFromDom() {
        const table = document.querySelector('#tab-survey .survey-table');
        if (!table) return;
        const columns = getActiveSurveyColumns();
        const metrics = {};
        columns.forEach(col => {
            let maxLen = surveyCharLen(getSurveyColumnHeaderLabel(col));
            table.querySelectorAll(`td[data-col="${col.key}"] .survey-inline-input, td[data-col="${col.key}"] .survey-inline-select, td[data-col="${col.key}"] .survey-toggle-btn`).forEach(el => {
                const v = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : (el.value != null ? el.value : el.textContent);
                maxLen = Math.max(maxLen, surveyCharLen(v));
            });
            table.querySelectorAll(`td[data-col="${col.key}"] .survey-cell-readonly`).forEach(el => {
                maxLen = Math.max(maxLen, surveyCharLen(el.textContent));
            });
            const widthCh = surveyColumnWidthCh(maxLen);
            metrics[col.key] = {
                maxLen,
                widthCh,
                displayRem: surveyColumnDisplayRem(col.key, maxLen),
                wrap: false
            };
        });
        metrics.actions = { maxLen: 4, widthCh: 6, displayRem: SURVEY_COL_MIN_REM.actions, wrap: false };
        applySurveyColumnMetrics(columns, metrics);
    }

    // PDF/엑셀 상태조사표 셀의 인라인 색상/굵기 스타일 (텍스트는 getSurveyCellText로 통일, 테두리/여백은 각 출력물에서 처리)
    function getSurveyCellColorStyle(colKey, d, ctx) {
        const text = getSurveyCellText(colKey, d, ctx);
        switch (colKey) {
            case 'no': return 'font-weight:700; color:#2a2a2a;';
            case 'location': return 'font-weight:700;';
            case 'component': return 'font-weight:700;';
            case 'defectType': return 'font-weight:700; color:#1f1f1f;';
            case 'category': return `font-weight:800; color:${text === '○' ? '#ef4444' : '#a3a3a3'};`;
            case 'progress': return `font-weight:800; color:${(text === '진행중' || text === '진행中' || text === '진행 中') ? '#dc2626' : '#a3a3a3'};`;
            case 'leak': return `font-weight:800; color:${(text === '누수중' || text === '누수中' || text === '누수 中') ? '#2a2a2a' : '#a3a3a3'};`;
            case 'cause': return 'font-weight:700;';
            case 'priorityManage': return `font-weight:800; color:${text === '중점관리' ? (isDefectRepaired(d) ? PRIORITY_REPAIRED_COLOR : getStyleColor('priorityManage')) : '#a3a3a3'};`;
            case 'remark': return `font-weight:700; color:${text !== '-' ? '#2563eb' : '#a3a3a3'};`;
            default: return '';
        }
    }

    function isSurveyPortraitCompact() {
        if (layoutIsPcLike()) return false;
        return window.matchMedia('(max-width: 1024px) and (orientation: portrait)').matches;
    }

    const SURVEY_HEADER_SHORT = {
        no: '번호',
        location: '위치',
        component: '부재',
        defectType: '내용',
        size: '크기',
        category: '구조',
        openingCrack: '개구부',
        progress: '진행',
        leak: '누수',
        cause: '원인',
        priorityManage: '중점',
        remark: '비고',
        floorGroup: '구분',
        inspectionContent: '점검',
        crackWidth: '폭',
        crackLength: '길이'
    };

    const SURVEY_HEADER_TWO_LINE = {
        component: '부재<br>종류',
        defectType: '조사<br>내용',
        size: '결함<br>크기',
        category: '구조체<br>여부',
        openingCrack: '개구부<br>결함유무',
        progress: '진행<br>여부',
        leak: '누수<br>여부',
        priorityManage: '중점<br>관리',
        cause: '원인<br>추정',
        inspectionContent: '점검<br>내용'
    };

    function formatSurveyHeaderHtml(col) {
        if (SURVEY_HEADER_TWO_LINE[col.key]) {
            return SURVEY_HEADER_TWO_LINE[col.key];
        }
        const label = getSurveyColumnHeaderLabel(col).replace(/\s/g, '');
        if (label.length === 4) {
            return `${label.slice(0, 2)}<br>${label.slice(2)}`;
        }
        return getSurveyColumnHeaderLabel(col);
    }

    function getSurveyColumnHeaderLabel(col) {
        if (isSurveyPortraitCompact()) {
            return SURVEY_HEADER_SHORT[col.key] || col.label;
        }
        return col.label;
    }

    function renderSurveyTableHeader() {
        const theadEl = document.getElementById('surveyTableHead');
        if (!theadEl) return;
        const columns = getActiveSurveyColumns();
        theadEl.innerHTML = `<tr>${columns.map(c => `<th data-col="${c.key}"><span class="survey-th-label">${formatSurveyHeaderHtml(c)}</span></th>`).join('')}<th data-col="actions">관리</th></tr>`;
    }

    // 상태조사표 행: 셀에서 바로 수정. 상세 모달은 "상세" 버튼으로 연다.
    window.openSurveyRowEditModal = function(defectId) {
        const located = findDefectAcrossBuildingFloors(defectId);
        const defect = located
            ? ((state.defects[located.floorKey] || []).find((d) => d && d.id === defectId) || located.defect)
            : null;
        if (!defect) return;
        // 상세 수정 전에 해당 외부 도면으로 맞춰 두면 저장·포커스가 어긋나지 않음
        if (located && located.floorCode && located.floorCode !== state.currentFloor
            && isExteriorFloorCode(state.currentFloor) && isExteriorFloorCode(located.floorCode)) {
            if (elements.floorSelect) {
                try { elements.floorSelect.value = located.floorCode; } catch (_e) { /* ignore */ }
            }
            if (typeof applyFloorMapStyleSettings === 'function') {
                applyFloorMapStyleSettings(located.floorCode, state.currentBuildingId);
            }
            if (typeof loadFloorDrawing === 'function') loadFloorDrawing(located.floorCode);
            if (typeof refreshFloorDependentUi === 'function') refreshFloorDependentUi();
        }
        openAddDefectModal(defect.x, defect.y, defect.targetX, defect.targetY, defect, null, { revealMarkingAboveDrawer: true });
    };

    // 동기화·다른 화면 갱신이 조사표 tbody를 통째로 다시 그리면, 입력 중이던 칸이
    // DOM에서 빠져 포커스가 풀리고 키보드(OS·숫자 키패드)가 내려간다.
    // 칸에 포커스가 있는 동안은 그리기를 미루고, 그 칸을 떠난 뒤에 한 번만 그린다.
    let _surveyTableRenderDeferred = false;
    let _surveyTableRenderTimer = null;

    function surveyTableEditFocused() {
        const ae = document.activeElement;
        if (!ae || !ae.closest) return false;
        if (!ae.closest('#surveyTableBody')) return false;
        const tag = ae.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function scheduleDeferredSurveyTableRender() {
        if (_surveyTableRenderTimer) return;
        _surveyTableRenderTimer = setTimeout(() => {
            _surveyTableRenderTimer = null;
            if (!_surveyTableRenderDeferred) return;
            if (surveyTableEditFocused()) return;
            _surveyTableRenderDeferred = false;
            renderSurveyTable();
        }, 120);
    }

    document.addEventListener('focusout', (e) => {
        if (!_surveyTableRenderDeferred) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest('#surveyTableBody')) return;
        scheduleDeferredSurveyTableRender();
    }, true);

    function renderSurveyTable() {
        if (!elements.surveyTableBody) return;
        if (surveyTableEditFocused()) {
            _surveyTableRenderDeferred = true;
            return;
        }
        _surveyTableRenderDeferred = false;
        const floorKey = state.currentBuildingId && state.currentFloor
            ? `${state.currentBuildingId}_${state.currentFloor}`
            : null;
        if (floorKey && state.defects[floorKey]) {
            syncDefectGroupNosForFloor(floorKey);
        }
        const exteriorSurvey = isExteriorFloorCode(state.currentFloor);
        if (exteriorSurvey && state.currentBuildingId) {
            listExteriorFloorCodesForBuilding(state.currentBuildingId).forEach((fc) => {
                const k = `${state.currentBuildingId}_${fc}`;
                if (state.defects[k]) {
                    try { syncDefectGroupNosForFloor(k); } catch (_e) { /* ignore */ }
                }
            });
        }
        const rawDefects = getSurveyTableSourceDefects();
        const defects = getSurveyRowsForReport(rawDefects);
        if (elements.surveyFloorTitle) {
            elements.surveyFloorTitle.textContent = exteriorSurvey ? '외부 전체' : state.currentFloor;
        }

        renderSurveyTableHeader();
        const columns = getActiveSurveyColumns();

        if (defects.length === 0) {
            elements.surveyTableBody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center; padding: 2.5rem; color:#64748b; font-weight:600;">등록된 결함이 없습니다. 도면 점검 탭에서 결함을 마킹해 보세요.</td></tr>`;
            window._surveyColMetrics = {};
            if (typeof window.refreshSurveyBulkRestoreButton === 'function') {
                window.refreshSurveyBulkRestoreButton();
            }
            return;
        }

        // Build sequential photo labels for current floor (사진01, 사진02, 사진03...) — raw(합치기 전) 결함 기준으로
        // 매겨서 사진첩(renderPhotoAlbum)의 번호와 어긋나지 않게 함
        const defectPhotoLabels = {};
        let pCounter = 0;
        rawDefects.forEach((d, dIdx) => {
            const defectKey = d.id || `idx_${dIdx}`;
            defectPhotoLabels[defectKey] = [];
            getDefectOutputPhotos(d).forEach(() => {
                pCounter++;
                const pNumStr = pCounter < 10 ? `0${pCounter}` : `${pCounter}`;
                defectPhotoLabels[defectKey].push(`사진${pNumStr}`);
            });
        });

        const buildRowCtx = (d, dIdx) => {
            const memberIds = (d._groupMemberIds && d._groupMemberIds.length)
                ? d._groupMemberIds
                : [d.id || `idx_${dIdx}`];
            const labels = memberIds.flatMap(mid => defectPhotoLabels[mid] || []);
            const photoRemark = labels.length > 0 ? labels.join(' ') : '-';
            const grade3 = isGrade3Building();
            const rowFloor = d._exteriorFloorCode || state.currentFloor;
            const ctx = {
                floorCode: rowFloor,
                photoRemark,
                surveyReportNo: formatSurveyReportNo(d, grade3, rowFloor)
            };
            if (grade3) {
                ctx.gradeNo = ctx.surveyReportNo;
                ctx.floorDisplayLabel = getGrade3FloorDisplayLabel(rowFloor);
            } else if (exteriorSurvey && rowFloor) {
                ctx.floorDisplayLabel = getGrade3FloorDisplayLabel(rowFloor);
            }
            return ctx;
        };

        const colMetrics = computeSurveyColumnMetrics(columns, defects, buildRowCtx);
        window._surveyColMetrics = colMetrics;

        // 부재·조사내용을 빠뜨린 행을 현장에서 바로 보이게 칠한다(보고서에 빈 줄로 나가는 것 방지).
        // 기준은 checkDataHealth()와 같다 — BSA.dataHealth.isBlankContentDefect.
        // 3종은 부재·조사내용이 「점검내용」 한 칸으로 합쳐져 있어 그 칸을 짚는다.
        const health = window.BSA && window.BSA.dataHealth;
        const blankFieldsOf = (d) => (health && typeof health.blankContentFields === 'function')
            ? health.blankContentFields(d)
            : [];
        const MISSING_CELL_KEYS = { component: ['component', 'inspectionContent'], defectType: ['defectType', 'inspectionContent'] };
        let blankRowCount = 0;

        elements.surveyTableBody.innerHTML = defects.map((d, dIdx) => {
            const ctx = buildRowCtx(d, dIdx);
            const mapHint = d.surveyExtra ? ' (도면 번호는 본번호)' : '';
            const safeId = String(d.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const blankFields = blankFieldsOf(d);
            const missingCols = new Set();
            blankFields.forEach((f) => (MISSING_CELL_KEYS[f] || []).forEach((k) => missingCols.add(k)));
            if (blankFields.length) blankRowCount += 1;
            // 조사: 조사내용(받침 있음) → '이', 부재종류만(받침 없음) → '가'
            const blankTitle = blankFields.length
                ? (blankFields.indexOf('defectType') >= 0
                    ? `${blankFields.length > 1 ? '부재종류·' : ''}조사내용이 비어 있습니다 — `
                    : '부재종류가 비어 있습니다 — ')
                : '';
            // 2026-09-29: 행의 빈 곳을 누르면 도면으로 튀던 것 제거 — 도면 이동은 행 끝 「도면」 버튼만
            // (폰에서 가로로 밀다가·칸을 고치려다 도면으로 넘어갔다. PC도 같은 코드라 같이 적용)
            const rowTitle = blankTitle + (exteriorSurvey
                ? `「도면」 버튼: ${(ctx.floorDisplayLabel || d._exteriorFloorCode || '해당')} 도면으로 이동`
                : '「도면」 버튼: 도면에서 마킹 위치로 이동');
            const rowClass = blankFields.length ? 'survey-row survey-row-blank' : 'survey-row';

            return `
                <tr class="${rowClass}" title="${rowTitle}">
                    ${columns.map(c => `<td data-col="${c.key}"${missingCols.has(c.key) ? ' class="survey-cell-missing"' : ''}>${renderInlineSurveyCellHtml(c.key, d, ctx, colMetrics)}</td>`).join('')}
                    <td data-col="actions" class="survey-row-actions">
                        <button type="button" class="btn btn-sm btn-outline" onclick="event.stopPropagation(); window.openSurveyRowEditModal('${safeId}')" title="상세 모달">상세</button>
                        <button type="button" class="btn btn-sm btn-outline survey-btn-map-view" onclick="event.stopPropagation(); window.viewDefectOnMapFromSurvey('${safeId}')" title="결함위치도에서 마킹 선택${mapHint}"><i class="fa-solid fa-map-location-dot"></i> 도면</button>
                    </td>
                </tr>
            `;
        }).join('');
        applySurveyColumnMetrics(columns, colMetrics);
        if (elements.surveyFloorTitle && blankRowCount > 0) {
            elements.surveyFloorTitle.textContent += ` · 내용 빠진 행 ${blankRowCount}건`;
        }
        if (typeof renderPhotoAlbum === 'function') {
            if (window.BSA?.performance?.deferHeavyWork?.()) {
                window.BSA.performance.runWhenIdle(() => renderPhotoAlbum(), 1200);
            } else {
                renderPhotoAlbum();
            }
        }
        if (state.currentTab === 'tab-stats' && typeof window.renderDefectStatsTab === 'function') {
            window.renderDefectStatsTab();
        }
        if (typeof window.refreshSurveyBulkRestoreButton === 'function') {
            window.refreshSurveyBulkRestoreButton();
        }
    }

    (function bindSurveyPortraitCompactRefresh() {
        const mq = window.matchMedia('(max-width: 1024px) and (orientation: portrait)');
        const refresh = () => {
            if (state.currentTab === 'tab-survey') renderSurveyTable();
        };
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', refresh);
        else if (typeof mq.addListener === 'function') mq.addListener(refresh);
    })();

    // --- 상태조사표 컬럼 설정 모달 ---
    // 종별(1,2종/3종)에 따라 서로 다른 state 슬롯(surveyColumns/surveyColumnsGrade3)을 쓴다 —
    // 전역 컬럼 커스터마이징이 두 서식 사이에서 뒤섞이지 않도록 분리.
    function ensureSurveyColumnsInitialized() {
        const grade3 = isGrade3Building();
        const stateKey = grade3 ? 'surveyColumnsGrade3' : 'surveyColumns';
        const defaults = grade3 ? GRADE3_SURVEY_COLUMNS : DEFAULT_SURVEY_COLUMNS;
        if (!state[stateKey] || !state[stateKey].length) {
            state[stateKey] = defaults.map(c => ({ key: c.key, label: c.label, visible: true }));
        } else {
            state[stateKey].forEach(c => {
                if (c.visible === undefined) c.visible = true;
                if (c.label === '결함번호') c.label = '번호';
                if (c.label === '구조체여부') c.label = '구조체 여부';
                if (c.label === '결함원인추정') c.label = '원인추정';
            });
            // 기존 저장된 컬럼 목록에 개구부 결함유무가 없으면 구조체 여부와 진행여부 사이에 삽입
            if (!grade3 && !state[stateKey].some(c => c.key === 'openingCrack')) {
                const catIdx = state[stateKey].findIndex(c => c.key === 'category');
                const progIdx = state[stateKey].findIndex(c => c.key === 'progress');
                const insertAt = catIdx >= 0 ? catIdx + 1 : (progIdx >= 0 ? progIdx : state[stateKey].length);
                state[stateKey].splice(insertAt, 0, { key: 'openingCrack', label: '개구부 결함유무', visible: true });
            }
            // 3종: 기존 저장 컬럼에 진행/누수가 없으면 점검내용 뒤에 삽입
            if (grade3) {
                const insertFlagCol = (key, label) => {
                    if (state[stateKey].some(c => c.key === key)) return;
                    const contentIdx = state[stateKey].findIndex(c => c.key === 'inspectionContent');
                    const causeIdx = state[stateKey].findIndex(c => c.key === 'cause');
                    const insertAt = contentIdx >= 0
                        ? contentIdx + 1 + (key === 'leak' && state[stateKey].some(c => c.key === 'progress') ? 1 : 0)
                        : (causeIdx >= 0 ? causeIdx : state[stateKey].length);
                    state[stateKey].splice(insertAt, 0, { key, label, visible: true });
                };
                insertFlagCol('progress', '진행여부');
                insertFlagCol('leak', '누수여부');
                if (!state[stateKey].some(c => c.key === 'priorityManage')) {
                    const causeIdx = state[stateKey].findIndex(c => c.key === 'cause');
                    const remarkIdx = state[stateKey].findIndex(c => c.key === 'remark');
                    const insertAt = causeIdx >= 0 ? causeIdx + 1 : (remarkIdx >= 0 ? remarkIdx : state[stateKey].length);
                    state[stateKey].splice(insertAt, 0, { key: 'priorityManage', label: '중점관리', visible: true });
                }
            }
        }
        return state[stateKey];
    }

    function renderSurveyColumnModalList() {
        const listEl = document.getElementById('surveyColumnListBody');
        if (!listEl) return;

        const modeCombinedEl = document.getElementById('defectSizeModeCombined');
        const modeSplitEl = document.getElementById('defectSizeModeSplit');
        const mode = state.defectSizeMode || 'combined';
        if (modeCombinedEl) modeCombinedEl.checked = (mode === 'combined');
        if (modeSplitEl) modeSplitEl.checked = (mode === 'split');

        const columns = getSurveyColumnsForModal();
        const defaultLabelByKey = {};
        (isGrade3Building() ? GRADE3_SURVEY_COLUMNS : DEFAULT_SURVEY_COLUMNS).forEach(c => { defaultLabelByKey[c.key] = c.label; });

        listEl.innerHTML = columns.map((c, idx) => `
            <div class="style-cat-card survey-column-row" style="display:flex; align-items:center; gap:0.45rem;${c.visible === false ? ' opacity:0.72;' : ''}">
                <label class="survey-column-visible" title="표에 표시" style="display:flex; align-items:center; gap:0.25rem; flex-shrink:0; cursor:pointer; user-select:none;">
                    <input type="checkbox" ${c.visible !== false ? 'checked' : ''} onchange="window.toggleSurveyColumnVisible('${c.key}', this.checked)">
                    <span style="font-size:0.72rem; font-weight:700; white-space:nowrap;">표시</span>
                </label>
                <div style="display:flex; flex-direction:column; gap:0.15rem;">
                    <button type="button" class="btn btn-sm btn-outline" style="padding:0.1rem 0.4rem;" ${idx === 0 ? 'disabled' : ''} onclick="window.moveSurveyColumnOrder('${c.key}', -1)"><i class="fa-solid fa-chevron-up"></i></button>
                    <button type="button" class="btn btn-sm btn-outline" style="padding:0.1rem 0.4rem;" ${idx === columns.length - 1 ? 'disabled' : ''} onclick="window.moveSurveyColumnOrder('${c.key}', 1)"><i class="fa-solid fa-chevron-down"></i></button>
                </div>
                <input type="text" class="form-control" value="${c.label}" style="flex:1;" onchange="window.renameSurveyColumn('${c.key}', this.value)" placeholder="${defaultLabelByKey[c.key] || ''}">
            </div>
        `).join('');
    }

    window.openSurveyColumnModal = function() {
        ensureSurveyColumnsInitialized();
        renderSurveyColumnModalList();
        const modal = document.getElementById('surveyColumnModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function closeSurveyColumnModal() {
        const modal = document.getElementById('surveyColumnModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

    window.moveSurveyColumnOrder = function(key, direction) {
        const cols = ensureSurveyColumnsInitialized();
        // 현재 모드에서 실제로 보이는 컬럼들 기준으로 이동 대상을 찾는다 (숨겨진 size/crackWidth/crackLength는 건너뜀)
        const activeKeys = getActiveSurveyColumns().map(c => c.key);
        const curPos = activeKeys.indexOf(key);
        const targetPos = curPos + direction;
        if (curPos === -1 || targetPos < 0 || targetPos >= activeKeys.length) return;
        const swapKey = activeKeys[targetPos];

        const idxA = cols.findIndex(c => c.key === key);
        const idxB = cols.findIndex(c => c.key === swapKey);
        if (idxA === -1 || idxB === -1) return;
        const tmp = cols[idxA];
        cols[idxA] = cols[idxB];
        cols[idxB] = tmp;

        renderSurveyColumnModalList();
        renderSurveyTable();
        saveStateToLocalStorage();
    };

    window.renameSurveyColumn = function(key, newLabel) {
        const cols = ensureSurveyColumnsInitialized();
        const trimmed = (newLabel || '').trim();
        if (!trimmed) { renderSurveyColumnModalList(); return; }
        const col = cols.find(c => c.key === key);
        if (col) col.label = trimmed;
        renderSurveyTable();
        saveStateToLocalStorage();
    };

    window.toggleSurveyColumnVisible = function(key, visible) {
        const cols = ensureSurveyColumnsInitialized();
        const col = cols.find(c => c.key === key);
        if (!col) return;
        col.visible = !!visible;
        if (getActiveSurveyColumns().length === 0) {
            col.visible = true;
            renderSurveyColumnModalList();
            window.showToast('최소 1개 컬럼은 표시해야 합니다.', 'warning');
            return;
        }
        renderSurveyColumnModalList();
        renderSurveyTable();
        saveStateToLocalStorage();
    };

    function setDefectSizeMode(mode) {
        state.defectSizeMode = mode;
        renderSurveyColumnModalList();
        renderSurveyTable();
        saveStateToLocalStorage();
    }

    function resetSurveyColumns() {
        if (isGrade3Building()) state.surveyColumnsGrade3 = null;
        else state.surveyColumns = null;
        renderSurveyColumnModalList();
        renderSurveyTable();
        saveStateToLocalStorage();
    }

    function setupSurveyColumnModalEvents() {
        const btnOpen = document.getElementById('btnOpenSurveyColumnModal');
        if (btnOpen) btnOpen.addEventListener('click', window.openSurveyColumnModal);

        const btnClose1 = document.getElementById('btnCloseSurveyColumnModal');
        if (btnClose1) btnClose1.addEventListener('click', closeSurveyColumnModal);
        const btnClose2 = document.getElementById('btnCloseSurveyColumnModal2');
        if (btnClose2) btnClose2.addEventListener('click', closeSurveyColumnModal);

        const modeCombinedEl = document.getElementById('defectSizeModeCombined');
        if (modeCombinedEl) modeCombinedEl.addEventListener('change', () => { if (modeCombinedEl.checked) setDefectSizeMode('combined'); });
        const modeSplitEl = document.getElementById('defectSizeModeSplit');
        if (modeSplitEl) modeSplitEl.addEventListener('change', () => { if (modeSplitEl.checked) setDefectSizeMode('split'); });

        const btnReset = document.getElementById('btnResetSurveyColumns');
        if (btnReset) {
            btnReset.addEventListener('click', async () => {
                if (!await window.appConfirm('컬럼 순서와 이름을 기본값으로 초기화하시겠습니까?')) return;
                resetSurveyColumns();
            });
        }
    }

    function renderSurveyPriorityCompareSlotHtml(src, label, openTitle) {
        if (!src) {
            return `<div class="survey-priority-compare-img-wrap"><div class="survey-priority-compare-empty">사진 없음</div></div>`;
        }
        return `<div class="survey-priority-compare-img-wrap" role="button" tabindex="0"
            title="${escapeSurveyAttr(openTitle)}"
            data-photo-src="${escapeSurveyAttr(src)}"
            data-photo-title="${escapeSurveyAttr(openTitle)}"
            onclick="window.openSurveyAlbumPhoto(this)"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSurveyAlbumPhoto(this);}">
            <img src="${src}" alt="${escapeSurveyAttr(label)}" loading="lazy">
        </div>`;
    }

    function renderSurveyPriorityCompareSection(defects) {
        const section = elements.surveyPriorityCompareSection || document.getElementById('surveyPriorityCompareSection');
        const grid = elements.surveyPriorityCompareGrid || document.getElementById('surveyPriorityCompareGrid');
        if (!section || !grid) return;

        const bldg = state.currentBuilding;
        const grade3 = isGrade3Building(bldg);
        if (!grade3) {
            section.hidden = true;
            grid.innerHTML = '';
            return;
        }

        const floorCode = state.currentFloor;
        const compareItems = (defects || []).filter((d) => d && d.isPriorityManage);

        if (!compareItems.length) {
            section.hidden = true;
            grid.innerHTML = '';
            return;
        }

        section.hidden = false;
        grid.innerHTML = compareItems.map((d) => {
            const prevSrc = getDefectPrevOutputPhotos(d)[0] || '';
            const currSrc = getDefectRepairPhotoSrc(d) || getDefectOutputPhotos(d)[0] || '';
            const ctx = {
                floorCode,
                gradeNo: formatSurveyReportNo(d, true, floorCode),
                floorDisplayLabel: getGrade3FloorDisplayLabel(floorCode, bldg)
            };
            const defectNo = getSurveyCellText('no', d, ctx) || (d.no || '').replace(/^NO\.?\s*/i, '');
            const title = `${memberNameOut(d.component) || '부재'} ${d.defectType || '결함'}`.trim();
            const roundLabels = getDefectHwpxCompareRoundLabels(d, bldg);
            const prevLabel = roundLabels.prev ? `전차 · ${roundLabels.prev}` : '전차';
            const currLabel = (roundLabels.curr ? `현차 · ${roundLabels.curr}` : '현차') + (getDefectRepairPhotoSrc(d) ? ' · 보수완료' : '');
            const openBase = `${defectNo} ${title}`.trim();
            return `
                <div class="survey-priority-compare-card">
                    <div class="survey-priority-compare-head">
                        <span class="survey-priority-compare-no">${escapeSurveyAttr(defectNo)}</span>
                        <span class="survey-priority-compare-defect-title">${escapeSurveyAttr(title)}</span>
                        <button type="button" class="survey-priority-compare-map-btn"
                            title="결함위치도에서 마킹 위치 보기"
                            onclick="window.viewDefectOnMapFromSurvey('${escapeSurveyAttr(d.id)}')">
                            <i class="fa-solid fa-map-location-dot"></i> 도면
                        </button>
                    </div>
                    <div class="survey-priority-compare-pair">
                        <div class="survey-priority-compare-slot">
                            <div class="survey-priority-compare-slot-label">${escapeSurveyAttr(prevLabel)}</div>
                            ${renderSurveyPriorityCompareSlotHtml(prevSrc, prevLabel, `${openBase} — ${prevLabel}`)}
                        </div>
                        <div class="survey-priority-compare-slot">
                            <div class="survey-priority-compare-slot-label">${escapeSurveyAttr(currLabel)}</div>
                            ${renderSurveyPriorityCompareSlotHtml(currSrc, currLabel, `${openBase} — ${currLabel}`)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function scheduleSurveyPriorityCompareHydrate(defects) {
        const grade3 = isGrade3Building();
        if (!grade3 || !defects || !defects.length) return;
        const targets = defects.filter((d) => d && d.isPriorityManage);
        if (!targets.length) return;
        const buildingId = state.currentBuildingId;
        const floor = state.currentFloor;
        (async () => {
            let changed = false;
            for (const d of targets) {
                const beforePrev = getDefectPrevOutputPhotos(d).length;
                const beforeCurr = getDefectOutputPhotos(d).length;
                await ensureDefectPhotosLoaded(d);
                if (getDefectPrevOutputPhotos(d).length !== beforePrev || getDefectOutputPhotos(d).length !== beforeCurr) {
                    changed = true;
                }
            }
            if (!changed) return;
            if (state.currentTab !== 'tab-survey') return;
            if (state.currentBuildingId !== buildingId || state.currentFloor !== floor) return;
            renderSurveyPriorityCompareSection(getCurrentFloorDefects());
        })().catch((e) => console.warn('중점관리 비교사진 로드:', e));
    }

    function renderPhotoAlbum() {
        if (!elements.photoAlbumGrid) return;
        const defects = getCurrentFloorDefects();
        if (elements.albumFloorTitle) elements.albumFloorTitle.textContent = state.currentFloor;

        renderSurveyPriorityCompareSection(defects);
        scheduleSurveyPriorityCompareHydrate(defects);
        renderSurveyCrackMonitorSection(defects);

        const photoItems = [];
        let pCounter = 0;

        defects.forEach(d => {
            getDefectOutputPhotos(d).forEach(photoSrc => {
                pCounter++;
                const pNumStr = pCounter < 10 ? `0${pCounter}` : `${pCounter}`;
                const photoLabel = `사진${pNumStr}`;
                const componentDefectTitle = `${d.no ? d.no + ' ' : ''}${memberNameOut(d.component) || '부재'} ${d.defectType || '결함'}`;
                photoItems.push({
                    label: photoLabel,
                    title: componentDefectTitle,
                    src: photoSrc,
                    defectId: d.id
                });
            });
        });

        if (photoItems.length === 0) {
            elements.photoAlbumGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:#a3a3a3; font-weight:600;"><i class="fa-solid fa-camera" style="font-size:2.5rem; color:#cbd5e1; display:block; margin-bottom:0.8rem;"></i>📷 등록된 현장 결함 사진이 없습니다.</div>`;
            return;
        }

        elements.photoAlbumGrid.innerHTML = photoItems.map(p => `
            <div class="photo-card survey-album-photo-card" role="button" tabindex="0"
                title="사진 크게 보기"
                data-photo-src="${escapeSurveyAttr(p.src)}"
                data-photo-title="${escapeSurveyAttr(p.label + '. ' + p.title)}"
                onclick="window.openSurveyAlbumPhoto(this)"
                onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openSurveyAlbumPhoto(this);}">
                <div class="photo-card-img-wrap survey-album-photo-wrap">
                    <img src="${p.src}" alt="${escapeSurveyAttr(p.label)}" loading="lazy">
                    <button type="button" class="survey-album-map-btn"
                        title="결함위치도에서 마킹 위치 보기"
                        onclick="event.stopPropagation(); window.viewDefectOnMapFromSurvey('${escapeSurveyAttr(p.defectId)}')">
                        <i class="fa-solid fa-map-location-dot"></i> 도면으로
                    </button>
                </div>
                <div class="survey-album-photo-caption">
                    <div class="survey-album-photo-label">
                        ${p.label}. ${p.title}
                    </div>
                </div>
            </div>
        `).join('');
    }

    window.openSurveyAlbumPhoto = function(el) {
        if (!el) return;
        const src = el.getAttribute('data-photo-src');
        const title = el.getAttribute('data-photo-title') || '현장 결함 사진';
        if (!src) return;
        const box = document.getElementById('drawingPreviewLightbox');
        if (!box) {
            if (typeof window.openDrawingPreviewLightbox === 'function') {
                window.openDrawingPreviewLightbox(src, title);
            }
            return;
        }
        const img = document.getElementById('drawingPreviewLightboxImg');
        const empty = document.getElementById('drawingPreviewLightboxEmpty');
        const titleEl = document.getElementById('drawingPreviewLightboxTitle');
        if (titleEl) titleEl.textContent = title;
        if (img) {
            img.hidden = false;
            img.src = src;
        }
        if (empty) empty.hidden = true;
        box.hidden = false;
        box.classList.add('open');
        box.setAttribute('aria-hidden', 'false');
        box.style.display = 'flex';
    };

    // arrows: 그룹(마킹 추가로 묶인 결함들)을 한 박스+여러 화살표로 그릴 때 전달하는 {targetX,targetY}[]
    function drawPinSafe(ctx, defect, arrows) {
        try {
            const groupAreaSources = [];
            if (arrows && arrows.length) {
                arrows.forEach((a) => {
                    if (a && a.areaSource && a.areaSource.areaX1 !== undefined) groupAreaSources.push(a.areaSource);
                });
            }
            if (groupAreaSources.length) {
                const seen = new Set();
                groupAreaSources.forEach((a) => {
                    const key = a.id || a;
                    if (seen.has(key)) return;
                    seen.add(key);
                    drawAreaRect(ctx, a, false, true);
                });
                ensureAreaPinPlacement(defect);
            } else if (defect.shapeType === 'area' && defect.areaX1 !== undefined) {
                drawAreaRect(ctx, defect, false, true);
                ensureAreaPinPlacement(defect);
                // 번호칸·지시선은 아래 일반 핀 로직으로 이어서 그림
            }
            const boxX = defect.x || 100;
            const boxY = defect.y || 100;

            const safeStyleKey = getDefectStyleKey(defect.category, defect.defectType);
            const color = getDefectColor(defect);
            const safeShapeCfg = getDefectPinShapeCfg(defect, safeStyleKey);
            const useCircleTipSafe = state.tipShape === 'circle';
            // 스타일 설정(핀/화살표 크기)이 화면과 동일하게 보고서에도 반영되도록 — 기존엔 여기가 고정 크기였음
            const safeDefectSize = getStyleSize(safeStyleKey);
            const safeScale = safeDefectSize.pin;
            const safeArrowScale = safeDefectSize.arrow;

            const targets = (arrows && arrows.length > 0)
                ? arrows
                : (defect.targetX !== undefined && defect.targetY !== undefined ? [{ targetX: defect.targetX, targetY: defect.targetY }] : []);

            const safeLabel = formatDefectPinLabel(defect, safeStyleKey);
            const { w: safeBoxW, h: safeBoxH } = measurePinBoxDimensions(ctx, safeLabel, safeScale, 1);
            const floorRotSafe = getSavedFloorDrawingRotation(defect.buildingId || state.currentBuildingId, defect.floorCode || state.currentFloor) || 0;

            // Draw Leader Line & Arrowhead/Tip — 실선, 마킹과 가장 가까운 박스 모서리에서 시작
            const isAreaDefectSafe = defect.shapeType === 'area' && defect.areaX1 !== undefined;
            const leaderTipsSafe = collectLeaderTipPoints(targets);
            targets.forEach(t => {
                if (t.targetX === undefined || t.targetY === undefined) return;
                let tipX = t.targetX;
                let tipY = t.targetY;
                const areaSrc = (t.areaSource && t.areaSource.areaX1 !== undefined)
                    ? t.areaSource
                    : (isAreaDefectSafe ? defect : null);
                const tipIsArea = !!areaSrc;
                if (areaSrc) {
                    const attach = getAreaCenterBorderAttachDefect(boxX, boxY, areaSrc);
                    tipX = attach.x;
                    tipY = attach.y;
                }
                const leaderAnchorOpts = { shape: safeShapeCfg.shape, scale: safeScale };
                const anchor = getGroupLeaderBoxAnchor(boxX, boxY, tipX, tipY, leaderTipsSafe, safeBoxW, safeBoxH, 0, leaderAnchorOpts);
                const safeHeadLen = 11 * safeArrowScale;
                const forcedDir = tipIsArea ? { enabled: false } : resolveForcedArrowDirection(t, defect, floorRotSafe);
                const tipCircleSafe = useCircleTipSafe && leaderTipIsCircle(forcedDir);
                const stemInset = tipCircleSafe
                    ? 4.5 * safeArrowScale
                    : safeHeadLen * Math.cos(Math.PI / 6);
                const leader = forcedDir.enabled
                    ? buildForcedLeaderRoute(
                        { x: tipX, y: tipY },
                        boxX,
                        boxY,
                        safeBoxW,
                        safeBoxH,
                        safeScale,
                        safeArrowScale,
                        forcedDir.octant,
                        stemInset,
                        safeHeadLen,
                        floorRotSafe,
                        leaderAnchorOpts
                    )
                    : (() => {
                        const ux = tipX - anchor.x;
                        const uy = tipY - anchor.y;
                        // 영역은 테두리까지 직선 (L자 꺾임 없음)
                        const tipBack = tipIsArea
                            ? 0
                            : (tipCircleSafe ? stemInset : safeHeadLen * Math.cos(Math.PI / 6));
                        const stemEnd = tipBack <= 0
                            ? { x: tipX, y: tipY }
                            : getArrowStemEndPoint(tipX, tipY, ux, uy, tipBack);
                        return { route: [anchor, stemEnd], ux, uy };
                    })();
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(leader.route[0].x, leader.route[0].y);
                for (let i = 1; i < leader.route.length; i++) ctx.lineTo(leader.route[i].x, leader.route[i].y);
                ctx.strokeStyle = color;
                ctx.lineWidth = getDefectLeaderLineWidth(safeScale, 1, false);
                ctx.lineCap = 'butt';
                ctx.setLineDash([]);
                ctx.stroke();

                if (!tipIsArea) {
                    ctx.fillStyle = color;
                    if (tipCircleSafe) {
                        ctx.beginPath();
                        ctx.arc(tipX, tipY, 4.5 * safeArrowScale, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        const angle = Math.atan2(leader.uy, leader.ux);
                        const arrowLen = safeHeadLen;

                        ctx.beginPath();
                        ctx.moveTo(tipX, tipY);
                        ctx.lineTo(tipX - arrowLen * Math.cos(angle - Math.PI / 6), tipY - arrowLen * Math.sin(angle - Math.PI / 6));
                        ctx.lineTo(tipX - arrowLen * Math.cos(angle + Math.PI / 6), tipY - arrowLen * Math.sin(angle + Math.PI / 6));
                        ctx.closePath();
                        ctx.fill();
                    }
                }
                ctx.restore();
            });

            // Draw Pin Box — fill=false면 투명 내부+마킹색 테두리, 숫자도 마킹색
            ctx.save();
            ctx.translate(boxX, boxY);
            paintPinBox(ctx, safeBoxW, safeBoxH, safeShapeCfg, color, safeScale, 1, false);

            drawPinBoxLabel(ctx, safeLabel, getPinBoxTextColor(color, safeShapeCfg, false), safeScale, safeShapeCfg);
            if (defectHasCornerMark(defect)) drawBookmarkChrome(ctx, safeBoxW, safeBoxH, safeScale);
            ctx.restore();
        } catch(e) {
            console.warn('drawPinSafe error:', e);
        }
    }

    /**
     * 벡터 PDF 출력: drawPinSafe와 동일한 비율/지시선/방향지정 계산 결과만 반환
     * (좌표는 도면 이미지 픽셀 기준)
     */
    window.buildVectorPinDrawPlan = function(defect, arrows, measureCtx) {
        if (!defect || defect.mapUnregistered) return null;
        if (defect.shapeType === 'area' && defect.areaX1 !== undefined) {
            ensureAreaPinPlacement(defect);
        }
        const boxX = defect.x || 100;
        const boxY = defect.y || 100;
        const styleKey = getDefectStyleKey(defect.category, defect.defectType);
        const color = getDefectColor(defect);
        const shapeCfg = getDefectPinShapeCfg(defect, styleKey);
        const useCircleTip = state.tipShape === 'circle';
        const sizes = getStyleSize(styleKey);
        const pinScale = sizes.pin;
        const arrowScale = sizes.arrow;
        const label = formatDefectPinLabel(defect, styleKey);
        const boxDim = measurePinBoxDimensions(measureCtx || null, label, pinScale, 1);
        const fontSize = getPinBoxFontSize(pinScale);
        const borderW = getPinBoxBorderWidth(pinScale, 1, false);
        const lineW = getDefectLeaderLineWidth(pinScale, 1, false);

        const targets = (arrows && arrows.length > 0)
            ? arrows
            : (defect.targetX !== undefined && defect.targetY !== undefined
                ? [{ targetX: defect.targetX, targetY: defect.targetY, forceArrowDir: defect.forceArrowDir, arrowOctant: defect.arrowOctant }]
                : []);

        const isAreaDefect = defect.shapeType === 'area' && defect.areaX1 !== undefined;
        const floorRot = getSavedFloorDrawingRotation(defect.buildingId || state.currentBuildingId, defect.floorCode || state.currentFloor) || 0;
        const leaders = [];
        const areaPayloads = [];
        const seenAreaIds = new Set();
        const pushAreaPayload = (src) => {
            if (!src || src.areaX1 === undefined) return;
            const id = src.id || `${src.areaX1}_${src.areaY1}_${src.areaX2}_${src.areaY2}`;
            if (seenAreaIds.has(id)) return;
            seenAreaIds.add(id);
            areaPayloads.push({
                x1: Math.min(src.areaX1, src.areaX2),
                y1: Math.min(src.areaY1, src.areaY2),
                x2: Math.max(src.areaX1, src.areaX2),
                y2: Math.max(src.areaY1, src.areaY2),
                shape: getAreaShape(src),
                angle: getAreaAngleDeg(src),
                points: isPolyPointAreaShape(getAreaShape(src))
                    ? getAreaPolyPoints(src)
                    : getAreaWorldCorners(src),
                drawings: Array.isArray(src.areaDrawings)
                    ? src.areaDrawings.map((st) => ({
                        type: st.type || 'path',
                        points: (st.points || []).map((p) => ({ x: p.x, y: p.y }))
                    }))
                    : [],
                fillStyle: getAreaFillStyle(src),
                borderStyle: getAreaBorderStyle(src)
            });
        };
        const leaderTipsVec = collectLeaderTipPoints(targets);
        targets.forEach(t => {
            if (t.targetX === undefined || t.targetY === undefined) return;
            let tipX = t.targetX;
            let tipY = t.targetY;
            const areaSrc = (t.areaSource && t.areaSource.areaX1 !== undefined)
                ? t.areaSource
                : (isAreaDefect ? defect : null);
            const tipIsArea = !!areaSrc;
            if (areaSrc) {
                pushAreaPayload(areaSrc);
                const attach = getAreaCenterBorderAttachDefect(boxX, boxY, areaSrc);
                tipX = attach.x;
                tipY = attach.y;
            }
            const leaderAnchorOpts = { shape: shapeCfg.shape, scale: pinScale };
            const anchor = getGroupLeaderBoxAnchor(boxX, boxY, tipX, tipY, leaderTipsVec, boxDim.w, boxDim.h, floorRot, leaderAnchorOpts);
            const headLen = 11 * arrowScale;
            const forcedDir = tipIsArea ? { enabled: false } : resolveForcedArrowDirection(t, defect, floorRot);
            const tipCircle = useCircleTip && leaderTipIsCircle(forcedDir);
            const stemInset = tipCircle
                ? 4.5 * arrowScale
                : headLen * Math.cos(Math.PI / 6);
            const leader = forcedDir.enabled
                ? buildForcedLeaderRoute(
                    { x: tipX, y: tipY },
                    boxX, boxY, boxDim.w, boxDim.h,
                    pinScale, arrowScale, forcedDir.octant,
                    stemInset, headLen, floorRot,
                    leaderAnchorOpts
                )
                : (() => {
                    const ux = tipX - anchor.x;
                    const uy = tipY - anchor.y;
                    // 영역은 테두리까지 직선 (L자 꺾임 없음)
                    const tipBack = tipIsArea
                        ? 0
                        : (tipCircle ? stemInset : headLen * Math.cos(Math.PI / 6));
                    const stemEnd = tipBack <= 0
                        ? { x: tipX, y: tipY }
                        : getArrowStemEndPoint(tipX, tipY, ux, uy, tipBack);
                    return { route: [anchor, stemEnd], ux, uy };
                })();

            leaders.push({
                route: leader.route,
                tipX,
                tipY,
                ux: leader.ux,
                uy: leader.uy,
                headLen,
                useCircleTip: tipCircle,
                skipArrowHead: tipIsArea
            });
        });
        if (!areaPayloads.length && isAreaDefect) pushAreaPayload(defect);

        return {
            color,
            label,
            boxX,
            boxY,
            boxW: boxDim.w,
            boxH: boxDim.h,
            fontSize,
            borderW,
            lineW,
            fill: !!shapeCfg.fill,
            leaders,
            area: areaPayloads[0] || null,
            areas: areaPayloads
        };
    };

    /** NDT 핀 → 벡터 PDF용 (결함위치도 buildVectorPinDrawPlan과 동일 비율) */
    window.buildVectorNdtPinDrawPlan = function(item, measureCtx, allItems) {
        if (!item) return null;
        let boxX = item.boxX !== undefined ? item.boxX : (item.x || 100);
        let boxY = item.boxY !== undefined ? item.boxY : (item.y || 100);
        const targetX = item.targetX !== undefined ? item.targetX : (item.x || boxX);
        const targetY = item.targetY !== undefined ? item.targetY : (item.y || boxY);
        const cat = item.category || '강도';
        const ndtStyleKey = getNdtStyleKey(cat);
        const color = getStyleColor(ndtStyleKey);
        const shapeCfg = getStyleShape(ndtStyleKey);
        const useCircleTip = state.tipShape === 'circle' || cat === '강도' || cat === '탄산화';
        const sizes = getStyleSize(ndtStyleKey);
        const pinScale = sizes.pin;
        const arrowScale = sizes.arrow;

        let noStr = item.no || 'NO.01';
        if (noStr.startsWith('기울기-') || noStr.startsWith('NDT-') || noStr.startsWith('변위-')) {
            const numPart = noStr.replace(/^[^\d]+/, '');
            noStr = `NO.${numPart.length === 1 ? '0' + numPart : numPart}`;
        }
        const label = formatPinNumberLabel(noStr, ndtStyleKey);
        const isTiltCallout = (cat === '기울기' || cat === '변위' || cat === '부재변위');
        const isTypeCallout = (cat === '강도' || cat === '탄산화');
        const typeLabel = isTypeCallout ? getNdtStrengthCarbTypeLabel(cat) : null;

        let boxDim;
        let fontSize;
        let col1W = null;
        if (isTiltCallout) {
            boxDim = { w: 168 * pinScale, h: 44 * pinScale };
            fontSize = Math.round(15 * pinScale);
        } else if (isTypeCallout) {
            const dims = measureNdtTypeCalloutDimensions(measureCtx || null, label, typeLabel, pinScale);
            boxDim = { w: dims.boxW, h: dims.boxH };
            fontSize = dims.fontType;
            col1W = dims.col1W;
        } else {
            boxDim = measurePinBoxDimensions(measureCtx || null, label, pinScale, 1, sizes.font);
            fontSize = getPinBoxFontSizeWithMul(pinScale, sizes.font);
        }
        const borderW = getPinBoxBorderWidth(pinScale, 1, false, getNdtLeaderLineScale(ndtStyleKey));
        const lineW = getNdtLeaderLineWidth(pinScale, false, ndtStyleKey);

        const leaders = [];
        if (targetX !== undefined && targetY !== undefined) {
            const anchor = isTiltCallout
                ? { x: boxX, y: boxY }
                : getPinLeaderBoxAnchor(boxX, boxY, targetX, targetY, boxDim.w, boxDim.h, 0, { shape: shapeCfg.shape, scale: pinScale });
            const headLen = 11 * arrowScale;
            const stemInset = useCircleTip ? 4.5 * arrowScale : headLen * Math.cos(Math.PI / 6);
            const ux = targetX - anchor.x;
            const uy = targetY - anchor.y;
            const stemEnd = stemInset > 0
                ? getArrowStemEndPoint(targetX, targetY, ux, uy, stemInset)
                : { x: targetX, y: targetY };
            leaders.push({
                route: [anchor, stemEnd],
                tipX: targetX,
                tipY: targetY,
                ux,
                uy,
                headLen,
                useCircleTip: true,
                skipArrowHead: false
            });
        }

        return {
            color,
            label,
            typeLabel,
            col1W,
            boxX,
            boxY,
            boxW: boxDim.w,
            boxH: boxDim.h,
            fontSize,
            borderW,
            lineW,
            fill: isTypeCallout ? false : !!shapeCfg.fill,
            leaders,
            area: null,
            tiltCallout: isTiltCallout,
            typeCallout: isTypeCallout
        };
    };

    // 지하/지상 여부가 다르면 아무리 문자열이 비슷해도(예: "B1F"가 "1F"를 포함) 매칭하지
    // 않는다. 지하1층 조회에 지상1층 도면이 잘못 걸리는 사고를 막기 위함.
    function isBasementFloorCode(code) {
        const c = (code || '').replace(/\s+/g, '').toUpperCase();
        return c.startsWith('B') || c.includes('지하');
    }

    function getFloorDrawingSrc(bldg, floorCode) {
        if (!bldg || !bldg.floorDrawings) return null;
        const drawings = bldg.floorDrawings;

        // 1. Direct key match
        if (drawings[floorCode]) return drawings[floorCode];

        // 2. Dong-to-Floor & Floor-to-Dong Mapping Lookup
        const dongToFloor = { '101동': '1F', '102동': '2F', '103동': '3F', '104동': '4F', '105동': '5F' };
        const floorToDong = { '1F': '101동', '2F': '102동', '3F': '103동', '4F': '104동', '5F': '105동' };

        if (dongToFloor[floorCode] && drawings[dongToFloor[floorCode]]) return drawings[dongToFloor[floorCode]];
        if (floorToDong[floorCode] && drawings[floorToDong[floorCode]]) return drawings[floorToDong[floorCode]];

        const floorIsBasement = isBasementFloorCode(floorCode);

        // 3. Case-insensitive / clean string match
        const cleanFloor = (floorCode || '').replace(/\s+/g, '').toUpperCase();
        for (const [k, v] of Object.entries(drawings)) {
            if (isBasementFloorCode(k) !== floorIsBasement) continue;
            const cleanK = k.replace(/\s+/g, '').toUpperCase();
            if (cleanK === cleanFloor || cleanK.includes(cleanFloor) || cleanFloor.includes(cleanK)) {
                return v;
            }
        }

        // 4. Number extraction match (e.g. '1F' matches '지상 1층' or '101동 1층' or '101동')
        const numMatch = floorCode ? floorCode.match(/\d+/) : null;
        if (numMatch) {
            const numStr = numMatch[0];
            for (const [k, v] of Object.entries(drawings)) {
                if (isBasementFloorCode(k) !== floorIsBasement) continue;
                if (k.includes(numStr)) return v;
            }
        }

        // 5. Index-based fallback (e.g. 1st floor in list matches 1st drawing in map)
        if (bldg.floorsList && Array.isArray(bldg.floorsList)) {
            const fIdx = bldg.floorsList.findIndex(f => f.floorCode === floorCode);
            if (fIdx >= 0) {
                const values = Object.values(drawings);
                if (values[fIdx]) return values[fIdx];
            }
        }

        // 6. Single drawing fallback
        const keys = Object.keys(drawings);
        if (keys.length > 0 && drawings[keys[0]]) return drawings[keys[0]];

        return null;
    }

    /** 비파괴 위치도: 해당 층 도면만. 1F 폴백을 쓰면 캣워크가 지상1층 도면으로 나간다.
     *  floorDrawings https는 CORS로 캔버스에 바로 못 쓰지만, 티어 data URL·클라우드 재질화
     *  (async)가 지상5층처럼 현재 층이 아닌 위치도를 살린다. */
    function getNdtFloorDrawingSrc(bldg, floorCode) {
        const currentBldgId = (bldg && bldg.id) || (state && state.currentBuildingId);
        const key = (currentBldgId && floorCode) ? `${currentBldgId}_${floorCode}` : '';
        const customSrc = key ? currentNdtCustomDrawingSrc(key) : null;
        if (customSrc) return customSrc;
        const takeRaster = (url) => {
            if (!url) return null;
            if (typeof isUsableRasterDrawingUrl === 'function') {
                if (isUsableRasterDrawingUrl(url)) return url;
                if (typeof isRasterDrawingUrl === 'function' && isRasterDrawingUrl(url)
                    && /^https?:\/\//i.test(url)) {
                    return url;
                }
                return null;
            }
            return url;
        };
        const exact = takeRaster(bldg && bldg.floorDrawings && bldg.floorDrawings[floorCode]);
        if (exact) return exact;
        const tiers = bldg && bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode];
        if (typeof pickFirstTierUrl === 'function') {
            const tierUrl = takeRaster(pickFirstTierUrl(tiers, ['4000', '2000', '8000', '16000']));
            if (tierUrl) return tierUrl;
        } else if (tiers && typeof tiers === 'object') {
            const vals = Object.values(tiers).filter(Boolean);
            const tierUrl = takeRaster(vals.length ? vals[0] : null);
            if (tierUrl) return tierUrl;
        }
        if (state.currentFloor === floorCode && state.ndtBgImage && state.ndtBgImage.src) {
            return state.ndtBgImage.src;
        }
        if (state.currentFloor === floorCode && state.bgImage && state.bgImage.src) {
            return state.bgImage.src;
        }
        return null;
    }

    async function preloadFloorDrawings(bldg) {
        if (!state.floorImageCache) state.floorImageCache = {};
        if (!bldg) return;

        let availableFloors = [];
        if (bldg && bldg.id && typeof listNdtFloorCodesForBuilding === 'function') {
            availableFloors = listNdtFloorCodesForBuilding(bldg.id);
        } else if (typeof window.getBuildingAvailableFloors === 'function' && bldg) {
            availableFloors = (window.getBuildingAvailableFloors(bldg) || []).map((f) => f && f.floorCode).filter(Boolean);
        } else if (bldg.floorsList && bldg.floorsList.length > 0) {
            availableFloors = bldg.floorsList.map(f => f.floorCode);
        } else if (bldg.floorDrawings) {
            availableFloors = Object.keys(bldg.floorDrawings);
        }

        // HWPX/보고서용: getFloorDrawingSrc 첫 도면 폴백으로 캐시가 오염되지 않게
        // 해당 층 키 래스터만 적재한다.
        if (!bldg.floorDrawings) bldg.floorDrawings = {};
        for (const fc of availableFloors) {
            if (typeof hydrateFloorDrawingFromCloud === 'function') {
                try {
                    await hydrateFloorDrawingFromCloud(bldg, fc, { localOnly: false });
                } catch (e) { /* 층별 도면 없음 허용 */ }
            } else if (typeof ensureOfflineRasterForFloor === 'function') {
                try { await ensureOfflineRasterForFloor(bldg, fc); } catch (e) { /* ignore */ }
            }
        }

        const promises = availableFloors.map((floorCode) => {
            return new Promise((resolve) => {
                const cacheKey = `${bldg.id}_${floorCode}`;
                const exact = bldg.floorDrawings && bldg.floorDrawings[floorCode];
                const tierUrl = (typeof pickFirstTierUrl === 'function')
                    ? pickFirstTierUrl(bldg.floorDrawingTiers && bldg.floorDrawingTiers[floorCode], ['4000', '2000', '8000', '16000'])
                    : null;
                const src = (typeof isUsableRasterDrawingUrl === 'function')
                    ? ([exact, tierUrl].find((u) => isUsableRasterDrawingUrl(u)) || null)
                    : (exact || tierUrl || null);
                if (!src) {
                    if (state.floorImageCache[cacheKey]) delete state.floorImageCache[cacheKey];
                    return resolve();
                }
                const cached = state.floorImageCache[cacheKey];
                if (cached && cached.complete && cached.naturalWidth > 0 && cached.src === src) {
                    return resolve();
                }
                if (cached) delete state.floorImageCache[cacheKey];
                const img = new Image();
                img.onload = () => {
                    state.floorImageCache[cacheKey] = img;
                    resolve();
                };
                img.onerror = () => {
                    if (state.floorImageCache[cacheKey]) delete state.floorImageCache[cacheKey];
                    resolve();
                };
                img.src = src;
            });
        });
        await Promise.all(promises);
    }

    function cloneLocationMapLegendItems(items) {
        return JSON.parse(JSON.stringify(items || []));
    }

    function getDefaultLocationMapLegend(bldg) {
        bldg = bldg || state.currentBuilding;
        // styleKey: 마킹 색 설정과 이어 둔다 — 마킹 색을 바꾸면 범례 색도 같이(예전엔 처음 색이 굳어 어긋났다)
        if (isGrade3Building(bldg)) {
            return [
                { colorName: '흑색', label: '상태양호', color: getStyleColor('defectGoodGrade3'), styleKey: 'defectGoodGrade3' },
                { colorName: '적색', label: '기존조사', color: getStyleColor('defectExistingGrade3'), styleKey: 'defectExistingGrade3' },
                { colorName: '청색', label: '신규조사', color: getStyleColor('defectNewGrade3'), styleKey: 'defectNewGrade3' },
                { colorName: '녹색', label: '중점관리', color: getStyleColor('priorityManage'), styleKey: 'priorityManage' }
            ];
        }
        return [
            { colorName: '적색', label: '결함발생', color: getStyleColor('defectBad'), styleKey: 'defectBad' },
            { colorName: '청색', label: '상태양호', color: getStyleColor('defectGood'), styleKey: 'defectGood' }
        ];
    }

    // 2026-10-19 범례 점검: 예전에 저장된 기본 항목(styleKey 없음)도 이름으로 마킹 색 설정에 잇는다.
    // 범례에서 색을 직접 고른 항목(colorCustom)은 그 색 그대로.
    function legendStyleKeyByLabel(bldg) {
        return isGrade3Building(bldg || state.currentBuilding)
            ? { 상태양호: 'defectGoodGrade3', 기존조사: 'defectExistingGrade3', 신규조사: 'defectNewGrade3', 중점관리: 'priorityManage' }
            : { 결함발생: 'defectBad', 상태양호: 'defectGood', 중점관리: 'priorityManage' };
    }
    function normalizeLegendLabelKey(label) {
        return String(label || '').replace(/\s+/g, '');
    }
    function resolveLegendItemStyleKey(item, bldg) {
        if (!item || item.colorCustom) return '';
        const map = legendStyleKeyByLabel(bldg);
        const byLabel = map[normalizeLegendLabelKey(item.label)] || '';
        if (item.styleKey && Object.values(map).includes(item.styleKey)) return item.styleKey;
        return byLabel;
    }
    /** 이 건물에 도면에 놓인 중점관리 마킹이 있나(1·2종 범례에 중점관리 줄을 붙일지) */
    /**
     * 그 층 도면에 놓인 중점관리 마킹이 있나(1·2종 범례에 중점관리 줄을 붙일지).
     * 2026-10-20 건물 단위로 보던 것을 층(도면) 단위로 — 중점관리가 없는 층 도면에도 줄이 붙던 것.
     */
    function floorHasPriorityManageMarking(floorCode, bldgId) {
        const id = bldgId || state.currentBuildingId;
        const fc = floorCode || state.currentFloor;
        if (!id || !fc || !state.defects) return false;
        return (state.defects[`${id}_${fc}`] || []).some((d) => d && d.isPriorityManage && !d.mapUnregistered && !isDefectRepaired(d));
    }
    /** 그 층 도면에 중점관리였다가 보수된(검정) 마킹이 있나 — 1·2종 범례에 「보수완료」 검정 줄 */
    function floorHasPriorityRepairedMarking(floorCode, bldgId) {
        const id = bldgId || state.currentBuildingId;
        const fc = floorCode || state.currentFloor;
        if (!id || !fc || !state.defects) return false;
        return (state.defects[`${id}_${fc}`] || []).some((d) => d && !d.mapUnregistered && isPriorityRepairedDefect(d));
    }
    /**
     * 도면에 그릴 범례 줄(화면·보고서/PDF·한글 그림·벡터 PDF·범위 맞춤 공용).
     * 1·2종도 중점관리 마킹은 녹색으로 그려지는데 기본 범례엔 그 줄이 없었다 → 중점관리 마킹이 있으면 줄을 붙인다.
     */
    function getLocationMapLegendDrawItems(floorCode) {
        const items = getActiveLocationMapLegend().map(enrichLocationMapLegendItem);
        if (!isGrade3Building()) {
            const hasRow = items.some((it) => resolveLegendItemStyleKey(it) === 'priorityManage'
                || normalizeLegendLabelKey(it.label) === '중점관리');
            if (!hasRow && floorHasPriorityManageMarking(floorCode)) {
                items.push(enrichLocationMapLegendItem({ label: '중점관리', color: getStyleColor('priorityManage'), styleKey: 'priorityManage', auto: true }));
            }
            const hasRepairRow = items.some((it) => normalizeLegendLabelKey(it.label) === '보수완료');
            if (!hasRepairRow && floorHasPriorityRepairedMarking(floorCode)) {
                items.push(enrichLocationMapLegendItem({ colorName: '흑색', label: '보수완료', color: PRIORITY_REPAIRED_COLOR, auto: true }));
            }
        }
        return items;
    }

    function saveBuildingLocationMapLegend(bldg) {
        if (!bldg) return;
        const items = state.locationMapLegend;
        if (items && items.length) {
            bldg.locationMapLegend = cloneLocationMapLegendItems(items);
        }
        if (state.locationMapLegendBox && _legendLayout && typeof _legendLayout.stampNormalized === 'function') {
            const dims = (typeof getFloorPlanDisplayDims === 'function')
                ? getFloorPlanDisplayDims()
                : { w: 0, h: 0 };
            _legendLayout.stampNormalized(state.locationMapLegendBox, dims.w, dims.h);
        }
        bldg.locationMapLegendBox = state.locationMapLegendBox
            ? { ...state.locationMapLegendBox }
            : null;
    }

    /**
     * 2026-10-22 월곡시장(3종) 범례가 한 기기에서만 「적색 결함발생 / 흑색 상태양호」(1·2종 기본을 3종 색으로 그린 것)로 나옴.
     * 1·2종 기본 범례가 건물에 저장된 뒤 등급이 3종이 되면, 동기화 병합은 기기 쪽 범례를 항상 남겨서(overlayOnMerged)
     * 서버의 3종 범례가 그 기기로 안 내려온다. 손대지 않은 「다른 등급의 기본 범례」면 이 등급 기본으로 바꾼다(위치·크기는 그대로).
     */
    function isOtherGradeDefaultLegend(items, bldg) {
        if (!Array.isArray(items) || !items.length) return false;
        if (items.some((it) => !it || it.colorCustom)) return false;
        const key = (labels) => labels.map(normalizeLegendLabelKey).sort().join('|');
        const labels = key(items.map((it) => it.label));
        if (isGrade3Building(bldg)) {
            return labels === key(['결함발생', '상태양호']) || labels === key(['결함발생', '상태양호', '중점관리']);
        }
        return labels === key(['상태양호', '기존조사', '신규조사', '중점관리']);
    }

    function applyBuildingLocationMapLegend(bldg, opts) {
        if (!bldg) return;
        const forceDefault = !!(opts && opts.forceDefault);
        const defaultItems = getDefaultLocationMapLegend(bldg);
        if (!forceDefault && isOtherGradeDefaultLegend(bldg.locationMapLegend, bldg)) {
            bldg.locationMapLegend = cloneLocationMapLegendItems(defaultItems);
        }
        if (_legendLayout && typeof _legendLayout.applyFromBuilding === 'function') {
            const applied = _legendLayout.applyFromBuilding(bldg, {
                items: state.locationMapLegend,
                box: state.locationMapLegendBox
            }, { forceDefault, defaultItems });
            state.locationMapLegend = applied.items;
            state.locationMapLegendBox = applied.box;
            if (applied.writeItemsToBuilding !== undefined) {
                bldg.locationMapLegend = applied.writeItemsToBuilding
                    ? cloneLocationMapLegendItems(applied.writeItemsToBuilding)
                    : applied.writeItemsToBuilding;
            }
            if (applied.writeBoxToBuilding !== undefined) {
                bldg.locationMapLegendBox = applied.writeBoxToBuilding
                    ? { ...applied.writeBoxToBuilding }
                    : null;
            }
            syncLocationMapLegendLockButton();
            return;
        }
        // 헬퍼 미로드 시 폴백 — 항목이 없어도 박스는 지우지 않는다
        if (forceDefault) {
            state.locationMapLegend = cloneLocationMapLegendItems(defaultItems);
            state.locationMapLegendBox = null;
            bldg.locationMapLegend = cloneLocationMapLegendItems(state.locationMapLegend);
            bldg.locationMapLegendBox = null;
            syncLocationMapLegendLockButton();
            return;
        }
        if (bldg.locationMapLegend && bldg.locationMapLegend.length) {
            state.locationMapLegend = cloneLocationMapLegendItems(bldg.locationMapLegend);
        } else {
            state.locationMapLegend = cloneLocationMapLegendItems(defaultItems);
        }
        if (bldg.locationMapLegendBox) {
            state.locationMapLegendBox = { ...bldg.locationMapLegendBox };
        } else if (state.locationMapLegendBox) {
            bldg.locationMapLegendBox = { ...state.locationMapLegendBox };
        }
        syncLocationMapLegendLockButton();
    }

    function persistCurrentBuildingLocationMapLegend() {
        if (state.currentBuilding) saveBuildingLocationMapLegend(state.currentBuilding);
    }

    function isLocationMapLegendLocked() {
        return !!(state.locationMapLegendBox && state.locationMapLegendBox.locked);
    }

    function ensureLocationMapLegendBox() {
        if (!state.locationMapLegendBox) state.locationMapLegendBox = {};
        return state.locationMapLegendBox;
    }

    function syncLocationMapLegendLockButton() {
        const btn = document.getElementById('btnLockLocationMapLegend');
        if (!btn) return;
        const locked = isLocationMapLegendLocked();
        btn.classList.toggle('active', locked);
        const icon = btn.querySelector('i');
        if (icon) icon.className = locked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
        btn.title = locked
            ? '범례 고정 해제 (끌어서 이동·크기 조절 가능)'
            : '범례 위치·크기 고정';
    }

    window.toggleLocationMapLegendLock = function() {
        const box = ensureLocationMapLegendBox();
        box.locked = !box.locked;
        syncLocationMapLegendLockButton();
        persistCurrentBuildingLocationMapLegend();
        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas();
    };

    function getActiveLocationMapLegend() {
        return (state.locationMapLegend && state.locationMapLegend.length) ? state.locationMapLegend : getDefaultLocationMapLegend();
    }

    function ensureLocationMapLegendInitialized() {
        if (!state.locationMapLegend || !state.locationMapLegend.length) {
            state.locationMapLegend = getDefaultLocationMapLegend();
        }
        return state.locationMapLegend;
    }

    // --- 위치도 범례 설정 모달 ---
    function reorderLocationMapLegendItems(fromIdx, toIdx) {
        const items = ensureLocationMapLegendInitialized();
        if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx >= items.length) return;
        const [item] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, item);
        renderLocationMapLegendModalList();
        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas();
        persistCurrentBuildingLocationMapLegend();
    }

    function setupLocationMapLegendListDragDrop(listEl) {
        if (!listEl) return;
        let dragFromIdx = null;

        listEl.querySelectorAll('.legend-modal-row').forEach(row => {
            const handle = row.querySelector('.legend-drag-handle');
            if (!handle) return;

            handle.addEventListener('dragstart', (e) => {
                dragFromIdx = parseInt(row.dataset.legendIdx, 10);
                if (isNaN(dragFromIdx)) return;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(dragFromIdx));
                try { e.dataTransfer.setDragImage(row, 24, 20); } catch (_) {}
                row.classList.add('legend-row-dragging');
            });

            handle.addEventListener('dragend', () => {
                dragFromIdx = null;
                row.classList.remove('legend-row-dragging');
                listEl.querySelectorAll('.legend-modal-row').forEach(r => r.classList.remove('legend-row-drag-over'));
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                row.classList.add('legend-row-drag-over');
            });

            row.addEventListener('dragleave', (e) => {
                if (!row.contains(e.relatedTarget)) row.classList.remove('legend-row-drag-over');
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('legend-row-drag-over');
                const toIdx = parseInt(row.dataset.legendIdx, 10);
                const fromIdx = dragFromIdx ?? parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (isNaN(fromIdx) || isNaN(toIdx)) return;
                reorderLocationMapLegendItems(fromIdx, toIdx);
            });
        });
    }

    function renderLocationMapLegendModalList() {
        const listEl = document.getElementById('locationMapLegendListBody');
        if (!listEl) return;
        const items = ensureLocationMapLegendInitialized();
        const legendAttr = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        listEl.innerHTML = items.map((item, idx) => {
            const shown = enrichLocationMapLegendItem(item); // 마킹 색 설정을 따르는 항목은 지금 색으로
            return `
            <div class="style-cat-card legend-modal-row" data-legend-idx="${idx}" style="display:flex; align-items:center; gap:0.45rem; margin-bottom:0.35rem;">
                <button type="button" class="legend-drag-handle" draggable="true" title="드래그하여 순서 변경" aria-label="순서 변경" style="border:none;background:transparent;padding:0.2rem 0.15rem;color:#a3a3a3;cursor:grab;flex-shrink:0;line-height:1;">
                    <i class="fa-solid fa-grip-vertical"></i>
                </button>
                <input type="color" value="${legendAttr(normalizeHexColor(shown.color) || '#64748b')}" onchange="window.recolorLocationMapLegendItem(${idx}, this.value)">
                <input type="text" class="form-control" value="${legendAttr(item.label)}" style="flex:1;" onchange="window.renameLocationMapLegendItem(${idx}, this.value)">
                <button type="button" class="btn btn-sm btn-danger-outline" onclick="window.removeLocationMapLegendItem(${idx})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        }).join('');
        setupLocationMapLegendListDragDrop(listEl);
    }

    window.openLocationMapLegendModal = function() {
        ensureLocationMapLegendInitialized();
        renderLocationMapLegendModalList();
        const modal = document.getElementById('locationMapLegendModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function closeLocationMapLegendModal() {
        const modal = document.getElementById('locationMapLegendModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

    window.recolorLocationMapLegendItem = function(idx, color) {
        const items = ensureLocationMapLegendInitialized();
        if (items[idx]) {
            items[idx].color = color;
            items[idx].colorName = resolveLegendColorName({ color });
            items[idx].colorCustom = true; // 범례에서 직접 고른 색 — 마킹 색 설정을 따르지 않는다
        }
        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas();
        persistCurrentBuildingLocationMapLegend();
    };

    window.renameLocationMapLegendItem = function(idx, label) {
        const items = ensureLocationMapLegendInitialized();
        const trimmed = (label || '').trim();
        if (!trimmed) { renderLocationMapLegendModalList(); return; }
        if (items[idx]) items[idx].label = trimmed;
        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas(); // 이름 바꾸면 도면 범례도 바로(예전엔 다음 그리기까지 옛 이름)
        persistCurrentBuildingLocationMapLegend();
    };

    window.removeLocationMapLegendItem = async function(idx) {
        if (!await window.confirmDelete('이 범례 항목을 삭제할까요?')) return;
        const items = ensureLocationMapLegendInitialized();
        items.splice(idx, 1);
        renderLocationMapLegendModalList();
        saveStateToLocalStorage();
        if (typeof drawCanvas === 'function') drawCanvas();
        persistCurrentBuildingLocationMapLegend();
    };

    function setupLocationMapLegendModalEvents() {
        const btnOpen = document.getElementById('btnOpenLocationMapLegendModal');
        if (btnOpen) btnOpen.addEventListener('click', window.openLocationMapLegendModal);

        const btnLock = document.getElementById('btnLockLocationMapLegend');
        if (btnLock) btnLock.addEventListener('click', window.toggleLocationMapLegendLock);
        syncLocationMapLegendLockButton();

        const btnClose1 = document.getElementById('btnCloseLocationMapLegendModal');
        if (btnClose1) btnClose1.addEventListener('click', closeLocationMapLegendModal);
        const btnClose2 = document.getElementById('btnCloseLocationMapLegendModal2');
        if (btnClose2) btnClose2.addEventListener('click', closeLocationMapLegendModal);

        const btnAdd = document.getElementById('btnAddLocationMapLegendItem');
        if (btnAdd) btnAdd.addEventListener('click', () => {
            const items = ensureLocationMapLegendInitialized();
            const color = '#64748b';
            items.push({ label: '새 항목', color, colorName: resolveLegendColorName({ color }) });
            renderLocationMapLegendModalList();
            saveStateToLocalStorage();
            persistCurrentBuildingLocationMapLegend();
        });

        const btnReset = document.getElementById('btnResetLocationMapLegend');
        if (btnReset) btnReset.addEventListener('click', async () => {
            if (!await window.appConfirm('범례를 기본값으로 초기화하시겠습니까? (내용, 위치, 크기 모두 초기화됩니다)')) return;
            applyBuildingLocationMapLegend(state.currentBuilding, { forceDefault: true });
            renderLocationMapLegendModalList();
            saveStateToLocalStorage();
            if (typeof drawCanvas === 'function') drawCanvas();
        });
    }

    // 결함위치도 범례 박스의 마지막으로 그려진 "도면 원본 픽셀" 좌표(결함 핀 x/y와 동일한 좌표계) —
    // drawCanvas에서 매번 갱신되고, 드래그 이동/크기조절 히트테스트(이미지 좌표 기준)에 재사용된다.
    let lastLegendBoxBounds = null;
    const LEGEND_HANDLE_SIZE = 16; // 크기조절 손잡이 기본 크기(도면 픽셀 기준, scale 배율을 곱해서 사용)
    const LEGEND_DEFAULT_SCALE = 4;
    const LEGEND_SCALE_MIN = 0.35;
    const LEGEND_SCALE_MAX = 40;
    // 범례 글자/표 크기는 도면 원본 픽셀에 절대값으로 그리므로, 해상도가 다른 도면에
    // 같은 scale을 쓰면 작은 도면에선 크게·큰 도면에선 작게 보인다. 기준 해상도로 나눠
    // 상대 크기를 맞춘다(압축 도면 maxDim≈2200 근처를 기준으로 둠).
    const LEGEND_FIT_REF_PX = 2000;

    function getLocationMapLegendScale(box) {
        const b = box || state.locationMapLegendBox || {};
        return (b.scale !== undefined) ? b.scale : LEGEND_DEFAULT_SCALE;
    }

    function clampLegendScale(scale) {
        return Math.min(Math.max(LEGEND_SCALE_MIN, scale), LEGEND_SCALE_MAX);
    }

    function getLegendFitFactor(imgW, imgH) {
        const dim = Math.max(Number(imgW) || 0, Number(imgH) || 0, 1);
        return dim / LEGEND_FIT_REF_PX;
    }

    /** 실제 그리기용 스케일 = 사용자 배율 × 도면 해상도 보정 */
    function resolveLocationMapLegendDrawScale(box, imgW, imgH) {
        return Math.max(0.2, getLocationMapLegendScale(box) * getLegendFitFactor(imgW, imgH));
    }

    // 결함위치도에 색상 범례를 그린다. 위치(x,y)는 결함 핀처럼 도면 원본 픽셀 좌표라서, 이 함수를
    // 호출하는 쪽(화면 drawCanvas / 보고서 renderFloorPlanCanvasDataUrl)에서 이미 팬/줌/회전(혹은
    // 보고서의 세로 페이지 맞춤 회전) 변환이 적용된 ctx 위에서 호출해야 범례가 도면에 붙어서 같이
    // 움직인다. interactive=true(화면)일 때만 우측 하단에 크기조절 손잡이를 그리고
    // lastLegendBoxBounds를 갱신한다 — 보고서 내보내기에는 손잡이가 나오지 않는다.
    function normalizeHexColor(hex) {
        if (!hex || typeof hex !== 'string') return '';
        let h = hex.trim().toLowerCase();
        if (!h.startsWith('#')) h = '#' + h;
        if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
        return h.length === 7 ? h : '';
    }

    function hexToLegendColorName(hex) {
        const h = normalizeHexColor(hex);
        if (!h) return '—';
        const r = parseInt(h.slice(1, 3), 16);
        const g = parseInt(h.slice(3, 5), 16);
        const b = parseInt(h.slice(5, 7), 16);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const lightness = (max + min) / (2 * 255);
        if (delta < 35 && lightness < 0.22) return '흑색';

        // 채널이 뚜렷하면 그대로 (0,0,255 = 청색). 스타일 슬롯 이름에 묶지 않음
        if (max === b && (b - g) >= 30 && (b - r) >= 30) return '청색';
        if (max === g && (g - r) >= 25 && (g - b) >= 25) return '녹색';
        if (r > 160 && g > 130 && b < 90 && (r - b) > 80) return '황색';
        if (max === r && (r - g) >= 30 && (r - b) >= 30) return '적색';

        let hue = 0;
        if (delta > 0) {
            if (max === r) hue = ((g - b) / delta) % 6;
            else if (max === g) hue = (b - r) / delta + 2;
            else hue = (r - g) / delta + 4;
            hue = hue * 60;
            if (hue < 0) hue += 360;
        }

        if (hue >= 38 && hue <= 68 && r > 160 && g > 130) return '황색';
        if (hue >= 70 && hue < 165 && g >= Math.max(r, b) - 20) return '녹색';
        if (hue >= 165 && hue <= 270) return '청색';
        return '적색';
    }

    // 범례 '구분' 열 — 현재 색상(RGB)으로만 결정. 스타일 키(중점관리=녹색 등)에 묶지 않음
    function resolveLegendColorName(item) {
        const hex = normalizeHexColor(item && item.color);
        if (!hex) return '—';
        if (hex === '#facc15' || hex === '#eab308' || hex === '#ca8a04') return '황색';
        return hexToLegendColorName(hex);
    }

    function enrichLocationMapLegendItem(item) {
        const key = resolveLegendItemStyleKey(item);
        const color = (key && getStyleColor(key)) || (item && item.color);
        const out = { ...item, color };
        return { ...out, colorName: resolveLegendColorName(out) };
    }

    function measureLocationMapLegendTable(ctx, items, scale) {
        const fontSize = Math.max(6, Math.round(11 * scale));
        const cellPadX = 3 * scale;
        const cellPadY = 2 * scale;
        const rowH = fontSize + cellPadY * 2;
        const headerRowH = rowH;
        const headers = ['구분', '내 용'];
        ctx.save();
        ctx.font = `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
        let col1Max = ctx.measureText(headers[0]).width;
        let col2Max = ctx.measureText(headers[1]).width;
        items.forEach(item => {
            const cat = resolveLegendColorName(item);
            col1Max = Math.max(col1Max, ctx.measureText(cat).width);
            col2Max = Math.max(col2Max, ctx.measureText(item.label || '').width);
        });
        ctx.restore();
        const col1W = col1Max + cellPadX * 2;
        const col2W = col2Max + cellPadX * 2;
        return {
            col1W, col2W,
            boxW: col1W + col2W,
            boxH: headerRowH + items.length * rowH,
            rowH, headerRowH, fontSize, cellPadX, cellPadY
        };
    }

    // 결함위치도에 색상 범례를 그린다. 위치(x,y)는 도면 원본 픽셀 좌표(좌상단)이며,
    // counterRotateDeg로 도면 회전과 반대로 돌려 글자·표가 항상 수평으로 보이게 한다.
    function drawLocationMapLegend(ctx, imgW, imgH, interactive, counterRotateDeg, legendOpts) {
        // legendOpts.floorCode: 그리는 도면의 층(출력은 층마다 다르다 — 화면은 지금 층)
        const items = getLocationMapLegendDrawItems(legendOpts && legendOpts.floorCode);
        if (!items.length) {
            if (interactive) lastLegendBoxBounds = null;
            return;
        }

        // legendOpts.box: 출력 범위 안에 범례를 다시 놓을 때 쓰는 임시 박스(저장된 박스는 건드리지 않는다)
        const box = (legendOpts && legendOpts.box) || state.locationMapLegendBox || {};
        const scale = resolveLocationMapLegendDrawScale(box, imgW, imgH);
        const dims = measureLocationMapLegendTable(ctx, items, scale);
        const { col1W, col2W, boxW, boxH, rowH, headerRowH, fontSize, cellPadX, cellPadY } = dims;
        const margin = 16 * scale;
        const origin = (_legendLayout && typeof _legendLayout.resolveOrigin === 'function')
            ? _legendLayout.resolveOrigin(box, imgW, imgH, margin)
            : {
                x: (box.x !== undefined) ? box.x : margin,
                y: (box.y !== undefined) ? box.y : margin
            };
        const boxX = origin.x;
        const boxY = origin.y;
        // 2026-10-20 저장된 범례 박스에 비율을 찍는 것은 화면(지금 층 도면)에서만 — 출력 중 다른 층 도면 크기로
        // 찍히면 다음 층부터 범례 자리가 그 층 기준으로 어긋났다
        if (interactive && !(legendOpts && legendOpts.box)
            && state.locationMapLegendBox && (state.locationMapLegendBox.nx == null || state.locationMapLegendBox.ny == null)
            && _legendLayout && typeof _legendLayout.stampNormalized === 'function') {
            state.locationMapLegendBox.x = boxX;
            state.locationMapLegendBox.y = boxY;
            _legendLayout.stampNormalized(state.locationMapLegendBox, imgW, imgH);
        }
        const lineW = Math.max(1, 1.2 * scale);
        const legendRot = counterRotateDeg || 0;

        ctx.save();
        ctx.translate(boxX, boxY);
        if (legendRot === 90) {
            ctx.rotate((-90 * Math.PI) / 180);
        } else if (legendRot === 180) {
            ctx.rotate((-180 * Math.PI) / 180);
        } else if (legendRot === 270) {
            ctx.rotate((-270 * Math.PI) / 180);
        }

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#a3a3a3';
        ctx.lineWidth = lineW;

        // 배경 + 외곽
        ctx.fillRect(0, 0, boxW, boxH);
        ctx.strokeRect(0, 0, boxW, boxH);

        // 세로 구분선
        ctx.beginPath();
        ctx.moveTo(col1W, 0);
        ctx.lineTo(col1W, boxH);
        ctx.stroke();

        // 가로 구분선 (헤더 아래 + 각 행)
        ctx.beginPath();
        ctx.moveTo(0, headerRowH);
        ctx.lineTo(boxW, headerRowH);
        ctx.stroke();
        for (let i = 1; i < items.length; i++) {
            const y = headerRowH + i * rowH;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(boxW, y);
            ctx.stroke();
        }

        ctx.font = `bold ${fontSize}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 헤더
        ctx.fillStyle = '#64748b';
        ctx.fillText('구분', col1W / 2, headerRowH / 2);
        ctx.fillText('내 용', col1W + col2W / 2, headerRowH / 2);

        // 데이터 행
        items.forEach((item, i) => {
            const rowY = headerRowH + i * rowH + rowH / 2;
            const cat = resolveLegendColorName(item);
            ctx.fillStyle = item.color || '#1e293b';
            ctx.fillText(cat, col1W / 2, rowY);
            ctx.fillText(item.label || '', col1W + col2W / 2, rowY);
        });

        if (interactive) {
            if (!isLocationMapLegendLocked()) {
                const hs = LEGEND_HANDLE_SIZE * scale;
                ctx.fillStyle = 'rgba(30,41,59,0.55)';
                ctx.beginPath();
                ctx.moveTo(boxW, boxH - hs);
                ctx.lineTo(boxW, boxH);
                ctx.lineTo(boxW - hs, boxH);
                ctx.closePath();
                ctx.fill();
            } else {
                const badge = Math.max(10, 11 * scale);
                ctx.fillStyle = 'rgba(100,116,139,0.9)';
                ctx.fillRect(boxW - badge - cellPadX, cellPadY, badge, badge);
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold ${Math.max(7, badge * 0.65)}px "Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('🔒', boxW - badge / 2 - cellPadX, cellPadY + badge / 2);
            }
        }

        ctx.restore();

        if (interactive) {
            lastLegendBoxBounds = { x: boxX, y: boxY, w: boxW, h: boxH, scale };
        }
    }

    /** 결함위치도 범례 표 → 벡터 PDF용 (화면 drawLocationMapLegend와 동일 치수) */
    window.buildVectorLegendDrawPlan = function(measureCtx, imgW, imgH, floorCode) {
        const items = getLocationMapLegendDrawItems(floorCode);
        if (!items.length) return null;
        const box = state.locationMapLegendBox || {};
        const scale = resolveLocationMapLegendDrawScale(box, imgW, imgH);
        const dims = measureLocationMapLegendTable(measureCtx || null, items, scale);
        const margin = 16 * scale;
        const origin = (_legendLayout && typeof _legendLayout.resolveOrigin === 'function')
            ? _legendLayout.resolveOrigin(box, imgW, imgH, margin)
            : {
                x: (box.x !== undefined) ? box.x : margin,
                y: (box.y !== undefined) ? box.y : margin
            };
        const boxX = origin.x;
        const boxY = origin.y;
        return {
            boxX, boxY,
            boxW: dims.boxW,
            boxH: dims.boxH,
            col1W: dims.col1W,
            col2W: dims.col2W,
            rowH: dims.rowH,
            headerRowH: dims.headerRowH,
            fontSize: dims.fontSize,
            lineW: Math.max(1, 1.2 * scale),
            scale,
            items: items.map(it => ({
                colorName: resolveLegendColorName(it),
                label: it.label || '',
                color: it.color || '#1e293b'
            }))
        };
    };

    // 여러 동 한글 출력(2026-10-23): 다른 동의 위치도를 그릴 때만 잠깐 그 동을 기준 건물로 쓴다.
    // state.currentBuilding은 바꾸지 않는다(동기화·화면 코드가 그 값을 보고 움직여서).
    // 다른 동을 그리는 동안은 「지금 화면에 연 층」 대체값(현재 층 결함·배경 그림·비파괴 캔버스)도 쓰지 않는다.
    let _hwpxRenderBldgOverride = null;
    function hwpxRenderBuilding() {
        return _hwpxRenderBldgOverride || window.state.currentBuilding || {};
    }
    function hwpxRenderIsScreenFloor(floorCode) {
        if (_hwpxRenderBldgOverride && _hwpxRenderBldgOverride.id !== state.currentBuildingId) return false;
        return state.currentFloor === floorCode;
    }

    function renderFloorPlanCanvasDataUrl(floorCode) {
        try {
            const bldg = hwpxRenderBuilding();
            const currentBldgId = bldg.id || state.currentBuildingId || 'default';
            const key = `${currentBldgId}_${floorCode}`;
            const rawDefects = state.defects[key] || (hwpxRenderIsScreenFloor(floorCode) ? getCurrentFloorDefects() : []);
            const defects = filterMapPlacedDefects(rawDefects);

            // 1. Check preloaded image cache or image source for this floor (건물별로 구분된 캐시 키 사용)
            // 1. 해당 층 키의 도면만 사용 (다른 층 폴백/오염 캐시 금지)
            const cacheKey = `${currentBldgId}_${floorCode}`;
            const exactSrc = (bldg.floorDrawings && bldg.floorDrawings[floorCode]) || null;
            let floorDrawingSrc = (typeof isUsableRasterDrawingUrl === 'function' && isUsableRasterDrawingUrl(exactSrc))
                ? exactSrc
                : null;
            if (!floorDrawingSrc && hwpxRenderIsScreenFloor(floorCode) && state.bgImage && state.bgImage.src) {
                floorDrawingSrc = state.bgImage.src;
            }
            let loadedImg = state.floorImageCache ? state.floorImageCache[cacheKey] : null;
            if (loadedImg && floorDrawingSrc && loadedImg.src && loadedImg.src !== floorDrawingSrc) {
                delete state.floorImageCache[cacheKey];
                loadedImg = null;
            }
            if (loadedImg && !(loadedImg.complete && loadedImg.naturalWidth > 0)) {
                loadedImg = null;
            }

            // 2. If image exists, render onto A4 PORTRAIT (세로 규격: 900 x 1270) canvas with defect pins!
            if (loadedImg || floorDrawingSrc) {
                const drawImageOnPureWhiteCanvas = (imgObj) => {
                    const imgW = imgObj.naturalWidth || imgObj.width || 1400;
                    const imgH = imgObj.naturalHeight || imgObj.height || 900;

                    // 이 층에 출력 범위가 정해져 있으면 그 부분만 종이에 꽉 차게(없으면 아래 기본: 도면 전체)
                    const printCrop = getFloorPrintCrop(currentBldgId, floorCode, imgW, imgH);
                    if (printCrop) {
                        return renderFloorPrintCropCanvas(imgObj, imgW, imgH, printCrop, defects, currentBldgId, floorCode)
                            .toDataURL('image/png');
                    }
                    const canvas = document.createElement('canvas');

                    // Set canvas to A4 PORTRAIT dimensions, 2x for sharper print/PDF text&lines (cw = 1800, ch = 2540)
                    const cw = 1800;
                    const ch = 2540;
                    canvas.width = cw;
                    canvas.height = ch;
                    const ctx = canvas.getContext('2d');

                    // Pure white background
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, cw, ch);

                    const isHorizontal = imgW > imgH;

                    // 도면 이미지 + 결함번호 + 범례: 셋 다 도면 원본 픽셀 좌표계 안에서 함께 그려서,
                    // 가로형 도면을 세로 페이지에 맞추려고 돌리는 회전·축소 변환을 결함번호/범례도
                    // 도면과 한 덩어리로 그대로 받는다(제목 라벨과 동일, 화면에서 핀/범례가 도면에
                    // 붙어서 같이 움직이는 것과 동일한 원리) — 페이지 기준으로 따로 똑바로 세우지 않는다.
                    ctx.save();
                    if (isHorizontal) {
                        // Rotate horizontal drawing 90 degrees left to place it vertically filling the A4 portrait page
                        ctx.translate(cw / 2, ch / 2);
                        ctx.rotate(-Math.PI / 2);

                        const scale = Math.min(cw / imgH, ch / imgW);
                        ctx.scale(scale, scale);
                        ctx.translate(-imgW / 2, -imgH / 2);
                    } else {
                        // Vertical drawing: scale directly to fit portrait canvas while preserving exact aspect ratio
                        const scale = Math.min(cw / imgW, ch / imgH);
                        const drawX = (cw - imgW * scale) / 2;
                        const drawY = (ch - imgH * scale) / 2;

                        ctx.translate(drawX, drawY);
                        ctx.scale(scale, scale);
                    }
                    drawFloorDrawingImage(ctx, imgObj, imgW, imgH, getFloorDrawingDarken(currentBldgId, floorCode));
                    const prevStyleCtx = _mapStyleRenderContext;
                    _mapStyleRenderContext = { buildingId: currentBldgId, floorCode };
                    try {
                        renderDefectsGrouped(ctx, defects, drawPinSafe);
                    } finally {
                        _mapStyleRenderContext = prevStyleCtx;
                    }
                    drawMemosForReport(ctx, currentBldgId, floorCode, imgW, imgH);   // 「메모 출력」 켰을 때만
                    drawLocationMapLegend(ctx, imgW, imgH, false, 0, { floorCode });   // 그 층 도면의 범례
                    ctx.restore();

                    return canvas.toDataURL('image/png');
                };

                if (loadedImg && loadedImg.complete && loadedImg.naturalWidth > 0) {
                    return drawImageOnPureWhiteCanvas(loadedImg);
                } else if (floorDrawingSrc) {
                    const tempImg = new Image();
                    tempImg.src = floorDrawingSrc;
                    if (tempImg.complete && tempImg.naturalWidth > 0) {
                        return drawImageOnPureWhiteCanvas(tempImg);
                    }
                }
            }

            // 3. If NO registered floor drawing exists, return null
            return null;
        } catch (err) {
            console.error('Error rendering floor plan data URL:', err);
            return null;
        }
    }

    // --- 위치도 출력 범위 (2026-10-07) ---
    // 도면에 여백이 많으면 한글·PDF 위치도에서 결함 박스가 작게 나온다. 층마다 출력 범위를 정해 두면
    // 그 부분만 종이에 꽉 차게 넣는다. 범위가 없는 층은 예전 그대로(도면 전체). 계산은 js/shared/print-crop.js.
    // 저장: state.floorPrintCrops[건물_층] = { nx, ny, nw, nh }(도면 크기에 대한 비율) 또는 null(기본으로 되돌림).
    // 지울 때 키를 delete 하지 않고 null 을 넣는다 — 루트 문서는 merge 로 올려서, 지운 키는 서버에 그대로 남는다.
    function printCropApi() {
        return (window.BSA && window.BSA.printCrop) || null;
    }

    function getStoredFloorPrintCrop(buildingId, floorCode) {
        const map = state.floorPrintCrops;
        if (!map || typeof map !== 'object') return null;
        return map[getFloorMapStyleKey(buildingId, floorCode)] || null;
    }

    /** 이 층의 출력 범위(도면 이미지 좌표 { x, y, w, h }). 없거나 쓸 수 없으면 null. */
    function getFloorPrintCrop(buildingId, floorCode, imgW, imgH) {
        const api = printCropApi();
        if (!api) return null;
        return api.fromStored(getStoredFloorPrintCrop(buildingId, floorCode), imgW, imgH);
    }

    function setFloorPrintCrop(buildingId, floorCode, crop, imgW, imgH) {
        const api = printCropApi();
        if (!api || !buildingId || !floorCode) return null;
        if (!state.floorPrintCrops || typeof state.floorPrintCrops !== 'object') state.floorPrintCrops = {};
        const stored = crop ? api.toStored(crop, imgW, imgH) : null;
        state.floorPrintCrops[getFloorMapStyleKey(buildingId, floorCode)] = stored;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        return stored;
    }

    // --- 2026-10-19 비파괴 위치도 출력 범위 ---
    // 결함 위치도와 따로 정한다. 같은 저장소(state.floorPrintCrops)에 '건물_층#ndt' 키로 넣어 회사 설정 칸별 병합·동기화
    // 길을 그대로 탄다(새 서버 칸·규칙 변경 없음). 비율은 비파괴 탭 도면(전용 도면이 있으면 그 도면) 크기 기준.
    const NDT_PRINT_CROP_SUFFIX = '#ndt';
    function ndtPrintCropKey(buildingId, floorCode) {
        return getFloorMapStyleKey(buildingId, floorCode) + NDT_PRINT_CROP_SUFFIX;
    }

    function getNdtPrintCrop(buildingId, floorCode, imgW, imgH) {
        const api = printCropApi();
        const map = state.floorPrintCrops;
        if (!api || !map || typeof map !== 'object') return null;
        return api.fromStored(map[ndtPrintCropKey(buildingId, floorCode)] || null, imgW, imgH);
    }

    function setNdtPrintCrop(buildingId, floorCode, crop, imgW, imgH) {
        const api = printCropApi();
        if (!api || !buildingId || !floorCode) return null;
        if (!state.floorPrintCrops || typeof state.floorPrintCrops !== 'object') state.floorPrintCrops = {};
        const stored = crop ? api.toStored(crop, imgW, imgH) : null;
        state.floorPrintCrops[ndtPrintCropKey(buildingId, floorCode)] = stored;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        return stored;
    }

    /** 이 층에 비파괴 출력 범위가 정해져 있으면 버튼에 표시 */
    let _ndtPrintCropBtnState = null;
    function updateNdtPrintCropButtons() {
        const map = state.floorPrintCrops;
        const on = !!(map && typeof map === 'object' && map[ndtPrintCropKey(state.currentBuildingId, state.currentFloor)]);
        if (_ndtPrintCropBtnState === on) return;
        _ndtPrintCropBtnState = on;
        ['btnOpenNdtPrintCropModal', 'ndtRailBtnPrintCrop', 'mobileNdtBtnPrintCrop'].forEach((id) => {
            const b = document.getElementById(id);
            if (b) b.classList.toggle('is-set', on);
        });
    }

    /** 범위 안에 그릴 범례의 크기(범위 좌표). 범례 항목이 없으면 null. */
    function measureLegendForPrintCrop(crop, floorCode) {
        const items = getLocationMapLegendDrawItems(floorCode);
        if (!items.length || !crop) return null;
        const scale = resolveLocationMapLegendDrawScale(state.locationMapLegendBox || {}, crop.w, crop.h);
        const dims = measureLocationMapLegendTable(document.createElement('canvas').getContext('2d'), items, scale);
        return { boxW: dims.boxW, boxH: dims.boxH, margin: 16 * scale };
    }

    /**
     * 범위 안에 범례를 다시 놓기 위한 임시 박스(저장된 범례 박스는 건드리지 않는다).
     * crop.lc(구석)가 있으면 그 구석에, 없으면 도면 전체에서의 상대 위치를 범위 안에서도 그대로.
     */
    function legendBoxForPrintCrop(imgW, imgH, crop, floorCode) {
        const box = Object.assign({}, state.locationMapLegendBox || {});
        if (box.nx == null && box.x !== undefined && imgW > 0) box.nx = box.x / imgW;
        if (box.ny == null && box.y !== undefined && imgH > 0) box.ny = box.y / imgH;
        if (crop && crop.lc) {
            const d = measureLegendForPrintCrop(crop, floorCode);
            if (d) {
                const o = printCropApi().cornerOrigin(crop.lc, crop.w, crop.h, d.boxW, d.boxH, d.margin);
                box.nx = o.x / crop.w;
                box.ny = o.y / crop.h;
            }
        }
        return box;
    }

    /**
     * 범례가 도면 내용을 가리지 않는 구석을 고른다(지금 범례가 있던 쪽 구석부터 본다).
     * 네 구석이 다 막혀 있으면 범위를 위나 아래로 조금 늘려 범례 자리를 만든다. crop 을 고쳐서 돌려준다.
     * small: 범례 없이 도면+마킹만 그린 작은 그림의 픽셀(data, w, h).
     */
    function placeLegendInPrintCrop(crop, imgW, imgH, small) {
        const api = printCropApi();
        const d = measureLegendForPrintCrop(crop);
        if (!api || !d) return crop;
        const sx = small.w / imgW;
        const sy = small.h / imgH;
        const base = legendBoxForPrintCrop(imgW, imgH, null);
        const wantRight = Number(base.nx) > 0.5;
        const wantBottom = Number(base.ny) > 0.5;
        const order = api.CORNERS.slice().sort((a, b) => {
            const miss = (c) => ((c[1] === 'r') !== wantRight ? 1 : 0) + ((c[0] === 'b') !== wantBottom ? 1 : 0);
            return miss(a) - miss(b);
        });
        const inkAt = (corner) => {
            const o = api.cornerOrigin(corner, crop.w, crop.h, d.boxW, d.boxH, d.margin);
            return api.inkCount(small.data, small.w, small.h, {
                x: (crop.x + o.x) * sx, y: (crop.y + o.y) * sy, w: d.boxW * sx, h: d.boxH * sy
            });
        };
        const free = order.find((c) => inkAt(c) === 0);
        if (free) return Object.assign({}, crop, { lc: free });
        // 빈 구석이 없다 — 가장 원하던 구석 쪽으로 범례 높이만큼 범위를 늘린다(늘린 띠는 내용 바깥이라 비어 있다)
        const corner = order[0];
        const grow = d.boxH + d.margin * 2;
        const top = corner[0] === 't';
        const y1 = top ? Math.max(0, crop.y - grow) : crop.y;
        const y2 = top ? crop.y + crop.h : Math.min(imgH, crop.y + crop.h + grow);
        return { x: crop.x, y: y1, w: crop.w, h: y2 - y1, lc: corner };
    }

    function drawFloorDefectsForReport(ctx, defects, buildingId, floorCode) {
        const prevStyleCtx = _mapStyleRenderContext;
        _mapStyleRenderContext = { buildingId, floorCode };
        try {
            renderDefectsGrouped(ctx, defects, drawPinSafe);
        } finally {
            _mapStyleRenderContext = prevStyleCtx;
        }
    }

    /** 출력 범위만 그린 그림(여백 없이 범위 비율 그대로, 가로로 긴 범위는 왼쪽으로 90° 돌려 세움) */
    function renderFloorPrintCropCanvas(imgObj, imgW, imgH, crop, defects, buildingId, floorCode) {
        const fit = printCropApi().fitCrop(crop.w, crop.h, 1800, 2540);
        const canvas = document.createElement('canvas');
        canvas.width = fit.canvasW;
        canvas.height = fit.canvasH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        if (fit.rotate) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.scale(fit.scale, fit.scale);
            ctx.translate(-crop.w / 2, -crop.h / 2);
        } else {
            ctx.scale(fit.scale, fit.scale);
        }
        ctx.translate(-crop.x, -crop.y);
        ctx.beginPath();
        ctx.rect(crop.x, crop.y, crop.w, crop.h);
        ctx.clip();
        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, getFloorDrawingDarken(buildingId, floorCode));
        drawFloorDefectsForReport(ctx, defects, buildingId, floorCode);
        drawMemosForReport(ctx, buildingId, floorCode, imgW, imgH);   // 「메모 출력」 켰을 때만
        // 범례는 범위 안의 같은 구석에 — 도면 구석에 그대로 두면 범위 밖이라 잘려 나간다
        ctx.translate(crop.x, crop.y);
        drawLocationMapLegend(ctx, crop.w, crop.h, false, 0, { box: legendBoxForPrintCrop(imgW, imgH, crop, floorCode), floorCode });
        ctx.restore();
        return canvas;
    }

    /** 지금 보고 있는 층의 도면 그림(다 불러온 것). 없으면 null. */
    function getCurrentFloorDrawingImage() {
        const bId = state.currentBuildingId;
        const fc = state.currentFloor;
        if (!bId || !fc) return null;
        const usable = (img) => !!(img && img.complete && img.naturalWidth > 0);
        const cached = state.floorImageCache ? state.floorImageCache[`${bId}_${fc}`] : null;
        if (usable(cached)) return cached;
        if (usable(state.bgImage)) return state.bgImage;
        return null;
    }

    /** 도면 + 결함 마킹을 도면 방향 그대로 작게 그린다(범위 정하기 미리보기·자동 맞춤 계산용). 범례는 안 그린다. */
    function renderFloorPreviewCanvas(imgObj, maxSide) {
        const imgW = imgObj.naturalWidth;
        const imgH = imgObj.naturalHeight;
        const k = Math.min(1, maxSide / Math.max(imgW, imgH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imgW * k));
        canvas.height = Math.max(1, Math.round(imgH * k));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(canvas.width / imgW, canvas.height / imgH);
        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, getFloorDrawingDarken(state.currentBuildingId, state.currentFloor));
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const defects = filterMapPlacedDefects(state.defects[key] || getCurrentFloorDefects() || []);
        drawFloorDefectsForReport(ctx, defects, state.currentBuildingId, state.currentFloor);
        ctx.restore();
        return canvas;
    }

    /**
     * 자동 맞춤 — 도면 내용(제목·치수선 포함)과 결함 마킹이 모두 들어가는 가장 작은 범위에 여유를 둔다.
     * 도면 가장자리의 테두리선은 내용으로 치지 않는다. 계산할 수 없으면 null.
     */
    function computeAutoPrintCrop(imgObj) {
        const api = printCropApi();
        if (!api || !imgObj) return null;
        const imgW = imgObj.naturalWidth;
        const imgH = imgObj.naturalHeight;
        const small = renderFloorPreviewCanvas(imgObj, 900);
        let data;
        try {
            data = small.getContext('2d').getImageData(0, 0, small.width, small.height).data;
        } catch (e) {
            console.warn('[출력 범위] 도면 픽셀을 읽을 수 없어 자동 맞춤을 못 함:', e);
            return null;
        }
        const ink = api.inkBounds(data, small.width, small.height);
        if (!ink) return null;
        const rect = api.scaleRect(ink, imgW / small.width, imgH / small.height);
        const padded = api.padRect(rect, Math.max(imgW, imgH) * 0.012, imgW, imgH);
        const crop = api.normalizeCrop(padded, imgW, imgH);
        if (!crop) return null;
        // 여백을 자르면 범례가 도면 내용 위에 올라갈 수 있다 — 안 가리는 구석으로
        return api.normalizeCrop(placeLegendInPrintCrop(crop, imgW, imgH, { data, w: small.width, h: small.height }), imgW, imgH) || crop;
    }

    /** 범위를 정했을 때 종이에서 몇 배로 커지는가(도면 전체를 넣을 때 대비) */
    function printCropMagnification(crop, imgW, imgH) {
        const api = printCropApi();
        if (!api || !crop) return 1;
        // 도면 전체는 가로형이면 무조건 돌려 세운다(renderFloorPlanCanvasDataUrl 기본 경로와 같은 식)
        const full = imgW > imgH ? Math.min(1800 / imgH, 2540 / imgW) : Math.min(1800 / imgW, 2540 / imgH);
        const cropped = api.fitCrop(crop.w, crop.h, 1800, 2540).scale;
        return full > 0 ? cropped / full : 1;
    }

    /** 「출력 범위」 창 — 미리보기에서 사각형을 끌어 정한다. 화면의 도면 조작 코드와 따로 돈다. */
    function openPrintCropModal(modeArg) {
        // 'ndt' = 비파괴 위치도(2026-10-19). 버튼 click 은 Event 를 넘기므로 문자열일 때만.
        const isNdt = modeArg === 'ndt';
        const api = printCropApi();
        const imgObj = isNdt ? getCurrentNdtDrawingImage() : getCurrentFloorDrawingImage();
        if (!api || !state.currentBuildingId || !state.currentFloor) {
            window.showToast('건축물과 층을 먼저 선택해 주세요.', 'warning');
            return;
        }
        if (!imgObj) {
            window.showToast('이 층에 등록된 도면이 없습니다.', 'warning');
            return;
        }
        const bId = state.currentBuildingId;
        const fc = state.currentFloor;
        const imgW = imgObj.naturalWidth;
        const imgH = imgObj.naturalHeight;

        const old = document.getElementById('printCropModal');
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.id = 'printCropModal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:12px;';
        overlay.innerHTML = `
            <div style="background:#fff;color:#0f172a;border-radius:12px;max-width:96vw;max-height:96vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,0.3);overflow:hidden;">
                <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;">
                    <strong style="font-size:1rem;"><i class="fa-solid fa-crop-simple"></i> ${isNdt ? '비파괴 조사 위치도 출력 범위' : '위치도 출력 범위'}</strong>
                    <span data-role="info" style="font-size:0.82rem;color:#475569;"></span>
                </div>
                <div style="padding:10px 16px 0;font-size:0.8rem;color:#64748b;line-height:1.5;">
                    한글·PDF ${isNdt ? '비파괴 조사 ' : ''}위치도에 넣을 부분을 정합니다. 모서리를 끌어 크기를 바꾸고, 안쪽을 끌어 옮기고, 바깥에서 끌면 새로 그립니다.
                    범위를 정하지 않으면 지금처럼 도면 전체가 나옵니다.
                </div>
                <div style="padding:10px 16px;overflow:auto;display:flex;justify-content:center;">
                    <canvas data-role="canvas" style="border:1px solid #cbd5e1;touch-action:none;cursor:crosshair;max-width:100%;"></canvas>
                </div>
                <div style="padding:10px 16px 14px;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">
                    <button type="button" class="btn btn-sm" data-role="auto"><i class="fa-solid fa-wand-magic-sparkles"></i> 자동 맞춤</button>
                    <button type="button" class="btn btn-sm" data-role="legend" ${isNdt ? 'hidden' : ''} title="범위 안에서 범례를 놓을 구석을 바꿉니다"><i class="fa-solid fa-list"></i> 범례 자리 바꾸기</button>
                    <button type="button" class="btn btn-sm" data-role="reset">도면 전체(기본)</button>
                    <span style="flex:1;"></span>
                    <button type="button" class="btn btn-sm" data-role="cancel">취소</button>
                    <button type="button" class="btn btn-sm btn-primary" data-role="save">저장</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const canvas = overlay.querySelector('[data-role="canvas"]');
        const infoEl = overlay.querySelector('[data-role="info"]');
        const maxW = Math.max(240, Math.min(window.innerWidth - 80, 1100));
        const maxH = Math.max(200, window.innerHeight - 260);
        const base = isNdt ? renderNdtPreviewCanvas(imgObj, 1400) : renderFloorPreviewCanvas(imgObj, 1400);
        const view = Math.min(maxW / imgW, maxH / imgH);          // 도면 좌표 → 미리보기 좌표
        canvas.width = Math.max(1, Math.round(imgW * view));
        canvas.height = Math.max(1, Math.round(imgH * view));
        const ctx = canvas.getContext('2d');

        let crop = isNdt ? getNdtPrintCrop(bId, fc, imgW, imgH) : getFloorPrintCrop(bId, fc, imgW, imgH);        // 도면 좌표. null = 도면 전체
        let drag = null;

        const paint = () => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.scale(view, view);
            if (crop) {
                // 범위 밖을 어둡게
                ctx.fillStyle = 'rgba(15,23,42,0.45)';
                ctx.beginPath();
                ctx.rect(0, 0, imgW, imgH);
                ctx.rect(crop.x, crop.y, crop.w, crop.h);
                ctx.fill('evenodd');
                if (!isNdt) {   // 비파괴 위치도에는 범례가 없다
                    ctx.save();
                    ctx.translate(crop.x, crop.y);
                    drawLocationMapLegend(ctx, crop.w, crop.h, false, 0, { box: legendBoxForPrintCrop(imgW, imgH, crop) });
                    ctx.restore();
                }
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2 / view;
                ctx.setLineDash([8 / view, 5 / view]);
                ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
                ctx.setLineDash([]);
                const hs = 6 / view;
                ctx.fillStyle = '#2563eb';
                [[crop.x, crop.y], [crop.x + crop.w, crop.y], [crop.x, crop.y + crop.h], [crop.x + crop.w, crop.y + crop.h]]
                    .forEach(([hx, hy]) => ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2));
            } else if (!isNdt) {
                drawLocationMapLegend(ctx, imgW, imgH, false, 0, { box: legendBoxForPrintCrop(imgW, imgH, null) });
            }
            ctx.restore();
            if (crop) {
                const mag = printCropMagnification(crop, imgW, imgH);
                infoEl.textContent = `범위 지정됨 — 종이에서 약 ${mag.toFixed(mag >= 1.95 ? 1 : 2)}배 크게 나옵니다`;
            } else {
                infoEl.textContent = '도면 전체(기본)';
            }
        };

        const toImg = (e) => {
            const r = canvas.getBoundingClientRect();
            const sx = canvas.width / (r.width || canvas.width);
            const sy = canvas.height / (r.height || canvas.height);
            return {
                x: Math.max(0, Math.min(imgW, ((e.clientX - r.left) * sx) / view)),
                y: Math.max(0, Math.min(imgH, ((e.clientY - r.top) * sy) / view))
            };
        };
        const hitCorner = (p) => {
            if (!crop) return null;
            const tol = 12 / view;
            const corners = {
                nw: [crop.x, crop.y], ne: [crop.x + crop.w, crop.y],
                sw: [crop.x, crop.y + crop.h], se: [crop.x + crop.w, crop.y + crop.h]
            };
            return Object.keys(corners).find((k) => Math.abs(p.x - corners[k][0]) <= tol && Math.abs(p.y - corners[k][1]) <= tol) || null;
        };
        const inside = (p) => !!crop && p.x >= crop.x && p.x <= crop.x + crop.w && p.y >= crop.y && p.y <= crop.y + crop.h;

        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            const p = toImg(e);
            const corner = hitCorner(p);
            if (corner) {
                // 잡은 모서리의 맞은편을 고정점으로
                const ax = corner.indexOf('w') >= 0 ? crop.x + crop.w : crop.x;
                const ay = corner.indexOf('n') >= 0 ? crop.y + crop.h : crop.y;
                drag = { mode: 'resize', ax, ay };
            } else if (inside(p)) {
                drag = { mode: 'move', dx: p.x - crop.x, dy: p.y - crop.y };
            } else {
                drag = { mode: 'resize', ax: p.x, ay: p.y };
            }
            try { canvas.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
        });
        canvas.addEventListener('pointermove', (e) => {
            const p = toImg(e);
            if (!drag) {
                canvas.style.cursor = hitCorner(p) ? 'nwse-resize' : (inside(p) ? 'move' : 'crosshair');
                return;
            }
            const lc = crop && crop.lc;   // 범례 구석은 범위를 고쳐도 그대로
            if (drag.mode === 'move') {
                crop = {
                    x: Math.max(0, Math.min(imgW - crop.w, p.x - drag.dx)),
                    y: Math.max(0, Math.min(imgH - crop.h, p.y - drag.dy)),
                    w: crop.w,
                    h: crop.h
                };
            } else {
                crop = {
                    x: Math.min(drag.ax, p.x), y: Math.min(drag.ay, p.y),
                    w: Math.abs(p.x - drag.ax), h: Math.abs(p.y - drag.ay)
                };
            }
            if (lc) crop.lc = lc;
            paint();
        });
        const endDrag = () => {
            if (!drag) return;
            drag = null;
            // 너무 작게 그렸거나 도면 전체와 같으면 기본으로
            crop = api.normalizeCrop(crop, imgW, imgH);
            paint();
        };
        canvas.addEventListener('pointerup', endDrag);
        canvas.addEventListener('pointercancel', endDrag);

        const close = () => {
            document.removeEventListener('keydown', onKey, true);
            overlay.remove();
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            close();
        };
        document.addEventListener('keydown', onKey, true);
        // 이 창 안의 클릭이 뒤의 도면·결함 창 닫기 처리로 새지 않게
        ['pointerdown', 'mousedown', 'click', 'touchstart'].forEach((type) => {
            overlay.addEventListener(type, (e) => e.stopPropagation());
        });

        overlay.querySelector('[data-role="auto"]').addEventListener('click', () => {
            const auto = isNdt ? computeAutoNdtPrintCrop(imgObj) : computeAutoPrintCrop(imgObj);
            if (!auto) {
                window.showToast('이 도면은 자를 여백을 찾지 못했습니다. 사각형을 직접 그려 주세요.', 'info', 4000);
                return;
            }
            crop = auto;
            paint();
        });
        overlay.querySelector('[data-role="legend"]').addEventListener('click', () => {
            if (!crop) {
                window.showToast('범위를 먼저 정해 주세요. 도면 전체일 때 범례는 도면 화면에서 끌어 옮깁니다.', 'info', 4000);
                return;
            }
            const order = api.CORNERS;
            crop.lc = order[(order.indexOf(crop.lc) + 1) % order.length];
            paint();
        });
        overlay.querySelector('[data-role="reset"]').addEventListener('click', () => {
            crop = null;
            paint();
        });
        overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
        overlay.querySelector('[data-role="save"]').addEventListener('click', () => {
            const norm = crop ? api.normalizeCrop(crop, imgW, imgH) : null;
            if (isNdt) setNdtPrintCrop(bId, fc, norm, imgW, imgH);
            else setFloorPrintCrop(bId, fc, norm, imgW, imgH);
            close();
            if (isNdt) {
                updateNdtPrintCropButtons();
                if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            } else if (typeof drawCanvas === 'function') drawCanvas();
            const what = isNdt ? '비파괴 조사 위치도' : '위치도';
            window.showToast(norm
                ? `${stripFloorCodeSuffix(window.getFloorLabelFromCode(fc))} ${what} 출력 범위를 저장했습니다.`
                : `${stripFloorCodeSuffix(window.getFloorLabelFromCode(fc))} ${what}는 도면 전체로 출력합니다.`, 'success', 3500);
        });

        paint();
    }
    window.openPrintCropModal = openPrintCropModal;

    ['btnOpenPrintCropModal', 'mobileBtnPrintCrop'].forEach((btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', openPrintCropModal);
    });

    // 2026-10-19 비파괴 탭 「출력 범위」 단추 — PC 도구줄·PC 오른쪽 레일·모바일 아래 단추줄(index.html은 손으로 안 고친다)
    function openNdtPrintCropModal() { openPrintCropModal('ndt'); }
    window.openNdtPrintCropModal = openNdtPrintCropModal;
    (function installNdtPrintCropButtons() {
        const title = '비파괴 조사 위치도 출력 범위 — 한글·PDF 비파괴 위치도에 넣을 부분을 정합니다(정하지 않으면 도면 전체)';
        const pdfChip = document.querySelector('#tab-ndt .ndt-top-canvas-tools .filter-group [onclick*="exportCurrentFloorNdtVectorPdf"]');
        if (pdfChip && !document.getElementById('btnOpenNdtPrintCropModal')) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.id = 'btnOpenNdtPrintCropModal';
            chip.className = 'chip';
            chip.title = title;
            chip.innerHTML = '<i class="fa-solid fa-crop-simple"></i> 출력 범위';
            pdfChip.parentNode.insertBefore(chip, pdfChip.nextSibling);
            chip.addEventListener('click', openNdtPrintCropModal);
        }
        const railPdf = document.getElementById('ndtRailBtnVectorPdf');
        if (railPdf && !document.getElementById('ndtRailBtnPrintCrop')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = 'ndtRailBtnPrintCrop';
            b.className = railPdf.className;
            b.title = title;
            b.innerHTML = '<i class="fa-solid fa-crop-simple"></i><span>출력범위</span>';
            railPdf.parentNode.insertBefore(b, railPdf.nextSibling);
            b.addEventListener('click', openNdtPrintCropModal);
        }
        const fit = document.getElementById('mobileNdtBtnZoomFit');
        if (fit && !document.getElementById('mobileNdtBtnPrintCrop')) {
            const b = document.createElement('button');
            b.type = 'button';
            b.id = 'mobileNdtBtnPrintCrop';
            b.className = 'mobile-fab-btn';
            b.title = title;
            b.innerHTML = '<i class="fa-solid fa-crop-simple"></i><span>출력범위</span>';
            fit.parentNode.insertBefore(b, fit);
            b.addEventListener('click', openNdtPrintCropModal);
        }
    })();

    /**
     * PDF 보고서용 균열 게이지·팁 페이지. 도면에 찍은 게이지 마킹과 예전 균열 결함 연결 기록을
     * 모두 모아(한글 내보내기와 같은 수집 함수) 점검 종류와 무관하게 낸다. 기록이 없으면 ''.
     */
    function buildReportCrackMonitorPagesHtml(bldg, bldgId, reportTitleHeader, compName) {
        if (!bldg || !bldgId) return '';
        const labelOf = (fc) => stripFloorCodeSuffix(window.getFloorLabelFromCode(fc));
        const floorsData = buildHwpxCrackMonitorFloorsData(bldg, bldgId);
        const { items } = collectHwpxCrackMonitorExportItems(bldg, bldgId, floorsData, labelOf);
        if (!items.length) return '';
        const esc = (v) => escapeSurveyAttr(v == null ? '' : String(v));
        const pageOpen = `
                        <div class="report-page-block" style="background:#ffffff; color:#0f172a; padding: 10mm 14mm 10mm 14mm; margin-bottom: 2rem; font-family: sans-serif; font-size:0.9rem; border-radius:4px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); page-break-after: always; break-after: page; page-break-inside: avoid !important; break-inside: avoid !important; box-sizing: border-box; width: 210mm; height: 295mm; max-height: 295mm; overflow: hidden; display: flex; flex-direction: column; position: relative;">
                            <div style="text-align:center; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.3rem; margin-bottom: 0.6rem;">
                                <h1 style="font-size:0.75rem; font-weight:700; color:#000000; margin:0;">${reportTitleHeader}</h1>
                            </div>`;
        const pageClose = `
                            <div style="margin-top: auto; padding-top: 0.6rem; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #475569;">
                                <span>🏢 점검수행기관: <strong style="color: #1f1f1f; font-weight: 800;">${compName}</strong></span>
                                <span>📄 스마트 건축물 안전점검 시스템</span>
                            </div>
                        </div>`;
        const th = 'border:1px solid #334155; padding:3px 4px; background:#f1f5f9; font-weight:700; font-size:0.72rem;';
        const td = 'border:1px solid #334155; padding:3px 4px; font-size:0.72rem; text-align:center; word-break:keep-all;';
        const placeOf = (it) => {
            const d = it.defect || {};
            return `${it.floorLabel || ''} ${memberNameOut(d.component) || ''} ${d.locationDetail || ''}`.replace(/\s+/g, ' ').trim() || '-';
        };
        const noOf = (it) => (it.gauge && it.gauge.gaugeNo) || (it.defect && it.defect.no) || '-';
        const rows = [];
        items.forEach((it) => {
            const place = placeOf(it);
            if (it.hasGauge) {
                const g = it.gauge;
                const lastIdx = g.readings.length - 1;
                const last = lastIdx >= 0 ? g.readings[lastIdx] : null;
                const cum = last ? computeGaugeDeltas(g, last) : { dx: null, dy: null };
                const prevD = lastIdx > 0 ? computeGaugePrevDeltas(g, lastIdx) : { dx: null, dy: null };
                rows.push([
                    noOf(it), place, '게이지',
                    `${g.initialX || '-'} / ${g.initialY || '-'}`,
                    last ? (formatHwpxCrackMonitorDate(last.date) || last.roundKey || '-') : '-',
                    last ? `${last.xMm || '-'} / ${last.yMm || '-'}` : '-',
                    `${formatGaugeDelta('x', cum.dx, g)} / ${formatGaugeDelta('y', cum.dy, g)}`,
                    `${formatGaugeDelta('x', prevD.dx, g)} / ${formatGaugeDelta('y', prevD.dy, g)}`
                ]);
            }
            if (it.hasTip) {
                const t = it.tip;
                const lastIdx = t.readings.length - 1;
                const last = lastIdx >= 0 ? t.readings[lastIdx] : null;
                rows.push([
                    noOf(it), place, '균열팁',
                    t.initialLengthMm || '-',
                    last ? (formatHwpxCrackMonitorDate(last.date) || last.roundKey || '-') : '-',
                    last ? (last.lengthMm || '-') : '-',
                    last ? formatMonitorDelta(computeTipCumulative(t, lastIdx)) : '-',
                    lastIdx > 0 ? formatMonitorDelta(computeTipPrevDelta(t, lastIdx)) : '-'
                ]);
            }
        });
        const ROWS_PER_PAGE = 24;
        let html = '';
        const tablePages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
        for (let p = 0; p < tablePages; p += 1) {
            const slice = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
            const note = tablePages > 1 ? ` (${p + 1}/${tablePages})` : '';
            html += `${pageOpen}
                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">균열 게이지·팁 누적 측정 결과${note}</h2>
                            <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
                                <thead><tr>
                                    <th style="${th} width:9%;">No.</th><th style="${th} width:25%;">위치</th><th style="${th} width:8%;">구분</th>
                                    <th style="${th} width:12%;">초기값</th><th style="${th} width:11%;">최근 측정일</th>
                                    <th style="${th} width:12%;">최근 측정값</th><th style="${th} width:12%;">누적 (초기 대비)</th><th style="${th} width:11%;">전차 대비</th>
                                </tr></thead>
                                <tbody>${slice.map((r) => `<tr>${r.map((c) => `<td style="${td}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
                            </table>
                            <p style="font-size:0.68rem; color:#475569; margin-top:0.4rem;">※ 게이지는 X / Y(mm), 균열팁은 길이(mm). 누적 = 최근 측정 − 초기값, 전차 대비 = 최근 측정 − 직전 측정.</p>
                            ${pageClose}`;
        }
        // 비교 사진 (전차 / 현차) — 사진이 있는 항목만, 한 페이지 3건
        const photoItems = [];
        items.forEach((it) => {
            [[it.hasGauge ? it.gauge : null, '게이지'], [it.hasTip ? it.tip : null, '균열팁']].forEach(([log, kindLabel]) => {
                if (!log || (!log.prevPhoto && !log.currPhoto)) return;
                const labels = getCrackMonitorItemRoundLabels(it, bldg);
                photoItems.push({
                    title: `${noOf(it)} ${kindLabel} · ${placeOf(it)}`,
                    prev: log.prevPhoto || '',
                    curr: log.currPhoto || '',
                    prevLabel: labels.prev || '전차',
                    currLabel: labels.curr || '현차'
                });
            });
        });
        const PHOTOS_PER_PAGE = 3;
        const photoCell = (src, label) => `
                                        <div style="flex:1; display:flex; flex-direction:column; border:1px solid #334155;">
                                            <div style="height:62mm; display:flex; align-items:center; justify-content:center; background:#ffffff; overflow:hidden;">
                                                ${src ? `<img src="${esc(src)}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;">` : '<span style="color:#94a3b8; font-size:0.75rem;">사진 없음</span>'}
                                            </div>
                                            <div style="border-top:1px solid #334155; text-align:center; font-size:0.72rem; padding:2px;">${esc(label)}</div>
                                        </div>`;
        for (let p = 0; p * PHOTOS_PER_PAGE < photoItems.length; p += 1) {
            const slice = photoItems.slice(p * PHOTOS_PER_PAGE, (p + 1) * PHOTOS_PER_PAGE);
            html += `${pageOpen}
                            <h2 style="font-size:1.02rem; font-weight:800; color:#0f172a; border-left: 4px solid #2a2a2a; padding-left: 0.5rem; margin-bottom: 0.5rem;">균열 게이지·팁 비교 사진 (전차 / 현차)</h2>
                            ${slice.map((ph) => `
                                <div style="margin-bottom:0.5rem;">
                                    <div style="font-size:0.78rem; font-weight:700; margin-bottom:2px;">${esc(ph.title)}</div>
                                    <div style="display:flex; gap:4mm;">${photoCell(ph.prev, ph.prevLabel)}${photoCell(ph.curr, ph.currLabel)}</div>
                                </div>`).join('')}
                            ${pageClose}`;
        }
        return html;
    }

    function renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter = null) {
        try {
            const bldg = hwpxRenderBuilding();
            const currentBldgId = bldg.id || state.currentBuildingId || 'default';
            const key = `${currentBldgId}_${floorCode}`;
            let ndtItems = (state.ndtData ? (state.ndtData[key] || []) : []).filter((item) => !isCrackGaugeNdtItem(item));
            let displacementGroups = state.ndtDisplacementGroups ? (state.ndtDisplacementGroups[key] || []) : [];
            // 균열게이지 위치도(2026-10-28): 화면 「균열모니터」 탭과 같게 — 예전 방식(균열 결함에 연결) 게이지는 그 결함 핀으로
            let pinDefects = [];

            if (categoryFilter) {
                if (categoryFilter === '균열모니터') {
                    ndtItems = (state.ndtData ? (state.ndtData[key] || []) : []).filter(isCrackGaugeNdtItem);
                    displacementGroups = [];
                    const floorDefects = (state.defects && state.defects[key]) || [];
                    pinDefects = filterMapPlacedDefects(floorDefects).filter(isLegacyCrackMonitorDefect);
                } else if (categoryFilter === '기울기') {
                    ndtItems = ndtItems.filter(item => item.category === '기울기');
                    displacementGroups = [];
                } else if (categoryFilter === '변위') {
                    ndtItems = [];
                    displacementGroups = displacementGroups.filter(g => !g.category || g.category === '변위');
                } else if (categoryFilter === '부재변위') {
                    ndtItems = [];
                    displacementGroups = displacementGroups.filter(g => g.category === '부재변위');
                } else if (categoryFilter === '실측') {
                    ndtItems = ndtItems.filter(item => item.category === '실측');
                    displacementGroups = [];
                } else if (categoryFilter === '내화피복') {
                    ndtItems = ndtItems.filter(item => item.category === '내화피복');
                    displacementGroups = [];
                } else if (categoryFilter === '일반비파괴') {
                    ndtItems = ndtItems.filter(item => ['강도', '탄산화'].includes(item.category));
                    displacementGroups = [];
                }
            }

            // 전용 도면이 있는 층은 그 그림만 쓴다(층 그림 캐시가 있어도) — 비동기 쪽이 미리 읽어 둔다
            const customSrc = currentNdtCustomDrawingSrc(key);
            const customEntry = customSrc && state.ndtCustomImageCache && state.ndtCustomImageCache[key];
            let loadedImg = customSrc
                ? ((customEntry && customEntry.src === customSrc) ? customEntry.img : null)
                : (state.floorImageCache ? state.floorImageCache[`${currentBldgId}_${floorCode}`] : null);
            let floorDrawingSrc = getNdtFloorDrawingSrc(bldg, floorCode);
            // 도면 진하게는 층 도면에만 — 비파괴 전용 도면은 따로 올린 그림이라 그대로 둔다
            const ndtDarken = customSrc ? 0 : getFloorDrawingDarken(currentBldgId, floorCode);

            if (loadedImg || floorDrawingSrc) {
                const drawImageOnPureWhiteCanvas = (imgObj) => {
                    const canvas = document.createElement('canvas');
                    const imgW = imgObj.naturalWidth || imgObj.width || 1400;
                    const imgH = imgObj.naturalHeight || imgObj.height || 900;

                    // 2026-10-19 비파괴 위치도 출력 범위가 정해진 층은 그 부분만 종이에 꽉 차게(없으면 아래 기본: 도면 전체)
                    const ndtCrop = getNdtPrintCrop(currentBldgId, floorCode, imgW, imgH);
                    if (ndtCrop) {
                        return renderNdtPrintCropCanvas(imgObj, imgW, imgH, ndtCrop, ndtItems, displacementGroups, ndtDarken, pinDefects)
                            .toDataURL('image/png');
                    }

                    const cw = 1800;
                    const ch = 2540;
                    canvas.width = cw;
                    canvas.height = ch;
                    const ctx = canvas.getContext('2d');

                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, cw, ch);

                    ctx.save();
                    const isHorizontal = imgW > imgH;

                    if (isHorizontal) {
                        ctx.translate(cw / 2, ch / 2);
                        ctx.rotate(-Math.PI / 2);
                        const scale = Math.min(cw / imgH, ch / imgW);
                        ctx.scale(scale, scale);
                        ctx.translate(-imgW / 2, -imgH / 2);

                        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, ndtDarken);
                        pinDefects.forEach(d => drawPin(ctx, d));
                        ndtItems.forEach(item => drawNdtPin(ctx, item, ndtItems));
                        displacementGroups.forEach(g => drawNdtDisplacementGroup(ctx, g));
                    } else {
                        const scale = Math.min(cw / imgW, ch / imgH);
                        const drawX = (cw - imgW * scale) / 2;
                        const drawY = (ch - imgH * scale) / 2;

                        ctx.translate(drawX, drawY);
                        ctx.scale(scale, scale);

                        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, ndtDarken);
                        pinDefects.forEach(d => drawPin(ctx, d));
                        ndtItems.forEach(item => drawNdtPin(ctx, item, ndtItems));
                        displacementGroups.forEach(g => drawNdtDisplacementGroup(ctx, g));
                    }
                    ctx.restore();

                    return canvas.toDataURL('image/png');
                };

                if (loadedImg && loadedImg.complete && loadedImg.naturalWidth > 0) {
                    return drawImageOnPureWhiteCanvas(loadedImg);
                } else if (floorDrawingSrc) {
                    const tempImg = new Image();
                    tempImg.src = floorDrawingSrc;
                    if (tempImg.complete && tempImg.naturalWidth > 0) {
                        return drawImageOnPureWhiteCanvas(tempImg);
                    }
                }
            }

            const ndtCanvasEl = document.getElementById('ndtCanvas');
            if (ndtCanvasEl && hwpxRenderIsScreenFloor(floorCode)) {
                try {
                    const cssW = window._ndtCanvasCssW || ndtCanvasEl.clientWidth || ndtCanvasEl.width;
                    const cssH = window._ndtCanvasCssH || ndtCanvasEl.clientHeight || ndtCanvasEl.height;
                    if ((window._ndtCanvasDpr || 1) > 1.05) {
                        const off = document.createElement('canvas');
                        off.width = cssW;
                        off.height = cssH;
                        off.getContext('2d').drawImage(ndtCanvasEl, 0, 0, cssW, cssH);
                        return off.toDataURL('image/jpeg', 0.88);
                    }
                    return ndtCanvasEl.toDataURL('image/jpeg', 0.88);
                } catch(e){}
            }
            return null;
        } catch (err) {
            console.error('Error rendering NDT floor plan data URL:', err);
            return null;
        }
    }

    /** 비파괴 위치도 — 출력 범위만 그린 그림(결함 위치도 renderFloorPrintCropCanvas와 같은 맞춤·회전, 범례 없음) */
    function renderNdtPrintCropCanvas(imgObj, imgW, imgH, crop, ndtItems, displacementGroups, darken, pinDefects) {
        const fit = printCropApi().fitCrop(crop.w, crop.h, 1800, 2540);
        const canvas = document.createElement('canvas');
        canvas.width = fit.canvasW;
        canvas.height = fit.canvasH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        if (fit.rotate) {
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.scale(fit.scale, fit.scale);
            ctx.translate(-crop.w / 2, -crop.h / 2);
        } else {
            ctx.scale(fit.scale, fit.scale);
        }
        ctx.translate(-crop.x, -crop.y);
        ctx.beginPath();
        ctx.rect(crop.x, crop.y, crop.w, crop.h);
        ctx.clip();
        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, darken);
        (pinDefects || []).forEach(d => drawPin(ctx, d));
        (ndtItems || []).forEach(item => drawNdtPin(ctx, item, ndtItems));
        (displacementGroups || []).forEach(g => drawNdtDisplacementGroup(ctx, g));
        ctx.restore();
        return canvas;
    }

    /** 지금 비파괴 탭에 띄운 도면(다 불러온 것). 없으면 null. */
    function getCurrentNdtDrawingImage() {
        const ok = (img) => !!(img && img.complete && img.naturalWidth > 0);
        return ok(ndtBgImage) ? ndtBgImage : null;
    }

    /** 비파괴 도면 + 이 층 비파괴 마킹 전부(항목 구분 없이)를 도면 방향 그대로 작게 — 범위 미리보기·자동 맞춤용 */
    function renderNdtPreviewCanvas(imgObj, maxSide) {
        const imgW = imgObj.naturalWidth;
        const imgH = imgObj.naturalHeight;
        const k = Math.min(1, maxSide / Math.max(imgW, imgH));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(imgW * k));
        canvas.height = Math.max(1, Math.round(imgH * k));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        const darken = currentNdtCustomDrawingSrc(key) ? 0 : getFloorDrawingDarken(state.currentBuildingId, state.currentFloor);
        ctx.save();
        ctx.scale(canvas.width / imgW, canvas.height / imgH);
        drawFloorDrawingImage(ctx, imgObj, imgW, imgH, darken);
        const items = ((state.ndtData && state.ndtData[key]) || []).filter((it) => it && !isCrackGaugeNdtItem(it));
        items.forEach((it) => drawNdtPin(ctx, it, items));
        ((state.ndtDisplacementGroups && state.ndtDisplacementGroups[key]) || []).forEach((g) => drawNdtDisplacementGroup(ctx, g));
        ctx.restore();
        return canvas;
    }

    /** 비파괴 자동 맞춤 — 도면 내용과 비파괴 마킹이 다 들어가는 가장 작은 범위 + 여유 */
    function computeAutoNdtPrintCrop(imgObj) {
        const api = printCropApi();
        if (!api || !imgObj) return null;
        const imgW = imgObj.naturalWidth;
        const imgH = imgObj.naturalHeight;
        const small = renderNdtPreviewCanvas(imgObj, 900);
        let data;
        try {
            data = small.getContext('2d').getImageData(0, 0, small.width, small.height).data;
        } catch (e) {
            console.warn('[비파괴 출력 범위] 도면 픽셀을 읽을 수 없어 자동 맞춤을 못 함:', e);
            return null;
        }
        const ink = api.inkBounds(data, small.width, small.height);
        if (!ink) return null;
        const rect = api.scaleRect(ink, imgW / small.width, imgH / small.height);
        const padded = api.padRect(rect, Math.max(imgW, imgH) * 0.012, imgW, imgH);
        return api.normalizeCrop(padded, imgW, imgH);
    }

    async function loadImageElementFromSrc(src) {
        try {
            const pack = await imageSrcToBytes(src);
            const blob = new Blob([pack.bytes], { type: pack.mime || 'image/jpeg' });
            const objUrl = URL.createObjectURL(blob);
            const img = await new Promise((resolve) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => resolve(null);
                el.src = objUrl;
            });
            URL.revokeObjectURL(objUrl);
            return img && img.naturalWidth > 0 ? img : null;
        } catch (_e) {
            return null;
        }
    }

    async function renderNdtFloorPlanCanvasDataUrlAsync(floorCode, categoryFilter) {
        // 전용 도면(다른 층이거나 새로고침 뒤라 아직 안 읽힌 것 포함)을 먼저 받아 그림으로 만들어 둔다
        const bldgForKey = hwpxRenderBuilding();
        const customKey = `${bldgForKey.id || state.currentBuildingId || 'default'}_${floorCode}`;
        const customUrl = await ensureNdtCustomDrawingLoaded(customKey);
        if (customUrl) {
            const entry = state.ndtCustomImageCache && state.ndtCustomImageCache[customKey];
            if (!entry || entry.src !== customUrl) {
                const img = await loadImageElementFromSrc(customUrl);
                if (img) {
                    if (!state.ndtCustomImageCache) state.ndtCustomImageCache = {};
                    state.ndtCustomImageCache[customKey] = { src: customUrl, img };
                }
            }
        }
        const ready = renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter);
        if (ready) return ready;
        try {
            const bldg = hwpxRenderBuilding();
            if (typeof hydrateFloorDrawingFromCloud === 'function' && bldg.id && floorCode) {
                try { await hydrateFloorDrawingFromCloud(bldg, floorCode, { localOnly: false }); } catch (_e) { /* ignore */ }
            }
            const src = (typeof getNdtFloorDrawingSrc === 'function')
                ? getNdtFloorDrawingSrc(bldg, floorCode)
                : (bldg.floorDrawings && bldg.floorDrawings[floorCode]);
            if (!src) return renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter);
            // 전용 도면을 못 읽었으면 층 그림 캐시(지도 탭과 같이 씀)에 넣지 않는다
            if (src === currentNdtCustomDrawingSrc(customKey)) return renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter);
            let img = null;
            try {
                const pack = await imageSrcToBytes(src);
                const blob = new Blob([pack.bytes], { type: pack.mime || 'image/jpeg' });
                const objUrl = URL.createObjectURL(blob);
                img = await new Promise((resolve) => {
                    const el = new Image();
                    el.onload = () => resolve(el);
                    el.onerror = () => resolve(null);
                    el.src = objUrl;
                });
                URL.revokeObjectURL(objUrl);
            } catch (_e) {
                img = await new Promise((resolve) => {
                    const el = new Image();
                    el.onload = () => resolve(el);
                    el.onerror = () => resolve(null);
                    el.src = src;
                });
            }
            if (img && img.naturalWidth > 0) {
                if (!state.floorImageCache) state.floorImageCache = {};
                state.floorImageCache[`${bldg.id || state.currentBuildingId}_${floorCode}`] = img;
            }
            return renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter);
        } catch (err) {
            console.error('NDT 위치도 비동기 렌더 실패:', err);
            return renderNdtFloorPlanCanvasDataUrl(floorCode, categoryFilter);
        }
    }

