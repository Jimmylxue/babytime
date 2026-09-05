# 数据库备份与表结构变更指南

> 背景：生产环境已关闭 TypeORM `synchronize`（由 `DB_SYNCHRONIZE` 控制，生产默认 false）。
> 从此表结构变更必须手写 SQL，部署前会自动做数据库快照。

## 一、备份机制

### 组成

| 层 | 方式 | 保留策略 |
|---|---|---|
| 部署前快照 | `server.sh` 部署时自动执行 `backup-db.sh pre-deploy` | 最近 30 个 |
| 每日例行备份 | cron 执行 `backup-db.sh daily` | 最近 30 天 |
| 异地（建议） | 定期把 `backups/` 目录 scp 到本机或其他机器 | 自定 |

备份文件在仓库根目录 `backups/`（`*.sql.gz`），含建表语句与全量数据。

### 在服务器上安装每日备份 cron（一次性操作）

```bash
crontab -e
# 加入这一行（路径换成服务器上的实际仓库路径）：
0 4 * * * cd /path/to/baby-time && bash backup-db.sh daily >> backups/backup.log 2>&1
```

装完后手动跑一次验证：`bash backup-db.sh daily && ls -lh backups/`

### 恢复（出事时）

```bash
# 1. 解压并检查备份内容
gunzip < backups/pre-deploy-db-baby_time-20260905-040000.sql.gz | head -50

# 2. 恢复到数据库（会覆盖现有表，先确认要恢复）
gunzip < backups/xxx.sql.gz | mysql -h$DB_HOST -u$DB_USER -p $DB_DATABASE
```

## 二、表结构变更新流程（重要）

生产 `synchronize=false` 后，**改实体类不会自动改线上表**。标准流程：

1. 开发环境（`synchronize` 默认开启）本地改实体，功能开发完成
2. **手写对应的 SQL**（只允许增量修改，禁止 DROP COLUMN / RENAME 除非确认数据可弃）：
   ```sql
   -- 例：给 photos 表加一列
   ALTER TABLE photos ADD COLUMN note VARCHAR(255) NULL;
   -- 例：新增表（可直接从本地开发库导出建表语句）
   SHOW CREATE TABLE vaccine_plans;
   ```
3. 在服务器上执行 SQL（先跑快照）：
   ```bash
   bash backup-db.sh pre-deploy
   mysql -h$DB_HOST -u$DB_USER -p $DB_DATABASE < 你的变更.sql
   ```
4. 再部署代码：`bash server.sh`

### 常见坑

- **新增了实体但忘了建表**：服务能启动，但访问相关接口会报 `table doesn't exist`。上线后管理端/日志一看到这类错误就是这个原因
- **改字段名 = 丢数据**：本地 `synchronize` 会把旧列删掉建新列，本地数据也会丢。改名的正确姿势是手写 `ALTER TABLE ... CHANGE old new ...`，并保持实体和 SQL 同步
- `DB_SYNCHRONIZE=true` 写进服务器 `.env` 可以重新开启自动同步——仅限你明确想要它建新表时临时使用，用完删掉

## 三、发布检查单（每次更新走一遍）

1. `bash server.sh` —— 看到快照成功日志再继续
2. 小程序提审通过后用**分阶段发布**（如先 20% 放量），观察 1-2 天管理端数据
3. 出问题：小程序后台「版本回退」；服务端 `git checkout <上一个tag> && bash server.sh`（快照机制保证数据库随时可回滚）
