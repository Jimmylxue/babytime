# 发版清单 · 2026-09-18 20:39

> 本文件由 AI 按 AGENTS.md 规则自动维护：所有待生产执行的发版项都带可复制命令。
> 某项在生产的执行情况经用户确认后，在对应项打勾并记日期。

## 待发布 · 2026-09-18（commit 7c80933 → a0cd02e，共 5 个 commit）

### 1. 推送代码 ✅ 已完成（2026-09-18，origin/main = a0cd02e）

### 2. 【阻塞】生产 .env 密钥检查

JWT 已改为「缺密钥拒绝启动」，生产 `.env` 必须有这两个变量，否则 `server.sh` 部署后服务起不来。

```bash
# 服务器上，仓库根目录执行（只看变量名，不泄露值）
grep -c '^JWT_SECRET=' .env && grep -c '^ADMIN_JWT_SECRET=' .env
# 两个都输出 1 即通过；输出 0 则生成并补进 .env：
openssl rand -hex 32   # 分别生成两个值，写入 JWT_SECRET= / ADMIN_JWT_SECRET=
```

⚠️ 若生产此前没配过这两个变量，说明一直在用代码里的旧默认密钥签 token；补配真密钥后**全体用户旧 token 失效一次**——已上线的客户端会看到一次「请重新登录」，重新登录后正常（本次的静默续期要等新版本发布后才生效）。

### 3. 生产 SQL ✅ 已全部执行（2026-09-18 用户确认，含 db-indexes-2026-09.sql）

剩一步：给生产库的登记表做一次性初始化（**只记账不执行**，之后新 SQL 都走脚本防重复）：

```bash
bash run-sql.sh --mark docs/sql/acquisition-source.sql docs/sql/admin-audit-logs.sql docs/sql/family-member-nickname.sql docs/sql/vaccine-schedule-2026.sql docs/sql/db-indexes-2026-09.sql
bash run-sql.sh --status   # 应显示 5 个 [已执行]
```

注意：`run-sql.sh` 本身还没 commit/push——服务器 `git pull` 之前脚本还不存在。先提交这批文档改动并推送，再上服务器执行。

### 4. 清理 uploads 历史违规文件（待确认）

上传白名单是本次新加的，此前有 .svg 文件传入的先例。

```bash
# 服务器上查看（确认无人引用后再删，先只列）
ls apps/server/uploads/*.svg 2>/dev/null
# 确认要删后：rm 对应文件；upyun 驱动则到又拍云控制台清理 baby-time/ 目录下的非图片文件
```

### 5. 部署服务端

```bash
bash server.sh   # 自动：备份快照 → git pull → pnpm install → 构建 admin/server → pm2 重启
# 起来后立刻看日志确认没有 JWT_SECRET 报错：
pm2 logs baby-time-server --lines 30
```

### 6. 小程序构建 + 真机回归 + 提审

```bash
bash mini.sh <版本号> "<描述>"   # 自动 pnpm install + build:shared + 构建上传
```

真机回归清单（本轮改动涉及）：
- [ ] 统计页：各页签切换、图表点按联动日期、WHO 曲线缩放/点选、任意图表海报分享/保存
- [ ] 首页：快速记录九宫格、更多弹层、照片上传、疫苗卡订阅、日报生成、冷启动骨架屏
- [ ] 上传：相册传图成功；开发者工具里把 storage 的 token 改坏再操作 → 应静默续期，不弹「请重新登录」
- [ ] 疫苗时间轴正常渲染（数据源已切到共享包）
- [ ] 身高/体重记录页保存后，首页与统计页数值显示正常（decimal 列服务端已转数字）
- [ ] 三种海报都要出一张对比画质（图表/日报/纪念册）——渲染管线刚统一（preparePosterCanvas + deliverPoster），理论输出不变
- [ ] 记录统计链路抽查：统计页 7 天数据、完整明细间隔、今日总结（record.service 拆出 record-query.service）
- [ ] 管理后台登录正常；连续 5 次输错密码会锁 15 分钟（防爆破，属预期行为，重启服务即解锁）
- [ ] 后台订阅看板用户列表、手动测试推送正常（notification 拆成计划/发送/微信三个 service，入口门面不变）
- [ ] 备注里输入明显违规词应被拦截保存（access_token 已统一为单一来源，敏感词检测与推送共用一张证）
- [ ] **CDN 插画全页过一遍**（2026-09-20 变更）：包内 webp 在 iOS/Android 真机都不渲染，
      14 张装饰图已全部改走 CDN PNG —— 逐页确认显示：首页宝宝卡（男/女宝两种插画）、
      首页疫苗卡、未建档空状态、睡眠页、喂奶页、换尿布记录页、家庭页、宝宝列表、
      相册空状态、登录页 logo、baby-edit 预览头像、本月关注。
      弱网下图空白属预期（装饰图不再打包内，见 config/assets.ts 注释）


---

## 待发布 · 第二轮（2026-09-21 成长里程碑）

> 上一轮的提审版本（commit 2d91b69）不含这些改动；本轮是它之后的第一个功能批次，
> 走**下一次提审**。因为上一轮清单尚未整体打勾，按 AGENTS.md 规则续写在本文件里。
> 本地已验证：服务端接口 16 项端到端打桩全过（真库真 HTTP）、海报绘制 17 项画布打桩全过、
> 服务规则 27 项全过、shared/server/client 三端构建通过。

### 1. 生产 SQL（必须先于服务端）✅ 已执行（2026-09-22 用户确认）

新表 `baby_milestones`。**不先建表就部署服务端，里程碑接口会全部 500。**

```bash
# 服务器上，仓库根目录执行
bash backup-db.sh pre-deploy
bash run-sql.sh docs/sql/milestone-2026-09.sql
bash run-sql.sh --status          # 确认已登记，不会重复执行
# 验证：表结构与本地开发库一致（本地 synchronize 已建过，可直接对照）
mysql -u<用户> -p baby_time -e "SHOW CREATE TABLE baby_milestones\G"
```

与开发库的唯一差异：本地会多一个 `baby_id` 外键，生产**故意不建**（删宝宝由应用层在同一事务里清子表），
详见该 SQL 文件末尾说明。纯新增表，回滚只需下线功能入口，**不要 DROP TABLE**。

### 2. 环境变量

无新增变量。里程碑不涉及推送与上传通道，`.env` 不用动。

