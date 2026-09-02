# 콘크리트 강도(R값) 클라우드 OCR 프록시

측정지 사진에서 R값(반발경도)을 Gemini Vision으로 인식하고, API 키는 브라우저에 노출하지 않기 위한
Cloudflare Worker 프록시입니다. `app.js`의 `scanRValuesFromImage`는 이 프록시가 설정돼 있으면
먼저 시도하고, 실패하거나 오프라인이면 기존 로컬(Tesseract) 인식으로 자동 전환합니다.

## 1. Gemini API 키 발급 (무료)

1. https://aistudio.google.com/apikey 접속 (구글 계정 로그인)
2. "Create API key" 클릭 → 키 복사해서 보관
3. 무료 티어: `gemini-3.5-flash-lite` 기준 하루 1,000회, 결제 카드 등록 불필요

## 2. Cloudflare Worker 배포 (대시보드 방식 — 별도 설치 없음)

1. https://dash.cloudflare.com 에서 무료 계정 생성 (이미 있으면 로그인)
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Create Worker**
3. 이름 입력 (예: `concrete-ocr-proxy`) → **Deploy** (일단 기본 코드로 배포됨)
4. **Edit code** (Quick edit) 클릭 → 에디터 내용을 전부 지우고 이 폴더의 [`ocr-proxy.js`](ocr-proxy.js) 내용을 그대로 붙여넣기 → **Deploy**
5. Worker 페이지에서 **Settings → Variables** 이동
   - **Secret** 추가: 이름 `GEMINI_API_KEY`, 값은 1번에서 받은 키 → 반드시 "Encrypt" 상태로 저장
   - (선택) **Variable** 추가: 이름 `ALLOWED_ORIGIN`, 값은 앱이 실제로 열리는 주소
     (예: `https://your-username.github.io`) — 비워두면 모든 출처를 허용(`*`)합니다
6. Worker의 URL을 복사 (예: `https://concrete-ocr-proxy.your-subdomain.workers.dev`)

## 3. 앱에 연결

`app.js`에서 `CLOUD_OCR_ENDPOINT` 상수를 찾아 5번에서 복사한 URL로 채웁니다.

```js
const CLOUD_OCR_ENDPOINT = 'https://concrete-ocr-proxy.your-subdomain.workers.dev';
```

빈 문자열(`''`)로 두면 클라우드 시도 없이 기존 로컬 OCR만 사용합니다.

## 4. (선택) wrangler CLI로 배포하고 싶다면

Node.js가 설치된 PC에서:

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

## 참고

- 무료 한도(Gemini 하루 1,000회, Cloudflare Worker 하루 100,000회)를 크게 넘지 않는 한 계속 무료입니다.
- 인식 결과는 항상 현장에서 사진과 대조해 확인하세요 — OCR/AI 인식은 완벽하지 않습니다.
