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
ENV_FILE="$SCRIPT_DIR/.env"

# 读 .env：PORT 用于部署后验收，SERVERCHAN_KEY 用于回滚告警。
# 与 mini.sh 同一套 source 方式（mini.sh 生产一直在跑，说明这份 .env 可被 bash 安全 source）。
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi
PORT="${PORT:-3000}"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# 运维告警：出事时服务本身可能正是坏的，不能指望应用自己推，在脚本里直发。
# 失败绝不阻断主流程（告警只是让你早知道，不是部署的一部分）。
alert_ops() {
    local title="$1" desp="$2"
    if [ -z "${SERVERCHAN_KEY:-}" ]; then
        warn "SERVERCHAN_KEY 未配置，本条告警只写在本机输出：$title"
        return 0
    fi
    # SendKey 按 Server酱 接口约定只能放 URL 路径，会短暂出现在 ps 输出里；单机环境可接受
    curl -s --max-time 8 -G "https://sctapi.ftqq.com/${SERVERCHAN_KEY}.send" \
        --data-urlencode "title=$title" --data-urlencode "desp=$desp" >/dev/null 2>&1 \
        || warn "Server酱 推送失败（不影响主流程）"
    return 0
}

# 部署后验收：/health 现在会真查库（SELECT 1），所以「ok」同时代表
# HTTP 栈在听、DI 起来了、DB 连得上；再打一个走控制器的只读接口确认路由与库表可用。
verify_live() {
    local base="http://127.0.0.1:${PORT}"
    local i
    for i in $(seq 1 30); do
        if curl -sf --max-time 3 "$base/api/health" 2>/dev/null | grep -q '"status":"ok"'; then
            if curl -sf --max-time 5 "$base/api/announcement/current" >/dev/null 2>&1; then
                return 0
            fi
        fi
        sleep 1
    done
    return 1
}

# 启动参数集中在这里，回滚路径复用，避免两处漂移
pm2_start_with() {
    cd "$SERVER_DIR"
    pm2 start dist/main.js \
        --name "$APP_NAME" \
        --max-memory-restart 512M \
        --log-date-format "YYYY-MM-DD HH:mm:ss" \
        --merge-logs \
        "$@" \
        --env production
}

# kill-timeout 为什么是 25s：应用收到信号后会排空在途请求（见 main.ts 的 shutdown hooks），
# 最长的在途是便便 AI 那 20s 智谱调用。PM2 默认 1600ms 就 SIGKILL，等于优雅停机白做
# —— 实测未调优前光是空闲 keep-alive 就要 6.4s，默认值必然来不及。
# 但本机 pm2 是否接受这个命令行参数没法在这里验证，而「delete 成功、start 失败」
# 正是会把服务直接弄挂的失效模式，所以做成探测式回退：不认就退回原参数并告警，
# 服务照常起来，只是长请求保护打折。
start_pm2() {
    pm2_start_with --kill-timeout 25000 && return 0
    warn "本机 pm2 不接受 --kill-timeout，退回不带该参数的启动"
    alert_ops "育娃手记：pm2 不认 --kill-timeout" \
        "已退回默认启动参数，服务正常启动。但排空窗口回到默认 1.6s，长请求（便便 AI 20s）仍可能被砍；建议升级 pm2 或改用 ecosystem 文件配置 kill_timeout。"
    pm2 delete "$APP_NAME" 2>/dev/null || true
    pm2_start_with
}

# delete 已经执行、start 又失败 = 服务直接下线，是全脚本最危险的分支。
# 这里绝不静默退出：先推告警（带着可复制的人工恢复命令），再以非 0 退出。
require_pm2_up() {
    start_pm2 && return 0
    alert_ops "育娃手记：pm2 启动失败，服务可能已下线" \
        "pm2 delete 已执行但 start 失败。立即人工恢复：cd $SERVER_DIR && pm2 start dist/main.js --name $APP_NAME && pm2 logs $APP_NAME"
    error "pm2 启动失败 —— 服务可能已下线，已推告警，请按上面命令立即人工恢复"
}

# 1. 检查依赖
command -v node >/dev/null 2>&1 || error "未安装 node，请先安装 Node.js >= 18"
command -v pnpm >/dev/null 2>&1 || { warn "未安装 pnpm，正在安装..."; npm install -g pnpm; }
command -v pm2 >/dev/null 2>&1 || { warn "未安装 pm2，正在安装..."; npm install -g pm2; }

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VER" -lt 18 ] && error "Node.js 版本需要 >= 18，当前: $(node -v)"

# 2. 部署前数据库快照（失败不阻塞部署，但会大声警告）
log "部署前数据库快照..."
if bash "$SCRIPT_DIR/backup-db.sh" pre-deploy; then
    log "快照完成，继续部署"
else
    warn "快照失败！数据库可能没有还原点，建议中止排查（备份目录: $SCRIPT_DIR/backups）"
    warn "如确认可继续，重新运行本脚本并检查 backups/ 下的错误信息"
    read -r -p "是否忽略快照失败继续部署? [y/N] " CONTINUE_DEPLOY
    case "$CONTINUE_DEPLOY" in
        [yY]*) warn "已忽略快照失败，继续部署" ;;
        *) error "已中止部署（安全起见）" ;;
    esac
