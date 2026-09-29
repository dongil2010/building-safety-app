/**
 * 오프라인 동시 작업으로 겹친 번호 자동 정리 (2026-09-29).
 *
 * 두 사람이 비행기모드로 같은 층을 작업하면 새 결함 번호를 **각자 기기 목록**으로 정해서
 * (getNextDefectMainNumber) 둘 다 NO.03을 쓴다. 동기화 병합은 CAD·수동 번호를 지키려고 번호를
 * 절대 다시 매기지 않으므로(renumberFloorDefects preserveOrder) 같은 번호가 두 줄로 남아
 * 상태조사표·한글 보고서까지 나갔다.
 *
 * 규칙 — 층 하나를 동기화할 때(서버 층 문서와 기기 목록을 합친 직후):
 *   - **서버에 아직 없는 것**(이 기기가 오프라인에서 새로 만든 것)만 바꾼다. 먼저 올린 사람의 번호는 그대로.
 *   - 서버에 있던 것·CAD에서 가져온 것(isCadImported)은 절대 안 바꾼다.
 *   - 겹치면 그 번호 공간의 가장 큰 번호 다음으로(빈 번호를 채우지 않는다 — 지운 번호와 헷갈리지 않게).
 *   - 결함은 마킹 묶음(groupId) 단위로 한 칸. 묶음 멤버·결함표 추가행(-1, -2)은 꼬리를 살려 같이 옮긴다.
 *   - 비파괴 항목은 분류(category)별, 부동침하·부재처짐 구역은 구역 분류별로 **건물 전체**가 한 번호 공간이다
 *     (새 번호를 매길 때도 건물 전체를 센다 — openNdtModal / 구역 번호).
 * 바꾼 기록은 { kind, from, to, ids }로 돌려주고, 부르는 쪽(app.js)이 사용자에게 알린다.
 */
