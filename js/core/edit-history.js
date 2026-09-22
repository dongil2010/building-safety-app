/**
 * 결함 수정 이력 — 같은 결함의 값이 시간에 따라 어떻게 변했는지 남긴다.
 *
 * 2026-09-22 사용자 확정: "수정이력은 그래도 있어야 돼 — 균열의 진전 여부를
 * 파악할 수 있으니까". 복구용이 아니다. PITR(7일)·주간 백업(90일)이 있어도
 * 이건 대체되지 않는다. **점검 데이터의 시간에 따른 변화 기록**이 목적이다.
 *
 * 균열 게이지 로그(crackGaugeLog)와는 다르다. 그쪽은 게이지를 설치한 균열에
 * 점검자가 회차마다 손으로 적는 정밀 측정이고, 이쪽은 아무 결함이나 값을
 * 고치기만 하면 저절로 쌓인다.
 *
 * 저장 위치는 결함 객체 안(`defect.editHistory`)이다. 따로 컬렉션을 두면 규칙·
 * 동기화 경로를 새로 만들어야 하는데, 결함에 붙여 두면 기존 동기화·스냅샷·
 * 복구가 전부 그대로 적용된다. 대신 층 문서 1MB 한도가 있으므로 개수를 막는다.
 *
 * 크기 감각: 한 건이 대략 70~150바이트, 결함당 최대 20건 → 약 2KB.
 *
 * 병합 주의: 기기마다 따로 쌓이므로 `Object.assign`으로 덮으면 다른 기기 이력이
 * 통째로 날아간다. sync-merge.js가 반드시 mergeHistories()로 합집합을 만든다.
 */
(function (root) {
    'use strict';

    /**
     * 변화를 남길 항목.
     * 균열 진전 판단에 쓰이는 값만 남긴다 — 전부 남기면 층 문서가 금방 커진다.
     */
    const TRACKED_FIELDS = [
        'crackWidth',
        'crackLength',
        'size',
        'defectType',
        'itemCount',
        'isProgress'
    ];

    /** 결함 하나가 들고 있을 수 있는 최대 이력 수 (1MB 한도 방어) */
    const MAX_ENTRIES = 20;

    const FIELD_LABELS = {
        crackWidth: '균열폭',
        crackLength: '균열길이',
        size: '크기',
        defectType: '결함',
        itemCount: '수량',
        isProgress: '진행성'
    };

    /** 빈 값의 표기를 하나로 맞춘다 — null/undefined/''를 같은 것으로 본다 */
    function normalizeValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Y' : 'N';
        return String(value).trim();
    }

    /**
     * 바뀐 항목만 뽑는다. 바뀐 게 없으면 null.
     * 형태: { crackWidth: ['0.2', '0.3'] }  (이전값, 이후값)
     */
    function diffTracked(before, after) {
        if (!before || !after) return null;
        const changes = {};
        let count = 0;
        TRACKED_FIELDS.forEach(function (field) {
            const a = normalizeValue(before[field]);
            const b = normalizeValue(after[field]);
            if (a === b) return;
            changes[field] = [a, b];
            count += 1;
        });
        return count ? changes : null;
    }

    /** 같은 이력인지 가리는 열쇠 — 기기 두 대의 이력을 합칠 때 중복을 걸러낸다 */
    function entryKey(entry) {
        if (!entry) return '';
        const changes = entry.changes || {};
        const parts = Object.keys(changes).sort().map(function (field) {
            const pair = changes[field] || [];
            return field + ':' + normalizeValue(pair[0]) + '>' + normalizeValue(pair[1]);
        });
        return String(entry.at || 0) + '|' + normalizeValue(entry.by) + '|' + parts.join(',');
    }

    function isValidEntry(entry) {
        return !!(entry && typeof entry === 'object'
            && Number(entry.at) > 0
            && entry.changes && typeof entry.changes === 'object'
            && Object.keys(entry.changes).length > 0);
    }

    /**
     * 개수를 한도 안으로 줄인다.
     *
     * 넘칠 때 **맨 처음 이력은 남긴다**. 거기에만 원래 값이 들어 있어서,
     * 그게 없으면 "처음엔 얼마였나"를 못 본다 — 진전 판단의 기준점이다.
     */
    function capEntries(entries, max) {
        const limit = Number(max) > 0 ? Number(max) : MAX_ENTRIES;
        if (entries.length <= limit) return entries;
        return [entries[0]].concat(entries.slice(entries.length - (limit - 1)));
    }

    function sortByTime(entries) {
        return entries.slice().sort(function (a, b) {
            const d = (Number(a.at) || 0) - (Number(b.at) || 0);
            if (d !== 0) return d;
            return entryKey(a) < entryKey(b) ? -1 : 1;
        });
    }

    /** 이력 배열을 안전하게 읽는다 (예전 데이터는 없을 수 있다) */
    function readHistory(defect) {
        const raw = defect && defect.editHistory;
        return Array.isArray(raw) ? raw.filter(isValidEntry) : [];
    }

    /**
     * 이력 한 건을 붙인 새 배열을 돌려준다.
     * 이미 같은 이력이 있으면 그대로 둔다 (저장 버튼 두 번 눌러도 안 늘어난다).
     */
    function appendEntry(history, entry) {
        if (!isValidEntry(entry)) return Array.isArray(history) ? history.slice() : [];
        const list = (Array.isArray(history) ? history : []).filter(isValidEntry);
        const key = entryKey(entry);
        if (list.some(function (e) { return entryKey(e) === key; })) return list;
        return capEntries(sortByTime(list.concat([entry])), MAX_ENTRIES);
    }

    /**
     * 기기 두 대의 이력을 합친다 — 합집합 후 중복 제거, 시각순 정렬, 한도 적용.
     *
     * 두 기기가 오프라인에서 각자 고쳤다면 양쪽 다 진짜 일어난 일이므로 둘 다 남긴다.
     * 한쪽을 고르면 안 된다.
     */
    function mergeHistories(a, b) {
        const all = (Array.isArray(a) ? a : []).concat(Array.isArray(b) ? b : []).filter(isValidEntry);
        if (!all.length) return [];
        const seen = Object.create(null);
        const unique = [];
        sortByTime(all).forEach(function (entry) {
            const key = entryKey(entry);
            if (seen[key]) return;
            seen[key] = true;
            unique.push(entry);
        });
        return capEntries(unique, MAX_ENTRIES);
    }

    /**
     * 화면에 뿌릴 한 줄 — "균열폭 0.2 → 0.3, 진행성 N → Y"
     * 빈 값은 '(없음)'으로 보여 준다. 빈칸으로 두면 뭐가 바뀐 건지 안 보인다.
     */
    function describeChanges(changes) {
        if (!changes) return '';
        return Object.keys(changes).map(function (field) {
            const pair = changes[field] || [];
            const label = FIELD_LABELS[field] || field;
            const from = normalizeValue(pair[0]) || '(없음)';
            const to = normalizeValue(pair[1]) || '(없음)';
            return label + ' ' + from + ' → ' + to;
        }).join(', ');
    }

    const api = {
        TRACKED_FIELDS: TRACKED_FIELDS,
        MAX_ENTRIES: MAX_ENTRIES,
        FIELD_LABELS: FIELD_LABELS,
        normalizeValue: normalizeValue,
        diffTracked: diffTracked,
        entryKey: entryKey,
        isValidEntry: isValidEntry,
        capEntries: capEntries,
        readHistory: readHistory,
        appendEntry: appendEntry,
        mergeHistories: mergeHistories,
        describeChanges: describeChanges
    };

    root.BSA = root.BSA || {};
    root.BSA.editHistory = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
