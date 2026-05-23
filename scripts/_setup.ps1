$ErrorActionPreference = "Continue"

function Section($t) {
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $t" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
}

function PauseUser($q) {
    Write-Host ""
    Write-Host $q -ForegroundColor Yellow
    [void](Read-Host "Press Enter to continue")
}

# --------------------------------------------------------------
Section "STEP 1 of 4  -  Installing tools (Git, Node, VS Code, etc.)"
# --------------------------------------------------------------

$tools = @(
    @{ id="Git.Git";                       name="Git" },
    @{ id="OpenJS.NodeJS.LTS";             name="Node.js LTS" },
    @{ id="Microsoft.VisualStudioCode";    name="VS Code" },
    @{ id="GitHub.cli";                    name="GitHub CLI" },
    @{ id="Ollama.Ollama";                 name="Ollama" },
    @{ id="tailscale.tailscale";           name="Tailscale" },
    @{ id="Anthropic.Claude";              name="Claude (desktop)" }
)

foreach ($t in $tools) {
    Write-Host ""
    Write-Host "  Installing $($t.name)..." -ForegroundColor Green
    winget install --id $t.id --silent --accept-source-agreements --accept-package-agreements 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK  $($t.name)" -ForegroundColor Green
    } else {
        Write-Host "  SKIPPED  $($t.name) (already installed or not available via winget)" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "  Installing pnpm and Supabase CLI via npm..." -ForegroundColor Green
& npm install -g pnpm supabase 2>&1 | Out-Null

Write-Host ""
Write-Host "  Installing Claude Code CLI via npm..." -ForegroundColor Green
& npm install -g @anthropic-ai/claude-code 2>&1 | Out-Null

Write-Host ""
Write-Host "Tools installed (or already present)." -ForegroundColor Green

# --------------------------------------------------------------
Section "STEP 2 of 4  -  Opening account signup pages in your browser"
# --------------------------------------------------------------

Write-Host ""
Write-Host "I will open 6 browser tabs. Create an account in each (free tier is fine)."
Write-Host "Use the SAME email everywhere (suggested: vgakashvg@gmail.com)."
Write-Host ""
Write-Host "Tabs will open in this order:"
Write-Host "  1. GitHub          (you probably have one - sign in)"
Write-Host "  2. Supabase        (sign in with GitHub)"
Write-Host "  3. Vercel          (sign in with GitHub)"
Write-Host "  4. Tailscale       (sign in with Google)"
Write-Host "  5. Anthropic       (for the build helper)"
Write-Host "  6. Google Cloud    (you have it - just create a new project)"

PauseUser "Press Enter when ready to open the tabs."

Start-Process "https://github.com/signup"
Start-Sleep 1
Start-Process "https://supabase.com/dashboard/sign-up"
Start-Sleep 1
Start-Process "https://vercel.com/signup"
Start-Sleep 1
Start-Process "https://login.tailscale.com/start"
Start-Sleep 1
Start-Process "https://console.anthropic.com/"
Start-Sleep 1
Start-Process "https://console.cloud.google.com/projectcreate"

PauseUser "Go through each tab, create / sign in, then come back and press Enter."

# --------------------------------------------------------------
Section "STEP 3 of 4  -  Creating the project folder C:\Users\vgaka\notes-app"
# --------------------------------------------------------------

$projectDir = "C:\Users\vgaka\notes-app"
if (-not (Test-Path $projectDir)) {
    New-Item -ItemType Directory -Path $projectDir | Out-Null
    Write-Host "  Created: $projectDir" -ForegroundColor Green
} else {
    Write-Host "  Already exists: $projectDir" -ForegroundColor DarkYellow
}

# Copy CLAUDE.md so Claude Code auto-loads it
$claudeTemplate = "$PSScriptRoot\CLAUDE_TEMPLATE.md"
$claudeTarget = "$projectDir\CLAUDE.md"
Copy-Item -Path $claudeTemplate -Destination $claudeTarget -Force
Write-Host "  Copied CLAUDE.md (Claude Code will auto-read this)" -ForegroundColor Green

# Init git repo if not already
Push-Location $projectDir
if (-not (Test-Path "$projectDir\.git")) {
    & git init 2>&1 | Out-Null
    Write-Host "  Initialized git repo" -ForegroundColor Green
}

# .gitignore basics
$gitignoreLines = @(
    "node_modules/",
    ".env",
    ".env.local",
    ".env.*.local",
    "*.log",
    ".next/",
    ".gradle/",
    "build/",
    "app/build/",
    ".idea/",
    ".vscode/",
    "*.iml",
    ".DS_Store"
)
$gitignorePath = Join-Path $projectDir ".gitignore"
Set-Content -Path $gitignorePath -Value $gitignoreLines -Encoding utf8

# .env.example placeholder
$envLines = @(
    "# Fill these in as Claude Code asks for them.",
    "# Copy this file to .env (gitignored) and put your real values there.",
    "SUPABASE_URL=",
    "SUPABASE_ANON_KEY=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "GOOGLE_CLIENT_ID=",
    "GOOGLE_CLIENT_SECRET=",
    "OLLAMA_ENDPOINT_URL=",
    "SENTRY_DSN_WEB=",
    "SENTRY_DSN_ANDROID=",
    "POSTHOG_KEY="
)
$envPath = Join-Path $projectDir ".env.example"
Set-Content -Path $envPath -Value $envLines -Encoding utf8

Pop-Location

Write-Host "  Repo scaffolded at $projectDir" -ForegroundColor Green

# --------------------------------------------------------------
Section "STEP 4 of 4  -  Checking Ollama models on the Legion"
# --------------------------------------------------------------

# Find ollama
$ollamaExe = $null
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    $ollamaExe = $ollamaCmd.Source
} elseif (Test-Path "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe") {
    $ollamaExe = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
}

