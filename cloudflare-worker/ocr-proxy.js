// 콘크리트 강도 OCR 프록시 + Firebase Storage 이미지 프록시.
// - OCR: { image: 'data:image/...' } → Gemini(있으면 우선) → 실패/키없음 시 Cloud Vision → { values }
//   * Gemini: 표 맥락을 이해해서 도트프린터 숫자 인식률이 훨씬 높음(2026-09 실측). 다만 무료 API는
//     Cloudflare Worker 같은 서버리스 발신 IP를 지역 제한("User location is not supported")으로
//     막는 경우가 잦아, 유료(Billing 연결) 프로젝트 키를 써야 안정적으로 호출된다.
//   * Cloud Vision: 순수 글자 인식이라 맥락 이해가 없어 인식률은 낮지만, 지역 제한 없이 항상 호출됨
//     — Gemini가 없거나 실패했을 때의 안전망.
// - ping: { action: 'ping' } → { ok, proxyStorage: true } (구버전 Worker 판별)
// - Storage 프록시: { action: 'proxyStorage', url, authToken? }
//   → 기본: 원본 바이트 스트리밍 (CORS *). 도면처럼 수 MB면 JSON base64는 CPU 한도에 걸림.
//   → format:'dataUrl' 이면 { dataUrl } JSON (작은 사진/구 클라).
//
// 배포: README.md. 운영 Worker 이름: frosty-king-12ef
// Secret: GEMINI_API_KEY (선택, 있으면 우선 사용) / GOOGLE_VISION_API_KEY (폴백용, OCR 전용)

import { isAllowedStorageUrl } from './storage-url-allowlist.js';

async function fetchStorageUpstream(url, headers) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'follow',
      });
      if (res.ok) return res;
      lastErr = res;
      if (res.status !== 503 && res.status !== 429 && res.status !== 500) return res;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }
  if (lastErr && typeof lastErr.status === 'number') return lastErr;
  throw lastErr || new Error('Storage 업스트림 실패');
}

function guessProxyMime(url, contentType) {
  let mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (mime.startsWith('image/') || mime === 'application/pdf') return mime;
  if (/\.pdf(\?|$)/i.test(url)) return 'application/pdf';
  if (/\.png(\?|$)/i.test(url)) return 'image/png';
  if (/\.webp(\?|$)/i.test(url)) return 'image/webp';
  return 'image/jpeg';
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sanitizeAuthToken(raw) {
  if (typeof raw !== 'string') return '';
  const token = raw.trim();
  if (token.length < 20 || token.length > 8000) return '';
  if (/[\s]/.test(token)) return '';
  return token;
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

    if (body && body.action === 'ping') {
      return json({ ok: true, proxyStorage: true }, 200, corsHeaders);
    }

    // ── Storage 이미지 프록시 (OCR 키 불필요) ──
    if (body && body.action === 'proxyStorage') {
      const url = body.url;
      if (typeof url !== 'string' || !isAllowedStorageUrl(url)) {
        return json({ error: '허용되지 않은 Storage URL입니다.' }, 400, corsHeaders);
      }
      const headers = { Accept: 'image/*,application/pdf,*/*' };
      const token = sanitizeAuthToken(body.authToken);
      const urlHasDownloadToken = /[?&]token=/.test(url);
      if (token && !urlHasDownloadToken) {
        // Firebase Storage REST는 Bearer가 아니라 "Firebase <idToken>"
        headers.Authorization = 'Firebase ' + token;
        headers['X-Firebase-Storage-Version'] = 'webjs/9.22.0';
      }
      let upstream;
      try {
        upstream = await fetchStorageUpstream(url, headers);
      } catch (err) {
        return json({ error: `Storage 프록시 fetch 실패: ${err}` }, 502, corsHeaders);
      }
      if (!upstream.ok) {
        return json({ error: `Storage HTTP ${upstream.status}` }, 502, corsHeaders);
      }
      const mime = guessProxyMime(url, upstream.headers.get('content-type'));
      const wantDataUrl = body.format === 'dataUrl';
      if (!wantDataUrl) {
        return new Response(upstream.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': mime,
            'Cache-Control': 'private, max-age=60',
          },
        });
      }
      const buf = new Uint8Array(await upstream.arrayBuffer());
      if (!buf.length) {
        return json({ error: '빈 이미지 응답' }, 502, corsHeaders);
      }
      // 큰 도면 JSON base64는 Worker CPU 한도(무료 ~10–50ms)에 걸릴 수 있음
      if (buf.length > 2 * 1024 * 1024) {
        return json({
          error: '파일이 커서 dataUrl 형식은 지원하지 않습니다. format을 생략하세요.',
        }, 413, corsHeaders);
      }
      const dataUrl = `data:${mime};base64,${bytesToBase64(buf)}`;
      return json({ dataUrl, mime, size: buf.length }, 200, corsHeaders);
    }

    // ── OCR ──
    const image = body && body.image;
    if (typeof image !== 'string' || !image.startsWith('data:image/')) {
      return json({ error: 'image 필드가 없거나 data URL 형식이 아닙니다.' }, 400, corsHeaders);
    }

    const commaIdx = image.indexOf(',');
    const base64Data = image.slice(commaIdx + 1);
    const mimeType = (image.slice(0, commaIdx).match(/^data:(.*?);base64$/) || [])[1] || 'image/jpeg';

    // 왜 Vision으로 폴백했는지 클라이언트에서 바로 볼 수 있게 담아 보낸다(wrangler 로그 tail 없이도
    // 원인 확인 가능하도록 — 2026-09-16: source가 계속 vision으로만 나와서 원인을 못 봐 추가함).
    let geminiFallbackReason = env.GEMINI_API_KEY ? null : 'GEMINI_API_KEY 미설정';
    if (env.GEMINI_API_KEY) {
      try {
        const values = await scanWithGemini(base64Data, mimeType, env.GEMINI_API_KEY);
        return json({ values, source: 'gemini' }, 200, corsHeaders);
      } catch (err) {
        geminiFallbackReason = err && err.message ? err.message : String(err);
        console.log('Gemini OCR 실패, Cloud Vision으로 대체:', geminiFallbackReason);
      }
    }

    if (!env.GOOGLE_VISION_API_KEY) {
      return json({ error: 'GEMINI_API_KEY/GOOGLE_VISION_API_KEY가 모두 설정되지 않았습니다.' }, 500, corsHeaders);
    }

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

    return json({ values, source: 'vision', geminiFallbackReason }, 200, corsHeaders);
  },
};

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 도트프린터 측정지는 "R 01 44" 처럼 R번호+측정값이 이어져 찍히는데, OCR이 한 줄을 통째로
// 놓치거나(예: R03이 안 읽힘) 번호는 읽었는데 그 옆 값만 못 읽는 경우가 실측에서 확인됐다.
// 예전엔 인식된 값들을 나온 순서대로 그냥 이어붙였는데, 그러면 중간에 한 줄이라도 빠지는
// 순간 그 뒤 모든 값이 한 칸씩 밀려서 엉뚱한 R번호 자리에 들어갔다(실측 사진 대조로 확인:
// R12/R13 값이 안 읽히니까 "12"/"13"이라는, 원래 R번호 라벨 숫자 자체가 값으로 잘못 채택됨).
// 이제 각 구간에서 R번호(라벨)를 먼저 읽어서 그 번호의 제자리(rIdx-1)에만 값을 채우고,
// 라벨은 읽었는데 값을 못 읽은 줄은 값 없이(null) 그 자리를 비워둔다 — 틀린 값을 넣느니
// 빈칸으로 두고 사용자가 사진 보고 채우게 한다. 라벨(R번호) 자체를 못 읽은 줄은 어느 자리인지
// 알 수 없어 건너뛴다. "ER06"처럼 다른 글자 뒤에 붙은 R(에러 코드 등)은 구간 시작에서 제외.
// 반환값은 항상 길이 MAX_R_VALUES(20)의 배열이며, 못 읽은 자리는 null.
// (app.js의 extractRValuesFromText와 동일 로직 — 서버/로컬 양쪽에서 씀)
const MAX_R_VALUES = 20;
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
  const slots = new Array(MAX_R_VALUES).fill(null);
  for (let i = 0; i < starts.length; i++) {
    const segment = str.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : str.length);
    const labelMatch = segment.match(/^R\s*[:.\-]?\s*0*(\d{1,2})\b/i);
    if (!labelMatch) continue;
    const rIdx = parseInt(labelMatch[1], 10);
    if (!rIdx || rIdx < 1 || rIdx > MAX_R_VALUES) continue;
    const rest = segment.slice(labelMatch.index + labelMatch[0].length);
    const valNums = rest.match(/\d{2,3}/g);
    if (!valNums || valNums.length === 0) continue;
    const value = parseInt(valNums[0], 10);
    if (isNaN(value) || value < 10 || value > 80) continue;
    slots[rIdx - 1] = value;
  }
  return slots;
}