### 3. 部署顺序

⓪ 已完成（2026-09-21）：commit `6d4ee21` 已推送，`origin/main` = 6d4ee21（30 文件 / +2504），
服务器可以开始 ①→③。

```bash
git add -A && git commit -m "feat: 新增成长里程碑；fix: 首页更多弹层被区块动画困住"  # ⓪ 本地
git push origin main                                                                # ⓪ 必须先推送
bash run-sql.sh docs/sql/milestone-2026-09.sql   # ① 建表
bash server.sh                                   # ② 服务端 + admin（admin 会随脚本重新构建）
bash mini.sh <版本号> "新增成长里程碑"              # ③ 小程序
```

进度核对（更新 2026-09-22 深夜）：**③ 已完成 —— 小程序已发布上线一个版本**
（用户确认：「里程碑的事情我已经做了 已经发够一次版本了」）。① 建表 SQL 当日早前已确认执行；
② 服务端已部署 —— 依据是本版小程序一进里程碑页就调 `/api/milestone`，服务端没上必然当场报错，
能正常发布说明线上至少是 `6d4ee21`。

⚠️ 仍待确认：**发布的那一版是从哪个 commit 切的包**。`mini.sh` 同样靠 `git pull origin main` 取代码，
若切包时 `origin/main` 已推进到 `44e51c4`，则第 9 节（图片清理）与第 10 节（安全合规批次）
**已经随之上线生产**，那两节的部署步骤可直接打勾；若还停在 `19baf0f`，它们仍是待发布。
在服务器上一条命令即可判定：

```bash
git log --oneline -1        # 生产工作区实际停在哪个 commit
```

所以本文件顶部**不加**「✅ 已发布」总标记 —— 确认发出去的是里程碑这一批；
第 9、10、11 节（图片清理 / 安全合规批次 / 配置漂移）是否已上线还没核实，标全会误导。
下方第 4 节真机回归项既然已随版本发出去，仍未打勾的请按「补测项」理解，不再是发布门禁。

⓪ 是硬前置（2026-09-21 核对）：`origin/main` 当时仍停在 `2d91b69`，里程碑批次与首页弹层修复
全部还在工作区。`server.sh` / `mini.sh` 都靠 `git pull origin main` 取代码，
不推送就上服务器执行会**静默部署成旧版本**（脚本还会显示成功）。

小程序端可先于服务端发布吗？**不行**——新页面一进去就拉列表，服务端没上会直接报错。
必须按 ⓪→①→②→③。

本轮无新增依赖（`pnpm-lock.yaml`、`package.json` 均未改动），`server.sh` 里的
`pnpm install --frozen-lockfile` 不会因缺 lock 条目失败。

### 4. 真机回归清单（本轮改动涉及）

- [ ] 成长里程碑（我的 → 宝贝与家庭 → 成长里程碑）：**冷启动进入不闪「还没有宝宝档案」**，
      已建档用户直接看到时间轴（这一条是本轮最容易改坏的地方，页面加了 loading 门禁）
- [ ] 发现页宫格第 5 个 🌟 成长里程碑能进
- [ ] 预置项打卡：点清单里的「打卡」→ 名称只读、保存 → 时间轴出现该条
- [ ] 同一条预置项**再打一次**：应提示「『××』已经打过卡了」，不产生第二条（库里有唯一索引兜底）
- [ ] 自定义打卡：名称必填、日期不能选未来、备注 60 字上限、选图上传成功（走又拍云真实链路）
- [ ] 点已打卡的卡片 → 操作面板：修改日期/备注、删除（二次确认）；预置项改名应无效
- [ ] 生成纪念海报：**有照片 / 无照片两种各出一张**，保存到相册 + 发送给好友都正常；
      无照片时应是 emoji 大圆而不是空白
- [ ] **照片不被裁切**（2026-09-21 二次修改）：竖图（3:4）在时间轴里按原比例显示并收窄居中，
      点照片 → 全屏看原图（可双指缩放），**关闭预览返回时不应重新拉一遍列表**（与首页/相册同一处理）；
      海报照片同样按原图比例出框
- [ ] **海报照片上限放到 1.8**（2026-09-21 三次修改）：手机竖拍（1.33）与 16:9 直出（1.78）
      **一张都不该裁**；只有长截图（比例 > 1.8）才裁上下，且选图后会出现一行提示
      「这张图比较长，做成海报时会裁掉上下两端」——不长的图不应出现这句
- [ ] **打卡成功小卡**：新增打卡后弹「记好了 · 要不要做成纪念海报？」，点「现在就做」直接出海报、
      点「先不用」或蒙层关闭；**编辑已有记录不应弹这张卡**（只有新增会）
- [ ] **首次引导气泡**：时间轴上方「点任意一条，可以生成纪念海报、修改或删除」，
      点「知道了」或直接点任一卡片即消失，且**下次进入不再出现**（storage 标记）
- [ ] **打卡选择器（解决"记录多了要滚到底才能打卡"）**：右下角常驻「＋ 打卡」→ 拉起清单选择器，
      可搜索（试「翻身」「长牙」「走路」）、按参考月龄排序、已打过的标「已记」（点会给提示），
      底部「＋ 都不是，记一个自己的」走自定义；选一条即进入打卡表单。
      **滚到时间轴最底部再点 FAB，应当不用滚动页面就能选到预置项** —— 这是本轮真正要验的那件事
- [ ] 清单区默认只列 3 项（原来 6 项），长列表下滚到「还没记的第一次」的距离应明显缩短
- [ ] 扫海报上的小程序码进入 → 新用户注册后，后台「用户列表」来源列显示「里程碑」
- [ ] 家人代记：用家庭成员账号打卡 → 后台/接口返回的 `actorUserId` 是打卡人而不是宝宝创建者
- [ ] 备注里输入明显违规词应被拦截（里程碑文本走的是与宝宝名同款内容安全检测）
- [ ] 未登录进入该页 → 应弹「需要登录」而不是白屏
- [ ] **回归既有海报三件套**（图表/日报/纪念册）各出一张：本轮把 `wrapText` 从 albumPoster
      提到了 canvasDraw 共享，纪念册长图受此影响，重点看照片墙与折行文案
