# 협업 Git 동기화 규칙

이 프로젝트는 사용자와 회사 직원이 동시에 작업합니다. 작업 마무리·기능 반영·"푸시"/"동기화"/"sync"
요청 시 **항상** 아래 순서를 자동으로 진행합니다 (커밋 확인 → 필요 시 풀 1회 → 커밋 → 푸시 상시):

## 표준 루틴 (커밋 확인 → 풀 1회(필요할 때만) → 커밋 → 푸시)

1. `git fetch origin` 후 `git log HEAD..origin/main`으로 **원격에만 있는 커밋** 확인
2. **원격이 앞선 경우만** pull 1회:
   - 로컬에 미커밋 수정이 있으면 `git stash push -u` → `git pull origin main` → `git stash pop`
   - 충돌이 나면 자동으로 풀지 말고, 충돌 파일/내용을 보여주고 사용자에게 물어봄
3. **내가 직전에 push했고 원격과 같거나(behind 0), 로컬만 앞선 경우** → pull 생략하고 커밋 후 바로 push
4. 변경 파일을 지정해서 `git add` (예: `app.js index.html styles.css js/`, `-A` 금지)
5. 의미 있는 메시지로 `git commit`
6. `git push origin main` — **push 직전 두 번째 pull은 하지 않음**
7. **배포는 GitHub Pages** — 현장 Android 앱은 Capacitor WebView로
   `https://dongil2010.github.io/building-safety-app/` 를 연다. push 후 Pages가
   갱신되면 앱 재실행 또는 홈 **새로고침**으로 최신 웹을 받는다. **APK OTA는 하지 않는다.**

### PowerShell 스크립트

```powershell
.\scripts\git-sync.ps1 -Message "커밋 메시지"
.\scripts\git-sync.ps1 -Message "커밋 메시지" -NoPush  # push만 생략
```

## Cursor 에이전트 동작

- **상시 동기화**: 의미 있는 코드 변경을 마치면 별도 지시 없이도 표준 루틴(커밋 확인 → 필요 시 pull 1회 → commit → push)을 수행
- push 전에 **커밋 요약 + 커밋 메시지**를 짧게 알리고, 곧바로 push까지 진행 (사용자가 "푸시 하지 마" / `-NoPush` 한 경우만 생략)
- `git status`만 단독 요청이면 순수 상태 조회만 (동기화 절차 실행 안 함)
- 임시 폴더(`_tmp_*`, `experiments/` 등)는 커밋하지 않음
