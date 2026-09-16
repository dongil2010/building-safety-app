# Firebase Storage CORS · 도면/한글 바이트 로드

결함위치도 캔버스와 한글(HWPX) 임베드는 이미지 **바이트**(data URL)가 필요합니다.
`<img src="https://…">` 만으로는 캔버스가 tainted 되거나 `crossOrigin=anonymous` 에서 실패합니다.

## 로드 순서 (클라이언트)

1. Storage `downloadURL` + 로그인 토큰 (`Authorization: Firebase <idToken>`) fetch
2. Storage REST `…/o/<path>?alt=media` 동일 헤더 (compat SDK에 `getBlob` 없음)
3. Cloudflare Worker `proxyStorage` (운영: `https://frosty-king-12ef.dongilgujo2010.workers.dev`)
4. 그래도 data URL이 아니면 도면 빈 화면: 「클라우드에서 도면을 받지 못했습니다」

버킷 CORS가 없어도 1–2는 `firebasestorage.googleapis.com` 의 API CORS(`*`, `Authorization` 허용)로
동작해야 합니다. 예전 코드는 `Bearer` 헤더를 써서 규칙이 있는 객체에서 실패했습니다.

## 버킷 CORS (선택, gsutil)

```powershell
gsutil cors set storage-cors.json gs://building-safety-app-46821.firebasestorage.app
gsutil cors get gs://building-safety-app-46821.firebasestorage.app
```

구형 이름이면 `gs://building-safety-app-46821.appspot.com` (이 프로젝트 GET 은 404).

## Worker 재배포 (프록시 폴백)

에이전트는 Cloudflare 계정에 배포할 수 없습니다. 사용자가 실행:

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

확인: `POST { "action": "ping" }` → `{"ok":true,"proxyStorage":true}`.
자세한 절차는 `cloudflare-worker/README.md`.
