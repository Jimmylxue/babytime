# 运维手册：部署安全与数据保护

> 更新日期：2026-09-05。背景：线上已有真实用户，数据安全优先级最高。
> 本文是日常运维的速查手册；表结构变更的详细流程见 [db-backup-and-migration.md](db-backup-and-migration.md)。

---

## 一、现状总览（2026-09-05 基建完成）

| 风险点 | 之前的状态 | 现在的防线 |
|---|---|---|
| TypeORM 自动同步删列丢数据 | 生产 `synchronize: true`，改实体名即丢列 | 由 `DB_SYNCHRONIZE` 控制，生产默认关闭 |
| 数据库零备份 | 无任何备份机制 | 每日备份 + 部署前快照，各保留 30 份 |
| 部署无检查点 | 直接拉代码重启 | 部署前自动打数据库快照，失败可拦截 |
| 小程序发布即全量 | 提审过直接全量发布 | 微信「分阶段发布」+ 一键版本回退 |

## 二、脚本清单与执行规范

| 脚本 | 用途 |
|---|---|
| `server.sh` | 服务端部署（含部署前数据库快照） |
| `mini.sh` | 小程序构建 + 上传微信后台 |
| `backup-db.sh` | 数据库备份（`daily` 例行 / `pre-deploy` 部署快照） |

### ⚠️ 执行规范：一律用 `bash xxx.sh`，不要用 `sh xxx.sh`

- `bash server.sh` / `./server.sh`（有执行权限时）→ 按 shebang 用 bash ✅
- `sh server.sh` → 服务器上 `sh` 指向 dash，shebang 被无视 ❌
- dash 下 `echo -e`（日志格式化）、`read -p`（部署拦截确认）等 bash 写法行为异常，
  可能导致日志乱码甚至**绕过备份失败的确认拦截**。macOS 本机 `sh` 是 bash 兼容模式，测不出来。

## 三、备份体系

### 三层防线

1. **每日例行备份**：cron 每天 04:00 执行 `backup-db.sh daily`，保留 30 天
2. **部署前快照**：`server.sh` 每次部署自动执行 `backup-db.sh pre-deploy`，保留 30 个
3. **异地副本**：每周日从 Mac 拉一份到本地
   ```bash
   scp -r ubuntu@服务器IP:~/babytime/backups ~/Documents/babytime-backups/
   ```

备份文件位置：服务器 `~/babytime/backups/*.sql.gz`（已加入 .gitignore）

### 关键命令速查

```bash
# 手动触发一次例行备份
bash backup-db.sh daily

# 查看备份列表与占用
ls -lh backups/

# 备份日志（cron 的输出也在这里）
cat backups/backup.log

# 【恢复演练】恢复到临时库抽查数据（建议每月一次，不动生产）
mysql -u root -p -e "CREATE DATABASE backup_test"
gunzip < backups/daily-db-xxx.sql.gz | mysql -u root -p backup_test
mysql -u root -p -e "SELECT (SELECT COUNT(*) FROM backup_test.users) AS users, \
  (SELECT COUNT(*) FROM backup_test.records) AS records, \
  (SELECT COUNT(*) FROM backup_test.photos) AS photos;"
mysql -u root -p -e "DROP DATABASE backup_test"

# 【真出事时】恢复生产数据（先停服或确认，覆盖现有表）
gunzip < backups/xxx.sql.gz | mysql -h$DB_HOST -u$DB_USER -p $DB_DATABASE
```

cron 配置（已安装，`crontab -l` 可查）：

```
0 4 * * * cd /home/ubuntu/babytime && bash backup-db.sh daily >> backups/backup.log 2>&1
```

## 四、发布流程（每次更新走一遍）

### 服务端

```bash
bash server.sh
```

确认两点再继续：快照步骤显示成功；`pm2 status` 里服务 online。启动失败查 `pm2 logs baby-time-server`。

### 小程序

1. `bash mini.sh` 上传代码到微信后台
2. 提审 → 通过后用**分阶段发布**（如先 20% 放量）
3. 观察管理端数据 1-2 天（相册指标卡看埋点、Dashboard 看活跃）
4. 无异常 → 全量发布

### 出问题怎么办

| 情况 | 动作 |
|---|---|
| 小程序功能异常 | mp 后台「版本管理」→ **版本回退**到上一版，分钟级生效，无需重新提审 |
| 服务端起不来 | `git checkout <上一个可用提交> && bash server.sh`；数据库随时可用快照回滚 |
| 数据被误删/误改 | 找最近的快照，按第三节恢复命令执行（覆盖前先备份当前状态） |

## 五、表结构变更（生产已关 synchronize）

实体类改动不再自动同步线上表。标准流程（详见 [db-backup-and-migration.md](db-backup-and-migration.md)）：

1. 本地改实体 + 开发（本地 synchronize 默认开启）
2. 手写增量 SQL（**禁止随手 DROP COLUMN / 改字段名**，那是丢数据操作）
3. 服务器：`bash backup-db.sh pre-deploy` → `mysql ... < 变更.sql`
4. 部署代码：`bash server.sh`

排查口诀：线上报 `table doesn't exist` = 加了实体忘了建表；本地正常线上报错先想表结构差异。

## 六、维护节奏

| 频率 | 动作 |
|---|---|
| 每次部署 | `bash server.sh`（快照自动）+ 发布检查单 |
| 每天（自动） | 凌晨 4 点 cron 备份，偶尔瞄一眼 `backups/backup.log` |
| 每周日（手动） | Mac 拉异地副本（scp 命令见上） |
| 每月 | 恢复演练一次（临时库抽查）；`du -sh backups/` 看磁盘占用 |
| 每个版本 | 管理端看疫苗漏斗 + 相册指标卡，确认埋点在涨 |

## 七、已知残留事项

- 异地副本目前靠手动 scp，未自动化
- 服务端启动失败自动回滚上一版本（health check）暂未做，手动 `git checkout` 兜底
- 客户端错误上报（App.onError → 后台查看）未实现
