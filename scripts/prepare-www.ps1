# 웹 앱 정적 파일을 Capacitor www/ 로 복사
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Www = Join-Path $Root 'www'

if (Test-Path $Www) {
    Remove-Item $Www -Recurse -Force
}
New-Item -ItemType Directory -Path $Www | Out-Null

$files = @(
    'index.html',
    'app.js',
    'styles.css',
    'sw.js',
    'manifest.json',
    'photo-capture.html',
    'web-version.json'
)
foreach ($file in $files) {
    Copy-Item (Join-Path $Root $file) (Join-Path $Www $file) -Force
}

Copy-Item (Join-Path $Root 'js') (Join-Path $Www 'js') -Recurse -Force
Copy-Item (Join-Path $Root 'templates') (Join-Path $Www 'templates') -Recurse -Force

Write-Host "www/ 준비 완료: $Www"
