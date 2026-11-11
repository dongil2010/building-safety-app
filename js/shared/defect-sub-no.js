/**
 * 결함 하위번호 직접 입력 (2026-11-11)
 *
 * 기둥 하나에 균열을 여러 개 잡을 때 번호칸을 따로 두고 NO.74-1, 74-2, 74-3 … 으로 쓰고 싶다(사용자).
 * 지금까지는 「결함 통합」(번호칸 하나 + 화살표 여러 개)으로만 하위번호가 생겼고, 결함 번호 입력칸은 숨겨져 있었다.
 *
 * 모델:
 *  - 마킹(결함표 추가행이 아닌 것)의 no를 'NO.74-2'처럼 바꾸고 noManual:true 를 남긴다. groupId는 붙이지 않는다
 *    (번호칸은 각자 자기 자리에 그대로).
 *  - noManual 표시가 있어야 하는 까닭: 앱에는 「groupId 없이 꼬리 번호가 붙은 마킹」을 예전 데이터 고장으로 보고
 *    자동으로 묶거나(repairLegacyMarkingSuffixGroups) 혼자 남은 -1을 떼는(normalizeAllDefectGroupNos) 정리가 있다.
 *    noManual 마킹은 그 정리에서 빠진다.
 *  - 묶인 결함(통합·결함표 추가로 groupId가 있는 것)은 하위번호를 줄 수 없고 본번호만 바꿀 수 있다(묶음째 이동).
 *  - 통계: 같은 본번호의 하위번호 마킹(74, 74-1, 74-2 …)은 한 개소 — 균열은 가장 넓은 것 하나만 센다
 *    (js/tabs/stats.js collapseGroupedCrackRows, statsUnitKey).
 */
