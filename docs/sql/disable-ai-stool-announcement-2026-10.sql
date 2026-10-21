-- 2026-10-19 下线 AI 便便识别：停用对应公告
-- 背景：个人主体小程序提供 AI 生成内容需 AI 服务类目与算法备案，医疗健康内容风险更高；
--       客户端入口、页面路由与后端接口已下线，生产库这条公告需一并停用，否则老用户仍会看到弹窗。
-- 幂等：按固定 ID + 内容兜底匹配，重复执行无副作用。
-- 执行（服务器上）：
--   bash run-sql.sh docs/sql/disable-ai-stool-announcement-2026-10.sql
-- 预检（可选）：SELECT id, title, is_active FROM announcements WHERE is_active = 1;
-- 验收：SELECT id, is_active FROM announcements WHERE id = 'ai-stool-analysis-v1';  -- 期望 is_active = 0

UPDATE `announcements`
SET `is_active` = 0
WHERE `id` = 'ai-stool-analysis-v1'
   OR (`is_active` = 1 AND `content` LIKE '%AI%便便%');