- [ ] 回归月龄显示：首页宝宝卡、疫苗时间轴、成长纪念册的「N 个月 N 天」——
      `calculateAge` 内部改为按本地时区解析日期（`calculateAgeAt`），东八区结果不变，
      但海外时区用户的月龄可能纠正过来（原来会差一天）
- [ ] 首页「更多」弹层（2026-09-21 修复）：点快速记录的「更多」→ 弹层应贴在**屏幕底部**、
      蒙层盖满整屏（含底部 TabBar），点蒙层任意位置可关闭；此前弹层渲染在 `.quick-section` 内，
      该区块 `fadeUp` 动画结束保留 `translateY(0)` 形成包含块，fixed 弹层被压在卡片盒子内
      （停在页面中部、下方无蒙层）——现已把弹层移到与区块平级

### 5. 已知限制（不是 bug，先记着）

- 清单只覆盖 0–42 月龄，4 岁以上的宝宝在「还没记的第一次」里会是空的，只有自定义打卡可用
- 参考月龄是「多数孩子在几月龄内做到」的观察区间，页面底部已带免责声明；
  文案刻意不做「晚了怎么办」的建议，避免被读成发育评估
- 里程碑暂未接入订阅消息与晚间回顾推送（下一步可把它塞进回顾消息的一句话里）
- 里程碑选图仍走 `sizeType: ['compressed']`（微信压缩图）：比例已经不再裁，但画质有上限。
  要出更清晰的纪念海报需允许原图上传，代价是存储与流量 —— 与相册那条是同一个决定，待拍板
- 主包体积：新页面产物 108 KB，与疫苗时间轴（100 KB）同量级，远小于统计页（344 KB）

### 6. 追加（2026-09-21）：413 来源诊断日志 · 纯服务端

生产 pm2 error 日志反复出现 `PayloadTooLargeError: request entity too large`（23:36:34 / 23:36:37 两条）。
成因：`apps/server/src/main.ts` 从未配置 body-parser，走 Express 默认的 **JSON 请求体 100KB 上限**，
超了就在进 controller 之前被拒成 HTTP 413，日志里只有一串 stack、没有路径，分不清是谁发的。
本轮排查过客户端全部 JSON POST（record / milestone / photo / stool-analysis / subscriptions / user events / 后台公告），
体积都在几 KB 内，照片走的是 multipart（不受该上限约束），所以最可能是外部流量。
处置决定：**不放开 100KB**，先加一行日志看清楚来源再定。

改动只有 `apps/server/src/main.ts` 一个中间件（挂在 `enableCors` 之后；Nest 要到 `listen()` 才注册
body-parser，所以这个位置排在它前面）。无新增 SQL、无新增环境变量、不动小程序。

```bash
# ① 本地先提交推送（server.sh 靠 git pull 取代码，不推送会静默部署成旧版本）
git add apps/server/src/main.ts
git commit -m "chore: 记录被 body-parser 拒掉的超大 JSON 请求"
git push origin main

# ② 服务器部署（里程碑那一步若还没做，必须先做 ①建表 再跑这条）
bash server.sh
pm2 logs baby-time-server --lines 50    # 应看到 🚀 服务运行在，且无 JWT / 启动报错

# ③ 观察：诊断行与 PayloadTooLargeError 在同一个 error 日志文件里
grep '\[413\]' /home/ubuntu/.pm2/logs/baby-time-server-error.log | tail -20
```

本地验证方式（`node /tmp/verify-413-log.js`，需 `NODE_PATH` 指到 `apps/server/node_modules`）：
200KB JSON 分别用 content-length 与分块传输（无 content-length）各发一次 → 两条 `[413]` 日志都出，
小请求正常放行不受影响。

**怎么读这行日志**：`ua` 是 `Mozilla/5.0 ... miniProgram/wx...` 且 `x-forwarded-for` 是真实用户 IP
→ 说明有用户被误伤，要回去看是哪个功能发出了大 body；`ua` 为空 / `curl` / `python-requests`
→ 外部扫描，维持 100KB 不动。

两个前提说明（**待确认**）：

- 前面有宝塔的 nginx，`client_max_body_size` 默认 1m —— 超过 1MB 的 JSON 会在 nginx 就被拒掉，
  根本到不了 Node，所以 pm2 里这行日志只覆盖 100KB～1MB 这一段。要看得更全，交叉查一下访问日志：
  ```bash
  grep ' 413 ' /www/wwwlogs/*.log | tail -20     # 文件名按实际站点调整
  ```
- 服务未开 `trust proxy`，日志里的 `ip` 会是 nginx 的内网地址，真实来源看 `x-forwarded-for`（故意的，
  开了 trust proxy 会同时允许客户端伪造该头，为一行诊断日志不值得）

看清来源后这一行日志要么删掉、要么留着当常态告警源 —— 到那时再定，本轮不预设。

### 7. 追加（2026-09-22）：后台「运维看板」· 服务端 + admin

背景：本轮把 6 个 HTTPS 端点全部改成自动续签（详见 `docs/ops-runbook.md` 第七节）。自动化的对立面是静默失败，
所以加一个后台页面，**由服务端当场与线上握手**读真实证书的剩余天数与可信状态，同时覆盖 acme.sh 与又拍云两套机制。

改动文件：`apps/server/src/modules/admin/ops-health.service.ts`（新增）、`admin.controller.ts`、`admin.module.ts`；
`apps/admin/src/pages/Ops.tsx`（新增）+ 路由 / 菜单 / types；`.env.example`。
**无 SQL、无新增依赖、不动小程序。**

#### 环境变量（新增，非阻塞）

```bash
# 生产 .env 补一行。不配也能跑，只是页面顶部显示「未配置」
OPS_DOMAIN_EXPIRY=2027-10-17
```

#### 部署

```bash
git add -A && git commit -m "feat: 后台新增运维看板，探测线上证书与域名到期"   # ⓪ 本地
git push origin main                                                            # ⓪ 硬前置，不推送会静默部署成旧版本
bash server.sh                                                                  # 服务端 + admin 一起构建重启
```

#### 上线后必查：服务器能不能访问自己的公网域名

探测是从 CVM 内部发起的，会经公网 DNS 绕回来（NAT hairpin）。腾讯云通常支持，
但**若这台机器回环不通，5 个 nginx 站点会全部显示「握手失败」**——那是探测路径问题，不是证书故障，别慌。

