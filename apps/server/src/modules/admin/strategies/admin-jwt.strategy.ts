import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

// 管理后台使用独立的 JWT 密钥，与小程序用户 token 完全隔离。
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('ADMIN_JWT_SECRET', 'baby-time-admin-secret'),
    });
  }

  validate(payload: any) {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('无权访问管理后台');
    }
    return { username: payload.username };
  }
}
