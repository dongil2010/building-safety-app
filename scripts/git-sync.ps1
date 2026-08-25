param(
    [Parameter(Mandatory = $true)]
    [string]$Message,
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

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
    Set-Content -Path (Join-Path $repoRoot "web-version.json") -Value $payload -Encoding UTF8
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
git commit -m $Message
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$sha = git rev-parse --short HEAD
Write-WebVersionFile -Sha $sha
git add web-version.json
git commit -m "web-version.json 배포 버전 갱신 ($sha)"

if (-not $NoPush) {
    git push origin main
}
