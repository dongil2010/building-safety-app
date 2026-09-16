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

    function compareMarkingForRepresentative(a, b) {
        return unnumberedSortRank(a) - unnumberedSortRank(b);
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
        compareMarkingForRepresentative,
        preferNumberedMarkingRepresentative,
        canAssignSurveyNumber,
        floatSlotLabel,
        shouldSkipOrphanUnnumberedInSurveyList
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.arrowSurveyNumber = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);