fi

# 2.5 回滚锚点：必须在 git pull **之前**记 —— pull 之后就再也找不到「上一版」是哪个 commit 了
ANCHOR_SHA=""
if [ -d "$SCRIPT_DIR/.git" ]; then
    cd "$SCRIPT_DIR"
    ANCHOR_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
    if [ -n "$ANCHOR_SHA" ]; then
        if git tag -f pre-deploy "$ANCHOR_SHA" >/dev/null 2>&1; then
            log "回滚锚点 pre-deploy → ${ANCHOR_SHA:0:7}"
        else
            warn "打 pre-deploy 标签失败：本轮出问题将无法自动回滚"
        fi
    fi
fi

# 3. 拉取最新代码（如果是 git 仓库）
if [ -d "$SCRIPT_DIR/.git" ]; then
    log "拉取最新代码..."
    cd "$SCRIPT_DIR"
    git pull origin main || git pull || { warn "git pull 失败，跳过"; }
fi

# 3. 安装依赖
log "安装依赖..."
cd "$SCRIPT_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 4. 构建
log "构建管理后台..."
cd "$SCRIPT_DIR"
npm run build:admin

log "构建服务端..."
cd "$SCRIPT_DIR"
npm run build:server

# 5. 部署前探活 —— 整条安全链路的重点：它跑在 pm2 delete **之前**
#    拿生产同一份 .env、在临时端口起一个禁掉定时器的实例，验表结构 / 启动 / 只读接口 / 优雅退出。
#    不通过就在这里中止，下面那句 pm2 delete 根本不会执行，线上仍是完好的旧版继续服务。
log "部署前探活..."
PREFLIGHT_PORT="${PREFLIGHT_PORT:-$((PORT + 1000))}"
if ! PREFLIGHT_PORT="$PREFLIGHT_PORT" node "$SERVER_DIR/scripts/deploy-preflight.js"; then
    alert_ops "育娃手记部署中止（探活未过）" "新版未上线。线上仍是旧版、服务正常。\n看上面的失败项定位，修好后可重跑本脚本。"
    error "探活未通过，已中止部署 —— 线上进程未被触碰，仍是旧版在服务。"
fi

# 6. PM2 切换（探活通过后才会走到这里）
log "停旧起新..."
pm2 delete "$APP_NAME" 2>/dev/null || true
require_pm2_up

# 7. 部署后验收；失败自动回滚到锚点
log "部署后验收 /api/health + /api/announcement/current（最多 30s）..."
if verify_live; then
    log "验收通过 ✅"
else
    warn "新版验收失败（30s 内没就绪），开始自动回滚"
    if [ -z "$ANCHOR_SHA" ]; then
        alert_ops "育娃手记部署失败且无锚点" "没有 pre-deploy 标签，无法自动回滚，需立即人工介入。"
        error "没有回滚锚点，无法自动回滚。立即人工处理：pm2 logs $APP_NAME"
    fi
    alert_ops "育娃手记部署已自动回滚" "新版验收失败，正在回滚到 ${ANCHOR_SHA:0:7}。\n失败原因请看 pm2 logs $APP_NAME。"
    cd "$SCRIPT_DIR"
    # 不加 -f：服务器工作区若有你手动改的东西，宁可停下来问你，也不要静默覆盖
    if ! git checkout "$ANCHOR_SHA"; then
        alert_ops "育娃手记回滚失败" "git checkout ${ANCHOR_SHA:0:7} 失败（工作区有未提交改动？），服务可能仍是坏的，立即人工介入。"
        error "git checkout 锚点失败 —— 已停在异常状态，请手动回滚到 ${ANCHOR_SHA:0:7}（或先 stash 掉本地改动再重跑本脚本）"
    fi
    npm run build:server || error "回滚重建失败，请手动处理：cd $SCRIPT_DIR && npm run build:server && pm2 restart $APP_NAME"
    pm2 delete "$APP_NAME" 2>/dev/null || true
    require_pm2_up
    if verify_live; then
        error "已回滚到 ${ANCHOR_SHA:0:7} 并恢复服务。但本次部署是失败的，务必排查后再重发：pm2 logs $APP_NAME"
    else
        alert_ops "育娃手记回滚后仍不可用" "回滚到 ${ANCHOR_SHA:0:7} 后验收依旧失败，服务可能完全不可用，立即人工介入！"
        error "回滚后验收仍失败！服务可能不可用，立即人工介入：pm2 logs $APP_NAME"
    fi
fi

# 8. 保存 PM2 进程列表（服务器重启后自动恢复）
pm2 save

log "部署完成!"
log "查看日志: pm2 logs $APP_NAME"
log "查看状态: pm2 status"
log "重启服务: pm2 restart $APP_NAME"
log "管理后台: http://服务器地址:<PORT>/admin （账号密码见 .env 的 ADMIN_USERNAME / ADMIN_PASSWORD）"
