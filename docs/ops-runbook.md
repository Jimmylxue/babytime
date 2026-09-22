# 运维手册：部署安全与数据保护

> 更新日期：2026-09-22。背景：线上已有真实用户，数据安全优先级最高。
> 本文是日常运维的速查手册；表结构变更的详细流程见 [db-backup-and-migration.md](db-backup-and-migration.md)，证书与域名见第七节。

---

## 一、现状总览（2026-09-05 基建完成，2026-09-22 补充 HTTPS）

| 风险点 | 之前的状态 | 现在的防线 |
|---|---|---|
| TypeORM 自动同步删列丢数据 | 生产 `synchronize: true`，改实体名即丢列 | 由 `DB_SYNCHRONIZE` 控制，生产默认关闭 |
| 数据库零备份 | 无任何备份机制 | 每日备份 + 部署前快照，各保留 30 份 |
| 部署无检查点 | 直接拉代码重启 | 部署前自动打数据库快照，失败可拦截 |
| 小程序发布即全量 | 提审过直接全量发布 | 微信「分阶段发布」+ 一键版本回退 |
| HTTPS 证书 6 张三个月手工换，10 月内 5 张集中到期 | 腾讯云免费证书手工申请 + 复制私钥粘贴 | 全部自动续签（acme.sh 泛域名 + 又拍云 LE），详见第七节 |
| 域名到期没人盯 | 无提醒机制 | 已续到 2027-10-17；自动续费开关状态待确认 |

## 二、脚本清单与执行规范

| 脚本 | 用途 |
|---|---|
| `server.sh` | 服务端部署（含部署前数据库快照） |
| `mini.sh` | 小程序构建 + 上传微信后台 |
| `backup-db.sh` | 数据库备份（`daily` 例行 / `pre-deploy` 部署快照） |

### ⚠️ 执行规范：一律用 `bash xxx.sh`，不要用 `sh xxx.sh`

- `bash server.sh` / `./server.sh`（有执行权限时）→ 按 shebang 用 bash ✅
- `sh server.sh` → 服务器上 `sh` 指向 dash，shebang 被无视 ❌
- dash 下 `echo -e`（日志格式化）、`read -p`（部署拦截确认）等 bash 写法行为异常，
  可能导致日志乱码甚至**绕过备份失败的确认拦截**。macOS 本机 `sh` 是 bash 兼容模式，测不出来。

## 三、备份体系

### 三层防线

1. **每日例行备份**：cron 每天 04:00 执行 `backup-db.sh daily`，保留 30 天
2. **部署前快照**：`server.sh` 每次部署自动执行 `backup-db.sh pre-deploy`，保留 30 个
3. **异地副本**：每周日从 Mac 拉一份到本地
   ```bash
   scp -r ubuntu@服务器IP:~/babytime/backups ~/Documents/babytime-backups/
   ```

备份文件位置：服务器 `~/babytime/backups/*.sql.gz`（已加入 .gitignore）

### 关键命令速查

```bash
# 手动触发一次例行备份
bash backup-db.sh daily

# 查看备份列表与占用
ls -lh backups/

# 备份日志（cron 的输出也在这里）
cat backups/backup.log

# 【恢复演练】恢复到临时库抽查数据（建议每月一次，不动生产）
mysql -u root -p -e "CREATE DATABASE backup_test"
gunzip < backups/daily-db-xxx.sql.gz | mysql -u root -p backup_test
mysql -u root -p -e "SELECT (SELECT COUNT(*) FROM backup_test.users) AS users, \
  (SELECT COUNT(*) FROM backup_test.records) AS records, \
  (SELECT COUNT(*) FROM backup_test.photos) AS photos;"
mysql -u root -p -e "DROP DATABASE backup_test"

# 【真出事时】恢复生产数据（先停服或确认，覆盖现有表）
gunzip < backups/xxx.sql.gz | mysql -h$DB_HOST -u$DB_USER -p $DB_DATABASE
```

cron 配置（已安装，`crontab -l` 可查）：

```
0 4 * * * cd /home/ubuntu/babytime && bash backup-db.sh daily >> backups/backup.log 2>&1
```

## 四、发布流程（每次更新走一遍）

### 服务端

```bash
bash server.sh
```

确认两点再继续：快照步骤显示成功；`pm2 status` 里服务 online。启动失败查 `pm2 logs baby-time-server`。

### 小程序

1. `bash mini.sh` 上传代码到微信后台
2. 提审 → 通过后用**分阶段发布**（如先 20% 放量）
3. 观察管理端数据 1-2 天（相册指标卡看埋点、Dashboard 看活跃）
4. 无异常 → 全量发布

### 出问题怎么办

