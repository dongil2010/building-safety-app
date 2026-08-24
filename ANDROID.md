# Android 앱 (Capacitor WebView)

현장 앱은 웹을 APK 안에 넣지 않고, **GitHub Pages 원격 웹**을 Capacitor WebView로 엽니다.

- 주소: `https://dongil2010.github.io/building-safety-app/`
- 설정: `capacitor.config.json` → `server.url`
- **웹 수정은 `git push origin main`이면 충분**합니다. APK OTA는 쓰지 않습니다.
- 현장에서는 앱을 다시 열거나 홈 **새로고침**으로 최신 화면을 받습니다.

카메라 등 네이티브 플러그인을 바꿀 때만 아래처럼 APK를 다시 빌드·설치하면 됩니다.

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
이 APK를 현장에 한 번 설치하면, 이후 기능 배포는 GitHub Pages만으로 됩니다.

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
| WebView | GitHub Pages (`capacitor.config.json` `server.url`) |

## 권한

- **INTERNET** — GitHub Pages·Firebase·CDN
- **CAMERA** — 결함 사진 촬영
- **READ_MEDIA_IMAGES** — 갤러리에서 사진 선택 (Android 13+)

## 주의

- 로그인·동기화·원격 웹 로드는 **인터넷 연결**이 필요합니다.
- 네이티브 앱에서는 Service Worker를 등록하지 않습니다. 웹 캐시는 홈 **새로고침**으로 비울 수 있습니다.
- 카메라 플러그인 등 네이티브 코드를 바꾼 뒤에만 `versionCode` / `versionName`을 올리고 APK를 다시 설치하세요.
