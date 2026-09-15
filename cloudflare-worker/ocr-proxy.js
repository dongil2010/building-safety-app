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

// 도트프린터 측정지는 "R 01 44" 처럼 R번호+측정값이 이어져 찍히는데, OCR이 줄바꿈을
// 다르게 잡으면(번호 "10"과 값 "48"이 서로 다른 줄로 떨어지면) 줄 단위 파싱은 번호 숫자만
// 있는 줄에서 그 번호 자체를 값으로 잘못 채택했다("R 10"~"R 20" 구간이 그대로 10~20 값으로
// 나오던 버그). 이제 줄 경계 대신 "R" 하나가 나온 지점부터 그 다음 "R"이 나오기 직전까지를
// 한 덩어리로 보고, 그 안에서 두 번째 숫자(번호 다음에 오는 진짜 측정값)를 쓴다. 번호 숫자가
// 아예 안 읽혀서 숫자가 하나만 잡히면 그때만 그 하나를 값으로 쓴다. "ER06"처럼 다른 글자
// 뒤에 붙은 R(에러 코드 등)은 새 구간 시작으로 치지 않아 오염원에서 제외한다.
function extractRValues(text) {
  const str = String(text || '');
  const starts = [];
  const re = /R/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const prev = str[m.index - 1];
    if (prev && /[A-Za-z]/.test(prev)) continue;
    starts.push(m.index);
  }
  const values = [];
  for (let i = 0; i < starts.length; i++) {
    const segment = str.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : str.length);
    const nums = segment.match(/\d{2,3}/g);
    if (!nums || nums.length === 0) continue;
    const value = parseInt(nums.length >= 2 ? nums[1] : nums[0], 10);
    if (!isNaN(value) && value >= 10 && value <= 80) values.push(value);
  }
  return values;
}
