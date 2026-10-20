/**
 * 층 표시 이름 바꾸기 (2026-10-20)
 * - 층의 내부 키(floorCode)는 그대로 두고 floorsList[].floorLabel(표시 이름)만 바꾼다.
 *   → 도면·결함·사진·가이드·부재 수·메모·평가단위·표본층·도면 묘비·오프라인 캐시가 모두 floorCode에 묶여 그대로 붙어 있다.
 * - 이름 바꾼 시각은 건물의 floorLabelAt[floorCode]에 따로 둔다(floorsList를 다시 만드는 곳이 많아 층 항목에 두면 빠진다).
 *   동기화 병합 때 시각이 더 늦은 쪽 이름을 따른다. 기록이 없으면 예전처럼 병합 결과 그대로.
 */
(function (root) {
    'use strict';
    function asText(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
    function stripCodeSuffix(label) { return asText(label).replace(/\s*\([^()]*\)\s*$/, '').trim(); }
    function dupKey(label) { return stripCodeSuffix(label).toLowerCase(); }

    /** 표시용 이름 (floorsList → 없으면 코드) */
    function labelOf(bldg, code, lookup) {
        if (typeof lookup === 'function') {
            try { const v = lookup(code, bldg); if (v) return String(v); } catch (_e) { /* fall through */ }
        }
        const f = (bldg && Array.isArray(bldg.floorsList) ? bldg.floorsList : []).find((x) => x && String(x.floorCode) === String(code));
        return (f && f.floorLabel) || String(code || '');
    }

    /** 이름 검사. ok=false면 reason에 사용자 문구. codes: 이 동/회차의 층 코드 목록 */
    function validate(bldg, code, newLabel, codes, lookup) {
        const label = asText(newLabel);
        if (!label) return { ok: false, reason: '층 이름을 입력해 주세요.' };
        if (label.length > 40) return { ok: false, reason: '층 이름은 40자 이내로 입력해 주세요.' };
        const want = dupKey(label);
        const list = Array.isArray(codes) && codes.length ? codes
            : (bldg && Array.isArray(bldg.floorsList) ? bldg.floorsList.map((f) => f && f.floorCode) : []);
        for (const c of list) {
            if (!c || String(c) === String(code)) continue;
            if (dupKey(labelOf(bldg, c, lookup)) === want || dupKey(c) === want) {
                return { ok: false, reason: `같은 동·회차에 "${label}" 층이 이미 있습니다.` };
            }
        }
        return { ok: true, label };
    }

    /** 표시 이름만 바꾼다. 도면 묘비·층 목록 구성은 건드리지 않는다. */
    function rename(bldg, code, newLabel, opts) {
        opts = opts || {};
        const v = validate(bldg, code, newLabel, opts.codes, opts.lookup);
        if (!v.ok) return v;
        if (!Array.isArray(bldg.floorsList)) bldg.floorsList = [];
        let f = bldg.floorsList.find((x) => x && String(x.floorCode) === String(code));
        const prev = f ? asText(f.floorLabel) : '';
        if (prev === v.label) return { ok: true, label: v.label, changed: false };
        if (!f) { f = { floorCode: String(code), floorLabel: v.label }; bldg.floorsList.push(f); }
        else f.floorLabel = v.label;
        if (!bldg.floorLabelAt || typeof bldg.floorLabelAt !== 'object') bldg.floorLabelAt = {};
        const now = Number(opts.now) || Date.now();
        const before = Number(bldg.floorLabelAt[code]) || 0;
        bldg.floorLabelAt[code] = Math.max(now, before + 1);
        return { ok: true, label: v.label, changed: true, prev };
    }

    /**
     * 병합 후처리: merged.floorsList의 이름을 floorLabelAt이 더 늦은 쪽 이름으로 맞추고, floorLabelAt은 코드별 최댓값.
     * 층을 더하거나 빼지 않는다(묘비·층 목록 판단은 기존 병합 로직 몫).
     */
    function applyLabelMerge(merged, local, remote) {
        if (!merged) return merged;
        const la = (local && local.floorLabelAt) || {};
        const ra = (remote && remote.floorLabelAt) || {};
        const codes = new Set(Object.keys(la).concat(Object.keys(ra)));
        if (!codes.size) return merged;
        const find = (b, c) => (b && Array.isArray(b.floorsList) ? b.floorsList : []).find((x) => x && String(x.floorCode) === c);
        const at = {};
        codes.forEach((c) => {
            const l = Number(la[c]) || 0;
            const r = Number(ra[c]) || 0;
            at[c] = Math.max(l, r);
            const src = l >= r ? local : remote;
            const sf = find(src, c);
            const mf = find(merged, c);
            if (sf && mf && asText(sf.floorLabel)) mf.floorLabel = sf.floorLabel;
        });
        merged.floorLabelAt = at;
        return merged;
    }

    const api = { validate, rename, applyLabelMerge, stripCodeSuffix };
    root.BSA = root.BSA || {};
    root.BSA.floorRename = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
