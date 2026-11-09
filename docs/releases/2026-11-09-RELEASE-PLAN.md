# 发布计划 · 2026-11-09（11-09 全部改动合并版）

> **这是一份可直接照着执行的唯一清单。**
> 取代同日的 5 份分次清单（`-1011` / `-1049` / `-1107` / `-1350` / `-1418`），
> 那几份保留作为改动历史记录，执行时**只看本文件**。
>
> ⚠️ **重要：工作区里还混着 2026-11-07「成长周报」的改动**（未提交）。
> 见文末「第 0 节」，它会被一起提交，必须一并部署，否则周报页面会 404。

---

## 一、这份计划包含什么

11-09 一天分 5 批做了 17 项改动，合并为一次发布。

| # | 功能 | 用户可见变化 |
|---|---|---|
| 1 | 统计页补齐 5 类视图 | 辅食/喝水/用药/洗澡/户外终于能在统计里看到 |
| 2 | 统计页 tab 重排 | 高频 6 项（喂奶尿布身高中体重体温疫苗）一屏可见 |
| 3 | 「本月关注」扩到 6 岁 | 满 12 个月的宝宝不再看不到这一格 |
| 4 | 首页今日概览条 | 一行看完「今天记了几条、都记了什么」 |
| 5 | 连续记录徽章 | 宝宝卡显示「连续记录 N 天」 |
| 6 | 首页移除育娃圈入口 | 发现页入口保留 |
| 7 | 家庭角色权限 | 家人可设为「只读」，不能再改数据 |
| 8 | 家庭时光流互动 | 家人之间能点赞、评论（不需要公开） |
| 9 | 记录通用配图 | 所有记录类型都能配图（最多 9 张） |
| 10 | 交接班归因 | 转发给家人的卡片能看出带来几个新用户 |
| 11 | 记录导出 Excel | 「我的」可导出 .xlsx，可直接打开 |
| 12 | 导出时间范围 | 自选区间，最长 31 天 |
| 13 | 疫苗补种提醒 | 新页面：哪几针过了参考日、该先打哪个 |
| 14 | 辅食 3 天观察 | 记录「吃完怎么样」+ 首页观察卡 |
| 15 | 健康分析 | 新页面：发热病程 + 排便规律 |
| 16 | 儿保体检 | 新页面：13 个体检节点时间轴 |
| 17 | 发现页图标改版 | 9 个 emoji 全部换成自绘 SVG |
| 18 | 包体积回收 | 4 张插画改走 CDN，主包净减约 124 KB（回收 184，新增功能用掉 60）|

**技术性质汇总：**

- 新增表：**0 张**
- 新增列：**3 个**（`family_members.access_level`、`records.photo_urls`、`records.food_reaction` + `food_is_new`）
- 新增页面：**3 个**（`tool/vaccine-catchup`、`tool/checkup`、`tool/health`）
- 新增接口：**3 组**（家庭互动 4 个、健康数据 1 个、导出 1 个）
- 新增环境变量：**0 个**
- 破坏性变更：**1 处**（导出接口参数 `days` → `startDate/endDate`，见第 5 节说明）

**主包体积：1676 KB → 1552 KB**（上限 2048 KB，余量约 496 KB）

---

## 第 0 节 · 关于混入的 11-07 改动（先看这个）

工作区未提交改动里，以下文件属于 **2026-11-07「成长周报」**，不是 11-09 的：

```
apps/admin/src/pages/Babies.tsx        （头像空串兜底）
apps/admin/src/pages/BabyDetail.tsx    （同上）
apps/admin/src/pages/Subscriptions.tsx （同上）
apps/admin/src/pages/Users.tsx         （同上）
apps/client/src/pages/weekly-report/   （整页新增）
apps/client/src/utils/weeklyPoster.ts
apps/client/src/utils/weeklyReportData.ts
apps/client/src/utils/weeklyReportRange.ts
docs/releases/2026-11-07-1401-release-checklist.md
```

