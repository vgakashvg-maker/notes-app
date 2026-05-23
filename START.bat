@echo off
REM Launches Claude Code in this repo, with the project brief auto-loaded
REM from CLAUDE.md. Double-click to start your dev session.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_start.ps1"

REM If PowerShell exited with an error, pause so the user can read it
REM before the cmd window closes. (Was a real silent-failure bug before.)
if errorlevel 1 (
    echo.
    echo  PowerShell exited with an error. Scroll up to see what went wrong.
    pause
)
