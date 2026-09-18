-- 性能索引 · 2026-09-18
-- 背景：相册列表（WHERE baby_id ORDER BY photo_date DESC 分页）与宝宝列表（WHERE user_id）
-- 建实体时未显式建索引；生产 DB_SYNCHRONIZE=false，需手动执行本脚本。
-- 实体已同步加 @Index（开发环境 synchronize=true 自动对齐）。
--
-- 执行前先查现有索引：
--   SHOW INDEX FROM photos; SHOW INDEX FROM babies;
-- 早期 synchronize 建表时 ManyToOne 外键可能已自动生成 user_id / baby_id 单列索引
-- （名字类似 FK_xxx）；有则 babies 那条可跳过，photos 的复合索引仍有收益（省掉排序）。
-- MySQL 不支持 ADD INDEX IF NOT EXISTS，报 Duplicate key name 即已存在，忽略即可。

-- 相册列表：baby_id 过滤 + photo_date 倒序，复合索引避免 filesort
ALTER TABLE photos ADD INDEX idx_photos_baby_photo_date (baby_id, photo_date);

-- 宝宝列表：登录后按 user_id 拉取（若已有 FK 自动索引可跳过）
ALTER TABLE babies ADD INDEX idx_babies_user_id (user_id);
