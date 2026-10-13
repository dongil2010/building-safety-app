/**
 * 보고서 본문 요약 AI 의견 초안(js/report/summary-ai.js) 테스트 (node)
 * Gemini를 실제로 부르지는 않는다. 보내는 글과 받은 글을 다루는 부분만 본다.
 */
const assert = require('assert');
const ai = require('../js/report/summary-ai.js');

const input = {
    buildingName: '시험건물',
    roundLabel: '2026년 하반기',
    cats: [
        {
            key: 'structure',
            label: '구조체',
            prevOpinion: '- 슬래브 균열은 건조수축에 의한 것으로 판단됨.',
            items: [
                { text: '지하1층 보(G) 균열 (균열폭:0.5mm)', location: 'X1/Y1', size: '0.5/2.0', cause: '건조수축', progress: true, leak: false, good: false, sameTypeCount: 3 },
                { text: '지상2층 슬래브 누수', location: 'X2/Y3', size: '', cause: '', progress: false, leak: true, good: false, sameTypeCount: 1 }
            ]
        },
        { key: 'public', label: '공중이용부위', items: [{ text: '옥상 난간 상태양호', good: true }, { text: '직접 적은 항목' }] }
    ]
};

// 보내는 글: 분류키·항목·근거가 들어가고, 없는 원인추정은 「없음」으로 적는다
const prompt = ai.buildPrompt(input);
assert.ok(prompt.includes('[분류키 structure] 구조체'));
assert.ok(prompt.includes('1. 지하1층 보(G) 균열 (균열폭:0.5mm) | 위치 X1/Y1 | 크기 0.5/2.0 | 진행 중 | 같은 유형 3건 | 원인추정 건조수축'));
assert.ok(prompt.includes('2. 지상2층 슬래브 누수 | 위치 X2/Y3 | 누수 중 | 원인추정 없음'));
assert.ok(prompt.includes('1. 옥상 난간 상태양호 | 상태양호 | 원인추정 없음'));
assert.ok(prompt.includes('전회차 의견(말투 참고):\n- 슬래브 균열은 건조수축에 의한 것으로 판단됨.'));
assert.ok(prompt.includes('건물: 시험건물 / 2026년 하반기 점검'));

// 받은 글: 요청한 분류만, 줄 앞 표시를 맞춘다
const keys = ['structure', 'public'];
const got = ai.parseResponse('```json\n{"structure": "- 첫 줄\\n둘째 줄\\n\\n-셋째 줄", "public": ["난간은 양호함."], "extra": "버림"}\n```', keys);
assert.deepStrictEqual(got, { structure: '- 첫 줄\n- 둘째 줄\n- 셋째 줄', public: '- 난간은 양호함.' });
assert.deepStrictEqual(ai.parseResponse('{"structure": "", "public": null}', keys), {}, '빈 의견은 넣지 않는다');
assert.throws(() => ai.parseResponse('죄송합니다', keys), /찾지 못했습니다/);
assert.throws(() => ai.parseResponse('{"structure": }', keys), /읽지 못했습니다/);

// 조사표에 없는 숫자 찾기
const src = ai.sourceTextOf(input.cats[0]);
assert.deepStrictEqual(ai.unknownNumbers('- 지하1층 보 균열(0.5mm)은 건조수축으로 판단됨.', src), []);
assert.deepStrictEqual(ai.unknownNumbers('- 지상2층 슬래브 누수는 방수층 손상으로 추정됨.', src), []);
assert.deepStrictEqual(ai.unknownNumbers('- 지상3층 보 균열(0.5mm, 0.30mm 이상은 주입)', src), ['지상3층', '0.30'],
    '위치에 Y3이 있어도 지상3층은 없는 층이다');
assert.deepStrictEqual(ai.unknownNumbers('- 폭 2.0mm', src), [], '2와 2.0은 같은 숫자다');

console.log('test-report-summary-ai: ok');
