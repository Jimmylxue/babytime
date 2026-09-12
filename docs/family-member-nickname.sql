-- 2026-09-12 新增家庭成员备注名表 family_member_aliases
-- 背景：家庭成员管理支持「修改成员昵称」——创建者可给家人起家庭内备注名，
--       普通成员也可给自己起备注名，便于一家人互相辨认（不改写用户全局微信昵称）。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/family/entities/family-member-alias.entity.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   mysql -u<用户> -p baby_time < docs/family-member-nickname.sql
-- 验证：SHOW CREATE TABLE family_member_aliases\G  并确认列/唯一索引一致。

CREATE TABLE IF NOT EXISTS `family_member_aliases` (
  `id` varchar(36) NOT NULL,
  `family_owner_id` varchar(255) NOT NULL COMMENT '家庭创建者（babies.user_id / family_members.inviter_id）',
  `target_user_id` varchar(255) NOT NULL COMMENT '被备注的用户 ID',
  `nickname` varchar(20) NOT NULL COMMENT '本家庭内的备注名',
  `updated_by` varchar(255) NOT NULL COMMENT '最后修改人的用户 ID',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_family_owner_target` (`family_owner_id`, `target_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 说明：
-- 1. 一账号目前只能属于一个家庭，故「家庭创建者 + 目标用户」唯一即可定位一条备注。
-- 2. 该表为纯增量新表，不影响既有 family_members / family_invites 数据；上线可随时回滚（DROP TABLE）。
-- 3. 成员被移除或主动退出家庭时，服务端会删除对应备注行；
--    若创建者直接删除宝宝档案（baby.service.remove），备注行会留下孤儿数据（不影响功能，
--    该用户重新加入同一家庭时备注会重新生效）。
-- 4. 不显式写 COLLATE：与其它由 TypeORM synchronize 建出来的表保持同一排序规则，
--    避免跨表字符串比较时出现 Illegal mix of collations。
--    本地开发库（synchronize=true）已自动建好该表，可直接用
--    SHOW CREATE TABLE family_member_aliases\G 对照线上执行结果。
--
-- 本地怎么测（只有一个微信号、没法真邀请第二个用户时）：
--   node apps/server/scripts/family-nickname-check.js         # 造一个假家人 + 全链路自检
--   node apps/server/scripts/family-nickname-check.js clean   # 测完清理