(function (root) {
    'use strict';

    function mainOf(no) {
        const m = String(no == null ? '' : no).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    function suffixOf(no) {
        const m = String(no == null ? '' : no).match(/-(\d+)\s*$/);
        return m ? m[1] : '';
    }

    function formatNo(n) {
        return 'NO.' + String(Math.max(1, Number(n) || 1)).padStart(2, '0');
    }

    function stampNow(rec, now, content) {
        rec.updatedAt = now;
        if (content) rec.contentUpdatedAt = now;
        // 번호만 바꿨다 — 칸별 기록(fieldAt)은 그대로 맞다(sync-merge fieldTrackedThrough)
        if (content && rec.fieldAt) rec.fieldAtThrough = now;
    }

    /**
     * 결함 번호 칸 목록. 묶음(groupId)은 한 칸, 묶음 없는 결함은 결함마다 한 칸.
     * 묶음 없는 꼬리 번호(NO.03-1)는 본번호 결함에 딸린 것이라 칸으로 치지 않는다.
     */
    function defectUnits(defects, serverIds) {
        const units = new Map();
        (defects || []).forEach(function (d) {
            if (!d || !d.id) return;
            let key;
            let main;
            if (d.groupId) {
                key = 'g:' + d.groupId;
                main = mainOf(d.groupNo || d.no);
            } else {
                if (d.surveyExtra || suffixOf(d.no)) return;
                key = 'd:' + d.id;
                main = mainOf(d.no);
            }
            let u = units.get(key);
            if (!u) {
                u = { key: key, main: null, members: [], local: true, cad: false, firstId: String(d.id) };
                units.set(key, u);
            }
            u.members.push(d);
            if (u.main == null && main != null) u.main = main;
            if (serverIds && serverIds.has(d.id)) u.local = false;
            if (d.isCadImported) u.cad = true;
            if (String(d.id) < u.firstId) u.firstId = String(d.id);
        });
        return Array.from(units.values()).filter(function (u) { return u.main != null; });
    }

    /**
     * floorDefects: 방금 합친 이 층 결함 배열(제자리에서 고친다)
     * otherPoolDefects: 같은 번호 공간의 다른 층 결함(외부 입면 등) — 읽기만
     * serverIds: 서버 층 문서에 있던 결함 id(Set)
     */
    function resolveDefectNoConflicts(floorDefects, otherPoolDefects, serverIds, now) {
        const t = Number(now) || Date.now();
        const mine = defectUnits(floorDefects, serverIds);
        const others = defectUnits(otherPoolDefects, null);
        const taken = new Set();
        let max = 0;
        others.forEach(function (u) { taken.add(u.main); max = Math.max(max, u.main); });
        mine.forEach(function (u) {
            max = Math.max(max, u.main);
            if (!u.local || u.cad) taken.add(u.main);
        });
        const changes = [];
        mine.filter(function (u) { return u.local && !u.cad; })
            .sort(function (a, b) { return a.main - b.main || (a.firstId < b.firstId ? -1 : 1); })
            .forEach(function (u) {
                if (!taken.has(u.main)) { taken.add(u.main); return; }
                max += 1;
                const from = formatNo(u.main);
                const to = formatNo(max);
                u.members.forEach(function (m) {
                    const sfx = suffixOf(m.no);
                    m.no = sfx ? to + '-' + sfx : to;
                    if (m.groupId || m.groupNo) m.groupNo = to;
                    stampNow(m, t, true);
                });
                taken.add(max);
                changes.push({ kind: 'defect', from: from, to: to, ids: u.members.map(function (m) { return m.id; }) });
            });
        return changes;
    }

    /**
     * 비파괴 항목(field='no', 분류=category)·구역(field='groupNo', 분류=category||'변위') 공용.
     * floorRecs: 이 층 합친 배열(제자리), buildingOtherRecs: 건물의 다른 층 것(읽기만)
     */
    function resolveRecordNoConflicts(floorRecs, buildingOtherRecs, serverIds, opts) {
        const o = opts || {};
        const field = o.field || 'no';
        const catOf = o.categoryOf || function (r) { return r.category || ''; };
        const t = Number(o.now) || Date.now();
        const kind = o.kind || 'ndt';
        const changes = [];
        const byCat = new Map();
        function bucket(cat) {
            if (!byCat.has(cat)) byCat.set(cat, { taken: new Set(), max: 0, local: [] });
            return byCat.get(cat);
        }
        (buildingOtherRecs || []).forEach(function (r) {
            const n = r ? mainOf(r[field]) : null;
            if (n == null) return;
            const b = bucket(catOf(r));
            b.taken.add(n);
            b.max = Math.max(b.max, n);
        });
        (floorRecs || []).forEach(function (r) {
            const n = r && r.id ? mainOf(r[field]) : null;
            if (n == null) return;
            const b = bucket(catOf(r));
            b.max = Math.max(b.max, n);
            if (serverIds && serverIds.has(r.id)) b.taken.add(n);
            else b.local.push({ rec: r, n: n });
        });
        byCat.forEach(function (b, cat) {
            b.local.sort(function (x, y) { return x.n - y.n || (String(x.rec.id) < String(y.rec.id) ? -1 : 1); })
                .forEach(function (x) {
                    if (!b.taken.has(x.n)) { b.taken.add(x.n); return; }
                    b.max += 1;
                    const from = formatNo(x.n);
                    const to = formatNo(b.max);
                    x.rec[field] = to;
                    stampNow(x.rec, t, false);
                    b.taken.add(b.max);
                    changes.push({ kind: kind, category: cat, from: from, to: to, ids: [x.rec.id] });
                });
        });
        return changes;
    }

    /** 알림 글: "결함 NO.03→NO.07 · 강도 NO.02→NO.05" */
    function describeChanges(changes) {
        return (changes || []).map(function (c) {
            const label = c.kind === 'defect' ? '결함'
                : c.kind === 'group' ? ((c.category === '부재변위' ? '부재처짐' : '부동침하') + ' 구역')
                    : (c.category || '비파괴');
            return label + ' ' + c.from + '→' + c.to;
        }).join(' · ');
    }

    const api = {
        mainOf: mainOf,
        suffixOf: suffixOf,
        formatNo: formatNo,
        resolveDefectNoConflicts: resolveDefectNoConflicts,
        resolveRecordNoConflicts: resolveRecordNoConflicts,
        describeChanges: describeChanges
    };

    root.BSA = root.BSA || {};
    root.BSA.noConflict = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
