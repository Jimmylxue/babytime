import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { User } from '../user/entities/user.entity';

const MSG_SEC_CHECK_URL = 'https://api.weixin.qq.com/wxa/msg_sec_check';
const TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';

@Injectable()
export class ContentSecurityService {
  private readonly logger = new Logger(ContentSecurityService.name);
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly http: HttpService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  // 对用户提交的 UGC 文本做微信内容安全检测，违规抛 400。
  // 微信接口异常/未配置时放行并记日志：内容安全检测的故障不应阻断正常记录。
  async checkUserTexts(userId: string, texts: (string | undefined | null)[], scene: 1 | 2 = 2) {
    const contents = Array.from(new Set(texts.filter((text): text is string => !!text?.trim())));
    if (contents.length === 0) return;

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'openId'],
    });
    // msg_sec_check v2 要求内容作者的 openid，取不到时不阻断主流程
    if (!user?.openId) return;

    for (const content of contents) {
      if (await this.isRisky(content, user.openId, scene)) {
        throw new BadRequestException('内容包含违规文字，请修改后重试');
      }
    }
  }

  private async isRisky(content: string, openid: string, scene: 1 | 2): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      if (!token) return false;
      const response = await firstValueFrom(
        this.http.post(
          `${MSG_SEC_CHECK_URL}?access_token=${token}`,
          { openid, scene, version: 2, content },
          { timeout: 5000 },
        ),
      );
      const data = response.data || {};
      if (data.errcode === 87014) return true;
      if (data.errcode) {
        this.logger.warn(`msgSecCheck errcode=${data.errcode} ${data.errmsg}，本次按放行处理`);
        return false;
      }
      // risky=明确违规；review=建议人工复核——个人主体无人复核，一律拦截更稳妥
      const suggest = data.result?.suggest;
      return suggest === 'risky' || suggest === 'review';
    } catch (error: any) {
      this.logger.warn(`msgSecCheck 调用失败：${error?.message}，本次按放行处理`);
      return false;
    }
  }

  private async getAccessToken() {
    const appid = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appid || !secret) return null;
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const response = await firstValueFrom(
      this.http.get(TOKEN_URL, { params: { grant_type: 'client_credential', appid, secret } }),
    );
    if (!response.data?.access_token) {
      this.logger.warn(`微信 access_token 获取失败: ${JSON.stringify(response.data)}，内容检测按放行处理`);
      return null;
    }
    this.accessToken = {
      value: response.data.access_token,
      expiresAt: Date.now() + Number(response.data.expires_in || 7200) * 1000,
    };
    return this.accessToken.value;
  }
}
