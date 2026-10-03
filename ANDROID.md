# Android 앱 (Capacitor)

현장 앱 **화면은 APK 안 `www`** 에 들어 있습니다. WebView는 GitHub Pages를 열지 않습니다.

- 화면: Capacitor가 묶은 로컬 자산 (`capacitor.config.json`에 `server.url` 없음, `androidScheme`은 `https`)
- 서버에서 받는 것: **로그인, Firestore 점검 데이터, 사진, 올린 도면**
- **화면을 바꾸려면 APK를 다시 빌드해 설치**해야 합니다. 브라우저용 사이트만 GitHub Pages로 배포됩니다.
- **설치 파일(APK) 업데이트**는 Firebase Storage `releases/latest.json` 을 본다 (`js/core/mobile-app-update.js`). `versionCode`가 설치된 앱보다 크면 받아서 설치 화면을 연다. 예시는 `scripts/mobile-release.example.json`. APK와 json은 Storage `releases/`에 둔다 (읽기는 공개, 쓰기는 `users/{uid}.otaPublisher == true`).

화면·네이티브 플러그인을 반영할 때는 아래처럼 APK를 다시 빌드·설치합니다.

## 필요 환경

- Node.js 18+
- **JDK 17** (Android Studio에 포함 — Capacitor 6 기준)
- [Android Studio](https://developer.android.com/studio) + Android SDK
- Windows에서 프로젝트 경로에 **한글**이 있으면 `android/gradle.properties`의 `android.overridePathCheck=true`가 필요합니다(이미 설정됨).

## 최초 1회 (네이티브 셸 APK)

```powershell
npm install
npm run android:sync
npm run android:build:debug
```

생성 위치: `android/app/build/outputs/apk/debug/app-debug.apk`  
이 APK를 설치하면 기본 화면이 앱 안에 있습니다. 점검 데이터만 인터넷으로 받습니다. 화면을 고친 뒤에는 APK를 다시 만들어 설치합니다.

## Android Studio에서 실행

```powershell
npm run android:open
```

Android Studio에서 **Run** (실기기 또는 에뮬레이터).

### 릴리스 APK/AAB

1. Android Studio → **Build → Generate Signed Bundle / APK**
2. 키스토어 생성 후 `release` 빌드

## 앱 정보

| 항목 | 값 |
|------|-----|
| 패키지 ID | `kr.buildingsafety.inspection` |
| 앱 이름 | 스마트 안전점검 |
| 화면 | APK 안 `www` (`server.url` 없음) |

## 권한

- **INTERNET** — 로그인·Firestore·사진·도면 (Firebase·Google). 화면 파일은 APK 안
- **CAMERA** — 결함 사진 촬영
- **READ_MEDIA_IMAGES** — 갤러리에서 사진 선택 (Android 13+)

## 주의

- 로그인·동기화·사진·도면은 **인터넷 연결**이 필요합니다. 기본 화면은 APK 안에서 열립니다.
- 네이티브 앱에서는 Service Worker를 등록하지 않습니다. 웹 캐시는 홈 **새로고침**으로 비울 수 있습니다.
- 앱 번호(`versionCode` / `versionName`)는 **웹 앱을 따릅니다** — `android/app/build.gradle`이 빌드 때 `app.js`의 `window.BSA_APP_BUILD = { versionCode, versionName }`(홈 배지의 v번호)를 읽습니다. 번호를 올릴 땐 그 한 줄만 고치고(`versionCode`는 늘 이전보다 크게) APK를 다시 빌드하세요. `build.gradle`의 숫자를 직접 고치지 마세요.