```bash
# 服务器上执行：7 行都应为 true + 一个到期时间；出现 FAIL 即为回环不通
node -e 'const t=require("node:tls");["baby-cheese","babybt","bt2","movie","qbdownload","babyimg","image"].forEach(t0=>{const h=t0+".jimmyxuexue.top";const s=t.connect({host:h,port:443,servername:h,timeout:5000,rejectUnauthorized:false});s.once("secureConnect",()=>{const c=s.getPeerX509Certificate();console.log(h,s.authorized,c&&c.validTo);s.destroy()});s.once("error",e=>console.log(h,"FAIL",e.message))})'
```

若这里 FAIL 而浏览器访问正常 → 需要把探测改成连 `127.0.0.1:443` 并保留 SNI，届时再改。

#### 后台回归

- [ ] 登录后左侧出现「运维看板」，7 个端点都有剩余天数（`image` 约 35 天，其余约 89 天）
- [ ] 「重新探测」转圈后右上角时间戳更新（结果缓存 5 分钟）
- [ ] 顶部三张卡：域名到期倒计时取到 2027-10-17、最早到期证书、需处理端点数
- [ ] 未登录直接访问 `/ops` 应跳登录页（走 `AdminJwtGuard`，与其他后台接口一致）

### 8. 追加（2026-09-22）：运维告警接 Server酱 微信推送

第 7 节的看板要人主动打开才看得见。这一节补上"出事它来找你"：每天探一次线上真实证书，**只在异常时推微信，正常静默**。
复用同一个 `OpsHealthService`，阈值与看板一致。

触发条件（命中即推）：

| 情况 | 重复提醒间隔 |
|---|---|
| 某端点握手失败 / 证书链不被信任 | 每 24 小时 |
| 某端点证书剩 < 14 天 | 每 6 天 |
| 主域注册到期 < 45 天 | 每 6 天 |

去重记录在进程内存里，`pm2 restart` 后重置，最坏结果是重启当天多推一条。

#### 环境变量（新增两个，都要配）

```bash
# 服务器上，仓库根目录执行
# 1) SERVERCHAN_KEY：手机微信访问 sct.ftqq.com 扫码登录，首页「SendKey」那一串（形如 SCTxxxxx），
#    关注「Server酱服务号」后消息直接进微信。免费档每天 5 条——本告警正常一天最多 1 条，用不完。
#    （换掉最初的 PushPlus：它实名认证要收费 10 元，为一个每天最多一条的告警不值当）
# 2) OPS_ALERT_TOKEN：自己生成，只用于本机 cron 调接口
openssl rand -hex 32
```

两个值手工写进 `.env`（**值不要贴进对话、不要提交**）：

```
SERVERCHAN_KEY=<扫码拿到的 SendKey>
OPS_ALERT_TOKEN=<上面生成的>
```

⚠️ `OPS_ALERT_TOKEN` 留空时 `POST /api/admin/ops/alert-check` 直接返回 503 自我禁用。这个接口**不走** `AdminJwtGuard`
（cron 没有登录态），所以宁可禁用也不能敞开一个无凭据的公网写接口。

#### 部署与验证

```bash
bash server.sh                                   # ① 部署（前提：已 git push）
pm2 logs baby-time-server --lines 20             # ② 确认无启动报错

# ③ 手动打一次。⚠️ 路径前缀是 /api（main.ts 有 setGlobalPrefix('api')），端口取 .env 的 PORT，生产为 3006
T=$(grep -m1 '^OPS_ALERT_TOKEN=' .env | cut -d= -f2)
curl -sS -m 30 -X POST http://127.0.0.1:3006/api/admin/ops/alert-check \
  -H 'Content-Type: application/json' -d "{\"token\":\"$T\"}"; echo
# 一切正常时应返回：{"code":0,...,"data":{"pushed":false,"findings":[],"attempted":0}}
# token 写错时应返回 401（证明鉴权生效）；返回 404 说明代码没部署上
```

**想确认推送真能到手机**：把 `.env` 的 `OPS_DOMAIN_EXPIRY` 临时改成一周内的日期，再跑一次 ③，
手机应收到「域名 jimmyxuexue.top … 注册到期，只剩 N 天」；**验完务必改回 2027-10-17**。

本地验证方式（`node -e` 直连 `dist`，不用起服务）四场景全过：健康时不推（`findings:[]`）；域名临期且无 key →
报"SERVERCHAN_KEY 未配置"不推；配假 SendKey → 返回 `HTTP 400 {"code":40001,"message":"[AUTH]错误的Key"}`
（证明地址与表单格式都对，且 4xx 的响应体能落进返回值而不是被 axios 吞掉）；同一原因再跑 → 被去重抑制（`attempted:0`）。

⚠️ 改这个文件时注意：Server酱 **成功时 `code` 是 `0`**，不是 200——和常见 HTTP 库的习惯相反，别顺手"修"成 200。

#### 挂 cron

```bash
crontab -e
```

加一行（与备份 cron 同一个表，注意保持 `bash` 环境）：

```
30 9 * * * cd /home/ubuntu/babytime && T=$(grep -m1 '^OPS_ALERT_TOKEN=' .env | cut -d= -f2) && curl -sS -m 30 -X POST http://127.0.0.1:3006/api/admin/ops/alert-check -H 'Content-Type: application/json' -d "{\"token\":\"$T\"}" >> /home/ubuntu/ops-alert.log 2>&1
```

`crontab -l` 确认在位。token 用 `grep` 现取、不写死在 crontab 里，因此不会出现在 `ps` 输出；
日志落在仓库外的 `/home/ubuntu/ops-alert.log`，内容是接口返回的 JSON，不含 token。


---

### 9. 追加（2026-09-22）：删除记录时清理又拍云图片对象 · 纯服务端

背景：此前删除只做逻辑上的 DB 行删除，图片对象永久留在又拍云（隐私政策承诺的"删除个人信息"
在存储层没兑现，存储成本只涨不降）。现在删照片/删里程碑/删记录/删宝宝/换头像都会把
**不再被任何记录引用**的图片对象一起删掉。

- 新增 `apps/server/src/modules/upload/cdn-cleanup.service.ts`；`UploadService` 加 `storedImageName()` 与 `deleteStoredImage()`
- 接线点：`photo.service`（单删/批量删）、`milestone.service`（删/换图）、`record.service`（删/换尿布图）、
  `baby.service`（删宝宝连带清 + 换头像）、`user.service`（换头像）
