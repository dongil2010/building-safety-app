# Firebase Storage CORS (한글 출력·캔버스용)

점검 화면의 `<img>`는 CORS 없이 보이지만, 한글(HWPX) 임베드는 브라우저에서
이미지 **바이트**를 읽어야 해서 Storage 버킷 CORS가 필요합니다.

## 적용 (PC에 Google Cloud SDK 설치 후)

```powershell
# 버킷 이름은 Firebase 콘솔 Storage와 동일
gsutil cors set storage-cors.json gs://building-safety-app-46821.firebasestorage.app

# 구형 이름이면:
# gsutil cors set storage-cors.json gs://building-safety-app-46821.appspot.com

gsutil cors get gs://building-safety-app-46821.firebasestorage.app
```

적용 후 브라우저 강력 새로고침(캐시에 실패한 CORS 응답이 남아 있을 수 있음).

앱은 CORS가 없어도 Cloudflare Worker 프록시로 한글 출력이 되게 폴백합니다.
(Worker 재배포: `cloudflare-worker/` 참고)
