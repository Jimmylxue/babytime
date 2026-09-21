import { BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { SubscriptionGrant } from '../user/entities/subscription-grant.entity';
import { WechatTokenService } from '../../common/wechat/wechat-token.service';

/**
 * 微信订阅消息 API 层：消息发送、海报小程序码、43101 对账。
 * access_token 统一走 WechatTokenService（全项目单一取证书）。
 * 业务编排在 VaccinePlanService / VaccineReminderService，这里不放业务逻辑。
 */
@Injectable()
export class WechatSubscribeService {
  /** 允许生成二维码的场景值；必须与 user.service 的来源白名单一一对应 */
  private static readonly POSTER_QR_SCENES = new Set(['album', 'daily', 'chart', 'family', 'milestone']);
  /** 码永久有效，同一「场景+版本」进程内只生成一次，省微信接口配额 */
  private posterQrCache = new Map<string, string>();

  constructor(
    private readonly http: HttpService,
    private readonly tokenService: WechatTokenService,
    @InjectRepository(SubscriptionGrant) private readonly grants: Repository<SubscriptionGrant>,
  ) {}

  getAccessToken(): Promise<string | null> {
    return this.tokenService.getAccessToken();
  }

  /** 发送订阅消息，原样返回微信响应体（errcode 处理留在业务层，两处语义不同） */
  async postSubscribe(token: string, body: Record<string, unknown>) {
    const result = await firstValueFrom(this.http.post(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`, body));
    return result.data || {};
  }

  // 微信 43101：用户拒收或无剩余次数（两者共用该错误码），微信侧票据已不可用
  isWechatRefused(errorText: string) {
    return typeof errorText === 'string' && errorText.startsWith('43101');
  }

  // 43101 对账：微信侧额度已作废，本地清零对齐，等用户重新授权后再入账
  async invalidateWechatGrant(grantId: string) {
    await this.grants.createQueryBuilder().update(SubscriptionGrant)
      .set({ availableCount: 0, status: 'consumed' })
      .where('id = :id', { id: grantId }).execute();
  }

  // ── 海报二维码（带场景值，用于获客归因）──

  async getPosterQrCode(scene: string, envVersion = 'release'): Promise<string> {
    const key = `${scene}:${envVersion}`;
    const cached = this.posterQrCache.get(key);
    if (cached) return cached;

    if (!WechatSubscribeService.POSTER_QR_SCENES.has(scene)) {
      throw new BadRequestException(`不支持的场景值: ${scene}`);
    }
    const env = new Set(['release', 'trial', 'develop']).has(envVersion) ? envVersion : 'release';
    const token = await this.getAccessToken();
    if (!token) throw new BadRequestException('微信 access_token 未配置（缺少 WECHAT_APP_ID/SECRET）');

    // ⚠️ 实测（2026-09-18，本账号）可用的是 /wxa/getwxacodeunlimit；
    // 文档上的 /wxacode/getUnlimited 实际返回 404。返回的是 **JPEG** 二进制，出错时才是 JSON。
    const response = await firstValueFrom(this.http.post(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`,
      {
        scene: `src=${scene}`,
        page: 'pages/index/index',
        width: 430,
        check_path: false,
        env_version: env,
      },
      { responseType: 'arraybuffer' },
    ));
    const buffer: Buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
    // PNG: 89 50 4E 47；JPEG: FF D8 FF
    const isImage =
      (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) ||
      (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8);
    if (!isImage) {
      let message = '生成小程序码失败';
      try {
        const err = JSON.parse(buffer.toString('utf8'));
        if (err?.errmsg) message = `生成小程序码失败: ${err.errmsg}`;
      } catch { /* 非 JSON，保持默认信息 */ }
      throw new BadRequestException(message);
    }

    const base64 = buffer.toString('base64');
    this.posterQrCache.set(key, base64);
    return base64;
  }
}
