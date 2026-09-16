/**
 * 캐드 핀 위치 ← 미표기(전차 미등록) 마킹 데이터
 *
 * 엑셀/한글로 가져온 전차 결함은 mapUnregistered 로 목록에만 있고 도면에 없다.
 * CAD 핀 가져오기는 그려진 위치만 만든다. 미표기가 있으면 그 조사내용을
 * 캐드 좌표에 쓰고, 빈 핀을 새로 만들지 않는다.
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
     * 1) 번호가 같은 캐드 핀에 미표기 결함을 붙인다.
     * 2) 남은 미표기는 남은 캐드 위치(번호 없는 박스 포함)에 순서대로 붙인다.
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

    const api = {
        normalizeCadNoKey,
        isUnlabeledCadItem,
        collectUnmarkedDefects,
        sortUnmarkedByNo,
        matchUnmarkedToCadItems,
        leftoverNumberedCad
    };

    root.BSA = root.BSA || { tabs: {}, shared: {} };
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.cadUnmarkedPlace = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
