#!/bin/bash
set -e

# ============================================
# Baby-Time 微信小程序自动构建 & 上传脚本
# 使用 miniprogram-ci 上传代码到微信后台
# 在服务器上执行: bash mini.sh [version] [desc]
# 示例: bash mini.sh 1.0.0 "修复登录bug"
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLIENT_DIR="$SCRIPT_DIR/apps/client"
DIST_DIR="$CLIENT_DIR/dist"
ENV_FILE="$SCRIPT_DIR/.env"

# 加载配置（优先环境变量，其次 .env 文件）
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

APPID="${WECHAT_APP_ID:-${APPID:-}}"
PRIVATE_KEY_PATH="${PRIVATE_KEY_PATH:-$SCRIPT_DIR/.miniprogram.key}"

VERSION="${1:-1.0.0}"
DESC="${2:-自动上传 $(date '+%Y-%m-%d %H:%M:%S')}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[mini]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# 1. 检查配置
[ -z "$APPID" ] && error "未配置 WECHAT_APP_ID，请在 .env 文件或环境变量中设置"
[ ! -f "$PRIVATE_KEY_PATH" ] && error "未找到上传密钥文件: $PRIVATE_KEY_PATH\n请从微信公众平台下载密钥文件放到项目根目录"

# 2. 检查依赖
command -v node >/dev/null 2>&1 || error "未安装 node"
command -v pnpm >/dev/null 2>&1 || { warn "未安装 pnpm，正在安装..."; npm install -g pnpm; }

# 3. 安装 miniprogram-ci（如果未安装）
if ! node -e "require('miniprogram-ci')" 2>/dev/null; then
    log "安装 miniprogram-ci..."
    npm install -g miniprogram-ci
fi

# 4. 拉取最新代码
if [ -d "$SCRIPT_DIR/.git" ]; then
    log "拉取最新代码..."
    cd "$SCRIPT_DIR"
    git pull origin main || git pull || { warn "git pull 失败，跳过"; }
fi

# 5. 安装依赖
log "安装依赖..."
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 6. 构建小程序
log "构建小程序..."
cd "$CLIENT_DIR"
npm run build

# 7. 上传
log "上传代码到微信后台..."
log "版本: $VERSION"
log "描述: $DESC"

node -e "
const ci = require('miniprogram-ci');
(async () => {
    const project = new ci.Project({
        appid: '$APPID',
        type: 'miniProgram',
        projectPath: '$DIST_DIR',
        privateKeyPath: '$PRIVATE_KEY_PATH',
        ignores: ['node_modules/**/*', '.git/**/*'],
    });
    try {
        const result = await ci.upload({
            project,
            version: '$VERSION',
            desc: '$DESC',
            setting: {
                es6: true,
                es7: true,
                minify: true,
                autoPrefixWXSS: true,
            },
            onProgressUpdate: console.log,
        });
        console.log('上传成功:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('上传失败:', err.message || err);
        process.exit(1);
    }
})();
"

log "上传完成!"
log "请前往微信公众平台 -> 版本管理 -> 开发版本 进行提审"