**这意味着：本次 commit 会把周报一起带上。**

两种处理方式，**选一种**：

**A. 一起发（推荐，最简单）**
直接按本计划执行。周报功能会随本次一起上线，回归检查项见文末第 8 节。

**B. 只发 11-09**
需要先把周报相关文件 `git stash` 掉再提交，但这会让 `apps/client/src/app.config.ts`
里的 `pages/weekly-report/index` 路由指向不存在的页面 —— **会导致小程序编译失败**。
所以**不推荐**，要做的话需要手工改 `app.config.ts` 去掉该路由，反而更麻烦。

---

## 第 1 节 · 推送代码

```bash
cd /Users/jimmy/Desktop/code/babytime/baby-time

# ⚠️ 确认排除 vibe_images / vibe_videos（设计稿与视频，不进仓库）
git add -A -- . ':(exclude)vibe_images' ':(exclude)vibe_videos'

git commit -m "feat: 统计补齐与图标改版、家庭权限与互动、Excel 导出、健康分析与儿保体检

- 统计页补齐辅食/喝水/用药/洗澡/户外五类视图，tab 按使用频次重排
- 本月关注扩到 72 月龄，改用区间匹配（原来满 12 个月直接消失）
- 首页：今日概览条、连续记录徽章；移除育娃圈入口
- 家庭：成员权限 owner/editor/viewer（默认 editor，上线不降权）
- 家庭时光流点赞评论（不要求公开），复用 moment_likes/moment_comments
- 记录通用配图 photo_urls（最多 9 张），与尿布专用图并存
- 记录导出为真 .xlsx（自研零依赖生成器），支持自选时间范围最长 31 天
- 疫苗补种提醒、辅食 3 天观察、健康分析、儿保体检四个新功能
- 发现页 9 个图标改为自绘 SVG
- 4 张婴儿插画改走 CDN，主包 -184KB
- 含 11-07 成长周报与后台空头像修复"

git push origin main
```

---

## 第 2 节 · 生产 SQL（**3 个文件，必须全部执行**）

三个脚本都写成幂等（先查 `information_schema`，已存在则跳过），重复执行安全。

```bash
cd /Users/jimmy/Desktop/code/babytime/baby-time

# ① 先备份（务必不要跳过）
bash backup-db.sh pre-deploy

# ② 家庭权限列
bash run-sql.sh docs/sql/family-access-level-2026-11.sql

# ③ 记录配图列
bash run-sql.sh docs/sql/record-photos-2026-11.sql

# ④ 辅食观察列
bash run-sql.sh docs/sql/food-observation-2026-11.sql
```

> `run-sql.sh` 会自动登记到库内 `sql_migrations` 表，重复执行会跳过。
> **不要**绕过脚本手动 `mysql < file`（项目约定）。

### 执行后验证

```bash
set -a; source .env; set +a
mysql -h "$DB_HOST" -P"$DB_PORT" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -e "
  SHOW COLUMNS FROM family_members LIKE 'access_level';
  SHOW COLUMNS FROM records LIKE 'photo_urls';
  SHOW COLUMNS FROM records LIKE 'food%';
  SELECT access_level, COUNT(*) AS n FROM family_members GROUP BY access_level;
"
```

**期望结果：**

| 检查项 | 期望 |
|---|---|
| `access_level` | `enum('owner','editor','viewer')`，Default = **editor** |
| `photo_urls` | `json`，Null = YES |
| `food_reaction` | `enum('none','observe','reaction')`，Null = YES |
| `food_is_new` | `tinyint`，Default = 0 |
| 权限分布 | **全部 editor 或空**（发布前无人被降权）|

> ⚠️ **`access_level` 默认值必须是 editor**。
> 若误设成 viewer，一发布所有存量家庭成员立刻无法写数据，用户会以为坏了。
> 脚本里已固定，**不要手动改**。

---

## 第 3 节 · 生产 .env

**无新增变量。** 不需要改任何配置。

（引用到的 `WECHAT_*` / `JWT_*` / `UPYUN_*` 都是既有的。）