(function (root) {
    'use strict';

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function formatNo(main, suffix) {
        return 'NO.' + pad2(main) + (suffix ? '-' + suffix : '');
    }

    /** 'NO.74-2' / '74-2' / 'no 74' / '７４－２' → { main:74, suffix:2 } (suffix 없으면 0). 형식이 틀리면 null */
    function parseInput(raw) {
        var t = String(raw == null ? '' : raw)
            .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[－‐–—_]/g, '-')
            .replace(/\s+/g, '')
            .replace(/^no\.?/i, '');
        var m = t.match(/^(\d{1,4})(?:-(\d{1,3}))?$/);
        if (!m) return null;
        var main = parseInt(m[1], 10);
        var suffix = m[2] != null ? parseInt(m[2], 10) : 0;
        if (!(main > 0)) return null;
        if (m[2] != null && !(suffix > 0)) return null;
        return { main: main, suffix: suffix };
    }

    function partsOf(no) {
        var m = String(no == null ? '' : no).replace(/^NO\.?\s*/i, '').trim().match(/(\d+)(?:-(\d+))?/);
        return m ? { main: parseInt(m[1], 10), suffix: m[2] ? parseInt(m[2], 10) : 0 } : null;
    }

    /** 사용자가 직접 하위번호를 준 단독 마킹인가 */
    function isManualSubNo(d) {
        if (!d || !d.noManual || d.groupId || d.surveyExtra) return false;
        var p = partsOf(d.no);
        return !!(p && p.suffix > 0);
    }

    /**
     * 번호 바꾸기 계획.
     *  pool: 같은 번호 공간의 결함 전부(층, 외부는 외부 도면 전체) — 대상 포함
     *  target: 바꿀 마킹
     *  input: 사용자가 친 글자
     * 반환 { ok, reason } 또는 { ok:true, no, main, suffix, members:[...], unchanged }
     *  members: 같이 번호가 바뀌는 결함(묶음이면 묶음 전체, 아니면 target 하나)
     */
    function planRenumber(pool, target, input) {
        var list = (pool || []).filter(Boolean);
        if (!target || target.surveyExtra) return { ok: false, reason: '결함표 추가 행은 번호를 따로 바꿀 수 없습니다. 마킹(번호칸)을 열어 바꾸세요.' };
        var p = parseInput(input);
        if (!p) return { ok: false, reason: '번호 형식이 맞지 않습니다. 예: 74 또는 74-2' };
        var gid = target.groupId || null;
        var members = gid ? list.filter(function (d) { return d.groupId === gid; }) : [target];
        if (gid && members.length > 1 && p.suffix) {
            return { ok: false, reason: '묶인 결함(통합·결함표 추가)은 하위번호를 줄 수 없습니다. 본번호만 바꾸거나 먼저 통합 해제하세요.' };
        }
        var others = list.filter(function (d) { return members.indexOf(d) < 0; });
        var newNo = formatNo(p.main, p.suffix);
        var cur = partsOf(target.groupNo || target.no);
        var curNo = cur ? formatNo(cur.main, target.groupId ? 0 : cur.suffix) : '';
        if (curNo === newNo) return { ok: true, unchanged: true, no: newNo, main: p.main, suffix: p.suffix, members: members };

        var clash = null;
        others.some(function (d) {
            if (d.surveyExtra) {
                // 결함표 추가 행은 묶음 번호(본번호)를 쓴다
                var ep = partsOf(d.groupNo || d.no);
                if (ep && ep.main === p.main) { clash = { d: d, why: 'group' }; return true; }
                return false;
            }
            var op = partsOf(d.groupId ? (d.groupNo || d.no) : d.no);
            if (!op || op.main !== p.main) return false;
            if (d.groupId) { clash = { d: d, why: 'group' }; return true; }
            if (op.suffix === p.suffix) { clash = { d: d, why: 'same' }; return true; }
            // 하위번호 없는 본번호(74)로 바꾸려는데 같은 본번호가 이미 있다
            if (!p.suffix && !op.suffix) { clash = { d: d, why: 'same' }; return true; }
            return false;
        });
        if (clash) {
            var shown = 'NO.' + pad2(p.main);
            if (clash.why === 'group') {
                return { ok: false, reason: shown + '은(는) 묶인 결함(통합·결함표 추가)의 번호입니다. 다른 번호를 쓰거나 그 묶음을 먼저 풀어 주세요.' };
            }
            return { ok: false, reason: newNo + '은(는) 이미 있는 번호입니다.' };
        }
        if (gid && members.length > 1) {
            // 묶음 본번호만 옮김: 같은 본번호의 단독 마킹·하위번호가 있으면 안 된다(위 clash에서 걸러짐)
            return { ok: true, no: formatNo(p.main, 0), main: p.main, suffix: 0, members: members, group: true };
        }
        // 2026-11-11 사용자: 하위번호가 생기면 원래 있던 본번호(NO.74)도 바로 74-1이 된다(74로 남지 않게).
        // 새로 붙이는 쪽에 74-1을 치면 원래 74가 74-1을 갖고 새 쪽은 다음 빈 하위번호.
        var extra = [];
        var suffix = p.suffix;
        if (suffix) {
            var plain = null;
            var used = new Set();
            others.forEach(function (d) {
                if (d.groupId || d.surveyExtra) return;
                var op = partsOf(d.no);
                if (!op || op.main !== p.main) return;
                if (op.suffix) used.add(op.suffix);
                else if (!plain) plain = d;
            });
            if (plain) {
                var nextFree = function (avoid) {
                    var n = 1;
                    while (used.has(n) || n === avoid) n += 1;
                    return n;
                };
                var plainSuffix = used.has(1) ? nextFree(suffix) : 1;
                if (plainSuffix === suffix) suffix = nextFree(plainSuffix);
                used.add(plainSuffix);
                extra.push({ d: plain, no: formatNo(p.main, plainSuffix), from: plain.no });
            }
        }
        var finalNo = formatNo(p.main, suffix);
        return {
            ok: true, no: finalNo, main: p.main, suffix: suffix, members: members, group: false,
            extra: extra, shifted: suffix !== p.suffix
        };
    }

    /**
     * 계획 적용(결함을 제자리에서 고침). groupNumbering(members, base, assign) 은 앱의 applyDefectGroupNumbering.
     * stamp(d, groupNoChanged) 는 앱의 stampDefectNumberChanged. 반환: 번호가 바뀐 결함 배열.
     */
    function applyRenumber(plan, ops) {
        if (!plan || !plan.ok || plan.unchanged) return [];
        var o = ops || {};
        var stamp = typeof o.stamp === 'function' ? o.stamp : function () {};
        var changed = [];
        if (plan.group) {
            var base = plan.no;
            plan.members.forEach(function (m) {
                var prevG = String(m.groupNo || '');
                m.groupNo = base;
                if (prevG !== base) stamp(m, true);
            });
            var assign = function (m, nextNo) {
                var prev = String(m.no || '');
                m.no = nextNo;
                if (m.isCadImported) m.cadNo = nextNo;
                delete m.noManual;
                if (prev !== String(nextNo || '')) stamp(m, false);
                if (changed.indexOf(m) < 0) changed.push(m);
            };
            if (typeof o.groupNumbering === 'function') o.groupNumbering(plan.members, base, assign);
            else plan.members.forEach(function (m) { assign(m, base); });
            return changed;
        }
        var d = plan.members[0];
        var hadGroupNo = !!d.groupNo;
        d.no = plan.no;
        if (d.groupNo) delete d.groupNo;
        if (d.isCadImported) d.cadNo = plan.no;
        if (plan.suffix) d.noManual = true;
        else delete d.noManual;
        stamp(d, hadGroupNo);
        changed.push(d);
        // 원래 본번호(74) → 74-1
        (plan.extra || []).forEach(function (x) {
            var e = x.d;
            var hadG = !!e.groupNo;
            e.no = x.no;
            if (e.groupNo) delete e.groupNo;
            if (e.isCadImported) e.cadNo = x.no;
            e.noManual = true;
            stamp(e, hadG);
            changed.push(e);
        });
        return changed;
    }

    /**
     * 통계 한 개소 열쇠. 묶음은 groupId, 하위번호를 쓴 단독 마킹은 같은 본번호끼리('sub:74').
     * subMains: 그 층에 하위번호 마킹이 있는 본번호 Set — 하위번호 없는 74도 74-1이 있으면 같이 묶는다.
     */
    function subMainsOf(rows) {
        var out = new Set();
        (rows || []).forEach(function (d) {
            if (!isManualSubNo(d)) return;
            var p = partsOf(d.no);
            if (p) out.add(p.main);
        });
        return out;
    }

    function statsUnitKey(d, subMains) {
        if (!d) return null;
        if (d.groupId) return 'g:' + d.groupId;
        if (d.surveyExtra) return null;
        var p = partsOf(d.no);
        if (!p) return null;
        if (isManualSubNo(d) || (subMains && subMains.has(p.main) && !p.suffix)) return 'sub:' + p.main;
        return null;
    }

    var api = {
        parseInput: parseInput,
        formatNo: formatNo,
        isManualSubNo: isManualSubNo,
        planRenumber: planRenumber,
        applyRenumber: applyRenumber,
        subMainsOf: subMainsOf,
        statsUnitKey: statsUnitKey
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.BSA = root.BSA || {};
    root.BSA.shared = root.BSA.shared || {};
    root.BSA.shared.defectSubNo = api;
})(typeof window !== 'undefined' ? window : globalThis);
