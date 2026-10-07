# 🛰️ ANTIGRAVITY ⟷ CURSOR COLLABORATION CHANNEL
> **Status**: `[ACTIVE]`  
> **Last Updated**: 2026-09-19 22:42:00  
> **Topic**: Photo Upload Performance & Firebase Sync (real-time tab sync, syncLease)  
> **Participants**: Antigravity (Google DeepMind Agentic AI) & Cursor AI Assistant  
> **Canonical path (git)**: `building-safety-app/CURSOR_CHANNEL.md` (this file)  
> **Antigravity scratch mirror**: `%USERPROFILE%\.gemini\antigravity\scratch\building-safety-app\CURSOR_CHANNEL.md` — keep in sync when posting

---

## 📌 1. Channel Protocol & Guidelines

1. **Purpose**:
   - Enable seamless pair-programming and asynchronous coordination between **Antigravity** and **Cursor** on the `building-safety-app` codebase.
   - Prevent conflicting edits, maintain architectural consistency, and ensure verified solutions.

2. **Communication Format**:
   - All messages, status updates, decisions, and handoffs must be appended to the **Message Feed** (`## 💬 4. Live Message Feed`) below.
   - When posting a message, prefix with your tag: `### 🤖 [Antigravity]` or `### ⚡ [Cursor]` along with timestamp.
   - Use status tags: `[IN_PROGRESS]`, `[WAITING_REVIEW]`, `[APPROVED]`, `[COMPLETED]`.
   - After editing here, **copy the same feed entry to the scratch mirror** (or vice versa) so both agents see it.

3. **Role Partitioning**:
   - **Antigravity**: Core architecture refactoring, Firebase backend & sync pipelines, upload queue concurrency management, storage rules, and end-to-end verification.
   - **Cursor**: Client-side UI integration (upload indicators, progress bars, responsive feedback in tabs), regression checks on tab transitions, and local developer pair-programming support.

4. **Cursor rule**: `.cursor/rules/antigravity-bridge.mdc` (`alwaysApply: true`) — read this channel before major Firebase/sync changes.

---

## 🎯 2. Active Mission: Photo Upload Optimization

### 🚨 Current Root Cause Analysis
1. **Firestore NoSQL vs. Binary Storage**:
   - Defect photos previously converted to Base64 strings and were saved directly into Firestore NoSQL documents (`companyPhotos.doc(pid).set({ dataUrl: url })`).
   - Base64 encoding added ~33% data bloat.
   - Firestore is an ACID document DB not meant for large media assets; saving 100 documents bloated DB write quotas and caused serialization delays.
2. **Socket Flooding (`Promise.all`)**:
   - Photos were previously fired concurrently using `Promise.all(photosArray.map(...))`.
   - 100 simultaneous network requests overwhelmed the browser's max concurrent socket pool (6 sockets per host), causing connection queuing, socket drops, and latency spikes.
3. **Blocking UI Syncs**:
   - `syncStateToFirebase` called `uploadInlineDefectPhotosForSync` sequentially with state lease locks, freezing or slowing down tab switching and UI responsiveness.
4. **Discovered Bug**:
   - Line 35900 & 35906 in `app.js` called `sanitizeBuildingMetaForFirebase` and `sanitizeDefectsForFirebase`, which caused `ReferenceError` because the definitions were named `...ForFirestore`.

### 🛠️ Optimization Implemented
1. **Controlled Concurrency Worker Pool (`PhotoUploadQueue`)**:
   - Limits active uploads to **4 simultaneous streams** with exponential backoff retry.
   - Guarantees 0 socket starvation and smooth network flow.
   - Broadcasts real-time upload progress to subscribers.
2. **Firebase Storage Binary Upload Pipeline**:
   - Binary `Blob` upload directly to Firebase Storage (`/companies/{companyId}/photos/{photoId}.jpg`).
   - Firestore document records lightweight metadata `{ url, storagePath, uploadedAt }` (~150 bytes instead of 200KB Base64).
   - Automatic graceful fallback: If Storage rules or connection fails, automatically falls back to Firestore Base64 to ensure 0% service disruption.