| 情况 | 动作 |
|---|---|
| 小程序功能异常 | mp 后台「版本管理」→ **版本回退**到上一版，分钟级生效，无需重新提审 |
| 服务端起不来 | `git checkout <上一个可用提交> && bash server.sh`；数据库随时可用快照回滚 |
| 数据被误删/误改 | 找最近的快照，按第三节恢复命令执行（覆盖前先备份当前状态） |

## 五、表结构变更（生产已关 synchronize）

实体类改动不再自动同步线上表。标准流程（详见 [db-backup-and-migration.md](db-backup-and-migration.md)）：

1. 本地改实体 + 开发（本地 synchronize 默认开启）
2. 手写增量 SQL（**禁止随手 DROP COLUMN / 改字段名**，那是丢数据操作）
3. 服务器：`bash backup-db.sh pre-deploy` → `mysql ... < 变更.sql`
4. 部署代码：`bash server.sh`

排查口诀：线上报 `table doesn't exist` = 加了实体忘了建表；本地正常线上报错先想表结构差异。

已执行记录：
- 2026-09-07 新增 `admin_audit_logs`（后台按宝宝查看照片的审计日志），SQL 见 [admin-audit-logs.sql](admin-audit-logs.sql)，部署前先建表再发版。
- 2026-09-12 新增 `family_member_aliases`（家庭成员备注名/昵称），SQL 见 [family-member-nickname.sql](family-member-nickname.sql)，
  纯新增表、旧代码不会读它，所以**可以先建表再发版**，中间无空窗期；回滚只需撤销代码，新表可保留。

## 六、维护节奏

| 频率 | 动作 |
|---|---|
| 每次部署 | `bash server.sh`（快照自动）+ 发布检查单 |
| 每天（自动） | 凌晨 4 点 cron 备份，偶尔瞄一眼 `backups/backup.log` |
| 每周日（手动） | Mac 拉异地副本（scp 命令见上） |
| 每月 | 恢复演练一次（临时库抽查）；`du -sh backups/` 看磁盘占用 |
| 每个版本 | 管理端看疫苗漏斗 + 相册指标卡，确认埋点在涨 |
| 每季度（全自动） | HTTPS 证书续签不需要动手，但要确认续签真的发生了，见第七节 |

## 七、证书与域名（HTTPS）

> 2026-09-22 起全部 HTTPS 端点（7 个域名）自动续签，日常不需要人工换证。
> 本节是**重装机器、排查访问故障时**的依据。自动化的对立面是静默失败，所以"不用动手"不等于"不用看"。

### 台账

| 域名 | 用途 | TLS 终止于 | 证书来源 | 当前到期 |
|---|---|---|---|---|
| `baby-cheese.jimmyxuexue.top` | 小程序 API + 管理后台 | 服务器 nginx | acme.sh 泛域名（Let's Encrypt） | 2026-12-20，下次自动续签 2026-11-19 |
| `babybt` / `bt2` / `movie` / `qbdownload` | 同机其他站点 | 服务器 nginx | 同上，共用同一张泛域名证书 | 同上 |
| `babyimg.jimmyxuexue.top` | 照片 + 装饰图 | 又拍云 | 又拍云 Let's Encrypt DV，自动续签 | 2026-12-20 |
| `image.jimmyxuexue.top` | 历史图片域名 | 又拍云 | 又拍云 Let's Encrypt DV，自动续签 | 2026-10-27 |
| `jimmyxuexue.top` | 主域，注册在腾讯云，DNS 在 DNSPod | — | — | **注册到期 2027-10-17** |

⚠️ **判断 TLS 终止在哪一侧，要看响应头，别只看 CNAME。** `babyimg` 的 CNAME 指向 `baby-time.b0.aicdn.com`（看着像腾讯云 CDN），但实际响应头是 `server: marco/3.2` + `x-upyun-*` + `x-source: U/200`，服务方是**又拍云**——又拍云的融合 CDN 会把流量调度到第三方节点。腾讯云 CDN 控制台里域名数为 0 是正常的，不要在那里添加域名。

```bash
curl -sSI https://babyimg.jimmyxuexue.top/baby-time/assets/app-logo.png | grep -iE "^server|^x-upyun|^x-source"
```

### 服务器侧 acme.sh

一张 `jimmyxuexue.top` + `*.jimmyxuexue.top` 泛域名证书覆盖全部 5 个 nginx 站点：

