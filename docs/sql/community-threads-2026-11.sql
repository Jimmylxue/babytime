-- 2026-11-06 育娃圈评论升级为楼中楼（一级评论 + 回复）
-- 背景：评论需要支持在一条评论下回复，展示「回复 @昵称」；只做一层回复，不无限嵌套。
-- 生产库 DB_SYNCHRONIZE=false 不会自动加列/索引/外键，部署前先执行本文件。
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/community-threads-2026-11.sql
-- 验证：
--   SHOW CREATE TABLE moment_comments\G
--
-- 幂等说明：ADD COLUMN / ADD INDEX / ADD CONSTRAINT 都不支持 IF NOT EXISTS，
-- 先查 information_schema 再决定是否执行，重复执行安全。

-- ── parent_id：顶层评论为空，回复指向顶层评论 ──
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moment_comments' AND COLUMN_NAME = 'parent_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `moment_comments` ADD COLUMN `parent_id` varchar(36) NULL COMMENT ''顶层评论为空；回复指向所属的顶层评论''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── reply_to_user_id：回复的目标用户，用于展示回复 @昵称 ──
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moment_comments' AND COLUMN_NAME = 'reply_to_user_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `moment_comments` ADD COLUMN `reply_to_user_id` varchar(36) NULL COMMENT ''回复的目标用户，用于展示「回复 @昵称」''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 楼中楼查询索引 ──
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moment_comments'
    AND INDEX_NAME = 'idx_moment_comments_moment_parent_created'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `moment_comments` ADD INDEX `idx_moment_comments_moment_parent_created` (`moment_id`, `parent_id`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 父评论外键：顶层评论被硬删除时，回复一起清理 ──
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'moment_comments'
    AND CONSTRAINT_NAME = 'fk_moment_comments_parent'
);
SET @sql := IF(
  @fk = 0,
  'ALTER TABLE `moment_comments` ADD CONSTRAINT `fk_moment_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `moment_comments` (`id`) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 回复目标用户外键：用户注销后回复保留，@ 昵称置空 ──
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'moment_comments'
    AND CONSTRAINT_NAME = 'fk_moment_comments_reply_user'
);
SET @sql := IF(
  @fk = 0,
  'ALTER TABLE `moment_comments` ADD CONSTRAINT `fk_moment_comments_reply_user` FOREIGN KEY (`reply_to_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 说明：
-- 1. 存量评论 parent_id / reply_to_user_id 均为 NULL，自动就是一级评论。
-- 2. 只支持一层回复：回复的 parent_id 必须指向一级评论；回复的回复仍挂同一个 parent_id。
-- 3. 用户删除评论用 status=hidden 软删除；删一级评论会连同其回复一起隐藏。
-- 4. 删除瞬间会级联删除整棵评论树；注销账号时用户评论删除，父评论删除会级联回复。
