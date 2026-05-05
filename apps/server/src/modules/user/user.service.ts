import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { User } from './entities/user.entity';
import { LoginDto, UpdateUserDto } from './dto/login.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private httpService: HttpService,
  ) {}

  async login(loginDto: LoginDto) {
    const { code } = loginDto;
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    let openid: string;
    let unionid: string;

    // 开发环境：如果没有配置微信 appId，使用模拟登录
    if (!appId || !appSecret) {
      this.logger.warn('微信 appId/secret 未配置，使用模拟登录');
      // 用 code 生成一个固定的 openId（开发环境）
      openid = `dev_openid_${code}`;
      unionid = `dev_unionid_${code}`;
    } else {
      // 生产环境：调用微信接口获取 openId
      const wxResult = await this.getWxOpenId(code);
      openid = wxResult.openid;
      unionid = wxResult.unionid;

      if (!openid) {
        throw new UnauthorizedException('微信登录失败');
      }
    }

    // 查找或创建用户
    let user = await this.userRepository.findOne({ where: { openId: openid } });

    if (!user) {
      user = this.userRepository.create({
        openId: openid,
        unionId: unionid,
        nickname: '微信用户',
      });
      user = await this.userRepository.save(user);
    }

    // 生成 JWT
    const payload = { sub: user.id, openId: user.openId };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
      },
    };
  }

  private async getWxOpenId(code: string) {
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      return response.data;
    } catch (error) {
      this.logger.error('调用微信接口失败', error);
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
    await this.userRepository.update(id, updateUserDto);
    return this.findById(id);
  }
}
