// 콘크리트 강도 OCR 프록시 + Firebase Storage 이미지 프록시.
// - OCR: { image: 'data:image/...' } → Cloud Vision → { values }
// - ping: { action: 'ping' } → { ok, proxyStorage: true } (구버전 Worker 판별)
// - Storage 프록시: { action: 'proxyStorage', url, authToken? }
//   → 기본: 원본 바이트 스트리밍 (CORS *). 도면처럼 수 MB면 JSON base64는 CPU 한도에 걸림.
//   → format:'dataUrl' 이면 { dataUrl } JSON (작은 사진/구 클라).
//
// 배포: README.md. 운영 Worker 이름: frosty-king-12ef
// Secret: GOOGLE_VISION_API_KEY (OCR 전용, 프록시에는 불필요)

import { isAllowedStorageUrl } from './storage-url-allowlist.js';

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
      if (token) {
        // Firebase Storage REST는 Bearer가 아니라 "Firebase <idToken>"
        headers.Authorization = 'Firebase ' + token;
        headers['X-Firebase-Storage-Version'] = 'webjs/9.22.0';
      }
      let upstream;
      try {
        upstream = await fetch(url, {
          method: 'GET',
          headers,
          redirect: 'follow',
        });
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
