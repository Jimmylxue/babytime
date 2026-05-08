#!/bin/bash
set -e

# ============================================
# Baby-Time 服务端自动部署脚本
# 使用 PM2 管理 NestJS 服务
# 在服务器上执行: bash start.sh
# ============================================

APP_NAME="baby-time-server"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/apps/server"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# 1. 检查依赖
command -v node >/dev/null 2>&1 || error "未安装 node，请先安装 Node.js >= 18"
command -v pnpm >/dev/null 2>&1 || { warn "未安装 pnpm，正在安装..."; npm install -g pnpm; }
command -v pm2 >/dev/null 2>&1 || { warn "未安装 pm2，正在安装..."; npm install -g pm2; }

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VER" -lt 18 ] && error "Node.js 版本需要 >= 18，当前: $(node -v)"

# 2. 拉取最新代码（如果是 git 仓库）
if [ -d "$SCRIPT_DIR/.git" ]; then
    log "拉取最新代码..."
    cd "$SCRIPT_DIR"
    git pull origin main || git pull || { warn "git pull 失败，跳过"; }
fi

# 3. 安装依赖
log "安装依赖..."
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 4. 构建服务端
log "构建服务端..."
cd "$SCRIPT_DIR"
npm run build:server

# 5. PM2 启动/重启
log "使用 PM2 启动服务..."

# 先删除旧进程（如果存在）
pm2 delete "$APP_NAME" 2>/dev/null || true

# 启动新进程
cd "$SERVER_DIR"
pm2 start dist/main.js \
    --name "$APP_NAME" \
    --max-memory-restart 512M \
    --log-date-format "YYYY-MM-DD HH:mm:ss" \
    --merge-logs \
    --env production

# 6. 保存 PM2 进程列表（服务器重启后自动恢复）
pm2 save

log "部署完成!"
log "查看日志: pm2 logs $APP_NAME"
log "查看状态: pm2 status"
log "重启服务: pm2 restart $APP_NAME"