- **无 SQL、无新增环境变量、不改实体** → 表结构不用动

#### 安全设计（为什么不会删错图）

1. 文件名必须是上传时自己生成的 `<uuid>.<jpg|png|webp|gif>` 形状，其他一律不看 ——
   同桶的装饰图 `/baby-time/assets/*.png`、历史遗留文件、外链全部被这条规则挡掉
2. 删前按文件名回查全库六个存图地址的列（photos.url / photos.thumbnail / baby_milestones.photo_url
   / records.diaper_image / babies.avatar / users.avatar），**只要有命中就保留**
3. 先删 DB 行、后清 CDN：回查才能判准
4. 清理跑在请求之外（fire-and-forget），CDN 不可达只记日志，绝不会让用户的删除操作报错或变慢

#### 部署

```bash
# ⚠️ 前提：第「二轮」的里程碑 SQL 必须先跑（本批代码在 origin/main 之上，一起会被带上）
bash server.sh
pm2 logs baby-time-server --lines 20            # 确认无启动报错
```

#### 真机回归（删图不可逆，这项必做）

- [x] 小程序相册删一张**当天刚上传的测试图** → 日志应出现 `图片 <uuid>.jpg 清理：deleted`，
      拿该 URL 到浏览器应 404；`pm2 logs baby-time-server | grep 清理`
      —— 2026-09-22 本地实测通过（本地 `.env` 就是 `UPLOAD_DRIVER=upyun` 真桶）：
      日志 `图片 7f138aa1-….png 清理：deleted`，该 URL 现返回 **404**，
      同桶装饰图 `baby-time/assets/app-logo.png` 仍 **200**（证明形状白名单没误伤）。
      生产侧部署后再顺手看一行日志即可，链路本身已验过
- [ ] 里程碑删一条带图打卡 → 同样出一条 `清理：deleted`
- [ ] **删宝宝**（用一个测试宝宝档案）→ 日志应有多行清理，且宝宝相册/时间轴不再报错
- [ ] 换头像后再看旧头像 URL → 应已 404，新头像正常显示
- [ ] 反向确认没删错：相册里**保留**的照片、统计页/首页的装饰插画（`/baby-time/assets/`）全部正常显示
- [ ] 同一张图被两处引用时（给里程碑选一张相册里已有的图，再删掉那张相册图）
      → 日志应出现 `仍被其他记录引用，保留`，里程碑里的图还能看

#### 已知限制（不是 bug，先记着）

- 上传成功但用户没保存（便便 AI 分析、选图后取消）产生的孤儿文件，本次机制管不到 ——
  需要一次「列桶 + 与 DB 差集」的历史清理脚本才能收掉，另议
- 本次改动之前删掉的图仍是孤儿，同上
- 回查用 `SUBSTRING_INDEX(col,'/',-1)` 不走索引，千行量级无感；照片表上万行后要注意耗时
- 清理任务是进程内 fire-and-forget：若正好在删除瞬间 `pm2 restart`，那批图会漏删（只留孤儿，不删错）

---

### 10. 追加（2026-09-22）：安全与合规批次 · 服务端 + 小程序文案

七项，都按"小、可回退、不引新依赖"实现（限流是进程内计数，与后台登录锁定同一套路）。

| # | 问题 | 修法 |
|---|---|---|
| 1 | 邀请码只有 32 bit 熵，可爆破 | `crypto.randomInt` + 32 字母表 × 8 位 ≈ 40 bit（列宽仍是 8，**不用改表**）；查卡/接受两个端点加限流 |
| 2 | 卡号无效/过期也回真实宝宝名+家人昵称（爆破的验证器） | 这两种情况只回占位文案；有效卡照旧回，加入流程不受影响 |
| 3 | 缺微信凭据会退回"任意 code 都能登成新用户"的模拟登录 | 删除该分支，改为 503 拒绝（与 JWT_SECRET 的 fail-fast 同口径） |
| 4 | appsecret 拼在 URL 里，axios 错误对象带 config.url，网络抖一次就写进 pm2 日志 | 改 `params` 传参，日志只记 `error.message` |
| 5 | 上传/AI 分析无配额（成本型 DoS） | 每人每天：上传 200 张、便便 AI 30 次 |
| 6 | 订阅额度由客户端自报，可无限刷（灌脏后台漏斗口径） | 每人每天最多 20 次入账调用 |
| 7 | 图片 UGC 一张都没审核 | 上传时先送 `wxa/img_sec_check`（同步、≤1MB），违规 400 拦下、不落 CDN |
| 8 | 隐私政策写了"应用内注销账号"功能，实际不存在 | 文案改为「我的 → 帮助与反馈 → 意见反馈/联系客服」申请注销（微信内置入口），均为既有能力 |

- 新增 `apps/server/src/common/rate-limit.service.ts`（全局，挂在 `WechatModule` 上）；改动落在
  `family.service` / `user.service` / `upload.controller` / `content-security.service` / `stool-analysis.controller` / `vaccine-plan.service` / 小程序 `pages/privacy`
- **无 SQL、无新增环境变量**

#### ⚠️ 一处行为变化（配置缺失会变成阻塞，这是有意的）

`WECHAT_APP_ID` / `WECHAT_APP_SECRET` 任一行缺失或写错，登录接口直接 503（以前会静默退化成"任何人可登录"）。
生产 .env 这两行必须已在位，部署前确认：

```bash
grep -c '^WECHAT_APP_ID=' .env; grep -c '^WECHAT_APP_SECRET=' .env   # 都要输出 1
```

#### 部署

```bash
# 前提：二轮里程碑的 SQL 已执行（本批代码在其之上）
bash server.sh
bash mini.sh            # 隐私政策文案改了，小程序要重新上传
pm2 logs baby-time-server --lines 20
```

#### 上线后必查：图片审核到底有没有在生效

`wxa/img_sec_check` 是 1.0 接口。传一张图后看日志：

```bash
pm2 logs baby-time-server | grep -i imgSecCheck
```

- 看到 `imgSecCheck 通过` → 有效，收工。**2026-09-22 本地已见此一行**（`imgSecCheck 通过（media.png, 65206 字节）`），
  说明该接口对这个 appid 可调、图片审不是空转；87014→400 那一支仍没实测样本（与文本检测共用同一个 errcode 语义，
  文本侧已在生产用于拦截），有安全样本时再补一次
