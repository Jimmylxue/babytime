#!/bin/bash
set -u

# ============================================
# Baby-Time 数据库备份脚本
# 用法:
#   bash backup-db.sh daily     # 每日例行备份（保留 30 天）
#   bash backup-db.sh pre-deploy # 部署前快照（保留 30 个）
# 在服务器上通过 cron 每日执行:
#   0 4 * * * cd /path/to/baby-time && bash backup-db.sh daily >> backups/backup.log 2>&1
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

MODE="${1:-daily}"
BACKUP_DIR="$SCRIPT_DIR/backups"
RETAIN_DAYS=30
RETAIN_COUNT=30

# 加载 .env（与 mini.sh/server.sh 相同方式）
if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

DB_HOST_VAL="${DB_HOST:-localhost}"
DB_PORT_VAL="${DB_PORT:-3306}"
DB_USER_VAL="${DB_USERNAME:-root}"
DB_NAME_VAL="${DB_DATABASE:-baby_time}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
FILE="$BACKUP_DIR/${MODE}-db-${DB_NAME_VAL}-${TIMESTAMP}.sql.gz"

log() { echo "[backup:$MODE] $1"; }

# 检查 mysqldump
command -v mysqldump >/dev/null 2>&1 || {
    echo "[backup:$MODE] 错误: 未安装 mysqldump，请先安装 mysql-client" >&2
    exit 1
}

log "开始备份 $DB_NAME_VAL ($DB_HOST_VAL:$DB_PORT_VAL) -> $FILE"

mysqldump \
    -h "$DB_HOST_VAL" \
    -P "$DB_PORT_VAL" \
    -u "$DB_USER_VAL" \
    -p"${DB_PASSWORD:-}" \
    --single-transaction \
    --routines \
    --triggers \
    --default-character-set=utf8mb4 \
    "$DB_NAME_VAL" | gzip > "$FILE"

if [ ! -s "$FILE" ]; then
    echo "[backup:$MODE] 错误: 备份文件为空，删除并退出" >&2
    rm -f "$FILE"
    exit 1
fi

SIZE=$(du -h "$FILE" | cut -f1)
log "备份完成 ($SIZE)"

# 清理旧备份
if [ "$MODE" = "daily" ]; then
    DELETED=$(find "$BACKUP_DIR" -name "daily-db-*.sql.gz" -mtime +$RETAIN_DAYS -delete -print | wc -l | tr -d ' ')
    [ "$DELETED" != "0" ] && log "清理了 $DELETED 个超过 $RETAIN_DAYS 天的旧备份"
else
    # 快照类按数量保留
    cd "$BACKUP_DIR" || exit 1
    OLD=$(ls -1t pre-deploy-db-*.sql.gz 2>/dev/null | tail -n +$((RETAIN_COUNT + 1)))
    if [ -n "$OLD" ]; then
        echo "$OLD" | xargs rm -f
        log "清理了 $(echo "$OLD" | wc -l | tr -d ' ') 个多余快照"
    fi
fi

log "当前备份目录占用: $(du -sh "$BACKUP_DIR" | cut -f1)"
