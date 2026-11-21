import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../../modules/user/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
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

  /**
   * 校验 token 的同时确认用户仍然存在。
   *
   * 之前只验签不查库：用户注销（或本地库被重建/恢复）后，旧 token 仍能通过，
   * GET 宝宝返回空数组、POST 建宝宝撞 users 外键 500，前端会卡在「没有数据 +
   * 建不上宝宝」。这里直接抛 401，让客户端走已有的静默续期/重新登录链路。
   */
  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      select: ['id', 'openId'],
    });
    if (!user) {
      throw new UnauthorizedException('登录状态已失效，请重新登录');
    }

    return { id: user.id, openId: user.openId };
  }
}