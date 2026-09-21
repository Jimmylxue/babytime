-- 2026-09-21 新增成长里程碑表 baby_milestones
-- 背景：「第一次翻身/长牙/叫妈妈」这类低频成长事件打卡，配纪念海报分享。
--       与 records 分开建表：records 是一天几十条的高频流水，里程碑是一生几十条的事件，
--       混在一起统计页每次聚合都要额外过滤。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/milestone/entities/milestone.entity.ts
-- 预置清单（code 的唯一数据源）：packages/shared/src/milestoneCatalog.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/milestone-2026-09.sql
-- 验证：SHOW CREATE TABLE baby_milestones\G  并确认列与两个索引一致。

CREATE TABLE IF NOT EXISTS `baby_milestones` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `actor_user_id` varchar(255) NULL COMMENT '实际打卡的用户（家人代记时与创建者不同）',
  `code` varchar(40) NULL COMMENT '预置里程碑编码，自定义项为 NULL',
  `title` varchar(40) NOT NULL COMMENT '里程碑名称（打卡当下定稿，不随清单文案改动）',
  `category` varchar(20) NOT NULL COMMENT '分类：motor/fine/language/cognitive/social/daily/custom',
  `is_custom` tinyint NOT NULL DEFAULT 0 COMMENT '是否用户自定义',
  `date` date NOT NULL COMMENT '发生日期',
  `note` text NULL COMMENT '一句话备注',
  `photo_url` varchar(255) NULL COMMENT '配图片 URL',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_milestones_baby_code` (`baby_id`, `code`),
  KEY `idx_milestones_baby_date` (`baby_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 说明：
-- 1. `uk_milestones_baby_code`：预置里程碑一个宝宝只能打一条（重复打卡服务端直接报「已经打过卡了」）；
--    MySQL 唯一索引允许多个 NULL，所以自定义项（code IS NULL）不受限，可以想记多少记多少。
-- 2. 本文件只建新表，不动既有表；上线后如需回滚，功能下线即可，表建议保留（删表等于删用户数据）。
-- 3. 与开发库（synchronize=true）的差异：实体上有 ManyToOne，本地会额外生成一个 baby_id 外键约束
--    （FK_xxx，RESTRICT），生产按本文件建表**不加**这个外键——删宝宝时由应用层
--    （baby.service.remove 的事务里 manager.delete(Milestone, { babyId })）先清子表，
--    与 family_member_aliases 等新建表的做法一致。
-- 4. 不显式写 COLLATE：与其它表保持同一排序规则，避免跨表字符串比较出现 Illegal mix of collations。
