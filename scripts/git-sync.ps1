# Git 동기화: 원격 커밋 확인 → pull → 로컬 수정 재적용 → commit → pull → push → APK OTA
# 사용: .\scripts\git-sync.ps1 -Message "커밋 메시지"
#       .\scripts\git-sync.ps1 -Message "..." -NoPush
#       .\scripts\git-sync.ps1 -Message "..." -NoOta

param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [switch]$NoPush,
    [switch]$NoOta
)

$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

Write-Host "`n=== 1. 로컬 상태 ===" -ForegroundColor Cyan
git status -sb

Write-Host "`n=== 2. 원격 fetch & 앞서 올라간 커밋 확인 ===" -ForegroundColor Cyan
git fetch origin
$behind = [int](git rev-list --count HEAD..origin/main 2>$null)
$ahead  = [int](git rev-list --count origin/main..HEAD 2>$null)
if ($behind -gt 0) {
    Write-Host "원격 main이 로컬보다 ${behind}커밋 앞섬:" -ForegroundColor Yellow
    git log --oneline HEAD..origin/main
} else {
    Write-Host "원격과 동기화됨 (pull 불필요)." -ForegroundColor Green
}
if ($ahead -gt 0) {
    Write-Host "로컬만 있는 커밋 ${ahead}개:" -ForegroundColor Yellow
    git log --oneline origin/main..HEAD
}

$dirty = git status --porcelain
$stashed = $false

if ($dirty) {
    Write-Host "`n=== 3. 로컬 수정 stash ===" -ForegroundColor Cyan
    git stash push -u -m "git-sync WIP $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    $stashed = $true
}

if ($behind -gt 0) {
    Write-Host "`n=== 4. git pull origin main ===" -ForegroundColor Cyan
    git pull origin main
}

if ($stashed) {
    Write-Host "`n=== 5. stash pop (로컬 수정 재적용) ===" -ForegroundColor Cyan
    git stash pop
    if ($LASTEXITCODE -ne 0) {
        Write-Host "충돌 발생 — 수동 해결 후 stash drop 여부 확인." -ForegroundColor Red
        exit 1
    }
}

$dirtyAfter = git status --porcelain
if ($dirtyAfter) {
    Write-Host "`n=== 6. commit ===" -ForegroundColor Cyan
    git add app.js index.html styles.css sw.js js/ scripts/ CLAUDE.md ANDROID.md firestore.rules storage.rules firebase.json android/app/build.gradle android/app/capacitor.build.gradle android/capacitor.settings.gradle package.json
    git diff --cached --stat
    git commit -m $Message
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "`n커밋할 변경 없음." -ForegroundColor Green
}

if ($NoPush) {
    Write-Host "`n-NoPush: push 생략." -ForegroundColor Yellow
} else {
    Write-Host "`n=== 7. push 직전 pull origin main ===" -ForegroundColor Cyan
    git pull origin main
    Write-Host "`n=== 8. git push origin main ===" -ForegroundColor Cyan
    git push origin main
    Write-Host "`nGit 동기화 완료." -ForegroundColor Green
}

if ($NoOta) {
    Write-Host "`n-NoOta: APK OTA 생략." -ForegroundColor Yellow
    exit 0
}

Write-Host "`n=== 9. APK 빌드 & OTA 배포 ===" -ForegroundColor Cyan
$apk = Join-Path (Get-Location) "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) {
    Write-Host "APK 없음 — 디버그 빌드 시작" -ForegroundColor Yellow
    npm run android:build:debug
    if ($LASTEXITCODE -ne 0) { exit 1 }
} else {
    Write-Host "기존 APK 사용: $apk" -ForegroundColor Green
}

node (Join-Path $PSScriptRoot "publish-ota.mjs") --notes $Message
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "`nOTA 배포 완료." -ForegroundColor Green
