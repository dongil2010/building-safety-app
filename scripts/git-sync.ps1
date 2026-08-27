param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Windows PowerShell 5.1 + git: 한글 커밋 메시지는 반드시 UTF-8 파일(-F)로 전달
function Invoke-GitCommitUtf8 {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommitMessage
    )
    $tmp = Join-Path $env:TEMP ("bsa-git-commit-{0}.txt" -f [guid]::NewGuid().ToString("n"))
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
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
    param([string]$Sha)
    $label = Get-Date -Format "yyyyMMdd_HHmmss"
    $builtAt = (Get-Date).ToString("o")
    $payload = @{
        sha     = $Sha
        short   = $Sha
        label   = $label
        builtAt = $builtAt
    } | ConvertTo-Json -Depth 3
    $path = Join-Path $repoRoot "web-version.json"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($path, $payload, $utf8NoBom)
    Write-Host "web-version.json -> $Sha ($label)"
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

git add app.js index.html styles.css js/ sw.js manifest.json web-version.json scripts/git-sync.ps1
Invoke-GitCommitUtf8 -CommitMessage $Message

$sha = git rev-parse --short HEAD
Write-WebVersionFile -Sha $sha
git add web-version.json
Invoke-GitCommitUtf8 -CommitMessage ("web-version.json 배포 버전 갱신 ({0})" -f $sha)

if (-not $NoPush) {
    git push origin main
}
