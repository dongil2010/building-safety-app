/**
 * 결함 수정창 빠른 선택(부재 명칭 · 결함 종류 · 발생 원인) — 화면에 보일 칩 고르기, 즐겨찾기(★),
 * 사용 빈도, 결함 종류에 맞는 발생 원인 자동 체크. DOM 없이 순수 함수만 둔다(노드 테스트용).
 *
 * 2026-09-28 사용자 요청: "부재 명칭 결함 종류 발생원인 최적화 … 최대한 미니멀하게 …
 *   계정별로 맛도리 세팅 직접 설정 가능하고 결함 종류에 따른 발생원인도 척척 붙었으면 …
 *   터치 5번 이내로 결함 마킹이 끝나는 방식"
 *
 * 저장 위치: 이 값들은 app.js의 계정별 결함 핀 설정(defectPinPresets)에 같이 들어가
 *   users/{uid}.defectPinPresets(Firestore) + localStorage(building_safety_user_defect_pin_v1_{uid})에 저장된다.
 *   로그아웃·오프라인이면 기기 localStorage만 쓴다.
 */
(function (root) {
    'use strict';

    /** 한 줄에 먼저 보일 칩 수 (나머지는 「더보기」) */
    const VISIBLE_LIMIT = { component: 8, type: 8, cause: 8 };

    /**
     * 기본 즐겨찾기(★). 계정에서 한 번도 ★를 건드리지 않은 분류에만 쓴다.
     * 목록에 없는 이름은 무시되므로(부재별 종류 목록이 다름) 분류 단위로 넉넉히 적는다.
     * 결함 종류 문자열은 보고서가 쓰는 기존 라벨 그대로(백태/유출, 박리/박락 등) — 이름을 바꾸지 않는다.
     */
    const DEFAULT_FAVORITES = {
        component: {
            '구조체': ['기둥', '보', '슬래브', '벽체', '계단', '옹벽', '파라펫', '기초'],
            '비구조체': ['조적벽체', '칸막이벽', 'ALC벽', '벽체 접합부', '창호', '문', '난간', '중량물'],
            '마감재': ['외장타일', '도장', '내장도장', '천장 마감재', '바닥마감', '내장타일']
        },
        type: {
            '구조체': ['균열', '수직균열', '수평균열', '경사균열', '누수', '철근노출', '백태/유출', '박리/박락'],
            '비구조체': ['균열', '수직균열', '수평균열', '경사균열', '이격', '이격/파손', '파손', '파손/결손', '누수', '부식', '부식/녹', '줄눈 손상/탈락'],
            '마감재': ['균열', '들뜸/탈락', '박리/탈락', '들뜸', '변색/오염', '줄눈 손상', '파손']
        }
    };

    const USAGE_CAP_PER_BUCKET = 80;

    function str(v) {
        return String(v == null ? '' : v).trim();
    }

    function uniq(list) {
        const out = [];
        const seen = new Set();
        (list || []).forEach((v) => {
            const t = str(v);
            if (!t || seen.has(t)) return;
            seen.add(t);
            out.push(t);
        });
        return out;
    }

    /**
     * 계정의 즐겨찾기 목록. 계정이 그 분류의 ★를 저장한 적이 있으면(배열) 그대로,
     * 없으면 기본 즐겨찾기 + 계정이 직접 추가한 항목(이전 버전에서 추가한 커스텀 = 계속 보이게 이전).
     */
    function getEffectiveFavorites(favMap, field, bucket, customList, hiddenList) {
        const hidden = new Set((hiddenList || []).map(str));
        const saved = favMap && typeof favMap === 'object' ? favMap[bucket] : undefined;
        let list;
        if (Array.isArray(saved)) {
            list = saved;
        } else {
            const defaults = (DEFAULT_FAVORITES[field] && DEFAULT_FAVORITES[field][bucket]) || [];
            list = defaults.concat(customList || []);
        }
        return uniq(list).filter((v) => !hidden.has(v));
    }

    /** ★ 켜고 끄기 — 기본값을 쓰던 분류는 이때 계정 목록으로 굳힌다. 새 배열을 돌려준다. */
    function toggleFavorite(favMap, field, bucket, value, customList, hiddenList) {
        const v = str(value);
        const map = favMap && typeof favMap === 'object' ? favMap : {};
        const cur = getEffectiveFavorites(map, field, bucket, customList, hiddenList);
        const idx = cur.indexOf(v);
        if (idx >= 0) cur.splice(idx, 1);
        else if (v) cur.push(v);
        map[bucket] = cur;
        return map;
    }

    /** 칩을 고를 때마다 계정 사용 횟수 +1 (분류별 최대 80개, 적게 쓴 것부터 버림) */
    function recordUsage(usageMap, field, bucket, value) {
        const v = str(value);
        const map = usageMap && typeof usageMap === 'object' ? usageMap : {};
        if (!v || !field) return map;
        const b = str(bucket) || '_';
        if (!map[field] || typeof map[field] !== 'object') map[field] = {};
        if (!map[field][b] || typeof map[field][b] !== 'object') map[field][b] = {};
        const counts = map[field][b];
        counts[v] = (Number(counts[v]) || 0) + 1;
        const keys = Object.keys(counts);
        if (keys.length > USAGE_CAP_PER_BUCKET) {
            keys.sort((a, c) => (Number(counts[a]) || 0) - (Number(counts[c]) || 0));
            keys.slice(0, keys.length - USAGE_CAP_PER_BUCKET).forEach((k) => {
                if (k !== v) delete counts[k];
            });
        }
        return map;
    }

    function getUsageCounts(usageMap, field, bucket) {
        const b = str(bucket) || '_';
        const m = usageMap && usageMap[field] && usageMap[field][b];
        return m && typeof m === 'object' ? m : {};
    }

    /**
     * 화면에 먼저 보일 칩 / 「더보기」로 숨길 칩.
     * - pinned(예: 상태양호) · ★즐겨찾기 · 지금 선택된 값은 항상 보임
     * - 남은 자리는 이 계정이 많이 쓴 순(같으면 목록 순)으로 채움
     * - 보이는 칩의 순서는 pinned → ★ → 나머지, 각각 목록(계정 순서) 순 — 쓸 때마다 자리가 바뀌지 않게
     */
    function computeVisibleChips(ordered, opts) {
        const o = opts || {};
        const items = uniq(ordered);
        const limit = Number.isFinite(o.limit) ? o.limit : 8;
        const favSet = new Set((o.favorites || []).map(str));
        const pinSet = new Set((o.pinned || []).map(str));
        const selSet = new Set((o.selected || []).map(str));
        const counts = o.usage || {};
        const visible = new Set();
        items.forEach((v) => {
            if (pinSet.has(v) || favSet.has(v) || selSet.has(v)) visible.add(v);
        });
        const rest = items
            .map((v, i) => ({ v, i, n: Number(counts[v]) || 0 }))
            .filter((x) => !visible.has(x.v))
            .sort((a, b) => (b.n - a.n) || (a.i - b.i));
        for (let k = 0; k < rest.length && visible.size < limit; k++) visible.add(rest[k].v);
        const pinned = items.filter((v) => pinSet.has(v));
        const favs = items.filter((v) => visible.has(v) && !pinSet.has(v) && favSet.has(v));
        const others = items.filter((v) => visible.has(v) && !pinSet.has(v) && !favSet.has(v));
        const shown = pinned.concat(favs, others);
        const shownSet = new Set(shown);
        return { visible: shown, hidden: items.filter((v) => !shownSet.has(v)) };
    }

    /**
     * 결함 종류를 바꾼 뒤 발생 원인 체크.
     * - 사용자가 직접 고른 원인은 유지(새 종류 목록에 없어도), 자동으로 붙였던 원인은 새 목록에 없으면 뺌
     * - 남은 선택이 없고 자동 체크가 켜져 있으면: 첫 종류 그룹의 ★원인(없으면 맨 위 원인)을 체크
     * @param {object} p
     * @param {string[][]} p.groupOptions  종류 그룹별 원인 목록(계정 순서·숨김 반영, 표시 순)
     * @param {string[][]} [p.groupFavorites] 그룹별 ★원인
     * @param {string[]} p.selected 지금 체크된 원인
     * @param {string[]} [p.autoPicked] 직전에 자동으로 붙인 원인
     * @param {boolean} [p.autoCheck=true]
     * @returns {{selected:string[], autoPicked:string[]}}
     */
    function pickCausesAfterTypeChange(p) {
        const q = p || {};
        const groups = Array.isArray(q.groupOptions) ? q.groupOptions.map((g) => uniq(g)) : [];
        const all = new Set();
        groups.forEach((g) => g.forEach((c) => all.add(c)));
        const autoSet = new Set((q.autoPicked || []).map(str));
        const keep = uniq(q.selected).filter((c) => all.has(c) || !autoSet.has(c));
        const stillAuto = keep.filter((c) => autoSet.has(c));
        if (keep.length || q.autoCheck === false || !groups.length) {
            return { selected: keep, autoPicked: stillAuto };
        }
        const first = groups[0] || [];
        const favs = uniq((q.groupFavorites && q.groupFavorites[0]) || []).filter((c) => first.includes(c));
        let auto = favs.length ? favs : (first.length ? [first[0]] : []);
        auto = auto.filter((c) => c && c !== '기타');
        return { selected: auto.slice(), autoPicked: auto.slice() };
    }

    /**
     * 원인 체크박스를 사용자가 눌렀을 때. 자동으로 붙은 원인만 있는 상태에서 다른 원인을 켜면
     * 자동 원인을 빼고 바꿔 끼운다(틀린 기본값 고치는 데 한 번이면 됨). 그 뒤로는 평소처럼 복수 선택.
     */
    function applyManualCauseToggle(p) {
        const q = p || {};
        const value = str(q.value);
        const autoSet = new Set((q.autoPicked || []).map(str));
        let selected = uniq(q.selected);
        if (q.checked && value && !autoSet.has(value) && autoSet.size) {
            const onlyAuto = selected.filter((c) => c !== value).every((c) => autoSet.has(c));
            if (onlyAuto) selected = selected.filter((c) => !autoSet.has(c));
            if (!selected.includes(value)) selected.push(value);
        }
        return { selected, autoPicked: [] };
    }

    const api = {
        VISIBLE_LIMIT,
        DEFAULT_FAVORITES,
        getEffectiveFavorites,
        toggleFavorite,
        recordUsage,
        getUsageCounts,
        computeVisibleChips,
        pickCausesAfterTypeChange,
        applyManualCauseToggle
    };

    root.BSA = root.BSA || {};
    root.BSA.defectQuickPresets = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
