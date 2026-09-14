@echo off
REM =====================================================================
REM  Niumadate - one-click stop (tunnel + app)
REM
REM  IMPORTANT: this file must stay pure ASCII.
REM  cmd.exe parses .cmd files using the system ANSI codepage (GBK on
REM  Chinese Windows), so UTF-8 Chinese text turns into mojibake and
REM  breaks the lines apart into garbage commands.
REM
REM  All Chinese messages live in stop.ps1 (written with a UTF-8 BOM).
REM =====================================================================

chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PS=powershell"
where pwsh >nul 2>nul && set "PS=pwsh"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"

echo.
pause
