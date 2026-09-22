# Firestore·Storage 규칙 자동 게시 설정 (한 번만)

`firestore.rules`와 `storage.rules`는 GitHub Pages로 배포되지 않는다. 지금까지는 Firebase
콘솔에 손으로 붙여넣고 게시해야 했고, 그 단계를 빠뜨려서 **코드는 최신인데 규칙은 옛
버전**인 상태가 두 번 생겼다(2026-09-11, 2026-09-17). 앱은 permission-denied로 멈추는데
CI는 초록불이라 원인을 찾는 데 한참 걸렸다.

아래 설정을 한 번 해두면 `main`에 push할 때 규칙이 자동으로 게시된다. 게시에 실패하면
사이트 배포도 같이 멈추므로, 규칙만 옛날인 상태가 더는 조용히 만들어지지 않는다.

소요 시간 약 10분. 이 작업은 사용자(계정 소유자)만 할 수 있다.

---

## 1. 서비스 계정 키 만들기

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=building-safety-app-46821 접속
2. **서비스 계정 만들기**
   - 이름: `github-rules-deploy` (아무거나 상관없음)
   - 만들고 나면 이메일이 생긴다: `github-rules-deploy@building-safety-app-46821.iam.gserviceaccount.com`
3. **역할(권한) 부여** — 다음 두 가지만 준다. 그 이상은 주지 않는다.
   - `Firebase Rules 관리자` (Firebase Rules Admin)
   - `Firebase 규칙 시스템` 이 안 보이면 `Firebase 관리자` 대신 **`Firebase Develop 관리자`**
     (roles/firebase.developAdmin) 하나로도 된다
4. 만든 서비스 계정 클릭 → **키** 탭 → **키 추가 → 새 키 만들기 → JSON** → 파일이 내려받아진다

> 이 JSON 파일은 비밀번호와 같다. 채팅·메일·깃에 올리지 말 것. 아래 3번까지 끝내면 지운다.

## 2. GitHub Secret에 넣기

1. https://github.com/dongil2010/building-safety-app/settings/secrets/actions 접속
2. **New repository secret**
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Secret: 내려받은 JSON 파일을 **텍스트 편집기로 열어 내용 전체를 그대로 붙여넣기**
     (`{` 로 시작해서 `}` 로 끝나는 그 전체)
3. **Add secret**

## 3. 키 파일 지우기

다운로드 폴더의 JSON 파일을 삭제한다. GitHub Secret에 들어간 뒤로는 필요 없고, PC에
남아 있으면 그냥 위험만 는다. (나중에 다시 필요하면 1번을 다시 하면 된다.)

## 4. 확인

규칙 파일을 건드린 커밋을 push하면 Actions에 **rules** 작업이 뜬다.

- 초록 → 콘솔에 자동 게시됨. Firebase 콘솔 규칙 탭에서 최신인지 한 번만 눈으로 확인.
- 빨강 → 로그를 보고 고칠 때까지 **사이트 배포도 안 나간다**(의도한 동작이다).
  급하면 Firebase 콘솔에 손으로 붙여넣어 게시하면 현장은 즉시 복구된다.

---

## 동작 방식 (나중에 볼 사람용)

`.github/workflows/deploy-web.yml`의 `rules` 작업:

- `firestore.rules` / `storage.rules` / `firebase.json` 이 바뀐 push에서만 배포한다.
  (안 바뀐 push까지 매번 배포하면 Firebase 룰셋 이력만 쌓인다.)
- 시크릿 JSON을 러너 임시 폴더에 잠깐 쓰고 `GOOGLE_APPLICATION_CREDENTIALS`로 넘긴 뒤
  작업이 끝나면 지운다. 로그에는 값이 찍히지 않는다.
- `firebase deploy --only firestore:rules,storage` 만 한다. **functions는 배포하지 않는다**
  (`functions/`는 지금도 손으로 배포한다).
- `deploy`(Pages) 작업이 `needs: rules` 라서, 규칙 배포가 실패하면 사이트도 안 나간다.

Gemini 키를 GitHub Secret으로 넣어 빌드 때만 쓰는 방식과 같은 구조다
(`scripts/prepare-pages.py`, `cloudflare-worker/README.md` 0번 참고).