---

## 第 4 节 · 部署步骤与顺序

**严格按此顺序**，SQL 未执行时服务端会因缺列启动失败。

```
1. bash backup-db.sh pre-deploy
2. bash run-sql.sh docs/sql/family-access-level-2026-11.sql
3. bash run-sql.sh docs/sql/record-photos-2026-11.sql
4. bash run-sql.sh docs/sql/food-observation-2026-11.sql
5. bash server.sh
6. bash mini.sh <版本号> "统计视图补齐、家庭权限与互动、Excel导出、健康分析"
```

**为什么必须先 SQL 后服务端**：实体里 `accessLevel` / `photoUrls` / `foodReaction`
都已声明，TypeORM 启动时读列元数据，缺列直接启动失败。

**为什么必须先服务端后小程序**：新版小程序会调
`/photo/moment/:id/like`、`/record/health/:babyId`、`/record/export/:babyId` 等新接口，
服务端没有就是 404。

**建议灰度**：微信后台先放 **20%** 观察一天，再全量。

---

## 第 5 节 · 一处破坏性变更说明

导出接口参数从 `?days=N` 改成了 `?startDate=&endDate=`。

- **如果这是第一次发布 11-09 版本** → 无影响，旧版小程序根本没有导出功能
- **如果 11-07 版本已经在线上** → 也无影响，11-07 没有导出功能
- 只有「11-09 早批已发过、现在要覆盖」才有影响，此时必须同时更新两端

**结论：本次可以安全发布，不需要兼容处理。**

---

## 第 6 节 · 真机回归检查（按优先级排序）

> ⏱ 全量走一遍约 40 分钟。**标 ⭐ 的必须验**，其余可抽检。

### A. 部署正确性（不通过则回滚）⭐

- [ ] ⭐ 服务端启动无报错（`pm2 logs baby-time-server` 无 ERROR）
- [ ] ⭐ 小程序能正常打开首页，不白屏
- [ ] ⭐ 「我的」→「导出记录表格」能导出并**直接打开** xlsx
- [ ] ⭐ 家庭页能打开，成员卡片正常显示
- [ ] ⭐ 统计页能打开，12 个 tab 都在

### B. 家庭权限（影响面最大）⭐

- [ ] ⭐ 成员卡：创建者显示「创建者」橙标，只读成员显示「只读」灰标
- [ ] ⭐ 点其他成员 → 操作层有「改为只读 / 改为可记录」
- [ ] ⭐ 设为只读后，该成员**立刻**无法新增/编辑/删除记录
- [ ] ⭐ 只读成员**仍能**看首页、统计、明细、相册
- [ ] 非创建者看不到改权限入口
- [ ] **两个微信号互测**：A 创建家庭，B 加入，A 把 B 设只读，B 操作被拦

### C. 新功能可用性

- [ ] 发现页 9 个入口图标全为 SVG，**无 emoji**，iOS/Android 一致
- [ ] 疫苗补种：1 岁以上宝宝能看到「可以问问门诊」，刚出生不催
- [ ] 辅食：记录页有「吃完怎么样」，首页出现观察卡，满 3 天自动消失
- [ ] 健康分析：能看发热病程与排便规律
- [ ] 儿保体检：13 个节点，能标记完成，重进仍在
- [ ] 导出：选 7 天 → 文件只有 7 天数据；选 40 天 → 提示超限

### D. 家庭互动

- [ ] 相册页每条瞬间底部有「🤍赞 / 💬评论」
- [ ] 点赞图标变 ❤️、数字 +1，无需刷新
- [ ] 评论面板能发能看，自己的评论有「删除」
- [ ] 旧版单张照片（无 moment 行）不显示互动栏

### E. 统计与首页

