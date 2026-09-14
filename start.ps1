# =====================================================================
#  牛马出约会 —— 一键启动（应用 + 公网隧道）
#
#  为什么中文不写在 .cmd 里：
#    cmd.exe 按系统 ANSI（中文 Windows 是 GBK）解析 .cmd 文件，
#    UTF-8 的中文会变成乱码，乱码里再混进引号和问号就会把行拆坏。
#    所以 .cmd 只当启动器（纯 ASCII），中文全在这个 .ps1 里。
#
#  这个文件必须带 UTF-8 BOM，否则 Windows PowerShell 5.1 也会读成乱码。
# =====================================================================

# 这里故意用 Continue，不用 Stop ——
# docker / cloudflared 这些原生命令会把**正常的进度信息写到 stderr**，
# 一旦设成 Stop，PowerShell 就会把「Container xxx Running」这种正常输出
# 当成致命错误直接中断。原生命令的成败一律看 $LASTEXITCODE。
$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$cf = 'E:\tools\cloudflared.exe'
$log = Join-Path $root 'tunnel.log'
$url = 'http://localhost:8787'

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  牛马出约会 · 一键启动' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

if (-not (Test-Path $cf)) {
  Write-Host ''
  Write-Host "[X] 找不到 cloudflared：$cf" -ForegroundColor Red
  Write-Host '    下载：https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
  exit 1
}

# ---------- 已经在跑就别重复起 ----------
# 随机隧道的地址是进程启动时分配的。再起一个会拿到**新地址**，
# 把之前发给朋友的链接废掉，所以先检查。
$running = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($running) {
  Write-Host ''
  Write-Host "[=] 隧道已经在跑了（PID $($running.Id)），不重复启动" -ForegroundColor Yellow
} else {
  Write-Host ''
  Write-Host '[1/2] 启动应用（Docker）...' -ForegroundColor Green
  # 2>&1 | Out-Null：docker 把**正常的进度信息写到 stderr**，
  # 不吞掉的话 PowerShell 会把它当错误信息打出来，看着像失败了。
  # 成败只看 $LASTEXITCODE。
  docker compose up -d 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host ''
    Write-Host '[X] docker compose 失败 —— Docker Desktop 开了吗？' -ForegroundColor Red
    exit 1
  }

  Write-Host ''
  Write-Host '[2/2] 启动公网隧道...' -ForegroundColor Green

  # 记下当前日志有多少行。日志是**追加**的，跑几次就攒下几个地址，
  # 直接取「最后一条」有可能拿到之前那个已经死掉的隧道地址。
  # 所以下面只在这条线之后的新内容里找。
  $linesBefore = 0
  if (Test-Path $log) { $linesBefore = @(Get-Content $log -ErrorAction SilentlyContinue).Count }

  # --logfile 是**全局参数，必须写在 tunnel 前面**。
  # 写在后面不生效，地址就会随刷屏丢掉。
  Start-Process -FilePath $cf -ArgumentList @(
    '--logfile', $log,
    'tunnel', '--url', $url, '--no-autoupdate'
  ) -WindowStyle Minimized

  Write-Host '    等隧道建立连接（约 15 秒）...' -ForegroundColor DarkGray
  Start-Sleep -Seconds 16
}

# ---------- 把地址捞出来 ----------
Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  你的公网地址' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$found = $null
if (Test-Path $log) {
  # 优先只看这次新增的部分
  $tail = @(Get-Content $log -ErrorAction SilentlyContinue) | Select-Object -Skip $linesBefore
  $hit = $tail | Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($hit) { $found = $hit.Matches[0].Value }

  # 没找到就退回全量找（比如隧道本来就在跑、这次没重启）
  if (-not $found) {
    $all = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
      Select-Object -Last 1
    if ($all) { $found = $all.Matches[0].Value }
  }
}

Write-Host ''
if ($found) {
  Write-Host "  $found" -ForegroundColor Green
  Write-Host ''
  Write-Host "  后台：$found/admin" -ForegroundColor Gray
} else {
  Write-Host '  (日志里还没出现地址 —— 再运行一次这个脚本就行)' -ForegroundColor Yellow
  Write-Host "  也可以自己看：$log" -ForegroundColor DarkGray
}

# ---------- 后台口令 ----------
Write-Host ''
Write-Host '  后台口令：' -NoNewline -ForegroundColor Gray
$pw = docker compose exec -T app cat /data/admin-password 2>$null
if ($LASTEXITCODE -eq 0 -and $pw) {
  Write-Host ($pw -join '').Trim() -ForegroundColor White
} else {
  Write-Host '(取不到，容器可能没在跑)' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  停掉隧道：   taskkill /im cloudflared.exe /f' -ForegroundColor DarkGray
Write-Host '  查看地址：   findstr trycloudflare tunnel.log' -ForegroundColor DarkGray
Write-Host ''
