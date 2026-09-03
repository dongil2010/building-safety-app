param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Get-Utf8Text {
    param([Parameter(Mandatory = $true)][string]$Path)
    [System.IO.File]::ReadAllText($Path, $utf8NoBom)
}

function Set-Utf8Text {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

# Windows PowerShell 5.1 + git: 한글 커밋 메시지는 반드시 UTF-8 파일(-F)로 전달
function Invoke-GitCommitUtf8 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommitMessage
    )
    $tmp = Join-Path $env:TEMP ("bsa-git-commit-{0}.txt" -f [guid]::NewGuid().ToString("n"))
    $text = ($CommitMessage -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd() + "`n"
    [System.IO.File]::WriteAllText($tmp, $text, $utf8NoBom)
    try {
        & git -c i18n.commitEncoding=utf-8 commit -F $tmp
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
    }
    finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Write-WebVersionFile {
    param(
        [Parameter(Mandatory = $true)][string]$Sha,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $builtAt = (Get-Date).ToString("o")
    $payload = @{
        sha     = $Sha
        short   = $Sha
        label   = $Label
        builtAt = $builtAt
    } | ConvertTo-Json -Depth 3
    $path = Join-Path $repoRoot "web-version.json"
    [System.IO.File]::WriteAllText($path, $payload, $utf8NoBom)
    Write-Host "web-version.json -> $Sha ($Label)"
}

# app.js / styles.css / js/* 쿼리, 화면 버전, SW 등록 URL·캐시 이름을 같은 시각 토큰으로 맞춤
function Update-CacheBustTokens {
    param([Parameter(Mandatory = $true)][string]$Label)

    $indexPath = Join-Path $repoRoot "index.html"
    $html = Get-Utf8Text -Path $indexPath
    $html = [regex]::Replace($html, 'href="styles\.css\?v=[^"]+"', ('href="styles.css?v={0}"' -f $Label))
    $jsRepl = '${1}?v=' + $Label + '"'
    $html = [regex]::Replace($html, '(src="(?:app\.js|js/[^"]+\.js))\?v=[^"]+"', $jsRepl)
    $html = [regex]::Replace($html, "window\.BSA_APP_VERSION = '[^']*'", ("window.BSA_APP_VERSION = '{0}'" -f $Label))
    $html = [regex]::Replace($html, "register\('\./sw\.js\?v=[^']+'\)", ("register('./sw.js?v={0}')" -f $Label))
    Set-Utf8Text -Path $indexPath -Text $html

    $swPath = Join-Path $repoRoot "sw.js"
    $sw = Get-Utf8Text -Path $swPath
    $sw = [regex]::Replace($sw, "const CACHE_NAME = '[^']*'", ("const CACHE_NAME = 'building-safety-v{0}'" -f $Label))
    Set-Utf8Text -Path $swPath -Text $sw

    Write-Host "cache-bust -> $Label"
}

git fetch origin 2>&1 | Out-Null
$remoteAhead = git log HEAD..origin/main --oneline 2>$null
if ($remoteAhead) {
    $dirty = git status --porcelain
    if ($dirty) {
        git stash push -u -m "git-sync autostash"
        git pull origin main
        git stash pop
    } else {
        git pull origin main
    }
}

$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to commit."
    exit 0
}

$label = Get-Date -Format "yyyyMMdd_HHmmss"
Update-CacheBustTokens -Label $label

git add app.js index.html styles.css js/ sw.js manifest.json web-version.json scripts/git-sync.ps1 CLAUDE.md
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "No staged changes to commit."
    exit 0
}

Invoke-GitCommitUtf8 -CommitMessage $Message

$sha = git rev-parse --short HEAD
Write-WebVersionFile -Sha $sha -Label $label
git add web-version.json
Invoke-GitCommitUtf8 -CommitMessage ("web-version.json 배포 버전 갱신 ({0})" -f $sha)

if (-not $NoPush) {
    git push origin main
}
