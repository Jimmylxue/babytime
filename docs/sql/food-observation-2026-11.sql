-- 2026-11-09 records 增加辅食新食物观察字段
--
-- 背景：6–12 月龄加辅食要「一次一种、观察 2–3 天」，现有 food_name 只能记吃了什么，
--       记不了「吃完之后怎么样」，家长只能靠记忆。本次新增两列支撑 3 天观察提示。
--
-- 新增：
--   food_reaction  enum('none','observe','reaction')  吃完的反应
--   food_is_new    tinyint(1)                          是否首日尝试的新食物
--
-- 取值说明：
--   none     没什么特别
--   observe  有点变化（继续观察）
--   reaction 有反应（皮疹/呕吐/腹泻）→ 前端提示停 3 天或咨询医生
--   只记状态、不记诊断 —— 是不是过敏必须由医生判断。
--
-- 生产库 DB_SYNCHRONIZE=false 不会自动加列，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/record/entities/record.entity.ts
--
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/food-observation-2026-11.sql
--
-- 幂等性：两列分别查 information_schema，已存在则跳过，可重复执行。

-- ── food_reaction ────────────────────────────────────────────────────────
SET @col_reaction := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'records'
    AND COLUMN_NAME = 'food_reaction'
);

SET @sql_reaction := IF(
  @col_reaction = 0,
  'ALTER TABLE `records`
     ADD COLUMN `food_reaction` ENUM(''none'',''observe'',''reaction'') NULL
     COMMENT ''新食物反应：none=无异常 / observe=继续观察 / reaction=有反应''
     AFTER `food_name`',
  'SELECT ''food_reaction 已存在，跳过'' AS skipped_reaction'
);

PREPARE stmt1 FROM @sql_reaction;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- ── food_is_new ──────────────────────────────────────────────────────────
SET @col_isnew := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'records'
    AND COLUMN_NAME = 'food_is_new'
);

SET @sql_isnew := IF(
  @col_isnew = 0,
  'ALTER TABLE `records`
     ADD COLUMN `food_is_new` TINYINT(1) NOT NULL DEFAULT 0
     COMMENT ''是否为新食物首日''
     AFTER `food_reaction`',
  'SELECT ''food_is_new 已存在，跳过'' AS skipped_isnew'
);

PREPARE stmt2 FROM @sql_isnew;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 验证：
--   SHOW COLUMNS FROM records LIKE 'food%';
--   期望：food_name(varchar) / food_reaction(enum) / food_is_new(tinyint)
--   SELECT COUNT(*) FROM records WHERE food_reaction IS NOT NULL;
--   期望：0（老记录无反应数据，功能从新记录开始积累）
--
-- 说明：这两列只有 food 类型记录会有值，其它类型保持 NULL/0，不做回填。
--       索引不用加 —— 查询一律带 baby_id + type（已有 idx_records_baby_type_start_time），
--       反应状态只在小结果集上内存过滤。

-- 回滚：
--   ALTER TABLE `records` DROP COLUMN `food_is_new`, DROP COLUMN `food_reaction`;
--   注意：回滚后服务端实体读不到列会报错，必须同时回滚服务端版本。
