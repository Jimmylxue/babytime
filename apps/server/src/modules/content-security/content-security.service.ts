import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { User } from '../user/entities/user.entity';
import { WechatTokenService } from '../../common/wechat/wechat-token.service';

const MSG_SEC_CHECK_URL = 'https://api.weixin.qq.com/wxa/msg_sec_check';
const IMG_SEC_CHECK_URL = 'https://api.weixin.qq.com/wxa/img_sec_check';
// 图片检测接口的硬上限：超过只能跳过（微信侧直接报 41005 输入尺寸不符）
const IMG_CHECK_MAX_BYTES = 1024 * 1024;

@Injectable()
export class ContentSecurityService {
  private readonly logger = new Logger(ContentSecurityService.name);

  constructor(
    private readonly http: HttpService,
    private readonly tokenService: WechatTokenService,
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

  /**
   * 图片内容安全：上传落盘前送 wxa/img_sec_check（同步 multipart，≤1MB）。
   *
   * 文本此前已全覆盖，图片一张没审 —— 相册、头像、里程碑配图都是用户可传、
   * CDN 可公开访问的对象，是小程序被要求整改最常见的入口。
   * 与文本同一语义：接口不可用/超时只记日志并放行，不阻断正常记录。
   * 注意该接口是 1.0：若线上日志出现非 0 的 errcode（接口停用/未开通），
   * 就得换 wxa/media_check_async —— 那个是异步的，要在小程序后台配消息接收服务器。
   */
  async checkImage(buffer: Buffer, filename: string) {
    if (buffer.length > IMG_CHECK_MAX_BYTES) {
      this.logger.log(`图片 ${buffer.length} 字节超过 1MB 检测上限，本次按放行处理`);
      return;
    }
    try {
      const token = await this.tokenService.getAccessToken();
      if (!token) return;
      const form = new FormData();
      form.append('media', new Blob([new Uint8Array(buffer)]), filename);
      const response = await firstValueFrom(
        this.http.post(`${IMG_SEC_CHECK_URL}?access_token=${token}`, form, { timeout: 8000 }),
      );
      const data = response.data || {};
      if (data.errcode === 87014) {
        throw new BadRequestException('图片包含违规内容，请换一张');
      }
      if (data.errcode) {
        this.logger.warn(`imgSecCheck errcode=${data.errcode} ${data.errmsg}，本次按放行处理`);
        return;
      }
      this.logger.log(`imgSecCheck 通过（${filename}, ${buffer.length} 字节）`);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`imgSecCheck 调用失败：${(error as Error)?.message}，本次按放行处理`);
    }
  }

  private async isRisky(content: string, openid: string, scene: 1 | 2): Promise<boolean> {
    try {
      // 统一从 WechatTokenService 取凭证；领取失败抛错进本 catch，维持「检测故障不阻断记录」的放行语义
      const token = await this.tokenService.getAccessToken();
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
}
