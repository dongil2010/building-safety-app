# Android SDK 경로를 android/local.properties 에 기록 (git 제외)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$AndroidDir = Join-Path $Root 'android'
$LocalProps = Join-Path $AndroidDir 'local.properties'

$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) {
    $default = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $default) { $sdk = $default }
}

if (-not $sdk -or -not (Test-Path $sdk)) {
    Write-Error "Android SDK를 찾을 수 없습니다. Android Studio 설치 후 SDK Manager에서 SDK를 받거나 ANDROID_HOME을 설정하세요."
}

$escaped = ($sdk -replace '\\', '/').Replace(':', '\:')
"sdk.dir=$escaped" | Set-Content -Path $LocalProps -Encoding ASCII
Write-Host "local.properties 생성: $LocalProps"
Write-Host "sdk.dir=$sdk"