- 看到 `imgSecCheck errcode=xxxxx ... 按放行处理` → 该接口对这个小程序已不可用（微信推荐的是异步
  `media_check_async`，需要在公众平台配消息接收服务器才能拿结果）。此时图片审等于没审，
  要单独决策是否上异步方案或接第三方鉴黄，不要以为这条已经做完

#### 真机回归（限流阈值是估的，重点看别误伤正常用户）

- [ ] 家人邀请全流程：生成新卡 → 卡号应为 8 位大写字母数字（如 `RTJ3EG9Z`）→ 另一个账号输入/扫码 →
      能正常加入；旧格式（8 位十六进制）的在有效期内的老卡仍可用
- [ ] 拿一个不存在或已过期的邀请码进加入页 → 应显示"邀请无效/已过期"，**不应显示任何宝宝名或家人昵称**
- [ ] 相册连传 5 张、便便 AI 连用 3 次、换一次头像 → 全部成功，且不出现「操作太频繁」（触发阈值说明配额要放宽）
- [ ] 上传一张明显违规图（测试用）→ 应弹「图片包含违规内容」且 CDN 里没有该对象
- [ ] 记录/相册/里程碑的文本违规检测仍照常拦截（本轮没动文本链路）
- [ ] 后台「订阅看板」手动测试推送仍正常（`saveGrants` 加了限额，不影响发送）
- [ ] 未登录冷启动小程序 → 登录正常（生产凭据在位时行为不变）

#### 已知限制

- 限流计数在内存里，`pm2 restart` 后清零 —— 目的是挡脚本刷，不是绝对配额
- 单图 >1MB 跳过检测（接口硬限制），wx 端 `compressed` 出图通常 <1MB；放开原图上传后这条覆盖不到大图
- 429/400 都走客户端 `request.ts` 的通用分支，会直接把服务端文案弹给用户，无需改客户端

---

### 11. 追加（2026-09-22）：修订阅消息配置漂移 · 服务端 + `.env.example`

来自 `docs/2026-09-22-optimization-backlog.md` 第一节（1.1 / 1.2 / 1.3）。

#### 为什么要单独确认生产

`.env.example` 里这几个字段名一直是错的（`date2` / `phrase3` / `date3`，还多一个代码从不读的
`WECHAT_REVIEW_FIELD_SUMMARY`，少一个 `WECHAT_REVIEW_FIELD_FEEDING`）。
**代码里的 fallback 只在变量「不存在」时生效** —— 如果生产 `.env` 是照着旧 example 配的，
那么 `WECHAT_VACCINE_FIELD_DATE=date2` 这个错值会**盖掉**正确的默认 `time2`，
微信校验模板字段不过就返回 47003，消息发不出去、`notification_deliveries` 记 failed、用户侧毫无感知。
所以这一条不是纯文档修改，**必须到服务器上确认一次现网值**。

#### ① 确认生产 `.env` 的字段名（在服务器上、仓库根目录执行）

```bash
grep -nE '^(WECHAT_VACCINE_FIELD_|WECHAT_REVIEW_FIELD_|DAILY_REVIEW_HOUR)' .env
```

期望看到（与 `apps/server/src/modules/notification/vaccine-reminder.service.ts:91-93, 279-281` 一致）：

```
WECHAT_VACCINE_FIELD_NAME=thing1
WECHAT_VACCINE_FIELD_DATE=time2
WECHAT_VACCINE_FIELD_NOTE=thing6
WECHAT_REVIEW_FIELD_BABY=thing1
WECHAT_REVIEW_FIELD_FEEDING=number2
WECHAT_REVIEW_FIELD_DATE=time3
DAILY_REVIEW_HOUR=21
```

再确认没有残留漂移值：

```bash
grep -nE 'date2|date3|phrase3|REVIEW_FIELD_SUMMARY' .env \
  && echo '⚠️ 命中即生产 .env 带着错值，改成上面那一组后 pm2 restart' \
  || echo '✓ 无漂移值'
```

- [ ] 待确认：生产 `.env` 字段名（本地 `.env` 已实测为正确的一组）

#### ② 发送侧回归（改完 `.env` 或不确定时跑一次）

后台「订阅与唤回」→ 选一个有额度的用户 → 手动直推。这会**真实消耗 1 次订阅额度**，
但它是唯一能验证 `number2` / `time3` 字段格式被微信接受的办法（微信先校验 openid 再校验 data）。

```bash
pm2 logs baby-time-server --lines 50 | grep -iE '47003|errcode|subscribe'
```

- 看到 `errcode=0` / 后台显示 sent → 字段名对
- 看到 `47003` → 字段名仍是错的，回到 ① 改 `.env`

#### ③ 本轮服务端代码改动（需部署，无 SQL、无新增环境变量）

`ops-health.service.ts` 与 `stool-analysis.service.ts` 原先直接 `import axios`，
项目其余 4 处 HTTP 调用走的是 `@nestjs/axios` 的 `HttpService`。已统一收敛到 `HttpService`
（`AdminModule` / `StoolAnalysisModule` 各补 `HttpModule` 接线）。纯重构，行为不变。

已验证：

```
$ pnpm run build:server          → nest build 通过
$ node dist/main.js              → Nest application successfully started，零 DI 报错
$ GET  /api/admin/ops/https      → 200，7 个端点全部 reachable/trusted
$ POST /api/admin/ops/alert-check → 503（OPS_ALERT_TOKEN 未配即禁用，短路在打 Server酱 之前）
$ POST /api/stool-analysis        → 401（未登录）
语义打桩 /tmp/verify-httpclient-semantics.js → 12 通过 / 0 失败
  （2xx 解析 .data；非 2xx 的 error.response.status/.data 形状不变；
    URLSearchParams 仍按 x-www-form-urlencoded 发出；timeout 生效）
配置漂移打桩 /tmp/verify-env-drift.js → ✅ example 与代码完全对齐
  （DRIFT / MISSING / DEAD / REAL_VALUE 四项判据全绿）
```

部署：`bash server.sh`（无顺序要求，可与其它改动同批）

