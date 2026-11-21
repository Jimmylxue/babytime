# 发版清单 · 2026-11-21 15:51

> 本文件记录 2026-11-21 的发布项。同一天有多次发布时续写本文件；不同日期请新建文件。
>
> 状态：**待发布**（代码已写入本地工作区，尚未 commit / 部署生产）
>
> 设计方案：`docs/design/expense-ledger-design.md`
> 路线图：`todo.md` 「P2.9 · 养娃账本」

## 待发布 · 2026-11-21（养娃账本：育儿花费记录）

背景：新增个人向「养娃账本」，记录纸尿裤、奶粉、衣物等育儿花费，按月看分类和趋势，可导出 Excel。**独立模块，不是第 12 种记录类型**，不影响连续记录/统计页/周报。

用户拍板的权限：**只要加入家庭，所有成员（owner / editor / viewer）都能看、都能记**。这是对「viewer 只读」的有意例外，不调用 `assertCanWrite`；viewer 在宝宝记录/照片/里程碑上的只读限制保持不变。

### 改动内容

1. 新表 `expenses`（金额 decimal、分类 varchar、日期 date、数量/单位、两个索引）
2. 新表 `expense_budgets`（一个宝宝一条每月预算，唯一索引 `uk_expense_budgets_baby`）
3. 服务端新模块 `apps/server/src/modules/expense/`
   - `POST /api/expense`、`GET /list/:babyId`、`GET /summary/:babyId`、`GET /:id`、`PATCH /:id`、`DELETE /:id`
   - `PUT /api/expense/budget/:babyId`（设置/清除每月预算）
   - `GET /api/expense/export/:babyId?startDate&endDate`（base64 xlsx，最长 366 天、5000 行；含数量/单位/单价）
4. 小程序新页面
   - `pages/expense/index`：月度汇总、预算进度、分类占比、日期分组明细、近 6 个月趋势、年度累计、记录人标签、单价
   - `pages/expense/edit`：大金额输入、10 分类宫格、日期、数量/单位 chips（包/片/罐）、「其他」分类补充说明、备注
5. 入口：「我的」→「宝贝与家庭」+ **发现页「养娃账本」宫格**；两处都上报 `tool_click`
6. 隐私政策补「育儿花费」数据与家庭成员可见说明
7. 删宝宝 / 注销账号级联（含预算表）；后台注销预览计数；后台「小应用」标签 `expense: 养娃账本`
8. 埋点：`tool_view` / `tool_click` / `expense_add` / `expense_export`，**均不带金额**
9. 顺手修复：`JwtStrategy.validate` 补 `users` 存在性检查——旧 token 对应用户不存在时返回 **401**，避免「宝宝列表空 + 建宝宝 500」；客户端会走已有的静默续期/重新登录链路
10. UI 修复（真机反馈）：账本页本月空态去掉与悬浮按钮重复的「记一笔」；编辑页单位改包/片/罐 chips 单选、选具体分类时隐藏「买了什么」、保存按钮改流内（修 textarea 原生组件层级导致的文字透出）、hero 去掉与导航重复的标题
12. 后台开关：系统设置新增「养娃账本 → 开启养娃账本」（`expense.enabled`，默认**开启**）；关闭后小程序隐藏两处入口、账本页/编辑页自动回首页、服务端所有账本接口 403「养娃账本暂未开启」；已有数据保留。纯个人数据工具、无公开内容，一般保持开启即可（后台设置页自动渲染，无需改 admin 代码）

### 1. 推送代码

```bash
cd /Users/jimmy/Desktop/code/babytime/baby-time

git add -A -- . ':(exclude)vibe_images' ':(exclude)vibe_videos'
git commit -m "feat: 新增养娃账本（育儿花费记录）"
git push origin main
```

> commit/push 需用户明确确认后执行；本清单只列命令。

### 2. 生产 SQL（必须执行）

生产 `DB_SYNCHRONIZE=false`，不会自动建表。

```bash
cd /home/ubuntu/babytime

# ① 先备份，不要跳过
bash backup-db.sh pre-deploy

# ② 建表（幂等：CREATE TABLE IF NOT EXISTS）
bash run-sql.sh docs/sql/expense-2026-11.sql
```

验证：

```bash
mysql -u<用户> -p baby_time -e "SHOW CREATE TABLE expenses\G"
mysql -u<用户> -p baby_time -e "SHOW CREATE TABLE expense_budgets\G"
```

确认：

- `expenses` 列：`id / baby_id / actor_user_id / amount / category / item_name / note / quantity / unit / expense_date / created_at / updated_at`
- `expenses` 索引：`idx_expenses_baby_date (baby_id, expense_date)`、`idx_expenses_baby_category_date (baby_id, category, expense_date)`
- `expense_budgets` 列：`id / baby_id / amount / created_at / updated_at`
- `expense_budgets` 唯一索引：`uk_expense_budgets_baby (baby_id)`
- `amount`、`quantity` 都是 `decimal(10,2)`

### 3. 生产 .env

**无新增变量。**

