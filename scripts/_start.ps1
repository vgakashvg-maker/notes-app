$ErrorActionPreference = "Stop"

$Host.UI.RawUI.WindowTitle = "Notes App - Claude Code"

# Resolve every known location where Claude Code might be installed.
$localApp = $env:LOCALAPPDATA
$roaming  = $env:APPDATA

$candidates = @(
    (Join-Path $localApp "npm-global\node_modules\@anthropic-ai\claude-code\bin\claude.exe"),
    (Join-Path $roaming  "npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"),
    "C:\Tools\npm-global\node_modules\@anthropic-ai\claude-code\bin\claude.exe",
    (Join-Path $localApp "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude-code\2.1.146\claude.exe")
)

$exe = $null
$attempted = @()
foreach ($p in $candidates) {
    $attempted += $p
    try {
        if ([System.IO.File]::Exists($p)) { $exe = $p; break }
    } catch { }
}

# Fallback: ask Get-Command for anything on PATH
if (-not $exe) {
    try {
        $cmd = Get-Command claude -ErrorAction SilentlyContinue
        if ($cmd) { $exe = $cmd.Source }
    } catch { }
}

if (-not $exe) {
    Write-Host ""
    Write-Host " ERROR: Could not find Claude Code at any of these paths:" -ForegroundColor Red
    foreach ($p in $attempted) { Write-Host ("   - " + $p) -ForegroundColor DarkGray }
    Write-Host ""
    Write-Host " To reinstall, run this in a regular PowerShell window:" -ForegroundColor Yellow
    Write-Host '   & "C:\Program Files\nodejs\npm.cmd" install -g @anthropic-ai/claude-code'
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host "  Claude Code is starting..." -ForegroundColor Cyan
Write-Host "  Folder: C:\Users\vgaka\notes-app" -ForegroundColor Cyan
Write-Host ("  Using:  " + $exe) -ForegroundColor DarkGray
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host ""

# Build PATH by concatenation so the parser does not get confused by
# colon-prefixed env vars adjacent to backslashes. (The previous version
# using "$env:APPDATA\npm" inside a double-quoted string tripped the
# Windows PowerShell 5.1 parser — that was the START.bat bug.)
$pathParts = @(
    "C:\Program Files\nodejs",
    (Join-Path $roaming  "npm"),
    (Join-Path $localApp "npm-global"),
    $env:PATH
)
$env:PATH = $pathParts -join ";"

# Go to project folder
Set-Location "C:\Users\vgaka\notes-app"

# Launch Claude Code with no permission prompts
& $exe --dangerously-skip-permissions

Write-Host ""
Write-Host " Session ended. Press Enter to close." -ForegroundColor DarkGray
Read-Host | Out-Null
