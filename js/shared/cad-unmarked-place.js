/**
 * 캐드 핀 위치 ↔ 미표기(전차 미등록) 마킹 매칭
 *
 * 엑셀/한글로 조사내용만 넣은 뒤 mapUnregistered 로 목록에 두고 도면에 안 그림.
 * CAD 핀 가져오기로 그 번호에 위치를 붙인다. 미표기가 없어도 같은 번호의
 * 기존 조사내용(엑셀 임시배치 포함)에 캐드 좌표를 덮어쓸 수 있다.
 */
(function (root) {
    function normalizeCadNoKey(no) {
        const raw = String(no == null ? '' : no).replace(/^NO\.?\s*/i, '').trim();
        if (!raw) return '';
        const m = raw.match(/(\d+)(?:-(\d+))?/);
        if (!m) return raw.toLowerCase();
        const head = String(parseInt(m[1], 10));
        return m[2] ? (head + '-' + String(parseInt(m[2], 10))) : head;
    }

    function isUnlabeledCadItem(item) {
        return !String(item && item.no != null ? item.no : '').trim();
    }

    function collectUnmarkedDefects(list) {
        return (list || []).filter((d) => d && d.mapUnregistered);
    }

    function unmarkedSortKey(d) {
        return normalizeCadNoKey((d && (d.no || d.groupNo || d.cadNo)) || '');
    }

    function sortUnmarkedByNo(list) {
        return (list || []).slice().sort((a, b) => {
            const ka = unmarkedSortKey(a);
            const kb = unmarkedSortKey(b);
            const na = parseInt(String(ka).split('-')[0], 10);
            const nb = parseInt(String(kb).split('-')[0], 10);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            const sa = String(ka).split('-')[1];
            const sb = String(kb).split('-')[1];
            if (ka && kb && sa != null && sb != null && ka.split('-')[0] === kb.split('-')[0]) {
                return (parseInt(sa, 10) || 0) - (parseInt(sb, 10) || 0);
            }
            return String(ka).localeCompare(String(kb), 'ko');
        });
    }

    /**
     * 번호만으로 결함 ↔ 캐드 아이템 매칭 (순서 폴백 없음).
     * 엑셀 먼저→캐드 나중일 때 임시 좌표가 있어도 조사내용은 유지하고 위치만 옮긴다.
     */
    function matchNumberedDefectsToCadItems(defects, cadItems) {
        const unusedCad = (cadItems || []).slice();
        const unusedDefs = (defects || []).slice();
        const pairs = [];

        unusedDefs.slice().forEach((u) => {
            const uk = unmarkedSortKey(u);
            if (!uk) return;
            const ci = unusedCad.findIndex((c) => normalizeCadNoKey(c && c.no) === uk);
            if (ci === -1) return;
            pairs.push({ defect: u, cad: unusedCad[ci], how: 'number' });
            unusedCad.splice(ci, 1);
            const ui = unusedDefs.indexOf(u);
            if (ui !== -1) unusedDefs.splice(ui, 1);
        });

        return {
            pairs,
            leftoverCad: unusedCad,
            leftoverUnmarked: unusedDefs
        };
    }

    /**
     * 1) 번호가 같은 캐드 핀에 미표기를 먼저 붙인다.
     * 2) 남은 미표기는 남은 캐드 박스(번호 없는 박스 포함)에 번호순으로 붙인다.
     */
    function matchUnmarkedToCadItems(unmarked, cadItems) {
        const unusedCad = (cadItems || []).slice();
        const unusedUnmarked = sortUnmarkedByNo(unmarked);
        const pairs = [];

        unusedUnmarked.slice().forEach((u) => {
            const uk = unmarkedSortKey(u);
            if (!uk) return;
            const ci = unusedCad.findIndex((c) => normalizeCadNoKey(c && c.no) === uk);
            if (ci === -1) return;
            pairs.push({ defect: u, cad: unusedCad[ci], how: 'number' });
            unusedCad.splice(ci, 1);
            const ui = unusedUnmarked.indexOf(u);
            if (ui !== -1) unusedUnmarked.splice(ui, 1);
        });

        const n = Math.min(unusedUnmarked.length, unusedCad.length);
        for (let i = 0; i < n; i++) {
            pairs.push({ defect: unusedUnmarked[i], cad: unusedCad[i], how: 'order' });
        }
        unusedUnmarked.splice(0, n);
        unusedCad.splice(0, n);

        return {
            pairs,
            leftoverCad: unusedCad,
            leftoverUnmarked: unusedUnmarked
        };
    }

    function leftoverNumberedCad(cadItems) {
        return (cadItems || []).filter((c) => !isUnlabeledCadItem(c));
    }

    /** 엑셀 행 번호로 기존 핀 찾기 (NO.01 / 01 / 1 동일 취급) */
    function findDefectByNormalizedNo(list, noRaw) {
        const key = normalizeCadNoKey(noRaw);
        if (!key) return null;
        const candidates = (list || []).filter((d) => {
            if (!d || d.surveyExtra) return false;
            return normalizeCadNoKey(d.cadNo || d.groupNo || d.no) === key;
        });
        if (!candidates.length) return null;
        return candidates.find((d) => d.isCadImported)
            || candidates.find((d) => d.x !== undefined && d.y !== undefined)
            || candidates[0];
    }

    const api = {
        normalizeCadNoKey,
        isUnlabeledCadItem,
        collectUnmarkedDefects,
        sortUnmarkedByNo,
        matchUnmarkedToCadItems,
        matchNumberedDefectsToCadItems,
        leftoverNumberedCad,
        findDefectByNormalizedNo
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.cadUnmarkedPlace = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
