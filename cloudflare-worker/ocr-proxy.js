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
    // "R 01 47" / "R01  47" 등 다양한 간격/서식을 허용해서 R번호 뒤에 오는 실제 측정값만 뽑는다
    // (기존 로컬 Tesseract 파싱과 동일한 정규식 — 이미 이 측정지 서식에 맞게 검증됨).
    const matches = [...text.matchAll(/R\s*0?(\d{1,2})\D+(\d{2,3})/gi)];
    const values = matches.map(m => parseInt(m[2], 10)).filter(v => !isNaN(v) && v >= 10 && v <= 80);

    return json({ values }, 200, corsHeaders);
  },
};

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
