/**
 * 결함 통합(여러 마킹 → 번호칸 하나 + 화살표 여러 개) · 통합 해제
 *
 * 2026-09-28. 기존 「화살표 추가 + 번호 부여」 모델을 그대로 쓴다.
 *  - 가장 작은 번호 X의 마킹이 번호칸(그룹 대표). 나머지 마킹은 같은 groupId의 화살표가 되어
 *    번호칸(X 위치)에서 자기 원래 자리(targetX/Y)를 가리킨다.
 *  - 통합된 화살표는 「번호 부여」와 같이 surveyNumbered:true + 결함표 행(surveyExtra)을 하나씩 받는다
 *    → 조사표·한글·PDF·엑셀에 X-1(대표), X-2, X-3 … 행(원래 번호 순).
 *  - 결함 내용·사진은 옮기지 않고 원래 마킹(화살표)에 그대로 둔다. 결함표 행에는 mergeSourceId로
 *    원래 마킹을 가리키게 하고, 보고서 행은 원래 마킹의 내용·사진으로 만든다(사진 저장소는 결함 id 기준이라 옮기면 위험).
 *  - 원래 번호·위치는 mergedFrom에 남겨 두어 「통합 해제」로 되돌린다.
 *  - 다른 마킹 번호는 당기지 않는다(빈 번호는 새 마킹이 먼저 채우고, 「빈 칸 땡기기」로 정리 가능).
 */
