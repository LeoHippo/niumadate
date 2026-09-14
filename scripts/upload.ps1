<#
  把项目打包并传到服务器（不想用 git 就走这条路）。

  用法：
    .\scripts\upload.ps1 -Server root@1.2.3.4
    .\scripts\upload.ps1 -Server root@1.2.3.4 -Target /opt/niumadate

  它会先本地构建一次，再把「跑起来需要的那些」打包传过去，
  node_modules 和 .git 都不传（服务器上重新装）。
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Target = '/opt/niumadate',
  [string]$Port = '22'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==> 本地构建' -ForegroundColor Cyan
pnpm build

Write-Host '==> 打包' -ForegroundColor Cyan
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tar = Join-Path $env:TEMP "niumadate-$stamp.tar.gz"

# 只打需要的东西：源码、配置、锁文件、deploy
$include = @(
  'apps', 'packages', 'scripts', 'deploy',
  'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml',
  'README.md', 'docs'
)
$exclude = @('--exclude=node_modules', '--exclude=.git', '--exclude=data', '--exclude=.shots')

tar -czf $tar @exclude $include
Write-Host "    打好了：$tar（$([math]::Round((Get-Item $tar).Length / 1MB, 1)) MB）"

Write-Host '==> 上传' -ForegroundColor Cyan
scp -P $Port $tar "${Server}:/tmp/niumadate.tar.gz"

Write-Host '==> 在服务器上解包' -ForegroundColor Cyan
ssh -p $Port $Server "sudo mkdir -p $Target && sudo tar -xzf /tmp/niumadate.tar.gz -C $Target && sudo chown -R niumadate:niumadate $Target && echo 解包完成"

Remove-Item $tar

Write-Host ''
Write-Host '代码上去了。接着在服务器上跑：' -ForegroundColor Green
Write-Host "  cd $Target && sudo -u niumadate pnpm install --frozen-lockfile && sudo -u niumadate pnpm build"
Write-Host '  sudo systemctl restart niumadate'
