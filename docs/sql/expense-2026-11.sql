-- 2026-11-21 新增养娃账本表 expenses
-- 背景：记录纸尿裤、奶粉、衣物等育儿花费，按月看分类和趋势，可导出 Excel。
--       与 records 分开建表：records 是宝宝照护流水，会进连续记录/统计页/周报；
--       花费混进去会污染这些口径，且 records.amount 语义是奶量（ml）。
-- 生产库 DB_SYNCHRONIZE=false 不会自动建表，部署含此功能的服务端前先执行本文件。
-- 对应实体：apps/server/src/modules/expense/entities/expense.entity.ts
-- 分类唯一数据源：packages/shared/src/expense.ts
-- 执行方式（服务器上）：
--   bash backup-db.sh pre-deploy
--   bash run-sql.sh docs/sql/expense-2026-11.sql
-- 验证：SHOW CREATE TABLE expenses\G、SHOW CREATE TABLE expense_budgets\G
--       并确认列与索引一致。

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `actor_user_id` varchar(255) NULL COMMENT '实际记账的用户（家人代记时与创建者不同）',
  `amount` decimal(10,2) NOT NULL COMMENT '金额（元）',
  `category` varchar(32) NOT NULL COMMENT '分类 code，见 shared/expense.ts',
  `item_name` varchar(50) NULL COMMENT '买了什么，选填',
  `note` varchar(200) NULL COMMENT '备注，选填',
  `quantity` decimal(10,2) NULL COMMENT '数量/规格，选填（如 60）',
  `unit` varchar(10) NULL COMMENT '单位，选填（如 片、罐、包）',
  `expense_date` date NOT NULL COMMENT '花费日期（本地日历日）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_expenses_baby_date` (`baby_id`, `expense_date`),
  KEY `idx_expenses_baby_category_date` (`baby_id`, `category`, `expense_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 说明：
-- 1. 不加 UNIQUE：同一天买两包纸尿裤是正常行为。
-- 2. 不加外键：与 baby_milestones / moments 等新表一致；删宝宝时由应用层
--    （baby.service.remove 的事务里 manager.delete(Expense, { babyId })）先清子表。
-- 3. amount 用 decimal(10,2)，实体走 decimalTransformer，避免 mysql2 返回字符串。
-- 4. expense_date 用 date：只需要知道哪一天，不需要精确到分钟；同日排序用 created_at。
-- 5. 索引覆盖月度列表/汇总 (baby_id, expense_date) 与分类筛选
--    (baby_id, category, expense_date)。
-- 6. 家庭共享：owner/editor/viewer 都能看和记（长辈代买场景），权限在服务端
--    通过 babyService.findOne 校验「是否家庭成员」，不调用 assertCanWrite。
-- 7. 本文件只建新表，不动既有表；回滚时功能下线即可，表建议保留（删表等于删用户数据）。
-- 8. 2026-11-21 追加：数量/单位（单价 = 金额 / 数量），以及每月预算表 expense_budgets。

-- 每月预算：一个宝宝一条，所有月份通用；清空预算用应用层 DELETE。
CREATE TABLE IF NOT EXISTS `expense_budgets` (
  `id` varchar(36) NOT NULL,
  `baby_id` varchar(255) NOT NULL COMMENT '宝宝 ID',
  `amount` decimal(10,2) NOT NULL COMMENT '每月预算（元）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_expense_budgets_baby` (`baby_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;