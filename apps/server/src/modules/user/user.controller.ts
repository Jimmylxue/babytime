import { Controller, Post, Get, Body, UseGuards, Request, HttpCode } from '@nestjs/common';
import { UserService } from './user.service';
import { LoginDto, UpdateUserDto } from './dto/login.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { TrackEventDto } from './dto/track-event.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { clientIpOf } from '../../common/client-ip';
import { UserDeletionService } from '../user-deletion/user-deletion.service';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly userDeletionService: UserDeletionService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const user = await this.userService.findById(req.user.id);
    return user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('update')
  @HttpCode(200)
  async update(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.userService.update(req.user.id, updateUserDto);
    return user;
  }

  /** 注销预览：只返回当前登录用户自己的删除范围，供小程序确认页展示 */
  @UseGuards(JwtAuthGuard)
  @Get('deletion-preview')
  async getDeletionPreview(@Request() req) {
    const plan = await this.userDeletionService.getPlan(req.user.id);
    return {
      confirmWord: plan.confirmWord,
      babies: plan.babies,
      counts: plan.counts,
      impact: plan.impact,
    };
  }

  /** 注销账号：只允许注销当前登录用户，确认词由服务端校验 */
  @UseGuards(JwtAuthGuard)
  @Post('delete')
  @HttpCode(200)
  async deleteAccount(@Request() req, @Body() dto: DeleteAccountDto) {
    const data = await this.userDeletionService.delete(
      req.user.id,
      'self-service',
      clientIpOf(req),
      dto.confirm,
      'delete_user_self',
    );
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Post('events')
  @HttpCode(200)
  async trackEvent(@Request() req, @Body() trackEventDto: TrackEventDto) {
    const data = await this.userService.trackEvent(
      req.user.id,
      trackEventDto.name,
      trackEventDto.properties,
    );
    return data;
  }
}
