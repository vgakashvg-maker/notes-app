@echo off
title Push to GitHub
color 0B

set GH=C:\Program Files\GitHub CLI\gh.exe
set GIT=C:\Program Files\Git\cmd\git.exe
set PROJECT=C:\Users\vgaka\notes-app

cd /d %PROJECT%

echo.
echo ============================================
echo   Pushing notes-app to GitHub
echo ============================================
echo.

REM Check auth status
"%GH%" auth status >nul 2>&1
if errorlevel 1 (
    echo You need to authenticate with GitHub first.
    echo.
    echo When prompted, choose:
    echo   - GitHub.com
    echo   - HTTPS
    echo   - Yes (authenticate Git)
    echo   - Login with a web browser
    echo.
    echo A code will appear. Copy it.
    echo Press Enter to open the browser.
    echo.
    pause
    "%GH%" auth login
    if errorlevel 1 (
        echo.
        echo  Login failed. Try again.
        pause
        exit /b 1
    )
)

echo.
echo  Authenticated. Pushing main branch...
echo.

"%GIT%" push -u origin main
if errorlevel 1 (
    echo.
    echo  Push failed. See error above.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Done! Your code is on GitHub.
echo   CI workflows will start running in ~30 sec.
echo   See: https://github.com/vgakashvg-maker/notes-app/actions
echo ============================================
echo.
pause
