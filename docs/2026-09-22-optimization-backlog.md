# 优化需求清单 · 2026-09-22

全仓库扫描（server / client / admin / shared / 部署脚本 / docs）得出的待优化项。
按「会不会咬人」排序，不是按工作量排序。

约定（同 AGENTS.md 的发版清单）：

- 做完一项就打勾并记日期，**不删除条目**
- 涉及生产 SQL / 环境变量 / 部署顺序的，实施时另在 `docs/releases/` 当轮清单里登记确切命令
- 已明确不做的不在此列：分包（评估后放弃）、自动化测试（2026-09-18 暂缓）、包内 webp（真机翻车后禁用）

分批建议见文末。

---

## 一、配置漂移（🔴 会静默失败）

### 1.1 `.env.example` 的订阅消息字段名与代码默认值、线上 `.env` 全都不一致

| key | 代码默认 / 线上 `.env` | `.env.example` |
|---|---|---|
| `WECHAT_VACCINE_FIELD_DATE` | `time2` | ❌ `date2` |
| `WECHAT_VACCINE_FIELD_NOTE` | `thing6` | ❌ `phrase3` |
| `WECHAT_REVIEW_FIELD_FEEDING` | `number2` | ❌ **整个 key 不存在** |
| `WECHAT_REVIEW_FIELD_DATE` | `time3` | ❌ `date3` |
| `WECHAT_REVIEW_FIELD_SUMMARY` | 代码从不读 | ❌ 多出来的死 key |
| `DAILY_REVIEW_HOUR` | `21` | ❌ `20` |

- 后果：字段名不对 → 微信返回 47003 → `notification_deliveries` 记 failed，**用户侧无感、只能从后台漏斗发现**
- 触发场景：换服务器 / 重装 / 别人接手，照 `.env.example` 配一遍就中招
- 证据：`.env.example:56-61` vs `apps/server/src/modules/notification/vaccine-reminder.service.ts:91-93, 279-281`
- [x] 修：`.env.example` 对齐代码默认值，删掉 `WECHAT_REVIEW_FIELD_SUMMARY`，补 `WECHAT_REVIEW_FIELD_FEEDING`，`DAILY_REVIEW_HOUR` 改 21 —— ✅ 2026-09-22
  - 顺带修了本地 `.env:61` 的错误注释（写"留空按 20 点"，代码默认是 21；只动注释，值未变）
  - ⚠️ **生产 `.env` 的现网值仍待确认**：fallback 只在变量不存在时生效，若生产照旧 example 配过，
    错值会盖掉正确默认 → 47003 静默失败。确认命令已登记在
    `docs/releases/2026-09-18-2039-release-checklist.md` 第 11 节 ①
  - 附带发现：`DB_SYNCHRONIZE`（生产防自动 ALTER 丢列的开关）散落在三份文档里却从没进过
    `.env.example`，已按 `# KEY=` 注释形式补登记，不改变任何环境的现有行为

### 1.2 `.env.example` 写了生产真模板 ID

- `.env.example:49` 是线上真值，应改占位符
- [x] 修 —— ✅ 2026-09-22：改成空值 + 注释说明「留空即该类提醒关闭」，模板 ID 格式与获取路径写进注释

### 1.3 两套 HTTP 客户端并存

- `ops-health.service.ts:3`、`stool-analysis.service.ts:3` 直接 `import axios`；`content-security.service.ts` 用 `@nestjs/axios` 的 `HttpService`
- 后果：两套超时/重试/错误语义，日志口径不统一
- [x] 收敛到 `HttpService`（或反之，但要统一）—— ✅ 2026-09-22：`HttpService` 已是多数派（4 处 vs 2 处）且不需动依赖，故向它收敛
  - `ops-health.service.ts` + `AdminModule`、`stool-analysis.service.ts` + `StoolAnalysisModule` 各改调用点并补 `HttpModule` 接线
  - 验证：`pnpm run build:server` 通过；`node dist/main.js` 零 DI 报错（Nest  bootstrap 阶段急切实例化，缺接线会当场炸）；
    `GET /api/admin/ops/https` 实测 200 且 7 端点全部 reachable/trusted；`/api/stool-analysis` 未登录 401
  - 关键语义打桩（`/tmp/verify-httpclient-semantics.js`，12/12 通过）：非 2xx 时
    `error.response.status` / `.data` 形状与裸 axios 一致 —— `ops-health.service.ts` 的 catch
    靠这两个字段区分「错误的 Key」和「当天额度发完」，这条要是退化就白丢了排障能力

