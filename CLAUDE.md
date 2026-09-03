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

### PowerShell 스크립트

```powershell
.\scripts\git-sync.ps1 -Message "커밋 메시지"
.\scripts\git-sync.ps1 -Message "커밋 메시지" -NoPush  # push만 생략
```

배포 시 스크립트가 `app.js`/`styles.css`/`js/*`의 `?v=`, 화면 `BSA_APP_VERSION`, `sw.js` 등록 URL·캐시 이름을 **같은 시각 토큰**으로 맞춘다. 에이전트가 `?v=`를 손으로 올리지 않아도 된다.

## Cursor 에이전트 동작

- **상시 동기화**: 의미 있는 코드 변경을 마치면 별도 지시 없이도 표준 루틴(커밋 확인 → pull → commit → push 전 pull → push)을 수행
- push 전에 **커밋 요약 + 커밋 메시지**를 짧게 알리고, **항상 pull로 원격 확인 후** push (사용자가 "푸시 하지 마" / `-NoPush` 한 경우만 생략)
- `git status`만 단독 요청이면 순수 상태 조회만 (동기화 절차 실행 안 함)
- 임시 폴더(`_tmp_*`, `experiments/` 등)는 커밋하지 않음
