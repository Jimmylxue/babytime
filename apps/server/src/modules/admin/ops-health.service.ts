import { Injectable, Logger } from '@nestjs/common';
import { connect, TLSSocket } from 'node:tls';

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

  async getHttpsStatus(forceRefresh = false) {
    if (!forceRefresh && this.cache && Date.now() - new Date(this.cache.checkedAt).getTime() < CACHE_TTL_MS) {
      return { ...this.cache, cached: true, domain: this.getDomainStatus() };
    }

    const endpoints = await Promise.all(ENDPOINTS.map((endpoint) => this.probe(endpoint)));
    this.cache = { checkedAt: new Date().toISOString(), endpoints };
    return { ...this.cache, cached: false, domain: this.getDomainStatus() };
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
