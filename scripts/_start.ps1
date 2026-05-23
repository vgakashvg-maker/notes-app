$ErrorActionPreference = "Stop"

$Host.UI.RawUI.WindowTitle = "Notes App - Claude Code"

# Try every known location where Claude Code might be installed.
# Use [IO.File]::Exists which bypasses some PowerShell access checks
# that Test-Path is subject to under restricted contexts.
$candidates = @(
    "$env:LOCALAPPDATA\npm-global\node_modules\@anthropic-ai\claude-code\bin\claude.exe",
    "$env:APPDATA\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe",
    "C:\Tools\npm-global\node_modules\@anthropic-ai\claude-code\bin\claude.exe",
    "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude-code\2.1.146\claude.exe"
)

$exe = $null
$attempted = @()
foreach ($p in $candidates) {
    $attempted += $p
    try {
        if ([System.IO.File]::Exists($p)) {
            $exe = $p
            break
        }
    } catch { }
}

# Last-resort fallback: ask Get-Command (it searches PATH and registered exe locations)
if (-not $exe) {
    try {
        $cmd = Get-Command claude -ErrorAction SilentlyContinue
        if ($cmd) {
            $exe = $cmd.Source
        }
    } catch { }
}

if (-not $exe) {
    Write-Host ""
    Write-Host " ERROR: Could not find Claude Code at any of these paths:" -ForegroundColor Red
    foreach ($p in $attempted) { Write-Host "   - $p" -ForegroundColor DarkGray }
    Write-Host ""
    Write-Host " Try reinstalling — open a regular PowerShell and run:" -ForegroundColor Yellow
    Write-Host '   & "C:\Program Files\nodejs\npm.cmd" install -g @anthropic-ai/claude-code'
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host ""
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host "  Claude Code is starting..." -ForegroundColor Cyan
Write-Host "  Folder: C:\Users\vgaka\notes-app" -ForegroundColor Cyan
Write-Host "  Using:  $exe" -ForegroundColor DarkGray
Write-Host " ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  First message to send: status" -ForegroundColor Yellow
Write-Host ""

# Make sure node and npm globals are on PATH
$env:PATH = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:LOCALAPPDATA\npm-global;$env:PATH"

# Go to project folder
Set-Location "C:\Users\vgaka\notes-app"

# Launch Claude Code with no permission prompts
& $exe --dangerously-skip-permissions

Write-Host ""
Write-Host " Session ended. Press Enter to close." -ForegroundColor DarkGray
Read-Host | Out-Null