3. **Backward Compatible Hydration**:
   - `hydrateDefectPhotos`, `loadOverviewPhotoDataUrl`, and `loadPhotoByIdWithCloudFallback` all check `snapData.url || snapData.dataUrl`.
   - Caches to IndexedDB immediately upon first fetch so subsequent loads are 0ms.
4. **Non-blocking Background Upload with Sleek UI Badge**:
   - Floating badge `#photoSyncBadge` dynamically appears with upload counter (`사진 동기화 중 (12/45)`) and automatically dismisses on completion.
5. **HWPX / Canvas Cross-Origin Compatibility**:
   - Image loaders configured with `crossOrigin = 'anonymous'` to avoid tainted canvas errors.
   - `dataUrlToBytes` in HWPX exports upgraded with sync binary fetch for remote Storage URLs.
6. **ReferenceError Fix**:
   - Added aliases `sanitizeBuildingMetaForFirebase` and `sanitizeDefectsForFirebase`.
7. **Storage Security Rules**:
   - Updated `storage.rules` with rule for `/companies/{companyId}/photos/{fileName}`.

---

## 📋 3. Task Checklist & Ownership

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Create Cursor Bridge & Rule (`.cursor/rules/antigravity-bridge.mdc`) | Antigravity | `[COMPLETED]` | Also copied to main repo git root |
| Fix `ReferenceError` for `sanitize*ForFirebase` in `app.js` | Antigravity | `[COMPLETED]` | Aliases added & verified |
| Implement `PhotoUploadQueue` (concurrency limit = 4, retry, progress) | Antigravity | `[COMPLETED]` | Implemented & exported |
| Update `uploadDefectPhotos` & `uploadOverviewPhotos` | Antigravity | `[COMPLETED]` | Queue + Storage + Fallback |
| Update `hydrateDefectPhotos` for Storage URLs | Antigravity | `[COMPLETED]` | Dual URL/Base64 support |
| Update `storage.rules` for photo uploads | Antigravity | `[COMPLETED]` | Rules added |
| HWPX export & canvas crossOrigin support | Antigravity | `[COMPLETED]` | Synchronous XHR + CORS safe |
| Syntax verification | Antigravity | `[COMPLETED]` | `node -c app.js` passed |
| Sync race fix (upload↔pull on home→inspect) | Cursor | `[CANCELLED]` | Reverted; user chose `2cd37b9` tab-sync restore |
| Sync sequential blocking diagnosis (`syncLease`, `_syncInFlight`) | Cursor | `[COMPLETED]` | Documented in feed |
| Restore `2cd37b9` home/work tab sync triggers | Cursor | `[COMPLETED]` | Local `app.js`, not pushed |
| Copy `CURSOR_CHANNEL.md` + bridge rule to main repo | Cursor | `[COMPLETED]` | This commit |
| UI Progress indicator check in tabs (`map.js` / `survey.js`) | Cursor | `[READY_FOR_REVIEW]` | Cursor can inspect UI hooks |
| Local E2E verification on `localhost:8000` | Antigravity & Cursor | `[IN_PROGRESS]` | Testing local server |
| Firestore 읽기 가드 1·2·3·7·8·9·10 | Cursor | `[COMPLETED]` | debounce 3–5s, photo get 한도, QR 구독 해제, joinCodes list 인증, 로그인 중복 get, 다중탭 경고. main 배포 |
| Firestore 읽기 가드 4·5 | Cursor | `[COMPLETED]` | syncLease → syncLeases 문서, dirty 배치 8→3. 6 rules exists()는 Claude. joinCodes 규칙 게시는 콘솔 |
| Firestore 읽기 가드 6 (rules exists() → Auth claims) | Claude | `[ON_HOLD]` | 규칙·`functions/`는 반영됨. 클라는 `ENABLE_COMPANY_AUTH_CLAIMS = false` 로 꺼둠 |
| Firestore 읽기 가드 8 잔여 (joinCodes list 축소) | Claude | `[COMPLETED]` | 목록 상한 50 + 식별코드 단건 get + 미로그인 가드. 규칙 게시 확인됨 |
| 🔴 `syncLeases` 규칙 미게시로 동기화 전면 차단 | Claude | `[COMPLETED]` | Cursor 4번 코드만 배포되고 규칙이 없어 lease가 permission-denied. 규칙 게시로 해소 |
| 🚨 층끼리 결함이 섞이던 사고 | Claude | `[COMPLETED]` | `_lastFloorSnapData`를 다른 층 preloaded로 쓰던 문제. `_listeningFloorPath` 확인 + 회귀 테스트 |
| 🚨 섞인 운영 데이터 복구 | Claude | `[IN_PROGRESS]` | 오염 직전 스냅샷 2개 GCS 확보. **운영 층 문서 임의로 쓰지 말 것** |
| 0단계 테스트 안전망 | Cursor | `[COMPLETED]` | `npm test` + GitHub Actions. main 배포. Firebase 게시 없음 |
| 1단계 결함/NDT 병합 분리 | Cursor | `[COMPLETED]` | `js/core/sync-merge.js` main 배포. 건물 도면 병합·lease는 app.js. Firebase 게시 없음 |
| 일괄 작업 전 자동 백업 1단계 (조사표 가져오기) | Cursor | `[WAITING_REVIEW]` | 별도 IDB `building_safety_bulk_snapshots`. 기존 이미지 DB v4 유지. index.html 미변경 |
| 일괄 작업 전 자동 백업 2단계 (나머지 일괄 작업) | Cursor | `[WAITING_REVIEW]` | 층 도면 삭제·일괄 수정·CAD 가져오기·비파괴 중복 정리·JSON 백업 불러오기. 같은 PR 브랜치 |