---

## 二、安全与隐私（🔴）

### 2.1 家庭成员列表把 openId / unionId 发给了其他成员

- `family.service.ts:301-304`、`:328-331` 用 `relations: ['user']` 取整个 User 实体；`baby.service.ts:76-83` 的 `findOwnerUser` 同理
- 项目**没有全局 ClassSerializerInterceptor，实体上也没有 `@Exclude`** → `GET /family/members` 响应里每个成员都带 `openId`、`unionId`、`acquisitionSource`、`lastSeenAt`、`createdAt`
- `unionId` 是微信开放平台账号级跨应用标识符，比 openId 敏感
- 前端只用 `nickname` / `avatar` / `role`
- [x] 修：`attachAliases` 之前把 user 投影成 `{id, nickname, avatar}` —— ✅ 2026-09-23
  - `family.service.ts` 新增 `toPublicUser()` / `toMemberEntry()` 白名单投影，成员条目只剩
    `{id, userId, role, nickname, user:{id, nickname, avatar, role}}`（`role` 保留是因为页面
    `getRoleText(member.user?.role || member.role)` 在读它）
  - 顺带堵了两个同源口子：成员条目不再带 `family_members.invite_code`（旧版一次性码＝该宝宝全部数据的入场券）；
    `getUserFamilies()` 去掉 `baby.user` relation，`/family/my-families` 不再把创建者整个 User 实体摊平进响应
  - 小程序 `pages/family/index.tsx` 的 `Member` 接口跟着收窄（去掉 `babyId`/`status`，运行时零变化）
  - 验证：本地真库造 2 用户 / 1 宝宝 / 1 成员关系 / 1 备注名，两个视角打 `GET /family/members`，
    响应文本里 `TMPSEC21_open`、`TMPSEC21_union`、`TEMPINV1`、`lastSeen`、`acquisition` 全部零命中，
    同时微信昵称 / 头像 / 角色 / 家庭备注名仍正常返回；临时行验证完按 id 精确删除

### 2.2 CORS `origin: '*'` 配 `credentials: true`

- `main.ts:13-17`。这组合浏览器本来就拒绝（等于白写）；小程序不走 CORS，但管理后台走
- [x] 收敛成后台域名白名单 —— ✅ 2026-09-23：改成 `CORS_ALLOWED_ORIGINS` 精确 origin 白名单，
  **默认空表**（不放行任何跨域）。管理后台实际由本进程挂在同源的 `/admin` 下、用 Authorization 头而非 Cookie，
  所以 `credentials` 一并关掉；无 Origin 头（同源 / 小程序 / 服务器脚本）照常放行。
  从「白写」变成「显式白名单」不会关掉任何现在能用的东西 —— 已实测非白名单来源不发 ACAO 头、白名单来源放行

### 2.3 便便 AI 的 `imageUrl` 未限域

- `stool-analysis/dto/analyze-stool.dto.ts:8` 只校验 `@IsUrl({require_tld: false})`
- 后果：可拿任意外网图烧智谱额度（限流 30 次/天/人，但内容我们既不审也不存）
- [x] 修：限死 `babyimg.jimmyxuexue.top` 前缀 —— ✅ 2026-09-23：DTO 加 `@IsOwnCdnImageUrl()`，
  要求 https + hostname 精确等于 `babyimg.jimmyxuexue.top`（历史图片域 `image.jimmyxuexue.top` 同桶，一并放行）。
  用 `new URL()` 解析而非字符串前缀匹配，所以 `babyimg.jimmyxuexue.top.evil.example` 这种后缀伪装也被拒（已实测）

### 2.4 埋点接口 body 不是 DTO，全局校验对它完全无效

- `user.controller.ts:47` `@Body() body: { name: string; properties?: Record<string, any> }` 是内联类型，无 metatype → `ValidationPipe({forbidNonWhitelisted:true})` 不生效
- `properties` 无大小上限，直接进 JSON 列
- [x] 修：建 `TrackEventDto`，`properties` 加长度/深度上限 —— ✅ 2026-09-23：`name` 走 `@Matches`（沿用原来的
  `/^[a-z0-9_.-]{1,64}$/i`，错误文案仍是「事件名称无效」），`properties` 用自定义约束限到
  **16 个键 / 键名 32 字 / 字符串值 120 字 / 只收一层原始值**（对象、数组一律 400）。
  先核过小程序现有 30+ 处 `trackEvent()` 全是扁平的 string/number/boolean，收紧不影响真实埋点；
  客户端本来就是 fire-and-forget（`.catch(() => undefined)`），被拒也不影响主流程

