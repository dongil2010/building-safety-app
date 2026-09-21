/**
 * HWPX 상태조사표 내보내기 — 템플릿 슬롯 정리 헬퍼
 *
 * 정밀(1·2종): 1번 상태조사표가 제목 다음 문단에 있고 같은 문단에 여분 샘플 표가
 * 더 있다. 여분 문단을 통째로 지우면 keep 표까지 사라져 표본만 남는다.
 * 정기(1·2종): 제목 문단에 hp:secPr 이 들어 있어, 층 틀을 그대로 복제하면
 * 섹션 속성이 중복되어 한글이 파일을 열지 못한다.
 * 셀 긴 글자: 한글 음절 줄바꿈(CJK). 공백 없다고 한 줄로 몰면 Hangul Fit Text가
 * 자간·장평을 줄인다. ASCII 측정 토큰(Cw:0.15)은 쪼개지 않는다.
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

    function hwpxCharWidthUnits(ch) {
        // 반각·ASCII는 대략 절반 폭으로 잡아 넘어가는 위치를 맞춤
        if (/[\u0020-\u007E\uFF61-\uFF9F]/.test(ch)) return 0.55;
        return 1;
    }

    function isHwpxSpace(ch) {
        return ch === ' ' || ch === '\t';
    }

    function isHwpxHalfWidth(ch) {
        return /[\u0020-\u007E\uFF61-\uFF9F]/.test(ch);
    }

    function isHwpxAtomicAscii(ch) {
        return /[A-Za-z0-9:./xX*~〜+\-]/.test(ch);
    }

    function isHwpxDelimiter(ch) {
        return /[,|·、，]/.test(ch);
    }

    function isEaSuffixAt(chars, idx) {
        return /^-\d+\s*EA\b/i.test(chars.slice(idx).join(''));
    }

    function consumeAtomicAscii(chars, start) {
        let j = start;
        while (j < chars.length && isHwpxAtomicAscii(chars[j])) j++;
        return Math.max(j, start + 1);
    }

    /**
     * HWPX 셀: 측정값과 -nEA 갯수 접미사 사이를 문단 줄바꿈으로 나눔.
     * wrapHwpxCellText가 CR/LF를 공백으로 평탄화한 뒤에 호출해야 줄바꿈이 살아남는다.
     */
    function insertHwpxEaCountLineBreaks(raw) {
        return String(raw == null ? '' : raw)
            .replace(/([^\s\n])[ \t]*-(\d+)\s*EA\b/gi, '$1\n-$2EA');
    }

    /**
     * 칸 너비(전각 단위)를 넘는 위치부터 줄바꿈.
     * 한글은 음절 단위(CJK)로 개행하고, Cw:0.15 / 0.15/1.5 같은 ASCII 측정 토큰은 쪼개지 않는다.
     * 자연 끊김이 없다고 나머지를 한 줄로 몰아넣으면 한글이 Fit Text로 자간·장평을 줄인다.
     */
    function wrapHwpxCellLine(line, maxChars) {
        const s = String(line == null ? '' : line);
        const chars = Array.from(s);
        if (!chars.length) return '';
        const maxUnits = Math.max(4, Number(maxChars) || 16);
        const lines = [];
        let i = 0;
        while (i < chars.length) {
            while (i < chars.length && isHwpxSpace(chars[i])) i++;
            if (i >= chars.length) break;
            let units = 0;
            let end = i;
            let lastBreak = -1;
            while (end < chars.length) {
                const ch = chars[end];
                const w = hwpxCharWidthUnits(ch);
                if (units + w > maxUnits && end > i) break;
                units += w;
                end++;
                if (isHwpxSpace(ch)) {
                    if (!isEaSuffixAt(chars, end)) lastBreak = end;
                } else if (isHwpxDelimiter(ch)) {
                    lastBreak = end;
                } else if (!isHwpxHalfWidth(ch)) {
                    lastBreak = end;
                }
            }
            if (end >= chars.length) {
                lines.push(chars.slice(i).join(''));
                break;
            }
            let cut = lastBreak;
            if (!(cut > i)) {
                cut = consumeAtomicAscii(chars, i);
            }
            if (cut > i && isHwpxSpace(chars[cut - 1])) {
                lines.push(chars.slice(i, cut - 1).join(''));
                i = cut;
            } else {
                lines.push(chars.slice(i, cut).join(''));
                i = cut;
            }
            if (!lines[lines.length - 1]) lines.pop();
        }
        return lines.length ? lines.join('\n') : s;
    }

    function wrapHwpxCellText(raw, maxChars, normalizeFn) {
        let s = String(raw == null ? '' : raw);
        if (typeof normalizeFn === 'function') s = String(normalizeFn(s));
        const flat = s.replace(/\r\n|\r|\n/g, ' ').replace(/[ \t]{2,}/g, ' ');
        return insertHwpxEaCountLineBreaks(flat)
            .split('\n')
            .map((line) => wrapHwpxCellLine(line, maxChars))
            .join('\n');
    }

    const api = {
        HP_NS,
        isPreciseInspectionForHwpx,
        owningPara,
        stripExcessStampStatusTables,
        stripSecPrRunsFromClonedParas,
        hwpxCharWidthUnits,
        insertHwpxEaCountLineBreaks,
        wrapHwpxCellLine,
        wrapHwpxCellText
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.hwpxSurveySlots = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
