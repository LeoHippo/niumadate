@echo off
REM =====================================================================
REM  Niumadate - one-click launcher
REM
REM  IMPORTANT: this file must stay pure ASCII.
REM  cmd.exe parses .cmd files using the system ANSI codepage (GBK on
REM  Chinese Windows), so UTF-8 Chinese text turns into mojibake and
REM  breaks the lines apart into garbage commands.
REM
REM  All the Chinese messages live in start.ps1 instead (which we write
REM  with a UTF-8 BOM so PowerShell 5.1 reads it correctly).
REM =====================================================================

chcp 65001 >nul
setlocal
cd /d "%~dp0"

set "PS=powershell"
where pwsh >nul 2>nul && set "PS=pwsh"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

echo.
pause
