#!/usr/bin/env bash
# 更新到最新代码并重启。用法：
#   sudo -u niumadate /opt/niumadate/deploy/update.sh
#
# 假设代码是通过 git 放的（见 docs/DEPLOY.md 的方式 A）。

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/niumadate}"
SERVICE="${SERVICE:-niumadate}"

cd "$APP_DIR"

echo "==> 拉最新代码"
git pull --ff-only

echo "==> 装依赖"
pnpm install --frozen-lockfile

echo "==> 构建"
pnpm build

echo "==> 重启服务"
sudo systemctl restart "$SERVICE"

echo "==> 等它起来"
sleep 2
systemctl is-active --quiet "$SERVICE" && echo "✅ $SERVICE 起来了" || {
  echo "❌ $SERVICE 没起来，看日志：sudo journalctl -u $SERVICE -n 50"
  exit 1
}

echo "==> 跑一次预检"
pnpm preflight || true

echo
echo "更新完成。别忘了：浏览器里刷新一下，确认好友端能打开。"
