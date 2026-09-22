import { Injectable, Logger } from '@nestjs/common';
import { connect, TLSSocket } from 'node:tls';
import axios from 'axios';

interface Endpoint {
  host: string;
  purpose: string;
  /** 证书由谁签发与续签——决定故障时该去哪个控制台 */
  managedBy: string;
}

/**
 * 逐个探线上真实握手，而不是读配置文件里声称的状态：
 * 这 6 个端点由三套不同的自动续签机制维护（acme.sh cron / 又拍云 / 腾讯云注册），
 * 任何一套静默失败都只有从外部探测才能发现。
 */
const ENDPOINTS: Endpoint[] = [
  {
    host: 'baby-cheese.jimmyxuexue.top',
    purpose: '小程序 API + 管理后台',
    managedBy: '服务器 nginx · acme.sh 泛域名',
  },
  { host: 'babybt.jimmyxuexue.top', purpose: '同机站点', managedBy: '服务器 nginx · acme.sh 泛域名' },
  { host: 'bt2.jimmyxuexue.top', purpose: '同机站点', managedBy: '服务器 nginx · acme.sh 泛域名' },
  { host: 'movie.jimmyxuexue.top', purpose: '同机站点', managedBy: '服务器 nginx · acme.sh 泛域名' },
  { host: 'qbdownload.jimmyxuexue.top', purpose: '同机站点', managedBy: '服务器 nginx · acme.sh 泛域名' },
  { host: 'babyimg.jimmyxuexue.top', purpose: '照片 + 装饰图', managedBy: '又拍云 · 原生自动续签' },
  { host: 'image.jimmyxuexue.top', purpose: '历史图片域名', managedBy: '又拍云 · 原生自动续签' },
];

const CACHE_TTL_MS = 5 * 60 * 1000;
const HANDSHAKE_TIMEOUT_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 与后台看板同阈值：两套自动续签都应在剩 30 天前完成，14 天内基本可断定它没干活 */
const CERT_DANGER_DAYS = 14;
/** 域名提前更多：续费之外还有备案核查周期，来不及会全站挂 */
const DOMAIN_DANGER_DAYS = 45;
/** 同一原因的重复推送间隔：故障每天敲一次，预警六天敲一次（cron 每天跑，不去重会刷屏） */
const FAULT_REPEAT_MS = DAY_MS;
const WARN_REPEAT_MS = 6 * DAY_MS;

export interface EndpointStatus {
  host: string;
  purpose: string;
  managedBy: string;
  reachable: boolean;
  /** 链不完整 / 自签 / 已过期时为 false，具体原因见 authorizationError */
  trusted: boolean;
  issuer: string;
  validTo: string;
  daysLeft: number | null;
  latencyMs: number | null;
  error: string | null;
}

@Injectable()
export class OpsHealthService {
  private readonly logger = new Logger(OpsHealthService.name);
  private cache: { checkedAt: string; endpoints: EndpointStatus[] } | null = null;
  private readonly lastAlertAt = new Map<string, number>();

  async getHttpsStatus(forceRefresh = false) {
    if (!forceRefresh && this.cache && Date.now() - new Date(this.cache.checkedAt).getTime() < CACHE_TTL_MS) {
      return { ...this.cache, cached: true, domain: this.getDomainStatus() };
    }

    const endpoints = await Promise.all(ENDPOINTS.map((endpoint) => this.probe(endpoint)));
    this.cache = { checkedAt: new Date().toISOString(), endpoints };
    return { ...this.cache, cached: false, domain: this.getDomainStatus() };
  }