### 2.5 告警接口 token 用非常量时间比较

- `admin.controller.ts:120` `body?.token !== expected`
- [x] 修：`crypto.timingSafeEqual` —— ✅ 2026-09-23：新增 `common/secrets.ts` 的 `secretsEqual()`，
  两边各过一次 SHA-256 再比 —— `timingSafeEqual` 对不等长输入直接抛错，而「抛不抛、何时抛」本身就是时序泄露，
  定长摘要顺带把这个问题消掉了。crontab 的请求体不变，实测错误 token 仍 401、缺 token 401 而不是 500

### 2.6 ~100 处 controller 手写 `{code, message, data}` 信封

- 无全局 interceptor / exception filter；错误响应是 Nest 默认的 `{statusCode, message, error}`，**不带 `code`**，客户端只能靠 `res.data?.message` 兜
- [x] 修：全局 TransformInterceptor + AllExceptionsFilter，删掉所有手写信封 —— ✅ 2026-09-23
  - `common/interceptors/transform.interceptor.ts`：成功统一 `{code:0, message:'success', data: 返回值 ?? null}`；
    `common/filters/all-exceptions.filter.ts`：错误统一 `{code: <HTTP 状态码>, message:'<一句中文>', data:null}`，
    校验失败的英文句子数组被拼成一句，5xx 才打 error 日志（不外泄堆栈）
  - 删掉 11 个 controller 里 68 处手写信封；两处 `return { code: 400, message }`（埋点非法名、后台测试推送未选用户）
    改成 `throw BadRequestException`
  - **HTTP 状态码语义全部保持**：401 仍 401（小程序 token 静默续期靠它）、部署脚本的 `curl -sf` 仍成立
  - `/api/health` 用 `@SkipTransform()` 排除：`server.sh` 与 `deploy-preflight.js` 都 grep `"status":"ok"`，
    不能被信封改成 `.data.status`
  - 副作用（已核对无消费者）：各接口自带的成功文案（「创建成功」「打卡成功」…）统一成 `success` ——
    小程序与后台都只在失败路径读 `message`
  - 验证：`tsc --noEmit` 0 报错、`build:server` 通过、真实例跑 28 项打桩全过；详见
    `docs/releases/2026-09-18-2039-release-checklist.md` 第 14 节

---

## 三、图片与流量（🟠 用户直接感知）

### 3.1 缩略图功能建了一半，从来没通过电 ⭐ 本清单收益最大的一项

- `photos.thumbnail` 列存在（`photo.entity.ts:25`）、DTO 收（`create-photo.dto.ts:14`）、前端读（`photo.thumbnail || photo.url`）——**没有任何一处代码写过它**
- `utils/upload.ts:67` 的 `photoApi.create` 只传 `url`；`albumPoster.ts:94` 的注释已承认此事
- 后果：相册页一次 30 张**原图**（`photo/index.tsx:308`）；首页「最近的瞬间」冷启动就下 9 张**原图**（`MomentsSection.tsx:48`）——这是用户打开小程序看到的第一屏
- 按 compressed 上传估 200–400KB/张 → 首页光图片 2–3MB 流量
- 方案 A（推荐）：又拍云原生图片处理，URL 后缀出缩略图（`xxx.jpg!/fw/400` 一类），**零存储成本、零上传链路改动**
  - ⚠️ **前置待确认**：又拍云控制台「缩略图版本 / 分隔符」是否已开——本地无法验证
- 方案 B（退路）：上传时 sharp 生成真缩略图存两份（多一份存储 + 一个原生依赖）
- [x] 确认又拍云图片处理开关 —— ✅ 2026-09-23：**线上实测已开，分隔符是默认的 `!`**
  - 真打：`baby-illustration.png`（原 580×650 / 351,715 B）加 `!/fw/400` → 200，**400×448 / 151,946 B**
  - `@` 分隔符没开（404）；`/q/75` 不是合法指令（400），合法名是 `quality/75`；
    `fw` / `fh` / `clip` / `quality` / `format` / `rotate` 都验证可用
  - 微信真机可能会编码 src 里的 `!` —— 实测把 `!` 写成 `%21` 同样 200 且字节数一致，不会裂图
  - 没上 `format/webp`（同一张图 152KB → 30KB，再省 5 倍）：包内 webp 真机翻车过，
    网络 webp 在 iOS 上要不要额外给 `<Image webp>` 标记没实测，留作后续单独真机验证
