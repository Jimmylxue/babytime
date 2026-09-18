#!/bin/bash
set -u

# ============================================
# Baby-Time SQL 迁移执行脚本（生产与本地通用）
# 原理：目标库里维护一张 sql_migrations 登记表，按文件名记录已执行过的 SQL。
#       登记表随库走——本地库和生产库各记各的，互不影响。
# 用法:
#   bash run-sql.sh --status                        # 列出 docs/sql/*.sql 与各自执行状态
#   bash run-sql.sh                                 # 同 --status
#   bash run-sql.sh docs/sql/xxx.sql ...           # 执行指定文件（已登记的自动跳过，成功后登记）
#   bash run-sql.sh --yes docs/sql/xxx.sql          # 跳过交互确认（脚本化部署时用）
#   bash run-sql.sh --mark docs/sql/a.sql docs/sql/b.sql
#       # 把「历史上已人工执行过」的文件登记为已执行，不实际跑 —— 生产首次使用做一次即可
# 说明:
#   - 执行报 Duplicate key/column 说明库里已是目标状态：确认后 --mark 登记即可
#   - 读仓库根目录 .env 的 DB_* 连接参数，与 backup-db.sh 一致
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
fi

DB_HOST_VAL="${DB_HOST:-localhost}"
DB_PORT_VAL="${DB_PORT:-3306}"
DB_USER_VAL="${DB_USERNAME:-root}"
DB_NAME_VAL="${DB_DATABASE:-baby_time}"

log() { echo "[run-sql] $1"; }
err() { echo "[run-sql] 错误: $1" >&2; }

command -v mysql >/dev/null 2>&1 || { err "未安装 mysql 客户端"; exit 1; }

run_sql() {
    MYSQL_PWD="${DB_PASSWORD:-}" mysql -h "$DB_HOST_VAL" -P "$DB_PORT_VAL" -u "$DB_USER_VAL" \
        --default-character-set=utf8mb4 "$DB_NAME_VAL" "$@"
}

ensure_registry() {
    run_sql -e "CREATE TABLE IF NOT EXISTS sql_migrations (
        filename VARCHAR(255) PRIMARY KEY COMMENT '相对仓库根的 SQL 文件路径',
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        note VARCHAR(255) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='手动 SQL 迁移执行记录';" \
        || { err "无法创建 sql_migrations 登记表"; exit 1; }
}

sql_escape() {
    # 文件路径仅允许字母数字与 . _ / -，其余字符直接拒绝，避免拼出注入
    local v="$1"
    if ! printf "%s" "$v" | grep -qE '^[A-Za-z0-9._/-]+$'; then
        err "SQL 文件名含非法字符: $v"
        exit 1
    fi
    printf "%s" "$v"
}

applied_count() {
    run_sql -N -e "SELECT COUNT(*) FROM sql_migrations WHERE filename='$(sql_escape "$1")';"
}

status_all() {
    ensure_registry
    log "目标库: $DB_NAME_VAL @ $DB_HOST_VAL:$DB_PORT_VAL"
    log "docs/sql/ 下 SQL 文件状态:"
    for f in "$SCRIPT_DIR"/docs/sql/*.sql; do
        [ -e "$f" ] || continue
        rel="docs/sql/$(basename "$f")"
        if [ "$(applied_count "$rel")" = "1" ]; then
            echo "  [已执行] $rel"
        else
            echo "  [未执行] $rel   ← 需要执行；若确认历史上已人工跑过，用 --mark 登记"
        fi
    done
}

mark_applied() {
    local rel="$1"
    ensure_registry
    if [ "$(applied_count "$rel")" = "1" ]; then
        log "已登记过，跳过: $rel"
        return 0
    fi
    run_sql -e "INSERT INTO sql_migrations (filename, note) VALUES ('$(sql_escape "$rel")', '手动登记(此前已人工执行)');"
    log "已登记: $rel"
}

apply_file() {
    local file="$1"
    local rel="${file#$SCRIPT_DIR/}"
    [ "${rel#./}" != "$rel" ] && rel="${rel#./}"
    case "$rel" in /*) rel="$(basename "$file")" ;; esac
    rel="docs/sql/$(basename "$rel")"
    [ -f "$SCRIPT_DIR/$rel" ] || { err "找不到 SQL 文件: $file"; exit 1; }

    ensure_registry
    if [ "$(applied_count "$rel")" = "1" ]; then
        log "已执行过，跳过: $rel"
        return 0
    fi

    echo
    log "即将执行: $rel"
    log "目标库:   $DB_NAME_VAL @ $DB_HOST_VAL:$DB_PORT_VAL  ← 确认这是预期环境（本地别误跑生产、生产别漏跑）"
    if [ "${ASSUME_YES:-}" != "1" ]; then
        read -r -p "确认执行? [y/N] " ans
        case "$ans" in
            [yY]*) ;;
            *) err "已取消 $rel"; exit 1 ;;
        esac
    fi

    if run_sql < "$SCRIPT_DIR/$rel"; then
        run_sql -e "INSERT INTO sql_migrations (filename) VALUES ('$(sql_escape "$rel")');"
        log "执行并登记成功: $rel"
    else
        err "执行失败，未登记: $rel"
        err "若报 Duplicate key/column，说明变更已存在，人工确认后可执行: bash run-sql.sh --mark $rel"
        exit 1
    fi
}

# ── 参数解析 ──
MODE="apply"
FILES=()
ASSUME_YES="${ASSUME_YES:-0}"

while [ $# -gt 0 ]; do
    case "$1" in
        --status) MODE="status"; shift ;;
        --mark)   MODE="mark"; shift ;;
        --yes|-y) ASSUME_YES=1; shift ;;
        -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) FILES+=("$1"); shift ;;
    esac
done

case "$MODE" in
    status)
        status_all
        ;;
    mark)
        [ ${#FILES[@]} -gt 0 ] || { err "--mark 需要指定文件路径"; exit 1; }
        for f in "${FILES[@]}"; do mark_applied "docs/sql/$(basename "${f#./}")"; done
        ;;
    apply)
        [ ${#FILES[@]} -gt 0 ] || { status_all; exit 0; }
        for f in "${FILES[@]}"; do apply_file "$f"; done
        ;;
esac
