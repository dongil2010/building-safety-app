# app.js가 조각으로 나뉩니다 — 작업 방법 안내

정병수 님께. app.js가 7만 4천 줄(4MB)까지 커져서 **파일만 16개로 나눴습니다.**
앱 동작은 한 글자도 안 바뀌었습니다. 다만 **고치는 곳이 바뀌니** 아래만 꼭 봐 주세요.

## 한 줄 요약

> **이제 `app.js`가 아니라 `app/` 폴더 안의 조각을 고치고, 고친 뒤 `node scripts/app-parts.js join`을 실행합니다.**

## 무엇이 바뀌었나

- `app/01-base.js` … `app/16-backup-auth-init.js` — **이게 진짜 원본**입니다.
- `app.js` — 조각을 이어 붙여 **자동으로 만드는 파일**이 됐습니다. 브라우저·APK·테스트·배포는 지금처럼 `app.js`를 씁니다.
- 조각 경계 표시(`// @@app-part …` 주석 줄)만 빼면 app.js는 나누기 전과 바이트까지 같습니다(해시로 확인함). 테스트 284개 전부 통과.
- Cursor에서는 `app.js`가 숨겨집니다(`.cursorignore`). Cursor AI가 검색하거나 고칠 때 자동으로 조각 쪽을 보게 하려는 것입니다. 규칙은 `.cursor/rules/app-parts.mdc`에 넣어 두어 Cursor 에이전트도 알고 있습니다.

## 조각 목록 (어디를 고칠지)

| 파일 | 내용 |
|------|------|
| `01-base.js` | 알림·오프라인 배지·저장 엔진·다기기 병합 |
| `02-buildings.js` | 탭·현장 관리·건물 등록·수정 |
| `03-canvas.js` | 도면 캔버스·핀/박스 색·크기·모양 |
| `04-ndt-disp.js` | 비파괴: 변위·부재실측·측기 이동 보정 |
| `05-ndt-strength.js` | 비파괴: 강도·탄산화·입력창 |
| `06-defect-edit.js` | 결함: 회차·전차 사진·통합·되돌리기 |
| `07-defect-component.js` | 부재 명칭·메모 |
| `08-defect-presets.js` | 결함 종류·원인 프리셋 |
| `09-settings-input-camera.js` | 색상 설정 모달·도면 마우스/터치·휴대폰 카메라 |
| `10-marking.js` | 버튼·영역 마킹 |
| `11-cad-import.js` | CAD 핀 가져오기 |
| `12-survey-table.js` | 조사표·사진첩·범례·출력 범위 |
| `13-report-export.js` | 미리보기·PDF·**한글 출력**(건들지 않는 구간 통째로 여기) |
| `14-extras.js` | 필터·사진 주석·음성·엑셀 |
| `15-firebase-sync.js` | Firebase 동기화 |
| `16-backup-auth-init.js` | 백업·회사 설정·인증·초기화 |

함수 이름으로 찾으면 됩니다(Cursor 검색이 알아서 조각에서 찾아 줍니다).

## 평소 작업 순서

1. `app/` 안의 조각을 고친다.
2. 터미널에서 `node scripts/app-parts.js join` → app.js가 다시 만들어진다.
3. **`app/`와 `app.js`를 같이** 커밋·푸시한다.
   - `scripts/git-sync.ps1`을 쓰면 커밋 전에 알아서 맞추고(`sync`) 확인(`check`)까지 하고, `app/`도 같이 올립니다.

## 깜빡했을 때

- **join을 안 하고 푸시** → GitHub Actions 배포 전 확인(`check`)에서 멈춥니다. 현장에 잘못된 코드가 나가지는 않지만 **배포가 안 됩니다.** `join` 하고 다시 올리면 됩니다.
- **습관대로 app.js를 직접 고침** → `node scripts/app-parts.js split`(또는 `sync`)이 그 수정을 조각에 되돌려 넣어 줍니다. 망가지지 않습니다.
- 지금 상태가 맞는지 궁금하면 → `node scripts/app-parts.js check`. 어긋났으면 무엇을 하면 되는지 한국어로 알려 줍니다.
- `npm test`도 맨 앞에서 이 확인을 합니다.

## 충돌이 났을 때

- **조각(`app/*.js`)만 풉니다.** `app.js` 충돌은 손대지 마세요.
- 조각을 다 푼 뒤 `node scripts/app-parts.js join --force` → app.js가 깨끗하게 다시 만들어집니다.
- `check`가 "양쪽 다 고친 조각"이라고 하면, 그 조각을 직접 맞춘 뒤 `join --force`.

## 콘솔 오류 줄 번호 찾기

브라우저 콘솔에 `app.js:52370`처럼 나오면:

```
node scripts/app-parts.js where 52370
→ app.js:52370 → app/13-report-export.js:879
```

## 하지 말 것

- 각 조각 **1번 줄 안내 주석(`// @@app-part …`)은 지우지 않기.** 코드에 `// @@app-part`로 시작하는 줄을 새로 쓰지 않기(경계 표시 전용).
- 한 함수를 두 조각에 걸치게 자르지 않기. 조각은 혼자 실행되지 않습니다 — 전부 `DOMContentLoaded` 함수 하나의 일부라 변수를 서로 공유합니다.
- 한글 출력 구간(`HWPX 균열 게이지·팁 측정결과` ~ `removeSingleDefectRecord`)은 예전처럼 건들지 않기. `13-report-export.js` 안에 통째로 있습니다.

## 올리는 날 부탁

나누는 커밋은 **날짜를 맞춰서** 현장 작업 없는 시간에 올리겠습니다(배포하면 현장 기기가 다 새로고침됩니다).

- **그 전날까지 app.js 고친 것을 전부 푸시**해 주세요. 나중에 옛 app.js 수정이 들어오면 충돌이 커집니다.
- 그날은 app.js를 고치지 말아 주세요.
- 올린 뒤에는 **pull 받고 위 순서대로** 작업하시면 됩니다.

궁금한 점은 `CLAUDE.md`의 「app.js 조각」 절이나 `scripts/app-parts.js` 맨 위 설명을 보시면 됩니다.
