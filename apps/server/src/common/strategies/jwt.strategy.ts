import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // 不给兜底默认值：JWT_SECRET 缺失时启动即失败，避免用写死的密钥签发/校验 token
      secretOrKey: configService.getOrThrow<string>(
        'JWT_SECRET',
        'JWT_SECRET 未配置（应写在仓库根目录 .env），拒绝以默认密钥启动',
      ),
    });
  }

  async validate(payload: any) {
    return { id: payload.sub, openId: payload.openId };
  }
}
