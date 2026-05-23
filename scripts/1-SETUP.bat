@echo off
REM ============================================================
REM   ONE-TIME SETUP - double-click this once.
REM   Installs tools, opens account signup pages, creates repo.
REM ============================================================

title Notes App - One-Time Setup

echo.
echo Starting setup. This will take 10-60 minutes depending on your internet.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0_setup.ps1"
set EC=%ERRORLEVEL%

echo.
if %EC% NEQ 0 (
    echo.
    echo  SETUP EXITED WITH CODE %EC%
    echo  Scroll up to see the error.
) else (
    echo  Setup script finished. See instructions above for the last manual steps.
)
echo.
pause
