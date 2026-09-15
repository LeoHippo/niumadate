# =====================================================================
#  牛马出栏约会 —— 一键启动（应用 + 公网隧道）
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

# ---------- 找 cloudflared ----------
# **不写死路径** —— 别人机器上它可能在 PATH 里，也可能在别的地方。
# 查找顺序：环境变量 CLOUDFLARED → PATH → 和本脚本同目录 → 常见安装位置。
function Find-Cloudflared {
  if ($env:CLOUDFLARED -and (Test-Path $env:CLOUDFLARED)) { return $env:CLOUDFLARED }
  $onPath = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $beside = Join-Path $PSScriptRoot 'cloudflared.exe'
  if (Test-Path $beside) { return $beside }
  $places = @(
    (Join-Path $env:LOCALAPPDATA 'cloudflared\cloudflared.exe'),
    (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
    (Join-Path $env:USERPROFILE 'cloudflared.exe')
  )
  foreach ($p in $places) { if (Test-Path $p) { return $p } }
  return $null
}

$cf = Find-Cloudflared
$log = Join-Path $root 'tunnel.log'
$url = 'http://localhost:8787'

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  牛马出栏约会 · 一键启动' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

if (-not $cf) {
  Write-Host ''
  Write-Host '[X] 找不到 cloudflared。三选一：' -ForegroundColor Red
  Write-Host '    1. 下载到本目录（和 start.cmd 放一起）'
  Write-Host '    2. 放进 PATH'
  Write-Host '    3. 设环境变量 CLOUDFLARED 指向它'
  Write-Host ''
  Write-Host '    下载地址：' -ForegroundColor DarkGray
  Write-Host '    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -ForegroundColor DarkGray
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

  # 两种隧道：
  #   有命名隧道（~/.cloudflared/config.yml 存在）→ 用它，地址是**固定**的
  #   没有 → 退回快速隧道，地址是随机的，重启就变
  # 建命名隧道的步骤见 docs/TUNNEL.md，跑一次就一直有。
  $namedConfig = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
  if (Test-Path $namedConfig) {
    $script:fixedHost = (Select-String -Path $namedConfig -Pattern '^\s*-\s*hostname:\s*(\S+)' |
      Select-Object -First 1).Matches[0].Groups[1].Value
    Write-Host "    发现命名隧道，用固定地址：$script:fixedHost" -ForegroundColor Green
    # 不带参数运行：cloudflared 自己会读 config.yml
    Start-Process -FilePath $cf -ArgumentList @('--logfile', $log, 'tunnel', 'run') -WindowStyle Minimized
    Write-Host '    等隧道建立连接（约 15 秒）...' -ForegroundColor DarkGray
    Start-Sleep -Seconds 16
    $script:useFixed = $true
  } else {
    Write-Host '    (没找到命名隧道，用快速隧道 —— 地址每次重启都会变)' -ForegroundColor DarkGray
    Start-Process -FilePath $cf -ArgumentList @(
      '--logfile', $log,
      'tunnel', '--url', $url, '--no-autoupdate'
    ) -WindowStyle Minimized
    Write-Host '    等隧道建立连接（约 15 秒）...' -ForegroundColor DarkGray
    Start-Sleep -Seconds 16
    $script:useFixed = $false
  }

  # 记下当前日志有多少行。日志是**追加**的，跑几次就攒下几个地址，
  # 直接取「最后一条」有可能拿到之前那个已经死掉的隧道地址。
  # 所以下面只在这条线之后的新内容里找。
  $linesBefore = 0
  if (Test-Path $log) { $linesBefore = @(Get-Content $log -ErrorAction SilentlyContinue).Count }

}

# ---------- 把地址捞出来 ----------
Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  你的公网地址' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$found = $null

# 命名隧道：地址是**固定**的，直接从 config.yml 读，不用去日志里捞
if ($script:useFixed -and $script:fixedHost) {
  $found = "https://$script:fixedHost"
} else {
  # 快速隧道：地址随机，只能从日志里找
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
}

Write-Host ''
if ($found) {
  Write-Host "  $found" -ForegroundColor Green
  Write-Host ''
  if ($script:useFixed) {
    Write-Host '  ↑ 固定地址，重启也不会变' -ForegroundColor DarkGray
  } else {
    Write-Host '  ↑ 临时地址，重启就换新的' -ForegroundColor DarkGray
  }
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
if ($script:useFixed) {
  Write-Host '  地址永远是这个，不用记：https://' -NoNewline -ForegroundColor DarkGray
  Write-Host $script:fixedHost -ForegroundColor DarkGray
} else {
  Write-Host '  查当前地址： findstr trycloudflare tunnel.log' -ForegroundColor DarkGray
}
Write-Host ''
