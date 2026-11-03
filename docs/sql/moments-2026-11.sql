-- 2026-11-03 新增瞬间表 moments + photos 关联列
-- 背景：相册从「按天的照片文件夹」升级为朋友圈式信息流：
--       一条瞬间 = 一段文案 + 最多 9 张照片；改造前的单张照片不改数据，
--       photos.moment_id 为空，服务端读信息流时包装成「无文案的单图瞬间」。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表/加列，部署含此功能的服务端前先执行本文件。
-- 对应实体：
--   apps/server/src/modules/photo/entities/moment.entity.ts
--   apps/server/src/modules/photo/entities/photo.entity.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/moments-2026-11.sql
-- 验证：
--   SHOW CREATE TABLE moments\G
--   SHOW CREATE TABLE photos\G  -- 确认 moment_id / sort_order / idx_photos_moment_id
--
-- 幂等说明：建表用 IF NOT EXISTS；MySQL 8 的 ADD COLUMN / ADD INDEX 不支持
-- IF NOT EXISTS，这里先查 information_schema 再决定是否执行，重复执行不会报错。

CREATE TABLE IF NOT EXISTS `moments` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `user_id` varchar(255) NOT NULL COMMENT '发布者 ID，后续社交功能按作者区分',
  `content` text NULL COMMENT '文案',
  `photo_date` date NOT NULL COMMENT '所属日期',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_moments_baby_photo_date` (`baby_id`, `photo_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── photos 增加瞬间关联与排序 ──
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'photos' AND COLUMN_NAME = 'moment_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `photos` ADD COLUMN `moment_id` varchar(36) NULL COMMENT ''所属瞬间ID，为空表示改造前的单张照片''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'photos' AND COLUMN_NAME = 'sort_order'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `photos` ADD COLUMN `sort_order` int NOT NULL DEFAULT 0 COMMENT ''瞬间内的展示顺序''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'photos' AND INDEX_NAME = 'idx_photos_moment_id'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `photos` ADD INDEX `idx_photos_moment_id` (`moment_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 说明：
-- 1. 不迁移存量照片：moment_id 为空的照片由服务端在 /photo/moments 信息流里
--    包装成单图瞬间，旧版小程序仍走 /photo/timeline，两者互不影响。
-- 2. 按既有新建表惯例不在生产加外键（开发库 synchronize=true 会自动生成 baby_id 外键）；
--    删除宝宝 / 注销账号时由应用层先删 photos 再删 moments。
-- 3. 回滚：功能下线即可，moments 表建议保留（删表等于删用户文案）；
--    photos 新增的两列对旧代码无影响，可保留。
