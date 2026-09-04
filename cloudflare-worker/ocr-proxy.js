// 콘크리트 강도 측정지(반발경도) 사진 → Gemini Vision으로 R값만 추출해서 돌려주는 프록시.
// 브라우저(app.js)가 Gemini API 키를 직접 들고 있지 않도록, 키는 이 Worker의 환경변수(secret)에만 둔다.
//
// 배포 방법은 이 폴더의 README.md 참고.

export default {
  async fetch(request, env) {
    const allowOrigin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, 500, corsHeaders);
    }

    let image;
    try {
      ({ image } = await request.json());
    } catch {
      return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400, corsHeaders);
    }
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return json({ error: 'image 필드가 없거나 data URL 형식이 아닙니다.' }, 400, corsHeaders);
    }

    const commaIdx = image.indexOf(',');
    const meta = image.slice(0, commaIdx);
    const base64Data = image.slice(commaIdx + 1);
    const mimeType = (meta.match(/^data:(.*?);base64$/) || [])[1] || 'image/jpeg';

    // 반발경도(슈미트해머) 측정지 사진에서 R값만 뽑도록 명확히 지시. 확신 없는 숫자는 제외시켜서
    // 오인식이 그대로 강도 계산에 들어가는 걸 최대한 막는다 (그래도 현장에서 최종 확인은 필수).
    const prompt = `이 이미지는 콘크리트 비파괴 강도 측정지(반발경도/슈미트해머 측정 기록지)이다.
표 안에 있는 "R값"(반발경도 측정값, 보통 10~80 사이의 정수) 목록을 기록된 순서 그대로 추출해라.
목록에 있는 항목(R01, R02, ...) 수만큼 값을 빠짐없이 하나씩 반환해라 — 항목을 건너뛰지 마라.
글자가 흐리거나 일부만 보여도 최선으로 추정한 숫자를 넣어라. 완전히 읽을 수 없어서 추정조차
불가능한 항목만 -1로 표시해라(그 자리를 비우거나 통째로 빼지 마라).
오직 JSON 배열 형식의 정수만 출력해라. 예: [47,45,43,48,-1,52]
설명, 코드블록, 다른 텍스트는 절대 붙이지 마라.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;
    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      });
    } catch (err) {
      return json({ error: `Gemini 호출 실패: ${err}` }, 502, corsHeaders);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return json({ error: `Gemini API 오류 (${geminiRes.status}): ${errText.slice(0, 300)}` }, 502, corsHeaders);
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\[[\d,\s-]*\]/);
    let values = [];
    if (match) {
      try { values = JSON.parse(match[0]); } catch { values = []; }
    }

    return json({ values }, 200, corsHeaders);
  },
};

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
