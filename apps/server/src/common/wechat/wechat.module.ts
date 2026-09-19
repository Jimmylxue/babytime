import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WechatTokenService } from './wechat-token.service';

/** 全局微信凭据模块：内容安全、订阅消息、小程序码共用一张 access_token */
@Global()
@Module({
  imports: [HttpModule],
  providers: [WechatTokenService],
  exports: [WechatTokenService],
})
export class WechatModule {}
