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

## OTA 자동 업데이트 (현장 APK 교체 불필요)

현장 기기는 **로그인만 하면** Firestore에 등록된 새 APK를 자동 감지합니다.

### 현장 사용자 (기사)

1. 앱 실행 → 로그인
2. 새 버전이 있으면 **홈 배너** + 확인창 표시
3. 「지금 업데이트」 → APK 다운로드 → Android 설치 화면
4. 최초 1회만 「알 수 없는 앱 설치」 허용 필요
5. 「나중에」 누르면 6시간 후 다시 알림 (「앱 업데이트」 버튼으로 언제든 가능)

### 관리자 배포 (PC, 1회 설정 + 이후 2클릭)

#### 1) Firebase 규칙 게시 (최초 1회)

- Firestore: `firestore.rules` → 콘sole Rules 탭에 붙여넣고 **게시**
- Storage: `storage.rules` → Storage Rules 탭에 붙여넣고 **게시**

#### 2) OTA 배포 권한 부여 (최초 1회)

Firebase Console → Firestore → `users/{본인 uid}` 문서에 필드 추가:

```json
{ "otaPublisher": true }
```

#### 3) 새 버전 배포 (매 릴리스)

1. `android/app/build.gradle`에서 `versionCode` 올리기 (정수, 이전보다 커야 함)
2. `app.js`의 `window.BSA_APP_BUILD`도 같은 값으로 맞추기
3. `npm run android:build:debug` (또는 서명 release APK)
4. PC 브라우저에서 앱 로그인 → 홈 **「OTA 배포」** → APK 선택 → 변경 메모 입력
5. 업로드 완료 → **현장 모든 앱이 실시간으로 감지** (앱 재시작 불필요)

Firestore 문서 `app_meta/android_release` 예:

| 필드 | 설명 |
|------|------|
| `versionCode` | 설치된 앱보다 **큰** 정수 |
| `versionName` | 표시용 `"1.2.0"` |
| `apkUrl` | Storage 다운로드 URL (OTA 배포 버튼이 자동 설정) |
| `notes` | 변경 요약 (선택) |
| `mandatory` | `true`면 「나중에」 없이 강제 알림 |

### 최초 APK만 수동 설치

OTA는 **이미 설치된 앱 위에** 동작합니다. 팀에 처음 배포할 때만 `app-debug.apk`를 한 번 설치하면, 이후는 OTA만으로 충분합니다.

## 앱 정보

| 항목 | 값 |
|------|-----|
| 패키지 ID | `kr.buildingsafety.inspection` |
| 앱 이름 | 스마트 안전점검 |
| 현재 버전 | versionCode **4** / versionName **1.2.0** |
| WebView | HTTPS 스킴 (`capacitor.config.json`) |

## 권한

- **INTERNET** — Firebase·CDN·OTA 다운로드
- **CAMERA** — 결함 사진 촬영
- **READ_MEDIA_IMAGES** — 갤러리에서 사진 선택 (Android 13+)
- **REQUEST_INSTALL_PACKAGES** — OTA APK 설치

## 주의

- Firebase 로그인·동기화·OTA는 **인터넷 연결**이 필요합니다.
- Service Worker 오프라인 캐시는 WebView에서도 동작합니다.
- Play Store 배포 시 `versionCode` / `versionName`을 `android/app/build.gradle`에서 올려 주세요.
