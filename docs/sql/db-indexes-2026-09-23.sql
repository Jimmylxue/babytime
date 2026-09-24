-- 性能索引 · 2026-09-23（优化清单 六：6.1 user_events 前导列 / 6.7 缺 created_at）
-- 生产 DB_SYNCHRONIZE=false，实体上的 @Index 不会自动落地，必须手动执行本脚本。
-- 实体已同步改好（开发环境 synchronize=true 会自动对齐）。
--
-- 执行前先查现有索引：
--   SHOW INDEX FROM user_events; SHOW INDEX FROM records; SHOW INDEX FROM photos;
--   SHOW INDEX FROM users; SHOW INDEX FROM notification_deliveries;
-- MySQL 不支持 ADD INDEX IF NOT EXISTS，报 Duplicate key name 即已存在，忽略即可。
-- 全部是 INPLACE 的在线 DDL，不锁写；当前最大的表是 user_events，量级也只有几万行，秒级完成。

-- ── 6.1 user_events ──
-- 后台所有分析查询都是 WHERE name = ? AND created_at >= ?（不带 user_id），
-- 原来的 (user_id, name, created_at) 用不上前导列：本地灌 3 万行实测，
-- 优化器要么扫完全部 30064 条索引项，要么退化成 skip scan（逐个 user_id 前缀试探，
-- 用户越多越差）。换成 (name, created_at) 后同一条查询只扫 557 条。
ALTER TABLE user_events ADD INDEX idx_user_events_name_created (name, created_at);

-- 唯一按 user_id 查 user_events 的地方是留存分析：
--   WHERE e.user_id = u.id AND <e.created_at 落在注册日+N 天那一天>
-- 夹在中间的 name 列把 created_at 挡在范围之外，只能用 user_id 前缀（每用户扫 30 行 → 1 行）。
-- 全仓没有任何查询同时按 user_id + name 过滤，所以直接换掉而不是再叠一个索引
-- （这是增长最快的表，每个二级索引都是每次埋点的写放大）。
ALTER TABLE user_events ADD INDEX idx_user_events_user_created (user_id, created_at);
ALTER TABLE user_events DROP INDEX idx_user_events_user_name_created;
-- 若上面 DROP 报 "check that column/key exists"，说明生产上索引名不同，
-- 先 SHOW INDEX FROM user_events 看真名再 DROP，别放着不管（会和上面两个重复）。

-- ── 6.7 后台按时间段的聚合全在扫全表 ──
ALTER TABLE records ADD INDEX idx_records_created_at (created_at);
ALTER TABLE photos ADD INDEX idx_photos_created_at (created_at);
ALTER TABLE users ADD INDEX idx_users_created_at (created_at);

-- notification_deliveries 不建单列 created_at：疫苗漏斗的每条查询都先按 template_id
-- 过滤再按 created_at 取范围/分组，复合索引能一次走完，单列版仍要回表逐行判 template_id。
ALTER TABLE notification_deliveries
  ADD INDEX idx_notification_deliveries_template_created (template_id, created_at);

-- ── 6.9 family_members 复合索引：本轮不加，理由记在这里免得下次重复评估 ──
-- 现有 FK 自动索引 user_id / baby_id / inviter_id 已经把候选行压到个位数
-- （一个用户在 ≤2 个家庭、一个宝宝 ≤5 个成员），status 只有 3 个取值，
-- 再加 (xxx_id, status) 只是省掉几行的过滤，却要在每次 status 从 pending 翻成 accepted 时
-- 多维护一个索引。收益为零、成本为正，故跳过。