// Gemini는 표의 맥락(어느 게 번호고 어느 게 값인지)을 이해해서 도트프린터 숫자도 Cloud Vision보다
// 훨씬 잘 읽는다(2026-09 실측: Vision은 20개 중 9개꼴로 인식 실패, Gemini는 거의 다 인식). 다만
// 예전처럼 "인식된 값을 순서대로 나열"하면, Gemini도 한두 줄을 놓쳤을 때 그 뒤 값이 밀리는 문제가
// 똑같이 생길 수 있어 — 여기서도 R번호 자리(rIdx-1)에 값을 직접 넣도록 시켜서(extractRValues와
// 동일한 정책: 못 읽은 자리는 null) 밀림 문제를 원천 차단한다.
async function scanWithGemini(base64Data, mimeType, apiKey) {
  const prompt = `이 이미지는 콘크리트 비파괴 강도 측정지(반발경도/슈미트해머 측정 기록지)이다.
표에는 R01~R20까지 번호가 매겨진 항목이 있고, 각 항목 옆에 10~80 사이의 정수 측정값이 있다.
길이 20인 JSON 배열을 출력해라. 배열의 i번째(0-based) 값은 R(i+1)의 측정값이다.
해당 번호의 측정값을 읽을 수 없거나 표에 아예 없으면 그 자리에 null을 넣어라.
오직 JSON 배열만 출력하고, 설명·코드블록·다른 텍스트는 절대 붙이지 마라.
예: [44,null,42,40,47,44,40,39,39,48,42,39,42,43,49,42,43,41,40,40]`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
  const res = await fetch(geminiUrl, {
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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Gemini 응답에서 JSON 배열을 찾지 못함: ' + text.slice(0, 200));
  let arr;
  try {
    arr = JSON.parse(match[0]);
  } catch (e) {
    throw new Error('Gemini JSON 파싱 실패: ' + e.message);
  }
  if (!Array.isArray(arr)) throw new Error('Gemini 응답이 배열이 아님');

  const slots = new Array(MAX_R_VALUES).fill(null);
  for (let i = 0; i < MAX_R_VALUES; i++) {
    const n = typeof arr[i] === 'number' ? arr[i] : parseInt(arr[i], 10);
    slots[i] = (Number.isFinite(n) && n >= 10 && n <= 80) ? n : null;
  }
  return slots;
}
