import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WechatTokenService } from './wechat-token.service';
import { RateLimitService } from '../rate-limit.service';

/** 全局微信凭据 + 全局限流：内容安全、订阅消息、小程序码、各按人配额共用 */
@Global()
@Module({
  imports: [HttpModule],
  providers: [WechatTokenService, RateLimitService],
  exports: [WechatTokenService, RateLimitService],
})
export class WechatModule {}
