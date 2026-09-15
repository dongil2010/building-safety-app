// 콘크리트 강도 측정지(반발경도) 사진 → Google Cloud Vision API(OCR 전용 상품, Gemini와는
// 별개)로 R값만 추출해서 돌려주는 프록시. 브라우저(app.js)가 API 키를 직접 들고 있지 않도록,
// 키는 이 Worker의 환경변수(secret)에만 둔다.
//
// 2026-09-04: 기존엔 Gemini(생성형 AI, 무료 AI Studio 키)를 썼는데, Cloudflare Worker처럼
// 서버/클라우드에서 오는 요청을 막는 정책("User location is not supported for the API use")에
// 걸려 거의 항상 실패했다. Cloud Vision API는 애초에 서버에서 자동 호출하는 용도로 만들어진
// 정식 OCR 상품이라 이 문제가 없을 것으로 보고 교체했다.
//
// 배포 방법은 이 폴더의 README.md 참고. Secret 이름이 GEMINI_API_KEY → GOOGLE_VISION_API_KEY로
// 바뀌었으니 Cloudflare 대시보드에서 새로 등록해야 한다.

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
    if (!env.GOOGLE_VISION_API_KEY) {
      return json({ error: 'GOOGLE_VISION_API_KEY가 설정되지 않았습니다.' }, 500, corsHeaders);
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
    const base64Data = image.slice(commaIdx + 1);

    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${env.GOOGLE_VISION_API_KEY}`;
    let visionRes;
    try {
      visionRes = await fetch(visionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: base64Data },
            // 인쇄된 표/문서 인식에 최적화된 기능(일반 TEXT_DETECTION보다 줄바꿈·정렬 보존이 나음)
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      });
    } catch (err) {
      return json({ error: `Cloud Vision 호출 실패: ${err}` }, 502, corsHeaders);
    }

    let visionData = null;
    try {
      visionData = await visionRes.json();
    } catch {
      /* 아래 !visionRes.ok에서 처리 */
    }

    const apiError = visionData?.responses?.[0]?.error?.message || visionData?.error?.message;
    if (!visionRes.ok || apiError) {
      return json({ error: `Cloud Vision API 오류 (${visionRes.status}): ${apiError || '알 수 없는 오류'}` }, 502, corsHeaders);
    }

    const text = visionData?.responses?.[0]?.fullTextAnnotation?.text || '';
    const values = extractRValues(text);

    return json({ values }, 200, corsHeaders);
  },
};

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 도트프린터 측정지는 "R 01 44" 처럼 R번호+측정값이 한 줄에 같이 찍히는데, 인쇄가 흐리거나
// 체크박스(□)에 가려 R번호 쪽 숫자만 깨지면 기존 "R+번호+값"을 한 번에 매칭하는 정규식은
// 그 줄 전체(진짜 측정값까지)를 통째로 버렸다. 이제 "R"로 시작하는 줄인지만 보고, 그 줄에서
// 마지막에 나오는 2~3자리 숫자를 측정값으로 쓴다 — R번호 숫자가 깨져도 값은 살아남는다.
function extractRValues(text) {
  const lines = String(text || '').split(/\r?\n/);
  const values = [];
  for (const line of lines) {
    if (!/^\s*R\b/i.test(line)) continue;
    const nums = line.match(/\d{2,3}/g);
    if (!nums || nums.length === 0) continue;
    const last = parseInt(nums[nums.length - 1], 10);
    if (!isNaN(last) && last >= 10 && last <= 80) values.push(last);
  }
  return values;
}
