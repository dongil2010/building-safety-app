/**
 * 보고서 본문 요약 — AI 의견 초안 (report-summary.html 전용)
 *
 * Gemini에 두 가지를 맡긴다: ① 결함 전체에서 분류별 주요 점검결과 고르기 ② 고른 항목으로
 * 「결함원인 및 책임기술자 의견」과 보수방안 쓰기. ①은 결함 번호로만 답을 받고 문구·균열폭은 조사표에서
 * 다시 채운다(없는 결함을 만들 수 없게). ②는 받은 글에 조사표에 없는 숫자가 있으면 알려 준다.
 * 받은 것은 A·B안을 덮어쓰지 않고 「AI안」으로 따로 두어 비교표에서 골라 쓰게 한다.
 *
 * 조사표의 글자(건물명·위치·결함 내용)가 Google로 나가므로 버튼을 누를 때만 부른다.
 * 키는 본 앱 OCR과 같은 것(window.GEMINI_DIRECT_API_KEY, 배포 때만 주입)이라 로컬에서는 동작하지 않는다.
 */
(function (root) {
    'use strict';

    // 본 앱 R값 OCR(app.js scanRValuesFromImageGeminiDirect)과 같은 모델
    const MODEL = 'gemini-3.5-flash-lite';

    /**
     * 의견을 쓰게 하는 글. 2026-10-13 사용자 뜻: AI 의견은 우리 보고서와 달라도 된다(우리가 놓치는
     * 부분을 짚어 주는 쪽이 쓸모 있다). 그래서 조사표의 원인추정과 전회차 의견에 맞추라고 하지 않고
     * AI 자신의 판단을 적게 하며, 항목별 줄과 별도로 분류마다 「놓치기 쉬운 점」 메모를 받는다.
     * 층·위치·치수 같은 사실만은 지어내지 못하게 한다.
     * @param {{buildingName: string, roundLabel: string,
     *   cats: Array<{key: string, label: string,
     *     items: Array<{text: string, location?: string, size?: string, cause?: string,
     *       progress?: boolean, leak?: boolean, good?: boolean, sameTypeCount?: number, digestCount?: number}>}>,
     *   groups?: Array<{key: string, label: string, type: string, count: number, location?: string, maxWidth?: number, cause?: string}>}} input
     * groups: 보고서 「실시결과 요약표 조치 필요사항」「주요 결함사항 원인 및 보수방안」 줄(분류+유형 묶음). 줄마다 보수방안을 받는다.
     */
    function buildPrompt(input) {
        const lines = [
            '너는 건축물 안전점검 경험이 많은 구조기술사다. 다른 점검팀이 만든 상태조사표를 독립적으로 검토한다.',
            '아래는 분류별로 보고서에 싣기로 고른 주요 점검결과다. 분류마다 「결함원인 및 책임기술자 의견」을 네 판단으로 써라.',
            '',
            '규칙',
            '- lines: 항목마다 정확히 한 줄, 항목 순서대로. 줄 수는 항목 수와 같아야 한다.',
            '- 보고서 문체로 쓴다: "~으로 판단됨.", "~이 필요함.", "~한 것으로 조사됨."처럼 명사형으로 끝낸다.',
            '- 한 줄에 원인 → 구조 안전·내구성에 미치는 영향 → 더 확인할 점을 담는다. 두 문장, 200자까지 써도 된다.',
            '- lines에는 보수공법·보수방안을 쓰지 않는다(보고서 3장 의견 칸이다). 보수방안은 repairs와 groupRepairs에만 쓴다.',
            '- 「(묶음 N건)」이 붙은 항목은 같은 결함 여러 건을 한 줄로 묶은 것이다. 묶음 전체를 두고 의견을 쓴다.',
            '- 조사표의 원인추정은 참고만 한다. 결함 유형·부재·위치·크기로 볼 때 다른 원인이 더 그럴듯하면 네 판단을 적고,',
            '  조사표와 다르면 줄 끝에 "(조사표 원인추정: ○○ — 재검토 필요)"처럼 밝힌다.',
            '- 원인을 가르려면 확인이 더 필요한 경우 무엇을 확인해야 하는지 적는다(예: 균열 위치가 중앙부인지 단부인지, 진행 여부 계측, 상부 방수층 상태).',
            '- 상태양호 항목은 양호하다는 내용으로 짧게 적는다.',
            '- repairs: 항목마다 정확히 한 줄, 항목 순서대로(줄 수 = 항목 수). 그 결함의 보수·보강 방안을 네 판단으로 구체적으로 적는다:',
            '  먼저 끊어야 할 원인(누수 경로 등), 공법과 순서, 균열폭 등에 따른 공법 구분, 급한 정도, 보수 뒤 추적 관찰.',
            '  이 줄은 보고서 문체가 아니어도 된다. 상태양호 항목은 "해당 없음"으로 적는다.',
            '- groupRepairs: 맨 아래 [보수방안 묶음]의 키마다 {"action": 조치 필요사항 칸에 넣을 공법 이름(40자 안쪽, 예: "에폭시 주입공법 및 표면처리공법"),',
            '  "detail": 원인 및 보수방안 칸에 넣을 보수방안(보고서 문체 "~함." "~필요함."으로, 150자 안쪽. 원인 차단, 균열폭 등에 따른 공법 구분, 순서)}.',
            '  상태양호만 있는 묶음은 없으니 키를 빠뜨리지 않는다.',
            '- note: 그 분류에서 점검팀이 놓치기 쉬운 점을 한두 문장으로 적는다(결함들 사이의 연관, 같은 유형의 반복이 뜻하는 것,',
            '  추가 조사나 추적 관찰이 필요한 것 등). 덧붙일 것이 없으면 빈 문자열로 둔다.',
            '- 판단과 해석은 자유롭게 하되, 아래에 적혀 있지 않은 층·위치·치수·건수 같은 사실은 지어내지 않는다.',
            '- 머리말, 맺음말, 분류 이름은 쓰지 않는다.',
            '',
            '출력은 JSON 하나만: {"분류키": {"lines": ["첫 항목 의견", "둘째 항목 의견"], "repairs": ["첫 항목 보수방안", "둘째 항목 보수방안"], "note": "놓치기 쉬운 점"}, ...,',
            '  "groupRepairs": {"묶음키": {"action": "공법", "detail": "보수방안"}, ...}}. 아래에 나온 분류키·묶음키만 쓴다.',
            '',
            '건물: ' + (input.buildingName || '(이름 없음)') + (input.roundLabel ? ' / ' + input.roundLabel + ' 점검' : '')
        ];
        (input.cats || []).forEach(function (cat) {
            lines.push('', '[분류키 ' + cat.key + '] ' + cat.label + ' (' + cat.items.length + '항목)');
            cat.items.forEach(function (it, i) {
                const extra = [];
                if (it.good) extra.push('상태양호');
                if (it.location) extra.push('위치 ' + it.location);
                if (it.size) extra.push('크기 ' + it.size);
                if (it.progress) extra.push('진행 중');
                if (it.leak) extra.push('누수 중');
                if (it.sameTypeCount > 1) extra.push('같은 유형 ' + it.sameTypeCount + '건');
                extra.push('조사표 원인추정 ' + (it.cause || '없음'));
                lines.push((i + 1) + '. ' + it.text + (it.digestCount ? ' (묶음 ' + it.digestCount + '건)' : '') + ' | ' + extra.join(' | '));
            });
        });
        if ((input.groups || []).length) {
            lines.push('', '[보수방안 묶음] 키 | 분류 | 결함 유형 | 건수 | 위치 | 최대 균열폭 | 조사표 원인추정');
            input.groups.forEach(function (g) {
                lines.push(g.key + ' | ' + g.label + ' | ' + g.type + ' | ' + g.count + '건 | ' + (g.location || '-') + ' | '
                    + (g.maxWidth != null ? g.maxWidth + 'mm' : '-') + ' | ' + (g.cause || '없음'));
            });
        }
        return lines.join('\n');
    }

    /**
     * AI 답에서 분류별 의견(항목마다 한 줄)과 메모를 꺼낸다. 요청하지 않은 분류와 빈 글은 버린다.
     * 줄 안의 줄바꿈은 한 칸으로 잇는다(줄 수가 항목 수와 맞아야 항목별로 짝을 지을 수 있다).
     * 보수방안(repair)은 항목 순서대로의 배열로 둔다.
     * groupKeys를 주면 묶음별 보수방안 groupRepair[묶음키] = {action, detail}도 꺼낸다.
     * @returns {{opinion: Object<string, string>, note: Object<string, string>, repair: Object<string, string[]>,
     *   groupRepair: Object<string, {action: string, detail: string}>}}
     */
    function parseResponse(text, catKeys, groupKeys) {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('AI 답에서 내용을 찾지 못했습니다.');
        let obj;
        try {
            obj = JSON.parse(m[0]);
        } catch (e) {
            throw new Error('AI 답을 읽지 못했습니다: ' + e.message);
        }
        const out = { opinion: {}, note: {}, repair: {}, groupRepair: {} };
        const gr = obj.groupRepairs && typeof obj.groupRepairs === 'object' ? obj.groupRepairs : {};
        const one = function (v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); };
        (groupKeys || []).forEach(function (k) {
            const v = gr[k];
            if (!v) return;
            const action = one(typeof v === 'object' ? v.action : v);
            const detail = one(typeof v === 'object' ? v.detail : v);
            if (action || detail) out.groupRepair[k] = { action: action || detail, detail: detail || action };
        });
        (catKeys || []).forEach(function (k) {
            let v = obj[k];
            let note = '';
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                note = String(v.note == null ? '' : v.note).replace(/\s+/g, ' ').trim();
                const reps = (Array.isArray(v.repairs) ? v.repairs : [])
                    .map(function (r) { return String(r == null ? '' : r).replace(/\s+/g, ' ').replace(/^-\s*/, '').trim(); });
                if (reps.some(Boolean)) out.repair[k] = reps;
                v = v.lines;
            }
            const list = Array.isArray(v)
                ? v.map(function (l) { return String(l == null ? '' : l).replace(/\s+/g, ' '); })
                : String(v == null ? '' : v).split('\n');
            const body = list.map(function (l) { return l.trim(); }).filter(Boolean)
                .map(function (l) { return /^-/.test(l) ? l.replace(/^-\s*/, '- ') : '- ' + l; })
                .join('\n');
            if (body) out.opinion[k] = body;
            if (note) out.note[k] = note;
        });
        return out;
    }
    /**
     * 의견에 나온 숫자 가운데 보낸 내용에 없는 것(지어냈을 수 있는 숫자).
     * 층은 따로 견준다. 숫자만 보면 위치의 열번호(X2/Y3) 때문에 없는 「지상3층」이 있는 것으로 넘어간다.
     */
    function unknownNumbers(opinion, source) {
        const FLOOR = /(지하|지상)?\s*(\d+)\s*층/g;
        const floors = function (s) {
            const list = [];
            String(s || '').replace(FLOOR, function (m, side, n) { list.push((side === '지하' ? '지하' : '지상') + n + '층'); return m; });
            return list;
        };
        const nums = function (s) { return String(s || '').replace(FLOOR, ' ').match(/\d+(?:\.\d+)?/g) || []; };
        const out = [];
        const knownFloor = floors(source);
        floors(opinion).forEach(function (f) {
            if (knownFloor.indexOf(f) < 0 && out.indexOf(f) < 0) out.push(f);
        });
        const known = {};
        nums(source).forEach(function (n) { known[parseFloat(n)] = true; });
        nums(opinion).forEach(function (n) {
            if (!known[parseFloat(n)] && out.indexOf(n) < 0) out.push(n);
        });
        return out;
    }

    /** 분류 하나에 보낸 글자 전부(숫자 검사용) */
    function sourceTextOf(cat) {
        return cat.items.map(function (it) {
            return [it.text, it.location, it.size, it.cause].filter(Boolean).join(' ');
        }).join(' ');
    }

    /**
     * 주요 점검결과를 고르게 하는 글. 결함마다 번호(n)를 붙여 보내고 번호로만 답하게 한다
     * (문구·균열폭은 받은 번호로 조사표에서 다시 채우므로 AI가 없는 결함을 만들 수 없다).
     * @param {{buildingName: string, roundLabel: string, maxItems: number,
     *   cats: Array<{key: string, label: string,
     *     defects: Array<{n: number, floor: string, location?: string, content: string, size?: string,
     *       cause?: string, progress?: boolean, leak?: boolean, photo?: boolean, forced?: boolean}>}>}} input
     */
    function buildPickPrompt(input) {
        const max = input.maxItems || 4;
        const lines = [
            '너는 건축물 정기안전점검 보고서를 쓰는 책임기술자다.',
            '아래는 상태조사표의 결함 목록이다. 분류마다 보고서 「주요 점검결과」에 실을 대표 결함을 골라라.',
            '',
            '규칙',
            '- 분류마다 가장 중요한 것부터 최대 ' + max + '건(분류 머리에 최대 건수가 따로 적혀 있으면 그것). 경미한 결함뿐이면 더 적게 골라도 되지만, 결함이 있는 분류는 1건 이상 고른다.',
            '- [필수] 표시가 있는 결함은 반드시 포함한다.',
            '- 중요도는 구조 안전·내력에 미치는 영향, 이용자 안전(추락·낙하), 진행 중·누수 중 여부, 균열폭, 같은 결함이 여러 곳에 반복되는지를 보고 판단한다.',
            '- 같은 유형이 반복되면 그중 가장 심한 것 하나를 대표로 고르고, 남는 자리는 다른 유형으로 채운다.',
            '- 번호는 그 분류 목록에 있는 것만 쓴다. 다른 분류의 번호를 쓰지 않는다.',
            '- why에는 고른 이유를 40자 안쪽 한 줄로 적는다. 목록에 없는 사실을 지어내지 않는다.',
            '',
            '출력은 JSON 하나만: {"분류키": [{"n": 번호, "why": "이유"}, ...], ...}. 아래에 나온 분류키만 쓴다.',
            '',
            '건물: ' + (input.buildingName || '(이름 없음)') + (input.roundLabel ? ' / ' + input.roundLabel + ' 점검' : '')
        ];
        (input.cats || []).forEach(function (cat) {
            lines.push('', '[분류키 ' + cat.key + '] ' + cat.label + ' (' + cat.defects.length + '건' + (cat.max ? ', 이 분류는 최대 ' + cat.max + '건' : '') + ')');
            cat.defects.forEach(function (d) {
                const extra = [];
                if (d.location) extra.push('위치 ' + d.location);
                if (d.size) extra.push('크기 ' + d.size);
                if (d.progress) extra.push('진행 중');
                if (d.leak) extra.push('누수 중');
                if (d.photo) extra.push('사진 있음');
                if (d.cause) extra.push('원인추정 ' + d.cause);
                lines.push(d.n + '. ' + (d.forced ? '[필수] ' : '') + d.floor + ' ' + d.content + (extra.length ? ' | ' + extra.join(' | ') : ''));
            });
        });
        return lines.join('\n');
    }

    /**
     * AI가 고른 번호를 꺼낸다. 그 분류 목록에 없는 번호와 겹친 번호는 버린다.
     * @param {Object<string, number[]>} allowed 분류별로 보낸 번호
     * @returns {Object<string, Array<{n: number, why: string}>>}
     */
    function parsePicks(text, allowed) {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('AI 답에서 내용을 찾지 못했습니다.');
        let obj;
        try {
            obj = JSON.parse(m[0]);
        } catch (e) {
            throw new Error('AI 답을 읽지 못했습니다: ' + e.message);
        }
        const out = {};
        Object.keys(allowed || {}).forEach(function (k) {
            const seen = {};
            out[k] = (Array.isArray(obj[k]) ? obj[k] : []).map(function (x) {
                const n = typeof x === 'number' ? x : parseInt(x && x.n, 10);
                return { n: n, why: String((x && x.why) || '').replace(/\s+/g, ' ').trim() };
            }).filter(function (x) {
                if (allowed[k].indexOf(x.n) < 0 || seen[x.n]) return false;
                seen[x.n] = true;
                return true;
            });
        });
        return out;
    }

    async function callGemini(apiKey, prompt) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + apiKey;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json' }
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error('Gemini 오류 (' + res.status + '): ' + errText.slice(0, 300));
        }
        const data = await res.json();
        const cand = data.candidates && data.candidates[0];
        const text = ((cand && cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('');
        if (!text) throw new Error('Gemini가 빈 답을 보냈습니다' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : '') + '.');
        return text;
    }

    async function requestOpinions(apiKey, input) {
        return parseResponse(await callGemini(apiKey, buildPrompt(input)), input.cats.map(function (c) { return c.key; }),
            (input.groups || []).map(function (g) { return g.key; }));
    }

    async function requestPicks(apiKey, input) {
        const allowed = {};
        input.cats.forEach(function (c) { allowed[c.key] = c.defects.map(function (d) { return d.n; }); });
        return parsePicks(await callGemini(apiKey, buildPickPrompt(input)), allowed);
    }

    const api = {
        MODEL: MODEL,
        buildPrompt: buildPrompt,
        parseResponse: parseResponse,
        buildPickPrompt: buildPickPrompt,
        parsePicks: parsePicks,
        unknownNumbers: unknownNumbers,
        sourceTextOf: sourceTextOf,
        requestOpinions: requestOpinions,
        requestPicks: requestPicks
    };

    root.BSA = root.BSA || {};
    root.BSA.reportSummaryAi = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
