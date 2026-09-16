# 콘크리트 강도(R값) 클라우드 OCR 프록시

측정지 사진에서 R값(반발경도)을 **Google Cloud Vision API**(OCR 전용 상품)로 인식하고, API 키는
브라우저에 노출하지 않기 위한 Cloudflare Worker 프록시입니다. `app.js`의 `scanRValuesFromImage`는
이 프록시가 설정돼 있으면 먼저 시도하고, 실패하거나 오프라인이면 기존 로컬(Tesseract) 인식으로
자동 전환합니다.

> 2026-09-04: 원래 Gemini(생성형 AI, 무료 AI Studio 키)를 썼는데, Cloudflare Worker처럼 서버/
> 클라우드에서 오는 요청을 막는 정책("User location is not supported for the API use")에 걸려
> 거의 항상 실패해서 Cloud Vision API로 교체했다. Cloud Vision API는 애초에 서버에서 자동
> 호출하는 용도로 만들어진 정식 OCR 상품이라 이 문제가 없다.
>
> 2026-09-16 실측: Cloud Vision은 도트프린터 측정지 표에서 20개 중 9개꼴로 인식 자체를 실패했다
> (맥락 이해 없이 글자만 읽어서). Gemini는 표 맥락을 이해해서 인식률이 훨씬 높았던 걸로 기억됨 —
> 그래서 `GEMINI_API_KEY`가 설정돼 있으면 **Gemini를 먼저 시도하고, 실패하면 Cloud Vision으로
> 자동 전환**하도록 바꿨다(정확도 + 안정성 둘 다). 아래 "0번" 참고.

## 0. (신규) Gemini 유료 키 추가 — 인식률 올리기

Cloud Vision만으로 인식률이 낮다면, 이미 발급받은 **Cloud Vision용 결제(Billing) 프로젝트**에
Gemini API도 켜서 `GEMINI_API_KEY` Secret을 추가하세요. 무료 AI Studio 키가 겪던 지역 제한은
결제 연결된 프로젝트 키에서는 안 겪을 가능성이 높습니다(단, 100% 보장은 아니라 실패 시 Worker가
자동으로 Cloud Vision으로 넘어가게 이미 만들어뒀습니다).

1. https://aistudio.google.com/apikey 접속
2. **"Get API key"** → **"Create API key"** → 키를 발급받을 프로젝트로, 아래 1번에서 만든
   **Cloud Vision용(결제 연결된) 프로젝트를 선택** (새 프로젝트로 만들지 말 것 — 결제가 안 걸린
   기본 프로젝트로 만들면 예전과 같은 지역 제한을 다시 겪을 수 있음)
3. 생성된 키 복사
4. Cloudflare 대시보드 → 운영 Worker(`frosty-king-12ef`) → **Settings → Variables** →
   **Secret 추가**: 이름 `GEMINI_API_KEY`, 값은 방금 발급받은 키 → "Encrypt" 상태로 저장
   (기존 `GOOGLE_VISION_API_KEY`는 그대로 두세요 — 폴백용으로 계속 씀)
5. ocr-proxy.js 코드 재배포(아래 4번 참고) — 코드가 `GEMINI_API_KEY` 유무를 보고 자동 분기하므로
   URL이나 앱 쪽 코드는 안 바꿔도 됩니다.

이 키만 새로 등록하고 코드를 재배포하면, 다음 OCR 요청부터 자동으로 Gemini가 먼저 시도됩니다.
응답의 `source` 필드(`"gemini"`/`"vision"`)로 실제 어느 쪽이 답했는지 확인할 수 있습니다.

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

## Storage 이미지 프록시 (도면 캔버스 + 한글 HWPX)

같은 Worker가 Storage 바이트 프록시도 처리합니다. **이 코드가 배포돼 있지 않으면**
결함위치도에서 「클라우드에서 도면을 받지 못했습니다」가 납니다.
(2026-09-16 실측: 운영 `frosty-king-12ef` 는 아직 OCR 전용 — `proxyStorage` POST가
「image 필드가 없거나…」로 거절됨.)

