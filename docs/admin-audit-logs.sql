-- 2026-09-07 新增后台审计日志表 admin_audit_logs
-- 背景：后台开放「按宝宝查看照片」（隐私分级：仅按 ID 排障查看，每次查看落审计）。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/admin/entities/admin-audit-log.entity.ts
-- 执行方式（服务器上）：bash 登录后
--   mysql -u<用户> -p baby_time < docs/admin-audit-logs.sql
-- 验证：SHOW CREATE TABLE admin_audit_logs\G  并确认列/索引一致。

CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` varchar(36) NOT NULL,
  `admin_username` varchar(64) NOT NULL COMMENT '操作的管理员用户名',
  `action` varchar(64) NOT NULL COMMENT '动作标识，如 view_baby_photos',
  `target_type` varchar(32) NOT NULL COMMENT '目标类型，如 baby',
  `target_id` varchar(64) NOT NULL COMMENT '目标 ID',
  `detail` text NULL COMMENT '附加信息（JSON 字符串）',
  `client_ip` varchar(64) NULL COMMENT '管理员来源 IP',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_logs_created_at` (`created_at`),
  KEY `idx_admin_audit_logs_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 常用查询：
-- 最近谁看过哪个宝宝的照片
--   SELECT admin_username, target_id, detail, client_ip, created_at
--   FROM admin_audit_logs WHERE action = 'view_baby_photos' ORDER BY created_at DESC LIMIT 50;
