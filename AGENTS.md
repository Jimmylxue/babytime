# AGENTS.md — AI 协作规则

本文件被 AI 编码助手（Qoder / Claude Code 等）在每次会话自动读取。只写"AI 必须遵守、但从代码本身推不出来"的约定，项目结构与技术栈见 README.md 与 todo.md。

## 发版清单自动维护（重要，始终生效）

任何涉及**生产发布**的改动，完成后必须整理进**本轮发版**的清单文件，条目包含**可直接复制执行的命令**：

- 清单目录：`docs/releases/`，每轮发版一个文件，命名 `YYYY-MM-DD-HHMM-release-checklist.md`（时间为创建时刻，HHMM 用于同一天多次发版区分）。已有「待发布」清单时直接续写该文件；发布完成后整份文件顶部标注 `✅ 已发布 YYYY-MM-DD HH:MM`，不再删除内容
- SQL 目录：所有生产迁移 SQL 放 `docs/sql/`，文件名带日期（参照 `db-indexes-2026-09.sql`）；清单里引用时写完整路径 `docs/sql/xxx.sql`

需要登记的内容：

1. 新增/修改了 `docs/sql/*.sql`，或改了 TypeORM 实体（新表、`@Index`、列类型）→ 登记「生产需执行的 SQL + 确切 mysql 命令」（生产 `DB_SYNCHRONIZE=false`，不会自动建）
2. 新增或改名了环境变量（`.env` key）→ 登记「生产 .env 需要补的变量」，涉及密钥缺失会导致启动失败的要标注**阻塞**
3. 改了部署脚本 / 构建链路 / 需要特定部署顺序 → 登记「部署步骤与顺序」
4. 改了小程序交互 → 登记「真机回归检查项」（列出具体页面与操作路径）

规则：
- 用户确认某项已在生产执行后，在清单对应项打勾并记日期，不删除条目
- 不确定的生产状态（比如某 SQL 是否跑过）登记时标注「待确认」，不要臆断
- commit/push 需用户明确要求才执行；发版相关动作在服务器上人工执行，AI 只负责列命令

## 其他项目约定

- 生产 SQL 一律用 `run-sql.sh` 执行（执行即登记，库内 `sql_migrations` 表防重复），禁止绕过脚本手动 `mysql < file`；脚本只用于登记历史人工执行过的文件
- 新增迁移 SQL 尽量写成幂等：`CREATE TABLE IF NOT EXISTS`、`INSERT ... WHERE NOT EXISTS`、加索引前注明先 SHOW INDEX 预检——防止误重复执行造成数据问题
- 疫苗计划表唯一数据源在 `packages/shared/src/vaccineSchedule.ts`，前后端都从这里 import，禁止再出现第二份拷贝
- 部署入口：服务端 `bash server.sh`、小程序 `bash mini.sh`（两者都会先 `pnpm install` 并编译 shared 包）
- 测试策略：本项目当前不写自动化测试（用户 2026-09 决定暂缓），行为验证用打桩脚本（参照 todo.md 中 /tmp/verify-* 的做法），不要主动引入测试框架