요청:

```json
{ "action": "proxyStorage", "url": "https://firebasestorage.googleapis.com/v0/b/…/o/…", "authToken": "<Firebase ID 토큰, 선택>" }
{ "action": "ping" }
```

- 기본 응답: 이미지/PDF **원본 바이트** + CORS (`Access-Control-Allow-Origin`)
- `format: "dataUrl"`: `{ dataUrl }` JSON (2MB 이하, 구 클라)
- `authToken`이 있으면 Storage REST에 `Authorization: Firebase <token>` 을 붙입니다
  (버킷 규칙이 회사 멤버십을 요구하면 토큰 URL만으로는 403)

**ocr-proxy.js를 운영 Worker에 다시 Deploy해야 프록시가 켜집니다.** OCR Secret은 그대로.

앱 쪽은 Worker가 없어도 로그인 상태면 Storage REST(`Firebase` 헤더)로 dataURL을 만들도록
폴백합니다. Worker는 CORS/REST가 막힐 때의 마지막 수단입니다.

## 3. 앱에 연결

`app.js`의 `CLOUD_OCR_ENDPOINT` 는 이미 운영 Worker URL입니다. URL을 바꾸지 말고 **코드만 재배포**하세요.

```js
const CLOUD_OCR_ENDPOINT = 'https://frosty-king-12ef.dongilgujo2010.workers.dev';
```

빈 문자열(`''`)로 두면 클라우드 OCR은 안 쓰고, Storage 프록시도 같은 URL을 쓰므로 비우지 마세요.

## 4. 운영 Worker 재배포 (필수)

클라우드 에이전트는 이 Cloudflare 계정에 배포할 수 없습니다. **현장 PC에서 한 번** 실행하세요.

### wrangler CLI (권장)

Node.js가 있는 PC, 저장소 루트에서:

```bash
cd cloudflare-worker
npx wrangler login
# wrangler.toml 의 name = "frosty-king-12ef" 인지 확인 (새 워커를 만들지 않음)
npx wrangler deploy
```

성공 시 `https://frosty-king-12ef.dongilgujo2010.workers.dev` 가 갱신됩니다.
Secret `GOOGLE_VISION_API_KEY` 는 이미 있으면 다시 넣을 필요 없습니다.

배포 확인:

```bash
curl -sS -X POST https://frosty-king-12ef.dongilgujo2010.workers.dev \
  -H "Content-Type: application/json" \
  --data "{\"action\":\"ping\"}"
# → {"ok":true,"proxyStorage":true}
```

`{"error":"image 필드가 없거나 data URL 형식이 아닙니다."}` 가 나오면 **아직 구버전**입니다.

### 대시보드 (CLI 없이)

1. https://dash.cloudflare.com → Workers & Pages → **frosty-king-12ef** (새로 만들지 말 것)
2. **Edit code** → 에디터 내용을 전부 지우고 이 폴더의 `ocr-proxy.js` + `storage-url-allowlist.js` 를
   반영. 대시보드는 파일 하나라서, `ocr-proxy.js` 맨 위의
   `import { isAllowedStorageUrl } from './storage-url-allowlist.js';` 를 지우고
   `storage-url-allowlist.js` 의 `isAllowedStorageUrl` 함수를 **같은 파일 상단에 붙여 넣은 뒤** Deploy.
3. Settings → Variables 의 `GOOGLE_VISION_API_KEY` Secret은 그대로. 인식률 개선용 `GEMINI_API_KEY`를
   새로 추가하려면 0번 참고.

## 참고

- 무료 한도(Cloud Vision 월 1,000건, Cloudflare Worker 하루 100,000회)를 크게 넘지 않는 한 계속 무료입니다.
- 인식 결과는 항상 현장에서 사진과 대조해 확인하세요 — OCR/AI 인식은 완벽하지 않습니다.