  /**
   * 每天由 crontab 打一次：探一遍线上真实证书，只有异常时才推微信。
   * 去重记录在内存里，pm2 重启后会重置——最坏结果是重启当天多推一条，可接受。
   */
  async runAlertCheck() {
    const { checkedAt, endpoints, domain } = await this.getHttpsStatus(true);
    const now = Date.now();
    const findings: { key: string; text: string; fault: boolean }[] = [];

    for (const item of endpoints) {
      if (!item.reachable) {
        findings.push({ key: `${item.host}:down`, text: `${item.host} 握手失败：${item.error || '未知原因'}`, fault: true });
      } else if (!item.trusted) {
        findings.push({ key: `${item.host}:chain`, text: `${item.host} 证书链未被信任：${item.error || '未知'}`, fault: true });
      } else if (item.daysLeft !== null && item.daysLeft < CERT_DANGER_DAYS) {
        findings.push({
          key: `${item.host}:exp`,
          text: `${item.host} 证书只剩 ${item.daysLeft} 天（${item.managedBy} 的自动续签可能没干活）`,
          fault: false,
        });
      }
    }
    if (domain.daysLeft !== null && domain.daysLeft < DOMAIN_DANGER_DAYS) {
      findings.push({
        key: 'domain:exp',
        text: `域名 ${domain.name} ${domain.expiresAt ? domain.expiresAt.slice(0, 10) : '?'} 注册到期，只剩 ${domain.daysLeft} 天`,
        fault: false,
      });
    }

    const due = findings.filter(
      (finding) => now - (this.lastAlertAt.get(finding.key) ?? 0) > (finding.fault ? FAULT_REPEAT_MS : WARN_REPEAT_MS),
    );
    if (!due.length) return { checkedAt, findings, pushed: false, attempted: 0 };

    const token = process.env.PUSHPLUS_TOKEN;
    if (!token) {
      this.logger.warn(`有 ${due.length} 项运维告警待推送，但 PUSHPLUS_TOKEN 未配置`);
      return { checkedAt, findings, pushed: false, attempted: due.length, error: 'PUSHPLUS_TOKEN 未配置' };
    }

    const content = [
      ...due.map((finding) => `· ${finding.text}`),
      '',
      `探测时间：${new Date(checkedAt).toLocaleString('zh-CN')}`,
    ].join('\n');

    try {
      const res = await axios.post(
        'https://www.pushplus.plus/send',
        { token, title: `育娃手记运维告警 · ${due.length} 项`, content, template: 'txt' },
        { timeout: 8000 },
      );
      const ok = res.data?.code === 200;
      if (ok) due.forEach((finding) => this.lastAlertAt.set(finding.key, now));
      else this.logger.warn(`PushPlus 返回异常：${JSON.stringify(res.data)}`);
      return { checkedAt, findings, attempted: due.length, pushed: ok, response: res.data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`PushPlus 推送失败：${message}`);
      return { checkedAt, findings, attempted: due.length, pushed: false, error: message };
    }
  }

  /** 域名注册到期日拿不到公开接口，写在 .env 里，续费后改一次 */
  private getDomainStatus() {
    const raw = process.env.OPS_DOMAIN_EXPIRY;
    if (!raw) return { name: 'jimmyxuexue.top', expiresAt: null, daysLeft: null };

    const expiresAt = new Date(raw.includes('T') ? raw : `${raw}T00:00:00+08:00`);
    if (Number.isNaN(expiresAt.getTime())) {
      this.logger.warn(`OPS_DOMAIN_EXPIRY 无法解析：${raw}`);
      return { name: 'jimmyxuexue.top', expiresAt: null, daysLeft: null };
    }
    return {
      name: 'jimmyxuexue.top',
      expiresAt: expiresAt.toISOString(),
      daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / DAY_MS),
    };
  }

  private probe(endpoint: Endpoint): Promise<EndpointStatus> {
    const base: EndpointStatus = {
      host: endpoint.host,
      purpose: endpoint.purpose,
      managedBy: endpoint.managedBy,
      reachable: false,
      trusted: false,
      issuer: '',
      validTo: '',
      daysLeft: null,
      latencyMs: null,
      error: null,
    };

    return new Promise((resolve) => {
      const startedAt = Date.now();
      // 故意不校验证书：过期或链不全时也要把证书细节读出来给自己看，
      // 校验结果另取 socket.authorized / authorizationError 作为可信度信号。
      const socket: TLSSocket = connect({
        host: endpoint.host,
        port: 443,
        servername: endpoint.host,
        timeout: HANDSHAKE_TIMEOUT_MS,
        rejectUnauthorized: false,
      });

      socket.once('secureConnect', () => {
        const latencyMs = Date.now() - startedAt;
        const cert = socket.getPeerX509Certificate();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError ?? null;
        socket.destroy();

        if (!cert) {
          resolve({ ...base, reachable: true, latencyMs, error: '握手成功但拿不到对端证书' });
          return;
        }

        const validUntil = new Date(cert.validTo).getTime();
        resolve({
          ...base,
          reachable: true,
          trusted: authorized,
          issuer: cert.issuer,
          validTo: Number.isNaN(validUntil) ? cert.validTo : new Date(validUntil).toISOString(),
          daysLeft: Number.isNaN(validUntil) ? null : Math.floor((validUntil - Date.now()) / DAY_MS),
          latencyMs,
          error: authorized ? null : String(authorizationError || '证书未被信任'),
        });
      });

      socket.once('timeout', () => {
        socket.destroy();
        resolve({ ...base, error: `握手超时（${HANDSHAKE_TIMEOUT_MS}ms）` });
      });

      socket.once('error', (err: Error) => {
        socket.destroy();
        resolve({ ...base, error: err.message });
      });
    });
  }
}
