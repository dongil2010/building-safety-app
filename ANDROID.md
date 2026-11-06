# Android 앱 (Capacitor)

현장 앱 **화면은 APK 안 `www`** 에 들어 있습니다. WebView는 GitHub Pages를 열지 않습니다.

- 화면: Capacitor가 묶은 로컬 자산 (`capacitor.config.json`에 `server.url` 없음, `androidScheme`은 `https`)
- 서버에서 받는 것: **로그인, Firestore 점검 데이터, 사진, 올린 도면**
- **화면을 바꾸려면 APK를 다시 빌드해 설치**해야 합니다. 브라우저용 사이트만 GitHub Pages로 배포됩니다.
- **설치 파일(APK) 업데이트**는 Firebase Storage `releases/latest.json` 을 본다 (`js/core/mobile-app-update.js`). `versionCode`가 설치된 앱보다 크면 받아서 설치 화면을 연다.
- `npm run android:deploy` 가 끝나면 정식 서명 APK와 `releases/latest.json` 을 Storage에 올린다. 앱 번호(`app.js`의 `BSA_APP_BUILD`)를 1 올린 뒤 그 번호로 올린다. 이 PC에서 한 번 `npx firebase-tools login` 이 되어 있어야 한다. APK만 다시 올리려면 `npm run android:upload`.

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

## 정식 서명 APK (2026-11-06, Play 프로텍트 유해 앱 경고 대응)

배포는 `npm run android:deploy`(번호 올림 → 정식 서명 빌드 → 인증서 확인 → 업로드). `npm run android:build:release`는 올리지 않고 `android/app/build/outputs/apk/release/app-release.apk`만 만든다. `npm run android:build:debug`는 개발용이고 올리지 않는다.

- 키는 저장소 밖 `~/.bsa-release/`(이 PC)에만 있다. `release.jks`·`release.pass`·`debug-to-release.lineage` 셋 다 따로 백업한다. 잃어버리면 앱을 더 업데이트할 수 없다.
- 서명 키 교체(APK v3 rotation)라서 Android 9 이상은 앱을 지우지 않고 덮어쓴다. 앱을 지우면 기기의 오프라인 데이터도 지워지므로, 설치 실패 시 지우지 말 것.
- 2026-11-06 전환 완료. 업로드 스크립트가 다른 키·디버그 빌드를 막는다. 키가 없는 PC에서는 빌드가 멈춘다(새 키를 만들면 설치된 앱이 업데이트를 못 받는다). 처음 만들 때만 `--init`.
- 옛 디버그 키(`~/.android/debug.keystore`)가 없는 PC에서는 정식 키 + 키 교체 증명으로 v3 서명만 한다(2026-11-06 앱 번호 38부터). **Android 9 이상만 설치·업데이트되고 Android 8 이하는 안 된다.** 디버그 키도 함께 백업해 둘 것.
