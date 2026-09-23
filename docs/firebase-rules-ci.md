# Firestore·Storage 규칙 자동 게시 설정 (한 번만)

`firestore.rules`와 `storage.rules`는 GitHub Pages로 배포되지 않는다. 지금까지는 Firebase
콘솔에 손으로 붙여넣고 게시해야 했고, 그 단계를 빠뜨려서 **코드는 최신인데 규칙은 옛
버전**인 상태가 두 번 생겼다(2026-09-11, 2026-09-17). 앱은 permission-denied로 멈추는데
CI는 초록불이라 원인을 찾는 데 한참 걸렸다.

아래 설정을 한 번 해두면 `main`에 push할 때 규칙이 자동으로 게시된다. 게시에 실패하면
사이트 배포도 같이 멈추므로, 규칙만 옛날인 상태가 더는 조용히 만들어지지 않는다.

소요 시간 약 10분. 이 작업은 사용자(계정 소유자)만 할 수 있다.

---

## 서비스 계정이란 / 어디에 있나

사람 계정이 아니라 **프로그램이 쓰는 계정**이다. GitHub Actions에는 사람이 로그인할 수
없으니, "규칙을 게시할 수 있는 권한만 가진 가짜 사용자"를 하나 만들어 그 열쇠(JSON 파일)를
GitHub에 맡겨 두는 것이다.

사는 곳은 **Google Cloud 콘솔**이다(Firebase 콘솔이 아니다). Firebase 프로젝트는 실제로는
같은 이름의 Google Cloud 프로젝트라서, 두 콘솔이 같은 프로젝트를 다른 화면으로 보여 준다.

다만 Firebase 콘솔에 **이미 만들어져 있는 서비스 계정의 키를 바로 받는 지름길**이 있다.
아래 1-A가 그 길이고, 안 되면 1-B로 직접 만든다.

---

## 1-A. 지름길 — Firebase 콘솔에서 키 받기 (먼저 이것부터)

1. https://console.firebase.google.com/project/building-safety-app-46821/settings/serviceaccounts/adminsdk 접속
   (또는 Firebase 콘솔 → 왼쪽 위 **톱니바퀴 ⚙️** → **프로젝트 설정** → 위쪽 **서비스 계정** 탭)
2. 화면 아래 **`새 비공개 키 생성`** 버튼 클릭 → 경고창에서 **`키 생성`**
3. JSON 파일이 다운로드된다. 끝.

여기서 받는 키는 `firebase-adminsdk-…@building-safety-app-46821.iam.gserviceaccount.com`
계정의 것이다.

> ⚠️ **이 계정은 규칙 게시 권한이 없다** — 2026-09-23에 확인했다. 키만 넣고 돌리면
> `Permission denied to get service [firebasestorage.googleapis.com]` 로 실패한다.
> 그러니 키를 받은 뒤 **1-C로 역할 두 개를 반드시 추가**할 것. 키를 다시 만들 필요는 없다.

## 1-B. 직접 만들기 (1-A가 막혔을 때만)

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=building-safety-app-46821 접속
2. 위쪽 **`+ 서비스 계정 만들기`** 클릭
3. **1단계 서비스 계정 세부정보** — 이름에 `github-rules-deploy` 입력 (ID는 자동으로 채워진다)
   → **`만들고 계속하기`**
4. **2단계 액세스 권한 부여** — `역할 선택` 드롭다운에서 아래 둘을 **각각 `+ 다른 역할 추가`로** 넣는다
   - `Firebase 규칙 관리` (검색창에 **rules** 입력하면 나온다)
   - `서비스 사용량 소비자` (검색창에 **service usage** 입력)
   → **`계속`** → 3단계는 비워 두고 **`완료`**
5. 목록에서 방금 만든 계정의 **이메일을 클릭** → 위쪽 **`키`** 탭
6. **`키 추가`** → **`새 키 만들기`** → 형식 **JSON** 선택 → **`만들기`** → 파일이 다운로드된다

## 1-C. 권한이 모자랄 때만 — 역할 추가

https://console.cloud.google.com/iam-admin/iam?project=building-safety-app-46821 접속 →
해당 서비스 계정 줄의 **연필(수정)** 아이콘 → **`+ 다른 역할 추가`** 로 아래를 넣고 저장:

2026-09-23에 셋 다 필요하다는 걸 한 번에 하나씩 실패해 가며 확인했다. 처음부터 셋을 넣을 것.

| 역할 (검색어) | 왜 필요한가 |
|------|-------------|
| `서비스 사용량 소비자` (service usage) | CLI가 게시 전에 API가 켜져 있는지 조회 |
| `Firebase Storage 뷰어` (firebase storage) | 기본 버킷 정보 읽기. `Firebase 규칙 관리`에는 `firebasestorage.defaultBucket.get`이 없다 |
| `Firebase 규칙 관리` (rules) | 실제 규칙 게시 |

`Firebase Storage 관리자`가 아니라 **뷰어**다. 관리자는 버킷 생성·삭제까지 되는데 배포용
키에 그 권한을 줄 이유가 없다.

> **이 JSON 파일은 비밀번호와 같다.** 채팅·메일·깃에 올리지 말 것. 아래 3번까지 끝내면 지운다.
> (회사 정책으로 키 생성이 막혀 있으면 `서비스 계정 키 생성이 사용 중지됨` 같은 메시지가
> 뜬다. 그때는 조직 관리자에게 문의하거나, 지금처럼 콘솔 수동 게시를 계속 쓰면 된다.)

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
https://github.com/dongil2010/building-safety-app/actions

- 초록 → 콘솔에 자동 게시됨. Firebase 콘솔 규칙 탭에서 최신인지 한 번만 눈으로 확인.
- 빨강 → 로그를 보고 고칠 때까지 **사이트 배포도 안 나간다**(의도한 동작이다).
  급하면 Firebase 콘솔에 손으로 붙여넣어 게시하면 현장은 즉시 복구된다.
  고친 뒤에는 실패한 작업 화면의 **`Re-run jobs`** 로 다시 돌리면 된다(다시 push 안 해도 된다).

### 자주 나오는 실패

| 로그에 보이는 말 | 뜻 / 할 일 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT 시크릿이 없다` | 2번을 안 했거나 이름 오타. 이름은 정확히 `FIREBASE_SERVICE_ACCOUNT` |
| `Permission denied to get service [firebasestorage.googleapis.com]` | 규칙을 올리기 전에 CLI가 "이 API가 켜져 있나"를 먼저 묻는데 그 조회 권한이 없다. → `서비스 사용량 소비자` 추가 |
| `Permission 'firebasestorage.defaultBucket.get' denied` | `Firebase 규칙 관리`에 없는 권한이다. → `Firebase Storage 뷰어` 추가 |
| `PERMISSION_DENIED`, `Missing required permission` | 역할 부족 → 위 **1-C** |
| `Failed to get Firebase project` | 키가 다른 프로젝트 것이거나 JSON을 일부만 붙여넣음. `{`~`}` 전체인지 확인 |
| `Unexpected token … in JSON` | 붙여넣을 때 앞뒤 따옴표를 넣었거나 줄이 잘림. 파일 내용 그대로여야 한다 |
| 규칙 문법 오류 | 줄 번호가 찍힌다. `firestore.rules` 고쳐서 다시 push |

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