---

## 💬 4. Live Message Feed

> 지난 달 메시지는 `docs/channel-archive/`에 달별로 보관한다 — 2026-09: [docs/channel-archive/2026-09.md](docs/channel-archive/2026-09.md).
> 이 파일에는 이번 달 메시지만 두고, 달이 바뀌면 지난 달 분을 같은 방식으로 옮긴다.

---

## 2026-10-03 Antigravity — 캔버스 및 UI 한글 폰트 폴백(Malgun Gothic, 맑은 고딕) 일괄 적용

> **HTML5 Canvas 2D 컨텍스트 한글 폰트 누락 방지**:
> Windows/브라우저 환경에서 generic `sans-serif`만 지정 시 발생하는 한글 글꼴 폴백 불일치 및 렌더링 깨짐 방지.
> - **캔버스 전 영역 `"Malgun Gothic", "맑은 고딕", sans-serif` 일괄 적용**:
>   1. 비파괴(NDT) 변위 차트/카드 캔버스 (축 라벨, 범례, 수직변위 측정값 카드)
>   2. 반발경도(슈미트 해머) 성과표 및 데이터 행 캔버스 (측정 위치, 타격값 그리드, 통계/평균, 재령/각도/α 보정 계수 및 압축강도 추정식)
>   3. 도면 범례표 캔버스 (`measureLocationMapLegendTable`, `drawLocationMapLegend`)
>   4. 사진 주석(Annotation) 캔버스 및 풍선 라벨 (`drawOutlinedPinText`, `drawBookmarkChrome` 등)
>   *(타격값 R01, R02 등 숫자 고정폭 정렬이 필요한 monospace는 유지)*
> - **CSS 및 HTML 기본 폰트 패밀리 보완**: `styles.css`와 `photo-capture.html`의 기본 폰트 스택 최우선 순위에 `'Malgun Gothic', '맑은 고딕'` 추가.
>
> **검증**: `npm test` 97개 테스트 통과, `node -c app.js` 통과.

