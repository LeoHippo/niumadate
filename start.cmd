@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

set CF=E:\tools\cloudflared.exe
set LOG=%~dp0tunnel.log

echo ============================================
echo   牛马出约会 - 一键启动（应用 + 公网隧道）
echo ============================================
echo.

if not exist "%CF%" (
  echo [X] 找不到 cloudflared: %CF%
  echo     下载地址: https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
  pause
  exit /b 1
)

REM ---------- 已经在跑的话就别重复起 ----------
REM 随机隧道的地址在进程启动时分配，再起一个会拿到另一个新地址，
REM 反而把之前发给朋友的链接废掉了，所以这里先检查。
tasklist /fi "imagename eq cloudflared.exe" 2>nul | find /i "cloudflared.exe" >nul
if not errorlevel 1 (
  echo [=] 隧道已经在跑了，不重复启动
  goto :show
)

REM ---------- 1. 应用 ----------
echo [1/2] 启动应用（Docker）...
docker compose up -d
if errorlevel 1 (
  echo [X] docker compose 失败 —— Docker Desktop 开了吗？
  pause
  exit /b 1
)

REM ---------- 2. 隧道 ----------
echo [2/2] 启动公网隧道...
REM 用 start /min 让它在一个最小化的独立窗口里跑，
REM 这样这个脚本窗口关掉它也不受影响。
REM --logfile 是**全局参数，必须写在 tunnel 前面** —— 写在后面不生效，
REM 地址就会随着刷屏丢掉，这是踩过的坑。
start "cloudflared" /min "%CF%" --logfile "%LOG%" tunnel --url http://localhost:8787 --no-autoupdate

echo.
echo 等隧道建立连接...
timeout /t 15 /nobreak >nul

:show
echo.
echo ============================================
echo   你的公网地址（在下面这一行里找 https://...）
echo ============================================
if exist "%LOG%" (
  findstr /i /c:"trycloudflare.com" "%LOG%"
) else (
  echo    [日志还没生成] 等十几秒，再双击一次这个脚本就行
)
echo.
echo   后台口令：
docker compose exec -T app cat /data/admin-password 2>nul
echo.
echo ============================================
echo   这个窗口可以关掉，隧道在另一个最小化窗口里继续跑
echo   要停掉隧道： taskkill /im cloudflared.exe /f
echo ============================================
echo.
pause