if (-not $ollamaExe) {
    Write-Host "  Ollama not found. Skipping model check." -ForegroundColor Red
} else {
    # Get current model list
    $existing = @()
    try {
        $listOutput = & $ollamaExe list 2>$null
        foreach ($line in $listOutput) {
            if ($line -match "^(\S+)") {
                $name = $matches[1]
                if ($name -ne "NAME") { $existing += $name }
            }
        }
    } catch {
        Write-Host "  Could not query Ollama. Is the service running?" -ForegroundColor Red
    }

    # What we need:
    #   - One CHAT model (qwen2.5:7b OR llama3.1:8b)
    #   - llama3.2:3b for bulk
    #   - nomic-embed-text for embeddings
    $haveChat   = ($existing -contains "qwen2.5:7b") -or ($existing -contains "llama3.1:8b")
    $haveBulk   = $existing -contains "llama3.2:3b"
    $haveEmbed  = $existing -contains "nomic-embed-text"

    Write-Host ""
    Write-Host "  Already pulled:" -ForegroundColor Cyan
    if ($existing.Count -eq 0) {
        Write-Host "    (none)"
    } else {
        foreach ($e in $existing) { Write-Host "    - $e" }
    }

    Write-Host ""
    Write-Host "  Need:" -ForegroundColor Cyan
    $chatMark = if ($haveChat) { "X" } else { " " }
    $bulkMark = if ($haveBulk) { "X" } else { " " }
    $embMark  = if ($haveEmbed) { "X" } else { " " }
    Write-Host "    [$chatMark] A chat model (qwen2.5:7b OR llama3.1:8b)"
    Write-Host "    [$bulkMark] llama3.2:3b   (bulk tasks)"
    Write-Host "    [$embMark] nomic-embed-text  (embeddings)"

    $toPull = @()
    if (-not $haveChat)  { $toPull += "llama3.1:8b" }
    if (-not $haveBulk)  { $toPull += "llama3.2:3b" }
    if (-not $haveEmbed) { $toPull += "nomic-embed-text" }

    if ($toPull.Count -eq 0) {
        Write-Host ""
        Write-Host "  All required models present. Nothing to pull." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "  Will pull $($toPull.Count) model(s)."
        $resp = Read-Host "  Pull missing models now? (Y/n)"
        $pullModels = $resp.Trim().ToLower()
        if ($pullModels -ne "n") {
            foreach ($m in $toPull) {
                Write-Host ""
                Write-Host "  Pulling $m ..." -ForegroundColor Green
                & $ollamaExe pull $m
            }
        } else {
            Write-Host "  Skipped. Run later:" -ForegroundColor DarkYellow
            foreach ($m in $toPull) { Write-Host "    ollama pull $m" -ForegroundColor DarkYellow }
        }
    }
}

# --------------------------------------------------------------
Section "DONE"
# --------------------------------------------------------------

Write-Host ""
Write-Host "Setup complete. Last 4 things you do MANUALLY:" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Sign in to Tailscale on this PC (system tray icon)."
Write-Host "     Note the Tailscale name - Claude Code will ask for it."
Write-Host ""
Write-Host "  2. Sign in to Tailscale on your Android phone (Play Store)."
Write-Host ""
Write-Host "  3. In a PowerShell window, run:"
Write-Host "       tailscale funnel 11434" -ForegroundColor Cyan
Write-Host "     This exposes Ollama securely so your phone can reach it."
Write-Host ""
Write-Host "  4. Then double-click 2-START.bat to begin building."
Write-Host ""
