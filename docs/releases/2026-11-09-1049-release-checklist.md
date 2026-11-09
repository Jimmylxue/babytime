# 发版清单 · 2026-11-09 10:49

> ⚠️ **已归档：本文件是分次记录，不要再照它执行。**
> 11-09 全部改动的执行请用 **`docs/releases/2026-11-09-RELEASE-PLAN.md`**。


> 本文件记录 2026-11-09 **第二波（家庭协作）** 的发布项。
> 同一天更早已有一份 `2026-11-09-1011-release-checklist.md`（第一波：统计补齐 + 概览条 + 连续记录）。
>
> ⚠️ **两轮必须按顺序部署**：第一波清单里的改动也在同一个 commit 里，请两份一起对照执行。
>
> ⚠️ 工作区里还压着 2026-11-07「成长周报」的未提交改动，会一起进 commit。

## 待发布 · 2026-11-09（第二波：家庭协作）

本轮 4 项，**其中 2 项需要生产 SQL**：

1. **#19 家庭角色权限**（owner / editor / viewer）
   - 新增 `family_members.access_level` 列，默认 **editor**
   - 只读成员（viewer）不能新增/编辑/删除记录、照片、里程碑；**照样能看统计和明细**
   - 只有家庭创建者能改成员权限；owner 不可转交；不能改自己
2. **#8 家庭时光流点赞 + 评论**
   - 复用 `moment_likes` / `moment_comments` 两张表，**零新表**
   - 与育娃圈的关键区别：**不要求瞬间公开**，能访问该宝宝即可互动
   - 家庭流返回 `likeCount` / `commentCount` / `likedByMe` / `canInteract`
   - 评论软删除（`status='hidden'`），本人或宝宝创建者可删
3. **#9 记录通用配图**
   - 新增 `records.photo_urls`（JSON，最多 9 张），服务端去重 + 截断
   - 与尿布专用的 `diaper_image` 并存，删记录时两者一起走 CDN 清理
   - 编辑时只清理「本次被移除的」图，不会误删仍在用的
4. **#21 交接班转发带场景值**
   - 交接班面板转发时 path 带 `src=handoff`，新用户扫码/点开可归因到「交接班」
   - 四处白名单同步：`attribution.ts` / `user.service` / `wechat-subscribe.service` / `admin/constants.ts`

### 1. 推送代码

```bash
git add -A -- . ':(exclude)vibe_images' ':(exclude)vibe_videos'
git commit -m "feat: 家庭角色权限、家庭时光流互动、记录通用配图、交接班归因"
git push origin main
```

### 2. 生产 SQL（**必须执行，2 个文件**）

两个脚本都是**幂等**的（先查 `information_schema`，已存在则跳过），可安全重复执行。

```bash
cd /Users/jimmy/Desktop/code/babytime/baby-time

# ① 先备份
bash backup-db.sh pre-deploy

# ② 家庭权限列
bash run-sql.sh docs/sql/family-access-level-2026-11.sql

# ③ 记录配图列
bash run-sql.sh docs/sql/record-photos-2026-11.sql
```

本地已实测两次执行均为 `skipped`（列已由 synchronize 建好），幂等逻辑正常。

**执行后验证：**

```bash
set -a; source .env; set +a
mysql -h "$DB_HOST" -P"$DB_PORT" -u "$DB_USERNAME" -p"$DB_PASSWORD" "$DB_DATABASE" -e "
  SHOW COLUMNS FROM family_members LIKE 'access_level';
  SHOW COLUMNS FROM records LIKE 'photo_urls';
  SELECT access_level, COUNT(*) FROM family_members GROUP BY access_level;
"
```

期望：
- `access_level` = `enum('owner','editor','viewer')`，Default = **editor**
- `photo_urls` = `json`，Null = YES
- 权限分布：**全部是 editor或空**（发布前无人被降权）

> ⚠️ **`access_level` 默认值必须是 editor**。若误设成 viewer，一发布所有存量家庭成员立刻无法写数据，用户会以为坏了。脚本里已固定，不要手动改。

### 3. 生产 .env

**无新增变量。**

场景值 `handoff` 已写入代码内白名单，不需要配置。

### 4. 部署步骤与顺序

**严格按此顺序**，SQL 未执行时服务端启动会因缺列报错：

1. `bash backup-db.sh pre-deploy`
2. `bash run-sql.sh docs/sql/family-access-level-2026-11.sql`
3. `bash run-sql.sh docs/sql/record-photos-2026-11.sql`
4. `bash server.sh`（构建服务端 + 管理后台）
5. `bash mini.sh <版本号> "家庭权限、时光流互动、记录配图"`

顺序说明：
- **SQL 必须在 server.sh 之前**。实体里 `accessLevel` 和 `photoUrls` 不是 nullable 的（access_level 有默认值，photo_urls 是 nullable），
  TypeORM 启动时会读列元数据，缺列直接启动失败。
- 若只想先发小程序不发服务端：**不行**。新小程序会调 `/photo/moment/:id/like` 等新接口，服务端没有就是 404。

### 5. 真机回归检查项

**家庭权限（改动影响面最大）**

