/**
 * 회사 결함표 용어 맞추기 (2026-10-30, 회사 엑셀 173개 · 38,980행 분석 기준).
 *
 * 회사 결함표는 「부재명칭」에 결함이 난 자리(벽체·상부 보·바닥·부재)를 쓰고,
 * 「조사내용」에 대상(타일·뿜칠·천장 마감재·환기창 …) + 결함(파손·들뜸·균열 …)을 붙여 쓴다.
 * 앱은 부재 칸에 대상까지(벽체 타일·보 뿜칠·천장 마감재), 결함 칸에는 결함만 둔다.
 *
 *   splitSurveyContent('타일 파손')      → { target: '타일', defect: '파손' }
 *   convertImportRow({ component: '벽체', defectType: '타일 파손', category: '마감재' })
 *                                         → { component: '벽체 타일', defectType: '파손', … }
 *   normalizeCause('시공 미흡, 경과 년 수 증대에 따른 노후화')
 *                                         → '시공미흡, 경과년수 증대에 따른 노후화'
 *
 * 가져오기(엑셀) 때만 쓴다. 저장된 결함은 고쳐 쓰지 않는다(예전 이름도 그대로 보이고 동작).
 * 구조체 행은 건드리지 않는다(원인 표기 통일만).
 */
(function (root) {
    'use strict';

    // 결함 낱말(긴 것부터). 앞에 방향(수직·수평·경사·망상)이 붙으면 같이 결함으로 본다.
    const DEFECT_WORDS = [
        '상태 양호', '상태양호', '양호',
        '철근노출', '철근 노출', '유리파손', '유리 파손', '누수흔적', '누수 흔적', '도장열화', '도장 열화',
        '재균열', '이격균열', '균열', '갈라짐', '들뜸', '탈락', '박락', '박리', '파손', '결손', '오염', '변색',
        '처짐', '누수', '부식', '녹', '변형', '이격', '열화', '백태', '물고임', '마모', '작동불량', '개폐불량'
    ];
    const DIR_RE = '(?:(?:수직|수평|경사|망상|U자형)(?:\\s*[·ㆍ,]\\s*|\\s*및\\s*|\\s+)?)*';
    const DEFECT_RE = new RegExp(DIR_RE + '(?:' + DEFECT_WORDS.slice().sort((a, b) => b.length - a.length)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*')).join('|') + ')');

    // 조사내용 앞부분이 이것이면 부재가 아니라 결함 설명의 일부 — 쪼개지 않는다
    const NOT_TARGET = ['보수부위', '보수 부위', '기존', '미세', '경미한', '부분'];

    // 그 자체로 부재 이름인 마감 대상(바탕 부재를 앞에 붙이지 않음)
    const STANDALONE_FINISH = ['천장 마감재', '천장마감재', '외벽 마감재', '외부 마감재', '지붕 마감재', '천장'];
    // 바탕 부재 이름 — 조사내용 앞부분에 이게 들어 있으면 그 앞부분만으로 충분히 구체적
    const HOST_WORDS = ['기둥', '보', '슬래브', '벽체', '바닥', '접합부', '계단', '옹벽', '파라펫', '데크'];
    // 부재명칭이 이것뿐이면 바탕 부재를 모르는 것
    const VAGUE_HOSTS = ['', '부재', '기타', '-', '부대시설'];

    function compact(s) { return String(s == null ? '' : s).replace(/[\s\u3000]+/g, ''); }
    function tidy(s) {
        return String(s == null ? '' : s).replace(/[\s\u3000]+/g, ' ')
            .replace(/^[\s\-·ㆍ,;:]+|[\s\-·ㆍ,;:]+$/g, '').trim();
    }

    function normalizeDefect(d) {
        let t = tidy(d);
        if (/^(상태\s*)?양호$/.test(t)) return '상태양호';
        t = t.replace(/상태\s+양호/g, '상태양호').replace(/철근\s+노출/g, '철근노출')
            .replace(/누수\s+흔적/g, '누수흔적').replace(/유리\s+파손/g, '유리파손').replace(/도장\s+열화/g, '도장열화');
        return t;
    }

    /** 조사내용 → { target(앞 대상, 없으면 ''), defect } */
    function splitSurveyContent(text) {
        const raw = tidy(text);
        const out = { target: '', defect: raw };
        if (!raw) return out;
        const m = DEFECT_RE.exec(raw);
        if (!m || m.index === 0) { out.defect = m ? normalizeDefect(raw) : raw; return out; }
        let target = tidy(raw.slice(0, m.index).replace(/상태$/, ''));
        const defect = normalizeDefect(raw.slice(m.index));
        if (!target || /\d/.test(target) || target.length > 16
            || NOT_TARGET.some((w) => compact(target) === compact(w))) {
            return out;
        }
        out.target = target;
        out.defect = defect;
        return out;
    }

    // 대상 표기 다듬기: 「부재 접합부 뿜칠」→「접합부 뿜칠」, 「천장마감재」→「천장 마감재」
    function tidyTarget(t) {
        let x = tidy(t).replace(/^부재\s+/, '');
        x = x.replace(/(천장|외벽|외부|지붕|타일)마감재/g, '$1 마감재');
        return x;
    }

    function hasHostWord(s) {
        const c = compact(s);
        return HOST_WORDS.some((w) => c.includes(w));
    }

    /** 바탕 부재 + 대상 → 부재 칸 이름 (벽체 + 타일 → 벽체 타일) */
    function combineMember(host, target) {
        const h = tidy(host);
        const t = tidy(target);
        if (!t) return h;
        if (VAGUE_HOSTS.indexOf(h) >= 0) return t;
        if (STANDALONE_FINISH.some((w) => compact(t).startsWith(compact(w)))) return t;
        if (compact(t).startsWith(compact(h))) return t;
        if (compact(t) === '접합부') return `${h} 접합부`; // 기둥-벽체 + 접합부 수직이격 → 기둥-벽체 접합부
        if (hasHostWord(t)) return t; // 「철골 보 뿜칠」·「데크 슬래브 뿜칠」은 그대로
        return `${h} ${t}`;
    }

    // ── 원인 표기 통일 ──
    const CAUSE_STANDARD = [
        '시공미흡',
        '개구부 주위 응력집중',
        '주변부재의 구속',
        '건조수축 및 재료적 특성',
        '경과년수 증대에 따른 노후화',
        '이질재료 접합부 거동차이',
        '관리미흡'
    ];
    // 띄어쓰기만 다른 건 compact로 맞추고, 낱말이 다른 같은 뜻은 여기서
    const CAUSE_ALIASES = {
        '개구부응력집중': '개구부 주위 응력집중',
        '개구부주변응력집중': '개구부 주위 응력집중',
        '개구부주위의응력집중': '개구부 주위 응력집중',
        '주변부재구속': '주변부재의 구속',
        '주변부재에의한구속': '주변부재의 구속',
        '경과년수증대로인한노후화': '경과년수 증대에 따른 노후화',
        '경과년수에따른노후화': '경과년수 증대에 따른 노후화',
        '이질재료접합부거동차': '이질재료 접합부 거동차이'
    };
    const CAUSE_BY_COMPACT = {};
    CAUSE_STANDARD.forEach((c) => { CAUSE_BY_COMPACT[compact(c)] = c; });
    Object.keys(CAUSE_ALIASES).forEach((k) => { CAUSE_BY_COMPACT[k] = CAUSE_ALIASES[k]; });

    function normalizeCausePart(p) {
        const t = String(p == null ? '' : p).replace(/[\s\u3000]+/g, ' ').trim();
        if (!t) return '';
        return CAUSE_BY_COMPACT[compact(t)] || t;
    }
    /** 쉼표로 나뉜 원인 하나하나를 표준 표기로(모르는 말은 그대로) */
    function normalizeCause(text) {
        const raw = String(text == null ? '' : text);
        if (!raw.trim()) return raw.trim();
        const parts = raw.split(/\s*[,，]\s*/).map(normalizeCausePart).filter(Boolean);
        const seen = new Set();
        return parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(', ');
    }

    /**
     * 엑셀 가져오기 한 행 변환. 비구조체·마감재만 부재/조사내용을 쪼개 합친다(구조체는 그대로).
     * row: { component, defectType, cause, category } → 같은 모양 새 객체 (+ split: 쪼갰는지)
     */
    function convertImportRow(row) {
        const r = row || {};
        const out = {
            component: r.component, defectType: r.defectType, cause: normalizeCause(r.cause),
            category: r.category, split: false
        };
        if (r.category !== '비구조체' && r.category !== '마감재') return out;
        const sp = splitSurveyContent(r.defectType);
        if (sp.target) {
            sp.target = tidyTarget(sp.target);
            // 「-보 접합부 뿜칠」(부재명칭 기둥) = 기둥-보 접합부 뿜칠
            const host = tidy(r.component);
            if (/^[\s\u3000]*-/.test(String(r.defectType || '')) && VAGUE_HOSTS.indexOf(host) < 0) {
                sp.target = `${host}-${sp.target}`;
            }
        }
        if (!sp.target) {
            if (sp.defect && sp.defect !== tidy(r.defectType)) out.defectType = sp.defect;
            return out;
        }
        out.component = combineMember(r.component, sp.target);
        out.defectType = sp.defect;
        out.split = true;
        return out;
    }

    const api = {
        splitSurveyContent: splitSurveyContent,
        combineMember: combineMember,
        normalizeCause: normalizeCause,
        convertImportRow: convertImportRow,
        CAUSE_STANDARD: CAUSE_STANDARD.slice()
    };
    root.BSA = root.BSA || {};
    root.BSA.companyVocab = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