- [x] 实施（走方案 A）—— ✅ 2026-09-23：新增 `apps/client/src/utils/imageThumb.ts`
  - `thumbUrl(url, width)` 追加 `!/fw/{width}/quality/80`；`THUMB_W` 三档按 3x 屏显示像素取：
    grid 400（相册三列 / 首页横排）、wide 900（里程碑整宽照片，取"看不出比原图软"的下限，
    不是 3x 满格）、chip 240（行内小方图）
  - **只认已实测开启的 origin** `https://babyimg.jimmyxuexue.top`；本地开发（`UPLOAD_DRIVER=local`
    由 Nest 静态目录服务，不认这套语法）和历史域名 `image.jimmyxuexue.top`（根目录与现桶不同、
    无法确认）原样返回 —— 追加在没开启的地址上是 404 裂图，比省流量重要
  - 幂等：地址里已有 `!` 或带 `?`/`#` 时不再追加（库里万一存过已处理地址）
  - 接入 5 个渲染点：`pages/photo/index.tsx`（网格）、`MomentsSection.tsx`（首页）、
    `pages/milestones/index.tsx`（列表照片）、`pages/record-detail/index.tsx`（`cell-thumb`）、
    `pages/stats/components/DayDetailCard.tsx`（`timeline-thumb`）
  - 预览/海报仍是原图：`Taro.previewImage` 传 `photo.url`，`albumPoster.ts` 的「原图优先」顺序不动
  - `photos.thumbnail` 那列**依旧没人写**：方案 A 的收益正是存量照片也能吃到，补写这列只对新上传生效。
    列与 DTO 字段保留（前端读法仍是 `photo.thumbnail || photo.url`，真存过就用），不动表结构、无生产 SQL

### 3.2 全站只有一处 `lazyLoad`

- 唯一一处在 `milestones/index.tsx:434`；相册网格（`photo/index.tsx:308-312`）和首页九宫格（`MomentsSection.tsx:48-53`）都没有
- [x] 修：所有列表/网格图片加 `lazyLoad` —— ✅ 2026-09-23：上表那 5 个用户图片渲染点全加上
  （相册网格、首页横排、里程碑、记录详情、统计日详情），现在全站 `<Image>` 列表图一致带 `lazyLoad`；
  表单里"刚选完的那张"预览（`DiaperForm`、里程碑编辑框）没加 —— 单张且可能是 `wxfile://` 临时路径，加了也没意义

### 3.3 相册大图预览不能跨天滑动

- `photo/index.tsx:194-203` 只传当天的 `urls`
- [x] 修：传全部已加载照片，`current` 定位到点击那张 —— ✅ 2026-09-23：`handlePreview(photo)`
  的 `urls` 改用页面已有的 `allPhotos`（`timeline.flatMap` 的扁平顺序 = 视觉顺序，按日期倒序），
  `current` 仍是被点那张的 `photo.url`；继续触底翻页后数组跟着变长，预览能滑到的范围也一起长大

---

## 四、请求数与串行（🟠 墙上时间 = 往返数 × 单请求延迟）

### 4.1 统计页 `getStats(babyId, 1100)`

- `stats/index.tsx:107`：为了拿 `heightWeightTrend`，让服务端把 3 年记录全捞进内存、构造 **1100 个 dailyStats 对象**（绝大多数全 0）再序列化回来
- 服务端侧 `record-query.service.ts:130-180`
- [ ] 修：新增 `/record/growth/:babyId`，只返回身高体重记录

### 4.2 统计页进页面时 `loadDayDetail` 被调两次

- `stats/index.tsx:81-93`（`useDidShow`）与 `:95-99`（`useEffect`）各触发一次，每次 3 个请求 → 6 个里 3 个是废的
- [ ] 修：去掉一处，或用 ref 去重

### 4.3 那 3 个请求是串行的

- `stats/index.tsx:64-78`，代码注释自己写了原因：「store 的 detailSummary 是单值，前一日和当日只能串行取」
- [ ] 修：让 `fetchDetailSummary` / `fetchDetail` 把值 return 出来，然后 `Promise.all`

### 4.4 首页每次 onShow 打 4 个请求，其中一个是重接口只为了 2 个数

