-- 2026-11-03 新增系统设置表 system_settings
-- 背景：后台需要一个「系统设置」页集中管理功能开关。
--       首个开关：瞬间是否允许上传原图（moment.originalUploadEnabled，默认关闭）。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/system-settings/entities/system-setting.entity.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/system-settings-2026-11.sql
-- 验证：SHOW CREATE TABLE system_settings\G
--
-- 默认值不落库：配置定义在 SystemSettingsService，读取时按默认值兜底。
-- 本文件只建表，不动既有数据；重复执行安全（CREATE TABLE IF NOT EXISTS）。

CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` varchar(64) NOT NULL COMMENT '配置键',
  `value` json NOT NULL COMMENT '配置值（JSON）',
  `updated_by` varchar(64) NULL COMMENT '最后修改的管理员',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