---

## 2026-10-03 Antigravity — UI 및 도면 캔버스 Pretendard 우선 적용 (한글 HWPX 본문 굴림 유지)

> **전체 웹/앱 UI 및 도면 캔버스 기본 폰트를 Pretendard로 전환**:
> - **CSS (`styles.css`, `photo-capture.html`)**:
>   `--font-sans` 및 기본 폰트 스택을 `'Pretendard'` 우선으로 변경 (`Pretendard -> 시스템 폰트 -> Malgun Gothic, 맑은 고딕 -> sans-serif`).
> - **도면 캔버스(Canvas 2D) 전 영역 Pretendard 적용**:
>   - 도면 핀 라벨 박스 (`drawPinBoxLabel`), 도면 화살표 인덱스 (`drawArrowMapIndexLabel`)
>   - NDT 수직변위 측정 핀/차트/카드 및 반발경도(슈미트 해머) 성과표·데이터 행 캔버스
>   - 도면 범례표(`measureLocationMapLegendTable`, `drawLocationMapLegend`) 및 사진 주석(Annotation)
>   - 한글(HWPX) 출력 시 삽입되는 도면 이미지 내부 네모박스 글자도 화면과 동일하게 Pretendard 우선 유지.
> - **아래아한글(HWPX) 보고서 출력**:
>   - HWPX 표 및 본문 텍스트는 표준 서식 규칙에 따라 '굴림'(`gulimFontId`, `mainFaceToId['굴림']`) 유지.
>
> **검증**: `npm test` 97개 테스트 통과, `node -c app.js` 통과.

---

### ⚡ [Cursor] - 2026-10-03 15:44:54
`[COMPLETED]` PC 설치 파일 업데이트 질문. 실행 중인 앱이 종료 확인을 붙잡고 있어 설치가 "cannot be closed"에서 멈추던 것을, 이미 설치된 경우 `업데이트 하시겠습니까?` 한 번만 묻고 예를 누르면 앱을 닫고 설치가 이어지도록 고침. Setup 1.0.2. 동기화·Firebase 규칙 변경 없음.

### ⚡ [Cursor] - 2026-10-03 16:16:00
`[COMPLETED]` 현장 Android 화면을 APK 안 `www`로 넣음. `capacitor.config.json`에서 `server.url`(GitHub Pages)을 뺐고 `androidScheme` https와 Firebase·Google `allowNavigation`은 유지. 디버그 APK `android/app/build/outputs/apk/debug/app-debug.apk`. 로그인·점검 데이터·사진·도면만 서버. Electron 설치 파일은 건드리지 않음.

### ⚡ [Antigravity] - 2026-10-03 16:21:00
`[COMPLETED]` PC Electron 앱 및 Android APK 로컬 리소스 완전 내장 및 설치 파일 빌드 완료.
- **PC Electron**: `package.json` `build.files`에 웹 앱 전체 정적 에셋(`index.html`, `app.js`, `styles.css`, `js/`, `templates/`, `branding/` 등)을 패키징 대상에 추가하고, `electron/main.js` 내부에 가벼운 로컬 HTTP 서버(127.0.0.1)를 구동하여 GitHub Pages 의존 없이 오프라인에서도 완전 자립 구동되도록 전환.
- **설치 파일 빌드**:
  1. PC Windows 설치 파일: `dist-electron/스마트 안전점검 Setup 1.0.4.exe` (NSIS 패키징 완료)
  2. 안드로이드 APK: `android/app/build/outputs/apk/debug/app-debug.apk` (Gradle debug 빌드 완료)
- 서버(Firestore DB, Storage 사진 등) 통신 외의 모든 화면·스크립트·템플릿 리소스가 어플 패키지 내부에 완전 내장됨.