`.env.example` 另改动两处，**不涉及生产操作**：
- 订阅消息段的字段名对齐代码默认值 + 删死 key + 补 `WECHAT_REVIEW_FIELD_FEEDING`，`DAILY_REVIEW_HOUR` 20→21
- 生产真模板 ID 换成空值占位符（模板 ID 留空即该类提醒关闭，符合代码语义）
- 顺带登记了 `DB_SYNCHRONIZE`（注释形式，不改变任何环境的现有行为）——
  它是生产防自动 ALTER 丢列的安全开关，此前只散落在三份文档里、example 从没提过

#### 顺手发现（不在本轮处理，仅记录）

- 探测显示 `image.jimmyxuexue.top` 证书剩 **34 天**（其余 6 个端点 89 天）。
  未触发 14 天告警线，但它是「历史图片域名」、由又拍云自动续签，
  与其他 5 个 acme.sh 泛域名不同源，下次巡检值得单独看一眼它是否真的在续

---

### 12. 追加（2026-09-22）：部署安全链路 · 优雅排空 + 探活闸门 + 自动回滚

动机是用户的一句「发版只能很迟才发，怕影响用户使用」。先把风险量化了一遍，结论是**优先级要换**：

| 测的东西 | 实测结果 |
|---|---|
| 改动前收到 SIGINT 到进程消失 | **6ms**（完全没有排空，在途请求当场断） |
| `pm2 delete → start` 的硬性不可用空窗 | **约 0.56s**（构建阶段老进程一直在服务，不在这段里） |
| 只加排空、不处理空闲连接 | 退出 **6378ms**（反而把 0.56s 恶化成约 7s） |
| 空闲连接也处理掉之后 | 退出 **1407ms**，在途请求 494ms 完整拿到 200 |

所以真正会毁掉服务的不是那半秒，而是「发上去一个起不来的版本」。这一节全部投在这里。

#### 改了什么

1. `apps/server/src/main.ts`：`enableShutdownHooks()` + 信号到达时把 `keepAliveTimeout` 压到 300ms
   并回收空闲连接。**注意**：只调 `closeIdleConnections()` 不够 —— 信号到达那一刻在途请求还没结束，
   那个 socket 还不算"空闲"，会被漏掉，于是照样等满默认 5s。
2. `apps/server/src/modules/notification/vaccine-reminder.service.ts`：实现 `OnModuleDestroy` 清 timer；
   新增 `OPS_DISABLE_SCHEDULER=1` 时完全不建定时器。
3. `apps/server/src/app.controller.ts`：`/api/health` 改为真跑 `SELECT 1`，失败 503。
4. 新增 `apps/server/scripts/deploy-preflight.js`：部署前探活（详见 `docs/ops-runbook.md` 第四节）。
5. `server.sh`：`git pull` 前打 `pre-deploy` 锚点 → 探活（在 `pm2 delete` **之前**）→
   `--kill-timeout 25000` → 切换后验收 → 失败自动回滚 + Server酱 直发告警。

#### ⚠️ 环境变量（新增两个，都不要在生产的 `.env` 里设）

- `OPS_DISABLE_SCHEDULER` —— **正常服务端 `.env` 里绝对不要设**。
  它只由探活脚本在自己的子进程上临时传入。若有人误写进生产 `.env`，
  疫苗提醒和每日回顾会**一条都不发，而且没有任何报错**（只在启动日志留一行 WARN）。

  部署后确认它没被带进生产环境：

  ```bash
  grep -n OPS_DISABLE_SCHEDULER .env || echo "✓ 生产 .env 未设该变量（正确）"
  pm2 logs baby-time-server --lines 200 | grep -c "OPS_DISABLE_SCHEDULER=1"   # 应为 0
  ```

- `LISTEN_HOST` —— 只由探活脚本临时传给它的子进程（`127.0.0.1`），让那个只活几秒的实例
  不再在 `0.0.0.0` 上多开一个可达端口。**生产 `.env` 不要设**：留空才会走 Node 默认的
  双栈监听（实测 `TCP *:3000` 是 IPv6 套接字，同时覆盖 IPv4）。
  当初若图省事在代码里写死 `'0.0.0.0'`，就会退化成 IPv4-only，nginx 只要按 `::1` 回源就直接连不上 ——
  这条是实测出来的，不是推测的，所以「不设时保持原样调用 `listen(port)`」是刻意的。

  ```bash
  grep -n LISTEN_HOST .env || echo "✓ 生产 .env 未设该变量（正确，走默认双栈）"
  ```

- `--kill-timeout` 本机（无 pm2）无法验证是否被接受，已做成**探测式回退**：
  不认就退回原参数并推一条告警，服务照常起，只是长请求保护打折。
  [x] 待确认：第一次跑 `server.sh` 时看有没有那条「本机 pm2 不接受 --kill-timeout」告警
      —— ✅ 2026-09-23 10:55 生产实跑：**无该告警**，`pm2 start` 直接接受 `--kill-timeout`
      并输出 `Starting ... in fork_mode (1 instance)` / `Done.`。这一项关闭，不必改 ecosystem 文件。

#### 探活端口

默认取 `PORT+1000`（生产 PORT=3006 → 探活用 4006）。被占用时脚本会**立即中止**并告诉你谁占着它
（不能拿别人的进程当自己的探活结果，那会报假绿）。要换端口：

```bash
PREFLIGHT_PORT=4106 bash server.sh
```

#### 诚实披露两个边界

- 探活进程连的是**生产库**。查询都是只读的，但 `AnnouncementService.onModuleInit` 有一段
  「种子公告不存在就插入」的引导写入 —— 生产那行早已存在，等于空转。首次在全新库上跑时它会真插一行。
- 自动回滚只覆盖**部署期**。服务端**运行中**崩溃（非部署触发）PM2 只会重启同一个坏产物，
  不会退回旧版；那条要靠告警 + 人工（已记进 runbook 第八节）。

#### 已验证（本地真库真 HTTP）

```
构建               nest build 通过；boot 零 DI 报错
排空回归           /tmp/verify-graceful-shutdown.js → 12/12 通过
                   （在途请求 494ms 完整 200 / 退出 1407ms / 未被 SIGKILL /
                    日志见「收到 SIGINT 开始排空」+「定时器已停止」/ 排空后拒新连接 ECONNREFUSED）
探活 正例          12 项全过，exit 0（含「探活实例只在回环可见」—— 对着真实内网地址试连，拒接）
绑定回归           不设 LISTEN_HOST → `TCP *:3000`（IPv6 双栈，与改动前一致）
                   设 LISTEN_HOST=127.0.0.1 → `TCP 127.0.0.1:3003`（IPv4 单栈）
探活 负例·缺表     DB_DATABASE=information_schema → 列出 14 张缺表，exit 1
探活 负例·库不存在  DB_DATABASE=no_such_db_xyz → 「进程在就绪前退出 code=1」，exit 1
探活 负例·端口占用  占住 4006 等价位 → 立即中止，exit 1（不产生假绿）
alert_ops          无 key 不外发；有 key 拼出正确 URL + title/desp 两字段（影子 curl 验参数）
verify_live        健康服务 0s 判通过；空端口 31s 判失败（重试预算正确）
server.sh          bash -n 通过
```

