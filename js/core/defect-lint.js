/**
 * 결함 입력 확인 — 값은 들어 있는데 잘못 들어간 것으로 보이는 결함을 짚는다.
 *
 * data-health.js가 "비어 있는" 결함(껍데기 층, 빈 칸)을 잡는다면, 여기는 "채워졌지만 이상한" 입력을 본다.
 * 2026-10-08 광주교회 보고서를 만들다 나온 사례들이 출발점이다:
 *   - 블록벽체인데 구조체로 체크됨 → 한글 조사표의 구조/비구조 칸이 틀리게 나간다
 *   - 균열폭 50.1mm, 32.5mm → 다른 값을 폭 칸에 넣었다
 *   - 망상균열 범위 2.0×2.0을 「폭/길이」(2.0/2.0)로 넣음 → 균열폭 2.0mm로 집계된다
 *
 * 통계 집계는 이런 입력을 알아서 걸러 세지만(tabs/stats.js), 조사표와 한글 출력에는 입력한 그대로
 * 나가므로 사람이 고칠 수 있게 목록으로 보여준다. 여기는 판정만 하고 화면은 tabs/stats.js가 그린다.
 */
(function (root) {
    'use strict';

    /** 구조체 균열폭이 이 값(mm) 이상이면 입력을 다시 보게 한다 */
    const STRUCT_WIDTH_CHECK_MM = 5;
    /** 어떤 부재든 균열폭이 이 값(mm) 이상이면 다른 값을 넣은 것으로 본다 */
    const ANY_WIDTH_CHECK_MM = 30;
    /** 한 결함 안에서 가장 큰 폭이 가장 작은 폭의 이 배수 이상이면 다시 보게 한다 */
    const WIDTH_SPREAD_RATIO = 5;

    function textOf(v) {
        return v == null ? '' : String(v).trim();
    }

    function numbersIn(v) {
        return (textOf(v).match(/\d+(?:\.\d+)?/g) || []).map(Number);
    }

    function fmt(n) {
        return String(Math.round(n * 100) / 100);
    }

    /** 조적·ALC·블록·벽돌 벽체인가 (tabs/stats.js의 조적벽체 기준과 같게 둔다) */
    function isMasonryName(name) {
        const key = textOf(name).replace(/\s+/g, '');
        return /조적|ALC|블록|블럭|벽돌/i.test(key) && !/보도|점자|경계|포장|바닥/.test(key);
    }

    function isFinishName(name) {
        return /타일|마감재|천장재|도배|석고보드|몰딩|텍스/.test(textOf(name).replace(/\s+/g, ''));
    }

    function isGood(d) {
        return /상태\s*양호/.test(textOf(d && d.defectType));
    }

    function isCrack(d) {
        return /균열|이격/.test(textOf(d && d.defectType));
    }

    /** 구분이 비어 있으면 구조체로 나간다(조사표·통계 기본값) */
    function categoryOf(d) {
        return textOf(d && d.category) || '구조체';
    }

    function isAreaSegment(seg) {
        return /\d\s*[x×*]\s*\d/i.test(textOf(seg));
    }

    /**
     * 균열폭으로 읽히는 값들. 면적(가로×세로)으로 적은 측정 행은 뺀다.
     * @returns {Array<{width: number, length: number|null, text: string}>}
     */
    function widthEntries(d) {
        const out = [];
        const sizeSegs = textOf(d && d.size).split(/\s*,\s*/).filter(Boolean);
        const measures = d && Array.isArray(d.crackMeasures) ? d.crackMeasures.filter(Boolean) : [];
        if (measures.length) {
            measures.forEach(function (m, i) {
                const area = m.join === 'x'
                    || (m.join !== '/' && isAreaSegment(sizeSegs.length === measures.length ? sizeSegs[i] : sizeSegs.join(',')));
                if (area) return;
                const ws = numbersIn(m.width);
                if (!ws.length) return;
                const ls = numbersIn(m.length);
                out.push({
                    width: Math.max.apply(null, ws),
                    length: ls.length ? Math.max.apply(null, ls) : null,
                    text: textOf(m.width) + (textOf(m.length) ? '/' + textOf(m.length) : '')
                });
            });
            return out;
        }
        const parts = textOf(d && d.crackWidth).split(/\s*[\/,]\s*/).filter(Boolean);
        parts.forEach(function (part, i) {
            if (sizeSegs.length === parts.length && isAreaSegment(sizeSegs[i])) return;
            if (parts.length === 1 && sizeSegs.length === 1 && isAreaSegment(sizeSegs[0])) return;
            const ws = numbersIn(part);
            if (ws.length) out.push({ width: Math.max.apply(null, ws), length: null, text: part });
        });
        return out;
    }

    /**
     * 결함 한 건에서 다시 봐야 할 점들.
     * @returns {Array<{code: string, message: string}>} 없으면 빈 배열
     */
    function lintDefect(d) {
        const issues = [];
        if (!d || isGood(d)) return issues;
        const cat = categoryOf(d);
        const masonry = isMasonryName(d.component);
        const finish = isFinishName(d.component);

        if (cat === '구조체' && masonry) {
            issues.push({ code: 'masonry-structural', message: '조적·블록·ALC 벽체인데 구조체로 체크되어 있습니다. 비구조체로 바꿔 주세요.' });
        } else if (cat === '구조체' && finish) {
            issues.push({ code: 'finish-structural', message: '마감재인데 구조체로 체크되어 있습니다. 구분을 확인해 주세요.' });
        }

        if (!isCrack(d)) return issues;
        const entries = widthEntries(d);
        if (!entries.length) return issues;
        const widths = entries.map(function (e) { return e.width; });
        const max = Math.max.apply(null, widths);
        const min = Math.min.apply(null, widths);
        const structural = cat === '구조체' && !masonry && !finish;

        const mesh = /망상/.test(textOf(d.defectType));
        const meshAsLength = mesh && entries.some(function (e) { return e.width >= 1 && e.length != null && e.length > 0; });
        if (meshAsLength) {
            issues.push({ code: 'mesh-as-length', message: '망상균열의 범위가 「폭/길이」로 입력되어 있습니다. 측정 구분을 면적(×)으로 바꿔 주세요.' });
        } else if (max >= ANY_WIDTH_CHECK_MM) {
            issues.push({ code: 'width-too-large', message: '균열폭이 ' + fmt(max) + 'mm로 입력되어 있습니다. 다른 값을 폭 칸에 넣지 않았는지 확인해 주세요.' });
        } else if (structural && max >= STRUCT_WIDTH_CHECK_MM) {
            issues.push({ code: 'width-large-structural', message: '구조체 균열폭이 ' + fmt(max) + 'mm로 입력되어 있습니다. 맞는 값인지 확인해 주세요.' });
        } else if (entries.length >= 2 && min > 0 && max >= 1 && max >= min * WIDTH_SPREAD_RATIO) {
            issues.push({
                code: 'width-spread',
                message: '한 결함 안의 균열폭 차이가 큽니다(' + fmt(min) + 'mm ~ ' + fmt(max) + 'mm). 길이나 면적을 폭 칸에 넣지 않았는지 확인해 주세요.'
            });
        }
        return issues;
    }

    /** 결함 목록에서 다시 볼 것만 추린다 */
    function lintDefects(defects) {
        const out = [];
        (defects || []).forEach(function (d) {
            const issues = lintDefect(d);
            if (issues.length) out.push({ defect: d, issues: issues });
        });
        return out;
    }

    const api = {
        STRUCT_WIDTH_CHECK_MM: STRUCT_WIDTH_CHECK_MM,
        ANY_WIDTH_CHECK_MM: ANY_WIDTH_CHECK_MM,
        isMasonryName: isMasonryName,
        isFinishName: isFinishName,
        widthEntries: widthEntries,
        lintDefect: lintDefect,
        lintDefects: lintDefects
    };

    root.BSA = root.BSA || {};
    root.BSA.defectLint = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
