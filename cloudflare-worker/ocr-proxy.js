// 콘크리트 강도 OCR 프록시 + Firebase Storage 이미지 프록시.
// - OCR: { image: 'data:image/...' } → Cloud Vision → { values }
// - Storage 프록시: { action: 'proxyStorage', url: 'https://firebasestorage...' }
//   → 서버에서 받아 { dataUrl } (브라우저 CORS 우회, 한글 HWPX 임베드용)
//
// 배포: README.md 참고. Secret: GOOGLE_VISION_API_KEY

function isAllowedStorageUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'firebasestorage.googleapis.com'
      || h.endsWith('.firebasestorage.app')
      || h.endsWith('.googleapis.com');
  } catch {
    return false;
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

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

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400, corsHeaders);
    }

    // ── Storage 이미지 프록시 (OCR 키 불필요) ──
    if (body && body.action === 'proxyStorage') {
      const url = body.url;
      if (typeof url !== 'string' || !isAllowedStorageUrl(url)) {
        return json({ error: '허용되지 않은 Storage URL입니다.' }, 400, corsHeaders);
      }
      let upstream;
      try {
        upstream = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'image/*,*/*' },
          redirect: 'follow',
        });
      } catch (err) {
        return json({ error: `Storage 프록시 fetch 실패: ${err}` }, 502, corsHeaders);
      }
      if (!upstream.ok) {
        return json({ error: `Storage HTTP ${upstream.status}` }, 502, corsHeaders);
      }
      const buf = new Uint8Array(await upstream.arrayBuffer());
      if (!buf.length) {
        return json({ error: '빈 이미지 응답' }, 502, corsHeaders);
      }
      let mime = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!mime.startsWith('image/') && mime !== 'application/pdf') {
        if (/\.pdf(\?|$)/i.test(url)) mime = 'application/pdf';
        else if (/\.png(\?|$)/i.test(url)) mime = 'image/png';
        else mime = 'image/jpeg';
      }
      if (mime === 'image/jpg') mime = 'image/jpeg';
      const dataUrl = `data:${mime};base64,${bytesToBase64(buf)}`;
      return json({ dataUrl, mime, size: buf.length }, 200, corsHeaders);
    }

    // ── OCR (기존) ──
    if (!env.GOOGLE_VISION_API_KEY) {
      return json({ error: 'GOOGLE_VISION_API_KEY가 설정되지 않았습니다.' }, 500, corsHeaders);
    }

    const image = body && body.image;
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