部署：`bash server.sh` 即可，无额外人工步骤；第一道闸门前所有失败都发生在碰线上进程之前。

#### ✅ 已执行 2026-09-23 10:55（生产 `~/babytime`）

探活 12/12 全过（含新增的「只在回环可见」检查，对着生产内网地址 `10.0.0.7` 试连确认拒接）；
`pm2 delete → start` 后验收通过；排空回归在**生产机**上实测 **15ms** 干净退出、未被 SIGKILL。
用户自测线上正常。

⚠️ 一个要记下的实情：**本轮没有回滚目标**。日志里 `回滚锚点 pre-deploy → 05d1d4b`
紧跟 `Already up to date` —— 因为先 push 再跑，脚本 pull 时 HEAD 已经是新版，
锚点就落在了正在部署的这个 commit 上（自动回滚等于回滚到同一个版本）。
不修也行：**下一轮部署会自愈**（下次打标签时 HEAD = 当前已知良好的 `05d1d4b`）。
但在这之前如果又要发版，记得先手动确认锚点指向的是良品：

```bash
cd ~/babytime && git rev-parse --short pre-deploy   # 应指向上一个确认良好的 commit
```

生产 `.env` 两项确认（本轮未做，下次顺手跑）：

```bash
cd ~/babytime
grep -n OPS_DISABLE_SCHEDULER .env || echo "✓ 未设（正确）"
grep -n LISTEN_HOST .env || echo "✓ 未设（正确，走 Node 默认双栈监听）"
```

---

### 13. 追加（2026-09-23）：成长数值展示保留两位小数 · 纯小程序端

#### 问题（用户报的）

体重录了 `6.75kg`，统计页「体重」页签里显示成 `6.8kg`。

**根因**：展示层统一用了 `toFixed(1)`（四舍五入到一位小数），而体重列是 `decimal(5,2)`——
库里存的是 6.75，被显示口径吃掉一位。首页宝宝卡、完整明细页、记录页「上次测量」显示的是原始值
（`6.75kg`），所以同一条记录在两个页面数字对不上。

**身高没有这个问题**：身高列是 `decimal(5,1)`（`record.entity.ts`），入库就只有一位小数，
`toFixed(1)` 不丢数据；本次只是顺手去掉了尾零（`68.0` → `68`），与首页口径对齐。

#### 改动（7 个文件，全部在小程序端）

新增 `apps/client/src/utils/format.ts` 的 `formatMeasurement()`：**最多两位小数、去掉末尾多余的 0**。

| 展示点 | 改前 | 改后 |
|---|---|---|
| 统计页英雄卡「最新体重/身高」 | 6.8 | 6.75 |
| 体重仪表盘气泡 | 6.8kg | 6.75kg |
| WHO 曲线最新点气泡 | 6.8kg | 6.75kg |
| WHO 曲线点选读数 | … 6.8kg | … 6.75kg |
| 成长趋势折线气泡（点按某天） | 6.8kg | 6.75kg |
| 趋势图海报（小结文案 + 最新值） | 6.8kg | 6.75kg |

坐标轴刻度、y 轴上下界这类**派生值**仍是一位小数（如 `6.6 ~ 7.2kg`）——不是测量值，不必较真。

#### 部署

**只发小程序，不用跑 `server.sh`**：无 SQL、无环境变量、服务端零改动。

```bash
bash mini.sh <版本号> "成长数值展示保留两位小数"
```

#### 真机回归检查项

- [ ] 记一笔体重 `6.75`（体重 tab → 记体重）→ 统计页「体重」页签：英雄卡数值与仪表盘气泡都应是
      **6.75kg**；下滑 WHO 曲线气泡、趋势折线气泡也应是 6.75kg
- [ ] 在 WHO 曲线上点一下测点 → 读数行应显示「x.x 月龄 · 6.75kg」
- [ ] 在趋势折线上点一下某天 → 气泡应是 6.75kg
- [ ] 体重海报（分享 / 保存）→ 小结文案与右上「最新」应是 6.75kg
- [ ] 身高 tab 回归：记 68.5 显示 68.5；记 68 显示 **68**（改前是 68.0）；WHO 气泡 / 趋势气泡 / 读数三处一致
- [ ] 老数据不回归：只有一位小数的历史记录（如 8.2kg）显示仍是 8.2kg
- [ ] 首页宝宝卡 与 统计页英雄卡 数值一致（这次修的正是这两处不一致）

#### 本地已验证

```
$ node /tmp/verify-format-measurement.mjs      → 9/9 通过
  6.75→"6.75"、6.7→"6.7"、6→"6"、6.05→"6.05"、6.789→"6.79"、68→"68"、68.5→"68.5"、
  (0.1+0.2)→"0.3"；旧口径 (6.75).toFixed(1) = "6.8" 复现了问题根因
$ node /tmp/verify-growth-paint.js             → 6/6 通过（桩 canvas 跑真实 painter 源码）
  体重趋势末点/选中点气泡 6.75kg、身高整数气泡 68cm、WHO 体重气泡 6.75kg、
  WHO 身高气泡 68.5cm；未传 formatValue 的计数海报仍是 500.0ml（证明没误伤别处）
$ pnpm exec tsc --noEmit -p apps/client/tsconfig.json  → 改动文件零报错
  （116 条报错全是本次未触碰文件的存量问题）
$ pnpm run build（apps/client, taro weapp）    → Compiled successfully
```

#### 没动的地方（先记着，避免误会）

14/30 天的喂奶次数 / 奶量 / 尿布次数海报走同一套折线绘制，但**没有传新的格式化函数**，
气泡沿用旧口径 `12.0次` / `500.0ml`。这些是整数计数，不是本次的精度问题，看着别扭可下一轮统一收拾。