(function (root) {
    'use strict';

    function mainNoOf(d) {
        const raw = String((d && (d.groupNo || d.no)) || '').replace(/^NO\.?\s*/i, '').replace(/-\d+$/, '').trim();
        const m = raw.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    }

    function isMergedArrow(d) {
        return !!(d && !d.surveyExtra && d.mergedFrom && typeof d.mergedFrom === 'object');
    }

    /** 통합으로 생긴 결함표 행 → 원래 마킹(없으면 null) */
    function findMergeSource(list, extra) {
        if (!extra || !extra.surveyExtra || !extra.mergeSourceId) return null;
        return (list || []).find((d) => d && d.id === extra.mergeSourceId && !d.surveyExtra && d.groupId === extra.groupId) || null;
    }

    /** 결함표 행이 연결된(보고서에 자기 행이 따로 나가는) 통합 화살표인가 */
    function hasLinkedMergeRow(list, arrow) {
        if (!isMergedArrow(arrow)) return false;
        return (list || []).some((e) => e && e.surveyExtra && e.mergeSourceId === arrow.id && e.groupId === arrow.groupId);
    }

    /** 선택 id → 마킹 단위(그룹은 하나) */
    function collectMergeUnits(list, selectedIds) {
        const arr = list || [];
        const ids = new Set(Array.from(selectedIds || []).map(String));
        const units = [];
        const seen = new Set();
        arr.forEach((d) => {
            if (!d || !ids.has(String(d.id)) || d.surveyExtra) return;
            const key = d.groupId ? `g:${d.groupId}` : `d:${d.id}`;
            if (seen.has(key)) return;
            seen.add(key);
            const members = d.groupId ? arr.filter((m) => m && m.groupId === d.groupId) : [d];
            const marking = members.filter((m) => !m.surveyExtra);
            units.push({ key, groupId: d.groupId || null, members, marking, main: mainNoOf(d), defect: d });
        });
        return units;
    }

    /**
     * 통합 가능 여부. 대표 = 가장 작은 번호(같으면 먼저 나온 것). 대표는 이미 화살표 여러 개인 그룹이어도 되고,
     * 나머지는 화살표 하나짜리 단독 마킹이어야 한다(여러 화살표 그룹을 쪼개 넣지 않음).
     */
    function planMerge(list, selectedIds) {
        const units = collectMergeUnits(list, selectedIds);
        if (units.length < 2) return { ok: false, reason: '통합하려면 마킹을 2개 이상 선택하세요.' };
        const numbered = units.filter((u) => u.main > 0);
        if (numbered.length !== units.length) return { ok: false, reason: '번호가 없는 마킹은 통합할 수 없습니다.' };
        const sorted = units.slice().sort((a, b) => a.main - b.main);
        const base = sorted[0];
        const others = sorted.slice(1);
        const bad = others.find((u) => u.members.length !== 1);
        if (bad) {
            return { ok: false, reason: `NO.${String(bad.main).padStart(2, '0')}은(는) 화살표가 여러 개이거나 결함표 행이 있어 다른 마킹에 넣을 수 없습니다. 가장 작은 번호 쪽으로만 합칠 수 있습니다.` };
        }
        const dupMain = others.find((u) => u.main === base.main);
        if (dupMain) return { ok: false, reason: '같은 번호의 마킹끼리는 통합할 수 없습니다.' };
        return { ok: true, base, others, baseMain: base.main };
    }

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }

    /**
     * 통합 실행(list를 바꿈). ops:
     *  - boxOf(baseUnit) → { x, y, groupId, groupNo } : 대표 번호칸 위치·그룹(대표에 그룹을 만들어 줌)
     *  - cloneExtra(src) → 새 결함표 행(surveyExtra, 그룹 번호 N-k는 앱이 매김) — 앱의 「번호 부여」와 같은 함수
     *  - areaAttach(boxX, boxY, d) → { x, y } | null : 영역 마킹 화살표 끝점
     *  - touch(d) : 수정 시각(동기화)
     *  - now() : 시각
     * 반환: { base, arrows:[...], extras:[...] }
     */
    function applyMerge(list, plan, ops) {
        const o = ops || {};
        const now = typeof o.now === 'function' ? o.now() : Date.now();
        const box = o.boxOf(plan.base);
        const arrows = [];
        const extras = [];
        plan.others.forEach((u, idx) => {
            const d = u.defect;
            const hadTarget = num(d.targetX) !== undefined && num(d.targetY) !== undefined;
            d.mergedFrom = {
                no: d.no || '',
                groupId: d.groupId || null,
                groupNo: d.groupNo || null,
                surveyNumbered: d.surveyNumbered === undefined ? null : d.surveyNumbered,
                x: num(d.x),
                y: num(d.y),
                targetX: hadTarget ? num(d.targetX) : null,
                targetY: hadTarget ? num(d.targetY) : null,
                order: idx + 1,
                at: now
            };
            const tipX = hadTarget ? num(d.targetX) : num(d.x);
            const tipY = hadTarget ? num(d.targetY) : num(d.y);
            d.groupId = box.groupId;
            d.groupNo = box.groupNo;
            d.no = box.groupNo;
            d.surveyNumbered = true;
            d.x = box.x;
            d.y = box.y;
            d.targetX = tipX;
            d.targetY = tipY;
            if (d.shapeType === 'area' && typeof o.areaAttach === 'function') {
                const at = o.areaAttach(box.x, box.y, d);
                if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
                    d.targetX = at.x;
                    d.targetY = at.y;
                }
            }
            if (typeof o.touch === 'function') o.touch(d);
            arrows.push(d);
        });
        arrows.forEach((d) => {
            const extra = o.cloneExtra(d);
            if (extra) {
                extra.mergeSourceId = d.id;
                extras.push(extra);
            }
        });
        return { base: plan.base.defect, arrows, extras };
    }

    /** 선택에 들어 있는 「통합된」 그룹 id들 */
    function mergedGroupIdsInSelection(list, selectedIds) {
        const out = [];
        collectMergeUnits(list, selectedIds).forEach((u) => {
            if (u.groupId && u.marking.some(isMergedArrow) && out.indexOf(u.groupId) === -1) out.push(u.groupId);
        });
        return out;
    }

    function planUnmerge(list, groupId) {
        const arr = list || [];
        const arrows = arr.filter((d) => d && d.groupId === groupId && isMergedArrow(d))
            .sort((a, b) => (a.mergedFrom.order || 0) - (b.mergedFrom.order || 0));
        if (!arrows.length) return { ok: false, reason: '통합된 마킹이 아닙니다.' };
        const pairs = arrows.map((a) => ({
            arrow: a,
            extras: arr.filter((e) => e && e.surveyExtra && e.groupId === groupId && e.mergeSourceId === a.id)
        }));
        const withPhotos = pairs.find((p) => p.extras.some((e) => (Array.isArray(e.photos) && e.photos.filter(Boolean).length)
            || (Array.isArray(e.photoIds) && e.photoIds.length)
            || (Array.isArray(e.prevRoundPhotos) && e.prevRoundPhotos.filter(Boolean).length)));
        if (withPhotos) {
            return { ok: false, reason: '통합 뒤 결함표 행에 따로 넣은 사진이 있어 통합 해제할 수 없습니다. 그 사진을 먼저 지워 주세요.' };
        }
        return { ok: true, groupId, pairs };
    }

    /** 쓰고 있는 본번호(그룹은 한 번). exclude: 계산에서 뺄 결함 id Set */
    function usedMainNumbers(list, exclude) {
        const used = new Set();
        const seenGroup = new Set();
        (list || []).forEach((d) => {
            if (!d || d.surveyExtra || (exclude && exclude.has(d.id))) return;
            if (d.groupId) {
                if (seenGroup.has(d.groupId)) return;
                seenGroup.add(d.groupId);
            }
            const m = mainNoOf(d);
            if (m > 0) used.add(m);
        });
        return used;
    }

    /**
     * 통합 해제(list를 바꿈). 원래 번호가 비어 있으면 그 번호, 아니면 가장 작은 빈 번호.
     * ops: formatNo(n), removeExtra(extra) : 목록에서 빼고 묘비, touch(d)
     * 반환: [{ id, no }]
     */
    function applyUnmerge(list, plan, ops) {
        const o = ops || {};
        const fmt = typeof o.formatNo === 'function' ? o.formatNo : (n) => `NO.${String(n).padStart(2, '0')}`;
        const exclude = new Set(plan.pairs.map((p) => p.arrow.id));
        const used = usedMainNumbers(list, exclude);
        const out = [];
        plan.pairs.forEach((p) => {
            const a = p.arrow;
            const mf = a.mergedFrom || {};
            p.extras.forEach((e) => { if (typeof o.removeExtra === 'function') o.removeExtra(e); });
            let n = mainNoOf({ no: mf.no });
            if (!(n > 0) || used.has(n)) {
                n = 1;
                while (used.has(n)) n += 1;
            }
            used.add(n);
            a.no = fmt(n);
            delete a.groupId;
            delete a.groupNo;
            if (mf.surveyNumbered === null || mf.surveyNumbered === undefined) delete a.surveyNumbered;
            else a.surveyNumbered = mf.surveyNumbered;
            if (Number.isFinite(mf.x)) a.x = mf.x;
            if (Number.isFinite(mf.y)) a.y = mf.y;
            if (Number.isFinite(mf.targetX) && Number.isFinite(mf.targetY)) {
                a.targetX = mf.targetX;
                a.targetY = mf.targetY;
            } else {
                delete a.targetX;
                delete a.targetY;
            }
            // delete 대신 null: 동기화 병합(Object.assign 옛값+새값)에서 옛 mergedFrom이 되살아나지 않게
            a.mergedFrom = null;
            if (typeof o.touch === 'function') o.touch(a);
            out.push({ id: a.id, no: a.no });
        });
        return out;
    }

    /**
     * 보고서 행: 통합으로 생긴 결함표 행(X-k)은 원래 마킹의 내용·사진으로 채운다(행 id = 원래 마킹 id).
     * 원래 마킹이 없어졌으면 null(→ 부르는 쪽이 결함표 행 그대로).
     */
    function mergedExtraReportRow(list, extra) {
        const src = findMergeSource(list, extra);
        if (!src) return null;
        return Object.assign({}, src, {
            no: extra.no,
            groupId: extra.groupId,
            groupNo: extra.groupNo,
            surveyExtra: true,
            _mergeExtraId: extra.id,
            _groupMemberIds: [src.id]
        });
    }

    const api = {
        mainNoOf,
        isMergedArrow,
        findMergeSource,
        hasLinkedMergeRow,
        collectMergeUnits,
        planMerge,
        applyMerge,
        mergedGroupIdsInSelection,
        planUnmerge,
        usedMainNumbers,
        applyUnmerge,
        mergedExtraReportRow
    };
    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.defectMerge = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
