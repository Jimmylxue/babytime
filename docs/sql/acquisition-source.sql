-- 用户获客来源：海报二维码带场景值（wxacode.getUnlimited 的 scene），
-- 新用户扫码注册时写入。老用户不回填（first-write-wins）。
-- 幂等：重复执行会报 Duplicate column，属正常，忽略即可。
-- 2026-09-18

ALTER TABLE users
  ADD COLUMN acquisition_source VARCHAR(32) NULL COMMENT '获客来源(扫码场景值: album/daily/chart/family)' AFTER role;
