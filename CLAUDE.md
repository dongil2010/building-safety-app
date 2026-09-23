# 협업 Git 동기화 규칙

이 프로젝트는 사용자와 회사 직원이 동시에 작업합니다. 작업 마무리·기능 반영·"푸시"/"동기화"/"sync"
요청 시 **항상** 아래 순서를 자동으로 진행합니다 (커밋 확인 → 풀 → 커밋 → **푸시 전 다시 풀** → 푸시):

## 표준 루틴 (커밋 확인 → 풀 → 커밋 → 푸시 전 풀 → 푸시)

1. `git fetch origin` 후 `git log HEAD..origin/main`으로 **원격에만 있는 커밋** 확인
2. **푸시 전에 항상 pull** 한다 (원격이 앞서지 않아도 생략하지 않음):
   - 로컬에 미커밋 수정이 있으면 `git stash push -u` → `git pull origin main` → `git stash pop`
   - 충돌이 나면 자동으로 풀지 말고, 충돌 파일/내용을 보여주고 사용자에게 물어봄
3. 커밋 전에도 동일하게 pull 1회로 원격과 맞춘다
4. 변경 파일을 지정해서 `git add` (예: `app.js index.html styles.css js/`, `-A` 금지)
5. 의미 있는 메시지로 `git commit`
6. **`git push` 직전에 다시 `git pull origin main`으로 확인**한 뒤 `git push origin main`
7. **배포는 GitHub Pages** — 현장 Android 앱은 Capacitor WebView로
   `https://dongil2010.github.io/building-safety-app/` 를 연다. push 후 Pages가
   갱신되면 앱 재실행 또는 홈 **새로고침**으로 최신 웹을 받는다. **APK OTA는 하지 않는다.**
   (2026-09-16부터: Pages Source가 "Deploy from a branch"가 아니라 **GitHub Actions**로
   바뀜 — `.github/workflows/deploy-web.yml`이 `scripts/prepare-pages.py`로 `_site/`를
   만들어 배포한다. push하면 자동으로 이 워크플로가 돌아가는 건 그대로 동일하다.)

## ⚠️ Gemini API 키 — 공개 배포 전 반드시 다시 볼 것

`app.js`의 `GEMINI_DIRECT_API_KEY`(R값 OCR)는 **브라우저에서 Gemini를 직접 호출**하는 구조라
키가 F12(개발자도구)로 그대로 보인다. git에는 안 남지만(`scripts/prepare-pages.py`가 GitHub
Actions 배포 시점에만 주입, [cloudflare-worker/README.md](cloudflare-worker/README.md) 0번
참고), **브라우저 노출 자체는 막을 방법이 없다.**

**왜 지금은 괜찮은가**: 로그인해야 쓰는 내부 직원 전용 도구라 사용자 수가 적고, AI Studio에
월 지출 한도를 걸어둬서 유출돼도 피해가 제한됨. (이 키는 서비스 계정 인증 키라 Cloud Console의
도메인/API 제한 자체를 못 건다 — 지출 한도가 유일한 안전장치.)

**이 앱을 회사 밖 불특정 다수/일반 사용자에게 배포하자는 이야기가 나오면, 진행 전에 반드시
이 문제를 사용자에게 알릴 것.** 그때는 지금 구조로는 부족하고, Worker 쪽에서 Gemini를 안전하게
부르는 방법(예: Vertex AI + OAuth, 또는 다른 OCR 벤더)으로 다시 바꿔야 한다.
(배경: 원래 Worker에서 Gemini를 불렀는데 엣지 서버 위치 제한으로 거의 항상 실패해서 — 유료
결제로도 해결 안 됨 — 어쩔 수 없이 브라우저 직접 호출로 옮긴 것. 2026-09-16.)

### PowerShell 스크립트

```powershell
.\scripts\git-sync.ps1 -Message "커밋 메시지"
.\scripts\git-sync.ps1 -Message "커밋 메시지" -NoPush  # push만 생략
```

배포 시 스크립트가 `app.js`/`styles.css`/`js/*`의 `?v=`, 화면 `BSA_APP_VERSION`, `sw.js` 등록 URL·캐시 이름을 **같은 시각 토큰**으로 맞춘다. 에이전트가 `?v=`를 손으로 올리지 않아도 된다.

## Cursor 에이전트 동작

- **상시 동기화**: 의미 있는 코드 변경을 마치면 별도 지시 없이도 표준 루틴(커밋 확인 → pull → commit → push 전 pull → push)을 수행
- push 전에 **커밋 요약 + 커밋 메시지**를 짧게 알리고, **항상 pull로 원격 확인 후** `git push origin main` (사용자가 "푸시 하지 마" / `-NoPush` 한 경우만 생략)
- ⚠️ **보안 규칙 파일은 자동 push 대상이 아니다.** `firestore.rules` / `storage.rules` / `firebase.json`이
  바뀐 변경은 **커밋까지만 하고 멈춰서 사람에게 확인받는다.** 무엇이 어떻게 바뀌는지(누가 무엇을
  읽고 쓸 수 있게 되는지) 먼저 설명하고, 사람이 "올려"라고 해야 push한다.
  이유: 2026-09-23부터 `main`에 push하면 `.github/workflows/deploy-web.yml`이 규칙을 **운영에 자동
  게시**한다. 규칙은 회사 데이터 전체를 지키는 문지기인데, 느슨해져도 앱은 멀쩡히 돌아가서 티가
  안 난다 — 다른 버그와 달리 조용히 나간다. 설정 절차는 [docs/firebase-rules-ci.md](docs/firebase-rules-ci.md).
- 사용자가 **깃 커밋/푸시**라고 하면 작업 브랜치만이 아니라 **`main`에 합쳐 GitHub Pages 배포까지** 한다
- `git status`만 단독 요청이면 순수 상태 조회만 (동기화 절차 실행 안 함)
- 임시 폴더(`_tmp_*`, `experiments/` 등)는 커밋하지 않음