### 4. 部署步骤与顺序

1. 确认 §2 的 `expenses`、`expense_budgets` 两张表已建好（表不存在时服务端启动后接口会报 `table doesn't exist`）
2. `bash server.sh`（同时构建管理后台；本轮 admin 与 server 均有改动）
3. `bash mini.sh <版本号> "养娃账本：记录纸尿裤、奶粉等育儿花费"`
4. 打开后台「小应用」页，确认出现「养娃账本」一行（有 `tool_view` 后才有数据）

**顺序要求：服务端先上，小程序随后发。** 新接口对老客户端无影响；小程序先发会 404。

### 5. 权限说明（不需要 SQL / 配置）

- 账本按家庭共享：owner / editor / viewer 都能看、能记、能改、能删；预算同样所有家庭成员可设/可清
- 没有「仅自己可见」开关；不想让某人看到，只能把 TA 移出家庭
- 后台**永远不展示**单笔金额、项目名、备注；只统计使用量

### 6. 真机回归检查项

- [ ] 「我的」→「宝贝与家庭」→「养娃账本」入口可见；**发现页出现「养娃账本」宫格**，两个入口都能进入
- [ ] 单位为包/片/罐三选一 chips（可取消）；数量 + 单位保存后，明细行显示「¥2.17/片」等单价
- [ ] 选「其他」分类时出现「买了什么」输入；选纸尿裤等具体分类时不出现
- [ ] 编辑页备注输入内容时，保存按钮不再透出文字（按钮已改流内，滚到底部保存）
- [ ] 账本页本月空态只有一处「记一笔」入口（底部悬浮按钮）；编辑页无重复大标题
- [ ] 首次进入空态正确，「记一笔」可进编辑页
- [ ] 金额键盘、两位小数、0.01~999999.99 边界提示正常
- [ ] 分类默认「纸尿裤」；选其他分类保存后再进，默认上次分类
- [ ] 日期默认今天，不能选未来
- [ ] 保存成功返回，月度汇总/分类占比/明细立即更新
- [ ] 编辑金额、分类、项目名、备注后汇总同步变化
- [ ] 数量 + 单位（如 60 片）保存后，明细行显示「¥2.17/片」
- [ ] 设置每月预算：汇总卡出现进度条、剩余/超支、已用百分比；修改/清除正常
- [ ] 家庭成员记的账显示「XX记的」；自己的记录不显示
- [ ] 删除有二次确认，删除后列表更新
- [ ] 月份左右箭头切换；**点中间「2026年11月」弹年月滚轮直接选**，选不到未来月份
- [ ] 近 6 个月柱子点击切月；底部「今年累计 / 当年累计」金额和笔数正确
- [ ] 滚动到页面底部时，悬浮「记一笔」不遮挡趋势柱和年度累计行
- [ ] 分类行点击筛选、取消筛选
- [ ] 导出当前月：**iOS / Android 都要测 `openDocument` 能直接打开 xlsx**；确认有数量/单位/单价列
- [ ] 只读家庭成员（viewer）能正常进入、记账、看汇总、设预算（这是本轮的特殊权限）
- [ ] 非家庭成员打开深链显示「账本仅对家庭成员开放」，不出现全局报错 toast
- [ ] 切换宝宝后账本数据跟着切换
- [ ] 删除宝宝后账本数据清空（测试宝宝，勿用真实用户）
- [ ] 注销账号预览里能看到「账本记录 N」，注销后数据按预期删除
- [ ] 后台「小应用」页能看到「养娃账本」使用行，且没有金额字段
- [ ] 隐私政策页能看到「育儿花费」说明
- [ ] 后台「系统设置 → 养娃账本」出现「开启养娃账本」开关（默认开）
- [ ] 后台关闭开关后（等 ≥1 分钟配置缓存过期）：「我的」页和发现页的养娃账本入口消失、直接打开账本页自动回首页、账本接口返回 403「养娃账本暂未开启」；重新打开后全部恢复
- [ ] 用一个 `sub` 对应用户已不存在的旧 token 请求 `/api/baby`：应返回 401（不是 200 空数组或 500），客户端能自动重新登录
- [ ] 主包体积 < 2048 KB（本地构建 1640 KB）

### 7. 回滚

- 客户端：去掉「我的」页入口即可，页面代码留着不影响
- 服务端：接口可保留；**`expenses` / `expense_budgets` 表不要删**（删表等于删用户数据）
- 如果必须下线：先隐藏入口，观察一周后再决定接口去留

### 8. 已完成验证（本地）

- `pnpm build:shared` / `build:server` / `build:admin` / `build:client` 全过
- 服务层真库 smoke 27 项通过（含预算/数量单位/年度累计/导出）
- HTTP API smoke 42 项通过（含预算设置/清除、年度累计、记录人昵称、数量单位）
- viewer 家庭成员 API 6 项通过（含设预算/清预算）
- 客户端新增文件 tsc 0 错误（92 条基线来自 node_modules / 历史页面）
- 主包 1640 KB（余量约 408 KB）