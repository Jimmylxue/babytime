import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const envUsername = this.configService.get<string>('ADMIN_USERNAME', 'admin');
    const envPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!envPassword) {
      throw new UnauthorizedException('服务端未配置 ADMIN_PASSWORD，请在 .env 中设置后重启服务');
    }

    if (!this.safeEquals(username, envUsername) || !this.safeEquals(password, envPassword)) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const accessToken = this.jwtService.sign({ type: 'admin', username });
    return { accessToken, username };
  }

  // 常量时间比较，避免通过响应时长探测账号密码。
  private safeEquals(a: string, b: string) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // 长度不同也需要消耗相近的时间，先做一次等长比较。
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
