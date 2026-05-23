@echo off
REM Launches Claude Code in this repo, with the project brief auto-loaded
REM from CLAUDE.md. Double-click to start your dev session.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\_start.ps1"