- [ ] 统计页 12 个 tab 横向可滑，前 6 项一屏可见
- [ ] 点「辅食/用药/洗澡」总结卡是「总次数/平均间隔/最近一次」，**不出现「总时长」假数据**
- [ ] 首页今日概览条一行显示，不换行、不挡疫苗卡
- [ ] 连续记录 ≥2 天时显示徽章；只有 1 天不显示
- [ ] 「本月关注」：满 12 个月仍有内容
- [ ] 首页**不再**出现育娃圈入口；发现页入口仍在

### F. 图片与体积 ⭐

- [ ] ⭐ 微信后台显示主包体积**明显小于上一版**（约 -184 KB）
- [ ] ⭐ 统计页身高/体重英雄卡的婴儿插画正常显示（已改 CDN）
- [ ] 首页「未建档」空状态插画**能显示**（存量 bug 已修）
- [ ] 弱网下这两处插画不出现坏图方块

### G. 回归（不该被影响）

- [ ] 成长周报（若一并发布）、纪念册、日报海报能生成
- [ ] 疫苗时间轴、订阅提醒正常
- [ ] 家庭邀请、加入、退出正常
- [ ] 记录 11 种类型表单都能保存

---

## 第 7 节 · 回滚方案

按故障类型选：

| 症状 | 处理 |
|---|---|
| 小程序白屏 / 功能缺失 | 微信后台**回退版本**（秒级，无需动服务端）|
| 服务端启动失败 | `pm2 restart baby-time-server --update-env`，仍失败则 `git revert` 上一个 commit 后 `bash server.sh` |
| 家庭权限误判 | 执行 `UPDATE family_members SET access_level='editor';` 立即解除所有限制 |
| 某功能想临时关闭 | 后台「系统设置」里关对应开关（育娃圈支持；其余需发版）|

**SQL 回滚**（确认无副作用后才会用到）：

```sql
ALTER TABLE family_members DROP COLUMN access_level;
ALTER TABLE records DROP COLUMN photo_urls;
ALTER TABLE records DROP COLUMN food_reaction, DROP COLUMN food_is_new;
```

> ⚠️ 回滚 SQL 前**必须先回滚服务端版本**，否则实体读不到列会启动失败。

---

## 第 8 节 · 本轮验证记录（开发侧已做）

不引入测试框架，用打桩脚本直接跑真实源码：

| 脚本 | 项数 | 覆盖 |
|---|---|---|
| `verify-wave1.cjs` | 49 | tab 覆盖、statKey 存在性、mock 完整性、月龄映射、streak 接线 |
| `verify-streak.cjs` | 12 | 连续天数（跨月/跨年/闰年/断签） |
| `verify-detail-branches.cjs` | 16 | 统计格分支语义、服务端 summary 字段 |
| `verify-access.cjs` | 14 | 权限判定 + 写入口全覆盖 |
| `e2e-access.cjs` | 24 | 真实库：viewer 被拦、editor 可写、互动权限、降权即时生效 |
| `verify-catchup.cjs` | 30 | 疫苗补种算法 |
| `verify-food.cjs` | 19 | 辅食观察聚合 |
| `test-xlsx.cjs` | 14 | xlsx zip 结构 / XML 转义 / 列名 |
| `read-xlsx.cjs` | 11 | 独立解析器反向读回（含 CRC） |
| `e2e-wave3.cjs` | 27 | 真实库：xlsx 往返、区间限制、辅食字段 |
| `verify-range.cjs` | 19 | 导出区间解析（31 天上限） |
| `verify-fever.cjs` | 29 | 发热病程切分 |
| `verify-stool.cjs` | 26 | 排便规律 |
| `verify-checkup.cjs` | 21 | 儿保日期推算 |
| `e2e-health.cjs` | 13 | 真实库：健康接口、days 窗口、权限 |

**合计 313 项全过**（纯逻辑打桩 249 + 真实库 e2e 64）。

打桩过程中抓到并修复的真实缺陷：

