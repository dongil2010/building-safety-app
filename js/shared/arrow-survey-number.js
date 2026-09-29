/**
 * 화살표 마킹 vs 조사표 번호 부여
 *
 * 추가 화살표는 도면 도형으로 먼저 두고, 조사표 -1/-2 행은
 * 「번호 부여」를 눌렀을 때만 만든다. 기존(플래그 없음) 마킹은 번호 있음으로 본다.
 */
(function (root) {
    function isSurveyExtra(d) {
        return !!(d && d.surveyExtra);
    }

    function isUnnumberedArrowMarking(d) {
        return !!(d && !d.surveyExtra && d.surveyNumbered === false);
    }

    function isSurveyNumberedMarking(d) {
        if (!d || d.surveyExtra) return false;
        return d.surveyNumbered !== false;
    }

    function extraArrowCreateFields() {
        return { surveyNumbered: false };
    }

    function markingMembersOf(list, groupId) {
        return (list || []).filter((d) => d && !d.surveyExtra && d.groupId === groupId);
    }

    function unnumberedSortRank(d) {
        return isUnnumberedArrowMarking(d) ? 1 : 0;
    }

    /** 결함 통합으로 들어온 화살표(mergedFrom)는 원래 화살표 뒤, 통합 순서(원래 번호 순)대로 */
    function mergedSortRank(d) {
        return (d && !d.surveyExtra && d.mergedFrom && typeof d.mergedFrom === 'object') ? 1 : 0;
    }

    function compareMarkingForRepresentative(a, b) {
        const u = unnumberedSortRank(a) - unnumberedSortRank(b);
        if (u !== 0) return u;
        const m = mergedSortRank(a) - mergedSortRank(b);
        if (m !== 0) return m;
        if (mergedSortRank(a) && mergedSortRank(b)) {
            return (Number(a.mergedFrom.order) || 0) - (Number(b.mergedFrom.order) || 0);
        }
        return 0;
    }

    function preferNumberedMarkingRepresentative(members, tieBreak) {
        const list = (members || []).filter((m) => m && !m.surveyExtra);
        if (!list.length) return (members && members[0]) || null;
        const cmp = typeof tieBreak === 'function' ? tieBreak : null;
        return list.slice().sort((a, b) => {
            const u = compareMarkingForRepresentative(a, b);
            if (u !== 0) return u;
            return cmp ? cmp(a, b) : String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
        })[0];
    }

    function canAssignSurveyNumber(d, groupMarkingMembers) {
        if (!isUnnumberedArrowMarking(d)) return false;
        const members = (groupMarkingMembers || []).filter((m) => m && !m.surveyExtra);
        if (members.length <= 1) return false;
        const rep = preferNumberedMarkingRepresentative(members);
        if (rep && rep.id && d.id && rep.id === d.id) return false;
        return true;
    }

    function floatSlotLabel(mainNo, slot, formMember, extrasCount) {
        const n = slot > 0 ? slot : 1;
        if (isUnnumberedArrowMarking(formMember)) return `화살표 ${n}`;
        const extras = Number(extrasCount) || 0;
        if (extras > 0) return `${mainNo}-${n}`;
        if (n === 1) return String(mainNo);
        return `${mainNo}-${n}`;
    }

    /**
     * 공유 NO.박스를 누를 때 다음으로 고를 마킹(화살표). members는 대표 순 정렬된 마킹 목록.
     * 처음 누르면 대표(X-1), 다시 누르면 X-2, X-3 … 순환. 결함표 행(번호 부여·결함 통합)이 있어도 같다
     * (2026-09-28: 예전엔 결함표 행이 있으면 늘 대표로 돌아가 통합 마킹의 -2로 못 넘어갔다).
     * cycle: { groupId, lastId } (앞 클릭), selectedIds: 지금 선택 id Set
     */
    function nextGroupMemberOnBoxClick(members, groupId, cycle, selectedIds) {
        const list = (members || []).filter((m) => m && !m.surveyExtra);
        if (!list.length) return null;
        if (list.length === 1) return list[0];
        const st = cycle || {};
        let idx = 0;
        if (st.groupId === groupId && st.lastId) {
            const cur = list.findIndex((m) => m.id === st.lastId);
            idx = cur >= 0 ? (cur + 1) % list.length : 0;
        } else if (selectedIds && typeof selectedIds.has === 'function') {
            const sel = list.findIndex((m) => selectedIds.has(m.id));
            idx = sel >= 0 ? (sel + 1) % list.length : 0;
        }
        return list[idx] || list[0];
    }

    function idsOf(selectedIds) {
        if (!selectedIds) return [];
        if (typeof selectedIds.forEach === 'function' && !Array.isArray(selectedIds)) {
            const out = [];
            selectedIds.forEach((id) => out.push(id));
            return out;
        }
        return Array.isArray(selectedIds) ? selectedIds.slice() : [];
    }

    /**
     * 선택이 「마킹 하나(공유 NO.박스 묶음)」의 구성원뿐인가.
     * 결함 통합 직후·조사표에서 묶음 행을 눌렀을 때는 묶음 전체가 선택된다 — 이건 여러 마킹을
     * 고른 게 아니라 마킹 하나를 고른 것이다.
     */
    function isSelectionWithinMarkingGroup(list, groupId, selectedIds) {
        if (!groupId) return false;
        const ids = idsOf(selectedIds);
        if (!ids.length) return false;
        const byId = new Map();
        (list || []).forEach((d) => { if (d && d.id != null) byId.set(d.id, d); });
        return ids.every((id) => {
            const d = byId.get(id);
            return !!(d && d.groupId === groupId);
        });
    }

    /**
     * 도면에서 마킹을 끌 때 무엇을 움직이나.
     * 'GROUP' = 선택한 여러 마킹을 통째로(박스·화살표 끝·영역 모두), 그 밖엔 누른 부분(part) 그대로
     *  - BOX: 공유 번호칸만(묶음 모두 같은 자리로) — 화살표 끝·영역은 제자리, 화살표는 새 박스에서 다시 그림
     *  - TIP / AREA_MOVE: 그 결함 하나만
     * 2026-09-29: 결함 통합 뒤엔 묶음 전체가 선택돼 있어 NO.박스를 끌면 'GROUP'이 되어 통째로 움직였다.
     * 선택이 한 묶음 안뿐이면 여러 마킹 선택으로 보지 않는다.
     */
    function pinDragMode(hit, selectedIds, list) {
        const part = (hit && hit.part) || 'BOX';
        const d = hit && hit.defect;
        if (!d || d.id == null) return part;
        if (part === 'AREA_RESIZE' || part === 'AREA_ROTATE' || part === 'AREA_VERTEX') return part;
        const ids = idsOf(selectedIds);
        if (ids.length <= 1 || ids.indexOf(d.id) === -1) return part;
        if (d.groupId && isSelectionWithinMarkingGroup(list, d.groupId, ids)) return part;
        return 'GROUP';
    }

    /**
     * 화살표 끝(TIP)을 끌 때 번호칸도 같이 옮기나.
     * 혼자인 마킹: 예전처럼 박스+끝 함께(모양 유지). 박스를 나눠 쓰는 묶음(화살표 추가·번호 부여·결함 통합):
     * 끝만 — 박스를 옮기면 다른 결함 화살표까지 딸려 움직인다.
     */
    function tipDragMovesSharedBox(list, defect) {
        if (!defect || !defect.groupId) return true;
        return markingMembersOf(list, defect.groupId).length <= 1;
    }

    /** 그룹 없는 미번호 화살표는 조사표/좌측 목록에 단독 행으로 넣지 않는다. */
    function shouldSkipOrphanUnnumberedInSurveyList(d) {
        return isUnnumberedArrowMarking(d) && !d.groupId;
    }

    const api = {
        isSurveyExtra,
        isUnnumberedArrowMarking,
        isSurveyNumberedMarking,
        extraArrowCreateFields,
        markingMembersOf,
        unnumberedSortRank,
        mergedSortRank,
        compareMarkingForRepresentative,
        preferNumberedMarkingRepresentative,
        canAssignSurveyNumber,
        floatSlotLabel,
        nextGroupMemberOnBoxClick,
        isSelectionWithinMarkingGroup,
        pinDragMode,
        tipDragMovesSharedBox,
        shouldSkipOrphanUnnumberedInSurveyList
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.arrowSurveyNumber = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);