- [ ] 家庭页成员卡片：创建者显示「创建者」橙标，**只读成员显示「只读」灰标**，「可记录」成员不显示权限标（不占视觉）
- [ ] 点其他成员卡片 → 操作层出现「改为只读 / 改为可记录」
- [ ] 创建者把自己降权 → 不会出现该选项（自己那行不可点）
- [ ] 把某成员设为只读后，该成员**立刻**无法新增/编辑/删除记录（不用重新登录）
- [ ] 只读成员**仍然能**：看首页、看统计、看明细、看相册、看里程碑
- [ ] 只读成员尝试保存记录 → 提示「你是「只读」成员，不能修改记录」
- [ ] 只读成员尝试点赞/评论 → 被拦
- [ ] 非创建者点成员卡片 → 没有改权限入口
- [ ] **两个微信号互测**：A 创建，B 加入，A 把 B 设只读，B 操作被拦

**家庭时光流互动**

- [ ] 相册页每条瞬间底部出现「🤍 赞 / 💬 评论」互动栏
- [ ] 点赞后图标变 ❤️、数字 +1，**无需刷新**（乐观更新）
- [ ] 断网点赞 → 数字回滚，不留下错误状态
- [ ] 评论：点「💬」弹出评论面板，能看已有评论、能发送
- [ ] 发送后评论立即出现在列表，卡片上的评论数 +1
- [ ] 自己的评论显示「删除」，别人的不显示；宝宝创建者可以删家庭内任意评论
- [ ] 评论为空时发送 → 提示「说点什么吧」
- [ ] 评论含违规词 → 被内容安全拦截（走全局 toast）
- [ ] 旧版单张照片（改造前上传的）**不显示**互动栏（没有 moment 行，`canInteract=false`）

**记录配图**

- [ ] 记录页出现「配图 (可选) 0/9」卡片，可加图
- [ ] 选 1~9 张能上传成功，缩略图正确显示，右上角 × 可删
- [ ] 已有 9 张时「加图」按钮消失
- [ ] 点缩略图能看原图
- [ ] 保存记录后重新进入编辑 → 配图还在，可增删
- [ ] 删除某张配图后保存 → 该图从记录移除（CDN 上的图异步清理）
- [ ] 记录明细页：有配图的记录显示横向小缩略图，点开看原图
- [ ] **尿布记录**：专用那张图（diaperImage）与通用配图**互不影响**，两张都能用

**交接班归因**

- [ ] 首页「交接给家人」→ 转发给另一个微信号
- [ ] 对方点开卡片，若是**新用户**注册后，后台「用户列表 → 来源」显示「**交接班**」
- [ ] 老用户点开不改变其原有来源（服务端只在创建用户时写入）

**回归（不该被本轮改动影响）**

- [ ] 育娃圈（发现页入口）发瞬间、点赞、评论仍正常 —— 与家庭互动共用表但走不同权限
- [ ] 统计页 12 个 tab（第一波）行为不变
- [ ] 首页今日概览条、连续记录徽章不变
- [ ] 成长周报 / 纪念册 / 日报海报仍能生成
- [ ] 家庭邀请、加入、退出家庭链路正常
- [ ] 宝宝名/昵称/疫苗名的内容安全检测仍生效

### 6. 本轮验证方式

**两个打桩 + 一个真库 e2e，共 38 项全过：**

```bash
# 抽真实源码跑权限判定（14 项）
node /tmp/verify-wave2/verify-access.cjs

# 真实库 + 真实 HTTP：造 owner/editor/viewer 三用户跑全链路（24 项）
node /tmp/verify-wave2/e2e-access.cjs
```

e2e 覆盖的真实行为（不是 mock）：

| 场景 | 结果 |
|---|---|
| owner / editor 新增记录 | 200 |
| viewer 新增/编辑/删除记录 | 403 |
| viewer 读统计/明细 | 200（只读能看到） |
| 非成员读 | 403 |
| editor 给「仅家庭」瞬间点赞 | 200，count=1（**不要求公开**）|
| viewer 点赞/评论 | 403 |
| 陌生人点赞 | 403 |
| 家庭流返回互动字段 | likeCount=1, commentCount=1, likedByMe=true |
| 创建者降权 editor → viewer | 200，且该成员立即不能写 |
| 非创建者改权限 | 400 |
| 把别人设成 owner | 400 |
| 超 9 张配图 | 截断到 9 张 |

### 7. 包体积

第一波结束 1620 KB → 本轮 **1640 KB**（+20 KB）。

- 仍**没有新增任何路由**（互动栏和配图都在现有页面内）
- 若后续波次继续加功能，需要开始考虑分包或图片走 CDN

---

## 待确认事项

- [ ] **只读成员的边界**：当前 viewer 连「点赞/评论」都被拦（按"不能写"处理）。
      如果希望只读成员也能点赞（更像"参与"而非"修改"），改 `photo.service.ts` 里
      `setMomentLike` / `addMomentComment` 的 `assertCanWrite` 调用即可 —— 需要产品拍板
- [ ] 家庭流互动目前**没有未读提醒**：家人评论了你的瞬间，你不会收到通知。
      要做的话需要复用订阅消息链路，属于第三波范畴
- [ ] 记录配图走的是 `sizeType: ['compressed']`（微信压缩图），画质与相册一致；
      若以后要原图需改上传链路，会增加存储/流量
- [ ] `records.photo_urls` 是 JSON 列，老记录全是 NULL。若要统计「有多少记录带图」，
      用 `photo_urls IS NOT NULL` 即可，不需要额外索引