- `index/index.tsx:179-186`：`fetchBabies` → `fetchSummary` + `fetchStats` + `fetchRecentPhotos`
- `fetchStats` 只为 `latestHeightWeight` + `latestTemperature`，背后是 `record-query.service.ts:184-208` 的 4 条额外 SQL + 全区间记录
- [ ] 修（第二批）：4 请求合成 1 个 `/record/home`；或把两个 latest 并进 summary 接口

### 4.5 写操作后串行刷新两次

- `recordStore.ts:203-228`：每次增/改/删记录后 `await fetchSummary()` 再 `await fetchStats()`，直接加在「记一条」的感知延迟上
- [ ] 修：`Promise.all`

### 4.6 `deleteRecord` 从明细页删完不刷新

- `recordStore.ts:220-228` 靠 `get().records` 反查 babyId；明细页时 store 里没有那条 → 跳过刷新
- [ ] 修：babyId 由调用方传入

---

## 五、部署安全（🟠）

### 5.1 没有优雅停机，PM2 重启会砍掉进行中的请求

- ~~全库 grep `onModuleDestroy` / `enableShutdownHooks` / `clearInterval` → 零命中~~
- 原始描述里那句「setInterval 挂住事件循环 → PM2 等 1.6s → SIGKILL」**是错的**，实测纠正：
  Node 在没有信号监听器时收到 SIGINT/SIGTERM 是**立刻终止**（实测 6ms 退出），
  `setInterval` 拦不住信号退出。真实情况更糟：瞬间砍死，连 1.6s 的运气都没有
- [x] 修 ✅ 2026-09-22：`main.ts` 加 `enableShutdownHooks()`；`VaccineReminderService` 实现
      `onModuleDestroy` 清 timer；`server.sh` 启动参数带 `--kill-timeout 25000`
- **实施中发现的第二个坑（不修就等于白做）**：光加排空，退出耗时是 **6378ms** 而不是预期的一瞬 ——
  Nest 的 `close()` 就是 `new Promise(r => httpServer.close(r))`，里面**没有** `closeIdleConnections()`，
  空闲 keep-alive 要等满 Node 默认 `keepAliveTimeout`(5s)；而小程序侧连接是复用的，必然撞上。
  更关键的是：drain 期间进程已拒新连接又没退，**每次重启的用户可见停机会从 0.56s 恶化到约 7s**。
  修法是在信号到达时把 `keepAliveTimeout` 压到 300ms 并回收空闲连接（只调
  `closeIdleConnections()` 不够 —— 信号到达那一刻在途请求还没结束，那个 socket 还不算"空闲"，会漏掉它）。
  实测：**6378ms → 1407ms**，在途请求 494ms 完整拿到 200
- [x] 附：`--kill-timeout` 本机无法验证 pm2 是否接受，而「delete 成功、start 失败」正是会把服务
      直接弄挂的失效模式，故做成**探测式回退**（不认就退回原参数 + 推告警），不赌参数合法性

### 5.2 `/health` 不查数据库

- `app.controller.ts:14-20`：MySQL 挂了照样返回 `status: ok`
- [x] 修 ✅ 2026-09-22：改为 `SELECT 1`，失败抛 503。这是部署前探活与部署后验收能成立的前提 ——
      不查库的 health 会让任何拿它做验收的脚本误判为正常

### 5.3 没设 `trust proxy`，日志里的 IP 全是假的

- `main.ts` 无 `app.set('trust proxy', ...)` → `req.ip` 永远是 `127.0.0.1`
- 413 诊断日志（`main.ts:31`）的 IP 不可用；`admin.controller.ts:159` 手动解 `x-forwarded-for` 正是这个问题的绕路
- [ ] 修：设 `trust proxy`，删掉手动解 header 的绕路

---

## 六、数据库（🟡 随规模线性恶化）

### 6.1 `user_events` 索引前导列错了 ⭐

- `user-event.entity.ts:4` 建的是 `(userId, name, createdAt)`
- 但后台所有分析查询都是 `WHERE name = ? AND created_at >= ?`，**不带 userId**（`admin-stats.service.ts:252-253, 385-388, 444-449`）→ 索引完全用不上，全表扫
- `user_events` 是增长最快的表（每次 app_open 一行）
- [ ] 修：加 `(name, created_at)` 索引（实体 `@Index` + `docs/sql/*.sql`）

### 6.2 `DATE(created_at) = CURDATE()` 让索引失效

- `admin-stats.service.ts:21-29`，5 处（todayUsers / todayBabies / todayRecords / todayActiveUsers / aiAnalysisToday）
- [ ] 修：改成 `created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY`

