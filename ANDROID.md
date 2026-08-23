# Android 앱 빌드 (Capacitor)

웹 PWA(`index.html`, `app.js` 등)를 **Capacitor WebView**로 감싼 네이티브 Android 앱입니다.  
앱 로직은 그대로 두고, `www/`에 복사한 뒤 Android 프로젝트에 동기화합니다.

## 필요 환경

- Node.js 18+
- **JDK 17** (Android Studio에 포함 — Capacitor 6 기준)
- [Android Studio](https://developer.android.com/studio) + Android SDK
- Windows에서 프로젝트 경로에 **한글**이 있으면 `android/gradle.properties`의 `android.overridePathCheck=true`가 필요합니다(이미 설정됨).

## 최초 1회

```powershell
npm install
npm run android:sync
```

## 웹 수정 후 Android에 반영

```powershell
npm run android:sync
```

`prepare-www.ps1` → `www/` 복사 → `cap sync android` 순서로 실행됩니다.

## Android Studio에서 실행 / APK

```powershell
npm run android:open
```

Android Studio에서 **Run** (실기기 또는 에뮬레이터).

### 디버그 APK (명령줄)

```powershell
npm run android:build:debug
```

생성 위치: `android/app/build/outputs/apk/debug/app-debug.apk`

### 릴리스 APK/AAB

1. Android Studio → **Build → Generate Signed Bundle / APK**
2. 키스토어 생성 후 `release` 빌드

## 앱 내부 업데이트 (사이드로드)

홈 화면 **「앱 업데이트」** 버튼으로 Firestore에 등록된 최신 APK를 내려받아 설치합니다.

### 배포 절차 (관리자)

1. `npm run android:build:debug` (또는 서명된 release APK)로 APK 생성
2. Firebase Console → Storage에 APK 업로드 (예: `releases/app-v1.1.0.apk`) → **다운로드 URL** 복사
3. Firestore에 문서 생성/수정:
   - 경로: `app_meta` / `android_release`
   - 필드 예:
     - `versionCode` (number): `android/app/build.gradle`의 `versionCode`와 **같거나 더 큰 값**
     - `versionName` (string): 예 `"1.1.0"`
     - `apkUrl` (string): Storage 다운로드 URL
     - `notes` (string, 선택): 변경 요약
4. `firestore.rules`의 `app_meta` 규칙을 콘솔에 게시했는지 확인 (로그인 사용자 읽기 허용)
5. 현장 기기에서 앱 로그인 → **앱 업데이트** → 「알 수 없는 앱 설치」허용 → 설치

웹 수정만 반영할 때는 기존처럼 `npm run android:sync` 후 APK를 다시 빌드·배포하고 `versionCode`를 올리면 됩니다.

## 앱 정보

| 항목 | 값 |
|------|-----|
| 패키지 ID | `kr.buildingsafety.inspection` |
| 앱 이름 | 스마트 안전점검 |
| 현재 버전 | versionCode **2** / versionName **1.1.0** |
| WebView | HTTPS 스킴 (`capacitor.config.json`) |

## 권한

- **INTERNET** — Firebase·CDN
- **CAMERA** — 결함 사진 촬영
- **READ_MEDIA_IMAGES** — 갤러리에서 사진 선택 (Android 13+)

## 주의

- Firebase 로그인·동기화는 **인터넷 연결**이 필요합니다.
- Service Worker 오프라인 캐시는 WebView에서도 동작합니다.
- Play Store 배포 시 `versionCode` / `versionName`을 `android/app/build.gradle`에서 올려 주세요.
