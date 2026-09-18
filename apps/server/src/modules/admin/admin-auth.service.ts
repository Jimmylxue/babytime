import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AdminAuthService {
  // 防爆破：连续失败 5 次锁定 15 分钟（全局计数——本就单管理员账号）。
  // 刻意用进程内存：重启即清零，管理后台单进程场景不值得引入 Redis 或新表。
  private static readonly MAX_FAILS = 5;
  private static readonly LOCK_MS = 15 * 60 * 1000;
  private failCount = 0;
  private lockedUntil = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    if (this.lockedUntil > Date.now()) {
      const minutes = Math.ceil((this.lockedUntil - Date.now()) / 60000);
      throw new UnauthorizedException(`失败次数过多，请 ${minutes} 分钟后重试`);
    }

    const envUsername = this.configService.get<string>('ADMIN_USERNAME', 'admin');
    const envPassword = this.configService.get<string>('ADMIN_PASSWORD');

    if (!envPassword) {
      throw new UnauthorizedException('服务端未配置 ADMIN_PASSWORD，请在 .env 中设置后重启服务');
    }

    if (!this.safeEquals(username, envUsername) || !this.safeEquals(password, envPassword)) {
      this.failCount += 1;
      if (this.failCount >= AdminAuthService.MAX_FAILS) {
        this.lockedUntil = Date.now() + AdminAuthService.LOCK_MS;
        this.failCount = 0;
      }
      throw new UnauthorizedException('账号或密码错误');
    }

    this.failCount = 0;
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
