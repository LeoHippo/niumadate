# =====================================================================
#  牛马出约会 —— 一键停止（隧道 + 应用）
#
#  和 start.ps1 一样：中文放这里，.cmd 只当纯 ASCII 启动器。
#  本文件必须带 UTF-8 BOM。
# =====================================================================

$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  牛马出约会 · 停止' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

# ---------- 1. 公网隧道 ----------
Write-Host ''
Write-Host '[1/2] 停公网隧道...' -ForegroundColor Green
$tunnels = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($tunnels) {
  foreach ($t in $tunnels) {
    Write-Host "    停掉 PID $($t.Id)" -ForegroundColor DarkGray
    Stop-Process -Id $t.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
  if (Get-Process cloudflared -ErrorAction SilentlyContinue) {
    Write-Host '    [X] 还有残留，再运行一次这个脚本试试' -ForegroundColor Yellow
  } else {
    Write-Host '    [v] 隧道已停 —— 公网地址现在打不开了' -ForegroundColor Green
  }
} else {
  Write-Host '    [=] 隧道本来就没在跑' -ForegroundColor DarkGray
}

# ---------- 2. 应用 ----------
Write-Host ''
Write-Host '[2/2] 停应用（Docker）...' -ForegroundColor Green
# 注意用 down 而不是 down -v：
#   down     删掉容器，**数据留着**（下次 start 接着用）
#   down -v  连数据卷一起删 —— 所有申请和审批**全部消失**，别手滑
docker compose down 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host '    [v] 容器已删除' -ForegroundColor Green
  Write-Host '        数据还在（下次 start.cmd 起来，记录一条不少）' -ForegroundColor DarkGray
} else {
  Write-Host '    [!] docker compose down 没成功，Docker Desktop 可能没开' -ForegroundColor Yellow
}

# ---------- 3. 现在的状态 ----------
Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '  现在的状态' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan

$stillTunnel = Get-Process cloudflared -ErrorAction SilentlyContinue
$containers = docker ps -a --filter "name=niumadate" --format "{{.Names}} {{.Status}}" 2>$null

Write-Host ''
if (-not $stillTunnel) { Write-Host '  公网隧道：  已停' -ForegroundColor Green } else { Write-Host '  公网隧道：  还在跑' -ForegroundColor Yellow }
if (-not $containers) { Write-Host '  应用容器：  已停' -ForegroundColor Green } else { Write-Host ("  应用容器：  " + ($containers -join ', ')) -ForegroundColor Yellow }

Write-Host ''
Write-Host '  数据（提交记录、后台口令）都在 Docker 数据卷里，没动过。' -ForegroundColor DarkGray
Write-Host '  想连数据一起删干净：docker compose down -v' -ForegroundColor DarkGray
Write-Host '  （除非你确定不要了，别敲那个 -v）' -ForegroundColor DarkGray
Write-Host ''
