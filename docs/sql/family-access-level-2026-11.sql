-- 2026-11-09 family_members 增加 access_level 权限列
--
-- 背景：家庭成员一直只有「亲属称谓」（family_members.role：father/mother/…），
--       没有任何权限区分 —— 任何已加入的家人（含只来看娃的爷爷奶奶）都能删记录、删照片。
--       本次新增 access_level，把「称谓」和「权限」彻底分开。
--
-- 取值：owner（创建者，不会写进这一列）/ editor（可记录，默认）/ viewer（只读）
--
-- ⚠️ 默认值必须是 EDITOR，不能是 VIEWER：
--    发布前所有成员事实上都是「什么都能改」。默认 editor 保证升级后行为不变；
--    若默认 viewer，一发布所有老家庭立刻被降权，用户会以为数据写不进去了。
--
-- 生产库 DB_SYNCHRONIZE=false 不会自动加列，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/family/entities/family-member.entity.ts（MemberAccess）
--
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/family-access-level-2026-11.sql    # 推荐（会登记到 sql_migrations）
--
-- 幂等性：加列前先查 information_schema，已存在则跳过，可重复执行。

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'family_members'
    AND COLUMN_NAME = 'access_level'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `family_members`
     ADD COLUMN `access_level` ENUM(''owner'',''editor'',''viewer'')
     NOT NULL DEFAULT ''editor''
     COMMENT ''owner=创建者 / editor=可记录 / viewer=只读''
     AFTER `role`',
  'SELECT ''access_level 已存在，跳过'' AS skipped'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 存量成员统一补成 editor（ADD COLUMN 的 DEFAULT 已经把老行填好了，
-- 这条兜底防止某些 MySQL 版本对既有行留 NULL）
UPDATE `family_members`
   SET `access_level` = 'editor'
 WHERE `access_level` IS NULL OR `access_level` = '';

-- 验证：
--   SHOW COLUMNS FROM family_members LIKE 'access_level';
--   期望：enum('owner','editor','viewer')，Default = editor
--   SELECT access_level, COUNT(*) FROM family_members GROUP BY access_level;
--   期望：绝大多数是 editor（发布前无人被降权）

-- 回滚（确认无副作用后才会用到）：
--   ALTER TABLE `family_members` DROP COLUMN `access_level`;
--   注意：回滚后服务端 assertCanWrite 读不到该列会直接报错，必须同时回滚服务端版本。
