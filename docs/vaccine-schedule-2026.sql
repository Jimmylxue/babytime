-- 2026-09-14 疫苗计划对齐《国家免疫规划疫苗儿童免疫程序及说明（2026年版）》
-- 依据：国疾控卫免发〔2026〕16号（2026-06-17 印发）；百白破新程序自 2025-01-01 起实施。
--
-- 本次为「参考数据」更新，不改表结构，但有 1 个节点下线，需清理孤儿数据。
--
-- 主要变化（代码见 apps/client/src/utils/vaccineSchedule.ts 顶部注释）：
--   1. 百白破：3/4/5 月龄 + 18 月龄 + 6 周岁白破
--              → 2/4/6 月龄 + 18 月龄 + 6 周岁百白破（共 5 剂，起始月龄由 3 月龄提前到 2 月龄）
--   2. 麻腮风：8 月龄「麻疹风疹联合疫苗」更正为「麻腮风疫苗 第 1 剂」（2021 年版起即已调整）
--   3. 下线节点 dt-1（6 周岁 白破疫苗）：2026 年版程序表已不含白破，DT 仅用于 7–11 周岁补种
--   4. 新增参考行：双价 HPV 疫苗（13 周岁女孩，2 剂间隔 6 个月）——只在疫苗表展示，不进宝宝时间轴
--
-- 执行（服务器）：
--   bash backup-db.sh pre-deploy
--   mysql -u<用户> -p baby_time < docs/vaccine-schedule-2026.sql
--
-- 注意：本次**不需要**改节点 ID，所以 vaccine_plans / records 里的历史引用继续有效。
--       只有 dtap-1（3 月龄→2 月龄）、dtap-3（5 月龄→6 月龄）两个节点的月龄变了，
--       用户此前给这两个节点设的「自定义接种日期」会跟着新节点走（语义轻微漂移，影响很小）。

-- 1) 清理已下线节点的自定义接种日期（留着会永远无法再修改）
DELETE FROM vaccine_plans WHERE schedule_item_id = 'dt-1';

-- 2) 接种记录不动：白破是真实接种过的史实，记录必须保留，
--    只是它不再挂到时间轴节点上（时间轴按 schedule_item_id 匹配，匹配不到就不显示"已完成"）。
--    查看受影响的记录：
--    SELECT id, baby_id, vaccine_name, start_time, vaccine_schedule_version
--      FROM records WHERE vaccine_schedule_item_id = 'dt-1';

-- 3) 核对结果：节点应只剩 22 个，不含 dt-1、含 dtap-5
--    SELECT schedule_item_id, COUNT(*) AS cnt FROM vaccine_plans
--     GROUP BY schedule_item_id ORDER BY schedule_item_id;
--    SELECT COUNT(DISTINCT schedule_item_id) AS node_count FROM vaccine_plans;

-- 4) 顺带看一眼有多少记录是旧版程序下记的（仅统计，不处理）
--    SELECT vaccine_schedule_version, COUNT(*) FROM records
--     WHERE vaccine_schedule_item_id IS NOT NULL GROUP BY vaccine_schedule_version;
