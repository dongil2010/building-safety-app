# 콘크리트 강도(R값) 클라우드 OCR 프록시

측정지 사진에서 R값(반발경도)을 **Google Cloud Vision API**(OCR 전용 상품)로 인식하고, API 키는
브라우저에 노출하지 않기 위한 Cloudflare Worker 프록시입니다. `app.js`의 `scanRValuesFromImage`는
이 프록시가 설정돼 있으면 먼저 시도하고, 실패하거나 오프라인이면 기존 로컬(Tesseract) 인식으로
자동 전환합니다.

> 2026-09-04: 원래 Gemini(생성형 AI, 무료 AI Studio 키)를 썼는데, Cloudflare Worker처럼 서버/
> 클라우드에서 오는 요청을 막는 정책("User location is not supported for the API use")에 걸려
> 거의 항상 실패해서 Cloud Vision API로 교체했다. Cloud Vision API는 애초에 서버에서 자동
> 호출하는 용도로 만들어진 정식 OCR 상품이라 이 문제가 없다.

## 1. Google Cloud Vision API 키 발급

1. https://console.cloud.google.com 접속 (구글 계정 로그인)
2. 상단 프로젝트 선택 메뉴 → **새 프로젝트** 생성 (또는 기존 프로젝트 선택)
3. 좌측 메뉴 **결제(Billing)** → 결제 계정 연결(카드 등록). 신규 계정이면 보통 $300 상당 무료
   크레딧이 제공됩니다.
4. 상단 검색창에 **"Cloud Vision API"** 검색 → 열어서 **사용(Enable)** 클릭
5. 좌측 메뉴 **API 및 서비스 → 사용자 인증 정보(Credentials)** → **사용자 인증 정보 만들기 →
   API 키** → 생성된 키 복사해서 보관
   - (권장) 키 옆 **제한사항 수정** → "API 제한사항"에서 **Cloud Vision API만** 허용하도록 제한
6. 무료 티어: 월 1,000건까지 무료, 이후 1,000건당 약 $1.50

## 2. Cloudflare Worker 배포 (대시보드 방식 — 별도 설치 없음)

1. https://dash.cloudflare.com 에서 무료 계정 생성 (이미 있으면 로그인)
2. 왼쪽 메뉴 **Workers & Pages** → **Create** → **Create Worker**
3. 이름 입력 (예: `concrete-ocr-proxy`) → **Deploy** (일단 기본 코드로 배포됨)
4. **Edit code** (Quick edit) 클릭 → 에디터 내용을 전부 지우고 이 폴더의 [`ocr-proxy.js`](ocr-proxy.js) 내용을 그대로 붙여넣기 → **Deploy**
5. Worker 페이지에서 **Settings → Variables** 이동
   - **Secret** 추가: 이름 `GOOGLE_VISION_API_KEY`, 값은 1번에서 받은 키 → 반드시 "Encrypt" 상태로 저장
   - (선택) **Variable** 추가: 이름 `ALLOWED_ORIGIN`, 값은 앱이 실제로 열리는 주소
     (예: `https://your-username.github.io`) — 비워두면 모든 출처를 허용(`*`)합니다
6. Worker의 URL을 복사 (예: `https://concrete-ocr-proxy.your-subdomain.workers.dev`)

이미 Worker가 배포돼 있다면(기존 Gemini용) 새로 만들 필요 없이, 4번(코드 교체)과 5번
(Secret 이름을 `GOOGLE_VISION_API_KEY`로 새로 추가 — 기존 `GEMINI_API_KEY`는 안 지워도 무방)만
다시 하면 됩니다.

## 3. 앱에 연결

`app.js`에서 `CLOUD_OCR_ENDPOINT` 상수를 찾아 5번에서 복사한 URL로 채웁니다(이미 기존 Worker
URL로 연결돼 있다면 그대로 두면 됩니다 — Worker 코드만 바뀌었을 뿐 URL은 그대로예요).

```js
const CLOUD_OCR_ENDPOINT = 'https://concrete-ocr-proxy.your-subdomain.workers.dev';
```

빈 문자열(`''`)로 두면 클라우드 시도 없이 기존 로컬 OCR만 사용합니다.

## 4. (선택) wrangler CLI로 배포하고 싶다면

Node.js가 설치된 PC에서:

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler secret put GOOGLE_VISION_API_KEY
npx wrangler deploy
```

## 참고

- 무료 한도(Cloud Vision 월 1,000건, Cloudflare Worker 하루 100,000회)를 크게 넘지 않는 한 계속 무료입니다.
- 인식 결과는 항상 현장에서 사진과 대조해 확인하세요 — OCR/AI 인식은 완벽하지 않습니다.
