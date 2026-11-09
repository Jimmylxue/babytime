-- 2026-11-09 records 增加 photo_urls 记录配图列
--
-- 背景：记录页只有尿布类型能配一张图（records.diaper_image），其它类型只能写字。
--       新增通用配图 photo_urls（最多 9 张），所有记录类型都能留现场图。
--
-- 与 diaper_image 的关系：
--   diaper_image 是历史遗留的单张字段，尿布表单仍在使用，**不删不改**；
--   photo_urls 是新字段，两者并存。删记录时服务端会一起清 CDN。
--
-- 生产库 DB_SYNCHRONIZE=false 不会自动加列，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/record/entities/record.entity.ts
--
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/record-photos-2026-11.sql
--
-- 幂等性：加列前先查 information_schema，已存在则跳过，可重复执行。

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'records'
    AND COLUMN_NAME = 'photo_urls'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `records`
     ADD COLUMN `photo_urls` JSON NULL
     COMMENT ''记录配图 URL 数组（最多 9 张）''
     AFTER `note`',
  'SELECT ''photo_urls 已存在，跳过'' AS skipped'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证：
--   SHOW COLUMNS FROM records LIKE 'photo_urls';
--   期望：json，Null = YES，Default = NULL
--   SELECT COUNT(*) FROM records WHERE photo_urls IS NOT NULL;
--   期望：0（老记录全是 NULL，功能从新记录开始用）

-- 回滚：
--   ALTER TABLE `records` DROP COLUMN `photo_urls`;
--   注意：回滚会丢已上传的配图引用（CDN 上的图本身还在，但记录不再指向它们），
--   建议先在后台确认无人使用再回滚。
