/**
 * 보고서 본문 요약 — AI 의견 초안 (report-summary.html 전용)
 *
 * 분류별 「결함원인 및 책임기술자 의견」을 Gemini에 맡겨 초안을 받는다.
 * 무엇을 고를지, 균열폭·층 같은 숫자는 지금처럼 summary-core.js가 정하고, AI는 고른 항목을
 * 문장으로 잇는 일만 한다. 받은 글에 조사표에 없는 숫자가 있으면 따로 알려 준다.
 * 받은 의견은 A·B안을 덮어쓰지 않고 「AI안」으로 따로 두어 비교표에서 골라 쓰게 한다.
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

    async function requestOpinions(apiKey, input) {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + apiKey;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: buildPrompt(input) }] }],
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
        return parseResponse(text, input.cats.map(function (c) { return c.key; }));
    }

    const api = {
        MODEL: MODEL,
        buildPrompt: buildPrompt,
        parseResponse: parseResponse,
        unknownNumbers: unknownNumbers,
        sourceTextOf: sourceTextOf,
        requestOpinions: requestOpinions
    };

    root.BSA = root.BSA || {};
    root.BSA.reportSummaryAi = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
