import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';

/**
 * 微信 access_token 的唯一获取/缓存点。
 * 同一 appid 多处各自领证会双倍消耗每日配额，且按微信规则新证可能作废旧证
 * （表现为偶发 40001 invalid credential）——所有模块都必须从这里取。
 */
@Injectable()
export class WechatTokenService {
  private readonly logger = new Logger(WechatTokenService.name);
  private cached: { value: string; expiresAt: number } | null = null;
  /** 单飞：并发同时过期时只领一次 */
  private inflight: Promise<string | null> | null = null;

  constructor(private readonly http: HttpService) {}

  /** 未配置 appid/secret 返回 null；已配置但领取失败抛错（由调用方决定放行或失败） */
  async getAccessToken(): Promise<string | null> {
    const appid = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appid || !secret) return null;
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) return this.cached.value;
    if (this.inflight) return this.inflight;

    this.inflight = this.fetch(appid, secret).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetch(appid: string, secret: string): Promise<string | null> {
    const response = await firstValueFrom(
      this.http.get(TOKEN_URL, { params: { grant_type: 'client_credential', appid, secret } }),
    );
    if (!response.data?.access_token) {
      throw new Error(`微信 access_token 获取失败: ${JSON.stringify(response.data)}`);
    }
    this.cached = {
      value: response.data.access_token,
      expiresAt: Date.now() + Number(response.data.expires_in || 7200) * 1000,
    };
    this.logger.log('微信 access_token 已刷新');
    return this.cached.value;
  }
}