### 6.3 后台看板零缓存

- `admin.controller.ts` 的 10 个 stats 端点每次重跑全部聚合；`getOverview` 一条 SQL 里 15 个子查询
- `ops-health.service.ts:31` 已有 5 分钟内存缓存的先例可照抄
- [ ] 修：加 60s 内存缓存

### 6.4 `trackEvent` 每个事件 2 次写

- `user.service.ts:129-134`：插 `user_events` + `UPDATE users SET last_seen_at`
- 首页每次 onShow 都打一次 → `users` 表高频行写 + binlog 膨胀
- [ ] 修：lastSeenAt 加「距上次 >5 分钟才更新」

### 6.5 `sendDueVaccines` 的 N+1

- `vaccine-reminder.service.ts:125-140`：`babies.find()` 全表，然后每宝宝 1 次 vaccine_plans + 1 次 family_members + 每收件人 1 次 user + 1 次 grant ≈ **680 条查询/轮**（148 宝宝）
- 这是清单里**唯一随用户数线性恶化**的定时任务
- [ ] 修：`In(babyIds)` 批量预加载，压到 5 条以内

### 6.6 TypeORM 没开慢查询日志

- `app.module.ts:35-55` 无 `logging`、无 `maxQueryExecutionTime`
- [ ] 修：`maxQueryExecutionTime: 1000` + `logging: ['error','warn']` —— 一行配置换一个免费的性能雷达

### 6.7 缺 `created_at` 索引

- `records`、`photos`、`notification_deliveries`、`users`（后台按时间段的所有查询都在扫）
- [ ] 修：与 6.1 合并成一份 `docs/sql/*.sql`

### 6.8 `findAllByBaby` 无分页

- `record.service.ts:68-85`：不传 date 时返回该宝宝**全部历史记录**
- 现在人均 ~30 条没事；重度用户两年后可能几千条 → 多 MB JSON
- [ ] 修：加上限或分页（先确认有没有调用方真的不传 date）

### 6.9 `family_members` 缺复合索引

- 查询模式是 `(inviter_id, status)` / `(baby_id, status)` / `(user_id, status)`；目前只有 FK 自动单列索引
- 表还小，且 `verifyBabyAccess` 是每次记录访问的鉴权热路径
- [ ] 修：低优先，跟 6.7 一起做

---

## 七、可观测性（🟡 现在等于盲飞）

### 7.1 没有任何请求日志

- `main.ts` 只有 413 诊断那段。用户说「我昨天记喂奶失败了」→ 无法查
- [ ] 修：30 行中间件（method / path / status / 耗时 / userId）

### 7.2 客户端零错误上报

- `app.ts` 没有 `App.onError`；runbook「已知残留事项」里也列着未实现
- webp 事故（2026-09-20）是靠用户抱怨才发现的 —— 这条已被现实验证过价值
- [ ] 修：`App.onError` + `onUnhandledRejection` → 打后台一个收集端点

### 7.3 gzip 待确认

- nginx 默认 `gzip_types` 只有 `text/html`，**`application/json` 默认不压**
- 4.1 那个 1100 天响应大概 100KB，压完 ~5KB
- vhost 配置只在服务器上（runbook 已记「待拉进仓库」）
- 验证命令：

```bash
curl -sI -H 'Accept-Encoding: gzip' https://baby-cheese.jimmyxuexue.top/api/announcement/current | grep -i 'content-encoding\|content-type'
```

- 没有 `content-encoding: gzip` 就是没开
- [x] 确认 —— ✅ 2026-09-23 生产实测**成立**：公网域名那条返回**没有** `content-encoding`，
      JSON 全裸传；直连 `127.0.0.1:3006` 同样没压（正常，压不压是 nginx 的事）。
      顺带把 9.8 也带实了：后台 SPA 那 2.28MB / 743KB-gz 的单一 JS **也是裸传**，
      等于每次登录后台都要下满 2.28MB。
- [ ] 修：二选一
      · **Nest `app.use(compression())`（推荐）**——后台静态资源也由 Nest 的 `useStaticAssets`
        托管，所以这一处能同时压住 API JSON **和** admin 的 JS/CSS；自带依赖、可在本地用真实 HTTP
        量出前后对比、不依赖服务器上那份没进仓库的 nginx 配置
      · nginx 加 `gzip_types application/json application/javascript text/css`——更通用（覆盖其他 vhost），
        但要改只存在于服务器上的 vhost 文件，且 runbook 里那条「把 vhost 拉进仓库」还没做
      注：DAU 34 的量级下 gzip 的 CPU 成本可忽略；真正的收益在 4.1 那个 1100 天响应（约 100KB → ~5KB）
      和 admin 首屏 2.28MB → 743KB

