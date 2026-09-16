/**
 * HWPX 상태조사표 내보내기 — 템플릿 슬롯 정리 헬퍼
 *
 * 정밀(1·2종): 1번 상태조사표가 제목 다음 문단에 있고 같은 문단에 여분 샘플 표가
 * 더 있다. 여분 문단을 통째로 지우면 keep 표까지 사라져 표본만 남는다.
 * 정기(1·2종): 제목 문단에 hp:secPr 이 들어 있어, 층 틀을 그대로 복제하면
 * 섹션 속성이 중복되어 한글이 파일을 열지 못한다.
 */
(function (root) {
    const HP_NS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

    function isPreciseInspectionForHwpx(inspectionType) {
        const t = inspectionType || '정밀안전점검';
        return t !== '정기안전점검';
    }

    function owningPara(node) {
        let p = node;
        while (p && p.localName !== 'p') p = p.parentNode;
        return p;
    }

    function stripExcessStampStatusTables(stampSlot) {
        if (!stampSlot || !stampSlot.statusTbls || stampSlot.statusTbls.length <= 1) return stampSlot;
        const titlePara = stampSlot.titlePara;
        const keep = stampSlot.statusTbls[0];
        const keepPara = owningPara(keep);
        stampSlot.statusTbls.slice(1).forEach((tbl) => {
            if (!tbl || !tbl.parentNode) return;
            const p = owningPara(tbl);
            // keep 표가 들어 있는 문단(제목 문단 포함)은 통째로 지우지 않고 여분 표만 떼낸다.
            if (p && ((keepPara && p === keepPara) || (titlePara && p === titlePara))) {
                tbl.parentNode.removeChild(tbl);
                return;
            }
            if (p && p.parentNode) p.parentNode.removeChild(p);
            else if (tbl.parentNode) tbl.parentNode.removeChild(tbl);
        });
        stampSlot.statusTbls = (keep && keep.parentNode)
            ? [keep]
            : stampSlot.statusTbls.filter((t) => t && t.parentNode).slice(0, 1);
        return stampSlot;
    }

    function stripSecPrRunsFromClonedParas(paragraphs, hpNs) {
        const ns = hpNs || HP_NS;
        if (!paragraphs) return;
        Array.from(paragraphs).forEach((p) => {
            if (!p || !p.childNodes) return;
            Array.from(p.childNodes).forEach((ch) => {
                if (!ch || ch.nodeType !== 1) return;
                if (ch.localName !== 'run') return;
                const hasSecPr = ch.getElementsByTagNameNS(ns, 'secPr').length > 0;
                const hasTbl = ch.getElementsByTagNameNS(ns, 'tbl').length > 0;
                const hasPic = ch.getElementsByTagNameNS(ns, 'pic').length > 0;
                if (hasSecPr && !hasTbl && !hasPic && ch.parentNode) {
                    ch.parentNode.removeChild(ch);
                }
            });
        });
    }

    const api = {
        HP_NS,
        isPreciseInspectionForHwpx,
        owningPara,
        stripExcessStampStatusTables,
        stripSecPrRunsFromClonedParas
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxSurveySlots = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
