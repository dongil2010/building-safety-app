/**
 * 보고서 본문 요약 — AI 의견 초안 (report-summary.html 전용)
 *
 * Gemini에 두 가지를 맡긴다: ① 결함 전체에서 분류별 주요 점검결과 고르기 ② 고른 항목으로
 * 「결함원인 및 책임기술자 의견」 쓰기. ①은 결함 번호로만 답을 받고 문구·균열폭은 조사표에서
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
     * @param {{buildingName: string, roundLabel: string,
     *   cats: Array<{key: string, label: string, prevOpinion?: string,
     *     items: Array<{text: string, location?: string, size?: string, cause?: string,
     *       progress?: boolean, leak?: boolean, good?: boolean, sameTypeCount?: number}>}>}} input
     */
    function buildPrompt(input) {
        const lines = [
            '너는 건축물 정기안전점검 보고서를 쓰는 책임기술자다.',
            '아래는 분류별로 보고서에 싣기로 고른 주요 점검결과다. 분류마다 「결함원인 및 책임기술자 의견」을 써라.',
            '',
            '규칙',
            '- 항목마다 한 줄, 줄 앞에 "- "를 붙인다. 항목 순서를 지킨다.',
            '- 보고서 문체로 쓴다: "~으로 판단됨.", "~이 필요함.", "~한 것으로 조사됨."처럼 명사형으로 끝낸다.',
            '- 한 줄에 결함의 원인과, 필요하면 조치 방향을 함께 적는다. 한 줄은 120자를 넘기지 않는다.',
            '- 아래에 적힌 사실만 쓴다. 적혀 있지 않은 숫자·층·위치·부재를 지어내지 않는다.',
            '- 원인추정이 적혀 있으면 그것을 따르고, 비어 있으면 결함 유형에서 일반적으로 볼 수 있는 원인을 "~으로 추정됨"으로 적는다.',
            '- 상태양호 항목은 양호하다는 내용으로 짧게 적는다.',
            '- 전회차 의견이 주어지면 그 말투와 길이를 따른다. 내용은 금회 항목에 맞춘다.',
            '- 머리말, 맺음말, 분류 이름은 쓰지 않는다.',
            '',
            '출력은 JSON 하나만: {"분류키": "- 첫 줄\\n- 둘째 줄", ...}. 아래에 나온 분류키만 쓴다.',
            '',
            '건물: ' + (input.buildingName || '(이름 없음)') + (input.roundLabel ? ' / ' + input.roundLabel + ' 점검' : '')
        ];
        (input.cats || []).forEach(function (cat) {
            lines.push('', '[분류키 ' + cat.key + '] ' + cat.label);
            cat.items.forEach(function (it, i) {
                const extra = [];
                if (it.good) extra.push('상태양호');
                if (it.location) extra.push('위치 ' + it.location);
                if (it.size) extra.push('크기 ' + it.size);
                if (it.progress) extra.push('진행 중');
                if (it.leak) extra.push('누수 중');
                if (it.sameTypeCount > 1) extra.push('같은 유형 ' + it.sameTypeCount + '건');
                extra.push('원인추정 ' + (it.cause || '없음'));
                lines.push((i + 1) + '. ' + it.text + ' | ' + extra.join(' | '));
            });
            if (cat.prevOpinion) lines.push('전회차 의견(말투 참고):', cat.prevOpinion);
        });
        return lines.join('\n');
    }

    /**
     * AI 답에서 분류별 의견을 꺼낸다. 요청하지 않은 분류와 빈 글은 버린다.
     * @returns {Object<string, string>}
     */
    function parseResponse(text, catKeys) {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        if (!m) throw new Error('AI 답에서 내용을 찾지 못했습니다.');
        let obj;
        try {
            obj = JSON.parse(m[0]);
        } catch (e) {
            throw new Error('AI 답을 읽지 못했습니다: ' + e.message);
        }
        const out = {};
        (catKeys || []).forEach(function (k) {
            const v = obj[k];
            const body = (Array.isArray(v) ? v.join('\n') : String(v == null ? '' : v))
                .split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
                .map(function (l) { return /^-/.test(l) ? l.replace(/^-\s*/, '- ') : '- ' + l; })
                .join('\n');
            if (body) out[k] = body;
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
            '- 분류마다 가장 중요한 것부터 최대 ' + max + '건. 경미한 결함뿐이면 더 적게 골라도 되지만, 결함이 있는 분류는 1건 이상 고른다.',
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
            lines.push('', '[분류키 ' + cat.key + '] ' + cat.label + ' (' + cat.defects.length + '건)');
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
        return parseResponse(await callGemini(apiKey, buildPrompt(input)), input.cats.map(function (c) { return c.key; }));
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
