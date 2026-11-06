-- 2026-11-06 育娃圈：瞬间公开范围 + 点赞 / 评论 / 举报
-- 背景：宝宝创建者可以把瞬间公开到「育娃圈」，所有登录用户可见、可点赞评论；
--       公开内容需要举报与后台下架链路。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表/加列，部署前先执行本文件。
-- 对应实体：
--   apps/server/src/modules/photo/entities/moment.entity.ts
--   apps/server/src/modules/community/entities/*.entity.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/community-2026-11.sql
-- 验证：
--   SHOW CREATE TABLE moments\G
--   SHOW CREATE TABLE moment_likes\G
--   SHOW CREATE TABLE moment_comments\G
--   SHOW CREATE TABLE community_reports\G
--
-- 幂等说明：建表用 IF NOT EXISTS；MySQL 8 的 ADD COLUMN / ADD INDEX 不支持
-- IF NOT EXISTS，先查 information_schema 再决定是否执行，重复执行安全。

-- ── moments 增加可见范围 ──
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moments' AND COLUMN_NAME = 'visibility'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE `moments` ADD COLUMN `visibility` enum(''family'',''public'') NOT NULL DEFAULT ''family'' COMMENT ''可见范围：family=家庭，public=育娃圈''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moments' AND INDEX_NAME = 'idx_moments_visibility_created'
);
SET @sql := IF(
  @idx = 0,
  'ALTER TABLE `moments` ADD INDEX `idx_moments_visibility_created` (`visibility`, `created_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ── 点赞 ──
CREATE TABLE IF NOT EXISTS `moment_likes` (
  `id` varchar(36) NOT NULL,
  `moment_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_moment_likes_moment_user` (`moment_id`, `user_id`),
  KEY `idx_moment_likes_user` (`user_id`),
  CONSTRAINT `fk_moment_likes_moment` FOREIGN KEY (`moment_id`) REFERENCES `moments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_moment_likes_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 评论 ──
CREATE TABLE IF NOT EXISTS `moment_comments` (
  `id` varchar(36) NOT NULL,
  `moment_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `content` text NOT NULL COMMENT '评论内容',
  `status` enum('visible','hidden') NOT NULL DEFAULT 'visible' COMMENT 'visible=正常展示，hidden=已删除/已下架',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_moment_comments_moment_status_created` (`moment_id`, `status`, `created_at`),
  KEY `idx_moment_comments_user` (`user_id`),
  CONSTRAINT `fk_moment_comments_moment` FOREIGN KEY (`moment_id`) REFERENCES `moments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_moment_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 举报 ──
CREATE TABLE IF NOT EXISTS `community_reports` (
  `id` varchar(36) NOT NULL,
  `target_type` enum('moment','comment') NOT NULL COMMENT '被举报对象类型',
  `target_id` varchar(36) NOT NULL COMMENT '被举报对象 ID',
  `reporter_user_id` varchar(36) NOT NULL,
  `reason` varchar(32) NOT NULL COMMENT '举报原因编码',
  `detail` varchar(200) NULL COMMENT '补充说明',
  `status` enum('pending','handled','dismissed') NOT NULL DEFAULT 'pending' COMMENT 'pending=待处理，handled=已下架，dismissed=已忽略',
  `handled_by` varchar(64) NULL COMMENT '处理的管理员',
  `handled_at` datetime NULL COMMENT '处理时间',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_community_reports_target_reporter` (`target_type`, `target_id`, `reporter_user_id`),
  KEY `idx_community_reports_status_created` (`status`, `created_at`),
  CONSTRAINT `fk_community_reports_reporter` FOREIGN KEY (`reporter_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 说明：
-- 1. 公开瞬间仍是 moments 行，只是 visibility='public'；转私密不复制、不删除数据。
-- 2. 点赞/评论对 moments 与 users 都是 ON DELETE CASCADE：删瞬间、删宝宝、注销账号时自动清理。
-- 3. 举报是多态目标，不建目标外键；内容被删除后举报会保留，后台按「目标已删除」处理。
-- 4. 存量 moments 的 visibility 默认 family，不会因为上线育娃圈突然公开。
