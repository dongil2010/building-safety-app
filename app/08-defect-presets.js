// @@app-part 08-defect-presets.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- Dynamic Defect Type Presets & Custom Adding ---
    const STEEL_MEMBER_DEFECTS = [
        '상태양호',
        '부식/녹',
        '변형/좌굴',
        '볼트 이완/파손',
        '용접부 균열/불량',
        '도장 박리',
        '뿜칠 박락',
        '뿜칠 미시공',
        '접합부 손상',
        '단면 손실',
        '기타'
    ];
    const DECK_SLAB_DEFECTS = [
        '상태양호',
        '균열',
        '누수',
        '처짐',
        '콘크리트 박리',
        '콘크리트 박락',
        '철근노출',
        '데크플레이트 부식',
        '접합부 손상',
        '백태',
        '기타'
    ];
    const WALL_CRACK_KINDS = ['수직균열', '수평균열', '경사균열', '망상균열'];
    const COLUMN_CRACK_KINDS = ['수직균열', '수평균열', '경사균열', '망상균열'];
    const BEAM_CRACK_KINDS = ['수직균열', '수평균열', '경사균열', '망상균열', 'U자형균열'];
    // 2026-11-04 구조체: 「백태/유출」은 그냥 「백태」로, 「박리/박락」은 기본 목록에서 뺌(콘크리트 박리·콘크리트 박락은 그대로). 저장된 결함의 옛 이름은 그대로 보인다.
    const RC_COMMON_OTHER_DEFECTS = ['누수', '철근노출', '백태', '콘크리트 박리', '콘크리트 박락', '신축이음/재료분리 손상', '기타'];
    const RC_WALL_DEFECTS = ['상태양호', ...WALL_CRACK_KINDS, '미장균열', ...RC_COMMON_OTHER_DEFECTS];
    const RC_COLUMN_DEFECTS = ['상태양호', ...COLUMN_CRACK_KINDS, '미장균열', ...RC_COMMON_OTHER_DEFECTS];
    const RC_BEAM_DEFECTS = ['상태양호', ...BEAM_CRACK_KINDS, '미장균열', ...RC_COMMON_OTHER_DEFECTS];
    const RC_SLAB_DEFECTS = ['상태양호', '균열', '미장균열', ...RC_COMMON_OTHER_DEFECTS];
    const JOINT_DEFECTS = [
        '상태양호', ...WALL_CRACK_KINDS, '미장균열',
        '누수', '철근노출', '백태',
        '볼트 이완/파손', '용접부 균열/불량', '접합부 손상',
        '부식/녹', '변형/좌굴', '기타'
    ];

    // ── 비구조체: 부재별 결함 종류 ──
    const MASONRY_WALL_DEFECTS = [
        '상태양호', ...WALL_CRACK_KINDS, '이격', '줄눈 손상/탈락', '배부름·전도 징후', '백태', '누수', '오염', '들뜸', '파손/결손', '기타'
    ];
    const PARTITION_WALL_DEFECTS = [
        '상태양호', '균열', '이격/파손', '변형·기울음', '마감 손상', '기타'
    ];
    const ALC_WALL_DEFECTS = [
        '상태양호', '균열', '파손/결손', '줄눈 손상', '누수', '백태', '기타'
    ];
    const WINDOW_DEFECTS = [
        '상태양호', '이격/개방불량', '유리 파손·금', '프레임 변형/부식', '실런트·코킹 손상', '누수', '하드웨어 불량', '기타'
    ];
    const DOOR_DEFECTS = [
        '상태양호', '개폐불량', '프레임 변형', '경첩·하드웨어 손상', '파손', '부식', '기타'
    ];
    const SHUTTER_DEFECTS = [
        '상태양호', '작동불량', '레일·가이드 손상', '패널 변형/파손', '부식', '기타'
    ];
    const ROOF_PANEL_DEFECTS = [
        '상태양호', '부식', '파손/천공', '이음부 손상', '들뜸/변형', '누수', '체결부 이완', '기타'
    ];
    const PANEL_DEFECTS = [
        '상태양호', '변형/들뜸', '파손', '이음부 손상', '부식', '누수', '체결부 이완', '기타'
    ];
    const RAILING_DEFECTS = [
        '상태양호', '균열', '부식/녹', '변형·기울음', '파손/결손', '이격/흔들림',
        '체결부 이완', '낙하·탈락 위험', '높이·간격 불량', '마감 손상', '기타'
    ];
    // 비구조 벽체 접합부(조적·ALC·칸막이 등 이질재료 접합)
    const NONSTRUCT_WALL_JOINT_DEFECTS = [
        '상태양호', ...WALL_CRACK_KINDS, '이격', '줄눈 손상/탈락', '파손/결손', '누수', '백태', '기타'
    ];
    // 중량물 — 회사 결함표: 조사내용 '창고 설치'·'물탱크 설치'·'실외기 설치'·'적치', 원인 '중량물 적치'·'중량물 설치'
    const HEAVY_LOAD_DEFECTS = ['상태양호', '중량물 적치', '중량물 설치', '기타'];

    // ── 마감재: 부재별 결함 종류 ──
    const EXT_TILE_DEFECTS = [
        '상태양호', '균열', '들뜸/탈락', '줄눈 손상', '백태', '파손', '기타'
    ];
    const EXT_STONE_DEFECTS = [
        '상태양호', '파손/팟칭', '들뜸/탈락', '줄눈 손상', '철물 노출·녹', '변색/오염', '기타'
    ];
    const EXT_PAINT_DEFECTS = [
        '상태양호', '균열', '변색/오염', '박리/탈락', '부풀음', '기타'
    ];
    const METAL_PANEL_FINISH_DEFECTS = [
        '상태양호', '부식', '변형/들뜸', '이음부 손상', '도장 박리', '체결부 이완', '기타'
    ];
    const INT_TILE_DEFECTS = [
        '상태양호', '균열', '들뜸/탈락', '줄눈 손상', '파손', '기타'
    ];
    const INTERIOR_FINISH_DEFECTS = [
        '상태양호', '들뜸/탈락', '파손', '변색/오염', '이격', '기타'
    ];
    const INT_PAINT_DEFECTS = [
        '상태양호', '균열', '변색/오염', '박리/탈락', '곰팡이·결로 흔적', '기타'
    ];
    const CEILING_FINISH_DEFECTS = [
        '상태양호', '들뜸/탈락', '처짐', '오염/변색', '누수 흔적', '파손', '기타'
    ];
    const FLOOR_TILE_DEFECTS = [
        '상태양호', '들뜸/탈락', '균열/파손', '줄눈 손상', '마모', '기타'
    ];
    const FLOOR_FINISH_DEFECTS = [
        '상태양호', '균열', '마모/손상', '들뜸', '오염', '기타'
    ];

    // 2026-10-30 회사 결함표 기준 — 마감·비구조 항목 결함(결함 칸에는 결함만)
    // 2026-11-02 엑셀 180개 대조: 타일·마감재에도 이격·철근노출(바탕 부재 마감)이 자주 나옴
    const COMPANY_TILE_DEFECTS = ['상태양호', '균열', '들뜸', '파손', '탈락', '박락', '이격', '줄눈 손상', '백태', '오염', '기타'];
    const SPRAY_FINISH_DEFECTS = ['상태양호', '박락', '들뜸', '탈락', '파손', '오염', '기타'];
    const COMPANY_FINISH_DEFECTS = ['상태양호', '균열', '들뜸', '파손', '박락', '탈락', '이격', '철근노출', '백태', '오염', '처짐', '누수흔적', '도장열화', '기타'];
    const NONSTRUCT_SITE_DEFECTS = ['상태양호', '균열', '파손', '침하', '물고임', '이격', '누수', '부식', '변형', '기타'];

    const componentDefectPreset = {
        '철골기둥': STEEL_MEMBER_DEFECTS,
        '철골거더': STEEL_MEMBER_DEFECTS,
        '철골빔': STEEL_MEMBER_DEFECTS,
        '철골보(G)': STEEL_MEMBER_DEFECTS,
        '철골보(B)': STEEL_MEMBER_DEFECTS,
        '데크슬래브': DECK_SLAB_DEFECTS,
        'RC벽체': RC_WALL_DEFECTS,
        '벽체': RC_WALL_DEFECTS,
        '내력벽': RC_WALL_DEFECTS,
        '옹벽': RC_WALL_DEFECTS,
        '파라펫': RC_WALL_DEFECTS,
        '보': RC_BEAM_DEFECTS,
        '기둥': RC_COLUMN_DEFECTS,
        'RC기둥': RC_COLUMN_DEFECTS,
        'SRC기둥': RC_COLUMN_DEFECTS,
        '큰보': RC_BEAM_DEFECTS,
        '작은보': RC_BEAM_DEFECTS,
        '보(G)': RC_BEAM_DEFECTS,
        '보(B)': RC_BEAM_DEFECTS,
        '캔틸레버보': RC_BEAM_DEFECTS,
        '슬래브': RC_SLAB_DEFECTS,
        '계단슬래브': RC_SLAB_DEFECTS,
        // ── 접합부 ──
        '기둥-보 접합부': JOINT_DEFECTS,
        '기둥-슬래브 접합부': JOINT_DEFECTS,
        '보-슬래브 접합부': JOINT_DEFECTS,
        '벽체-슬래브 접합부': JOINT_DEFECTS,
        '벽체-보 접합부': JOINT_DEFECTS,
        '기초-기둥 접합부': JOINT_DEFECTS,
        '철골 접합부': STEEL_MEMBER_DEFECTS,
        // ── 비구조체 ──
        '조적벽체': MASONRY_WALL_DEFECTS,
        '칸막이벽': PARTITION_WALL_DEFECTS,
        'ALC벽': ALC_WALL_DEFECTS,
        '벽체접합부': NONSTRUCT_WALL_JOINT_DEFECTS,
        '벽체 접합부': NONSTRUCT_WALL_JOINT_DEFECTS,
        '창호': WINDOW_DEFECTS,
        '문': DOOR_DEFECTS,
        '셔터': SHUTTER_DEFECTS,
        '난간': RAILING_DEFECTS,
        '지붕패널': ROOF_PANEL_DEFECTS,
        '지붕 패널': ROOF_PANEL_DEFECTS,
        '패널': PANEL_DEFECTS,
        '중량물': HEAVY_LOAD_DEFECTS,
        '내림벽체': MASONRY_WALL_DEFECTS,
        '치장벽돌': MASONRY_WALL_DEFECTS,
        '환기창': WINDOW_DEFECTS,
        '점검로': NONSTRUCT_SITE_DEFECTS,
        '배수로': NONSTRUCT_SITE_DEFECTS,
        '바닥포장': NONSTRUCT_SITE_DEFECTS,
        '부대시설': NONSTRUCT_SITE_DEFECTS,
        // ── 마감재 ──
        '뿜칠': SPRAY_FINISH_DEFECTS,
        '내화피복': SPRAY_FINISH_DEFECTS,
        '외벽마감재': COMPANY_FINISH_DEFECTS,
        '지붕마감재': COMPANY_FINISH_DEFECTS,
        '외장타일': EXT_TILE_DEFECTS,
        '외장석재': EXT_STONE_DEFECTS,
        '도장': EXT_PAINT_DEFECTS,
        '금속패널': METAL_PANEL_FINISH_DEFECTS,
        '내장타일': INT_TILE_DEFECTS,
        '수장': INTERIOR_FINISH_DEFECTS,
        '내장도장': INT_PAINT_DEFECTS,
        '천장마감재': CEILING_FINISH_DEFECTS,
        '천장 마감재': CEILING_FINISH_DEFECTS,
        '바닥타일': FLOOR_TILE_DEFECTS,
        '바닥마감': FLOOR_FINISH_DEFECTS
    };
    function normalizeComponentKey(name) {
        return String(name || '').replace(/\s+/g, '');
    }
    function getCrackKindsForComponent(component) {
        const key = normalizeComponentKey(component);
        if (!key) return null;
        // 마감 재료가 붙은 이름(기둥 타일·벽체 도장·슬래브 마감재)은 바탕 부재 RC 균열 칩으로 가지 않음
        if (key.includes('타일') || key.includes('석재') || key.includes('도장') || key.includes('수장')
            || key.includes('마감재') || key.includes('미장') || key.includes('뿜칠') || key.includes('페인트')) return null;
        if (key.includes('데크슬래브')) return null;
        if (key.includes('슬래브') && !key.includes('접합')) return null; // 슬래브는 '균열'만
        if (key.includes('철골') && key.includes('접합')) return null;
        if (key.includes('철골')) return null;
        if (key.includes('접합부') || key.includes('접합')) return WALL_CRACK_KINDS.slice();
        // 비구조체·마감재는 RC 수직/수평균열 칩을 쓰지 않음 (조적벽체는 수직·수평·경사·망상균열 사용)
        if (key.includes('조적')) return WALL_CRACK_KINDS.slice();
        if (key.includes('ALC') || key.includes('칸막이')) return null;
        if (key.includes('창호') || key.includes('셔터') || key.includes('패널') || key.includes('난간')) return null;
        if (key.includes('천장') || key.includes('바닥') || key === '문') return null;
        if (key.includes('벽체') || key === '내력벽') return WALL_CRACK_KINDS.slice();
        if (key.includes('옹벽') || key.includes('파라펫')) return WALL_CRACK_KINDS.slice();
        if (key.includes('기둥')) return COLUMN_CRACK_KINDS.slice();
        if (key.includes('보') || key.includes('거더') || key.includes('빔')) return BEAM_CRACK_KINDS.slice();
        return null;
    }
    function isRcStructuralCrackKind(label) {
        const t = String(label || '').trim();
        if (!t) return false;
        if (t === '균열') return true;
        return WALL_CRACK_KINDS.includes(t)
            || COLUMN_CRACK_KINDS.includes(t)
            || BEAM_CRACK_KINDS.includes(t);
    }
    function isCrackKindLabel(label) {
        return isRcStructuralCrackKind(label);
    }
    function parseDefectTypeList(raw) {
        // 콤마만 구분자 — '박리/박락'·'백태/유출' 등 슬래시 라벨은 한 항목으로 유지
        return String(raw == null ? '' : raw)
            .split(/[,，]+/)
            .map(s => s.trim())
            .filter(Boolean);
    }
    function joinDefectTypeList(list) {
        return (list || []).map(s => String(s || '').trim()).filter(Boolean).join(', ');
    }

    // ---- 2026-10-23 개구부 위치 빠른 선택(창 상부·창 하부·창 측면·문 상부·문 측면) — 결함 수정창(PC·모바일, 새 마킹 포함) ----
    function defectOpeningPosApplies() {
        const chk = document.getElementById('defectOpeningCrackCheck');
        const comp = (document.getElementById('defectComponentInput')?.value || '') + ' ' + (document.getElementById('defectComponent')?.value || '');
        return !!(chk && chk.checked) || /개구부/.test(comp);
    }
    function refreshDefectOpeningPosRow() {
        const row = document.getElementById('defectOpeningPosRow');
        if (!row) return;
        const cur = (document.getElementById('defectOpeningPos')?.value || '').trim();
        const curList = parseOpeningPosValue(cur);
        row.style.display = (defectOpeningPosApplies() || cur) ? '' : 'none';
        row.querySelectorAll('[data-opening-pos]').forEach((b) => {
            const on = curList.indexOf(b.getAttribute('data-opening-pos')) >= 0;
            b.classList.toggle('active', on);
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.style.background = on ? '#0d9488' : '';
            b.style.color = on ? '#fff' : '#0d9488';
            b.style.borderColor = '#0d9488';
        });
    }
    function setDefectOpeningPosUi(val) {
        const inp = document.getElementById('defectOpeningPos');
        // 여러 개 고를 수 있다 — 「창 상부, 창 하부」처럼 표준 이름을 쉼표로 이어 적는다(목록에 없는 옛 값은 그대로)
        if (inp) inp.value = normalizeOpeningPosValue(val);
        refreshDefectOpeningPosRow();
    }
    function readDefectOpeningPosUi() {
        return (document.getElementById('defectOpeningPos')?.value || '').trim();
    }
    window.setDefectOpeningPosUi = setDefectOpeningPosUi;

    /**
     * 결함 내용에 창 상부·창 하부·창 측면·문 상부·문 측면(띄어쓰기 무관)이 있으면 「개구부 결함」을 자동으로 체크하고 위치 버튼도 맞춘다.
     * 사용자가 직접 끈 체크는 다시 켜지 않는다(그 글이 지워질 때까지). 이미 체크된 것은 절대 끄지 않는다. 창을 막 열 때(채우는 중)는 건드리지 않는다.
     */
    function autoDetectOpeningFromDefectContent() {
        if (window._defectFormHydrating) return;
        if (typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode()) return;
        const chk = document.getElementById('defectOpeningCrackCheck');
        if (!chk) return;
        const text = getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput')) || '';
        const pos = findOpeningPosListInText(text).join(', '); // 「창 상부·하부」로 쓰면 둘 다
        if (!pos) { delete chk.dataset.openingManualOff; return; }
        if (chk.dataset.openingManualOff === '1') return;
        if (chk.checked) return; // 이미 체크됨(직접 체크 포함) — 끄지도, 위치 버튼을 바꾸지도 않는다
        chk.checked = true;
        chk.dispatchEvent(new Event('change', { bubbles: true }));
        if (!readDefectOpeningPosUi()) setDefectOpeningPosUi(pos);
        else refreshDefectOpeningPosRow();
    }
    window.autoDetectOpeningFromDefectContent = autoDetectOpeningFromDefectContent;
    (function bindDefectOpeningManualOff() {
        const chk = document.getElementById('defectOpeningCrackCheck');
        if (!chk || chk.dataset.manualOffBound) return;
        chk.dataset.manualOffBound = '1';
        chk.addEventListener('change', (e) => {
            if (!e.isTrusted) return; // 자동 체크(프로그램)는 제외 — 사람이 끈 것만 기억
            if (chk.checked) delete chk.dataset.openingManualOff; else chk.dataset.openingManualOff = '1';
        });
    })();
    (function bindDefectOpeningPosChips() {
        const row = document.getElementById('defectOpeningPosRow');
        if (!row || row.dataset.bound) return;
        row.dataset.bound = '1';
        row.addEventListener('click', (e) => {
            const b = e.target && e.target.closest && e.target.closest('[data-opening-pos]');
            if (!b) return;
            e.preventDefault();
            const v = b.getAttribute('data-opening-pos');
            // 2026-11-10 「창 상부·하부 중복으로 고를 수 있게」 — 누를 때마다 그 위치만 켜고 끈다(다른 위치는 그대로)
            const list = parseOpeningPosValue(readDefectOpeningPosUi());
            const at = list.indexOf(v);
            if (at >= 0) list.splice(at, 1); else list.push(v);
            setDefectOpeningPosUi(list.join(', '));
            const next = readDefectOpeningPosUi();
            // 위치를 골랐으면 개구부 결함으로(통계 「개구부 결함 제외」와 같은 기준)
            const chk = document.getElementById('defectOpeningCrackCheck');
            if (next && chk && !chk.checked) { chk.checked = true; chk.dispatchEvent(new Event('change', { bubbles: true })); }
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        });
        ['defectOpeningCrackCheck', 'defectComponent', 'defectComponentInput'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('change', refreshDefectOpeningPosRow); el.addEventListener('input', refreshDefectOpeningPosRow); }
        });
        // 개구부 결함을 켜고 끄면 원인 후보(개구부 주위 응력집중)도 새 문맥으로 — 직접 고른 원인은 그대로(자동 체크분만 다시 계산)
        document.getElementById('defectOpeningCrackCheck')?.addEventListener('change', () => {
            if (window._defectFormHydrating) return;
            try { refreshDefectTypeAfterComponentChange(document.getElementById('defectCategory')?.value || ''); } catch (_) {}
        });
        document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#defectComponentChips, .defect-component-chip, [data-component]')) setTimeout(refreshDefectOpeningPosRow, 0); }, true);
    })();

    // ---- 2026-10-27 개구부 결함 위치 인식(창 상부·창 하부·창 측면·문 상부·문 측면 — 띄어쓰기 있든 없든) ----
    // 2026-11-10 개구부 상부·개구부 하부 추가, 여러 위치를 같이 고를 수 있다(창 상부 + 창 하부 → 「창 상부·하부」).
    const OPENING_POS_NAMES = ['창 상부', '창 하부', '창 측면', '문 상부', '문 측면', '개구부 상부', '개구부 하부'];
    /**
     * 글 안의 개구부 위치 이름을 표준 이름 목록으로. 「창 상부·하부」「창 상부/하부」처럼 줄여 쓴 것도 푼다.
     * all=false(기본): 글에서 처음 나온 한 묶음만(결함 내용 글 — 「창 상부 균열, 창 하부 누수」는 예전처럼 창 상부만).
     * all=true: 글 전체(골라 둔 값 「창 상부, 창 하부」 읽기). 「문 하부」처럼 목록에 없는 조합은 무시.
     */
    function findOpeningPosListInText(text, all) {
        const s = String(text == null ? '' : text);
        const re = /(개구부|창|문)[\s\u3000]*(상부|하부|측면)((?:[\s\u3000]*[·ㆍ\/][\s\u3000]*(?:상부|하부|측면))*)/g;
        const out = [];
        let m;
        while ((m = re.exec(s))) {
            const found = [m[2]].concat(m[3] ? (m[3].match(/상부|하부|측면/g) || []) : [])
                .map((part) => `${m[1]} ${part}`)
                .filter((name) => OPENING_POS_NAMES.indexOf(name) >= 0);
            if (!found.length) { re.lastIndex = m.index + 1; continue; }
            found.forEach((name) => { if (out.indexOf(name) < 0) out.push(name); });
            if (!all) break;
        }
        return out;
    }
    /** 글 안에서 개구부 위치 이름을 찾아 표준 이름(창 상부 …)으로 돌려준다. 없으면 ''. 여러 개면 첫 번째 */
    function findOpeningPosInText(text) {
        return findOpeningPosListInText(text)[0] || '';
    }
    /** 골라 둔 위치 값(「창 상부, 창 하부」) → 표준 이름 목록 */
    function parseOpeningPosValue(val) {
        return findOpeningPosListInText(val, true);
    }
    /** 저장할 위치 값: 표준 이름을 버튼 순서대로 쉼표로 잇는다. 목록에 없는 옛 값은 그대로 둔다 */
    function normalizeOpeningPosValue(val) {
        const raw = String(val == null ? '' : val).trim();
        const list = parseOpeningPosValue(raw);
        if (!list.length) return raw;
        return OPENING_POS_NAMES.filter((n) => list.indexOf(n) >= 0).join(', ');
    }
    /** 조사내용에 붙는 위치 표기: 같은 종류는 묶는다 — ['창 상부','창 하부'] → 「창 상부·하부」, 종류가 다르면 「창 상부·문 상부」 */
    function formatOpeningPosLabel(list) {
        const groups = [];
        (list || []).forEach((name) => {
            const at = String(name).indexOf(' ');
            const kind = at > 0 ? name.slice(0, at) : name;
            const part = at > 0 ? name.slice(at + 1) : '';
            let g = groups.find((x) => x.kind === kind);
            if (!g) { g = { kind, parts: [] }; groups.push(g); }
            if (part && g.parts.indexOf(part) < 0) g.parts.push(part);
        });
        return groups.map((g) => (g.parts.length ? `${g.kind} ${g.parts.join('·')}` : g.kind)).join('·');
    }
    /** 결함 내용 맨 앞의 「개구부 주위」·「창 상부 (벽체)」·「창 상부·하부 (벽체)」 표기를 떼어 낸 나머지 */
    function stripOpeningPosPrefix(t) {
        return String(t || '').replace(/^\s*(?:개구부[\s\u3000]*주위[\s\u3000]*)?(?:(?:개구부|창|문)[\s\u3000]*(?:상부|하부|측면)(?:[\s\u3000]*[·ㆍ\/][\s\u3000]*(?:(?:개구부|창|문)[\s\u3000]*)?(?:상부|하부|측면))*[\s\u3000]*(?:벽체[\s\u3000]*)?)?/, '').trim();
    }

    /**
     * 개구부 결함 조사내용 표기 (한글·엑셀·PDF·표 공통 — getSurveyCellText('defectType')).
     * 위치(창 상부·창 하부·창 측면·문 상부·문 측면)를 골랐거나 결함 내용 글에 그 이름이 있으면 「창 상부 벽체 수직균열」 식으로,
     * 위치를 모르는 개구부 결함만 예전처럼 「개구부 주위 수직균열」.
     */
    function formatOpeningAwareDefectType(d) {
        const raw = (d && d.defectType) ? String(d.defectType) : '';
        // 골라 둔 위치가 우선, 없으면 결함 내용 글에서 찾는다(저장된 값은 건드리지 않고 표기만)
        let pos = d && d.openingPos ? String(d.openingPos).trim() : '';
        if (pos) { const chosen = parseOpeningPosValue(pos); if (chosen.length) pos = formatOpeningPosLabel(chosen); }
        else pos = formatOpeningPosLabel(findOpeningPosListInText(raw));
        if (pos) {
            const head = `${pos} 벽체`;
            const ps = parseDefectTypeList(raw);
            if (!ps.length) return `${head} 균열`;
            return joinDefectTypeList(ps.map((t) => {
                if (!t || (typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) return t;
                const bare = stripOpeningPosPrefix(t);
                return bare ? `${head} ${bare}` : `${head} 균열`;
            }));
        }
        if (!d || !d.isOpeningCrack) return raw;
        const parts = parseDefectTypeList(raw);
        if (!parts.length) return '개구부 주위 균열';
        return joinDefectTypeList(parts.map((t) => {
            if (!t || (typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) return t;
            if (/^개구부\s*주위/.test(t)) return t;
            return `개구부 주위 ${t}`;
        }));
    }
    let _defectTypeAllowSet = null;
    /** 부재별 결함 종류 목록 — 기본 목록(DEFECT_TYPE_ALLOW: 회사 엑셀에서 쓰인 것)만 남긴다. 걸러서 비면 걸러내기 전 목록 그대로 */
    function getDefectTypePresetFor(category, component) {
        const raw = getDefectTypePresetForRaw(category, component);
        if (!Array.isArray(raw)) return raw;
        if (!_defectTypeAllowSet) _defectTypeAllowSet = new Set(DEFECT_TYPE_ALLOW);
        const out = raw.filter((t) => _defectTypeAllowSet.has(t));
        // 2026-11-14 기본 목록에 「기타」는 넣지 않음(필요하면 직접 추가)
        return (out.some((t) => t !== '기타' && t !== '상태양호') ? out : raw).filter((t) => t !== '기타');
    }
    function getDefectTypePresetForRaw(category, component) {
        const key = normalizeComponentKey(component);
        // 2026-10-30 회사 결함표: 같은 바탕 부재 이름(벽체·기둥·보·슬래브·바닥)도 분류에 따라 결함 목록이 다르다
        if (key && category === '마감재') {
            if (key.includes('뿜칠') || key.includes('내화피복')) return SPRAY_FINISH_DEFECTS;
            if (key.includes('타일') && !componentDefectPreset[key]) return COMPANY_TILE_DEFECTS;
            if (key.includes('도장') || key.includes('페인트')) return EXT_PAINT_DEFECTS;
            if (key.includes('마감재') && !key.includes('천장')) return COMPANY_FINISH_DEFECTS;
            if (/^(벽체|기둥|보|보\(G\)|보\(B\)|슬래브|바닥)$/.test(key)) return COMPANY_FINISH_DEFECTS;
        }
        if (key && category === '비구조체') {
            if (key === '벽체') return MASONRY_WALL_DEFECTS;
            if (key === '바닥' || key.includes('포장') || key.includes('점검로') || key.includes('배수로') || key.includes('부대시설')) return NONSTRUCT_SITE_DEFECTS;
        }
        // 2026-11-02 비구조체로 적은 RC 부재(기둥·보·슬래브·RC벽체 …)는 벽체와 만나는 곳의 이격이 자주 나온다
        if (key && category === '비구조체' && ['기둥', 'RC기둥', '보(G)', '보(B)', '슬래브', 'RC벽체', '파라펫', '옹벽'].includes(key) && componentDefectPreset[key]) {
            const base = componentDefectPreset[key];
            if (!base.includes('이격')) {
                const at = base.indexOf('기타');
                return at < 0 ? base.concat('이격') : base.slice(0, at).concat('이격', base.slice(at));
            }
        }
        if (key && componentDefectPreset[key]) return componentDefectPreset[key];
        // 키워드 매칭 (직접 입력 부재명)
        if (key) {
            if (category === '비구조체') {
                if (['중량물', '물탱크', '실외기', '냉각탑', '쿨링타워', '태양광', '적치'].some((w) => key.includes(w))) return HEAVY_LOAD_DEFECTS;
                if (key.includes('조적')) return MASONRY_WALL_DEFECTS;
                if (key.includes('칸막이')) return PARTITION_WALL_DEFECTS;
                if (key.includes('ALC') || key.includes('alc')) return ALC_WALL_DEFECTS;
                if ((key.includes('벽체') && key.includes('접합')) || key === '벽체접합부') return NONSTRUCT_WALL_JOINT_DEFECTS;
                if (key.includes('창호') || key.includes('유리창') || (key.includes('창') && !key.includes('천장'))) return WINDOW_DEFECTS;
                if (key.includes('셔터')) return SHUTTER_DEFECTS;
                if (key.includes('난간') || key.includes('난간대') || key.includes('손잡이')) return RAILING_DEFECTS;
                if (key.includes('지붕')) return ROOF_PANEL_DEFECTS;
                if (key.includes('패널')) return PANEL_DEFECTS;
                if (key.includes('문')) return DOOR_DEFECTS;
            }
            if (category === '마감재') {
                if (key.includes('천장')) return CEILING_FINISH_DEFECTS;
                if (key.includes('석재')) return EXT_STONE_DEFECTS;
                if (key.includes('금속') && key.includes('패널')) return METAL_PANEL_FINISH_DEFECTS;
                if (key.includes('내장') && key.includes('타일')) return INT_TILE_DEFECTS;
                if (key.includes('내장') && key.includes('도장')) return INT_PAINT_DEFECTS;
                if (key.includes('외장') && key.includes('타일')) return EXT_TILE_DEFECTS;
                if (key.includes('바닥') && key.includes('타일')) return FLOOR_TILE_DEFECTS;
                if (key.includes('바닥')) return FLOOR_FINISH_DEFECTS;
                if (key.includes('수장')) return INTERIOR_FINISH_DEFECTS;
                if (key.includes('도장') || key.includes('페인트')) return EXT_PAINT_DEFECTS;
                if (key.includes('타일')) return EXT_TILE_DEFECTS;
                if (key.includes('패널')) return METAL_PANEL_FINISH_DEFECTS;
            }
            if (category === '구조체' || !category) {
                if (key.includes('접합부') || key.includes('접합')) {
                    if (key.includes('철골')) return STEEL_MEMBER_DEFECTS;
                    return JOINT_DEFECTS;
                }
                if (key.includes('철골')) return STEEL_MEMBER_DEFECTS;
                if ((key.includes('벽체') || key === '내력벽') && !key.includes('조적')) return RC_WALL_DEFECTS;
                if (key.includes('옹벽') || key.includes('파라펫')) return RC_WALL_DEFECTS;
                if (key.includes('기둥')) return RC_COLUMN_DEFECTS;
                if (key.includes('보') || key.includes('거더') || key.includes('빔')) return RC_BEAM_DEFECTS;
                if (key.includes('슬래브') && !key.includes('데크')) return RC_SLAB_DEFECTS;
            }
        }
        return categoryDefectPreset[category] || categoryDefectPreset['구조체'];
    }

    const categoryDefectPreset = {
        '구조체': [
            '상태양호',
            '균열',
            '미장균열',
            '누수',
            '철근노출',
            '백태',
            '콘크리트 박리',
            '콘크리트 박락',
            '신축이음/재료분리 손상',
            '기타'
        ],
        '비구조체': [
            '상태양호',
            '균열',
            '미장균열',
            '이격/파손',
            '변형',
            '누수',
            '부식',
            '파손',
            '중량물 적치',
            '중량물 설치',
            '이격',
            '물고임',
            '기타'
        ],
        '마감재': [
            '상태양호',
            '균열',
            '들뜸',
            '박락',
            '탈락',
            '파손',
            '오염',
            '처짐',
            '누수흔적',
            '들뜸/탈락',
            '박리/탈락',
            '변색/오염',
            '줄눈 손상',
            '기타'
        ]
    };

    function isTransientDefectTypeValue(value) {
        const v = String(value || '').trim();
        if (!v) return true;
        if (/[,，]/.test(v) && parseDefectTypeList(v).length > 1) return true;
        return false;
    }

    function isCrackFamilyDefectType(label) {
        const t = String(label || '').trim();
        if (!t) return false;
        if (typeof isRcStructuralCrackKind === 'function' && isRcStructuralCrackKind(t)) return true;
        return t.includes('균열');
    }

    /** 결함핀 수정: 상태양호 다음으로 균열류를 항상 최상단에 둠 */
    function prioritizeCrackDefectTypes(items) {
        if (!Array.isArray(items) || !items.length) return [];
        const good = [];
        const cracks = [];
        const rest = [];
        items.forEach((t) => {
            if (t === '상태양호') good.push(t);
            else if (isCrackFamilyDefectType(t)) cracks.push(t);
            else rest.push(t);
        });
        return good.concat(cracks, rest);
    }

    /**
     * 2026-11-13 결함 종류 세팅(직접 추가·숨김·순서)을 부재별로.
     * 저장 칸: 「분류|부재」(예: 구조체|보(G)). 그 부재를 ⚙에서 아직 안 고쳤으면 예전처럼 분류 칸(구조체)을 쓴다 —
     * 기존 세팅은 그대로 보이고, ⚙를 처음 열 때 분류 세팅을 그 부재 칸으로 복사한 뒤 그 부재만 고친다.
     */
    /** 세팅 칸의 부재 이름 — 2026-11-13 보(G)·보(B)는 「보」, 철골보(G)·(B)는 「철골보」 한 칸 */
    // 2026-11-13 PC보·RC보·큰보·작은보도 「보」, RC기둥·PC기둥도 「기둥」(철골·SRC·원형은 따로)
    function settingsComponentName(component) {
        let n = String(component || '').trim().replace(/\s*\(\s*[GgBb]\s*\)\s*$/, '').trim();
        if (/^(RC|PC)\s*보$/i.test(n) || n === '큰보' || n === '작은보') n = '보';
        else if (/^(RC|PC)\s*기둥$/i.test(n)) n = '기둥';
        return n;
    }
    /** 이미 만든 칸 찾기: 묶은 이름 칸, 없으면 예전 이름 칸(보(G) 등) — parts: 칸 이름 앞·뒤에 붙는 분류·종류 */
    function findOwnedSettingsBucket(map, prefix, component, suffix) {
        if (!map || typeof map !== 'object') return '';
        const norm = settingsComponentName(component);
        if (!norm) return '';
        const exact = prefix + norm + suffix;
        if (Array.isArray(map[exact])) return exact;
        return Object.keys(map).find((k) => Array.isArray(map[k]) && k.startsWith(prefix) && k.endsWith(suffix)
            && k.length > prefix.length + suffix.length
            && settingsComponentName(k.slice(prefix.length, k.length - suffix.length)) === norm) || '';
    }
    function defectTypeComponentBucketKey(category, component) {
        const cat = String(category || '').trim();
        const comp = settingsComponentName(component);
        return (cat && comp) ? `${cat}|${comp}` : '';
    }
    function defectTypeSettingsBucket(category, component) {
        const cat = String(category || '').trim();
        if (!cat) return cat;
        return findOwnedSettingsBucket(window.state.customDefectTypes, `${cat}|`, component, '') || cat;
    }
    /** ⚙로 고치기 전: 이 부재 칸이 없으면 (예전 보(G) 칸 또는) 분류 세팅을 복사해 만든다 → 그 칸 이름 */
    function ownDefectTypeSettingsBucket(category, component) {
        const cat = String(category || '').trim();
        const b = defectTypeComponentBucketKey(cat, component);
        if (!b) return cat;
        const st = window.state;
        if (st.customDefectTypes && Array.isArray(st.customDefectTypes[b])) return b;
        const src = findOwnedSettingsBucket(st.customDefectTypes, `${cat}|`, component, '') || cat;
        const favNow = typeof getDefectFavoriteList === 'function' ? getDefectFavoriteList('type', src) : null;
        ['customDefectTypes', 'hiddenDefectTypes', 'defectTypeOrder'].forEach((f) => {
            if (!st[f] || typeof st[f] !== 'object') st[f] = {};
            st[f][b] = Array.isArray(st[f][src]) ? st[f][src].slice() : [];
        });
        // ★도 부재별 — 지금 보이는 분류 ★를 그 부재 칸으로 복사
        if (Array.isArray(favNow)) {
            if (!st.favoriteDefectTypes || typeof st.favoriteDefectTypes !== 'object') st.favoriteDefectTypes = {};
            st.favoriteDefectTypes[b] = favNow.slice();
        }
        return b;
    }

    function getPinnedDefectTypeChips(category, component) {
        const bucket = defectTypeSettingsBucket(category, component);
        const hidden = (window.state.hiddenDefectTypes && window.state.hiddenDefectTypes[bucket]) || [];
        // 2026-11-13 ⚙에서 지운(숨긴) 균열 종류도 실제로 안 보이게 — 전엔 균열 종류는 지워도 계속 떴다
        const crackKinds = (getCrackKindsForComponent(component) || []).filter(t => !hidden.includes(t));
        const preset = (getDefectTypePresetFor(category, component) || []).filter(t => !hidden.includes(t));
        const custom = ((window.state.customDefectTypes && window.state.customDefectTypes[bucket]) || [])
            .filter(t => t && !isTransientDefectTypeValue(t) && !crackKinds.includes(t) && !hidden.includes(t));
        const out = [];
        const seen = new Set();
        const push = (v) => {
            const t = String(v || '').trim();
            if (!t || seen.has(t) || isTransientDefectTypeValue(t)) return;
            seen.add(t);
            out.push(t);
        };
        push('상태양호');
        crackKinds.forEach(push);
        preset.forEach((t) => { if (!crackKinds.includes(t)) push(t); });
        custom.forEach(push);
        return prioritizeCrackDefectTypes(applySavedOptionOrder(out, ensureOptionOrderEntry('defectTypeOrder', bucket)));
    }

    function updateDefectTypeDropdown(category, currentVal = null) {
        const select = document.getElementById('defectType');
        if (!select) return;

        if (!window.state.customDefectTypes) {
            window.state.customDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
        }
        if (!window.state.hiddenDefectTypes) window.state.hiddenDefectTypes = {};

        const component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        );
        const crackKinds = getCrackKindsForComponent(component);
        const typeBucket = defectTypeSettingsBucket(category, component);
        const hidden = window.state.hiddenDefectTypes[typeBucket] || [];
        const presetList = getDefectTypePresetFor(category, component).filter(t => !hidden.includes(t));
        const customList = ((window.state.customDefectTypes[typeBucket] || []))
            .filter(item => !isTransientDefectTypeValue(item));
        if (typeBucket) window.state.customDefectTypes[typeBucket] = customList;

        let html = `<option value="" ${!currentVal ? 'selected' : ''}>—</option>`;
        const allOptions = presetList.slice();
        if (crackKinds) crackKinds.forEach(k => { if (!allOptions.includes(k) && !hidden.includes(k)) allOptions.push(k); });
        customList.forEach(item => {
            if (!allOptions.includes(item)) allOptions.push(item);
        });
        const orderedOptions = prioritizeCrackDefectTypes(applySavedOptionOrder(
            allOptions,
            ensureOptionOrderEntry('defectTypeOrder', typeBucket)
        ));
        orderedOptions.forEach(item => {
            const sel = (currentVal && currentVal === item) ? 'selected' : '';
            html += `<option value="${item}" ${sel}>${item}</option>`;
        });

        html += `<option value="__ADD_CUSTOM__">➕ [결함 종류 직접 추가...]</option>`;
        select.innerHTML = html;

        if (currentVal && !orderedOptions.includes(currentVal)
            && !isTransientDefectTypeValue(currentVal)
            && !parseDefectTypeList(currentVal).every(t => orderedOptions.includes(t))) {
            const customOpt = document.createElement('option');
            customOpt.value = currentVal;
            customOpt.textContent = currentVal;
            customOpt.selected = true;
            select.insertBefore(customOpt, select.lastElementChild);
        }

        const resolved = (currentVal !== null && currentVal !== undefined)
            ? currentVal
            : (isDefectComboCustomToken(select.value) ? '' : select.value);
        const typeInput = document.getElementById('defectTypeInput');
        if (typeInput) typeInput.value = isDefectComboCustomToken(resolved) ? '' : (resolved || '');
        if (resolved && !isTransientDefectTypeValue(resolved) && !isDefectComboCustomToken(resolved)) {
            ensureDefectComboOption(select, resolved);
        } else if (select && resolved && isTransientDefectTypeValue(resolved)) {
            select.value = '';
        }

        // Trigger cause update for current defect type
        updateDefectCauseDropdown(resolved);
        toggleDefectSizeInputMode();
        refreshDefectQuickPickBar();
    }

    /**
     * 부재를 바꾼 뒤 결함 종류 목록·발생 원인 다시 맞추기(2026-09-28).
     * 예전에는 부재를 바꾸면 체크한 원인이 지워졌음 → 직접 고른 원인은 유지,
     * 자동으로 붙은 원인만 새 부재 기준 기본값으로 바꿈. 일괄 수정은 원인을 그대로 둠.
     */
    function refreshDefectTypeAfterComponentChange(category) {
        const typeSelect = document.getElementById('defectType');
        const typeInput = document.getElementById('defectTypeInput');
        const causesBefore = getSelectedCausesFromUi();
        const typeNow = getDefectComboValue(typeSelect, typeInput);
        updateDefectTypeDropdown(category, typeNow);
        if (!hasActionableDefectType(typeNow)) return;
        if (isDefectBulkEditMode()) {
            updateDefectCauseDropdown(typeNow, joinCauseList(causesBefore));
            return;
        }
        const auto = new Set(window._defectAutoCauses || []);
        if (auto.size) {
            applyCauseAutoPickForType(typeNow, causesBefore.filter(c => !auto.has(c)));
        } else {
            updateDefectCauseDropdown(typeNow, joinCauseList(causesBefore));
        }
    }

    function getSelectedCrackKindsFromUi() {
        const component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        );
        const crackKinds = getCrackKindsForComponent(component) || [];
        if (!crackKinds.length) return [];
        const typeVal = getDefectComboValue(
            document.getElementById('defectType'),
            document.getElementById('defectTypeInput')
        );
        return parseDefectTypeList(typeVal).filter(t => crackKinds.includes(t));
    }

    function isPlasterCrackDefectType(label) {
        return String(label || '').replace(/\s+/g, '').includes('미장');
    }

    /**
     * 미장 관련 결함(미장균열·미장들뜸·미장 박락 등, 공백 무시)은 대부분 비구조체.
     * 2026-11-08 사용자: 「균열, 미장균열」처럼 구조체인 경우가 있어 강제를 푼다 —
     *   저장 경로(수정창·일괄수정·조사표 편집)는 분류가 비었을 때('')만 비구조체로 채우고, 사람이 고른 구조체는 그대로 둔다.
     *   가져오기(CAD·엑셀)처럼 사람이 분류를 고르지 않은 기본값 「구조체」는 opts.force로 예전처럼 비구조체로 바꾼다.
     *   미장인데 구조체로 남은 것은 미리보기 「검토」가 짚는다(js/core/report-review.js plaster-structural).
     */
    function bsaPlasterNonStructCategory(category, defectType, opts) {
        const c = String(category || '').trim();
        const force = !!(opts && opts.force);
        if ((c === '' || (force && c === '구조체')) && isPlasterCrackDefectType(defectType)) return '비구조체';
        return category;
    }
    window.bsaPlasterNonStructCategory = bsaPlasterNonStructCategory;
    window.bsaIsPlasterDefectType = isPlasterCrackDefectType;

    function defectTypeListHasPlasterCrack(typeVal) {
        return parseDefectTypeList(typeVal).some((t) => isPlasterCrackDefectType(t));
    }

    /**
     * 구조체에서 미장균열을 고르면 비구조체로 옮긴다.
     * (카테고리 change 핸들러가 종류를 비우지 않도록 preserve 플래그 사용)
     */
    function maybeReclassifyPlasterCrackToNonStructural() {
        const catEl = document.getElementById('defectCategory');
        if (!catEl || (catEl.value !== '구조체' && catEl.value !== '')) return false;
        const typeSelect = document.getElementById('defectType');
        const typeInput = document.getElementById('defectTypeInput');
        const typeVal = getDefectComboValue(typeSelect, typeInput);
        if (window._defectFormHydrating) return false;   // 저장된 값을 채우는 중에는 몰래 바꾸지 않는다
        if (!defectTypeListHasPlasterCrack(typeVal)) { window._plasterKeepStructural = false; return false; }
        // 2026-11-08 사용자가 일부러 구조체로 되돌렸으면 그대로 둔다(접합부 이격과 같은 방식)
        if (window._plasterKeepStructural) return false;

        const compSelect = document.getElementById('defectComponent');
        const compInput = document.getElementById('defectComponentInput');
        const compVal = getDefectComboValue(compSelect, compInput);

        if (isDefectBulkEditMode()) {
            markDefectBulkFieldChanged('category');
            markDefectBulkFieldChanged('defectType');
        }

        window._preserveDefectTypeOnCategoryChange = typeVal;
        window._preserveDefectComponentOnCategoryChange = compVal || '';
        window._plasterAutoSwitching = true;
        try {
            catEl.value = '비구조체';
            catEl.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
            window._plasterAutoSwitching = false;
        }
        if (typeof window.showToast === 'function') {
            window.showToast('미장 관련 결함은 대부분 비구조체라 비구조체로 옮겼어요. 구조체이면 구조체를 다시 눌러 주세요.', 'info', 3500);
        }
        return true;
    }

    /**
     * 2026-11-03 구조체로 적은 「접합부 + 이격」(기둥-벽체 접합부 수직이격 등)은 현장에서 대부분 비구조체 결함 → 고르는 순간 비구조체로 옮긴다.
     * 미장(항상 비구조체, 저장 때도 강제)과 달리 「대부분」이라서 강제하지 않는다: 사용자가 구조체를 다시 누르면 그대로 두고
     * (같은 부재·종류인 동안) 다시 바꾸지 않는다. 이미 저장된 결함을 열 때·일괄 수정에서는 건드리지 않는다.
     */
    function isJointGapDefect(component, typeVal) {
        const c = String(component || '');
        if (!c.includes('접합')) return false;
        return parseDefectTypeList(typeVal).some((t) => String(t || '').includes('이격'));
    }
    function maybeReclassifyJointGapToNonStructural() {
        if (window._defectFormHydrating || isDefectBulkEditMode()) return false;
        const catEl = document.getElementById('defectCategory');
        if (!catEl || (catEl.value !== '구조체' && catEl.value !== '')) return false;
        const compVal = getDefectComboValue(document.getElementById('defectComponent'), document.getElementById('defectComponentInput'));
        const typeVal = getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput'));
        if (!isJointGapDefect(compVal, typeVal)) { window._jointGapKeepStructural = false; return false; }
        if (window._jointGapKeepStructural) return false; // 사용자가 일부러 구조체로 되돌림
        window._preserveDefectTypeOnCategoryChange = typeVal;
        window._preserveDefectComponentOnCategoryChange = compVal || '';
        window._jointGapAutoSwitching = true;
        try {
            catEl.value = '비구조체';
            catEl.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
            window._jointGapAutoSwitching = false;
        }
        if (typeof window.showToast === 'function') {
            window.showToast('접합부 이격 결함은 대부분 비구조체라 비구조체로 옮겼어요. 구조체이면 구조체를 다시 눌러 주세요.', 'info', 3500);
        }
        return true;
    }
    window.isJointGapDefect = isJointGapDefect;

    /**
     * 결함 종류를 사용자가 바꿨을 때 발생 원인 다시 맞추기(2026-09-28).
     * 직접 고른 원인은 유지, 비어 있으면 그 종류의 ★원인(없으면 맨 위 원인)을 자동 체크.
     * 결함을 열 때(기존 값 표시)나 일괄 수정에서는 쓰지 않는다 — 저장된 값을 몰래 바꾸지 않게.
     */
    function applyCauseAutoPickForType(typeStr, selectedOverride) {
        const t = String(typeStr || '').trim();
        const q = getDefectQuickPresetsApi();
        if (!q || !t || !hasActionableDefectType(t) || isDefectBulkEditMode()) {
            window._defectAutoCauses = [];
            updateDefectCauseDropdown(t || '기타');
            return;
        }
        const groups = getCauseDisplayGroups(t);
        const res = q.pickCausesAfterTypeChange({
            groupOptions: groups.map((g) => getCauseOptionsForKey(g.key, g.types)),
            groupFavorites: groups.map((g) => getDefectFavoriteList('cause', causeSettingsBucket(g.key))),
            selected: Array.isArray(selectedOverride) ? selectedOverride : getSelectedCausesFromUi(),
            autoPicked: window._defectAutoCauses || [],
            autoCheck: window.state.defectCauseAutoCheck !== false
        });
        window._defectAutoCauses = res.autoPicked;
        updateDefectCauseDropdown(t, joinCauseList(res.selected));
    }

    /** 결함 종류 칩 토글 — 균열·비균열 모두 복수 선택, 순서는 처음 고른 순 */
    function toggleDefectTypeChip(value) {
        const typeSelect = document.getElementById('defectType');
        const typeInput = document.getElementById('defectTypeInput');
        const v = String(value || '').trim();
        if (!v) return;
        if (isDefectBulkEditMode()) markDefectBulkFieldChanged('defectType');

        if (v === '상태양호') {
            const cur = getDefectComboValue(typeSelect, typeInput);
            const next = cur === '상태양호' ? '' : '상태양호';
            syncDefectComboFields(typeSelect, typeInput, next);
            updateDefectCauseDropdown(next || '기타');
            toggleDefectSizeInputMode();
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            refreshDefectQuickPickBar();
            return;
        }

        let parts = parseDefectTypeList(getDefectComboValue(typeSelect, typeInput))
            .filter(t => t && t !== '상태양호');
        const idx = parts.indexOf(v);
        if (idx >= 0) parts.splice(idx, 1);
        else parts.push(v);

        const joined = joinDefectTypeList(parts);
        syncDefectComboFields(typeSelect, typeInput, joined);
        applyCauseAutoPickForType(joined);
        toggleDefectSizeInputMode();
        if (maybeReclassifyPlasterCrackToNonStructural()) return;
        if (maybeReclassifyJointGapToNonStructural()) return;
        if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        refreshDefectQuickPickBar();
    }

    // 자유텍스트(규모 및 상태) 입력칸은 결함 종류와 상관없이 항상 보이고,
    // 균열(하위 종류 포함)이면 폭/길이 입력란을 보여준다.
    // 결함 종류가 '상태양호'면 규모/원인 입력이 의미가 없으므로 두 칸 모두 숨긴다.
    function toggleDefectSizeInputMode() {
        const typeSelect = document.getElementById('defectType');
        const typeInput = document.getElementById('defectTypeInput');
        const dType = getDefectComboValue(typeSelect, typeInput) || '';
        const kinds = getSelectedCrackKindsFromUi();
        const isCrack = isCrackKindLabel(dType) || kinds.length > 0 || /균열/.test(String(dType));
        const isGood = isGoodDefectType(dType);
        const crackGroup = document.getElementById('defectCrackSizeGroup');
        const measureGroup = document.getElementById('quickMeasureGroup');
        const freeLabel = document.getElementById('defectSizeFreeLabel');
        const sizeGroup = document.getElementById('defectSizeFreeGroup');
        const causeGroup = document.getElementById('defectCauseGroup');
        if (crackGroup) crackGroup.style.display = (isCrack && !isGood) ? '' : 'none';
        if (measureGroup) measureGroup.style.display = isGood ? 'none' : '';
        if (freeLabel) {
            freeLabel.textContent = isCrack
                ? '규모 및 상태 (균열폭/길이도 가능)'
                : '규모 및 상태';
        }
        if (sizeGroup) sizeGroup.style.display = isGood ? 'none' : '';
        if (causeGroup) causeGroup.style.display = isGood ? 'none' : '';
        if (typeof syncDefectProgressiveSections === 'function') syncDefectProgressiveSections();
    }

    function normalizeMeasureJoin(join) {
        return join === 'x' ? 'x' : '/';
    }

    function inferMeasureJoin(defect, measure) {
        if (measure && measure.join === '/' && sizeTextSaysAreaJoin(defect, measure)) return 'x';
        if (measure && (measure.join === 'x' || measure.join === '/')) return measure.join;
        const size = String((defect && defect.size) || '');
        // 2026-10-20 '*'도 면적 표기(0.3*0.3) — 예전엔 x·×만 봐서 '*'로 쓴 규모가 '/'로 되돌아갔다
        if (/\d(?:\.\d+)?\s*[x×*]\s*\d/i.test(size)) return 'x';
        if (/W\s*=\s*[\d.]+\s*m\b/i.test(size) && /L\s*=\s*[\d.]+\s*m\b/i.test(size) && !/W\s*=\s*[\d.]+\s*mm\b/i.test(size)) return 'x';
        return '/';
    }

    /**
     * 2026-10-20 「/ → x(*) 바꿨는데 안 바뀐 게 있음」: 규모 글자만 x/*로 고치고 폭·길이 행은 '/'로 남은 결함.
     * 규모 글자가 측정값 표기뿐이고 같은 자리 행의 폭·길이가 같은데 글자 쪽이 x면 x로 본다(저장값은 안 건드림).
     */
    function sizeTextSaysAreaJoin(defect, measure) {
        if (!defect || !Array.isArray(defect.crackMeasures)) return false;
        const size = String(defect.size || '');
        if (!/[x×*]/i.test(size) || !isMeasureOnlySizeText(size)) return false;
        const idx = defect.crackMeasures.indexOf(measure);
        if (idx < 0) return false;
        const parsed = parseSizeTextToCrackMeasures(size, { defectType: defect.defectType });
        if (parsed.length !== defect.crackMeasures.length) return false;
        const p = parsed[idx];
        if (!p || p.join !== 'x') return false;
        const num = (v) => normalizeCrackDecimalText(String(v == null ? '' : v).replace(/^\s*Cw\s*[:=]\s*/i, '').replace(/\s*(mm|㎜|m)$/i, '').trim());
        return num(p.width) === num(measure.width) && num(p.length) === num(measure.length) && !!num(measure.length);
    }

    /**
     * 저장 직전: 「규모 및 상태」 글자를 손으로 고쳤고 그게 측정값 표기(0.3x0.3, 0.3*2.0 -2EA …)뿐이면
     * 폭·길이·개수 행도 그 글자대로 맞춘다. 예전엔 글자만 저장되고 행(join '/')이 남아
     * 화면·한글·엑셀이 행 기준으로 다시 '/'를 만들어 「바꾼 게 적용 안 됨」으로 보였다.
     */
    function reconcileDefectMeasuresWithEditedSize(defect, prevSize) {
        if (!defect) return false;
        const size = String(defect.size == null ? '' : defect.size).trim();
        if (!size || size === '-' || size === String(prevSize == null ? '' : prevSize).trim()) return false;
        if (!isMeasureOnlySizeText(size)) return false;
        const parsed = parseSizeTextToCrackMeasures(size, { defectType: defect.defectType });
        if (!parsed.length) return false;
        applyCrackMeasuresEditToDefect(defect, parsed);
        return true;
    }

    /**
     * 엑셀/한글 규모 문자열 → crackMeasures[].
     * "0.3/3.00.2/3.0" → [{0.3,3.0,/},{0.2,3.0,/}]
     * "0.3/2.00.3*0.3" → [{0.3,2.0,/},{0.3,0.3,x}]
     * 콤마·공백으로 나뉜 경우도 동일. -nEA 개수 유지.
     *
     * 2026-10-28 폭 범위·망상균열 범위:
     *  - 「Cw:0.1~0.6」·「0.3~0.7/0.5 -12EA」: ~ 범위는 폭 한 값(width '0.1~0.6')으로 읽는다(예전엔 앞 숫자만 남기고 버렸다).
     *  - 「Cw:0.1~0.6/1.5*2.0」: 폭 0.1~0.6 + 망상균열 범위 가로×세로 1.5×2.0 → 행 두 개
     *    [{폭 0.1~0.6}, {1.5 x 2.0 (join 'x' = 면적)}]. 앱의 기존 망상균열 표기(「Cw:0.2, 2.0x2.0」, 측정 구분 면적)와 같다.
     *    「폭/가로*세로」에서 세 번째 값이 소수(2.0)면 개수일 수 없으므로 범위, 정수(3)면 개수인지 범위인지 몰라
     *    결함 종류가 망상균열(opts.defectType)일 때만 범위로 본다. 그 밖에는 풀지 않는다.
     *  - 문자열 전체를 풀지 못하면(뒤에 남는 글자가 있으면) [] — 일부만(예: 0.1) 돌려주면 호출한 쪽이 규모 글자를
     *    그 일부로 덮어써 나머지가 사라지므로, 풀지 못한 규모는 원문 그대로 규모 칸에 남게 한다.
     */
    function parseSizeTextToCrackMeasures(raw, opts) {
        const meshType = !!(opts && /망상/.test(String(opts.defectType == null ? '' : opts.defectType)));
        const isMeshRangeValue = (bText) => meshType || /\./.test(String(bText));
        let rest = String(raw == null ? '' : raw)
            .replace(/㎜/gi, 'mm')
            .replace(/\u00d7/g, 'x') // ×
            .trim();
        if (!rest || rest === '-') return [];
        // 2026-10-31 개수만 적힌 칸(「3」·「3개소」·「개수 3」·「수량3」·「EA 3」·「N=3」) → 개수.
        // 소수점 없는 숫자 하나만 있으면 폭이 아니라 개수로 본다(폭·길이는 0.3·2.0처럼 소수로 적음).
        // 예전엔 숫자 하나를 폭 3.0으로 넣어 엑셀 가져오기 때 개수가 균열폭으로 들어갔다.
        {
            const cOnly = rest.match(/^(?:(?:개수|수량|갯수|N)\s*[:=]?\s*)?-?\s*(\d+)\s*(?:EA|개소|개)?$/i)
                || rest.match(/^EA\s*[:=]?\s*(\d+)$/i);
            if (cOnly) return [{ width: '', length: '', count: cOnly[1], join: '/' }];
        }

        const takeNumber = (s) => {
            const m = String(s).match(/^(\d+(?:\.\d+)?)/);
            if (!m) return null;
            let num = m[1];
            let after = s.slice(m[0].length);
            // 3.00.2 → 3.0 + 0.2 (끝 0이 다음 소수 0.x 의 0)
            while (/0$/.test(num) && /^\.\d/.test(after)) {
                num = num.slice(0, -1);
                after = `0${after}`;
            }
            if (num.endsWith('.')) num = num.slice(0, -1);
            if (!num || !/^\d+(?:\.\d+)?$/.test(num)) return null;
            return { num, after };
        };
        // 폭: 숫자 하나 또는 「0.1~0.6」 범위(한 값으로)
        const takeWidth = (s) => {
            const a = takeNumber(s);
            if (!a) return null;
            const rg = a.after.match(/^\s*~\s*/);
            if (!rg) return a;
            const b = takeNumber(a.after.slice(rg[0].length));
            if (!b) return a; // 「0.3~」: ~ 가 남아 끝까지 못 푼 것으로 처리
            return { num: `${normalizeCrackDecimalText(a.num)}~${normalizeCrackDecimalText(b.num)}`, after: b.after };
        };

        const out = [];
        let guard = 0;
        while (rest && guard++ < 40) {
            rest = rest.replace(/^[\s,;|/·]+/, '');
            if (!rest) break;

            // 2026-10-23 개수만(폭·길이 공란) 「3EA」·「-3EA」·「3개」 → 개수. 예전엔 숫자 하나로 보고 폭 3.0에 넣어
            // 엑셀 가져오기·수정창 저장 때 개수가 균열폭으로 옮겨 갔다.
            const eaOnly = rest.match(/^-?\s*(\d+)\s*(?:EA|개)(?![A-Za-z])/i);
            if (eaOnly) {
                rest = rest.slice(eaOnly[0].length);
                out.push({ width: '', length: '', count: eaOnly[1], join: '/' });
                continue;
            }

            let m = rest.match(/^Cw\s*[:=]\s*/i);
            if (m) {
                rest = rest.slice(m[0].length);
                const w = takeWidth(rest);
                if (!w) break;
                rest = w.after.replace(/^\s*mm\b/i, '');
                // 「Cw:0.3/2.0」 폭/길이 · 「Cw:0.1~0.6/1.5*2.0」 폭 + 망상균열 범위(가로*세로, 다음 줄에서 면적 행으로)
                let cwLen = '';
                const cwSlash = rest.match(/^\s*\/\s*/);
                if (cwSlash) {
                    const a = takeNumber(rest.slice(cwSlash[0].length));
                    if (a) {
                        const bM = a.after.match(/^\s*[x*]\s*(\d+(?:\.\d+)?)/i);
                        if (!bM) {
                            cwLen = normalizeCrackDecimalText(a.num);
                            rest = a.after.replace(/^\s*(?:mm|m)\b/i, '');
                        } else if (!isMeshRangeValue(bM[1])) {
                            break; // 「Cw:0.3/2.0*3」: 길이×개수인지 범위인지 알 수 없어 풀지 않는다(원문 보존)
                        }
                    }
                }
                let count = '';
                const ea = rest.match(/^\s*-\s*(\d+)\s*EA(?![A-Za-z])/i);
                if (ea) {
                    count = ea[1];
                    rest = rest.slice(ea[0].length);
                }
                out.push({
                    width: normalizeCrackDecimalText(w.num),
                    length: cwLen,
                    count,
                    join: '/'
                });
                continue;
            }

            const w = takeWidth(rest);
            if (!w) break;
            rest = w.after.replace(/^\s*mm\b/i, '');
            const joinM = rest.match(/^\s*([/x*])\s*/i);
            if (!joinM) {
                // 2026-10-23 길이만 「2.0m」·「2.0m -3EA」 → 길이(예전엔 폭으로 들어감)
                const lenOnly = rest.match(/^\s*m(?![m\w])/i);
                if (lenOnly) {
                    rest = rest.slice(lenOnly[0].length);
                    let lc = '';
                    const lea = rest.match(/^\s*-\s*(\d+)\s*EA(?![A-Za-z])/i);
                    if (lea) { lc = lea[1]; rest = rest.slice(lea[0].length); }
                    out.push({ width: '', length: normalizeCrackDecimalText(w.num), count: lc, join: '/' });
                    continue;
                }
                // 폭만
                let count = '';
                const ea = rest.match(/^\s*-\s*(\d+)\s*EA(?![A-Za-z])/i);
                if (ea) {
                    count = ea[1];
                    rest = rest.slice(ea[0].length);
                } else if (out.length === 0 && !/^\d/.test(rest.replace(/^[\s,;]+/, ''))) {
                    // 숫자만 하나 있고 더 이상 규모 패턴이 아니면 폭 단독으로 인정
                    out.push({
                        width: normalizeCrackDecimalText(w.num),
                        length: '',
                        count: '',
                        join: '/'
                    });
                    break;
                } else {
                    break;
                }
                out.push({
                    width: normalizeCrackDecimalText(w.num),
                    length: '',
                    count,
                    join: '/'
                });
                continue;
            }
            const join = /[x*]/i.test(joinM[1]) ? 'x' : '/';
            rest = rest.slice(joinM[0].length);
            const restAtLength = rest;
            const l = takeNumber(rest);
            if (!l) break;
            // 「폭/가로*세로」(0.1/1.5*2.0): 폭 한 행 + 가로×세로(망상균열 범위) 면적 행. 세 번째 값이 소수면 개수가 아니므로 범위,
            // 정수면(0.3/2.0*3) 개수인지 범위인지 몰라 망상균열일 때만 범위로 본다. 아니면 풀지 않는다(원문 보존).
            if (join === '/') {
                const bM = l.after.match(/^\s*[x*]\s*(\d+(?:\.\d+)?)/i);
                if (bM) {
                    if (!isMeshRangeValue(bM[1])) break;
                    out.push({ width: normalizeCrackDecimalText(w.num), length: '', count: '', join: '/' });
                    rest = restAtLength;
                    continue;
                }
            }
            rest = l.after.replace(/^\s*(?:mm|m)\b/i, '');
            let count = '';
            const ea = rest.match(/^\s*-\s*(\d+)\s*EA(?![A-Za-z])/i);
            // 2026-10-15 엑셀 등 「폭*길이*개수」·「폭x길이x개수」: 세 번째 정수는 개수 (0.3*2.0*3 → 폭 0.3, 길이 2.0, 개수 3)
            // 구분자는 그대로: '/'로 쓴 값은 0.3/2.0/3, '*'·'x'로 쓴 값은 0.3x2.0x3 처럼 같은 구분자의 세 번째 정수만 개수로 본다
            const third = ea ? null : (join === 'x'
                ? rest.match(/^\s*[x*]\s*(\d+)\s*(?:EA|개)?(?![\d.])/i)
                : rest.match(/^\s*\/\s*(\d+)\s*(?:EA|개)?(?![\d.])/i));
            if (ea) {
                count = ea[1];
                rest = rest.slice(ea[0].length);
            } else if (third) {
                count = third[1];
                rest = rest.slice(third[0].length);
            }
            out.push({
                width: normalizeCrackDecimalText(w.num),
                length: normalizeCrackDecimalText(l.num),
                count,
                join
            });
        }
        // 끝까지 풀지 못했으면(남은 글자가 있음) 일부만 돌려주지 않는다 — 규모 원문은 호출한 쪽이 그대로 둔다
        if (rest.replace(/^[\s,;|/·]+/, '')) return [];
        return out;
    }

    function applyParsedCrackMeasuresToDefect(defect, measures, sizeFallback) {
        if (!defect || !Array.isArray(measures) || !measures.length) return false;
        defect.crackMeasures = measures.map((m) => ({
            width: m.width || '',
            length: m.length || '',
            count: m.count || '',
            join: normalizeMeasureJoin(m.join)
        }));
        defect.crackWidth = measures.map((m) => m.width).filter(Boolean).join(' / ');
        defect.crackLength = measures.map((m) => m.length).filter(Boolean).join(' / ');
        const counts = measures.map((m) => m.count).filter(Boolean);
        if (counts.length) defect.itemCount = counts.join(' / ');
        const composed = measures.map(formatCrackMeasurePair).filter(Boolean).join(', ');
        defect.size = composed || sizeFallback || defect.size || '';
        return true;
    }

    /** 폭·길이: 0.3 처럼 소수 있으면 유지, 2·5·4 처럼 정수만이면 .0 붙임 */
    function normalizeCrackDecimalText(raw) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s) return '';
        if (/^\d+\.\d+$/.test(s)) return s;
        if (/^\d+$/.test(s)) return `${s}.0`;
        return s;
    }

    /**
     * 규모 문자열의 -nEA 앞을 한 칸 띄움 (0.3/2.0-2EA → 0.3/2.0 -2EA).
     * 화면/엑셀은 공백 유지. 한글 칸의 문단 분리는 insertHwpxEaCountLineBreaks.
     */
    function normalizeEaSpacingInText(raw) {
        return String(raw == null ? '' : raw)
            .replace(/([^\s\n])[ \t]*-(\d+)\s*EA\b/gi, '$1 -$2EA');
    }

    /**
     * HWPX 셀: 측정값과 -nEA 갯수 접미사 사이를 문단 줄바꿈으로 나눔.
     * wrapHwpxCellText가 CR/LF를 공백으로 평탄화한 뒤에 호출해야 줄바꿈이 살아남는다.
     * 0.3~0.7/0.5 -12EA → 0.3~0.7/0.5\n-12EA
     */
    function insertHwpxEaCountLineBreaks(raw) {
        return String(raw == null ? '' : raw)
            .replace(/([^\s\n])[ \t]*-(\d+)\s*EA\b/gi, '$1\n-$2EA');
    }

    function formatCrackMeasurePair(m) {
        const join = normalizeMeasureJoin(m && m.join);
        // 폭 칸에 "Cw:0.3"이 그대로 들어간 예전 값 → "Cw:Cw:0.3" 으로 두 번 붙지 않게
        const w = normalizeCrackDecimalText(String((m && m.width) || '').replace(/^\s*Cw\s*[:=]\s*/i, ''));
        const l = normalizeCrackDecimalText((m && m.length) || '');
        const n = String((m && m.count) || '').trim();
        // 한 칸 띄움: 화면/엑셀용. HWPX는 wrapHwpxCellText가 -nEA 앞을 문단 분리.
        const eaSuffix = n ? ` -${n}EA` : '';

        if (join === 'x') {
            if (w && l) return normalizeEaSpacingInText(`${w}x${l}${eaSuffix}`);
            if (w) return normalizeEaSpacingInText(n ? `Cw:${w}${eaSuffix}` : `Cw:${w}`);
            if (l) return normalizeEaSpacingInText(n ? `${l}m -${n}EA` : `${l}m`);
            if (n) return `${n}EA`;
            return '';
        }

        // 한글(HWPX) 관례: 길이 없이 폭만(또는 폭+개수)이면 Cw:n.n / Cw:n.n -2EA
        if (w && !l) return normalizeEaSpacingInText(`Cw:${w}${eaSuffix}`);
        if (w && l) return normalizeEaSpacingInText(`${w}/${l}${eaSuffix}`);
        if (l) return normalizeEaSpacingInText(n ? `${l}m -${n}EA` : `${l}m`);
        if (n) return `${n}EA`;
        return '';
    }

    /**
     * 2026-10-30 한글(HWPX) 상태조사표 전용: 단위를 붙인 규모 글자.
     * 폭만 → Cw:0.3 (mm 안 붙임) / 길이만 → L: 5m / 개수만 → 3EA / 폭+길이 → 0.3/5.0 단위 없이 (-nEA는 그대로 뒤에).
     * 「x」(가로x세로) 표기는 단위가 정해져 있지 않아 예전 그대로 둔다. 화면·PDF·엑셀은 바꾸지 않는다.
     */
    function formatCrackMeasurePairHwpx(m) {
        const join = normalizeMeasureJoin(m && m.join);
        if (join === 'x') return formatCrackMeasurePair(m);
        const strip = (v, re) => String(v == null ? '' : v).replace(re, '').trim();
        const w = normalizeCrackDecimalText(strip(String((m && m.width) || '').replace(/^\s*Cw\s*[:=]\s*/i, ''), /\s*(mm|㎜)\s*$/i));
        const l = normalizeCrackDecimalText(strip(String((m && m.length) || '').replace(/^\s*L\s*[:=]\s*/i, ''), /\s*m\s*$/i));
        const n = strip((m && m.count) || '', /\s*EA\s*$/i);
        const eaSuffix = n ? ` -${n}EA` : '';
        if (w && !l) return normalizeEaSpacingInText(`Cw:${w}${eaSuffix}`); // 2026-11-02 폭 뒤 mm 빼기(사용자): Cw:0.3
        if (w && l) return normalizeEaSpacingInText(`${w}/${l}${eaSuffix}`); // 2026-10-31 폭+길이는 단위 없이 예전 표기(사용자)
        if (l) return normalizeEaSpacingInText(`L: ${l}m${eaSuffix}`);
        if (n) return `${n}EA`;
        return '';
    }

    /**
     * 「규모 및 상태」 글자가 측정값 표기(폭/길이/개수)뿐인가 — 그렇다면 폭·길이·개수 행을 고칠 때 같이 따라 바뀐다.
     * 2026-10-06: 저장된 규모가 지금 조립 글자와 한 글자라도 다르면(0.3mm/2.0m, 개수가 itemCount에만 있던 0.3/2.0 등)
     * 손으로 쓴 글자로 보고 안 바꿨다. 그래서 결함 수정창에서 폭을 고쳐도 규모(조사표에 보이는 값)는 옛 폭 그대로였다.
     * 조사표 크기 팝업은 늘 다시 조립해서 거기서는 됐다. 측정 표기가 아닌 글자(예: "W=0.2mm, 누수 흔적")는 그대로 둔다.
     */
    function isMeasureOnlySizeText(raw) {
        const t = String(raw == null ? '' : raw)
            .replace(/㎜/g, 'mm')
            .replace(/\u00d7/g, 'x')
            .replace(/\s+/g, '')
            .toLowerCase();
        if (!t || t === '-') return true;
        const num = '\\d+(?:\\.\\d+)?';
        const ea = '(?:-?\\d+ea)?';
        const item = `(?:(?:cw[:=])?${num}(?:~${num})?(?:mm)?(?:[/x*]${num}(?:mm|m)?)?${ea}|${num}m${ea}|\\d+ea)`;
        return new RegExp(`^${item}(?:[,;·/]?${item})*$`).test(t);
    }

    /** 폭·길이·개수 행 목록 — 기본은 결함 수정창, 조사표 크기 팝업은 자기 목록을 넘긴다 */
    function crackMeasureListEl(listEl) {
        return listEl || document.getElementById('defectCrackMeasureList');
    }

    function getCrackMeasuresFromUi(listEl) {
        const list = crackMeasureListEl(listEl);
        if (!list) return [];
        return Array.from(list.querySelectorAll('.defect-crack-measure-row')).map(row => {
            const w = normalizeCrackDecimalText(row.querySelector('[data-crack-w]')?.value || '');
            const l = normalizeCrackDecimalText(row.querySelector('[data-crack-l]')?.value || '');
            const n = (row.querySelector('[data-crack-n]')?.value || '').trim();
            const join = normalizeMeasureJoin(row.querySelector('[data-crack-join]')?.dataset.join);
            return { width: w, length: l, count: n, join };
        }).filter(m => m.width || m.length || m.count);
    }

    function readCrackMeasureRowsFromDom(listEl) {
        const list = crackMeasureListEl(listEl);
        if (!list) return [];
        return Array.from(list.querySelectorAll('.defect-crack-measure-row')).map(row => ({
            width: (row.querySelector('[data-crack-w]')?.value || '').trim(),
            length: (row.querySelector('[data-crack-l]')?.value || '').trim(),
            count: (row.querySelector('[data-crack-n]')?.value || '').trim(),
            join: normalizeMeasureJoin(row.querySelector('[data-crack-join]')?.dataset.join)
        }));
    }

    function syncHiddenCrackFieldsFromMeasures(measures) {
        const rows = measures || getCrackMeasuresFromUi();
        const wEl = document.getElementById('defectCrackWidth');
        const lEl = document.getElementById('defectCrackLength');
        const nEl = document.getElementById('defectItemCount');
        const widths = rows.map(m => m.width).filter(Boolean);
        const lengths = rows.map(m => m.length).filter(Boolean);
        const counts = rows.map(m => m.count).filter(Boolean);
        if (wEl) wEl.value = widths.join(' / ');
        if (lEl) lEl.value = lengths.join(' / ');
        if (nEl) nEl.value = counts.join(' / ');
    }

    function composeDefectSizeFromMeasures() {
        const rows = getCrackMeasuresFromUi();
        if (rows.length) {
            return rows.map(formatCrackMeasurePair).filter(Boolean).join(', ');
        }
        const w = (document.getElementById('defectCrackWidth')?.value || '').trim();
        const l = (document.getElementById('defectCrackLength')?.value || '').trim();
        const n = (document.getElementById('defectItemCount')?.value || '').trim();
        return formatCrackMeasurePair({ width: w, length: l, count: n, join: '/' });
    }

    function syncSizeFromMeasureInputs() {
        syncHiddenCrackFieldsFromMeasures();
        const sizeEl = document.getElementById('defectSize');
        if (!sizeEl) return;
        const composed = composeDefectSizeFromMeasures();
        if (!sizeEl.value.trim() || sizeEl.dataset.autoSize === '1') {
            sizeEl.value = composed;
            sizeEl.dataset.autoSize = composed ? '1' : '';
        }
    }

    function applyCrackMeasureJoinToRow(row, join) {
        if (!row) return;
        const mode = normalizeMeasureJoin(join);
        const btn = row.querySelector('[data-crack-join]');
        const wUnit = row.querySelector('[data-crack-w-unit]');
        if (btn) {
            btn.dataset.join = mode;
            btn.textContent = mode;
            btn.title = mode === 'x'
                ? 'x 모드(폭·길이 모두 m) — 누르면 / 로 전환'
                : '/ 모드(폭 mm · 길이 m) — 누르면 x 로 전환';
        }
        if (wUnit) wUnit.textContent = mode === 'x' ? 'm' : 'mm';
    }

    /**
     * opts.list: 다른 목록(조사표 크기 팝업)에 그린다. opts.onChange: 그때는 결함 수정창 자동 저장 대신 이걸 부른다.
     */
    function renderCrackMeasureRows(measures, opts) {
        const list = crackMeasureListEl(opts && opts.list);
        if (!list) return;
        const onChange = (opts && typeof opts.onChange === 'function') ? opts.onChange : null;
        const isModalList = !(opts && opts.list);
        const afterEdit = () => {
            if (onChange) { onChange(); return; }
            if (isDefectBulkEditMode()) markDefectBulkFieldChanged('crackMeasures');
            syncSizeFromMeasureInputs();
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        };
        const rows = (Array.isArray(measures) && measures.length)
            ? measures.map(m => ({
                width: m.width || m.w || '',
                length: m.length || m.l || '',
                count: m.count || m.n || '',
                join: normalizeMeasureJoin(m.join)
            }))
            : [{ width: '', length: '', count: '', join: '/' }];
        list.innerHTML = rows.map((m, idx) => `
            <div class="defect-crack-measure-row" data-row-idx="${idx}">
                <label class="defect-measure-btn">
                    <span class="defect-measure-name">폭</span>
                    <input type="text" data-crack-w inputmode="decimal" placeholder="직접입력" autocomplete="off" value="${String(m.width || '').replace(/"/g, '&quot;')}">
                    <span class="defect-measure-unit" data-crack-w-unit>${m.join === 'x' ? 'm' : 'mm'}</span>
                </label>
                <button type="button" class="defect-measure-join-toggle" tabindex="-1" data-crack-join="${m.join}" title="${m.join === 'x' ? 'x 모드(폭·길이 모두 m) — 누르면 / 로 전환' : '/ 모드(폭 mm · 길이 m) — 누르면 x 로 전환'}">${m.join}</button>
                <label class="defect-measure-btn">
                    <span class="defect-measure-name">길이</span>
                    <input type="text" data-crack-l inputmode="decimal" placeholder="직접입력" autocomplete="off" value="${String(m.length || '').replace(/"/g, '&quot;')}">
                    <span class="defect-measure-unit">m</span>
                </label>
                <label class="defect-measure-btn">
                    <span class="defect-measure-name">개수</span>
                    <input type="text" data-crack-n inputmode="numeric" placeholder="직접입력" autocomplete="off" value="${String(m.count || '').replace(/"/g, '&quot;')}">
                    <span class="defect-measure-unit">개</span>
                </label>
                <button type="button" class="defect-crack-measure-del" tabindex="-1" title="이 행 삭제" ${rows.length <= 1 ? 'disabled' : ''}>
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
        list.querySelectorAll('input').forEach(inp => {
            inp.addEventListener('input', afterEdit);
            // 폭·길이: 정수만 입력하면 포커스 아웃 시 .0 표시
            if (inp.hasAttribute('data-crack-w') || inp.hasAttribute('data-crack-l')) {
                inp.addEventListener('blur', () => {
                    const next = normalizeCrackDecimalText(inp.value);
                    if (next !== inp.value) inp.value = next;
                    afterEdit();
                });
            }
        });
        list.querySelectorAll('[data-crack-join]').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.defect-crack-measure-row');
                const next = normalizeMeasureJoin(btn.dataset.join) === 'x' ? '/' : 'x';
                applyCrackMeasureJoinToRow(row, next);
                afterEdit();
            });
        });
        list.querySelectorAll('.defect-crack-measure-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!await window.confirmDelete('이 규격(폭·길이·개수) 행을 삭제할까요?')) return;
                const row = btn.closest('.defect-crack-measure-row');
                const idx = row ? parseInt(row.getAttribute('data-row-idx') || '0', 10) : -1;
                const allRows = readCrackMeasureRowsFromDom(list);
                if (idx >= 0 && allRows.length > 1) {
                    allRows.splice(idx, 1);
                    renderCrackMeasureRows(allRows.length ? allRows : [{ width: '', length: '', count: '', join: '/' }], opts);
                    afterEdit();
                }
            });
        });
        if (isModalList) syncHiddenCrackFieldsFromMeasures(getCrackMeasuresFromUi());
    }

    /**
     * 편집용 한 행 정리: 폭 칸에 "Cw:0.3" / "Cw:0.3 -2EA" / "0.3mm" 처럼 규모 글자가 들어가 있으면
     * (엑셀·한글 가져오기·예전 조사표 입력) 숫자로 풀어 키패드로 고칠 수 있게 한다.
     */
    function normalizeCrackMeasureForEdit(m) {
        const out = { width: String(m.width || '').trim(), length: String(m.length || '').trim(), count: String(m.count || '').trim(), join: m.join };
        if (out.width && !/^[\d.~,\s]*$/.test(out.width)) {
            const parsed = parseSizeTextToCrackMeasures(out.width);
            if (parsed.length === 1) {
                out.width = parsed[0].width || '';
                if (!out.length && parsed[0].length) { out.length = parsed[0].length; out.join = parsed[0].join; }
                if (!out.count && parsed[0].count) out.count = parsed[0].count;
            } else {
                out.width = out.width.replace(/^Cw\s*[:=]\s*/i, '').replace(/\s*(mm|㎜)$/i, '');
            }
        }
        if (out.length && /m$/i.test(out.length)) out.length = out.length.replace(/\s*m$/i, '');
        return out;
    }

    /** 결함 → 폭·길이·개수 편집 행 (결함 수정창·조사표 크기 팝업 공용) */
    function getDefectCrackMeasureRowsForEdit(defect) {
        let measures = [];
        if (defect && Array.isArray(defect.crackMeasures) && defect.crackMeasures.length) {
            const hasRowCount = defect.crackMeasures.some(m => m && m.count != null && String(m.count).trim() !== '');
            measures = defect.crackMeasures.map((m) => ({
                width: m.width != null ? String(m.width) : '',
                length: m.length != null ? String(m.length) : '',
                count: m.count != null ? String(m.count) : '',
                join: inferMeasureJoin(defect, m)
            }));
            if (!hasRowCount && String(defect.itemCount || '').trim()) {
                const ns = String(defect.itemCount).split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
                measures.forEach((m, i) => {
                    m.count = ns[i] || (i === 0 && ns.length === 1 ? ns[0] : '');
                });
            }
        } else if (defect) {
            const ws = String(defect.crackWidth || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const ls = String(defect.crackLength || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const ns = String(defect.itemCount || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
            const join = inferMeasureJoin(defect, null);
            const n = Math.max(ws.length, ls.length, ns.length, 0);
            if (n > 0) {
                for (let i = 0; i < n; i++) {
                    measures.push({ width: ws[i] || '', length: ls[i] || '', count: ns[i] || (i === 0 && ns.length === 1 ? ns[0] : ''), join });
                }
            } else if (String(defect.itemCount || '').trim()) {
                measures.push({ width: '', length: '', count: String(defect.itemCount).trim(), join });
            }
        }
        // 폭·길이·개수가 비었는데 규모 글자만 있으면("Cw:0.3", "0.3/2.0 -2EA", "0.3/3.00.2/3.0") 그걸 풀어 쓴다
        if (!measures.length && defect && String(defect.size || '').trim()) {
            measures = parseSizeTextToCrackMeasures(defect.size, { defectType: defect.defectType });
        }
        return measures.map(normalizeCrackMeasureForEdit);
    }

    function setCrackMeasuresToUi(defect) {
        const measures = getDefectCrackMeasureRowsForEdit(defect);
        renderCrackMeasureRows(measures.length ? measures : [{ width: '', length: '', count: '', join: '/' }]);
    }

    /**
     * 폭·길이·개수 행 → 결함 (결함 수정창 저장과 같은 모양):
     * crackMeasures 행, crackWidth/crackLength/itemCount = " / " 연결, size = 행별 규모 글자 ", " 연결(Cw:0.3 등)
     */
    function applyCrackMeasuresEditToDefect(defect, measures) {
        if (!defect) return;
        const rows = (Array.isArray(measures) ? measures : []).map((m) => ({
            width: normalizeCrackDecimalText(String((m && m.width) || '').trim()),
            length: normalizeCrackDecimalText(String((m && m.length) || '').trim()),
            count: String((m && m.count) || '').trim(),
            join: normalizeMeasureJoin(m && m.join)
        })).filter((m) => m.width || m.length || m.count);
        defect.crackMeasures = rows;
        defect.crackWidth = rows.map((m) => m.width).filter(Boolean).join(' / ');
        defect.crackLength = rows.map((m) => m.length).filter(Boolean).join(' / ');
        defect.itemCount = rows.map((m) => m.count).filter(Boolean).join(' / ');
        defect.size = rows.map(formatCrackMeasurePair).filter(Boolean).join(', ');
    }

    // ---------- 조사표 「결함 크기」 팝업: 결함 수정창과 같은 폭·길이·개수 편집(터치는 전용 키패드) ----------
    const surveySizeEditState = { defectId: null };

    function surveySizePreviewUpdate() {
        const list = document.getElementById('surveySizeMeasureList');
        const out = document.getElementById('surveySizePreview');
        if (!list || !out) return;
        const text = getCrackMeasuresFromUi(list).map(formatCrackMeasurePair).filter(Boolean).join(', ');
        out.textContent = text || '-';
    }

    function closeSurveySizeEditor() {
        const modal = document.getElementById('surveySizeModal');
        if (window.BsaMeasureKeypad && typeof window.BsaMeasureKeypad.isOpen === 'function' && window.BsaMeasureKeypad.isOpen()) {
            window.BsaMeasureKeypad.close();
        }
        surveySizeEditState.defectId = null;
        if (!modal) return;
        modal.classList.remove('open');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    window.closeSurveySizeEditor = closeSurveySizeEditor;

    function saveSurveySizeEditor() {
        const id = surveySizeEditState.defectId;
        const list = document.getElementById('surveySizeMeasureList');
        // 키패드로 치던 칸의 마지막 값까지(완료 안 눌러도) 반영
        if (window.BsaMeasureKeypad && typeof window.BsaMeasureKeypad.isOpen === 'function' && window.BsaMeasureKeypad.isOpen()) {
            window.BsaMeasureKeypad.close();
        }
        const rows = list ? getCrackMeasuresFromUi(list) : [];
        closeSurveySizeEditor();
        if (!id) return;
        window.updateSurveyInlineField(id, 'crackMeasures', JSON.stringify(rows));
    }

    function bindSurveySizeEditor() {
        const modal = document.getElementById('surveySizeModal');
        if (!modal || modal.dataset.bound === '1') return modal;
        modal.dataset.bound = '1';
        const list = document.getElementById('surveySizeMeasureList');
        document.getElementById('btnSurveySizeAdd')?.addEventListener('click', () => {
            const rows = readCrackMeasureRowsFromDom(list);
            rows.push({ width: '', length: '', count: '', join: '/' });
            renderCrackMeasureRows(rows, { list, onChange: surveySizePreviewUpdate });
            surveySizePreviewUpdate();
            const last = list.querySelector('.defect-crack-measure-row:last-child [data-crack-w]');
            if (last) try { last.focus(); } catch (_e) { /* ignore */ }
        });
        document.getElementById('btnSurveySizeSave')?.addEventListener('click', saveSurveySizeEditor);
        document.getElementById('btnSurveySizeCancel')?.addEventListener('click', closeSurveySizeEditor);
        document.getElementById('btnCloseSurveySize')?.addEventListener('click', closeSurveySizeEditor);
        // 바깥(어두운 곳) 누르기 = 닫기. 키패드는 body에 붙어 있고 자기 누르기를 삼키므로 여기 안 온다.
        modal.addEventListener('click', (e) => { if (e.target === modal) closeSurveySizeEditor(); });
        return modal;
    }

    window.openSurveySizeEditor = function(defectId) {
        if (window.event && window.event.stopPropagation) window.event.stopPropagation();
        const located = findDefectAcrossBuildingFloors(defectId);
        const key = located ? located.floorKey : `${state.currentBuildingId}_${state.currentFloor}`;
        const all = state.defects[key] || [];
        const self = all.find((d) => d && d.id === defectId);
        // 그룹(마킹 추가) 줄은 표에 보이는 값(묶음 대표)으로 연다 — 저장은 updateSurveyInlineField가 멤버에 나눠 쓴다
        const shown = (typeof consolidateDefectGroups === 'function')
            ? consolidateDefectGroups(all).find((g) => g.id === defectId || (g._groupMemberIds && g._groupMemberIds.indexOf(defectId) !== -1))
            : null;
        const src = shown || self;
        if (!src || isGoodDefectType(src.defectType)) return;
        const modal = bindSurveySizeEditor();
        const list = document.getElementById('surveySizeMeasureList');
        if (!modal || !list) return;
        surveySizeEditState.defectId = defectId;
        const rows = getDefectCrackMeasureRowsForEdit(src);
        renderCrackMeasureRows(rows.length ? rows : [{ width: '', length: '', count: '', join: '/' }], { list, onChange: surveySizePreviewUpdate });
        const sub = document.getElementById('surveySizeSub');
        if (sub) sub.textContent = [src.no ? `No.${src.no}` : '', memberNameOut(src.component) || '', src.defectType || ''].filter(Boolean).join(' · ');
        surveySizePreviewUpdate();
        modal.classList.add('open');
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
    };

    function bindDefectMeasureInputs() {
        const addBtn = document.getElementById('btnAddCrackMeasure');
        if (addBtn && !addBtn.dataset.measureBound) {
            addBtn.dataset.measureBound = '1';
            addBtn.addEventListener('click', () => {
                if (isDefectBulkEditMode()) markDefectBulkFieldChanged('crackMeasures');
                const rows = readCrackMeasureRowsFromDom();
                rows.push({ width: '', length: '', count: '', join: '/' });
                renderCrackMeasureRows(rows);
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
        }
        const sizeEl = document.getElementById('defectSize');
        if (sizeEl && !sizeEl.dataset.autoSizeBound) {
            sizeEl.dataset.autoSizeBound = '1';
            sizeEl.addEventListener('input', () => {
                sizeEl.dataset.autoSize = '';
            });
        }
        if (!document.getElementById('defectCrackMeasureList')?.dataset.inited) {
            const list = document.getElementById('defectCrackMeasureList');
            if (list) list.dataset.inited = '1';
            renderCrackMeasureRows([{ width: '', length: '', count: '', join: '/' }]);
        }
        bindNdtCrackMonitorInputs();
    }

    function emptyCrackGaugeLog() {
        return { gaugeNo: '', installDate: '', initialX: '', initialY: '', prevPhoto: '', currPhoto: '', readings: [] };
    }

    function emptyCrackTipLog() {
        return { initialLengthMm: '', prevPhoto: '', currPhoto: '', readings: [] };
    }

    function normalizeCrackMonitorPhoto(raw) {
        if (raw == null) return '';
        const s = String(raw).trim();
        if (!s) return '';
        // data URL or http(s) / blob URL for display & HWPX
        return s;
    }

    function normalizeCrackGaugeLog(raw) {
        const base = emptyCrackGaugeLog();
        if (!raw || typeof raw !== 'object') return base;
        base.gaugeNo = raw.gaugeNo != null ? String(raw.gaugeNo) : '';
        base.installDate = raw.installDate != null ? String(raw.installDate) : '';
        base.initialX = raw.initialX != null ? String(raw.initialX) : '';
        base.initialY = raw.initialY != null ? String(raw.initialY) : '';
        base.prevPhoto = normalizeCrackMonitorPhoto(raw.prevPhoto);
        base.currPhoto = normalizeCrackMonitorPhoto(raw.currPhoto);
        // 사진 번호(IndexedDB·클라우드 사진 — js/core/gauge-photo-store.js). 있으면 그대로 둔다.
        if (raw.prevPhotoId) base.prevPhotoId = String(raw.prevPhotoId);
        if (raw.currPhotoId) base.currPhotoId = String(raw.currPhotoId);
        base.readings = Array.isArray(raw.readings)
            ? raw.readings.map((r) => ({
                roundKey: r && r.roundKey != null ? String(r.roundKey) : '',
                date: r && r.date != null ? String(r.date) : '',
                xMm: r && r.xMm != null ? String(r.xMm) : '',
                yMm: r && r.yMm != null ? String(r.yMm) : '',
                note: r && r.note != null ? String(r.note) : ''
            }))
            : [];
        return base;
    }

    function normalizeCrackTipLog(raw) {
        const base = emptyCrackTipLog();
        if (!raw || typeof raw !== 'object') return base;
        base.initialLengthMm = raw.initialLengthMm != null ? String(raw.initialLengthMm) : '';
        base.prevPhoto = normalizeCrackMonitorPhoto(raw.prevPhoto);
        base.currPhoto = normalizeCrackMonitorPhoto(raw.currPhoto);
        // 사진 번호(IndexedDB·클라우드 사진 — js/core/gauge-photo-store.js). 있으면 그대로 둔다.
        if (raw.prevPhotoId) base.prevPhotoId = String(raw.prevPhotoId);
        if (raw.currPhotoId) base.currPhotoId = String(raw.currPhotoId);
        base.readings = Array.isArray(raw.readings)
            ? raw.readings.map((r) => ({
                roundKey: r && r.roundKey != null ? String(r.roundKey) : '',
                date: r && r.date != null ? String(r.date) : '',
                lengthMm: r && r.lengthMm != null ? String(r.lengthMm) : '',
                incrementMm: r && r.incrementMm != null ? String(r.incrementMm) : '',
                note: r && r.note != null ? String(r.note) : ''
            }))
            : [];
        return base;
    }

    // 2026-11-10 「게이지는 (움직인) 방향을 알려줘야 해서」: 게이지 X·Y 값 맨 앞에 방향 글자(← → ↑ ↓)를 붙일 수 있다.
    // 셈할 때는 방향이 부호다 — → · ↓ = +, ← · ↑ = − (방향 없이 적은 예전 값이 한글 출력에서 X는 →, Y는 ↓로 나가던 것과 같은 쪽).
    const MONITOR_DIR_RE = /^\s*([←→↑↓])\s*/;
    function monitorDirectionOf(raw) {
        const m = String(raw == null ? '' : raw).match(MONITOR_DIR_RE);
        return m ? m[1] : '';
    }
    function parseMonitorNumber(raw) {
        let s = String(raw == null ? '' : raw).trim().replace(/,/g, '');
        if (!s) return null;
        const dir = monitorDirectionOf(s);
        if (dir) {
            s = s.replace(MONITOR_DIR_RE, '').trim();
            if (!s) return null; // 방향만 있고 숫자가 없음
        }
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        return (dir === '←' || dir === '↑') && n !== 0 ? -n : n;
    }
    /** 이 게이지 기록의 그 축(x|y)에 방향을 붙여 적은 값이 하나라도 있는가 */
    function gaugeLogUsesDirection(log, axis) {
        if (!log) return false;
        const key = axis === 'y' ? 'yMm' : 'xMm';
        if (monitorDirectionOf(axis === 'y' ? log.initialY : log.initialX)) return true;
        return (log.readings || []).some((r) => r && monitorDirectionOf(r[key]));
    }
    /** 게이지 누적·전차 대비 — 방향을 적은 기록이면 +/− 대신 방향 글자로(→0.5, ↑0.2), 아니면 예전처럼 +0.5 */
    function formatGaugeDelta(axis, n, log) {
        if (n == null || !Number.isFinite(n) || !gaugeLogUsesDirection(log, axis)) return formatMonitorDelta(n);
        const rounded = Math.round(n * 100) / 100;
        if (rounded === 0) return '0';
        const dir = axis === 'y' ? (rounded > 0 ? '↓' : '↑') : (rounded > 0 ? '→' : '←');
        return dir + String(Math.abs(rounded));
    }

    function formatMonitorDelta(n) {
        if (n == null || !Number.isFinite(n)) return '-';
        const rounded = Math.round(n * 100) / 100;
        return (rounded > 0 ? '+' : '') + String(rounded);
    }

    function computeGaugeDeltas(log, reading) {
        // 누적 = 현회 측정값 − 초기치
        const ix = parseMonitorNumber(log.initialX);
        const iy = parseMonitorNumber(log.initialY);
        const x = parseMonitorNumber(reading && reading.xMm);
        const y = parseMonitorNumber(reading && reading.yMm);
        return {
            dx: (ix != null && x != null) ? x - ix : null,
            dy: (iy != null && y != null) ? y - iy : null
        };
    }

    function computeGaugePrevDeltas(log, readingIndex) {
        // 전차 대비 = 현회 − 직전 회차
        const readings = (log && log.readings) || [];
        const reading = readings[readingIndex];
        if (!reading || readingIndex <= 0) return { dx: null, dy: null };
        const prev = readings[readingIndex - 1];
        const x = parseMonitorNumber(reading.xMm);
        const y = parseMonitorNumber(reading.yMm);
        const px = parseMonitorNumber(prev && prev.xMm);
        const py = parseMonitorNumber(prev && prev.yMm);
        return {
            dx: (px != null && x != null) ? x - px : null,
            dy: (py != null && y != null) ? y - py : null
        };
    }

    function computeTipCumulative(log, readingIndex) {
        // 누적 = 현회 길이 − 초기치 (증가량 합산이 아니라 초기치 대비)
        const initial = parseMonitorNumber(log.initialLengthMm);
        const readings = log.readings || [];
        const r = readings[readingIndex];
        if (!r) return null;
        const len = parseMonitorNumber(r.lengthMm);
        if (initial != null && len != null) return len - initial;
        const inc = parseMonitorNumber(r.incrementMm);
        if (inc == null) return null;
        // 길이 미입력 시에만: 증가량을 1회차부터 합산한 값을 누적으로 사용
        let cumulative = 0;
        for (let i = 0; i <= readingIndex; i += 1) {
            const row = readings[i];
            const rowInc = parseMonitorNumber(row && row.incrementMm);
            if (rowInc != null) cumulative += rowInc;
        }
        return cumulative;
    }

    function computeTipPrevDelta(log, readingIndex) {
        // 전차 대비 = 현회 길이 − 직전 회차 길이 (없으면 증가량)
        const readings = (log && log.readings) || [];
        const r = readings[readingIndex];
        if (!r || readingIndex <= 0) return null;
        const prev = readings[readingIndex - 1];
        const len = parseMonitorNumber(r.lengthMm);
        const prevLen = parseMonitorNumber(prev && prev.lengthMm);
        if (len != null && prevLen != null) return len - prevLen;
        return parseMonitorNumber(r.incrementMm);
    }

    function defaultCrackMonitorRoundKey() {
        const bldg = state.currentBuilding;
        return (bldg && typeof getBuildingSurveyRoundKey === 'function')
            ? (getBuildingSurveyRoundKey(bldg) || '')
            : (getCurrentSurveyRoundKey ? getCurrentSurveyRoundKey() : '');
    }

    function defaultCrackMonitorDate() {
        return new Date().toISOString().split('T')[0];
    }

    function defectNeedsCrackMonitorUi(defect) {
        if (!defect) return false;
        const type = String(defect.defectType || '');
        return type.includes('균열');
    }

    // 2026-09-28: 균열 게이지는 균열 결함에서 고르지 않고 비파괴 탭 「균열 게이지·팁」에서 도면에
    // 직접 찍는다. 찍은 게이지는 비파괴 항목(state.ndtData, category '균열모니터')으로 저장되어
    // 층 동기화·묘비·백업을 그대로 탄다. 예전처럼 균열 결함(crackGaugeLog/crackTipLog)에 붙어
    // 있는 기록은 지우거나 옮기지 않고 그 결함 핀으로 계속 열고 고치고 내보낸다.
    // (카테고리 문자열은 const로 빼지 않는다 — 초기화 전에 동기화 병합 등에서 불려도 TDZ 오류가 나지 않게)
    function isCrackGaugeNdtItem(item) {
        return !!item && item.category === '균열모니터';
    }

    function crackMonitorLogsHaveData(rec) {
        if (!rec) return false;
        const gRaw = rec.crackGaugeLog;
        const tRaw = rec.crackTipLog;
        const gauge = normalizeCrackGaugeLog(gRaw);
        const tip = normalizeCrackTipLog(tRaw);
        const flag = (raw) => !!(raw && typeof raw === 'object' && (raw.hasPrevPhoto || raw.hasCurrPhoto));
        const hasGauge = !!(gauge.gaugeNo || gauge.initialX || gauge.initialY || gauge.prevPhoto || gauge.currPhoto
            || (gauge.readings && gauge.readings.length) || flag(gRaw));
        const hasTip = !!(tip.initialLengthMm || tip.prevPhoto || tip.currPhoto
            || (tip.readings && tip.readings.length) || flag(tRaw));
        return hasGauge || hasTip;
    }

    /** 예전 방식: 균열 결함에 게이지·팁 기록이 붙어 있는 것 (새로 고르는 목록은 더 없음) */
    function isLegacyCrackMonitorDefect(defect) {
        return defectNeedsCrackMonitorUi(defect) && crackMonitorLogsHaveData(defect);
    }

    function getCurrentFloorCrackMonitorDefects() {
        return filterMapPlacedDefects(getCurrentFloorDefects()).filter(isLegacyCrackMonitorDefect);
    }

    function getCurrentFloorCrackGaugeMarks() {
        return sortCrackGaugesByNo(getCurrentFloorNdtData().filter(isCrackGaugeNdtItem), getCrackGaugeMarkDisplayNo);
    }

    /**
     * 게이지 번호 순(G-04 → G-05 → G-06). 번호를 고쳐도 찍은 순서로 나오던 문제(2026-10-22).
     * 번호 없는 것은 뒤로, 같은 번호·번호 없음끼리는 원래 순서 유지.
     */
    function sortCrackGaugesByNo(list, getNo) {
        const keyOf = (raw) => {
            const s = String(raw || '').trim();
            const m = s.match(/(\d+)/);
            return { n: m ? parseInt(m[1], 10) : Infinity, s };
        };
        return (list || [])
            .map((it, idx) => ({ it, idx, k: keyOf(getNo(it)) }))
            .sort((a, b) => (a.k.n - b.k.n) || (a.k.n === Infinity ? 0 : a.k.s.localeCompare(b.k.s)) || (a.idx - b.idx))
            .map((x) => x.it);
    }

    function getCrackGaugeMarkDisplayNo(item) {
        if (!item) return '';
        const g = item.crackGaugeLog && item.crackGaugeLog.gaugeNo != null ? String(item.crackGaugeLog.gaugeNo).trim() : '';
        return g || String(item.no || '').trim();
    }

    /** 새 게이지 번호 G-01, G-02 … — 건물 전체(모든 층)의 게이지 마킹·예전 결함 게이지 번호 다음 */
    function getNextCrackGaugeLabel() {
        const bid = state.currentBuildingId;
        let maxN = 0;
        const bump = (raw) => {
            const m = String(raw || '').match(/(\d+)/);
            if (m) maxN = Math.max(maxN, parseInt(m[1], 10) || 0);
        };
        if (bid) {
            const prefix = `${bid}_`;
            Object.keys(state.ndtData || {}).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (state.ndtData[k] || []).forEach((it) => {
                    if (!isCrackGaugeNdtItem(it)) return;
                    bump(it.no);
                    if (it.crackGaugeLog) bump(it.crackGaugeLog.gaugeNo);
                });
            });
            Object.keys(state.defects || {}).forEach((k) => {
                if (!k.startsWith(prefix)) return;
                (state.defects[k] || []).forEach((d) => {
                    if (d && d.crackGaugeLog && d.crackGaugeLog.gaugeNo) bump(d.crackGaugeLog.gaugeNo);
                });
            });
        }
        return `G-${String(maxN + 1).padStart(2, '0')}`;
    }

    /** 도면에 찍은 위치로 균열 게이지 마킹을 만들고 측정 팝업을 연다 */
    function createCrackGaugeMarkAt(pos) {
        if (!state.currentBuildingId || !pos) return null;
        const key = `${state.currentBuildingId}_${state.currentFloor}`;
        if (!state.ndtData) state.ndtData = {};
        if (!state.ndtData[key]) state.ndtData[key] = [];
        const label = getNextCrackGaugeLabel();
        const now = Date.now();
        const gauge = emptyCrackGaugeLog();
        gauge.gaugeNo = label;
        const item = {
            id: `ndt_${now}_${Math.random().toString(36).slice(2, 6)}`,
            no: label,
            category: '균열모니터',
            component: '',
            location: '',
            targetX: pos.targetX,
            targetY: pos.targetY,
            boxX: pos.boxX,
            boxY: pos.boxY,
            x: pos.targetX,
            y: pos.targetY,
            crackGaugeLog: gauge,
            crackTipLog: emptyCrackTipLog(),
            inspectorName: window.state.userName || '',
            createdAt: now,
            updatedAt: now
        };
        state.ndtData[key].push(item);
        selectedNdtIds = new Set([item.id]);
        updateNdtSelectionBar();
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        drawNdtCanvas();
        openNdtCrackMonitorModal(item.id, state.currentFloor);
        return item;
    }

    /** 비파괴 핀 클릭: 균열 게이지 마킹은 게이지·팁 팝업, 나머지는 기존 비파괴 등록창 */
    function openNdtItemEditor(item) {
        if (!item) return;
        if (isCrackGaugeNdtItem(item)) {
            openNdtCrackMonitorModal(item.id, state.currentFloor);
            return;
        }
        openNdtModal(item.x || item.boxX || 0, item.y || item.boxY || 0, item);
    }

    /** 클라우드에 올릴 비파괴 항목 — 균열 게이지 비교사진 dataURL은 빼고 있음 표시만 (결함과 같은 규칙) */
    function stripCrackMonitorPhotosForCloud(items) {
        return (items || []).map((it) => {
            if (!isCrackGaugeNdtItem(it)) return it;
            const out = { ...it };
            ['crackGaugeLog', 'crackTipLog'].forEach((field) => {
                const log = out[field];
                if (!log || typeof log !== 'object') return;
                const { prevPhoto, currPhoto, ...rest } = log;
                out[field] = {
                    ...rest,
                    hasPrevPhoto: !!(prevPhoto && String(prevPhoto).trim()),
                    hasCurrPhoto: !!(currPhoto && String(currPhoto).trim())
                };
            });
            return out;
        });
    }

    /** 원격 병합 뒤 이 기기에만 있는 게이지 비교사진을 살린다 (원격이 지운 표시면 살리지 않음) */
    function carryLocalCrackMonitorPhotos(prevMap, nextMap) {
        if (!prevMap || !nextMap) return nextMap;
        Object.keys(nextMap).forEach((key) => {
            const prevArr = prevMap[key];
            const nextArr = nextMap[key];
            if (!Array.isArray(prevArr) || !prevArr.length || !Array.isArray(nextArr)) return;
            const byId = new Map();
            prevArr.forEach((x) => { if (x && x.id) byId.set(x.id, x); });
            nextArr.forEach((item) => {
                if (!isCrackGaugeNdtItem(item)) return;
                const old = byId.get(item.id);
                if (!old || old === item) return;
                ['crackGaugeLog', 'crackTipLog'].forEach((field) => {
                    const o = old[field];
                    const n = item[field];
                    if (!o || typeof o !== 'object' || !n || typeof n !== 'object') return;
                    [['prevPhoto', 'hasPrevPhoto'], ['currPhoto', 'hasCurrPhoto']].forEach(([slot, flag]) => {
                        const gp = window.BSA && window.BSA.gaugePhotos;
                        // 번호가 다르면 다른 기기가 사진을 바꾼 것 — 옛 사진을 붙이지 않고 새 번호 사진을 받는다
                        const ok = gp ? gp.canCarryLocalPhoto(o, n, slot) : (!n[slot] && o[slot] && n[flag] !== false);
                        if (ok) n[slot] = o[slot];
                    });
                });
            });
        });
        if (typeof scheduleGaugePhotoHydrate === 'function') scheduleGaugePhotoHydrate();
        return nextMap;
    }

    function getCrackMonitorDefectFloorCode(defectId, fallbackFloor) {
        if (window._ndtCrackMonitorFloorCode && window._ndtCrackMonitorDefectId === defectId) {
            return window._ndtCrackMonitorFloorCode;
        }
        return fallbackFloor || state.currentFloor;
    }

    /**
     * 게이지 기록 대상 찾기 — 도면에 찍은 게이지 마킹(kind 'ndt', state.ndtData)과 예전 방식의
     * 균열 결함(kind 'defect', state.defects) 둘 다. 반환의 defect 필드는 호환을 위해 이름만
     * 유지하며, kind 'ndt'면 그 게이지 마킹 항목이다.
     */
    function findCrackMonitorDefectRecord(defectId, floorCode) {
        if (!defectId || !state.currentBuildingId) return null;
        const tryFloor = floorCode || getCrackMonitorDefectFloorCode(defectId);
        const prefix = `${state.currentBuildingId}_`;
        if (tryFloor) {
            const key = `${prefix}${tryFloor}`;
            const hit = (state.defects[key] || []).find((d) => d.id === defectId);
            if (hit) return { defect: hit, floorCode: tryFloor, key, kind: 'defect' };
            const mark = ((state.ndtData && state.ndtData[key]) || []).find((it) => it && it.id === defectId && isCrackGaugeNdtItem(it));
            if (mark) return { defect: mark, floorCode: tryFloor, key, kind: 'ndt' };
        }
        for (const key of Object.keys(state.defects || {})) {
            if (!key.startsWith(prefix)) continue;
            const hit = (state.defects[key] || []).find((d) => d.id === defectId);
            if (hit) return { defect: hit, floorCode: key.slice(prefix.length), key, kind: 'defect' };
        }
        for (const key of Object.keys(state.ndtData || {})) {
            if (!key.startsWith(prefix)) continue;
            const mark = (state.ndtData[key] || []).find((it) => it && it.id === defectId && isCrackGaugeNdtItem(it));
            if (mark) return { defect: mark, floorCode: key.slice(prefix.length), key, kind: 'ndt' };
        }
        return null;
    }

    function crackMonitorRecordIsEditable(rec) {
        if (!rec || !rec.defect) return false;
        return rec.kind === 'ndt' ? isCrackGaugeNdtItem(rec.defect) : defectNeedsCrackMonitorUi(rec.defect);
    }

    function setNdtCrackGaugeMarkFieldsUi(rec) {
        const wrap = document.getElementById('ndtCrackGaugeMarkFields');
        const delBtn = document.getElementById('btnDeleteNdtCrackGaugeMark');
        const isMark = !!(rec && rec.kind === 'ndt');
        if (wrap) wrap.style.display = isMark ? '' : 'none';
        if (delBtn) delBtn.hidden = !isMark;
        const comp = document.getElementById('crackGaugeMarkComponent');
        const loc = document.getElementById('crackGaugeMarkLocation');
        if (comp) comp.value = isMark ? String(memberNameOut(rec.defect.component) || '') : '';
        if (loc) loc.value = isMark ? String(rec.defect.location || '') : '';
        // 위치가 비어 있고 이 층에 행·열 선이 있으면 「층 행·열」을 채워 둔다(손으로 쓴 위치는 그대로)
        if (loc && isMark && !loc.value.trim() && rec.floorCode === state.currentFloor) {
            const grid = computeGridAutoLocationForPoints(getDefectGridPoints(rec.defect), rec.defect.component);
            if (grid) {
                const floor = stripFloorCodeSuffix(window.getFloorLabelFromCode(rec.floorCode)) || '';
                loc.value = `${floor} ${grid}`.trim();
            }
        }
    }

    function isNdtCrackMonitorModalOpen() {
        const modal = document.getElementById('ndtCrackMonitorModal');
        if (!modal) return false;
        return modal.classList.contains('open') || modal.style.display === 'flex';
    }

    function openNdtCrackMonitorModal(defectId, floorCode) {
        if (!defectId) return;
        if (window._ndtCrackMonitorDefectId && window._ndtCrackMonitorDefectId !== defectId) {
            saveNdtCrackMonitorForSelectedDefect({ silent: true });
        }
        selectNdtCrackMonitorDefect(defectId, floorCode);
        const modal = document.getElementById('ndtCrackMonitorModal');
        if (!modal) return;
        const title = document.getElementById('ndtCrackMonitorModalTitle');
        const rec = findCrackMonitorDefectRecord(defectId, floorCode);
        if (title && rec && rec.kind === 'ndt') {
            title.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${escapeSurveyAttr(getCrackGaugeMarkDisplayNo(rec.defect) || '게이지')} · 균열 게이지·팁`;
        } else if (title && rec) {
            const ctx = {
                floorCode: rec.floorCode,
                gradeNo: formatSurveyReportNo(rec.defect, true, rec.floorCode),
                floorDisplayLabel: getGrade3FloorDisplayLabel(rec.floorCode, state.currentBuilding)
            };
            const no = getSurveyCellText('no', rec.defect, ctx) || (rec.defect.no || '').replace(/^NO\.?\s*/i, '');
            title.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${escapeSurveyAttr(no)} · 균열 게이지·팁`;
        }
        syncNdtDrawerToCanvasArea('ndtCrackMonitorModal');
        modal.style.display = 'flex';
        document.body.classList.add('ndt-modal-open');
        window.requestAnimationFrame(() => {
            syncNdtDrawerToCanvasArea('ndtCrackMonitorModal');
            modal.classList.add('open');
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
        });
        if (typeof window.setNdtMode === 'function') window.setNdtMode('PAN');
    }

    function closeNdtCrackMonitorModal(opts) {
        opts = opts || {};
        if (opts.save !== false) saveNdtCrackMonitorForSelectedDefect({ silent: true });
        const modal = document.getElementById('ndtCrackMonitorModal');
        if (!modal) return;
        modal.classList.remove('open');
        if (!isNdtModalOpen() && !isNdtDisplacementModalOpen() && !isNdtDisplacementGroupEditOpen()) {
            document.body.classList.remove('ndt-modal-open');
        }
        window.setTimeout(() => {
            if (modal && !modal.classList.contains('open')) {
                modal.style.display = 'none';
                syncNdtDrawerToCanvasArea('ndtCrackMonitorModal');
            }
        }, 280);
        if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
    }

    function scheduleNdtCrackMonitorSave() {
        if (window._ndtCrackMonitorHydrating) return;
        window.clearTimeout(window._ndtCrackMonitorSaveTimer);
        window._ndtCrackMonitorSaveTimer = window.setTimeout(() => {
            saveNdtCrackMonitorForSelectedDefect({ silent: true });
        }, 500);
    }

    function saveNdtCrackMonitorForSelectedDefect(opts) {
        opts = opts || {};
        const defectId = window._ndtCrackMonitorDefectId;
        if (!defectId || !state.currentBuildingId) return false;
        const rec = findCrackMonitorDefectRecord(defectId, window._ndtCrackMonitorFloorCode);
        if (!rec) return false;
        const { key, floorCode } = rec;
        if (!crackMonitorRecordIsEditable(rec)) return false;
        if (rec.kind === 'ndt') {
            const arr = (state.ndtData && state.ndtData[key]) || [];
            const nIdx = arr.findIndex((it) => it && it.id === defectId);
            if (nIdx < 0) return false;
            const mark = arr[nIdx];
            const gaugeLog = getCrackGaugeLogFromUi();
            mark.crackGaugeLog = gaugeLog;
            mark.crackTipLog = getCrackTipLogFromUi();
            const compEl = document.getElementById('crackGaugeMarkComponent');
            const locEl = document.getElementById('crackGaugeMarkLocation');
            if (compEl) mark.component = compEl.value.trim();
            if (locEl) mark.location = locEl.value.trim();
            // 도면 박스 라벨 = 게이지 No. (비우면 처음 붙인 번호 유지)
            const gNo = String(gaugeLog.gaugeNo || '').trim();
            if (gNo) mark.no = gNo;
            touchNdtUpdatedAt(mark);
            window._ndtCrackMonitorFloorCode = floorCode;
            if (typeof markFloorKeyDirty === 'function') markFloorKeyDirty(key);
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
            if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
            if (typeof renderSurveyCrackMonitorSection === 'function') {
                renderSurveyCrackMonitorSection(state.defects[`${state.currentBuildingId}_${state.currentFloor}`] || []);
            }
            const title = document.getElementById('ndtCrackMonitorModalTitle');
            if (title && isNdtCrackMonitorModalOpen()) {
                title.innerHTML = `<i class="fa-solid fa-chart-line"></i> ${escapeSurveyAttr(getCrackGaugeMarkDisplayNo(mark) || '게이지')} · 균열 게이지·팁`;
            }
            if (typeof drawNdtCanvas === 'function') drawNdtCanvas();
            if (!opts.silent && typeof window.showToast === 'function') window.showToast('균열 게이지·팁 측정을 저장했습니다.', 'success');
            return true;
        }
        const idx = (state.defects[key] || []).findIndex((d) => d.id === defectId);
        if (idx < 0) return false;
        state.defects[key][idx].crackGaugeLog = getCrackGaugeLogFromUi();
        state.defects[key][idx].crackTipLog = getCrackTipLogFromUi();
        state.defects[key][idx].updatedAt = Date.now();
        window._ndtCrackMonitorFloorCode = floorCode;
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof syncStateToFirebase === 'function') syncStateToFirebase();
        if (typeof renderNdtSummaryTable === 'function') renderNdtSummaryTable();
        if (typeof renderSurveyCrackMonitorSection === 'function') {
            renderSurveyCrackMonitorSection(state.defects[key]);
        }
        if (!opts.silent && typeof window.showToast === 'function') window.showToast('균열 게이지·팁 측정을 저장했습니다.', 'success');
        return true;
    }

    function selectNdtCrackMonitorDefect(defectId, floorCode) {
        if (!defectId) {
            clearCrackMonitorLogsUi();
            window._ndtCrackMonitorDefectId = null;
            window._ndtCrackMonitorFloorCode = null;
            const meta = document.getElementById('ndtCrackMonitorDefectMeta');
            if (meta) meta.textContent = '';
            setNdtCrackGaugeMarkFieldsUi(null);
            return;
        }
        const rec = findCrackMonitorDefectRecord(defectId, floorCode);
        if (!rec || !crackMonitorRecordIsEditable(rec)) return;
        window._ndtCrackMonitorDefectId = defectId;
        window._ndtCrackMonitorFloorCode = rec.floorCode;
        window._ndtCrackMonitorHydrating = true;
        setCrackMonitorLogsToUi(rec.defect);
        setNdtCrackGaugeMarkFieldsUi(rec);
        window._ndtCrackMonitorHydrating = false;
        const meta = document.getElementById('ndtCrackMonitorDefectMeta');
        if (meta) {
            meta.textContent = rec.kind === 'ndt'
                ? '도면에 직접 찍은 게이지 마킹'
                : `기존 균열 결함에 연결된 기록 · ${memberNameOut(rec.defect.component) || '부재'} ${rec.defect.defectType || ''}`.trim();
        }
    }

    function renderNdtCrackMonitorSummaryRows(defects) {
        const bldg = state.currentBuilding;
        const floorCode = state.currentFloor;
        return (defects || []).map((d) => {
            const ctx = {
                floorCode,
                gradeNo: formatSurveyReportNo(d, true, floorCode),
                floorDisplayLabel: getGrade3FloorDisplayLabel(floorCode, bldg)
            };
            const no = getSurveyCellText('no', d, ctx) || (d.no || '').replace(/^NO\.?\s*/i, '');
            const title = `${memberNameOut(d.component) || '부재'} ${d.defectType || ''}`.trim();
            const gauge = normalizeCrackGaugeLog(d.crackGaugeLog);
            const gaugeLabel = gauge.gaugeNo ? `No.${gauge.gaugeNo}` : '-';
            const lastGauge = gauge.readings.length ? gauge.readings[gauge.readings.length - 1] : null;
            const gDelta = lastGauge ? computeGaugeDeltas(gauge, lastGauge) : { dx: null, dy: null };
            const xyText = lastGauge
                ? `${lastGauge.xMm || '-'}/${lastGauge.yMm || '-'} (Δ${formatGaugeDelta('x', gDelta.dx, gauge)}/${formatGaugeDelta('y', gDelta.dy, gauge)})`
                : '-';
            const tipSum = summarizeCrackTipLog(d.crackTipLog);
            return `<tr>
                <td>${escapeSurveyAttr(no)}</td>
                <td>${escapeSurveyAttr(title)}</td>
                <td>${escapeSurveyAttr(gaugeLabel)}</td>
                <td>${escapeSurveyAttr(xyText)}</td>
                <td>${escapeSurveyAttr(tipSum)}</td>
                <td><button type="button" class="btn btn-sm btn-outline ndt-crack-monitor-open" onclick="window.openNdtCrackMonitorDefect('${escapeSurveyAttr(d.id)}')">기록</button></td>
            </tr>`;
        }).join('');
    }

    function renderCrackGaugeMarkSummaryRow(item, btnClass) {
        const no = getCrackGaugeMarkDisplayNo(item) || '-';
        const title = [memberNameOut(item.component), item.location].filter((s) => s && String(s).trim()).join(' ') || '균열 게이지';
        const gauge = normalizeCrackGaugeLog(item.crackGaugeLog);
        const gaugeLabel = gauge.gaugeNo ? `No.${gauge.gaugeNo}` : '-';
        const lastGauge = gauge.readings.length ? gauge.readings[gauge.readings.length - 1] : null;
        const gDelta = lastGauge ? computeGaugeDeltas(gauge, lastGauge) : { dx: null, dy: null };
        const xyText = lastGauge
            ? `${lastGauge.xMm || '-'}/${lastGauge.yMm || '-'} (Δ${formatGaugeDelta('x', gDelta.dx, gauge)}/${formatGaugeDelta('y', gDelta.dy, gauge)})`
            : '-';
        const tipSum = summarizeCrackTipLog(item.crackTipLog);
        return `<tr>
                <td>${escapeSurveyAttr(no)}</td>
                <td>${escapeSurveyAttr(title)}</td>
                <td>${escapeSurveyAttr(gaugeLabel)}</td>
                <td>${escapeSurveyAttr(xyText)}</td>
                <td>${escapeSurveyAttr(tipSum)}</td>
                <td><button type="button" class="btn btn-sm btn-outline ${btnClass}" onclick="window.openNdtCrackMonitorDefect('${escapeSurveyAttr(item.id)}')">기록</button></td>
            </tr>`;
    }

    function renderNdtCrackGaugeMarkSummaryRows(items) {
        return (items || []).map((it) => renderCrackGaugeMarkSummaryRow(it, 'ndt-crack-monitor-open')).join('');
    }

    function renderNdtCrackMonitorSection() {
        /* 하단 고정 섹션 제거 — 도면 핀 클릭 시 모달로 대체 */
    }

    window.openNdtCrackMonitorDefect = function(defectId, floorCode) {
        if (window._ndtCrackMonitorDefectId && window._ndtCrackMonitorDefectId !== defectId) {
            saveNdtCrackMonitorForSelectedDefect({ silent: true });
        }
        if (typeof window.switchTab === 'function') window.switchTab('tab-ndt');
        if (typeof window.setNdtCategory === 'function') window.setNdtCategory('균열모니터');
        setTimeout(() => {
            openNdtCrackMonitorModal(defectId, floorCode || state.currentFloor);
        }, 120);
    };

    function updateCrackGaugeReadingComputedCells() {
        const body = document.getElementById('crackGaugeReadingBody');
        if (!body) return;
        const log = getCrackGaugeLogFromUi();
        Array.from(body.querySelectorAll('tr')).forEach((tr, idx) => {
            const reading = log.readings[idx];
            if (!reading) return;
            const deltas = computeGaugeDeltas(log, reading);
            const prevD = computeGaugePrevDeltas(log, idx);
            const cells = tr.querySelectorAll('.monitor-readonly');
            if (cells[0]) cells[0].textContent = formatGaugeDelta('x', deltas.dx, log);
            if (cells[1]) cells[1].textContent = formatGaugeDelta('y', deltas.dy, log);
            if (cells[2]) cells[2].textContent = formatGaugeDelta('x', prevD.dx, log);
            if (cells[3]) cells[3].textContent = formatGaugeDelta('y', prevD.dy, log);
        });
    }

    function updateCrackTipReadingComputedCells() {
        const body = document.getElementById('crackTipReadingBody');
        if (!body) return;
        const log = getCrackTipLogFromUi();
        Array.from(body.querySelectorAll('tr')).forEach((tr, idx) => {
            const cumulative = computeTipCumulative(log, idx);
            const prevDelta = computeTipPrevDelta(log, idx);
            const cells = tr.querySelectorAll('.monitor-readonly');
            if (cells[0]) cells[0].textContent = formatMonitorDelta(cumulative);
            if (cells[1]) cells[1].textContent = formatMonitorDelta(prevDelta);
        });
    }

    function renderCrackGaugeReadingRows(readings) {
        const body = document.getElementById('crackGaugeReadingBody');
        if (!body) return;
        const log = normalizeCrackGaugeLog({
            initialX: document.getElementById('crackGaugeInitialX')?.value || '',
            initialY: document.getElementById('crackGaugeInitialY')?.value || '',
            readings: readings
        });
        const rows = log.readings.length ? log.readings : [{
            roundKey: defaultCrackMonitorRoundKey(),
            date: defaultCrackMonitorDate(),
            xMm: '', yMm: '', note: ''
        }];
        body.innerHTML = rows.map((r, idx) => {
            const deltas = computeGaugeDeltas(log, r);
            const prevD = computeGaugePrevDeltas(log, idx);
            return `<tr data-gauge-row="${idx}">
                <td><input type="text" data-gauge-round value="${escapeSurveyAttr(r.roundKey || '')}" placeholder="회차"></td>
                <td><input type="date" data-gauge-date value="${escapeSurveyAttr(r.date || '')}"></td>
                <td><input type="text" data-gauge-x inputmode="decimal" data-num-keypad-dir value="${escapeSurveyAttr(r.xMm || '')}"></td>
                <td><input type="text" data-gauge-y inputmode="decimal" data-num-keypad-dir value="${escapeSurveyAttr(r.yMm || '')}"></td>
                <td class="monitor-readonly" title="누적(현회−초기)">${formatGaugeDelta('x', deltas.dx, log)}</td>
                <td class="monitor-readonly" title="누적(현회−초기)">${formatGaugeDelta('y', deltas.dy, log)}</td>
                <td class="monitor-readonly" title="전차 대비">${formatGaugeDelta('x', prevD.dx, log)}</td>
                <td class="monitor-readonly" title="전차 대비">${formatGaugeDelta('y', prevD.dy, log)}</td>
                <td><input type="text" data-gauge-note value="${escapeSurveyAttr(r.note || '')}"></td>
                <td><button type="button" class="defect-crack-monitor-del" data-gauge-del ${rows.length <= 1 ? 'disabled' : ''} title="삭제"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        }).join('');
        body.querySelectorAll('input').forEach((inp) => {
            inp.addEventListener('input', () => {
                updateCrackGaugeReadingComputedCells();
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
        body.querySelectorAll('[data-gauge-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = getCrackGaugeLogFromUi().readings;
                const i = Number(btn.closest('tr')?.getAttribute('data-gauge-row'));
                if (!Number.isFinite(i) || next.length <= 1) return;
                next.splice(i, 1);
                renderCrackGaugeReadingRows(next);
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
    }

    function renderCrackTipReadingRows(readings) {
        const body = document.getElementById('crackTipReadingBody');
        if (!body) return;
        const log = normalizeCrackTipLog({
            initialLengthMm: document.getElementById('crackTipInitialLength')?.value || '',
            readings
        });
        const rows = log.readings.length ? log.readings : [{
            roundKey: defaultCrackMonitorRoundKey(),
            date: defaultCrackMonitorDate(),
            lengthMm: '', incrementMm: '', note: ''
        }];
        body.innerHTML = rows.map((r, idx) => {
            const cumulative = computeTipCumulative(log, idx);
            const prevDelta = computeTipPrevDelta(log, idx);
            return `<tr data-tip-row="${idx}">
                <td><input type="text" data-tip-round value="${escapeSurveyAttr(r.roundKey || '')}" placeholder="회차"></td>
                <td><input type="date" data-tip-date value="${escapeSurveyAttr(r.date || '')}"></td>
                <td><input type="text" data-tip-length inputmode="decimal" value="${escapeSurveyAttr(r.lengthMm || '')}"></td>
                <td><input type="text" data-tip-inc inputmode="decimal" value="${escapeSurveyAttr(r.incrementMm || '')}"></td>
                <td class="monitor-readonly" title="누적(현회−초기치)">${formatMonitorDelta(cumulative)}</td>
                <td class="monitor-readonly" title="전차 대비">${formatMonitorDelta(prevDelta)}</td>
                <td><input type="text" data-tip-note value="${escapeSurveyAttr(r.note || '')}"></td>
                <td><button type="button" class="defect-crack-monitor-del" data-tip-del ${rows.length <= 1 ? 'disabled' : ''} title="삭제"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        }).join('');
        body.querySelectorAll('input').forEach((inp) => {
            inp.addEventListener('input', () => {
                updateCrackTipReadingComputedCells();
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
        body.querySelectorAll('[data-tip-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = getCrackTipLogFromUi().readings;
                const i = Number(btn.closest('tr')?.getAttribute('data-tip-row'));
                if (!Number.isFinite(i) || next.length <= 1) return;
                next.splice(i, 1);
                renderCrackTipReadingRows(next);
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
    }

    function getCrackGaugeLogFromUi() {
        const body = document.getElementById('crackGaugeReadingBody');
        const readings = body
            ? Array.from(body.querySelectorAll('tr')).map((tr) => ({
                roundKey: tr.querySelector('[data-gauge-round]')?.value || '',
                date: tr.querySelector('[data-gauge-date]')?.value || '',
                xMm: tr.querySelector('[data-gauge-x]')?.value || '',
                yMm: tr.querySelector('[data-gauge-y]')?.value || '',
                note: tr.querySelector('[data-gauge-note]')?.value || ''
            })).filter((r) => r.roundKey || r.date || r.xMm || r.yMm || r.note)
            : [];
        return normalizeCrackGaugeLog({
            gaugeNo: document.getElementById('crackGaugeNo')?.value || '',
            installDate: document.getElementById('crackGaugeInstallDate')?.value || '',
            initialX: document.getElementById('crackGaugeInitialX')?.value || '',
            initialY: document.getElementById('crackGaugeInitialY')?.value || '',
            prevPhoto: window._crackGaugePrevPhoto || '',
            currPhoto: window._crackGaugeCurrPhoto || '',
            prevPhotoId: crackMonitorUiPhotoId('gauge', 'prev'),
            currPhotoId: crackMonitorUiPhotoId('gauge', 'curr'),
            readings
        });
    }

    function getCrackTipLogFromUi() {
        const body = document.getElementById('crackTipReadingBody');
        const readings = body
            ? Array.from(body.querySelectorAll('tr')).map((tr) => ({
                roundKey: tr.querySelector('[data-tip-round]')?.value || '',
                date: tr.querySelector('[data-tip-date]')?.value || '',
                lengthMm: tr.querySelector('[data-tip-length]')?.value || '',
                incrementMm: tr.querySelector('[data-tip-inc]')?.value || '',
                note: tr.querySelector('[data-tip-note]')?.value || ''
            })).filter((r) => r.roundKey || r.date || r.lengthMm || r.incrementMm || r.note)
            : [];
        return normalizeCrackTipLog({
            initialLengthMm: document.getElementById('crackTipInitialLength')?.value || '',
            prevPhoto: window._crackTipPrevPhoto || '',
            currPhoto: window._crackTipCurrPhoto || '',
            prevPhotoId: crackMonitorUiPhotoId('tip', 'prev'),
            currPhotoId: crackMonitorUiPhotoId('tip', 'curr'),
            readings
        });
    }

    function setCrackMonitorLogsToUi(defect) {
        const gauge = normalizeCrackGaugeLog(defect && defect.crackGaugeLog);
        const tip = normalizeCrackTipLog(defect && defect.crackTipLog);
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val != null ? String(val) : '';
        };
        setVal('crackGaugeNo', gauge.gaugeNo);
        setVal('crackGaugeInstallDate', gauge.installDate);
        setVal('crackGaugeInitialX', gauge.initialX);
        setVal('crackGaugeInitialY', gauge.initialY);
        setVal('crackTipInitialLength', tip.initialLengthMm);
        window._crackGaugePrevPhoto = gauge.prevPhoto || '';
        window._crackGaugeCurrPhoto = gauge.currPhoto || '';
        window._crackTipPrevPhoto = tip.prevPhoto || '';
        window._crackTipCurrPhoto = tip.currPhoto || '';
        // 불러온 사진과 번호 — 사진을 안 바꾸고 저장하면 번호를 이어 쓴다(crackMonitorUiPhotoId)
        window._crackMonitorUiPhotoIds = {
            'gauge:prev': { id: gauge.prevPhotoId || '', src: gauge.prevPhoto || '' },
            'gauge:curr': { id: gauge.currPhotoId || '', src: gauge.currPhoto || '' },
            'tip:prev': { id: tip.prevPhotoId || '', src: tip.prevPhoto || '' },
            'tip:curr': { id: tip.currPhotoId || '', src: tip.currPhoto || '' }
        };
        renderCrackGaugeReadingRows(gauge.readings);
        renderCrackTipReadingRows(tip.readings);
        renderCrackMonitorPhotoFrames();
        // 번호만 있고 사진이 아직 안 올라온 칸 — IndexedDB·클라우드에서 받아 채운다
        if (defect && typeof ensureGaugePhotosLoadedFor === 'function') {
            const want = Object.values(window._crackMonitorUiPhotoIds).some((v) => v.id && !v.src);
            if (want) {
                ensureGaugePhotosLoadedFor(defect).then((n) => {
                    if (!n) return;
                    const ids = window._crackMonitorUiPhotoIds || {};
                    const g2 = normalizeCrackGaugeLog(defect.crackGaugeLog);
                    const t2 = normalizeCrackTipLog(defect.crackTipLog);
                    const fill = (k, varName, log, slot) => {
                        const cur = ids[k];
                        if (!cur || !cur.id || cur.src || window[varName]) return;
                        if (log[slot + 'Id'] !== cur.id || !log[slot]) return;
                        cur.src = log[slot];
                        window[varName] = log[slot];
                    };
                    fill('gauge:prev', '_crackGaugePrevPhoto', g2, 'prevPhoto');
                    fill('gauge:curr', '_crackGaugeCurrPhoto', g2, 'currPhoto');
                    fill('tip:prev', '_crackTipPrevPhoto', t2, 'prevPhoto');
                    fill('tip:curr', '_crackTipCurrPhoto', t2, 'currPhoto');
                    renderCrackMonitorPhotoFrames();
                }).catch(() => {});
            }
        }
    }

    /** 창의 사진이 불러온 그대로면 그 번호, 바꿨거나 지웠으면 '' (새 사진은 저장 뒤 IndexedDB로 옮기며 번호를 받는다) */
    function crackMonitorUiPhotoId(kind, slot) {
        const cur = (window._crackMonitorUiPhotoIds || {})[kind + ':' + slot];
        if (!cur || !cur.id) return '';
        const now = kind === 'gauge'
            ? (slot === 'prev' ? window._crackGaugePrevPhoto : window._crackGaugeCurrPhoto)
            : (slot === 'prev' ? window._crackTipPrevPhoto : window._crackTipCurrPhoto);
        return (now || '') === (cur.src || '') ? cur.id : '';
    }

    function setCrackMonitorPhotoState(kind, slot, dataUrl) {
        const val = dataUrl || '';
        if (kind === 'gauge') {
            if (slot === 'prev') window._crackGaugePrevPhoto = val;
            else window._crackGaugeCurrPhoto = val;
        } else if (slot === 'prev') window._crackTipPrevPhoto = val;
        else window._crackTipCurrPhoto = val;
    }

    function renderCrackMonitorPhotoFrame(frameId, src, label) {
        const frame = document.getElementById(frameId);
        if (!frame) return;
        if (!src) {
            frame.classList.remove('has-photo');
            frame.innerHTML = `<span>${label} 사진 없음</span>`;
            return;
        }
        frame.classList.add('has-photo');
        frame.innerHTML = `<img src="${src}" alt="${label}" title="${label} — 탭하여 확대">`;
        const img = frame.querySelector('img');
        if (img) {
            img.addEventListener('click', () => {
                // 2026-11-10 누르면 크게 보기(확대·축소) — 그리기 창 대신
                if (typeof window.bsaOpenPhotoZoomViewer === 'function' && window.bsaOpenPhotoZoomViewer([src], 0, label, null)) return;
                if (typeof window.openPhotoAnnotationModal === 'function') window.openPhotoAnnotationModal(src, null);
                else window.open(src, '_blank');
            });
        }
    }

    function renderCrackMonitorPhotoFrames() {
        renderCrackMonitorPhotoFrame('crackGaugePrevPhotoFrame', window._crackGaugePrevPhoto, '게이지 전차');
        renderCrackMonitorPhotoFrame('crackGaugeCurrPhotoFrame', window._crackGaugeCurrPhoto, '게이지 현차');
        renderCrackMonitorPhotoFrame('crackTipPrevPhotoFrame', window._crackTipPrevPhoto, '팁 전차');
        renderCrackMonitorPhotoFrame('crackTipCurrPhotoFrame', window._crackTipCurrPhoto, '팁 현차');
        if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('[data-cm-photo-rotate]').forEach((btn) => {
                const [k, s] = String(btn.getAttribute('data-cm-photo-rotate') || '').split(':');
                btn.disabled = !getCrackMonitorPhotoState(k, s);
            });
        }
    }

    async function pickCrackMonitorPhoto(kind, slot, mode) {
        try {
            const file = (typeof pickImageFromDevice === 'function')
                ? await pickImageFromDevice(mode === 'camera' ? 'camera' : 'gallery')
                : null;
            if (!file) return;
            let dataUrl = null;
            if (typeof window.compressDefectPhoto43 === 'function') {
                dataUrl = await window.compressDefectPhoto43(file);
            } else {
                dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }
            if (!dataUrl) return;
            setCrackMonitorPhotoState(kind, slot, dataUrl);
            renderCrackMonitorPhotoFrames();
            if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
        } catch (err) {
            console.warn('crack monitor photo pick failed:', err);
            if (typeof window.showToast === 'function') window.showToast('사진 추가에 실패했습니다.', 'error');
        }
    }

    function clearCrackMonitorPhoto(kind, slot) {
        setCrackMonitorPhotoState(kind, slot, '');
        renderCrackMonitorPhotoFrames();
        if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
    }

    function clearCrackMonitorLogsUi() {
        setCrackMonitorLogsToUi(null);
    }

    function bindNdtCrackMonitorInputs() {
        const addGauge = document.getElementById('btnAddCrackGaugeReading');
        if (addGauge && !addGauge.dataset.bound) {
            addGauge.dataset.bound = '1';
            addGauge.addEventListener('click', () => {
                const log = getCrackGaugeLogFromUi();
                log.readings.push({
                    roundKey: defaultCrackMonitorRoundKey(),
                    date: defaultCrackMonitorDate(),
                    xMm: '', yMm: '', note: ''
                });
                renderCrackGaugeReadingRows(log.readings);
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        }
        const addTip = document.getElementById('btnAddCrackTipReading');
        if (addTip && !addTip.dataset.bound) {
            addTip.dataset.bound = '1';
            addTip.addEventListener('click', () => {
                const log = getCrackTipLogFromUi();
                log.readings.push({
                    roundKey: defaultCrackMonitorRoundKey(),
                    date: defaultCrackMonitorDate(),
                    lengthMm: '', incrementMm: '', note: ''
                });
                renderCrackTipReadingRows(log.readings);
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        }
        ['crackGaugeNo', 'crackGaugeInstallDate', 'crackGaugeInitialX', 'crackGaugeInitialY', 'crackTipInitialLength'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.monitorBound) return;
            el.dataset.monitorBound = '1';
            el.addEventListener('input', () => {
                updateCrackGaugeReadingComputedCells();
                updateCrackTipReadingComputedCells();
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
            el.addEventListener('change', () => {
                updateCrackGaugeReadingComputedCells();
                updateCrackTipReadingComputedCells();
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
        ['crackGaugeMarkComponent', 'crackGaugeMarkLocation'].forEach((id) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.monitorBound) return;
            el.dataset.monitorBound = '1';
            el.addEventListener('input', () => {
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
            el.addEventListener('change', () => {
                if (typeof scheduleNdtCrackMonitorSave === 'function') scheduleNdtCrackMonitorSave();
            });
        });
        const delMarkBtn = document.getElementById('btnDeleteNdtCrackGaugeMark');
        if (delMarkBtn && !delMarkBtn.dataset.bound) {
            delMarkBtn.dataset.bound = '1';
            delMarkBtn.addEventListener('click', async () => {
                const id = window._ndtCrackMonitorDefectId;
                const rec = id ? findCrackMonitorDefectRecord(id, window._ndtCrackMonitorFloorCode) : null;
                if (!rec || rec.kind !== 'ndt') return;
                if (rec.floorCode !== state.currentFloor) return;
                if (typeof window.deleteNdtItem !== 'function') return;
                if (!(await window.deleteNdtItem(id))) return;
                window.clearTimeout(window._ndtCrackMonitorSaveTimer);
                window._ndtCrackMonitorDefectId = null;
                window._ndtCrackMonitorFloorCode = null;
                selectedNdtIds.delete(id);
                updateNdtSelectionBar();
                closeNdtCrackMonitorModal({ save: false });
                if (typeof renderSurveyCrackMonitorSection === 'function') {
                    renderSurveyCrackMonitorSection(state.defects[`${state.currentBuildingId}_${state.currentFloor}`] || []);
                }
            });
        }
        const closeBtn = document.getElementById('btnCloseNdtCrackMonitorModal');
        if (closeBtn && !closeBtn.dataset.bound) {
            closeBtn.dataset.bound = '1';
            closeBtn.addEventListener('click', () => closeNdtCrackMonitorModal());
        }
        const saveBtn = document.getElementById('btnSaveNdtCrackMonitor');
        if (saveBtn && !saveBtn.dataset.bound) {
            saveBtn.dataset.bound = '1';
            saveBtn.addEventListener('click', () => {
                if (saveNdtCrackMonitorForSelectedDefect()) closeNdtCrackMonitorModal({ save: false });
            });
        }
        if (!window._crackMonitorPhotoUiBound) {
            window._crackMonitorPhotoUiBound = true;
            document.addEventListener('click', (e) => {
                const pickBtn = e.target && e.target.closest && e.target.closest('[data-cm-photo-pick]');
                if (pickBtn) {
                    e.preventDefault();
                    const raw = pickBtn.getAttribute('data-cm-photo-pick') || '';
                    const [kind, slot, mode] = raw.split(':');
                    if (kind && slot) pickCrackMonitorPhoto(kind, slot, mode || 'gallery');
                    return;
                }
                const rotateBtn = e.target && e.target.closest && e.target.closest('[data-cm-photo-rotate]');
                if (rotateBtn) {
                    e.preventDefault();
                    const raw = rotateBtn.getAttribute('data-cm-photo-rotate') || '';
                    const [kind, slot, dir] = raw.split(':');
                    if (kind && slot) rotateCrackMonitorPhoto(kind, slot, Number(dir) < 0 ? -1 : 1);
                    return;
                }
                const clearBtn = e.target && e.target.closest && e.target.closest('[data-cm-photo-clear]');
                if (clearBtn) {
                    e.preventDefault();
                    const raw = clearBtn.getAttribute('data-cm-photo-clear') || '';
                    const [kind, slot] = raw.split(':');
                    if (kind && slot) clearCrackMonitorPhoto(kind, slot);
                }
            });
        }
    }

    function summarizeCrackTipLog(log) {
        log = normalizeCrackTipLog(log);
        const lastIdx = log.readings.length - 1;
        const last = lastIdx >= 0 ? log.readings[lastIdx] : null;
        if (!last) return log.initialLengthMm ? `초기 ${log.initialLengthMm}mm` : '-';
        const cum = computeTipCumulative(log, lastIdx);
        const len = last.lengthMm || '-';
        return `${len}mm (누적 ${formatMonitorDelta(cum)})`;
    }

    function renderSurveyCrackMonitorSection(defects) {
        const section = document.getElementById('surveyCrackMonitorSection');
        const body = document.getElementById('surveyCrackMonitorBody');
        if (!section || !body) return;
        // 점검 종류·시설 등급과 무관하게 게이지 기록이 있으면 보여 준다 (3종은 예전처럼 중점관리 균열도)
        const grade3 = isGrade3Building();
        const items = (defects || []).filter((d) => {
            if (!d || !String(d.defectType || '').includes('균열')) return false;
            if (grade3 && d.isPriorityManage) return true;
            const g = normalizeCrackGaugeLog(d.crackGaugeLog);
            const t = normalizeCrackTipLog(d.crackTipLog);
            return g.readings.length > 0 || t.readings.length > 0 || g.gaugeNo;
        });
        const gaugeMarks = state.currentBuildingId
            ? (((state.ndtData || {})[`${state.currentBuildingId}_${state.currentFloor}`]) || []).filter(isCrackGaugeNdtItem)
            : [];
        if (!items.length && !gaugeMarks.length) {
            section.hidden = true;
            body.innerHTML = '';
            return;
        }
        section.hidden = false;
        const floorCode = state.currentFloor;
        body.innerHTML = items.map((d) => {
            const ctx = {
                floorCode,
                gradeNo: formatSurveyReportNo(d, true, floorCode),
                floorDisplayLabel: getGrade3FloorDisplayLabel(floorCode, state.currentBuilding)
            };
            const no = getSurveyCellText('no', d, ctx) || (d.no || '').replace(/^NO\.?\s*/i, '');
            const title = `${memberNameOut(d.component) || '부재'} ${d.defectType || ''}`.trim();
            const gauge = normalizeCrackGaugeLog(d.crackGaugeLog);
            const gaugeLabel = gauge.gaugeNo ? `No.${gauge.gaugeNo}` : '-';
            const lastGauge = gauge.readings.length ? gauge.readings[gauge.readings.length - 1] : null;
            const gDelta = lastGauge ? computeGaugeDeltas(gauge, lastGauge) : { dx: null, dy: null };
            const xyText = lastGauge
                ? `${lastGauge.xMm || '-'}/${lastGauge.yMm || '-'} (Δ${formatGaugeDelta('x', gDelta.dx, gauge)}/${formatGaugeDelta('y', gDelta.dy, gauge)})`
                : '-';
            const tipSum = summarizeCrackTipLog(d.crackTipLog);
            return `<tr>
                <td>${escapeSurveyAttr(no)}</td>
                <td>${escapeSurveyAttr(title)}</td>
                <td>${escapeSurveyAttr(gaugeLabel)}</td>
                <td>${escapeSurveyAttr(xyText)}</td>
                <td>${escapeSurveyAttr(tipSum)}</td>
                <td><button type="button" class="btn btn-sm btn-outline survey-crack-monitor-open" onclick="window.openNdtCrackMonitorDefect('${escapeSurveyAttr(d.id)}')">기록</button></td>
            </tr>`;
        }).join('') + gaugeMarks.map((it) => renderCrackGaugeMarkSummaryRow(it, 'survey-crack-monitor-open')).join('');
    }

    window.openSurveyCrackMonitorDefect = window.openNdtCrackMonitorDefect;

    // --- Dynamic Defect Cause Presets & Custom Adding ---
    // @@DEFECT_CAUSE_MAP_START (scripts/test-defect-cause-mapping.js가 이 구간을 떼어 시험함 — 표시 지우지 말 것)
    /*
     * 결함 종류 → 발생 원인 기본 목록 (2026-09-28 개정). 맨 위 원인이 기본 자동 체크.
     * 근거: 회사 과거 결함표 14개(결함 3,581행) 원인 빈도 + 점검 실무 기준. 회사가 늘 쓰는 표현
     *   (「건조수축 및 재료적 특성」·「개구부 주위 응력집중」·「결함부위 수분유입」·「상부 배관 누수」 등)을 그대로 씀.
     * 저장 키는 그대로(균열은 방향·부재가 달라도 '균열' 한 키) — 계정이 추가/숨김/순서/★로 바꾼 설정이 항상 우선.
     * 기존 원인 문자열은 이름을 바꾸지 않음(목록에서 빠져도 예전 결함에 적힌 원인은 그대로 표시).
     */
    const C_DS = '건조수축 및 재료적 특성';
    const C_OPEN = '개구부 주위 응력집중';
    const C_RESTR = '주변부재의 구속';
    const C_CORNER = '코너부위 응력집중';
    const C_POUR = '이어치기 시공미흡';
    const C_SHORE = '동바리 존치기간 미준수';
    const C_WET = '결함부위 수분유입';
    const C_PIPE = '상부 배관 누수';
    const C_MISM = '이질재료 거동차이';
    const C_MISM_WORK = '이질재료 접합부 시공미흡';
    const C_WORK = '시공미흡';
    const C_SRC = 'SRC기둥 이질재료 간 인장변형률 상이';
    const C_PLASTER = '미장 시공미흡';
    const C_POST = '후속 공정에 의한 인위적 손상';
    const C_MBAR = 'M-bar 클립 고정미흡';
    const C_CODE = '현행기준 미달';
    const C_MASONRY = '조적 쌓기 불량';
    const C_EARTH = '토압 작용';
    // 2026-10-30 회사 결함표에 자주 나오는 원인(엑셀 173개 기준)
    const C_MISM_JOINT = '이질재료 접합부 거동차이';
    const C_MANAGE = '관리미흡';
    const C_AGING = '경과년수 증대에 따른 노후화';

    // 균열 원인(부재·방향과 모를 때 쓰는 기본) — 회사 결함표 균열 2,470행 중 88%가 「건조수축 및 재료적 특성」
    const CORE_CRACK_CAUSE_PRESET = [C_DS, C_OPEN, C_RESTR, '과하중', '부등침하', '철근 부식 팽창'];
    const CRACK_MESH_CAUSES = [C_DS, C_PLASTER, '동결융해 반복', C_WORK];
    const CRACK_MASONRY_CAUSES = [C_DS, C_OPEN, C_RESTR, C_MISM, C_MASONRY, C_MISM_JOINT];
    // 2026-11-13 수분 원인(결함부위 수분유입·상부 방수층 파손·방수층 파손)은 균열 원인에서 뺌(사용자 지정).
    // 균열+누수·백태를 같이 고르면 누수/백태 원인 칸이 따로 나오므로 수분 원인은 그쪽에서 고른다.
    const CRACK_SLAB_CAUSES = [C_DS, C_RESTR, '과하중', C_SHORE, '철근 부식 팽창'];
    const CRACK_NONSTRUCT_CAUSES = [C_MISM, C_DS, C_WORK, '외부 충격', C_MISM_JOINT];
    const CRACK_FINISH_CAUSES = ['바탕 균열 전달', C_WORK, C_DS, C_AGING];

    /** 균열: 부재군 → { 균열 방향 → 원인 } ('*' = 방향 모름·기타 방향) */
    const CRACK_CAUSE_BY_MEMBER = {
        '기둥': {
            '수직균열': [C_DS, '철근 부식 팽창', '과하중', C_RESTR],
            '수평균열': [C_DS, C_POUR, '철근 부식 팽창', '부등침하'],
            '경사균열': [C_DS, '과하중', '부등침하', C_RESTR],
            '망상균열': CRACK_MESH_CAUSES,
            '*': [C_DS, '과하중', '철근 부식 팽창', '부등침하']
        },
        'SRC기둥': {
            '망상균열': [C_SRC, C_DS, C_PLASTER],
            '*': [C_SRC, C_DS, C_MISM, '과하중']
        },
        // 2026-11-03 회사 결함표: 보 균열은 「건조수축 및 재료적 특성」 다음에 「주변부재의 구속」을 함께 적는 경우가 9~10% (보(G)·보(B)·철골보 공통 문맥)
        '보': {
            '수직균열': [C_DS, C_RESTR, '과하중', C_SHORE, '철근 부식 팽창'],
            '수평균열': [C_DS, C_RESTR, '철근 부식 팽창', C_POUR, '과하중'],
            '경사균열': [C_DS, C_RESTR, '과하중', C_SHORE, '부등침하'],
            'U자형균열': [C_DS, '과하중', C_RESTR],
            '망상균열': CRACK_MESH_CAUSES,
            '*': [C_DS, C_RESTR, '과하중', C_SHORE, '철근 부식 팽창']
        },
        '슬래브': { '망상균열': CRACK_MESH_CAUSES, '*': CRACK_SLAB_CAUSES },
        '데크슬래브': { '망상균열': CRACK_MESH_CAUSES, '*': CRACK_SLAB_CAUSES },
        '기초': { '*': [C_DS, '부등침하', '과하중', C_RESTR] },
        '벽체': {
            '수직균열': [C_DS, C_OPEN, C_RESTR, C_CORNER, '부등침하'],
            '수평균열': [C_DS, C_OPEN, C_POUR, C_RESTR, '부등침하'],
            '경사균열': [C_DS, C_OPEN, C_RESTR, '부등침하'],
            '망상균열': CRACK_MESH_CAUSES,
            '*': [C_DS, C_OPEN, C_RESTR, '부등침하']
        },
        '옹벽': { '망상균열': CRACK_MESH_CAUSES, '*': [C_DS, C_EARTH, '부등침하', '철근 부식 팽창'] },
        '파라펫': { '망상균열': CRACK_MESH_CAUSES, '*': [C_DS, '온도변화 수축팽창', '철근 부식 팽창', C_RESTR] },
        'RC접합부': { '*': [C_DS, C_MISM, C_POUR, '부등침하'] },
        '조적벽체': {
            '경사균열': [C_DS, C_OPEN, '부등침하', C_MISM, C_MASONRY],
            '망상균열': [C_DS, C_PLASTER, C_WORK],
            '*': CRACK_MASONRY_CAUSES
        },
        '벽체접합부': { '*': [C_MISM, C_DS, C_MISM_WORK, C_WORK, C_MISM_JOINT] },
        // 2026-11-02 회사 결함표(엑셀 180개): 문·창 주변 벽체 균열은 건조수축 + 개구부 주위 응력집중을 함께 적는다(개구부 균열의 43~52%)
        '개구부벽체': { '*': [C_DS, C_OPEN, C_RESTR, C_CORNER, C_MISM_JOINT, '부등침하'] },
        // 비구조체 기둥(기둥-벽체 이질재료 접합) 균열: 건조수축 다음이 이질재료 접합부 거동차이(32%)
        '비구조기둥': { '*': [C_DS, C_MISM_JOINT, C_MISM, C_RESTR, C_WORK] },
        'ALC벽': { '*': CRACK_NONSTRUCT_CAUSES },
        '칸막이벽': { '*': CRACK_NONSTRUCT_CAUSES },
        '비구조기타': { '*': [C_DS, C_MISM, C_WORK, '외부 충격'] },
        '타일': { '*': [C_WORK, '바탕 균열 전달', C_DS, '외부 충격'] },
        '석재': { '*': [C_WORK, '바탕 균열 전달', C_DS, '외부 충격'] },
        '도장': { '*': ['바탕 균열 전달', C_DS, C_WORK, '노후화'] },
        '내장도장': { '*': ['바탕 균열 전달', C_DS, C_WORK, '노후화'] },
        '바닥마감': { '*': [C_DS, '신축줄눈 불량', '바탕 균열 전달', C_WORK] },
        '마감기타': { '*': CRACK_FINISH_CAUSES },
        '구조기타': { '*': [C_DS, C_RESTR, '과하중', '부등침하', '철근 부식 팽창'] }
    };

    /** 균열 외 종류: 부재군에 따라 순서·내용이 달라지는 것만 (없으면 defectCausePreset[키]) */
    const DEFECT_CAUSE_BY_MEMBER = {
        '누수': {
            '벽체': ['방수층 파손', C_WET, '창호 주변 밀봉 불량', '외벽 조인트 파손', '기타'],
            '조적벽체': ['방수층 파손', C_WET, '창호 주변 밀봉 불량', '외벽 조인트 파손', '기타'],
            'ALC벽': ['방수층 파손', C_WET, '창호 주변 밀봉 불량', '외벽 조인트 파손', '기타'],
            '옹벽': ['지하수 유입', C_WET, '방수층 파손', '콘크리트 투수', '기타'],
            '기초': ['지하수 유입', C_WET, '방수층 파손', '콘크리트 투수', '기타'],
            '파라펫': ['방수층 파손', C_WET, '이음부 실런트 노후', '기타'],
            '창호': ['창호 주변 밀봉 불량', C_WET, '이음부 실런트 노후', '방수층 파손', '기타'],
            '패널': [C_WET, '노후화', '이음부 실런트 노후', '부식 천공', '기타'],
            '금속패널': [C_WET, '노후화', '이음부 실런트 노후', '부식 천공', '기타'],
            '벽체접합부': ['방수층 파손', C_WET, '외벽 조인트 파손', '이음부 실런트 노후', '기타']
        },
        '처짐': {
            '천장': [C_WORK, C_MBAR, '수분 흡수 팽창', C_PIPE, '노후화', '기타']
        },
        '들뜸/탈락': {
            '천장': [C_WORK, '노후화', C_PIPE, C_MBAR, '사용자 부주의', '기타'],
            '석재': [C_WORK, '철물 부식 팽창', '노후화', '사용자 부주의', '기타'],
            '수장': [C_WORK, '노후화', '습기 침투', '부착력 저하', '기타']
        },
        '파손': {
            '천장': [C_WORK, C_PIPE, '사용자 부주의', C_MBAR, '기타'],
            '타일': [C_WORK, '사용자 부주의', '바탕 균열 전달', '외부 충격', '기타']
        },
        '변형·기울음': {
            '난간': ['외부 충격', '체결 이완', '지지 불량', '사용자 부주의', '과하중', '기타']
        },
        '박리/탈락': {
            '내장도장': [C_WET, '결로', '노후화', '바탕 처리 불량', '기타']
        },
        '부식/녹': {
            '철골': [C_WORK, C_AGING, '방청 불량', C_WET, '방수층 파손', '노후화', '기타']
        }
    };

    const defectCausePreset = {
        // ── 균열 (부재·방향별 목록은 CRACK_CAUSE_BY_MEMBER) ──
        '균열': CORE_CRACK_CAUSE_PRESET.slice(),
        '미장균열': [C_DS, C_PLASTER, '바탕 균열 전달', C_RESTR, C_WORK],
        '조적벽체 균열': CRACK_MASONRY_CAUSES.slice(),
        // ── 구조체 공통 ──
        '누수': ['방수층 파손', C_WET, C_PIPE, '배수 불량', '노후화', '기타'],
        '철근노출': ['피복두께 부족', '철근 부식 팽창', C_WORK, '다짐 시공미흡', '시공 다짐 불량', C_POST, '콘크리트 중성화', '기타'],
        '백태/유출': [C_WET, '방수층 파손', '배수 불량', '콘크리트 투수성 증가', C_WORK, '기타'],
        '박리/박락': ['철근 부식 팽창', C_WORK, '노후화', '염해', C_POST, '동결융해 반복', '기타'],
        '콘크리트 박리': ['철근 부식 팽창', C_WORK, C_WET, '피복두께 부족', '동결융해 반복', '기타'],
        '콘크리트 박락': ['철근 부식 팽창', C_WORK, '노후화', '염해', C_POST, '기타'],
        // 2026-11-13 공극·재료분리 = 타설 시 다짐 부족(사용자 지정). 예전엔 목록이 없어 「기타」로 들어갔다
        '공극': ['다짐 시공미흡', C_WORK, '피복두께 부족', '기타'],
        '재료분리': ['다짐 시공미흡', C_WORK, '피복두께 부족', '기타'],
        '신축이음/재료분리 손상': ['시공 다짐 불량', C_POUR, '피복두께 부족', '신축이음 노후화', '온도변화 수축팽창', '기타'],
        // ── 비구조체 ──
        '이격': [C_MISM, C_DS, C_WORK, C_MISM_WORK, '부등침하', C_MISM_JOINT, '기타'],
        // 2026-10-30 회사 결함표: 마감재 결함(들뜸·박락·탈락·오염 …)과 흔한 원인
        // (아래 마감재 구간에 있던 옛 '들뜸'·'오염' 목록이 이 줄을 덮어써서 회사 결함표 원인이 안 나오던 것을 합침 — 같은 키를 두 번 쓰지 말 것)
        '들뜸': [C_WORK, C_AGING, C_DS, '바탕 균열 전달', C_MISM_JOINT, C_WET, '부착력 저하', '온도변화 수축팽창', '기타'],
        '박락': [C_WORK, C_AGING, '철근 부식 팽창', C_POST, '기타'],
        '탈락': [C_WORK, C_AGING, C_MBAR, '사용자 부주의', '기타'],
        '오염': [C_PIPE, '상부 방수층 파손', C_WET, '결로', C_MANAGE, C_AGING, '사용·환경 오염', '기타'],
        '누수흔적': [C_PIPE, '상부 방수층 파손', C_WET, C_AGING, '기타'],
        '물고임': ['배수 불량', C_WORK, C_MANAGE, '기타'],
        '도장열화': [C_AGING, C_WET, C_WORK, '기타'],
        '줄눈 손상/탈락': [
            '몰탈 노후화', '온도·수축', '시공 불량', '진동·충격', '누수·동결', '기타'
        ],
        '배부름·전도 징후': [C_WORK, C_MASONRY, '기초 부등침하', '과하중', '누수·동결', '기타'],
        '파손/결손': [C_WORK, '사용자 부주의', '바탕 균열 전달', '외부 충격', '노후화', '기타'],
        '이격/파손': [
            '구조체 변위', '온도·열팽창', '시공 불량', '지진·진동', '이음 불량', '기타'
        ],
        '변형·기울음': [
            '지지 불량', '과하중', '지진·진동', '시공 오차', '습기 변형', '기타'
        ],
        '변형': [C_WORK, '외부 충격', '지지 불량', '과하중', '기타'],
        // 중량물: 회사 보고서는 원인 칸에 '중량물 적치'/'중량물 설치'를 그대로 씀(조사내용엔 창고·물탱크 설치 등)
        '중량물 적치': ['중량물 적치', '추가하중 적치', '실 변경으로 인한 하중증가', '사용자 부주의', '유지관리 부족', '기타'],
        '중량물 설치': ['중량물 설치', '추가하중 설치', '실 변경으로 인한 하중증가', C_WORK, '사용자 부주의', '기타'],
        '마감 손상': [
            '충격', '습기', '시공 불량', '노후화', '기타'
        ],
        '줄눈 손상': [C_WORK, '줄눈재 노후화', '바탕 균열 전달', '온도변화', '기타'],
        '백태': [C_WET, '방수층 파손', '줄눈재 노후화', '배수 불량', '기타'],
        '이격/개방불량': [
            '실런트 노후화', '프레임 변형', '시공 불량', '온도·열팽창', '하드웨어 이완', '기타'
        ],
        '유리 파손·금': ['외부 충격', '사용자 부주의', '열응력', '프레임 변형', '노후화', '기타'],
        '프레임 변형/부식': [
            '부식', '과하중', '시공 불량', '습기·결로', '충격', '기타'
        ],
        '실런트·코킹 손상': [
            '실런트 노후화', '자외선', '시공 불량', '이음폭 부족', '온도변화', '기타'
        ],
        '하드웨어 불량': [
            '마모·노후화', '체결 이완', '부식', '시공 불량', '과사용', '기타'
        ],
        '개폐불량': [
            '경첩 이완', '프레임 변형', '처짐', '시공 오차', '부식', '기타'
        ],
        '프레임 변형': [
            '과하중', '충격', '시공 불량', '습기 변형', '기타'
        ],
        '경첩·하드웨어 손상': [
            '마모', '체결 불량', '부식', '충격', '과사용', '기타'
        ],
        '작동불량': [
            '레일 이물질·변형', '모터·스프링 고장', '가이드 손상', '부식', '유지관리 부족', '기타'
        ],
        '레일·가이드 손상': [
            '충격', '부식', '시공 불량', '과하중', '노후화', '기타'
        ],
        '패널 변형/파손': [
            '충격', '풍압', '부식', '시공 불량', '기타'
        ],
        '파손/천공': ['노후화', C_WET, C_WORK, '외부 충격', '부식 천공', '기타'],
        '이음부 손상': [
            '실런트·가스켓 노후', '체결 이완', '온도변형', '시공 불량', '누수', '기타'
        ],
        '들뜸/변형': [
            '체결 이완', '풍압', '온도변형', '시공 불량', '부식', '기타'
        ],
        '체결부 이완': [C_WORK, '유지관리 부족', '진동', '부식', '노후화', '기타'],
        // ── 난간 ──
        '이격/흔들림': [
            '시공미흡', '체결 이완', '사용자 부주의', '외력·충격', '부식', '노후화', '기타'
        ],
        '낙하·탈락 위험': [
            '시공미흡', '체결 이완', '부식', '외력·충격', '과하중', '사용자 부주의', '노후화', '기타'
        ],
        '높이·간격 불량': [C_CODE, C_WORK, '개조·임의 변경', '기타'],
        '변형/들뜸': [
            '체결 이완', '온도·열변형', '풍압', '시공 불량', '부식', '기타'
        ],
        // ── 예전 결함 종류 이름(옛 데이터·직접 입력 호환) ──
        '조인트 이격/파손': [
            '실런트 노후화', '구조체 변위', '온도·열팽창', '시공 불량',
            '이음폭 부족', '지진·진동', '기타'
        ],
        '천장재 들뜸/탈락': [
            '접착력 저하', '수분 흡수 팽창', '시공 불량', '진동·충격',
            '노후화', '걸이재 이완', '누수', '기타'
        ],
        '설비 배관 누수/손상': [
            '배관 노후화', '연결부 밀봉 불량', '진동·충격', '동파',
            '시공 불량', '부식', '과압', '기타'
        ],
        '창호/유리 이격': [
            '실런트 노후화', '시공 불량', '구조체 변위', '온도·열팽창',
            '프레임 변형', '지진·진동', '기타'
        ],
        // ── 마감재 ──
        '들뜸/탈락': [C_WORK, '노후화', '부착력 저하', '온도변화 수축팽창', '바탕 균열 전달', '기타'],
        '파손/팟칭': [C_WORK, '사용자 부주의', '외부 충격', '철물 부식 팽창', '동결융해', '기타'],
        '철물 노출·녹': ['피복·마감 손상', '습기', '시공 불량', '유지관리 부족', '기타'],
        '변색/오염': ['방수층 파손', C_WET, '결로', C_PIPE, '자외선', '대기오염', '기타'],
        '박리/탈락': [C_WET, '노후화', '바탕 처리 불량', C_WORK, '방수층 파손', '기타'],
        '부풀음': [
            '습기 침투', '바탕 수분', '시공 불량', '결로', '기타'
        ],
        '곰팡이·결로 흔적': [
            '환기 부족', '단열 불량', '누수·습기', '결로', '기타'
        ],
        '오염/변색': [C_PIPE, '방수층 파손', '결로', '상부 누수', '기타'],
        '누수 흔적': [C_PIPE, '방수층 파손', '결로', C_WET, '기타'],
        '균열/파손': ['충격', '바탕 균열 전달', '바탕 침하', '과하중', '시공 불량', '기타'],
        '마모': [
            '통행 마모', '유지관리 부족', '재료 내구성', '기타'
        ],
        '마모/손상': [
            '통행 마모', '충격', '유지관리 부족', '재료 노후', '기타'
        ],
        '타일 들뜸/탈락': [
            '접착 모르타르 노후화', '온도·열팽창', '습기 침투', '시공 불량(바탕재 미흡)',
            '진동·충격', '바탕 균열 전달', '동결융해', '기타'
        ],
        '몰탈 균열': [
            '건조수축', '배합비 불량', '바탕재 부착 불량', '온도변화',
            '구조체 변위', '양생 불량', '두께 부족', '기타'
        ],
        '도장 페인트 변색/탈락': [
            '습기 유입', '자외선 노후화', '바탕면 처리 불량', '도료 품질 불량',
            '염해·오염', '재도장 주기 초과', '기타'
        ],
        '방수층 손상/들뜸': [
            '방수재 노후화', '바탕재 처리 미흡', '구조체 변형', '온도·열팽창',
            '시공 불량', '배수 불량', '자외선·노출', '기타'
        ],
        '석재 팟칭': [
            '충격 손상', '철물 부식 팽창', '접착력 저하', '동결융해', '기타'
        ],
        // ── 철골·데크 ──
        // 2026-11-03 회사 결함표 부식/녹 775행: 노후화 40% · 시공미흡 34% · 방청 불량 9% (구조체 철골만 시공미흡 35 · 노후화 30 · 방청 불량 17 — 아래 DEFECT_CAUSE_BY_MEMBER)
        '부식/녹': [C_AGING, C_WORK, '방청 불량', C_WET, '방수층 파손', '노후화', '기타'],
        '부식': ['노후화', '방청 불량', C_WET, '결로·습기', '염해', '기타'],
        '파손': [C_WORK, '사용자 부주의', '외부 충격', '바탕 균열 전달', '노후화', '기타'],
        '변형/좌굴': [C_WORK, '과하중', '외부 충격', '강성 부족', '온도변형', '기타'],
        '볼트 이완/파손': [C_WORK, '체결 불량', '진동', '부식', '피로', '기타'],
        '용접부 균열/불량': ['용접 불량', '피로', '잔류응력', '과하중', '기타'],
        '도장 박리': ['도장 노후화', '바탕 처리 불량', '습기', '자외선', '기타'],
        '뿜칠 박락': [C_WORK, C_POST, '노후화', C_WET, '방수층 파손', '부착력 저하', '기타'],
        '뿜칠 미시공': [C_WORK, C_POST, '시공 누락', '피복 두께 부족', '기타'],
        '접합부 손상': ['볼트 이완', '용접 불량', '부식', '과하중', '시공 불량', '기타'],
        '단면 손실': [
            '부식', '화재', '충돌', '마모', '기타'
        ],
        '처짐': ['과하중', '강성 부족', '장기 크리프', C_WORK, '기타'],
        '데크플레이트 부식': ['방수층 파손', '방청 불량', C_WET, '결로', '기타'],
        // ── 공통 fallback ──
        '기타': [
            '노후화', '시공 불량', '외력·충격', '환경 요인', '유지관리 부족',
            '설계·시공 오차', '복합 원인', '기타'
        ]
    };

    /** 원인 목록을 고를 부재군 (부재 명칭 → 기둥/보/벽체/…, 모르면 분류별 기타) */
    function getCauseMemberGroup(category, component) {
        const k = normalizeComponentKey(component);
        if (k) {
            // 2026-11-02 회사 결함표: 「창 하부 벽체」·「문 상부 벽체」·「개구부」 → 창호가 아니라 개구부 주변 벽체(개구부 주위 응력집중)
            if (/(창|문)(상부|하부|측면)/.test(k) || k.includes('개구부')) return '개구부벽체'; // 개구부 상부·하부도 '개구부'로 걸린다
            if ((k.includes('벽체') && k.includes('접합')) || k === '벽체접합부') return '벽체접합부';
            if (category === '비구조체' && k.includes('기둥') && !k.includes('접합') && !k.includes('SRC') && !k.includes('철골')) return '비구조기둥';
            if (k.includes('철골')) return '철골';
            if (k.includes('데크')) return '데크슬래브';
            if (k.includes('접합')) return 'RC접합부';
            if (k.includes('SRC') || k.includes('src')) return 'SRC기둥';
            if (k.includes('조적')) return '조적벽체';
            if (k.includes('ALC') || k.includes('alc')) return 'ALC벽';
            if (k.includes('칸막이')) return '칸막이벽';
            if (k.includes('천장')) return '천장';
            if (k.includes('타일')) return '타일';
            if (k.includes('석재')) return '석재';
            if (k.includes('내장도장')) return '내장도장';
            if (k.includes('도장') || k.includes('페인트')) return '도장';
            if (k.includes('금속') && k.includes('패널')) return '금속패널';
            if (k.includes('지붕') || k.includes('패널')) return '패널';
            if (k.includes('수장')) return '수장';
            if (k.includes('바닥')) return '바닥마감';
            if (k.includes('창') && !k.includes('천장')) return '창호';
            if (k.includes('셔터')) return '셔터';
            if (k.includes('난간')) return '난간';
            if (k.includes('옹벽')) return '옹벽';
            if (k.includes('파라펫')) return '파라펫';
            if (k.includes('기둥')) return '기둥';
            if (k.includes('벽')) return '벽체';
            if (k.includes('기초')) return '기초';
            if (k.includes('계단') || k.includes('슬래브')) return '슬래브';
            if (k.includes('보') || k.includes('거더') || k.includes('빔')) return '보';
            if (k === '문' || k.includes('도어')) return '문';
        }
        if (category === '마감재') return '마감기타';
        if (category === '비구조체') return '비구조기타';
        return '구조기타';
    }

    // 2026-10-30 회사 결함표(엑셀 173개, 판본 묶은 보고서 수 기준) 원인 빈도 순위 — 앱 기본 목록의 순서만 바꾼다(지우지 않음)
    const COMPANY_CAUSE_RANK = {
        '균열': ['건조수축 및 재료적 특성', '개구부 주위 응력집중', '시공미흡', '주변부재의 구속', '이질재료 접합부 거동차이', '이질재료 거동차이', '코너부위 응력집중', '경과년수 증대에 따른 노후화', '건조수축', '이어치기 시공미흡', '피복두께 부족'],
        '*': ['건조수축 및 재료적 특성', '시공미흡', '개구부 주위 응력집중', '경과년수 증대에 따른 노후화', '이질재료 접합부 거동차이', '결함부위 수분유입', '상부 방수층 파손', '주변부재의 구속', '이질재료 거동차이', '피복두께 부족', '코너부위 응력집중', '관리미흡', '방수층 파손', '사용자 부주의'],
        '이격': ['이질재료 접합부 거동차이', '건조수축 및 재료적 특성', '시공미흡', '이질재료 거동차이', '경과년수 증대에 따른 노후화', '코너부위 응력집중', '개구부 주위 응력집중'],
        '누수': ['상부 방수층 파손', '결함부위 수분유입', '방수층 파손', '경과년수 증대에 따른 노후화', '시공미흡', '건조수축 및 재료적 특성', '상부 배관 누수', '이질재료 접합부 거동차이'],
        '백태': ['결함부위 수분유입', '상부 방수층 파손', '건조수축 및 재료적 특성', '방수층 파손', '경과년수 증대에 따른 노후화', '시공미흡', '이질재료 거동차이'],
        '철근노출': ['피복두께 부족', '시공미흡', '상부 방수층 파손', '경과년수 증대에 따른 노후화', '결함부위 수분유입', '건조수축 및 재료적 특성', '시공 불량'],
        '박리/박락': ['시공미흡', '경과년수 증대에 따른 노후화', '철근 부식 팽창', '건조수축 및 재료적 특성', '개구부 주위 응력집중', '상부 방수층 파손', '이질재료 접합부 거동차이', '이질재료 거동차이', '결함부위 수분유입'],
        '들뜸': ['시공미흡', '경과년수 증대에 따른 노후화', '건조수축 및 재료적 특성', '이질재료 접합부 거동차이', '코너부위 응력집중', '이질재료 거동차이', '피복두께 부족', '주변부재의 구속', '사용자 부주의', '미장 시공미흡', '결함부위 수분유입', '상부 방수층 파손', '외부 충격', '시공 불량'],
        '탈락': ['시공미흡', '경과년수 증대에 따른 노후화', '이질재료 거동차이', '관리미흡', '건조수축 및 재료적 특성', '상부 방수층 파손', '과하중'],
        '파손': ['시공미흡', '사용자 부주의', '경과년수 증대에 따른 노후화', '외부 충격', '이질재료 거동차이', '건조수축 및 재료적 특성', '코너부위 응력집중', '이질재료 접합부 거동차이', '상부 배관 누수', '개구부 주위 응력집중', '관리미흡', '상부 방수층 파손'],
        '오염': ['상부 방수층 파손', '상부 배관 누수', '결함부위 수분유입', '경과년수 증대에 따른 노후화', '방수층 파손', '시공미흡', '건조수축 및 재료적 특성', '이질재료 접합부 거동차이', '습기 침투', '상부 누수'],
        '처짐': ['시공미흡', '경과년수 증대에 따른 노후화', '과하중'],
    };
    // 균열류 맨 위 3개(사용자 지정 2026-10-30): 건조수축 및 재료적 특성 → 이질재료 거동차이 → 내력부족
    const CRACK_TOP_CAUSES = [C_DS, C_MISM, '내력부족'];
    // 회사 순위를 적용할 결함 키만 명시(낙하·탈락 위험, 용접부 균열/불량, 부식 등 전문 목록은 그대로 둠)
    const COMPANY_CAUSE_RANK_KEY = {
        '균열': '균열', '수직균열': '균열', '수평균열': '균열', '경사균열': '균열', '망상균열': '균열', '미장균열': '균열', 'U자형균열': '균열', '균열/파손': '균열',
        '이격': '이격', '처짐': '처짐', '철근노출': '철근노출', '탈락': '탈락',
        '누수': '누수', '누수흔적': '누수', '누수 흔적': '누수',
        '백태': '백태', '백태/유출': '백태',
        '박리/박락': '박리/박락', '콘크리트 박리': '박리/박락', '콘크리트 박락': '박리/박락', '박리/탈락': '박리/박락',
        '들뜸': '들뜸', '들뜸/탈락': '들뜸',
        '파손': '파손', '파손/결손': '파손',
        '오염': '오염', '변색/오염': '오염', '오염/변색': '오염'
    };
    function companyCauseRankKey(key) {
        return COMPANY_CAUSE_RANK_KEY[String(key || '').trim()] || '';
    }
    /** 앱 기본 원인 목록을 회사가 자주 쓰는 순으로(없는 원인은 더하지 않음 — 균열 맨 위 3개만 예외). 「기타」는 늘 맨 끝 */
    // 2026-10-30 마감재 결함 공통 맨 위 4개(사용자 지정). 미장균열만 균열류 맨 위 3개를 먼저 둔다
    const FINISH_TOP_CAUSES = ['시공미흡', '경과년수 증대에 따른 노후화', '상부 배관 누수', '상부 누수'];
    /** 마감재: 맨 위 4개 고정 → 나머지는 회사 순위(없으면 전체 순위) */
    function finishCauseOrder(key, category, list) {
        if (String(category || '') !== '마감재') return list;
        if (isEffloCauseKey(key)) return list;
        const k = String(key || '').trim();
        if (k === '미장균열') return list;
        const raw = uniqCauseList(list);
        const rk = companyCauseRankKey(k) === '균열' ? '' : companyCauseRankKey(k);
        const own = COMPANY_CAUSE_RANK[rk] || [];
        const glob = COMPANY_CAUSE_RANK['*'] || [];
        const rest = raw.filter((c) => FINISH_TOP_CAUSES.indexOf(c) < 0 && !(companyCauseRankKey(k) === '균열' && CRACK_TOP_CAUSES.indexOf(c) >= 0 && c !== C_DS));
        const score = (c, i) => {
            if (c === '기타') return 1e6;
            const o = own.indexOf(c); if (o >= 0) return o;
            const g = glob.indexOf(c); if (g >= 0) return 1000 + g;
            return 5000 + i;
        };
        const sorted = rest.map((c, i) => ({ c, s: score(c, i) })).sort((x, y) => x.s - y.s).map((x) => x.c);
        return FINISH_TOP_CAUSES.concat(sorted);
    }
    // 2026-10-30 누수류(모든 분류) 맨 위 3개(사용자 지정) — 마감재 맨 위 4개보다 우선
    const LEAK_TOP_CAUSES = ['상부 방수층 파손', '결함부위 수분유입', '창호 실링 열화', '상부 배관 누수'];
    function isLeakCauseKey(key) {
        const k = String(key || '').trim();
        return k === '누수' || k === '누수흔적' || k === '누수 흔적';
    }
    // 2026-10-30 백태류(모든 분류): 결함부위 수분유입 맨 위 — 마감재 맨 위 4개보다 우선
    function isEffloCauseKey(key) {
        const k = String(key || '').trim();
        return k === '백태' || k === '백태/유출' || k === '백화';
    }
    function leakCauseOrder(key, list) {
        if (isEffloCauseKey(key)) return uniqCauseList(['결함부위 수분유입', '상부 방수층 파손'].concat(list));
        if (!isLeakCauseKey(key)) return list;
        return uniqCauseList(LEAK_TOP_CAUSES.concat(list));
    }
    /** 부재 문맥에 따라 균열 원인 맨 위 두 번째에 올릴 원인(맨 위는 늘 건조수축 및 재료적 특성) — 2026-11-02 */
    const CRACK_LEAD_BY_GROUP = {
        '개구부벽체': [C_OPEN],
        '벽체접합부': [C_MISM_JOINT],
        '비구조기둥': [C_MISM_JOINT]
    };
    function rankCausesByCompany(key, list) {
        const rk = companyCauseRankKey(key);
        let base = uniqCauseList(list);
        if (!rk) return base;
        if (rk === '균열') base = uniqCauseList(CRACK_TOP_CAUSES.concat(base));
        const own = COMPANY_CAUSE_RANK[rk] || [];
        const glob = COMPANY_CAUSE_RANK['*'] || [];
        const score = (c, i) => {
            if (c === '기타') return 1e6;
            if (rk === '균열') { const t = CRACK_TOP_CAUSES.indexOf(c); if (t >= 0) return -100 + t; }
            const o = own.indexOf(c); if (o >= 0) return o;
            const g = glob.indexOf(c); if (g >= 0) return 1000 + g;
            return 5000 + i;
        };
        return base.map((c, i) => ({ c, s: score(c, i) })).sort((x, y) => x.s - y.s).map((x) => x.c);
    }

    function uniqCauseList(list) {
        const out = [];
        (list || []).forEach((c) => {
            const t = String(c || '').trim();
            if (t && !out.includes(t)) out.push(t);
        });
        return out;
    }

    /**
     * 앱 기본 원인 목록(계정 설정 반영 전). 맨 위가 자동 체크 후보.
     * @param {string} key  getCauseKey / getCauseDisplayGroups의 키
     * @param {string[]} [types] 그 그룹의 결함 종류(균열이면 수직균열·경사균열 …, 고른 순)
     * @param {string} [category] 구조체/비구조체/마감재
     * @param {string} [component] 부재 명칭
     */
    // 2026-11-03 기본 발생 원인 = 회사 엑셀(160건)에서 한 번이라도 쓰인 원인만. 이 밖의 원인은 기본 목록에서 뺀다
    // (예전에 그 원인으로 저장한 결함은 그대로 보이고, ⚙에서 직접 추가할 수 있다).
    // 사용자가 맨 위에 고정하라고 지정한 원인(균열·누수·마감재 맨 위 목록, 균열 부재별 두 번째)과 「기타」는 엑셀에 없어도 둔다.
    const DEFECT_CAUSE_ALLOW = ['건조수축 및 재료적 특성', '시공미흡', '상부 방수층 파손', '주변부재의 구속', '개구부 주위 응력집중',
        '결함부위 수분유입', '경과년수 증대에 따른 노후화', '이질재료 접합부 거동차이', '상부 배관 누수', '피복 두께 부족', '피복두께 부족',
        '철근 부식 팽창', '이질재료 거동차이', '사용자 부주의', '코너부위 응력집중', '관리미흡', '이어치기 시공미흡', '이질재료 접합부 시공미흡',
        '방청 불량', '과하중', 'SRC기둥 이질재료 간 인장변형률 상이', '외부 충격', '배수 불량', '내력부족', '조적 쌓기 불량', '상부 누수', '결로',
        '추가하중 적치', '지하수 유입', '부식', '누수', '동결융해 반복', '실 변경으로 인한 하중증가', '추가하중 설치', '부착력 저하', '시공 누락',
        '온도변화', '다짐 시공미흡', '기타'];
    let _defectCauseAllowSet = null;
    function getDefaultCausePresetList(key, types, category, component) {
        const raw = getDefaultCausePresetListRaw(key, types, category, component);
        if (!_defectCauseAllowSet) {
            _defectCauseAllowSet = new Set(DEFECT_CAUSE_ALLOW.concat(CRACK_TOP_CAUSES, LEAK_TOP_CAUSES, FINISH_TOP_CAUSES));
            Object.values(CRACK_LEAD_BY_GROUP).forEach((l) => l.forEach((c) => _defectCauseAllowSet.add(c)));
        }
        // 2026-11-14 기본 목록에 「기타」는 넣지 않음(필요하면 직접 추가)
        const out = raw.filter((c) => c !== '기타' && _defectCauseAllowSet.has(c));
        if (out.length) return out;
        // 그 종류에 쓸 원인이 엑셀에 하나도 없으면(기타·도장 박리·줄눈 손상 …) 엑셀에서 많이 쓰인 일반 원인으로
        const rk = companyCauseRankKey(key) || (/이격/.test(String(key)) ? '이격' : '');
        const base = (COMPANY_CAUSE_RANK[rk] || ['시공미흡', '경과년수 증대에 따른 노후화', '관리미흡', '사용자 부주의'])
            .filter((c) => _defectCauseAllowSet.has(c) && c !== '기타').slice(0, 6);
        return uniqCauseList(base);
    }
    function getDefaultCausePresetListRaw(key, types, category, component) {
        const k = String(key || '').trim() || '기타';
        const group = getCauseMemberGroup(category, component);
        if (k === '균열') {
            const byMember = CRACK_CAUSE_BY_MEMBER[group] || null;
            if (!byMember) return leakCauseOrder(k, finishCauseOrder(k, category, rankCausesByCompany(k, CORE_CRACK_CAUSE_PRESET)));
            const kinds = (Array.isArray(types) && types.length ? types : ['균열'])
                .map((t) => String(t || '').trim()).filter(Boolean);
            const merged = [];
            kinds.forEach((t) => { merged.push(...(byMember[t] || byMember['*'] || CORE_CRACK_CAUSE_PRESET)); });
            const ranked = rankCausesByCompany(k, merged);
            const lead = CRACK_LEAD_BY_GROUP[group];
            const out = lead ? uniqCauseList([ranked[0]].concat(lead, ranked)) : ranked;
            return leakCauseOrder(k, finishCauseOrder(k, category, out));
        }
        const byMember = DEFECT_CAUSE_BY_MEMBER[k];
        if (byMember && byMember[group]) return leakCauseOrder(k, finishCauseOrder(k, category, rankCausesByCompany(k, byMember[group])));
        return leakCauseOrder(k, finishCauseOrder(k, category, rankCausesByCompany(k, defectCausePreset[k] || defectCausePreset['기타'])));
    }

    /** 이 키에서 앱 기본으로 나올 수 있는 모든 원인(부재·방향 전부) — 계정 순서가 의미 있는지 판단용 */
    function getAllDefaultCausesForKey(key) {
        const k = String(key || '').trim() || '기타';
        const all = [...(defectCausePreset[k] || [])];
        if (k === '균열' || companyCauseRankKey(k) === '균열') all.push(...CRACK_TOP_CAUSES);
        all.push(...FINISH_TOP_CAUSES);
        if (isLeakCauseKey(k)) all.push(...LEAK_TOP_CAUSES);
        if (isEffloCauseKey(k)) all.push('결함부위 수분유입', '상부 방수층 파손');
        if (k === '균열') {
            Object.values(CRACK_CAUSE_BY_MEMBER).forEach((m) => Object.values(m).forEach((l) => all.push(...l)));
        }
        if (DEFECT_CAUSE_BY_MEMBER[k]) Object.values(DEFECT_CAUSE_BY_MEMBER[k]).forEach((l) => all.push(...l));
        return uniqCauseList(all);
    }

    /**
     * 계정 원인 순서 중 실제로 쓸 것. 기본 원인이 하나도 없는 순서(직접 추가한 원인만 뒤에 붙어 쌓인 것)는
     * 사용자가 끌어서 정한 순서가 아니므로 무시 — 직접 추가한 원인이 맨 위로 올라와 매번 자동 체크되던 문제(2026-09-28).
     */
    function getEffectiveCauseOrder(key, orderList) {
        if (!Array.isArray(orderList) || !orderList.length) return [];
        const defaults = new Set(getAllDefaultCausesForKey(key));
        return orderList.some((t) => defaults.has(t)) ? orderList : [];
    }
    // @@DEFECT_CAUSE_MAP_END

    let _knownDefaultCauseSet = null;
    /** 예전 기본 목록에 있던 가운뎃점·빗금 이름. 기존 결함 기록을 열 때 쪼개지지 않게 */
    const LEGACY_CAUSE_LABELS = [
        '수화열·온도균열', '배관 파손/연결부 누수', '드레인·배수 불량', '옥상·파라펫 손상', '박리·박락 동반',
        '벽체 두께·지지 부족', '충격·외력', '접착·부착력 저하', '도료·마감 노후', '습기·누수', '충돌·충격',
        '접합부·볼트부 미시공'
    ];
    /** 원인 목록에 있는 원인 이름(가운뎃점·빗금이 들어간 이름도 한 개로 유지하려고) */
    function isKnownCauseLabel(text) {
        const t = String(text || '').trim();
        if (!t) return false;
        if (!_knownDefaultCauseSet) {
            _knownDefaultCauseSet = new Set();
            Object.keys(defectCausePreset).forEach((k) => getAllDefaultCausesForKey(k).forEach((c) => _knownDefaultCauseSet.add(c)));
            LEGACY_CAUSE_LABELS.forEach((c) => _knownDefaultCauseSet.add(c));
        }
        if (_knownDefaultCauseSet.has(t)) return true;
        const customs = (window.state && window.state.customDefectCauses) || {};
        return Object.keys(customs).some((k) => Array.isArray(customs[k]) && customs[k].includes(t));
    }

    function parseCauseList(raw) {
        const out = [];
        String(raw == null ? '' : raw).split(/[,，]+/).forEach((part) => {
            const t = part.trim();
            if (!t) return;
            // 목록에 있는 이름(수화열·온도균열, 배관 파손/연결부 누수 등)은 그대로, 모르는 옛 표기만 · / 로 나눔
            if (!/[/·•|]/.test(t) || isKnownCauseLabel(t)) {
                out.push(t);
                return;
            }
            t.split(/[/·•|]+/).map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
        });
        return out;
    }
    function joinCauseList(list) {
        return (list || []).map(s => String(s || '').trim()).filter(Boolean).join(', ');
    }
    function getSelectedCausesFromUi() {
        const box = document.getElementById('defectCauseChecks');
        if (!box) return [];
        return Array.from(box.querySelectorAll('input[type="checkbox"]:checked'))
            .map(el => el.value)
            .filter(Boolean);
    }

    function hasActionableDefectType(defectTypeStr) {
        return parseDefectTypeList(defectTypeStr).some(t => t && !(typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호'));
    }

    function getCauseKey(defectType) {
        if (!defectType) return '기타';
        const parts = parseDefectTypeList(defectType);
        for (const part of parts) {
            const t = part.trim();
            if (defectCausePreset[t]) return t;
            if (isRcStructuralCrackKind(t)) return '균열';
        }
        const t = String(defectType).trim();
        if (defectCausePreset[t]) return t;
        if (isRcStructuralCrackKind(t)) return '균열';
        // 2026-11-06 띄어쓰기만 다르면 같은 종류(도장박리 → 도장 박리)
        const compact = t.replace(/\s+/g, '');
        const keysAll = Object.keys(defectCausePreset).filter((k) => k !== '기타');
        const sameWords = keysAll.find((k) => k.replace(/\s+/g, '') === compact);
        if (sameWords) return sameWords;
        // 긴 이름 안에 아는 종류가 들어 있으면 가장 구체적인 것(콘크리트 박리 및 철근노출 → 콘크리트 박리)
        const inside = keysAll.filter((k) => t.includes(k)).sort((a, b) => b.length - a.length)[0];
        if (inside) return inside;
        // 짧게 적었으면 가장 일반적인 것. 2026-11-06 전엔 가장 긴 이름을 골라 「박리」가 「콘크리트 박리」가 됐다(→ 박리/박락)
        const broader = keysAll.filter((k) => k.includes(t)).sort((a, b) => a.length - b.length)[0];
        return broader || '기타';
    }

    /** 복수 결함 종류 → 원인 프리셋 그룹(RC 균열 계열만 하나로 합침) */
    function getCauseDisplayGroups(defectTypeStr) {
        const parts = parseDefectTypeList(defectTypeStr).filter(t => t && !(typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호'));
        if (!parts.length) return [];
        const groups = [];
        let crackGroup = null;
        parts.forEach((part) => {
            const t = String(part || '').trim();
            if (!t || (typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) return;
            if (isRcStructuralCrackKind(t)) {
                if (!crackGroup) {
                    crackGroup = { key: '균열', label: '균열', types: [t], isCrackGroup: true };
                    groups.push(crackGroup);
                } else if (!crackGroup.types.includes(t)) {
                    crackGroup.types.push(t);
                }
                return;
            }
            const key = getCauseKey(t);
            let g = groups.find(x => !x.isCrackGroup && x.key === key);
            if (!g) {
                g = { key, label: t, types: [t], isCrackGroup: false };
                groups.push(g);
            } else if (!g.types.includes(t)) {
                g.types.push(t);
            }
        });
        return groups;
    }

    const CAUSE_GROUP_TONES = [
        { border: '#b45309', bg: '#fffbeb', text: '#92400e', accent: '#f59e0b' },
        { border: '#2563eb', bg: '#eff6ff', text: '#1d4ed8', accent: '#3b82f6' },
        { border: '#16a34a', bg: '#f0fdf4', text: '#15803d', accent: '#22c55e' },
        { border: '#9333ea', bg: '#faf5ff', text: '#7e22ce', accent: '#a855f7' },
        { border: '#db2777', bg: '#fdf2f8', text: '#be185d', accent: '#ec4899' },
        { border: '#0891b2', bg: '#ecfeff', text: '#0e7490', accent: '#06b6d4' }
    ];

    /** 결함 수정창의 지금 분류·부재 (원인 기본 목록 문맥) */
    function getCurrentDefectCauseContext() {
        let component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        ) || '';
        // 「개구부 결함」을 체크했거나 개구부 위치(창 상부 …)를 골랐으면 벽체 계열의 원인 문맥을 개구부 주변 벽체로
        const openChk = document.getElementById('defectOpeningCrackCheck');
        const openPos = (document.getElementById('defectOpeningPos')?.value || '').trim();
        if (((openChk && openChk.checked) || openPos) && (document.getElementById('defectCategory')?.value || '') !== '마감재' && /벽|^\s*$/.test(component) && !/개구부|(창|문)\s*(상부|하부|측면)/.test(component)) {
            component = (component + ' 개구부').trim();
        }
        return {
            category: document.getElementById('defectCategory')?.value || '',
            component
        };
    }

    /**
     * 화면에 보일 원인 목록 = 앱 기본(부재·균열 방향별) − 숨김 + 계정이 추가한 원인, 계정 순서 적용.
     * (2026-09-28: 벽체 접합부 원인을 모든 종류 앞에 끼워 넣던 것 제거 — 접합부는 문맥별 목록으로)
     */
    /**
     * 2026-11-13 「공극」「재료분리」는 전엔 원인 키가 따로 없어 「기타」「신축이음/재료분리 손상」 세팅을 썼다.
     * 전용 키로 바꾼 뒤 ⚙에서 직접 추가·숨긴 원인이 사라져 보였다 — 새 키에 아무 세팅이 없으면 옛 키의
     * 직접 추가·숨김을 한 번 복사한다(순서는 복사하지 않음: 맨 위 기본 원인 「다짐 시공미흡」 유지).
     */
    function seedCauseSettingsFromLegacyKey(key) {
        const legacy = { '공극': '기타', '재료분리': '신축이음/재료분리 손상' }[key];
        if (!legacy) return;
        const st = window.state;
        const has = (f) => !!(st[f] && Array.isArray(st[f][key]) && st[f][key].length);
        if (has('customDefectCauses') || has('hiddenDefectCauses') || has('defectCauseOrder')) return;
        ['customDefectCauses', 'hiddenDefectCauses'].forEach((f) => {
            const src = st[f] && st[f][legacy];
            if (!Array.isArray(src) || !src.length) return;
            if (!st[f]) st[f] = {};
            st[f][key] = src.slice();
        });
    }

    /**
     * 2026-11-13 세팅은 트리: 분류 → 부재 → 결함 종류 → 원인. 같은 「균열」이라도 부재가 다르면 원인 세팅이 따로다.
     * 저장 칸 「분류|부재|원인키」(예: 구조체|보(G)|균열). ⚙로 아직 안 고친 칸은 예전처럼 원인키 칸(균열)을 쓴다 —
     * 기존 세팅이 그대로 보이고, ⚙를 열 때 그 칸으로 복사한 뒤 그 부재·종류만 고친다.
     */
    function causeTreeContext() {
        return {
            category: String(document.getElementById('defectCategory')?.value || '').trim(),
            component: String(getDefectComboValue(
                document.getElementById('defectComponent'),
                document.getElementById('defectComponentInput')
            ) || '').trim()
        };
    }
    function causeTreeBucketKey(category, component, key) {
        const cat = String(category || '').trim();
        const comp = settingsComponentName(component);
        const k = String(key || '').trim();
        return (cat && comp && k) ? `${cat}|${comp}|${k}` : '';
    }
    function findOwnedCauseBucket(t, key) {
        const cat = String(t.category || '').trim();
        const k = String(key || '').trim();
        if (!cat || !k) return '';
        return findOwnedSettingsBucket(window.state.customDefectCauses, `${cat}|`, t.component, `|${k}`);
    }
    function causeSettingsBucket(key, tree) {
        const t = tree || causeTreeContext();
        return findOwnedCauseBucket(t, key) || key;
    }
    function ownCauseSettingsBucket(key, tree) {
        const t = tree || causeTreeContext();
        const b = causeTreeBucketKey(t.category, t.component, key);
        if (!b) return key;
        const st = window.state;
        if (st.customDefectCauses && Array.isArray(st.customDefectCauses[b])) return b;
        seedCauseSettingsFromLegacyKey(key);
        const src = findOwnedCauseBucket(t, key) || key;
        const favNow = typeof getDefectFavoriteList === 'function' ? getDefectFavoriteList('cause', src) : null;
        ['customDefectCauses', 'hiddenDefectCauses', 'defectCauseOrder'].forEach((f) => {
            if (!st[f] || typeof st[f] !== 'object') st[f] = {};
            st[f][b] = Array.isArray(st[f][src]) ? st[f][src].slice() : [];
        });
        if (Array.isArray(favNow)) {
            if (!st.favoriteDefectCauses || typeof st.favoriteDefectCauses !== 'object') st.favoriteDefectCauses = {};
            st.favoriteDefectCauses[b] = favNow.slice();
        }
        return b;
    }

    function getCauseOptionsForKey(key, types) {
        if (!window.state.customDefectCauses) window.state.customDefectCauses = {};
        if (!window.state.hiddenDefectCauses) window.state.hiddenDefectCauses = {};
        seedCauseSettingsFromLegacyKey(key);
        const bucket = causeSettingsBucket(key);
        const hidden = window.state.hiddenDefectCauses[bucket] || [];
        const ctx = getCurrentDefectCauseContext();
        const presetList = getDefaultCausePresetList(key, types, ctx.category, ctx.component)
            .filter(c => !hidden.includes(c));
        const customList = window.state.customDefectCauses[bucket] || [];
        const merged = [];
        const seen = new Set();
        [...presetList, ...customList].forEach((item) => {
            if (!item || seen.has(item)) return;
            seen.add(item);
            merged.push(item);
        });
        return applySavedOptionOrder(
            merged,
            getEffectiveCauseOrder(key, ensureOptionOrderEntry('defectCauseOrder', bucket))
        );
    }

    /** 종류의 기본 자동 체크 원인(첫 그룹 맨 위, '기타' 제외) */
    function getDefaultFirstCauseFor(defectTypeStr) {
        const g = getCauseDisplayGroups(defectTypeStr)[0];
        if (!g) return '';
        return getCauseOptionsForKey(g.key, g.types).filter(c => c && c !== '기타')[0] || '';
    }

    function renderMultiTypeCauseChecks(defectTypeStr, causeVal) {
        const box = document.getElementById('defectCauseChecks');
        const groupWrap = document.getElementById('quickCauseGroup');
        if (!box) return;
        if (!hasActionableDefectType(defectTypeStr)) {
            box.innerHTML = '';
            if (groupWrap) groupWrap.style.display = 'none';
            return;
        }

        const groups = getCauseDisplayGroups(defectTypeStr);
        const selected = new Set(parseCauseList(causeVal));

        if (!groups.length) {
            box.innerHTML = '';
            if (groupWrap) groupWrap.style.display = 'none';
            return;
        }

        const flatItems = [];
        const seenCauses = new Set();
        groups.forEach((g, gi) => {
            const tone = CAUSE_GROUP_TONES[gi % CAUSE_GROUP_TONES.length];
            const options = getCauseOptionsForKey(g.key, g.types).slice();
            parseCauseList(causeVal).forEach(c => {
                if (c && !options.includes(c)) options.push(c);
            });
            options.forEach((cause) => {
                if (!cause || seenCauses.has(cause)) return;
                seenCauses.add(cause);
                flatItems.push({ cause, tone });
            });
        });

        if (!flatItems.length) {
            box.innerHTML = '';
            if (groupWrap) groupWrap.style.display = 'none';
            return;
        }

        box.innerHTML = flatItems.map(({ cause, tone }, idx) => {
            const id = `causeCheck_${idx}_${String(cause).replace(/[^a-zA-Z0-9가-힣]/g, '_')}`;
            const checked = selected.has(cause) ? 'checked' : '';
            const safe = String(cause).replace(/"/g, '&quot;');
            return `<label class="defect-cause-check-item${checked ? ' is-checked' : ''}" for="${id}"
                style="--cause-tone-border:${tone.border};--cause-tone-bg:${tone.bg};--cause-tone-text:${tone.text};--cause-tone-accent:${tone.accent};">
                <input type="checkbox" id="${id}" value="${safe}" tabindex="-1" ${checked}>
                <span>${cause}</span>
            </label>`;
        }).join('');

        box.querySelectorAll('input[type="checkbox"]').forEach(inp => {
            inp.addEventListener('change', () => {
                // 자동으로 붙은 원인만 있을 때 다른 원인을 켜면 자동 원인을 빼고 바꿔 끼움
                const qp = getDefectQuickPresetsApi();
                if (qp && Array.isArray(window._defectAutoCauses) && window._defectAutoCauses.length) {
                    const res = qp.applyManualCauseToggle({
                        value: inp.value,
                        checked: inp.checked,
                        selected: getSelectedCausesFromUi(),
                        autoPicked: window._defectAutoCauses
                    });
                    window._defectAutoCauses = res.autoPicked;
                    const keepSet = new Set(res.selected);
                    box.querySelectorAll('input[type="checkbox"]').forEach((c) => {
                        if (c.checked && !keepSet.has(c.value)) c.checked = false;
                    });
                }
                if (isDefectBulkEditMode()) markDefectBulkFieldChanged('cause');
                const causes = getSelectedCausesFromUi();
                const joined = joinCauseList(causes);
                syncCauseComboValue(joined);
                box.querySelectorAll('.defect-cause-check-item').forEach(lab => {
                    const c = lab.querySelector('input');
                    lab.classList.toggle('is-checked', !!(c && c.checked));
                });
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
        });
        if (groupWrap) {
            groupWrap.style.display = defectTypeStr && !(typeof isGoodDefectType === 'function' ? isGoodDefectType(defectTypeStr) : defectTypeStr === '상태양호') ? '' : 'none';
        }
    }

    function syncCauseChecksFromValue(causeVal, optionList, defectTypeStr) {
        const typeVal = defectTypeStr != null ? defectTypeStr : getDefectComboValue(
            document.getElementById('defectType'),
            document.getElementById('defectTypeInput')
        );
        renderMultiTypeCauseChecks(typeVal, causeVal);
    }

    function updateDefectCauseDropdown(defectType, currentVal = null) {
        const select = document.getElementById('defectCause');
        if (!select) return;

        if (!window.state.customDefectCauses) {
            window.state.customDefectCauses = {};
        }
        if (!window.state.hiddenDefectCauses) window.state.hiddenDefectCauses = {};

        if (!defectType || !hasActionableDefectType(defectType)) {
            select.innerHTML = `<option value="" selected>—</option><option value="__ADD_CUSTOM_CAUSE__">➕ [결함 원인 직접 추가...]</option>`;
            syncCauseComboValue('');
            syncCauseChecksFromValue('', []);
            const group = document.getElementById('quickCauseGroup');
            if (group) group.style.display = 'none';
            return;
        }

        const key = getCauseKey(defectType);
        const keyGroup = getCauseDisplayGroups(defectType).find(g => g.key === key);
        const allOptions = getCauseOptionsForKey(key, keyGroup ? keyGroup.types : undefined);

        let html = `<option value="" ${!currentVal ? 'selected' : ''}>—</option>`;
        allOptions.forEach(item => {
            const sel = (currentVal && currentVal === item) ? 'selected' : '';
            html += `<option value="${item}" ${sel}>${item}</option>`;
        });

        html += `<option value="__ADD_CUSTOM_CAUSE__">➕ [결함 원인 직접 추가...]</option>`;
        select.innerHTML = html;

        if (currentVal) {
            const parts = parseCauseList(currentVal);
            const missing = parts.filter(p => !allOptions.includes(p));
            missing.forEach(p => {
                const customOpt = document.createElement('option');
                customOpt.value = p;
                customOpt.textContent = p;
                select.insertBefore(customOpt, select.lastElementChild);
                allOptions.push(p);
            });
            if (parts.length > 1 || (parts.length === 1 && !allOptions.includes(parts[0]))) {
                ensureDefectComboOption(select, currentVal);
            }
        }

        const resolved = (currentVal !== null && currentVal !== undefined)
            ? currentVal
            : (isDefectComboCustomToken(select.value) ? '' : select.value);
        syncCauseComboValue(resolved);
        syncCauseChecksFromValue(resolved, allOptions, defectType);
        refreshDefectQuickPickBar();
    }

    // Category Change Listener & Custom Option Click
    const defectCategorySelect = document.getElementById('defectCategory');
    if (defectCategorySelect) {
        defectCategorySelect.addEventListener('change', (e) => {
            // 구조 분류(구조체·비구조체·마감재)를 바꿔도 이미 입력한 부재 명칭·결함 종류는 지우지 않는다(2026-10-28).
            // 목록(칩)만 새 분류 기준으로 다시 만들고, 새 목록에 없는 값은 직접 입력한 값처럼 그대로 남긴다.
            // (예전엔 부재·종류 입력을 비워서 종류가 없으니 폭·길이 칸까지 숨겨져 「치수가 초기화」된 것처럼 보였다)
            // 미장균열 → 비구조체 자동 전환은 같은 값을 명시적으로 넘기는 경로(preserve 플래그)라 그대로 둔다.
            const cat = e.target.value;
            const preserveType = window._preserveDefectTypeOnCategoryChange;
            const preserveComp = window._preserveDefectComponentOnCategoryChange;
            window._preserveDefectTypeOnCategoryChange = null;
            window._preserveDefectComponentOnCategoryChange = null;
            if (preserveType) {
                populateDefectComponentDropdown(cat, preserveComp || '');
                updateDefectTypeDropdown(cat, preserveType);
            } else {
                const compSel = document.getElementById('defectComponent');
                const compInp = document.getElementById('defectComponentInput');
                const typeSel = document.getElementById('defectType');
                const typeInp = document.getElementById('defectTypeInput');
                const keepComp = getDefectComboValue(compSel, compInp) || '';
                const keepType = getDefectComboValue(typeSel, typeInp) || '';
                const causesBefore = getSelectedCausesFromUi();
                populateDefectComponentDropdown(cat, keepComp);
                updateDefectTypeDropdown(cat, keepType);
                // 종류가 그대로니 직접 고른 발생 원인도 그대로(종류가 바뀌면 원인 목록이 달라지므로 같은 종류일 때만)
                if (keepType && causesBefore.length && hasActionableDefectType(keepType)) {
                    updateDefectCauseDropdown(keepType, joinCauseList(causesBefore));
                }
            }
            toggleDefectSizeInputMode();
            // 2026-11-08 미장 결함도 사용자가 구조체를 누르면 그 선택을 존중(같은 종류인 동안 다시 옮기지 않음, 「검토」가 짚는다).
            // 예전(10-28~11-08)에는 바로 비구조체로 되돌려 「균열, 미장균열」 슬래브를 구조체로 고칠 수 없었다.
            if (cat === '구조체' && !window._plasterAutoSwitching && !window._defectFormHydrating) {
                const pt = getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput'));
                if (defectTypeListHasPlasterCrack(pt)) window._plasterKeepStructural = true;
            }
            // 접합부 이격: 자동으로 옮긴 게 아니라 사용자가 구조체를 눌렀다면 그 선택을 존중(같은 부재·종류인 동안)
            if (cat === '구조체' && !window._jointGapAutoSwitching && !window._defectFormHydrating) {
                const jc = getDefectComboValue(document.getElementById('defectComponent'), document.getElementById('defectComponentInput'));
                const jt = getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput'));
                if (isJointGapDefect(jc, jt)) window._jointGapKeepStructural = true;
            }
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            refreshDefectQuickPickBar();
        });
    }

    const defectComponentSelect = document.getElementById('defectComponent');
    if (defectComponentSelect) {
        defectComponentSelect.addEventListener('change', async (e) => {
            if (e.target.value === '__ADD_CUSTOM_COMPONENT__') {
                const newComp = await window.appPrompt('추가하실 부재 명칭을 입력하세요 (예: 옹벽):');
                const cat = document.getElementById('defectCategory')?.value || '구조체';
                if (newComp && newComp.trim()) {
                    const trimmed = newComp.trim();
                    migrateDefectComponentStateShape();
                    if (!window.state.customDefectComponents) window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
                    if (!window.state.customDefectComponents[cat]) window.state.customDefectComponents[cat] = [];
                    if (!window.state.customDefectComponents[cat].includes(trimmed)
                        && shouldLearnDefectComponentForCategory(cat, trimmed)) {
                        window.state.customDefectComponents[cat].push(trimmed);
                        const order = ensureOptionOrderEntry('defectComponentOrder', cat);
                        if (!order.includes(trimmed)) order.push(trimmed);
                        saveStateToLocalStorage();
                    }
                    populateDefectComponentDropdown(cat, trimmed);
                } else {
                    populateDefectComponentDropdown(cat);
                }
            } else {
                syncDefectComboFields(
                    e.target,
                    document.getElementById('defectComponentInput'),
                    e.target.value
                );
                const cat = document.getElementById('defectCategory')?.value || '구조체';
                refreshDefectTypeAfterComponentChange(cat);
                maybeReclassifyJointGapToNonStructural();
            }
        });
    }

    const defectTypeSelect = document.getElementById('defectType');
    if (defectTypeSelect) {
        defectTypeSelect.addEventListener('change', async (e) => {
            if (e.target.value === '__ADD_CUSTOM__') {
                const newType = await window.appPrompt('추가하실 결함 종류를 입력하세요 (예: 에어컨 배관 이격):');
                const cat = document.getElementById('defectCategory')?.value || '구조체';
                if (newType && newType.trim()) {
                    const trimmed = newType.trim();
                    if (!isTransientDefectTypeValue(trimmed)) {
                        if (!window.state.customDefectTypes) window.state.customDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
                        // 부재를 골랐으면 그 부재에만 추가(다른 부재에 안 뜨게) — 2026-11-13
                        const typeBucket = ownDefectTypeSettingsBucket(cat, getDefectComboValue(
                            document.getElementById('defectComponent'),
                            document.getElementById('defectComponentInput')
                        ));
                        if (!window.state.customDefectTypes[typeBucket]) window.state.customDefectTypes[typeBucket] = [];
                        if (!window.state.customDefectTypes[typeBucket].includes(trimmed)) {
                            window.state.customDefectTypes[typeBucket].push(trimmed);
                            const order = ensureOptionOrderEntry('defectTypeOrder', typeBucket);
                            if (!order.includes(trimmed)) order.push(trimmed);
                            saveStateToLocalStorage();
                        }
                    }
                    updateDefectTypeDropdown(cat, trimmed);
                    maybeReclassifyPlasterCrackToNonStructural();
                } else {
                    updateDefectTypeDropdown(cat);
                }
            } else {
                syncDefectComboFields(
                    e.target,
                    document.getElementById('defectTypeInput'),
                    e.target.value
                );
                applyCauseAutoPickForType(e.target.value);
                toggleDefectSizeInputMode();
                if (maybeReclassifyPlasterCrackToNonStructural()) return;
                if (maybeReclassifyJointGapToNonStructural()) return;
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
                refreshDefectQuickPickBar();
            }
        });
    }

    const defectCauseSelect = document.getElementById('defectCause');
    if (defectCauseSelect) {
        defectCauseSelect.addEventListener('change', async (e) => {
            if (e.target.value === '__ADD_CUSTOM_CAUSE__') {
                const newCause = await window.appPrompt('추가하실 결함 원인 추정 내용을 입력하세요 (예: 지하수관 수압 유입):');
                const dType = getDefectComboValue(
                    document.getElementById('defectType'),
                    document.getElementById('defectTypeInput')
                ) || '균열';
                if (newCause && newCause.trim()) {
                    addCustomDefectCause(newCause.trim());
                } else {
                    updateDefectCauseDropdown(dType, joinCauseList(getSelectedCausesFromUi()));
                }
            } else {
                const picked = e.target.value;
                if (!picked || isDefectComboCustomToken(picked)) {
                    syncCauseComboValue('');
                    syncCauseChecksFromValue('', getQuickPickOptionsFromSelect(e.target));
                } else {
                    // 셀렉트 단일은 기존 선택에 합침 (목록 저장 없이 — 프리셋/이번 결함 수기값이 커스텀으로 복제되지 않게)
                    selectDefectCauseForCurrentDefect(picked, false);
                }
            }
        });
    }

    bindDefectComboInputs();
        bindDefectHandwriteTabOrder();
    bindDefectMeasureInputs();

    const ARROW_OCTANT_META = {
        0: { symbol: '→', name: '동' },
        1: { symbol: '↘', name: '남동' },
        2: { symbol: '↓', name: '남' },
        3: { symbol: '↙', name: '남서' },
        4: { symbol: '←', name: '서' },
        5: { symbol: '↖', name: '북서' },
        6: { symbol: '↑', name: '북' },
        7: { symbol: '↗', name: '북동' }
    };

    function getArrowOctantLabelText(octant, forced) {
        const meta = ARROW_OCTANT_META[((parseInt(octant, 10) || 0) % 8 + 8) % 8] || ARROW_OCTANT_META[0];
        if (!forced) return '지정 안 함';
        return `지정: ${meta.symbol} ${meta.name}`;
    }

    function updateDefectArrowOctantLabel() {
        const label = document.getElementById('defectArrowOctantLabel');
        if (!label) return;
        const forced = !!document.getElementById('defectForceArrowDir')?.checked;
        const octant = document.getElementById('defectArrowOctant')?.value || 0;
        label.textContent = getArrowOctantLabelText(octant, forced);
        label.classList.toggle('is-forced', forced);
        label.classList.toggle('is-off', !forced);
    }

    function setDefectArrowOctant(octant) {
        const v = ((parseInt(octant, 10) || 0) % 8 + 8) % 8;
        const hidden = document.getElementById('defectArrowOctant');
        if (hidden) hidden.value = `${v}`;
        document.querySelectorAll('#defectArrowOctantGrid .arrow-octant-btn').forEach(btn => {
            btn.classList.toggle('selected', parseInt(btn.dataset.octant, 10) === v);
            btn.setAttribute('aria-pressed', parseInt(btn.dataset.octant, 10) === v ? 'true' : 'false');
        });
        updateDefectArrowOctantLabel();
        if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
    }

    function syncDefectArrowDirUi() {
        const forceArrowDirEl = document.getElementById('defectForceArrowDir');
        const grid = document.getElementById('defectArrowOctantGrid');
        const enabled = !!(forceArrowDirEl && forceArrowDirEl.checked);
        if (grid) {
            grid.classList.toggle('disabled', !enabled);
            grid.querySelectorAll('.arrow-octant-btn').forEach(btn => { btn.disabled = !enabled; });
        }
        updateDefectArrowOctantLabel();
        if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
    }

    function bindDefectArrowOctantGrid() {
        const grid = document.getElementById('defectArrowOctantGrid');
        const forceArrowDirEl = document.getElementById('defectForceArrowDir');
        if (!grid || grid.dataset.bound) return;
        grid.dataset.bound = '1';
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.arrow-octant-btn');
            if (!btn || btn.disabled) return;
            setDefectArrowOctant(btn.dataset.octant);
        });
        if (forceArrowDirEl && !forceArrowDirEl.dataset.boundArrowDirToggle) {
            forceArrowDirEl.addEventListener('change', syncDefectArrowDirUi);
            forceArrowDirEl.dataset.boundArrowDirToggle = '1';
        }
        setDefectArrowOctant(document.getElementById('defectArrowOctant')?.value || 0);
        syncDefectArrowDirUi();
    }

    bindDefectArrowOctantGrid();

    function applySavedOptionOrder(items, orderList) {
        if (!Array.isArray(items) || !items.length) return [];
        if (!Array.isArray(orderList) || !orderList.length) return items.slice();
        const remaining = new Set(items);
        const out = [];
        orderList.forEach((t) => {
            if (remaining.has(t)) {
                out.push(t);
                remaining.delete(t);
            }
        });
        const extra = items.filter((t) => remaining.has(t));
        // 저장된 순서에 없는 항목(앱에 새로 들어간 기본 항목 등)은 '기타' 가 맨 끝이면 그 앞에 끼움
        if (extra.length && out.length && out[out.length - 1] === '기타') {
            out.splice(out.length - 1, 0, ...extra);
        } else {
            out.push(...extra);
        }
        return out;
    }

    function ensureOptionOrderEntry(bucket, key) {
        // 2026-11-06 대분류 미선택('') — 저장하지 않는다. '' 칸은 서버가 거부해 자동 올리기 전체가 멈췄다
        if (key === '' || key == null) return [];
        if (!window.state[bucket] || typeof window.state[bucket] !== 'object') {
            window.state[bucket] = {};
        }
        if (!Array.isArray(window.state[bucket][key])) {
            window.state[bucket][key] = [];
        }
        return window.state[bucket][key];
    }

    function getDefaultVisibleOptionTexts(ctx) {
        const visiblePreset = (ctx.presetList || []).filter(item => !(ctx.hiddenList || []).includes(item));
        const customs = (ctx.customList || []).filter(item => !visiblePreset.includes(item));
        return visiblePreset.concat(customs);
    }

    function getOrderedVisibleOptionItems(ctx) {
        const order = ctx.favField === 'cause' ? getEffectiveCauseOrder(ctx.causeKey || ctx.favBucket, ctx.orderList) : ctx.orderList;
        const texts = applySavedOptionOrder(getDefaultVisibleOptionTexts(ctx), order);
        return texts.map((text) => ({
            text,
            isPreset: (ctx.presetList || []).includes(text) && !(ctx.hiddenList || []).includes(text)
        }));
    }

    // --- 부재 명칭 / 결함 종류 / 결함 원인 항목 관리(추가·삭제) 모달 ---
    function getOptionManagerContext() {
        const field = window._optionManagerField;

        if (field === 'component') {
            const compCat = document.getElementById('defectCategory')?.value || '구조체';
            migrateDefectComponentStateShape();
            if (!window.state.customDefectComponents) window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
            if (!window.state.hiddenDefectComponents) window.state.hiddenDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
            if (!window.state.customDefectComponents[compCat]) window.state.customDefectComponents[compCat] = [];
            if (!window.state.hiddenDefectComponents[compCat]) window.state.hiddenDefectComponents[compCat] = [];
            return {
                title: `부재 명칭 세팅 (${compCat})`,
                favField: 'component',
                favBucket: compCat,
                presetList: getDefectComponentPresetForCategory(compCat),
                hiddenList: window.state.hiddenDefectComponents[compCat],
                customList: window.state.customDefectComponents[compCat],
                orderList: ensureOptionOrderEntry('defectComponentOrder', compCat),
                labelFor: (item) => (item === '기타' ? '기타 부재' : item),
                refresh: () => populateDefectComponentDropdown(compCat, getDefectComboValue(
                    document.getElementById('defectComponent'),
                    document.getElementById('defectComponentInput')
                ))
            };
        }

        if (field === 'type') {
            const cat = document.getElementById('defectCategory')?.value || '구조체';
            const component = getDefectComboValue(
                document.getElementById('defectComponent'),
                document.getElementById('defectComponentInput')
            );
            if (!window.state.customDefectTypes) window.state.customDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
            if (!window.state.hiddenDefectTypes) window.state.hiddenDefectTypes = {};
            if (!window.state.hiddenDefectTypes[cat]) window.state.hiddenDefectTypes[cat] = [];
            if (!window.state.customDefectTypes[cat]) window.state.customDefectTypes[cat] = [];
            // 부재를 골랐으면 그 부재 칸만 고친다(다른 부재는 그대로) — 2026-11-13
            const typeBucket = ownDefectTypeSettingsBucket(cat, component);
            const compLabel = settingsComponentName(component);
            return {
                title: compLabel ? `결함 종류 세팅 (${cat} · ${compLabel})` : `결함 종류 세팅 (${cat})`,
                favField: 'type',
                favBucket: typeBucket,
                presetList: getDefectTypePresetFor(cat, component),
                hiddenList: window.state.hiddenDefectTypes[typeBucket],
                customList: window.state.customDefectTypes[typeBucket],
                orderList: ensureOptionOrderEntry('defectTypeOrder', typeBucket),
                labelFor: (item) => item,
                refresh: () => updateDefectTypeDropdown(cat, getDefectComboValue(
                    document.getElementById('defectType'),
                    document.getElementById('defectTypeInput')
                ))
            };
        }

        if (field === 'cause') {
            const dType = getDefectComboValue(
                document.getElementById('defectType'),
                document.getElementById('defectTypeInput')
            ) || '균열';
            // 세팅 창의 「결함 종류」 선택으로 다른 종류의 원인 목록도 바로 편집
            // 결함 종류를 여러 개 고른 마킹은 마지막에 고른 종류를 먼저 보여 준다(「콘크리트 박리, 도장 박리」→ 도장 박리)
            const causeGroups = getCauseDisplayGroups(dType);
            const key = window._optionManagerCauseKey || causeGroups[causeGroups.length - 1]?.key || getCauseKey(dType);
            if (!window.state.customDefectCauses) window.state.customDefectCauses = {};
            if (!window.state.hiddenDefectCauses) window.state.hiddenDefectCauses = {};
            seedCauseSettingsFromLegacyKey(key);
            if (!window.state.hiddenDefectCauses[key]) window.state.hiddenDefectCauses[key] = [];
            if (!window.state.customDefectCauses[key]) window.state.customDefectCauses[key] = [];
            // 분류·부재를 골랐으면 「분류|부재|종류」 칸만 고친다 — 같은 종류라도 다른 부재는 그대로 (2026-11-13)
            const tree = causeTreeContext();
            const causeBucket = ownCauseSettingsBucket(key, tree);
            const treeLabel = causeBucket !== key ? `${tree.category} · ${settingsComponentName(tree.component)} · ${key}` : key;
            return {
                title: `발생 원인 세팅 (${treeLabel})`,
                favField: 'cause',
                favBucket: causeBucket,
                causeKey: key,
                presetList: (() => {
                    const cctx = getCurrentDefectCauseContext();
                    const g = getCauseDisplayGroups(dType).find(x => x.key === key);
                    return getDefaultCausePresetList(key, g ? g.types : undefined, cctx.category, cctx.component);
                })(),
                hiddenList: window.state.hiddenDefectCauses[causeBucket],
                customList: window.state.customDefectCauses[causeBucket],
                orderList: ensureOptionOrderEntry('defectCauseOrder', causeBucket),
                labelFor: (item) => item,
                refresh: () => updateDefectCauseDropdown(dType, getDefectComboValue(
                    document.getElementById('defectCause'),
                    document.getElementById('defectCauseInput')
                ))
            };
        }

        return null;
    }

    function commitOptionManagerOrderFromDom(listEl) {
        const ctx = getOptionManagerContext();
        if (!ctx || !ctx.orderList || !listEl) return;
        const texts = Array.from(listEl.querySelectorAll('.option-manager-item'))
            .map((row) => row.dataset.value)
            .filter(Boolean);
        ctx.orderList.length = 0;
        texts.forEach((t) => ctx.orderList.push(t));
        deferOptionManagerSave(ctx);
    }

    /** 2026-11-13 ⚙ 창: 화면을 먼저 바꾸고 저장(전체 자료 저장이라 느림)·수정창 갱신은 바로 뒤에 한 번만 */
    let _optionManagerSaveTimer = 0;
    function deferOptionManagerSave(ctx) {
        if (_optionManagerSaveTimer) clearTimeout(_optionManagerSaveTimer);
        _optionManagerSaveTimer = setTimeout(() => {
            _optionManagerSaveTimer = 0;
            saveStateToLocalStorage();
            if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
        }, 60);
    }

    function bindOptionManagerDrag(listEl) {
        const handles = listEl.querySelectorAll('.option-manager-item-handle');
        handles.forEach((handle) => {
            handle.addEventListener('pointerdown', (e) => {
                if (e.button != null && e.button !== 0) return;
                const row = handle.closest('.option-manager-item');
                if (!row || !listEl.contains(row)) return;
                e.preventDefault();
                e.stopPropagation();

                const rowRect = row.getBoundingClientRect();
                const listRect = listEl.getBoundingClientRect();
                const offsetY = e.clientY - rowRect.top;
                const placeholder = document.createElement('div');
                placeholder.className = 'option-manager-item-placeholder';
                placeholder.style.height = `${rowRect.height}px`;
                listEl.insertBefore(placeholder, row.nextSibling);

                row.classList.add('is-dragging');
                listEl.classList.add('is-reordering');
                row.style.width = `${rowRect.width}px`;
                row.style.left = `${rowRect.left}px`;
                row.style.top = `${rowRect.top}px`;
                row.style.position = 'fixed';
                row.style.zIndex = '10050';
                row.style.pointerEvents = 'none';
                row.style.margin = '0';
                document.body.appendChild(row);

                handle.setPointerCapture(e.pointerId);

                // 2026-11-13 버벅임: 예전엔 마우스가 움직일 때마다 모든 줄의 위치를 다시 재고 자리 표시를 다시 꽂았다.
                // 지금은 화면 한 번 그릴 때 한 번만(rAF), 줄 위치는 자리 표시가 실제로 옮겨졌을 때만 다시 잰다.
                const rows = Array.from(listEl.querySelectorAll('.option-manager-item'));
                let mids = null;
                let lastScroll = listEl.scrollTop;
                const measure = () => {
                    mids = rows.map((other) => { const r = other.getBoundingClientRect(); return r.top + r.height / 2; });
                    lastScroll = listEl.scrollTop;
                };
                let beforeRow; // 자리 표시 바로 뒤 줄(undefined = 아직 모름, null = 맨 끝)
                const moveRowToY = (clientY) => {
                    const top = clientY - offsetY;
                    const minTop = listRect.top - rowRect.height * 0.35;
                    const maxTop = listRect.bottom - rowRect.height * 0.65;
                    row.style.top = `${Math.max(minTop, Math.min(maxTop, top))}px`;

                    if (!mids || listEl.scrollTop !== lastScroll) measure();
                    let target = null;
                    for (let i = 0; i < rows.length; i++) {
                        if (clientY < mids[i]) { target = rows[i]; break; }
                    }
                    if (target === beforeRow) return;
                    beforeRow = target;
                    if (target) listEl.insertBefore(placeholder, target);
                    else listEl.appendChild(placeholder);
                    mids = null; // 자리 표시가 옮겨져 줄 위치가 바뀜 — 다음에 다시 잰다
                };
                moveRowToY(e.clientY);

                let pendingY = null;
                let rafId = 0;
                const onMove = (ev) => {
                    pendingY = ev.clientY;
                    if (rafId) return;
                    rafId = requestAnimationFrame(() => {
                        rafId = 0;
                        if (pendingY != null) moveRowToY(pendingY);
                    });
                };
                const onUp = () => {
                    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
                    if (pendingY != null) moveRowToY(pendingY);
                    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
                    handle.removeEventListener('pointermove', onMove);
                    handle.removeEventListener('pointerup', onUp);
                    handle.removeEventListener('pointercancel', onUp);

                    listEl.insertBefore(row, placeholder);
                    placeholder.remove();
                    row.classList.remove('is-dragging');
                    listEl.classList.remove('is-reordering');
                    row.style.cssText = '';
                    Array.from(listEl.querySelectorAll('.option-manager-item')).forEach((r, i) => {
                        r.dataset.idx = String(i);
                    });
                    commitOptionManagerOrderFromDom(listEl);
                };
                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
                handle.addEventListener('pointercancel', onUp);
            });
        });
    }

    function renderOptionManagerList() {
        const ctx = getOptionManagerContext();
        const titleEl = document.getElementById('optionManagerTitle');
        const listEl = document.getElementById('optionManagerList');
        if (!ctx || !listEl) return;

        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-list-check"></i> ${ctx.title}`;
        renderOptionManagerExtra(ctx);

        const visibleItems = getOrderedVisibleOptionItems(ctx);
        const favSet = new Set(ctx.favField ? getDefectFavoriteList(ctx.favField, ctx.favBucket) : []);

        listEl.innerHTML = '';
        if (visibleItems.length === 0) {
            listEl.innerHTML = '<div class="defect-list-empty">표시할 항목이 없습니다.</div>';
            return;
        }

        visibleItems.forEach(({ text, isPreset }, idx) => {
            const row = document.createElement('div');
            row.className = 'option-manager-item';
            row.dataset.value = text;
            row.dataset.idx = String(idx);

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'option-manager-item-handle';
            handle.title = '끌어서 순서 변경';
            handle.setAttribute('aria-label', '끌어서 순서 변경');
            handle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';
            row.appendChild(handle);

            if (ctx.favField) {
                const isFav = favSet.has(text);
                const star = document.createElement('button');
                star.type = 'button';
                star.className = 'option-manager-item-star' + (isFav ? ' is-on' : '');
                star.textContent = isFav ? '★' : '☆';
                star.title = ctx.favField === 'cause'
                    ? (isFav ? '자동 체크 해제' : '이 종류를 고르면 자동 체크')
                    : (isFav ? '즐겨찾기 해제' : '즐겨찾기 — 결함 수정창에 항상 먼저 보임');
                star.setAttribute('aria-pressed', isFav ? 'true' : 'false');
                star.addEventListener('click', () => {
                    toggleDefectFavorite(ctx.favField, ctx.favBucket, text);
                    renderOptionManagerList();
                    if (typeof refreshDefectQuickPickBar === 'function') refreshDefectQuickPickBar();
                });
                row.appendChild(star);
            }

            const label = document.createElement('span');
            label.className = 'option-manager-item-label';
            label.textContent = ctx.labelFor(text);
            row.appendChild(label);

            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'option-manager-item-delete';
            delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
            delBtn.disabled = visibleItems.length <= 1;
            delBtn.title = delBtn.disabled ? '최소 1개는 남아있어야 합니다' : '삭제';
            delBtn.addEventListener('click', () => deleteOptionItem(text, isPreset));
            row.appendChild(delBtn);

            listEl.appendChild(row);
        });
        bindOptionManagerDrag(listEl);
    }

    /** 세팅 창 위쪽: 안내 + (원인) 결함 종류 고르기 · 자동 체크 켜기/끄기 */
    function renderOptionManagerExtra(ctx) {
        const host = document.getElementById('optionManagerExtra');
        if (!host) return;
        const who = window.state.uid ? '로그인한 계정에 저장 (다른 기기에서도 같음)' : '이 기기에 저장 (로그인하면 계정에 저장)';
        if (ctx.favField !== 'cause') {
            host.innerHTML = `<p class="option-manager-note">★ = 결함 수정창에 먼저 보임 · 끌어서 순서 변경<br><span>${escapeHtml(who)}</span></p>`;
            return;
        }
        const keys = [];
        const seen = new Set();
        const pushKey = (k) => { if (k && !seen.has(k)) { seen.add(k); keys.push(k); } };
        const curKey = ctx.causeKey || ctx.favBucket;
        pushKey(curKey);
        Object.keys(defectCausePreset).forEach(pushKey);
        // 「분류|부재|종류」 칸은 종류 목록에 넣지 않는다(지금 부재 기준으로 열린다)
        Object.keys(window.state.customDefectCauses || {}).filter((k) => !String(k).includes('|')).forEach(pushKey);
        const autoOn = window.state.defectCauseAutoCheck !== false;
        host.innerHTML = `
            <label class="option-manager-extra-row">결함 종류
                <select id="optionManagerCauseKey" class="form-select">${keys.map((k) => `<option value="${escapeHtml(k)}"${k === curKey ? ' selected' : ''}>${escapeHtml(k)}</option>`).join('')}</select>
            </label>
            <label class="option-manager-extra-row option-manager-extra-check">
                <input type="checkbox" id="optionManagerCauseAuto"${autoOn ? ' checked' : ''}> 결함 종류를 고르면 원인 자동 체크
            </label>
            <p class="option-manager-note">★ 원인이 자동 체크됩니다(★ 없으면 맨 위 원인). 다른 원인을 누르면 자동 원인과 바꿔 끼워요 · 끌어서 순서 = 결함 수정창 순서<br><span>${escapeHtml(who)}</span></p>`;
        const sel = host.querySelector('#optionManagerCauseKey');
        if (sel) {
            sel.addEventListener('change', () => {
                window._optionManagerCauseKey = sel.value || null;
                renderOptionManagerList();
            });
        }
        const chk = host.querySelector('#optionManagerCauseAuto');
        if (chk) {
            chk.addEventListener('change', () => {
                window.state.defectCauseAutoCheck = !!chk.checked;
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            });
        }
    }

    async function deleteOptionItem(item, isPreset) {
        const ctx = getOptionManagerContext();
        if (!ctx) return;

        const visibleCount = ctx.presetList.filter(p => !ctx.hiddenList.includes(p)).length + ctx.customList.length;
        if (visibleCount <= 1) {
            window.showToast('최소 1개는 남아있어야 합니다.', 'warning');
            return;
        }

        const label = ctx.labelFor ? ctx.labelFor(item) : item;
        if (!await window.confirmDelete(`「${label}」 항목을 삭제할까요?`)) return;

        // 2026-11-13 「삭제가 잘 안 된다」: 같은 이름이 기본 목록과 직접 추가 목록 둘 다에 있으면 한쪽만 지워져
        // 그대로 남았다(두 번 눌러야 사라짐). 직접 추가에서 다 빼고, 기본 목록에 있으면 숨김에도 넣는다.
        for (let i = ctx.customList.length - 1; i >= 0; i--) {
            if (ctx.customList[i] === item) ctx.customList.splice(i, 1);
        }
        if ((isPreset || (ctx.presetList || []).includes(item)) && !ctx.hiddenList.includes(item)) ctx.hiddenList.push(item);
        if (Array.isArray(ctx.orderList)) {
            for (let i = ctx.orderList.length - 1; i >= 0; i--) {
                if (ctx.orderList[i] === item) ctx.orderList.splice(i, 1);
            }
        }

        renderOptionManagerList();
        deferOptionManagerSave(ctx);
    }

    async function resetOptionManagerCurrent() {
        const field = window._optionManagerField;
        if (!field) return;
        const ctx = getOptionManagerContext();
        if (!ctx) return;

        const ok = await window.appConfirm('현재 항목을 앱 기본 세팅으로 되돌릴까요?\n(숨긴 항목 복원 · 직접 추가한 항목 삭제 · 순서는 기본 순서)');
        if (!ok) return;

        if (Array.isArray(ctx.hiddenList)) ctx.hiddenList.length = 0;
        if (Array.isArray(ctx.customList)) ctx.customList.length = 0;
        if (Array.isArray(ctx.orderList)) {
            // 빈 순서 = 앱 기본 순서. 기본 목록을 복사해 두면 나중에 기본값을 고쳐도 이 회사만 옛 순서에 묶임
            ctx.orderList.length = 0;
        }
        if (ctx.favField && ctx.favBucket) {
            const favKey = ctx.favField === 'component' ? 'favoriteDefectComponents'
                : (ctx.favField === 'type' ? 'favoriteDefectTypes' : 'favoriteDefectCauses');
            if (window.state[favKey] && typeof window.state[favKey] === 'object') delete window.state[favKey][ctx.favBucket];
        }
        saveStateToLocalStorage();
        _lastSyncedUserDefectPinJson = '';
        scheduleSyncUserDefectPinPresets();

        if (field === 'component') {
            const cat = document.getElementById('defectCategory')?.value || '구조체';
            populateDefectComponentDropdown(cat, '');
        } else if (field === 'type') {
            const cat = document.getElementById('defectCategory')?.value || '구조체';
            const component = getDefectComboValue(
                document.getElementById('defectComponent'),
                document.getElementById('defectComponentInput')
            );
            const presetList = getDefectTypePresetFor(cat, component) || categoryDefectPreset[cat] || [];
            const defType = presetList.find(t => !(typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) || presetList[0] || '';
            updateDefectTypeDropdown(cat, defType);
            if (defType) {
                const defCause = getDefaultFirstCauseFor(defType);
                updateDefectCauseDropdown(defType, defCause);
            }
        } else if (field === 'cause') {
            const typeVal = getDefectComboValue(
                document.getElementById('defectType'),
                document.getElementById('defectTypeInput')
            ) || '균열';
            const defCause = getDefaultFirstCauseFor(typeVal);
            updateDefectCauseDropdown(typeVal, defCause);
        }

        renderOptionManagerList();
        if (typeof ctx.refresh === 'function') ctx.refresh();
        if (typeof refreshDefectQuickPickBar === 'function') refreshDefectQuickPickBar();
        window.showToast('앱 기본 세팅으로 복원했습니다.', 'success', 2800);
    }

    /** 코드에 정의된 부재·결함종류·원인 프리셋 = 앱 기본 세팅 */
    function applyBuiltInDefectPinDefaults() {
        migrateDefectComponentStateShape();
        window.state.hiddenDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        // 2026-11-02 프로그램 기본 세팅 = 코드의 목록. 순서는 비워 두어 기본 목록을 따른다 —
        // 목록을 복사해 얼려 두면 프로그램이 기본 목록을 고쳐도(원인·결함 추가 등) 회사가 옛 목록에 묶인다.
        window.state.defectComponentOrder = {};

        window.state.hiddenDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
        window.state.customDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
        window.state.defectTypeOrder = {};

        window.state.hiddenDefectCauses = {};
        window.state.customDefectCauses = {};
        window.state.defectCauseOrder = {};
        window.state.favoriteDefectComponents = {};
        window.state.favoriteDefectTypes = {};
        window.state.favoriteDefectCauses = {};
        window.state.defectCauseAutoCheck = true;
    }

    async function resetOptionManagerAll() {
        const ok = await window.appConfirm('부재·결함종류·발생원인 전체를 앱 기본 세팅으로 되돌릴까요?\n(숨긴 항목 복원 · 직접 추가 전부 삭제 · 순서는 기본 순서)\n※ 이 세팅은 회사 공통이라 우리 회사 모든 계정에 적용됩니다.');
        if (!ok) return;

        applyBuiltInDefectPinDefaults();
        saveStateToLocalStorage();
        _lastSyncedUserDefectPinJson = '';
        scheduleSyncUserDefectPinPresets();

        const cat = document.getElementById('defectCategory')?.value || '구조체';
        populateDefectComponentDropdown(cat, '');

        const component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        ) || '';
        const presetList = getDefectTypePresetFor(cat, component) || categoryDefectPreset[cat] || [];
        const defType = presetList.find(t => !(typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) || presetList[0] || '';
        updateDefectTypeDropdown(cat, defType);

        if (defType) {
            const defCause = getDefaultFirstCauseFor(defType);
            updateDefectCauseDropdown(defType, defCause);
        }

        renderOptionManagerList();
        const ctx = getOptionManagerContext();
        if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
        if (typeof refreshDefectQuickPickBar === 'function') refreshDefectQuickPickBar();
        window.showToast('앱 기본 세팅으로 복원했습니다.', 'success', 2800);
    }

    // 2026-11-13 세팅 프리셋 3종: ① 앱 기본(코드 목록) ② 서버 프리셋 ③ 회사 기본 프리셋.
    //  ②③은 회사 서버(safety_app/{회사}/bulkData/settingsPresets)에 부재·결함종류·원인 세팅 전체를 통째로 저장해 두고
    //  「초기화 후 그대로 불러오기」로 되돌린다. 기존 규칙(bulkData 하위 문서는 회사 소속원 읽기·쓰기)을 그대로 씀.
    const DEFECT_SETTINGS_PRESET_KEYS = ['customDefectTypes', 'customDefectCauses', 'customDefectComponents',
        'hiddenDefectComponents', 'hiddenDefectTypes', 'hiddenDefectCauses', 'defectComponentOrder', 'defectTypeOrder',
        'defectCauseOrder', 'favoriteDefectComponents', 'favoriteDefectTypes', 'favoriteDefectCauses', 'defectCauseAutoCheck'];
    const DEFECT_SETTINGS_PRESET_LABEL = { server: '서버 프리셋', company: '회사 기본 프리셋' };

    function defectSettingsPresetRef() {
        const cid = window.state && window.state.companyId;
        if (!cid || typeof db === 'undefined' || !db) return null;
        return db.collection('safety_app').doc(cid).collection('bulkData').doc('settingsPresets');
    }

    function snapshotDefectSettings() {
        const data = {};
        DEFECT_SETTINGS_PRESET_KEYS.forEach((k) => {
            if (window.state[k] !== undefined) data[k] = JSON.parse(JSON.stringify(window.state[k]));
        });
        // Firestore는 중첩 배열을 못 받으므로 문자열로 저장
        return JSON.stringify(data);
    }

    async function saveDefectSettingsPreset(which) {
        const label = DEFECT_SETTINGS_PRESET_LABEL[which];
        const ref = defectSettingsPresetRef();
        if (!label || !ref || navigator.onLine === false) {
            window.showToast('서버에 연결된 상태(회사 로그인)에서만 저장할 수 있습니다.', 'warning', 3500);
            return;
        }
        const ok = await window.appConfirm(`지금 세팅(부재·결함종류·발생원인 전체)을 「${label}」으로 저장할까요?\n이미 저장된 ${label}이 있으면 덮어씁니다.\n※ 회사 공통이라 우리 회사 모든 계정이 같이 씁니다.`);
        if (!ok) return;
        try {
            await ref.set({
                [which]: {
                    json: snapshotDefectSettings(),
                    savedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    savedBy: window.state.uid || ''
                }
            }, { merge: true });
            window.showToast(`${label}으로 저장했습니다.`, 'success', 2800);
        } catch (e) {
            console.warn('세팅 프리셋 저장 실패:', e);
            window.showToast('저장에 실패했습니다. 네트워크·권한을 확인해 주세요.', 'error', 4000);
        }
    }

    async function loadDefectSettingsPreset(which) {
        const label = DEFECT_SETTINGS_PRESET_LABEL[which];
        const ref = defectSettingsPresetRef();
        if (!label || !ref || navigator.onLine === false) {
            window.showToast('서버에 연결된 상태(회사 로그인)에서만 불러올 수 있습니다.', 'warning', 3500);
            return;
        }
        let saved = null;
        try {
            const snap = await ref.get();
            saved = snap.exists ? (snap.data() || {})[which] : null;
        } catch (e) {
            console.warn('세팅 프리셋 조회 실패:', e);
            window.showToast('불러오기에 실패했습니다. 네트워크·권한을 확인해 주세요.', 'error', 4000);
            return;
        }
        let data = null;
        try { data = saved && saved.json ? JSON.parse(saved.json) : null; } catch (_) { data = null; }
        if (!data || typeof data !== 'object') {
            window.showToast(`저장된 ${label}이 없습니다. 먼저 「현재 → ${label} 저장」을 눌러 주세요.`, 'warning', 4500);
            return;
        }
        const ok = await window.appConfirm(`세팅을 초기화하고 「${label}」으로 바꿀까요?\n(지금 세팅은 사라집니다)\n※ 회사 공통이라 우리 회사 모든 계정에 적용됩니다.`);
        if (!ok) return;

        applyBuiltInDefectPinDefaults(); // 먼저 초기화
        DEFECT_SETTINGS_PRESET_KEYS.forEach((k) => { if (data[k] !== undefined) window.state[k] = data[k]; });
        migrateDefectComponentStateShape();
        saveStateToLocalStorage();
        _lastSyncedUserDefectPinJson = '';
        scheduleSyncUserDefectPinPresets();

        const cat = document.getElementById('defectCategory')?.value || '구조체';
        populateDefectComponentDropdown(cat, '');
        const component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        ) || '';
        const presetList = getDefectTypePresetFor(cat, component) || categoryDefectPreset[cat] || [];
        const defType = presetList.find(t => !(typeof isGoodDefectType === 'function' ? isGoodDefectType(t) : t === '상태양호')) || presetList[0] || '';
        updateDefectTypeDropdown(cat, defType);
        if (defType) updateDefectCauseDropdown(defType, getDefaultFirstCauseFor(defType));
        renderOptionManagerList();
        const ctx = getOptionManagerContext();
        if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
        if (typeof refreshDefectQuickPickBar === 'function') refreshDefectQuickPickBar();
        window.showToast(`${label}으로 바꿨습니다.`, 'success', 2800);
    }
    window.saveDefectSettingsPreset = saveDefectSettingsPreset;
    window.loadDefectSettingsPreset = loadDefectSettingsPreset;

    window.openOptionManagerModal = function(fieldType) {
        window._optionManagerField = fieldType;
        window._optionManagerCauseKey = null;
        const modal = document.getElementById('optionManagerModal');
        const input = document.getElementById('optionManagerNewInput');
        if (input) input.value = '';
        renderOptionManagerList();
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('open');
        }
    };

    function closeOptionManagerModal() {
        const modal = document.getElementById('optionManagerModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
    }

