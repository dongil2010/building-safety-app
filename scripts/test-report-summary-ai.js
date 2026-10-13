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
assert.ok(prompt.includes('[분류키 structure] 구조체 (2항목)'));
assert.ok(prompt.includes('1. 지하1층 보(G) 균열 (균열폭:0.5mm) | 위치 X1/Y1 | 크기 0.5/2.0 | 진행 중 | 같은 유형 3건 | 조사표 원인추정 건조수축'));
assert.ok(prompt.includes('2. 지상2층 슬래브 누수 | 위치 X2/Y3 | 누수 중 | 조사표 원인추정 없음'));
assert.ok(prompt.includes('1. 옥상 난간 상태양호 | 상태양호 | 조사표 원인추정 없음'));
assert.ok(prompt.includes('건물: 시험건물 / 2026년 하반기 점검'));
// 2026-10-13: AI 의견은 우리 보고서와 달라도 된다 — 조사표 원인·전회 의견에 맞추라고 하지 않는다
assert.ok(prompt.includes('조사표의 원인추정은 참고만 한다'));
assert.ok(prompt.includes('놓치기 쉬운 점'));
assert.ok(!prompt.includes('전회차 의견'), '전회 의견은 보내지 않는다');
assert.ok(!prompt.includes('건조수축에 의한 것으로 판단됨'), '전회 의견 글자가 섞이지 않는다');

// 받은 글: 요청한 분류만, 항목마다 한 줄(줄 안의 줄바꿈은 잇는다), 메모는 따로
const keys = ['structure', 'public'];
const got = ai.parseResponse('```json\n{"structure": {"lines": ["- 첫 줄", "둘째 줄\\n이어짐", "", "-셋째 줄"], "note": " 반복 균열은  추적 관찰 필요. "}, "public": {"lines": ["난간은 양호함."], "note": ""}, "extra": {"lines": ["버림"]}}\n```', keys);
assert.deepStrictEqual(got, {
    opinion: { structure: '- 첫 줄\n- 둘째 줄 이어짐\n- 셋째 줄', public: '- 난간은 양호함.' },
    note: { structure: '반복 균열은 추적 관찰 필요.' },
    repair: {}
});
// 보수방안: 항목 순서대로의 배열(빈 줄도 자리를 지킨다 — 줄 수가 항목 수와 맞아야 짝을 짓는다)
assert.ok(prompt.includes('repairs: 항목마다 정확히 한 줄'));
assert.deepStrictEqual(
    ai.parseResponse('{"structure": {"lines": ["가", "나"], "repairs": ["- 방수층  보수 후\\n주입", ""], "note": ""}, "public": {"lines": ["다"], "repairs": [""]}}', keys).repair,
    { structure: ['방수층 보수 후 주입', ''] }
);
// 예전 모양(글자·배열)으로 답해도 받는다
assert.deepStrictEqual(ai.parseResponse('{"structure": "- 가\\n나", "public": ["다"]}', keys),
    { opinion: { structure: '- 가\n- 나', public: '- 다' }, note: {}, repair: {} });
assert.deepStrictEqual(ai.parseResponse('{"structure": {"lines": [], "note": ""}, "public": null}', keys), { opinion: {}, note: {}, repair: {} }, '빈 의견은 넣지 않는다');
assert.throws(() => ai.parseResponse('죄송합니다', keys), /찾지 못했습니다/);
assert.throws(() => ai.parseResponse('{"structure": }', keys), /읽지 못했습니다/);
// 조사표에 없는 숫자 찾기
const src = ai.sourceTextOf(input.cats[0]);
assert.deepStrictEqual(ai.unknownNumbers('- 지하1층 보 균열(0.5mm)은 건조수축으로 판단됨.', src), []);
assert.deepStrictEqual(ai.unknownNumbers('- 지상2층 슬래브 누수는 방수층 손상으로 추정됨.', src), []);
assert.deepStrictEqual(ai.unknownNumbers('- 지상3층 보 균열(0.5mm, 0.30mm 이상은 주입)', src), ['지상3층', '0.30'],
    '위치에 Y3이 있어도 지상3층은 없는 층이다');
assert.deepStrictEqual(ai.unknownNumbers('- 폭 2.0mm', src), [], '2와 2.0은 같은 숫자다');

// 주요 점검결과 고르기: 결함마다 번호를 붙여 보내고, 필수는 표시한다
const pickInput = {
    buildingName: '시험건물',
    roundLabel: '',
    maxItems: 4,
    cats: [
        {
            key: 'structure',
            label: '구조체',
            defects: [
                { n: 1, floor: '지하1층', location: 'X1/Y1', content: '보(G) 균열', size: '0.5/2.0', cause: '건조수축', progress: true, photo: true, forced: true },
                { n: 2, floor: '지하1층', location: '', content: '슬래브 누수', size: '', cause: '', leak: true }
            ]
        },
        { key: 'public', label: '공중이용부위', defects: [{ n: 3, floor: '옥상', content: '난간 흔들림' }] }
    ]
};
const pickPrompt = ai.buildPickPrompt(pickInput);
assert.ok(pickPrompt.includes('최대 4건'));
assert.ok(pickPrompt.includes('[분류키 structure] 구조체 (2건)'));
assert.ok(pickPrompt.includes('1. [필수] 지하1층 보(G) 균열 | 위치 X1/Y1 | 크기 0.5/2.0 | 진행 중 | 사진 있음 | 원인추정 건조수축'));
assert.ok(pickPrompt.includes('2. 지하1층 슬래브 누수 | 누수 중'));
assert.ok(pickPrompt.includes('3. 옥상 난간 흔들림\n') || pickPrompt.endsWith('3. 옥상 난간 흔들림'));

// 받은 번호: 그 분류에 보낸 번호만, 겹치면 한 번만, 답이 없는 분류는 빈 목록
const allowed = { structure: [1, 2], public: [3] };
assert.deepStrictEqual(
    ai.parsePicks('{"structure":[{"n":2,"why":"누수가  계속됨"},{"n":"1","why":""},{"n":2},{"n":3,"why":"다른 분류"},{"n":99}],"aux":[{"n":1}]}', allowed),
    { structure: [{ n: 2, why: '누수가 계속됨' }, { n: 1, why: '' }], public: [] }
);
assert.deepStrictEqual(ai.parsePicks('{"structure":[1,2],"public":"없음"}', allowed),
    { structure: [{ n: 1, why: '' }, { n: 2, why: '' }], public: [] }, '번호만 적은 답도 받는다');
assert.throws(() => ai.parsePicks('모르겠습니다', allowed), /찾지 못했습니다/);

console.log('test-report-summary-ai: ok');
