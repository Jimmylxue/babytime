import { Injectable, UnauthorizedException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { User } from './entities/user.entity';
import { UserEvent } from './entities/user-event.entity';
import { LoginDto, UpdateUserDto } from './dto/login.dto';
import { ContentSecurityService } from '../content-security/content-security.service';
import { CdnCleanupService } from '../upload/cdn-cleanup.service';

/** users.last_seen_at 的最小写入间隔，见 trackEvent */
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private httpService: HttpService,
    @InjectRepository(UserEvent)
    private eventRepository: Repository<UserEvent>,
    private contentSecurity: ContentSecurityService,
    private cleanup: CdnCleanupService,
  ) {}

  async login(loginDto: LoginDto) {
    const { code } = loginDto;
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    // 缺凭据时以前会退回「任意 code 都能登成一个新用户」的模拟登录：生产 .env 少配一行，
    // 就从"功能坏掉"升级成"大门敞开"。现在一律拒绝，与 JWT_SECRET 的 fail-fast 同一口径。
    if (!appId || !appSecret) {
      this.logger.error('WECHAT_APP_ID / WECHAT_APP_SECRET 未配置，已拒绝登录请求');
      throw new ServiceUnavailableException('登录暂不可用：服务端缺少微信小程序配置');
    }

    const wxResult = await this.getWxOpenId(code);
    const openid: string = wxResult.openid;
    const unionid: string = wxResult.unionid;

    if (!openid) {
      throw new UnauthorizedException('微信登录失败');
    }

    // 查找或创建用户
    let user = await this.userRepository.findOne({ where: { openId: openid } });

    if (!user) {
      user = this.userRepository.create({
        openId: openid,
        unionId: unionid,
        nickname: '微信用户',
        // 归因：只在创建时写一次，取不到或不在白名单就留空
        acquisitionSource: this.normalizeAcquisitionSource(loginDto.source),
      });
      user = await this.userRepository.save(user);
    }

    // 生成 JWT
    const payload = { sub: user.id, openId: user.openId };
    const token = this.jwtService.sign(payload);

    await this.eventRepository.save(this.eventRepository.create({ userId: user.id, name: 'login' }));

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    };
  }

  /**
   * 归因来源白名单。必须与海报二维码的场景值一一对应
   * （见 NotificationService 的 POSTER_QR_SCENES），不认识的一律丢弃，
   * 避免客户端随意传字符串污染统计口径。
   */
  private normalizeAcquisitionSource(source?: string): string | null {
    const allowed = new Set(['album', 'daily', 'chart', 'family', 'milestone']);
    const value = (source || '').trim().toLowerCase();
    return allowed.has(value) ? value : null;
  }

  private async getWxOpenId(code: string) {
    // secret 走 params 而不是拼进 URL：axios 的错误对象带 error.config.url，
    // 一旦网络抖动，把整个 error 记进日志就等于把 appsecret 写进 pm2 日志。
    try {
      const response = await firstValueFrom(
        this.httpService.get('https://api.weixin.qq.com/sns/jscode2session', {
          params: {
            appid: process.env.WECHAT_APP_ID,
            secret: process.env.WECHAT_APP_SECRET,
            js_code: code,
            grant_type: 'authorization_code',
          },
        }),
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(`调用微信接口失败：${error?.message ?? '未知错误'}`);
      throw new UnauthorizedException('调用微信接口失败');
    }
  }

  async findById(id: string) {
    return this.userRepository.findOne({
      where: { id },
      relations: ['babies'],
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.contentSecurity.checkUserTexts(id, [updateUserDto.nickname, updateUserDto.role], 1);
    // 换掉之后旧头像就没人引用了，先存下来供清理
    const previousAvatar = (
      await this.userRepository.findOne({ where: { id }, select: ['avatar'] })
    )?.avatar;
    await this.userRepository.update(id, updateUserDto);
    const user = await this.findById(id);
    if (user?.avatar !== previousAvatar) this.cleanup.scheduleDelete([previousAvatar]);
    return user;
  }

  async trackEvent(userId: string, name: string, properties?: Record<string, any>) {
    const event = this.eventRepository.create({ userId, name, properties });
    await this.eventRepository.save(event);
    // 首页每次 onShow 都打一个 app_open，逐次 UPDATE users 会把这张表变成高频写热点
    // （行锁 + binlog 膨胀），而 last_seen_at 的用途只是「最近活跃」，5 分钟粒度完全够。
    // 条件写在 WHERE 里而不是先 SELECT 一次：不满足时 0 行受影响，不产生行写入。
    const staleBefore = new Date(Date.now() - LAST_SEEN_THROTTLE_MS);
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ lastSeenAt: new Date() })
      .where('id = :id AND (last_seen_at IS NULL OR last_seen_at < :staleBefore)', {
        id: userId,
        staleBefore,
      })
      .execute();
    return { success: true };
  }
}