### 7.4 运维告警只覆盖 HTTPS 与域名

- runbook 已记：备份是否成功、磁盘是否快满、服务是否活着，都还没有任何提醒
- [ ] 补同类项

---

## 八、小程序包体与启动（🟢）

todo.md 记的是主包 1526.7KB / 余量 25.5%。还能再抠：

### 8.1 4 张 JPG 还打在包里（176KB）

- `GrowthHeroCard.tsx:2-5`：`growth-baby-boy/girl` + `scale-baby-boy/girl`
- 之前保留的理由是「白底图放在白卡上看不出来」—— 那是**格式**问题，跟**打包 vs CDN** 是两件事；转 CDN PNG 视觉完全不变
- 收益：主包 → ~1350KB，余量 34%
- [ ] 修：走 `upload-assets.js` + 登记 `CDN_ASSETS`

### 8.2 `lazyCodeLoading` 没开

- `app.config.ts` 缺 `lazyCodeLoading: 'requiredComponents'` —— 官方推荐的启动优化，一行配置
- [ ] 修

### 8.3 三个死依赖

- `axios`：小程序里没有 XHR，根本跑不起来
- `@tanstack/react-query`：零引用
- `tailwindcss`：postcss 链里挂着（`postcss.config.js:3` + `app.scss:1` + `tailwind.config.js`），但 `common.wxss` 里**一条 tailwind utility 都没有**，纯扫描浪费构建时间
- [ ] 修：三个都删

### 8.4 Taro 构建缓存关着

- `config/index.ts` `cache: { enable: false }` → 每次全量构建
- [ ] 修：开启并验证产物一致

### 8.5 `getSystemInfoSync` 已废弃，9 个文件 15 处

- 微信已拆成 `getWindowInfo` / `getDeviceInfo` / `getAppBaseInfo`
- `index.tsx:57-73` 一个初始化里连调 3 次
- [ ] 修：抽一个缓存工具，统一换掉

### 8.6 `Taro.chooseImage` 已废弃

- `utils/upload.ts:21`，官方换成 `chooseMedia`
- [ ] 修（需真机验证拍照/相册两条路径）

### 8.7 海报 Canvas 常驻 DOM

- `index.tsx:428-437`、`stats/index.tsx:483-493`：340×600 离屏画布一直占内存，实际只在点「生成海报」时才需要
- [ ] 修：按需渲染

### 8.8 首页 60s 定时器触发整页重渲染

- `index.tsx:82-85` `setNow` → BabyCard / QuickRecord / MomentsSection 全部重渲染
- [ ] 修：相对时间显示下沉到子组件

---

## 九、代码级小项（🟢 攒着一起改）

### 9.1 `ops-health` 的 probe 可能永久挂起

- `ops-health.service.ts:176-222` **没有 `'close'` 处理**。对端在握手前直接 FIN 而不触发 error 时，Promise 永不 resolve → `Promise.all` 挂死 → 后台运维页永久转圈
- [ ] 修：补 `socket.once('close', ...)`

### 9.2 `record.service.update` 先改脏再校验

- `record.service.ts:143-144`：`Object.assign` 在 `checkUserTexts` 之前，检查抛错时内存实体已被改脏（当前无 UoW 所以无害，但顺序是错的）
- [ ] 修：换顺序

### 9.3 admin 的 `apiPost` / `apiPut` 没有错误 toast

- `apps/admin/src/api/client.ts`：只有 `apiGet` 包了 `message.error`，后台写操作失败时提示不一致
- [ ] 修

### 9.4 内容安全检测串行打微信

- `content-security.service.ts:37-41`：`for` 循环里逐条 await，每条 5s 超时
- 多字段记录（note + foodName + …）会串成几百 ms～数秒
- 无文本字段时已提前 return，纯喂奶/尿布记录零成本 ✅
- [ ] 修：`Promise.all`

### 9.5 图片审核与上传串行

- `upload.controller.ts:47-53`：`checkImage`（8s 超时）→ `storeImage`，两个网络往返串起来
- 「先审再存」是有意的合规决策，不轻易改；但 >1MB 的图直接跳过审核（`content-security.service.ts:12`）这条要留意实际命中率
- [ ] 评估：是否需要改，或只调超时