1. `food`/`medicine`/`bath` 落进睡眠兜底分支，显示「总时长 0分钟」假数据
2. 服务端 `getRecordDetailSummary` 不给 `outdoor` 返回时长
3. `MOCK_DETAIL` 缺 key，未登录进辅食明细页抛 TypeError
4. CSV 里塞 `#` 说明行破坏列一致性（改用 xlsx 后消失）
5. **CSV 根本打不开**（微信 openDocument 白名单不含 csv）→ 改 xlsx
6. `CDN_ASSETS.emptyBabyIllustration` key 拼错，「未建档」插画一直是 undefined
7. 排便「可能只是漏记」分支永远走不到（判断了错误的字段）

---

## 第 9 节 · 待确认事项（不阻塞发布）

- [ ] **只读成员能否点赞/评论**：当前按「不能写」一并拦了。若要放开，改
      `photo.service.ts` 里 `setMomentLike`/`addMomentComment` 的 `assertCanWrite` 调用
- [ ] **导出 31 天上限**是否合适：改 `EXPORT_MAX_DAYS` 常量（前后端各一处，已注释标同步）
- [ ] **发热阈值** 37.3/38.5 是按腋温定的，若用户量耳温/额温标准不同
- [ ] **病程中断间隔 12 小时**：若用户习惯早晚各量一次，可能被误切成两段
- [ ] 儿保完成状态**只存本地**，换手机丢失；要同步需建表
- [ ] 健康分析目前只覆盖体温和排便，睡眠/喂养是否纳入需要先定义「异常」
- [ ] 第五波（疫苗本 OCR / 成长册 PDF / 语音记录 / AI 问答）**未实施**，
      均需新依赖或新外部服务，建议先看本版真实数据

---

## 附：本轮改动文件清单

**服务端**
```
apps/server/src/common/xlsx.ts                          新增（零依赖 xlsx 生成器）
apps/server/src/modules/baby/baby.service.ts             权限判定 assertCanWrite
apps/server/src/modules/family/entities/family-member.entity.ts  access_level
apps/server/src/modules/family/dto/update-member-access.dto.ts   新增
apps/server/src/modules/family/family.{controller,service}.ts    改权限接口
apps/server/src/modules/photo/photo.{controller,service,module}.ts  家庭互动
apps/server/src/modules/record/entities/record.entity.ts  photo_urls / food_*
apps/server/src/modules/record/dto/{create,update}-record.dto.ts
apps/server/src/modules/record/record-query.service.ts    streak / 健康 / 导出 / 补种
apps/server/src/modules/record/record.{controller,service}.ts
apps/server/src/modules/milestone/milestone.service.ts    写权限
apps/server/src/modules/user/user.service.ts              handoff 归因白名单
apps/server/src/modules/notification/wechat-subscribe.service.ts  同上
```

**共享包**
```
packages/shared/src/vaccineCatchUp.ts    新增
packages/shared/src/foodObservation.ts   新增
packages/shared/src/feverEpisode.ts      新增
packages/shared/src/stoolPattern.ts      新增
packages/shared/src/checkupSchedule.ts   新增
```

**小程序**
```
apps/client/src/app.config.ts                            3 个新页面路由
apps/client/src/assets/tool-icons/                       9 个新 SVG
apps/client/src/assets/icons/export-table.svg            新增
apps/client/src/assets/{growth,scale}-baby-*.jpg         删除（改 CDN）
apps/client/src/pages/tool/vaccine-catchup/              新增
apps/client/src/pages/tool/checkup/                      新增
apps/client/src/pages/tool/health/                       新增
apps/client/src/pages/index/components/{TodayGlance,FoodObserveCard}.tsx  新增
apps/client/src/pages/{index,stats,family,photo,mine,record,record-detail,tools}/  多处
apps/client/src/stores/recordStore.ts                    streak
apps/client/src/utils/{recordDisplay,monthlyTips,mock,attribution,request}.ts
```

**管理后台**
```
apps/admin/src/constants.ts                              handoff 来源标签
```

**文档 / SQL**
```
docs/sql/family-access-level-2026-11.sql   新增
docs/sql/record-photos-2026-11.sql         新增
docs/sql/food-observation-2026-11.sql      新增
```
