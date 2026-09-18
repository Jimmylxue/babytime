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