### 9.6 nginx vhost 配置不在仓库

- runbook 已记：5 个 vhost 只存在于服务器 `/www/server/panel/vhost/nginx/*.conf`
- [ ] 拉一份进 `deploy/nginx/`

### 9.7 定时任务用进程内 `setInterval`

- `vaccine-reminder.service.ts:36-42`：30 分钟一轮，靠 `hour === 9` / `hour === 21` 命中
- 时钟不对齐 + setInterval 会漂移；dedupeKey 兜住了重复发送，但漏发没有兜底
- [ ] 评估：换 cron 表达式对齐时钟（会引入一个依赖，需权衡）

### 9.8 后台 SPA 是单个 2.28MB chunk（2026-09-23 生产构建日志暴露）

```
dist/assets/index-xToEUtkD.js   2,279.85 kB │ gzip: 742.77 kB
(!) Some chunks are larger than 500 kB after minification.
```

- 一次 `vite build` 出 2.28MB 未压 / 743KB gz 的单一 JS，登录后台就得全量拉下来
- 大头是 `antd` + `echarts` 全量引入（见 `apps/admin/package.json`）
- [x] 2026-09-23 已确认（见 7.3）：**公网路径没开 gzip** → 这 2.28MB 是实打实每次登录都要下的，
      不是"压完只有 743KB 所以无所谓"。**先把 gzip 开了再说分包**——
      开 gzip 是一处改动全场受益，分包要先动路由结构；顺序反了就是白干活
- 可选改法（按性价比）：路由级 `React.lazy` 分包，让 echarts 只在数据/运维页加载；
  或 `manualChunks` 把 antd / echarts 拆成独立可缓存 chunk（后台不常发版，拆开后二次访问命中缓存即秒开）
- 属于「admin 前端返工」那一档，等 gzip 落地后还有真实诉求再做，别只为构建告警动手

---

## 分批建议

**第一批 · 半天 · 低风险高确定性**
1.1 1.2 1.3 ✅（2026-09-22 已完成）· 2.1 · **5.1 5.2 ✅（2026-09-22 已完成，含部署安全改造，见下）** 5.3 · 6.1 6.2 6.6 · 3.2 · 8.2 8.3

**本清单之外新增并已完成（2026-09-22）· 部署安全链路**

起因是用户真正的痛点：「发版只能很迟才发，怕影响用户使用」。实测把风险量化后修正了优先级 ——
`server.sh` 的构建阶段老进程一直在服务，硬性停机空窗只有约 **0.56s**；而"发上去一个起不来的版本"
才是会让全站挂几十分钟的那一档。所以投入压在后者：

- `apps/server/scripts/deploy-preflight.js`：**在 `pm2 delete` 之前**用生产同一份 `.env`、
  在临时端口起一个禁掉定时器的实例，验「实体表 vs 库中表 / 启动 / 只读接口 / 优雅退出」。
  不过就中止，线上进程根本没被动过。专抓 `pm2 reload --wait-ready` 救不了的那一类
  （boot 正常但表结构或功能是坏的）。
- `server.sh`：`git pull` **之前**打 `pre-deploy` 回滚锚点（pull 之后就找不到上一版了）；
  部署后自动验收 `/api/health` + 一个走控制器的只读接口，失败自动 `git checkout` 锚点 + 重建 + 重启，
  并走 Server酱 直发告警（出事时应用本身可能正是坏的，不能指望它自己推）。
- 探活脚本的正反例都实测过：表齐 11/11 绿；指向 `information_schema` → 列出 14 张缺表并 exit 1；
  库名不存在 → exit 1；探活端口被占 → 立即中止（这条是过程中发现的假绿风险，
  不修的话闸门会去验一个残留的旧进程然后报全绿 —— 比没有闸门更危险）。
- 明确不做：`pm2 reload` / cluster 零停机。理由：它解决的 0.56s 在 DAU 34 下几乎撞不到，
  代价却是改运行模型（进程内状态要重新审视）+ 第一次切换本身仍有一次硬停机。

**第二批 · 一天 · 需真机验证 / 需先确认外部开关**
3.1（先确认又拍云）· 4.1 4.2 4.3 4.5 · 8.1 · 7.3

**第三批 · 想做再做**
4.4 · 7.1 7.2 · 6.3 6.4 6.5 · 2.6 · 第八/九节剩余项
