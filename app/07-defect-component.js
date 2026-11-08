// @@app-part 07-defect-component.js — app.js의 일부(단독 실행 안 됨). 고친 뒤 `node scripts/app-parts.js join`
    // --- Dynamic Defect Component(부재 명칭) — 분류별 플랫 프리셋 ---
    // 2026-09-28 접합부는 거더/빔 구분이 필요 없음 — 큰보·작은보 → 보, 철골거더·철골빔 → 철골보
    // 2026-11-04 보(G)·보(B) 다시 넣음(사용자) — 통계 평가 표가 접합부 결함을 맞닿은 부재 줄(큰보·작은보·슬래브…)에 같이 세서
    //   보-슬래브 접합부가 큰보인지 작은보인지 알아야 한다. 그냥 '보'는 예전 자료·모를 때용으로 남긴다.
    const DEFECT_JOINT_LEFT = ['기둥', 'RC기둥', '철골기둥', 'SRC기둥', '보(G)', '보(B)', '보', '벽체', 'RC벽체', '내력벽', '슬래브', '기초'];
    const DEFECT_JOINT_RIGHT = ['보(G)', '보(B)', '보', '철골보', '기둥', '슬래브', '데크슬래브', '벽체', '조적벽체', '기초']; // 조적벽체(2026-10-14): 예) 기둥-조적벽체 접합부 — 부재 수에는 안 셈
    // 2026-11-03 기본 프리셋을 회사 엑셀(160건)에서 한 번이라도 쓰인 것만으로 정리 — 접합부 칩도 엑셀에 나온 두 가지만
    // (다른 접합부는 「접합부」 단추의 좌·우 선택으로 직접 만들 수 있다)
    const DEFECT_JOINT_COMPONENT_PRESET = [
        '기둥-보 접합부',
        '벽체-슬래브 접합부'
    ];
    // 2026-11-03 기본 프리셋 = 회사 엑셀(160건 보고서)에서 한 번이라도 쓰인 부재 명칭만. 엑셀에 한 번도 안 나온 이름은 기본 목록에서 뺐다
    // (예전에 그 이름으로 저장한 결함은 이름 그대로 보이고, 필요하면 ⚙에서 직접 추가할 수 있다).
    // 예외: 보(G)·보(B)·철골보(G)·철골보(B)는 사용자가 구조체 탭에서 그대로 쓰기로 해서 유지(엑셀엔 G/B 구분 없이 「보」로 적힘).
    // 그냥 '보'는 G/B를 몰라 목록에서 뺌(예전 이름·그냥 '보'로 저장된 결함은 새 이름으로 보이고, '보'는 지정 필요 표시).
    // 접합부 이름은 부재 칩에 늘어놓지 않는다 — 「접합부」 단추를 눌러 고르면 입력칸에 써지기만 한다(DEFECT_JOINT_COMPONENT_PRESET)
    // 2026-11-06 t575u: 맨몸 구조 부재(기둥·보·슬래브·RC벽체/내력벽/구조벽)는 구조체 칩만.
    // 2026-10-30 「공통 부재명을 비구조·마감에도」 결정은 사용자가 뒤집음. 조적벽체·벽체 타일·기둥 미장은 유지.
    // 그냥 「벽체」는 구조벽과 자동 동일시하지 않음. 저장 결함·커스텀은 지우지 않음(수정창에서 예전 이름 그대로 편집 가능).
    const DEFECT_COMPONENT_PRESET = {
        '구조체': ['기둥', '보(G)', '보(B)', '철골보(G)', '철골보(B)', '슬래브', '벽체', 'RC벽체', '계단', '옹벽', '기타'],
        // 비구조체: 엑셀에 많이 나온 순. 「벽체」는 조적벽체와 따로(구조벽으로 치지 않음).
        '비구조체': ['벽체', '조적벽체', '바닥', '파라펫', '부대시설', '벽체 접합부', '난간', '치장벽돌',
            '옹벽', '계단', '배수로', '바닥 포장', '기타'],
        // 마감재: 부재 칸에 「바탕 부재 + 마감」(벽체 타일·기둥 미장). 맨몸 기둥·보·슬래브는 두지 않음.
        '마감재': ['천장 마감재', '벽체 타일', '벽체', '바닥', '지붕 마감재', '타일 마감재', '기둥 미장', '기타']
    };
    const BARE_STRUCTURAL_MEMBER_CHIPS = [
        '기둥', 'RC기둥', '철골기둥', 'SRC기둥',
        '보', '보(G)', '보(B)', '철골보', '철골보(G)', '철골보(B)',
        '슬래브', '데크슬래브',
        'RC벽체', '내력벽', '구조벽'
    ];
    const _bareStructuralMemberChipSet = new Set(BARE_STRUCTURAL_MEMBER_CHIPS);
    function isBareStructuralMemberChipName(name) {
        const raw = String(name || '').trim();
        if (!raw) return false;
        if (_bareStructuralMemberChipSet.has(raw)) return true;
        return _bareStructuralMemberChipSet.has(raw.replace(/\s+/g, ''));
    }
    /** 분류별 기본 부재 칩. 비구조체·마감재에는 맨몸 구조 부재가 끼지 않게 한 번 더 걸러, 미선택은 구조체로 폴백하지 않음. */
    function getDefectComponentPresetForCategory(category) {
        const cat = String(category || '').trim();
        if (cat === '비구조체' || cat === '마감재') {
            return (DEFECT_COMPONENT_PRESET[cat] || []).filter((n) => !isBareStructuralMemberChipName(n));
        }
        if (cat === '구조체') return (DEFECT_COMPONENT_PRESET['구조체'] || []).slice();
        return [];
    }
    function finishMemberChooserApi() {
        return (typeof window !== 'undefined' && ((window.BSA && window.BSA.finishMemberChooser) || window.BsaFinishMemberChooser)) || null;
    }
    function isFinishMemberBaseName(name) {
        const api = finishMemberChooserApi();
        if (api && typeof api.isBase === 'function') return api.isBase(name);
        return ['기둥', '벽체', '보', '슬래브'].includes(String(name || '').trim());
    }
    function isFinishCombinedMemberName(name) {
        const api = finishMemberChooserApi();
        if (api && typeof api.isCombined === 'function') return api.isCombined(name);
        return /^(기둥|벽체|보|슬래브)\s+(타일|도장|마감재)$/.test(String(name || '').trim());
    }
    /** 비구조체·마감재 재사용 목록(커스텀/직접추가)에 맨몸 구조 부재를 넣지 않음. 이 결함 값·화면 표시는 그대로. */
    function shouldLearnDefectComponentForCategory(category, name) {
        const cat = String(category || '').trim();
        if (cat === '마감재' && isFinishMemberBaseName(name)) return false;
        if (cat !== '비구조체' && cat !== '마감재') return true;
        return !isBareStructuralMemberChipName(name);
    }

    // 2026-11-03 기본 결함 종류 = 엑셀에서 쓰인 것만(+ 입력칸용 「기타」·「상태양호」). 부재별 목록(getDefectTypePresetFor)에서 이 밖의 이름은 뺀다.
    // 이름이 엑셀 표기와 다른 변형(들뜸/변형↔변형/들뜸 등)은 둘 다 둔다.
    const DEFECT_TYPE_ALLOW = ['상태양호', '기타',
        '수직균열', '경사균열', '균열', '이격/파손', '수평균열', '들뜸/탈락', '들뜸/변형', '변형/들뜸', '백태', '들뜸',
        '누수 흔적', '누수흔적', '파손/결손', '파손/천공', '패널 변형/파손', '변색/오염', '오염/변색', '볼트 이완/파손', '파손', '오염',
        '이격/흔들림', '이격', '이격/개방불량', '철근노출', '박락', 'U자형균열', '망상균열', '누수', '박리/탈락', '뿜칠 박락',
        '줄눈 손상/탈락', '탈락', '처짐', '용접부 균열/불량', '도장열화', '프레임 변형/부식', '변형·기울음', '변형/좌굴', '부식', '부식/녹',
        '변형', '콘크리트 박락', '유리 파손·금', '물고임', '침하', '미장균열', '뿜칠 미시공', '배부름·전도 징후', '낙하·탈락 위험',
        '프레임 변형', '콘크리트 박리', '단면 손실', '개폐불량', '도장 박리', '중량물 적치'];
    // 예전 버전(카테고리 구분 없는 배열)으로 저장된 부재 명칭 커스텀/숨김 목록을 카테고리별 객체로 변환
    // ---- 2026-09-28 부재 명칭 정리 (큰보→보(G)·작은보→보(B)·철골거더→철골보(G)·철골빔→철골보(B), '상부' 삭제) ----
    // 저장된 결함은 일괄로 고쳐 쓰지 않는다. 화면·출력·수정창에 보여 줄 때만 memberNameOut()으로 새 이름.
    // 수정창에서 실제로 고쳐 저장하면 그 결함만 새 이름으로 저장된다(손대지 않으면 저장값 유지 — 폼 가드).
    function getMemberNameApi() {
        return (window.BSA && window.BSA.defectQuickPresets) || null;
    }

    function memberNameOut(v) {
        const q = getMemberNameApi();
        if (q && typeof q.normalizeMemberName === 'function') return q.normalizeMemberName(v);
        return v;
    }

    /** 거더(G)/빔(B)을 아직 안 정한 보면 ['보(G)','보(B)'] 같은 선택지, 아니면 null (접합부 등은 null) */
    function getAmbiguousMemberChoices(v) {
        const q = getMemberNameApi();
        if (!q || typeof q.getAmbiguousBeamChoices !== 'function') return null;
        return q.getAmbiguousBeamChoices(v);
    }

    function getMemberGbHintText(v) {
        const c = getAmbiguousMemberChoices(v);
        return c ? `${c.join('/')} 지정 필요` : '';
    }

    function memberGbClass(v) {
        return getAmbiguousMemberChoices(v) ? 'bsa-member-gb-needed' : '';
    }

    /** 상태조사표 입력칸 HTML에 툴팁(지정 필요)을 붙인다 */
    function withMemberGbHint(html, raw) {
        const hint = getMemberGbHintText(raw);
        if (!hint || typeof html !== 'string') return html;
        return html.replace(/^<(input|textarea) /, `<$1 title="${escapeSurveyAttr(hint)}" `);
    }

    /** 계정 부재 목록(직접 추가·숨김·순서·★·사용 횟수, 비파괴 부재)을 새 이름으로 — 여러 번 돌려도 같다 */
    function migrateLegacyMemberNamesInState() {
        const q = getMemberNameApi();
        const st = window.state;
        if (!q || typeof q.migrateMemberNameList !== 'function' || !st) return false;
        let changed = false;
        const migrateMap = (key, expand) => {
            const m = st[key];
            if (!m || typeof m !== 'object' || Array.isArray(m)) return;
            Object.keys(m).forEach((bucket) => {
                if (!Array.isArray(m[bucket])) return;
                const r = q.migrateMemberNameList(m[bucket], { expandPlainBeam: expand });
                if (r.changed) {
                    m[bucket] = r.list;
                    changed = true;
                }
            });
        };
        migrateMap('customDefectComponents', false);
        migrateMap('hiddenDefectComponents', false);
        // ★·순서에 있던 그냥 '보'는 같은 자리에 보(G)·보(B) 두 개로
        migrateMap('defectComponentOrder', true);
        migrateMap('favoriteDefectComponents', true);
        const usage = st.defectPickUsage && st.defectPickUsage.component;
        if (usage && typeof usage === 'object' && typeof q.migrateMemberUsageCounts === 'function') {
            Object.keys(usage).forEach((b) => {
                const r = q.migrateMemberUsageCounts(usage[b]);
                if (r.changed) {
                    usage[b] = r.counts;
                    changed = true;
                }
            });
        }
        if (Array.isArray(st.customNdtComponents)) {
            const r = q.migrateMemberNameList(st.customNdtComponents, {});
            if (r.changed) {
                st.customNdtComponents = r.list;
                changed = true;
            }
        }
        // 계정 동기화는 클라우드 설정을 받은 뒤(loadAndApplyUserDefectPinPresets)에만 — 받기 전에 올리면 새 설정을 덮는다
        if (changed) window._bsaMemberNamePresetsDirty = true;
        return changed;
    }

    /** 결함 수정창 부재 칸: 지정 필요 강조 + 바로 고르는 보(G)/보(B) 칩 */
    function renderMemberGbHint(component, onPick) {
        const input = document.getElementById('defectComponentInput');
        const bulk = (typeof isDefectBulkEditMode === 'function') && isDefectBulkEditMode();
        const choices = bulk ? null : getAmbiguousMemberChoices(component);
        if (input) {
            input.classList.toggle('bsa-member-gb-needed', !!choices);
            if (choices) {
                input.title = getMemberGbHintText(component);
                input.dataset.gbHint = '1';
            } else if (input.dataset.gbHint) {
                input.removeAttribute('title');
                delete input.dataset.gbHint;
            }
        }
        let hint = document.getElementById('defectMemberGbHint');
        if (!choices) {
            if (hint) hint.hidden = true;
            return;
        }
        if (!hint && input && input.parentNode) {
            hint = document.createElement('div');
            hint.id = 'defectMemberGbHint';
            hint.className = 'bsa-member-gb-hint';
            hint.setAttribute('role', 'note');
            input.insertAdjacentElement('afterend', hint);
        }
        if (!hint) return;
        hint.hidden = false;
        hint.innerHTML = '';
        const label = document.createElement('span');
        label.className = 'bsa-member-gb-hint-text';
        label.textContent = `${getMemberGbHintText(component)} — 거더(G)·빔(B) 중 고르세요`;
        hint.appendChild(label);
        choices.forEach((name) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'bsa-member-gb-chip';
            b.tabIndex = -1;
            b.textContent = name;
            b.title = `${name} ${/\(G\)$/.test(name) ? '거더' : '빔'}`;
            b.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onPick === 'function') onPick(name);
            });
            hint.appendChild(b);
        });
    }

    // ---- 도면: 지정 필요 보의 번호 네모칸 강조 + 그 위 「G」「B」 버튼 (화면 전용 — 보고서·출력 캔버스는 drawPinSafe라 안 그림) ----
    const MEMBER_GB_COLOR = '#c026d3';

    function drawMemberGbNeededMarkers(ctx, defects) {
        const entries = [];
        window._bsaMemberGbEntries = entries;
        if (!ctx || !Array.isArray(defects) || !defects.length) return entries;
        const dragging = (typeof activeDragPin !== 'undefined' && !!activeDragPin);
        const dpr = state.canvasDpr || 1;
        const seenGroups = new Set();
        defects.forEach((d) => {
            if (!d || d.surveyExtra) return;
            let members = [d];
            let rep = d;
            if (d.groupId) {
                if (seenGroups.has(d.groupId)) return;
                const gm = defects.filter((m) => m && m.groupId === d.groupId);
                if (gm.length > 1) {
                    seenGroups.add(d.groupId);
                    members = gm;
                    rep = pickDefectGroupRepresentative(gm) || d;
                }
            }
            const amb = members.filter((m) => m && !m.surveyExtra && getAmbiguousMemberChoices(m.component));
            if (!amb.length) return;
            const choices = getAmbiguousMemberChoices(amb[0].component);
            const ids = amb.filter((m) => {
                const c = getAmbiguousMemberChoices(m.component);
                return c && c[0] === choices[0];
            }).map((m) => m.id).filter(Boolean);
            const boxX = rep.x || 100;
            const boxY = rep.y || 100;
            const styleKey = getDefectStyleKey(rep.category, rep.defectType);
            const scale = getStyleSize(styleKey).pin;
            let dims;
            try {
                dims = measurePinBoxDimensions(ctx, formatDefectPinLabel(rep, styleKey), scale, 1.0);
            } catch (_e) {
                return;
            }
            const w = dims.w;
            const h = dims.h;
            ctx.save();
            ctx.translate(boxX, boxY);
            const rot = state.rotationAngle || 0;
            if (rot) ctx.rotate((-rot * Math.PI) / 180);
            // 2026-10-13 강조 테두리는 DOM 레인보우 링(syncMemberGbOverlay)으로 — 캔버스엔 드래그 중에만 가는 선
            if (dragging) {
                ctx.strokeStyle = MEMBER_GB_COLOR;
                ctx.lineWidth = Math.max(1, 1.2 * scale);
                ctx.strokeRect(-w / 2 - 3 * scale, -h / 2 - 3 * scale, w + 6 * scale, h + 6 * scale);
            }
            let m = null;
            try { m = ctx.getTransform(); } catch (_e) { m = null; }
            ctx.restore();
            if (!m || dragging || !ids.length) return;
            const zoom = Math.hypot(m.a, m.b) / dpr;
            entries.push({
                key: ids.join('|'),
                ids,
                choices,
                cx: m.e / dpr,
                cy: m.f / dpr,
                halfH: (h / 2 + 7 * scale) * zoom,
                ringW: (w + 6 * scale) * zoom,
                ringH: (h + 6 * scale) * zoom,
                angle: Math.atan2(m.b, m.a) * 180 / Math.PI
            });
        });
        return entries;
    }

    function getMemberGbOverlay() {
        const canvas = state.canvas || document.getElementById('planCanvas');
        const host = canvas && canvas.parentElement;
        if (!host) return null;
        let ov = document.getElementById('mapMemberGbOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'mapMemberGbOverlay';
            ov.className = 'map-member-gb-overlay';
            ov.setAttribute('aria-label', '보 거더/빔 지정');
            const stop = (e) => { e.stopPropagation(); };
            ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'contextmenu'].forEach((t) => {
                ov.addEventListener(t, (e) => {
                    if (e.target && e.target.closest && e.target.closest('.map-member-gb-pick')) stop(e);
                }, { passive: true });
            });
            ov.addEventListener('click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.map-member-gb-btn') : null;
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                const wrap = btn.closest('.map-member-gb-pick');
                const ids = String((wrap && wrap.dataset.ids) || '').split('|').filter(Boolean);
                applyMemberGbChoice(ids, btn.dataset.value || '');
            });
            host.appendChild(ov);
        } else if (ov.parentElement !== host) {
            host.appendChild(ov);
        }
        ov.style.left = `${canvas.offsetLeft}px`;
        ov.style.top = `${canvas.offsetTop}px`;
        ov.style.width = `${canvas.clientWidth}px`;
        ov.style.height = `${canvas.clientHeight}px`;
        return ov;
    }

    // ---- 도면 메모 (2026-10-12, js/core/drawing-memo.js) ----
    // 화면 전용 DOM 겹층(보고서 캡처·인쇄에 안 나옴). 출력은 「메모 출력」을 켰을 때만 drawMemosForReport로 그린다.
    const MEMO_SHOW_PREF_KEY = 'bsa_memo_show_v1';
    const MEMO_PRINT_PREF_KEY = 'bsa_memo_print_v1';
    function readMemoShowPref() {
        try { return localStorage.getItem(MEMO_SHOW_PREF_KEY) !== '0'; } catch (_e) { return true; }
    }
    function readMemoPrintPref() {
        try { return localStorage.getItem(MEMO_PRINT_PREF_KEY) === '1'; } catch (_e) { return false; }
    }
    function writeMemoPref(key, on) {
        try { localStorage.setItem(key, on ? '1' : '0'); } catch (_e) { /* 기기 저장 실패해도 화면은 바뀜 */ }
    }
    window.isDrawingMemoPrintOn = readMemoPrintPref;
    function memoApi() { return window.BSA && window.BSA.drawingMemo; }
    function currentMemoFloorKey() {
        return (state.currentBuildingId && state.currentFloor) ? `${state.currentBuildingId}_${state.currentFloor}` : '';
    }
    function memoImgToScreen(m) {
        const v = imgToViewCoords(m.x, m.y);
        return { sx: state.view.offsetX + v.x * state.view.scale, sy: state.view.offsetY + v.y * state.view.scale };
    }
    function memoScreenToImg(sx, sy) {
        const vx = (sx - state.view.offsetX) / state.view.scale;
        const vy = (sy - state.view.offsetY) / state.view.scale;
        return viewToImgCoords(vx, vy);
    }
    function commitMemoChange(floorKey) {
        if (floorKey && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        try { if (floorKey) markMemoAuthorPending(String(floorKey)); } catch (_e) { /* 계정별 저장 실패는 아래 재시도 */ }
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        syncDrawingMemoOverlay();
    }
    // ---- 2026-10-23 계정별 메모 서버 저장(js/core/memo-author-sync.js) ----
    // 원인: 메모는 층 묶음(전체 동기화)에만 실려, 그 기기 동기화가 멈추거나(멈춘 올리기·읽기 실패·다른 층 오류) 앱을 닫으면
    // 메모가 기기에만 남았다(경신여고 태블릿). 이제 메모를 바꾸면 그 계정 문서(floors/MEMOS_BY_uid)에 따로 곧바로 올리고,
    // 실패하면 다시 시도하며, 앱을 열거나 다시 온라인이 되면 기기에 남은 내 메모를 올린다. 서버 메모는 지우지 않는다.
    const MEMO_PENDING_LS = 'bsa_memo_author_pending_v1';
    const MEMO_ROUND_CODE = 'ROUND_SKETCH_MEMO';
    function memoAuthorApi() { return window.BSA && window.BSA.memoAuthorSync; }
    function memoPendingRead() {
        try { return new Set(JSON.parse(localStorage.getItem(MEMO_PENDING_LS) || '[]')); } catch (_e) { return new Set(); }
    }
    function memoPendingWrite(set) {
        try { localStorage.setItem(MEMO_PENDING_LS, JSON.stringify(Array.from(set))); } catch (_e) { /* ignore */ }
        renderMemoPendingBadge();
    }
    function bldgIdForMemoKey(floorKey) {
        const b = (typeof findBuildingForFloorKey === 'function') ? findBuildingForFloorKey(floorKey) : null;
        return b ? b.id : '';
    }
    function markMemoAuthorPending(floorKeyOrBldgId) {
        const id = bldgIdForMemoKey(floorKeyOrBldgId) || ((window.state.buildings || []).some((b) => b && b.id === floorKeyOrBldgId) ? floorKeyOrBldgId : '');
        if (!id) return;
        const set = memoPendingRead();
        set.add(id);
        memoPendingWrite(set);
        scheduleMemoAuthorPush(1500);
    }
    let _memoPushTimer = null;
    let _memoPushBusy = false;
    let _memoPushBusySince = 0;
    let _memoRetryN = 0;
    /** 2026-10-27 서버 응답이 안 오는 통신(반쯤 끊긴 와이파이)에서 get/set이 끝나지 않으면 「올리는 중」 표시가 영영 안 풀려 손글씨·주석 메모가 다시는 안 올라갔다 → 한 건물당 시간 제한 */
    function memoWithTimeout(promise, ms, label) {
        let t = null;
        return Promise.race([
            promise,
            new Promise((_, rej) => { t = setTimeout(() => rej(new Error('memo-author: 시간 초과 ' + label)), ms); })
        ]).finally(() => { if (t) clearTimeout(t); });
    }
    function scheduleMemoAuthorPush(ms) {
        if (_memoPushTimer) clearTimeout(_memoPushTimer);
        _memoPushTimer = setTimeout(() => { _memoPushTimer = null; flushMemoAuthorPush(); }, Math.max(0, ms || 0));
    }
    function applyMemoAuthorPayload(bldg, payload) {
        const api = memoAuthorApi();
        if (!api || !payload) return;
        const P = api.toPacks(payload, bldg.id, MEMO_ROUND_CODE, Object.keys(window.state.drawingMemos || {}));
        const mergeFn = window.BSA.syncMerge.mergeNdtDataMaps;
        if (window.BSA.drawingMemo) Object.keys(P.memoPacks).forEach((k) => window.BSA.drawingMemo.mergePackIntoState(window.state, k, P.memoPacks[k], mergeFn));
        if (window.BSA.sketchMemo && (P.sketchPack.items.length || P.sketchPack.deletedIds.length)) {
            window.BSA.sketchMemo.mergePackIntoState(window.state, P.sketchKey, P.sketchPack, mergeFn);
        }
    }
    async function pushMemosForBuilding(bldg) {
        const api = memoAuthorApi();
        const me = sketchMe();
        if (!api || !me.uid) throw new Error('memo-author: 로그인 계정 없음');
        const ref = getFloorScopeRef(bldg, api.docIdFor(me.uid));
        if (!ref) throw new Error('memo-author: 경로 없음');
        const snap = await ref.get({ source: 'server' });
        let serverP = null;
        if (snap.exists) { try { serverP = JSON.parse((snap.data() || {}).payload || 'null'); } catch (_e) { serverP = null; } }
        const local = api.collectMine(window.state, bldg.id, me, MEMO_ROUND_CODE);
        const merged = api.mergeDocs(serverP, local, api.collectTombs(window.state, bldg.id));
        // 서버에도 없고 기기에도 없으면 빈 문서를 만들지 않는다
        if (!snap.exists && !api.countItems(merged) && !Object.keys(merged.deleted).length) return 0;
        const json = JSON.stringify(merged);
        if (json.length > 950000) throw new Error('memo-author: 메모가 너무 큼(' + json.length + ')');
        await ref.set({
            kind: api.KIND, byUid: me.uid, by: me.name || '', buildingId: bldg.id,
            itemCount: api.countItems(merged), payload: json,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        applyMemoAuthorPayload(bldg, merged);
        return api.countItems(merged);
    }
    // ---- 2026-10-27 손글씨 메모 번호표(서버 floors/MEMOS_SEQ · 건물마다 한 문서) ----
    // 「먼저 동기화한 것이 1번, 나중 것은 2번…」: 번호는 서버에서 트랜잭션으로 한 번만 주고(같은 번호 두 장 없음), 이 기기에도 보관해
    // 오프라인에서도 같은 번호로 보인다. 번호표에 없는 메모는 번호 있는 것 뒤에 「번호 미확정」으로 이어 붙는다. 스케치 id·내용은 건드리지 않는다.
    const SKETCH_SEQ_LS = 'bsa_sketch_seq_v1';
    let _sketchSeqStore = null;
    function sketchSeqStore() {
        if (!_sketchSeqStore) {
            try { _sketchSeqStore = JSON.parse(localStorage.getItem(SKETCH_SEQ_LS) || '{}') || {}; } catch (_e) { _sketchSeqStore = {}; }
        }
        // 손글씨 모듈(번호 순 정렬)이 이 번호표를 기본으로 쓴다 → 창·한글 출력이 같은 번호
        try { if (window.BSA && window.BSA.sketchMemo) window.BSA.sketchMemo.seqStore = _sketchSeqStore; } catch (_e) { /* ignore */ }
        return _sketchSeqStore;
    }
    function sketchSeqAttach(st) {
        if (st && typeof st === 'object' && st.sketchSeq !== sketchSeqStore()) st.sketchSeq = sketchSeqStore();
        return st;
    }
    function sketchSeqApply(bldgId, map) {
        const api = memoAuthorApi();
        if (!api || !bldgId || !map) return;
        const store = sketchSeqStore();
        store[bldgId] = api.mergeSeq(store[bldgId], map);
        try { localStorage.setItem(SKETCH_SEQ_LS, JSON.stringify(store)); } catch (_e) { /* ignore */ }
    }
    /** 번호 없는 손글씨 메모에 번호를 준다(트랜잭션). 올릴 것이 남은 건물·오프라인이면 건너뜀. 반환: 새로 번호가 붙은 장 수 */
    async function ensureSketchSeq(bldg) {
        const api = memoAuthorApi();
        if (!api || !bldg || !bldg.id || !db || !window.state.companyId || typeof db.runTransaction !== 'function') return 0;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
        if (memoPendingRead().has(bldg.id)) return 0;   // 내 메모가 아직 서버에 안 올라갔으면 올린 뒤에 번호를 준다(먼저 올라간 순서)
        const items = api.sketchItems(window.state, bldg.id, MEMO_ROUND_CODE);
        const known = sketchSeqStore()[bldg.id] || {};
        if (!items.length || items.every((it) => known[it.id])) return 0;
        const ref = getFloorScopeRef(bldg, api.SEQ_DOC);
        if (!ref) return 0;
        let result = null;
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const serverMap = snap.exists ? api.parseSeqDoc(snap.data()) : {};
            const r = api.assignSeq(serverMap, items);
            if (r.added) {
                tx.set(ref, {
                    kind: api.SEQ_KIND, buildingId: bldg.id, itemCount: Object.keys(r.map).length,
                    payload: api.seqDocPayload(r.map), updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            result = r;
        });
        if (result) sketchSeqApply(bldg.id, result.map);
        return result ? result.added : 0;
    }
    window.bsaEnsureSketchSeq = ensureSketchSeq;
    /** 이 건물 모든 계정의 메모 문서를 읽어 합친다(읽기만) */
    async function pullMemosForBuilding(bldg) {
        const api = memoAuthorApi();
        if (!api || !db || !window.state.companyId || !bldg) return 0;
        const ref = getFloorScopeRef(bldg, api.docIdFor('x'));
        if (!ref) return 0;
        const qs = await ref.parent.where('kind', 'in', [api.KIND, api.SEQ_KIND]).get({ source: 'server' });
        let n = 0;
        qs.forEach((d) => {
            const x = d.data() || {};
            if (x.buildingId && x.buildingId !== bldg.id) return;
            if (x.kind === api.SEQ_KIND) { try { sketchSeqApply(bldg.id, api.parseSeqDoc(x)); n++; } catch (_e) { /* 번호표 오류는 건너뜀 */ } return; }
            try { applyMemoAuthorPayload(bldg, JSON.parse(x.payload || 'null')); n++; } catch (_e) { /* 한 계정 문서 오류는 건너뜀 */ }
        });
        if (n) {
            if (typeof saveStateToLocalStorage === 'function') { _suppressSyncOnSave = true; saveStateToLocalStorage(); _suppressSyncOnSave = false; }
            syncDrawingMemoOverlay();
        }
        return n;
    }
    window.bsaPullMemosForBuilding = pullMemosForBuilding;
    async function flushMemoAuthorPush() {
        if (_memoPushBusy) {
            if (_memoPushBusySince && Date.now() - _memoPushBusySince > 120000) { _memoPushBusy = false; } // 2분 넘게 안 끝난 올리기는 멈춘 것으로 보고 새로 시작
            else { scheduleMemoAuthorPush(2000); return; }
        }
        if (!db || !window.state.companyId || (typeof navigator !== 'undefined' && navigator.onLine === false)) { renderMemoPendingBadge(); return; }
        const set = memoPendingRead();
        if (!set.size) { _memoRetryN = 0; return; }
        _memoPushBusy = true;
        _memoPushBusySince = Date.now();
        let failed = 0;
        try {
            for (const id of Array.from(set)) {
                const bldg = (window.state.buildings || []).find((b) => b && b.id === id);
                if (!bldg) { set.delete(id); continue; }
                try {
                    await memoWithTimeout(pushMemosForBuilding(bldg), 45000, bldg.id);
                    set.delete(id);
                    // 올라간 뒤 번호표(올라온 순서 번호) — 실패해도 메모 저장은 끝난 것: 번호는 다음 올리기·메모 창 열기 때 다시 시도
                    try { memoPendingWrite(set); await memoWithTimeout(ensureSketchSeq(bldg), 45000, 'seq ' + bldg.id); } catch (e) { console.warn('[메모] 번호표 갱신 실패 — 나중에 다시:', id, e && e.message); }
                } catch (e) {
                    failed++;
                    console.warn('[메모] 서버 저장 실패 — 다시 시도합니다:', id, e && e.message);
                }
            }
        } finally {
            _memoPushBusy = false;
            memoPendingWrite(set);
        }
        if (failed) {
            const waits = [5000, 30000, 120000, 300000];
            scheduleMemoAuthorPush(waits[Math.min(_memoRetryN++, waits.length - 1)]);
        } else {
            _memoRetryN = 0;
        }
    }
    window.bsaFlushMemos = flushMemoAuthorPush;
    function renderMemoPendingBadge() {
        let el = document.getElementById('memoPendingBadge');
        const n = memoPendingRead().size;
        if (!n) { if (el) el.style.display = 'none'; return; }
        if (!el) {
            el = document.createElement('div');
            el.id = 'memoPendingBadge';
            el.className = 'bsp-clickable';
            el.style.cssText = 'position:fixed;left:8px;bottom:calc(var(--bsa-float-stack2, 0px) + 8px + env(safe-area-inset-bottom, 0px));z-index:9998;background:#7c2d12;color:#fff;font-size:12px;padding:4px 9px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;';
            el.title = '눌러서 지금 다시 올리기';
            el.addEventListener('click', () => { _memoRetryN = 0; flushMemoAuthorPush(); });
            document.body.appendChild(el);
        }
        el.textContent = `메모 서버 저장 대기 ${n}곳${navigator.onLine === false ? ' (오프라인)' : ''}`;
        el.style.display = '';
    }
    /** 기기에 남은 내 메모가 있는 건물을 모두 「올릴 것」으로(태블릿에 멈춰 있던 메모 올리기) */
    function queueAllMyLocalMemos() {
        const api = memoAuthorApi();
        const me = sketchMe();
        if (!api || !me.uid) return 0;
        const set = memoPendingRead();
        (window.state.buildings || []).forEach((b) => {
            if (!b || !b.id) return;
            if (api.countItems(api.collectMine(window.state, b.id, me, MEMO_ROUND_CODE))) set.add(b.id);
        });
        memoPendingWrite(set);
        if (set.size) scheduleMemoAuthorPush(800);
        return set.size;
    }
    /**
     * 2026-10-27 기기에 남은 내 주석·손글씨 메모를 모두 「올릴 것」으로 잡고 바로 올린다.
     * 오프라인에서 쓴 메모가 「올릴 것」 표시 없이 남은 경우(표시 저장 실패·계정 확인 전 작성 등)도 건지고,
     * 일반 올리기(온라인 복귀·앱 시작·멈춘 올리기 풀기·「지금 다시 올리기」)와 같은 시점에 함께 돈다.
     */
    function queueAndFlushMyMemos(reason) {
        try {
            _memoRetryN = 0;
            const n = queueAllMyLocalMemos();
            if (!n) { renderMemoPendingBadge(); return 0; }
            scheduleMemoAuthorPush(500);
            return n;
        } catch (e) { console.warn('[메모] 올릴 것 잡기 실패:', reason, e && e.message); return 0; }
    }
    window.bsaQueueAndFlushMemos = queueAndFlushMyMemos;
    let _memoLastPulledBldg = '';
    (function bindMemoAuthorSync() {
        if (typeof window.addEventListener !== 'function' || typeof document.addEventListener !== 'function' || typeof setInterval !== 'function') return;
        window.addEventListener('online', () => { _memoRetryN = 0; queueAndFlushMyMemos('online'); scheduleMemoAuthorPush(1000); renderMemoPendingBadge(); });
        window.addEventListener('offline', renderMemoPendingBadge);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { if (memoPendingRead().size) flushMemoAuthorPush(); }
            else scheduleMemoAuthorPush(500);
        });
        window.addEventListener('pagehide', () => { if (memoPendingRead().size) flushMemoAuthorPush(); });
        let started = false;
        sketchSeqStore();   // 저장된 번호표를 손글씨 모듈에 연결(오프라인에서도 같은 번호)
        setInterval(() => {
            if (!db || !window.state.companyId || navigator.onLine === false) return;
            const me = sketchMe();
            if (!me.uid) return;
            if (!started) { started = true; queueAllMyLocalMemos(); }
            const bid = window.state.currentBuildingId;
            if (bid && bid !== _memoLastPulledBldg) {
                const bldg = (window.state.buildings || []).find((b) => b && b.id === bid);
                if (bldg) {
                    _memoLastPulledBldg = bid;
                    pullMemosForBuilding(bldg).catch((e) => { _memoLastPulledBldg = ''; console.warn('[메모] 계정별 메모 받기 실패:', e && e.message); });
                }
            }
        }, 4000);
        setTimeout(renderMemoPendingBadge, 1500);
    })();

    /** 2026-10-20 손글씨 메모 계정: { uid, name } — 메모는 계정별 */
    function sketchMe() {
        let uid = '';
        try {
            const u = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) || null;
            uid = (u && u.uid) || '';
        } catch (_e) { uid = ''; }
        return { uid: String(uid || window.state.userUid || ''), name: memoAuthorName() };
    }
    /** 2026-10-20 손글씨 메모는 회차 자리(층 아님) — 이 회차 건물의 예약 층키 */
    function sketchKeyFor(_id) {
        const api = sketchApi();
        const b = sketchUi.bldgId || state.currentBuildingId;
        return api ? api.roundKeyFor(b) : '';
    }
    /** 옛 층별 메모 → 회차 자리 복사(원본 유지). 바뀌면 회차 자리를 올릴 것으로 표시 */
    function migrateSketchMemosForBuilding(bldgId) {
        const api = sketchApi();
        if (!api || !bldgId) return 0;
        const n = api.migrateFloorMemosToRound(window.state, bldgId);
        if (n) commitMemoChange(api.roundKeyFor(bldgId));
        return n;
    }
    /** 서버의 회차 메모 묶음을 받아 합친다(층 묶음과 같은 길·같은 병합). 오프라인·로그인 전이면 조용히 건너뜀 */
    /**
     * 2026-10-27 회차 묶음 + 모든 계정 메모 문서 + 번호표를 받는다(메모 창 열 때·한글 출력 전·백업 전 같은 곳에서 불림).
     * 다른 기기·계정이 올린 메모가 보이고, 번호 없는 메모에는 번호를 준다. 15초 안 재호출은 계정별 문서를 다시 읽지 않는다(읽기 폭주 방지).
     */
    async function pullRoundSketchMemos(bldg) {
        let ok = await pullRoundSketchBundle(bldg);
        try {
            if (bldg && bldg.id && db && window.state.companyId && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
                if (Date.now() - (window.__bsaSketchPullAt || 0) > 15000 || window.__bsaSketchPullBldg !== bldg.id) {
                    window.__bsaSketchPullAt = Date.now(); window.__bsaSketchPullBldg = bldg.id;
                    if (await pullMemosForBuilding(bldg)) ok = true;
                }
                if (await ensureSketchSeq(bldg)) ok = true;
            }
        } catch (e) { console.warn('[메모] 서버 메모·번호표 받기 실패(기기 것으로 계속):', e && e.message); }
        return ok;
    }
    async function pullRoundSketchBundle(bldg) {
        const api = sketchApi();
        if (!api || !bldg || !bldg.id || !db || !window.state.companyId) return false;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
        const rk = api.roundKeyFor(bldg.id);
        try {
            const bundle = await readFloorBundleStrict(bldg, api.ROUND_CODE);
            if (!bundle || !bundle.sketches) return false;
            api.mergePackIntoState(window.state, rk, bundle.sketches, window.BSA.syncMerge.mergeNdtDataMaps);
            ['defects', 'ndtData', 'ndtDisplacementGroups'].forEach((m) => {
                const map = window.state[m];
                if (map && Array.isArray(map[rk]) && !map[rk].length) delete map[rk];
            });
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            return true;
        } catch (e) {
            console.warn('회차 손글씨 메모 받기 실패(기기 것으로 계속):', e);
            return false;
        }
    }
    function memoAuthorName() {
        try {
            const u = (typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser) || null;
            return (window.state.userName || (u && (u.displayName || u.email)) || '').toString().slice(0, 40);
        } catch (_e) { return ''; }
    }

    async function createDrawingMemoAt(imgX, imgY) {
        const api = memoApi();
        const floorKey = currentMemoFloorKey();
        if (!api || !floorKey || !state.bgImage) return null;
        const text = await promptDrawingMemoText();
        if (text == null || !api.cleanText(text)) return null;
        const memo = api.createMemo({ x: imgX, y: imgY, text, by: memoAuthorName(), byUid: (sketchMe().uid || '') });
        if (!memo) return null;
        api.addMemo(window.state, floorKey, memo);
        if (!readMemoShowPref()) setMemoShow(true);
        commitMemoChange(floorKey);
        return memo;
    }
    window.createDrawingMemoAt = createDrawingMemoAt;

    /**
     * 2026-10-16 「줄바꿈 해서 저장하면 두줄 세줄로」: 새 주석 입력도 여러 줄(Enter = 줄바꿈, Ctrl+Enter = 저장).
     * 예전 appPrompt는 한 줄 입력칸이라 줄을 바꿀 수 없었다. 저장 형식(text 문자열, \n 포함)은 그대로.
     */
    /**
     * 2026-10-16 폰·태블릿: 키보드가 올라오면 주석 창을 「보이는 화면(visualViewport)」 안으로 줄여
     * 입력칸·저장 버튼이 키보드에 가리지 않게. 끝나면 리스너 해제.
     */
    function bindMemoDialogToVisualViewport(ov) {
        const vv = window.visualViewport;
        if (!vv || !ov) return () => {};
        const fit = () => {
            ov.style.inset = 'auto';
            ov.style.left = `${Math.round(vv.offsetLeft)}px`;
            ov.style.top = `${Math.round(vv.offsetTop)}px`;
            ov.style.width = `${Math.round(vv.width)}px`;
            ov.style.height = `${Math.round(vv.height)}px`;
        };
        fit();
        vv.addEventListener('resize', fit);
        vv.addEventListener('scroll', fit);
        return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
    }

    function promptDrawingMemoText(initial) {
        return new Promise((resolve) => {
            const old = document.getElementById('drawingMemoNewOverlay');
            if (old) old.remove();
            const ov = document.createElement('div');
            ov.id = 'drawingMemoNewOverlay';
            ov.className = 'drawing-memo-view-overlay';
            ov.setAttribute('style', 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:12px;');
            ov.innerHTML = `
                <div role="dialog" aria-modal="true" aria-label="도면 주석" class="dm-card" style="background:#fff;color:#111827;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.3);width:min(560px,100%);max-height:calc(100% - 24px);display:flex;flex-direction:column;overflow:hidden;">
                    <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e7eb;">
                        <strong style="flex:1;font-size:1.05rem;">📝 도면 주석</strong>
                        <button type="button" data-mn="cancel" aria-label="닫기" style="border:none;background:none;font-size:1.4rem;line-height:1;cursor:pointer;color:#6b7280;">&times;</button>
                    </div>
                    <div style="padding:12px 14px;flex:1;overflow:auto;">
                        <div style="font-size:0.85rem;color:#6b7280;margin-bottom:6px;">도면에 남길 주석을 적어 주세요. 줄을 바꾸면 도면에도 여러 줄로 보입니다. (결함이 아니며 조사표·번호에 들어가지 않습니다)</div>
                        <textarea data-mn-text rows="5" maxlength="300" placeholder="예) 천장 점검구 열림&#10;다음에 다시 확인" style="width:100%;box-sizing:border-box;font-size:1.2rem;line-height:1.5;padding:10px;border:1px solid #cbd5e1;border-radius:10px;resize:vertical;min-height:7em;font-family:inherit;"></textarea>
                    </div>
                    <div class="dm-foot" style="display:flex;gap:8px;justify-content:flex-end;padding:10px 14px;border-top:1px solid #e5e7eb;">
                        <button type="button" class="btn btn-outline btn-sm" data-mn="cancel">취소</button>
                        <button type="button" class="btn btn-primary btn-sm" data-mn="ok">저장</button>
                    </div>
                </div>`;
            document.body.appendChild(ov);
            const ta = ov.querySelector('[data-mn-text]');
            ta.value = initial ? String(initial) : '';
            const unbindVv = bindMemoDialogToVisualViewport(ov);
            let done = false;
            const finish = (v) => {
                if (done) return;
                done = true;
                unbindVv();
                document.removeEventListener('keydown', onKey, true);
                ov.remove();
                resolve(v);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); finish(ta.value); }
            };
            document.addEventListener('keydown', onKey, true);
            ov.addEventListener('click', (e) => {
                if (e.target === ov) { finish(null); return; }
                const b = e.target.closest && e.target.closest('[data-mn]');
                if (!b) return;
                finish(b.dataset.mn === 'ok' ? ta.value : null);
            });
            requestAnimationFrame(() => { try { ta.focus(); } catch (_e) { /* ignore */ } });
        });
    }
    window.promptDrawingMemoText = promptDrawingMemoText;

    /**
     * 2026-10-16 「메모는 볼 수도 있고 수정도 가능하게」: 도면 메모를 누르면 보기 겸 고치기 창 하나.
     * 큰 글씨 여러 줄 입력칸(줄바꿈 유지 — 예전 한 줄 입력칸은 줄바꿈이 사라졌다) + 저장·지우기·닫기.
     * 저장은 updateMemo(updatedAt 늘 앞으로) → commitMemoChange(층 묶음 dirty·저장·동기화) — 예전과 같은 길.
     */
    function openDrawingMemoMenu(memoId) {
        const api = memoApi();
        const floorKey = currentMemoFloorKey();
        const memo = api && api.listFor(window.state, floorKey).find((m) => m.id === memoId);
        if (!memo) return Promise.resolve(false);
        const old = document.getElementById('drawingMemoViewOverlay');
        if (old) old.remove();
        const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const when = memo.updatedAt ? new Date(Number(memo.updatedAt)).toLocaleString('ko-KR', { hour12: false }) : '';
        const ov = document.createElement('div');
        ov.id = 'drawingMemoViewOverlay';
        ov.className = 'drawing-memo-view-overlay';
        ov.setAttribute('style', 'position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;padding:12px;');
        ov.innerHTML = `
            <div class="drawing-memo-view-card" role="dialog" aria-modal="true" aria-label="도면 주석 보기·고치기"
                class="dm-card" style="background:#fff;color:#111827;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.3);width:min(560px,100%);max-height:calc(100% - 24px);display:flex;flex-direction:column;overflow:hidden;">
                <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e7eb;">
                    <strong style="font-size:1.05rem;">📝 도면 주석</strong>
                    <span style="flex:1;color:#6b7280;font-size:0.8rem;">${esc(when)}</span>
                    <button type="button" data-mv="del" aria-label="주석 지우기" title="주석 지우기" style="border:1px solid #fca5a5;background:#fff;color:#dc2626;border-radius:8px;padding:4px 8px;cursor:pointer;"><i class="fa-solid fa-trash"></i> 지우기</button>
                    <button type="button" data-mv="close" aria-label="닫기" style="border:none;background:none;font-size:1.4rem;line-height:1;cursor:pointer;color:#6b7280;">&times;</button>
                </div>
                <div style="padding:12px 14px;flex:1;overflow:auto;">
                    <textarea data-mv-text maxlength="${api.MAX_TEXT || 300}" rows="6"
                        style="width:100%;box-sizing:border-box;font-size:1.2rem;line-height:1.5;padding:10px;border:1px solid #cbd5e1;border-radius:10px;resize:vertical;min-height:9em;font-family:inherit;">${esc(memo.text)}</textarea>
                    <div style="color:#6b7280;font-size:0.78rem;margin-top:4px;">고친 뒤 「저장」 · 다른 기기에도 반영됩니다</div>
                </div>
                <div class="dm-foot" style="display:flex;gap:8px;padding:10px 14px;border-top:1px solid #e5e7eb;">
                    <span data-mv-delmsg style="flex:1;color:#dc2626;font-size:0.85rem;align-self:center;"></span>
                    <button type="button" class="btn btn-outline btn-sm" data-mv="close">닫기</button>
                    <button type="button" class="btn btn-primary btn-sm" data-mv="save">저장</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        const ta = ov.querySelector('[data-mv-text]');
        const unbindVv = bindMemoDialogToVisualViewport(ov);
        return new Promise((resolve) => {
            let done = false;
            const finish = (r) => {
                if (done) return;
                done = true;
                unbindVv();
                document.removeEventListener('keydown', onKey, true);
                ov.remove();
                resolve(r);
            };
            const save = () => {
                const text = ta.value;
                if (!api.cleanText(text)) {
                    window.showToast?.('빈 주석은 저장하지 않습니다. 지우려면 「지우기」를 누르세요.', 'info', 2500);
                    return;
                }
                if (api.updateMemo(window.state, floorKey, memoId, { text })) {
                    commitMemoChange(floorKey);
                    window.showToast?.('주석을 저장했습니다', 'success', 1500);
                }
                finish('saved');
            };
            // 2026-10-16 「주석은 지우는 기능이 사라짐」: 지우기를 맨 위(✕ 옆)로 — 폰에서 입력칸에 키보드가 올라오면
            // 아래 줄 버튼이 키보드에 가려 눌리지 않았다. 확인은 창 안에서(두 번 누르기) — 창 위에 창을 또 띄우지 않음.
            let delArmedUntil = 0;
            const del = () => {
                const btns = ov.querySelectorAll('[data-mv="del"]');
                const msg = ov.querySelector('[data-mv-delmsg]');
                if (Date.now() > delArmedUntil) {
                    delArmedUntil = Date.now() + 5000;
                    btns.forEach((b) => { b.style.background = '#dc2626'; b.style.color = '#fff'; b.innerHTML = '<i class="fa-solid fa-trash"></i> 한 번 더 누르면 지움'; });
                    if (msg) msg.textContent = '다른 기기에서도 지워집니다';
                    return;
                }
                if (api.deleteMemo(window.state, floorKey, memoId)) {
                    commitMemoChange(floorKey);
                    window.showToast?.('주석을 지웠습니다', 'info', 1500);
                }
                finish('deleted');
            };
            const onKey = (e) => {
                if (!document.body.contains(ov)) return;
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); save(); }
            };
            document.addEventListener('keydown', onKey, true);
            ov.addEventListener('click', (e) => {
                if (e.target === ov) { finish(null); return; }
                const b = e.target.closest('[data-mv]');
                if (!b) return;
                if (b.dataset.mv === 'close') finish(null);
                else if (b.dataset.mv === 'save') save();
                else if (b.dataset.mv === 'del') del();
            });
            // 도면 쪽으로 손가락·마우스가 새지 않게
            ['pointerdown', 'mousedown', 'touchstart', 'wheel'].forEach((t) => ov.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
            // 폰·태블릿은 자동 포커스 안 함(키보드가 창을 가림) — 입력칸을 누르면 그때 키보드
            const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
            if (!coarse) requestAnimationFrame(() => { try { ta.focus(); } catch (_e) { /* ignore */ } });
        });
    }
    window.openDrawingMemoMenu = openDrawingMemoMenu;

    function getDrawingMemoOverlay() {
        const canvas = state.canvas || document.getElementById('planCanvas');
        const host = canvas && canvas.parentElement;
        if (!host) return null;
        let ov = document.getElementById('mapMemoOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'mapMemoOverlay';
            ov.className = 'map-memo-overlay';
            ov.setAttribute('aria-label', '도면 주석');
            ensureMemoPointerTracking();
            bindDrawingMemoOverlayEvents(ov);
            host.appendChild(ov);
        } else if (ov.parentElement !== host) {
            host.appendChild(ov);
        }
        ov.style.left = `${canvas.offsetLeft}px`;
        ov.style.top = `${canvas.offsetTop}px`;
        ov.style.width = `${canvas.clientWidth}px`;
        ov.style.height = `${canvas.clientHeight}px`;
        return ov;
    }

    let memoChipDrag = null; // { id, pointerId, x0, y0, downAt, moved, sx, sy, multi }
    const memoActivePointers = new Set();
    // 화면 어디든 손가락 수를 센다(두 번째 손가락이 도면에 닿아도 메모 끌기를 멈추게) — 겹층을 처음 만들 때 한 번 건다
    let memoPointerTrackingOn = false;
    function ensureMemoPointerTracking() {
        if (memoPointerTrackingOn) return;
        memoPointerTrackingOn = true;
        window.addEventListener('pointerdown', (e) => {
            memoActivePointers.add(e.pointerId);
            if (memoActivePointers.size > 1 && memoChipDrag && !memoChipDrag.multi) {
                memoChipDrag.multi = true;
                syncDrawingMemoOverlay();
            }
        }, true);
        ['pointerup', 'pointercancel'].forEach((t) => window.addEventListener(t, (e) => {
            setTimeout(() => memoActivePointers.delete(e.pointerId), 0);
        }, true));
    }
    function selectedMarkingClaimsClient(clientX, clientY) {
        try {
            if (!elements.planCanvas || typeof selectedDefectIds === 'undefined' || !selectedDefectIds.size) return false;
            const r = elements.planCanvas.getBoundingClientRect();
            const sx = clientX - r.left, sy = clientY - r.top;
            const img = memoScreenToImg(sx, sy);
            return !!claimSelectedPinPart(img.x, img.y, getCurrentFloorMapPlacedDefects());
        } catch (_e) { return false; }
    }
    function bindDrawingMemoOverlayEvents(ov) {
        ov.addEventListener('pointerdown', (e) => {
            const chip = e.target && e.target.closest ? e.target.closest('.map-memo-chip') : null;
            if (memoActivePointers.size > 1) {   // 두 손가락 — 메모 끌기·누르기 취소
                if (memoChipDrag) { memoChipDrag.multi = true; syncDrawingMemoOverlay(); }
                return;
            }
            if (!chip) return;
            // 2026-10-20 고른 마킹 바로 근처면 메모가 가로채지 않고 마킹을 잡는다(PC 마우스)
            if (e.pointerType === 'mouse' && e.button === 0 && state.mode !== 'MEMO' && selectedMarkingClaimsClient(e.clientX, e.clientY)) {
                handleDragStart(e.clientX, e.clientY, false, false, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const st = memoImgToScreen(memoApi().listFor(window.state, currentMemoFloorKey()).find((m) => m.id === chip.dataset.id) || { x: 0, y: 0 });
            memoChipDrag = { id: chip.dataset.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, downAt: Date.now(), moved: 0, sx: st.sx, sy: st.sy, multi: false };
            try { chip.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
        });
        ov.addEventListener('pointermove', (e) => {
            const d = memoChipDrag;
            if (!d || d.pointerId !== e.pointerId || d.multi) return;
            e.preventDefault();
            d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
            if (d.moved < TOUCH_TAP_MAX_MOVE_PX) return;
            const chip = ov.querySelector(`.map-memo-chip[data-id="${CSS.escape(d.id)}"]`);
            if (chip) {
                chip.classList.add('is-dragging');
                chip.style.transform = `translate(${Math.round(d.sx + e.clientX - d.x0)}px, ${Math.round(d.sy + e.clientY - d.y0)}px)`;
            }
        });
        const end = (e, cancelled) => {
            const d = memoChipDrag;
            if (!d || d.pointerId !== e.pointerId) return;
            memoChipDrag = null;
            e.stopPropagation();
            if (cancelled || d.multi) { syncDrawingMemoOverlay(); return; }
            const floorKey = currentMemoFloorKey();
            if (d.moved >= TOUCH_TAP_MAX_MOVE_PX) {
                const p = memoScreenToImg(d.sx + e.clientX - d.x0, d.sy + e.clientY - d.y0);
                if (memoApi().updateMemo(window.state, floorKey, d.id, { x: p.x, y: p.y })) commitMemoChange(floorKey);
                else syncDrawingMemoOverlay();
                return;
            }
            if (isCleanTouchTap({ downAt: d.downAt, maxMove: d.moved, multi: false }, Date.now())) {
                openDrawingMemoMenu(d.id);
            }
        };
        ov.addEventListener('pointerup', (e) => end(e, false));
        ov.addEventListener('pointercancel', (e) => end(e, true));
        ['mousedown', 'touchstart', 'click', 'dblclick'].forEach((t) => {
            ov.addEventListener(t, (e) => {
                if (e.target && e.target.closest && e.target.closest('.map-memo-chip')) e.stopPropagation();
            }, t === 'touchstart' ? { passive: true } : false);
        });
    }

    /**
     * 2026-10-14 메모 글자 = 마킹 번호 네모박스 글자와 같은 크기·글꼴(도면 좌표 기준).
     * 예전엔 화면 rem 고정이라 확대·축소(드래그)할 때 도면과 따로 놀았다.
     */
    const DRAWING_MEMO_FONT_FAMILY = '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';
    function getDrawingMemoFontSizeImg() {
        const sz = getStyleSize('defectStructural');
        return getPinBoxFontSize((sz && sz.pin) || 1);
    }
    function getDrawingMemoTextColor() {
        return getStyleColor('drawingMemo') || '#000000';
    }
    function drawingMemoOutlineWidth(fontPx) {
        return Math.max(1.1, Math.min(2.8, fontPx * 0.2));   // drawOutlinedPinText와 같은 식
    }

    function syncDrawingMemoOverlay() {
        const api = memoApi();
        const floorKey = currentMemoFloorKey();
        const list = (api && floorKey && state.bgImage && readMemoShowPref()) ? api.listFor(window.state, floorKey) : [];
        let ov = document.getElementById('mapMemoOverlay');
        if (!list.length) {
            if (ov) ov.replaceChildren();
            return;
        }
        ov = getDrawingMemoOverlay();
        if (!ov) return;
        const vw = ov.clientWidth || 0;
        const vh = ov.clientHeight || 0;
        const viewScale = (state.view && state.view.scale) || 1;
        const memoFontPx = Math.max(1, getDrawingMemoFontSizeImg() * viewScale);
        const memoOutlinePx = Math.max(0.5, drawingMemoOutlineWidth(getDrawingMemoFontSizeImg()) * viewScale / 2);
        const memoColor = getDrawingMemoTextColor();
        const o = Math.round(memoOutlinePx * 10) / 10;
        const memoShadow = [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, -o], [o, -o], [-o, o]]
            .map(([dx, dy]) => `${dx}px ${dy}px 0 #ffffff`).join(', ');
        const existing = new Map();
        Array.from(ov.children).forEach((el) => existing.set(el.dataset.id, el));
        const keep = new Set();
        list.forEach((m) => {
            const p = memoImgToScreen(m);
            if (p.sx < -200 || p.sy < -80 || (vw && p.sx > vw + 40) || (vh && p.sy > vh + 40)) return;
            let el = existing.get(m.id);
            if (!el) {
                el = document.createElement('div');
                el.className = 'map-memo-chip';
                el.dataset.id = m.id;
                el.setAttribute('role', 'button');
                ov.appendChild(el);
            }
            // 2026-10-16 「...으로 자르지 말고 다 보여주라」: 전체 내용, 저장된 줄바꿈 그대로(CSS white-space: pre)
            // 2026-10-27 「주석작성에 작성자 이름 박히는거 빼라」: 주석에는 작성자 이름을 보이지 않는다(by/byUid는 계정별 저장·동기화용으로만 보관)
            if (el.dataset.text !== m.text || el.dataset.by !== '') {
                el.dataset.text = m.text;
                el.dataset.by = '';
                el.textContent = String(m.text || '').replace(/\r\n?/g, '\n');
                el.title = m.text;
                el.setAttribute('aria-label', `도면 주석: ${m.text}`);
            }
            el.style.fontSize = `${memoFontPx.toFixed(2)}px`;
            el.style.color = memoColor;
            el.style.textShadow = memoShadow;
            keep.add(m.id);
            if (memoChipDrag && memoChipDrag.id === m.id && !memoChipDrag.multi) return;   // 끄는 중엔 손가락을 따라감
            el.classList.remove('is-dragging');
            el.style.transform = `translate(${Math.round(p.sx)}px, ${Math.round(p.sy)}px)`;
        });
        existing.forEach((el, id) => { if (!keep.has(id)) el.remove(); });
    }
    window.syncDrawingMemoOverlay = syncDrawingMemoOverlay;

    const DRAWING_MEMO_LINE_HEIGHT = 1.15;
    /** 주석 글자를 줄 단위로(자르지 않음). 저장 형식은 \n 포함 문자열 그대로 */
    function drawingMemoLines(text) {
        return String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    }
    window.drawingMemoLines = drawingMemoLines;

    /** 한글·PDF 위치도: 「메모 출력」을 켰을 때만. ctx는 도면 원본 픽셀 좌표계 */
    function drawMemosForReport(ctx, buildingId, floorCode, imgW, imgH) {
        if (!readMemoPrintPref()) return 0;
        const api = memoApi();
        if (!api || !ctx || !buildingId || !floorCode) return 0;
        const list = api.listFor(window.state, `${buildingId}_${floorCode}`);
        if (!list.length) return 0;
        // 마킹 번호 글자와 같은 크기·글꼴·흰 외곽선, 배경 없음. 색은 스타일 설정 「도면 메모 글자」
        const fs = getDrawingMemoFontSizeImg();
        const color = getDrawingMemoTextColor();
        ctx.save();
        // 2026-10-16 자르지 않고 전체, 줄바꿈은 여러 줄(줄 간격 = 글자 크기 × 1.15, 화면 CSS line-height와 같음)
        list.forEach((m) => {
            String(m.text == null ? '' : m.text).replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
                if (!line) return;
                drawOutlinedPinText(ctx, line, m.x, m.y + i * fs * 1.15, color, `bold ${fs}px ${DRAWING_MEMO_FONT_FAMILY}`, '#ffffff',
                    { textAlign: 'left', textBaseline: 'top' });
            });
        });
        ctx.restore();
        return list.length;
    }
    window.drawMemosForReport = drawMemosForReport;

    function setMemoShow(on) {
        writeMemoPref(MEMO_SHOW_PREF_KEY, !!on);
        document.querySelectorAll('[data-memo-show]').forEach((el) => { el.checked = !!on; });
        syncDrawingMemoOverlay();
    }
    function setMemoPrint(on) {
        writeMemoPref(MEMO_PRINT_PREF_KEY, !!on);
        document.querySelectorAll('[data-memo-print]').forEach((el) => { el.checked = !!on; });
    }
    function syncDrawingMemoBar() {
        const bar = document.getElementById('drawingMemoBar');
        if (!bar) return;
        bar.hidden = state.mode !== 'MEMO';
        document.querySelectorAll('[data-memo-show]').forEach((el) => { el.checked = readMemoShowPref(); });
        document.querySelectorAll('[data-memo-print]').forEach((el) => { el.checked = readMemoPrintPref(); });
    }

    // ---- 2026-10-16 손글씨 메모(흰 종이 팝업, js/core/sketch-memo.js) ----
    // 폰·태블릿: 오른쪽 메모 버튼 → 이 팝업(「텍스트 메모」로 예전 도면 메모 모드 전환). PC·메모 막대: 「✍ 손글씨」 버튼.
    function sketchApi() { return window.BSA && window.BSA.sketchMemo; }
    /** 손글씨 메모의 도면 자리(원본 픽셀). 옛 장(자리 없음)은 도면 왼쪽 위부터 차례로 */
    function sketchMemoPoint(id) {
        const api = sketchApi();
        const floorKey = currentMemoFloorKey();
        if (!api || !floorKey) return null;
        const rec = api.listFor(window.state, floorKey).find((r) => r.id === id);
        if (!rec) return null;
        const img = state.bgImage;
        return api.placedPoint(window.state, floorKey, rec, img ? (img.naturalWidth || img.width) : 1200, img ? (img.naturalHeight || img.height) : 800);
    }

    const sketchUi = { el: null, canvas: null, ctx: null, layer: null, lctx: null, sheet: null, strokes: [], redo: [], undo: [],
        tool: 'pen', color: '#111827', width: 3, penSeen: false, drawing: null, floorKey: '', dirty: false, scale: 1 };
    window._bsaSketchUi = sketchUi;

    function sketchBuildDom() {
        if (sketchUi.el) return sketchUi.el;
        const api = sketchApi();
        const el = document.createElement('div');
        el.id = 'sketchMemoOverlay';
        el.className = 'sketch-memo-overlay';
        el.hidden = true;
        const colors = (api ? api.COLORS : ['#111827']).map((c, i) =>
            `<button type="button" class="sk-color${i === 0 ? ' active' : ''}" data-sk-color="${c}" style="background:${c}" aria-label="색 ${i + 1}"></button>`).join('');
        el.innerHTML = `
            <div class="sk-card" role="dialog" aria-label="손글씨 메모">
                <div class="sk-head">
                    <strong>✍ 손글씨 메모</strong>
                    <span class="sk-count" data-sk-count></span>
                    <span class="sk-spacer"></span>
                    <button type="button" class="sk-btn sk-new" data-sk="new" title="새 메모 만들기">＋ 새 메모</button>
                    <button type="button" class="sk-btn" data-sk="close" title="닫기(저장)">✕</button>
                </div>
                <div class="sk-tabs" data-sk-tabs role="tablist" aria-label="내 손글씨 메모"></div>
                <div class="sk-tools">
                    <button type="button" class="sk-btn sk-tool active" data-sk-tool="pen" title="펜"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="sk-btn sk-tool" data-sk-tool="eraser" title="지우개"><i class="fa-solid fa-eraser"></i></button>
                    ${colors}
                    <input type="range" min="1" max="20" value="3" data-sk-width aria-label="굵기">
                    <button type="button" class="sk-btn" data-sk="undo" title="되돌리기"><i class="fa-solid fa-rotate-left"></i></button>
                    <button type="button" class="sk-btn" data-sk="redo" title="다시실행"><i class="fa-solid fa-rotate-right"></i></button>
                    <button type="button" class="sk-btn" data-sk="clear" title="전체 지우기">전체 지우기</button>
                    <span class="sk-spacer"></span>
                    <button type="button" class="sk-btn primary" data-sk="save">저장</button>
                </div>
                <div class="sk-paper-wrap"><canvas class="sk-paper" data-sk-canvas></canvas></div>
                <div class="sk-hint" data-sk-hint>펜이 닿으면 그때부터 펜으로만 그립니다(손바닥 무시)</div>
            </div>`;
        document.body.appendChild(el);
        sketchUi.el = el;
        sketchUi.canvas = el.querySelector('[data-sk-canvas]');
        sketchUi.ctx = sketchUi.canvas.getContext('2d');
        sketchUi.layer = document.createElement('canvas');
        sketchUi.lctx = sketchUi.layer.getContext('2d');
        el.addEventListener('click', (e) => {
            const b = e.target.closest('[data-sk],[data-sk-tool],[data-sk-color],[data-sk-tab]');
            if (!b) return;
            // 2026-10-19 메모 탭 — 고른 메모 열기(지금 장은 저장)
            if (b.dataset.skTab !== undefined) {
                const id = b.dataset.skTab;
                if (sketchUi.sheet && id === (sketchUi.sheet.id || '')) return;
                sketchSave(false);
                const rec = id ? sketchApi().findInBuilding(window.state, sketchUi.bldgId, id) : null;
                sketchOpenSheet(rec || null);
                return;
            }
            if (b.dataset.skTool) { sketchUi.tool = b.dataset.skTool; el.querySelectorAll('.sk-tool').forEach((x) => x.classList.toggle('active', x === b)); return; }
            if (b.dataset.skColor) { sketchUi.color = b.dataset.skColor; sketchUi.tool = 'pen';
                el.querySelectorAll('.sk-color').forEach((x) => x.classList.toggle('active', x === b));
                el.querySelectorAll('.sk-tool').forEach((x) => x.classList.toggle('active', x.dataset.skTool === 'pen')); return; }
            const a = b.dataset.sk;
            if (a === 'close') void sketchClose();
            else if (a === 'save') sketchSave(true);
            else if (a === 'undo') sketchUndo();
            else if (a === 'redo') sketchRedo();
            else if (a === 'clear') {
                const base = sketchUi.baseCount || 0;   // 열었을 때 있던 획(남의 것 포함)은 안 지움
                if (sketchUi.strokes.length > base) { sketchUi.undo.push(sketchUi.strokes.slice()); sketchUi.redo = []; sketchUi.strokes = sketchUi.strokes.slice(0, base); sketchUi.dirty = true; sketchRedraw(); }
            }
            else if (a === 'new') { sketchSave(false); sketchOpenSheet(null); }
        });
        el.querySelector('[data-sk-width]').addEventListener('input', (e) => { sketchUi.width = Number(e.target.value) || 3; });
        const cv = sketchUi.canvas;
        cv.addEventListener('pointerdown', sketchPointerDown);
        cv.addEventListener('pointermove', sketchPointerMove);
        cv.addEventListener('pointerup', sketchPointerUp);
        cv.addEventListener('pointercancel', sketchPointerUp);
        // 그리는 동안 스크롤·확대·길게 눌러 메뉴 막기
        ['touchstart', 'touchmove', 'gesturestart'].forEach((t) => cv.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
        cv.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('resize', () => { if (!el.hidden) sketchLayout(); });
        window.addEventListener('keydown', (e) => {
            if (el.hidden) return;
            const k = String(e.key || '').toLowerCase();
            if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) sketchRedo(); else sketchUndo(); }
            else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); e.stopPropagation(); sketchRedo(); }
            else if (k === 'escape') { e.preventDefault(); e.stopPropagation(); void sketchClose(); }
        }, true);
        return el;
    }

    /** 종이(w×h)를 화면 칸에 비율 유지로 맞춘다(고해상도: devicePixelRatio) */
    function sketchLayout() {
        const wrap = sketchUi.el.querySelector('.sk-paper-wrap');
        const sh = sketchUi.sheet;
        if (!wrap || !sh) return;
        const r = wrap.getBoundingClientRect();
        const s = Math.max(0.05, Math.min((r.width - 4) / sh.w, (r.height - 4) / sh.h));
        const cssW = Math.floor(sh.w * s);
        const cssH = Math.floor(sh.h * s);
        const dpr = Math.min(3, window.devicePixelRatio || 1);
        const cv = sketchUi.canvas;
        cv.style.width = cssW + 'px';
        cv.style.height = cssH + 'px';
        cv.width = Math.max(1, Math.round(cssW * dpr));
        cv.height = Math.max(1, Math.round(cssH * dpr));
        sketchUi.layer.width = cv.width;
        sketchUi.layer.height = cv.height;
        sketchUi.scale = cv.width / sh.w;   // 종이 좌표 → 캔버스 픽셀
        sketchRedraw();
    }

    function sketchRedraw() {
        const api = sketchApi();
        const { ctx, lctx, layer, canvas } = sketchUi;
        if (!api || !ctx) return;
        lctx.clearRect(0, 0, layer.width, layer.height);
        sketchUi.strokes.forEach((s) => api.drawStroke(lctx, s, sketchUi.scale));
        if (sketchUi.drawing) api.drawStroke(lctx, sketchUi.drawing, sketchUi.scale);
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
    }

    function sketchPaperPoint(e) {
        const r = sketchUi.canvas.getBoundingClientRect();
        const sh = sketchUi.sheet;
        const x = (e.clientX - r.left) / Math.max(1, r.width) * sh.w;
        const y = (e.clientY - r.top) / Math.max(1, r.height) * sh.h;
        const pr = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;
        return [Math.round(x), Math.round(y), Math.round(pr * 100)];
    }

    function sketchPointerDown(e) {
        if (sketchUi.readOnly) return;
        if (e.pointerType === 'pen') sketchUi.penSeen = true;
        // 펜이 한 번이라도 닿았으면 손가락·손바닥은 무시(오입력 방지)
        if (sketchUi.penSeen && e.pointerType === 'touch') return;
        if (sketchUi.drawing) return;
        e.preventDefault();
        try { sketchUi.canvas.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
        // 펜 옆 버튼·펜 뒤 지우개(buttons 32)도 지우개
        const eraser = sketchUi.tool === 'eraser' || (e.buttons & 32) === 32 || e.button === 5;
        sketchUi.drawing = { c: sketchUi.color, w: sketchUi.width, e: eraser ? 1 : 0, p: sketchPaperPoint(e), _pid: e.pointerId,
            i: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) };
        sketchRedraw();
    }
    function sketchPointerMove(e) {
        const d = sketchUi.drawing;
        if (!d || e.pointerId !== d._pid) return;
        e.preventDefault();
        const evs = (typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
        evs.forEach((ev) => {
            const pt = sketchPaperPoint(ev);
            const n = d.p.length;
            if (Math.abs(pt[0] - d.p[n - 3]) + Math.abs(pt[1] - d.p[n - 2]) < 1) return;
            d.p.push(pt[0], pt[1], pt[2]);
        });
        sketchRedraw();
    }
    function sketchPointerUp(e) {
        const d = sketchUi.drawing;
        if (!d || e.pointerId !== d._pid) return;
        delete d._pid;
        sketchUi.drawing = null;
        sketchUi.undo.push(sketchUi.strokes.slice());
        sketchUi.redo = [];
        sketchUi.strokes = sketchUi.strokes.concat([d]);
        if (sketchUi.sessionKeys && typeof sketchApi === 'function' && sketchApi()) sketchUi.sessionKeys.add(sketchApi().strokeKey(d));
        sketchUi.dirty = true;
        sketchRedraw();
    }
    function sketchUndo() {
        if (!sketchUi.undo.length) return;
        sketchUi.redo.push(sketchUi.strokes);
        sketchUi.strokes = sketchUi.undo.pop();
        sketchUi.dirty = true;
        sketchRedraw();
    }
    function sketchRedo() {
        if (!sketchUi.redo.length) return;
        sketchUi.undo.push(sketchUi.strokes);
        sketchUi.strokes = sketchUi.redo.pop();
        sketchUi.dirty = true;
        sketchRedraw();
    }

    /** 2026-10-19 창 위 메모 탭 — 이 층 모든 메모(모든 작성자)를 만든 순서로. 지금 보는 장은 강조 */
    function sketchFillSheetSelect() {
        const api = sketchApi();
        const box = sketchUi.el && sketchUi.el.querySelector('[data-sk-tabs]');
        if (!api || !box) return;
        const me = sketchMe();
        const esc = (t) => String(t).replace(/[<>&"]/g, '');
        const curId = (sketchUi.sheet && sketchUi.sheet.id) || '';
        // 2026-10-20 층 구분 없이 건물 전체 · 내 계정 메모(+ 작성자 모르는 이전 메모)
        sketchSeqAttach(window.state);
        const tabs = api.buildingTabs(window.state, sketchUi.bldgId, me);
        const html = tabs.map((t) => `<button type="button" role="tab" class="sk-tab${t.id === curId ? ' active' : ''}${t.mine ? ' mine' : ''}" data-sk-tab="${esc(t.id)}" aria-selected="${t.id === curId}" title="${esc((t.by || '작성자 없음') + (t.title ? ' · ' + t.title : ''))}">`
            + `<span class="sk-tab-name">${esc(t.label)}</span>${t.title ? `<span class="sk-tab-sub">${esc(t.title)}</span>` : (t.provisional ? '<span class="sk-tab-sub">번호 미확정</span>' : '')}</button>`);
        if (!curId || !tabs.some((t) => t.id === curId)) {
            html.push(`<button type="button" role="tab" class="sk-tab sk-tab-new active" data-sk-tab="" aria-selected="true"><span class="sk-tab-name">새 ${esc(api.nextMineLabel(window.state, sketchUi.bldgId, me))}</span><span class="sk-tab-sub">작성 중</span></button>`);
        }
        box.innerHTML = html.join('');
        const cnt = sketchUi.el.querySelector('[data-sk-count]');
        if (cnt) cnt.textContent = tabs.length ? `메모 ${tabs.length}개${tabs.some((t) => !t.mine) ? ` (내 것 ${tabs.filter((t) => t.mine).length})` : ''}` : '';
        const act = box.querySelector('.sk-tab.active');
        if (act && typeof act.scrollIntoView === 'function') {
            try { act.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_e) { /* ignore */ }
        }
    }

    /** 저장할 획 — 창의 획 + 창을 연 뒤 다른 기기·사람이 같은 메모에 더한 획(획 ID로 합침, 덮어쓰기 없음) */
    function sketchStrokesToSave() {
        const api = sketchApi();
        if (!api || typeof api.mergeEditorStrokes !== 'function' || !sketchUi.sheet || !sketchUi.sheet.id) return sketchUi.strokes;
        const cur = api.listFor(window.state, sketchUi.floorKey).find((r) => r.id === sketchUi.sheet.id);
        return api.mergeEditorStrokes(sketchUi.strokes, cur ? cur.strokes : [], sketchUi.sessionKeys);
    }

    function sketchOpenSheet(rec) {
        sketchUi.floorKey = sketchKeyFor(rec && rec.id);
        const wrap = sketchUi.el.querySelector('.sk-paper-wrap');
        const r = wrap ? wrap.getBoundingClientRect() : { width: 900, height: 1200 };
        // 새 장 종이 크기 = 지금 화면 칸 비율(가로·세로 그대로), 긴 변 1600 기준
        const ratio = (r.width > 10 && r.height > 10) ? r.width / r.height : 0.75;
        const w = ratio >= 1 ? 1600 : Math.round(1600 * ratio);
        const h = ratio >= 1 ? Math.round(1600 / ratio) : 1600;
        sketchUi.sheet = rec ? { id: rec.id, title: rec.title || '', w: rec.w, h: rec.h, createdAt: rec.createdAt, x: rec.x, y: rec.y }
            : { id: '', title: '', w, h, x: sketchUi.newAt ? sketchUi.newAt.x : undefined, y: sketchUi.newAt ? sketchUi.newAt.y : undefined };
        // 획 ID(i)를 지킨다 — 빠지면 같은 메모를 다시 저장할 때 획이 두 번 합쳐졌다(획 ID로 합치기)
        sketchUi.strokes = rec ? (rec.strokes || []).map((s) => Object.assign({ c: s.c, w: s.w, e: s.e, p: s.p.slice() }, s.i ? { i: s.i } : {})) : [];
        sketchUi.sessionKeys = new Set();
        sketchUi.undo = [];
        sketchUi.redo = [];
        sketchUi.dirty = false;
        // 2026-10-16 「골라서 볼 수 있고 작성도 가능」: 고른 메모(남의 것 포함)에 이어 쓰기. 지우는 건 이번에 쓴 획만
        // (전체 지우기·되돌리기는 열었을 때 있던 획까지 안 감) — 여러 사람 획은 병합에서 합집합(sketch-memo unionStrokes).
        sketchUi.readOnly = false;
        sketchUi.baseCount = sketchUi.strokes.length;
        const hint = sketchUi.el.querySelector('[data-sk-hint]');
        if (hint) hint.textContent = rec
            ? '이 메모에 이어 쓰기 · 이번에 쓴 획만 지울 수 있음 · 닫으면 저장'
            : '펜이 닿으면 그때부터 펜으로만 그립니다(손바닥 무시) · 닫으면 저장';
        sketchFillSheetSelect();
        sketchLayout();
    }

    /** 저장 — 텍스트 메모와 같은 길(층 묶음 dirty → 로컬 저장 → 동기화 예약). 빈 새 장은 저장 안 함 */
    function sketchSave(notify) {
        const api = sketchApi();
        if (!api || !sketchUi.sheet || !sketchUi.floorKey) return null;
        if (!sketchUi.dirty) { if (notify) window.showToast('바뀐 내용이 없습니다', 'info', 1500); return null; }
        if (!sketchUi.sheet.id && !sketchUi.strokes.length) return null;
        if (api.pointCount(sketchUi.strokes) > api.MAX_POINTS) {
            window.showToast('이 장은 너무 많이 그려 저장할 수 없습니다. 새 장에 이어서 그려 주세요.', 'warning', 6000);
            return null;
        }
        const rec = api.saveSheet(window.state, sketchUi.floorKey, {
            id: sketchUi.sheet.id, title: sketchUi.sheet.title, w: sketchUi.sheet.w, h: sketchUi.sheet.h,
            x: sketchUi.sheet.x, y: sketchUi.sheet.y,
            strokes: (typeof sketchStrokesToSave === 'function') ? sketchStrokesToSave() : sketchUi.strokes,
            // 작성자는 새 메모에만(이전 메모를 이어 써도 남의 것으로 바뀌지 않게)
            by: sketchUi.sheet.id ? '' : sketchMe().name, byUid: sketchUi.sheet.id ? '' : sketchMe().uid
        });
        if (!rec) return null;
        sketchUi.sheet.id = rec.id;
        sketchUi.dirty = false;
        commitMemoChange(sketchUi.floorKey);
        sketchFillSheetSelect();
        if (notify) window.showToast('손글씨 메모를 저장했습니다', 'success', 1800);
        return rec;
    }

    async function sketchDeleteSheet() {
        const api = sketchApi();
        if (!sketchUi.sheet) return;
        if (!sketchUi.sheet.id) { sketchOpenSheet(null); return; }
        const cur = api.findInBuilding(window.state, sketchUi.bldgId, sketchUi.sheet.id);
        if (cur && !api.canDelete(cur, sketchMe())) { window.showToast('다른 계정이 쓴 메모는 지울 수 없습니다(이어 쓰기만 가능)', 'warning', 3500); return; }
        const ok = await window.confirmDelete('이 손글씨 메모 장을 지울까요?');
        if (!ok) return;
        api.deleteSheet(window.state, sketchUi.floorKey, sketchUi.sheet.id);
        commitMemoChange(sketchUi.floorKey);
        sketchOpenSheet(api.pickInitialForBuilding(window.state, sketchUi.bldgId, sketchMe()));
    }

    async function sketchClose() {
        if (!sketchUi.el || sketchUi.el.hidden) return;
        if (sketchUi.dirty && (sketchUi.sheet.id || sketchUi.strokes.length)) sketchSave(false);   // 닫으면 자동 저장
        sketchUi.el.hidden = true;
        document.documentElement.classList.remove('bsa-sketch-open');
    }

    /** 이 층 손글씨 메모 열기(가장 최근 장, 없으면 새 장) */
    window.openSketchMemo = function(opts) {
        const api = sketchApi();
        const floorKey = currentMemoFloorKey();
        if (!api || !state.currentBuildingId) { window.showToast('건물을 먼저 고르세요', 'info', 2000); return false; }
        sketchBuildDom();
        sketchUi.bldgId = state.currentBuildingId;
        migrateSketchMemosForBuilding(sketchUi.bldgId);
        sketchUi.floorKey = sketchKeyFor('') || floorKey;
        // 다른 계정·기기가 이 회차에 쓴 메모를 받아 탭을 다시 그린다(창의 획은 그대로)
        const pullFor = sketchUi.bldgId;
        void pullRoundSketchMemos(state.currentBuilding).then((ok) => {
            if (ok && sketchUi.el && !sketchUi.el.hidden && sketchUi.bldgId === pullFor) sketchFillSheetSelect();
        });
        sketchUi.penSeen = false;
        sketchUi.el.hidden = false;
        document.documentElement.classList.add('bsa-sketch-open');
        const want = opts && opts.id ? api.findInBuilding(window.state, sketchUi.bldgId, opts.id) : null;
        sketchUi.newAt = (opts && opts.at) ? { x: Math.round(opts.at.x), y: Math.round(opts.at.y) } : null;
        // 2026-10-19 「기존에 작성한거 부터 보여줘야지 계속 새 손글씨 보이면 안됨」: 내가 마지막으로 고친 메모
        // (내 것이 없으면 이 층 최근 메모)부터 연다. 새 종이는 「＋ 새 메모」(또는 opts.fresh)로만.
        // 2026-10-20 건물 전체에서 내 계정이 마지막으로 고친 메모(없으면 새 종이)
        const first = want || ((opts && opts.fresh) ? null : api.pickInitialForBuilding(window.state, sketchUi.bldgId, sketchMe()));
        requestAnimationFrame(() => sketchOpenSheet(first || null));
        return true;
    };
    window.closeSketchMemo = sketchClose;

    // 2026-10-16 사용자 요청: 손글씨 메모는 도면 위 자리가 아니라 상단 「전경사진」 버튼 옆 「손글씨 메모」 버튼으로만 열고 관리.
    // 팝업 안 장 고르기(손글씨 메모-1, -2 …)로 다시 열어 고친다. 메모 막대 「손글씨로 추가」·도면 위 항목은 없앰.
    // 2026-10-16 사용자 지시 「도면에 찍어서 남기는 메모를 주석이라고 명칭을 바꾸고 손글씨 메모는 살려」:
    // 상단 「전경사진」 바로 오른쪽 「메모」 버튼 → 바로 새 흰 종이, ✕로 닫으면 저장. 작성자별 메모-1, 메모-2 …로 쌓임.
    // (도면에 찍는 글은 「주석」 — 저장 키 drawingMemos 등은 동기화 호환 때문에 그대로)
    (function bindSketchMemoButtons() {
        const b = document.getElementById('btnOpenSketchMemo');
        if (b) b.addEventListener('click', (e) => { e.preventDefault(); window.openSketchMemo({ latest: true }); });
    })();


    // 메모 모드: 도면 위 깨끗한 한 손가락 탭(또는 클릭)만 메모를 만든다. 끌면 도면 이동, 두 손가락이면 확대·축소.
    let memoTap = null;   // { clientX, clientY, downAt, maxMove, multi }
    function memoTapStart(clientX, clientY) {
        memoTap = { clientX, clientY, downAt: Date.now(), maxMove: 0, multi: false };
    }
    function memoTapMove(clientX, clientY) {
        if (!memoTap) return;
        memoTap.maxMove = Math.max(memoTap.maxMove, Math.hypot(clientX - memoTap.clientX, clientY - memoTap.clientY));
    }
    function memoTapEnd() {
        const tap = memoTap;
        memoTap = null;
        if (!tap || state.mode !== 'MEMO' || !state.bgImage) return false;
        if (!isCleanTouchTap(tap, Date.now())) return false;
        const rect = elements.planCanvas.getBoundingClientRect();
        const p = memoScreenToImg(tap.clientX - rect.left, tap.clientY - rect.top);
        createDrawingMemoAt(p.x, p.y);
        return true;
    }
    window.__bsaMemoTap = { start: memoTapStart, move: memoTapMove, end: memoTapEnd, cancel: () => { if (memoTap) memoTap.multi = true; } };

    /* ---------------- 구조 부재 레이어(2026-10-14) — 구조도에서 가져온 부재 기호, 화면 전용(출력 제외) ----------------
     * 부재 수 점·가이드와는 따로 둔 자료(pack.structMembers). 자료·합치기는 js/core/struct-members.js(늘 실림),
     * 화면(겹쳐 보기·옮기기·가져오기)은 js/tabs/struct-layer.js — 이 층에 부재가 있거나 단추를 눌렀을 때만 불러온다
     * (앱 시작과 평소 그리기를 무겁게 하지 않게). */
    let _structLayerLoading = null;
    function loadStructLayer() {
        if (window.BSA && window.BSA.structLayer) return Promise.resolve(window.BSA.structLayer);
        if (_structLayerLoading) return _structLayerLoading;
        _structLayerLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'js/tabs/struct-layer.js?v=' + encodeURIComponent(window.BSA_APP_VERSION || '');
            s.onload = () => resolve(window.BSA && window.BSA.structLayer);
            s.onerror = () => { _structLayerLoading = null; reject(new Error('구조 부재 화면을 불러오지 못했습니다.')); };
            document.head.appendChild(s);
        });
        return _structLayerLoading;
    }
    window.__bsaStructBridge = {
        imgToScreen: memoImgToScreen,
        screenToImg: memoScreenToImg,
        floorKey: currentMemoFloorKey,
        canvas: () => elements.planCanvas,
        hasDrawing: () => !!state.bgImage,
        // 도면 원본 크기(통심선을 도면 끝에서 끝까지 긋는 데 씀, 2026-10-17)
        imgSize: () => {
            const im = state.bgImage;
            return im ? { w: im.naturalWidth || im.width || 0, h: im.naturalHeight || im.height || 0 } : { w: 0, h: 0 };
        },
        onMapTab: () => state.currentTab !== 'tab-ndt',
        // 편집 중 손가락 이동·두 손가락 확대(2026-10-20) — 편집 막이 도면을 덮어 도면 쪽 터치 처리가 안 받으므로 여기서 직접 바꾼다
        getView: () => ({ scale: state.view.scale, ox: state.view.offsetX, oy: state.view.offsetY }),
        scaleLimits: () => getMapViewScaleLimits(),
        setView: (scale, ox, oy) => {
            state.view.scale = scale;
            state.view.offsetX = ox;
            state.view.offsetY = oy;
            if (elements.zoomScaleText) elements.zoomScaleText.textContent = formatMapZoomLabel();
            drawCanvas();
            if (typeof updateMapZoomOverlay === 'function') updateMapZoomOverlay();
            scheduleFloorDrawingTierSync();
            if (shouldUseViewportTilesForCurrentFloor()) scheduleViewportHiPatchSync();
        },
        viewDone: () => {
            flushViewportHiPatchSync();
            scheduleFloorDrawingTierSync();
        },
        placeBar: (bar, host) => { if (typeof placeMemberCountBar === 'function') placeMemberCountBar(bar, host); },
        commit: (floorKey) => {
            if (floorKey && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        },
        // 2026-11-04 다른 층에 복사: 이 건물 층 목록(낮은 층부터)·층 키, 복사 전에 받는 층을 서버 최신으로 받기
        floors: () => {
            const bldg = state.currentBuilding;
            let fl = bldg && typeof window.getBuildingAvailableFloors === 'function' ? window.getBuildingAvailableFloors(bldg) : [];
            if (typeof window.sortFloorsLowToHigh === 'function') fl = window.sortFloorsLowToHigh(fl);
            return (fl || []).filter((f) => f && f.floorCode).map((f) => ({ code: f.floorCode, label: f.floorLabel || f.floorCode }));
        },
        floorKeyOf: (code) => (state.currentBuildingId && code ? `${state.currentBuildingId}_${code}` : ''),
        refreshFloors: () => (typeof refreshBuildingFloorsFromServer === 'function' && state.currentBuilding
            ? refreshBuildingFloorsFromServer(state.currentBuilding, { force: true })
            : Promise.resolve({ ok: false, skipped: 'nobuilding', failed: [] })),
        /** 구조도 그림(PNG)을 이 건물 회차 폴더의 floorDrawings 에 올린다 → { downloadURL, storagePath } */
        uploadOverlay: async (blob) => {
            const SA = window.BSA && window.BSA.storageAssets;
            const companyId = typeof getCompanyDocId === 'function' ? getCompanyDocId() : null;
            if (!SA || !companyId) throw new Error('로그인한 회사 계정에서만 클라우드에 올릴 수 있습니다.');
            const bId = state.currentBuildingId, fc = state.currentFloor;
            const path = SA.companyScopedAssetPath(companyId, 'floorDrawings', `struct_${bId}_${fc}_${Date.now()}`, 'png', storageScopeForBuildingId(bId));
            return SA.uploadBlobToFirebaseStorage(path, blob, 'image/png');
        },
        deleteStoragePath: (path) => {
            const SA = window.BSA && window.BSA.storageAssets;
            if (SA && path) return SA.deleteFirebaseStoragePath(path).catch(() => {});
            return Promise.resolve();
        }
    };
    /** drawCanvas마다 불린다. 화면 코드가 아직 없으면, 이 층에 보여 줄 부재가 있을 때만 불러온다. */
    function syncStructLayer() {
        const layer = window.BSA && window.BSA.structLayer;
        if (layer) { layer.sync(); return; }
        const api = window.BSA && window.BSA.structMembers;
        const fk = currentMemoFloorKey();
        if (!api || !state.bgImage || !(api.hasAny(state, fk) || api.overlayFor(state, fk))) return;
        let show = true;
        try { show = localStorage.getItem('bsa_struct_layer_show') !== '0'; } catch (_e) { /* ignore */ }
        if (show) loadStructLayer().catch(() => { /* 다음 그리기 때 다시 */ });
    }
    (function bindStructLayerButton() {
        // PC 오른쪽 패널 단추 + 폰·태블릿 왼쪽 도구 줄 단추(2026-10-20 현장 편집)
        ['btnStructLayer', 'mobileBtnStructLayer'].forEach((id) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                loadStructLayer().then((layer) => { if (layer) layer.toggleBar(); })
                    .catch((err) => window.showToast?.(err.message, 'error', 3000));
            });
        });
    })();

    /* ---------------- 도면 가이드(2026-10-14) — 사각형·직선, 화면 전용(출력 제외) ----------------
     * 기둥·거더·빔 자리를 표시하려는 보조선. 결함 아님 — 한글·PDF·그림·엑셀 출력은 캔버스에서 그리므로
     * 이 SVG(DOM)는 들어가지 않는다. 층마다 저장·동기화(pack.guideShapes). */
    function gsApi() { return window.BSA && window.BSA.guideShapes; }
    /* 2026-10-14 가이드 종류(기둥·거더·빔)별 색 + 진하기. 색은 스타일 설정(styleColors.guideColumn/Girder/Beam),
     * 진하기는 styleColors.guideOpacity(0.15~1, 기본 0.55)에 함께 둔다 → 색과 똑같이 저장·층별·동기화된다. */
    const GUIDE_TYPE_STYLE_KEYS = { column: 'guideColumn', girder: 'guideGirder', beam: 'guideBeam' };
    const GUIDE_OPACITY_DEFAULT = 0.55;
    function clampGuideOpacity(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? Math.min(1, Math.max(0.15, Math.round(n * 100) / 100)) : GUIDE_OPACITY_DEFAULT;
    }
    function getGuideOpacity() {
        const raw = state.styleColors && state.styleColors.guideOpacity;
        return raw == null || raw === '' ? GUIDE_OPACITY_DEFAULT : clampGuideOpacity(raw);
    }
    function getGuideTypeColor(type) { return getStyleColor(GUIDE_TYPE_STYLE_KEYS[type] || 'guideColumn'); }
    function syncGuideOpacityUi() {
        const op = getGuideOpacity();
        const input = document.getElementById('styleGuideOpacity');
        const label = document.getElementById('styleGuideOpacityLabel');
        if (input) input.value = op;
        if (label) label.textContent = `${Math.round(op * 100)}%`;
    }
    const GS_TYPE_KEY = 'bsa_guide_type';
    function gsType() {
        let t = '';
        try { t = localStorage.getItem(GS_TYPE_KEY) || ''; } catch (_e) { /* ignore */ }
        return GUIDE_TYPE_STYLE_KEYS[t] ? t : '';
    }
    /** 새로 그릴 종류: 고른 종류가 없으면 사각형=기둥, 직선=빔 */
    function gsTypeForNew() { return gsType() || 'column'; }
    /** 종류 버튼: 고른 가이드가 있으면 그 가이드 종류를 바꾸고(되돌리기 가능), 다음에 그릴 종류로도 기억 */
    function setGsType(t) {
        if (!GUIDE_TYPE_STYLE_KEYS[t]) return;
        try { localStorage.setItem(GS_TYPE_KEY, t); } catch (_e) { /* ignore */ }
        const api = gsApi();
        const floorKey = currentMemoFloorKey();
        const d = api && gsSelectedId ? api.listFor(state, floorKey).find((x) => x.id === gsSelectedId) : null;
        if (d && api.typeOf(d) !== t) {
            gsPushUndo({ op: 'edit', floorKey, rec: Object.assign({}, d, { type: api.typeOf(d) }) });
            api.update(state, floorKey, d.id, { type: t });
            commitGuideChange(floorKey);
            return;
        }
        syncGuideBar();
    }
    const GS_KIND_KEY = 'bsa_guide_kind';
    const GS_SHOW_KEY = 'bsa_guide_show';
    let gsUndo = [];        // [{ op:'add'|'remove'|'edit', floorKey, rec(이전 상태) }]
    let gsSelectedId = '';
    let gsDrag = null;      // { mode:'new'|'move'|'h0'..'h3', id, start:{x,y}, orig, pointerId, moved }
    function gsKind() { let k = ''; try { k = localStorage.getItem(GS_KIND_KEY) || ''; } catch (_e) { /* ignore */ } return k === 'line' ? 'line' : 'circle'; }
    /** 2026-10-14 도형은 종류로 정한다: 기둥=원, 거더·빔=직선 (도형 고르기 단추 없앰) */
    function gsKindForType(t) { return t === 'column' ? 'circle' : 'line'; }
    function setGsKind(k) { try { localStorage.setItem(GS_KIND_KEY, k); } catch (_e) { /* ignore */ } syncGuideBar(); }
    function readGsShowPref() { try { return localStorage.getItem(GS_SHOW_KEY) !== '0'; } catch (_e) { return true; } }
    function setGsShow(on) { try { localStorage.setItem(GS_SHOW_KEY, on ? '1' : '0'); } catch (_e) { /* ignore */ } syncGuideOverlay(); syncGuideBar(); }
    function commitGuideChange(floorKey) {
        if (floorKey && typeof markFloorKeyDirty === 'function') markFloorKeyDirty(floorKey);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        if (typeof scheduleSyncToFirebase === 'function') scheduleSyncToFirebase();
        syncGuideOverlay();
        syncGuideBar();
    }
    function gsPushUndo(entry) { gsUndo.push(entry); if (gsUndo.length > 200) gsUndo = gsUndo.slice(-200); }
    function undoGuide() {
        const api = gsApi();
        const last = gsUndo.pop();
        if (!api || !last) { window.showToast('되돌릴 것이 없습니다.', 'info', 1600); return; }
        if (last.op === 'add') api.remove(state, last.floorKey, last.rec.id);
        else if (last.op === 'remove') api.add(state, last.floorKey, last.rec.kind, last.rec.x1, last.rec.y1, last.rec.x2, last.rec.y2, { id: last.rec.id, createdAt: last.rec.createdAt, type: last.rec.type });
        else if (last.op === 'edit') api.update(state, last.floorKey, last.rec.id, last.rec);
        if (gsSelectedId && !api.listFor(state, last.floorKey).some((d) => d.id === gsSelectedId)) gsSelectedId = '';
        commitGuideChange(last.floorKey);
    }
    window.undoGuide = undoGuide;
    function deleteSelectedGuide() {
        const api = gsApi();
        const floorKey = currentMemoFloorKey();
        if (!api || !gsSelectedId) return;
        const rec = api.remove(state, floorKey, gsSelectedId);
        gsSelectedId = '';
        if (rec) gsPushUndo({ op: 'remove', floorKey, rec });
        commitGuideChange(floorKey);
    }
    function gsVisible() {
        // 가이드는 2026-10-20 사용자 요청으로 끔(입구 버튼 삭제) — 기둥·보는 「구조 부재」 편집으로 그린다. 저장된 가이드 자료는 지우지 않고 화면에만 안 그림.
        return !!(state.mode === 'GUIDE' && state.bgImage && state.currentTab !== 'tab-ndt');
    }
    function getGuideOverlay() {
        const canvas = state.canvas || document.getElementById('planCanvas');
        const host = canvas && canvas.parentElement;
        if (!host) return null;
        let ov = document.getElementById('mapGuideOverlay');
        if (!ov) {
            ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            ov.id = 'mapGuideOverlay';
            ov.setAttribute('class', 'map-guide-overlay');
            ov.setAttribute('data-html2canvas-ignore', 'true');
            ov.setAttribute('aria-hidden', 'true');
            bindGuideOverlay(ov);
        }
        if (ov.parentElement !== host) host.appendChild(ov);
        ov.style.left = `${canvas.offsetLeft}px`;
        ov.style.top = `${canvas.offsetTop}px`;
        ov.style.width = `${canvas.clientWidth}px`;
        ov.style.height = `${canvas.clientHeight}px`;
        return ov;
    }
    /** 가이드 그리기(SVG) — pan/zoom 때마다 drawCanvas가 부른다 */
    function syncGuideOverlay() {
        const api = gsApi();
        const floorKey = currentMemoFloorKey();
        const vis = !!(api && floorKey && gsVisible());
        let ov = document.getElementById('mapGuideOverlay');
        if (!vis && state.mode !== 'GUIDE') { if (ov) { ov.replaceChildren(); ov.classList.remove('is-active'); } return; }
        ov = getGuideOverlay();
        if (!ov) return;
        ov.classList.toggle('is-active', state.mode === 'GUIDE');
        const list = vis ? api.listFor(state, floorKey) : [];
        if (gsSelectedId && !list.some((d) => d.id === gsSelectedId)) gsSelectedId = '';
        const ns = 'http://www.w3.org/2000/svg';
        const frag = document.createDocumentFragment();
        const guideOp = getGuideOpacity();
        list.forEach((d) => {
            const pts = api.screenPoints(d, memoImgToScreen);
            const sel = d.id === gsSelectedId && state.mode === 'GUIDE';
            const el = document.createElementNS(ns, gsSvgTag(d.kind));
            if (d.kind === 'circle') gsSetCircleAttrs(el, pts);
            else if (d.kind === 'rect') el.setAttribute('points', pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' '));
            else { el.setAttribute('x1', pts[0].sx); el.setAttribute('y1', pts[0].sy); el.setAttribute('x2', pts[1].sx); el.setAttribute('y2', pts[1].sy); }
            const gType = api.typeOf(d);
            el.setAttribute('class', `map-guide-shape map-guide-${d.kind} map-guide-type-${gType}${sel ? ' is-selected' : ''}`);
            if (!sel) {
                const c = getGuideTypeColor(gType);
                el.style.stroke = c;
                el.style.strokeOpacity = String(guideOp);
                el.style.fill = d.kind !== 'line' ? c : 'none';
                el.style.fillOpacity = String(Math.round(guideOp * 0.22 * 1000) / 1000);
            }
            el.dataset.id = d.id;
            frag.appendChild(el);
            if (sel) pts.forEach((p, i) => {
                const h = document.createElementNS(ns, 'rect');
                h.setAttribute('x', p.sx - 6); h.setAttribute('y', p.sy - 6); h.setAttribute('width', 12); h.setAttribute('height', 12);
                h.setAttribute('class', 'map-guide-handle');
                h.dataset.h = String(i);
                frag.appendChild(h);
            });
        });
        ov.replaceChildren(frag);
    }
    window.syncGuideOverlay = syncGuideOverlay;
    function gsLocal(e) {
        const r = elements.planCanvas.getBoundingClientRect();
        return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    }
    /** 꼭짓점 i를 화면 좌표 p로 옮긴 좌표 묶음 */
    function gsSvgTag(kind) { return kind === 'rect' ? 'polygon' : (kind === 'circle' ? 'circle' : 'line'); }
    function gsSetCircleAttrs(el, pts) {
        el.setAttribute('cx', pts[0].sx.toFixed(1));
        el.setAttribute('cy', pts[0].sy.toFixed(1));
        el.setAttribute('r', Math.hypot(pts[1].sx - pts[0].sx, pts[1].sy - pts[0].sy).toFixed(1));
    }
    function gsCornerPatch(d, i, img) {
        // 원: 0=중심(통째로 옮김), 1=테두리(반지름)
        if (d.kind === 'circle') return i === 0 ? { x1: img.x, y1: img.y, x2: img.x + (d.x2 - d.x1), y2: img.y + (d.y2 - d.y1) } : { x2: img.x, y2: img.y };
        if (d.kind === 'line') return i === 0 ? { x1: img.x, y1: img.y } : { x2: img.x, y2: img.y };
        return [{ x1: img.x, y1: img.y }, { x2: img.x, y1: img.y }, { x2: img.x, y2: img.y }, { x1: img.x, y2: img.y }][i] || {};
    }
    function bindGuideOverlay(ov) {
        // 휠 확대·축소는 도면으로 넘긴다
        ov.addEventListener('wheel', (e) => {
            if (!elements.planCanvas) return;
            e.preventDefault();
            elements.planCanvas.dispatchEvent(new WheelEvent('wheel', e));
        }, { passive: false });
        ov.addEventListener('pointerdown', (e) => {
            const api = gsApi();
            const floorKey = currentMemoFloorKey();
            if (state.mode !== 'GUIDE' || !api || !floorKey || !state.bgImage) return;
            if (e.button > 0) return;
            if (gsDrag && gsDrag.pointerId !== e.pointerId) { gsDrag = null; syncGuideOverlay(); return; } // 두 손가락 → 취소
            e.preventDefault();
            e.stopPropagation();
            const p = gsLocal(e);
            const img = memoScreenToImg(p.sx, p.sy);
            const hTarget = e.target && e.target.dataset && e.target.dataset.h;
            const list = api.listFor(state, floorKey);
            let hit = null;
            if (hTarget != null && gsSelectedId) hit = { shape: list.find((d) => d.id === gsSelectedId), part: 'h' + hTarget };
            else hit = api.hitTest(list, p.sx, p.sy, memoImgToScreen, e.pointerType === 'touch' ? 16 : 9, gsSelectedId);
            if (hit && hit.shape) {
                gsSelectedId = hit.shape.id;
                gsDrag = { mode: hit.part === 'body' ? 'move' : hit.part, id: hit.shape.id, start: img, orig: Object.assign({}, hit.shape), pointerId: e.pointerId, moved: false };
            } else {
                gsSelectedId = '';
                gsDrag = { mode: 'new', kind: gsKindForType(gsTypeForNew()), type: gsTypeForNew(), start: img, cur: img, s0: p, pointerId: e.pointerId, moved: false };
            }
            try { ov.setPointerCapture(e.pointerId); } catch (_e) { /* ignore */ }
            syncGuideOverlay();
            syncGuideBar();
        });
        ov.addEventListener('pointermove', (e) => {
            const api = gsApi();
            if (!gsDrag || e.pointerId !== gsDrag.pointerId || !api) return;
            e.preventDefault();
            const floorKey = currentMemoFloorKey();
            const p = gsLocal(e);
            const img = memoScreenToImg(p.sx, p.sy);
            if (gsDrag.mode === 'new') {
                gsDrag.cur = img;
                gsDrag.moved = gsDrag.moved || Math.hypot(p.sx - gsDrag.s0.sx, p.sy - gsDrag.s0.sy) > 6;
                drawGuideRubber(gsDrag);
                return;
            }
            const o = gsDrag.orig;
            let patch;
            if (gsDrag.mode === 'move') {
                const dx = img.x - gsDrag.start.x, dy = img.y - gsDrag.start.y;
                patch = { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
            } else patch = Object.assign({ x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }, gsCornerPatch(o, Number(gsDrag.mode.slice(1)), img));
            const d = api.listFor(state, floorKey).find((x) => x.id === gsDrag.id);
            if (d) { Object.assign(d, patch); gsDrag.moved = true; }
            syncGuideOverlay();
        });
        const end = (e) => {
            const api = gsApi();
            if (!gsDrag || (e && e.pointerId !== gsDrag.pointerId) || !api) return;
            const drag = gsDrag;
            gsDrag = null;
            const floorKey = currentMemoFloorKey();
            if (drag.mode === 'new') {
                if (drag.moved && e.type !== 'pointercancel') {
                    const s = drag.start, c = drag.cur;
                    const rec = api.add(state, floorKey, drag.kind, s.x, s.y, c.x, c.y, { type: drag.type });
                    if (rec) { gsSelectedId = rec.id; gsPushUndo({ op: 'add', floorKey, rec: Object.assign({}, rec) }); commitGuideChange(floorKey); return; }
                }
                syncGuideOverlay(); syncGuideBar();
                return;
            }
            if (drag.moved) {
                const d = api.listFor(state, floorKey).find((x) => x.id === drag.id);
                if (d) {
                    const now = { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 };
                    Object.assign(d, { x1: drag.orig.x1, y1: drag.orig.y1, x2: drag.orig.x2, y2: drag.orig.y2 });
                    if (e.type !== 'pointercancel') { api.update(state, floorKey, d.id, now); gsPushUndo({ op: 'edit', floorKey, rec: drag.orig }); }
                }
                commitGuideChange(floorKey);
                return;
            }
            syncGuideOverlay(); syncGuideBar();
        };
        ov.addEventListener('pointerup', end);
        ov.addEventListener('pointercancel', end);
    }
    function drawGuideRubber(drag) {
        const ov = document.getElementById('mapGuideOverlay');
        if (!ov) return;
        let r = ov.querySelector('.map-guide-rubber');
        const ns = 'http://www.w3.org/2000/svg';
        const tmp = { kind: drag.kind, type: drag.type, x1: drag.start.x, y1: drag.start.y, x2: drag.cur.x, y2: drag.cur.y };
        const pts = gsApi().screenPoints(tmp, memoImgToScreen);
        if (!r || r.tagName.toLowerCase() !== gsSvgTag(drag.kind)) {
            if (r) r.remove();
            r = document.createElementNS(ns, gsSvgTag(drag.kind));
            r.setAttribute('class', `map-guide-shape map-guide-${drag.kind} map-guide-rubber`);
            ov.appendChild(r);
        }
        r.style.stroke = getGuideTypeColor(drag.type || gsApi().defaultType(drag.kind));
        r.style.fill = drag.kind !== 'line' ? r.style.stroke : 'none';
        r.style.fillOpacity = '0.12';
        if (drag.kind === 'circle') gsSetCircleAttrs(r, pts);
        else if (drag.kind === 'rect') r.setAttribute('points', pts.map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`).join(' '));
        else { r.setAttribute('x1', pts[0].sx); r.setAttribute('y1', pts[0].sy); r.setAttribute('x2', pts[1].sx); r.setAttribute('y2', pts[1].sy); }
    }
    /** 가이드 막대: 사각형 · 직선 · 지우기 · 되돌리기 · 보이기 · 닫기 */
    function syncGuideBar() {
        const api = gsApi();
        const canvas = state.canvas || document.getElementById('planCanvas');
        const host = canvas && canvas.parentElement;
        let bar = document.getElementById('mapGuideBar');
        if (state.mode !== 'GUIDE' || !api || !host) { if (bar) bar.hidden = true; return; }
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'mapGuideBar';
            bar.className = 'map-count-bar map-guide-bar';
            bar.setAttribute('data-html2canvas-ignore', 'true');
            bar.addEventListener('click', (e) => {
                const b = e.target.closest('button');
                if (!b) return;
                e.preventDefault();
                const a = b.dataset.gsAct;
                if (a === 'circle' || a === 'line') setGsKind(a);
                else if (b.dataset.gsType) setGsType(b.dataset.gsType);
                else if (a === 'del') deleteSelectedGuide();
                else if (a === 'undo') undoGuide();
                else if (a === 'show') setGsShow(!readGsShowPref());
                else if (a === 'close') setDrawMode('PAN');
            });
            ['mousedown', 'touchstart', 'pointerdown'].forEach((t) => bar.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
        }
        if (bar.parentElement !== host) host.appendChild(bar);
        bar.hidden = false;
        const gsList = api.listFor(state, currentMemoFloorKey());
        const n = gsList.length;
        const selShape = gsSelectedId ? gsList.find((d) => d.id === gsSelectedId) : null;
        const curType = selShape ? api.typeOf(selShape) : gsTypeForNew();
        const typeBtns = api.TYPES.map((t) => `<button type="button" data-gs-type="${t}" class="map-guide-type-btn${curType === t ? ' active' : ''}" style="--gs-c:${getGuideTypeColor(t)}" title="${selShape ? '고른 가이드를 ' + api.TYPE_LABELS[t] + '(으)로' : '새 가이드: ' + api.TYPE_LABELS[t] + (t === 'column' ? ' (원)' : ' (직선)')} (${api.TYPES.indexOf(t) + 1})"><i></i>${api.TYPE_LABELS[t]}</button>`).join('');
        const html = `<span class="map-count-title">가이드 <small>${n}</small></span>`
            + typeBtns
            + `<button type="button" data-gs-act="del" ${gsSelectedId ? '' : 'disabled'} title="고른 가이드 지우기 (Delete)">🗑 지우기</button>`
            + `<button type="button" data-gs-act="undo" title="되돌리기 (Ctrl+Z)">↶ 되돌리기</button>`
            + `<button type="button" data-gs-act="show" class="${readGsShowPref() ? 'active' : ''}" title="가이드 모드가 아닐 때도 보이기">가이드 보이기</button>`
            + `<button type="button" data-gs-act="close">닫기</button>`
            + `<span class="map-count-hint">기둥=원(가운데에서 끌어 크기) · 거더·빔=직선 · 눌러 고르고 끌어 옮기기 · 모서리 □로 크기 · 화면 전용(출력 안 됨)</span>`;
        if (bar._h !== html) { bar._h = html; bar.innerHTML = html; }
        if (typeof placeMemberCountBar === 'function') placeMemberCountBar(bar, host);
    }
    window.syncGuideBar = syncGuideBar;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', (e) => {
        if (state.mode !== 'GUIDE') return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if ((e.key === 'Delete' || e.key === 'Backspace') && gsSelectedId) { e.preventDefault(); e.stopPropagation(); deleteSelectedGuide(); }
        else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); undoGuide(); }
        else if (!e.ctrlKey && !e.metaKey && !e.altKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setGsType(['column', 'girder', 'beam'][Number(e.key) - 1]); }
        else if (e.key === 'Escape') { if (gsSelectedId) { gsSelectedId = ''; syncGuideOverlay(); syncGuideBar(); } else setDrawMode('PAN'); e.stopPropagation(); }
    }, true);

    /* 도면 오른쪽 위에 뜨는 막대 자리(구조 부재 막대가 씀). 2026-11-04 부재 수 세기·평가 탭을 지우면서 이 함수만 남김 */
    function placeMemberCountBar(bar, host) {
        if (!bar || !host || bar.hidden) return;
        const hr = host.getBoundingClientRect();
        let top = 8;
        let right = 8;
        const vis = (el) => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
        host.querySelectorAll('.canvas-top-toolbar').forEach((tb) => {
            if (!vis(tb)) return;
            const r = tb.getBoundingClientRect();
            if (r.top - hr.top < hr.height / 2) top = Math.max(top, Math.round(r.bottom - hr.top + 6));
        });
        bar.style.top = top + 'px';
        bar.style.right = right + 'px';
        const rail = document.getElementById('mobileBtnStructLayer');
        const railBox = rail && rail.parentElement;
        if (vis(railBox)) {
            const r = railBox.getBoundingClientRect();
            const br = bar.getBoundingClientRect();
            const sideRail = r.left > hr.left + hr.width / 2 && r.right <= hr.right + 2;
            if (sideRail && br.right > r.left && br.bottom > r.top && br.top < r.bottom) bar.style.right = Math.round(hr.right - r.left + 6) + 'px';
        }
        if (!bar._ro && typeof ResizeObserver === 'function') {
            bar._ro = new ResizeObserver(() => placeMemberCountBar(bar, bar.parentElement));
            host.querySelectorAll('.canvas-top-toolbar').forEach((tb) => bar._ro.observe(tb));
            bar._ro.observe(host);
        }
    }

    function syncMemberGbOverlay(entries) {
        const list = Array.isArray(entries) ? entries : [];
        let ov = document.getElementById('mapMemberGbOverlay');
        if (!list.length) {
            if (ov) ov.replaceChildren();
            return;
        }
        ov = getMemberGbOverlay();
        if (!ov) return;
        const vw = ov.clientWidth || 0;
        const vh = ov.clientHeight || 0;
        const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        const btnH = coarse ? 24 : 28; // styles.css .map-member-gb-btn 높이와 같게(모바일 24px)
        const existing = new Map();
        Array.from(ov.children).forEach((el) => existing.set(el.dataset.key, el));
        const keep = new Set();
        list.forEach((en) => {
            if (en.cx < -60 || en.cy < -60 || (vw && en.cx > vw + 60) || (vh && en.cy > vh + 60)) return;
            let el = existing.get(en.key);
            const sig = en.choices.join('|');
            // 레인보우 강조 링(화면 전용 DOM, CSS 애니메이션 — 지정 필요한 보만)
            const ringKey = `ring|${en.key}`;
            let ring = existing.get(ringKey);
            if (!ring) {
                ring = document.createElement('div');
                ring.className = 'map-member-gb-ring';
                ring.dataset.key = ringKey;
                ov.insertBefore(ring, ov.firstChild);
            }
            keep.add(ringKey);
            if (en.ringW > 0 && en.ringH > 0) {
                ring.style.width = `${Math.round(en.ringW + 8)}px`;
                ring.style.height = `${Math.round(en.ringH + 8)}px`;
                ring.style.transform = `translate(${Math.round(en.cx)}px, ${Math.round(en.cy)}px) translate(-50%, -50%) rotate(${(en.angle || 0).toFixed(2)}deg)`;
            }
            if (!el || el.dataset.sig !== sig) {
                if (el) el.remove();
                el = document.createElement('div');
                el.className = 'map-member-gb-pick';
                el.dataset.key = en.key;
                el.dataset.ids = en.ids.join('|');
                el.dataset.sig = sig;
                el.title = `${en.choices.join('/')} 지정 필요`;
                en.choices.forEach((name) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'map-member-gb-btn';
                    b.dataset.value = name;
                    b.textContent = /\(G\)$/.test(name) ? 'G' : 'B';
                    b.title = `${name} ${/\(G\)$/.test(name) ? '거더' : '빔'}`;
                    b.setAttribute('aria-label', b.title);
                    el.appendChild(b);
                });
                ov.appendChild(el);
            }
            keep.add(en.key);
            let top = en.cy - en.halfH - 4 - btnH;
            if (top < 2) top = en.cy + en.halfH + 4; // 위쪽 끝이면 박스 아래로
            el.style.transform = `translate(${Math.round(en.cx)}px, ${Math.round(top)}px) translateX(-50%)`;
        });
        existing.forEach((el, key) => { if (!keep.has(key)) el.remove(); });
    }

    // 2026-10-13 PC 키보드 G=거더, B=빔 — 선택한 마킹(없으면 화면에 하나뿐인 G/B 지정 대상)에 적용
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || e.isComposing) return;
        const k = String(e.key || '').toLowerCase();
        const code = e.code || '';
        const isG = k === 'g' || k === 'ㅎ' || code === 'KeyG';
        const isB = k === 'b' || k === 'ㅠ' || code === 'KeyB';
        if (!isG && !isB) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
        if (document.querySelector('.app-dialog-backdrop:not([hidden]), dialog[open]')) return;
        const ov = document.getElementById('mapMemberGbOverlay');
        if (!ov || !ov.offsetParent) return;
        const picks = Array.from(ov.querySelectorAll('.map-member-gb-pick'));
        if (!picks.length) return;
        const sel = new Set((typeof selectedDefectIds !== 'undefined' && selectedDefectIds) ? Array.from(selectedDefectIds) : []);
        let targets = picks.filter((p) => String(p.dataset.ids || '').split('|').some((id) => sel.has(id)));
        if (!targets.length && picks.length === 1) targets = picks;
        if (!targets.length) return;
        let n = 0;
        targets.forEach((p) => {
            const btn = Array.from(p.querySelectorAll('.map-member-gb-btn')).find((b) => b.textContent === (isG ? 'G' : 'B'));
            if (!btn) return;
            n += applyMemberGbChoice(String(p.dataset.ids || '').split('|').filter(Boolean), btn.dataset.value || '') || 0;
        });
        if (n || targets.length) e.preventDefault();
    });

    /** 도면 「G」「B」 버튼: 부재 명칭만 바꿔 저장 (원인·종류는 그대로, 수정창은 안 연다) */
    function applyMemberGbChoice(defectIds, value) {
        const ids = (defectIds || []).filter(Boolean);
        if (!ids.length || !value) return 0;
        const editHistoryApi = window.BSA && window.BSA.editHistory;
        let changedCount = 0;
        ids.forEach((id) => {
            const located = findDefectAcrossBuildingFloors(id);
            const key = located ? located.floorKey : `${state.currentBuildingId}_${state.currentFloor}`;
            const list = (state.defects && state.defects[key]) || [];
            const defect = list.find((x) => x && x.id === id);
            if (!defect) return;
            const choices = getAmbiguousMemberChoices(defect.component);
            if (!choices || choices.indexOf(value) < 0) return;
            const before = (editHistoryApi && Array.isArray(editHistoryApi.TRACKED_FIELDS))
                ? editHistoryApi.TRACKED_FIELDS.reduce((acc, f) => { acc[f] = defect[f]; return acc; }, {})
                : null;
            defect.component = value;
            touchDefectUpdatedAt(defect);
            // G/B를 정하면 행·열 위치도 다시(보(G)는 거더 규칙 — 폭 밖이면 가까운 선 하나)
            if (key === `${state.currentBuildingId}_${state.currentFloor}` && typeof applyGridAutoLocationToDefect === 'function') {
                try { applyGridAutoLocationToDefect(defect); } catch (gridErr) { console.warn('[grid-lines] gb', gridErr); }
            }
            if (before) {
                try {
                    const diff = editHistoryApi.diffTracked(before, defect);
                    if (diff) {
                        defect.editHistory = editHistoryApi.appendEntry(editHistoryApi.readHistory(defect),
                            { at: Date.now(), by: window.state.userName || '', changes: diff });
                    }
                } catch (_e) { /* 이력은 부가 기능 */ }
            }
            changedCount++;
        });
        if (!changedCount) return 0;
        saveStateToLocalStorage();
        // 같은 결함 수정창이 열려 있으면 부재 칸도 맞춘다
        const openPinId = document.getElementById('defectPinId')?.value;
        if (openPinId && ids.indexOf(openPinId) >= 0) {
            syncDefectComboFields(document.getElementById('defectComponent'), document.getElementById('defectComponentInput'), value);
            if (typeof refreshDefectQuickPickBar === 'function') refreshDefectQuickPickBar();
        }
        drawCanvas();
        if (typeof renderDefectListPanel === 'function') renderDefectListPanel();
        if (typeof renderSurveyTable === 'function' && window.state.currentTab === 'tab-survey') renderSurveyTable();
        window.showToast?.(`부재 명칭 → ${value}${changedCount > 1 ? ` (${changedCount}건)` : ''}`, 'success', 1600);
        return changedCount;
    }

    function migrateDefectComponentStateShape() {
        if (Array.isArray(window.state.customDefectComponents)) {
            const legacy = window.state.customDefectComponents;
            window.state.customDefectComponents = { '구조체': [...legacy], '비구조체': [...legacy], '마감재': [...legacy] };
        }
        if (Array.isArray(window.state.hiddenDefectComponents)) {
            const legacy = window.state.hiddenDefectComponents;
            window.state.hiddenDefectComponents = { '구조체': [...legacy], '비구조체': [...legacy], '마감재': [...legacy] };
        }
        migrateLegacyMemberNamesInState();
    }

    function isDefectComboCustomToken(val) {
        return !val || String(val).startsWith('__ADD_CUSTOM');
    }

    function ensureDefectComboOption(select, value) {
        if (!select || !value || isDefectComboCustomToken(value)) return;
        const exists = Array.from(select.options).some(o => o.value === value);
        if (!exists) {
            const customOpt = document.createElement('option');
            customOpt.value = value;
            customOpt.textContent = value;
            const addOpt = select.querySelector('option[value^="__ADD_CUSTOM"]');
            if (addOpt) select.insertBefore(customOpt, addOpt);
            else select.appendChild(customOpt);
        }
        select.value = value;
    }

    function syncDefectComboFields(select, input, value) {
        if (!select || !input) return;
        const v = (value ?? '').trim();
        if (!v || isDefectComboCustomToken(v)) {
            // 공란으로 둘 때 select에 남은 이전값(예: 기둥)을 input에 되살리지 않음
            if (select && !isDefectComboCustomToken(select.value)) {
                try { select.value = ''; } catch (_e) { /* ignore */ }
            }
            input.value = '';
            return;
        }
        ensureDefectComboOption(select, v);
        input.value = v;
        // 행·열: 칩·G/B 버튼은 change 이벤트가 없어 여기서 거더 규칙 등 다시 계산(표시만, 저장 때 결함에 반영)
        if (input.id === 'defectComponentInput' && typeof refreshGridAutoLocationInModal === 'function') {
            setTimeout(refreshGridAutoLocationInModal, 0);
        }
    }

    function getDefectComboValue(select, input) {
        const typed = (input?.value || '').trim();
        if (typed) return typed;
        const sel = (select?.value || '').trim();
        return isDefectComboCustomToken(sel) ? '' : sel;
    }

    function getQuickPickOptionsFromSelect(select) {
        if (!select) return [];
        return Array.from(select.options || [])
            .map(opt => String(opt.value || '').trim())
            .filter(v => v && !isDefectComboCustomToken(v));
    }

    function renderQuickPickChipGroup(containerId, options, currentValue, onPick) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!Array.isArray(options) || options.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = options.map(value => {
            return `<button type="button" class="defect-quick-chip ${value === currentValue ? 'active' : ''}" tabindex="-1" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
        }).join('');
        container.querySelectorAll('.defect-quick-chip').forEach(btn => {
            btn.addEventListener('click', () => onPick(btn.dataset.value || ''));
        });
    }

    // ── 2026-09-28 빠른 선택: ★즐겨찾기를 먼저, 항목은 접지 않고 전부 표시 ──
    function getDefectQuickPresetsApi() {
        return (window.BSA && window.BSA.defectQuickPresets) || null;
    }

    function getDefectFavoriteList(field, bucket) {
        const q = getDefectQuickPresetsApi();
        if (!q) return [];
        if (field === 'component') {
            migrateDefectComponentStateShape();
            return q.getEffectiveFavorites(window.state.favoriteDefectComponents, 'component', bucket,
                (window.state.customDefectComponents || {})[bucket] || [],
                (window.state.hiddenDefectComponents || {})[bucket] || []);
        }
        if (field === 'type') {
            return q.getEffectiveFavorites(window.state.favoriteDefectTypes, 'type', bucket,
                (window.state.customDefectTypes || {})[bucket] || [],
                (window.state.hiddenDefectTypes || {})[bucket] || []);
        }
        // 원인 ★ = 이 종류를 고르면 자동 체크. 기본값 없음(없으면 맨 위 원인).
        return q.getEffectiveFavorites(window.state.favoriteDefectCauses, 'cause', bucket, [],
            (window.state.hiddenDefectCauses || {})[bucket] || []);
    }

    function toggleDefectFavorite(field, bucket, value) {
        const q = getDefectQuickPresetsApi();
        if (!q || !bucket || !value) return;
        const stateKey = field === 'component' ? 'favoriteDefectComponents'
            : (field === 'type' ? 'favoriteDefectTypes' : 'favoriteDefectCauses');
        const customList = field === 'component' ? ((window.state.customDefectComponents || {})[bucket] || [])
            : (field === 'type' ? ((window.state.customDefectTypes || {})[bucket] || []) : []);
        const hiddenKey = field === 'component' ? 'hiddenDefectComponents'
            : (field === 'type' ? 'hiddenDefectTypes' : 'hiddenDefectCauses');
        window.state[stateKey] = q.toggleFavorite(window.state[stateKey] || {}, field, bucket, value,
            customList, (window.state[hiddenKey] || {})[bucket] || []);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
    }

    function recordDefectPickUsage(field, bucket, value) {
        const q = getDefectQuickPresetsApi();
        if (!q || !value) return;
        window.state.defectPickUsage = q.recordUsage(window.state.defectPickUsage || {}, field, bucket, value);
        // 결함 자동 저장이 곧 로컬에 쓰므로 여기서는 계정 설정 동기화만 예약
        if (window.state.uid && typeof scheduleSyncUserDefectPinPresets === 'function') scheduleSyncUserDefectPinPresets();
    }

    function computeDefectVisibleChips(field, bucket, ordered, selected, pinned) {
        const q = getDefectQuickPresetsApi();
        if (!q) return { visible: (ordered || []).slice(), hidden: [] };
        return q.computeVisibleChips(ordered, {
            limit: (ordered || []).length, // 접지 않고 전부 표시
            favorites: getDefectFavoriteList(field, bucket),
            usage: q.getUsageCounts(window.state.defectPickUsage, field, bucket),
            selected: selected || [],
            pinned: pinned || []
        });
    }

    /** 칩 전부 표시 (순서: 고정 → ★ → 나머지) */
    function renderDefectChips(containerId, split, isActive, onPick) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = ((split && split.visible) || []).map((value) => {
            const active = isActive(value);
            return `<button type="button" class="defect-quick-chip${active ? ' active' : ''}" tabindex="-1" data-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
        }).join('');
        container.querySelectorAll('.defect-quick-chip').forEach((btn) => {
            btn.addEventListener('click', () => onPick(btn.dataset.value || ''));
        });
    }

    function getNdtPickOptions(preset, customStateKey) {
        if (!window.state[customStateKey]) window.state[customStateKey] = [];
        const customs = window.state[customStateKey].filter(v => v && !preset.includes(v));
        return preset.concat(customs);
    }

    function rememberNdtCustomPick(value, preset, customStateKey) {
        const v = String(value || '').trim();
        if (!v || preset.includes(v)) return;
        if (!window.state[customStateKey]) window.state[customStateKey] = [];
        if (!window.state[customStateKey].includes(v)) {
            window.state[customStateKey].push(v);
            if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        }
    }

    function refreshNdtComponentPickBar() {
        const select = document.getElementById('ndtComponent');
        const input = document.getElementById('ndtComponentInput');
        if (!select || !input) return;
        const current = getDefectComboValue(select, input);
        const options = getNdtPickOptions(NDT_COMPONENT_PRESET, 'customNdtComponents');
        renderQuickPickChipGroup('ndtComponentChips', options, current, (value) => {
            syncDefectComboFields(select, input, value);
            rememberNdtCustomPick(value, NDT_COMPONENT_PRESET, 'customNdtComponents');
            if (value && !NDT_COMPONENT_PRESET.includes(value)) populateNdtComponentDropdown(value);
            refreshNdtComponentPickBar();
            toggleNdtMeasureDimMode();
            document.getElementById('ndtDesignWidth')?.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('ndtDesignWeb')?.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
        });
    }

    function refreshNdtFinishStatePickBar() {
        const select = document.getElementById('ndtFinishState');
        const input = document.getElementById('ndtFinishStateInput');
        if (!select || !input) return;
        const current = getDefectComboValue(select, input);
        const options = getNdtPickOptions(NDT_FINISH_STATE_PRESET, 'customNdtFinishStates');
        renderQuickPickChipGroup('ndtFinishStateChips', options, current, (value) => {
            syncDefectComboFields(select, input, value);
            rememberNdtCustomPick(value, NDT_FINISH_STATE_PRESET, 'customNdtFinishStates');
            if (value && !NDT_FINISH_STATE_PRESET.includes(value)) populateNdtFinishStateDropdown(value);
            refreshNdtFinishStatePickBar();
            if (typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
        });
    }

    function bindNdtPickInputs() {
        const specs = [
            {
                selectId: 'ndtComponent',
                inputId: 'ndtComponentInput',
                addBtnId: 'btnAddNdtComponent',
                preset: NDT_COMPONENT_PRESET,
                customKey: 'customNdtComponents',
                populate: populateNdtComponentDropdown,
                refresh: refreshNdtComponentPickBar
            },
            {
                selectId: 'ndtFinishState',
                inputId: 'ndtFinishStateInput',
                addBtnId: 'btnAddNdtFinishState',
                preset: NDT_FINISH_STATE_PRESET,
                customKey: 'customNdtFinishStates',
                populate: populateNdtFinishStateDropdown,
                refresh: refreshNdtFinishStatePickBar
            }
        ];
        // mode: false = 타이핑 중, 'enter' = Enter로 이번 항목 값만 확정(목록 저장 안 함),
        //       true = '추가' 버튼으로 명시적으로 목록(customNdt*)에 저장
        const applyTypedValue = (spec, mode) => {
            const input = document.getElementById(spec.inputId);
            const select = document.getElementById(spec.selectId);
            if (!input) return;
            const commitCustom = mode === true;
            const v = input.value.trim();
            if (v) {
                if (commitCustom) {
                    ensureDefectComboOption(select, v);
                    rememberNdtCustomPick(v, spec.preset, spec.customKey);
                    if (!spec.preset.includes(v)) spec.populate(v);
                    else if (select) select.value = v;
                } else if (mode === 'enter') {
                    ensureDefectComboOption(select, v);
                } else if (select && spec.preset.includes(v)) {
                    select.value = v;
                }
                // 타이핑 중에는 중간 글자를 select 옵션으로 넣지 않음
            }
            if (mode) spec.refresh();
            else if (select && v && spec.preset.includes(v)) spec.refresh();
            if (spec.selectId === 'ndtComponent') {
                toggleNdtMeasureDimMode();
                document.getElementById('ndtDesignWidth')?.dispatchEvent(new Event('input', { bubbles: true }));
                document.getElementById('ndtDesignWeb')?.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (typeof scheduleNdtAutoApply === 'function') scheduleNdtAutoApply();
        };
        specs.forEach(spec => {
            const input = document.getElementById(spec.inputId);
            const addBtn = document.getElementById(spec.addBtnId);
            if (input && !input.dataset.ndtPickBound) {
                input.dataset.ndtPickBound = '1';
                input.addEventListener('input', () => applyTypedValue(spec, false));
                input.addEventListener('keydown', (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    // Enter는 이번 항목 값만. 목록/칩 저장은 '추가' 버튼으로만.
                    applyTypedValue(spec, 'enter');
                });
            }
            if (addBtn && !addBtn.dataset.ndtPickBound) {
                addBtn.dataset.ndtPickBound = '1';
                addBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    applyTypedValue(spec, true);
                });
            }
        });
    }

    function isJointComponentName(name) {
        const t = String(name || '');
        return t.includes('접합부') || t.includes('접합');
    }

    function fillDefectJointSelects() {
        const left = document.getElementById('defectJointLeft');
        const right = document.getElementById('defectJointRight');
        if (!left || !right) return;
        const fill = (el, list, preferred) => {
            const cur = el.value || preferred || list[0];
            el.innerHTML = list.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
            if (list.includes(cur)) el.value = cur;
        };
        fill(left, DEFECT_JOINT_LEFT, '기둥');
        fill(right, DEFECT_JOINT_RIGHT, '보(G)');
    }

    function buildJointComponentName(left, right) {
        const a = String(left || '').trim();
        const b = String(right || '').trim();
        if (!a || !b) return '';
        // 2026-11-02 같은 부재끼리(보-보, 기둥-기둥…)는 「보 접합부」로 — 같은 이름을 두 번 쓰지 않는다
        if (a === b) return `${a} 접합부`;
        return `${a}-${b} 접합부`;
    }

    function applyJointComponentFromComposer() {
        const left = document.getElementById('defectJointLeft')?.value || '';
        const right = document.getElementById('defectJointRight')?.value || '';
        const name = buildJointComponentName(left, right);
        if (!name) return;
        const categoryEl = document.getElementById('defectCategory');
        const cat = categoryEl?.value || '구조체';
        if (categoryEl && cat !== '구조체') {
            categoryEl.value = '구조체';
            categoryEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const componentSelect = document.getElementById('defectComponent');
        const componentInput = document.getElementById('defectComponentInput');
        if (isDefectBulkEditMode()) markDefectBulkFieldChanged('component');
        // 2026-11-02 조합한 접합부(예: 기둥-벽체 접합부)는 이 결함에만 쓴다 — 부재 목록(customDefectComponents)에 저장해 하단 부재 칩에 쌓이지 않게 함.
        // 목록에 없는 이름은 아래 populateDefectComponentDropdown이 이번 선택값으로만 보여 준다.
        // 2026-10-19 적용했으면 접합부 고르기 끝 — 다시 고르려면 「접합부」 단추를 다시 누른다
        window._defectComponentJointMode = false;
        populateDefectComponentDropdown('구조체', name);
        syncDefectComboFields(componentSelect, componentInput, name);
        updateDefectTypeDropdown('구조체', getDefectComboValue(
            document.getElementById('defectType'),
            document.getElementById('defectTypeInput')
        ));
        if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        refreshDefectQuickPickBar();
    }

    function bindDefectJointComposer() {
        const modeBtn = document.getElementById('btnDefectJointMode');
        const applyBtn = document.getElementById('btnApplyDefectJoint');
        if (modeBtn && !modeBtn.dataset.bound) {
            modeBtn.dataset.bound = '1';
            modeBtn.addEventListener('click', () => {
                window._defectComponentJointMode = !window._defectComponentJointMode;
                refreshDefectQuickPickBar();
            });
        }
        if (applyBtn && !applyBtn.dataset.bound) {
            applyBtn.dataset.bound = '1';
            applyBtn.addEventListener('click', () => applyJointComponentFromComposer());
        }
        fillDefectJointSelects();
    }

    /**
     * 단계 선택: 대분류가 있어야 부재, 실제 부재가 있어야 결함내용.
     * 마감재 바탕(기둥/벽체/보/슬래브)만 고른 상태는 부재 완료가 아님(재료 팝업 확정 후).
     * 숨겨도 입력값은 지우지 않는다.
     */
    function isCompletedDefectMember(component, category) {
        const name = String(component == null ? '' : component).trim();
        if (!name) return false;
        const cat = typeof readDefectCategoryUi === 'function' ? readDefectCategoryUi(category) : String(category || '').trim();
        if (cat === '마감재' && typeof isFinishMemberBaseName === 'function'
            && isFinishMemberBaseName(name)
            && !(typeof isFinishCombinedMemberName === 'function' && isFinishCombinedMemberName(name))) {
            return false;
        }
        return true;
    }

    function setDefectProgressiveGroupOpen(el, open) {
        if (!el) return;
        el.hidden = !open;
        if (open) {
            el.removeAttribute('aria-hidden');
            if (el.style && el.style.display === 'none') el.style.display = '';
        } else {
            el.setAttribute('aria-hidden', 'true');
            if (el.style) el.style.display = 'none';
        }
    }

    function syncDefectProgressiveSections() {
        const cat = typeof readDefectCategoryUi === 'function'
            ? readDefectCategoryUi(document.getElementById('defectCategory')?.value)
            : '';
        const catOn = !!cat;
        const member = (typeof getDefectComboValue === 'function')
            ? getDefectComboValue(document.getElementById('defectComponent'), document.getElementById('defectComponentInput'))
            : String(document.getElementById('defectComponentInput')?.value || '').trim();
        const memberOn = catOn && isCompletedDefectMember(member, cat);
        const typeVal = (typeof getDefectComboValue === 'function')
            ? getDefectComboValue(document.getElementById('defectType'), document.getElementById('defectTypeInput'))
            : String(document.getElementById('defectTypeInput')?.value || '').trim();
        const good = typeof isGoodDefectType === 'function' && isGoodDefectType(typeVal);
        const causeOn = memberOn && !good && typeof hasActionableDefectType === 'function' && hasActionableDefectType(typeVal);
        setDefectProgressiveGroupOpen(document.getElementById('quickComponentGroup'), catOn);
        setDefectProgressiveGroupOpen(document.getElementById('quickTypeGroup'), memberOn);
        setDefectProgressiveGroupOpen(document.getElementById('quickCauseGroup'), causeOn);
    }
    window.isCompletedDefectMember = isCompletedDefectMember;
    window.syncDefectProgressiveSections = syncDefectProgressiveSections;

    function refreshDefectQuickPickBar() {
        bindDefectJointComposer();
        const categoryEl = document.getElementById('defectCategory');
        const componentSelect = document.getElementById('defectComponent');
        const componentInput = document.getElementById('defectComponentInput');
        const typeSelect = document.getElementById('defectType');
        const typeInput = document.getElementById('defectTypeInput');
        const currentCategory = readDefectCategoryUi(categoryEl?.value);
        const currentComponent = getDefectComboValue(componentSelect, componentInput);
        const currentType = getDefectComboValue(typeSelect, typeInput);
        const memberChosen = isCompletedDefectMember(currentComponent, currentCategory);

        renderQuickPickChipGroup('quickCategoryChips', ['구조체', '비구조체', '마감재'], currentCategory, (value) => {
            if (!categoryEl) return;
            if (isDefectBulkEditMode()) markDefectBulkFieldChanged('category');
            categoryEl.value = value;
            categoryEl.dispatchEvent(new Event('change', { bubbles: true }));
            if (value !== '구조체') window._defectComponentJointMode = false;
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        });

        if (!currentCategory) {
            const finishBaseHost = document.getElementById('quickFinishBaseChips');
            if (finishBaseHost) {
                finishBaseHost.style.display = 'none';
                finishBaseHost.innerHTML = '';
            }
            const jointToolbarOff = document.getElementById('defectJointToolbar');
            if (jointToolbarOff) jointToolbarOff.style.display = 'none';
            const typeHost = document.getElementById('quickDefectTypeChips');
            if (typeHost) typeHost.innerHTML = '';
            const compHost = document.getElementById('quickComponentChips');
            if (compHost) compHost.innerHTML = '';
            syncDefectProgressiveSections();
            return;
        }

        const jointToolbar = document.getElementById('defectJointToolbar');
        const jointComposer = document.getElementById('defectJointComposer');
        const jointModeBtn = document.getElementById('btnDefectJointMode');
        const jointMode = !!window._defectComponentJointMode && currentCategory === '구조체';
        if (jointToolbar) jointToolbar.style.display = (currentCategory === '구조체') ? '' : 'none';
        if (jointModeBtn) jointModeBtn.classList.toggle('active', jointMode);
        if (jointComposer) jointComposer.style.display = jointMode ? 'flex' : 'none';

        // 칩은 select의 임시 타이핑 옵션이 아니라 프리셋+커스텀만 사용 (글자마다 버튼 생성 방지)
        migrateDefectComponentStateShape();
        if (!window.state.customDefectComponents) window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.hiddenDefectComponents) window.state.hiddenDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.customDefectComponents[currentCategory]) window.state.customDefectComponents[currentCategory] = [];
        if (!window.state.hiddenDefectComponents[currentCategory]) window.state.hiddenDefectComponents[currentCategory] = [];
        const compPreset = getDefectComponentPresetForCategory(currentCategory);
        const compHidden = window.state.hiddenDefectComponents[currentCategory];
        const compCustom = window.state.customDefectComponents[currentCategory];
        let componentOptions = applySavedOptionOrder(
            getDefaultVisibleOptionTexts({
                presetList: compPreset,
                hiddenList: compHidden,
                customList: compCustom
            }),
            ensureOptionOrderEntry('defectComponentOrder', currentCategory)
        );
        if (jointMode) {
            const jointSet = new Set(DEFECT_JOINT_COMPONENT_PRESET);
            componentOptions = componentOptions.filter((v) => isJointComponentName(v) || jointSet.has(v));
            DEFECT_JOINT_COMPONENT_PRESET.forEach((v) => {
                if (!componentOptions.includes(v)) componentOptions.push(v);
            });
            if (currentComponent && isJointComponentName(currentComponent) && !componentOptions.includes(currentComponent)) {
                componentOptions.unshift(currentComponent);
            }
        }
        // 2026-11-02 조합해서 쓴 접합부는 목록에 저장하지 않으므로, 지금 고른 동안만 칩으로 보여 준다(다른 부재를 고르면 사라짐)
        // 2026-11-06 미장균열로 비구조체가 된 맨몸 기둥·보도 이 결함에만 보여 주고 재사용 목록에는 넣지 않음
        if (!jointMode && currentComponent && !componentOptions.includes(currentComponent)
            && (isJointComponentName(currentComponent)
                || isFinishCombinedMemberName(currentComponent)
                || ((currentCategory === '비구조체' || currentCategory === '마감재')
                    && (isBareStructuralMemberChipName(currentComponent) || isFinishMemberBaseName(currentComponent))))) {
            componentOptions = [currentComponent].concat(componentOptions);
        }
        const onComponentPick = (value) => {
            if (isDefectBulkEditMode()) markDefectBulkFieldChanged('component');
            if (value && value !== currentComponent && shouldLearnDefectComponentForCategory(currentCategory, value)) {
                recordDefectPickUsage('component', currentCategory, value);
            }
            syncDefectComboFields(componentSelect, componentInput, value);
            // 2026-10-19 접합부 모드에서 접합부를 골랐으면(=적용) 모드 끝
            if (jointMode && isJointComponentName(value)) window._defectComponentJointMode = false;
            refreshDefectTypeAfterComponentChange(currentCategory);
            if (maybeReclassifyJointGapToNonStructural()) return;
            if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            refreshDefectQuickPickBar();
        };
        const finishBaseHost = document.getElementById('quickFinishBaseChips');
        if (finishBaseHost) {
            const showFinishBases = !jointMode && currentCategory === '마감재';
            finishBaseHost.style.display = showFinishBases ? '' : 'none';
            finishBaseHost.innerHTML = '';
            if (showFinishBases) {
                const chooser = finishMemberChooserApi();
                const bases = (chooser && chooser.BASES) ? chooser.BASES : ['기둥', '벽체', '보', '슬래브'];
                const parsedFinish = chooser && chooser.parse ? chooser.parse(currentComponent) : null;
                const activeBase = parsedFinish ? parsedFinish.base : (isFinishMemberBaseName(currentComponent) ? currentComponent : '');
                finishBaseHost.innerHTML = bases.map((b) => {
                    const on = b === activeBase;
                    return `<button type="button" class="defect-quick-chip defect-finish-base-chip${on ? ' active' : ''}" tabindex="-1" data-finish-base="${escapeHtml(b)}">${escapeHtml(b)}</button>`;
                }).join('');
                finishBaseHost.querySelectorAll('[data-finish-base]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const base = btn.getAttribute('data-finish-base') || '';
                        if (!chooser || typeof chooser.open !== 'function') return;
                        chooser.open({
                            base,
                            previousValue: currentComponent,
                            onConfirm: (label) => onComponentPick(label),
                            onCancel: () => {}
                        });
                    });
                });
                componentOptions = componentOptions.filter((v) => !isFinishMemberBaseName(v) || (compCustom || []).includes(v));
            }
        }
        if (jointMode) {
            renderQuickPickChipGroup('quickComponentChips', componentOptions, currentComponent, onComponentPick);
        } else {
            const compSplit = computeDefectVisibleChips('component', currentCategory, componentOptions,
                currentComponent ? [currentComponent] : []);
            renderDefectChips('quickComponentChips', compSplit, (v) => v === currentComponent, onComponentPick);
        }

        renderMemberGbHint(jointMode ? '' : currentComponent, onComponentPick);
        if (memberChosen) {
            const selectedTypeParts = parseDefectTypeList(currentType);
            const selectedTypeSet = new Set(selectedTypeParts);
            const typeChipOptions = getPinnedDefectTypeChips(currentCategory, currentComponent);
            const typeSplit = computeDefectVisibleChips('type', currentCategory, typeChipOptions, selectedTypeParts, ['상태양호']);
            renderDefectChips('quickDefectTypeChips', typeSplit, (v) => selectedTypeSet.has(v), (value) => {
                if (value && value !== '상태양호' && !selectedTypeSet.has(value)) {
                    recordDefectPickUsage('type', currentCategory, value);
                }
                toggleDefectTypeChip(value);
            });
        } else {
            const typeHost = document.getElementById('quickDefectTypeChips');
            if (typeHost) typeHost.innerHTML = '';
        }

        const causeChipHost = document.getElementById('quickCauseChips');
        if (causeChipHost) {
            causeChipHost.style.display = 'none';
            causeChipHost.innerHTML = '';
        }
        syncDefectProgressiveSections();
    }

    function shouldPersistTypedPreset() {
        const TPM = window.BSA && window.BSA.typedPresetMode;
        return !!(TPM && typeof TPM.shouldPersist === 'function' && TPM.shouldPersist());
    }

    function knownDefectCategoryOrEmpty(raw) {
        const cat = String(raw || '').trim();
        return (cat === '구조체' || cat === '비구조체' || cat === '마감재') ? cat : '';
    }

    function persistTypedDefectComponent(value) {
        const trimmed = String(value || '').trim();
        const cat = knownDefectCategoryOrEmpty(document.getElementById('defectCategory')?.value);
        if (!trimmed || !cat) return false;
        migrateDefectComponentStateShape();
        if (!window.state.customDefectComponents) window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.customDefectComponents[cat]) window.state.customDefectComponents[cat] = [];
        const preset = getDefectComponentPresetForCategory(cat);
        if (preset.includes(trimmed) || window.state.customDefectComponents[cat].includes(trimmed)) return false;
        if (!shouldLearnDefectComponentForCategory(cat, trimmed)) return false;
        window.state.customDefectComponents[cat].push(trimmed);
        const order = ensureOptionOrderEntry('defectComponentOrder', cat);
        if (!order.includes(trimmed)) order.push(trimmed);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        return true;
    }

    function persistTypedDefectType(value) {
        const trimmed = String(value || '').trim();
        const cat = knownDefectCategoryOrEmpty(document.getElementById('defectCategory')?.value);
        if (!trimmed || !cat || (typeof isTransientDefectTypeValue === 'function' && isTransientDefectTypeValue(trimmed))) return false;
        if (!window.state.customDefectTypes) window.state.customDefectTypes = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.customDefectTypes[cat]) window.state.customDefectTypes[cat] = [];
        const component = getDefectComboValue(
            document.getElementById('defectComponent'),
            document.getElementById('defectComponentInput')
        );
        const preset = (typeof getDefectTypePresetFor === 'function' ? getDefectTypePresetFor(cat, component) : []) || [];
        if (preset.includes(trimmed) || window.state.customDefectTypes[cat].includes(trimmed)) return false;
        window.state.customDefectTypes[cat].push(trimmed);
        const order = ensureOptionOrderEntry('defectTypeOrder', cat);
        if (!order.includes(trimmed)) order.push(trimmed);
        if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
        return true;
    }

    function syncTypedPresetModeUi() {
        const TPM = window.BSA && window.BSA.typedPresetMode;
        const mode = TPM && typeof TPM.getMode === 'function' ? TPM.getMode() : 'once';
        document.querySelectorAll('#defectTypedPresetMode [data-typed-preset-mode]').forEach((btn) => {
            const on = btn.getAttribute('data-typed-preset-mode') === mode;
            btn.classList.toggle('is-active', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const causeInput = document.getElementById('defectCauseInput');
        if (causeInput) {
            causeInput.placeholder = mode === 'save'
                ? '발생 원인 직접 입력 후 Enter (프리셋에 저장)'
                : '발생 원인 직접 입력 후 Enter (이번 결함만)';
        }
    }
    window.syncTypedPresetModeUi = syncTypedPresetModeUi;

    function bindTypedPresetModeToggle() {
        const host = document.getElementById('defectTypedPresetMode');
        if (!host || host.dataset.bound) return;
        host.dataset.bound = '1';
        host.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-typed-preset-mode]');
            if (!btn) return;
            const TPM = window.BSA && window.BSA.typedPresetMode;
            if (TPM && typeof TPM.setMode === 'function') TPM.setMode(btn.getAttribute('data-typed-preset-mode'));
            syncTypedPresetModeUi();
        });
        // 2026-11-06 「프리셋에 저장/이번만 사용」은 직접 입력하는 동안 그 칸 바로 아래에만 보인다(구조 분류 위에 늘 떠 있지 않게).
        // 터치 기기는 입력 팝업 안에 같은 버튼이 있어 여기서는 안 띄운다.
        const TYPED_INPUT_IDS = ['defectComponentInput', 'defectTypeInput', 'defectCauseInput'];
        host.addEventListener('mousedown', (e) => e.preventDefault());   // 버튼을 눌러도 입력칸 포커스 유지
        TYPED_INPUT_IDS.forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.addEventListener('focus', () => {
                setTimeout(() => {
                    if (document.activeElement !== input) return;   // 입력 팝업으로 넘어감
                    (input.closest('.defect-cause-custom-row') || input).after(host);
                    host.hidden = false;
                }, 0);
            });
            input.addEventListener('blur', () => { host.hidden = true; });
        });
        syncTypedPresetModeUi();
    }

    function bindDefectComboInputs() {
        const pairs = [
            {
                selectId: 'defectComponent',
                inputId: 'defectComponentInput',
                onChange: () => {
                    const cat = document.getElementById('defectCategory')?.value || '구조체';
                    refreshDefectTypeAfterComponentChange(cat);
                }
            },
            {
                selectId: 'defectType',
                inputId: 'defectTypeInput',
                onChange: (v) => {
                    updateDefectCauseDropdown(v);
                    toggleDefectSizeInputMode();
                }
            }
        ];
        pairs.forEach(({ selectId, inputId, onChange }) => {
            const select = document.getElementById(selectId);
            const input = document.getElementById(inputId);
            if (!select || !input || input.dataset.comboBound) return;
            input.dataset.comboBound = '1';

            const commitTypedComboValue = () => {
                const v = input.value.trim();
                if (!v) {
                    if (select && !isDefectComboCustomToken(select.value)) select.value = '';
                    refreshDefectQuickPickBar();
                    return;
                }
                if (selectId === 'defectComponent') {
                    // 기본(이번만 사용): 입력칸 타이핑만으로는 커스텀/칩에 넣지 않음.
                    // 「프리셋에 저장」이면 기존 회사 공통 부재 목록에 중복 없이 넣는다.
                    const cat = document.getElementById('defectCategory')?.value || '구조체';
                    const preset = getDefectComponentPresetForCategory(cat);
                    const customs = (window.state.customDefectComponents && window.state.customDefectComponents[cat]) || [];
                    if (shouldPersistTypedPreset() && !preset.includes(v) && !customs.includes(v)) {
                        persistTypedDefectComponent(v);
                    }
                    const nextCustoms = (window.state.customDefectComponents && window.state.customDefectComponents[cat]) || [];
                    if (preset.includes(v) || nextCustoms.includes(v) || !shouldLearnDefectComponentForCategory(cat, v)) {
                        populateDefectComponentDropdown(cat, v);
                    } else if (select) {
                        if (!isDefectComboCustomToken(select.value)) select.selectedIndex = -1;
                    }
                } else {
                    if (selectId === 'defectType' && shouldPersistTypedPreset()) persistTypedDefectType(v);
                    ensureDefectComboOption(select, v);
                }
                if (onChange) onChange(v);
                if (selectId === 'defectType') {
                    // 타이핑 중 onChange가 원인을 비우므로, 칸에 들어올 때 기억한 원인을 기준으로 맞춘다.
                    // 종류가 그대로면(탭으로 지나가기만 함) 원래 원인을 되살리고, 바뀌었으면 자동 체크.
                    const atFocus = input.dataset.valueAtFocus;
                    const causesAtFocus = input.dataset.causesAtFocus != null ? parseCauseList(input.dataset.causesAtFocus) : null;
                    delete input.dataset.valueAtFocus;
                    delete input.dataset.causesAtFocus;
                    if (atFocus != null && atFocus === v && causesAtFocus) {
                        updateDefectCauseDropdown(v, joinCauseList(causesAtFocus));
                    } else {
                        applyCauseAutoPickForType(v, causesAtFocus || undefined);
                    }
                }
                if (selectId === 'defectType' && typeof maybeReclassifyPlasterCrackToNonStructural === 'function') {
                    if (maybeReclassifyPlasterCrackToNonStructural()) return;
                }
                if (typeof maybeReclassifyJointGapToNonStructural === 'function' && maybeReclassifyJointGapToNonStructural()) return;
                refreshDefectQuickPickBar();
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            };

            // 타이핑 중에는 중간 글자를 옵션/칩으로 넣지 않음 (blur·Enter에서만 확정)
            input.addEventListener('input', () => {
                const v = input.value.trim();
                if (selectId === 'defectType') {
                    if (onChange) onChange(v);
                } else if (selectId === 'defectComponent' && onChange) {
                    // 부재는 종류 목록만 미리 맞춰 두고, 칩 갱신·옵션 추가는 확정 시
                    onChange();
                }
                if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
            });
            if (selectId === 'defectType') {
                input.addEventListener('focus', () => {
                    input.dataset.valueAtFocus = input.value.trim();
                    input.dataset.causesAtFocus = joinCauseList(getSelectedCausesFromUi());
                });
            }
            input.addEventListener('blur', () => commitTypedComboValue());
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                commitTypedComboValue();
                input.blur();
            });
        });
        bindDefectCauseDirectInput();
        bindTypedPresetModeToggle();
    }

    function isDefectHandwriteTabStopVisible(el) {
        if (!el || el.disabled) return false;
        if (el.getAttribute('type') === 'hidden') return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        // offsetParent null when display:none ancestor (except fixed); still allow if in open modal
        const rect = el.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
    }

    function getDefectHandwriteTabStops() {
        const stops = [];
        const push = (el) => {
            if (el && isDefectHandwriteTabStopVisible(el) && !stops.includes(el)) stops.push(el);
        };
        push(document.getElementById('defectLocation'));
        push(document.getElementById('defectComponentInput'));
        push(document.getElementById('defectTypeInput'));
        const measureGroup = document.getElementById('quickMeasureGroup');
        const measureVisible = measureGroup && isDefectHandwriteTabStopVisible(measureGroup);
        if (measureVisible) {
            const list = document.getElementById('defectCrackMeasureList');
            if (list) {
                list.querySelectorAll('input[type="text"], input:not([type])').forEach((inp) => push(inp));
            }
        }
        const causeGroup = document.getElementById('quickCauseGroup');
        if (!causeGroup || isDefectHandwriteTabStopVisible(causeGroup)) {
            push(document.getElementById('defectCauseInput'));
        }
        return stops;
    }

    function bindDefectHandwriteTabOrder() {
        const form = document.getElementById('defectForm');
        if (!form || form.dataset.handwriteTabBound === '1') return;
        form.dataset.handwriteTabBound = '1';
        form.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
            const stops = getDefectHandwriteTabStops();
            if (stops.length < 2) return;
            const active = document.activeElement;
            let idx = stops.indexOf(active);
            if (idx < 0) {
                // 칩/버튼에 있어도 수기 칸으로 점프 (DOM 순 다음 수기 칸). 끝에서는 네이티브 Tab 유지(랩 금지)
                if (!form.contains(active)) return;
                const all = Array.from(form.querySelectorAll('input, select, textarea, button, [tabindex]'));
                const aIdx = all.indexOf(active);
                if (aIdx < 0) return;
                if (e.shiftKey) {
                    for (let i = stops.length - 1; i >= 0; i -= 1) {
                        if (all.indexOf(stops[i]) < aIdx) {
                            e.preventDefault();
                            stops[i].focus();
                            return;
                        }
                    }
                    return;
                }
                for (let i = 0; i < stops.length; i += 1) {
                    if (all.indexOf(stops[i]) > aIdx) {
                        e.preventDefault();
                        stops[i].focus();
                        return;
                    }
                }
                return;
            }
            // 양 끝에서는 폼의 다음/이전 컨트롤(체크 등)로 네이티브 탭 유지 (랩 금지)
            if (!e.shiftKey && idx === stops.length - 1) return;
            if (e.shiftKey && idx === 0) return;
            e.preventDefault();
            const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
            const next = stops[nextIdx];
            // select() 호출 금지 — 한국어 IME 조합이 깨짐
            next.focus();
        }, true);
    }



    function syncCauseComboValue(joined) {
        const causeSelect = document.getElementById('defectCause');
        if (!causeSelect) return;
        const v = String(joined || '').trim();
        if (!v) {
            causeSelect.value = '';
            return;
        }
        ensureDefectComboOption(causeSelect, v);
    }

    /**
     * 발생 원인 → 이번 결함의 체크 선택에 합침 (선택 순 유지).
     * persist=false(기본): 원인 목록·칩(customDefectCauses)에는 저장하지 않는다 — 입력칸 Enter,
     *   셀렉트에서 기존 항목 고르기. 목록에 없는 수기 원인은 이번 결함에만 체크된 칩으로 보인다.
     * persist=true: 사용자가 명시적으로 '추가' 버튼 / '➕ 결함 원인 직접 추가'를 고른 경우만.
     * (2026-09-28 "발생원인에 엔터쳐서 입력하면 발생원인이 추가가 되버리던데" — 09-16 부재 명칭과 같은 처리)
     */
    function selectDefectCauseForCurrentDefect(rawText, persist) {
        const trimmed = String(rawText || '').trim();
        if (!trimmed) return false;
        const dType = getDefectComboValue(
            document.getElementById('defectType'),
            document.getElementById('defectTypeInput')
        ) || '';
        if (!dType || (typeof isGoodDefectType === 'function' ? isGoodDefectType(dType) : dType === '상태양호')) {
            if (typeof window.showToast === 'function') {
                window.showToast('결함 종류를 먼저 선택하세요.', 'info', 2000);
            }
            return false;
        }
        if (persist) {
            const key = getCauseDisplayGroups(dType)[0]?.key || getCauseKey(dType);
            if (!window.state.customDefectCauses) window.state.customDefectCauses = {};
            if (!window.state.customDefectCauses[key]) window.state.customDefectCauses[key] = [];
            if (!window.state.customDefectCauses[key].includes(trimmed)) {
                window.state.customDefectCauses[key].push(trimmed);
                const order = ensureOptionOrderEntry('defectCauseOrder', key);
                if (!order.includes(trimmed)) order.push(trimmed);
                if (typeof saveStateToLocalStorage === 'function') saveStateToLocalStorage();
            }
        }
        if (typeof isDefectBulkEditMode === 'function' && isDefectBulkEditMode()
            && typeof markDefectBulkFieldChanged === 'function') {
            markDefectBulkFieldChanged('cause');
        }
        const selected = getSelectedCausesFromUi().filter(c => c && c !== trimmed);
        selected.push(trimmed);
        const joined = joinCauseList(selected);
        updateDefectCauseDropdown(dType, joined);
        if (typeof scheduleDefectAutoApply === 'function') scheduleDefectAutoApply();
        return true;
    }

    /** 명시적 '원인 목록에 추가' (추가 버튼 · ➕ 직접 추가 프롬프트) */
    function addCustomDefectCause(rawText) {
        return selectDefectCauseForCurrentDefect(rawText, true);
    }

    /** persist=true는 '추가' 버튼만. Enter는 이번 결함 값만 확정(목록에 저장 안 함). */
    function commitDefectCauseDirectInput(persist) {
        const input = document.getElementById('defectCauseInput');
        if (!input) return;
        const parts = parseCauseList(input.value);
        if (!parts.length) return;
        let ok = false;
        parts.forEach((p) => {
            if (selectDefectCauseForCurrentDefect(p, persist === true)) ok = true;
        });
        if (ok) input.value = '';
    }

    function bindDefectCauseDirectInput() {
        const input = document.getElementById('defectCauseInput');
        const btn = document.getElementById('btnAddCustomCause');
        if (input && !input.dataset.causeDirectBound) {
            input.dataset.causeDirectBound = '1';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    // 토글 「프리셋에 저장」이면 목록에도 넣고, 기본·「이번만 사용」은 이번 결함만.
                    const persistTyped = !!(window.BSA && window.BSA.typedPresetMode
                        && typeof window.BSA.typedPresetMode.shouldPersist === 'function'
                        && window.BSA.typedPresetMode.shouldPersist());
                    commitDefectCauseDirectInput(persistTyped);
                }
            });
        }
        if (btn && !btn.dataset.causeDirectBound) {
            btn.dataset.causeDirectBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // '추가' 버튼 = 명시적으로 원인 목록에 저장 (다음 결함에도 칩으로 보임)
                commitDefectCauseDirectInput(true);
            });
        }
    }

    function populateDefectComponentDropdown(category, currentVal = null) {
        const select = document.getElementById('defectComponent');
        if (!select) return;
        const cat = knownDefectCategoryOrEmpty(category != null ? category : document.getElementById('defectCategory')?.value);
        if (!cat) {
            const keep = (currentVal !== null && currentVal !== undefined) ? currentVal : '';
            let html = `<option value="" ${!keep ? 'selected' : ''}>—</option>`;
            select.innerHTML = html;
            if (keep) {
                const customOpt = document.createElement('option');
                customOpt.value = keep;
                customOpt.textContent = keep;
                customOpt.selected = true;
                select.appendChild(customOpt);
            }
            syncDefectComboFields(select, document.getElementById('defectComponentInput'), keep);
            refreshDefectQuickPickBar();
            return;
        }

        migrateDefectComponentStateShape();
        if (!window.state.customDefectComponents) window.state.customDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.hiddenDefectComponents) window.state.hiddenDefectComponents = { '구조체': [], '비구조체': [], '마감재': [] };
        if (!window.state.customDefectComponents[cat]) window.state.customDefectComponents[cat] = [];
        if (!window.state.hiddenDefectComponents[cat]) window.state.hiddenDefectComponents[cat] = [];

        const hidden = window.state.hiddenDefectComponents[cat];
        const presetList = getDefectComponentPresetForCategory(cat).filter(c => !hidden.includes(c));
        const customList = window.state.customDefectComponents[cat];
        const ordered = applySavedOptionOrder(
            presetList.concat(customList.filter(item => !presetList.includes(item))),
            ensureOptionOrderEntry('defectComponentOrder', cat)
        );

        let html = `<option value="" ${!currentVal ? 'selected' : ''}>—</option>`;
        ordered.forEach(item => {
            const label = item === '기타' ? '기타 부재' : item;
            const sel = (currentVal && currentVal === item) ? 'selected' : '';
            html += `<option value="${item}" ${sel}>${label}</option>`;
        });

        html += `<option value="__ADD_CUSTOM_COMPONENT__">➕ [부재 직접 추가...]</option>`;
        select.innerHTML = html;

        if (currentVal && !ordered.includes(currentVal)) {
            const customOpt = document.createElement('option');
            customOpt.value = currentVal;
            customOpt.textContent = currentVal;
            customOpt.selected = true;
            select.insertBefore(customOpt, select.lastElementChild);
        }

        const resolved = (currentVal !== null && currentVal !== undefined)
            ? currentVal
            : (isDefectComboCustomToken(select.value) ? '' : select.value);
        syncDefectComboFields(select, document.getElementById('defectComponentInput'), resolved);
        refreshDefectQuickPickBar();
    }