- 安装位置 `/opt/acme.sh`，CA 固定 `letsencrypt`，RSA 2048（不用 ECDSA，CDN 与老设备兼容性最稳）
- 签发用 `--dns dns_tencent`（DNSPod 新版 API），凭据是 `/opt/acme.sh/account.conf`（600 权限）里的 `Tencent_SecretId` / `Tencent_SecretKey`，对应一个只有 `QcloudDNSPodFullAccess` 的 CAM 子账号——**不要用主账号密钥**
- 部署链路：`--install-cert` 写 `/etc/nginx/wildcard/{privkey.pem,fullchain.pem}` → `--reloadcmd` 调 `/usr/local/bin/deploy-wildcard-cert.sh` → 复制到 5 个站点的 `/www/server/nginx/cert/<sub>/<sub>.jimmyxuexue.top_bundle.crt` 与 `.key` → `nginx -t && nginx -s reload`
- **nginx 配置一行都没改**，证书路径沿用宝塔原来的路径，所以宝塔里看到的站点配置依然是对的
- 续签由 root crontab 驱动（`*/8 * * * *`），剩余不足 30 天时自动续

三条铁律：

1. **不要用 `sudo` 跑 acme.sh。** 它检测到 `SUDO_USER` 会直接退出（`It seems that you are using sudo…`），而 `--install` 不检查这一条，所以会出现"安装成功、后续命令全部静默不执行"的假象。正确姿势：`sudo -i` 进真正的 root shell。
2. **宝塔面板的「网站 → SSL → Let's Encrypt」不要点。** 它写的是同一批路径，会和 acme.sh 抢文件，表现为证书时好时坏。
3. **同一个域名只保留一份 `--install-cert` 配置**（后一次会覆盖前一次）。5 个站点的分发逻辑全在部署脚本的 `for sub in ...` 列表里，新增站点改那里，不要重复注册 install-cert。

常用命令：

```bash
sudo -i
/opt/acme.sh/acme.sh --list --home /opt/acme.sh                                # 证书清单与下次续签时间
/opt/acme.sh/acme.sh --renew -d jimmyxuexue.top --home /opt/acme.sh --force     # 手动强制续签（会立刻重新部署 5 个站点）
tail -50 /opt/acme.sh/acme.sh.log                                              # 续签日志
```

新增一个 https 子域时：在宝塔正常建站（它会生成引用 `cert/<新站>/..._bundle.crt` 的 vhost），然后把子域名加进 `/usr/local/bin/deploy-wildcard-cert.sh` 的 `for sub in ...`，跑一次脚本即可——泛域名本来就覆盖它，**不需要重新签发**。

### 验证（每次动完证书必做）

```bash
for d in baby-cheese babybt bt2 movie qbdownload; do h="$d.jimmyxuexue.top"
  echo | openssl s_client -servername $h -connect $h:443 2>/dev/null | openssl x509 -noout -issuer -enddate
  echo | openssl s_client -servername $h -connect $h:443 -showcerts 2>/dev/null | grep -c "^ [0-9] s:"   # 必须是 3
done
```

**证书链必须 3 张（fullchain，含中间证书）。** 链不完整时 Chrome 和 iOS 往往照常绿锁，**安卓微信直接报 SSL 错误**——这是换证书最典型的翻车方式。所以除了上面的探活，还要拿安卓真机在微信里把小程序过一遍（2026-09-22 已验证通过）。

### 回退

换证前的完整备份在 `/www/server/nginx/cert.bak-2026-09-21`：

```bash
sudo cp -a /www/server/nginx/cert.bak-2026-09-21/. /www/server/nginx/cert/ && sudo nginx -t && sudo nginx -s reload
```

### 本节待办

- [ ] 确认腾讯云域名「自动续费」开关是否真的打开（当前到期 2027-10-17，靠手动续的一年）
- [x] ~~巡检看板~~ 后台「运维看板」页已上线（2026-09-22）：服务端当场探这 7 个端点的真实证书剩余天数与可信状态，`GET admin/ops/https`
- [x] **主动推送告警已接 PushPlus**（2026-09-22）：crontab 每天 09:30 打 `POST admin/ops/alert-check`，
      命中「握手失败 / 链异常（每 24 小时）」「证书剩 < 14 天」「域名剩 < 45 天」（后两者每 6 天）才推微信，正常静默。
      配置与 cron 行见发版清单第 8 节。排查它有没有在跑：`cat /home/ubuntu/ops-alert.log`
- [ ] 告警目前只覆盖 HTTPS 与域名；**备份是否成功、磁盘是否快满、服务是否活着，都还没有任何提醒**，是下一步该补的同类项
- [ ] 把 5 个 vhost 配置（`/www/server/panel/vhost/nginx/*.conf`）拉一份进本仓库 `deploy/nginx/`，目前只存在于服务器
- [ ] 又拍云证书管理里 4 张已失效证书可清理（`1d7d1e…` 11-10 到期那张已解绑，加三条 2025~2026-08 已过期的）

## 八、已知残留事项

- 异地副本目前靠手动 scp，未自动化
- 服务端启动失败自动回滚上一版本（health check）暂未做，手动 `git checkout` 兜底
- 客户端错误上报（App.onError → 后台查看）未实现
